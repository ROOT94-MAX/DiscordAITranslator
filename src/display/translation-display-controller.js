function createDisplayView(state) {
	if (!state) return null;
	const translated = state.status === "translated" && !!state.translation;
	const content = translated ? state.translation.content : state.source && state.source.content;
	return Object.freeze({
		messageId: state.messageId,
		channelId: state.channelId,
		revision: state.revision,
		status: state.status,
		content: String(content == null ? "" : content),
		translated,
		showWatermark: translated,
		showLoading: state.status === "pending" || state.status === "translating",
		reason: state.reason,
		renderStatus: state.renderStatus,
		renderReason: state.renderReason,
		translation: state.translation,
		restoredTranslation: state.restoredTranslation || null,
		source: state.source,
		origin: state.origin,
		generation: state.generation,
		sourceSignature: state.sourceSignature,
		requestIdentity: state.requestIdentity
	});
}

function createEmptyOutcome(additions) {
	return {
		confirmedIds: [],
		missingIds: [],
		fallbackUsed: false,
		...additions
	};
}

// The deferred-wave coalescer. Two producers use it: reply previews always (they are
// decoration, nothing pins them to the 200ms display contract, and painting one
// whole-layer rebuild per commit was the dominant unattributed rebuild lane in the
// field - repaint "other 69" vs "hist 8", 2026-08-19), and historical batch commits
// whenever the repaint gate is closed (a rebuild landing mid-scroll remounts the
// list at the bottom under the user's gesture - the stranded-at-newest report).
// Commits write the store immediately; only the paint waits, collected per channel
// and flushed as ONE tagged transaction per window once the gate is open.
const DEFERRED_REFRESH_DELAY_MS = 300;

