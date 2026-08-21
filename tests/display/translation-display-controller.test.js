const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageStateStore} = require("../../src/display/message-state-store");
const {
	createDisplayView,
	createTranslationDisplayController
} = require("../../src/display/translation-display-controller");

function getSourceSignature(messageId, channelId) {
	return `${channelId}:${messageId}`;
}

function capture(store, messageId, channelId = "c1") {
	return store.captureSource({
		messageId,
		channelId,
		generation: 1,
		sourceSignature: getSourceSignature(messageId, channelId),
		source: {content: `${messageId} source`, embeds: []}
	});
}

function pendingRequest(messageId, channelId = "c1", requestIdentity = `${channelId}:${messageId}:request`, origin = "automatic") {
	return {messageId, channelId, generation: 1, origin, requestIdentity};
}

function result(messageId, channelId = "c1", origin = "automatic", requestIdentity = null) {
	return {
		messageId,
		channelId,
		generation: 1,
		sourceSignature: getSourceSignature(messageId, channelId),
		origin,
		requestIdentity,
		status: "translated",
		translation: {content: `${messageId} translated`}
	};
}

function createHarness(renderOutcome, controllerOptions = {}) {
	const refreshes = [];
	const store = createMessageStateStore();
	const renderAdapter = {
		async refreshMessages(request) {
			refreshes.push(request);
			return renderOutcome ? renderOutcome(request) : {
				confirmedIds: request.messageIds,
				missingIds: [],
				confirmedOwnerIds: request.ownerMessageIds || [],
				missingOwnerIds: [],
				fallbackUsed: false
			};
		}
	};
	return {store, refreshes, controller: createTranslationDisplayController(Object.assign({store, renderAdapter}, controllerOptions))};
}

function createDeferred() {
	let resolve;
	const promise = new Promise(resolvePromise => {resolve = resolvePromise;});
	return {promise, resolve};
}

function emptyOutcome() {
	return {confirmedIds: [], missingIds: [], fallbackUsed: false};
}

test("createDisplayView returns null for missing state", () => {
	assert.equal(createDisplayView(null), null);
});

test("createDisplayView freezes the complete translated projection", () => {
	const store = createMessageStateStore();
	capture(store, "m1");
	const state = store.commitResult(result("m1"));

	const view = createDisplayView(state);

	assert.deepEqual(Object.keys(view), [
		"messageId",
		"channelId",
		"revision",
		"status",
		"content",
		"translated",
		"showWatermark",
		"showLoading",
		"reason",
		"renderStatus",
		"renderReason",
		"translation",
		"restoredTranslation",
		"source",
		"origin",
		"generation",
		"sourceSignature",
		"requestIdentity"
	]);
	assert.equal(Object.isFrozen(view), true);
	assert.equal(view.messageId, "m1");
	assert.equal(view.channelId, "c1");
	assert.equal(view.revision, state.revision);
	assert.equal(view.status, "translated");
	assert.equal(view.content, "m1 translated");
	assert.equal(view.translated, true);
	assert.equal(view.showWatermark, true);
	assert.equal(view.showLoading, false);
	assert.equal(view.reason, null);
	assert.equal(view.renderStatus, "pending");
	assert.equal(view.renderReason, null);
	assert.equal(view.translation, state.translation);
	assert.equal(view.source, state.source);
	assert.equal(view.origin, "automatic");
});

test("createDisplayView uses translated content only for a translated state with a translation", () => {
	const source = Object.freeze({content: "immutable source"});
	const translation = Object.freeze({content: "translated content"});
	const baseState = {
		messageId: "m1",
		channelId: "c1",
		revision: 7,
		reason: null,
		renderStatus: "pending",
		renderReason: null,
		source,
		origin: "automatic"
	};
	const cases = [
		["translated", translation, true, false],
		["translated", null, false, false],
		["pending", translation, false, true],
		["translating", translation, false, true],
		["idle", translation, false, false],
		["failed", null, false, false]
	];

	for (const [status, stateTranslation, translated, showLoading] of cases) {
		const view = createDisplayView({...baseState, status, translation: stateTranslation});
		assert.equal(view.content, translated ? "translated content" : "immutable source", status);
		assert.equal(view.translated, translated, status);
		assert.equal(view.showWatermark, translated, status);
		assert.equal(view.showLoading, showLoading, status);
		assert.equal(view.source, source, status);
	}
});

