const test = require("node:test");
const assert = require("node:assert/strict");
const {
	AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE,
	AUTO_TRANSLATION_SCROLL_IDLE_DELAY,
	AUTO_TRANSLATION_SCROLL_INTENT_WINDOW,
	AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD,
	MANUAL_TRANSLATION_SCROLL_LOCK_MS,
	MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS,
	createMessageViewportStore
} = require("../src/viewport/message-viewport-store");

const MESSAGES_SCROLLER_SELECTOR = ".messages-scroller";
const CHANNEL_TEXT_AREA_SELECTOR = ".channel-text-area";
const MESSAGE_ID = "111111111111111111";
const OTHER_MESSAGE_ID = "222222222222222222";

// Only the attribute selector shapes the store actually builds are supported; an
// unrecognised selector fails the test rather than silently matching nothing.
function matchesAttributeSelector(element, selector) {
	const match = selector.match(/^\[([\w-]+)(=|\$=|\*=)"((?:\\.|[^"\\])*)"\]$/);
	assert.ok(match, `unsupported selector: ${selector}`);
	const [, attribute, operator, escapedValue] = match;
	const expected = escapedValue.replace(/\\(["\\])/g, "$1");
	const actual = attribute === "id" ? element.id : element.getAttribute(attribute);
	if (actual == null) return false;
	if (operator === "=") return String(actual) === expected;
	if (operator === "$=") return String(actual).endsWith(expected);
	return String(actual).includes(expected);
}

function createMessageElement(definition) {
	const {messageId = null, top = 0, height = 40, id, listItemId = null, labelledBy = null, parent = null} = definition;
	return {
		id: id === undefined ? (messageId ? `chat-messages-${messageId}` : "") : id,
		top,
		height,
		parent,
		getAttribute(name) {
			if (name === "data-list-item-id") return listItemId;
			if (name === "aria-labelledby") return labelledBy;
			return null;
		},
		getBoundingClientRect() {
			return {top: this.top, bottom: this.top + this.height, height: this.height};
		},
		closest(selector) {
			assert.ok(selector.includes("chat-messages"), "the store must look for the message row wrapper");
			if (this.parent) return this.parent;
			return typeof this.id === "string" && this.id.startsWith("chat-messages-") ? this : null;
		}
	};
}

function createClock(start) {
	let time = start;
	let sequence = 0;
	const timers = new Map();
	return {
		now: () => time,
		pending: () => timers.size,
		setTimeout(callback, delay) {
			const id = ++sequence;
			timers.set(id, {callback, at: time + Math.max(0, delay || 0), order: id});
			return id;
		},
		clearTimeout(id) {
			timers.delete(id);
		},
		advance(ms) {
			const target = time + ms;
			for (;;) {
				let next = null;
				for (const [id, timer] of timers) {
					if (timer.at > target) continue;
					if (!next || timer.at < next.timer.at || (timer.at === next.timer.at && timer.order < next.timer.order)) next = {id, timer};
				}
				if (!next) break;
				timers.delete(next.id);
				time = next.timer.at;
				next.timer.callback();
			}
			time = target;
		},
		// Moves the clock without servicing due timers, which is how a throttled
		// background tab behaves and the only way to exercise read-side expiry guards.
		jump(ms) {
			time += ms;
		}
	};
}

function createScroller({scrollTop, scrollHeight, clientHeight, rect, messages}) {
	let scrollTopValue = scrollTop;
	const writes = [];
	const listeners = [];
	return {
		writes,
		listeners,
		get scrollTop() {return scrollTopValue;},
		set scrollTop(value) {
			scrollTopValue = value;
			writes.push(value);
		},
		scrollHeight,
		clientHeight,
		getBoundingClientRect: () => ({top: rect.top, bottom: rect.bottom, height: rect.bottom - rect.top}),
		querySelectorAll(selector) {
			assert.ok(selector.includes("chat-messages"), "the store must query message rows");
			return messages;
		},
		addEventListener(type, handler, options) {
			listeners.push({type, handler, options});
		},
		removeEventListener(type, handler, options) {
			const index = listeners.findIndex(entry => entry.type === type && entry.handler === handler);
			assert.notEqual(index, -1, `removed a listener that was never added: ${type}`);
			assert.equal(options, undefined, "the legacy detach passes no options; keep removal symmetric with it");
			listeners.splice(index, 1);
		},
		dispatch(type, event = {}) {
			for (const entry of listeners.slice()) if (entry.type === type) entry.handler(Object.assign({type}, event));
		},
		listenerTypes() {
			return listeners.map(entry => entry.type);
		}
	};
}

function createHarness({
	documentAvailable = true,
	scrollerAvailable = true,
	scrollTop = 500,
	scrollHeight = 2000,
	clientHeight = 800,
	rect = {top: 100, bottom: 900},
	messages = [{messageId: MESSAGE_ID, top: 120}],
	selectedChannelId = "chan-1",
	escapeSelectorValue = null
} = {}) {
	const clock = createClock(10000);
	let frameQueue = [];
	let selected = selectedChannelId;
	const finishedChannels = [];
	const messageElements = messages.map(createMessageElement);
	let scroller = createScroller({scrollTop, scrollHeight, clientHeight, rect, messages: messageElements});
	const documentListeners = [];
	const documentRef = {
		activeElement: null,
		body: {tagName: "BODY"},
		querySelector(selector) {
			if (selector === MESSAGES_SCROLLER_SELECTOR) return scrollerAvailable ? scroller : null;
			return messageElements.find(element => matchesAttributeSelector(element, selector)) || null;
		},
		addEventListener(type, handler, capture) {
			documentListeners.push({type, handler, capture});
		},
		removeEventListener(type, handler, capture) {
			const index = documentListeners.findIndex(entry => entry.type === type && entry.handler === handler && entry.capture === capture);
			assert.notEqual(index, -1, `removed a document listener that was never added: ${type}`);
			documentListeners.splice(index, 1);
		}
	};
	const store = createMessageViewportStore({
		getDocument: () => documentAvailable ? documentRef : null,
		setTimeout: (callback, delay) => clock.setTimeout(callback, delay),
		clearTimeout: timer => clock.clearTimeout(timer),
		requestAnimationFrame: callback => frameQueue.push(callback),
		now: () => clock.now(),
		getSelectedChannelId: () => selected,
		getMessagesScrollerSelector: () => MESSAGES_SCROLLER_SELECTOR,
		getChannelTextAreaSelector: () => CHANNEL_TEXT_AREA_SELECTOR,
		escapeSelectorValue,
		onScrollActivityFinished: channelId => finishedChannels.push(channelId)
	});
	return {
		store,
		documentRef,
		documentListeners,
		documentListenerTypes: () => documentListeners.map(entry => entry.type),
		dispatchDocument(type, event = {}) {
			for (const entry of documentListeners.slice()) if (entry.type === type) entry.handler(Object.assign({type}, event));
		},
		finishedChannels,
		messageElements,
		get scroller() {return scroller;},
		replaceScroller() {
			const previous = scroller;
			scroller = createScroller({scrollTop, scrollHeight, clientHeight, rect, messages: messageElements});
			return previous;
		},
		setSelectedChannelId(channelId) {selected = channelId;},
		advance: ms => clock.advance(ms),
		jump: ms => clock.jump(ms),
		pendingTimers: () => clock.pending(),
		now: () => clock.now(),
		flushFrames(count = 2) {
			for (let index = 0; index < count; index++) {
				const pending = frameQueue;
				frameQueue = [];
				for (const callback of pending) callback();
			}
		},
		pendingFrames: () => frameQueue.length
	};
}

// Opens the user-scroll window the way a real gesture does: an intent event followed
// by the scroll event the browser emits for it.
function scrollAsUser(harness) {
	harness.scroller.dispatch("wheel");
	harness.scroller.dispatch("scroll");
}

test("the constants are the incident fixes, not tuning knobs", () => {
	assert.equal(AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE, 150);
	assert.equal(AUTO_TRANSLATION_SCROLL_IDLE_DELAY, 900);
	assert.equal(AUTO_TRANSLATION_SCROLL_INTENT_WINDOW, 300);
	assert.equal(AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD, 80);
	assert.equal(MANUAL_TRANSLATION_SCROLL_LOCK_MS, 4500);
	assert.deepEqual(MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS, [60, 180, 420, 900]);
});

test("a scroll echoing our own write inside the grace window is not user scrolling", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	harness.store.restoreScrollerState({scrollTop: 300, keepBottom: false, anchor: null, userScrollIntentSequence: 0});
	harness.flushFrames();
	assert.deepEqual(harness.scroller.writes, [300], "the restore must have written a scroll position");

	harness.advance(AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE - 1);
	scrollAsUser(harness);

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false, "the restore echo must not open the user-scroll window");
});

