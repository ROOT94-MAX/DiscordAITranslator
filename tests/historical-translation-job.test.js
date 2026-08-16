const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createPluginInstance} = require("./helpers/createPluginInstance");
const {createTranslatorStyles} = require("../src/ui/styles");

function createMessage(id, content) {
	return {
		id,
		channel_id: "channel-history-job",
		content,
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
}

function createLoadedMessages(startId, count, prefix, channelId = "channel-history-job") {
	const messages = [];
	for (let index = 0; index < count; index++) {
		const id = String(startId - index);
		messages.push({
			id,
			channel_id: channelId,
			content: `${prefix} ${id}`,
			embeds: [],
			attachments: [],
			author: {id: "other-user"}
		});
	}
	return messages;
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

function createInitialSourcePrefetchHarness({
	channelId = "channel-history-job",
	selectedChannelId = channelId
} = {}) {
	let activeSelectedChannelId = selectedChannelId;
	let enabled = true;
	let prefetchSignal = null;
	let resolveFetch = null;
	const plugin = configureHistoricalCoordinatorPlugin({
		pluginOptions: {
			settings: {
				choices: {
					received: {input: "auto", output: "zh-CN"},
					sent: {input: "auto", output: "en"}
				}
			},
			defaults: {
				choices: {
					received: {value: {input: "auto", output: "zh-CN"}},
					sent: {value: {input: "auto", output: "en"}}
				}
			},
			bdfdb: {
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => activeSelectedChannelId},
					MessageStore: {
						getMessages: requestedChannelId => requestedChannelId == channelId ? {
							toArray: () => createLoadedMessages(80, 20, "cached", channelId)
						} : null
					}
				},
				LibraryModules: {
					MessageActions: {
						fetchMessages: request => {
							prefetchSignal = request.signal;
							return new Promise(resolve => {
								resolveFetch = () => resolve({body: {messages: createLoadedMessages(60, 10, "prefetched", channelId)}});
							});
						}
					}
				}
			}
		}
	});
	plugin.requestAiBatchTranslation = () => {
		throw new Error("provider must not run before the prefetch gate resolves");
	};
	return {
		plugin,
		channelId,
		getSignal: () => prefetchSignal,
		resolveFetch: () => resolveFetch && resolveFetch(),
		setSelectedChannelId: value => {activeSelectedChannelId = value;},
		setEnabled: value => {enabled = value;},
		applyEnablementOverride() {
			plugin.isTranslationEnabled = requestedChannelId => requestedChannelId == channelId ? enabled : true;
			plugin.setChannelEnablementStateValue = (_channelId, nextValue) => {enabled = nextValue;};
			plugin.restoreReceivedDisplayChannel = async () => {};
			plugin.clearDisplayedAutoTranslations = () => {};
			plugin.processAutoTranslationQueue = () => {};
		},
		startInitialPass() {
			plugin.processMessages({
				instance: {
					props: {
						channel: {id: channelId},
						channelStream: createLoadedMessages(100, 20, "rendered", channelId).map(message => ({content: message}))
					}
				}
			});
		}
	};
}

test("legacy historical queue runtime is absent after coordinator migration", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
	const removedRuntimeNames = [
		"canQueueHistoricalItem",
		"enqueueHistoricalItem",
		"beginHistoricalBatchIfNeeded",
		"ensureHistoricalChannelActive",
		"markHistoricalQueueItemProcessed",
		"handleHistoricalOutOfRange",
		"handleHistoricalPauseOrBatch",
		"retryHistoricalQueueItemIfTransient",
		"getHistoricalAiBatchContext",
		"selectHistoricalAiBatchItems",
		"processHistoricalPreparedItems",
		"applyHistoricalAiBatchResultMap",
		"requestHistoricalAiBatch",
		"processHistoricalAutoTranslationBatchChunk",
		"stageHistoricalAutoTranslationResult",
		"applyHistoricalAutoTranslationStaging",
		"flushHistoricalAutoTranslationProgress",
		"finishHistoricalAutoTranslationBatchIfDone",
		"scheduleLoadedAutoTranslationScrollRescan",
		"scheduleLoadedAutoTranslationPostBatchRescan",
		"requeueHistoricalAiBatchFallbackItems"
	];

	for (const runtimeName of removedRuntimeNames) {
		assert.doesNotMatch(source, new RegExp(`\\b${runtimeName}\\b`), `${runtimeName} should be removed`);
	}
});

test("historical job commits all translated IDs atomically through one acknowledged commit", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const appliedIds = [];
	let resolveBatch;
	const job = plugin.createHistoricalTranslationJob({
		id: "job-1",
		channelId: "channel-history-job",
		generation: 1,
		dependencies: {
			prepare: item => ({status: "pending", prepared: item}),
			translateBatch: () => new Promise(resolve => {
				resolveBatch = resolve;
			}),
			validate: (item, translatedText) => ({
				ok: true,
				translation: {messageId: item.message.id, translatedContent: translatedText}
			}),
			repair: () => ({status: "failed", reason: "unexpected-repair"}),
			waitForCommit: () => Promise.resolve(),
			isCurrent: () => true,
			commit: summary => {
				appliedIds.push(...summary.translated.map(item => item.message.id));
			}
		}
	});

	job.add(createMessage("100", "first"));
	job.add(createMessage("200", "second"));
	const running = job.start();
	await new Promise(resolve => setTimeout(resolve, 0));

	assert.deepEqual(appliedIds, []);
	assert.equal(job.isMessagePending("100"), true);
	assert.equal(job.isMessagePending("200"), true);

	resolveBatch({"100": "first translated", "200": "second translated"});
	await running;

	assert.deepEqual(appliedIds, ["100", "200"]);
	assert.equal(job.state, "committed");
});

test("historical job repairs missing IDs before the atomic commit", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const repairIds = [];
	let committedSummary = null;
	const job = plugin.createHistoricalTranslationJob({
		id: "job-repair",
		channelId: "channel-history-job",
		generation: 2,
		dependencies: {
			prepare: item => ({status: "pending", prepared: item}),
			translateBatch: () => Promise.resolve({"100": "first translated"}),
			validate: (item, translatedText) => translatedText ? {
				ok: true,
				translation: {messageId: item.message.id, translatedContent: translatedText}
			} : {ok: false},
			repair: item => {
				repairIds.push(item.message.id);
				return Promise.resolve({
					status: "translated",
					translation: {messageId: item.message.id, translatedContent: "repaired translation"}
				});
			},
			waitForCommit: () => Promise.resolve(),
			isCurrent: () => true,
			commit: summary => {
				committedSummary = summary;
			}
		}
	});

	job.add(createMessage("100", "first"));
	job.add(createMessage("200", "second"));
	await job.start();

	assert.deepEqual(repairIds, ["200"]);
	assert.equal(committedSummary.translated.length, 2);
	assert.equal(committedSummary.failed.length, 0);
});

test("historical job retries unresolved items in a smaller batch before single repair", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const smallerBatchIds = [];
	const singleRepairIds = [];
	let committedSummary = null;
	const job = plugin.createHistoricalTranslationJob({
		id: "job-smaller-repair",
		channelId: "channel-history-job",
		generation: 3,
		repairBatchSize: 2,
		dependencies: {
			prepare: item => ({status: "pending", prepared: item}),
			translateBatch: () => Promise.resolve({"100": "first translated"}),
			repairBatch: items => {
				smallerBatchIds.push(items.map(item => item.message.id));
				return Promise.resolve({"200": "second translated"});
			},
			validate: (item, translatedText) => translatedText ? {
				ok: true,
				translation: {messageId: item.message.id, translatedContent: translatedText}
			} : {ok: false},
			repair: item => {
				singleRepairIds.push(item.message.id);
				return Promise.resolve({
					status: "translated",
					translation: {messageId: item.message.id, translatedContent: "single repaired"}
				});
			},
			waitForCommit: () => Promise.resolve(),
			isCurrent: () => true,
			commit: summary => {
				committedSummary = summary;
			}
		}
	});

	for (const id of ["100", "200", "300"]) job.add(createMessage(id, `message ${id}`));
	await job.start();

	assert.deepEqual(smallerBatchIds, [["200", "300"]]);
	assert.deepEqual(singleRepairIds, ["300"]);
	assert.deepEqual(committedSummary.translated.map(item => item.message.id), ["100", "200", "300"]);
});

test("historical repair requests run with bounded concurrency before one commit", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const repairResolvers = [];
	const startedIds = [];
	let commitCount = 0;
	const job = plugin.createHistoricalTranslationJob({
		id: "job-concurrent-repair",
		channelId: "channel-history-job",
		generation: 2,
		repairConcurrency: 2,
		dependencies: {
			prepare: item => ({status: "pending", prepared: item}),
			translateBatch: () => Promise.resolve(null),
			validate: () => ({ok: false}),
			repair: item => new Promise(resolve => {
				startedIds.push(item.message.id);
				repairResolvers.push(() => resolve({status: "translated", translation: {translatedContent: item.message.id}}));
			}),
			waitForCommit: () => Promise.resolve(),
			isCurrent: () => true,
			commit: () => {
				commitCount++;
			}
		}
	});

	job.add(createMessage("100", "first"));
	job.add(createMessage("200", "second"));
	const running = job.start();
	await new Promise(resolve => setTimeout(resolve, 0));

	assert.deepEqual(startedIds, ["100", "200"]);
	repairResolvers.forEach(resolve => resolve());
	await running;
	assert.equal(commitCount, 1);
});

test("cancelled historical job ignores late provider results", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	let resolveBatch;
	let commitCount = 0;
	const job = plugin.createHistoricalTranslationJob({
		id: "job-cancel",
		channelId: "channel-history-job",
		generation: 3,
		dependencies: {
			prepare: item => ({status: "pending", prepared: item}),
			translateBatch: () => new Promise(resolve => {
				resolveBatch = resolve;
			}),
			validate: (_item, translatedText) => ({ok: true, translation: {translatedContent: translatedText}}),
			repair: () => ({status: "failed"}),
			waitForCommit: () => Promise.resolve(),
			isCurrent: () => true,
			commit: () => {
				commitCount++;
			}
		}
	});

	job.add(createMessage("100", "first"));
	const running = job.start();
	await new Promise(resolve => setTimeout(resolve, 0));
	job.cancel("channel-disabled");
	resolveBatch({"100": "late translation"});
	await running;

	assert.equal(job.state, "cancelled");
	assert.equal(commitCount, 0);
	assert.equal(job.isMessagePending("100"), false);
});

test("editing one historical item invalidates only that item before commit", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	let resolveBatch;
	let committedSummary = null;
	const job = plugin.createHistoricalTranslationJob({
		id: "job-edit-one",
		channelId: "channel-history-job",
		generation: 4,
		dependencies: {
			prepare: item => ({status: "pending", prepared: item}),
			translateBatch: () => new Promise(resolve => {
				resolveBatch = resolve;
			}),
			validate: (item, translatedText) => ({ok: true, translation: {messageId: item.message.id, translatedContent: translatedText}}),
			repair: () => ({status: "failed"}),
			waitForCommit: () => Promise.resolve(),
			isCurrent: () => true,
			commit: summary => {
				committedSummary = summary;
			}
		}
	});

	job.add(createMessage("100", "old text"));
	job.add(createMessage("200", "stable text"));
	const running = job.start();
	await new Promise(resolve => setTimeout(resolve, 0));
	assert.equal(job.invalidateMessage("100", "source-edited"), true);

	resolveBatch({"100": "stale translation", "200": "valid translation"});
	await running;

	assert.deepEqual(committedSummary.translated.map(item => item.message.id), ["200"]);
	assert.equal(job.isMessagePending("100"), false);
});

