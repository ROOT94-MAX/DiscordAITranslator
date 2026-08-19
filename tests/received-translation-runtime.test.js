const test = require("node:test");
const assert = require("node:assert/strict");
const {createDiscordHistoryAdapter} = require("../src/received/discord-history-adapter");
const {
	foreignLanguageDecisionRuntime,
	receivedMessageFilterRuntime,
	createReceivedTranslationRuntime
} = require("../src/received/received-translation-runtime");
const {createProtectionLogic} = require("../src/protection/protection-logic");
const {languageHeuristicsRuntime, textSimilarityRuntime, createLanguageHeuristics} = require("../src/language/language-heuristics");

// Every method takes `plugin` first, so a test only needs an object literal carrying the
// collaborators the code under test actually reaches. Three of those collaborators are
// real sibling modules - protection, the script heuristics and the similarity scorer -
// because faking them would turn "this message is link-only" and "this message is
// already in the target language" into assertions about the fake instead of the filter.
const BDFDB = {
	ArrayUtils: {is: Array.isArray},
	LibraryStores: {SelectedChannelStore: {getChannelId: () => "selected-channel"}}
};
const protectionLogic = createProtectionLogic({BDFDB});
const {languagePolicy} = createLanguageHeuristics({BDFDB});

function getLanguageScriptFamilies(languageId) {
	languageId = (languageId || "").toLowerCase();
	if (!languageId) return [];
	if (languageId.startsWith("zh") || languageId == "ja") return ["han"];
	if (["ru", "uk", "bg"].includes(languageId)) return ["cyrillic"];
	return ["latin"];
}

function countScriptFamilies(text) {
	const counts = {han: 0, cyrillic: 0, latin: 0};
	for (const character of text || "") {
		const codePoint = character.codePointAt(0);
		if (codePoint >= 0x4E00 && codePoint <= 0x9FFF) counts.han++;
		else if (codePoint >= 0x0400 && codePoint <= 0x052F) counts.cyrillic++;
		else if ((codePoint >= 0x0041 && codePoint <= 0x007A) || (codePoint >= 0x00C0 && codePoint <= 0x024F)) counts.latin++;
	}
	return counts;
}

function analyzeTextForAutoTranslate(text, targetLanguageId) {
	const cleanedText = (text || "").replace(/\s+/g, " ").trim();
	const counts = countScriptFamilies(cleanedText);
	const latinWordCount = (cleanedText.match(/[A-Za-z][A-Za-z0-9._+-]*/g) || []).length;
	const hanRunCount = (cleanedText.match(/[\u4E00-\u9FFF]+/g) || []).length;
	const scriptEntries = Object.entries(counts).filter(([, count]) => count > 0).sort((entryA, entryB) => entryB[1] - entryA[1]);
	const totalLetters = scriptEntries.reduce((sum, [, count]) => sum + count, 0);
	const targetFamilies = getLanguageScriptFamilies(targetLanguageId);
	const targetLetterCount = targetFamilies.reduce((sum, family) => sum + (counts[family] || 0), 0);
	const nonTargetLetterCount = Math.max(0, totalLetters - targetLetterCount);
	const targetShare = totalLetters ? targetLetterCount / totalLetters : 0;
	const dominantEntry = scriptEntries[0] || ["", 0];
	const strongTargetScriptMatch = targetFamilies[0] != "latin" && targetLetterCount >= 3 && targetShare >= 0.65;
	return {
		cleanedText, counts, latinWordCount, hanRunCount, targetFamilies, totalLetters,
		targetLetterCount, nonTargetLetterCount, targetShare,
		dominantFamily: dominantEntry[0] || null, strongTargetScriptMatch
	};
}

const CHINESE_GREETING = "你好世界大家好";

// Minimal display-runtime double. Only the four reads the received pass performs.
function createDisplayRuntimeFake(overrides = {}) {
	return Object.assign({
		getDisplayView: () => null,
		isSuppressed: () => false,
		hasSourceArchive: () => false,
		consumeSourceArchive: () => ({message: {content: ""}})
	}, overrides);
}

