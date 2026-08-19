// Owns the received-message side of automatic translation: walking Discord's channel
// stream, deciding what each rendered message should show right now, and deciding
// whether a received message is worth translating at all.
//
// Three objects used to sit next to each other in the plugin factory closure. They stay
// together because they are one decision chain, read top to bottom:
//
// - receivedTranslationRuntime is the render-time pass. processMessages walks the
//   channel stream once per render, and checkMessage runs per message: it captures the
//   untranslated source, resolves what the stream entry should display (a live
//   translation, a committed store view, or the archived original), and only then
//   queues work. Splitting the pass into createCheckMessageContext /
//   captureReceivedDisplaySource / resolveCheckMessageDisplay /
//   queueCheckMessageTranslation is what keeps that order observable: capture must
//   happen before display resolution, and queueing must happen last, because
//   resolveCheckMessageDisplay is what discovers a cached result and can commit it
//   without a repaint.
// - foreignLanguageDecisionRuntime answers one question - is this text in a language
//   other than the target - and is the only place allowed to fall back to async
//   detection when the local script check is inconclusive.
// - receivedMessageFilterRuntime is the gate. It decides eligibility before a request
//   (shouldAutoTranslateReceivedMessage, getReceivedAutoTranslateSkipReason) and
//   acceptance after one (shouldKeepAutoTranslatedResult). The two directions share
//   buildReceivedAutoTranslateAnalysis on purpose: a message rejected before the
//   request and a translation rejected after it must agree about the target language.
//
// The module is split the way language-heuristics.js is:
//
// - The two pure objects below are exported directly. They only read the plugin and
//   call plugin methods, so a test can drive them with a hand-built fake plugin.
// - createReceivedTranslationRuntime(dependencies) wraps the one object that genuinely
//   needs the surrounding runtime: BDFDB (stream shape guards and the selected-channel
//   fallback) and the loaded-translation status store's batch counters.
//
// Every method keeps `plugin` as its first parameter, exactly as the legacy runtime had
// it, so the plugin class methods stay one-line delegations and everything this code
// cannot compute for itself - display state, the cache, the queues, language analysis -
// still arrives through the plugin instance.

// Same values as the legacy languageTypes/messageTypes maps in runtime.js. Imported
// rather than re-declared: language-heuristics.js already owns the copy the received
// settings policies are keyed on, and the two must not be allowed to drift.
const {LANGUAGE_DIRECTIONS, MESSAGE_DIRECTIONS} = require("../language/language-heuristics");

// Answers "is this text foreign relative to the target", and nothing else. Pure: the
// local script check and the async detector are both plugin methods.
const foreignLanguageDecisionRuntime = {
	isDetectedLanguageForeign(plugin, detectedLanguageId, targetLanguageId) {
		return !!detectedLanguageId && !plugin.isSameLanguageOrVariant(detectedLanguageId, targetLanguageId);
	},
	isReceivedMessageForeignAsync(plugin, text, targetLanguageId, callback) {
		if (plugin.isClearlyForeignLanguageMessage(text, targetLanguageId)) return callback(true);
		if (!text || !targetLanguageId || targetLanguageId == "auto") return callback(false);
		plugin.detectLanguage(text, detectedLanguageId => callback(foreignLanguageDecisionRuntime.isDetectedLanguageForeign(plugin, detectedLanguageId, targetLanguageId)));
	}
};

function hasUsefulEmbedTranslation(translation) {
	return Object.values(translation && translation.embeds || {}).some(embed => embed && (
		Object.prototype.hasOwnProperty.call(embed, "hasTranslatedContent")
			? embed.hasTranslatedContent && embed.complete !== false
			: [embed.title, embed.description, embed.footerText].some(value => String(value || "").trim())
				|| (Array.isArray(embed.fields) && embed.fields.some(field => field && (String(field.name || "").trim() || String(field.value || "").trim())))
	));
}