function createTranslationDisplayController({
	store,
	renderAdapter,
	journal = null,
	// Wire BDFDB.TimeUtils.timeout here in production so a pending flush dies with
	// the plugin instance instead of repainting after a reload.
	setTimeout: scheduleTimer = setTimeout,
	canRepaintNow = () => true,
	deferredRefreshDelayMs = DEFERRED_REFRESH_DELAY_MS
}) {
	let transactionSequence = 0;
	const pendingRefreshByChannel = new Map();
	let deferredFlushTimer = null;

	function getPendingRefresh(channelId) {
		const key = String(channelId);
		if (!pendingRefreshByChannel.has(key)) pendingRefreshByChannel.set(key, {messageIds: new Set(), hostMessageIds: new Set()});
		return pendingRefreshByChannel.get(key);
	}

	function armDeferredFlush() {
		if (deferredFlushTimer != null) return;
		deferredFlushTimer = scheduleTimer(async () => {
			deferredFlushTimer = null;
			if (!canRepaintNow()) {
				// The wave stays pending; state is committed, only the paint waits.
				armDeferredFlush();
				return;
			}
			const pending = [...pendingRefreshByChannel.entries()];
			pendingRefreshByChannel.clear();
			for (const [channelId, wave] of pending) {
				// A record may have been restored or deleted while the wave waited;
				// stale ids simply drop out.
				const records = [...wave.messageIds].map(messageId => store.getDisplayState(messageId)).filter(Boolean);
				const sources = {};
				if (records.length) sources.historical = records.length;
				if (wave.hostMessageIds.size) sources.preview = wave.hostMessageIds.size;
				try {await refreshRecords(records, {channelId, ownerMessageIds: [...wave.hostMessageIds], sources});}
				catch (error) {}
			}
		}, deferredRefreshDelayMs);
	}

	function recordRenderTransition(view, transition) {
		if (!journal || !view) return;
		journal.append({channelId: view.channelId, messageId: view.messageId, revision: view.revision, transition});
	}

	async function refreshRecords(records, {channelId = null, ownerMessageIds = [], sources = null} = {}) {
		if (!records.length && !ownerMessageIds.length) return createEmptyOutcome();
		const views = records.map(record => createDisplayView(store.getDisplayState(record.messageId)));
		if (views.some(view => !view)) throw new Error("A display transaction requires one view per record");
		const channelIds = new Set(views.map(view => view.channelId));
		if (channelId != null) channelIds.add(String(channelId));
		if (channelIds.size !== 1) throw new Error("A display transaction cannot span channels");
		const transactionChannelId = channelIds.values().next().value;
		const requestedViews = new Map(views.map(view => [String(view.messageId), view]));
		for (const view of views) recordRenderTransition(view, "render-requested");
		const outcome = await renderAdapter.refreshMessages({
			transactionId: ++transactionSequence,
			channelId: transactionChannelId,
			messageIds: views.map(view => view.messageId),
			ownerMessageIds,
			views,
			// Which lanes asked for this paint (cadence audit 2026-08-19); the adapter
			// books its rebuild attribution from these counts.
			sources: sources || null
		});
		const rawOutcome = outcome || createEmptyOutcome();
		const staleIds = [];
		const staleIdSet = new Set();

		function filterCurrentIds(messageIds) {
			return (Array.isArray(messageIds) ? messageIds : []).filter(messageId => {
				const requestedView = requestedViews.get(String(messageId));
				if (!requestedView) return false;
				const current = store.getDisplayState(requestedView.messageId);
				if (current && current.revision === requestedView.revision) return true;
				if (!staleIdSet.has(requestedView.messageId)) {
					staleIdSet.add(requestedView.messageId);
					staleIds.push(requestedView.messageId);
				}
				return false;
			});
		}

		const confirmedIds = filterCurrentIds(rawOutcome.confirmedIds);
		const missingIds = filterCurrentIds(rawOutcome.missingIds);
		const deferredIds = filterCurrentIds(rawOutcome.deferredIds);
		const retryIds = filterCurrentIds(rawOutcome.retryIds);
		for (const messageId of confirmedIds) recordRenderTransition(requestedViews.get(String(messageId)), "render-confirmed");
		for (const messageId of missingIds) recordRenderTransition(requestedViews.get(String(messageId)), "render-unconfirmed");
		store.markRenderOutcome({confirmedIds, missingIds});
		const filteredOutcome = {
			...rawOutcome,
			confirmedIds,
			missingIds,
			fallbackUsed: rawOutcome.fallbackUsed === true
		};
		if (deferredIds.length) filteredOutcome.deferredIds = deferredIds;
		else delete filteredOutcome.deferredIds;
		if (retryIds.length) filteredOutcome.retryIds = retryIds;
		else delete filteredOutcome.retryIds;
		if (staleIds.length) filteredOutcome.staleIds = staleIds;
		return filteredOutcome;
	}

	return Object.freeze({
		getDisplayView(messageId) {
			return createDisplayView(store.getDisplayState(messageId));
		},
		async renderMessage(messageId) {
			const record = store.getDisplayState(messageId);
			return record ? refreshRecords([record]) : createEmptyOutcome();
		},
		async renderMessages(messageIds, meta = null) {
			const records = (Array.isArray(messageIds) ? messageIds : []).map(messageId => store.getDisplayState(messageId)).filter(Boolean);
			return refreshRecords(records, {sources: meta && meta.sources || null});
		},
		async refreshDisplayTransaction({channelId, messageIds = [], ownerMessageIds = []} = {}) {
			const uniqueMessageIds = [...new Set((Array.isArray(messageIds) ? messageIds : []).map(String))];
			const records = uniqueMessageIds.map(messageId => store.getDisplayState(messageId)).filter(Boolean);
			return refreshRecords(records, {channelId, ownerMessageIds: [...new Set((Array.isArray(ownerMessageIds) ? ownerMessageIds : []).map(String))]});
		},
		async deleteMessage(messageId, channelId, {refresh = true} = {}) {
			const ownerMessageIds = store.getPreviewHostMessageIds(channelId, [String(messageId)]);
			if (!store.deleteMessage(messageId, channelId)) return false;
			if (!refresh || !ownerMessageIds.length) return createEmptyOutcome({deleted: true});
			return refreshRecords([], {channelId, ownerMessageIds});
		},
		async markPending(request, {refresh = true} = {}) {
			const record = store.markPending(request);
			if (!record) return createEmptyOutcome({rejectedIds: [String(request.messageId)]});
			return refresh ? refreshRecords([record]) : createEmptyOutcome({deferredIds: [record.messageId]});
		},
		async commitMessageResult(result, {refresh = true} = {}) {
			const record = store.commitResult(result);
			if (!record) return createEmptyOutcome({rejectedIds: [String(result.messageId)]});
			return refresh ? refreshRecords([record]) : createEmptyOutcome({deferredIds: [record.messageId]});
		},
		async commitHistoricalBatch(results) {
			const channelIds = new Set(results.map(result => result && result.channelId != null ? String(result.channelId) : ""));
			if (channelIds.size === 1) for (const result of results) {
				const current = result && store.getDisplayState(result.messageId);
				if (result && result.source && (!current || !current.sourceSignature)) store.captureSource({messageId: result.messageId, channelId: result.channelId, generation: result.generation, sourceSignature: result.sourceSignature, source: result.source});
			}
			const outcome = store.commitBatch(results);
			if (!outcome.committed.length) {
				if (!outcome.rejected.length) return createEmptyOutcome();
				return createEmptyOutcome({rejectedIds: outcome.rejected.map(result => String(result.messageId))});
			}
			// A closed gate means the user is actively scrolling (or settings are
			// open): painting now would remount the list at the bottom under their
			// gesture. The commit is already stored; the paint joins the deferred wave.
			// The tracker never schedules deferredIds, so the wave owns this paint.
			if (!canRepaintNow()) {
				const wave = getPendingRefresh(outcome.committed[0].channelId);
				for (const record of outcome.committed) wave.messageIds.add(String(record.messageId));
				armDeferredFlush();
				const deferred = createEmptyOutcome({deferredIds: outcome.committed.map(record => String(record.messageId))});
				if (outcome.rejected.length) deferred.rejectedIds = outcome.rejected.map(result => String(result.messageId));
				return deferred;
			}
			// This refresh bypasses the scheduler, so it self-labels: the historical
			// lane is the biggest batch producer and must not read as unattributed.
			const refreshOutcome = await refreshRecords(outcome.committed, {sources: {historical: outcome.committed.length}});
			if (outcome.rejected.length) refreshOutcome.rejectedIds = outcome.rejected.map(result => String(result.messageId));
			return refreshOutcome;
		},
		async commitPreviewResult(result, {refresh = true} = {}) {
			const record = store.commitPreviewResult(result);
			if (!record) return createEmptyOutcome({rejectedIds: [String(result && result.messageId)]});
			if (!refresh) return createEmptyOutcome();
			const channelId = String(record.channelId || result.channelId);
			const ownerMessageIds = store.getPreviewHostMessageIds(channelId, [record.messageId]);
			if (!ownerMessageIds.length) return createEmptyOutcome();
			const wave = getPendingRefresh(channelId);
			for (const hostMessageId of ownerMessageIds) wave.hostMessageIds.add(String(hostMessageId));
			armDeferredFlush();
			return createEmptyOutcome({deferredIds: ownerMessageIds.map(String)});
		},
		async restoreMessage(messageId, {refresh = true} = {}) {
			const records = store.restoreMessage(messageId);
			if (!records.length) return createEmptyOutcome();
			return refresh ? refreshRecords(records) : createEmptyOutcome({deferredIds: records.map(record => record.messageId)});
		},
		async restoreChannel(channelId, {clearPreviews = false, clearSuppressions = false} = {}) {
			const previewHostMessageIds = clearPreviews ? store.getPreviewHostMessageIds(channelId) : [];
			const restored = store.restoreChannel(channelId);
			if (clearPreviews) store.clearPreviews(channelId);
			if (clearSuppressions) store.clearChannelSuppression(channelId);
			const messageIds = [...new Set(restored.map(record => record.messageId))];
			return refreshRecords(messageIds.map(messageId => store.getDisplayState(messageId)).filter(Boolean), {channelId, ownerMessageIds: previewHostMessageIds});
		},
		async restoreAll({refresh = true} = {}) {
			const records = store.restoreAll();
			if (!refresh) return records;
			if (!records.length) return createEmptyOutcome();
			const byChannel = new Map();
			for (const record of records) {
				if (!byChannel.has(record.channelId)) byChannel.set(record.channelId, []);
				byChannel.get(record.channelId).push(record);
			}
			return Promise.all([...byChannel.values()].map(refreshRecords));
		}
	});
}

module.exports = {createDisplayView, createTranslationDisplayController};
