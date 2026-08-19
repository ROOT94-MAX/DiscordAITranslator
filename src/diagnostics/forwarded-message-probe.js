// Read-only probe for the forwarded-message gap (field report 2026-08-19: a
// message tagged 已转发 never translates). A forwarded message carries no
// `content` of its own - the body lives in Discord's forward snapshots
// (`messageSnapshots` on client records, `message_snapshots` on gateway payloads),
// which the extraction path never reads. Before implementing extraction AND the
// display swap for that shape, capture how real forwarded messages look on this
// client. Records at most a couple of shapes, then goes quiet.
const {summarizeValueShape} = require("./second-debug-probe");

const DEFAULT_MAX_SAMPLES = 2;

function getSnapshots(message) {
	if (!message) return null;
	const snapshots = message.messageSnapshots || message.message_snapshots;
	return Array.isArray(snapshots) && snapshots.length ? snapshots : null;
}

function createForwardedMessageProbe({sink = null, log = () => {}, now = Date.now, maxSamples = DEFAULT_MAX_SAMPLES} = {}) {
	const evidence = {samples: []};
	const seen = new Set();

	return Object.freeze({
		record(message) {
			if (evidence.samples.length >= maxSamples) return false;
			const snapshots = getSnapshots(message);
			if (!snapshots) return false;
			const messageId = message.id != null ? String(message.id) : "";
			if (!messageId || seen.has(messageId)) return false;
			seen.add(messageId);
			evidence.samples.push({
				at: now(),
				messageId,
				ownContentLength: typeof message.content == "string" ? message.content.length : null,
				snapshotCount: snapshots.length,
				messageShape: summarizeValueShape(message, 2),
				firstSnapshotShape: summarizeValueShape(snapshots[0], 4)
			});
			if (sink) {
				try {sink(JSON.stringify(Object.assign({}, evidence, {capturedAt: now()}), null, "\t"));}
				catch (error) {}
			}
			log(`[translator forwarded-message probe] captured ${evidence.samples.length}/${maxSamples}`);
			return true;
		},
		getSampleCount: () => evidence.samples.length
	});
}

module.exports = {createForwardedMessageProbe, getSnapshots};
