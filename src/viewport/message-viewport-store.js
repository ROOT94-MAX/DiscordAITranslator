// Owns every module-level variable that answers "where is the message list, who
// moved it, and is the user busy typing". Before this module those seventeen vars
// lived in the plugin factory closure where any of the 9000 surrounding lines could
// write them, and each of the windows below is the fix for a bug that shipped: our
// own scroll restore being counted as the user scrolling, a restore landing after the
// user had already scrolled away, and a manual translation anchor outliving the
// reflow it was protecting. Treat the constants as behaviour, not as tuning knobs.
//
// A store instance is per plugin instance, so a plugin restart drops all of it.

// A scroll event delivered this soon after our own scrollTop write is the echo of
// that write. Counting it as user activity kept the user-scroll window permanently
// open and stalled automatic translation.
const AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE = 150;
// How long after the last user scroll the channel still counts as being scrolled.
const AUTO_TRANSLATION_SCROLL_IDLE_DELAY = 900;
// A wheel/touch/pointer/key gesture only arms user-scroll detection for this long, so
// a scroll event with no gesture in front of it stays classified as programmatic.
const AUTO_TRANSLATION_SCROLL_INTENT_WINDOW = 300;
// Within this many pixels of the bottom the view counts as pinned to the bottom, and
// a restore re-pins instead of restoring an absolute offset that new content moved.
const AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD = 80;
// How long a manual translation keeps its anchor, so the reflow it triggers cannot
// scroll the very message the user clicked out of view.
const MANUAL_TRANSLATION_SCROLL_LOCK_MS = 4500;
// Discord re-lays out the message list several times after a repaint; re-applying the
// anchor on this ladder is what actually keeps the message visually still.
const MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS = [60, 180, 420, 900];
// Settle passes after a display-transaction restore: late layout (images, embeds)
// keeps moving the anchor after the two-frame restore already landed.
const DISPLAY_TRANSACTION_SETTLE_DELAYS = [180, 600];
// Keys that scroll the message list. Any other keydown is typing, not scrolling.
const SCROLL_INTENT_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
const SCROLL_INTENT_EVENTS = ["wheel", "touchmove", "pointerdown", "keydown"];
const SCROLL_INTENT_END_EVENTS = ["pointerup", "pointercancel"];
const INPUT_ACTIVITY_EVENTS = ["beforeinput", "input", "keydown"];
const MESSAGE_ELEMENT_SELECTOR = '[id^="chat-messages-"], [data-list-item-id*="chat-messages"]';
const TEXT_INPUT_SELECTOR = "textarea, input, [contenteditable='true']";

