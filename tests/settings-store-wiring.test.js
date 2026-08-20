const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginSettingsStore, resolveConcreteDiscordLanguageId} = require("../src/settings/settings-store-wiring");

function createFixture() {
	const loads = [];
	const saves = [];
	const sorts = [];
	const persisted = {
		favorites: ["en"],
		authKeys: {deepl: {key: "secret"}},
		channelLanguages: {c1: {}},
		guildLanguages: {g1: {}},
		channelPrimaryEngineOverrides: {c1: "deepl"},
		translationEnabledStates: {globalDefault: false, channelOverrides: {c1: true}},
		receivedAutoTranslationEnabledStates: {globalDefault: false, channelOverrides: {c1: true}}
	};
	const plugin = {
		settings: {choices: {received: {input: "auto", output: "en"}}}
	};
	const BDFDB = {
		ObjectUtils: {
			sort(table, key) {
				sorts.push({table, key});
				return {sorted: table};
			}
		},
		LibraryStores: {
			ChannelStore: {
				getChannel(channelId) {
					if (channelId == "guild-channel") return {guild_id: "guild-1"};
					if (channelId == "dm-channel") return {guild_id: null};
					return null;
				}
			}
		},
		DataUtils: {
			load(owner, key) {
				loads.push({owner, key});
				return persisted[key];
			},
			save(value, owner, key) {
				saves.push({value, owner, key});
			}
		}
	};
	const translationEngines = {googleapi: {}, deepl: {}};
	let dependencies = null;
	const store = {tag: "settings-store"};
	const created = createPluginSettingsStore({
		plugin,
		BDFDB,
		translationEngines,
		createStore: input => (dependencies = input, store)
	});
	return {plugin, BDFDB, persisted, loads, saves, sorts, dependencies, store, created};
}

test("plugin settings wiring creates the store with the complete dependency contract", () => {
	const fixture = createFixture();

	assert.equal(fixture.created, fixture.store);
	assert.deepEqual(Object.keys(fixture.dependencies).sort(), [
		"isKnownEngine",
		"loadAuthKeys",
		"loadChannelLanguages",
		"loadChannelPrimaryEngineOverrides",
		"loadFavorites",
		"loadGlobalLanguageChoice",
		"loadGuildLanguages",
		"loadReceivedAutoTranslationEnabledStates",
		"loadTranslationEnabledStates",
		"persistAuthKeys",
		"persistChannelEnablementState",
		"persistChannelLanguages",
		"persistChannelPrimaryEngineOverrides",
		"persistFavorites",
		"persistGlobalLanguageChoice",
		"persistGuildLanguages",
		"resolveLegacyDiscordLanguage",
		"resolveGuildId",
		"sortLanguages"
	].sort());
	assert.equal(fixture.dependencies.isKnownEngine("googleapi"), true);
	assert.equal(fixture.dependencies.isKnownEngine("missing"), false);
	assert.deepEqual(fixture.dependencies.sortLanguages({en: {}}), {sorted: {en: {}}});
	assert.deepEqual(fixture.sorts, [{table: {en: {}}, key: "fav"}]);
	assert.equal(fixture.dependencies.resolveGuildId("guild-channel"), "guild-1");
	assert.equal(fixture.dependencies.resolveGuildId("dm-channel"), "@me");
	assert.equal(fixture.dependencies.resolveGuildId("missing"), null);
	assert.equal(fixture.dependencies.resolveLegacyDiscordLanguage(), "en");
});

test("plugin settings wiring keeps every persisted record on its established BDFDB key", () => {
	const fixture = createFixture();
	const dependencies = fixture.dependencies;
	const loadContracts = [
		["favorites", "loadFavorites"],
		["authKeys", "loadAuthKeys"],
		["channelLanguages", "loadChannelLanguages"],
		["guildLanguages", "loadGuildLanguages"],
		["channelPrimaryEngineOverrides", "loadChannelPrimaryEngineOverrides"],
		["translationEnabledStates", "loadTranslationEnabledStates"],
		["receivedAutoTranslationEnabledStates", "loadReceivedAutoTranslationEnabledStates"]
	];
	for (const [key, method] of loadContracts) assert.equal(dependencies[method](), fixture.persisted[key]);
	assert.deepEqual(fixture.loads.map(call => call.key), loadContracts.map(([key]) => key));
	assert.ok(fixture.loads.every(call => call.owner === fixture.plugin));

	const value = {saved: true};
	dependencies.persistFavorites(value);
	dependencies.persistAuthKeys(value);
	dependencies.persistChannelLanguages(value);
	dependencies.persistGuildLanguages(value);
	dependencies.persistChannelPrimaryEngineOverrides(value);
	dependencies.persistChannelEnablementState(value);
	assert.deepEqual(fixture.saves.map(call => call.key), [
		"favorites",
		"authKeys",
		"channelLanguages",
		"guildLanguages",
		"channelPrimaryEngineOverrides",
		"translationEnabledStates",
		"receivedAutoTranslationEnabledStates"
	]);
	assert.ok(fixture.saves.every(call => call.owner === fixture.plugin && call.value === value));
});

test("global language choices remain owned by plugin settings and persist as one choices record", () => {
	const fixture = createFixture();

	assert.equal(fixture.dependencies.loadGlobalLanguageChoice("received", "input"), "auto");
	assert.equal(fixture.dependencies.loadGlobalLanguageChoice("sent", "input"), undefined);
	fixture.dependencies.persistGlobalLanguageChoice("received", "output", "zh-CN");

	assert.equal(fixture.plugin.settings.choices.received.output, "zh-CN");
	assert.deepEqual(fixture.saves, [{
		value: fixture.plugin.settings.choices,
		owner: fixture.plugin,
		key: "choices"
	}]);
});

test("the retired Discord alias resolves to a provider-supported concrete locale", () => {
	const engines = {googleapi: {languages: ["en", "zh-CN", "fr"]}};
	assert.equal(resolveConcreteDiscordLanguageId({LanguageUtils: {getLanguage: () => ({id: "zh-cn"})}}, engines), "zh-CN");
	assert.equal(resolveConcreteDiscordLanguageId({LanguageUtils: {getLanguage: () => ({id: "unsupported"})}}, engines), "en");
	assert.equal(resolveConcreteDiscordLanguageId(null, {}), "en");
});
