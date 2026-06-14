/**
 * @name DiscordAITranslator
 * @author ROOT94
 * @version v0.0.2
 * @description 基于 BetterDiscord Translator 二次开发的 Discord AI 翻译插件
 * @source https://github.com/able-root/DiscordAITranslator
 */

module.exports = (_ => {
	const changeLog = {
		
	};
	
	return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
		constructor (meta) {for (let key in meta) this[key] = meta[key];}
		getName () {return this.name;}
		getAuthor () {return this.author;}
		getVersion () {return this.version;}
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
		var _this;
		const translationProtectionSignatureVersion = "2026-06-12-auto-protect-v1";
		
		const translateIconGeneral = `<svg name="Translate" width="24" height="24" viewBox="0 0 24 24"><mask/><path fill="currentColor" mask="url(#translateIconMask)" d="m 9.6568988,1.9999999 c -1.141416,0 -0.951614,1.2688185 -0.951614,1.2688185 v 0.6505173 h -5.392479 c 0,0 -1.2688185,-0.1898024 -1.2688185,0.9516139 0,1.1414159 1.2688185,0.9516139 1.2688185,0.9516139 H 12.426863 C 12.695162,7.2780713 11.349082,9.1398691 9.7646988,10.765256 8.6555628,9.6878231 7.4332858,8.3134878 6.8664892,7.065981 6.6161862,6.515072 5.9881318,6.6956414 5.7283935,6.9736693 5.1836529,7.5567679 5.5785907,8.592173 6.0833902,9.3409331 c 0.246901,0.366224 1.3724726,1.5182279 2.4570966,2.5995909 -1.6322361,1.477469 -3.154699,2.550028 -3.154699,2.550028 0,0 -1.0769951,0.696378 -0.322161,1.552568 0.7548319,0.856187 1.5810669,-0.125147 1.5810669,-0.125147 0,0 1.5136611,-1.082765 3.2203701,-2.6696 0.5195872,0.508635 0.8970952,0.874172 0.8970952,0.874172 0,0 0.82821,0.985394 1.582925,0.09231 0.754714,-0.893081 -0.354377,-1.545753 -0.354377,-1.545753 0.0097,0.03486 -0.34186,-0.224086 -0.864878,-0.666625 1.804964,-1.884163 3.470802,-4.1622897 3.47686,-6.1799145 h 1.398302 c 0,0 1.268819,0.2176541 1.268819,-0.9516139 0,-1.1692683 -1.268819,-0.9516139 -1.268819,-0.9516139 H 10.608512 V 3.2688184 c 0,0 0.189804,-1.2688185 -0.9516132,-1.2688185 z M 15.056812,10.104826 10.536646,22 h 2.379035 l 0.964624,-2.537637 h 4.732049 L 19.576978,22 h 2.379035 L 17.435847,10.104826 Z m 1.189517,3.130537 1.643021,4.323772 h -3.286042 z"/><extra/></svg>`;
		const translateIconMask = `<mask id="translateIconMask" fill="black"><path fill="white" d="M 0 0 H 24 V 24 H 0 Z"/><path fill="black" d="M24 12 H 12 V 24 H 24 Z"/></mask>`;
		const translateIcon = translateIconGeneral.replace(`<extra/>`, ``).replace(`<mask/>`, ``).replace(` mask="url(#translateIconMask)"`, ``);
		const translateIconUntranslate = translateIconGeneral.replace(`<extra/>`, `<path fill="none" stroke="#f04747" stroke-width="2" d="m 14.702359,14.702442 8.596228,8.596148 m 0,-8.597139 -8.59722,8.596147 z"/>`).replace(`<mask/>`, translateIconMask);
		
		const TranslateButtonComponent = class TranslateButton extends BdApi.React.Component {
			render() {
				const enabled = _this.isTranslationEnabled(this.props.channelId);
				return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ChannelTextAreaButton, {
					className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN._translatortranslatebutton, _this.isTranslationEnabled(this.props.channelId) && BDFDB.disCN._translatortranslating, BDFDB.disCN.textareapickerbutton),
					isActive: this.props.isActive,
					iconSVG: translateIcon,
					nativeClass: true,
					tooltip: {
						text: _ => _this.getTranslateButtonTooltipText(this.props.channelId),
						tooltipConfig: {style: "max-width: 400px"}
					},
					onClick: _ => {
						this.props.isActive = true;
						BDFDB.ReactUtils.forceUpdate(this);
						
						BDFDB.ModalUtils.open(_this, {
							size: "LARGE",
							header: BDFDB.LanguageUtils.LanguageStrings.SETTINGS,
							subHeader: "",
							onClose: _ => {
								this.props.isActive = false;
								BDFDB.ReactUtils.forceUpdate(this);
							},
							children: BDFDB.ReactUtils.createElement(TranslateSettingsComponent, {
								guildId: this.props.guildId,
								channelId: this.props.channelId
							})
						});
					},
					onContextMenu: _ => {
						_this.toggleTranslation(this.props.channelId);
						BDFDB.ReactUtils.forceUpdate(this);
					}
				});
			}
		};
		
		const TranslateSettingsComponent = class TranslateSettings extends BdApi.React.Component {
			constructor(props) {
				super(props);
				this.state = {
					detectorText: "",
					detectedLanguageId: null,
					detectingLanguage: false
				};
			}
			filterLanguages(direction, place) {
				let isOutput = direction == languageTypes.OUTPUT;
				return BDFDB.ObjectUtils.toArray(BDFDB.ObjectUtils.map(isOutput ? BDFDB.ObjectUtils.filter(languages, lang => !lang.auto) : languages, (lang, id) => ({
					value: id,
					label: _this.getLanguageDisplayName(lang),
					backup: this.isOnlyBackup(lang)
				}))).filter(isOutput && this.isOnlyBackup(languages[_this.getLanguageChoice(languageTypes.INPUT, place, this.props.channelId)]) ? (n => n.backup) : (n => n));
			}
			isOnlyBackup(lang) {
				return lang && (lang.auto && translationEngines[_this.settings.engines.translator] && !translationEngines[_this.settings.engines.translator].auto || !lang.auto && !lang.special && translationEngines[_this.settings.engines.translator] && !translationEngines[_this.settings.engines.translator].languages.includes(lang.id));
			}
			async detectLanguageFromInput() {
				const text = (this.state.detectorText || "").trim();
				if (!text) return BDFDB.NotificationUtils.toast(_this.getCustomText("language_detector_empty"), {type: "danger", position: "center"});
				this.setState({detectingLanguage: true});
				const result = await _this.detectLanguageDetails(text);
				this.setState({
					detectingLanguage: false,
					detectedLanguageId: result && result.id || null
				});
				if (!result) BDFDB.NotificationUtils.toast(_this.getCustomText("language_detector_failed"), {type: "danger", position: "center"});
			}
			applyDetectedLanguage(place, direction) {
				const detectedLanguageId = this.state.detectedLanguageId;
				if (!detectedLanguageId) return;
				_this.saveLanguageChoice(detectedLanguageId, direction, place, this.props.channelId);
				_this.setLanguages();
				BDFDB.ReactUtils.forceUpdate(this);
			}
			renderLanguageDetector() {
				const detectedLanguageId = this.state.detectedLanguageId;
				const detectedLanguage = detectedLanguageId && _this.getLanguageData(detectedLanguageId);
				return BDFDB.ReactUtils.createElement("div", {
					className: "translator-detector-panel",
					children: [
						BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-support-title",
							children: _this.getCustomText("language_detector_title")
						}),
						BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-support-hint",
							children: _this.getCustomText("language_detector_hint")
						}),
						BDFDB.ReactUtils.createElement("div", {
							className: "translator-detector-input-wrap",
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
									className: "translator-detector-textinput",
									placeholder: _this.getCustomText("language_detector_placeholder"),
									value: this.state.detectorText,
									onChange: value => this.setState({detectorText: value})
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
									className: "translator-detector-input-button",
									disabled: this.state.detectingLanguage,
									onClick: _ => this.detectLanguageFromInput(),
									children: this.state.detectingLanguage ? _this.getCustomText("language_detector_button_loading") : _this.getCustomText("language_detector_button")
								})
							]
						}),
						detectedLanguage && BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-meta",
							children: `${_this.getCustomText("language_detector_detected")}: ${_this.getLanguageDisplayName(detectedLanguage)} (${detectedLanguage.id})`
						}),
						detectedLanguage && BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-inline-actions",
							style: {justifyContent: "flex-start", marginTop: "10px"},
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
									onClick: _ => this.applyDetectedLanguage(messageTypes.RECEIVED, languageTypes.INPUT),
									children: _this.getCustomText("language_detector_apply_received")
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
									onClick: _ => this.applyDetectedLanguage(messageTypes.SENT, languageTypes.INPUT),
									children: _this.getCustomText("language_detector_apply_sent")
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
									size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
									onClick: _ => this.applyDetectedLanguage(messageTypes.SENT, languageTypes.OUTPUT),
									children: _this.getCustomText("language_detector_apply_sent_output")
								})
							]
						})
					].filter(Boolean)
				});
			}
			render() {
				const popoutGeneralSettings = Object.keys(_this.defaults.general).filter(key => _this.defaults.general[key].popout).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
					type: "Switch",
					plugin: _this,
					keys: ["general", key],
					className: "translator-settings-switch-row",
					label: _this.labels[`general_${key}`] || _this.defaults.general[key].description,
					tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
					value: _this.settings.general[key]
				}));
				const channelTranslationToggle = BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
					type: "Switch",
					className: "translator-settings-switch-row",
					label: _this.getChannelTranslationToggleLabel(),
					tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
					value: _this.isTranslationEnabled(this.props.channelId),
					onChange: value => {
						_this.toggleTranslation(this.props.channelId);
						BDFDB.ReactUtils.forceUpdate(this);
					}
				});
				return [
					BDFDB.ArrayUtils.is(_this.settings.exceptions.wordStart) && _this.settings.exceptions.wordStart.length && [
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
							className: BDFDB.disCN.marginbottom8,
							children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsLabel, {
								label: _this.labels.exception_text.replace("{{var0}}", _this.settings.exceptions.wordStart.map(n => '"' + n + '"').join(", "))
							})
						}),
						BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormDivider, {
							className: BDFDB.disCN.marginbottom8
						})
					],
					this.renderLanguageDetector(),
					Object.keys(_this.defaults.choices).map(place => {
						let isChannelSpecific = channelLanguages[this.props.channelId] && channelLanguages[this.props.channelId][place];
						let isGuildSpecific = !isChannelSpecific && guildLanguages[this.props.guildId] && guildLanguages[this.props.guildId][place];
						return Object.keys(_this.defaults.choices[place].value).map(direction => [
							BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
								title: _this.labels[`language_choice_${direction.toLowerCase()}_${place.toLowerCase()}`] + ": ",
								titleChildren: direction == languageTypes.OUTPUT && [{
									text: _ => isChannelSpecific ? _this.labels.language_selection_channel : isGuildSpecific ? _this.labels.language_selection_server : _this.labels.language_selection_global,
									name: isChannelSpecific || isGuildSpecific ? BDFDB.LibraryComponents.SvgIcon.Names.LOCK_CLOSED : BDFDB.LibraryComponents.SvgIcon.Names.LOCK_OPEN,
									color: isChannelSpecific ? "var(--status-danger)" : isGuildSpecific ? "var(--status-warning)" : null,
									onClick: _ => {
										if (channelLanguages[this.props.channelId] && channelLanguages[this.props.channelId][place]) {
											isChannelSpecific = false;
											delete channelLanguages[this.props.channelId][place];
											if (BDFDB.ObjectUtils.isEmpty(channelLanguages[this.props.channelId])) delete channelLanguages[this.props.channelId];
										}
										else if (guildLanguages[this.props.guildId] && guildLanguages[this.props.guildId][place]) {
											isGuildSpecific = false;
											isChannelSpecific = true;
											delete guildLanguages[this.props.guildId][place];
											if (BDFDB.ObjectUtils.isEmpty(guildLanguages[this.props.guildId])) delete guildLanguages[this.props.guildId];
											if (!channelLanguages[this.props.channelId]) channelLanguages[this.props.channelId] = {};
											channelLanguages[this.props.channelId][place] = {};
											for (let l in languageTypes) channelLanguages[this.props.channelId][place][languageTypes[l]] = _this.getLanguageChoice(languageTypes[l], place, null);
										}
										else {
											isGuildSpecific = true;
											if (!guildLanguages[this.props.guildId]) guildLanguages[this.props.guildId] = {};
											guildLanguages[this.props.guildId][place] = {};
											for (let l in languageTypes) guildLanguages[this.props.guildId][place][languageTypes[l]] = _this.getLanguageChoice(languageTypes[l], place, null);
										}
										BDFDB.DataUtils.save(channelLanguages, _this, "channelLanguages");
										BDFDB.DataUtils.save(guildLanguages, _this, "guildLanguages");
										
										BDFDB.ReactUtils.forceUpdate(this);
									}
								}, {
									iconSVG: `<svg width="21" height="21" fill="currentColor"><path d="M 0, 10.515 c 0, 2.892, 1.183, 5.521, 3.155, 7.361 L 0, 21.031 h 7.887 V 13.144 l -2.892, 2.892 C 3.549, 14.722, 2.629, 12.75, 2.629, 10.515 c 0 -3.418, 2.235 -6.309, 5.258 -7.492 v -2.629 C 3.418, 1.577, 0, 5.652, 0, 10.515 z M 21.031, 0 H 13.144 v 7.887 l 2.892 -2.892 C 17.482, 6.309, 18.402, 8.281, 18.402, 10.515 c 0, 3.418 -2.235, 6.309 -5.258, 7.492 V 20.768 c 4.469 -1.183, 7.887 -5.258, 7.887 -10.121 c 0 -2.892 -1.183 -5.521 -3.155 -7.361 L 21.031, 0 z"/></svg>`,
									onClick: _ => {
										let input = _this.getLanguageChoice(languageTypes.INPUT, place, this.props.channelId);
										let output = _this.getLanguageChoice(languageTypes.OUTPUT, place, this.props.channelId);
										input = input == "auto" ? "en" : input;
										
										_this.saveLanguageChoice(output, languageTypes.INPUT, place, this.props.channelId);
										_this.saveLanguageChoice(input, languageTypes.OUTPUT, place, this.props.channelId);
										
										_this.setLanguages();
										
										BDFDB.ReactUtils.forceUpdate(this);
									}
								}].map(data => {
									const icon = BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Clickable, {
										className: BDFDB.disCN._translatorconfigbutton,
										onClick: data.onClick,
										children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
											width: 24,
											height: 24,
											color: data.color || "currentColor",
											name: data.name,
											iconSVG: data.iconSVG
										})
									});
									return data.text ? BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {tooltipConfig: {type: "bottom"}, text: data.text, children: icon}) : icon;
								}),
								className: BDFDB.disCN.marginbottom8,
								children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Select, {
									value: _this.getLanguageChoice(direction, place, this.props.channelId),
									options: this.filterLanguages(direction, place),
									optionRenderer: lang => languages[lang.value] ? BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
										align: BDFDB.LibraryComponents.Flex.Align.CENTER,
										children: [
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
												grow: 1,
												children: lang.label
											}),
											lang.backup && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
												text: _this.labels.backup_engine_warning,
												tooltipConfig: {
													color: "red"
												},
												children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
													nativeClass: true,
													width: 20,
													height: 20,
													color: "var(--status-danger)",
													name: BDFDB.LibraryComponents.SvgIcon.Names.WARNING
												})
											}),
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FavButton, {
												isFavorite: languages[lang.value].fav == 0,
												onClick: value => {
													if (value) favorites.push(lang.value);
													else BDFDB.ArrayUtils.remove(favorites, lang.value, true);
													BDFDB.DataUtils.save(favorites.sort(), _this, "favorites");
													_this.setLanguages();
												}
											})
										]
									}) : null,
									onChange: value => {
										_this.saveLanguageChoice(value, direction, place, this.props.channelId);
										BDFDB.ReactUtils.forceUpdate(this);
									}
								})
							}),
							direction == languageTypes.OUTPUT && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormDivider, {
								className: BDFDB.disCN.marginbottom8
							})
						]);
					}),
					Object.keys(_this.defaults.engines).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
						title: _this.labels[`${key}_engine`],
						className: BDFDB.disCN.marginbottom8,
						children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Select, {
							value: _this.settings.engines[key],
							options: (key == "backup" ? ["----"] : []).concat(Object.keys(translationEngines)).filter(key == "backup" ? (n => n != _this.settings.engines.translator) : (n => n)).map(engineKey => ({value: engineKey, label: translationEngines[engineKey] ? translationEngines[engineKey].name : "----"})),
							maxVisibleItems: 3,
							onChange: value => {
								_this.settings.engines[key] = value;
								BDFDB.DataUtils.save(_this.settings.engines, _this, "engines");
								_this.setLanguages();
								BDFDB.ReactUtils.forceUpdate(this);
							}
						})
					})),
					BDFDB.ReactUtils.createElement("div", {
						className: "translator-popout-toggle-group translator-settings-switch-group",
						children: [...popoutGeneralSettings, channelTranslationToggle]
					})
				].flat(10).filter(n => n);
			}
		};

		const brailleConverter = {
			"0":"⠴", "1":"⠂", "2":"⠆", "3":"⠒", "4":"⠲", "5":"⠢", "6":"⠖", "7":"⠶", "8":"⠦", "9":"⠔", "!":"⠮", "\"":"⠐", "#":"⠼", "$":"⠫", "%":"⠩", "&":"⠯", "'":"⠄", "(":"⠷", ")":"⠾", "*":"⠡", "+":"⠬", ",":"⠠", "-":"⠤", ".":"⠨", "/":"⠌", ":":"⠱", ";":"⠰", "<":"⠣", "=":"⠿", ">":"⠜", "?":"⠹", "@":"⠈", "a":"⠁", "b":"⠃", "c":"⠉", "d":"⠙", "e":"⠑", "f":"⠋", "g":"⠛", "h":"⠓", "i":"⠊", "j":"⠚", "k":"⠅", "l":"⠇", "m":"⠍", "n":"⠝", "o":"⠕", "p":"⠏", "q":"⠟", "r":"⠗", "s":"⠎", "t":"⠞", "u":"⠥", "v":"⠧", "w":"⠺", "x":"⠭", "y":"⠽", "z":"⠵", "[":"⠪", "\\":"⠳", "]":"⠻", "^":"⠘", "⠁":"a", "⠂":"1", "⠃":"b", "⠄":"'", "⠅":"k", "⠆":"2", "⠇":"l", "⠈":"@", "⠉":"c", "⠊":"i", "⠋":"f", "⠌":"/", "⠍":"m", "⠎":"s", "⠏":"p", "⠐":"\"", "⠑":"e", "⠒":"3", "⠓":"h", "⠔":"9", "⠕":"o", "⠖":"6", "⠗":"r", "⠘":"^", "⠙":"d", "⠚":"j", "⠛":"g", "⠜":">", "⠝":"n", "⠞":"t", "⠟":"q", "⠠":", ", "⠡":"*", "⠢":"5", "⠣":"<", "⠤":"-", "⠥":"u", "⠦":"8", "⠧":"v", "⠨":".", "⠩":"%", "⠪":"[", "⠫":"$", "⠬":"+", "⠭":"x", "⠮":"!", "⠯":"&", "⠰":";", "⠱":":", "⠲":"4", "⠳":"\\", "⠴":"0", "⠵":"z", "⠶":"7", "⠷":"(", "⠸":"_", "⠹":"?", "⠺":"w", "⠻":"]", "⠼":"#", "⠽":"y", "⠾":")", "⠿":"=", "_":"⠸"
		};

		const morseConverter = {
			"0":"−−−−−", "1":"·−−−−", "2":"··−−−", "3":"···−−", "4":"····−", "5":"·····", "6":"−····", "7":"−−···", "8":"−−−··", "9":"−−−−·", "!":"−·−·−−", "\"":"·−··−·", "$":"···−··−", "&":"·−···", "'":"·−−−−·", "(":"−·−−·", ")":"−·−−·−", "+":"·−·−·", ",":"−−··−−", "-":"−····−", ".":"·−·−·−", "/":"−··−·", ":":"−−−···", ";":"−·−·−·", "=":"−···−", "?":"··−−··", "@":"·−−·−·", "a":"·−", "b":"−···", "c":"−·−·", "d":"−··", "e":"·", "f":"··−·", "g":"−−·", "h":"····", "i":"··", "j":"·−−−", "k":"−·−", "l":"·−··", "m":"−−", "n":"−·", "o":"−−−", "p":"·−−·", "q":"−−·−", "r":"·−·", "s":"···", "t":"−", "u":"··−", "v":"···−", "w":"·−−", "x":"−··−", "y":"−·−−", "z":"−−··", "·":"e", "··":"i", "···":"s", "····":"h", "·····":"5", "····−":"4", "···−":"v", "···−··−":"$", "···−−":"3", "··−":"u", "··−·":"f", "··−−··":"?", "··−−·−":"_", "··−−−":"2", "·−":"a", "·−·":"r", "·−··":"l", "·−···":"&", "·−··−·":"\"", "·−·−·":"+", "·−·−·−":".", "·−−":"w", "·−−·":"p", "·−−·−·":"@", "·−−−":"j", "·−−−−":"1", "·−−−−·":"'", "−":"t", "−·":"n", "−··":"d", "−···":"b", "−····":"6", "−····−":"-", "−···−":"=", "−··−":"x", "−··−·":"/", "−·−":"k", "−·−·":"c", "−·−·−·":";", "−·−·−−":"!", "−·−−":"y", "−·−−·":"(", "−·−−·−":")", "−−":"m", "−−·":"g", "−−··":"z", "−−···":"7", "−−··−−":",", "−−·−":"q", "−−−":"o", "−−−··":"8", "−−−···":":", "−−−−·":"9", "−−−−−":"0", "_":"··−−·−"
		};
		
		const googleLanguages = ["af","am","ar","az","be","bg","bn","bs","ca","ceb","co","cs","cy","da","de","el","en","eo","es","et","eu","fa","fi","fr","fy","ga","gd","gl","gu","ha","haw","hi","hmn","hr","ht","hu","hy","id","ig","is","it","iw","ja","jw","ka","kk","km","kn","ko","ku","ky","la","lb","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","no","ny","or","pa","pl","ps","pt","ro","ru","rw","sd","si","sk","sl","sm","sn","so","sq","sr","st","su","sv","sw","ta","te","tg","th","tk","tl","tr","tt","ug","uk","ur","uz","vi","xh","yi","yo","zh-CN","zh-TW","zu"];
		const translationEngines = {
			googleapi: {
				name: "Google",
				auto: true,
				funcName: "googleApiTranslate",
				languages: googleLanguages
			},
			googlecloud: {
				name: "Google Cloud Translation",
				auto: true,
				funcName: "googleCloudTranslate",
				languages: googleLanguages,
				key: "AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				endpoint: "https://translation.googleapis.com/language/translate/v2",
				model: "nmt"
			},
			microsoft: {
				name: "Azure Translator",
				auto: true,
				funcName: "microsoftTranslate",
				languages: ["af","am","ar","az","ba","bg","bn","bs","ca","cs","cy","da","de","el","en","es","et","eu","fa","fi","fil","fr","fr-CA","ga","gl","gu","ha","he","hi","hr","ht","hu","hy","id","ig","is","it","ja","ka","kk","km","kn","ko","ku","ky","lo","lt","lv","mg","mi","mk","ml","mr","ms","mt","my","ne","nl","or","pa","pl","ps","pt","pt-PT","ro","ru","rw","sd","si","sk","sl","sm","sn","so","sq","st","sv","sw","ta","te","th","tk","tr","tt","ug","uk","ur","uz","vi","xh","yo","zh-CN","zh-TW","zu"],
				parser: {
					"zh-CN": "zh-Hans",
					"zh-TW": "zh-Hant"
				},
				key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				endpoint: "https://api.cognitive.microsofttranslator.com/translate"
			},
			deepl: {
				name: "DeepL",
				auto: true,
				funcName: "deepLTranslate",
				languages: ["bg","cs","da","de","en","el","es","et","fi","fr","hu","id","it","ja","ko","lt","lv","nl","no","pl","pt","ro","ru","sk","sl","sv","tr","uk","zh"],
				premium: true,
				key: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
			},
			deepseek: {
				name: "DeepSeek",
				auto: true,
				funcName: "deepSeekTranslate",
				languages: googleLanguages,
				key: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				endpoint: "https://api.deepseek.com/chat/completions",
				model: "deepseek-v3"
			},
			oaicompat: {
				name: "OAI Compatible",
				auto: true,
				funcName: "openAiCompatibleTranslate",
				languages: googleLanguages,
				key: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
				endpoint: "https://api.openai.com/v1/chat/completions",
				model: "gpt-3.5-turbo"
			},
			itranslate: {
				name: "iTranslate",
				auto: true,
				funcName: "iTranslateTranslate",
				languages: [...new Set(["af","ar","az","be","bg","bn","bs","ca","ceb","cs","cy","da","de","el","en","eo","es","et","eu","fa","fi","fil","fr","ga","gl","gu","ha","he","hi","hmn","hr","ht","hu","hy","id","ig","is","it","ja","jw","ka","kk","km","kn","ko","la","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","no","ny","pa","pl","pt-BR","pt-PT","ro","ru","si","sk","sl","so","sq","sr","st","su","sv","sw","ta","te","tg","th","tr","uk","ur","uz","vi","we","yi","yo","zh-CN","zh-TW","zu"].concat(googleLanguages))].sort(),
				key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
			},
			yandex: {
				name: "Yandex",
				auto: true,
				funcName: "yandexTranslate",
				languages: ["af","am","ar","az","ba","be","bg","bn","bs","ca","ceb","cs","cy","da","de","el","en","eo","es","et","eu","fa","fi","fr","ga","gd","gl","gu","he","hi","hr","ht","hu","hy","id","is","it","ja","jv","ka","kk","km","kn","ko","ky","la","lb","lo","lt","lv","mg","mhr","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","no","pa","pap","pl","pt","ro","ru","si","sk","sl","sq","sr","su","sv","sw","ta","te","tg","th","tl","tr","tt","udm","uk","ur","uz","vi","xh","yi","zh"],
				key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
			},
			papago: {
				name: "Papago",
				auto: true,
				funcName: "papagoTranslate",
				languages: ["en","es","fr","id","ja","ko","th","vi","zh-CN","zh-TW"],
				key: "xxxxxxxxxxxxxxxxxxxx xxxxxxxxxx"
			},
			baidu: {
				name: "Baidu",
				auto: true,
				funcName: "baiduTranslate",
				languages: ["ar","bg","cs","da","de","el","en","es","et","fi","fr","hu","it","ja","ko","nl","pl","pt","ro","ru","sl","sv","th","vi","zh","zh-CN","zh-TW"],
				parser: {
					"ar": "ara",
					"bg": "bul",
					"da": "dan",
					"es": "spa",
					"et": "est",
					"fi": "fin",
					"fr": "fra",
					"ja": "jp",
					"ko": "kor",
					"ro": "rom",
					"sl": "slo",
					"sv": "swe",
					"vi": "vie",
					"zh": "wyw",
					"zh-CN": "zh",
					"zh-TW": "cht"
				},
				key: "xxxxxxxxxx xxxxxxxxxxxxxxxxxxxx"
			}
		};

		const enginePortals = {
			googleapi: {
				primaryUrl: "https://translate.google.com/",
				primaryLabelZh: "打开 Google 翻译",
				primaryLabelEn: "Open Google Translate",
				hintZh: "Google 默认模式无需单独购买 API，可直接使用。",
				hintEn: "Google default mode does not require a separate paid API."
			},
			googlecloud: {
				primaryUrl: "https://cloud.google.com/free?hl=zh-cn",
				primaryLabelZh: "注册 / 开通 Google Cloud",
				primaryLabelEn: "Sign up for Google Cloud",
				secondaryUrl: "https://cloud.google.com/translate?hl=zh-cn",
				secondaryLabelZh: "查看文档 / 定价",
				secondaryLabelEn: "Docs / Pricing"
			},
			microsoft: {
				primaryUrl: "https://azure.microsoft.com/zh-cn/free/",
				primaryLabelZh: "注册 / 开通 Azure",
				primaryLabelEn: "Sign up for Azure",
				secondaryUrl: "https://azure.microsoft.com/zh-cn/products/ai-foundry/tools/translator",
				secondaryLabelZh: "查看文档 / 产品页",
				secondaryLabelEn: "Docs / Product"
			},
			deepl: {
				primaryUrl: "https://www.deepl.com/pro-api",
				primaryLabelZh: "注册 / 购买 DeepL API",
				primaryLabelEn: "Get DeepL API",
				secondaryUrl: "https://www.deepl.com/pro-api",
				secondaryLabelZh: "查看定价 / 文档",
				secondaryLabelEn: "Pricing / Docs"
			},
			deepseek: {
				primaryUrl: "https://platform.deepseek.com/api_keys",
				primaryLabelZh: "注册 / 获取 DeepSeek API Key",
				primaryLabelEn: "Get DeepSeek API Key",
				secondaryUrl: "https://api-docs.deepseek.com/zh-cn/",
				secondaryLabelZh: "查看文档 / 模型价格",
				secondaryLabelEn: "Docs / Pricing"
			},
			oaicompat: {
				primaryUrl: "https://platform.openai.com/signup",
				primaryLabelZh: "OpenAI 官方示例入口",
				primaryLabelEn: "OpenAI Example Portal",
				secondaryUrl: "https://developers.openai.com/api/reference/overview",
				secondaryLabelZh: "查看 OpenAI 文档",
				secondaryLabelEn: "OpenAI Docs",
				hintZh: "这是 OpenAI 兼容接口示例入口。你也可以替换成任意兼容 OpenAI 的第三方服务。",
				hintEn: "This is an OpenAI example portal. You can also replace it with any third-party OpenAI-compatible provider."
			},
			itranslate: {
				primaryUrl: "https://developer.itranslate.com/",
				primaryLabelZh: "打开 iTranslate 开发者入口",
				primaryLabelEn: "Open iTranslate Developer Portal"
			},
			yandex: {
				primaryUrl: "https://aistudio.yandex.ru/en/model-gallery#services",
				primaryLabelZh: "打开 Yandex 官方入口",
				primaryLabelEn: "Open Yandex Portal"
			},
			papago: {
				primaryUrl: "https://developers.naver.com/main/",
				primaryLabelZh: "打开 Naver Developers",
				primaryLabelEn: "Open Naver Developers"
			},
			baidu: {
				primaryUrl: "https://fanyi-api.baidu.com/",
				primaryLabelZh: "打开百度翻译开放平台",
				primaryLabelEn: "Open Baidu Translate Open Platform"
			}
		};
		
		var languages = {};
		var favorites = [];
		var authKeys = {};
		var channelLanguages = {}, guildLanguages = {};
		var translationEnabledStates = [], isTranslating;
		var translatedMessages = {}, oldMessages = {};
		var translationCache = {};
		var autoTranslationQueue = [];
		var queuedAutoTranslations = {};
		var suppressedAutoTranslations = {};
		var isBackgroundTranslating = false;
		var translationCacheSaveTimer = null;
		var translationRerenderTimer = null;
		var autoTranslationQueueRetryTimer = null;
		var autoTranslationChannelStates = {};
		var replyPreviewTranslations = {};
		var queuedReplyPreviewTranslations = {};
		var lastAutoTranslationChannelId = null;
		const MAX_TRANSLATION_CACHE_ENTRIES = 500;
		const AUTO_TRANSLATION_RERENDER_DELAY = 650;
		const AUTO_TRANSLATION_HISTORY_RERENDER_DELAY = 1000;
		const AUTO_TRANSLATION_QUEUE_RETRY_DELAY = 900;
		const AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD = 80;
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
	
		return class Translator extends Plugin {
			onLoad () {
				_this = this;
				
				this.defaults = {
					general: {
						addTranslateButton:		{value: true, 	popout: false},
						addQuickTranslateButton:	{value: true, 	popout: false},
						usePerChatTranslation:		{value: true, 	popout: false},
						interfaceLanguage:		{value: "system", 	popout: false},
						sendOriginalMessage:		{value: false, 	popout: true},
						showOriginalMessage:		{value: false, 	popout: true},
						showOriginalDirectly:		{value: true, 	popout: false},
						showOriginalInReplyPreview:	{value: false, 	popout: false},
						useSpoilerInSentOriginal:	{value: false, 	popout: false},
						useSpoilerInReceivedOriginal:	{value: false, 	popout: false},
						highlightTranslatedMessages:	{value: true, 	popout: false},
						showTranslationLabel:		{value: true, 	popout: false},
						translatedTextColor:		{value: "#7cc7ff", popout: false},
						protectQuotedText:		{value: true, 	popout: false,	description: "Automatically protect and highlight wrapped content"},
						useSpoilerInOriginal:		{value: false, 	popout: false,	description: "Use Spoilers instead of Quotes for the original Message Text"}
					},
					choices: {},
					filters: {
						autoTranslateSourceLanguages:	{value: []},
						receivedAutoTranslatePreset:	{value: "balanced"},
						receivedAutoTranslateScope:	{value: "new_only"},
						receivedAutoTranslateLoadedTimeWindow: {value: "1h"},
						receivedAutoTranslateSourceLanguages: {value: []},
						skipMixedReceivedMessages:	{value: true},
						skipSameLanguageReceivedMessages: {value: true},
						treatLanguageVariantsAsSame: {value: true},
						dropSimilarTranslations:	{value: true},
						minimumAutoTranslateLength:	{value: 6},
						translationSimilarityThreshold: {value: 0.9}
					},
					exceptions: {
						wordStart:			{value: ["!"],	max: 3},
						protectedTerms:		{value: [],		max: 80},
						wrapperPairs:		{value: ['"|"', '“|”', '`|`'], max: 20}
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
						"Embed",
						"MessageReply",
						"MessageButtons",
						"MessageContent"
					]
				};

				this.css = `
					${BDFDB.dotCN._translatortranslatebutton + BDFDB.dotCNS._translatortranslating + BDFDB.dotCN.textareaicon} {
						color: var(--status-danger) !important;
					}
					${BDFDB.dotCN._translatorconfigbutton} {
						margin: 2px 3px 0 6px;
					}
					.translator-original-message {
						margin-top: 6px;
						padding: 0;
						border: 0;
						white-space: pre-wrap;
						line-height: 1.35;
						opacity: 0.9;
						color: var(--text-normal) !important;
						text-align: left;
					}
					.translator-original-message > span {
						display: block;
						width: 100%;
						color: var(--text-normal) !important;
						text-align: left;
					}
					.translator-translated-message {
						margin-top: 4px;
						padding: 6px 10px 6px 12px;
						border-left: 2px solid var(--translator-accent-color, var(--brand-500, var(--text-link)));
						background: color-mix(in srgb, var(--translator-accent-color, var(--brand-500, var(--text-link))) 8%, transparent);
						border-radius: 6px;
						color: var(--translator-text-color, inherit);
					}
					.translator-protected-quote {
						color: var(--text-link);
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 14%, transparent);
						padding: 0 4px;
						border-radius: 4px;
						font-weight: 600;
					}
					.translator-original-spoiler {
						filter: blur(4px);
						transition: filter 120ms ease;
					}
					.translator-original-message:hover .translator-original-spoiler {
						filter: blur(0);
					}
					.translator-reply-preview-multiline {
						overflow: visible !important;
						max-height: none !important;
					}
					.translator-reply-preview-body {
						overflow: visible !important;
						max-height: none !important;
						height: auto !important;
					}
					.translator-reply-preview-text {
						display: block !important;
						white-space: pre-wrap !important;
						overflow: visible !important;
						text-overflow: unset !important;
						-webkit-line-clamp: unset !important;
						line-clamp: unset !important;
						max-height: none !important;
						height: auto !important;
					}
					.translator-reply-preview-text > span {
						white-space: inherit !important;
						overflow: visible !important;
						text-overflow: unset !important;
					}
					.translator-settings-inline-header {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 12px;
						margin-bottom: 8px;
					}
					.translator-settings-panel-root {
						overflow-anchor: none;
					}
					.translator-settings-panel-root [class*="select"] {
						overflow-anchor: none;
					}
					.translator-settings-inline-actions {
						display: flex;
						flex-wrap: wrap;
						justify-content: flex-end;
						gap: 8px;
					}
					.translator-settings-divider-spacious {
						margin-top: 14px !important;
						margin-bottom: 14px !important;
					}
					.translator-settings-note {
						margin-bottom: 8px;
						font-size: 12px;
						line-height: 1.45;
						color: var(--text-muted);
					}
					.translator-settings-switch-group {
						display: flex;
						flex-direction: column;
						margin: 6px 0 10px;
					}
					.translator-settings-switch-row {
						margin: 0 !important;
					}
					.translator-settings-switch-row + .translator-settings-switch-row {
						margin-top: 4px !important;
					}
					.translator-settings-primary-actions {
						gap: 10px;
					}
					.translator-settings-inline-grid {
						display: grid;
						grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
						gap: 12px;
						align-items: start;
					}
					.translator-settings-inline-grid > * {
						min-width: 0;
					}
					.translator-settings-color-option {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 12px;
						width: 100%;
					}
					.translator-color-palette {
						display: flex;
						flex-wrap: wrap;
						gap: 6px;
						margin-top: 6px;
					}
					.translator-color-chip {
						appearance: none;
						display: inline-flex;
						align-items: center;
						justify-content: center;
						width: 32px;
						height: 32px;
						padding: 0;
						border-radius: 8px;
						border: 1px solid var(--background-modifier-accent);
						background: var(--background-secondary-alt);
						box-shadow: none;
						color: var(--text-normal);
						cursor: pointer;
						font: inherit;
						transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
					}
					.translator-color-chip:hover {
						background: var(--background-modifier-hover);
						border-color: var(--brand-500, var(--text-link));
						color: var(--header-primary);
					}
					.translator-color-chip-active {
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 14%, var(--background-secondary-alt));
						border-color: var(--brand-500, var(--text-link));
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
						color: var(--header-primary);
					}
					.translator-color-chip-add {
						font-size: 14px;
						font-weight: 700;
					}
					.translator-color-chip-remove {
						font-size: 16px;
						font-weight: 700;
						color: var(--text-muted);
					}
					.translator-color-chip-remove:hover {
						color: var(--status-danger);
						border-color: var(--status-danger);
					}
					.translator-color-chip-code {
						display: none;
					}
					.translator-settings-color-swatch {
						width: 16px;
						height: 16px;
						border-radius: 4px;
						border: 1px solid var(--background-modifier-accent);
						flex: 0 0 auto;
					}
					.translator-color-custom-row {
						display: flex;
						align-items: center;
						gap: 8px;
						margin-top: 8px;
						max-width: 360px;
					}
					.translator-color-custom-input {
						flex: 1 1 auto;
					}
					.translator-secret-input-row {
						position: relative;
						margin-bottom: 8px;
					}
					.translator-secret-input-row .translator-secret-input {
						margin-bottom: 0 !important;
					}
					.translator-secret-input input {
						padding-right: 48px !important;
					}
					.translator-secret-toggle {
						position: absolute !important;
						top: 1px;
						right: 1px;
						bottom: 1px;
						width: 40px !important;
						padding: 0 !important;
						margin: 0 !important;
						display: flex !important;
						align-items: center !important;
						justify-content: center !important;
						border-radius: 0 4px 4px 0 !important;
						border: 0 !important;
						border-left: 1px solid var(--background-modifier-accent) !important;
						background: var(--input-background, var(--background-tertiary)) !important;
						box-shadow: none !important;
						color: var(--interactive-normal) !important;
						cursor: pointer !important;
						font-size: 16px !important;
						line-height: 1 !important;
						z-index: 2;
					}
					.translator-secret-toggle:hover {
						background: var(--background-modifier-hover) !important;
					}
					.translator-secret-toggle:focus-visible {
						outline: none !important;
						box-shadow: inset 0 0 0 1px var(--button-filled-brand-background, var(--brand-500)) !important;
					}
					.translator-secret-toggle svg {
						display: block;
					}
					.translator-settings-field-action {
						min-width: 92px !important;
						height: 32px !important;
						box-shadow: none !important;
						flex: 0 0 auto;
					}
					.translator-detector-panel {
						margin-bottom: 12px;
						padding: 12px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--background-secondary-alt);
					}
					.translator-detector-input-wrap {
						position: relative;
					}
					.translator-detector-textinput input {
						padding-right: 62px !important;
					}
					.translator-detector-input-button {
						position: absolute !important;
						top: 50%;
						right: 8px;
						height: 26px !important;
						min-width: 42px !important;
						transform: translateY(-50%);
						box-shadow: none !important;
						z-index: 2;
					}
					.translator-detector-input-button:active {
						transform: translateY(-50%) !important;
					}
					.translator-settings-support-panel {
						margin-bottom: 8px;
						padding: 4px 0 0 0;
						border: 0;
						border-radius: 0;
						background: transparent;
					}
					.translator-settings-support-row {
						display: flex;
						flex-wrap: wrap;
						gap: 8px;
					}
					.translator-settings-support-block + .translator-settings-support-block {
						margin-top: 12px;
						padding-top: 12px;
						border-top: 1px solid var(--background-modifier-accent);
					}
					.translator-settings-support-title {
						margin-bottom: 4px;
						font-size: 13px;
						font-weight: 600;
					}
					.translator-settings-support-hint {
						margin-bottom: 8px;
						line-height: 1.45;
						opacity: 0.8;
					}
					.translator-settings-meta {
						margin-top: 6px;
						font-size: 13px;
						line-height: 1.4;
						opacity: 0.75;
					}
					.translator-segmented-group {
						display: flex;
						flex-wrap: wrap;
						gap: 4px;
						margin-bottom: 8px;
						padding: 3px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--background-tertiary, var(--background-secondary));
					}
					.translator-segmented-button {
						appearance: none;
						display: inline-flex;
						align-items: center;
						justify-content: center;
						min-height: 32px;
						padding: 0 14px;
						border-radius: 7px;
						border: 0;
						background: transparent;
						box-shadow: none;
						color: var(--text-muted);
						cursor: pointer;
						font: inherit;
						font-size: 12px !important;
						font-weight: 600 !important;
						line-height: 1;
						transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
					}
					.translator-segmented-button:hover {
						background: var(--background-modifier-hover);
						color: var(--text-normal);
					}
					.translator-segmented-button-active {
						background: var(--background-secondary-alt);
						color: var(--header-primary);
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
					}
					.translator-preset-grid .translator-segmented-button {
						min-width: 84px;
					}
					.translator-scope-grid .translator-segmented-button {
						flex: 1 1 180px;
						min-height: 34px;
					}
					.translator-window-grid .translator-segmented-button {
						flex: 1 1 96px;
						min-height: 34px;
					}
					.translator-preset-grid {
						display: flex;
						flex-wrap: wrap;
						gap: 8px;
						margin-bottom: 10px;
					}
					.translator-preset-button {
						height: 30px !important;
						padding: 0 12px !important;
						border-radius: 999px !important;
						border: 1px solid var(--background-modifier-accent) !important;
						background: transparent !important;
						box-shadow: none !important;
						color: var(--text-normal) !important;
						font-size: 13px !important;
						font-weight: 600 !important;
					}
					.translator-preset-button:hover {
						background: var(--background-secondary-alt) !important;
						border-color: var(--brand-500, var(--text-link)) !important;
					}
					.translator-preset-button-active {
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 18%, transparent) !important;
						border-color: var(--brand-500, var(--text-link)) !important;
						color: var(--header-primary) !important;
					}
					.translator-preset-summary {
						margin-bottom: 10px;
						padding: 10px 12px;
						border-radius: 8px;
						background: var(--background-secondary-alt);
						border: 1px solid var(--background-modifier-accent);
					}
					.translator-preset-summary-title {
						font-size: 13px;
						font-weight: 600;
						margin-bottom: 4px;
					}
					.translator-preset-summary-text {
						font-size: 13px;
						line-height: 1.5;
						opacity: 0.85;
					}
					.translator-popout-toggle-group {
						margin-top: 10px;
						padding-top: 6px;
					}
					.translator-popout-channel-toggle {
						margin-top: 0;
						padding-top: 0;
						padding-bottom: 0;
						border-top: 0;
					}
					`;
			}
			
			onStart () {
				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageUtils, "startEditMessage", {before: e => {
					if (e.methodArguments[1] && oldMessages[e.methodArguments[1]] && oldMessages[e.methodArguments[1]].content) e.methodArguments[2] = oldMessages[e.methodArguments[1]].content;
				}});
				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageUtils, "editMessage", {before: e => {
					delete translatedMessages[e.methodArguments[1]];
					delete oldMessages[e.methodArguments[1]];
					this.clearCachedTranslation(e.methodArguments[1]);
				}});
				BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageToolbarUtils, "useMessageMenu", {after: e => {
					if (e.instance.props.message && e.instance.props.channel) {
						let translated = !!translatedMessages[e.instance.props.message.id];
						let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnValue, {id: ["copy-text", "pin", "unpin"]});
						if (index == -1) [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnValue, {id: ["edit", "add-reaction", "add-reaction-1", "quote"]});
						children.splice(index + 1, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
							label: translated ? this.labels.context_messageuntranslateoption : this.labels.context_messagetranslateoption,
							disabled: isTranslating,
							id: BDFDB.ContextMenuUtils.createItemId(this.name, translated ? "untranslate-message" : "translate-message"),
							icon: _ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
								icon: translated ? translateIconUntranslate : translateIcon
							}),
							action: _ => this.translateMessage(e.instance.props.message, e.instance.props.channel)
						}));
						this.injectMessageLanguageActions(children, index + 1, e.instance.props.message, e.instance.props.channel);
					}
				}});
				this.forceUpdateAll();
			}
			
			onStop () {
				if (translationCacheSaveTimer) clearTimeout(translationCacheSaveTimer);
				if (translationRerenderTimer) clearTimeout(translationRerenderTimer);
				if (autoTranslationQueueRetryTimer) clearTimeout(autoTranslationQueueRetryTimer);
				this.forceUpdateAll();
			}

			getSettingsPanel (collapseStates = {}) {
				let settingsPanel;
				return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(this, {
					collapseStates: collapseStates,
					children: _ => {
						let settingsItems = [];
						const recommendedEngines = ["microsoft", "googlecloud", "googleapi", "deepseek", "oaicompat"];
						const getSettingsPanelRoot = () => document.querySelector(".translator-settings-panel-root");
						const findScrollableParent = node => {
							let current = node;
							while (current && current.parentElement) {
								current = current.parentElement;
								if (!current) break;
								const style = window.getComputedStyle(current);
								const overflowY = style && style.overflowY;
								if ((overflowY == "auto" || overflowY == "scroll") && current.scrollHeight > current.clientHeight) return current;
							}
							return null;
						};
						const captureSettingsPanelScrollState = () => {
							const root = getSettingsPanelRoot();
							const scroller = root && findScrollableParent(root);
							if (!scroller) return null;
							return {
								scroller,
								scrollTop: scroller.scrollTop
							};
						};
						const restoreSettingsPanelScrollState = scrollState => {
							if (!scrollState || !scrollState.scroller) return;
							requestAnimationFrame(() => requestAnimationFrame(() => {
								const maxScrollTop = Math.max(0, scrollState.scroller.scrollHeight - scrollState.scroller.clientHeight);
								scrollState.scroller.scrollTo({top: Math.max(0, Math.min(scrollState.scrollTop, maxScrollTop))});
							}));
						};
						const refreshPanel = () => {
							const scrollState = captureSettingsPanelScrollState();
							BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
							restoreSettingsPanelScrollState(scrollState);
						};
						const saveAuthField = (engineKey, field, value) => {
							if (!authKeys[engineKey]) authKeys[engineKey] = {};
							authKeys[engineKey][field] = (value || "").trim ? (value || "").trim() : value;
							BDFDB.DataUtils.save(authKeys, this, "authKeys");
							this.SettingsUpdated = true;
						};
						const saveReceivedFilterSetting = (key, value) => {
							saveFilterSetting("receivedAutoTranslatePreset", "custom");
							saveFilterSetting(key, value);
						};
						const infoText = text => BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-note",
							children: text
						});
						const isChineseUi = this.isChineseUiLanguage();
						const isRussianUi = this.isRussianUiLanguage();
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
						const createStableSelect = props => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Select, Object.assign({
							menuShouldScrollIntoView: false,
							menuPosition: "fixed",
							closeMenuOnSelect: true
						}, props));
						const createSegmentedSelector = ({options, value, onChange, className = ""}) => BDFDB.ReactUtils.createElement("div", {
							className: BDFDB.DOMUtils.formatClassName("translator-segmented-group", className),
							children: options.map(option => BDFDB.ReactUtils.createElement("button", {
								type: "button",
								className: BDFDB.DOMUtils.formatClassName("translator-segmented-button", option.value == value && "translator-segmented-button-active"),
								onClick: _ => onChange(option.value),
								children: option.label
							}))
						});
						const ensureSecretInputState = () => {
							if (!this.secretInputState) this.secretInputState = {};
							return this.secretInputState;
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
									"aria-label": isSecretFieldVisible(fieldKey) ? this.getCustomText("hide_secret_label") : this.getCustomText("show_secret_label"),
									title: isSecretFieldVisible(fieldKey) ? this.getCustomText("hide_secret_label") : this.getCustomText("show_secret_label"),
									onClick: _ => toggleSecretFieldVisibility(fieldKey),
									children: createSecretToggleIcon(isSecretFieldVisible(fieldKey))
								})
							]
						});
						const createDisablePrefixForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("disable_prefix_title"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								infoText(this.getCustomText("disable_prefix_hint")),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListInput, {
									placeholder: this.getCustomText("disable_prefix_placeholder"),
									maxLength: this.defaults.exceptions.wordStart.max,
									items: this.settings.exceptions.wordStart,
									onChange: value => {
										this.SettingsUpdated = true;
										BDFDB.DataUtils.save(value, this, "exceptions", "wordStart");
									}
								})
							]
						});
						const createProtectedTermsForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("protected_terms_title"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								infoText(this.getCustomText("protected_terms_hint")),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListInput, {
									placeholder: this.getCustomText("protected_terms_placeholder"),
									maxLength: this.defaults.exceptions.protectedTerms.max,
									items: this.settings.exceptions.protectedTerms || [],
									onChange: value => {
										this.SettingsUpdated = true;
										BDFDB.DataUtils.save(value, this, "exceptions", "protectedTerms");
									}
								})
							]
						});
						const createWrapperPairsForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("wrapper_pairs_title"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								infoText(this.getCustomText("wrapper_pairs_hint")),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListInput, {
									placeholder: this.getCustomText("wrapper_pairs_placeholder"),
									maxLength: this.defaults.exceptions.wrapperPairs.max,
									items: this.settings.exceptions.wrapperPairs || [],
									onChange: value => {
										this.SettingsUpdated = true;
										BDFDB.DataUtils.save(value, this, "exceptions", "wrapperPairs");
									}
								})
							]
						});
						const createTranslatePrefixForm = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("translate_prefix_title"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								infoText(this.getCustomText("translate_prefix_hint")),
								...(this.settings.prefixes.translationPrefixData || []).map((entry, index) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
									className: BDFDB.disCN.marginbottom8,
									align: BDFDB.LibraryComponents.Flex.Align.CENTER,
									children: [
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
											grow: 0,
											shrink: 0,
											basis: "30%",
											children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
												placeholder: this.getCustomText("translate_prefix_placeholder"),
												value: entry.prefix,
												onChange: value => {
													this.settings.prefixes.translationPrefixData[index].prefix = value;
													BDFDB.DataUtils.save(this.settings.prefixes.translationPrefixData, this, "prefixes", "translationPrefixData");
													this.SettingsUpdated = true;
												}
											})
										}),
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
											grow: 1,
											shrink: 0,
											basis: "60%",
											children: createStableSelect({
												value: entry.language,
												options: Object.keys(languages)
													.filter(key => !languages[key].auto && !languages[key].special)
													.map(key => ({
														value: key,
														label: this.getLanguageDisplayName(languages[key])
													}))
													.sort((a, b) => a.label.localeCompare(b.label)),
												onChange: value => {
													this.settings.prefixes.translationPrefixData[index].language = value;
													BDFDB.DataUtils.save(this.settings.prefixes.translationPrefixData, this, "prefixes", "translationPrefixData");
													this.SettingsUpdated = true;
												}
											})
										}),
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
											grow: 0,
											shrink: 0,
											basis: "10%",
											children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
												color: BDFDB.LibraryComponents.Button.Colors.RED,
												size: BDFDB.LibraryComponents.Button.Sizes.TINY,
												onClick: _ => {
													this.settings.prefixes.translationPrefixData.splice(index, 1);
													BDFDB.DataUtils.save(this.settings.prefixes.translationPrefixData, this, "prefixes", "translationPrefixData");
													this.SettingsUpdated = true;
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
										if (!this.settings.prefixes.translationPrefixData) this.settings.prefixes.translationPrefixData = [];
										this.settings.prefixes.translationPrefixData.push({
											prefix: "$en",
											language: "en"
										});
										BDFDB.DataUtils.save(this.settings.prefixes.translationPrefixData, this, "prefixes", "translationPrefixData");
										this.SettingsUpdated = true;
										refreshPanel();
									},
									children: this.getCustomText("add_prefix_button")
								})
							]
						});
						const saveTranslatedTextColor = color => {
							color = (color || "").trim() || "#7cc7ff";
							this.settings.general.translatedTextColor = color;
							BDFDB.DataUtils.save(this.settings.general, this, "general");
							this.SettingsUpdated = true;
							refreshPanel();
						};
						const resetTranslatedTextColor = () => {
							const defaultColor = this.getTranslatedTextColorPresets()[0] || "#7cc7ff";
							const colorState = ensureTranslatedTextColorState();
							colorState.showCustom = false;
							colorState.customValue = defaultColor;
							saveTranslatedTextColor(defaultColor);
						};
						const ensureTranslatedTextColorState = () => {
							if (!this.translatedTextColorState) this.translatedTextColorState = {
								showCustom: false,
								customValue: this.getTranslatedTextColor()
							};
							if (!this.translatedTextColorState.customValue) this.translatedTextColorState.customValue = this.getTranslatedTextColor();
							return this.translatedTextColorState;
						};
						const createColorChip = (color, active) => BDFDB.ReactUtils.createElement("button", {
							type: "button",
							className: BDFDB.DOMUtils.formatClassName("translator-color-chip", active && "translator-color-chip-active"),
							title: color,
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
								})
							]
						});
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
							const state = this.modelCatalogState && this.modelCatalogState[engineKey];
							if (!state || !state.items || !state.items.length) return null;
							return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
								title: this.getCustomText("model_catalog_title"),
								className: BDFDB.disCN.marginbottom8,
								children: [
									createStableSelect({
										value: authKeys[engineKey] && authKeys[engineKey].model || "",
										options: state.items.map(modelId => ({value: modelId, label: modelId})),
										onChange: value => {
											saveAuthField(engineKey, "model", value);
											refreshPanel();
										}
									}),
									BDFDB.ReactUtils.createElement("div", {
										className: "translator-settings-meta",
										children: this.getCustomText("model_catalog_loaded").replace("{count}", state.items.length)
									})
								]
							});
						};
						const updateEngineSetting = (field, value) => {
							this.settings.engines[field] = value;
							BDFDB.DataUtils.save(this.settings.engines, this, "engines");
							this.setLanguages();
							this.SettingsUpdated = true;
							refreshPanel();
						};
						const saveFilterSetting = (key, value) => {
							if (!this.settings.filters) this.settings.filters = {};
							this.settings.filters[key] = value;
							BDFDB.DataUtils.save(value, this, "filters", key);
							this.SettingsUpdated = true;
						};
						const applyReceivedPreset = preset => {
							const profiles = this.getReceivedAutoTranslatePresetProfiles();
							const profile = profiles[preset] || profiles.balanced;
							saveFilterSetting("receivedAutoTranslatePreset", preset || "balanced");
							if (profile.values) Object.keys(profile.values).forEach(key => saveFilterSetting(key, profile.values[key]));
							refreshPanel();
						};
						const createLanguageOptions = direction => Object.keys(languages)
							.filter(key => !languages[key].special && (direction == languageTypes.INPUT || !languages[key].auto))
							.map(key => ({
								value: key,
								label: this.getLanguageDisplayName(languages[key])
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
								value: this.settings.choices[place][direction],
								options: createLanguageOptions(direction),
								onChange: value => {
									this.settings.choices[place][direction] = value;
									BDFDB.DataUtils.save(this.settings.choices, this, "choices");
									this.setLanguages();
									this.SettingsUpdated = true;
									refreshPanel();
								}
							})
						});
						const createGeneralSwitch = key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
							type: "Switch",
							plugin: this,
							keys: ["general", key],
							className: "translator-settings-switch-row",
							label: this.getGeneralSettingLabel(key),
							value: this.settings.general[key]
						});
						const createGeneralSwitchGroup = keys => BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-switch-group",
							children: keys.map(createGeneralSwitch)
						});
						const createUiLanguageSelector = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("plugin_language_title"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								infoText(this.getCustomText("plugin_language_hint")),
								createStableSelect({
									value: this.settings.general.interfaceLanguage || "system",
									options: this.getPluginLanguageOptions(),
									onChange: value => {
										this.settings.general.interfaceLanguage = value || "system";
										BDFDB.DataUtils.save(this.settings.general, this, "general");
										this.SettingsUpdated = true;
										refreshPanel();
									}
								})
							]
						});
						const createTranslatedTextColorInput = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("translated_text_color_title"),
							className: BDFDB.disCN.marginbottom8,
							children: (() => {
								const currentColor = this.getTranslatedTextColor();
								const colorState = ensureTranslatedTextColorState();
								const presetColors = this.getTranslatedTextColorPalette();
								const hasCustomCurrentColor = !this.getTranslatedTextColorPresets().includes(currentColor);
								return [
									createGeneralSwitch("highlightTranslatedMessages"),
									infoText(compactText("点色板即可切换，+ 号可自定义颜色。", "Pick a swatch or use + for a custom color.", "Нажмите цвет или используйте + для своего варианта.")),
									BDFDB.ReactUtils.createElement("div", {
										className: "translator-color-palette",
										children: [
											...presetColors.map(color => createColorChip(color, color == currentColor)),
											hasCustomCurrentColor && BDFDB.ReactUtils.createElement("button", {
												type: "button",
												className: "translator-color-chip translator-color-chip-remove",
												title: compactText("删除当前自定义颜色", "Remove current custom color", "Удалить текущий пользовательский цвет"),
												onClick: _ => resetTranslatedTextColor(),
												children: "×"
											}),
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
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
												className: "translator-color-custom-input",
												placeholder: "#7cc7ff",
												value: colorState.customValue,
												onChange: value => {
													colorState.customValue = value;
												}
											}),
											createActionButton({
												label: this.getCustomText("translated_text_color_save_button"),
												look: BDFDB.LibraryComponents.Button.Looks.OUTLINED,
												className: "translator-settings-field-action",
												onClick: _ => {
													const customColor = (colorState.customValue || "").trim();
													if (!this.isValidCssColorValue(customColor)) return BDFDB.NotificationUtils.toast(this.getCustomText("translated_text_color_invalid"), {type: "danger", position: "center"});
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
						const createLanguageDetector = () => {
							if (!this.languageDetectorState) this.languageDetectorState = {text: "", detectedLanguageId: null};
							const detectedLanguageId = this.languageDetectorState.detectedLanguageId;
							const detectedLanguage = detectedLanguageId && this.getLanguageData(detectedLanguageId);
							return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
								title: this.getCustomText("language_detector_title"),
								className: BDFDB.disCN.marginbottom8,
								children: [
									infoText(this.getCustomText("language_detector_hint")),
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
										className: BDFDB.disCN.marginbottom8,
										placeholder: this.getCustomText("language_detector_placeholder"),
										value: this.languageDetectorState.text,
										onChange: value => {
											this.languageDetectorState.text = value;
										}
									}),
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
										className: BDFDB.disCN.marginbottom8,
										align: BDFDB.LibraryComponents.Flex.Align.CENTER,
										children: [
									BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
										grow: 0,
										shrink: 0,
										children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
													onClick: async _ => {
														const text = (this.languageDetectorState.text || "").trim();
														if (!text) return BDFDB.NotificationUtils.toast(this.getCustomText("language_detector_empty"), {type: "danger", position: "center"});
														const result = await this.detectLanguageDetails(text);
														this.languageDetectorState.detectedLanguageId = result && result.id || null;
														if (!result) BDFDB.NotificationUtils.toast(this.getCustomText("language_detector_failed"), {type: "danger", position: "center"});
														refreshPanel();
													},
													children: this.getCustomText("language_detector_button")
												})
											}),
											detectedLanguage && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
												grow: 1,
												shrink: 1,
												children: BDFDB.ReactUtils.createElement("div", {
													style: {paddingLeft: "12px", lineHeight: "1.4", opacity: 0.9},
													children: `${this.getCustomText("language_detector_detected")}: ${this.getLanguageDisplayName(detectedLanguage)} (${detectedLanguage.id})`
												})
											})
										].filter(Boolean)
									}),
									detectedLanguage && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
										className: BDFDB.disCN.marginbottom8,
										align: BDFDB.LibraryComponents.Flex.Align.CENTER,
										children: [
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
												grow: 0,
												shrink: 0,
												children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
													size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
													onClick: _ => {
														this.settings.choices[messageTypes.RECEIVED][languageTypes.INPUT] = detectedLanguage.id;
														BDFDB.DataUtils.save(this.settings.choices, this, "choices");
														this.setLanguages();
														this.SettingsUpdated = true;
														refreshPanel();
													},
													children: this.getCustomText("language_detector_apply_received")
												})
											}),
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
												grow: 0,
												shrink: 0,
												children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
													size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
													onClick: _ => {
														this.settings.choices[messageTypes.SENT][languageTypes.INPUT] = detectedLanguage.id;
														BDFDB.DataUtils.save(this.settings.choices, this, "choices");
														this.setLanguages();
														this.SettingsUpdated = true;
														refreshPanel();
													},
													children: this.getCustomText("language_detector_apply_sent")
												})
											}),
											BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
												grow: 0,
												shrink: 0,
												children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
													size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
													onClick: _ => {
														this.settings.choices[messageTypes.SENT][languageTypes.OUTPUT] = detectedLanguage.id;
														BDFDB.DataUtils.save(this.settings.choices, this, "choices");
														this.setLanguages();
														this.SettingsUpdated = true;
														refreshPanel();
													},
													children: this.getCustomText("language_detector_apply_sent_output")
												})
											})
										]
									})
								].filter(Boolean)
							});
						};
						const createSourceLanguageFilter = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("source_filter_title"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								infoText(this.getCustomText("source_filter_hint")),
								...((this.settings.filters && this.settings.filters.autoTranslateSourceLanguages) || []).map((languageId, index) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
									className: BDFDB.disCN.marginbottom8,
									align: BDFDB.LibraryComponents.Flex.Align.CENTER,
									children: [
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
											grow: 1,
											shrink: 0,
											basis: "85%",
											children: createStableSelect({
												value: languageId,
												options: Object.keys(languages)
													.filter(key => !languages[key].auto && !languages[key].special)
													.map(key => ({
														value: key,
														label: this.getLanguageDisplayName(languages[key])
													}))
													.sort((a, b) => a.label.localeCompare(b.label)),
												onChange: value => {
													this.settings.filters.autoTranslateSourceLanguages[index] = value;
													BDFDB.DataUtils.save(this.settings.filters.autoTranslateSourceLanguages, this, "filters", "autoTranslateSourceLanguages");
													this.SettingsUpdated = true;
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
													this.settings.filters.autoTranslateSourceLanguages.splice(index, 1);
													BDFDB.DataUtils.save(this.settings.filters.autoTranslateSourceLanguages, this, "filters", "autoTranslateSourceLanguages");
													this.SettingsUpdated = true;
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
										if (!this.settings.filters) this.settings.filters = {};
										if (!this.settings.filters.autoTranslateSourceLanguages) this.settings.filters.autoTranslateSourceLanguages = [];
										this.settings.filters.autoTranslateSourceLanguages.push("en");
										BDFDB.DataUtils.save(this.settings.filters.autoTranslateSourceLanguages, this, "filters", "autoTranslateSourceLanguages");
										this.SettingsUpdated = true;
										refreshPanel();
									},
									children: this.getCustomText("source_filter_add")
								})
							]
						});
						const createReceivedSourceLanguageFilter = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
							title: this.getCustomText("received_source_filter_title"),
							className: BDFDB.disCN.marginbottom8,
							children: [
								infoText(this.getCustomText("received_source_filter_hint")),
								...((this.settings.filters && this.settings.filters.receivedAutoTranslateSourceLanguages) || []).map((languageId, index) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
									className: BDFDB.disCN.marginbottom8,
									align: BDFDB.LibraryComponents.Flex.Align.CENTER,
									children: [
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
											grow: 1,
											shrink: 0,
											basis: "85%",
											children: createStableSelect({
												value: languageId,
												options: Object.keys(languages)
													.filter(key => !languages[key].auto && !languages[key].special)
													.map(key => ({
														value: key,
														label: this.getLanguageDisplayName(languages[key])
													}))
													.sort((a, b) => a.label.localeCompare(b.label)),
												onChange: value => {
													this.settings.filters.receivedAutoTranslateSourceLanguages[index] = value;
													BDFDB.DataUtils.save(this.settings.filters.receivedAutoTranslateSourceLanguages, this, "filters", "receivedAutoTranslateSourceLanguages");
													this.SettingsUpdated = true;
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
													this.settings.filters.receivedAutoTranslateSourceLanguages.splice(index, 1);
													BDFDB.DataUtils.save(this.settings.filters.receivedAutoTranslateSourceLanguages, this, "filters", "receivedAutoTranslateSourceLanguages");
													this.SettingsUpdated = true;
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
										if (!this.settings.filters) this.settings.filters = {};
										if (!this.settings.filters.receivedAutoTranslateSourceLanguages) this.settings.filters.receivedAutoTranslateSourceLanguages = [];
										this.settings.filters.receivedAutoTranslateSourceLanguages.push("en");
										BDFDB.DataUtils.save(this.settings.filters.receivedAutoTranslateSourceLanguages, this, "filters", "receivedAutoTranslateSourceLanguages");
										this.SettingsUpdated = true;
										refreshPanel();
									},
									children: this.getCustomText("received_source_filter_add")
								})
							]
						});
						const createReceivedAutoTranslateSettings = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("received_auto_translate_title"),
							collapseStates: collapseStates,
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
									title: this.getCustomText("received_auto_translate_scope_title"),
									className: BDFDB.disCN.marginbottom8,
									children: [
										createSegmentedSelector({
											className: "translator-scope-grid",
											options: this.getReceivedAutoTranslateScopeOptions(),
											value: this.getReceivedAutoTranslateScope(),
											onChange: value => {
												saveReceivedFilterSetting("receivedAutoTranslateScope", value == "loaded_messages" ? "loaded_messages" : "new_only");
												this.resetAutoTranslationTracking();
												this.clearDisplayedAutoTranslations();
												this.clearAutoTranslationQueue();
												this.scheduleTranslationRerender();
												this.processAutoTranslationQueue();
												refreshPanel();
											}
										})
									]
								}),
								this.getReceivedAutoTranslateScope() == "loaded_messages" && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
									title: this.getCustomText("received_auto_translate_loaded_window_title"),
									className: BDFDB.disCN.marginbottom8,
									children: [
										createSegmentedSelector({
											className: "translator-window-grid",
											options: this.getReceivedAutoTranslateLoadedTimeWindowOptions(),
											value: this.getReceivedAutoTranslateLoadedTimeWindow(),
											onChange: value => {
												saveReceivedFilterSetting("receivedAutoTranslateLoadedTimeWindow", value);
												this.resetAutoTranslationTracking();
												this.clearDisplayedAutoTranslations();
												this.clearAutoTranslationQueue();
												this.scheduleTranslationRerender({batched: true});
												refreshPanel();
											}
										})
									]
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
									type: "Switch",
									plugin: this,
									keys: ["filters", "skipMixedReceivedMessages"],
									label: this.getCustomText("skip_mixed_received_label"),
									value: this.settings.filters.skipMixedReceivedMessages,
									onChange: value => {
										saveReceivedFilterSetting("skipMixedReceivedMessages", value);
									}
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
									type: "Switch",
									plugin: this,
									keys: ["filters", "skipSameLanguageReceivedMessages"],
									label: this.getCustomText("skip_same_language_received_label"),
									value: this.settings.filters.skipSameLanguageReceivedMessages,
									onChange: value => {
										saveReceivedFilterSetting("skipSameLanguageReceivedMessages", value);
									}
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
									type: "Switch",
									plugin: this,
									keys: ["filters", "treatLanguageVariantsAsSame"],
									label: this.getCustomText("treat_language_variants_label"),
									value: this.settings.filters.treatLanguageVariantsAsSame,
									onChange: value => {
										saveReceivedFilterSetting("treatLanguageVariantsAsSame", value);
									}
								}),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
									type: "Switch",
									plugin: this,
									keys: ["filters", "dropSimilarTranslations"],
									label: this.getCustomText("drop_similar_translations_label"),
									value: this.settings.filters.dropSimilarTranslations,
									onChange: value => {
										saveReceivedFilterSetting("dropSimilarTranslations", value);
									}
								}),
								BDFDB.ReactUtils.createElement("div", {
									className: "translator-settings-inline-grid",
									children: [
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
											title: this.getCustomText("minimum_auto_translate_length_title"),
											className: BDFDB.disCN.marginbottom8,
											children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
												placeholder: "6",
												value: String(this.settings.filters.minimumAutoTranslateLength != null ? this.settings.filters.minimumAutoTranslateLength : 6),
												onChange: value => {
													value = parseInt(value, 10);
													saveReceivedFilterSetting("minimumAutoTranslateLength", isNaN(value) ? 6 : Math.max(1, Math.min(80, value)));
												}
											})
										}),
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
											title: this.getCustomText("translation_similarity_threshold_title"),
											className: BDFDB.disCN.marginbottom8,
											children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
												placeholder: "0.90",
												value: String(this.settings.filters.translationSimilarityThreshold != null ? this.settings.filters.translationSimilarityThreshold : 0.9),
												onChange: value => {
													value = parseFloat(value);
													saveReceivedFilterSetting("translationSimilarityThreshold", isNaN(value) ? 0.9 : Math.max(0.5, Math.min(0.99, value)));
												}
											})
										})
									]
								}),
								createReceivedSourceLanguageFilter()
							].filter(Boolean)
						});
						const createEngineOptions = keys => keys
							.filter(key => translationEngines[key])
							.map(key => ({value: key, label: this.getEngineLabel(key)}));
						const createPrimaryOptions = () => createEngineOptions(recommendedEngines.concat(Object.keys(translationEngines).filter(key => !recommendedEngines.includes(key))));
						const createBackupOptions = () => [{value: "----", label: this.getCustomText("backup_engine_none")}].concat(
							Object.keys(translationEngines)
								.filter(key => key != this.settings.engines.translator)
								.map(key => ({value: key, label: this.getEngineLabel(key)}))
						);
						const createEngineFields = engineKey => {
							const engine = translationEngines[engineKey];
							if (!engine) return [infoText(this.getCustomText("engine_unknown_hint"))];
							if (engineKey == "googleapi") return [createEngineSupportPanel(engineKey)];
							let items = [];
							if (engine.premium) items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
								type: "Switch",
								label: this.getCustomText("paid_version_label"),
								tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
								value: authKeys[engineKey] && authKeys[engineKey].paid,
								onChange: value => {
									if (!authKeys[engineKey]) authKeys[engineKey] = {};
									authKeys[engineKey].paid = value;
									BDFDB.DataUtils.save(authKeys, this, "authKeys");
									this.SettingsUpdated = true;
								}
							}));
							if (engine.key) {
								items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
									className: BDFDB.disCN.marginbottom8,
									tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
									children: this.getCustomText("api_key_label")
								}));
								items.push(createSecretInput({
									fieldKey: `${engineKey}-key`,
									placeholder: engine.key,
									value: authKeys[engineKey] && authKeys[engineKey].key,
									onChange: value => saveAuthField(engineKey, "key", value)
								}));
							}
							if (engine.endpoint) {
								items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
									className: BDFDB.disCN.marginbottom8,
									tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
									children: this.getCustomText("api_endpoint_label")
								}));
								items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
									className: BDFDB.disCN.marginbottom8,
									placeholder: engine.endpoint,
									value: authKeys[engineKey] && authKeys[engineKey].endpoint,
									onChange: value => saveAuthField(engineKey, "endpoint", value)
								}));
							}
							if (engine.model) {
								const modelCatalogState = this.modelCatalogState && this.modelCatalogState[engineKey];
								const modelActions = [];
								if (this.isValidatableEngine(engineKey)) modelActions.push(createActionButton({
									label: this.getCustomText("model_detect_button"),
									color: defaultSecondaryButtonColor,
									className: "translator-settings-field-action",
									onClick: async _ => {
										const result = await this.validateEngineConfig(engineKey);
										if (result && result.normalized) refreshPanel();
									}
								}));
								if (this.supportsModelCatalog(engineKey)) modelActions.push(createActionButton({
									label: modelCatalogState && modelCatalogState.loading ? this.getCustomText("model_fetch_loading") : this.getCustomText("model_fetch_button"),
									color: defaultSecondaryButtonColor,
									className: "translator-settings-field-action",
									onClick: _ => this.fetchModelCatalog(engineKey, refreshPanel)
								}));
								items.push(createInlineHeader(this.getCustomText("model_id_label"), modelActions));
								items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
									className: BDFDB.disCN.marginbottom8,
									placeholder: engine.model,
									value: authKeys[engineKey] && authKeys[engineKey].model,
									onChange: value => saveAuthField(engineKey, "model", value)
								}));
								if (modelCatalogState && modelCatalogState.loading) items.push(BDFDB.ReactUtils.createElement("div", {
									className: BDFDB.disCN.marginbottom8,
									style: {opacity: 0.8, lineHeight: "1.5"},
									children: this.getCustomText("model_fetch_loading")
								}));
								const fetchedModelSelector = createFetchedModelSelector(engineKey);
								if (fetchedModelSelector) items.push(fetchedModelSelector);
							}
							if (engineKey == "microsoft") items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
								title: this.getCustomText("microsoft_region_label"),
								className: BDFDB.disCN.marginbottom8,
								children: createStableSelect({
									value: authKeys[engineKey] && authKeys[engineKey].region || "global",
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
							if (!items.length) items.push(infoText(this.getCustomText("engine_no_extra_fields")));
							return items;
						};
						const createOtherServiceAuthSection = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("other_service_title"),
							collapseStates: collapseStates,
							children: [
								infoText(compactText("只有切换到这些服务商时再填写。", "Only fill these in if you switch to those providers.", "Заполняйте только если будете переключаться на этих провайдеров.")),
								...Object.keys(translationEngines)
									.filter(key => translationEngines[key].key && !recommendedEngines.includes(key))
									.map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
										title: this.getEngineLabel(key),
										collapseStates: collapseStates,
										children: createEngineFields(key)
									}))
							]
						});
						const createProtectionSection = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("protection_section_title"),
							collapseStates: collapseStates,
							children: [
								createGeneralSwitch("protectQuotedText"),
								createProtectedTermsForm(),
								createWrapperPairsForm()
							]
						});
						const createPrefixSection = () => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("prefix_section_title"),
							collapseStates: collapseStates,
							children: [
								createDisablePrefixForm(),
								createTranslatePrefixForm()
							]
						});
						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("section_service_title"),
							collapseStates: collapseStates,
							children: [
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
									title: this.getCustomText("primary_engine_title"),
									className: BDFDB.disCN.marginbottom8,
									children: createStableSelect({
										value: this.settings.engines.translator,
										options: createPrimaryOptions(),
										onChange: value => updateEngineSetting("translator", value)
									})
								}),
								...createEngineFields(this.settings.engines.translator),
								createDivider(),
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
									title: this.getCustomText("backup_engine_title"),
									collapseStates: collapseStates,
									children: [
										infoText(compactText("主服务失败时才会切到备用服务。", "Used only when the primary provider fails.", "Используется только при сбое основного провайдера.")),
										BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
											title: this.getCustomText("backup_engine_select_title"),
											className: BDFDB.disCN.marginbottom8,
											children: createStableSelect({
												value: this.settings.engines.backup,
												options: createBackupOptions(),
												onChange: value => updateEngineSetting("backup", value)
											})
										}),
										this.settings.engines.backup == "----" ? infoText(this.getCustomText("backup_engine_none_hint")) : createEngineFields(this.settings.engines.backup)
									]
								}),
								createOtherServiceAuthSection()
							]
						}));
						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("section_language_title"),
							collapseStates: collapseStates,
							children: [
								createSubsectionTitle(this.getCustomText("section_message_language_title")),
								createLanguageSelector(messageTypes.SENT, languageTypes.INPUT, this.getCustomText("sent_input_title")),
								createLanguageSelector(messageTypes.SENT, languageTypes.OUTPUT, this.getCustomText("sent_output_title")),
								createSourceLanguageFilter(),
								createDivider(),
								createLanguageSelector(messageTypes.RECEIVED, languageTypes.INPUT, this.getCustomText("received_input_title")),
								createLanguageSelector(messageTypes.RECEIVED, languageTypes.OUTPUT, this.getCustomText("received_output_title")),
								createReceivedAutoTranslateSettings()
							]
						}));
						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("section_display_title"),
							collapseStates: collapseStates,
							children: [
								createSubsectionTitle(this.getCustomText("section_display_message_title")),
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
								createSubsectionTitle(this.getCustomText("section_display_ui_title")),
								createGeneralSwitchGroup([
									"addTranslateButton",
									"addQuickTranslateButton",
									"usePerChatTranslation"
								]),
								createUiLanguageSelector()
							]
						}));
						settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
							title: this.getCustomText("section_advanced_title"),
							collapseStates: collapseStates,
							children: [
								createProtectionSection(),
								createPrefixSection()
							]
						}));
						return BDFDB.ReactUtils.createElement("div", {
							className: "translator-settings-panel-root",
							children: settingsItems.flat(10).filter(n => n)
						});
					}
				});
			}
		
			onSettingsClosed () {
				if (this.SettingsUpdated) {
					delete this.SettingsUpdated;
					this.forceUpdateAll();
				}
			}

			getCustomText (key) {
				const isChinese = this.isChineseUiLanguage();
				const isRussian = this.isRussianUiLanguage();
				const engineKey = null;
				if (isRussian && engineKey == "googleapi") return "Google (по умолчанию, без API)";
				if (isRussian && engineKey == "googlecloud") return "Google Cloud Translation (официальный API)";
				if (isRussian && engineKey == "microsoft") return "Azure Translator (официальный API)";
				if (isRussian && engineKey == "oaicompat") return "Пользовательский API (совместимый с OpenAI)";
				const texts = isChinese ? {
					auth_keys_title: "自定义密钥",
					custom_section_title: "自定义",
					api_key_label: "API 密钥：",
					api_endpoint_label: "接口地址：",
					model_id_label: "模型名：",
					paid_version_label: "付费版",
					microsoft_region_label: "地区：",
					section_service_title: "翻译服务",
					section_service_hint: "先选服务商，再填写对应参数。Google 默认可直接用；如果你想用正式接口，推荐选 Azure Translator 或 Google Cloud Translation。",
					primary_engine_title: "主服务商",
					backup_engine_title: "备用服务（可选）",
					backup_engine_select_title: "备用服务商",
					backup_engine_hint: "主服务失败时，才会尝试备用服务。",
					backup_engine_none: "不使用备用服务",
					backup_engine_none_hint: "当前未启用备用服务。",
					google_default_hint: "当前使用 Google 默认模式，不需要填写 API、接口地址或模型名。",
					engine_unknown_hint: "当前服务商的设置项暂时无法显示。",
					engine_no_extra_fields: "当前服务商没有额外的可填写参数。",
					other_service_title: "其他服务商密钥（高级，可不填）",
					other_service_hint: "这里保留兼容功能，只有你以后想切换到这些服务商时才需要填写。",
					section_language_title: "语言设置",
					section_language_hint: "这里是默认语言规则。发送前翻译会优先按这里的设置处理。",
					sent_input_title: "发送消息的源语言",
					sent_output_title: "发送消息的目标语言",
					received_input_title: "收到消息的源语言",
					received_output_title: "收到消息的目标语言",
					source_filter_title: "发送前只翻这些源语言",
					source_filter_hint: "留空时，检测到什么语言就翻什么语言。添加后，只翻这里列出的源语言。",
					source_filter_add: "+ 添加源语言",
					section_display_title: "显示与交互",
					section_display_hint: "这里控制按钮显示方式，以及原文和译文的展示规则。这里的剧透模式就是 Discord 原生 spoiler，也就是刮刮乐遮盖效果。",
					section_advanced_title: "高级功能",
					prefix_section_title: "快捷前缀",
					disable_prefix_title: "跳过翻译前缀",
					disable_prefix_hint: "输入以这些前缀开头的消息时，将直接发送原文，不走翻译。",
					disable_prefix_placeholder: "新增禁用前缀（例如 !）",
					translate_prefix_title: "指定目标语言前缀",
					translate_prefix_hint: "例如输入 $fr hello，会把 hello 翻成法语后再发送。",
					translate_prefix_placeholder: "前缀（例如 $fr）",
					add_prefix_button: "+ 添加新前缀"
					, validate_button_label: "验证当前配置",
					validate_hint: "会发送一次最小在线请求，用来检查 API Key、接口地址和模型是否可用。",
					validate_running: "正在验证",
					validate_success: "验证成功",
					validate_failed: "验证失败",
					validate_saved_endpoint: "已自动修正并保存接口地址",
					validate_missing_key: "请先填写 API Key。",
					validate_missing_model: "请先填写模型名。",
					validate_missing_endpoint: "请先填写接口地址。",
					support_panel_validate_title: "连接测试",
					support_panel_links_title: "帮助与开通",
					model_detect_button: "检测模型",
					model_fetch_button: "获取模型列表",
					model_fetch_loading: "正在获取模型列表…",
					model_catalog_title: "已获取模型列表",
					model_catalog_loaded: "已获取 {count} 个模型，选择后会自动填回上面的模型输入框。",
					model_catalog_empty: "没有获取到可用模型。"
				} : {
					auth_keys_title: "Own Auth Keys",
					custom_section_title: "Custom",
					api_key_label: "API Key:",
					api_endpoint_label: "API Endpoint:",
					model_id_label: "Model ID:",
					paid_version_label: "Paid Version",
					microsoft_region_label: "Region:",
					section_service_title: "Translation Provider",
					section_service_hint: "Choose a provider first, then fill in only the fields that provider needs. For official paid APIs, Azure Translator and Google Cloud Translation are recommended.",
					primary_engine_title: "Primary Provider",
					backup_engine_title: "Backup Provider (Optional)",
					backup_engine_select_title: "Backup Provider",
					backup_engine_hint: "The backup provider is used only when the primary one fails.",
					backup_engine_none: "No Backup Provider",
					backup_engine_none_hint: "No backup provider is enabled right now.",
					google_default_hint: "Google default mode does not require your own API key, endpoint, or model.",
					engine_unknown_hint: "This provider does not have a visible settings form right now.",
					engine_no_extra_fields: "This provider has no extra editable fields.",
					other_service_title: "Other Provider Keys (Advanced)",
					other_service_hint: "These are kept for compatibility and only matter if you switch to them later.",
					section_language_title: "Language Rules",
					section_language_hint: "These are the default language rules used for sending and receiving messages.",
					sent_input_title: "Source language for sent messages",
					sent_output_title: "Target language for sent messages",
					received_input_title: "Source language for received messages",
					received_output_title: "Target language for received messages",
					source_filter_title: "Outgoing source languages for auto-translate",
					source_filter_hint: "Leave this empty to auto-translate every detected language. Add languages here to translate only those source languages into your configured target language.",
					source_filter_add: "+ Add source language",
					section_display_title: "Display and Interaction",
					section_display_hint: "Control button visibility and how original text is shown together with translations. Spoiler mode here is the same Discord scratch-off effect.",
					section_advanced_title: "Advanced Features",
					prefix_section_title: "Prefix Rules",
					disable_prefix_title: "Skip-translation prefixes",
					disable_prefix_hint: "Messages that start with these prefixes are sent without translation.",
					disable_prefix_placeholder: "New exception prefix (e.g. !)",
					translate_prefix_title: "Forced target-language prefixes",
					translate_prefix_hint: "For example, `$fr hello` translates `hello` into French before sending.",
					translate_prefix_placeholder: "Prefix (e.g. $fr)",
					add_prefix_button: "+ Add new prefix",
					validate_button_label: "Validate Current Config",
					validate_hint: "This sends one minimal live request to verify that the API key, endpoint, and model are usable.",
					validate_running: "Validating",
					validate_success: "Validation succeeded",
					validate_failed: "Validation failed",
					validate_saved_endpoint: "Endpoint was normalized and saved automatically",
					validate_missing_key: "Please enter an API key first.",
					validate_missing_model: "Please enter a model ID first.",
					validate_missing_endpoint: "Please enter an API endpoint first.",
					support_panel_validate_title: "Connection Test",
					support_panel_links_title: "Help and Setup",
					model_detect_button: "Check Model",
					model_fetch_button: "Fetch Models",
					model_fetch_loading: "Loading model list…",
					model_catalog_title: "Fetched Models",
					model_catalog_loaded: "{count} models loaded. Selecting one will fill the model field above.",
					model_catalog_empty: "No models were returned."
				};
				Object.assign(texts, isChinese ? {
					protected_terms_title: "保护词 / 保护短语",
					protected_terms_hint: "填入不希望被翻译的固定名词或短语，例如 BUG team、ChatGPT Plus、DeepSeek V3。翻译前会先保护它们，翻译后再原样放回。",
					protected_terms_placeholder: "新增保护词或短语",
					channel_auto_translate_label: "当前频道自动翻译",
					channel_auto_translate_on: "当前频道自动翻译已开启",
					channel_auto_translate_off: "左键打开设置，右键一键开启当前频道自动翻译",
					language_detector_title: "语言识别助手",
					language_detector_hint: "把频道里的陌生文本粘贴到这里，插件会识别语言，并可一键填入上面的语言设置。",
					language_detector_placeholder: "粘贴一小段待识别文本",
					language_detector_button: "识别",
					language_detector_button_loading: "识别中",
					language_detector_empty: "请先粘贴要识别的文本。",
					language_detector_failed: "暂时无法识别这段文本，请换一段更长或更典型的内容再试。",
					language_detector_detected: "识别结果",
					language_detector_apply_received: "填入收到消息源语言",
					language_detector_apply_sent: "填入发送消息输入语言"
				} : {
					protected_terms_title: "Protected Terms / Phrases",
					protected_terms_hint: "Add names or phrases that must stay unchanged, such as BUG team, ChatGPT Plus, or DeepSeek V3. They will be protected before translation and restored afterward.",
					protected_terms_placeholder: "Add protected term or phrase",
					channel_auto_translate_label: "Auto translate this channel",
					channel_auto_translate_on: "Auto translate is enabled for this channel",
					channel_auto_translate_off: "Left click for settings, right click to enable auto translate for this channel",
					language_detector_title: "Language Detection Helper",
					language_detector_hint: "Paste a short sample from the channel here. The plugin will detect the language and let you apply it to the rules above.",
					language_detector_placeholder: "Paste text to detect",
					language_detector_button: "Detect",
					language_detector_button_loading: "Detecting",
					language_detector_empty: "Please paste some text to detect first.",
					language_detector_failed: "Could not detect the language from that text. Try a longer or more representative sample.",
					language_detector_detected: "Detected language",
					language_detector_apply_received: "Use for received-source language",
					language_detector_apply_sent: "Use for sent-input language"
				});
				Object.assign(texts, isChinese ? {
					language_detector_apply_sent_output: "填入发送消息目标语言",
					context_detect_message_language: "识别这条消息的语言",
					context_reply_in_detected_language: "以该语言回复",
					detect_message_empty: "这条消息没有可识别的文本内容。",
					detect_message_failed: "暂时无法识别这条消息的语言。",
					detect_message_success: "识别到",
					reply_language_applied: "已将当前频道的发送目标语言切换为",
					reply_language_hint: "保持当前频道翻译开启后，直接用你的语言回复即可。",
					translated_label: "译文"
				} : {
					language_detector_apply_sent_output: "Use for sent-target language",
					context_detect_message_language: "Detect this message language",
					context_reply_in_detected_language: "Reply in this language",
					detect_message_empty: "This message has no text content to detect.",
					detect_message_failed: "Could not detect the language of this message.",
					detect_message_success: "Detected",
					reply_language_applied: "Sent target language for this channel was switched to",
					reply_language_hint: "Keep translation enabled for this channel, then reply in your own language.",
					translated_label: "Translated"
				});
				Object.assign(texts, isChinese ? {
					wrapper_pairs_title: "自动保护包裹符规则",
					wrapper_pairs_hint: "按“左包裹符|右包裹符”的格式添加规则，例如 \"|\"、“|” 、`|`、【|】、「|」。被这些符号包起来的内容会自动跳过翻译，并在译文里高亮显示。",
					wrapper_pairs_placeholder: "例如 【|】 或 `|`"
				} : {
					wrapper_pairs_title: "Protected Wrapper Rules",
					wrapper_pairs_hint: "Add rules in the format left|right, for example \"|\", “|”, `|`, 【|】, or 「|」. Text wrapped by these symbols will be skipped during translation and highlighted in the translated result.",
					wrapper_pairs_placeholder: "For example 【|】 or `|`"
				});
				Object.assign(texts, isChinese ? {
					wrapper_pairs_title: "自动保护包裹符规则",
					wrapper_pairs_hint: "按“左包裹符|右包裹符”的格式添加规则，例如 \"|\"、“|” 、`|`、【|】、「|」。被这些符号包起来的内容会自动跳过翻译，并在译文里高亮显示。",
					wrapper_pairs_placeholder: "例如 【|】 或 `|`"
				} : {
					wrapper_pairs_title: "Protected Wrapper Rules",
					wrapper_pairs_hint: "Add rules in the format left|right, for example \"|\", “|”, `|`, 【|】, or 「|」. Text wrapped by these symbols will be skipped during translation and highlighted in the translated result.",
					wrapper_pairs_placeholder: "For example 【|】 or `|`"
				});
				Object.assign(texts, isChinese ? {
					received_auto_translate_title: "收到消息自动翻译",
					received_auto_translate_hint: "设置哪些收到的消息自动翻译。",
					received_auto_translate_preset_title: "自动翻译策略",
					received_auto_translate_preset_loose: "宽松",
					received_auto_translate_preset_balanced: "平衡",
					received_auto_translate_preset_strict: "严格",
					received_auto_translate_preset_custom: "自定义",
					received_source_filter_title: "收到消息允许自动翻译的源语言",
					received_source_filter_hint: "留空表示不按源语言限制；填入后，只保留这些源语言的自动翻译结果。",
					received_source_filter_add: "+ 添加收到消息源语言",
					skip_mixed_received_label: "跳过混合语言消息",
					skip_same_language_received_label: "跳过与目标语言相同的消息",
					treat_language_variants_label: "将地区/方言变体视为同一种语言",
					drop_similar_translations_label: "丢弃与原文高度相似的译文",
					minimum_auto_translate_length_title: "自动翻译最小文本长度",
					translation_similarity_threshold_title: "译文相似度过滤阈值",
					plugin_language_title: "插件界面语言",
					plugin_language_hint: "可跟随 Discord，也可单独固定插件界面语言。",
					translated_text_color_title: "译文模块颜色",
					translated_text_color_hint: "直接点击色板切换颜色。点击右侧 + 号后，可手动填写颜色代码并保存。",
					translated_text_color_save_button: "保存",
					translated_text_color_invalid: "颜色代码无效，请填写有效的 HEX 或 CSS 颜色。"
				} : {
					received_auto_translate_title: "Incoming Auto-Translate",
					received_auto_translate_hint: "Choose which incoming messages are auto-translated.",
					received_auto_translate_preset_title: "Auto-translate preset",
					received_auto_translate_preset_loose: "Loose",
					received_auto_translate_preset_balanced: "Balanced",
					received_auto_translate_preset_strict: "Strict",
					received_auto_translate_preset_custom: "Custom",
					received_source_filter_title: "Allowed incoming source languages",
					received_source_filter_hint: "Leave this empty to avoid source-language filtering. If filled, only those detected source languages keep their auto-translation result.",
					received_source_filter_add: "+ Add incoming source language",
					skip_mixed_received_label: "Skip mixed-language messages",
					skip_same_language_received_label: "Skip messages already in the target language",
					treat_language_variants_label: "Treat regional variants as the same language",
					drop_similar_translations_label: "Drop nearly identical translations",
					minimum_auto_translate_length_title: "Minimum text length for auto-translate",
					translation_similarity_threshold_title: "Translation similarity threshold",
					plugin_language_title: "Plugin UI Language",
					plugin_language_hint: "You can follow Discord or pin the plugin UI to its own language.",
					translated_text_color_title: "Translated text color",
					translated_text_color_hint: "Click a swatch to switch colors. Use the + button to enter and save a custom color code.",
					translated_text_color_save_button: "Save",
					translated_text_color_invalid: "Invalid color code. Please enter a valid HEX or CSS color."
				});
				Object.assign(texts, isChinese ? {
					received_auto_translate_title: "收到消息自动翻译策略",
					received_auto_translate_hint: "设置收到消息后的自动翻译规则。",
					received_auto_translate_preset_loose: "多翻一点",
					received_auto_translate_preset_balanced: "推荐",
					received_auto_translate_preset_strict: "少翻一点",
					received_auto_translate_preset_custom: "自定义",
					received_auto_translate_profile_loose_title: "多翻一点",
					received_auto_translate_profile_loose_desc: "更积极地自动翻译，适合多语频道，可能会多翻一些短句或混合内容。",
					received_auto_translate_profile_balanced_title: "推荐",
					received_auto_translate_profile_balanced_desc: "在准确率和覆盖率之间做平衡，适合大多数日常聊天频道。",
					received_auto_translate_profile_strict_title: "少翻一点",
					received_auto_translate_profile_strict_desc: "更谨慎，尽量避免误翻，适合已经有较多中文或双语内容的频道。",
					received_auto_translate_profile_custom_title: "自定义",
					received_auto_translate_profile_custom_desc: "你可以自己决定哪些消息跳过，哪些消息继续自动翻译。",
					received_auto_translate_advanced_title: "高级规则",
					received_auto_translate_advanced_locked: "当前正在使用预设模式。普通用户不需要改下面这些细项；如果你想手动调整，请切换到“自定义”。",
					skip_mixed_received_label: "跳过中英混合或多语言混合的消息",
					skip_same_language_received_label: "跳过本来就已经是目标语言的消息",
					treat_language_variants_label: "把地区变体当成同一种语言",
					drop_similar_translations_label: "如果译文和原文几乎一样，就不显示",
					minimum_auto_translate_length_title: "最短多少字才自动翻译",
					translation_similarity_threshold_title: "多像才算“几乎没变”"
				} : {
					received_auto_translate_title: "Incoming Auto-Translate Rules",
					received_auto_translate_hint: "Set the auto-translate rules for incoming messages.",
					received_auto_translate_preset_loose: "Translate More",
					received_auto_translate_preset_balanced: "Recommended",
					received_auto_translate_preset_strict: "Translate Less",
					received_auto_translate_preset_custom: "Custom",
					received_auto_translate_profile_loose_title: "Translate More",
					received_auto_translate_profile_loose_desc: "More aggressive auto-translation for multilingual channels. It may translate more short or mixed messages.",
					received_auto_translate_profile_balanced_title: "Recommended",
					received_auto_translate_profile_balanced_desc: "Balanced for most channels. Good default between coverage and accuracy.",
					received_auto_translate_profile_strict_title: "Translate Less",
					received_auto_translate_profile_strict_desc: "More conservative. Best when the channel already contains lots of bilingual or target-language content.",
					received_auto_translate_profile_custom_title: "Custom",
					received_auto_translate_profile_custom_desc: "Manually decide which incoming messages should be skipped or translated.",
					received_auto_translate_advanced_title: "Advanced Rules",
					received_auto_translate_advanced_locked: "A preset is active right now. Most users do not need these low-level switches. Switch to Custom if you want manual control.",
					drop_similar_translations_label: "Hide translations that are almost identical to the source",
					minimum_auto_translate_length_title: "Minimum text length before auto-translate",
					translation_similarity_threshold_title: "How similar counts as 'almost unchanged'"
				});
				if (isRussian) Object.assign(texts, {
					auth_keys_title: "Ключи доступа",
					custom_section_title: "Настройка",
					api_key_label: "API ключ:",
					api_endpoint_label: "API адрес:",
					model_id_label: "ID модели:",
					paid_version_label: "Платная версия",
					microsoft_region_label: "Регион:",
					section_service_title: "Провайдер перевода",
					section_service_hint: "Сначала выберите провайдера, затем заполните только нужные поля.",
					primary_engine_title: "Основной провайдер",
					backup_engine_title: "Резервный провайдер",
					backup_engine_select_title: "Резервный провайдер",
					backup_engine_hint: "Резервный провайдер используется только при ошибке основного.",
					backup_engine_none: "Без резервного провайдера",
					backup_engine_none_hint: "Резервный провайдер сейчас не включен.",
					google_default_hint: "Режим Google по умолчанию не требует отдельного API ключа.",
					engine_unknown_hint: "Для этого провайдера сейчас нет отдельной формы настроек.",
					engine_no_extra_fields: "Для этого провайдера нет дополнительных полей.",
					other_service_title: "Ключи других провайдеров",
					other_service_hint: "Эти поля оставлены для совместимости, если вы захотите переключиться позже.",
					section_language_title: "Языковые правила",
					section_language_hint: "Базовые языковые правила для отправки и получения сообщений.",
					sent_input_title: "Исходный язык отправляемых сообщений",
					sent_output_title: "Целевой язык отправляемых сообщений",
					received_input_title: "Исходный язык входящих сообщений",
					received_output_title: "Целевой язык входящих сообщений",
					source_filter_title: "Автоперевод исходящих только с этих языков",
					source_filter_hint: "Оставьте пустым, чтобы переводить любой определённый язык. Добавьте языки, чтобы переводить только их.",
					source_filter_add: "+ Добавить исходный язык",
					received_auto_translate_title: "Автоперевод входящих сообщений",
					received_auto_translate_hint: "Здесь задаются правила, какие входящие сообщения переводить автоматически.",
					received_auto_translate_preset_title: "Профиль автоперевода",
					received_auto_translate_preset_loose: "Свободный",
					received_auto_translate_preset_balanced: "Сбалансированный",
					received_auto_translate_preset_strict: "Строгий",
					received_auto_translate_preset_custom: "Пользовательский",
					received_source_filter_title: "Разрешённые исходные языки для входящих",
					received_source_filter_hint: "Если список пустой, ограничение по языкам не применяется. Если заполнен, автоперевод сохраняется только для этих языков.",
					received_source_filter_add: "+ Добавить язык входящих",
					skip_mixed_received_label: "Пропускать смешанные сообщения",
					skip_same_language_received_label: "Пропускать сообщения на том же языке, что и целевой",
					treat_language_variants_label: "Считать региональные варианты одним языком",
					drop_similar_translations_label: "Отбрасывать почти одинаковые переводы",
					minimum_auto_translate_length_title: "Минимальная длина текста для автоперевода",
					translation_similarity_threshold_title: "Порог схожести перевода",
					section_display_title: "Отображение и интерфейс",
					section_display_hint: "Управляет тем, как показываются переводы и элементы интерфейса.",
					section_advanced_title: "Дополнительные функции",
					prefix_section_title: "Правила префиксов",
					disable_prefix_title: "Префиксы пропуска перевода",
					disable_prefix_hint: "Сообщения с этими префиксами отправляются без перевода.",
					disable_prefix_placeholder: "Новый префикс исключения",
					translate_prefix_title: "Префиксы целевого языка",
					translate_prefix_hint: "Например, `$fr hello` переведёт `hello` на французский перед отправкой.",
					translate_prefix_placeholder: "Префикс (например, $fr)",
					add_prefix_button: "+ Добавить префикс",
					validate_button_label: "Проверить текущую конфигурацию",
					validate_hint: "Отправляет минимальный запрос, чтобы проверить ключ, адрес и модель.",
					validate_running: "Проверка",
					validate_success: "Проверка успешна",
					validate_failed: "Проверка не удалась",
					validate_saved_endpoint: "Адрес автоматически исправлен и сохранён",
					validate_missing_key: "Сначала введите API ключ.",
					validate_missing_model: "Сначала введите ID модели.",
					validate_missing_endpoint: "Сначала введите API адрес.",
					support_panel_validate_title: "Проверка подключения",
					support_panel_links_title: "Ссылки и помощь",
					model_detect_button: "Проверить модель",
					model_fetch_button: "Получить модели",
					model_fetch_loading: "Загрузка списка моделей…",
					model_catalog_title: "Полученные модели",
					model_catalog_loaded: "Загружено моделей: {count}. Выбор заполнит поле модели выше.",
					model_catalog_empty: "Список моделей пуст.",
					protected_terms_title: "Защищённые слова / фразы",
					protected_terms_hint: "Добавьте имена или фразы, которые нельзя переводить.",
					protected_terms_placeholder: "Добавить защищённый термин",
					channel_auto_translate_label: "Автоперевод этого канала",
					channel_auto_translate_on: "Автоперевод включён для этого канала",
					channel_auto_translate_off: "ЛКМ: открыть настройки, ПКМ: включить автоперевод канала",
					language_detector_title: "Помощник определения языка",
					language_detector_hint: "Вставьте пример текста из канала, чтобы определить язык и применить его к правилам выше.",
					language_detector_placeholder: "Вставьте текст для определения",
					language_detector_button: "Опред.",
					language_detector_button_loading: "Поиск",
					language_detector_empty: "Сначала вставьте текст для определения.",
					language_detector_failed: "Не удалось определить язык этого текста.",
					language_detector_detected: "Определённый язык",
					language_detector_apply_received: "Использовать для входящих",
					language_detector_apply_sent: "Использовать для исходного языка отправки",
					language_detector_apply_sent_output: "Использовать для целевого языка отправки",
					context_detect_message_language: "Определить язык сообщения",
					context_reply_in_detected_language: "Ответить на этом языке",
					detect_message_empty: "В этом сообщении нет текста для определения языка.",
					detect_message_failed: "Не удалось определить язык сообщения.",
					detect_message_success: "Определено",
					reply_language_applied: "Целевой язык отправки для канала переключён на",
					reply_language_hint: "Оставьте перевод в канале включённым и отвечайте на своём языке.",
					translated_label: "Перевод",
					wrapper_pairs_title: "Защищённые пары обрамления",
					wrapper_pairs_hint: "Добавляйте правила в формате левая|правая часть, например \"|\", `|`, 【|】 или 「|」.",
					wrapper_pairs_placeholder: "Например 【|】 или `|`",
					plugin_language_title: "Язык интерфейса плагина",
					plugin_language_hint: "Можно следовать языку Discord или зафиксировать язык интерфейса плагина отдельно.",
					translated_text_color_title: "Цвет переведённого текста",
					translated_text_color_hint: "Нажмите на цветовую плашку, чтобы выбрать цвет. Через кнопку + можно ввести и сохранить свой код цвета.",
					translated_text_color_save_button: "Сохранить",
					translated_text_color_invalid: "Некорректный код цвета. Укажите корректный HEX- или CSS-цвет."
				});
				Object.assign(texts, {
					primary_engine_section_title: texts.primary_engine_section_title || (isChinese ? "主服务商设置" : isRussian ? "Настройки основного сервиса" : "Primary Provider Settings"),
					section_message_language_title: texts.section_message_language_title || (isChinese ? "发送与接收语言" : isRussian ? "Языки отправки и получения" : "Sent and Received Languages"),
					section_sent_language_title: texts.section_sent_language_title || (isChinese ? "发送消息" : isRussian ? "Исходящие сообщения" : "Sent Messages"),
					section_received_language_title: texts.section_received_language_title || (isChinese ? "收到消息" : isRussian ? "Входящие сообщения" : "Received Messages"),
					section_display_message_title: texts.section_display_message_title || (isChinese ? "消息显示" : isRussian ? "Отображение сообщений" : "Message Display"),
					section_display_ui_title: texts.section_display_ui_title || (isChinese ? "界面与按钮" : isRussian ? "Интерфейс и кнопки" : "Interface and Buttons"),
					protection_section_title: texts.protection_section_title || (isChinese ? "保护规则" : isRussian ? "Правила защиты" : "Protection Rules"),
					received_auto_translate_scope_title: texts.received_auto_translate_scope_title || (isChinese ? "自动翻译范围" : isRussian ? "Диапазон автоперевода" : "Auto-translate range"),
					received_auto_translate_scope_hint: texts.received_auto_translate_scope_hint || (isChinese ? "只翻译新消息，或连当前已加载消息一起翻译。" : isRussian ? "Выберите: переводить только новые сообщения или также уже загруженные на экран." : "Translate only new messages, or include the messages already loaded on screen."),
					received_auto_translate_scope_new_only: texts.received_auto_translate_scope_new_only || (isChinese ? "只翻译新消息（推荐）" : isRussian ? "Только новые сообщения (рекомендуется)" : "Only new messages (Recommended)"),
					received_auto_translate_scope_loaded_messages: texts.received_auto_translate_scope_loaded_messages || (isChinese ? "翻译当前已加载消息" : isRussian ? "Переводить уже загруженные сообщения" : "Translate currently loaded messages"),
					received_auto_translate_loaded_window_title: texts.received_auto_translate_loaded_window_title || (isChinese ? "已加载消息的时间范围" : isRussian ? "Временной диапазон загруженных сообщений" : "Loaded message time range"),
					received_auto_translate_loaded_window_hint: texts.received_auto_translate_loaded_window_hint || (isChinese ? "只处理这个时间范围内的已加载消息。" : isRussian ? "Переводить только загруженные сообщения в этом диапазоне времени." : "Only translate loaded messages inside this time range."),
					received_auto_translate_loaded_window_15m: texts.received_auto_translate_loaded_window_15m || (isChinese ? "15分钟" : isRussian ? "15 мин" : "15 min"),
					received_auto_translate_loaded_window_1h: texts.received_auto_translate_loaded_window_1h || (isChinese ? "1小时" : isRussian ? "1 час" : "1 hour"),
					received_auto_translate_loaded_window_6h: texts.received_auto_translate_loaded_window_6h || (isChinese ? "6小时" : isRussian ? "6 часов" : "6 hours"),
					received_auto_translate_loaded_window_24h: texts.received_auto_translate_loaded_window_24h || (isChinese ? "24小时" : isRussian ? "24 часа" : "24 hours"),
					received_auto_translate_loaded_window_all: texts.received_auto_translate_loaded_window_all || (isChinese ? "全部已加载" : isRussian ? "Все загруженные" : "All loaded")
				});
				if (!texts.show_secret_label) texts.show_secret_label = isChinese ? "显示密钥" : isRussian ? "Показать ключ" : "Show secret";
				if (!texts.hide_secret_label) texts.hide_secret_label = isChinese ? "隐藏密钥" : isRussian ? "Скрыть ключ" : "Hide secret";
				return texts[key] || key;
			}

			getGeneralSettingLabel (key) {
				const isChinese = this.isChineseUiLanguage();
				const isRussian = this.isRussianUiLanguage();
				const labels = isChinese ? {
					addTranslateButton: "在输入框旁显示翻译按钮",
					addQuickTranslateButton: "在消息操作栏显示快捷翻译按钮",
					usePerChatTranslation: "每个频道单独记录翻译开关（建议开启）",
					sendOriginalMessage: "发送译文时同时附带原文",
					showOriginalMessage: "查看收到的译文时同时显示原文",
					useSpoilerInOriginal: "原文使用剧透样式显示"
				} : {
					addTranslateButton: "Show translate button near the input box",
					addQuickTranslateButton: "Show quick translate button in message actions",
					usePerChatTranslation: "Remember translate toggle separately for each channel (recommended)",
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
					highlightTranslatedMessages: "给译文消息添加更显眼的左侧色条与背景",
					showTranslationLabel: "在译文消息上方显示“译文”标签"
				} : {
					highlightTranslatedMessages: "Highlight translated messages with a left accent and background",
					showTranslationLabel: "Show a visible 'Translated' label above translated messages"
				});
				Object.assign(labels, isChinese ? {
					protectQuotedText: "自动保护并高亮包裹符内的内容"
				} : {
					protectQuotedText: "Automatically protect and highlight wrapped content"
				});
				Object.assign(labels, isChinese ? {
					showOriginalInReplyPreview: "别人引用这条消息时显示译文+原文"
				} : {
					showOriginalInReplyPreview: "Show translated text and original text in reply previews"
				});
				Object.assign(labels, isChinese ? {
					useSpoilerInSentOriginal: "发送附带原文时使用剧透/刮刮乐遮盖",
					useSpoilerInReceivedOriginal: "查看收到的原文时使用剧透/刮刮乐遮盖"
				} : {
					useSpoilerInSentOriginal: "Hide attached outgoing original text behind spoiler (scratch-off) blocks",
					useSpoilerInReceivedOriginal: "Show received original text as spoiler (scratch-off) blocks"
				});
				if (isRussian) Object.assign(labels, {
					addTranslateButton: "Показывать кнопку перевода возле поля ввода",
					addQuickTranslateButton: "Показывать быструю кнопку перевода в действиях сообщения",
					usePerChatTranslation: "Запоминать переключатель перевода отдельно для каждого канала",
					interfaceLanguage: "Язык интерфейса плагина",
					sendOriginalMessage: "Добавлять оригинал к переведённым исходящим сообщениям",
					showOriginalMessage: "Показывать оригинал рядом с переведёнными входящими сообщениями",
					showOriginalDirectly: "Показывать оригинал входящих сообщений напрямую",
					highlightTranslatedMessages: "Подсвечивать переведённые сообщения",
					showTranslationLabel: "Показывать метку перевода",
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
				if (engineKey == "oaicompat") return isChinese ? "自定义 API（兼容 OpenAI）" : "Custom API (OpenAI Compatible)";
				return translationEngines[engineKey] && translationEngines[engineKey].name || engineKey;
			}

			getChannelTranslationToggleLabel () {
				return this.getCustomText("channel_auto_translate_label");
			}

			getTranslateButtonTooltipText (channelId) {
				const enabled = this.isTranslationEnabled(channelId);
				if (!enabled) return this.getCustomText("channel_auto_translate_off");
				return `${this.getCustomText("channel_auto_translate_on")} | ${this.getTranslationTooltipText(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId), this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId))}`;
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

			getReceivedAutoTranslatePresetOptions () {
				return [
					{value: "loose", label: this.getCustomText("received_auto_translate_preset_loose")},
					{value: "balanced", label: this.getCustomText("received_auto_translate_preset_balanced")},
					{value: "strict", label: this.getCustomText("received_auto_translate_preset_strict")},
					{value: "custom", label: this.getCustomText("received_auto_translate_preset_custom")}
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

			getReceivedAutoTranslatePresetProfiles () {
				return {
					loose: {
						title: this.getCustomText("received_auto_translate_profile_loose_title"),
						description: this.getCustomText("received_auto_translate_profile_loose_desc"),
						values: {
							receivedAutoTranslateScope: "new_only",
							receivedAutoTranslateLoadedTimeWindow: "24h",
							skipMixedReceivedMessages: false,
							skipSameLanguageReceivedMessages: false,
							treatLanguageVariantsAsSame: true,
							dropSimilarTranslations: false,
							minimumAutoTranslateLength: 2,
							translationSimilarityThreshold: 0.98
						}
					},
					balanced: {
						title: this.getCustomText("received_auto_translate_profile_balanced_title"),
						description: this.getCustomText("received_auto_translate_profile_balanced_desc"),
						values: {
							receivedAutoTranslateScope: "new_only",
							receivedAutoTranslateLoadedTimeWindow: "1h",
							skipMixedReceivedMessages: true,
							skipSameLanguageReceivedMessages: true,
							treatLanguageVariantsAsSame: true,
							dropSimilarTranslations: true,
							minimumAutoTranslateLength: 6,
							translationSimilarityThreshold: 0.9
						}
					},
					strict: {
						title: this.getCustomText("received_auto_translate_profile_strict_title"),
						description: this.getCustomText("received_auto_translate_profile_strict_desc"),
						values: {
							receivedAutoTranslateScope: "new_only",
							receivedAutoTranslateLoadedTimeWindow: "15m",
							skipMixedReceivedMessages: true,
							skipSameLanguageReceivedMessages: true,
							treatLanguageVariantsAsSame: true,
							dropSimilarTranslations: true,
							minimumAutoTranslateLength: 12,
							translationSimilarityThreshold: 0.82
						}
					},
					custom: {
						title: this.getCustomText("received_auto_translate_profile_custom_title"),
						description: this.getCustomText("received_auto_translate_profile_custom_desc"),
						values: null
					}
				};
			}

			getReceivedAutoTranslatePresetProfile (preset = null) {
				const profiles = this.getReceivedAutoTranslatePresetProfiles();
				return profiles[preset || this.getReceivedAutoTranslatePreset()] || profiles.balanced;
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
				const translation = translatedMessages[message.id];
				if (translation && translation.originalContent) return translation.originalContent;
				const originalContentData = oldMessages[message.id] && oldMessages[message.id].originalContentData;
				if (originalContentData && originalContentData.content) return originalContentData.content;
				return message.content || "";
			}

			ensureChannelLanguageChoiceScope (channelId, place) {
				if (!channelId || !place) return null;
				if (!channelLanguages[channelId]) channelLanguages[channelId] = {};
				if (!channelLanguages[channelId][place]) {
					channelLanguages[channelId][place] = {};
					for (let typeKey in languageTypes) channelLanguages[channelId][place][languageTypes[typeKey]] = this.getLanguageChoice(languageTypes[typeKey], place, channelId);
				}
				return channelLanguages[channelId][place];
			}

			setReplyTargetLanguageForChannel (channelId, languageId) {
				if (!channelId || !languageId) return;
				const scope = this.ensureChannelLanguageChoiceScope(channelId, messageTypes.SENT);
				if (!scope) return;
				scope[languageTypes.OUTPUT] = languageId;
				BDFDB.DataUtils.save(channelLanguages, this, "channelLanguages");
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

			extractOriginalContentData (message) {
				const storedOriginalContentData = message && message.id && oldMessages[message.id] && oldMessages[message.id].originalContentData;
				if (storedOriginalContentData) return this.cloneOriginalContentData(storedOriginalContentData);
				const messageContent = message && message.content || "";
				const extractedParts = this.extractLegacyDisplayedTranslationParts(messageContent);
				return this.cloneOriginalContentData({
					content: extractedParts.originalContent || messageContent,
					embeds: ((message && message.embeds) || []).map(embed => ({
						description: embed.originalDescription || embed.rawDescription || "",
						title: embed.originalTitle || embed.rawTitle || "",
						footerText: embed.originalFooter ? embed.originalFooter.text : embed.footer ? embed.footer.text : "",
						fields: (embed.originalFields || embed.fields || []).map(field => ({
							name: field.rawName || field.name || "",
							value: field.rawValue || field.value || ""
						}))
					}))
				});
			}

			isTranslatorInjectedElement (element) {
				if (!element || typeof element != "object") return false;
				if (element.key && String(element.key).indexOf("translator-") == 0) return true;
				const className = element.props && element.props.className;
				if (typeof className == "string" && className.indexOf("translator-") > -1) return true;
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

			getProtectedWrapperRules () {
				let wrapperPairs = BDFDB.ArrayUtils.is(this.settings.exceptions.wrapperPairs) ? this.settings.exceptions.wrapperPairs : [];
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
				if (!this.settings.general.protectQuotedText || typeof text != "string" || !text) return null;
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
				if (!this.settings.general.protectQuotedText || typeof text != "string" || !text) return text;
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
				if (!this.settings.general.protectQuotedText || node == null) return node;
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

			buildReceivedDisplayContent (translatedContent, originalContent) {
				let content = (translatedContent || "").trim();
				if (originalContent && this.settings.general.showOriginalMessage && !this.settings.general.showOriginalDirectly) content += this.formatOriginalTextForMessage(originalContent, this.shouldUseSpoilerInReceivedOriginal());
				return content;
			}

			refreshTranslationDisplay (translation) {
				if (!translation) return null;
				translation = Object.assign(translation, this.normalizeStoredTranslationData(translation));
				translation.content = this.buildReceivedDisplayContent(translation.translatedContent || translation.content, translation.originalContent);
				return translation;
			}

			createReceivedTranslationSignature (message, channelId, originalContentData = null) {
				const sourceData = originalContentData || this.extractOriginalContentData(message);
				return JSON.stringify({
					protectionVersion: translationProtectionSignatureVersion,
					channelId: this.settings.general.usePerChatTranslation ? channelId : "global",
					input: this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId),
					output: this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId),
					protectQuotedText: !!this.settings.general.protectQuotedText,
					wrapperPairs: this.getProtectedWrapperRules().map(rule => rule.raw),
					protectedTerms: this.getProtectedTermsList().map(term => term.toLowerCase()),
					translator: this.settings.engines.translator,
					backup: this.settings.engines.backup,
					content: sourceData.content || "",
					embeds: sourceData.embeds || []
				});
			}

			getCachedReceivedTranslation (message, channelId, originalContentData = null) {
				if (!message || !translationCache[message.id]) return null;
				const signature = this.createReceivedTranslationSignature(message, channelId, originalContentData);
				return translationCache[message.id].signature == signature ? Object.assign({signature}, translationCache[message.id].translation) : null;
			}

			scheduleTranslationCacheSave () {
				if (translationCacheSaveTimer) clearTimeout(translationCacheSaveTimer);
				translationCacheSaveTimer = setTimeout(_ => {
					BDFDB.DataUtils.save(translationCache, this, "translationCache");
					translationCacheSaveTimer = null;
				}, 300);
			}

			persistTranslationCacheEntry (messageId, signature, translation) {
				translationCache[messageId] = {
					signature,
					cachedAt: Date.now(),
					translation: Object.assign({}, translation)
				};
				const cacheKeys = Object.keys(translationCache);
				if (cacheKeys.length > MAX_TRANSLATION_CACHE_ENTRIES) {
					cacheKeys
						.sort((keyA, keyB) => (translationCache[keyA].cachedAt || 0) - (translationCache[keyB].cachedAt || 0))
						.slice(0, cacheKeys.length - MAX_TRANSLATION_CACHE_ENTRIES)
						.forEach(key => delete translationCache[key]);
				}
				this.scheduleTranslationCacheSave();
			}

			clearCachedTranslation (messageId) {
				if (!messageId || !translationCache[messageId]) return;
				delete translationCache[messageId];
				this.scheduleTranslationCacheSave();
			}

			createReplyPreviewSignature (message, channelId, originalContent = null) {
				return JSON.stringify({
					protectionVersion: translationProtectionSignatureVersion,
					channelId: this.settings.general.usePerChatTranslation ? channelId : "global",
					input: this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId),
					output: this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId),
					protectQuotedText: !!this.settings.general.protectQuotedText,
					wrapperPairs: this.getProtectedWrapperRules().map(rule => rule.raw),
					protectedTerms: this.getProtectedTermsList().map(term => term.toLowerCase()),
					translator: this.settings.engines.translator,
					backup: this.settings.engines.backup,
					content: originalContent != null ? originalContent : message && message.content || ""
				});
			}

			getReplyPreviewTranslation (message, channelId) {
				if (!message || !message.id) return null;
				const storedTranslation = replyPreviewTranslations[message.id];
				if (!storedTranslation) return null;
				const signature = this.createReplyPreviewSignature(message, channelId);
				if (storedTranslation.signature != signature) {
					delete replyPreviewTranslations[message.id];
					return null;
				}
				return storedTranslation;
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
					translatedContent,
					originalContent,
					input: translation.input,
					output: translation.output
				};
			}

			getReplyPreviewDisplayContent (translation) {
				if (!translation) return "";
				translation = this.normalizeStoredTranslationData(translation);
				const translatedContent = (translation.translatedContent || translation.content || "").trim();
				if (!this.settings.general.showOriginalInReplyPreview) return translatedContent || (translation.originalContent || "");
				const originalContent = (translation.originalContent || "").trim();
				return translatedContent && originalContent ? `${translatedContent}\n${originalContent}` : (translatedContent || originalContent);
			}

			stripReplyPreviewOriginalSuffix (content) {
				content = (content || "").trim();
				if (!content) return "";
				if (/\n\|\|[\s\S]*\|\|$/.test(content)) return content.replace(/\n\|\|[\s\S]*\|\|$/, "").trim();
				const lines = content.split("\n");
				let boundaryIndex = lines.length;
				while (boundaryIndex > 0 && /^\s*>\s?/.test(lines[boundaryIndex - 1])) boundaryIndex--;
				if (boundaryIndex < lines.length) return lines.slice(0, boundaryIndex).join("\n").trim();
				return content;
			}

			getReplyPreviewFallbackContent (message) {
				if (!message) return "";
				if (this.settings.general.showOriginalInReplyPreview) return (message.content || "").trim();
				return this.stripReplyPreviewOriginalSuffix(message.content || "");
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

			queueReplyPreviewTranslation (message, channelId) {
				if (!message || !message.id || !channelId || queuedReplyPreviewTranslations[message.id]) return;
				if (!this.isTranslationEnabled(channelId) || this.isOwnMessage(message)) return;
				const originalContent = (message.content || "").trim();
				if (!originalContent) return;
				const signature = this.createReplyPreviewSignature(message, channelId, originalContent);
				const existingTranslation = replyPreviewTranslations[message.id];
				if (existingTranslation && existingTranslation.signature == signature) return;
				const cachedTranslation = this.getCachedReceivedTranslation(message, channelId);
				if (cachedTranslation) {
					const previewTranslation = this.createReplyPreviewTranslationData(message, channelId, cachedTranslation);
					if (previewTranslation) replyPreviewTranslations[message.id] = previewTranslation;
					return;
				}
				queuedReplyPreviewTranslations[message.id] = channelId;
				this.translateText(originalContent, messageTypes.RECEIVED, (translation, input, output) => {
					delete queuedReplyPreviewTranslations[message.id];
					if (!this.isTranslationEnabled(channelId)) return;
					if (translation) {
						replyPreviewTranslations[message.id] = {
							signature,
							channelId,
							translatedContent: (translation || "").trim(),
							originalContent,
							input,
							output
						};
						this.scheduleTranslationRerender({batched: true});
					}
				}, null, {
					showToast: false,
					showFailureToast: false,
					trackBusy: false,
					channelId
				});
			}

			resetAutoTranslationTracking (channelId = null) {
				if (channelId) delete autoTranslationChannelStates[channelId];
				else autoTranslationChannelStates = {};
				if (!channelId || lastAutoTranslationChannelId == channelId) lastAutoTranslationChannelId = null;
			}

			getAutoTranslationChannelState (channelId) {
				if (!channelId) return null;
				if (!autoTranslationChannelStates[channelId]) autoTranslationChannelStates[channelId] = {
					initialized: false,
					boundaryMessageId: null
				};
				return autoTranslationChannelStates[channelId];
			}

			prepareAutoTranslationChannelSession (channelId) {
				if (!channelId || lastAutoTranslationChannelId == channelId) return;
				lastAutoTranslationChannelId = channelId;
				const channelState = this.getAutoTranslationChannelState(channelId);
				channelState.initialized = false;
				channelState.boundaryMessageId = null;
				if (this.getReceivedAutoTranslateScope() == "new_only") this.clearDisplayedAutoTranslations(channelId);
			}

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

			captureMessageScrollerState () {
				const messagesScroller = document.querySelector(BDFDB.dotCN.messagesscroller);
				if (!messagesScroller) return null;
				const maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
				const distanceToBottom = Math.max(0, maxScrollTop - messagesScroller.scrollTop);
				return {
					scrollTop: messagesScroller.scrollTop,
					keepBottom: distanceToBottom <= AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD
				};
			}

			restoreMessageScrollerState (scrollerState) {
				if (!scrollerState) return;
				requestAnimationFrame(() => requestAnimationFrame(() => {
					const messagesScroller = document.querySelector(BDFDB.dotCN.messagesscroller);
					if (!messagesScroller) return;
					if (scrollerState.keepBottom) return messagesScroller.scrollTo({top: messagesScroller.scrollHeight});
					const maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
					messagesScroller.scrollTo({top: Math.max(0, Math.min(scrollerState.scrollTop, maxScrollTop))});
				}));
			}

			rerenderMessagesWithScrollPreserved () {
				const scrollerState = this.captureMessageScrollerState();
				BDFDB.MessageUtils.rerenderAll(true);
				this.restoreMessageScrollerState(scrollerState);
			}

			scheduleTranslationRerender (options = {}) {
				const config = typeof options == "boolean" ? {batched: options} : Object.assign({batched: false}, options);
				if (!config.batched) {
					if (translationRerenderTimer) clearTimeout(translationRerenderTimer);
					translationRerenderTimer = null;
					this.rerenderMessagesWithScrollPreserved();
					return;
				}
				if (translationRerenderTimer) return;
				const rerenderDelay = this.isViewingMessageHistory() ? AUTO_TRANSLATION_HISTORY_RERENDER_DELAY : AUTO_TRANSLATION_RERENDER_DELAY;
				translationRerenderTimer = setTimeout(_ => {
					translationRerenderTimer = null;
					this.rerenderMessagesWithScrollPreserved();
				}, rerenderDelay);
			}

			getDisplayedTranslationChannelId (messageId) {
				if (!messageId) return null;
				const translation = translatedMessages[messageId];
				if (translation && translation.channelId) return translation.channelId;
				return oldMessages[messageId] && oldMessages[messageId].channel_id || null;
			}

			clearAutoTranslationQueue (channelId = null) {
				if (!channelId) {
					autoTranslationQueue = [];
					queuedAutoTranslations = {};
					queuedReplyPreviewTranslations = {};
					if (autoTranslationQueueRetryTimer) clearTimeout(autoTranslationQueueRetryTimer);
					autoTranslationQueueRetryTimer = null;
					return;
				}
				autoTranslationQueue = autoTranslationQueue.filter(queueItem => {
					const shouldRemove = queueItem && queueItem.channel && queueItem.channel.id == channelId;
					if (shouldRemove && queueItem.message && queueItem.message.id) delete queuedAutoTranslations[queueItem.message.id];
					return !shouldRemove;
				});
				for (const messageId of Object.keys(queuedReplyPreviewTranslations)) if (queuedReplyPreviewTranslations[messageId] == channelId) delete queuedReplyPreviewTranslations[messageId];
				if (!autoTranslationQueue.length && autoTranslationQueueRetryTimer) {
					clearTimeout(autoTranslationQueueRetryTimer);
					autoTranslationQueueRetryTimer = null;
				}
			}

			clearDisplayedTranslations (channelId = null) {
				for (const messageId of Object.keys(translatedMessages)) {
					if (channelId && this.getDisplayedTranslationChannelId(messageId) != channelId) continue;
					delete translatedMessages[messageId];
					delete suppressedAutoTranslations[messageId];
				}
				for (const messageId of Object.keys(replyPreviewTranslations)) {
					if (channelId && replyPreviewTranslations[messageId].channelId != channelId) continue;
					delete replyPreviewTranslations[messageId];
					delete queuedReplyPreviewTranslations[messageId];
				}
			}

			clearDisplayedAutoTranslations (channelId = null) {
				for (const messageId of Object.keys(translatedMessages)) {
					const translation = translatedMessages[messageId];
					if (!translation || !translation.auto) continue;
					if (channelId && this.getDisplayedTranslationChannelId(messageId) != channelId) continue;
					delete translatedMessages[messageId];
					delete suppressedAutoTranslations[messageId];
				}
			}

			applyStoredTranslationToMessage (message, translation, originalContentData = null) {
				if (!message || !translation) return null;
				const storedTranslation = this.refreshTranslationDisplay(Object.assign({
					channelId: translation.channelId || message.channel_id || null,
					auto: !!translation.auto
				}, translation));
				delete suppressedAutoTranslations[message.id];
				oldMessages[message.id] = new BDFDB.DiscordObjects.Message(message);
				oldMessages[message.id].originalContentData = originalContentData || this.extractOriginalContentData(message);
				translatedMessages[message.id] = storedTranslation;
				return storedTranslation;
			}

			getReceivedAutoTranslatePreset () {
				return this.settings.filters && this.settings.filters.receivedAutoTranslatePreset || "balanced";
			}

			getReceivedAutoTranslateScope () {
				const scope = this.settings.filters && this.settings.filters.receivedAutoTranslateScope;
				return scope == "loaded_messages" ? "loaded_messages" : "new_only";
			}

			getReceivedAutoTranslateLoadedTimeWindow () {
				const value = this.settings.filters && this.settings.filters.receivedAutoTranslateLoadedTimeWindow;
				return ["15m", "1h", "6h", "24h", "all"].includes(value) ? value : "1h";
			}

			getReceivedAutoTranslateLoadedTimeWindowMs () {
				switch (this.getReceivedAutoTranslateLoadedTimeWindow()) {
					case "15m": return 15 * 60 * 1000;
					case "1h": return 60 * 60 * 1000;
					case "6h": return 6 * 60 * 60 * 1000;
					case "24h": return 24 * 60 * 60 * 1000;
					default: return 0;
				}
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

			shouldDeferInitialAutoTranslate (channelId) {
				if (!channelId || this.getReceivedAutoTranslateScope() == "loaded_messages") return false;
				const channelState = this.getAutoTranslationChannelState(channelId);
				return !!(channelState && !channelState.initialized);
			}

			isViewingMessageHistory () {
				const scrollerState = this.captureMessageScrollerState();
				return !!(scrollerState && !scrollerState.keepBottom);
			}

			scheduleAutoTranslationQueueRetry () {
				if (autoTranslationQueueRetryTimer) return;
				autoTranslationQueueRetryTimer = setTimeout(_ => {
					autoTranslationQueueRetryTimer = null;
					this.processAutoTranslationQueue();
				}, AUTO_TRANSLATION_QUEUE_RETRY_DELAY);
			}

			getReceivedAutoTranslateSourceLanguages () {
				const sourceLanguages = this.settings.filters && BDFDB.ArrayUtils.is(this.settings.filters.receivedAutoTranslateSourceLanguages) ? this.settings.filters.receivedAutoTranslateSourceLanguages : [];
				return [...new Set(sourceLanguages.filter(languageId => languages[languageId] && !languages[languageId].auto && !languages[languageId].special))];
			}

			getMinimumAutoTranslateLength () {
				const value = this.settings.filters && this.settings.filters.minimumAutoTranslateLength;
				return Math.max(1, Math.min(80, parseInt(value, 10) || 6));
			}

			getAutoTranslateMinimumLengthForAnalysis (analysis = null) {
				const minimumLength = this.getMinimumAutoTranslateLength();
				if (!analysis || !analysis.totalLetters) return minimumLength;
				if (["han", "kana", "hangul"].includes(analysis.dominantFamily)) return Math.min(minimumLength, 2);
				return minimumLength;
			}

			getTranslationSimilarityThreshold () {
				const value = this.settings.filters && this.settings.filters.translationSimilarityThreshold;
				return Math.max(0.5, Math.min(0.99, parseFloat(value) || 0.9));
			}

			shouldTreatLanguageVariantsAsSame () {
				return !(this.settings.filters && this.settings.filters.treatLanguageVariantsAsSame === false);
			}

			shouldSkipMixedReceivedMessages () {
				const preset = this.getReceivedAutoTranslatePreset();
				return preset != "loose" && !!(this.settings.filters && this.settings.filters.skipMixedReceivedMessages !== false);
			}

			shouldSkipSameLanguageReceivedMessages () {
				const preset = this.getReceivedAutoTranslatePreset();
				return preset != "loose" && !!(this.settings.filters && this.settings.filters.skipSameLanguageReceivedMessages !== false);
			}

			shouldDropSimilarTranslations () {
				const preset = this.getReceivedAutoTranslatePreset();
				return preset != "loose" && !!(this.settings.filters && this.settings.filters.dropSimilarTranslations !== false);
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
					.replace(/\b[a-z]{1,3}\d*\b/gi, " ")
					.replace(/\s+/g, " ")
					.trim();
			}

			analyzeTextForAutoTranslate (text, targetLanguageId) {
				const cleanedText = this.sanitizeTextForAutoTranslateAnalysis(text);
				const counts = this.countScriptFamilies(cleanedText);
				const scriptEntries = Object.entries(counts).filter(([, count]) => count > 0).sort((entryA, entryB) => entryB[1] - entryA[1]);
				const totalLetters = scriptEntries.reduce((sum, [, count]) => sum + count, 0);
				const targetFamilies = this.getLanguageScriptFamilies(targetLanguageId);
				const dominantEntry = scriptEntries[0] || ["", 0];
				const secondaryEntry = scriptEntries[1] || ["", 0];
				const dominantShare = totalLetters ? dominantEntry[1] / totalLetters : 0;
				const secondaryShare = totalLetters ? secondaryEntry[1] / totalLetters : 0;
				const isMixed = dominantEntry[1] >= 2 && secondaryEntry[1] >= 2 && dominantShare >= 0.2 && secondaryShare >= 0.2;
				const strongTargetScriptMatch = targetFamilies[0] != "latin" && dominantEntry[1] >= 3 && dominantShare >= 0.65 && targetFamilies.includes(dominantEntry[0]) && !isMixed;
				return {
					cleanedText,
					totalLetters,
					dominantFamily: dominantEntry[0] || null,
					isMixed,
					strongTargetScriptMatch
				};
			}

			normalizeComparisonText (text) {
				text = (text || "").toLowerCase();
				if (typeof text.normalize == "function") text = text.normalize("NFKC");
				return text
					.replace(/https?:\/\/\S+/gi, "")
					.replace(/[`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?，。！？；：“”‘’（）【】《》、…·]/g, "")
					.replace(/\s+/g, "");
			}

			getTextSimilarityScore (textA, textB) {
				const normalizedA = this.normalizeComparisonText(textA);
				const normalizedB = this.normalizeComparisonText(textB);
				if (!normalizedA || !normalizedB) return 0;
				if (normalizedA == normalizedB) return 1;
				if (normalizedA.length < 2 || normalizedB.length < 2) return normalizedA == normalizedB ? 1 : 0;
				const createBigrams = value => {
					const bigrams = new Map();
					for (let index = 0; index < value.length - 1; index++) {
						const bigram = value.slice(index, index + 2);
						bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
					}
					return bigrams;
				};
				const bigramsA = createBigrams(normalizedA);
				const bigramsB = createBigrams(normalizedB);
				let overlap = 0;
				for (const [bigram, count] of bigramsA.entries()) if (bigramsB.has(bigram)) overlap += Math.min(count, bigramsB.get(bigram));
				return (2 * overlap) / (Math.max(1, normalizedA.length - 1) + Math.max(1, normalizedB.length - 1));
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

			shouldKeepAutoTranslatedResult (translation, channelId) {
				if (!translation || !translation.translatedContent) return false;
				const detectedLanguageId = translation.input && translation.input.id;
				const targetLanguageId = translation.output && translation.output.id || this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId);
				if (this.shouldSkipSameLanguageReceivedMessages() && detectedLanguageId && this.isSameLanguageOrVariant(detectedLanguageId, targetLanguageId)) return false;
				const sourceLanguages = this.getReceivedAutoTranslateSourceLanguages();
				if (sourceLanguages.length && detectedLanguageId && !this.matchesConfiguredSourceLanguage(detectedLanguageId, sourceLanguages)) return false;
				if (this.shouldDropSimilarTranslations() && this.getTextSimilarityScore(translation.originalContent, translation.translatedContent) >= this.getTranslationSimilarityThreshold()) return false;
				return true;
			}

			shouldAutoTranslateReceivedMessage (message, channel, originalContentData = null, ignoreQueued = false) {
				if (!channel || !channel.id || !message || !message.id) return false;
				if (!this.isTranslationEnabled(channel.id) || this.isOwnMessage(message)) return false;
				if (suppressedAutoTranslations[message.id]) return false;
				if (translatedMessages[message.id] || !ignoreQueued && queuedAutoTranslations[message.id]) return false;
				const sourceData = originalContentData || this.extractOriginalContentData(message);
				if (!this.hasTranslatableMessageContent(sourceData)) return false;
				const analysis = this.analyzeTextForAutoTranslate(this.buildTranslationRequestText(sourceData), this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channel.id));
				if (analysis.totalLetters < this.getAutoTranslateMinimumLengthForAnalysis(analysis)) return false;
				if (this.shouldSkipMixedReceivedMessages() && analysis.isMixed) return false;
				if (this.shouldSkipSameLanguageReceivedMessages() && analysis.strongTargetScriptMatch) return false;
				return true;
			}

			queueAutoTranslateMessage (message, channel, originalContentData = null, queueOptions = {}) {
				if (!this.shouldAutoTranslateReceivedMessage(message, channel, originalContentData)) return;
				if (queueOptions.historicalLoad && !this.isMessageWithinLoadedTimeWindow(message)) return;
				queuedAutoTranslations[message.id] = true;
				const queueItem = {
					message,
					channel,
					originalContentData: originalContentData || this.extractOriginalContentData(message),
					historicalLoad: !!queueOptions.historicalLoad,
					deferWhileReading: !!queueOptions.deferWhileReading
				};
				if (queueItem.historicalLoad) autoTranslationQueue.push(queueItem);
				else autoTranslationQueue.unshift(queueItem);
				this.processAutoTranslationQueue();
			}

			processAutoTranslationQueue () {
				if (isBackgroundTranslating || isTranslating || !autoTranslationQueue.length) return;
				const prioritizedIndex = autoTranslationQueue.findIndex(queueItem => queueItem && !queueItem.deferWhileReading);
				if (prioritizedIndex > 0) autoTranslationQueue.unshift(autoTranslationQueue.splice(prioritizedIndex, 1)[0]);
				const nextItem = autoTranslationQueue.shift();
				if (!nextItem || !nextItem.message) return this.processAutoTranslationQueue();
				if (nextItem.historicalLoad && !this.isMessageWithinLoadedTimeWindow(nextItem.message)) {
					delete queuedAutoTranslations[nextItem.message.id];
					return this.processAutoTranslationQueue();
				}
				if (nextItem.deferWhileReading && this.isViewingMessageHistory()) {
					autoTranslationQueue.push(nextItem);
					this.scheduleAutoTranslationQueueRetry();
					return;
				}
				if (!this.shouldAutoTranslateReceivedMessage(nextItem.message, nextItem.channel, nextItem.originalContentData, true)) {
					delete queuedAutoTranslations[nextItem.message.id];
					return this.processAutoTranslationQueue();
				}
				isBackgroundTranslating = true;
				this.translateMessage(nextItem.message, nextItem.channel, {
					auto: true,
					silent: true,
					trackBusy: false,
					originalContentData: nextItem.originalContentData
				}).finally(_ => {
					delete queuedAutoTranslations[nextItem.message.id];
					isBackgroundTranslating = false;
					this.processAutoTranslationQueue();
				});
			}
		
			forceUpdateAll () {
				favorites = BDFDB.DataUtils.load(this, "favorites");
				favorites = !BDFDB.ArrayUtils.is(favorites) ? [] : favorites;
				
				authKeys = BDFDB.DataUtils.load(this, "authKeys");
				channelLanguages = BDFDB.DataUtils.load(this, "channelLanguages");
				guildLanguages = BDFDB.DataUtils.load(this, "guildLanguages");
				translationCache = BDFDB.DataUtils.load(this, "translationCache");
				translationCache = translationCache && typeof translationCache == "object" && !Array.isArray(translationCache) ? translationCache : {};
				
				translationEnabledStates = BDFDB.DataUtils.load(this, "translationEnabledStates");
				translationEnabledStates = BDFDB.ArrayUtils.is(translationEnabledStates) ? translationEnabledStates : [];
				autoTranslationQueue = [];
				queuedAutoTranslations = {};
				suppressedAutoTranslations = {};
				isBackgroundTranslating = false;
				autoTranslationChannelStates = {};
				replyPreviewTranslations = {};
				queuedReplyPreviewTranslations = {};
				lastAutoTranslationChannelId = null;
				if (translationRerenderTimer) clearTimeout(translationRerenderTimer);
				translationRerenderTimer = null;
				if (autoTranslationQueueRetryTimer) clearTimeout(autoTranslationQueueRetryTimer);
				autoTranslationQueueRetryTimer = null;
				
				this.setLanguages();
				BDFDB.PatchUtils.forceAllUpdates(this);
				BDFDB.MessageUtils.rerenderAll();
			}

			onMessageContextMenu (e) {
				if (e.instance.props.message && e.instance.props.channel) {
					let translated = !!translatedMessages[e.instance.props.message.id];
					let hint = BDFDB.BDUtils.isPluginEnabled("MessageUtilities") ? BDFDB.BDUtils.getPlugin("MessageUtilities").getActiveShortcutString("__Translate_Message") : null;
					let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["copy-text", "pin", "unpin"]});
					if (index == -1) [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, {id: ["edit", "add-reaction", "add-reaction-1", "quote"]});
					children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
						label: translated ? this.labels.context_messageuntranslateoption : this.labels.context_messagetranslateoption,
						id: BDFDB.ContextMenuUtils.createItemId(this.name, translated ? "untranslate-message" : "translate-message"),
						icon: hint && (_ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuHint, {
							hint: hint
						})),
						icon: _ => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
							icon: translated ? translateIconUntranslate : translateIcon
						}),
						disabled: !translated && isTranslating,
						action: _ => this.translateMessage(e.instance.props.message, e.instance.props.channel)
					}));
					this.injectMessageLanguageActions(children, index > -1 ? index + 1 : 0, e.instance.props.message, e.instance.props.channel);
					this.injectSearchItem(e, false);
				}
			}
			
			onTextAreaContextMenu (e) {
				this.injectSearchItem(e, true);
			}
			
			injectSearchItem (e, ownMessage) {
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
							disabled: isTranslating,
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
										});
									}
								}
							}
						})
					}));
				}
			}
			
			processMessageButtons (e) {
				if (!this.settings.general.addQuickTranslateButton || !e.instance.props.message || !e.instance.props.channel) return;
				let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {props: [["className", BDFDB.disCN.messagebuttons]]});
				if (index == -1) return;
				let translated = !!translatedMessages[e.instance.props.message.id];
				children.unshift(BDFDB.ReactUtils.createElement(class extends BdApi.React.Component {
					render() {
						return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
							key: translated ? "untranslate-message" : "translate-message",
							text: _ => translated ? _this.labels.context_messageuntranslateoption : _this.labels.context_messagetranslateoption,
							tooltipConfig: {className: BDFDB.disCN.messagetoolbartooltip},
							children: BDFDB.ReactUtils.createElement("div", {
								className: BDFDB.disCNS.messagetoolbarhoverbutton + BDFDB.disCN.messagetoolbarbutton,
								onClick: _ => {
									if (!isTranslating) _this.translateMessage(e.instance.props.message, e.instance.props.channel).then(_ => {
										translated = !!translatedMessages[e.instance.props.message.id];
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
			
			processChannelTextAreaContainer (e) {
				if (e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.NORMAL && e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.SIDEBAR) return;
				BDFDB.PatchUtils.patch(this, e.instance.props, "onSubmit", {instead: e2 => {
					if (e2.methodArguments[0].value) {
						const text = e2.methodArguments[0].value;
						
						// Check for translation prefixes
						const prefixMap = {};
						const prefixData = this.settings.prefixes && this.settings.prefixes.translationPrefixData || [];
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
							
							// Translate with the specific target language
							this.translateText(cleanText, messageTypes.SENT, (translation, input, output) => {
								// Override the output language with the one from the prefix
								output = {id: targetLanguage, name: languages[targetLanguage] ? languages[targetLanguage].name : targetLanguage};
								
								translation = !translation ? cleanText : (this.settings.general.sendOriginalMessage ? (translation + this.formatOriginalTextForMessage(cleanText)) : translation);
								e2.originalMethod(Object.assign({}, e2.methodArguments[0], {value: translation}));
							}, targetLanguage);
							
							return Promise.resolve({
								shouldClear: true,
								shouldRefocus: true
							});
						}
						else if (this.isTranslationEnabled(e.instance.props.channel.id)) {
							e2.stopOriginalMethodCall();
							const originalValue = e2.methodArguments[0].value;
							this.shouldAutoTranslateSentMessage(originalValue, e.instance.props.channel.id, shouldTranslate => {
								if (!shouldTranslate) return e2.originalMethod(Object.assign({}, e2.methodArguments[0], {value: originalValue}));
								this.translateText(originalValue, messageTypes.SENT, (translation, input, output) => {
									translation = !translation ? originalValue : (this.settings.general.sendOriginalMessage ? (translation + this.formatOriginalTextForMessage(originalValue)) : translation);
									e2.originalMethod(Object.assign({}, e2.methodArguments[0], {value: translation}));
								});
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

			processChannelTextAreaEditor (e) {
				if (this.isTranslationEnabled(e.instance.props.channel.id) && isTranslating) e.instance.props.disabled = true;
			}
			
			processChannelTextAreaButtons (e) {
				if (!this.settings.general.addTranslateButton || e.instance.props.disabled || e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.NORMAL && e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.SIDEBAR) return;
				if (e.returnvalue) e.returnvalue.props.children.unshift(BDFDB.ReactUtils.createElement(TranslateButtonComponent, {
					guildId: e.instance.props.channel.guild_id ? e.instance.props.channel.guild_id : "@me",
					channelId: e.instance.props.channel.id
				}));
			}

			processMessages (e) {
				e.instance.props.channelStream = [].concat(e.instance.props.channelStream);
				const channel = e.instance.props.channel;
				const channelId = channel && channel.id;
				this.prepareAutoTranslationChannelSession(channelId);
				const channelState = this.getAutoTranslationChannelState(channelId);
				const shouldInitializeAutoTranslation = !!(channelId && this.isTranslationEnabled(channelId) && channelState && !channelState.initialized);
				const historicalLoadedPass = shouldInitializeAutoTranslation && this.getReceivedAutoTranslateScope() == "loaded_messages";
				const skipInitialLoadedMessages = shouldInitializeAutoTranslation && this.shouldDeferInitialAutoTranslate(channelId);
				const autoTranslateBoundaryId = channelState ? channelState.boundaryMessageId : null;
				let highestMessageId = autoTranslateBoundaryId;
				for (let i in e.instance.props.channelStream) {
					let message = e.instance.props.channelStream[i].content;
					if (message) {
						if (BDFDB.ArrayUtils.is(message.attachments)) {
							highestMessageId = this.getNewestMessageId(highestMessageId, message.id);
							this.checkMessage(e.instance.props.channelStream[i], message, channel, {
								skipAutoQueue: skipInitialLoadedMessages,
								autoTranslateBoundaryId,
								historicalLoad: historicalLoadedPass
							});
						}
						else if (BDFDB.ArrayUtils.is(message)) for (let j in message) {
							let childMessage = message[j].content;
							if (childMessage && BDFDB.ArrayUtils.is(childMessage.attachments)) {
								highestMessageId = this.getNewestMessageId(highestMessageId, childMessage.id);
								this.checkMessage(message[j], childMessage, channel, {
									skipAutoQueue: skipInitialLoadedMessages,
									autoTranslateBoundaryId,
									historicalLoad: historicalLoadedPass
								});
							}
						}
					}
				}
				if (channelState) {
					channelState.boundaryMessageId = this.getNewestMessageId(channelState.boundaryMessageId, highestMessageId);
					if (shouldInitializeAutoTranslation) channelState.initialized = true;
				}
			}
			
			checkMessage (stream, message, channel, options = {}) {
				if (!message || !stream || !stream.content) return;
				const channelId = channel && channel.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
				const originalContentData = this.extractOriginalContentData(message);
				const expectedSignature = this.createReceivedTranslationSignature(message, channelId, originalContentData);
				const skipAutoQueue = !!options.skipAutoQueue;
				const channelState = this.getAutoTranslationChannelState(channelId);
				const autoTranslateBoundaryId = options.autoTranslateBoundaryId != null ? options.autoTranslateBoundaryId : channelState && channelState.boundaryMessageId;
				const isNewerThanBoundary = this.isMessageIdNewer(message.id, autoTranslateBoundaryId);
				let translation = translatedMessages[message.id];
				if (translation && translation.auto && !this.isTranslationEnabled(channelId)) {
					delete translatedMessages[message.id];
					delete suppressedAutoTranslations[message.id];
					translation = null;
				}
				let messageChanged = false;
				if (translation && translation.signature && translation.signature != expectedSignature) {
					delete translatedMessages[message.id];
					delete suppressedAutoTranslations[message.id];
					translation = null;
					messageChanged = true;
				}
				if (!translation && this.isTranslationEnabled(channelId) && !skipAutoQueue && (messageChanged || isNewerThanBoundary)) {
					const cachedTranslation = this.getCachedReceivedTranslation(message, channelId, originalContentData);
					if (cachedTranslation) translation = this.applyStoredTranslationToMessage(message, Object.assign({channelId, auto: true}, cachedTranslation), originalContentData);
				}
				if (translation) {
					this.refreshTranslationDisplay(translation);
					stream.content.content = translation.content;
				}
				else if (oldMessages[message.id]) {
					// Restore the original stream content before dropping the snapshot.
					stream.content.content = oldMessages[message.id].content;
					delete oldMessages[message.id];
					messageChanged = true;
				}
				if (!translation && !skipAutoQueue && this.isTranslationEnabled(channelId)) {
					if (channelState) channelState.boundaryMessageId = this.getNewestMessageId(channelState.boundaryMessageId, message.id);
					if (messageChanged || isNewerThanBoundary) this.queueAutoTranslateMessage(message, channel || {id: channelId}, originalContentData, {
						historicalLoad: !!options.historicalLoad,
						deferWhileReading: !!options.historicalLoad
					});
				}
			}

			processMessageReply (e) {
				if (!e.instance.props.referencedMessage || !e.instance.props.referencedMessage.message) return;
				const referencedMessage = e.instance.props.referencedMessage.message;
				const channelId = e.instance.props.baseMessage && e.instance.props.baseMessage.channel_id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
				const translationEnabled = this.isTranslationEnabled(channelId);
				const deferInitialReplyPreviewTranslate = translationEnabled && this.shouldDeferInitialAutoTranslate(channelId);
				let translation = translatedMessages[referencedMessage.id];
				let fallbackContent = translationEnabled ? this.getReplyPreviewFallbackContent(referencedMessage) : (referencedMessage.content || "").trim();
				if (!translationEnabled) {
					const previewTranslation = replyPreviewTranslations[referencedMessage.id];
					if (previewTranslation && previewTranslation.originalContent != null) fallbackContent = (previewTranslation.originalContent || "").trim();
					delete replyPreviewTranslations[referencedMessage.id];
					delete queuedReplyPreviewTranslations[referencedMessage.id];
					if (translation && translation.auto) {
						const originalContent = this.normalizeStoredTranslationData(translation).originalContent;
						if (originalContent != null) fallbackContent = (originalContent || "").trim();
						delete translatedMessages[referencedMessage.id];
						translation = null;
					}
				}
				if (!translation && translationEnabled) translation = this.getReplyPreviewTranslation(referencedMessage, channelId);
				if (!translation && translationEnabled) {
					const cachedTranslation = this.getCachedReceivedTranslation(referencedMessage, channelId);
					if (cachedTranslation) {
						translation = this.createReplyPreviewTranslationData(referencedMessage, channelId, cachedTranslation);
						if (translation) replyPreviewTranslations[referencedMessage.id] = translation;
					}
					else if (!deferInitialReplyPreviewTranslate) this.queueReplyPreviewTranslation(referencedMessage, channelId);
				}
				e.instance.props.referencedMessage = Object.assign({}, e.instance.props.referencedMessage);
				e.instance.props.referencedMessage.message = new BDFDB.DiscordObjects.Message(referencedMessage);
				e.instance.props.referencedMessage.message.content = translation ? this.getReplyPreviewDisplayContent(translation) : fallbackContent;
				if (e.returnvalue && e.returnvalue.props) {
					e.returnvalue = this.tagReplyPreviewRenderNode(e.returnvalue);
					if (translation && translation.originalContent && /\n/.test(this.getReplyPreviewDisplayContent(translation))) e.returnvalue.props.className = BDFDB.DOMUtils.formatClassName(e.returnvalue.props.className, "translator-reply-preview-multiline");
				}
			}

			processMessageContent (e) {
				if (!e.instance.props.message || !e.returnvalue || !e.returnvalue.props) return;
				let translation = translatedMessages[e.instance.props.message.id];
				if (translation) this.refreshTranslationDisplay(translation);
				let children = this.ensureElementChildrenArray(e.returnvalue);
				this.cleanupInjectedMessageChildren(children);
				if (translation && this.settings.general.protectQuotedText) {
					e.returnvalue.props.children = this.highlightProtectedWrappedTextInNode(e.returnvalue.props.children, e.instance.props.message.id);
					children = this.ensureElementChildrenArray(e.returnvalue);
				}
				if (translation && this.settings.general.highlightTranslatedMessages) e.returnvalue.props.className = BDFDB.DOMUtils.formatClassName(e.returnvalue.props.className, "translator-translated-message");
				if (translation) e.returnvalue.props.style = Object.assign({}, e.returnvalue.props.style, {
					"--translator-accent-color": this.getTranslatedTextColor(),
					"--translator-text-color": this.getTranslatedTextColor()
				});
				if (translation && translation.content) children.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
					key: "translator-translated-watermark",
					text: this.getTranslationTooltipText(translation.input, translation.output),
					tooltipConfig: {style: "max-width: 400px"},
					children: BDFDB.ReactUtils.createElement("span", {
						className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.messagetimestamp, BDFDB.disCN.messagetimestampinline, BDFDB.disCN._translatortranslated),
						children: BDFDB.ReactUtils.createElement("span", {
							className: BDFDB.disCN.messageedited,
							children: `(${this.labels.translated_watermark})`
						})
					})
				}));
				if (translation && translation.originalContent && this.settings.general.showOriginalMessage && this.settings.general.showOriginalDirectly) children.push(this.createOriginalMessageBlock(translation.originalContent));
			}

			processEmbed (e) {
				if (!e.instance.props.embed || !e.instance.props.embed.message_id) return;
				let translation = translatedMessages[e.instance.props.embed.message_id];
				if (translation && Object.keys(translation.embeds).length) {
					if (!e.returnvalue) e.instance.props.embed = Object.assign({}, e.instance.props.embed, {
						rawDescription: translation.embeds[e.instance.props.embed.id].description,
						rawTitle: translation.embeds[e.instance.props.embed.id].title,
						footer: Object.assign({}, e.instance.props.embed.footer || {}, {
							text: translation.embeds[e.instance.props.embed.id].footerText || ""
						}),
						fields: translation.embeds[e.instance.props.embed.id].fields.map(n => ({ rawName: n.name, rawValue: n.value })),
						originalDescription: e.instance.props.embed.originalDescription || e.instance.props.embed.rawDescription,
						originalTitle: e.instance.props.embed.originalTitle || e.instance.props.embed.rawTitle,
						originalFields: e.instance.props.embed.originalFields || e.instance.props.embed.fields,
						originalFooter: e.instance.props.embed.originalFooter || Object.assign({}, e.instance.props.embed.footer)
					});
					else {
						let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, { props: [["className", BDFDB.disCN.embeddescription]] });
						if (index > -1) {
							// Ensure children[index].props.children is an array before attempting to push
							// Fix for errors on multiple embeds in single messages
							if (!Array.isArray(children[index].props.children)) {
								children[index].props.children = [children[index].props.children];
							}
							this.cleanupInjectedMessageChildren(children[index].props.children);

							children[index].props.children.push(
								BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
									key: "translator-embed-watermark",
									text: this.getTranslationTooltipText(translation.input, translation.output),
									tooltipConfig: { style: "max-width: 400px" },
									children: BDFDB.ReactUtils.createElement("span", {
										className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.messagetimestamp, BDFDB.disCN.messagetimestampinline, BDFDB.disCN._translatortranslated),
										children: BDFDB.ReactUtils.createElement("span", {
											className: BDFDB.disCN.messageedited,
											children: `(${this.labels.translated_watermark})`
										})
									})
								})
							);
						}
					}
				}
				else if (!e.returnvalue && e.instance.props.embed.originalDescription) {
					e.instance.props.embed = Object.assign({}, e.instance.props.embed, {
						rawDescription: e.instance.props.embed.originalDescription,
						rawTitle: e.instance.props.embed.originalTitle,
						fields: e.instance.props.embed.originalFields,
						footer: e.instance.props.embed.originalFooter
					});
					delete e.instance.props.embed.originalDescription;
					delete e.instance.props.embed.originalTitle;
					delete e.instance.props.embed.originalFields;
					delete e.instance.props.embed.originalFooter;
				}
			}
			
			toggleTranslation (channelId) {
				const wasEnabled = this.isTranslationEnabled(channelId);
				if (!wasEnabled) translationEnabledStates.push(this.settings.general.usePerChatTranslation ? channelId : "global");
				else BDFDB.ArrayUtils.remove(translationEnabledStates, this.settings.general.usePerChatTranslation ? channelId : "global", true);
				BDFDB.DataUtils.save(translationEnabledStates, this, "translationEnabledStates");
				if (wasEnabled) {
					this.clearDisplayedTranslations(this.settings.general.usePerChatTranslation ? channelId : null);
					this.clearAutoTranslationQueue(this.settings.general.usePerChatTranslation ? channelId : null);
				}
				this.resetAutoTranslationTracking();
				this.scheduleTranslationRerender();
				this.processAutoTranslationQueue();
			}
			
			isTranslationEnabled (channelId) {
				return translationEnabledStates.includes(this.settings.general.usePerChatTranslation ? channelId : "global");
			}

			setLanguages () {
				if (this.settings.engines.translator == this.settings.engines.backup) {
					this.settings.engines.backup = Object.keys(translationEngines).filter(n => n != this.settings.engines.translator)[0];
					BDFDB.DataUtils.save(this.settings.engines, this, "engines");
				}
				let engine = translationEngines[this.settings.engines.translator] || {};
				let backup = translationEngines[this.settings.engines.backup] || {};
				let languageIds = [].concat(engine.languages, backup.languages).flat(10).filter(n => n);
				languages = BDFDB.ObjectUtils.deepAssign(
					!engine.auto && !backup.auto ? {} : {
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
				for (let id in languages) languages[id].fav = favorites.includes(id) ? 0 : 1;
				languages = BDFDB.ObjectUtils.sort(languages, "fav");
			}

			getLanguageData (language) {
				if (!language) return null;
				if (typeof language == "string") return languages[language] || BDFDB.LanguageUtils.languages[language] || {id: language, name: language};
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

			createOriginalMessageBlock (originalText) {
				if (!originalText) return null;
				return BDFDB.ReactUtils.createElement("div", {
					key: "translator-original-message",
					className: "translator-original-message",
					children: BDFDB.ReactUtils.createElement("span", {
						className: this.shouldUseSpoilerInReceivedOriginal() ? "translator-original-spoiler" : null,
						children: originalText
					})
				});
			}

			getLanguageChoice (direction, place, channelId) {
				let choice;
				let channel = channelId && BDFDB.LibraryStores.ChannelStore.getChannel(channelId);
				let guildId = channel ? (channel.guild_id ? channel.guild_id : "@me") : null;
				if (channelLanguages[channelId] && channelLanguages[channelId][place]) choice = channelLanguages[channelId][place][direction];
				else if (guildId && guildLanguages[guildId] && guildLanguages[guildId][place]) choice = guildLanguages[guildId][place][direction];
				else choice = this.settings.choices[place] && this.settings.choices[place][direction];
				choice = languages[choice] ? choice : Object.keys(languages)[0];
				choice = direction == languageTypes.OUTPUT && choice == "auto" ? "en" : choice;
				return choice;
			}

			saveLanguageChoice (choice, direction, place, channelId) {
				let channel = channelId && BDFDB.LibraryStores.ChannelStore.getChannel(channelId);
				let guildId = channel ? (channel.guild_id ? channel.guild_id : "@me") : null;
				if (channelLanguages[channelId] && channelLanguages[channelId][place]) {
					channelLanguages[channelId][place][direction] = choice;
					BDFDB.DataUtils.save(channelLanguages, this, "channelLanguages");
				}
				else if (guildLanguages[guildId] && guildLanguages[guildId][place]) {
					guildLanguages[guildId][place][direction] = choice;
					BDFDB.DataUtils.save(guildLanguages, this, "guildLanguages");
				}
				else {
					this.settings.choices[place][direction] = choice;
					BDFDB.DataUtils.save(this.settings.choices, this, "choices");
				}
			}

			getAutoTranslateSourceLanguages () {
				const sourceLanguages = this.settings.filters && BDFDB.ArrayUtils.is(this.settings.filters.autoTranslateSourceLanguages) ? this.settings.filters.autoTranslateSourceLanguages : [];
				return [...new Set(sourceLanguages.filter(languageId => languages[languageId] && !languages[languageId].auto && !languages[languageId].special))];
			}

			normalizeLanguageId (languageId) {
				return (languageId || "").toLowerCase();
			}

			matchesConfiguredSourceLanguage (languageId, sourceLanguages = null) {
				if (!languageId) return false;
				const normalizedLanguageId = this.normalizeLanguageId(languageId);
				const normalizedSourceLanguages = (sourceLanguages || this.getAutoTranslateSourceLanguages()).map(sourceLanguage => this.normalizeLanguageId(sourceLanguage));
				return normalizedSourceLanguages.some(sourceLanguage => sourceLanguage == normalizedLanguageId || sourceLanguage.startsWith(`${normalizedLanguageId}-`) || normalizedLanguageId.startsWith(`${sourceLanguage}-`));
			}

			detectLanguage (text, callback) {
				let [newText, , translate] = this.removeExceptions((text || "").trim(), messageTypes.SENT);
				if (!translate || !newText) return callback(null);
				BDFDB.LibraryRequires.request("https://translate.googleapis.com/translate_a/single", {
					form: {
						"client": "gtx",
						"dt": "t",
						"dj": "1",
						"source": "input",
						"sl": "auto",
						"tl": "en",
						"q": encodeURIComponent(newText)
					}
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {callback((JSON.parse(body) || {}).src || null);}
						catch (err) {callback(null);}
					}
					else callback(null);
				});
			}

			shouldAutoTranslateSentMessage (text, channelId, callback) {
				const sourceLanguages = this.getAutoTranslateSourceLanguages();
				if (!sourceLanguages.length) return callback(true);
				const configuredInputLanguage = this.getLanguageChoice(languageTypes.INPUT, messageTypes.SENT, channelId);
				if (configuredInputLanguage && configuredInputLanguage != "auto") return callback(this.matchesConfiguredSourceLanguage(configuredInputLanguage, sourceLanguages));
				this.detectLanguage(text, detectedLanguage => callback(this.matchesConfiguredSourceLanguage(detectedLanguage, sourceLanguages)));
			}

			translateMessage (message, channel, options = {}) {
				return new Promise(callback => {
					if (!message) return callback(null);
					if (translatedMessages[message.id]) {
						if (options.auto) return callback(false);
						suppressedAutoTranslations[message.id] = true;
						delete translatedMessages[message.id];
						this.scheduleTranslationRerender();
						callback(false);
					}
					else {
						const channelId = channel && channel.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
						if (options.auto && !this.isTranslationEnabled(channelId)) return callback(false);
						const originalContentData = options.originalContentData || this.extractOriginalContentData(message);
						if (!this.hasTranslatableMessageContent(originalContentData)) return callback(false);
						const signature = this.createReceivedTranslationSignature(message, channelId, originalContentData);
						const cachedTranslation = this.getCachedReceivedTranslation(message, channelId, originalContentData);
						if (cachedTranslation) {
							this.applyStoredTranslationToMessage(message, Object.assign({channelId, auto: !!options.auto}, cachedTranslation), originalContentData);
							this.scheduleTranslationRerender({batched: options.auto || options.silent});
							return callback(true);
						}
						const allTextsToTranslate = this.buildTranslationRequestText(originalContentData);
						message.embeds.forEach(embed => embed.message_id = message.id);
						let embedIds = message.embeds.map(embed => embed.id);
						this.translateText(allTextsToTranslate, messageTypes.RECEIVED, (translation, input, output) => {
							if (options.auto && !this.isTranslationEnabled(channelId)) return callback(false);
							if (translation) {
								let strings = translation.split(/\n{0,1}__________________ __________________ __________________\n{0,1}/);
								let oldContent = (originalContentData.content || "").trim();
								let translatedContent = (strings.shift() || "").trim();
								let content = this.buildReceivedDisplayContent(translatedContent, oldContent);
								let embeds = strings.reduce((dict, segment, index) => {
									let embedId = embedIds[index];
									let segmentLines = segment.split("\n");
									let title = segmentLines.shift();
									let description = segmentLines.shift();
									let footerText = segmentLines.pop();
									let fieldsSegment = segmentLines.join("\n").split("\n\n");
									let fields = fieldsSegment.map(line => {
										let [name, value] = line.split("__________________");
										return {name, value};
									});

									dict[embedId] = {title, description, fields, footerText};
									return dict;
								}, {});
								const storedTranslation = {
									signature,
									channelId,
									auto: !!options.auto,
									content: content,
									translatedContent,
									originalContent: oldContent,
									embeds: embeds,
									input,
									output
								};
								if (options.auto && !this.shouldKeepAutoTranslatedResult(storedTranslation, channelId)) return callback(false);
								this.applyStoredTranslationToMessage(message, storedTranslation, originalContentData);
								this.persistTranslationCacheEntry(message.id, signature, storedTranslation);
								this.scheduleTranslationRerender({batched: options.auto || options.silent});
							}
							callback(true);
						}, null, {
							showToast: !options.silent,
							showFailureToast: !options.silent,
							trackBusy: options.trackBusy !== false,
							channelId
						});
					}
				});
			}

			translateText (text, place, callback, forcedOutputLanguage = null, options = {}) {
				const showToast = options.showToast !== false;
				const showFailureToast = options.showFailureToast !== false;
				const trackBusy = options.trackBusy !== false;
				let toast = null, toastInterval, finished = false, finishTranslation = translation => {
					if (trackBusy) isTranslating = false;
					if (toast) toast.close();
					BDFDB.TimeUtils.clear(toastInterval);
					
					if (finished) return;
					finished = true;
					if (translation) translation = this.addExceptions(translation, excepts);
					callback(translation == text ? "" : translation, input, output);
				};
				let [newText, excepts, translate] = this.removeExceptions(text.trim(), place);
				let channelId = options.channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
				let input = Object.assign({}, languages[this.getLanguageChoice(languageTypes.INPUT, place, channelId)]);
				let output = forcedOutputLanguage ? 
					Object.assign({}, languages[forcedOutputLanguage] || {id: forcedOutputLanguage, name: forcedOutputLanguage}) : 
					Object.assign({}, languages[this.getLanguageChoice(languageTypes.OUTPUT, place, channelId)]);
				
				if (translate && input.id != output.id) {
					let specialCase = this.checkForSpecialCase(newText, input);
					if (specialCase) {
						input.name = specialCase.name;
						switch (specialCase.id) {
							case "binary": newText = this.binary2string(newText); break;
							case "braille": newText = this.braille2string(newText); break;
							case "morse": newText = this.morse2string(newText); break;
                            case "hex": newText = this.hex2string(newText); break;
						}
					}
					if (output.special) {
						switch (output.id) {
							case "binary": newText = this.string2binary(newText); break;
							case "braille": newText = this.string2braille(newText); break;
							case "morse": newText = this.string2morse(newText); break;
                            case "hex": newText = this.string2hex(newText); break;
						}
						finishTranslation(newText);
					}
					else {
						const startTranslating = engine => {
							if (trackBusy) isTranslating = true;
							if (toast) toast.close();
							BDFDB.TimeUtils.clear(toastInterval);
							
							if (showToast) toast = BDFDB.NotificationUtils.toast(`${this.labels.toast_translating} (${translationEngines[engine].name}) - ${BDFDB.LanguageUtils.LibraryStrings.please_wait}`, {
								timeout: 0,
								ellipsis: true,
								position: "center",
								onClose: _ => BDFDB.TimeUtils.clear(toastInterval)
							});
							toastInterval = BDFDB.TimeUtils.interval((_, count) => {
								if (count < 40) return;
								finishTranslation("");
								if (showFailureToast) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed} (${translationEngines[engine].name}) - ${this.labels.toast_translating_tryanother}`, {
									type: "danger",
									position: "center"
								});
							}, 500);
						};
						if (this.validTranslator(this.settings.engines.translator, input, output, specialCase)) {
							startTranslating(this.settings.engines.translator);
							this[translationEngines[this.settings.engines.translator].funcName].apply(this, [{input, output, text: newText, specialCase, engine: translationEngines[this.settings.engines.translator]}, translation => {
								if (!translation && this.validTranslator(this.settings.engines.backup, input, output, specialCase)) {
									startTranslating(this.settings.engines.backup);
									this[translationEngines[this.settings.engines.backup].funcName].apply(this, [{input, output, text: newText, specialCase, engine: translationEngines[this.settings.engines.backup]}, finishTranslation]);
								}
								else finishTranslation(translation);
							}]);
						}
						else if (this.validTranslator(this.settings.engines.backup, input, output, specialCase)) {
							startTranslating(this.settings.engines.backup);
							this[translationEngines[this.settings.engines.backup].funcName].apply(this, [{input, output, text: newText, specialCase, engine: translationEngines[this.settings.engines.backup]}, finishTranslation]);
						}
						else finishTranslation();
					}
				}
				else finishTranslation();
			}
			
			validTranslator (key, input, output, specialCase) {
				let engine = translationEngines[key];
				if (!engine || typeof this[engine.funcName] != "function") return false;
				if (["microsoft", "googlecloud", "deepseek", "oaicompat"].includes(key) && !(authKeys[key] && authKeys[key].key)) return false;
				return specialCase || input.auto && engine.auto || engine.languages.includes(input.id) && engine.languages.includes(output.id);
			}

			isValidatableEngine (engineKey) {
				return ["googlecloud", "microsoft", "deepl", "deepseek", "oaicompat"].includes(engineKey);
			}

			normalizeApiEndpoint (engineKey, endpoint) {
				let normalized = (endpoint || "").trim() || translationEngines[engineKey] && translationEngines[engineKey].endpoint || "";
				if (!normalized) return "";
				normalized = normalized.replace(/\s+/g, "").replace(/\/+$/, "");

				if (engineKey == "deepseek") {
					if (/\/v1$/i.test(normalized)) normalized = normalized.slice(0, -3);
					if (/\/v1\/chat\/completions$/i.test(normalized)) return normalized.replace(/\/v1\/chat\/completions$/i, "/chat/completions");
					if (/\/chat\/completions$/i.test(normalized)) return normalized;
					return `${normalized}/chat/completions`;
				}
				if (engineKey == "oaicompat") {
					if (/\/chat\/completions$/i.test(normalized)) return normalized;
					if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
					if (/^https?:\/\/[^/]+$/i.test(normalized)) return `${normalized}/v1/chat/completions`;
					return normalized;
				}
				if (engineKey == "microsoft") {
					normalized = normalized.replace(/\?.*$/, "");
					if (/\/translate$/i.test(normalized)) return normalized;
					return `${normalized}/translate`;
				}
				return normalized;
			}

			supportsModelCatalog (engineKey) {
				return ["deepseek", "oaicompat"].includes(engineKey);
			}

			getModelCatalogEndpoint (engineKey, endpoint) {
				const normalized = this.normalizeApiEndpoint(engineKey, endpoint);
				if (!normalized) return "";
				if (/\/chat\/completions$/i.test(normalized)) return normalized.replace(/\/chat\/completions$/i, "/models");
				return `${normalized.replace(/\/+$/, "")}/models`;
			}

			fetchModelCatalog (engineKey, onUpdate = null) {
				return new Promise(resolve => {
					if (!this.supportsModelCatalog(engineKey)) return resolve({ok: false, items: []});

					if (!this.modelCatalogState) this.modelCatalogState = {};
					const updateState = patch => {
						this.modelCatalogState[engineKey] = Object.assign({}, this.modelCatalogState[engineKey], patch);
						if (typeof onUpdate == "function") onUpdate();
					};

					const engineLabel = this.getEngineLabel(engineKey);
					const auth = authKeys[engineKey] || {};
					const apiKey = (auth.key || "").trim();
					if (!apiKey) {
						BDFDB.NotificationUtils.toast(`${engineLabel}: ${this.getCustomText("validate_missing_key")}`, {type: "danger", position: "center"});
						return resolve({ok: false, items: []});
					}

					const normalizedEndpoint = this.normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey] && translationEngines[engineKey].endpoint || "");
					if (!normalizedEndpoint) {
						BDFDB.NotificationUtils.toast(`${engineLabel}: ${this.getCustomText("validate_missing_endpoint")}`, {type: "danger", position: "center"});
						return resolve({ok: false, items: []});
					}

					if (auth.endpoint && normalizedEndpoint != auth.endpoint) {
						auth.endpoint = normalizedEndpoint;
						authKeys[engineKey] = auth;
						BDFDB.DataUtils.save(authKeys, this, "authKeys");
						this.SettingsUpdated = true;
					}

					const requestUrl = this.getModelCatalogEndpoint(engineKey, normalizedEndpoint);
					updateState({loading: true, items: [], endpoint: requestUrl});

					BDFDB.LibraryRequires.request(requestUrl, {
						method: "get",
						headers: {
							"Content-Type": "application/json",
							"Authorization": `Bearer ${apiKey}`
						}
					}, (error, response, body) => {
						if (!error && body && response && response.statusCode == 200) {
							try {
								body = JSON.parse(body);
								const items = ((body && body.data) || [])
									.map(item => typeof item == "string" ? item : item && item.id)
									.filter(item => typeof item == "string" && item.trim())
									.sort((modelA, modelB) => modelA.localeCompare(modelB));
								updateState({
									loading: false,
									items,
									endpoint: requestUrl,
									fetchedAt: Date.now()
								});
								BDFDB.NotificationUtils.toast(
									items.length
										? `${engineLabel}: ${this.getCustomText("model_catalog_loaded").replace("{count}", items.length)}`
										: `${engineLabel}: ${this.getCustomText("model_catalog_empty")}`,
									{
										type: items.length ? "success" : "warning",
										position: "center"
									}
								);
								return resolve({ok: true, items});
							}
							catch (err) {}
						}

						updateState({loading: false, items: []});
						const details = this.getValidationErrorDetails(body);
						BDFDB.NotificationUtils.toast(
							`${engineLabel}: ${this.getCustomText("validate_failed")}${response && response.statusCode ? ` (${response.statusCode})` : ""}${details ? ` - ${details}` : ""}`,
							{
								type: "danger",
								position: "center"
							}
						);
						return resolve({ok: false, items: []});
					});
				});
			}

			mapLanguageCodeForEngine (engineKey, languageId) {
				if (!languageId) return languageId;
				if (engineKey == "deepl") {
					if (languageId == "zh-CN" || languageId == "zh") return "ZH";
					if (languageId == "zh-TW") return "ZH-HANT";
					return languageId.toUpperCase();
				}
				return translationEngines[engineKey] && translationEngines[engineKey].parser && translationEngines[engineKey].parser[languageId] || languageId;
			}

			getValidationRequestForEngine (engineKey) {
				const request = {
					source: "en",
					target: "de",
					text: "Good morning"
				};
				return request;
			}

			getValidationErrorDetails (body) {
				if (!body) return "";
				try {
					body = typeof body == "string" ? JSON.parse(body) : body;
				}
				catch (err) {
					return typeof body == "string" ? body.slice(0, 160) : "";
				}
				return body && body.error && (body.error.message || body.error.code) || body.message || body.error_msg || body.msg || "";
			}

			validateEngineConfig (engineKey) {
				return new Promise(resolve => {
					if (!this.isValidatableEngine(engineKey)) return resolve({ok: false, normalized: false});

					const engineLabel = this.getEngineLabel(engineKey);
					let runningToast = null;
					const finish = (ok, message, normalized = false) => {
						if (runningToast) runningToast.close();
						BDFDB.NotificationUtils.toast(message, {
							type: ok ? "success" : "danger",
							position: "center"
						});
						resolve({ok, normalized});
					};
					const auth = authKeys[engineKey] || {};
					const apiKey = (auth.key || "").trim();
					if (!apiKey) return finish(false, `${engineLabel}: ${this.getCustomText("validate_missing_key")}`);

					let normalized = false;
					let apiEndpoint = "";
					if (translationEngines[engineKey] && translationEngines[engineKey].endpoint) {
						apiEndpoint = this.normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey].endpoint);
						if (auth.endpoint && apiEndpoint != auth.endpoint) {
							auth.endpoint = apiEndpoint;
							authKeys[engineKey] = auth;
							BDFDB.DataUtils.save(authKeys, this, "authKeys");
							this.SettingsUpdated = true;
							normalized = true;
						}
						if (!apiEndpoint) return finish(false, `${engineLabel}: ${this.getCustomText("validate_missing_endpoint")}`, normalized);
					}

					const modelId = (auth.model || translationEngines[engineKey] && translationEngines[engineKey].model || "").trim();
					if (["deepseek", "oaicompat"].includes(engineKey) && !modelId) return finish(false, `${engineLabel}: ${this.getCustomText("validate_missing_model")}`, normalized);

					const sample = this.getValidationRequestForEngine(engineKey);
					runningToast = BDFDB.NotificationUtils.toast(`${this.getCustomText("validate_running")} ${engineLabel}...`, {
						timeout: 0,
						ellipsis: true,
						position: "center"
					});
					const successMessage = translatedText => {
						const suffix = normalized ? ` ${this.getCustomText("validate_saved_endpoint")}` : "";
						const preview = translatedText ? ` (${translatedText.slice(0, 48)})` : "";
						return `${engineLabel}: ${this.getCustomText("validate_success")}.${suffix}${preview}`;
					};
					const failMessage = (statusCode, body) => {
						const details = this.getValidationErrorDetails(body);
						return `${engineLabel}: ${this.getCustomText("validate_failed")}${statusCode ? ` (${statusCode})` : ""}${details ? ` - ${details}` : ""}`;
					};

					switch (engineKey) {
						case "googlecloud": {
							const model = (auth.model || "").trim();
							const form = {
								key: apiKey,
								q: sample.text,
								source: sample.source,
								target: sample.target,
								format: "text"
							};
							if (model) form.model = model;
							return BDFDB.LibraryRequires.request(apiEndpoint, {
								method: "post",
								form
							}, (error, response, body) => {
								if (!error && body && response && response.statusCode == 200) {
									try {
										body = JSON.parse(body);
										const translation = body && body.data && body.data.translations && body.data.translations[0] && body.data.translations[0].translatedText;
										return finish(!!translation, translation ? successMessage(translation) : failMessage(response.statusCode, body), normalized);
									}
									catch (err) {}
								}
								return finish(false, failMessage(response && response.statusCode, body), normalized);
							});
						}
						case "microsoft": {
							const headers = {
								"Content-Type": "application/json",
								"Ocp-Apim-Subscription-Key": apiKey
							};
							const region = (auth.region || "").trim();
							if (region && region != "global") headers["Ocp-Apim-Subscription-Region"] = region;
							return BDFDB.LibraryRequires.request(apiEndpoint, {
								method: "post",
								headers,
								body: JSON.stringify([{Text: sample.text}]),
								form: {
									"api-version": "3.0",
									"from": this.mapLanguageCodeForEngine("microsoft", sample.source),
									"to": this.mapLanguageCodeForEngine("microsoft", sample.target)
								}
							}, (error, response, body) => {
								if (!error && body && response && response.statusCode == 200) {
									try {
										body = JSON.parse(body);
										const translation = body && body[0] && body[0].translations && body[0].translations[0] && body[0].translations[0].text;
										return finish(!!translation, translation ? successMessage(translation) : failMessage(response.statusCode, body), normalized);
									}
									catch (err) {}
								}
								return finish(false, failMessage(response && response.statusCode, body), normalized);
							});
						}
						case "deepl": {
							const translateEndpoint = auth.paid ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
							return BDFDB.LibraryRequires.request(translateEndpoint, {
								method: "post",
								headers: {
									"Content-Type": "application/json",
									"Authorization": `DeepL-Auth-Key ${apiKey}`
								},
								body: JSON.stringify({
									text: [sample.text],
									source_lang: this.mapLanguageCodeForEngine("deepl", sample.source),
									target_lang: this.mapLanguageCodeForEngine("deepl", sample.target)
								})
							}, (error, response, body) => {
								if (!error && body && response && response.statusCode == 200) {
									try {
										body = JSON.parse(body);
										const translation = body && body.translations && body.translations[0] && body.translations[0].text;
										return finish(!!translation, translation ? successMessage(translation) : failMessage(response.statusCode, body), normalized);
									}
									catch (err) {}
								}
								return finish(false, failMessage(response && response.statusCode, body), normalized);
							});
						}
						case "deepseek":
						case "oaicompat": {
							return BDFDB.LibraryRequires.request(apiEndpoint, {
								method: "post",
								headers: {
									"Content-Type": "application/json",
									"Authorization": `Bearer ${apiKey}`
								},
								body: JSON.stringify({
									model: modelId,
									messages: [{
										role: "system",
										content: "You are a translation validator."
									}, {
										role: "user",
										content: `Translate the following text from English to German. Return only the translation.\n\n${sample.text}`
									}],
									temperature: 0,
									max_tokens: 32
								})
							}, (error, response, body) => {
								if (!error && body && response && response.statusCode == 200) {
									try {
										body = JSON.parse(body);
										const translation = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
										return finish(!!translation, translation ? successMessage(translation.trim()) : failMessage(response.statusCode, body), normalized);
									}
									catch (err) {}
								}
								return finish(false, failMessage(response && response.statusCode, body), normalized);
							});
						}
					}
					return finish(false, `${engineLabel}: ${this.getCustomText("validate_failed")}`, normalized);
				});
			}
			
			googleApiTranslate (data, callback) {
				BDFDB.LibraryRequires.request("https://translate.googleapis.com/translate_a/single", {
					form: {
						"client": "gtx",
						"dt": "t",
						"dj": "1",
						"source": "input",
						"sl": data.input.id,
						"tl": data.output.id,
						"q": encodeURIComponent(data.text)
					}
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {
							body = JSON.parse(body);
							if (!data.specialCase && body.src && body.src && languages[body.src]) {
								data.input.id = body.src;
								data.input.name = languages[body.src].name;
								data.input.ownlang = languages[body.src].ownlang;
							}
							callback(body.sentences.map(n => n && n.trans).filter(n => n).join(""));
						}
						catch (err) {callback("");}
					}
					else {
						if (response.statusCode == 429) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_hourlylimit}`, {
							type: "danger",
							position: "center"
						});
						else BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
							type: "danger",
							position: "center"
						});
						callback("");
					}
				});
			}

			googleCloudTranslate (data, callback) {
				const apiKey = authKeys.googlecloud && authKeys.googlecloud.key || "";
				const apiEndpoint = authKeys.googlecloud && authKeys.googlecloud.endpoint || translationEngines.googlecloud.endpoint;
				const modelId = authKeys.googlecloud && authKeys.googlecloud.model || translationEngines.googlecloud.model;

				BDFDB.LibraryRequires.request(apiEndpoint, {
					method: "post",
					form: Object.assign({
						"key": apiKey,
						"q": data.text,
						"target": data.output.id,
						"format": "text",
						"model": modelId
					}, data.input.auto ? {} : {"source": data.input.id})
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {
							body = JSON.parse(body);
							const translations = body && body.data && body.data.translations || [];
							if (!data.specialCase && translations[0] && translations[0].detectedSourceLanguage && languages[translations[0].detectedSourceLanguage]) {
								data.input.id = translations[0].detectedSourceLanguage;
								data.input.name = languages[translations[0].detectedSourceLanguage].name;
								data.input.ownlang = languages[translations[0].detectedSourceLanguage].ownlang;
							}
							callback(translations.map(n => n && n.translatedText).filter(n => n).join(""));
						}
						catch (err) {callback("");}
					}
					else {
						if (response && (response.statusCode == 401 || response.statusCode == 403)) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_keyoutdated}`, {
							type: "danger",
							position: "center"
						});
						else if (response && response.statusCode == 429) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_hourlylimit}`, {
							type: "danger",
							position: "center"
						});
						else BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
							type: "danger",
							position: "center"
						});
						callback("");
					}
				});
			}
			
			microsoftTranslate (data, callback) {
				const apiEndpoint = this.normalizeApiEndpoint("microsoft", authKeys.microsoft && authKeys.microsoft.endpoint || translationEngines.microsoft.endpoint);
				const apiKey = authKeys.microsoft && authKeys.microsoft.key || "";
				const region = authKeys.microsoft && authKeys.microsoft.region || "";
				const headers = {
					"Content-Type": "application/json",
					"Ocp-Apim-Subscription-Key": apiKey
				};
				if (region && region != "global") headers["Ocp-Apim-Subscription-Region"] = region;
				BDFDB.LibraryRequires.request(apiEndpoint, {
					method: "post",
					headers,
					body: JSON.stringify([{"Text": data.text}]),
					form: Object.assign({
						"api-version": "3.0",
						"to": this.mapLanguageCodeForEngine("microsoft", data.output.id)
					}, data.input.auto ? {} : {"from": this.mapLanguageCodeForEngine("microsoft", data.input.id)})
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {
							body = JSON.parse(body)[0];
							if (!data.specialCase && body.detectedLanguage && body.detectedLanguage.language && languages[body.detectedLanguage.language.toLowerCase()]) {
								data.input.name = languages[body.detectedLanguage.language.toLowerCase()].name;
								data.input.ownlang = languages[body.detectedLanguage.language.toLowerCase()].ownlang;
							}
							callback(body.translations.map(n => n && n.text).filter(n => n).join(""));
						}
						catch (err) {callback("");}
					}
					else {
						if (response.statusCode == 403 || response.statusCode == 429) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_dailylimit}`, {
							type: "danger",
							position: "center"
						});
						else if (response.statusCode == 401) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_keyoutdated}`, {
							type: "danger",
							position: "center"
						});
						else BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
							type: "danger",
							position: "center"
						});
						callback("");
					}
				});
			}
			
			deepLTranslate (data, callback) {
				BDFDB.LibraryRequires.request(authKeys.deepl && authKeys.deepl.paid ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate", {
					method: "post",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `DeepL-Auth-Key ${authKeys.deepl && authKeys.deepl.key || ""}`
					},
					body: JSON.stringify(Object.assign({
						"text": [data.text],
						"target_lang": this.mapLanguageCodeForEngine("deepl", data.output.id)
					}, data.input.auto ? {} : {"source_lang": this.mapLanguageCodeForEngine("deepl", data.input.id)}))
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {
							body = JSON.parse(body);
							if (!data.specialCase && body.translations[0] && body.translations[0].detected_source_language && languages[body.translations[0].detected_source_language.toLowerCase()]) {
								data.input.name = languages[body.translations[0].detected_source_language.toLowerCase()].name;
								data.input.ownlang = languages[body.translations[0].detected_source_language.toLowerCase()].ownlang;
							}
							callback(body.translations.map(n => n && n.text).filter(n => n).join(""));
						}
						catch (err) {callback("");}
					}
					else {
						if (response.statusCode == 429 || response.statusCode == 456) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_dailylimit}`, {
							type: "danger",
							position: "center"
						});
						else if (response.statusCode == 403) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_keyoutdated}`, {
							type: "danger",
							position: "center"
						});
						else BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
								type: "danger",
								position: "center"
							});
						callback("");
					}
				});
			}

			deepSeekTranslate(data, callback) {
				const apiKey = authKeys.deepseek && authKeys.deepseek.key || "";
				const apiEndpoint = this.normalizeApiEndpoint("deepseek", authKeys.deepseek && authKeys.deepseek.endpoint || translationEngines.deepseek.endpoint);
				const modelId = authKeys.deepseek && authKeys.deepseek.model || translationEngines.deepseek.model;

				const translationPrompt = `
				You are a professional localization expert. Translate the following ${data.input.auto ? "" : data.input.name + " "}content to ${data.output.name} following these rules:
				1. Return ONLY the translation without any explanations
				2. Use natural, fluent language
				3. Maintain consistent terminology for technical/game terms  
				4. Preserve the original tone and style
				5. Use concise sentence structures
				6. Handle numbers/units/proper nouns correctly
				7. Use community-approved expressions for game content
				8. Convert [NEWLINE] markers to actual line breaks (don't show them literally)
				
				Text to translate:
				${data.text.replace(/\n/g, " [NEWLINE] ").replace(/\s+/g, " ")}
				`;

				const requestData = {
					model: modelId,
					messages: [{
						role: "system",
						content: "You are a senior bilingual localization specialist"
					}, {
						role: "user",
						content: translationPrompt
					}],
					temperature: 0.2,
					top_p: 0.8
				};

				BDFDB.LibraryRequires.request(apiEndpoint, {
					method: "post",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${apiKey}`
					},
					body: JSON.stringify(requestData)
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {
							body = JSON.parse(body);
							let translatedText = body.choices[0].message.content;
							translatedText = translatedText.replace(/\[NEWLINE\]/g, '\n');
							callback(translatedText);
						}
						catch (err) {
							console.error("DeepSeek translation error:", err);
							callback("");
						}
						
					}
					else {
						if (response.statusCode == 401 || response.statusCode == 403) {
							BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_keyoutdated}`, {
								type: "danger",
								position: "center"
							});
						}
						else if (response.statusCode == 429) {
							BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_dailylimit}`, {
								type: "danger",
								position: "center"
							});
						}
						else {
							BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
								type: "danger",
								position: "center"
							});
						}
						callback("");
					}
				});
			}
			
			openAiCompatibleTranslate(data, callback) {
				const apiKey = authKeys.oaicompat && authKeys.oaicompat.key || "";
				const apiEndpoint = this.normalizeApiEndpoint("oaicompat", authKeys.oaicompat && authKeys.oaicompat.endpoint || translationEngines.oaicompat.endpoint);
				const modelId = authKeys.oaicompat && authKeys.oaicompat.model || translationEngines.oaicompat.model;

				const translationPrompt = `
				You are a professional localization expert. Translate the following ${data.input.auto ? "" : data.input.name + " "}content to ${data.output.name} following these rules:
				1. Return ONLY the translation without any explanations
				2. Use natural, fluent language
				3. Maintain consistent terminology for technical/game terms
				4. Preserve the original tone and style
				5. Use concise sentence structures
				6. Handle numbers/units/proper nouns correctly
				7. Use community-approved expressions for game content
				8. Convert [NEWLINE] markers to actual line breaks (don't show them literally)

				Text to translate:
				${data.text.replace(/\n/g, " [NEWLINE] ").replace(/\s+/g, " ")}
				`;

				const requestData = {
					model: modelId,
					messages: [{
						role: "system",
						content: "You are a senior bilingual localization specialist"
					}, {
						role: "user",
						content: translationPrompt
					}],
					temperature: 0.2,
					top_p: 0.8
				};

				BDFDB.LibraryRequires.request(apiEndpoint, {
					method: "post",
					headers: {
						"Content-Type": "application/json",
						"Authorization": `Bearer ${apiKey}`
					},
					body: JSON.stringify(requestData)
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {
							body = JSON.parse(body);
							let translatedText = body.choices[0].message.content;
							translatedText = translatedText.replace(/\[NEWLINE\]/g, '\n');
							callback(translatedText);
						}
						catch (err) {
							console.error("OpenAI Compatible translation error:", err);
							callback("");
						}
					}
					else {
						if (response.statusCode == 401 || response.statusCode == 403) {
							BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_keyoutdated}`, {
								type: "danger",
								position: "center"
							});
						}
						else if (response.statusCode == 429) {
							BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_dailylimit}`, {
								type: "danger",
								position: "center"
							});
						}
						else {
							BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
								type: "danger",
								position: "center"
							});
						}
						callback("");
					}
				});
			}
			
			iTranslateTranslate (data, callback) {
				let translate = _ => {
					BDFDB.LibraryRequires.request("https://web-api.itranslateapp.com/v3/texts/translate", {
						method: "post",
						headers: {
							"API-KEY": authKeys.itranslate && authKeys.itranslate.key || data.engine.APIkey
						},
						body: JSON.stringify({
							source: {
								dialect: data.input.id,
								text: data.text
							},
							target: {
								dialect: data.output.id
							}
						})
					}, (error, response, body) => {
						if (!error && response && response.statusCode == 200) {
							try {
								body = JSON.parse(body);
								if (!data.specialCase && body.source && body.source.dialect && languages[body.source.dialect]) {
									data.input.id = body.source.dialect;
									data.input.name = languages[body.source.dialect].name;
									data.input.ownlang = languages[body.source.dialect].ownlang;
								}
								callback(body.target.text);
							}
							catch (err) {callback("");}
						}
						else {
							if (response.statusCode == 429) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_dailylimit}`, {
								type: "danger",
								position: "center"
							});
							else if (response.statusCode == 403) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_keyoutdated}`, {
								type: "danger",
								position: "center"
							});
							else BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
								type: "danger",
								position: "center"
							});
							callback("");
						}
					});
				};
				if (authKeys.itranslate && authKeys.itranslate.key || data.engine.APIkey) translate();
				else BDFDB.LibraryRequires.request("https://www.itranslate.com/js/webapp/main.js", {gzip: true}, (error, response, body) => {
					if (!error && body) {
						let APIkey = /var API_KEY = "(.+)"/.exec(body);
						if (APIkey) {
							data.engine.APIkey = APIkey[1];
							translate();
						}
						else callback("");
					}
					else callback("");
				});
			}
			
			yandexTranslate (data, callback) {
				BDFDB.LibraryRequires.request("https://translate.yandex.net/api/v1.5/tr/translate", {
					form: {
						"key": authKeys.yandex && authKeys.yandex.key || "",
						"text": encodeURIComponent(data.text),
						"lang": data.specialCase || data.input.auto ? data.output.id : (data.input.id + "-" + data.output.id),
						"options": "1"
					}
				}, (error, response, body) => {
					if (!error && body && response.statusCode == 200) {
						try {
							body = BDFDB.DOMUtils.create(body);
							let translation = body.querySelector("text");
							let detected = body.querySelector("detected");
							if (translation && detected) {
								let detectedLang = detected.getAttribute("lang");
								if (!data.specialCase && detectedLang && languages[detectedLang]) {
									data.input.name = languages[detectedLang].name;
									data.input.ownlang = languages[detectedLang].ownlang;
								}
								callback(translation.innerText);
							}
							else callback("");
						}
						catch (err) {callback("");}
					}
					else if (body && body.indexOf('code="408"') > -1) {
						BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_monthlylimit}`, {
							type: "danger",
							position: "center"
						});
						callback("");
					}
					else {
						BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}/${this.labels.error_keyoutdated}`, {
							type: "danger",
							position: "center"
						});
						callback("");
					}
				});
			}
			
			papagoTranslate (data, callback) {
				const credentials = (authKeys.papago && authKeys.papago.key || "").split(" ");
				const doTranslate = langCode => {
					BDFDB.LibraryRequires.request("https://openapi.naver.com/v1/papago/n2mt", {
						method: "post",
						headers: {
							"X-Naver-Client-Id": credentials[0],
							"X-Naver-Client-Secret": credentials[1],
							"Content-Type": "application/x-www-form-urlencoded"
						},
						form: {
							source: langCode,
							target: data.output.id,
							text: data.text
						}
					}, (error, response, body) => {
						if (!error && body && response.statusCode == 200) {
							try {
								let message = (JSON.parse(body) || {}).message;
								let result = message && (message.body || message.result);
								if (result && result.translatedText) callback(result.translatedText);
								else callback("");
							}
							catch (err) {callback("");}
						}
						else {
							if (response.statusCode == 429) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_hourlylimit}`, {
								type: "danger",
								position: "center"
							});
							else BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}/${this.labels.error_keyoutdated}`, {
								type: "danger",
								position: "center"
							});
							callback("");
						}
					});
				};
				if (data.input.auto) {
					BDFDB.LibraryRequires.request("https://openapi.naver.com/v1/papago/detectLangs", {
						method: "post",
						headers: {
							"X-Naver-Client-Id": credentials[0],
							"X-Naver-Client-Secret": credentials[1],
							"Content-Type": "application/x-www-form-urlencoded"
						},
						form: {
							query: data.text,
						}
					}, (error, response, body) => {
						let langCode = "en";
						if (!error && body && response.statusCode == 200) {
							try {
								langCode = JSON.parse(body)["langCode"];
							}
							catch (err) {
								langCode = "en";
							}
						}
						data.input.name = languages[langCode].name;
						data.input.ownlang = languages[langCode].ownlang;
						doTranslate(langCode);
					});
				}
				else doTranslate(data.input.id);
			}
			
			baiduTranslate (data, callback) {
				const credentials = (authKeys.baidu && authKeys.baidu.key || "").split(" ");
				const salt = BDFDB.NumberUtils.generateId();
				BDFDB.LibraryRequires.request("https://fanyi-api.baidu.com/api/trans/vip/translate", {
					bdVersion: true,
					method: "post",
					form: {
						from: translationEngines.baidu.parser[data.input.id] || data.input.id,
						to: translationEngines.baidu.parser[data.output.id] || data.output.id,
						q: encodeURIComponent(data.text),
						appid: credentials[0],
						salt: salt,
						sign: this.MD5(credentials[0] + data.text + salt + (credentials[2] || credentials[1]))
					}
				}, (error, response, result) => {
					if (!error && result && response.statusCode == 200) {
						try {
							result = JSON.parse(result) || {};
							if (!result.error_code) {
								let messages = result.trans_result;
								if (messages && messages.length > 0 && result.from != result.to) callback(messages.map(message => decodeURIComponent(message.dst)).join("\n"));
								else {callback("");}
							}
							else {
								if (result.error_code == 54004) BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_monthlylimit}.`, {
									type: "danger",
									position: "center"
								});
								else BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${result.error_code} : ${result.error_msg}.`, {
									type: "danger",
									position: "center"
								});
								callback("");
							}
						}
						catch (err) {callback("");}
					}
					else {
						BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed}. ${this.labels.toast_translating_tryanother}. ${this.labels.error_serverdown}`, {
							type: "danger",
							position: "center"
						});
						callback("");
					}
				});
			}
			
			MD5 (e) {
				function h(a, b) {
					var e = a & 2147483648, f = b & 2147483648, c = a & 1073741824, d = b & 1073741824, g = (a & 1073741823) + (b & 1073741823);
					return c & d ? g ^ 2147483648 ^ e ^ f : c | d ? g & 1073741824 ? g ^ 3221225472 ^ e ^ f : g ^ 1073741824 ^ e ^ f : g ^ e ^ f
				}
				function k(a, b, c, d, e, f, g) {
					a = h(a, h(h(b & c | ~b & d, e), g));
					return h(a << f | a >>> 32 - f, b);
				}
				function l(a, b, c, d, e, f, g) {
					a = h(a, h(h(b & d | c & ~d, e), g));
					return h(a << f | a >>> 32 - f, b);
				}
				function m(a, b, d, c, e, f, g) {
					a = h(a, h(h(b ^ d ^ c, e), g));
					return h(a << f | a >>> 32 - f, b)
				}
				function n(a, b, d, c, e, f, g) {
					a = h(a, h(h(d ^ (b | ~c), e), g));
					return h(a << f | a >>> 32 - f, b);
				}
				function p(a) {
					var b = "", d = "", c;
					for (c = 0; 3 >= c; c++) d = a >>> 8 * c & 255, d = "0" + d.toString(16), b += d.substr(d.length - 2, 2);
					return b;
				}
				
				var f = [], q, r, s, t, a, b, c, d;
				e = function(a) {
					a = a.replace(/\r\n/g, "\n");
					for (var b = "", d = 0; d < a.length; d++) {
						var c = a.charCodeAt(d);
						128 > c ? b += String.fromCharCode(c) : (127 < c && 2048 > c ? b += String.fromCharCode(c >> 6 | 192) : (b += String.fromCharCode(c >> 12 | 224), b += String.fromCharCode(c >> 6 & 63 | 128)), b += String.fromCharCode(c & 63 | 128))
					}
					return b;
				}(e);
				f = function(b) {
					var a, c = b.length;
					a = c + 8;
					for (var d = 16 * ((a - a % 64) / 64 + 1), e = Array(d - 1), f = 0, g = 0; g < c;) a = (g - g % 4) / 4, f = g % 4 * 8, e[a] |= b.charCodeAt(g) << f, g++;
					a = (g - g % 4) / 4;
					e[a] |= 128 << g % 4 * 8;
					e[d - 2] = c << 3;
					e[d - 1] = c >>> 29;
					return e
				}(e);
				a = 1732584193, b = 4023233417, c = 2562383102, d = 271733878;
				for (e = 0; e < f.length; e += 16) q = a, r = b, s = c, t = d, a = k(a, b, c, d, f[e + 0], 7, 3614090360), d = k(d, a, b, c, f[e + 1], 12, 3905402710), c = k(c, d, a, b, f[e + 2], 17, 606105819), b = k(b, c, d, a, f[e + 3], 22, 3250441966), a = k(a, b, c, d, f[e + 4], 7, 4118548399), d = k(d, a, b, c, f[e + 5], 12, 1200080426), c = k(c, d, a, b, f[e + 6], 17, 2821735955), b = k(b, c, d, a, f[e + 7], 22, 4249261313), a = k(a, b, c, d, f[e + 8], 7, 1770035416), d = k(d, a, b, c, f[e + 9], 12, 2336552879), c = k(c, d, a, b, f[e + 10], 17, 4294925233), b = k(b, c, d, a, f[e + 11], 22, 2304563134), a = k(a, b, c, d, f[e + 12], 7, 1804603682), d = k(d, a, b, c, f[e + 13], 12, 4254626195), c = k(c, d, a, b, f[e + 14], 17, 2792965006), b = k(b, c, d, a, f[e + 15], 22, 1236535329), a = l(a, b, c, d, f[e + 1], 5, 4129170786), d = l(d, a, b, c, f[e + 6], 9, 3225465664), c = l(c, d, a, b, f[e + 11], 14, 643717713), b = l(b, c, d, a, f[e + 0], 20, 3921069994), a = l(a, b, c, d, f[e + 5], 5, 3593408605), d = l(d, a, b, c, f[e + 10], 9, 38016083), c = l(c, d, a, b, f[e + 15], 14, 3634488961), b = l(b, c, d, a, f[e + 4], 20, 3889429448), a = l(a, b, c, d, f[e + 9], 5, 568446438), d = l(d, a, b, c, f[e + 14], 9, 3275163606), c = l(c, d, a, b, f[e + 3], 14, 4107603335), b = l(b, c, d, a, f[e + 8], 20, 1163531501), a = l(a, b, c, d, f[e + 13], 5, 2850285829), d = l(d, a, b, c, f[e + 2], 9, 4243563512), c = l(c, d, a, b, f[e + 7], 14, 1735328473), b = l(b, c, d, a, f[e + 12], 20, 2368359562), a = m(a, b, c, d, f[e + 5], 4, 4294588738), d = m(d, a, b, c, f[e + 8], 11, 2272392833), c = m(c, d, a, b, f[e + 11], 16, 1839030562), b = m(b, c, d, a, f[e + 14], 23, 4259657740), a = m(a, b, c, d, f[e + 1], 4, 2763975236), d = m(d, a, b, c, f[e + 4], 11, 1272893353), c = m(c, d, a, b, f[e + 7], 16, 4139469664), b = m(b, c, d, a, f[e + 10], 23, 3200236656), a = m(a, b, c, d, f[e + 13], 4, 681279174), d = m(d, a, b, c, f[e + 0], 11, 3936430074), c = m(c, d, a, b, f[e + 3], 16, 3572445317), b = m(b, c, d, a, f[e + 6], 23, 76029189), a = m(a, b, c, d, f[e + 9], 4, 3654602809), d = m(d, a, b, c, f[e + 12], 11, 3873151461), c = m(c, d, a, b, f[e + 15], 16, 530742520), b = m(b, c, d, a, f[e + 2], 23, 3299628645), a = n(a, b, c, d, f[e + 0], 6, 4096336452), d = n(d, a, b, c, f[e + 7], 10, 1126891415), c = n(c, d, a, b, f[e + 14], 15, 2878612391), b = n(b, c, d, a, f[e + 5], 21, 4237533241), a = n(a, b, c, d, f[e + 12], 6, 1700485571), d = n(d, a, b, c, f[e + 3], 10, 2399980690), c = n(c, d, a, b, f[e + 10], 15, 4293915773), b = n(b, c, d, a, f[e + 1], 21, 2240044497), a = n(a, b, c, d, f[e + 8], 6, 1873313359), d = n(d, a, b, c, f[e + 15], 10, 4264355552), c = n(c, d, a, b, f[e + 6], 15, 2734768916), b = n(b, c, d, a, f[e + 13], 21, 1309151649), a = n(a, b, c, d, f[e + 4], 6, 4149444226), d = n(d, a, b, c, f[e + 11], 10, 3174756917), c = n(c, d, a, b, f[e + 2], 15, 718787259), b = n(b, c, d, a, f[e + 9], 21, 3951481745), a = h(a, q), b = h(b, r), c = h(c, s), d = h(d, t);
				return (p(a) + p(b) + p(c) + p(d)).toLowerCase();
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
				return (string || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			}

			getProtectedTermsList () {
				let protectedTerms = BDFDB.ArrayUtils.is(this.settings.exceptions.protectedTerms) ? this.settings.exceptions.protectedTerms : [];
				return [...new Set(protectedTerms.map(term => (term || "").trim()).filter(Boolean))].sort((termA, termB) => termB.length - termA.length);
			}

			trimTrailingProtectedPunctuation (text) {
				if (!text) return {protectedText: text, trailingText: ""};
				const trailingMatch = text.match(/([,.;:!?'"`)\]}>，。！？；：）】」》、]+)$/);
				if (!trailingMatch || trailingMatch.index < 1) return {protectedText: text, trailingText: ""};
				return {
					protectedText: text.slice(0, trailingMatch.index),
					trailingText: trailingMatch[0]
				};
			}

			protectRegexMatches (string, regex, excepts = {}, count = 0, options = {}) {
				if (!string || !(regex instanceof RegExp)) return {string, excepts, count};
				regex.lastIndex = 0;
				let lastIndex = 0, nextString = "", hasMatch = false, match;
				while ((match = regex.exec(string))) {
					let fullMatch = match[0];
					if (!fullMatch) {
						if (regex.global && regex.lastIndex === match.index) regex.lastIndex++;
						continue;
					}
					let protectedText = fullMatch;
					let trailingText = "";
					if (typeof options.normalize == "function") {
						let normalized = options.normalize(fullMatch, match, string) || {};
						protectedText = normalized.protectedText != null ? normalized.protectedText : protectedText;
						trailingText = normalized.trailingText || "";
					}
					if (!protectedText || !String(protectedText).trim()) continue;
					hasMatch = true;
					nextString += string.slice(lastIndex, match.index);
					excepts[count] = protectedText;
					nextString += `{{${count++}}}${trailingText}`;
					lastIndex = match.index + fullMatch.length;
					if (!regex.global) break;
				}
				if (!hasMatch) return {string, excepts, count};
				nextString += string.slice(lastIndex);
				return {string: nextString, excepts, count};
			}

			protectCodeBlockSegments (string, excepts = {}, count = 0) {
				return this.protectRegexMatches(string, /```[\s\S]*?```/g, excepts, count);
			}

			protectAutoDetectedSegments (string, excepts = {}, count = 0) {
				let result = this.protectRegexMatches(string, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi, excepts, count);
				string = result.string;
				excepts = result.excepts;
				count = result.count;

				const trimTrailing = fullMatch => this.trimTrailingProtectedPunctuation(fullMatch);
				result = this.protectRegexMatches(string, /\bhttps?:\/\/[^\s<>()\u3000]+/gi, excepts, count, {normalize: trimTrailing});
				string = result.string;
				excepts = result.excepts;
				count = result.count;

				result = this.protectRegexMatches(string, /\b(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>()\u3000]*)?/gi, excepts, count, {
					normalize: fullMatch => {
						const trimmed = trimTrailing(fullMatch);
						if (!/[./]/.test(trimmed.protectedText || "")) return {protectedText: "", trailingText: fullMatch};
						return trimmed;
					}
				});
				string = result.string;
				excepts = result.excepts;
				count = result.count;

				result = this.protectRegexMatches(string, /\b(?:chatgpt(?:\s+(?:plus|pro|team|enterprise|edu|go))?|gpt(?:-[a-z0-9.]+)?|deepseek(?:[-\s][a-z0-9.]+)*|claude(?:[-\s]\d+(?:\.\d+)?)?(?:[-\s](?:haiku|sonnet|opus))?|gemini(?:[-\s]\d+(?:\.\d+)?)?(?:[-\s](?:flash|pro|ultra))?|qwen(?:[-\s]?\d+(?:\.\d+)?(?:-[a-z0-9]+)*)?|llama(?:[-\s]\d+(?:\.\d+)?)?(?:[-\s]\d+b)?|mistral(?:[-\s][a-z0-9.]+)*|mixtral(?:[-\s][a-z0-9.]+)*|grok(?:[-\s]\d+(?:\.\d+)?)?|sdxl|flux(?:\.\d+)?(?:[-\s][a-z0-9]+)*|perplexity(?:\s+sonar)?|kimi(?:\s*k\d+(?:\.\d+)?)?|doubao|hunyuan|ernie(?:[-\s][a-z0-9.]+)*|glm(?:-\d+)?(?:-[a-z0-9.]+)*|cogview(?:-\d+)?|wanx(?:[-\s][a-z0-9.]+)*|whisper|sora|dall(?:-| )?e(?:\s*\d+)?|stable[-\s]diffusion)(?=$|[^A-Za-z0-9_])/gi, excepts, count, {
					normalize: fullMatch => this.trimTrailingProtectedPunctuation(fullMatch)
				});
				return result;
			}

			protectQuotedTextSegments (string, excepts = {}, count = 0) {
				if (!this.settings.general.protectQuotedText || !string) return {string, excepts, count};
				const quotedRegex = /"([^"\r\n]+)"|“([^”\r\n]+)”/g;
				string = string.replace(quotedRegex, fullMatch => {
					if (!fullMatch || !fullMatch.slice(1, -1).trim()) return fullMatch;
					excepts[count] = fullMatch;
					return `{{${count++}}}`;
				});
				return {string, excepts, count};
			}

			protectWrappedTextSegments (string, excepts = {}, count = 0) {
				if (!this.settings.general.protectQuotedText || !string) return {string, excepts, count};
				for (let rule of this.getProtectedWrapperRules()) {
					let cursor = 0;
					let nextString = "";
					while (cursor < string.length) {
						let startIndex = string.indexOf(rule.left, cursor);
						if (startIndex < 0) {
							nextString += string.slice(cursor);
							break;
						}
						let contentStart = startIndex + rule.left.length;
						let endIndex = string.indexOf(rule.right, contentStart);
						if (endIndex < 0) {
							nextString += string.slice(cursor);
							break;
						}
						let fullText = string.slice(startIndex, endIndex + rule.right.length);
						let innerText = string.slice(contentStart, endIndex);
						nextString += string.slice(cursor, startIndex);
						if (innerText.trim() && !/[\r\n]/.test(fullText)) {
							excepts[count] = fullText;
							nextString += `{{${count++}}}`;
						}
						else nextString += fullText;
						cursor = endIndex + rule.right.length;
					}
					string = nextString;
				}
				return {string, excepts, count};
			}

			protectConfiguredTerms (string, excepts = {}, count = 0) {
				let protectedTerms = this.getProtectedTermsList();
				const boundaryChars = "A-Za-z0-9_";
				for (let term of protectedTerms) {
					const startsWithWord = new RegExp(`^[${boundaryChars}]`).test(term);
					const endsWithWord = new RegExp(`[${boundaryChars}]$`).test(term);
					const regex = new RegExp(`${startsWithWord ? `(^|[^${boundaryChars}])` : `()`}(${this.escapeRegExp(term)})${endsWithWord ? `(?=$|[^${boundaryChars}])` : ""}`, "gi");
					string = string.replace(regex, (match, leading, protectedTerm) => {
						if (!protectedTerm) return match;
						excepts[count] = protectedTerm;
						return `${leading || ""}{{${count++}}}`;
					});
				}
				return {string, excepts, count};
			}

			addExceptions (string, excepts) {
				for (let count in excepts) {
					let exception = BDFDB.ArrayUtils.is(this.settings.exceptions.wordStart) && this.settings.exceptions.wordStart.some(n => excepts[count].indexOf(n) == 0) ? excepts[count].slice(1) : excepts[count];
					let newString = string.replace(new RegExp(`[｛\{]\\s*[｛\{]\\s*${count}\\s*[｝\}]\\s*[｝\}]`), exception);
					if (newString == string) string = newString + " " + exception;
					else string = newString;
				}
				return string;
			}

			removeExceptions (string, place) {
				let emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF]+/;
				let emojiSegmentRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF]+/g;
				let excepts = {}, newString = [], count = 0;
				let codeBlockResult = this.protectCodeBlockSegments(string, excepts, count);
				string = codeBlockResult.string;
				excepts = codeBlockResult.excepts;
				count = codeBlockResult.count;
				let wrappedTextResult = this.protectWrappedTextSegments(string, excepts, count);
				string = wrappedTextResult.string;
				excepts = wrappedTextResult.excepts;
				count = wrappedTextResult.count;
				let autoProtectedResult = this.protectAutoDetectedSegments(string, excepts, count);
				string = autoProtectedResult.string;
				excepts = autoProtectedResult.excepts;
				count = autoProtectedResult.count;
				let protectedTermsResult = this.protectConfiguredTerms(string, excepts, count);
				string = protectedTermsResult.string;
				excepts = protectedTermsResult.excepts;
				count = protectedTermsResult.count;
				if (place == messageTypes.RECEIVED) {
					let text = [], i = 0;
					string.split("").forEach((chara, index, array) => { 
						if (chara == "<" && text[i] || emojiRegex.test(chara) && emojiRegex.test(array[index+1])) i++;
						text[i] = text[i] ? text[i] + chara : chara;
						if (chara == ">" || emojiRegex.test(chara) && emojiRegex.test(array[index-1])) i++;
					});
					for (let j in text) {
						if (text[j].indexOf("<") == 0 || emojiRegex.test(text[j])) {
							newString.push(`{{${count}}}`);
							excepts[count] = text[j];
							count++;
						}
						else newString.push(text[j]);
					}
				}
				else {
					string = string.replace(emojiSegmentRegex, emojiSegment => {
						excepts[count] = emojiSegment;
						return `{{${count++}}}`;
					});
					let usedExceptions = BDFDB.ArrayUtils.is(this.settings.exceptions.wordStart) ? this.settings.exceptions.wordStart : [];
					string.split(" ").forEach(word => {
						if (word.indexOf("<@!") == 0 || word.indexOf("<#") == 0 || word.indexOf(":") == 0 || word.indexOf("<:") == 0 || word.indexOf("<a:") == 0 || word.indexOf("@") == 0 || word.indexOf("#") == 0 || usedExceptions.some(n => word.indexOf(n) == 0 && word.length > 1)) {
							newString.push(`{{${count}}}`);
							excepts[count] = word;
							count++;
						}
						else newString.push(word);
					});
				}
				const maskedString = newString.join(place == messageTypes.RECEIVED ? "" : " ");
				const hasTranslatableContent = maskedString.replace(/\{\{\d+\}\}/g, "").trim().length > 0;
				return [maskedString, excepts, hasTranslatableContent];
			}

			getGoogleTranslatePageURL (input, output, text) {
				return `https://translate.google.com/#${BDFDB.LanguageUtils.languages[input] ? input : "auto"}/${output}/${encodeURIComponent(text)}`;
			}

			setLabelsByLanguage () {
				switch (this.getUiLanguageId()) {
					case "bg":		// Bulgarian
						return {
							backup_engine:						"Резервен-Преводач",
							backup_engine_warning:					"Ще използва Резервен-Преводач",
							context_messagetranslateoption:				"Превод на съобщението",
							context_messageuntranslateoption:			"Превод на съобщението",
							context_translator:					"Търсене превод",
							detect_language:					"Разпознаване на езика",
							error_dailylimit:					"Дневният лимит на заявките е достигнат.",
							error_hourlylimit:					"Почасовият лимит на заявките е достигнат.",
							error_keyoutdated:					"API-ключът е остарял.",
							error_monthlylimit:					"Месечният лимит на заявките е достигнат.",
							error_serverdown:					"Сървърът за превод може да е офлайн.",
							exception_text:						"Думите, започващи с {{var0}}, ще бъдат игнорирани",
							general_addQuickTranslateButton:			"Добавя бърз бутон за превод в лентата за действия за съобщения",
							general_addTranslateButton:				"Добавя бутон за превод към текстовото поле на канала",
							general_sendOriginalMessage:				"Също така изпраща оригиналното съобщение, когато превежда вашето изпратено съобщение",
							general_showOriginalMessage:				"Също така показва оригиналното съобщение при превод на получено съобщение",
							general_usePerChatTranslation:				"Активира/деактивира състоянието на бутона за преводач за всеки канал, а не глобално",
							language_choice_input_received:				"Език на въвеждане в получените съобщения",
							language_choice_input_sent:				"Език на въвеждане в изпратените от вас съобщения",
							language_choice_output_received:			"Изходен език в получените съобщения",
							language_choice_output_sent:				"Изходен език в изпратените ви съобщения",
							language_selection_channel:				"Изборът на език ще бъде променен специално за този канал",
							language_selection_global:				"Изборът на език ще бъде променен за всички сървъри",
							language_selection_server:				"Изборът на език ще бъде променен специално за този сървър",
							popout_translateoption:					"Превод",
							popout_untranslateoption:				"Непревод",
							prefixes_disable_text:					"Префикси, които деактивират превода на съобщението",
							prefixes_enable_text:					"Префикси, които активират превод със специфичен език (напр. $fr, $de, $jp)",
							toast_translating:					"Превод",
							toast_translating_failed:				"Преводът не бе успешен",
							toast_translating_tryanother:				"Опитайте друг преводач",
							translate_your_message:					"Преведете вашите съобщения преди изпращане",
							translated_watermark:					"преведено",
							translator_engine:					"Преводач"
						};
					case "cs":		// Czech
						return {
							backup_engine:						"Backup-Překladatel",
							backup_engine_warning:					"Použije Backup-Překladatel",
							context_messagetranslateoption:				"Přeložit zprávu",
							context_messageuntranslateoption:			"Přeložit zprávu",
							context_translator:					"Hledat Překlad",
							detect_language:					"Rozpoznat jazyk",
							error_dailylimit:					"Denní limit požadavků byl dosažen.",
							error_hourlylimit:					"Bylo dosaženo limitu hodinového požadavku.",
							error_keyoutdated:					"Klíč API je zastaralý.",
							error_monthlylimit:					"Byl dosažen limit měsíčních požadavků.",
							error_serverdown:					"Překladový server může být offline.",
							exception_text:						"Slova začínající na {{var0}} budou ignorována",
							general_addQuickTranslateButton:			"Přidá tlačítko rychlého překladu do panelu Actions Message",
							general_addTranslateButton:				"Přidá tlačítko Přeložit do textové oblasti kanálu",
							general_sendOriginalMessage:				"Při překladu odeslané zprávy také odešle původní zprávu",
							general_showOriginalMessage:				"Také zobrazuje původní zprávu při překladu přijaté zprávy",
							general_usePerChatTranslation:				"Povolí/zakáže stav tlačítka překladače pro kanál, nikoli globálně",
							language_choice_input_received:				"Vstupní jazyk do přijatých zpráv",
							language_choice_input_sent:				"Zadejte jazyk do odeslaných zpráv",
							language_choice_output_received:			"Výstupní jazyk v přijatých zprávách",
							language_choice_output_sent:				"Jazyk výstupu ve vašich odeslaných zprávách",
							language_selection_channel:				"Výběr jazyka bude změněn speciálně pro tento kanál",
							language_selection_global:				"Výběr jazyka se změní pro všechny servery",
							language_selection_server:				"Výběr jazyka bude změněn speciálně pro tento server",
							popout_translateoption:					"Přeložit",
							popout_untranslateoption:				"Nepřeložit",
							prefixes_disable_text:					"Předpony, které deaktivují překlad zprávy",
							prefixes_enable_text:					"Předpony, které aktivují překlad s konkrétním jazykem (např. $fr, $de, $jp)",
							toast_translating:					"Překládání",
							toast_translating_failed:				"Překlad se nezdařil",
							toast_translating_tryanother:				"Zkuste jiný překladač",
							translate_your_message:					"Před odesláním si zprávy přeložte",
							translated_watermark:					"přeloženo",
							translator_engine:					"Překladatel"
						};
					case "da":		// Danish
						return {
							backup_engine:						"Backup-Oversætter",
							backup_engine_warning:					"Vil bruge Backup-Oversætter",
							context_messagetranslateoption:				"Oversæt besked",
							context_messageuntranslateoption:			"Ikke-oversat besked",
							context_translator:					"Søg oversættelse",
							detect_language:					"Find sprog",
							error_dailylimit:					"Daglig anmodningsgrænse nået.",
							error_hourlylimit:					"Timegrænsen for anmodning er nået.",
							error_keyoutdated:					"API-nøgle forældet.",
							error_monthlylimit:					"Månedlig anmodningsgrænse nået.",
							error_serverdown:					"Oversættelsesserveren er muligvis offline.",
							exception_text:						"Ord, der begynder med {{var0}}, ignoreres",
							general_addQuickTranslateButton:			"Tilføjer en hurtig oversættelsesknap i linjen Message Actions",
							general_addTranslateButton:				"Tilføjer en Oversæt-knap til kanaltekstområdet",
							general_sendOriginalMessage:				"Sender også den originale besked, når du oversætter din sendte besked",
							general_showOriginalMessage:				"Viser også den originale besked, når du oversætter modtaget besked",
							general_usePerChatTranslation:				"Aktiverer/deaktiverer oversætterknappens tilstand pr. kanal og ikke globalt",
							language_choice_input_received:				"Inputsprog i modtagne beskeder",
							language_choice_input_sent:				"Indtast sprog i dine sendte beskeder",
							language_choice_output_received:			"Outputsprog i modtagne beskeder",
							language_choice_output_sent:				"Outputsprog i dine sendte beskeder",
							language_selection_channel:				"Valg af sprog vil blive ændret specifikt for denne kanal",
							language_selection_global:				"Valg af sprog vil blive ændret for alle servere",
							language_selection_server:				"Sprogvalg vil blive ændret specifikt for denne server",
							popout_translateoption:					"Oversætte",
							popout_untranslateoption:				"Untranslate",
							prefixes_disable_text:					"Præfikser, der deaktiverer oversættelse af meddelelse",
							prefixes_enable_text:					"Præfikser, der aktiverer oversættelse med specifikt sprog (f.eks. $fr, $de, $jp)",
							toast_translating:					"Oversætter",
							toast_translating_failed:				"Kunne ikke oversætte",
							toast_translating_tryanother:				"Prøv en anden oversætter",
							translate_your_message:					"Oversæt dine beskeder før afsendelse",
							translated_watermark:					"oversat",
							translator_engine:					"Oversætter"
						};
					case "de":		// German
						return {
							backup_engine:						"Backup-Übersetzer",
							backup_engine_warning:					"Wird Backup-Übersetzer verwenden",
							context_messagetranslateoption:				"Nachricht übersetzen",
							context_messageuntranslateoption:			"Nachricht unübersetzen",
							context_translator:					"Übersetzung suchen",
							detect_language:					"Sprache erkennen",
							error_dailylimit:					"Tägliches Anforderungslimit erreicht.",
							error_hourlylimit:					"Stündliches Anforderungslimit erreicht.",
							error_keyoutdated:					"API-Schlüssel veraltet.",
							error_monthlylimit:					"Monatliches Anforderungslimit erreicht.",
							error_serverdown:					"Der Übersetzungsserver ist möglicherweise offline.",
							exception_text:						"Wörter, die mit {{var0}} beginnen, werden ignoriert",
							general_addQuickTranslateButton:			"Fügt einen Schnellübersetz Schalter zur Nachrichtenaktionsleiste hinzu",
							general_addTranslateButton:				"Fügt dem Textbereich des Kanals eine Schalter zum Übersetzen hinzu",
							general_sendOriginalMessage:				"Sendet auch die ursprüngliche Nachricht, wenn die gesendete Nachricht übersetzt wird",
							general_showOriginalMessage:				"Zeigt auch die ursprüngliche Nachricht an, wenn eine empfangene Nachricht übersetzt wird",
							general_usePerChatTranslation:				"Aktiviert/deaktiviert die Übersetzung pro Kanal und nicht global",
							language_choice_input_received:				"Eingabesprache in empfangenen Nachrichten",
							language_choice_input_sent:				"Eingabesprache in gesendeten Nachrichten",
							language_choice_output_received:			"Ausgabesprache in empfangenen Nachrichten",
							language_choice_output_sent:				"Ausgabesprache in gesendeten Nachrichten",
							language_selection_channel:				"Die Sprachauswahl wird speziell für diesen Kanal geändert",
							language_selection_global:				"Die Sprachauswahl wird für alle Server geändert",
							language_selection_server:				"Die Sprachauswahl wird speziell für diesen Server geändert",
							popout_translateoption:					"Übersetzen",
							popout_untranslateoption:				"Unübersetzen",
							prefixes_disable_text:					"Präfixe, die die Übersetzung der Nachricht deaktivieren",
							prefixes_enable_text:					"Präfixe, die die Übersetzung mit einer bestimmten Sprache aktivieren (z.B. $fr, $de, $jp)",
							toast_translating:					"Übersetzen",
							toast_translating_failed:				"Übersetzung fehlgeschlagen",
							toast_translating_tryanother:				"Versuch einen anderen Übersetzer",
							translate_your_message:					"Übersetzt Nachrichten vor dem Senden",
							translated_watermark:					"übersetzt",
							translator_engine:					"Übersetzer"
						};
					case "el":		// Greek
						return {
							backup_engine:						"Μεταφράστης-Αντίγραφο ασφαλείας",
							backup_engine_warning:					"Θα χρησιμοποιηθεί Μεταφράστης-Αντίγραφο ασφαλείας",
							context_messagetranslateoption:				"Μετάφραση μηνύματος",
							context_messageuntranslateoption:			"Αναίρεση μετάφρασης μηνύματος",
							context_translator:					"Αναζήτηση μετάφρασης",
							detect_language:					"Εντοπισμός γλώσσας",
							error_dailylimit:					"Συμπληρώθηκε το ημερήσιο όριο αιτημάτων.",
							error_hourlylimit:					"Συμπληρώθηκε το ωριαίο όριο αιτημάτων.",
							error_keyoutdated:					"Το κλειδί API δεν είναι ενημερωμένο.",
							error_monthlylimit:					"Συμπληρώθηκε το μηνιαίο όριο αιτημάτων.",
							error_serverdown:					"Ο διακομιστής μετάφρασης ενδέχεται να είναι εκτός σύνδεσης.",
							exception_text:						"Οι λέξεις θα αγνοηθούν που ξεκινούν με {{var0}}",
							general_addQuickTranslateButton:			"Προσθέτει ένα κουμπί γρήγορης μετάφρασης στη γραμμή ενεργειών μηνυμάτων",
							general_addTranslateButton:				"Προσθήκη κουμπιού μετάφρασης στην Περιοχή κειμένου του Καναλιού",
							general_sendOriginalMessage:				"Αποστολή αρχικού Μηνύματος με τη μετάφραση απεσταλμένου μηνύματος",
							general_showOriginalMessage:				"Εμφάνιση αρχικού Μηνύματος με τη μετάφραση ενός ληφθέντος μηνύματος",
							general_usePerChatTranslation:				"(Απ)Ενεργοποίηση κατάστασης κουμπιού μεταφραστή ανά κανάλι",
							language_choice_input_received:				"Γλώσσα εισαγωγής στα ληφθέντα μηνύματα",
							language_choice_input_sent:				"Γλώσσα εισαγωγής στα απεσταλμένα μηνύματά σας",
							language_choice_output_received:			"Γλώσσα εξαγωγής στα ληφθέντα μηνύματα",
							language_choice_output_sent:				"Γλώσσα εξαγωγής στα απεσταλμένα μηνύματά σας",
							language_selection_channel:				"Η επιλογή γλώσσας θα αλλάξει ειδικά για αυτό το κανάλι",
							language_selection_global:				"Η Επιλογή Γλώσσας θα αλλάξει για όλους τους Διακομιστές",
							language_selection_server:				"Η επιλογή γλώσσας θα αλλάξει ειδικά για αυτόν τον διακομιστή",
							popout_translateoption:					"Μετάφραση",
							popout_untranslateoption:				"Αναίρεση μετάφρασης",
							prefixes_disable_text:					"Προθέσεις που απενεργοποιούν την μετάφραση του μηνύματος",
							prefixes_enable_text:					"Προθέσεις που ενεργοποιούν την μετάφραση με συγκεκριμένη γλώσσα (π.χ. $fr, $de, $jp)",
							toast_translating:					"Μετάφραση",
							toast_translating_failed:				"Αποτυχία μετάφρασης",
							toast_translating_tryanother:				"Δοκιμάστε έναν άλλο Μεταφραστή",
							translate_your_message:					"Μεταφράστε τα Μηνύματά σας πριν την αποστολή",
							translated_watermark:					"μεταφρασμένο",
							translator_engine:					"Μεταφράστης"
						};
					case "es":		// Spanish
						return {
							backup_engine:						"Backup-Traductor",
							backup_engine_warning:					"Utilizará Backup-Traductor",
							context_messagetranslateoption:				"Traducir mensaje",
							context_messageuntranslateoption:			"Mensaje sin traducir",
							context_translator:					"Buscar traducción",
							detect_language:					"Detectar idioma",
							error_dailylimit:					"Se alcanzó el límite de solicitudes diarias.",
							error_hourlylimit:					"Se alcanzó el límite de solicitudes por hora.",
							error_keyoutdated:					"API-Key obsoleta.",
							error_monthlylimit:					"Se alcanzó el límite de solicitudes mensuales.",
							error_serverdown:					"El servidor de traducción puede estar fuera de línea.",
							exception_text:						"Las palabras que comienzan con {{var0}} serán ignoradas",
							general_addQuickTranslateButton:			"Agrega un botón de traducción rápida en la barra de acciones del mensaje",
							general_addTranslateButton:				"Agrega un botón de traducción al área de texto del canal",
							general_sendOriginalMessage:				"También envía el mensaje original al traducir su mensaje enviado",
							general_showOriginalMessage:				"También muestra el mensaje original al traducir un mensaje recibido",
							general_usePerChatTranslation:				"Habilita/deshabilita el estado del botón del traductor por canal y no globalmente",
							language_choice_input_received:				"Idioma de entrada en los mensajes recibidos",
							language_choice_input_sent:				"Idioma de entrada en sus mensajes enviados",
							language_choice_output_received:			"Idioma de salida en los mensajes recibidos",
							language_choice_output_sent:				"Idioma de salida en sus mensajes enviados",
							language_selection_channel:				"La selección de idioma se cambiará específicamente para este canal",
							language_selection_global:				"La selección de idioma se cambiará para todos los servidores",
							language_selection_server:				"La selección de idioma se cambiará específicamente para este servidor",
							popout_translateoption:					"Traducir",
							popout_untranslateoption:				"No traducir",
							prefixes_disable_text:					"Prefijos que desactivan la traducción del mensaje",
							prefixes_enable_text:					"Prefijos que activan la traducción con un idioma específico (por ejemplo, $fr, $de, $jp)",
							toast_translating:					"Traductorio",
							toast_translating_failed:				"No se pudo traducir",
							toast_translating_tryanother:				"Prueba con otro traductor",
							translate_your_message:					"Traduce tus mensajes antes de enviarlos",
							translated_watermark:					"traducido",
							translator_engine:					"Traductor"
						};
					case "es-419":		// Spanish (Latin America)
						return {
							backup_engine:						"Traspaso de respaldo",
							backup_engine_warning:					"Utilizará el traductor de respaldo",
							context_messagetranslateoption:				"Mensaje de traducir",
							context_messageuntranslateoption:			"Mensaje no traducido",
							context_translator:					"Traducción de búsqueda",
							detect_language:					"Detectar lenguaje",
							error_dailylimit:					"Límite de solicitud diaria alcanzado.",
							error_hourlylimit:					"Límite de solicitud por hora alcanzado.",
							error_keyoutdated:					"Api-key anticuado.",
							error_monthlylimit:					"Límite de solicitud mensual alcanzado.",
							error_serverdown:					"El servidor de traducción puede estar fuera de línea.",
							exception_text:						"Las palabras que comienzan con {{var0}} se ignorarán",
							general_addQuickTranslateButton:			"Agrega un botón de traducción rápida en la barra de acciones del mensaje",
							general_addTranslateButton:				"Agrega un botón de traducción al canal TextAREA",
							general_sendOriginalMessage:				"También envía el mensaje original al traducir su mensaje enviado",
							general_showOriginalMessage:				"También muestra el mensaje original al traducir un mensaje recibido",
							general_usePerChatTranslation:				"Habilita/deshabilita el estado del botón de traductor por canal y no a nivel mundial",
							language_choice_input_received:				"Idioma de entrada en mensajes recibidos",
							language_choice_input_sent:				"Idioma de entrada en sus mensajes enviados",
							language_choice_output_received:			"Lenguaje de salida en mensajes recibidos",
							language_choice_output_sent:				"Lenguaje de salida en sus mensajes enviados",
							language_selection_channel:				"La selección del idioma se cambiará específicamente para este canal",
							language_selection_global:				"La selección del idioma se cambiará para todos los servidores",
							language_selection_server:				"La selección del idioma se cambiará específicamente para este servidor",
							popout_translateoption:					"Traducir",
							popout_untranslateoption:				"No traducido",
							prefixes_disable_text:					"Prefijos que deshabilitan la traducción del mensaje",
							prefixes_enable_text:					"Prefijos que habilitan la traducción con un lenguaje específico (por ejemplo, $fr, $de, $jp)",
							toast_translating:					"Traductorio",
							toast_translating_failed:				"No se pudo traducir",
							toast_translating_tryanother:				"Prueba otro traductor",
							translate_your_message:					"Traducir sus mensajes antes de enviar",
							translated_watermark:					"traducido",
							translator_engine:					"Traductor"
						};
					case "fi":		// Finnish
						return {
							backup_engine:						"Backup-Kääntäjä",
							backup_engine_warning:					"Käyttää Backup-Kääntäjä",
							context_messagetranslateoption:				"Käännä viesti",
							context_messageuntranslateoption:			"Käännä viesti",
							context_translator:					"Hae käännöstä",
							detect_language:					"Tunnista kieli",
							error_dailylimit:					"Päivittäinen pyyntöraja saavutettu.",
							error_hourlylimit:					"Tuntikohtainen pyyntöraja saavutettu.",
							error_keyoutdated:					"API-avain vanhentunut.",
							error_monthlylimit:					"Kuukauden pyyntöraja saavutettu.",
							error_serverdown:					"Käännöspalvelin saattaa olla offline-tilassa.",
							exception_text:						"{{var0}} alkavat sanat ohitetaan",
							general_addQuickTranslateButton:			"Lisää nopea käännöspainike Message Action -palkkiin",
							general_addTranslateButton:				"Lisää käännöspainikkeen kanavan tekstialueeseen",
							general_sendOriginalMessage:				"Lähettää myös alkuperäisen viestin kääntäessään lähettämääsi viestiä",
							general_showOriginalMessage:				"Näyttää myös alkuperäisen viestin käännettäessä vastaanotettua viestiä",
							general_usePerChatTranslation:				"Ottaa käyttöön/poistaa käytöstä kääntäjän painikkeen tilan kanavakohtaisesti, ei maailmanlaajuisesti",
							language_choice_input_received:				"Syöttökieli vastaanotetuissa viesteissä",
							language_choice_input_sent:				"Syötä kieli lähettämiisi viesteihin",
							language_choice_output_received:			"Tulostuskieli vastaanotetuissa viesteissä",
							language_choice_output_sent:				"Lähetyskieli lähetetyissä viesteissä",
							language_selection_channel:				"Kielen valintaa muutetaan erityisesti tätä kanavaa varten",
							language_selection_global:				"Kielen valintaa muutetaan kaikille palvelimille",
							language_selection_server:				"Kielen valintaa muutetaan erityisesti tätä palvelinta varten",
							popout_translateoption:					"Kääntää",
							popout_untranslateoption:				"Käännä",
							prefixes_disable_text:					"Etuliitteet, jotka poistavat viestin käännöksen käytöstä",
							prefixes_enable_text:					"Etuliitteet, jotka mahdollistavat käännöksen tietyllä kielellä (esim. $fr, $de, $jp)",
							toast_translating:					"Kääntäminen",
							toast_translating_failed:				"Käännös epäonnistui",
							toast_translating_tryanother:				"Kokeile toista kääntäjää",
							translate_your_message:					"Käännä viestisi ennen lähettämistä",
							translated_watermark:					"käännetty",
							translator_engine:					"Kääntäjä"
						};
					case "fr":		// French
						return {
							backup_engine:						"Backup-Traducteur",
							backup_engine_warning:					"Utilisera Backup-Traducteur",
							context_messagetranslateoption:				"Traduire le message",
							context_messageuntranslateoption:			"Message non traduit",
							context_translator:					"Recherche de traduction",
							detect_language:					"Détecter la langue",
							error_dailylimit:					"Limite quotidienne de requêtes atteinte.",
							error_hourlylimit:					"Limite horaire de demandes atteinte.",
							error_keyoutdated:					"Clé API obsolète.",
							error_monthlylimit:					"Limite mensuelle de demandes atteinte.",
							error_serverdown:					"Le serveur de traduction est peut-être hors ligne.",
							exception_text:						"Les mots commençant par {{var0}} seront ignorés",
							general_addQuickTranslateButton:			"Ajoute un bouton de traduire rapidement dans la barre des actions du message",
							general_addTranslateButton:				"Ajoute un bouton de traduction à la zone de texte du canal",
							general_sendOriginalMessage:				"Envoie également le message d'origine lors de la traduction de votre message envoyé",
							general_showOriginalMessage:				"Affiche également le message d'origine lors de la traduction d'un message reçu",
							general_usePerChatTranslation:				"Active/désactive l'état du bouton du traducteur par canal et non globalement",
							language_choice_input_received:				"Langue d'entrée dans les messages reçus",
							language_choice_input_sent:				"Langue d'entrée dans vos messages envoyés",
							language_choice_output_received:			"Langue de sortie dans les messages reçus",
							language_choice_output_sent:				"Langue de sortie dans vos messages envoyés",
							language_selection_channel:				"La sélection de la langue sera modifiée spécifiquement pour ce canal",
							language_selection_global:				"La sélection de la langue sera modifiée pour tous les serveurs",
							language_selection_server:				"La sélection de la langue sera modifiée spécifiquement pour ce serveur",
							popout_translateoption:					"Traduire",
							popout_untranslateoption:				"Non traduit",
							prefixes_disable_text:					"Préfixes qui désactivent la traduction du message",
							prefixes_enable_text:					"Préfixes qui activent la traduction avec un langage spécifique (par exemple, $fr, $de, $jp)",
							toast_translating:					"Traduction en cours",
							toast_translating_failed:				"Échec de la traduction",
							toast_translating_tryanother:				"Essayez un autre traducteur",
							translate_your_message:					"Traduisez vos messages avant de les envoyer",
							translated_watermark:					"traduit",
							translator_engine:					"Traducteur"
						};
					case "hi":		// Hindi
						return {
							backup_engine:						"बैकअप-अनुवादक",
							backup_engine_warning:					"बैकअप-अनुवादक का उपयोग करेंगे",
							context_messagetranslateoption:				"संदेश का अनुवाद करें",
							context_messageuntranslateoption:			"संदेश का अनुवाद न करें",
							context_translator:					"अनुवाद खोजें",
							detect_language:					"भाषा की जांच करो",
							error_dailylimit:					"दैनिक अनुरोध सीमा पूरी हो गई है।",
							error_hourlylimit:					"घंटे के अनुरोध की सीमा पूरी हो गई है.",
							error_keyoutdated:					"एपीआई-कुंजी पुरानी हो चुकी है।",
							error_monthlylimit:					"मासिक अनुरोध सीमा पूरी हो गई है।",
							error_serverdown:					"अनुवाद सर्वर ऑफ़लाइन हो सकता है।",
							exception_text:						"{{var0}} से शुरू होने वाले शब्दों पर ध्यान नहीं दिया जाएगा",
							general_addQuickTranslateButton:			"संदेश कार्रवाई बार में एक त्वरित अनुवाद बटन जोड़ता है",
							general_addTranslateButton:				"चैनल Textarea में एक अनुवाद बटन जोड़ता है",
							general_sendOriginalMessage:				"आपके भेजे गए संदेश का अनुवाद करते समय मूल संदेश भी भेजता है",
							general_showOriginalMessage:				"प्राप्त संदेश का अनुवाद करते समय मूल संदेश भी दिखाता है",
							general_usePerChatTranslation:				"प्रति चैनल अनुवादक बटन स्थिति को सक्षम/अक्षम करता है और विश्व स्तर पर नहीं",
							language_choice_input_received:				"प्राप्त संदेशों में इनपुट भाषा",
							language_choice_input_sent:				"आपके भेजे गए संदेशों में इनपुट भाषा",
							language_choice_output_received:			"प्राप्त संदेशों में आउटपुट भाषा",
							language_choice_output_sent:				"आपके भेजे गए संदेशों में आउटपुट भाषा",
							language_selection_channel:				"इस चैनल के लिए भाषा चयन विशेष रूप से बदला जाएगा",
							language_selection_global:				"सभी सर्वरों के लिए भाषा चयन बदल दिया जाएगा",
							language_selection_server:				"इस सर्वर के लिए भाषा चयन विशेष रूप से बदल दिया जाएगा",
							popout_translateoption:					"अनुवाद करना",
							popout_untranslateoption:				"अनुवाद न करें",
							prefixes_disable_text:					"उपसर्ग जो संदेश के अनुवाद को अक्षम करते हैं",
							prefixes_enable_text:					"उपसर्ग जो विशिष्ट भाषा के साथ अनुवाद को सक्षम करते हैं (जैसे $fr, $de, $jp)",
							toast_translating:					"अनुवाद",
							toast_translating_failed:				"अनुवाद करने में विफल",
							toast_translating_tryanother:				"दूसरे अनुवादक का प्रयास करें",
							translate_your_message:					"भेजने से पहले अपने संदेशों का अनुवाद करें",
							translated_watermark:					"अनुवाद",
							translator_engine:					"अनुवादक"
						};
					case "hr":		// Croatian
						return {
							backup_engine:						"Rezervni-Prevoditelj",
							backup_engine_warning:					"Koristit će se Rezervni-Prevoditelj",
							context_messagetranslateoption:				"Prevedi poruku",
							context_messageuntranslateoption:			"Prevedi poruku",
							context_translator:					"Pretraži prijevod",
							detect_language:					"Prepoznaj jezik",
							error_dailylimit:					"Dosegnuto je dnevno ograničenje zahtjeva.",
							error_hourlylimit:					"Dosegnuto je ograničenje zahtjeva po satu.",
							error_keyoutdated:					"API-ključ zastario.",
							error_monthlylimit:					"Dosegnuto je mjesečno ograničenje zahtjeva.",
							error_serverdown:					"Translation Server možda je offline.",
							exception_text:						"Riječi koje počinju s {{var0}} bit će zanemarene",
							general_addQuickTranslateButton:			"Dodaje gumb za brzo prevođenje u traku Akcija poruka",
							general_addTranslateButton:				"Dodaje gumb Prevedi tekstualnom području kanala",
							general_sendOriginalMessage:				"Također šalje izvornu poruku prilikom prijevoda vaše poslane poruke",
							general_showOriginalMessage:				"Također prikazuje izvornu poruku prilikom prijevoda primljene poruke",
							general_usePerChatTranslation:				"Omogućuje/onemogućuje stanje gumba prevoditelja po kanalu, a ne globalno",
							language_choice_input_received:				"Jezik unosa u primljenim porukama",
							language_choice_input_sent:				"Jezik unosa u vaše poslane poruke",
							language_choice_output_received:			"Izlazni jezik u primljenim porukama",
							language_choice_output_sent:				"Izlazni jezik u vašim poslanim porukama",
							language_selection_channel:				"Odabir jezika bit će promijenjen posebno za ovaj kanal",
							language_selection_global:				"Odabir jezika bit će promijenjen za sve poslužitelje",
							language_selection_server:				"Odabir jezika bit će promijenjen posebno za ovaj poslužitelj",
							popout_translateoption:					"Prevedi",
							popout_untranslateoption:				"Neprevedi",
							prefixes_disable_text:					"Prefiksi koji onemogućuju prijevod poruke",
							prefixes_enable_text:					"Prefiksi koji omogućuju prijevod određenim jezikom (npr. $fr, $de, $jp)",
							toast_translating:					"Prevođenje",
							toast_translating_failed:				"Prijevod nije uspio",
							toast_translating_tryanother:				"Pokušajte s drugim prevoditeljem",
							translate_your_message:					"Prevedite svoje poruke prije slanja",
							translated_watermark:					"prevedeno",
							translator_engine:					"Prevoditelj"
						};
					case "hu":		// Hungarian
						return {
							backup_engine:						"Backup-Fordító",
							backup_engine_warning:					"A Backup-Fordító programot fogja használni",
							context_messagetranslateoption:				"Üzenet lefordítása",
							context_messageuntranslateoption:			"Az üzenet lefordítása",
							context_translator:					"Keresés a fordításban",
							detect_language:					"Nyelvfelismerés",
							error_dailylimit:					"Elérte a napi igénylési korlátot.",
							error_hourlylimit:					"Elérte az óránkénti igénylési korlátot.",
							error_keyoutdated:					"API-kulcs elavult.",
							error_monthlylimit:					"Elérte a havi igénylési limitet.",
							error_serverdown:					"Lehet, hogy a Fordítószerver offline állapotban van.",
							exception_text:						"A(z) {{var0}} kezdetű szavak figyelmen kívül maradnak",
							general_addQuickTranslateButton:			"Hozzáad egy gyors lefordítást a Művelet Művelet sávban",
							general_addTranslateButton:				"Fordítási gombot ad a csatorna szövegterületéhez",
							general_sendOriginalMessage:				"Az eredeti üzenetet is elküldi az elküldött üzenet fordítása során",
							general_showOriginalMessage:				"A fogadott üzenet lefordításakor az eredeti üzenetet is megjeleníti",
							general_usePerChatTranslation:				"Engedélyezi/letiltja a Fordító gomb állapotát csatornánként, nem pedig globálisan",
							language_choice_input_received:				"Beviteli nyelv a fogadott üzenetekben",
							language_choice_input_sent:				"Írja be a nyelvet az elküldött üzenetekben",
							language_choice_output_received:			"Kimeneti nyelv a fogadott üzenetekben",
							language_choice_output_sent:				"Kimeneti nyelv az elküldött üzenetekben",
							language_selection_channel:				"A nyelvválasztás kifejezetten ehhez a csatornához fog módosulni",
							language_selection_global:				"A nyelv kiválasztása minden szerveren módosul",
							language_selection_server:				"A nyelvválasztás kifejezetten ehhez a szerverhez módosul",
							popout_translateoption:					"fordít",
							popout_untranslateoption:				"Fordítás le",
							prefixes_disable_text:					"Az üzenet fordítását letiltó előtagok",
							prefixes_enable_text:					"Előtagok, amelyek lehetővé teszik a fordítás meghatározott nyelvvel (például $fr, $de, $jp)",
							toast_translating:					"Fordítás",
							toast_translating_failed:				"Nem sikerült lefordítani",
							toast_translating_tryanother:				"Próbálkozzon másik fordítóval",
							translate_your_message:					"Küldés előtt fordítsa le az üzeneteit",
							translated_watermark:					"lefordított",
							translator_engine:					"Fordító"
						};
					case "it":		// Italian
						return {
							backup_engine:						"Backup-Traduttore",
							backup_engine_warning:					"Utilizzerà Backup-Traduttore",
							context_messagetranslateoption:				"Traduci messaggio",
							context_messageuntranslateoption:			"Annulla traduzione messaggio",
							context_translator:					"Cerca traduzione",
							detect_language:					"Rileva lingua",
							error_dailylimit:					"Limite di richieste giornaliere raggiunto.",
							error_hourlylimit:					"Limite di richiesta oraria raggiunto.",
							error_keyoutdated:					"Chiave API obsoleta.",
							error_monthlylimit:					"Limite di richieste mensili raggiunto.",
							error_serverdown:					"Il server di traduzione potrebbe essere offline.",
							exception_text:						"Le parole che iniziano con {{var0}} verranno ignorate",
							general_addQuickTranslateButton:			"Aggiunge un pulsante di traduzione rapida nella barra delle azioni del messaggio",
							general_addTranslateButton:				"Aggiunge un pulsante Traduci all'area di testo del canale",
							general_sendOriginalMessage:				"Invia anche il messaggio originale durante la traduzione del messaggio inviato",
							general_showOriginalMessage:				"Mostra anche il messaggio originale durante la traduzione di un messaggio ricevuto",
							general_usePerChatTranslation:				"Abilita/disabilita lo stato del pulsante Translator per canale e non globalmente",
							language_choice_input_received:				"Lingua di input nei messaggi ricevuti",
							language_choice_input_sent:				"Inserisci la lingua nei tuoi messaggi inviati",
							language_choice_output_received:			"Lingua di output nei messaggi ricevuti",
							language_choice_output_sent:				"Lingua di output nei messaggi inviati",
							language_selection_channel:				"La selezione della lingua verrà modificata in modo specifico per questo canale",
							language_selection_global:				"La selezione della lingua verrà modificata per tutti i server",
							language_selection_server:				"La selezione della lingua verrà modificata in modo specifico per questo server",
							popout_translateoption:					"Tradurre",
							popout_untranslateoption:				"Non tradurre",
							prefixes_disable_text:					"Parole che iniziano con {{var0}} verranno ignorate",
							prefixes_enable_text:					"Parole che attivano la traduzione con un linguaggio specifico (ad esempio, $fr, $de, $jp)",
							toast_translating:					"Tradurre",
							toast_translating_failed:				"Impossibile tradurre",
							toast_translating_tryanother:				"Prova un altro traduttore",
							translate_your_message:					"Traduci i tuoi messaggi prima di inviarli",
							translated_watermark:					"tradotto",
							translator_engine:					"Traduttore"
						};
					case "ja":		// Japanese
						return {
							backup_engine:						"バックアップ翻訳者",
							backup_engine_warning:					"バックアップ翻訳者 を使用します",
							context_messagetranslateoption:				"メッセージの翻訳",
							context_messageuntranslateoption:			"メッセージの翻訳解除",
							context_translator:					"翻訳を検索",
							detect_language:					"言語を検出",
							error_dailylimit:					"1 日のリクエスト上限に達しました。",
							error_hourlylimit:					"1 時間あたりのリクエスト制限に達しました。",
							error_keyoutdated:					"API キーが古くなっています。",
							error_monthlylimit:					"月間リクエスト制限に達しました。",
							error_serverdown:					"翻訳サーバーがオフラインになっている可能性があります。",
							exception_text:						"{{var0}} で始まる単語は無視されます",
							general_addQuickTranslateButton:			"メッセージアクションバーにクイック翻訳ボタンを追加します",
							general_addTranslateButton:				"チャンネルのテキストエリアに翻訳ボタンを追加します",
							general_sendOriginalMessage:				"送信したメッセージを翻訳するときに元のメッセージも送信します",
							general_showOriginalMessage:				"受信したメッセージを翻訳するときに元のメッセージも表示します",
							general_usePerChatTranslation:				"グローバルではなく、チャネルごとに翻訳者ボタンの状態を有効/無効にします",
							language_choice_input_received:				"受信メッセージの入力言語",
							language_choice_input_sent:				"送信メッセージの入力言語",
							language_choice_output_received:			"受信メッセージの出力言語",
							language_choice_output_sent:				"送信メッセージの出力言語",
							language_selection_channel:				"言語の選択は、このチャンネル専用に変更されます",
							language_selection_global:				"すべてのサーバーの言語選択が変更されます",
							language_selection_server:				"言語の選択は、このサーバー専用に変更されます",
							popout_translateoption:					"翻訳する",
							popout_untranslateoption:				"翻訳しない",
							prefixes_disable_text:					"メッセージの翻訳を無効にするプレフィックス",
							prefixes_enable_text:					"特定の言語で翻訳を可能にするプレフィックス（例：$fr, $de, $jp）",
							toast_translating:					"翻訳",
							toast_translating_failed:				"翻訳に失敗しました",
							toast_translating_tryanother:				"別の翻訳者を試す",
							translate_your_message:					"送信する前にメッセージを翻訳する",
							translated_watermark:					"翻訳済み",
							translator_engine:					"翻訳者"
						};
					case "ko":		// Korean
						return {
							backup_engine:						"백업 번역기",
							backup_engine_warning:					"백업 번역기를 사용합니다",
							context_messagetranslateoption:				"메시지 번역",
							context_messageuntranslateoption:			"메시지 번역 취소",
							context_translator:					"번역 검색",
							detect_language:					"언어를 감지",
							error_dailylimit:					"일일 요청 한도에 도달했습니다.",
							error_hourlylimit:					"시간당 요청 한도에 도달했습니다.",
							error_keyoutdated:					"API 키가 오래되었습니다.",
							error_monthlylimit:					"월간 요청 한도에 도달했습니다.",
							error_serverdown:					"번역 서버가 오프라인일 수 있습니다.",
							exception_text:						"{{var0}}로 시작하는 단어는 무시됩니다.",
							general_addQuickTranslateButton:			"메시지 동작 막대에서 빠른 번역 버튼 추가",
							general_addTranslateButton:				"채널 텍스트 영역에 번역 버튼 추가",
							general_sendOriginalMessage:				"또한 보낸 메시지를 번역할 때 원본 메시지를 보냅니다.",
							general_showOriginalMessage:				"또한 수신된 메시지를 번역할 때 원본 메시지를 표시합니다.",
							general_usePerChatTranslation:				"전역이 아닌 채널별로 번역기 버튼 상태를 활성화/비활성화합니다.",
							language_choice_input_received:				"수신된 메시지의 입력 언어",
							language_choice_input_sent:				"보낸 메시지의 입력 언어",
							language_choice_output_received:			"수신된 메시지의 출력 언어",
							language_choice_output_sent:				"보낸 메시지의 출력 언어",
							language_selection_channel:				"이 채널에 대해 특별히 언어 선택이 변경됩니다.",
							language_selection_global:				"모든 서버에 대해 언어 선택이 변경됩니다.",
							language_selection_server:				"이 서버에 대해 특별히 언어 선택이 변경됩니다.",
							popout_translateoption:					"옮기다",
							popout_untranslateoption:				"번역 취소",
							prefixes_disable_text:					"메시지 변환을 비활성화하는 접두사",
							prefixes_enable_text:					"특정 언어로 변환을 가능하게하는 접두사 (예: $fr, $de, $jp)",
							toast_translating:					"번역 중",
							toast_translating_failed:				"번역하지 못했습니다.",
							toast_translating_tryanother:				"다른 번역기 시도",
							translate_your_message:					"보내기 전에 메시지 번역",
							translated_watermark:					"번역",
							translator_engine:					"역자"
						};
					case "lt":		// Lithuanian
						return {
							backup_engine:						"Backup-Vertėjas",
							backup_engine_warning:					"Naudos Backup-Vertėjas",
							context_messagetranslateoption:				"Versti pranešimą",
							context_messageuntranslateoption:			"Išversti pranešimą",
							context_translator:					"Paieškos vertimas",
							detect_language:					"Aptikti kalbą",
							error_dailylimit:					"Pasiektas dienos užklausų limitas.",
							error_hourlylimit:					"Pasiektas valandinių užklausų limitas.",
							error_keyoutdated:					"API raktas pasenęs.",
							error_monthlylimit:					"Pasiektas mėnesio užklausų limitas.",
							error_serverdown:					"Vertimo serveris gali būti neprisijungęs.",
							exception_text:						"Žodžiai, prasidedantys {{var0}}, bus ignoruojami",
							general_addQuickTranslateButton:			"Prideda greito vertimo mygtuką pranešimo veiksmų juostoje",
							general_addTranslateButton:				"Prie kanalo teksto srities pridedamas vertimo mygtukas",
							general_sendOriginalMessage:				"Taip pat siunčia originalų pranešimą verčiant jūsų išsiųstą žinutę",
							general_showOriginalMessage:				"Taip pat rodomas pradinis pranešimas, kai verčiamas gautas pranešimas",
							general_usePerChatTranslation:				"Įjungia / išjungia Vertėjo mygtuko būseną kiekvienam kanalui, o ne visame pasaulyje",
							language_choice_input_received:				"Įvesties kalba gautuose pranešimuose",
							language_choice_input_sent:				"Įveskite kalbą siunčiamuose pranešimuose",
							language_choice_output_received:			"Išvesties kalba gautuose pranešimuose",
							language_choice_output_sent:				"Išvesties kalba jūsų išsiųstuose pranešimuose",
							language_selection_channel:				"Kalbos pasirinkimas bus pakeistas specialiai šiam kanalui",
							language_selection_global:				"Kalbos pasirinkimas bus pakeistas visiems serveriams",
							language_selection_server:				"Kalbos pasirinkimas bus pakeistas specialiai šiam serveriui",
							popout_translateoption:					"Išversti",
							popout_untranslateoption:				"Neišversti",
							prefixes_disable_text:					"Priešdėliai, kurie išjungia pranešimo vertimą",
							prefixes_enable_text:					"Priešdėliai, įgalinantys vertimą su konkrečia kalba (pvz., $fr, $de, $jp)",
							toast_translating:					"Vertimas",
							toast_translating_failed:				"Nepavyko išversti",
							toast_translating_tryanother:				"Išbandykite kitą vertėją",
							translate_your_message:					"Prieš siųsdami išverskite savo pranešimus",
							translated_watermark:					"išverstas",
							translator_engine:					"Vertėjas"
						};
					case "nl":		// Dutch
						return {
							backup_engine:						"Backup-Vertaler",
							backup_engine_warning:					"Zal Backup-Vertaler gebruiken",
							context_messagetranslateoption:				"Bericht vertalen",
							context_messageuntranslateoption:			"Bericht onvertalen",
							context_translator:					"Zoek vertaling",
							detect_language:					"Taal detecteren",
							error_dailylimit:					"Dagelijkse verzoeklimiet bereikt.",
							error_hourlylimit:					"Verzoeklimiet per uur bereikt.",
							error_keyoutdated:					"API-sleutel verouderd.",
							error_monthlylimit:					"Maandelijkse aanvraaglimiet bereikt.",
							error_serverdown:					"Vertaalserver is mogelijk offline.",
							exception_text:						"Woorden die beginnen met {{var0}} worden genegeerd",
							general_addQuickTranslateButton:			"Voegt een snel vertalende knop toe in de Bericht Acties Bar",
							general_addTranslateButton:				"Voegt een vertaalknop toe aan het kanaaltekstgebied",
							general_sendOriginalMessage:				"Verzendt ook het originele bericht bij het vertalen van uw verzonden bericht",
							general_showOriginalMessage:				"Toont ook het originele bericht bij het vertalen van een ontvangen bericht",
							general_usePerChatTranslation:				"Schakelt de status van de vertaalknop in/uit per kanaal en niet globaal",
							language_choice_input_received:				"Invoertaal in ontvangen berichten",
							language_choice_input_sent:				"Invoertaal in uw verzonden berichten",
							language_choice_output_received:			"Uitvoertaal in ontvangen berichten",
							language_choice_output_sent:				"Uitvoertaal in uw verzonden berichten",
							language_selection_channel:				"De taalselectie wordt specifiek voor dit kanaal gewijzigd",
							language_selection_global:				"Taalkeuze wordt voor alle servers gewijzigd",
							language_selection_server:				"Taalselectie wordt specifiek voor deze server gewijzigd",
							popout_translateoption:					"Vertalen",
							popout_untranslateoption:				"Onvertalen",
							prefixes_disable_text:					"Voorvoegsels die de vertaling van het bericht uitschakelen",
							prefixes_enable_text:					"Voorvoegsels die vertaling mogelijk maken met specifieke taal (bijv. $fr, $de, $jp)",
							toast_translating:					"Vertalen",
							toast_translating_failed:				"Kan niet vertalen",
							toast_translating_tryanother:				"Probeer een andere vertaler",
							translate_your_message:					"Vertaal uw berichten voordat u ze verzendt",
							translated_watermark:					"vertaald",
							translator_engine:					"Vertaler"
						};
					case "no":		// Norwegian
						return {
							backup_engine:						"Backup-Oversetter",
							backup_engine_warning:					"Vil bruke Backup-Oversetter",
							context_messagetranslateoption:				"Oversett melding",
							context_messageuntranslateoption:			"Ikke oversett melding",
							context_translator:					"Søk i oversettelse",
							detect_language:					"Oppdage språk",
							error_dailylimit:					"Daglig forespørselsgrense nådd.",
							error_hourlylimit:					"Forespørselsgrensen for time nådd.",
							error_keyoutdated:					"API-nøkkel utdatert.",
							error_monthlylimit:					"Månedlig forespørselsgrense nådd.",
							error_serverdown:					"Oversettelsesserveren kan være frakoblet.",
							exception_text:						"Ord som begynner med {{var0}} vil bli ignorert",
							general_addQuickTranslateButton:			"Legger til en rask oversettelsesknapp i meldingslinjen",
							general_addTranslateButton:				"Legger til en oversettknapp til kanaltekstområdet",
							general_sendOriginalMessage:				"Sender også den originale meldingen når du oversetter den sendte meldingen",
							general_showOriginalMessage:				"Viser også den originale meldingen når du oversetter en mottatt melding",
							general_usePerChatTranslation:				"Aktiverer/deaktiverer oversetterknappens tilstand per kanal og ikke globalt",
							language_choice_input_received:				"Inndataspråk i mottatte meldinger",
							language_choice_input_sent:				"Inntastingsspråk i sendte meldinger",
							language_choice_output_received:			"Utdataspråk i mottatte meldinger",
							language_choice_output_sent:				"Utdataspråk i dine sendte meldinger",
							language_selection_channel:				"Språkvalg vil bli endret spesifikt for denne kanalen",
							language_selection_global:				"Språkvalg vil bli endret for alle servere",
							language_selection_server:				"Språkvalg vil bli endret spesifikt for denne serveren",
							popout_translateoption:					"Oversette",
							popout_untranslateoption:				"Ikke oversett",
							prefixes_disable_text:					"Prefikser som deaktiverer oversettelse av meldingen",
							prefixes_enable_text:					"Prefikser som muliggjør oversettelse med spesifikt språk (f.eks. $fr, $de, $jp)",
							toast_translating:					"Oversetter",
							toast_translating_failed:				"Kunne ikke oversette",
							toast_translating_tryanother:				"Prøv en annen oversetter",
							translate_your_message:					"Oversett meldingene dine før sending",
							translated_watermark:					"oversatt",
							translator_engine:					"Oversetter"
						};
					case "pl":		// Polish
						return {
							backup_engine:						"Backup-Tłumacz",
							backup_engine_warning:					"Użyje Backup-Tłumacz",
							context_messagetranslateoption:				"Przetłumacz wiadomość",
							context_messageuntranslateoption:			"Nieprzetłumacz wiadomość",
							context_translator:					"Wyszukaj tłumaczenie",
							detect_language:					"Wykryj język",
							error_dailylimit:					"Osiągnięto dzienny limit żądań.",
							error_hourlylimit:					"Osiągnięto godzinowy limit żądań.",
							error_keyoutdated:					"Klucz API jest nieaktualny.",
							error_monthlylimit:					"Osiągnięto miesięczny limit żądań.",
							error_serverdown:					"Serwer tłumaczeń może być w trybie offline.",
							exception_text:						"Słowa zaczynające się od {{var0}} będą ignorowane",
							general_addQuickTranslateButton:			"Dodaje szybki przycisk Tłumacz na pasku akcji wiadomości",
							general_addTranslateButton:				"Dodaje przycisk Tłumacz do obszaru tekstowego kanału",
							general_sendOriginalMessage:				"Wysyła również oryginalną wiadomość podczas tłumaczenia wysłanej wiadomości",
							general_showOriginalMessage:				"Pokazuje również oryginalną wiadomość podczas tłumaczenia otrzymanej wiadomości",
							general_usePerChatTranslation:				"Włącza/wyłącza stan przycisku translatora na kanał, a nie globalnie",
							language_choice_input_received:				"Język wprowadzania w odebranych wiadomościach",
							language_choice_input_sent:				"Język wprowadzania w wysyłanych wiadomościach",
							language_choice_output_received:			"Język wyjściowy w odebranych wiadomościach",
							language_choice_output_sent:				"Język wyjściowy w wysłanych wiadomościach",
							language_selection_channel:				"Wybór języka zostanie zmieniony specjalnie dla tego kanału",
							language_selection_global:				"Wybór języka zostanie zmieniony dla wszystkich serwerów",
							language_selection_server:				"Wybór języka zostanie zmieniony specjalnie dla tego serwera",
							popout_translateoption:					"Tłumaczyć",
							popout_untranslateoption:				"Nie przetłumacz",
							prefixes_disable_text:					"Słowa zaczynające się od {{var0}} będą ignorowane",
							prefixes_enable_text:					"Słowa, które aktywują tłumaczenie na określony język (np. $fr, $de, $jp)",
							toast_translating:					"Tłumaczenie",
							toast_translating_failed:				"Nie udało się przetłumaczyć",
							toast_translating_tryanother:				"Wypróbuj innego tłumacza",
							translate_your_message:					"Przetłumacz swoje wiadomości przed wysłaniem",
							translated_watermark:					"przetłumaczony",
							translator_engine:					"Tłumacz"
						};
					case "pt-BR":		// Portuguese (Brazil)
						return {
							backup_engine:						"Backup-Tradutor",
							backup_engine_warning:					"Usará o Backup-Tradutor",
							context_messagetranslateoption:				"Traduzir mensagem",
							context_messageuntranslateoption:			"Mensagem não traduzida",
							context_translator:					"Tradução de pesquisa",
							detect_language:					"Detectar idioma",
							error_dailylimit:					"Limite de solicitações diárias atingido.",
							error_hourlylimit:					"Limite de solicitação por hora atingido.",
							error_keyoutdated:					"Chave de API desatualizada.",
							error_monthlylimit:					"Limite de solicitação mensal atingido.",
							error_serverdown:					"O servidor de tradução pode estar offline.",
							exception_text:						"Palavras que começam com {{var0}} serão ignoradas",
							general_addQuickTranslateButton:			"Adiciona um botão de tradução rápida na barra de ações da mensagem",
							general_addTranslateButton:				"Adiciona um botão de tradução à área de texto do canal",
							general_sendOriginalMessage:				"Também envia a Mensagem original ao traduzir sua Mensagem enviada",
							general_showOriginalMessage:				"Também mostra a Mensagem original ao traduzir uma Mensagem recebida",
							general_usePerChatTranslation:				"Habilita/desabilita o estado do botão do tradutor por canal e não globalmente",
							language_choice_input_received:				"Idioma de entrada nas mensagens recebidas",
							language_choice_input_sent:				"Idioma de entrada em suas mensagens enviadas",
							language_choice_output_received:			"Idioma de saída nas mensagens recebidas",
							language_choice_output_sent:				"Idioma de saída em suas mensagens enviadas",
							language_selection_channel:				"A seleção de idioma será alterada especificamente para este canal",
							language_selection_global:				"A seleção de idioma será alterada para todos os servidores",
							language_selection_server:				"A seleção de idioma será alterada especificamente para este servidor",
							popout_translateoption:					"Traduzir",
							popout_untranslateoption:				"Não traduzido",
							prefixes_disable_text:					"Prefixos que desativam a tradução da mensagem",
							prefixes_enable_text:					"Prefixos que permitem a tradução com linguagem específica (por exemplo, $fr, $de, $jp)",
							toast_translating:					"Traduzindo",
							toast_translating_failed:				"Falha ao traduzir",
							toast_translating_tryanother:				"Tente outro tradutor",
							translate_your_message:					"Traduza suas mensagens antes de enviar",
							translated_watermark:					"traduzido",
							translator_engine:					"Tradutor"
						};
					case "ro":		// Romanian
						return {
							backup_engine:						"Backup-Traducător",
							backup_engine_warning:					"Va folosi Backup-Traducător",
							context_messagetranslateoption:				"Traduceți mesajul",
							context_messageuntranslateoption:			"Untraduceți mesajul",
							context_translator:					"Căutare traducere",
							detect_language:					"Detecteaza limba",
							error_dailylimit:					"Limita zilnică de solicitare a fost atinsă.",
							error_hourlylimit:					"Limita orară de solicitare a fost atinsă.",
							error_keyoutdated:					"API-Key este învechită.",
							error_monthlylimit:					"Limita lunară de solicitare a fost atinsă.",
							error_serverdown:					"Serverul de traducere ar putea fi offline.",
							exception_text:						"Cuvintele care încep cu {{var0}} vor fi ignorate",
							general_addQuickTranslateButton:			"Adaugă un buton de traducere rapidă în bara de acțiuni de mesaje",
							general_addTranslateButton:				"Adaugă un buton de traducere în zona de text a canalului",
							general_sendOriginalMessage:				"De asemenea, trimite mesajul original atunci când traduceți mesajul trimis",
							general_showOriginalMessage:				"Afișează, de asemenea, mesajul original atunci când traduceți un mesaj primit",
							general_usePerChatTranslation:				"Activează/dezactivează starea butonului de traducător pe canal și nu la nivel global",
							language_choice_input_received:				"Limba de intrare în mesajele primite",
							language_choice_input_sent:				"Introduceți limba în mesajele trimise",
							language_choice_output_received:			"Limba de ieșire în mesajele primite",
							language_choice_output_sent:				"Limba de ieșire în mesajele trimise",
							language_selection_channel:				"Selectarea limbii va fi modificată special pentru acest canal",
							language_selection_global:				"Selectarea limbii va fi modificată pentru toate serverele",
							language_selection_server:				"Selectarea limbii va fi modificată special pentru acest Server",
							popout_translateoption:					"Traduceți",
							popout_untranslateoption:				"Netradus",
							prefixes_disable_text:					"Prefixele care dezactivează traducerea mesajului",
							prefixes_enable_text:					"Prefixele care permit traducerea cu un limbaj specific (de exemplu, $fr, $de, $jp)",
							toast_translating:					"Traducere",
							toast_translating_failed:				"Nu s-a putut traduce",
							toast_translating_tryanother:				"Încercați un alt traducător",
							translate_your_message:					"Traduceți mesajele înainte de a le trimite",
							translated_watermark:					"tradus",
							translator_engine:					"Traducător"
						};
					case "ru":		// Russian
						return {
							backup_engine:						"Резервный-Переводчик",
							backup_engine_warning:					"Буду использовать Резервный-Переводчик",
							context_messagetranslateoption:				"Перевести сообщение",
							context_messageuntranslateoption:			"Непереведенное сообщение",
							context_translator:					"Искать перевод",
							detect_language:					"Определить язык",
							error_dailylimit:					"Достигнут дневной лимит запросов.",
							error_hourlylimit:					"Достигнут лимит почасовых запросов.",
							error_keyoutdated:					"API-ключ устарел.",
							error_monthlylimit:					"Достигнут месячный лимит запросов.",
							error_serverdown:					"Сервер переводов может быть отключен.",
							exception_text:						"Слова, начинающиеся с {{var0}}, будут игнорироваться.",
							general_addQuickTranslateButton:			"Добавляет кнопку быстрого перевода в панель действий сообщений",
							general_addTranslateButton:				"Добавляет кнопку перевода в текстовую область канала",
							general_sendOriginalMessage:				"Также отправляет исходное сообщение при переводе отправленного сообщения.",
							general_showOriginalMessage:				"Также показывает исходное сообщение при переводе полученного сообщения.",
							general_usePerChatTranslation:				"Включает/отключает состояние кнопки переводчика для каждого канала, а не глобально",
							language_choice_input_received:				"Язык ввода в полученных сообщениях",
							language_choice_input_sent:				"Язык ввода в ваших отправленных сообщениях",
							language_choice_output_received:			"Язык вывода в полученных сообщениях",
							language_choice_output_sent:				"Язык вывода в ваших отправленных сообщениях",
							language_selection_channel:				"Выбор языка будет изменен специально для этого канала.",
							language_selection_global:				"Выбор языка будет изменен для всех серверов.",
							language_selection_server:				"Выбор языка будет изменен специально для этого сервера",
							popout_translateoption:					"Переведите",
							popout_untranslateoption:				"Неперевести",
							prefixes_disable_text:					"Префиксы, которые отключают перевод сообщения",
							prefixes_enable_text:					"Префиксы, которые обеспечивают перевод с конкретным языком (например, $fr, $de, $jp)",
							toast_translating:					"Идет перевод",
							toast_translating_failed:				"Не удалось перевести",
							toast_translating_tryanother:				"Попробуйте другой переводчик",
							translate_your_message:					"Переводите свои сообщения перед отправкой",
							translated_watermark:					"переведено",
							translator_engine:					"Переводчик"
						};
					case "sv":		// Swedish
						return {
							backup_engine:						"Backup-Översättare",
							backup_engine_warning:					"Kommer att använda Backup-Översättare",
							context_messagetranslateoption:				"Översätt meddelande",
							context_messageuntranslateoption:			"Untranslate meddelande",
							context_translator:					"Sök översättning",
							detect_language:					"Upptäck språk",
							error_dailylimit:					"Daglig förfrågningsgräns nådd.",
							error_hourlylimit:					"Begäran per timme nådd.",
							error_keyoutdated:					"API-nyckel föråldrad.",
							error_monthlylimit:					"Gränsen för månatlig begäran har nåtts.",
							error_serverdown:					"Översättningsservern kan vara offline.",
							exception_text:						"Ord som börjar med {{var0}} kommer att ignoreras",
							general_addQuickTranslateButton:			"Lägger till en snabb translate -knapp i meddelanden om meddelanden om meddelanden om meddelanden",
							general_addTranslateButton:				"Lägger till en Översätt-knapp i kanaltextområdet",
							general_sendOriginalMessage:				"Skickar också det ursprungliga meddelandet när du översätter ditt skickade meddelande",
							general_showOriginalMessage:				"Visar även det ursprungliga meddelandet när ett mottaget meddelande översätts",
							general_usePerChatTranslation:				"Aktiverar/inaktiverar översättarknappens status per kanal och inte globalt",
							language_choice_input_received:				"Inmatningsspråk i mottagna meddelanden",
							language_choice_input_sent:				"Inmatningsspråk i dina skickade meddelanden",
							language_choice_output_received:			"Utmatningsspråk i mottagna meddelanden",
							language_choice_output_sent:				"Utmatningsspråk i dina skickade meddelanden",
							language_selection_channel:				"Språkval kommer att ändras specifikt för denna kanal",
							language_selection_global:				"Språkval kommer att ändras för alla servrar",
							language_selection_server:				"Språkval kommer att ändras specifikt för denna server",
							popout_translateoption:					"Översätt",
							popout_untranslateoption:				"Untranslate",
							prefixes_disable_text:					"Prefix som inaktiverar översättning av meddelandet",
							prefixes_enable_text:					"Prefix som möjliggör översättning med specifikt språk (t.ex. $fr, $de, $jp)",
							toast_translating:					"Översätter",
							toast_translating_failed:				"Det gick inte att översätta",
							toast_translating_tryanother:				"Prova en annan översättare",
							translate_your_message:					"Översätt dina meddelanden innan du skickar",
							translated_watermark:					"översatt",
							translator_engine:					"Översättare"
						};
					case "th":		// Thai
						return {
							backup_engine:						"สำรอง-นักแปล",
							backup_engine_warning:					"จะใช้การสำรองข้อมูล-นักแปล",
							context_messagetranslateoption:				"แปลข้อความ",
							context_messageuntranslateoption:			"ยกเลิกการแปลข้อความ",
							context_translator:					"ค้นหาคำแปล",
							detect_language:					"ตรวจจับภาษา",
							error_dailylimit:					"ถึงขีดจำกัดคำขอรายวันแล้ว",
							error_hourlylimit:					"ถึงขีดจำกัดคำขอรายชั่วโมงแล้ว",
							error_keyoutdated:					"API-Key ล้าสมัยแล้ว",
							error_monthlylimit:					"ถึงขีดจำกัดคำขอรายเดือนแล้ว",
							error_serverdown:					"เซิร์ฟเวอร์การแปลอาจออฟไลน์อยู่",
							exception_text:						"คำที่ขึ้นต้นด้วย {{var0}} จะถูกละเว้น",
							general_addQuickTranslateButton:			"เพิ่มปุ่มแปลอย่างรวดเร็วในแถบการกระทำข้อความ",
							general_addTranslateButton:				"เพิ่มปุ่มแปลภาษาไปยัง Textarea ของช่อง",
							general_sendOriginalMessage:				"ส่งข้อความต้นฉบับเมื่อแปลข้อความที่ส่งของคุณ",
							general_showOriginalMessage:				"ยังแสดงข้อความต้นฉบับเมื่อแปลข้อความที่ได้รับ",
							general_usePerChatTranslation:				"เปิด/ปิดสถานะปุ่มนักแปลต่อช่องและไม่ใช่ทั่วโลก",
							language_choice_input_received:				"ป้อนภาษาในข้อความที่ได้รับ",
							language_choice_input_sent:				"ป้อนภาษาในข้อความที่คุณส่ง",
							language_choice_output_received:			"ภาษาเอาต์พุตในข้อความที่ได้รับ",
							language_choice_output_sent:				"ภาษาที่ส่งออกในข้อความที่ส่งของคุณ",
							language_selection_channel:				"การเลือกภาษาจะมีการเปลี่ยนแปลงเฉพาะสำหรับช่องนี้",
							language_selection_global:				"การเลือกภาษาจะมีการเปลี่ยนแปลงสำหรับเซิร์ฟเวอร์ทั้งหมด",
							language_selection_server:				"การเลือกภาษาจะมีการเปลี่ยนแปลงโดยเฉพาะสำหรับเซิร์ฟเวอร์นี้",
							popout_translateoption:					"แปลภาษา",
							popout_untranslateoption:				"ไม่แปล",
							prefixes_disable_text:					"คำนำหน้าการปิดใช้งานการแปลข้อความ",
							prefixes_enable_text:					"คำนำหน้าที่เปิดใช้งานการแปลด้วยภาษาที่เฉพาะเจาะจง (เช่น $fr, $de, $jp)",
							toast_translating:					"กำลังแปล",
							toast_translating_failed:				"แปลไม่สำเร็จ",
							toast_translating_tryanother:				"ลองใช้นักแปลคนอื่น",
							translate_your_message:					"แปลข้อความของคุณก่อนส่ง",
							translated_watermark:					"แปล",
							translator_engine:					"นักแปล"
						};
					case "tr":		// Turkish
						return {
							backup_engine:						"Yedekleme-Çevirmen",
							backup_engine_warning:					"Yedekleme-Çevirmen kullanacak",
							context_messagetranslateoption:				"Mesajı Çevir",
							context_messageuntranslateoption:			"Çeviriyi Kaldır Mesajı",
							context_translator:					"Çeviri ara",
							detect_language:					"Dili Algıla",
							error_dailylimit:					"Günlük İstek Sınırına ulaşıldı.",
							error_hourlylimit:					"Saatlik İstek Sınırına ulaşıldı.",
							error_keyoutdated:					"API Anahtarı güncel değil.",
							error_monthlylimit:					"Aylık İstek Sınırına ulaşıldı.",
							error_serverdown:					"Çeviri Sunucusu çevrimdışı olabilir.",
							exception_text:						"{{var0}} ile başlayan kelimeler yok sayılacak",
							general_addQuickTranslateButton:			"Mesaj Eylemleri çubuğuna hızlı bir çeviri düğmesi ekler",
							general_addTranslateButton:				"Kanal Metin Alanına Çevir Düğmesi Ekler",
							general_sendOriginalMessage:				"Gönderilen Mesajınızı çevirirken orijinal Mesajı da gönderir",
							general_showOriginalMessage:				"Alınan bir Mesajı tercüme ederken orijinal Mesajı da gösterir.",
							general_usePerChatTranslation:				"Genel olarak değil, Kanal başına Çevirmen Düğmesi Durumunu Etkinleştirir/Devre Dışı Bırakır",
							language_choice_input_received:				"Alınan Mesajlarda Giriş Dili",
							language_choice_input_sent:				"Gönderilen Mesajlarınızda Dil Girin",
							language_choice_output_received:			"Alınan Mesajlarda Çıktı Dili",
							language_choice_output_sent:				"Gönderilen Mesajlarınızda Çıktı Dili",
							language_selection_channel:				"Dil Seçimi bu Kanal için özel olarak değiştirilecektir.",
							language_selection_global:				"Tüm Sunucular için Dil Seçimi değiştirilecek",
							language_selection_server:				"Dil Seçimi bu Sunucuya özel olarak değiştirilecektir.",
							popout_translateoption:					"Çevirmek",
							popout_untranslateoption:				"Çevirmeyi kaldır",
							prefixes_disable_text:					"Mesajın çevirisini devre dışı bırakan önekler",
							prefixes_enable_text:					"Belirli bir dille çeviriyi etkinleştiren önekler (örn. $fr, $de, $jp)",
							toast_translating:					"Çeviri",
							toast_translating_failed:				"Tercüme edilemedi",
							toast_translating_tryanother:				"Başka bir Çevirmen deneyin",
							translate_your_message:					"Göndermeden önce Mesajlarınızı çevirin",
							translated_watermark:					"tercüme",
							translator_engine:					"Çevirmen"
						};
					case "uk":		// Ukrainian
						return {
							backup_engine:						"Резервний-перекладач",
							backup_engine_warning:					"Використовуватиме Резервний-Перекладач",
							context_messagetranslateoption:				"Перекласти повідомлення",
							context_messageuntranslateoption:			"Неперекладене повідомлення",
							context_translator:					"Пошук перекладу",
							detect_language:					"Визначити мову",
							error_dailylimit:					"Денний ліміт запитів досягнуто.",
							error_hourlylimit:					"Досягнуто погодинного ліміту запитів.",
							error_keyoutdated:					"API-ключ застарів.",
							error_monthlylimit:					"Досягнуто місячного ліміту запитів.",
							error_serverdown:					"Сервер перекладу може бути офлайн.",
							exception_text:						"Слова, що починаються з {{var0}}, ігноруватимуться",
							general_addQuickTranslateButton:			"Додає кнопку швидкого перекладу в панелі дій Message",
							general_addTranslateButton:				"Додає кнопку перекладу до текстової області каналу",
							general_sendOriginalMessage:				"Також надсилає оригінальне повідомлення під час перекладу вашого надісланого повідомлення",
							general_showOriginalMessage:				"Також показує оригінальне повідомлення під час перекладу отриманого повідомлення",
							general_usePerChatTranslation:				"Вмикає/вимикає стан кнопки перекладача для кожного каналу, а не глобально",
							language_choice_input_received:				"Мова введення в отриманих повідомленнях",
							language_choice_input_sent:				"Мова введення у ваших надісланих повідомленнях",
							language_choice_output_received:			"Мова виводу в отриманих повідомленнях",
							language_choice_output_sent:				"Мова виведення у ваших надісланих повідомленнях",
							language_selection_channel:				"Вибір мови буде змінено спеціально для цього каналу",
							language_selection_global:				"Вибір мови буде змінено для всіх серверів",
							language_selection_server:				"Вибір мови буде змінено спеціально для цього сервера",
							popout_translateoption:					"Перекласти",
							popout_untranslateoption:				"Неперекласти",
							prefixes_disable_text:					"Префікси, що відключають переклад повідомлення",
							prefixes_enable_text:					"Префікси, що дозволяють перекладати з конкретною мовою (наприклад, $fr, $de, $jp)",
							toast_translating:					"Переклад",
							toast_translating_failed:				"Не вдалося перекласти",
							toast_translating_tryanother:				"Спробуйте іншого перекладача",
							translate_your_message:					"Перекладіть свої повідомлення перед надсиланням",
							translated_watermark:					"переклав",
							translator_engine:					"Перекладач"
						};
					case "vi":		// Vietnamese
						return {
							backup_engine:						"Backup-Gười phiên dịch",
							backup_engine_warning:					"Sẽ sử dụng Backup-Gười phiên dịch",
							context_messagetranslateoption:				"Dịch tin nhắn",
							context_messageuntranslateoption:			"Thư chưa dịch",
							context_translator:					"Tìm kiếm bản dịch",
							detect_language:					"Phát hiện ngôn ngữ",
							error_dailylimit:					"Đã đạt đến Giới hạn Yêu cầu Hàng ngày.",
							error_hourlylimit:					"Đã đạt đến Giới hạn Yêu cầu Hàng giờ.",
							error_keyoutdated:					"API-Key đã lỗi thời.",
							error_monthlylimit:					"Đã đạt đến Giới hạn Yêu cầu Hàng tháng.",
							error_serverdown:					"Máy chủ dịch có thể ngoại tuyến.",
							exception_text:						"Các từ bắt đầu bằng {{var0}} sẽ bị bỏ qua",
							general_addQuickTranslateButton:			"Thêm nút dịch nhanh vào thanh hành động tin nhắn",
							general_addTranslateButton:				"Thêm nút dịch vào vùng văn bản của kênh",
							general_sendOriginalMessage:				"Đồng thời gửi Tin nhắn gốc khi dịch Tin nhắn đã gửi của bạn",
							general_showOriginalMessage:				"Đồng thời hiển thị Tin nhắn gốc khi dịch một Tin nhắn đã nhận",
							general_usePerChatTranslation:				"Bật / tắt Trạng thái nút dịch trên mỗi kênh và không bật trên toàn cầu",
							language_choice_input_received:				"Nhập Ngôn ngữ trong Tin nhắn đã nhận",
							language_choice_input_sent:				"Nhập Ngôn ngữ trong Tin nhắn đã gửi của bạn",
							language_choice_output_received:			"Ngôn ngữ đầu ra trong Tin nhắn đã nhận",
							language_choice_output_sent:				"Ngôn ngữ đầu ra trong Tin nhắn đã gửi của bạn",
							language_selection_channel:				"Lựa chọn ngôn ngữ sẽ được thay đổi cụ thể cho Kênh này",
							language_selection_global:				"Lựa chọn ngôn ngữ sẽ được thay đổi cho tất cả các Máy chủ",
							language_selection_server:				"Lựa chọn ngôn ngữ sẽ được thay đổi cụ thể cho Máy chủ này",
							popout_translateoption:					"Phiên dịch",
							popout_untranslateoption:				"Chưa dịch",
							prefixes_disable_text:					"Tiền tố vô hiệu hóa dịch tin nhắn",
							prefixes_enable_text:					"Tiền tố cho phép dịch với ngôn ngữ cụ thể (ví dụ: $fr, $de, $jp)",
							toast_translating:					"Phiên dịch",
							toast_translating_failed:				"Không dịch được",
							toast_translating_tryanother:				"Thử một Trình dịch khác",
							translate_your_message:					"Dịch Tin nhắn của bạn trước khi gửi",
							translated_watermark:					"đã dịch",
							translator_engine:					"Người phiên dịch"
						};
					case "zh-CN":		// Chinese (China)
						return {
							backup_engine:						"备份翻译器",
							backup_engine_warning:					"将使用备份翻译器",
							context_messagetranslateoption:				"翻译消息",
							context_messageuntranslateoption:			"取消翻译消息",
							context_translator:					"搜索翻译",
							detect_language:					"检测语言",
							error_dailylimit:					"已达到每日请求限制。",
							error_hourlylimit:					"已达到每小时请求限制。",
							error_keyoutdated:					"API 密钥已过时。",
							error_monthlylimit:					"已达到每月请求限制。",
							error_serverdown:					"翻译服务器可能离线。",
							exception_text:						"以 {{var0}} 开头的单词将被忽略",
							general_addQuickTranslateButton:			"在消息操作栏中添加一个快速翻译按钮",
							general_addTranslateButton:				"将翻译按钮添加到频道文本区域",
							general_sendOriginalMessage:				"翻译您发送的消息时也会发送原始消息",
							general_showOriginalMessage:				"翻译收到的消息时还显示原始消息",
							general_usePerChatTranslation:				"启用/禁用每个通道而不是全局的转换器按钮状态",
							language_choice_input_received:				"收到消息中的输入语言",
							language_choice_input_sent:				"在您发送的消息中输入语言",
							language_choice_output_received:			"接收消息中的输出语言",
							language_choice_output_sent:				"您发送的消息中的输出语言",
							language_selection_channel:				"将专门为此频道更改语言选择",
							language_selection_global:				"将更改所有服务器的语言选择",
							language_selection_server:				"语言选择将专门为此服务器更改",
							popout_translateoption:					"翻译",
							popout_untranslateoption:				"取消翻译",
							prefixes_disable_text:					"禁用消息翻译的前缀",
							prefixes_enable_text:					"用特定语言启用翻译的前缀（例如 $fr, $de, $jp）",
							toast_translating:					"正在翻译",
							toast_translating_failed:				"翻译失败",
							toast_translating_tryanother:				"尝试其它翻译器",
							translate_your_message:					"发送前翻译您的消息",
							translated_watermark:					"已翻译",
							translator_engine:					"译者"
						};
					case "zh-TW":		// Chinese (Taiwan)
						return {
							backup_engine:						"備份翻譯器",
							backup_engine_warning:					"將使用備份翻譯器",
							context_messagetranslateoption:				"翻譯訊息",
							context_messageuntranslateoption:			"取消翻譯訊息",
							context_translator:					"搜尋翻譯",
							detect_language:					"檢測語言",
							error_dailylimit:					"已達到每日請求限制。",
							error_hourlylimit:					"已達到每小時請求限制。",
							error_keyoutdated:					"API 密鑰已過時。",
							error_monthlylimit:					"已達到每月請求限制。",
							error_serverdown:					"翻譯服務器可能離線。",
							exception_text:						"以 {{var0}} 開頭的單詞將被忽略",
							general_addQuickTranslateButton:			"在消息操作欄中添加一個快速翻譯按鈕",
							general_addTranslateButton:				"將翻譯按鈕添加到頻道文本區域",
							general_sendOriginalMessage:				"翻譯您發送的消息時也會發送原始消息",
							general_showOriginalMessage:				"翻譯收到的消息時還顯示原始消息",
							general_usePerChatTranslation:				"啟用/禁用每個通道而不是全局的轉換器按鈕狀態",
							language_choice_input_received:				"收到消息中的輸入語言",
							language_choice_input_sent:				"在您發送的消息中輸入語言",
							language_choice_output_received:			"接收消息中的輸出語言",
							language_choice_output_sent:				"您發送的消息中的輸出語言",
							language_selection_channel:				"將專門為此頻道更改語言選擇",
							language_selection_global:				"將更改所有服務器的語言選擇",
							language_selection_server:				"語言選擇將專門為此服務器更改",
							popout_translateoption:					"翻譯",
							popout_untranslateoption:				"取消翻譯",
							prefixes_disable_text:					"禁用消息翻译的前缀",
							prefixes_enable_text:					"用特定语言启用翻译的前缀（例如 $fr, $de, $jp）",
							toast_translating:					"正在翻譯",
							toast_translating_failed:				"無法翻譯",
							toast_translating_tryanother:				"嘗試其它翻譯器",
							translate_your_message:					"發送前翻譯您的消息",
							translated_watermark:					"已翻譯",
							translator_engine:					"譯者"
						};
					default:		// English
						return {
							backup_engine:						"Backup-Translator",
							backup_engine_warning:					"Will use Backup-Translator",
							context_messagetranslateoption:				"Translate Message",
							context_messageuntranslateoption:			"Untranslate Message",
							context_translator:					"Search Translation",
							detect_language:					"Detect Language",
							error_dailylimit:					"Daily Request Limit reached.",
							error_hourlylimit:					"Hourly Request Limit reached.",
							error_keyoutdated:					"API-Key outdated.",
							error_monthlylimit:					"Monthly Request Limit reached.",
							error_serverdown:					"Translation Server might be offline.",
							exception_text:						"Words starting with {{var0}} will be ignored",
							general_addQuickTranslateButton:			"Adds a Quick Translate Button in the Message Actions Bar",
							general_addTranslateButton:				"Adds a Translate Button to the Channel Textarea",
							general_sendOriginalMessage:				"Also sends the original Message when translating your sent Message",
							general_showOriginalMessage:				"Also shows the original Message when translating a received Message",
							general_usePerChatTranslation:				"Enables/Disables the Translator Button State per Channel and not globally",
							language_choice_input_received:				"Input Language in received Messages",
							language_choice_input_sent:				"Input Language in your sent Messages",
							language_choice_output_received:			"Output Language in received Messages",
							language_choice_output_sent:				"Output Language in your sent Messages",
							language_selection_channel:				"Language Selection will be changed specifically for this Channel",
							language_selection_global:				"Language Selection will be changed for all Servers",
							language_selection_server:				"Language Selection will be changed specifically for this Server",
							popout_translateoption:					"Translate",
							popout_untranslateoption:				"Untranslate",
							prefixes_disable_text:					"Prefixes that disable translation of message",
							prefixes_enable_text:					"Prefixes that enable translation with specific language (e.g. $fr, $de, $jp)",
							toast_translating:					"Translating",
							toast_translating_failed:				"Failed to translate",
							toast_translating_tryanother:				"Try another Translator",
							translate_your_message:					"Translate your Messages before sending",
							translated_watermark:					"translated",
							translator_engine:					"Translator"
						};
				}
			}
		};
	})(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