function createPlugin(overrides = {}) {
	const calls = {
		status: [],
		checkMessage: [],
		queued: [],
		captured: [],
		commits: [],
		replyPreviewEligible: [],
		clearedCache: [],
		snapshots: [],
		prepared: [],
		historicalSourceBuilds: [],
		languageChoice: [],
		detectLanguage: [],
		scrollWatchers: 0
	};
	const seenMessages = new Set();
	const displayRuntime = createDisplayRuntimeFake(overrides.displayRuntime);
	const plugin = {
		calls,
		seenMessages,
		displayRuntime,
		targetLanguageId: "zh-CN",
		sourceLanguages: [],

		// --- protection / analysis -------------------------------------------------
		settings: {general: {protectQuotedText: false}, exceptions: {protectedTerms: [], wordStart: []}},
		getProtectedWrapperRules: () => [],
		removeExceptions: (text, place) => protectionLogic.removeExceptions(plugin, text, place),
		countScriptFamilies: text => countScriptFamilies(text),
		analyzeTextForAutoTranslate: (text, targetLanguageId) => analyzeTextForAutoTranslate(text, targetLanguageId),
		getLanguageScriptFamilies: languageId => getLanguageScriptFamilies(languageId),
		buildTranslationRequestText: data => data && data.content || "",
		hasTranslatableMessageContent: data => !!(data && (data.content || "").trim()),

		// --- language policy -------------------------------------------------------
		ensureSettingsStore: () => ({getLanguage: languageId => languageId == "auto" ? {auto: true} : {id: languageId}}),
		getLanguageChoice: (direction, place, channelId) => {
			calls.languageChoice.push([direction, place, channelId]);
			return plugin.targetLanguageId;
		},
		isSameLanguageOrVariant: (a, b) => !!a && !!b && String(a).toLowerCase().split("-")[0] == String(b).toLowerCase().split("-")[0],
		matchesConfiguredSourceLanguage: (languageId, sourceLanguages) => languagePolicy.matchesConfiguredSourceLanguage(plugin, languageId, sourceLanguages),
		getReceivedAutoTranslateSourceLanguages: () => plugin.sourceLanguages,
		shouldSkipSameLanguageReceivedMessages: () => true,
		shouldDropSimilarTranslations: () => true,
		getTranslationSimilarityThreshold: () => 0.9,
		getAutoTranslateMinimumLengthForAnalysis: () => 0,
		useLocalLanguagePrecheck: () => false,
		detectMessageLanguageLocal: () => ({confident: false, languageId: null}),
		isClearlyForeignLanguageMessage: () => false,
		detectLanguage: (text, callback) => {
			calls.detectLanguage.push(text);
			callback(null);
		},
		isClearlyTargetLanguageMessage: (analysis, targetLanguageId) => languageHeuristicsRuntime.isClearlyTargetLanguageMessage(plugin, analysis, targetLanguageId),
		isMostlyTargetLanguageMessage: (analysis, targetLanguageId) => languageHeuristicsRuntime.isMostlyTargetLanguageMessage(plugin, analysis, targetLanguageId),
		normalizeStoredTranslationData: translation => translation,
		normalizeExtractedMessageText: value => value == null ? "" : String(value),
		normalizeComparisonText: text => textSimilarityRuntime.normalizeComparisonText(plugin, text),
		getTextSimilarityScore: (a, b) => textSimilarityRuntime.getTextSimilarityScore(plugin, a, b),

		// --- eligibility gate collaborators ----------------------------------------
		isTranslationEnabled: () => true,
		isOwnMessage: () => false,
		isMessageDisplayTranslated: () => false,
		ensureLiveTranslationQueue: () => ({isMessageQueued: () => false}),
		ensureReceivedDisplayRuntime: () => displayRuntime,
		extractOriginalContentData: message => ({content: message && message.content || "", embeds: []}),
		getCachedReceivedSkipDecision: () => null,

		// --- stream pass collaborators ---------------------------------------------
		prepareAutoTranslationChannelSession: channelId => calls.prepared.push(channelId),
		getAutoTranslationChannelState: () => plugin.channelState,
		getReceivedAutoTranslateScope: () => "new_only",
		getFailedHistoricalTranslationCount: () => 0,
		attachAutoTranslationScrollWatcher: () => {calls.scrollWatchers++;},
		updateLoadedAutoTranslationStatus: update => calls.status.push(update),
		shouldDeferInitialAutoTranslate: () => false,
		getHistoricalMessageSourceGeneration: () => 1,
		getReceivedAutoTranslateLoadedLimit: () => 50,
		buildInitialHistoricalTranslationSnapshot: payload => {
			calls.historicalSourceBuilds.push(payload);
			const renderedMessages = payload && payload.renderedMessages || [];
			return Promise.resolve({accepted: renderedMessages.length, total: renderedMessages.length});
		},
		markLoadedAutoTranslationMessageSeen: (channelId, messageId) => {
			const key = `${channelId}|${messageId}`;
			const wasSeen = seenMessages.has(key);
			seenMessages.add(key);
			return wasSeen;
		},
		isMessageIdNewer: (messageId, boundaryId) => Number(messageId || 0) > Number(boundaryId || 0),
		getNewestMessageId: (a, b) => Number(b || 0) > Number(a || 0) ? b : a,
		checkMessage: (...args) => calls.checkMessage.push(args),
		isUserActivelyScrollingMessages: () => false,
		finishHistoricalTranslationSnapshot: channelId => calls.snapshots.push(channelId),
		getHistoricalTranslationJobQueue: () => null,
		refreshReceivedMessageSourceState: () => false,
		createReceivedTranslationSignature: () => "signature-1",
		invalidateHistoricalTranslationMessage: () => false,
		invalidateLiveTranslationMessage: () => false,
		getReceivedDisplayRuntimeView: () => null,
		getReceivedDisplayGeneration: () => 1,
		captureReceivedMessageSource: record => {
			calls.captured.push(record);
			return record;
		},
		clearCachedTranslation: messageId => calls.clearedCache.push(messageId),
		refreshTranslationDisplay: translation => translation,
		buildReceivedDisplayContent: translated => translated,
		createReceivedDisplayCommitResult: (message, channelId, data) => Object.assign({messageId: message.id, channelId}, data),
		commitReceivedDisplayResult: (result, options) => {calls.commits.push([result, options]);},
		getActiveMessageTranslation: () => null,
		isMessageWithinLoadedRange: () => true,
		markAutoTranslationEligibleReplyPreviewMessage: (channelId, messageId) => calls.replyPreviewEligible.push([channelId, messageId]),
		getCachedReceivedTranslation: () => null,
		applyReceivedDisplayViewToStream: (stream, view) => {stream.content.content = view.content;},
		paintStreamBody: (stream, bodyText) => {
			const snapshots = stream && stream.content && (stream.content.messageSnapshots || stream.content.message_snapshots);
			if (Array.isArray(snapshots) && snapshots[0] && snapshots[0].message && !String(stream.content.content || "").trim()) {
				stream.content = Object.assign({}, stream.content, {messageSnapshots: [{message: Object.assign({}, snapshots[0].message, {content: bodyText})}].concat(snapshots.slice(1))});
				return;
			}
			stream.content.content = bodyText;
		},
		getStreamBodyContent: message => {
			const snapshots = message && (message.messageSnapshots || message.message_snapshots);
			return Array.isArray(snapshots) && snapshots[0] && snapshots[0].message && !String(message.content || "").trim() ? snapshots[0].message.content : message && message.content;
		},
		getStreamTranslationRenderContent: (_message, translation) => translation && translation.content,
		isLikelyLiveAutoTranslateMessage: () => false,
		queueAutoTranslateMessage: (...args) => calls.queued.push(args),
		captureSentOriginalMessage: () => {},

		channelState: {boundaryMessageId: "100", initialized: true}
	};
	delete overrides.displayRuntime;
	return Object.assign(plugin, overrides);
}

function createRuntime(statusStoreOverrides = {}) {
	const statusStore = Object.assign({
		getNextBatchNumber: () => 7,
		getCurrentBatchNumber: () => 7
	}, statusStoreOverrides);
	const {receivedTranslationRuntime} = createReceivedTranslationRuntime({BDFDB, loadedTranslationStatusStore: statusStore});
	return receivedTranslationRuntime;
}

