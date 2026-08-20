// Owns the seven persisted configuration records the legacy runtime kept as module
// level vars: the language table and its favourites, the per-engine credentials, the
// per-channel and per-guild language choices, the per-channel primary-engine
// overrides, and the per-channel translation enablement state.
//
// Two of them are dangerous to get wrong and shape the whole API:
//
// - authKeys holds the user's paid API credentials. The settings panel used to mutate
//   the record in place and then ask BDFDB to persist it, so any render callback could
//   rewrite a key. Here the only ways in are setCredential, setCredentialField and
//   setCredentialFlag, and each of them persists exactly what it wrote.
// - the enablement state is re-read from disk on every settings reload. A reload that
//   read nothing must not be mistaken for "the user turned every channel off", so
//   reload() keeps the live state and skips the repair-save when both stored payloads
//   are missing: the state it would write in that case is empty by construction and
//   could only ever erase per-channel toggles.
//
// The store owns storage and precedence, not presentation. It does not build the
// language table (that needs BDFDB and the engine catalogue), does not decide which
// engine is globally selected, and never touches BDFDB: persistence, the engine
// catalogue and the channel-to-guild lookup all arrive as injected callbacks.
//
// A store instance is per plugin instance, but its contents outlive a restart because
// they are loaded from and saved back to disk.

// Same values as the legacy languageTypes map; the OUTPUT direction is the one that
// may never resolve to "auto", because there is nothing to auto-detect on the way out.
const LANGUAGE_DIRECTIONS = Object.freeze({INPUT: "input", OUTPUT: "output"});

function isRecord(value) {
	return !!value && typeof value == "object" && !Array.isArray(value);
}

function isEmptyRecord(value) {
	return !value || !Object.keys(value).length;
}

function createEmptyChannelEnablementState(globalDefault = false) {
	return {
		globalDefault: !!globalDefault,
		channelOverrides: {}
	};
}

// Anything that is not a {globalDefault, channelOverrides} record is rejected rather
// than repaired, so the caller can tell "stored in the current shape" from "stored in
// some older shape" and run the migration instead.
function normalizeStoredChannelEnablementState(state) {
	if (!isRecord(state)) return null;
	const normalizedState = createEmptyChannelEnablementState(state.globalDefault);
	const overrides = state.channelOverrides;
	if (!isRecord(overrides)) return normalizedState;
	for (const channelId in overrides) {
		if (!channelId) continue;
		if (typeof overrides[channelId] != "boolean") continue;
		normalizedState.channelOverrides[channelId] = overrides[channelId];
	}
	return normalizedState;
}

// The oldest on-disk shape was a flat array of enabled channel ids, plus the sentinel
// "global" for the removed global toggle. The sentinel is dropped: a global mode that
// no longer exists must not come back as a channel named "global".
function migrateLegacyChannelEnablementState(stateKeys) {
	const normalizedState = createEmptyChannelEnablementState(false);
	for (const stateKey of stateKeys || []) {
		if (typeof stateKey != "string" || !stateKey || stateKey == "global") continue;
		normalizedState.channelOverrides[stateKey] = true;
	}
	return normalizedState;
}

// translationEnabledStates is the record the plugin writes today; the older
// receivedAutoTranslationEnabledStates key is still read so a profile that only ever
// had the received-auto toggle keeps its channels. The primary record wins on
// conflict, and globalDefault is forced off because the global mode was removed:
// inheriting "on" would silently enable every channel the user never opted into.
function loadChannelEnablementState(primaryStoredState, secondaryStoredState) {
	const normalizedPrimaryState = normalizeStoredChannelEnablementState(primaryStoredState) || (Array.isArray(primaryStoredState) ? migrateLegacyChannelEnablementState(primaryStoredState) : null);
	const normalizedSecondaryState = normalizeStoredChannelEnablementState(secondaryStoredState) || (Array.isArray(secondaryStoredState) ? migrateLegacyChannelEnablementState(secondaryStoredState) : null);
	return {
		globalDefault: false,
		channelOverrides: Object.assign({}, normalizedSecondaryState && normalizedSecondaryState.channelOverrides, normalizedPrimaryState && normalizedPrimaryState.channelOverrides)
	};
}

