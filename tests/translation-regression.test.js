const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

test("emoji inside a word no longer protects the surrounding text", () => {
	const plugin = createPluginInstance();
	const [maskedText, protectedSegments, shouldTranslate] = plugin.removeExceptions("hello😊world", "sent");

	assert.equal(shouldTranslate, true);
	assert.match(maskedText, /^hello⟦\d+⟧world$/);
	assert.deepEqual(Object.values(protectedSegments), ["😊"]);
	assert.equal(plugin.addExceptions(maskedText, protectedSegments), "hello😊world");
});

test("messages that already contain translation plus quoted original extract the original for re-translation", () => {
	const plugin = createPluginInstance();
	const originalContentData = plugin.extractOriginalContentData({
		id: "message-1",
		content: "Hola amigo\n> hello friend",
		embeds: []
	});

	assert.equal(originalContentData.content, "hello friend");
	assert.equal(plugin.buildTranslationRequestText(originalContentData), "hello friend");
});

test("embed-only received translations are retained when the message body is empty", () => {
	const plugin = createPluginInstance();
	const separator = "__________________ __________________ __________________";
	const stored = plugin.createStoredReceivedTranslationData(
		{id: "embed-message", embeds: [{id: "embed-1"}]},
		"channel-1",
		{content: "", embeds: []},
		"signature-1",
		`\n${separator}\nTranslated title\nTranslated description\nTranslated footer`,
		{id: "auto"},
		{id: "en"},
		true
	);

	assert.ok(stored, "an embed translation is useful even without translated body text");
	assert.equal(stored.translatedContent, "");
	assert.equal(stored.embeds["embed-1"].title, "Translated title");
	assert.equal(stored.embeds["embed-1"].description, "Translated description");
	assert.equal(plugin.shouldKeepAutoTranslatedResult(stored, "channel-1"), true);
});

test("a partial embed response preserves untranslated source fields", () => {
	const plugin = createPluginInstance();
	const separator = "__________________ __________________ __________________";
	const message = {id: "partial-embed", embeds: [{id: "embed-1"}]};
	const original = {content: "", embeds: [{title: "Original title", description: "Original description", footerText: "Original footer", fields: [{name: "Original name", value: "Original value"}]}]};

	const stored = plugin.createStoredReceivedTranslationData(message, "channel-1", original, "signature-1", `\n${separator}\nTranslated title`, {id: "auto"}, {id: "en"}, true);

	assert.equal(stored.embeds["embed-1"].title, "Translated title");
	assert.equal(stored.embeds["embed-1"].description, "Original description");
	assert.equal(stored.embeds["embed-1"].footerText, "Original footer");
	assert.deepEqual(stored.embeds["embed-1"].fields, [{name: "Original name", value: "Original value"}]);
});

test("a missing embed footer cannot consume the last translated field", () => {
	const plugin = createPluginInstance();
	const separator = "__________________ __________________ __________________";
	const original = {content: "", embeds: [{title: "Title", description: "Description", footerText: "Original footer", fields: [{name: "Name", value: "Value"}]}]};
	const response = `\n${separator}\nTranslated title\nTranslated description\n\nTranslated name__________________Translated value`;

	const stored = plugin.createStoredReceivedTranslationData({id: "footer-missing", embeds: [{id: "embed-1"}]}, "channel-1", original, "signature-1", response, {id: "auto"}, {id: "en"}, true);

	assert.equal(stored.embeds["embed-1"].footerText, "Original footer");
	assert.deepEqual(stored.embeds["embed-1"].fields, [{name: "Translated name", value: "Translated value"}]);
});

test("an incomplete translated field list preserves every source field instead of shifting indexes", () => {
	const plugin = createPluginInstance();
	const separator = "__________________ __________________ __________________";
	const originalFields = [{name: "First", value: "One"}, {name: "Second", value: "Two"}];
	const original = {content: "", embeds: [{title: "Title", description: "Description", footerText: "", fields: originalFields}]};
	const response = `\n${separator}\nTranslated title\nTranslated description\n\nSecond translated__________________Two translated`;

	const stored = plugin.createStoredReceivedTranslationData({id: "field-missing", embeds: [{id: "embed-1"}]}, "channel-1", original, "signature-1", response, {id: "auto"}, {id: "en"}, true);

	assert.deepEqual(stored.embeds["embed-1"].fields, originalFields);
});

test("an empty embed response is not accepted merely because source fallback is populated", () => {
	const plugin = createPluginInstance();
	const separator = "__________________ __________________ __________________";
	const original = {content: "", embeds: [{title: "Original title", description: "Original description", footerText: "", fields: []}]};

	const stored = plugin.createStoredReceivedTranslationData({id: "empty-embed", embeds: [{id: "embed-1"}]}, "channel-1", original, "signature-1", separator, {id: "auto"}, {id: "en"}, true);

	assert.ok(stored, "source fallback remains available for safe rendering");
	assert.equal(plugin.shouldKeepAutoTranslatedResult(stored, "channel-1"), false);
});

test("short CJK terms can still pass the auto-translate length gate", () => {
	const plugin = createPluginInstance();
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const message = {
		id: "message-2",
		content: "焚决",
		embeds: [],
		author: {id: "other-user"}
	};
	const channel = {id: "channel-1"};

	assert.equal(plugin.shouldAutoTranslateReceivedMessage(message, channel, null, true), true);
	// The plugin no longer skips short text: the minimum length floor is 0 for every script family,
	// so a two-character CJK term passes the gate.
	assert.equal(plugin.getAutoTranslateMinimumLengthForAnalysis({dominantFamily: "han", totalLetters: 2}), 0);
});

test("short Latin chat words still enter received auto-translation", () => {
	const plugin = createPluginInstance({
		settings: {
			choices: {
				received: {input: "auto", output: "zh-CN"}
			},
			filters: {
				useLocalLanguagePrecheck: false,
				skipSameLanguageReceivedMessages: true
			}
		}
	});
	const channel = {id: "channel-short-latin"};
	for (const [id, content] of [["short-hi", "hi"], ["short-ok", "ok"]]) {
		const message = {id, content, embeds: [], author: {id: "other-user"}};
		assert.equal(plugin.sanitizeTextForAutoTranslateAnalysis(content), content);
		assert.equal(plugin.shouldAutoTranslateReceivedMessage(message, channel, null, true), true);
	}
});

test("legacy skip decisions are invalidated when the skip policy changes", () => {
	let storedData = {};
	const plugin = createPluginInstance({
		settings: {
			choices: {
				received: {input: "auto", output: "zh-CN"}
			}
		},
		bdfdb: {
			DataUtils: {
				load: (_plugin, key) => storedData[key] || {},
				save: () => {}
			}
		}
	});
	const message = {id: "legacy-skip", content: "hi", embeds: [], author: {id: "other-user"}};
	const signature = plugin.createReceivedTranslationSignature(message, "channel-cache", {content: "hi", embeds: []});
	storedData = {
		translationCache: {
			[message.id]: {
				signature,
				cachedAt: Date.now(),
				skipped: {reason: "ai_skip_signal", preview: "hi"}
			}
		}
	};
	plugin.forceUpdateAll();

	assert.equal(plugin.getCachedReceivedSkipDecision(message, "channel-cache", {content: "hi", embeds: []}), null);

	plugin.persistReceivedSkipDecision(message.id, signature, "ai_skip_signal", "hi");
	assert.equal(plugin.getCachedReceivedSkipDecision(message, "channel-cache", {content: "hi", embeds: []}).reason, "ai_skip_signal");
});

test("received skip cache is invalidated when source-language policy changes", () => {
	const plugin = createPluginInstance();
	const message = {id: "source-policy-skip", content: "bonjour", embeds: [], author: {id: "other-user"}};
	const sourceData = {content: "bonjour", embeds: []};
	const signature = plugin.createReceivedTranslationSignature(message, "channel-policy", sourceData);
	plugin.persistReceivedSkipDecision(message.id, signature, "source_filter", sourceData.content);

	assert.equal(plugin.getCachedReceivedSkipDecision(message, "channel-policy", sourceData).reason, "source_filter");
	plugin.settings.filters.receivedAutoTranslateSourceLanguages = ["en"];
	assert.equal(plugin.getCachedReceivedSkipDecision(message, "channel-policy", sourceData), null);
});

test("received translation signature covers filtering and protection policy", () => {
	const createSignature = mutate => {
		const plugin = createPluginInstance();
		const message = {id: "signature-policy", content: "hello", embeds: []};
		const sourceData = {content: "hello", embeds: []};
		const before = plugin.createReceivedTranslationSignature(message, "channel-policy", sourceData);
		mutate(plugin);
		return [before, plugin.createReceivedTranslationSignature(message, "channel-policy", sourceData)];
	};
	const mutations = [
		plugin => { plugin.settings.filters.skipSameLanguageReceivedMessages = false; },
		plugin => { plugin.settings.filters.useLocalLanguagePrecheck = false; },
		plugin => { plugin.settings.filters.treatLanguageVariantsAsSame = false; },
		plugin => { plugin.settings.filters.dropSimilarTranslations = false; },
		plugin => { plugin.settings.filters.translationSimilarityThreshold = 0.75; },
		plugin => { plugin.settings.filters.autoTranslateDecisionMode = "ai"; },
		plugin => { plugin.settings.filters.languageDetectionStrategy = "google_free"; },
		plugin => { plugin.settings.general.protectQuotedText = false; },
		plugin => { plugin.settings.exceptions.protectedTermsForReceived = false; },
		plugin => { plugin.settings.exceptions.wrapperPairsForReceived = false; }
	];

	for (const mutate of mutations) {
		const [before, after] = createSignature(mutate);
		assert.notEqual(after, before);
	}
});

test("AI auto-translation prompt forbids skipping short foreign chat terms", () => {
	const plugin = createPluginInstance();
	const prompt = plugin.getDefaultAiAutoTranslatePrompt();

	assert.match(prompt, /短词|short/i);
	assert.match(prompt, /不要.{0,12}(跳过|省略)|do not.{0,12}(skip|omit)/i);
});