test("deleting a referenced message refreshes its reply hosts once and removes its display state", async () => {
	const {store, refreshes, controller} = createHarness();
	store.capturePreviewSource({messageId: "referenced", channelId: "c1", sourceSignature: "preview", source: {content: "source", embeds: []}});
	store.commitPreviewResult({messageId: "referenced", channelId: "c1", signature: "preview", translation: {translatedContent: "translated preview"}});
	store.markPreviewHost("c1", "referenced", "reply-1");
	store.markPreviewHost("c1", "referenced", "reply-2");

	const outcome = await controller.deleteMessage("referenced", "c1");

	assert.equal(store.getDisplayState("referenced"), null);
	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, []);
	assert.deepEqual(refreshes[0].ownerMessageIds, ["reply-1", "reply-2"]);
	assert.deepEqual(outcome.confirmedIds, []);
	assert.equal(await controller.deleteMessage("referenced", "wrong-channel"), false);
	assert.equal(refreshes.length, 1, "an unrelated channel must not repaint");
});

test("one result refreshes text and decoration under one revision", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");

	const outcome = await controller.commitMessageResult(result("m1"));

	assert.deepEqual(outcome, {confirmedIds: ["m1"], missingIds: [], fallbackUsed: false});
	assert.equal(refreshes.length, 1);
	assert.equal(refreshes[0].transactionId, 1);
	assert.equal(refreshes[0].channelId, "c1");
	assert.deepEqual(refreshes[0].messageIds, ["m1"]);
	assert.equal(refreshes[0].views.length, 1);
	assert.equal(refreshes[0].views[0].content, "m1 translated");
	assert.equal(refreshes[0].views[0].translated, true);
	assert.equal(refreshes[0].views[0].showWatermark, true);
	assert.equal(refreshes[0].views[0].revision, store.getDisplayState("m1").revision);
	assert.equal(store.getDisplayState("m1").renderStatus, "confirmed");
});

test("one historical three-message batch creates exactly one coherent refresh", async () => {
	const {store, refreshes, controller} = createHarness();
	for (const messageId of ["m1", "m2", "m3"]) capture(store, messageId);

	await controller.commitHistoricalBatch([result("m1"), result("m2"), result("m3")]);

	assert.equal(refreshes.length, 1);
	assert.equal(refreshes[0].transactionId, 1);
	assert.equal(refreshes[0].channelId, "c1");
	assert.deepEqual(refreshes[0].messageIds, ["m1", "m2", "m3"]);
	assert.deepEqual(refreshes[0].views.map(view => view.messageId), ["m1", "m2", "m3"]);
	assert.deepEqual(refreshes[0].views.map(view => view.content), ["m1 translated", "m2 translated", "m3 translated"]);
	assert.equal(refreshes[0].views.every(view => view.channelId === "c1" && view.translated && view.showWatermark), true);
});

test("restoreChannel refreshes automatic and manual originals in one transaction", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "automatic");
	capture(store, "manual");
	store.commitResult(result("automatic"));
	store.commitResult(result("manual", "c1", "manual"));

	await controller.restoreChannel("c1");

	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, ["automatic", "manual"]);
	assert.deepEqual(refreshes[0].views.map(view => view.content), ["automatic source", "manual source"]);
	assert.equal(refreshes[0].views.every(view => !view.translated && !view.showWatermark && !view.showLoading), true);
	assert.equal(controller.getDisplayView("manual").content, "manual source");
	assert.equal(controller.getDisplayView("manual").translated, false);
});

