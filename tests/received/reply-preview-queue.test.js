const test = require("node:test");
const assert = require("node:assert/strict");
const {createReplyPreviewQueue} = require("../../src/received/reply-preview-queue");

// Contract tests for the reply-preview queue extracted from the legacy runtime in
// display-unification 5d: eligibility gates, cache-hit commits, provider-path
// commit with the pending-token and signature guards.

function createHarness(overrides = {}) {
	const state = Object.assign({
		pending: false,
		suppressed: false,
		enabled: true,
		own: false,
		cached: null,
		previewTranslation: null,
		translation: "hola",
		runtimeActive: true
	}, overrides);
	const calls = {commits: [], marked: [], released: [], translateTexts: []};
	const displayRuntime = {
		isPreviewPending: () => state.pending,
		isSuppressed: () => state.suppressed,
		getPreviewTranslation: () => state.previewTranslation,
		markPreviewPending: request => {calls.marked.push(request); return "token-1";},
		releasePreviewPending: (messageId, token) => {calls.released.push(token); return true;},
		commitPreviewResult: commit => {calls.commits.push(commit); return Promise.resolve();}
	};
	const plugin = {
		ensureReceivedDisplayRuntime: () => displayRuntime,
		shouldAutoTranslateReplyPreview: () => true,
		isTranslationEnabled: () => state.enabled,
		isOwnMessage: () => state.own,
		createReplyPreviewSignature: (message, channelId, content) => `sig:${content}`,
		getCachedReceivedTranslation: () => state.cached,
		createReplyPreviewTranslationData: (message, channelId, cached) => ({signature: `sig:${(message.content || "").trim()}`, channelId, auto: true, translatedContent: cached.translatedContent}),
		translateText: (text, place, callback, forced, options) => {
			calls.translateTexts.push({text, place, options});
			callback(state.translation, {id: "en"}, {id: "zh"});
		}
	};
	const queue = createReplyPreviewQueue({
		getPlugin: () => plugin,
		messageTypes: {RECEIVED: "received", SENT: "sent"},
		isRuntimeActive: () => state.runtimeActive
	});
	return {queue, calls, state};
}

const MESSAGE = {id: "m1", content: "hello"};

test("ineligible previews never reach the provider", () => {
	for (const overrides of [{pending: true}, {suppressed: true}, {enabled: false}, {own: true}]) {
		const {queue, calls} = createHarness(overrides);
		queue.queueReplyPreviewTranslation(MESSAGE, "c1");
		assert.equal(calls.translateTexts.length, 0);
		assert.equal(calls.commits.length, 0);
	}
	const {queue, calls} = createHarness({previewTranslation: {signature: "sig:hello"}});
	queue.queueReplyPreviewTranslation(MESSAGE, "c1");
	assert.equal(calls.translateTexts.length, 0, "an up-to-date preview is not requeued");
});

test("a cached translation commits the preview without a provider request", () => {
	const {queue, calls} = createHarness({cached: {translatedContent: "cached"}});
	queue.queueReplyPreviewTranslation(MESSAGE, "c1");
	assert.equal(calls.translateTexts.length, 0);
	assert.equal(calls.commits.length, 1);
	assert.equal(calls.commits[0].translation.translatedContent, "cached");
});

test("the provider path marks pending, translates silently, and commits the result", () => {
	const {queue, calls} = createHarness();
	queue.queueReplyPreviewTranslation(MESSAGE, "c1");
	assert.equal(calls.marked.length, 1);
	assert.deepEqual(calls.translateTexts[0].options, {showToast: false, showFailureToast: false, trackBusy: false, channelId: "c1"});
	assert.deepEqual(calls.released, ["token-1"]);
	assert.equal(calls.commits.length, 1);
	assert.equal(calls.commits[0].translation.translatedContent, "hola");
	assert.equal(calls.commits[0].translation.auto, true);
});

test("a stopped runtime drops the provider result instead of committing", () => {
	const {queue, calls, state} = createHarness();
	state.runtimeActive = false;
	queue.queueReplyPreviewTranslation(MESSAGE, "c1");
	assert.equal(calls.commits.length, 0);
});