test("editing a received message clears the stale translation and queues the new source", () => {
	const plugin = createPluginInstance();
	const originalMessage = {
		id: "received-edit",
		channel_id: "channel-edit",
		content: "old source",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(originalMessage, {
		channelId: "channel-edit",
		auto: true,
		content: "旧译文",
		translatedContent: "旧译文",
		originalContent: "old source",
		input: {id: "en"},
		output: {id: "zh-CN"}
	}, {content: "old source", embeds: []});
	plugin.getAutoTranslationChannelState("channel-edit").boundaryMessageId = "999";
	plugin.getAutoTranslationChannelState("channel-edit").initialized = true;
	plugin.getCachedReceivedTranslation = () => null;
	let queued = null;
	plugin.queueAutoTranslateMessage = (message, channel, originalContentData, options) => {
		queued = {message, channel, originalContentData, options};
		return true;
	};
	const editedMessage = Object.assign({}, originalMessage, {content: "new source"});
	const stream = {content: editedMessage};

	plugin.checkMessage(stream, editedMessage, {id: "channel-edit"}, {
		skipAutoQueue: false,
		autoTranslateBoundaryId: "999",
		historicalLoad: false
	});

	assert.equal(plugin.getActiveMessageTranslation(editedMessage, "channel-edit"), null);
	assert.equal(queued.originalContentData.content, "new source");
	assert.equal(queued.options.historicalLoad, false);
});

test("editing a sent translated message retranslates the replacement before submit", async () => {
	const plugin = createPluginInstance();
	plugin.shouldAutoTranslateSentMessage = (_text, _channelId, callback) => callback(true);
	plugin.translateText = (text, place, callback, _forcedOutputLanguage, options) => {
		assert.equal(text, "edited source");
		assert.equal(place, "sent");
		assert.equal(options.channelId, "channel-edit");
		callback("edited translation", {id: "en"}, {id: "zh-CN"});
	};
	plugin.buildSentTranslationMessageValue = (original, translation) => `${translation}\n> ${original}`;
	let submittedArguments = null;

	await plugin.handleEditedMessageSubmit([
		"channel-edit",
		"sent-edit",
		{content: "edited source", allowedMentions: []}
	], (...args) => {
		submittedArguments = args;
		return Promise.resolve("submitted");
	});

	assert.equal(submittedArguments[2].content, "edited translation\n> edited source");
	assert.deepEqual(submittedArguments[2].allowedMentions, []);
});

test("editing a sent message falls back to original text when the plugin stops before translation returns", async () => {
	const plugin = createPluginInstance();
	let translateCallback = null;
	let submittedArguments = null;
	plugin.shouldAutoTranslateSentMessage = (_text, _channelId, callback) => callback(true);
	plugin.translateText = (_text, _place, callback) => {
		translateCallback = callback;
	};
	plugin.buildSentTranslationMessageValue = () => "late edited translation";

	const submission = plugin.handleEditedMessageSubmit([
		"channel-edit-stop",
		"sent-edit-stop",
		{content: "edited original", allowedMentions: []}
	], (...args) => {
		submittedArguments = args;
		return Promise.resolve("submitted");
	});
	plugin.onStop();
	translateCallback("late edited translation", {id: "en"}, {id: "zh-CN"});
	await submission;

	assert.equal(submittedArguments[2].content, "edited original");
	assert.deepEqual(submittedArguments[2].allowedMentions, []);
});

test("legacy received preset no longer overrides manual received auto-translate switches", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslatePreset = "loose";
	plugin.settings.filters.skipMixedReceivedMessages = true;
	plugin.settings.filters.skipSameLanguageReceivedMessages = true;
	plugin.settings.filters.dropSimilarTranslations = true;

	// Mixed-language skipping is intentionally disabled in the plugin (too aggressive, conflicts
	// with protected terms), so the manual switch is ignored and always reads false. The other two
	// manual switches are respected.
	assert.equal(plugin.shouldSkipMixedReceivedMessages(), false);
	assert.equal(plugin.shouldSkipSameLanguageReceivedMessages(), true);
	assert.equal(plugin.shouldDropSimilarTranslations(), true);
});

test("received auto-translate switches can stay off even if a stricter legacy preset is still stored", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslatePreset = "strict";
	plugin.settings.filters.skipMixedReceivedMessages = false;
	plugin.settings.filters.skipSameLanguageReceivedMessages = false;
	plugin.settings.filters.dropSimilarTranslations = false;

	assert.equal(plugin.shouldSkipMixedReceivedMessages(), false);
	assert.equal(plugin.shouldSkipSameLanguageReceivedMessages(), false);
	assert.equal(plugin.shouldDropSimilarTranslations(), false);
});

test("invalid loaded-message time window falls back to the default one-hour setting", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslateLoadedTimeWindow = "bogus";

	assert.equal(plugin.getReceivedAutoTranslateLoadedTimeWindow(), "1h");
	assert.equal(plugin.getReceivedAutoTranslateLoadedTimeWindowMs(), 60 * 60 * 1000);
});

test("received source-language filter keeps only valid unique concrete language ids", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslateSourceLanguages = ["en", "en", "auto", "bogus"];

	assert.deepEqual(plugin.getReceivedAutoTranslateSourceLanguages(), ["en"]);
});

test("sent source-language filter keeps only valid unique concrete language ids", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.autoTranslateSourceLanguages = ["en", "en", "auto", "bogus"];

	assert.deepEqual(plugin.getAutoTranslateSourceLanguages(), ["en"]);
});

test("source-language matcher treats language variants as equivalent in both directions", () => {
	const plugin = createPluginInstance();

	assert.equal(plugin.matchesConfiguredSourceLanguage("en-US", ["en"]), true);
	assert.equal(plugin.matchesConfiguredSourceLanguage("en", ["en-US"]), true);
	assert.equal(plugin.matchesConfiguredSourceLanguage("fr", ["en-US"]), false);
});

test("received translation reject reason honors normalized source-language matching", () => {
	const plugin = createPluginInstance();
	const translation = {
		originalContent: "hello",
		translatedContent: "你好",
		input: {id: "en-US"},
		output: {id: "zh-CN"}
	};

	plugin.settings.filters.receivedAutoTranslateSourceLanguages = ["en"];
	assert.equal(plugin.getAutoTranslatedResultRejectReason(translation, "channel-1"), null);

	plugin.settings.filters.receivedAutoTranslateSourceLanguages = ["zh-CN"];
	assert.equal(plugin.getAutoTranslatedResultRejectReason(translation, "channel-1"), "source_filter");
});

test("received cached-result precheck skips obvious target-language content at the public seam", () => {
	const plugin = createPluginInstance();
	plugin.getLanguageChoice = (direction, place) => {
		if (place == "received" && direction == "output") return "zh-CN";
		if (place == "received" && direction == "input") return "auto";
		return "en";
	};

	assert.equal(plugin.shouldSkipReceivedTranslationBeforeRequest({content: "今天天气真好我们一起出去玩吧", embeds: []}, "channel-1"), true);
});

test("sent auto-translate honors the public same-target guard seam", async () => {
	const plugin = createPluginInstance();
	let guardCalls = 0;
	plugin.shouldSkipSentTranslationForSameTarget = (_text, _channelId, _forcedOutputLanguage, callback) => {
		guardCalls++;
		callback(true, "en");
	};

	const shouldTranslate = await new Promise(resolve => plugin.shouldAutoTranslateSentMessage("hello", "channel-1", resolve));

	assert.equal(guardCalls, 1);
	assert.equal(shouldTranslate, false);
});

test("sent auto-translate source filter uses the configured input language before detection", async () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.autoTranslateSourceLanguages = ["en"];
	plugin.shouldSkipSentTranslationForSameTarget = (_text, _channelId, _forcedOutputLanguage, callback) => callback(false, null);
	plugin.getLanguageChoice = () => "en";
	plugin.detectLanguage = () => {
		throw new Error("configured input language should avoid detectLanguage");
	};

	const shouldTranslate = await new Promise(resolve => plugin.shouldAutoTranslateSentMessage("hello", "channel-1", resolve));

	assert.equal(shouldTranslate, true);
});

test("sent auto-translate source filter accepts detected language variants", async () => {
	const plugin = createPluginInstance();
	let detectCalls = 0;
	plugin.settings.filters.autoTranslateSourceLanguages = ["en"];
	plugin.shouldSkipSentTranslationForSameTarget = (_text, _channelId, _forcedOutputLanguage, callback) => callback(false, null);
	plugin.getLanguageChoice = () => "auto";
	plugin.detectLanguage = (_text, callback) => {
		detectCalls++;
		callback("en-US");
	};

	const shouldTranslate = await new Promise(resolve => plugin.shouldAutoTranslateSentMessage("hello", "channel-1", resolve));

	assert.equal(detectCalls, 1);
	assert.equal(shouldTranslate, true);
});

test("sent translation message builder honors the public send-original decision seam", () => {
	const plugin = createPluginInstance();
	let decisionCalls = 0;
	plugin.shouldSendOriginalInsteadOfSentTranslation = (...args) => {
		decisionCalls++;
		assert.equal(args[0], "hello");
		return true;
	};
	plugin.formatOriginalTextForMessage = () => {
		throw new Error("original formatting should not run when the seam chooses the original text");
	};

	const value = plugin.buildSentTranslationMessageValue("hello", "ni hao", {id: "en"}, {id: "zh-CN"});

	assert.equal(decisionCalls, 1);
	assert.equal(value, "hello");
});

test("sent translation message builder appends formatted original when enabled", () => {
	const plugin = createPluginInstance();
	let formatCalls = 0;
	plugin.settings.general.sendOriginalMessage = true;
	plugin.shouldSendOriginalInsteadOfSentTranslation = () => false;
	plugin.formatOriginalTextForMessage = originalText => {
		formatCalls++;
		return `\n> ${originalText}`;
	};

	const value = plugin.buildSentTranslationMessageValue("hello", "ni hao", {id: "en"}, {id: "zh-CN"});

	assert.equal(formatCalls, 1);
	assert.equal(value, "ni hao\n> hello");
});

test("sent translation message builder keeps plain translation when original attachment is off", () => {
	const plugin = createPluginInstance();
	plugin.settings.general.sendOriginalMessage = false;
	plugin.shouldSendOriginalInsteadOfSentTranslation = () => false;
	plugin.formatOriginalTextForMessage = () => {
		throw new Error("original formatting should stay unused when sendOriginalMessage is off");
	};

	const value = plugin.buildSentTranslationMessageValue("hello", "ni hao", {id: "en"}, {id: "zh-CN"});

	assert.equal(value, "ni hao");
});

test("sent original-vs-translation decision treats punctuation-only differences as the same text", () => {
	const plugin = createPluginInstance();

	assert.equal(
		plugin.shouldSendOriginalInsteadOfSentTranslation("Hello, world! https://example.com", "hello world", {id: "en"}, {id: "zh-CN"}),
		true
	);
});

test("new-only scope skips the messages that are already loaded when a channel session starts", () => {
	const plugin = createPluginInstance();
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const recordedOptions = [];
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	plugin.checkMessage = (_stream, _message, _channel, options) => {
		recordedOptions.push(options);
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: "channel-1"},
				channelStream: [{
					content: {
						id: "100",
						attachments: [],
						content: "hello"
					}
				}]
			}
		}
	});

	assert.equal(recordedOptions.length, 1);
	assert.equal(recordedOptions[0].skipAutoQueue, true);
	assert.equal(plugin.getAutoTranslationChannelState("channel-1").initialized, true);
	assert.equal(plugin.getAutoTranslationChannelState("channel-1").boundaryMessageId, "100");
});