test("restoreChannel can clear only that channel's manual suppression state", async () => {
	const {store, controller} = createHarness();
	store.suppress("c1-message", {channelId: "c1"});
	store.suppress("c2-message", {channelId: "c2"});

	await controller.restoreChannel("c1", {clearSuppressions: true});

	assert.equal(store.isSuppressed("c1-message"), false);
	assert.equal(store.isSuppressed("c2-message"), true);
});

test("restoreChannel refreshes reply-preview host rows in the same transaction", async () => {
	const {store, refreshes, controller} = createHarness();
	store.capturePreviewSource({messageId: "referenced", channelId: "c1", sourceSignature: "preview-source", source: {content: "source"}});
	store.commitPreviewResult({messageId: "referenced", channelId: "c1", signature: "preview", translation: {translatedContent: "translated"}});
	store.markPreviewHost("c1", "referenced", "reply-host");

	await controller.restoreChannel("c1", {clearPreviews: true});

	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, []);
	assert.deepEqual(refreshes[0].ownerMessageIds, ["reply-host"]);
	assert.deepEqual(refreshes[0].views, [], "a preview-only restore does not need a display-store revision");
	assert.deepEqual(store.getPreviewHostMessageIds("c1"), [], "clearing previews retires their host ownership");
});

test("a host-only display transaction runs without display-store records", async () => {
	const {refreshes, controller} = createHarness();

	const outcome = await controller.refreshDisplayTransaction({
		channelId: "c1",
		messageIds: [],
		ownerMessageIds: ["reply-1", "reply-2"]
	});

	assert.equal(refreshes.length, 1);
	assert.equal(refreshes[0].channelId, "c1");
	assert.deepEqual(refreshes[0].messageIds, []);
	assert.deepEqual(refreshes[0].ownerMessageIds, ["reply-1", "reply-2"]);
	assert.deepEqual(refreshes[0].views, []);
	assert.deepEqual(outcome, {confirmedIds: [], missingIds: [], confirmedOwnerIds: ["reply-1", "reply-2"], missingOwnerIds: [], fallbackUsed: false});
});

test("missing acknowledgement remains inspectable without changing the display revision", async () => {
	const {store, refreshes, controller} = createHarness(request => ({
		confirmedIds: [],
		missingIds: request.messageIds,
		fallbackUsed: true
	}));
	capture(store, "m1");

	const outcome = await controller.commitMessageResult(result("m1"));
	const view = controller.getDisplayView("m1");

	assert.deepEqual(outcome, {confirmedIds: [], missingIds: ["m1"], fallbackUsed: true});
	assert.equal(view.revision, refreshes[0].views[0].revision);
	assert.equal(view.renderStatus, "unconfirmed");
	assert.equal(view.renderReason, "render-unconfirmed");
	assert.equal(view.translated, true);
});

test("a deferred DOM acknowledgement keeps the exact display revision pending", async () => {
	const {store, controller} = createHarness(request => ({
		confirmedIds: [],
		missingIds: [],
		deferredIds: request.messageIds,
		fallbackUsed: false
	}));
	capture(store, "m1");

	const outcome = await controller.commitMessageResult(result("m1"));
	const view = controller.getDisplayView("m1");

	assert.deepEqual(outcome, {confirmedIds: [], missingIds: [], deferredIds: ["m1"], fallbackUsed: false});
	assert.equal(view.renderStatus, "pending");
	assert.equal(view.renderReason, null);
});

test("markPending refreshes a loading source view", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");

	const outcome = await controller.markPending(pendingRequest("m1"));

	assert.deepEqual(outcome, {confirmedIds: ["m1"], missingIds: [], fallbackUsed: false});
	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, ["m1"]);
	assert.equal(refreshes[0].views[0].status, "pending");
	assert.equal(refreshes[0].views[0].content, "m1 source");
	assert.equal(refreshes[0].views[0].translated, false);
	assert.equal(refreshes[0].views[0].showLoading, true);
	assert.equal(store.getDisplayState("m1").requestIdentity, "c1:m1:request");
});

