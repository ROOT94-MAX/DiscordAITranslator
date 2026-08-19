const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

// Restored original positioning (git 53ee75d): anchor on the composer's textarea,
// right-align above a native slow-mode hint when one passes the proximity guards,
// otherwise sit directly above the input. The guards exist so a slow-mode-like node
// anywhere else in the DOM (the icon row above the input) is rejected - matching it
// once floated the capsule onto the icons.
function createPositionHarness({anchorRect, hintNodes, deepHintNodes} = {}) {
	const realDocument = global.document;
	const realWindow = global.window;
	const defaults = {
		anchorRect: {left: 820, top: 1127, right: 1493, bottom: 1185, width: 673, height: 58}
	};
	const anchor = anchorRect === undefined ? defaults.anchorRect : anchorRect;
	// Only the composer's own parent is scanned (the scope the shipped 0.3.32 plugin
	// proved on older clients). Deeper levels exist in the fixture and count their
	// queries: a scan that ever reaches them is a regression of the flicker kind.
	const makeLevel = rect => ({getBoundingClientRect: () => rect, querySelectorAll: () => [], parentElement: null});
	const countInto = (counter, nodes) => selector => {
		if (selector != "div, span") return [];
		counter.count++;
		return nodes || [];
	};
	const counters = {parent: {count: 0}, deep: {count: 0}};
	const composerWrapper = makeLevel({left: 820, top: 1120, right: 1493, bottom: 1193});
	composerWrapper.querySelectorAll = countInto(counters.parent, hintNodes);
	const levelTwo = makeLevel({left: 820, top: 1100, right: 1501, bottom: 1193});
	const hintScope = makeLevel({left: 820, top: 1100, right: 1501, bottom: 1193});
	levelTwo.querySelectorAll = hintScope.querySelectorAll = countInto(counters.deep, deepHintNodes);
	composerWrapper.parentElement = levelTwo;
	levelTwo.parentElement = hintScope;
	const anchorNode = anchor && {
		getBoundingClientRect: () => ({...anchor}),
		parentElement: composerWrapper
	};
	// Live anchor state, so a test can unmount the composer mid-run the way a
	// whole-layer rebuild does on the real client.
	const domState = {anchorNode};
	const plugin = createPluginInstance({callSetLanguages: false});
	// Set after instance creation: createPluginInstance replaces global.window itself.
	global.document = {
		querySelectorAll: selector => selector == '[class*="channelTextArea"]' || selector == 'form [role="textbox"]' ? (domState.anchorNode ? [domState.anchorNode] : []) : []
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
		levelScans: () => counters.parent.count,
		deepScans: () => counters.deep.count,
		removeAnchor() {domState.anchorNode = null;},
		restore() {
			global.document = realDocument;
			global.window = realWindow;
		}
	};
}

function hintNode(rect) {
	// isConnected is boolean true on every attached DOM node; the cache's liveness
	// check treats a missing flag as a disconnected node and would rescan per tick.
	return {getBoundingClientRect: () => ({...rect}), textContent: "已开启", isConnected: true};
}

test("with a passing slow-mode hint the capsule floats above it, right edges aligned", () => {
	const harness = createPositionHarness({hintNodes: [hintNode({left: 1430, top: 1101, right: 1490, bottom: 1117, width: 60, height: 16})]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.right, `${1520 - 1490}px`, "the capsule's right edge shares the hint's right vertical line");
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
		assert.equal(harness.element.style.right, `${1520 - 1501}px`, "the capsule's right edge lands on the hint's right edge (1501)");
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
		assert.equal(harness.element.style.right, `${1520 - 1490}px`, "the capsule's right edge shares the below-input hint's right edge");
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
		assert.equal(harness.element.style.right, `${1520 - 1493 + 12}px`, "falls back to the composer's right edge");
		assert.equal(harness.element.style.top, `${1127 - 20 - 8}px`, "sits directly above the input, never on the icons");
	}
	finally {harness.restore();}
});

test("without any hint the capsule hugs the input, 8px above its top edge", () => {
	// The user-verified position (2026-08-19 decision): a 26px "hint-strip clearance"
	// experiment made the capsule float over message content and read as drift, so the
	// fallback returned to hugging the input. Overlap with a real slow-mode strip is
	// owned by detection, not by fallback distance.
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.right, `${1520 - 1493 + 12}px`);
		assert.equal(harness.element.style.top, `${1127 - 20 - 8}px`);
	}
	finally {harness.restore();}
});

test("a cached hint whose live rect collapses is dropped instead of aligning the capsule to the viewport origin", () => {
	// Discord can hide the strip while the node stays connected (rect collapses to
	// zero). Aligning to that rect flung the capsule to the top-left corner - one of
	// the "old capsule residue" jumps reported 2026-08-19.
	const liveRect = {left: 1361, top: 1103, right: 1501, bottom: 1126, width: 140, height: 23};
	const node = {getBoundingClientRect: () => ({...liveRect}), textContent: "已开启", isConnected: true};
	const harness = createPositionHarness({hintNodes: [node]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.top, `${1103 - 20 - 8}px`, "setup: aligned above the live hint");

		Object.assign(liveRect, {left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0});
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);

		assert.equal(harness.element.style.right, `${1520 - 1493 + 12}px`, "falls back to the composer's right edge");
		assert.equal(harness.element.style.top, `${1127 - 20 - 8}px`, "falls back above the input, never the viewport corner");
	}
	finally {harness.restore();}
});

