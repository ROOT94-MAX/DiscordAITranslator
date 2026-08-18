// The manual/live translation pipeline: translateMessage (one message end-to-end -
// untranslate toggle, skip policy, cache hit, provider request, display commit) and
// translateText (protection, language resolution, special cases, engine dispatch
// with backup failover, AI-decision safety net, toast/watchdog lifecycle).
// Extracted textually from the legacy runtime in display-unification slice 4: every
// collaborator call routes through the plugin so policy methods keep their existing
// seams and test stubs keep intercepting. The composition-root rewrite (slice 5)
// may narrow these dependencies; this slice only moves ownership.
const {translationEngines} = require("../providers/provider-client");
const {parseStoredEmbedTranslations} = require("../received/embed-translation-parser");

function createTranslationPipeline({BDFDB, getPlugin, messageTypes, languageTypes}) {
	function translateMessage(message, channel, options = {}) {
		const plugin = getPlugin();
		return new Promise(callback => {
			let liveRequest = options.auto ? options.liveRequest || null : null;
			let manualRequestKey = null;
			let manualRequest = null;
			const finish = result => {
				if (liveRequest) plugin.finishLiveTranslationRequest(liveRequest);
				plugin.ensureSentTranslationStore().releaseManualRequest(manualRequestKey, manualRequest);
				callback(result);
			};
			if (!message) return finish(null);
			const channelId = channel && channel.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
			const isManualTranslation = !!options.manual || !options.auto;
			if (isManualTranslation) manualRequestKey = plugin.ensureSentTranslationStore().createManualRequestKey(channelId, message.id);
			const activeTranslation = plugin.getActiveMessageTranslation(message, channelId);
			const storeDisplayView = !activeTranslation && plugin.getReceivedDisplayRuntimeView(message.id);
			const storeTranslated = !!(storeDisplayView && storeDisplayView.translated && storeDisplayView.origin === "automatic");
			if (isManualTranslation && !activeTranslation && !storeTranslated && plugin.ensureSentTranslationStore().hasManualRequest(manualRequestKey)) return finish(false);
			if (isManualTranslation) plugin.lockManualTranslationScroll(message.id);
			if (activeTranslation || storeTranslated) {
				// Untranslate. The display store owns the translation, so the restore is what
				// produces the cancelled terminal state with its reason and repaints the
				// original; clearing first would return the record to idle and leave the
				// restore with nothing to do.
				if (options.auto) return finish(false);
				plugin.ensureReceivedDisplayRuntime().suppress(message.id);
				plugin.restoreReceivedDisplayMessage(message.id).then(_ => {
					plugin.ensureReceivedDisplayRuntime().clearPreview(message.id);
					finish(false);
				}, _ => finish(false));
			}
			else {
				if (options.auto && !plugin.isTranslationEnabled(channelId)) return finish(false);
				const rerenderOptions = {
					batched: options.auto || options.silent,
					allowWhileTyping: !!options.auto
				};
				const originalContentData = options.originalContentData || plugin.extractOriginalContentData(message, {ignoreReferencedPreview: isManualTranslation});
				if (!plugin.hasTranslatableMessageContent(originalContentData)) return finish(false);
				if (plugin.shouldSkipReceivedTranslationBeforeRequest(originalContentData, channelId)) {
					const skipReason = plugin.getReceivedAutoTranslateSkipReason(originalContentData, channelId) || "same_language";
					const skipSignature = plugin.createReceivedTranslationSignature(message, channelId, originalContentData);
					plugin.persistReceivedSkipDecision(message.id, skipSignature, skipReason, plugin.buildTranslationRequestText(originalContentData));
					if (options.auto) {
						plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, channelId, {
							sourceSignature: skipSignature,
							requestIdentity: liveRequest ? String(liveRequest.id) : null,
							status: "skipped",
							reason: skipReason
						}), {refresh: false}).then(_ => finish(false), _ => finish(false));
						return;
					}
					return finish(false);
				}
				const signature = plugin.createReceivedTranslationSignature(message, channelId, originalContentData);
				if (options.auto && !liveRequest) liveRequest = plugin.createLiveTranslationRequest(message, channelId, originalContentData, signature);
				if (options.auto && !plugin.isLiveTranslationRequestCurrent(liveRequest, message)) return finish(false);
				const cachedTranslation = plugin.getCachedReceivedTranslation(message, channelId, originalContentData);
				if (cachedTranslation) {
					const storedCachedTranslation = Object.assign({}, cachedTranslation, {
						channelId,
						auto: !!options.auto,
						manual: isManualTranslation,
						independentOfTextAreaSwitch: !!options.independentOfTextAreaSwitch
					});
					if (options.auto) {
						plugin.refreshTranslationDisplay(storedCachedTranslation);
						plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, channelId, {
							sourceSignature: storedCachedTranslation.signature != null ? String(storedCachedTranslation.signature) : signature,
							requestIdentity: liveRequest ? String(liveRequest.id) : null,
							status: "translated",
							translation: storedCachedTranslation
						}), {refresh: false}).then(outcome => {
							if (outcome && outcome.deferredIds && outcome.deferredIds.length) plugin.scheduleReceivedDisplayFlush(channelId, message.id);
							finish(true);
						}, _ => finish(false));
						return;
					}
					plugin.applyStoredTranslationToMessage(message, storedCachedTranslation, originalContentData);
					plugin.scheduleTranslationRerender(rerenderOptions);
					return finish(true);
				}
				const allTextsToTranslate = plugin.buildTranslationRequestText(originalContentData);
				message.embeds.forEach(embed => embed.message_id = message.id);
				if (isManualTranslation) manualRequest = plugin.ensureSentTranslationStore().beginManualRequest(manualRequestKey);
				try {
					plugin.translateText(allTextsToTranslate, messageTypes.RECEIVED, (translation, input, output, meta = {}) => {
						try {
							if (options.auto && !plugin.isLiveTranslationRequestCurrent(liveRequest, message)) return finish(false);
							if (isManualTranslation && !plugin.ensureSentTranslationStore().isManualRequestCurrent(manualRequestKey, manualRequest)) return finish(false);
							if (translation) {
								let strings = translation.split(/\n{0,1}__________________ __________________ __________________\n{0,1}/);
								let oldContent = (originalContentData.content || "").trim();
								let translatedContent = (strings.shift() || "").trim();
								let content = plugin.buildReceivedDisplayContent(translatedContent, oldContent);
								const embeds = parseStoredEmbedTranslations({messageEmbeds: message.embeds, originalEmbeds: originalContentData.embeds, segments: strings});
								const storedTranslation = {
									signature,
									channelId,
									auto: !!options.auto,
									manual: isManualTranslation,
									independentOfTextAreaSwitch: !!options.independentOfTextAreaSwitch,
									content: content,
									translatedContent,
									originalContent: oldContent,
									embeds: embeds,
									input,
									output
								};
								const rejectReason = plugin.getAutoTranslatedResultRejectReason(storedTranslation, channelId);
								if ((options.auto && rejectReason) || plugin.isTranslationResultTooSimilar(storedTranslation)) {
									plugin.persistReceivedSkipDecision(message.id, signature, rejectReason || "too_similar", storedTranslation.originalContent || storedTranslation.translatedContent);
									if (options.auto) {
										plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, channelId, {
											sourceSignature: signature,
											requestIdentity: liveRequest ? String(liveRequest.id) : null,
											status: "skipped",
											reason: rejectReason || "too_similar"
										}), {refresh: false}).then(_ => finish(false), _ => finish(false));
										return;
									}
									return finish(false);
								}
								if (options.auto) {
									plugin.persistTranslationCacheEntry(message.id, signature, storedTranslation);
									plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, channelId, {
										sourceSignature: signature,
										requestIdentity: liveRequest ? String(liveRequest.id) : null,
										status: "translated",
										translation: storedTranslation
									}), {refresh: false}).then(outcome => {
										if (outcome && outcome.deferredIds && outcome.deferredIds.length) plugin.scheduleReceivedDisplayFlush(channelId, message.id);
										finish(true);
									}, _ => finish(false));
									return;
								}
								plugin.applyStoredTranslationToMessage(message, storedTranslation, originalContentData);
								plugin.scheduleTranslationRerender(rerenderOptions);
								plugin.persistTranslationCacheEntry(message.id, signature, storedTranslation);
							}
							else if (meta && meta.skipped && options.auto) {
								plugin.persistReceivedSkipDecision(message.id, signature, "ai_skip_signal", allTextsToTranslate);
								plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, channelId, {
									sourceSignature: signature,
									requestIdentity: liveRequest ? String(liveRequest.id) : null,
									status: "skipped",
									reason: "ai_skip_signal"
								}), {refresh: false}).then(_ => finish(true), _ => finish(true));
								return;
							}
							else if (options.auto && !translation && !(meta && meta.skipped)) {
								plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, channelId, {
									sourceSignature: signature,
									requestIdentity: liveRequest ? String(liveRequest.id) : null,
									status: "failed",
									reason: "provider_failed"
								}), {refresh: false}).then(_ => finish(false), _ => finish(false));
								return;
							}
							finish(!!translation || !!(meta && meta.skipped));
						}
						catch (error) {finish(false);}
					}, null, {
						showToast: !options.silent,
						showFailureToast: !options.silent,
						trackBusy: options.trackBusy !== false,
						auto: !!options.auto,
						forcePlainTranslation: !!options.forcePlainTranslation,
						channelId
					});
				}
				catch (error) {finish(false);}
			}
		});
	}

	function translateText(text, place, callback, forcedOutputLanguage = null, options = {}) {
		const plugin = getPlugin();
		const showToast = options.showToast !== false;
		const showFailureToast = options.showFailureToast !== false;
		const trackBusy = options.trackBusy !== false;
		let toast = null, toastInterval, finished = false, retriedAfterSkip = false, skipSafetyNetHandler = null, finishTranslation = translation => {
			// AI-decision safety net: when AI decision mode returns a skip signal OR a wrong-target
			// result (e.g. it echoes all-caps text unchanged, treating it as an acronym) for a
			// received auto message, verify the original is actually foreign before honoring the
			// drop. A real foreign message gets a forced plain re-translation (no skip option) so it
			// is never dropped to an AI misjudgement. Runs before the cleanup guards so the
			// translating state stays live.
			const isSkip = plugin.isSkipTranslationSignal(translation);
			if (!isSkip && translation) translation = plugin.addExceptions(translation, protectedSegments);
			const wrongTarget = !isSkip && !!translation && !plugin.isTranslationLikelyInTargetLanguage(translation, output && output.id);
			if (!finished && !retriedAfterSkip && skipSafetyNetHandler && (isSkip || wrongTarget) && options.auto && place == messageTypes.RECEIVED && plugin.useLocalLanguagePrecheck() && plugin.shouldUseAiAutoTranslateDecision(channelId)) {
				retriedAfterSkip = true;
				skipSafetyNetHandler(translation);
				return;
			}
			if (trackBusy) plugin.ensureLiveTranslationQueue().setBusyTranslating(false);
			if (toast) toast.close();
			BDFDB.TimeUtils.clear(toastInterval);

			if (finished) return;
			finished = true;
			const complete = (...args) => {
				callback(...args);
				if (trackBusy) plugin.processAutoTranslationQueue();
			};
			if (isSkip) return complete("", input, output, {skipped: true});
			if (translation && wrongTarget) return complete("", input, output, {failed: true, wrongTargetLanguage: true});
			complete(translation == text ? "" : translation, input, output, {failed: !translation});
		};
		// Bottom-layer protection is shared by AI and traditional engines: only protected placeholders are sent for mentions/emoji/links/code.
		let [newText, protectedSegments, translate] = plugin.removeExceptions(text.trim(), place);
		let channelId = options.channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
		const primaryEngineKey = plugin.getEffectivePrimaryEngine(channelId);
		const backupEngineKey = plugin.getEffectiveBackupEngine(channelId);
		let input = Object.assign({}, plugin.ensureSettingsStore().getLanguage(plugin.getLanguageChoice(languageTypes.INPUT, place, channelId)));
		let output = forcedOutputLanguage ?
			Object.assign({}, plugin.ensureSettingsStore().getLanguage(forcedOutputLanguage) || {id: forcedOutputLanguage, name: forcedOutputLanguage}) :
			Object.assign({}, plugin.ensureSettingsStore().getLanguage(plugin.getLanguageChoice(languageTypes.OUTPUT, place, channelId)));
		if (translate && input.id != output.id) {
			let specialCase = plugin.checkForSpecialCase(newText, input);
			if (specialCase) {
				input.name = specialCase.name;
				switch (specialCase.id) {
					case "binary": newText = plugin.binary2string(newText); break;
					case "braille": newText = plugin.braille2string(newText); break;
					case "morse": newText = plugin.morse2string(newText); break;
					case "hex": newText = plugin.hex2string(newText); break;
				}
			}
			if (output.special) {
				switch (output.id) {
					case "binary": newText = plugin.string2binary(newText); break;
					case "braille": newText = plugin.string2braille(newText); break;
					case "morse": newText = plugin.string2morse(newText); break;
					case "hex": newText = plugin.string2hex(newText); break;
				}
				finishTranslation(newText);
			}
			else {
				const startTranslating = engine => {
					if (trackBusy) plugin.ensureLiveTranslationQueue().setBusyTranslating(true);
					if (toast) toast.close();
					BDFDB.TimeUtils.clear(toastInterval);
					if (showToast) toast = BDFDB.NotificationUtils.toast(`${plugin.labels.toast_translating} (${translationEngines[engine].name}) - ${BDFDB.LanguageUtils.LibraryStrings.please_wait}`, {
						timeout: 0,
						ellipsis: true,
						position: "center",
						onClose: _ => BDFDB.TimeUtils.clear(toastInterval)
					});
					// The watchdog floor must cover requestWithTimeout's 30s window (60 ticks
					// at 500ms); a shorter floor discards paid responses arriving after it.
					const timeoutTicks = Math.max(64, Math.min(120, Math.ceil((newText || "").length / 25)));
					toastInterval = BDFDB.TimeUtils.interval((_, count) => {
						if (count < timeoutTicks) return;
						finishTranslation("");
						if (showFailureToast) BDFDB.NotificationUtils.toast(`${plugin.labels.toast_translating_failed} (${translationEngines[engine].name}) - ${plugin.labels.toast_translating_tryanother}`, {
							type: "danger",
							position: "center"
						});
					}, 500);
				};
				const aiPrompt = plugin.getAiAutoTranslatePrompt({input, output});
				const normalizeProviderTranslation = translation => {
					if (!translation || plugin.isSkipTranslationSignal(translation)) return translation;
					return plugin.hasAllProtectionPlaceholders(translation, protectedSegments) ? translation : "";
				};
				const dispatchEngine = useAutoDecision => {
					const aiDecisionFor = engineKey => !!useAutoDecision && plugin.supportsAiAutoTranslateDecisionEngine(engineKey);
					if (plugin.validTranslator(primaryEngineKey, input, output, specialCase)) {
						startTranslating(primaryEngineKey);
						plugin[translationEngines[primaryEngineKey].funcName].apply(plugin, [{input, output, text: newText, specialCase, engine: translationEngines[primaryEngineKey], autoDecision: aiDecisionFor(primaryEngineKey), decisionPrompt: aiPrompt}, translation => {
							translation = normalizeProviderTranslation(translation);
							if (!translation && plugin.validTranslator(backupEngineKey, input, output, specialCase)) {
								startTranslating(backupEngineKey);
								plugin[translationEngines[backupEngineKey].funcName].apply(plugin, [{input, output, text: newText, specialCase, engine: translationEngines[backupEngineKey], autoDecision: aiDecisionFor(backupEngineKey), decisionPrompt: aiPrompt}, backupTranslation => finishTranslation(normalizeProviderTranslation(backupTranslation))]);
							}
							else finishTranslation(translation);
						}]);
					}
					else if (plugin.validTranslator(backupEngineKey, input, output, specialCase)) {
						startTranslating(backupEngineKey);
						plugin[translationEngines[backupEngineKey].funcName].apply(plugin, [{input, output, text: newText, specialCase, engine: translationEngines[backupEngineKey], autoDecision: aiDecisionFor(backupEngineKey), decisionPrompt: aiPrompt}, backupTranslation => finishTranslation(normalizeProviderTranslation(backupTranslation))]);
					}
					else finishTranslation();
				};
				// Safety net handler: invoked by finishTranslation on an AI skip signal for a received
				// auto message. If the message is foreign, force a plain re-translation (autoDecision:false,
				// no skip option); otherwise honor the original skip.
				skipSafetyNetHandler = skipTranslation => {
					plugin.isReceivedMessageForeignAsync(newText, output && output.id, isForeign => {
						if (isForeign) dispatchEngine(false);
						else finishTranslation(skipTranslation);
					});
				};
				// Clearly cross-script foreign messages (e.g. all-caps Latin "HELLO CRYZYYY" -> Chinese)
				// are always foreign: translate plainly so AI decision mode cannot misjudge all-caps
				// text as an acronym and echo/skip it. Same-script (latin<->latin) still uses AI decision.
				const isReceivedAutoAiDecision = options.auto && !options.forcePlainTranslation && place == messageTypes.RECEIVED && plugin.shouldUseAiAutoTranslateDecision(channelId);
				const useAutoDecision = isReceivedAutoAiDecision && !plugin.isClearlyForeignLanguageMessage(newText, output && output.id);
				dispatchEngine(useAutoDecision);
			}
		}
		else finishTranslation();
	}

	return Object.freeze({translateMessage, translateText});
}

module.exports = {createTranslationPipeline};
