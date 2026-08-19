const test = require("node:test");
const assert = require("node:assert/strict");
const {
	AI_SKIP_TRANSLATION_TOKEN,
	PROVIDER_REQUEST_TIMEOUT_MS,
	translationEngines,
	enginePortals,
	MD5,
	normalizeApiEndpoint,
	getModelCatalogEndpoint,
	mapLanguageCodeForEngine,
	getValidationErrorDetails,
	buildAiProviderTranslationPrompt,
	parseOpenAiResponseText,
	parseGeminiResponseText,
	parseAiBatchTranslationResponse,
	createProviderClient
} = require("../src/providers/provider-client");

// The fake HTTP function never answers on its own: a test drives every response, so
// "the callback never came" is a state the tests can actually reach.
function createHarness({authKeys = {}, languages = {}, aiDecision = false, aiPrompt = "USER-RULE"} = {}) {
	const calls = [];
	const toasts = [];
	const timers = [];
	const sleeps = [];
	const saves = [];
	const backoffNotices = [];
	const normalizedNotices = [];
	let clock = 1000;
	const state = JSON.parse(JSON.stringify(authKeys));

	const harness = {
		calls,
		toasts,
		timers,
		sleeps,
		saves,
		backoffNotices,
		normalizedNotices,
		authKeys: state,
		advance(ms) {clock += ms;},
		respond(index, error, response, body) {
			calls[index].callback(error, response, body);
		},
		fireTimer(index) {
			const timer = timers[index];
			assert.equal(timer.cleared, false, "a cleared timer must not fire");
			timer.fired = true;
			timer.callback();
		},
		lastCall() {
			return calls[calls.length - 1];
		},
		lastBody() {
			return JSON.parse(calls[calls.length - 1].options.body);
		}
	};

	harness.client = createProviderClient({
		request: (url, options, callback) => {
			calls.push({url, options, callback});
		},
		setTimeout: (callback, delay) => {
			const timer = {callback, delay, cleared: false, fired: false};
			timers.push(timer);
			return timer;
		},
		clearTimeout: timer => {
			if (timer) timer.cleared = true;
		},
		sleep: ms => {
			sleeps.push(ms);
			return Promise.resolve();
		},
		now: () => clock,
		getAuthKeys: () => state,
		saveAuthKeys: value => saves.push(JSON.parse(JSON.stringify(value))),
		getLanguages: () => languages,
		notify: (message, options) => {
			const entry = {message, options, closed: false};
			toasts.push(entry);
			return {close: () => {entry.closed = true;}};
		},
		getLabels: () => ({
			toast_translating_failed: "FAILED",
			toast_translating_tryanother: "TRYANOTHER",
			error_hourlylimit: "HOURLY",
			error_dailylimit: "DAILY",
			error_monthlylimit: "MONTHLY",
			error_keyoutdated: "KEYOUTDATED",
			error_serverdown: "SERVERDOWN"
		}),
		getCustomText: key => `TEXT:${key}`,
		getEngineLabel: engineKey => `LABEL:${engineKey}`,
		shouldUseAiAutoTranslateDecision: () => aiDecision,
		getAiAutoTranslatePrompt: () => aiPrompt,
		createElementFromHtml: html => ({
			querySelector: selector => {
				const match = new RegExp(`<${selector}(?: lang="([^"]*)")?>([^<]*)</${selector}>`).exec(html);
				if (!match) return null;
				return {innerText: match[2], getAttribute: () => match[1]};
			}
		}),
		generateId: () => "SALT",
		onEndpointNormalized: () => normalizedNotices.push(true),
		onBackoffScheduled: () => backoffNotices.push(true)
	});
	return harness;
}

const AI_AUTH = {
	openai: {key: "k-openai", endpoint: "https://api.openai.com/v1/responses", model: "gpt-x"},
	gemini: {key: "k-gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", model: "gemini-x"},
	deepseek: {key: "k-deepseek", endpoint: "https://api.deepseek.com/chat/completions", model: "ds-x"},
	oaicompat: {key: "k-compat", endpoint: "https://compat.example/v1/chat/completions", model: "compat-x"}
};

function translationData(overrides = {}) {
	return Object.assign({
		input: {id: "en", name: "English"},
		output: {id: "zh-CN", name: "Chinese"},
		text: "hello there",
		specialCase: null,
		autoDecision: false,
		engine: {}
	}, overrides);
}

function preparedItems(channelId = "channel-1") {
	return [
		{message: {id: "100"}, channelId, protectedText: "hello\nthere", input: {id: "en", name: "English"}, output: {id: "zh-CN", name: "Chinese"}},
		{message: {id: "200"}, channelId, protectedText: "second", input: {id: "en", name: "English"}, output: {id: "zh-CN", name: "Chinese"}}
	];
}

test("MD5 matches the published vectors Baidu signs against", () => {
	assert.equal(MD5(""), "d41d8cd98f00b204e9800998ecf8427e");
	assert.equal(MD5("abc"), "900150983cd24fb0d6963f7d28e17f72");
	assert.equal(MD5("The quick brown fox jumps over the lazy dog"), "9e107d9d372bb6826bd81d3542a419d6");
	// Non-ASCII goes through the UTF-8 pre-encoder, which Baidu requires.
	assert.equal(MD5("你好"), "7eca689f0d3389d9dea66ae112e5cfd7");
});

test("the engine catalog stays mutable so iTranslate can cache its scraped key", () => {
	assert.equal(Object.isFrozen(translationEngines), false);
	assert.equal(Object.isFrozen(translationEngines.itranslate), false);
	assert.equal(translationEngines.openai.endpoint, "https://api.openai.com/v1/responses");
	assert.equal(translationEngines.gemini.endpoint, "https://generativelanguage.googleapis.com/v1beta/models");
	assert.equal(translationEngines.deepseek.endpoint, "https://api.deepseek.com/chat/completions");
	assert.equal(Object.keys(enginePortals).every(key => !!translationEngines[key]), true, "every portal names a real engine");
});

test("engine form placeholders never resemble live provider credentials", () => {
	const secretShapes = [/^sk-[A-Za-z0-9_-]{20,}$/, /^AIza[0-9A-Za-z_-]{20,}$/];
	for (const [engineKey, engine] of Object.entries(translationEngines)) {
		if (!engine.key) continue;
		assert.equal(secretShapes.some(pattern => pattern.test(engine.key)), false, `${engineKey} uses a descriptive placeholder, not a token-shaped fake secret`);
	}
});

test("endpoints are coerced to the one path each adapter posts to", () => {
	assert.equal(normalizeApiEndpoint("openai", "https://api.openai.com"), "https://api.openai.com/v1/responses");
	assert.equal(normalizeApiEndpoint("openai", "https://api.openai.com/v1"), "https://api.openai.com/v1/responses");
	assert.equal(normalizeApiEndpoint("openai", "https://api.openai.com/v1/responses/"), "https://api.openai.com/v1/responses");
	assert.equal(normalizeApiEndpoint("oaicompat", "https://host.test"), "https://host.test/v1/chat/completions");
	assert.equal(normalizeApiEndpoint("oaicompat", "https://host.test/v1"), "https://host.test/v1/chat/completions");
	assert.equal(normalizeApiEndpoint("oaicompat", "https://host.test/custom/path"), "https://host.test/custom/path");
	assert.equal(normalizeApiEndpoint("deepseek", "https://api.deepseek.com"), "https://api.deepseek.com/chat/completions");
	assert.equal(normalizeApiEndpoint("deepseek", "https://api.deepseek.com/v1"), "https://api.deepseek.com/chat/completions");
	assert.equal(normalizeApiEndpoint("deepseek", "https://api.deepseek.com/v1/chat/completions"), "https://api.deepseek.com/chat/completions");
	assert.equal(normalizeApiEndpoint("gemini", "https://g.test/v1beta/models/gemini-2.5-flash:generateContent"), "https://g.test/v1beta/models");
	assert.equal(normalizeApiEndpoint("gemini", "https://g.test/v1beta/models/gemini-2.5-flash"), "https://g.test/v1beta/models");
	assert.equal(normalizeApiEndpoint("microsoft", "https://ms.test?api-version=3.0"), "https://ms.test/translate");
	assert.equal(normalizeApiEndpoint("microsoft", "https://ms.test/translate"), "https://ms.test/translate");
	// Whitespace a user pasted in must not reach the wire.
	assert.equal(normalizeApiEndpoint("openai", "  https://api.openai.com/v1 /responses "), "https://api.openai.com/v1/responses");
	// An unknown engine with no default endpoint yields nothing rather than a bad URL.
	assert.equal(normalizeApiEndpoint("googleapi", ""), "");
	assert.equal(normalizeApiEndpoint("openai", ""), "https://api.openai.com/v1/responses", "the catalog default fills in");
});

