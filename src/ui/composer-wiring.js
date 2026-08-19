// Wires the plugin into Discord's channel text area: the onSubmit interception that
// translates outgoing messages (prefix-directed or channel-automatic) and the
// translate button injected into the composer's button row. Extracted from the
// legacy runtime in display-unification slice 3. Translation policy (what to
// translate, how to build the sent value, request identity) stays on the plugin;
// this module owns only the patch-boundary wiring.
function createComposerWiring({BDFDB, getPlugin, messageTypes, TranslateButtonComponent}) {
	function processChannelTextAreaContainer(e) {
		const plugin = getPlugin();
		if (e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.NORMAL && e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.SIDEBAR) return;
		BDFDB.PatchUtils.patch(plugin, e.instance.props, "onSubmit", {instead: e2 => {
			if (e2.methodArguments[0].value) {
				const text = e2.methodArguments[0].value;
				// Check for translation prefixes
				const prefixMap = {};
				const prefixData = plugin.settings.prefixes && plugin.settings.prefixes.translationPrefixData || [];
				for (const entry of prefixData) {
					prefixMap[entry.prefix] = entry.language;
				}
				let foundPrefix = null;
				let targetLanguage = null;
				// Check for prefixes more efficiently
				for (const prefix in prefixMap) {
					if (text.trim().startsWith(prefix)) {
						foundPrefix = prefix;
						targetLanguage = prefixMap[prefix];
						break;
					}
				}
				if (foundPrefix) {
					e2.stopOriginalMethodCall();
					// Remove the prefix from the message
					const cleanText = text.trim().substring(foundPrefix.length).trim();
					plugin.shouldAutoTranslateSentMessage(cleanText, e.instance.props.channel.id, shouldTranslate => {
						if (!shouldTranslate) return e2.originalMethod(Object.assign({}, e2.methodArguments[0], {value: cleanText}));
						// Translate with the specific target language
						plugin.translateText(cleanText, messageTypes.SENT, (translation, input, output) => {
							// Override the output language with the one from the prefix
							output = {id: targetLanguage, name: (plugin.ensureSettingsStore().getLanguage(targetLanguage) || {}).name || targetLanguage};
							translation = plugin.buildSentTranslationMessageValue(cleanText, translation, input, output);
							Promise.resolve(e2.originalMethod(Object.assign({}, e2.methodArguments[0], {value: translation}))).then(_ => {
								plugin.trackPendingSentOriginal(e.instance.props.channel.id, cleanText, translation);
							});
						}, targetLanguage, {channelId: e.instance.props.channel.id});
					}, targetLanguage);
					return Promise.resolve({
						shouldClear: true,
						shouldRefocus: true
					});
				}
				else if (plugin.isTranslationEnabled(e.instance.props.channel.id)) {
					e2.stopOriginalMethodCall();
					const originalValue = e2.methodArguments[0].value;
					const channelId = e.instance.props.channel.id;
					const sentRequest = plugin.createSentAutomaticTranslationRequest(channelId, originalValue);
					const submit = nextValue => e2.originalMethod(Object.assign({}, e2.methodArguments[0], {value: nextValue}));
					plugin.shouldAutoTranslateSentMessage(originalValue, e.instance.props.channel.id, shouldTranslate => {
						if (!shouldTranslate || !plugin.isSentAutomaticTranslationRequestCurrent(sentRequest)) return plugin.completeSentAutomaticTranslationRequest(sentRequest, originalValue, submit);
						plugin.translateText(originalValue, messageTypes.SENT, (translation, input, output) => {
							translation = plugin.buildSentTranslationMessageValue(originalValue, translation, input, output);
							plugin.completeSentAutomaticTranslationRequest(sentRequest, translation, submit);
						}, null, {channelId});
					});
					return Promise.resolve({
						shouldClear: true,
						shouldRefocus: true
					});
				}
			}
			return e2.callOriginalMethodAfterwards();
		}}, {noCache: true});
	}

	function processChannelTextAreaButtons(e) {
		const plugin = getPlugin();
		if (e.instance.props.disabled || ![BDFDB.DiscordConstants.ChannelTextAreaTypes.NORMAL, BDFDB.DiscordConstants.ChannelTextAreaTypes.SIDEBAR, "normal", "sidebar"].includes(typeof e.instance.props.type == "string" ? e.instance.props.type : e.instance.props.type && e.instance.props.type.analyticsName)) return;
		if (!e.returnvalue || !e.returnvalue.props) return;
		let children = [].concat(e.returnvalue.props.children || []).filter(child => {
			if (!child) return false;
			if (child.key == `${plugin.name}-translate-textarea-button`) return false;
			const className = child.props && typeof child.props.className == "string" ? child.props.className : "";
			return !className.includes("_translatortranslatebutton");
		});
		children.unshift(BDFDB.ReactUtils.createElement(TranslateButtonComponent, {
			key: `${plugin.name}-translate-textarea-button`,
			guildId: e.instance.props.channel.guild_id ? e.instance.props.channel.guild_id : "@me",
			channelId: e.instance.props.channel.id
		}));
		e.returnvalue.props.children = children;
	}

	return Object.freeze({processChannelTextAreaContainer, processChannelTextAreaButtons});
}

module.exports = {createComposerWiring};
