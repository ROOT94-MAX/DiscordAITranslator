const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginMessageViewportStore} = require("../src/viewport/message-viewport-wiring");

function createFixture() {
	const calls = [];
	const timer = {id: "viewport-timer"};
	const documentRef = {name: "document"};
	const plugin = {
		finishHistoricalTranslationSnapshot: channelId => (calls.push(["finishHistoricalTranslationSnapshot", channelId]), `finished:${channelId}`)
	};
	const BDFDB = {
		TimeUtils: {
			timeout: (callback, delay) => (calls.push(["setTimeout", callback, delay]), timer),
			clear: value => calls.push(["clearTimeout", value])
		},
		LibraryStores: {
			SelectedChannelStore: {
				getChannelId: () => (calls.push(["getSelectedChannelId"]), "channel-1")
			}
		},
		dotCN: {messagesscroller: ".messages-scroller"}
	};
	const getDocument = () => (calls.push(["getDocument"]), documentRef);
	const requestAnimationFrame = callback => (calls.push(["requestAnimationFrame", callback]), "frame-result");
	const escapeSelectorValue = value => (calls.push(["escapeSelectorValue", value]), `escaped:${value}`);
	let dependencies = null;
	const store = {tag: "message-viewport-store"};
	const created = createPluginMessageViewportStore({
		plugin,
		BDFDB,
		getDocument,
		requestAnimationFrame,
		now: () => 789,
		escapeSelectorValue,
		createStore: input => (dependencies = input, store)
	});
	return {plugin, BDFDB, calls, timer, documentRef, dependencies, store, created};
}

test("message viewport wiring creates the store with the complete dependency contract", () => {
	const fixture = createFixture();

	assert.equal(fixture.created, fixture.store);
	assert.deepEqual(Object.keys(fixture.dependencies).sort(), [
		"clearTimeout",
		"escapeSelectorValue",
		"getDocument",
		"getMessagesScrollerSelector",
		"getSelectedChannelId",
		"now",
		"onScrollActivityFinished",
		"requestAnimationFrame",
		"setTimeout"
	].sort());
	assert.equal(fixture.dependencies.now(), 789);
});

test("message viewport wiring keeps document, timers, animation frames and selectors on their established seams", () => {
	const fixture = createFixture();
	const callback = () => {};

	assert.equal(fixture.dependencies.getDocument(), fixture.documentRef);
	assert.equal(fixture.dependencies.setTimeout(callback, 900), fixture.timer);
	fixture.dependencies.clearTimeout(fixture.timer);
	assert.equal(fixture.dependencies.requestAnimationFrame(callback), "frame-result");
	assert.equal(fixture.dependencies.getSelectedChannelId(), "channel-1");
	assert.equal(fixture.dependencies.getMessagesScrollerSelector(), ".messages-scroller");
	assert.equal(fixture.dependencies.escapeSelectorValue('message"1'), 'escaped:message"1');

	assert.deepEqual(fixture.calls, [
		["getDocument"],
		["setTimeout", callback, 900],
		["clearTimeout", fixture.timer],
		["requestAnimationFrame", callback],
		["getSelectedChannelId"],
		["escapeSelectorValue", 'message"1']
	]);
});

test("message viewport wiring delegates scroll-idle completion to the historical snapshot owner", () => {
	const fixture = createFixture();

	assert.equal(fixture.dependencies.onScrollActivityFinished("channel-1"), "finished:channel-1");
	assert.deepEqual(fixture.calls, [["finishHistoricalTranslationSnapshot", "channel-1"]]);
});
