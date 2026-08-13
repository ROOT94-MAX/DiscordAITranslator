const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginHistoricalSourceRuntime} = require("../src/received/historical-source-wiring");

function createFixture({debugProbe = null} = {}) {
	const calls = [];
	const plugin = {
		isTranslationEnabled: channelId => (calls.push(["isTranslationEnabled", channelId]), true),
		cloneHistoricalSourceMessage: message => ({...message, cloned: true}),
		getMessageChannelId: (message, fallbackChannelId) => message.channel_id || fallbackChannelId,
		extractOriginalContentData: message => ({content: message.content}),
		cloneOriginalContentData: originalContentData => originalContentData,
		shouldAutoTranslateReceivedMessage: () => true,
		getCachedReceivedTranslation: () => null,
		collectHistoricalTranslationMessage: queueItem => (calls.push(["collect", queueItem]), true),
		finishHistoricalTranslationSnapshot: channelId => (calls.push(["finish", channelId]), true),
		getFailedHistoricalTranslationCount: () => 0,
		updateLoadedAutoTranslationStatus: update => calls.push(["status", update])
	};
	const messageStore = {getMessages: () => []};
	const fetchModule = {fetchMessages: () => Promise.resolve([])};
	const BDFDB = {
		LibraryStores: {
			MessageStore: messageStore,
			SelectedChannelStore: {getChannelId: () => "selected-channel"}
		},
		LibraryModules: {MessageActions: fetchModule}
	};
	let capturedDependencies = null;
	const runtimeInstance = {tag: "runtime"};
	const created = createPluginHistoricalSourceRuntime({
		plugin,
		BDFDB,
		getCurrentBatchNumber: () => 7,
		debugProbe,
		createRuntime: dependencies => (capturedDependencies = dependencies, runtimeInstance)
	});
	return {plugin, calls, messageStore, fetchModule, capturedDependencies, runtimeInstance, created};
}

test("without a probe the wiring passes Discord's raw store and fetch modules through", () => {
	const fixture = createFixture();

	assert.equal(fixture.created, fixture.runtimeInstance);
	assert.equal(fixture.capturedDependencies.messageStore, fixture.messageStore);
	assert.equal(fixture.capturedDependencies.fetchMessages, fixture.fetchModule);
	assert.equal(fixture.capturedDependencies.getSelectedChannelId(), "selected-channel");
	assert.equal(fixture.capturedDependencies.getCurrentBatchNumber(), 7);
	assert.equal(fixture.capturedDependencies.isTranslationEnabled("channel-1"), true);
	assert.deepEqual(fixture.calls[0], ["isTranslationEnabled", "channel-1"]);
	assert.deepEqual(fixture.capturedDependencies.cloneMessage({id: "m1"}), {id: "m1", cloned: true});
});

test("with a debug probe the store and fetch modules are wrapped with their evidence labels", () => {
	const wrapped = [];
	const debugProbe = {
		wrapModule(module, {label, methods}) {
			wrapped.push({label, methods});
			return {wrappedModule: module};
		}
	};
	const fixture = createFixture({debugProbe});

	assert.deepEqual(fixture.capturedDependencies.messageStore, {wrappedModule: fixture.messageStore});
	assert.deepEqual(fixture.capturedDependencies.fetchMessages, {wrappedModule: fixture.fetchModule});
	assert.deepEqual(wrapped.map(entry => entry.label).sort(), ["MessageFetchModule", "MessageStore"]);
	assert.ok(wrapped.find(entry => entry.label === "MessageStore").methods.includes("getMessages"));
	assert.ok(wrapped.find(entry => entry.label === "MessageFetchModule").methods.includes("fetchMessages"));
});

test("the fetch module resolution keeps the MessageActions/MessageManager/MessageUtils preference order", () => {
	const manager = {loadMessages: () => []};
	const utils = {fetch: () => []};
	let captured = null;
	createPluginHistoricalSourceRuntime({
		plugin: {},
		BDFDB: {LibraryStores: {}, LibraryModules: {MessageManager: manager, MessageUtils: utils}},
		getCurrentBatchNumber: () => 0,
		createRuntime: dependencies => (captured = dependencies, {})
	});
	assert.equal(captured.fetchMessages, manager);
	assert.equal(captured.messageStore, undefined);
	assert.equal(captured.getSelectedChannelId(), null);
});
