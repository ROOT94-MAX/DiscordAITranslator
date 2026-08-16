// The BetterDiscord settings panel: every collapse section, form, selector and
// colour chip the plugin shows under Plugin Settings. It was the single largest
// method on the legacy Translator class, and it is a React render tree rather than
// logic - it reads plugin getters, writes back through BDFDB.DataUtils.save, and asks
// BDFDB to re-render itself.
//
// The panel owns no state of its own. Two scratch records live on the plugin instance
// (plugin.secretInputState and plugin.translatedTextColorState) because a refresh
// rebuilds this whole tree, so anything the panel kept locally would be lost on every
// interaction that triggers refreshPanel().
//
// BDFDB arrives in the dependencies object rather than as a module import: it is a live
// BetterDiscord library handle the plugin factory receives, not something this module
// can require. BdApi is a genuine Discord global and is referenced directly, exactly as
// the legacy factory did.
//
// Careful with `this` in here. Two nested scopes have their own receiver and keep it:
// the Element.prototype.scrollIntoView shim inside lockStableSelectScrollIntoView,
// where `this` is the DOM element being scrolled, and the anonymous
// BdApi.React.Component subclass inside createStackedTokenInput, where `this` is the
// component. Everywhere else `this` meant the plugin and is now the injected `plugin`
// parameter.

const {translationEngines, enginePortals} = require("../providers/provider-client");

// Same values as the legacy factory-scope languageTypes/messageTypes maps, and as
// LANGUAGE_DIRECTIONS/MESSAGE_DIRECTIONS in settings-store.js and
// language-heuristics.js. Kept as a local copy, under the legacy names, so the panel
// body reads exactly the way it did inside runtime.js and the panel does not own
// runtime-wide vocabulary for everyone else.
const languageTypes = Object.freeze({INPUT: "input", OUTPUT: "output"});
const messageTypes = Object.freeze({RECEIVED: "received", SENT: "sent"});

function renderBdfdbLoadingPanel() {
	const panel = document.createElement("div");
	panel.style.color = "var(--text-normal)";
	panel.style.fontSize = "16px";
	panel.style.lineHeight = "22px";
	panel.style.whiteSpace = "pre-wrap";
	panel.textContent = "BDFDB 正在加载，请稍后重新打开设置。\nBDFDB is loading. Please reopen settings in a few seconds.";
	return panel;
}