test("commitMessageResult can defer refresh without losing the committed translation", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");

	const outcome = await controller.commitMessageResult(result("m1"), {refresh: false});

	assert.deepEqual(outcome, {
		confirmedIds: [],
		missingIds: [],
		fallbackUsed: false,
		deferredIds: ["m1"]
	});
	assert.equal(refreshes.length, 0);
	assert.equal(store.getDisplayState("m1").status, "translated");
	assert.equal(store.getDisplayState("m1").renderStatus, "pending");
});

test("markPending can defer refresh without losing the committed state", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");

	const outcome = await controller.markPending(pendingRequest("m1"), {refresh: false});

	assert.deepEqual(outcome, {
		confirmedIds: [],
		missingIds: [],
		fallbackUsed: false,
		deferredIds: ["m1"]
	});
	assert.equal(refreshes.length, 0);
	assert.equal(store.getDisplayState("m1").status, "pending");
	assert.equal(store.getDisplayState("m1").renderStatus, "pending");
});

test("markPending reports rejected IDs without mutating or refreshing", async () => {
	const {store, refreshes, controller} = createHarness();
	const captured = capture(store, "m1");

	const outcome = await controller.markPending({...pendingRequest("m1"), generation: 2});

	assert.deepEqual(outcome, {
		confirmedIds: [],
		missingIds: [],
		fallbackUsed: false,
		rejectedIds: ["m1"]
	});
	assert.equal(refreshes.length, 0);
	assert.equal(store.getDisplayState("m1"), captured);
});

test("commitMessageResult rejects a terminal result with the wrong active request identity", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");
	await controller.markPending(pendingRequest("m1", "c1", "request-new"), {refresh: false});
	const pending = store.getDisplayState("m1");

	const outcome = await controller.commitMessageResult(result("m1", "c1", "automatic", "request-old"));

	assert.deepEqual(outcome, {
		confirmedIds: [],
		missingIds: [],
		fallbackUsed: false,
		rejectedIds: ["m1"]
	});
	assert.equal(refreshes.length, 0);
	assert.equal(store.getDisplayState("m1"), pending);
});

test("commitHistoricalBatch reports the rejected result when the atomic batch does not commit", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");
	capture(store, "m2");
	store.markPending(pendingRequest("m2", "c1", "request-new"));

	const outcome = await controller.commitHistoricalBatch([
		result("m1"),
		result("m2", "c1", "automatic", "request-old")
	]);

	assert.deepEqual(outcome, {
		confirmedIds: [],
		missingIds: [],
		fallbackUsed: false,
		rejectedIds: ["m2"]
	});
	assert.equal(refreshes.length, 0);
	assert.equal(store.getDisplayState("m1").status, "idle");
	assert.equal(store.getDisplayState("m2").status, "pending");
});

test("render transactions use monotonically increasing IDs", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");
	capture(store, "m2");

	await controller.renderMessage("m1");
	await controller.renderMessage("m2");
	await controller.renderMessage("m1");

	assert.deepEqual(refreshes.map(request => request.transactionId), [1, 2, 3]);
});

test("a display transaction rejects records spanning channels before refreshing", async () => {
	const realStore = createMessageStateStore();
	const first = capture(realStore, "m1", "c1");
	const second = capture(realStore, "m2", "c2");
	const store = {
		...realStore,
		restoreChannel() {return [first, second];}
	};
	let refreshCount = 0;
	const controller = createTranslationDisplayController({
		store,
		renderAdapter: {
			async refreshMessages() {
				refreshCount++;
				return emptyOutcome();
			}
		}
	});

	await assert.rejects(controller.restoreChannel("c1"), /cannot span channels/i);

	assert.equal(refreshCount, 0);
});

