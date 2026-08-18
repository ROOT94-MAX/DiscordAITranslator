// Turns one committed display transaction into one visible refresh.
//
// Real-client evidence (docs/recovery-plan.md, 2026-08-13): message rows are
// functional/memoized components, and React forceUpdate on every candidate around the
// channel-stream boundary is a measured no-op (caused: false) - the strategy that
// froze the client when deployed. The mechanism users actually saw working is the one
// the 2026-06 plugin shipped: BDFDB.MessageUtils.rerenderAll(true) unmounts and
// rebuilds the chat layer, which crosses every memo boundary.
//
// What made the old plugin freeze was frequency, not the primitive. This adapter keeps
// the rebuild affordable with three rules:
// - at most ONE rebuild per transaction, never a rebuild-per-retry;
// - rows already showing their expected revision confirm from the DOM without any
//   rebuild, so scheduler retries are read-only once the paint landed;
// - a batch whose rows are all virtualised (no DOM node) never rebuilds - absent rows
//   paint from the store when they mount.
// Scroll safety (bottom lock, anchor restore, user-gesture guard) lives in the
// injected captureScrollState/restoreScrollState from the viewport store.
function createDiscordRenderAdapter({BDFDB, document, requestAnimationFrame, getUserScrollIntentSequence, captureScrollState, restoreScrollState, isRuntimeActive = () => true}) {
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

	return {
		async refreshMessages({messageIds = [], ownerMessageIds = [], views = []}) {
			const uniqueMessageIds = getUniqueMessageIds(messageIds);
			const viewsByMessageId = getViewsByMessageId(views);
			const presentIds = uniqueMessageIds.filter(messageId => !!findMessageElement(messageId));
			const deferredIds = uniqueMessageIds.filter(messageId => !presentIds.includes(messageId));
			// Read-only pre-check: whatever the last rebuild already painted needs no
			// further work. This is what breaks the rebuild-per-retry loop.
			let confirmedIds = confirmViews(presentIds, viewsByMessageId);
			let unconfirmedIds = presentIds.filter(messageId => !confirmedIds.includes(messageId));
			// Reply-preview hosts carry no revision marker; a mounted host is reason
			// enough to rebuild so its preview repaints with the list.
			const hostNeedsPaint = getUniqueMessageIds(ownerMessageIds).some(messageId => !!findMessageElement(messageId));
			const needsRebuild = unconfirmedIds.length > 0 || hostNeedsPaint;
			if (!needsRebuild) return {confirmedIds, missingIds: [], deferredIds, retryIds: [], fallbackUsed: false};
			if (!isRuntimeActive()) return {confirmedIds, missingIds: [], deferredIds: deferredIds.concat(unconfirmedIds), retryIds: [], fallbackUsed: false};
			const intentSequence = getUserScrollIntentSequence();
			const scroller = document.querySelector(BDFDB.dotCN.messagesscroller);
			const scrollState = scroller ? captureScrollState({messageIds: uniqueMessageIds}) : null;
			let renderError;
			let hasRenderError = false;
			try {
				BDFDB.MessageUtils.rerenderAll(true);
				await waitForPaint();
				confirmedIds = confirmViews(presentIds, viewsByMessageId);
				unconfirmedIds = presentIds.filter(messageId => !confirmedIds.includes(messageId));
				// The rebuild settles asynchronously (a timeout plus two render passes),
				// so an unconfirmed row gets one more read-only look after another paint.
				// Never a second rebuild: retries go through the bounded scheduler path.
				if (unconfirmedIds.length) {
					await waitForPaint();
					confirmedIds = confirmViews(presentIds, viewsByMessageId);
					unconfirmedIds = presentIds.filter(messageId => !confirmedIds.includes(messageId));
				}
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
			if (!isRuntimeActive()) return {confirmedIds, missingIds: [], deferredIds: deferredIds.concat(unconfirmedIds), retryIds: [], fallbackUsed: false};
			return {
				confirmedIds,
				missingIds: unconfirmedIds,
				deferredIds,
				retryIds: unconfirmedIds.slice(),
				fallbackUsed: false
			};
		}
	};
}

module.exports = {createDiscordRenderAdapter};