test("model catalog endpoints follow each provider's listing route", () => {
	assert.equal(getModelCatalogEndpoint("openai", "https://api.openai.com/v1/responses"), "https://api.openai.com/v1/models");
	assert.equal(getModelCatalogEndpoint("deepseek", "https://api.deepseek.com/chat/completions"), "https://api.deepseek.com/models");
	assert.equal(getModelCatalogEndpoint("oaicompat", "https://host.test/v1"), "https://host.test/v1/models");
	// Gemini lists models at the same /models root it generates from.
	assert.equal(getModelCatalogEndpoint("gemini", "https://g.test/v1beta/models"), "https://g.test/v1beta/models");
	assert.equal(getModelCatalogEndpoint("googleapi", ""), "");
});

test("language codes are mapped per provider dialect table", () => {
	assert.equal(mapLanguageCodeForEngine("deepl", "zh-CN"), "ZH");
	assert.equal(mapLanguageCodeForEngine("deepl", "zh"), "ZH");
	assert.equal(mapLanguageCodeForEngine("deepl", "zh-TW"), "ZH-HANT");
	assert.equal(mapLanguageCodeForEngine("deepl", "de"), "DE");
	assert.equal(mapLanguageCodeForEngine("microsoft", "zh-CN"), "zh-Hans");
	assert.equal(mapLanguageCodeForEngine("microsoft", "en"), "en");
	assert.equal(mapLanguageCodeForEngine("baidu", "ja"), "jp");
	assert.equal(mapLanguageCodeForEngine("openai", "en"), "en");
	assert.equal(mapLanguageCodeForEngine("deepl", ""), "");
});

test("validation error details are pulled from whichever field a provider used", () => {
	assert.equal(getValidationErrorDetails(JSON.stringify({error: {message: "bad key"}})), "bad key");
	assert.equal(getValidationErrorDetails(JSON.stringify({error: {code: "401"}})), "401");
	assert.equal(getValidationErrorDetails(JSON.stringify({message: "nope"})), "nope");
	assert.equal(getValidationErrorDetails(JSON.stringify({error_msg: "baidu says no"})), "baidu says no");
	assert.equal(getValidationErrorDetails("<html>gateway error</html>"), "<html>gateway error</html>");
	assert.equal(getValidationErrorDetails(""), "");
	assert.equal(getValidationErrorDetails("x".repeat(200)).length, 160, "a non-JSON body is truncated");
});

test("the AI translation prompt keeps its exact wire text", () => {
	const built = buildAiProviderTranslationPrompt(translationData({text: "line one\nline two"}));
	assert.equal(built.system, "You are a senior bilingual localization specialist");
	// The leading tabs are part of the prompt bytes providers receive.
	assert.ok(built.prompt.startsWith("\n\t\t\t\tYou are a professional localization expert."), "the prompt keeps its leading indentation");
	assert.match(built.prompt, /The target language is exactly Chinese\./);
	assert.match(built.prompt, /Manual translation mode: translate the entire natural-language message into Chinese\./);
	assert.doesNotMatch(built.prompt, /Auto-translate decision rules/);
	assert.match(built.prompt, /line one \[NEWLINE\] line two/, "newlines become [NEWLINE] markers");
	assert.match(built.prompt, /10\. Preserve placeholders like ⟦0⟧, ⟦1⟧ exactly/);
});

test("AI decision mode swaps the prompt mode and carries the user's skip rules", () => {
	const built = buildAiProviderTranslationPrompt(translationData({autoDecision: true, decisionPrompt: "MY-OWN-RULE"}));
	assert.equal(built.system, "You are a senior bilingual localization specialist and Discord chat translation decision assistant");
	assert.match(built.prompt, /Auto-translate mode: translate only natural-language content/);
	assert.doesNotMatch(built.prompt, /Manual translation mode/);
	assert.match(built.prompt, /MY-OWN-RULE/, "the user's own rules must reach the provider");
	assert.match(built.prompt, new RegExp(`return exactly ${AI_SKIP_TRANSLATION_TOKEN}`));
	assert.equal(AI_SKIP_TRANSLATION_TOKEN, "__SKIP_TRANSLATION__");

	// An empty custom prompt still leaves the skip instruction intact.
	const blank = buildAiProviderTranslationPrompt(translationData({autoDecision: true}));
	assert.match(blank.prompt, /Auto-translate decision rules:/);
});

test("OpenAI text is read from whichever response shape arrived", () => {
	assert.equal(parseOpenAiResponseText(JSON.stringify({output_text: " hi "})), "hi");
	assert.equal(parseOpenAiResponseText(JSON.stringify({output: [{content: [{text: "he"}, {text: "llo"}]}]})), "hello");
	assert.equal(parseOpenAiResponseText(JSON.stringify({choices: [{message: {content: " chat "}}]})), "chat");
	// output_text wins over the others, matching the Responses API contract.
	assert.equal(parseOpenAiResponseText(JSON.stringify({output_text: "first", choices: [{message: {content: "second"}}]})), "first");
	assert.equal(parseOpenAiResponseText("not json"), "");
	assert.equal(parseOpenAiResponseText(""), "");
	assert.equal(parseOpenAiResponseText({output_text: "object body"}), "object body", "an already-parsed body is accepted");
});

test("Gemini text is joined across candidate parts", () => {
	assert.equal(parseGeminiResponseText(JSON.stringify({candidates: [{content: {parts: [{text: "你"}, {text: "好"}]}}]})), "你好");
	assert.equal(parseGeminiResponseText(JSON.stringify({candidates: [{content: {parts: [{inlineData: {}}, {text: " hi "}]}}]})), "hi");
	assert.equal(parseGeminiResponseText(JSON.stringify({candidates: []})), "");
	assert.equal(parseGeminiResponseText("not json"), "");
});

test("batch responses survive fences and prose, and refuse ambiguous ids", () => {
	assert.deepEqual(parseAiBatchTranslationResponse('```json\n[{"id":"1","translation":"一"}]\n```', ["1"]), {"1": "一"});
	assert.deepEqual(parseAiBatchTranslationResponse('Sure! [{"id":"1","translation":"一"}] hope that helps', ["1"]), {"1": "一"});
	assert.deepEqual(parseAiBatchTranslationResponse('{"translations":[{"id":"1","translation":"一"}]}', ["1"]), {"1": "一"});
	// `text` is accepted as an alias for `translation`.
	assert.deepEqual(parseAiBatchTranslationResponse('[{"id":"1","text":"一"}]', ["1"]), {"1": "一"});
	// An id nobody asked for must not be pasted onto a message.
	assert.deepEqual(parseAiBatchTranslationResponse('[{"id":"1","translation":"一"},{"id":"9","translation":"九"}]', ["1"]), {"1": "一"});
	// Two answers for one id: neither is trustworthy, so the id is dropped entirely.
	assert.deepEqual(parseAiBatchTranslationResponse('[{"id":"1","translation":"一"},{"id":"1","translation":"壹"}]', ["1"]), {});
	assert.deepEqual(parseAiBatchTranslationResponse('[{"id":1,"translation":null}]', ["1"]), {"1": ""});
	assert.deepEqual(parseAiBatchTranslationResponse('[{"translation":"orphan"}]', ["1"]), {});
	assert.equal(parseAiBatchTranslationResponse("not json at all"), null);
	assert.equal(parseAiBatchTranslationResponse(""), null);
	assert.equal(parseAiBatchTranslationResponse('{"ok":true}'), null, "a non-array answer is a failure, not an empty batch");
	// Without an expected id list every returned id is accepted.
	assert.deepEqual(parseAiBatchTranslationResponse('[{"id":"7","translation":"七"}]'), {"7": "七"});
});

test("a request that never answers is closed out as a synthetic 504 after 30s", () => {
	const harness = createHarness();
	const seen = [];
	harness.client.requestWithTimeout("https://slow.test", {method: "post"}, (error, response, body) => seen.push({error, response, body}));

	assert.equal(harness.timers[0].delay, PROVIDER_REQUEST_TIMEOUT_MS, "the default window is 30s");
	assert.equal(seen.length, 0);
	harness.fireTimer(0);

	assert.deepEqual(seen, [{error: null, response: {statusCode: 504}, body: ""}]);
	// A 504 is a 5xx, so the timeout itself opens a backoff window.
	assert.equal(harness.client.getBackoffUntil(), 1000 + 2000);
});

test("a late provider answer after a timeout cannot call back twice", () => {
	const harness = createHarness();
	const seen = [];
	harness.client.requestWithTimeout("https://slow.test", {}, (_error, response) => seen.push(response.statusCode));
	harness.fireTimer(0);
	harness.respond(0, null, {statusCode: 200}, "late");

	assert.deepEqual(seen, [504], "the late answer is dropped");
});

test("a prompt answer clears the timeout so it can never fire", () => {
	const harness = createHarness();
	const seen = [];
	harness.client.requestWithTimeout("https://fast.test", {}, (_error, response) => seen.push(response.statusCode));
	harness.respond(0, null, {statusCode: 200}, "ok");

	assert.deepEqual(seen, [200]);
	assert.equal(harness.timers[0].cleared, true);
	assert.equal(harness.client.getBackoffUntil(), 0, "a good response opens no window");
});

