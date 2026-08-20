const {createMessageDeletionLifecycle} = require("./message-deletion-lifecycle");
const {resolveStoreDispatcher} = require("../discord/store-dispatcher");

// Owns the plugin/Discord adapter for message deletion. The lifecycle keeps Store
// subscription and cleanup ordering; this wiring maps each channel-scoped owner into
// that policy without leaving deletion fan-out in the composition root.
function createPluginMessageDeletionLifecycle({
	plugin,
	BDFDB,
	resolveDispatcher: resolveDeletionDispatcher = () => resolveStoreDispatcher(BDFDB, ["subscribe", "unsubscribe"]),
	createLifecycle = createMessageDeletionLifecycle
}) {
	return createLifecycle({
		removeLiveMessage: (messageId, channelId) => plugin.ensureLiveTranslationQueue().removeMessage(messageId, channelId),
		getHistoricalQueue: channelId => plugin.getHistoricalTranslationJobQueue(channelId, false),
		getFailedSnapshot: channelId => plugin.ensureHistoricalJobRegistry().getFailedSnapshot(channelId),
		setFailedSnapshot: (channelId, snapshot) => plugin.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, snapshot),
		deleteFailedSnapshot: channelId => plugin.ensureHistoricalJobRegistry().deleteFailedSnapshot(channelId),
		clearHistoricalMarker: (messageId, jobId) => plugin.ensureLiveTranslationQueue().clearHistoricalQueuedMessage(messageId, jobId),
		hasCachedTranslation: messageId => plugin.hasCachedTranslationEntry(messageId),
		clearCachedTranslation: messageId => plugin.clearCachedTranslation(messageId),
		deleteDisplayMessage: (messageId, channelId) => plugin.ensureReceivedDisplayRuntime().deleteMessage(messageId, channelId),
		resolveDispatcher: resolveDeletionDispatcher
	});
}

module.exports = {createPluginMessageDeletionLifecycle};
