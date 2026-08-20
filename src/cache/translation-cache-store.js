// Owns the persisted translation cache: the message-id keyed record of what a paid
// translation produced, plus the record of which messages a policy already decided not
// to translate. Before this module the cache object and its debounced save timer lived
// in the plugin factory closure, where any of the 9000 surrounding lines could rewrite
// an entry and silently invalidate a user's paid cache.
//
// Almost every rule below exists to protect that paid cache rather than to be tidy:
// the signature digest shrinks the file without invalidating what is already on disk,
// the skip whitelist keeps free decisions from evicting paid ones, and the entry bound
// keeps the file from growing without limit. Treat them as behaviour, not as knobs.
//
// The store deliberately does not know translation policy or display formatting. The
// cached-translation lookup still needs both - it re-validates an old entry against the
// current guards before handing it back - so both arrive as injected callbacks instead
// of being reimplemented here. See the note above getCachedTranslation.
//
// A store instance is per plugin instance, but its contents outlive a restart because
// they are loaded from and saved back to disk.

// The cache is a file the user carries between sessions, so it is bounded. 500 entries
// is roughly a channel's worth of scrollback and keeps the saved file small.
const MAX_TRANSLATION_CACHE_ENTRIES = 500;
// Bumped whenever the skip rules change meaning. A cached skip decision written under
// an older policy is not evidence about the current policy, so it is discarded on read
// rather than trusted.
const RECEIVED_SKIP_CACHE_POLICY_VERSION = 2;
// A burst of commits writes many entries in a row; one save at the end of the burst is
// enough and keeps the plugin off the disk during a batch translation.
const TRANSLATION_CACHE_SAVE_DEBOUNCE_MS = 300;
// Only decisions that actually saved a paid request may occupy a cache slot.
// symbol_only and link_only are recomputed locally for free before any request, so
// persisting them would evict real translations to store something free.
const PERSISTED_RECEIVED_SKIP_REASONS = Object.freeze(["same_language", "too_similar", "ai_skip_signal", "source_filter"]);
// Marks an entry whose signature is a digest. Entries written before digests existed
// carry the raw signature and have no prefix; that is how they stay matchable.
const SIGNATURE_DIGEST_PREFIX = "h1:";