test("a scroll one millisecond past the grace window counts as user scrolling", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	harness.store.restoreScrollerState({scrollTop: 300, keepBottom: false, anchor: null, userScrollIntentSequence: 0});
	harness.flushFrames();

	harness.advance(AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE);
	scrollAsUser(harness);

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true);
});

test("every programmatic scroll write re-arms the grace window", () => {
	const harness = createHarness({scrollTop: 1180});
	harness.store.attachScrollWatcher();

	harness.store.restoreScrollerState({keepBottom: true, userScrollIntentSequence: 0});
	harness.flushFrames();
	assert.deepEqual(harness.scroller.writes, [2000], "a bottom-locked restore pins to scrollHeight");

	harness.advance(AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE - 1);
	scrollAsUser(harness);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
});

test("a scroll without a gesture in front of it stays programmatic", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();

	harness.scroller.dispatch("scroll");

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false, "content growth must not look like the user scrolling");
});

test("a gesture arms user-scroll detection for exactly the intent window", () => {
	const inside = createHarness();
	inside.store.attachScrollWatcher();
	inside.scroller.dispatch("wheel");
	inside.advance(AUTO_TRANSLATION_SCROLL_INTENT_WINDOW - 1);
	inside.scroller.dispatch("scroll");
	assert.equal(inside.store.isUserActivelyScrolling("chan-1"), true);

	const outside = createHarness();
	outside.store.attachScrollWatcher();
	outside.scroller.dispatch("wheel");
	outside.advance(AUTO_TRANSLATION_SCROLL_INTENT_WINDOW);
	outside.scroller.dispatch("scroll");
	assert.equal(outside.store.isUserActivelyScrolling("chan-1"), false, "the intent must have expired");
});

