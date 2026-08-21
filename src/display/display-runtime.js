const {createMessageStateStore} = require("./message-state-store");
const {createTranslationDisplayController} = require("./translation-display-controller");
const {createDiscordRenderAdapter} = require("./discord-render-adapter");
const {createLiveRowRepaint} = require("./live-row-repaint");
const {createFluxRowRepaint} = require("./flux-row-repaint");
const {resolveFlushSync} = require("./react-flush-sync");

function createDisplayRuntime(dependencies) {
	// The compile-time constant strips the journal implementation from release bundles;
	// node test runs see an undefined identifier and disable the journal the same way.
	const debugEnabled = typeof __TRANSLATOR_DISPLAY_DEBUG__ !== "undefined" && __TRANSLATOR_DISPLAY_DEBUG__;
	const journal = debugEnabled ? require("../diagnostics/display-transition-journal").createDisplayTransitionJournal({enabled: true}) : null;
	const store = createMessageStateStore({journal, onTranslationDisplayed: dependencies.onTranslationDisplayed});
	// Per-row repaint, two routes under one adapter slot. The instance registry only
	// works on class-component clients (this client's reading is 0L - BDFDB hands
	// function components a synthetic instance); the flux route enters Discord's Store
	// projection without remounting the Composer. The adapter's exact DOM revision
	// confirmation, not the dispatch attempt itself, owns the visible verdict.
	const liveRowRepaint = createLiveRowRepaint({
		reactUtils: dependencies.BDFDB && dependencies.BDFDB.ReactUtils,
		resolveFlushSync: () => resolveFlushSync(dependencies.BDFDB && dependencies.BDFDB.ReactUtils)
	});
	const fluxRowRepaint = createFluxRowRepaint({
		resolveDispatcher: dependencies.resolveDispatcher || (() => null),
		getStoreMessage: dependencies.getStoreMessage || (() => null),
		getGuildId: dependencies.getGuildId || (() => null)
	});
	const rowRepaint = {
		repaintRows(messageIds, context) {
			const ownerMessageIds = new Set([].concat(context && context.ownerMessageIds || []).map(String));
			// A MessageContent class update cannot reach the reply header above it. Preview
			// hosts always go through Discord's Store row projection; ordinary content rows
			// may still use the cheaper registered-instance path first.
			const liveCandidates = messageIds.filter(messageId => !ownerMessageIds.has(String(messageId)));
			const attempted = new Set(liveRowRepaint.repaintRows(liveCandidates));
			const remaining = messageIds.filter(messageId => !attempted.has(String(messageId)));
			if (remaining.length) for (const messageId of fluxRowRepaint.repaintRows(remaining, context || {})) attempted.add(messageId);
			return [...attempted];
		}
	};
	const renderAdapter = createDiscordRenderAdapter(Object.assign({}, dependencies, {liveRowRepaint: rowRepaint}));
	// The preview-wave coalescer needs a managed timer and the repaint gate; absent
	// wiring falls back to the controller's own defaults (globals, always-open gate).
	const controller = createTranslationDisplayController({store, renderAdapter, journal, setTimeout: dependencies.setTimeout, canRepaintNow: dependencies.canRepaintNow});

	return Object.freeze({
		getTransitionJournal: () => journal,
		// Settings-panel diagnostics: how many transactions painted per-row (live) or
		// through the whole-layer rebuild, with per-lane rebuild attribution.
		getRebuildStats: () => renderAdapter.getRebuildStats(),
		// Called from the message-content render hook on every content render, so the
		// live path always holds the newest instance for each mounted row.
		recordContentInstance: (messageId, instance) => liveRowRepaint.recordContentInstance(messageId, instance),
		captureSource: snapshot => store.captureSource(snapshot),
		setChannelGeneration: (channelId, generation) => store.setChannelGeneration(channelId, generation),
		getChannelGeneration: channelId => store.getChannelGeneration(channelId),
		getDisplayView: messageId => controller.getDisplayView(messageId),
		markPending: (request, options) => controller.markPending(request, options),
		releasePending: request => store.releasePending(request),
		commitMessageResult: (result, options) => controller.commitMessageResult(result, options),
		commitHistoricalBatch: results => controller.commitHistoricalBatch(results),
		renderMessages: (messageIds, meta) => controller.renderMessages(messageIds, meta),
		refreshDisplayTransaction: request => controller.refreshDisplayTransaction(request),
		deleteMessage: (messageId, channelId, options) => controller.deleteMessage(messageId, channelId, options),
		restoreMessage: (messageId, options) => controller.restoreMessage(messageId, options),
		restoreChannel: (channelId, options) => controller.restoreChannel(channelId, options),
		restoreAll: options => controller.restoreAll(options),
		// The surface the legacy display maps are being retired onto. These are plain
		// store passthroughs rather than controller operations because none of them
		// paints anything - they are state the render paths read on their next pass.
		getDisplayState: messageId => store.getDisplayState(messageId),
		commitManualTranslation: request => store.commitManualTranslation(request),
		clearDisplayedTranslation: (messageId, options) => store.clearDisplayedTranslation(messageId, options),
		consumeSourceArchive: messageId => store.consumeSourceArchive(messageId),
		peekSourceArchive: messageId => store.peekSourceArchive(messageId),
		dropSourceArchive: messageId => store.dropSourceArchive(messageId),
		hasSourceArchive: messageId => store.hasSourceArchive(messageId),
		suppress: messageId => store.suppress(messageId),
		isSuppressed: messageId => store.isSuppressed(messageId),
		clearSuppression: messageId => store.clearSuppression(messageId),
		clearAllSuppression: () => store.clearAllSuppression(),
		resolveChannelId: (messageId, options) => store.resolveChannelId(messageId, options),
		listTranslated: () => store.listTranslated(),
		pruneChannel: channelId => store.pruneChannel(channelId),
		capturePreviewSource: snapshot => store.capturePreviewSource(snapshot),
		commitPreviewResult: (result, options) => controller.commitPreviewResult(result, options),
		markPreviewPending: request => store.markPreviewPending(request),
		isPreviewPending: messageId => store.isPreviewPending(messageId),
		getPreviewPending: messageId => store.getPreviewPending(messageId),
		// Two arguments, not one: markPreviewPending hands back a token string, and the
		// store keys the release on the message id with the token as the guard against a
		// superseded request releasing its successor's slot.
		releasePreviewPending: (messageId, token) => store.releasePreviewPending(messageId, token),
		getPreviewTranslation: (messageId, options) => store.getPreviewTranslation(messageId, options),
		getPreviewCandidates: messageId => store.getPreviewCandidates(messageId),
		getReplyPreviewProjection: (messageId, options) => store.getReplyPreviewProjection(messageId, options),
		clearPreview: messageId => store.clearPreview(messageId),
		clearPreviews: channelId => store.clearPreviews(channelId),
		listPreviewed: () => store.listPreviewed(),
		markPreviewHost: (channelId, referencedMessageId, hostMessageId) => store.markPreviewHost(channelId, referencedMessageId, hostMessageId),
		getPreviewHostMessageIds: (channelId, referencedMessageIds) => store.getPreviewHostMessageIds(channelId, referencedMessageIds),
		beginPreviewHostRefresh: (channelId, hostMessageIds) => store.beginPreviewHostRefresh(channelId, hostMessageIds),
		getPreviewHostRenderRevision: (channelId, hostMessageId) => store.getPreviewHostRenderRevision(channelId, hostMessageId),
		acknowledgePreviewHostRefresh: (channelId, hostMessageIds) => store.acknowledgePreviewHostRefresh(channelId, hostMessageIds),
		retirePreviewHostRefresh: (channelId, hostMessageIds) => store.retirePreviewHostRefresh(channelId, hostMessageIds),
		markPreviewEligible: (channelId, messageId) => store.markPreviewEligible(channelId, messageId),
		isPreviewEligible: (channelId, messageId) => store.isPreviewEligible(channelId, messageId),
		clearPreviewEligibility: channelId => store.clearPreviewEligibility(channelId)
	});
}

module.exports = {createDisplayRuntime};
