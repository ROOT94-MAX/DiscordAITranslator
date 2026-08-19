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
	rerenderError = null,
	rerenderScrollTop = null,
	stopDuringUpdate = false,
	startInactive = false,
	// "paint": the atomic rebuild succeeds and paints like a rebuild would;
	// "reject": it reports false so the adapter must fall back to rerenderAll;
	// null: not injected - the production default, which cannot run without
	// ReactDOM.flushSync and therefore also falls back.
	atomicRebuildBehavior = null,
	// "paint": the live per-row repaint paints every requested row;
	// "noop": rows have no usable instances, so nothing is attempted;
	// null: not injected.
	liveRepaintBehavior = null
} = {}) {
	const visibleRevisions = new Map(alreadyPainted);
	const scroller = {scrollTop: 240};
	const calls = {animationFrames: 0, capture: 0, forceUpdate: 0, rerenderAll: 0, rerenderArgs: [], restored: 0, restoredNow: 0, atomicRebuilds: 0, liveRepaints: 0, sequence: []};
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
			return match && visibleRevisions.get(key) === Number(match[1]) ? {} : null;
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
	};
	const atomicChatRebuild = atomicRebuildBehavior == null ? null : {
		rebuildOnce() {
			calls.atomicRebuilds++;
			if (atomicRebuildBehavior === "reject") return false;
			paintLikeRebuild();
			return true;
		}
	};
	const liveRowRepaint = liveRepaintBehavior == null ? null : {
		repaintRows(messageIds) {
			if (liveRepaintBehavior === "noop") return [];
			calls.liveRepaints++;
			paintLikeRebuild();
			return messageIds.slice();
		}
	};
	const adapter = createDiscordRenderAdapter({
		BDFDB,
		document,
		atomicChatRebuild,
		liveRowRepaint,
		requestAnimationFrame: callback => {
			calls.animationFrames++;
			calls.sequence.push("frame");
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

test("refreshMessages rebuilds the chat layer once and confirms exact revisions", async () => {
	const {adapter, calls} = createHarness();
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 1, "one transaction costs exactly one chat-layer rebuild");
	assert.deepEqual(calls.rerenderArgs, [true], "the rebuild must be the instant variant");
	assert.equal(calls.forceUpdate, 0);
	assert.equal(calls.capture, 1);
	assert.equal(calls.restored, 1);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
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

test("a mounted row among virtualised ones rebuilds once and defers the rest", async () => {
	const {adapter, calls} = createHarness({
		availableMessageIds: ["m1"],
		confirmRevisions: [["m1", 11]]
	});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 1);
	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.deferredIds, ["m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a host-only reply row still gets the one rebuild it needs", async () => {
	// Reply-preview hosts carry no revision marker of their own; a mounted host is
	// reason enough to rebuild so the preview repaints with the list.
	const {adapter, calls} = createHarness({availableMessageIds: ["m2"], confirmRevisions: []});
	const outcome = await adapter.refreshMessages({
		transactionId: 1,
		channelId: "c1",
		messageIds: [],
		ownerMessageIds: ["m2"],
		views: []
	});

	assert.equal(calls.rerenderAll, 1);
	assert.deepEqual(outcome.confirmedIds, []);
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

test("a rebuild that does not confirm re-checks after another paint but never rebuilds twice", async () => {
	const {adapter, calls} = createHarness({confirmOnRebuild: false});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 1, "a transaction must never remount the chat twice");
	assert.ok(calls.animationFrames >= 4, "the adapter waits a second paint before giving up");
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, ["m1", "m2"], "mounted unconfirmed rows enter the bounded scheduler retry path");
	assert.equal(outcome.fallbackUsed, false);
});

test("a user scroll after capture keeps the paint but skips the scroll restore", async () => {
	const {adapter, calls, scroller} = createHarness({userScrollDuringUpdate: true});
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

test("a runtime stopped during the rebuild defers everything and restores nothing", async () => {
	const {adapter, calls, scroller} = createHarness({confirmOnRebuild: false, stopDuringUpdate: true});
	scroller.scrollTop = 640;
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 1);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.deferredIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, [], "a dead plugin instance must not schedule more repaint work");
});

test("a rerenderAll error restores unchanged scroll and preserves the render error", async () => {
	const renderError = new Error("rerenderAll failed");
	const {adapter, calls, scroller} = createHarness({rerenderScrollTop: 910, rerenderError: renderError, confirmOnRebuild: false});
	scroller.scrollTop = 510;

	await assert.rejects(adapter.refreshMessages(request), error => error === renderError);
	assert.equal(calls.rerenderAll, 1);
	assert.equal(calls.restored, 1);
	assert.equal(scroller.scrollTop, 510);
});

test("a missing scroller still rebuilds for mounted rows without scroll bookkeeping", async () => {
	const {adapter, calls} = createHarness({scrollerAvailable: false, availableMessageIds: ["m2"], confirmRevisions: [["m2", 12]]});
	const outcome = await adapter.refreshMessages({
		...request,
		messageIds: ["m2", "m1", "m2"],
		views: [{messageId: "m1", revision: 11}, {messageId: "m2", revision: 12}, {messageId: "m2", revision: 12}]
	});

	assert.equal(calls.capture, 0);
	assert.equal(calls.restored, 0);
	assert.equal(calls.rerenderAll, 1);
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

	assert.equal(calls.rerenderAll, 1);
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, [messageId]);
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
		confirmRevisions: [[messageId, 21]]
	});
	const outcome = await adapter.refreshMessages({
		transactionId: 5,
		channelId: "c1",
		messageIds: [messageId],
		views: [{messageId, revision: 21}]
	});

	assert.equal(calls.rerenderAll, 1, "a mounted row in an unknown DOM shape must still trigger its rebuild");
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

test("rows the live repaint cannot confirm fall through to the rebuild in the same transaction", async () => {
	const {adapter, calls} = createHarness({liveRepaintBehavior: "noop"});
	const outcome = await adapter.refreshMessages(request);

	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.equal(calls.rerenderAll, 1, "the rebuild still owns rows the live path could not paint");
	const stats = adapter.getRebuildStats();
	assert.equal(stats.live, 0);
	assert.equal(stats.rebuild, 1);
});

test("a reply-preview host still requires the rebuild, so the live path steps aside", async () => {
	const {adapter, calls} = createHarness({liveRepaintBehavior: "paint"});
	const outcome = await adapter.refreshMessages(Object.assign({}, request, {ownerMessageIds: ["m1"]}));

	assert.equal(calls.liveRepaints, 0, "preview hosts have no per-row paint yet");
	assert.equal(calls.rerenderAll, 1);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
});

test("the rebuild step is BDFDB's debounced rerenderAll again - the synchronous atomic rebuild is retired", async () => {
	// Field verdict (2026-08-19 evening, "0L/56A/0F" + user report): the atomic
	// double-flush ran synchronously once per transaction with no cross-call
	// debounce, so message streams turned into per-message heavyweight rebuilds -
	// the composer icon blinked on every message and scrolling stuttered. BDFDB's
	// rerenderAll defers and merges; the field says it feels strictly better.
	const {adapter, calls} = createHarness({atomicRebuildBehavior: "paint"});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.atomicRebuilds, 0, "the adapter must not run the synchronous atomic rebuild");
	assert.equal(calls.rerenderAll, 1, "the rebuild goes through BDFDB's deferred, self-merging primitive");
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	const stats = adapter.getRebuildStats();
	assert.equal(stats.live, 0);
	assert.equal(stats.rebuild, 1);
});

test("a rebuild attributes itself to the transaction's trigger sources", async () => {
	// Cadence audit 2026-08-19: the settings counters must answer WHICH lane is
	// rebuilding (live, cached, historical, manual, retry), not just how often. The
	// transaction carries its source counts and the adapter books the rebuild once
	// per source present, plus a small ring for later inspection.
	const {adapter} = createHarness({liveRepaintBehavior: "noop"});
	await adapter.refreshMessages(Object.assign({}, request, {sources: {historical: 2}}));

	const stats = adapter.getRebuildStats();
	assert.equal(stats.rebuild, 1);
	assert.deepEqual(stats.rebuildsBySource, {historical: 1}, "one transaction books once per source present");
	assert.equal(stats.recentRebuilds.length, 1);
	assert.equal(stats.recentRebuilds[0].size, 2);
	assert.deepEqual(stats.recentRebuilds[0].sources, {historical: 2});
	assert.equal(typeof stats.recentRebuilds[0].at, "number");
});

test("a transaction the live path satisfies attributes no rebuild source", async () => {
	const {adapter} = createHarness({liveRepaintBehavior: "paint"});
	await adapter.refreshMessages(Object.assign({}, request, {sources: {live: 2}}));

	const stats = adapter.getRebuildStats();
	assert.deepEqual(stats.rebuildsBySource, {});
	assert.deepEqual(stats.recentRebuilds, []);
});
