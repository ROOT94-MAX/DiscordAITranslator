const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginLiveTranslationQueue} = require("../src/orchestrator/live-translation-queue-wiring");

const EXPECTED_PORTS = [
	"clearChannelTranslationQueue", "clearEligibleReplyPreviewMessages", "clearTimeout",
	"collectHistoricalMessage", "commitBurstResult", "commitCachedResult", "createBurstContext",
	"createTranslationSignature", "extractOriginalContentData", "getBatchEngineKey",
	"getDisplayCommitGeneration", "getMessageChannelId", "isMessageWithinLoadedRange",
	"isProviderBackoffActive", "isRuntimeActive", "isTranslationEnabled", "markDisplayPending",
	"onChannelSessionLeft", "onChannelSessionStarted", "onReservedLiveRequestConsumed",
	"onReservedLiveRequestRetired", "prepareBurstItem", "releaseDisplayPending",
	"requestBurstTranslation", "resetLoadedMessageTracking", "resolveBurstItemResult",
	"scheduleDisplayFlush", "setTimeout", "shouldAutoTranslateMessage", "translateSingleItem"
].sort();

function createHarness(overrides = {}) {
	const calls = [];
	const store = {getLanguage: choice => ({choice})};
	const display = {pruneChannel: channelId => calls.push(["pruneChannel", channelId])};
	const plugin = Object.assign({
		isTranslationEnabled: channelId => (calls.push(["isTranslationEnabled", channelId]), true),
		extractOriginalContentData: message => (calls.push(["extractOriginalContentData", message]), {content: message.content}),
		createReceivedTranslationSignature: (...args) => (calls.push(["createTranslationSignature", ...args]), "signature"),
		getMessageChannelId: message => (calls.push(["getMessageChannelId", message]), message.channel_id),
		ensureProviderClient: () => ({isBackoffActive: () => (calls.push(["isBackoffActive"]), false)}),
		shouldAutoTranslateReceivedMessage: (...args) => (calls.push(["shouldAutoTranslateMessage", ...args]), true),
		isMessageWithinLoadedRange: message => (calls.push(["isMessageWithinLoadedRange", message]), true),
		getReceivedDisplayCommitGeneration: channelId => (calls.push(["getDisplayCommitGeneration", channelId]), 7),
		markReceivedDisplayPending: (...args) => (calls.push(["markDisplayPending", ...args]), "pending"),
		releaseReceivedDisplayPending: record => calls.push(["releaseDisplayPending", record]),
		scheduleReceivedDisplayFlush: (...args) => calls.push(["scheduleDisplayFlush", ...args]),
		collectHistoricalTranslationMessage: item => (calls.push(["collectHistoricalMessage", item]), true),
		clearAutoTranslationEligibleReplyPreviewMessages: channelId => calls.push(["clearEligibleReplyPreviewMessages", channelId]),
		clearAutoTranslationQueue: channelId => calls.push(["clearChannelTranslationQueue", channelId]),
		ensureReceivedDisplayRuntime: () => display,
		getReceivedAutoTranslateScope: () => "new_only",
		clearDisplayedAutoTranslations: channelId => calls.push(["clearDisplayedAutoTranslations", channelId]),
		resumeQueuedHistoricalTranslationJobs: (...args) => calls.push(["resumeHistorical", ...args]),
		getHistoricalAiBatchEngineKey: channelId => (calls.push(["getBatchEngineKey", channelId]), "engine"),
		ensureSettingsStore: () => store,
		getLanguageChoice: (...args) => (calls.push(["getLanguageChoice", ...args]), args[0]),
		prepareHistoricalAiBatchQueueItem: (...args) => (calls.push(["prepareBurstItem", ...args]), "prepared"),
		requestAiBatchTranslationDetailed: (...args) => (calls.push(["requestBurstTranslation", ...args]), "requested"),
		commitReceivedDisplayResult: (...args) => (calls.push(["commitReceivedDisplayResult", ...args]), "committed"),
		createReceivedDisplayCommitResult: (...args) => (calls.push(["createReceivedDisplayCommitResult", ...args]), {commit: args}),
		refreshTranslationDisplay: translation => (calls.push(["refreshTranslationDisplay", translation]), translation),
		translateMessage: (...args) => (calls.push(["translateSingleItem", ...args]), "single")
	}, overrides.plugin || {});
	const BDFDB = {TimeUtils: {
		timeout: (callback, delay) => (calls.push(["setTimeout", callback, delay]), "managed-timer"),
		clear: timer => calls.push(["clearTimeout", timer])
	}};
	const statusStore = {resetSeen: channelId => calls.push(["resetSeen", channelId])};
	let captured = null;
	const queue = {tag: "live-queue"};
	const result = createPluginLiveTranslationQueue({
		plugin,
		BDFDB,
		loadedTranslationStatusStore: statusStore,
		getRuntimeActive: () => false,
		languageTypes: {INPUT: "input", OUTPUT: "output"},
		messageTypes: {RECEIVED: "received"},
		createQueue: ports => (captured = ports, queue)
	});
	return {result, queue, captured, calls, plugin, BDFDB};
}

