const {createPluginInstance} = require("./createPluginInstance");

// The render adapter refreshes ordinary rows through the Store dispatcher's synthetic
// MESSAGE_UPDATE and confirms mounted rows by their data-translator-revision marker.
// Special host and lifecycle paths retain MessageUtils.rerenderAll in their own tests.
function createHarness({confirmAfterFallback = true, mountedMessageIds = null} = {}) {
	const originalDocument = global.document;
	const originalRequestAnimationFrame = global.requestAnimationFrame;
	const calls = {rerenderAll: 0, messageUpdates: 0, messageUpdateIds: []};
	const mounted = mountedMessageIds && new Set(mountedMessageIds.map(String));
	const paintedRevisions = new Map();
	const requestedRevisions = new Map();
	const paintedPreviewRevisions = new Map();
	const requestedPreviewRevisions = new Map();
	const messageElements = new Map();
	function getMessageElement(messageId) {
		const id = String(messageId);
		if (mounted && !mounted.has(id)) return null;
		if (!messageElements.has(id)) messageElements.set(id, {
			messageId: id,
			id: `chat-messages-${id}`,
			"data-list-item-id": `chat-messages___chat-messages-${id}`,
			querySelector(selector) {
				const match = typeof selector == "string" ? selector.match(/data-translator-revision="(\d+)"/) : null;
				if (match) {
					requestedRevisions.set(id, Number(match[1]));
					return paintedRevisions.get(id) === Number(match[1]) ? {} : null;
				}
				const previewMatch = typeof selector == "string" ? selector.match(/data-translator-preview-revision="(\d+)"/) : null;
				if (!previewMatch) return null;
				requestedPreviewRevisions.set(id, Number(previewMatch[1]));
				return paintedPreviewRevisions.get(id) === Number(previewMatch[1]) ? {} : null;
			}
		});
		return messageElements.get(id);
	}
	// The adapter's lookup ladder probes suffix/containment selectors whose quoted
	// values are not always the bare message id, so the fake document normalises any
	// quoted attribute value back to the id it addresses.
	function extractMessageIdFromSelector(selector) {
		if (typeof selector != "string" || selector.charAt(0) != "[") return null;
		const quoted = selector.match(/"((?:\\.|[^"\\])*)"/);
		if (!quoted) return null;
		const value = quoted[1].replace(/\\(["\\])/g, "$1");
		return value.replace(/^chat-messages___chat-messages-/, "").replace(/^chat-messages-/, "").replace(/^[-_]+/, "") || null;
	}
	const scroller = {
		scrollTop: 100,
		scrollHeight: 1000,
		clientHeight: 400,
		addEventListener: () => {},
		removeEventListener: () => {},
		getBoundingClientRect: () => ({top: 0, bottom: 400, height: 400})
	};
	global.document = {
		querySelector(selector) {
			if (selector === ".messages-scroller") return scroller;
			const id = extractMessageIdFromSelector(selector);
			return id && getMessageElement(id) || null;
		},
		querySelectorAll(selector) {
			if (selector === ".messages-scroller") return [];
			const id = extractMessageIdFromSelector(selector);
			const element = id && getMessageElement(id);
			return element ? [element] : [];
		},
		getElementById: () => null
	};
	global.requestAnimationFrame = callback => callback();
	const dispatcher = {
		dispatch(payload) {
			if (!payload || payload.type !== "MESSAGE_UPDATE" || !payload.__translatorSynthetic || !payload.message) return;
			const id = String(payload.message.id);
			calls.messageUpdates++;
			calls.messageUpdateIds.push(id);
			if (confirmAfterFallback && getMessageElement(id) && requestedRevisions.has(id)) paintedRevisions.set(id, requestedRevisions.get(id));
			if (confirmAfterFallback && getMessageElement(id) && requestedPreviewRevisions.has(id)) paintedPreviewRevisions.set(id, requestedPreviewRevisions.get(id));
		}
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			dotCN: {messagesscroller: ".messages-scroller"},
			LibraryStores: {
				SelectedChannelStore: {getChannelId: () => "channel-1"},
				MessageStore: {_dispatcher: dispatcher, getMessage: (channelId, messageId) => ({id: String(messageId), channel_id: String(channelId), content: "source", embeds: [], attachments: []})},
				ChannelStore: {getChannel: () => ({guild_id: "guild-1"})}
			},
			disCN: {messagetimestamp: "timestamp", messagetimestampinline: "inline", _translatortranslated: "translated", messageedited: "edited"},
			DOMUtils: {formatClassName: (...names) => names.filter(Boolean).join(" ")},
			LanguageUtils: {getName: language => language && language.name || ""},
			LibraryComponents: {TooltipContainer: "TooltipContainer"},
			ReactUtils: {
				createElement: (type, props) => ({type, key: props && props.key, props: props || {}}),
				findOwner: () => null
			},
			MessageUtils: {
				rerenderAll: () => {
					calls.rerenderAll++;
					if (confirmAfterFallback) for (const [id, revision] of requestedRevisions) paintedRevisions.set(id, revision);
				}
			}
		}
	});
	plugin.settings.general.highlightTranslatedMessages = true;
	plugin.labels.translated_watermark = "Translated";
	plugin.getTranslatedTextColor = () => "#12a594";
	plugin.shouldProtectWrappedTextForPlace = () => false;
	return {
		plugin,
		calls,
		scroller,
		restore() {
			global.document = originalDocument;
			global.requestAnimationFrame = originalRequestAnimationFrame;
		}
	};
}

function sourceSnapshot() {
	return {messageId: "message-1", channelId: "channel-1", generation: 1, sourceSignature: "signature-1", source: {content: "Original", embeds: []}};
}

function translatedResult() {
	return {
		messageId: "message-1",
		channelId: "channel-1",
		generation: 1,
		sourceSignature: "signature-1",
		origin: "automatic",
		status: "translated",
		translation: {content: "译文", input: {id: "en"}, output: {id: "zh-CN"}}
	};
}

module.exports = {createHarness, sourceSnapshot, translatedResult};