test("historical commit rejects a translated item when Discord now stores edited content", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const message = createMessage("store-edit", "old stored source");
	let currentMessage = message;
	let resolveBatch;
	let appliedCount = 0;
	let persistedCount = 0;
	plugin._testBdfdb.LibraryStores.MessageStore = {
		getMessage: (_channelId, messageId) => String(messageId) == String(message.id) ? currentMessage : null
	};
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => {
		appliedCount++;
		return {};
	};
	plugin.persistTranslationCacheEntry = () => {
		persistedCount++;
	};
	plugin.rerenderMessagesWithScrollPreserved = () => {};

	plugin.queueAutoTranslateMessage(message, {id: "channel-history-job"}, {content: message.content}, {historicalLoad: true});
	const running = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));
	currentMessage = Object.assign({}, message, {content: "new stored source"});
	resolveBatch({"store-edit": "old source translation"});
	await running;

	assert.equal(appliedCount, 0);
	assert.equal(persistedCount, 0);
});

function configureHistoricalCoordinatorPlugin(options = {}) {
	const plugin = createPluginInstance(options.pluginOptions || {});
	plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.isMessageWithinLoadedRange = () => true;
	plugin.getHistoricalAiBatchEngineKey = () => "deepseek";
	plugin.isTranslationLikelyInTargetLanguage = () => true;
	plugin.shouldKeepAutoTranslatedResult = () => true;
	plugin.isTranslationResultTooSimilar = () => false;
	if (!options.scheduleAutomatically) plugin.scheduleHistoricalTranslationJobStart = () => {};
	plugin.waitForHistoricalTranslationCommit = () => Promise.resolve();
	plugin.isHistoricalTranslationJobCurrent = () => true;
	plugin.updateLoadedAutoTranslationStatus = () => {};
	plugin.persistTranslationCacheEntry = () => {};
	plugin.persistReceivedSkipDecision = () => {};
	// Store batch commits resolve synchronously in coordinator tests; recorded calls let
	// commit-count tests assert the acknowledged display contract.
	plugin.historicalDisplayBatchCommits = [];
	plugin.commitHistoricalReceivedDisplayBatch = results => {
		plugin.historicalDisplayBatchCommits.push(results);
		return Promise.resolve({confirmedIds: results.map(result => String(result.messageId)), missingIds: [], fallbackUsed: false});
	};
	return plugin;
}

test("the initial loaded-message source starts immediately without waiting for scrollend", async () => {
	const realDocument = global.document;
	const handlers = {};
	const scroller = {
		addEventListener: (eventName, handler) => {
			handlers[eventName] = handler;
		},
		removeEventListener: () => {}
	};
	global.document = {
		querySelector: selector => selector == ".messages-scroller" ? scroller : null
	};
	const plugin = configureHistoricalCoordinatorPlugin({
		scheduleAutomatically: true,
		pluginOptions: {
			bdfdb: {
				dotCN: {messagesscroller: ".messages-scroller"},
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => "channel-history-job"}
				}
			}
		}
	});
	const requestedIds = [];
	let resolveBatch;
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return new Promise(resolve => {
			resolveBatch = resolve;
		});
	};
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	const channel = {id: "channel-history-job"};

	try {
		plugin.attachAutoTranslationScrollWatcher();
		handlers.wheel({type: "wheel"});
		handlers.scroll();
		plugin.processMessages({
			instance: {props: {channel, channelStream: [createMessage("300", "newest"), createMessage("200", "older")].map(message => ({content: message}))}}
		});
		plugin.processMessages({
			instance: {props: {channel, channelStream: [createMessage("300", "newest"), createMessage("200", "older"), createMessage("100", "oldest")].map(message => ({content: message}))}}
		});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["100", "300", "200"]]);

		if (handlers.scrollend) handlers.scrollend();
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(requestedIds, [["100", "300", "200"]]);

		resolveBatch({"100": "oldest translated", "300": "newest translated", "200": "older translated"});
		await plugin.waitForHistoricalTranslationJobs(channel.id);
	}
	finally {
		plugin.cancelHistoricalTranslationJobs(channel.id, "test-cleanup");
		global.document = realDocument;
	}
});

test("a historical snapshot starts translating as soon as its configured limit is full", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const channelId = "channel-history-full-limit";
	const requestedIds = [];
	let resolveBatch;
	plugin.getReceivedAutoTranslateLoadedLimit = () => 20;
	plugin.isUserActivelyScrollingMessages = () => true;
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => String(item.message.id)));
		return new Promise(resolve => {resolveBatch = resolve;});
	};

	for (let index = 0; index < 20; index++) {
		const message = createMessage(String(1000 + index), `loaded message ${index}`);
		plugin.queueAutoTranslateMessage(message, {id: channelId}, {content: message.content}, {historicalLoad: true, deferHistoricalSnapshotStart: true});
	}
	await new Promise(resolve => setImmediate(resolve));

	assert.equal(requestedIds.length, 1, "a full snapshot must not remain stuck in collecting while the user scrolls");
	assert.equal(requestedIds[0].length, 10, "the provider batch starts as its first chunk");
	assert.equal(plugin.historicalDisplayBatchCommits.length, 0, "display still waits for the existing idle commit gate");

	// Chunks settle sequentially; answer each one as it starts until the job finishes.
	for (let guard = 0; guard < 5 && plugin.historicalDisplayBatchCommits.length === 0; guard++) {
		resolveBatch(Object.fromEntries(requestedIds[requestedIds.length - 1].map(id => [id, `translated ${id}`])));
		await new Promise(resolve => setImmediate(resolve));
	}
	await plugin.waitForHistoricalTranslationJobs(channelId);
	assert.equal(requestedIds.length, 2, "a 20-item job splits into two provider chunks");
	assert.deepEqual(requestedIds.flat(), Array.from({length: 20}, (_, index) => String(1000 + index)));
});

test("a full historical snapshot still starts when queueMicrotask is unavailable", async () => {
	const originalQueueMicrotask = global.queueMicrotask;
	global.queueMicrotask = undefined;
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const channelId = "channel-history-no-microtask";
	const requestedIds = [];
	plugin.getReceivedAutoTranslateLoadedLimit = () => 2;
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => String(item.message.id)));
		return Promise.resolve(Object.fromEntries(preparedItems.map(item => [String(item.message.id), `translated ${item.message.id}`])));
	};

	try {
		for (const id of ["1", "2"]) {
			const message = createMessage(id, `loaded message ${id}`);
			plugin.queueAutoTranslateMessage(message, {id: channelId}, {content: message.content}, {historicalLoad: true, deferHistoricalSnapshotStart: true});
		}
		await plugin.waitForHistoricalTranslationJobs(channelId);
		assert.deepEqual(requestedIds, [["1", "2"]]);
	}
	finally {global.queueMicrotask = originalQueueMicrotask;}
});

test("the initial loaded-message source does not wait for idle when scrollend is unavailable", async () => {
	const realDocument = global.document;
	const realSetTimeout = global.setTimeout;
	const realClearTimeout = global.clearTimeout;
	const handlers = {};
	const timers = new Map();
	let nextTimerId = 0;
	const scroller = {
		addEventListener: (eventName, handler) => {
			handlers[eventName] = handler;
		},
		removeEventListener: () => {}
	};
	global.document = {
		querySelector: selector => selector == ".messages-scroller" ? scroller : null
	};
	global.setTimeout = callback => {
		const timerId = ++nextTimerId;
		timers.set(timerId, callback);
		return timerId;
	};
	global.clearTimeout = timerId => timers.delete(timerId);
	const plugin = configureHistoricalCoordinatorPlugin({
		scheduleAutomatically: true,
		pluginOptions: {
			bdfdb: {
				dotCN: {messagesscroller: ".messages-scroller"},
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => "channel-history-job"}
				}
			}
		}
	});
	const requestedIds = [];
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return Promise.resolve({"100": "translated"});
	};
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	const channel = {id: "channel-history-job"};

	try {
		plugin.attachAutoTranslationScrollWatcher();
		handlers.wheel({type: "wheel"});
		handlers.scroll({type: "scroll"});
		plugin.processMessages({
			instance: {props: {channel, channelStream: [{content: createMessage("100", "original")}]}}
		});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["100"]]);
		assert.equal(timers.size > 0, true);
		const idleCallback = [...timers.values()].at(-1);
		idleCallback();
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["100"]]);
		await plugin.waitForHistoricalTranslationJobs(channel.id);
	}
	finally {
		plugin.cancelHistoricalTranslationJobs(channel.id, "test-cleanup");
		global.document = realDocument;
		global.setTimeout = realSetTimeout;
		global.clearTimeout = realClearTimeout;
	}
});

test("layout-only scroll does not hold a historical snapshot open", async () => {
	const realDocument = global.document;
	const handlers = {};
	const scroller = {
		addEventListener: (eventName, handler) => {
			handlers[eventName] = handler;
		},
		removeEventListener: () => {}
	};
	global.document = {
		querySelector: selector => selector == ".messages-scroller" ? scroller : null
	};
	const plugin = configureHistoricalCoordinatorPlugin({
		scheduleAutomatically: true,
		pluginOptions: {
			bdfdb: {
				dotCN: {messagesscroller: ".messages-scroller"},
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => "channel-history-job"}
				}
			}
		}
	});
	const requestedIds = [];
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return Promise.resolve({"100": "translated"});
	};
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	const channel = {id: "channel-history-job"};

	try {
		plugin.attachAutoTranslationScrollWatcher();
		handlers.scroll({type: "scroll"});
		plugin.processMessages({
			instance: {props: {channel, channelStream: [{content: createMessage("100", "original")}]}}
		});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["100"]]);
		await plugin.waitForHistoricalTranslationJobs(channel.id);
	}
	finally {
		plugin.cancelHistoricalTranslationJobs(channel.id, "test-cleanup");
		global.document = realDocument;
	}
});

test("pointer input without scroll does not delay a historical snapshot", async () => {
	const realDocument = global.document;
	const handlers = {};
	const scroller = {
		addEventListener: (eventName, handler) => {
			handlers[eventName] = handler;
		},
		removeEventListener: () => {}
	};
	global.document = {
		querySelector: selector => selector == ".messages-scroller" ? scroller : null
	};
	const plugin = configureHistoricalCoordinatorPlugin({
		scheduleAutomatically: true,
		pluginOptions: {
			bdfdb: {
				dotCN: {messagesscroller: ".messages-scroller"},
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => "channel-history-job"}
				}
			}
		}
	});
	const requestedIds = [];
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return Promise.resolve({"100": "translated"});
	};
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	const channel = {id: "channel-history-job"};

	try {
		plugin.attachAutoTranslationScrollWatcher();
		handlers.pointerdown({type: "pointerdown"});
		plugin.processMessages({
			instance: {props: {channel, channelStream: [{content: createMessage("100", "original")}]}}
		});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["100"]]);
		await plugin.waitForHistoricalTranslationJobs(channel.id);
	}
	finally {
		plugin.detachAutoTranslationScrollWatcher();
		plugin.cancelHistoricalTranslationJobs(channel.id, "test-cleanup");
		global.document = realDocument;
	}
});

test("scroll activity from one channel does not hold the next channel snapshot open", async () => {
	const realDocument = global.document;
	const handlers = {};
	let selectedChannelId = "channel-a";
	const scroller = {
		addEventListener: (eventName, handler) => {
			handlers[eventName] = handler;
		},
		removeEventListener: () => {}
	};
	global.document = {
		querySelector: selector => selector == ".messages-scroller" ? scroller : null
	};
	const plugin = configureHistoricalCoordinatorPlugin({
		scheduleAutomatically: true,
		pluginOptions: {
			bdfdb: {
				dotCN: {messagesscroller: ".messages-scroller"},
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => selectedChannelId}
				}
			}
		}
	});
	const requestedIds = [];
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return Promise.resolve(Object.fromEntries(preparedItems.map(item => [item.message.id, `translated ${item.message.id}`])));
	};
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	const channelA = {id: "channel-a"};
	const channelB = {id: "channel-b"};

	try {
		plugin.attachAutoTranslationScrollWatcher();
		handlers.wheel({type: "wheel"});
		handlers.scroll({type: "scroll"});
		plugin.processMessages({
			instance: {props: {channel: channelA, channelStream: [{content: Object.assign(createMessage("100", "channel a"), {channel_id: channelA.id})}]}}
		});
		selectedChannelId = channelB.id;
		plugin.processMessages({
			instance: {props: {channel: channelB, channelStream: [{content: Object.assign(createMessage("200", "channel b"), {channel_id: channelB.id})}]}}
		});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["200"]]);
		await plugin.waitForHistoricalTranslationJobs(channelB.id);
	}
	finally {
		plugin.detachAutoTranslationScrollWatcher();
		plugin.cancelHistoricalTranslationJobs(channelA.id, "test-cleanup");
		plugin.cancelHistoricalTranslationJobs(channelB.id, "test-cleanup");
		global.document = realDocument;
	}
});

