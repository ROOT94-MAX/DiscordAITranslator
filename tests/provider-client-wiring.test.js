const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginProviderClient} = require("../src/providers/provider-client-wiring");

function createFixture() {
	const calls = [];
	const timer = {id: "provider-timer"};
	const settingsStore = {
		getAuthKeys: () => (calls.push(["getAuthKeys"]), {openai: {key: "fixture-key"}}),
		replaceAuthKeys: value => (calls.push(["saveAuthKeys", value]), value),
		getLanguages: () => (calls.push(["getLanguages"]), {en: {id: "en"}})
	};
	const plugin = {
		labels: {provider_error: "Provider error"},
		ensureSettingsStore: () => settingsStore,
		getCustomText: key => (calls.push(["getCustomText", key]), `custom:${key}`),
		getEngineLabel: engineKey => (calls.push(["getEngineLabel", engineKey]), `engine:${engineKey}`),
		shouldUseAiAutoTranslateDecision: channelId => (calls.push(["shouldUseAiAutoTranslateDecision", channelId]), channelId == "channel-1"),
		getAiAutoTranslatePrompt: data => (calls.push(["getAiAutoTranslatePrompt", data]), `prompt:${data.text}`)
	};
	const BDFDB = {
		LibraryRequires: {
			request: (url, options, callback) => (calls.push(["request", url, options, callback]), "request-result")
		},
		TimeUtils: {
			timeout: (callback, delay) => (calls.push(["setTimeout", callback, delay]), timer),
			clear: value => calls.push(["clearTimeout", value])
		},
		NotificationUtils: {
			toast: (message, options) => (calls.push(["notify", message, options]), "toast-result")
		}
	};
	const sleep = ms => (calls.push(["sleep", ms]), Promise.resolve(`slept:${ms}`));
	let dependencies = null;
	const client = {tag: "provider-client"};
	const created = createPluginProviderClient({
		plugin,
		BDFDB,
		now: () => 456,
		sleep,
		createClient: input => (dependencies = input, client)
	});
	return {plugin, BDFDB, calls, timer, sleep, dependencies, client, created};
}

test("provider client wiring creates the client with the complete dependency contract", () => {
	const fixture = createFixture();

	assert.equal(fixture.created, fixture.client);
	assert.deepEqual(Object.keys(fixture.dependencies).sort(), [
		"clearTimeout",
		"getAiAutoTranslatePrompt",
		"getAuthKeys",
		"getCustomText",
		"getEngineLabel",
		"getLabels",
		"getLanguages",
		"notify",
		"now",
		"request",
		"saveAuthKeys",
		"setTimeout",
		"shouldUseAiAutoTranslateDecision",
		"sleep"
	].sort());
	assert.equal(fixture.dependencies.now(), 456);
});

test("provider client wiring keeps request, managed retry timers and raw backoff sleep on their established seams", async () => {
	const fixture = createFixture();
	const callback = () => {};
	const options = {method: "POST"};

	assert.equal(fixture.dependencies.request("https://fixture.example", options, callback), "request-result");
	assert.equal(fixture.dependencies.setTimeout(callback, 500), fixture.timer);
	fixture.dependencies.clearTimeout(fixture.timer);
	assert.equal(await fixture.dependencies.sleep(25), "slept:25");

	assert.deepEqual(fixture.calls, [
		["request", "https://fixture.example", options, callback],
		["setTimeout", callback, 500],
		["clearTimeout", fixture.timer],
		["sleep", 25]
	]);
});

test("provider client wiring delegates credentials, languages, notifications and prompt policy unchanged", () => {
	const fixture = createFixture();
	const authKeys = {gemini: {key: "replacement"}};
	const toastOptions = {type: "danger"};
	const promptData = {text: "hello"};

	assert.deepEqual(fixture.dependencies.getAuthKeys(), {openai: {key: "fixture-key"}});
	assert.equal(fixture.dependencies.saveAuthKeys(authKeys), authKeys);
	assert.deepEqual(fixture.dependencies.getLanguages(), {en: {id: "en"}});
	assert.equal(fixture.dependencies.notify("failure", toastOptions), "toast-result");
	assert.equal(fixture.dependencies.getLabels(), fixture.plugin.labels);
	assert.equal(fixture.dependencies.getCustomText("provider_error"), "custom:provider_error");
	assert.equal(fixture.dependencies.getEngineLabel("googleapi"), "engine:googleapi");
	assert.equal(fixture.dependencies.shouldUseAiAutoTranslateDecision("channel-1"), true);
	assert.equal(fixture.dependencies.getAiAutoTranslatePrompt(promptData), "prompt:hello");

	assert.deepEqual(fixture.calls, [
		["getAuthKeys"],
		["saveAuthKeys", authKeys],
		["getLanguages"],
		["notify", "failure", toastOptions],
		["getCustomText", "provider_error"],
		["getEngineLabel", "googleapi"],
		["shouldUseAiAutoTranslateDecision", "channel-1"],
		["getAiAutoTranslatePrompt", promptData]
	]);
});
