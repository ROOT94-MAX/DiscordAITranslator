const test = require("node:test");
const assert = require("node:assert/strict");
const {
	LOADED_STATUS_STALLED_AFTER_MS,
	LOADED_STATUS_PHASES,
	LOADED_STATUS_PHASE_BY_JOB_STATE,
	createLoadedTranslationStatusStore
} = require("../src/status/loaded-translation-status-store");

function createHarness({chinese = false, startTime = 1000} = {}) {
	let clock = startTime;
	let uiIsChinese = chinese;
	const timers = new Map();
	let timerSequence = 0;
	const store = createLoadedTranslationStatusStore({
		now: () => clock,
		setTimeout: (callback, delay) => {
			const handle = ++timerSequence;
			timers.set(handle, {callback, delay});
			return handle;
		},
		clearTimeout: handle => {
			timers.delete(handle);
		},
		isChineseUiLanguage: () => uiIsChinese
	});
	return {
		store,
		timers,
		advance(ms) {
			clock += ms;
		},
		setChinese(value) {
			uiIsChinese = value;
		},
		runTimer(handle) {
			const timer = timers.get(handle);
			timers.delete(handle);
			timer.callback();
		}
	};
}

// A status object built by hand, exactly as legacy call sites and older tests do it:
// no phase, no timestamps.
function legacyStatus(fields) {
	return Object.assign({active: false, collecting: false, done: false, channelId: "c1", total: 0, processed: 0, batch: 0, displayed: 0, skipped: 0, failed: 0, retryable: 0, aiDropped: 0}, fields);
}

test("the primary capsule stays compact across requesting, repair, completion and failure", () => {
	const harness = createHarness({chinese: true, startTime: 1000});
	// Displays commit before the status counts them, so the session ids exist first.
	harness.store.recordSessionDisplayed("c1", ids("m", 20));
	harness.store.update({active: true, collecting: false, channelId: "c1", batch: 1, total: 50, processed: 20, displayed: 20, phase: "requesting"});
	harness.advance(8000);

	assert.equal(harness.store.getStatusText(), "20/50 · 8s");
	harness.setChinese(false);
	assert.equal(harness.store.getStatusText(), "20/50 · 8s", "the primary line does not grow with the UI language");
	assert.equal(harness.store.getStatusText(legacyStatus({active: true, total: 50, processed: 50, displayed: 48, failed: 2, retryable: 2, phase: "repairing"})), "48/50 · 2↻");
	assert.equal(harness.store.getStatusText(legacyStatus({active: true, total: 50, processed: 50, displayed: 0, failed: 2, retryable: 2, phase: "repairing"})), "48/50 · 2↻", "atomic paint does not hide how many results are already ready");
	assert.equal(harness.store.getStatusText(legacyStatus({done: true, total: 50, processed: 50, displayed: 50, phase: "done"})), "50/50", "a finished single batch reads as the classic closed ratio");
	assert.equal(harness.store.getStatusText(legacyStatus({done: true, total: 50, processed: 50, displayed: 48, failed: 2, retryable: 2, phase: "failed"})), "48/50 · 2!");
});

test("a completed provider batch keeps mounted-but-unpainted rows visible as display pending", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({active: false, done: true, channelId: "c1", batch: 1, total: 50, processed: 50, displayed: 43, displayPending: 7});

	assert.equal(harness.store.getStatus().displayPending, 7);
	assert.equal(harness.store.getStatusText(), "43/50 · 7↻");
	assert.equal(harness.store.getStatusDetailText(), "已加载翻译：第 1 批完成，显示 43/50，待显示 7");
	harness.setChinese(false);
	assert.equal(harness.store.getStatusDetailText(), "Loaded translation: batch 1 done, shown 43/50, 7 awaiting display");
});

test("starting a new batch resets display-pending state even when the caller omits the field", () => {
	const {store} = createHarness();
	store.update({active: false, done: true, channelId: "c1", batch: 1, total: 5, processed: 5, displayed: 4, displayPending: 1});
	store.update({active: true, collecting: true, done: false, channelId: "c1", batch: 2, total: 0, processed: 0, displayed: 0});

	assert.equal(store.getStatus().displayPending, 0);
});

test("the configured total seals at handoff and final display keeps the exact ready count", () => {
	const {store} = createHarness();
	store.update({active: true, collecting: true, channelId: "c1", batch: 1, total: 20, processed: 0});
	store.update({total: 50});
	store.update({collecting: false, total: 50, processed: 0, phase: "requesting"});
	store.recordSessionDisplayed("c1", ids("m", 20));
	store.update({total: 20, processed: 20, displayed: 20});

	assert.equal(store.getStatus().total, 50, "a mounted-window update cannot shrink the sealed configured batch");
	store.recordSessionDisplayed("c1", ids("m", 30, 21));
	store.update({active: false, done: true, total: 20, processed: 20, displayed: 50, phase: "done"});
	assert.equal(store.getStatus().total, 50);
	assert.equal(store.getStatusText(), "50/50", "confirmed and virtualized-ready results share the exact final count");

	store.update({active: true, collecting: true, done: false, channelId: "c1", batch: 2, total: 10, processed: 0, displayed: 0});
	assert.equal(store.getStatus().total, 10, "a new batch owns a new total");
});