test("an HTTP function that throws is reported through the callback, not up the stack", () => {
	const harness = createHarness();
	const client = createProviderClient({
		request: () => {throw new Error("socket exploded");},
		setTimeout: (callback, delay) => ({callback, delay}),
		clearTimeout: () => {},
		now: () => 1000
	});
	const seen = [];
	client.requestWithTimeout("https://broken.test", {}, (error, response, body) => seen.push({message: error && error.message, response, body}));

	assert.deepEqual(seen, [{message: "socket exploded", response: null, body: ""}]);
	assert.equal(harness.calls.length, 0);
});

test("429 and 5xx open backoff windows, other statuses do not", () => {
	const rateLimited = createHarness();
	rateLimited.client.requestWithTimeout("https://x.test", {}, () => {});
	rateLimited.respond(0, null, {statusCode: 429}, "slow down");
	assert.equal(rateLimited.client.getBackoffUntil(), 1000 + 5000);

	const serverError = createHarness();
	serverError.client.requestWithTimeout("https://x.test", {}, () => {});
	serverError.respond(0, null, {statusCode: 503}, "down");
	assert.equal(serverError.client.getBackoffUntil(), 1000 + 2000);

	const clientError = createHarness();
	clientError.client.requestWithTimeout("https://x.test", {}, () => {});
	clientError.respond(0, null, {statusCode: 404}, "missing");
	assert.equal(clientError.client.getBackoffUntil(), 0);

	const networkError = createHarness();
	networkError.client.requestWithTimeout("https://x.test", {}, () => {});
	networkError.respond(0, new Error("offline"), null, "");
	assert.equal(networkError.client.getBackoffUntil(), 0, "a transport error is not provider pressure");
});

test("consecutive pressure doubles the pause and stops at the 60s ceiling", () => {
	const harness = createHarness();
	const {client} = harness;

	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 0);
	assert.equal(client.getBackoffUntil(), 1000 + 5000);

	// Still inside the open window, so the step escalates.
	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 1);
	assert.equal(client.getBackoffUntil(), 1000 + 10000);

	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 2);
	assert.equal(client.getBackoffUntil(), 1000 + 20000);

	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 3);
	assert.equal(client.getBackoffUntil(), 1000 + 40000);

	// 5s doubled four times is 80s, which the ceiling clamps to 60s.
	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 4);
	assert.equal(client.getBackoffUntil(), 1000 + 60000);

	// The step saturates: further pressure cannot push the window past the ceiling.
	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 4);
	assert.equal(client.getBackoffUntil(), 1000 + 60000);
	assert.equal(harness.backoffNotices.length, 6, "every window re-arms the queue retry");
});

test("the 5xx base escalates on its own ladder", () => {
	const harness = createHarness();
	const {client} = harness;
	client.scheduleBackoff(2000);
	assert.equal(client.getBackoffUntil(), 1000 + 2000);
	client.scheduleBackoff(2000);
	assert.equal(client.getBackoffUntil(), 1000 + 4000);
	client.scheduleBackoff(2000);
	assert.equal(client.getBackoffUntil(), 1000 + 8000);
});

test("a window that fully expired resets the escalation", () => {
	const harness = createHarness();
	const {client} = harness;
	client.scheduleBackoff(5000);
	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 1);

	harness.advance(20000);
	assert.equal(client.isBackoffActive(), false);
	client.scheduleBackoff(5000);
	assert.equal(client.getBackoffStep(), 0, "pressure after a quiet period starts over");
	assert.equal(client.getBackoffUntil(), 21000 + 5000);
});

test("a shorter new window never shortens an open one", () => {
	const harness = createHarness();
	const {client} = harness;
	client.scheduleBackoff(60000);
	const until = client.getBackoffUntil();
	harness.advance(10);
	client.scheduleBackoff(1);
	assert.equal(client.getBackoffUntil(), until, "the later deadline wins");
});

test("a zero pause is not a backoff signal at all", () => {
	const harness = createHarness();
	harness.client.scheduleBackoff(0);
	assert.equal(harness.client.getBackoffUntil(), 0);
	assert.equal(harness.backoffNotices.length, 0);
});

test("awaiting the backoff sleeps exactly the remaining time", async () => {
	const harness = createHarness();
	const {client} = harness;

	await client.awaitBackoff();
	assert.deepEqual(harness.sleeps, [], "no window means no wait");

	client.scheduleBackoff(5000);
	harness.advance(1500);
	await client.awaitBackoff();
	assert.deepEqual(harness.sleeps, [3500]);

	harness.advance(10000);
	await client.awaitBackoff();
	assert.deepEqual(harness.sleeps, [3500], "an expired window is not waited on");
});

test("resetting the backoff reopens the queue immediately", () => {
	const harness = createHarness();
	harness.client.scheduleBackoff(5000);
	assert.equal(harness.client.isBackoffActive(), true);
	harness.client.resetBackoff();
	assert.equal(harness.client.isBackoffActive(), false);
	assert.equal(harness.client.getBackoffStep(), 0);
});

test("only engines with real credentials are runtime-configured", () => {
	// Engines with no credential concept are always available.
	assert.equal(createHarness().client.isEngineConfiguredForRuntime("googleapi"), true);
	assert.equal(createHarness().client.isEngineConfiguredForRuntime("yandex"), true);
	assert.equal(createHarness().client.isEngineConfiguredForRuntime("nonsense"), false);

	assert.equal(createHarness().client.isEngineConfiguredForRuntime("openai"), false, "no key means not configured");
	assert.equal(createHarness({authKeys: {openai: {key: "  "}}}).client.isEngineConfiguredForRuntime("openai"), false, "whitespace is not a key");
	assert.equal(createHarness({authKeys: {openai: {key: "k"}}}).client.isEngineConfiguredForRuntime("openai"), true);

	// oaicompat ships placeholder endpoint/model values, so a key alone proves nothing.
	assert.equal(createHarness({authKeys: {oaicompat: {key: "k"}}}).client.isEngineConfiguredForRuntime("oaicompat"), false);
	assert.equal(createHarness({authKeys: {oaicompat: {
		key: "k",
		endpoint: translationEngines.oaicompat.endpoint,
		model: "real-model"
	}}}).client.isEngineConfiguredForRuntime("oaicompat"), false, "the placeholder endpoint does not count");
	assert.equal(createHarness({authKeys: {oaicompat: {
		key: "k",
		endpoint: "https://host.test/v1/chat/completions",
		model: translationEngines.oaicompat.model
	}}}).client.isEngineConfiguredForRuntime("oaicompat"), false, "the placeholder model does not count");
	assert.equal(createHarness({authKeys: {oaicompat: {
		key: "k",
		endpoint: "https://host.test/v1/chat/completions",
		model: "real-model"
	}}}).client.isEngineConfiguredForRuntime("oaicompat"), true);
});

test("Google's keyless endpoint carries its form verbatim and adopts the detected source", () => {
	const harness = createHarness({languages: {fr: {name: "French", ownlang: "Francais"}}});
	const data = translationData({input: {id: "auto", name: "Auto", auto: true}});
	let translated = null;
	harness.client.googleApiTranslate(data, value => {translated = value;});

	assert.equal(harness.lastCall().url, "https://translate.googleapis.com/translate_a/single");
	assert.deepEqual(harness.lastCall().options.form, {
		client: "gtx",
		dt: "t",
		dj: "1",
		source: "input",
		sl: "auto",
		tl: "zh-CN",
		q: encodeURIComponent("hello there")
	});

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({src: "fr", sentences: [{trans: "你"}, {}, {trans: "好"}]}));
	assert.equal(translated, "你好");
	assert.deepEqual(data.input, {id: "fr", name: "French", ownlang: "Francais", auto: true}, "the detected source is written back for the caller to render");
});

test("Google's keyless endpoint transports protected placeholders in a form it preserves", () => {
	// Field reproduction 2026-08-20: Google returned 200 for the long message but
	// silently dropped ⟦4⟧ (ANNOYING), so the strict protection guard rejected the
	// otherwise valid translation. The adapter owns the reversible wire-only token.
	const harness = createHarness();
	let translated = null;
	harness.client.googleApiTranslate(translationData({text: "Prompt editing is ⟦4⟧ with ⟦5⟧ parameters."}), value => {translated = value;});

	const wireText = decodeURIComponent(harness.lastCall().options.form.q);
	assert.equal(wireText, "Prompt editing is __DTA_4__ with __DTA_5__ parameters.");
	harness.respond(0, null, {statusCode: 200}, JSON.stringify({src: "en", sentences: [{trans: "提示编辑是 __DTA_4__，使用 __DTA_5__ 参数。"}]}));
	assert.equal(translated, "提示编辑是 ⟦4⟧，使用 ⟦5⟧ 参数。", "the internal placeholder shape is restored before the protection guard sees the result");
});

