const test = require("node:test");
const assert = require("node:assert/strict");
const {createDiscordRenderAdapter} = require("../../src/display/discord-render-adapter");

function matchesMessageSelector(node, selector) {
	const match = selector.match(/^\[(id|data-list-item-id)(=|\$=|\*=)"((?:\\.|[^"\\])*)"\]$/);
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
	startInactive = false
} = {}) {
	const visibleRevisions = new Map(alreadyPainted);
	const scroller = {scrollTop: 240};
	const calls = {animationFrames: 0, capture: 0, forceUpdate: 0, rerenderAll: 0, rerenderArgs: [], restored: 0};
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
			const selectors = selector.split(",").map(part => part.trim());
			return messageNodes.find(node => selectors.some(part => matchesMessageSelector(node, part))) || null;
		}
	};
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
	const adapter = createDiscordRenderAdapter({
		BDFDB,
		document,
		requestAnimationFrame: callback => {
			calls.animationFrames++;
			callback();
		},
		getUserScrollIntentSequence: () => userIntentSequence,
		isRuntimeActive: () => runtimeActive,
		captureScrollState: () => {
			calls.capture++;
			return {scrollTop: scroller.scrollTop};
		},
		restoreScrollState: state => {
			calls.restored++;
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
