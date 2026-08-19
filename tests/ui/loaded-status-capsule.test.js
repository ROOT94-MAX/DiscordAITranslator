const test = require("node:test");
const assert = require("node:assert/strict");
const {createLoadedStatusCapsuleController} = require("../../src/ui/loaded-status-capsule");
const {createLoadedTranslationStatusStore} = require("../../src/status/loaded-translation-status-store");

// Contract tests for the capsule controller extracted from the legacy runtime in
// display-unification slice 2. They pin the DOM lifecycle the runtime used to own:
// element creation and removal, the visibility predicate, the retry affordance, the
// position watcher, and teardown. Positioning math stays in loaded-status-position
// and is injected, matching the runtime wiring.

function createFakeDom() {
	const body = {children: [], appendChild(node) {this.children.push(node); node._attached = true;}};
	function createNode(tag) {
		const node = {
			tagName: String(tag).toUpperCase(),
			children: [],
			style: {},
			className: "",
			textContent: "",
			title: "",
			_attached: false,
			appendChild(child) {this.children.push(child);},
			querySelector(selector) {
				// The capsule only queries by class; emulate enough for the update path.
				const wanted = String(selector).replace(/^\./, "");
				const scan = nodes => {
					for (const child of nodes) {
						if (child.className && String(child.className).split(" ").includes(wanted)) return child;
						const nested = scan(child.children || []);
						if (nested) return nested;
					}
					return null;
				};
				return scan(node.children);
			},
			remove() {
				node._attached = false;
				const index = body.children.indexOf(node);
				if (index !== -1) body.children.splice(index, 1);
				documentNodes.delete(node.id);
			}
		};
		// Setting innerHTML replaces the children with the capsule template's two spans,
		// which is all the update path ever assigns.
		let markup = "";
		Object.defineProperty(node, "innerHTML", {
			get: () => markup,
			set: value => {
				markup = String(value);
				node.children.length = 0;
				for (const cls of ["translator-loaded-status-icon", "translator-loaded-status-text"]) {
					const span = createNode("span");
					span.className = cls;
					node.children.push(span);
				}
			}
		});
		return node;
	}
	const documentNodes = new Map();
	const fakeDocument = {
		body,
		createElement: tag => createNode(tag),
		getElementById: id => documentNodes.get(id) || null,
		querySelectorAll: () => []
	};
	// Track ids on append so getElementById works like the real DOM.
	const originalAppend = body.appendChild.bind(body);
	body.appendChild = node => {
		originalAppend(node);
		if (node.id) documentNodes.set(node.id, node);
	};
	return {fakeDocument, body};
}

function createHarness(overrides = {}) {
	const {fakeDocument, body} = createFakeDom();
	const listeners = [];
	const fakeWindow = {
		addEventListener: (...args) => listeners.push(["add", args[0], args[1]]),
		removeEventListener: (...args) => listeners.push(["remove", args[0]])
	};
	// The real store arms refresh/hide timers on raw setTimeout; neuter them so the
	// test process exits. Position scheduling runs synchronously so positionElement
	// calls stay countable. The store may be frozen, so wrap instead of mutating.
	const store = Object.assign({}, createLoadedTranslationStatusStore({isChineseUiLanguage: () => false}), {
		scheduleRefresh: () => {},
		scheduleHide: () => {},
		schedulePosition: callback => callback(),
		cancelTimers: () => {}
	});
	const calls = {retry: [], scroll: 0, tracker: 0, position: 0};
	const controller = createLoadedStatusCapsuleController(Object.assign({
		store,
		getDocument: () => fakeDocument,
		getWindow: () => fakeWindow,
		getSelectedChannelId: () => "channel-1",
		isTranslationEnabled: () => true,
		getReceivedAutoTranslateScope: () => "loaded_messages",
		isChineseUiLanguage: () => false,
		positionElement: () => {calls.position++;},
		attachScrollWatcher: () => {calls.scroll++;},
		onRetry: channelId => {calls.retry.push(channelId); return Promise.resolve(true);},
		clearHistoricalTracker: () => {calls.tracker++;}
	}, overrides));
	return {controller, store, fakeDocument, body, fakeWindow, listeners, calls};
}

function getCapsule(fakeDocument) {
	return fakeDocument.getElementById("DiscordAITranslator-loaded-status");
}

test("an active status in the selected channel creates the floating capsule with its text", () => {
	const {controller, fakeDocument, calls} = createHarness();
	controller.update({active: true, collecting: false, done: false, channelId: "channel-1", total: 5, processed: 2, displayed: 1});
	const capsule = getCapsule(fakeDocument);
	assert.ok(capsule, "the capsule element is created in the body");
	assert.match(capsule.className, /translator-loaded-status-floating/);
	assert.ok(calls.scroll >= 1, "showing the capsule arms the scroll watcher");
});

