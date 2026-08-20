const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
	MAX_TRANSLATION_CACHE_ENTRIES,
	RECEIVED_SKIP_CACHE_POLICY_VERSION,
	TRANSLATION_CACHE_SAVE_DEBOUNCE_MS,
	createTranslationCacheStore
} = require("../src/cache/translation-cache-store");

// A message id that is not array-index-like, so Object.keys keeps insertion order the
// way real Discord snowflakes do.
function messageId(index) {
	return `900000000000000${String(index).padStart(4, "0")}`;
}

function createHarness(overrides = {}) {
	let clock = 1000;
	let nextTimerId = 1;
	const timers = new Map();
	const saves = [];
	const store = createTranslationCacheStore(Object.assign({
		now: () => clock,
		setTimeout: (callback, delay) => {
			const id = nextTimerId++;
			timers.set(id, {callback, dueAt: clock + delay});
			return id;
		},
		clearTimeout: id => {
			timers.delete(id);
		},
		saveCache: value => {
			saves.push({value, keys: Object.keys(value), at: clock});
		},
		extractOriginalContentData: message => ({content: message.content || "", embeds: []}),
		createSignature: (message, channelId, sourceData) => JSON.stringify({channelId, content: sourceData && sourceData.content || ""})
	}, overrides));
	const advance = ms => {
		clock += ms;
		for (const [id, timer] of Array.from(timers)) {
			if (timer.dueAt > clock) continue;
			timers.delete(id);
			timer.callback();
		}
	};
	return {
		store,
		saves,
		advance,
		now: () => clock,
		pendingTimerCount: () => timers.size,
		setClock: value => {
			clock = value;
		},
		flushSave: () => advance(TRANSLATION_CACHE_SAVE_DEBOUNCE_MS)
	};
}

function createMessage(id, content = "hello world") {
	return {id, content, embeds: []};
}

function signatureFor(channelId, content) {
	return JSON.stringify({channelId, content});
}

test("a persisted signature is a compact digest, not the raw configuration blob", () => {
	const {store} = createHarness();
	// The real signature is the whole request configuration serialised; it is long.
	const signature = JSON.stringify({channelId: "c1", content: "hello world", policy: "x".repeat(400)});

	store.persistTranslation("m1", signature, {translatedContent: "你好世界", originalContent: "hello world"});
	const entry = store.getEntry("m1");

	assert.ok(entry.signature.startsWith("h1:"), "a digest is tagged so raw entries stay distinguishable");
	assert.ok(entry.signature.length < signature.length / 4, `digest must be compact, got ${entry.signature.length} vs raw ${signature.length}`);
});

test("the signature digest is deterministic and separates different inputs", () => {
	const {store} = createHarness();

	assert.equal(store.hashSignature("abc"), store.hashSignature("abc"));
	assert.notEqual(store.hashSignature("abc"), store.hashSignature("abd"));
	assert.notEqual(store.hashSignature("abc"), store.hashSignature("abcabc"));
	assert.equal(store.hashSignature(null), store.hashSignature(""), "a missing signature hashes as empty");
});

test("a digest entry matches only its own signature", () => {
	const {store} = createHarness();
	store.persistTranslation("m1", "sig-a", {translatedContent: "译文"});
	const entry = store.getEntry("m1");

	assert.equal(store.matchesSignature(entry, "sig-a"), true);
	assert.equal(store.matchesSignature(entry, "sig-b"), false);
	assert.equal(store.matchesSignature(null, "sig-a"), false);
	assert.equal(store.matchesSignature({signature: null}, "sig-a"), false, "an entry with no signature never matches");
});

test("a pre-digest raw-signature entry keeps hitting, so an existing paid cache survives the upgrade", () => {
	const {store} = createHarness();
	const message = createMessage("m1");
	const signature = signatureFor("c1", "hello world");
	store.seedRawEntryForTest(message.id, signature, {translatedContent: "你好世界", originalContent: "hello world"});

	const entry = store.getEntry(message.id);
	assert.equal(entry.signature, signature, "the seeded entry is genuinely undigested");
	assert.equal(store.matchesSignature(entry, signature), true, "raw entries match on their raw value");

	const hit = store.getCachedTranslation(message, "c1");
	assert.ok(hit, "a legacy raw-signature entry must still be served");
	assert.equal(hit.translatedContent, "你好世界");
});

