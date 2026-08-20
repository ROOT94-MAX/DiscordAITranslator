const {createLoadedStatusCapsuleController} = require("./loaded-status-capsule");
const {positionLoadedStatusElement} = require("./loaded-status-position");

// Owns the plugin/BDFDB/browser adapter for the loaded-status capsule. The
// controller retains DOM lifecycle and visibility policy; this module supplies
// the host Stores, browser globals and plugin callbacks without leaving that
// dependency fan-out in the composition root.
function createPluginLoadedStatusCapsuleController({
	plugin,
	BDFDB,
	store,
	getRuntimeActive = () => true,
	clearHistoricalTracker = () => {},
	createController = createLoadedStatusCapsuleController
}) {
	return createController({
		store,
		getSelectedChannelId: () => BDFDB.LibraryStores.SelectedChannelStore.getChannelId(),
		isTranslationEnabled: channelId => plugin.isTranslationEnabled(channelId),
		getReceivedAutoTranslateScope: () => plugin.getReceivedAutoTranslateScope(),
		isChineseUiLanguage: () => plugin.isChineseUiLanguage(),
		positionElement: element => plugin.positionLoadedAutoTranslationStatusElement(element),
		isUserScrolling: () => plugin.isUserActivelyScrollingMessages(),
		isRuntimeActive: getRuntimeActive,
		clearHistoricalTracker,
		hooks: {
			attachScrollWatcher: () => plugin.attachAutoTranslationScrollWatcher(),
			ensurePositionWatcher: () => plugin.ensureLoadedAutoTranslationStatusPositionWatcher(),
			removeElement: () => plugin.removeLoadedAutoTranslationStatusElement(),
			updateInlineElements: () => plugin.updateInlineLoadedAutoTranslationStatusElements(),
			positionElement: element => plugin.positionLoadedAutoTranslationStatusElement(element),
			onRetry: channelId => plugin.retryFailedHistoricalTranslations(channelId)
		}
	});
}

function positionPluginLoadedStatusElement({
	BDFDB,
	element,
	getDocument = () => typeof document == "undefined" ? null : document,
	getWindow = () => typeof window == "undefined" ? null : window,
	positionLoadedStatusElement: positionElement = positionLoadedStatusElement
}) {
	return positionElement({BDFDB, document: getDocument(), window: getWindow(), element});
}

module.exports = {createPluginLoadedStatusCapsuleController, positionPluginLoadedStatusElement};
