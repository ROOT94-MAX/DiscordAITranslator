const test = require("node:test");
const assert = require("node:assert/strict");
const {createFluxRowRepaint, MESSAGE_UPDATE_ACTION} = require("../../src/display/flux-row-repaint");

function createHarness({records = {m1: {content: "original one"}, m2: {content: "original two"}}, guildId = "g1", dispatcherAvailable = true} = {}) {
	const dispatches = [];
	const repaint = createFluxRowRepaint({
		resolveDispatcher: () => dispatcherAvailable ? {dispatch: payload => dispatches.push(payload)} : null,
		getStoreMessage: (channelId, messageId) => channelId === "c1" && records[messageId] || null,
		getGuildId: () => guildId
	});
	return {repaint, dispatches};
}

test("each row dispatches the experiment-verified no-op payload through Discord's store path", () => {
	const {repaint, dispatches} = createHarness();

	const attempted = repaint.repaintRows(["m1", "m2"], {channelId: "c1"});

	assert.deepEqual(attempted, ["m1", "m2"]);
	assert.equal(dispatches.length, 2);
	assert.equal(dispatches[0].type, MESSAGE_UPDATE_ACTION);
	assert.equal(dispatches[0].guildId, "g1");
	assert.deepEqual(dispatches[0].message, {id: "m1", channel_id: "c1", guild_id: "g1", content: "original one"}, "the partial message reuses the record's own content - a no-op by value");
	assert.equal(dispatches[0].__translatorSynthetic, true, "synthetic dispatches stay marked");
});

test("rows without a store record are not attempted, so the DOM confirm routes them to the rebuild", () => {
	const {repaint, dispatches} = createHarness();

	const attempted = repaint.repaintRows(["m1", "missing"], {channelId: "c1"});

	assert.deepEqual(attempted, ["m1"]);
	assert.equal(dispatches.length, 1);
});

test("no dispatcher or no channel means no attempts and no throw", () => {
	const {repaint} = createHarness({dispatcherAvailable: false});
	assert.deepEqual(repaint.repaintRows(["m1"], {channelId: "c1"}), []);

	const {repaint: withDispatcher, dispatches} = createHarness();
	assert.deepEqual(withDispatcher.repaintRows(["m1"], {}), []);
	assert.equal(dispatches.length, 0);
});

test("a DM channel dispatches without a guild id, matching the captured DM event shape", () => {
	const {repaint, dispatches} = createHarness({guildId: null});

	repaint.repaintRows(["m1"], {channelId: "c1"});

	assert.equal(dispatches[0].guildId, undefined);
	assert.equal(dispatches[0].message.guild_id, undefined);
});
