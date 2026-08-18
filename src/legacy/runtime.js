module.exports = (_ => {
	const changeLog = {
		
	};

	// Version source: the BetterDiscord metadata header `@version`.
	// Rule: SemVer only: MAJOR.MINOR.PATCH, for example `0.0.18`.
	// Do not add a leading `v` here; BetterDiscord may render its own UI prefix.
	// Keep the value as a string, never parse it as a decimal number.
	const normalizeSemverVersion = version => {
		const raw = String(version == null ? "" : version).trim();
		const withoutPrefix = raw.replace(/^(?:v\s*)+/i, "");
		const match = withoutPrefix.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
		return match ? `${match[1]}.${match[2]}.${match[3]}` : withoutPrefix;
	};
	
	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		constructor (meta) {for (let key in meta) this[key] = meta[key];}
		getName () {return this.name;}
		getAuthor () {return this.author;}
		getVersion () {return normalizeSemverVersion(this.version);}
		getDescription () {return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. \n\n${this.description}`;}
		downloadLibrary () {
			BdApi.Net.fetch("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js").then(r => {
				if (!r || r.status != 200) throw new Error();
				else return r.text();
			}).then(b => {
				if (!b) throw new Error();
				else return require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => BdApi.UI.showToast("Finished downloading BDFDB Library", {type: "success"}));
			}).catch(error => {
				BdApi.UI.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
			});
		}
		load () {
			if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
			if (!window.BDFDB_Global.downloadModal) {
				window.BDFDB_Global.downloadModal = true;
				BdApi.UI.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
					confirmText: "Download Now",
					cancelText: "Cancel",
					onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
					onConfirm: _ => {
						delete window.BDFDB_Global.downloadModal;
						this.downloadLibrary();
					}
				});
			}
			if (!window.BDFDB_Global.pluginQueue.includes(this.name)) window.BDFDB_Global.pluginQueue.push(this.name);
		}
		start () {this.load();}
		stop () {}
		getSettingsPanel () {
			let template = document.createElement("template");
			template.innerHTML = `<div style="color: var(--text-strong); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
			template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
			return template.content.firstElementChild;
		}
	} : (([Plugin, BDFDB]) => {
		// Extracted modules. Declared before any state so module-backed stores can be
		// constructed in the state block below.
		const {createDisplayRuntime} = require("../display/display-runtime");
		const {createTranslationDisplayLogic} = require("../display/translation-display-logic");
		const {createDisplayRepaintScheduler} = require("../display/repaint-scheduler");
		const {createHistoricalDisplayTracker} = require("../display/historical-display-tracker");
		const {createTranslatorStyles} = require("../ui/styles");
		const {renderSettingsPanel} = require("../ui/settings-panel");
		const {createTranslateComponents, translateIcon, translateIconUntranslate} = require("../ui/translate-components");
		const {createComposerWiring} = require("../ui/composer-wiring");
		const {createTranslationPipeline} = require("../orchestrator/translation-pipeline");
		const loadedStatusPosition = require("../ui/loaded-status-position");
		const {createLoadedStatusCapsuleController} = require("../ui/loaded-status-capsule");
		const {createChannelTitleStore} = require("../channel-title/channel-title-store");
		const {createMessageViewportStore} = require("../viewport/message-viewport-store");
		const {createLoadedTranslationStatusStore} = require("../status/loaded-translation-status-store");
		const {createTranslationCacheStore} = require("../cache/translation-cache-store");
		const {createProviderClient, translationEngines, enginePortals} = require("../providers/provider-client");
		const {createSentTranslationStore} = require("../sent/sent-translation-store");
		const {createLiveTranslationQueue} = require("../orchestrator/live-translation-queue");
		const {resumeHistoricalHandoff} = require("../orchestrator/historical-handoff-runtime");
		const {createHistoricalJobRegistry} = require("../orchestrator/historical-job-registry");
		const channelToggleOperations = require("../orchestrator/channel-toggle-operations").createChannelToggleOperations();
		const {HistoricalTranslationJob, HISTORICAL_TERMINAL_ITEM_STATES, HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX} = require("../orchestrator/historical-translation-job");
		const {runChunkedHistoricalBatch} = require("../orchestrator/historical-provider-chunking");
		const {createProtectionLogic, TRANSLATION_PROTECTION_SIGNATURE_VERSION} = require("../protection/protection-logic");
		const {parseStoredEmbedTranslations} = require("../received/embed-translation-parser");
		const {
			foreignLanguageDecisionRuntime,
			receivedMessageFilterRuntime,
			createReceivedTranslationRuntime
		} = require("../received/received-translation-runtime");
		const {createPluginHistoricalSourceRuntime} = require("../received/historical-source-wiring");
		const {createMessageDeletionLifecycle} = require("../lifecycle/message-deletion-lifecycle");
		const {
			LOADED_AUTO_TRANSLATE_RANGE_MODES,
			loadedAutoTranslatePolicy,
			aiDecisionPolicy,
			sentTranslationPolicy,
			languageHeuristicsRuntime,
			textSimilarityRuntime,
			createLanguageHeuristics
		} = require("../language/language-heuristics");
		const {languagePolicy, receivedSettingsPolicy, languageDetectionRuntime} = createLanguageHeuristics({BDFDB});
		const {
			createSettingsStore,
			createEmptyChannelEnablementState,
			normalizeStoredChannelEnablementState,
			migrateLegacyChannelEnablementState,
			loadChannelEnablementState,
			getChannelEnablementStateValue,
			channelEnablementStatesEqual
		} = require("../settings/settings-store");
		const {getLabelsForUiLanguage} = require("../i18n/labels");
		const {getCustomTextValue} = require("../i18n/text");
		var _this;
		const translationProtectionSignatureVersion = TRANSLATION_PROTECTION_SIGNATURE_VERSION;
		const {TranslateButtonComponent} = createTranslateComponents({
			BDFDB,
			// _this is assigned in onLoad(), long after this line runs, so the components
			// resolve the plugin per call instead of capturing it now.
			getPlugin: () => _this
		});
		const brailleConverter = {
			"0":"⠴", "1":"⠂", "2":"⠆", "3":"⠒", "4":"⠲", "5":"⠢", "6":"⠖", "7":"⠶", "8":"⠦", "9":"⠔", "!":"⠮", "\"":"⠐", "#":"⠼", "$":"⠫", "%":"⠩", "&":"⠯", "'":"⠄", "(":"⠷", ")":"⠾", "*":"⠡", "+":"⠬", ",":"⠠", "-":"⠤", ".":"⠨", "/":"⠌", ":":"⠱", ";":"⠰", "<":"⠣", "=":"⠿", ">":"⠜", "?":"⠹", "@":"⠈", "a":"⠁", "b":"⠃", "c":"⠉", "d":"⠙", "e":"⠑", "f":"⠋", "g":"⠛", "h":"⠓", "i":"⠊", "j":"⠚", "k":"⠅", "l":"⠇", "m":"⠍", "n":"⠝", "o":"⠕", "p":"⠏", "q":"⠟", "r":"⠗", "s":"⠎", "t":"⠞", "u":"⠥", "v":"⠧", "w":"⠺", "x":"⠭", "y":"⠽", "z":"⠵", "[":"⠪", "\\":"⠳", "]":"⠻", "^":"⠘", "⠁":"a", "⠂":"1", "⠃":"b", "⠄":"'", "⠅":"k", "⠆":"2", "⠇":"l", "⠈":"@", "⠉":"c", "⠊":"i", "⠋":"f", "⠌":"/", "⠍":"m", "⠎":"s", "⠏":"p", "⠐":"\"", "⠑":"e", "⠒":"3", "⠓":"h", "⠔":"9", "⠕":"o", "⠖":"6", "⠗":"r", "⠘":"^", "⠙":"d", "⠚":"j", "⠛":"g", "⠜":">", "⠝":"n", "⠞":"t", "⠟":"q", "⠠":", ", "⠡":"*", "⠢":"5", "⠣":"<", "⠤":"-", "⠥":"u", "⠦":"8", "⠧":"v", "⠨":".", "⠩":"%", "⠪":"[", "⠫":"$", "⠬":"+", "⠭":"x", "⠮":"!", "⠯":"&", "⠰":";", "⠱":":", "⠲":"4", "⠳":"\\", "⠴":"0", "⠵":"z", "⠶":"7", "⠷":"(", "⠸":"_", "⠹":"?", "⠺":"w", "⠻":"]", "⠼":"#", "⠽":"y", "⠾":")", "⠿":"=", "_":"⠸"
		};

		const morseConverter = {
			"0":"−−−−−", "1":"·−−−−", "2":"··−−−", "3":"···−−", "4":"····−", "5":"·····", "6":"−····", "7":"−−···", "8":"−−−··", "9":"−−−−·", "!":"−·−·−−", "\"":"·−··−·", "$":"···−··−", "&":"·−···", "'":"·−−−−·", "(":"−·−−·", ")":"−·−−·−", "+":"·−·−·", ",":"−−··−−", "-":"−····−", ".":"·−·−·−", "/":"−··−·", ":":"−−−···", ";":"−·−·−·", "=":"−···−", "?":"··−−··", "@":"·−−·−·", "a":"·−", "b":"−···", "c":"−·−·", "d":"−··", "e":"·", "f":"··−·", "g":"−−·", "h":"····", "i":"··", "j":"·−−−", "k":"−·−", "l":"·−··", "m":"−−", "n":"−·", "o":"−−−", "p":"·−−·", "q":"−−·−", "r":"·−·", "s":"···", "t":"−", "u":"··−", "v":"···−", "w":"·−−", "x":"−··−", "y":"−·−−", "z":"−−··", "·":"e", "··":"i", "···":"s", "····":"h", "·····":"5", "····−":"4", "···−":"v", "···−··−":"$", "···−−":"3", "··−":"u", "··−·":"f", "··−−··":"?", "··−−·−":"_", "··−−−":"2", "·−":"a", "·−·":"r", "·−··":"l", "·−···":"&", "·−··−·":"\"", "·−·−·":"+", "·−·−·−":".", "·−−":"w", "·−−·":"p", "·−−·−·":"@", "·−−−":"j", "·−−−−":"1", "·−−−−·":"'", "−":"t", "−·":"n", "−··":"d", "−···":"b", "−····":"6", "−····−":"-", "−···−":"=", "−··−":"x", "−··−·":"/", "−·−":"k", "−·−·":"c", "−·−·−·":";", "−·−·−−":"!", "−·−−":"y", "−·−−·":"(", "−·−−·−":")", "−−":"m", "−−·":"g", "−−··":"z", "−−···":"7", "−−··−−":",", "−−·−":"q", "−−−":"o", "−−−··":"8", "−−−···":":", "−−−−·":"9", "−−−−−":"0", "_":"··−−·−"
		};
		const channelTitleStore = createChannelTitleStore();
		const loadedTranslationStatusStore = createLoadedTranslationStatusStore({isChineseUiLanguage: () => _this && _this.isChineseUiLanguage()});
		const historicalDisplayTracker = createHistoricalDisplayTracker({isStatusForChannel: channelId => loadedTranslationStatusStore.isForChannel(channelId), getRevision: (_channelId, messageId) => {const view = _this && _this.getReceivedDisplayRuntimeView(messageId); return view ? view.revision : null;}, updateStatus: updates => _this && _this.updateLoadedAutoTranslationStatus(updates)});
		var pluginRuntimeActive = true;
		const DEFAULT_LOADED_AUTO_TRANSLATE_LIMIT = 50;
		const LOADED_AUTO_TRANSLATE_LIMIT_MIN = 1;
		const LOADED_AUTO_TRANSLATE_LIMIT_MAX = 100;
		const DISCORD_EPOCH = 1420070400000;
		const defaultLanguages = {
			INPUT: "auto",
			OUTPUT: "$discord"
		};
		const languageTypes = {
			INPUT: "input",
			OUTPUT: "output"
		};
		const messageTypes = {
			RECEIVED: "received",
			SENT: "sent",
		};
		const AI_SKIP_TRANSLATION_TOKEN = "__SKIP_TRANSLATION__";

		const protectionLogic = createProtectionLogic({BDFDB});

		// Debug-build-only evidence probe, stripped from release bundles by the compile-time constant, as in display-runtime.js. It also persists to disk because DevTools is not reachable on every client.
		const secondDebugProbe = typeof __TRANSLATOR_DISPLAY_DEBUG__ !== "undefined" && __TRANSLATOR_DISPLAY_DEBUG__ ? (secondDebugModule => secondDebugModule.createSecondDebugProbe({log: line => console.info(line), sink: secondDebugModule.createSecondDebugEvidenceSink({fs: require("fs"), path: require("path"), pluginsFolder: BdApi && BdApi.Plugins && BdApi.Plugins.folder})}))(require("../diagnostics/second-debug-probe")) : null;
		if (secondDebugProbe && typeof window != "undefined") secondDebugProbe.installGlobal(window, {resolveScrollerElement: () => document.querySelector(BDFDB.dotCN.messagesscroller), forceUpdate: (...targets) => BDFDB.ReactUtils.forceUpdate(...targets), rerenderAll: instant => BDFDB.MessageUtils.rerenderAll(instant), getRenderCount: () => secondDebugProbe.getParentRenderCount(), autoRunExperiment: true, autoRunMaxAttempts: 60});

		const {receivedTranslationRuntime} = createReceivedTranslationRuntime({BDFDB, loadedTranslationStatusStore});

		const translationDisplayLogic = createTranslationDisplayLogic({BDFDB});

		return class Translator extends Plugin {
			getVersion () {
				return normalizeSemverVersion(this.version);
			}

			getBuildId () {return typeof __TRANSLATOR_BUILD_ID__ != "undefined" ? __TRANSLATOR_BUILD_ID__ : null;}

			createHistoricalTranslationJob (config = {}) {
				return new HistoricalTranslationJob(config);
			}

			onLoad () {
				_this = this;
				this.defaults = {
					general: {
						interfaceLanguage:		{value: "system", 	popout: false},
						sendOriginalMessage:		{value: false, 	popout: false},
						showOriginalMessage:		{value: false, 	popout: false},
						showOriginalDirectly:		{value: true, 	popout: false},
						showOriginalInReplyPreview:	{value: false, 	popout: false},
						useSpoilerInSentOriginal:	{value: false, 	popout: false},
						useSpoilerInReceivedOriginal:	{value: false, 	popout: false},
						highlightTranslatedMessages:	{value: true, 	popout: false},
						translatedTextColor:		{value: "#7cc7ff", popout: false},
						protectQuotedText:		{value: true, 	popout: false,	description: "Automatically protect and highlight wrapped content"},
						useSpoilerInOriginal:		{value: false, 	popout: false,	description: "Use Spoilers instead of Quotes for the original Message Text"}
					},
					choices: {},
					filters: {
						autoTranslateSourceLanguages:	{value: []},
						receivedAutoTranslateScope:	{value: "new_only"},
						receivedAutoTranslateLoadedRangeMode: {value: "count"},
						receivedAutoTranslateLoadedTimeWindow: {value: "1h"},
						receivedAutoTranslateLoadedLimit: {value: "50"},
						continueLoadedAutoTranslateOnScroll: {value: true},
						pauseLoadedAutoTranslateWhileScrolling: {value: true},
						receivedAutoTranslateSourceLanguages: {value: []},
						autoTranslateDecisionMode: {value: "basic"},
						aiAutoTranslatePrompt: {value: ""},
						languageDetectionStrategy: {value: "local_first"},
						skipMixedReceivedMessages:	{value: false},
						skipSameLanguageReceivedMessages: {value: true},
					useLocalLanguagePrecheck:	{value: true},
						treatLanguageVariantsAsSame: {value: true},
						dropSimilarTranslations:	{value: true},
						minimumAutoTranslateLength:	{value: 2},
						translationSimilarityThreshold: {value: 0.9}
					},
					exceptions: {
						wordStart:			{value: ["!"],	max: 3},
						protectedTerms:		{value: [],		max: 80},
						protectedTermsForSent:	{value: true},
						protectedTermsForReceived:	{value: true},
						wrapperPairs:		{value: ['"|"', '“|”', '`|`'], max: 20},
						wrapperPairsForSent:	{value: true},
						wrapperPairsForReceived:	{value: true}
					},
					prefixes: {
						translationPrefixData: 		{value: [
							{prefix: "$fr", language: "fr"},
							{prefix: "$de", language: "de"},
							{prefix: "$es", language: "es"},
							{prefix: "$jp", language: "ja"}
						]}
					},
					engines: {
						translator:			{value: "googleapi"},
						backup:				{value: "----"}
					}
				};
				for (let m in messageTypes) this.defaults.choices[messageTypes[m]] = {value: Object.keys(languageTypes).reduce((newObj, l) => (newObj[languageTypes[l]] = defaultLanguages[l], newObj), {})};
				this.modulePatches = {
					before: [
						"ChannelTextAreaContainer",
						"ChannelTextAreaEditor",
						"Embed",
						"MessageReply",
						"Messages"
					],
					after: [
						"ChannelTextAreaButtons",
						"ChannelThreadItem",
						"Embed",
						"HeaderBarChannelName",
						"HeaderBarTitle",
						"MessageReply",
						"MessageButtons",
						"MessageContent",
						"ThreadCard",
						"ThreadSidebar"
					]
				};

				this.css = createTranslatorStyles(BDFDB);
			}
			handleEditedMessageSubmit (methodArguments, originalMethod) {
				const args = Array.from(methodArguments || []);
				const channelId = args[0];
				const messageId = args[1];
				const payload = args[2];
				const originalText = typeof payload == "string" ? payload : payload && typeof payload.content == "string" ? payload.content : "";
				const submit = nextText => {
					const nextArgs = args.slice();
					nextArgs[2] = typeof payload == "string" ? nextText : Object.assign({}, payload || {}, {content: nextText});
					return Promise.resolve(originalMethod(...nextArgs));
				};
				this.clearDisplayedTranslationState(messageId, {clearReplyPreview: true});
				this.ensureReceivedDisplayRuntime().dropSourceArchive(messageId);
				this.clearCachedTranslation(messageId);
				if (!originalText || !channelId || !this.isTranslationEnabled(channelId)) return submit(originalText);
				const sentRequest = this.createSentAutomaticTranslationRequest(channelId, originalText, messageId);
				return new Promise((resolve, reject) => {
					const finishSubmit = nextText => this.completeSentAutomaticTranslationRequest(sentRequest, nextText, submit).then(resolve, reject);
					this.shouldAutoTranslateSentMessage(originalText, channelId, shouldTranslate => {
						if (!shouldTranslate || !this.isSentAutomaticTranslationRequestCurrent(sentRequest)) return finishSubmit(originalText);
						this.translateText(originalText, messageTypes.SENT, (translation, input, output) => {
							finishSubmit(this.buildSentTranslationMessageValue(originalText, translation, input, output));
						}, null, {channelId});
					});
				});
			}

			handleDeletedMessage (messageId, channelId) {return this.ensureMessageDeletionLifecycle().deleteMessage(messageId, channelId);}
			handleMessageDeletionAction (action) {return this.ensureMessageDeletionLifecycle().handleAction(action);}

			onStart () {
				pluginRuntimeActive = true;
				this.resetReceivedDisplayRuntime();
				this.ensureLiveTranslationQueue().restartRequestGeneration();
				this.ensureSentTranslationStore().resetForStart();
				this.ensureHistoricalJobRegistry().advanceRuntimeGeneration();
				this.attachAutoTranslationInputActivityWatcher();
				const dispatcher = BDFDB.LibraryModules.Dispatcher || BDFDB.LibraryModules.DispatcherUtils;
				if (dispatcher && typeof dispatcher.dispatch == "function") BDFDB.PatchUtils.patch(this, dispatcher, "dispatch", {before: event => {
					const action = event.methodArguments && event.methodArguments[0];
					if (!action || action.type != "MESSAGE_DELETE" && action.type != "MESSAGE_DELETE_BULK") return;
					this.handleMessageDeletionAction(action).catch(_ => {});
				}});
				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageUtils, "startEditMessage", {before: e => {
					const editArchive = e.methodArguments[1] && this.ensureReceivedDisplayRuntime().peekSourceArchive(e.methodArguments[1]);
						if (editArchive && editArchive.message.content) e.methodArguments[2] = editArchive.message.content;
					else if (e.methodArguments[1]) e.methodArguments[2] = this.getEditableSentMessageText(e.methodArguments[1], e.methodArguments[2]);
				}});
				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageUtils, "editMessage", {instead: e => this.handleEditedMessageSubmit(e.methodArguments, (...args) => e.originalMethod(...args))});
				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageToolbarUtils, "useMessageMenu", {after: e => {
					if (e.instance.props.message && e.instance.props.channel) {
						const channelId = e.instance.props.channel && e.instance.props.channel.id || null;
						let translated = this.isMessageDisplayTranslated(e.instance.props.message, channelId);
						let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnValue, {id: ["copy-text", "pin", "unpin"]});
						if (index == -1) [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnValue, {id: ["edit", "add-reaction", "add-reaction-1", "quote"]});
						children.splice(index + 1, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
							label: translated ? this.labels.context_messageuntranslateoption : this.labels.context_messagetranslateoption,
							id: BDFDB.ContextMenuUtils.createItemId(this.name, translated ? "untranslate-message" : "translate-message"),
							icon: _ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
								icon: translated ? translateIconUntranslate : translateIcon
							}),
							action: _ => this.translateMessage(e.instance.props.message, e.instance.props.channel, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false})
						}));
						this.injectMessageLanguageActions(children, index + 1, e.instance.props.message, e.instance.props.channel);
					}
				}});
				this.forceUpdateAll();
			}
			onStop () {
				pluginRuntimeActive = false; channelToggleOperations.reset();
				this.invalidateLiveTranslationRequests();
				this.invalidateSentAutomaticTranslationRequests();
				this.ensureSentTranslationStore().clearPendingOriginals();
				this.ensureHistoricalJobRegistry().advanceRuntimeGeneration();
				channelTitleStore.invalidateInFlight();
				this.cancelHistoricalTranslationJobs(null, "plugin-stopped");
				this.clearChannelTitleTranslations();
				this.detachAutoTranslationInputActivityWatcher();
				this.detachAutoTranslationScrollWatcher();
				this.ensureTranslationCacheStore().cancelPendingSave();
				this.ensureReceivedDisplayRepaintScheduler().cancelFullRepaintTimers();
				this.ensureLiveTranslationQueue().cancelQueueRetry();
				this.ensureMessageViewportStore().clearManualScrollLock();
				// Restore store-owned automatic records synchronously before legacy cleanup so the
				// final rerender paints originals; onStop must not reload settings via forceUpdateAll.
				this.clearReceivedDisplayFlushQueue();
				this.restoreAllReceivedDisplay({refresh: false});
				this.clearDisplayedTranslations();
				this.ensureHistoricalJobRegistry().clearFailedSnapshots();
				this.ensureSentTranslationStore().clearManualRequests();
				this.ensureReceivedDisplayRuntime().clearAllSuppression();
				this.ensureLiveTranslationQueue().clearAllQueuedMessages();
				this.ensureReceivedDisplayRuntime().clearPreviews(null);
				this.ensureReceivedDisplayRuntime().clearPreviewEligibility(null);
				this.ensureLiveTranslationQueue().setBusyTranslating(false);
				this.ensureLiveTranslationQueue().setLiveAutoTranslating(false);
				this.clearLoadedAutoTranslationStatus();
				BDFDB.MessageUtils.rerenderAll(true);
			}

			getSettingsPanel (collapseStates = {}) {return renderSettingsPanel(this, collapseStates, {BDFDB});}
			onSettingsClosed () {
				if (this.ensureReceivedDisplayRepaintScheduler().hasDeferredFullRepaint()) this.flushDeferredTranslationRerender();
				if (this.SettingsUpdated) {
					delete this.SettingsUpdated;
					this.forceUpdateAll();
				}
			}

			getCustomText (key) {
				return getCustomTextValue(key, this.isChineseUiLanguage(), this.isRussianUiLanguage());
			}

			getGeneralSettingLabel (key) {
				const isChinese = this.isChineseUiLanguage();
				const isRussian = this.isRussianUiLanguage();
				const labels = isChinese ? {
					sendOriginalMessage: "发送译文时同时附带原文",
					showOriginalMessage: "查看收到的译文时同时显示原文",
					useSpoilerInOriginal: "原文使用剧透样式显示"
				} : {
					sendOriginalMessage: "Also send the original text with translated outgoing messages",
					showOriginalMessage: "Also show the original text with translated incoming messages",
					useSpoilerInOriginal: "Show original text as spoiler blocks"
				};
				Object.assign(labels, isChinese ? {
					showOriginalDirectly: "直接显示收到消息的原文",
					useSpoilerInOriginal: "原文使用剧透样式显示"
				} : {
					showOriginalDirectly: "Show received original text directly",
					useSpoilerInOriginal: "Show original text as spoiler blocks"
				});
				Object.assign(labels, isChinese ? {
					highlightTranslatedMessages: "给译文消息添加更显眼的左侧色条与背景"
				} : {
					highlightTranslatedMessages: "Highlight translated messages with a left accent and background"
				});
				Object.assign(labels, isChinese ? {
					protectQuotedText: "自动保护并高亮包裹符内的内容"
				} : {
					protectQuotedText: "Automatically protect and highlight wrapped content"
				});
				Object.assign(labels, isChinese ? {
					showOriginalInReplyPreview: "别人引用这条消息时只显示译文"
				} : {
					showOriginalInReplyPreview: "Show translated text only in reply previews"
				});
				Object.assign(labels, isChinese ? {
					useSpoilerInSentOriginal: "发送附带原文时使用剧透/刮刮乐遮盖",
					useSpoilerInReceivedOriginal: "查看收到的原文时使用剧透/刮刮乐遮盖"
				} : {
					useSpoilerInSentOriginal: "Hide attached outgoing original text behind spoiler (scratch-off) blocks",
					useSpoilerInReceivedOriginal: "Show received original text as spoiler (scratch-off) blocks"
				});
				if (isRussian) Object.assign(labels, {
					interfaceLanguage: "Язык интерфейса плагина",
					sendOriginalMessage: "Добавлять оригинал к переведённым исходящим сообщениям",
					showOriginalMessage: "Показывать оригинал рядом с переведёнными входящими сообщениями",
					showOriginalDirectly: "Показывать оригинал входящих сообщений напрямую",
					highlightTranslatedMessages: "Подсвечивать переведённые сообщения",
					translatedTextColor: "Цвет переведённого текста",
					protectQuotedText: "Автоматически защищать и подсвечивать текст в обрамляющих символах",
					useSpoilerInOriginal: "Показывать оригинал как спойлер"
				});
				if (isRussian) Object.assign(labels, {
					useSpoilerInSentOriginal: "袩褉褟褌邪褌褜 懈褋褏芯写薪褘泄 褌械泻褋褌 胁 懈褋褏芯写褟褖懈褏 褋芯芯斜褖械薪懈褟褏 泻邪泻 褋锌芯泄谢械褉",
					useSpoilerInReceivedOriginal: "袩芯泻邪蟹褘胁邪褌褜 芯褉懈谐懈薪邪谢 胁褏芯写褟褖懈褏 褋芯芯斜褖械薪懈泄 泻邪泻 褋锌芯泄谢械褉"
				});
				return labels[key] || this.labels[`general_${key}`] || this.defaults.general[key].description;
			}

			getEngineLabel (engineKey) {
				const isChinese = this.isChineseUiLanguage();
				const isRussian = this.isRussianUiLanguage();
				if (isRussian && engineKey == "googleapi") return "Google (по умолчанию, без API)";
				if (isRussian && engineKey == "googlecloud") return "Google Cloud Translation (официальный API)";
				if (isRussian && engineKey == "microsoft") return "Azure Translator (официальный API)";
				if (isRussian && engineKey == "oaicompat") return "Пользовательский API (совместимый с OpenAI)";
				if (engineKey == "googleapi") return isChinese ? "Google（默认，无需 API）" : "Google (Default, no API)";
				if (engineKey == "googlecloud") return isChinese ? "Google Cloud Translation（正式 API）" : "Google Cloud Translation (Official API)";
				if (engineKey == "microsoft") return isChinese ? "Azure Translator（正式 API）" : "Azure Translator (Official API)";
				if (engineKey == "openai") return isChinese ? "OpenAI（官方 API）" : "OpenAI (Official API)";
				if (engineKey == "gemini") return isChinese ? "Google Gemini（官方 API）" : "Google Gemini (Official API)";
				if (engineKey == "oaicompat") return isChinese ? "自定义 API（兼容 OpenAI）" : "Custom API (OpenAI Compatible)";
				return translationEngines[engineKey] && translationEngines[engineKey].name || engineKey;
			}

			getChannelTranslationToggleLabel () {
				if (this.isChineseUiLanguage()) return "\u5f53\u524d\u9891\u9053\u6536\u5230\u6d88\u606f\u81ea\u52a8\u7ffb\u8bd1";
				return "Incoming auto-translate for this channel";
			}

			getTranslateButtonTooltipText (channelId) {
				const enabled = this.isTranslationEnabled(channelId);
				if (!enabled) {
					if (this.isChineseUiLanguage()) return "左键打开设置，右键开启当前频道的翻译插件总开关";
					return "Left click for settings, right click to enable the translator master switch in this channel";
				}
				const statusText = this.isChineseUiLanguage() ? "当前频道翻译插件总开关已开启" : "Translator master switch is enabled in this channel";
				return `${statusText} | ${this.getTranslationTooltipText(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId), this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId))}`;
			}

			getUiLanguageId () {
				const overrideLanguage = this.settings && this.settings.general && this.settings.general.interfaceLanguage;
				return overrideLanguage && overrideLanguage != "system" ? overrideLanguage : BDFDB.LanguageUtils.getLanguage().id;
			}

			isChineseUiLanguage () {
				return ["zh", "zh-CN", "zh-TW"].includes(this.getUiLanguageId());
			}

			isRussianUiLanguage () {
				return this.getUiLanguageId() == "ru";
			}

			getPluginLanguageOptions () {
				const isChinese = this.isChineseUiLanguage();
				const isRussian = this.isRussianUiLanguage();
				return [
					{value: "system", label: isChinese ? "跟随 Discord" : isRussian ? "Как в Discord" : "Follow Discord"},
					{value: "zh-CN", label: "简体中文"},
					{value: "en", label: "English"},
					{value: "ru", label: "Русский"}
				];
			}

			getReceivedAutoTranslateScopeOptions () {
				return [
					{value: "new_only", label: this.getCustomText("received_auto_translate_scope_new_only")},
					{value: "loaded_messages", label: this.getCustomText("received_auto_translate_scope_loaded_messages")}
				];
			}

			getReceivedAutoTranslateLoadedTimeWindowOptions () {
				return [
					{value: "15m", label: this.getCustomText("received_auto_translate_loaded_window_15m")},
					{value: "1h", label: this.getCustomText("received_auto_translate_loaded_window_1h")},
					{value: "6h", label: this.getCustomText("received_auto_translate_loaded_window_6h")},
					{value: "24h", label: this.getCustomText("received_auto_translate_loaded_window_24h")},
					{value: "all", label: this.getCustomText("received_auto_translate_loaded_window_all")}
				];
			}

			getReceivedAutoTranslateLoadedRangeModeOptions () {
				return [
					{value: LOADED_AUTO_TRANSLATE_RANGE_MODES.COUNT, label: this.getCustomText("received_auto_translate_loaded_range_mode_count")},
					{value: LOADED_AUTO_TRANSLATE_RANGE_MODES.TIME, label: this.getCustomText("received_auto_translate_loaded_range_mode_time")}
				];
			}

			normalizeLoadedAutoTranslateLimit (value) {
				const parsedValue = parseInt(value, 10);
				if (!isFinite(parsedValue)) return DEFAULT_LOADED_AUTO_TRANSLATE_LIMIT;
				return Math.max(LOADED_AUTO_TRANSLATE_LIMIT_MIN, Math.min(LOADED_AUTO_TRANSLATE_LIMIT_MAX, parsedValue));
			}

			getTranslatedTextColorPresets () {
				return [
					"#7cc7ff",
					"#5aa9ff",
					"#57d39b",
					"#f0b232",
					"#ff8a5b",
					"#ff6b9a",
					"#c084fc",
					"#e6edf3"
				];
			}

			getTranslatedTextColorPalette () {
				const colors = this.getTranslatedTextColorPresets().slice();
				const customColors = this.settings && this.settings.general && BDFDB.ArrayUtils.is(this.settings.general.customTranslatedTextColors) ? this.settings.general.customTranslatedTextColors : [];
				for (const color of customColors) if (color && !colors.includes(color)) colors.unshift(color);
				const currentColor = this.getTranslatedTextColor();
				if (!colors.includes(currentColor)) colors.unshift(currentColor);
				return colors;
			}

			getTranslatedTextColorOptions () {
				return this.getTranslatedTextColorPalette().map(color => ({value: color, label: color}));
			}

			getTranslatedTextColor () {
				const color = this.settings && this.settings.general && this.settings.general.translatedTextColor;
				return (color || "").trim() || "#7cc7ff";
			}

			isValidCssColorValue (color) {
				color = (color || "").trim();
				if (!color) return false;
				if (typeof document == "undefined" || !document.createElement) return /^#([0-9a-f]{3,8})$/i.test(color);
				const testElement = document.createElement("span");
				testElement.style.color = "";
				testElement.style.color = color;
				return !!testElement.style.color;
			}

			shouldUseSpoilerInSentOriginal () {
				const general = this.settings && this.settings.general || {};
				if (general.useSpoilerInSentOriginal != null) return !!general.useSpoilerInSentOriginal;
				return !!general.useSpoilerInOriginal;
			}

			shouldUseSpoilerInReceivedOriginal () {
				const general = this.settings && this.settings.general || {};
				if (general.useSpoilerInReceivedOriginal != null) return !!general.useSpoilerInReceivedOriginal;
				return !!general.useSpoilerInOriginal;
			}

			getCurrentUserId () {
				try {
					if (BDFDB.LibraryStores.UserStore && typeof BDFDB.LibraryStores.UserStore.getCurrentUser == "function") {
						const currentUser = BDFDB.LibraryStores.UserStore.getCurrentUser();
						if (currentUser && currentUser.id) return currentUser.id;
					}
				}
				catch (err) {}
				return BDFDB.UserUtils && BDFDB.UserUtils.me && BDFDB.UserUtils.me.id || null;
			}

			isOwnMessage (message) {
				const currentUserId = this.getCurrentUserId();
				return !!(currentUserId && message && message.author && message.author.id == currentUserId);
			}

			ensureElementChildrenArray (element) {
				if (!element || !element.props) return [];
				if (!Array.isArray(element.props.children)) element.props.children = element.props.children == null ? [] : [element.props.children];
				return element.props.children;
			}

			getMessageDetectionSourceText (message) {
				if (!message) return "";
				const detectionRecord = this.ensureReceivedDisplayRuntime().getDisplayState(message.id);
				const translation = detectionRecord && detectionRecord.translation;
				if (translation && translation.originalContent) return translation.originalContent;
				const detectionArchive = this.ensureReceivedDisplayRuntime().peekSourceArchive(message.id);
				const originalContentData = detectionArchive && detectionArchive.originalContentData;
				if (originalContentData && originalContentData.content) return originalContentData.content;
				return message.content || "";
			}

			ensureChannelLanguageChoiceScope (channelId, place) {
				return this.ensureSettingsStore().ensureChannelLanguageChoiceScope(channelId, place);
			}

			setReplyTargetLanguageForChannel (channelId, languageId) {
				if (!channelId || !languageId) return;
				this.ensureSettingsStore().setChannelLanguageChoice(channelId, messageTypes.SENT, languageTypes.OUTPUT, languageId);
				this.setLanguages();
				this.SettingsUpdated = true;
			}

			extractLegacyDisplayedTranslationParts (content) {
				content = (content || "").trim();
				if (!content) return {translatedContent: "", originalContent: ""};

				content = content.replace(/^\s*(?:译文|Translated|Перевод)\s*\n+/i, "");
				const lines = content.split("\n");
				const originalLabelIndex = lines.findIndex(line => /^(?:原文|Original|Оригинал)\s*$/i.test((line || "").trim()));
				if (originalLabelIndex > -1) return {
					translatedContent: lines.slice(0, originalLabelIndex).join("\n").trim(),
					originalContent: lines.slice(originalLabelIndex + 1).join("\n").trim()
				};

				if (/\n\|\|[\s\S]*\|\|$/.test(content)) {
					const match = content.match(/\n\|\|([\s\S]*)\|\|$/);
					return {
						translatedContent: content.replace(/\n\|\|[\s\S]*\|\|$/, "").trim(),
						originalContent: match && match[1] ? match[1].trim() : ""
					};
				}

				const boundaryLines = content.split("\n");
				let boundaryIndex = boundaryLines.length;
				while (boundaryIndex > 0 && /^\s*>\s?/.test(boundaryLines[boundaryIndex - 1])) boundaryIndex--;
				if (boundaryIndex < boundaryLines.length) return {
					translatedContent: boundaryLines.slice(0, boundaryIndex).join("\n").trim(),
					originalContent: boundaryLines.slice(boundaryIndex).map(line => line.replace(/^\s*>\s?/, "")).join("\n").trim()
				};

				return {translatedContent: content, originalContent: ""};
			}

			normalizeStoredTranslationData (translation) {
				if (!translation) return translation;
				const normalized = Object.assign({}, translation);
				const legacyParts = this.extractLegacyDisplayedTranslationParts(normalized.content || "");
				const translatedContent = (normalized.translatedContent || "").trim();
				const originalContent = normalized.originalContent != null ? String(normalized.originalContent) : "";

				if (!translatedContent || /^(?:译文|Translated|Перевод)\s*$/i.test(translatedContent)) normalized.translatedContent = legacyParts.translatedContent || translatedContent;
				else normalized.translatedContent = translatedContent;
				if (!originalContent && legacyParts.originalContent) normalized.originalContent = legacyParts.originalContent;
				return normalized;
			}

			async handleMessageLanguageAction (message, channel, applyAsReplyTarget = false) {
				const sourceText = (this.getMessageDetectionSourceText(message) || "").trim();
				if (!sourceText) return BDFDB.NotificationUtils.toast(this.getCustomText("detect_message_empty"), {type: "danger", position: "center"});
				const detectedLanguage = await this.detectLanguageDetails(sourceText);
				if (!detectedLanguage) return BDFDB.NotificationUtils.toast(this.getCustomText("detect_message_failed"), {type: "danger", position: "center"});
				if (applyAsReplyTarget && channel && channel.id) {
					this.setReplyTargetLanguageForChannel(channel.id, detectedLanguage.id);
					return BDFDB.NotificationUtils.toast(`${this.getCustomText("reply_language_applied")} ${this.getLanguageDisplayName(detectedLanguage)} (${detectedLanguage.id}). ${this.getCustomText("reply_language_hint")}`, {type: "success", position: "center"});
				}
				return BDFDB.NotificationUtils.toast(`${this.getCustomText("detect_message_success")}: ${this.getLanguageDisplayName(detectedLanguage)} (${detectedLanguage.id})`, {type: "success", position: "center"});
			}

			injectMessageLanguageActions (children, index, message, channel) {
				if (!children || !message || !channel) return;
				const insertIndex = index > -1 ? index + 1 : 0;
				children.splice(insertIndex, 0,
					BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
						label: this.getCustomText("context_detect_message_language"),
						id: BDFDB.ContextMenuUtils.createItemId(this.name, "detect-message-language"),
						action: _ => this.handleMessageLanguageAction(message, channel, false)
					}),
					BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
						label: this.getCustomText("context_reply_in_detected_language"),
						id: BDFDB.ContextMenuUtils.createItemId(this.name, "reply-in-detected-language"),
						action: _ => this.handleMessageLanguageAction(message, channel, true)
					})
				);
			}

			cloneOriginalContentData (originalContentData) {
				return {
					content: originalContentData && originalContentData.content || "",
					embeds: ((originalContentData && originalContentData.embeds) || []).map(embed => ({
						description: embed && embed.description || "",
						title: embed && embed.title || "",
						footerText: embed && embed.footerText || "",
						fields: ((embed && embed.fields) || []).map(field => ({
							name: field && field.name || "",
							value: field && field.value || ""
						}))
					}))
				};
			}

			normalizeExtractedMessageText (value) {
				if (value == null) return "";
				if (typeof value == "string") return value;
				if (typeof value == "number" || typeof value == "boolean") return String(value);
				if (value && typeof value == "object") {
					if (typeof value.text == "string") return value.text;
					if (typeof value.content == "string") return value.content;
					if (typeof value.raw == "string") return value.raw;
				}
				return "";
			}

			getReferencedPreviewContentCandidates (message) {
				const candidates = [];
				const addCandidate = value => {
					value = this.normalizeExtractedMessageText(value).trim();
					if (value && !candidates.includes(value)) candidates.push(value);
				};
				const referencedSources = [
					message && message.referencedMessage,
					message && message.referencedMessage && message.referencedMessage.message,
					message && message.referenced_message,
					message && message.messageReference && message.messageReference.message,
					message && message.reference && message.reference.message
				].filter(Boolean);
				for (const source of referencedSources) {
					addCandidate(source.content);
					addCandidate(source.originalContent);
					addCandidate(source.rawContent);
				}
				return candidates;
			}

			stripReferencedPreviewFromContent (message, content) {
				content = this.normalizeExtractedMessageText(content);
				if (!message || !content || !(message.referencedMessage || message.referenced_message || message.messageReference || message.reference)) return content;
				const trimmedContent = content.trim();
				if (!trimmedContent) return content;
				const candidates = this.getReferencedPreviewContentCandidates(message);
				if (!candidates.length) return content;
				const normalize = value => this.normalizeComparisonText(value || "");
				const lines = content.split(/\r?\n/);
				for (const candidate of candidates) {
					const normalizedCandidate = normalize(candidate);
					if (!normalizedCandidate) continue;
					if (normalize(trimmedContent) == normalizedCandidate) return content;
					if (trimmedContent.startsWith(candidate)) {
						let remainder = trimmedContent.slice(candidate.length).replace(/^\s+/, "");
						if (remainder) return remainder;
					}
					const firstLine = (lines[0] || "").trim();
					if (firstLine && (normalize(firstLine).includes(normalizedCandidate) || normalizedCandidate.includes(normalize(firstLine)))) {
						const remainder = lines.slice(1).join("\n").trim();
						if (remainder) return remainder;
					}
				}
				return content;
			}

			refreshReceivedMessageSourceState (message, channelId = null) {
				if (!message || !message.id || !this.ensureReceivedDisplayRuntime().hasSourceArchive(message.id)) return false;
				const currentContent = this.normalizeExtractedMessageText(message.content).trim();
				if (!currentContent) return false;
				const storedOriginal = this.ensureReceivedDisplayRuntime().peekSourceArchive(message.id).message;
				const storedOriginalData = storedOriginal.originalContentData || {};
				const editRecord = this.ensureReceivedDisplayRuntime().getDisplayState(message.id);
				const translation = editRecord && (editRecord.translation || editRecord.restoredTranslation) || {};
				const knownContents = [
					storedOriginal.content,
					storedOriginalData.content,
					translation.originalContent,
					translation.translatedContent,
					translation.content
				].map(value => this.normalizeExtractedMessageText(value).trim()).filter(Boolean);
				if (knownContents.includes(currentContent)) return false;
				this.ensureReceivedDisplayRuntime().dropSourceArchive(message.id);
				this.clearDisplayedTranslationState(message.id, {clearReplyPreview: true});
				this.clearCachedTranslation(message.id);
				return true;
			}

			matchesPaintedTranslationContent (paintedText, translation) {return receivedTranslationRuntime.matchesPaintedTranslation(this, paintedText, translation);}

			extractOriginalContentData (message, options = {}) {
				const storedOriginalContentData = receivedTranslationRuntime.resolveOriginalContentDataAnchor(this, message);
				if (storedOriginalContentData) return this.cloneOriginalContentData(storedOriginalContentData);
				let messageContent = this.normalizeExtractedMessageText(message && message.content || "");
				if (options && options.ignoreReferencedPreview) messageContent = this.stripReferencedPreviewFromContent(message, messageContent);
				const extractedParts = this.extractLegacyDisplayedTranslationParts(messageContent);
				return this.cloneOriginalContentData({
					content: extractedParts.originalContent || messageContent,
					embeds: ((message && message.embeds) || []).map(embed => ({
						description: this.normalizeExtractedMessageText(embed.originalDescription || embed.rawDescription || embed.description || ""),
						title: this.normalizeExtractedMessageText(embed.originalTitle || embed.rawTitle || embed.title || ""),
						footerText: this.normalizeExtractedMessageText(embed.originalFooter ? embed.originalFooter.text : embed.footer ? embed.footer.text : ""),
						fields: (embed.originalFields || embed.fields || []).map(field => ({
							name: this.normalizeExtractedMessageText(field.rawName || field.name || ""),
							value: this.normalizeExtractedMessageText(field.rawValue || field.value || "")
						}))
					}))
				});
			}

			isTranslatorInjectedElement (element) {
				if (!element || typeof element != "object") return false;
				if (element.key && String(element.key).indexOf("translator-") == 0) return true;
				const className = element.props && element.props.className;
				if (typeof className == "string" && className.toLowerCase().indexOf("translator") > -1) return true;
				const nestedChildren = element.props && element.props.children;
				if (!nestedChildren) return false;
				if (Array.isArray(nestedChildren)) return nestedChildren.some(child => this.isTranslatorInjectedElement(child));
				return this.isTranslatorInjectedElement(nestedChildren);
			}

			cleanupInjectedMessageChildren (children) {
				if (!Array.isArray(children)) return children;
				for (let index = children.length - 1; index > -1; index--) {
					if (this.isTranslatorInjectedElement(children[index])) children.splice(index, 1);
				}
				return children;
			}

			buildProtectedQuoteFragments (text, keyPrefix = "0") {
				if (!this.settings.general.protectQuotedText || typeof text != "string" || !text) return text;
				const quotedRegex = /"([^"\r\n]+)"|“([^”\r\n]+)”/g;
				let match, lastIndex = 0, quoteIndex = 0, fragments = [];
				while ((match = quotedRegex.exec(text))) {
					const quotedText = match[0];
					if (!quotedText || !quotedText.slice(1, -1).trim()) continue;
					if (match.index > lastIndex) fragments.push(text.slice(lastIndex, match.index));
					fragments.push(BDFDB.ReactUtils.createElement("span", {
						key: `translator-protected-quote-${keyPrefix}-${quoteIndex++}`,
						className: "translator-protected-quote",
						children: quotedText
					}));
					lastIndex = match.index + quotedText.length;
				}
				if (!fragments.length) return text;
				if (lastIndex < text.length) fragments.push(text.slice(lastIndex));
				return fragments.filter(fragment => fragment !== "");
			}

			highlightProtectedQuotesInNode (node, keyPrefix = "0") {
				if (!this.settings.general.protectQuotedText || node == null) return node;
				if (typeof node == "string") return this.buildProtectedQuoteFragments(node, keyPrefix);
				if (Array.isArray(node)) {
					let nextNodes = [];
					node.forEach((childNode, index) => {
						const highlightedNode = this.highlightProtectedQuotesInNode(childNode, `${keyPrefix}-${index}`);
						if (Array.isArray(highlightedNode)) nextNodes.push(...highlightedNode);
						else nextNodes.push(highlightedNode);
					});
					return nextNodes;
				}
				if (typeof node != "object" || this.isTranslatorInjectedElement(node) || !node.props) return node;
				if (typeof node.type == "string" && ["code", "pre"].includes(node.type)) return node;
				if (node.props.children != null) node.props.children = this.highlightProtectedQuotesInNode(node.props.children, `${keyPrefix}-c`);
				return node;
			}

			isDiscordSpoilerWrapperRule (rule) {
				const raw = (rule || "").trim();
				if (!raw) return false;
				if (/^\|{2,}$/.test(raw)) return true;
				let splitIndex = raw.indexOf("|");
				if (splitIndex < 1 || splitIndex >= raw.length - 1) return false;
				let left = raw.slice(0, splitIndex);
				let right = raw.slice(splitIndex + 1);
				return /^\|+$/.test(left) && /^\|+$/.test(right);
			}

			getWrapperPairItemsForSettings () {
				let wrapperPairs = BDFDB.ArrayUtils.is(this.settings.exceptions.wrapperPairs) ? this.settings.exceptions.wrapperPairs : [];
				return wrapperPairs.filter(rule => !this.isDiscordSpoilerWrapperRule(rule));
			}

			getProtectedWrapperRules () {
				let wrapperPairs = this.getWrapperPairItemsForSettings();
				return [...new Set(wrapperPairs.map(rule => (rule || "").trim()).filter(Boolean))].map(rule => {
					let splitIndex = rule.indexOf("|");
					if (splitIndex < 1 || splitIndex >= rule.length - 1) return null;
					let left = rule.slice(0, splitIndex);
					let right = rule.slice(splitIndex + 1);
					if (!left || !right) return null;
					return {left, right, raw: rule};
				}).filter(Boolean).sort((ruleA, ruleB) => (ruleB.left.length + ruleB.right.length) - (ruleA.left.length + ruleA.right.length));
			}

			findNextProtectedWrapperSegment (text, fromIndex = 0) {
				if (typeof text != "string" || !text) return null;
				let bestMatch = null;
				for (let rule of this.getProtectedWrapperRules()) {
					let startIndex = text.indexOf(rule.left, fromIndex);
					while (startIndex > -1) {
						let contentStart = startIndex + rule.left.length;
						let endIndex = text.indexOf(rule.right, contentStart);
						if (endIndex < 0) break;
						let fullText = text.slice(startIndex, endIndex + rule.right.length);
						let innerText = text.slice(contentStart, endIndex);
						if (innerText.trim() && !/[\r\n]/.test(fullText)) {
							let candidate = {startIndex, endIndex: endIndex + rule.right.length, fullText, innerText, rule};
							if (!bestMatch || candidate.startIndex < bestMatch.startIndex || candidate.startIndex == bestMatch.startIndex && fullText.length > bestMatch.fullText.length) bestMatch = candidate;
							break;
						}
						startIndex = text.indexOf(rule.left, contentStart);
					}
				}
				return bestMatch;
			}

			buildProtectedWrapperFragments (text, keyPrefix = "0") {
				if (typeof text != "string" || !text) return text;
				let fragments = [];
				let cursor = 0;
				let wrapperIndex = 0;
				while (cursor < text.length) {
					let match = this.findNextProtectedWrapperSegment(text, cursor);
					if (!match) break;
					if (match.startIndex > cursor) fragments.push(text.slice(cursor, match.startIndex));
					fragments.push(BDFDB.ReactUtils.createElement("span", {
						key: `translator-protected-quote-${keyPrefix}-${wrapperIndex++}`,
						className: "translator-protected-quote",
						children: match.fullText
					}));
					cursor = match.endIndex;
				}
				if (!fragments.length) return text;
				if (cursor < text.length) fragments.push(text.slice(cursor));
				return fragments.filter(fragment => fragment !== "");
			}

			highlightProtectedWrappedTextInNode (node, keyPrefix = "0") {
				if (node == null) return node;
				if (typeof node == "string") return this.buildProtectedWrapperFragments(node, keyPrefix);
				if (Array.isArray(node)) {
					let nextNodes = [];
					node.forEach((childNode, index) => {
						const highlightedNode = this.highlightProtectedWrappedTextInNode(childNode, `${keyPrefix}-${index}`);
						if (Array.isArray(highlightedNode)) nextNodes.push(...highlightedNode);
						else nextNodes.push(highlightedNode);
					});
					return nextNodes;
				}
				if (typeof node != "object" || this.isTranslatorInjectedElement(node) || !node.props) return node;
				if (typeof node.type == "string" && ["code", "pre"].includes(node.type)) return node;
				if (node.props.children != null) node.props.children = this.highlightProtectedWrappedTextInNode(node.props.children, `${keyPrefix}-c`);
				return node;
			}

			buildTranslationRequestText (originalContentData) {
				let allTextsToTranslate = originalContentData.content || "";
				(originalContentData.embeds || []).forEach(embed => {
					allTextsToTranslate += `\n__________________ __________________ __________________\n`;
					allTextsToTranslate += embed.title + "\n" + embed.description;
					(embed.fields || []).forEach(field => {
						allTextsToTranslate += "\n\n" + field.name + "__________________" + field.value;
					});
					if (embed.footerText) allTextsToTranslate += "\n" + embed.footerText;
				});
				return allTextsToTranslate.trim();
			}

			hasTranslatableMessageContent (originalContentData) {
				if (!originalContentData) return false;
				if ((originalContentData.content || "").trim()) return true;
				return (originalContentData.embeds || []).some(embed => (embed.title || "").trim() || (embed.description || "").trim() || (embed.footerText || "").trim() || (embed.fields || []).some(field => (field.name || "").trim() || (field.value || "").trim()));
			}

			buildReceivedDisplayContent (translatedContent, originalContent, forceInlineOriginal = false) {
				return translationDisplayLogic.buildReceivedDisplayContent(this, translatedContent, originalContent, forceInlineOriginal);
			}

			refreshTranslationDisplay (translation) {
				return translationDisplayLogic.refreshTranslationDisplay(this, translation);
			}

			getReceivedTranslationRequestConfigurationData (channelId) {
				return {
					protectionVersion: translationProtectionSignatureVersion,
					channelId: channelId || null,
					input: this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId),
					output: this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId),
					protectQuotedText: this.settings && this.settings.general && this.settings.general.protectQuotedText !== false,
					protectedTermsForReceived: this.getExceptionScopeSetting("protectedTermsForReceived", true),
					wrapperPairsForReceived: this.getExceptionScopeSetting("wrapperPairsForReceived", true),
					wrapperPairs: this.getProtectedWrapperRules().map(rule => rule.raw),
					protectedTerms: this.getProtectedTermsList().map(term => term.toLowerCase()),
					wordStart: BDFDB.ArrayUtils.is(this.settings && this.settings.exceptions && this.settings.exceptions.wordStart) ? this.settings.exceptions.wordStart.slice() : [],
					translator: this.getEffectivePrimaryEngine(channelId),
					backup: this.getEffectiveBackupEngine(channelId)
				};
			}

			getReceivedTranslationPolicyConfigurationData () {
				return {
					sourceLanguages: this.getReceivedAutoTranslateSourceLanguages(),
					autoDecisionMode: this.getAutoTranslateDecisionMode(),
					languageDetectionStrategy: this.getLanguageDetectionStrategy(),
					skipSameLanguage: this.shouldSkipSameLanguageReceivedMessages(),
					useLocalLanguagePrecheck: this.useLocalLanguagePrecheck(),
					treatLanguageVariantsAsSame: this.shouldTreatLanguageVariantsAsSame(),
					dropSimilarTranslations: this.shouldDropSimilarTranslations(),
					translationSimilarityThreshold: this.getTranslationSimilarityThreshold()
				};
			}

			getReceivedTranslationConfigurationData (channelId) {
				return Object.assign({}, this.getReceivedTranslationRequestConfigurationData(channelId), {
					policy: this.getReceivedTranslationPolicyConfigurationData()
				});
			}

			createReceivedTranslationSignature (message, channelId, originalContentData = null) {
				const sourceData = originalContentData || this.extractOriginalContentData(message);
				return JSON.stringify(Object.assign({}, this.getReceivedTranslationConfigurationData(channelId), {
					content: sourceData.content || "",
					embeds: sourceData.embeds || []
				}));
			}

			getCachedReceivedTranslation (message, channelId, originalContentData = null) {
				return this.ensureTranslationCacheStore().getCachedTranslation(message, channelId, originalContentData);
			}

			getCachedReceivedSkipDecision (message, channelId, originalContentData = null) {
				return this.ensureTranslationCacheStore().getCachedSkipDecision(message, channelId, originalContentData);
			}

			scheduleTranslationCacheSave () {
				return this.ensureTranslationCacheStore().scheduleSave();
			}

			persistTranslationCacheEntry (messageId, signature, translation) {
				return this.ensureTranslationCacheStore().persistTranslation(messageId, signature, translation);
			}

			shouldPersistReceivedSkipDecision (reason) {
				return this.ensureTranslationCacheStore().shouldPersistSkipDecision(reason);
			}

			hasCachedTranslationEntry (messageId) {
				return this.ensureTranslationCacheStore().hasEntry(messageId);
			}

			getPersistedTranslationCacheEntry (messageId) {
				return this.ensureTranslationCacheStore().getEntry(messageId);
			}

			seedRawTranslationCacheEntryForTest (messageId, signature, translation) {
				return this.ensureTranslationCacheStore().seedRawEntryForTest(messageId, signature, translation);
			}

			// The raw signature embeds the whole request configuration, so storing it verbatim
			// made it the majority of the persisted cache file. Every use is an equality check,
			// so a compact digest carries the same information at a fraction of the size.
			hashReceivedTranslationSignature (signature) {
				return this.ensureTranslationCacheStore().hashSignature(signature);
			}

			matchesCachedTranslationSignature (entry, signature) {
				return this.ensureTranslationCacheStore().matchesSignature(entry, signature);
			}

			getLoadedAutoTranslationSeenCount (channelId) {
				return loadedTranslationStatusStore.getSeenCount(channelId);
			}

			markLoadedAutoTranslationMessageSeen (channelId, messageId) {
				return loadedTranslationStatusStore.markMessageSeen(channelId, messageId);
			}

			hasStoredOriginalMessageClone (messageId) {
				return !!(messageId && this.ensureReceivedDisplayRuntime().hasSourceArchive(messageId));
			}

			persistReceivedSkipDecision (messageId, signature, reason, preview = "") {
				return this.ensureTranslationCacheStore().persistSkipDecision(messageId, signature, reason, preview);
			}

			clearCachedTranslation (messageId) {
				return this.ensureTranslationCacheStore().clear(messageId);
			}

			createReplyPreviewSignature (message, channelId, originalContent = null) {
				return JSON.stringify(Object.assign({}, this.getReceivedTranslationConfigurationData(channelId), {
					content: originalContent != null ? originalContent : message && message.content || ""
				}));
			}

			getReplyPreviewTranslation (message, channelId) {
				if (!message || !message.id) return null;
				const display = this.ensureReceivedDisplayRuntime();
				// Existence check first: building a signature resolves the channel language settings,
				// and most reply renders have nothing stored to validate. The store evicts on a
				// signature mismatch, which is what the inline comparison used to do here.
				if (!display.getPreviewTranslation(message.id)) return null;
				return display.getPreviewTranslation(message.id, {signature: this.createReplyPreviewSignature(message, channelId)});
			}

			createReplyPreviewTranslationData (message, channelId, translation) {
				if (!message || !translation) return null;
				translation = this.normalizeStoredTranslationData(translation);
				const translatedContent = (translation.translatedContent || translation.content || "").trim();
				const originalContent = (translation.originalContent != null ? translation.originalContent : message.content) || "";
				if (!translatedContent) return null;
				return {
					signature: this.createReplyPreviewSignature(message, channelId, originalContent),
					channelId,
					auto: !!translation.auto,
					translatedContent,
					originalContent,
					input: translation.input,
					output: translation.output
				};
			}

			getReplyPreviewDisplayContent (translation) {
				return translationDisplayLogic.getReplyPreviewDisplayContent(this, translation);
			}

			stripReplyPreviewOriginalSuffix (content) {
				return translationDisplayLogic.stripReplyPreviewOriginalSuffix(this, content);
			}

			getStableReplyPreviewOriginalContent (message) {
				return translationDisplayLogic.getStableReplyPreviewOriginalContent(this, message);
			}

			getStableReplyPreviewMessage (message) {
				return translationDisplayLogic.getStableReplyPreviewMessage(this, message);
			}

			getReplyPreviewFallbackContent (message) {
				return translationDisplayLogic.getReplyPreviewFallbackContent(this, message);
			}
			getReplyPreviewDisplayContentForMessage (message, channelId = null) {
				return translationDisplayLogic.getReplyPreviewDisplayContentForMessage(this, message, channelId);
			}

			tagReplyPreviewRenderNode (node) {
				if (node == null) return node;
				if (BDFDB.ArrayUtils.is(node)) return node.map(child => this.tagReplyPreviewRenderNode(child));
				const isValidElement = BDFDB.ReactUtils && typeof BDFDB.ReactUtils.isValidElement == "function" ? BDFDB.ReactUtils.isValidElement(node) : !!(node && typeof node == "object" && node.props);
				if (!isValidElement || !node.props) return node;

				const props = Object.assign({}, node.props);
				const className = typeof props.className == "string" ? props.className : "";
				const lowerClassName = className.toLowerCase();
				const extraClasses = [];

				if (lowerClassName.includes("reply") || lowerClassName.includes("replied") || lowerClassName.includes("referenced")) extraClasses.push("translator-reply-preview-body");
				if (lowerClassName.includes("repliedtext") || lowerClassName.includes("replycontent") || lowerClassName.includes("messagecontent")) {
					extraClasses.push("translator-reply-preview-text");
					props.style = Object.assign({}, props.style, {
						whiteSpace: "pre-wrap",
						overflow: "visible",
						textOverflow: "unset",
						maxHeight: "none",
						height: "auto",
						display: "block",
						WebkitLineClamp: "unset",
						lineClamp: "unset"
					});
					if (typeof props.children == "string") props.children = props.children.replace(/\n+/g, "\n");
				}
				if (extraClasses.length) props.className = BDFDB.DOMUtils.formatClassName(className, ...extraClasses);
				if (props.children != null) props.children = this.tagReplyPreviewRenderNode(props.children);
				return BDFDB.ReactUtils.createElement(node.type, Object.assign({}, props, {key: node.key, ref: node.ref}));
			}

			queueReplyPreviewTranslation (message, channelId, contextOptions = {}) {
				if (!message || !message.id || !channelId || this.ensureReceivedDisplayRuntime().isPreviewPending(message.id)) return;
				const baseMessage = contextOptions.baseMessage || null;
				if (baseMessage && !this.shouldAutoTranslateReplyPreview(baseMessage, message, channelId)) return;
				if (this.ensureReceivedDisplayRuntime().isSuppressed(message.id)) return;
				if (!this.isTranslationEnabled(channelId) || this.isOwnMessage(message)) return;
				const originalContent = (message.content || "").trim();
				if (!originalContent) return;
				const signature = this.createReplyPreviewSignature(message, channelId, originalContent);
				const existingTranslation = this.ensureReceivedDisplayRuntime().getPreviewTranslation(message.id);
				if (existingTranslation && existingTranslation.signature == signature) return;
				const cachedTranslation = this.getCachedReceivedTranslation(message, channelId);
				if (cachedTranslation) {
					const previewTranslation = this.createReplyPreviewTranslationData(message, channelId, cachedTranslation);
					if (previewTranslation) {const previewCommit = this.ensureReceivedDisplayRuntime().commitPreviewResult({messageId: message.id, channelId, signature, translation: previewTranslation}); if (previewCommit && previewCommit.catch) previewCommit.catch(_ => {});}
					return;
				}
				const request = this.ensureReceivedDisplayRuntime().markPreviewPending({messageId: message.id, channelId, signature});
				this.translateText(originalContent, messageTypes.RECEIVED, (translation, input, output) => {
					if (!pluginRuntimeActive || !this.ensureReceivedDisplayRuntime().releasePreviewPending(message.id, request)) return;
					if (this.createReplyPreviewSignature(message, channelId, (message.content || "").trim()) != signature) return;
					if (baseMessage && !this.shouldAutoTranslateReplyPreview(baseMessage, message, channelId)) return;
					if (!this.isTranslationEnabled(channelId)) return;
					if (translation) {
						const previewCommit = this.ensureReceivedDisplayRuntime().commitPreviewResult({messageId: message.id, channelId, signature, translation: {
							signature,
							channelId,
							auto: true,
							translatedContent: (translation || "").trim(),
							originalContent,
							input,
							output
						}}); if (previewCommit && previewCommit.catch) previewCommit.catch(_ => {});
					}
				}, null, {
					showToast: false,
					showFailureToast: false,
					trackBusy: false,
					channelId
				});
			}
			resetAutoTranslationTracking (channelId = null) {this.ensureHistoricalSourceRuntime().advanceGeneration(channelId); return this.ensureLiveTranslationQueue().resetTracking(channelId);}
			getAutoTranslationChannelState (channelId) {return this.ensureLiveTranslationQueue().getChannelState(channelId);}
			prepareAutoTranslationChannelSession (channelId) {this.ensureHistoricalSourceRuntime().handleChannelSessionChange(this.ensureLiveTranslationQueue().getLastChannelId(), channelId); return this.ensureLiveTranslationQueue().prepareChannelSession(channelId);}

			ensureHistoricalSourceRuntime () {
				if (!this.historicalSourceRuntimeInstance) this.historicalSourceRuntimeInstance = createPluginHistoricalSourceRuntime({plugin: this, BDFDB, getCurrentBatchNumber: channelId => loadedTranslationStatusStore.getCurrentBatchNumber(channelId), debugProbe: secondDebugProbe});
				return this.historicalSourceRuntimeInstance;
			}
			getHistoricalMessageSourceGeneration (channelId) {return this.ensureHistoricalSourceRuntime().getGeneration(channelId);}
			advanceHistoricalMessageSourceGeneration (channelId = null) {return this.ensureHistoricalSourceRuntime().advanceGeneration(channelId);}

			compareMessageIds (messageIdA, messageIdB) {
				if (!messageIdA && !messageIdB) return 0;
				if (!messageIdA) return -1;
				if (!messageIdB) return 1;
				try {
					const comparableA = BigInt(messageIdA);
					const comparableB = BigInt(messageIdB);
					if (comparableA == comparableB) return 0;
					return comparableA > comparableB ? 1 : -1;
				}
				catch (err) {
					const normalizedA = String(messageIdA);
					const normalizedB = String(messageIdB);
					if (normalizedA == normalizedB) return 0;
					if (normalizedA.length != normalizedB.length) return normalizedA.length > normalizedB.length ? 1 : -1;
					return normalizedA > normalizedB ? 1 : -1;
				}
			}

			getNewestMessageId (currentMessageId, candidateMessageId) {
				return this.compareMessageIds(candidateMessageId, currentMessageId) > 0 ? candidateMessageId : currentMessageId;
			}

			isMessageIdNewer (messageId, referenceMessageId) {
				if (!messageId) return false;
				if (!referenceMessageId) return true;
				return this.compareMessageIds(messageId, referenceMessageId) > 0;
			}

			clearAutoTranslationEligibleReplyPreviewMessages (channelId = null) {
								this.ensureReceivedDisplayRuntime().clearPreviewEligibility(channelId);
			}

			markAutoTranslationEligibleReplyPreviewMessage (channelId, messageId) {
				if (!channelId || !messageId) return;
								this.ensureReceivedDisplayRuntime().markPreviewEligible(channelId, messageId);
			}

			isAutoTranslationEligibleReplyPreviewMessage (channelId, messageId) {
				return this.ensureReceivedDisplayRuntime().isPreviewEligible(channelId, messageId);
			}

			markReplyPreviewRenderMessage (message, {channelId = null, hostMessageId = null} = {}) {
				if (message && message.id && channelId && hostMessageId) this.ensureReceivedDisplayRuntime().markPreviewHost(channelId, message.id, hostMessageId);
				if (message && typeof message == "object") {
					try {message.__DiscordAITranslatorReplyPreview = true;} catch (err) {}
				}
			}

			isRenderingReplyPreviewMessage (message) {
				return !!(message && typeof message == "object" && message.__DiscordAITranslatorReplyPreview);
			}

			pauseHistoricalAutoTranslationForNavigation (duration = 1800) {
				return this.ensureMessageViewportStore().pauseForNavigation(duration);
			}

			wrapReplyPreviewJumpPause (node) {
				if (node == null) return node;
				if (BDFDB.ArrayUtils.is(node)) return node.map(child => this.wrapReplyPreviewJumpPause(child));
				const isValidElement = BDFDB.ReactUtils && typeof BDFDB.ReactUtils.isValidElement == "function" ? BDFDB.ReactUtils.isValidElement(node) : !!(node && typeof node == "object" && node.props);
				if (!isValidElement || !node.props) return node;
				const props = Object.assign({}, node.props);
				const oldMouseDownCapture = props.onMouseDownCapture;
				const oldClickCapture = props.onClickCapture;
				const pause = event => {
					this.pauseHistoricalAutoTranslationForNavigation(1800);
				};
				props.onMouseDownCapture = event => {
					pause(event);
					if (typeof oldMouseDownCapture == "function") oldMouseDownCapture(event);
				};
				props.onClickCapture = event => {
					pause(event);
					if (typeof oldClickCapture == "function") oldClickCapture(event);
				};
				return BDFDB.ReactUtils.createElement(node.type, Object.assign({}, props, {key: node.key, ref: node.ref}));
			}

			stripTranslatorStylingFromReplyPreviewNode (node) {
				if (node == null) return node;
				if (BDFDB.ArrayUtils.is(node)) return node.map(child => this.stripTranslatorStylingFromReplyPreviewNode(child)).filter(Boolean);
				const isValidElement = BDFDB.ReactUtils && typeof BDFDB.ReactUtils.isValidElement == "function" ? BDFDB.ReactUtils.isValidElement(node) : !!(node && typeof node == "object" && node.props);
				if (!isValidElement || !node.props) return node;
				const props = Object.assign({}, node.props);
				if (typeof props.className == "string") props.className = props.className
					.split(/\s+/)
					.filter(className => className && className.toLowerCase().indexOf("translator") == -1)
					.join(" ");
				if (props.style) {
					props.style = Object.assign({}, props.style);
					delete props.style["--translator-accent-color"];
					delete props.style["--translator-text-color"];
					delete props.style.color;
					delete props.style.background;
					delete props.style.backgroundColor;
					delete props.style.borderLeft;
				}
				if (props.children != null) {
					const children = BDFDB.ArrayUtils.is(props.children) ? props.children : [props.children];
					props.children = children
						.filter(child => !this.isTranslatorInjectedElement(child))
						.map(child => this.stripTranslatorStylingFromReplyPreviewNode(child));
				}
				return BDFDB.ReactUtils.createElement(node.type, Object.assign({}, props, {key: node.key, ref: node.ref}));
			}

			shouldAutoTranslateReplyPreview (baseMessage, referencedMessage, channelId) {
				if (!this.settings.general.showOriginalInReplyPreview) return false;
				if (!channelId || !baseMessage || !baseMessage.id || !referencedMessage || !referencedMessage.id) return false;
				if (!this.isTranslationEnabled(channelId)) return false;
				if (this.isOwnMessage(baseMessage) || this.isOwnMessage(referencedMessage)) return false;
				if (this.ensureReceivedDisplayRuntime().isSuppressed(referencedMessage.id)) return false;
				if (this.getReceivedAutoTranslateScope() == "loaded_messages") return this.isMessageWithinLoadedRange(baseMessage);
				return this.isAutoTranslationEligibleReplyPreviewMessage(channelId, baseMessage.id);
			}

			getMessagesScroller () {
				return this.ensureMessageViewportStore().getMessagesScroller();
			}

			extractMessageIdFromElement (element) {
				return this.ensureMessageViewportStore().extractMessageIdFromElement(element);
			}

			findMessageElementById (messageId) {
				return this.ensureMessageViewportStore().findMessageElementById(messageId);
			}

			findVisibleMessageAnchorElement (messagesScroller = null) {
				return this.ensureMessageViewportStore().findVisibleMessageAnchor(messagesScroller);
			}

			captureMessageAnchorState (messageId = null) {
				return this.ensureMessageViewportStore().captureAnchorState(messageId);
			}

			restoreMessageAnchorPosition (anchorState) {
				return this.ensureMessageViewportStore().restoreAnchorPosition(anchorState);
			}

			restoreMessageAnchorState (anchorState) {
				return this.ensureMessageViewportStore().restoreAnchorState(anchorState);
			}

			lockManualTranslationScroll (messageId) {
				return this.ensureMessageViewportStore().lockManualScroll(messageId);
			}

			getActiveManualTranslationScrollAnchor () {
				return this.ensureMessageViewportStore().getActiveManualScrollAnchor();
			}

			captureMessageScrollerState () {
				return this.ensureMessageViewportStore().captureScrollerState();
			}

			restoreMessageScrollerState (scrollerState) {
				return this.ensureMessageViewportStore().restoreScrollerState(scrollerState);
			}

			rerenderMessagesWithScrollPreserved () {
				this.attachAutoTranslationScrollWatcher();
				const manualAnchor = this.getActiveManualTranslationScrollAnchor();
				const scrollerState = manualAnchor ? null : this.captureMessageScrollerState();
				BDFDB.MessageUtils.rerenderAll(true);
				if (manualAnchor) this.restoreMessageAnchorState(manualAnchor);
				else this.restoreMessageScrollerState(scrollerState);
			}

			getLoadedAutoTranslationStatusText (status) {
				return loadedTranslationStatusStore.getStatusText(status);
			}
			getLoadedAutoTranslationStatusDetailText (status) {
				return loadedTranslationStatusStore.getStatusDetailText(status);
			}

			getLoadedAutoTranslationSkipReasonText (reason) {
				return this.ensureLoadedStatusCapsuleController().getSkipReasonText(reason);
			}

			getLoadedAutoTranslationPreviewText (text) {
				return loadedTranslationStatusStore.getPreviewText(text);
			}

			getLoadedAutoTranslationStatusTitleText (status) {
				return this.ensureLoadedStatusCapsuleController().getTitleText(status);
			}

			getAutoTranslatedResultRejectReason (translation, channelId) {
				return receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(this, translation, channelId);
			}

			getReceivedAutoTranslateSkipReason (originalContentData, channelId) {
				return receivedMessageFilterRuntime.getReceivedAutoTranslateSkipReason(this, originalContentData, channelId);
			}

			getLoadedAutoTranslationInlineStatusText (channelId = null) {
				return loadedTranslationStatusStore.getInlineStatusText(channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId());
			}

			updateInlineLoadedAutoTranslationStatusElements () {
				this.ensureLoadedStatusCapsuleController().updateInlineElements();
			}

			isTranslateMasterSwitchVisuallyEnabled (channelId) {
				if (!channelId || !this.isTranslationEnabled(channelId)) return false;
				if (typeof document == "undefined") return false;
				let buttons = [];
				try {
					const selector = [BDFDB.dotCN && BDFDB.dotCN._translatortranslatebutton, BDFDB.disCN && "." + BDFDB.disCN._translatortranslatebutton].filter(Boolean).join(",");
					buttons = selector ? Array.from(document.querySelectorAll(selector)) : [];
				}
				catch (err) {buttons = [];}
				if (!buttons.length) return false;
				return buttons.some(button => button && button.classList && button.classList.contains(BDFDB.disCN._translatortranslating));
			}

			positionLoadedAutoTranslationStatusElement (element) {
				loadedStatusPosition.positionLoadedStatusElement({BDFDB, document: typeof document != "undefined" ? document : null, window: typeof window != "undefined" ? window : null, element});
			}

			isChannelTextAreaFocused () {
				return this.ensureMessageViewportStore().isChannelTextAreaFocused();
			}

			ensureLoadedAutoTranslationStatusPositionWatcher () {
				this.ensureLoadedStatusCapsuleController().ensurePositionWatcher();
			}

			detachLoadedAutoTranslationStatusPositionWatcher () {
				this.ensureLoadedStatusCapsuleController().detachPositionWatcher();
			}

			isTranslatorSettingsSurfaceOpen () {
				if (typeof document == "undefined") return false;
				try {
					// Only this plugin's own settings/quick panels should hide the floating status.
					// Generic Discord settings containers can remain in the DOM after closing and were hiding the capsule.
					return !!document.querySelector(".translator-settings-panel-root");
				}
				catch (err) {return false;}
			}

			removeLoadedAutoTranslationStatusElement () {
				this.ensureLoadedStatusCapsuleController().removeElement();
			}

			shouldShowLoadedAutoTranslationStatus (status) {
				return this.ensureLoadedStatusCapsuleController().shouldShow(status);
			}

			// The capsule controller owns the floating status DOM (element, watcher,
			// timers). The hooks route its collaborator calls back through the plugin
			// methods below, which is where tests have always placed their stubs.
			ensureLoadedStatusCapsuleController () {
				if (!this.loadedStatusCapsuleControllerInstance) this.loadedStatusCapsuleControllerInstance = createLoadedStatusCapsuleController({
					store: loadedTranslationStatusStore,
					getSelectedChannelId: () => BDFDB.LibraryStores.SelectedChannelStore.getChannelId(),
					isTranslationEnabled: channelId => this.isTranslationEnabled(channelId),
					getReceivedAutoTranslateScope: () => this.getReceivedAutoTranslateScope(),
					isChineseUiLanguage: () => this.isChineseUiLanguage(),
					positionElement: element => this.positionLoadedAutoTranslationStatusElement(element),
					clearHistoricalTracker: () => historicalDisplayTracker.clear(),
					hooks: {
						attachScrollWatcher: () => this.attachAutoTranslationScrollWatcher(),
						ensurePositionWatcher: () => this.ensureLoadedAutoTranslationStatusPositionWatcher(),
						removeElement: () => this.removeLoadedAutoTranslationStatusElement(),
						updateInlineElements: () => this.updateInlineLoadedAutoTranslationStatusElements(),
						positionElement: element => this.positionLoadedAutoTranslationStatusElement(element),
						onRetry: channelId => this.retryFailedHistoricalTranslations(channelId)
					}
				});
				return this.loadedStatusCapsuleControllerInstance;
			}

			updateLoadedAutoTranslationStatus (updates = {}) {
				this.ensureLoadedStatusCapsuleController().update(updates);
			}

			clearLoadedAutoTranslationStatus () {
				this.ensureLoadedStatusCapsuleController().clear();
			}

			scheduleTranslationRerender (options = {}) {
				this.ensureReceivedDisplayRepaintScheduler().scheduleFullRepaint(options);
			}

			flushDeferredTranslationRerender () {
				this.ensureReceivedDisplayRepaintScheduler().flushDeferredFullRepaint();
			}

			getDisplayedTranslationChannelId (messageId) {
				if (!messageId) return null;
				const channelRecord = this.ensureReceivedDisplayRuntime().getDisplayState(messageId);
				const translation = channelRecord && channelRecord.translation;
				if (translation && translation.channelId) return translation.channelId;
				const channelArchive = this.ensureReceivedDisplayRuntime().peekSourceArchive(messageId);
				if (channelArchive && channelArchive.message.channel_id) return channelArchive.message.channel_id;
				const displayView = this.getReceivedDisplayRuntimeView(messageId);
				return displayView && displayView.channelId || null;
			}

			getMessageChannelId (message, fallbackChannelId = null) {
				return message && (message.channel_id || message.channelId) || fallbackChannelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
			}

			createLiveTranslationRequest (message, channelId, originalContentData = null, signature = null) {
				return this.ensureLiveTranslationQueue().createRequest(message, channelId, originalContentData, signature);
			}

			isLiveTranslationRequestCurrent (request, message = null) {
				return this.ensureLiveTranslationQueue().isRequestCurrent(request, message);
			}

			finishLiveTranslationRequest (request) {
				return this.ensureLiveTranslationQueue().finishRequest(request);
			}

			invalidateLiveTranslationRequests (channelId = null) {
				return this.ensureLiveTranslationQueue().invalidateRequests(channelId);
			}

			invalidateLiveTranslationMessage (messageId, channelId, currentSignature) {
				return this.ensureLiveTranslationQueue().invalidateRequestForMessage(messageId, channelId, currentSignature);
			}

			clearAutoTranslationQueue (channelId = null, options = {}) {
				// The queue module owns the queue itself; the surrounding cancellations are
				// cross-feature and stay here.
				this.advanceHistoricalMessageSourceGeneration(channelId);
				this.cancelHistoricalTranslationJobs(channelId, channelId ? "channel-queue-cleared" : "all-queues-cleared");
				this.cancelPendingChannelTitleTranslation(channelId);
				this.invalidateSentAutomaticTranslationRequests(channelId);
				this.ensureLiveTranslationQueue().clearQueue(channelId);
				if (!channelId) {
					if (!options.preservePreviews) this.ensureReceivedDisplayRuntime().clearPreviews(null);
					this.ensureReceivedDisplayRuntime().clearPreviewEligibility(null);
					loadedTranslationStatusStore.resetSeen(null);
					this.clearLoadedAutoTranslationStatus();
					return;
				}
				if (!options.preservePreviews) this.ensureReceivedDisplayRuntime().clearPreviews(channelId);
				this.ensureReceivedDisplayRuntime().clearPreviewEligibility(channelId);
				loadedTranslationStatusStore.resetSeen(channelId);
				if (loadedTranslationStatusStore.isForChannel(channelId)) this.clearLoadedAutoTranslationStatus();
			}

			clearDisplayedTranslations (channelId = null) {
				for (const record of this.ensureReceivedDisplayRuntime().listTranslated()) {
					if (channelId && this.getDisplayedTranslationChannelId(record.messageId) != channelId) continue;
					this.clearDisplayedTranslationState(record.messageId);
				}
				this.ensureReceivedDisplayRuntime().clearPreviews(channelId);
			}

			clearDisplayedAutoTranslations (channelId = null, options = {}) {
				for (const record of this.ensureReceivedDisplayRuntime().listTranslated()) {
					// A channel disable passes includeManual so its restore covers manual paints too.
					if (!record.translation || (!record.translation.auto && !(options && options.includeManual))) continue;
					if (channelId && this.getDisplayedTranslationChannelId(record.messageId) != channelId) continue;
					this.clearDisplayedTranslationState(record.messageId);
				}
				for (const record of this.ensureReceivedDisplayRuntime().listPreviewed()) {
					if (!record.preview || !record.preview.auto) continue;
					if (channelId && record.preview.channelId != channelId) continue;
					this.ensureReceivedDisplayRuntime().clearPreview(record.messageId);
				}
				this.clearChannelTitleTranslations(channelId);
			}

			applyStoredTranslationToMessage (message, translation, originalContentData = null) {
				return translationDisplayLogic.applyStoredTranslationToMessage(this, message, translation, originalContentData);
			}

			getMentionDisplayName (userId, message = null) {
				if (!userId) return null;
				const mentionUsers = message && (message.mentions || message.mentioned_users || message.referencedMessage && message.referencedMessage.mentions);
				if (Array.isArray(mentionUsers)) {
					const mentionUser = mentionUsers.find(user => user && String(user.id) == String(userId));
					if (mentionUser) return mentionUser.globalName || mentionUser.global_name || mentionUser.displayName || mentionUser.nick || mentionUser.username || mentionUser.name || null;
				}
				try {
					const user = BDFDB.LibraryStores.UserStore && BDFDB.LibraryStores.UserStore.getUser && BDFDB.LibraryStores.UserStore.getUser(userId);
					if (user) return user.globalName || user.global_name || user.displayName || user.username || user.name || null;
				}
				catch (err) {}
				return null;
			}

			restoreDiscordMentionTagsForDisplay (text, message = null) {
				if (typeof text != "string" || !text) return text;
				return text.replace(/<@!?(\d+)>/g, (fullMatch, userId) => {
					const displayName = this.getMentionDisplayName(userId, message);
					return displayName ? `@${displayName}` : fullMatch;
				});
			}

			clearDisplayedTranslationState (messageId, options = {}) {
				return translationDisplayLogic.clearDisplayedTranslationState(this, messageId, options);
			}

			getStoredTranslationChannelId (messageId, fallbackChannelId = null, translation = null) {
				return translationDisplayLogic.getStoredTranslationChannelId(this, messageId, fallbackChannelId, translation);
			}

			shouldDisplayStoredTranslation (translation, channelId = null) {
				return translationDisplayLogic.shouldDisplayStoredTranslation(this, translation, channelId);
			}

			getStoredTranslationOriginalContent (translation, fallbackContent = "") {
				return translationDisplayLogic.getStoredTranslationOriginalContent(this, translation, fallbackContent);
			}

			getActiveMessageTranslation (message, channelId = null, expectedSignature = null) {
				return translationDisplayLogic.getActiveMessageTranslation(this, message, channelId, expectedSignature);
			}

			getActiveReplyPreviewTranslation (message, channelId) {
				return translationDisplayLogic.getActiveReplyPreviewTranslation(this, message, channelId);
			}

			isMessageTranslationPending (messageId, channelId = null) {
				return this.isHistoricalMessagePending(messageId, channelId) || this.ensureLiveTranslationQueue().isMessageQueued(messageId);
			}

			applyMessageContentRenderDecorations (e, message, translation) {
				return translationDisplayLogic.applyMessageContentRenderDecorations(this, e, message, translation);
			}

			getReceivedAutoTranslateScope () {
				return loadedAutoTranslatePolicy.getReceivedAutoTranslateScope(this);
			}

			getReceivedAutoTranslateLoadedRangeMode () {
				return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedRangeMode(this);
			}

			getReceivedAutoTranslateLoadedTimeWindow () {
				return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindow(this);
			}

			getReceivedAutoTranslateLoadedLimit () {
				return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedLimit(this);
			}

			shouldPauseLoadedAutoTranslateWhileScrolling () {
				return loadedAutoTranslatePolicy.shouldPauseLoadedAutoTranslateWhileScrolling(this);
			}

			shouldContinueLoadedAutoTranslateOnScroll () {
				return loadedAutoTranslatePolicy.shouldContinueLoadedAutoTranslateOnScroll(this);
			}

			getReceivedAutoTranslateLoadedTimeWindowMs () {
				return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindowMs(this);
			}

			getMessageTimestampMs (message) {
				if (!message) return null;
				const normalizeTimestamp = value => {
					if (!value) return null;
					if (value instanceof Date) return value.getTime();
					if (typeof value == "number" && isFinite(value)) return value > 1000000000000 ? value : value * 1000;
					if (typeof value == "string") {
						const parsed = Date.parse(value);
						if (isFinite(parsed)) return parsed;
					}
					if (value && value._d instanceof Date) return value._d.getTime();
					if (value && typeof value.valueOf == "function") {
						const primitive = value.valueOf();
						if (typeof primitive == "number" && isFinite(primitive)) return primitive > 1000000000000 ? primitive : primitive * 1000;
					}
					return null;
				};
				const directTimestamp = normalizeTimestamp(message.timestamp || message.createdAt || message.created_at);
				if (directTimestamp) return directTimestamp;
				if (message.id) {
					try {return Number((BigInt(message.id) >> 22n) + BigInt(DISCORD_EPOCH));}
					catch (err) {}
				}
				return null;
			}

			isMessageWithinLoadedTimeWindow (message) {
				const windowMs = this.getReceivedAutoTranslateLoadedTimeWindowMs();
				if (!windowMs) return true;
				const timestampMs = this.getMessageTimestampMs(message);
				if (!timestampMs) return true;
				return Date.now() - timestampMs <= windowMs;
			}

			isMessageWithinLoadedRange (message) {
				if (this.getReceivedAutoTranslateLoadedRangeMode() == LOADED_AUTO_TRANSLATE_RANGE_MODES.TIME) return this.isMessageWithinLoadedTimeWindow(message);
				return true;
			}

			isLikelyLiveAutoTranslateMessage (message, channelId = null) {
				if (!message || !message.id) return false;
				channelId = channelId || this.getMessageChannelId(message);
				const channelState = this.getAutoTranslationChannelState(channelId);
				// Hard rule: in loaded-message mode, historical messages must not become "live"
				// just because their timestamp is recent. Live messages are identified by the
				// channel boundary only; this keeps loaded batches old-to-new and prevents flicker.
				return !!(channelState && this.isMessageIdNewer(message.id, channelState.boundaryMessageId));
			}

			shouldDeferInitialAutoTranslate (channelId) {
				if (!channelId || this.getReceivedAutoTranslateScope() == "loaded_messages") return false;
				const channelState = this.getAutoTranslationChannelState(channelId);
				return !!(channelState && !channelState.initialized);
			}

			attachAutoTranslationInputActivityWatcher () {
				return this.ensureMessageViewportStore().attachInputActivityWatcher();
			}

			detachAutoTranslationInputActivityWatcher () {
				return this.ensureMessageViewportStore().detachInputActivityWatcher();
			}

			finishAutoTranslationScrollActivity (channelId) {
				return this.ensureMessageViewportStore().finishScrollActivity(channelId);
			}

			attachAutoTranslationScrollWatcher () {
				return this.ensureMessageViewportStore().attachScrollWatcher();
			}

			detachAutoTranslationScrollWatcher () {
				return this.ensureMessageViewportStore().detachScrollWatcher();
			}

			isViewingMessageHistory () {
				return this.ensureMessageViewportStore().isViewingMessageHistory();
			}

			isUserActivelyScrollingMessages (channelId = null) {
				return this.ensureMessageViewportStore().isUserActivelyScrolling(channelId);
			}

			// The 429/5xx backoff window belongs to the provider client, which is what
			// opens it. These two delegated to receivedTranslationRuntime, which never
			// defined them, so every call threw.
			scheduleAutoTranslationBackoff (ms) {
				return this.ensureProviderClient().scheduleBackoff(ms);
			}

			awaitProviderBackoff () {
				return this.ensureProviderClient().awaitBackoff();
			}

			requestWithTimeout (url, options, callback, timeoutMs = 30000) {
				return this.ensureProviderClient().requestWithTimeout(url, options, callback, timeoutMs);
			}

			getReceivedAutoTranslateSourceLanguages () {
				return receivedSettingsPolicy.getReceivedAutoTranslateSourceLanguages(this);
			}

			getMinimumAutoTranslateLength () {
				return receivedSettingsPolicy.getMinimumAutoTranslateLength(this);
			}

			getAutoTranslateMinimumLengthForAnalysis (analysis = null) {
				return receivedSettingsPolicy.getAutoTranslateMinimumLengthForAnalysis(this, analysis);
			}

			getTranslationSimilarityThreshold () {
				return receivedSettingsPolicy.getTranslationSimilarityThreshold(this);
			}

			shouldTreatLanguageVariantsAsSame () {
				return receivedSettingsPolicy.shouldTreatLanguageVariantsAsSame(this);
			}

			shouldSkipMixedReceivedMessages () {
				return receivedSettingsPolicy.shouldSkipMixedReceivedMessages(this);
			}

			shouldSkipSameLanguageReceivedMessages () {
				return receivedSettingsPolicy.shouldSkipSameLanguageReceivedMessages(this);
			}

			useLocalLanguagePrecheck () {
				return receivedSettingsPolicy.useLocalLanguagePrecheck(this);
			}

			shouldDropSimilarTranslations () {
				return receivedSettingsPolicy.shouldDropSimilarTranslations(this);
			}

			getAutoTranslateDecisionMode () {
				return aiDecisionPolicy.getAutoTranslateDecisionMode(this);
			}

			supportsAiAutoTranslateDecisionEngine (engineKey) {
				return aiDecisionPolicy.supportsAiAutoTranslateDecisionEngine(this, engineKey);
			}

			isAiAutoTranslateDecisionAvailable (channelId = null) {
				return aiDecisionPolicy.isAiAutoTranslateDecisionAvailable(this, channelId);
			}

			shouldUseAiAutoTranslateDecision (channelId = null) {
				return aiDecisionPolicy.shouldUseAiAutoTranslateDecision(this, channelId);
			}

			getDefaultAiAutoTranslatePrompt () {
				return "输入语言：{{INPUT_LANGUAGE}}\n输出语言：{{OUTPUT_LANGUAGE}}\n\n只翻译消息中不是输出语言的自然语言内容，译成输出语言。已是输出语言的内容保持原样。\n\n短词、语气词、感叹词、笑声、重复词和单独一行仍属于有效聊天内容；只要它们不是输出语言，就必须翻译或按输出语言自然表达。不要因为内容很短而跳过或省略，例如 hi、ok、yes、no。\n\n保留原样：URL、IP、端口、@用户名、频道名、ID、代码、命令、表情、⟦0⟧/⟦1⟧ 等保护占位符。专有名词、产品名、模型名、游戏/技术术语默认保留；若在输出语言中有公认译名或官方译名，可使用该译名。\n\n禁止：把源语言同义改写成源语言；把已是输出语言的内容润色改写；解释原文。\n\n如果没有需要翻译的自然语言，或消息主要已是输出语言且只夹杂专名/缩写/技术词，只输出 __SKIP_TRANSLATION__。\n需要翻译时只输出处理后的消息。";
			}

			getLegacyAiAutoTranslatePrompts () {
				return [
					"任务：判断 Discord 收到消息是否需要翻译；需要时，只翻译非目标语言的自然语言内容。\n规则：\n1. 消息里存在非目标语言的自然语言内容：只翻译这些内容。\n2. 已经是目标语言的内容保持原样，不要重写、润色或改写。\n3. 专有名词、产品名、模型名、游戏术语、技术术语、URL、IP、端口、用户名、频道名、ID、代码、命令、表情符号保持原样。\n4. {{0}}、{{1}}、{{2}} 等保护占位符必须逐字保留，数量、顺序和位置不能改变。\n5. 如果消息只有链接、表情、用户名、数字、代码、命令、IP、端口、占位符，或没有需要翻译的自然语言内容，只输出 __SKIP_TRANSLATION__。\n6. 如果消息已经主要是目标语言，且只夹杂专有名词、产品名、英文缩写或技术词，只输出 __SKIP_TRANSLATION__。\n输出：需要翻译时只输出处理后的消息；不需要翻译时只输出 __SKIP_TRANSLATION__。不要解释，不要添加注释。",
					"任务：判断 Discord 收到消息是否需要翻译，并在需要时直接翻译成目标语言。\n规则：\n1. 主要自然语言已是目标语言：只输出 __SKIP_TRANSLATION__。\n2. 只有链接、表情、用户名、频道名、ID、数字、IP、端口、代码、命令或占位符：只输出 __SKIP_TRANSLATION__。\n3. 主要自然语言不是目标语言：翻译主要文本。\n4. 英文产品名、游戏术语、URL、IP、端口、用户名、表情不是“混合语言跳过”理由，保留即可。\n5. {{0}}、{{1}} 等保护占位符必须逐字保留，数量和顺序不能改变。\n输出：需要翻译时只输出译文；不需要翻译时只输出 __SKIP_TRANSLATION__。",
					"你是 Discord 聊天翻译判断器。判断这条收到的消息是否值得翻译成目标语言。\n需要翻译：主要内容不是目标语言；即使包含链接、表情、用户名、英文产品名、IP、端口、游戏术语，也不要因此跳过；混合少量英文关键词时，仍然翻译主要外语内容。\n不需要翻译：消息已经主要是目标语言；只有链接、表情、数字、代码、用户名；翻译后和原文几乎一样。\n保护占位符如 {{0}}、{{1}} 必须原样保留，不要改写。\n需要翻译时只输出译文；不需要翻译时只输出 __SKIP_TRANSLATION__。"
				];
			}

			getLanguagePromptName (languageData) {
				if (!languageData) return "";
				if (languageData.auto) return this.getCustomText("detect_language_label") || "Auto detect";
				return [languageData.name, languageData.ownlang, languageData.id].filter(Boolean).join(" / ");
			}

			getAiAutoTranslatePrompt (translationData = null) {
				const customPrompt = this.settings.filters && this.settings.filters.aiAutoTranslatePrompt;
				let prompt = this.getDefaultAiAutoTranslatePrompt();
				if (typeof customPrompt == "string" && customPrompt.trim()) {
					const trimmedPrompt = customPrompt.trim();
					if (!this.getLegacyAiAutoTranslatePrompts().some(legacyPrompt => trimmedPrompt == legacyPrompt.trim())) prompt = customPrompt;
				}
				if (!translationData) return prompt;
				const inputLanguage = this.getLanguagePromptName(translationData.input) || "Auto detect";
				const outputLanguage = this.getLanguagePromptName(translationData.output) || "Target language";
				return prompt
					.replace(/\{\{INPUT_LANGUAGE\}\}/g, inputLanguage)
					.replace(/\{\{OUTPUT_LANGUAGE\}\}/g, outputLanguage)
					.replace(/\{\{TARGET_LANGUAGE\}\}/g, outputLanguage);
			}

			isSkipTranslationSignal (translation) {
				return typeof translation == "string" && translation.trim().replace(/[。.!！\s]+$/g, "") == AI_SKIP_TRANSLATION_TOKEN;
			}

			getLanguageScriptFamilies (languageId) {
				languageId = this.normalizeLanguageId(languageId);
				if (!languageId) return [];
				if (languageId.startsWith("zh")) return ["han"];
				if (languageId == "ja") return ["han", "kana"];
				if (languageId == "ko") return ["hangul"];
				if (["ru", "uk", "bg", "be", "mk", "sr", "kk", "ky", "mn"].includes(languageId)) return ["cyrillic"];
				if (["ar", "fa", "ur", "ps", "sd", "ug"].includes(languageId)) return ["arabic"];
				if (languageId == "el") return ["greek"];
				if (["he", "iw", "yi"].includes(languageId)) return ["hebrew"];
				if (["hi", "mr", "ne"].includes(languageId)) return ["devanagari"];
				if (languageId == "th") return ["thai"];
				return ["latin"];
			}

			countScriptFamilies (text) {
				const counts = {
					han: 0,
					kana: 0,
					hangul: 0,
					cyrillic: 0,
					arabic: 0,
					greek: 0,
					hebrew: 0,
					devanagari: 0,
					thai: 0,
					latin: 0
				};
				for (const character of text || "") {
					const codePoint = character.codePointAt(0);
					if (codePoint >= 0x4E00 && codePoint <= 0x9FFF) counts.han++;
					else if ((codePoint >= 0x3040 && codePoint <= 0x30FF) || (codePoint >= 0x31F0 && codePoint <= 0x31FF)) counts.kana++;
					else if (codePoint >= 0xAC00 && codePoint <= 0xD7AF) counts.hangul++;
					else if (codePoint >= 0x0400 && codePoint <= 0x052F) counts.cyrillic++;
					else if (codePoint >= 0x0600 && codePoint <= 0x06FF) counts.arabic++;
					else if (codePoint >= 0x0370 && codePoint <= 0x03FF) counts.greek++;
					else if (codePoint >= 0x0590 && codePoint <= 0x05FF) counts.hebrew++;
					else if (codePoint >= 0x0900 && codePoint <= 0x097F) counts.devanagari++;
					else if (codePoint >= 0x0E00 && codePoint <= 0x0E7F) counts.thai++;
					else if ((codePoint >= 0x0041 && codePoint <= 0x007A) || (codePoint >= 0x00C0 && codePoint <= 0x024F)) counts.latin++;
				}
				return counts;
			}

			sanitizeTextForAutoTranslateAnalysis (text) {
				return (text || "")
					.replace(/```[\s\S]*?```/g, " ")
					.replace(/`[^`\r\n]+`/g, " ")
					.replace(/https?:\/\/\S+/gi, " ")
					.replace(/<a?:\w+:\d+>/g, " ")
					.replace(/<@!?\d+>|<#\d+>|<@&\d+>/g, " ")
					.replace(/\s+/g, " ")
					.trim();
			}

			analyzeTextForAutoTranslate (text, targetLanguageId) {
				const cleanedText = this.sanitizeTextForAutoTranslateAnalysis(text);
				const counts = this.countScriptFamilies(cleanedText);
				const latinWordCount = (cleanedText.match(/[A-Za-z][A-Za-z0-9._+-]*/g) || []).length;
				const hanRunCount = (cleanedText.match(/[\u4E00-\u9FFF]+/g) || []).length;
				const scriptEntries = Object.entries(counts).filter(([, count]) => count > 0).sort((entryA, entryB) => entryB[1] - entryA[1]);
				const totalLetters = scriptEntries.reduce((sum, [, count]) => sum + count, 0);
				const targetFamilies = this.getLanguageScriptFamilies(targetLanguageId);
				const targetLetterCount = targetFamilies.reduce((sum, family) => sum + (counts[family] || 0), 0);
				const nonTargetLetterCount = Math.max(0, totalLetters - targetLetterCount);
				const targetShare = totalLetters ? targetLetterCount / totalLetters : 0;
				const dominantEntry = scriptEntries[0] || ["", 0];
				const secondaryEntry = scriptEntries[1] || ["", 0];
				const dominantShare = totalLetters ? dominantEntry[1] / totalLetters : 0;
				const secondaryShare = totalLetters ? secondaryEntry[1] / totalLetters : 0;
				const isMixed = dominantEntry[1] >= 2 && secondaryEntry[1] >= 2 && dominantShare >= 0.2 && secondaryShare >= 0.2;
				const strongTargetScriptMatch = targetFamilies[0] != "latin" && targetLetterCount >= 3 && targetShare >= 0.65 && (!isMixed || nonTargetLetterCount <= Math.max(2, targetLetterCount * 0.35));
				return {
					cleanedText,
					counts,
					latinWordCount,
					hanRunCount,
					targetFamilies,
					totalLetters,
					targetLetterCount,
					nonTargetLetterCount,
					targetShare,
					dominantFamily: dominantEntry[0] || null,
					isMixed,
					strongTargetScriptMatch
				};
			}

			getLatinStopwordTables () {
				return languageHeuristicsRuntime.getLatinStopwordTables(this);
			}

			identifyLatinLanguage (text) {
				return languageHeuristicsRuntime.identifyLatinLanguage(this, text);
			}

			detectMessageLanguageLocal (text, analysis, targetLanguageId) {
				return languageHeuristicsRuntime.detectMessageLanguageLocal(this, text, analysis, targetLanguageId);
			}

			// Local high-confidence "this message is clearly a foreign language" check. Used by the
			// AI-decision safety net: when AI decision mode returns __SKIP_TRANSLATION__, this lets us
			// override the skip without any network call whenever the script family alone proves the
			// message is foreign (e.g. Latin-script message with a Han/Cyrillic/Arabic target).
			isClearlyForeignLanguageMessage (text, targetLanguageId) {
				return languageHeuristicsRuntime.isClearlyForeignLanguageMessage(this, text, targetLanguageId);
			}

			// Safety-net helper for received auto messages. Returns true when the message is foreign
			// (must be translated). First tier is the zero-network local check; second tier falls back
			// to Google gtx detection (covers latin-vs-latin the local check cannot). If gtx is
			// unreachable, the second tier resolves false so the caller honors the original skip.
			isReceivedMessageForeignAsync (text, targetLanguageId, callback) {
				return foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(this, text, targetLanguageId, callback);
			}

			isHanTargetMessageWithLatinTerms (analysis, targetLanguageId) {
				return languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(this, analysis, targetLanguageId);
			}

			isMostlyTargetLanguageMessage (analysis, targetLanguageId) {
				return languageHeuristicsRuntime.isMostlyTargetLanguageMessage(this, analysis, targetLanguageId);
			}

			isClearlyTargetLanguageMessage (analysis, targetLanguageId) {
				return languageHeuristicsRuntime.isClearlyTargetLanguageMessage(this, analysis, targetLanguageId);
			}

			shouldSkipReceivedTranslationBeforeRequest (originalContentData, channelId) {
				return receivedMessageFilterRuntime.shouldSkipReceivedTranslationBeforeRequest(this, originalContentData, channelId);
			}

			isTranslationLikelyInTargetLanguage (text, targetLanguageId) {
				return languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(this, text, targetLanguageId);
			}

			buildAutoTranslateAnalysisText (originalContentData) {
				return receivedMessageFilterRuntime.buildAutoTranslateAnalysisText(this, originalContentData);
			}

			isLinkOnlyReceivedContent (originalContentData) {
				return receivedMessageFilterRuntime.isLinkOnlyReceivedContent(this, originalContentData);
			}

			normalizeComparisonText (text) {
				return textSimilarityRuntime.normalizeComparisonText(this, text);
			}

			getTextSimilarityScore (textA, textB) {
				return textSimilarityRuntime.getTextSimilarityScore(this, textA, textB);
			}

			isSameLanguageOrVariant (languageA, languageB) {
				if (!languageA || !languageB) return false;
				const normalizedA = this.normalizeLanguageId(languageA);
				const normalizedB = this.normalizeLanguageId(languageB);
				if (normalizedA == normalizedB) return true;
				if (!this.shouldTreatLanguageVariantsAsSame()) return false;
				const rootA = normalizedA.split("-")[0];
				const rootB = normalizedB.split("-")[0];
				return rootA && rootA == rootB;
			}

			isTranslationResultTooSimilar (translation) {
				return receivedMessageFilterRuntime.isTranslationResultTooSimilar(this, translation);
			}

			shouldKeepAutoTranslatedResult (translation, channelId) {
				return receivedMessageFilterRuntime.shouldKeepAutoTranslatedResult(this, translation, channelId);
			}

			shouldAutoTranslateReceivedMessage (message, channel, originalContentData = null, ignoreQueued = false) {
				return receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(this, message, channel, originalContentData, ignoreQueued);
			}

			queueAutoTranslateMessage (message, channel, originalContentData = null, queueOptions = {}) {
				return this.ensureLiveTranslationQueue().queueMessage(message, channel, originalContentData, queueOptions);
			}
			createStoredReceivedTranslationData (message, channelId, originalContentData, signature, translation, input, output, auto = false) {
				if (!translation) return null;
				let strings = String(translation).split(/\n{0,1}__________________ __________________ __________________\n{0,1}/);
				let oldContent = (originalContentData && originalContentData.content || "").trim();
				let translatedContent = (strings.shift() || "").trim();
				const embeds = parseStoredEmbedTranslations({messageEmbeds: message && message.embeds, originalEmbeds: originalContentData && originalContentData.embeds, segments: strings});
				if (!translatedContent && !Object.keys(embeds).length) return null;
				let content = this.buildReceivedDisplayContent(translatedContent, oldContent);
				return {
					signature,
					channelId,
					auto: !!auto,
					content,
					translatedContent,
					originalContent: oldContent,
					embeds,
					input,
					output
				};
			}

			cloneHistoricalSourceMessage (message) {if (!message) return null; const clone = new BDFDB.DiscordObjects.Message(message); clone.embeds = (message.embeds || []).map(embed => Object.assign({}, embed, {fields: (embed.fields || []).map(field => Object.assign({}, field)), footer: embed.footer ? Object.assign({}, embed.footer) : embed.footer})); clone.attachments = (message.attachments || []).map(attachment => Object.assign({}, attachment)); clone.author = message.author ? Object.assign({}, message.author) : message.author; return clone;}

			buildInitialHistoricalTranslationSnapshot ({channelId, generation, renderedMessages = [], limit = 0} = {}) {return this.ensureHistoricalSourceRuntime().buildInitialHistoricalTranslationSnapshot({channelId, generation, renderedMessages, limit});}

			createHistoricalTranslationRetrySnapshot (item, channelId) {if (!item || !item.message || !item.message.id || !channelId) return null; return {message: this.cloneHistoricalSourceMessage(item.message), channel: Object.assign({}, item.channel || {}, {id: channelId}), originalContentData: this.cloneOriginalContentData(item.originalContentData || this.extractOriginalContentData(item.message)), historicalLoad: true, deferWhileReading: true, reason: item.reason || "provider_failed"};}

			updateFailedHistoricalTranslationSnapshots (summary, channelId) {
				if (!channelId) return 0;
				const existingEntry = this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId);
				const snapshotsById = new Map((existingEntry && existingEntry.items || []).map(item => [String(item.message.id), item]));
				for (const item of [].concat(summary && summary.translated || [], summary && summary.skipped || [])) {
					if (item && item.message && item.message.id) snapshotsById.delete(String(item.message.id));
				}
				for (const item of summary && summary.failed || []) {
					const snapshot = this.createHistoricalTranslationRetrySnapshot(item, channelId);
					if (snapshot) snapshotsById.set(String(snapshot.message.id), snapshot);
				}
				const items = [...snapshotsById.values()];
				if (items.length) this.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, {channelId, items, updatedAt: Date.now()});
				else this.ensureHistoricalJobRegistry().deleteFailedSnapshot(channelId);
				return items.length;
			}

			getFailedHistoricalTranslationCount (channelId) {
				const entry = channelId && this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId);
				return entry && entry.items ? entry.items.length : 0;
			}
			retryFailedHistoricalTranslations (channelId = null) {
				channelId = channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
				const failedEntry = channelId && this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId);
				if (!failedEntry || !failedEntry.items || !failedEntry.items.length || !this.isTranslationEnabled(channelId)) return Promise.resolve(false);
				const queueEntry = this.getHistoricalTranslationJobQueue(channelId, false);
				if (queueEntry && (queueEntry.runningPromise || queueEntry.jobs.some(job => job && job.state == "collecting"))) return Promise.resolve(false);
				const retryItems = failedEntry.items.slice(0, this.getReceivedAutoTranslateLoadedLimit());
				this.updateLoadedAutoTranslationStatus({
					active: true,
					collecting: true,
					done: false,
					channelId,
					batch: loadedTranslationStatusStore.getNextBatchNumber(channelId),
					total: retryItems.length,
					processed: 0,
					displayed: 0,
					skipped: 0,
					failed: 0,
					retryable: this.getFailedHistoricalTranslationCount(channelId),
					aiDropped: 0
				});
				let accepted = 0;
				for (const item of retryItems) if (this.collectHistoricalTranslationMessage(item)) accepted++;
				if (!accepted) {
					const failedCount = this.getFailedHistoricalTranslationCount(channelId);
					this.updateLoadedAutoTranslationStatus({active: false, collecting: false, done: true, channelId, failed: 0, retryable: failedCount, aiDropped: 0});
					return Promise.resolve(false);
				}
				return Promise.resolve(this.startCollectedHistoricalTranslationJobs(channelId)).then(_ => true);
			}

			getHistoricalTranslationJobQueue (channelId, create = true) {
				return this.ensureHistoricalJobRegistry().getQueue(channelId, create);
			}

			createCollectedHistoricalTranslationJob (channelId) {
				const entry = this.getHistoricalTranslationJobQueue(channelId);
				entry.generation++;
				let job;
				job = this.createHistoricalTranslationJob({
					id: this.ensureHistoricalJobRegistry().nextJobId(channelId),
					channelId,
					generation: entry.generation,
					configurationSignature: this.createHistoricalTranslationJobConfigurationSignature(channelId),
					repairBatchSize: 10,
					dependencies: {
						prepare: source => this.prepareHistoricalTranslationJobItem(source, job),
						translateBatch: preparedItems => this.translateHistoricalTranslationJobBatch(preparedItems, job),
						repairBatch: preparedItems => this.repairHistoricalTranslationJobBatch(preparedItems, job),
						validate: (prepared, rawTranslation) => this.validateHistoricalTranslationJobResult(prepared, rawTranslation, job),
						repair: prepared => this.repairHistoricalTranslationJobItem(prepared, job),
						waitForCommit: () => this.waitForHistoricalTranslationCommit(job),
						isCurrent: () => this.isHistoricalTranslationJobCurrent(job),
						commit: summary => this.commitHistoricalTranslationJob(summary, job),
						onStateChange: () => this.updateHistoricalTranslationJobStatus(job)
					}
				});
				entry.jobs.push(job);
				return job;
			}

			collectHistoricalTranslationMessage (queueItem) {
				if (!queueItem || !queueItem.message || !queueItem.channel || !queueItem.channel.id) return false;
				const channelId = queueItem.channel.id;
				if (!this.isTranslationEnabled(channelId)) return false;
				const entry = this.getHistoricalTranslationJobQueue(channelId); if (entry.intakeBlocked) return false;
				let job = entry.jobs[entry.jobs.length - 1];
				if (job && job.state == "collecting" && !job.sealed && job.items.size >= this.getReceivedAutoTranslateLoadedLimit()) return false;
				if (!job || job.state != "collecting" || job.sealed) job = this.createCollectedHistoricalTranslationJob(channelId);
				if (!job.add(queueItem)) return false;
				this.ensureLiveTranslationQueue().markMessageQueued(queueItem.message.id, {type: "historical", channelId, jobId: job.id});
				if (job.items.size >= this.getReceivedAutoTranslateLoadedLimit()) { entry.intakeBlocked = true; this.finishHistoricalTranslationSnapshot(channelId); const reopen = () => { if (this.ensureHistoricalJobRegistry().isCurrentQueue(channelId, entry)) entry.intakeBlocked = false; }; if (typeof queueMicrotask == "function") queueMicrotask(reopen); else Promise.resolve().then(reopen); } else if (!queueItem.deferHistoricalSnapshotStart) this.scheduleHistoricalTranslationJobStart(channelId);
				return true;
			}

			scheduleHistoricalTranslationJobStart (channelId) {
				const entry = this.getHistoricalTranslationJobQueue(channelId, false);
				if (!entry || entry.startToken) return;
				const token = {};
				entry.startToken = token;
				const startSnapshot = _ => {
					if (entry.startToken !== token || !this.ensureHistoricalJobRegistry().isCurrentQueue(channelId, entry)) return;
					entry.startToken = null;
					this.finishHistoricalTranslationSnapshot(channelId);
				};
				if (typeof queueMicrotask == "function") queueMicrotask(startSnapshot);
				else Promise.resolve().then(startSnapshot);
			}

			finishHistoricalTranslationSnapshot (channelId) {
				const entry = this.getHistoricalTranslationJobQueue(channelId, false);
				if (!entry) return false;
				const job = [...entry.jobs].reverse().find(candidate => candidate && candidate.state == "collecting" && !candidate.sealed);
				if (!job) return false;
				job.seal();
				if (!entry.runningPromise && !entry.pendingLiveHandoffTicket) this.startCollectedHistoricalTranslationJobs(channelId, {sealCurrent: false});
				return true;
			}
			startCollectedHistoricalTranslationJobs (channelId, options = {}) {
				const entry = this.getHistoricalTranslationJobQueue(channelId, false);
				if (!entry) return Promise.resolve(null);
				const config = Object.assign({sealCurrent: true}, options);
				entry.startToken = null;
				if (entry.runningPromise || entry.pendingLiveHandoffTicket) return entry.runningPromise || Promise.resolve(null);
				let job = entry.jobs.find(candidate => candidate && candidate.state == "collecting" && candidate.sealed);
				if (!job && config.sealCurrent) { job = entry.jobs.find(candidate => candidate && candidate.state == "collecting"); if (job) job.seal(); }
				if (!job) return Promise.resolve(null);
				job.lastConsumedLiveRequestTicketAtStart = this.ensureLiveTranslationQueue().getLastConsumedLiveRequestTicket(channelId);
				const runningPromise = Promise.resolve(job.start()).finally(_ => {
					for (const record of job.items.values()) {
						const messageId = record && record.source && record.source.message && record.source.message.id;
						const queuedMarker = messageId && this.ensureLiveTranslationQueue().getQueuedMarker(messageId);
						if (queuedMarker && queuedMarker.type == "historical" && queuedMarker.jobId == job.id) this.ensureLiveTranslationQueue().clearQueuedMessage(messageId);
					}
					if (entry.runningPromise == runningPromise) entry.runningPromise = null;
					entry.jobs = entry.jobs.filter(candidate => candidate != job);
					if (entry.jobs.some(candidate => candidate && candidate.state == "collecting" && candidate.sealed)) { const liveQueue = this.ensureLiveTranslationQueue(), consumedTicket = liveQueue.getLastConsumedLiveRequestTicket(channelId);
						if (consumedTicket && consumedTicket != job.lastConsumedLiveRequestTicketAtStart) { entry.pendingLiveHandoffTicket = null; this.startCollectedHistoricalTranslationJobs(channelId, {sealCurrent: false}); } else { const pendingTicket = liveQueue.reserveQueuedLiveRequest(channelId); if (!pendingTicket) { entry.pendingLiveHandoffTicket = null; this.startCollectedHistoricalTranslationJobs(channelId, {sealCurrent: false}); } else entry.pendingLiveHandoffTicket = pendingTicket; } }
					else if (!entry.jobs.length && !entry.startToken && this.ensureHistoricalJobRegistry().isCurrentQueue(channelId, entry)) this.ensureHistoricalJobRegistry().deleteQueue(channelId);
				});
				entry.runningPromise = runningPromise;
				return runningPromise;
			}
			async waitForHistoricalTranslationJobs (channelId) {
				while (true) {
					const entry = this.getHistoricalTranslationJobQueue(channelId, false);
					if (!entry) return;
					if (!entry.runningPromise && entry.jobs.length && !entry.pendingLiveHandoffTicket) this.startCollectedHistoricalTranslationJobs(channelId);
					if (!entry.runningPromise) return;
					await entry.runningPromise;
				}
			}

			isHistoricalMessagePending (messageId, channelId = null) {
				if (!messageId) return false;
				const entries = channelId ? [this.getHistoricalTranslationJobQueue(channelId, false)].filter(Boolean) : this.ensureHistoricalJobRegistry().listQueues();
				return entries.some(entry => entry.jobs.some(job => job.isMessagePending(messageId)));
			}

			invalidateHistoricalTranslationMessage (messageId, channelId, currentSignature) {
				if (!messageId || !channelId || !currentSignature) return false;
				const entry = this.getHistoricalTranslationJobQueue(channelId, false);
				let invalidated = false;
				for (const job of entry && entry.jobs || []) {
					const record = job && job.items.get(String(messageId));
					if (!record || record.status == "cancelled") continue;
					const source = record.source || {};
					const sourceSignature = record.prepared && record.prepared.signature || this.createReceivedTranslationSignature(source.message, channelId, source.originalContentData);
					if (sourceSignature == currentSignature) continue;
					if (job.invalidateMessage(messageId, "source-edited")) invalidated = true;
				}
				const failedEntry = this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId);
				if (failedEntry && failedEntry.items) {
					const nextItems = failedEntry.items.filter(item => {
						if (!item || !item.message || String(item.message.id) != String(messageId)) return true;
						const snapshotSignature = this.createReceivedTranslationSignature(item.message, channelId, item.originalContentData);
						if (snapshotSignature == currentSignature) return true;
						invalidated = true;
						return false;
					});
					if (nextItems.length) this.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, Object.assign({}, failedEntry, {items: nextItems}));
					else this.ensureHistoricalJobRegistry().deleteFailedSnapshot(channelId);
				}
				if (invalidated) {
					this.ensureLiveTranslationQueue().clearQueuedMessage(messageId);
					this.clearCachedTranslation(messageId);
					const repairStatus = loadedTranslationStatusStore.getStatus();
					if (repairStatus.channelId == channelId && repairStatus.done) {
						const failedCount = this.getFailedHistoricalTranslationCount(channelId);
						const visibleFailedCount = Math.min(repairStatus.failed || 0, failedCount);
						this.updateLoadedAutoTranslationStatus({failed: visibleFailedCount, retryable: failedCount, aiDropped: visibleFailedCount});
					}
				}
				return invalidated;
			}

			cancelHistoricalTranslationJobs (channelId = null, reason = "cancelled") {
				const entries = channelId ? [this.getHistoricalTranslationJobQueue(channelId, false)].filter(Boolean) : this.ensureHistoricalJobRegistry().listQueues();
				for (const entry of entries) {
					entry.generation++;
					this.ensureLiveTranslationQueue().clearReservedLiveRequest(entry.channelId, entry.pendingLiveHandoffTicket); entry.startToken = null; entry.pendingLiveHandoffTicket = null;
					for (const job of entry.jobs) {
						job.cancel(reason);
						for (const record of job.items.values()) if (record.source && record.source.message) this.ensureLiveTranslationQueue().clearQueuedMessage(record.source.message.id);
					}
					entry.jobs = [];
					if (channelId) this.ensureHistoricalJobRegistry().deleteQueue(channelId);
				}
				if (!channelId) this.ensureHistoricalJobRegistry().clearQueues();
				this.ensureHistoricalJobRegistry().advanceRuntimeGeneration();
			}

			prepareHistoricalTranslationJobItem (queueItem, job) {
				if (!queueItem || !queueItem.message || !this.isHistoricalTranslationJobCurrent(job)) return {status: "failed", reason: "stale_job"};
				const channelId = job.channelId;
				const input = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId)) || {});
				const output = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId)) || {});
				const prepared = this.prepareHistoricalAiBatchQueueItem(queueItem, channelId, input, output);
				if (!prepared) return {status: "failed", reason: "prepare_failed"};
				if (prepared.cachedTranslation) return {status: "translated", translation: Object.assign({channelId, auto: true}, prepared.cachedTranslation)};
				if (prepared.skipped) return {status: "skipped", reason: prepared.skipReason || "local_guard"};
				return {status: "pending", prepared};
			}

			translateHistoricalTranslationJobBatch (preparedItems, job) {
				if (!preparedItems.length || !this.isHistoricalTranslationJobCurrent(job)) return Promise.resolve(null);
				const engineKey = this.getHistoricalAiBatchEngineKey(job.channelId);
				if (!engineKey) return Promise.resolve(null);
				// Sequential provider chunks tick the capsule's processed count while the job is in flight; the job still validates and commits once.
				return runChunkedHistoricalBatch({preparedItems, requestChunk: chunk => this.requestAiBatchTranslationDetailed(engineKey, chunk), isCurrent: () => this.isHistoricalTranslationJobCurrent(job), onChunkSettled: progress => this.updateLoadedAutoTranslationStatus({channelId: job.channelId, processed: progress.answered})});
			}

			repairHistoricalTranslationJobBatch (preparedItems, job) {
				if (!preparedItems.length || !this.isHistoricalTranslationJobCurrent(job)) return Promise.resolve(null);
				const engineKey = this.getHistoricalAiBatchEngineKey(job.channelId);
				if (!engineKey) return Promise.resolve(null);
				// Repair traffic shares the provider key with live requests; honoring the
				// 429/5xx backoff window keeps repairs from extending a rate-limit storm.
				return this.awaitProviderBackoff().then(_ => this.isHistoricalTranslationJobCurrent(job) ? this.requestAiBatchTranslationDetailed(engineKey, preparedItems) : null);
			}

			validateHistoricalTranslationJobResult (prepared, rawTranslation, job) {
				if (!prepared || rawTranslation == null || String(rawTranslation).trim() === "") return {ok: false};
				// A skip verdict is terminal, not a failure - see historical-translation-job.js.
				if (this.isSkipTranslationSignal(rawTranslation)) return {ok: false, skipped: true, reason: "ai_skip_signal"};
				let translatedText = String(rawTranslation).replace(/\[NEWLINE\]/g, "\n").trim();
				if (!this.hasAllProtectionPlaceholders(translatedText, prepared.exceptions)) return {ok: false};
				translatedText = this.addExceptions(translatedText, prepared.exceptions);
				if (!this.isTranslationLikelyInTargetLanguage(translatedText, prepared.output && prepared.output.id)) return {ok: false};
				const storedTranslation = this.createStoredReceivedTranslationData(prepared.message, job.channelId, prepared.originalContentData, prepared.signature, translatedText, prepared.input, prepared.output, true);
				if (!storedTranslation || !this.shouldKeepAutoTranslatedResult(storedTranslation, job.channelId) || this.isTranslationResultTooSimilar(storedTranslation)) return {ok: false};
				return {ok: true, translation: storedTranslation};
			}

			repairHistoricalTranslationJobItem (prepared, job) {
				return new Promise(resolve => {
					if (!prepared || !prepared.message || !this.isHistoricalTranslationJobCurrent(job)) return resolve({status: "failed", reason: "stale_job"});
					const requestText = this.buildTranslationRequestText(prepared.originalContentData);
					this.awaitProviderBackoff().then(_ => {
						if (!this.isHistoricalTranslationJobCurrent(job)) return resolve({status: "failed", reason: "stale_job"});
						this.translateText(requestText, messageTypes.RECEIVED, (translation, input, output, meta = {}) => {
						if (!this.isHistoricalTranslationJobCurrent(job)) return resolve({status: "failed", reason: "stale_job"});
						if (!translation) return resolve({status: meta.skipped ? "skipped" : "failed", reason: meta.skipped ? "same_language" : "provider_failed"});
						const storedTranslation = this.createStoredReceivedTranslationData(prepared.message, job.channelId, prepared.originalContentData, prepared.signature, translation, input, output, true);
						const rejectReason = storedTranslation && this.getAutoTranslatedResultRejectReason(storedTranslation, job.channelId);
						if (!storedTranslation || rejectReason || this.isTranslationResultTooSimilar(storedTranslation)) return resolve({status: "skipped", reason: rejectReason || "too_similar"});
						resolve({status: "translated", translation: storedTranslation});
					}, null, {showToast: false, showFailureToast: false, trackBusy: false, auto: true, forcePlainTranslation: true, channelId: job.channelId});
					});
				});
			}

			waitForHistoricalTranslationCommit (job) {
				return Promise.resolve();
			}

			createHistoricalTranslationJobConfigurationSignature (channelId) {
				return this.createReceivedTranslationSignature(null, channelId, {content: "", embeds: []});
			}

			isHistoricalTranslationJobCurrent (job) {
				if (!job || !pluginRuntimeActive || !this.isTranslationEnabled(job.channelId)) return false;
				if (job.configurationSignature && job.configurationSignature != this.createHistoricalTranslationJobConfigurationSignature(job.channelId)) return false;
				const entry = this.getHistoricalTranslationJobQueue(job.channelId, false);
				return !!entry && entry.jobs.includes(job) && job.state != "cancelled";
			}

			isHistoricalTranslationJobItemCurrent (item, job) {
				if (!item || !item.message || !job || !job.channelId) return false;
				// A live translation that landed or is still in flight owns the message; a historical overwrite strands the row without decoration.
				const racingDisplayView = this.getReceivedDisplayRuntimeView(item.message.id);
				if (racingDisplayView && (racingDisplayView.translated || racingDisplayView.showLoading)) return false;
				let currentMessage = null;
				try {
					const messageStore = BDFDB.LibraryStores && BDFDB.LibraryStores.MessageStore;
					if (messageStore && typeof messageStore.getMessage == "function") currentMessage = messageStore.getMessage(job.channelId, item.message.id);
				}
				catch (error) {}
				currentMessage = currentMessage || item.message;
				const expectedContentData = item.originalContentData || this.extractOriginalContentData(item.message);
				const currentContentData = this.extractOriginalContentData(currentMessage);
				return this.createReceivedTranslationSignature(item.message, job.channelId, expectedContentData) == this.createReceivedTranslationSignature(currentMessage, job.channelId, currentContentData);
			}

			async commitHistoricalTranslationJob (summary, job) {
				if (!this.isHistoricalTranslationJobCurrent(job)) return;
				summary.translated = summary.translated.filter(item => this.isHistoricalTranslationJobItemCurrent(item, job));
				summary.skipped = summary.skipped.filter(item => this.isHistoricalTranslationJobItemCurrent(item, job));
				summary.failed = summary.failed.filter(item => this.isHistoricalTranslationJobItemCurrent(item, job));
				const generation = this.getReceivedDisplayCommitGeneration(job.channelId);
				// Echo each active request identity so the batch can supersede concurrent live work.
				const getRecordRequestIdentity = messageId => {
					const recordView = this.getReceivedDisplayRuntimeView(messageId);
					return recordView && recordView.requestIdentity != null ? recordView.requestIdentity : null;
				};
				const results = [];
				for (const item of summary.translated) {
					if (!item || !item.message || !item.translation) continue;
					const storedTranslation = this.refreshTranslationDisplay(Object.assign({channelId: job.channelId, auto: true}, item.translation));
					results.push({
						messageId: item.message.id,
						channelId: job.channelId,
						generation,
						sourceSignature: storedTranslation.signature != null ? String(storedTranslation.signature) : this.createReceivedTranslationSignature(item.message, job.channelId, item.originalContentData),
						requestIdentity: getRecordRequestIdentity(item.message.id),
						origin: "automatic",
						status: "translated",
						source: {content: item.originalContentData && item.originalContentData.content || "", embeds: item.originalContentData && item.originalContentData.embeds || []},
						translation: storedTranslation
					});
					this.persistTranslationCacheEntry(item.message.id, storedTranslation.signature, storedTranslation);
					this.ensureLiveTranslationQueue().clearQueuedMessage(item.message.id);
				}
				for (const item of summary.skipped) {
					if (!item || !item.message) continue;
					const signature = this.createReceivedTranslationSignature(item.message, job.channelId, item.originalContentData);
					this.persistReceivedSkipDecision(item.message.id, signature, item.reason || "local_guard", this.buildTranslationRequestText(item.originalContentData || {}));
					results.push({messageId: item.message.id, channelId: job.channelId, generation, sourceSignature: signature, source: {content: item.originalContentData && item.originalContentData.content || "", embeds: item.originalContentData && item.originalContentData.embeds || []}, requestIdentity: getRecordRequestIdentity(item.message.id), origin: "automatic", status: "skipped", reason: item.reason || "local_guard"});
					this.ensureLiveTranslationQueue().clearQueuedMessage(item.message.id);
				}
				for (const item of summary.failed) {
					if (!item || !item.message) continue;
					results.push({messageId: item.message.id, channelId: job.channelId, generation, sourceSignature: this.createReceivedTranslationSignature(item.message, job.channelId, item.originalContentData), source: {content: item.originalContentData && item.originalContentData.content || "", embeds: item.originalContentData && item.originalContentData.embeds || []}, requestIdentity: getRecordRequestIdentity(item.message.id), origin: "automatic", status: "failed", reason: item.reason || "provider_failed"});
					this.ensureLiveTranslationQueue().clearQueuedMessage(item.message.id);
				}
				let batchOutcome = null;
				if (results.length) {
					try {batchOutcome = await this.commitHistoricalReceivedDisplayBatch(results);}
					catch (error) {batchOutcome = null;}
				}
				const failedCount = this.updateFailedHistoricalTranslationSnapshots(summary, job.channelId);
				const blockedIds = new Set([].concat(batchOutcome && batchOutcome.missingIds || [], batchOutcome && batchOutcome.retryIds || [], batchOutcome && batchOutcome.rejectedIds || [], batchOutcome && batchOutcome.staleIds || []).map(String));
				const displayReadyIds = new Set([].concat(batchOutcome && batchOutcome.confirmedIds || [], batchOutcome && batchOutcome.deferredIds || []).map(String).filter(messageId => !blockedIds.has(messageId)));
				const displayed = summary.translated.filter(item => item && item.message && displayReadyIds.has(String(item.message.id))).length;
				// Items handed to a live translation (race guard) are displayed by the live
				// lane; the capsule must count them as shown instead of reporting a gap
				// that reads like an invisible failure.
				const liveDisplayed = [...job.items.keys()].filter(messageId => {
					const liveView = this.getReceivedDisplayRuntimeView(String(messageId));
					return liveView && liveView.translated && !displayReadyIds.has(String(messageId));
				}).length;
				const displayPending = historicalDisplayTracker.begin({channelId: job.channelId, batchKey: job.id, outcome: batchOutcome, displayed, displayableIds: summary.translated.map(item => item && item.message && String(item.message.id)).filter(Boolean), schedule: (messageId, trackingKey) => this.scheduleReceivedDisplayFlush(job.channelId, messageId, null, trackingKey)});
				this.updateLoadedAutoTranslationStatus({active: false, collecting: false, done: true, channelId: job.channelId, total: job.items.size, processed: job.items.size, displayed: displayed + liveDisplayed, displayPending, skipped: summary.skipped.length, failed: summary.failed.length, retryable: failedCount, aiDropped: summary.failed.length});
			}

			updateHistoricalTranslationJobStatus (job) {
				if (!job || !job.channelId || job.state == "committed") return;
				const records = [...job.items.values()];
				const retainedFailedCount = this.getFailedHistoricalTranslationCount(job.channelId);
				const currentFailedCount = records.filter(record => record.status == "failed").length;
				this.updateLoadedAutoTranslationStatus({active: job.state != "cancelled", collecting: job.state == "collecting", done: false, channelId: job.channelId, total: records.length, processed: records.filter(record => HISTORICAL_TERMINAL_ITEM_STATES.has(record.status)).length, displayed: 0, skipped: records.filter(record => record.status == "skipped").length, failed: currentFailedCount, retryable: retainedFailedCount, aiDropped: currentFailedCount});
			}

			getHistoricalAiBatchItemLimit (channelId = null) {
				return Math.max(LOADED_AUTO_TRANSLATE_LIMIT_MIN, Math.min(HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX, this.getReceivedAutoTranslateLoadedLimit()));
			}

			getHistoricalAiBatchEngineKey (channelId = null) {
				const engineKey = this.getEffectivePrimaryEngine(channelId);
				if (!["deepseek", "openai", "gemini", "oaicompat"].includes(engineKey)) return null;
				const input = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId)) || {});
				const output = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId)) || {});
				if (!input.id || !output.id || output.special) return null;
				return this.validTranslator(engineKey, input, output, null) ? engineKey : null;
			}

			prepareHistoricalAiBatchQueueItem (queueItem, channelId, input, output) {
				if (!queueItem || !queueItem.message || !queueItem.message.id) return null;
				if (queueItem.cachedTranslation) return {queueItem, cachedTranslation: queueItem.cachedTranslation};
				const cachedSkipDecision = this.getCachedReceivedSkipDecision(queueItem.message, channelId, queueItem.originalContentData);
				if (cachedSkipDecision) return {queueItem, skipped: true, skipReason: cachedSkipDecision.reason, skipPreview: cachedSkipDecision.preview};
				if (!this.shouldAutoTranslateReceivedMessage(queueItem.message, queueItem.channel, queueItem.originalContentData, true)) return {queueItem, skipped: true};
				const originalContentData = queueItem.originalContentData || this.extractOriginalContentData(queueItem.message);
				const rawText = this.buildTranslationRequestText(originalContentData);
				const [protectedText, exceptions, shouldTranslate] = this.removeExceptions((rawText || "").trim(), messageTypes.RECEIVED);
				if (!shouldTranslate || !protectedText) return {queueItem, skipped: true};
				return {
					queueItem,
					message: queueItem.message,
					channelId,
					originalContentData,
					signature: this.createReceivedTranslationSignature(queueItem.message, channelId, originalContentData),
					protectedText,
					exceptions,
					input,
					output
				};
			}

			parseAiBatchTranslationResponse (content, expectedIds = null) {
				return this.ensureProviderClient().parseAiBatchTranslationResponse(content, expectedIds);
			}
			requestAiBatchTranslation (engineKey, preparedItems) {
				return this.ensureProviderClient().requestAiBatchTranslation(engineKey, preparedItems);
			}

			requestAiBatchTranslationDetailed (engineKey, preparedItems) {
				// Coordinator tests and third-party integrations may still override the old
				// map-only method. Preserve that seam while production receives typed failures.
				if (Object.prototype.hasOwnProperty.call(this, "requestAiBatchTranslation")) return this.requestAiBatchTranslation(engineKey, preparedItems);
				return this.ensureProviderClient().requestAiBatchTranslationDetailed(engineKey, preparedItems);
			}
			processAutoTranslationQueue () {
				return this.ensureLiveTranslationQueue().processQueue();
			}
			resumeQueuedHistoricalTranslationJobs (channelId = null, handoffTicket = null, options = {}) {return resumeHistoricalHandoff(this, channelId, handoffTicket, options);}
			forceUpdateAll () {
				this.ensureSettingsStore().reload();
				this.ensureTranslationCacheStore().loadPersisted();
				this.ensureReceivedDisplayRuntime().clearAllSuppression();
				this.clearAutoTranslationQueue();
				this.resetAutoTranslationTracking();
				this.clearLoadedAutoTranslationStatus();
				this.ensureLiveTranslationQueue().setLiveAutoTranslating(false);
				this.ensureReceivedDisplayRuntime().clearPreviews(null);
				this.ensureReceivedDisplayRepaintScheduler().cancelFullRepaintTimers();
				this.setLanguages();
				BDFDB.PatchUtils.forceAllUpdates(this);
				BDFDB.MessageUtils.rerenderAll();
			}

			onMessageContextMenu (e) {
				if (e.instance.props.message && e.instance.props.channel) {
					let translated = this.isMessageDisplayTranslated(e.instance.props.message, e.instance.props.channel.id);
					let hint = BDFDB.BDUtils.isPluginEnabled("MessageUtilities") ? BDFDB.BDUtils.getPlugin("MessageUtilities").getActiveShortcutString("__Translate_Message") : null;
					let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["copy-text", "pin", "unpin"]});
					if (index == -1) [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["edit", "add-reaction", "add-reaction-1", "quote"]});
					children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
						label: translated ? this.labels.context_messageuntranslateoption : this.labels.context_messagetranslateoption,
						id: BDFDB.ContextMenuUtils.createItemId(this.name, translated ? "untranslate-message" : "translate-message"),
						icon: _ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
							icon: translated ? translateIconUntranslate : translateIcon
						}),
						action: _ => this.translateMessage(e.instance.props.message, e.instance.props.channel, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false})
					}));
					this.injectMessageLanguageActions(children, index > -1 ? index + 1 : 0, e.instance.props.message, e.instance.props.channel);
					this.injectSearchItem(e, false, e.instance.props.channel.id);
				}
			}
			onTextAreaContextMenu (e) {
				this.injectSearchItem(e, true);
			}
			injectSearchItem (e, ownMessage, channelId = null) {
				let text = document.getSelection().toString();
				if (text) {
					let translating, foundTranslation, foundInput, foundOutput, copied;
					let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["devmode-copy-id", "search-google"], group: true});
					children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuGroup, {
						children: BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
							id: BDFDB.ContextMenuUtils.createItemId(this.name, "search-translation"),
							icon: _ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
								icon: translateIcon
							}),
							disabled: this.ensureLiveTranslationQueue().isBusyTranslating(),
							label: this.labels.context_translator,
							persisting: true,
							action: event => {
								let item = BDFDB.DOMUtils.getParent(BDFDB.dotCN.menuitem, event.target);
								if (item) {
									let createTooltip = _ => {
										BDFDB.TooltipUtils.create(item, !foundTranslation ? this.labels.toast_translating_failed : [
											`${BDFDB.LanguageUtils.LibraryStrings.from} ${this.getLanguageDisplayName(foundInput)}:`,
											text,
											`${BDFDB.LanguageUtils.LibraryStrings.to} ${this.getLanguageDisplayName(foundOutput)}:`,
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
												BDFDB.DiscordUtils.openLink(this.getGoogleTranslatePageURL(foundInput.id, foundOutput.id, text));
											}
										}
										else createTooltip();
									}
									else if (!translating) {
										translating = true;
										this.translateText(text, ownMessage ? messageTypes.SENT : messageTypes.RECEIVED, (translation, input, output) => {
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
			processMessageButtons (e) {
				if (!e.instance.props.message || !e.instance.props.channel) return;
				let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {props: [["className", BDFDB.disCN.messagebuttons]]});
				if (index == -1) return;
				const channelId = e.instance.props.channel && e.instance.props.channel.id || null;
				let translated = this.isMessageDisplayTranslated(e.instance.props.message, channelId);
				children.unshift(BDFDB.ReactUtils.createElement(class extends BdApi.React.Component {
					render() {
						return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
							key: translated ? "untranslate-message" : "translate-message",
							text: _ => translated ? _this.labels.context_messageuntranslateoption : _this.labels.context_messagetranslateoption,
							tooltipConfig: {className: BDFDB.disCN.messagetoolbartooltip},
							children: BDFDB.ReactUtils.createElement("div", {
								className: BDFDB.disCNS.messagetoolbarhoverbutton + BDFDB.disCN.messagetoolbarbutton,
								onClick: _ => {
									_this.translateMessage(e.instance.props.message, e.instance.props.channel, {manual: true, independentOfTextAreaSwitch: true, trackBusy: false}).then(_ => {
										translated = _this.isMessageDisplayTranslated(e.instance.props.message, channelId);
										BDFDB.ReactUtils.forceUpdate(this);
									});
								},
								children: BDFDB.ReactUtils.createElement("div", {
									className: BDFDB.disCNS.messagetoolbaricon + BDFDB.disCN.messagetoolbarbuttoncontent,
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
										className: BDFDB.disCN.messagetoolbaricon,
										nativeClass: true,
										iconSVG: translated ? translateIconUntranslate : translateIcon
									})
								})
							})
						});
					}
				}));
			}
			ensureComposerWiring () {
				if (!this.composerWiringInstance) this.composerWiringInstance = createComposerWiring({BDFDB, getPlugin: () => this, messageTypes, TranslateButtonComponent});
				return this.composerWiringInstance;
			}
			processChannelTextAreaContainer (e) {
				this.ensureComposerWiring().processChannelTextAreaContainer(e);
			}
			processChannelTextAreaEditor (e) {
				// Do not disable the text area while background/manual message translations are running.
				// Disabling here interrupts draft typing and can drop unsent text during message list refreshes.
			}
			processChannelTextAreaButtons (e) {
				this.ensureComposerWiring().processChannelTextAreaButtons(e);
			}

			get modelCatalogState () {
				return this.ensureProviderClient().getModelCatalogState();
			}
			ensureHistoricalJobRegistry () {
				if (!this.historicalJobRegistryInstance) this.historicalJobRegistryInstance = createHistoricalJobRegistry();
				return this.historicalJobRegistryInstance;
			}
			ensureMessageDeletionLifecycle () {
				if (!this.messageDeletionLifecycleInstance) this.messageDeletionLifecycleInstance = createMessageDeletionLifecycle({
					removeLiveMessage: (messageId, channelId) => this.ensureLiveTranslationQueue().removeMessage(messageId, channelId),
					getHistoricalQueue: channelId => this.getHistoricalTranslationJobQueue(channelId, false),
					getFailedSnapshot: channelId => this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId),
					setFailedSnapshot: (channelId, snapshot) => this.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, snapshot),
					deleteFailedSnapshot: channelId => this.ensureHistoricalJobRegistry().deleteFailedSnapshot(channelId),
					clearHistoricalMarker: (messageId, jobId) => this.ensureLiveTranslationQueue().clearHistoricalQueuedMessage(messageId, jobId),
					hasCachedTranslation: messageId => this.hasCachedTranslationEntry(messageId), clearCachedTranslation: messageId => this.clearCachedTranslation(messageId),
					deleteDisplayMessage: (messageId, channelId) => this.ensureReceivedDisplayRuntime().deleteMessage(messageId, channelId)
				});
				return this.messageDeletionLifecycleInstance;
			}
			ensureLiveTranslationQueue () {
				if (!this.liveTranslationQueueInstance) this.liveTranslationQueueInstance = createLiveTranslationQueue({
					isRuntimeActive: () => pluginRuntimeActive,
					isTranslationEnabled: channelId => this.isTranslationEnabled(channelId),
					extractOriginalContentData: message => this.extractOriginalContentData(message),
					createTranslationSignature: (message, channelId, originalContentData) => this.createReceivedTranslationSignature(message, channelId, originalContentData),
					getMessageChannelId: message => this.getMessageChannelId(message),
					isProviderBackoffActive: () => this.ensureProviderClient().isBackoffActive(),
					shouldAutoTranslateMessage: (message, channel, originalContentData, ignoreQueued) => this.shouldAutoTranslateReceivedMessage(message, channel, originalContentData, ignoreQueued),
					isMessageWithinLoadedRange: message => this.isMessageWithinLoadedRange(message),
					getDisplayCommitGeneration: channelId => this.getReceivedDisplayCommitGeneration(channelId),
					markDisplayPending: (record, options) => this.markReceivedDisplayPending(record, options),
					releaseDisplayPending: record => this.releaseReceivedDisplayPending(record),
					scheduleDisplayFlush: (channelId, messageId) => this.scheduleReceivedDisplayFlush(channelId, messageId),
					collectHistoricalMessage: queueItem => this.collectHistoricalTranslationMessage(queueItem),
					resetLoadedMessageTracking: (channelId = null) => loadedTranslationStatusStore.resetSeen(channelId),
					clearEligibleReplyPreviewMessages: channelId => this.clearAutoTranslationEligibleReplyPreviewMessages(channelId),
					clearChannelTranslationQueue: channelId => this.clearAutoTranslationQueue(channelId),
					onChannelSessionLeft: channelId => this.ensureReceivedDisplayRuntime().pruneChannel(channelId),
					// new_only hides what is already on screen, so a fresh session drops the automatic records the previous one painted.
					onChannelSessionStarted: channelId => this.getReceivedAutoTranslateScope() == "new_only" && this.clearDisplayedAutoTranslations(channelId),
					onReservedLiveRequestConsumed: (channelId, handoffTicket) => this.resumeQueuedHistoricalTranslationJobs(channelId, handoffTicket),
					onReservedLiveRequestRetired: (channelId, handoffTicket) => this.resumeQueuedHistoricalTranslationJobs(channelId, handoffTicket, {retired: true}),
					getBatchEngineKey: channelId => this.getHistoricalAiBatchEngineKey(channelId),
					createBurstContext: channelId => ({
					engineKey: this.getHistoricalAiBatchEngineKey(channelId),
					input: Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId)) || {}),
					output: Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId)) || {})
					}),
					prepareBurstItem: (queueItem, channelId, context) => this.prepareHistoricalAiBatchQueueItem(queueItem, channelId, context.input, context.output),
					requestBurstTranslation: (context, prepared) => this.requestAiBatchTranslationDetailed(context.engineKey, prepared),
					// Skip detection, validation and caching are translation policy and stay here;
					// the queue only learns whether the item is done, done-as-skipped, or must be
					// retried alone.
					resolveBurstItemResult: (preparedItem, resultMap, channelId) => {
					const messageId = String(preparedItem.message.id);
					const rawTranslation = resultMap && Object.prototype.hasOwnProperty.call(resultMap, messageId) ? resultMap[messageId] : null;
					// An explicit skip verdict is a terminal answer, not a failure: paying for a
					// second full-price request to reach the same verdict is waste.
					if (rawTranslation != null && this.isSkipTranslationSignal(rawTranslation)) {
					this.persistReceivedSkipDecision(messageId, preparedItem.signature, "ai_skip_signal", preparedItem.protectedText);
					return {status: "skipped", result: {sourceSignature: preparedItem.signature, status: "skipped", reason: "ai_skip_signal"}};
					}
					let validation = {ok: false};
					try {validation = this.validateHistoricalTranslationJobResult(preparedItem, rawTranslation, {channelId}) || {ok: false};}
					catch (error) {validation = {ok: false};}
					if (!validation.ok) return {status: "retry"};
					// The result is paid for and valid, so it is cached even when the live request
					// went stale; a retry then hits the cache instead of the provider.
					try {this.persistTranslationCacheEntry(messageId, preparedItem.signature, validation.translation);}
					catch (error) {}
					return {status: "translated", result: {sourceSignature: preparedItem.signature, status: "translated", translation: validation.translation}};
					},
					commitBurstResult: (queueItem, channelId, result) => this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(queueItem.message, channelId, result), {refresh: false}),
					commitCachedResult: (queueItem, channelId) => {
					const storedTranslation = this.refreshTranslationDisplay(Object.assign({channelId, auto: true}, queueItem.cachedTranslation));
					return this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(queueItem.message, channelId, {
					sourceSignature: storedTranslation.signature != null ? String(storedTranslation.signature) : this.createReceivedTranslationSignature(queueItem.message, channelId, queueItem.originalContentData),
					requestIdentity: queueItem.liveRequest ? String(queueItem.liveRequest.id) : null,
					status: "translated",
					translation: storedTranslation
					}), {refresh: false});
					},
					translateSingleItem: queueItem => this.translateMessage(queueItem.message, queueItem.channel, {
					auto: true,
					silent: true,
					trackBusy: false,
					originalContentData: queueItem.originalContentData,
					liveRequest: queueItem.liveRequest
					})
				});
				return this.liveTranslationQueueInstance;
			}

			ensureSentTranslationStore () {
				if (!this.sentTranslationStoreInstance) this.sentTranslationStoreInstance = createSentTranslationStore({
					isRuntimeActive: () => pluginRuntimeActive,
					isTranslationEnabled: channelId => this.isTranslationEnabled(channelId),
					isOwnMessage: message => this.isOwnMessage(message)
				});
				return this.sentTranslationStoreInstance;
			}

			ensureSettingsStore () {
				if (!this.settingsStoreInstance) this.settingsStoreInstance = createSettingsStore({
					isKnownEngine: engineKey => !!translationEngines[engineKey],
					sortLanguages: table => BDFDB.ObjectUtils.sort(table, "fav"),
					resolveGuildId: channelId => {
						const channel = channelId && BDFDB.LibraryStores.ChannelStore.getChannel(channelId);
						return channel ? (channel.guild_id ? channel.guild_id : "@me") : null;
					},
					loadFavorites: () => BDFDB.DataUtils.load(this, "favorites"),
					persistFavorites: value => BDFDB.DataUtils.save(value, this, "favorites"),
					loadAuthKeys: () => BDFDB.DataUtils.load(this, "authKeys"),
					persistAuthKeys: value => BDFDB.DataUtils.save(value, this, "authKeys"),
					loadChannelLanguages: () => BDFDB.DataUtils.load(this, "channelLanguages"),
					persistChannelLanguages: value => BDFDB.DataUtils.save(value, this, "channelLanguages"),
					loadGuildLanguages: () => BDFDB.DataUtils.load(this, "guildLanguages"),
					persistGuildLanguages: value => BDFDB.DataUtils.save(value, this, "guildLanguages"),
					loadChannelPrimaryEngineOverrides: () => BDFDB.DataUtils.load(this, "channelPrimaryEngineOverrides"),
					persistChannelPrimaryEngineOverrides: value => BDFDB.DataUtils.save(value, this, "channelPrimaryEngineOverrides"),
					loadTranslationEnabledStates: () => BDFDB.DataUtils.load(this, "translationEnabledStates"),
					loadReceivedAutoTranslationEnabledStates: () => BDFDB.DataUtils.load(this, "receivedAutoTranslationEnabledStates"),
					persistChannelEnablementState: value => {
						BDFDB.DataUtils.save(value, this, "translationEnabledStates");
						BDFDB.DataUtils.save(value, this, "receivedAutoTranslationEnabledStates");
					},
					loadGlobalLanguageChoice: (place, direction) => this.settings.choices[place] && this.settings.choices[place][direction],
					persistGlobalLanguageChoice: (place, direction, choice) => {
						this.settings.choices[place][direction] = choice;
						BDFDB.DataUtils.save(this.settings.choices, this, "choices");
					}
				});
				return this.settingsStoreInstance;
			}

			ensureProviderClient () {
				if (!this.providerClientInstance) this.providerClientInstance = createProviderClient({
					request: (url, options, callback) => BDFDB.LibraryRequires.request(url, options, callback),
					setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
					clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
					// A raw global timer on purpose: routing the backoff sleep through BDFDB would
					// leave the awaiting promise pending forever once the plugin stops.
					sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
					now: () => Date.now(),
					getAuthKeys: () => this.ensureSettingsStore().getAuthKeys(),
					saveAuthKeys: value => this.ensureSettingsStore().replaceAuthKeys(value),
					getLanguages: () => this.ensureSettingsStore().getLanguages(),
					notify: (message, options) => BDFDB.NotificationUtils.toast(message, options),
					getLabels: () => this.labels,
					getCustomText: key => this.getCustomText(key),
					getEngineLabel: engineKey => this.getEngineLabel(engineKey),
					shouldUseAiAutoTranslateDecision: channelId => this.shouldUseAiAutoTranslateDecision(channelId),
					getAiAutoTranslatePrompt: translationData => this.getAiAutoTranslatePrompt(translationData)
				});
				return this.providerClientInstance;
			}

			ensureTranslationCacheStore () {
				if (!this.translationCacheStoreInstance) this.translationCacheStoreInstance = createTranslationCacheStore({
					now: () => Date.now(),
					setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
					clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
					loadCache: () => BDFDB.DataUtils.load(this, "translationCache"),
					saveCache: cache => BDFDB.DataUtils.save(cache, this, "translationCache"),
					extractOriginalContentData: message => this.extractOriginalContentData(message),
					createSignature: (message, channelId, sourceData) => this.createReceivedTranslationSignature(message, channelId, sourceData),
					normalizeStoredTranslation: translation => this.normalizeStoredTranslationData(translation),
					extractLegacyDisplayedParts: content => this.extractLegacyDisplayedTranslationParts(content),
					// Policy and display stay in the received-translation runtime; a cache lookup
					// asks whether an old entry still passes today's guards, it does not decide.
					refreshTranslationDisplay: translation => this.refreshTranslationDisplay(translation),
					isTranslationResultTooSimilar: translation => this.isTranslationResultTooSimilar(translation),
					shouldSkipBeforeRequest: (sourceData, channelId) => this.shouldSkipReceivedTranslationBeforeRequest(sourceData, channelId),
					shouldKeepAutoTranslatedResult: (translation, channelId) => this.shouldKeepAutoTranslatedResult(translation, channelId),
					getSkipPreviewText: text => this.getLoadedAutoTranslationPreviewText(text)
				});
				return this.translationCacheStoreInstance;
			}

			ensureMessageViewportStore () {
				if (!this.messageViewportStoreInstance) this.messageViewportStoreInstance = createMessageViewportStore({
					getDocument: () => typeof document == "undefined" ? null : document,
					setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
					clearTimeout: timer => BDFDB.TimeUtils.clear(timer),
					requestAnimationFrame: callback => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : setTimeout(callback, 0),
					now: () => Date.now(),
					getSelectedChannelId: () => BDFDB.LibraryStores.SelectedChannelStore.getChannelId(),
					getMessagesScrollerSelector: () => BDFDB.dotCN && BDFDB.dotCN.messagesscroller,
					escapeSelectorValue: value => typeof CSS != "undefined" && CSS.escape ? CSS.escape(value) : String(value).replace(/(["\\])/g, "\\$1"),
					// Closing the user-scroll window is the moment a historical snapshot may commit.
					onScrollActivityFinished: channelId => this.finishHistoricalTranslationSnapshot(channelId)
				});
				return this.messageViewportStoreInstance;
			}

			ensureReceivedDisplayRuntime () {
				if (!this.receivedDisplayRuntimeInstance) this.receivedDisplayRuntimeInstance = createDisplayRuntime({
					BDFDB: {
						dotCN: BDFDB.dotCN || {},
						MessageUtils: BDFDB.MessageUtils
					},
					document: {
						querySelector: selector => typeof document == "undefined" || !document || !selector ? null : document.querySelector(selector)
					},
					requestAnimationFrame: callback => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : setTimeout(callback, 0),
					isRuntimeActive: () => pluginRuntimeActive,
					getUserScrollIntentSequence: () => this.ensureMessageViewportStore().getUserScrollIntentSequence(),
					// Scroll preservation is best-effort: a capture or restore failure must never
					// break a display transaction. The viewport store owns the anchor-over-offset choice.
					captureScrollState: () => {
						try {return this.ensureMessageViewportStore().captureDisplayTransactionScrollState();}
						catch (error) {return null;}
					},
					restoreScrollState: scrollerState => {
						try {this.ensureMessageViewportStore().restoreDisplayTransactionScrollState(scrollerState);}
						catch (error) {}
					}
				});
				return this.receivedDisplayRuntimeInstance;
			}
			resetReceivedDisplayRuntime () {
				this.receivedDisplayRuntimeInstance = null;
			}

			captureReceivedMessageSource (snapshot) {
				return this.ensureReceivedDisplayRuntime().captureSource(snapshot);
			}

			markReceivedDisplayPending (request, options) {
				return this.ensureReceivedDisplayRuntime().markPending(request, options);
			}

			commitReceivedDisplayResult (result, options) {
				return this.ensureReceivedDisplayRuntime().commitMessageResult(result, options);
			}

			commitHistoricalReceivedDisplayBatch (results) {
				return this.ensureReceivedDisplayRuntime().commitHistoricalBatch(results);
			}

			getReceivedDisplayView (messageId) {
				return this.ensureReceivedDisplayRuntime().getDisplayView(messageId);
			}

			getReceivedDisplayRuntimeView (messageId) {
				return this.ensureReceivedDisplayRuntime().getDisplayView(messageId);
			}

			restoreReceivedDisplayChannel (channelId, options) {
				return this.ensureReceivedDisplayRuntime().restoreChannel(channelId, options);
			}

			restoreAllReceivedDisplay (options) {
				return this.ensureReceivedDisplayRuntime().restoreAll(options);
			}

			setReceivedDisplayGeneration (channelId, generation) {
				return this.ensureReceivedDisplayRuntime().setChannelGeneration(channelId, generation);
			}

			getReceivedDisplayGeneration (channelId) {
				return this.ensureReceivedDisplayRuntime().getChannelGeneration(channelId);
			}

			getReceivedDisplayCommitGeneration (channelId) {
				const generation = this.getReceivedDisplayGeneration(channelId);
				return generation === undefined ? 1 : generation;
			}

			releaseReceivedDisplayPending (request) {
				return this.ensureReceivedDisplayRuntime().releasePending(request);
			}

			// Live automatic commits write the store immediately and coalesce their visible
			// refresh: one acknowledged display transaction per channel per debounce window
			// instead of one full-list repaint (plus scroll restore) per message.
			// Repaint cadence lives in the scheduler module; the plugin only supplies the
			// predicates that depend on Discord state.
			canRepaintReceivedDisplayNow () {
				return !this.isTranslatorSettingsSurfaceOpen();
			}

			ensureReceivedDisplayRepaintScheduler () {
				if (!this.receivedDisplayRepaintSchedulerInstance) this.receivedDisplayRepaintSchedulerInstance = createDisplayRepaintScheduler({
					renderMessages: messageIds => this.ensureReceivedDisplayRuntime().renderMessages(messageIds),
					onRenderOutcome: report => historicalDisplayTracker.handle(report),
					canRepaintNow: () => this.canRepaintReceivedDisplayNow(),
					isViewingHistory: () => this.isViewingMessageHistory(),
					isSettingsSurfaceOpen: () => this.isTranslatorSettingsSurfaceOpen(),
					isTextAreaFocused: () => this.isChannelTextAreaFocused(),
					repaintAll: () => this.rerenderMessagesWithScrollPreserved(),
					setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
					clearTimeout: timer => BDFDB.TimeUtils.clear(timer)
				});
				return this.receivedDisplayRepaintSchedulerInstance;
			}

			scheduleReceivedDisplayFlush (channelId, messageId, delay = null, trackingKey = null) {this.ensureReceivedDisplayRepaintScheduler().schedule(channelId, messageId, delay, 1, trackingKey);}

			clearReceivedDisplayFlushQueue () {
				this.ensureReceivedDisplayRepaintScheduler().clear();
			}

			restoreReceivedDisplayMessage (messageId, options) {
				return this.ensureReceivedDisplayRuntime().restoreMessage(messageId, options);
			}

			isMessageDisplayTranslated (message, channelId = null) {
				if (!message || !message.id) return false;
				if (this.getActiveMessageTranslation(message, channelId)) return true;
				const displayView = this.getReceivedDisplayRuntimeView(message.id);
				return !!(displayView && displayView.translated);
			}

			createReceivedDisplayCommitResult (message, channelId, overrides) {
				return Object.assign({
					messageId: message.id,
					channelId,
					generation: this.getReceivedDisplayCommitGeneration(channelId),
					origin: "automatic",
					requestIdentity: null
				}, overrides);
			}

			// Display composition happens at render time so Display settings changed after a
			// commit still shape the painted content; the frozen store record keeps only the
			// translation facts.
			getReceivedDisplayViewRenderContent (view) {return translationDisplayLogic.getReceivedDisplayViewRenderContent(this, view);}

			applyReceivedDisplayViewToStream (stream, view) {return translationDisplayLogic.applyReceivedDisplayViewToStream(this, stream, view);}

			applyReceivedDisplayViewToContent (e, view) {
				if (!e || !e.returnvalue || !e.returnvalue.props) return;
				this.cleanupInjectedMessageChildren(this.ensureElementChildrenArray(e.returnvalue));
				translationDisplayLogic.clearTranslatedRenderDecorations(this, e);
				if (!view) {
					delete e.returnvalue.props["data-translator-revision"];
					return;
				}
				e.returnvalue.props["data-translator-revision"] = String(view.revision);
				if (view.translated && view.translation) {
					if (this.shouldProtectWrappedTextForPlace(messageTypes.RECEIVED)) e.returnvalue.props.children = this.highlightProtectedWrappedTextInNode(e.returnvalue.props.children, view.messageId);
					if (this.settings.general.highlightTranslatedMessages) e.returnvalue.props.className = BDFDB.DOMUtils.formatClassName(e.returnvalue.props.className, "translator-translated-message");
					e.returnvalue.props.style = Object.assign({}, e.returnvalue.props.style, {
						"--translator-accent-color": this.getTranslatedTextColor(),
						"--translator-text-color": this.getTranslatedTextColor()
					});
					const watermarkNode = translationDisplayLogic.createTranslationWatermarkNode(this, view.translation, "translator-translated-watermark");
					if (watermarkNode) this.ensureElementChildrenArray(e.returnvalue).push(watermarkNode);
					if (view.translation.originalContent && this.settings.general.showOriginalMessage && this.settings.general.showOriginalDirectly) this.ensureElementChildrenArray(e.returnvalue).push(this.createOriginalMessageBlock(view.translation.originalContent));
					return;
				}
				if (view.showLoading) this.ensureElementChildrenArray(e.returnvalue).push(BDFDB.ReactUtils.createElement("span", {
					key: "translator-translation-loading",
					className: "translator-translation-loading",
					"aria-label": this.isChineseUiLanguage() ? "正在翻译" : "Translating"
				}));
			}

			processMessages (e) {
				if (secondDebugProbe) secondDebugProbe.recordParentRenderPass(e, {resolveScrollerElement: () => document.querySelector(BDFDB.dotCN.messagesscroller)});
				return receivedTranslationRuntime.processMessages(this, e);
			}

			checkMessage (stream, message, channel, options = {}) {
				return receivedTranslationRuntime.checkMessage(this, stream, message, channel, options);
			}

			processMessageReply (e) {
				return translationDisplayLogic.processMessageReply(this, e);
			}

			processMessageContent (e) {
				if (!e.instance.props.message || !e.returnvalue || !e.returnvalue.props) return;
				let message = e.instance.props.message;
				if (this.isRenderingReplyPreviewMessage(message)) {
					let children = this.ensureElementChildrenArray(e.returnvalue);
					this.cleanupInjectedMessageChildren(children);
					e.returnvalue = this.stripTranslatorStylingFromReplyPreviewNode(e.returnvalue);
					return;
				}
				const displayState = translationDisplayLogic.prepareMessageContentDisplay(this, e);
				message = displayState.message;
				const translation = displayState.translation;
				const displayView = this.getReceivedDisplayRuntimeView(message.id);
				if (!translation && displayView && displayView.translated) {
					this.applyReceivedDisplayViewToContent(e, displayView);
					return;
				}
				translationDisplayLogic.applyMessageContentRenderDecorations(this, e, message, translation);
				if (displayView) e.returnvalue.props["data-translator-revision"] = String(displayView.revision);
				else delete e.returnvalue.props["data-translator-revision"];
			}

			processEmbed (e) {
				return translationDisplayLogic.processEmbed(this, e);
			}

			isTranslatableChannelTitle (channel) {
				if (!channel || !channel.id || !(channel.name || "").trim()) return false;
				try {
					if (BDFDB.ChannelUtils && (BDFDB.ChannelUtils.isThread(channel) || BDFDB.ChannelUtils.isForumPost(channel))) return true;
				}
				catch (error) {}
				try {return typeof channel.isThread == "function" && channel.isThread();}
				catch (error) {return false;}
			}

			getChannelTitleTranslationSignature (channel) {
				if (!this.isTranslatableChannelTitle(channel)) return "";
				const channelId = channel.id;
				return JSON.stringify(Object.assign({}, this.getReceivedTranslationRequestConfigurationData(channelId), {
					name: channel.name
				}));
			}

			getActiveChannelTitleTranslation (channel) {
				if (!this.isTranslatableChannelTitle(channel) || !this.isTranslationEnabled(channel.id)) return null;
				return channelTitleStore.getTranslatedTitle(channel.id, this.getChannelTitleTranslationSignature(channel));
			}

			cancelPendingChannelTitleTranslation (channelId = null) {
				channelTitleStore.cancelPending(channelId);
			}

			clearChannelTitleTranslations (channelId = null) {
				if (channelTitleStore.clear(channelId)) this.forceUpdateChannelTitleComponents();
			}

			queueChannelTitleTranslation (channel) {
				if (!pluginRuntimeActive || !this.isTranslatableChannelTitle(channel) || !this.isTranslationEnabled(channel.id)) return false;
				const channelId = channel.id;
				const signature = this.getChannelTitleTranslationSignature(channel);
				if (!signature) return false;
				const request = channelTitleStore.beginRequest(channelId, signature);
				if (!request) return false;
				this.translateText(channel.name, messageTypes.RECEIVED, (translation, _input, _output, meta = {}) => {
					if (!channelTitleStore.isRequestCurrent(request)) return;
					// The plugin may have stopped, the channel may have been disabled, or the title
					// may have changed while the provider was working; none of those may commit.
					if (!pluginRuntimeActive || !this.isTranslationEnabled(channelId) || this.getChannelTitleTranslationSignature(channel) != signature) {
						channelTitleStore.abandonRequest(request);
						return;
					}
					if (!translation && !(meta && meta.skipped)) {
						channelTitleStore.failRequest(request);
						return;
					}
					if (channelTitleStore.completeRequest(request, translation || channel.name)) this.forceUpdateChannelTitleComponents();
				}, null, {auto: true, showToast: false, showFailureToast: false, trackBusy: false, channelId});
				return true;
			}

			replaceChannelTitleInRenderTree (node, originalTitle, translatedTitle) {
				if (typeof node == "string") return node == originalTitle ? translatedTitle : node;
				if (BDFDB.ArrayUtils.is(node)) {
					for (let index = 0; index < node.length; index++) node[index] = this.replaceChannelTitleInRenderTree(node[index], originalTitle, translatedTitle);
					return node;
				}
				if (!node || typeof node != "object" || !node.props) return node;
				if (Object.prototype.hasOwnProperty.call(node.props, "children")) node.props.children = this.replaceChannelTitleInRenderTree(node.props.children, originalTitle, translatedTitle);
				for (const key of ["text", "title", "aria-label", "threadName", "channelName"]) if (node.props[key] == originalTitle) node.props[key] = translatedTitle;
				return node;
			}

			getChannelFromTitlePatchEvent (e) {
				const props = e && e.instance && e.instance.props || {};
				for (const channel of [props.thread, props.activeThread, props.sidebarChannel]) if (channel && channel.id) return channel;
				const threadId = props.threadId || props.activeThreadId || props.sidebarChannelId;
				if (threadId) {
					const thread = BDFDB.LibraryStores.ChannelStore.getChannel(threadId);
					if (thread) return thread;
				}
				if (props.channelId) {
					const explicitChannel = BDFDB.LibraryStores.ChannelStore.getChannel(props.channelId);
					if (this.isTranslatableChannelTitle(explicitChannel)) return explicitChannel;
				}
				for (const channel of [props.channel, props.activeChannel]) if (channel && channel.id) return channel;
				const channelId = props.channelId || props.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
				return channelId && BDFDB.LibraryStores.ChannelStore.getChannel(channelId) || null;
			}

			processChannelTitlePatch (e) {
				const channel = this.getChannelFromTitlePatchEvent(e);
				if (!this.isTranslatableChannelTitle(channel) || !this.isTranslationEnabled(channel.id)) return;
				const translatedTitle = this.getActiveChannelTitleTranslation(channel);
				if (!translatedTitle) {
					this.queueChannelTitleTranslation(channel);
					return;
				}
				e.returnvalue = this.replaceChannelTitleInRenderTree(e.returnvalue, channel.name, translatedTitle);
			}

			forceUpdateChannelTitleComponents () {
				BDFDB.PatchUtils.forceAllUpdates(this, ["HeaderBarChannelName", "HeaderBarTitle", "ThreadCard", "ThreadSidebar", "ChannelThreadItem"]);
			}

			processHeaderBarChannelName (e) {this.processChannelTitlePatch(e);}
			processHeaderBarTitle (e) {this.processChannelTitlePatch(e);}
			processThreadCard (e) {this.processChannelTitlePatch(e);}
			processThreadSidebar (e) {this.processChannelTitlePatch(e);}
			processChannelThreadItem (e) {this.processChannelTitlePatch(e);}

			normalizeStoredChannelPrimaryEngineOverrides (overrides) {
				return this.ensureSettingsStore().normalizeStoredChannelPrimaryEngineOverrides(overrides);
			}

			getGlobalPrimaryEngine () {
				const engineKey = this.settings && this.settings.engines && this.settings.engines.translator;
				return translationEngines[engineKey] ? engineKey : Object.keys(translationEngines)[0];
			}

			getEffectivePrimaryEngine (channelId = null) {
				return this.ensureSettingsStore().getChannelPrimaryEngineOverride(channelId) || this.getGlobalPrimaryEngine();
			}

			getEffectiveBackupEngine (channelId = null) {
				const backupEngineKey = this.settings && this.settings.engines && this.settings.engines.backup;
				if (!translationEngines[backupEngineKey] || backupEngineKey == this.getEffectivePrimaryEngine(channelId)) return "----";
				return backupEngineKey;
			}

			getAdditionalCredentialEngineKeys () {
				const activeEngineKeys = new Set([
					this.settings && this.settings.engines && this.settings.engines.translator,
					this.settings && this.settings.engines && this.settings.engines.backup
				]);
				return Object.keys(translationEngines).filter(engineKey => translationEngines[engineKey].key && !activeEngineKeys.has(engineKey));
			}

			isEngineConfiguredForRuntime (engineKey) {
				return this.ensureProviderClient().isEngineConfiguredForRuntime(engineKey);
			}

			engineSupportsLanguage (engineKey, language) {
				const engine = translationEngines[engineKey];
				if (!engine || !language) return false;
				if (language.special) return true;
				if (language.auto) return !!engine.auto;
				return engine.languages.includes(language.id);
			}

			engineSupportsLanguagePair (engineKey, input, output) {
				if (output && output.special) return true;
				return this.engineSupportsLanguage(engineKey, input) && this.engineSupportsLanguage(engineKey, output);
			}

			hasChannelPrimaryEngineOverride (channelId) {
				return this.ensureSettingsStore().hasChannelPrimaryEngineOverride(channelId);
			}

			saveChannelPrimaryEngineOverrides () {
				this.ensureSettingsStore().saveChannelPrimaryEngineOverrides();
			}

			setChannelPrimaryEngine (channelId, engineKey) {
				return this.ensureSettingsStore().setChannelPrimaryEngine(channelId, engineKey);
			}

			clearChannelPrimaryEngineOverride (channelId) {
				return this.ensureSettingsStore().clearChannelPrimaryEngineOverride(channelId);
			}

			refreshChannelPrimaryEngineRuntime (channelId) {
				if (!channelId) return;
				this.clearDisplayedAutoTranslations(channelId);
				this.clearAutoTranslationQueue(channelId);
				this.resetAutoTranslationTracking(channelId);
				this.scheduleTranslationRerender();
				this.processAutoTranslationQueue();
			}

			createEmptyChannelEnablementState (globalDefault = false) {
				return createEmptyChannelEnablementState(globalDefault);
			}

			normalizeStoredChannelEnablementState (state) {
				return normalizeStoredChannelEnablementState(state);
			}

			migrateLegacyChannelEnablementState (stateKeys) {
				return migrateLegacyChannelEnablementState(stateKeys);
			}

			loadChannelEnablementState (primaryStoredState, secondaryStoredState) {
				return loadChannelEnablementState(primaryStoredState, secondaryStoredState);
			}

			getChannelEnablementStateValue (channelId, state) {
				return getChannelEnablementStateValue(channelId, state);
			}

			channelEnablementStatesEqual (leftState, rightState) {
				return channelEnablementStatesEqual(leftState, rightState);
			}

			saveChannelEnablementState (nextState) {
				return this.ensureSettingsStore().saveChannelEnablementState(nextState);
			}

			setChannelEnablementStateValue (channelId, enabled) {
				return this.ensureSettingsStore().setChannelEnablementStateValue(channelId, enabled);
			}

			async toggleTranslation (channelId) {
				const operationVersion = channelToggleOperations.begin(channelId), wasEnabled = this.isTranslationEnabled(channelId);
				this.setChannelEnablementStateValue(channelId, !wasEnabled);
				if (wasEnabled) {
					// A disabled channel session invalidates every in-flight commit before the
					// restore transaction repaints originals with acknowledgement.
					const displayGeneration = this.getReceivedDisplayGeneration(channelId);
					if (displayGeneration !== undefined) this.setReceivedDisplayGeneration(channelId, displayGeneration + 1);
					this.clearAutoTranslationQueue(channelId, {preservePreviews: true});
					this.resetAutoTranslationTracking(channelId);
					try {await this.restoreReceivedDisplayChannel(channelId, {clearPreviews: true, clearSuppressions: true});}
					finally {if (channelToggleOperations.isCurrent(channelId, operationVersion) && !this.isTranslationEnabled(channelId)) {
							this.clearDisplayedAutoTranslations(channelId, {includeManual: true});
							this.processAutoTranslationQueue();
						}}
					return;
				}
				this.resetAutoTranslationTracking(channelId);
				this.scheduleTranslationRerender();
				this.processAutoTranslationQueue();
			}
			isTranslationEnabled (channelId) {
				return this.ensureSettingsStore().isTranslationEnabled(channelId);
			}

			toggleReceivedAutoTranslation (channelId) {
				return this.toggleTranslation(channelId);
			}

			isReceivedAutoTranslationEnabled (channelId) {
				return this.isTranslationEnabled(channelId);
			}

			setLanguages () {
				if (this.settings.engines.translator == this.settings.engines.backup) {
					this.settings.engines.backup = Object.keys(translationEngines).filter(n => n != this.settings.engines.translator)[0];
					BDFDB.DataUtils.save(this.settings.engines, this, "engines");
				}
				let languageIds = Object.values(translationEngines).reduce((ids, translationEngine) => ids.concat(translationEngine.languages || []), []);
				const builtLanguages = BDFDB.ObjectUtils.deepAssign(
					!Object.values(translationEngines).some(translationEngine => translationEngine.auto) ? {} : {
						auto: {
							auto: true,
							name: this.labels.detect_language,
							id: "auto"
						}
					},
					BDFDB.ObjectUtils.filter(BDFDB.LanguageUtils.languages, lang => languageIds.includes(lang.id)),
					{
						binary:	{
							special: true,
							name: "Binary",
							id: "binary"
						},
						braille: {
							special: true,
							name: "Braille 6-dot",
							id: "braille"
						},
						morse: {
							special: true,
							name: "Morse",
							id: "morse"
						},
                        hex: {
                            special: true,
                            name: "Hexadecimal",
                            id: "hex"
                        },
					}
				);
				this.ensureSettingsStore().setLanguages(builtLanguages);
			}

			getLanguageData (language) {
				if (!language) return null;
				if (typeof language == "string") return this.ensureSettingsStore().getLanguage(language) || BDFDB.LanguageUtils.languages[language] || {id: language, name: language};
				return language;
			}

			getChineseLanguageName (languageId) {
				if (!languageId) return "";
				const overrideNames = {
					auto: "检测语言",
					"zh": "中文",
					"zh-CN": "简体中文",
					"zh-TW": "繁体中文"
				};
				if (overrideNames[languageId]) return overrideNames[languageId];
				const normalizedId = ({
					iw: "he",
					jw: "jv"
				})[languageId] || languageId;
				try {
					if (typeof Intl != "undefined" && typeof Intl.DisplayNames == "function") {
						const displayNames = new Intl.DisplayNames(["zh-Hans"], {type: "language"});
						return displayNames.of(normalizedId) || "";
					}
				}
				catch (err) {}
				return "";
			}

			getLanguageDisplayName (language) {
				const languageData = this.getLanguageData(language);
				if (!languageData) return "";
				const baseName = BDFDB.LanguageUtils.getName(languageData) || languageData.name || languageData.id;
				const chineseName = this.getChineseLanguageName(languageData.id);
				if (!chineseName || baseName == chineseName || baseName.includes(` / ${chineseName}`)) return baseName;
				return `${baseName} / ${chineseName}`;
			}

			getTranslationTooltipText (inputLanguage, outputLanguage) {
				return `${this.getLanguageDisplayName(inputLanguage)} -> ${this.getLanguageDisplayName(outputLanguage)}`;
			}

			detectLanguageDetails (text) {
				return new Promise(resolve => {
					this.detectLanguage(text, languageId => {
						const languageData = languageId && this.getLanguageData(languageId);
						resolve(languageData ? languageData : null);
					});
				});
			}

			getOriginalMessageLabel () {
				if (this.isChineseUiLanguage()) return "原文";
				if (this.isRussianUiLanguage()) return "Оригинал";
				return "Original";
			}

			formatOriginalTextForMessage (originalText, useSpoiler = this.shouldUseSpoilerInSentOriginal()) {
				if (!originalText) return "";
				if (useSpoiler) return `\n||${originalText}||`;
				return `\n> ${originalText.split("\n").join("\n> ")}`;
			}

			getCustomEmojiAssetUrl (emojiId, animated = false) {
				if (!emojiId) return "";
				return `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? "gif" : "webp"}?size=40&quality=lossless`;
			}

			createDiscordMarkupDisplayNode (token, key) {
				if (!token) return token;
				let match = /^<(a?):([A-Za-z0-9_~]+):(\d+)>$/.exec(token);
				if (match) {
					const animated = match[1] == "a";
					const emojiName = match[2];
					const emojiId = match[3];
					return BDFDB.ReactUtils.createElement("img", {
						key,
						className: "translator-discord-emoji",
						src: this.getCustomEmojiAssetUrl(emojiId, animated),
						alt: `:${emojiName}:`,
						title: `:${emojiName}:`,
						draggable: false
					});
				}
				match = /^<@!?(\d+)>$/.exec(token);
				if (match) {
					const displayName = this.getMentionDisplayName(match[1]) || "user";
					return BDFDB.ReactUtils.createElement("span", {
						key,
						className: "translator-discord-mention",
						children: `@${displayName}`
					});
				}
				match = /^<@&(\d+)>$/.exec(token);
				if (match) {
					let roleName = "role";
					try {
						const guildId = BDFDB.LibraryStores.SelectedGuildStore && BDFDB.LibraryStores.SelectedGuildStore.getGuildId && BDFDB.LibraryStores.SelectedGuildStore.getGuildId();
						const role = guildId && BDFDB.LibraryStores.GuildStore && BDFDB.LibraryStores.GuildStore.getRole && BDFDB.LibraryStores.GuildStore.getRole(guildId, match[1]);
						if (role && role.name) roleName = role.name;
					}
					catch (err) {}
					return BDFDB.ReactUtils.createElement("span", {
						key,
						className: "translator-discord-mention translator-discord-role-mention",
						children: `@${roleName}`
					});
				}
				match = /^<#(\d+)>$/.exec(token);
				if (match) {
					let channelName = "channel";
					try {
						const channel = BDFDB.LibraryStores.ChannelStore && BDFDB.LibraryStores.ChannelStore.getChannel && BDFDB.LibraryStores.ChannelStore.getChannel(match[1]);
						if (channel && channel.name) channelName = channel.name;
					}
					catch (err) {}
					return BDFDB.ReactUtils.createElement("span", {
						key,
						className: "translator-discord-mention translator-discord-channel-mention",
						children: `#${channelName}`
					});
				}
				return token;
			}

			renderDiscordMarkupText (text, keyPrefix = "discord-markup") {
				if (text == null) return "";
				text = String(text);
				const nodes = [];
				const tokenRegex = /(<a?:[A-Za-z0-9_~]+:\d+>|<@!?\d+>|<@&\d+>|<#\d+>)/g;
				let lastIndex = 0;
				let match;
				let index = 0;
				while ((match = tokenRegex.exec(text))) {
					if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
					nodes.push(this.createDiscordMarkupDisplayNode(match[0], `${keyPrefix}-${index++}`));
					lastIndex = match.index + match[0].length;
				}
				if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
				return nodes;
			}

			createOriginalMessageBlock (originalText) {
				if (!originalText) return null;
				return BDFDB.ReactUtils.createElement("div", {
					key: "translator-original-message",
					className: "translator-original-message",
					children: BDFDB.ReactUtils.createElement("span", {
						className: this.shouldUseSpoilerInReceivedOriginal() ? "translator-original-spoiler" : null,
						children: this.renderDiscordMarkupText(originalText, "translator-original")
					})
				});
			}

			getLanguageChoice (direction, place, channelId) {
				return this.ensureSettingsStore().getLanguageChoice(direction, place, channelId);
			}

			saveLanguageChoice (choice, direction, place, channelId) {
				this.ensureSettingsStore().saveLanguageChoice(choice, direction, place, channelId);
			}

			getAutoTranslateSourceLanguages () {
				return languagePolicy.getConcreteConfiguredLanguages(this, "autoTranslateSourceLanguages");
			}

			normalizeLanguageId (languageId) {
				return languagePolicy.normalizeLanguageId(this, languageId);
			}

			matchesConfiguredSourceLanguage (languageId, sourceLanguages = null) {
				return languagePolicy.matchesConfiguredSourceLanguage(this, languageId, sourceLanguages);
			}

			getLanguageDetectionStrategy () {
				return languageDetectionRuntime.getStrategy(this);
			}

			detectLanguage (text, callback) {
				return languageDetectionRuntime.detectLanguage(this, text, callback);
			}

			shouldSkipSentTranslationForSameTarget (text, channelId, forcedOutputLanguage = null, callback) {
				return sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(this, text, channelId, forcedOutputLanguage, callback);
			}

			shouldSendOriginalInsteadOfSentTranslation (originalText, translation, input, output) {
				return sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(this, originalText, translation, input, output);
			}

			buildSentTranslationMessageValue (originalText, translation, input, output) {
				return sentTranslationPolicy.buildSentTranslationMessageValue(this, originalText, translation, input, output);
			}

			shouldAutoTranslateSentMessage (text, channelId, callback, forcedOutputLanguage = null) {
				return sentTranslationPolicy.shouldAutoTranslateSentMessage(this, text, channelId, callback, forcedOutputLanguage);
			}

			createSentAutomaticTranslationRequest (channelId, originalText, messageId = null) {
				return this.ensureSentTranslationStore().createRequest(channelId, originalText, messageId);
			}

			isSentAutomaticTranslationRequestCurrent (request) {
				return this.ensureSentTranslationStore().isRequestCurrent(request);
			}

			completeSentAutomaticTranslationRequest (request, translatedText, submit) {
				return this.ensureSentTranslationStore().completeRequest(request, translatedText, submit);
			}

			invalidateSentAutomaticTranslationRequests (channelId = null) {
				return this.ensureSentTranslationStore().invalidateRequests(channelId);
			}

			trackPendingSentOriginal (channelId, originalText, submittedText) {
				return this.ensureSentTranslationStore().trackPendingOriginal(channelId, originalText, submittedText);
			}

			captureSentOriginalMessage (message, channelId = null) {
				return this.ensureSentTranslationStore().captureEcho(message, channelId);
			}

			getEditableSentMessageText (messageId, currentText) {
				return this.ensureSentTranslationStore().getEditableText(messageId, currentText);
			}

			ensureTranslationPipeline () {
				if (!this.translationPipelineInstance) this.translationPipelineInstance = createTranslationPipeline({BDFDB, getPlugin: () => this, messageTypes, languageTypes});
				return this.translationPipelineInstance;
			}
			translateMessage (message, channel, options = {}) {
				return this.ensureTranslationPipeline().translateMessage(message, channel, options);
			}

			translateText (text, place, callback, forcedOutputLanguage = null, options = {}) {
				return this.ensureTranslationPipeline().translateText(text, place, callback, forcedOutputLanguage, options);
			}
			validTranslator (key, input, output, specialCase) {
				let engine = translationEngines[key];
				if (!engine || typeof this[engine.funcName] != "function") return false;
				if (!this.isEngineConfiguredForRuntime(key)) return false;
				return specialCase || this.engineSupportsLanguagePair(key, input, output);
			}

			isValidatableEngine (engineKey) {
				return this.ensureProviderClient().isValidatableEngine(engineKey);
			}

			normalizeApiEndpoint (engineKey, endpoint) {
				return this.ensureProviderClient().normalizeApiEndpoint(engineKey, endpoint);
			}

			supportsModelCatalog (engineKey) {
				return this.ensureProviderClient().supportsModelCatalog(engineKey);
			}

			getModelCatalogEndpoint (engineKey, endpoint) {
				return this.ensureProviderClient().getModelCatalogEndpoint(engineKey, endpoint);
			}

			fetchModelCatalog (engineKey, onUpdate = null) {
				return this.ensureProviderClient().fetchModelCatalog(engineKey, onUpdate);
			}

			mapLanguageCodeForEngine (engineKey, languageId) {
				return this.ensureProviderClient().mapLanguageCodeForEngine(engineKey, languageId);
			}

			getValidationRequestForEngine (engineKey) {
				return this.ensureProviderClient().getValidationRequestForEngine(engineKey);
			}

			getValidationErrorDetails (body) {
				return this.ensureProviderClient().getValidationErrorDetails(body);
			}

			validateEngineConfig (engineKey) {
				return this.ensureProviderClient().validateEngineConfig(engineKey);
			}
			googleApiTranslate (data, callback) {
				return this.ensureProviderClient().googleApiTranslate(data, callback);
			}

			googleCloudTranslate (data, callback) {
				return this.ensureProviderClient().googleCloudTranslate(data, callback);
			}
			microsoftTranslate (data, callback) {
				return this.ensureProviderClient().microsoftTranslate(data, callback);
			}
			deepLTranslate (data, callback) {
				return this.ensureProviderClient().deepLTranslate(data, callback);
			}

			buildAiProviderTranslationPrompt (data) {
				return this.ensureProviderClient().buildAiProviderTranslationPrompt(data);
			}

			parseOpenAiResponseText (body) {
				return this.ensureProviderClient().parseOpenAiResponseText(body);
			}

			parseGeminiResponseText (body) {
				return this.ensureProviderClient().parseGeminiResponseText(body);
			}

			requestAiProviderTranslation (engineKey, url, options, parseResponse, callback) {
				return this.ensureProviderClient().requestAiProviderTranslation(engineKey, url, options, parseResponse, callback);
			}

			openAiTranslate (data, callback) {
				return this.ensureProviderClient().openAiTranslate(data, callback);
			}

			geminiTranslate (data, callback) {
				return this.ensureProviderClient().geminiTranslate(data, callback);
			}

			chatCompletionsTranslate (engineKey, data, callback) {
				return this.ensureProviderClient().chatCompletionsTranslate(engineKey, data, callback);
			}

			deepSeekTranslate (data, callback) {
				return this.ensureProviderClient().deepSeekTranslate(data, callback);
			}

			openAiCompatibleTranslate (data, callback) {
				return this.ensureProviderClient().openAiCompatibleTranslate(data, callback);
			}
						iTranslateTranslate (data, callback) {
				return this.ensureProviderClient().iTranslateTranslate(data, callback);
			}
			yandexTranslate (data, callback) {
				return this.ensureProviderClient().yandexTranslate(data, callback);
			}
			papagoTranslate (data, callback) {
				return this.ensureProviderClient().papagoTranslate(data, callback);
			}
			baiduTranslate (data, callback) {
				return this.ensureProviderClient().baiduTranslate(data, callback);
			}
			MD5 (e) {
				return this.ensureProviderClient().MD5(e);
			}

			checkForSpecialCase (text, input) {
				if (input.special) return input;
				else if (input.auto) {
					if (/^[0-1]*$/.test(text.replace(/\s/g, ""))) {
						return {id: "binary", name: "Binary"};
					}
					else if (/^[⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿]*$/.test(text.replace(/\s/g, ""))) {
						return {id: "braille", name: "Braille 6-dot"};
					}
					else if (/^[/|·−._-]*$/.test(text.replace(/\s/g, ""))) {
						return {id: "morse", name: "Morse"};
					}
					else if (/^(0x[0-9a-fA-F]{2}\s*)+$/.test(text.replace(/\s/g, ""))) {
						return {id: "hex", name: "Hexadecimal"};
					}
				}
				return null;
			}

			string2binary (string) {
				let binary = "";
				for (let character of string) binary += parseInt(character.charCodeAt(0).toString(2)).toPrecision(8).split(".").reverse().join("").toString() + " ";
				return binary;
			}

			string2braille (string) {
				let braille = "";
				for (let character of string) braille += brailleConverter[character.toLowerCase()] ? brailleConverter[character.toLowerCase()] : character;
				return braille;
			}

			string2morse (string) {
				string = string.replace(/ /g, "%%%%%%%%%%");
				let morse = "";
				for (let character of string) morse += (morseConverter[character.toLowerCase()] ? morseConverter[character.toLowerCase()] : character) + " ";
				morse = morse.split("\n");
				for (let i in morse) morse[i] = morse[i].trim();
				return morse.join("\n").replace(/% % % % % % % % % % /g, "/ ");
			}
			string2hex(string) {
				let hex = "";
				for (let character of string) {
					hex += "0x" + character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0") + " ";
				}
				return hex.trim();
			}			
			binary2string (binary) {
				let string = "";
				binary = binary.replace(/\n/g, "00001010").replace(/\r/g, "00001101").replace(/\t/g, "00001001").replace(/\s/g, "");
				if (/^[0-1]*$/.test(binary)) {
					let eightDigits = "";
					let counter = 0;
					for (let digit of binary) {
						eightDigits += digit;
						counter++;
						if (counter > 7) {
							string += String.fromCharCode(parseInt(eightDigits, 2).toString(10));
							eightDigits = "";
							counter = 0;
						}
					}
				}
				else BDFDB.NotificationUtils.toast("Invalid binary format. Only use 0s and 1s.", {
					type: "danger",
					position: "center"
				});
				return string;
			}

			braille2string (braille) {
				let string = "";
				for (let character of braille) string += brailleConverter[character.toLowerCase()] ? brailleConverter[character.toLowerCase()] : character;
				return string;
			}

			morse2string (morse) {
				let string = "";
				for (let word of morse.replace(/[_-]/g, "−").replace(/\./g, "·").replace(/\r|\t/g, "").split(/\/|\||\n/g)) {
					for (let characterstr of word.trim().split(" ")) string += morseConverter[characterstr] ? morseConverter[characterstr] : characterstr;
					string += " ";
				}
				return string.trim();
			}

			hex2string(hex) {
				let string = "";
				for (let part of hex.trim().split(/\s+/)) {
					if (part.startsWith("0x") || part.startsWith("0X")) {
						part = part.slice(2);
					}
					if (part.length === 2 && /^[0-9a-fA-F]{2}$/.test(part)) {
						string += String.fromCharCode(parseInt(part, 16));
					}
				}
				return string;
			}			

			escapeRegExp (string) {
				return protectionLogic.escapeRegExp(this, string);
			}

			getExceptionScopeSetting (key, fallback = true) {
				return protectionLogic.getExceptionScopeSetting(this, key, fallback);
			}

			shouldProtectConfiguredTermsForPlace (place) {
				return protectionLogic.shouldProtectConfiguredTermsForPlace(this, place);
			}

			shouldProtectWrappedTextForPlace (place) {
				return protectionLogic.shouldProtectWrappedTextForPlace(this, place);
			}

			getProtectedTermsList () {
				return protectionLogic.getProtectedTermsList(this);
			}

			trimTrailingProtectedPunctuation (text) {
				return protectionLogic.trimTrailingProtectedPunctuation(this, text);
			}

			protectRegexMatches (string, regex, protectedSegments = {}, count = 0, options = {}) {
				return protectionLogic.protectRegexMatches(this, string, regex, protectedSegments, count, options);
			}

			protectCodeBlockSegments (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectCodeBlockSegments(this, string, protectedSegments, count);
			}

			protectAutoDetectedSegments (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectAutoDetectedSegments(this, string, protectedSegments, count);
			}

			protectDiscordMarkupSegments (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectDiscordMarkupSegments(this, string, protectedSegments, count);
			}

			protectQuotedTextSegments (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectQuotedTextSegments(this, string, protectedSegments, count);
			}

			protectWrappedTextSegments (string, protectedSegments = {}, count = 0, place = null) {
				return protectionLogic.protectWrappedTextSegments(this, string, protectedSegments, count, place);
			}

			protectConfiguredTerms (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectConfiguredTerms(this, string, protectedSegments, count);
			}

			protectAutoTechnicalTerms (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectAutoTechnicalTerms(this, string, protectedSegments, count);
			}

			protectMixedLanguageLatinTokens (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectMixedLanguageLatinTokens(this, string, protectedSegments, count);
			}

			getUnicodeEmojiDetector () {
				return protectionLogic.getUnicodeEmojiDetector();
			}

			isUnicodeEmojiGrapheme (segment) {
				return protectionLogic.isUnicodeEmojiGrapheme(this, segment);
			}

			getUnicodeEmojiRegex () {
				return protectionLogic.getUnicodeEmojiRegex();
			}

			protectUnicodeEmojiSegments (string, protectedSegments = {}, count = 0) {
				return protectionLogic.protectUnicodeEmojiSegments(this, string, protectedSegments, count);
			}

			createProtectionPlaceholder (count) {
				return protectionLogic.createProtectionPlaceholder(this, count);
			}

			getProtectionPlaceholderRegex (count) {
				return protectionLogic.getProtectionPlaceholderRegex(this, count);
			}

			formatProtectedExceptionForDisplay (exception) {
				return protectionLogic.formatProtectedExceptionForDisplay(this, exception);
			}

			hasAllProtectionPlaceholders (string, protectedSegments) {
				return protectionLogic.hasAllProtectionPlaceholders(this, string, protectedSegments);
			}

			addExceptions (string, protectedSegments) {
				return protectionLogic.addExceptions(this, string, protectedSegments);
			}

			removeExceptions (string, place) {
				return protectionLogic.removeExceptions(this, string, place);
			}

			getGoogleTranslatePageURL (input, output, text) {
				return `https://translate.google.com/#${BDFDB.LanguageUtils.languages[input] ? input : "auto"}/${output}/${encodeURIComponent(text)}`;
			}

			setLabelsByLanguage () {
				return getLabelsForUiLanguage(this.getUiLanguageId());
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
