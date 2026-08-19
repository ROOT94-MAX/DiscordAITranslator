const test = require("node:test");
const assert = require("node:assert/strict");
const {
	createLiveTranslationQueue,
	LIVE_AI_BATCH_ITEM_LIMIT,
	AUTO_TRANSLATION_QUEUE_RETRY_DELAY
} = require("../src/orchestrator/live-translation-queue");

function createMessage(id, content = `content-${id}`) {
	return {id: String(id), content};
}

function createDeferred() {
	let resolve = null;
	let reject = null;
	const promise = new Promise((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return {promise, resolve, reject};
}

// Lets every already-queued microtask and promise job run, which is what the burst
// path needs between its awaits.
function settle() {
	return new Promise(resolve => setImmediate(resolve));
}

function createHarness(overrides = {}) {
	const log = {
		released: [],
		pendingMarks: [],
		flushes: [],
		historical: [],
		single: [],
		burstContexts: [],
		burstRequests: [],
		burstCommits: [],
		cachedCommits: [],
		sessionStarts: [],
		clearedChannels: [],
		loadedResets: [],
		eligibleClears: [],
		leftChannels: []
	};
	const state = {
		runtimeActive: true,
		disabledChannels: new Set(),
		backoff: false,
		// Off by default so the single-message path is the one under test; the burst
		// tests turn it on explicitly.
		batchEngine: null,
		autoTranslate: true,
		withinLoadedRange: true,
		retryMessageIds: new Set(),
		skipMessageIds: new Set()
	};
	const timers = new Map();
	const singleDeferrals = [];
	let timerSequence = 0;
	let queue = null;

	const dependencies = Object.assign({
		setTimeout: (callback, delay) => {
			const handle = ++timerSequence;
			timers.set(handle, {callback, delay});
			return handle;
		},
		clearTimeout: handle => {
			timers.delete(handle);
		},
		isRuntimeActive: () => state.runtimeActive,
		isTranslationEnabled: channelId => !state.disabledChannels.has(String(channelId)),
		extractOriginalContentData: message => ({content: message && message.content || ""}),
		createTranslationSignature: (message, channelId) => `${channelId}|${message && message.content}`,
		getMessageChannelId: message => message && message.channelId || null,
		isProviderBackoffActive: () => state.backoff,
		shouldAutoTranslateMessage: () => state.autoTranslate,
		isMessageWithinLoadedRange: () => state.withinLoadedRange,
		getDisplayCommitGeneration: () => 7,
		markDisplayPending: (record, options) => {
			log.pendingMarks.push({record, options});
			return null;
		},
		releaseDisplayPending: record => log.released.push(record),
		scheduleDisplayFlush: (channelId, messageId, source) => log.flushes.push({channelId, messageId, source}),
		collectHistoricalMessage: queueItem => {
			log.historical.push(queueItem);
			return true;
		},
		resetLoadedMessageTracking: (channelId = null) => log.loadedResets.push(channelId),
		clearEligibleReplyPreviewMessages: channelId => log.eligibleClears.push(channelId),
		clearChannelTranslationQueue: channelId => {
			log.clearedChannels.push(channelId);
			queue.clearQueue(channelId);
		},
		onChannelSessionLeft: channelId => log.leftChannels.push(channelId),
		onChannelSessionStarted: channelId => log.sessionStarts.push(channelId),
		getBatchEngineKey: () => state.batchEngine,
		createBurstContext: channelId => {
			log.burstContexts.push(channelId);
			return {channelId, engineKey: state.batchEngine};
		},
		prepareBurstItem: (queueItem, channelId) => ({
			queueItem,
			message: queueItem.message,
			signature: `${channelId}|${queueItem.message.content}`,
			protectedText: queueItem.message.content
		}),
		requestBurstTranslation: (context, prepared) => {
			log.burstRequests.push(prepared.map(preparedItem => String(preparedItem.message.id)));
			const resultMap = {};
			for (const preparedItem of prepared) resultMap[String(preparedItem.message.id)] = `translated-${preparedItem.message.content}`;
			return Promise.resolve(resultMap);
		},
		resolveBurstItemResult: preparedItem => {
			const messageId = String(preparedItem.message.id);
			if (state.retryMessageIds.has(messageId)) return {status: "retry"};
			if (state.skipMessageIds.has(messageId)) return {status: "skipped", result: {sourceSignature: preparedItem.signature, status: "skipped", reason: "ai_skip_signal"}};
			return {status: "translated", result: {sourceSignature: preparedItem.signature, status: "translated", translation: `translated-${preparedItem.message.content}`}};
		},
		commitBurstResult: (queueItem, channelId, result) => {
			log.burstCommits.push({messageId: String(queueItem.message.id), channelId, result});
			return Promise.resolve({confirmedIds: [String(queueItem.message.id)]});
		},
		commitCachedResult: (queueItem, channelId) => {
			log.cachedCommits.push({messageId: String(queueItem.message.id), channelId});
			return Promise.resolve({confirmedIds: [String(queueItem.message.id)]});
		},
		translateSingleItem: queueItem => {
			log.single.push(String(queueItem.message.id));
			const deferred = createDeferred();
			singleDeferrals.push(deferred);
			return deferred.promise;
		}
	}, overrides);

	queue = createLiveTranslationQueue(dependencies);

	function makeItem(id, channelId, queueOptions = {}) {
		const message = createMessage(id);
		const queueItem = queue.createQueueItem(message, {id: channelId}, null, queueOptions);
		queueItem.liveRequest = queue.createRequest(message, channelId);
		if (queueItem.liveRequest) queue.markMessageQueued(message.id, queueItem.liveRequest);
		return queueItem;
	}

	return {
		queue,
		log,
		state,
		makeItem,
		// Mirrors queueAutoTranslateMessage's live branch without the display-pending
		// mark, so a test can build an exact queue without stubbing the guards.
		addLiveItem(id, channelId, queueOptions = {}) {
			const queueItem = makeItem(id, channelId, queueOptions);
			queue.enqueueLiveItem(queueItem);
			return queueItem;
		},
		queueIds: () => queue.getQueueSnapshot().map(queueItem => String(queueItem.message.id)),
		pendingTimers: () => [...timers.values()],
		runTimers() {
			const pending = [...timers.entries()];
			timers.clear();
			for (const [, timer] of pending) timer.callback();
			return pending.length;
		},
		resolveSingle(index = 0, value = null) {
			singleDeferrals[index].resolve(value);
			return settle();
		},
		rejectSingle(index = 0, error = new Error("provider failed")) {
			singleDeferrals[index].reject(error);
			return settle();
		},
		settle
	};
}

test("the queue is newest-first: enqueue unshifts and processing shifts the head", async () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.addLiveItem("m3", "c1");

	assert.deepEqual(harness.queueIds(), ["m3", "m2", "m1"], "the newest message sits at the head");

	harness.queue.setBusyTranslating(false);
	harness.queue.processQueue();
	assert.deepEqual(harness.log.single, ["m3"], "processing takes the head, not the tail");
	assert.deepEqual(harness.queueIds(), ["m2", "m1"]);

	await harness.resolveSingle(0);
	assert.deepEqual(harness.log.single, ["m3", "m2"], "the queue resumes itself after each item");
});

test("the oldest reservation wins even when another channel reserves a newer queue item", async () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	const firstReserved = harness.addLiveItem("m1", "c1");
	assert.equal(harness.queue.reserveQueuedLiveRequest("c1"), String(firstReserved.liveRequest.id));
	const laterReserved = harness.addLiveItem("m2", "c2");
	assert.equal(harness.queue.reserveQueuedLiveRequest("c2"), String(laterReserved.liveRequest.id));

	harness.queue.setBusyTranslating(false);
	harness.queue.processQueue();

	assert.deepEqual(harness.log.single, ["m1"], "a later unrelated reservation must not delay the first parked handoff");
	await harness.resolveSingle(0);
});