test("restoreAll groups every restored record by channel without cross-channel leakage", async () => {
	const {store, refreshes, controller} = createHarness();
	for (const [messageId, channelId, origin] of [
		["auto-a", "c1", "automatic"],
		["auto-b", "c1", "automatic"],
		["auto-c", "c2", "automatic"],
		["manual-c", "c2", "manual"]
	]) {
		capture(store, messageId, channelId);
		store.commitResult(result(messageId, channelId, origin));
	}

	const outcomes = await controller.restoreAll();

	assert.equal(outcomes.length, 2);
	assert.deepEqual(refreshes.map(request => ({
		transactionId: request.transactionId,
		channelId: request.channelId,
		messageIds: request.messageIds
	})), [
		{transactionId: 1, channelId: "c1", messageIds: ["auto-a", "auto-b"]},
		// Stopping the plugin leaves nothing translated on screen, manual included.
		{transactionId: 2, channelId: "c2", messageIds: ["auto-c", "manual-c"]}
	]);
	assert.equal(refreshes.every(request => request.views.every(view => view.channelId === request.channelId)), true);
	assert.equal(controller.getDisplayView("manual-c").translated, false);
});

test("restoreAll with refresh disabled returns restored records without rendering", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "auto-a", "c1");
	capture(store, "auto-b", "c2");
	store.commitResult(result("auto-a", "c1"));
	store.commitResult(result("auto-b", "c2"));

	const records = await controller.restoreAll({refresh: false});

	assert.deepEqual(records.map(record => record.messageId), ["auto-a", "auto-b"]);
	assert.equal(records.every(record => record.status === "cancelled" && record.translation === null), true);
	assert.equal(refreshes.length, 0);
});

test("empty controller operations return the stable no-op outcome", async () => {
	const {refreshes, controller} = createHarness();

	assert.deepEqual(await controller.renderMessage("missing"), emptyOutcome());
	assert.deepEqual(await controller.commitHistoricalBatch([]), emptyOutcome());
	assert.deepEqual(await controller.restoreChannel("missing"), emptyOutcome());
	assert.deepEqual(await controller.restoreAll(), emptyOutcome());
	assert.equal(controller.getDisplayView("missing"), null);
	assert.equal(refreshes.length, 0);
});

test("a late confirmed acknowledgement cannot confirm a newer display revision", async () => {
	const deferred = createDeferred();
	const {store, refreshes, controller} = createHarness(() => deferred.promise);
	capture(store, "m1");
	const rendering = controller.commitMessageResult(result("m1"));
	assert.equal(refreshes.length, 1);
	const requestedRevision = refreshes[0].views[0].revision;

	// Superseding a translated record is now explicit, so a stale-acknowledgement test
	// has to say it means to do it.
	const newerState = store.markPending(Object.assign(pendingRequest("m1", "c1", "request-new"), {supersede: true}));
	assert.equal(newerState.revision > requestedRevision, true);
	deferred.resolve({confirmedIds: ["m1"], missingIds: [], fallbackUsed: false});

	const outcome = await rendering;

	assert.deepEqual(outcome, {confirmedIds: [], missingIds: [], fallbackUsed: false, staleIds: ["m1"]});
	assert.equal(store.getDisplayState("m1"), newerState);
	assert.equal(newerState.renderStatus, "pending");
	assert.equal(newerState.renderReason, null);
});

test("a late missing acknowledgement cannot mark a newer display revision unconfirmed", async () => {
	const deferred = createDeferred();
	const {store, refreshes, controller} = createHarness(() => deferred.promise);
	capture(store, "m1");
	const rendering = controller.commitMessageResult(result("m1"));
	assert.equal(refreshes.length, 1);
	const requestedRevision = refreshes[0].views[0].revision;

	// Superseding a translated record is now explicit, so a stale-acknowledgement test
	// has to say it means to do it.
	const newerState = store.markPending(Object.assign(pendingRequest("m1", "c1", "request-new"), {supersede: true}));
	assert.equal(newerState.revision > requestedRevision, true);
	deferred.resolve({confirmedIds: [], missingIds: ["m1"], fallbackUsed: true});

	const outcome = await rendering;

	assert.deepEqual(outcome, {confirmedIds: [], missingIds: [], fallbackUsed: true, staleIds: ["m1"]});
	assert.equal(store.getDisplayState("m1"), newerState);
	assert.equal(newerState.renderStatus, "pending");
	assert.equal(newerState.renderReason, null);
});