function renderSettingsPanel(plugin, collapseStates = {}, dependencies = {}) {
	const {BDFDB} = dependencies;
	if (typeof window == "undefined" || !window.BDFDB_Global || !window.BDFDB_Global.loaded) return renderBdfdbLoadingPanel();
	let settingsPanel;
	return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(plugin, {
		collapseStates: collapseStates,
		children: _ => {
			let settingsItems = [];
			const recommendedEngines = ["microsoft", "googlecloud", "googleapi", "deepseek", "openai", "gemini", "oaicompat"];
			const getSettingsPanelRoot = () => document.querySelector(".translator-settings-panel-root");
			const isScrollableElement = node => {
				if (!node || node == document || node == document.body || node == document.documentElement) return false;
				if (typeof node.scrollTop != "number" || typeof node.scrollHeight != "number" || typeof node.clientHeight != "number") return false;
				if (node.scrollHeight <= node.clientHeight + 1) return false;
				let overflowY = "";
				try {
					const style = window.getComputedStyle(node);
					overflowY = style && style.overflowY || "";
				}
				catch (err) {}
				// Discord/BDFDB scrollers can use generated classes or overlay/hidden overflow, so relying only on auto/scroll misses the real modal scroller.
				return overflowY != "visible" && overflowY != "clip" || node.scrollTop > 0;
			};
			const getSettingsPanelScrollElements = root => {
				const scrollers = [];
				const addScroller = node => {
					if (node && isScrollableElement(node) && !scrollers.includes(node)) scrollers.push(node);
				};
				let current = root;
				while (current && current.parentElement) {
					addScroller(current);
					current = current.parentElement;
				}
				addScroller(current);
				try {
					for (const node of document.querySelectorAll("div")) {
						if (node.scrollTop > 0) addScroller(node);
					}
				}
				catch (err) {}
				return scrollers;
			};
			const captureSettingsPanelScrollState = () => {
				const root = getSettingsPanelRoot();
				if (!root) return null;
				const scrollers = getSettingsPanelScrollElements(root);
				if (!scrollers.length) return null;
				return {
					items: scrollers.map(scroller => ({
						scroller,
						scrollTop: scroller.scrollTop,
						scrollLeft: scroller.scrollLeft
					})),
					windowX: typeof window != "undefined" ? window.scrollX : 0,
					windowY: typeof window != "undefined" ? window.scrollY : 0
				};
			};
			const applySettingsPanelScrollState = scrollState => {
				if (!scrollState || !scrollState.items) return;
				for (const item of scrollState.items) {
					if (!item || !item.scroller) continue;
					const maxScrollTop = Math.max(0, item.scroller.scrollHeight - item.scroller.clientHeight);
					const maxScrollLeft = Math.max(0, item.scroller.scrollWidth - item.scroller.clientWidth);
					item.scroller.scrollTop = Math.max(0, Math.min(item.scrollTop, maxScrollTop));
					item.scroller.scrollLeft = Math.max(0, Math.min(item.scrollLeft || 0, maxScrollLeft));
				}
				if (typeof window != "undefined") window.scrollTo(scrollState.windowX || 0, scrollState.windowY || 0);
			};
			const restoreSettingsPanelScrollState = scrollState => {
				if (!scrollState) return;
				applySettingsPanelScrollState(scrollState);
				requestAnimationFrame(() => {
					applySettingsPanelScrollState(scrollState);
					requestAnimationFrame(() => applySettingsPanelScrollState(scrollState));
				});
			};
			const refreshPanel = () => {
				const scrollState = captureSettingsPanelScrollState();
				BDFDB.PluginUtils.refreshSettingsPanel(plugin, settingsPanel, collapseStates);
				restoreSettingsPanelScrollState(scrollState);
			};
			const saveAuthField = (engineKey, field, value) => {
				plugin.ensureSettingsStore().setCredentialField(engineKey, field, value);
				plugin.SettingsUpdated = true;
			};
			const saveReceivedFilterSetting = (key, value) => {
				saveFilterSetting(key, value);
			};
			const infoText = text => BDFDB.ReactUtils.createElement("div", {
				className: "translator-settings-note",
				children: text
			});
			const isChineseUi = plugin.isChineseUiLanguage();
			const isRussianUi = plugin.isRussianUiLanguage();
			const compactText = (zh, en, ru = null) => isChineseUi ? zh : isRussianUi ? (ru || en) : en;
			const getEnginePortalConfig = engineKey => {
				const portal = enginePortals[engineKey];
				if (!portal) return null;
				return {
					primaryUrl: portal.primaryUrl,
					primaryLabel: isChineseUi ? portal.primaryLabelZh : portal.primaryLabelEn,
					secondaryUrl: portal.secondaryUrl,
					secondaryLabel: isChineseUi ? portal.secondaryLabelZh : portal.secondaryLabelEn,
					hint: isChineseUi ? portal.hintZh : portal.hintEn
				};
			};
			const defaultSecondaryButtonColor = BDFDB.LibraryComponents.Button.Colors.PRIMARY || BDFDB.LibraryComponents.Button.Colors.GREY || undefined;
			const createActionButton = ({label, onClick, color = undefined, look = null, className = null}) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
				size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
				color: color === null ? undefined : (color || defaultSecondaryButtonColor),
				look: look || undefined,
				className,
				onClick,
				children: label
			});
			let stableSelectScrollState = null;
			let stableSelectScrollIntoViewOriginal = null;
			let stableSelectScrollLockTimer = null;
			const restoreStableSelectScrollIntoView = _ => {
				try {
					if (stableSelectScrollIntoViewOriginal && typeof Element != "undefined" && Element.prototype.scrollIntoView != stableSelectScrollIntoViewOriginal) Element.prototype.scrollIntoView = stableSelectScrollIntoViewOriginal;
				}
				catch (err) {}
				stableSelectScrollIntoViewOriginal = null;
			};
			const lockStableSelectScrollIntoView = (duration = 900) => {
				try {
					if (typeof Element == "undefined" || !Element.prototype || typeof Element.prototype.scrollIntoView != "function") return;
					if (!stableSelectScrollIntoViewOriginal) {
						stableSelectScrollIntoViewOriginal = Element.prototype.scrollIntoView;
						Element.prototype.scrollIntoView = function () {
							if (this && this.closest && this.closest(".translator-settings-panel-root")) return;
							return stableSelectScrollIntoViewOriginal.apply(this, arguments);
						};
					}
					if (stableSelectScrollLockTimer) clearTimeout(stableSelectScrollLockTimer);
					stableSelectScrollLockTimer = setTimeout(restoreStableSelectScrollIntoView, duration);
				}
				catch (err) {}
			};
			const restoreStableSelectScroll = (scrollState, repeat = false) => {
				if (!scrollState) return;
				const apply = _ => restoreSettingsPanelScrollState(scrollState);
				requestAnimationFrame(apply);
				setTimeout(apply, 0);
				if (repeat) [16, 40, 80, 160, 320, 520].forEach(delay => setTimeout(apply, delay));
			};
			const createStableSelect = props => {
				const getScrollState = _ => stableSelectScrollState || captureSettingsPanelScrollState();
				const rememberScroll = _ => {
					stableSelectScrollState = captureSettingsPanelScrollState();
					return stableSelectScrollState;
				};
				const rememberAndSoftRestore = (repeat = false) => {
					const scrollState = rememberScroll();
					lockStableSelectScrollIntoView(repeat ? 1200 : 700);
					restoreStableSelectScroll(scrollState, repeat);
					return scrollState;
				};
				const callHandler = (name, event) => {
					if (props && typeof props[name] == "function") return props[name](event);
				};
				const captureOnly = _ => {
					rememberScroll();
					lockStableSelectScrollIntoView(900);
				};
				const selectProps = Object.assign({
					menuShouldScrollIntoView: false,
					menuShouldBlockScroll: false,
					captureMenuScroll: false,
					menuPosition: "fixed",
					menuPlacement: "auto",
					menuPortalTarget: typeof document != "undefined" ? document.body : undefined,
					closeMenuOnSelect: true,
					maxMenuHeight: typeof window != "undefined" ? Math.max(150, Math.min(240, Math.floor(window.innerHeight * 0.36))) : 220
				}, props);
				selectProps.onMouseDown = event => {
					rememberAndSoftRestore(true);
					callHandler("onMouseDown", event);
				};
				selectProps.onPointerDown = event => {
					rememberAndSoftRestore(true);
					callHandler("onPointerDown", event);
				};
				selectProps.onClick = event => {
					rememberAndSoftRestore(true);
					callHandler("onClick", event);
				};
				selectProps.onKeyDown = event => {
					if (event && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) rememberAndSoftRestore(true);
					callHandler("onKeyDown", event);
				};
				selectProps.onFocus = event => {
					rememberAndSoftRestore(true);
					callHandler("onFocus", event);
				};
				selectProps.onMenuOpen = _ => {
					rememberAndSoftRestore(true);
					callHandler("onMenuOpen");
				};
				selectProps.onMenuClose = _ => {
					const scrollState = getScrollState();
					callHandler("onMenuClose");
					restoreStableSelectScroll(scrollState, true);
					setTimeout(_ => {stableSelectScrollState = null;}, 450);
				};
				return BDFDB.ReactUtils.createElement("div", {
					className: "translator-stable-select-wrap",
					onMouseDownCapture: captureOnly,
					onPointerDownCapture: captureOnly,
					onFocusCapture: captureOnly,
					children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Select, selectProps)
				});
			};
			const createSegmentedSelector = ({options, value, onChange, className = ""}) => BDFDB.ReactUtils.createElement("div", {
				className: BDFDB.DOMUtils.formatClassName("translator-segmented-group", className),
				children: options.map(option => BDFDB.ReactUtils.createElement("button", {
					type: "button",
					disabled: !!option.disabled,
					className: BDFDB.DOMUtils.formatClassName("translator-segmented-button", option.value == value && "translator-segmented-button-active", option.disabled && "translator-segmented-button-disabled"),
					onClick: _ => !option.disabled && onChange(option.value),
					children: option.label
				}))
			});
			const ensureSecretInputState = () => {
				if (!plugin.secretInputState) plugin.secretInputState = {};
				return plugin.secretInputState;
			};
			const isSecretFieldVisible = fieldKey => !!ensureSecretInputState()[fieldKey];
			const toggleSecretFieldVisibility = fieldKey => {
				const secretState = ensureSecretInputState();
				secretState[fieldKey] = !secretState[fieldKey];
				refreshPanel();
			};
			const createSecretToggleIcon = visible => BDFDB.ReactUtils.createElement("svg", {
				viewBox: "0 0 24 24",
				width: 18,
				height: 18,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.8,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				children: [
					BDFDB.ReactUtils.createElement("path", {d: "M2.2 12s3.6-5.8 9.8-5.8S21.8 12 21.8 12 18.2 17.8 12 17.8 2.2 12 2.2 12Z", key: "outline"}),
					BDFDB.ReactUtils.createElement("circle", {cx: "12", cy: "12", r: "2.6", key: "pupil"}),
					!visible && BDFDB.ReactUtils.createElement("path", {d: "M4 19.2 19.2 4", key: "slash"})
				].filter(Boolean)
			});
			const createSecretInput = ({fieldKey, placeholder, value, onChange}) => BDFDB.ReactUtils.createElement("div", {
				className: "translator-secret-input-row",
				children: [
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
						className: "translator-secret-input",
						type: isSecretFieldVisible(fieldKey) ? "text" : "password",
						placeholder,
						value,
						onChange
					}),
					BDFDB.ReactUtils.createElement("button", {
						type: "button",
						className: "translator-secret-toggle",
						"aria-label": isSecretFieldVisible(fieldKey) ? plugin.getCustomText("hide_secret_label") : plugin.getCustomText("show_secret_label"),
						title: isSecretFieldVisible(fieldKey) ? plugin.getCustomText("hide_secret_label") : plugin.getCustomText("show_secret_label"),
						onClick: _ => toggleSecretFieldVisibility(fieldKey),
						children: createSecretToggleIcon(isSecretFieldVisible(fieldKey))
					})
				]
			});
			const createExceptionScopeSwitches = (sentKey, receivedKey, sentLabelKey, receivedLabelKey) => BDFDB.ReactUtils.createElement("div", {
				className: "translator-settings-switch-group",
				children: [
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
						type: "Switch",
						className: "translator-settings-switch-row",
						label: plugin.getCustomText(sentLabelKey),
						tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
						value: plugin.getExceptionScopeSetting(sentKey, true),
						onChange: value => {
							if (!plugin.settings.exceptions) plugin.settings.exceptions = {};
							plugin.settings.exceptions[sentKey] = !!value;
							BDFDB.DataUtils.save(!!value, plugin, "exceptions", sentKey);
							plugin.SettingsUpdated = true;
						}
					}),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
						type: "Switch",
						className: "translator-settings-switch-row",
						label: plugin.getCustomText(receivedLabelKey),
						tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
						value: plugin.getExceptionScopeSetting(receivedKey, true),
						onChange: value => {
							if (!plugin.settings.exceptions) plugin.settings.exceptions = {};
							plugin.settings.exceptions[receivedKey] = !!value;
							BDFDB.DataUtils.save(!!value, plugin, "exceptions", receivedKey);
							plugin.SettingsUpdated = true;
						}
					})
				]
			});
			const createStackedTokenInput = ({items, maxLength, placeholder, emptyText, onChange}) => BDFDB.ReactUtils.createElement(class extends BdApi.React.Component {
				constructor(props) {
					super(props);
					this.state = {
						value: "",
						items: BDFDB.ArrayUtils.is(props.items) ? [].concat(props.items) : []
					};
				}
				componentDidUpdate(prevProps) {
					const previousItems = BDFDB.ArrayUtils.is(prevProps.items) ? prevProps.items : [];
					const nextItems = BDFDB.ArrayUtils.is(this.props.items) ? this.props.items : [];
					if (JSON.stringify(previousItems) != JSON.stringify(nextItems)) this.setState({items: [].concat(nextItems)});
				}
				commitValue(rawValue) {
					let value = String(rawValue == null ? this.state.value : rawValue).trim();
					if (!value) return;
					if (typeof this.props.maxLength == "number" && this.props.maxLength > 0) value = value.slice(0, this.props.maxLength);
					const currentItems = BDFDB.ArrayUtils.is(this.state.items) ? this.state.items : [];
					if (currentItems.includes(value)) {
						this.setState({value: ""});
						return;
					}
					const nextItems = [].concat(currentItems, value);
					this.setState({value: "", items: nextItems});
					this.props.onChange(nextItems);
				}
				removeItem(targetItem) {
					const currentItems = BDFDB.ArrayUtils.is(this.state.items) ? this.state.items : [];
					const nextItems = currentItems.filter(item => item != targetItem);
					this.setState({items: nextItems});
					this.props.onChange(nextItems);
				}
				render() {
					const currentItems = BDFDB.ArrayUtils.is(this.state.items) ? this.state.items : [];
					return BDFDB.ReactUtils.createElement("div", {
						className: "translator-token-editor",
						children: [
							BDFDB.ReactUtils.createElement("div", {
								className: "translator-token-list",
								children: currentItems.length ? currentItems.map(item => BDFDB.ReactUtils.createElement("div", {
									className: "translator-token-badge",
									key: item,
									children: [
										BDFDB.ReactUtils.createElement("span", {
											className: "translator-token-badge-text",
											children: item
										}),
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
											className: "translator-token-badge-delete",
											name: BDFDB.LibraryComponents.SvgIcon.Names.CLOSE,
											onClick: _ => this.removeItem(item)
										})
									]
								})) : BDFDB.ReactUtils.createElement("div", {
									className: "translator-token-empty",
									children: emptyText || placeholder
								})
							}),
							BDFDB.ReactUtils.createElement("div", {
								className: "translator-token-input-row",
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
									value: this.state.value,
									placeholder,
									maxLength,
									onChange: value => this.setState({value}),
									onKeyDown: event => {
										if (event.which == 13) {
											event.preventDefault();
											this.commitValue();
										}
									},
									onBlur: _ => this.commitValue()
								})
							})
						]
					});
				}
			}, {items, maxLength, placeholder, emptyText, onChange});
			const createDisablePrefixForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("disable_prefix_title"),
				className: BDFDB.disCN.marginbottom8,
				children: [
					infoText(plugin.getCustomText("disable_prefix_hint")),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListInput, {
						placeholder: plugin.getCustomText("disable_prefix_placeholder"),
						maxLength: plugin.defaults.exceptions.wordStart.max,
						items: plugin.settings.exceptions.wordStart,
						onChange: value => {
							plugin.SettingsUpdated = true;
							BDFDB.DataUtils.save(value, plugin, "exceptions", "wordStart");
						}
					})
				]
			});
			const createProtectedTermsForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("protected_terms_title"),
				className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.marginbottom8, "translator-advanced-protection-section translator-advanced-protection-terms"),
				children: [
					infoText(plugin.getCustomText("protected_terms_hint")),
					createExceptionScopeSwitches("protectedTermsForSent", "protectedTermsForReceived", "protected_terms_scope_sent", "protected_terms_scope_received"),
					createStackedTokenInput({
						placeholder: plugin.getCustomText("protected_terms_placeholder"),
						emptyText: plugin.getCustomText("protected_terms_placeholder"),
						maxLength: plugin.defaults.exceptions.protectedTerms.max,
						items: plugin.settings.exceptions.protectedTerms || [],
						onChange: value => {
							const nextValue = BDFDB.ArrayUtils.is(value) ? [].concat(value) : [];
							plugin.settings.exceptions.protectedTerms = nextValue;
							plugin.SettingsUpdated = true;
							BDFDB.DataUtils.save(nextValue, plugin, "exceptions", "protectedTerms");
						}
					})
				]
			});
			const createWrapperPairsForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("wrapper_pairs_title"),
				className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.marginbottom8, "translator-advanced-protection-section translator-advanced-protection-wrapper"),
				children: [
					infoText(plugin.getCustomText("wrapper_pairs_hint")),
					createExceptionScopeSwitches("wrapperPairsForSent", "wrapperPairsForReceived", "wrapper_pairs_scope_sent", "wrapper_pairs_scope_received"),
					createStackedTokenInput({
						placeholder: plugin.getCustomText("wrapper_pairs_placeholder"),
						emptyText: plugin.getCustomText("wrapper_pairs_placeholder"),
						maxLength: plugin.defaults.exceptions.wrapperPairs.max,
						items: plugin.getWrapperPairItemsForSettings(),
						onChange: value => {
							const nextValue = (BDFDB.ArrayUtils.is(value) ? value : []).filter(rule => !plugin.isDiscordSpoilerWrapperRule(rule));
							plugin.settings.exceptions.wrapperPairs = [].concat(nextValue);
							plugin.SettingsUpdated = true;
							BDFDB.DataUtils.save(nextValue, plugin, "exceptions", "wrapperPairs");
						}
					})
				]
			});
			const createTranslatePrefixForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("translate_prefix_title"),
				className: BDFDB.disCN.marginbottom8,
				children: [
					infoText(plugin.getCustomText("translate_prefix_hint")),
					...(plugin.settings.prefixes.translationPrefixData || []).map((entry, index) => BDFDB.ReactUtils.createElement("div", {
						className: "translator-prefix-translation-row",
						children: [
							BDFDB.ReactUtils.createElement("div", {
								className: "translator-prefix-translation-cell translator-prefix-input-cell",
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
									placeholder: plugin.getCustomText("translate_prefix_placeholder"),
									value: entry.prefix,
									onChange: value => {
										plugin.settings.prefixes.translationPrefixData[index].prefix = value;
										BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData");
										plugin.SettingsUpdated = true;
									}
								})
							}),
							BDFDB.ReactUtils.createElement("div", {
								className: "translator-prefix-translation-cell translator-prefix-language-cell",
								children: createStableSelect({
									value: entry.language,
									options: plugin.ensureSettingsStore().getLanguageIds()
										.filter(key => !plugin.ensureSettingsStore().getLanguage(key).auto && !plugin.ensureSettingsStore().getLanguage(key).special)
										.map(key => ({
											value: key,
											label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
										}))
										.sort((a, b) => a.label.localeCompare(b.label)),
									onChange: value => {
										plugin.settings.prefixes.translationPrefixData[index].language = value;
										BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData");
										plugin.SettingsUpdated = true;
									}
								})
							}),
							BDFDB.ReactUtils.createElement("div", {
								className: "translator-prefix-translation-cell translator-prefix-delete-cell",
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									color: BDFDB.LibraryComponents.Button.Colors.RED,
									size: BDFDB.LibraryComponents.Button.Sizes.TINY,
									onClick: _ => {
										plugin.settings.prefixes.translationPrefixData.splice(index, 1);
										BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData");
										plugin.SettingsUpdated = true;
										refreshPanel();
									},
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
										name: BDFDB.LibraryComponents.SvgIcon.Names.TRASH,
										width: 16,
										height: 16
									})
								})
							})
						]
					})),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
						type: "Button",
						color: BDFDB.LibraryComponents.Button.Colors.GREEN,
						onClick: _ => {
							if (!plugin.settings.prefixes.translationPrefixData) plugin.settings.prefixes.translationPrefixData = [];
							plugin.settings.prefixes.translationPrefixData.push({
								prefix: "$en",
								language: "en"
							});
							BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData");
							plugin.SettingsUpdated = true;
							refreshPanel();
						},
						children: plugin.getCustomText("add_prefix_button")
					})
				]
			});
			const saveTranslatedTextColor = color => {
				color = (color || "").trim() || "#7cc7ff";
				plugin.settings.general.translatedTextColor = color;
				if (!BDFDB.ArrayUtils.is(plugin.settings.general.customTranslatedTextColors)) plugin.settings.general.customTranslatedTextColors = [];
				if (!plugin.getTranslatedTextColorPresets().includes(color) && !plugin.settings.general.customTranslatedTextColors.includes(color)) plugin.settings.general.customTranslatedTextColors.unshift(color);
				plugin.settings.general.customTranslatedTextColors = plugin.settings.general.customTranslatedTextColors.filter((value, index, array) => value && array.indexOf(value) == index).slice(0, 12);
				BDFDB.DataUtils.save(plugin.settings.general, plugin, "general");
				plugin.SettingsUpdated = true;
				refreshPanel();
			};
			const removeTranslatedTextColor = color => {
				color = (color || "").trim();
				if (!color || plugin.getTranslatedTextColorPresets().includes(color)) return;
				plugin.settings.general.customTranslatedTextColors = (plugin.settings.general.customTranslatedTextColors || []).filter(savedColor => savedColor != color);
				if (plugin.getTranslatedTextColor() == color) plugin.settings.general.translatedTextColor = plugin.getTranslatedTextColorPresets()[0] || "#7cc7ff";
				BDFDB.DataUtils.save(plugin.settings.general, plugin, "general");
				plugin.SettingsUpdated = true;
				refreshPanel();
			};
			const resetTranslatedTextColor = () => {
				const defaultColor = plugin.getTranslatedTextColorPresets()[0] || "#7cc7ff";
				const colorState = ensureTranslatedTextColorState();
				colorState.showCustom = false;
				colorState.customValue = defaultColor;
				plugin.settings.general.translatedTextColor = defaultColor;
				BDFDB.DataUtils.save(plugin.settings.general, plugin, "general");
				plugin.SettingsUpdated = true;
				refreshPanel();
			};
			const ensureTranslatedTextColorState = () => {
				if (!plugin.translatedTextColorState) plugin.translatedTextColorState = {
					showCustom: false,
					customValue: plugin.getTranslatedTextColor()
				};
				if (!plugin.translatedTextColorState.customValue) plugin.translatedTextColorState.customValue = plugin.getTranslatedTextColor();
				return plugin.translatedTextColorState;
			};
			const getCustomTranslatedTextColors = () => BDFDB.ArrayUtils.is(plugin.settings.general.customTranslatedTextColors) ? plugin.settings.general.customTranslatedTextColors : [];
			const createColorChip = (color, active) => {
				const isCustomColor = getCustomTranslatedTextColors().includes(color) && !plugin.getTranslatedTextColorPresets().includes(color);
				return BDFDB.ReactUtils.createElement("button", {
					type: "button",
					className: BDFDB.DOMUtils.formatClassName("translator-color-chip", active && "translator-color-chip-active"),
					title: isCustomColor ? `${color} · ${compactText("点击选择，点 × 删除", "Click to select, click × to delete", "Нажмите для выбора, × для удаления")}` : color,
					onClick: _ => {
						const colorState = ensureTranslatedTextColorState();
						colorState.showCustom = false;
						colorState.customValue = color;
						saveTranslatedTextColor(color);
					},
					children: [
						BDFDB.ReactUtils.createElement("span", {
							className: "translator-color-chip-code",
							children: color
						}),
						BDFDB.ReactUtils.createElement("span", {
							className: "translator-settings-color-swatch",
							style: {background: color}
						}),
						isCustomColor && BDFDB.ReactUtils.createElement("span", {
							className: "translator-color-chip-delete",
							title: compactText("删除这个自定义颜色", "Delete this custom color", "Удалить этот цвет"),
							onClick: event => {
								event.preventDefault();
								event.stopPropagation();
								removeTranslatedTextColor(color);
							},
							children: "×"
						})
					].filter(Boolean)
				});
			};
			const createColorOptionLabel = color => BDFDB.ReactUtils.createElement("div", {
				className: "translator-settings-color-option",
				children: [
					BDFDB.ReactUtils.createElement("span", {
						children: color
					}),
					BDFDB.ReactUtils.createElement("span", {
						className: "translator-settings-color-swatch",
						style: {background: color}
					})
				]
			});
			const createInlineHeader = (title, actions = []) => BDFDB.ReactUtils.createElement("div", {
				className: "translator-settings-inline-header",
				children: [
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
						tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
						style: {margin: 0},
						children: title
					}),
					actions.length ? BDFDB.ReactUtils.createElement("div", {
						className: "translator-settings-inline-actions translator-settings-primary-actions",
						children: actions
					}) : null
				].filter(Boolean)
			});
			const createSubsectionTitle = title => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
				className: BDFDB.disCN.marginbottom8,
				tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
				children: title
			});
			const createDivider = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormDivider, {
				className: BDFDB.disCNS.dividerdefault + BDFDB.disCN.marginbottom8
			});
			const createSpaciousDivider = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormDivider, {
				className: BDFDB.DOMUtils.formatClassName(BDFDB.disCNS.dividerdefault + BDFDB.disCN.marginbottom8, "translator-settings-divider-spacious")
			});
			const createEnginePortalButtons = engineKey => {
				const portal = getEnginePortalConfig(engineKey);
				if (!portal) return {portal: null, buttons: []};
				return {
					portal,
					buttons: [
						portal.primaryUrl && createActionButton({
							label: portal.primaryLabel,
							color: BDFDB.LibraryComponents.Button.Colors.BRAND,
							onClick: _ => BDFDB.DiscordUtils.openLink(portal.primaryUrl)
						}),
						portal.secondaryUrl && portal.secondaryLabel && createActionButton({
							label: portal.secondaryLabel,
							color: BDFDB.LibraryComponents.Button.Colors.BRAND,
							onClick: _ => BDFDB.DiscordUtils.openLink(portal.secondaryUrl)
						})
					].filter(Boolean)
				};
			};
			const createEngineSupportPanel = engineKey => {
				const portalData = createEnginePortalButtons(engineKey);
				const hasLinks = !!portalData.buttons.length;
				if (!hasLinks) return null;

				return BDFDB.ReactUtils.createElement("div", {
					className: "translator-settings-support-panel",
					children: BDFDB.ReactUtils.createElement("div", {
						className: "translator-settings-support-row",
						children: portalData.buttons
					})
				});
			};
			const createFetchedModelSelector = engineKey => {
				const state = plugin.modelCatalogState && plugin.modelCatalogState[engineKey];
				if (!state || !state.items || !state.items.length) return null;
				return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
					title: plugin.getCustomText("model_catalog_title"),
					className: BDFDB.disCN.marginbottom8,
					children: [
						createStableSelect({
							value: plugin.ensureSettingsStore().getCredentialField(engineKey, "model") || "",
							options: state.items.map(modelId => ({value: modelId, label: modelId})),
							onChange: value => {
								saveAuthField(engineKey, "model", value);
								refreshPanel();
							}
						}),
						BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-meta",
							children: plugin.getCustomText("model_catalog_loaded").replace("{count}", state.items.length)
						})
					]
				});
			};
			const updateEngineSetting = (field, value) => {
				plugin.settings.engines[field] = value;
				BDFDB.DataUtils.save(plugin.settings.engines, plugin, "engines");
				plugin.setLanguages();
				plugin.SettingsUpdated = true;
				refreshPanel();
			};
			const saveFilterSetting = (key, value) => {
				if (!plugin.settings.filters) plugin.settings.filters = {};
				plugin.settings.filters[key] = value;
				BDFDB.DataUtils.save(value, plugin, "filters", key);
				plugin.SettingsUpdated = true;
			};
			const createLanguageOptions = direction => plugin.ensureSettingsStore().getLanguageIds()
				.filter(key => !plugin.ensureSettingsStore().getLanguage(key).special && (direction == languageTypes.INPUT || !plugin.ensureSettingsStore().getLanguage(key).auto))
				.map(key => ({
					value: key,
					label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
				}))
				.sort((a, b) => {
					if (a.value == "auto") return -1;
					if (b.value == "auto") return 1;
					return a.label.localeCompare(b.label);
				});
			const createLanguageSelector = (place, direction, title) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: title,
				className: BDFDB.disCN.marginbottom8,
				children: createStableSelect({
					value: plugin.settings.choices[place][direction],
					options: createLanguageOptions(direction),
					onChange: value => {
						plugin.settings.choices[place][direction] = value;
						BDFDB.DataUtils.save(plugin.settings.choices, plugin, "choices");
						plugin.setLanguages();
						plugin.SettingsUpdated = true;
						refreshPanel();
					}
				})
			});
			const createGeneralSwitch = key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
				type: "Switch",
				plugin: plugin,
				keys: ["general", key],
				className: "translator-settings-switch-row",
				label: plugin.getGeneralSettingLabel(key),
				value: plugin.settings.general[key]
			});
			const createGeneralSwitchGroup = keys => BDFDB.ReactUtils.createElement("div", {
				className: "translator-settings-switch-group",
				children: keys.map(createGeneralSwitch)
			});
			const createUiLanguageSelector = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("plugin_language_title"),
				className: BDFDB.disCN.marginbottom8,
				children: [
					infoText(plugin.getCustomText("plugin_language_hint")),
					createStableSelect({
						value: plugin.settings.general.interfaceLanguage || "system",
						options: plugin.getPluginLanguageOptions(),
						onChange: value => {
							plugin.settings.general.interfaceLanguage = value || "system";
							BDFDB.DataUtils.save(plugin.settings.general, plugin, "general");
							plugin.SettingsUpdated = true;
							// Reload legacy labels so the popout/quick panel and label fallbacks
							// follow the new plugin language (BDFDB only reloads on Discord lang change).
							plugin.labels = plugin.setLabelsByLanguage();
							refreshPanel();
						}
					})
				]
			});
			const createTranslatedTextColorInput = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("translated_text_color_title"),
				className: BDFDB.disCN.marginbottom8,
				children: (() => {
					const currentColor = plugin.getTranslatedTextColor();
					const colorState = ensureTranslatedTextColorState();
					const presetColors = plugin.getTranslatedTextColorPalette();
					const hasCustomCurrentColor = !plugin.getTranslatedTextColorPresets().includes(currentColor);
					return [
						createGeneralSwitch("highlightTranslatedMessages"),
						infoText(compactText("点色板即可切换，+ 号可自定义颜色。", "Pick a swatch or use + for a custom color.", "Нажмите цвет или используйте + для своего варианта.")),
						BDFDB.ReactUtils.createElement("div", {
							className: "translator-color-palette",
							children: [
								...presetColors.map(color => createColorChip(color, color == currentColor)),
								BDFDB.ReactUtils.createElement("button", {
									type: "button",
									className: "translator-color-chip translator-color-chip-add",
									onClick: _ => {
										colorState.showCustom = !colorState.showCustom;
										colorState.customValue = currentColor;
										refreshPanel();
									},
									children: "+"
								})
							]
						}),
						colorState.showCustom && BDFDB.ReactUtils.createElement("div", {
							className: "translator-color-custom-row",
							children: [
								BDFDB.ReactUtils.createElement("input", {
							type: "color",
							className: "translator-native-color-input",
							defaultValue: /^#[0-9a-f]{6}$/i.test(colorState.customValue || "") ? colorState.customValue : "#7cc7ff",
							onInput: event => {
								const nextColor = event && event.target && event.target.value || colorState.customValue;
								colorState.customValue = nextColor;
								const row = event && event.target && event.target.closest && event.target.closest(".translator-color-custom-row");
								const textInput = row && row.querySelector && row.querySelector(".translator-color-custom-input");
								if (textInput && textInput.value != nextColor) textInput.value = nextColor;
							},
							onChange: event => {
								colorState.customValue = event && event.target && event.target.value || colorState.customValue;
							}
						}),
						BDFDB.ReactUtils.createElement("input", {
							type: "text",
							className: "translator-color-custom-input",
							placeholder: "#7cc7ff",
							defaultValue: colorState.customValue,
							onInput: event => {
								colorState.customValue = event && event.target && event.target.value || "";
							}
						}),
								createActionButton({
									label: plugin.getCustomText("translated_text_color_save_button"),
									look: BDFDB.LibraryComponents.Button.Looks.OUTLINED,
									className: "translator-settings-field-action",
									onClick: _ => {
										const customColor = (colorState.customValue || "").trim();
										if (!plugin.isValidCssColorValue(customColor)) return BDFDB.NotificationUtils.toast(plugin.getCustomText("translated_text_color_invalid"), {type: "danger", position: "center"});
										colorState.showCustom = false;
										colorState.customValue = customColor;
										saveTranslatedTextColor(customColor);
									}
								})
							]
						})
					].filter(Boolean);
				})()
			});
			const createSourceLanguageFilter = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("source_filter_title"),
				className: BDFDB.disCN.marginbottom8,
				children: [
					infoText(plugin.getCustomText("source_filter_hint")),
					!((plugin.settings.filters && plugin.settings.filters.autoTranslateSourceLanguages) || []).length && infoText(plugin.getCustomText("source_filter_empty_state")),
					...((plugin.settings.filters && plugin.settings.filters.autoTranslateSourceLanguages) || []).map((languageId, index) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
						className: BDFDB.disCN.marginbottom8,
						align: BDFDB.LibraryComponents.Flex.Align.CENTER,
						children: [
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
								grow: 1,
								shrink: 0,
								basis: "85%",
								children: createStableSelect({
									value: languageId,
									options: plugin.ensureSettingsStore().getLanguageIds()
										.filter(key => !plugin.ensureSettingsStore().getLanguage(key).auto && !plugin.ensureSettingsStore().getLanguage(key).special)
										.map(key => ({
											value: key,
											label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
										}))
										.sort((a, b) => a.label.localeCompare(b.label)),
									onChange: value => {
										plugin.settings.filters.autoTranslateSourceLanguages[index] = value;
										BDFDB.DataUtils.save(plugin.settings.filters.autoTranslateSourceLanguages, plugin, "filters", "autoTranslateSourceLanguages");
										plugin.SettingsUpdated = true;
									}
								})
							}),
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
								grow: 0,
								shrink: 0,
								basis: "15%",
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									color: BDFDB.LibraryComponents.Button.Colors.RED,
									size: BDFDB.LibraryComponents.Button.Sizes.TINY,
									onClick: _ => {
										plugin.settings.filters.autoTranslateSourceLanguages.splice(index, 1);
										BDFDB.DataUtils.save(plugin.settings.filters.autoTranslateSourceLanguages, plugin, "filters", "autoTranslateSourceLanguages");
										plugin.SettingsUpdated = true;
										refreshPanel();
									},
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
										name: BDFDB.LibraryComponents.SvgIcon.Names.TRASH,
										width: 16,
										height: 16
									})
								})
							})
						]
					})),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
						type: "Button",
						color: BDFDB.LibraryComponents.Button.Colors.GREEN,
						onClick: _ => {
							if (!plugin.settings.filters) plugin.settings.filters = {};
							if (!plugin.settings.filters.autoTranslateSourceLanguages) plugin.settings.filters.autoTranslateSourceLanguages = [];
							plugin.settings.filters.autoTranslateSourceLanguages.push("en");
							BDFDB.DataUtils.save(plugin.settings.filters.autoTranslateSourceLanguages, plugin, "filters", "autoTranslateSourceLanguages");
							plugin.SettingsUpdated = true;
							refreshPanel();
						},
						children: plugin.getCustomText("source_filter_add")
					})
				]
			});
			const createReceivedSourceLanguageFilter = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
				title: plugin.getCustomText("received_source_filter_title"),
				className: BDFDB.disCN.marginbottom8,
				children: [
					infoText(plugin.getCustomText("received_source_filter_hint")),
					!((plugin.settings.filters && plugin.settings.filters.receivedAutoTranslateSourceLanguages) || []).length && infoText(plugin.getCustomText("received_source_filter_empty_state")),
					...((plugin.settings.filters && plugin.settings.filters.receivedAutoTranslateSourceLanguages) || []).map((languageId, index) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
						className: BDFDB.disCN.marginbottom8,
						align: BDFDB.LibraryComponents.Flex.Align.CENTER,
						children: [
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
								grow: 1,
								shrink: 0,
								basis: "85%",
								children: createStableSelect({
									value: languageId,
									options: plugin.ensureSettingsStore().getLanguageIds()
										.filter(key => !plugin.ensureSettingsStore().getLanguage(key).auto && !plugin.ensureSettingsStore().getLanguage(key).special)
										.map(key => ({
											value: key,
											label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
										}))
										.sort((a, b) => a.label.localeCompare(b.label)),
									onChange: value => {
										plugin.settings.filters.receivedAutoTranslateSourceLanguages[index] = value;
										BDFDB.DataUtils.save(plugin.settings.filters.receivedAutoTranslateSourceLanguages, plugin, "filters", "receivedAutoTranslateSourceLanguages");
										plugin.SettingsUpdated = true;
									}
								})
							}),
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
								grow: 0,
								shrink: 0,
								basis: "15%",
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									color: BDFDB.LibraryComponents.Button.Colors.RED,
									size: BDFDB.LibraryComponents.Button.Sizes.TINY,
									onClick: _ => {
										plugin.settings.filters.receivedAutoTranslateSourceLanguages.splice(index, 1);
										BDFDB.DataUtils.save(plugin.settings.filters.receivedAutoTranslateSourceLanguages, plugin, "filters", "receivedAutoTranslateSourceLanguages");
										plugin.SettingsUpdated = true;
										refreshPanel();
									},
									children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
										name: BDFDB.LibraryComponents.SvgIcon.Names.TRASH,
										width: 16,
										height: 16
									})
								})
							})
						]
					})),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
						type: "Button",
						color: BDFDB.LibraryComponents.Button.Colors.GREEN,
						onClick: _ => {
							if (!plugin.settings.filters) plugin.settings.filters = {};
							if (!plugin.settings.filters.receivedAutoTranslateSourceLanguages) plugin.settings.filters.receivedAutoTranslateSourceLanguages = [];
							plugin.settings.filters.receivedAutoTranslateSourceLanguages.push("en");
							BDFDB.DataUtils.save(plugin.settings.filters.receivedAutoTranslateSourceLanguages, plugin, "filters", "receivedAutoTranslateSourceLanguages");
							plugin.SettingsUpdated = true;
							refreshPanel();
						},
						children: plugin.getCustomText("received_source_filter_add")
					})
				]
			});
			const createAutoTranslateDecisionSettings = () => {
				const aiCapable = plugin.isAiAutoTranslateDecisionAvailable();
				const currentMode = plugin.getAutoTranslateDecisionMode();
				// The 2026-08-10 audit (item 39) found the panel rewrite dropped the loaded
				// scope and limit controls while the runtime still read them; users could
				// no longer change how much history each channel backfills.
				const createLoadedScopeSettings = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
					title: compactText("补翻范围与数量", "Backfill scope and amount", "Объём перевода истории"),
					className: BDFDB.disCN.marginbottom8,
					children: [
						createStableSelect({
							value: plugin.getReceivedAutoTranslateScope(),
							options: [
								{value: "new_only", label: compactText("仅翻译新消息", "New messages only", "Только новые сообщения")},
								{value: "loaded_messages", label: compactText("含已加载历史消息", "Include loaded history", "Включая загруженную историю")}
							],
							onChange: value => {
								if (!plugin.settings.filters) plugin.settings.filters = {};
								plugin.settings.filters.receivedAutoTranslateScope = value;
								BDFDB.DataUtils.save(value, plugin, "filters", "receivedAutoTranslateScope");
								plugin.SettingsUpdated = true;
								refreshPanel();
							}
						}),
						plugin.getReceivedAutoTranslateScope() == "loaded_messages" && createStableSelect({
							value: String(plugin.getReceivedAutoTranslateLoadedLimit()),
							options: [10, 20, 50, 100].map(limit => ({value: String(limit), label: compactText(`最多补翻 ${limit} 条`, `Backfill up to ${limit}`, `Не более ${limit}`)})),
							onChange: value => {
								if (!plugin.settings.filters) plugin.settings.filters = {};
								plugin.settings.filters.receivedAutoTranslateLoadedLimit = value;
								BDFDB.DataUtils.save(value, plugin, "filters", "receivedAutoTranslateLoadedLimit");
								plugin.SettingsUpdated = true;
							}
						}),
						infoText(compactText("开启频道翻译后，一次性补翻最近已加载的历史消息；数量是上限，实际按符合条件的消息数决定。", "After enabling a channel, recent loaded history is backfilled once; the amount is a maximum over eligible messages.", "После включения канала загруженная история переводится один раз; количество — максимум по подходящим сообщениям."))
					].filter(Boolean)
				});
				return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
					title: plugin.getCustomText("auto_translate_decision_title"),
					className: BDFDB.disCN.marginbottom8,
					children: [
						createLoadedScopeSettings(),
						infoText(plugin.getCustomText("auto_translate_decision_hint")),
						createSegmentedSelector({
							className: "translator-decision-mode-grid",
							value: currentMode,
							options: [
								{value: "basic", label: plugin.getCustomText("auto_translate_decision_basic")},
								{value: "ai", label: aiCapable ? plugin.getCustomText("auto_translate_decision_ai") : plugin.getCustomText("auto_translate_decision_ai_disabled"), disabled: !aiCapable}
							],
							onChange: value => {
								if (!plugin.settings.filters) plugin.settings.filters = {};
								plugin.settings.filters.autoTranslateDecisionMode = value;
								BDFDB.DataUtils.save(value, plugin, "filters", "autoTranslateDecisionMode");
								plugin.SettingsUpdated = true;
								refreshPanel();
							}
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: compactText("语言检测策略", "Language detection strategy", "Стратегия определения языка"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								createStableSelect({
									value: plugin.getLanguageDetectionStrategy(),
									options: [
										{value: "local_first", label: compactText("本地优先，失败时使用 Google Free", "Local first, then Google Free", "Сначала локально, затем Google Free")},
										{value: "google_free", label: compactText("仅 Google Free", "Google Free only", "Только Google Free")},
										{value: "local_only", label: compactText("仅本地检测", "Local only", "Только локально")}
									],
									onChange: value => {
										if (!plugin.settings.filters) plugin.settings.filters = {};
										plugin.settings.filters.languageDetectionStrategy = value;
										BDFDB.DataUtils.save(value, plugin, "filters", "languageDetectionStrategy");
										plugin.SettingsUpdated = true;
									}
								}),
								infoText(compactText("本地检测只在高置信时返回；默认策略拿不准会回退到免密钥的 Google 检测。", "Local detection returns only high-confidence results; the default falls back to keyless Google detection when uncertain.", "Локальное определение возвращает только уверенные результаты; иначе используется Google без ключа."))
							]
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
							type: "Switch",
							label: compactText("本地预检测:翻前用本地语种识别跳过同语言消息", "Local pre-check: skip same-language messages before requesting translation", "Локальная проверка: пропускать сообщения на целевом языке до запроса"),
							tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
							value: plugin.useLocalLanguagePrecheck(),
							onChange: value => {
								saveFilterSetting("useLocalLanguagePrecheck", value);
								refreshPanel();
							}
						}),
						infoText(compactText("仅在高置信时跳过,拿不准仍照常翻译;关闭后完全交给翻译服务商判定。", "Only skips when highly confident; uncertain text still gets translated. Turn off to rely entirely on the translation provider.", "Пропускает только при высокой уверенности; иначе переводит как обычно.")),
						currentMode == "ai" && aiCapable && infoText(plugin.getCustomText("auto_translate_ai_prompt_hint")),
						currentMode == "ai" && aiCapable && BDFDB.ReactUtils.createElement("textarea", {
							className: "translator-ai-prompt-textarea",
							defaultValue: plugin.getAiAutoTranslatePrompt(),
							onInput: event => {
								const value = event && event.target ? event.target.value : "";
								if (!plugin.settings.filters) plugin.settings.filters = {};
								plugin.settings.filters.aiAutoTranslatePrompt = value;
								BDFDB.DataUtils.save(value, plugin, "filters", "aiAutoTranslatePrompt");
								plugin.SettingsUpdated = true;
							},
							onChange: event => {
								const value = event && event.target ? event.target.value : "";
								if (!plugin.settings.filters) plugin.settings.filters = {};
								plugin.settings.filters.aiAutoTranslatePrompt = value;
								BDFDB.DataUtils.save(value, plugin, "filters", "aiAutoTranslatePrompt");
								plugin.SettingsUpdated = true;
							}
						})
					].filter(Boolean)
				});
			};
			const createEngineOptions = keys => keys
				.filter(key => translationEngines[key])
				.map(key => ({value: key, label: plugin.getEngineLabel(key)}));
			const createPrimaryOptions = () => createEngineOptions(recommendedEngines.concat(Object.keys(translationEngines).filter(key => !recommendedEngines.includes(key))));
			const createBackupOptions = () => [{value: "----", label: plugin.getCustomText("backup_engine_none")}].concat(
				Object.keys(translationEngines)
					.filter(key => key != plugin.settings.engines.translator)
					.map(key => ({value: key, label: plugin.getEngineLabel(key)}))
			);
			const createEngineFields = engineKey => {
				const engine = translationEngines[engineKey];
				if (!engine) return [infoText(plugin.getCustomText("engine_unknown_hint"))];
				if (engineKey == "googleapi") return [createEngineSupportPanel(engineKey)];
				let items = [];
				if (engine.premium) items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
					type: "Switch",
					label: plugin.getCustomText("paid_version_label"),
					tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
					value: plugin.ensureSettingsStore().getCredentialField(engineKey, "paid"),
					onChange: value => {
						plugin.ensureSettingsStore().setCredentialFlag(engineKey, "paid", value);
						plugin.SettingsUpdated = true;
					}
				}));
				if (engine.key) {
					items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
						className: BDFDB.disCN.marginbottom8,
						tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
						children: plugin.getCustomText("api_key_label")
					}));
					items.push(createSecretInput({
						fieldKey: `${engineKey}-key`,
						placeholder: engine.key,
						value: plugin.ensureSettingsStore().getCredentialField(engineKey, "key"),
						onChange: value => saveAuthField(engineKey, "key", value)
					}));
				}
				if (engine.endpoint) {
					items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
						className: BDFDB.disCN.marginbottom8,
						tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
						children: plugin.getCustomText("api_endpoint_label")
					}));
					items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
						className: BDFDB.disCN.marginbottom8,
						placeholder: engine.endpoint,
						value: plugin.ensureSettingsStore().getCredentialField(engineKey, "endpoint"),
						onChange: value => saveAuthField(engineKey, "endpoint", value)
					}));
				}
				if (engine.model) {
					const modelCatalogState = plugin.modelCatalogState && plugin.modelCatalogState[engineKey];
					const modelActions = [];
					if (plugin.isValidatableEngine(engineKey)) modelActions.push(createActionButton({
						label: plugin.getCustomText("model_detect_button"),
						color: defaultSecondaryButtonColor,
						className: "translator-settings-field-action",
						onClick: async _ => {
							const result = await plugin.validateEngineConfig(engineKey);
							if (result && result.normalized) refreshPanel();
						}
					}));
					if (plugin.supportsModelCatalog(engineKey)) modelActions.push(createActionButton({
						label: modelCatalogState && modelCatalogState.loading ? plugin.getCustomText("model_fetch_loading") : plugin.getCustomText("model_fetch_button"),
						color: defaultSecondaryButtonColor,
						className: "translator-settings-field-action",
						onClick: _ => plugin.fetchModelCatalog(engineKey, refreshPanel)
					}));
					items.push(createInlineHeader(plugin.getCustomText("model_id_label"), modelActions));
					items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
						className: BDFDB.disCN.marginbottom8,
						placeholder: engine.model,
						value: plugin.ensureSettingsStore().getCredentialField(engineKey, "model"),
						onChange: value => saveAuthField(engineKey, "model", value)
					}));
					if (modelCatalogState && modelCatalogState.loading) items.push(BDFDB.ReactUtils.createElement("div", {
						className: BDFDB.disCN.marginbottom8,
						style: {opacity: 0.8, lineHeight: "1.5"},
						children: plugin.getCustomText("model_fetch_loading")
					}));
					const fetchedModelSelector = createFetchedModelSelector(engineKey);
					if (fetchedModelSelector) items.push(fetchedModelSelector);
				}
				if (engineKey == "microsoft") items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
					title: plugin.getCustomText("microsoft_region_label"),
					className: BDFDB.disCN.marginbottom8,
					children: createStableSelect({
						value: plugin.ensureSettingsStore().getCredentialField(engineKey, "region") || "global",
						options: [
							{value: "global", label: "Global"},
							{value: "eastasia", label: "East Asia"},
							{value: "southeastasia", label: "Southeast Asia"},
							{value: "centralus", label: "Central US"},
							{value: "eastus", label: "East US"},
							{value: "eastus2", label: "East US 2"},
							{value: "westus", label: "West US"},
							{value: "westeurope", label: "West Europe"},
							{value: "japaneast", label: "Japan East"}
						],
						onChange: value => saveAuthField(engineKey, "region", value)
					})
				}));
				const supportPanel = createEngineSupportPanel(engineKey);
				if (supportPanel) items.push(supportPanel);
				if (!items.length) items.push(infoText(plugin.getCustomText("engine_no_extra_fields")));
				return items;
			};
			const createOtherServiceAuthSection = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
				title: plugin.getCustomText("other_service_title"),
				collapseStates: collapseStates,
				children: [
					infoText(compactText("只有切换到这些服务商时再填写。", "Only fill these in if you switch to those providers.", "Заполняйте только если будете переключаться на этих провайдеров.")),
					...plugin.getAdditionalCredentialEngineKeys()
						.map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: plugin.getEngineLabel(key),
							collapseStates: collapseStates,
							children: createEngineFields(key)
						}))
				]
			});
			const createProtectionSection = () => [
				createProtectedTermsForm(),
				createSpaciousDivider(),
				createWrapperPairsForm()
			];
			const createPrefixSection = () => [
				createDisablePrefixForm(),
				createTranslatePrefixForm()
			];
			settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
				title: plugin.getCustomText("section_service_title"),
				collapseStates: collapseStates,
				children: [
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
						title: plugin.getCustomText("primary_engine_title"),
						className: BDFDB.disCN.marginbottom8,
						children: createStableSelect({
							value: plugin.settings.engines.translator,
							options: createPrimaryOptions(),
							onChange: value => updateEngineSetting("translator", value)
						})
					}),
					...createEngineFields(plugin.settings.engines.translator),
					createDivider(),
					BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
						title: plugin.getCustomText("backup_engine_title"),
						collapseStates: collapseStates,
						children: [
							infoText(compactText("主服务失败时才会切到备用服务。", "Used only when the primary provider fails.", "Используется только при сбое основного провайдера.")),
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
								title: plugin.getCustomText("backup_engine_select_title"),
								className: BDFDB.disCN.marginbottom8,
								children: createStableSelect({
									value: plugin.settings.engines.backup,
									options: createBackupOptions(),
									onChange: value => updateEngineSetting("backup", value)
								})
							}),
							plugin.settings.engines.backup == "----" ? infoText(plugin.getCustomText("backup_engine_none_hint")) : createEngineFields(plugin.settings.engines.backup)
						]
					}),
					createOtherServiceAuthSection()
				]
			}));
			settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
				title: plugin.getCustomText("section_language_title"),
				collapseStates: collapseStates,
				children: [
					createSubsectionTitle(plugin.getCustomText("section_message_language_title")),
					createLanguageSelector(messageTypes.SENT, languageTypes.INPUT, plugin.getCustomText("sent_input_title")),
					createLanguageSelector(messageTypes.SENT, languageTypes.OUTPUT, plugin.getCustomText("sent_output_title")),
					createSourceLanguageFilter(),
					createDivider(),
					createLanguageSelector(messageTypes.RECEIVED, languageTypes.INPUT, plugin.getCustomText("received_input_title")),
					createLanguageSelector(messageTypes.RECEIVED, languageTypes.OUTPUT, plugin.getCustomText("received_output_title")),
					createReceivedSourceLanguageFilter(),
					createSpaciousDivider(),
					createAutoTranslateDecisionSettings()
				]
			}));
			settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
				title: plugin.getCustomText("section_display_title"),
				collapseStates: collapseStates,
				children: [
					createSubsectionTitle(plugin.getCustomText("section_display_message_title")),
					createGeneralSwitchGroup([
						"sendOriginalMessage",
						"useSpoilerInSentOriginal",
						"showOriginalMessage",
						"showOriginalDirectly",
						"useSpoilerInReceivedOriginal",
						"showOriginalInReplyPreview",
					]),
					createSpaciousDivider(),
					createTranslatedTextColorInput(),
					createSpaciousDivider(),
					createUiLanguageSelector()
				]
			}));
			settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
				title: plugin.getCustomText("section_advanced_title"),
				collapseStates: collapseStates,
				children: [
					...createProtectionSection(),
					createSpaciousDivider(),
					...createPrefixSection()
				]
			}));
			return BDFDB.ReactUtils.createElement("div", {
				className: "translator-settings-panel-root",
				children: settingsItems.flat(10).filter(n => n)
			});
		}
	});
}

module.exports = {renderSettingsPanel};
