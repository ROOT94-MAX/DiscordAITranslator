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
	listTranslatedCandidates = () => [],
	isViewTranslated = () => false,
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

	function runOnce() {
		evidence.attempts++;
		const channelId = getSelectedChannelId();
		const allCandidates = listTranslatedCandidates() || [];
		const inChannel = channelId ? allCandidates.filter(entry => entry && String(entry.channelId) === String(channelId)) : [];
		const withStoreRecord = inChannel.filter(entry => getStoreMessage(channelId, entry.messageId));
		// Overwritten every attempt: the first field round gave up with ZERO detail
		// about WHICH precondition failed (selected channel, candidates, store handle).
		evidence.lastDiagnostics = {at: now(), selectedChannelId: channelId ? String(channelId) : null, translatedTotal: allCandidates.length, translatedInChannel: inChannel.length, withStoreRecord: withStoreRecord.length};
		if (evidence.attempts > maxAttempts) {
			evidence.notes.push("gave up: no translated message with a store record appeared in the selected channel");
			writeEvidence("no-candidate");
			return;
		}
		const candidate = withStoreRecord[0];
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
		evidence.target = {messageId, channelId: String(channelId)};
		evidence.before = snapshotRecord(record, messageId);
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
			evidence.after = snapshotRecord(after, messageId);
			evidence.verdict = {
				recordSurvived: !!after,
				contentSame: !!(after && record) && after.content === record.content,
				embedsKept: !!(after && record) && (Array.isArray(record.embeds) ? record.embeds.length : 0) === (Array.isArray(after.embeds) ? after.embeds.length : 0),
				attachmentsKept: !!(after && record) && (Array.isArray(record.attachments) ? record.attachments.length : 0) === (Array.isArray(after.attachments) ? after.attachments.length : 0),
				translationStillShown: !!isViewTranslated(messageId)
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
