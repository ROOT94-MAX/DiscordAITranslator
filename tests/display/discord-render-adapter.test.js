const test = require("node:test");
const assert = require("node:assert/strict");
const {createDiscordRenderAdapter} = require("../../src/display/discord-render-adapter");

function matchesMessageSelector(node, selector) {
	const match = selector.match(/^\[(id|data-list-item-id|aria-labelledby)(=|\$=|\*=)"((?:\\.|[^"\\])*)"\]$/);
	assert.ok(match, `unsupported message selector: ${selector}`);
	const [, attribute, operator, escapedValue] = match;
	const expectedValue = escapedValue.replace(/\\(["\\])/g, "$1");
	const actualValue = node[attribute];
	if (actualValue == null) return false;
	if (operator === "=") return actualValue === expectedValue;
	if (operator === "$=") return actualValue.endsWith(expectedValue);
	return actualValue.includes(expectedValue);
}

// The refresh primitive is the one the 2026-06 plugin shipped and users saw working:
// BDFDB.MessageUtils.rerenderAll(true) unmounts and rebuilds the chat layer, crossing
// every memo boundary. The harness models that as "one rerenderAll paints every
// mounted row's revision". React forceUpdate is never a valid target (proven no-op).
function createHarness({
	confirmOnRebuild = true,
	alreadyPainted = [],
	userScrollDuringUpdate = false,
	scrollerAvailable = true,
	availableMessageIds = ["m1", "m2"],
	messageNodeDefinitions = null,
	confirmRevisions = [["m1", 11], ["m2", 12]],
	confirmOwnerRevisions = [],
	rerenderError = null,
	rerenderScrollTop = null,
	stopDuringUpdate = false,
	startInactive = false,
	// "paint": the live per-row repaint paints every requested row;
	// "noop": rows have no usable instances, so nothing is attempted;
	// null: not injected.
	liveRepaintBehavior = null
} = {}) {
	const visibleRevisions = new Map(alreadyPainted);
	const visibleOwnerRevisions = new Map();
	const scroller = {scrollTop: 240};
	const calls = {animationFrames: 0, capture: 0, forceUpdate: 0, rerenderAll: 0, rerenderArgs: [], restored: 0, restoredNow: 0, liveRepaints: 0, sequence: []};
	const nodeDefinitions = messageNodeDefinitions || availableMessageIds.map(messageId => ({
		key: messageId,
		id: `chat-messages-${messageId}`,
		dataListItemId: `chat-messages___chat-messages-${messageId}`
	}));
	const messageNodes = nodeDefinitions.map(({key, id, dataListItemId}) => ({
		id,
		"data-list-item-id": dataListItemId,
		querySelector(selector) {
			const match = selector.match(/^\[data-translator-revision="(\d+)"\]$/);
			if (match) return visibleRevisions.get(key) === Number(match[1]) ? {} : null;
			const ownerMatch = selector.match(/^\[data-translator-preview-revision="(\d+)"\]$/);
			return ownerMatch && visibleOwnerRevisions.get(key) === Number(ownerMatch[1]) ? {} : null;
		}
	}));
	let userIntentSequence = 7;
	let runtimeActive = !startInactive;
	const document = {
		querySelector(selector) {
			if (selector === ".messages-scroller") return scrollerAvailable ? scroller : null;
			return queryMessageNodes(selector)[0] || null;
		},
		querySelectorAll(selector) {
			return queryMessageNodes(selector);
		}
	};
	function queryMessageNodes(selector) {
		if (selector === ".messages-scroller") return scrollerAvailable ? [scroller] : [];
		const selectors = selector.split(",").map(part => part.trim());
		return messageNodes.filter(node => selectors.some(part => matchesMessageSelector(node, part)));
	}
	const BDFDB = {
		dotCN: {messagesscroller: ".messages-scroller"},
		ReactUtils: {
			findOwner() {
				assert.fail("the adapter must not walk for React owners: forceUpdate has no valid target in this client");
			},
			forceUpdate() {
				calls.forceUpdate++;
				assert.fail("the adapter must not call React forceUpdate: it is a proven no-op on the message list");
			}
		},
		MessageUtils: {
			rerenderAll(instant) {
				calls.rerenderAll++;
				calls.rerenderArgs.push(instant);
				if (userScrollDuringUpdate) userIntentSequence++;
				if (stopDuringUpdate) runtimeActive = false;
				if (rerenderScrollTop != null) scroller.scrollTop = rerenderScrollTop;
				if (confirmOnRebuild) for (const [messageId, revision] of confirmRevisions) {
					if (nodeDefinitions.some(definition => definition.key === messageId)) visibleRevisions.set(messageId, revision);
				}
				if (rerenderError) throw rerenderError;
			}
		},
		PatchUtils: {
			forceAllUpdates() {
				assert.fail("DiscordRenderAdapter must not force global plugin updates");
			}
		}
	};
	const paintLikeRebuild = () => {
		if (confirmOnRebuild) for (const [messageId, revision] of confirmRevisions) {
			if (nodeDefinitions.some(definition => definition.key === messageId)) visibleRevisions.set(messageId, revision);
		}
		for (const [messageId, revision] of confirmOwnerRevisions) if (nodeDefinitions.some(definition => definition.key === messageId)) visibleOwnerRevisions.set(messageId, revision);
	};
	const liveRowRepaint = liveRepaintBehavior == null ? null : {
		repaintRows(messageIds) {
			if (liveRepaintBehavior === "noop") return [];
			if (liveRepaintBehavior === "throw") throw new Error("targeted repaint failed");
			calls.liveRepaints++;
			if (liveRepaintBehavior === "paint") paintLikeRebuild();
			return messageIds.slice();
		}
	};
	const adapter = createDiscordRenderAdapter({
		BDFDB,
		document,
		liveRowRepaint,
		requestAnimationFrame: callback => {
			calls.animationFrames++;
			calls.sequence.push("frame");
			if (userScrollDuringUpdate && liveRepaintBehavior === "paint" && calls.animationFrames === 1) userIntentSequence++;
			if (stopDuringUpdate && liveRepaintBehavior && calls.animationFrames === 1) runtimeActive = false;
			callback();
		},
		getUserScrollIntentSequence: () => userIntentSequence,
		isRuntimeActive: () => runtimeActive,
		captureScrollState: context => {
			calls.capture++;
			calls.captureContext = context;
			return {scrollTop: scroller.scrollTop};
		},
		restoreScrollState: state => {
			calls.restored++;
			calls.sequence.push("restoredDeferred");
			scroller.scrollTop = state.scrollTop;
		},
		restoreScrollStateNow: state => {
			calls.restoredNow++;
			calls.sequence.push("restoreNow");
			scroller.scrollTop = state.scrollTop;
		}
	});
	return {adapter, calls, scroller};
}

const request = {
	transactionId: 1,
	channelId: "c1",
	messageIds: ["m1", "m2"],
	views: [{messageId: "m1", revision: 11}, {messageId: "m2", revision: 12}]
};

test("ordinary and preview surfaces confirm inside one targeted transaction", async () => {
	const {adapter, calls} = createHarness({liveRepaintBehavior: "paint", confirmOwnerRevisions: [["m1", 31]]});
	const outcome = await adapter.refreshMessages({...request, ownerMessageIds: ["m1"], ownerViews: [{messageId: "m1", revision: 31}]});

	assert.equal(calls.liveRepaints, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.forceUpdate, 0);
	assert.equal(calls.capture, 1);
	assert.equal(calls.restored, 1);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.confirmedOwnerIds, ["m1"]);
	assert.deepEqual(outcome.missingIds, []);
	assert.equal(outcome.fallbackUsed, false);
});

test("rows already showing their revision skip the rebuild entirely", async () => {
	// This is what keeps scheduler retries cheap: a retry whose rows were painted by
	// the previous rebuild confirms from the DOM alone. Rebuilding again on every
	// retry is exactly the loop that froze the old plugin.
	const {adapter, calls} = createHarness({alreadyPainted: [["m1", 11], ["m2", 12]]});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 0, "already-painted rows must not cost a rebuild");
	assert.equal(calls.capture, 0);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a virtualised-only batch never rebuilds the chat", async () => {
	// Historical batches are mostly off-screen. Rebuilding for rows with no DOM node
	// was the old freeze; absent rows paint on mount from the store instead.
	const {adapter, calls} = createHarness({availableMessageIds: []});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.capture, 0);
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.deferredIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a mounted row among virtualised ones repaints only the mounted row and defers the rest", async () => {
	const {adapter, calls} = createHarness({
		availableMessageIds: ["m1"],
		confirmRevisions: [["m1", 11]],
		liveRepaintBehavior: "paint"
	});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.deferredIds, ["m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a host-only reply row repaints through its surface-specific targeted revision", async () => {
	const {adapter, calls} = createHarness({availableMessageIds: ["m2"], confirmRevisions: [], confirmOwnerRevisions: [["m2", 21]], liveRepaintBehavior: "paint"});
	const outcome = await adapter.refreshMessages({
		transactionId: 1,
		channelId: "c1",
		messageIds: [],
		ownerMessageIds: ["m2"],
		ownerViews: [{messageId: "m2", revision: 21}],
		views: []
	});

	assert.equal(calls.liveRepaints, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.confirmedOwnerIds, ["m2"]);
	assert.deepEqual(outcome.missingOwnerIds, []);
	assert.deepEqual(outcome.missingIds, []);
	assert.deepEqual(outcome.deferredIds, []);
});

test("an unmounted host row does not trigger a rebuild", async () => {
	const {adapter, calls} = createHarness({availableMessageIds: [], confirmRevisions: []});
	const outcome = await adapter.refreshMessages({
		transactionId: 1,
		channelId: "c1",
		messageIds: [],
		ownerMessageIds: ["m2"],
		views: []
	});

	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, []);
});

