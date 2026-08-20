const test = require("node:test");
const assert = require("node:assert/strict");
const {
	LOADED_AUTO_TRANSLATE_RANGE_MODES,
	loadedAutoTranslatePolicy,
	aiDecisionPolicy,
	sentTranslationPolicy,
	languageHeuristicsRuntime,
	textSimilarityRuntime,
	createLanguageHeuristics
} = require("../src/language/language-heuristics");

// The module keeps `plugin` as the first parameter of every method, so a test only has
// to supply the collaborators it actually reaches. The script analyser below mirrors the
// plugin's analyzeTextForAutoTranslate/countScriptFamilies/getLanguageScriptFamilies so
// the expectations here match what tests/local-language-precheck.test.js observes
// through the built bundle.
function getLanguageScriptFamilies(languageId) {
	languageId = (languageId || "").toLowerCase();
	if (!languageId) return [];
	if (languageId.startsWith("zh")) return ["han"];
	if (languageId == "ja") return ["han", "kana"];
	if (languageId == "ko") return ["hangul"];
	if (["ru", "uk", "bg", "be", "mk", "sr", "kk", "ky", "mn"].includes(languageId)) return ["cyrillic"];
	if (["ar", "fa", "ur", "ps", "sd", "ug"].includes(languageId)) return ["arabic"];
	if (languageId == "el") return ["greek"];
	if (["he", "iw", "yi"].includes(languageId)) return ["hebrew"];
	if (["hi", "mr", "ne"].includes(languageId)) return ["devanagari"];
	if (languageId == "th") return ["thai"];
	return ["latin"];
}

function countScriptFamilies(text) {
	const counts = {han: 0, kana: 0, hangul: 0, cyrillic: 0, arabic: 0, greek: 0, hebrew: 0, devanagari: 0, thai: 0, latin: 0};
	for (const character of text || "") {
		const codePoint = character.codePointAt(0);
		if (codePoint >= 0x4E00 && codePoint <= 0x9FFF) counts.han++;
		else if ((codePoint >= 0x3040 && codePoint <= 0x30FF) || (codePoint >= 0x31F0 && codePoint <= 0x31FF)) counts.kana++;
		else if (codePoint >= 0xAC00 && codePoint <= 0xD7AF) counts.hangul++;
		else if (codePoint >= 0x0400 && codePoint <= 0x052F) counts.cyrillic++;
		else if (codePoint >= 0x0600 && codePoint <= 0x06FF) counts.arabic++;
		else if (codePoint >= 0x0370 && codePoint <= 0x03FF) counts.greek++;
		else if (codePoint >= 0x0590 && codePoint <= 0x05FF) counts.hebrew++;
		else if (codePoint >= 0x0900 && codePoint <= 0x097F) counts.devanagari++;
		else if (codePoint >= 0x0E00 && codePoint <= 0x0E7F) counts.thai++;
		else if ((codePoint >= 0x0041 && codePoint <= 0x007A) || (codePoint >= 0x00C0 && codePoint <= 0x024F)) counts.latin++;
	}
	return counts;
}

