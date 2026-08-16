const test = require("node:test");
const assert = require("node:assert/strict");
const {createHarness} = require("../helpers/createReceivedDisplayHarness");

// The adapter repaints through BDFDB.MessageUtils.rerenderAll (the only mechanism the
// 2026-08-13 real-client evidence proved working). The runtime narrows the BDFDB it
// injects into the display runtime, so this contract pins the wiring: a mounted row
// must repaint through the injected MessageUtils, not through a BDFDB the adapter
// never received. A missing injection is silently swallowed by the scheduler's
// catch, which is exactly the false-green this test exists to prevent.
test("a committed translation repaints the chat through the injected rerenderAll", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-refresh-wiring";
		plugin.isViewingMessageHistory = () => false;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");

		await new Promise(resolve => setTimeout(resolve, 400));

		assert.equal(calls.rerenderAll, 1, "the mounted row must repaint through BDFDB.MessageUtils.rerenderAll");
		assert.equal(plugin.getReceivedDisplayView("m1").renderStatus, "confirmed", "the repainted row must acknowledge its revision");
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});

test("a virtualised-only commit never asks for a chat rebuild", async () => {
	const harness = createHarness({mountedMessageIds: []});
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-refresh-wiring-virtualised";
		plugin.isViewingMessageHistory = () => false;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");

		await new Promise(resolve => setTimeout(resolve, 400));

		assert.equal(calls.rerenderAll, 0, "absent rows must paint from the store on mount, not force a rebuild");
		assert.equal(plugin.getReceivedDisplayView("m1").renderStatus !== "unconfirmed", true, "an absent row stays deferred, never a visible failure");
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});
