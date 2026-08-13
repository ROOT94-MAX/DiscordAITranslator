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

// The evidence-proven mechanism: one forceUpdate on the channel-stream owner repaints
// the whole list. The harness models that by confirming every mounted requested row
// whenever the stream owner is forced. Per-message owners no longer exist.
function createHarness({
	confirmOnFirstRefresh = true,
	userScrollDuringUpdate = false,
	scrollerAvailable = true,
	ownerAvailable = true,
	availableMessageIds = ["m1", "m2"],
	messageNodeDefinitions = null,
	confirmRevisions = [["m1", 11], ["m2", 12]],
	forceUpdateScrollTop = null,
	forceUpdateError = null,
	stopDuringUpdate = false
} = {}) {
	const visibleRevisions = new Map();
	const scroller = {scrollTop: 240, __reactFiber$abc: null};
	const calls = {animationFrames: 0, capture: 0, findOwner: 0, forceUpdate: 0, forceUpdateBatches: [], rerenderAll: 0, restored: 0};
	const nodeDefinitions = messageNodeDefinitions || availableMessageIds.map(messageId => ({
		key: messageId,
		id: `chat-messages-${messageId}`,
		dataListItemId: `chat-messages___chat-messages-${messageId}`
	}));
	const messageNodes = nodeDefinitions.map(({key, id, dataListItemId}) => ({
		id,
		"data-list-item-id": dataListItemId,
		querySelector(selector) {
			assert.ok(calls.animationFrames >= 2);
			const match = selector.match(/^\[data-translator-revision="(\d+)"\]$/);
			return match && visibleRevisions.get(key) === Number(match[1]) ? {} : null;
		}
	}));
	const streamOwner = {props: {channelStream: []}};
	let userIntentSequence = 7;
	let runtimeActive = true;
	const document = {
		querySelector(selector) {
			if (selector === ".messages-scroller") return scrollerAvailable ? scroller : null;
			const selectors = selector.split(",").map(part => part.trim());
			return messageNodes.find(node => selectors.some(part => matchesMessageSelector(node, part))) || null;
		}
	};
	function paintMountedRows() {
		for (const [messageId, revision] of confirmRevisions) {
			if (nodeDefinitions.some(definition => definition.key === messageId)) visibleRevisions.set(messageId, revision);
		}
	}
	const BDFDB = {
		dotCN: {messagesscroller: ".messages-scroller"},
		ReactUtils: {
			findOwner(node, config) {
				calls.findOwner++;
				assert.equal(config.up, true);
				assert.equal(config.unlimited, true);
				assert.equal(config.filter({props: {}}), false);
				assert.equal(config.filter(streamOwner), true);
				return node === scroller && ownerAvailable ? streamOwner : null;
			},
			forceUpdate(...targets) {
				calls.forceUpdate++;
				calls.forceUpdateBatches.push(targets);
				if (userScrollDuringUpdate) userIntentSequence++;
				if (stopDuringUpdate) runtimeActive = false;
				if (forceUpdateScrollTop != null) scroller.scrollTop = forceUpdateScrollTop;
				if (targets.includes(streamOwner) && (confirmOnFirstRefresh || calls.forceUpdate >= 2)) paintMountedRows();
				if (forceUpdateError) throw forceUpdateError;
			}
		},
		MessageUtils: {
			rerenderAll() {
				calls.rerenderAll++;
			}
		},
		PatchUtils: {
			forceAllUpdates() {
				assert.fail("DiscordRenderAdapter must not force global updates");
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
	return {adapter, calls, scroller, streamOwner};
}

const request = {
	transactionId: 1,
	channelId: "c1",
	messageIds: ["m1", "m2"],
	views: [{messageId: "m1", revision: 11}, {messageId: "m2", revision: 12}]
};

test("refreshMessages forces the channel-stream owner once and confirms exact revisions", async () => {
	const {adapter, calls, streamOwner} = createHarness();
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.findOwner, 1, "one parent owner lookup, not one per message");
	assert.equal(calls.forceUpdate, 1);
	assert.deepEqual(calls.forceUpdateBatches, [[streamOwner]]);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.animationFrames, 2);
	assert.equal(calls.restored, 1);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
	assert.equal(outcome.fallbackUsed, false);
});

test("a host-only reply row rides the one parent refresh without needing confirmation", async () => {
	const {adapter, calls} = createHarness({availableMessageIds: ["m2"], confirmRevisions: []});
	const outcome = await adapter.refreshMessages({
		transactionId: 1,
		channelId: "c1",
		messageIds: ["m1"],
		ownerMessageIds: ["m2"],
		views: [{messageId: "m1", revision: 11}]
	});

	assert.equal(calls.forceUpdate, 1, "the whole list repaints once; reply hosts are not updated separately");
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, []);
	assert.deepEqual(outcome.deferredIds, ["m1"]);
});