function createMessageViewportStore({
	getDocument = () => null,
	setTimeout,
	clearTimeout,
	requestAnimationFrame,
	now = Date.now,
	getSelectedChannelId = () => null,
	getMessagesScrollerSelector = () => null,
	getChannelTextAreaSelector = () => null,
	escapeSelectorValue = null,
	// Finishing a scroll is the moment the legacy runtime is allowed to close a
	// historical snapshot; the store must not know what that means.
	onScrollActivityFinished = () => {}
} = {}) {
	let userScrollTime = 0;
	let userScrollChannelId = "";
	let userScrollIntentSequence = 0;
	let programmaticScrollWriteTime = 0;
	let scrollWatcherAttached = false;
	let scrollWatcherElement = null;
	let scrollActivityHandler = null;
	let scrollIntentHandler = null;
	let scrollIntentEndHandler = null;
	let scrollEndHandler = null;
	let scrollIntentPending = false;
	let scrollIntentTimer = null;
	let scrollIdleTimer = null;
	let inputActivityTime = 0;
	let inputActivityHandler = null;
	let manualScrollAnchor = null;
	let manualScrollLockTimer = null;
	let rememberedHistoryScrollerState = null;
	let rememberedHistoryChannelId = "";

	function normalizeChannelId(channelId) {
		return channelId == null ? "" : String(channelId);
	}

	function escapeSelector(value) {
		if (escapeSelectorValue) return escapeSelectorValue(String(value));
		return String(value).replace(/(["\\])/g, "\\$1");
	}

	function getMessagesScroller() {
		const documentRef = getDocument();
		const selector = getMessagesScrollerSelector();
		if (!documentRef || !selector) return null;
		return documentRef.querySelector(selector);
	}

	function extractMessageIdFromElement(element) {
		if (!element) return null;
		const values = [
			element.getAttribute && element.getAttribute("data-list-item-id"),
			element.getAttribute && element.getAttribute("aria-labelledby"),
			element.id
		].filter(Boolean);
		for (const value of values) {
			const match = String(value).match(/(\d{15,25})(?!.*\d)/);
			if (match) return match[1];
		}
		return null;
	}

	function findMessageElementById(messageId) {
		const documentRef = getDocument();
		if (!messageId || !documentRef) return null;
		const escapedId = escapeSelector(messageId);
		const selectors = [
			`[id="chat-messages-${escapedId}"]`,
			`[id$="-${escapedId}"]`,
			`[data-list-item-id$="-${escapedId}"]`,
			`[data-list-item-id*="${escapedId}"]`,
			`[aria-labelledby*="${escapedId}"]`
		];
		for (const selector of selectors) {
			try {
				const element = documentRef.querySelector(selector);
				if (element) return element.closest && element.closest(MESSAGE_ELEMENT_SELECTOR) || element;
			}
			catch (err) {}
		}
		return null;
	}

	// The visible message nearest the viewport CENTER, with an 8px tolerance so a
	// message peeking in by a hair is not considered. The center row is the user's
	// eye line: anchoring the topmost row instead let the rows between it and the
	// eye line grow when their translations landed, pushing the message being read
	// out of position (the 4:02->4:10 drift report, 2026-08-19).
	function findVisibleMessageAnchor(messagesScroller = null) {
		messagesScroller = messagesScroller || getMessagesScroller();
		if (!messagesScroller || !getDocument()) return null;
		const scrollerRect = messagesScroller.getBoundingClientRect();
		const scrollerCenter = scrollerRect.top + (scrollerRect.bottom - scrollerRect.top) / 2;
		let candidates = [];
		try {
			candidates = Array.from(messagesScroller.querySelectorAll(MESSAGE_ELEMENT_SELECTOR));
		}
		catch (err) {candidates = [];}
		const seen = new Set();
		let best = null;
		let bestDistance = Infinity;
		for (const element of candidates) {
			if (!element || seen.has(element)) continue;
			seen.add(element);
			const messageId = extractMessageIdFromElement(element);
			if (!messageId) continue;
			const rect = element.getBoundingClientRect();
			if (!rect || rect.height <= 0) continue;
			if (rect.bottom <= scrollerRect.top + 8 || rect.top >= scrollerRect.bottom - 8) continue;
			const distance = Math.abs(rect.top + rect.height / 2 - scrollerCenter);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = {messageId, element};
			}
		}
		return best;
	}

	function captureAnchorState(messageId = null) {
		const messagesScroller = getMessagesScroller();
		let element = messageId ? findMessageElementById(messageId) : null;
		if (!element) {
			const visibleAnchor = findVisibleMessageAnchor(messagesScroller);
			if (visibleAnchor) {
				messageId = visibleAnchor.messageId;
				element = visibleAnchor.element;
			}
		}
		if (!messagesScroller || !element || !messageId) return null;
		const elementRect = element.getBoundingClientRect();
		const scrollerRect = messagesScroller.getBoundingClientRect();
		return {
			messageId,
			scrollTop: messagesScroller.scrollTop,
			elementTop: elementRect.top,
			relativeTop: elementRect.top - scrollerRect.top,
			expiresAt: now() + MANUAL_TRANSLATION_SCROLL_LOCK_MS
		};
	}

	function restoreAnchorPosition(anchorState) {
		if (!anchorState) return false;
		const messagesScroller = getMessagesScroller();
		const element = findMessageElementById(anchorState.messageId);
		if (!messagesScroller || !element) return false;
		const scrollerRect = messagesScroller.getBoundingClientRect();
		const elementRect = element.getBoundingClientRect();
		const desiredTop = scrollerRect.top + (typeof anchorState.relativeTop == "number" ? anchorState.relativeTop : elementRect.top - scrollerRect.top);
		const delta = elementRect.top - desiredTop;
		// Sub-pixel drift is not worth a scroll write, which would only cost another
		// grace window and another repaint.
		if (Math.abs(delta) < 1) return true;
		const maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
		programmaticScrollWriteTime = now();
		messagesScroller.scrollTop = Math.max(0, Math.min(messagesScroller.scrollTop + delta, maxScrollTop));
		return true;
	}

	function restoreAnchorState(anchorState) {
		if (!anchorState) return;
		const restore = () => restoreAnchorPosition(anchorState);
		requestAnimationFrame(() => requestAnimationFrame(restore));
		for (const delay of MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS) setTimeout(restore, delay);
	}

	function lockManualScroll(messageId) {
		const anchorState = captureAnchorState(messageId);
		if (!anchorState) return;
		manualScrollAnchor = anchorState;
		if (manualScrollLockTimer) clearTimeout(manualScrollLockTimer);
		manualScrollLockTimer = setTimeout(_ => {
			manualScrollLockTimer = null;
			manualScrollAnchor = null;
		}, MANUAL_TRANSLATION_SCROLL_LOCK_MS);
	}

	function getActiveManualScrollAnchor() {
		if (!manualScrollAnchor) return null;
		if (now() > manualScrollAnchor.expiresAt) {
			manualScrollAnchor = null;
			return null;
		}
		return manualScrollAnchor;
	}

	function clearManualScrollLock() {
		if (manualScrollLockTimer) clearTimeout(manualScrollLockTimer);
		manualScrollLockTimer = null;
		manualScrollAnchor = null;
	}

	function captureScrollerState() {
		const messagesScroller = getMessagesScroller();
		if (!messagesScroller) return null;
		const maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
		const distanceToBottom = Math.max(0, maxScrollTop - messagesScroller.scrollTop);
		const keepBottom = distanceToBottom <= AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD;
		return {
			scrollTop: messagesScroller.scrollTop,
			keepBottom,
			userScrollIntentSequence,
			anchor: keepBottom ? null : captureAnchorState()
		};
	}

	function applyScrollerState(scrollerState, {allowBottomRescue = false} = {}) {
		const messagesScroller = getMessagesScroller();
		if (!messagesScroller) return;
		// The user gestured after the capture, so the position we saved is no longer
		// the position they want. Restoring it here would yank the list back.
		if (scrollerState.userScrollIntentSequence !== userScrollIntentSequence) {
			// ONE exception (2026-08-19 field report, stranded-at-newest): a whole-layer
			// rebuild remounts the scroller at Discord's default - the bottom. The
			// capture says the user was up in history, and no gesture in the two-frame
			// restore window parks the view at the exact bottom from there, so a bottom
			// position here is the remount's artifact, not the user's choice. Leaving it
			// strands them at the newest messages; pull back to the captured spot.
			// Only the immediate restore may rescue: by settle time a deliberate fling
			// CAN have reached the bottom, and that position belongs to the user.
			if (!allowBottomRescue) return;
			if (scrollerState.keepBottom) return;
			const maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
			const distanceToBottom = Math.max(0, maxScrollTop - messagesScroller.scrollTop);
			if (distanceToBottom > AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD) return;
			if (scrollerState.anchor && restoreAnchorPosition(scrollerState.anchor)) return;
			// Virtualization may have unmounted the anchor row; the raw captured offset
			// is approximate but beats the bottom.
			programmaticScrollWriteTime = now();
			messagesScroller.scrollTop = Math.max(0, Math.min(scrollerState.scrollTop, maxScrollTop));
			return;
		}
		if (scrollerState.keepBottom) {
			programmaticScrollWriteTime = now();
			messagesScroller.scrollTop = messagesScroller.scrollHeight;
			return;
		}
		if (scrollerState.anchor && restoreAnchorPosition(scrollerState.anchor)) return;
		const maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
		programmaticScrollWriteTime = now();
		messagesScroller.scrollTop = Math.max(0, Math.min(scrollerState.scrollTop, maxScrollTop));
	}

	function restoreScrollerState(scrollerState) {
		if (!scrollerState) return;
		requestAnimationFrame(() => requestAnimationFrame(() => applyScrollerState(scrollerState, {allowBottomRescue: true})));
		// Images, embeds and code blocks keep changing row heights after the paint;
		// a couple of settle passes re-verify the anchor (a write only happens when
		// the drift is a pixel or more). Plain veto only - no bottom rescue.
		for (const delay of DISPLAY_TRANSACTION_SETTLE_DELAYS) setTimeout(() => applyScrollerState(scrollerState), delay);
	}

	function isViewingMessageHistory() {
		const scrollerState = captureScrollerState();
		return !!(scrollerState && !scrollerState.keepBottom);
	}

	function rememberHistoryScrollerState(channelId = null) {
		const key = normalizeChannelId(channelId || getSelectedChannelId());
		let scrollerState = null;
		try {scrollerState = captureScrollerState();}
		catch (error) {return false;}
		if (!key || !scrollerState || scrollerState.keepBottom) {
			rememberedHistoryScrollerState = null;
			rememberedHistoryChannelId = "";
			return false;
		}
		rememberedHistoryScrollerState = scrollerState;
		rememberedHistoryChannelId = key;
		return true;
	}

	// A new live row can make Discord snap a virtualized history view to newest before
	// the row commits. The queue calls this from the render pass: capture the current
	// reading line when it still exists, or reuse the last user-scroll capture if the
	// host already moved to bottom. restoreScrollerState retains the newer-gesture veto.
	function preserveHistoryOnLiveMessage(channelId) {
		const key = normalizeChannelId(channelId);
		if (!key || key !== normalizeChannelId(getSelectedChannelId())) return false;
		let currentState = null;
		try {currentState = captureScrollerState();}
		catch (error) {currentState = null;}
		if (currentState && !currentState.keepBottom) {
			rememberedHistoryScrollerState = currentState;
			rememberedHistoryChannelId = key;
		}
		const historyState = rememberedHistoryChannelId === key ? rememberedHistoryScrollerState : null;
		if (!historyState) return false;
		restoreScrollerState(historyState);
		return true;
	}

	function clearScrollIntent() {
		if (scrollIntentTimer) clearTimeout(scrollIntentTimer);
		scrollIntentTimer = null;
		scrollIntentPending = false;
	}

	function markScrollIntent() {
		clearScrollIntent();
		scrollIntentPending = true;
		scrollIntentTimer = setTimeout(() => {
			scrollIntentTimer = null;
			scrollIntentPending = false;
		}, AUTO_TRANSLATION_SCROLL_INTENT_WINDOW);
	}

	function finishScrollActivity(channelId) {
		if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
		scrollIdleTimer = null;
		clearScrollIntent();
		const key = normalizeChannelId(channelId);
		// A finish for a channel the user is no longer scrolling must not clear the
		// window that a different channel just opened.
		if (!key || userScrollChannelId === key) {
			userScrollTime = 0;
			userScrollChannelId = "";
		}
		if (key) onScrollActivityFinished(channelId);
	}

	function scheduleScrollIdleFinish(channelId, delay = AUTO_TRANSLATION_SCROLL_IDLE_DELAY) {
		if (!channelId) return;
		if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
		scrollIdleTimer = setTimeout(() => {
			scrollIdleTimer = null;
			finishScrollActivity(channelId);
		}, delay);
	}

	function isUserScrollingChannel(channelId) {
		return userScrollChannelId === normalizeChannelId(channelId) && now() - userScrollTime < AUTO_TRANSLATION_SCROLL_IDLE_DELAY;
	}

	function isUserActivelyScrolling(channelId = null) {
		const key = normalizeChannelId(channelId || getSelectedChannelId());
		return !!key && userScrollChannelId === key && !!userScrollTime && now() - userScrollTime < AUTO_TRANSLATION_SCROLL_IDLE_DELAY;
	}

	function handleScrollActivity() {
		const timestamp = now();
		if (timestamp - programmaticScrollWriteTime < AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE) return;
		const channelId = getSelectedChannelId();
		const key = normalizeChannelId(channelId);
		let recognizedUserScroll = false;
		if (scrollIntentPending) {
			clearScrollIntent();
			userScrollChannelId = key;
			userScrollTime = timestamp;
			scheduleScrollIdleFinish(channelId);
			recognizedUserScroll = true;
		}
		// Momentum scrolling keeps firing scroll events long after the gesture ended;
		// they extend an already open window but may not open a new one.
		else if (key && userScrollChannelId === key && userScrollTime && timestamp - userScrollTime < AUTO_TRANSLATION_SCROLL_IDLE_DELAY) {
			userScrollTime = timestamp;
			scheduleScrollIdleFinish(channelId);
			recognizedUserScroll = true;
		}
		if (recognizedUserScroll) rememberHistoryScrollerState(channelId);
	}

	function attachScrollWatcher() {
		if (!getDocument()) return;
		const messagesScroller = getMessagesScroller();
		if (!messagesScroller) return;
		if (scrollWatcherAttached && scrollWatcherElement === messagesScroller) return;
		detachScrollWatcher();
		scrollActivityHandler = _ => handleScrollActivity();
		scrollIntentHandler = event => {
			if (event && event.type === "keydown" && !SCROLL_INTENT_KEYS.includes(event.key)) return;
			userScrollIntentSequence++;
			markScrollIntent();
		};
		scrollIntentEndHandler = _ => {
			clearScrollIntent();
		};
		scrollEndHandler = _ => {
			finishScrollActivity(userScrollChannelId || getSelectedChannelId());
		};
		scrollWatcherElement = messagesScroller;
		scrollWatcherAttached = true;
		messagesScroller.addEventListener("scroll", scrollActivityHandler, {passive: true});
		messagesScroller.addEventListener("scrollend", scrollEndHandler, {passive: true});
		for (const eventName of SCROLL_INTENT_EVENTS) messagesScroller.addEventListener(eventName, scrollIntentHandler, {passive: eventName !== "keydown"});
		for (const eventName of SCROLL_INTENT_END_EVENTS) messagesScroller.addEventListener(eventName, scrollIntentEndHandler, {passive: true});
	}

	function detachScrollWatcher() {
		if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
		scrollIdleTimer = null;
		clearScrollIntent();
		userScrollTime = 0;
		userScrollChannelId = "";
		rememberedHistoryScrollerState = null;
		rememberedHistoryChannelId = "";
		if (scrollWatcherElement) {
			if (scrollActivityHandler) scrollWatcherElement.removeEventListener("scroll", scrollActivityHandler);
			if (scrollEndHandler) scrollWatcherElement.removeEventListener("scrollend", scrollEndHandler);
			if (scrollIntentHandler) for (const eventName of SCROLL_INTENT_EVENTS) scrollWatcherElement.removeEventListener(eventName, scrollIntentHandler);
			if (scrollIntentEndHandler) for (const eventName of SCROLL_INTENT_END_EVENTS) scrollWatcherElement.removeEventListener(eventName, scrollIntentEndHandler);
		}
		scrollWatcherAttached = false;
		scrollWatcherElement = null;
		scrollActivityHandler = null;
		scrollIntentHandler = null;
		scrollIntentEndHandler = null;
		scrollEndHandler = null;
	}

	function attachInputActivityWatcher() {
		const documentRef = getDocument();
		if (inputActivityHandler || !documentRef) return;
		inputActivityHandler = event => {
			const target = event && event.target;
			if (!target) return;
			let isTextInput = false;
			try {
				isTextInput = !!(target.matches && target.matches(TEXT_INPUT_SELECTOR) || target.closest && target.closest(TEXT_INPUT_SELECTOR));
			}
			catch (error) {}
			if (isTextInput) inputActivityTime = now();
		};
		for (const eventName of INPUT_ACTIVITY_EVENTS) documentRef.addEventListener(eventName, inputActivityHandler, true);
	}

	function detachInputActivityWatcher() {
		const documentRef = getDocument();
		if (!inputActivityHandler || !documentRef) {
			inputActivityHandler = null;
			return;
		}
		for (const eventName of INPUT_ACTIVITY_EVENTS) documentRef.removeEventListener(eventName, inputActivityHandler, true);
		inputActivityHandler = null;
	}

	function isChannelTextAreaFocused() {
		const documentRef = getDocument();
		if (!documentRef) return false;
		const activeElement = documentRef.activeElement;
		if (!activeElement || activeElement === documentRef.body) return false;
		const isTextInput = activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT" || activeElement.getAttribute && activeElement.getAttribute("role") === "textbox" || activeElement.isContentEditable;
		if (!isTextInput) return false;
		const selectors = [getChannelTextAreaSelector(), '[class*="channelTextArea"]', "form"];
		return selectors.some(selector => {
			if (!selector) return false;
			try {return !!(activeElement.matches && activeElement.matches(selector) || activeElement.closest && activeElement.closest(selector));}
			catch (err) {return false;}
		});
	}

	// Jumping to a replied-to message scrolls the list without any user gesture, so the
	// scroll watcher would classify it as programmatic. Opening the window by hand keeps
	// historical translation from repainting mid-jump.
	function pauseForNavigation(duration = 1800) {
		const channelId = getSelectedChannelId();
		rememberedHistoryScrollerState = null;
		rememberedHistoryChannelId = "";
		userScrollChannelId = normalizeChannelId(channelId);
		userScrollTime = now() + Math.max(0, duration - AUTO_TRANSLATION_SCROLL_IDLE_DELAY);
		if (channelId) scheduleScrollIdleFinish(channelId, duration);
	}

	return Object.freeze({
		getMessagesScroller,
		extractMessageIdFromElement,
		findMessageElementById,
		findVisibleMessageAnchor,
		captureAnchorState,
		restoreAnchorPosition,
		restoreAnchorState,
		lockManualScroll,
		getActiveManualScrollAnchor,
		clearManualScrollLock,
		captureScrollerState,
		restoreScrollerState,
		// Display transactions preserve scroll exactly as the legacy manual repaint did:
		// a locked manual anchor wins over the offset capture so the clicked message
		// stays put when translated text changes row heights above it. The anchor only
		// rides the anchored message's OWN transaction - an automatic flush during the
		// lock window must never be pulled back to the manually translated message
		// (2026-08-19 PTB regression: history scrolling bounced on every backfill flush).
		captureDisplayTransactionScrollState({messageIds = []} = {}) {
			const manualAnchor = getActiveManualScrollAnchor();
			if (manualAnchor && (Array.isArray(messageIds) ? messageIds : []).some(messageId => String(messageId) === String(manualAnchor.messageId))) return {manualAnchor};
			return captureScrollerState();
		},
		restoreDisplayTransactionScrollState(scrollerState) {
			if (scrollerState && scrollerState.manualAnchor) return restoreAnchorState(scrollerState.manualAnchor);
			return restoreScrollerState(scrollerState);
		},
		// The atomic rebuild commits the new DOM in the same task, so the anchor can be
		// re-applied synchronously and the FIRST painted frame is already correct.
		// Waiting two animation frames here let the browser paint Discord's default
		// position and yank it back later - the per-transaction scroll bounce
		// (2026-08-19). The deferred variant above remains the late drift corrector.
		restoreDisplayTransactionScrollStateNow(scrollerState) {
			if (!scrollerState) return;
			if (scrollerState.manualAnchor) return restoreAnchorPosition(scrollerState.manualAnchor);
			return applyScrollerState(scrollerState);
		},
		isViewingMessageHistory,
		preserveHistoryOnLiveMessage,
		attachScrollWatcher,
		detachScrollWatcher,
		markScrollIntent,
		clearScrollIntent,
		finishScrollActivity,
		scheduleScrollIdleFinish,
		isUserActivelyScrolling,
		// Narrower than isUserActivelyScrolling: no fallback to the selected channel and
		// no truthiness check on the timestamp, matching the historical commit gate.
		isUserScrollingChannel,
		getUserScrollIntentSequence: () => userScrollIntentSequence,
		attachInputActivityWatcher,
		detachInputActivityWatcher,
		getTimeSinceInputActivity: () => now() - inputActivityTime,
		isChannelTextAreaFocused,
		pauseForNavigation
	});
}

module.exports = {
	AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE,
	AUTO_TRANSLATION_SCROLL_IDLE_DELAY,
	AUTO_TRANSLATION_SCROLL_INTENT_WINDOW,
	AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD,
	MANUAL_TRANSLATION_SCROLL_LOCK_MS,
	MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS,
	createMessageViewportStore
};
