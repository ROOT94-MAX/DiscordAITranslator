function resolveStoreDispatcher(BDFDB, requiredMethods = ["dispatch"]) {
	const methods = [...new Set([].concat(requiredMethods || []).filter(method => typeof method === "string" && method))];
	let stores = null;
	try {stores = BDFDB && BDFDB.LibraryStores || null;}
	catch (error) {return null;}
	for (const storeName of ["SelectedChannelStore", "MessageStore"]) {
		let dispatcher = null;
		try {dispatcher = stores && stores[storeName] && stores[storeName]._dispatcher || null;}
		catch (error) {continue;}
		if (dispatcher && methods.every(method => typeof dispatcher[method] === "function")) return dispatcher;
	}
	return null;
}

module.exports = {resolveStoreDispatcher};
