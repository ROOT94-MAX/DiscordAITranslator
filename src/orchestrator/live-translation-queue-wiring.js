const {createLiveTranslationQueue} = require("./live-translation-queue");

// Owns the plugin/BDFDB adapter for live queue state. The queue retains ordering,
// locks, handoff reservations, channel sessions, batching and retry policy; this
// module supplies translation/display policy and neighbouring owner callbacks.
function createPluginLiveTranslationQueue({
	plugin,
	BDFDB,
	loadedTranslationStatusStore,
	getRuntimeActive = () => true,
	languageTypes,
	messageTypes,
	createQueue = createLiveTranslationQueue
}) {
	return createQueue({
		setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
		isRuntimeActive: getRuntimeActive,
		isTranslationEnabled: channelId => plugin.isTranslationEnabled(channelId),
		extractOriginalContentData: message => plugin.extractOriginalContentData(message),
		createTranslationSignature: (message, channelId, originalContentData) => plugin.createReceivedTranslationSignature(message, channelId, originalContentData),
		getMessageChannelId: message => plugin.getMessageChannelId(message),
		isProviderBackoffActive: () => plugin.ensureProviderClient().isBackoffActive(),
		shouldAutoTranslateMessage: (message, channel, originalContentData, ignoreQueued) => plugin.shouldAutoTranslateReceivedMessage(message, channel, originalContentData, ignoreQueued),
		isMessageWithinLoadedRange: message => plugin.isMessageWithinLoadedRange(message),
		getDisplayCommitGeneration: channelId => plugin.getReceivedDisplayCommitGeneration(channelId),
		markDisplayPending: (record, options) => plugin.markReceivedDisplayPending(record, options),
		releaseDisplayPending: record => plugin.releaseReceivedDisplayPending(record),
		scheduleDisplayFlush: (channelId, messageId, source) => plugin.scheduleReceivedDisplayFlush(channelId, messageId, null, null, source || "live"),
		collectHistoricalMessage: queueItem => plugin.collectHistoricalTranslationMessage(queueItem),
		resetLoadedMessageTracking: (channelId = null) => loadedTranslationStatusStore.resetSeen(channelId),
		clearEligibleReplyPreviewMessages: channelId => plugin.clearAutoTranslationEligibleReplyPreviewMessages(channelId),
		clearChannelTranslationQueue: channelId => plugin.clearAutoTranslationQueue(channelId),
		onChannelSessionLeft: channelId => plugin.ensureReceivedDisplayRuntime().pruneChannel(channelId),
		// new_only hides what is already on screen, so a fresh session drops the
		// automatic records the previous session painted.
		onChannelSessionStarted: channelId => plugin.getReceivedAutoTranslateScope() == "new_only" && plugin.clearDisplayedAutoTranslations(channelId),
		onReservedLiveRequestConsumed: (channelId, handoffTicket) => plugin.resumeQueuedHistoricalTranslationJobs(channelId, handoffTicket),
		onReservedLiveRequestRetired: (channelId, handoffTicket) => plugin.resumeQueuedHistoricalTranslationJobs(channelId, handoffTicket, {retired: true}),
		getBatchEngineKey: channelId => plugin.getHistoricalAiBatchEngineKey(channelId),
		createBurstContext: channelId => ({
			engineKey: plugin.getHistoricalAiBatchEngineKey(channelId),
			input: Object.assign({}, plugin.ensureSettingsStore().getLanguage(plugin.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId)) || {}),
			output: Object.assign({}, plugin.ensureSettingsStore().getLanguage(plugin.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId)) || {})
		}),
		prepareBurstItem: (queueItem, channelId, context) => plugin.prepareHistoricalAiBatchQueueItem(queueItem, channelId, context.input, context.output),
		requestBurstTranslation: (context, prepared) => plugin.requestAiBatchTranslationDetailed(context.engineKey, prepared),
		// Translation identity and result policy stay at the plugin seam; the queue
		// learns only whether the item completed, skipped, or needs a single retry.
		resolveBurstItemResult: (preparedItem, resultMap, channelId) => {
			const messageId = String(preparedItem.message.id);
			const rawTranslation = resultMap && Object.prototype.hasOwnProperty.call(resultMap, messageId) ? resultMap[messageId] : null;
			if (rawTranslation != null && plugin.isSkipTranslationSignal(rawTranslation)) {
				plugin.persistReceivedSkipDecision(messageId, preparedItem.signature, "ai_skip_signal", preparedItem.protectedText);
				return {status: "skipped", result: {sourceSignature: preparedItem.signature, status: "skipped", reason: "ai_skip_signal"}};
			}
			let validation = {ok: false};
			try {validation = plugin.validateHistoricalTranslationJobResult(preparedItem, rawTranslation, {channelId}) || {ok: false};}
			catch (error) {validation = {ok: false};}
			if (!validation.ok) return {status: "retry"};
			// A paid valid result is cached even if the live request went stale, so a
			// later retry can use the cache rather than the provider.
			try {plugin.persistTranslationCacheEntry(messageId, preparedItem.signature, validation.translation);}
			catch (error) {}
			return {status: "translated", result: {sourceSignature: preparedItem.signature, status: "translated", translation: validation.translation}};
		},
		commitBurstResult: (queueItem, channelId, result) => plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(queueItem.message, channelId, result), {refresh: false}),
		commitCachedResult: (queueItem, channelId) => {
			const storedTranslation = plugin.refreshTranslationDisplay(Object.assign({channelId, auto: true}, queueItem.cachedTranslation));
			return plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(queueItem.message, channelId, {
				sourceSignature: storedTranslation.signature != null ? String(storedTranslation.signature) : plugin.createReceivedTranslationSignature(queueItem.message, channelId, queueItem.originalContentData),
				requestIdentity: queueItem.liveRequest ? String(queueItem.liveRequest.id) : null,
				status: "translated",
				translation: storedTranslation
			}), {refresh: false});
		},
		translateSingleItem: queueItem => plugin.translateMessage(queueItem.message, queueItem.channel, {
			auto: true,
			silent: true,
			trackBusy: false,
			originalContentData: queueItem.originalContentData,
			liveRequest: queueItem.liveRequest
		})
	});
}

module.exports = {createPluginLiveTranslationQueue};
