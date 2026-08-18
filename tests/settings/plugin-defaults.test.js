const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginDefaults, MODULE_PATCHES} = require("../../src/settings/plugin-defaults");

// Contract tests for the plugin defaults extracted from onLoad in
// display-unification 5d. The schema and the patch lists are registration
// contracts: a silently dropped key or patch target disables a feature with no
// error, so both are pinned exactly.

const FIXTURE = {
	messageTypes: {RECEIVED: "received", SENT: "sent"},
	languageTypes: {INPUT: "input", OUTPUT: "output"},
	defaultLanguages: {INPUT: "auto", OUTPUT: "$discord"}
};

test("the defaults schema keeps its sections and the load-bearing values", () => {
	const defaults = createPluginDefaults(FIXTURE);
	assert.deepEqual(Object.keys(defaults), ["general", "choices", "filters", "exceptions", "prefixes", "engines"]);
	assert.equal(defaults.general.translatedTextColor.value, "#7cc7ff");
	assert.equal(defaults.general.showOriginalDirectly.value, true);
	assert.equal(defaults.filters.receivedAutoTranslateScope.value, "new_only");
	assert.equal(defaults.filters.receivedAutoTranslateLoadedLimit.value, "50");
	assert.equal(defaults.filters.translationSimilarityThreshold.value, 0.9);
	assert.equal(defaults.engines.translator.value, "googleapi");
	assert.equal(defaults.engines.backup.value, "----");
	assert.deepEqual(defaults.prefixes.translationPrefixData.value.map(entry => entry.prefix), ["$fr", "$de", "$es", "$jp"]);
});

test("the language choices are built for both message types from the defaults", () => {
	const defaults = createPluginDefaults(FIXTURE);
	assert.deepEqual(defaults.choices.received.value, {input: "auto", output: "$discord"});
	assert.deepEqual(defaults.choices.sent.value, {input: "auto", output: "$discord"});
});

test("the module patch lists name every hooked surface exactly", () => {
	assert.deepEqual(MODULE_PATCHES.before, ["ChannelTextAreaContainer", "ChannelTextAreaEditor", "Embed", "MessageReply", "Messages"]);
	assert.deepEqual(MODULE_PATCHES.after, ["ChannelTextAreaButtons", "ChannelThreadItem", "Embed", "HeaderBarChannelName", "HeaderBarTitle", "MessageReply", "MessageButtons", "MessageContent", "ThreadCard", "ThreadSidebar"]);
});