function getChannelEnablementStateValue(channelId, state) {
	const normalizedState = normalizeStoredChannelEnablementState(state) || createEmptyChannelEnablementState(false);
	if (channelId && Object.prototype.hasOwnProperty.call(normalizedState.channelOverrides, channelId)) return normalizedState.channelOverrides[channelId];
	return normalizedState.globalDefault;
}

function channelEnablementStatesEqual(leftState, rightState) {
	const normalizedLeftState = normalizeStoredChannelEnablementState(leftState) || createEmptyChannelEnablementState(false);
	const normalizedRightState = normalizeStoredChannelEnablementState(rightState) || createEmptyChannelEnablementState(false);
	if (normalizedLeftState.globalDefault != normalizedRightState.globalDefault) return false;
	const leftChannelIds = Object.keys(normalizedLeftState.channelOverrides);
	const rightChannelIds = Object.keys(normalizedRightState.channelOverrides);
	if (leftChannelIds.length != rightChannelIds.length) return false;
	for (const channelId of leftChannelIds) if (normalizedLeftState.channelOverrides[channelId] != normalizedRightState.channelOverrides[channelId]) return false;
	return true;
}

function createSettingsStore({
	// The engine catalogue. Defaults to "no engine exists" rather than "every engine
	// exists": with no catalogue injected a stored override can never resolve to an
	// engine that is not installed, which is the direction that cannot corrupt state.
	isKnownEngine = () => false,
	// The legacy table is ordered by favourite through BDFDB; the ordering is a
	// presentation concern, so it stays a hook instead of being reimplemented here.
	sortLanguages = table => table,
	// Channel to guild resolution lives in the Discord stores, and "@me" is the guild
	// id the legacy runtime uses for direct messages.
	resolveGuildId = () => null,
	// Persistence. Every loader may return anything the profile happens to hold,
	// including nothing at all.
	loadFavorites = () => [],
	persistFavorites = () => {},
	loadAuthKeys = () => ({}),
	persistAuthKeys = () => {},
	loadChannelLanguages = () => ({}),
	persistChannelLanguages = () => {},
	loadGuildLanguages = () => ({}),
	persistGuildLanguages = () => {},
	loadChannelPrimaryEngineOverrides = () => ({}),
	persistChannelPrimaryEngineOverrides = () => {},
	loadTranslationEnabledStates = () => null,
	loadReceivedAutoTranslationEnabledStates = () => null,
	// One callback because the two enablement keys are always written together; the
	// compatibility key is what lets an older build of the plugin still read the state.
	persistChannelEnablementState = () => {},
	// The global fallback lives in the plugin settings, not in this store.
	loadGlobalLanguageChoice = () => null,
	persistGlobalLanguageChoice = () => {},
	// `$discord` used to mean "follow the current client locale". It is no longer a
	// selectable output because changing the client language could silently change a
	// channel's translation target. The adapter resolves old stored values once so the
	// store can persist a normal, stable language id without knowing about BDFDB.
	resolveLegacyDiscordLanguage = () => "en"
} = {}) {
	let languages = {};
	let favorites = [];
	let authKeys = {};
	let channelLanguages = {};
	let guildLanguages = {};
	let channelPrimaryEngineOverrides = {};
	let translationEnabledStates = createEmptyChannelEnablementState(false);

	function isLegacyDiscordLanguageChoice(choice) {
		return typeof choice == "string" && choice.toLowerCase() == "$discord";
	}

	function migrateScopedDiscordOutputChoices(scopes, concreteLanguageId) {
		let changed = false;
		for (const scopeId in scopes) {
			const scope = scopes[scopeId];
			if (!isRecord(scope)) continue;
			for (const place in scope) {
				const choices = scope[place];
				if (!isRecord(choices) || !isLegacyDiscordLanguageChoice(choices[LANGUAGE_DIRECTIONS.OUTPUT])) continue;
				choices[LANGUAGE_DIRECTIONS.OUTPUT] = concreteLanguageId;
				changed = true;
			}
		}
		return changed;
	}

	function getChannelLanguageScope(channelId, place) {
		const record = channelLanguages[channelId];
		return record && record[place] || null;
	}

	function getGuildLanguageScope(guildId, place) {
		const record = guildLanguages[guildId];
		return record && record[place] || null;
	}

	// Precedence is channel, then guild, then the global plugin setting. Whatever comes
	// out is validated against the current language table, because an engine change can
	// remove a language the user had selected.
	function resolveLanguageChoice(direction, place, channelId) {
		const guildId = resolveGuildId(channelId);
		let choice;
		const channelScope = getChannelLanguageScope(channelId, place);
		const guildScope = guildId ? getGuildLanguageScope(guildId, place) : null;
		if (channelScope) choice = channelScope[direction];
		else if (guildScope) choice = guildScope[direction];
		else choice = loadGlobalLanguageChoice(place, direction);
		choice = languages[choice] ? choice : Object.keys(languages)[0];
		return direction == LANGUAGE_DIRECTIONS.OUTPUT && choice == "auto" ? "en" : choice;
	}

	// Seeds a freshly created scope from what the user would have got without it, so
	// pinning a channel or guild does not change the languages already in effect.
	function createInheritedLanguageScope(place) {
		const scope = {};
		for (const direction of Object.values(LANGUAGE_DIRECTIONS)) scope[direction] = resolveLanguageChoice(direction, place, null);
		return scope;
	}

	// Creates the channel scope if it is missing and hands it back for direct edits.
	// The seed reads back through the scope it has just created, so a new scope starts
	// on the first language in the table rather than on the inherited choice. That is
	// the legacy behaviour and callers depend on the shape, not on the seed; changing
	// it is a deliberate fix, not a refactor.
	function ensureChannelLanguageChoiceScope(channelId, place) {
		if (!channelId || !place) return null;
		if (!channelLanguages[channelId]) channelLanguages[channelId] = {};
		if (!channelLanguages[channelId][place]) {
			channelLanguages[channelId][place] = {};
			for (const direction of Object.values(LANGUAGE_DIRECTIONS)) channelLanguages[channelId][place][direction] = resolveLanguageChoice(direction, place, channelId);
		}
		return channelLanguages[channelId][place];
	}

	function normalizeStoredChannelPrimaryEngineOverrides(overrides) {
		if (!isRecord(overrides)) return {};
		const normalizedOverrides = {};
		for (const channelId in overrides) {
			const engineKey = overrides[channelId];
			if (!channelId || typeof engineKey != "string" || !isKnownEngine(engineKey)) continue;
			normalizedOverrides[channelId] = engineKey;
		}
		return normalizedOverrides;
	}

	function saveChannelEnablementState(nextState) {
		translationEnabledStates = nextState;
		persistChannelEnablementState(nextState);
		return translationEnabledStates;
	}

	return Object.freeze({
		// --- language table -------------------------------------------------------
		// The live table, not a copy: the provider client holds this seam and reads it
		// on every request to name a detected language.
		getLanguages() {
			return languages;
		},
		getLanguage(languageId) {
			return languages[languageId] || null;
		},
		hasLanguage(languageId) {
			return !!languages[languageId];
		},
		getLanguageIds() {
			return Object.keys(languages);
		},
		// The fallback target when a stored choice no longer exists.
		getFirstLanguageId() {
			return Object.keys(languages)[0];
		},
		// The single writer. The caller builds the table because that needs BDFDB and
		// the engine catalogue; the store stamps the favourite flags and orders it.
		setLanguages(builtLanguages) {
			const table = {};
			if (isRecord(builtLanguages)) for (const languageId in builtLanguages) {
				// BDFDB contributes this alias to its language table under a special key,
				// while the record itself carries the concrete locale id. Keeping the normal
				// locale entry gives users the same language without the moving target.
				if (isLegacyDiscordLanguageChoice(languageId)) continue;
				table[languageId] = builtLanguages[languageId];
			}
			for (const languageId in table) if (isRecord(table[languageId])) table[languageId].fav = favorites.includes(languageId) ? 0 : 1;
			languages = sortLanguages(table) || table;
			return languages;
		},

		// --- favourites -----------------------------------------------------------
		getFavorites() {
			return favorites;
		},
		isFavorite(languageId) {
			return favorites.includes(languageId);
		},
		// Persists immediately; the caller still has to rebuild the language table for
		// the new flags to show up in it.
		setFavorite(languageId, isFavorite) {
			if (!languageId) return favorites;
			const index = favorites.indexOf(languageId);
			if (isFavorite) {
				if (index < 0) favorites.push(languageId);
			}
			else if (index >= 0) favorites = favorites.filter(id => id != languageId);
			favorites.sort();
			persistFavorites(favorites);
			return favorites;
		},

		// --- credentials ----------------------------------------------------------
		// The live record, for the provider client seam only. Every other caller should
		// use the accessors below so the write is persisted with it.
		getAuthKeys() {
			return authKeys;
		},
		getCredential(engineKey) {
			return engineKey && authKeys[engineKey] || null;
		},
		getCredentialField(engineKey, field) {
			const credential = engineKey && authKeys[engineKey];
			return credential ? credential[field] : undefined;
		},
		// Replaces one engine's whole credential record, which is what the provider
		// client does after it normalises an endpoint or resolves a model id.
		setCredential(engineKey, credential) {
			if (!engineKey) return null;
			authKeys[engineKey] = credential;
			persistAuthKeys(authKeys);
			return authKeys[engineKey];
		},
		// Text fields: key, endpoint, model, region. The trim rule is the legacy one -
		// a value with no trim method is stored as-is - so a field that was never a
		// string keeps whatever the panel passed.
		setCredentialField(engineKey, field, value) {
			if (!engineKey || !field) return null;
			if (!authKeys[engineKey]) authKeys[engineKey] = {};
			authKeys[engineKey][field] = (value || "").trim ? (value || "").trim() : value;
			persistAuthKeys(authKeys);
			return authKeys[engineKey];
		},
		// Non-text fields, currently only the premium "paid" switch. Kept separate
		// because trimming would turn a false switch into an empty string.
		setCredentialFlag(engineKey, field, value) {
			if (!engineKey || !field) return null;
			if (!authKeys[engineKey]) authKeys[engineKey] = {};
			authKeys[engineKey][field] = value;
			persistAuthKeys(authKeys);
			return authKeys[engineKey];
		},
		// The write half of the provider client seam: it mutates the record it got from
		// getAuthKeys and then hands the whole table back here to be persisted.
		replaceAuthKeys(nextAuthKeys) {
			authKeys = isRecord(nextAuthKeys) ? nextAuthKeys : {};
			persistAuthKeys(authKeys);
			return authKeys;
		},

		// --- language choices -----------------------------------------------------
		getChannelLanguages() {
			return channelLanguages;
		},
		getGuildLanguages() {
			return guildLanguages;
		},
		hasChannelLanguageScope(channelId, place) {
			return !!getChannelLanguageScope(channelId, place);
		},
		hasGuildLanguageScope(guildId, place) {
			return !!getGuildLanguageScope(guildId, place);
		},
		getLanguageChoice(direction, place, channelId) {
			return resolveLanguageChoice(direction, place, channelId);
		},
		// Writes into the narrowest scope that already exists, so saving a choice never
		// silently promotes a global setting into a channel-specific one. Returns which
		// scope took the write.
		saveLanguageChoice(choice, direction, place, channelId) {
			const guildId = resolveGuildId(channelId);
			const channelScope = getChannelLanguageScope(channelId, place);
			if (channelScope) {
				channelScope[direction] = choice;
				persistChannelLanguages(channelLanguages);
				return "channel";
			}
			const guildScope = guildId ? getGuildLanguageScope(guildId, place) : null;
			if (guildScope) {
				guildScope[direction] = choice;
				persistGuildLanguages(guildLanguages);
				return "guild";
			}
			persistGlobalLanguageChoice(place, direction, choice);
			return "global";
		},
		ensureChannelLanguageChoiceScope,
		// Pins one direction to a channel, creating the scope when needed. Used when a
		// reply target language is detected for a channel.
		setChannelLanguageChoice(channelId, place, direction, choice) {
			if (!channelId || !place || !direction) return null;
			const scope = ensureChannelLanguageChoiceScope(channelId, place);
			if (!scope) return null;
			scope[direction] = choice;
			persistChannelLanguages(channelLanguages);
			return scope;
		},
		// The settings surface offers one control that walks the scope of a place:
		// global -> guild -> channel -> global. Each step seeds the new scope from the
		// choice that was in effect, and an emptied guild or channel record is removed
		// so the stored file does not accumulate empty objects. Returns the new scope.
		cycleLanguageChoiceScope(channelId, guildId, place) {
			if (!place) return null;
			let nextScope;
			if (getChannelLanguageScope(channelId, place)) {
				delete channelLanguages[channelId][place];
				if (isEmptyRecord(channelLanguages[channelId])) delete channelLanguages[channelId];
				nextScope = "global";
			}
			else if (getGuildLanguageScope(guildId, place)) {
				delete guildLanguages[guildId][place];
				if (isEmptyRecord(guildLanguages[guildId])) delete guildLanguages[guildId];
				if (!channelLanguages[channelId]) channelLanguages[channelId] = {};
				channelLanguages[channelId][place] = createInheritedLanguageScope(place);
				nextScope = "channel";
			}
			else {
				if (!guildLanguages[guildId]) guildLanguages[guildId] = {};
				guildLanguages[guildId][place] = createInheritedLanguageScope(place);
				nextScope = "guild";
			}
			persistChannelLanguages(channelLanguages);
			persistGuildLanguages(guildLanguages);
			return nextScope;
		},

		// --- channel primary engine overrides -------------------------------------
		normalizeStoredChannelPrimaryEngineOverrides,
		getChannelPrimaryEngineOverrides() {
			return channelPrimaryEngineOverrides;
		},
		// Only an override that still points at an installed engine counts; the caller
		// falls back to the globally selected engine when this returns null.
		getChannelPrimaryEngineOverride(channelId) {
			if (!channelId) return null;
			const engineKey = channelPrimaryEngineOverrides[channelId];
			return isKnownEngine(engineKey) ? engineKey : null;
		},
		hasChannelPrimaryEngineOverride(channelId) {
			return !!channelId && Object.prototype.hasOwnProperty.call(channelPrimaryEngineOverrides, channelId) && isKnownEngine(channelPrimaryEngineOverrides[channelId]);
		},
		listChannelPrimaryEngines() {
			return Object.values(channelPrimaryEngineOverrides);
		},
		saveChannelPrimaryEngineOverrides() {
			persistChannelPrimaryEngineOverrides(channelPrimaryEngineOverrides);
		},
		// Pinning the engine that happens to be the global one is meaningful: it stays
		// pinned when the user later changes the global engine.
		setChannelPrimaryEngine(channelId, engineKey) {
			if (!channelId || !isKnownEngine(engineKey)) return false;
			channelPrimaryEngineOverrides[channelId] = engineKey;
			persistChannelPrimaryEngineOverrides(channelPrimaryEngineOverrides);
			return true;
		},
		clearChannelPrimaryEngineOverride(channelId) {
			if (!channelId || !Object.prototype.hasOwnProperty.call(channelPrimaryEngineOverrides, channelId)) return false;
			delete channelPrimaryEngineOverrides[channelId];
			persistChannelPrimaryEngineOverrides(channelPrimaryEngineOverrides);
			return true;
		},

		// --- channel enablement ---------------------------------------------------
		createEmptyChannelEnablementState,
		normalizeStoredChannelEnablementState,
		migrateLegacyChannelEnablementState,
		loadChannelEnablementState,
		getChannelEnablementStateValue,
		channelEnablementStatesEqual,
		getChannelEnablementState() {
			return translationEnabledStates;
		},
		saveChannelEnablementState,
		isTranslationEnabled(channelId) {
			return getChannelEnablementStateValue(channelId, translationEnabledStates);
		},
		// An override equal to the global default is deleted instead of stored, so the
		// file only ever holds channels that actually differ from the default.
		setChannelEnablementStateValue(channelId, enabled) {
			const currentState = normalizeStoredChannelEnablementState(translationEnabledStates) || createEmptyChannelEnablementState(false);
			const nextState = {
				globalDefault: false,
				channelOverrides: Object.assign({}, currentState.channelOverrides)
			};
			if (!channelId) return currentState;
			if (enabled == nextState.globalDefault) delete nextState.channelOverrides[channelId];
			else nextState.channelOverrides[channelId] = !!enabled;
			saveChannelEnablementState(nextState);
			return nextState;
		},

		// --- reload ---------------------------------------------------------------
		// Re-reads everything the user can edit outside the plugin. A loader that hands
		// back something unusable keeps the value already in memory instead of blanking
		// it: an empty in-memory record would be written back to disk by the very next
		// edit, and that is how a transient read failure turns into lost configuration.
		reload() {
			const storedFavorites = loadFavorites();
			favorites = Array.isArray(storedFavorites) ? storedFavorites : favorites;
			const storedAuthKeys = loadAuthKeys();
			authKeys = isRecord(storedAuthKeys) ? storedAuthKeys : authKeys;
			const storedChannelLanguages = loadChannelLanguages();
			channelLanguages = isRecord(storedChannelLanguages) ? storedChannelLanguages : channelLanguages;
			const storedGuildLanguages = loadGuildLanguages();
			guildLanguages = isRecord(storedGuildLanguages) ? storedGuildLanguages : guildLanguages;
			const resolvedLegacyLanguage = resolveLegacyDiscordLanguage();
			const concreteLegacyLanguage = typeof resolvedLegacyLanguage == "string" && resolvedLegacyLanguage && !isLegacyDiscordLanguageChoice(resolvedLegacyLanguage) ? resolvedLegacyLanguage : "en";
			if (migrateScopedDiscordOutputChoices(channelLanguages, concreteLegacyLanguage)) persistChannelLanguages(channelLanguages);
			if (migrateScopedDiscordOutputChoices(guildLanguages, concreteLegacyLanguage)) persistGuildLanguages(guildLanguages);
			for (const place of ["received", "sent"]) if (isLegacyDiscordLanguageChoice(loadGlobalLanguageChoice(place, LANGUAGE_DIRECTIONS.OUTPUT))) persistGlobalLanguageChoice(place, LANGUAGE_DIRECTIONS.OUTPUT, concreteLegacyLanguage);
			const storedOverrides = loadChannelPrimaryEngineOverrides();
			channelPrimaryEngineOverrides = isRecord(storedOverrides) ? normalizeStoredChannelPrimaryEngineOverrides(storedOverrides) : channelPrimaryEngineOverrides;

			const storedPrimaryState = loadTranslationEnabledStates();
			const storedSecondaryState = loadReceivedAutoTranslationEnabledStates();
			// Neither key produced anything readable. The migration would return an
			// empty state, and writing that back would erase every per-channel toggle
			// the user has - so keep what is in memory and write nothing.
			if (storedPrimaryState == null && storedSecondaryState == null) return translationEnabledStates;
			const normalizedPrimaryState = normalizeStoredChannelEnablementState(storedPrimaryState);
			const normalizedSecondaryState = normalizeStoredChannelEnablementState(storedSecondaryState);
			translationEnabledStates = loadChannelEnablementState(storedPrimaryState, storedSecondaryState);
			// Rewrite both keys whenever what is on disk is not already the migrated
			// state, so the next start reads the current shape from both of them.
			if (!normalizedPrimaryState || !normalizedSecondaryState || !channelEnablementStatesEqual(normalizedPrimaryState, translationEnabledStates) || !channelEnablementStatesEqual(normalizedSecondaryState, translationEnabledStates)) saveChannelEnablementState(translationEnabledStates);
			return translationEnabledStates;
		}
	});
}

module.exports = {
	LANGUAGE_DIRECTIONS,
	createEmptyChannelEnablementState,
	normalizeStoredChannelEnablementState,
	migrateLegacyChannelEnablementState,
	loadChannelEnablementState,
	getChannelEnablementStateValue,
	channelEnablementStatesEqual,
	createSettingsStore
};
