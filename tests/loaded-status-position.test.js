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
		anchorRect: {left: 820, top: 1127, right: 1493, bottom: 1185, width: 673, height: 58}
	};
	const anchor = anchorRect === undefined ? defaults.anchorRect : anchorRect;
	const anchorNode = anchor && {
		getBoundingClientRect: () => ({...anchor})
	};
	const plugin = createPluginInstance({callSetLanguages: false});
	// Set after instance creation: createPluginInstance replaces global.window itself.
	global.document = {
		querySelectorAll: selector => {
			if (selector == 'div, span') return hintNodes || [];
			return selector == '[class*="channelTextArea"]' || selector == 'form [role="textbox"]' ? (anchorNode ? [anchorNode] : []) : [];
		}
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

test("real-client geometry: the typing-strip cooldown hint aligns the capsule exactly", () => {
	// Recorded survey (2026-08-16, PTB 1.0.1214): anchor right 1493, cooldownWrapper
	// right 1501 top 1103. The capsule's right edge must land on 1501 - the hint's own
	// right edge - not clamped back to the narrower composer edge.
	const harness = createPositionHarness({hintNodes: [hintNode({left: 1361, top: 1103, right: 1501, bottom: 1126, width: 140, height: 23})]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1501 - 180}px`, "the capsule's right edge lands on the hint's right edge (1501)");
		assert.equal(harness.element.style.top, `${1103 - 20 - 8}px`, "the capsule floats 8px above the cooldown strip");
	}
	finally {harness.restore();}
});

test("a hint in the strip below the input (this client's layout) is accepted and aligned", () => {
	// Probe evidence (2026-08-16, PTB 1.0.1214): 51/51 positioning runs detected no
	// hint because the restored guards only accept the old client's above-input strip,
	// while this client renders 已开启 BELOW the input. A below-input hint must pass
	// the guards so the capsule stacks above it with both right edges on one line.
	const harness = createPositionHarness({hintNodes: [hintNode({left: 1430, top: 1201, right: 1490, bottom: 1217, width: 60, height: 16})]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1490 - 180}px`, "the capsule's right edge shares the below-input hint's right edge");
		assert.equal(harness.element.style.top, `${1201 - 20 - 8}px`, "the capsule floats 8px above the hint");
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
		assert.equal(harness.element.style.left, `${1493 - 12 - 180}px`, "falls back to the composer's right edge");
		assert.equal(harness.element.style.top, `${1127 - 20 - 8}px`, "sits directly above the input, never on the icons");
	}
	finally {harness.restore();}
});

test("without any hint the capsule sits directly above the input, right-aligned", () => {
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.left, `${1493 - 12 - 180}px`);
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

test("a retry-state capsule disappears once the user leaves its channel", async () => {
	const realDocument = global.document;
	let selectedChannelId = "channel-a";
	const elements = new Map();
	const created = [];
	global.document = {
		body: {appendChild: node => elements.set(node.id, node)},
		querySelector: () => null,
		querySelectorAll: () => [],
		getElementById: id => elements.get(id) || null,
		createElement: () => {
			const node = {
				style: {},
				children: [],
				appendChild: child => node.children.push(child),
				querySelector: () => null,
				remove: () => elements.delete("DiscordAITranslator-loaded-status"),
				getBoundingClientRect: () => ({width: 120, height: 20})
			};
			created.push(node);
			return node;
		}
	};
	const plugin = createPluginInstance({callSetLanguages: false});
	plugin.getReceivedAutoTranslateScope = () => "loaded_messages";
	plugin.isTranslationEnabled = () => true;
	global.window.addEventListener = () => {};
	global.window.removeEventListener = () => {};
	const BDFDB = plugin._testBdfdb;
	BDFDB.LibraryStores.SelectedChannelStore = {getChannelId: () => selectedChannelId};
	plugin.attachAutoTranslationScrollWatcher = () => {};
	plugin.ensureLoadedAutoTranslationStatusPositionWatcher = () => {};
	plugin.updateLoadedAutoTranslationStatus({active: false, done: true, channelId: "channel-a", total: 10, processed: 10, displayed: 9, retryable: 1, failed: 1});
	assert.equal(!!global.document.getElementById("DiscordAITranslator-loaded-status"), true, "setup: the retry capsule is visible in its channel");

	selectedChannelId = "channel-b";
	await new Promise(resolve => setTimeout(resolve, 1150));

	assert.equal(!!global.document.getElementById("DiscordAITranslator-loaded-status"), false, "the capsule must not linger over unrelated surfaces after leaving the channel");
	delete global.window.addEventListener;
	delete global.window.removeEventListener;
	global.document = realDocument;
});
