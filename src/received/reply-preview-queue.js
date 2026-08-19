// Queues reply-preview translations: eligibility gates, cache-hit commits, and
// the silent provider request guarded by the pending token and content signature.
// Extracted verbatim from the legacy runtime in display-unification 5d; policy
// and stores stay on the plugin, the runtime-active flag is injected because it
// lives in the plugin factory closure.
function createReplyPreviewQueue({getPlugin, messageTypes, isRuntimeActive}) {
	function queueReplyPreviewTranslation(message, channelId, contextOptions = {}) {
		const plugin = getPlugin();
		if (!message || !message.id || !channelId || plugin.ensureReceivedDisplayRuntime().isPreviewPending(message.id)) return;
		const baseMessage = contextOptions.baseMessage || null;
		if (baseMessage && !plugin.shouldAutoTranslateReplyPreview(baseMessage, message, channelId)) return;
		if (plugin.ensureReceivedDisplayRuntime().isSuppressed(message.id)) return;
		if (!plugin.isTranslationEnabled(channelId) || plugin.isOwnMessage(message)) return;
		const originalContent = (message.content || "").trim();
		if (!originalContent) return;
		const signature = plugin.createReplyPreviewSignature(message, channelId, originalContent);
		const existingTranslation = plugin.ensureReceivedDisplayRuntime().getPreviewTranslation(message.id);
		if (existingTranslation && existingTranslation.signature == signature) return;
		const cachedTranslation = plugin.getCachedReceivedTranslation(message, channelId);
		if (cachedTranslation) {
			const previewTranslation = plugin.createReplyPreviewTranslationData(message, channelId, cachedTranslation);
			if (previewTranslation) {const previewCommit = plugin.ensureReceivedDisplayRuntime().commitPreviewResult({messageId: message.id, channelId, signature, translation: previewTranslation}); if (previewCommit && previewCommit.catch) previewCommit.catch(_ => {});}
			return;
		}
		const request = plugin.ensureReceivedDisplayRuntime().markPreviewPending({messageId: message.id, channelId, signature});
		plugin.translateText(originalContent, messageTypes.RECEIVED, (translation, input, output) => {
			if (!isRuntimeActive() || !plugin.ensureReceivedDisplayRuntime().releasePreviewPending(message.id, request)) return;
			if (plugin.createReplyPreviewSignature(message, channelId, (message.content || "").trim()) != signature) return;
			if (baseMessage && !plugin.shouldAutoTranslateReplyPreview(baseMessage, message, channelId)) return;
			if (!plugin.isTranslationEnabled(channelId)) return;
			if (translation) {
				const previewCommit = plugin.ensureReceivedDisplayRuntime().commitPreviewResult({messageId: message.id, channelId, signature, translation: {
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

	return Object.freeze({queueReplyPreviewTranslation});
}

module.exports = {createReplyPreviewQueue};
