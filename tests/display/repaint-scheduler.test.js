const test = require("node:test");
const assert = require("node:assert/strict");
const {createDisplayRepaintScheduler, BUSY_RETRY_DELAY_MS, SETTINGS_RETRY_DELAY_MS, LIVE_REPAINT_DELAY_MS, CALM_REPAINT_DELAY_MS} = require("../../src/display/repaint-scheduler");

test("a render interrupted by user interaction is retried as one scheduled repaint", async () => {
	const timers = [];
	const renders = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: messageIds => {
			renders.push(messageIds);
			return Promise.resolve(renders.length === 1 ? {retryIds: messageIds} : {confirmedIds: messageIds});
		},
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0);
	const initialTimer = timers.shift();
	assert.equal(initialTimer.delay, 0);
	initialTimer.callback();
	await Promise.resolve();

	assert.equal(timers.length, 1);
	assert.equal(timers[0].delay, BUSY_RETRY_DELAY_MS);
	timers.shift().callback();
	await Promise.resolve();
	assert.deepEqual(renders, [["m1"], ["m1"]]);
});

test("a permanently unconfirmed mounted row stops after three targeted repaint attempts", async () => {
	const timers = [];
	const renders = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: messageIds => {
			renders.push(messageIds);
			return Promise.resolve({missingIds: messageIds, retryIds: messageIds});
		},
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0);
	for (let attempt = 0; attempt < 3; attempt++) {
		const timer = timers.shift();
		assert.ok(timer, `attempt ${attempt + 1} must be scheduled`);
		timer.callback();
		await Promise.resolve();
	}

	assert.deepEqual(renders, [["m1"], ["m1"], ["m1"]]);
	assert.equal(timers.length, 0, "the targeted retry path must not loop forever");
});

test("an ordinary duplicate schedule cannot reset an in-flight retry budget", async () => {
	const timers = [];
	const renders = [];
	const outcomes = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: messageIds => {
			renders.push(messageIds);
			return Promise.resolve({missingIds: messageIds, retryIds: messageIds});
		},
		onRenderOutcome: report => outcomes.push(report),
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0, 1, "batch-1");
	for (let attempt = 0; attempt < 3; attempt++) {
		const timer = timers.shift();
		assert.ok(timer, `attempt ${attempt + 1} must be scheduled`);
		timer.callback();
		await Promise.resolve();
		// A normal display event for the same row may arrive between retries. It must
		// join the current request instead of resetting it to attempt one.
		if (attempt < 2) scheduler.schedule("c1", "m1", 0, 1, "batch-1");
	}

	assert.equal(renders.length, 3);
	assert.equal(timers.length, 0);
	assert.deepEqual(outcomes.at(-1).outcome.exhaustedIds, ["m1"]);
	assert.deepEqual(outcomes.at(-1).trackingKeysByMessageId, {m1: ["batch-1"]});
});

test("a duplicate scheduled before an in-flight paint settles cannot create an early or fourth repaint", async () => {
	const timers = [];
	const resolvers = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: () => new Promise(resolve => resolvers.push(resolve)),
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0);
	for (let attempt = 1; attempt <= 3; attempt++) {
		const timer = timers.shift();
		assert.ok(timer, `attempt ${attempt} must be scheduled`);
		timer.callback();
		scheduler.schedule("c1", "m1", 0);
		assert.equal(timers.length, 0, "an in-flight duplicate waits for the current outcome");
		resolvers.shift()({missingIds: ["m1"], retryIds: ["m1"]});
		await Promise.resolve();
		if (attempt < 3) assert.equal(timers[0].delay, BUSY_RETRY_DELAY_MS);
	}

	assert.equal(timers.length, 0, "attempt three exhausts and removes its in-flight duplicate");
});

test("another message may paint while an active row remains single-flight", async () => {
	const timers = [];
	const renders = [];
	let resolveFirst;
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: messageIds => {
			renders.push(messageIds);
			if (renders.length === 1) return new Promise(resolve => {resolveFirst = resolve;});
			return Promise.resolve({confirmedIds: messageIds});
		},
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0);
	timers.shift().callback();
	scheduler.schedule("c1", "m1", 0);
	scheduler.schedule("c1", "m2", 0);
	timers.shift().callback();
	await Promise.resolve();

	assert.deepEqual(renders, [["m1"], ["m2"]]);
	resolveFirst({confirmedIds: ["m1"]});
	await Promise.resolve();
});

