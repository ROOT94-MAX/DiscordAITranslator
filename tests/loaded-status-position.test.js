const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

// 2026-08-16 real client: the textarea-guessing anchors drifted again and floated the
// capsule into the wrong spot. The chat scroller is the one anchor the probe proved
// stable across updates, so the capsule pins flush to its bottom-right inner corner.
function createPositionHarness({scrollerRect = {left: 200, top: 100, right: 1000, bottom: 640, width: 800, height: 540}} = {}) {
	const realDocument = global.document;
	const realWindow = global.window;
	global.document = {
		querySelector: selector => {
			if (selector == ".messages-scroller") return {getBoundingClientRect: () => ({...scrollerRect})};
			return null;
		}
	};
	global.window = Object.assign({}, realWindow, {innerWidth: 1280, innerHeight: 720});
	const plugin = createPluginInstance({callSetLanguages: false});
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

test("the loaded-status capsule anchors flush to the chat scroller's bottom-right corner", () => {
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, "" + String(1000 - 12 - 180) + "px", "left sits 12px inside the scroller's right edge (enforced 180px minimum width)");
		assert.equal(harness.element.style.top, "" + String(640 - 12 - 20) + "px", "top sits 12px inside the scroller's bottom edge");
	}
	finally {harness.restore();}
});

test("a missing scroller falls back to the viewport's bottom-right without throwing", () => {
	const harness = createPositionHarness();
	try {
		global.document = {querySelector: () => null};
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, "" + String(1280 - 12 - 180) + "px");
		assert.equal(harness.element.style.top, "" + String(720 - 12 - 20) + "px");
	}
	finally {harness.restore();}
});