function analyzeTextForAutoTranslate(text, targetLanguageId) {
	const cleanedText = (text || "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\r\n]+`/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/<a?:\w+:\d+>/g, " ").replace(/<@!?\d+>|<#\d+>|<@&\d+>/g, " ").replace(/\s+/g, " ").trim();
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
	const secondaryEntry = scriptEntries[1] || ["", 0];
	const dominantShare = totalLetters ? dominantEntry[1] / totalLetters : 0;
	const secondaryShare = totalLetters ? secondaryEntry[1] / totalLetters : 0;
	const isMixed = dominantEntry[1] >= 2 && secondaryEntry[1] >= 2 && dominantShare >= 0.2 && secondaryShare >= 0.2;
	const strongTargetScriptMatch = targetFamilies[0] != "latin" && targetLetterCount >= 3 && targetShare >= 0.65 && (!isMixed || nonTargetLetterCount <= Math.max(2, targetLetterCount * 0.35));
	return {cleanedText, counts, latinWordCount, hanRunCount, targetFamilies, totalLetters, targetLetterCount, nonTargetLetterCount, targetShare, dominantFamily: dominantEntry[0] || null, isMixed, strongTargetScriptMatch};
}

function createFakePlugin(options = {}) {
	const requestCalls = [];
	const heuristics = createLanguageHeuristics({
		BDFDB: {
			ArrayUtils: {is: Array.isArray},
			LanguageUtils: {getLanguage: () => ({id: options.discordLanguageId || "en"})},
			LibraryRequires: {
				request: (url, requestOptions, callback) => {
					requestCalls.push({url, options: requestOptions});
					(options.respond || ((_url, _options, done) => done(new Error("no stub"), null, "")))(url, requestOptions, callback);
				}
			}
		}
	});
	const languages = Object.assign({
		en: {id: "en", name: "English"},
		fr: {id: "fr", name: "French"},
		es: {id: "es", name: "Spanish"},
		"zh-cn": {id: "zh-cn", name: "Chinese"},
		"zh-CN": {id: "zh-CN", name: "Chinese"},
		auto: {id: "auto", name: "Detect", auto: true},
		$discord: {id: "$discord", name: "Discord", special: true}
	}, options.languages);

	const plugin = {
		requestCalls,
		heuristics,
		settings: {
			general: Object.assign({sendOriginalMessage: false}, options.general),
			filters: Object.assign({}, options.filters)
		},
		ensureSettingsStore: () => ({
			getLanguage: languageId => languages[languageId] || null,
			listChannelPrimaryEngines: () => options.channelPrimaryEngines || []
		}),
		getLanguageScriptFamilies,
		analyzeTextForAutoTranslate,
		normalizeLanguageId: languageId => heuristics.languagePolicy.normalizeLanguageId(plugin, languageId),
		shouldTreatLanguageVariantsAsSame: () => heuristics.receivedSettingsPolicy.shouldTreatLanguageVariantsAsSame(plugin),
		getTranslationSimilarityThreshold: () => heuristics.receivedSettingsPolicy.getTranslationSimilarityThreshold(plugin),
		identifyLatinLanguage: text => languageHeuristicsRuntime.identifyLatinLanguage(plugin, text),
		isMostlyTargetLanguageMessage: (analysis, targetLanguageId) => languageHeuristicsRuntime.isMostlyTargetLanguageMessage(plugin, analysis, targetLanguageId),
		getTextSimilarityScore: (textA, textB) => textSimilarityRuntime.getTextSimilarityScore(plugin, textA, textB),
		isSameLanguageOrVariant(languageA, languageB) {
			if (!languageA || !languageB) return false;
			const normalizedA = plugin.normalizeLanguageId(languageA);
			const normalizedB = plugin.normalizeLanguageId(languageB);
			if (normalizedA == normalizedB) return true;
			if (!plugin.shouldTreatLanguageVariantsAsSame()) return false;
			const rootA = normalizedA.split("-")[0];
			const rootB = normalizedB.split("-")[0];
			return rootA && rootA == rootB;
		},
		// The masking pass is a plugin concern; the language module only cares that it
		// hands back [text, matches, hasTranslatableContent].
		removeExceptions: text => [text, [], !!text],
		getAutoTranslateSourceLanguages: () => options.autoTranslateSourceLanguages || [],
		normalizeLoadedAutoTranslateLimit: value => (parseInt(value, 10) || 50),
		formatOriginalTextForMessage: originalText => `\n(${originalText})`,
		getLanguageChoice: (direction, place, channelId) => (options.getLanguageChoice ? options.getLanguageChoice(direction, place, channelId) : "en"),
		detectLanguage: (text, callback) => heuristics.languageDetectionRuntime.detectLanguage(plugin, text, callback),
		getEffectivePrimaryEngine: () => options.primaryEngine || "googleapi",
		getEffectiveBackupEngine: () => options.backupEngine || "----",
		getGlobalPrimaryEngine: () => options.primaryEngine || "googleapi",
		isEngineConfiguredForRuntime: engineKey => (options.configuredEngines || []).includes(engineKey)
	};
	plugin.matchesConfiguredSourceLanguage = (languageId, sourceLanguages) => heuristics.languagePolicy.matchesConfiguredSourceLanguage(plugin, languageId, sourceLanguages);
	plugin.shouldSkipSentTranslationForSameTarget = (text, channelId, forcedOutputLanguage, callback) => sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(plugin, text, channelId, forcedOutputLanguage, callback);
	plugin.shouldSendOriginalInsteadOfSentTranslation = (originalText, translation, input, output) => sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(plugin, originalText, translation, input, output);
	return plugin;
}

test("the dynamic Discord language normalizes to the client's current locale", () => {
	const english = createFakePlugin({discordLanguageId: "en"});
	const chinese = createFakePlugin({discordLanguageId: "zh-CN"});

	assert.equal(english.normalizeLanguageId("$discord"), "en");
	assert.equal(chinese.normalizeLanguageId("$discord"), "zh-cn");
	assert.equal(english.isSameLanguageOrVariant("en-US", "$discord"), true);
	assert.equal(chinese.isSameLanguageOrVariant("zh-TW", "$discord"), true);
});

// --- Latin stopword identification -----------------------------------------------

test("identifyLatinLanguage names English confidently and keeps the token count", () => {
	const plugin = createFakePlugin();
	const result = languageHeuristicsRuntime.identifyLatinLanguage(plugin, "hello there my friend, how are you doing today");
	assert.equal(result.languageId, "en");
	assert.equal(result.confident, true);
	assert.equal(result.tokenCount, 9);
});

test("identifyLatinLanguage separates French from English", () => {
	const plugin = createFakePlugin();
	const result = languageHeuristicsRuntime.identifyLatinLanguage(plugin, "je ne sais pas ce que tu veux dire avec ce mot");
	assert.equal(result.languageId, "fr");
	assert.equal(result.confident, true);
});

test("identifyLatinLanguage refuses to guess under five tokens", () => {
	const plugin = createFakePlugin();
	const result = languageHeuristicsRuntime.identifyLatinLanguage(plugin, "ok hello");
	assert.equal(result.confident, false);
	assert.equal(result.languageId, null);
	assert.equal(result.tokenCount, 2);
});

test("identifyLatinLanguage is case-blind, but stays silent on a shouted message with no stopwords", () => {
	const plugin = createFakePlugin();
	const shouted = languageHeuristicsRuntime.identifyLatinLanguage(plugin, "HELLO THERE MY FRIEND, HOW ARE YOU DOING TODAY");
	assert.equal(shouted.languageId, "en");
	assert.equal(shouted.confident, true);
	// The all-caps regression message contains no table stopword at all, so the identifier
	// cannot name it. That is exactly why the foreign check leans on script families first.
	const stopwordless = languageHeuristicsRuntime.identifyLatinLanguage(plugin, "I THINK IF U USE 2 HIGGS ACCOUNTS THEN UR ACCOUNTS WOULD BE BANNED");
	assert.equal(stopwordless.languageId, null);
	assert.equal(stopwordless.confident, false);
});

test("identifyLatinLanguage caches its index on the plugin instance, not on the module", () => {
	const first = createFakePlugin();
	const second = createFakePlugin();
	languageHeuristicsRuntime.identifyLatinLanguage(first, "the quick brown fox and the small dog are here");
	assert.ok(first._latinStopwordIndex, "the index is memoized on the plugin that built it");
	assert.equal(second._latinStopwordIndex, undefined, "a second plugin instance must not inherit it");
});

test("identifyShortLatinLanguageHint only fires on a single known word", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.identifyShortLatinLanguageHint(plugin, "bonjour"), "fr");
	assert.equal(languageHeuristicsRuntime.identifyShortLatinLanguageHint(plugin, "gracias"), "es");
	assert.equal(languageHeuristicsRuntime.identifyShortLatinLanguageHint(plugin, "yes"), "en");
	assert.equal(languageHeuristicsRuntime.identifyShortLatinLanguageHint(plugin, "Codex"), null);
	assert.equal(languageHeuristicsRuntime.identifyShortLatinLanguageHint(plugin, "bonjour tout le monde"), null);
});

