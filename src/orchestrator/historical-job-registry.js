// Owns the bookkeeping around historical (loaded-message) translation jobs: the
// per-channel job queues, the id sequence, the runtime generation, and the ledger
// of items that failed and may be retried.
//
// It deliberately does not know what a job DOES. Job execution, provider calls and
// display commits stay with their owners; this module answers "which jobs exist for
// this channel", "is this job still the current one", and "what failed here".
function createHistoricalJobRegistry() {
	const queues = new Map();
	const failedSnapshots = new Map();
	let jobSequence = 0;
	let runtimeGeneration = 0;

	function normalizeChannelId(channelId) {
		return channelId == null ? "" : String(channelId);
	}

	return Object.freeze({
		// A queue entry is created on demand so callers can ask about a channel that
		// has never had a job without allocating one.
		getQueue(channelId, createWhenMissing = true) {
			const key = normalizeChannelId(channelId);
			if (!key) return null;
			let entry = queues.get(key);
			if (!entry && createWhenMissing) {
				entry = {channelId: key, generation: 0, jobs: [], runningPromise: null, startToken: null, intakeBlocked: false, pendingLiveHandoffTicket: null};
				queues.set(key, entry);
			}
			return entry || null;
		},
		hasQueue(channelId) {
			return queues.has(normalizeChannelId(channelId));
		},
		isCurrentQueue(channelId, entry) {
			return !!entry && queues.get(normalizeChannelId(channelId)) === entry;
		},
		deleteQueue(channelId) {
			return queues.delete(normalizeChannelId(channelId));
		},
		clearQueues() {
			queues.clear();
		},
		listQueues() {
			return [...queues.values()];
		},
		nextJobId(channelId) {
			return `${normalizeChannelId(channelId)}:${++jobSequence}`;
		},
		// Bumping the generation is how a plugin stop or a bulk cancel makes every
		// in-flight job stale without having to reach into each one.
		advanceRuntimeGeneration() {
			return ++runtimeGeneration;
		},
		getRuntimeGeneration() {
			return runtimeGeneration;
		},
		getFailedSnapshot(channelId) {
			const key = normalizeChannelId(channelId);
			return key ? failedSnapshots.get(key) || null : null;
		},
		hasFailedMessage(channelId, messageId, signature = null) {
			const entry = failedSnapshots.get(normalizeChannelId(channelId));
			const id = normalizeChannelId(messageId);
			if (!entry || !id || !Array.isArray(entry.items)) return false;
			const item = entry.items.find(candidate => candidate && candidate.message && normalizeChannelId(candidate.message.id) === id);
			if (!item) return false;
			return !item.signature || signature == null || String(item.signature) === String(signature);
		},
		setFailedSnapshot(channelId, snapshot) {
			const key = normalizeChannelId(channelId);
			if (!key) return null;
			failedSnapshots.set(key, snapshot);
			return snapshot;
		},
		deleteFailedSnapshot(channelId) {
			return failedSnapshots.delete(normalizeChannelId(channelId));
		},
		clearFailedSnapshots() {
			failedSnapshots.clear();
		}
	});
}

module.exports = {createHistoricalJobRegistry};