test("one loaded message render snapshot starts one atomic ID batch without a wall-clock wait", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({
		scheduleAutomatically: true,
		pluginOptions: {
			bdfdb: {
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => "channel-history-job"}
				}
			}
		}
	});
	const requestedIds = [];
	let resolveBatch;
	let rerenderCount = 0;
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return new Promise(resolve => {
			resolveBatch = resolve;
		});
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
	plugin.rerenderMessagesWithScrollPreserved = () => {
		rerenderCount++;
	};
	const channel = {id: "channel-history-job"};
	const messages = [createMessage("100", "first"), createMessage("200", "second"), createMessage("300", "third")];

	try {
		plugin.processMessages({
			instance: {
				props: {
					channel,
					channelStream: messages.map(message => ({content: message}))
				}
			}
		});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["300", "200", "100"]]);

		resolveBatch({"100": "first translated", "200": "second translated", "300": "third translated"});
		await plugin.waitForHistoricalTranslationJobs(channel.id);
		assert.equal(rerenderCount, 0);
		assert.equal(plugin.historicalDisplayBatchCommits.length, 1);
		assert.deepEqual(plugin.historicalDisplayBatchCommits[0].map(result => result.messageId), ["300", "200", "100"]);
		assert.equal(plugin.historicalDisplayBatchCommits[0].every(result => result.status === "translated" && result.origin === "automatic" && result.channelId === "channel-history-job"), true);
	}
	finally {
		plugin.cancelHistoricalTranslationJobs(channel.id, "test-cleanup");
	}
});

test("synchronous fallback historical collections coalesce into one ID snapshot", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const requestedIds = [];
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return Promise.resolve(Object.fromEntries(preparedItems.map(item => [item.message.id, `translated ${item.message.id}`])));
	};
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};

	try {
		for (const [id, content] of [["100", "first"], ["200", "second"], ["300", "third"]]) {
			plugin.queueAutoTranslateMessage(createMessage(id, content), {id: "channel-history-job"}, {content}, {historicalLoad: true});
		}
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["100", "200", "300"]]);
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
	}
	finally {
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("historical coordinator keeps loading state until one atomic commit", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let rerenderCount = 0;
	let resolveBatch;
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
	plugin.rerenderMessagesWithScrollPreserved = () => {
		rerenderCount++;
	};

	for (const [id, content] of [["100", "first"], ["200", "second"]]) {
		plugin.queueAutoTranslateMessage(createMessage(id, content), {id: "channel-history-job"}, {content}, {
			historicalLoad: true,
			deferWhileReading: true
		});
	}

	const running = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));

	assert.equal(plugin.isHistoricalMessagePending("100", "channel-history-job"), true);
	assert.equal(plugin.isHistoricalMessagePending("200", "channel-history-job"), true);
	assert.deepEqual(plugin.historicalDisplayBatchCommits, []);
	assert.equal(rerenderCount, 0);

	resolveBatch({"100": "第一条", "200": "第二条"});
	await running;

	assert.equal(plugin.historicalDisplayBatchCommits.length, 1);
	assert.deepEqual(plugin.historicalDisplayBatchCommits[0].map(result => result.messageId), ["100", "200"]);
	assert.equal(plugin.historicalDisplayBatchCommits[0].every(result => result.status === "translated"), true);
	assert.equal(rerenderCount, 0);
	assert.equal(plugin.isHistoricalMessagePending("100", "channel-history-job"), false);
});

test("initial loaded-message pass stops at the configured historical job limit", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const requestedIds = [];
	let acceptedCount = 0;
	let commitCount = 0;
	plugin.getReceivedAutoTranslateLoadedLimit = () => 50;
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		return Promise.resolve(Object.fromEntries(preparedItems.map(item => [item.message.id, `translated ${item.message.id}`])));
	};
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	const commitHistoricalTranslationJob = plugin.commitHistoricalTranslationJob.bind(plugin);
	plugin.commitHistoricalTranslationJob = (summary, job) => {
		commitCount++;
		return commitHistoricalTranslationJob(summary, job);
	};

	for (let index = 0; index < 200; index++) {
		const id = String(index + 1);
		if (plugin.queueAutoTranslateMessage(createMessage(id, `message ${id}`), {id: "channel-history-job"}, {content: `message ${id}`}, {historicalLoad: true})) acceptedCount++;
	}

	await plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await plugin.waitForHistoricalTranslationJobs("channel-history-job");

	assert.equal(requestedIds.length, 5, "a 50-item job moves as five provider chunks of ten");
	assert.equal(requestedIds.flat().length, 50);
	assert.equal(acceptedCount, 50);
	assert.equal(commitCount, 1);
});

test("initial loaded-message pass seals one 50-ID snapshot from rendered cached and prefetched messages without scrolling", async () => {
	const channelId = "channel-history-job";
	let selectedChannelId = channelId;
	const renderedMessages = createLoadedMessages(100, 20, "rendered", channelId);
	const cachedMessages = createLoadedMessages(80, 20, "cached", channelId);
	const prefetchedMessages = createLoadedMessages(60, 10, "prefetched", channelId);
	const cacheSnapshot = JSON.stringify(cachedMessages);
	const prefetchedSnapshot = JSON.stringify(prefetchedMessages);
	const fetchCalls = [];
	const requestedIds = [];
	const plugin = configureHistoricalCoordinatorPlugin({
		pluginOptions: {
			settings: {
				choices: {
					received: {input: "auto", output: "zh-CN"},
					sent: {input: "auto", output: "en"}
				}
			},
			defaults: {
				choices: {
					received: {value: {input: "auto", output: "zh-CN"}},
					sent: {value: {input: "auto", output: "en"}}
				}
			},
			bdfdb: {
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => selectedChannelId},
					MessageStore: {
						getMessages: requestedChannelId => requestedChannelId == channelId ? {
							toArray: () => cachedMessages
						} : null
					}
				},
				LibraryModules: {
					MessageActions: {
						fetchMessages: async request => {
							fetchCalls.push(request);
							return {body: {messages: prefetchedMessages}};
						}
					}
				}
			}
		}
	});
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => String(item.message.id)));
		return Promise.resolve(Object.fromEntries(preparedItems.map(item => [item.message.id, `translated ${item.message.id}`])));
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: channelId},
				channelStream: renderedMessages.map(message => ({content: message}))
			}
		}
	});
	await new Promise(resolve => setImmediate(resolve));
	await plugin.waitForHistoricalTranslationJobs(channelId);

	assert.deepEqual(fetchCalls.map(request => ({channelId: request.channelId, beforeMessageId: request.beforeMessageId, limit: request.limit})), [{channelId, beforeMessageId: "61", limit: 10}]);
	assert.ok(fetchCalls[0].signal);
	assert.equal(requestedIds.length, 5);
	assert.equal(requestedIds[0].length, 10, "the provider batch moves in chunks so capsule progress can tick");
	assert.deepEqual(requestedIds.flat(), createLoadedMessages(100, 50, "expected", channelId).map(message => message.id));
	assert.equal(plugin.historicalDisplayBatchCommits.length, 1);
	assert.deepEqual(plugin.historicalDisplayBatchCommits[0].map(result => result.messageId), requestedIds.flat());
	assert.equal(JSON.stringify(cachedMessages), cacheSnapshot);
	assert.equal(JSON.stringify(prefetchedMessages), prefetchedSnapshot);
});

test("switching channels cancels an in-flight initial historical source build before it publishes prefetched messages", async () => {
	const channelId = "channel-a";
	let selectedChannelId = channelId;
	const cachedMessages = createLoadedMessages(80, 20, "cached", channelId);
	const prefetchedMessages = createLoadedMessages(60, 10, "prefetched", channelId);
	const prefetchedSnapshot = JSON.stringify(prefetchedMessages);
	const fetchCalls = [];
	const requestedIds = [];
	let resolveFetch;
	const plugin = configureHistoricalCoordinatorPlugin({
		pluginOptions: {
			settings: {
				choices: {
					received: {input: "auto", output: "zh-CN"},
					sent: {input: "auto", output: "en"}
				}
			},
			defaults: {
				choices: {
					received: {value: {input: "auto", output: "zh-CN"}},
					sent: {value: {input: "auto", output: "en"}}
				}
			},
			bdfdb: {
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => selectedChannelId},
					MessageStore: {
						getMessages: requestedChannelId => requestedChannelId == channelId ? {
							toArray: () => cachedMessages
						} : null
					}
				},
				LibraryModules: {
					MessageActions: {
						fetchMessages: request => {
							fetchCalls.push(request);
							return new Promise(resolve => {
								resolveFetch = () => resolve({body: {messages: prefetchedMessages}});
							});
						}
					}
				}
			}
		}
	});
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => String(item.message.id)));
		return Promise.resolve(Object.fromEntries(preparedItems.map(item => [item.message.id, `translated ${item.message.id}`])));
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: channelId},
				channelStream: createLoadedMessages(100, 20, "rendered", channelId).map(message => ({content: message}))
			}
		}
	});
	await new Promise(resolve => setImmediate(resolve));
	selectedChannelId = "channel-b";
	plugin.prepareAutoTranslationChannelSession("channel-b");
	resolveFetch();
	await new Promise(resolve => setImmediate(resolve));
	await plugin.waitForHistoricalTranslationJobs(channelId);

	assert.deepEqual(fetchCalls.map(request => ({channelId: request.channelId, beforeMessageId: request.beforeMessageId, limit: request.limit})), [{channelId, beforeMessageId: "61", limit: 10}]);
	assert.ok(fetchCalls[0].signal);
	assert.deepEqual(requestedIds, []);
	assert.deepEqual(plugin.historicalDisplayBatchCommits, []);
	assert.equal(JSON.stringify(prefetchedMessages), prefetchedSnapshot);
});

test("disabling a channel cancels an in-flight initial historical source build before it publishes prefetched messages", async () => {
	const channelId = "channel-disable";
	let selectedChannelId = channelId;
	let enabled = true;
	const prefetchedMessages = createLoadedMessages(60, 10, "prefetched", channelId);
	const prefetchedSnapshot = JSON.stringify(prefetchedMessages);
	let resolveFetch;
	const plugin = configureHistoricalCoordinatorPlugin({
		pluginOptions: {
			settings: {
				choices: {
					received: {input: "auto", output: "zh-CN"},
					sent: {input: "auto", output: "en"}
				}
			},
			defaults: {
				choices: {
					received: {value: {input: "auto", output: "zh-CN"}},
					sent: {value: {input: "auto", output: "en"}}
				}
			},
			bdfdb: {
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => selectedChannelId},
					MessageStore: {
						getMessages: requestedChannelId => requestedChannelId == channelId ? {
							toArray: () => createLoadedMessages(80, 20, "cached", channelId)
						} : null
					}
				},
				LibraryModules: {
					MessageActions: {
						fetchMessages: () => new Promise(resolve => {
							resolveFetch = () => resolve({body: {messages: prefetchedMessages}});
						})
					}
				}
			}
		}
	});
	plugin.isTranslationEnabled = requestedChannelId => requestedChannelId == channelId ? enabled : true;
	plugin.setChannelEnablementStateValue = (_channelId, nextValue) => {enabled = nextValue;};
	plugin.restoreReceivedDisplayChannel = async () => {};
	plugin.clearDisplayedAutoTranslations = () => {};
	plugin.processAutoTranslationQueue = () => {};
	plugin.requestAiBatchTranslation = () => {
		throw new Error("provider must not run after disable");
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: channelId},
				channelStream: createLoadedMessages(100, 20, "rendered", channelId).map(message => ({content: message}))
			}
		}
	});
	await new Promise(resolve => setImmediate(resolve));
	await plugin.toggleTranslation(channelId);
	resolveFetch();
	await new Promise(resolve => setImmediate(resolve));
	await plugin.waitForHistoricalTranslationJobs(channelId);

	assert.deepEqual(plugin.historicalDisplayBatchCommits, []);
	assert.equal(JSON.stringify(prefetchedMessages), prefetchedSnapshot);
});