// --- script families --------------------------------------------------------------

test("isClearlyForeignLanguageMessage: a different script with enough letters is foreign", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "hello there my friend how are you doing today", "zh-CN"), true);
});

test("isClearlyForeignLanguageMessage: all-caps Latin against a Han target is foreign", () => {
	const plugin = createFakePlugin();
	// Regression: the shouted message used to survive the AI skip decision untranslated.
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "I THINK IF U USE 2 HIGGS ACCOUNTS THEN UR ACCOUNTS WOULD BE BANNED", "zh-CN"), true);
});

test("isClearlyForeignLanguageMessage: target-script text is never foreign", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "今天天气真好我们一起出去玩吧", "zh-CN"), false);
});

test("isClearlyForeignLanguageMessage: a Latin proper noun inside Han text is not foreign", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "我用 Dropbox 同步文件没问题", "zh-CN"), false);
});

test("isClearlyForeignLanguageMessage: too few non-target letters stays undecided", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "ok", "zh-CN"), false);
});

test("isClearlyForeignLanguageMessage: Latin vs Latin needs a confident stopword call", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "je ne sais pas ce que tu veux dire avec ce mot", "en"), true);
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "hello there my friend, how are you doing today", "en"), false);
});

test("isClearlyForeignLanguageMessage: an auto or special target is never foreign", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "hello there my friend", "auto"), false);
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "hello there my friend", "$discord"), false);
});

test("detectMessageLanguageLocal only answers for a Latin target with Latin-dominant text", () => {
	const plugin = createFakePlugin();
	const text = "je ne sais pas ce que tu veux dire avec ce mot";
	const latinResult = languageHeuristicsRuntime.detectMessageLanguageLocal(plugin, text, analyzeTextForAutoTranslate(text, "en"), "en");
	const hanResult = languageHeuristicsRuntime.detectMessageLanguageLocal(plugin, text, analyzeTextForAutoTranslate(text, "zh-CN"), "zh-CN");
	assert.equal(latinResult.languageId, "fr");
	assert.equal(latinResult.confident, true);
	assert.deepEqual(hanResult, {languageId: null, confident: false});
});

test("detectMessageLanguageLocal bails out when there is nothing to analyse", () => {
	const plugin = createFakePlugin();
	assert.deepEqual(languageHeuristicsRuntime.detectMessageLanguageLocal(plugin, "", null, "en"), {languageId: null, confident: false});
	assert.deepEqual(languageHeuristicsRuntime.detectMessageLanguageLocal(plugin, "...", analyzeTextForAutoTranslate("...", "en"), "en"), {languageId: null, confident: false});
});

// --- CJK vs Latin target decisions -------------------------------------------------

test("isMostlyTargetLanguageMessage refuses to decide for a Latin target", () => {
	const plugin = createFakePlugin();
	const analysis = analyzeTextForAutoTranslate("hello there my friend how are you", "en");
	assert.equal(languageHeuristicsRuntime.isMostlyTargetLanguageMessage(plugin, analysis, "en"), false);
});

test("isMostlyTargetLanguageMessage accepts a Han message for a Han target", () => {
	const plugin = createFakePlugin();
	const analysis = analyzeTextForAutoTranslate("今天天气真好我们一起出去玩吧", "zh-CN");
	assert.equal(languageHeuristicsRuntime.isMostlyTargetLanguageMessage(plugin, analysis, "zh-CN"), true);
});

