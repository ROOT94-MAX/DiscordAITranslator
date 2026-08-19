const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageDeletionLifecycle} = require("../src/lifecycle/message-deletion-lifecycle");

function createHarness() {
	const failedSnapshots = new Map();
	const jobsByChannel = new Map();
	const calls = {live: [], markers: [], cache: [], display: []};
	const lifecycle = createMessageDeletionLifecycle({
		removeLiveMessage: (messageId, channelId) => {calls.live.push([messageId, channelId]); return true;},
		getHistoricalQueue: channelId => jobsByChannel.get(channelId) || null,
		getFailedSnapshot: channelId => failedSnapshots.get(channelId) || null,
		setFailedSnapshot: (channelId, snapshot) => failedSnapshots.set(channelId, snapshot),
		deleteFailedSnapshot: channelId => failedSnapshots.delete(channelId),
		clearHistoricalMarker: (messageId, jobId) => calls.markers.push([messageId, jobId]),
		hasCachedTranslation: () => true,
		clearCachedTranslation: messageId => calls.cache.push(messageId),
		deleteDisplayMessage: (messageId, channelId) => {calls.display.push([messageId, channelId]); return Promise.resolve({deleted: true});}
	});
	return {lifecycle, failedSnapshots, jobsByChannel, calls};
}

function createDispatcher() {
	const subscriptions = new Map();
	const calls = {subscribe: [], unsubscribe: []};
	return {
		subscriptions,
		calls,
		subscribe(type, handler) {
			calls.subscribe.push([type, handler]);
			subscriptions.set(type, handler);
		},
		unsubscribe(type, handler) {
			calls.unsubscribe.push([type, handler]);
			if (subscriptions.get(type) === handler) subscriptions.delete(type);
		}
	};
}

test("the extracted deletion lifecycle owns historical cleanup and bulk action normalization", async () => {
	const harness = createHarness();
	const records = new Map([["m1", {status: "pending"}], ["m2", {status: "pending"}]]);
	const job = {
		id: "job-1",
		items: records,
		invalidateMessage(messageId, reason) {
			const record = records.get(messageId);
			if (!record) return false;
			record.status = "cancelled";
			record.reason = reason;
			return true;
		}
	};
	harness.jobsByChannel.set("c1", {jobs: [job]});
	harness.failedSnapshots.set("c1", {channelId: "c1", items: [{message: {id: "m1"}}, {message: {id: "m2"}}]});

	const outcomes = await harness.lifecycle.handleAction({type: "MESSAGE_DELETE_BULK", channel_id: "c1", message_ids: ["m1", "m2", "m2"]});

	assert.equal(outcomes.length, 2, "duplicate ids are normalized before cleanup");
	assert.equal(records.get("m1").reason, "source-deleted");
	assert.equal(records.get("m2").reason, "source-deleted");
	assert.equal(harness.failedSnapshots.has("c1"), false);
	assert.deepEqual(harness.calls.live, [["m1", "c1"], ["m2", "c1"]]);
	assert.deepEqual(harness.calls.markers, [["m1", "job-1"], ["m2", "job-1"]]);
	assert.deepEqual(harness.calls.cache, ["m1", "m2"]);
	assert.deepEqual(harness.calls.display, [["m1", "c1"], ["m2", "c1"]]);
	assert.equal(await harness.lifecycle.handleAction({type: "MESSAGE_CREATE", channelId: "c1", id: "m3"}), false);
});

test("the deletion lifecycle subscribes directly once and stop removes the exact handlers", async () => {
	const dispatcher = createDispatcher();
	const harness = createHarness();
	const lifecycle = createMessageDeletionLifecycle({
		removeLiveMessage: (messageId, channelId) => {harness.calls.live.push([messageId, channelId]); return true;},
		getHistoricalQueue: channelId => harness.jobsByChannel.get(channelId) || null,
		getFailedSnapshot: channelId => harness.failedSnapshots.get(channelId) || null,
		setFailedSnapshot: (channelId, snapshot) => harness.failedSnapshots.set(channelId, snapshot),
		deleteFailedSnapshot: channelId => harness.failedSnapshots.delete(channelId),
		clearHistoricalMarker: (messageId, jobId) => harness.calls.markers.push([messageId, jobId]),
		hasCachedTranslation: () => true,
		clearCachedTranslation: messageId => harness.calls.cache.push(messageId),
		deleteDisplayMessage: (messageId, channelId) => {harness.calls.display.push([messageId, channelId]); return Promise.resolve({deleted: true});},
		resolveDispatcher: () => dispatcher
	});

	assert.equal(lifecycle.start(), true);
	assert.equal(lifecycle.start(), true, "repeated start reuses the existing subscriptions");
	assert.deepEqual([...dispatcher.subscriptions.keys()], ["MESSAGE_DELETE", "MESSAGE_DELETE_BULK"]);
	assert.equal(dispatcher.calls.subscribe.length, 2);

	await dispatcher.subscriptions.get("MESSAGE_DELETE")({channelId: "c1", id: "m1"});
	await dispatcher.subscriptions.get("MESSAGE_DELETE_BULK")({channel_id: "c1", message_ids: ["m2", "m3"]});
	assert.deepEqual(harness.calls.live, [["m1", "c1"], ["m2", "c1"], ["m3", "c1"]]);

	assert.equal(lifecycle.stop(), true);
	assert.equal(lifecycle.stop(), false, "a second stop has nothing left to unsubscribe");
	assert.equal(dispatcher.calls.unsubscribe.length, 2);
	assert.equal(dispatcher.subscriptions.size, 0);
});

test("a partial subscription failure is rolled back and leaves the lifecycle restartable", () => {
	const dispatcher = createDispatcher();
	let failBulk = true;
	const originalSubscribe = dispatcher.subscribe;
	dispatcher.subscribe = function (type, handler) {
		if (type === "MESSAGE_DELETE_BULK" && failBulk) throw new Error("bulk unavailable");
		return originalSubscribe.call(this, type, handler);
	};
	const lifecycle = createMessageDeletionLifecycle({resolveDispatcher: () => dispatcher});

	assert.equal(lifecycle.start(), false);
	assert.equal(dispatcher.subscriptions.size, 0, "the successful first subscription was rolled back");
	failBulk = false;
	assert.equal(lifecycle.start(), true);
	assert.equal(dispatcher.subscriptions.size, 2);
	lifecycle.stop();
});