test("the duplicated nested translation signature is stripped before persisting", () => {
	const {store} = createHarness();
	const signature = signatureFor("c1", "hello world");

	store.persistTranslation("m1", signature, {
		signature,
		channelId: "c1",
		translatedContent: "你好世界",
		originalContent: "hello world"
	});

	const entry = store.getEntry("m1");
	assert.equal(entry.translation.signature, undefined, "the inner copy would double the entry cost");
	assert.equal(entry.translation.translatedContent, "你好世界", "everything else is kept verbatim");
});

test("persisting does not mutate the translation the caller handed in", () => {
	const {store} = createHarness();
	const translation = {signature: "sig-a", translatedContent: "译文"};

	store.persistTranslation("m1", "sig-a", translation);

	assert.equal(translation.signature, "sig-a", "the caller's object keeps its own signature");
});

test("only skip reasons that saved a paid request may occupy a cache slot", () => {
	const {store} = createHarness();

	for (const reason of ["same_language", "too_similar", "ai_skip_signal", "source_filter"]) {
		assert.equal(store.shouldPersistSkipDecision(reason), true, `${reason} genuinely saves a request`);
	}
	// These are recomputed locally for free before any request is sent.
	for (const reason of ["symbol_only", "link_only", "local_guard", "", null, undefined]) {
		assert.equal(store.shouldPersistSkipDecision(reason), false, `${reason} must not evict a paid translation`);
	}
});

test("a free skip decision writes nothing at all", () => {
	const {store, saves, pendingTimerCount} = createHarness();

	store.persistSkipDecision("m1", "sig-a", "symbol_only", "!!!");
	store.persistSkipDecision("m2", "sig-a", "link_only", "https://example.invalid");

	assert.equal(store.hasEntry("m1"), false);
	assert.equal(store.hasEntry("m2"), false);
	assert.equal(pendingTimerCount(), 0, "a refused write must not even schedule a save");
	assert.equal(saves.length, 0);
});

test("a skip decision needs an id, a signature and a reason", () => {
	const {store} = createHarness();

	store.persistSkipDecision("", "sig-a", "same_language");
	store.persistSkipDecision("m1", "", "same_language");
	store.persistSkipDecision("m2", "sig-a", "");

	assert.equal(store.getEntry("m1"), null);
	assert.equal(store.getEntry("m2"), null);
});

test("a persisted skip decision is returned with its signature, channel and preview", () => {
	const {store} = createHarness({getSkipPreviewText: text => String(text || "").slice(0, 4)});
	const message = createMessage("m1", "hello world");
	const signature = signatureFor("c1", "hello world");

	store.persistSkipDecision(message.id, signature, "same_language", "hello world");
	const decision = store.getCachedSkipDecision(message, "c1");

	assert.equal(decision.reason, "same_language");
	assert.equal(decision.preview, "hell", "the preview is shortened by the injected formatter");
	assert.equal(decision.signature, signature, "callers get the raw signature back, not the digest");
	assert.equal(decision.channelId, "c1");
	assert.equal(decision.policyVersion, RECEIVED_SKIP_CACHE_POLICY_VERSION);
});

test("a skip decision written under an older policy is discarded on read", () => {
	const {store, saves, flushSave} = createHarness();
	const message = createMessage("m1", "hello world");
	const signature = signatureFor("c1", "hello world");
	store.persistSkipDecision(message.id, signature, "same_language", "hello world");
	// Simulate an entry that survived from an install with different skip rules.
	store.getEntry(message.id).skipped.policyVersion = RECEIVED_SKIP_CACHE_POLICY_VERSION - 1;

	assert.equal(store.getCachedSkipDecision(message, "c1"), null, "an obsolete decision is not evidence about today's policy");
	assert.equal(store.hasEntry(message.id), false, "and the entry is dropped rather than left to be re-read");
	flushSave();
	assert.equal(saves.length, 1, "the removal reaches disk");
});