test("isHanTargetMessageWithLatinTerms tolerates a few Latin terms but not a Latin sentence", () => {
	const plugin = createFakePlugin();
	const withTerm = analyzeTextForAutoTranslate("我用 Dropbox 同步文件没问题", "zh-CN");
	const withSentence = analyzeTextForAutoTranslate("你好 this is a long english sentence about nothing", "zh-CN");
	assert.equal(languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, withTerm, "zh-CN"), true);
	assert.equal(languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, withSentence, "zh-CN"), false);
	// The shortcut is what lets Han text with a product name skip the translator outright,
	// even though its 0.56 target share clears none of the plain share thresholds.
	assert.ok(withTerm.targetShare < 0.68 && withTerm.targetLetterCount < 12, `unexpected fixture shape: ${withTerm.targetShare}`);
	assert.equal(languageHeuristicsRuntime.isClearlyTargetLanguageMessage(plugin, withTerm, "zh-CN"), true);
	assert.equal(languageHeuristicsRuntime.isMostlyTargetLanguageMessage(plugin, withTerm, "zh-CN"), true);
});

test("isHanTargetMessageWithLatinTerms rejects a third script in the mix", () => {
	const plugin = createFakePlugin();
	// Cyrillic is neither the Han target nor Latin, so the "only Latin terms" shape breaks.
	const analysis = analyzeTextForAutoTranslate("我用 привет 同步文件没问题", "zh-CN");
	assert.equal(languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, analysis, "zh-CN"), false);
});

test("isClearlyTargetLanguageMessage is stricter than isMostlyTargetLanguageMessage", () => {
	const plugin = createFakePlugin();
	// 8 Cyrillic letters against 5 Latin ones. A 0.62 target share is enough to call the
	// message mostly Russian, but not enough to skip the translator before the request.
	const mixed = analyzeTextForAutoTranslate("приветик hello", "ru");
	assert.equal(mixed.targetLetterCount, 8);
	assert.equal(mixed.nonTargetLetterCount, 5);
	assert.equal(languageHeuristicsRuntime.isMostlyTargetLanguageMessage(plugin, mixed, "ru"), true);
	assert.equal(languageHeuristicsRuntime.isClearlyTargetLanguageMessage(plugin, mixed, "ru"), false);
	const clean = analyzeTextForAutoTranslate("приветик", "ru");
	assert.equal(languageHeuristicsRuntime.isClearlyTargetLanguageMessage(plugin, clean, "ru"), true);
	assert.equal(languageHeuristicsRuntime.isClearlyTargetLanguageMessage(plugin, analyzeTextForAutoTranslate("今天天气真好我们一起出去玩吧", "zh-CN"), "zh-CN"), true);
});

test("isClearlyTargetLanguageMessage never fires for a Latin target", () => {
	const plugin = createFakePlugin();
	const analysis = analyzeTextForAutoTranslate("hello there my friend how are you doing today", "en");
	assert.equal(analysis.targetShare, 1);
	assert.equal(languageHeuristicsRuntime.isClearlyTargetLanguageMessage(plugin, analysis, "en"), false);
});

test("target-language checks treat an empty analysis as undecided", () => {
	const plugin = createFakePlugin();
	const empty = analyzeTextForAutoTranslate("!!! ???", "zh-CN");
	assert.equal(empty.totalLetters, 0);
	assert.equal(languageHeuristicsRuntime.isMostlyTargetLanguageMessage(plugin, empty, "zh-CN"), false);
	assert.equal(languageHeuristicsRuntime.isClearlyTargetLanguageMessage(plugin, empty, "zh-CN"), false);
	assert.equal(languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, empty, "zh-CN"), false);
});

// --- "did the translation come back in the target language" ------------------------

test("isTranslationLikelyInTargetLanguage rejects an obvious wrong-script result", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "hello there my friend", "zh-CN"), false);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "你好朋友", "zh-CN"), true);
});

test("isTranslationLikelyInTargetLanguage rejects a confidently wrong Latin language", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "hello there my friend, how are you doing today", "fr"), false);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "je ne sais pas ce que tu veux dire avec ce mot", "en"), false);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "no se que hacer porque esto es para todos los que estan aqui", "en"), false);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "je ne sais pas ce que tu veux dire avec ce mot", "fr"), true);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "ok hello", "fr"), true);
});

test("isTranslationLikelyInTargetLanguage rejects a known short word in the wrong language", () => {
	const plugin = createFakePlugin();
	const mismatches = [["oui", "en"], ["bonjour", "en"], ["hola", "en"], ["gracias", "en"], ["yes", "fr"], ["oui", "zh-CN"]];
	for (const [text, target] of mismatches) assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, text, target), false, `${text} should not be accepted as ${target}`);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "oui", "fr"), true);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "hola", "es"), true);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "yes", "en"), true);
});

test("isTranslationLikelyInTargetLanguage keeps ambiguous and unknown short words", () => {
	const plugin = createFakePlugin();
	for (const text of ["ok", "no", "Rin", "Codex"]) {
		assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, text, "fr"), true, `${text} should remain conservative`);
	}
});

test("isTranslationLikelyInTargetLanguage accepts anything for auto and special targets", () => {
	const plugin = createFakePlugin();
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "hello there my friend", "auto"), true);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "hello there my friend", "$discord"), true);
	assert.equal(languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(plugin, "", "zh-CN"), true);
});

// --- similarity ---------------------------------------------------------------------

test("normalizeComparisonText strips urls, ASCII punctuation and CJK punctuation", () => {
	const plugin = createFakePlugin();
	assert.equal(textSimilarityRuntime.normalizeComparisonText(plugin, "Hello, World! https://example.com/a"), "helloworld");
	assert.equal(textSimilarityRuntime.normalizeComparisonText(plugin, "你好，世界！（真的）"), "你好世界真的");
	assert.equal(textSimilarityRuntime.normalizeComparisonText(plugin, null), "");
});

