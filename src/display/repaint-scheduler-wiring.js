const {createDisplayRepaintScheduler} = require("./repaint-scheduler");

// Owns the plugin/BDFDB adapter for repaint cadence. The scheduler retains retry,
// coalescing, lane attribution and deferral policy; this module supplies the live
// display renderer, Discord-state predicates, lifecycle repaint, and managed timers.
function createPluginDisplayRepaintScheduler({
	plugin,
	BDFDB,
	onRenderOutcome = () => {},
	createScheduler = createDisplayRepaintScheduler
}) {
	return createScheduler({
		renderMessages: (messageIds, meta) => plugin.ensureReceivedDisplayRuntime().renderMessages(messageIds, meta),
		onRenderOutcome,
		canRepaintNow: () => plugin.canRepaintReceivedDisplayNow(),
		isViewingHistory: () => plugin.isViewingMessageHistory(),
		isSettingsSurfaceOpen: () => plugin.isTranslatorSettingsSurfaceOpen(),
		isTextAreaFocused: () => plugin.isChannelTextAreaFocused(),
		repaintAll: () => plugin.rerenderMessagesWithScrollPreserved(),
		setTimeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		clearTimeout: timer => BDFDB.TimeUtils.clear(timer)
	});
}

module.exports = {createPluginDisplayRepaintScheduler};