test("the Chinese hover detail preserves every diagnostic branch", () => {
	const {store} = createHarness({chinese: true});

	assert.equal(store.getStatusDetailText(legacyStatus({done: true})), "已加载翻译：开启，暂无待翻译");
	assert.equal(store.getStatusDetailText(legacyStatus({done: true, failed: 2, retryable: 3})), "已加载翻译：失败 2，待重试 3");
	assert.equal(store.getStatusDetailText(legacyStatus({done: true, batch: 2, total: 10, displayed: 7})), "已加载翻译：第 2 批完成，显示 7/10");
	assert.equal(store.getStatusDetailText(legacyStatus({active: true, collecting: true, batch: 1, total: 21, processed: 0})), "收集已加载：第 1 批 0/21");
	assert.equal(store.getStatusDetailText(legacyStatus({active: true})), "已加载翻译：开启，等待消息");
	assert.equal(store.getStatusDetailText(legacyStatus({active: true, batch: 1, total: 21, processed: 4, displayed: 3})), "翻译已加载：第 1 批 4/21，显示 3");
});

test("the English hover detail preserves every diagnostic branch", () => {
	const {store} = createHarness({chinese: false});

	assert.equal(store.getStatusDetailText(legacyStatus({done: true})), "Loaded translation: on, no pending messages");
	assert.equal(store.getStatusDetailText(legacyStatus({done: true, failed: 2, retryable: 3})), "Loaded translation: 2 failed, 3 retry pending");
	assert.equal(store.getStatusDetailText(legacyStatus({done: true, batch: 2, total: 10, displayed: 7})), "Loaded translation: batch 2 done, shown 7/10");
	assert.equal(store.getStatusDetailText(legacyStatus({active: true, collecting: true, batch: 1, total: 21, processed: 0})), "Collecting loaded: batch 1 0/21");
	assert.equal(store.getStatusDetailText(legacyStatus({active: true})), "Loaded translation: on, waiting");
	assert.equal(store.getStatusDetailText(legacyStatus({active: true, batch: 1, total: 21, processed: 4, displayed: 3})), "Translating loaded: batch 1 4/21, shown 3");
});

test("the skipped/failed/retry suffixes keep their wording in both languages", () => {
	const harness = createHarness({chinese: true});
	const status = legacyStatus({done: true, batch: 1, total: 10, displayed: 4, skipped: 3, failed: 2, retryable: 5});

	assert.equal(harness.store.getStatusDetailText(status), "已加载翻译：第 1 批完成，显示 4/10，跳过 3，失败 2，待重试 5");
	harness.setChinese(false);
	assert.equal(harness.store.getStatusDetailText(status), "Loaded translation: batch 1 done, shown 4/10, skipped 3, failed 2, retry pending 5");
});

test("a retry count equal to the failed count is not repeated", () => {
	const {store} = createHarness({chinese: false});
	const status = legacyStatus({done: true, batch: 1, total: 4, displayed: 3, failed: 1, retryable: 1});

	// The historical-job suite depends on this: a fully retryable batch says "retry"
	// once and never doubles the failure count.
	assert.equal(store.getStatusDetailText(status), "Loaded translation: batch 1 done, shown 3/4, failed 1");
});

test("counters are clamped and the failure count falls back to the AI-dropped count", () => {
	const {store} = createHarness({chinese: false});

	// Processed/displayed/skipped can never exceed the total the capsule shows.
	assert.equal(store.getStatusDetailText(legacyStatus({active: true, total: 5, processed: 99, displayed: 99})), "Translating loaded: batch 1 5/5, shown 5");
	// Negative values are floored at zero rather than rendered.
	assert.equal(store.getStatusDetailText(legacyStatus({active: true, total: 5, processed: -3, displayed: -3})), "Translating loaded: batch 1 0/5, shown 0");
	// A record written before `failed` existed only carries aiDropped.
	const droppedOnly = legacyStatus({done: true, total: 4, displayed: 2, aiDropped: 2});
	delete droppedOnly.failed;
	assert.equal(store.getStatusDetailText(droppedOnly), "Loaded translation: batch 1 done, shown 2/4, failed 2");
});

