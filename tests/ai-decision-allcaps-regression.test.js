const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Regression for AI-decision auto-translate dropping all-caps foreign messages.
// Mocks the deepseek engine: autoDecision=true echoes the source unchanged (simulating the
// model treating all-caps text as an acronym), autoDecision=false returns a real translation.

function createPluginInstance() {
	class BasePlugin {}
	const BDFDB = {
		ArrayUtils: {is: Array.isArray},
		DataUtils: {load: () => ({}), save: () => {}},
		DiscordObjects: {Message: class Message {constructor(d){Object.assign(this,d);}}},
		ObjectUtils: {
			isEmpty: o => !o || !Object.keys(o).length,
			deepAssign: (...objs) => {
				const r = {};
				for (const o of objs) if (o) for (const k in o) r[k] = o[k];
				return r;
			},
			filter: (obj, fn) => Object.fromEntries(Object.entries(obj || {}).filter(([_, v]) => fn(v))),
			sort: obj => obj
		},
		TimeUtils: {clear: () => {}, interval: () => 0, timeout: () => 0},
		NotificationUtils: {toast: () => null},
		LanguageUtils: {
			languages: {
				"zh-CN": {id: "zh-CN", name: "Chinese"},
				"en": {id: "en", name: "English"}
			},
			getLanguage: () => ({id: "en"})
		},
		LibraryStores: {ChannelStore: {getChannel: () => null}, SelectedChannelStore: {getChannelId: () => "channel-test"}},
		UserUtils: {me: {id: "current-user"}}
	};
	global.BdApi = {React: {Component: class Component {}}};
	global.window = {BDFDB_Global: {loaded: true, started: true, PluginUtils: {buildPlugin: () => [BasePlugin, BDFDB]}}};

	const pluginPath = path.resolve(__dirname, "..", "DiscordAITranslator.plugin.js");
	delete require.cache[pluginPath];
	const PluginClass = require(pluginPath);
	const plugin = new PluginClass();
	plugin.settings = {
		general: {protectQuotedText: true, usePerChatTranslation: true},
		exceptions: {wordStart: ["!"], protectedTerms: [], wrapperPairs: []},
		engines: {translator: "deepseek", backup: "----"},
		filters: {
			minimumAutoTranslateLength: 6,
			skipMixedReceivedMessages: false,
			skipSameLanguageReceivedMessages: true,
			treatLanguageVariantsAsSame: true,
			dropSimilarTranslations: true,
			translationSimilarityThreshold: 0.9,
			useLocalLanguagePrecheck: true,
			autoTranslateDecisionMode: "ai",
			receivedAutoTranslateSourceLanguages: []
		},
		choices: {received: {input: "auto", output: "zh-CN"}, sent: {input: "auto", output: "en"}}
	};
	plugin.defaults = {
		choices: {received: {value: {input: "auto", output: "zh-CN"}}, sent: {value: {input: "auto", output: "en"}}},
		general: {}
	};
	plugin.labels = {detect_language: "Auto detect"};
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.isOwnMessage = () => false;
	plugin.setLanguages();
	return plugin;
}

function setupEngine(plugin, {plainResult}) {
	const calls = [];
	plugin.validTranslator = () => true;
	plugin.deepSeekTranslate = (data, callback) => {
		calls.push({autoDecision: !!data.autoDecision, text: data.text});
		// autoDecision=true: model echoes source unchanged (all-caps treated as acronym).
		// autoDecision=false: plain translation into the target language.
		callback(data.autoDecision ? data.text : plainResult);
	};
	plugin.detectLanguage = (text, callback) => callback("en");
	return calls;
}

function runTranslate(plugin, text) {
	let result = null;
	plugin.translateText(text, "received", (translation, input, output, meta) => {
		result = {translation, input, output, meta};
	}, null, {auto: true, channelId: "channel-test", showToast: false, showFailureToast: false, trackBusy: false});
	return result;
}

test("isClearlyForeignLanguageMessage treats all-caps Latin to Chinese as foreign (short-circuit premise)", () => {
	const plugin = createPluginInstance();
	assert.equal(plugin.isClearlyForeignLanguageMessage("HELLO CRYZYYY", "zh-CN"), true);
	assert.equal(plugin.isClearlyForeignLanguageMessage("你好世界", "zh-CN"), false);
});

test("all-caps foreign message is force-translated, not echoed/skipped (cross-script short-circuit)", () => {
	const plugin = createPluginInstance();
	const calls = setupEngine(plugin, {plainResult: "你好，克里齐"});
	const result = runTranslate(plugin, "HELLO CRYZYYY");

	assert.ok(calls.length >= 1, "deepSeekTranslate was called");
	assert.equal(calls[0].autoDecision, false, "clearly foreign cross-script message must bypass AI decision mode");
	assert.equal(result.translation, "你好，克里齐");
	assert.equal(result.meta.failed, false);
	assert.equal(result.meta.skipped, undefined);
});

test("wrong-target echo falls back to a forced plain re-translation (safety net)", () => {
	const plugin = createPluginInstance();
	// "HELL" has only 4 Latin letters: isClearlyForeignLanguageMessage is false (<6), so AI decision
	// engages and the model echoes it. The echo is rejected as wrong-target and the safety net must
	// re-translate plainly.
	const calls = setupEngine(plugin, {plainResult: "地狱"});
	const result = runTranslate(plugin, "HELL");

	const autoDecisionCalls = calls.filter(c => c.autoDecision).length;
	const plainCalls = calls.filter(c => !c.autoDecision).length;
	assert.ok(autoDecisionCalls >= 1, "AI decision path attempted first");
	assert.ok(plainCalls >= 1, "safety net forced a plain re-translation");
	assert.equal(result.translation, "地狱");
	assert.equal(result.meta.failed, false);
});

test("target-language message is not force-translated (no regression on short-circuit)", () => {
	const plugin = createPluginInstance();
	const calls = setupEngine(plugin, {plainResult: "不该出现的译文"});
	const result = runTranslate(plugin, "你好世界");

	assert.ok(calls.length >= 1);
	assert.equal(calls[0].autoDecision, true, "han-target message stays on AI decision, not force-disabled");
	assert.equal(result.translation, "", "already-target message produces no foreign translation");
});