test("getTextSimilarityScore scores identical, punctuation-only and unrelated text", () => {
	const plugin = createFakePlugin();
	assert.equal(textSimilarityRuntime.getTextSimilarityScore(plugin, "hello world", "Hello, World!"), 1);
	assert.equal(textSimilarityRuntime.getTextSimilarityScore(plugin, "hello", ""), 0);
	assert.ok(textSimilarityRuntime.getTextSimilarityScore(plugin, "hello there friend", "bonjour mon ami") < 0.3);
	const partial = textSimilarityRuntime.getTextSimilarityScore(plugin, "the quick brown fox", "the quick brown dog");
	assert.ok(partial > 0.7 && partial < 1, `expected a partial score, got ${partial}`);
});

test("getTranslationSimilarityThreshold clamps the stored value into [0.5, 0.99]", () => {
	assert.equal(createFakePlugin().heuristics.receivedSettingsPolicy.getTranslationSimilarityThreshold(createFakePlugin()), 0.9);
	const high = createFakePlugin({filters: {translationSimilarityThreshold: 5}});
	const low = createFakePlugin({filters: {translationSimilarityThreshold: 0.1}});
	const junk = createFakePlugin({filters: {translationSimilarityThreshold: "nonsense"}});
	assert.equal(high.heuristics.receivedSettingsPolicy.getTranslationSimilarityThreshold(high), 0.99);
	assert.equal(low.heuristics.receivedSettingsPolicy.getTranslationSimilarityThreshold(low), 0.5);
	assert.equal(junk.heuristics.receivedSettingsPolicy.getTranslationSimilarityThreshold(junk), 0.9);
});

test("shouldSendOriginalInsteadOfSentTranslation falls back on empty, same-language and near-identical results", () => {
	const plugin = createFakePlugin();
	assert.equal(sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(plugin, "hello", "", null, null), true);
	assert.equal(sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(plugin, "hello", "bonjour", {id: "en"}, {id: "en-GB"}), true);
	assert.equal(sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(plugin, "hello world", "hello world.", null, null), true);
	assert.equal(sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(plugin, "hello there friend", "bonjour mon ami", null, null), false);
});

test("shouldSendOriginalInsteadOfSentTranslation never drops below the 0.94 sent-message floor", () => {
	// The configured threshold is deliberately low; the sent path must still use 0.94.
	const plugin = createFakePlugin({filters: {translationSimilarityThreshold: 0.5}});
	const score = textSimilarityRuntime.getTextSimilarityScore(plugin, "the quick brown fox", "the quick brown dog");
	assert.ok(score > 0.5 && score < 0.94, `the fixture must sit between the two thresholds, got ${score}`);
	assert.equal(sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(plugin, "the quick brown fox", "the quick brown dog", null, null), false);
});

test("buildSentTranslationMessageValue appends the original only when the setting is on", () => {
	const plain = createFakePlugin();
	assert.equal(sentTranslationPolicy.buildSentTranslationMessageValue(plain, "hello there friend", "bonjour mon ami", null, null), "bonjour mon ami");
	const withOriginal = createFakePlugin({general: {sendOriginalMessage: true}});
	assert.equal(sentTranslationPolicy.buildSentTranslationMessageValue(withOriginal, "hello there friend", "bonjour mon ami", null, null), "bonjour mon ami\n(hello there friend)");
	// A rejected translation sends the original text, never the appended form.
	assert.equal(sentTranslationPolicy.buildSentTranslationMessageValue(withOriginal, "hello", "", null, null), "hello");
});

// --- sent-message skip decision -----------------------------------------------------

test("shouldSkipSentTranslationForSameTarget short-circuits on auto and special targets", () => {
	const auto = createFakePlugin({getLanguageChoice: () => "auto"});
	const special = createFakePlugin({getLanguageChoice: () => "$discord"});
	const seen = [];
	sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(auto, "hello", "channel-1", null, (same, detected) => seen.push([same, detected]));
	sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(special, "hello", "channel-1", null, (same, detected) => seen.push([same, detected]));
	assert.deepEqual(seen, [[false, null], [false, null]]);
});

test("shouldSkipSentTranslationForSameTarget trusts a pinned input language without detecting", () => {
	const plugin = createFakePlugin({getLanguageChoice: (direction) => (direction == "input" ? "fr" : "fr")});
	plugin.detectLanguage = () => { throw new Error("detection must not run when the input language is pinned"); };
	let result = null;
	sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(plugin, "bonjour", "channel-1", null, (same, detected) => { result = [same, detected]; });
	assert.deepEqual(result, [true, "fr"]);
});

test("shouldSkipSentTranslationForSameTarget skips a Han message aimed at a Han target", () => {
	const plugin = createFakePlugin({getLanguageChoice: direction => (direction == "input" ? "auto" : "zh-CN")});
	plugin.detectLanguage = () => { throw new Error("the local analysis already answered"); };
	let result = null;
	sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(plugin, "今天天气真好我们一起出去玩吧", "channel-1", null, (same, detected) => { result = [same, detected]; });
	assert.deepEqual(result, [true, "zh-CN"]);
});

