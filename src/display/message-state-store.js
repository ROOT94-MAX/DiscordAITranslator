const MESSAGE_STATUSES = Object.freeze({
	IDLE: "idle",
	PENDING: "pending",
	TRANSLATING: "translating",
	TRANSLATED: "translated",
	SKIPPED: "skipped",
	FAILED: "failed",
	CANCELLED: "cancelled"
});

const RENDER_STATUSES = Object.freeze({
	IDLE: "idle",
	PENDING: "pending",
	CONFIRMED: "confirmed",
	UNCONFIRMED: "unconfirmed"
});

const MESSAGE_ORIGINS = Object.freeze({
	AUTOMATIC: "automatic",
	MANUAL: "manual"
});

const ALL_MESSAGE_ORIGINS = Object.freeze([MESSAGE_ORIGINS.AUTOMATIC, MESSAGE_ORIGINS.MANUAL]);

const TERMINAL_STATUSES = new Set([
	MESSAGE_STATUSES.TRANSLATED,
	MESSAGE_STATUSES.SKIPPED,
	MESSAGE_STATUSES.FAILED,
	MESSAGE_STATUSES.CANCELLED
]);
const INVALID_REQUEST_IDENTITY = Symbol("invalid-request-identity");
const EMPTY_SOURCE = Object.freeze({});

function freezeValue(value) {
	if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
	if (!value || typeof value !== "object") return value;
	return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
}

function normalizeIdentity(value) {
	return value === undefined || value === null ? "" : String(value);
}

function normalizeOptionalIdentity(value) {
	return value === undefined || value === null ? null : String(value);
}

function normalizeRequestIdentity(value) {
	if (value === undefined || value === null) return null;
	switch (typeof value) {
		case "string": return value;
		case "number":
		case "bigint":
		case "boolean": return String(value);
		default: return INVALID_REQUEST_IDENTITY;
	}
}

function hasGeneration(value) {
	return value !== undefined && value !== null && !(typeof value === "number" && Number.isNaN(value));
}

function normalizeOrigin(value) {
	return value === MESSAGE_ORIGINS.MANUAL ? MESSAGE_ORIGINS.MANUAL : MESSAGE_ORIGINS.AUTOMATIC;
}

function normalizeOrigins(value) {
	const origins = Array.isArray(value) ? value : ALL_MESSAGE_ORIGINS;
	return new Set(origins.filter(origin => ALL_MESSAGE_ORIGINS.includes(origin)));
}

function normalizeManualOptions(origin, requested, current) {
	if (origin !== MESSAGE_ORIGINS.MANUAL) return null;
	if (requested && typeof requested === "object") return Object.freeze({independentOfTextAreaSwitch: !!requested.independentOfTextAreaSwitch});
	return current || Object.freeze({independentOfTextAreaSwitch: false});
}

// The archive carries a whole message clone that the runtime re-hydrates into its own
// message type, so only the wrapper is copied. Deep freezing would rebuild every nested
// value as a plain object and destroy the non-plain ones (timestamps, library objects)
// the clone still has to survive with.
function normalizeArchive(archive) {
	if (!archive || typeof archive !== "object") return null;
	const message = archive.message;
	if (!message || typeof message !== "object") return null;
	return Object.freeze({
		message: Object.freeze({...message}),
		originalContentData: archive.originalContentData ? freezeValue(archive.originalContentData) : null
	});
}

const TRANSITIONS_BY_STATUS = Object.freeze({
	[MESSAGE_STATUSES.TRANSLATED]: "state-committed",
	[MESSAGE_STATUSES.SKIPPED]: "skipped",
	[MESSAGE_STATUSES.FAILED]: "failed",
	[MESSAGE_STATUSES.CANCELLED]: "cancelled"
});

function createBaseRecord(messageId, channelId) {
	return {
		messageId,
		channelId,
		generation: null,
		sourceSignature: "",
		source: EMPTY_SOURCE,
		archive: null,
		status: MESSAGE_STATUSES.IDLE,
		translation: null,
		restoredTranslation: null,
		restoredPreview: null,
		reason: null,
		origin: null,
		manualOptions: null,
		suppressed: false,
		preview: null,
		previewSignature: null,
		previewPending: null,
		requestIdentity: null,
		renderStatus: RENDER_STATUSES.IDLE,
		renderReason: null,
		revision: 0
	};
}

