const test = require("node:test");
const assert = require("node:assert/strict");
const {createManualTranslationButtonPluginInstance: createPluginInstance} = require("./helpers/createPluginInstance");

test("manual message translate ignores hidden auto-translation state when master switch is off", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-1"};
	const message = {
		id: "message-1",
		channel_id: channel.id,
		content: "hola",
		embeds: [],
		author: {id: "other-user"}
	};

	plugin.applyStoredTranslationToMessage(message, {
		channelId: channel.id,
		auto: true,
		content: "hello\n> hola",
		translatedContent: "hello",
		originalContent: "hola"
	});

	assert.equal(plugin.getActiveMessageTranslation(message, channel.id), null);

	let translateCalls = 0;
	plugin.translateText = (_text, _place, callback) => {
		translateCalls++;
		callback("hello", {id: "es"}, {id: "en"}, {});
	};

	const result = await plugin.translateMessage(message, channel, {manual: true, independentOfTextAreaSwitch: true});
	assert.equal(result, true);
	assert.equal(translateCalls, 1);

	const activeTranslation = plugin.getActiveMessageTranslation(message, channel.id);
	assert.ok(activeTranslation);
	assert.equal(activeTranslation.translatedContent, "hello");
	assert.equal(activeTranslation.auto, false);
	assert.equal(activeTranslation.manual, true);
	assert.equal(activeTranslation.independentOfTextAreaSwitch, true);
});

test("manual message translation deduplicates repeated clicks for the same message", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-deduplicate"};
	const message = {
		id: "message-deduplicate",
		channel_id: channel.id,
		content: "hola amigo",
		embeds: [],
		author: {id: "other-user"}
	};
	const callbacks = [];
	plugin.translateText = (_text, _place, callback) => {
		callbacks.push(callback);
	};

	const firstTranslation = plugin.translateMessage(message, channel, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false});
	const duplicateTranslation = plugin.translateMessage(message, channel, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false});

	assert.equal(callbacks.length, 1);
	assert.equal(await duplicateTranslation, false);

	callbacks[0]("hello friend", {id: "es"}, {id: "en"}, {});
	assert.equal(await firstTranslation, true);
});

test("manual embed translation uses the shared parser and preserves partial fields", async () => {
	const plugin = createPluginInstance();
	const channel = {id: "channel-embed"};
	const message = {
		id: "message-embed",
		channel_id: channel.id,
		content: "",
		embeds: [{id: "embed-1", rawTitle: "Original title", rawDescription: "Original description", footer: {text: "Original footer"}, fields: [{rawName: "Original name", rawValue: "Original value"}]}],
		author: {id: "other-user"}
	};
	plugin.translateText = (_text, _place, callback) => callback("__________________ __________________ __________________\nTranslated title", {id: "es"}, {id: "en"}, {});

	assert.equal(await plugin.translateMessage(message, channel, {manual: true, independentOfTextAreaSwitch: true}), true);
	const translation = plugin.getActiveMessageTranslation(message, channel.id);

	assert.equal(translation.embeds["embed-1"].title, "Translated title");
	assert.equal(translation.embeds["embed-1"].description, "Original description");
	assert.equal(translation.embeds["embed-1"].footerText, "Original footer");
	assert.deepEqual(translation.embeds["embed-1"].fields, [{name: "Original name", value: "Original value"}]);
});

test("a manual translation paints through the per-message transaction, not the whole list", async () => {
	// Display-unification 5a: the manual commit already lands in the display store;
	// the paint must ride the same acknowledged per-message flush the automatic path
	// uses instead of rebuilding the whole list.
	const plugin = createPluginInstance();
	const channel = {id: "channel-manual-transaction"};
	const message = {
		id: "message-manual-transaction",
		channel_id: channel.id,
		content: "hola amigo",
		embeds: [],
		author: {id: "other-user"}
	};
	const flushes = [];
	plugin.scheduleTranslationRerender = () => {throw new Error("a manual result must not repaint the whole list");};
	plugin.scheduleReceivedDisplayFlush = (channelId, messageId) => {flushes.push({channelId, messageId});};
	plugin.translateText = (_text, _place, callback) => {callback("hello friend", {id: "es"}, {id: "en"}, {});};

	const result = await plugin.translateMessage(message, channel, {manual: true, trackBusy: false});

	assert.equal(result, true);
	assert.deepEqual(flushes, [{channelId: channel.id, messageId: message.id}]);
	const state = plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id);
	assert.equal(state && state.status, "translated", "the manual result is committed to the display store");
	assert.equal(state && state.origin, "manual");
});