test("a superseded reserved item cannot consume the handoff through single cached or guard paths", async () => {
	for (const path of ["single", "cached", "guard"]) {
		const consumed = [];
		const retired = [];
		const harness = createHarness({
			onReservedLiveRequestConsumed: (_channelId, ticket, reason) => consumed.push([String(ticket), reason]),
			onReservedLiveRequestRetired: (_channelId, ticket, reason) => retired.push([String(ticket), reason])
		});
		harness.queue.setBusyTranslating(true);
		const queueOptions = path === "cached" ? {cachedTranslation: {content: "cached"}} : {};
		const staleItem = harness.addLiveItem("m1", "c1", queueOptions);
		const staleTicket = String(staleItem.liveRequest.id);
		assert.equal(harness.queue.reserveQueuedLiveRequest("c1"), staleTicket);
		harness.queue.createRequest(createMessage("m1", "replacement"), "c1");
		if (path === "guard") harness.state.autoTranslate = false;

		harness.queue.setBusyTranslating(false);
		harness.queue.processQueue();
		await harness.settle();

		assert.deepEqual(consumed, [], `${path} must not consume a superseded ticket`);
		assert.deepEqual(retired, [[staleTicket, "request-finished"]], `${path} must retire the stale reservation`);
		assert.deepEqual(harness.log.single, [], `${path} must not dispatch the stale item to the single provider path`);
		assert.deepEqual(harness.log.cachedCommits, [], `${path} must not commit a stale cached item`);
	}
});