function createEvent(channelStream, channel = {id: "channel-1"}) {
	return {instance: {props: {channel, channelStream}}};
}

// --------------------------------------------------------------------------------
// eligibility: which received messages are worth an automatic translation
// --------------------------------------------------------------------------------

test("a plain foreign-script message in an enabled channel is eligible", () => {
	const plugin = createPlugin();
	const message = {id: "200", content: "hello there my friend"};
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, message, {id: "channel-1"}), true);
});

test("the target language is read for the received output direction", () => {
	const plugin = createPlugin();
	receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {id: "200", content: "hello there"}, {id: "channel-1"});
	assert.deepEqual(plugin.calls.languageChoice[0], ["output", "received", "channel-1"]);
});

test("eligibility refuses a message with no channel or no id", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {id: "200", content: "hi"}, null), false);
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {content: "hi"}, {id: "channel-1"}), false);
});

test("eligibility refuses a disabled channel, an own message and a suppressed message", () => {
	const message = {id: "200", content: "hello there my friend"};
	const channel = {id: "channel-1"};
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(createPlugin({isTranslationEnabled: () => false}), message, channel), false);
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(createPlugin({isOwnMessage: () => true}), message, channel), false);
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(createPlugin({displayRuntime: {isSuppressed: () => true}}), message, channel), false);
});

test("eligibility refuses a message already displayed or already queued, unless queued state is ignored", () => {
	const message = {id: "200", content: "hello there my friend"};
	const channel = {id: "channel-1"};
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(createPlugin({isMessageDisplayTranslated: () => true}), message, channel), false);
	const queued = {ensureLiveTranslationQueue: () => ({isMessageQueued: () => true})};
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(createPlugin(Object.assign({}, queued)), message, channel), false);
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(createPlugin(Object.assign({}, queued)), message, channel, null, true), true);
});

test("a cached skip decision short-circuits eligibility", () => {
	const plugin = createPlugin({getCachedReceivedSkipDecision: () => "same_language"});
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {id: "200", content: "hello there"}, {id: "channel-1"}), false);
});

test("eligibility refuses text shorter than the configured analysis minimum", () => {
	const plugin = createPlugin({getAutoTranslateMinimumLengthForAnalysis: () => 100});
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {id: "200", content: "hello there"}, {id: "channel-1"}), false);
});

test("eligibility refuses a message already written in the target language", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {id: "200", content: CHINESE_GREETING}, {id: "channel-1"}), false);
});

// --------------------------------------------------------------------------------
// link-only and fully protected content
// --------------------------------------------------------------------------------

test("content that masks down to nothing but a link is link-only", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, {content: "https://example.com/page"}), true);
	assert.equal(receivedMessageFilterRuntime.getReceivedAutoTranslateSkipReason(plugin, {content: "https://example.com/page"}, "channel-1"), "link_only");
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {id: "200", content: "https://example.com/page"}, {id: "channel-1"}), false);
});

test("a link with words around it is not link-only", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, {content: "look at https://example.com/page now"}), false);
});

test("empty and missing content are never link-only", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, null), false);
	assert.equal(receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, {content: "   "}), false);
});

test("a message that is nothing but protected Discord markup is skipped", () => {
	const plugin = createPlugin();
	// Custom emoji and mentions are masked whole, so nothing translatable survives.
	assert.equal(receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, {content: "<:smile:12345>"}), true);
	assert.equal(receivedMessageFilterRuntime.getReceivedAutoTranslateSkipReason(plugin, {content: "<@123456789012345678>"}, "channel-1"), "link_only");
});

test("punctuation-only content survives protection but carries no letters", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, {content: "!!!"}), false);
	assert.equal(receivedMessageFilterRuntime.getReceivedAutoTranslateSkipReason(plugin, {content: "!!!"}, "channel-1"), "symbol_only");
});

test("skip reason is null for a translatable foreign message and same_language for target text", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.getReceivedAutoTranslateSkipReason(plugin, {content: "hello there my friend"}, "channel-1"), null);
	assert.equal(receivedMessageFilterRuntime.getReceivedAutoTranslateSkipReason(plugin, {content: CHINESE_GREETING}, "channel-1"), "same_language");
});

test("the pre-request skip agrees with the target-language check but ignores auto targets", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.shouldSkipReceivedTranslationBeforeRequest(plugin, {content: CHINESE_GREETING}, "channel-1"), true);
	assert.equal(receivedMessageFilterRuntime.shouldSkipReceivedTranslationBeforeRequest(plugin, {content: "hello there my friend"}, "channel-1"), false);
	assert.equal(receivedMessageFilterRuntime.shouldSkipReceivedTranslationBeforeRequest(plugin, null, "channel-1"), false);
	assert.equal(receivedMessageFilterRuntime.shouldSkipReceivedTranslationBeforeRequest(plugin, {content: CHINESE_GREETING}, null), false);
	plugin.targetLanguageId = "auto";
	assert.equal(receivedMessageFilterRuntime.shouldSkipReceivedTranslationBeforeRequest(plugin, {content: CHINESE_GREETING}, "channel-1"), false);
});

test("the analysis text is the masked text plus whether anything unprotected remains", () => {
	const plugin = createPlugin();
	const withWords = receivedMessageFilterRuntime.buildAutoTranslateAnalysisText(plugin, {content: "look at https://example.com now"});
	assert.equal(withWords.hasUnprotectedContent, true);
	assert.ok(!withWords.text.includes("https://example.com"));
	const linkOnly = receivedMessageFilterRuntime.buildAutoTranslateAnalysisText(plugin, {content: "https://example.com"});
	assert.equal(linkOnly.hasUnprotectedContent, false);
});

// --------------------------------------------------------------------------------
// the local language precheck
// --------------------------------------------------------------------------------

test("a confident local detection matching the target skips the request", () => {
	const plugin = createPlugin({
		targetLanguageId: "en",
		useLocalLanguagePrecheck: () => true,
		detectMessageLanguageLocal: () => ({confident: true, languageId: "en"})
	});
	assert.equal(receivedMessageFilterRuntime.shouldSkipByLocalLanguagePrecheck(plugin, "the quick brown fox", {}, "en"), true);
	assert.equal(receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(plugin, {id: "200", content: "the quick brown fox"}, {id: "channel-1"}), false);
});

