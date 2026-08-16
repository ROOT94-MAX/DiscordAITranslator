const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("../helpers/createPluginInstance");
const {createHarness, sourceSnapshot, translatedResult} = require("../helpers/createReceivedDisplayHarness");

function createScrollEchoHarness() {
	const realDocument = global.document;
	const realRequestAnimationFrame = global.requestAnimationFrame;
	const handlers = {};
	const channelId = "channel-scroll-echo";
	const scroller = {
		_scrollTop: 100,
		scrollHeight: 2000,
		clientHeight: 400,
		get scrollTop() {return this._scrollTop;},
		set scrollTop(value) {
			this._scrollTop = value;
			// A DOM scroller fires 'scroll' for programmatic writes too.
			if (handlers.scroll) handlers.scroll({type: "scroll"});
		},
		addEventListener: (name, handler) => {handlers[name] = handler;},
		removeEventListener: () => {},
		getBoundingClientRect: () => ({top: 0, bottom: 400, height: 400}),
		querySelectorAll: () => []
	};
	global.document = {
		querySelector: selector => selector == ".messages-scroller" ? scroller : null,
		getElementById: () => null
	};
	global.requestAnimationFrame = callback => callback();
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			dotCN: {messagesscroller: ".messages-scroller"},
			LibraryStores: {SelectedChannelStore: {getChannelId: () => channelId}}
		}
	});
	return {
		plugin,
		channelId,
		scroller,
		handlers,
		restore() {
			global.document = realDocument;
			global.requestAnimationFrame = realRequestAnimationFrame;
		}
	};
}

test("a scroll echo from a programmatic restore does not open the user scroll window", async () => {
	const harness = createScrollEchoHarness();
	try {
		const {plugin, channelId, scroller, handlers} = harness;
		plugin.attachAutoTranslationScrollWatcher();

		handlers.wheel({type: "wheel"});
		plugin.restoreMessageScrollerState({scrollTop: 300, keepBottom: false, anchor: null, userScrollIntentSequence: 0});
		assert.equal(plugin.isUserActivelyScrollingMessages(channelId), false, "the restore echo must not be recorded as user scrolling");

		await new Promise(resolve => setTimeout(resolve, 170));
		handlers.wheel({type: "wheel"});
		scroller.scrollTop = 500;
		assert.equal(plugin.isUserActivelyScrollingMessages(channelId), true, "a real user scroll outside the grace window still opens the window");
		plugin.finishAutoTranslationScrollActivity(channelId);
	}
	finally {harness.restore();}
});

test("live automatic commits coalesce into one acknowledged display flush", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-1";
		plugin.isViewingMessageHistory = () => false;
		const messageIds = [];
		for (let index = 0; index < 5; index++) {
			const messageId = `message-${index + 1}`;
			messageIds.push(messageId);
			plugin.captureReceivedMessageSource({messageId, channelId, generation: 1, sourceSignature: `sig-${messageId}`, source: {content: `original ${index}`, embeds: []}});
			const outcome = await plugin.commitReceivedDisplayResult({messageId, channelId, generation: 1, sourceSignature: `sig-${messageId}`, origin: "automatic", status: "translated", translation: {content: `译文${index}`}}, {refresh: false});
			assert.deepEqual(outcome.deferredIds, [messageId]);
			plugin.scheduleReceivedDisplayFlush(channelId, messageId);
		}
		assert.equal(calls.rerenderAll, 0);

		await new Promise(resolve => setTimeout(resolve, 250));

		assert.equal(calls.rerenderAll, 1, "five commits must share one acknowledged rebuild");
		assert.equal(messageIds.every(messageId => plugin.getReceivedDisplayView(messageId).renderStatus === "confirmed"), true);
	}
	finally {harness.restore();}
});

