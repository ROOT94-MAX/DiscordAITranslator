const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

// 2026-08-16 product decision: the capsule lives on the chat area's right side.
// When Discord shows a native hint strip (slow mode "已开启" etc.), the capsule floats
// directly above that hint, right-aligned with it; without a hint it takes the hint's
// own row at the right side, under the input. It never covers the composer input.
function createPositionHarness({scrollerRect, composerRect, nativeRect} = {}) {
	const realDocument = global.document;
	const realWindow = global.window;
	const defaults = {
		scrollerRect: {left: 200, top: 100, right: 1000, bottom: 700, width: 800, height: 600},
		composerRect: {left: 220, top: 640, right: 980, bottom: 700, width: 760, height: 60}
	};
	const fixture = {
		scrollerRect: scrollerRect === undefined ? defaults.scrollerRect : scrollerRect,
		composerRect: composerRect === undefined ? defaults.composerRect : composerRect,
		nativeRect: nativeRect || null
	};
	const nativeNode = fixture.nativeRect && {
		getBoundingClientRect: () => ({...fixture.nativeRect}),
		textContent: "已开启"
	};
	global.document = {
		querySelector: selector => {
			if (/messages-?scroller/.test(selector)) return fixture.scrollerRect ? {getBoundingClientRect: () => ({...fixture.scrollerRect})} : null;
			if (selector == "form") {
				if (!fixture.composerRect) return null;
				return {
					getBoundingClientRect: () => ({...fixture.composerRect}),
					querySelectorAll: selector => selector == "div, span" && nativeNode ? [nativeNode] : []
				};
			}
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

test("with a native hint the capsule floats above it, right-aligned", () => {
	const harness = createPositionHarness({nativeRect: {left: 900, top: 676, right: 960, bottom: 694, width: 60, height: 18}});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${960 - 180}px`, "right edge aligns with the native hint");
		assert.equal(harness.element.style.top, `${676 - 6 - 20}px`, "capsule floats 6px above the native hint");
	}
	finally {harness.restore();}
});

test("without a native hint the capsule takes the hint's row at the chat's right side", () => {
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${980 - 12 - 180}px`, "12px inside the composer's right edge");
		assert.equal(harness.element.style.top, `${700 - 6 - 20}px`, "sits on the native hint's own row under the input");
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