test("advancing the historical source generation cancels an in-flight initial historical source build before it publishes prefetched messages", async () => {
	const channelId = "channel-stale-generation";
	let selectedChannelId = channelId;
	const prefetchedMessages = createLoadedMessages(60, 10, "prefetched", channelId);
	const prefetchedSnapshot = JSON.stringify(prefetchedMessages);
	let resolveFetch;
	const plugin = configureHistoricalCoordinatorPlugin({
		pluginOptions: {
			settings: {
				choices: {
					received: {input: "auto", output: "zh-CN"},
					sent: {input: "auto", output: "en"}
				}
			},
			defaults: {
				choices: {
					received: {value: {input: "auto", output: "zh-CN"}},
					sent: {value: {input: "auto", output: "en"}}
				}
			},
			bdfdb: {
				LibraryStores: {
					SelectedChannelStore: {getChannelId: () => selectedChannelId},
					MessageStore: {
						getMessages: requestedChannelId => requestedChannelId == channelId ? {
							toArray: () => createLoadedMessages(80, 20, "cached", channelId)
						} : null
					}
				},
				LibraryModules: {
					MessageActions: {
						fetchMessages: () => new Promise(resolve => {
							resolveFetch = () => resolve({body: {messages: prefetchedMessages}});
						})
					}
				}
			}
		}
	});
	plugin.requestAiBatchTranslation = () => {
		throw new Error("provider must not run after generation invalidation");
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: channelId},
				channelStream: createLoadedMessages(100, 20, "rendered", channelId).map(message => ({content: message}))
			}
		}
	});
	await new Promise(resolve => setImmediate(resolve));
	plugin.advanceHistoricalMessageSourceGeneration(channelId);
	resolveFetch();
	await new Promise(resolve => setImmediate(resolve));
	await plugin.waitForHistoricalTranslationJobs(channelId);

	assert.deepEqual(plugin.historicalDisplayBatchCommits, []);
	assert.equal(JSON.stringify(prefetchedMessages), prefetchedSnapshot);
});

for (const scenario of [
	{
		name: "advancing the historical source generation aborts an in-flight prefetch before it can publish",
		cancel: harness => harness.plugin.advanceHistoricalMessageSourceGeneration(harness.channelId)
	},
	{
		name: "disabling the channel aborts an in-flight prefetch before it can publish",
		cancel: async harness => {
			harness.applyEnablementOverride();
			await harness.plugin.toggleTranslation(harness.channelId);
		}
	},
	{
		name: "switching channels aborts an in-flight prefetch before it can publish",
		cancel: harness => {
			harness.setSelectedChannelId("channel-b");
			harness.plugin.prepareAutoTranslationChannelSession("channel-b");
		}
	}
]) {
	test(scenario.name, async () => {
		const harness = createInitialSourcePrefetchHarness();
		harness.startInitialPass();
		await new Promise(resolve => setImmediate(resolve));

		const signal = harness.getSignal();
		assert.ok(signal, "prefetch must expose a signal to the fetch layer");
		assert.equal(signal.aborted, false);

		await scenario.cancel(harness);

		assert.equal(signal.aborted, true);
		harness.resolveFetch();
		await new Promise(resolve => setImmediate(resolve));
		await harness.plugin.waitForHistoricalTranslationJobs(harness.channelId);
		assert.deepEqual(harness.plugin.historicalDisplayBatchCommits, []);
	});
}