test("Google's keyless endpoint translates a long CJK message in bounded lossless requests", () => {
	// The request transports q in the URL. A raw-character limit is insufficient:
	// one CJK character expands to nine URI characters before the request helper
	// serializes the form, which is why some Discord-length messages still failed
	// after the first long-message patch.
	const harness = createHarness({languages: {ja: {name: "Japanese", ownlang: "日本語"}}});
	const source = Array.from({length: 24}, (_, index) => `第${index}段です。これは長い転送テスト本文です。`).join("\n\n");
	const data = translationData({text: source, input: {id: "auto", name: "Auto", auto: true}});
	let translated = null;
	harness.client.googleApiTranslate(data, value => {translated = value;});

	const sentChunks = [];
	let requestIndex = 0;
	while (translated === null) {
		const call = harness.calls[requestIndex];
		assert.ok(call, `chunk ${requestIndex} must be requested`);
		assert.ok(call.options.form.q.length <= FREE_ENGINE_CHUNK_LIMIT, "the encoded q value, not the raw source length, is bounded");
		sentChunks.push(decodeURIComponent(call.options.form.q));
		harness.respond(requestIndex, null, {statusCode: 200}, JSON.stringify({
			src: "ja",
			sentences: [{trans: `译文${requestIndex}|`}]
		}));
		requestIndex++;
		assert.ok(requestIndex < 100, "chunking must terminate");
	}

	assert.ok(requestIndex > 1, "the long message uses more than one bounded request");
	assert.equal(sentChunks.join(""), source, "chunk boundaries do not drop or duplicate source text");
	assert.equal(translated, Array.from({length: requestIndex}, (_, index) => `译文${index}|`).join(""));
	assert.deepEqual(data.input, {id: "ja", name: "Japanese", ownlang: "日本語", auto: true}, "only the first chunk supplies source detection");
});

test("a rate-limited Google reply is distinguished from a dead one in the toast", () => {
	const rateLimited = createHarness();
	rateLimited.client.googleApiTranslate(translationData(), () => {});
	rateLimited.respond(0, null, {statusCode: 429}, "");
	assert.match(rateLimited.toasts[0].message, /HOURLY$/);

	const down = createHarness();
	down.client.googleApiTranslate(translationData(), () => {});
	down.respond(0, null, {statusCode: 500}, "");
	assert.match(down.toasts[0].message, /SERVERDOWN$/);
	// Plain adapters do not go through requestWithTimeout, so no window opens.
	assert.equal(down.client.getBackoffUntil(), 0);
});

test("Azure sends its key, region and per-dialect codes", () => {
	const harness = createHarness({authKeys: {microsoft: {key: "k-ms", region: "eastasia"}}});
	harness.client.microsoftTranslate(translationData({output: {id: "zh-TW", name: "Trad"}}), () => {});
	const call = harness.lastCall();

	assert.equal(call.url, "https://api.cognitive.microsofttranslator.com/translate");
	assert.equal(call.options.headers["Ocp-Apim-Subscription-Key"], "k-ms");
	assert.equal(call.options.headers["Ocp-Apim-Subscription-Region"], "eastasia");
	assert.deepEqual(call.options.form, {"api-version": "3.0", to: "zh-Hant", from: "en"});
	assert.deepEqual(JSON.parse(call.options.body), [{Text: "hello there"}]);

	// "global" is Azure's default scope and must not be sent as a region header.
	const global = createHarness({authKeys: {microsoft: {key: "k-ms", region: "global"}}});
	global.client.microsoftTranslate(translationData(), () => {});
	assert.equal("Ocp-Apim-Subscription-Region" in global.lastCall().options.headers, false);

	// An auto source drops the `from` key entirely so Azure detects it.
	const auto = createHarness({authKeys: {microsoft: {key: "k-ms"}}});
	auto.client.microsoftTranslate(translationData({input: {id: "auto", auto: true}}), () => {});
	assert.equal("from" in auto.lastCall().options.form, false);
});

test("DeepL picks the paid host only for paid keys and upper-cases its codes", () => {
	const free = createHarness({authKeys: {deepl: {key: "k-deepl"}}});
	free.client.deepLTranslate(translationData(), () => {});
	assert.equal(free.lastCall().url, "https://api-free.deepl.com/v2/translate");
	assert.equal(free.lastCall().options.headers.Authorization, "DeepL-Auth-Key k-deepl");
	assert.deepEqual(JSON.parse(free.lastCall().options.body), {text: ["hello there"], target_lang: "ZH", source_lang: "EN"});

	const paid = createHarness({authKeys: {deepl: {key: "k-deepl", paid: true}}});
	paid.client.deepLTranslate(translationData({input: {id: "auto", auto: true}}), () => {});
	assert.equal(paid.lastCall().url, "https://api.deepl.com/v2/translate");
	assert.equal("source_lang" in JSON.parse(paid.lastCall().options.body), false);
});

test("Google Cloud posts key, model and format as form fields", () => {
	const harness = createHarness({authKeys: {googlecloud: {key: "k-gc", model: "nmt"}}});
	harness.client.googleCloudTranslate(translationData(), () => {});
	assert.deepEqual(harness.lastCall().options.form, {
		key: "k-gc",
		q: "hello there",
		target: "zh-CN",
		format: "text",
		model: "nmt",
		source: "en"
	});
});

test("OpenAI translation uses the Responses API and never stores the prompt", () => {
	const harness = createHarness({authKeys: AI_AUTH});
	let translated = null;
	harness.client.openAiTranslate(translationData(), value => {translated = value;});
	const call = harness.lastCall();

	assert.equal(call.url, "https://api.openai.com/v1/responses");
	assert.equal(call.options.headers.Authorization, "Bearer k-openai");
	const body = JSON.parse(call.options.body);
	assert.equal(body.model, "gpt-x");
	assert.equal(body.store, false, "message text must not be retained by the provider");
	assert.equal(body.instructions, "You are a senior bilingual localization specialist");
	assert.match(body.input, /hello there/);

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: "你好"}));
	assert.equal(translated, "你好");
	// AI adapters do go through the timeout wrapper.
	assert.equal(harness.timers[0].delay, PROVIDER_REQUEST_TIMEOUT_MS);
});

test("Gemini translation targets generateContent with the key in the query", () => {
	const harness = createHarness({authKeys: AI_AUTH});
	let translated = null;
	harness.client.geminiTranslate(translationData(), value => {translated = value;});
	const call = harness.lastCall();

	assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=k-gemini");
	const body = JSON.parse(call.options.body);
	assert.equal(body.system_instruction.parts[0].text, "You are a senior bilingual localization specialist");
	assert.equal(body.contents[0].role, "user");
	assert.deepEqual(body.generationConfig, {temperature: 0.2, topP: 0.8});

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({candidates: [{content: {parts: [{text: "你好"}]}}]}));
	assert.equal(translated, "你好");

	// A `models/` prefix on the stored id must not be doubled into the path.
	const prefixed = createHarness({authKeys: {gemini: {key: "k", model: "models/gemini-y"}}});
	prefixed.client.geminiTranslate(translationData(), () => {});
	assert.match(prefixed.lastCall().url, /\/models\/gemini-y:generateContent\?key=k$/);
});

test("chat-completions engines restore [NEWLINE] markers to real line breaks", () => {
	const harness = createHarness({authKeys: AI_AUTH});
	let translated = null;
	harness.client.deepSeekTranslate(translationData(), value => {translated = value;});
	const body = JSON.parse(harness.lastCall().options.body);

	assert.equal(harness.lastCall().url, "https://api.deepseek.com/chat/completions");
	assert.equal(body.model, "ds-x");
	assert.equal(body.messages[0].role, "system");
	assert.equal(body.messages[1].role, "user");
	assert.equal(body.temperature, 0.2);
	assert.equal(body.top_p, 0.8);

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({choices: [{message: {content: "第一行 [NEWLINE] 第二行"}}]}));
	assert.equal(translated, "第一行 \n 第二行");
});

test("an unconfigured chat-completions engine answers empty without touching the network", () => {
	const harness = createHarness();
	let translated = "untouched";
	harness.client.openAiCompatibleTranslate(translationData(), value => {translated = value;});
	assert.equal(translated, "");
	assert.equal(harness.calls.length, 0);
});

test("a failed AI response reports the provider's own reason and yields empty text", () => {
	const harness = createHarness({authKeys: AI_AUTH});
	let translated = null;
	harness.client.openAiTranslate(translationData(), value => {translated = value;});
	harness.respond(0, null, {statusCode: 401}, JSON.stringify({error: {message: "invalid key"}}));

	assert.equal(translated, "");
	assert.equal(harness.toasts[0].message, "FAILED (OpenAI) - invalid key");

	// A 200 that parses to nothing is still a failure, not a blank translation.
	const empty = createHarness({authKeys: AI_AUTH});
	let emptyResult = null;
	empty.client.openAiTranslate(translationData(), value => {emptyResult = value;});
	empty.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: "   "}));
	assert.equal(emptyResult, "");
	assert.equal(empty.toasts.length, 1);
});