test("shouldSkipSentTranslationForSameTarget falls through to detection and honours a forced target", () => {
	const plugin = createFakePlugin({getLanguageChoice: direction => (direction == "input" ? "auto" : "en")});
	const detected = [];
	plugin.detectLanguage = (text, callback) => { detected.push(text); callback("fr"); };
	let result = null;
	sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(plugin, "bonjour mon ami", "channel-1", "fr", (same, detectedLanguage) => { result = [same, detectedLanguage]; });
	assert.deepEqual(detected, ["bonjour mon ami"]);
	// Forced output "fr" matches the detected "fr", so the sent translation is skipped.
	assert.deepEqual(result, [true, "fr"]);
});

test("shouldAutoTranslateSentMessage filters the detected language through the configured sources", () => {
	const plugin = createFakePlugin({getLanguageChoice: direction => (direction == "input" ? "auto" : "en"), autoTranslateSourceLanguages: ["fr"]});
	plugin.detectLanguage = (text, callback) => callback("fr");
	let allowed = null;
	sentTranslationPolicy.shouldAutoTranslateSentMessage(plugin, "bonjour mon ami", "channel-1", value => { allowed = value; });
	assert.equal(allowed, true);

	const blocked = createFakePlugin({getLanguageChoice: direction => (direction == "input" ? "auto" : "en"), autoTranslateSourceLanguages: ["es"]});
	blocked.detectLanguage = (text, callback) => callback("fr");
	let blockedResult = null;
	sentTranslationPolicy.shouldAutoTranslateSentMessage(blocked, "bonjour mon ami", "channel-1", value => { blockedResult = value; });
	assert.equal(blockedResult, false);
});

test("shouldAutoTranslateSentMessage stops as soon as the target language matches", () => {
	const plugin = createFakePlugin({getLanguageChoice: direction => (direction == "input" ? "en" : "en")});
	let allowed = null;
	sentTranslationPolicy.shouldAutoTranslateSentMessage(plugin, "hello there", "channel-1", value => { allowed = value; });
	assert.equal(allowed, false);
});

// --- language policy (injected BDFDB) ------------------------------------------------

test("getConcreteConfiguredLanguages drops auto, special, unknown and duplicate ids", () => {
	const plugin = createFakePlugin({filters: {receivedAutoTranslateSourceLanguages: ["fr", "fr", "auto", "$discord", "klingon", "es"]}});
	assert.deepEqual(plugin.heuristics.languagePolicy.getConcreteConfiguredLanguages(plugin, "receivedAutoTranslateSourceLanguages"), ["fr", "es"]);
});

test("getConcreteConfiguredLanguages goes through the injected BDFDB array check", () => {
	let checks = 0;
	const heuristics = createLanguageHeuristics({BDFDB: {ArrayUtils: {is: value => { checks++; return Array.isArray(value); }}}});
	const plugin = createFakePlugin({filters: {receivedAutoTranslateSourceLanguages: "not-an-array"}});
	assert.deepEqual(heuristics.languagePolicy.getConcreteConfiguredLanguages(plugin, "receivedAutoTranslateSourceLanguages"), []);
	assert.equal(checks, 1);
});

test("matchesConfiguredSourceLanguage matches a language and either direction of its variants", () => {
	const plugin = createFakePlugin();
	const {languagePolicy} = plugin.heuristics;
	assert.equal(languagePolicy.normalizeLanguageId(plugin, "EN-GB"), "en-gb");
	assert.equal(languagePolicy.matchesConfiguredSourceLanguage(plugin, "zh-CN", ["zh"]), true);
	assert.equal(languagePolicy.matchesConfiguredSourceLanguage(plugin, "zh", ["zh-TW"]), true);
	assert.equal(languagePolicy.matchesConfiguredSourceLanguage(plugin, "EN", ["en"]), true);
	assert.equal(languagePolicy.matchesConfiguredSourceLanguage(plugin, "en", ["fr", "es"]), false);
	assert.equal(languagePolicy.matchesConfiguredSourceLanguage(plugin, "", ["en"]), false);
});

test("matchesConfiguredSourceLanguage falls back to the plugin's configured source list", () => {
	const plugin = createFakePlugin({autoTranslateSourceLanguages: ["fr"]});
	assert.equal(plugin.heuristics.languagePolicy.matchesConfiguredSourceLanguage(plugin, "fr", null), true);
	assert.equal(plugin.heuristics.languagePolicy.matchesConfiguredSourceLanguage(plugin, "de", null), false);
});

// --- detection strategies --------------------------------------------------------------

test("detectLanguage short-circuits on unusable text without touching the network", () => {
	const plugin = createFakePlugin();
	let detected = "unset";
	plugin.heuristics.languageDetectionRuntime.detectLanguage(plugin, "   ", languageId => { detected = languageId; });
	assert.equal(detected, null);
	assert.equal(plugin.requestCalls.length, 0);
});

test("detectLanguage local_first answers locally when the stopwords are confident", () => {
	const plugin = createFakePlugin({filters: {languageDetectionStrategy: "local_first"}});
	let detected = null;
	plugin.heuristics.languageDetectionRuntime.detectLanguage(plugin, "the quick brown fox and the small dog are here", languageId => { detected = languageId; });
	assert.equal(detected, "en");
	assert.equal(plugin.requestCalls.length, 0);
});

test("detectLanguage local_only gives up instead of falling back to the network", () => {
	const plugin = createFakePlugin({filters: {languageDetectionStrategy: "local_only"}});
	let detected = "unset";
	plugin.heuristics.languageDetectionRuntime.detectLanguage(plugin, "bonjour", languageId => { detected = languageId; });
	assert.equal(detected, null);
	assert.equal(plugin.requestCalls.length, 0);
});

