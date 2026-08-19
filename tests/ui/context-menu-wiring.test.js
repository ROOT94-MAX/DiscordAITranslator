const test = require("node:test");
const assert = require("node:assert/strict");
const {createContextMenuWiring} = require("../../src/ui/context-menu-wiring");

// Contract tests for the context-menu wiring extracted from the legacy runtime in
// display-unification 5d. A minimal BDFDB fake captures what gets spliced into the
// menu; translation policy stays stubbed on the plugin.

function createHarness({translated = false, busy = false, selection = ""} = {}) {
	const calls = {translateMessage: [], translateText: [], languageActions: []};
	const BDFDB = {
		ContextMenuUtils: {
			findItem: returnvalue => [returnvalue.children, returnvalue.children.length - 1],
			createItem: (component, props) => ({component, props}),
			createItemId: (...parts) => parts.join("-"),
			close: () => {}
		},
		LibraryComponents: {MenuItems: {MenuItem: "MenuItem", MenuGroup: "MenuGroup", MenuIcon: "MenuIcon"}},
		ReactUtils: {createElement: (type, props) => ({type, props})},
		LibraryStores: {SelectedChannelStore: {getChannelId: () => "selected-channel"}},
		DOMUtils: {getParent: () => null},
		TooltipUtils: {create: () => {}},
		LanguageUtils: {LibraryStrings: {from: "from", to: "to"}, LibraryStringsFormat: () => "", LanguageStrings: {TEXT: "text"}},
		LibraryModules: {WindowUtils: {copy: () => {}}},
		NotificationUtils: {toast: () => {}},
		DiscordUtils: {openLink: () => {}},
		dotCN: {menuitem: ".menuitem"}
	};
	const plugin = {
		name: "Translator",
		labels: {
			context_messagetranslateoption: "Translate Message",
			context_messageuntranslateoption: "Untranslate Message",
			context_translator: "Search Translation",
			toast_translating_failed: "failed"
		},
		isMessageDisplayTranslated: () => translated,
		getCustomText: key => `custom:${key}`,
		handleMessageLanguageAction: (message, channel, reply) => calls.languageActions.push({message, channel, reply}),
		ensureLiveTranslationQueue: () => ({isBusyTranslating: () => busy}),
		getLanguageDisplayName: language => language && language.name,
		getGoogleTranslatePageURL: () => "https://example.invalid",
		translateMessage: (message, channel, options) => calls.translateMessage.push({message, channel, options}),
		translateText: (text, place, callback, forced, options) => calls.translateText.push({text, place, options})
	};
	const wiring = createContextMenuWiring({
		BDFDB,
		getPlugin: () => plugin,
		messageTypes: {RECEIVED: "received", SENT: "sent"},
		translateIcon: "icon-translate",
		translateIconUntranslate: "icon-untranslate"
	});
	global.document = {
		getSelection: () => ({toString: () => selection}),
		querySelector: () => null
	};
	return {wiring, calls, plugin};
}

function createMenuEvent() {
	return {instance: {props: {message: {id: "m1"}, channel: {id: "c1"}}}, returnvalue: {children: [{props: {id: "copy-text"}}]}};
}

test.afterEach(() => {delete global.document;});

test("the message menu gets the translate item whose action runs a manual translation", () => {
	const {wiring, calls} = createHarness();
	const event = createMenuEvent();
	wiring.onMessageContextMenu(event);
	const item = event.returnvalue.children.find(child => child.props && child.props.id == "Translator-translate-message");
	assert.ok(item, "the translate item is spliced into the menu");
	assert.equal(item.props.label, "Translate Message");
	item.props.action();
	assert.equal(calls.translateMessage.length, 1);
	assert.deepEqual(calls.translateMessage[0].options, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false});
});

test("a translated message offers untranslate instead", () => {
	const {wiring} = createHarness({translated: true});
	const event = createMenuEvent();
	wiring.onMessageContextMenu(event);
	const item = event.returnvalue.children.find(child => child.props && child.props.id == "Translator-untranslate-message");
	assert.ok(item, "the untranslate item is spliced into the menu");
	assert.equal(item.props.label, "Untranslate Message");
});

test("the language-detection actions land next to the translate item and delegate", () => {
	const {wiring, calls} = createHarness();
	const event = createMenuEvent();
	wiring.onMessageContextMenu(event);
	const detect = event.returnvalue.children.find(child => child.props && child.props.id == "Translator-detect-message-language");
	const reply = event.returnvalue.children.find(child => child.props && child.props.id == "Translator-reply-in-detected-language");
	assert.ok(detect && reply, "both language actions are present");
	detect.props.action();
	reply.props.action();
	assert.deepEqual(calls.languageActions.map(call => call.reply), [false, true]);
});

test("selected text adds the search-translation group and busy translating disables it", () => {
	const {wiring} = createHarness({selection: "hola", busy: true});
	const event = createMenuEvent();
	wiring.injectSearchItem(event, true);
	const group = event.returnvalue.children.find(child => child.component == "MenuGroup");
	assert.ok(group, "the search group is spliced in");
	assert.equal(group.props.children.props.disabled, true, "busy translating disables the item");
});

test("without a selection the menus stay untouched", () => {
	const {wiring} = createHarness({selection: ""});
	const event = createMenuEvent();
	const before = event.returnvalue.children.length;
	wiring.injectSearchItem(event, false);
	assert.equal(event.returnvalue.children.length, before);
});
