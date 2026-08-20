const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginHistoricalSnapshotCadence} = require("../src/orchestrator/historical-snapshot-cadence-wiring");

function createFixture() {
	const calls = [];
	const timer = {id: "cadence-timer"};
	const registry = {
		isCurrentQueue: (channelId, entry) => (calls.push(["isCurrentQueue", channelId, entry]), entry.current)
	};
	const plugin = {
		isUserActivelyScrollingMessages: channelId => (calls.push(["isUserActivelyScrolling", channelId]), channelId == "scrolling-channel"),
		ensureHistoricalJobRegistry: () => registry,
		finishHistoricalTranslationSnapshot: channelId => (calls.push(["finishSnapshot", channelId]), `finished:${channelId}`)
	};
	const BDFDB = {
		TimeUtils: {
			timeout: (callback, delay) => (calls.push(["timeout", callback, delay]), timer),
			clear: value => calls.push(["clear", value])
		}
	};
	let dependencies = null;
	const cadence = {tag: "historical-snapshot-cadence"};
	const created = createPluginHistoricalSnapshotCadence({
		plugin,
		BDFDB,
		createCadence: input => (dependencies = input, cadence)
	});
	return {plugin, BDFDB, calls, timer, dependencies, cadence, created};
}

test("historical snapshot cadence wiring creates the policy with the complete dependency contract", () => {
	const fixture = createFixture();

	assert.equal(fixture.created, fixture.cadence);
	assert.deepEqual(Object.keys(fixture.dependencies).sort(), [
		"clear",
		"finishSnapshot",
		"isCurrentQueue",
		"isUserActivelyScrolling",
		"timeout"
	].sort());
});

test("historical snapshot cadence wiring keeps the quiet-window timer on BDFDB managed time", () => {
	const fixture = createFixture();
	const callback = () => {};

	assert.equal(fixture.dependencies.timeout(callback, 500), fixture.timer);
	fixture.dependencies.clear(fixture.timer);
	assert.deepEqual(fixture.calls, [
		["timeout", callback, 500],
		["clear", fixture.timer]
	]);
});

test("historical snapshot cadence wiring delegates scroll, queue identity and sealing unchanged", () => {
	const fixture = createFixture();
	const entry = {current: true};

	assert.equal(fixture.dependencies.isUserActivelyScrolling("scrolling-channel"), true);
	assert.equal(fixture.dependencies.isCurrentQueue("channel-1", entry), true);
	assert.equal(fixture.dependencies.finishSnapshot("channel-1"), "finished:channel-1");
	assert.deepEqual(fixture.calls, [
		["isUserActivelyScrolling", "scrolling-channel"],
		["isCurrentQueue", "channel-1", entry],
		["finishSnapshot", "channel-1"]
	]);
});
