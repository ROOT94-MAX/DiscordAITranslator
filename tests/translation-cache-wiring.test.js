const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginTranslationCacheStore} = require("../src/cache/translation-cache-wiring");

function createFixture() {
	const calls = [];
	const timer = {id: "timer"};
	const plugin = {
		extractOriginalContentData: message => (calls.push(["extractOriginalContentData", message]), {content: message.content}),
		createReceivedTranslationSignature: (message, channelId, sourceData) => (calls.push(["createSignature", message, channelId, sourceData]), "signature"),
		normalizeStoredTranslationData: translation => (calls.push(["normalizeStoredTranslation", translation]), {normalized: translation}),
		extractLegacyDisplayedTranslationParts: content => (calls.push(["extractLegacyDisplayedParts", content]), {translatedContent: content}),
		refreshTranslationDisplay: translation => (calls.push(["refreshTranslationDisplay", translation]), {refreshed: translation}),
		isTranslationResultTooSimilar: translation => (calls.push(["isTranslationResultTooSimilar", translation]), true),
		shouldSkipReceivedTranslationBeforeRequest: (sourceData, channelId) => (calls.push(["shouldSkipBeforeRequest", sourceData, channelId]), true),
		shouldKeepAutoTranslatedResult: (translation, channelId) => (calls.push(["shouldKeepAutoTranslatedResult", translation, channelId]), false),
		getLoadedAutoTranslationPreviewText: text => (calls.push(["getSkipPreviewText", text]), `preview:${text}`)
	};
	const BDFDB = {
		TimeUtils: {
			timeout: (callback, delay) => (calls.push(["setTimeout", callback, delay]), timer),
			clear: value => calls.push(["clearTimeout", value])
		},
		DataUtils: {
			load: (owner, key) => (calls.push(["loadCache", owner, key]), {cached: true}),
			save: (value, owner, key) => calls.push(["saveCache", value, owner, key])
		}
	};
	let dependencies = null;
	const store = {tag: "translation-cache-store"};
	const created = createPluginTranslationCacheStore({
		plugin,
		BDFDB,
		now: () => 123,
		createStore: input => (dependencies = input, store)
	});
	return {plugin, BDFDB, calls, timer, dependencies, store, created};
}

test("translation cache wiring creates the store with the complete dependency contract", () => {
	const fixture = createFixture();

	assert.equal(fixture.created, fixture.store);
	assert.deepEqual(Object.keys(fixture.dependencies).sort(), [
		"clearTimeout",
		"createSignature",
		"extractLegacyDisplayedParts",
		"extractOriginalContentData",
		"getSkipPreviewText",
		"isTranslationResultTooSimilar",
		"loadCache",
		"normalizeStoredTranslation",
		"now",
		"refreshTranslationDisplay",
		"saveCache",
		"setTimeout",
		"shouldKeepAutoTranslatedResult",
		"shouldSkipBeforeRequest"
	].sort());
	assert.equal(fixture.dependencies.now(), 123);
});

test("translation cache wiring keeps persistence and managed timers on their established BDFDB seams", () => {
	const fixture = createFixture();
	const callback = () => {};
	const cache = {message: {translation: "translated"}};

	assert.equal(fixture.dependencies.setTimeout(callback, 300), fixture.timer);
	fixture.dependencies.clearTimeout(fixture.timer);
	assert.deepEqual(fixture.dependencies.loadCache(), {cached: true});
	fixture.dependencies.saveCache(cache);

	assert.deepEqual(fixture.calls, [
		["setTimeout", callback, 300],
		["clearTimeout", fixture.timer],
		["loadCache", fixture.plugin, "translationCache"],
		["saveCache", cache, fixture.plugin, "translationCache"]
	]);
});

test("translation cache wiring delegates source, signature, display and policy decisions without changing arguments", () => {
	const fixture = createFixture();
	const message = {id: "message-1", content: "hello"};
	const sourceData = {content: "hello"};
	const translation = {content: "你好"};

	assert.deepEqual(fixture.dependencies.extractOriginalContentData(message), {content: "hello"});
	assert.equal(fixture.dependencies.createSignature(message, "channel-1", sourceData), "signature");
	assert.deepEqual(fixture.dependencies.normalizeStoredTranslation(translation), {normalized: translation});
	assert.deepEqual(fixture.dependencies.extractLegacyDisplayedParts("legacy"), {translatedContent: "legacy"});
	assert.deepEqual(fixture.dependencies.refreshTranslationDisplay(translation), {refreshed: translation});
	assert.equal(fixture.dependencies.isTranslationResultTooSimilar(translation), true);
	assert.equal(fixture.dependencies.shouldSkipBeforeRequest(sourceData, "channel-1"), true);
	assert.equal(fixture.dependencies.shouldKeepAutoTranslatedResult(translation, "channel-1"), false);
	assert.equal(fixture.dependencies.getSkipPreviewText("sample"), "preview:sample");

	assert.deepEqual(fixture.calls, [
		["extractOriginalContentData", message],
		["createSignature", message, "channel-1", sourceData],
		["normalizeStoredTranslation", translation],
		["extractLegacyDisplayedParts", "legacy"],
		["refreshTranslationDisplay", translation],
		["isTranslationResultTooSimilar", translation],
		["shouldSkipBeforeRequest", sourceData, "channel-1"],
		["shouldKeepAutoTranslatedResult", translation, "channel-1"],
		["getSkipPreviewText", "sample"]
	]);
});