test("an attempted targeted transaction re-checks twice without widening either surface", async () => {
	const {adapter, calls} = createHarness({confirmOnRebuild: false, liveRepaintBehavior: "attempt"});
	const outcome = await adapter.refreshMessages({...request, ownerMessageIds: ["m1"], ownerViews: [{messageId: "m1", revision: 31}]});

	assert.equal(calls.rerenderAll, 0);
	assert.ok(calls.animationFrames >= 4, "the adapter waits a second paint before giving up");
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, ["m1", "m2"], "mounted unconfirmed rows enter the bounded scheduler retry path");
	assert.deepEqual(outcome.missingOwnerIds, ["m1"]);
	assert.deepEqual(outcome.retryOwnerIds, ["m1"]);
	assert.equal(outcome.fallbackUsed, false);
});

test("a user scroll after capture keeps the paint but skips the scroll restore", async () => {
	const {adapter, calls, scroller} = createHarness({userScrollDuringUpdate: true, liveRepaintBehavior: "paint"});
	scroller.scrollTop = 700;
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.capture, 1);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.equal(scroller.scrollTop, 700);
});

test("an already-stopped runtime cannot rebuild the chat at all", async () => {
	const {adapter, calls} = createHarness({startInactive: true});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.deferredIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, []);
});

test("a runtime stopped during targeted repaint defers both surfaces and restores nothing", async () => {
	const {adapter, calls, scroller} = createHarness({confirmOnRebuild: false, stopDuringUpdate: true, liveRepaintBehavior: "attempt"});
	scroller.scrollTop = 640;
	const outcome = await adapter.refreshMessages({...request, ownerMessageIds: ["m1"], ownerViews: [{messageId: "m1", revision: 31}]});

	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.deferredIds, ["m1", "m2"]);
	assert.deepEqual(outcome.deferredOwnerIds, ["m1"]);
	assert.deepEqual(outcome.retryIds, [], "a dead plugin instance must not schedule more repaint work");
});

