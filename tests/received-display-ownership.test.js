const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// These are source-text contracts on purpose. They guard against a specific class of
// regression that no behavioural test catches cheaply: a commit path quietly reaching for
// a whole-list repaint. A full remount reflows the chat while the user is reading it, and
// that is what "very laggy" looked like before the display store existed. The store's own
// behaviour is covered by tests/display/*; what these pin is that the legacy escape hatches
// stay out of the commit paths.
//
// The maps this file used to guard (translatedMessages, oldMessages) no longer exist
// anywhere in the tree, so asserting their absence proved nothing. The repaint contract is
// what survived.
function read(...parts) {
	return fs.readFileSync(path.resolve(__dirname, "..", ...parts), "utf8");
}

// The commit paths are spread across the plugin class and the display logic module, so
// every slice below names the file it expects to find its method in. A method that moves
// makes this file fail loudly rather than silently stop checking anything.
const SOURCES = {
	runtime: read("src", "legacy", "runtime.js"),
	displayLogic: read("src", "display", "translation-display-logic.js"),
	received: read("src", "received", "received-translation-runtime.js")
};

// Named here so a rename cannot silently turn every assertion below into a tautology.
const FULL_LIST_REPAINT = /scheduleTranslationRerender|PatchUtils\.forceAllUpdates/;
const LEGACY_WHOLE_MESSAGE_WRITER = /applyStoredTranslationToMessage/;

function findMethodStart(source, name, fromIndex = 0) {
	const candidates = [];
	for (const indent of ["\n\t\t\t", "\n\t\t"]) {
		for (const prefix of ["", "async "]) {
			for (const spacing of [" (", "("]) {
				const index = source.indexOf(`${indent}${prefix}${name}${spacing}`, fromIndex);
				if (index !== -1) candidates.push(index);
			}
		}
	}
	return candidates.length ? Math.min(...candidates) : -1;
}

function methodSlice(sourceKey, name, nextName) {
	const source = SOURCES[sourceKey];
	const start = findMethodStart(source, name);
	assert.notEqual(start, -1, `${name} method not found in ${sourceKey}`);
	const end = findMethodStart(source, nextName, start + 1);
	assert.notEqual(end, -1, `${nextName} method not found after ${name} in ${sourceKey}`);
	return source.slice(start, end);
}

test("the guarded identifiers still exist, so these contracts are not vacuous", () => {
	assert.match(SOURCES.runtime, FULL_LIST_REPAINT);
	assert.match(SOURCES.runtime, LEGACY_WHOLE_MESSAGE_WRITER);
	assert.match(SOURCES.displayLogic, LEGACY_WHOLE_MESSAGE_WRITER);
});

test("commit paths repaint the messages they touched, never the whole list", () => {
	const commitMethods = [
		methodSlice("runtime", "commitReceivedDisplayResult", "commitHistoricalReceivedDisplayBatch"),
		methodSlice("runtime", "commitHistoricalReceivedDisplayBatch", "getReceivedDisplayView"),
		methodSlice("runtime", "commitHistoricalTranslationJob", "getHistoricalAiBatchItemLimit")
	];
	for (const method of commitMethods) {
		assert.doesNotMatch(method, FULL_LIST_REPAINT);
		assert.doesNotMatch(method, LEGACY_WHOLE_MESSAGE_WRITER);
	}
});

test("the received display commit path delegates to the display runtime", () => {
	assert.match(methodSlice("runtime", "commitReceivedDisplayResult", "commitHistoricalReceivedDisplayBatch"), /ensureReceivedDisplayRuntime\(\)\.commitMessageResult/);
	assert.match(methodSlice("runtime", "commitHistoricalReceivedDisplayBatch", "getReceivedDisplayView"), /ensureReceivedDisplayRuntime\(\)\.commitHistoricalBatch/);
});

test("automatic translation flows never fall back to the whole-list repaint", () => {
	const flowSlices = [
		methodSlice("received", "commitCachedDisplayResult", "resolveCheckMessageDisplay"),
		methodSlice("displayLogic", "resolveLoadedMessageContentTranslation", "prepareMessageContentDisplay")
	];
	for (const flow of flowSlices) {
		assert.doesNotMatch(flow, FULL_LIST_REPAINT);
		assert.doesNotMatch(flow, LEGACY_WHOLE_MESSAGE_WRITER);
	}
});

test("the extracted live queue cannot reach display state at all", () => {
	// Structural rather than textual: a module has no access to the plugin factory closure,
	// so the queue can only touch display state through the runtime it was handed.
	const queueSource = fs.readFileSync(path.resolve(__dirname, "..", "src", "orchestrator", "live-translation-queue.js"), "utf8");
	assert.doesNotMatch(queueSource, FULL_LIST_REPAINT);
	assert.doesNotMatch(queueSource, LEGACY_WHOLE_MESSAGE_WRITER);
});

test("the translation pipeline repaints per message, never the whole list", () => {
	// Display-unification 5a: after the manual paint joined the transaction chain,
	// no pipeline path may fall back to the full-list repaint.
	const pipelineSource = fs.readFileSync(path.resolve(__dirname, "..", "src", "orchestrator", "translation-pipeline.js"), "utf8");
	assert.doesNotMatch(pipelineSource, FULL_LIST_REPAINT);
	assert.match(pipelineSource, /scheduleReceivedDisplayFlush/);
});

test("display-transaction scroll restore honors the manual translation anchor", () => {
	// The legacy full-list path anchored the clicked message during manual repaints;
	// the transaction path must keep that anchor or manual translation jumps the view.
	// The choice lives in the viewport store; the runtime wiring must call it.
	const wiring = fs.readFileSync(path.resolve(__dirname, "..", "src", "display", "display-runtime-wiring.js"), "utf8");
	assert.match(wiring, /captureDisplayTransactionScrollState\(context\)/);
	assert.match(wiring, /restoreDisplayTransactionScrollState\(/);
	const viewportSource = fs.readFileSync(path.resolve(__dirname, "..", "src", "viewport", "message-viewport-store.js"), "utf8");
	const captureImplementation = viewportSource.slice(viewportSource.indexOf("captureDisplayTransactionScrollState"), viewportSource.indexOf("restoreDisplayTransactionScrollState"));
	assert.match(captureImplementation, /getActiveManualScrollAnchor\(\)/, "the manual anchor must win over the offset capture");
});
