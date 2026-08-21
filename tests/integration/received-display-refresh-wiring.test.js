const test = require("node:test");
const assert = require("node:assert/strict");
const {createHarness} = require("../helpers/createReceivedDisplayHarness");

// Ordinary translations repaint through the Store dispatcher verified on the current
// client. The harness pins the complete wiring so a source-only unit test cannot hide
// a missing dispatcher and let the adapter drift back to whole-chat reconstruction.
test("a committed translation repaints its mounted row through the injected Store dispatcher", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-refresh-wiring";
		plugin.isViewingMessageHistory = () => false;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");

		await new Promise(resolve => setTimeout(resolve, 400));

		assert.equal(calls.messageUpdates, 1, "the mounted row gets one synthetic MESSAGE_UPDATE");
		assert.equal(calls.rerenderAll, 0, "ordinary display never remounts the Composer");
		assert.equal(plugin.getReceivedDisplayView("m1").renderStatus, "confirmed", "the repainted row must acknowledge its revision");
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});

test("a legacy full repaint rebuilds the chat through MessageUtils instead of forceAllUpdates", async () => {
	// Manual translate/untranslate and several restore paths still schedule the legacy
	// full repaint. Its old primitive, PatchUtils.forceAllUpdates, is a measured no-op
	// on this client (same family as the forceUpdate strategies the probe disproved),
	// which left manual translations invisible until a channel switch. The legacy
	// repaint must use the same rebuild primitive the adapter already proved.
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const rebuildsBefore = calls.rerenderAll;

		plugin.scheduleTranslationRerender();
		await new Promise(resolve => setTimeout(resolve, 30));

		assert.equal(calls.rerenderAll, rebuildsBefore + 1, "the legacy full repaint must rebuild the chat");
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

test("a flush lane travels end to end without booking a whole-chat rebuild", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-attribution";
		plugin.isViewingMessageHistory = () => false;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1", null, null, "cached");

		await new Promise(resolve => setTimeout(resolve, 400));

		const stats = plugin.ensureReceivedDisplayRuntime().getRebuildStats();
		assert.equal(calls.messageUpdates, 1);
		assert.equal(stats.live, 1, "the targeted transaction is acknowledged once");
		assert.equal(stats.rebuild, 0);
		assert.deepEqual(stats.rebuildsBySource, {});
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});
