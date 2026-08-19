// Owns the floating loaded-status capsule's DOM lifecycle: the element, its text and
// retry affordance, the resize/scroll position watcher, and teardown. Extracted from
// the legacy runtime in display-unification slice 2. Positioning MATH stays in
// loaded-status-position and arrives through the injected positionElement; the
// runtime routes the DOM hooks through its own methods so tests can stub them at the
// plugin seam exactly as they always have.
const {LOADED_STATUS_REFRESH_MS} = require("../status/loaded-translation-status-store");

const CAPSULE_ELEMENT_ID = "DiscordAITranslator-loaded-status";
const CAPSULE_TEMPLATE = '<span class="translator-loaded-status-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12.9 15.1 10.8 13l.1-.1a14.7 14.7 0 0 0 3.1-5.4h2.4V5.4h-5.2V3.3H9.1v2.1H3.9v2.1H12a12.5 12.5 0 0 1-2.6 4.1 12.4 12.4 0 0 1-1.9-2.7H5.4a14.8 14.8 0 0 0 2.5 4.1l-4.2 4.1 1.5 1.5 4.2-4.2 2.6 2.7.9-2Zm5.9-3.4h-2.1L12 22.2h2.2l1.2-3.1h4.8l1.2 3.1h2.2l-4.8-10.5Zm-2.6 5.3 1.6-4.2 1.6 4.2h-3.2Z"/></svg></span><span class="translator-loaded-status-text"></span>';

