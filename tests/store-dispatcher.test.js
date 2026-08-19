const test = require("node:test");
const assert = require("node:assert/strict");
const {resolveStoreDispatcher} = require("../src/discord/store-dispatcher");

test("the shared resolver returns the first Store dispatcher satisfying every required method", () => {
	const dispatchOnly = {dispatch() {}};
	const subscribable = {dispatch() {}, subscribe() {}, unsubscribe() {}};
	const BDFDB = {
		LibraryStores: {
			SelectedChannelStore: {_dispatcher: dispatchOnly},
			MessageStore: {_dispatcher: subscribable}
		}
	};

	assert.equal(resolveStoreDispatcher(BDFDB, ["dispatch"]), dispatchOnly);
	assert.equal(resolveStoreDispatcher(BDFDB, ["subscribe", "unsubscribe"]), subscribable);
});

test("the shared resolver tolerates absent or throwing Store handles", () => {
	const throwingStore = {};
	Object.defineProperty(throwingStore, "_dispatcher", {get() {throw new Error("unavailable");}});

	assert.equal(resolveStoreDispatcher(null, ["dispatch"]), null);
	assert.equal(resolveStoreDispatcher({LibraryStores: {SelectedChannelStore: throwingStore}}, ["dispatch"]), null);
	assert.equal(resolveStoreDispatcher({LibraryStores: {SelectedChannelStore: {_dispatcher: {dispatch: true}}}}, ["dispatch"]), null);
});