test("new-only scope keeps a delayed historical row out of the live queue after an empty first stream", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	plugin.getCachedReceivedTranslation = () => null;
	plugin.getCachedReceivedSkipDecision = () => null;
	const queuedMessageIds = [];
	plugin.queueAutoTranslateMessage = message => {
		queuedMessageIds.push(message.id);
		return true;
	};
	const channel = {id: "channel-delayed-history", last_message_id: "500"};
	const process = channelStream => plugin.processMessages({instance: {props: {channel, channelStream}}});

	process([]);
	process([{content: {id: "400", channel_id: channel.id, content: "old loaded row", embeds: [], attachments: []}}]);

	assert.deepEqual(queuedMessageIds, []);
	assert.equal(plugin.getAutoTranslationChannelState(channel.id).boundaryMessageId, "500");
});

test("new-only scope still queues a real new message present during the first stream walk", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	const queuedMessageIds = [];
	plugin.queueAutoTranslateMessage = message => {
		queuedMessageIds.push(message.id);
		return true;
	};
	const channel = {id: "channel-first-live", lastMessageId: "500"};

	plugin.processMessages({instance: {props: {
		channel,
		channelStream: [{content: {id: "501", channel_id: channel.id, content: "new live row", embeds: [], attachments: []}}]
	}}});

	assert.deepEqual(queuedMessageIds, ["501"]);
	assert.equal(plugin.getAutoTranslationChannelState(channel.id).boundaryMessageId, "501");
});

test("new-only scope does not finalise an empty session when the channel boundary is unavailable", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	const queuedMessageIds = [];
	plugin.queueAutoTranslateMessage = message => {
		queuedMessageIds.push(message.id);
		return true;
	};
	const channel = {id: "channel-no-boundary"};
	const process = channelStream => plugin.processMessages({instance: {props: {channel, channelStream}}});

	process([]);
	assert.equal(plugin.getAutoTranslationChannelState(channel.id).initialized, false);

	process([{content: {id: "400", channel_id: channel.id, content: "first loaded baseline", embeds: [], attachments: []}}]);
	assert.deepEqual(queuedMessageIds, []);
	assert.equal(plugin.getAutoTranslationChannelState(channel.id).initialized, true);
	assert.equal(plugin.getAutoTranslationChannelState(channel.id).boundaryMessageId, "400");
});

test("loaded-messages scope allows the currently loaded messages to enter the auto-translate flow", () => {
	const plugin = createPluginInstance();
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const recordedOptions = [];
	plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
	plugin.checkMessage = (_stream, _message, _channel, options) => {
		recordedOptions.push(options);
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: "channel-2"},
				channelStream: [{
					content: {
						id: "200",
						attachments: [],
						content: "hello"
					}
				}]
			}
		}
	});

	assert.equal(recordedOptions.length, 1);
	assert.equal(recordedOptions[0].skipAutoQueue, false);
	assert.equal(plugin.getAutoTranslationChannelState("channel-2").initialized, true);
	assert.equal(plugin.getAutoTranslationChannelState("channel-2").boundaryMessageId, "200");
});

test("newly loaded older messages are collected without forcing a Discord rerender", () => {
	const plugin = createPluginInstance();
	const recordedOptions = [];
	let rerenderCount = 0;
	plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
	plugin.checkMessage = (_stream, message, _channel, options) => {
		recordedOptions.push({messageId: message.id, options});
	};
	plugin.scheduleTranslationRerender = () => {
		rerenderCount++;
	};
	const process = channelStream => plugin.processMessages({
		instance: {
			props: {
				channel: {id: "channel-scroll"},
				channelStream
			}
		}
	});
	const streamEntry = id => ({content: {id, attachments: [], content: `message ${id}`}});

	process([streamEntry("200")]);
	recordedOptions.length = 0;
	process([streamEntry("100"), streamEntry("200")]);

	const older = recordedOptions.find(item => item.messageId == "100");
	const existing = recordedOptions.find(item => item.messageId == "200");
	assert.equal(older.options.historicalLoad, true);
	assert.equal(existing.options.historicalLoad, false);
	assert.equal(rerenderCount, 0);
});

test("new-only scope does not queue visible reply preview translations during the first channel render", () => {
	const plugin = createPluginInstance();
	let queuedCount = 0;
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	plugin.getCachedReceivedTranslation = () => null;
	plugin.queueReplyPreviewTranslation = () => {
		queuedCount++;
	};

	plugin.processMessageReply({
		instance: {
			props: {
				baseMessage: {channel_id: "channel-3"},
				referencedMessage: {
					message: {
						id: "reply-1",
						content: "hello",
						author: {id: "other-user"}
					}
				}
			}
		}
	});

	assert.equal(queuedCount, 0);
});

test("loaded-messages scope can still queue visible reply preview translations immediately", () => {
	const plugin = createPluginInstance();
	let queuedCount = 0;
	plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
	plugin.settings.general.showOriginalInReplyPreview = true;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.shouldAutoTranslateReplyPreview = () => true;
	plugin.queueReplyPreviewTranslation = () => {
		queuedCount++;
	};

	plugin.processMessageReply({
		instance: {
			props: {
				baseMessage: {channel_id: "channel-4"},
				referencedMessage: {
					message: {
						id: "reply-2",
						content: "hello",
						author: {id: "other-user"}
					}
				}
			}
		}
	});

	assert.equal(queuedCount, 1);
});

test("same-language received auto-translation caches are dropped instead of being reused", () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-zh"};
	const message = {
		id: "message-zh-cache",
		content: "估计是阿三修出bug了",
		embeds: [],
		author: {id: "other-user"}
	};

	plugin.settings.choices.received.output = "zh-CN";
	plugin.getLanguageChoice = (direction, place) => {
		if (place == "received" && direction == "output") return "zh-CN";
		if (place == "received" && direction == "input") return "auto";
		return "en";
	};

	const originalContentData = plugin.extractOriginalContentData(message);
	const signature = plugin.createReceivedTranslationSignature(message, channel.id, originalContentData);
	plugin.persistTranslationCacheEntry(message.id, signature, {
		signature,
		channelId: channel.id,
		auto: true,
		content: "估计是阿三修bug了",
		translatedContent: "估计是阿三修bug了",
		originalContent: originalContentData.content,
		input: {id: "zh-CN"},
		output: {id: "zh-CN"}
	});

	assert.equal(plugin.shouldSkipReceivedTranslationBeforeRequest(originalContentData, channel.id), true);
	assert.equal(plugin.getCachedReceivedTranslation(message, channel.id, originalContentData), null);
});

test("active auto translations identical to the original are removed before render decoration", () => {
	const plugin = createPluginInstance();
	const message = {
		id: "message-identical-display",
		channel_id: "channel-identical-display",
		content: "Hello everyone!",
		embeds: [],
		author: {id: "other-user"}
	};

	plugin.applyStoredTranslationToMessage(message, {
		channelId: message.channel_id,
		auto: true,
		content: "Hello everyone!",
		translatedContent: "Hello everyone!",
		originalContent: "Hello everyone!",
		input: {id: "auto"},
		output: {id: "en"}
	});

	assert.equal(plugin.getActiveMessageTranslation(message, message.channel_id), null);
});

function createChannelTogglePluginWithExplicitChannels() {
	const persisted = {
		translationEnabledStates: {
			globalDefault: false,
			channelOverrides: {
				"channel-target": true,
				"channel-other": true
			}
		},
		receivedAutoTranslationEnabledStates: {
			globalDefault: false,
			channelOverrides: {
				"channel-target": true,
				"channel-other": true
			}
		}
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ArrayUtils: {
				is: Array.isArray
			},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = Array.isArray(value) ? value.slice() : JSON.parse(JSON.stringify(value));
				}
			}
		},
		mutatePlugin(instance) {
			instance.clearLoadedAutoTranslationStatus = () => {};
			instance.resetAutoTranslationTracking = () => {};
			instance.scheduleTranslationRerender = () => {};
			instance.processAutoTranslationQueue = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
			instance.isReceivedAutoTranslationEnabled = Object.getPrototypeOf(instance).isReceivedAutoTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();
	return {plugin, persisted};
}

test("toggling a channel off restores every displayed translation only in that channel", async () => {
	const {plugin} = createChannelTogglePluginWithExplicitChannels();
	const autoTargetMessage = {
		id: "toggle-auto-target",
		channel_id: "channel-target",
		content: "Top up at half price",
		embeds: [],
		author: {id: "other-user"}
	};
	const autoOtherMessage = {
		id: "toggle-auto-other",
		channel_id: "channel-other",
		content: "Other channel original",
		embeds: [],
		author: {id: "other-user"}
	};
	const manualTargetMessage = {
		id: "toggle-manual-target",
		channel_id: "channel-target",
		content: "Manual original",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(autoTargetMessage, {
		channelId: "channel-target",
		auto: true,
		content: "半价充值",
		translatedContent: "半价充值",
		originalContent: "Top up at half price",
		embeds: {}
	});
	plugin.applyStoredTranslationToMessage(autoOtherMessage, {
		channelId: "channel-other",
		auto: true,
		content: "其他频道译文",
		translatedContent: "其他频道译文",
		originalContent: "Other channel original",
		embeds: {}
	});
	plugin.applyStoredTranslationToMessage(manualTargetMessage, {
		channelId: "channel-target",
		auto: false,
		manual: true,
		independentOfTextAreaSwitch: true,
		content: "手动译文",
		translatedContent: "手动译文",
		originalContent: "Manual original",
		embeds: {}
	});

	await plugin.toggleTranslation("channel-target");

	assert.equal(plugin.getActiveMessageTranslation(autoTargetMessage, "channel-target"), null);
	assert.equal(plugin.getActiveMessageTranslation(autoOtherMessage, "channel-other").translatedContent, "其他频道译文");
	assert.equal(plugin.getActiveMessageTranslation(manualTargetMessage, "channel-target"), null);

	const autoTargetEvent = {
		instance: {
			props: {
				message: autoTargetMessage
			}
		},
		returnvalue: {
			props: {
				children: []
			}
		}
	};

	plugin.processMessageContent(autoTargetEvent);

	assert.equal(autoTargetEvent.instance.props.message.content, "Top up at half price");
	assert.deepEqual(autoTargetEvent.returnvalue.props.children, []);
});

test("manual translation after channel disable reuses the retained cached result", async () => {
	const {plugin} = createChannelTogglePluginWithExplicitChannels();
	plugin.settings.choices.received.output = "zh-CN";
	const channel = {id: "channel-target"};
	const message = {
		id: "toggle-manual-cache",
		channel_id: channel.id,
		content: "Manual cache source",
		embeds: [],
		author: {id: "other-user"}
	};
	const originalContentData = plugin.extractOriginalContentData(message);
	const signature = plugin.createReceivedTranslationSignature(message, channel.id, originalContentData);
	const storedTranslation = {
		signature,
		channelId: channel.id,
		auto: false,
		manual: true,
		content: "手动缓存译文",
		translatedContent: "手动缓存译文",
		originalContent: message.content,
		embeds: {},
		input: {id: "en"},
		output: {id: "zh-CN"}
	};
	plugin.persistTranslationCacheEntry(message.id, signature, storedTranslation);
	plugin.applyStoredTranslationToMessage(message, storedTranslation, originalContentData);

	await plugin.toggleTranslation(channel.id);

	assert.equal(plugin.getActiveMessageTranslation(message, channel.id), null);
	assert.equal(plugin.hasCachedTranslationEntry(message.id), true);
	plugin.translateText = () => {throw new Error("a retained cache hit must not call the provider");};

	assert.equal(await plugin.translateMessage(message, channel, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false}), true);
	assert.equal(plugin.getActiveMessageTranslation(message, channel.id).translatedContent, "手动缓存译文");
});