test("a targeted repaint error restores unchanged scroll and preserves the render error", async () => {
	const {adapter, calls, scroller} = createHarness({liveRepaintBehavior: "throw", confirmOnRebuild: false});
	scroller.scrollTop = 510;

	await assert.rejects(adapter.refreshMessages({...request, ownerMessageIds: ["m1"], ownerViews: [{messageId: "m1", revision: 31}]}), /targeted repaint failed/);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 1);
	assert.equal(scroller.scrollTop, 510);
});

test("a missing scroller still repaints mounted rows without scroll bookkeeping", async () => {
	const {adapter, calls} = createHarness({scrollerAvailable: false, availableMessageIds: ["m2"], confirmRevisions: [["m2", 12]], liveRepaintBehavior: "paint"});
	const outcome = await adapter.refreshMessages({
		...request,
		messageIds: ["m2", "m1", "m2"],
		views: [{messageId: "m1", revision: 11}, {messageId: "m2", revision: 12}, {messageId: "m2", revision: 12}]
	});

	assert.equal(calls.capture, 0);
	assert.equal(calls.restored, 0);
	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, ["m2"]);
	assert.deepEqual(outcome.deferredIds, ["m1"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("message lookup does not acknowledge a colliding snowflake", async () => {
	const requestedId = "123456789012345678";
	const collidingId = `9${requestedId}`;
	const {adapter, calls} = createHarness({
		availableMessageIds: [collidingId],
		confirmRevisions: [[collidingId, 99]]
	});
	const outcome = await adapter.refreshMessages({
		transactionId: 2,
		channelId: "c1",
		messageIds: [requestedId],
		views: [{messageId: requestedId, revision: 31}]
	});

	assert.equal(calls.rerenderAll, 0, "an unmounted row must not cost a rebuild, colliding or not");
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.deferredIds, [requestedId]);
	assert.deepEqual(outcome.missingIds, []);
});

test("message lookup ignores a same-ID node outside supported Discord roots", async () => {
	const messageId = "223456789012345678";
	const {adapter, calls} = createHarness({
		messageNodeDefinitions: [{
			key: "wrong-subtree",
			id: `reply-preview-${messageId}`,
			dataListItemId: `reply-preview-${messageId}`
		}, {
			key: messageId,
			id: `chat-messages-${messageId}`,
			dataListItemId: `chat-messages___chat-messages-${messageId}`
		}],
		confirmRevisions: [["wrong-subtree", 41]]
	});
	const outcome = await adapter.refreshMessages({
		transactionId: 3,
		channelId: "c1",
		messageIds: [messageId],
		views: [{messageId, revision: 41}]
	});

	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, [messageId]);
	assert.deepEqual(outcome.retryIds, [messageId]);
});

test("message lookup finds rows whose list id carries unknown decorations", async () => {
	// 2026-08-16 real client (PTB 1.0.1214): the probe proved rerenderAll repaints the
	// chat, yet no transaction ever rebuilt - the exact-match selectors never matched
	// this client's data-list-item-id shapes, so every mounted row read as virtualised.
	// A row inside the chat-messages namespace that carries the message id at a token
	// boundary must still be found through the tolerant ladder.
	const messageId = "323456789012345678";
	const {adapter, calls} = createHarness({
		messageNodeDefinitions: [{
			key: messageId,
			id: `unknown-decorations-${messageId}___row`,
			dataListItemId: `chat-messages___${messageId}___message`
		}],
		confirmRevisions: [[messageId, 21]],
		liveRepaintBehavior: "paint"
	});
	const outcome = await adapter.refreshMessages({
		transactionId: 5,
		channelId: "c1",
		messageIds: [messageId],
		views: [{messageId, revision: 21}]
	});

	assert.equal(calls.rerenderAll, 0, "a mounted row in an unknown DOM shape stays on the targeted route");
	assert.deepEqual(outcome.confirmedIds, [messageId]);
	assert.deepEqual(outcome.deferredIds, []);
});

test("conflicting duplicate views remain ambiguous and unconfirmed", async () => {
	const {adapter} = createHarness({availableMessageIds: ["m1"], confirmRevisions: [["m1", 11]]});
	const outcome = await adapter.refreshMessages({
		transactionId: 4,
		channelId: "c1",
		messageIds: ["m1"],
		views: [{messageId: "m1", revision: 11}, {messageId: "m1", revision: 12}]
	});

	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, ["m1"]);
	assert.equal(outcome.fallbackUsed, false);
});