test("messages loaded during a running historical job form the next atomic job", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	try {
		const batchResolvers = [];
		const requestedIds = [];
		let rerenderCount = 0;
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			requestedIds.push(preparedItems.map(item => item.message.id));
			return new Promise(resolve => batchResolvers.push(resolve));
		};
		plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
		plugin.rerenderMessagesWithScrollPreserved = () => {
			rerenderCount++;
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "first"), {id: "channel-history-job"}, {content: "first"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "older"), {id: "channel-history-job"}, {content: "older"}, {historicalLoad: true});
		assert.equal(plugin.isHistoricalMessagePending("200", "channel-history-job"), true);
		assert.deepEqual(requestedIds, [["100"]]);

		batchResolvers.shift()({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(requestedIds, [["100"], ["200"]]);

		batchResolvers.shift()({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");

		assert.equal(rerenderCount, 0);
		assert.equal(plugin.historicalDisplayBatchCommits.length, 2);
		assert.deepEqual(plugin.historicalDisplayBatchCommits[0].map(result => result.messageId), ["100"]);
		assert.deepEqual(plugin.historicalDisplayBatchCommits[1].map(result => result.messageId), ["200"]);
	}
	finally {
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("live messages run while a historical provider request is pending", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let resolveBatch;
	let liveTranslateCalls = 0;
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	plugin.translateMessage = () => {
		liveTranslateCalls++;
		return Promise.resolve(true);
	};

	plugin.queueAutoTranslateMessage(createMessage("100", "old"), {id: "channel-history-job"}, {content: "old"}, {historicalLoad: true});
	const historicalRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));

	plugin.queueAutoTranslateMessage(createMessage("300", "new live"), {id: "channel-history-job"}, {content: "new live"}, {historicalLoad: false});
	await new Promise(resolve => setTimeout(resolve, 0));
	assert.equal(liveTranslateCalls, 1);

	resolveBatch({"100": "旧消息"});
await historicalRunning;
});

test("a queued live item receives the next slot before a sealed follow-up historical job", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	try {
		const requestedIds = [];
		const batchResolvers = [];
		const providerOrder = [];
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const ids = preparedItems.map(item => String(item.message.id));
			requestedIds.push(ids);
			providerOrder.push(`historical:${ids.join(",")}`);
			return new Promise(resolve => batchResolvers.push(resolve));
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};
		plugin.translateMessage = message => {
			providerOrder.push(`live:${message.id}`);
			return Promise.resolve(true);
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: "channel-history-job"}, {content: "follow-up historical"}, {historicalLoad: true});
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(requestedIds, [["100"]], "the follow-up job must stay queued while the first historical request is active");

		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "queued live"), {id: "channel-history-job"}, {content: "queued live"});
		assert.equal(plugin.ensureLiveTranslationQueue().getQueueLength(), 1, "the live queue must retain the waiting message");

		batchResolvers.shift()({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(providerOrder, ["historical:100"], "the next slot must stay open for queued live work");

		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.processAutoTranslationQueue();
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(providerOrder.slice(0, 2), ["historical:100", "live:300"], "the queued live item must run before the sealed follow-up historical job");

		batchResolvers.shift()({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
		assert.deepEqual(providerOrder, ["historical:100", "live:300", "historical:200"]);
	}
	finally {
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("a queued same-channel cached live hit consumes the handoff and resumes follow-up history", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const channelId = preparedItems[0] && preparedItems[0].channelId || "unknown";
			const ids = preparedItems.map(item => String(item.message.id));
			providerOrder.push(`historical:${channelId}:${ids.join(",")}`);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => {throw new Error("cached automatic results must not write the legacy display map");};
		plugin.rerenderMessagesWithScrollPreserved = () => {};
		plugin.commitReceivedDisplayResult = async result => {
			providerOrder.push(`cached:${result.channelId}:${result.messageId}`);
			return {confirmedIds: [String(result.messageId)], missingIds: [], fallbackUsed: false};
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: "channel-history-job"}, {content: "follow-up historical"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "cached live"), {id: "channel-history-job"}, {content: "cached live"}, {
			cachedTranslation: {
				channelId: "channel-history-job",
				auto: true,
				content: "缓存译文",
				translatedContent: "缓存译文",
				originalContent: "cached live",
				input: {id: "en"},
				output: {id: "zh-CN"}
			}
		});

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(providerOrder, ["historical:channel-history-job:100"], "the handoff must stay parked until the queued cached live item is consumed");

		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.processAutoTranslationQueue();
		await new Promise(resolve => setImmediate(resolve));
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(
			providerOrder.slice(0, 3),
			["historical:channel-history-job:100", "cached:channel-history-job:300", "historical:channel-history-job:200"],
			"consuming one queued cached live item must release the same channel's parked follow-up history"
		);

		batchResolvers.shift().resolve({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("a queued same-channel guard failure consumes the handoff and resumes follow-up history", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const channelId = preparedItems[0] && preparedItems[0].channelId || "unknown";
			const ids = preparedItems.map(item => String(item.message.id));
			providerOrder.push(`historical:${channelId}:${ids.join(",")}`);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};
		plugin.shouldAutoTranslateReceivedMessage = (message, channel, originalContentData, ignoreQueued) => {
			if (String(message && message.id) == "300" && ignoreQueued) {
				providerOrder.push(`guard:${channel.id}:${message.id}`);
				return false;
			}
			return true;
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: "channel-history-job"}, {content: "follow-up historical"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "guarded live"), {id: "channel-history-job"}, {content: "guarded live"});

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(providerOrder, ["historical:channel-history-job:100"], "the handoff must stay parked until the queued guard-failed live item is consumed");

		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.processAutoTranslationQueue();
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(
			providerOrder.slice(0, 3),
			["historical:channel-history-job:100", "guard:channel-history-job:300", "historical:channel-history-job:200"],
			"consuming one queued guard-failed live item must release the same channel's parked follow-up history"
		);

		batchResolvers.shift().resolve({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("a started live turn consumes the handoff so a later same-channel live arrival cannot starve follow-up history", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const liveResolvers = new Map();
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const channelId = preparedItems[0] && preparedItems[0].channelId || "unknown";
			const ids = preparedItems.map(item => String(item.message.id));
			providerOrder.push(`historical:${channelId}:${ids.join(",")}`);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};
		plugin.translateMessage = (message, channel) => {
			const deferred = createDeferred();
			providerOrder.push(`live:${channel.id}:${message.id}`);
			liveResolvers.set(String(message.id), deferred);
			return deferred.promise;
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: "channel-history-job"}, {content: "follow-up historical"}, {historicalLoad: true});
		plugin.queueAutoTranslateMessage(createMessage("300", "live first"), {id: "channel-history-job"}, {content: "live first"});
		await new Promise(resolve => setImmediate(resolve));
		plugin.queueAutoTranslateMessage(createMessage("400", "live second"), {id: "channel-history-job"}, {content: "live second"});
		await new Promise(resolve => setImmediate(resolve));

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(
			providerOrder.slice(0, 3),
			["historical:channel-history-job:100", "live:channel-history-job:300", "historical:channel-history-job:200"],
			"once the first live turn has started, the follow-up historical job must resume before a later same-channel live arrival"
		);

		liveResolvers.get("300").resolve(true);
		await new Promise(resolve => setImmediate(resolve));
		liveResolvers.get("400").resolve(true);
		batchResolvers.shift().resolve({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		for (const deferred of liveResolvers.values()) deferred.resolve(true);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("other-channel live traffic does not delay a channel's follow-up historical continuation", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const liveResolvers = new Map();
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const channelId = preparedItems[0] && preparedItems[0].channelId || "unknown";
			const ids = preparedItems.map(item => String(item.message.id));
			providerOrder.push(`historical:${channelId}:${ids.join(",")}`);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};
		plugin.translateMessage = (message, channel) => {
			const deferred = createDeferred();
			providerOrder.push(`live:${channel.id}:${message.id}`);
			liveResolvers.set(`${channel.id}:${message.id}`, deferred);
			return deferred.promise;
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "c1 first historical"), {id: "channel-history-job"}, {content: "c1 first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "c1 follow-up historical"), {id: "channel-history-job"}, {content: "c1 follow-up historical"}, {historicalLoad: true});
		plugin.queueAutoTranslateMessage(createMessage("300", "c1 live"), {id: "channel-history-job"}, {content: "c1 live"});
		await new Promise(resolve => setImmediate(resolve));
		plugin.queueAutoTranslateMessage(Object.assign(createMessage("400", "c2 live"), {channel_id: "channel-live-c2"}), {id: "channel-live-c2"}, {content: "c2 live"});
		await new Promise(resolve => setImmediate(resolve));

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(
			providerOrder.slice(0, 3),
			["historical:channel-history-job:100", "live:channel-history-job:300", "historical:channel-history-job:200"],
			"another channel's live queue must not delay the current channel's follow-up historical handoff"
		);

		liveResolvers.get("channel-history-job:300").resolve(true);
		await new Promise(resolve => setImmediate(resolve));
		liveResolvers.get("channel-live-c2:400").resolve(true);
		batchResolvers.shift().resolve({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		for (const deferred of liveResolvers.values()) deferred.resolve(true);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
		plugin.cancelHistoricalTranslationJobs("channel-live-c2", "test-cleanup");
	}
});

test("clearing a channel retires its parked live handoff so a later live turn cannot resume stale history", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const liveResolvers = new Map();
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const channelId = preparedItems[0] && preparedItems[0].channelId || "unknown";
			const ids = preparedItems.map(item => String(item.message.id));
			providerOrder.push(`historical:${channelId}:${ids.join(",")}`);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};
		plugin.translateMessage = (message, channel) => {
			const deferred = createDeferred();
			providerOrder.push(`live:${channel.id}:${message.id}`);
			liveResolvers.set(`${channel.id}:${message.id}`, deferred);
			return deferred.promise;
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: "channel-history-job"}, {content: "follow-up historical"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "queued live"), {id: "channel-history-job"}, {content: "queued live"});
		await new Promise(resolve => setImmediate(resolve));

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(providerOrder, ["historical:channel-history-job:100"], "the parked handoff waits for the next live turn to start");

		plugin.clearAutoTranslationQueue("channel-history-job");
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.queueAutoTranslateMessage(createMessage("500", "fresh live after clear"), {id: "channel-history-job"}, {content: "fresh live after clear"});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(providerOrder, ["historical:channel-history-job:100", "live:channel-history-job:500"], "a fresh live turn after clear must not revive the cancelled follow-up history");

		liveResolvers.get("channel-history-job:500").resolve(true);
		await new Promise(resolve => setImmediate(resolve));
		assert.equal(plugin.isHistoricalMessagePending("200", "channel-history-job"), false);
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		for (const deferred of liveResolvers.values()) deferred.resolve(true);
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("a later same-channel live arrival cannot steal a reserved parked handoff", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const requestResolvers = [];
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const channelId = preparedItems[0] && preparedItems[0].channelId || "unknown";
			const ids = preparedItems.map(item => String(item.message.id));
			const type = ids.some(id => Number(id) >= 300) ? "live-burst" : "historical";
			providerOrder.push(`${type}:${channelId}:${ids.join(",")}`);
			const deferred = createDeferred();
			requestResolvers.push({type, ids, deferred});
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: "channel-history-job"}, {content: "follow-up historical"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "reserved live"), {id: "channel-history-job"}, {content: "reserved live"});
		await new Promise(resolve => setImmediate(resolve));

		requestResolvers.shift().deferred.resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(providerOrder, ["historical:channel-history-job:100"], "the parked handoff must still be waiting for the reserved live item");

		plugin.queueAutoTranslateMessage(createMessage("400", "later live"), {id: "channel-history-job"}, {content: "later live"});
		await new Promise(resolve => setImmediate(resolve));

		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.processAutoTranslationQueue();
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(
			providerOrder.slice(0, 3),
			["historical:channel-history-job:100", "live-burst:channel-history-job:300,400", "historical:channel-history-job:200"],
			"the reserved live item must run first and release follow-up history before a later same-channel arrival"
		);

		requestResolvers.shift().deferred.resolve({"300": "第三条", "400": "第四条"});
		await new Promise(resolve => setImmediate(resolve));
		requestResolvers.shift().deferred.resolve({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
	}
	finally {
		for (const request of requestResolvers) request.deferred.resolve({});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("unrelated-channel live traffic cannot delay or satisfy a reserved parked handoff", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const liveResolvers = new Map();
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const channelId = preparedItems[0] && preparedItems[0].channelId || "unknown";
			const ids = preparedItems.map(item => String(item.message.id));
			providerOrder.push(`historical:${channelId}:${ids.join(",")}`);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};
		plugin.translateMessage = (message, channel) => {
			const deferred = createDeferred();
			providerOrder.push(`live:${channel.id}:${message.id}`);
			liveResolvers.set(`${channel.id}:${message.id}`, deferred);
			return deferred.promise;
		};

		plugin.queueAutoTranslateMessage(createMessage("100", "c1 first historical"), {id: "channel-history-job"}, {content: "c1 first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));

		plugin.queueAutoTranslateMessage(createMessage("200", "c1 follow-up historical"), {id: "channel-history-job"}, {content: "c1 follow-up historical"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "c1 reserved live"), {id: "channel-history-job"}, {content: "c1 reserved live"});
		await new Promise(resolve => setImmediate(resolve));

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(providerOrder, ["historical:channel-history-job:100"], "the parked handoff must still be waiting for the reserved live item");

		plugin.queueAutoTranslateMessage(Object.assign(createMessage("400", "c2 live"), {channel_id: "channel-live-c2"}), {id: "channel-live-c2"}, {content: "c2 live"});
		await new Promise(resolve => setImmediate(resolve));

		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.processAutoTranslationQueue();
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(
			providerOrder.slice(0, 3),
			["historical:channel-history-job:100", "live:channel-history-job:300", "historical:channel-history-job:200"],
			"another channel must neither satisfy nor delay the reserved handoff"
		);

		liveResolvers.get("channel-history-job:300").resolve(true);
		await new Promise(resolve => setImmediate(resolve));
		liveResolvers.get("channel-live-c2:400").resolve(true);
		batchResolvers.shift().resolve({"200": "第二条"});
		await plugin.waitForHistoricalTranslationJobs("channel-history-job");
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		for (const deferred of liveResolvers.values()) deferred.resolve(true);
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
		plugin.cancelHistoricalTranslationJobs("channel-live-c2", "test-cleanup");
	}
});

test("new historical intake cannot bypass a parked live handoff", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const requestedIds = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const ids = preparedItems.map(item => String(item.message.id));
			requestedIds.push(ids);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));
		plugin.queueAutoTranslateMessage(createMessage("200", "sealed follow-up"), {id: "channel-history-job"}, {content: "sealed follow-up"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "reserved live"), {id: "channel-history-job"}, {content: "reserved live"});

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		assert.deepEqual(requestedIds, [["100"]]);

		plugin.queueAutoTranslateMessage(createMessage("250", "new historical intake"), {id: "channel-history-job"}, {content: "new historical intake"}, {historicalLoad: true});
		await new Promise(resolve => setImmediate(resolve));

		assert.deepEqual(requestedIds, [["100"]], "collecting more history must not start any parked historical job before the exact live ticket is consumed");
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("direct historical cancellation retires the parked live reservation", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const batchResolvers = [];
	const providerOrder = [];
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const ids = preparedItems.map(item => String(item.message.id));
			const type = ids.some(id => Number(id) >= 300) ? "live-burst" : "historical";
			providerOrder.push(`${type}:${ids.join(",")}`);
			const deferred = createDeferred();
			batchResolvers.push(deferred);
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: "channel-history-job"}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
		await new Promise(resolve => setImmediate(resolve));
		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: "channel-history-job"}, {content: "follow-up historical"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "old reserved live"), {id: "channel-history-job"}, {content: "old reserved live"});

		batchResolvers.shift().resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "direct-cancel");
		plugin.queueAutoTranslateMessage(createMessage("400", "newest live"), {id: "channel-history-job"}, {content: "newest live"});

		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.processAutoTranslationQueue();
		await new Promise(resolve => setImmediate(resolve));

		assert.equal(providerOrder.at(-1), "live-burst:400,300", "after direct cancellation the queue must return to normal newest-first order");
	}
	finally {
		for (const deferred of batchResolvers) deferred.resolve({});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs("channel-history-job", "test-cleanup");
	}
});

test("invalidating a reserved live request reassigns or releases its historical handoff", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const requests = [];
	const providerOrder = [];
	const channelId = "channel-history-job";
	try {
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			const ids = preparedItems.map(item => String(item.message.id));
			const type = ids.some(id => Number(id) >= 300) ? "live-burst" : "historical";
			providerOrder.push(`${type}:${ids.join(",")}`);
			const deferred = createDeferred();
			requests.push({ids, deferred});
			return deferred.promise;
		};
		plugin.applyStoredTranslationToMessage = () => ({});
		plugin.rerenderMessagesWithScrollPreserved = () => {};

		plugin.queueAutoTranslateMessage(createMessage("100", "first historical"), {id: channelId}, {content: "first historical"}, {historicalLoad: true});
		const firstRunning = plugin.startCollectedHistoricalTranslationJobs(channelId);
		await new Promise(resolve => setImmediate(resolve));
		plugin.queueAutoTranslateMessage(createMessage("200", "follow-up historical"), {id: channelId}, {content: "follow-up historical"}, {historicalLoad: true});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
		plugin.queueAutoTranslateMessage(createMessage("300", "reserved live"), {id: channelId}, {content: "reserved live"});

		requests[0].deferred.resolve({"100": "第一条"});
		await firstRunning;
		await new Promise(resolve => setImmediate(resolve));
		const edited = createMessage("300", "edited live source");
		const editedSignature = plugin.createReceivedTranslationSignature(edited, channelId, {content: edited.content});
		assert.equal(plugin.invalidateLiveTranslationMessage("300", channelId, editedSignature), true);
		plugin.queueAutoTranslateMessage(createMessage("400", "replacement live"), {id: channelId}, {content: "replacement live"});

		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.processAutoTranslationQueue();
		await new Promise(resolve => setImmediate(resolve));
		const liveRequest = requests.find(request => request.ids.includes("400"));
		assert.ok(liveRequest, "the replacement live request still receives the next provider turn");
		liveRequest.deferred.resolve({"400": "第四条"});
		await new Promise(resolve => setImmediate(resolve));
		await new Promise(resolve => setImmediate(resolve));

		assert.ok(providerOrder.includes("historical:200"), "retiring the old ticket must not leave the sealed historical job parked forever");
	}
	finally {
		for (const request of requests) request.deferred.resolve({});
		plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
		plugin.cancelHistoricalTranslationJobs(channelId, "test-cleanup");
	}
});

test("cached historical translations commit without a provider request", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let providerRequests = 0;
	let rerenderCount = 0;
	plugin.requestAiBatchTranslation = () => {
		providerRequests++;
		return Promise.resolve(null);
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
	plugin.rerenderMessagesWithScrollPreserved = () => {
		rerenderCount++;
	};

	plugin.queueAutoTranslateMessage(createMessage("cached-1", "cached source"), {id: "channel-history-job"}, {content: "cached source"}, {
		historicalLoad: true,
		cachedTranslation: {
			signature: "cached-signature",
			channelId: "channel-history-job",
			auto: true,
			content: "缓存译文",
			translatedContent: "缓存译文",
			originalContent: "cached source",
			input: {id: "en"},
			output: {id: "zh-CN"}
		}
	});

	await plugin.startCollectedHistoricalTranslationJobs("channel-history-job");

	assert.equal(providerRequests, 0);
	assert.equal(rerenderCount, 0);
	assert.equal(plugin.historicalDisplayBatchCommits.length, 1);
	assert.equal(plugin.historicalDisplayBatchCommits[0].length, 1);
	assert.equal(plugin.historicalDisplayBatchCommits[0][0].messageId, "cached-1");
	assert.equal(plugin.historicalDisplayBatchCommits[0][0].status, "translated");
	assert.equal(plugin.historicalDisplayBatchCommits[0][0].translation.translatedContent, "缓存译文");
});

