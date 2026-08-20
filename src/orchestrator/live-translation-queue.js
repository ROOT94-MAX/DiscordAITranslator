// Owns live queue order, translation locks and retry scheduling. Request validity,
// channel sessions and handoff reservations live in their dedicated modules.
// The split is deliberate: this module owns queue STATE and ORDER, not translation
// policy. Preparing an item, calling the provider, validating a result, persisting a
// cache entry and committing to the display store all arrive as injected callbacks.
// A queue instance is per plugin instance, so a plugin restart drops all of it.

const {createLiveHandoffReservations} = require("./live-handoff-reservations");
const {createLiveRequestRegistry} = require("./live-request-registry");
const {createLiveChannelSession} = require("./live-channel-session");

// How long the queue waits before re-checking a condition that blocked it (a provider
// backoff window, most often). Short enough that a live message is not visibly late.
const AUTO_TRANSLATION_QUEUE_RETRY_DELAY = 900;
// A live burst drains into one AI batch request instead of one request per message;
// the cap keeps a single prompt within comfortable output limits.
const LIVE_AI_BATCH_ITEM_LIMIT = 10;

function normalizeChannelId(channelId) {
	return channelId == null ? "" : String(channelId);
}

function createLiveTranslationQueue({
	setTimeout: scheduleTimer = null,
	clearTimeout: cancelTimer = null,
	batchItemLimit = LIVE_AI_BATCH_ITEM_LIMIT,
	retryDelay = AUTO_TRANSLATION_QUEUE_RETRY_DELAY,
	// Runtime facts the queue has to consult but must never own.
	isRuntimeActive = () => true,
	isTranslationEnabled = () => false,
	extractOriginalContentData = () => null,
	createTranslationSignature = () => null,
	getMessageChannelId = () => null,
	isProviderBackoffActive = () => false,
	shouldAutoTranslateMessage = () => false,
	isMessageWithinLoadedRange = () => true,
	// Display-store ownership stays with the display modules; the queue only says when.
	getDisplayCommitGeneration = () => 0,
	markDisplayPending = () => null,
	releaseDisplayPending = () => {},
	scheduleDisplayFlush = () => {},
	// Neighbouring runtime state that a channel session has to reset alongside ours.
	collectHistoricalMessage = () => false,
	resetLoadedMessageTracking = () => {},
	clearEligibleReplyPreviewMessages = () => {},
	clearChannelTranslationQueue = () => {},
	onChannelSessionLeft = () => {},
	onChannelSessionStarted = () => {},
	onLiveMessageQueued = () => {},
	onLiveTurnStarted = () => {},
	onReservedLiveRequestConsumed = () => {},
	onReservedLiveRequestRetired = () => {},
	// Translation policy. Everything below decides what a translation IS; the queue only
	// decides when it runs, in what order, and what happens to the item afterwards.
	getBatchEngineKey = () => null,
	createBurstContext = () => null,
	prepareBurstItem = () => null,
	requestBurstTranslation = () => Promise.resolve(null),
	resolveBurstItemResult = () => ({status: "retry"}),
	commitBurstResult = () => null,
	commitCachedResult = () => null,
	translateSingleItem = () => Promise.resolve()
} = {}) {
	const startTimer = scheduleTimer || ((callback, delay) => globalThis.setTimeout(callback, delay));
	const stopTimer = cancelTimer || (handle => globalThis.clearTimeout(handle));

	// Newest-first: enqueue unshifts and processing shifts the head, so a message that
	// just arrived is translated before a backlog the user has already scrolled past.
	let queue = [];
	// The manual/sent translation lock. Separate from the live lock because the two are
	// set by different call sites and only the live one resumes the queue.
	let busyTranslating = false;
	let liveAutoTranslating = false;
	let retryTimer = null;
	let lastConsumedLiveRequests = {};
	const handoffReservations = createLiveHandoffReservations({onRetired: onReservedLiveRequestRetired});
	const channelSession = createLiveChannelSession({
		normalizeChannelId,
		resetLoadedMessageTracking,
		clearEligibleReplyPreviewMessages,
		clearChannelTranslationQueue,
		onChannelSessionLeft,
		onChannelSessionStarted,
		onLiveTurnStarted
	});
	const requestRegistry = createLiveRequestRegistry({
		normalizeChannelId,
		isRuntimeActive,
		isTranslationEnabled,
		extractOriginalContentData,
		createTranslationSignature,
		releaseDisplayPending,
		clearReservedLiveRequest: handoffReservations.clear,
		retireReservedLiveRequest: handoffReservations.retire
	});

	function cancelQueueRetry() {
		if (retryTimer) stopTimer(retryTimer);
		retryTimer = null;
	}

	function scheduleQueueRetry() {
		if (retryTimer) return;
		retryTimer = startTimer(_ => {
			retryTimer = null;
			processQueue();
		}, retryDelay);
	}

	function clearQueue(channelId = null) {
		requestRegistry.invalidateRequests(channelId);
		if (!channelId) {
			queue = [];
			requestRegistry.clearAllQueuedMessages();
			lastConsumedLiveRequests = {};
			handoffReservations.clear();
			cancelQueueRetry();
			return;
		}
		const key = normalizeChannelId(channelId);
		delete lastConsumedLiveRequests[key];
		handoffReservations.clear(channelId);
		queue = queue.filter(queueItem => {
			const shouldRemove = !!(queueItem && queueItem.channel && normalizeChannelId(queueItem.channel.id) === key);
			if (shouldRemove && queueItem.message && queueItem.message.id) requestRegistry.clearQueuedMessage(queueItem.message.id, queueItem.liveRequest || null);
			return !shouldRemove;
		});
		// The whole queue, not just this channel's slice: the retry exists to resume
		// processing, so it stays armed while any item is still waiting.
		if (!queue.length && retryTimer) cancelQueueRetry();
	}

	function removeMessage(messageId, channelId) {
		const normalizedMessageId = messageId == null ? "" : String(messageId);
		const normalizedChannelId = normalizeChannelId(channelId);
		if (!normalizedMessageId || !normalizedChannelId) return false;
		let removed = requestRegistry.removeMessage(normalizedMessageId, normalizedChannelId);
		queue = queue.filter(queueItem => {
			const queueMessageId = queueItem && queueItem.message && String(queueItem.message.id || "");
			const queueChannelId = normalizeChannelId(queueItem && queueItem.channel && queueItem.channel.id || queueItem && getMessageChannelId(queueItem.message));
			if (queueMessageId !== normalizedMessageId || queueChannelId !== normalizedChannelId) return true;
			removed = true;
			requestRegistry.clearQueuedMessage(normalizedMessageId, queueItem.liveRequest || null);
			return false;
		});
		if (!queue.length && retryTimer) cancelQueueRetry();
		return removed;
	}

	function reserveQueuedLiveRequest(channelId) {
		const key = normalizeChannelId(channelId);
		if (!key) return null;
		for (const queueItem of queue) {
			const queueChannelId = queueItem && queueItem.channel && queueItem.channel.id || queueItem && getMessageChannelId(queueItem.message);
			if (!queueItem || queueItem.historicalLoad || normalizeChannelId(queueChannelId) !== key || !queueItem.liveRequest || !requestRegistry.isRequestCurrent(queueItem.liveRequest)) continue;
			const ticket = String(queueItem.liveRequest.id);
			return handoffReservations.reserve(key, ticket);
		}
		handoffReservations.clear(key);
		return null;
	}

	function recordLiveRequestConsumption(request, reason = "single") {
		if (!request || !request.channelId) return null;
		const key = normalizeChannelId(request.channelId);
		const ticket = String(request.id);
		if (!key) return null;
		lastConsumedLiveRequests[key] = ticket;
		if (handoffReservations.consume(request.channelId, ticket)) onReservedLiveRequestConsumed(request.channelId, ticket, reason);
		return ticket;
	}

	function takeNextQueueItem() {
		if (!queue.length) return null;
		const reservedIndex = handoffReservations.findNextQueueIndex(queue, queueItem => ({
			channelId: queueItem && queueItem.channel && queueItem.channel.id || queueItem && getMessageChannelId(queueItem.message),
			ticket: queueItem && queueItem.liveRequest ? queueItem.liveRequest.id : null
		}));
		if (reservedIndex >= 0) return queue.splice(reservedIndex, 1)[0];
		return queue.shift();
	}

	function resetTracking(channelId = null) {
		if (channelId) {
			delete lastConsumedLiveRequests[normalizeChannelId(channelId)];
			handoffReservations.clear(channelId);
		}
		else {
			lastConsumedLiveRequests = {};
			handoffReservations.clear();
		}
		channelSession.reset(channelId);
	}

	function createQueueItem(message, channel, originalContentData = null, queueOptions = {}) {
		const normalizedOriginalContentData = originalContentData || extractOriginalContentData(message);
		return {
			message,
			channel,
			originalContentData: normalizedOriginalContentData,
			historicalLoad: !!queueOptions.historicalLoad,
			deferHistoricalSnapshotStart: !!queueOptions.deferHistoricalSnapshotStart,
			deferWhileReading: !!queueOptions.deferWhileReading,
			cachedTranslation: queueOptions.cachedTranslation || null,
			liveRequest: null
		};
	}

	function enqueueLiveItem(queueItem) {
		queue.unshift(queueItem);
		processQueue();
		return true;
	}

	function queueMessage(message, channel, originalContentData = null, queueOptions = {}) {
		const cachedTranslation = queueOptions.cachedTranslation || null;
		if (!cachedTranslation && !shouldAutoTranslateMessage(message, channel, originalContentData)) return false;
		if (queueOptions.historicalLoad && !isMessageWithinLoadedRange(message)) return false;
		const queueItem = createQueueItem(message, channel, originalContentData, queueOptions);
		if (queueItem.historicalLoad) return collectHistoricalMessage(queueItem);
		const channelId = channel && channel.id || getMessageChannelId(message);
		queueItem.liveRequest = requestRegistry.createRequest(message, channelId, queueItem.originalContentData);
		if (!queueItem.liveRequest) return false;
		// The queue is reached from the message-list render pass, before Discord commits
		// the appended live row. Give the viewport owner one chance to preserve a
		// history reader before the host can snap the virtualized list to newest.
		try {onLiveMessageQueued(channelId, String(message.id));}
		catch (error) {}
		requestRegistry.markMessageQueued(message.id, queueItem.liveRequest);
		const pendingMark = markDisplayPending({
			messageId: message.id,
			channelId,
			generation: getDisplayCommitGeneration(channelId),
			origin: "automatic",
			requestIdentity: String(queueItem.liveRequest.id)
		}, {refresh: false});
		if (pendingMark && pendingMark.catch) pendingMark.catch(_ => {});
		return enqueueLiveItem(queueItem);
	}

	function beginProcessing() {
		if (busyTranslating || liveAutoTranslating) return false;
		if (isProviderBackoffActive()) {
			scheduleQueueRetry();
			return false;
		}
		return true;
	}

	// A commit that deferred part of its work leaves the display store holding a record
	// the message list has not painted; the flush is what paints it. Either way the live
	// request is finished, so a failed commit cannot strand a loading indicator.
	function completeCommit(queueItem, channelId, commit) {
		const finish = outcome => {
			// The flush carries its lane so the rebuild diagnostics can separate cache
			// replays from fresh provider translations (cadence audit 2026-08-19).
			if (outcome && outcome.deferredIds && outcome.deferredIds.length) scheduleDisplayFlush(channelId, queueItem.message.id, queueItem.cachedTranslation ? "cached" : "live");
			requestRegistry.finishRequest(queueItem.liveRequest);
		};
		return Promise.resolve(commit).then(finish, _ => finish(null));
	}

	function handleCachedItem(queueItem) {
		if (!queueItem || !queueItem.cachedTranslation) return false;
		const channelId = queueItem.channel && queueItem.channel.id || "__global";
		const commit = commitCachedResult(queueItem, channelId);
		recordLiveRequestConsumption(queueItem.liveRequest, "cached");
		completeCommit(queueItem, channelId, commit);
		return true;
	}

	function handleGuardFailure(queueItem) {
		if (!queueItem) return false;
		if (shouldAutoTranslateMessage(queueItem.message, queueItem.channel, queueItem.originalContentData, true)) return false;
		recordLiveRequestConsumption(queueItem.liveRequest, "guard");
		requestRegistry.finishRequest(queueItem.liveRequest);
		return true;
	}

	// Drains queued live items that can share one AI batch request with the first item:
	// same channel, no cached result, and not already batch-rejected.
	function collectBatchItems(firstItem) {
		const channelId = firstItem.channel && firstItem.channel.id || getMessageChannelId(firstItem.message);
		if (!channelId || firstItem.skipLiveBatch || firstItem.cachedTranslation) return null;
		if (!getBatchEngineKey(channelId)) return null;
		const items = [firstItem];
		for (let index = 0; index < queue.length && items.length < batchItemLimit;) {
			const candidate = queue[index];
			const candidateChannelId = candidate && candidate.channel && candidate.channel.id || candidate && getMessageChannelId(candidate.message);
			if (!candidate || !candidate.message || candidate.historicalLoad || candidate.cachedTranslation || candidate.skipLiveBatch || normalizeChannelId(candidateChannelId) !== normalizeChannelId(channelId)) {
				index++;
				continue;
			}
			queue.splice(index, 1);
			items.push(candidate);
		}
		return items.length > 1 ? {channelId, items} : null;
	}

	function commitBurstItem(queueItem, channelId, result) {
		const commit = commitBurstResult(queueItem, channelId, Object.assign({
			requestIdentity: queueItem.liveRequest ? String(queueItem.liveRequest.id) : null
		}, result));
		return completeCommit(queueItem, channelId, commit);
	}

	// Returns a burst item to the single-message path, preserving the queue's
	// newest-first order so a retry is never starved behind later arrivals.
	function requeueBurstItem(queueItem, settled) {
		settled.add(queueItem);
		// Sticky: once the batch has refused an item it must never be drained into
		// another burst, or the same rejection repeats forever.
		queueItem.skipLiveBatch = true;
		// A cancelled channel already emptied its queue; re-injecting the item there
		// would restart provider traffic the cancellation was meant to stop.
		if (!requestRegistry.isRequestCurrent(queueItem.liveRequest, queueItem.message)) {
			requestRegistry.finishRequest(queueItem.liveRequest);
			return;
		}
		queue.unshift(queueItem);
	}

	async function translateBurst(burst) {
		const {channelId, items} = burst;
		// Every drained item must reach a terminal state; anything still unsettled when
		// this returns is released so no message is left with a stuck loading indicator.
		const settled = new Set();
		liveAutoTranslating = true;
		try {
			const context = createBurstContext(channelId);
			const prepared = [];
			for (const queueItem of items) {
				try {
					// A source edit or channel switch between queueing and now invalidates
					// the item; the request guard is the same one the single path uses.
					if (!requestRegistry.isRequestCurrent(queueItem.liveRequest, queueItem.message)) {
						settled.add(queueItem);
						requestRegistry.finishRequest(queueItem.liveRequest);
						continue;
					}
					const preparedItem = prepareBurstItem(queueItem, channelId, context);
					if (!preparedItem || preparedItem.skipped || preparedItem.cachedTranslation || !preparedItem.protectedText) {
						// Anything the batch cannot carry goes back to the single path.
						requeueBurstItem(queueItem, settled);
						continue;
					}
					prepared.push(preparedItem);
				}
				catch (error) {
					requeueBurstItem(queueItem, settled);
				}
			}
			if (!prepared.length) return;
			channelSession.noteLiveTurnStarted(channelId);
			for (const preparedItem of prepared) if (preparedItem && preparedItem.queueItem && preparedItem.queueItem.liveRequest && recordLiveRequestConsumption(preparedItem.queueItem.liveRequest, "burst")) break;
			let batchOutcome = null;
			try {
				batchOutcome = await requestBurstTranslation(context, prepared);
			}
			catch (error) {batchOutcome = null;}
			const detailedOutcome = batchOutcome && typeof batchOutcome == "object" && (Object.prototype.hasOwnProperty.call(batchOutcome, "translations") || batchOutcome.failureKind);
			const resultMap = detailedOutcome ? batchOutcome.translations : batchOutcome;
			const terminalFailure = detailedOutcome && ["auth", "configuration", "permanent"].includes(batchOutcome.failureKind);
			const commits = [];
			for (const preparedItem of prepared) {
				const queueItem = preparedItem.queueItem;
				try {
					const resolved = resolveBurstItemResult(preparedItem, resultMap, channelId) || {status: "retry"};
					// One unusable item must not cost the whole burst: retry it alone.
					if (resolved.status === "retry") {
						if (terminalFailure) {
							settled.add(queueItem);
							requestRegistry.finishRequest(queueItem.liveRequest);
							continue;
						}
						requeueBurstItem(queueItem, settled);
						continue;
					}
					// A skip verdict is terminal and its decision is already persisted, so it
					// commits without re-checking the request; paying for a second full-price
					// request to reach the same verdict is waste. A translation still checks,
					// because a stale one would paint over content the user has moved on from.
					if (resolved.status !== "skipped" && !requestRegistry.isRequestCurrent(queueItem.liveRequest, queueItem.message)) {
						settled.add(queueItem);
						requestRegistry.finishRequest(queueItem.liveRequest);
						continue;
					}
					settled.add(queueItem);
					commits.push(commitBurstItem(queueItem, channelId, resolved.result));
				}
				catch (error) {
					requeueBurstItem(queueItem, settled);
				}
			}
			await Promise.all(commits);
		}
		finally {
			for (const queueItem of items) {
				if (settled.has(queueItem)) continue;
				try {requestRegistry.finishRequest(queueItem.liveRequest);}
				catch (error) {}
			}
			liveAutoTranslating = false;
			processQueue();
		}
	}

	function translateSingle(queueItem) {
		const channelId = queueItem && queueItem.channel && queueItem.channel.id || getMessageChannelId(queueItem && queueItem.message);
		channelSession.noteLiveTurnStarted(channelId);
		liveAutoTranslating = true;
		recordLiveRequestConsumption(queueItem && queueItem.liveRequest, "single");
		const translation = translateSingleItem(queueItem);
		translation.then(_ => {
			requestRegistry.finishRequest(queueItem.liveRequest);
			liveAutoTranslating = false;
			processQueue();
		}).catch(_ => {
			requestRegistry.finishRequest(queueItem.liveRequest);
			liveAutoTranslating = false;
			processQueue();
		});
	}

	function processQueue() {
		if (!beginProcessing()) return;
		if (!queue.length) return;
		const nextItem = takeNextQueueItem();
		if (!nextItem || !nextItem.message) return processQueue();
		if (nextItem.historicalLoad) {
			collectHistoricalMessage(nextItem);
			return processQueue();
		}
		if (!requestRegistry.isRequestCurrent(nextItem.liveRequest, nextItem.message)) {
			requestRegistry.finishRequest(nextItem.liveRequest);
			return processQueue();
		}
		if (handleCachedItem(nextItem)) return processQueue();
		if (handleGuardFailure(nextItem)) return processQueue();
		// beginProcessing already refused to run inside a provider backoff window, so the
		// burst never holds the live lock across a backoff sleep.
		let burst = null;
		try {burst = collectBatchItems(nextItem);}
		catch (error) {burst = null;}
		// The burst runs detached; its own finally resumes the queue, and a failure there
		// must never surface as an unhandled rejection.
		if (burst) return translateBurst(burst).catch(_ => {});
		return translateSingle(nextItem);
	}

	return Object.freeze({
		// Live request registry.
		getRequestKey: requestRegistry.getRequestKey,
		createRequest: requestRegistry.createRequest,
		isRequestCurrent: requestRegistry.isRequestCurrent,
		finishRequest: requestRegistry.finishRequest,
		releaseRequestDisplayPending: requestRegistry.releaseRequestDisplayPending,
		invalidateRequests: requestRegistry.invalidateRequests,
		invalidateRequestForMessage: requestRegistry.invalidateRequestForMessage,
		removeRequestForMessage: requestRegistry.removeMessage,
		// A restart retires every in-flight request without releasing display pending
		// records, because the display runtime is reset separately on start.
		restartRequestGeneration() {
			requestRegistry.restartRequestGeneration();
			lastConsumedLiveRequests = {};
			handoffReservations.clear();
		},
		getRuntimeGeneration: requestRegistry.getRuntimeGeneration,
		// Queued-message markers. Historical jobs park their own marker shape here so a
		// single lookup answers "is this message already spoken for".
		isMessageQueued: requestRegistry.isMessageQueued,
		getQueuedMarker: requestRegistry.getQueuedMarker,
		markMessageQueued: requestRegistry.markMessageQueued,
		clearQueuedMessage: requestRegistry.clearQueuedMessage,
		clearHistoricalQueuedMessage: requestRegistry.clearHistoricalQueuedMessage,
		clearAllQueuedMessages() {
			requestRegistry.clearAllQueuedMessages();
			lastConsumedLiveRequests = {};
			handoffReservations.clear();
		},
		// Queue contents and order.
		createQueueItem,
		enqueueLiveItem,
		queueMessage,
		removeMessage,
		clearQueue,
		processQueue,
		beginProcessing,
		isQueueEmpty: () => !queue.length,
		getQueueLength: () => queue.length,
		hasQueuedLiveForChannel(channelId) {
			const key = normalizeChannelId(channelId);
			return !!key && queue.some(queueItem => queueItem && !queueItem.historicalLoad && normalizeChannelId(queueItem.channel && queueItem.channel.id || getMessageChannelId(queueItem.message)) === key);
		},
		reserveQueuedLiveRequest,
		clearReservedLiveRequest: handoffReservations.clear,
		getLastConsumedLiveRequestTicket: channelId => lastConsumedLiveRequests[normalizeChannelId(channelId)] || null,
		getStartedLiveTurnCount: channelSession.getStartedLiveTurnCount,
		// A copy: a reader must not be able to reorder the queue behind this module's back.
		getQueueSnapshot: () => queue.slice(),
		collectBatchItems,
		requeueBurstItem,
		translateBurst,
		translateSingle,
		handleCachedItem,
		handleGuardFailure,
		// Busy flags.
		isBusyTranslating: () => !!busyTranslating,
		setBusyTranslating(value) {
			busyTranslating = !!value;
		},
		isLiveAutoTranslating: () => !!liveAutoTranslating,
		setLiveAutoTranslating(value) {
			liveAutoTranslating = !!value;
		},
		// Retry timer.
		scheduleQueueRetry,
		cancelQueueRetry,
		hasPendingQueueRetry: () => !!retryTimer,
		// Per-channel session bookkeeping.
		getChannelState: channelSession.getChannelState,
		prepareChannelSession: channelSession.prepare,
		resetTracking,
		getLastChannelId: channelSession.getLastChannelId
	});
}

module.exports = {
	AUTO_TRANSLATION_QUEUE_RETRY_DELAY,
	LIVE_AI_BATCH_ITEM_LIMIT,
	createLiveTranslationQueue
};
