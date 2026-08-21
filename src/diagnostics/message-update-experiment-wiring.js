const {createMessageUpdateExperiment} = require("./message-update-experiment");
const {createSecondDebugEvidenceSink} = require("./second-debug-probe");
const {resolveStoreDispatcher} = require("../discord/store-dispatcher");

const MESSAGE_ROOT_SELECTOR = '[id^="chat-messages-"], [data-list-item-id*="chat-messages"]';
const COMPOSER_INPUT_SELECTOR = 'form [contenteditable="true"], form textarea, form input, form [role="textbox"]';

function createPluginMessageUpdateExperiment({
	BDFDB,
	BdApi,
	getPlugin = () => null,
	secondDebugProbe = null,
	getDocument = () => typeof document == "undefined" ? null : document,
	resolveDispatcher = () => resolveStoreDispatcher(BDFDB, ["dispatch"]),
	createExperiment = createMessageUpdateExperiment,
	createEvidenceSink = createSecondDebugEvidenceSink
} = {}) {
	function getElementAttribute(element, name) {
		if (!element) return null;
		try {
			const value = element.getAttribute ? element.getAttribute(name) : element[name];
			return value == null ? null : String(value);
		}
		catch (error) {return null;}
	}

	function representsMessageId(element, messageId) {
		const target = String(messageId);
		for (const value of [getElementAttribute(element, "data-list-item-id"), getElementAttribute(element, "aria-labelledby"), element && element.id].filter(Boolean)) {
			let index = String(value).indexOf(target);
			while (index !== -1) {
				const before = index > 0 ? String(value).charAt(index - 1) : "";
				if (!before || /[^0-9A-Za-z]/.test(before)) return true;
				index = String(value).indexOf(target, index + 1);
			}
		}
		return false;
	}

	function findMessageElement(documentRef, messageId) {
		if (!documentRef || !messageId) return null;
		const escaped = String(messageId).replace(/(["\\])/g, "\\$1");
		for (const selector of [`[id="chat-messages-${escaped}"]`, `[data-list-item-id*="${escaped}"]`, `[aria-labelledby*="${escaped}"]`]) {
			let candidates = [];
			try {candidates = typeof documentRef.querySelectorAll == "function" ? Array.from(documentRef.querySelectorAll(selector)) : [documentRef.querySelector(selector)].filter(Boolean);}
			catch (error) {candidates = [];}
			for (const candidate of candidates) {
				let root = candidate;
				try {root = candidate.closest && candidate.closest(MESSAGE_ROOT_SELECTOR) || candidate;}
				catch (error) {}
				if (representsMessageId(root, messageId)) return root;
			}
		}
		return null;
	}

	function extractMessageId(element) {
		for (const value of [getElementAttribute(element, "data-list-item-id"), getElementAttribute(element, "aria-labelledby"), element && element.id].filter(Boolean)) {
			const match = String(value).match(/(\d{15,25})(?!.*\d)/);
			if (match) return match[1];
		}
		return null;
	}

	function findComposerElement(documentRef) {
		if (!documentRef) return null;
		let chatContent = null;
		try {chatContent = BDFDB && BDFDB.dotCN && BDFDB.dotCN.chatcontent ? documentRef.querySelector(BDFDB.dotCN.chatcontent) : null;}
		catch (error) {chatContent = null;}
		const activeElement = documentRef.activeElement;
		if (activeElement && activeElement !== documentRef.body) {
			try {
				const isTextInput = activeElement.tagName == "TEXTAREA" || activeElement.tagName == "INPUT" || activeElement.isContentEditable || activeElement.getAttribute && activeElement.getAttribute("role") == "textbox";
				if (isTextInput && (!chatContent || !chatContent.contains || chatContent.contains(activeElement)) && activeElement.closest && activeElement.closest("form")) return activeElement;
			}
			catch (error) {}
		}
		try {return (chatContent || documentRef).querySelector(COMPOSER_INPUT_SELECTOR);}
		catch (error) {return null;}
	}

	function getUiSnapshot(_channelId, messageId) {
		const documentRef = getDocument();
		let scrollerElement = null;
		try {scrollerElement = documentRef && BDFDB && BDFDB.dotCN && BDFDB.dotCN.messagesscroller ? documentRef.querySelector(BDFDB.dotCN.messagesscroller) : null;}
		catch (error) {scrollerElement = null;}
		return {
			composerElement: findComposerElement(documentRef),
			scrollerElement,
			messageElement: findMessageElement(documentRef, messageId),
			activeElement: documentRef && documentRef.activeElement || null
		};
	}

	function listMountedCandidateMessages(channelId) {
		const documentRef = getDocument();
		let scroller = null;
		try {scroller = documentRef && BDFDB && BDFDB.dotCN && BDFDB.dotCN.messagesscroller ? documentRef.querySelector(BDFDB.dotCN.messagesscroller) : null;}
		catch (error) {scroller = null;}
		if (!scroller || typeof scroller.querySelectorAll != "function") return [];
		let rows = [];
		try {rows = Array.from(scroller.querySelectorAll(MESSAGE_ROOT_SELECTOR));}
		catch (error) {rows = [];}
		const seen = new Set();
		return rows.map(extractMessageId).filter(messageId => messageId && !seen.has(messageId) && seen.add(messageId)).map(messageId => ({messageId, channelId: String(channelId), source: "mounted"}));
	}

	function listCandidateMessages() {
		const channelId = (() => {try {return BDFDB.LibraryStores.SelectedChannelStore.getChannelId();} catch (error) {return null;}})();
		if (!channelId) return [];
		try {
			const plugin = getPlugin();
			const translated = plugin.ensureReceivedDisplayRuntime().listTranslated().filter(record => record && String(record.channelId) == String(channelId)).map(record => ({messageId: String(record.messageId), channelId: String(record.channelId), source: "translated"}));
			if (translated.length) return translated;
		}
		catch (error) {}
		return listMountedCandidateMessages(channelId);
	}

	return createExperiment({
		resolveDispatcher,
		getSelectedChannelId: () => {try {return BDFDB.LibraryStores.SelectedChannelStore.getChannelId();} catch (error) {return null;}},
		getStoreMessage: (channelId, messageId) => {try {return BDFDB.LibraryStores.MessageStore.getMessage(channelId, messageId) || null;} catch (error) {return null;}},
		getGuildId: channelId => {try {const channel = BDFDB.LibraryStores.ChannelStore.getChannel(channelId); return channel && channel.guild_id || null;} catch (error) {return null;}},
		listCandidateMessages,
		isViewTranslated: messageId => {try {const plugin = getPlugin(), view = plugin && plugin.getReceivedDisplayRuntimeView(String(messageId)); return !!(view && view.translated);} catch (error) {return false;}},
		getMessageRenderCount: messageId => secondDebugProbe ? secondDebugProbe.getMessageRenderCount(messageId) : 0,
		getParentRenderCount: () => secondDebugProbe && typeof secondDebugProbe.getParentRenderCount == "function" ? secondDebugProbe.getParentRenderCount() : 0,
		getUiSnapshot,
		log: line => console.info(line),
		setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
		sink: createEvidenceSink({fs: require("fs"), path: require("path"), pluginsFolder: BdApi && BdApi.Plugins && BdApi.Plugins.folder, fileName: "translator-message-update-experiment.json"}),
		maxAttempts: 120
	});
}

module.exports = {COMPOSER_INPUT_SELECTOR, MESSAGE_ROOT_SELECTOR, createPluginMessageUpdateExperiment};