test("the historical snapshot seals while live commits keep restoring scroll", async () => {
	const echo = createScrollEchoHarness();
	try {
		const {plugin, channelId, handlers} = echo;
		plugin.settings.engines.translator = "deepseek";
		plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
		plugin.settings.filters.receivedAutoTranslateLoadedLimit = "50";
		plugin.settings.filters.minimumAutoTranslateLength = 2;
		plugin.settings.choices.received = {input: "auto", output: "zh-CN"};
		if (typeof plugin.setLanguages == "function") plugin.setLanguages();
		const statusUpdates = [];
		plugin.updateLoadedAutoTranslationStatus = updates => {statusUpdates.push(Object.assign({}, updates));};
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => Promise.resolve(Object.fromEntries(preparedItems.map(item => [String(item.message.id), `中文译文${item.message.id}`])));
		plugin.isEngineConfiguredForRuntime = () => true;
		plugin.captureSentOriginalMessage = () => {};

		const channel = {id: channelId};
		const messages = [];
		for (let index = 0; index < 8; index++) {
			messages.push({id: String(1000 + index), channel_id: channelId, content: `original english message number ${index} to translate`, embeds: [], attachments: [], author: {id: "other-user"}});
		}

		plugin.attachAutoTranslationScrollWatcher();
		handlers.wheel({type: "wheel"});
		handlers.scroll({type: "scroll"});

		plugin.processMessages({instance: {props: {channel, channelStream: messages.map(message => ({content: message}))}}});

		let liveIndex = 0;
		const liveTimer = setInterval(() => {
			liveIndex++;
			const messageId = `live-${liveIndex}`;
			plugin.captureReceivedMessageSource({messageId, channelId, generation: plugin.getReceivedDisplayCommitGeneration(channelId), sourceSignature: `sig-${messageId}`, source: {content: `live ${liveIndex}`, embeds: []}});
			const commit = plugin.commitReceivedDisplayResult({messageId, channelId, generation: plugin.getReceivedDisplayCommitGeneration(channelId), sourceSignature: `sig-${messageId}`, origin: "automatic", status: "translated", translation: {content: `实时${liveIndex}`}}, {refresh: false});
			if (commit && commit.catch) commit.catch(() => {});
			plugin.scheduleReceivedDisplayFlush(channelId, messageId);
		}, 120);

		const deadline = Date.now() + 2500;
		let finalStatus = null;
		while (Date.now() < deadline) {
			finalStatus = statusUpdates[statusUpdates.length - 1] || null;
			if (finalStatus && finalStatus.done && finalStatus.processed === 8) break;
			await new Promise(resolve => setTimeout(resolve, 50));
		}
		clearInterval(liveTimer);
		plugin.clearReceivedDisplayFlushQueue();

		assert.ok(finalStatus, "historical status must update");
		assert.equal(finalStatus.done, true, "the snapshot must seal and the job must finish despite continuous live scroll restores");
		assert.equal(finalStatus.processed, 8);
		assert.equal(finalStatus.displayed, 8);
	}
	finally {echo.restore();}
});

test("switching channels releases the previous channel's session tracking state", () => {
	const plugin = require("../helpers/createPluginInstance").createPluginInstance({callSetLanguages: false});
	plugin.clearAutoTranslationQueue = () => {};
	plugin.clearAutoTranslationEligibleReplyPreviewMessages = () => {};
	plugin.clearDisplayedAutoTranslations = () => {};
	plugin.getReceivedAutoTranslateScope = () => "loaded_messages";

	plugin.prepareAutoTranslationChannelSession("channel-a");
	plugin.getAutoTranslationChannelState("channel-a");
	for (let index = 0; index < 50; index++) plugin.markLoadedAutoTranslationMessageSeen("channel-a", String(index));
	assert.equal(plugin.getLoadedAutoTranslationSeenCount("channel-a"), 50);

	plugin.prepareAutoTranslationChannelSession("channel-b");

	assert.equal(plugin.getLoadedAutoTranslationSeenCount("channel-a"), 0, "leaving channel-a must drop its seen map");
});

test("a cleared translation keeps its original clone until the render path consumes it", () => {
	const {createPluginInstance} = require("../helpers/createPluginInstance");
	const plugin = createPluginInstance({callSetLanguages: false});
	const message = {id: "manual-clone-1", channel_id: "channel-clone", content: "original text", embeds: [], attachments: [], author: {id: "other-user"}};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-clone",
		auto: false,
		manual: true,
		content: "译文",
		translatedContent: "译文",
		originalContent: "original text",
		embeds: {}
	});
	plugin.clearDisplayedTranslationState("manual-clone-1", {clearReplyPreview: true});
	// The clone must survive the clear: a rendered message whose props still show
	// translated text needs it on the next render to restore the original.
	assert.equal(plugin.hasStoredOriginalMessageClone("manual-clone-1"), true);

	const event = {
		instance: {props: {message: Object.assign({}, message, {content: "译文"})}},
		returnvalue: {props: {children: []}}
	};
	plugin.processMessageContent(event);

	assert.equal(event.instance.props.message.content, "original text");
	assert.equal(plugin.hasStoredOriginalMessageClone("manual-clone-1"), false, "the render path consumes and releases the clone");
});

