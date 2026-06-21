const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function createPluginInstance() {
	class BasePlugin {}
	const BDFDB = {
		ArrayUtils: {is: Array.isArray},
		DataUtils: {load: () => ({}), save: () => {}},
		DiscordObjects: {Message: class Message {constructor(d){Object.assign(this,d);}}},
		ObjectUtils: {isEmpty: o => !o || !Object.keys(o).length},
		TimeUtils: {
			clear: handle => { if (handle) clearTimeout(handle); },
			interval: (cb, ms) => setInterval(cb, ms),
			timeout: (cb, ms) => setTimeout(cb, ms)
		},
		NotificationUtils: {toast: () => null},
		LibraryStores: {ChannelStore: {getChannel: () => null}, SelectedChannelStore: {getChannelId: () => "channel-test"}},
		UserUtils: {me: {id: "current-user"}},
		LibraryRequires: {request: () => {}}
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
		engines: {translator: "googleapi", backup: "----"},
		filters: {
			minimumAutoTranslateLength: 6,
			receivedAutoTranslateLoadedTimeWindow: "1h",
			skipMixedReceivedMessages: true,
			skipSameLanguageReceivedMessages: true,
			useLocalLanguagePrecheck: true,
			treatLanguageVariantsAsSame: true,
			dropSimilarTranslations: true,
			translationSimilarityThreshold: 0.9,
			receivedAutoTranslateSourceLanguages: []
		},
		choices: {
			received: {input: "auto", output: "en"},
			sent: {input: "auto", output: "en"}
		}
	};
	plugin.defaults = {
		choices: {
			received: {value: {input: "auto", output: "en"}},
			sent: {value: {input: "auto", output: "en"}}
		},
		general: {}
	};
	plugin.isTranslationEnabled = () => true;
	plugin.isReceivedAutoTranslationEnabled = () => true;
	plugin.isOwnMessage = () => false;
	plugin.getLanguageChoice = (direction, place) => {
		if (place == "received" && direction == "output") return "en";
		if (place == "received" && direction == "input") return "auto";
		return "en";
	};
	// Expose the BDFDB mock so tests can patch LibraryRequires.request / TimeUtils.
	plugin._testBdfdb = BDFDB;
	return plugin;
}

test("identifyLatinLanguage detects English with high confidence", () => {
	const plugin = createPluginInstance();
	const result = plugin.identifyLatinLanguage("hello there my friend, how are you doing today");
	assert.equal(result.languageId, "en");
	assert.equal(result.confident, true);
});

test("identifyLatinLanguage detects French and distinguishes it from English", () => {
	const plugin = createPluginInstance();
	const result = plugin.identifyLatinLanguage("je ne sais pas ce que tu veux dire avec ce mot");
	assert.equal(result.languageId, "fr");
	assert.equal(result.confident, true);
});

test("identifyLatinLanguage is not confident on short messages", () => {
	const plugin = createPluginInstance();
	const result = plugin.identifyLatinLanguage("ok hello");
	assert.equal(result.confident, false);
});

test("local precheck skips a same-language English message before requesting translation", () => {
	const plugin = createPluginInstance();
	const message = {
		id: "msg-en-same",
		content: "hello there my friend, how are you doing today",
		embeds: [],
		author: {id: "other-user"}
	};
	// Target language is English; an English message should be skipped locally.
	assert.equal(plugin.shouldAutoTranslateReceivedMessage(message, {id: "channel-1"}, null, true), false);
});

test("local precheck does not skip a foreign-language message that needs translation", () => {
	const plugin = createPluginInstance();
	const message = {
		id: "msg-fr-foreign",
		content: "je ne sais pas ce que tu veux dire avec ce mot",
		embeds: [],
		author: {id: "other-user"}
	};
	assert.equal(plugin.shouldAutoTranslateReceivedMessage(message, {id: "channel-2"}, null, true), true);
});

test("disabling useLocalLanguagePrecheck lets a same-language English message through", () => {
	const plugin = createPluginInstance();
	plugin.settings.filters.useLocalLanguagePrecheck = false;
	const message = {
		id: "msg-en-precheck-off",
		content: "hello there my friend, how are you doing today",
		embeds: [],
		author: {id: "other-user"}
	};
	// With the precheck off, the Latin same-language case is not caught locally.
	assert.equal(plugin.shouldAutoTranslateReceivedMessage(message, {id: "channel-3"}, null, true), true);
});

test("requestWithTimeout fires a 504 callback when the underlying request hangs", async () => {
	const plugin = createPluginInstance();
	plugin._testBdfdb.LibraryRequires.request = () => {}; // hung: never calls back
	await new Promise(resolve => {
		plugin.requestWithTimeout("https://example.invalid", {}, (error, response, body) => {
			assert.equal(error, null);
			assert.equal(response && response.statusCode, 504);
			assert.equal(body, "");
			resolve();
		}, 40);
	});
});