test("a status without a phase renders exactly as it did before phases existed", () => {
	const harness = createHarness({chinese: true});
	harness.advance(10 * 60 * 1000);

	// No phase means no timestamps, so no elapsed time and no stall marker may appear
	// no matter how long the clock has run.
	assert.equal(harness.store.getStatusDetailText(legacyStatus({active: true, batch: 1, total: 21, processed: 0, displayed: 0})), "翻译已加载：第 1 批 0/21，显示 0");
});

test("a running phase reports how long it has been working", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({active: true, collecting: false, channelId: "c1", batch: 1, total: 21, processed: 0, displayed: 0, phase: "requesting"});
	harness.advance(12000);

	assert.equal(harness.store.getStatusDetailText(), "翻译已加载：第 1 批 0/21，显示 0，请求中 12s");
	harness.setChinese(false);
	assert.equal(harness.store.getStatusDetailText(), "Translating loaded: batch 1 0/21, shown 0, requesting 12s");
});

test("a phase with no counter movement is reported as stuck", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({active: true, channelId: "c1", batch: 1, total: 21, processed: 0, displayed: 0, phase: "requesting"});
	harness.advance(LOADED_STATUS_STALLED_AFTER_MS - 1);
	assert.equal(harness.store.getPhaseSnapshot().working, true);
	assert.equal(harness.store.getPhaseSnapshot().stalled, false);

	harness.advance(1);
	// This is the incident text: the counters read the same as ever, and the suffix is
	// the only thing that says the job is not moving.
	assert.equal(harness.store.getStatusDetailText(), "翻译已加载：第 1 批 0/21，显示 0，请求中 45s 无进展");
	assert.equal(harness.store.getPhaseSnapshot().stalled, true);
	assert.equal(harness.store.getPhaseSnapshot().working, false);

	harness.setChinese(false);
	assert.equal(harness.store.getStatusDetailText(), "Translating loaded: batch 1 0/21, shown 0, requesting 45s no progress");
});

test("counter movement restarts the stall clock without restarting the phase clock", () => {
	const harness = createHarness();
	harness.store.update({active: true, channelId: "c1", batch: 1, total: 21, processed: 0, phase: "requesting"});
	const phaseStartedAt = harness.store.getStatus().phaseStartedAt;

	harness.advance(40000);
	harness.store.update({processed: 5});
	harness.advance(40000);

	const snapshot = harness.store.getPhaseSnapshot();
	assert.equal(snapshot.stalled, false, "a job that moved 40s ago is slow, not stuck");
	assert.equal(snapshot.sinceProgressMs, 40000);
	assert.equal(snapshot.phaseElapsedMs, 80000, "the phase itself has been running the whole time");
	assert.equal(harness.store.getStatus().phaseStartedAt, phaseStartedAt);
});

test("a collecting capsule reports its phase while a waiting one stays quiet", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({active: true, collecting: true, channelId: "c1", batch: 1, total: 0, processed: 0});
	harness.advance(3000);
	assert.equal(harness.store.getStatusDetailText(), "收集已加载：第 1 批 0/0，收集中 3s");

	// Idle-with-nothing-to-do has no job behind it, so a growing timer would only alarm.
	harness.store.update({collecting: false, active: true, total: 0});
	harness.advance(60000);
	assert.equal(harness.store.getStatusDetailText(), "已加载翻译：开启，等待消息");
});

test("a terminal phase adds nothing to the finished wording", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({active: false, collecting: false, done: true, channelId: "c1", batch: 2, total: 10, displayed: 9});
	harness.advance(120000);

	assert.equal(harness.store.getStatus().phase, "done");
	assert.equal(harness.store.getStatusDetailText(), "已加载翻译：第 2 批完成，显示 9/10");

	harness.store.update({done: false, active: false, phase: "failed"});
	harness.advance(120000);
	assert.equal(harness.store.getStatus().phase, "failed");
	assert.equal(harness.store.getStatusDetailText(), "翻译已加载：第 2 批 0/10，显示 9", "a failed phase adds no timer either");
});

test("the phase is derived from the flags when the caller states none", () => {
	const harness = createHarness();

	harness.store.update({active: true, collecting: true, channelId: "c1"});
	assert.equal(harness.store.getStatus().phase, "collecting");

	// Collecting cannot carry forward once the flag drops.
	harness.store.update({collecting: false});
	assert.equal(harness.store.getStatus().phase, "requesting");

	harness.store.update({phase: "repairing"});
	assert.equal(harness.store.getStatus().phase, "repairing");
	harness.store.update({displayed: 1});
	assert.equal(harness.store.getStatus().phase, "repairing", "a non-terminal phase carries forward");

	harness.store.update({active: false, done: true});
	assert.equal(harness.store.getStatus().phase, "done");

	harness.store.update({done: false, active: false});
	assert.equal(harness.store.getStatus().phase, null, "an inactive, unfinished record has no phase");
});