test("the scroll capture receives the transaction's message ids", async () => {
	// The viewport store scopes the manual scroll anchor to the transaction that
	// contains the anchored message; without the ids every capture is contextless
	// and the anchor either hijacks automatic transactions or never applies.
	const {adapter, calls} = createHarness();
	await adapter.refreshMessages(request);
	assert.deepEqual(calls.captureContext, {messageIds: ["m1", "m2"]});
});






test("a live row repaint satisfies the transaction with no rebuild at all", async () => {
	// The architectural fix for the 79A/0F field reading (2026-08-19): translated rows
	// repaint themselves through their registered content instances, so the common
	// case costs ZERO whole-layer rebuilds - no composer remount (icon flicker), no
	// scroll restore dance (bounce).
	const {adapter, calls} = createHarness({liveRepaintBehavior: "paint"});
	const outcome = await adapter.refreshMessages(request);

	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.equal(calls.liveRepaints, 1, "the live path ran once for the batch");
	assert.equal(calls.rerenderAll, 0, "no whole-layer rebuild when every row confirmed live");
	assert.equal(calls.restoredNow, 1, "the live path re-applies the anchor synchronously");
	const stats = adapter.getRebuildStats();
	assert.equal(stats.live, 1);
	assert.equal(stats.rebuild, 0);
});

