// Owns the language side of "should this text be translated, and did the translation
// come back in the language we asked for". Everything here used to sit in the plugin
// factory closure between the embed patch and the plugin class, where it could reach
// any of the 7000 surrounding lines.
//
// The module is deliberately split in two:
//
// - The pure objects below are exported directly. They read settings off the plugin and
//   call plugin methods, but they need nothing from BetterDiscord, so a test can drive
//   them with a hand-built fake plugin.
// - createLanguageHeuristics(dependencies) wraps the three objects that genuinely need
//   BDFDB: languagePolicy (BDFDB.ArrayUtils.is), languageDetectionRuntime
//   (BDFDB.LibraryRequires.request), and receivedSettingsPolicy, which is only impure
//   because it resolves its configured source languages through languagePolicy.
//
// Every method keeps `plugin` as its first parameter, exactly as the legacy runtime had
// it: the plugin class methods are one-line delegations, and the analysis helpers these
// call (analyzeTextForAutoTranslate, getLanguageScriptFamilies, isSameLanguageOrVariant,
// normalizeLanguageId, removeExceptions, ensureSettingsStore) still live on the plugin.
//
// Two memo caches, plugin._latinStopwordIndex and plugin._shortLatinLanguageHintIndex,
// are stored on the plugin instance rather than in this module, so two plugin instances
// in one process (which is what the test suite does) never share a built index.

// Same values as the legacy languageTypes/messageTypes maps in runtime.js, and as
// LANGUAGE_DIRECTIONS in settings-store.js. Kept as a local copy because these are
// runtime-wide vocabulary, not something this module should own for everyone else.
const LANGUAGE_DIRECTIONS = Object.freeze({INPUT: "input", OUTPUT: "output"});
const MESSAGE_DIRECTIONS = Object.freeze({RECEIVED: "received", SENT: "sent"});

// The loaded-message range mode. Only getReceivedAutoTranslateLoadedRangeMode decides
// it, and that lives here, so the enum moved in with it; the settings panel and the
// message-window check in the legacy runtime import it back from this module.
const LOADED_AUTO_TRANSLATE_RANGE_MODES = {COUNT: "count", TIME: "time"};

// All three settings policies read the same record, and two of them expose it as a
// public getFilterSettings(plugin) method. The shared helper is what lets the pure
// objects stay out of the factory.
function getFilterSettings(plugin) {
	return plugin.settings && plugin.settings.filters || {};
}

const loadedAutoTranslatePolicy = {
	getFilterSettings(plugin) {
		return getFilterSettings(plugin);
	},
	getReceivedAutoTranslateScope(plugin) {
		const scope = loadedAutoTranslatePolicy.getFilterSettings(plugin).receivedAutoTranslateScope;
		return scope == "loaded_messages" ? "loaded_messages" : "new_only";
	},
	getReceivedAutoTranslateLoadedRangeMode(_plugin) {
		return LOADED_AUTO_TRANSLATE_RANGE_MODES.COUNT;
	},
	getReceivedAutoTranslateLoadedTimeWindow(plugin) {
		const value = loadedAutoTranslatePolicy.getFilterSettings(plugin).receivedAutoTranslateLoadedTimeWindow;
		return ["15m", "1h", "6h", "24h", "all"].includes(value) ? value : "1h";
	},
	getReceivedAutoTranslateLoadedLimit(plugin) {
		return plugin.normalizeLoadedAutoTranslateLimit(loadedAutoTranslatePolicy.getFilterSettings(plugin).receivedAutoTranslateLoadedLimit);
	},
	shouldPauseLoadedAutoTranslateWhileScrolling(plugin) {
		return loadedAutoTranslatePolicy.getFilterSettings(plugin).pauseLoadedAutoTranslateWhileScrolling !== false;
	},
	shouldContinueLoadedAutoTranslateOnScroll(plugin) {
		return loadedAutoTranslatePolicy.getFilterSettings(plugin).continueLoadedAutoTranslateOnScroll !== false;
	},
	getReceivedAutoTranslateLoadedTimeWindowMs(plugin) {
		const window = loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindow(plugin);
		if (window == "15m") return 15 * 60 * 1000;
		if (window == "1h") return 60 * 60 * 1000;
		if (window == "6h") return 6 * 60 * 60 * 1000;
		if (window == "24h") return 24 * 60 * 60 * 1000;
		return 0;
	}
};