function createLiveBurstPlugin(providerLatencyMs = 40) {
	const harness = createHarness();
	const {plugin} = harness;
	plugin.settings.engines.translator = "deepseek";
	plugin.settings.engines.backup = "----";
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	plugin.settings.filters.minimumAutoTranslateLength = 2;
	plugin.settings.choices.received = {input: "auto", output: "zh-CN"};
	plugin.setLanguages();
	plugin.isEngineConfiguredForRuntime = () => true;
	plugin.captureSentOriginalMessage = () => {};
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.getCachedReceivedSkipDecision = () => null;
	plugin.getAutoTranslatedResultRejectReason = () => null;
	plugin.isTranslationResultTooSimilar = () => false;
	plugin.isTranslationLikelyInTargetLanguage = () => true;
	plugin.persistTranslationCacheEntry = () => {};
	const calls = {single: 0, batch: 0, batchedItems: 0};
	plugin.translateText = (text, _place, callback) => {
		calls.single++;
		setTimeout(() => callback(`译文:${text}`, {id: "en"}, {id: "zh-CN"}, {}), providerLatencyMs);
	};
	plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
		calls.batch++;
		calls.batchedItems += preparedItems.length;
		return new Promise(resolve => setTimeout(() => resolve(
			Object.fromEntries(preparedItems.map(item => [String(item.message.id), `译文:${item.message.id}`]))
		), providerLatencyMs));
	};
	return {harness, plugin, calls};
}

function createBurstMessages(channelId, count) {
	const messages = [];
	for (let index = 0; index < count; index++) {
		messages.push({
			id: String(2000 + index),
			channel_id: channelId,
			content: `burst message number ${index} that needs translation`,
			embeds: [],
			attachments: [],
			author: {id: "other-user"}
		});
	}
	return messages;
}

async function drainBurst(plugin, messages, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const done = messages.filter(message => {
			const view = plugin.getReceivedDisplayView(message.id);
			return view && (view.translated || view.status === "skipped" || view.status === "failed");
		}).length;
		if (done === messages.length) return true;
		await new Promise(resolve => setTimeout(resolve, 15));
	}
	return false;
}

test("a live message burst coalesces into batched provider requests", async () => {
	const {harness, plugin, calls} = createLiveBurstPlugin();
	try {
		const channel = {id: "channel-burst"};
		const messages = createBurstMessages(channel.id, 8);
		for (const message of messages) {
			plugin.captureReceivedMessageSource({
				messageId: message.id,
				channelId: channel.id,
				generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
				sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
				source: {content: message.content, embeds: []}
			});
			plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
		}

		assert.equal(await drainBurst(plugin, messages), true, "every burst message must reach a terminal display state");
		assert.equal(messages.every(message => plugin.getReceivedDisplayView(message.id).translated), true);
		assert.ok(calls.batch >= 1, "the burst must use the batch provider path");
		assert.ok(calls.single + calls.batch <= 3, `8 messages must cost at most 3 requests, got ${calls.single} single + ${calls.batch} batch`);
	}
	finally {harness.restore();}
});

test("a single live message still uses the direct provider path", async () => {
	const {harness, plugin, calls} = createLiveBurstPlugin();
	try {
		const channel = {id: "channel-single"};
		const [message] = createBurstMessages(channel.id, 1);
		plugin.captureReceivedMessageSource({
			messageId: message.id,
			channelId: channel.id,
			generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
			sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
			source: {content: message.content, embeds: []}
		});
		plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});

		assert.equal(await drainBurst(plugin, [message]), true);
		assert.equal(plugin.getReceivedDisplayView(message.id).translated, true);
		assert.equal(calls.batch, 0, "a lone message must not pay batch-prompt overhead");
		assert.equal(calls.single, 1);
	}
	finally {harness.restore();}
});