test("a confident local detection outside the configured sources skips the request", () => {
	const plugin = createPlugin({
		targetLanguageId: "en",
		sourceLanguages: ["ja"],
		useLocalLanguagePrecheck: () => true,
		detectMessageLanguageLocal: () => ({confident: true, languageId: "fr"})
	});
	assert.equal(receivedMessageFilterRuntime.shouldSkipByLocalLanguagePrecheck(plugin, "bonjour le monde", {}, "en"), true);
});

test("an unconfident local detection never skips, and the precheck can be turned off", () => {
	const unconfident = createPlugin({
		targetLanguageId: "en",
		useLocalLanguagePrecheck: () => true,
		detectMessageLanguageLocal: () => ({confident: false, languageId: "en"})
	});
	assert.equal(receivedMessageFilterRuntime.shouldSkipByLocalLanguagePrecheck(unconfident, "text", {}, "en"), false);
	const disabled = createPlugin({
		targetLanguageId: "en",
		detectMessageLanguageLocal: () => {throw new Error("must not run when the precheck is off");}
	});
	assert.equal(receivedMessageFilterRuntime.shouldSkipByLocalLanguagePrecheck(disabled, "text", {}, "en"), false);
});

// --------------------------------------------------------------------------------
// accepting or rejecting a finished translation
// --------------------------------------------------------------------------------

test("a translation identical to the original is rejected as too similar", () => {
	const plugin = createPlugin();
	const translation = {originalContent: "hello world", translatedContent: "hello world", input: {id: "en"}, output: {id: "zh-CN"}};
	assert.equal(receivedMessageFilterRuntime.isTranslationResultTooSimilar(plugin, translation), true);
	assert.equal(receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, translation, "channel-1"), "too_similar");
	assert.equal(receivedMessageFilterRuntime.shouldKeepAutoTranslatedResult(plugin, translation, "channel-1"), false);
});

test("an empty translation is rejected by the local guard", () => {
	const plugin = createPlugin();
	assert.equal(receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, null, "channel-1"), "local_guard");
	assert.equal(receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, {originalContent: "hi"}, "channel-1"), "local_guard");
});

test("a translation whose detected language equals the target is rejected as same_language", () => {
	const plugin = createPlugin();
	const translation = {originalContent: "a", translatedContent: "b", input: {id: "zh-TW"}, output: {id: "zh-CN"}};
	assert.equal(receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, translation, "channel-1"), "same_language");
});

test("a detected language outside the configured sources is rejected by the source filter", () => {
	const plugin = createPlugin({sourceLanguages: ["ja"]});
	const translation = {originalContent: "a", translatedContent: "b", input: {id: "fr"}, output: {id: "zh-CN"}};
	assert.equal(receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, translation, "channel-1"), "source_filter");
	plugin.sourceLanguages = ["fr"];
	assert.equal(receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, translation, "channel-1"), null);
});

test("a genuine translation is kept", () => {
	const plugin = createPlugin();
	const translation = {originalContent: "hello there", translatedContent: CHINESE_GREETING, input: {id: "en"}, output: {id: "zh-CN"}};
	assert.equal(receivedMessageFilterRuntime.shouldKeepAutoTranslatedResult(plugin, translation, "channel-1"), true);
});

// --------------------------------------------------------------------------------
// the foreign-language decision
// --------------------------------------------------------------------------------

test("a detected language is foreign only when it differs from the target", () => {
	const plugin = createPlugin();
	assert.equal(foreignLanguageDecisionRuntime.isDetectedLanguageForeign(plugin, "fr", "en"), true);
	assert.equal(foreignLanguageDecisionRuntime.isDetectedLanguageForeign(plugin, "en-GB", "en"), false);
	assert.equal(foreignLanguageDecisionRuntime.isDetectedLanguageForeign(plugin, null, "en"), false);
});

test("clearly foreign text answers true without paying for detection", () => {
	const plugin = createPlugin({
		isClearlyForeignLanguageMessage: () => true,
		detectLanguage: () => {throw new Error("must not detect when the local check already decided");}
	});
	let answer = null;
	foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(plugin, CHINESE_GREETING, "en", value => {answer = value;});
	assert.equal(answer, true);
});

test("empty text and an auto target are never foreign", () => {
	const plugin = createPlugin();
	const answers = [];
	foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(plugin, "", "en", value => answers.push(value));
	foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(plugin, "hello", "auto", value => answers.push(value));
	foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(plugin, "hello", null, value => answers.push(value));
	assert.deepEqual(answers, [false, false, false]);
	assert.deepEqual(plugin.calls.detectLanguage, []);
});

test("an inconclusive local check falls through to async detection", () => {
	const plugin = createPlugin({
		detectLanguage: (text, callback) => {
			plugin.calls.detectLanguage.push(text);
			callback("fr");
		}
	});
	let answer = null;
	foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(plugin, "bonjour", "en", value => {answer = value;});
	assert.equal(answer, true);
	assert.deepEqual(plugin.calls.detectLanguage, ["bonjour"]);

	const sameLanguage = createPlugin({detectLanguage: (text, callback) => callback("en")});
	let sameAnswer = null;
	foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(sameLanguage, "hello", "en", value => {sameAnswer = value;});
	assert.equal(sameAnswer, false);
});

// --------------------------------------------------------------------------------
// the stream pass: scope and time-window filters
// --------------------------------------------------------------------------------

test("new_only scope collects nothing historical but still marks the message seen", () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	const context = {channelId: "channel-1", historicalLoadedPass: false, autoTranslateBoundaryId: "100"};
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, {id: "50"}, context), false);
	assert.equal(plugin.seenMessages.has("channel-1|50"), true);
});

test("the first loaded_messages pass collects every message in the stream", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getReceivedAutoTranslateScope: () => "loaded_messages"});
	const context = {channelId: "channel-1", historicalLoadedPass: true, autoTranslateBoundaryId: "100"};
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, {id: "50"}, context), true);
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, {id: "500"}, context), true);
});

