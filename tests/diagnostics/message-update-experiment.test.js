const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageUpdateExperiment, EXPERIMENT_ACTION} = require("../../src/diagnostics/message-update-experiment");

function createHarness({record = {content: "original text", embeds: [{}], attachments: [], editedTimestamp: null}, candidates = [{messageId: "m1", channelId: "c1"}], afterRecord} = {}) {
	const timers = [];
	const dispatches = [];
	const writes = [];
	let currentRecord = record;
	const experiment = createMessageUpdateExperiment({
		resolveDispatcher: () => ({dispatch: payload => {dispatches.push(payload); if (afterRecord !== undefined) currentRecord = afterRecord;}}),
		getSelectedChannelId: () => "c1",
		getStoreMessage: (channelId, messageId) => channelId === "c1" && messageId === "m1" ? currentRecord : null,
		getGuildId: () => "g1",
		listTranslatedCandidates: () => candidates,
		isViewTranslated: () => true,
		sink: text => writes.push(JSON.parse(text)),
		now: () => 99,
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		clearTimeout: () => {}
	});
	return {experiment, timers, dispatches, writes, runNextTimer: () => timers.splice(0, timers.length).forEach(timer => timer.callback())};
}

test("one guarded synthetic dispatch mirrors the probe-captured payload shape", () => {
	const {experiment, dispatches, writes, runNextTimer} = createHarness();
	experiment.start();
	runNextTimer();

	assert.equal(dispatches.length, 1, "exactly one dispatch, ever");
	const payload = dispatches[0];
	assert.equal(payload.type, EXPERIMENT_ACTION);
	assert.equal(payload.guildId, "g1");
	assert.deepEqual(payload.message, {id: "m1", channel_id: "c1", guild_id: "g1", content: "original text"}, "the partial message reuses the record's own content - a no-op by value");
	assert.equal(payload.__translatorSynthetic, true, "synthetic actions are marked");

	runNextTimer();
	const finalWrite = writes[writes.length - 1];
	assert.equal(finalWrite.reason, "complete");
	assert.equal(finalWrite.verdict.recordSurvived, true);
	assert.equal(finalWrite.verdict.contentSame, true);
	assert.equal(finalWrite.verdict.embedsKept, true);
	assert.equal(finalWrite.verdict.translationStillShown, true);
});

test("a replace-not-merge handler is caught by the after snapshot", () => {
	const {experiment, writes, runNextTimer} = createHarness({afterRecord: {content: "original text", embeds: [], attachments: [], editedTimestamp: null}});
	experiment.start();
	runNextTimer();
	runNextTimer();

	const finalWrite = writes[writes.length - 1];
	assert.equal(finalWrite.verdict.embedsKept, false, "dropped embeds prove the handler replaces omitted fields");
	assert.equal(finalWrite.verdict.contentSame, true);
});

test("the experiment waits for a translated message in the selected channel and retries", () => {
	const candidates = [];
	const {experiment, dispatches, timers} = createHarness({candidates});
	experiment.start();
	timers.splice(0, timers.length).forEach(timer => timer.callback());

	assert.equal(dispatches.length, 0, "no candidate, no dispatch");
	assert.equal(timers.length, 1, "the attempt re-arms");

	candidates.push({messageId: "m1", channelId: "c1"});
	timers.splice(0, timers.length).forEach(timer => timer.callback());
	assert.equal(dispatches.length, 1, "the dispatch runs once the candidate appears");
});

test("stop before any run records that nothing was dispatched", () => {
	const {experiment, writes} = createHarness({candidates: []});
	experiment.start();
	experiment.stop();

	assert.equal(writes.length, 1);
	assert.equal(writes[0].reason, "stopped-before-run");
});