test("invalid batch items are repaired, but a skip verdict is terminal", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const repairedIds = [];
	let rerenderCount = 0;
	plugin.requestAiBatchTranslation = () => Promise.resolve({
		"invalid-skip": "__SKIP_TRANSLATION__",
		"invalid-language": "still English",
		"invalid-placeholder": "translated without the protected mention"
	});
	plugin.isTranslationLikelyInTargetLanguage = text => text != "still English";
	plugin.repairHistoricalTranslationJobItem = prepared => {
		repairedIds.push(prepared.message.id);
		return Promise.resolve({
			status: "translated",
			translation: {
				signature: prepared.signature,
				channelId: "channel-history-job",
				auto: true,
				content: `${prepared.message.id} repaired`,
				translatedContent: `${prepared.message.id} repaired`,
				originalContent: prepared.originalContentData.content,
				input: prepared.input,
				output: prepared.output
			}
		});
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
	plugin.rerenderMessagesWithScrollPreserved = () => {
		rerenderCount++;
	};

	for (const id of ["invalid-skip", "invalid-language", "invalid-placeholder"]) {
		const content = id == "invalid-placeholder" ? "translate <@123456789>" : "translate me";
		plugin.queueAutoTranslateMessage(createMessage(id, content), {id: "channel-history-job"}, {content}, {historicalLoad: true});
	}

	await plugin.startCollectedHistoricalTranslationJobs("channel-history-job");

	// A skip verdict is the answer the batch prompt asked for, so it is terminal and must
	// NOT enter the repair ladder. Repairing it re-asked the provider with the skip option
	// removed, so the retry could not even reproduce the verdict - one wasted serial round
	// trip per skipped message, and the message sat showing a spinner in the meantime.
	assert.deepEqual(repairedIds.sort(), ["invalid-language", "invalid-placeholder"]);
	assert.equal(plugin.historicalDisplayBatchCommits.length, 1);
	assert.deepEqual(plugin.historicalDisplayBatchCommits[0].filter(result => result.status === "translated").map(result => result.messageId).sort(), ["invalid-language", "invalid-placeholder"]);
	assert.deepEqual(plugin.historicalDisplayBatchCommits[0].filter(result => result.status === "skipped").map(result => result.messageId), ["invalid-skip"]);
	assert.equal(rerenderCount, 0);
});

test("historical authentication failure uses the detailed provider result and makes no repair requests", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const channelId = "channel-history-auth";
	let detailedCalls = 0;
	let legacyCalls = 0;
	let repairBatchCalls = 0;
	let repairCalls = 0;
	plugin.requestAiBatchTranslationDetailed = () => {
		detailedCalls++;
		return Promise.resolve({translations: null, failureKind: "auth", statusCode: 401});
	};
	plugin.requestAiBatchTranslation = () => {legacyCalls++; return Promise.resolve(null);};
	plugin.repairHistoricalTranslationJobBatch = () => {repairBatchCalls++; return Promise.resolve(null);};
	plugin.repairHistoricalTranslationJobItem = () => {repairCalls++; return Promise.resolve({status: "failed"});};
	for (const id of ["auth-1", "auth-2"]) {
		const message = createMessage(id, `source ${id}`);
		plugin.queueAutoTranslateMessage(message, {id: channelId}, {content: message.content}, {historicalLoad: true});
	}

	await plugin.startCollectedHistoricalTranslationJobs(channelId);

	assert.equal(detailedCalls, 1);
	assert.equal(legacyCalls, 0);
	assert.equal(repairBatchCalls, 0);
	assert.equal(repairCalls, 0);
	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 2);
});

test("failed historical items are retained by channel and retried in a new bounded job", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const channelId = "channel-history-retry";
	const requestedIds = [];
	const appliedIds = () => plugin.historicalDisplayBatchCommits.flatMap(results => results.filter(result => result.status === "translated").map(result => result.messageId));
	const statusUpdates = [];
	let shouldFail = true;
	let holdRetry = false;
	let resolveRetryBatch = null;
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => item.message.id));
		if (shouldFail) return Promise.resolve(null);
		const result = Object.fromEntries(preparedItems.map(item => [item.message.id, `translated ${item.protectedText}`]));
		if (!holdRetry) return Promise.resolve(result);
		return new Promise(resolve => {
			resolveRetryBatch = () => resolve(result);
		});
	};
	plugin.repairHistoricalTranslationJobBatch = () => Promise.resolve(null);
	plugin.repairHistoricalTranslationJobItem = () => Promise.resolve({status: "failed", reason: "provider_failed"});
	plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	plugin.updateLoadedAutoTranslationStatus = updates => {
		statusUpdates.push(updates);
	};

	for (const id of ["retry-1", "retry-2"]) {
		plugin.queueAutoTranslateMessage(createMessage(id, `source ${id}`), {id: channelId}, {content: `source ${id}`}, {historicalLoad: true});
	}
	await plugin.startCollectedHistoricalTranslationJobs(channelId);

	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 2);
	assert.deepEqual(appliedIds(), []);

	shouldFail = false;
	holdRetry = true;
	plugin.getReceivedAutoTranslateLoadedLimit = () => 1;
	const firstRetry = plugin.retryFailedHistoricalTranslations(channelId);
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(await plugin.retryFailedHistoricalTranslations(channelId), false);
	resolveRetryBatch();
	await firstRetry;

	assert.deepEqual(requestedIds, [["retry-1", "retry-2"], ["retry-1"]]);
	assert.deepEqual(appliedIds(), ["retry-1"]);
	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 1);
	const partialRetryStatus = statusUpdates.findLast(status => status && status.done && status.active === false);
	assert.equal(partialRetryStatus.total, 1);
	assert.equal(partialRetryStatus.displayed, 1);
	assert.equal(partialRetryStatus.failed, 0);
	assert.equal(partialRetryStatus.retryable, 1);
	assert.doesNotMatch(plugin.getLoadedAutoTranslationStatusDetailText(partialRetryStatus), /failed 1/i);
	assert.match(plugin.getLoadedAutoTranslationStatusDetailText(partialRetryStatus), /retry/i);

	holdRetry = false;
	await plugin.retryFailedHistoricalTranslations(channelId);

	assert.deepEqual(requestedIds, [["retry-1", "retry-2"], ["retry-1"], ["retry-2"]]);
	assert.deepEqual(appliedIds(), ["retry-1", "retry-2"]);
	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 0);
});

test("editing a source removes its retained historical failure snapshot", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const channelId = "channel-history-failed-edit";
	plugin.requestAiBatchTranslation = () => Promise.resolve(null);
	plugin.repairHistoricalTranslationJobBatch = () => Promise.resolve(null);
	plugin.repairHistoricalTranslationJobItem = () => Promise.resolve({status: "failed", reason: "provider_failed"});
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	const message = createMessage("failed-edit-1", "old failed source");

	plugin.queueAutoTranslateMessage(message, {id: channelId}, {content: message.content}, {historicalLoad: true});
	await plugin.startCollectedHistoricalTranslationJobs(channelId);
	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 1);

	const editedMessage = Object.assign({}, message, {content: "new edited source"});
	const editedContentData = plugin.extractOriginalContentData(editedMessage);
	const editedSignature = plugin.createReceivedTranslationSignature(editedMessage, channelId, editedContentData);

	assert.equal(plugin.invalidateHistoricalTranslationMessage(message.id, channelId, editedSignature), true);
	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 0);
});

test("deleting a source cancels its historical record and retained retry snapshot only in that channel", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const firstChannelId = "channel-history-delete";
	const secondChannelId = "channel-history-delete-other";
	const deletedMessage = createMessage("deleted-history", "deleted source");
	const otherMessage = createMessage("other-history", "other source");
	plugin.queueAutoTranslateMessage(deletedMessage, {id: firstChannelId}, {content: deletedMessage.content}, {historicalLoad: true, deferHistoricalSnapshotStart: true});
	plugin.queueAutoTranslateMessage(otherMessage, {id: secondChannelId}, {content: otherMessage.content}, {historicalLoad: true, deferHistoricalSnapshotStart: true});
	plugin.ensureHistoricalJobRegistry().setFailedSnapshot(firstChannelId, {channelId: firstChannelId, items: [{message: deletedMessage}]});
	plugin.ensureHistoricalJobRegistry().setFailedSnapshot(secondChannelId, {channelId: secondChannelId, items: [{message: otherMessage}]});
	const deletedJob = plugin.getHistoricalTranslationJobQueue(firstChannelId, false).jobs[0];
	const otherJob = plugin.getHistoricalTranslationJobQueue(secondChannelId, false).jobs[0];

	assert.equal((await plugin.handleDeletedMessage(deletedMessage.id, firstChannelId)).removed, true);
	assert.equal(deletedJob.items.get(deletedMessage.id).status, "cancelled");
	assert.equal(deletedJob.items.get(deletedMessage.id).reason, "source-deleted");
	assert.equal(plugin.getFailedHistoricalTranslationCount(firstChannelId), 0);
	assert.equal(plugin.ensureLiveTranslationQueue().isMessageQueued(deletedMessage.id), false);
	assert.equal(otherJob.items.get(otherMessage.id).status, "pending");
	assert.equal(plugin.getFailedHistoricalTranslationCount(secondChannelId), 1);
	assert.equal(plugin.ensureLiveTranslationQueue().isMessageQueued(otherMessage.id), true);
});

