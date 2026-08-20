const {createTranslationCacheStore} = require("./translation-cache-store");

// Owns the plugin/BDFDB adapter for the translation cache. The cache store keeps
// persistence, debounce and compatibility behaviour; this wiring maps those ports to
// the plugin's established helpers without leaving BDFDB keys in the composition root.
function createPluginTranslationCacheStore({
	plugin,
	BDFDB,
	now = Date.now,
	createStore = createTranslationCacheStore
}) {
	return createStore({
		now,
		setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
		loadCache: () => BDFDB.DataUtils.load(plugin, "translationCache"),
		saveCache: cache => BDFDB.DataUtils.save(cache, plugin, "translationCache"),
		extractOriginalContentData: message => plugin.extractOriginalContentData(message),
		createSignature: (message, channelId, sourceData) => plugin.createReceivedTranslationSignature(message, channelId, sourceData),
		normalizeStoredTranslation: translation => plugin.normalizeStoredTranslationData(translation),
		extractLegacyDisplayedParts: content => plugin.extractLegacyDisplayedTranslationParts(content),
		refreshTranslationDisplay: translation => plugin.refreshTranslationDisplay(translation),
		isTranslationResultTooSimilar: translation => plugin.isTranslationResultTooSimilar(translation),
		shouldSkipBeforeRequest: (sourceData, channelId) => plugin.shouldSkipReceivedTranslationBeforeRequest(sourceData, channelId),
		shouldKeepAutoTranslatedResult: (translation, channelId) => plugin.shouldKeepAutoTranslatedResult(translation, channelId),
		getSkipPreviewText: text => plugin.getLoadedAutoTranslationPreviewText(text)
	});
}

module.exports = {createPluginTranslationCacheStore};