test("an unknown phase string is ignored rather than stored", () => {
	const harness = createHarness();
	harness.store.update({active: true, collecting: false, channelId: "c1", phase: "uploading"});

	assert.equal(harness.store.getStatus().phase, "requesting");
	assert.ok(LOADED_STATUS_PHASES.includes(harness.store.getStatus().phase));
});

test("a phase change restamps both timestamps", () => {
	const harness = createHarness({startTime: 5000});
	harness.store.update({active: true, collecting: true, channelId: "c1"});
	assert.equal(harness.store.getStatus().phaseStartedAt, 5000);
	assert.equal(harness.store.getStatus().progressAt, 5000);

	harness.advance(7000);
	harness.store.update({collecting: false});
	assert.equal(harness.store.getStatus().phaseStartedAt, 12000);
	assert.equal(harness.store.getStatus().progressAt, 12000);
});

test("every historical job state maps onto a capsule phase", () => {
	const {store} = createHarness();

	assert.equal(store.getPhaseForJobState("collecting"), "collecting");
	assert.equal(store.getPhaseForJobState("translating"), "requesting");
	assert.equal(store.getPhaseForJobState("repairing"), "repairing");
	assert.equal(store.getPhaseForJobState("ready"), "committing");
	assert.equal(store.getPhaseForJobState("committed"), "done");
	// A cancelled job is not visible, so it reports nothing.
	assert.equal(store.getPhaseForJobState("cancelled"), null);
	assert.equal(store.getPhaseForJobState("nonsense"), null);
	assert.equal(store.getPhaseForJobState(undefined), null);
	assert.deepEqual(Object.keys(LOADED_STATUS_PHASE_BY_JOB_STATE), ["collecting", "translating", "repairing", "ready", "committed", "cancelled"]);
});

test("batch numbering advances globally and restarts per channel", () => {
	const {store} = createHarness();

	assert.equal(store.getNextBatchNumber(), 1);
	store.update({active: true, channelId: "c1", batch: store.getNextBatchNumber()});
	assert.equal(store.getCurrentBatchNumber(), 1);

	assert.equal(store.getNextBatchNumber(), 2, "the unscoped counter keeps advancing");
	assert.equal(store.getNextBatchNumber("c1"), 2, "the same channel continues its own count");
	assert.equal(store.getNextBatchNumber("c2"), 1, "another channel starts over");

	store.update({batch: 7});
	assert.equal(store.getCurrentBatchNumber(), 7);
	store.clear();
	assert.equal(store.getCurrentBatchNumber(), 1, "a cleared record reports batch 1, never 0");
});

test("the status is channel scoped and reports its own completion", () => {
	const {store} = createHarness();
	store.update({active: false, done: true, channelId: "c1"});

	assert.equal(store.isForChannel("c1"), true);
	assert.equal(store.isForChannel(1), false);
	assert.equal(store.isForChannel("c2"), false);
	assert.equal(store.isDone(), true);
	assert.equal(store.isActive(), false);
	// Numeric channel ids from Discord must still match their string form.
	store.update({channelId: 123});
	assert.equal(store.isForChannel("123"), true);
});

test("the returned status is a copy, so a reader cannot corrupt the record", () => {
	const {store} = createHarness();
	store.update({active: true, channelId: "c1", total: 5});

	const snapshot = store.getStatus();
	snapshot.total = 999;
	snapshot.channelId = "hijacked";

	assert.equal(store.getStatus().total, 5);
	assert.equal(store.getStatus().channelId, "c1");
});

test("clearing resets the whole record and cancels pending hide and refresh timers", () => {
	const harness = createHarness();
	harness.store.update({active: true, collecting: true, done: false, channelId: "c1", total: 9, processed: 4, batch: 3, displayed: 2, displayPending: 1, skipped: 1, failed: 1, retryable: 1, aiDropped: 1, lastSkipReason: "link_only", lastSkipPreview: "hi"});
	harness.store.scheduleHide(1600, () => {});
	harness.store.scheduleRefresh(1000, () => {});
	assert.equal(harness.store.hasPendingHide(), true);
	assert.equal(harness.store.hasPendingRefresh(), true);

	const cleared = harness.store.clear();

	assert.equal(harness.store.hasPendingHide(), false);
	assert.equal(harness.store.hasPendingRefresh(), false);
	assert.equal(harness.timers.size, 0, "the hide timer handle must actually be released");
	assert.deepEqual(cleared, {
		active: false, collecting: false, done: false, channelId: null,
		total: 0, processed: 0, batch: 0, displayed: 0, displayPending: 0, skipped: 0,
		failed: 0, retryable: 0, aiDropped: 0, lastSkipReason: "", lastSkipPreview: "",
		phase: null, phaseStartedAt: 0, progressAt: 0
	});
});