// The eligibility gate, both before a request and after one. Pure: every input is a
// plugin method or one of the two direction constants above.
const receivedMessageFilterRuntime = {
	isTranslationResultTooSimilar(plugin, translation) {
		if (!translation) return false;
		const normalizedTranslation = plugin.normalizeStoredTranslationData(translation);
		const originalContent = (normalizedTranslation.originalContent || "").trim();
		const translatedContent = (normalizedTranslation.translatedContent || normalizedTranslation.content || "").trim();
		if (!originalContent || !translatedContent) return false;
		const normalizedOriginal = plugin.normalizeComparisonText(originalContent);
		const normalizedTranslated = plugin.normalizeComparisonText(translatedContent);
		if (!normalizedOriginal || !normalizedTranslated) return false;
		if (normalizedOriginal == normalizedTranslated) return true;
		return plugin.getTextSimilarityScore(originalContent, translatedContent) >= Math.max(0.92, plugin.getTranslationSimilarityThreshold());
	},
	getAutoTranslatedResultRejectReason(plugin, translation, channelId) {
		if (!translation || !translation.translatedContent && !hasUsefulEmbedTranslation(translation)) return "local_guard";
		if (receivedMessageFilterRuntime.isTranslationResultTooSimilar(plugin, translation)) return "too_similar";
		const detectedLanguageId = translation.input && translation.input.id;
		const targetLanguageId = translation.output && translation.output.id || plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.OUTPUT, MESSAGE_DIRECTIONS.RECEIVED, channelId);
		if (plugin.shouldSkipSameLanguageReceivedMessages() && detectedLanguageId && plugin.isSameLanguageOrVariant(detectedLanguageId, targetLanguageId)) return "same_language";
		const sourceLanguages = plugin.getReceivedAutoTranslateSourceLanguages();
		if (sourceLanguages.length && detectedLanguageId && !plugin.matchesConfiguredSourceLanguage(detectedLanguageId, sourceLanguages)) return "source_filter";
		if (plugin.shouldDropSimilarTranslations() && translation.originalContent && translation.translatedContent && plugin.getTextSimilarityScore(translation.originalContent, translation.translatedContent) >= plugin.getTranslationSimilarityThreshold()) return "too_similar";
		return null;
	},
	shouldKeepAutoTranslatedResult(plugin, translation, channelId) {
		return !receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, translation, channelId);
	},
	buildAutoTranslateAnalysisText(plugin, originalContentData) {
		const rawText = plugin.buildTranslationRequestText(originalContentData);
		const [maskedText, , hasUnprotectedContent] = plugin.removeExceptions(rawText, MESSAGE_DIRECTIONS.RECEIVED);
		return {text: maskedText || "", hasUnprotectedContent};
	},
	isLinkOnlyReceivedContent(plugin, originalContentData) {
		if (!originalContentData) return false;
		const content = (originalContentData.content || "").trim();
		if (!content) return false;
		const [maskedContent, , hasUnprotectedContent] = plugin.removeExceptions(content, MESSAGE_DIRECTIONS.RECEIVED);
		if (hasUnprotectedContent) return false;
		const counts = plugin.countScriptFamilies(maskedContent);
		return !!maskedContent && Object.keys(counts).every(family => !counts[family]);
	},
	buildReceivedAutoTranslateAnalysis(plugin, originalContentData, channelId) {
		if (!originalContentData || !channelId) return null;
		const targetLanguageId = plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.OUTPUT, MESSAGE_DIRECTIONS.RECEIVED, channelId);
		const analysisSource = receivedMessageFilterRuntime.buildAutoTranslateAnalysisText(plugin, originalContentData);
		const analysis = plugin.analyzeTextForAutoTranslate(analysisSource.text, targetLanguageId);
		return {targetLanguageId, analysisSource, analysis};
	},
	getReceivedAutoTranslateSkipReason(plugin, originalContentData, channelId) {
		if (receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, originalContentData)) return "link_only";
		if (!plugin.hasTranslatableMessageContent(originalContentData)) return "symbol_only";
		const receivedAnalysis = receivedMessageFilterRuntime.buildReceivedAutoTranslateAnalysis(plugin, originalContentData, channelId);
		if (!receivedAnalysis || !receivedAnalysis.analysisSource.hasUnprotectedContent) return "symbol_only";
		const {targetLanguageId, analysis} = receivedAnalysis;
		if (!analysis.totalLetters) return "symbol_only";
		if (plugin.isClearlyTargetLanguageMessage(analysis, targetLanguageId)) return "same_language";
		if (plugin.shouldSkipSameLanguageReceivedMessages() && plugin.isMostlyTargetLanguageMessage(analysis, targetLanguageId)) return "same_language";
		return null;
	},
	shouldSkipReceivedTranslationBeforeRequest(plugin, originalContentData, channelId) {
		if (!originalContentData || !channelId) return false;
		if (receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, originalContentData)) return true;
		const receivedAnalysis = receivedMessageFilterRuntime.buildReceivedAutoTranslateAnalysis(plugin, originalContentData, channelId);
		if (!receivedAnalysis) return false;
		const {targetLanguageId, analysisSource, analysis} = receivedAnalysis;
		const targetLanguage = plugin.ensureSettingsStore().getLanguage(targetLanguageId);
		if (!targetLanguageId || targetLanguageId == "auto" || targetLanguage && targetLanguage.special) return false;
		if (!analysisSource || !analysisSource.hasUnprotectedContent) return false;
		return plugin.isClearlyTargetLanguageMessage(analysis, targetLanguageId);
	},
	shouldSkipByLocalLanguagePrecheck(plugin, text, analysis, targetLanguageId) {
		if (!plugin.useLocalLanguagePrecheck()) return false;
		// Latin-vs-Latin same-language and source-filter checks that script-family
		// analysis cannot resolve locally, so we avoid a wasteful AI request. Only
		// acts on high-confidence detections; uncertain text still goes to translation.
		const localDetection = plugin.detectMessageLanguageLocal(text, analysis, targetLanguageId);
		if (!localDetection.confident || !localDetection.languageId) return false;
		if (plugin.isSameLanguageOrVariant(localDetection.languageId, targetLanguageId)) return true;
		const sourceLanguages = plugin.getReceivedAutoTranslateSourceLanguages();
		return sourceLanguages.length && !plugin.matchesConfiguredSourceLanguage(localDetection.languageId, sourceLanguages);
	},
	shouldAutoTranslateReceivedMessage(plugin, message, channel, originalContentData = null, ignoreQueued = false) {
		if (!channel || !channel.id || !message || !message.id) return false;
		if (!plugin.isTranslationEnabled(channel.id) || plugin.isOwnMessage(message)) return false;
		if (plugin.ensureReceivedDisplayRuntime().isSuppressed(message.id)) return false;
		if (plugin.isMessageDisplayTranslated(message, channel.id) || !ignoreQueued && plugin.ensureLiveTranslationQueue().isMessageQueued(message.id)) return false;
		const sourceData = originalContentData || plugin.extractOriginalContentData(message);
		if (plugin.getCachedReceivedSkipDecision(message, channel.id, sourceData)) return false;
		if (receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, sourceData)) return false;
		if (!plugin.hasTranslatableMessageContent(sourceData)) return false;
		const receivedAnalysis = receivedMessageFilterRuntime.buildReceivedAutoTranslateAnalysis(plugin, sourceData, channel.id);
		if (!receivedAnalysis || !receivedAnalysis.analysisSource.hasUnprotectedContent) return false;
		const {analysisSource, targetLanguageId, analysis} = receivedAnalysis;
		if (!analysis.totalLetters) return false;
		if (analysis.totalLetters < plugin.getAutoTranslateMinimumLengthForAnalysis(analysis)) return false;
		if (plugin.isClearlyTargetLanguageMessage(analysis, targetLanguageId)) return false;
		if (plugin.shouldSkipSameLanguageReceivedMessages() && plugin.isMostlyTargetLanguageMessage(analysis, targetLanguageId)) return false;
		if (receivedMessageFilterRuntime.shouldSkipByLocalLanguagePrecheck(plugin, analysisSource.text, analysis, targetLanguageId)) return false;
		return true;
	}
};

