const test = require("node:test");
const assert = require("node:assert/strict");
const {
	createPluginLoadedStatusCapsuleController,
	positionPluginLoadedStatusElement
} = require("../../src/ui/loaded-status-capsule-wiring");

test("loaded-status capsule wiring creates the controller with the complete dependency contract", () => {
	const calls = [];
	const controller = {tag: "loaded-status-capsule"};
	const store = {tag: "loaded-status-store"};
	const historicalTracker = {clear: () => calls.push(["clearHistoricalTracker"])};
	const plugin = {
		isTranslationEnabled: channelId => (calls.push(["isTranslationEnabled", channelId]), true),
		getReceivedAutoTranslateScope: () => (calls.push(["getReceivedAutoTranslateScope"]), "loaded_messages"),
		isChineseUiLanguage: () => (calls.push(["isChineseUiLanguage"]), true),
		positionLoadedAutoTranslationStatusElement: element => calls.push(["positionElement", element]),
		isUserActivelyScrollingMessages: () => (calls.push(["isUserScrolling"]), false),
		attachAutoTranslationScrollWatcher: () => calls.push(["attachScrollWatcher"]),
		ensureLoadedAutoTranslationStatusPositionWatcher: () => calls.push(["ensurePositionWatcher"]),
		removeLoadedAutoTranslationStatusElement: () => calls.push(["removeElement"]),
		updateInlineLoadedAutoTranslationStatusElements: () => calls.push(["updateInlineElements"]),
		retryFailedHistoricalTranslations: channelId => (calls.push(["onRetry", channelId]), "retry-result")
	};
	const BDFDB = {LibraryStores: {SelectedChannelStore: {getChannelId: () => "channel-selected"}}};
	let captured = null;

	const result = createPluginLoadedStatusCapsuleController({
		plugin,
		BDFDB,
		store,
		getRuntimeActive: () => false,
		clearHistoricalTracker: () => historicalTracker.clear(),
		createController: options => (captured = options, controller)
	});

	assert.equal(result, controller);
	assert.equal(captured.store, store);
	assert.equal(captured.getSelectedChannelId(), "channel-selected");
	assert.equal(captured.isTranslationEnabled("channel-a"), true);
	assert.equal(captured.getReceivedAutoTranslateScope(), "loaded_messages");
	assert.equal(captured.isChineseUiLanguage(), true);
	assert.equal(captured.isUserScrolling(), false);
	assert.equal(captured.isRuntimeActive(), false);
	captured.clearHistoricalTracker();
	const element = {id: "capsule"};
	captured.positionElement(element);
	captured.hooks.attachScrollWatcher();
	captured.hooks.ensurePositionWatcher();
	captured.hooks.removeElement();
	captured.hooks.updateInlineElements();
	captured.hooks.positionElement(element);
	assert.equal(captured.hooks.onRetry("channel-a"), "retry-result");
	assert.deepEqual(calls, [
		["isTranslationEnabled", "channel-a"],
		["getReceivedAutoTranslateScope"],
		["isChineseUiLanguage"],
		["isUserScrolling"],
		["clearHistoricalTracker"],
		["positionElement", element],
		["attachScrollWatcher"],
		["ensurePositionWatcher"],
		["removeElement"],
		["updateInlineElements"],
		["positionElement", element],
		["onRetry", "channel-a"]
	]);
});

test("loaded-status position wiring supplies the established BDFDB and browser envelope", () => {
	const BDFDB = {tag: "BDFDB"};
	const document = {tag: "document"};
	const window = {tag: "window"};
	const element = {tag: "element"};
	let captured = null;

	const result = positionPluginLoadedStatusElement({
		BDFDB,
		element,
		getDocument: () => document,
		getWindow: () => window,
		positionLoadedStatusElement: options => (captured = options, "positioned")
	});

	assert.equal(result, "positioned");
	assert.deepEqual(captured, {BDFDB, document, window, element});
});