test("scheduling a hide replaces any pending one and releases its handle first", () => {
	const harness = createHarness();
	let hidden = 0;

	const first = harness.store.scheduleHide(1600, () => {hidden++;});
	const second = harness.store.scheduleHide(1600, () => {hidden++;});

	assert.equal(harness.timers.has(first), false, "the superseded timer must be cancelled");
	assert.equal(harness.timers.size, 1);
	assert.equal(harness.timers.get(second).delay, 1600);

	harness.runTimer(second);
	assert.equal(hidden, 1);
	assert.equal(harness.store.hasPendingHide(), false, "the handle is cleared before the callback runs");
});

test("cancelling a hide that was never scheduled is a no-op", () => {
	const harness = createHarness();
	harness.store.cancelHide();
	assert.equal(harness.store.hasPendingHide(), false);
	assert.equal(harness.timers.size, 0);
});

test("seen messages are tracked per channel and report repeats", () => {
	const {store} = createHarness();

	assert.equal(store.markMessageSeen("c1", "m1"), false, "the first sighting is new");
	assert.equal(store.markMessageSeen("c1", "m1"), true, "the second sighting is a repeat");
	assert.equal(store.markMessageSeen("c2", "m1"), false, "another channel tracks separately");
	assert.equal(store.getSeenCount("c1"), 1);
	assert.equal(store.getSeenCount("c2"), 1);
	assert.equal(store.getSeenCount("c3"), 0);
	assert.equal(store.getSeenCount(null), 0);
	// Numeric ids from Discord and their string form are the same message.
	assert.equal(store.markMessageSeen(1, 2), false);
	assert.equal(store.markMessageSeen("1", "2"), true);
});

test("a missing channel or message id is never recorded", () => {
	const {store} = createHarness();

	assert.equal(store.markMessageSeen(null, "m1"), false);
	assert.equal(store.markMessageSeen("c1", null), false);
	assert.equal(store.markMessageSeen("", ""), false);
	assert.equal(store.getSeenCount("c1"), 0);
});

test("resetting seen messages is channel scoped, and global without a channel", () => {
	const {store} = createHarness();
	store.markMessageSeen("c1", "m1");
	store.markMessageSeen("c2", "m2");

	store.resetSeen("c1");
	assert.equal(store.getSeenCount("c1"), 0);
	assert.equal(store.getSeenCount("c2"), 1, "leaving one channel keeps the other");
	assert.equal(store.markMessageSeen("c1", "m1"), false, "a reset channel forgets its messages");

	store.resetSeen();
	assert.equal(store.getSeenCount("c1"), 0);
	assert.equal(store.getSeenCount("c2"), 0);
});

test("the inline text shows the record only for the channel it belongs to", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({active: true, done: false, collecting: false, channelId: "c1", batch: 1, total: 4, processed: 2, displayed: 2});

	assert.equal(harness.store.getInlineStatusText("c1"), harness.store.getStatusText());
	assert.equal(harness.store.getInlineStatusText("c2"), "已加载消息自动翻译已开启，等待当前批次…");
	harness.setChinese(false);
	assert.equal(harness.store.getInlineStatusText("c2"), "Loaded-message auto-translate is on; waiting for the current batch…");
});

test("a global or unassigned record shows inline for any channel", () => {
	const harness = createHarness({chinese: true});

	harness.store.update({active: true, channelId: "__global", batch: 1, total: 4, processed: 1, displayed: 1});
	assert.equal(harness.store.getInlineStatusText("c9"), harness.store.getStatusText());

	harness.store.update({channelId: null});
	assert.equal(harness.store.getInlineStatusText("c9"), harness.store.getStatusText());

	// Neither active nor done means there is nothing to report yet.
	harness.store.clear();
	assert.equal(harness.store.getInlineStatusText("c9"), "已加载消息自动翻译已开启，等待当前批次…");
});

test("preview text is collapsed, trimmed and truncated", () => {
	const {store} = createHarness();

	assert.equal(store.getPreviewText("  hello   world \n again "), "hello world again");
	assert.equal(store.getPreviewText(""), "");
	assert.equal(store.getPreviewText(null), "");
	assert.equal(store.getPreviewText("   "), "");
	assert.equal(store.getPreviewText("x".repeat(24)), "x".repeat(24), "exactly at the limit is kept whole");
	assert.equal(store.getPreviewText("x".repeat(25)), `${"x".repeat(24)}...`);
});

