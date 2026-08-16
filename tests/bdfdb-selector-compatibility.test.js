const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("capsule positioning keeps the shipped 0.3.32 selector and scan contracts", () => {
	const runtime = fs.readFileSync(path.resolve(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
	const positioner = fs.readFileSync(path.resolve(__dirname, "..", "src", "ui", "loaded-status-position.js"), "utf8");

	// The runtime itself stays out of raw composer DOM; the positioner module owns it.
	assert.doesNotMatch(runtime, /\[class\*="channelTextArea"\]/, "capsule positioning lives in the positioner module, not the runtime");
	// The shipped 0.3.32 positioner anchored on BDFDB's composer class first and found
	// the slow-mode hint with a DOCUMENT-WIDE scan filtered by proximity guards.
	// Container-scoped rescans missed the hint 149 recorded times after the client
	// moved it out of the guessed container, so both old contracts are pinned here.
	assert.match(positioner, /BDFDB\.dotCN\.channeltextarea/, "the BDFDB composer anchor stays the first selector");
	assert.match(positioner, /documentRef\.querySelectorAll\("div, span"\)/, "the hint scan stays document-wide like the shipped version");
	assert.match(positioner, /nearInputRight/, "the proximity guards stay in place");
	assert.match(positioner, /slow\\s\*mode/, "the slow-mode wording stays matched");
});