test("later loaded_messages passes only collect unseen messages at or below the boundary", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getReceivedAutoTranslateScope: () => "loaded_messages"});
	const context = {channelId: "channel-1", historicalLoadedPass: false, autoTranslateBoundaryId: "100"};
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, {id: "50"}, context), true, "older and unseen");
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, {id: "50"}, context), false, "second sighting is already seen");
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, {id: "500"}, context), false, "newer than the boundary is live, not historical");
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, {id: "50"}, {channelId: null}), false);
	assert.equal(runtime.shouldCollectHistoricalStreamMessage(plugin, null, context), false);
});

test("the historical banner opens only on an uninitialised enabled channel in loaded_messages scope", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		getReceivedAutoTranslateScope: () => "loaded_messages",
		getFailedHistoricalTranslationCount: () => 3,
		channelState: {boundaryMessageId: "100", initialized: false}
	});
	const context = runtime.createProcessMessagesContext(plugin, createEvent([]));
	assert.equal(context.historicalLoadedPass, true);
	assert.equal(context.shouldInitializeAutoTranslation, true);
	assert.equal(context.autoTranslateBoundaryId, "100");
	assert.equal(plugin.calls.scrollWatchers, 1);
	assert.deepEqual(plugin.calls.prepared, ["channel-1"]);
	assert.equal(plugin.calls.status.length, 1);
	assert.equal(plugin.calls.status[0].batch, 7);
	assert.equal(plugin.calls.status[0].collecting, true);
	assert.equal(plugin.calls.status[0].retryable, 3);
});

test("an already initialised channel opens no banner and starts no scroll watcher", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getReceivedAutoTranslateScope: () => "loaded_messages"});
	const context = runtime.createProcessMessagesContext(plugin, createEvent([]));
	assert.equal(context.historicalLoadedPass, false);
	assert.equal(plugin.calls.status.length, 0);
	assert.equal(plugin.calls.scrollWatchers, 0);
});

test("the initial loaded_messages pass builds one historical snapshot from rendered messages instead of queueing each message", async () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		getReceivedAutoTranslateScope: () => "loaded_messages",
		getHistoricalMessageSourceGeneration: () => 9,
		getReceivedAutoTranslateLoadedLimit: () => 50,
		channelState: {boundaryMessageId: "100", initialized: false}
	});

	runtime.processMessages(plugin, createEvent([
		{content: {id: "300", content: "first", attachments: []}},
		{content: {id: "200", content: "second", attachments: []}}
	]));
	await new Promise(resolve => setImmediate(resolve));

	assert.equal(plugin.calls.queued.length, 0);
	assert.equal(plugin.calls.historicalSourceBuilds.length, 1);
	assert.deepEqual(plugin.calls.historicalSourceBuilds[0], {
		channelId: "channel-1",
		generation: 9,
		renderedMessages: [
			{id: "300", content: "first", attachments: []},
			{id: "200", content: "second", attachments: []}
		],
		limit: 50
	});
});

test("a deferred first pass marks the whole stream skipAutoQueue", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		shouldDeferInitialAutoTranslate: () => true,
		channelState: {boundaryMessageId: "100", initialized: false}
	});
	const context = runtime.createProcessMessagesContext(plugin, createEvent([]));
	assert.equal(context.skipInitialLoadedMessages, true);
});

test("a non-array channelStream is normalised before the walk", () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	const event = createEvent({content: {id: "300", attachments: []}});
	runtime.createProcessMessagesContext(plugin, event);
	assert.ok(Array.isArray(event.instance.props.channelStream));
	assert.equal(event.instance.props.channelStream.length, 1);
});

test("each stream entry with attachments is checked, and grouped entries are walked through", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getReceivedAutoTranslateScope: () => "loaded_messages"});
	const context = {
		channelId: "channel-1",
		channel: {id: "channel-1"},
		historicalLoadedPass: true,
		renderedHistoricalMessages: [],
		autoTranslateBoundaryId: "100",
		highestMessageId: "100",
		skipInitialLoadedMessages: false,
		collectedHistoricalMessages: false
	};
	runtime.processChannelStreamEntry(plugin, {content: {id: "300", attachments: []}}, context);
	runtime.processChannelStreamEntry(plugin, {content: [{content: {id: "400", attachments: []}}, {content: {id: "401"}}]}, context);
	runtime.processChannelStreamEntry(plugin, {content: null}, context);
	assert.deepEqual(plugin.calls.checkMessage.map(args => args[1].id), ["300", "400"]);
	assert.equal(context.highestMessageId, "400");
	assert.equal(context.collectedHistoricalMessages, true);
	assert.deepEqual(plugin.calls.checkMessage[0][3], {
		skipAutoQueue: false,
		autoTranslateBoundaryId: "100",
		historicalLoad: true,
		deferHistoricalSnapshotStart: true,
		skipHistoricalQueue: true
	});
});

test("finishing the initial loaded pass advances the boundary, marks the channel initialised and starts one historical source build", async () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	const channelState = {boundaryMessageId: "100", initialized: false};
	runtime.finishProcessMessages(plugin, {
		channelId: "channel-1",
		channelState,
		shouldInitializeAutoTranslation: true,
		historicalLoadedPass: true,
		historicalSourceGeneration: 1,
		renderedHistoricalMessages: [{id: "300", attachments: []}],
		collectedHistoricalMessages: true,
		highestMessageId: "400"
	});
	await new Promise(resolve => setImmediate(resolve));
	assert.equal(channelState.boundaryMessageId, "400");
	assert.equal(channelState.initialized, true);
	assert.equal(plugin.calls.snapshots.length, 0);
	assert.equal(plugin.calls.status.length, 0);
	assert.equal(plugin.calls.historicalSourceBuilds.length, 1);
	assert.deepEqual(plugin.calls.historicalSourceBuilds[0], {
		channelId: "channel-1",
		generation: 1,
		renderedMessages: [{id: "300", attachments: []}],
		limit: 50
	});
});