test("a status for another channel removes the capsule instead of painting it", () => {
	const {controller, fakeDocument} = createHarness();
	controller.update({active: true, channelId: "channel-1", total: 1, processed: 0});
	assert.ok(getCapsule(fakeDocument), "setup: capsule visible in its channel");
	controller.update({active: true, channelId: "channel-2", total: 1, processed: 0});
	assert.equal(getCapsule(fakeDocument), null, "the capsule never paints over an unrelated channel");
});

test("the visibility predicate requires the loaded_messages scope and an enabled channel", () => {
	const {controller} = createHarness({getReceivedAutoTranslateScope: () => "new_messages"});
	assert.equal(controller.shouldShow({active: true, channelId: "channel-1"}), false, "other scopes never show the capsule");
	const {controller: disabledController} = createHarness({isTranslationEnabled: () => false});
	assert.equal(disabledController.shouldShow({active: true, channelId: "channel-1"}), false, "a disabled channel never shows the capsule");
	const {controller: enabledController} = createHarness();
	assert.equal(enabledController.shouldShow({active: true, channelId: "channel-1"}), true);
});

test("a finished status with retryable failures shows the retry button wired to the retry callback", () => {
	const {controller, fakeDocument, calls} = createHarness();
	controller.update({active: false, done: true, channelId: "channel-1", total: 3, processed: 3, retryable: 2, failed: 2});
	const capsule = getCapsule(fakeDocument);
	assert.ok(capsule, "the retryable capsule stays visible");
	assert.match(capsule.className, /translator-loaded-status-retryable/);
	const retryButton = capsule.querySelector(".translator-loaded-status-retry");
	assert.ok(retryButton, "a retry button exists");
	retryButton.onclick({stopPropagation: () => {}});
	assert.deepEqual(calls.retry, ["channel-1"], "clicking retry hands the status channel to the runtime callback");
});

test("an active status without failures carries no retry button", () => {
	const {controller, fakeDocument} = createHarness();
	controller.update({active: true, channelId: "channel-1", total: 3, processed: 1, retryable: 2});
	const capsule = getCapsule(fakeDocument);
	assert.equal(capsule.querySelector(".translator-loaded-status-retry"), null, "retry only appears after the run stops");
});

test("clear removes the element, detaches the watcher, and resets the tracker and store", () => {
	const {controller, fakeDocument, calls, listeners} = createHarness();
	controller.update({active: true, channelId: "channel-1", total: 1, processed: 0});
	assert.ok(getCapsule(fakeDocument), "setup: capsule visible");
	controller.clear();
	assert.equal(getCapsule(fakeDocument), null, "clear removes the capsule element");
	assert.ok(calls.tracker >= 1, "clear resets the historical display tracker");
	const adds = listeners.filter(([kind]) => kind == "add").length;
	const removes = listeners.filter(([kind]) => kind == "remove").length;
	assert.equal(removes >= adds && adds > 0, true, "every attached window listener is detached");
});

test("the position watcher attaches once and detaches cleanly", () => {
	const {controller, listeners} = createHarness();
	controller.ensurePositionWatcher();
	controller.ensurePositionWatcher();
	const adds = listeners.filter(([kind]) => kind == "add");
	assert.equal(adds.length, 2, "resize and scroll listeners attach exactly once each");
	controller.detachPositionWatcher();
	const removes = listeners.filter(([kind]) => kind == "remove");
	assert.equal(removes.length, 2, "detach removes both listeners");
	controller.ensurePositionWatcher();
	assert.equal(listeners.filter(([kind]) => kind == "add").length, 4, "a detached watcher can re-attach");
});

test("skip-reason and title text compose in both ui languages", () => {
	const {controller} = createHarness();
	assert.equal(controller.getSkipReasonText("same_language"), "same target language");
	assert.equal(controller.getSkipReasonText("unknown_reason_key"), "unknown_reason_key", "unknown reasons pass through");
	const {controller: chineseController} = createHarness({isChineseUiLanguage: () => true});
	assert.equal(chineseController.getSkipReasonText("same_language"), "同目标语言");
	const title = controller.getTitleText({active: true, channelId: "channel-1", total: 2, processed: 1, lastSkipReason: "link_only", lastSkipPreview: "https://x"});
	assert.match(title, /Last skipped/);
	assert.match(title, /link-only/);
});

test("an update that changes nothing skips the repaint and the reposition", () => {
	// 2026-08-19 jank report: every render outcome refreshed the capsule even when
	// the numbers were identical, and each refresh forced a reposition (sync layout
	// reads). Identical content must cost nothing.
	const {controller, calls} = createHarness();
	const status = {active: false, done: true, channelId: "channel-1", batch: 1, total: 5, processed: 5, displayed: 5};
	controller.update(status);
	const positionsAfterFirst = calls.position;
	assert.ok(positionsAfterFirst >= 1, "setup: the first paint positions the capsule");
	controller.update(status);
	assert.equal(calls.position, positionsAfterFirst, "identical content repositions nothing");
	controller.update(Object.assign({}, status, {displayed: 4, displayPending: 1}));
	assert.equal(calls.position, positionsAfterFirst + 1, "a real change still repaints and repositions");
});

