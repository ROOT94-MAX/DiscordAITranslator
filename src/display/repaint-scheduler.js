// Decides WHEN committed translations become visible. A commit always lands in the
// store immediately; only the repaint is scheduled here, so deferring never loses a
// translation - it only delays the paint.
//
// Both paths below end in the same whole-list rebuild; there is no owner-update
// repaint (measured no-op, see discord-render-adapter). What this module owns is
// cadence: the transaction path (schedule/flush) coalesces per-message requests,
// keeps rows single-flight, and bounds retries so the render adapter rebuilds at
// most once per transaction. The retained full-list path (scheduleFullRepaint)
// serves the display owners not yet migrated - manual translation, reply previews,
// embeds, titles - and defers around open settings and a focused text area.
const LIVE_REPAINT_DELAY_MS = 120;
const CALM_REPAINT_DELAY_MS = 1500;
const BUSY_RETRY_DELAY_MS = 450;
const SETTINGS_RETRY_DELAY_MS = 1000;
const MAX_TARGETED_REPAINT_ATTEMPTS = 3;

function createDisplayRepaintScheduler({
	renderMessages,
	onRenderOutcome = () => {},
	canRepaintNow,
	isViewingHistory,
	// The full-list repaint path needs the two predicates separately, because it may
	// be told to ignore one of them.
	isSettingsSurfaceOpen = () => false,
	isTextAreaFocused = () => false,
	repaintAll = () => {},
	// Pass BDFDB.TimeUtils.timeout/clear here, never the globals these default to.
	// Every timer below ends in a full-list repaint, and a raw timer outlives the plugin
	// instance that armed it, so after a reload a dead instance keeps repainting
	// alongside the live one. The defaults exist only so a unit test can drive the
	// scheduler without BDFDB; the managed-timer contract test pins the real wiring.
	setTimeout: scheduleTimer = setTimeout,
	clearTimeout: cancelTimer = clearTimeout
}) {
	const queues = new Map();
	const activeRequests = new Map();
	let timer = null;

	function getActiveRequest(channelId, messageId) {
		const channel = activeRequests.get(String(channelId));
		return channel && channel.get(String(messageId)) || null;
	}

	function releaseActiveRequests(channelId, messageIds) {
		const key = String(channelId);
		const channel = activeRequests.get(key);
		if (!channel) return;
		for (const messageId of messageIds) channel.delete(String(messageId));
		if (!channel.size) activeRequests.delete(key);
	}

	function removeQueuedRequest(channelId, messageId, maximumAttempt) {
		const key = String(channelId);
		const channel = queues.get(key);
		if (!channel) return;
		const queued = channel.get(String(messageId));
		if (queued && queued.attempt <= maximumAttempt) channel.delete(String(messageId));
		if (!channel.size) queues.delete(key);
	}

	function arm(delay) {
		if (timer) return;
		timer = scheduleTimer(() => {
			timer = null;
			flush();
		}, delay);
	}

	function flush() {
		if (!queues.size) return;
		if (!canRepaintNow()) {
			// Re-check rather than paint over the user; the commit is already stored.
			arm(BUSY_RETRY_DELAY_MS);
			return;
		}
		const pending = [...queues.entries()];
		queues.clear();
		for (const [channelId, queuedRequests] of pending) {
			const requestsByMessageId = new Map();
			const blockedRequests = new Map();
			for (const [messageId, request] of queuedRequests) (getActiveRequest(channelId, messageId) ? blockedRequests : requestsByMessageId).set(messageId, request);
			if (blockedRequests.size) {
				if (!queues.has(channelId)) queues.set(channelId, new Map());
				const waiting = queues.get(channelId);
				for (const [messageId, request] of blockedRequests) waiting.set(messageId, request);
			}
			if (!requestsByMessageId.size) continue;
			const messageIds = [...requestsByMessageId.keys()];
			if (!activeRequests.has(channelId)) activeRequests.set(channelId, new Map());
			const activeChannel = activeRequests.get(channelId);
			for (const [messageId, request] of requestsByMessageId) activeChannel.set(messageId, request);
			const rendering = renderMessages(messageIds);
			if (rendering && rendering.then) rendering.then(outcome => {
				const normalizedOutcome = Object.assign({}, outcome || {});
				const exhaustedIds = [];
				releaseActiveRequests(channelId, messageIds);
				for (const messageId of normalizedOutcome.retryIds || []) {
					const request = requestsByMessageId.get(String(messageId)) || {attempt: 1, trackingKeys: new Set()};
					if (request.attempt < MAX_TARGETED_REPAINT_ATTEMPTS) {
						const trackingKeys = [...request.trackingKeys];
						if (!trackingKeys.length) schedule(channelId, messageId, BUSY_RETRY_DELAY_MS, request.attempt + 1);
						else for (const trackingKey of trackingKeys) schedule(channelId, messageId, BUSY_RETRY_DELAY_MS, request.attempt + 1, trackingKey);
					}
					else {
						exhaustedIds.push(String(messageId));
						removeQueuedRequest(channelId, messageId, request.attempt);
					}
				}
				for (const messageId of [].concat(normalizedOutcome.confirmedIds || [], normalizedOutcome.deferredIds || [])) {
					const request = requestsByMessageId.get(String(messageId));
					if (request) removeQueuedRequest(channelId, messageId, request.attempt);
				}
				if (exhaustedIds.length) normalizedOutcome.exhaustedIds = exhaustedIds;
				const trackingKeysByMessageId = {};
				for (const [messageId, request] of requestsByMessageId) if (request.trackingKeys.size) trackingKeysByMessageId[messageId] = [...request.trackingKeys];
				const report = {channelId, messageIds, outcome: normalizedOutcome};
				if (Object.keys(trackingKeysByMessageId).length) report.trackingKeysByMessageId = trackingKeysByMessageId;
				try {onRenderOutcome(report);}
				catch (error) {}
				if (queues.size) arm(LIVE_REPAINT_DELAY_MS);
			}).catch(() => {
				releaseActiveRequests(channelId, messageIds);
				if (queues.size) arm(LIVE_REPAINT_DELAY_MS);
			});
		}
	}

	function schedule(channelId, messageId, delay = null, attempt = 1, trackingKey = null) {
		if (!channelId || messageId == null) return;
		const key = String(channelId);
		if (!queues.has(key)) queues.set(key, new Map());
		const requestsByMessageId = queues.get(key);
		const messageKey = String(messageId);
		const queued = requestsByMessageId.get(messageKey) || {attempt: 0, trackingKeys: new Set()};
		const active = getActiveRequest(key, messageKey);
		// Duplicate row events join the most advanced retry already queued. Moving the
		// counter backwards here would turn a bounded retry into an endless loop.
		queued.attempt = Math.max(queued.attempt, active && active.attempt || 0, Math.max(1, attempt || 1));
		if (active) for (const activeTrackingKey of active.trackingKeys) queued.trackingKeys.add(activeTrackingKey);
		if (trackingKey != null && String(trackingKey)) queued.trackingKeys.add(String(trackingKey));
		requestsByMessageId.set(messageKey, queued);
		if (!active) arm(delay == null ? LIVE_REPAINT_DELAY_MS : delay);
	}

	// The legacy full-list repaint, kept for the paths that still own their display
	// through the old maps (manual translation, reply previews, embeds, titles). It
	// obeys the same two rules as the targeted flush, and additionally remembers a
	// repaint deferred by an open settings surface so closing the panel can flush it.
	let fullRepaintTimer = null;
	let settingsRetryTimer = null;
	let textAreaRetryTimer = null;
	let deferredFullRepaintPending = false;

	function scheduleFullRepaint(options = {}) {
		const config = typeof options == "boolean" ? {batched: options} : Object.assign({batched: false, allowWhileSettings: false, allowWhileTyping: false}, options);
		if (!config.allowWhileSettings && isSettingsSurfaceOpen()) {
			deferredFullRepaintPending = true;
			if (!settingsRetryTimer) settingsRetryTimer = scheduleTimer(() => {
				settingsRetryTimer = null;
				scheduleFullRepaint({batched: true});
			}, SETTINGS_RETRY_DELAY_MS);
			return;
		}
		if (!config.allowWhileTyping && isTextAreaFocused()) {
			if (textAreaRetryTimer) cancelTimer(textAreaRetryTimer);
			textAreaRetryTimer = scheduleTimer(() => {
				textAreaRetryTimer = null;
				scheduleFullRepaint(Object.assign({}, config, {batched: true}));
			}, BUSY_RETRY_DELAY_MS);
			return;
		}
		if (textAreaRetryTimer) {
			cancelTimer(textAreaRetryTimer);
			textAreaRetryTimer = null;
		}
		deferredFullRepaintPending = false;
		if (!config.batched) {
			if (fullRepaintTimer) cancelTimer(fullRepaintTimer);
			fullRepaintTimer = null;
			repaintAll();
			return;
		}
		if (fullRepaintTimer) return;
		const delay = isViewingHistory() ? CALM_REPAINT_DELAY_MS : LIVE_REPAINT_DELAY_MS;
		fullRepaintTimer = scheduleTimer(() => {
			fullRepaintTimer = null;
			repaintAll();
		}, delay);
	}

	return Object.freeze({
		scheduleFullRepaint,
		hasDeferredFullRepaint: () => deferredFullRepaintPending,
		flushDeferredFullRepaint() {
			if (!deferredFullRepaintPending) return;
			deferredFullRepaintPending = false;
			scheduleFullRepaint({batched: true});
		},
		cancelFullRepaintTimers() {
			for (const timer of [fullRepaintTimer, settingsRetryTimer, textAreaRetryTimer]) if (timer) cancelTimer(timer);
			fullRepaintTimer = null;
			settingsRetryTimer = null;
			textAreaRetryTimer = null;
			deferredFullRepaintPending = false;
		},
		schedule,
		flush,
		clear() {
			if (timer) cancelTimer(timer);
			timer = null;
			queues.clear();
			activeRequests.clear();
		}
	});
}

module.exports = {
	SETTINGS_RETRY_DELAY_MS,
	MAX_TARGETED_REPAINT_ATTEMPTS,
	LIVE_REPAINT_DELAY_MS,
	CALM_REPAINT_DELAY_MS,
	BUSY_RETRY_DELAY_MS,
	createDisplayRepaintScheduler
};
