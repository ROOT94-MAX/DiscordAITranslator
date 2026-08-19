// Owns the loaded-auto-translate status HUD state: the status record the floating
// capsule renders, its hide timer, and the per-channel seen-message map. Those three
// vars used to sit in the plugin factory closure where any of the surrounding 9000
// lines could write them.
//
// The store also renders the capsule text, because the text is a pure function of the
// record and keeping it next to the record is what makes the phase reporting below
// possible. Everything else - the DOM element, positioning, and the decision whether
// the capsule may be shown at all - stays in the runtime.
//
// A store instance is per plugin instance, so a plugin restart drops all of it.

// How long a phase may run without any counter moving before the capsule calls it
// stuck. During a real incident the capsule read "第 1 批 0/21，显示 0" for minutes
// and nothing in the text distinguished a slow provider from a dead job.
const LOADED_STATUS_STALLED_AFTER_MS = 45000;
const LOADED_STATUS_PREVIEW_MAX_LENGTH = 24;
const LOADED_STATUS_COMPLETION_HIDE_MS = 3000;
const LOADED_STATUS_REFRESH_MS = 1000;

const LOADED_STATUS_PHASES = Object.freeze(["collecting", "requesting", "repairing", "committing", "done", "failed"]);
const LOADED_STATUS_PHASE_SET = new Set(LOADED_STATUS_PHASES);
// A terminal phase is already spelled out by the counters in the base text, so it
// never gets a phase suffix; only a running phase needs a working/stuck signal.
const LOADED_STATUS_TERMINAL_PHASES = new Set(["done", "failed"]);

// Maps the historical translation job state machine onto capsule phases. A cancelled
// job maps to no phase: its record is not visible, so it has nothing to report.
const LOADED_STATUS_PHASE_BY_JOB_STATE = Object.freeze({
	collecting: "collecting",
	translating: "requesting",
	repairing: "repairing",
	ready: "committing",
	committed: "done",
	cancelled: null
});

// Counters whose movement proves the job is still doing work. retryable/aiDropped are
// excluded: they mirror snapshot bookkeeping rather than forward progress.
const LOADED_STATUS_PROGRESS_FIELDS = Object.freeze(["total", "processed", "displayed", "displayPending", "skipped", "failed"]);

function createEmptyStatus() {
	return {
		active: false,
		collecting: false,
		done: false,
		channelId: null,
		total: 0,
		processed: 0,
		batch: 0,
		displayed: 0,
		displayPending: 0,
		skipped: 0,
		failed: 0,
		retryable: 0,
		aiDropped: 0,
		lastSkipReason: "",
		lastSkipPreview: "",
		phase: null,
		phaseStartedAt: 0,
		progressAt: 0
	};
}

function normalizeChannelId(channelId) {
	return channelId == null ? "" : String(channelId);
}

function formatSeconds(ms) {
	// Floor, never round: an elapsed time must not read longer than it is.
	return `${Math.max(0, Math.floor((ms || 0) / 1000))}s`;
}

function getPhaseLabel(phase, chinese) {
	switch (phase) {
		case "collecting": return chinese ? "收集中" : "collecting";
		case "requesting": return chinese ? "请求中" : "requesting";
		case "repairing": return chinese ? "修复中" : "repairing";
		case "committing": return chinese ? "提交中" : "committing";
		case "done": return chinese ? "已完成" : "done";
		case "failed": return chinese ? "已失败" : "failed";
		default: return "";
	}
}

function hasCounterMoved(previous, next) {
	return LOADED_STATUS_PROGRESS_FIELDS.some(field => (previous[field] || 0) !== (next[field] || 0));
}

// The suffix appended to a running capsule. Records written before phases existed - or
// handed in by a caller that builds its own status object - carry no phase and render
// exactly as they always did.
function renderPhaseSegment(status, chinese, currentTime, stalledAfterMs) {
	const phase = status && status.phase;
	if (!phase || LOADED_STATUS_TERMINAL_PHASES.has(phase)) return "";
	const label = getPhaseLabel(phase, chinese);
	if (!label) return "";
	const progressAt = status.progressAt || status.phaseStartedAt || 0;
	const sinceProgressMs = progressAt ? Math.max(0, currentTime - progressAt) : 0;
	if (progressAt && sinceProgressMs >= stalledAfterMs) {
		return chinese ? `，${label} ${formatSeconds(sinceProgressMs)} 无进展` : `, ${label} ${formatSeconds(sinceProgressMs)} no progress`;
	}
	const phaseStartedAt = status.phaseStartedAt || 0;
	if (!phaseStartedAt) return chinese ? `，${label}` : `, ${label}`;
	return chinese ? `，${label} ${formatSeconds(currentTime - phaseStartedAt)}` : `, ${label} ${formatSeconds(currentTime - phaseStartedAt)}`;
}