test("toggling a channel off restores a rendered automatic translation back to its original message", () => {
	const {plugin} = createChannelTogglePluginWithExplicitChannels();
	const originalMessage = {
		id: "toggle-rendered-auto-target",
		channel_id: "channel-target",
		content: "Welcome to the learning hub",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(originalMessage, {
		channelId: "channel-target",
		auto: true,
		content: "欢迎来到学习中心",
		translatedContent: "欢迎来到学习中心",
		originalContent: originalMessage.content,
		embeds: {}
	});
	const renderedTranslatedMessage = Object.assign({}, originalMessage, {
		content: "欢迎来到学习中心"
	});

	plugin.toggleTranslation("channel-target");
	const event = {
		instance: {props: {message: renderedTranslatedMessage}},
		returnvalue: {props: {children: []}}
	};
	plugin.processMessageContent(event);

	assert.equal(event.instance.props.message.content, "Welcome to the learning hub");
});

test("restored original content is used when an enabled channel queues translation again", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
	plugin.isTranslationEnabled = () => true;
	plugin.isOwnMessage = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.isLikelyLiveAutoTranslateMessage = () => false;
	const originalMessage = {
		id: "restore-before-requeue",
		channel_id: "channel-target",
		content: "Welcome to the learning hub",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(originalMessage, {
		channelId: "channel-target",
		auto: true,
		content: "欢迎来到学习中心",
		translatedContent: "欢迎来到学习中心",
		originalContent: originalMessage.content,
		embeds: {}
	});
	plugin.clearDisplayedAutoTranslations("channel-target");
	let queuedContent = null;
	plugin.queueAutoTranslateMessage = message => {
		queuedContent = message.content;
		return true;
	};
	const event = {
		instance: {
			props: {
				message: Object.assign({}, originalMessage, {content: "欢迎来到学习中心"})
			}
		},
		returnvalue: {props: {children: []}}
	};

	plugin.processMessageContent(event);

	assert.equal(event.instance.props.message.content, originalMessage.content);
	assert.equal(queuedContent, originalMessage.content);
});

test("toggling a channel off clears only automatic reply preview translations in that channel", () => {
	const {plugin} = createChannelTogglePluginWithExplicitChannels();
	plugin.settings.general.showOriginalInReplyPreview = true;
	const targetReplyMessage = {
		id: "reply-toggle-target",
		channel_id: "channel-target",
		content: "Target reply original",
		embeds: [],
		author: {id: "other-user"}
	};
	const otherReplyMessage = {
		id: "reply-toggle-other",
		channel_id: "channel-other",
		content: "Other reply original",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(targetReplyMessage, {
		channelId: "channel-target",
		auto: true,
		content: "目标回复译文",
		translatedContent: "目标回复译文",
		originalContent: "Target reply original",
		embeds: {}
	});
	plugin.applyStoredTranslationToMessage(otherReplyMessage, {
		channelId: "channel-other",
		auto: true,
		content: "其他回复译文",
		translatedContent: "其他回复译文",
		originalContent: "Other reply original",
		embeds: {}
	});

	plugin.toggleTranslation("channel-target");

	const targetEvent = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-target"},
				referencedMessage: {
					message: targetReplyMessage
				}
			}
		}
	};
	const otherEvent = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-other"},
				referencedMessage: {
					message: otherReplyMessage
				}
			}
		}
	};

	plugin.processMessageReply(targetEvent);
	plugin.processMessageReply(otherEvent);

	assert.equal(targetEvent.instance.props.referencedMessage.message.content, "Target reply original");
	assert.equal(otherEvent.instance.props.referencedMessage.message.content, "其他回复译文");
});

test("toggling a channel off restores a manual embed translation only in that channel", () => {
	const {plugin} = createChannelTogglePluginWithExplicitChannels();
	const targetMessage = {
		id: "embed-toggle-target",
		channel_id: "channel-target",
		content: "Target message",
		embeds: [],
		author: {id: "other-user"}
	};
	const otherMessage = {
		id: "embed-toggle-other",
		channel_id: "channel-other",
		content: "Other message",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(targetMessage, {
		channelId: "channel-target",
		auto: false,
		manual: true,
		content: "目标消息译文",
		translatedContent: "目标消息译文",
		originalContent: "Target message",
		embeds: {
			"embed-target": {
				title: "目标标题",
				description: "目标描述",
				fields: [{name: "目标字段", value: "目标值"}],
				footerText: "目标脚注"
			}
		}
	});
	plugin.applyStoredTranslationToMessage(otherMessage, {
		channelId: "channel-other",
		auto: true,
		content: "其他消息译文",
		translatedContent: "其他消息译文",
		originalContent: "Other message",
		embeds: {
			"embed-other": {
				title: "其他标题",
				description: "其他描述",
				fields: [{name: "其他字段", value: "其他值"}],
				footerText: "其他脚注"
			}
		}
	});

	const targetEvent = {
		instance: {
			props: {
				embed: {
					id: "embed-target",
					message_id: "embed-toggle-target",
					rawDescription: "Target original description",
					rawTitle: "Target original title",
					fields: [{rawName: "Target original field", rawValue: "Target original value"}],
					footer: {text: "Target original footer"}
				}
			}
		}
	};
	const otherEvent = {
		instance: {
			props: {
				embed: {
					id: "embed-other",
					message_id: "embed-toggle-other",
					rawDescription: "Other original description",
					rawTitle: "Other original title",
					fields: [{rawName: "Other original field", rawValue: "Other original value"}],
					footer: {text: "Other original footer"}
				}
			}
		}
	};

	plugin.processEmbed(targetEvent);
	plugin.processEmbed(otherEvent);
	plugin.toggleTranslation("channel-target");
	plugin.processEmbed(targetEvent);
	plugin.processEmbed(otherEvent);

	assert.equal(targetEvent.instance.props.embed.rawDescription, "Target original description");
	assert.equal(targetEvent.instance.props.embed.rawTitle, "Target original title");
	assert.deepEqual(targetEvent.instance.props.embed.fields, [{rawName: "Target original field", rawValue: "Target original value"}]);
	assert.deepEqual(targetEvent.instance.props.embed.footer, {text: "Target original footer"});
	assert.equal(otherEvent.instance.props.embed.rawDescription, "其他描述");
	assert.equal(otherEvent.instance.props.embed.rawTitle, "其他标题");
	assert.deepEqual(otherEvent.instance.props.embed.fields, [{rawName: "其他字段", rawValue: "其他值"}]);
	assert.deepEqual(otherEvent.instance.props.embed.footer, {text: "其他脚注"});
});

test("disabled channel auto-translation leaves reply previews untouched", () => {
	const plugin = createPluginInstance();
	const originalContent = "Hola amigo\n> hello friend";
	plugin.isTranslationEnabled = () => false;
	plugin.getCachedReceivedTranslation = () => {
		throw new Error("reply preview should not read translation cache while disabled");
	};
	plugin.queueReplyPreviewTranslation = () => {
		throw new Error("reply preview should not queue translation while disabled");
	};

	const event = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-disabled"},
				referencedMessage: {
					message: {
						id: "reply-disabled",
						content: originalContent,
						author: {id: "other-user"}
					}
				}
			}
		}
	};

	plugin.processMessageReply(event);

	assert.equal(event.instance.props.referencedMessage.message.content, originalContent);
});

test("disabled channel auto-translation hides stored reply preview translations", () => {
	const plugin = createPluginInstance();
	const originalContent = "Top up at half price";
	const referencedMessage = {
		id: "reply-stored-disabled",
		channel_id: "channel-disabled",
		content: originalContent,
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(referencedMessage, {
		channelId: "channel-disabled",
		auto: true,
		content: "半价充值",
		translatedContent: "半价充值",
		originalContent,
		embeds: {}
	});
	plugin.isTranslationEnabled = () => false;

	const event = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-disabled"},
				referencedMessage: {
					message: referencedMessage
				}
			}
		}
	};

	plugin.processMessageReply(event);

	assert.equal(event.instance.props.referencedMessage.message.content, originalContent);
});

test("enabled channel reply previews show the stored translated text when preview translation display is on", () => {
	const plugin = createPluginInstance();
	const originalContent = "Top up at half price";
	const translatedContent = "半价充值";
	plugin.settings.general.showOriginalInReplyPreview = true;
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const referencedMessage = {
		id: "reply-stored-enabled",
		channel_id: "channel-enabled",
		content: originalContent,
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(referencedMessage, {
		channelId: "channel-enabled",
		auto: true,
		content: translatedContent,
		translatedContent,
		originalContent,
		embeds: {}
	});

	const event = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-enabled"},
				referencedMessage: {
					message: referencedMessage
				}
			}
		}
	};

	plugin.processMessageReply(event);

	assert.equal(event.instance.props.referencedMessage.message.content, translatedContent);
});

test("disabled channel auto-translation restores stale automatic message content", () => {
	const plugin = createPluginInstance();
	const message = {
		id: "stale-auto-disabled",
		channel_id: "channel-disabled",
		content: "Top up at half price",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-disabled",
		auto: true,
		content: "半价充值",
		translatedContent: "半价充值",
		originalContent: "Top up at half price",
		embeds: {}
	});
	plugin.isTranslationEnabled = () => false;

	const event = {
		instance: {
			props: {
				message
			}
		},
		returnvalue: {
			props: {
				children: []
			}
		}
	};

	plugin.processMessageContent(event);

	assert.equal(event.instance.props.message.content, "Top up at half price");
	assert.deepEqual(event.returnvalue.props.children, []);
});

