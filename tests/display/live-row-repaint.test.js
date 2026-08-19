const test = require("node:test");
const assert = require("node:assert/strict");
const {createLiveRowRepaint} = require("../../src/display/live-row-repaint");

// Why this module exists (2026-08-19, "79A/0F" field reading): every arriving
// translation wave cost one WHOLE-LAYER rebuild, because mounted message rows are
// memoized and nothing above them can push a re-render through the memo boundary.
// But the boundary only blocks renders coming from ABOVE: the message-content
// component's own forceUpdate re-renders its subtree directly. The content render
// patch registers each row's live instance, a commit force-updates exactly the rows
// it painted, and the patch re-runs and injects the stored translation - no rebuild,
// no scroll restore, no composer remount. Rows without a usable instance stay
// unpainted here and the adapter's DOM confirm routes them to the atomic rebuild.

function createInstance() {
	const instance = {
		updater: {},
		renders: 0,
		forceUpdate() {this.renders++;}
	};
	return instance;
}

function createHarness({withFlushSync = true} = {}) {
	const calls = {forceUpdated: [], flushSyncs: 0};
	const reactUtils = {
		forceUpdate: instance => {
			calls.forceUpdated.push(instance);
			instance.forceUpdate();
		}
	};
	const repaint = createLiveRowRepaint({
		reactUtils,
		resolveFlushSync: () => withFlushSync ? callback => {
			calls.flushSyncs++;
			callback();
		} : null
	});
	return {repaint, calls};
}

test("a registered row repaints itself and the whole batch commits in one flushSync", () => {
	const {repaint, calls} = createHarness();
	const first = createInstance();
	const second = createInstance();
	repaint.recordContentInstance("m1", first);
	repaint.recordContentInstance("m2", second);

	const repainted = repaint.repaintRows(["m1", "m2", "m3"]);

	assert.deepEqual(repainted, ["m1", "m2"], "only rows with a live instance are attempted; m3 goes to the rebuild path");
	assert.equal(first.renders, 1);
	assert.equal(second.renders, 1);
	assert.equal(calls.flushSyncs, 1, "the batch commits synchronously so the scroll anchor can be re-applied in the same task");
});

test("without flushSync the rows still repaint, just without the synchronous commit", () => {
	const {repaint, calls} = createHarness({withFlushSync: false});
	const instance = createInstance();
	repaint.recordContentInstance("m1", instance);

	assert.deepEqual(repaint.repaintRows(["m1"]), ["m1"]);
	assert.equal(instance.renders, 1);
	assert.equal(calls.flushSyncs, 0);
});

test("re-registering the same instance is free and a new instance replaces the old", () => {
	const {repaint} = createHarness();
	const original = createInstance();
	repaint.recordContentInstance("m1", original);
	repaint.recordContentInstance("m1", original);
	assert.equal(repaint.getTrackedRowCount(), 1);

	const replacement = createInstance();
	repaint.recordContentInstance("m1", replacement);
	repaint.repaintRows(["m1"]);
	assert.equal(replacement.renders, 1, "the most recent render's instance wins");
	assert.equal(original.renders, 0, "the replaced instance is never touched again");
});

test("instances without a React updater are refused - they cannot self-repaint", () => {
	const {repaint} = createHarness();
	assert.equal(repaint.recordContentInstance("m1", {forceUpdate() {}}), false, "no updater means a synthetic instance");
	assert.equal(repaint.recordContentInstance("m1", null), false);
	assert.deepEqual(repaint.repaintRows(["m1"]), [], "nothing usable was recorded");
});

test("a throwing forceUpdate poisons neither the batch nor future repaints", () => {
	const {repaint} = createHarness();
	const broken = createInstance();
	broken.forceUpdate = () => {throw new Error("unmounted");};
	const healthy = createInstance();
	repaint.recordContentInstance("m1", broken);
	repaint.recordContentInstance("m2", healthy);

	const repainted = repaint.repaintRows(["m1", "m2"]);

	assert.deepEqual(repainted, ["m1", "m2"], "attempts are reported; the DOM confirm decides what actually painted");
	assert.equal(healthy.renders, 1, "one broken row cannot block the others");
});

test("clear drops every tracked row", () => {
	const {repaint} = createHarness();
	repaint.recordContentInstance("m1", createInstance());
	repaint.clear();
	assert.equal(repaint.getTrackedRowCount(), 0);
	assert.deepEqual(repaint.repaintRows(["m1"]), []);
});