// Keep the full localized wording for the hover title. The visible capsule uses the
// language-neutral numeric renderer above, so long translations never widen the HUD.
function getStatusCounters(status) {
	const total = Math.max(0, status && status.total || 0);
	const processed = Math.max(0, Math.min(total || 0, status && status.processed || 0));
	const displayed = Math.max(0, Math.min(total || 0, status && status.displayed || 0));
	const displayPending = Math.max(0, Math.min(total || 0, status && status.displayPending || 0));
	const skipped = Math.max(0, Math.min(total || 0, status && status.skipped || 0));
	const failedValue = status && status.failed != null ? status.failed : status && status.aiDropped;
	const failed = Math.max(0, failedValue || 0);
	const retryable = Math.max(0, status && status.retryable || 0);
	const batch = Math.max(1, status && status.batch || 1);
	// The session total counts every batch of the channel session; a status built
	// by hand (legacy call sites, overrides) has no session field and falls back to
	// the batch's own displayed count, which renders exactly as before. A REAL status
	// always carries the field, and it must never be masked by the batch counter:
	// that mask is what made the numerator collapse to the batch value at every
	// batch boundary (2026-08-19 audit).
	const sessionDisplayed = status && status.sessionDisplayed != null ? Math.max(0, status.sessionDisplayed) : displayed;
	return {total, processed, displayed, displayPending, skipped, failed, retryable, batch, sessionDisplayed};
}

function renderCompactStatusText(status, currentTime) {
	const {total, processed, displayed, displayPending, skipped, failed, retryable, sessionDisplayed} = getStatusCounters(status);
	// Failure and repair keep the session-cumulative numerator (field 2026-08-19:
	// 113/152 snapping to a per-batch 26/39·1! read as an old version resurfacing).
	// max() bridges hand-built legacy statuses, whose session count falls back to the
	// batch's own numbers; recoverable failures join the denominator as the work a
	// retry could still display.
	const repairReady = Math.max(sessionDisplayed, displayed, total - skipped - (retryable || failed));
	if (status && status.phase === "repairing") return `${repairReady}/${repairReady + (retryable || failed)}${retryable || failed ? ` · ${retryable || failed}↻` : ""}`;
	if (status && (status.phase === "failed" || status.done && (failed || retryable))) {
		const shown = Math.max(sessionDisplayed, displayed);
		return `${shown}/${shown + retryable} · ${failed || retryable}!`;
	}
	if (status && status.done && displayPending) return `${displayed}/${total} · ${displayPending}↻`;
	// One cumulative channel ratio (user-specified 2026-08-19): displayed-so-far over
	// displayed-so-far plus the running batch's remaining work. 13/13, scroll queues
	// 20 more: 13/33 climbing to 33/33. For a plain single batch this degenerates to
	// the classic displayed/total reading. A workless finish stays a checkmark and
	// zero-over-total is reserved for the failure branches above.
	if (status && status.done) return sessionDisplayed > 0 ? `${sessionDisplayed}/${sessionDisplayed}` : "✓";
	// The denominator only promises work that can still display: items already
	// resolved as skipped or failed leave it immediately, so completion never reads
	// as messages going missing (2026-08-19: 86/123 snapping to 106/106).
	const cumulativeRatio = `${sessionDisplayed}/${sessionDisplayed + Math.max(0, total - displayed - skipped - failed)}`;
	const phaseStartedAt = status && status.phaseStartedAt || 0;
	return phaseStartedAt ? `${cumulativeRatio} · ${formatSeconds(currentTime - phaseStartedAt)}` : cumulativeRatio;
}

