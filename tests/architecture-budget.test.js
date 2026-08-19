const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtimePath = path.join(root, "src", "legacy", "runtime.js");

// A ratchet, not a ceiling. These numbers may only ever be LOWERED. Raising one
// means a change grew the legacy runtime, which is the exact failure the previous
// plan hid: code kept moving into runtime.js while the plan claimed extraction.
// The size backstop that used to live in build-contract.test.js was raised the
// moment it was breached, which made it worthless; do not repeat that here.
const BUDGET = Object.freeze({
	// +3 (2026-08-19): preview-wave coalescer wiring (managed timer + repaint gate).
	// +34 (2026-08-19): debug-only wiring, all stripped from release builds - the
	// MESSAGE_UPDATE probe (strategy ladder), the one-shot merge-semantics
	// experiment, and the forwarded-message shape probe. Not retained legacy.
	// +5 (2026-08-19): flux per-row repaint handles (dispatcher, message record,
	// guild) into the display runtime - the experiment-verified endgame wiring.
	// +8 (2026-08-19): forwarded-message extraction reads the forward snapshot body
	// so 已转发 messages stop being skipped as contentless.
	// +2 (2026-08-19): getStreamBodyContent/paintStreamBody delegations - the
	// forward-aware body accessors the legacy stream writes route through.
	// -24 (2026-08-20): content-view projection moved into the display module;
	// the runtime keeps one delegation instead of owning the forwarded-parent branch.
	// -12 (2026-08-20): removed the dead direct-original React block factory.
	// -1 (2026-08-20): removed atomic-rebuild-only BDFDB handle wiring.
	// -2 (2026-08-20): direct Store deletion subscriptions replaced the legacy
	// global dispatch patch while sharing the active Store dispatcher resolver.
	runtimeLines: 3476,
	moduleLevelVarDeclarators: 2
});

function readRuntimeLines() {
	return fs.readFileSync(runtimePath, "utf8").split("\n");
}

// Module-level state lives in the plugin factory closure, above the class, where
// every helper object and every one of the class methods can read and write it.
// That shared mutability is what makes extraction impossible: a module cannot move
// out while it still reaches into this closure. Counting declarators - not lines -
// keeps `var a = 1, b = 2;` honest.
function countModuleLevelVarDeclarators(lines) {
	const classLine = lines.findIndex(line => /return class Translator extends Plugin/.test(line));
	assert.notEqual(classLine, -1, "the plugin class declaration must be findable");
	let declarators = 0;
	for (let index = 0; index <= classLine; index++) {
		const line = lines[index];
		if (!/^\t\tvar /.test(line)) continue;
		const body = line.replace(/^\t\tvar /, "").replace(/;\s*(\/\/.*)?$/, "");
		declarators += body.split(",").filter(part => /^\s*[a-zA-Z_$]/.test(part)).length;
	}
	return declarators;
}

test("the legacy runtime only ever shrinks", () => {
	const lines = readRuntimeLines();
	assert.ok(
		lines.length <= BUDGET.runtimeLines,
		`src/legacy/runtime.js grew to ${lines.length} lines (budget ${BUDGET.runtimeLines}). ` +
		"Extraction work must remove more from legacy than it adds. If this change legitimately " +
		"moved code OUT, lower BUDGET.runtimeLines to the new count in the same commit."
	);
});

test("module-level shared state only ever shrinks", () => {
	const declarators = countModuleLevelVarDeclarators(readRuntimeLines());
	assert.ok(
		declarators <= BUDGET.moduleLevelVarDeclarators,
		`the plugin factory closure now declares ${declarators} module-level vars (budget ${BUDGET.moduleLevelVarDeclarators}). ` +
		"New shared mutable state is the coupling that blocks extraction; put the state inside the " +
		"module that owns it instead."
	);
});

test("extracted lifecycle responsibilities do not leave dead runtime forwarding methods", () => {
	const source = readRuntimeLines().join("\n");
	for (const methodName of [
		"isHistoricalMessageSourceGenerationCurrent",
		"clearReplyPreviewRenderMessage",
		"clearAutoTranslationScrollIntent",
		"markAutoTranslationScrollIntent",
		"scheduleAutoTranslationScrollIdleFinish",
		"scheduleAutoTranslationQueueRetry",
		"flushReceivedDisplayQueues"
	]) assert.doesNotMatch(source, new RegExp(`\\b${methodName}\\s*\\(`), `${methodName} has no production caller`);
});

test("the recorded budget matches the current tree, so drift is visible", () => {
	const lines = readRuntimeLines();
	const declarators = countModuleLevelVarDeclarators(lines);
	// Passing the two assertions above while sitting far below the budget means the
	// budget was never lowered after an extraction. Keep them in lockstep.
	assert.equal(lines.length, BUDGET.runtimeLines, "lower BUDGET.runtimeLines to the current count after removing legacy code");
	assert.equal(declarators, BUDGET.moduleLevelVarDeclarators, "lower BUDGET.moduleLevelVarDeclarators after removing shared state");
});