test("a skip decision does not answer a translation lookup and vice versa", () => {
	const {store} = createHarness();
	const skipMessage = createMessage("m1", "hello world");
	const translatedMessage = createMessage("m2", "good morning");
	store.persistSkipDecision(skipMessage.id, signatureFor("c1", "hello world"), "same_language", "hello world");
	store.persistTranslation(translatedMessage.id, signatureFor("c1", "good morning"), {translatedContent: "早上好", originalContent: "good morning"});

	assert.equal(store.getCachedTranslation(skipMessage, "c1"), null, "a skip entry has no translation to serve");
	assert.equal(store.getCachedSkipDecision(translatedMessage, "c1"), null, "a translation entry is not a skip decision");
});

test("a signature mismatch is a miss for both lookups and leaves the entry alone", () => {
	const {store, pendingTimerCount, flushSave} = createHarness();
	const message = createMessage("m1", "hello world");
	store.persistTranslation(message.id, signatureFor("c1", "hello world"), {translatedContent: "你好世界", originalContent: "hello world"});
	flushSave();

	// A different channel produces a different signature: same message, different config.
	assert.equal(store.getCachedTranslation(message, "c2"), null);
	assert.equal(store.getCachedSkipDecision(message, "c2"), null);
	assert.equal(store.hasEntry(message.id), true, "a mismatch must not throw away a paid entry");
	assert.equal(pendingTimerCount(), 0, "and must not schedule a save");
});

test("the cache is bounded at 500 entries and sheds the oldest first", () => {
	const {store, setClock} = createHarness();
	for (let index = 0; index < MAX_TRANSLATION_CACHE_ENTRIES; index++) {
		setClock(1000 + index);
		store.persistTranslation(messageId(index), `sig-${index}`, {translatedContent: `译${index}`});
	}
	assert.equal(store.hasEntry(messageId(0)), true, "nothing is evicted at exactly the limit");

	setClock(9000);
	store.persistTranslation(messageId(MAX_TRANSLATION_CACHE_ENTRIES), "sig-new", {translatedContent: "新"});

	assert.equal(store.hasEntry(messageId(0)), false, "the oldest cachedAt is the one that goes");
	assert.equal(store.hasEntry(messageId(1)), true, "only the overflow is shed");
	assert.equal(store.hasEntry(messageId(MAX_TRANSLATION_CACHE_ENTRIES)), true, "the entry just written always survives");
});

test("eviction counts skip decisions and translations in the same 500 slots", () => {
	const {store, setClock} = createHarness();
	setClock(500);
	store.persistSkipDecision(messageId(9999), "sig-old-skip", "same_language", "oldest");
	for (let index = 0; index < MAX_TRANSLATION_CACHE_ENTRIES; index++) {
		setClock(1000 + index);
		store.persistTranslation(messageId(index), `sig-${index}`, {translatedContent: `译${index}`});
	}

	assert.equal(store.hasEntry(messageId(9999)), false, "the oldest entry goes regardless of its kind");
	assert.equal(store.hasEntry(messageId(0)), true);
});

test("an entry with no cachedAt is treated as the oldest", () => {
	const {store, setClock} = createHarness();
	for (let index = 0; index < MAX_TRANSLATION_CACHE_ENTRIES; index++) {
		setClock(1000 + index);
		store.persistTranslation(messageId(index), `sig-${index}`, {translatedContent: `译${index}`});
	}
	// A corrupt or hand-edited entry from disk.
	delete store.getEntry(messageId(50)).cachedAt;

	setClock(9000);
	store.persistTranslation(messageId(MAX_TRANSLATION_CACHE_ENTRIES), "sig-new", {translatedContent: "新"});

	assert.equal(store.hasEntry(messageId(50)), false, "a missing timestamp sorts as 0");
	assert.equal(store.hasEntry(messageId(0)), true);
});

test("a burst of writes produces a single debounced save carrying the live cache", () => {
	const {store, saves, advance, pendingTimerCount} = createHarness();

	store.persistTranslation("m1", "sig-1", {translatedContent: "一"});
	store.persistTranslation("m2", "sig-2", {translatedContent: "二"});
	store.persistTranslation("m3", "sig-3", {translatedContent: "三"});
	assert.equal(pendingTimerCount(), 1, "each write replaces the pending timer");
	assert.equal(saves.length, 0, "nothing is written mid-burst");

	advance(TRANSLATION_CACHE_SAVE_DEBOUNCE_MS - 1);
	assert.equal(saves.length, 0, "the debounce window is not short-cut");

	advance(1);
	assert.equal(saves.length, 1);
	assert.deepEqual(saves[0].keys, ["m1", "m2", "m3"], "the save sees every entry from the burst");
	// The saver is handed the live cache object, not a snapshot, exactly as the legacy
	// call did; a serialiser that reads it later still sees the current contents.
	assert.equal(saves[0].value.m1, store.getEntry("m1"));
	store.persistTranslation("m4", "sig-4", {translatedContent: "四"});
	assert.equal(saves[0].value.m4, store.getEntry("m4"));
});