test("only one live translation runs at a time and the lock is released on failure", async () => {
	const harness = createHarness();
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");

	assert.deepEqual(harness.log.single, ["m1"], "the second enqueue must not start a parallel translation");
	assert.equal(harness.queue.isLiveAutoTranslating(), true);

	await harness.rejectSingle(0);
	assert.equal(harness.log.single.length, 2, "a rejected translation still resumes the queue");
	assert.equal(harness.queue.isLiveAutoTranslating(), true, "the lock is held again by the next item");

	await harness.resolveSingle(1);
	assert.equal(harness.queue.isLiveAutoTranslating(), false);
	assert.equal(harness.queue.isQueueEmpty(), true);
});

test("a manual translation in progress blocks the live queue without dropping items", () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");

	assert.deepEqual(harness.log.single, [], "nothing runs while the manual lock is held");
	assert.deepEqual(harness.queueIds(), ["m1"], "the item waits instead of being discarded");

	harness.queue.setBusyTranslating(false);
	harness.queue.processQueue();
	assert.deepEqual(harness.log.single, ["m1"]);
});

test("the first live item starts in the same queue turn without arming a batch timer", () => {
	const harness = createHarness();
	harness.state.batchEngine = "ai";

	assert.equal(harness.queue.queueMessage(createMessage("m1"), {id: "c1"}), true);

	assert.deepEqual(harness.log.single, ["m1"], "the first live item must start before the caller yields");
	assert.deepEqual(harness.log.burstRequests, [], "a lone live item must not wait for a batch to fill");
	assert.equal(harness.pendingTimers().length, 0, "immediate dispatch must not hide behind a timer");
});

test("a provider backoff arms exactly one retry that resumes the queue", () => {
	const harness = createHarness();
	harness.state.backoff = true;
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");

	assert.deepEqual(harness.log.single, [], "nothing is sent during a backoff window");
	assert.equal(harness.pendingTimers().length, 1, "the retry is armed once, not once per enqueue");
	assert.equal(harness.pendingTimers()[0].delay, AUTO_TRANSLATION_QUEUE_RETRY_DELAY);

	harness.state.backoff = false;
	harness.runTimers();
	assert.deepEqual(harness.log.single, ["m2"], "the retry resumes at the head");
	assert.equal(harness.queue.hasPendingQueueRetry(), false);
});

test("a burst drains only items that share the first item's channel", async () => {
	const harness = createHarness();
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c2");
	harness.addLiveItem("m3", "c1");
	harness.addLiveItem("m4", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.burstRequests, [["m4", "m3", "m1"]], "the burst drains the head plus every same-channel item");
	assert.deepEqual(harness.log.burstCommits.map(entry => entry.messageId), ["m4", "m3", "m1"]);
	assert.deepEqual(harness.log.burstContexts, ["c1"]);
	assert.equal(harness.log.single.length, 1, "the other channel falls back to the single path");
	assert.deepEqual(harness.log.single, ["m2"]);
});

test("a burst never drains more than the item limit", async () => {
	const harness = createHarness();
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	for (let index = 0; index < LIVE_AI_BATCH_ITEM_LIMIT + 5; index++) harness.addLiveItem(`m${index}`, "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.equal(harness.log.burstRequests[0].length, LIVE_AI_BATCH_ITEM_LIMIT);
	assert.equal(LIVE_AI_BATCH_ITEM_LIMIT, 10, "the shipped cap is ten items per prompt");
});

test("a rejected burst item goes back to the head and is sticky on the single path", async () => {
	const harness = createHarness({
		requestBurstTranslation: (context, prepared) => {
			// Freezing the queue here keeps the burst's own finally from immediately
			// draining what it re-queued, so the order stays observable.
			harness.log.burstRequests.push(prepared.map(preparedItem => String(preparedItem.message.id)));
			harness.queue.setBusyTranslating(true);
			return Promise.resolve(Object.fromEntries(prepared.map(preparedItem => [String(preparedItem.message.id), "x"])));
		}
	});
	harness.state.batchEngine = "ai";
	harness.state.retryMessageIds = new Set(["m3"]);
	harness.queue.setBusyTranslating(true);
	const stayed = harness.addLiveItem("m1", "c2");
	harness.addLiveItem("m2", "c1");
	harness.addLiveItem("m3", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.queueIds(), ["m3", "m1"], "the retry sits ahead of the item that was never drained");
	assert.equal(harness.queue.getQueueSnapshot()[0].skipLiveBatch, true, "the rejection is recorded on the item");
	assert.deepEqual(harness.log.burstCommits.map(entry => entry.messageId), ["m2"], "the usable item still committed");
	assert.equal(stayed.skipLiveBatch, undefined, "an untouched item keeps its batch eligibility");

	harness.queue.setBusyTranslating(false);
	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.single, ["m3"], "a batch-rejected item retries on the single path");
	assert.equal(harness.log.burstRequests.length, 1, "the sticky flag keeps it out of any later burst");
});