test("a full batch lifecycle keeps the counters and gains a working signal", () => {
	const harness = createHarness({chinese: true});
	const jobStates = ["collecting", "translating", "repairing", "ready", "committed"];

	harness.store.update({active: true, collecting: true, done: false, channelId: "c1", batch: harness.store.getNextBatchNumber(), total: 0, processed: 0, displayed: 0, phase: harness.store.getPhaseForJobState("collecting")});
	assert.equal(harness.store.getStatusDetailText(), "收集已加载：第 1 批 0/0，收集中 0s");

	harness.advance(1000);
	// Exactly what updateHistoricalTranslationJobStatus writes once the job leaves
	// collecting: the flags and the phase move together.
	harness.store.update({collecting: false, total: 21, phase: harness.store.getPhaseForJobState(jobStates[1])});
	harness.advance(5000);
	assert.equal(harness.store.getStatusDetailText(), "翻译已加载：第 1 批 0/21，显示 0，请求中 5s");

	harness.advance(LOADED_STATUS_STALLED_AFTER_MS);
	assert.equal(harness.store.getStatusDetailText(), "翻译已加载：第 1 批 0/21，显示 0，请求中 50s 无进展");

	harness.store.update({processed: 21, displayed: 20, failed: 1, retryable: 1, aiDropped: 1, phase: harness.store.getPhaseForJobState("ready")});
	assert.equal(harness.store.getStatusDetailText(), "翻译已加载：第 1 批 21/21，显示 20，失败 1，提交中 0s");

	harness.store.update({active: false, collecting: false, done: true, phase: harness.store.getPhaseForJobState("committed")});
	assert.equal(harness.store.getStatusDetailText(), "已加载翻译：第 1 批完成，显示 20/21，失败 1");
});

test("repositioning coalesces into one frame per burst", () => {
	// Repositioning the banner reads getBoundingClientRect, which forces a synchronous
	// layout. A historical batch changes the status once per message, and the callers used
	// to pay two layouts per change - one immediate, one in an undeduped animation frame.
	// A burst of N updates must cost one layout, not 2N.
	const frames = [];
	const store = createLoadedTranslationStatusStore({
		requestFrame: callback => {frames.push(callback); return frames.length;},
		cancelFrame: handle => {frames[handle - 1] = null;}
	});

	let repositions = 0;
	const reposition = () => {repositions++;};
	for (let i = 0; i < 20; i++) store.schedulePosition(reposition);
	assert.equal(frames.filter(Boolean).length, 1, "twenty updates must arm exactly one frame");
	assert.equal(repositions, 0, "nothing repositions until the frame runs");

	frames[0]();
	assert.equal(repositions, 1);

	// After the frame ran, the next burst may arm again.
	store.schedulePosition(reposition);
	assert.equal(frames.filter(Boolean).length, 2);
});

test("a cancelled reposition frame does not strand the guard", () => {
	const frames = [];
	const store = createLoadedTranslationStatusStore({
		requestFrame: callback => {frames.push(callback); return frames.length;},
		cancelFrame: handle => {frames[handle - 1] = null;}
	});

	let repositions = 0;
	store.schedulePosition(() => {repositions++;});
	store.cancelScheduledPosition();
	assert.equal(frames.filter(Boolean).length, 0, "the pending frame must be cancelled");

	// The guard must be clear, or a detach would block repositioning forever.
	assert.equal(store.schedulePosition(() => {repositions++;}), true);
});

// Capsule-counter product decisions (docs/product.md, 2026-08-19): a no-work scan
// never reads as 0/N, and completed batches accumulate a session total.

test("a completed scan with nothing to translate shows a checkmark, never zero-over-total", () => {
	const harness = createHarness();
	assert.equal(harness.store.getStatusText(legacyStatus({done: true, total: 0})), "✓");
	assert.equal(harness.store.getStatusDetailText(legacyStatus({done: true, total: 0})), "Loaded translation: on, no pending messages");
	harness.setChinese(true);
	assert.equal(harness.store.getStatusDetailText(legacyStatus({done: true, total: 0})), "已加载翻译：开启，暂无待翻译");
	const failed = legacyStatus({done: true, total: 0, failed: 2, retryable: 2});
	assert.notEqual(harness.store.getStatusText(failed), "✓", "failures never hide behind the checkmark");
});

function ids(prefix, count, start = 1) {
	return Array.from({length: count}, (_, index) => `${prefix}${start + index}`);
}

