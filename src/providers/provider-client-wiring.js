const {createProviderClient} = require("./provider-client");

// Owns the plugin/BDFDB adapter for provider transport. The provider client keeps
// HTTP contracts, backoff, credentials and parsing behaviour; this module only maps
// its ports to the plugin's established runtime owners.
function createPluginProviderClient({
	plugin,
	BDFDB,
	now = Date.now,
	// Deliberately raw: a BDFDB-managed backoff sleep would be cancelled on stop and
	// leave the awaiting provider promise pending forever.
	sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
	createClient = createProviderClient
}) {
	return createClient({
		request: (url, options, callback) => BDFDB.LibraryRequires.request(url, options, callback),
		setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
		sleep,
		now,
		getAuthKeys: () => plugin.ensureSettingsStore().getAuthKeys(),
		saveAuthKeys: value => plugin.ensureSettingsStore().replaceAuthKeys(value),
		getLanguages: () => plugin.ensureSettingsStore().getLanguages(),
		notify: (message, options) => BDFDB.NotificationUtils.toast(message, options),
		getLabels: () => plugin.labels,
		getCustomText: key => plugin.getCustomText(key),
		getEngineLabel: engineKey => plugin.getEngineLabel(engineKey),
		shouldUseAiAutoTranslateDecision: channelId => plugin.shouldUseAiAutoTranslateDecision(channelId),
		getAiAutoTranslatePrompt: translationData => plugin.getAiAutoTranslatePrompt(translationData)
	});
}

module.exports = {createPluginProviderClient};