test("an authentication failure ends a live burst without spending single-message retries", async () => {
	let harness;
	harness = createHarness({
		requestBurstTranslation: (_context, prepared) => {
			harness.log.burstRequests.push(prepared.map(item => String(item.message.id)));
			harness.queue.setBusyTranslating(true);
			return Promise.resolve({translations: null, failureKind: "auth", statusCode: 401});
		},
		resolveBurstItemResult: () => ({status: "retry"})
	});
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.burstRequests, [["m2", "m1"]]);
	assert.deepEqual(harness.log.single, []);
	assert.deepEqual(harness.queueIds(), []);
	assert.deepEqual(harness.log.released.map(record => record.messageId).sort(), ["m1", "m2"]);
});

test("a transient live burst failure retries each item on the single path exactly once", async () => {
	let harness;
	harness = createHarness({
		requestBurstTranslation: (_context, prepared) => {
			harness.log.burstRequests.push(prepared.map(item => String(item.message.id)));
			harness.queue.setBusyTranslating(true);
			return Promise.resolve({translations: null, failureKind: "transient", statusCode: 503});
		},
		resolveBurstItemResult: () => ({status: "retry"})
	});
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();
	assert.equal(harness.queueIds().length, 2);

	harness.queue.setBusyTranslating(false);
	harness.queue.processQueue();
	await harness.resolveSingle(0);
	await harness.resolveSingle(1);

	assert.equal(harness.log.burstRequests.length, 1);
	assert.deepEqual(harness.log.single.sort(), ["m1", "m2"]);
	assert.deepEqual(harness.queueIds(), []);
});

test("skipLiveBatch keeps an item out of a burst both as head and as candidate", () => {
	const harness = createHarness();
	harness.state.batchEngine = "ai";
	const head = harness.makeItem("m1", "c1");
	head.skipLiveBatch = true;
	assert.equal(harness.queue.collectBatchItems(head), null, "a sticky head never opens a burst");

	harness.queue.setBusyTranslating(true);
	const sticky = harness.addLiveItem("m2", "c1");
	sticky.skipLiveBatch = true;
	const fresh = harness.makeItem("m3", "c1");

	assert.equal(harness.queue.collectBatchItems(fresh), null, "the only candidate is sticky, so no burst forms");
	assert.deepEqual(harness.queueIds(), ["m2"], "the sticky item was left in place, not drained");
});

test("a throw before the burst loop releases every drained item instead of stranding it", async () => {
	const harness = createHarness({
		createBurstContext: _ => {
			throw new Error("engine configuration blew up");
		}
	});
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.addLiveItem("m3", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.released.map(record => record.messageId).sort(), ["m1", "m2", "m3"], "no message keeps a stuck loading indicator");
	assert.equal(harness.queue.isLiveAutoTranslating(), false, "the live lock is released by the finally");
	assert.equal(harness.queue.isQueueEmpty(), true);
	assert.equal(harness.queue.isMessageQueued("m1"), false);
});

test("a throw while preparing one item requeues only that item", async () => {
	const harness = createHarness({
		prepareBurstItem: (queueItem, channelId) => {
			if (String(queueItem.message.id) === "m2") throw new Error("cannot prepare");
			return {
				queueItem,
				message: queueItem.message,
				signature: `${channelId}|${queueItem.message.content}`,
				protectedText: queueItem.message.content
			};
		},
		requestBurstTranslation: (context, prepared) => {
			harness.log.burstRequests.push(prepared.map(preparedItem => String(preparedItem.message.id)));
			harness.queue.setBusyTranslating(true);
			return Promise.resolve(Object.fromEntries(prepared.map(preparedItem => [String(preparedItem.message.id), "x"])));
		}
	});
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.addLiveItem("m3", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.burstRequests, [["m3", "m1"]], "the healthy items still went out in one request");
	assert.deepEqual(harness.queueIds(), ["m2"], "the failed item is back at the head");
	assert.deepEqual(harness.log.burstCommits.map(entry => entry.messageId), ["m3", "m1"]);
});

test("a throw while committing one item requeues it and leaves the rest committed", async () => {
	const harness = createHarness({
		commitBurstResult: (queueItem, channelId, result) => {
			if (String(queueItem.message.id) === "m1") throw new Error("commit exploded");
			harness.log.burstCommits.push({messageId: String(queueItem.message.id), channelId, result});
			return Promise.resolve({confirmedIds: [String(queueItem.message.id)]});
		},
		requestBurstTranslation: (context, prepared) => {
			harness.log.burstRequests.push(prepared.map(preparedItem => String(preparedItem.message.id)));
			harness.queue.setBusyTranslating(true);
			return Promise.resolve(Object.fromEntries(prepared.map(preparedItem => [String(preparedItem.message.id), "x"])));
		}
	});
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.burstCommits.map(entry => entry.messageId), ["m2"]);
	assert.deepEqual(harness.queueIds(), ["m1"], "the item whose commit threw is retried, not stranded");
	assert.equal(harness.queue.getQueueSnapshot()[0].skipLiveBatch, true);
});