test("failed historical status exposes a visible retry action", () => {
	const plugin = createPluginInstance({
		callSetLanguages: false,
		settings: {filters: {receivedAutoTranslateScope: "loaded_messages"}},
		bdfdb: {
			LibraryStores: {
				SelectedChannelStore: {getChannelId: () => "channel-history-retry-ui"}
			}
		}
	});
	const createNode = tagName => {
		const node = {
			tagName,
			children: [],
			className: "",
			textContent: "",
			innerHTML: "",
			appendChild(child) {
				child.parentNode = this;
				this.children.push(child);
				return child;
			},
			remove() {
				if (!this.parentNode) return;
				this.parentNode.children = this.parentNode.children.filter(child => child !== this);
			},
			querySelector(selector) {
				const className = selector.startsWith(".") ? selector.slice(1) : null;
				return this.children.find(child => className && String(child.className || "").split(/\s+/).includes(className)) || null;
			}
		};
		return node;
	};
	const statusElement = createNode("div");
	statusElement.id = "DiscordAITranslator-loaded-status";
	const dot = createNode("span");
	dot.className = "translator-loaded-status-dot";
	const text = createNode("span");
	text.className = "translator-loaded-status-text";
	const staleProgress = createNode("span");
	staleProgress.className = "translator-loaded-status-progress";
	statusElement.appendChild(dot);
	statusElement.appendChild(text);
	statusElement.appendChild(staleProgress);
	const body = createNode("body");
	body.appendChild(statusElement);
	const originalDocument = global.document;
	const originalRequestAnimationFrame = global.requestAnimationFrame;
	const originalSetTimeout = global.setTimeout;
	const originalClearTimeout = global.clearTimeout;
	const timers = new Map();
	let timerSequence = 0;
	let retriedChannelId = null;
	global.document = {
		body,
		createElement: createNode,
		getElementById: id => id == statusElement.id ? statusElement : null,
		querySelector: () => null,
		querySelectorAll: () => []
	};
	global.requestAnimationFrame = () => 0;
	global.setTimeout = (callback, delay) => {
		const handle = ++timerSequence;
		timers.set(handle, {callback, delay});
		return handle;
	};
	global.clearTimeout = handle => timers.delete(handle);
	plugin.attachAutoTranslationScrollWatcher = () => {};
	plugin.ensureLoadedAutoTranslationStatusPositionWatcher = () => {};
	plugin.positionLoadedAutoTranslationStatusElement = () => {};
	plugin.updateInlineLoadedAutoTranslationStatusElements = () => {};
	plugin.scheduleTranslationRerender = () => {throw new Error("status-only updates must not repaint messages");};
	plugin._testBdfdb.MessageUtils.rerenderAll = () => {throw new Error("status-only updates must not repaint the chat");};
	plugin.retryFailedHistoricalTranslations = channelId => {
		retriedChannelId = channelId;
		return Promise.resolve(true);
	};

	try {
		plugin.updateLoadedAutoTranslationStatus({active: true, collecting: false, done: false, channelId: "channel-history-retry-ui", total: 2, processed: 0, displayed: 0, failed: 0, retryable: 0, phase: "requesting"});
		assert.match(statusElement.className, /translator-loaded-status-requesting/);
		assert.equal(timers.size, 1, "an active capsule schedules its own timely refresh");
		const [tickHandle, tickTimer] = [...timers.entries()][0];
		assert.equal(tickTimer.delay, 1000);
		timers.delete(tickHandle);
		tickTimer.callback();
		assert.equal([...timers.values()][0].delay, 1000, "the status tick re-arms without repainting messages");

		plugin.updateLoadedAutoTranslationStatus({
			active: false,
			collecting: false,
			done: true,
			channelId: "channel-history-retry-ui",
			total: 2,
			processed: 2,
			displayed: 0,
			skipped: 0,
			failed: 2,
			retryable: 2
		});
		const retryButton = statusElement.querySelector(".translator-loaded-status-retry");
		assert.ok(retryButton);
		assert.equal(retryButton.textContent, "Retry");
		assert.match(statusElement.className, /translator-loaded-status-retryable/);
		assert.match(statusElement.className, /translator-loaded-status-failed/);
		assert.match(statusElement.innerHTML, /translator-loaded-status-icon/);
		assert.match(statusElement.innerHTML, /<svg/);
		assert.equal(text.textContent, "0/2 · 2!");
		assert.match(statusElement.title, /Loaded translation: batch 1 done, shown 0\/2, failed 2/);
		assert.equal(timers.size, 0, "a retryable failure remains visible");
		retryButton.onclick({stopPropagation: () => {}});
		assert.equal(retriedChannelId, "channel-history-retry-ui");

		plugin.updateLoadedAutoTranslationStatus({active: false, collecting: false, done: true, total: 2, processed: 2, displayed: 1, displayPending: 1, failed: 0, retryable: 0, phase: "done"});
		assert.equal(text.textContent, "1/2 · 1↻");
		assert.equal(timers.size, 0, "a completed request with an unpainted mounted row remains visible");

		plugin.updateLoadedAutoTranslationStatus({active: false, collecting: false, done: true, total: 2, processed: 2, displayed: 2, displayPending: 0, failed: 0, retryable: 0, phase: "done"});
		assert.equal(text.textContent, "2/2");
		assert.equal(timers.size, 1);
		const completionTimer = [...timers.values()][0];
		assert.equal(completionTimer.delay, 3000, "successful completion uses the agreed three-second hide");
		completionTimer.callback();
		assert.equal(body.children.includes(statusElement), false);
	}
	finally {
		global.document = originalDocument;
		global.requestAnimationFrame = originalRequestAnimationFrame;
		global.setTimeout = originalSetTimeout;
		global.clearTimeout = originalClearTimeout;
	}
});

test("loaded status capsule styling uses a translation icon and Discord theme variables", () => {
	const classNames = new Proxy({}, {get: () => ""});
	const styles = createTranslatorStyles({dotCN: classNames, dotCNS: classNames, disCN: classNames});

	assert.match(styles, /\.translator-loaded-status-icon/);
	assert.match(styles, /var\(--background-floating/);
	assert.match(styles, /var\(--text-muted/);
	assert.match(styles, /translator-loaded-status-requesting[\s\S]*var\(--brand-500/);
	assert.match(styles, /translator-loaded-status-repairing[\s\S]*var\(--status-warning/);
	assert.match(styles, /translator-loaded-status-failed[\s\S]*var\(--status-danger/);
});

test("batch parser drops duplicate and unknown IDs so they enter repair", () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const response = JSON.stringify([
		{id: "100", translation: "first"},
		{id: "100", translation: "duplicate"},
		{id: "200", translation: "second"},
		{id: "unknown", translation: "must be ignored"}
	]);

	assert.deepEqual(plugin.parseAiBatchTranslationResponse(response, ["100", "200"]), {"200": "second"});
	assert.deepEqual(plugin.parseAiBatchTranslationResponse(JSON.stringify([
		{id: "100", translation: ""}
	]), ["100", "200"]), {"100": ""});
	assert.equal(plugin.parseAiBatchTranslationResponse("not json", ["100"]), null);
});

test("pending translation renders a stable loading icon and clears stale translated styling", () => {
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ReactUtils: {
				createElement: (type, props) => ({type, props, key: props && props.key})
			},
			DOMUtils: {
				formatClassName: (...names) => names.filter(Boolean).join(" ")
			}
		}
	});
	plugin.isMessageTranslationPending = () => true;
	const event = {
		returnvalue: {
			props: {
				children: ["message text"],
				className: "message-content translator-translated-message another-class",
				style: {
					color: "white",
					"--translator-accent-color": "#00ff00",
					"--translator-text-color": "#00ff00"
				}
			}
		}
	};
	const message = createMessage("pending-loader", "message text");

	plugin.applyMessageContentRenderDecorations(event, message, null);

	assert.doesNotMatch(event.returnvalue.props.className, /translator-translated-message/);
	assert.equal(event.returnvalue.props.style["--translator-accent-color"], undefined);
	assert.equal(event.returnvalue.props.style["--translator-text-color"], undefined);
	assert.equal(event.returnvalue.props.style.color, "white");
	const loadingNode = event.returnvalue.props.children.find(child => child && child.props && child.props.className == "translator-translation-loading");
	assert.ok(loadingNode);
	assert.equal(loadingNode.props["aria-label"], "Translating");
});

test("cancelling a channel discards a late coordinator response", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let resolveBatch;
	let appliedCount = 0;
	let rerenderCount = 0;
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => {
		appliedCount++;
		return {};
	};
	plugin.rerenderMessagesWithScrollPreserved = () => {
		rerenderCount++;
	};

	plugin.queueAutoTranslateMessage(createMessage("cancel-late", "translate later"), {id: "channel-history-job"}, {content: "translate later"}, {historicalLoad: true});
	const running = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));
	plugin.cancelHistoricalTranslationJobs("channel-history-job", "channel-disabled");
	resolveBatch({"cancel-late": "迟到译文"});
	await running;

	assert.equal(appliedCount, 0);
	assert.equal(rerenderCount, 0);
	assert.equal(plugin.isHistoricalMessagePending("cancel-late", "channel-history-job"), false);
});

test("a cancelled historical job cannot delete a replacement queue for the same channel", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let resolveOldBatch;
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveOldBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => ({});
	plugin.rerenderMessagesWithScrollPreserved = () => {};

	plugin.queueAutoTranslateMessage(createMessage("old-job", "old source"), {id: "channel-history-job"}, {content: "old source"}, {historicalLoad: true});
	const oldRunning = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));

	plugin.cancelHistoricalTranslationJobs("channel-history-job", "channel-disabled");
	plugin.queueAutoTranslateMessage(createMessage("replacement-job", "replacement source"), {id: "channel-history-job"}, {content: "replacement source"}, {historicalLoad: true});
	assert.equal(plugin.isHistoricalMessagePending("replacement-job", "channel-history-job"), true);

	resolveOldBatch({"old-job": "late old translation"});
	await oldRunning;

	assert.equal(plugin.isHistoricalMessagePending("replacement-job", "channel-history-job"), true);
});

test("historical coordinator discards a late response after received translation settings change", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let resolveBatch;
	let appliedCount = 0;
	let rerenderCount = 0;
	plugin.isHistoricalTranslationJobCurrent = Object.getPrototypeOf(plugin).isHistoricalTranslationJobCurrent.bind(plugin);
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => {
		appliedCount++;
		return {};
	};
	plugin.rerenderMessagesWithScrollPreserved = () => {
		rerenderCount++;
	};

	plugin.queueAutoTranslateMessage(createMessage("settings-late", "translate with old settings"), {id: "channel-history-job"}, {content: "translate with old settings"}, {historicalLoad: true});
	const running = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));
	plugin.settings.choices.received.output = "zh-CN";
	resolveBatch({"settings-late": "旧配置译文"});
	await running;

	assert.equal(appliedCount, 0);
	assert.equal(rerenderCount, 0);
	assert.equal(plugin.isMessageTranslationPending("settings-late", "channel-history-job"), false);
});

test("plugin stop clears active automatic translation display state", () => {
	const plugin = createPluginInstance();
	const message = createMessage("stop-restore", "original text");
	plugin.applyStoredTranslationToMessage(message, {
		channelId: message.channel_id,
		auto: true,
		content: "译文",
		translatedContent: "译文",
		originalContent: "original text",
		input: {id: "en"},
		output: {id: "zh-CN"}
	});
	assert.ok(plugin.getActiveMessageTranslation(message, message.channel_id));

	plugin.onStop();

	assert.equal(plugin.getActiveMessageTranslation(message, message.channel_id), null);
});

test("clearing one channel queue cancels its historical coordinator job", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let resolveBatch;
	let appliedCount = 0;
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => {
		appliedCount++;
		return {};
	};
	plugin.rerenderMessagesWithScrollPreserved = () => {};

	plugin.queueAutoTranslateMessage(createMessage("clear-channel", "translate later"), {id: "channel-history-job"}, {content: "translate later"}, {historicalLoad: true});
	const running = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));

	plugin.clearAutoTranslationQueue("channel-history-job");
	assert.equal(plugin.isHistoricalMessagePending("clear-channel", "channel-history-job"), false);

	resolveBatch({"clear-channel": "late translation"});
	await running;
	assert.equal(appliedCount, 0);
});

test("switching channels cancels the previous channel historical job", () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const message = Object.assign(createMessage("switch-channel", "translate later"), {channel_id: "channel-a"});
	plugin.prepareAutoTranslationChannelSession("channel-a");
	plugin.queueAutoTranslateMessage(message, {id: "channel-a"}, {content: "translate later"}, {historicalLoad: true});
	assert.equal(plugin.isHistoricalMessagePending(message.id, "channel-a"), true);

	plugin.prepareAutoTranslationChannelSession("channel-b");

	assert.equal(plugin.isHistoricalMessagePending(message.id, "channel-a"), false);
});

test("plugin stop cancels pending historical work and ignores its late result", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	let resolveBatch;
	let appliedCount = 0;
	let rerenderCount = 0;
	plugin.requestAiBatchTranslation = () => new Promise(resolve => {
		resolveBatch = resolve;
	});
	plugin.applyStoredTranslationToMessage = () => {
		appliedCount++;
		return {};
	};
	plugin.rerenderMessagesWithScrollPreserved = () => {
		rerenderCount++;
	};

	plugin.queueAutoTranslateMessage(createMessage("stop-late", "translate later"), {id: "channel-history-job"}, {content: "translate later"}, {historicalLoad: true});
	const running = plugin.startCollectedHistoricalTranslationJobs("channel-history-job");
	await new Promise(resolve => setTimeout(resolve, 0));

	plugin.onStop();
	resolveBatch({"stop-late": "late translation"});
	await running;

	assert.equal(appliedCount, 0);
	assert.equal(rerenderCount, 0);
	assert.equal(plugin.isHistoricalMessagePending("stop-late", "channel-history-job"), false);
});