test("releasing the pointer disarms the intent before any scroll arrives", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();

	harness.scroller.dispatch("pointerdown");
	harness.scroller.dispatch("pointerup");
	harness.scroller.dispatch("scroll");

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
});

test("only scrolling keys arm the intent, and each gesture bumps the intent sequence", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();

	harness.scroller.dispatch("keydown", {key: "a"});
	assert.equal(harness.store.getUserScrollIntentSequence(), 0, "typing is not a scroll gesture");
	harness.scroller.dispatch("scroll");
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);

	harness.scroller.dispatch("keydown", {key: "PageDown"});
	assert.equal(harness.store.getUserScrollIntentSequence(), 1);
	harness.scroller.dispatch("scroll");
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true);

	for (const key of ["ArrowUp", "ArrowDown", "PageUp", "Home", "End", " "]) {
		const before = harness.store.getUserScrollIntentSequence();
		harness.scroller.dispatch("keydown", {key});
		assert.equal(harness.store.getUserScrollIntentSequence(), before + 1, `${key} must count as a scroll gesture`);
	}
});

test("the user-scroll window closes exactly one idle delay after the last scroll", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);

	harness.advance(AUTO_TRANSLATION_SCROLL_IDLE_DELAY - 1);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true);
	assert.deepEqual(harness.finishedChannels, []);

	harness.advance(1);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
	assert.deepEqual(harness.finishedChannels, ["chan-1"], "closing the window releases the historical snapshot");
});

test("momentum scroll events slide the idle window instead of opening a new one", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);

	harness.advance(500);
	harness.scroller.dispatch("scroll");
	harness.advance(AUTO_TRANSLATION_SCROLL_IDLE_DELAY - 1);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true, "the window slid with the momentum events");

	harness.advance(1);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
});

test("a scroll arriving after the window closed cannot reopen it without a gesture", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);
	harness.advance(AUTO_TRANSLATION_SCROLL_IDLE_DELAY);

	harness.scroller.dispatch("scroll");

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
});

test("scrollend closes the window immediately", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);
	harness.advance(100);

	harness.scroller.dispatch("scrollend");

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
	assert.deepEqual(harness.finishedChannels, ["chan-1"]);
	assert.equal(harness.pendingTimers(), 0, "the idle timer must not survive the finish");
});

