function createHistoricalDisplayTracker({isStatusForChannel = () => false, getRevision = () => null, updateStatus = () => {}, getBatchNumber = () => null} = {}) {
	const batches = new Map();
	let batchSequence = 0;

	function normalizeId(value) {
		return value == null ? "" : String(value);
	}

	return Object.freeze({
		begin({channelId, batchKey = null, outcome = {}, displayed = 0, displayableIds = null, schedule = () => {}} = {}) {
			outcome = outcome || {};
			const key = normalizeId(channelId);
			if (!key) return 0;
			const ids = new Set([].concat(outcome.missingIds || [], outcome.retryIds || []).map(normalizeId).filter(Boolean));
			if (!ids.size) {
				batches.delete(key);
				return 0;
			}
			const displayable = new Set((Array.isArray(displayableIds) ? displayableIds : [...ids]).map(normalizeId));
			const identity = normalizeId(batchKey) || `${key}:display:${++batchSequence}`;
			const revisions = new Map([...ids].map(messageId => [messageId, getRevision(key, messageId)]));
			// The batch stamp is taken at begin(): a straggler report must name the batch
			// it belongs to, or its counters merge into whatever batch runs when it lands
			// (2026-08-19 audit: the 12/26 transients).
			batches.set(key, {identity, ids, displayable, revisions, displayed: Math.max(0, displayed || 0), batch: getBatchNumber()});
			for (const messageId of ids) schedule(messageId, identity);
			return ids.size;
		},
		handle({channelId, messageIds = [], trackingKeysByMessageId = {}, outcome = {}} = {}) {
			outcome = outcome || {};
			const key = normalizeId(channelId);
			const pending = batches.get(key);
			if (!pending) return false;
			const requestedIds = new Set([].concat(messageIds || []).map(normalizeId).filter(Boolean));
			const displayedIds = new Set([].concat(outcome.confirmedIds || [], outcome.deferredIds || []).map(normalizeId));
			const retryIds = new Set([].concat(outcome.retryIds || []).map(normalizeId));
			const terminalIds = new Set([].concat(outcome.exhaustedIds || [], outcome.rejectedIds || [], outcome.staleIds || []).map(normalizeId));
			let resolved = 0;
			let displayableResolved = 0;
			for (const messageId of requestedIds) {
				if (!pending.ids.has(messageId)) continue;
				const trackingKeys = [].concat(trackingKeysByMessageId && trackingKeysByMessageId[messageId] || []).map(normalizeId);
				if (!trackingKeys.includes(pending.identity)) continue;
				const revisionMatches = getRevision(key, messageId) === pending.revisions.get(messageId);
				const shown = revisionMatches && displayedIds.has(messageId);
				const terminal = terminalIds.has(messageId) || !revisionMatches || !retryIds.has(messageId);
				if (!shown && !terminal) continue;
				pending.ids.delete(messageId);
				resolved++;
				if (shown && pending.displayable.has(messageId)) displayableResolved++;
			}
			if (!resolved) return false;
			pending.displayed += displayableResolved;
			if (!pending.ids.size) batches.delete(key);
			if (!isStatusForChannel(key)) return false;
			const statusUpdate = {channelId: key, displayed: pending.displayed, displayPending: pending.ids.size};
			if (pending.batch != null) statusUpdate.batch = pending.batch;
			updateStatus(statusUpdate);
			return true;
		},
		clear() {
			batches.clear();
		}
	});
}

module.exports = {createHistoricalDisplayTracker};