test("detectLanguage google_free ignores a confident local result and encodes the query", () => {
	const plugin = createFakePlugin({
		filters: {languageDetectionStrategy: "google_free"},
		respond: (url, options, callback) => callback(null, {statusCode: 200}, JSON.stringify({src: "fr"}))
	});
	let detected = null;
	plugin.heuristics.languageDetectionRuntime.detectLanguage(plugin, "the quick brown fox and the small dog are here", languageId => { detected = languageId; });
	assert.equal(detected, "fr");
	assert.equal(plugin.requestCalls.length, 1);
	assert.equal(plugin.requestCalls[0].url, "https://translate.googleapis.com/translate_a/single");
	assert.equal(plugin.requestCalls[0].options.form.q, encodeURIComponent("the quick brown fox and the small dog are here"));
});

test("detectLanguage resolves null on a bad status, a transport error or unparsable JSON", () => {
	const cases = [
		[(url, options, callback) => callback(new Error("offline"), null, "")],
		[(url, options, callback) => callback(null, {statusCode: 500}, "{}")],
		[(url, options, callback) => callback(null, {statusCode: 200}, "{not-json")]
	];
	for (const [respond] of cases) {
		const plugin = createFakePlugin({respond});
		let detected = "unset";
		plugin.heuristics.languageDetectionRuntime.detectLanguage(plugin, "bonjour", languageId => { detected = languageId; });
		assert.equal(detected, null);
	}
});

test("getStrategy rejects an unknown strategy and defaults to local_first", () => {
	const plugin = createFakePlugin({filters: {languageDetectionStrategy: "telepathy"}});
	assert.equal(plugin.heuristics.languageDetectionRuntime.getStrategy(plugin), "local_first");
	assert.equal(plugin.heuristics.languageDetectionRuntime.getStrategy(createFakePlugin()), "local_first");
});

test("getDetectableLanguageText returns nothing when the mask protects the whole message", () => {
	const plugin = createFakePlugin();
	plugin.removeExceptions = () => ["", [], false];
	assert.equal(plugin.heuristics.languageDetectionRuntime.getDetectableLanguageText(plugin, "  !ignored  "), "");
});

// --- AI decision mode ------------------------------------------------------------------

test("the AI decision mode is opt-in and needs a supported, configured engine", () => {
	const basic = createFakePlugin({filters: {autoTranslateDecisionMode: "basic"}, primaryEngine: "deepseek", configuredEngines: ["deepseek"]});
	assert.equal(aiDecisionPolicy.getAutoTranslateDecisionMode(basic), "basic");
	assert.equal(aiDecisionPolicy.shouldUseAiAutoTranslateDecision(basic, "channel-1"), false);

	const unconfigured = createFakePlugin({filters: {autoTranslateDecisionMode: "ai"}, primaryEngine: "deepseek", configuredEngines: []});
	assert.equal(aiDecisionPolicy.getAutoTranslateDecisionMode(unconfigured), "ai");
	assert.equal(aiDecisionPolicy.isAiAutoTranslateDecisionAvailable(unconfigured, "channel-1"), false);
	assert.equal(aiDecisionPolicy.shouldUseAiAutoTranslateDecision(unconfigured, "channel-1"), false);

	const ready = createFakePlugin({filters: {autoTranslateDecisionMode: "ai"}, primaryEngine: "deepseek", configuredEngines: ["deepseek"]});
	assert.equal(aiDecisionPolicy.shouldUseAiAutoTranslateDecision(ready, "channel-1"), true);
});

test("only the AI engines support the decision call", () => {
	const plugin = createFakePlugin();
	for (const engineKey of ["deepseek", "openai", "gemini", "oaicompat"]) assert.equal(aiDecisionPolicy.supportsAiAutoTranslateDecisionEngine(plugin, engineKey), true);
	for (const engineKey of ["googleapi", "deepl", "----", null]) assert.equal(aiDecisionPolicy.supportsAiAutoTranslateDecisionEngine(plugin, engineKey), false);
});

test("without a channel the AI decision also considers the per-channel engine overrides", () => {
	const plugin = createFakePlugin({
		filters: {autoTranslateDecisionMode: "ai"},
		primaryEngine: "googleapi",
		channelPrimaryEngines: ["openai"],
		configuredEngines: ["openai"]
	});
	assert.equal(aiDecisionPolicy.isAiAutoTranslateDecisionAvailable(plugin, null), true);
	// Scoped to a channel that uses the plain translator, the AI path is unavailable.
	assert.equal(aiDecisionPolicy.isAiAutoTranslateDecisionAvailable(plugin, "channel-1"), false);
});

test("a local clearly-foreign call is what can overrule an AI skip decision", () => {
	// The AI decision engine answers with the skip token; the safety net re-checks the
	// message locally, and script-family evidence alone is enough to overrule the skip.
	const plugin = createFakePlugin({filters: {autoTranslateDecisionMode: "ai"}, primaryEngine: "deepseek", configuredEngines: ["deepseek"]});
	assert.equal(aiDecisionPolicy.shouldUseAiAutoTranslateDecision(plugin, "channel-1"), true);
	const aiSaidSkip = true;
	const overruled = aiSaidSkip && languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "I THINK IF U USE 2 HIGGS ACCOUNTS THEN UR ACCOUNTS WOULD BE BANNED", "zh-CN");
	assert.equal(overruled, true);
	// A genuinely target-language message leaves the skip standing.
	assert.equal(languageHeuristicsRuntime.isClearlyForeignLanguageMessage(plugin, "今天天气真好我们一起出去玩吧", "zh-CN"), false);
});