test("burst re-queues stay at the head, ahead of everything that was never drained", async () => {
	const harness = createHarness({
		requestBurstTranslation: (context, prepared) => {
			harness.log.burstRequests.push(prepared.map(preparedItem => String(preparedItem.message.id)));
			harness.queue.setBusyTranslating(true);
			return Promise.resolve(Object.fromEntries(prepared.map(preparedItem => [String(preparedItem.message.id), "x"])));
		}
	});
	harness.state.batchEngine = "ai";
	harness.state.retryMessageIds = new Set(["m2", "m3", "m4"]);
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c2");
	harness.addLiveItem("m2", "c1");
	harness.addLiveItem("m3", "c1");
	harness.addLiveItem("m4", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	// Shipped behaviour: re-queues unshift in drain order, so the retry set comes back
	// reversed among itself while still sitting ahead of the untouched item.
	assert.deepEqual(harness.queueIds(), ["m2", "m3", "m4", "m1"]);
});

test("a burst item whose request went stale is released without a commit", async () => {
	const harness = createHarness({
		requestBurstTranslation: (context, prepared) => {
			// The user switched away while the provider was working.
			harness.state.disabledChannels.add("c1");
			return Promise.resolve(Object.fromEntries(prepared.map(preparedItem => [String(preparedItem.message.id), "x"])));
		}
	});
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.burstCommits, [], "a stale translation must not paint over the message");
	assert.deepEqual(harness.log.released.map(record => record.messageId).sort(), ["m1", "m2"]);
});

test("a skip verdict still commits even though the request went stale", async () => {
	const harness = createHarness({
		requestBurstTranslation: (context, prepared) => {
			harness.state.disabledChannels.add("c1");
			return Promise.resolve(Object.fromEntries(prepared.map(preparedItem => [String(preparedItem.message.id), "x"])));
		}
	});
	harness.state.batchEngine = "ai";
	harness.state.skipMessageIds = new Set(["m1", "m2"]);
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	// The skip decision is already persisted, so re-running the item would buy the same
	// verdict at full price.
	assert.deepEqual(harness.log.burstCommits.map(entry => entry.result.status), ["skipped", "skipped"]);
});

test("a commit carries the live request identity and a deferred commit schedules a flush", async () => {
	const harness = createHarness({
		commitBurstResult: (queueItem, channelId, result) => {
			harness.log.burstCommits.push({messageId: String(queueItem.message.id), channelId, result});
			return Promise.resolve({deferredIds: [String(queueItem.message.id)]});
		},
		requestBurstTranslation: (context, prepared) => Promise.resolve(Object.fromEntries(prepared.map(preparedItem => [String(preparedItem.message.id), "x"])))
	});
	harness.state.batchEngine = "ai";
	harness.queue.setBusyTranslating(true);
	const first = harness.addLiveItem("m1", "c1");
	const second = harness.addLiveItem("m2", "c1");
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.burstCommits.map(entry => entry.result.requestIdentity), [String(second.liveRequest.id), String(first.liveRequest.id)], "each commit carries its own request identity");
	assert.deepEqual(harness.log.flushes.map(entry => entry.messageId).sort(), ["m1", "m2"], "a deferred commit is painted by an explicit flush");
	assert.ok(harness.log.flushes.every(entry => entry.source === "live"), "a provider commit tags its flush as the live lane");
	assert.deepEqual(harness.log.released.map(record => record.messageId).sort(), ["m1", "m2"], "the request is finished either way");
});

test("a cached commit tags its flush as the cached lane", async () => {
	// Cadence audit 2026-08-19: cached replays are one of the per-message rebuild
	// suspects; without their own tag they would masquerade as live translations.
	const harness = createHarness({
		commitCachedResult: (queueItem, channelId) => {
			harness.log.cachedCommits.push({messageId: String(queueItem.message.id), channelId});
			return Promise.resolve({deferredIds: [String(queueItem.message.id)]});
		}
	});
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1", {cachedTranslation: {content: "cached"}});
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.flushes, [{channelId: "c1", messageId: "m1", source: "cached"}]);
});

test("a cached item commits through the injected callback and finishes its request", async () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	const cached = harness.addLiveItem("m1", "c1", {cachedTranslation: {content: "cached"}});
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();
	await settle();

	assert.deepEqual(harness.log.cachedCommits, [{messageId: "m1", channelId: "c1"}]);
	assert.deepEqual(harness.log.single, [], "a cached item never reaches the provider");
	assert.deepEqual(harness.log.released, [{messageId: "m1", channelId: "c1", requestIdentity: String(cached.liveRequest.id)}]);
	assert.equal(harness.queue.isMessageQueued("m1"), false);
});