test("iTranslate scrapes and caches a public key when the user supplied none", () => {
	const harness = createHarness();
	const data = translationData();
	harness.client.iTranslateTranslate(data, () => {});

	assert.equal(harness.calls[0].url, "https://www.itranslate.com/js/webapp/main.js");
	harness.respond(0, null, {statusCode: 200}, 'x var API_KEY = "scraped-key" y');

	assert.equal(data.engine.APIkey, "scraped-key", "the key is cached on the engine entry");
	assert.equal(harness.calls[1].url, "https://web-api.itranslateapp.com/v3/texts/translate");
	assert.equal(harness.calls[1].options.headers["API-KEY"], "scraped-key");

	// A user key skips the scrape entirely.
	const keyed = createHarness({authKeys: {itranslate: {key: "user-key"}}});
	keyed.client.iTranslateTranslate(translationData(), () => {});
	assert.equal(keyed.calls[0].url, "https://web-api.itranslateapp.com/v3/texts/translate");
	assert.equal(keyed.calls[0].options.headers["API-KEY"], "user-key");
});

test("Yandex parses its XML answer and reads the detected language attribute", () => {
	const harness = createHarness({authKeys: {yandex: {key: "k-y"}}, languages: {de: {name: "German", ownlang: "Deutsch"}}});
	const data = translationData({input: {id: "auto", auto: true}});
	let translated = null;
	harness.client.yandexTranslate(data, value => {translated = value;});

	assert.deepEqual(harness.lastCall().options.form, {
		key: "k-y",
		text: encodeURIComponent("hello there"),
		lang: "zh-CN",
		options: "1"
	});
	harness.respond(0, null, {statusCode: 200}, '<detected lang="de"></detected><text>你好</text>');
	assert.equal(translated, "你好");
	assert.equal(data.input.name, "German");

	// A non-auto source sends the pair form Yandex expects.
	const pair = createHarness({authKeys: {yandex: {key: "k-y"}}});
	pair.client.yandexTranslate(translationData(), () => {});
	assert.equal(pair.lastCall().options.form.lang, "en-zh-CN");

	// The monthly-quota answer arrives as an error document, matched on content.
	const quota = createHarness({authKeys: {yandex: {key: "k-y"}}});
	quota.client.yandexTranslate(translationData(), () => {});
	quota.respond(0, null, {statusCode: 403}, '<Error code="408" />');
	assert.match(quota.toasts[0].message, /MONTHLY$/);
});

test("Papago detects the source language in a separate hop before translating", () => {
	const harness = createHarness({authKeys: {papago: {key: "client-id client-secret"}}, languages: {ja: {name: "Japanese", ownlang: "日本語"}}});
	const data = translationData({input: {id: "auto", auto: true}});
	harness.client.papagoTranslate(data, () => {});

	assert.equal(harness.calls[0].url, "https://openapi.naver.com/v1/papago/detectLangs");
	assert.equal(harness.calls[0].options.headers["X-Naver-Client-Id"], "client-id");
	assert.equal(harness.calls[0].options.headers["X-Naver-Client-Secret"], "client-secret");
	harness.respond(0, null, {statusCode: 200}, JSON.stringify({langCode: "ja"}));

	assert.equal(data.input.name, "Japanese");
	assert.equal(harness.calls[1].url, "https://openapi.naver.com/v1/papago/n2mt");
	assert.deepEqual(harness.calls[1].options.form, {source: "ja", target: "zh-CN", text: "hello there"});

	// A known source language skips detection.
	const fixed = createHarness({authKeys: {papago: {key: "id secret"}}});
	fixed.client.papagoTranslate(translationData(), () => {});
	assert.equal(fixed.calls.length, 1);
	assert.equal(fixed.calls[0].url, "https://openapi.naver.com/v1/papago/n2mt");
});

test("Baidu signs the request with MD5 over appid, text, salt and secret", () => {
	const harness = createHarness({authKeys: {baidu: {key: "appid-1 secret-1"}}});
	harness.client.baiduTranslate(translationData(), () => {});
	const form = harness.lastCall().options.form;

	assert.equal(harness.lastCall().options.bdVersion, true);
	assert.equal(form.appid, "appid-1");
	assert.equal(form.salt, "SALT");
	assert.equal(form.to, "zh", "the dialect table maps zh-CN to Baidu's zh");
	assert.equal(form.q, encodeURIComponent("hello there"));
	assert.equal(form.sign, MD5("appid-1hello thereSALTsecret-1"));

	// A three-part credential uses the third field as the secret.
	const threePart = createHarness({authKeys: {baidu: {key: "appid-1 ignored secret-2"}}});
	threePart.client.baiduTranslate(translationData(), () => {});
	assert.equal(threePart.lastCall().options.form.sign, MD5("appid-1hello thereSALTsecret-2"));
});

test("a Baidu error code is surfaced verbatim so the user can look it up", () => {
	const quota = createHarness({authKeys: {baidu: {key: "a b"}}});
	quota.client.baiduTranslate(translationData(), () => {});
	quota.respond(0, null, {statusCode: 200}, JSON.stringify({error_code: 54004, error_msg: "quota"}));
	assert.match(quota.toasts[0].message, /MONTHLY\.$/);

	const other = createHarness({authKeys: {baidu: {key: "a b"}}});
	other.client.baiduTranslate(translationData(), () => {});
	other.respond(0, null, {statusCode: 200}, JSON.stringify({error_code: 52003, error_msg: "unauthorized"}));
	assert.match(other.toasts[0].message, /52003 : unauthorized\.$/);
});

test("translate dispatches through the catalog and refuses unknown engines", () => {
	const harness = createHarness({authKeys: AI_AUTH});
	harness.client.translate("openai", translationData(), () => {});
	assert.equal(harness.lastCall().url, "https://api.openai.com/v1/responses");

	let result = "untouched";
	harness.client.translate("nonsense", translationData(), value => {result = value;});
	assert.equal(result, "");
	assert.equal(harness.calls.length, 1, "an unknown engine makes no request");
	assert.equal(harness.client.getEngineAdapter("nonsense"), null);
	// Every catalog entry must resolve to a real adapter, or routing silently fails.
	for (const engineKey of Object.keys(translationEngines)) assert.equal(typeof harness.client.getEngineAdapter(engineKey), "function", engineKey);
});

test("a batch keys every message by id and folds newlines into markers", async () => {
	const harness = createHarness({authKeys: AI_AUTH});
	const pending = harness.client.requestAiBatchTranslation("openai", preparedItems());
	const call = harness.lastCall();
	const body = JSON.parse(call.options.body);

	assert.equal(call.url, "https://api.openai.com/v1/responses");
	assert.equal(call.options.headers.Authorization, "Bearer k-openai");
	assert.equal(body.instructions, "You are a strict Discord chat batch translator. Return valid JSON only.");
	assert.equal(body.store, false);
	assert.match(body.input, /Target language is exactly Chinese\./);
	assert.match(body.input, /Input language is English\./);
	assert.match(body.input, /"id":"100","text":"hello \[NEWLINE\] there"/);
	assert.match(body.input, /"id":"200","text":"second"/);

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: JSON.stringify([
		{id: "100", translation: "第一条"},
		{id: "200", translation: "第二条"}
	])}));
	assert.deepEqual(await pending, {"100": "第一条", "200": "第二条"});
});

test("a batch without AI decision mode forbids the model from skipping", async () => {
	const harness = createHarness({authKeys: AI_AUTH, aiDecision: false});
	const pending = harness.client.requestAiBatchTranslation("deepseek", preparedItems());
	const prompt = JSON.parse(harness.lastCall().options.body).messages.map(entry => entry.content).join("\n");

	assert.match(prompt, /The plugin has already filtered messages that should be skipped; do not make skip decisions\./);
	assert.doesNotMatch(prompt, /__SKIP_TRANSLATION__/, "no skip verdict is offered when the plugin already decided");
	harness.respond(0, null, {statusCode: 200}, JSON.stringify({choices: [{message: {content: "[]"}}]}));
	assert.deepEqual(await pending, {});
});

test("AI decision mode carries the user's own skip rules into the batch prompt", async () => {
	const harness = createHarness({authKeys: AI_AUTH, aiDecision: true, aiPrompt: "DISTINCT-USER-RULE"});
	const pending = harness.client.requestAiBatchTranslation("deepseek", preparedItems("channel-ai"));
	const prompt = JSON.parse(harness.lastCall().options.body).messages.map(entry => entry.content).join("\n");

	assert.match(prompt, /DISTINCT-USER-RULE/, "the user's own decision prompt must reach the batch request");
	assert.match(prompt, /set its "translation" to exactly __SKIP_TRANSLATION__/, "each item may answer with a skip verdict");
	assert.doesNotMatch(prompt, /do not make skip decisions/, "the no-skip instruction must not contradict AI decision mode");

	// A per-item skip verdict comes back as an ordinary translation value.
	harness.respond(0, null, {statusCode: 200}, JSON.stringify({choices: [{message: {content: JSON.stringify([
		{id: "100", translation: AI_SKIP_TRANSLATION_TOKEN},
		{id: "200", translation: "第二条"}
	])}}]}));
	assert.deepEqual(await pending, {"100": AI_SKIP_TRANSLATION_TOKEN, "200": "第二条"});
});