test("a channel with historical work still queued keeps its banner open", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getHistoricalTranslationJobQueue: () => ({runningPromise: null, jobs: [{}]})});
	runtime.finishProcessMessages(plugin, {
		channelId: "channel-1",
		channelState: null,
		historicalLoadedPass: false,
		collectedHistoricalMessages: true,
		highestMessageId: "400"
	});
	assert.equal(plugin.calls.status.length, 0);
});

test("the snapshot is not finished while the user is actively scrolling", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({isUserActivelyScrollingMessages: () => true});
	runtime.finishProcessMessages(plugin, {
		channelId: "channel-1",
		channelState: null,
		historicalLoadedPass: false,
		collectedHistoricalMessages: true,
		highestMessageId: "400"
	});
	assert.deepEqual(plugin.calls.snapshots, []);
	assert.equal(plugin.calls.status.length, 1);
});

test("processMessages walks the whole stream and finishes once", () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	const channelState = {boundaryMessageId: "100", initialized: false};
	plugin.channelState = channelState;
	runtime.processMessages(plugin, createEvent([
		{content: {id: "300", attachments: []}},
		{content: {id: "500", attachments: []}}
	]));
	assert.deepEqual(plugin.calls.checkMessage.map(args => args[1].id), ["300", "500"]);
	assert.equal(channelState.boundaryMessageId, "500");
	assert.equal(channelState.initialized, true);
});

// --------------------------------------------------------------------------------
// the per-message pass
// --------------------------------------------------------------------------------

test("the check context falls back to the selected channel and reports the boundary comparison", () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	const context = runtime.createCheckMessageContext(plugin, {id: "500"}, null, {});
	assert.equal(context.channelId, "selected-channel");
	assert.equal(context.isNewerThanBoundary, true);
	assert.equal(context.forceQueue, false);
	assert.equal(context.expectedSignature, "signature-1");
	const older = runtime.createCheckMessageContext(plugin, {id: "50"}, {id: "channel-1"}, {autoTranslateBoundaryId: "100"});
	assert.equal(older.isNewerThanBoundary, false);
	assert.equal(older.channelId, "channel-1");
});

test("any invalidated source forces a requeue", () => {
	const runtime = createRuntime();
	for (const key of ["refreshReceivedMessageSourceState", "invalidateHistoricalTranslationMessage", "invalidateLiveTranslationMessage"]) {
		const plugin = createPlugin({[key]: () => true});
		assert.equal(runtime.createCheckMessageContext(plugin, {id: "500"}, {id: "channel-1"}, {}).forceQueue, true, key);
	}
});

test("the source capture is skipped for own messages and disabled channels", () => {
	const runtime = createRuntime();
	const ownMessage = createPlugin({isOwnMessage: () => true});
	assert.equal(runtime.captureReceivedDisplaySource(ownMessage, {id: "500"}, {channelId: "channel-1"}), null);
	assert.deepEqual(ownMessage.calls.captured, []);
	const disabled = createPlugin({isTranslationEnabled: () => false});
	assert.equal(runtime.captureReceivedDisplaySource(disabled, {id: "500"}, {channelId: "channel-1"}), null);
	assert.deepEqual(disabled.calls.captured, []);
});

test("a same-generation signature change is treated as a source edit", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		getReceivedDisplayRuntimeView: () => ({status: "translated", generation: 1, sourceSignature: "old"})
	});
	const context = {channelId: "channel-1", expectedSignature: "new", originalContentData: {content: "hi", embeds: []}, forceQueue: false};
	runtime.captureReceivedDisplaySource(plugin, {id: "500"}, context);
	assert.equal(context.forceQueue, true);
	assert.deepEqual(plugin.calls.clearedCache, ["500"]);
	assert.equal(plugin.calls.captured[0].generation, 1);
	assert.equal(plugin.calls.captured[0].sourceSignature, "new");
});

test("an idle previous view is not a source edit", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		getReceivedDisplayRuntimeView: () => ({status: "idle", generation: 1, sourceSignature: "old"})
	});
	const context = {channelId: "channel-1", expectedSignature: "new", originalContentData: null, forceQueue: false};
	runtime.captureReceivedDisplaySource(plugin, {id: "500"}, context);
	assert.equal(context.forceQueue, false);
	assert.deepEqual(plugin.calls.clearedCache, []);
});

test("a historical message outside the loaded range is not marked reply-preview eligible", () => {
	const runtime = createRuntime();
	const outside = createPlugin({isMessageWithinLoadedRange: () => false});
	const context = {channelId: "channel-1", historicalLoad: true, skipAutoQueue: false, isNewerThanBoundary: false, expectedSignature: "signature-1"};
	runtime.resolveCheckMessageDisplay(outside, {content: {content: "hi"}}, {id: "500"}, context);
	assert.deepEqual(outside.calls.replyPreviewEligible, []);

	const inside = createPlugin({isMessageWithinLoadedRange: () => true});
	runtime.resolveCheckMessageDisplay(inside, {content: {content: "hi"}}, {id: "500"}, {channelId: "channel-1", historicalLoad: true, skipAutoQueue: false, isNewerThanBoundary: false, expectedSignature: "signature-1"});
	assert.deepEqual(inside.calls.replyPreviewEligible, [["channel-1", "500"]]);
});

test("a live translation is painted straight onto the stream entry", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getActiveMessageTranslation: () => ({content: "translated text"})});
	const stream = {content: {content: "original"}};
	const outcome = runtime.resolveCheckMessageDisplay(plugin, stream, {id: "500"}, {channelId: "channel-1", isNewerThanBoundary: true});
	assert.equal(stream.content.content, "translated text");
	assert.equal(outcome.messageChanged, false);
	assert.equal(outcome.storeCommitted, false);
});

test("a live or manual translation paints the forwarded snapshot body instead of its empty parent content", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getActiveMessageTranslation: () => ({content: "转发译文"})});
	const sourceSnapshot = {message: {content: "forwarded original"}};
	const stream = {content: {id: "500", content: "", messageSnapshots: [sourceSnapshot]}};
	runtime.resolveCheckMessageDisplay(plugin, stream, stream.content, {channelId: "channel-1", isNewerThanBoundary: true});
	assert.equal(stream.content.content, "", "the forward parent remains contentless");
	assert.equal(stream.content.messageSnapshots[0].message.content, "转发译文", "the renderer-visible snapshot receives the translation");
	assert.equal(sourceSnapshot.message.content, "forwarded original", "the source snapshot is not mutated");
});

