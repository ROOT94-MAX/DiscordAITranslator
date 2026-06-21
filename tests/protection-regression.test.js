const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function createPluginInstance() {
	class BasePlugin {}
	const BDFDB = {
		ArrayUtils: {
			is: Array.isArray
		}
	};
	global.BdApi = {
		React: {
			Component: class Component {}
		}
	};
	global.window = {
		BDFDB_Global: {
			loaded: true,
			started: true,
			PluginUtils: {
				buildPlugin: () => [BasePlugin, BDFDB]
			}
		}
	};

	const pluginPath = path.resolve(__dirname, "..", "DiscordAITranslator.plugin.js");
	delete require.cache[pluginPath];
	const PluginClass = require(pluginPath);
	const plugin = new PluginClass();
	plugin.settings = {
		general: {
			protectQuotedText: true,
			usePerChatTranslation: true
		},
		exceptions: {
			wordStart: ["!"],
			protectedTerms: ["BUG team", "ChatGPT Plus"],
			wrapperPairs: ['"|"', "“|”", "`|`"]
		},
		engines: {
			translator: "googleapi",
			backup: "----"
		}
	};
	return plugin;
}

function runProtection(text, place = "sent") {
	const plugin = createPluginInstance();
	const [maskedText, excepts, shouldTranslate] = plugin.removeExceptions(text, place);
	return {
		maskedText,
		excepts,
		protectedValues: Object.values(excepts),
		shouldTranslate,
		restoredText: plugin.addExceptions(maskedText, excepts)
	};
}

test("triple backtick code blocks are fully protected", () => {
	const source = "```js\nconst model = \"deepseek-v3\";\n```";
	const result = runProtection(source, "sent");

	assert.equal(result.shouldTranslate, false);
	assert.deepEqual(result.protectedValues, [source]);
	assert.equal(result.restoredText, source);
});

test("configured multiword terms match regardless of internal spaces", () => {
	const source = "搞的bugteam给我自己的号连坐封了";
	const result = runProtection(source, "sent");

	// Configured term "BUG team" (with a space) must also protect the no-space variant "bugteam".
	assert.ok(result.protectedValues.some(value => /^bug\s*team$/i.test(value)));
	assert.equal(result.restoredText, source);
});

test("inline code and configured protected terms are both preserved", () => {
	const source = "Use `default` for BUG team and ChatGPT Plus only";
	const result = runProtection(source, "sent");

	assert.match(result.maskedText, /⟦0⟧/);
	assert.match(result.maskedText, /⟦1⟧/);
	assert.match(result.maskedText, /⟦2⟧/);
	assert.ok(result.protectedValues.includes("`default`"));
	assert.ok(result.protectedValues.includes("BUG team"));
	assert.ok(result.protectedValues.includes("ChatGPT Plus"));
	assert.equal(result.restoredText, source);
});

test("urls domains and emails are auto-protected", () => {
	const source = "Docs https://api.deepseek.com/chat/completions via platform.openai.com contact name@example.com and Claude 3.7 Sonnet";
	const result = runProtection(source, "sent");

	assert.ok(result.protectedValues.includes("https://api.deepseek.com/chat/completions"));
	assert.ok(result.protectedValues.includes("platform.openai.com"));
	assert.ok(result.protectedValues.includes("name@example.com"));
	// Natural-language model names (e.g. "Claude 3.7 Sonnet") are not auto-protected: there is no
	// built-in model/brand dictionary by design. Users can add them to Protected Terms.
	assert.ok(!result.protectedValues.includes("Claude 3.7 Sonnet"));
	assert.equal(result.restoredText, source);
});

test("discord special objects stay protected in received messages", () => {
	const source = "hello <@!123456789> <:wave:456789> world";
	const result = runProtection(source, "received");

	assert.ok(result.protectedValues.includes("<@!123456789>"));
	assert.ok(result.protectedValues.includes("<:wave:456789>"));
	assert.equal(result.restoredText, source);
});

test("plain version numbers are not misdetected as domains or model names", () => {
	const source = "版本 3.1 不应该被自动保护";
	const result = runProtection(source, "sent");

	assert.deepEqual(result.protectedValues, []);
	assert.equal(result.shouldTranslate, true);
	assert.equal(result.restoredText, source);
});

test("mixed CJK text does not auto-protect ordinary latin tokens", () => {
	const source = "这个用 bybit 弄完，再冻结 bybit 吧";
	const result = runProtection(source, "sent");

	// Ordinary lowercase Latin words in mixed-language chat are not auto-protected by design.
	// Users can add exact tokens (e.g. "bybit") to Protected Terms / Phrases.
	assert.ok(!result.protectedValues.includes("bybit"));
	assert.equal(result.restoredText, source);
});

test("common lowercase English stopwords in mixed text are not auto-protected", () => {
	const source = "这个 need 处理";
	const result = runProtection(source, "sent");

	assert.deepEqual(result.protectedValues, []);
	assert.equal(result.restoredText, source);
});

test("all-caps Latin shouting is translatable, not treated as acronyms", () => {
	const source = "HELLO CRYZYYY";
	const result = runProtection(source, "received");

	// Whole-message shouting must keep translatable content and not mask every word.
	assert.equal(result.shouldTranslate, true);
	assert.ok(!result.protectedValues.includes("HELLO"));
	assert.ok(!result.protectedValues.includes("CRYZYYY"));
});

test("acronyms in CJK-dominant text stay protected (shouting fix regression guard)", () => {
	const source = "我需要CDK用于GPT";
	const result = runProtection(source, "received");

	assert.ok(result.protectedValues.includes("CDK"));
	assert.ok(result.protectedValues.includes("GPT"));
	assert.equal(result.shouldTranslate, true);
	assert.equal(result.restoredText, source);
});

test("acronyms embedded in normal-case Latin text stay protected", () => {
	const source = "use the API key please";
	const result = runProtection(source, "received");

	assert.ok(result.protectedValues.includes("API"));
	assert.equal(result.restoredText, source);
});
