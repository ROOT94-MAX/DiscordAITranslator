const {createHistoricalMessageSource} = require("./historical-message-source");
const {createDiscordHistoryAdapter} = require("./discord-history-adapter");

function createHistoricalSourceRuntime({
	createSource = createHistoricalMessageSource,
	createHistoryAdapter = createDiscordHistoryAdapter,
	createAbortController = () => typeof AbortController == "function" ? new AbortController() : null,
	messageStore = null,
	fetchMessages = null,
	isTranslationEnabled = () => false,
	getSelectedChannelId = () => null,
	cloneMessage = message => message,
	getMessageChannelId = () => null,
	extractOriginalContentData = () => null,
	cloneOriginalContentData = originalContentData => originalContentData,
	shouldAutoTranslateReceivedMessage = () => false,
	getCachedReceivedTranslation = () => null,
	collectHistoricalTranslationMessage = () => false,
	finishHistoricalTranslationSnapshot = () => false,
	getFailedHistoricalTranslationCount = () => 0,
	updateLoadedAutoTranslationStatus = () => {},
	getCurrentBatchNumber = () => 0
} = {}) {
	const historyAdapter = createHistoryAdapter({messageStore, fetchMessages});
	let generations = {};
	let inFlightBuilds = {};

	function abortInFlightBuild(channelId = null) {
		if (!channelId) {
			for (const key in inFlightBuilds) abortInFlightBuild(key);
			return;
		}
		const entry = inFlightBuilds[channelId];
		if (!entry) return;
		delete inFlightBuilds[channelId];
		try {
			if (entry.controller && typeof entry.controller.abort == "function" && !entry.controller.signal.aborted) entry.controller.abort();
		}
		catch (error) {}
	}

	function getGeneration(channelId) {
		if (!channelId) return 0;
		if (!generations[channelId]) generations[channelId] = 1;
		return generations[channelId];
	}

	function advanceGeneration(channelId = null) {
		if (!channelId) {
			abortInFlightBuild();
			for (const key in generations) generations[key] = (generations[key] || 0) + 1;
			return generations;
		}
		abortInFlightBuild(channelId);
		generations[channelId] = (generations[channelId] || 0) + 1;
		return generations[channelId];
	}

	function isGenerationCurrent(channelId, generation) {
		if (!channelId || !isTranslationEnabled(channelId)) return false;
		if (getGeneration(channelId) != generation) return false;
		const selectedChannelId = getSelectedChannelId() || channelId;
		return !selectedChannelId || selectedChannelId == channelId;
	}

	function handleChannelSessionChange(previousChannelId, channelId) {
		if (previousChannelId && previousChannelId != channelId) advanceGeneration(previousChannelId);
		if (channelId && previousChannelId != channelId) advanceGeneration(channelId);
	}

	function createQueueItem(message, channelId) {
		const messageChannelId = getMessageChannelId(message, channelId);
		const originalContentData = cloneOriginalContentData(extractOriginalContentData(message));
		return {
			message: cloneMessage(message),
			channel: {id: messageChannelId},
			originalContentData,
			historicalLoad: true,
			deferHistoricalSnapshotStart: true,
			cachedTranslation: getCachedReceivedTranslation(message, messageChannelId, originalContentData) || null
		};
	}

	async function buildInitialHistoricalTranslationSnapshot({channelId, generation, renderedMessages = [], limit = 0} = {}) {
		if (!channelId || !isGenerationCurrent(channelId, generation)) return {items: [], total: 0, prefetched: 0, accepted: 0, cancelled: true};
		abortInFlightBuild(channelId);
		const controller = createAbortController();
		const entry = {generation, controller};
		inFlightBuilds[channelId] = entry;
		const signal = controller && controller.signal || null;
		const source = createSource({
			listCachedMessages: requestChannelId => historyAdapter.listCachedMessages(requestChannelId),
			prefetchMessages: request => historyAdapter.prefetchMessages(Object.assign({}, request, {signal})),
			isEligible: message => {
				const messageChannelId = getMessageChannelId(message, channelId);
				const originalContentData = extractOriginalContentData(message);
				return shouldAutoTranslateReceivedMessage(message, {id: messageChannelId}, originalContentData, true);
			},
			toQueueItem: message => createQueueItem(message, channelId),
			isGenerationCurrent: (requestChannelId, requestGeneration) => isGenerationCurrent(requestChannelId, requestGeneration)
		});
		try {
			const result = await source.build({channelId, generation, renderedMessages, limit, signal});
			if (!result || result.cancelled || !isGenerationCurrent(channelId, generation)) return Object.assign({accepted: 0}, result || {items: [], total: 0, prefetched: 0, cancelled: true});
			let accepted = 0;
			for (const queueItem of result.items || []) if (collectHistoricalTranslationMessage(queueItem)) accepted++;
			if (accepted) finishHistoricalTranslationSnapshot(channelId);
			else {
				const failedCount = getFailedHistoricalTranslationCount(channelId);
				// A scan that accepted nothing reports total 0 so the capsule renders
				// its "no pending messages" state; claiming the scanned count as the
				// total painted a fake 0/N failure (docs/product.md).
				updateLoadedAutoTranslationStatus({active: false, collecting: false, done: true, channelId, batch: getCurrentBatchNumber(channelId), total: 0, processed: 0, displayed: 0, skipped: 0, failed: 0, retryable: failedCount, aiDropped: 0});
			}
			return Object.assign({accepted}, result);
		}
		finally {
			if (inFlightBuilds[channelId] === entry) delete inFlightBuilds[channelId];
		}
	}

	return Object.freeze({
		getGeneration,
		advanceGeneration,
		isGenerationCurrent,
		handleChannelSessionChange,
		buildInitialHistoricalTranslationSnapshot
	});
}

module.exports = {createHistoricalSourceRuntime};