const aiDecisionPolicy = {
	getAutoTranslateDecisionMode(plugin) {
		const mode = getFilterSettings(plugin).autoTranslateDecisionMode;
		return mode == "ai" ? "ai" : "basic";
	},
	supportsAiAutoTranslateDecisionEngine(_plugin, engineKey) {
		return ["deepseek", "openai", "gemini", "oaicompat"].includes(engineKey);
	},
	isAiAutoTranslateDecisionAvailable(plugin, channelId = null) {
		const engineKeys = channelId ? [
			plugin.getEffectivePrimaryEngine(channelId),
			plugin.getEffectiveBackupEngine(channelId)
		] : [
			plugin.getGlobalPrimaryEngine(),
			plugin.getEffectiveBackupEngine(),
			...plugin.ensureSettingsStore().listChannelPrimaryEngines()
		];
		return [...new Set(engineKeys)].some(engineKey => aiDecisionPolicy.supportsAiAutoTranslateDecisionEngine(plugin, engineKey) && plugin.isEngineConfiguredForRuntime(engineKey));
	},
	shouldUseAiAutoTranslateDecision(plugin, channelId = null) {
		return aiDecisionPolicy.getAutoTranslateDecisionMode(plugin) == "ai" && aiDecisionPolicy.isAiAutoTranslateDecisionAvailable(plugin, channelId);
	}
};

const sentTranslationPolicy = {
	shouldSkipSentTranslationForSameTarget(plugin, text, channelId, forcedOutputLanguage = null, callback) {
		const targetLanguageId = forcedOutputLanguage || plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.OUTPUT, MESSAGE_DIRECTIONS.SENT, channelId);
		const targetLanguage = targetLanguageId && plugin.ensureSettingsStore().getLanguage(targetLanguageId);
		if (!targetLanguageId || targetLanguageId == "auto" || targetLanguage && targetLanguage.special) return callback(false, null);
		const configuredInputLanguage = plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.INPUT, MESSAGE_DIRECTIONS.SENT, channelId);
		if (configuredInputLanguage && configuredInputLanguage != "auto") return callback(plugin.isSameLanguageOrVariant(configuredInputLanguage, targetLanguageId), configuredInputLanguage);
		const analysis = plugin.analyzeTextForAutoTranslate(text, targetLanguageId);
		if (plugin.isMostlyTargetLanguageMessage(analysis, targetLanguageId)) return callback(true, targetLanguageId);
		plugin.detectLanguage(text, detectedLanguage => callback(!!detectedLanguage && plugin.isSameLanguageOrVariant(detectedLanguage, targetLanguageId), detectedLanguage));
	},
	shouldAutoTranslateSentMessage(plugin, text, channelId, callback, forcedOutputLanguage = null) {
		plugin.shouldSkipSentTranslationForSameTarget(text, channelId, forcedOutputLanguage, (sameLanguage, detectedLanguage) => {
			if (sameLanguage) return callback(false);
			const sourceLanguages = plugin.getAutoTranslateSourceLanguages();
			if (!sourceLanguages.length) return callback(true);
			const configuredInputLanguage = plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.INPUT, MESSAGE_DIRECTIONS.SENT, channelId);
			if (configuredInputLanguage && configuredInputLanguage != "auto") return callback(plugin.matchesConfiguredSourceLanguage(configuredInputLanguage, sourceLanguages));
			if (detectedLanguage) return callback(plugin.matchesConfiguredSourceLanguage(detectedLanguage, sourceLanguages));
			plugin.detectLanguage(text, detectedLanguageId => callback(plugin.matchesConfiguredSourceLanguage(detectedLanguageId, sourceLanguages)));
		});
	},
	shouldSendOriginalInsteadOfSentTranslation(plugin, originalText, translation, input, output) {
		if (!translation) return true;
		if (input && output && input.id && output.id && plugin.isSameLanguageOrVariant(input.id, output.id)) return true;
		return plugin.getTextSimilarityScore(originalText, translation) >= Math.max(0.94, plugin.getTranslationSimilarityThreshold());
	},
	buildSentTranslationMessageValue(plugin, originalText, translation, input, output) {
		if (plugin.shouldSendOriginalInsteadOfSentTranslation(originalText, translation, input, output)) return originalText;
		return plugin.settings.general.sendOriginalMessage ? (translation + plugin.formatOriginalTextForMessage(originalText)) : translation;
	}
};