function renderStatusDetailText(status, chinese, phaseSegment) {
	const {total, processed, displayed, displayPending, skipped, failed, retryable, batch, sessionDisplayed} = getStatusCounters(status);
	const extraText = `${displayPending ? (chinese ? `，待显示 ${displayPending}` : `, ${displayPending} awaiting display`) : ""}${skipped ? (chinese ? `，跳过 ${skipped}` : `, skipped ${skipped}`) : ""}${failed ? (chinese ? `，失败 ${failed}` : `, failed ${failed}`) : ""}${retryable && retryable != failed ? (chinese ? `，待重试 ${retryable}` : `, retry pending ${retryable}`) : ""}`;
	if (status && status.done) {
		if (!total) return failed || retryable ? (chinese ? `已加载翻译：失败 ${failed}，待重试 ${retryable}` : `Loaded translation: ${failed} failed, ${retryable} retry pending`) : (chinese ? "已加载翻译：开启，暂无待翻译" : "Loaded translation: on, no pending messages");
		const sessionText = sessionDisplayed > displayed ? (chinese ? `，本次累计 ${sessionDisplayed}` : `, session total ${sessionDisplayed}`) : "";
		return chinese ? `已加载翻译：第 ${batch} 批完成，显示 ${displayed}/${total}${extraText}${sessionText}` : `Loaded translation: batch ${batch} done, shown ${displayed}/${total}${extraText}${sessionText}`;
	}
	const runningSessionText = sessionDisplayed > displayed ? (chinese ? `，本次累计 ${sessionDisplayed}` : `, session total ${sessionDisplayed}`) : "";
	if (status && status.collecting) return chinese ? `收集已加载：第 ${batch} 批 ${processed}/${total}${extraText}${runningSessionText}${phaseSegment}` : `Collecting loaded: batch ${batch} ${processed}/${total}${extraText}${runningSessionText}${phaseSegment}`;
	// Nothing is in flight here, so a growing timer would only look alarming.
	if (!total) return chinese ? "已加载翻译：开启，等待消息" : "Loaded translation: on, waiting";
	return chinese ? `翻译已加载：第 ${batch} 批 ${processed}/${total}，显示 ${displayed}${extraText}${runningSessionText}${phaseSegment}` : `Translating loaded: batch ${batch} ${processed}/${total}, shown ${displayed}${extraText}${runningSessionText}${phaseSegment}`;
}