test("scrollend uses the scrolled channel even after the selection moved on", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);
	harness.setSelectedChannelId("chan-2");

	harness.scroller.dispatch("scrollend");

	assert.deepEqual(harness.finishedChannels, ["chan-1"]);
});

test("finishing another channel leaves this channel's window open", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);

	harness.store.finishScrollActivity("chan-2");

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true, "a foreign finish must not clear our window");
	assert.deepEqual(harness.finishedChannels, ["chan-2"]);
	assert.equal(harness.pendingTimers(), 0);
});

test("finishing without a channel clears unconditionally and notifies nobody", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);

	harness.store.finishScrollActivity(null);

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
	assert.deepEqual(harness.finishedChannels, []);
});

test("isUserActivelyScrolling falls back to the selected channel", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);

	assert.equal(harness.store.isUserActivelyScrolling(), true);
	assert.equal(harness.store.isUserActivelyScrolling("chan-2"), false);

	harness.setSelectedChannelId("chan-2");
	assert.equal(harness.store.isUserActivelyScrolling(), false, "the fallback follows the selection");
});

test("the historical commit gate reads scroll and typing separately", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	harness.store.attachInputActivityWatcher();

	assert.equal(harness.store.isUserScrollingChannel("chan-1"), false);
	scrollAsUser(harness);
	assert.equal(harness.store.isUserScrollingChannel("chan-1"), true);
	assert.equal(harness.store.isUserScrollingChannel("chan-2"), false);

	harness.dispatchDocument("input", {target: {matches: selector => selector.includes("textarea")}});
	assert.equal(harness.store.getTimeSinceInputActivity(), 0);
	harness.advance(300);
	assert.equal(harness.store.getTimeSinceInputActivity(), 300);
});

test("scroll state survives an idempotent re-attach but is reset by a scroller swap", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	const listenerCount = harness.scroller.listeners.length;
	scrollAsUser(harness);

	harness.store.attachScrollWatcher();
	assert.equal(harness.scroller.listeners.length, listenerCount, "re-attaching to the same scroller must not double up listeners");
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true, "an idempotent attach must not drop the window");

	const previous = harness.replaceScroller();
	harness.store.attachScrollWatcher();
	assert.deepEqual(previous.listenerTypes(), [], "the old scroller must be fully unwired");
	assert.equal(harness.scroller.listeners.length, listenerCount);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false, "a new scroller means a new viewport");
});

test("attaching wires exactly the documented listener set with the documented passivity", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();

	assert.deepEqual(harness.scroller.listenerTypes(), [
		"scroll", "scrollend", "wheel", "touchmove", "pointerdown", "keydown", "pointerup", "pointercancel"
	]);
	const keydown = harness.scroller.listeners.find(entry => entry.type === "keydown");
	assert.deepEqual(keydown.options, {passive: false}, "keydown must stay non-passive so the handler may inspect it");
	for (const type of ["scroll", "scrollend", "wheel", "touchmove", "pointerdown", "pointerup", "pointercancel"]) {
		assert.deepEqual(harness.scroller.listeners.find(entry => entry.type === type).options, {passive: true});
	}
});

test("detaching unwires everything, clears the window and stops pending timers", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	scrollAsUser(harness);
	assert.ok(harness.pendingTimers() > 0);

	harness.store.detachScrollWatcher();

	assert.deepEqual(harness.scroller.listenerTypes(), []);
	assert.equal(harness.pendingTimers(), 0);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
	harness.store.detachScrollWatcher();
	assert.deepEqual(harness.finishedChannels, [], "detaching is not a scroll finish");
});

test("no scroller and no document leave the watcher unattached", () => {
	const withoutScroller = createHarness({scrollerAvailable: false});
	withoutScroller.store.attachScrollWatcher();
	assert.equal(withoutScroller.store.getMessagesScroller(), null);

	const withoutDocument = createHarness({documentAvailable: false});
	withoutDocument.store.attachScrollWatcher();
	assert.equal(withoutDocument.store.getMessagesScroller(), null);
	assert.equal(withoutDocument.store.isChannelTextAreaFocused(), false);
	assert.equal(withoutDocument.store.findMessageElementById(MESSAGE_ID), null);
	assert.equal(withoutDocument.store.captureScrollerState(), null);
});

