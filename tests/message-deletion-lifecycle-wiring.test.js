const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginMessageDeletionLifecycle} = require("../src/lifecycle/message-deletion-lifecycle-wiring");

function createFixture() {
	const calls = [];
	const historicalQueue = {jobs: []};
	const failedSnapshot = {items: []};
	const dispatcher = {tag: "dispatcher"};
	const liveQueue = {
		removeMessage: (messageId, channelId) => (calls.push(["removeLiveMessage", messageId, channelId]), true),
		clearHistoricalQueuedMessage: (messageId, jobId) => calls.push(["clearHistoricalMarker", messageId, jobId])
	};
	const registry = {
		getFailedSnapshot: channelId => (calls.push(["getFailedSnapshot", channelId]), failedSnapshot),
		setFailedSnapshot: (channelId, snapshot) => calls.push(["setFailedSnapshot", channelId, snapshot]),
		deleteFailedSnapshot: channelId => calls.push(["deleteFailedSnapshot", channelId])
	};
	const displayRuntime = {
		deleteMessage: (messageId, channelId) => (calls.push(["deleteDisplayMessage", messageId, channelId]), Promise.resolve({deleted: true}))
	};
	const plugin = {
		ensureLiveTranslationQueue: () => liveQueue,
		getHistoricalTranslationJobQueue: (channelId, create) => (calls.push(["getHistoricalQueue", channelId, create]), historicalQueue),
		ensureHistoricalJobRegistry: () => registry,
		hasCachedTranslationEntry: messageId => (calls.push(["hasCachedTranslation", messageId]), true),
		clearCachedTranslation: messageId => calls.push(["clearCachedTranslation", messageId]),
		ensureReceivedDisplayRuntime: () => displayRuntime
	};
	const resolveDispatcher = () => (calls.push(["resolveDispatcher"]), dispatcher);
	let dependencies = null;
	const lifecycle = {tag: "message-deletion-lifecycle"};
	const created = createPluginMessageDeletionLifecycle({
		plugin,
		BDFDB: {},
		resolveDispatcher,
		createLifecycle: input => (dependencies = input, lifecycle)
	});
	return {plugin, calls, historicalQueue, failedSnapshot, dispatcher, dependencies, lifecycle, created};
}

test("message deletion wiring creates the lifecycle with the complete dependency contract", () => {
	const fixture = createFixture();

	assert.equal(fixture.created, fixture.lifecycle);
	assert.deepEqual(Object.keys(fixture.dependencies).sort(), [
		"clearCachedTranslation",
		"clearHistoricalMarker",
		"deleteDisplayMessage",
		"deleteFailedSnapshot",
		"getFailedSnapshot",
		"getHistoricalQueue",
		"hasCachedTranslation",
		"removeLiveMessage",
		"resolveDispatcher",
		"setFailedSnapshot"
	].sort());
});

test("message deletion wiring delegates every channel cleanup owner without changing arguments", async () => {
	const fixture = createFixture();
	const replacement = {items: [{message: {id: "m2"}}]};

	assert.equal(fixture.dependencies.removeLiveMessage("m1", "c1"), true);
	assert.equal(fixture.dependencies.getHistoricalQueue("c1"), fixture.historicalQueue);
	assert.equal(fixture.dependencies.getFailedSnapshot("c1"), fixture.failedSnapshot);
	fixture.dependencies.setFailedSnapshot("c1", replacement);
	fixture.dependencies.deleteFailedSnapshot("c1");
	fixture.dependencies.clearHistoricalMarker("m1", "job-1");
	assert.equal(fixture.dependencies.hasCachedTranslation("m1"), true);
	fixture.dependencies.clearCachedTranslation("m1");
	assert.deepEqual(await fixture.dependencies.deleteDisplayMessage("m1", "c1"), {deleted: true});
	assert.equal(fixture.dependencies.resolveDispatcher(), fixture.dispatcher);

	assert.deepEqual(fixture.calls, [
		["removeLiveMessage", "m1", "c1"],
		["getHistoricalQueue", "c1", false],
		["getFailedSnapshot", "c1"],
		["setFailedSnapshot", "c1", replacement],
		["deleteFailedSnapshot", "c1"],
		["clearHistoricalMarker", "m1", "job-1"],
		["hasCachedTranslation", "m1"],
		["clearCachedTranslation", "m1"],
		["deleteDisplayMessage", "m1", "c1"],
		["resolveDispatcher"]
	]);
});