test("a failed batch response falls back to the single provider path without losing messages", async () => {
	const {harness, plugin, calls} = createLiveBurstPlugin();
	try {
		const channel = {id: "channel-batch-fail"};
		const messages = createBurstMessages(channel.id, 4);
		// The provider answers the batch with unusable content; every item must still translate.
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			calls.batch++;
			calls.batchedItems += preparedItems.length;
			return Promise.resolve(null);
		};
		for (const message of messages) {
			plugin.captureReceivedMessageSource({
				messageId: message.id,
				channelId: channel.id,
				generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
				sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
				source: {content: message.content, embeds: []}
			});
			plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
		}

		assert.equal(await drainBurst(plugin, messages), true, "a failed batch must not strand queued messages");
		assert.equal(messages.every(message => plugin.getReceivedDisplayView(message.id).translated), true);
		assert.ok(calls.single >= 1, "rejected batch items must retry on the single path");
	}
	finally {harness.restore();}
});

test("a burst never sweeps in another channel's queued messages", async () => {
	const {harness, plugin, calls} = createLiveBurstPlugin();
	try {
		const channelA = {id: "channel-a-burst"};
		const channelB = {id: "channel-b-burst"};
		const batchChannels = [];
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			calls.batch++;
			batchChannels.push([...new Set(preparedItems.map(item => item.message.channel_id))]);
			return Promise.resolve(Object.fromEntries(preparedItems.map(item => [String(item.message.id), `译文:${item.message.id}`])));
		};
		const messagesA = createBurstMessages(channelA.id, 3);
		const messagesB = createBurstMessages(channelB.id, 3).map(message => Object.assign({}, message, {id: `b-${message.id}`, channel_id: channelB.id}));
		const all = [];
		for (const [messages, channel] of [[messagesA, channelA], [messagesB, channelB]]) {
			for (const message of messages) {
				all.push(message);
				plugin.captureReceivedMessageSource({
					messageId: message.id,
					channelId: channel.id,
					generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
					sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
					source: {content: message.content, embeds: []}
				});
				plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
			}
		}

		assert.equal(await drainBurst(plugin, all), true);
		assert.equal(batchChannels.every(channels => channels.length === 1), true, `every batch must stay inside one channel, got ${JSON.stringify(batchChannels)}`);
	}
	finally {harness.restore();}
});

test("a throw inside a burst never strands its other messages", async () => {
	const {harness, plugin} = createLiveBurstPlugin();
	try {
		const channel = {id: "channel-burst-throw"};
		const messages = createBurstMessages(channel.id, 6);
		let persistCalls = 0;
		plugin.persistTranslationCacheEntry = () => {
			persistCalls++;
			if (persistCalls === 2) throw new Error("cache write exploded");
		};
		for (const message of messages) {
			plugin.captureReceivedMessageSource({
				messageId: message.id,
				channelId: channel.id,
				generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
				sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
				source: {content: message.content, embeds: []}
			});
			plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
		}

		await drainBurst(plugin, messages, 3000);
		const stuck = messages.filter(message => {
			const view = plugin.getReceivedDisplayView(message.id);
			return view && view.showLoading;
		});
		assert.deepEqual(stuck.map(message => message.id), [], "no message may be left showing a permanent loading indicator");
	}
	finally {harness.restore();}
});

test("a per-item skip signal in a batch response commits a skip instead of re-translating", async () => {
	const {harness, plugin, calls} = createLiveBurstPlugin();
	try {
		const channel = {id: "channel-burst-skip"};
		const messages = createBurstMessages(channel.id, 3);
		const skipTarget = messages[1].id;
		const persistedSkips = [];
		plugin.persistReceivedSkipDecision = (messageId, _signature, reason) => {persistedSkips.push({messageId, reason});};
		plugin.requestAiBatchTranslation = (_engineKey, preparedItems) => {
			calls.batch++;
			return Promise.resolve(Object.fromEntries(preparedItems.map(item => [
				String(item.message.id),
				String(item.message.id) === skipTarget ? "__SKIP_TRANSLATION__" : `译文:${item.message.id}`
			])));
		};
		for (const message of messages) {
			plugin.captureReceivedMessageSource({
				messageId: message.id,
				channelId: channel.id,
				generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
				sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
				source: {content: message.content, embeds: []}
			});
			plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
		}

		await drainBurst(plugin, messages, 3000);

		const skippedView = plugin.getReceivedDisplayView(skipTarget);
		assert.equal(skippedView.status, "skipped", "an explicit skip verdict must be terminal, not a retry");
		// The burst's first message always takes the direct path; a skip verdict inside the
		// batch must not add a second full-price request on top of that.
		assert.equal(calls.single, 1, "a skip verdict must not cost a second full-price request");
		assert.equal(persistedSkips.some(entry => entry.messageId === skipTarget), true, "the skip decision must be cached");
	}
	finally {harness.restore();}
});

