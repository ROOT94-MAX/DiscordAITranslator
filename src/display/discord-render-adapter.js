// Turns one committed display transaction into one visible refresh. Real-client
// evidence (2026-08-13, docs/recovery-plan.md "Captured second-debug evidence") showed
// message rows are functional/memoized components with no updateable per-message owner,
// so the previous per-message forceUpdate found no target and translations only appeared
// when Discord repainted for another reason (hover, new message, scroll).
//
// The proven mechanism is a single parent refresh: resolve the channel-stream owner
// (the component whose props carry `channelStream`) from the mounted messages scroller
// and force-update it once. That repaints the whole list in one parent-to-child React
// pass, so translated text and its decoration derive from the same revision together.
// Message IDs are used only to confirm exact DOM revisions afterwards; they are never
// the refresh target.
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

	function fiberFromElement(element) {
		if (!element) return null;
		for (const key in element) {
			if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) return element[key];
		}
		return null;
	}

	function hasChannelStreamProps(candidate) {
		const props = candidate && (candidate.stateNode && candidate.stateNode.props || candidate.props || candidate.memoizedProps || candidate.pendingProps);
		return !!(props && props.channelStream);
	}

	// The channel-stream owner is the parent projection boundary. Prefer BDFDB's owner
	// walk; fall back to a raw fiber walk from the scroller when the loaded runtime does
	// not expose a matching updater. The returned handle is passed straight to
	// forceUpdate, which is what the real-client experiment proved repaints the list.
	function findChannelStreamOwner(scroller) {
		if (!scroller) return null;
		try {
			const owner = BDFDB.ReactUtils.findOwner(scroller, {up: true, unlimited: true, filter: hasChannelStreamProps});
			if (owner) return owner;
		}
		catch (err) {}
		let current = fiberFromElement(scroller);
		for (let depth = 0; current && depth < 40; depth++) {
			if (hasChannelStreamProps(current)) return current;
			current = current.return;
		}
		return null;
	}

	function refreshChannelStreamOwner(scroller) {
		const owner = findChannelStreamOwner(scroller);
		if (!owner) return false;
		BDFDB.ReactUtils.forceUpdate(owner);
		return true;
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
			const scroller = document.querySelector(BDFDB.dotCN.messagesscroller);
			const intentSequence = getUserScrollIntentSequence();
			const scrollState = scroller ? captureScrollState() : null;
			let outcome;
			let renderError;
			let hasRenderError = false;
			try {
				const elementsByMessageId = new Map();
				for (const messageId of uniqueMessageIds) {
					const element = findMessageElement(messageId);
					if (element) elementsByMessageId.set(String(messageId), element);
				}
				const presentIds = uniqueMessageIds.filter(messageId => elementsByMessageId.has(String(messageId)));
				// One parent refresh for the whole transaction. ownerMessageIds (reply hosts,
				// deleted-message hosts) ride the same list repaint and need no separate update.
				let refreshed = false;
				if (isRuntimeActive()) refreshed = refreshChannelStreamOwner(scroller);
				await waitForPaint();
				let confirmedIds = confirmViews(presentIds, viewsByMessageId);
				let unconfirmedIds = presentIds.filter(messageId => !confirmedIds.map(String).includes(String(messageId)));
				// One bounded retry: a mounted row that did not carry its expected revision
				// gets exactly one more parent refresh, never a global remount.
				if (unconfirmedIds.length && refreshed && isRuntimeActive()) {
					refreshChannelStreamOwner(scroller);
					await waitForPaint();
					confirmedIds = confirmViews(presentIds, viewsByMessageId);
					unconfirmedIds = presentIds.filter(messageId => !confirmedIds.map(String).includes(String(messageId)));
				}
				const deferredIds = uniqueMessageIds.filter(messageId => !elementsByMessageId.has(String(messageId)));
				if (!isRuntimeActive()) {
					const confirmedIdSet = new Set(confirmedIds.map(String));
					deferredIds.push(...presentIds.filter(messageId => !confirmedIdSet.has(String(messageId))));
					unconfirmedIds = [];
				}
				outcome = {
					confirmedIds,
					missingIds: unconfirmedIds,
					deferredIds,
					retryIds: unconfirmedIds.slice(),
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
			return outcome;
		}
	};
}

module.exports = {createDiscordRenderAdapter};