test("each targeted repaint reports its channel and render outcome to status tracking", async () => {
	const timers = [];
	const reported = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: messageIds => Promise.resolve({confirmedIds: messageIds, missingIds: [], retryIds: []}),
		onRenderOutcome: report => reported.push(report),
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0);
	timers.shift().callback();
	await Promise.resolve();

	assert.deepEqual(reported, [{
		channelId: "c1",
		messageIds: ["m1"],
		outcome: {confirmedIds: ["m1"], missingIds: [], retryIds: []}
	}]);
});

// Full-list path (path B) contract tests, added by the display-unification slice 1.
// They pin the behavior manual translation, reply previews, embeds, and titles rely
// on until slice 5 merges the two refresh paths.

function createFullRepaintHarness(overrides = {}) {
	const state = {timers: [], repaints: 0, settingsOpen: false, textAreaFocused: false, viewingHistory: false};
	const scheduler = createDisplayRepaintScheduler(Object.assign({
		renderMessages: () => Promise.resolve({}),
		canRepaintNow: () => true,
		isViewingHistory: () => state.viewingHistory,
		isSettingsSurfaceOpen: () => state.settingsOpen,
		isTextAreaFocused: () => state.textAreaFocused,
		repaintAll: () => {state.repaints++;},
		setTimeout: (callback, delay) => {
			const timer = {callback, delay, cancelled: false};
			state.timers.push(timer);
			return timer;
		},
		clearTimeout: timer => {
			if (timer) timer.cancelled = true;
		}
	}, overrides));
	state.pendingTimers = () => state.timers.filter(timer => !timer.cancelled && !timer.fired);
	state.fireNext = () => {
		const timer = state.pendingTimers()[0];
		assert.ok(timer, "a pending timer must exist");
		timer.fired = true;
		timer.callback();
	};
	return {scheduler, state};
}

test("an immediate full repaint paints synchronously and cancels a pending batched timer", () => {
	const {scheduler, state} = createFullRepaintHarness();
	scheduler.scheduleFullRepaint({batched: true});
	assert.equal(state.pendingTimers().length, 1);
	assert.equal(state.pendingTimers()[0].delay, LIVE_REPAINT_DELAY_MS);
	scheduler.scheduleFullRepaint({batched: false});
	assert.equal(state.repaints, 1, "immediate mode paints without waiting");
	assert.equal(state.pendingTimers().length, 0, "the batched timer was cancelled, not left to double-paint");
});

test("a batched full repaint coalesces duplicates into one timer and uses the calm delay over history", () => {
	const {scheduler, state} = createFullRepaintHarness();
	state.viewingHistory = true;
	scheduler.scheduleFullRepaint({batched: true});
	scheduler.scheduleFullRepaint({batched: true});
	scheduler.scheduleFullRepaint({batched: true});
	assert.equal(state.pendingTimers().length, 1, "duplicate batched requests share one timer");
	assert.equal(state.pendingTimers()[0].delay, CALM_REPAINT_DELAY_MS);
	state.fireNext();
	assert.equal(state.repaints, 1);
});

test("an open settings surface defers the full repaint and closing the panel flushes it", () => {
	const {scheduler, state} = createFullRepaintHarness();
	state.settingsOpen = true;
	scheduler.scheduleFullRepaint({batched: false});
	assert.equal(state.repaints, 0, "never paint over an open settings surface");
	assert.equal(scheduler.hasDeferredFullRepaint(), true);
	assert.equal(state.pendingTimers()[0].delay, SETTINGS_RETRY_DELAY_MS);
	state.settingsOpen = false;
	scheduler.flushDeferredFullRepaint();
	assert.equal(scheduler.hasDeferredFullRepaint(), false);
	// The flush arms a batched repaint but does not cancel the settings retry timer;
	// both surviving timers coalesce into exactly one repaint.
	while (state.pendingTimers().length) state.fireNext();
	assert.equal(state.repaints, 1, "the deferred repaint lands exactly once after the panel closes");
});

test("a focused text area defers the full repaint until focus clears", () => {
	const {scheduler, state} = createFullRepaintHarness();
	state.textAreaFocused = true;
	scheduler.scheduleFullRepaint({batched: false});
	assert.equal(state.repaints, 0, "never remount the list under the user's cursor");
	assert.equal(state.pendingTimers()[0].delay, BUSY_RETRY_DELAY_MS);
	state.textAreaFocused = false;
	state.fireNext();
	state.fireNext();
	assert.equal(state.repaints, 1);
});

