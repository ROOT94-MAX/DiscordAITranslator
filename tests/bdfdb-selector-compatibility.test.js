const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("composer status and focus detection do not read the removed BDFDB channeltextarea selector", () => {
	const runtime = fs.readFileSync(path.resolve(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
	const viewport = fs.readFileSync(path.resolve(__dirname, "..", "src", "viewport", "message-viewport-store.js"), "utf8");

	assert.doesNotMatch(runtime, /BDFDB\.dotCN\s*&&\s*BDFDB\.dotCN\.channeltextarea|BDFDB\.dotCN\.channeltextarea/);
	// Capsule positioning anchors to the chat scroller (probe-proven stable across
	// client updates); guessing composer containers in the runtime drifted on
	// 2026-08-16 (PTB 1.0.1214) and floated the capsule into the wrong corner.
	assert.doesNotMatch(runtime, /\[class\*="channelTextArea"\]/, "capsule positioning must not guess composer containers");
	assert.match(viewport, /\[class\*="channelTextArea"\]/, "composer focus detection keeps its local fallback selector");
});
