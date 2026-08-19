// Owns WHEN a collecting historical snapshot seals and HOW waiting batches start
// (cadence audit 2026-08-19). The old end-of-tick microtask seal turned every scroll
// tick into its own micro-batch - one atomic commit and one whole-layer rebuild each,
// which the user reads as "one-by-one translation". Two rules replace it:
// - a snapshot seals after a quiet collect window, and an active scroll keeps the
//   window open so the whole scroll session seals as one batch once the user idles
//   (mirroring the processMessages pass-end idle gate);
// - batches sealed while a previous batch was running merge into the one about to
//   start, so a scroll-back session commits (and rebuilds) once, not once per
//   micro-batch.
// Historical rows have no 200ms display contract - that ceiling protects live
// translations only. Job state stays in the runtime's queue entries; this module is
// pure policy over injected handles.
const {HISTORICAL_COLLECT_QUIET_MS} = require("./historical-translation-job");

function createHistoricalSnapshotCadence({
	// Pass BDFDB.TimeUtils handles, never raw globals: a raw timer outlives the
	// plugin instance that armed it (managed-timer contract).
	timeout,
	clear,
	quietMs = HISTORICAL_COLLECT_QUIET_MS,
	isUserActivelyScrolling = () => false,
	isCurrentQueue = () => true,
	finishSnapshot = () => false
}) {
	function clearSealTimer(entry) {
		if (!entry) return;
		if (entry.startTimer) {
			clear(entry.startTimer);
			entry.startTimer = null;
		}
		entry.startToken = null;
	}

	function armQuietWindowSeal(channelId, entry) {
		if (!entry || entry.startToken) return;
		const token = {};
		entry.startToken = token;
		const arm = delay => {
			entry.startTimer = timeout(_ => {
				entry.startTimer = null;
				if (entry.startToken !== token || !isCurrentQueue(channelId, entry)) return;
				if (isUserActivelyScrolling(channelId)) return arm(quietMs);
				entry.startToken = null;
				finishSnapshot(channelId);
			}, delay);
		};
		arm(quietMs);
	}

	// Rows collected while a job ran seal at job end when the user is idle, so the
	// live-handoff decision that follows keeps its historical timing; an active
	// scroll leaves the seal to the quiet-window gate.
	function sealCollectingAtJobEnd(channelId, entry) {
		if (!entry || entry.jobs.some(candidate => candidate && candidate.state == "collecting" && candidate.sealed)) return;
		const collectingJob = entry.jobs.find(candidate => candidate && candidate.state == "collecting" && candidate.items.size);
		if (!collectingJob || isUserActivelyScrolling(channelId)) return;
		clearSealTimer(entry);
		collectingJob.seal();
	}

	// The loaded limit still bounds the merged size - an overflowing sibling stays
	// queued for the next round. markMessageQueued repoints the live-queue markers
	// so deletion and finish-time cleanup follow the surviving job id.
	function mergeSealedJobs({channelId, entry, job, loadedLimit, markMessageQueued}) {
		for (const candidate of entry.jobs.slice()) {
			if (candidate === job || !candidate || candidate.state != "collecting" || !candidate.sealed) continue;
			if (job.items.size + candidate.items.size > loadedLimit) continue;
			const mergedMessageIds = job.absorb(candidate);
			if (!mergedMessageIds) continue;
			for (const messageId of mergedMessageIds) markMessageQueued(messageId, {type: "historical", channelId, jobId: job.id});
			entry.jobs = entry.jobs.filter(existing => existing !== candidate);
		}
	}

	return Object.freeze({armQuietWindowSeal, clearSealTimer, sealCollectingAtJobEnd, mergeSealedJobs});
}

module.exports = {createHistoricalSnapshotCadence};
