const test = require("node:test");
const assert = require("node:assert/strict");
const {createAtomicChatRebuild} = require("../../src/display/atomic-chat-rebuild");

// The composer icon flicker (2026-08-19 audit): BDFDB.MessageUtils.rerenderAll runs
// the blank commit and the restore commit as two separate React flushes, and under
// load the browser paints BETWEEN them - the whole chat layer, most visibly the
// composer translate icon, blinks for a frame. The atomic rebuild performs the same
// two commits inside one JavaScript task via ReactDOM.flushSync, so the blank state
// can never reach a paint. Anything missing or throwing returns false, and the
// caller falls back to the shipped rerenderAll path.

function createRebuildHarness({
	withFlushSync = true,
	ownerFound = true,
	prototypeFound = true,
	failFirstFlush = false,
	failSecondFlush = false,
	renderChildren = ["rows"]
} = {}) {
	const calls = {flushSync: 0, forceUpdate: 0, renders: [], scrolledTo: [], paintsBetweenCommits: 0};
	const prototype = {
		render() {
			return {props: {children: renderChildren}};
		}
	};
	const owner = Object.create(prototype);
	owner.props = {};
	const scroller = {scrollTop: 240, scrollTo: value => calls.scrolledTo.push(value)};
	const documentRef = {
		querySelector(selector) {
			if (selector === ".chat-content") return {};
			if (selector === ".messages-scroller") return scroller;
			return null;
		}
	};
	const BDFDB = {
		dotCN: {chatcontent: ".chat-content", messagesscroller: ".messages-scroller"},
		ObjectUtils: {
			get: (instance, path) => path === "__fiber.type.prototype" && prototypeFound ? prototype : null
		},
		ReactUtils: {
			instanceKey: "__fiber",
			findOwner: () => ownerFound ? owner : null,
			forceUpdate: instance => {
				calls.forceUpdate++;
				// A class forceUpdate re-runs the component's render through whatever
				// function currently sits on the prototype - the seam the blanking uses.
				calls.renders.push(prototype.render.call(instance));
			},
			flushSync: withFlushSync ? callback => {
				calls.flushSync++;
				if (failFirstFlush && calls.flushSync === 1) throw new Error("first flush failed");
				if (failSecondFlush && calls.flushSync === 2) throw new Error("second flush failed");
				callback();
			} : undefined
		},
		LibraryStores: {SelectedChannelStore: {getChannelId: () => null}}
	};
	return {calls, BDFDB, documentRef, prototype, scroller, ownerRender: () => prototype.render.call(owner)};
}

test("the atomic rebuild blanks and restores in one task and never leaves the blank render behind", () => {
	const harness = createRebuildHarness();
	const rebuild = createAtomicChatRebuild({BDFDB: harness.BDFDB, document: harness.documentRef});

	assert.equal(rebuild.rebuildOnce(), true);

	assert.equal(harness.calls.flushSync, 2, "blank and restore are two commits inside the same task");
	assert.equal(harness.calls.forceUpdate, 2);
	assert.deepEqual(harness.calls.renders[0].props.children, [], "the first commit unmounts the layer's children");
	assert.deepEqual(harness.calls.renders[1].props.children, ["rows"], "the second commit restores the real children");
	assert.deepEqual(harness.ownerRender().props.children, ["rows"], "the blanking wrapper is removed from the prototype");
	// Scroll-bounce audit (2026-08-19): the rebuild restoring a raw pixel offset
	// itself was a second scroll writer fighting the viewport store's anchor restore.
	// Scroll ownership belongs to the viewport store alone (adapter header contract).
	assert.deepEqual(harness.calls.scrolledTo, [], "the rebuild must never write scroll positions");
});

test("function-shaped children are blanked with a null renderer, mirroring BDFDB", () => {
	const harness = createRebuildHarness({renderChildren: () => "rows"});
	const rebuild = createAtomicChatRebuild({BDFDB: harness.BDFDB, document: harness.documentRef});

	assert.equal(rebuild.rebuildOnce(), true);
	assert.equal(typeof harness.calls.renders[0].props.children, "function", "a render-prop child is replaced by a function");
	assert.equal(harness.calls.renders[0].props.children(), null, "the replacement renders nothing");
});

test("a client without flushSync reports false so the caller keeps the shipped rerenderAll", () => {
	const harness = createRebuildHarness({withFlushSync: false});
	const rebuild = createAtomicChatRebuild({BDFDB: harness.BDFDB, document: harness.documentRef});

	assert.equal(rebuild.rebuildOnce(), false);
	assert.equal(harness.calls.forceUpdate, 0, "no half-applied work on an unsupported client");
});

test("a missing LayerProvider owner or prototype reports false without touching React", () => {
	for (const overrides of [{ownerFound: false}, {prototypeFound: false}]) {
		const harness = createRebuildHarness(overrides);
		const rebuild = createAtomicChatRebuild({BDFDB: harness.BDFDB, document: harness.documentRef});
		assert.equal(rebuild.rebuildOnce(), false);
		assert.equal(harness.calls.forceUpdate, 0);
	}
});

test("a throwing first flush restores the prototype and reports false for the fallback", () => {
	const harness = createRebuildHarness({failFirstFlush: true});
	const rebuild = createAtomicChatRebuild({BDFDB: harness.BDFDB, document: harness.documentRef});

	assert.equal(rebuild.rebuildOnce(), false, "the caller must run the fallback rebuild");
	assert.deepEqual(harness.ownerRender().props.children, ["rows"], "the prototype is never left wrapped");
});

test("a throwing second flush still reports false so the fallback can repaint the layer", () => {
	const harness = createRebuildHarness({failSecondFlush: true});
	const rebuild = createAtomicChatRebuild({BDFDB: harness.BDFDB, document: harness.documentRef});

	assert.equal(rebuild.rebuildOnce(), false, "a blank layer must be repainted by the fallback");
	assert.deepEqual(harness.ownerRender().props.children, ["rows"], "the prototype is never left wrapped");
});

test("the runtime hands the display runtime every BDFDB handle the atomic rebuild needs", () => {
	// Root cause of the 0A/56F diagnostic reading (2026-08-19 settings screenshot):
	// the runtime wired a REDUCED BDFDB surface (dotCN + MessageUtils only) into the
	// display runtime, so ReactUtils.flushSync was always undefined and every
	// transaction silently fell back to the two-flush rerenderAll. The wiring must
	// carry every handle rebuildOnce() checks.
	const fs = require("node:fs");
	const path = require("node:path");
	const runtime = fs.readFileSync(path.resolve(__dirname, "..", "..", "src", "legacy", "runtime.js"), "utf8");
	const start = runtime.indexOf("createDisplayRuntime({");
	assert.notEqual(start, -1, "display runtime construction not found");
	const block = runtime.slice(start, runtime.indexOf("ensureReceivedDisplayRuntime", start + 1));
	for (const handle of ["ReactUtils", "ObjectUtils", "LibraryStores", "DMUtils", "ChannelUtils"]) {
		assert.match(block, new RegExp(`${handle}: BDFDB\.${handle}`), `the display runtime must receive BDFDB.${handle}`);
	}
});
