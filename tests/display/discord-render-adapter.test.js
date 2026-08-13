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

function createHarness({
	confirmDirectly = true,
	userScrollDuringUpdate = false,
	scrollerAvailable = true,
	ownerAvailable = true,
	availableMessageIds = ["m1", "m2"],
	messageNodeDefinitions = null,
	directRevisions = [["m1", 11], ["m2", 12]],
	fallbackRevisions = [["m1", 11], ["m2", 12]],
	forceUpdateScrollTop = null,
	forceUpdateError = null,
	fallbackScrollTop = null,
	fallbackError = null,
	stopDuringUpdate = false
} = {}) {
	const visibleRevisions = new Map();
	const scroller = {scrollTop: 240};
	const calls = {animationFrames: 0, capture: 0, findOwner: 0, forceUpdate: 0, forceUpdateBatches: [], rerenderAll: 0, restored: 0, timeouts: 0};
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
	const messageOwners = new Map(nodeDefinitions.map(({key}) => [key, {props: {message: {id: key}}}]));
	let userIntentSequence = 7;
	let runtimeActive = true;
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
			findOwner(node, config) {
				calls.findOwner++;
				assert.equal(config.up, true);
				assert.equal(config.unlimited, true);
				assert.equal(config.filter({props: {}}), false);
				const index = messageNodes.indexOf(node);
				if (index < 0 || !ownerAvailable) return null;
				const owner = messageOwners.get(nodeDefinitions[index].key);
				assert.equal(config.filter(owner), true);
				return owner;
			},
			forceUpdate(...targets) {
				calls.forceUpdate++;
				calls.forceUpdateBatches.push(targets);
				if (userScrollDuringUpdate) userIntentSequence++;
				if (stopDuringUpdate) runtimeActive = false;
				if (forceUpdateScrollTop != null) scroller.scrollTop = forceUpdateScrollTop;
				const revisions = confirmDirectly ? directRevisions : calls.forceUpdate >= 2 ? fallbackRevisions : [];
				for (const [messageId, revision] of revisions) if (targets.includes(messageOwners.get(messageId))) visibleRevisions.set(messageId, revision);
				if (forceUpdateError) throw forceUpdateError;
			}
		},
		MessageUtils: {
			rerenderAll(instant) {
				assert.equal(instant, true);
				calls.rerenderAll++;
				for (const [messageId, revision] of fallbackRevisions) visibleRevisions.set(messageId, revision);
				if (fallbackScrollTop != null) scroller.scrollTop = fallbackScrollTop;
				if (fallbackError) throw fallbackError;
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
		setTimeout: (callback, delay) => {
			assert.equal(delay, 0);
			calls.timeouts++;
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

test("refreshMessages forces exact message owners and confirms exact revisions", async () => {
	const {adapter, calls} = createHarness();
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.findOwner, 2);
	assert.equal(calls.forceUpdate, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.animationFrames, 2);
	assert.equal(calls.restored, 1);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
	assert.equal(outcome.fallbackUsed, false);
});

test("a host-only reply row joins the same owner update without revision confirmation", async () => {
	const {adapter, calls} = createHarness({availableMessageIds: ["m2"], directRevisions: []});
	const outcome = await adapter.refreshMessages({
		transactionId: 1,
		channelId: "c1",
		messageIds: ["m1"],
		ownerMessageIds: ["m2"],
		views: [{messageId: "m1", revision: 11}]
	});

	assert.equal(calls.forceUpdate, 1);
	assert.deepEqual(calls.forceUpdateBatches[0].map(owner => owner.props.message.id), ["m2"]);
	assert.deepEqual(outcome.confirmedIds, []);
	assert.deepEqual(outcome.missingIds, []);
	assert.deepEqual(outcome.deferredIds, ["m1"]);
});

test("a missing direct confirmation gets one targeted retry", async () => {
	const {adapter, calls} = createHarness({confirmDirectly: false});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 2);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.animationFrames, 4);
	assert.equal(calls.timeouts, 0);
	assert.equal(outcome.fallbackUsed, false);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a mounted loading row resolves its exact message owner from the patched descendant", async () => {
	const loadingNode = {className: "translator-translation-loading"};
	const owner = {props: {message: {id: "m1"}}};
	let visibleRevision = null;
	const messageNode = {
		id: "chat-messages-m1",
		querySelector(selector) {
			if (selector === ".translator-translation-loading") return loadingNode;
			if (selector === '[data-translator-revision="11"]') return visibleRevision === 11 ? {} : null;
			return null;
		}
	};
	const ownerStarts = [];
	const adapter = createDiscordRenderAdapter({
		BDFDB: {
			dotCN: {messagesscroller: ".messages-scroller"},
			ReactUtils: {
				findOwner(node, config) {
					ownerStarts.push(node);
					return node === loadingNode && config.filter(owner) ? owner : null;
				},
				forceUpdate(...owners) {
					assert.deepEqual(owners, [owner]);
					visibleRevision = 11;
				}
			}
		},
		document: {
			querySelector(selector) {
				if (selector === ".messages-scroller") return null;
				return selector.includes('chat-messages-m1') ? messageNode : null;
			}
		},
		requestAnimationFrame: callback => callback(),
		getUserScrollIntentSequence: () => 1,
		captureScrollState: () => null,
		restoreScrollState: () => {}
	});

	const outcome = await adapter.refreshMessages({
		transactionId: 2,
		channelId: "c1",
		messageIds: ["m1"],
		views: [{messageId: "m1", revision: 11}]
	});

	assert.deepEqual(ownerStarts, [messageNode, loadingNode]);
	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a user scroll after capture keeps targeted display but skips anchor correction", async () => {
	const {adapter, calls, scroller} = createHarness({confirmDirectly: false, userScrollDuringUpdate: true});
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
	const {adapter, calls, scroller} = createHarness({confirmDirectly: false, stopDuringUpdate: true});
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
	// The collider carries the WRONG revision on purpose: if the adapter matched it,
	// the requested id would read as mounted-but-stale and the fallback would fire.
	// Correctly refusing the collision leaves the requested id unmounted, so its
	// acknowledgement stays deferred until that row mounts.
	const {adapter, calls} = createHarness({
		availableMessageIds: [collidingId],
		directRevisions: [[collidingId, 99]],
		fallbackRevisions: []
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
		directRevisions: [["wrong-subtree", 41]],
		fallbackRevisions: []
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
	const {adapter, calls} = createHarness({availableMessageIds: ["m1"], fallbackRevisions: [["m1", 11]]});
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

test("a missing message owner reports the mounted rows and restores unchanged scroll", async () => {
	const {adapter, calls, scroller} = createHarness({ownerAvailable: false, fallbackScrollTop: 900});
	scroller.scrollTop = 480;
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.capture, 1);
	assert.equal(calls.findOwner, 4);
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

test("missing DOM state returns stable unique IDs after a targeted update", async () => {
	const {adapter, calls} = createHarness({scrollerAvailable: false, availableMessageIds: ["m2"]});
	const outcome = await adapter.refreshMessages({
		...request,
		messageIds: ["m2", "m1", "m2"],
		views: [{messageId: "m1", revision: 11}, {messageId: "m2", revision: 12}, {messageId: "m2", revision: 12}]
	});

	assert.equal(calls.capture, 0);
	assert.equal(calls.findOwner, 1);
	assert.equal(calls.forceUpdate, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 0);
	assert.deepEqual(outcome.confirmedIds, ["m2"]);
	assert.deepEqual(outcome.deferredIds, ["m1"]);
	assert.deepEqual(outcome.missingIds, []);
	assert.equal(outcome.fallbackUsed, false);
});

test("virtualised rows do not trigger the full-list fallback", async () => {
	// Discord virtualises the message list, so most of a historical batch has no DOM
	// node. A row that is not mounted has nothing to confirm - the store is its source
	// of truth and it paints on mount. Counting those rows as failures fired
	// rerenderAll(true), which unmounts and rebuilds the whole chat layer, on
	// essentially every batch commit. That was the freeze.
	const {adapter, calls} = createHarness({
		availableMessageIds: ["m1"],
		directRevisions: [["m1", 11]]
	});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.rerenderAll, 0, "an off-screen row must never cost a full remount");
	assert.equal(outcome.fallbackUsed, false);
	// The mounted row is confirmed by its revision; the virtualised one stays pending
	// until its eventual mount can prove the exact revision.
	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.deferredIds, ["m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

test("a mounted row with a stale revision gets one exact-owner retry", async () => {
	const {adapter, calls} = createHarness({
		availableMessageIds: ["m1"],
		confirmDirectly: false,
		fallbackRevisions: [["m1", 11]]
	});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 2);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(outcome.fallbackUsed, false);
	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.deferredIds, ["m2"]);
	assert.deepEqual(outcome.missingIds, []);
});

function createTargetedOwnerHarness({confirm = true} = {}) {
	const scroller = {scrollTop: 100};
	const revisions = new Map();
	const messageNodes = new Map(["m1", "m2"].map(messageId => [messageId, {
		id: `chat-messages-${messageId}`,
		"data-list-item-id": `chat-messages___chat-messages-${messageId}`,
		querySelector: selector => selector === `[data-translator-revision="${messageId === "m1" ? 11 : 12}"]` && revisions.has(messageId) ? {} : null
	}]));
	const messageOwners = new Map(["m1", "m2"].map(messageId => [messageId, {props: {message: {id: messageId}}}]));
	const streamOwner = {props: {channelStream: []}};
	const calls = {findOwnerNodes: [], forceUpdateBatches: [], rerenderAll: 0};
	const document = {
		querySelector(selector) {
			if (selector === ".messages-scroller") return scroller;
			const selectors = selector.split(",").map(part => part.trim());
			return [...messageNodes.values()].find(node => selectors.some(part => matchesMessageSelector(node, part))) || null;
		}
	};
	const BDFDB = {
		dotCN: {messagesscroller: ".messages-scroller"},
		ReactUtils: {
			findOwner(node, config) {
				calls.findOwnerNodes.push(node);
				if (node === scroller) return streamOwner;
				const entry = [...messageNodes.entries()].find(([, messageNode]) => messageNode === node);
				const owner = entry && messageOwners.get(entry[0]);
				assert.equal(config.filter(owner), true);
				return owner;
			},
			forceUpdate(...owners) {
				calls.forceUpdateBatches.push(owners);
				if (confirm && owners.every(owner => [...messageOwners.values()].includes(owner))) {
					for (const [messageId, owner] of messageOwners) if (owners.includes(owner)) revisions.set(messageId, true);
				}
			}
		},
		MessageUtils: {rerenderAll: () => {calls.rerenderAll++;}}
	};
	const adapter = createDiscordRenderAdapter({
		BDFDB,
		document,
		requestAnimationFrame: callback => callback(),
		setTimeout: callback => callback(),
		getUserScrollIntentSequence: () => 1,
		captureScrollState: () => ({scrollTop: scroller.scrollTop}),
		restoreScrollState: state => {scroller.scrollTop = state.scrollTop;}
	});
	return {adapter, calls, messageNodes, messageOwners};
}

test("refreshMessages updates every mounted message owner in one batch", async () => {
	const {adapter, calls, messageNodes, messageOwners} = createTargetedOwnerHarness();
	const outcome = await adapter.refreshMessages(request);

	assert.deepEqual(calls.findOwnerNodes, [...messageNodes.values()]);
	assert.deepEqual(calls.forceUpdateBatches, [[...messageOwners.values()]]);
	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
});

test("an unconfirmed automatic display retries exact owners without remounting the chat", async () => {
	const {adapter, calls, messageOwners} = createTargetedOwnerHarness({confirm: false});
	const outcome = await adapter.refreshMessages(request);

	assert.deepEqual(calls.forceUpdateBatches, [[...messageOwners.values()], [...messageOwners.values()]]);
	assert.equal(calls.rerenderAll, 0);
	assert.deepEqual(outcome.missingIds, ["m1", "m2"]);
	assert.deepEqual(outcome.retryIds, ["m1", "m2"], "mounted rows that missed confirmation must enter the bounded repaint retry path");
	assert.equal(outcome.fallbackUsed, false);
});