test("translated embeds reuse the stored embed translation data on the no-returnvalue path", () => {
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const message = {
		id: "embed-message-1",
		channel_id: "channel-embed",
		content: "hello",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-embed",
		auto: true,
		content: "你好",
		translatedContent: "你好",
		originalContent: "hello",
		embeds: {
			"embed-1": {
				title: "翻译标题",
				description: "翻译描述",
				fields: [{name: "翻译字段", value: "翻译值"}],
				footerText: "翻译脚注"
			}
		}
	});

	const event = {
		instance: {
			props: {
				embed: {
					id: "embed-1",
					message_id: "embed-message-1",
					rawDescription: "original description",
					rawTitle: "original title",
					fields: [{rawName: "original field", rawValue: "original value"}],
					footer: {text: "original footer"}
				}
			}
		}
	};

	plugin.processEmbed(event);

	assert.equal(event.instance.props.embed.rawDescription, "翻译描述");
	assert.equal(event.instance.props.embed.rawTitle, "翻译标题");
	assert.deepEqual(event.instance.props.embed.fields, [{rawName: "翻译字段", rawValue: "翻译值"}]);
	assert.deepEqual(event.instance.props.embed.footer, {text: "翻译脚注"});
	assert.equal(event.instance.props.embed.originalDescription, "original description");
	assert.equal(event.instance.props.embed.originalTitle, "original title");
});

test("checkMessage reuses a visible stored translation in the channel stream without requeueing", () => {
	const plugin = createPluginInstance();
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const message = {
		id: "stream-visible-1",
		channel_id: "channel-stream",
		content: "hello world",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	const stream = {
		content: {
			id: "stream-visible-1",
			attachments: [],
			content: "hello world"
		}
	};
	let queuedCount = 0;
	plugin.queueAutoTranslateMessage = () => {
		queuedCount++;
	};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-stream",
		auto: true,
		content: "你好，世界",
		translatedContent: "你好，世界",
		originalContent: "hello world",
		embeds: {}
	});

	plugin.checkMessage(stream, message, {id: "channel-stream"}, {
		skipAutoQueue: false,
		historicalLoad: false
	});

	assert.equal(stream.content.content, "你好，世界");
	assert.equal(queuedCount, 0);
});

test("historical loaded messages outside the configured time window are skipped", () => {
	const plugin = createPluginInstance();
	let processCount = 0;
	plugin.settings.filters.receivedAutoTranslateLoadedTimeWindow = "15m";
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.processAutoTranslationQueue = () => {
		processCount++;
	};

	plugin.queueAutoTranslateMessage({
		id: "history-1",
		content: "hello",
		timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		author: {id: "other-user"}
	}, {id: "channel-5"}, {content: "hello"}, {
		historicalLoad: true,
		deferWhileReading: true
	});

	assert.equal(processCount, 0);
});

test("live cached queue items commit to the display store without calling translateMessage", () => {
	const plugin = createPluginInstance();
	let committedResult = null;
	let translateCalls = 0;
	const message = {
		id: "cached-live-1",
		channel_id: "channel-cached-live",
		content: "hello world",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("cached automatic results must not write the legacy display map");};
	plugin.commitReceivedDisplayResult = async result => {
		committedResult = result;
		return {confirmedIds: [String(result.messageId)], missingIds: [], fallbackUsed: false};
	};
	plugin.translateMessage = () => {
		translateCalls++;
		return Promise.resolve(true);
	};

	plugin.queueAutoTranslateMessage(message, {id: "channel-cached-live"}, {content: "hello world"}, {
		cachedTranslation: {
			content: "你好，世界",
			translatedContent: "你好，世界",
			originalContent: "hello world"
		},
		historicalLoad: false
	});

	assert.equal(translateCalls, 0);
	assert.equal(committedResult && committedResult.channelId, "channel-cached-live");
	assert.equal(committedResult && committedResult.status, "translated");
	assert.equal(committedResult && committedResult.translation.auto, true);
	assert.equal(committedResult && committedResult.translation.translatedContent, "你好，世界");
});

test("finishing a manual translation resumes live auto-translation queue work", async () => {
	const plugin = createPluginInstance();
	let finishManualRequest = null;
	let liveTranslateCalls = 0;
	plugin.settings.engines.translator = "googleapi";
	plugin.settings.engines.backup = "----";
	plugin.getLanguageChoice = direction => direction == "input" ? "auto" : "zh-CN";
	plugin.googleApiTranslate = (_data, callback) => {
		finishManualRequest = callback;
	};
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;

	plugin.translateText("manual translation", "received", () => {}, null, {
		showToast: false,
		showFailureToast: false,
		trackBusy: true,
		channelId: "channel-manual-busy"
	});
	assert.equal(typeof finishManualRequest, "function");

	plugin.translateMessage = () => {
		liveTranslateCalls++;
		return Promise.resolve(true);
	};
	plugin.queueAutoTranslateMessage({
		id: "live-after-manual-1",
		channel_id: "channel-manual-busy",
		content: "live after manual",
		embeds: [],
		author: {id: "other-user"}
	}, {id: "channel-manual-busy"}, {content: "live after manual"});
	await new Promise(resolve => setTimeout(resolve, 0));
	assert.equal(liveTranslateCalls, 0);

	finishManualRequest("手动翻译结果");
	await new Promise(resolve => setTimeout(resolve, 0));
	assert.equal(liveTranslateCalls, 1);
});

test("live cached automatic translations commit to the display store without a legacy rerender", async () => {
	const plugin = createPluginInstance();
	let rerenderOptions = null;
	let committedResult = null;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => ({
		content: "即时译文",
		translatedContent: "即时译文",
		originalContent: "live original",
		embeds: {}
	});
	plugin.applyStoredTranslationToMessage = () => {throw new Error("live automatic results must not write the legacy display map");};
	plugin.commitReceivedDisplayResult = async result => {
		committedResult = result;
		return {confirmedIds: [String(result.messageId)], missingIds: [], fallbackUsed: false};
	};
	plugin.scheduleTranslationRerender = options => {
		rerenderOptions = options;
	};

	const result = await plugin.translateMessage({
		id: "live-rerender-1",
		channel_id: "channel-live-rerender",
		content: "live original",
		embeds: [],
		author: {id: "other-user"}
	}, {id: "channel-live-rerender"}, {
		auto: true,
		silent: true,
		trackBusy: false
	});

	assert.equal(result, true);
	assert.equal(rerenderOptions, null);
	assert.equal(committedResult && committedResult.messageId, "live-rerender-1");
	assert.equal(committedResult && committedResult.status, "translated");
	assert.equal(committedResult && committedResult.translation.translatedContent, "即时译文");
});

test("live translateMessage forwards the automatic flag to translateText", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-live-auto-option"};
	const message = {
		id: "live-auto-option-1",
		channel_id: channel.id,
		content: "hello world",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	let translateOptions = null;
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.translateText = (_text, _place, callback, _forcedOutputLanguage, options) => {
		translateOptions = options;
		callback("", {id: "en"}, {id: "zh-CN"}, {skipped: true});
	};

	await plugin.translateMessage(message, channel, {
		auto: true,
		silent: true,
		trackBusy: false
	});

	assert.equal(translateOptions.auto, true);
});

test("live batched translation rerenders add no more than 200ms display delay", () => {
	const plugin = createPluginInstance();
	const originalSetTimeout = global.setTimeout;
	let scheduledDelay = null;
	plugin.isViewingMessageHistory = () => false;
	plugin.isChannelTextAreaFocused = () => false;
	plugin.rerenderMessagesWithScrollPreserved = () => {};
	global.setTimeout = (_callback, delay) => {
		scheduledDelay = delay;
		return 1;
	};

	try {
		plugin.scheduleTranslationRerender({batched: true, allowWhileTyping: true});
	}
	finally {
		global.setTimeout = originalSetTimeout;
	}

	assert.equal(scheduledDelay <= 200, true);
});

test("live auto-translation results are ignored after plugin stop", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-live-stop"};
	const message = {
		id: "live-stop-1",
		channel_id: channel.id,
		content: "hello after stop",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	let finishRequest = null;
	let applyCount = 0;
	let cacheWriteCount = 0;
	let rerenderCount = 0;
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.getAutoTranslatedResultRejectReason = () => null;
	plugin.isTranslationResultTooSimilar = () => false;
	plugin.translateText = (_text, _place, callback) => {
		finishRequest = callback;
	};
	plugin.applyStoredTranslationToMessage = () => {
		applyCount++;
		return {};
	};
	plugin.persistTranslationCacheEntry = () => {
		cacheWriteCount++;
	};
	plugin.scheduleTranslationRerender = () => {
		rerenderCount++;
	};
	plugin.cancelHistoricalTranslationJobs = () => {};
	plugin.clearChannelTitleTranslations = () => {};
	plugin.detachAutoTranslationInputActivityWatcher = () => {};
	plugin.detachAutoTranslationScrollWatcher = () => {};
	plugin.clearDisplayedTranslations = () => {};
	plugin.clearLoadedAutoTranslationStatus = () => {};
	plugin.forceUpdateAll = () => {};

	plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
	assert.equal(typeof finishRequest, "function");

	plugin.onStop();
	finishRequest("停止后的旧译文", {id: "en"}, {id: "zh-CN"});
	await new Promise(resolve => setImmediate(resolve));

	assert.equal(applyCount, 0);
	assert.equal(cacheWriteCount, 0);
	assert.equal(rerenderCount, 0);
});

test("live auto-translation results are ignored after clearing the channel queue", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-live-clear"};
	const message = {
		id: "live-clear-1",
		channel_id: channel.id,
		content: "hello before clear",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	let finishRequest = null;
	let applyCount = 0;
	let cacheWriteCount = 0;
	let rerenderCount = 0;
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.getAutoTranslatedResultRejectReason = () => null;
	plugin.isTranslationResultTooSimilar = () => false;
	plugin.translateText = (_text, _place, callback) => {
		finishRequest = callback;
	};
	plugin.applyStoredTranslationToMessage = () => {
		applyCount++;
		return {};
	};
	plugin.persistTranslationCacheEntry = () => {
		cacheWriteCount++;
	};
	plugin.scheduleTranslationRerender = () => {
		rerenderCount++;
	};

	plugin.queueAutoTranslateMessage(message, channel, {content: message.content, embeds: []});
	assert.equal(typeof finishRequest, "function");

	plugin.clearAutoTranslationQueue(channel.id);
	finishRequest("清理后的旧译文", {id: "en"}, {id: "zh-CN"});
	await new Promise(resolve => setImmediate(resolve));

	assert.equal(applyCount, 0);
	assert.equal(cacheWriteCount, 0);
	assert.equal(rerenderCount, 0);
});

