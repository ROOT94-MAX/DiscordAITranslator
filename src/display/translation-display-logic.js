// Owns the last stretch of the received-translation path: turning a stored translation
// record into the text, watermark and decorations Discord actually renders, and putting
// the original back when the translation goes away. Every method used to sit in the
// plugin factory closure in runtime.js, between receivedTranslationRuntime and
// foreignLanguageDecisionRuntime, where it could reach the whole 5600-line file.
//
// This is the hot path for "did my translation show up". Three groups live here:
//
// - Composition. buildReceivedDisplayContent and refreshTranslationDisplay decide what
//   the message body reads as, including whether the original is appended inline.
// - Reply previews. The stripReplyPreview / getStableReplyPreview / getReplyPreview
//   family projects a stored translation into the small quoted preview above a reply.
//   getStableReplyPreviewOriginalContent is what stops a preview from echoing an
//   already-translated body back as if it were the original.
// - Render hooks. processMessageReply, prepareMessageContentDisplay, processEmbed and
//   the decoration helpers are called straight from the BDFDB message patches.
//
// Everything else in the runtime is reached through `plugin`, so the only injected
// dependency is BDFDB itself (DiscordObjects.Message, ReactUtils, DOMUtils,
// LibraryComponents, disCN). Most of the object touches it, which is why this exports a
// factory rather than a plain object: a test can drive it with a stub BDFDB.
//
// Every method keeps `plugin` as its first parameter exactly as the legacy runtime had
// it: the plugin class methods are one-line delegations and the render patches call in
// with `this`. The plugin still owns normalizeStoredTranslationData,
// ensureReceivedDisplayRuntime, extractOriginalContentData and the rest.

// Same values as the legacy messageTypes map in runtime.js and as MESSAGE_DIRECTIONS in
// language-heuristics.js. Kept as a local copy because this is runtime-wide vocabulary,
// not something the display module should own on everyone else's behalf.
const MESSAGE_DIRECTIONS = Object.freeze({RECEIVED: "received", SENT: "sent"});