test("the save timer is released after it fires, so the next write schedules again", () => {
	const {store, saves, flushSave, pendingTimerCount} = createHarness();

	store.persistTranslation("m1", "sig-1", {translatedContent: "一"});
	flushSave();
	assert.equal(pendingTimerCount(), 0);

	store.persistTranslation("m2", "sig-2", {translatedContent: "二"});
	assert.equal(pendingTimerCount(), 1, "a released timer does not block the next save");
	flushSave();
	assert.equal(saves.length, 2);
});

test("cancelling a pending save abandons it rather than flushing it", () => {
	const {store, saves, advance, pendingTimerCount} = createHarness();
	store.persistTranslation("m1", "sig-1", {translatedContent: "一"});

	store.cancelPendingSave();
	advance(10000);

	assert.equal(saves.length, 0, "the plugin stopping must not write on its way out");
	assert.equal(pendingTimerCount(), 0);
	store.persistTranslation("m2", "sig-2", {translatedContent: "二"});
	advance(TRANSLATION_CACHE_SAVE_DEBOUNCE_MS);
	assert.equal(saves.length, 1, "the store still works after a cancel");
});

test("flushing a pending save writes exactly once and disarms the debounce timer", () => {
	const {store, saves, advance, pendingTimerCount} = createHarness();
	store.persistTranslation("m1", "sig-1", {translatedContent: "一"});
	store.persistTranslation("m2", "sig-2", {translatedContent: "二"});

	assert.equal(store.flushPendingSave(), true);
	assert.equal(pendingTimerCount(), 0);
	assert.equal(saves.length, 1);
	assert.deepEqual(saves[0].keys, ["m1", "m2"]);
	advance(10000);
	assert.equal(saves.length, 1, "the cancelled debounce callback cannot save again");
	assert.equal(store.flushPendingSave(), false, "there is no second pending write");
});

test("a failing stop-time cache save is contained after the timer is disarmed", () => {
	let clears = 0;
	const store = createTranslationCacheStore({
		setTimeout: () => 7,
		clearTimeout: () => {clears += 1;},
		saveCache: () => {throw new Error("disk unavailable");}
	});
	store.persistTranslation("m1", "sig-1", {translatedContent: "一"});

	assert.doesNotThrow(() => assert.equal(store.flushPendingSave(), false));
	assert.equal(clears, 1);
	assert.equal(store.flushPendingSave(), false);
});

