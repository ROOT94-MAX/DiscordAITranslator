const test = require("node:test");
const assert = require("node:assert/strict");
const {createHistoricalJobRegistry} = require("../src/orchestrator/historical-job-registry");

test("a queue is created on demand and only when asked for", () => {
	const registry = createHistoricalJobRegistry();

	assert.equal(registry.getQueue("c1", false), null, "asking about an unknown channel must not allocate");
	assert.equal(registry.hasQueue("c1"), false);

	const entry = registry.getQueue("c1");
	assert.equal(entry.channelId, "c1");
	assert.deepEqual(entry.jobs, []);
	assert.equal(registry.getQueue("c1"), entry, "the same entry is returned on re-entry");
	assert.equal(registry.hasQueue("c1"), true);
});

test("a superseded queue entry is no longer current", () => {
	const registry = createHistoricalJobRegistry();
	const first = registry.getQueue("c1");

	assert.equal(registry.isCurrentQueue("c1", first), true);
	registry.deleteQueue("c1");
	assert.equal(registry.isCurrentQueue("c1", first), false, "a deleted entry must not pass the currency check");

	const second = registry.getQueue("c1");
	assert.notEqual(second, first);
	assert.equal(registry.isCurrentQueue("c1", first), false, "a replaced entry stays stale");
	assert.equal(registry.isCurrentQueue("c1", second), true);
});

test("job ids are unique per registry and carry their channel", () => {
	const registry = createHistoricalJobRegistry();

	const first = registry.nextJobId("c1");
	const second = registry.nextJobId("c1");
	const other = registry.nextJobId("c2");

	assert.match(first, /^c1:\d+$/);
	assert.notEqual(first, second);
	assert.match(other, /^c2:\d+$/);
	assert.equal(new Set([first, second, other]).size, 3);
});

test("advancing the runtime generation is how a bulk cancel makes jobs stale", () => {
	const registry = createHistoricalJobRegistry();
	const before = registry.getRuntimeGeneration();

	assert.equal(registry.advanceRuntimeGeneration(), before + 1);
	assert.equal(registry.getRuntimeGeneration(), before + 1);
});

test("failed snapshots are channel scoped and independently clearable", () => {
	const registry = createHistoricalJobRegistry();
	registry.setFailedSnapshot("c1", {channelId: "c1", items: [{id: "m1"}], updatedAt: 1});
	registry.setFailedSnapshot("c2", {channelId: "c2", items: [{id: "m2"}], updatedAt: 2});

	assert.equal(registry.getFailedSnapshot("c1").items.length, 1);
	assert.equal(registry.deleteFailedSnapshot("c1"), true);
	assert.equal(registry.getFailedSnapshot("c1"), null);
	assert.equal(registry.getFailedSnapshot("c2").items.length, 1, "other channels are untouched");

	registry.clearFailedSnapshots();
	assert.equal(registry.getFailedSnapshot("c2"), null);
});

test("a matching failed message stays parked until its configuration or retry intent changes", () => {
	const registry = createHistoricalJobRegistry();
	registry.setFailedSnapshot("c1", {
		channelId: "c1",
		items: [
			{message: {id: "m1"}, signature: "sig-a"},
			{message: {id: "legacy"}}
		]
	});

	assert.equal(registry.hasFailedMessage("c1", "m1", "sig-a"), true);
	assert.equal(registry.hasFailedMessage("c1", "m1", "sig-b"), false, "an edited or reconfigured message may enter as new work");
	assert.equal(registry.hasFailedMessage("c1", "legacy", "any"), true, "a legacy snapshot without a signature remains parked");
	assert.equal(registry.hasFailedMessage("c2", "m1", "sig-a"), false);
	assert.equal(registry.hasFailedMessage("c1", "missing", "sig-a"), false);
});

test("listQueues sees every live channel and clearQueues empties them", () => {
	const registry = createHistoricalJobRegistry();
	registry.getQueue("c1");
	registry.getQueue("c2");

	assert.deepEqual(registry.listQueues().map(entry => entry.channelId).sort(), ["c1", "c2"]);
	registry.clearQueues();
	assert.deepEqual(registry.listQueues(), []);
});
