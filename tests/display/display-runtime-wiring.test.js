const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginReceivedDisplayRuntime} = require("../../src/display/display-runtime-wiring");

function createHarness() {
	const calls = [];
	const runtime = {tag: "received-display-runtime"};
	const dispatcher = {dispatch() {}};
	const message = {id: "message-a"};
	const channel = {id: "channel-a", guild_id: "guild-a"};
	const document = {querySelector: selector => (calls.push(["querySelector", selector]), {selector})};
	const viewport = {
		getUserScrollIntentSequence: () => (calls.push(["getUserScrollIntentSequence"]), 17),
		findVisibleMessageAnchor: () => (calls.push(["findVisibleMessageAnchor"]), {messageId: "message-anchor"}),
		captureDisplayTransactionScrollState: context => (calls.push(["captureScrollState", context]), {context}),
		restoreDisplayTransactionScrollState: state => calls.push(["restoreScrollState", state]),
		restoreDisplayTransactionScrollStateNow: state => (calls.push(["restoreScrollStateNow", state]), "restored-now")
	};
	const capsule = {recordTranslationsDisplayed: (channelId, messageIds) => calls.push(["recordTranslationsDisplayed", channelId, messageIds])};
	const plugin = {
		canRepaintReceivedDisplayNow: () => (calls.push(["canRepaintNow"]), true),
		ensureLoadedStatusCapsuleController: () => capsule,
		ensureMessageViewportStore: () => viewport
	};
	const BDFDB = {
		dotCN: {messages: ".messages"},
		MessageUtils: {rerenderAll() {}},
		ReactUtils: {flushSync() {}},
		TimeUtils: {timeout: (callback, delay) => (calls.push(["setTimeout", callback, delay]), "managed-timer")},
		LibraryStores: {
			MessageStore: {getMessage: (channelId, messageId) => (calls.push(["getStoreMessage", channelId, messageId]), message)},
			ChannelStore: {getChannel: channelId => (calls.push(["getChannel", channelId]), channel)}
		}
	};
	let captured = null;
	const result = createPluginReceivedDisplayRuntime({
		plugin,
		BDFDB,
		getRuntimeActive: () => false,
		getDocument: () => document,
		requestAnimationFrame: callback => (calls.push(["requestAnimationFrame", callback]), "animation-frame"),
		resolveDispatcher: () => (calls.push(["resolveDispatcher"]), dispatcher),
		createRuntime: options => (captured = options, runtime)
	});
	return {result, runtime, captured, calls, dispatcher, message, channel, document, viewport, capsule, plugin, BDFDB};
}

test("received display wiring creates the runtime with the complete host and plugin contract", () => {
	const harness = createHarness();
	const {captured, calls, dispatcher, message, BDFDB} = harness;
	assert.equal(harness.result, harness.runtime);
	assert.deepEqual(captured.BDFDB, {dotCN: BDFDB.dotCN, MessageUtils: BDFDB.MessageUtils, ReactUtils: BDFDB.ReactUtils});
	assert.deepEqual(captured.document.querySelector(".message"), {selector: ".message"});
	assert.equal(captured.document.querySelector(""), null);
	const callback = () => {};
	assert.equal(captured.requestAnimationFrame(callback), "animation-frame");
	assert.equal(captured.isRuntimeActive(), false);
	assert.equal(captured.setTimeout(callback, 120), "managed-timer");
	assert.equal(captured.canRepaintNow(), true);
	assert.equal(captured.resolveDispatcher(), dispatcher);
	assert.equal(captured.getStoreMessage("channel-a", "message-a"), message);
	assert.equal(captured.getGuildId("channel-a"), "guild-a");
	assert.equal(captured.getChannelProjectionMessageId("channel-a"), "message-anchor");
	captured.onTranslationDisplayed("channel-a", "message-a");
	assert.equal(captured.getUserScrollIntentSequence(), 17);
	assert.deepEqual(captured.captureScrollState("capture-context"), {context: "capture-context"});
	captured.restoreScrollState("scroll-state");
	assert.equal(captured.restoreScrollStateNow("scroll-now"), "restored-now");
	assert.deepEqual(calls.filter(call => call[0] !== "querySelector"), [
		["requestAnimationFrame", callback],
		["setTimeout", callback, 120],
		["canRepaintNow"],
		["resolveDispatcher"],
		["getStoreMessage", "channel-a", "message-a"],
		["getChannel", "channel-a"],
		["findVisibleMessageAnchor"],
		["recordTranslationsDisplayed", "channel-a", ["message-a"]],
		["getUserScrollIntentSequence"],
		["captureScrollState", "capture-context"],
		["restoreScrollState", "scroll-state"],
		["restoreScrollStateNow", "scroll-now"]
	]);
});

test("received display wiring contains Store and best-effort scroll adapter failures", () => {
	const harness = createHarness();
	harness.BDFDB.LibraryStores.MessageStore.getMessage = () => {throw new Error("message store unavailable");};
	harness.BDFDB.LibraryStores.ChannelStore.getChannel = () => {throw new Error("channel store unavailable");};
	harness.viewport.captureDisplayTransactionScrollState = () => {throw new Error("capture unavailable");};
	harness.viewport.restoreDisplayTransactionScrollState = () => {throw new Error("restore unavailable");};
	harness.viewport.findVisibleMessageAnchor = () => {throw new Error("anchor unavailable");};

	assert.equal(harness.captured.getStoreMessage("channel-a", "message-a"), null);
	assert.equal(harness.captured.getGuildId("channel-a"), null);
	assert.equal(harness.captured.getChannelProjectionMessageId("channel-a"), null);
	assert.equal(harness.captured.captureScrollState("capture-context"), null);
	assert.doesNotThrow(() => harness.captured.restoreScrollState("scroll-state"));
});