function createTranslationCacheStore({
	now = Date.now,
	setTimeout,
	clearTimeout,
	// Persistence. loadCache returns whatever is on disk, including garbage.
	loadCache = () => null,
	saveCache = () => {},
	// Message shape helpers owned by the received-translation runtime.
	extractOriginalContentData = () => ({}),
	createSignature = () => "",
	normalizeStoredTranslation = translation => translation,
	extractLegacyDisplayedParts = () => ({}),
	// Policy and display seams. A cache lookup has no business deciding any of these,
	// but the lookup it replaces did, so they are injected rather than reimplemented.
	refreshTranslationDisplay = translation => translation,
	isTranslationResultTooSimilar = () => false,
	shouldSkipBeforeRequest = () => false,
	shouldKeepAutoTranslatedResult = () => true,
	getSkipPreviewText = text => text == null ? "" : String(text)
} = {}) {
	let cache = {};
	let saveTimer = null;

	// The raw signature embeds the whole request configuration, so storing it verbatim
	// made it the majority of the persisted cache file. Every use is an equality check,
	// so a compact FNV-1a digest carries the same information at a fraction of the size.
	function hashSignature(signature) {
		const text = String(signature == null ? "" : signature);
		let hash = 0x811c9dc5;
		for (let index = 0; index < text.length; index++) {
			hash ^= text.charCodeAt(index);
			hash = Math.imul(hash, 0x01000193) >>> 0;
		}
		return `${SIGNATURE_DIGEST_PREFIX}${hash.toString(36)}:${text.length.toString(36)}`;
	}

	function matchesSignature(entry, signature) {
		if (!entry || entry.signature == null) return false;
		// Entries written before digests existed keep matching on their raw value, so
		// shipping the digest did not throw away anyone's existing paid cache.
		if (String(entry.signature).indexOf(SIGNATURE_DIGEST_PREFIX) !== 0) return entry.signature == signature;
		return entry.signature == hashSignature(signature);
	}

	function scheduleSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(_ => {
			saveCache(cache);
			saveTimer = null;
		}, TRANSLATION_CACHE_SAVE_DEBOUNCE_MS);
	}

	function cancelPendingSave() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = null;
	}

	function flushPendingSave() {
		if (!saveTimer) return false;
		clearTimeout(saveTimer);
		saveTimer = null;
		try {
			saveCache(cache);
			return true;
		}
		catch (error) {
			return false;
		}
	}

	// Runs after the insert, so the entry just written is the newest and survives.
	function evictOldestBeyondLimit() {
		const cacheKeys = Object.keys(cache);
		if (cacheKeys.length <= MAX_TRANSLATION_CACHE_ENTRIES) return;
		cacheKeys
			.sort((keyA, keyB) => (cache[keyA].cachedAt || 0) - (cache[keyB].cachedAt || 0))
			.slice(0, cacheKeys.length - MAX_TRANSLATION_CACHE_ENTRIES)
			.forEach(key => delete cache[key]);
	}

	// Unconditional: the callers below have already proven the entry exists.
	function dropEntry(messageId) {
		delete cache[messageId];
		scheduleSave();
	}

	// Returns a usable translation for this message, or null. A hit is not just a
	// signature match: an entry written under older guards is re-validated against the
	// current ones and dropped if it would no longer be produced today, which is why the
	// policy and display callbacks are injected. Everything between the signature check
	// and the write-back is caller-owned logic passing through.
	function getCachedTranslation(message, channelId, originalContentData = null) {
		if (!message || !cache[message.id]) return null;
		const sourceData = originalContentData || extractOriginalContentData(message);
		const signature = createSignature(message, channelId, sourceData);
		if (!matchesSignature(cache[message.id], signature)) return null;
		if (cache[message.id].skipped) return null;
		let cachedTranslation = Object.assign({signature, channelId}, cache[message.id].translation);
		const beforeSerialized = JSON.stringify(cachedTranslation || {});
		cachedTranslation = normalizeStoredTranslation(cachedTranslation);
		if (!cachedTranslation.originalContent && sourceData && sourceData.content) cachedTranslation.originalContent = String(sourceData.content);
		if (!cachedTranslation.translatedContent && cachedTranslation.content) cachedTranslation.translatedContent = extractLegacyDisplayedParts(cachedTranslation.content).translatedContent || cachedTranslation.content;
		if (!cachedTranslation.translatedContent) return null;
		if ((sourceData && sourceData.content || "").trim() && !String(cachedTranslation.originalContent || "").trim()) return null;
		cachedTranslation = refreshTranslationDisplay(cachedTranslation);
		if (isTranslationResultTooSimilar(cachedTranslation)) {
			dropEntry(message.id);
			return null;
		}
		// Re-check old cached auto-translations against the current same-language and
		// auto-translation guards so stale rewritten target-language results do not return.
		if (shouldSkipBeforeRequest(sourceData, channelId) || !shouldKeepAutoTranslatedResult(cachedTranslation, channelId)) {
			dropEntry(message.id);
			return null;
		}
		// Upgrade legacy cache entries in-place when the live Discord message still provides
		// the original content. This prevents old cached translations from coming back as
		// plain text without the original block.
		if (JSON.stringify(cachedTranslation || {}) != beforeSerialized) {
			const upgradedTranslation = Object.assign({}, cachedTranslation);
			delete upgradedTranslation.signature;
			cache[message.id].translation = upgradedTranslation;
			cache[message.id].signature = hashSignature(signature);
			cache[message.id].cachedAt = cache[message.id].cachedAt || now();
			scheduleSave();
		}
		return cachedTranslation;
	}

	function getCachedSkipDecision(message, channelId, originalContentData = null) {
		if (!message || !cache[message.id]) return null;
		const sourceData = originalContentData || extractOriginalContentData(message);
		const signature = createSignature(message, channelId, sourceData);
		if (!matchesSignature(cache[message.id], signature)) return null;
		const skipped = cache[message.id].skipped;
		if (!skipped || !skipped.reason) return null;
		if (skipped.policyVersion !== RECEIVED_SKIP_CACHE_POLICY_VERSION) {
			dropEntry(message.id);
			return null;
		}
		return Object.assign({signature, channelId}, skipped);
	}

	function shouldPersistSkipDecision(reason) {
		return PERSISTED_RECEIVED_SKIP_REASONS.includes(reason);
	}

	function persistTranslation(messageId, signature, translation) {
		const storedTranslation = Object.assign({}, translation);
		// The signature already lives on the entry; the nested copy doubled its cost.
		delete storedTranslation.signature;
		cache[messageId] = {
			signature: hashSignature(signature),
			cachedAt: now(),
			translation: storedTranslation
		};
		evictOldestBeyondLimit();
		scheduleSave();
	}

	function persistSkipDecision(messageId, signature, reason, preview = "") {
		if (!messageId || !signature || !reason || !shouldPersistSkipDecision(reason)) return;
		cache[messageId] = {
			signature: hashSignature(signature),
			cachedAt: now(),
			skipped: {
				policyVersion: RECEIVED_SKIP_CACHE_POLICY_VERSION,
				reason,
				preview: getSkipPreviewText(preview)
			}
		};
		evictOldestBeyondLimit();
		scheduleSave();
	}

	function clear(messageId) {
		if (!messageId || !cache[messageId]) return;
		dropEntry(messageId);
	}

	// Adopts whatever is on disk. Only the container is validated: a settings reload must
	// not discard the whole cache because one entry looks odd.
	function loadPersisted() {
		const loaded = loadCache();
		cache = loaded && typeof loaded == "object" && !Array.isArray(loaded) ? loaded : {};
		return cache;
	}

	return Object.freeze({
		getCachedTranslation,
		getCachedSkipDecision,
		persistTranslation,
		persistSkipDecision,
		shouldPersistSkipDecision,
		clear,
		hasEntry(messageId) {
			return !!(messageId && cache[messageId]);
		},
		getEntry(messageId) {
			return messageId && cache[messageId] || null;
		},
		scheduleSave,
		flushPendingSave,
		// Retained for owners that intentionally abandon a pending write rather than
		// performing the clean-stop flush.
		cancelPendingSave,
		loadPersisted,
		hashSignature,
		matchesSignature,
		// Writes an entry with a raw, undigested signature, the shape a pre-digest install
		// has on disk. Only the compatibility tests need it.
		seedRawEntryForTest(messageId, signature, translation) {
			cache[messageId] = {signature, cachedAt: now(), translation: Object.assign({}, translation)};
		}
	});
}

module.exports = {
	MAX_TRANSLATION_CACHE_ENTRIES,
	RECEIVED_SKIP_CACHE_POLICY_VERSION,
	TRANSLATION_CACHE_SAVE_DEBOUNCE_MS,
	PERSISTED_RECEIVED_SKIP_REASONS,
	SIGNATURE_DIGEST_PREFIX,
	createTranslationCacheStore
};