test("editing a live source invalidates the stale result and keeps the replacement pending", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-live-edit"};
	const originalMessage = {
		id: "100",
		channel_id: channel.id,
		content: "old live source",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	const requestCallbacks = [];
	const committedTranslations = [];
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.getAutoTranslatedResultRejectReason = () => null;
	plugin.isTranslationResultTooSimilar = () => false;
	plugin.translateText = (_text, _place, callback) => {
		requestCallbacks.push(callback);
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("live automatic results must not write the legacy display map");};
	plugin.commitReceivedDisplayResult = async result => {
		committedTranslations.push({messageId: result.messageId, translated: result.translation && result.translation.translatedContent});
		return {confirmedIds: [String(result.messageId)], missingIds: [], fallbackUsed: false};
	};
	plugin.persistTranslationCacheEntry = () => {};
	plugin.scheduleTranslationRerender = () => {};

	plugin.queueAutoTranslateMessage(originalMessage, channel, {content: originalMessage.content, embeds: []});
	assert.equal(requestCallbacks.length, 1);

	const channelState = plugin.getAutoTranslationChannelState(channel.id);
	channelState.initialized = true;
	channelState.boundaryMessageId = "999";
	const editedMessage = Object.assign({}, originalMessage, {content: "new live source"});
	plugin.checkMessage({content: editedMessage}, editedMessage, channel, {
		skipAutoQueue: false,
		autoTranslateBoundaryId: "999",
		historicalLoad: false
	});

	requestCallbacks[0]("旧译文", {id: "en"}, {id: "zh-CN"});
	await new Promise(resolve => setImmediate(resolve));

	assert.equal(requestCallbacks.length, 2);
	assert.deepEqual(committedTranslations, []);
	assert.equal(plugin.isMessageTranslationPending(originalMessage.id, channel.id), true);

	requestCallbacks[1]("新译文", {id: "en"}, {id: "zh-CN"});
	await new Promise(resolve => setImmediate(resolve));

	assert.deepEqual(committedTranslations, [{messageId: "100", translated: "新译文"}]);
});

test("direct live auto translation releases its request when translateText throws", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-live-throw"};
	const message = {
		id: "live-throw-1",
		channel_id: channel.id,
		content: "throwing source",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.translateText = () => {
		throw new Error("provider setup failed");
	};

	const result = await plugin.translateMessage(message, channel, {
		auto: true,
		silent: true,
		trackBusy: false
	});
	const editedMessage = Object.assign({}, message, {content: "changed after failure"});
	const editedContentData = plugin.extractOriginalContentData(editedMessage);
	const editedSignature = plugin.createReceivedTranslationSignature(editedMessage, channel.id, editedContentData);

	assert.equal(result, false);
	assert.equal(plugin.invalidateLiveTranslationMessage(message.id, channel.id, editedSignature), false);
});

test("direct live auto translation releases its request when result handling throws", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-live-handler-throw"};
	const message = {
		id: "live-handler-throw-1",
		channel_id: channel.id,
		content: "handler failure source",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.getAutoTranslatedResultRejectReason = () => null;
	plugin.isTranslationResultTooSimilar = () => false;
	plugin.translateText = (_text, _place, callback) => {
		callback("处理中的译文", {id: "en"}, {id: "zh-CN"});
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("live automatic results must not write the legacy display map");};
	plugin.commitReceivedDisplayResult = async () => {
		throw new Error("render state failed");
	};

	const result = await plugin.translateMessage(message, channel, {
		auto: true,
		silent: true,
		trackBusy: false
	});
	const editedMessage = Object.assign({}, message, {content: "changed after handler failure"});
	const editedContentData = plugin.extractOriginalContentData(editedMessage);
	const editedSignature = plugin.createReceivedTranslationSignature(editedMessage, channel.id, editedContentData);

	assert.equal(result, false);
	assert.equal(plugin.invalidateLiveTranslationMessage(message.id, channel.id, editedSignature), false);
});

test("late auto-translation results are ignored after the channel toggle is disabled", async () => {
	const plugin = createPluginInstance();
	let enabled = true;
	let applyCount = 0;
	plugin.isTranslationEnabled = () => enabled;
	plugin.applyStoredTranslationToMessage = () => {
		applyCount++;
		return {};
	};
	plugin.persistTranslationCacheEntry = () => {};
	plugin.scheduleTranslationRerender = () => {};
	plugin.translateText = (_text, _place, callback) => {
		enabled = false;
		callback("你好，世界", {id: "en"}, {id: "zh-CN"});
	};

	const result = await plugin.translateMessage({
		id: "late-auto-1",
		content: "hello world",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	}, {id: "channel-late-auto"}, {
		auto: true,
		silent: true,
		trackBusy: false
	});

	assert.equal(result, false);
	assert.equal(applyCount, 0);
});

test("manual untranslate suppresses cached auto translations during message refresh", async () => {
	const plugin = createPluginInstance();
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const message = {
		id: "suppressed-cache-1",
		channel_id: "channel-suppressed",
		content: "hello world",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	plugin.scheduleTranslationRerender = () => {};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-suppressed",
		auto: true,
		content: "你好，世界",
		translatedContent: "你好，世界",
		originalContent: "hello world",
		embeds: {}
	});

	await plugin.translateMessage(message, {id: "channel-suppressed"});

	let cacheReadCount = 0;
	let queuedCount = 0;
	plugin.getCachedReceivedTranslation = () => {
		cacheReadCount++;
		return {
			signature: "cached-signature",
			channelId: "channel-suppressed",
			auto: true,
			content: "你好，世界",
			translatedContent: "你好，世界",
			originalContent: "hello world",
			embeds: {}
		};
	};
	plugin.queueAutoTranslateMessage = () => {
		queuedCount++;
	};

	const stream = {
		content: {
			id: "suppressed-cache-1",
			attachments: [],
			content: "hello world"
		}
	};

	plugin.checkMessage(stream, message, {id: "channel-suppressed"}, {
		skipAutoQueue: false,
		historicalLoad: false
	});

	assert.equal(cacheReadCount, 0);
	assert.equal(queuedCount, 0);
	assert.equal(stream.content.content, "hello world");
});

test("manual untranslate suppresses cached reply preview translations", async () => {
	const plugin = createPluginInstance();
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const referencedMessage = {
		id: "reply-suppressed-1",
		channel_id: "channel-reply-suppressed",
		content: "hello world",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	plugin.scheduleTranslationRerender = () => {};
	plugin.applyStoredTranslationToMessage(referencedMessage, {
		channelId: "channel-reply-suppressed",
		auto: true,
		content: "你好，世界",
		translatedContent: "你好，世界",
		originalContent: "hello world",
		embeds: {}
	});

	await plugin.translateMessage(referencedMessage, {id: "channel-reply-suppressed"});

	plugin.getCachedReceivedTranslation = () => {
		throw new Error("suppressed reply preview should not read cached translations");
	};
	plugin.queueReplyPreviewTranslation = () => {
		throw new Error("suppressed reply preview should not queue a new translation");
	};

	const event = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-reply-suppressed"},
				referencedMessage: {
					message: referencedMessage
				}
			}
		}
	};

	plugin.processMessageReply(event);

	assert.equal(event.instance.props.referencedMessage.message.content, "hello world");
});

test("manual message translations stay visible in reply previews even when incoming auto-translate is off", () => {
	const plugin = createPluginInstance();
	const referencedMessage = {
		id: "reply-manual-1",
		channel_id: "channel-reply-manual",
		content: "hello world",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(referencedMessage, {
		channelId: "channel-reply-manual",
		auto: false,
		content: "你好，世界",
		translatedContent: "你好，世界",
		originalContent: "hello world",
		embeds: {}
	});
	plugin.isTranslationEnabled = () => false;

	const event = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-reply-manual"},
				referencedMessage: {
					message: referencedMessage
				}
			}
		}
	};

	plugin.processMessageReply(event);

	assert.equal(event.instance.props.referencedMessage.message.content, "你好，世界");
});

test("reply preview ignores a late translation after plugin stop", () => {
	const plugin = createPluginInstance();
	const message = {
		id: "reply-stop-late",
		channel_id: "channel-reply-stop",
		content: "reply source",
		embeds: [],
		author: {id: "other-user"}
	};
	let translateCallback = null;
	let rerenderCount = 0;
	plugin.shouldAutoTranslateReplyPreview = () => true;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.translateText = (_text, _place, callback) => {
		translateCallback = callback;
	};
	plugin.scheduleTranslationRerender = () => {
		rerenderCount++;
	};

	plugin.queueReplyPreviewTranslation(message, message.channel_id);
	plugin.onStop();
	translateCallback("late reply translation", {id: "en"}, {id: "zh-CN"});

	assert.equal(plugin.getReplyPreviewTranslation(message, message.channel_id), null);
	assert.equal(rerenderCount, 0);
});

test("manual message translation ignores a late result after plugin stop", async () => {
	const plugin = createPluginInstance();
	const message = {
		id: "manual-stop-late",
		channel_id: "channel-manual-stop",
		content: "manual source",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	};
	let translateCallback = null;
	let applyCount = 0;
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => null;
	plugin.translateText = (_text, _place, callback) => {
		translateCallback = callback;
	};
	plugin.applyStoredTranslationToMessage = () => {
		applyCount++;
		return {};
	};
	plugin.scheduleTranslationRerender = () => {};

	const translation = plugin.translateMessage(message, {id: message.channel_id}, {
		manual: true,
		independentOfTextAreaSwitch: true,
		trackBusy: false
	});
	plugin.onStop();
	translateCallback("late manual translation", {id: "en"}, {id: "zh-CN"});
	const result = await translation;

	assert.equal(result, false);
	assert.equal(applyCount, 0);
});

test("one live result performs one ID-scoped display commit", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const channel = {id: "channel-live-commit"};
	const message = {id: "live-1", channel_id: channel.id, content: "live source", embeds: [], attachments: [], author: {id: "other-user"}};
	const commits = [];
	plugin.captureReceivedMessageSource({messageId: message.id, channelId: channel.id, generation: 1, sourceSignature: "live-signature", source: {content: message.content, embeds: []}});
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => ({channelId: channel.id, auto: true, content: "live translated", translatedContent: "live translated", originalContent: message.content, signature: "live-signature", embeds: {}});
	plugin.commitReceivedDisplayResult = async result => {
		commits.push(result);
		return {confirmedIds: [String(result.messageId)], missingIds: [], fallbackUsed: false};
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("live automatic results must not write the legacy display map");};
	plugin.scheduleTranslationRerender = () => {throw new Error("live display commits must not use the generic timer");};

	const handled = await plugin.translateMessage(message, channel, {auto: true, silent: true, trackBusy: false});

	assert.equal(handled, true);
	assert.equal(commits.length, 1);
	assert.equal(commits[0].messageId, "live-1");
	assert.equal(commits[0].status, "translated");
});

