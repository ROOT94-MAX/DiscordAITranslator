const test = require("node:test");
const assert = require("node:assert/strict");
const {createHistoricalDisplayTracker} = require("../../src/display/historical-display-tracker");

test("a tracked historical repaint advances displayed count only for its current channel", () => {
	let currentChannelId = "c1";
	const statusUpdates = [];
	const scheduled = [];
	const tracker = createHistoricalDisplayTracker({
		isStatusForChannel: channelId => String(channelId) === currentChannelId,
		updateStatus: update => statusUpdates.push(update)
	});

	const pending = tracker.begin({
		channelId: "c1",
		batchKey: "batch-1",
		displayed: 1,
		outcome: {missingIds: ["m2"], retryIds: ["m2"]},
		schedule: messageId => scheduled.push(messageId)
	});
	assert.equal(pending, 1);
	assert.deepEqual(scheduled, ["m2"]);

	tracker.handle({channelId: "c1", messageIds: ["m2"], trackingKeysByMessageId: {m2: ["batch-1"]}, outcome: {confirmedIds: ["m2"]}});
	assert.deepEqual(statusUpdates, [{channelId: "c1", displayed: 2, displayPending: 0}]);

	tracker.begin({channelId: "c1", batchKey: "batch-2", displayed: 0, outcome: {missingIds: ["old"]}});
	currentChannelId = "c2";
	assert.equal(tracker.handle({channelId: "c1", messageIds: ["old"], trackingKeysByMessageId: {old: ["batch-2"]}, outcome: {confirmedIds: ["old"]}}), false);
	assert.equal(statusUpdates.length, 1, "a late channel must not replace the current channel status");
});

test("virtualized-ready rows resolve pending display tracking and clear removes all batches", () => {
	const updates = [];
	const tracker = createHistoricalDisplayTracker({isStatusForChannel: () => true, updateStatus: update => updates.push(update)});
	tracker.begin({channelId: "c1", batchKey: "batch-1", displayed: 3, outcome: {missingIds: ["m4"]}});
	assert.equal(tracker.handle({channelId: "c1", messageIds: ["m4"], trackingKeysByMessageId: {m4: ["batch-1"]}, outcome: {deferredIds: ["m4"]}}), true);
	assert.deepEqual(updates.at(-1), {channelId: "c1", displayed: 4, displayPending: 0});

	tracker.begin({channelId: "c2", batchKey: "batch-2", displayed: 0, outcome: {retryIds: ["m5"]}});
	tracker.clear();
	assert.equal(tracker.handle({channelId: "c2", messageIds: ["m5"], trackingKeysByMessageId: {m5: ["batch-2"]}, outcome: {confirmedIds: ["m5"]}}), false);
});

test("a skipped row can finish repainting without inflating the translated display count", () => {
	const updates = [];
	const tracker = createHistoricalDisplayTracker({isStatusForChannel: () => true, updateStatus: update => updates.push(update)});
	tracker.begin({
		channelId: "c1",
		batchKey: "batch-1",
		displayed: 1,
		displayableIds: ["translated"],
		outcome: {missingIds: ["translated", "skipped"]}
	});

	tracker.handle({channelId: "c1", messageIds: ["skipped"], trackingKeysByMessageId: {skipped: ["batch-1"]}, outcome: {confirmedIds: ["skipped"]}});
	assert.deepEqual(updates.at(-1), {channelId: "c1", displayed: 1, displayPending: 1});
	tracker.handle({channelId: "c1", messageIds: ["translated"], trackingKeysByMessageId: {translated: ["batch-1"]}, outcome: {confirmedIds: ["translated"]}});
	assert.deepEqual(updates.at(-1), {channelId: "c1", displayed: 2, displayPending: 0});
});

test("an exhausted or unavailable repaint finishes pending tracking without claiming it displayed", () => {
	const updates = [];
	const tracker = createHistoricalDisplayTracker({isStatusForChannel: () => true, updateStatus: update => updates.push(update)});
	tracker.begin({channelId: "c1", batchKey: "batch-1", displayed: 4, outcome: {missingIds: ["m5"]}});

	tracker.handle({
		channelId: "c1",
		messageIds: ["m5"],
		trackingKeysByMessageId: {m5: ["batch-1"]},
		outcome: {missingIds: ["m5"], retryIds: ["m5"], exhaustedIds: ["m5"]}
	});

	assert.deepEqual(updates.at(-1), {channelId: "c1", displayed: 4, displayPending: 0});
	assert.equal(tracker.handle({channelId: "c1", messageIds: ["m5"], outcome: {confirmedIds: ["m5"]}}), false);
});

test("a late old-batch outcome cannot resolve the replacement batch for the same channel", () => {
	const updates = [];
	let revision = 1;
	const tracker = createHistoricalDisplayTracker({
		isStatusForChannel: () => true,
		getRevision: () => revision,
		updateStatus: update => updates.push(update)
	});
	tracker.begin({channelId: "c1", batchKey: "old", displayed: 0, outcome: {missingIds: ["m1"]}});
	revision = 2;
	tracker.begin({channelId: "c1", batchKey: "new", displayed: 0, outcome: {missingIds: ["m1"]}});

	assert.equal(tracker.handle({
		channelId: "c1",
		messageIds: ["m1"],
		trackingKeysByMessageId: {m1: ["old"]},
		outcome: {confirmedIds: ["m1"]}
	}), false);
	assert.equal(updates.length, 0);
	assert.equal(tracker.handle({
		channelId: "c1",
		messageIds: ["m1"],
		trackingKeysByMessageId: {m1: ["new"]},
		outcome: {confirmedIds: ["m1"]}
	}), true);
	assert.deepEqual(updates.at(-1), {channelId: "c1", displayed: 1, displayPending: 0});
});

test("a newer message revision retires the old batch row without counting the newer translation", () => {
	const updates = [];
	let revision = 7;
	const tracker = createHistoricalDisplayTracker({
		isStatusForChannel: () => true,
		getRevision: () => revision,
		updateStatus: update => updates.push(update)
	});
	tracker.begin({channelId: "c1", batchKey: "batch-1", displayed: 0, outcome: {missingIds: ["m1"]}});
	revision = 8;

	tracker.handle({
		channelId: "c1",
		messageIds: ["m1"],
		trackingKeysByMessageId: {m1: ["batch-1"]},
		outcome: {confirmedIds: ["m1"]}
	});

	assert.deepEqual(updates.at(-1), {channelId: "c1", displayed: 0, displayPending: 0});
});

test("a report carries the batch number captured when its job began, not the current one", () => {
	// 2026-08-19 audit: batch-less late reports merged a finished batch's displayed
	// count into the NEXT batch's status (the 12/26 transients). The batch stamp is
	// taken at begin() so a straggler identifies the batch it belongs to.
	const updates = [];
	let currentBatch = 7;
	const tracker = createHistoricalDisplayTracker({
		isStatusForChannel: () => true,
		getRevision: () => "r1",
		updateStatus: update => updates.push(update),
		getBatchNumber: () => currentBatch
	});
	tracker.begin({channelId: "c1", batchKey: "job-7", displayed: 0, displayableIds: ["m1"], outcome: {retryIds: ["m1"]}, schedule: () => {}});
	currentBatch = 8;
	tracker.handle({channelId: "c1", messageIds: ["m1"], outcome: {confirmedIds: ["m1"]}, trackingKeysByMessageId: {m1: ["job-7"]}});
	assert.equal(updates.length, 1);
	assert.equal(updates[0].batch, 7, "the report names the batch it was begun under");
});
