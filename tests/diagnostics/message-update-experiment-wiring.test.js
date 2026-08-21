const test = require("node:test");
const assert = require("node:assert/strict");
const {COMPOSER_INPUT_SELECTOR, createPluginMessageUpdateExperiment} = require("../../src/diagnostics/message-update-experiment-wiring");

test("the debug wiring resolves one mounted row, the Composer and the scroller", () => {
	const messageId = "123456789012345";
	const composer = {
		tagName: "DIV",
		isContentEditable: true,
		textContent: "private draft",
		getAttribute: name => name == "role" ? "textbox" : null,
		closest: selector => selector == "form" ? {} : null
	};
	const scroller = {scrollTop: 240, scrollHeight: 1800, clientHeight: 600};
	const message = {
		id: `chat-messages-${messageId}`,
		getAttribute: name => name == "data-list-item-id" ? `chat-messages___chat-messages-${messageId}` : null,
		closest: () => message
	};
	const chatContent = {contains: element => element === composer, querySelector: selector => selector == COMPOSER_INPUT_SELECTOR ? composer : null};
	const documentRef = {
		activeElement: composer,
		body: {},
		querySelector: selector => selector == ".chat-content" ? chatContent : selector == ".messages-scroller" ? scroller : null,
		querySelectorAll: selector => selector.includes(messageId) ? [message] : []
	};
	scroller.querySelectorAll = selector => selector.includes("chat-messages") ? [message] : [];
	const storeRecord = {id: messageId, channel_id: "c1", content: "source"};
	const dispatcher = {dispatch() {}};
	const plugin = {
		ensureReceivedDisplayRuntime: () => ({listTranslated: () => []}),
		getReceivedDisplayRuntimeView: () => ({translated: true})
	};
	let captured = null;
	const experiment = {start() {}};
	const result = createPluginMessageUpdateExperiment({
		BDFDB: {
			dotCN: {chatcontent: ".chat-content", messagesscroller: ".messages-scroller"},
			LibraryStores: {
				SelectedChannelStore: {getChannelId: () => "c1"},
				MessageStore: {getMessage: () => storeRecord},
				ChannelStore: {getChannel: () => ({guild_id: "g1"})}
			},
			TimeUtils: {timeout: () => 1, clear: () => {}}
		},
		BdApi: {Plugins: {folder: "C:\\fixture\\plugins"}},
		getPlugin: () => plugin,
		secondDebugProbe: {getMessageRenderCount: candidateId => candidateId == messageId ? 9 : 0},
		getDocument: () => documentRef,
		resolveDispatcher: () => dispatcher,
		createEvidenceSink: () => () => {},
		createExperiment: dependencies => {captured = dependencies; return experiment;}
	});

	assert.equal(result, experiment);
	assert.equal(captured.resolveDispatcher(), dispatcher);
	assert.equal(captured.getSelectedChannelId(), "c1");
	assert.equal(captured.getStoreMessage("c1", "m1"), storeRecord);
	assert.equal(captured.getGuildId("c1"), "g1");
	assert.deepEqual(captured.listCandidateMessages(), [{messageId, channelId: "c1", source: "mounted"}]);
	assert.equal(captured.isViewTranslated(messageId), true);
	assert.equal(captured.getMessageRenderCount(messageId), 9);
	assert.equal(captured.getParentRenderCount(), 0);
	assert.deepEqual(captured.getUiSnapshot("c1", messageId), {
		composerElement: composer,
		scrollerElement: scroller,
		messageElement: message,
		activeElement: composer
	});
});
