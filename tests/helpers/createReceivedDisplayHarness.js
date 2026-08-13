const {createPluginInstance} = require("./createPluginInstance");

function createHarness({confirmDirectly = true, confirmAfterFallback = true, mountedMessageIds = null} = {}) {
	const originalDocument = global.document;
	const originalRequestAnimationFrame = global.requestAnimationFrame;
	const calls = {forceUpdate: 0, forceUpdateBatches: [], rerenderAll: 0};
	const mounted = mountedMessageIds && new Set(mountedMessageIds.map(String));
	const confirmed = new Set();
	const messageElements = new Map();
	function getMessageElement(messageId) {
		const id = String(messageId);
		if (mounted && !mounted.has(id)) return null;
		if (!messageElements.has(id)) messageElements.set(id, {
			messageId: id,
			querySelector: () => confirmed.has(id) ? {} : null
		});
		return messageElements.get(id);
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
			// Must match the adapter selectors ([id="chat-messages-<id>"], ...). The old
		// "message-" needle never did, so the element read as unmounted and every
		// refresh in this harness leaned on the full-list fallback - which stopped
		// matching reality once virtualised rows no longer trigger that fallback.
			if (typeof selector == "string" && selector.includes("chat-messages")) {
				const match = selector.match(/chat-messages-([^"\]]+)/);
				return match ? getMessageElement(match[1]) : null;
			}
			return null;
		},
		getElementById: () => null
	};
	global.requestAnimationFrame = callback => callback();
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			dotCN: {messagesscroller: ".messages-scroller"},
			disCN: {messagetimestamp: "timestamp", messagetimestampinline: "inline", _translatortranslated: "translated", messageedited: "edited"},
			DOMUtils: {formatClassName: (...names) => names.filter(Boolean).join(" ")},
			LanguageUtils: {getName: language => language && language.name || ""},
			LibraryComponents: {TooltipContainer: "TooltipContainer"},
			ReactUtils: {
				createElement: (type, props) => ({type, key: props && props.key, props: props || {}}),
				findOwner: element => element ? {props: {message: {id: element.messageId}, channelStream: []}} : null,
				forceUpdate: (...owners) => {
					calls.forceUpdate++;
					const messageIds = owners.map(owner => owner && owner.props && owner.props.message && String(owner.props.message.id)).filter(Boolean);
					calls.forceUpdateBatches.push(messageIds);
					if (confirmDirectly) for (const messageId of messageIds) confirmed.add(messageId);
				}
			},
			MessageUtils: {
				rerenderAll: () => {
					calls.rerenderAll++;
					if (confirmAfterFallback) for (const messageId of messageElements.keys()) confirmed.add(messageId);
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