// The one impure object: the render-time stream pass. It needs BDFDB for the stream and
// attachment shape guards plus the selected-channel fallback, and the loaded-message
// status store for the two batch counters it stamps onto the progress banner.
function createReceivedTranslationRuntime({
	// Only ArrayUtils.is and SelectedChannelStore.getChannelId are used. Defaulted so
	// the module is constructible on its own; the plugin injects the real library.
	BDFDB = {ArrayUtils: {is: Array.isArray}, LibraryStores: {SelectedChannelStore: {getChannelId: () => null}}},
	// Only the batch counters are read here. Every other call into the status store
	// goes through the plugin, which owns the banner.
	loadedTranslationStatusStore = {getNextBatchNumber: () => 0, getCurrentBatchNumber: () => 0}
} = {}) {
	const receivedTranslationRuntime = {
		// One object threaded through the whole stream walk, so the per-entry step stays
		// a pure function of (entry, context). It also decides, once per render, whether
		// this is the channel's first pass in loaded-messages scope - the only moment
		// the historical collection banner may be opened.
		//
		// (The legacy copy of this method carried a comment about draining live batch
		// items. That comment belonged to collectBatchItems, which moved to
		// orchestrator/live-translation-queue.js; it is not repeated here.)
		createProcessMessagesContext(plugin, e) {
			e.instance.props.channelStream = [].concat(e.instance.props.channelStream);
			const channel = e.instance.props.channel;
			const channelId = channel && channel.id;
			plugin.prepareAutoTranslationChannelSession(channelId);
			const channelState = plugin.getAutoTranslationChannelState(channelId);
			const shouldInitializeAutoTranslation = !!(channelId && plugin.isTranslationEnabled(channelId) && channelState && !channelState.initialized);
			const historicalLoadedPass = shouldInitializeAutoTranslation && plugin.getReceivedAutoTranslateScope() == "loaded_messages";
			if (historicalLoadedPass) {
				const retainedFailedCount = plugin.getFailedHistoricalTranslationCount(channelId);
				plugin.attachAutoTranslationScrollWatcher();
				plugin.updateLoadedAutoTranslationStatus({active: true, collecting: true, done: false, channelId, batch: loadedTranslationStatusStore.getNextBatchNumber(), total: 0, processed: 0, displayed: 0, skipped: 0, failed: 0, retryable: retainedFailedCount, aiDropped: 0, lastSkipReason: "", lastSkipPreview: ""});
			}
			return {
				channel,
				channelId,
				channelState,
				shouldInitializeAutoTranslation,
				historicalLoadedPass,
				historicalSourceGeneration: historicalLoadedPass && typeof plugin.getHistoricalMessageSourceGeneration == "function" ? plugin.getHistoricalMessageSourceGeneration(channelId) : null,
				renderedHistoricalMessages: [],
				skipInitialLoadedMessages: shouldInitializeAutoTranslation && plugin.shouldDeferInitialAutoTranslate(channelId),
				autoTranslateBoundaryId: channelState ? channelState.boundaryMessageId : null,
				highestMessageId: channelState ? channelState.boundaryMessageId : null,
				collectedHistoricalMessages: false
			};
		},
		shouldCollectHistoricalStreamMessage(plugin, message, context) {
			if (!message || !message.id || !context.channelId) return false;
			const wasSeen = plugin.markLoadedAutoTranslationMessageSeen(context.channelId, message.id);
			if (plugin.getReceivedAutoTranslateScope() != "loaded_messages") return false;
			if (context.historicalLoadedPass) return true;
			return !wasSeen && !plugin.isMessageIdNewer(message.id, context.autoTranslateBoundaryId);
		},
		processChannelStreamEntry(plugin, entry, context) {
			const message = entry && entry.content;
			if (!message) return context.highestMessageId;
			if (BDFDB.ArrayUtils.is(message.attachments)) {
				const historicalLoad = receivedTranslationRuntime.shouldCollectHistoricalStreamMessage(plugin, message, context);
				if (historicalLoad) context.collectedHistoricalMessages = true;
				if (historicalLoad && context.historicalLoadedPass) context.renderedHistoricalMessages.push(message);
				context.highestMessageId = plugin.getNewestMessageId(context.highestMessageId, message.id);
				plugin.checkMessage(entry, message, context.channel, {
					skipAutoQueue: context.skipInitialLoadedMessages,
					autoTranslateBoundaryId: context.autoTranslateBoundaryId,
					historicalLoad,
					deferHistoricalSnapshotStart: historicalLoad,
					skipHistoricalQueue: historicalLoad && context.historicalLoadedPass
				});
				return context.highestMessageId;
			}
			if (BDFDB.ArrayUtils.is(message)) for (let index in message) {
				const childMessage = message[index].content;
				if (!childMessage || !BDFDB.ArrayUtils.is(childMessage.attachments)) continue;
				const historicalLoad = receivedTranslationRuntime.shouldCollectHistoricalStreamMessage(plugin, childMessage, context);
				if (historicalLoad) context.collectedHistoricalMessages = true;
				if (historicalLoad && context.historicalLoadedPass) context.renderedHistoricalMessages.push(childMessage);
				context.highestMessageId = plugin.getNewestMessageId(context.highestMessageId, childMessage.id);
				plugin.checkMessage(message[index], childMessage, context.channel, {
					skipAutoQueue: context.skipInitialLoadedMessages,
					autoTranslateBoundaryId: context.autoTranslateBoundaryId,
					historicalLoad,
					deferHistoricalSnapshotStart: historicalLoad,
					skipHistoricalQueue: historicalLoad && context.historicalLoadedPass
				});
			}
			return context.highestMessageId;
		},
		finishProcessMessages(plugin, context) {
			if (context.channelState) {
				context.channelState.boundaryMessageId = plugin.getNewestMessageId(context.channelState.boundaryMessageId, context.highestMessageId);
				if (context.shouldInitializeAutoTranslation) context.channelState.initialized = true;
			}
			if (context.historicalLoadedPass && typeof plugin.buildInitialHistoricalTranslationSnapshot == "function") {
				Promise.resolve(plugin.buildInitialHistoricalTranslationSnapshot({
					channelId: context.channelId,
					generation: context.historicalSourceGeneration,
					renderedMessages: context.renderedHistoricalMessages,
					limit: typeof plugin.getReceivedAutoTranslateLoadedLimit == "function" ? plugin.getReceivedAutoTranslateLoadedLimit() : 0
				})).catch(_ => {});
				return;
			}
			if (context.historicalLoadedPass || context.collectedHistoricalMessages) {
				if (context.collectedHistoricalMessages && !plugin.isUserActivelyScrollingMessages(context.channelId)) plugin.finishHistoricalTranslationSnapshot(context.channelId);
				const historicalEntry = plugin.getHistoricalTranslationJobQueue(context.channelId, false);
				const hasQueuedHistoricalForChannel = !!(historicalEntry && (historicalEntry.runningPromise || historicalEntry.jobs.length));
				if (!hasQueuedHistoricalForChannel) plugin.updateLoadedAutoTranslationStatus({active: false, collecting: false, done: true, channelId: context.channelId, batch: loadedTranslationStatusStore.getCurrentBatchNumber(), total: 0, processed: 0});
			}
		},
		processMessages(plugin, e) {
			const context = receivedTranslationRuntime.createProcessMessagesContext(plugin, e);
			for (let index in e.instance.props.channelStream) {
				receivedTranslationRuntime.processChannelStreamEntry(plugin, e.instance.props.channelStream[index], context);
			}
			receivedTranslationRuntime.finishProcessMessages(plugin, context);
		},
		// An automatic commit mints no source archive, and the stream pass writes the painted
		// text onto the message the channel stream holds. With no anchor, the NEXT stream pass
		// reads that painted text back as the "original", the recomputed signature changes,
		// captureSource replaces the record with a fresh idle one, and the message keeps its
		// translated text while losing the translation - and with it the accent class that
		// carries the whole colour treatment. It is also re-queued and re-translated, because
		// as far as the plugin can tell the author just edited the message into Chinese.
		// The shapes we could have painted for this translation. Recomposed at render time
		// from the current display settings, so a settings change made after the commit must
		// still read as our own output rather than as a user edit.
		matchesPaintedTranslation(plugin, paintedText, translation, message = null) {
			if (!translation) return false;
			const painted = plugin.normalizeExtractedMessageText(paintedText || "").trim();
			if (!painted) return false;
			const known = [
				translation.content,
				translation.translatedContent,
				plugin.buildReceivedDisplayContent(translation.translatedContent || translation.content, translation.originalContent || "")
			];
			if (message && typeof plugin.getStreamTranslationRenderContent == "function") known.push(plugin.getStreamTranslationRenderContent(message, translation));
			return known.map(value => plugin.normalizeExtractedMessageText(value || "").trim()).filter(Boolean).includes(painted);
		},
		resolveOriginalContentDataAnchor(plugin, message) {
			const archive = message && message.id && plugin.ensureReceivedDisplayRuntime().peekSourceArchive(message.id);
			if (archive && archive.originalContentData) return archive.originalContentData;
			const record = message && message.id && plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id);
			// A cancelled record's translation is gone, but its paint is still on the message
			// until a render pass swaps the original back. restoredTranslation is what lets
			// this pass tell that paint from a real edit - without it, the cancel itself was
			// captured as a source change and the original never came back.
			const translation = record && (record.status == "translated" && record.translation || record.status == "cancelled" && record.restoredTranslation);
			if (!translation || !record.source || !record.source.content) return null;
			// A forward's paint lands in the snapshot, not in message.content; the echo
			// check must read the same body the extraction reads, or every stream pass
			// would take its own paint for a source edit and re-queue the forward.
			let paintedBody = message.content;
			if (!paintedBody || !String(paintedBody).trim()) {
				const snapshots = message.messageSnapshots || message.message_snapshots;
				const snapshotMessage = Array.isArray(snapshots) && snapshots.length && snapshots[0] && snapshots[0].message || null;
				if (snapshotMessage && snapshotMessage.content) paintedBody = snapshotMessage.content;
			}
			return receivedTranslationRuntime.matchesPaintedTranslation(plugin, paintedBody, translation, message) ? record.source : null;
		},
		createCheckMessageContext(plugin, message, channel, options = {}) {
			const channelId = channel && channel.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
			const sourceChanged = plugin.refreshReceivedMessageSourceState(message, channelId);
			const originalContentData = plugin.extractOriginalContentData(message);
			const channelState = plugin.getAutoTranslationChannelState(channelId);
			const autoTranslateBoundaryId = options.autoTranslateBoundaryId != null ? options.autoTranslateBoundaryId : channelState && channelState.boundaryMessageId;
			const expectedSignature = plugin.createReceivedTranslationSignature(message, channelId, originalContentData);
			const pendingSourceChanged = plugin.invalidateHistoricalTranslationMessage(message.id, channelId, expectedSignature);
			const liveSourceChanged = plugin.invalidateLiveTranslationMessage(message.id, channelId, expectedSignature);
			return {
				channelId,
				channelState,
				originalContentData,
				expectedSignature,
				forceQueue: sourceChanged || pendingSourceChanged || liveSourceChanged,
				skipAutoQueue: !!options.skipAutoQueue,
				skipHistoricalQueue: !!options.skipHistoricalQueue,
				isNewerThanBoundary: plugin.isMessageIdNewer(message.id, autoTranslateBoundaryId),
				historicalLoad: !!options.historicalLoad,
				deferHistoricalSnapshotStart: !!options.deferHistoricalSnapshotStart
			};
		},
		captureReceivedDisplaySource(plugin, message, context) {
			if (!context.channelId || plugin.isOwnMessage(message)) return null;
			// A disabled channel captures nothing: recapturing during the restore repaint
			// would replace cancelled records and break the transaction's acknowledgement.
			if (!plugin.isTranslationEnabled(context.channelId)) return null;
			const previousView = plugin.getReceivedDisplayRuntimeView(message.id);
			const generation = plugin.getReceivedDisplayGeneration(context.channelId);
			const record = plugin.captureReceivedMessageSource({
				messageId: message.id,
				channelId: context.channelId,
				generation: generation === undefined ? 1 : generation,
				sourceSignature: context.expectedSignature,
				source: {
					content: context.originalContentData && context.originalContentData.content || "",
					embeds: context.originalContentData && context.originalContentData.embeds || []
				}
			});
			// A same-generation signature change on a non-idle record is a source edit:
			// the fresh idle record replaced stale display state, so the message must
			// requeue and its stale cache entry must go.
			const sourceChanged = !!(previousView && record && previousView.status !== "idle" && previousView.generation === record.generation && previousView.sourceSignature !== record.sourceSignature);
			if (sourceChanged) {
				context.forceQueue = true;
				plugin.clearCachedTranslation(message.id);
			}
			return record;
		},
		commitCachedDisplayResult(plugin, message, context, cachedTranslation) {
			const storedTranslation = plugin.refreshTranslationDisplay(Object.assign({channelId: context.channelId, auto: true}, cachedTranslation));
			const commit = plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, context.channelId, {
				sourceSignature: storedTranslation.signature != null ? String(storedTranslation.signature) : context.expectedSignature,
				status: "translated",
				translation: storedTranslation
			}), {refresh: false});
			if (commit && commit.catch) commit.catch(_ => {});
			const committedView = plugin.getReceivedDisplayRuntimeView(message.id);
			return !!(committedView && committedView.translated);
		},
		resolveCheckMessageDisplay(plugin, stream, message, context) {
			const hadDisplayedTranslation = !!plugin.ensureReceivedDisplayRuntime().getDisplayView(message.id);
			let translation = plugin.getActiveMessageTranslation(message, context.channelId, context.expectedSignature);
			let messageChanged = hadDisplayedTranslation && !translation;
			const canAutoTranslateMessage = plugin.isTranslationEnabled(context.channelId) && !plugin.ensureReceivedDisplayRuntime().isSuppressed(message.id);
			const canAutoTranslateReplyPreviewForBase = canAutoTranslateMessage && !context.skipAutoQueue && (context.historicalLoad ? plugin.isMessageWithinLoadedRange(message) : context.isNewerThanBoundary);
			let cachedTranslation = null;
			let storeCommitted = false;
			if (canAutoTranslateReplyPreviewForBase) plugin.markAutoTranslationEligibleReplyPreviewMessage(context.channelId, message.id);
			if (!translation && canAutoTranslateMessage && !context.skipAutoQueue && (context.historicalLoad || context.forceQueue || messageChanged || context.isNewerThanBoundary)) {
				cachedTranslation = plugin.getCachedReceivedTranslation(message, context.channelId, context.originalContentData);
				// A cached automatic result commits into the display store without a refresh:
				// the render pass that triggered checkMessage paints text and decoration
				// together from the committed view.
				if (cachedTranslation && !context.historicalLoad) storeCommitted = receivedTranslationRuntime.commitCachedDisplayResult(plugin, message, context, cachedTranslation);
			}
			const storeView = !translation && plugin.getReceivedDisplayRuntimeView(message.id);
			// All body writes and echo reads go through the forward-aware pair: a
			// forward's body lives in its snapshot, and the legacy direct content
			// writes painted (and restored) into the empty own content, which the
			// forward frame never displays (field 2026-08-19 night: manual translate
			// and manual untranslate on a forward were invisible).
			if (translation) {
				plugin.refreshTranslationDisplay(translation);
				plugin.paintStreamBody(stream, plugin.getStreamTranslationRenderContent(stream.content, translation));
			}
			else if (storeView && storeView.translated) {
				plugin.applyReceivedDisplayViewToStream(stream, storeView);
			}
			else if (plugin.ensureReceivedDisplayRuntime().hasSourceArchive(message.id)) {
				const archive = plugin.ensureReceivedDisplayRuntime().consumeSourceArchive(message.id);
				plugin.paintStreamBody(stream, plugin.getStreamBodyContent(archive && archive.message));
				messageChanged = true;
			}
			// The automatic path's untranslate: the record is cancelled, the message still
			// carries the painted translation, and there is no archive to consume. The
			// restoredTranslation is the proof the paint is ours; the record's source is
			// the original to put back.
			else if (storeView && storeView.status == "cancelled" && storeView.restoredTranslation && storeView.content
				&& plugin.getStreamBodyContent(stream.content) !== storeView.content
				&& receivedTranslationRuntime.matchesPaintedTranslation(plugin, plugin.getStreamBodyContent(stream.content), storeView.restoredTranslation, stream.content)) {
				plugin.paintStreamBody(stream, storeView.content);
				messageChanged = true;
			}
			return {translation, storeCommitted, messageChanged, cachedTranslation, canAutoTranslateMessage};
		},
		queueCheckMessageTranslation(plugin, message, channel, context, outcome) {
			if (outcome.translation || outcome.storeCommitted || context.skipAutoQueue || !outcome.canAutoTranslateMessage) return;
			if (context.historicalLoad && context.skipHistoricalQueue) return;
			if (context.channelState) context.channelState.boundaryMessageId = plugin.getNewestMessageId(context.channelState.boundaryMessageId, message.id);
			if (context.forceQueue || outcome.messageChanged || context.isNewerThanBoundary || context.historicalLoad) {
				const liveMessage = !context.historicalLoad && (context.isNewerThanBoundary || plugin.isLikelyLiveAutoTranslateMessage(message, context.channelId));
				plugin.queueAutoTranslateMessage(message, channel || {id: context.channelId}, context.originalContentData, {
					historicalLoad: context.historicalLoad && !liveMessage,
					deferHistoricalSnapshotStart: context.deferHistoricalSnapshotStart,
					deferWhileReading: false,
					cachedTranslation: context.historicalLoad && !liveMessage ? outcome.cachedTranslation : null
				});
			}
		},
		checkMessage(plugin, stream, message, channel, options = {}) {
			if (!message || !stream || !stream.content) return;
			plugin.captureSentOriginalMessage(message, channel && channel.id || message.channel_id || null);
			const context = receivedTranslationRuntime.createCheckMessageContext(plugin, message, channel, options);
			receivedTranslationRuntime.captureReceivedDisplaySource(plugin, message, context);
			const outcome = receivedTranslationRuntime.resolveCheckMessageDisplay(plugin, stream, message, context);
			receivedTranslationRuntime.queueCheckMessageTranslation(plugin, message, channel, context, outcome);
		}
	};

	return Object.freeze({receivedTranslationRuntime});
}

module.exports = {
	foreignLanguageDecisionRuntime,
	receivedMessageFilterRuntime,
	createReceivedTranslationRuntime
};