test("allowWhileSettings and allowWhileTyping override their deferrals for lifecycle repaints", () => {
	const {scheduler, state} = createFullRepaintHarness();
	state.settingsOpen = true;
	state.textAreaFocused = true;
	scheduler.scheduleFullRepaint({batched: false, allowWhileSettings: true, allowWhileTyping: true});
	assert.equal(state.repaints, 1, "explicit overrides paint immediately");
	assert.equal(scheduler.hasDeferredFullRepaint(), false);
});

test("cancelFullRepaintTimers clears every pending timer and the deferred flag", () => {
	const {scheduler, state} = createFullRepaintHarness();
	state.settingsOpen = true;
	scheduler.scheduleFullRepaint({batched: false});
	assert.equal(scheduler.hasDeferredFullRepaint(), true);
	scheduler.cancelFullRepaintTimers();
	assert.equal(scheduler.hasDeferredFullRepaint(), false);
	assert.equal(state.pendingTimers().length, 0, "no timer may outlive a cancelled scheduler");
	scheduler.flushDeferredFullRepaint();
	assert.equal(state.repaints, 0, "a cancelled deferral cannot resurrect a repaint");
});

test("a transaction repaint keeps the pinned live delay even while viewing history", () => {
	// Weighed and settled (2026-08-19 flicker audit): slowing the transaction cadence
	// in history was tried and rejected - the prompt-display contract in
	// tests/integration/received-display-throughput.test.js pins that a translation
	// must not sit invisible while the reader is scrolled up. The composer icon
	// flicker is owned by the rebuild mechanism (see discord-render-adapter), not by
	// this cadence.
	const timers = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: messageIds => Promise.resolve({confirmedIds: messageIds}),
		canRepaintNow: () => true,
		isViewingHistory: () => true,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1");
	assert.equal(timers[0].delay, LIVE_REPAINT_DELAY_MS);
});

test("the flush hands per-source trigger counts to the render callback", async () => {
	// Cadence audit 2026-08-19: five lanes (live, cached, historical, manual, retry)
	// share the one visible symptom of a whole-layer rebuild. Attribution starts here:
	// every schedule call carries its lane, and the transaction reports the counts.
	const timers = [];
	const metas = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: (messageIds, meta) => {
			metas.push({messageIds: messageIds.slice(), meta});
			return Promise.resolve({confirmedIds: messageIds});
		},
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0, 1, null, "historical");
	scheduler.schedule("c1", "m2", 0, 1, null, "cached");
	scheduler.schedule("c1", "m3", 0);
	timers.shift().callback();
	await Promise.resolve();

	assert.equal(metas.length, 1, "one transaction covers all three requests");
	assert.deepEqual(metas[0].meta.sources, {historical: 1, cached: 1, live: 1}, "untagged requests default to the live lane");
});

test("a bounded retry re-enters the next transaction tagged as retry", async () => {
	// Retries have their own cadence (450ms, max 3 attempts); the diagnostics must
	// separate them from fresh commits or a retry storm reads as a live storm.
	const timers = [];
	const metas = [];
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: (messageIds, meta) => {
			metas.push(meta);
			return Promise.resolve(metas.length === 1 ? {retryIds: messageIds} : {confirmedIds: messageIds});
		},
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.schedule("c1", "m1", 0, 1, null, "historical");
	timers.shift().callback();
	await Promise.resolve();
	timers.shift().callback();
	await Promise.resolve();

	assert.deepEqual(metas[1].sources, {retry: 1});
});

test("lifecycle full repaints are counted for the settings diagnostics", () => {
	// Path B (settings close, engine switch, channel enable) rebuilds outside the
	// adapter, so its rebuilds were invisible to the repaint counters - the exact
	// blind spot the 2026-08-19 cadence audit hit.
	const timers = [];
	let repaints = 0;
	const scheduler = createDisplayRepaintScheduler({
		renderMessages: () => Promise.resolve({}),
		canRepaintNow: () => true,
		isViewingHistory: () => false,
		repaintAll: () => {repaints++;},
		setTimeout: (callback, delay) => {
			timers.push({callback, delay});
			return timers.length;
		},
		clearTimeout: () => {}
	});

	scheduler.scheduleFullRepaint();
	assert.equal(repaints, 1);
	assert.equal(scheduler.getDiagnostics().fullRepaints, 1);

	scheduler.scheduleFullRepaint({batched: true});
	timers.shift().callback();
	assert.equal(repaints, 2);
	assert.equal(scheduler.getDiagnostics().fullRepaints, 2);
});
