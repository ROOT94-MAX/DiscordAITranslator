const {createDisplayRuntime} = require("./display-runtime");
const {resolveStoreDispatcher} = require("../discord/store-dispatcher");

// Owns the plugin/BDFDB/browser adapter for received display state and rendering.
// The display runtime retains state transitions and render policy; this module maps
// Discord Stores, Flux, viewport restoration and capsule accounting into its ports.
function createPluginReceivedDisplayRuntime({
	plugin,
	BDFDB,
	getRuntimeActive = () => true,
	getDocument = () => typeof document == "undefined" ? null : document,
	requestAnimationFrame: scheduleAnimationFrame = callback => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : setTimeout(callback, 0),
	resolveDispatcher: resolveDisplayDispatcher = () => resolveStoreDispatcher(BDFDB, ["dispatch"]),
	createRuntime = createDisplayRuntime
}) {
	return createRuntime({
		// Display fallback needs only list selectors and rerender support; live class
		// rows optionally use ReactUtils.flushSync for one commit.
		BDFDB: {dotCN: BDFDB.dotCN || {}, MessageUtils: BDFDB.MessageUtils, ReactUtils: BDFDB.ReactUtils},
		document: {
			querySelector: selector => {
				const documentRef = getDocument();
				return !documentRef || !selector ? null : documentRef.querySelector(selector);
			}
		},
		requestAnimationFrame: scheduleAnimationFrame,
		isRuntimeActive: getRuntimeActive,
		// Preview-wave coalescing stays on BDFDB's managed timer and the shared
		// scheduler gate.
		setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		canRepaintNow: () => plugin.canRepaintReceivedDisplayNow(),
		resolveDispatcher: resolveDisplayDispatcher,
		getStoreMessage: (channelId, messageId) => {
			try {return BDFDB.LibraryStores.MessageStore.getMessage(channelId, messageId) || null;}
			catch (error) {return null;}
		},
		getGuildId: channelId => {
			try {
				const channel = BDFDB.LibraryStores.ChannelStore.getChannel(channelId);
				return channel && channel.guild_id || null;
			}
			catch (error) {return null;}
		},
		onTranslationDisplayed: (channelId, messageId) => plugin.ensureLoadedStatusCapsuleController().recordTranslationsDisplayed(channelId, [messageId]),
		getUserScrollIntentSequence: () => plugin.ensureMessageViewportStore().getUserScrollIntentSequence(),
		// Scroll preservation is best-effort: capture/restore failures never break a
		// display transaction. The viewport store keeps anchor-over-offset policy.
		captureScrollState: context => {
			try {return plugin.ensureMessageViewportStore().captureDisplayTransactionScrollState(context);}
			catch (error) {return null;}
		},
		restoreScrollState: scrollerState => {
			try {plugin.ensureMessageViewportStore().restoreDisplayTransactionScrollState(scrollerState);}
			catch (error) {}
		},
		restoreScrollStateNow: scrollerState => plugin.ensureMessageViewportStore().restoreDisplayTransactionScrollStateNow(scrollerState)
	});
}

module.exports = {createPluginReceivedDisplayRuntime};