test("a late deferred acknowledgement cannot claim a newer display revision", async () => {
	const deferred = createDeferred();
	const {store, controller} = createHarness(() => deferred.promise);
	capture(store, "m1");
	const rendering = controller.commitMessageResult(result("m1"));

	const newerState = store.markPending(Object.assign(pendingRequest("m1", "c1", "request-new"), {supersede: true}));
	deferred.resolve({confirmedIds: [], missingIds: [], deferredIds: ["m1"], fallbackUsed: false});

	const outcome = await rendering;
	assert.deepEqual(outcome, {confirmedIds: [], missingIds: [], fallbackUsed: false, staleIds: ["m1"]});
	assert.equal(store.getDisplayState("m1"), newerState);
	assert.equal(newerState.renderStatus, "pending");
});

test("restoreMessage cancels one automatic record through an acknowledged refresh", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");
	store.commitResult(result("m1"));
	refreshes.length = 0;

	const outcome = await controller.restoreMessage("m1");

	assert.deepEqual(outcome, {confirmedIds: ["m1"], missingIds: [], fallbackUsed: false});
	assert.equal(refreshes.length, 1);
	assert.equal(refreshes[0].views[0].content, "m1 source");
	assert.equal(refreshes[0].views[0].translated, false);
	assert.equal(store.getDisplayState("m1").status, "cancelled");
	assert.deepEqual(await controller.restoreMessage("m1"), emptyOutcome());
	assert.deepEqual(await controller.restoreMessage("missing"), emptyOutcome());
});

test("commitHistoricalBatch commits recorded results and surfaces unrecorded rejections", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");

	const outcome = await controller.commitHistoricalBatch([
		result("m1"),
		{messageId: "never-captured", channelId: "c1", generation: 1, sourceSignature: "c1:never-captured", origin: "automatic", status: "translated", translation: {content: "孤儿"}}
	]);

	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.deepEqual(outcome.rejectedIds, ["never-captured"]);
	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, ["m1"]);
	assert.equal(store.getDisplayState("m1").status, "translated");
});

test("commitHistoricalBatch captures a recordless result when it carries its immutable source", async () => {
	const {store, refreshes, controller} = createHarness();
	const outcome = await controller.commitHistoricalBatch([{
		...result("m1"),
		source: {content: "m1 source", embeds: []}
	}]);

	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.equal(outcome.rejectedIds, undefined);
	assert.equal(refreshes.length, 1);
	assert.equal(store.getDisplayState("m1").source.content, "m1 source");
	assert.equal(store.getDisplayState("m1").translation.content, "m1 translated");
});

test("commitHistoricalBatch completes a preview-only record with the historical source", async () => {
	const {store, controller} = createHarness();
	store.capturePreviewSource({messageId: "m1", channelId: "c1", generation: 1});
	const outcome = await controller.commitHistoricalBatch([{...result("m1"), source: {content: "m1 source", embeds: []}}]);

	assert.deepEqual(outcome.confirmedIds, ["m1"]);
	assert.equal(store.getDisplayState("m1").source.content, "m1 source");
	assert.equal(store.getDisplayState("m1").status, "translated");
});

test("commitHistoricalBatch cannot replace an edited source with a stale historical snapshot", async () => {
	const {store, controller} = createHarness();
	store.captureSource({messageId: "m1", channelId: "c1", generation: 1, sourceSignature: "new-signature", source: {content: "edited source", embeds: []}});
	const stale = {...result("m1"), sourceSignature: "old-signature", source: {content: "old source", embeds: []}};

	const outcome = await controller.commitHistoricalBatch([stale]);

	assert.deepEqual(outcome.rejectedIds, ["m1"]);
	assert.equal(store.getDisplayState("m1").sourceSignature, "new-signature");
	assert.equal(store.getDisplayState("m1").source.content, "edited source");
	assert.equal(store.getDisplayState("m1").status, "idle");
});