test("a burst interrupted by a channel clear does not resurrect provider work", async () => {
	const {harness, plugin, calls} = createLiveBurstPlugin(80);
	try {
		const channel = {id: "channel-burst-cancel"};
		const messages = createBurstMessages(channel.id, 4);
		for (const message of messages) {
			plugin.captureReceivedMessageSource({
				messageId: message.id,
				channelId: channel.id,
				generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
				sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
				source: {content: message.content, embeds: []}
			});
			plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
		}
		await new Promise(resolve => setTimeout(resolve, 20));
		const requestsBeforeClear = calls.single + calls.batch;

		plugin.clearAutoTranslationQueue(channel.id);
		await new Promise(resolve => setTimeout(resolve, 400));

		assert.equal(calls.single + calls.batch, requestsBeforeClear, "a cleared channel must not issue further provider requests");
		assert.equal(messages.every(message => {
			const view = plugin.getReceivedDisplayView(message.id);
			return !view || !view.showLoading;
		}), true, "cancelled work must not leave loading indicators behind");
	}
	finally {harness.restore();}
});

test("a translation arriving while you type is displayed promptly", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-typing";
		plugin.isChannelTextAreaFocused = () => true;
		plugin.isViewingMessageHistory = () => false;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");

		await new Promise(resolve => setTimeout(resolve, 300));
		assert.equal(calls.rerenderAll, 1, "targeted display must not wait for typing to stop");
		assert.equal(plugin.getReceivedDisplayRuntimeView("m1").translated, true);
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});

test("the 120 ms repaint window coalesces only paint while live loading appears immediately", async () => {
	const {harness, plugin, calls} = createLiveBurstPlugin(40);
	try {
		const channel = {id: "channel-live-loading"};
		const [message] = createBurstMessages(channel.id, 1);
		plugin.captureReceivedMessageSource({
			messageId: message.id,
			channelId: channel.id,
			generation: plugin.getReceivedDisplayCommitGeneration(channel.id),
			sourceSignature: plugin.createReceivedTranslationSignature(message, channel.id, {content: message.content, embeds: []}),
			source: {content: message.content, embeds: []}
		});

		plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});

		assert.equal(calls.single, 1, "provider work must start immediately");
		assert.equal(calls.batch, 0, "one live message must stay on the direct path");
		assert.equal(harness.calls.rerenderAll, 0, "the repaint window must not fire in the queue turn");
		assert.equal(plugin.getReceivedDisplayRuntimeView(message.id).showLoading, true, "the loading view must be available immediately");

		await new Promise(resolve => setTimeout(resolve, 80));
		assert.equal(harness.calls.rerenderAll, 0, "provider completion must still wait for the repaint coalescer");
		assert.equal(plugin.getReceivedDisplayRuntimeView(message.id).translated, true, "the translated state must already be committed before paint");

		await new Promise(resolve => setTimeout(resolve, 180));
		assert.equal(harness.calls.rerenderAll, 1, "the coalesced repaint must land once the 120 ms window expires");
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});

test("a translation arriving while the settings panel is open does not repaint the chat list", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-settings-open";
		let settingsOpen = true;
		plugin.isTranslatorSettingsSurfaceOpen = () => settingsOpen;
		plugin.isViewingMessageHistory = () => false;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");

		await new Promise(resolve => setTimeout(resolve, 300));
		assert.equal(calls.rerenderAll, 0, "an open settings surface must not be disturbed by a chat repaint");

		settingsOpen = false;
		await new Promise(resolve => setTimeout(resolve, 700));
		assert.equal(calls.rerenderAll, 1, "the repaint must still happen once the panel closes");
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});

