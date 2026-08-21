const test = require("node:test");
const assert = require("node:assert/strict");
const {createHarness, sourceSnapshot, translatedResult} = require("../helpers/createReceivedDisplayHarness");

test("Messages and MessageContent read the same translated revision", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());
		const view = plugin.getReceivedDisplayView("message-1");
		const stream = {content: {id: "message-1", channel_id: "channel-1", content: "Original", embeds: []}};
		plugin.applyReceivedDisplayViewToStream(stream, view);
		const event = {instance: {props: {message: stream.content}}, returnvalue: {props: {children: [], className: "message", style: {}}}};
		plugin.applyReceivedDisplayViewToContent(event, view);

		assert.equal(stream.content.content, "译文");
		assert.equal(event.returnvalue.props["data-translator-revision"], String(view.revision));
		assert.match(event.returnvalue.props.className, /translator-translated-message/);
		assert.equal(event.returnvalue.props.style["--translator-text-color"], "#12a594");
		assert.equal(event.returnvalue.props.children.some(child => child && child.key === "translator-translated-watermark"), true);
	}
	finally {harness.restore();}
});

test("a translated result cannot produce text without translated decoration", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());
		const view = plugin.getReceivedDisplayView("message-1");
		const stream = {content: {id: "message-1", channel_id: "channel-1", content: "Original", embeds: []}};
		const event = {instance: {props: {message: stream.content}}, returnvalue: {props: {children: [], className: "", style: {}}}};

		plugin.applyReceivedDisplayViewToStream(stream, view);
		plugin.applyReceivedDisplayViewToContent(event, view);

		assert.equal(stream.content.content === "译文", event.returnvalue.props.className.includes("translator-translated-message"));
		assert.equal(event.returnvalue.props["data-translator-revision"], String(view.revision));
	}
	finally {harness.restore();}
});

test("render acknowledgement failure keeps the record inspectable", async () => {
	const harness = createHarness({confirmAfterFallback: false});
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());

		const view = plugin.getReceivedDisplayView("message-1");
		assert.equal(view.renderStatus, "unconfirmed");
		assert.equal(view.renderReason, "render-unconfirmed");
	}
	finally {harness.restore();}
});

test("a confirmed render acknowledgement marks the committed revision confirmed", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		const outcome = await plugin.commitReceivedDisplayResult(translatedResult());

		assert.deepEqual(outcome, {confirmedIds: ["message-1"], missingIds: [], fallbackUsed: false});
		assert.equal(calls.messageUpdates, 1);
		assert.equal(calls.rerenderAll, 0, "ordinary acknowledgement must preserve the Composer boundary");
		assert.equal(plugin.getReceivedDisplayView("message-1").renderStatus, "confirmed");
	}
	finally {harness.restore();}
});

test("a pending view renders one loading indicator without translated decoration", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.markReceivedDisplayPending({messageId: "message-1", channelId: "channel-1", generation: 1, origin: "automatic", requestIdentity: "request-1"}, {refresh: false});
		const view = plugin.getReceivedDisplayView("message-1");
		const event = {instance: {props: {message: {id: "message-1", channel_id: "channel-1", content: "Original", embeds: []}}}, returnvalue: {props: {children: [], className: "", style: {}}}};

		plugin.applyReceivedDisplayViewToContent(event, view);

		assert.equal(view.showLoading, true);
		assert.equal(event.returnvalue.props.children.filter(child => child && child.key === "translator-translation-loading").length, 1);
		assert.doesNotMatch(event.returnvalue.props.className, /translator-translated-message/);
	}
	finally {harness.restore();}
});

test("checkMessage captures the received source into the display store", () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		const message = {id: "message-1", channel_id: "channel-1", content: "Original", embeds: [], attachments: [], author: {id: "other-user"}};
		const stream = {content: message};
		plugin.captureSentOriginalMessage = () => {};
		plugin.queueAutoTranslateMessage = () => false;

		plugin.checkMessage(stream, message, {id: "channel-1"});

		const view = plugin.getReceivedDisplayView("message-1");
		assert.ok(view);
		assert.equal(view.status, "idle");
		assert.equal(view.channelId, "channel-1");
		assert.equal(view.content, "Original");
		assert.equal(view.translated, false);
		assert.equal(plugin.getReceivedDisplayGeneration("channel-1"), 1);
	}
	finally {harness.restore();}
});