test("completed batches accumulate a session total in the pill and the hover detail", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({channelId: "c1", batch: 1, active: true, collecting: false, done: false, total: 13, processed: 13});
	harness.store.recordSessionDisplayed("c1", ids("m", 13));
	harness.store.update({channelId: "c1", batch: 1, active: false, done: true, displayed: 13});
	assert.equal(harness.store.getStatusText(), "13/13", "a finished single batch reads as the classic closed ratio");
	harness.store.update({channelId: "c1", batch: 2, active: true, collecting: false, done: false, total: 20, processed: 20, displayed: 0});
	// The user-specified cumulative reading: 13 done, 20 more queued = 13/33.
	assert.equal(harness.store.getStatusText(), "13/33 · 0s");
	assert.match(harness.store.getStatusDetailText(), /本次累计 13/);
	harness.store.recordSessionDisplayed("c1", ids("m", 20, 14));
	harness.store.update({channelId: "c1", batch: 2, active: false, done: true, displayed: 20});
	assert.equal(harness.store.getStatusText(), "33/33", "the finished cumulative ratio closes");
	assert.match(harness.store.getStatusDetailText(), /本次累计 33/);
	harness.setChinese(false);
	assert.match(harness.store.getStatusDetailText(), /session total 33/);
});

test("the channel total survives batch restarts and ordinary per-channel resets", () => {
	const harness = createHarness();
	harness.store.update({channelId: "c1", batch: 1, active: true, collecting: false, done: false, total: 5, processed: 5});
	harness.store.recordSessionDisplayed("c1", ids("m", 5));
	harness.store.update({channelId: "c1", batch: 1, active: false, done: true, displayed: 5});
	harness.store.update({channelId: "c2", batch: 1, active: true, collecting: false, done: false, total: 4, processed: 4, displayed: 0});
	harness.store.recordSessionDisplayed("c2", ids("n", 4));
	harness.store.update({channelId: "c2", batch: 1, active: false, done: true, displayed: 4});
	assert.equal(harness.store.getStatusText(), "4/4", "another channel never inherits the first channel's total");
	// A batch-window restart (clear + per-channel reset + a fresh 0/N batch) keeps
	// counting: this is the 2026-08-19 "0/13 again" report.
	harness.store.clear();
	harness.store.resetSeen("c2");
	harness.store.update({channelId: "c2", batch: 1, active: true, collecting: false, done: false, total: 3, processed: 0, displayed: 0});
	assert.equal(harness.store.getStatusText(), "4/7 · 0s", "the running restart continues the cumulative ratio instead of starting at zero");
	harness.store.recordSessionDisplayed("c2", ids("p", 3));
	harness.store.update({channelId: "c2", batch: 1, active: false, done: true, processed: 3, displayed: 3});
	assert.equal(harness.store.getStatusText(), "7/7", "the restarted batch closes on the cumulative total");
	harness.store.resetSeen();
	harness.store.update({});
	assert.equal(harness.store.getStatus().sessionDisplayed, 0, "the global tracking reset drops every channel total");
});

test("a changed translation configuration starts a fresh cumulative session for only that channel", () => {
	const harness = createHarness();
	assert.equal(harness.store.setConfigurationSignature("c1", "config-a"), false);
	assert.equal(harness.store.setConfigurationSignature("c2", "config-x"), false);
	harness.store.markMessageSeen("c1", "old-1");
	harness.store.recordSessionDisplayed("c1", ids("old", 36));
	harness.store.recordSessionDisplayed("c2", ids("other", 4));
	harness.store.update({channelId: "c1", active: false, done: true, total: 36, processed: 36, displayed: 36});
	assert.equal(harness.store.getStatus().sessionDisplayed, 36);

	assert.equal(harness.store.setConfigurationSignature("c1", "config-b"), true);
	assert.equal(harness.store.getSeenCount("c1"), 0);
	harness.store.update({channelId: "c1", active: true, done: false, total: 5, processed: 0, displayed: 0});
	assert.equal(harness.store.getStatus().sessionDisplayed, 0, "the old target-language count cannot enter the new configuration");
	harness.store.update({channelId: "c2", active: true, done: false, total: 1, processed: 0, displayed: 0});
	assert.equal(harness.store.getStatus().sessionDisplayed, 4, "another channel keeps its own configuration session");
	assert.equal(harness.store.setConfigurationSignature("c1", "config-b"), false, "re-reading the same configuration is a no-op");
});

test("the session total counts unique message ids, so re-reports and late batch echoes never inflate it", () => {
	const harness = createHarness();
	harness.store.update({channelId: "c1", batch: 1, active: true, collecting: false, done: false, total: 5, processed: 5});
	harness.store.recordSessionDisplayed("c1", ids("m", 5));
	// The same rows confirm again on a retry pass and a late batch-1 echo arrives
	// after batch 2 started; both repeat ids the session already counted.
	harness.store.recordSessionDisplayed("c1", ids("m", 3));
	harness.store.update({channelId: "c1", batch: 2, active: true, collecting: false, done: false, total: 4, processed: 4, displayed: 0});
	harness.store.recordSessionDisplayed("c1", ids("m", 5));
	assert.equal(harness.store.getStatus().sessionDisplayed, 5, "repeated ids never inflate the session total");
	harness.store.recordSessionDisplayed("other-channel", ids("x", 7));
	assert.equal(harness.store.getStatus().sessionDisplayed, 5, "another channel's paints never leak into this session");
});