test("the bottom lock threshold decides between pinning and anchoring", () => {
	const pinned = createHarness({scrollTop: 1120}).store.captureScrollerState();
	assert.equal(pinned.keepBottom, true, "exactly 80px from the bottom still counts as pinned");
	assert.equal(pinned.anchor, null, "a pinned view needs no anchor");

	const scrolled = createHarness({scrollTop: 1119}).store.captureScrollerState();
	assert.equal(scrolled.keepBottom, false);
	assert.equal(scrolled.anchor.messageId, MESSAGE_ID, "a scrolled view is restored by anchor");
});

test("the captured state carries the intent sequence at capture time", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	assert.equal(harness.store.captureScrollerState().userScrollIntentSequence, 0);

	harness.scroller.dispatch("wheel");
	assert.equal(harness.store.captureScrollerState().userScrollIntentSequence, 1);
});

test("a restore is skipped when the user gestured after the capture", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	const state = harness.store.captureScrollerState();
	state.anchor = null;
	state.scrollTop = 300;

	harness.scroller.dispatch("wheel");
	harness.store.restoreScrollerState(state);
	harness.flushFrames();

	assert.deepEqual(harness.scroller.writes, [], "restoring would yank the list away from where the user scrolled it");
});

test("a restore lands when no gesture intervened", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	const state = harness.store.captureScrollerState();
	state.anchor = null;
	state.scrollTop = 300;

	harness.store.restoreScrollerState(state);
	harness.flushFrames();

	assert.deepEqual(harness.scroller.writes, [300]);
});

test("a restore is clamped to the scrollable range", () => {
	const tooFar = createHarness();
	tooFar.store.restoreScrollerState({scrollTop: 5000, keepBottom: false, anchor: null, userScrollIntentSequence: 0});
	tooFar.flushFrames();
	assert.deepEqual(tooFar.scroller.writes, [1200], "clamped to scrollHeight minus clientHeight");

	const negative = createHarness();
	negative.store.restoreScrollerState({scrollTop: -80, keepBottom: false, anchor: null, userScrollIntentSequence: 0});
	negative.flushFrames();
	assert.deepEqual(negative.scroller.writes, [0]);
});

test("a restore waits for a double animation frame and tolerates a missing scroller", () => {
	const harness = createHarness();
	harness.store.restoreScrollerState({scrollTop: 300, keepBottom: false, anchor: null, userScrollIntentSequence: 0});
	harness.flushFrames(1);
	assert.deepEqual(harness.scroller.writes, [], "one frame is not enough; Discord has not laid out yet");
	harness.flushFrames(1);
	assert.deepEqual(harness.scroller.writes, [300]);

	const detached = createHarness({scrollerAvailable: false});
	detached.store.restoreScrollerState({scrollTop: 300, keepBottom: false, anchor: null, userScrollIntentSequence: 0});
	detached.flushFrames();
});

test("restoring nothing is a no-op", () => {
	const harness = createHarness();
	harness.store.restoreScrollerState(null);
	harness.store.restoreAnchorPosition(null);
	harness.store.restoreAnchorState(null);
	assert.equal(harness.pendingFrames(), 0);
	assert.equal(harness.pendingTimers(), 0);
});

test("an anchor restore corrects the drift the reflow introduced and stamps the grace window", () => {
	const harness = createHarness();
	harness.store.attachScrollWatcher();
	const anchor = harness.store.captureAnchorState(MESSAGE_ID);
	assert.equal(anchor.relativeTop, 20);

	harness.messageElements[0].top = 180;
	harness.store.restoreAnchorPosition(anchor);

	assert.deepEqual(harness.scroller.writes, [560], "scrollTop moves by the 60px the message drifted");
	scrollAsUser(harness);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false, "the anchor write opens a grace window too");
});

test("sub-pixel anchor drift is not worth a scroll write", () => {
	const harness = createHarness();
	const anchor = harness.store.captureAnchorState(MESSAGE_ID);

	harness.messageElements[0].top = 120.5;
	harness.store.restoreAnchorPosition(anchor);

	assert.deepEqual(harness.scroller.writes, []);
});