test("an item that no longer passes the guards is finished instead of translated", () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	const first = harness.addLiveItem("m1", "c1");
	const second = harness.addLiveItem("m2", "c1");
	harness.state.autoTranslate = false;
	harness.queue.setBusyTranslating(false);

	harness.queue.processQueue();

	assert.deepEqual(harness.log.single, [], "nothing is sent");
	assert.equal(harness.queue.isQueueEmpty(), true, "the queue drains past every failing item");
	assert.deepEqual(harness.log.released.map(record => record.requestIdentity), [String(second.liveRequest.id), String(first.liveRequest.id)], "each dropped item releases its own display record");
	assert.equal(harness.queue.isMessageQueued("m1"), false);
});

test("queueMessage refuses what the guards refuse and marks display pending on accept", () => {
	const harness = createHarness();
	harness.state.autoTranslate = false;
	assert.equal(harness.queue.queueMessage(createMessage("m1"), {id: "c1"}), false);
	assert.deepEqual(harness.log.pendingMarks, []);

	harness.state.autoTranslate = true;
	const message = createMessage("m2");
	assert.equal(harness.queue.queueMessage(message, {id: "c1"}), true);

	assert.equal(harness.log.pendingMarks.length, 1);
	assert.deepEqual(harness.log.pendingMarks[0].record, {
		messageId: "m2",
		channelId: "c1",
		generation: 7,
		origin: "automatic",
		requestIdentity: "1"
	});
	assert.deepEqual(harness.log.pendingMarks[0].options, {refresh: false});
	assert.equal(harness.queue.isMessageQueued("m2"), true);
	assert.deepEqual(harness.log.single, ["m2"], "accepting an item starts processing immediately");
});

test("queueMessage sends a historical item to the collector and never to the live queue", () => {
	const harness = createHarness();
	const message = createMessage("m1");

	assert.equal(harness.queue.queueMessage(message, {id: "c1"}, null, {historicalLoad: true}), true);
	assert.equal(harness.log.historical.length, 1);
	assert.equal(harness.queue.getQueueLength(), 0);
	assert.equal(harness.queue.isMessageQueued("m1"), false, "the historical job owns the marker, not the live queue");

	harness.state.withinLoadedRange = false;
	assert.equal(harness.queue.queueMessage(createMessage("m2"), {id: "c1"}, null, {historicalLoad: true}), false);
	assert.equal(harness.log.historical.length, 1);
});

test("queueMessage refuses a message with no resolvable channel", () => {
	const harness = createHarness();
	assert.equal(harness.queue.queueMessage(createMessage("m1"), null), false, "no channel means no live request");
	assert.equal(harness.queue.getQueueLength(), 0);
	assert.deepEqual(harness.log.pendingMarks, []);
});

test("a live request stops being current once it is superseded, retired or disabled", () => {
	const harness = createHarness();
	const message = createMessage("m1");
	const request = harness.queue.createRequest(message, "c1");

	assert.equal(harness.queue.isRequestCurrent(request), true);
	assert.equal(harness.queue.isRequestCurrent(request, message), true);

	const edited = Object.assign({}, message, {content: "edited"});
	assert.equal(harness.queue.isRequestCurrent(request, edited), false, "a source edit invalidates the signature");

	harness.state.disabledChannels.add("c1");
	assert.equal(harness.queue.isRequestCurrent(request), false);
	harness.state.disabledChannels.delete("c1");

	harness.state.runtimeActive = false;
	assert.equal(harness.queue.isRequestCurrent(request), false, "a stopped plugin retires every request");
	harness.state.runtimeActive = true;

	const replacement = harness.queue.createRequest(message, "c1");
	assert.equal(harness.queue.isRequestCurrent(request), false, "the newer request owns the key");
	assert.equal(harness.queue.isRequestCurrent(replacement), true);
});

test("finishing a request releases its display pending record exactly once per identity", () => {
	const harness = createHarness();
	const message = createMessage("m1");
	const request = harness.queue.createRequest(message, "c1");
	harness.queue.markMessageQueued("m1", request);

	assert.equal(harness.queue.finishRequest(request), true);
	assert.deepEqual(harness.log.released, [{messageId: "m1", channelId: "c1", requestIdentity: String(request.id)}]);
	assert.equal(harness.queue.isMessageQueued("m1"), false);
	assert.equal(harness.queue.finishRequest(null), false);
});

test("a stale request cannot steal the queued marker a newer request owns", () => {
	const harness = createHarness();
	const message = createMessage("m1");
	const stale = harness.queue.createRequest(message, "c1");
	const fresh = harness.queue.createRequest(message, "c1");
	harness.queue.markMessageQueued("m1", fresh);

	harness.queue.finishRequest(stale);

	assert.equal(harness.queue.isMessageQueued("m1"), true, "the message is still spoken for");
	assert.equal(harness.queue.getQueuedMarker("m1"), fresh);
	assert.equal(harness.queue.isRequestCurrent(fresh), true, "finishing a stale request must not evict the live one");
});

