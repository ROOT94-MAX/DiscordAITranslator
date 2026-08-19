// Repaints translated rows WITHOUT rebuilding the chat layer.
//
// Why this exists (2026-08-19, "79A/0F" field reading): every arriving translation
// wave cost one whole-layer rebuild, because mounted message rows are memoized and
// nothing ABOVE them can push a re-render through the memo boundary (the 2026-08-13
// experiment force-updated candidates around the channel-stream boundary - all above
// the memo - and measured a no-op). The boundary does not block a component's OWN
// forceUpdate: the message-content render patch registers each row's live class
// instance here, a commit force-updates exactly the rows it painted, the patch
// re-runs during that render and injects the stored translation. No rebuild, no
// composer remount (icon flicker), no scroll-restore dance (bounce).
//
// Rows without a usable instance (function-component clients expose no updater;
// virtualised rows never render) are simply not attempted: the adapter's DOM confirm
// routes them to the whole-chat fallback, so the worst case is the established
// behavior.
const MAX_TRACKED_ROWS = 2000;

function createLiveRowRepaint({reactUtils = null, resolveFlushSync = () => null} = {}) {
	// messageId -> WeakRef<content component instance>. The newest render wins; dead
	// refs are dropped on touch and swept when the map grows past the cap.
	const instanceRefs = new Map();
	const hasWeakRef = typeof WeakRef == "function";

	function isUsableInstance(instance) {
		// Only a real class instance carries React's updater; BDFDB's synthetic
		// instances for function components cannot self-repaint.
		return !!(instance && instance.updater && typeof instance.forceUpdate == "function");
	}

	function sweepDeadRefs() {
		for (const [key, ref] of instanceRefs) {
			if (!ref.deref()) instanceRefs.delete(key);
		}
	}

	function recordContentInstance(messageId, instance) {
		if (messageId == null || !hasWeakRef || !isUsableInstance(instance)) return false;
		const key = String(messageId);
		const existing = instanceRefs.get(key);
		if (existing && existing.deref() === instance) return true;
		instanceRefs.set(key, new WeakRef(instance));
		if (instanceRefs.size > MAX_TRACKED_ROWS) sweepDeadRefs();
		return true;
	}

	function repaintRows(messageIds = []) {
		if (!reactUtils || typeof reactUtils.forceUpdate != "function") return [];
		const targets = [];
		for (const messageId of messageIds) {
			const key = String(messageId);
			const ref = instanceRefs.get(key);
			const instance = ref && ref.deref();
			if (!instance) {
				if (ref) instanceRefs.delete(key);
				continue;
			}
			targets.push({messageId: key, instance});
		}
		if (!targets.length) return [];
		const run = () => {
			for (const target of targets) {
				// A single unmounted or broken row must not block the batch; the DOM
				// confirm decides what actually painted.
				try {reactUtils.forceUpdate(target.instance);}
				catch (err) {}
			}
		};
		try {
			const flushSync = resolveFlushSync();
			// One synchronous commit for the whole batch, so the caller can re-apply
			// the scroll anchor in the same task. Without flushSync React batches the
			// updates asynchronously and the deferred restore covers the drift.
			if (typeof flushSync == "function") flushSync(run);
			else run();
		}
		catch (err) {
			return [];
		}
		return targets.map(target => target.messageId);
	}

	return Object.freeze({
		recordContentInstance,
		repaintRows,
		clear: () => instanceRefs.clear(),
		getTrackedRowCount: () => instanceRefs.size
	});
}

module.exports = {MAX_TRACKED_ROWS, createLiveRowRepaint};