const languageHeuristicsRuntime = {
	getLatinStopwordTables(_plugin) {
		// Compact stopword tables for common Latin-script languages. Used only to fill the
		// gap that script-family analysis cannot: telling English/French/Spanish/etc. apart.
		return {
			en: "the,and,you,that,this,is,are,was,were,have,has,it,for,not,with,but,they,your,from,been,will,just,like,can,what,there,their",
			es: "que,de,no,es,en,un,una,por,con,se,los,las,su,para,como,mas,pero,le,al,lo,ella,este,eso",
			fr: "le,la,les,de,et,un,une,que,pas,pour,qui,dans,sur,ne,se,au,est,son,il,elle,avec,nous,vous",
			de: "der,die,das,und,ist,nicht,ein,eine,den,von,mit,sich,auf,fur,sie,dem,es,auch,wir,aber,hat",
			pt: "que,de,nao,um,uma,para,com,os,as,se,por,como,mas,mais,eu,voce,sua,seu,ja,esta,isto",
			it: "che,di,non,un,una,per,si,la,il,le,con,come,ma,piu,gli,sono,questo,quella,anche,stato",
			nl: "de,het,een,en,van,is,niet,te,dat,die,in,op,voor,met,zijn,haar,maar,wat,heb,wij,zij",
			pl: "nie,sie,to,na,jest,do,ze,jak,ale,co,dla,moze,tego,tym,byc,lub,oraz,takze,ich,jesli",
			ro: "sa,de,nu,in,ca,pe,un,o,cu,este,la,ai,mai,dar,sunt,pentru,fata,asta,ori,sau,aceasta",
			tr: "ve,bir,bu,icin,ile,ben,sen,degil,ama,daha,cok,var,yok,benim,senin,bana,sana,onlar,gibi,kadar",
			sv: "och,att,det,som,en,den,for,ar,inte,med,har,jag,du,han,hon,ett,kan,sa,men,om,alla",
			da: "og,at,det,som,en,den,er,ikke,med,har,jag,du,han,hun,et,kan,sa,men,om,vi,der",
			no: "og,at,det,som,en,den,er,ikke,med,har,jag,du,han,hun,et,kan,sa,men,om,vi,der",
			cs: "a,se,na,je,to,v,ze,si,pro,ale,jak,tak,ktery,byt,nebo,tento,jejich,coz,vice,ktere",
			hu: "es,egy,nem,hogy,az,is,volt,meg,lehet,csak,de,mint,mar,ott,majd,igen,mert,azzal,ilyen,olyan",
			id: "yang,dan,di,ini,itu,untuk,dengan,tidak,saya,anda,akan,ke,pada,dari,juga,karena,bisa,ada,mereka,sebagai",
			vi: "va,cua,la,mot,cac,trong,khong,co,nay,do,da,duoc,nguoi,cho,voi,den,tu,roi,ra,cung",
			tl: "ang,ng,mga,sa,ay,na,at,ni,si,naman,dahil,hindi,para,kung,ngunit,siya,ako,ikaw,nila,kapag"
		};
	},
	getShortLatinLanguageHintTables(_plugin) {
		return {
			en: "yes,hello,thanks,please",
			es: "hola,gracias",
			fr: "oui,bonjour,merci",
			de: "hallo,danke",
			it: "grazie",
			pt: "obrigado"
		};
	},
	identifyShortLatinLanguageHint(plugin, text) {
		const words = (text || "").toLowerCase().match(/[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)*/g) || [];
		if (words.length != 1) return null;
		if (!plugin._shortLatinLanguageHintIndex) {
			const index = Object.create(null);
			const tables = languageHeuristicsRuntime.getShortLatinLanguageHintTables(plugin);
			for (const languageId in tables) for (const word of tables[languageId].split(",")) index[word] = languageId;
			plugin._shortLatinLanguageHintIndex = index;
		}
		return plugin._shortLatinLanguageHintIndex[words[0]] || null;
	},
	identifyLatinLanguage(plugin, text) {
		if (!plugin._latinStopwordIndex) {
			const tables = languageHeuristicsRuntime.getLatinStopwordTables(plugin);
			const index = Object.create(null);
			for (const lang in tables) {
				for (const word of tables[lang].split(",")) {
					if (!index[word]) index[word] = [];
					index[word].push(lang);
				}
			}
			plugin._latinStopwordIndex = index;
		}
		const words = (text || "").toLowerCase().match(/[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)*/g) || [];
		if (words.length < 5) return {languageId: null, confident: false, tokenCount: words.length};
		const scores = Object.create(null);
		const seen = Object.create(null);
		for (const word of words) {
			const langs = plugin._latinStopwordIndex[word];
			if (!langs) continue;
			for (const lang of langs) {
				const key = lang + "|" + word;
				if (seen[key]) continue;
				seen[key] = 1;
				scores[lang] = (scores[lang] || 0) + 1;
			}
		}
		let best = null, bestScore = 0, runnerUp = 0;
		for (const lang in scores) {
			const score = scores[lang];
			if (score > bestScore) { runnerUp = bestScore; bestScore = score; best = lang; }
			else if (score > runnerUp) runnerUp = score;
		}
		// Conservative: only trust the call when one language clearly dominates.
		// Uncertain cases fall through to translation so we never silently drop a real foreign message.
		const confident = !!(best && bestScore >= 3 && bestScore >= 2 * runnerUp);
		return {languageId: best, score: bestScore, runnerUp, tokenCount: words.length, confident};
	},
	detectMessageLanguageLocal(plugin, text, analysis, targetLanguageId) {
		if (!analysis || !analysis.totalLetters) return {languageId: null, confident: false};
		// Non-Latin scripts are already handled by script-family checks upstream; the local
		// identifier only fills the Latin-vs-Latin gap where those checks bail out.
		const targetFamilies = analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId);
		if (!targetFamilies.length || targetFamilies[0] != "latin") return {languageId: null, confident: false};
		if (analysis.dominantFamily != "latin") return {languageId: null, confident: false};
		// Run on the raw masked text, not analysis.cleanedText: the sanitizer strips 1-3
		// letter tokens, which are exactly the stopwords we score on.
		return languageHeuristicsRuntime.identifyLatinLanguage(plugin, text);
	},
	isClearlyForeignLanguageMessage(plugin, text, targetLanguageId) {
		if (!text || !targetLanguageId || targetLanguageId == "auto") return false;
		const targetLanguage = plugin.ensureSettingsStore().getLanguage(targetLanguageId);
		if (targetLanguage && targetLanguage.special) return false;
		const targetFamilies = plugin.getLanguageScriptFamilies(targetLanguageId);
		if (!targetFamilies.length) return false;
		const targetFamily = targetFamilies[0];
		const analysis = plugin.analyzeTextForAutoTranslate(text, targetLanguageId);
		if (!analysis || !analysis.totalLetters) return false;
		const dominant = analysis.dominantFamily;
		if (!dominant) return false;
		// Different script from the target with enough non-target letters = clearly foreign.
		if (dominant != targetFamily && analysis.nonTargetLetterCount >= 6) return true;
		// Same script (latin-vs-latin): confirm a different language via the stopword identifier.
		if (targetFamily == "latin" && dominant == "latin") {
			const detected = languageHeuristicsRuntime.identifyLatinLanguage(plugin, text);
			if (detected.confident && detected.languageId && !plugin.isSameLanguageOrVariant(detected.languageId, targetLanguageId)) return true;
		}
		return false;
	},
	isHanTargetMessageWithLatinTerms(plugin, analysis, targetLanguageId) {
		if (!analysis || !analysis.totalLetters) return false;
		const targetFamilies = analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId);
		if (!targetFamilies.includes("han")) return false;
		if (analysis.targetLetterCount < 2 || analysis.hanRunCount < 1) return false;
		const latinCount = analysis.counts && analysis.counts.latin || 0;
		const nonTargetNonLatinLetterCount = Math.max(0, analysis.nonTargetLetterCount - latinCount);
		if (nonTargetNonLatinLetterCount > 0) return false;
		if (!latinCount) return true;
		if (analysis.latinWordCount > 3) return false;
		return analysis.targetShare >= 0.18;
	},
	isMostlyTargetLanguageMessage(plugin, analysis, targetLanguageId) {
		if (!analysis || !analysis.totalLetters) return false;
		const targetFamilies = analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId);
		// Latin-script languages share the same script, so local script heuristics cannot safely
		// tell English/French/Spanish apart. Let the translator or AI decision handle those.
		if (!targetFamilies.length || targetFamilies[0] == "latin") return false;
		if (languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, analysis, targetLanguageId)) return true;
		if (analysis.targetLetterCount >= 6 && analysis.targetShare >= 0.55) return true;
		if (analysis.targetLetterCount >= 12 && analysis.targetShare >= 0.45 && analysis.nonTargetLetterCount <= Math.max(8, analysis.targetLetterCount * 0.8)) return true;
		return !!analysis.strongTargetScriptMatch;
	},
	isClearlyTargetLanguageMessage(plugin, analysis, targetLanguageId) {
		if (!analysis || !analysis.totalLetters) return false;
		const targetFamilies = analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId);
		if (!targetFamilies.length || targetFamilies[0] == "latin") return false;
		// Hard pre-check before sending received messages to a translator. This is intentionally
		// stricter than the post-check but stronger than the old heuristic for CJK/Cyrillic/etc.
		// It prevents target-language chat from being sent to AI and rewritten in the same language.
		if (languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, analysis, targetLanguageId)) return true;
		if (analysis.targetLetterCount >= 3 && analysis.targetShare >= 0.82) return true;
		if (analysis.targetLetterCount >= 6 && analysis.targetShare >= 0.68 && analysis.nonTargetLetterCount <= Math.max(3, Math.floor(analysis.targetLetterCount * 0.25))) return true;
		if (analysis.targetLetterCount >= 12 && analysis.targetShare >= 0.6 && analysis.nonTargetLetterCount <= Math.max(6, Math.floor(analysis.targetLetterCount * 0.35))) return true;
		return false;
	},
	isTranslationLikelyInTargetLanguage(plugin, text, targetLanguageId) {
		targetLanguageId = plugin.normalizeLanguageId(targetLanguageId);
		if (!text || !targetLanguageId || targetLanguageId == "auto") return true;
		const targetLanguage = plugin.ensureSettingsStore().getLanguage(targetLanguageId);
		if (targetLanguage && targetLanguage.special) return true;
		const targetFamilies = plugin.getLanguageScriptFamilies(targetLanguageId);
		if (!targetFamilies.length) return true;
		const analysis = plugin.analyzeTextForAutoTranslate(text, targetLanguageId);
		if (!analysis || !analysis.totalLetters) return true;
		const shortLatinLanguageHint = analysis.dominantFamily == "latin" ? languageHeuristicsRuntime.identifyShortLatinLanguageHint(plugin, text) : null;
		if (shortLatinLanguageHint) {
			if (targetFamilies[0] != "latin") return false;
			return plugin.isSameLanguageOrVariant(shortLatinLanguageHint, targetLanguageId);
		}
		if (analysis.totalLetters < 4) return true;
		if (targetFamilies[0] == "latin" && analysis.dominantFamily == "latin") {
			const detected = languageHeuristicsRuntime.identifyLatinLanguage(plugin, text);
			if (detected.confident && detected.languageId) return plugin.isSameLanguageOrVariant(detected.languageId, targetLanguageId);
		}
		if (analysis.targetLetterCount == 0 && analysis.nonTargetLetterCount >= 4) return false;
		if (analysis.targetLetterCount >= 2 && analysis.targetShare >= 0.2) return true;
		return analysis.targetLetterCount >= 4 || analysis.targetShare >= 0.35;
	}
};

