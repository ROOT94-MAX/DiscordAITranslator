const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createPluginInstance} = require("./helpers/createPluginInstance");

test("plugin start owns deletion subscription without patching the global dispatch method", () => {
	const legacyDispatcher = {dispatch() {}};
	const subscriptions = new Map();
	const dispatcher = {
		dispatch() {},
		subscribe(type, handler) {subscriptions.set(type, handler);},
		unsubscribe(type, handler) {if (subscriptions.get(type) === handler) subscriptions.delete(type);}
	};
	const patches = [];
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			LibraryModules: {Dispatcher: legacyDispatcher, MessageUtils: {}, MessageToolbarUtils: {}},
			LibraryStores: {SelectedChannelStore: {_dispatcher: dispatcher}},
			PatchUtils: {
				patch: (_owner, target, method, options) => patches.push({target, method, options}),
				forceAllUpdates: () => {}
			}
		}
	});
	plugin.attachAutoTranslationInputActivityWatcher = () => {};
	plugin.forceUpdateAll = () => {};

	plugin.onStart();
	assert.deepEqual([...subscriptions.keys()], ["MESSAGE_DELETE", "MESSAGE_DELETE_BULK"]);
	assert.equal(patches.some(patch => patch.target === legacyDispatcher && patch.method === "dispatch"), false);
	assert.equal(plugin.ensureMessageDeletionLifecycle().stop(), true);
	assert.equal(subscriptions.size, 0);
});

test("runtime wiring stops deletion subscriptions and resolves them from Discord Stores", () => {
	const runtime = fs.readFileSync(path.join(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
	const wiring = fs.readFileSync(path.join(__dirname, "..", "src", "lifecycle", "message-deletion-lifecycle-wiring.js"), "utf8");
	assert.match(runtime, /ensureMessageDeletionLifecycle\(\)\.stop\(\)/);
	assert.match(wiring, /resolveStoreDispatcher\(BDFDB, \["subscribe", "unsubscribe"\]\)/);
	assert.doesNotMatch(runtime, /resolveStoreDispatcher\(BDFDB, \["subscribe", "unsubscribe"\]\)/);
	assert.doesNotMatch(runtime, /PatchUtils\.patch\(this, dispatcher, "dispatch"/);
});