test("a forwarded live translation uses the forward-specific one-copy body composition", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		getActiveMessageTranslation: () => ({content: "转发译文", originalContent: "forwarded original"}),
		getStreamTranslationRenderContent: () => "转发译文\n> forwarded original"
	});
	const stream = {content: {id: "500", content: "", messageSnapshots: [{message: {content: "forwarded original"}}]}};
	runtime.resolveCheckMessageDisplay(plugin, stream, stream.content, {channelId: "channel-1", isNewerThanBoundary: true});
	assert.equal(stream.content.messageSnapshots[0].message.content, "转发译文\n> forwarded original");
});

test("the forwarded combined paint is recognised as our own output on the next stream pass", () => {
	const runtime = createRuntime();
	const source = {content: "forwarded original", embeds: []};
	const translation = {content: "转发译文", translatedContent: "转发译文", originalContent: "forwarded original"};
	const plugin = createPlugin({
		displayRuntime: {peekSourceArchive: () => null, getDisplayState: () => ({status: "translated", source, translation})},
		getStreamTranslationRenderContent: () => "转发译文\n> forwarded original"
	});
	const message = {id: "500", content: "", messageSnapshots: [{message: {content: "转发译文\n> forwarded original"}}]};
	assert.equal(runtime.resolveOriginalContentDataAnchor(plugin, message), source, "the combined body is not mistaken for a source edit");
});

test("a committed store view is applied when there is no live translation", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getReceivedDisplayRuntimeView: () => ({translated: true, content: "stored text"})});
	const stream = {content: {content: "original"}};
	runtime.resolveCheckMessageDisplay(plugin, stream, {id: "500"}, {channelId: "channel-1", isNewerThanBoundary: true});
	assert.equal(stream.content.content, "stored text");
});

test("an archived source is restored and counts as a message change", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		displayRuntime: {
			getDisplayView: () => ({}),
			hasSourceArchive: () => true,
			consumeSourceArchive: () => ({message: {content: "archived original"}})
		}
	});
	const stream = {content: {content: "stale"}};
	const outcome = runtime.resolveCheckMessageDisplay(plugin, stream, {id: "500"}, {channelId: "channel-1", isNewerThanBoundary: false});
	assert.equal(stream.content.content, "archived original");
	assert.equal(outcome.messageChanged, true);
});

test("manual untranslate restores a forwarded snapshot from its archived visible body", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		displayRuntime: {
			getDisplayView: () => ({}),
			hasSourceArchive: () => true,
			consumeSourceArchive: () => ({message: {content: "", messageSnapshots: [{message: {content: "forwarded original"}}]}})
		}
	});
	const stream = {content: {id: "500", content: "", messageSnapshots: [{message: {content: "转发译文"}}]}};
	const outcome = runtime.resolveCheckMessageDisplay(plugin, stream, stream.content, {channelId: "channel-1", isNewerThanBoundary: false});
	assert.equal(stream.content.messageSnapshots[0].message.content, "forwarded original");
	assert.equal(outcome.messageChanged, true);
});

test("a cached live result commits into the display store without a refresh", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({
		getCachedReceivedTranslation: () => ({translatedContent: "cached", signature: 42}),
		getReceivedDisplayRuntimeView: () => ({translated: true, content: "cached"})
	});
	const outcome = runtime.resolveCheckMessageDisplay(plugin, {content: {content: "x"}}, {id: "500"}, {channelId: "channel-1", isNewerThanBoundary: true, expectedSignature: "signature-1"});
	assert.equal(outcome.storeCommitted, true);
	assert.equal(plugin.calls.commits.length, 1);
	assert.deepEqual(plugin.calls.commits[0][1], {refresh: false});
	assert.equal(plugin.calls.commits[0][0].sourceSignature, "42");
	assert.equal(plugin.calls.commits[0][0].status, "translated");
});

test("a historical pass never commits a cached result during the render", () => {
	const runtime = createRuntime();
	const plugin = createPlugin({getCachedReceivedTranslation: () => ({translatedContent: "cached"})});
	const outcome = runtime.resolveCheckMessageDisplay(plugin, {content: {content: "x"}}, {id: "500"}, {channelId: "channel-1", historicalLoad: true, isNewerThanBoundary: false, expectedSignature: "signature-1"});
	assert.equal(outcome.storeCommitted, false);
	assert.deepEqual(plugin.calls.commits, []);
	assert.deepEqual(outcome.cachedTranslation, {translatedContent: "cached"});
});

test("queueing is refused once the message is already shown, committed or skipped", () => {
	const runtime = createRuntime();
	const base = {channelId: "channel-1", skipAutoQueue: false, isNewerThanBoundary: true, channelState: null};
	const shown = createPlugin();
	runtime.queueCheckMessageTranslation(shown, {id: "500"}, {id: "channel-1"}, base, {translation: {}, canAutoTranslateMessage: true});
	const committed = createPlugin();
	runtime.queueCheckMessageTranslation(committed, {id: "500"}, {id: "channel-1"}, base, {storeCommitted: true, canAutoTranslateMessage: true});
	const skipped = createPlugin();
	runtime.queueCheckMessageTranslation(skipped, {id: "500"}, {id: "channel-1"}, Object.assign({}, base, {skipAutoQueue: true}), {canAutoTranslateMessage: true});
	const blocked = createPlugin();
	runtime.queueCheckMessageTranslation(blocked, {id: "500"}, {id: "channel-1"}, base, {canAutoTranslateMessage: false});
	assert.deepEqual([shown, committed, skipped, blocked].map(plugin => plugin.calls.queued.length), [0, 0, 0, 0]);
});