test("one historical job performs one acknowledged display commit", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const commits = [];
	plugin.isHistoricalTranslationJobItemCurrent = () => true;
	plugin.commitHistoricalReceivedDisplayBatch = async results => {
		commits.push(results);
		return {confirmedIds: results.map(result => String(result.messageId)), missingIds: [], fallbackUsed: false};
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
	const messages = [createMessage("100", "first"), createMessage("200", "second"), createMessage("300", "third")];
	const summary = {
		translated: messages.map(message => ({message, originalContentData: {content: message.content, embeds: []}, translation: {channelId: message.channel_id, auto: true, content: `${message.content} translated`, translatedContent: `${message.content} translated`, signature: `sig-${message.id}`}})),
		skipped: [],
		failed: []
	};
	const job = {channelId: "channel-history-job", generation: 1, items: new Map(messages.map(message => [message.id, {message}]))};

	await plugin.commitHistoricalTranslationJob(summary, job);

	assert.equal(commits.length, 1);
	assert.deepEqual(commits[0].map(result => result.messageId), ["100", "200", "300"]);
	assert.equal(commits[0].every(result => result.status === "translated" && result.generation === 1), true);
});

test("historical display commit does not wait for typing or scrolling to become idle", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const realDocument = global.document;
	const realSetTimeout = global.setTimeout;
	let viewportRead = false;
	let scheduled = false;
	global.document = {};
	global.setTimeout = () => {scheduled = true; return 1;};
	plugin.isHistoricalTranslationJobCurrent = () => true;
	plugin.ensureMessageViewportStore = () => ({
		getTimeSinceInputActivity: () => {viewportRead = true; return 0;},
		isUserScrollingChannel: () => {viewportRead = true; return true;}
	});
	try {
		const commitReady = plugin.waitForHistoricalTranslationCommit({channelId: "c1"});
		await Promise.race([commitReady, new Promise((_, reject) => realSetTimeout(() => reject(new Error("commit stayed blocked")), 50))]);
		assert.equal(viewportRead, false);
		assert.equal(scheduled, false);
	}
	finally {
		global.document = realDocument;
		global.setTimeout = realSetTimeout;
	}
});

test("historical status excludes unconfirmed rejected retrying and stale translations", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const messages = ["confirmed", "deferred", "missing", "retry", "rejected", "stale"].map(id => createMessage(id, `${id} source`));
	const statusUpdates = [];
	plugin.isHistoricalTranslationJobItemCurrent = () => true;
	plugin.updateLoadedAutoTranslationStatus = update => {statusUpdates.push(update);};
	plugin.commitHistoricalReceivedDisplayBatch = async () => ({
		confirmedIds: ["confirmed"],
		deferredIds: ["deferred"],
		missingIds: ["missing"],
		retryIds: ["retry"],
		rejectedIds: ["rejected"],
		staleIds: ["stale"],
		fallbackUsed: false
	});
	const summary = {
		translated: messages.map(message => ({message, originalContentData: {content: message.content, embeds: []}, translation: {channelId: message.channel_id, auto: true, content: `${message.content} translated`, signature: `sig-${message.id}`}})),
		skipped: [],
		failed: []
	};
	const job = {channelId: "channel-history-job", generation: 1, items: new Map(messages.map(message => [message.id, {message}]))};

	await plugin.commitHistoricalTranslationJob(summary, job);

	assert.equal(statusUpdates.at(-1).displayed, 2, "confirmed and virtualized-ready rows count; unresolved rows do not");
});

test("historical progress never reports uncommitted rows or overwrites the final display count", () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const updates = [];
	plugin.updateLoadedAutoTranslationStatus = update => {updates.push(update);};
	const job = {
		channelId: "channel-history-job",
		state: "ready",
		items: new Map([
			["translated", {status: "translated"}],
			["failed", {status: "failed"}]
		])
	};

	plugin.updateHistoricalTranslationJobStatus(job);
	assert.equal(updates.at(-1).displayed, 0, "atomic results are not displayed before their commit");
	const updateCount = updates.length;
	job.state = "committed";
	plugin.updateHistoricalTranslationJobStatus(job);
	assert.equal(updates.length, updateCount, "the exact commit outcome remains the final status");
});

test("a historical translation creates display state when the message was never rendered first", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	plugin.isHistoricalTranslationJobItemCurrent = () => true;
	plugin.commitHistoricalReceivedDisplayBatch = Object.getPrototypeOf(plugin).commitHistoricalReceivedDisplayBatch.bind(plugin);
	const message = createMessage("recordless", "source text");
	const summary = {
		translated: [{message, originalContentData: {content: message.content, embeds: []}, translation: {channelId: message.channel_id, auto: true, content: "translated text", translatedContent: "translated text", signature: "sig-recordless"}}],
		skipped: [],
		failed: []
	};
	const job = {channelId: "channel-history-job", generation: 1, items: new Map([[message.id, {message}]])};

	assert.equal(plugin.getReceivedDisplayView(message.id), null);
	await plugin.commitHistoricalTranslationJob(summary, job);

	assert.equal(plugin.getReceivedDisplayView(message.id).content, "translated text");
});

test("recordless historical skipped and failed results retain their terminal reasons", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	plugin.isHistoricalTranslationJobItemCurrent = () => true;
	plugin.commitHistoricalReceivedDisplayBatch = Object.getPrototypeOf(plugin).commitHistoricalReceivedDisplayBatch.bind(plugin);
	const skipped = createMessage("recordless-skipped", "already translated");
	const failed = createMessage("recordless-failed", "provider failed");
	const summary = {
		translated: [],
		skipped: [{message: skipped, originalContentData: {content: skipped.content, embeds: []}, reason: "same_language"}],
		failed: [{message: failed, originalContentData: {content: failed.content, embeds: []}, reason: "provider_failed"}]
	};
	const job = {channelId: "channel-history-job", generation: 1, items: new Map([[skipped.id, {message: skipped}], [failed.id, {message: failed}]])};

	await plugin.commitHistoricalTranslationJob(summary, job);

	assert.equal(plugin.getReceivedDisplayView(skipped.id).status, "skipped");
	assert.equal(plugin.getReceivedDisplayView(skipped.id).reason, "same_language");
	assert.equal(plugin.getReceivedDisplayView(failed.id).status, "failed");
	assert.equal(plugin.getReceivedDisplayView(failed.id).reason, "provider_failed");
});

test("the historical repair path honours the provider backoff instead of throwing", async () => {
	// Both repair entry points opened with this.awaitProviderBackoff(). That delegated to
	// receivedTranslationRuntime, which never defined it, so the batch repair threw
	// synchronously and the per-item repair rejected its own promise - the repair pass
	// for a failed historical batch could never run. The backoff window belongs to the
	// provider client, which is what opens it on a 429 or 5xx.
	const plugin = createPluginInstance({callSetLanguages: false});
	const waits = [];
	plugin.providerClientInstance = {
		awaitBackoff: () => {waits.push("awaited"); return Promise.resolve();},
		scheduleBackoff: ms => {waits.push(ms); return ms;}
	};

	assert.equal(plugin.scheduleAutoTranslationBackoff(2500), 2500);
	assert.deepEqual(waits, [2500]);

	const job = {channelId: "channel-repair", generation: 1, items: new Map()};
	plugin.isHistoricalTranslationJobCurrent = () => true;
	plugin.getHistoricalAiBatchEngineKey = () => "deepseek";
	let requested = null;
	plugin.requestAiBatchTranslation = (engineKey, items) => {requested = {engineKey, items}; return Promise.resolve("batched");};

	const result = await plugin.repairHistoricalTranslationJobBatch([{message: {id: "1"}}], job);

	assert.equal(result, "batched");
	assert.equal(requested.engineKey, "deepseek");
	assert.deepEqual(waits, [2500, "awaited"]);
});

test("the loaded-status capsule ticks processed counts while provider chunks settle", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const channelId = "channel-history-chunk-progress";
	const statusUpdates = [];
	plugin.updateLoadedAutoTranslationStatus = updates => statusUpdates.push(Object.assign({}, updates));
	plugin.getReceivedAutoTranslateLoadedLimit = () => 20;
	plugin.isUserActivelyScrollingMessages = () => true;
	const pendingChunks = [];
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => new Promise(resolve => {
		pendingChunks.push({ids: preparedItems.map(item => String(item.message.id)), resolve});
	});

	for (let index = 0; index < 20; index++) {
		const message = createMessage(String(1000 + index), `loaded message ${index}`);
		plugin.queueAutoTranslateMessage(message, {id: channelId}, {content: message.content}, {historicalLoad: true, deferHistoricalSnapshotStart: true});
	}
	await new Promise(resolve => setImmediate(resolve));

	assert.equal(pendingChunks.length, 1, "the first provider chunk must start without waiting for the whole job");
	assert.equal(pendingChunks[0].ids.length, 10, "the first chunk carries the provider chunk size");

	pendingChunks[0].resolve(Object.fromEntries(pendingChunks[0].ids.map(id => [id, `translated ${id}`])));
	await new Promise(resolve => setImmediate(resolve));
	await new Promise(resolve => setImmediate(resolve));

	const progressTicks = statusUpdates.filter(update => update.processed > 0 && !update.done);
	assert.ok(progressTicks.some(update => update.processed === 10), "a settled chunk must tick the capsule's processed count immediately");
	assert.equal(pendingChunks.length, 2, "the next chunk starts after the previous one settles");

	pendingChunks[1].resolve(Object.fromEntries(pendingChunks[1].ids.map(id => [id, `translated ${id}`])));
	await plugin.waitForHistoricalTranslationJobs(channelId);
});

test("a historical commit does not overwrite a live translation that landed mid-batch", async () => {
	const plugin = configureHistoricalCoordinatorPlugin({scheduleAutomatically: true});
	const channelId = "channel-history-live-race";
	plugin.getReceivedAutoTranslateLoadedLimit = () => 2;
	plugin.isUserActivelyScrollingMessages = () => true;
	const requestedIds = [];
	let resolveBatch;
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		requestedIds.push(preparedItems.map(item => String(item.message.id)));
		return new Promise(resolve => {resolveBatch = resolve;});
	};

	const statusUpdates = [];
	plugin.updateLoadedAutoTranslationStatus = updates => statusUpdates.push(Object.assign({}, updates));

	const messages = [createMessage("501", "live raced message one"), createMessage("502", "live raced message two")];
	for (const message of messages) plugin.queueAutoTranslateMessage(message, {id: channelId}, {content: message.content}, {historicalLoad: true, deferHistoricalSnapshotStart: true});
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(requestedIds.length, 1, "setup: the historical batch is in flight");

	// The live lane lands a translation for 501 while the historical batch is pending.
	plugin.captureReceivedMessageSource({messageId: "501", channelId, generation: plugin.getReceivedDisplayCommitGeneration(channelId), sourceSignature: plugin.createReceivedTranslationSignature(messages[0], channelId, {content: messages[0].content}), source: {content: messages[0].content, embeds: []}});
	await plugin.commitReceivedDisplayResult({
		messageId: "501",
		channelId,
		generation: plugin.getReceivedDisplayCommitGeneration(channelId),
		sourceSignature: plugin.createReceivedTranslationSignature(messages[0], channelId, {content: messages[0].content}),
		origin: "automatic",
		status: "translated",
		translation: {content: "live translation 501", translatedContent: "live translation 501", originalContent: messages[0].content, channelId, auto: true}
	}, {refresh: false});

	resolveBatch({"501": "historical translation 501", "502": "historical translation 502"});
	await plugin.waitForHistoricalTranslationJobs(channelId);

	assert.deepEqual((plugin.historicalDisplayBatchCommits[0] || []).map(result => String(result.messageId)), ["502"], "the historical commit must drop the message the live lane already owns");
	assert.equal(plugin.getReceivedDisplayRuntimeView("501").translation.content, "live translation 501", "the newer live command must keep ownership of the message");
	const finalStatus = statusUpdates.filter(update => update.done).at(-1);
	assert.ok(finalStatus, "the job must report a final status");
	assert.equal(finalStatus.total, 2);
	assert.equal(finalStatus.displayed, 2, "a live-displayed message must count as displayed, not as a pending failure");
});