test("an anchor restore re-applies on the full paint ladder", () => {
	const harness = createHarness();
	const anchor = harness.store.captureAnchorState(MESSAGE_ID);
	harness.messageElements[0].top = 180;

	harness.store.restoreAnchorState(anchor);
	harness.flushFrames();
	assert.equal(harness.scroller.writes.length, 1, "the double frame applies it once");

	harness.advance(59);
	assert.equal(harness.scroller.writes.length, 1);
	for (const [index, delay] of [60, 180, 420, 900].entries()) {
		harness.advance(delay - (index === 0 ? 59 : [60, 180, 420, 900][index - 1]));
		assert.equal(harness.scroller.writes.length, index + 2, `the ${delay}ms retry must have run`);
	}
	assert.equal(harness.pendingTimers(), 0);
});

test("an anchor restore for a message that left the DOM is dropped", () => {
	const harness = createHarness();
	const anchor = harness.store.captureAnchorState(MESSAGE_ID);
	harness.messageElements.length = 0;

	harness.store.restoreAnchorPosition(anchor);

	assert.deepEqual(harness.scroller.writes, []);
});

test("the manual translation anchor expires exactly one lock lifetime later", () => {
	const harness = createHarness();
	harness.store.lockManualScroll(MESSAGE_ID);
	assert.equal(harness.store.getActiveManualScrollAnchor().messageId, MESSAGE_ID);

	harness.advance(MANUAL_TRANSLATION_SCROLL_LOCK_MS - 1);
	assert.ok(harness.store.getActiveManualScrollAnchor(), "still protecting the clicked message");

	harness.advance(1);
	assert.equal(harness.store.getActiveManualScrollAnchor(), null);
	assert.equal(harness.pendingTimers(), 0);
});

test("a stale anchor is dropped on read even if its timer never ran", () => {
	const harness = createHarness();
	harness.store.lockManualScroll(MESSAGE_ID);

	harness.jump(MANUAL_TRANSLATION_SCROLL_LOCK_MS + 1);

	assert.equal(harness.store.getActiveManualScrollAnchor(), null, "expiry is enforced on read, not only by the timer");
});

test("locking again replaces the previous lock rather than stacking timers", () => {
	const harness = createHarness();
	harness.store.lockManualScroll(MESSAGE_ID);
	harness.advance(1000);
	harness.store.lockManualScroll(MESSAGE_ID);
	assert.equal(harness.pendingTimers(), 1, "the first lock timer must have been cancelled");

	harness.advance(MANUAL_TRANSLATION_SCROLL_LOCK_MS - 1);
	assert.ok(harness.store.getActiveManualScrollAnchor(), "the lifetime restarts from the newer lock");
	harness.advance(1);
	assert.equal(harness.store.getActiveManualScrollAnchor(), null);
});

test("clearing the lock drops the anchor and its timer at once", () => {
	const harness = createHarness();
	harness.store.lockManualScroll(MESSAGE_ID);

	harness.store.clearManualScrollLock();

	assert.equal(harness.store.getActiveManualScrollAnchor(), null);
	assert.equal(harness.pendingTimers(), 0);
	harness.store.clearManualScrollLock();
});

test("locking is skipped when no anchor can be captured", () => {
	const harness = createHarness({scrollerAvailable: false});
	harness.store.lockManualScroll(MESSAGE_ID);
	assert.equal(harness.store.getActiveManualScrollAnchor(), null);
	assert.equal(harness.pendingTimers(), 0);
});

test("viewing history is the inverse of the bottom lock", () => {
	assert.equal(createHarness({scrollTop: 1120}).store.isViewingMessageHistory(), false);
	assert.equal(createHarness({scrollTop: 1119}).store.isViewingMessageHistory(), true);
	assert.equal(createHarness({scrollerAvailable: false}).store.isViewingMessageHistory(), false, "no scroller is not history");
});

test("a navigation pause holds the window open for the requested duration", () => {
	const harness = createHarness();
	harness.store.pauseForNavigation(1800);

	harness.jump(1799);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true);
	harness.jump(1);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
});

test("a navigation pause schedules its own idle finish", () => {
	const harness = createHarness();
	harness.store.pauseForNavigation(1800);

	harness.advance(1799);
	assert.deepEqual(harness.finishedChannels, []);
	harness.advance(1);
	assert.deepEqual(harness.finishedChannels, ["chan-1"]);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
});

test("a navigation pause shorter than the idle delay still finishes on time", () => {
	const harness = createHarness();
	harness.store.pauseForNavigation(500);

	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), true);
	harness.advance(500);
	assert.equal(harness.store.isUserActivelyScrolling("chan-1"), false);
	assert.deepEqual(harness.finishedChannels, ["chan-1"]);
});