test("live translations after the batch bump the session total without touching the batch ratio", () => {
	const harness = createHarness({chinese: true});
	harness.store.update({channelId: "c1", batch: 1, active: true, collecting: false, done: false, total: 12, processed: 12});
	harness.store.recordSessionDisplayed("c1", ids("m", 12));
	harness.store.update({channelId: "c1", batch: 1, active: false, done: true, displayed: 12});
	harness.store.recordSessionDisplayed("c1", ["live-1"]);
	harness.store.recordSessionDisplayed("c1", ["live-2"]);
	assert.equal(harness.store.getStatusText(), "14/14", "each live translation raises the closed cumulative ratio");
	assert.match(harness.store.getStatusDetailText(), /本次累计 14/);
	harness.store.resetSeen();
	harness.store.recordSessionDisplayed("c1", ids("q", 3));
	harness.store.update({channelId: "c1", batch: 1, active: false, done: true, total: 3, processed: 3, displayed: 3});
	assert.equal(harness.store.getStatusText(), "3/3", "after the global reset the count restarts from the fresh commits");
});

test("a stale-batch report is dropped whole, while equal, newer, and cross-channel reports pass", () => {
	const harness = createHarness();
	harness.store.update({channelId: "c1", batch: 2, active: true, collecting: false, done: false, total: 10, processed: 5, displayed: 5});
	const before = harness.store.getStatus();
	harness.store.update({channelId: "c1", batch: 1, displayed: 13, displayPending: 4});
	assert.deepEqual(harness.store.getStatus(), before, "a batch-1 straggler cannot merge into batch 2's counters");
	harness.store.update({channelId: "c1", batch: 2, displayed: 6});
	assert.equal(harness.store.getStatus().displayed, 6, "the current batch's own reports still land");
	harness.store.update({channelId: "c2", batch: 1, active: true, collecting: false, done: false, total: 3, processed: 0, displayed: 0});
	assert.equal(harness.store.getStatus().channelId, "c2", "another channel restarting at batch 1 is a channel switch, not a stale report");
});

test("the running denominator releases items already resolved as skipped or failed", () => {
	// 2026-08-19 report: 86/123 collapsed to 106/106 at completion and the 17 skips
	// read as lost messages. The denominator only promises work that can still
	// display: pending items, not resolved skips/failures.
	const harness = createHarness();
	harness.store.recordSessionDisplayed("c1", ids("m", 86));
	harness.store.update({channelId: "c1", batch: 2, active: true, collecting: false, done: false, total: 37, processed: 20, displayed: 0, skipped: 17});
	assert.equal(harness.store.getStatusText(), "86/106 · 0s", "resolved skips leave the denominator immediately");
	harness.store.update({displayed: 20, skipped: 17});
	assert.equal(harness.store.getStatus().sessionDisplayed, 86, "displayed merges do not touch the id set");
});

test("failure and repair readings stay on the cumulative basis instead of snapping back to the batch", () => {
	// Field screenshots (2026-08-19): the pill read 113/152 while running, then a
	// batch finished with ONE retryable failure and the pill snapped to the OLD
	// per-batch reading (26/39 - 1!) - the numerator went backwards, which the user
	// read as an old version resurfacing. Every branch keeps the session-cumulative
	// numerator; recoverable failures join the denominator as work a retry could
	// still display.
	const harness = createHarness();
	harness.store.update({channelId: "c1", batch: 1, active: true, collecting: false, done: false, total: 13, processed: 13});
	harness.store.recordSessionDisplayed("c1", ids("m", 13));
	harness.store.update({channelId: "c1", batch: 1, active: false, done: true, displayed: 13});
	harness.store.update({channelId: "c1", batch: 2, active: true, collecting: false, done: false, total: 39, processed: 39, displayed: 0});
	harness.store.recordSessionDisplayed("c1", ids("m", 26, 14));
	harness.store.update({channelId: "c1", batch: 2, active: false, done: true, displayed: 26, skipped: 12, failed: 1, retryable: 1});

	assert.equal(harness.store.getStatusText(), "39/40 · 1!", "the cumulative numerator holds and the retryable failure joins the denominator");

	// Pressing retry moves the same reading into the repair phase without a reset.
	harness.store.update({channelId: "c1", batch: 2, active: true, done: false, phase: "repairing", total: 39, displayed: 26, skipped: 12, failed: 1, retryable: 1});
	assert.equal(harness.store.getStatusText(), "39/40 · 1↻", "repair keeps the cumulative reading too");
});