function createLoadedTranslationStatusStore({
	now = Date.now,
	setTimeout: scheduleTimer = null,
	clearTimeout: cancelTimer = null,
	isChineseUiLanguage = () => false,
	stalledAfterMs = LOADED_STATUS_STALLED_AFTER_MS,
	requestFrame = callback => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : globalThis.setTimeout(callback, 16),
	cancelFrame = handle => typeof cancelAnimationFrame == "function" ? cancelAnimationFrame(handle) : globalThis.clearTimeout(handle)
} = {}) {
	const startTimer = scheduleTimer || ((callback, delay) => globalThis.setTimeout(callback, delay));
	const stopTimer = cancelTimer || (handle => globalThis.clearTimeout(handle));
	let positionFrame = null;

	let status = createEmptyStatus();
	let hideTimer = null;
	let refreshTimer = null;
	let seenMessages = {};
	let sealedTotal = null;
	let sealedJobKey = "";
	// The session total is a per-channel set of message ids whose translation was
	// displayed (confirmed on screen or stored for mount). Counting unique ids is
	// what makes the total immune to double counting and to late batch reports
	// bleeding across batch boundaries (2026-08-19 report).
	let sessionDisplayedIds = new Map();

	function getSessionDisplayedCount(channelId) {
		const channelSet = sessionDisplayedIds.get(normalizeChannelId(channelId));
		return channelSet ? channelSet.size : 0;
	}

	// An explicit, known phase always wins. Anything else is derived from the flags the
	// call site already sets, so a caller that has no opinion still gets a truthful
	// phase instead of a stale one.
	function resolvePhase(previous, next, updates) {
		if (updates && typeof updates.phase == "string" && LOADED_STATUS_PHASE_SET.has(updates.phase)) return updates.phase;
		if (next.done) return "done";
		if (next.collecting) return "collecting";
		if (!next.active) return null;
		const carried = previous.phase;
		// Collecting cannot carry forward once the collecting flag drops; the job has
		// moved on to the provider round trip.
		if (!carried || carried === "collecting" || LOADED_STATUS_TERMINAL_PHASES.has(carried)) return "requesting";
		return carried;
	}

	function readStatus(statusOverride) {
		return statusOverride === undefined ? status : statusOverride;
	}

	return Object.freeze({
		getStatus() {
			// A copy, so a reader cannot quietly mutate the record the capsule renders.
			return Object.assign({}, status);
		},
		getChannelId() {
			return status.channelId;
		},
		isForChannel(channelId) {
			return normalizeChannelId(status.channelId) === normalizeChannelId(channelId);
		},
		isActive() {
			return !!status.active;
		},
		isDone() {
			return !!status.done;
		},
		// The batch label shown for the batch already running.
		getCurrentBatchNumber() {
			return status.batch || 1;
		},
		// Without a channel the counter simply advances. With one it restarts at 1 when
		// the status belongs to a different channel, so a channel switch never inherits
		// another channel's batch number.
		getNextBatchNumber(channelId = null) {
			if (channelId == null) return (status.batch || 0) + 1;
			return (this.isForChannel(channelId) ? status.batch || 0 : 0) + 1;
		},
		getPhaseForJobState(jobState) {
			return LOADED_STATUS_PHASE_BY_JOB_STATE[jobState] || null;
		},
		update(updates = {}) {
			// A report stamped with an EARLIER batch of the same channel is a straggler
			// from a finished job; merging it would paint another batch's counters onto
			// the running one (2026-08-19 audit). It is dropped before any state moves -
			// after the seal/jobKey logic it would already have mutated the totals.
			if (updates && updates.batch != null && normalizeChannelId(updates.channelId != null ? updates.channelId : status.channelId) === normalizeChannelId(status.channelId) && Math.max(0, updates.batch) < Math.max(0, status.batch || 0)) return this.getStatus();
			const previous = status;
			const next = Object.assign({}, previous, updates);
			const nextJobKey = `${normalizeChannelId(next.channelId)}:${Math.max(0, next.batch || 0)}`;
			if (nextJobKey !== sealedJobKey) {
				sealedJobKey = nextJobKey;
				sealedTotal = null;
				// Pending paints belong to one completed batch. A new batch must never
				// inherit the previous batch's unresolved-row counter through merge semantics.
				if (!Object.prototype.hasOwnProperty.call(updates, "displayPending")) next.displayPending = 0;
			}
			next.sessionDisplayed = getSessionDisplayedCount(next.channelId);
			next.phase = resolvePhase(previous, next, updates);
			if (sealedTotal === null && !next.collecting && (next.active || next.done) && next.total > 0) sealedTotal = Math.max(0, next.total || 0);
			if (sealedTotal !== null && !next.collecting) next.total = sealedTotal;
			// The stall clock restarts on a phase change or on any counter moving,
			// because either one proves the job is still doing work. phaseStartedAt
			// answers "how long in this phase", progressAt answers "how long stuck".
			if (next.phase !== previous.phase) {
				next.phaseStartedAt = now();
				next.progressAt = next.phaseStartedAt;
			}
			else {
				next.phaseStartedAt = previous.phaseStartedAt;
				next.progressAt = hasCounterMoved(previous, next) ? now() : previous.progressAt;
			}
			status = next;
			return this.getStatus();
		},
		// Every display transaction reports the ids it confirmed on screen or stored
		// for mount; live and historical paints share this one entry point.
		recordSessionDisplayed(channelId, messageIds = []) {
			const key = normalizeChannelId(channelId);
			if (!key || !messageIds.length) return this.getStatus();
			if (!sessionDisplayedIds.has(key)) sessionDisplayedIds.set(key, new Set());
			const channelSet = sessionDisplayedIds.get(key);
			for (const messageId of messageIds) if (messageId != null) channelSet.add(String(messageId));
			if (normalizeChannelId(status.channelId) === key) status = Object.assign({}, status, {sessionDisplayed: channelSet.size});
			return this.getStatus();
		},
		// clear() resets the visible status but keeps the per-channel session ids:
		// batch restarts and channel re-entry must not zero the user's running total
		// (2026-08-19 decision). Only the global tracking reset drops the ids.
		clear() {
			this.cancelTimers();
			status = createEmptyStatus();
			sealedTotal = null;
			sealedJobKey = "";
			return this.getStatus();
		},
		// Reports whether the phase is progressing, so a caller can log or diagnose
		// without parsing the rendered text.
		getPhaseSnapshot(statusOverride) {
			const target = readStatus(statusOverride);
			const phase = target && target.phase || null;
			const currentTime = now();
			const phaseStartedAt = target && target.phaseStartedAt || 0;
			const progressAt = target && target.progressAt || phaseStartedAt;
			const terminal = LOADED_STATUS_TERMINAL_PHASES.has(phase);
			const sinceProgressMs = progressAt ? Math.max(0, currentTime - progressAt) : 0;
			const stalled = !!phase && !terminal && !!progressAt && sinceProgressMs >= stalledAfterMs;
			return {
				phase,
				label: getPhaseLabel(phase, !!isChineseUiLanguage()),
				phaseStartedAt,
				phaseElapsedMs: phaseStartedAt ? Math.max(0, currentTime - phaseStartedAt) : 0,
				progressAt,
				sinceProgressMs,
				stalled,
				working: !!phase && !terminal && !stalled
			};
		},
		getStatusText(statusOverride) {
			const target = readStatus(statusOverride);
			return renderCompactStatusText(target, now());
		},
		getStatusDetailText(statusOverride) {
			const target = readStatus(statusOverride);
			const chinese = !!isChineseUiLanguage();
			return renderStatusDetailText(target, chinese, renderPhaseSegment(target, chinese, now(), stalledAfterMs));
		},
		getPreviewText(text) {
			text = (text || "").replace(/\s+/g, " ").trim();
			if (!text) return "";
			return text.length > LOADED_STATUS_PREVIEW_MAX_LENGTH ? `${text.slice(0, LOADED_STATUS_PREVIEW_MAX_LENGTH)}...` : text;
		},
		// The inline variant falls back to a generic sentence whenever the record belongs
		// to another channel, so a channel switch never shows the previous channel's counts.
		getInlineStatusText(selectedChannelId) {
			const statusChannelId = status.channelId;
			const matchesChannel = !statusChannelId || statusChannelId == "__global" || normalizeChannelId(statusChannelId) === normalizeChannelId(selectedChannelId);
			if ((status.active || status.done) && matchesChannel) return this.getStatusText(status);
			return isChineseUiLanguage() ? "已加载消息自动翻译已开启，等待当前批次…" : "Loaded-message auto-translate is on; waiting for the current batch…";
		},
		hasPendingHide() {
			return hideTimer !== null;
		},
		cancelHide() {
			if (hideTimer !== null) stopTimer(hideTimer);
			hideTimer = null;
		},
		// The handle is cleared before the callback runs, so the callback may schedule
		// another hide without cancelling itself.
		scheduleHide(delay, onHide) {
			this.cancelHide();
			hideTimer = startTimer(() => {
				hideTimer = null;
				if (typeof onHide == "function") onHide();
			}, delay);
			return hideTimer;
		},
		hasPendingRefresh() {
			return refreshTimer !== null;
		},
		cancelRefresh() {
			if (refreshTimer !== null) stopTimer(refreshTimer);
			refreshTimer = null;
		},
		cancelTimers() {
			this.cancelHide();
			this.cancelRefresh();
		},
		scheduleRefresh(delay, onRefresh) {
			this.cancelRefresh();
			refreshTimer = startTimer(() => {
				refreshTimer = null;
				if (typeof onRefresh == "function") onRefresh();
			}, delay);
			return refreshTimer;
		},
		getSeenCount(channelId) {
			const key = normalizeChannelId(channelId);
			const seen = key && seenMessages[key];
			return seen ? Object.keys(seen).length : 0;
		},
		// Returns whether this message had already been seen in this channel session,
		// which is what the boundary dedup decides on.
		markMessageSeen(channelId, messageId) {
			const key = normalizeChannelId(channelId);
			const messageKey = normalizeChannelId(messageId);
			if (!key || !messageKey) return false;
			if (!seenMessages[key]) seenMessages[key] = {};
			const wasSeen = !!seenMessages[key][messageKey];
			seenMessages[key][messageKey] = true;
			return wasSeen;
		},
		// The banner is repositioned after every status change, and a historical batch
		// changes the status once per message. Repositioning reads getBoundingClientRect,
		// which forces a synchronous layout, so the callers used to pay for two of those
		// per message - one immediate, one in an undeduped animation frame. One frame is
		// enough, and coalescing means a burst of N updates costs one layout, not 2N.
		schedulePosition(callback) {
			if (typeof callback != "function") return false;
			if (positionFrame !== null) return false;
			positionFrame = requestFrame(() => {
				positionFrame = null;
				callback();
			});
			return true;
		},
		cancelScheduledPosition() {
			if (positionFrame === null) return;
			cancelFrame(positionFrame);
			positionFrame = null;
		},
		// The seen map only serves boundary dedup inside the active channel session;
		// keeping it for left channels grows memory for the whole Discord session.
		resetSeen(channelId = null) {
			const key = normalizeChannelId(channelId);
			if (!key) {
				seenMessages = {};
				// Only the global reset (plugin stop, full queue clear) drops the
				// session totals; a per-channel reset is a batch-window event and the
				// user's running total must survive it (2026-08-19 decision).
				sessionDisplayedIds = new Map();
				return;
			}
			delete seenMessages[key];
		}
	});
}

module.exports = {
	LOADED_STATUS_COMPLETION_HIDE_MS,
	LOADED_STATUS_REFRESH_MS,
	LOADED_STATUS_STALLED_AFTER_MS,
	LOADED_STATUS_PREVIEW_MAX_LENGTH,
	LOADED_STATUS_PHASES,
	LOADED_STATUS_PHASE_BY_JOB_STATE,
	createLoadedTranslationStatusStore
};