test("invalidating requests is channel scoped and releases every display record", () => {
	const harness = createHarness();
	const first = harness.queue.createRequest(createMessage("m1"), "c1");
	const second = harness.queue.createRequest(createMessage("m2"), "c2");
	harness.queue.markMessageQueued("m1", first);
	harness.queue.markMessageQueued("m2", second);

	harness.queue.invalidateRequests("c1");

	assert.deepEqual(harness.log.released.map(record => record.messageId), ["m1"]);
	assert.equal(harness.queue.isMessageQueued("m1"), false);
	assert.equal(harness.queue.isRequestCurrent(second), true, "another channel is untouched");
	assert.equal(harness.queue.getRuntimeGeneration(), 0, "a channel-scoped invalidation keeps the generation");

	harness.queue.invalidateRequests();
	assert.equal(harness.queue.getRuntimeGeneration(), 1, "a global invalidation retires later arrivals too");
	assert.equal(harness.queue.isRequestCurrent(second), false);
});

test("a message whose source changed loses its live request, and an unchanged one keeps it", () => {
	const harness = createHarness();
	const message = createMessage("m1");
	const request = harness.queue.createRequest(message, "c1");
	harness.queue.markMessageQueued("m1", request);

	assert.equal(harness.queue.invalidateRequestForMessage("m1", "c1", request.signature), false, "an identical signature is not a change");
	assert.equal(harness.queue.isRequestCurrent(request), true);

	assert.equal(harness.queue.invalidateRequestForMessage("m1", "c1", "c1|edited"), true);
	assert.equal(harness.queue.isRequestCurrent(request), false);
	assert.deepEqual(harness.log.released.map(record => record.messageId), ["m1"]);
	assert.equal(harness.queue.invalidateRequestForMessage("m1", "c1", "c1|edited"), false, "nothing left to invalidate");
	assert.equal(harness.queue.invalidateRequestForMessage(null, "c1", "sig"), false);
});

test("clearing one channel leaves the other channel's items and markers alone", () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c2");
	harness.addLiveItem("m3", "c1");

	harness.queue.clearQueue("c1");

	assert.deepEqual(harness.queueIds(), ["m2"]);
	assert.equal(harness.queue.isMessageQueued("m1"), false);
	assert.equal(harness.queue.isMessageQueued("m3"), false);
	assert.equal(harness.queue.isMessageQueued("m2"), true);
	assert.deepEqual(harness.log.released.map(record => record.messageId).sort(), ["m1", "m3"]);
});

test("deleting one queued message retires only its request and pending display", () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	const first = harness.addLiveItem("m1", "c1");
	const second = harness.addLiveItem("m2", "c1");
	const otherChannel = harness.addLiveItem("m3", "c2");

	assert.equal(harness.queue.removeMessage("m1", "wrong-channel"), false);
	assert.equal(harness.queue.removeMessage("m1", "c1"), true);
	assert.deepEqual(harness.queueIds(), ["m3", "m2"]);
	assert.equal(harness.queue.isMessageQueued("m1"), false);
	assert.equal(harness.queue.isRequestCurrent(first.liveRequest), false);
	assert.equal(harness.queue.isRequestCurrent(second.liveRequest), true);
	assert.equal(harness.queue.isRequestCurrent(otherChannel.liveRequest), true);
	assert.deepEqual(harness.log.released.map(record => record.messageId), ["m1"]);
});

test("deleting the final waiting message cancels its retry timer", () => {
	const harness = createHarness();
	harness.state.backoff = true;
	harness.addLiveItem("m1", "c1");
	assert.equal(harness.queue.hasPendingQueueRetry(), true);

	assert.equal(harness.queue.removeMessage("m1", "c1"), true);
	assert.equal(harness.queue.getQueueLength(), 0);
	assert.equal(harness.queue.hasPendingQueueRetry(), false);
	assert.equal(harness.pendingTimers().length, 0);
});

test("clearing every channel empties the queue, the markers and the retry timer", () => {
	const harness = createHarness();
	harness.state.backoff = true;
	harness.addLiveItem("m1", "c1");
	assert.equal(harness.queue.hasPendingQueueRetry(), true);

	harness.queue.clearQueue();

	assert.equal(harness.queue.getQueueLength(), 0);
	assert.equal(harness.queue.isMessageQueued("m1"), false);
	assert.equal(harness.queue.hasPendingQueueRetry(), false, "a cleared queue has nothing to retry");
	assert.equal(harness.pendingTimers().length, 0);
});