test("editing a store-translated automatic message requeues the new source", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const channel = {id: "channel-store-edit"};
	const message = {id: "100", channel_id: channel.id, content: "old source text", embeds: [], attachments: [], author: {id: "other-user"}};
	const contentData = plugin.extractOriginalContentData(message);
	const signature = plugin.createReceivedTranslationSignature(message, channel.id, contentData);
	plugin.captureReceivedMessageSource({messageId: message.id, channelId: channel.id, generation: 1, sourceSignature: signature, source: {content: message.content, embeds: []}});
	await plugin.commitReceivedDisplayResult({messageId: message.id, channelId: channel.id, generation: 1, sourceSignature: signature, origin: "automatic", status: "translated", translation: {content: "旧译文"}}, {refresh: false});
	assert.equal(plugin.getReceivedDisplayView("100").translated, true);
	const queued = [];
	let clearedCache = 0;
	plugin.captureSentOriginalMessage = () => {};
	plugin.queueAutoTranslateMessage = queuedMessage => {queued.push(queuedMessage.id); return true;};
	plugin.clearCachedTranslation = () => {clearedCache++;};
	const channelState = plugin.getAutoTranslationChannelState(channel.id);
	channelState.initialized = true;
	channelState.boundaryMessageId = "999";

	const editedMessage = Object.assign({}, message, {content: "new edited source"});
	plugin.checkMessage({content: editedMessage}, editedMessage, channel, {skipAutoQueue: false, historicalLoad: false});

	assert.equal(clearedCache >= 1, true);
	assert.deepEqual(queued, ["100"]);
	assert.equal(plugin.getReceivedDisplayView("100").status, "idle");
	assert.equal(plugin.getReceivedDisplayView("100").content, "new edited source");
});

test("an automatic translation carries the colour treatment onto the rendered message", () => {
	// The visible result of a translation is not just the text: the message picks up
	// translator-translated-message plus the two custom properties the stylesheet reads
	// for the accent bar and the text colour. Nothing asserted this, so the styling
	// could vanish with every text-level test still green.
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.settings.general.highlightTranslatedMessages = true;
	plugin.settings.general.translatedTextColor = "#00ff40";

	const message = {
		id: "colour-1",
		channel_id: "channel-colour",
		content: "Good morning",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-colour",
		auto: true,
		content: "早上好",
		translatedContent: "早上好",
		originalContent: "Good morning",
		embeds: {}
	});

	const event = {
		instance: {props: {message}},
		returnvalue: {props: {children: []}}
	};
	plugin.processMessageContent(event);

	const props = event.returnvalue.props;
	assert.match(String(props.className || ""), /translator-translated-message/, "the accent class must reach the rendered message");
	assert.equal(props.style && props.style["--translator-text-color"], "#00ff40");
	assert.equal(props.style && props.style["--translator-accent-color"], "#00ff40");
});

test("turning the highlight off removes the colour treatment but keeps the translation", () => {
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.settings.general.highlightTranslatedMessages = false;

	const message = {
		id: "colour-2",
		channel_id: "channel-colour",
		content: "Good morning",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-colour",
		auto: true,
		content: "早上好",
		translatedContent: "早上好",
		originalContent: "Good morning",
		embeds: {}
	});

	plugin.getActiveMessageTranslation = () => null;
	plugin.getReceivedDisplayRuntimeView = () => ({
		messageId: message.id,
		revision: 1,
		translated: true,
		translation: {channelId: "channel-colour", auto: true, content: "早上好", translatedContent: "早上好", originalContent: "Good morning"}
	});

	const event = {instance: {props: {message}}, returnvalue: {props: {children: []}}};
	plugin.processMessageContent(event);

	// The switch controls the accent only. The custom properties still travel with the
	// message so a user who turns the highlight back on gets their colour, not a default.
	assert.doesNotMatch(String(event.returnvalue.props.className || ""), /translator-translated-message/);
	assert.equal(event.returnvalue.props["data-translator-revision"], "1", "the translation itself still rendered");
});

test("a store-backed automatic translation carries the colour treatment too", () => {
	// Automatic translations are owned by the display store, so processMessageContent
	// takes applyReceivedDisplayViewToContent rather than the legacy decoration path.
	// That branch had no styling coverage at all - the legacy one is the branch the
	// other colour test happens to exercise.
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.settings.general.highlightTranslatedMessages = true;
	plugin.settings.general.translatedTextColor = "#00ff40";

	const message = {
		id: "colour-store-1",
		channel_id: "channel-colour",
		content: "Good morning",
		embeds: [],
		author: {id: "other-user"}
	};
	// Nothing in the legacy path: force the store branch.
	plugin.getActiveMessageTranslation = () => null;
	plugin.getReceivedDisplayRuntimeView = () => ({
		messageId: message.id,
		revision: 3,
		translated: true,
		translation: {
			channelId: "channel-colour",
			auto: true,
			content: "早上好",
			translatedContent: "早上好",
			originalContent: "Good morning"
		}
	});

	const event = {instance: {props: {message}}, returnvalue: {props: {children: []}}};
	plugin.processMessageContent(event);

	const props = event.returnvalue.props;
	assert.equal(props["data-translator-revision"], "3", "the store branch must have run");
	assert.match(String(props.className || ""), /translator-translated-message/, "the accent class must reach a store-backed translation");
	assert.equal(props.style && props.style["--translator-text-color"], "#00ff40");
});

test("a reply preview translation is committed when the provider answers", () => {
	// markPreviewPending returns a token string; releasePreviewPending keys on the message
	// id and treats the token as a guard. Passing the token where the id belongs made the
	// store look up a record named "preview-1", find nothing, return false - so the
	// translateText callback returned early every time and no preview was ever committed.
	// The pending slot also stayed set, which blocked every later retry for that message.
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.settings.general.showOriginalInReplyPreview = true;
	plugin.shouldAutoTranslateReplyPreview = () => true;

	const message = {id: "preview-msg-1", channel_id: "channel-preview", content: "Good morning", embeds: [], author: {id: "other-user"}};
	let capturedCallback = null;
	plugin.translateText = (text, place, callback) => {capturedCallback = callback;};
	plugin.scheduleTranslationRerender = () => {throw new Error("reply preview commits must not use the broad repaint scheduler");};

	plugin.queueReplyPreviewTranslation(message, "channel-preview", message);
	assert.ok(capturedCallback, "the preview should have asked the provider");
	assert.ok(plugin.ensureReceivedDisplayRuntime().getPreviewPending(message.id), "the pending slot should be held while in flight");

	capturedCallback("早上好", {id: "en"}, {id: "zh-CN"});

	assert.ok(plugin.ensureReceivedDisplayRuntime().getPreviewTranslation(message.id), "the answer must reach the preview store");
	assert.equal(plugin.ensureReceivedDisplayRuntime().getPreviewPending(message.id), null, "the pending slot must be released so a later retry can run");
});

function commitAutomaticTranslation(plugin, message, channelId, translatedContent) {
	const display = plugin.ensureReceivedDisplayRuntime();
	display.setChannelGeneration(channelId, 1);
	const originalContentData = plugin.extractOriginalContentData(message);
	const signature = plugin.createReceivedTranslationSignature(message, channelId, originalContentData);
	display.captureSource({
		messageId: message.id,
		channelId,
		generation: 1,
		sourceSignature: signature,
		source: {content: originalContentData.content, embeds: originalContentData.embeds || []}
	});
	display.commitMessageResult({
		messageId: message.id,
		channelId,
		generation: 1,
		sourceSignature: signature,
		origin: "automatic",
		translation: {
			channelId,
			auto: true,
			content: translatedContent,
			translatedContent,
			originalContent: originalContentData.content
		}
	}, {refresh: false});
	return signature;
}

test("a second render pass does not launder an automatic translation into the source", () => {
	// The stream pass writes the painted text onto the message the channel stream holds.
	// extractOriginalContentData had nothing to anchor on - an automatic commit mints no
	// source archive - so the next pass read the plugin's own Chinese back as the
	// "original", the recomputed signature changed, and captureSource replaced the record
	// with a fresh idle one. The message kept translated text and lost the translation,
	// which is why historical messages showed no colour, were re-queued, and were paid for
	// a second time.
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;

	const message = {id: "launder-1", channel_id: "channel-launder", content: "Good morning", embeds: [], author: {id: "other-user"}};
	const signature = commitAutomaticTranslation(plugin, message, "channel-launder", "早上好");
	const display = plugin.ensureReceivedDisplayRuntime();
	assert.equal(display.getDisplayState(message.id).status, "translated", "the commit must land before we test what survives it");

	// This is exactly what the stream pass does: paint the translation onto the message.
	message.content = "早上好";

	const rederived = plugin.extractOriginalContentData(message);
	assert.equal(rederived.content, "Good morning", "our own paint must not become the new original");
	assert.equal(plugin.createReceivedTranslationSignature(message, "channel-launder", rederived), signature, "an unedited message keeps its signature across passes");
});

test("changing the received target language restores stale paint without laundering it into the next source", () => {
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	const channel = {id: "channel-config-change"};
	const message = {id: "100", channel_id: channel.id, content: "Good morning", embeds: [], attachments: [], author: {id: "other-user"}};
	plugin.settings.choices.received.output = "zh-CN";
	const oldSignature = commitAutomaticTranslation(plugin, message, channel.id, "旧中文译文");

	// Discord's current row still carries the old paint when the channel target changes.
	message.content = "旧中文译文";
	plugin.settings.choices.received.output = "en";
	const nextSignature = plugin.createReceivedTranslationSignature(message, channel.id, {content: "Good morning", embeds: []});
	assert.notEqual(nextSignature, oldSignature, "the language change must create a new request identity");
	const channelState = plugin.getAutoTranslationChannelState(channel.id);
	channelState.initialized = true;
	channelState.boundaryMessageId = "999";
	const queued = [];
	plugin.queueAutoTranslateMessage = (queuedMessage, _channel, source) => (queued.push({id: queuedMessage.id, source: source.content}), true);
	const stream = {content: message};

	plugin.checkMessage(stream, message, channel, {skipAutoQueue: false, autoTranslateBoundaryId: "999", historicalLoad: false});
	plugin.checkMessage(stream, message, channel, {skipAutoQueue: false, autoTranslateBoundaryId: "999", historicalLoad: false});

	const state = plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id);
	assert.equal(stream.content.content, "Good morning", "the old Chinese paint must be restored immediately");
	assert.equal(state.source.content, "Good morning", "a later render must retain the immutable English source");
	assert.equal(state.sourceSignature, nextSignature, "the source remains attached to the new English-target configuration");
	assert.deepEqual(queued, [{id: "100", source: "Good morning"}], "the configuration change queues at most one replacement decision");
});

