const {createSettingsStore} = require("./settings-store");

// Owns the plugin/BDFDB adapter for the settings store. The store itself knows
// persistence semantics but deliberately knows nothing about BetterDiscord; this
// wiring is the one place that maps its records to the established profile keys.
function createPluginSettingsStore({
	plugin,
	BDFDB,
	translationEngines,
	createStore = createSettingsStore
}) {
	return createStore({
		isKnownEngine: engineKey => !!translationEngines[engineKey],
		sortLanguages: table => BDFDB.ObjectUtils.sort(table, "fav"),
		resolveGuildId: channelId => {
			const channel = channelId && BDFDB.LibraryStores.ChannelStore.getChannel(channelId);
			return channel ? (channel.guild_id ? channel.guild_id : "@me") : null;
		},
		loadFavorites: () => BDFDB.DataUtils.load(plugin, "favorites"),
		persistFavorites: value => BDFDB.DataUtils.save(value, plugin, "favorites"),
		loadAuthKeys: () => BDFDB.DataUtils.load(plugin, "authKeys"),
		persistAuthKeys: value => BDFDB.DataUtils.save(value, plugin, "authKeys"),
		loadChannelLanguages: () => BDFDB.DataUtils.load(plugin, "channelLanguages"),
		persistChannelLanguages: value => BDFDB.DataUtils.save(value, plugin, "channelLanguages"),
		loadGuildLanguages: () => BDFDB.DataUtils.load(plugin, "guildLanguages"),
		persistGuildLanguages: value => BDFDB.DataUtils.save(value, plugin, "guildLanguages"),
		loadChannelPrimaryEngineOverrides: () => BDFDB.DataUtils.load(plugin, "channelPrimaryEngineOverrides"),
		persistChannelPrimaryEngineOverrides: value => BDFDB.DataUtils.save(value, plugin, "channelPrimaryEngineOverrides"),
		loadTranslationEnabledStates: () => BDFDB.DataUtils.load(plugin, "translationEnabledStates"),
		loadReceivedAutoTranslationEnabledStates: () => BDFDB.DataUtils.load(plugin, "receivedAutoTranslationEnabledStates"),
		persistChannelEnablementState: value => {
			BDFDB.DataUtils.save(value, plugin, "translationEnabledStates");
			BDFDB.DataUtils.save(value, plugin, "receivedAutoTranslationEnabledStates");
		},
		loadGlobalLanguageChoice: (place, direction) => plugin.settings.choices[place] && plugin.settings.choices[place][direction],
		persistGlobalLanguageChoice: (place, direction, choice) => {
			plugin.settings.choices[place][direction] = choice;
			BDFDB.DataUtils.save(plugin.settings.choices, plugin, "choices");
		}
	});
}

module.exports = {createPluginSettingsStore};
