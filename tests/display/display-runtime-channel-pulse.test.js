const test = require("node:test");
const assert = require("node:assert/strict");
const {createDisplayRuntime} = require("../../src/display/display-runtime");

function createHarness(overrides = {}) {
	const payloads = [];
	const storeReads = [];
	const scrollCalls = [];
	const scroller = {tag: "message-scroller"};
	const runtime = createDisplayRuntime({
		BDFDB: {dotCN: {messagesscroller: ".message-scroller"}, MessageUtils: {}, ReactUtils: {}},
		document: {querySelector: selector => selector == ".message-scroller" ? scroller : null},
		requestAnimationFrame: callback => callback(),
		onTranslationDisplayed: () => {},
		getUserScrollIntentSequence: () => 7,
		captureScrollState: context => (scrollCalls.push(["capture", context]), {anchor: "message-anchor"}),
		restoreScrollStateNow: state => scrollCalls.push(["restore-now", state]),
		restoreScrollState: state => scrollCalls.push(["restore", state]),
		resolveDispatcher: () => ({dispatch: payload => payloads.push(payload)}),
		getStoreMessage: (channelId, messageId) => {
			storeReads.push([channelId, messageId]);
			return {id: messageId, channel_id: channelId, content: "source"};
		},
		getGuildId: () => "guild-1",
		getChannelProjectionMessageId: () => "message-anchor",
		...overrides
	});
	return {runtime, payloads, storeReads, scrollCalls};
}

test("channel projection pulse dispatches one mounted Store row without rebuilding chat", () => {
	const harness = createHarness();

	assert.equal(harness.runtime.pulseChannelProjection("channel-1"), true);
	assert.deepEqual(harness.storeReads, [["channel-1", "message-anchor"]]);
	assert.equal(harness.payloads.length, 1);
	assert.deepEqual(harness.payloads[0], {
		type: "MESSAGE_UPDATE",
		guildId: "guild-1",
		message: {id: "message-anchor", channel_id: "channel-1", guild_id: "guild-1", content: "source"},
		__translatorSynthetic: true
	});
	assert.deepEqual(harness.scrollCalls, [
		["capture", {messageIds: ["message-anchor"], channelId: "channel-1", lifecycle: true}],
		["restore-now", {anchor: "message-anchor"}],
		["restore", {anchor: "message-anchor"}]
	]);
});

test("channel projection pulse stays deferred when there is no mounted Store row", () => {
	const withoutAnchor = createHarness({getChannelProjectionMessageId: () => null});
	assert.equal(withoutAnchor.runtime.pulseChannelProjection("channel-1"), false);
	assert.deepEqual(withoutAnchor.storeReads, []);
	assert.deepEqual(withoutAnchor.payloads, []);
	assert.deepEqual(withoutAnchor.scrollCalls, []);

	const withoutRecord = createHarness({getStoreMessage: () => null});
	assert.equal(withoutRecord.runtime.pulseChannelProjection("channel-1"), false);
	assert.deepEqual(withoutRecord.payloads, []);
});