test("requestWithTimeout triggers backoff on a 429 response", () => {
	const plugin = createPluginInstance();
	let backoffMs = null;
	plugin.scheduleAutoTranslationBackoff = ms => { backoffMs = ms; };
	plugin._testBdfdb.LibraryRequires.request = (url, opts, cb) => cb(null, {statusCode: 429}, "");
	plugin.requestWithTimeout("https://example.invalid", {}, () => {}, 1000);
	assert.equal(backoffMs, 5000);
});

test("requestWithTimeout triggers backoff on a 5xx response", () => {
	const plugin = createPluginInstance();
	let backoffMs = null;
	plugin.scheduleAutoTranslationBackoff = ms => { backoffMs = ms; };
	plugin._testBdfdb.LibraryRequires.request = (url, opts, cb) => cb(null, {statusCode: 503}, "");
	plugin.requestWithTimeout("https://example.invalid", {}, () => {}, 1000);
	assert.equal(backoffMs, 2000);
});

test("requestWithTimeout does not double-fire when the real response arrives late", async () => {
	const plugin = createPluginInstance();
	let calls = 0;
	let lateCallback = null;
	plugin._testBdfdb.LibraryRequires.request = (url, opts, cb) => { lateCallback = cb; };
	plugin.requestWithTimeout("https://example.invalid", {}, () => { calls++; }, 40);
	await new Promise(resolve => setTimeout(resolve, 120)); // timeout fires first
	if (lateCallback) lateCallback(null, {statusCode: 200}, "late"); // late real response ignored
	assert.equal(calls, 1);
});

test("isClearlyForeignLanguageMessage: English sentence to Chinese target is clearly foreign", () => {
	const plugin = createPluginInstance();
	assert.equal(plugin.isClearlyForeignLanguageMessage("hello there my friend how are you doing today", "zh-CN"), true);
});

test("isClearlyForeignLanguageMessage: all-caps English to Chinese target is clearly foreign (varun regression)", () => {
	const plugin = createPluginInstance();
	assert.equal(plugin.isClearlyForeignLanguageMessage("I THINK IF U USE 2 HIGGS ACCOUNTS THEN UR ACCOUNTS WOULD BE BANNED", "zh-CN"), true);
});

test("isClearlyForeignLanguageMessage: Chinese sentence to Chinese target is not foreign", () => {
	const plugin = createPluginInstance();
	assert.equal(plugin.isClearlyForeignLanguageMessage("今天天气真好我们一起出去玩吧", "zh-CN"), false);
});

test("isClearlyForeignLanguageMessage: French sentence to English target is clearly foreign", () => {
	const plugin = createPluginInstance();
	assert.equal(plugin.isClearlyForeignLanguageMessage("je ne sais pas ce que tu veux dire avec ce mot", "en"), true);
});

test("isClearlyForeignLanguageMessage: short token to Chinese target is not clearly foreign", () => {
	const plugin = createPluginInstance();
	assert.equal(plugin.isClearlyForeignLanguageMessage("ok", "zh-CN"), false);
});

test("isClearlyForeignLanguageMessage: Chinese with English proper noun is not clearly foreign", () => {
	const plugin = createPluginInstance();
	assert.equal(plugin.isClearlyForeignLanguageMessage("我用 Dropbox 同步文件没问题", "zh-CN"), false);
});

test("isReceivedMessageForeignAsync: local fast-path returns true without calling Google", () => {
	const plugin = createPluginInstance();
	plugin._testBdfdb.LibraryRequires.request = () => { throw new Error("Google detect should not be called"); };
	return new Promise(resolve => {
		plugin.isReceivedMessageForeignAsync("hello there my friend how are you doing today", "zh-CN", isForeign => {
			assert.equal(isForeign, true);
			resolve();
		});
	});
});

test("isReceivedMessageForeignAsync: Google detects a different language -> foreign", () => {
	const plugin = createPluginInstance();
	plugin._testBdfdb.LibraryRequires.request = (url, opts, cb) => cb(null, {statusCode: 200}, JSON.stringify({src: "fr"}));
	return new Promise(resolve => {
		plugin.isReceivedMessageForeignAsync("bonjour", "en", isForeign => {
			assert.equal(isForeign, true);
			resolve();
		});
	});
});

test("isReceivedMessageForeignAsync: Google detects the same language -> not foreign", () => {
	const plugin = createPluginInstance();
	plugin._testBdfdb.LibraryRequires.request = (url, opts, cb) => cb(null, {statusCode: 200}, JSON.stringify({src: "en"}));
	return new Promise(resolve => {
		plugin.isReceivedMessageForeignAsync("bonjour", "en", isForeign => {
			assert.equal(isForeign, false);
			resolve();
		});
	});
});

test("isReceivedMessageForeignAsync: Google unreachable -> not foreign (honors skip)", () => {
	const plugin = createPluginInstance();
	plugin._testBdfdb.LibraryRequires.request = (url, opts, cb) => cb(new Error("net"), null, "");
	return new Promise(resolve => {
		plugin.isReceivedMessageForeignAsync("bonjour", "en", isForeign => {
			assert.equal(isForeign, false);
			resolve();
		});
	});
});