test("a Gemini batch posts to generateContent with a low temperature", async () => {
	const harness = createHarness({authKeys: AI_AUTH});
	const pending = harness.client.requestAiBatchTranslation("gemini", preparedItems());
	const call = harness.lastCall();
	const body = JSON.parse(call.options.body);

	assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent?key=k-gemini");
	assert.deepEqual(body.generationConfig, {temperature: 0.1, topP: 0.8});
	assert.match(body.contents[0].parts[0].text, /Messages JSON:/);

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({candidates: [{content: {parts: [{text: '[{"id":"100","translation":"一"}]'}]}}]}));
	assert.deepEqual(await pending, {"100": "一"});
});

test("a chat-completions batch pins temperature and top_p", async () => {
	const harness = createHarness({authKeys: AI_AUTH});
	const pending = harness.client.requestAiBatchTranslation("oaicompat", preparedItems());
	const body = JSON.parse(harness.lastCall().options.body);

	assert.equal(harness.lastCall().url, "https://compat.example/v1/chat/completions");
	assert.equal(body.model, "compat-x");
	assert.equal(body.temperature, 0.1);
	assert.equal(body.top_p, 0.8);

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({choices: [{message: {content: '[{"id":"100","translation":"一"}]'}}]}));
	assert.deepEqual(await pending, {"100": "一"});
});

test("a batch refuses to start without an engine, items or credentials", async () => {
	const harness = createHarness({authKeys: AI_AUTH});
	assert.equal(await harness.client.requestAiBatchTranslation("", preparedItems()), null);
	assert.equal(await harness.client.requestAiBatchTranslation("openai", []), null);
	assert.equal(await harness.client.requestAiBatchTranslation("openai", null), null);
	assert.equal(await createHarness().client.requestAiBatchTranslation("openai", preparedItems()), null, "no credentials, no request");
	assert.equal(harness.calls.length, 0);
});

test("a batch that errors or times out resolves null rather than a partial map", async () => {
	const failed = createHarness({authKeys: AI_AUTH});
	const failedPending = failed.client.requestAiBatchTranslation("openai", preparedItems());
	failed.respond(0, null, {statusCode: 500}, "boom");
	assert.equal(await failedPending, null);
	// The 5xx still opens the shared backoff window the queue consults.
	assert.equal(failed.client.isBackoffActive(), true);

	const timedOut = createHarness({authKeys: AI_AUTH});
	const timedOutPending = timedOut.client.requestAiBatchTranslation("openai", preparedItems());
	timedOut.fireTimer(0);
	assert.equal(await timedOutPending, null);

	// A 200 whose content is not a JSON array is a failure, not an empty batch.
	const garbled = createHarness({authKeys: AI_AUTH});
	const garbledPending = garbled.client.requestAiBatchTranslation("openai", preparedItems());
	garbled.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: "I cannot do that."}));
	assert.equal(await garbledPending, null);
});

test("detailed batch outcomes distinguish authentication transient and malformed failures", async () => {
	for (const statusCode of [401, 403]) {
		const harness = createHarness({authKeys: AI_AUTH});
		const pending = harness.client.requestAiBatchTranslationDetailed("openai", preparedItems());
		harness.respond(0, null, {statusCode}, "bad credentials");
		assert.deepEqual(await pending, {translations: null, failureKind: "auth", statusCode});
		assert.equal(harness.calls.length, 1);
		assert.equal(harness.toasts.length, 1, "the terminal batch still tells the user why it stopped");
		assert.match(harness.toasts[0].message, /KEYOUTDATED/);
	}

	const unavailable = createHarness({authKeys: AI_AUTH});
	const unavailablePending = unavailable.client.requestAiBatchTranslationDetailed("openai", preparedItems());
	unavailable.respond(0, null, {statusCode: 503}, "unavailable");
	assert.deepEqual(await unavailablePending, {translations: null, failureKind: "transient", statusCode: 503});

	const timedOut = createHarness({authKeys: AI_AUTH});
	const timedOutPending = timedOut.client.requestAiBatchTranslationDetailed("openai", preparedItems());
	timedOut.fireTimer(0);
	assert.deepEqual(await timedOutPending, {translations: null, failureKind: "transient", statusCode: 504});

	const malformed = createHarness({authKeys: AI_AUTH});
	const malformedPending = malformed.client.requestAiBatchTranslationDetailed("openai", preparedItems());
	malformed.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: "not a batch"}));
	assert.deepEqual(await malformedPending, {translations: null, failureKind: "malformed", statusCode: 200});
});

test("detailed batch success preserves the old map-only batch API", async () => {
	const detailed = createHarness({authKeys: AI_AUTH});
	const detailedPending = detailed.client.requestAiBatchTranslationDetailed("openai", preparedItems());
	detailed.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: '[{"id":"100","translation":"一"}]'}));
	assert.deepEqual(await detailedPending, {translations: {"100": "一"}, failureKind: null, statusCode: 200});

	const compatible = createHarness({authKeys: AI_AUTH});
	const compatiblePending = compatible.client.requestAiBatchTranslation("openai", preparedItems());
	compatible.respond(0, null, {statusCode: 401}, "bad credentials");
	assert.equal(await compatiblePending, null);
});

test("a batch answer for a message that was not asked about is discarded", async () => {
	const harness = createHarness({authKeys: AI_AUTH});
	const pending = harness.client.requestAiBatchTranslation("openai", preparedItems());
	harness.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: JSON.stringify([
		{id: "100", translation: "第一条"},
		{id: "999", translation: "不属于本批"}
	])}));
	assert.deepEqual(await pending, {"100": "第一条"});
});

test("validation refuses to spend a request on an obviously incomplete config", async () => {
	const noKey = createHarness();
	assert.deepEqual(await noKey.client.validateEngineConfig("openai"), {ok: false, normalized: false});
	assert.equal(noKey.calls.length, 0);
	assert.equal(noKey.toasts[0].message, "LABEL:openai: TEXT:validate_missing_key");

	// Engines with nothing to validate are rejected before any of that.
	const unsupported = createHarness();
	assert.deepEqual(await unsupported.client.validateEngineConfig("googleapi"), {ok: false, normalized: false});
	assert.equal(unsupported.toasts.length, 0, "an unsupported engine shows no toast");

	const placeholderEndpoint = createHarness({authKeys: {oaicompat: {key: "k", endpoint: translationEngines.oaicompat.endpoint, model: "m"}}});
	assert.equal((await placeholderEndpoint.client.validateEngineConfig("oaicompat")).ok, false);
	assert.equal(placeholderEndpoint.toasts[0].message, "LABEL:oaicompat: TEXT:validate_missing_endpoint");

	const placeholderModel = createHarness({authKeys: {oaicompat: {key: "k", endpoint: "https://host.test/v1/chat/completions", model: translationEngines.oaicompat.model}}});
	assert.equal((await placeholderModel.client.validateEngineConfig("oaicompat")).ok, false);
	assert.equal(placeholderModel.toasts[0].message, "LABEL:oaicompat: TEXT:validate_missing_model");
	assert.equal(placeholderModel.calls.length, 0);
});

test("validation rewrites a malformed endpoint and persists the correction", async () => {
	const harness = createHarness({authKeys: {openai: {key: "k", endpoint: "https://proxy.test/v1", model: "m"}}});
	const pending = harness.client.validateEngineConfig("openai");

	assert.equal(harness.lastCall().url, "https://proxy.test/v1/responses");
	assert.equal(harness.authKeys.openai.endpoint, "https://proxy.test/v1/responses");
	assert.deepEqual(harness.saves[harness.saves.length - 1].openai.endpoint, "https://proxy.test/v1/responses");
	assert.equal(harness.normalizedNotices.length, 1, "the settings panel is told the value changed under it");

	harness.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: "Guten Morgen"}));
	assert.deepEqual(await pending, {ok: true, normalized: true});
	assert.match(harness.toasts[harness.toasts.length - 1].message, /TEXT:validate_saved_endpoint/);
	assert.match(harness.toasts[harness.toasts.length - 1].message, /\(Guten Morgen\)/, "the sample translation is previewed");

	// An already-correct endpoint is left alone and nothing is saved.
	const clean = createHarness({authKeys: {openai: {key: "k", endpoint: "https://api.openai.com/v1/responses", model: "m"}}});
	const cleanPending = clean.client.validateEngineConfig("openai");
	clean.respond(0, null, {statusCode: 200}, JSON.stringify({output_text: "Guten Morgen"}));
	assert.deepEqual(await cleanPending, {ok: true, normalized: false});
	assert.equal(clean.saves.length, 0);
});