test("losing the composer anchor mid-rebuild keeps the capsule's last position", () => {
	// Every display transaction rebuilds the whole chat layer; for a frame the
	// composer is unmounted. Teleporting to the legacy bottom-right corner and back
	// is the other "old capsule residue" jump (2026-08-19). A capsule that was
	// already positioned holds its spot until an anchor exists again.
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		const right = harness.element.style.right;
		const top = harness.element.style.top;
		assert.ok(right && top, "setup: the capsule was positioned from the anchor");

		harness.removeAnchor();
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);

		assert.equal(harness.element.style.right, right, "anchor loss must not move the capsule");
		assert.equal(harness.element.style.top, top, "anchor loss must not move the capsule");
	}
	finally {harness.restore();}
});

test("without a composer anchor the capsule falls back to the viewport's bottom-right", () => {
	const harness = createPositionHarness({anchorRect: null});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.right, "108px");
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

test("a repeated heartbeat tick on the same composer costs zero hint scans", () => {
	// Real-client regression (2026-08-16): the once-per-second heartbeat re-ran the
	// ancestor walk every tick and read textContent across the composer subtrees each
	// second - the same layout-thrash flicker as the old document-wide scan. The scan
	// result is cached per anchor: a second positioning pass must not rescan.
	const harness = createPositionHarness();
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		const firstPassScans = harness.levelScans();
		assert.ok(firstPassScans >= 1, "setup: the first pass scans the composer levels");

		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);

		assert.equal(harness.levelScans(), firstPassScans, "heartbeat ticks reuse the cached scan result");
	}
	finally {harness.restore();}
});

test("a hint living beyond the composer's parent is found and the capsule sits above it", () => {
	// Real-client evidence (2026-08-19 screenshot): the slow-mode hint renders in a
	// scope above the composer's parent, which is why the parent-only scan missed it
	// 149 times while the capsule covered the hint. The widened walk may read the
	// deeper scopes - the 2026-08-16 flicker lesson lives in the CACHE contract
	// below, not in the scope: cost came from per-tick rescans, never from depth.
	const harness = createPositionHarness({deepHintNodes: [hintNode({left: 1361, top: 1103, right: 1501, bottom: 1126, width: 140, height: 23})]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.right, `${1520 - 1501}px`, "right edges align to the hint");
		assert.equal(harness.element.style.top, `${1103 - 20 - 8}px`, "the capsule sits directly above the hint");
		const firstPassDeepScans = harness.deepScans();
		assert.ok(firstPassDeepScans >= 1, "setup: the deep scope was scanned once");

		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.deepScans(), firstPassDeepScans, "heartbeat ticks must reuse the cached deep result, never rescan per tick");
	}
	finally {harness.restore();}
});

test("the innermost text node wins over its wider wrapper, so the pill hugs the visible text", () => {
	// 2026-08-19 report: with a hint present the pill overflowed the border. The DOM
	// wraps the slow-mode text in wider containers whose textContent also matches;
	// the old right+bottom score always picked the widest wrapper, whose right edge
	// sits past the visible text (guards allow up to anchor.right + 24). Selection
	// must prefer the smallest matching node - the text itself.
	const wrapper = hintNode({left: 1300, top: 1101, right: 1510, bottom: 1121, width: 210, height: 20});
	const textSpan = hintNode({left: 1430, top: 1103, right: 1490, bottom: 1117, width: 60, height: 14});
	const harness = createPositionHarness({hintNodes: [wrapper, textSpan]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.right, `${1520 - 1490}px`, "the pill's right edge lands on the text span, not the wrapper");
		assert.equal(harness.element.style.top, `${1103 - 20 - 8}px`, "the pill sits directly above the text span");
	}
	finally {harness.restore();}
});

test("slow-mode-like text inside a message row is never mistaken for the native hint", () => {
	// Real-client evidence (2026-08-19 screenshot): the 3-level ancestor walk can
	// reach a scope containing the message list, and translated messages routinely
	// contain 已开启 / slow mode as ordinary text. The last message's lines sit exactly
	// in the proximity band above the input, and the smallest-node rule then aligned
	// the capsule onto a MESSAGE instead of Discord's hint strip. Anything inside a
	// message row or the messages scroller is structurally rejected.
	const messageTextNode = {
		getBoundingClientRect: () => ({left: 1400, top: 1101, right: 1490, bottom: 1117, width: 90, height: 16}),
		textContent: "慢速模式已开启",
		isConnected: true,
		closest: selector => String(selector).includes("chat-messages") ? {} : null
	};
	const harness = createPositionHarness({hintNodes: [messageTextNode]});
	try {
		harness.plugin.positionLoadedAutoTranslationStatusElement(harness.element);
		assert.equal(harness.element.style.right, `${1520 - 1493 + 12}px`, "falls back to the composer's right edge");
		assert.equal(harness.element.style.top, `${1127 - 20 - 8}px`, "the capsule must not align to message text");
	}
	finally {harness.restore();}
});
