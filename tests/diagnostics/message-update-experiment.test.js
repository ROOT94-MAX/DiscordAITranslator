const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageUpdateExperiment, EXPERIMENT_ACTION} = require("../../src/diagnostics/message-update-experiment");

function createHarness({record = {content: "original text", embeds: [{}], attachments: [], editedTimestamp: null}, candidates = [{messageId: "m1", channelId: "c1"}], afterRecord, afterUiSnapshot = null, mutateUiOnDispatch = null} = {}) {
	const timers = [];
	const dispatches = [];
	const writes = [];
	let currentRecord = record;
	let renderCount = 7;
	let parentRenderCount = 3;
	const composerElement = {textContent: "draft", selectionStart: 2, selectionEnd: 2};
	const scrollerElement = {scrollTop: 240, scrollHeight: 1800, clientHeight: 600};
	const messageElement = {id: "chat-messages-m1"};
	const uiSnapshot = {composerElement, scrollerElement, messageElement, activeElement: composerElement};
	const experiment = createMessageUpdateExperiment({
		resolveDispatcher: () => ({dispatch: payload => {dispatches.push(payload); renderCount++; parentRenderCount++; if (afterRecord !== undefined) currentRecord = afterRecord; if (mutateUiOnDispatch) mutateUiOnDispatch({composerElement, scrollerElement, messageElement});}}),
		getSelectedChannelId: () => "c1",
		getStoreMessage: (channelId, messageId) => channelId === "c1" && messageId === "m1" ? currentRecord : null,
		getGuildId: () => "g1",
		listTranslatedCandidates: () => candidates,
		isViewTranslated: () => true,
		getMessageRenderCount: () => renderCount,
		getParentRenderCount: () => parentRenderCount,
		getUiSnapshot: () => afterUiSnapshot && dispatches.length ? afterUiSnapshot : uiSnapshot,
		sink: text => writes.push(JSON.parse(text)),
		now: () => 99,
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		clearTimeout: () => {}
	});
	return {experiment, timers, dispatches, writes, composerElement, scrollerElement, messageElement, runNextTimer: () => timers.splice(0, timers.length).forEach(timer => timer.callback())};
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

test("the experiment proves one target render without replacing the composer or moving the viewport", () => {
	const {experiment, writes, runNextTimer} = createHarness();
	experiment.start();
	runNextTimer();
	runNextTimer();

	const finalWrite = writes[writes.length - 1];
	assert.equal(finalWrite.reason, "complete");
	assert.equal(finalWrite.verdict.parentRenderDelta, 1, "the Store action must cross the message-list projection boundary");
	assert.equal(finalWrite.verdict.messageRenderDelta, 1, "the no-op Store action must actually render the target row");
	assert.equal(finalWrite.verdict.targetRowPreserved, true);
	assert.equal(finalWrite.verdict.composerPreserved, true, "the Composer instance is the boundary under test");
	assert.equal(finalWrite.verdict.activeElementPreserved, true);
	assert.equal(finalWrite.verdict.scrollerPreserved, true);
	assert.equal(finalWrite.verdict.scrollTopSame, true);
	assert.equal(finalWrite.verdict.composerTextLengthSame, true);
	assert.equal(finalWrite.verdict.composerSelectionSame, true);
});

test("the UI snapshot catches draft and viewport mutation even when the same DOM nodes survive", () => {
	const {experiment, writes, runNextTimer} = createHarness({
		mutateUiOnDispatch({composerElement, scrollerElement}) {
			composerElement.textContent = "changed draft";
			composerElement.selectionStart = 5;
			composerElement.selectionEnd = 5;
			scrollerElement.scrollTop = 900;
		}
	});
	experiment.start();
	runNextTimer();
	runNextTimer();

	const verdict = writes[writes.length - 1].verdict;
	assert.equal(verdict.composerPreserved, true, "identity alone is not enough");
	assert.equal(verdict.scrollerPreserved, true);
	assert.equal(verdict.scrollTopSame, false);
	assert.equal(verdict.composerTextLengthSame, false);
	assert.equal(verdict.composerSelectionSame, false);
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
