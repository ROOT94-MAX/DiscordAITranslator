// Turns one committed display transaction into one visible refresh.
//
// Real-client evidence (docs/recovery-plan.md, 2026-08-13): message rows are
// functional/memoized components, and React forceUpdate on every candidate around the
// channel-stream boundary is a measured no-op (caused: false) - the strategy that
// froze the client when deployed. Whole-chat reconstruction crosses the Composer and
// virtual-list boundary, so this adapter no longer owns that primitive. Ordinary body
// views confirm `data-translator-revision`; reply hosts confirm their independent
// `data-translator-preview-revision`. Unresolved mounted surfaces re-enter bounded
// targeted retry, while virtualised surfaces paint from store state on mount.
// Scroll safety (bottom lock, anchor restore, user-gesture guard) lives in the
// injected captureScrollState/restoreScrollState from the viewport store.
function createDiscordRenderAdapter({BDFDB, document, requestAnimationFrame, getUserScrollIntentSequence, captureScrollState, restoreScrollState, restoreScrollStateNow = () => {}, isRuntimeActive = () => true, liveRowRepaint = null}) {
	// Kept shape-compatible with the settings diagnostic: live counts confirmed
	// targeted waves. Adapter rebuild counters now remain zero; explicit lifecycle
	// `full` repaint accounting is owned by repaint-scheduler.js.
	const rebuildStats = {live: 0, rebuild: 0};
	const rebuildsBySource = {};
	const recentRebuilds = [];
	function escapeAttributeValue(value) {
		return String(value).replace(/(["\\])/g, "\\$1");
	}

	// Real-client evidence (2026-08-16, PTB 1.0.1214): data-list-item-id shapes exist
	// that the exact-match selectors never hit, which made every mounted row read as
	// virtualised and suppressed all rebuilds while the hover bug persisted. Lookup
	// scans candidates through the tolerant ladder the viewport store already ships
	// and accepts a node only inside the chat-messages namespace carrying the id at a
	// token boundary, so a colliding snowflake (9<id>) or a same-id node in another
	// subtree (reply-preview-<id>) is rejected and the scan continues.
	const MESSAGE_ROOT_SELECTOR = '[id^="chat-messages-"], [data-list-item-id*="chat-messages"]';

	function getElementAttribute(element, name) {
		if (element.getAttribute) {
			try {
				const value = element.getAttribute(name);
				if (value != null) return String(value);
			}
			catch (err) {}
		}
		return element[name] != null ? String(element[name]) : null;
	}

	function isSupportedMessageRoot(element) {
		if (!element) return false;
		if (typeof element.id == "string" && element.id.startsWith("chat-messages-")) return true;
		const listId = getElementAttribute(element, "data-list-item-id");
		if (typeof listId == "string" && listId.includes("chat-messages")) return true;
		if (typeof element.closest == "function") {
			try {if (element.closest(MESSAGE_ROOT_SELECTOR)) return true;}
			catch (err) {}
		}
		return false;
	}

	function elementRepresentsMessageId(element, messageId) {
		const target = String(messageId);
		const values = [
			getElementAttribute(element, "data-list-item-id"),
			getElementAttribute(element, "aria-labelledby"),
			typeof element.id == "string" ? element.id : null
		].filter(Boolean);
		for (const rawValue of values) {
			const value = String(rawValue);
			let index = value.indexOf(target);
			while (index !== -1) {
				const before = index > 0 ? value.charAt(index - 1) : "";
				if (!before || /[^0-9A-Za-z]/.test(before)) return true;
				index = value.indexOf(target, index + 1);
			}
		}
		return false;
	}

	function querySelectorCandidates(selector) {
		if (typeof document.querySelectorAll == "function") {
			try {return Array.from(document.querySelectorAll(selector));}
			catch (err) {return [];}
		}
		try {
			const element = document.querySelector(selector);
			return element ? [element] : [];
		}
		catch (err) {
			return [];
		}
	}

	function findMessageElement(messageId) {
		const escapedId = escapeAttributeValue(messageId);
		const selectors = [
			`[id="chat-messages-${escapedId}"]`,
			`[id$="-${escapedId}"]`,
			`[data-list-item-id$="-${escapedId}"]`,
			`[data-list-item-id*="${escapedId}"]`,
			`[aria-labelledby*="${escapedId}"]`
		];
		for (const selector of selectors) {
			for (const element of querySelectorCandidates(selector)) {
				if (isSupportedMessageRoot(element) && elementRepresentsMessageId(element, messageId)) return element;
			}
		}
		return null;
	}

	function waitForPaint() {
		return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	}

	function getUniqueMessageIds(messageIds) {
		const seen = new Set();
		return messageIds.filter(messageId => {
			const key = String(messageId);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	function getViewsByMessageId(views) {
		const viewsByMessageId = new Map();
		for (const view of views) {
			if (!view) continue;
			const key = String(view.messageId);
			if (!viewsByMessageId.has(key)) {
				viewsByMessageId.set(key, view);
				continue;
			}
			const existingView = viewsByMessageId.get(key);
			if (!existingView || String(existingView.revision) !== String(view.revision)) viewsByMessageId.set(key, null);
		}
		return viewsByMessageId;
	}

	function confirmViews(messageIds, viewsByMessageId) {
		return messageIds.filter(messageId => {
			const view = viewsByMessageId.get(String(messageId));
			const element = view && findMessageElement(messageId);
			if (!element || typeof element.querySelector != "function") return false;
			try {
				return !!element.querySelector(`[data-translator-revision="${escapeAttributeValue(view.revision)}"]`);
			}
			catch (err) {
				return false;
			}
		});
	}

	function confirmOwnerViews(messageIds, viewsByMessageId) {
		return messageIds.filter(messageId => {
			const view = viewsByMessageId.get(String(messageId));
			const element = view && findMessageElement(messageId);
			if (!element || typeof element.querySelector != "function") return false;
			try {return !!element.querySelector(`[data-translator-preview-revision="${escapeAttributeValue(view.revision)}"]`);}
			catch (error) {return false;}
		});
	}

	return {
		getRebuildStats: () => Object.assign({}, rebuildStats, {
			rebuildsBySource: Object.assign({}, rebuildsBySource),
			recentRebuilds: recentRebuilds.map(entry => Object.assign({}, entry, {sources: Object.assign({}, entry.sources)}))
		}),
		async refreshMessages({channelId = null, messageIds = [], ownerMessageIds = [], ownerViews = [], views = [], sources = null}) {
			const uniqueMessageIds = getUniqueMessageIds(messageIds);
			const uniqueOwnerMessageIds = getUniqueMessageIds(ownerMessageIds);
			const viewsByMessageId = getViewsByMessageId(views);
			const ownerViewsByMessageId = getViewsByMessageId(ownerViews);
			const presentIds = uniqueMessageIds.filter(messageId => !!findMessageElement(messageId));
			const deferredIds = uniqueMessageIds.filter(messageId => !presentIds.includes(messageId));
			const presentOwnerIds = uniqueOwnerMessageIds.filter(messageId => !!findMessageElement(messageId));
			const deferredOwnerIds = uniqueOwnerMessageIds.filter(messageId => !presentOwnerIds.includes(messageId));
			// Read-only pre-check: already-confirmed surfaces need no Store dispatch.
			let confirmedIds = confirmViews(presentIds, viewsByMessageId);
			let unconfirmedIds = presentIds.filter(messageId => !confirmedIds.includes(messageId));
			let confirmedOwnerIds = confirmOwnerViews(presentOwnerIds, ownerViewsByMessageId);
			let unconfirmedOwnerIds = presentOwnerIds.filter(messageId => !confirmedOwnerIds.includes(messageId));
			const needsPaint = unconfirmedIds.length > 0 || unconfirmedOwnerIds.length > 0;
			if (!needsPaint) return {confirmedIds, missingIds: [], deferredIds, retryIds: [], confirmedOwnerIds, missingOwnerIds: [], deferredOwnerIds, retryOwnerIds: [], fallbackUsed: false};
			if (!isRuntimeActive()) return {confirmedIds, missingIds: [], deferredIds: deferredIds.concat(unconfirmedIds), retryIds: [], confirmedOwnerIds, missingOwnerIds: [], deferredOwnerIds: deferredOwnerIds.concat(unconfirmedOwnerIds), retryOwnerIds: [], fallbackUsed: false};
			const intentSequence = getUserScrollIntentSequence();
			const scroller = document.querySelector(BDFDB.dotCN.messagesscroller);
			const scrollState = scroller ? captureScrollState({messageIds: uniqueMessageIds.concat(uniqueOwnerMessageIds)}) : null;
			let renderError;
			let hasRenderError = false;
			try {
				// Ordinary content rows may use a registered class instance; reply hosts always
				// use the Store dispatcher because their preview sits above MessageContent.
				if (liveRowRepaint && (unconfirmedIds.length || unconfirmedOwnerIds.length)) {
					const targets = getUniqueMessageIds(unconfirmedIds.concat(unconfirmedOwnerIds));
					const attemptedIds = liveRowRepaint.repaintRows(targets, {channelId, ownerMessageIds: unconfirmedOwnerIds});
					if (attemptedIds.length) {
						if (scrollState && intentSequence === getUserScrollIntentSequence()) {
							try {restoreScrollStateNow(scrollState);}
							catch (err) {}
						}
						await waitForPaint();
						confirmedIds = confirmViews(presentIds, viewsByMessageId);
						unconfirmedIds = presentIds.filter(messageId => !confirmedIds.includes(messageId));
						confirmedOwnerIds = confirmOwnerViews(presentOwnerIds, ownerViewsByMessageId);
						unconfirmedOwnerIds = presentOwnerIds.filter(messageId => !confirmedOwnerIds.includes(messageId));
						// Store projection is asynchronous; allow one additional paint before
						// returning unresolved surfaces to their bounded retry owners.
						if (unconfirmedIds.length || unconfirmedOwnerIds.length) {
							await waitForPaint();
							confirmedIds = confirmViews(presentIds, viewsByMessageId);
							unconfirmedIds = presentIds.filter(messageId => !confirmedIds.includes(messageId));
							confirmedOwnerIds = confirmOwnerViews(presentOwnerIds, ownerViewsByMessageId);
							unconfirmedOwnerIds = presentOwnerIds.filter(messageId => !confirmedOwnerIds.includes(messageId));
						}
						if (!unconfirmedIds.length && !unconfirmedOwnerIds.length) {
							rebuildStats.live++;
							return {confirmedIds, missingIds: [], deferredIds, retryIds: [], confirmedOwnerIds, missingOwnerIds: [], deferredOwnerIds, retryOwnerIds: [], fallbackUsed: false};
						}
					}
				}
				if (!isRuntimeActive()) return {confirmedIds, missingIds: [], deferredIds: deferredIds.concat(unconfirmedIds), retryIds: [], confirmedOwnerIds, missingOwnerIds: [], deferredOwnerIds: deferredOwnerIds.concat(unconfirmedOwnerIds), retryOwnerIds: [], fallbackUsed: false};
				return {
					confirmedIds,
					missingIds: unconfirmedIds,
					deferredIds,
					retryIds: unconfirmedIds.slice(),
					confirmedOwnerIds,
					missingOwnerIds: unconfirmedOwnerIds,
					deferredOwnerIds,
					retryOwnerIds: unconfirmedOwnerIds.slice(),
					fallbackUsed: false
				};
			}
			catch (err) {
				renderError = err;
				hasRenderError = true;
			}
			finally {
				try {
					if (isRuntimeActive() && scrollState && intentSequence === getUserScrollIntentSequence()) restoreScrollState(scrollState);
				}
				catch (err) {
					if (!hasRenderError) {
						renderError = err;
						hasRenderError = true;
					}
				}
			}
			if (hasRenderError) throw renderError;
			if (!isRuntimeActive()) return {confirmedIds, missingIds: [], deferredIds: deferredIds.concat(unconfirmedIds), retryIds: [], confirmedOwnerIds, missingOwnerIds: [], deferredOwnerIds: deferredOwnerIds.concat(unconfirmedOwnerIds), retryOwnerIds: [], fallbackUsed: false};
			return {
				confirmedIds,
				missingIds: unconfirmedIds,
				deferredIds,
				retryIds: unconfirmedIds.slice(),
				confirmedOwnerIds,
				missingOwnerIds: unconfirmedOwnerIds,
				deferredOwnerIds,
				retryOwnerIds: unconfirmedOwnerIds.slice(),
				fallbackUsed: false
			};
		}
	};
}

module.exports = {createDiscordRenderAdapter};
