const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

// Restored original positioning (git 53ee75d): anchor on the composer's textarea,
// right-align above a native slow-mode hint when one passes the proximity guards,
// otherwise sit directly above the input. The guards exist so a slow-mode-like node
// anywhere else in the DOM (the icon row above the input) is rejected - matching it
// once floated the capsule onto the icons.
function createPositionHarness({anchorRect, hintNodes} = {}) {
	const realDocument = global.document;
	const realWindow = global.window;
	const defaults = {
		anchorRect: {left: 820, top: 1127, right: 1501, bottom: 1193, width: 681, height: 66}
	};
	const anchor = anchorRect === undefined ? defaults.anchorRect : anchorRect;
	const hintScope = {
		querySelectorAll: selector => selector == "div, span" ? (hintNodes || []) : []
	};
	const anchorNode = anchor && {
		getBoundingClientRect: () => ({...anchor}),
		parentElement: hintScope
	};
	const plugin = createPluginInstance({callSetLanguages: false});
	// Set after instance creation: createPluginInstance replaces global.window itself.
	global.document = {
		querySelectorAll: selector => selector == '[class*="channelTextArea"]' || selector == 'form [role="textbox"]' ? (anchorNode ? [anchorNode] : []) : []
	};
	global.window = Object.assign({}, global.window, {innerWidth: 1520, innerHeight: 1220});
	const element = {
		style: {},
		offsetWidth: 120,
		offsetHeight: 20,
		getBoundingClientRect: () => ({width: 120, height: 20})
	};
	return {
		plugin,
		element,
		restore() {
			global.document = realDocument;
			global.window = realWindow;
		}
	};
}

function hintNode(rect) {
	return {getBoundingClientRect: () => ({...rect}), textContent: "已开启"};
}

test("with a passing slow-mode hint the capsule floats above it, right edges aligned", () => {
	const harness = createPositionHarness({hintNodes: [hintNode({left: 1430, top: 1101, right: 1490, bottom: 1117, width: 60, height: 16})]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1490 - 180}px`, "the capsule's right edge shares the hint's right vertical line");
		assert.equal(harness.element.style.top, `${1101 - 20 - 8}px`, "the capsule floats 8px above the hint");
	}
	finally {harness.restore();}
});

test("a slow-mode-like node away from the composer's top-right is rejected by the guards", () => {
	// The icon row above the input once matched a text scan and the capsule landed on
	// the icons; the original proximity guards reject anything not at the composer's
	// top-right, so this falls back to the plain above-input position.
	const harness = createPositionHarness({hintNodes: [hintNode({left: 1430, top: 1000, right: 1490, bottom: 1016, width: 60, height: 16})]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1501 - 12 - 180}px`, "falls back to the composer's right edge");
		assert.equal(harness.element.style.top, `${1127 - 20 - 8}px`, "sits directly above the input, never on the icons");
	}
	finally {harness.restore();}
});

test("without any hint the capsule sits directly above the input, right-aligned", () => {
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1501 - 12 - 180}px`);
		assert.equal(harness.element.style.top, `${1127 - 20 - 8}px`);
	}
	finally {harness.restore();}
});

test("without a composer anchor the capsule falls back to the viewport's bottom-right", () => {
	const harness = createPositionHarness({anchorRect: null});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1520 - 108 - 180}px`);
		assert.equal(harness.element.style.top, `${1220 - 54 - 20}px`);
	}
	finally {harness.restore();}
});