function createMessageStateStore({journal = null, onTranslationDisplayed = () => {}} = {}) {
	const records = new Map();
	const channelMessageIds = new Map();
	const channelGenerations = new Map();
	// Reply-preview eligibility is decided per channel for a BASE message id, not for the
	// referenced message the preview paints, so it cannot live on a record.
	const previewEligibility = new Map();
	// Preview translations are keyed by the referenced message, but React paints them in
	// every replying message row that quotes it. Keep that one-to-many ownership separate.
	const previewHostsByChannel = new Map();
	let revision = 0;
	let previewPendingSequence = 0;

	function recordTransition(record, transition) {
		// The one exit every display commit passes through - single, batch, and manual
		// alike - so the session counter hears about every translated record exactly
		// where it becomes displayable (2026-08-19 audit: counting at the scheduler
		// tap missed the batch door and the capsule numerator collapsed per batch).
		if (record && record.status === MESSAGE_STATUSES.TRANSLATED) onTranslationDisplayed(record.channelId, record.messageId);
		if (!journal || !record) return record;
		journal.append({channelId: record.channelId, messageId: record.messageId, revision: record.revision, transition});
		return record;
	}

	function indexRecord(record) {
		if (!record.channelId) return record;
		if (!channelMessageIds.has(record.channelId)) channelMessageIds.set(record.channelId, new Set());
		channelMessageIds.get(record.channelId).add(record.messageId);
		return record;
	}

	function update(messageId, changes, {advanceRevision = true} = {}) {
		const current = records.get(normalizeIdentity(messageId));
		if (!current) return null;
		const next = Object.freeze({...current, ...changes, revision: advanceRevision ? ++revision : current.revision});
		records.set(next.messageId, next);
		return next;
	}

	// Only the message translation lifecycle advances the revision. Archive, suppression
	// and reply-preview state are painted by other paths, and bumping the revision for
	// them would make an in-flight render transaction look stale and drop its confirmation.
	function updateProjection(messageId, changes) {
		return update(messageId, changes, {advanceRevision: false});
	}

	function ensureRecord(messageId, channelId) {
		const current = records.get(messageId);
		if (current) return channelId && !current.channelId ? indexRecord(updateProjection(messageId, {channelId})) : current;
		const record = Object.freeze({...createBaseRecord(messageId, channelId), revision: ++revision});
		records.set(messageId, record);
		return indexRecord(record);
	}

	function getCurrentRecord(input) {
		if (!input || typeof input !== "object" || !hasGeneration(input.generation)) return null;
		const messageId = normalizeIdentity(input.messageId);
		const channelId = normalizeIdentity(input.channelId);
		if (!messageId || !channelId) return null;
		const record = records.get(messageId);
		if (!record || record.channelId !== channelId || record.generation !== input.generation) return null;
		if (!channelGenerations.has(channelId) || channelGenerations.get(channelId) !== input.generation) return null;
		return record;
	}

	function getDisplayedTranslation(record) {
		return record && record.status === MESSAGE_STATUSES.TRANSLATED ? record.translation : null;
	}

	function getTerminalStatus(result) {
		return result && (result.status || MESSAGE_STATUSES.TRANSLATED);
	}

	function validatesTerminalResult(result) {
		const status = getTerminalStatus(result);
		const record = getCurrentRecord(result);
		if (!record || !TERMINAL_STATUSES.has(status)) return false;
		if (result.sourceSignature === undefined || result.sourceSignature === null || normalizeIdentity(result.sourceSignature) !== record.sourceSignature) return false;
		const requestIdentity = normalizeRequestIdentity(result.requestIdentity);
		if (requestIdentity === INVALID_REQUEST_IDENTITY) return false;
		if (record.requestIdentity !== null && requestIdentity !== record.requestIdentity) return false;
		return status !== MESSAGE_STATUSES.TRANSLATED || !!(result.translation && typeof result.translation.content === "string");
	}

	function applyResult(result) {
		const current = records.get(normalizeIdentity(result.messageId));
		const status = getTerminalStatus(result);
		const translated = status === MESSAGE_STATUSES.TRANSLATED;
		const origin = normalizeOrigin(result.origin || current && current.origin);
		const manualCommit = origin === MESSAGE_ORIGINS.MANUAL && translated;
		// The archive is the manual path's restore token; an automatic commit may never
		// mint one, and no commit may drop one that is still owed to a rendered message.
		const archive = manualCommit && normalizeArchive(result.archive) || current && current.archive || null;
		return recordTransition(update(result.messageId, {
			status,
			translation: translated ? freezeValue(result.translation) : null,
			reason: translated ? null : String(result.reason || status),
			origin,
			manualOptions: normalizeManualOptions(origin, result.manualOptions, current && current.manualOptions),
			archive,
			// A manual translation is the user overriding their own untranslate, so it lifts
			// the suppression that untranslate set.
			suppressed: manualCommit ? false : !!(current && current.suppressed),
			requestIdentity: null,
			renderStatus: RENDER_STATUSES.PENDING,
			renderReason: null
		}), TRANSITIONS_BY_STATUS[status]);
	}

	function restoreRecords(recordsToRestore, reason, origins) {
		const allowedOrigins = normalizeOrigins(origins);
		return recordsToRestore
			// A null origin is a record that never carried a translation, so restoring it
			// would invent a cancellation the user never saw.
			.filter(record => record && record.origin && allowedOrigins.has(record.origin) && record.status !== MESSAGE_STATUSES.CANCELLED)
			.map(record => recordTransition(update(record.messageId, {
				status: MESSAGE_STATUSES.CANCELLED,
				translation: null,
				// The message on screen still carries the painted translation, and the render
				// pass that restores the original needs to recognise that paint as our own
				// output - the automatic path has no source archive to anchor on. Dropping
				// the translation outright left the cancelled record unable to prove the
				// painted text was ours, so the next pass captured the translation as a new
				// source and the original was never painted back.
				restoredTranslation: record.translation ? freezeValue(record.translation) : record.restoredTranslation || null,
				reason,
				requestIdentity: null,
				renderStatus: RENDER_STATUSES.PENDING,
				renderReason: null
			}), "restored"));
	}

	function listChannel(channelId) {
		return [...channelMessageIds.get(normalizeIdentity(channelId)) || []]
			.map(messageId => records.get(messageId))
			.filter(Boolean);
	}

	function resolveChannelId(messageId, {fallbackChannelId = null, translation = null} = {}) {
		if (fallbackChannelId) return normalizeIdentity(fallbackChannelId);
		if (translation && translation.channelId) return normalizeIdentity(translation.channelId);
		const record = records.get(normalizeIdentity(messageId));
		if (!record) return null;
		const displayed = getDisplayedTranslation(record);
		if (displayed && displayed.channelId) return normalizeIdentity(displayed.channelId);
		if (record.preview && record.preview.channelId) return normalizeIdentity(record.preview.channelId);
		if (record.archive && record.archive.message && record.archive.message.channel_id) return normalizeIdentity(record.archive.message.channel_id);
		return null;
	}

	function previewChannelIdOf(record) {
		return record.preview && record.preview.channelId || record.previewPending && record.previewPending.channelId || record.channelId || null;
	}

	function clearPreviewState(messageId) {
		const record = records.get(normalizeIdentity(messageId));
		if (record) clearPreviewHostMappings(previewChannelIdOf(record), [record.messageId]);
		return updateProjection(messageId, {
			// The reply component may still hold the translated preview object until its
			// host row repaints. Retain proof of that paint so the stable-original resolver
			// can recover originalContent without exposing it as an active projection.
			restoredPreview: record && record.preview ? freezeValue(record.preview) : record && record.restoredPreview || null,
			preview: null,
			previewSignature: null,
			previewPending: null
		});
	}

	function getPreviewHostMessageIds(channelId, referencedMessageIds = null) {
		const references = previewHostsByChannel.get(normalizeIdentity(channelId));
		if (!references) return [];
		const requested = referencedMessageIds == null ? [...references.keys()] : [...new Set(referencedMessageIds.map(normalizeIdentity).filter(Boolean))];
		const hostIds = new Set();
		for (const referencedMessageId of requested) for (const hostMessageId of references.get(referencedMessageId) || []) hostIds.add(hostMessageId);
		return [...hostIds];
	}

	function clearPreviewHostMappings(channelId = null, referencedMessageIds = null) {
		if (channelId === null || channelId === undefined) return previewHostsByChannel.clear();
		const normalizedChannelId = normalizeIdentity(channelId);
		const references = previewHostsByChannel.get(normalizedChannelId);
		if (!references) return;
		if (referencedMessageIds == null) return previewHostsByChannel.delete(normalizedChannelId);
		for (const referencedMessageId of referencedMessageIds) references.delete(normalizeIdentity(referencedMessageId));
		if (!references.size) previewHostsByChannel.delete(normalizedChannelId);
	}

	function deleteRecord(record) {
		if (!record || !records.delete(record.messageId)) return false;
		const channelIds = channelMessageIds.get(record.channelId);
		if (channelIds) {
			channelIds.delete(record.messageId);
			if (!channelIds.size) channelMessageIds.delete(record.channelId);
		}
		return true;
	}

	function deleteMessage(messageId, channelId) {
		const normalizedMessageId = normalizeIdentity(messageId);
		const normalizedChannelId = normalizeIdentity(channelId);
		if (!normalizedMessageId || !normalizedChannelId) return false;
		const record = records.get(normalizedMessageId);
		if (record && record.channelId && record.channelId !== normalizedChannelId) return false;
		let deleted = false;
		const references = previewHostsByChannel.get(normalizedChannelId);
		if (references) {
			if (references.delete(normalizedMessageId)) deleted = true;
			for (const [referencedMessageId, hostMessageIds] of references) {
				if (hostMessageIds.delete(normalizedMessageId)) deleted = true;
				if (!hostMessageIds.size) references.delete(referencedMessageId);
			}
			if (!references.size) previewHostsByChannel.delete(normalizedChannelId);
		}
		const eligible = previewEligibility.get(normalizedChannelId);
		if (eligible && eligible.delete(normalizedMessageId)) {
			deleted = true;
			if (!eligible.size) previewEligibility.delete(normalizedChannelId);
		}
		if (record && deleteRecord(record)) deleted = true;
		if (!channelMessageIds.has(normalizedChannelId)) channelGenerations.delete(normalizedChannelId);
		return deleted;
	}

	return Object.freeze({
		captureSource(snapshot) {
			if (!snapshot || typeof snapshot !== "object" || !hasGeneration(snapshot.generation)) return null;
			const messageId = normalizeIdentity(snapshot.messageId);
			const channelId = normalizeIdentity(snapshot.channelId);
			if (!messageId || !channelId) return null;
			const current = records.get(messageId);
			if (current && current.channelId && current.channelId !== channelId) return null;
			if (channelGenerations.has(channelId) && channelGenerations.get(channelId) !== snapshot.generation) return null;
			const sourceSignature = normalizeIdentity(snapshot.sourceSignature);
			if (current && current.generation === snapshot.generation && current.sourceSignature === sourceSignature) return current;
			// A manual translation committed before anything captured this message carries no
			// signature, so its FIRST capture would look like a source change and silently
			// discard standing user intent. A later capture whose signature actually differs
			// is a real edit, and then the translation is stale and must go.
			const keepsManualTranslation = !!(current
				&& current.origin === MESSAGE_ORIGINS.MANUAL
				&& current.status === MESSAGE_STATUSES.TRANSLATED
				&& !current.sourceSignature);
			// A signature change can be configuration-only (for example Chinese target to
			// English target) while Discord's row still carries the old painted translation.
			// Retain proof of that displaced paint until a render restores the immutable
			// source; otherwise the next pass captures our old translation as a new source.
			const restoredTranslation = current && current.status === MESSAGE_STATUSES.TRANSLATED && current.translation
				? current.translation
				: current && current.restoredTranslation || null;
			// A changed source resets the translation lifecycle but keeps the projections that
			// carry their own validity rule: suppression is standing user intent, the archive is
			// the only way back to the original, and the preview is checked against a signature
			// hashed over different inputs than this one.
			const record = Object.freeze({
				...createBaseRecord(messageId, channelId),
				archive: current ? current.archive : null,
				suppressed: !!(current && current.suppressed),
				preview: current ? current.preview : null,
				previewSignature: current ? current.previewSignature : null,
				previewPending: current ? current.previewPending : null,
				status: keepsManualTranslation ? current.status : MESSAGE_STATUSES.IDLE,
				translation: keepsManualTranslation ? current.translation : null,
				restoredTranslation,
				origin: keepsManualTranslation ? current.origin : null,
				manualOptions: keepsManualTranslation ? current.manualOptions : null,
				generation: snapshot.generation,
				sourceSignature,
				source: freezeValue(snapshot.source || {}),
				revision: ++revision
			});
			records.set(messageId, record);
			indexRecord(record);
			if (!channelGenerations.has(channelId)) channelGenerations.set(channelId, snapshot.generation);
			return recordTransition(record, "captured");
		},
		// A referenced message can be painted in a reply header without ever passing through
		// the channel stream, so the preview path seeds its own record instead of translating
		// against no state at all.
		capturePreviewSource(snapshot) {
			if (!snapshot || typeof snapshot !== "object") return null;
			const messageId = normalizeIdentity(snapshot.messageId);
			const channelId = normalizeIdentity(snapshot.channelId);
			if (!messageId || !channelId) return null;
			const current = records.get(messageId);
			if (current && current.channelId && current.channelId !== channelId) return null;
			const generation = hasGeneration(snapshot.generation) ? snapshot.generation
				: channelGenerations.has(channelId) ? channelGenerations.get(channelId) : 1;
			if (!channelGenerations.has(channelId)) channelGenerations.set(channelId, generation);
			// Whatever the stream captured wins: a preview snapshot is assembled from the
			// reply header and knows less than the real message.
			if (current && (current.sourceSignature || current.translation || current.status !== MESSAGE_STATUSES.IDLE)) return current;
			const record = Object.freeze({
				...(current || createBaseRecord(messageId, channelId)),
				channelId,
				generation,
				sourceSignature: normalizeIdentity(snapshot.sourceSignature),
				source: freezeValue(snapshot.source || {}),
				revision: ++revision
			});
			records.set(messageId, record);
			indexRecord(record);
			return recordTransition(record, "preview-captured");
		},
		setChannelGeneration(channelId, generation) {
			const normalizedChannelId = normalizeIdentity(channelId);
			if (!normalizedChannelId || !hasGeneration(generation)) return null;
			channelGenerations.set(normalizedChannelId, generation);
			return generation;
		},
		getChannelGeneration(channelId) {
			return channelGenerations.get(normalizeIdentity(channelId));
		},
		getDisplayState(messageId) {
			return records.get(normalizeIdentity(messageId)) || null;
		},
		listChannel,
		listTranslated() {
			return [...records.values()].filter(record => getDisplayedTranslation(record));
		},
		listPreviewed() {
			return [...records.values()].filter(record => record.preview || record.previewPending);
		},
		deleteMessage,
		pruneChannel(channelId) {
			const normalizedChannelId = normalizeIdentity(channelId);
			const inFlightStatuses = new Set([MESSAGE_STATUSES.PENDING, MESSAGE_STATUSES.TRANSLATING]);
			const pruned = listChannel(normalizedChannelId).filter(record => {
				const activeManualDisplay = record.origin === MESSAGE_ORIGINS.MANUAL && record.status === MESSAGE_STATUSES.TRANSLATED;
				return !activeManualDisplay && !inFlightStatuses.has(record.status) && (record.status !== MESSAGE_STATUSES.CANCELLED || record.renderStatus === RENDER_STATUSES.CONFIRMED) && !record.archive && !record.suppressed && !record.previewPending;
			}).filter(deleteRecord);
			previewEligibility.delete(normalizedChannelId);
			clearPreviewHostMappings(normalizedChannelId);
			if (!channelMessageIds.has(normalizedChannelId)) {
				channelGenerations.delete(normalizedChannelId);
			}
			return pruned;
		},
		resolveChannelId,
		markPending(request) {
			const current = getCurrentRecord(request);
			if (!current || request.status && request.status !== MESSAGE_STATUSES.PENDING) return null;
			// Leaving TRANSLATED nulls a translation the reader can see and re-spends on the
			// provider, so a boundary reset has to say out loud that it supersedes it.
			if (current.status === MESSAGE_STATUSES.TRANSLATED && !request.supersede) return null;
			const requestIdentity = normalizeRequestIdentity(request.requestIdentity);
			if (requestIdentity === INVALID_REQUEST_IDENTITY) return null;
			const origin = normalizeOrigin(request.origin);
			return recordTransition(update(request.messageId, {
				status: MESSAGE_STATUSES.PENDING,
				translation: null,
				reason: null,
				origin,
				manualOptions: normalizeManualOptions(origin, request.manualOptions, current.manualOptions),
				requestIdentity,
				renderStatus: RENDER_STATUSES.PENDING,
				renderReason: null
			}), "pending");
		},
		markTranslating(request) {
			const current = getCurrentRecord(request);
			if (!current || request.status && request.status !== MESSAGE_STATUSES.TRANSLATING) return null;
			const nextRequestIdentity = Object.prototype.hasOwnProperty.call(request, "requestIdentity") ? normalizeRequestIdentity(request.requestIdentity) : null;
			if (nextRequestIdentity === INVALID_REQUEST_IDENTITY) return null;
			const requestIdentity = nextRequestIdentity === null ? current.requestIdentity : nextRequestIdentity;
			const origin = normalizeOrigin(request.origin || current.origin);
			return recordTransition(update(request.messageId, {
				status: MESSAGE_STATUSES.TRANSLATING,
				reason: null,
				origin,
				manualOptions: normalizeManualOptions(origin, request.manualOptions, current.manualOptions),
				requestIdentity,
				renderStatus: RENDER_STATUSES.PENDING,
				renderReason: null
			}), "translating");
		},
		commitResult(result) {
			return validatesTerminalResult(result) ? applyResult(result) : null;
		},
		commitBatch(results) {
			const channelIds = new Set(results.map(result => normalizeIdentity(result && result.channelId)));
			if (channelIds.size !== 1) return {committed: [], rejected: results.slice()};
			// A result for a message this store never captured cannot display here and must
			// not poison the batch; atomicity covers only results with a tracked record.
			const recordless = results.filter(result => !result || typeof result !== "object" || !records.has(normalizeIdentity(result.messageId)));
			const recorded = results.filter(result => !recordless.includes(result));
			const rejected = recorded.filter(result => !validatesTerminalResult(result));
			if (rejected.length) return {committed: [], rejected: rejected.concat(recordless)};
			return {committed: recorded.map(applyResult), rejected: recordless};
		},
		releasePending(request) {
			if (!request || typeof request !== "object") return null;
			const record = records.get(normalizeIdentity(request.messageId));
			if (!record) return null;
			if (request.channelId !== undefined && normalizeIdentity(request.channelId) !== record.channelId) return null;
			if (record.status !== MESSAGE_STATUSES.PENDING && record.status !== MESSAGE_STATUSES.TRANSLATING) return null;
			const requestIdentity = normalizeRequestIdentity(request.requestIdentity);
			if (requestIdentity === INVALID_REQUEST_IDENTITY || requestIdentity === null) return null;
			if (record.requestIdentity !== requestIdentity) return null;
			return recordTransition(update(record.messageId, {
				status: MESSAGE_STATUSES.IDLE,
				translation: null,
				reason: null,
				requestIdentity: null
			}), "released");
		},
		// Manual untranslate restores whatever it finds, including a manual translation the
		// user is undoing right now.
		restoreMessage(messageId, reason = "manual-untranslate", {origins = ALL_MESSAGE_ORIGINS} = {}) {
			const record = records.get(normalizeIdentity(messageId));
			return restoreRecords(record ? [record] : [], reason, origins);
		},
		// A channel disable is the broader and newer user command: it restores one clean
		// original-language view regardless of how each visible translation was requested.
		restoreChannel(channelId, reason = "channel-disabled", {origins = ALL_MESSAGE_ORIGINS} = {}) {
			return restoreRecords(listChannel(channelId), reason, origins);
		},
		restoreAll(reason = "plugin-stopped", {origins = ALL_MESSAGE_ORIGINS} = {}) {
			return restoreRecords([...records.values()], reason, origins);
		},
		// The archive is deliberately untouched: a rendered message whose props still carry
		// translated text needs it on the next render to get its original back.
		clearDisplayedTranslation(messageId, {preserveArchive = true, preserveSuppressed = false, clearPreview = false} = {}) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record) return null;
			const changes = {
				status: MESSAGE_STATUSES.IDLE,
				translation: null,
				reason: null,
				origin: null,
				manualOptions: null,
				requestIdentity: null,
				renderStatus: RENDER_STATUSES.PENDING,
				renderReason: null
			};
			if (!preserveArchive) changes.archive = null;
			if (!preserveSuppressed) changes.suppressed = false;
			if (clearPreview) {
				clearPreviewHostMappings(previewChannelIdOf(record), [record.messageId]);
				changes.preview = null;
				changes.previewSignature = null;
				changes.previewPending = null;
			}
			return recordTransition(update(messageId, changes), "display-cleared");
		},
		// The manual path has no live request to correlate and reaches messages the automatic
		// pipeline never captured (a disabled channel still translates on demand), so it commits
		// without the generation and request-identity contract commitResult enforces.
		commitManualTranslation(result) {
			if (!result || typeof result !== "object") return null;
			const messageId = normalizeIdentity(result.messageId);
			if (!messageId || !result.translation || typeof result.translation.content !== "string") return null;
			const channelId = normalizeIdentity(result.channelId);
			const current = ensureRecord(messageId, channelId);
			return recordTransition(update(messageId, {
				status: MESSAGE_STATUSES.TRANSLATED,
				translation: freezeValue(result.translation),
				reason: null,
				origin: MESSAGE_ORIGINS.MANUAL,
				manualOptions: normalizeManualOptions(MESSAGE_ORIGINS.MANUAL, result.manualOptions, current.manualOptions),
				archive: normalizeArchive(result.archive) || current.archive || null,
				suppressed: false,
				requestIdentity: null,
				renderStatus: RENDER_STATUSES.PENDING,
				renderReason: null
			}), "state-committed");
		},
		hasSourceArchive(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			return !!(record && record.archive);
		},
		peekSourceArchive(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			return record && record.archive || null;
		},
		// Spending the restore token and telling the render to stop overriding the extracted
		// original are two different decisions, so peek and consume stay separate calls.
		consumeSourceArchive(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record || !record.archive) return null;
			const archive = record.archive;
			updateProjection(record.messageId, {archive: null});
			return archive;
		},
		dropSourceArchive(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record || !record.archive) return false;
			updateProjection(record.messageId, {archive: null});
			return true;
		},
		// Suppression sits outside the status machine on purpose: it has to survive the
		// restore and the cancel that untranslate performs immediately after setting it.
		suppress(messageId, {channelId = null} = {}) {
			const id = normalizeIdentity(messageId);
			if (!id) return null;
			ensureRecord(id, normalizeIdentity(channelId));
			return recordTransition(updateProjection(id, {suppressed: true}), "suppressed");
		},
		isSuppressed(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			return !!(record && record.suppressed);
		},
		clearSuppression(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record || !record.suppressed) return null;
			return updateProjection(record.messageId, {suppressed: false});
		},
		clearAllSuppression() {
			return [...records.values()]
				.filter(record => record.suppressed)
				.map(record => updateProjection(record.messageId, {suppressed: false}));
		},
		clearChannelSuppression(channelId) {
			const normalizedChannelId = normalizeIdentity(channelId);
			if (!normalizedChannelId) return [];
			return listChannel(normalizedChannelId)
				.filter(record => record.suppressed)
				.map(record => updateProjection(record.messageId, {suppressed: false}));
		},
		commitPreviewResult(result) {
			if (!result || typeof result !== "object") return null;
			const messageId = normalizeIdentity(result.messageId);
			if (!messageId || !result.translation || typeof result.translation !== "object") return null;
			const channelId = normalizeIdentity(result.channelId);
			const record = ensureRecord(messageId, channelId);
			const preview = freezeValue({...result.translation, channelId: result.translation.channelId || channelId || record.channelId || null});
			return recordTransition(updateProjection(messageId, {
				preview,
				restoredPreview: null,
				// Never compared against sourceSignature: the preview signature is hashed over
				// content alone while the source signature includes embeds, so one field cannot
				// answer both questions.
				previewSignature: normalizeOptionalIdentity(result.signature),
				previewPending: null
			}), "preview-committed");
		},
		markPreviewPending(request) {
			if (!request || typeof request !== "object") return null;
			const messageId = normalizeIdentity(request.messageId);
			if (!messageId) return null;
			const channelId = normalizeIdentity(request.channelId);
			const record = ensureRecord(messageId, channelId);
			const token = `preview-${++previewPendingSequence}`;
			updateProjection(messageId, {
				previewPending: Object.freeze({
					token,
					channelId: channelId || record.channelId || null,
					signature: normalizeOptionalIdentity(request.signature)
				})
			});
			return token;
		},
		isPreviewPending(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			return !!(record && record.previewPending);
		},
		getPreviewPending(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			return record && record.previewPending || null;
		},
		// A superseded request must not release the pending slot its successor now owns.
		releasePreviewPending(messageId, token = null) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record || !record.previewPending) return false;
			if (token !== null && token !== undefined && record.previewPending.token !== normalizeIdentity(token)) return false;
			updateProjection(record.messageId, {previewPending: null});
			return true;
		},
		getPreviewTranslation(messageId, {signature = null} = {}) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record || !record.preview) return null;
			if (signature === null || signature === undefined) return record.preview;
			if (record.previewSignature === normalizeIdentity(signature)) return record.preview;
			updateProjection(record.messageId, {preview: null, previewSignature: null});
			return null;
		},
		// Preview first: the stable-original resolver walks candidates looking for the oldest
		// surviving original. The restored candidates remain only as proof that already-painted
		// reply props came from the plugin; neither is exposed as an active reply translation.
		getPreviewCandidates(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record) return [];
			return [record.preview, getDisplayedTranslation(record), record.restoredTranslation, record.restoredPreview].filter(Boolean);
		},
		// Message first: what the message itself displays outranks the preview-only translation
		// when the reply header decides which text to paint.
		getReplyPreviewProjection(messageId, {channelId = null} = {}) {
			const id = normalizeIdentity(messageId);
			const record = records.get(id);
			if (!record) return null;
			const displayed = getDisplayedTranslation(record);
			return Object.freeze({
				messageId: record.messageId,
				channelId: resolveChannelId(id, {fallbackChannelId: channelId}),
				translation: displayed || record.preview || null,
				fromPreview: !displayed && !!record.preview,
				origin: record.origin,
				manualOptions: record.manualOptions,
				suppressed: record.suppressed,
				revision: record.revision
			});
		},
		clearPreview(messageId) {
			const record = records.get(normalizeIdentity(messageId));
			if (!record || !record.preview && !record.previewSignature && !record.previewPending) return null;
			return clearPreviewState(record.messageId);
		},
		clearPreviews(channelId = null) {
			const normalizedChannelId = normalizeIdentity(channelId);
			const cleared = [...records.values()]
				.filter(record => record.preview || record.previewSignature || record.previewPending)
				.filter(record => !normalizedChannelId || previewChannelIdOf(record) === normalizedChannelId)
				.map(record => clearPreviewState(record.messageId));
			clearPreviewHostMappings(channelId);
			return cleared;
		},
		markPreviewHost(channelId, referencedMessageId, hostMessageId) {
			const normalizedChannelId = normalizeIdentity(channelId);
			const normalizedReferencedId = normalizeIdentity(referencedMessageId);
			const normalizedHostId = normalizeIdentity(hostMessageId);
			if (!normalizedChannelId || !normalizedReferencedId || !normalizedHostId) return false;
			if (!previewHostsByChannel.has(normalizedChannelId)) previewHostsByChannel.set(normalizedChannelId, new Map());
			const references = previewHostsByChannel.get(normalizedChannelId);
			if (!references.has(normalizedReferencedId)) references.set(normalizedReferencedId, new Set());
			references.get(normalizedReferencedId).add(normalizedHostId);
			return true;
		},
		getPreviewHostMessageIds,
		markPreviewEligible(channelId, messageId) {
			const normalizedChannelId = normalizeIdentity(channelId);
			const normalizedMessageId = normalizeIdentity(messageId);
			if (!normalizedChannelId || !normalizedMessageId) return false;
			if (!previewEligibility.has(normalizedChannelId)) previewEligibility.set(normalizedChannelId, new Set());
			previewEligibility.get(normalizedChannelId).add(normalizedMessageId);
			return true;
		},
		isPreviewEligible(channelId, messageId) {
			const eligible = previewEligibility.get(normalizeIdentity(channelId));
			return !!(eligible && eligible.has(normalizeIdentity(messageId)));
		},
		clearPreviewEligibility(channelId = null) {
			if (channelId === null || channelId === undefined) return previewEligibility.clear();
			previewEligibility.delete(normalizeIdentity(channelId));
		},
		markRenderOutcome({confirmedIds = [], missingIds = []} = {}) {
			for (const messageId of confirmedIds) {
				update(messageId, {renderStatus: RENDER_STATUSES.CONFIRMED, renderReason: null}, {advanceRevision: false});
			}
			for (const messageId of missingIds) {
				update(messageId, {renderStatus: RENDER_STATUSES.UNCONFIRMED, renderReason: "render-unconfirmed"}, {advanceRevision: false});
			}
		}
	});
}

module.exports = {MESSAGE_STATUSES, RENDER_STATUSES, MESSAGE_ORIGINS, createMessageStateStore};