test("ordinary rows the targeted repaint cannot confirm stay targeted and enter bounded retry", async () => {
	const {adapter, calls} = createHarness({liveRepaintBehavior: "noop"});
	const outcome = await adapter.refreshMessages(request);

	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, ["m1", "m2"]);
	assert.equal(calls.rerenderAll, 0, "an ordinary translation transaction never crosses the Composer boundary");
	const stats = adapter.getRebuildStats();
	assert.deepEqual(stats, {live: 0, rebuild: 0, rebuildsBySource: {}, recentRebuilds: []});
});

test("a reply-preview host joins an ordinary message inside the same targeted wave", async () => {
	const {adapter, calls} = createHarness({liveRepaintBehavior: "paint", confirmOwnerRevisions: [["m1", 31]]});
	const outcome = await adapter.refreshMessages(Object.assign({}, request, {ownerMessageIds: ["m1"], ownerViews: [{messageId: "m1", revision: 31}]}));

	assert.equal(calls.liveRepaints, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.confirmedOwnerIds, ["m1"]);
});

test("an unconfirmed preview host stays targeted instead of using whole-chat fallback", async () => {
	const {adapter, calls} = createHarness({liveRepaintBehavior: "attempt"});
	const outcome = await adapter.refreshMessages({channelId: "c1", messageIds: [], views: [], ownerMessageIds: ["m1"], ownerViews: [{messageId: "m1", revision: 31}]});

	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.missingOwnerIds, ["m1"]);
	assert.deepEqual(outcome.retryOwnerIds, ["m1"]);
	const stats = adapter.getRebuildStats();
	assert.equal(stats.live, 0);
	assert.equal(stats.rebuild, 0);
});

test("a targeted preview wave books no rebuild source", async () => {
	const {adapter} = createHarness({liveRepaintBehavior: "paint", confirmOwnerRevisions: [["m1", 31]]});
	await adapter.refreshMessages({channelId: "c1", messageIds: [], views: [], ownerMessageIds: ["m1"], ownerViews: [{messageId: "m1", revision: 31}], sources: {preview: 1}});

	const stats = adapter.getRebuildStats();
	assert.equal(stats.live, 1);
	assert.equal(stats.rebuild, 0);
	assert.deepEqual(stats.rebuildsBySource, {});
	assert.deepEqual(stats.recentRebuilds, []);
});

test("a transaction the live path satisfies attributes no rebuild source", async () => {
	const {adapter} = createHarness({liveRepaintBehavior: "paint"});
	await adapter.refreshMessages(Object.assign({}, request, {sources: {live: 2}}));

	const stats = adapter.getRebuildStats();
	assert.deepEqual(stats.rebuildsBySource, {});
	assert.deepEqual(stats.recentRebuilds, []);
});