test("a newer message queues as live work and advances the boundary", () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	const channelState = {boundaryMessageId: "100", initialized: true};
	runtime.queueCheckMessageTranslation(plugin, {id: "500"}, {id: "channel-1"}, {
		channelId: "channel-1",
		channelState,
		skipAutoQueue: false,
		isNewerThanBoundary: true,
		historicalLoad: false,
		deferHistoricalSnapshotStart: false
	}, {canAutoTranslateMessage: true, cachedTranslation: {translatedContent: "cached"}});
	assert.equal(channelState.boundaryMessageId, "500");
	assert.equal(plugin.calls.queued.length, 1);
	assert.deepEqual(plugin.calls.queued[0][3], {
		historicalLoad: false,
		deferHistoricalSnapshotStart: false,
		deferWhileReading: false,
		cachedTranslation: null
	});
});

test("a historical message queues as historical work and carries its cached result", () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	runtime.queueCheckMessageTranslation(plugin, {id: "50"}, null, {
		channelId: "channel-1",
		channelState: null,
		skipAutoQueue: false,
		isNewerThanBoundary: false,
		historicalLoad: true,
		deferHistoricalSnapshotStart: true
	}, {canAutoTranslateMessage: true, cachedTranslation: {translatedContent: "cached"}});
	assert.equal(plugin.calls.queued.length, 1);
	assert.deepEqual(plugin.calls.queued[0][1], {id: "channel-1"}, "a missing channel falls back to the context channel id");
	assert.deepEqual(plugin.calls.queued[0][3], {
		historicalLoad: true,
		deferHistoricalSnapshotStart: true,
		deferWhileReading: false,
		cachedTranslation: {translatedContent: "cached"}
	});
});

test("checkMessage ignores malformed stream entries and otherwise runs the whole pass", () => {
	const runtime = createRuntime();
	const plugin = createPlugin();
	runtime.checkMessage(plugin, null, {id: "500"}, {id: "channel-1"});
	runtime.checkMessage(plugin, {content: null}, {id: "500"}, {id: "channel-1"});
	runtime.checkMessage(plugin, {content: {content: "hi"}}, null, {id: "channel-1"});
	assert.deepEqual(plugin.calls.captured, []);
	assert.deepEqual(plugin.calls.queued, []);

	runtime.checkMessage(plugin, {content: {content: "hi"}}, {id: "500", content: "hi"}, {id: "channel-1"});
	assert.equal(plugin.calls.captured.length, 1);
	assert.equal(plugin.calls.captured[0].channelId, "channel-1");
	assert.equal(plugin.calls.queued.length, 1);
});

test("the Discord history adapter enumerates cache and fetch results across supported fixture shapes without mutating fixtures", async () => {
	const cachedMessages = [
		{id: "300", channel_id: "channel-1", content: "cached-300"},
		{id: "200", channel_id: "channel-1", content: "cached-200"}
	];
	const prefetchedMessages = [
		{id: "100", channel_id: "channel-1", content: "prefetched-100"}
	];
	const cachedSnapshot = JSON.stringify(cachedMessages);
	const prefetchedSnapshot = JSON.stringify(prefetchedMessages);
	const adapter = createDiscordHistoryAdapter({
		messageStore: {
			getMessages: () => ({
				toArray: () => cachedMessages
			})
		},
		fetchMessages: {
			fetchMessages: async request => ({
				request,
				body: {
					messages: new Map(prefetchedMessages.map(message => [message.id, message]))
				}
			})
		}
	});

	const cached = await adapter.listCachedMessages("channel-1");
	const prefetched = await adapter.prefetchMessages({channelId: "channel-1", beforeMessageId: "200", limit: 1});

	assert.deepEqual(cached.map(message => message.id), ["300", "200"]);
	assert.deepEqual(prefetched.map(message => message.id), ["100"]);
	assert.deepEqual(JSON.parse(JSON.stringify(cachedMessages)), JSON.parse(cachedSnapshot));
	assert.deepEqual(JSON.parse(JSON.stringify(prefetchedMessages)), JSON.parse(prefetchedSnapshot));
	assert.notStrictEqual(cached[0], cachedMessages[0]);
	assert.notStrictEqual(prefetched[0], prefetchedMessages[0]);
});

test("the history adapter re-reads the store when the fetch action resolves to a boolean and populates asynchronously", async () => {
	// Real DiscordPTB evidence (2026-08-13): MessageActions.fetchMessages resolves to
	// the boolean `true` and updates MessageStore asynchronously rather than returning
	// messages. The adapter must await the action, then re-read the store snapshot.
	let store = [
		{id: "300", channel_id: "channel-1", content: "cached-300"},
		{id: "200", channel_id: "channel-1", content: "cached-200"}
	];
	let fetchArgs = null;
	const adapter = createDiscordHistoryAdapter({
		messageStore: {
			getMessages: () => ({toArray: () => store})
		},
		fetchMessages: {
			fetchMessages: async request => {
				fetchArgs = request;
				store = store.concat([
					{id: "100", channel_id: "channel-1", content: "fetched-100"},
					{id: "50", channel_id: "channel-1", content: "fetched-50"}
				]);
				return true;
			}
		}
	});

	const prefetched = await adapter.prefetchMessages({channelId: "channel-1", beforeMessageId: "200", limit: 5});

	assert.ok(fetchArgs, "the fetch action still runs");
	assert.deepEqual(prefetched.map(message => message.id).sort(), ["100", "200", "300", "50"]);
	assert.ok(prefetched.every(message => message.channel_id === "channel-1"));
});

test("the history adapter still prefers messages the fetch action returns directly", async () => {
	const adapter = createDiscordHistoryAdapter({
		messageStore: {
			getMessages: () => ({toArray: () => [{id: "999", channel_id: "channel-1", content: "stale-store"}]})
		},
		fetchMessages: {
			fetchMessages: async () => ({body: {messages: [{id: "100", channel_id: "channel-1", content: "direct-100"}]}})
		}
	});

	const prefetched = await adapter.prefetchMessages({channelId: "channel-1", beforeMessageId: "200", limit: 5});
	assert.deepEqual(prefetched.map(message => message.id), ["100"]);
});

test("the history adapter returns nothing when a boolean fetch adds no store messages", async () => {
	const adapter = createDiscordHistoryAdapter({
		messageStore: {getMessages: () => null},
		fetchMessages: {fetchMessages: async () => true}
	});

	const prefetched = await adapter.prefetchMessages({channelId: "channel-1", beforeMessageId: "200", limit: 5});
	assert.deepEqual(prefetched, []);
});
