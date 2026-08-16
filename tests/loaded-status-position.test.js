const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

// Product rule (2026-08-16, fifth round): the capsule's RIGHT edge must sit on the
// same vertical line as the native hint's RIGHT edge. With a hint (slow mode etc.)
// the capsule floats directly above it; without one it takes the hint's own row.
// The hint scan scopes to the chat wrapper (the scroller's parent), because the hint
// lives outside the composer form and its exact container keeps moving.
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
	// A large wrapper whose textContent also contains the hint words must never win
	// the hint pick: matching it put the capsule on the icons above the input.
	const wrapperNode = {
		getBoundingClientRect: () => ({left: 220, top: 560, right: 980, bottom: 700, width: 760, height: 140}),
		textContent: "已开启 slow mode"
	};
	// The chat wrapper contains both the scroller and the hint strip below it.
	const chatWrapper = {
		querySelectorAll: selector => selector == "div, span" && nativeNode ? [wrapperNode, nativeNode] : []
	};
	const scroller = fixture.scrollerRect && {
		getBoundingClientRect: () => ({...fixture.scrollerRect}),
		parentElement: chatWrapper
	};
	const composer = fixture.composerRect && {getBoundingClientRect: () => ({...fixture.composerRect})};
	global.document = {
		querySelector: selector => {
			if (/messages-?scroller/.test(selector)) return scroller || null;
			if (selector == "form") return composer || null;
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

test("with a native hint the capsule's right edge aligns with the hint's right edge, above it", () => {
	const harness = createPositionHarness({nativeRect: {left: 900, top: 676, right: 960, bottom: 694, width: 60, height: 18}});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${960 - 180}px`, "the capsule's right edge shares the hint's right vertical line");
		assert.equal(harness.element.style.top, `${676 - 6 - 20}px`, "the capsule floats 6px above the hint");
	}
	finally {harness.restore();}
});

test("without a native hint the capsule takes the hint's row, right-aligned to the chat area", () => {
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1000 - 12 - 180}px`, "right edge aligns to the chat area's right edge");
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