test("changing received configuration retires old cumulative and retry state before a new history session", () => {
	const plugin = createPluginInstance();
	const channelId = "channel-config-session";
	plugin.settings.choices.received.output = "zh-CN";
	plugin.processMessages({instance: {props: {channel: {id: channelId}, channelStream: []}}});
	plugin.updateLoadedAutoTranslationStatus({channelId, batch: 1, active: false, done: true, total: 36, processed: 36, displayed: 36});
	plugin.ensureLoadedStatusCapsuleController().recordTranslationsDisplayed(channelId, Array.from({length: 36}, (_, index) => `old-${index + 1}`));
	plugin.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, {
		items: Array.from({length: 50}, (_, index) => ({message: {id: `failed-${index + 1}`}}))
	});
	const channelState = plugin.getAutoTranslationChannelState(channelId);
	channelState.initialized = true;
	channelState.boundaryMessageId = "999";
	assert.match(plugin.getLoadedAutoTranslationStatusText(), /36/);
	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 50);

	plugin.settings.choices.received.output = "en";
	plugin.processMessages({instance: {props: {channel: {id: channelId}, channelStream: []}}});

	assert.doesNotMatch(plugin.getLoadedAutoTranslationStatusText(), /36|50/, "the new target starts without old completed or retry counts");
	assert.equal(plugin.getFailedHistoricalTranslationCount(channelId), 0);
	assert.equal(channelState.initialized, false);
	assert.equal(channelState.boundaryMessageId, null);
	channelState.initialized = true;
	channelState.boundaryMessageId = "888";
	plugin.processMessages({instance: {props: {channel: {id: channelId}, channelStream: []}}});
	assert.equal(channelState.initialized, true, "the same English configuration cannot reset repeatedly");
	assert.equal(channelState.boundaryMessageId, "888");
});

test("Discord English resolves as the effective target before received same-language filtering", () => {
	const plugin = createPluginInstance({
		settings: {choices: {received: {input: "auto", output: "$discord"}}},
		defaults: {choices: {received: {value: {input: "auto", output: "$discord"}}}},
		getLanguageChoice: (direction, place) => place == "received" && direction == "output" ? "$discord" : "auto"
	});
	const channel = {id: "channel-discord-english"};
	const message = {
		id: "discord-english-1",
		channel_id: channel.id,
		content: "What can I create that I can realistically sell to clients? I have already paid for a subscription, and I want to use my remaining time and credits on something that can help me start earning. Please suggest a practical niche and workflow.",
		embeds: [],
		author: {id: "other-user"}
	};
	const source = {content: message.content, embeds: []};

	assert.equal(plugin._testBdfdb.LanguageUtils.getLanguage().id, "en");
	assert.equal(plugin.normalizeLanguageId("$discord"), "en", "the dynamic target must resolve to Discord's actual locale");
	assert.equal(plugin.shouldAutoTranslateReceivedMessage(message, channel, source, true), false, "English must not enter an English-target history job");
});

test("Discord English reaches the provider as concrete English instead of a special codec", async () => {
	const plugin = createPluginInstance({
		getLanguageChoice: (direction, place) => place == "received" && direction == "output" ? "$discord" : "auto",
		bdfdb: {
			LanguageUtils: {
				languages: {
					auto: {id: "auto", name: "Detect", auto: true},
					en: {id: "en", name: "English"},
					$discord: {id: "$discord", name: "Discord (English)", special: true}
				},
				getLanguage: () => ({id: "en"}),
				LibraryStrings: {please_wait: "Please wait"}
			}
		}
	});
	let providerData = null;
	plugin.googleApiTranslate = (data, callback) => {
		providerData = data;
		callback("Hello friend");
	};

	const outcome = await new Promise(resolve => plugin.translateText("Hola amigo", "received", (translation, input, output, meta) => resolve({translation, input, output, meta}), null, {channelId: "channel-discord-provider", trackBusy: false, showToast: false}));

	assert.ok(providerData, "the dynamic Discord target must dispatch through the provider path");
	assert.equal(providerData.output.id, "en");
	assert.equal(providerData.output.special, undefined);
	assert.equal(outcome.translation, "Hello friend");
	assert.equal(outcome.output.id, "en");
});

test("a provider echo in the effective target language is a terminal skip, not a retryable failure", async () => {
	const plugin = createPluginInstance({
		getLanguageChoice: (direction, place) => place == "received" && direction == "output" ? "$discord" : "auto"
	});
	plugin.googleApiTranslate = (data, callback) => {
		data.input.id = "en";
		callback(data.text);
	};

	const outcome = await new Promise(resolve => plugin.translateText("hello there my friend", "received", (translation, input, output, meta) => resolve({translation, input, output, meta}), null, {channelId: "channel-echo-skip", trackBusy: false, showToast: false}));

	assert.equal(outcome.translation, "");
	assert.equal(outcome.input.id, "en");
	assert.equal(outcome.output.id, "en");
	assert.deepEqual(outcome.meta, {skipped: true, reason: "same_language"});
});

test("a failed historical message waits for explicit retry instead of re-entering every render", () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-failed-guard"};
	const message = {id: "failed-guard-1", channel_id: channel.id, content: "uncertain source", embeds: [], author: {id: "other-user"}};
	const originalContentData = {content: message.content, embeds: []};
	const signature = plugin.createReceivedTranslationSignature(message, channel.id, originalContentData);
	plugin.ensureHistoricalJobRegistry().setFailedSnapshot(channel.id, {
		channelId: channel.id,
		items: [{message, channel, originalContentData, signature, reason: "provider_failed"}]
	});
	const queueItem = {message, channel, originalContentData, historicalLoad: true, deferHistoricalSnapshotStart: true};

	assert.equal(plugin.collectHistoricalTranslationMessage(queueItem), false, "an automatic rescan must leave the retry ledger parked");
	assert.equal(plugin.collectHistoricalTranslationMessage({...queueItem, retryFailed: true}), true, "the retry button may explicitly re-admit it");
});

test("a real edit after an automatic translation is still treated as an edit", () => {
	// The anchor must recognise our own paint and nothing else, or a genuine edit would be
	// invisible and the message would keep showing a translation of text that is gone.
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;

	const message = {id: "launder-2", channel_id: "channel-launder", content: "Good morning", embeds: [], author: {id: "other-user"}};
	commitAutomaticTranslation(plugin, message, "channel-launder", "早上好");

	message.content = "Good evening everyone";
	assert.equal(plugin.extractOriginalContentData(message).content, "Good evening everyone", "a genuine edit must become the new original");
});

test("manual untranslate works on an automatically translated message", () => {
	// Nothing covered this, which is how it shipped broken. It broke indirectly: once the
	// laundering bug had replaced the record with a fresh idle one, translateMessage saw
	// no translation to remove and fell into the translate branch instead - clicking
	// "cancel translation" re-translated the message.
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.lockManualTranslationScroll = () => {};

	const message = {id: "untranslate-1", channel_id: "channel-untranslate", content: "Good morning", embeds: [], author: {id: "other-user"}};
	const display = plugin.ensureReceivedDisplayRuntime();
	display.setChannelGeneration("channel-untranslate", 1);
	const originalContentData = plugin.extractOriginalContentData(message);
	const signature = plugin.createReceivedTranslationSignature(message, "channel-untranslate", originalContentData);
	display.captureSource({messageId: message.id, channelId: "channel-untranslate", generation: 1, sourceSignature: signature, source: {content: originalContentData.content, embeds: []}});
	display.commitMessageResult({
		messageId: message.id,
		channelId: "channel-untranslate",
		generation: 1,
		sourceSignature: signature,
		origin: "automatic",
		translation: {channelId: "channel-untranslate", auto: true, content: "早上好", translatedContent: "早上好", originalContent: originalContentData.content}
	}, {refresh: false});

	let translateAttempted = false;
	const hasTranslatableMessageContent = plugin.hasTranslatableMessageContent.bind(plugin);
	plugin.hasTranslatableMessageContent = data => {translateAttempted = true; return hasTranslatableMessageContent(data);};

	plugin.translateMessage(message, {id: "channel-untranslate"}, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false});

	assert.equal(translateAttempted, false, "cancelling a translation must not ask the provider for another one");
	assert.equal(display.isSuppressed(message.id), true, "the message must be suppressed so the automatic path leaves it alone");
});

test("cancelling an automatic translation paints the original back", () => {
	// The cancel used to leave the painted translation on screen forever: the cancelled
	// record dropped its translation object, so nothing could prove the on-screen text
	// was our paint rather than an edit, the next pass captured the translation as a new
	// source, and the original was gone. restoredTranslation is that proof, and both
	// render paths use it - the stream pass and the content component, which can
	// re-render without a stream pass.
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.lockManualTranslationScroll = () => {};

	const message = {id: "cancel-restore-1", channel_id: "channel-cancel", content: "Good evening", embeds: [], attachments: [], author: {id: "other-user"}};
	commitAutomaticTranslation(plugin, message, "channel-cancel", "晚上好");
	// The stream pass paints the translation onto the message the stream holds.
	message.content = "晚上好";

	plugin.translateMessage(message, {id: "channel-cancel"}, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false});

	const streamEntry = {type: "MESSAGE", content: message};
	plugin.processMessages({instance: {props: {channelStream: [streamEntry], channel: {id: "channel-cancel"}}}});
	assert.equal(streamEntry.content.content, "Good evening", "the stream pass must paint the original back");

	// A second pass must not undo the restore or re-queue the message.
	plugin.processMessages({instance: {props: {channelStream: [streamEntry], channel: {id: "channel-cancel"}}}});
	assert.equal(streamEntry.content.content, "Good evening");
});

test("cancelling and then genuinely editing the message keeps the edit", () => {
	const plugin = createPluginInstance();
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.lockManualTranslationScroll = () => {};

	const message = {id: "cancel-restore-2", channel_id: "channel-cancel", content: "Good evening", embeds: [], attachments: [], author: {id: "other-user"}};
	commitAutomaticTranslation(plugin, message, "channel-cancel", "晚上好");
	message.content = "晚上好";
	plugin.translateMessage(message, {id: "channel-cancel"}, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false});

	// The author edits before the restore pass runs. The edit must win.
	message.content = "Good evening, edited";
	const streamEntry = {type: "MESSAGE", content: message};
	plugin.processMessages({instance: {props: {channelStream: [streamEntry], channel: {id: "channel-cancel"}}}});
	assert.equal(streamEntry.content.content, "Good evening, edited", "a real edit must never be overwritten by the restore");
});