test("commitHistoricalBatch does not capture recordless sources from a mixed-channel batch", async () => {
	const {store, controller} = createHarness();
	const results = [
		{...result("m1", "c1"), source: {content: "one", embeds: []}},
		{...result("m2", "c2"), source: {content: "two", embeds: []}}
	];

	const outcome = await controller.commitHistoricalBatch(results);

	assert.deepEqual(outcome.rejectedIds, ["m1", "m2"]);
	assert.equal(store.getDisplayState("m1"), null);
	assert.equal(store.getDisplayState("m2"), null);
});

test("renderMessages threads the transaction's source counts through to the adapter", async () => {
	// The scheduler knows which lane asked for the paint; the adapter books rebuilds
	// by that lane. The controller must pass the meta through untouched.
	const {store, controller, refreshes} = createHarness();
	capture(store, "m1");
	store.commitResult(result("m1"));

	await controller.renderMessages(["m1"], {sources: {cached: 1}});

	assert.deepEqual(refreshes[0].sources, {cached: 1});
});

test("a historical batch commit labels its own refresh as historical", async () => {
	// commitHistoricalBatch refreshes directly (not through the scheduler), so it
	// must self-label or the biggest batch lane would read as unattributed.
	const {store, controller, refreshes} = createHarness();
	const results = [
		{...result("m1", "c1"), source: {content: "one", embeds: []}},
		{...result("m2", "c1"), source: {content: "two", embeds: []}}
	];

	await controller.commitHistoricalBatch(results);

	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].sources, {historical: 2});
});

test("preview commits coalesce into one tagged host refresh instead of a rebuild per preview", async () => {
	// Field reading 2026-08-19 (repaint "other 69" vs "hist 8"): every reply-preview
	// commit rebuilt the whole layer immediately and untagged. A Midjourney-style
	// channel commits previews in waves, so the wave must cost ONE transaction.
	const timers = [];
	const {store, refreshes, controller} = createHarness(null, {
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;}
	});
	store.capturePreviewSource({messageId: "ref1", channelId: "c1", sourceSignature: "s1", source: {content: "a", embeds: []}});
	store.capturePreviewSource({messageId: "ref2", channelId: "c1", sourceSignature: "s2", source: {content: "b", embeds: []}});
	store.markPreviewHost("c1", "ref1", "host1");
	store.markPreviewHost("c1", "ref2", "host2");

	await controller.commitPreviewResult({messageId: "ref1", channelId: "c1", signature: "s1", translation: {translatedContent: "t1"}});
	await controller.commitPreviewResult({messageId: "ref2", channelId: "c1", signature: "s2", translation: {translatedContent: "t2"}});

	assert.equal(refreshes.length, 0, "a preview commit must not rebuild immediately");
	assert.equal(timers.length, 1, "the whole wave shares one coalescing window");
	await timers[0].callback();
	assert.equal(refreshes.length, 1, "the wave flushes as one transaction");
	assert.deepEqual([...refreshes[0].ownerMessageIds].sort(), ["host1", "host2"]);
	assert.deepEqual(refreshes[0].ownerViews.map(view => view.messageId).sort(), ["host1", "host2"]);
	assert.equal(refreshes[0].ownerViews[0].revision, refreshes[0].ownerViews[1].revision, "the coalesced wave shares one surface revision");
	assert.deepEqual(refreshes[0].sources, {preview: 2});
	assert.equal(store.getPreviewHostRenderRevision("c1", "host1"), null, "confirmed host revisions are acknowledged and released");
});