test("live translation queue wiring supplies the complete port list and managed retry timers", () => {
	const {result, queue, captured, calls} = createHarness();
	assert.equal(result, queue);
	assert.deepEqual(Object.keys(captured).sort(), EXPECTED_PORTS);
	const callback = () => {};
	assert.equal(captured.setTimeout(callback, 900), "managed-timer");
	captured.clearTimeout("managed-timer");
	assert.equal(captured.isRuntimeActive(), false);
	assert.deepEqual(captured.createBurstContext("channel-a"), {
		engineKey: "engine",
		input: {choice: "input"},
		output: {choice: "output"}
	});
	assert.deepEqual(calls, [
		["setTimeout", callback, 900],
		["clearTimeout", "managed-timer"],
		["getBatchEngineKey", "channel-a"],
		["getLanguageChoice", "input", "received", "channel-a"],
		["getLanguageChoice", "output", "received", "channel-a"]
	]);
});

test("live queue wiring preserves session, display, historical handoff and single-item arguments", () => {
	const {captured, calls} = createHarness();
	const message = {id: "message-a", channel_id: "channel-a", content: "hello"};
	const channel = {id: "channel-a"};
	const original = {content: "hello"};
	const request = {id: "request-a"};
	captured.scheduleDisplayFlush("channel-a", "message-a");
	captured.resetLoadedMessageTracking("channel-a");
	captured.onChannelSessionLeft("channel-a");
	captured.onChannelSessionStarted("channel-a");
	captured.onReservedLiveRequestConsumed("channel-a", "ticket-a");
	captured.onReservedLiveRequestRetired("channel-a", "ticket-b");
	assert.equal(captured.prepareBurstItem({message}, "channel-a", {input: {input: 1}, output: {output: 2}}), "prepared");
	assert.equal(captured.requestBurstTranslation({engineKey: "engine-a"}, ["prepared"]), "requested");
	assert.equal(captured.translateSingleItem({message, channel, originalContentData: original, liveRequest: request}), "single");
	assert.deepEqual(calls, [
		["scheduleDisplayFlush", "channel-a", "message-a", null, null, "live"],
		["resetSeen", "channel-a"],
		["pruneChannel", "channel-a"],
		["clearDisplayedAutoTranslations", "channel-a"],
		["resumeHistorical", "channel-a", "ticket-a"],
		["resumeHistorical", "channel-a", "ticket-b", {retired: true}],
		["prepareBurstItem", {message}, "channel-a", {input: 1}, {output: 2}],
		["requestBurstTranslation", "engine-a", ["prepared"]],
		["translateSingleItem", message, channel, {auto: true, silent: true, trackBusy: false, originalContentData: original, liveRequest: request}]
	]);
});

test("live queue wiring keeps skip, retry, valid-cache and cached-commit result policy intact", () => {
	const persisted = [];
	const translation = {content: "translated"};
	const harness = createHarness({plugin: {
		isSkipTranslationSignal: value => value === "SKIP",
		persistReceivedSkipDecision: (...args) => persisted.push(["skip", ...args]),
		validateHistoricalTranslationJobResult: (_item, value) => value === "VALID" ? {ok: true, translation} : {ok: false},
		persistTranslationCacheEntry: (...args) => persisted.push(["cache", ...args])
	}});
	const prepared = {message: {id: "message-a"}, signature: "signature-a", protectedText: "preview"};
	assert.deepEqual(harness.captured.resolveBurstItemResult(prepared, {"message-a": "SKIP"}, "channel-a"), {status: "skipped", result: {sourceSignature: "signature-a", status: "skipped", reason: "ai_skip_signal"}});
	assert.deepEqual(harness.captured.resolveBurstItemResult(prepared, {"message-a": "BAD"}, "channel-a"), {status: "retry"});
	assert.deepEqual(harness.captured.resolveBurstItemResult(prepared, {"message-a": "VALID"}, "channel-a"), {status: "translated", result: {sourceSignature: "signature-a", status: "translated", translation}});
	assert.deepEqual(persisted, [
		["skip", "message-a", "signature-a", "ai_skip_signal", "preview"],
		["cache", "message-a", "signature-a", translation]
	]);

	const queueItem = {message: {id: "message-b"}, originalContentData: {content: "source"}, cachedTranslation: {signature: "cached-signature", content: "cached"}, liveRequest: {id: "request-b"}};
	assert.equal(harness.captured.commitCachedResult(queueItem, "channel-b"), "committed");
	const storedTranslation = {channelId: "channel-b", auto: true, signature: "cached-signature", content: "cached"};
	assert.deepEqual(harness.calls.slice(-3), [
		["refreshTranslationDisplay", storedTranslation],
		["createReceivedDisplayCommitResult", queueItem.message, "channel-b", {sourceSignature: "cached-signature", requestIdentity: "request-b", status: "translated", translation: storedTranslation}],
		["commitReceivedDisplayResult", {commit: [queueItem.message, "channel-b", {sourceSignature: "cached-signature", requestIdentity: "request-b", status: "translated", translation: storedTranslation}]}, {refresh: false}]
	]);
});
