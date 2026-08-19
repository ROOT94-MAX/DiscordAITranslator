// One whole-chat-layer rebuild with no paintable blank frame.
//
// BDFDB.MessageUtils.rerenderAll(true) rebuilds the chat by patching the
// LayerProvider's render to return no children, force-updating (everything under the
// layer unmounts - message list, composer, hint strip), then force-updating again to
// remount. Those are two separate React flushes, and under load the browser paints
// BETWEEN them: the whole layer - most visibly the composer translate icon - blinks
// for a frame (2026-08-19 flicker audit; the icon flickered while auto-translate
// painted scrolled-up history).
//
// This module performs the same two commits inside ONE JavaScript task using
// ReactDOM.flushSync, so the blank state exists only between two synchronous commits
// and can never reach a paint. The markAsRead side effect stays faithful to BDFDB's
// sequence; SCROLL does not - scroll ownership belongs to the viewport store alone
// (adapter header contract). The raw scrollTop restore this module briefly carried
// was a second scroll writer fighting the anchor restore and bounced the list once
// per transaction (2026-08-19). Any missing precondition or thrown error makes
// rebuildOnce() return false, and the caller runs BDFDB.MessageUtils.rerenderAll(true)
// - exactly today's behavior; a throw after the blank commit also returns false so
// the fallback repaints the layer.
// BDFDB's ReactUtils proxy resolves flushSync from the ReactDOM module it found; on
// clients where that module lacks flushSync, BetterDiscord's own webpack finder can
// still locate the export. Both misses just mean the caller's fallback path. Shared
// with the live row repaint, which needs the same synchronous commit.
function resolveFlushSync(reactUtils) {
	const proxied = reactUtils && reactUtils.flushSync;
	if (typeof proxied == "function") return proxied;
	try {
		if (typeof BdApi != "undefined" && BdApi.Webpack && typeof BdApi.Webpack.getByKeys == "function") {
			const reactDomModule = BdApi.Webpack.getByKeys("flushSync", "createPortal");
			if (reactDomModule && typeof reactDomModule.flushSync == "function") return reactDomModule.flushSync;
		}
	}
	catch (err) {}
	return null;
}

function createAtomicChatRebuild({BDFDB, document: documentRef}) {
	function markChannelRead() {
		try {
			const selectedChannelStore = BDFDB.LibraryStores && BDFDB.LibraryStores.SelectedChannelStore;
			const channelId = selectedChannelStore && typeof selectedChannelStore.getChannelId == "function" ? selectedChannelStore.getChannelId() : null;
			if (!channelId) return;
			if (BDFDB.DMUtils && typeof BDFDB.DMUtils.isDMChannel == "function" && BDFDB.DMUtils.isDMChannel(channelId)) BDFDB.DMUtils.markAsRead(channelId);
			else if (BDFDB.ChannelUtils && typeof BDFDB.ChannelUtils.markAsRead == "function") BDFDB.ChannelUtils.markAsRead(channelId);
		}
		catch (err) {}
	}

	function rebuildOnce() {
		try {
			if (!BDFDB || !documentRef || typeof documentRef.querySelector != "function") return false;
			const reactUtils = BDFDB.ReactUtils;
			const flushSync = resolveFlushSync(reactUtils);
			const forceUpdate = reactUtils && reactUtils.forceUpdate;
			if (typeof flushSync != "function" || typeof forceUpdate != "function" || typeof reactUtils.findOwner != "function") return false;
			const chatContent = BDFDB.dotCN && BDFDB.dotCN.chatcontent ? documentRef.querySelector(BDFDB.dotCN.chatcontent) : null;
			if (!chatContent) return false;
			const owner = reactUtils.findOwner(chatContent, {name: "LayerProvider", unlimited: true, up: true});
			const prototype = owner && BDFDB.ObjectUtils && typeof BDFDB.ObjectUtils.get == "function" ? BDFDB.ObjectUtils.get(owner, `${reactUtils.instanceKey}.type.prototype`) : null;
			if (!owner || !prototype || typeof prototype.render != "function") return false;
			markChannelRead();
			const originalRender = prototype.render;
			let blanked = false;
			prototype.render = function (...args) {
				const result = originalRender.apply(this, args);
				// Only the resolved owner blanks, exactly once; a sibling LayerProvider
				// rendering in the same flush keeps its children.
				if (!blanked && this === owner && result && result.props) {
					blanked = true;
					result.props.children = typeof result.props.children == "function" ? (_ => null) : [];
				}
				return result;
			};
			try {
				flushSync(() => forceUpdate(owner));
			}
			finally {
				// Restored before the second flush, so no other render can ever see the
				// wrapper - including when the first flush throws.
				prototype.render = originalRender;
			}
			if (!blanked) return false;
			// The restore commit runs in the SAME task as the blank commit: the browser
			// gets no chance to paint the empty layer.
			flushSync(() => forceUpdate(owner));
			return true;
		}
		catch (err) {
			return false;
		}
	}

	return {rebuildOnce};
}

module.exports = {createAtomicChatRebuild, resolveFlushSync};