test("a navigation pause with no channel selected schedules nothing", () => {
	const harness = createHarness({selectedChannelId: null});
	harness.store.pauseForNavigation();

	assert.equal(harness.pendingTimers(), 0);
	assert.deepEqual(harness.finishedChannels, []);
});

test("the input activity watcher records typing only from text inputs", () => {
	const harness = createHarness();
	harness.store.attachInputActivityWatcher();
	assert.deepEqual(harness.documentListenerTypes(), ["beforeinput", "input", "keydown"]);
	assert.ok(harness.documentListeners.every(entry => entry.capture === true), "capture phase, so Discord cannot stop it first");

	harness.advance(1000);
	harness.dispatchDocument("keydown", {target: {matches: () => false, closest: () => null}});
	assert.equal(harness.store.getTimeSinceInputActivity(), harness.now(), "a keypress outside an input is not typing, so the timestamp stays unset");

	harness.dispatchDocument("keydown", {target: {matches: () => false, closest: () => ({})}});
	assert.equal(harness.store.getTimeSinceInputActivity(), 0, "typing inside a nested editable counts");

	harness.dispatchDocument("keydown", {});
	harness.dispatchDocument("keydown", {target: {matches() {throw new Error("detached node");}}});
	assert.equal(harness.store.getTimeSinceInputActivity(), 0, "a broken target must not crash the watcher");
});

test("the input activity watcher attaches once and detaches cleanly", () => {
	const harness = createHarness();
	harness.store.attachInputActivityWatcher();
	harness.store.attachInputActivityWatcher();
	assert.equal(harness.documentListeners.length, 3);

	harness.store.detachInputActivityWatcher();
	assert.deepEqual(harness.documentListenerTypes(), []);
	harness.store.detachInputActivityWatcher();

	const withoutDocument = createHarness({documentAvailable: false});
	withoutDocument.store.attachInputActivityWatcher();
	withoutDocument.store.detachInputActivityWatcher();
	assert.deepEqual(withoutDocument.documentListenerTypes(), []);
});

test("channel text area focus is detected through the composer selectors only", () => {
	const harness = createHarness();
	assert.equal(harness.store.isChannelTextAreaFocused(), false, "nothing focused");

	harness.documentRef.activeElement = harness.documentRef.body;
	assert.equal(harness.store.isChannelTextAreaFocused(), false, "the body is not an input");

	harness.documentRef.activeElement = {tagName: "DIV", getAttribute: () => null, isContentEditable: false};
	assert.equal(harness.store.isChannelTextAreaFocused(), false);

	harness.documentRef.activeElement = {tagName: "TEXTAREA", matches: selector => selector === CHANNEL_TEXT_AREA_SELECTOR, closest: () => null};
	assert.equal(harness.store.isChannelTextAreaFocused(), true);

	harness.documentRef.activeElement = {tagName: "SPAN", getAttribute: name => name === "role" ? "textbox" : null, matches: () => false, closest: selector => selector === "form" ? {} : null};
	assert.equal(harness.store.isChannelTextAreaFocused(), true, "the composer is wrapped in a form");

	harness.documentRef.activeElement = {tagName: "INPUT", matches() {throw new Error("bad selector");}, closest() {throw new Error("bad selector");}};
	assert.equal(harness.store.isChannelTextAreaFocused(), false, "a selector failure must not throw at the caller");
});

test("a message id is read from the list item, the label and finally the element id", () => {
	const harness = createHarness();
	const {extractMessageIdFromElement} = harness.store;

	assert.equal(extractMessageIdFromElement(null), null);
	assert.equal(extractMessageIdFromElement(createMessageElement({id: "", listItemId: `chat-messages___chat-messages-${MESSAGE_ID}`})), MESSAGE_ID);
	assert.equal(extractMessageIdFromElement(createMessageElement({id: "", labelledBy: `message-content-${MESSAGE_ID}`})), MESSAGE_ID);
	assert.equal(extractMessageIdFromElement(createMessageElement({messageId: MESSAGE_ID})), MESSAGE_ID);
	assert.equal(extractMessageIdFromElement(createMessageElement({id: "chat-messages-12345"})), null, "a snowflake is at least 15 digits");
	assert.equal(extractMessageIdFromElement(createMessageElement({id: "sidebar"})), null);
});