function hasOwn(object, key) {
	return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

// Shallow clone that keeps the prototype, so a patched forward snapshot still
// carries whatever record methods Discord's renderer calls on it.
function cloneWithPrototype(source) {
	try {return Object.assign(Object.create(Object.getPrototypeOf(source) || null), source);}
	catch (error) {return Object.assign({}, source);}
}

function normalizeEmbedText(plugin, value) {
	if (plugin && typeof plugin.normalizeExtractedMessageText == "function") return plugin.normalizeExtractedMessageText(value == null ? "" : value);
	return value == null ? "" : String(value);
}

function readVisibleEmbedText(plugin, object, rawKey, plainKey) {
	if (!object) return "";
	return normalizeEmbedText(plugin, hasOwn(object, rawKey) ? object[rawKey] : object[plainKey]);
}

function projectVisibleEmbed(plugin, embed) {
	return {
		title: readVisibleEmbedText(plugin, embed, "rawTitle", "title"),
		description: readVisibleEmbedText(plugin, embed, "rawDescription", "description"),
		footerText: normalizeEmbedText(plugin, embed && embed.footer && embed.footer.text),
		fields: ((embed && embed.fields) || []).map(field => ({
			name: readVisibleEmbedText(plugin, field, "rawName", "name"),
			value: readVisibleEmbedText(plugin, field, "rawValue", "value")
		}))
	};
}

function embedProjectionMatches(plugin, currentEmbed, sourceEmbed) {
	const current = projectVisibleEmbed(plugin, currentEmbed);
	const source = sourceEmbed || {};
	if (current.title !== normalizeEmbedText(plugin, source.title) || current.description !== normalizeEmbedText(plugin, source.description) || current.footerText !== normalizeEmbedText(plugin, source.footerText)) return false;
	const sourceFields = Array.isArray(source.fields) ? source.fields : [];
	if (current.fields.length !== sourceFields.length) return false;
	return current.fields.every((field, index) => field.name === normalizeEmbedText(plugin, sourceFields[index] && sourceFields[index].name) && field.value === normalizeEmbedText(plugin, sourceFields[index] && sourceFields[index].value));
}

function writeVisibleEmbedText(target, rawKey, plainKey, value) {
	let wrote = false;
	if (hasOwn(target, rawKey)) {
		target[rawKey] = value;
		wrote = true;
	}
	if (hasOwn(target, plainKey) || !wrote) target[plainKey] = value;
}

function restoreEmbedFromSource(currentEmbed, sourceEmbed) {
	const restored = Object.assign({}, currentEmbed || {});
	const source = sourceEmbed || {};
	writeVisibleEmbedText(restored, "rawTitle", "title", source.title || "");
	writeVisibleEmbedText(restored, "rawDescription", "description", source.description || "");
	if (restored.footer || source.footerText) restored.footer = Object.assign({}, restored.footer || {}, {text: source.footerText || ""});
	const currentFields = Array.isArray(restored.fields) ? restored.fields : [];
	restored.fields = (Array.isArray(source.fields) ? source.fields : []).map((sourceField, index) => {
		const field = Object.assign({}, currentFields[index] || {});
		writeVisibleEmbedText(field, "rawName", "name", sourceField && sourceField.name || "");
		writeVisibleEmbedText(field, "rawValue", "value", sourceField && sourceField.value || "");
		return field;
	});
	delete restored.originalTitle;
	delete restored.originalDescription;
	delete restored.originalFooter;
	delete restored.originalFields;
	return restored;
}

function createTranslationDisplayLogic({BDFDB} = {}) {
	const translationDisplayLogic = {
		getReceivedDisplayViewRenderContent(_plugin, view) {
			if (!view) return "";
			if (view.translated && view.translation) {
				const translatedContent = view.translation.translatedContent != null && view.translation.translatedContent !== "" ? view.translation.translatedContent : view.translation.content;
				return translationDisplayLogic.buildReceivedDisplayContent(_plugin, String(translatedContent == null ? "" : translatedContent), view.translation.originalContent || "");
			}
			return String(view.content == null ? "" : view.content);
		},
		// A forwarded message (已转发) has no content of its own - the body lives in
		// the forward snapshot (probe evidence 2026-08-19, translator-forwarded-
		// message-probe.json: snapshot message has content but no id and no author).
		// Detection requires the OWN content to be empty, so an ordinary message that
		// merely references another never takes this path.
		getForwardedMessageSnapshots(_plugin, message) {
			if (!message) return null;
			if (typeof message.content == "string" && message.content.trim()) return null;
			const snapshots = message.messageSnapshots || message.message_snapshots;
			if (!Array.isArray(snapshots) || !snapshots.length) return null;
			const snapshotMessage = snapshots[0] && snapshots[0].message;
			if (!snapshotMessage || typeof snapshotMessage.content != "string" || !snapshotMessage.content.trim()) return null;
			return snapshots;
		},
		isForwardContainerMessage(plugin, message) {
			return !!translationDisplayLogic.getForwardedMessageSnapshots(plugin, message);
		},
		// The body a reader actually sees: the forward snapshot's content for a
		// forward, the message's own content otherwise. Every echo check and every
		// paint must go through this pair, or a forward branch goes blind (the
		// manual translate/untranslate blindness, field 2026-08-19 night).
		getStreamBodyContent(plugin, message) {
			const forwardSnapshots = translationDisplayLogic.getForwardedMessageSnapshots(plugin, message);
			return forwardSnapshots ? forwardSnapshots[0].message.content : message && message.content;
		},
		getStreamTranslationRenderContent(plugin, message, translation) {
			if (!translation) return "";
			const normalized = plugin.normalizeStoredTranslationData(translation) || translation;
			const translatedContent = normalized.translatedContent != null && normalized.translatedContent !== "" ? normalized.translatedContent : normalized.content;
			return translationDisplayLogic.buildReceivedDisplayContent(plugin, String(translatedContent == null ? "" : translatedContent), normalized.originalContent || "");
		},
		// Forward-aware clone of a stream message with the body text painted in the
		// place the renderer reads it. Returns null when nothing needs to change.
		cloneStreamMessageWithBody(plugin, streamContent, bodyText) {
			const forwardSnapshots = translationDisplayLogic.getForwardedMessageSnapshots(plugin, streamContent);
			if (forwardSnapshots) {
				if (String(forwardSnapshots[0].message.content) === bodyText) return null;
				const clonedMessage = new BDFDB.DiscordObjects.Message(streamContent);
				// The Message constructor is not guaranteed to carry the forward fields;
				// losing messageReference would break the forward frame itself.
				for (const key of ["messageSnapshots", "message_snapshots", "messageReference", "message_reference"]) {
					if (streamContent[key] != null && clonedMessage[key] == null) clonedMessage[key] = streamContent[key];
				}
				const patchedEntry = cloneWithPrototype(forwardSnapshots[0]);
				patchedEntry.message = cloneWithPrototype(forwardSnapshots[0].message);
				patchedEntry.message.content = bodyText;
				clonedMessage[streamContent.messageSnapshots ? "messageSnapshots" : "message_snapshots"] = [patchedEntry].concat(forwardSnapshots.slice(1));
				return clonedMessage;
			}
			if (streamContent.content === bodyText) return null;
			const clonedMessage = new BDFDB.DiscordObjects.Message(streamContent);
			clonedMessage.content = bodyText;
			return clonedMessage;
		},
		// The forward-aware replacement for the legacy `stream.content.content = text`
		// writes: forwards need a snapshot clone, ordinary messages keep the direct
		// write the legacy branches always had.
		paintStreamBody(plugin, stream, bodyText) {
			if (!stream || !stream.content) return;
			const forwardSnapshots = translationDisplayLogic.getForwardedMessageSnapshots(plugin, stream.content);
			if (!forwardSnapshots) {
				stream.content.content = bodyText;
				return;
			}
			const clonedMessage = translationDisplayLogic.cloneStreamMessageWithBody(plugin, stream.content, bodyText);
			if (clonedMessage) stream.content = clonedMessage;
		},
		applyReceivedDisplayViewToStream(plugin, stream, view) {
			if (!stream || !stream.content || !view) return;
			const displayContent = view.translated && view.translation
				? translationDisplayLogic.getStreamTranslationRenderContent(plugin, stream.content, view.translation)
				: translationDisplayLogic.getReceivedDisplayViewRenderContent(plugin, view);
			const sourceEmbeds = !view.translated && view.source && Array.isArray(view.source.embeds) ? view.source.embeds : null;
			const currentEmbeds = Array.isArray(stream.content.embeds) ? stream.content.embeds : [];
			const restoreEmbeds = !!sourceEmbeds && (currentEmbeds.length !== sourceEmbeds.length || sourceEmbeds.some((sourceEmbed, index) => !embedProjectionMatches(plugin, currentEmbeds[index], sourceEmbed)));
			let clonedMessage = translationDisplayLogic.cloneStreamMessageWithBody(plugin, stream.content, displayContent);
			if (!clonedMessage && !restoreEmbeds) return;
			if (!clonedMessage) {
				clonedMessage = new BDFDB.DiscordObjects.Message(stream.content);
				for (const key of ["messageSnapshots", "message_snapshots", "messageReference", "message_reference"]) {
					if (stream.content[key] != null && clonedMessage[key] == null) clonedMessage[key] = stream.content[key];
				}
			}
			if (restoreEmbeds) clonedMessage.embeds = sourceEmbeds.map((sourceEmbed, index) => restoreEmbedFromSource(currentEmbeds[index], sourceEmbed));
			stream.content = clonedMessage;
		},
		applyReceivedDisplayViewToContent(plugin, e, view) {
			if (!e || !e.returnvalue || !e.returnvalue.props) return;
			plugin.cleanupInjectedMessageChildren(plugin.ensureElementChildrenArray(e.returnvalue));
			translationDisplayLogic.clearTranslatedRenderDecorations(plugin, e);
			if (translationDisplayLogic.isForwardContainerMessage(plugin, e.instance && e.instance.props && e.instance.props.message)) {
				if (view) e.returnvalue.props["data-translator-revision"] = String(view.revision);
				else delete e.returnvalue.props["data-translator-revision"];
				return;
			}
			if (!view) {
				delete e.returnvalue.props["data-translator-revision"];
				return;
			}
			e.returnvalue.props["data-translator-revision"] = String(view.revision);
			if (view.translated && view.translation) {
				if (plugin.shouldProtectWrappedTextForPlace(MESSAGE_DIRECTIONS.RECEIVED)) e.returnvalue.props.children = plugin.highlightProtectedWrappedTextInNode(e.returnvalue.props.children, view.messageId);
				if (plugin.settings.general.highlightTranslatedMessages) e.returnvalue.props.className = BDFDB.DOMUtils.formatClassName(e.returnvalue.props.className, "translator-translated-message");
				e.returnvalue.props.style = Object.assign({}, e.returnvalue.props.style, {
					"--translator-accent-color": plugin.getTranslatedTextColor(),
					"--translator-text-color": plugin.getTranslatedTextColor()
				});
				const watermarkNode = translationDisplayLogic.createTranslationWatermarkNode(plugin, view.translation, "translator-translated-watermark");
				if (watermarkNode) plugin.ensureElementChildrenArray(e.returnvalue).push(watermarkNode);
				return;
			}
			if (view.showLoading) plugin.ensureElementChildrenArray(e.returnvalue).push(BDFDB.ReactUtils.createElement("span", {
				key: "translator-translation-loading",
				className: "translator-translation-loading",
				"aria-label": plugin.isChineseUiLanguage() ? "正在翻译" : "Translating"
			}));
		},
		buildReceivedDisplayContent(plugin, translatedContent, originalContent, forceInlineOriginal = false) {
			let content = (translatedContent || "").trim();
			const shouldInlineOriginal = !!(originalContent && (forceInlineOriginal || plugin.settings.general.showOriginalMessage));
			if (shouldInlineOriginal) content += plugin.formatOriginalTextForMessage(originalContent, plugin.shouldUseSpoilerInReceivedOriginal());
			return content;
		},
		refreshTranslationDisplay(plugin, translation) {
			if (!translation) return null;
			translation = Object.assign(translation, plugin.normalizeStoredTranslationData(translation));
			const inlineOriginalBySetting = !!(translation.originalContent && plugin.settings.general.showOriginalMessage);
			translation.content = translationDisplayLogic.buildReceivedDisplayContent(plugin, translation.translatedContent || translation.content, translation.originalContent, false);
			translation.contentIncludesOriginal = inlineOriginalBySetting;
			return translation;
		},
		getReplyPreviewDisplayContent(plugin, translation) {
			if (!translation) return "";
			translation = plugin.normalizeStoredTranslationData(translation);
			const originalContent = (translation.originalContent || "").trim();
			const translatedContent = (translation.translatedContent || translation.content || "").trim();
			return plugin.settings.general.showOriginalInReplyPreview ? (translatedContent || originalContent) : originalContent;
		},
		stripReplyPreviewOriginalSuffix(_plugin, content) {
			content = (content || "").trim();
			if (!content) return "";
			if (/\n\|\|[\s\S]*\|\|$/.test(content)) return content.replace(/\n\|\|[\s\S]*\|\|$/, "").trim();
			const lines = content.split("\n");
			let boundaryIndex = lines.length;
			while (boundaryIndex > 0 && /^\s*>\s?/.test(lines[boundaryIndex - 1])) boundaryIndex--;
			if (boundaryIndex < lines.length) return lines.slice(0, boundaryIndex).join("\n").trim();
			return content;
		},
		getStableReplyPreviewOriginalContent(plugin, message) {
			if (!message) return "";
			const currentContent = (message.content || "").trim();
			const storedTranslations = plugin.ensureReceivedDisplayRuntime().getPreviewCandidates(message.id).filter(Boolean);
			for (const storedTranslation of storedTranslations) {
				const normalizedTranslation = plugin.normalizeStoredTranslationData(storedTranslation);
				const originalContent = (normalizedTranslation.originalContent || "").trim();
				const translatedContent = (normalizedTranslation.translatedContent || normalizedTranslation.content || "").trim();
				const displayContent = translationDisplayLogic.getReplyPreviewDisplayContent(plugin, normalizedTranslation).trim();
				if (!originalContent) continue;
				if (!currentContent || currentContent == originalContent || currentContent == translatedContent || currentContent == displayContent || currentContent == translationDisplayLogic.stripReplyPreviewOriginalSuffix(plugin, displayContent)) return originalContent;
			}
			return currentContent;
		},
		getStableReplyPreviewMessage(plugin, message) {
			if (!message) return message;
			const stableMessage = new BDFDB.DiscordObjects.Message(message);
			stableMessage.content = translationDisplayLogic.getStableReplyPreviewOriginalContent(plugin, message);
			return stableMessage;
		},
		getReplyPreviewFallbackContent(plugin, message) {
			if (!message) return "";
			return translationDisplayLogic.stripReplyPreviewOriginalSuffix(plugin, message.content || "");
		},
		getReplyPreviewDisplayContentForMessage(plugin, message, channelId = null) {
			if (!message) return "";
			const originalContent = translationDisplayLogic.getStableReplyPreviewOriginalContent(plugin, message) || (message.content || "").trim();
			// The projection wraps the winning translation with its provenance; the callers
			// below only need the translation itself.
			const previewProjection = plugin.ensureReceivedDisplayRuntime().getReplyPreviewProjection(message.id, {channelId});
			const storedTranslation = previewProjection && previewProjection.translation;
			if (storedTranslation && translationDisplayLogic.shouldDisplayStoredTranslation(plugin, storedTranslation, channelId || translationDisplayLogic.getStoredTranslationChannelId(plugin, message.id))) {
				const normalizedTranslation = plugin.normalizeStoredTranslationData(storedTranslation);
				const translatedContent = (normalizedTranslation.translatedContent || normalizedTranslation.content || "").trim();
				if (!normalizedTranslation.auto || plugin.settings.general.showOriginalInReplyPreview) return translatedContent || originalContent;
			}
			return originalContent;
		},
		applyStoredTranslationToMessage(plugin, message, translation, originalContentData = null) {
			if (!message || !translation) return null;
			const storedTranslation = translationDisplayLogic.refreshTranslationDisplay(plugin, Object.assign({
				channelId: translation.channelId || message.channel_id || null,
				auto: !!translation.auto
			}, translation));
			plugin.ensureReceivedDisplayRuntime().clearSuppression(message.id);
			plugin.ensureReceivedDisplayRuntime().commitManualTranslation({
				messageId: message.id,
				channelId: storedTranslation.channelId,
				translation: storedTranslation,
				manualOptions: {independentOfTextAreaSwitch: !!storedTranslation.independentOfTextAreaSwitch},
				archive: {message: new BDFDB.DiscordObjects.Message(message), originalContentData: originalContentData || plugin.extractOriginalContentData(message)}
			});
			return storedTranslation;
		},
		clearDisplayedTranslationState(plugin, messageId, options = {}) {
			if (!messageId) return;
			const config = Object.assign({
				clearReplyPreview: false,
				preserveSuppressed: false
			}, options);
			plugin.ensureReceivedDisplayRuntime().clearDisplayedTranslation(messageId, {preserveArchive: true, preserveSuppressed: config.preserveSuppressed, clearPreview: config.clearReplyPreview});
			// preserveArchive is not an optimisation: a rendered message whose props still
			// carry translated text needs the archived source on its next render to restore
			// the original, and the render path consumes the archive once it has done so.
			if (!config.preserveSuppressed) plugin.ensureReceivedDisplayRuntime().clearSuppression(messageId);
			if (config.clearReplyPreview) {
				plugin.ensureReceivedDisplayRuntime().clearPreview(messageId);
			}
		},
		getStoredTranslationChannelId(plugin, messageId, fallbackChannelId = null, translation = null) {
			if (fallbackChannelId) return fallbackChannelId;
			if (translation && translation.channelId) return translation.channelId;
			const displayedTranslation = plugin.ensureReceivedDisplayRuntime().getDisplayState(messageId);
			if (displayedTranslation && displayedTranslation.channelId) return displayedTranslation.channelId;
			const replyPreviewTranslation = plugin.ensureReceivedDisplayRuntime().getPreviewTranslation(messageId);
			if (replyPreviewTranslation && replyPreviewTranslation.channelId) return replyPreviewTranslation.channelId;
			const archive = plugin.ensureReceivedDisplayRuntime().peekSourceArchive(messageId);
			return archive && archive.message.channel_id || null;
		},
		shouldDisplayStoredTranslation(plugin, translation, channelId = null) {
			if (!translation) return false;
			const normalizedTranslation = plugin.normalizeStoredTranslationData(translation);
			if (normalizedTranslation.manual && normalizedTranslation.independentOfTextAreaSwitch) return true;
			const resolvedChannelId = channelId || normalizedTranslation.channelId || null;
			if (normalizedTranslation.auto && resolvedChannelId && !plugin.isTranslationEnabled(resolvedChannelId)) return false;
			return true;
		},
		getStoredTranslationOriginalContent(plugin, translation, fallbackContent = "") {
			if (!translation) return fallbackContent;
			const normalizedTranslation = plugin.normalizeStoredTranslationData(translation);
			return normalizedTranslation.originalContent != null ? String(normalizedTranslation.originalContent) : fallbackContent;
		},
		getActiveMessageTranslation(plugin, message, channelId = null, expectedSignature = null) {
			if (!message || !message.id) return null;
			const displayRecord = plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id);
			// Store records are frozen, and refreshTranslationDisplay recomposes in place,
			// so every read that reaches it works on a detached copy.
			let translation = displayRecord && displayRecord.status == "translated" && displayRecord.translation ? Object.assign({}, displayRecord.translation) : null;
			if (!translation) return null;
			const resolvedChannelId = translationDisplayLogic.getStoredTranslationChannelId(plugin, message.id, channelId, translation);
			if (!translationDisplayLogic.shouldDisplayStoredTranslation(plugin, translation, resolvedChannelId)) {
				translationDisplayLogic.clearDisplayedTranslationState(plugin, message.id);
				return null;
			}
			if (expectedSignature && translation.signature && translation.signature != expectedSignature) {
				translationDisplayLogic.clearDisplayedTranslationState(plugin, message.id);
				return null;
			}
			translation = translationDisplayLogic.refreshTranslationDisplay(plugin, translation);
			if (translation.auto && plugin.isTranslationResultTooSimilar(translation)) {
				translationDisplayLogic.clearDisplayedTranslationState(plugin, message.id);
				plugin.clearCachedTranslation(message.id);
				return null;
			}
			// The refreshed projection is display-only; the record itself is unchanged.
			return translation;
		},
		getActiveReplyPreviewTranslation(plugin, message, channelId) {
			if (!message || !message.id) return null;
			const translation = plugin.getReplyPreviewTranslation(message, channelId);
			if (!translation) return null;
			if (!translationDisplayLogic.shouldDisplayStoredTranslation(plugin, translation, channelId)) {
				plugin.ensureReceivedDisplayRuntime().clearPreview(message.id);
				return null;
			}
			return translation;
		},
		processMessageReply(plugin, e) {
			if (!e.instance.props.referencedMessage || !e.instance.props.referencedMessage.message) return;
			const referencedMessage = e.instance.props.referencedMessage.message;
			const stableReferencedMessage = translationDisplayLogic.getStableReplyPreviewMessage(plugin, referencedMessage);
			const baseMessage = e.instance.props.baseMessage || null;
			const channelId = plugin.getMessageChannelId(baseMessage || stableReferencedMessage);
			const baseProjection = plugin.ensureReceivedDisplayRuntime().getReplyPreviewProjection(stableReferencedMessage.id, {channelId});
			const storedMessageTranslation = baseProjection && baseProjection.translation;
			const hasVisibleStoredTranslation = storedMessageTranslation && translationDisplayLogic.shouldDisplayStoredTranslation(plugin, storedMessageTranslation, channelId) || translationDisplayLogic.getActiveReplyPreviewTranslation(plugin, stableReferencedMessage, channelId);
			const shouldQueuePreview = !hasVisibleStoredTranslation && plugin.shouldAutoTranslateReplyPreview(baseMessage, stableReferencedMessage, channelId);
			if (shouldQueuePreview) plugin.queueReplyPreviewTranslation(stableReferencedMessage, channelId, {baseMessage});
			const fallbackContent = translationDisplayLogic.getReplyPreviewDisplayContentForMessage(plugin, stableReferencedMessage, channelId) || translationDisplayLogic.getReplyPreviewFallbackContent(plugin, stableReferencedMessage) || (stableReferencedMessage.content || "").trim();
			e.instance.props.referencedMessage = Object.assign({}, e.instance.props.referencedMessage);
			const previewMessage = new BDFDB.DiscordObjects.Message(stableReferencedMessage);
			previewMessage.content = fallbackContent;
			plugin.markReplyPreviewRenderMessage(previewMessage, {channelId, hostMessageId: (hasVisibleStoredTranslation || shouldQueuePreview) && baseMessage && baseMessage.id});
			e.instance.props.referencedMessage.message = previewMessage;
			if (e.returnvalue && e.returnvalue.props) {
				e.returnvalue = plugin.wrapReplyPreviewJumpPause(plugin.stripTranslatorStylingFromReplyPreviewNode(e.returnvalue));
				const hostMessageId = baseMessage && baseMessage.id;
				const hostRevision = hostMessageId && plugin.ensureReceivedDisplayRuntime().getPreviewHostRenderRevision(channelId, hostMessageId);
				if (e.returnvalue && e.returnvalue.props) {
					if (hostRevision != null) e.returnvalue.props["data-translator-preview-revision"] = String(hostRevision);
					else delete e.returnvalue.props["data-translator-preview-revision"];
				}
			}
		},
		resolveLoadedMessageContentTranslation(plugin, message, channelId) {
			if (plugin.getReceivedAutoTranslateScope() != "loaded_messages" || !plugin.isTranslationEnabled(channelId) || plugin.isOwnMessage(message) || plugin.ensureReceivedDisplayRuntime().isSuppressed(message.id) || plugin.ensureLiveTranslationQueue().isMessageQueued(message.id)) return null;
			// A store record that is already translated or has an active request must not
			// re-enter the queue on every render; that would loop commit -> repaint -> requeue.
			const storeView = plugin.getReceivedDisplayRuntimeView(message.id);
			if (storeView && (storeView.translated || storeView.showLoading)) return null;
			const originalContentData = plugin.extractOriginalContentData(message);
			const cachedTranslation = plugin.getCachedReceivedTranslation(message, channelId, originalContentData);
			const liveMessage = plugin.isLikelyLiveAutoTranslateMessage(message, channelId);
			// Cached live results also queue: the acknowledged display commit repaints text
			// and decoration atomically instead of decorating a still-original render.
			if (cachedTranslation || plugin.shouldAutoTranslateReceivedMessage(message, {id: channelId}, originalContentData)) {
				plugin.queueAutoTranslateMessage(message, {id: channelId}, originalContentData, {
					historicalLoad: !liveMessage,
					deferWhileReading: false,
					cachedTranslation
				});
			}
			return null;
		},
		prepareMessageContentDisplay(plugin, e) {
			let message = e.instance.props.message;
			// Every content render registers its live instance: a later translation
			// commit can then repaint exactly this row (adapter live path, 2026-08-19)
			// instead of rebuilding the whole chat layer.
			if (message && message.id) {
				try {plugin.ensureReceivedDisplayRuntime().recordContentInstance(message.id, e.instance);}
				catch (err) {}
			}
			const channelId = plugin.getMessageChannelId(message);
			let translation = translationDisplayLogic.getActiveMessageTranslation(plugin, message, channelId);
			if (!translation && plugin.ensureReceivedDisplayRuntime().hasSourceArchive(message.id)) {
				message = e.instance.props.message = new BDFDB.DiscordObjects.Message(plugin.ensureReceivedDisplayRuntime().consumeSourceArchive(message.id).message);
			}
			// Automatic untranslate and configuration changes have no archive; the record's
			// source and restoredTranslation tell this render "the text on the message is our
			// retired paint, put the original back". The content component can re-render
			// without a stream pass, so it must own the same restoration rule.
			if (!translation && message.id) {
				const state = plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id);
				const visibleBody = translationDisplayLogic.getStreamBodyContent(plugin, message);
				if (state && state.status != "translated" && state.restoredTranslation && state.source && state.source.content
					&& visibleBody !== state.source.content
					&& plugin.matchesPaintedTranslationContent(visibleBody, state.restoredTranslation, message)) {
					const restoredMessage = translationDisplayLogic.cloneStreamMessageWithBody(plugin, message, state.source.content);
					if (restoredMessage) message = e.instance.props.message = restoredMessage;
				}
			}
			if (!translation) translation = translationDisplayLogic.resolveLoadedMessageContentTranslation(plugin, message, channelId);
			return {message, channelId, translation};
		},
		createTranslationWatermarkNode(plugin, translation, key) {
			if (!translation || !translation.content) return null;
			return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
				key,
				text: plugin.getTranslationTooltipText(translation.input, translation.output),
				tooltipConfig: {style: "max-width: 400px"},
				children: BDFDB.ReactUtils.createElement("span", {
					className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.messagetimestamp, BDFDB.disCN.messagetimestampinline, BDFDB.disCN._translatortranslated),
					children: BDFDB.ReactUtils.createElement("span", {
						className: BDFDB.disCN.messageedited,
						children: `(${plugin.labels.translated_watermark})`
					})
				})
			});
		},
		createTranslationLoadingNode(plugin, message) {
			if (!message || !plugin.isMessageTranslationPending(message.id, plugin.getMessageChannelId(message))) return null;
			return BDFDB.ReactUtils.createElement("span", {
				key: "translator-translation-loading",
				className: "translator-translation-loading",
				"aria-label": plugin.isChineseUiLanguage() ? "正在翻译" : "Translating"
			});
		},
		clearTranslatedRenderDecorations(_plugin, e) {
			if (!e || !e.returnvalue || !e.returnvalue.props) return;
			const className = String(e.returnvalue.props.className || "")
				.split(/\s+/)
				.filter(name => name && name != "translator-translated-message")
				.join(" ");
			e.returnvalue.props.className = className;
			const style = Object.assign({}, e.returnvalue.props.style || {});
			delete style["--translator-accent-color"];
			delete style["--translator-text-color"];
			e.returnvalue.props.style = style;
		},
		applyMessageContentRenderDecorations(plugin, e, message, translation) {
			let children = plugin.ensureElementChildrenArray(e.returnvalue);
			plugin.cleanupInjectedMessageChildren(children);
			translationDisplayLogic.clearTranslatedRenderDecorations(plugin, e);
			// The parent message of a forward has no body; styling it creates the empty
			// translated rectangle seen above the native "Forwarded" header. The nested
			// snapshot clone owns body, watermark and colour instead.
			if (translationDisplayLogic.isForwardContainerMessage(plugin, message)) return;
			const translationPlace = plugin.isOwnMessage(message) ? MESSAGE_DIRECTIONS.SENT : MESSAGE_DIRECTIONS.RECEIVED;
			if (translation && plugin.shouldProtectWrappedTextForPlace(translationPlace)) {
				e.returnvalue.props.children = plugin.highlightProtectedWrappedTextInNode(e.returnvalue.props.children, message.id);
				children = plugin.ensureElementChildrenArray(e.returnvalue);
			}
			if (translation && plugin.settings.general.highlightTranslatedMessages) e.returnvalue.props.className = BDFDB.DOMUtils.formatClassName(e.returnvalue.props.className, "translator-translated-message");
			if (translation) e.returnvalue.props.style = Object.assign({}, e.returnvalue.props.style, {
				"--translator-accent-color": plugin.getTranslatedTextColor(),
				"--translator-text-color": plugin.getTranslatedTextColor()
			});
			const watermarkNode = translationDisplayLogic.createTranslationWatermarkNode(plugin, translation, "translator-translated-watermark");
			if (watermarkNode) children.push(watermarkNode);
			const loadingNode = !translation && translationDisplayLogic.createTranslationLoadingNode(plugin, message);
			if (loadingNode) children.push(loadingNode);
		},
		processEmbed(plugin, e) {
			if (!e.instance.props.embed || !e.instance.props.embed.message_id) return;
			const embed = e.instance.props.embed;
			const hasOwn = key => Object.prototype.hasOwnProperty.call(embed, key);
			let translation = translationDisplayLogic.getActiveMessageTranslation(plugin, {id: embed.message_id}, plugin.getDisplayedTranslationChannelId(embed.message_id));
			if (!translation) {
				const storeView = plugin.getReceivedDisplayRuntimeView(embed.message_id);
				if (storeView && storeView.translated && storeView.translation && storeView.translation.embeds) translation = storeView.translation;
			}
			const embedTranslation = translation && translation.embeds && translation.embeds[embed.id];
			if (embedTranslation) {
				const translatedOrOriginal = (translated, original) => translated != null && String(translated).trim() ? translated : original;
				const originalDescription = hasOwn("originalDescription") ? embed.originalDescription : embed.rawDescription;
				const originalTitle = hasOwn("originalTitle") ? embed.originalTitle : embed.rawTitle;
				const originalFields = hasOwn("originalFields") ? embed.originalFields : embed.fields;
				const originalFooter = hasOwn("originalFooter") ? embed.originalFooter : Object.assign({}, embed.footer);
				const translatedFields = Array.isArray(embedTranslation.fields) ? embedTranslation.fields : [];
				const sourceFields = Array.isArray(originalFields) ? originalFields : [];
				const fields = (sourceFields.length ? sourceFields : translatedFields).map((field, index) => ({
					rawName: translatedOrOriginal(translatedFields[index] && translatedFields[index].name, field && (field.rawName || field.name)),
					rawValue: translatedOrOriginal(translatedFields[index] && translatedFields[index].value, field && (field.rawValue || field.value))
				}));
				if (!e.returnvalue) e.instance.props.embed = Object.assign({}, embed, {
					rawDescription: translatedOrOriginal(embedTranslation.description, originalDescription),
					rawTitle: translatedOrOriginal(embedTranslation.title, originalTitle),
					footer: Object.assign({}, embed.footer || {}, {
						text: translatedOrOriginal(embedTranslation.footerText, originalFooter && originalFooter.text)
					}),
					fields,
					originalDescription,
					originalTitle,
					originalFields,
					originalFooter
				});
				else {
					let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {props: [["className", BDFDB.disCN.embeddescription]]});
					if (index > -1) {
						if (!Array.isArray(children[index].props.children)) {
							children[index].props.children = [children[index].props.children];
						}
						plugin.cleanupInjectedMessageChildren(children[index].props.children);
						const watermarkNode = translationDisplayLogic.createTranslationWatermarkNode(plugin, translation, "translator-embed-watermark");
						if (watermarkNode) children[index].props.children.push(watermarkNode);
					}
				}
			}
			else if (!e.returnvalue && ["originalDescription", "originalTitle", "originalFields", "originalFooter"].some(hasOwn)) {
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
	};

	return translationDisplayLogic;
}

module.exports = {MESSAGE_DIRECTIONS, createTranslationDisplayLogic};