test("clearing a channel disarms the retry only once nothing is left to run", () => {
	const harness = createHarness();
	harness.state.backoff = true;
	harness.addLiveItem("m1", "c1");
	harness.addLiveItem("m2", "c2");

	harness.queue.clearQueue("c1");
	assert.equal(harness.queue.hasPendingQueueRetry(), true, "another channel still has work waiting");

	harness.queue.clearQueue("c2");
	assert.equal(harness.queue.hasPendingQueueRetry(), false);
});

test("historical markers are only cleared by the job that placed them", () => {
	const harness = createHarness();
	harness.queue.markMessageQueued("m1", {type: "historical", channelId: "c1", jobId: "job-1"});

	assert.equal(harness.queue.isMessageQueued("m1"), true);
	assert.equal(harness.queue.clearHistoricalQueuedMessage("m1", "job-2"), false, "a later job still owns the message");
	assert.equal(harness.queue.isMessageQueued("m1"), true);
	assert.equal(harness.queue.clearHistoricalQueuedMessage("m1", "job-1"), true);
	assert.equal(harness.queue.isMessageQueued("m1"), false);

	harness.queue.markMessageQueued("m2", {type: "historical", channelId: "c1", jobId: "job-3"});
	harness.queue.clearQueuedMessage("m2");
	assert.equal(harness.queue.isMessageQueued("m2"), false);
});

test("a live request marker is never mistaken for a historical one", () => {
	const harness = createHarness();
	const request = harness.queue.createRequest(createMessage("m1"), "c1");
	harness.queue.markMessageQueued("m1", request);

	assert.equal(harness.queue.clearHistoricalQueuedMessage("m1", "job-1"), false);
	assert.equal(harness.queue.isMessageQueued("m1"), true);
});

test("channel state is created lazily and reset per channel", () => {
	const harness = createHarness();
	assert.equal(harness.queue.getChannelState(null), null);

	const channelState = harness.queue.getChannelState("c1");
	assert.deepEqual(channelState, {initialized: false, boundaryMessageId: null});
	channelState.initialized = true;
	channelState.boundaryMessageId = "m9";
	assert.equal(harness.queue.getChannelState("c1"), channelState, "the same record is handed back");

	harness.queue.resetTracking("c1");
	assert.deepEqual(harness.queue.getChannelState("c1"), {initialized: false, boundaryMessageId: null});
	assert.deepEqual(harness.log.eligibleClears, ["c1"]);
});

test("resetting tracking globally forgets every channel and the active session", () => {
	const harness = createHarness();
	harness.queue.prepareChannelSession("c1");
	harness.queue.getChannelState("c2").initialized = true;

	harness.queue.resetTracking();

	assert.equal(harness.queue.getLastChannelId(), null);
	assert.deepEqual(harness.queue.getChannelState("c2"), {initialized: false, boundaryMessageId: null});
	assert.deepEqual(harness.log.eligibleClears.at(-1), null);
});

test("switching channels clears the previous channel's queue and restarts its session", () => {
	const harness = createHarness();
	harness.queue.setBusyTranslating(true);
	harness.addLiveItem("m1", "c1");
	harness.queue.prepareChannelSession("c1");
	const channelState = harness.queue.getChannelState("c1");
	channelState.initialized = true;
	channelState.boundaryMessageId = "m1";

	harness.queue.prepareChannelSession("c2");

	assert.deepEqual(harness.log.clearedChannels, ["c1"], "leaving a channel cancels its pending work");
	assert.equal(harness.queue.getQueueLength(), 0);
	assert.equal(harness.queue.getLastChannelId(), "c2");
	assert.deepEqual(harness.queue.getChannelState("c2"), {initialized: false, boundaryMessageId: null});
	assert.deepEqual(harness.log.sessionStarts, ["c1", "c2"]);
	assert.deepEqual(harness.log.leftChannels, ["c1"], "display state is pruned only after leaving a channel");

	harness.queue.prepareChannelSession("c2");
	assert.deepEqual(harness.log.sessionStarts, ["c1", "c2"], "re-entering the same channel is not a new session");
	assert.deepEqual(harness.log.leftChannels, ["c1"], "the active channel is never pruned");
});

test("a plugin restart retires in-flight requests without touching display records", () => {
	const harness = createHarness();
	const request = harness.queue.createRequest(createMessage("m1"), "c1");

	harness.queue.restartRequestGeneration();

	assert.equal(harness.queue.isRequestCurrent(request), false);
	assert.deepEqual(harness.log.released, [], "the display runtime is reset separately on start");
	assert.equal(harness.queue.getRuntimeGeneration(), 1);
});

test("the retry delay and batch limit are the shipped values", () => {
	assert.equal(AUTO_TRANSLATION_QUEUE_RETRY_DELAY, 900);
	assert.equal(LIVE_AI_BATCH_ITEM_LIMIT, 10);
});
