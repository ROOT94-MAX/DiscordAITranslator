const {createHistoricalSnapshotCadence} = require("./historical-snapshot-cadence");

// Owns the plugin/BDFDB adapter for historical quiet-window policy. The cadence
// module keeps sealing and merge rules; this wiring supplies managed time plus the
// three runtime facts it needs without teaching it about the plugin.
function createPluginHistoricalSnapshotCadence({
	plugin,
	BDFDB,
	createCadence = createHistoricalSnapshotCadence
}) {
	return createCadence({
		timeout: (callback, delay) => BDFDB.TimeUtils.timeout(callback, delay),
		clear: timer => BDFDB.TimeUtils.clear(timer),
		isUserActivelyScrolling: channelId => plugin.isUserActivelyScrollingMessages(channelId),
		isCurrentQueue: (channelId, entry) => plugin.ensureHistoricalJobRegistry().isCurrentQueue(channelId, entry),
		finishSnapshot: channelId => plugin.finishHistoricalTranslationSnapshot(channelId)
	});
}

module.exports = {createPluginHistoricalSnapshotCadence};