test("the watcher's reposition waits out an active user scroll and lands once it idles", () => {
	const timers = [];
	let scrolling = true;
	const {controller, calls, listeners} = createHarness({
		isUserScrolling: () => scrolling,
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		clearTimeout: handle => {const timer = timers[handle - 1]; if (timer) timer.fired = true;}
	});
	controller.update({active: true, collecting: false, done: false, channelId: "channel-1", total: 5, processed: 2, displayed: 1});
	const positionsAfterPaint = calls.position;
	const scrollListener = listeners.find(entry => entry[0] == "add" && entry[1] == "scroll");
	assert.ok(scrollListener && typeof scrollListener[2] == "function", "setup: the scroll watcher is attached");
	scrollListener[2]();
	let pending = timers.filter(timer => !timer.fired);
	assert.equal(pending.length, 1, "the scroll event arms one debounced reposition");
	pending[0].fired = true;
	pending[0].callback();
	assert.equal(calls.position, positionsAfterPaint, "mid-scroll the reposition defers instead of forcing layout");
	scrolling = false;
	pending = timers.filter(timer => !timer.fired);
	assert.equal(pending.length, 1, "the deferral re-armed itself");
	pending[0].fired = true;
	pending[0].callback();
	assert.equal(calls.position, positionsAfterPaint + 1, "the reposition lands once the scroll idles");
});

test("recording displayed translations is silent; the heartbeat reveals the new count in one jump", () => {
	// 2026-08-19 report: the batch commit loop fired a capsule repaint per record and
	// the numerator visibly crawled 87, 88, 89... The batch paints atomically, so the
	// counter must too: recording only stores ids, and the next tick (or the batch's
	// own status update) shows the total in one step.
	const {controller, store, calls, fakeDocument} = createHarness();
	controller.update({active: true, collecting: false, done: false, channelId: "channel-1", batch: 1, total: 20, processed: 0, displayed: 0});
	const positionsAfterPaint = calls.position;
	for (let index = 0; index < 20; index++) controller.recordTranslationsDisplayed("channel-1", [`m${index}`]);
	assert.equal(calls.position, positionsAfterPaint, "twenty recordings repaint nothing");
	controller.update({});
	const text = getCapsule(fakeDocument).querySelector(".translator-loaded-status-text");
	assert.match(text.textContent, /^20\//, "the next tick shows all twenty in one jump");
	assert.equal(store.getStatus().sessionDisplayed, 20, "the ids were recorded silently");
});

test("a stopped plugin instance cannot resurrect the capsule or re-arm its heartbeat", () => {
	// The "old capsule residue" root cause (2026-08-19 Σ-format sighting): after a
	// plugin hot reload, a late async callback on the DEAD instance (a provider chunk
	// answering, a job completing) called update(), which recreated the shared element
	// and re-armed the 1s refresh unconditionally - the dead instance then repainted
	// the capsule with its OLD text renderer every second. And because the LIVE
	// instance stops watching the element once its own capsule hides, the stale pill
	// lingered on screen. A stopped instance must remove and stand down instead.
	let runtimeActive = true;
	let rearmed = 0;
	let cancelled = 0;
	const store = Object.assign({}, createLoadedTranslationStatusStore({isChineseUiLanguage: () => false}), {
		scheduleRefresh: () => {rearmed++;},
		scheduleHide: () => {},
		schedulePosition: callback => callback(),
		cancelTimers: () => {cancelled++;}
	});
	const {controller, fakeDocument} = createHarness({store, isRuntimeActive: () => runtimeActive});
	controller.update({active: true, channelId: "channel-1", total: 5, processed: 1});
	assert.ok(getCapsule(fakeDocument), "setup: the capsule shows while the runtime is active");
	const rearmedWhileActive = rearmed;

	runtimeActive = false;
	controller.update({active: true, done: false, channelId: "channel-1", total: 13, processed: 5});

	assert.equal(getCapsule(fakeDocument), null, "a post-stop update removes the capsule instead of repainting it");
	assert.equal(rearmed, rearmedWhileActive, "a post-stop update must never re-arm the refresh heartbeat");
	assert.ok(cancelled >= 1, "a post-stop update cancels whatever timers were still pending");
});

test("the runtime hands the capsule controller its runtime-active gate", () => {
	const fs = require("node:fs");
	const path = require("node:path");
	const runtime = fs.readFileSync(path.resolve(__dirname, "..", "..", "src", "legacy", "runtime.js"), "utf8");
	const start = runtime.indexOf("createLoadedStatusCapsuleController({");
	assert.notEqual(start, -1, "controller construction not found");
	const end = runtime.indexOf("});", start);
	const block = runtime.slice(start, end);
	assert.match(block, /isRuntimeActive: \(\) => pluginRuntimeActive/, "the capsule pipeline must be gated on the live plugin instance");
});
