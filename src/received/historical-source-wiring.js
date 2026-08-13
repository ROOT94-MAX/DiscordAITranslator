const {createHistoricalSourceRuntime} = require("./historical-source-runtime");

// Builds the plugin-facing historical source runtime: resolves Discord's message
// store and history fetch modules from BDFDB, optionally wraps them with the
// debug-build evidence probe, and binds every callback to the owning plugin
// instance. Extracted from the legacy runtime so the Discord module resolution
// and the debug instrumentation have one owner outside the plugin class.
function createPluginHistoricalSourceRuntime({
	plugin,
	BDFDB,
	getCurrentBatchNumber,
	debugProbe = null,
	createRuntime = createHistoricalSourceRuntime
}) {
	const rawMessageStore = BDFDB.LibraryStores && BDFDB.LibraryStores.MessageStore;
	const rawFetchMessages = BDFDB.LibraryModules && (BDFDB.LibraryModules.MessageActions || BDFDB.LibraryModules.MessageManager || BDFDB.LibraryModules.MessageUtils);
	return createRuntime({
		messageStore: debugProbe ? debugProbe.wrapModule(rawMessageStore, {label: "MessageStore", methods: ["getMessages", "getRawMessages", "getMessageCache"]}) : rawMessageStore,
		fetchMessages: debugProbe ? debugProbe.wrapModule(rawFetchMessages, {label: "MessageFetchModule", methods: ["fetchMessages", "loadMessages", "fetch"]}) : rawFetchMessages,
		isTranslationEnabled: channelId => plugin.isTranslationEnabled(channelId),
		getSelectedChannelId: () => BDFDB.LibraryStores && BDFDB.LibraryStores.SelectedChannelStore && typeof BDFDB.LibraryStores.SelectedChannelStore.getChannelId == "function" ? BDFDB.LibraryStores.SelectedChannelStore.getChannelId() : null,
		cloneMessage: message => plugin.cloneHistoricalSourceMessage(message),
		getMessageChannelId: (message, fallbackChannelId) => plugin.getMessageChannelId(message, fallbackChannelId),
		extractOriginalContentData: message => plugin.extractOriginalContentData(message),
		cloneOriginalContentData: originalContentData => plugin.cloneOriginalContentData(originalContentData),
		shouldAutoTranslateReceivedMessage: (message, channel, originalContentData, ignoreQueued) => plugin.shouldAutoTranslateReceivedMessage(message, channel, originalContentData, ignoreQueued),
		getCachedReceivedTranslation: (message, channelId, originalContentData) => plugin.getCachedReceivedTranslation(message, channelId, originalContentData),
		collectHistoricalTranslationMessage: queueItem => plugin.collectHistoricalTranslationMessage(queueItem),
		finishHistoricalTranslationSnapshot: channelId => plugin.finishHistoricalTranslationSnapshot(channelId),
		getFailedHistoricalTranslationCount: channelId => plugin.getFailedHistoricalTranslationCount(channelId),
		updateLoadedAutoTranslationStatus: update => plugin.updateLoadedAutoTranslationStatus(update),
		getCurrentBatchNumber
	});
}

module.exports = {createPluginHistoricalSourceRuntime};