test("each validated engine is probed with its own native generation call", async () => {
	const cases = [
		["googlecloud", {googlecloud: {key: "k-gc", model: "custom"}}, call => {
			assert.deepEqual(call.options.form, {key: "k-gc", q: "Good morning", source: "en", target: "de", format: "text", model: "custom"});
		}, JSON.stringify({data: {translations: [{translatedText: "Guten Morgen"}]}})],
		["microsoft", {microsoft: {key: "k-ms", region: "westus"}}, call => {
			assert.equal(call.options.headers["Ocp-Apim-Subscription-Region"], "westus");
			assert.deepEqual(call.options.form, {"api-version": "3.0", from: "en", to: "de"});
		}, JSON.stringify([{translations: [{text: "Guten Morgen"}]}])],
		["deepl", {deepl: {key: "k-deepl"}}, call => {
			assert.equal(call.url, "https://api-free.deepl.com/v2/translate");
			assert.deepEqual(JSON.parse(call.options.body), {text: ["Good morning"], source_lang: "EN", target_lang: "DE"});
		}, JSON.stringify({translations: [{text: "Guten Morgen"}]})],
		["gemini", {gemini: {key: "k-g", endpoint: "https://g.test/v1beta/models", model: "gemini-x"}}, call => {
			assert.equal(call.url, "https://g.test/v1beta/models/gemini-x:generateContent?key=k-g");
		}, JSON.stringify({candidates: [{content: {parts: [{text: "Guten Morgen"}]}}]})],
		["deepseek", {deepseek: {key: "k-ds", endpoint: "https://api.deepseek.com/chat/completions", model: "ds-x"}}, call => {
			const body = JSON.parse(call.options.body);
			assert.equal(body.temperature, 0);
			// A cap, not a charge: you pay for what the model generates, so headroom is
			// only spent when the model actually reasons. 32 was tight enough that a
			// reasoning model never reached its answer and validation reported failure.
			assert.ok(body.max_tokens >= 256 && body.max_tokens <= 1024, `validation probe budget out of range: ${body.max_tokens}`);
		}, JSON.stringify({choices: [{message: {content: " Guten Morgen "}}]})]
	];
	for (const [engineKey, authKeys, checkCall, body] of cases) {
		const harness = createHarness({authKeys});
		const pending = harness.client.validateEngineConfig(engineKey);
		checkCall(harness.lastCall());
		harness.respond(0, null, {statusCode: 200}, body);
		assert.deepEqual(await pending, {ok: true, normalized: false}, engineKey);
		assert.match(harness.toasts[harness.toasts.length - 1].message, /\(Guten Morgen\)/, engineKey);
		assert.equal(harness.toasts[0].closed, true, "the running toast is closed when the probe settles");
	}
});

test("a validation failure names the status and the provider's reason", async () => {
	const harness = createHarness({authKeys: AI_AUTH});
	const pending = harness.client.validateEngineConfig("openai");
	harness.respond(0, null, {statusCode: 401}, JSON.stringify({error: {message: "bad key"}}));

	assert.deepEqual(await pending, {ok: false, normalized: false});
	assert.equal(harness.toasts[harness.toasts.length - 1].message, "LABEL:openai: TEXT:validate_failed (401) - bad key");

	// A 200 carrying no translation is still a failure.
	const empty = createHarness({authKeys: AI_AUTH});
	const emptyPending = empty.client.validateEngineConfig("deepseek");
	empty.respond(0, null, {statusCode: 200}, JSON.stringify({choices: []}));
	assert.equal((await emptyPending).ok, false);
});

test("the model catalog reads each provider's listing schema", async () => {
	const gemini = createHarness({authKeys: {gemini: {key: "k-g", endpoint: "https://g.test/v1beta/models"}}});
	const geminiPending = gemini.client.fetchModelCatalog("gemini");
	assert.equal(gemini.lastCall().url, "https://g.test/v1beta/models?key=k-g");
	assert.equal("Authorization" in gemini.lastCall().options.headers, false, "Gemini authenticates in the query, not a header");
	gemini.respond(0, null, {statusCode: 200}, JSON.stringify({models: [
		{name: "models/zeta", supportedGenerationMethods: ["generateContent"]},
		{name: "models/alpha", supportedGenerationMethods: ["generateContent"]},
		{name: "models/embedder", supportedGenerationMethods: ["embedContent"]}
	]}));
	// Sorted, prefix-stripped, and filtered to models that can actually generate.
	assert.deepEqual(await geminiPending, {ok: true, items: ["alpha", "zeta"]});

	const openai = createHarness({authKeys: AI_AUTH});
	const openaiPending = openai.client.fetchModelCatalog("openai");
	assert.equal(openai.lastCall().url, "https://api.openai.com/v1/models");
	assert.equal(openai.lastCall().options.headers.Authorization, "Bearer k-openai");
	assert.equal(openai.lastCall().options.method, "get");
	openai.respond(0, null, {statusCode: 200}, JSON.stringify({data: [{id: "gpt-b"}, {id: "gpt-a"}, {id: ""}, {}]}));
	assert.deepEqual(await openaiPending, {ok: true, items: ["gpt-a", "gpt-b"]});
});

test("catalog state tracks loading and results for the settings panel", async () => {
	const harness = createHarness({authKeys: AI_AUTH});
	const updates = [];
	const pending = harness.client.fetchModelCatalog("openai", () => updates.push(JSON.parse(JSON.stringify(harness.client.getModelCatalogState()))));

	assert.equal(updates[0].openai.loading, true);
	assert.equal(updates[0].openai.endpoint, "https://api.openai.com/v1/models");
	harness.respond(0, null, {statusCode: 200}, JSON.stringify({data: [{id: "gpt-a"}]}));
	await pending;

	const state = harness.client.getModelCatalogState();
	assert.equal(state.openai.loading, false);
	assert.deepEqual(state.openai.items, ["gpt-a"]);
	assert.equal(state.openai.fetchedAt, 1000, "the fetch time comes from the injected clock");

	harness.client.clearModelCatalogState();
	assert.deepEqual(harness.client.getModelCatalogState(), {});
});

test("an empty or failed catalog clears the list instead of keeping a stale one", async () => {
	const empty = createHarness({authKeys: AI_AUTH});
	const emptyPending = empty.client.fetchModelCatalog("openai");
	empty.respond(0, null, {statusCode: 200}, JSON.stringify({data: []}));
	assert.deepEqual(await emptyPending, {ok: true, items: []});
	assert.equal(empty.toasts[0].options.type, "warning");

	const failed = createHarness({authKeys: AI_AUTH});
	const failedPending = failed.client.fetchModelCatalog("openai");
	failed.respond(0, null, {statusCode: 403}, JSON.stringify({error: {message: "no access"}}));
	assert.deepEqual(await failedPending, {ok: false, items: []});
	assert.deepEqual(failed.client.getModelCatalogState().openai.items, []);
	assert.equal(failed.client.getModelCatalogState().openai.loading, false);
	assert.equal(failed.toasts[0].message, "LABEL:openai: TEXT:validate_failed (403) - no access");
});

test("the catalog is refused for engines that cannot list models or lack credentials", async () => {
	const unsupported = createHarness({authKeys: AI_AUTH});
	assert.deepEqual(await unsupported.client.fetchModelCatalog("microsoft"), {ok: false, items: []});
	assert.equal(unsupported.calls.length, 0);
	assert.equal(unsupported.toasts.length, 0);

	const noKey = createHarness();
	assert.deepEqual(await noKey.client.fetchModelCatalog("openai"), {ok: false, items: []});
	assert.equal(noKey.toasts[0].message, "LABEL:openai: TEXT:validate_missing_key");

	const placeholder = createHarness({authKeys: {oaicompat: {key: "k", endpoint: translationEngines.oaicompat.endpoint}}});
	assert.deepEqual(await placeholder.client.fetchModelCatalog("oaicompat"), {ok: false, items: []});
	assert.equal(placeholder.toasts[0].message, "LABEL:oaicompat: TEXT:validate_missing_endpoint");
	assert.equal(placeholder.calls.length, 0);
});

