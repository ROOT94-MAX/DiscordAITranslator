const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

// 2026-08-16 real client: anchoring to the scroller's bottom-right covered the
// composer, and some channels show a slow-mode line under the input. The capsule now
// hugs the chat area's right edge and floats ABOVE the composer's top edge, which
// keeps it clear of both the input box and the slow-mode text below it.
function createPositionHarness({scrollerRect, composerRect} = {}) {
	const realDocument = global.document;
	const realWindow = global.window;
	const defaults = {
		scrollerRect: {left: 200, top: 100, right: 1000, bottom: 700, width: 800, height: 600},
		composerRect: {left: 220, top: 640, bottom: 700, right: 980, width: 760, height: 60}
	};
	const fixture = {
		scrollerRect: scrollerRect === undefined ? defaults.scrollerRect : scrollerRect,
		composerRect: composerRect === undefined ? defaults.composerRect : composerRect
	};
	global.document = {
		querySelector: selector => {
			if (/messages-?scroller/.test(selector)) return fixture.scrollerRect ? {getBoundingClientRect: () => ({...fixture.scrollerRect})} : null;
			if (selector == "form") return fixture.composerRect ? {getBoundingClientRect: () => ({...fixture.composerRect})} : null;
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

test("the capsule hugs the chat's right edge above the composer, clear of slow mode", () => {
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1000 - 12 - 180}px`, "left sits 12px inside the chat area's right edge (enforced 180px minimum width)");
		assert.equal(harness.element.style.top, `${640 - 20 - 8}px`, "top floats above the composer's top edge");
	}
	finally {harness.restore();}
});

test("without a composer the capsule falls back to the chat area's bottom-right", () => {
	const harness = createPositionHarness({composerRect: null});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1000 - 12 - 180}px`);
		assert.equal(harness.element.style.top, `${700 - 12 - 20}px`);
	}
	finally {harness.restore();}
});

test("a missing scroller falls back to the viewport's bottom-right without throwing", () => {
	const harness = createPositionHarness({scrollerRect: null, composerRect: null});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1280 - 12 - 180}px`);
		assert.equal(harness.element.style.top, `${720 - 12 - 20}px`);
	}
	finally {harness.restore();}
});
