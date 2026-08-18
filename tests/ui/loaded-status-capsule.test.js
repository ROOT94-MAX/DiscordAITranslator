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
		addEventListener: (...args) => listeners.push(["add", args[0]]),
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