test("every adapter settles with an empty translation when the network fails outright", async () => {
	// A DNS failure or socket reset calls back with error set and response null.
	// Dereferencing response.statusCode there throws inside the callback, so the
	// translation never settles and the caller waits out its whole timeout.
	const client = createProviderClient({
		request: (_url, _options, callback) => callback(new Error("ENOTFOUND"), null, null),
		setTimeout: (callback, delay) => setTimeout(callback, delay),
		clearTimeout: timer => clearTimeout(timer),
		now: () => Date.now(),
		getAuthKeys: () => ({
			googlecloud: {key: "k"}, microsoft: {key: "k"}, deepl: {key: "k", paid: false},
			yandex: {key: "k"}, papago: {key: "k", secret: "s"}, baidu: {key: "k", secret: "s"},
			deepseek: {key: "k"}, openai: {key: "k"}, gemini: {key: "k"}, oaicompat: {key: "k", endpoint: "https://e.test/v1/chat/completions", model: "m"}
		}),
		saveAuthKeys: () => {},
		getLanguages: () => ({en: {id: "en", name: "English"}, "zh-CN": {id: "zh-CN", name: "Chinese"}}),
		notify: () => null,
		getLabels: () => ({toast_translating_failed: "failed", toast_translating_tryanother: "try another", error_hourlylimit: "hourly", error_dailylimit: "daily", error_keyoutdated: "outdated"}),
		getCustomText: key => key,
		getEngineLabel: key => key,
		shouldUseAiAutoTranslateDecision: () => false,
		getAiAutoTranslatePrompt: () => "rules"
	});
	const data = {
		engine: translationEngines.googleapi,
		input: {id: "en", name: "English"},
		output: {id: "zh-CN", name: "Chinese"},
		text: "hello",
		autoDecision: false
	};

	const adapters = ["googleApiTranslate", "microsoftTranslate", "deepLTranslate", "iTranslateTranslate", "papagoTranslate", "baiduTranslate", "yandexTranslate", "googleCloudTranslate"];
	for (const adapter of adapters) {
		if (typeof client[adapter] != "function") continue;
		const settled = await new Promise(resolve => {
			const timer = setTimeout(() => resolve("NEVER SETTLED"), 500);
			try {
				client[adapter](Object.assign({}, data, {engine: translationEngines[adapter.replace(/Translate$/, "").toLowerCase()] || translationEngines.googleapi}), value => {
					clearTimeout(timer);
					resolve(value);
				});
			}
			catch (error) {
				clearTimeout(timer);
				resolve("THREW: " + error.message);
			}
		});
		assert.equal(settled, "", `${adapter} must settle with an empty translation on a network failure, got ${JSON.stringify(settled)}`);
	}
});

test("validation accepts a reasoning model that spent its budget before answering", async () => {
	// The 检测模型 button caps max_tokens so the check stays cheap. A reasoning model
	// fills reasoning_content first, so a small cap returns HTTP 200 with an empty
	// message.content - which read as "验证失败 (200)" even though the key, endpoint
	// and model were all provably fine. What this button is asked to prove is that the
	// provider accepted the request, and a truncated answer proves exactly that.
	const truncated = createHarness({authKeys: {deepseek: {key: "k", model: "deepseek-reasoner"}}});
	const pending = truncated.client.validateEngineConfig("deepseek");
	const sent = JSON.parse(truncated.calls[0].options.body);
	assert.ok(sent.max_tokens >= 256, `max_tokens ${sent.max_tokens} leaves no room for reasoning`);
	truncated.respond(0, null, {statusCode: 200}, JSON.stringify({
		choices: [{message: {role: "assistant", content: "", reasoning_content: "Let me think about the German."}, finish_reason: "length"}]
	}));
	assert.equal((await pending).ok, true);

	// A 200 carrying no choice at all is still a failure - nothing was proven.
	const empty = createHarness({authKeys: {deepseek: {key: "k", model: "deepseek-chat"}}});
	const emptyPending = empty.client.validateEngineConfig("deepseek");
	empty.respond(0, null, {statusCode: 200}, JSON.stringify({choices: []}));
	assert.equal((await emptyPending).ok, false);

	// The ordinary case still reports the translation it got back.
	const normal = createHarness({authKeys: {deepseek: {key: "k", model: "deepseek-chat"}}});
	const normalPending = normal.client.validateEngineConfig("deepseek");
	normal.respond(0, null, {statusCode: 200}, JSON.stringify({choices: [{message: {content: "Hallo"}, finish_reason: "stop"}]}));
	assert.equal((await normalPending).ok, true);
	assert.match(normal.toasts[normal.toasts.length - 1].message, /Hallo/);
});

test("deepseek requests ask for the non-thinking mode, other engines are untouched", () => {
	// DeepSeek v4 thinks by default. Every thinking token is billed as output and waited
	// on before the answer starts, and translation gains nothing from a chain of thought.
	// The flag is deepseek-only: "oaicompat" points at arbitrary OpenAI-compatible servers
	// and some reject a request carrying an unknown top-level field.
	const single = createHarness({authKeys: {deepseek: {key: "k", model: "deepseek-v4-flash"}}});
	single.client.translate("deepseek", translationData(), () => {});
	assert.deepEqual(JSON.parse(single.calls[0].options.body).thinking, {type: "disabled"});

	const batch = createHarness({authKeys: {deepseek: {key: "k", model: "deepseek-v4-flash"}}});
	batch.client.requestAiBatchTranslation("deepseek", preparedItems());
	assert.deepEqual(JSON.parse(batch.calls[0].options.body).thinking, {type: "disabled"});

	const probe = createHarness({authKeys: {deepseek: {key: "k", model: "deepseek-v4-flash"}}});
	probe.client.validateEngineConfig("deepseek");
	assert.deepEqual(JSON.parse(probe.calls[0].options.body).thinking, {type: "disabled"});

	// A generic OpenAI-compatible endpoint must not receive the DeepSeek-specific field.
	const compat = createHarness({authKeys: {oaicompat: {key: "k", endpoint: "https://host.test/v1/chat/completions", model: "m"}}});
	compat.client.translate("oaicompat", translationData(), () => {});
	assert.equal(JSON.parse(compat.calls[0].options.body).thinking, undefined);
});

test("identical failure toasts within the dedup window collapse to one", async () => {
	// 2026-08-19 report: a 26-message backfill is three chunks; a dead provider
	// (quota exhausted) failed all three and the user got three identical popups.
	// The same danger message repeats silently inside the window and speaks again
	// after it, and a different message is never suppressed.
	const harness = createHarness({authKeys: AI_AUTH});
	for (let chunk = 0; chunk < 3; chunk++) {
		const pending = harness.client.requestAiBatchTranslationDetailed("openai", preparedItems());
		harness.respond(chunk, null, {statusCode: 401}, "bad credentials");
		await pending;
	}
	assert.equal(harness.toasts.length, 1, "three identical chunk failures speak once");
	assert.match(harness.toasts[0].message, /KEYOUTDATED/);

	harness.advance(11000);
	const later = harness.client.requestAiBatchTranslationDetailed("openai", preparedItems());
	harness.respond(3, null, {statusCode: 401}, "bad credentials");
	await later;
	assert.equal(harness.toasts.length, 2, "after the window the same failure speaks again");

	harness.client.googleApiTranslate(translationData(), () => {});
	harness.respond(4, null, {statusCode: 429}, "");
	assert.equal(harness.toasts.length, 3, "a different failure message inside the window is never suppressed");
	assert.match(harness.toasts.at(-1).message, /HOURLY$/);
});

const {splitTextIntoTranslationChunks, FREE_ENGINE_CHUNK_LIMIT} = require("../src/providers/provider-client");

test("splitTextIntoTranslationChunks is lossless and bounded", () => {
	// Field 2026-08-19: long messages failed on the free engine because the whole
	// text traveled in one request URL. Chunks must concatenate back exactly and
	// each stay within the limit.
	const shortText = "short message";
	assert.deepEqual(splitTextIntoTranslationChunks(shortText, 100), [shortText]);

	const paragraphs = Array.from({length: 30}, (_, index) => `Paragraph ${index} with some words in it.`).join("\n\n");
	const chunks = splitTextIntoTranslationChunks(paragraphs, 200);
	assert.ok(chunks.length > 1, "a long text splits");
	assert.ok(chunks.every(chunk => chunk.length <= 200), "every chunk respects the limit");
	assert.equal(chunks.join(""), paragraphs, "concatenation reproduces the exact input");

	const sentenceSpaces = "First sentence. Second sentence! Third one? Fourth.";
	assert.equal(splitTextIntoTranslationChunks(sentenceSpaces, 20).join(""), sentenceSpaces, "sentence-boundary splits keep the whitespace");

	const oneGiantWord = "x".repeat(5000);
	const hardChunks = splitTextIntoTranslationChunks(oneGiantWord, FREE_ENGINE_CHUNK_LIMIT);
	assert.ok(hardChunks.every(chunk => chunk.length <= FREE_ENGINE_CHUNK_LIMIT));
	assert.equal(hardChunks.join(""), oneGiantWord);

	const nearBoundaryPlaceholder = `${"x".repeat(55)}__DTA_123__${"y".repeat(40)}`;
	const placeholderChunks = splitTextIntoTranslationChunks(nearBoundaryPlaceholder, 60);
	assert.equal(placeholderChunks.join(""), nearBoundaryPlaceholder);
	assert.ok(placeholderChunks.some(chunk => chunk.includes("__DTA_123__")), "a hard cut never slices a transport placeholder in half");
	assert.ok(placeholderChunks.every(chunk => !/__DTA_\d*$|^\d+__/.test(chunk)), "no chunk carries a placeholder fragment");
});
