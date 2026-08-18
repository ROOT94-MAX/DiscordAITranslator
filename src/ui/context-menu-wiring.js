// Wires the plugin's context-menu entries: the translate/untranslate item on
// message menus, the language-detection actions, and the selection-translation
// item on message and text-area menus. Extracted from the legacy runtime in
// display-unification 5d; translation itself stays on the plugin, this module
// owns only the menu construction.
function createContextMenuWiring({BDFDB, getPlugin, messageTypes, translateIcon, translateIconUntranslate}) {
	function onMessageContextMenu(e) {
		const plugin = getPlugin();
		if (e.instance.props.message && e.instance.props.channel) {
			let translated = plugin.isMessageDisplayTranslated(e.instance.props.message, e.instance.props.channel.id);
			let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["copy-text", "pin", "unpin"]});
			if (index == -1) [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["edit", "add-reaction", "add-reaction-1", "quote"]});
			children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
				label: translated ? plugin.labels.context_messageuntranslateoption : plugin.labels.context_messagetranslateoption,
				id: BDFDB.ContextMenuUtils.createItemId(plugin.name, translated ? "untranslate-message" : "translate-message"),
				icon: _ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
					icon: translated ? translateIconUntranslate : translateIcon
				}),
				action: _ => plugin.translateMessage(e.instance.props.message, e.instance.props.channel, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false})
			}));
			injectMessageLanguageActions(children, index > -1 ? index + 1 : 0, e.instance.props.message, e.instance.props.channel);
			injectSearchItem(e, false, e.instance.props.channel.id);
		}
	}

	function onTextAreaContextMenu(e) {
		injectSearchItem(e, true);
	}

	function injectMessageLanguageActions(children, index, message, channel) {
		const plugin = getPlugin();
		if (!children || !message || !channel) return;
		const insertIndex = index > -1 ? index + 1 : 0;
		children.splice(insertIndex, 0,
			BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
				label: plugin.getCustomText("context_detect_message_language"),
				id: BDFDB.ContextMenuUtils.createItemId(plugin.name, "detect-message-language"),
				action: _ => plugin.handleMessageLanguageAction(message, channel, false)
			}),
			BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
				label: plugin.getCustomText("context_reply_in_detected_language"),
				id: BDFDB.ContextMenuUtils.createItemId(plugin.name, "reply-in-detected-language"),
				action: _ => plugin.handleMessageLanguageAction(message, channel, true)
			})
		);
	}

	function injectSearchItem(e, ownMessage, channelId = null) {
		const plugin = getPlugin();
		let text = document.getSelection().toString();
		if (text) {
			let translating, foundTranslation, foundInput, foundOutput, copied;
			let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["devmode-copy-id", "search-google"], group: true});
			children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuGroup, {
				children: BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
					id: BDFDB.ContextMenuUtils.createItemId(plugin.name, "search-translation"),
					icon: _ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
						icon: translateIcon
					}),
					disabled: plugin.ensureLiveTranslationQueue().isBusyTranslating(),
					label: plugin.labels.context_translator,
					persisting: true,
					action: event => {
						let item = BDFDB.DOMUtils.getParent(BDFDB.dotCN.menuitem, event.target);
						if (item) {
							let createTooltip = _ => {
								BDFDB.TooltipUtils.create(item, !foundTranslation ? plugin.labels.toast_translating_failed : [
									`${BDFDB.LanguageUtils.LibraryStrings.from} ${plugin.getLanguageDisplayName(foundInput)}:`,
									text,
									`${BDFDB.LanguageUtils.LibraryStrings.to} ${plugin.getLanguageDisplayName(foundOutput)}:`,
									foundTranslation
								].map(n => BDFDB.ReactUtils.createElement("div", {children: n})), {
									type: "right",
									color: foundTranslation ? "primary" : "red",
									className: "googletranslate-tooltip"
								});
							};
							if (foundTranslation && foundInput && foundOutput) {
								if (document.querySelector(".googletranslate-tooltip")) {
									if (!copied) {
										copied = true;
										BDFDB.LibraryModules.WindowUtils.copy(foundTranslation);
										BDFDB.NotificationUtils.toast(BDFDB.LanguageUtils.LibraryStringsFormat("clipboard_success", BDFDB.LanguageUtils.LanguageStrings.TEXT), {type: "success"});
									}
									else {
										BDFDB.ContextMenuUtils.close(e.instance);
										BDFDB.DiscordUtils.openLink(plugin.getGoogleTranslatePageURL(foundInput.id, foundOutput.id, text));
									}
								}
								else createTooltip();
							}
							else if (!translating) {
								translating = true;
								plugin.translateText(text, ownMessage ? messageTypes.SENT : messageTypes.RECEIVED, (translation, input, output) => {
									if (translation) {
										foundTranslation = translation, foundInput = input, foundOutput = output;
										createTooltip();
									}
									else createTooltip();
								}, null, {channelId: channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId()});
							}
						}
					}
				})
			}));
		}
	}

	return Object.freeze({onMessageContextMenu, onTextAreaContextMenu, injectMessageLanguageActions, injectSearchItem});
}

module.exports = {createContextMenuWiring};