test("manual untranslate restores a store-owned automatic translation", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());
		assert.equal(plugin.getReceivedDisplayView("message-1").translated, true);
		const message = {id: "message-1", channel_id: "channel-1", content: "Original", embeds: [], attachments: [], author: {id: "other-user"}};
		plugin.lockManualTranslationScroll = () => {};

		const handled = await plugin.translateMessage(message, {id: "channel-1"}, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false});

		assert.equal(handled, false);
		const view = plugin.getReceivedDisplayView("message-1");
		assert.equal(view.translated, false);
		assert.equal(view.status, "cancelled");
		assert.equal(view.content, "Original");
	}
	finally {harness.restore();}
});

test("a store-committed translation renders its embed translations", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		const result = translatedResult();
		result.translation = Object.assign({}, result.translation, {embeds: {"embed-1": {title: "标题", description: "描述", fields: [], footerText: "页脚"}}});
		await plugin.commitReceivedDisplayResult(result);
		const event = {instance: {props: {embed: {id: "embed-1", message_id: "message-1", rawDescription: "Description", rawTitle: "Title", footer: {text: "Footer"}, fields: []}}}};

		plugin.processEmbed(event);

		assert.equal(event.instance.props.embed.rawDescription, "描述");
		assert.equal(event.instance.props.embed.rawTitle, "标题");
	}
	finally {harness.restore();}
});

test("a store-translated message does not requeue in loaded scope", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());
		let queueCalls = 0;
		plugin.queueAutoTranslateMessage = () => {queueCalls++; return true;};
		plugin.getCachedReceivedTranslation = () => ({content: "译文", translatedContent: "译文", originalContent: "Original", signature: "signature-1"});
		const message = {id: "message-1", channel_id: "channel-1", content: "Original", embeds: [], attachments: [], author: {id: "other-user"}};
		const event = {instance: {props: {message}}, returnvalue: {props: {children: [], className: "", style: {}}}};

		plugin.processMessageContent(event);

		assert.equal(queueCalls, 0);
		assert.match(event.returnvalue.props.className, /translator-translated-message/);
		assert.equal(event.returnvalue.props["data-translator-revision"], String(plugin.getReceivedDisplayView("message-1").revision));
	}
	finally {harness.restore();}
});

test("revisiting a pruned channel restores its translation from cache without a provider request", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		const messageId = "1532028320168939620";
		plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
		plugin.clearAutoTranslationQueue = () => {};
		plugin.clearAutoTranslationEligibleReplyPreviewMessages = () => {};
		plugin.captureReceivedMessageSource({messageId, channelId: "channel-1", generation: 1, sourceSignature: "signature-1", source: {content: "Original", embeds: []}});
		await plugin.commitReceivedDisplayResult({messageId, channelId: "channel-1", generation: 1, sourceSignature: "signature-1", origin: "automatic", status: "translated", translation: {content: "译文"}});
		let cacheReads = 0;
		plugin.getCachedReceivedTranslation = (message, channelId, originalContentData) => {
			cacheReads++;
			return {content: "译文", translatedContent: "译文", originalContent: "Original", signature: plugin.createReceivedTranslationSignature(message, channelId, originalContentData)};
		};
		let providerRequests = 0;
		plugin.translateText = () => {providerRequests++;};

		plugin.prepareAutoTranslationChannelSession("channel-1");
		plugin.prepareAutoTranslationChannelSession("channel-2");
		assert.equal(plugin.getReceivedDisplayView(messageId), null, "leaving the channel releases the recoverable display record");

		plugin.prepareAutoTranslationChannelSession("channel-1");
		const message = {id: messageId, channel_id: "channel-1", content: "Original", embeds: [], attachments: [], author: {id: "other-user"}};
		const stream = {content: message};
		plugin.captureSentOriginalMessage = () => {};
		plugin.checkMessage(stream, message, {id: "channel-1"}, {autoTranslateBoundaryId: "0"});

		assert.equal(cacheReads, 1);
		assert.equal(stream.content.content, "译文");
		assert.equal(plugin.getReceivedDisplayView(messageId).translated, true);
		assert.equal(providerRequests, 0);
	}
	finally {harness.restore();}
});

test("display settings changed after a store commit recompose the rendered content", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		const result = translatedResult();
		result.translation = Object.assign({}, result.translation, {translatedContent: "译文", originalContent: "Original"});
		await plugin.commitReceivedDisplayResult(result);

		plugin.settings.general.showOriginalMessage = true;
		plugin.settings.general.showOriginalDirectly = false;
		const view = plugin.getReceivedDisplayView("message-1");
		const stream = {content: {id: "message-1", channel_id: "channel-1", content: "Original", embeds: []}};
		plugin.applyReceivedDisplayViewToStream(stream, view);

		assert.match(stream.content.content, /译文/);
		assert.match(stream.content.content, /Original/);
	}
	finally {harness.restore();}
});