function createLoadedStatusCapsuleController({
	store,
	getDocument = () => (typeof document == "undefined" ? null : document),
	getWindow = () => (typeof window == "undefined" ? null : window),
	getSelectedChannelId,
	isTranslationEnabled,
	getReceivedAutoTranslateScope,
	isChineseUiLanguage,
	positionElement,
	attachScrollWatcher = () => {},
	onRetry = () => {},
	clearHistoricalTracker = () => {},
	// Repositioning forces layout reads; while the user is mid-scroll it defers and
	// retries until the gesture idles (2026-08-19 jank report). Injectable timers
	// exist for the tests; production uses the globals like the rest of this watcher.
	isUserScrolling = () => false,
	// The zombie-instance gate (2026-08-19 Σ-format "old capsule residue" audit):
	// after a plugin hot reload, late async callbacks on the DEAD instance - a
	// provider chunk answering, a job completing - still reach update(). Without this
	// gate they recreated the shared element and re-armed the heartbeat, so the dead
	// instance repainted old-format text every second, and the pill lingered because
	// the live instance stops watching the element once its own capsule hides.
	isRuntimeActive = () => true,
	setTimeout: scheduleTimer = setTimeout,
	clearTimeout: cancelTimer = clearTimeout,
	// Runtime-routed seams. They default to the internal implementations so the
	// controller works standalone; the runtime injects arrows through its own plugin
	// methods, which is where existing tests place their stubs.
	hooks = {}
}) {
	let positionWatcherAttached = false;
	let positionWatcherHandler = null;
	let positionWatcherResizeObserver = null;
	let positionWatcherTimer = null;

	const routed = {
		ensurePositionWatcher: () => (hooks.ensurePositionWatcher || ensurePositionWatcher)(),
		removeElement: () => (hooks.removeElement || removeElement)(),
		updateInlineElements: () => (hooks.updateInlineElements || updateInlineElements)(),
		positionElement: element => (hooks.positionElement || positionElement)(element),
		attachScrollWatcher: () => (hooks.attachScrollWatcher || attachScrollWatcher)(),
		onRetry: channelId => (hooks.onRetry || onRetry)(channelId)
	};

	function getCapsuleElement() {
		const doc = getDocument();
		return doc && doc.getElementById(CAPSULE_ELEMENT_ID) || null;
	}

	function updateInlineElements() {
		const doc = getDocument();
		if (!doc) return;
		let elements = [];
		try {elements = Array.from(doc.querySelectorAll(".translator-loaded-status-inline"));}
		catch (err) {elements = [];}
		for (const element of elements) {
			if (element && element.remove) element.remove();
		}
	}

	function ensurePositionWatcher() {
		const win = getWindow();
		if (!win || positionWatcherAttached) return;
		positionWatcherAttached = true;
		positionWatcherHandler = _ => {
			const element = getCapsuleElement();
			if (!element) return;
			if (positionWatcherTimer) cancelTimer(positionWatcherTimer);
			const reposition = _ => {
				positionWatcherTimer = null;
				if (isUserScrolling()) {
					positionWatcherTimer = scheduleTimer(reposition, 250);
					return;
				}
				routed.positionElement(element);
			};
			positionWatcherTimer = scheduleTimer(reposition, 250);
		};
		win.addEventListener("resize", positionWatcherHandler, {passive: true});
		win.addEventListener("scroll", positionWatcherHandler, true);
		try {
			const doc = getDocument();
			if (typeof ResizeObserver != "undefined" && doc && doc.body) {
				positionWatcherResizeObserver = new ResizeObserver(positionWatcherHandler);
				positionWatcherResizeObserver.observe(doc.body);
			}
		}
		catch (err) {}
	}

	function detachPositionWatcher() {
		const win = getWindow();
		if (!win || !positionWatcherAttached) return;
		positionWatcherAttached = false;
		if (positionWatcherHandler) {
			win.removeEventListener("resize", positionWatcherHandler, {passive: true});
			win.removeEventListener("scroll", positionWatcherHandler, true);
		}
		if (positionWatcherResizeObserver) {
			try {positionWatcherResizeObserver.disconnect();}
			catch (err) {}
		}
		positionWatcherResizeObserver = null;
		if (positionWatcherTimer) cancelTimer(positionWatcherTimer);
		positionWatcherTimer = null;
		positionWatcherHandler = null;
	}

	function removeElement() {
		const element = getCapsuleElement();
		if (element) element.remove();
		detachPositionWatcher();
	}

	function shouldShow(status) {
		if (!status || (!status.active && !status.done)) return false;
		const selectedChannelId = getSelectedChannelId();
		const statusChannelId = status.channelId && status.channelId != "__global" ? status.channelId : selectedChannelId;
		if (!statusChannelId || !selectedChannelId || statusChannelId != selectedChannelId) return false;
		if (getReceivedAutoTranslateScope() != "loaded_messages") return false;
		return isTranslationEnabled(statusChannelId);
	}

	function getSkipReasonText(reason) {
		switch (reason) {
			case "symbol_only": return isChineseUiLanguage() ? "纯符号/无自然语言" : "symbol-only/no natural language";
			case "link_only": return isChineseUiLanguage() ? "仅链接/受保护内容" : "link-only/protected content";
			case "same_language": return isChineseUiLanguage() ? "同目标语言" : "same target language";
			case "too_similar": return isChineseUiLanguage() ? "与原文过于相似" : "too similar to source";
			case "wrong_target_language": return isChineseUiLanguage() ? "返回语言不对" : "wrong target language";
			case "ai_skip_signal": return isChineseUiLanguage() ? "AI判定无需翻译" : "AI skipped translation";
			case "source_filter": return isChineseUiLanguage() ? "不在源语言筛选内" : "outside source-language filter";
			case "local_guard": return isChineseUiLanguage() ? "本地保护兀底丢弃" : "dropped by local safeguard";
			case "out_of_range": return isChineseUiLanguage() ? "超出当前已加载范围" : "outside loaded range";
			default: return reason || (isChineseUiLanguage() ? "已跳过" : "skipped");
		}
	}

	function getTitleText(status) {
		if (!status) return "";
		const baseText = store.getStatusDetailText(status);
		const detailParts = [];
		if (status && status.lastSkipReason) detailParts.push(getSkipReasonText(status.lastSkipReason));
		if (status && status.lastSkipPreview) detailParts.push(status.lastSkipPreview);
		return detailParts.length ? `${baseText} | ${isChineseUiLanguage() ? "最近跳过" : "Last skipped"}: ${detailParts.join(" | ")}` : baseText;
	}

	function update(updates = {}) {
		// A stopped instance stands down: remove the element, cancel timers, never
		// re-arm. Every post-stop caller - heartbeat tick, late job or provider
		// callback - funnels through here, so this one gate covers the class.
		if (!isRuntimeActive()) {
			store.cancelTimers();
			routed.removeElement();
			return;
		}
		const currentStatus = store.update(updates);
		if (!shouldShow(currentStatus)) {
			routed.removeElement();
			return;
		}
		store.cancelTimers();
		const doc = getDocument();
		if (!doc || !doc.body) return;
		routed.attachScrollWatcher();
		routed.ensurePositionWatcher();
		let element = doc.getElementById(CAPSULE_ELEMENT_ID);
		if (!element) {
			element = doc.createElement("div");
			element.id = CAPSULE_ELEMENT_ID;
			doc.body.appendChild(element);
		}
		const retryableCount = Math.max(0, currentStatus.retryable || 0);
		const showRetry = !currentStatus.active && retryableCount > 0;
		const visualPhase = showRetry ? "failed" : currentStatus.phase || (currentStatus.collecting ? "collecting" : currentStatus.done ? "done" : "requesting");
		const nextClassName = `translator-loaded-status-floating translator-loaded-status-${visualPhase}${showRetry ? " translator-loaded-status-retryable" : ""}`;
		const nextText = store.getStatusText(currentStatus);
		const nextTitle = getTitleText(currentStatus);
		// Identical content skips the DOM writes and the reposition (2026-08-19 jank
		// report: refreshing per render outcome forced layout reads for nothing). The
		// refresh/hide timers below still re-arm - cancelTimers above cleared them.
		const currentTextElement = element.querySelector(".translator-loaded-status-text");
		const dirty = element.className !== nextClassName || !currentTextElement || currentTextElement.textContent !== nextText || element.title !== nextTitle;
		if (dirty) {
		// Always normalize the status DOM. This removes legacy progress-line children left by earlier builds.
		element.className = nextClassName;
		if (!element.querySelector(".translator-loaded-status-icon") || !element.querySelector(".translator-loaded-status-text") || element.querySelector(".translator-loaded-status-progress")) {
			element.innerHTML = CAPSULE_TEMPLATE;
		}
		const textElement = element.querySelector(".translator-loaded-status-text");
		if (textElement) textElement.textContent = nextText;
		let retryButton = element.querySelector(".translator-loaded-status-retry");
		if (showRetry) {
			if (!retryButton) {
				retryButton = doc.createElement("button");
				retryButton.type = "button";
				retryButton.className = "translator-loaded-status-retry";
				element.appendChild(retryButton);
			}
			retryButton.textContent = isChineseUiLanguage() ? "重试" : "Retry";
			retryButton.title = isChineseUiLanguage() ? `重试 ${retryableCount} 条失败消息` : `Retry ${retryableCount} failed messages`;
			retryButton.onclick = event => {
				if (event && event.stopPropagation) event.stopPropagation();
				const retryResult = routed.onRetry(currentStatus.channelId);
				if (retryResult && typeof retryResult.catch == "function") retryResult.catch(_ => {});
			};
		}
		else if (retryButton) retryButton.remove();
		element.title = nextTitle;
		routed.updateInlineElements();
		store.schedulePosition(_ => routed.positionElement(element));
		}
		// The finished count stays visible (user-specified 2026-08-19): no completion
		// auto-hide. The refresh tick stays armed even when done - it is the safety net
		// that hides the capsule after a channel switch no event announces, and the
		// dirty check above makes an unchanged tick cost nothing.
		store.scheduleRefresh(LOADED_STATUS_REFRESH_MS, () => update({}));
	}

	function clear() {
		clearHistoricalTracker();
		store.clear();
		const element = getCapsuleElement();
		if (element) element.remove();
		detachPositionWatcher();
		routed.updateInlineElements();
	}

	// Fed from the message-state store's commit exit - the one point every translated
	// display passes through (single, batch, and manual commits alike); the session
	// total is the unique-id count per channel (docs/product.md). The capsule
	// re-renders only when it is already tracking this channel, so idle channels
	// never summon it.
	function recordTranslationsDisplayed(channelId, messageIds = []) {
		if (!channelId || !messageIds.length) return;
		// Silent by design (2026-08-19): the batch commit loop calls this per record,
		// and repainting here made the numerator crawl one by one. The one-second
		// heartbeat and the batch's own status updates reveal the count in one jump.
		store.recordSessionDisplayed(channelId, messageIds);
	}

	return Object.freeze({
		update,
		clear,
		shouldShow,
		getSkipReasonText,
		getTitleText,
		recordTranslationsDisplayed,
		ensurePositionWatcher,
		detachPositionWatcher,
		removeElement,
		updateInlineElements
	});
}

module.exports = {CAPSULE_ELEMENT_ID, createLoadedStatusCapsuleController};
