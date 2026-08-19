// Resolve the synchronous React commit primitive used by the live row repaint.
// BDFDB may expose it through ReactUtils; current BetterDiscord builds can also
// expose the ReactDOM module through Webpack. Either route is optional: callers
// repaint normally when no supported function is available.
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

module.exports = {resolveFlushSync};