test("the preview flush waits out a closed repaint window and lands when it opens", async () => {
	// A rebuild mid-scroll is what flashes the list to the bottom and yanks it back;
	// previews are decoration and can always wait for the window to open.
	const timers = [];
	let canPaint = false;
	const {store, refreshes, controller} = createHarness(null, {
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		canRepaintNow: () => canPaint
	});
	store.capturePreviewSource({messageId: "ref1", channelId: "c1", sourceSignature: "s1", source: {content: "a", embeds: []}});
	store.markPreviewHost("c1", "ref1", "host1");

	await controller.commitPreviewResult({messageId: "ref1", channelId: "c1", signature: "s1", translation: {translatedContent: "t1"}});
	await timers[0].callback();
	assert.equal(refreshes.length, 0, "no paint while the window is closed");
	assert.equal(timers.length, 2, "the flush re-arms instead of dropping the wave");

	canPaint = true;
	await timers[1].callback();
	assert.equal(refreshes.length, 1, "the held wave lands once the window opens");
	assert.deepEqual(refreshes[0].ownerMessageIds, ["host1"]);
});

test("an unconfirmed preview host retries three targeted waves and then retires its surface command", async () => {
	const timers = [];
	const {store, refreshes, controller} = createHarness(request => ({
		confirmedIds: [],
		missingIds: [],
		confirmedOwnerIds: [],
		missingOwnerIds: request.ownerMessageIds,
		retryOwnerIds: request.ownerMessageIds,
		fallbackUsed: false
	}), {
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;}
	});
	store.capturePreviewSource({messageId: "ref1", channelId: "c1", sourceSignature: "s1", source: {content: "a", embeds: []}});
	store.markPreviewHost("c1", "ref1", "host1");
	await controller.commitPreviewResult({messageId: "ref1", channelId: "c1", signature: "s1", translation: {translatedContent: "t1"}});

	for (let attempt = 1; attempt <= 3; attempt++) {
		const timer = timers.shift();
		assert.ok(timer, `targeted preview attempt ${attempt} must be scheduled`);
		await timer.callback();
	}
	assert.equal(refreshes.length, 3);
	assert.deepEqual(refreshes.map(request => request.ownerViews[0].attempt), [1, 2, 3]);
	assert.equal(timers.length, 0, "the fourth wave is forbidden");
	assert.equal(store.getPreviewHostRenderRevision("c1", "host1"), null, "exhaustion releases the surface command");
});

test("a preview commit with refresh false stays store-only and joins no wave", async () => {
	const timers = [];
	const {store, refreshes, controller} = createHarness(null, {
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;}
	});
	store.capturePreviewSource({messageId: "ref1", channelId: "c1", sourceSignature: "s1", source: {content: "a", embeds: []}});
	store.markPreviewHost("c1", "ref1", "host1");

	await controller.commitPreviewResult({messageId: "ref1", channelId: "c1", signature: "s1", translation: {translatedContent: "t1"}}, {refresh: false});

	assert.equal(refreshes.length, 0);
	assert.equal(timers.length, 0, "refresh:false arms nothing");
});

test("a historical batch commit defers its paint while the repaint gate is closed and flushes once when it opens", async () => {
	// Stranded-at-newest audit (2026-08-19): the batch commit painted ungated, so a
	// whole-layer rebuild could land mid-scroll - remounting the list at the bottom
	// under the user's gesture. The store commits immediately; only the paint waits.
	const timers = [];
	let canPaint = false;
	const {store, refreshes, controller} = createHarness(null, {
		setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		canRepaintNow: () => canPaint
	});
	capture(store, "m1");
	capture(store, "m2");

	const outcome = await controller.commitHistoricalBatch([result("m1"), result("m2")]);

	assert.equal(refreshes.length, 0, "no rebuild lands over an actively scrolling user");
	assert.deepEqual([...(outcome.deferredIds || [])].sort(), ["m1", "m2"], "the commit reports the paint as deferred");
	assert.equal(timers.length, 1);
	await timers[0].callback();
	assert.equal(refreshes.length, 0, "the gate is still closed");
	assert.equal(timers.length, 2, "the flush re-arms instead of dropping the batch");

	canPaint = true;
	await timers[1].callback();
	assert.equal(refreshes.length, 1, "one deferred flush paints the whole batch");
	assert.deepEqual([...refreshes[0].messageIds].sort(), ["m1", "m2"]);
	assert.deepEqual(refreshes[0].sources, {historical: 2});
});