test("a missing direct confirmation gets one parent-refresh retry", async () => {
	const {adapter, calls} = createHarness({confirmOnFirstRefresh: false});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 2);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.animationFrames, 4);
	assert.equal(outcome.fallbackUsed, false);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a user scroll after capture keeps targeted display but skips anchor correction", async () => {
	const {adapter, calls, scroller} = createHarness({confirmOnFirstRefresh: false, userScrollDuringUpdate: true});
	scroller.scrollTop = 700;
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.capture, 1);
	assert.equal(calls.restored, 0);
	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
	assert.equal(scroller.scrollTop, 700);
});

test("a stopped runtime cannot remount chat or restore stale scroll after an async paint", async () => {
	const {adapter, calls, scroller} = createHarness({confirmOnFirstRefresh: false, stopDuringUpdate: true});
	scroller.scrollTop = 640;
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.deferredIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, [], "a dead plugin instance must not schedule more repaint work");
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

	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.deferredIds, [requestedId]);
	assert.deepEqual(outcome.missingIds, []);
	assert.equal(outcome.fallbackUsed, false);
	assert.equal(calls.rerenderAll, 0);
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

	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, [messageId]);
	assert.equal(outcome.fallbackUsed, false);
	assert.equal(calls.rerenderAll, 0);
});

test("conflicting duplicate views remain ambiguous and unconfirmed", async () => {
	const {adapter, calls} = createHarness({availableMessageIds: ["m1"], confirmRevisions: [["m1", 11]]});
	const outcome = await adapter.refreshMessages({
		transactionId: 4,
		channelId: "c1",
		messageIds: ["m1"],
		views: [{messageId: "m1", revision: 11}, {messageId: "m1", revision: 12}]
	});

	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, ["m1"]);
	assert.equal(outcome.fallbackUsed, false);
	assert.equal(calls.rerenderAll, 0);
});

test("a missing channel-stream owner reports the mounted rows and restores unchanged scroll", async () => {
	const {adapter, calls, scroller} = createHarness({ownerAvailable: false});
	scroller.scrollTop = 480;
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.capture, 1);
	assert.equal(calls.findOwner, 1);
	assert.equal(calls.forceUpdate, 0);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 1);
	assert.equal(scroller.scrollTop, 480);
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, ["m1", "m2"]);
	assert.equal(outcome.fallbackUsed, false);
});

test("a forceUpdate error restores unchanged scroll and preserves the render error", async () => {
	const renderError = new Error("forceUpdate failed");
	const {adapter, calls, scroller} = createHarness({forceUpdateScrollTop: 910, forceUpdateError: renderError});
	scroller.scrollTop = 510;

	await assert.rejects(adapter.refreshMessages(request), error => error === renderError);
	assert.equal(calls.forceUpdate, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 1);
	assert.equal(scroller.scrollTop, 510);
});

test("missing scroller still confirms via the fiber walk after a targeted update", async () => {
	// No scroller element means no scroll capture, but the message rows still mount and
	// the owner walk can find the channel-stream fiber from a message row's ancestors.
	const {adapter, calls} = createHarness({scrollerAvailable: false, availableMessageIds: ["m2"], ownerAvailable: false});
	const outcome = await adapter.refreshMessages({
		...request,
		messageIds: ["m2", "m1", "m2"],
		views: [{messageId: "m1", revision: 11}, {messageId: "m2", revision: 12}, {messageId: "m2", revision: 12}]
	});

	assert.equal(calls.capture, 0);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.deferredIds, ["m1"]);
	assert.equal(outcome.fallbackUsed, false);
});

test("virtualised rows do not trigger any full-list fallback", async () => {
	const {adapter, calls} = createHarness({
		availableMessageIds: ["m1"],
		confirmRevisions: [["m1", 11]]
	});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 0, "an off-screen row must never cost a full remount");
	assert.equal(outcome.fallbackUsed, false);
	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.deferredIds, ["m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a mounted row with a stale revision gets one parent-refresh retry", async () => {
	const {adapter, calls} = createHarness({
		availableMessageIds: ["m1"],
		confirmOnFirstRefresh: false,
		confirmRevisions: [["m1", 11]]
	});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 2);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(outcome.fallbackUsed, false);
	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.deferredIds, ["m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("an unconfirmed mounted row enters the bounded retry path without remounting the chat", async () => {
	const {adapter, calls} = createHarness({availableMessageIds: ["m1", "m2"], confirmOnFirstRefresh: false, confirmRevisions: []});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 2);
	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.missingIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, ["m1", "m2"], "mounted rows that missed confirmation must enter the bounded repaint retry path");
	assert.equal(outcome.fallbackUsed, false);
});
