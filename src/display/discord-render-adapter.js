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

	function findMessageOwner(element, messageId) {
		const ownerConfig = {
			up: true,
			unlimited: true,
			filter: instance => {
				const props = instance && (instance.stateNode && instance.stateNode.props || instance.props || instance.memoizedProps);
				return !!(props && props.message && String(props.message.id) === String(messageId));
			}
		};
		const directOwner = BDFDB.ReactUtils.findOwner(element, ownerConfig);
		if (directOwner) return directOwner;
		// Discord can attach the list-row DOM node above the React message owner.
		// The loading marker is injected by this plugin inside MessageContent, so it is
		// a reliable lower starting point for the same exact-owner walk.
		let loadingElement = null;
		try {loadingElement = element && element.querySelector && element.querySelector(".translator-translation-loading");}
		catch (err) {loadingElement = null;}
		return loadingElement ? BDFDB.ReactUtils.findOwner(loadingElement, ownerConfig) : null;
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

	function updateMessageOwners(messageIds, elementsByMessageId) {
		const owners = [];
		const seen = new Set();
		for (const messageId of messageIds) {
			const element = elementsByMessageId.get(String(messageId));
			const owner = element && findMessageOwner(element, messageId);
			if (!owner || seen.has(owner)) continue;
			seen.add(owner);
			owners.push(owner);
		}
		if (owners.length) BDFDB.ReactUtils.forceUpdate(...owners);
		return owners.length;
	}

	return {
		async refreshMessages({messageIds = [], ownerMessageIds = [], views = []}) {
			const uniqueMessageIds = getUniqueMessageIds(messageIds);
			const targetMessageIds = getUniqueMessageIds(uniqueMessageIds.concat(ownerMessageIds));
			const viewsByMessageId = getViewsByMessageId(views);
			const scroller = document.querySelector(BDFDB.dotCN.messagesscroller);
			const intentSequence = getUserScrollIntentSequence();
			const scrollState = scroller ? captureScrollState() : null;
			let outcome;
			let renderError;
			let hasRenderError = false;
			try {
				const elementsByMessageId = new Map();
				for (const messageId of targetMessageIds) {
					const element = findMessageElement(messageId);
					if (element) elementsByMessageId.set(String(messageId), element);
				}
				const presentTargetIds = targetMessageIds.filter(messageId => elementsByMessageId.has(String(messageId)));
				const presentIds = uniqueMessageIds.filter(messageId => elementsByMessageId.has(String(messageId)));
				if (isRuntimeActive()) updateMessageOwners(presentTargetIds, elementsByMessageId);
				await waitForPaint();
				let confirmedIds = confirmViews(presentIds, viewsByMessageId);
				let unconfirmedIds = presentIds.filter(messageId => !confirmedIds.map(String).includes(String(messageId)));
				if (unconfirmedIds.length && isRuntimeActive()) {
					updateMessageOwners(unconfirmedIds, elementsByMessageId);
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