test("a translation repaint is displayed during active scrolling", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-active-scroll";
		plugin.isUserActivelyScrollingMessages = () => true;
		plugin.isViewingMessageHistory = () => true;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");

		await new Promise(resolve => setTimeout(resolve, 350));
		assert.equal(calls.rerenderAll, 1, "targeted display must not wait for scrolling to stop");
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});


test("a targeted repaint appears promptly even while reading back through history", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-prompt-history";
		plugin.isViewingMessageHistory = () => true;
		plugin.captureReceivedMessageSource({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", source: {content: "hello", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");

		// The old 1500ms history delay existed to protect readers from a FULL-LIST
		// repaint that could not preserve their anchor. The rebuild path captures and
		// restores the anchor, so a translation must not sit invisible for a second
		// and a half.
		await new Promise(resolve => setTimeout(resolve, 350));
		assert.equal(calls.rerenderAll, 1, "a targeted repaint must not wait out the full-list history delay");
		assert.equal(plugin.getReceivedDisplayRuntimeView("m1").translated, true);
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});

test("an unconfirmed rebuild keeps scheduler retries read-only and never slows the next batch", async () => {
	const harness = createHarness({confirmAfterFallback: false});
	try {
		const {plugin, calls} = harness;
		const channelId = "channel-fallback-backoff";
		plugin.isViewingMessageHistory = () => true;
		for (const messageId of ["m1", "m2"]) {
			plugin.captureReceivedMessageSource({messageId, channelId, generation: 1, sourceSignature: `sig-${messageId}`, source: {content: "hello", embeds: []}});
		}
		await plugin.commitReceivedDisplayResult({messageId: "m1", channelId, generation: 1, sourceSignature: "sig-m1", origin: "automatic", status: "translated", translation: {content: "你好"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m1");
		await new Promise(resolve => setTimeout(resolve, 350));
		// One transaction owns one rebuild even when no revision marker ever lands; the
		// scheduler's bounded retries re-read the DOM instead of rebuilding per attempt.
		assert.equal(calls.rerenderAll, 1, "one transaction must rebuild exactly once even without confirmation");

		plugin.clearReceivedDisplayFlushQueue();
		await plugin.commitReceivedDisplayResult({messageId: "m2", channelId, generation: 1, sourceSignature: "sig-m2", origin: "automatic", status: "translated", translation: {content: "你好二"}}, {refresh: false});
		plugin.scheduleReceivedDisplayFlush(channelId, "m2");
		await new Promise(resolve => setTimeout(resolve, 350));
		assert.equal(calls.rerenderAll, 2, "the next transaction must keep the live one-rebuild cadence");
	}
	finally {
		harness.plugin.clearReceivedDisplayFlushQueue();
		harness.restore();
	}
});

test("an already translated message is not re-queued after a channel boundary reset", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		const channelId = "channel-1";
		const message = {id: "m1", channel_id: channelId, content: "english text to translate", embeds: [], attachments: [], author: {id: "other-user"}};
		const contentData = {content: message.content, embeds: []};
		const signature = plugin.createReceivedTranslationSignature(message, channelId, contentData);
		plugin.captureReceivedMessageSource({messageId: message.id, channelId, generation: 1, sourceSignature: signature, source: contentData});
		await plugin.commitReceivedDisplayResult({messageId: message.id, channelId, generation: 1, sourceSignature: signature, origin: "automatic", status: "translated", translation: {content: "中文译文"}}, {refresh: false});
		assert.equal(plugin.getReceivedDisplayRuntimeView("m1").translated, true);

		// A cleared cache is the realistic case: without it the cache hit masks the bug.
		plugin.getCachedReceivedTranslation = () => null;
		plugin.getCachedReceivedSkipDecision = () => null;

		// Re-entering a channel resets the boundary, so every rendered message looks new.
		const eligible = plugin.shouldAutoTranslateReceivedMessage(message, {id: channelId}, contentData);

		assert.equal(eligible, false, "a message already translated in the display store must not be queued again");
		assert.equal(plugin.getReceivedDisplayRuntimeView("m1").translated, true, "its visible translation must survive");
	}
	finally {harness.restore();}
});