test("plugin stop flushes the cache owner instead of reaching into or abandoning its timer", () => {
	const runtime = fs.readFileSync(path.join(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
	const stopBody = runtime.match(/onStop \(\) \{([\s\S]*?)\n\t\t\t\}/);
	assert.ok(stopBody, "onStop must remain inspectable");
	assert.match(stopBody[1], /ensureTranslationCacheStore\(\)\.flushPendingSave\(\)/);
	assert.doesNotMatch(stopBody[1], /ensureTranslationCacheStore\(\)\.cancelPendingSave\(\)/);
});

test("clearing an entry schedules a save, clearing a missing one does not", () => {
	const {store, saves, flushSave, pendingTimerCount} = createHarness();
	store.persistTranslation("m1", "sig-1", {translatedContent: "一"});
	flushSave();
	assert.equal(saves.length, 1);

	store.clear("m1");
	assert.equal(store.hasEntry("m1"), false);
	flushSave();
	assert.equal(saves.length, 2);

	store.clear("m1");
	store.clear("");
	store.clear(null);
	assert.equal(pendingTimerCount(), 0, "removing nothing must not cost a disk write");
});

test("loading adopts a persisted object and rejects anything that is not one", () => {
	let stored = {m1: {signature: "h1:x:y", cachedAt: 1, translation: {translatedContent: "一"}}};
	const {store} = createHarness({loadCache: () => stored});

	assert.equal(store.loadPersisted().m1.translation.translatedContent, "一");
	assert.equal(store.hasEntry("m1"), true);

	for (const garbage of [null, undefined, "", 0, [], ["m1"], "not-an-object"]) {
		stored = garbage;
		assert.deepEqual(store.loadPersisted(), {}, `${JSON.stringify(garbage)} must not become the cache`);
		assert.equal(store.hasEntry("m1"), false);
	}
});

test("reloading replaces what a later save writes out", () => {
	let stored = {};
	const {store, saves, flushSave} = createHarness({loadCache: () => stored});
	store.persistTranslation("m1", "sig-1", {translatedContent: "一"});

	stored = {m2: {signature: "h1:a:b", cachedAt: 5, translation: {translatedContent: "二"}}};
	store.loadPersisted();
	store.scheduleSave();
	flushSave();

	assert.deepEqual(saves[saves.length - 1].keys, ["m2"], "the save writes the cache as it is when the timer fires");
});

test("a cached translation is returned with the fresh raw signature and channel", () => {
	const {store} = createHarness();
	const message = createMessage("m1", "hello world");
	const signature = signatureFor("c1", "hello world");
	store.persistTranslation(message.id, signature, {translatedContent: "你好世界", originalContent: "hello world"});

	const hit = store.getCachedTranslation(message, "c1");

	assert.equal(hit.signature, signature);
	assert.equal(hit.channelId, "c1");
	assert.equal(hit.translatedContent, "你好世界");
	assert.equal(hit.originalContent, "hello world");
});

test("the source content passed in wins over re-extracting it from the message", () => {
	let extractions = 0;
	const {store} = createHarness({
		extractOriginalContentData: message => {
			extractions++;
			return {content: message.content || "", embeds: []};
		}
	});
	const message = createMessage("m1", "hello world");
	store.persistTranslation(message.id, signatureFor("c1", "edited text"), {translatedContent: "已编辑", originalContent: "edited text"});

	// The caller already knows the content the message really carries.
	const hit = store.getCachedTranslation(message, "c1", {content: "edited text", embeds: []});

	assert.ok(hit, "the supplied content data decides the signature");
	assert.equal(extractions, 0, "no redundant extraction when the caller supplies the data");
});

test("a cached entry that fails the current guards is dropped, not served", () => {
	for (const guard of ["too_similar", "skip_before_request", "auto_result_rejected"]) {
		const {store, saves, flushSave} = createHarness({
			isTranslationResultTooSimilar: () => guard === "too_similar",
			shouldSkipBeforeRequest: () => guard === "skip_before_request",
			shouldKeepAutoTranslatedResult: () => guard !== "auto_result_rejected"
		});
		const message = createMessage("m1", "hello world");
		store.persistTranslation(message.id, signatureFor("c1", "hello world"), {translatedContent: "你好世界", originalContent: "hello world"});
		flushSave();

		assert.equal(store.getCachedTranslation(message, "c1"), null, `${guard} must not be served from cache`);
		assert.equal(store.hasEntry(message.id), false, `${guard} must evict the stale entry`);
		flushSave();
		assert.equal(saves.length, 2, `${guard} must persist the eviction`);
	}
});

test("an unusable entry is a miss but is left in place", () => {
	const {store, pendingTimerCount, flushSave} = createHarness();
	const message = createMessage("m1", "hello world");
	// No translated text at all, and no legacy content to recover it from.
	store.persistTranslation(message.id, signatureFor("c1", "hello world"), {originalContent: "hello world"});
	flushSave();

	assert.equal(store.getCachedTranslation(message, "c1"), null);
	assert.equal(store.hasEntry(message.id), true, "current behaviour: the unusable entry keeps its slot");
	assert.equal(pendingTimerCount(), 0);
});

test("a legacy entry recovers its translated text from the displayed content block", () => {
	const {store} = createHarness({
		extractLegacyDisplayedParts: content => ({translatedContent: String(content).split("\n").pop()})
	});
	const message = createMessage("m1", "hello world");
	store.persistTranslation(message.id, signatureFor("c1", "hello world"), {content: "hello world\n你好世界", originalContent: "hello world"});

	const hit = store.getCachedTranslation(message, "c1");

	assert.equal(hit.translatedContent, "你好世界");
});

test("a blank original against real source content is a miss", () => {
	const {store, flushSave} = createHarness();
	const message = createMessage("m1", "hello world");
	store.persistTranslation(message.id, signatureFor("c1", "hello world"), {translatedContent: "你好世界", originalContent: "   "});
	flushSave();

	assert.equal(store.getCachedTranslation(message, "c1"), null, "a translation with no original would render as bare text");
	assert.equal(store.hasEntry(message.id), true);
});

test("a normalised entry is upgraded in place with a digest and a stripped inner signature", () => {
	const {store, saves, flushSave} = createHarness();
	const message = createMessage("m1", "hello world");
	const signature = signatureFor("c1", "hello world");
	// A pre-digest entry that never stored the original content.
	store.seedRawEntryForTest(message.id, signature, {translatedContent: "你好世界"});
	assert.equal(saves.length, 0, "seeding is not a write");

	const hit = store.getCachedTranslation(message, "c1");
	assert.equal(hit.originalContent, "hello world", "the live message supplies the missing original");

	const entry = store.getEntry(message.id);
	assert.equal(entry.signature, store.hashSignature(signature), "the upgrade also migrates the signature to a digest");
	assert.equal(entry.translation.signature, undefined, "the upgraded copy keeps the inner signature stripped");
	assert.equal(entry.translation.originalContent, "hello world");
	assert.equal(entry.cachedAt, 1000, "an existing timestamp is preserved so the upgrade does not reset eviction order");
	flushSave();
	assert.equal(saves.length, 1, "the upgrade reaches disk");
});

test("an upgrade fills in a missing cachedAt from the clock", () => {
	const {store, setClock} = createHarness();
	const message = createMessage("m1", "hello world");
	const signature = signatureFor("c1", "hello world");
	store.seedRawEntryForTest(message.id, signature, {translatedContent: "你好世界"});
	store.getEntry(message.id).cachedAt = 0;

	setClock(4242);
	store.getCachedTranslation(message, "c1");

	assert.equal(store.getEntry(message.id).cachedAt, 4242);
});

test("an entry that needs no repair is served without a rewrite or a save", () => {
	const {store, saves, flushSave, pendingTimerCount} = createHarness();
	const message = createMessage("m1", "hello world");
	const signature = signatureFor("c1", "hello world");
	store.persistTranslation(message.id, signature, {translatedContent: "你好世界", originalContent: "hello world"});
	flushSave();
	const entryBefore = JSON.stringify(store.getEntry(message.id));

	assert.ok(store.getCachedTranslation(message, "c1"));

	assert.equal(JSON.stringify(store.getEntry(message.id)), entryBefore, "a clean hit must not rewrite the entry");
	assert.equal(pendingTimerCount(), 0, "and must not cost a disk write on every render");
	assert.equal(saves.length, 1);
});

test("display refresh is applied to the served copy and to the upgraded entry", () => {
	const {store} = createHarness({
		refreshTranslationDisplay: translation => Object.assign({}, translation, {content: `${translation.originalContent}\n${translation.translatedContent}`})
	});
	const message = createMessage("m1", "hello world");
	store.persistTranslation(message.id, signatureFor("c1", "hello world"), {translatedContent: "你好世界", originalContent: "hello world"});

	const hit = store.getCachedTranslation(message, "c1");

	assert.equal(hit.content, "hello world\n你好世界");
	assert.equal(store.getEntry(message.id).translation.content, "hello world\n你好世界", "the recomputed display is written back");
});

test("a missing message or a missing entry is a plain miss", () => {
	const {store} = createHarness();

	assert.equal(store.getCachedTranslation(null, "c1"), null);
	assert.equal(store.getCachedSkipDecision(null, "c1"), null);
	assert.equal(store.getCachedTranslation(createMessage("nope"), "c1"), null);
	assert.equal(store.getCachedSkipDecision(createMessage("nope"), "c1"), null);
	assert.equal(store.hasEntry(""), false);
	assert.equal(store.hasEntry(null), false);
	assert.equal(store.getEntry(null), null);
	assert.equal(store.getEntry("nope"), null);
});

test("the store surface cannot be swapped out from under the runtime", () => {
	const {store} = createHarness();
	const original = store.getCachedTranslation;

	store.getCachedTranslation = () => "hijacked";

	assert.equal(Object.isFrozen(store), true);
	assert.equal(store.getCachedTranslation, original, "the frozen surface ignores the reassignment");
});
