const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginDisplayRepaintScheduler} = require("../../src/display/repaint-scheduler-wiring");

test("display repaint scheduler wiring creates the scheduler with every established policy port", async () => {
	const calls = [];
	const scheduler = {tag: "display-repaint-scheduler"};
	const renderReport = {confirmedIds: ["message-a"]};
	const displayRuntime = {renderMessages: (messageIds, meta) => (calls.push(["renderMessages", messageIds, meta]), Promise.resolve(renderReport))};
	const plugin = {
		ensureReceivedDisplayRuntime: () => displayRuntime,
		canRepaintReceivedDisplayNow: () => (calls.push(["canRepaintNow"]), true),
		isViewingMessageHistory: () => (calls.push(["isViewingHistory"]), false),
		isTranslatorSettingsSurfaceOpen: () => (calls.push(["isSettingsSurfaceOpen"]), false),
		isChannelTextAreaFocused: () => (calls.push(["isTextAreaFocused"]), true),
		rerenderMessagesWithScrollPreserved: () => calls.push(["repaintAll"])
	};
	const BDFDB = {TimeUtils: {
		timeout: (callback, delay) => (calls.push(["setTimeout", callback, delay]), "managed-timer"),
		clear: timer => calls.push(["clearTimeout", timer])
	}};
	const onRenderOutcome = report => calls.push(["onRenderOutcome", report]);
	let captured = null;

	const result = createPluginDisplayRepaintScheduler({
		plugin,
		BDFDB,
		onRenderOutcome,
		createScheduler: options => (captured = options, scheduler)
	});

	assert.equal(result, scheduler);
	const meta = {sources: {live: 1}};
	assert.equal(await captured.renderMessages(["message-a"], meta), renderReport);
	captured.onRenderOutcome(renderReport);
	assert.equal(captured.canRepaintNow(), true);
	assert.equal(captured.isViewingHistory(), false);
	assert.equal(captured.isSettingsSurfaceOpen(), false);
	assert.equal(captured.isTextAreaFocused(), true);
	captured.repaintAll();
	const callback = () => {};
	assert.equal(captured.setTimeout(callback, 120), "managed-timer");
	captured.clearTimeout("managed-timer");
	assert.deepEqual(calls, [
		["renderMessages", ["message-a"], meta],
		["onRenderOutcome", renderReport],
		["canRepaintNow"],
		["isViewingHistory"],
		["isSettingsSurfaceOpen"],
		["isTextAreaFocused"],
		["repaintAll"],
		["setTimeout", callback, 120],
		["clearTimeout", "managed-timer"]
	]);
});
