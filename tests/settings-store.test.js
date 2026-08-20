const test = require("node:test");
const assert = require("node:assert/strict");
const {
	LANGUAGE_DIRECTIONS,
	createEmptyChannelEnablementState,
	normalizeStoredChannelEnablementState,
	migrateLegacyChannelEnablementState,
	loadChannelEnablementState,
	getChannelEnablementStateValue,
	channelEnablementStatesEqual,
	createSettingsStore
} = require("../src/settings/settings-store");

const INPUT = LANGUAGE_DIRECTIONS.INPUT;
const OUTPUT = LANGUAGE_DIRECTIONS.OUTPUT;
const RECEIVED = "received";
const SENT = "sent";

function clone(value) {
	return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createLanguageTable() {
	return {
		auto: {id: "auto", name: "Detect", auto: true},
		en: {id: "en", name: "English"},
		"zh-CN": {id: "zh-CN", name: "Chinese"},
		ru: {id: "ru", name: "Russian"}
	};
}

// One harness for every test: a fake profile on "disk", a fake engine catalogue and a
// fake channel-to-guild map. Nothing here needs a plugin instance.
function createHarness(options = {}) {
	const persisted = Object.assign({
		favorites: [],
		authKeys: {},
		channelLanguages: {},
		guildLanguages: {},
		channelPrimaryEngineOverrides: {},
		translationEnabledStates: null,
		receivedAutoTranslationEnabledStates: null,
		choices: {}
	}, options.persisted || {});
	const installedEngines = options.installedEngines || ["googleapi", "deepseek", "deepl"];
	const guildsByChannel = options.guildsByChannel || {};
	const writes = [];

	function record(key, value) {
		persisted[key] = clone(value);
		writes.push({key, value: clone(value)});
	}

	const store = createSettingsStore({
		isKnownEngine: engineKey => installedEngines.includes(engineKey),
		sortLanguages: options.sortLanguages || (table => table),
		resolveGuildId: channelId => channelId && guildsByChannel[channelId] || null,
		loadFavorites: () => persisted.favorites,
		persistFavorites: value => record("favorites", value),
		loadAuthKeys: () => persisted.authKeys,
		persistAuthKeys: value => record("authKeys", value),
		loadChannelLanguages: () => persisted.channelLanguages,
		persistChannelLanguages: value => record("channelLanguages", value),
		loadGuildLanguages: () => persisted.guildLanguages,
		persistGuildLanguages: value => record("guildLanguages", value),
		loadChannelPrimaryEngineOverrides: () => persisted.channelPrimaryEngineOverrides,
		persistChannelPrimaryEngineOverrides: value => record("channelPrimaryEngineOverrides", value),
		loadTranslationEnabledStates: () => persisted.translationEnabledStates,
		loadReceivedAutoTranslationEnabledStates: () => persisted.receivedAutoTranslationEnabledStates,
		persistChannelEnablementState: value => {
			record("translationEnabledStates", value);
			record("receivedAutoTranslationEnabledStates", value);
		},
		loadGlobalLanguageChoice: (place, direction) => persisted.choices[place] && persisted.choices[place][direction],
		persistGlobalLanguageChoice: (place, direction, choice) => {
			const choices = Object.assign({}, persisted.choices);
			choices[place] = Object.assign({}, choices[place]);
			choices[place][direction] = choice;
			record("choices", choices);
		},
		resolveLegacyDiscordLanguage: options.resolveLegacyDiscordLanguage || (() => "zh-CN")
	});

	if (options.languages !== null) store.setLanguages(options.languages || createLanguageTable());
	return {store, persisted, writes, keysWritten: () => writes.map(entry => entry.key)};
}

test("setLanguages stamps favourite flags and hands the table to the ordering hook", () => {
	const ordered = [];
	const {store} = createHarness({
		persisted: {favorites: ["zh-CN"]},
		languages: null,
		sortLanguages: table => {
			ordered.push(Object.keys(table));
			return Object.fromEntries(Object.entries(table).sort(([, left], [, right]) => left.fav - right.fav));
		}
	});
	store.reload();

	const languages = store.setLanguages(createLanguageTable());

	assert.equal(languages["zh-CN"].fav, 0);
	assert.equal(languages.en.fav, 1);
	assert.equal(languages.auto.fav, 1);
	assert.deepEqual(ordered, [["auto", "en", "zh-CN", "ru"]]);
	assert.equal(store.getFirstLanguageId(), "zh-CN");
	assert.equal(store.getLanguages(), languages);
});

test("setLanguages survives a table entry that is not a language record", () => {
	const {store} = createHarness({languages: null});

	store.setLanguages({en: {id: "en"}, broken: null});

	assert.equal(store.getLanguage("en").fav, 1);
	assert.equal(store.getLanguage("broken"), null);
});

test("the retired Discord language alias is not exposed as a selectable language", () => {
	const {store} = createHarness({languages: null});

	store.setLanguages(Object.assign(createLanguageTable(), {
		$discord: {id: "zh-CN", name: "Discord (Chinese (China))"}
	}));

	assert.equal(store.getLanguage("$discord"), null);
	assert.equal(store.getLanguage("zh-CN").id, "zh-CN");
	assert.equal(store.getLanguageIds().includes("$discord"), false);
});

test("language lookups answer from the current table", () => {
	const {store} = createHarness();

	assert.equal(store.getLanguage("en").name, "English");
	assert.equal(store.getLanguage("xx"), null);
	assert.equal(store.hasLanguage("ru"), true);
	assert.equal(store.hasLanguage("xx"), false);
	assert.deepEqual(store.getLanguageIds(), ["auto", "en", "zh-CN", "ru"]);
	assert.equal(store.getFirstLanguageId(), "auto");
});

test("toggling a favourite persists a sorted list and never duplicates an id", () => {
	const {store, persisted} = createHarness();

	store.setFavorite("ru", true);
	store.setFavorite("en", true);
	store.setFavorite("ru", true);

	assert.deepEqual(persisted.favorites, ["en", "ru"]);
	assert.equal(store.isFavorite("ru"), true);

	store.setFavorite("ru", false);

	assert.deepEqual(persisted.favorites, ["en"]);
	assert.equal(store.isFavorite("ru"), false);
});

test("a favourite toggle without a language id changes nothing", () => {
	const {store, keysWritten} = createHarness();

	store.setFavorite("", true);

	assert.deepEqual(store.getFavorites(), []);
	assert.deepEqual(keysWritten(), []);
});

test("credential text fields are trimmed and persisted on every write", () => {
	const {store, persisted, keysWritten} = createHarness();

	store.setCredentialField("openai", "key", "  sk-secret  ");
	store.setCredentialField("openai", "endpoint", "https://example.invalid/v1  ");

	assert.deepEqual(persisted.authKeys, {openai: {key: "sk-secret", endpoint: "https://example.invalid/v1"}});
	assert.deepEqual(keysWritten(), ["authKeys", "authKeys"]);
	assert.equal(store.getCredentialField("openai", "key"), "sk-secret");
});

test("a credential text field that is cleared is stored as an empty string", () => {
	const {store, persisted} = createHarness();

	store.setCredentialField("openai", "key", null);

	assert.deepEqual(persisted.authKeys, {openai: {key: ""}});
});

test("credential flags are stored raw so a false switch stays false", () => {
	const {store, persisted} = createHarness();

	store.setCredentialFlag("deepl", "paid", true);
	assert.equal(persisted.authKeys.deepl.paid, true);

	store.setCredentialFlag("deepl", "paid", false);
	assert.equal(persisted.authKeys.deepl.paid, false);
	assert.equal(store.getCredentialField("deepl", "paid"), false);
});

test("setCredential replaces one engine record and leaves the others alone", () => {
	const {store, persisted} = createHarness({persisted: {authKeys: {deepl: {key: "old"}, openai: {key: "keep"}}}});
	store.reload();

	store.setCredential("deepl", {key: "new", model: "m"});

	assert.deepEqual(persisted.authKeys, {deepl: {key: "new", model: "m"}, openai: {key: "keep"}});
});

test("replaceAuthKeys persists the table the provider client hands back", () => {
	const {store, persisted} = createHarness();

	const authKeys = store.getAuthKeys();
	authKeys.gemini = {key: "k", endpoint: "https://normalized.invalid"};
	store.replaceAuthKeys(authKeys);

	assert.deepEqual(persisted.authKeys, {gemini: {key: "k", endpoint: "https://normalized.invalid"}});
});

test("replaceAuthKeys refuses a payload that is not a record", () => {
	const {store, persisted} = createHarness({persisted: {authKeys: {deepl: {key: "old"}}}});
	store.reload();

	store.replaceAuthKeys(null);

	assert.deepEqual(persisted.authKeys, {});
	assert.deepEqual(store.getAuthKeys(), {});
});

test("credential reads report nothing for an engine that was never configured", () => {
	const {store} = createHarness();

	assert.equal(store.getCredential("openai"), null);
	assert.equal(store.getCredential(""), null);
	assert.equal(store.getCredentialField("openai", "key"), undefined);
	assert.equal(store.setCredentialField("", "key", "x"), null);
	assert.equal(store.setCredentialFlag("openai", "", true), null);
	assert.equal(store.setCredential("", {}), null);
});

test("channel scope wins over guild scope and guild scope over the global choice", () => {
	const {store} = createHarness({
		guildsByChannel: {"channel-1": "guild-1", "channel-2": "guild-1", "channel-3": "@me"},
		persisted: {
			channelLanguages: {"channel-1": {received: {input: "ru", output: "en"}}},
			guildLanguages: {"guild-1": {received: {input: "en", output: "zh-CN"}}},
			choices: {received: {input: "auto", output: "ru"}}
		}
	});
	store.reload();

	assert.equal(store.getLanguageChoice(INPUT, RECEIVED, "channel-1"), "ru");
	assert.equal(store.getLanguageChoice(OUTPUT, RECEIVED, "channel-1"), "en");
	assert.equal(store.getLanguageChoice(INPUT, RECEIVED, "channel-2"), "en");
	assert.equal(store.getLanguageChoice(OUTPUT, RECEIVED, "channel-2"), "zh-CN");
	assert.equal(store.getLanguageChoice(INPUT, RECEIVED, "channel-3"), "auto");
	assert.equal(store.getLanguageChoice(OUTPUT, RECEIVED, "channel-3"), "ru");
	assert.equal(store.hasChannelLanguageScope("channel-1", RECEIVED), true);
	assert.equal(store.hasChannelLanguageScope("channel-2", RECEIVED), false);
	assert.equal(store.hasGuildLanguageScope("guild-1", RECEIVED), true);
	assert.equal(store.hasGuildLanguageScope("guild-2", RECEIVED), false);
});

test("a scope stored for another place does not leak across places", () => {
	const {store} = createHarness({
		guildsByChannel: {"channel-1": "guild-1"},
		persisted: {
			channelLanguages: {"channel-1": {sent: {input: "ru", output: "ru"}}},
			choices: {received: {input: "en", output: "zh-CN"}, sent: {input: "auto", output: "en"}}
		}
	});
	store.reload();

	assert.equal(store.getLanguageChoice(INPUT, RECEIVED, "channel-1"), "en");
	assert.equal(store.getLanguageChoice(OUTPUT, SENT, "channel-1"), "ru");
});

test("a stored choice that the current engines no longer offer falls back to the first language", () => {
	const {store} = createHarness({
		persisted: {choices: {received: {input: "kl", output: "kl"}}}
	});

	assert.equal(store.getLanguageChoice(INPUT, RECEIVED, "channel-1"), "auto");
	assert.equal(store.getLanguageChoice(OUTPUT, RECEIVED, "channel-1"), "en");
});

test("the output direction never resolves to auto", () => {
	const {store} = createHarness({
		persisted: {choices: {received: {input: "auto", output: "auto"}}}
	});

	assert.equal(store.getLanguageChoice(INPUT, RECEIVED, "channel-1"), "auto");
	assert.equal(store.getLanguageChoice(OUTPUT, RECEIVED, "channel-1"), "en");
});

test("reload migrates every legacy Discord output choice to the current concrete language", () => {
	const {store, persisted, keysWritten} = createHarness({
		guildsByChannel: {"channel-1": "guild-1"},
		persisted: {
			choices: {
				received: {input: "auto", output: "$discord"},
				sent: {input: "auto", output: "$discord"}
			},
			channelLanguages: {
				"channel-1": {
					received: {input: "auto", output: "$discord"},
					sent: {input: "auto", output: "$discord"}
				}
			},
			guildLanguages: {
				"guild-1": {
					received: {input: "auto", output: "$discord"},
					sent: {input: "auto", output: "$discord"}
				}
			}
		},
		resolveLegacyDiscordLanguage: () => "zh-CN"
	});

	store.reload();

	assert.equal(persisted.choices.received.output, "zh-CN");
	assert.equal(persisted.choices.sent.output, "zh-CN");
	assert.equal(persisted.channelLanguages["channel-1"].received.output, "zh-CN");
	assert.equal(persisted.channelLanguages["channel-1"].sent.output, "zh-CN");
	assert.equal(persisted.guildLanguages["guild-1"].received.output, "zh-CN");
	assert.equal(persisted.guildLanguages["guild-1"].sent.output, "zh-CN");
	assert.equal(store.getLanguageChoice(OUTPUT, RECEIVED, "channel-1"), "zh-CN");
	assert.equal(store.getLanguageChoice(OUTPUT, SENT, "channel-1"), "zh-CN");
	assert.deepEqual(keysWritten(), ["channelLanguages", "guildLanguages", "choices", "choices"]);
});

test("saving a choice writes into the narrowest scope that already exists", () => {
	const {store, persisted, keysWritten} = createHarness({
		guildsByChannel: {"channel-1": "guild-1", "channel-2": "guild-1"},
		persisted: {
			channelLanguages: {"channel-1": {received: {input: "ru", output: "en"}}},
			guildLanguages: {"guild-1": {received: {input: "en", output: "zh-CN"}}}
		}
	});
	store.reload();

	assert.equal(store.saveLanguageChoice("zh-CN", INPUT, RECEIVED, "channel-1"), "channel");
	assert.equal(store.saveLanguageChoice("ru", INPUT, RECEIVED, "channel-2"), "guild");

	assert.deepEqual(persisted.channelLanguages, {"channel-1": {received: {input: "zh-CN", output: "en"}}});
	assert.deepEqual(persisted.guildLanguages, {"guild-1": {received: {input: "ru", output: "zh-CN"}}});
	assert.deepEqual(keysWritten(), ["channelLanguages", "guildLanguages"]);
});

test("saving a choice with no channel or guild scope updates the global plugin choice", () => {
	const {store, persisted} = createHarness({
		guildsByChannel: {"channel-1": "guild-1"},
		persisted: {choices: {received: {input: "auto", output: "en"}}}
	});

	assert.equal(store.saveLanguageChoice("zh-CN", OUTPUT, RECEIVED, "channel-1"), "global");

	assert.deepEqual(persisted.choices, {received: {input: "auto", output: "zh-CN"}});
	assert.deepEqual(persisted.channelLanguages, {});
	assert.deepEqual(persisted.guildLanguages, {});
});

test("ensureChannelLanguageChoiceScope creates the scope once and returns the same object", () => {
	const {store, keysWritten} = createHarness({
		persisted: {choices: {sent: {input: "ru", output: "ru"}}}
	});

	const scope = store.ensureChannelLanguageChoiceScope("channel-1", SENT);
	scope.output = "zh-CN";
	const again = store.ensureChannelLanguageChoiceScope("channel-1", SENT);

	assert.equal(again, scope);
	assert.equal(again.output, "zh-CN");
	// Creating a scope is not by itself a settings change, so nothing is written until
	// a caller actually saves a choice into it.
	assert.deepEqual(keysWritten(), []);
	assert.equal(store.ensureChannelLanguageChoiceScope("", SENT), null);
	assert.equal(store.ensureChannelLanguageChoiceScope("channel-1", ""), null);
});

test("a scope created by ensureChannelLanguageChoiceScope seeds from the language table, not from the inherited choice", () => {
	// Legacy behaviour, pinned deliberately: the empty scope is inserted before the
	// seed is read back, so it shadows the guild and global choices it should inherit.
	const {store} = createHarness({
		guildsByChannel: {"channel-1": "guild-1"},
		persisted: {
			guildLanguages: {"guild-1": {sent: {input: "ru", output: "ru"}}},
			choices: {sent: {input: "ru", output: "ru"}}
		}
	});
	store.reload();

	const scope = store.ensureChannelLanguageChoiceScope("channel-1", SENT);

	assert.deepEqual(scope, {input: "auto", output: "en"});
});

test("setChannelLanguageChoice pins one direction and persists the channel record", () => {
	const {store, persisted, keysWritten} = createHarness({
		persisted: {choices: {sent: {input: "auto", output: "en"}}}
	});

	const scope = store.setChannelLanguageChoice("channel-1", SENT, OUTPUT, "ru");

	assert.equal(scope.output, "ru");
	assert.deepEqual(persisted.channelLanguages, {"channel-1": {sent: {input: "auto", output: "ru"}}});
	assert.deepEqual(keysWritten(), ["channelLanguages"]);
	assert.equal(store.getLanguageChoice(OUTPUT, SENT, "channel-1"), "ru");
	assert.equal(store.setChannelLanguageChoice("", SENT, OUTPUT, "ru"), null);
	assert.equal(store.setChannelLanguageChoice("channel-1", SENT, "", "ru"), null);
});

test("cycling the scope of a place walks global, guild, channel and back to global", () => {
	const {store, persisted} = createHarness({
		guildsByChannel: {"channel-1": "guild-1"},
		persisted: {choices: {received: {input: "ru", output: "zh-CN"}}}
	});

	assert.equal(store.cycleLanguageChoiceScope("channel-1", "guild-1", RECEIVED), "guild");
	assert.deepEqual(persisted.guildLanguages, {"guild-1": {received: {input: "ru", output: "zh-CN"}}});
	assert.equal(store.getLanguageChoice(INPUT, RECEIVED, "channel-1"), "ru");

	assert.equal(store.cycleLanguageChoiceScope("channel-1", "guild-1", RECEIVED), "channel");
	// The guild record was emptied by the step, so it is removed rather than left as
	// an empty object in the saved file.
	assert.deepEqual(persisted.guildLanguages, {});
	assert.deepEqual(persisted.channelLanguages, {"channel-1": {received: {input: "ru", output: "zh-CN"}}});

	assert.equal(store.cycleLanguageChoiceScope("channel-1", "guild-1", RECEIVED), "global");
	assert.deepEqual(persisted.channelLanguages, {});
	assert.equal(store.getLanguageChoice(OUTPUT, RECEIVED, "channel-1"), "zh-CN");
});

test("cycling one place leaves the other places of the same channel untouched", () => {
	const {store, persisted} = createHarness({
		guildsByChannel: {"channel-1": "guild-1"},
		persisted: {
			channelLanguages: {"channel-1": {sent: {input: "ru", output: "ru"}}},
			choices: {received: {input: "auto", output: "en"}, sent: {input: "ru", output: "ru"}}
		}
	});
	store.reload();

	assert.equal(store.cycleLanguageChoiceScope("channel-1", "guild-1", RECEIVED), "guild");
	assert.deepEqual(persisted.channelLanguages, {"channel-1": {sent: {input: "ru", output: "ru"}}});

	assert.equal(store.cycleLanguageChoiceScope("channel-1", "guild-1", SENT), "global");
	assert.deepEqual(persisted.channelLanguages, {});
	assert.deepEqual(persisted.guildLanguages, {"guild-1": {received: {input: "auto", output: "en"}}});
});

test("stored channel engine overrides drop channels whose engine is not installed", () => {
	const {store} = createHarness({installedEngines: ["googleapi", "deepseek"]});

	assert.deepEqual(store.normalizeStoredChannelPrimaryEngineOverrides({
		"channel-1": "deepseek",
		"channel-2": "removed-engine",
		"channel-3": 7,
		"": "deepseek"
	}), {"channel-1": "deepseek"});
	assert.deepEqual(store.normalizeStoredChannelPrimaryEngineOverrides(null), {});
	assert.deepEqual(store.normalizeStoredChannelPrimaryEngineOverrides(["deepseek"]), {});
});

test("setting and clearing a channel primary engine persists the override record", () => {
	const {store, persisted} = createHarness();

	assert.equal(store.setChannelPrimaryEngine("channel-1", "deepseek"), true);
	assert.equal(store.getChannelPrimaryEngineOverride("channel-1"), "deepseek");
	assert.equal(store.hasChannelPrimaryEngineOverride("channel-1"), true);
	assert.deepEqual(persisted.channelPrimaryEngineOverrides, {"channel-1": "deepseek"});
	assert.deepEqual(store.listChannelPrimaryEngines(), ["deepseek"]);

	assert.equal(store.clearChannelPrimaryEngineOverride("channel-1"), true);
	assert.equal(store.getChannelPrimaryEngineOverride("channel-1"), null);
	assert.equal(store.hasChannelPrimaryEngineOverride("channel-1"), false);
	assert.deepEqual(persisted.channelPrimaryEngineOverrides, {});
	assert.equal(store.clearChannelPrimaryEngineOverride("channel-1"), false);
});

test("a channel primary engine is refused when the engine or the channel is unknown", () => {
	const {store, keysWritten} = createHarness();

	assert.equal(store.setChannelPrimaryEngine("channel-1", "not-an-engine"), false);
	assert.equal(store.setChannelPrimaryEngine("", "deepseek"), false);
	assert.equal(store.getChannelPrimaryEngineOverride(""), null);
	assert.deepEqual(keysWritten(), []);
});

test("an override that survived in the file but lost its engine stops applying", () => {
	const {store} = createHarness({
		installedEngines: ["googleapi"],
		persisted: {channelPrimaryEngineOverrides: {"channel-1": "deepseek"}}
	});
	store.reload();

	assert.equal(store.getChannelPrimaryEngineOverride("channel-1"), null);
	assert.equal(store.hasChannelPrimaryEngineOverride("channel-1"), false);
	assert.deepEqual(store.getChannelPrimaryEngineOverrides(), {});
});

test("saveChannelPrimaryEngineOverrides writes the record the caller already mutated", () => {
	const {store, persisted} = createHarness();

	store.getChannelPrimaryEngineOverrides()["channel-9"] = "deepl";
	store.saveChannelPrimaryEngineOverrides();

	assert.deepEqual(persisted.channelPrimaryEngineOverrides, {"channel-9": "deepl"});
});

test("enablement normalization rejects everything that is not the current shape", () => {
	assert.equal(normalizeStoredChannelEnablementState(null), null);
	assert.equal(normalizeStoredChannelEnablementState(["channel-1"]), null);
	assert.equal(normalizeStoredChannelEnablementState("on"), null);
	assert.deepEqual(normalizeStoredChannelEnablementState({}), {globalDefault: false, channelOverrides: {}});
	assert.deepEqual(normalizeStoredChannelEnablementState({globalDefault: 1, channelOverrides: "x"}), {globalDefault: true, channelOverrides: {}});
	assert.deepEqual(normalizeStoredChannelEnablementState({
		globalDefault: false,
		channelOverrides: {"channel-1": true, "channel-2": "yes", "": true}
	}), {globalDefault: false, channelOverrides: {"channel-1": true}});
});

test("a legacy array of channel ids migrates to per-channel overrides and drops the global sentinel", () => {
	assert.deepEqual(migrateLegacyChannelEnablementState(["channel-1", "global", "", 7, "channel-2"]), {
		globalDefault: false,
		channelOverrides: {"channel-1": true, "channel-2": true}
	});
	assert.deepEqual(migrateLegacyChannelEnablementState(null), createEmptyChannelEnablementState(false));
});

test("the primary enablement record wins over the compatibility record and the global default is forced off", () => {
	const merged = loadChannelEnablementState(
		{globalDefault: true, channelOverrides: {"channel-conflict": false}},
		{globalDefault: true, channelOverrides: {"channel-compat-only": true, "channel-compat-false": false, "channel-conflict": true}}
	);

	assert.deepEqual(merged, {
		globalDefault: false,
		channelOverrides: {
			"channel-compat-only": true,
			"channel-compat-false": false,
			"channel-conflict": false
		}
	});
});

test("a legacy array in the primary key still outranks the compatibility key", () => {
	assert.deepEqual(loadChannelEnablementState(["channel-1"], ["global"]), {
		globalDefault: false,
		channelOverrides: {"channel-1": true}
	});
});

test("an enablement value falls back to the global default when the channel has no record", () => {
	const state = {globalDefault: true, channelOverrides: {"channel-1": false}};

	assert.equal(getChannelEnablementStateValue("channel-1", state), false);
	assert.equal(getChannelEnablementStateValue("channel-2", state), true);
	assert.equal(getChannelEnablementStateValue(null, state), true);
	assert.equal(getChannelEnablementStateValue("channel-1", "garbage"), false);
});

test("enablement equality compares the normalized shape", () => {
	assert.equal(channelEnablementStatesEqual(
		{globalDefault: false, channelOverrides: {"channel-1": true}},
		{globalDefault: false, channelOverrides: {"channel-1": true, "channel-2": "not a boolean"}}
	), true);
	assert.equal(channelEnablementStatesEqual(
		{globalDefault: false, channelOverrides: {"channel-1": true}},
		{globalDefault: false, channelOverrides: {"channel-1": false}}
	), false);
	assert.equal(channelEnablementStatesEqual(
		{globalDefault: false, channelOverrides: {}},
		{globalDefault: true, channelOverrides: {}}
	), false);
	assert.equal(channelEnablementStatesEqual(null, undefined), true);
});

test("toggling a channel stores only the channels that differ from the default", () => {
	const {store, persisted} = createHarness();

	store.setChannelEnablementStateValue("channel-1", true);

	assert.equal(store.isTranslationEnabled("channel-1"), true);
	assert.equal(store.isTranslationEnabled("channel-2"), false);
	assert.deepEqual(persisted.translationEnabledStates, {globalDefault: false, channelOverrides: {"channel-1": true}});
	assert.deepEqual(persisted.receivedAutoTranslationEnabledStates, persisted.translationEnabledStates);

	store.setChannelEnablementStateValue("channel-1", false);

	assert.equal(store.isTranslationEnabled("channel-1"), false);
	assert.deepEqual(persisted.translationEnabledStates, {globalDefault: false, channelOverrides: {}});
});

test("an enablement toggle without a channel id changes nothing", () => {
	const {store, keysWritten} = createHarness();

	const state = store.setChannelEnablementStateValue("", true);

	assert.deepEqual(state, {globalDefault: false, channelOverrides: {}});
	assert.deepEqual(keysWritten(), []);
});

test("saveChannelEnablementState replaces the live state and writes both keys", () => {
	const {store, persisted, keysWritten} = createHarness();

	store.saveChannelEnablementState({globalDefault: false, channelOverrides: {"channel-7": true}});

	assert.equal(store.isTranslationEnabled("channel-7"), true);
	assert.deepEqual(store.getChannelEnablementState(), {globalDefault: false, channelOverrides: {"channel-7": true}});
	assert.deepEqual(keysWritten(), ["translationEnabledStates", "receivedAutoTranslationEnabledStates"]);
	assert.deepEqual(persisted.receivedAutoTranslationEnabledStates, {globalDefault: false, channelOverrides: {"channel-7": true}});
});

test("reload migrates legacy arrays and repairs both stored keys", () => {
	const {store, persisted} = createHarness({
		persisted: {
			translationEnabledStates: ["channel-1"],
			receivedAutoTranslationEnabledStates: ["global"]
		}
	});

	store.reload();

	assert.equal(store.isTranslationEnabled("channel-1"), true);
	assert.equal(store.isTranslationEnabled("channel-2"), false);
	assert.deepEqual(persisted.translationEnabledStates, {globalDefault: false, channelOverrides: {"channel-1": true}});
	assert.deepEqual(persisted.receivedAutoTranslationEnabledStates, {globalDefault: false, channelOverrides: {"channel-1": true}});
});

test("reload keeps a channel that only the compatibility key knows about", () => {
	const {store, persisted} = createHarness({
		persisted: {
			translationEnabledStates: {globalDefault: true, channelOverrides: {"channel-conflict": false}},
			receivedAutoTranslationEnabledStates: {
				globalDefault: true,
				channelOverrides: {"channel-compat-only": true, "channel-compat-false": false, "channel-conflict": true}
			}
		}
	});

	store.reload();

	assert.equal(store.isTranslationEnabled("channel-compat-only"), true);
	assert.equal(store.isTranslationEnabled("channel-compat-false"), false);
	assert.equal(store.isTranslationEnabled("channel-conflict"), false);
	assert.deepEqual(persisted.translationEnabledStates, {
		globalDefault: false,
		channelOverrides: {"channel-compat-only": true, "channel-compat-false": false, "channel-conflict": false}
	});
});

test("reload does not rewrite an enablement state that is already migrated", () => {
	const {store, keysWritten} = createHarness({
		persisted: {
			translationEnabledStates: {globalDefault: false, channelOverrides: {"channel-1": true}},
			receivedAutoTranslationEnabledStates: {globalDefault: false, channelOverrides: {"channel-1": true}}
		}
	});

	store.reload();

	assert.equal(store.isTranslationEnabled("channel-1"), true);
	assert.deepEqual(keysWritten(), []);
});

test("reload keeps the live enablement state and writes nothing when neither key can be read", () => {
	// The stale-reload guard: a read that returned nothing is not the user turning
	// every channel off, and the state a migration would produce here is empty by
	// construction, so writing it could only erase per-channel toggles.
	const {store, persisted, keysWritten} = createHarness();
	store.setChannelEnablementStateValue("channel-1", true);
	persisted.translationEnabledStates = null;
	persisted.receivedAutoTranslationEnabledStates = null;
	const writesBefore = keysWritten().length;

	store.reload();

	assert.equal(store.isTranslationEnabled("channel-1"), true);
	assert.equal(keysWritten().length, writesBefore);
});

test("reload still migrates when only one of the two enablement keys is readable", () => {
	const {store, persisted} = createHarness({
		persisted: {
			translationEnabledStates: null,
			receivedAutoTranslationEnabledStates: {globalDefault: false, channelOverrides: {"channel-1": true}}
		}
	});

	store.reload();

	assert.equal(store.isTranslationEnabled("channel-1"), true);
	assert.deepEqual(persisted.translationEnabledStates, {globalDefault: false, channelOverrides: {"channel-1": true}});
});

test("reload keeps the records it already has when a loader returns nothing", () => {
	const {store, persisted} = createHarness();
	store.setCredentialField("openai", "key", "sk-secret");
	store.setChannelLanguageChoice("channel-1", SENT, OUTPUT, "ru");
	store.setChannelPrimaryEngine("channel-1", "deepseek");
	store.setFavorite("ru", true);

	persisted.authKeys = undefined;
	persisted.channelLanguages = null;
	persisted.guildLanguages = undefined;
	persisted.channelPrimaryEngineOverrides = null;
	persisted.favorites = "not an array";
	store.reload();

	assert.equal(store.getCredentialField("openai", "key"), "sk-secret");
	assert.equal(store.getLanguageChoice(OUTPUT, SENT, "channel-1"), "ru");
	assert.equal(store.getChannelPrimaryEngineOverride("channel-1"), "deepseek");
	assert.deepEqual(store.getFavorites(), ["ru"]);
});

test("reload adopts an empty record when that is genuinely what is stored", () => {
	const {store, persisted} = createHarness();
	store.setCredentialField("openai", "key", "sk-secret");

	persisted.authKeys = {};
	store.reload();

	assert.equal(store.getCredentialField("openai", "key"), undefined);
	assert.deepEqual(store.getAuthKeys(), {});
});

test("reload normalizes the stored engine overrides before they are used", () => {
	const {store} = createHarness({
		installedEngines: ["googleapi", "deepseek"],
		persisted: {channelPrimaryEngineOverrides: {"channel-1": "deepseek", "channel-2": "gone"}}
	});

	store.reload();

	assert.deepEqual(store.getChannelPrimaryEngineOverrides(), {"channel-1": "deepseek"});
});

test("reload does not persist anything it merely read", () => {
	const {store, keysWritten} = createHarness({
		persisted: {
			favorites: ["ru"],
			authKeys: {openai: {key: "sk"}},
			channelLanguages: {"channel-1": {sent: {input: "auto", output: "ru"}}},
			guildLanguages: {"guild-1": {sent: {input: "auto", output: "en"}}},
			channelPrimaryEngineOverrides: {"channel-1": "deepseek"},
			translationEnabledStates: {globalDefault: false, channelOverrides: {}},
			receivedAutoTranslationEnabledStates: {globalDefault: false, channelOverrides: {}}
		}
	});

	store.reload();

	assert.deepEqual(keysWritten(), []);
});

test("a reloaded favourite list is applied the next time the language table is built", () => {
	const {store, persisted} = createHarness();

	persisted.favorites = ["ru"];
	store.reload();
	store.setLanguages(createLanguageTable());

	assert.equal(store.getLanguage("ru").fav, 0);
	assert.equal(store.getLanguage("en").fav, 1);
});
