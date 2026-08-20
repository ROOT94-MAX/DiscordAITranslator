const {createMessageViewportStore} = require("./message-viewport-store");

// Owns the plugin/BDFDB/browser adapter for viewport state. The store keeps every
// scroll, anchor and input-activity rule; this module only supplies host capabilities
// and the one callback that hands scroll-idle control back to historical batching.
function createPluginMessageViewportStore({
	plugin,
	BDFDB,
	getDocument = () => typeof document == "undefined" ? null : document,
	requestAnimationFrame: scheduleAnimationFrame = callback => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : setTimeout(callback, 0),
	now = Date.now,
	escapeSelectorValue = value => typeof CSS != "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/(["\\])/g, "\\$1"),
	createStore = createMessageViewportStore
}) {
	return createStore({
		getDocument,
		setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
		requestAnimationFrame: scheduleAnimationFrame,
		now,
		getSelectedChannelId: () => BDFDB.LibraryStores.SelectedChannelStore.getChannelId(),
		getMessagesScrollerSelector: () => BDFDB.dotCN && BDFDB.dotCN.messagesscroller,
		escapeSelectorValue,
		onScrollActivityFinished: channelId => plugin.finishHistoricalTranslationSnapshot(channelId)
	});
}

module.exports = {createPluginMessageViewportStore};
