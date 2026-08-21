const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

function createPersistedPlugin(initialOverrides = {}, initialAuthKeys = {}) {
	const persisted = {
		channelPrimaryEngineOverrides: Object.assign({}, initialOverrides),
		authKeys: JSON.parse(JSON.stringify(initialAuthKeys))
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		settings: {
			engines: {
				translator: "googleapi",
				backup: "----"
			}
		},
		bdfdb: {
			DataUtils: {
				load: (_plugin, key) => persisted[key] == null ? {} : persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = JSON.parse(JSON.stringify(value));
				}
			}
		}
	});
	plugin.forceUpdateAll = Object.getPrototypeOf(plugin).forceUpdateAll.bind(plugin);
	plugin.clearAutoTranslationQueue = () => {};
	plugin.resetAutoTranslationTracking = () => {};
	plugin.clearLoadedAutoTranslationStatus = () => {};
	plugin.forceUpdateAll();
	return {plugin, persisted};
}

test("channel without a primary engine override follows the global primary engine", () => {
	const {plugin} = createPersistedPlugin();

	assert.equal(plugin.getEffectivePrimaryEngine("channel-1"), "googleapi");
	plugin.settings.engines.translator = "deepseek";
	assert.equal(plugin.getEffectivePrimaryEngine("channel-1"), "deepseek");
});

test("channel primary engine override is persisted and can be cleared back to global", () => {
	const {plugin, persisted} = createPersistedPlugin();

	plugin.setChannelPrimaryEngine("channel-1", "deepseek");
	assert.equal(plugin.getEffectivePrimaryEngine("channel-1"), "deepseek");
	assert.deepEqual(persisted.channelPrimaryEngineOverrides, {"channel-1": "deepseek"});

	plugin.clearChannelPrimaryEngineOverride("channel-1");
	assert.equal(plugin.getEffectivePrimaryEngine("channel-1"), "googleapi");
	assert.deepEqual(persisted.channelPrimaryEngineOverrides, {});
});

test("explicitly selecting the current global engine remains pinned until restore", () => {
	const {plugin, persisted} = createPersistedPlugin();

	plugin.setChannelPrimaryEngine("channel-1", "googleapi");
	assert.deepEqual(persisted.channelPrimaryEngineOverrides, {"channel-1": "googleapi"});

	plugin.settings.engines.translator = "deepseek";
	assert.equal(plugin.getEffectivePrimaryEngine("channel-1"), "googleapi");
	assert.equal(plugin.getEffectivePrimaryEngine("channel-2"), "deepseek");

	plugin.clearChannelPrimaryEngineOverride("channel-1");
	assert.equal(plugin.getEffectivePrimaryEngine("channel-1"), "deepseek");
});

test("DeepL reports missing global API configuration before runtime dispatch", () => {
	const {plugin: unconfiguredPlugin} = createPersistedPlugin();
	const {plugin: configuredPlugin} = createPersistedPlugin({}, {deepl: {key: "test-key"}});

	assert.equal(unconfiguredPlugin.isEngineConfiguredForRuntime("deepl"), false);
	assert.equal(configuredPlugin.isEngineConfiguredForRuntime("deepl"), true);
});

test("effective channel primary engine changes received and reply cache signatures", () => {
	const {plugin} = createPersistedPlugin({"channel-2": "deepseek"});
	const message = {id: "message-1", content: "hello", embeds: []};
	const source = {content: "hello", embeds: []};

	const receivedGlobal = JSON.parse(plugin.createReceivedTranslationSignature(message, "channel-1", source));
	const receivedOverride = JSON.parse(plugin.createReceivedTranslationSignature(message, "channel-2", source));
	const replyGlobal = JSON.parse(plugin.createReplyPreviewSignature(message, "channel-1", "hello"));
	const replyOverride = JSON.parse(plugin.createReplyPreviewSignature(message, "channel-2", "hello"));

	assert.equal(receivedGlobal.translator, "googleapi");
	assert.equal(receivedOverride.translator, "deepseek");
	assert.notEqual(plugin.createReceivedTranslationSignature(message, "channel-1", source), plugin.createReceivedTranslationSignature(message, "channel-2", source));
	assert.equal(replyGlobal.translator, "googleapi");
	assert.equal(replyOverride.translator, "deepseek");
});

test("changing a channel primary engine pulses one message-list projection instead of scheduling a full repaint", () => {
	const {plugin} = createPersistedPlugin();
	const calls = [];
	plugin.clearDisplayedAutoTranslations = channelId => calls.push(["clear-display", channelId]);
	plugin.clearAutoTranslationQueue = channelId => calls.push(["clear-queue", channelId]);
	plugin.resetAutoTranslationTracking = channelId => calls.push(["reset-tracking", channelId]);
	plugin.ensureReceivedDisplayRuntime = () => ({pulseChannelProjection: channelId => (calls.push(["pulse-projection", channelId]), true)});
	plugin.scheduleTranslationRerender = () => assert.fail("primary-engine refresh must not schedule a whole-chat repaint");
	plugin.processAutoTranslationQueue = () => calls.push(["process-queue"]);

	plugin.refreshChannelPrimaryEngineRuntime("channel-1");

	assert.deepEqual(calls, [
		["clear-display", "channel-1"],
		["clear-queue", "channel-1"],
		["reset-tracking", "channel-1"],
		["pulse-projection", "channel-1"],
		["process-queue"]
	]);
});

test("translateText dispatches received and sent work through the channel primary engine", async () => {
	const {plugin} = createPersistedPlugin({"channel-2": "deepseek"});
	plugin.setLanguages();
	plugin.getLanguageChoice = direction => direction == "input" ? "auto" : "zh-CN";
	plugin.validTranslator = () => true;
	const calls = [];
	plugin.googleApiTranslate = (_data, callback) => {
		calls.push("googleapi");
		callback("google result");
	};
	plugin.deepSeekTranslate = (_data, callback) => {
		calls.push("deepseek");
		callback("deepseek result");
	};

	await new Promise(resolve => plugin.translateText("received text", "received", resolve, null, {
		showToast: false,
		showFailureToast: false,
		trackBusy: false,
		channelId: "channel-2"
	}));
	await new Promise(resolve => plugin.translateText("sent text", "sent", resolve, null, {
		showToast: false,
		showFailureToast: false,
		trackBusy: false,
		channelId: "channel-2"
	}));

	assert.deepEqual(calls, ["deepseek", "deepseek"]);
});
