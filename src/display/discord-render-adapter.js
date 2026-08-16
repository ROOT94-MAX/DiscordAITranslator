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

	function findMessageElement(messageId) {
		const escapedId = escapeAttributeValue(messageId);
		try {
			return document.querySelector(`[id="chat-messages-${escapedId}"], [data-list-item-id="chat-messages-${escapedId}"], [data-list-item-id="chat-messages___chat-messages-${escapedId}"]`);
		}
		catch (err) {
			return null;
		}
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
			const scrollState = scroller ? captureScrollState() : null;
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