// --- settings policies -------------------------------------------------------------------

test("loaded auto-translate scope, range mode and time windows normalise stored values", () => {
	const plugin = createFakePlugin({filters: {receivedAutoTranslateScope: "loaded_messages", receivedAutoTranslateLoadedTimeWindow: "6h"}});
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateScope(plugin), "loaded_messages");
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindow(plugin), "6h");
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindowMs(plugin), 6 * 60 * 60 * 1000);
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedRangeMode(plugin), LOADED_AUTO_TRANSLATE_RANGE_MODES.COUNT);

	const fallback = createFakePlugin({filters: {receivedAutoTranslateScope: "nonsense", receivedAutoTranslateLoadedTimeWindow: "nonsense"}});
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateScope(fallback), "new_only");
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindow(fallback), "1h");
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindowMs(fallback), 60 * 60 * 1000);

	const unlimited = createFakePlugin({filters: {receivedAutoTranslateLoadedTimeWindow: "all"}});
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindowMs(unlimited), 0);
});

test("the loaded auto-translate scroll switches default to on and only an explicit false turns them off", () => {
	const defaults = createFakePlugin();
	assert.equal(loadedAutoTranslatePolicy.shouldPauseLoadedAutoTranslateWhileScrolling(defaults), true);
	assert.equal(loadedAutoTranslatePolicy.shouldContinueLoadedAutoTranslateOnScroll(defaults), true);
	const off = createFakePlugin({filters: {pauseLoadedAutoTranslateWhileScrolling: false, continueLoadedAutoTranslateOnScroll: false}});
	assert.equal(loadedAutoTranslatePolicy.shouldPauseLoadedAutoTranslateWhileScrolling(off), false);
	assert.equal(loadedAutoTranslatePolicy.shouldContinueLoadedAutoTranslateOnScroll(off), false);
});

test("the received filter switches default to on, and the length floors stay at zero", () => {
	const plugin = createFakePlugin();
	const {receivedSettingsPolicy} = plugin.heuristics;
	assert.equal(receivedSettingsPolicy.shouldTreatLanguageVariantsAsSame(plugin), true);
	assert.equal(receivedSettingsPolicy.shouldSkipSameLanguageReceivedMessages(plugin), true);
	assert.equal(receivedSettingsPolicy.useLocalLanguagePrecheck(plugin), true);
	assert.equal(receivedSettingsPolicy.shouldDropSimilarTranslations(plugin), true);
	// Mixed-script skipping was retired; it must stay off no matter what is stored.
	assert.equal(receivedSettingsPolicy.shouldSkipMixedReceivedMessages(plugin), false);
	// Short interjections still carry meaning, so nothing is skipped for being short.
	assert.equal(receivedSettingsPolicy.getMinimumAutoTranslateLength(plugin), 0);
	assert.equal(receivedSettingsPolicy.getAutoTranslateMinimumLengthForAnalysis(plugin, analyzeTextForAutoTranslate("hi", "en")), 0);

	const off = createFakePlugin({filters: {treatLanguageVariantsAsSame: false, skipSameLanguageReceivedMessages: false, useLocalLanguagePrecheck: false, dropSimilarTranslations: false, skipMixedReceivedMessages: true}});
	assert.equal(off.heuristics.receivedSettingsPolicy.shouldTreatLanguageVariantsAsSame(off), false);
	assert.equal(off.heuristics.receivedSettingsPolicy.shouldSkipSameLanguageReceivedMessages(off), false);
	assert.equal(off.heuristics.receivedSettingsPolicy.useLocalLanguagePrecheck(off), false);
	assert.equal(off.heuristics.receivedSettingsPolicy.shouldDropSimilarTranslations(off), false);
	assert.equal(off.heuristics.receivedSettingsPolicy.shouldSkipMixedReceivedMessages(off), false);
});

test("turning off variant matching makes zh-CN and zh-TW different languages", () => {
	const plugin = createFakePlugin({filters: {treatLanguageVariantsAsSame: false}});
	assert.equal(plugin.isSameLanguageOrVariant("zh-CN", "zh-TW"), false);
	const lenient = createFakePlugin();
	assert.equal(lenient.isSameLanguageOrVariant("zh-CN", "zh-TW"), true);
});

test("getReceivedAutoTranslateSourceLanguages reads its own settings key through languagePolicy", () => {
	const plugin = createFakePlugin({filters: {receivedAutoTranslateSourceLanguages: ["fr", "auto"], autoTranslateSourceLanguages: ["es"]}});
	assert.deepEqual(plugin.heuristics.receivedSettingsPolicy.getReceivedAutoTranslateSourceLanguages(plugin), ["fr"]);
});

test("getFilterSettings survives a plugin with no settings at all", () => {
	const plugin = {settings: null};
	assert.deepEqual(loadedAutoTranslatePolicy.getFilterSettings(plugin), {});
	assert.equal(loadedAutoTranslatePolicy.getReceivedAutoTranslateScope(plugin), "new_only");
	assert.equal(aiDecisionPolicy.getAutoTranslateDecisionMode(plugin), "basic");
});
