// The second half of the per-row endgame's verification (recovery plan route 1).
// The probe proved a dispatcher handle exists and captured real MESSAGE_UPDATE
// shapes; the remaining unknown is MERGE SEMANTICS - does Discord's store handler
// merge a partial `message` payload into the existing record, or replace it and
// drop the omitted fields (embeds, attachments)? This experiment answers that with
// ONE guarded synthetic dispatch against ONE already-translated message: snapshot
// the store record before, dispatch {id, channel_id, content} with the record's own
// current content (a no-op by value), snapshot after, and write the comparison.
// Worst case is bounded: one message renders degraded until the channel reloads.
const {summarizeValueShape} = require("./second-debug-probe");

const EXPERIMENT_ACTION = "MESSAGE_UPDATE";
const DEFAULT_ATTEMPT_INTERVAL_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 24;
const DEFAULT_SETTLE_MS = 800;

function createMessageUpdateExperiment({
	resolveDispatcher = () => null,
	getSelectedChannelId = () => null,
	getStoreMessage = () => null,
	getGuildId = () => null,
	listCandidateMessages = null,
	listTranslatedCandidates = () => [],
	isViewTranslated = () => false,
	getMessageRenderCount = () => 0,
	getParentRenderCount = () => 0,
	getUiSnapshot = () => null,
	sink = null,
	log = () => {},
	now = Date.now,
	setTimeout: scheduleTimer = setTimeout,
	clearTimeout: cancelTimer = clearTimeout,
	attemptIntervalMs = DEFAULT_ATTEMPT_INTERVAL_MS,
	maxAttempts = DEFAULT_MAX_ATTEMPTS,
	settleMs = DEFAULT_SETTLE_MS
} = {}) {
	const evidence = {startedAt: null, attempts: 0, notes: []};
	let attemptTimer = null;
	let ran = false;

	function writeEvidence(reason) {
		if (!sink) return;
		try {sink(JSON.stringify(Object.assign({}, evidence, {finishedAt: now(), reason}), null, "\t"));}
		catch (error) {}
	}

	function snapshotRecord(record, messageId) {
		if (!record) return null;
		return {
			shape: summarizeValueShape(record, 2),
			contentLength: typeof record.content == "string" ? record.content.length : null,
			embedCount: Array.isArray(record.embeds) ? record.embeds.length : null,
			attachmentCount: Array.isArray(record.attachments) ? record.attachments.length : null,
			editedTimestamp: record.editedTimestamp != null ? String(record.editedTimestamp) : null,
			translatedViewAlive: !!isViewTranslated(messageId)
		};
	}

	function captureUiSnapshot(channelId, messageId) {
		try {return getUiSnapshot(channelId, messageId) || null;}
		catch (error) {return null;}
	}

	function getElementTextLength(element) {
		if (!element) return null;
		if (typeof element.value == "string") return element.value.length;
		return typeof element.textContent == "string" ? element.textContent.length : null;
	}

	function summarizeUiSnapshot(snapshot) {
		const composer = snapshot && snapshot.composerElement;
		const scroller = snapshot && snapshot.scrollerElement;
		const message = snapshot && snapshot.messageElement;
		return {
			composerPresent: !!composer,
			scrollerPresent: !!scroller,
			messagePresent: !!message,
			activeElementIsComposer: !!(composer && snapshot.activeElement === composer),
			composerTextLength: getElementTextLength(composer),
			composerSelectionStart: composer && typeof composer.selectionStart == "number" ? composer.selectionStart : null,
			composerSelectionEnd: composer && typeof composer.selectionEnd == "number" ? composer.selectionEnd : null,
			scrollTop: scroller && typeof scroller.scrollTop == "number" ? scroller.scrollTop : null,
			scrollHeight: scroller && typeof scroller.scrollHeight == "number" ? scroller.scrollHeight : null,
			clientHeight: scroller && typeof scroller.clientHeight == "number" ? scroller.clientHeight : null
		};
	}

	function uiBoundaryIsReady(snapshot) {
		return !!(snapshot && snapshot.composerElement && snapshot.scrollerElement && snapshot.messageElement);
	}

	function runOnce() {
		evidence.attempts++;
		const channelId = getSelectedChannelId();
		const allCandidates = (typeof listCandidateMessages == "function" ? listCandidateMessages() : listTranslatedCandidates()) || [];
		const inChannel = channelId ? allCandidates.filter(entry => entry && String(entry.channelId) === String(channelId)) : [];
		const withStoreRecord = inChannel.filter(entry => getStoreMessage(channelId, entry.messageId));
		let uiBefore = null;
		const candidate = withStoreRecord.find(entry => {
			const snapshot = captureUiSnapshot(channelId, entry.messageId);
			if (!uiBoundaryIsReady(snapshot)) return false;
			uiBefore = snapshot;
			return true;
		});
		// Overwritten every attempt: the first field round gave up with ZERO detail
		// about WHICH precondition failed (selected channel, candidates, store handle).
		evidence.lastDiagnostics = {at: now(), selectedChannelId: channelId ? String(channelId) : null, candidateTotal: allCandidates.length, candidatesInChannel: inChannel.length, withStoreRecord: withStoreRecord.length, withMountedUiBoundary: candidate ? 1 : 0};
		if (evidence.attempts > maxAttempts) {
			evidence.notes.push("gave up: no translated mounted row with a composer and scroller appeared in the selected channel");
			writeEvidence("no-candidate");
			return;
		}
		if (!candidate) {
			attemptTimer = scheduleTimer(runOnce, attemptIntervalMs);
			return;
		}
		let dispatcher = null;
		try {dispatcher = resolveDispatcher();}
		catch (error) {dispatcher = null;}
		if (!dispatcher || typeof dispatcher.dispatch != "function") {
			evidence.notes.push("no dispatcher with dispatch() at experiment time");
			writeEvidence("no-dispatcher");
			return;
		}
		ran = true;
		const messageId = String(candidate.messageId);
		const record = getStoreMessage(channelId, messageId);
		const renderCountBefore = (() => {try {return Number(getMessageRenderCount(messageId)) || 0;} catch (error) {return 0;}})();
		const parentRenderCountBefore = (() => {try {return Number(getParentRenderCount()) || 0;} catch (error) {return 0;}})();
		const beforeUiSummary = summarizeUiSnapshot(uiBefore);
		evidence.target = {messageId, channelId: String(channelId), source: candidate.source || "unknown"};
		evidence.before = snapshotRecord(record, messageId);
		evidence.beforeUi = beforeUiSummary;
		const guildId = (() => {try {return getGuildId(channelId) || undefined;} catch (error) {return undefined;}})();
		// The payload mirrors the probe-captured event exactly at the top level and
		// stays PARTIAL below it: same id, same channel, the record's own current
		// content. If the handler merges, nothing visible changes; if it replaces,
		// the after-snapshot shows which omitted fields were dropped.
		const payload = {
			type: EXPERIMENT_ACTION,
			guildId,
			message: {id: messageId, channel_id: String(channelId), guild_id: guildId, content: record && typeof record.content == "string" ? record.content : ""},
			__translatorSynthetic: true
		};
		evidence.payload = summarizeValueShape(payload, 3);
		log("[translator message-update experiment] dispatching one synthetic no-op update");
		try {dispatcher.dispatch(payload);}
		catch (error) {
			evidence.notes.push(`dispatch threw: ${error && error.message || error}`);
			writeEvidence("dispatch-threw");
			return;
		}
		scheduleTimer(() => {
			const after = getStoreMessage(channelId, messageId);
			const uiAfter = captureUiSnapshot(channelId, messageId);
			const afterUiSummary = summarizeUiSnapshot(uiAfter);
			const renderCountAfter = (() => {try {return Number(getMessageRenderCount(messageId)) || 0;} catch (error) {return 0;}})();
			const parentRenderCountAfter = (() => {try {return Number(getParentRenderCount()) || 0;} catch (error) {return 0;}})();
			evidence.after = snapshotRecord(after, messageId);
			evidence.afterUi = afterUiSummary;
			evidence.verdict = {
				recordSurvived: !!after,
				contentSame: !!(after && record) && after.content === record.content,
				embedsKept: !!(after && record) && (Array.isArray(record.embeds) ? record.embeds.length : 0) === (Array.isArray(after.embeds) ? after.embeds.length : 0),
				attachmentsKept: !!(after && record) && (Array.isArray(record.attachments) ? record.attachments.length : 0) === (Array.isArray(after.attachments) ? after.attachments.length : 0),
				translationStillShown: !!isViewTranslated(messageId),
				parentRenderDelta: parentRenderCountAfter - parentRenderCountBefore,
				messageRenderDelta: renderCountAfter - renderCountBefore,
				targetRowPreserved: !!(uiBefore && uiAfter && uiBefore.messageElement === uiAfter.messageElement),
				composerPreserved: !!(uiBefore && uiAfter && uiBefore.composerElement === uiAfter.composerElement),
				activeElementPreserved: !!(uiBefore && uiAfter && uiBefore.activeElement === uiAfter.activeElement),
				scrollerPreserved: !!(uiBefore && uiAfter && uiBefore.scrollerElement === uiAfter.scrollerElement),
				scrollTopSame: beforeUiSummary.scrollTop === afterUiSummary.scrollTop,
				composerTextLengthSame: beforeUiSummary.composerTextLength === afterUiSummary.composerTextLength,
				composerSelectionSame: beforeUiSummary.composerSelectionStart === afterUiSummary.composerSelectionStart && beforeUiSummary.composerSelectionEnd === afterUiSummary.composerSelectionEnd
			};
			writeEvidence("complete");
			log("[translator message-update experiment] complete - evidence written");
		}, settleMs);
	}

	return Object.freeze({
		start() {
			if (evidence.startedAt != null) return;
			evidence.startedAt = now();
			attemptTimer = scheduleTimer(runOnce, attemptIntervalMs);
		},
		stop() {
			if (attemptTimer != null && cancelTimer) cancelTimer(attemptTimer);
			attemptTimer = null;
			if (evidence.startedAt != null && !ran) writeEvidence("stopped-before-run");
		},
		hasRun: () => ran
	});
}

module.exports = {createMessageUpdateExperiment, EXPERIMENT_ACTION};