test("a message element is found by id and promoted to its row wrapper", () => {
	const harness = createHarness({messages: [{messageId: MESSAGE_ID, top: 120}]});
	assert.equal(harness.store.findMessageElementById(MESSAGE_ID), harness.messageElements[0]);
	assert.equal(harness.store.findMessageElementById(OTHER_MESSAGE_ID), null);
	assert.equal(harness.store.findMessageElementById(null), null);

	const row = {id: `chat-messages-${MESSAGE_ID}`};
	const nested = createHarness({messages: [{messageId: null, id: "", labelledBy: `x-${MESSAGE_ID}`, top: 120, parent: row}]});
	assert.equal(nested.store.findMessageElementById(MESSAGE_ID), row, "a hit inside the row resolves to the row");
});

test("selector escaping is delegated so CSS.escape can be used when present", () => {
	const seen = [];
	const harness = createHarness({
		messages: [],
		escapeSelectorValue: value => {
			seen.push(value);
			return value.replace(/(["\\])/g, "\\$1");
		}
	});

	harness.store.findMessageElementById('12"34');

	assert.deepEqual(seen, ['12"34']);
});

test("the visible anchor skips collapsed, unidentified and off-screen messages", () => {
	const harness = createHarness({
		messages: [
			{messageId: OTHER_MESSAGE_ID, top: 40, height: 60},
			{messageId: MESSAGE_ID, top: 30, height: 0},
			{messageId: null, id: "divider", top: 200, height: 30},
			{messageId: MESSAGE_ID, top: 300, height: 40},
			{messageId: OTHER_MESSAGE_ID, top: 895, height: 40}
		]
	});

	const anchor = harness.store.findVisibleMessageAnchor();

	assert.equal(anchor.messageId, MESSAGE_ID, "the first message genuinely overlapping the viewport wins");
	assert.equal(anchor.element, harness.messageElements[3]);
});

test("the visible anchor is null when nothing overlaps the viewport", () => {
	const harness = createHarness({messages: [{messageId: MESSAGE_ID, top: 950, height: 40}]});
	assert.equal(harness.store.findVisibleMessageAnchor(), null);
	assert.equal(harness.store.captureAnchorState(), null, "no anchor means no capture");
});

test("capturing an anchor falls back to the visible message when the id is gone", () => {
	const harness = createHarness({messages: [{messageId: OTHER_MESSAGE_ID, top: 120}]});

	const anchor = harness.store.captureAnchorState(MESSAGE_ID);

	assert.equal(anchor.messageId, OTHER_MESSAGE_ID);
	assert.equal(anchor.scrollTop, 500);
	assert.equal(anchor.relativeTop, 20);
	assert.equal(anchor.expiresAt, harness.now() + MANUAL_TRANSLATION_SCROLL_LOCK_MS);
});

test("the store surface is frozen so nothing can reach past the API", () => {
	const harness = createHarness();
	assert.equal(Object.isFrozen(harness.store), true);
});

test("the manual anchor only rides transactions that contain the anchored message", () => {
	// Regression (2026-08-19, reported on PTB): after 5a wired the manual anchor into
	// every display transaction, automatic history backfill during the 4.5s lock window
	// restored to the anchored message on each flush and bounced the user's scrolling.
	// The anchor is manual-translation UX; it may only ride the anchored message's own
	// transaction, never an unrelated automatic one.
	const harness = createHarness();
	harness.store.lockManualScroll(MESSAGE_ID);
	const own = harness.store.captureDisplayTransactionScrollState({messageIds: [MESSAGE_ID, OTHER_MESSAGE_ID]});
	assert.ok(own && own.manualAnchor, "the manual message's own transaction rides the anchor");
	const unrelated = harness.store.captureDisplayTransactionScrollState({messageIds: [OTHER_MESSAGE_ID]});
	assert.ok(unrelated && !unrelated.manualAnchor, "an automatic transaction for other messages is never hijacked by the anchor");
	assert.equal(typeof unrelated.scrollTop, "number", "the unrelated transaction falls back to the offset capture");
	const contextless = harness.store.captureDisplayTransactionScrollState();
	assert.ok(contextless && !contextless.manualAnchor, "a contextless capture defaults to the offset state");
});