const textSimilarityRuntime = {
	normalizeComparisonText(_plugin, text) {
		text = (text || "").toLowerCase();
		if (typeof text.normalize == "function") text = text.normalize("NFKC");
		return text
			.replace(/https?:\/\/\S+/gi, "")
			.replace(/[`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?，。！？；：“”‘’（）【】《》、…·]/g, "")
			.replace(/\s+/g, "");
	},
	getTextSimilarityScore(plugin, textA, textB) {
		const normalizedA = textSimilarityRuntime.normalizeComparisonText(plugin, textA);
		const normalizedB = textSimilarityRuntime.normalizeComparisonText(plugin, textB);
		if (!normalizedA || !normalizedB) return 0;
		if (normalizedA == normalizedB) return 1;
		if (normalizedA.length < 2 || normalizedB.length < 2) return normalizedA == normalizedB ? 1 : 0;
		const createBigrams = value => {
			const bigrams = new Map();
			for (let index = 0; index < value.length - 1; index++) {
				const bigram = value.slice(index, index + 2);
				bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
			}
			return bigrams;
		};
		const bigramsA = createBigrams(normalizedA);
		const bigramsB = createBigrams(normalizedB);
		let overlap = 0;
		for (const [bigram, count] of bigramsA.entries()) if (bigramsB.has(bigram)) overlap += Math.min(count, bigramsB.get(bigram));
		return (2 * overlap) / (Math.max(1, normalizedA.length - 1) + Math.max(1, normalizedB.length - 1));
	}
};

// The impure trio. languagePolicy and languageDetectionRuntime touch BDFDB directly;
// receivedSettingsPolicy is here only because getReceivedAutoTranslateSourceLanguages
// goes through languagePolicy.
function createLanguageHeuristics({BDFDB} = {}) {
	const languagePolicy = {
		getConcreteConfiguredLanguages(plugin, settingKey) {
			const sourceLanguages = plugin.settings && plugin.settings.filters && plugin.settings.filters[settingKey];
			const configuredLanguages = BDFDB.ArrayUtils.is(sourceLanguages) ? sourceLanguages : [];
			return [...new Set(configuredLanguages.filter(languageId => {
				const language = plugin.ensureSettingsStore().getLanguage(languageId);
				return language && !language.auto && !language.special;
			}))];
		},
		normalizeLanguageId(_plugin, languageId) {
			const normalized = (languageId || "").toLowerCase();
			if (normalized != "$discord") return normalized;
			try {
				const currentLanguage = BDFDB && BDFDB.LanguageUtils && typeof BDFDB.LanguageUtils.getLanguage == "function" ? BDFDB.LanguageUtils.getLanguage() : null;
				const currentLanguageId = currentLanguage && currentLanguage.id ? String(currentLanguage.id).toLowerCase() : "";
				return currentLanguageId && currentLanguageId != "$discord" ? currentLanguageId : normalized;
			}
			catch (error) {return normalized;}
		},
		matchesConfiguredSourceLanguage(plugin, languageId, sourceLanguages = null) {
			if (!languageId) return false;
			const normalizedLanguageId = languagePolicy.normalizeLanguageId(plugin, languageId);
			const resolvedSourceLanguages = sourceLanguages || plugin.getAutoTranslateSourceLanguages();
			const normalizedSourceLanguages = resolvedSourceLanguages.map(sourceLanguage => languagePolicy.normalizeLanguageId(plugin, sourceLanguage));
			return normalizedSourceLanguages.some(sourceLanguage => sourceLanguage == normalizedLanguageId || sourceLanguage.startsWith(`${normalizedLanguageId}-`) || normalizedLanguageId.startsWith(`${sourceLanguage}-`));
		}
	};

	const receivedSettingsPolicy = {
		getFilterSettings(plugin) {
			return getFilterSettings(plugin);
		},
		getReceivedAutoTranslateSourceLanguages(plugin) {
			return languagePolicy.getConcreteConfiguredLanguages(plugin, "receivedAutoTranslateSourceLanguages");
		},
		getMinimumAutoTranslateLength(_plugin) {
			// Do not skip short chat text. Even one-character or two-character interjections can carry meaning.
			return 0;
		},
		getAutoTranslateMinimumLengthForAnalysis(plugin, analysis = null) {
			return receivedSettingsPolicy.getMinimumAutoTranslateLength(plugin);
		},
		getTranslationSimilarityThreshold(plugin) {
			const value = receivedSettingsPolicy.getFilterSettings(plugin).translationSimilarityThreshold;
			return Math.max(0.5, Math.min(0.99, parseFloat(value) || 0.9));
		},
		shouldTreatLanguageVariantsAsSame(plugin) {
			return receivedSettingsPolicy.getFilterSettings(plugin).treatLanguageVariantsAsSame !== false;
		},
		shouldSkipMixedReceivedMessages(_plugin) {
			return false;
		},
		shouldSkipSameLanguageReceivedMessages(plugin) {
			return receivedSettingsPolicy.getFilterSettings(plugin).skipSameLanguageReceivedMessages !== false;
		},
		useLocalLanguagePrecheck(plugin) {
			return receivedSettingsPolicy.getFilterSettings(plugin).useLocalLanguagePrecheck !== false;
		},
		shouldDropSimilarTranslations(plugin) {
			return receivedSettingsPolicy.getFilterSettings(plugin).dropSimilarTranslations !== false;
		}
	};

	const languageDetectionRuntime = {
		getStrategy(plugin) {
			const strategy = plugin.settings && plugin.settings.filters && plugin.settings.filters.languageDetectionStrategy;
			return ["local_first", "google_free", "local_only"].includes(strategy) ? strategy : "local_first";
		},
		getDetectableLanguageText(plugin, text) {
			let [newText, , translate] = plugin.removeExceptions((text || "").trim(), MESSAGE_DIRECTIONS.SENT);
			return translate && newText ? newText : "";
		},
		parseDetectedLanguageResponse(_plugin, body) {
			try {return (JSON.parse(body) || {}).src || null;}
			catch (err) {return null;}
		},
		detectLanguage(plugin, text, callback) {
			const detectableText = languageDetectionRuntime.getDetectableLanguageText(plugin, text);
			if (!detectableText) return callback(null);
			const strategy = languageDetectionRuntime.getStrategy(plugin);
			if (strategy != "google_free") {
				const localDetection = plugin.identifyLatinLanguage(detectableText);
				if (localDetection && localDetection.confident && localDetection.languageId) return callback(localDetection.languageId);
				if (strategy == "local_only") return callback(null);
			}
			BDFDB.LibraryRequires.request("https://translate.googleapis.com/translate_a/single", {
				form: {
					"client": "gtx",
					"dt": "t",
					"dj": "1",
					"source": "input",
					"sl": "auto",
					"tl": "en",
					"q": encodeURIComponent(detectableText)
				}
			}, (error, response, body) => {
				if (!error && body && response.statusCode == 200) return callback(languageDetectionRuntime.parseDetectedLanguageResponse(plugin, body));
				callback(null);
			});
		}
	};

	return Object.freeze({languagePolicy, receivedSettingsPolicy, languageDetectionRuntime});
}

module.exports = {
	LANGUAGE_DIRECTIONS,
	MESSAGE_DIRECTIONS,
	LOADED_AUTO_TRANSLATE_RANGE_MODES,
	loadedAutoTranslatePolicy,
	aiDecisionPolicy,
	sentTranslationPolicy,
	languageHeuristicsRuntime,
	textSimilarityRuntime,
	createLanguageHeuristics
};
