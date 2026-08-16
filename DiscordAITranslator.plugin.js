/**
 * @name DiscordAITranslator
 * @author ROOT94
 * @authorLink https://github.com/ROOT94-MAX/DiscordAITranslator
 * @version 0.3.38
 * @buildId aabf95d8c33ea019
 * @description BetterDiscord translation plugin with channel-aware automatic translation and AI providers.
 * @source https://github.com/ROOT94-MAX/DiscordAITranslator
 * @license GPL-2.0
 */
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: !0 });
var __commonJS = (cb, mod) => function() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// src/display/message-state-store.js
var require_message_state_store = __commonJS({
  "src/display/message-state-store.js"(exports2, module2) {
    var MESSAGE_STATUSES = Object.freeze({
      IDLE: "idle",
      PENDING: "pending",
      TRANSLATING: "translating",
      TRANSLATED: "translated",
      SKIPPED: "skipped",
      FAILED: "failed",
      CANCELLED: "cancelled"
    }), RENDER_STATUSES = Object.freeze({
      IDLE: "idle",
      PENDING: "pending",
      CONFIRMED: "confirmed",
      UNCONFIRMED: "unconfirmed"
    }), MESSAGE_ORIGINS = Object.freeze({
      AUTOMATIC: "automatic",
      MANUAL: "manual"
    }), ALL_MESSAGE_ORIGINS = Object.freeze([MESSAGE_ORIGINS.AUTOMATIC, MESSAGE_ORIGINS.MANUAL]), TERMINAL_STATUSES = /* @__PURE__ */ new Set([
      MESSAGE_STATUSES.TRANSLATED,
      MESSAGE_STATUSES.SKIPPED,
      MESSAGE_STATUSES.FAILED,
      MESSAGE_STATUSES.CANCELLED
    ]), INVALID_REQUEST_IDENTITY = /* @__PURE__ */ Symbol("invalid-request-identity"), EMPTY_SOURCE = Object.freeze({});
    function freezeValue(value) {
      return Array.isArray(value) ? Object.freeze(value.map(freezeValue)) : !value || typeof value != "object" ? value : Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
    }
    __name(freezeValue, "freezeValue");
    function normalizeIdentity(value) {
      return value == null ? "" : String(value);
    }
    __name(normalizeIdentity, "normalizeIdentity");
    function normalizeOptionalIdentity(value) {
      return value == null ? null : String(value);
    }
    __name(normalizeOptionalIdentity, "normalizeOptionalIdentity");
    function normalizeRequestIdentity(value) {
      if (value == null) return null;
      switch (typeof value) {
        case "string":
          return value;
        case "number":
        case "bigint":
        case "boolean":
          return String(value);
        default:
          return INVALID_REQUEST_IDENTITY;
      }
    }
    __name(normalizeRequestIdentity, "normalizeRequestIdentity");
    function hasGeneration(value) {
      return value != null && !(typeof value == "number" && Number.isNaN(value));
    }
    __name(hasGeneration, "hasGeneration");
    function normalizeOrigin(value) {
      return value === MESSAGE_ORIGINS.MANUAL ? MESSAGE_ORIGINS.MANUAL : MESSAGE_ORIGINS.AUTOMATIC;
    }
    __name(normalizeOrigin, "normalizeOrigin");
    function normalizeOrigins(value) {
      let origins = Array.isArray(value) ? value : ALL_MESSAGE_ORIGINS;
      return new Set(origins.filter((origin) => ALL_MESSAGE_ORIGINS.includes(origin)));
    }
    __name(normalizeOrigins, "normalizeOrigins");
    function normalizeManualOptions(origin, requested, current) {
      return origin !== MESSAGE_ORIGINS.MANUAL ? null : requested && typeof requested == "object" ? Object.freeze({ independentOfTextAreaSwitch: !!requested.independentOfTextAreaSwitch }) : current || Object.freeze({ independentOfTextAreaSwitch: !1 });
    }
    __name(normalizeManualOptions, "normalizeManualOptions");
    function normalizeArchive(archive) {
      if (!archive || typeof archive != "object") return null;
      let message = archive.message;
      return !message || typeof message != "object" ? null : Object.freeze({
        message: Object.freeze({ ...message }),
        originalContentData: archive.originalContentData ? freezeValue(archive.originalContentData) : null
      });
    }
    __name(normalizeArchive, "normalizeArchive");
    var TRANSITIONS_BY_STATUS = Object.freeze({
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
        suppressed: !1,
        preview: null,
        previewSignature: null,
        previewPending: null,
        requestIdentity: null,
        renderStatus: RENDER_STATUSES.IDLE,
        renderReason: null,
        revision: 0
      };
    }
    __name(createBaseRecord, "createBaseRecord");
    function createMessageStateStore({ journal = null } = {}) {
      let records = /* @__PURE__ */ new Map(), channelMessageIds = /* @__PURE__ */ new Map(), channelGenerations = /* @__PURE__ */ new Map(), previewEligibility = /* @__PURE__ */ new Map(), previewHostsByChannel = /* @__PURE__ */ new Map(), revision = 0, previewPendingSequence = 0;
      function recordTransition(record, transition) {
        return !journal || !record || journal.append({ channelId: record.channelId, messageId: record.messageId, revision: record.revision, transition }), record;
      }
      __name(recordTransition, "recordTransition");
      function indexRecord(record) {
        return record.channelId && (channelMessageIds.has(record.channelId) || channelMessageIds.set(record.channelId, /* @__PURE__ */ new Set()), channelMessageIds.get(record.channelId).add(record.messageId)), record;
      }
      __name(indexRecord, "indexRecord");
      function update(messageId, changes, { advanceRevision = !0 } = {}) {
        let current = records.get(normalizeIdentity(messageId));
        if (!current) return null;
        let next = Object.freeze({ ...current, ...changes, revision: advanceRevision ? ++revision : current.revision });
        return records.set(next.messageId, next), next;
      }
      __name(update, "update");
      function updateProjection(messageId, changes) {
        return update(messageId, changes, { advanceRevision: !1 });
      }
      __name(updateProjection, "updateProjection");
      function ensureRecord(messageId, channelId) {
        let current = records.get(messageId);
        if (current) return channelId && !current.channelId ? indexRecord(updateProjection(messageId, { channelId })) : current;
        let record = Object.freeze({ ...createBaseRecord(messageId, channelId), revision: ++revision });
        return records.set(messageId, record), indexRecord(record);
      }
      __name(ensureRecord, "ensureRecord");
      function getCurrentRecord(input) {
        if (!input || typeof input != "object" || !hasGeneration(input.generation)) return null;
        let messageId = normalizeIdentity(input.messageId), channelId = normalizeIdentity(input.channelId);
        if (!messageId || !channelId) return null;
        let record = records.get(messageId);
        return !record || record.channelId !== channelId || record.generation !== input.generation || !channelGenerations.has(channelId) || channelGenerations.get(channelId) !== input.generation ? null : record;
      }
      __name(getCurrentRecord, "getCurrentRecord");
      function getDisplayedTranslation(record) {
        return record && record.status === MESSAGE_STATUSES.TRANSLATED ? record.translation : null;
      }
      __name(getDisplayedTranslation, "getDisplayedTranslation");
      function getTerminalStatus(result) {
        return result && (result.status || MESSAGE_STATUSES.TRANSLATED);
      }
      __name(getTerminalStatus, "getTerminalStatus");
      function validatesTerminalResult(result) {
        let status = getTerminalStatus(result), record = getCurrentRecord(result);
        if (!record || !TERMINAL_STATUSES.has(status) || result.sourceSignature === void 0 || result.sourceSignature === null || normalizeIdentity(result.sourceSignature) !== record.sourceSignature) return !1;
        let requestIdentity = normalizeRequestIdentity(result.requestIdentity);
        return requestIdentity === INVALID_REQUEST_IDENTITY || record.requestIdentity !== null && requestIdentity !== record.requestIdentity ? !1 : status !== MESSAGE_STATUSES.TRANSLATED || !!(result.translation && typeof result.translation.content == "string");
      }
      __name(validatesTerminalResult, "validatesTerminalResult");
      function applyResult(result) {
        let current = records.get(normalizeIdentity(result.messageId)), status = getTerminalStatus(result), translated = status === MESSAGE_STATUSES.TRANSLATED, origin = normalizeOrigin(result.origin || current && current.origin), manualCommit = origin === MESSAGE_ORIGINS.MANUAL && translated, archive = manualCommit && normalizeArchive(result.archive) || current && current.archive || null;
        return recordTransition(update(result.messageId, {
          status,
          translation: translated ? freezeValue(result.translation) : null,
          reason: translated ? null : String(result.reason || status),
          origin,
          manualOptions: normalizeManualOptions(origin, result.manualOptions, current && current.manualOptions),
          archive,
          // A manual translation is the user overriding their own untranslate, so it lifts
          // the suppression that untranslate set.
          suppressed: manualCommit ? !1 : !!(current && current.suppressed),
          requestIdentity: null,
          renderStatus: RENDER_STATUSES.PENDING,
          renderReason: null
        }), TRANSITIONS_BY_STATUS[status]);
      }
      __name(applyResult, "applyResult");
      function restoreRecords(recordsToRestore, reason, origins) {
        let allowedOrigins = normalizeOrigins(origins);
        return recordsToRestore.filter((record) => record && record.origin && allowedOrigins.has(record.origin) && record.status !== MESSAGE_STATUSES.CANCELLED).map((record) => recordTransition(update(record.messageId, {
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
      __name(restoreRecords, "restoreRecords");
      function listChannel(channelId) {
        return [...channelMessageIds.get(normalizeIdentity(channelId)) || []].map((messageId) => records.get(messageId)).filter(Boolean);
      }
      __name(listChannel, "listChannel");
      function resolveChannelId(messageId, { fallbackChannelId = null, translation = null } = {}) {
        if (fallbackChannelId) return normalizeIdentity(fallbackChannelId);
        if (translation && translation.channelId) return normalizeIdentity(translation.channelId);
        let record = records.get(normalizeIdentity(messageId));
        if (!record) return null;
        let displayed = getDisplayedTranslation(record);
        return displayed && displayed.channelId ? normalizeIdentity(displayed.channelId) : record.preview && record.preview.channelId ? normalizeIdentity(record.preview.channelId) : record.archive && record.archive.message && record.archive.message.channel_id ? normalizeIdentity(record.archive.message.channel_id) : null;
      }
      __name(resolveChannelId, "resolveChannelId");
      function previewChannelIdOf(record) {
        return record.preview && record.preview.channelId || record.previewPending && record.previewPending.channelId || record.channelId || null;
      }
      __name(previewChannelIdOf, "previewChannelIdOf");
      function clearPreviewState(messageId) {
        let record = records.get(normalizeIdentity(messageId));
        return record && clearPreviewHostMappings(previewChannelIdOf(record), [record.messageId]), updateProjection(messageId, {
          // The reply component may still hold the translated preview object until its
          // host row repaints. Retain proof of that paint so the stable-original resolver
          // can recover originalContent without exposing it as an active projection.
          restoredPreview: record && record.preview ? freezeValue(record.preview) : record && record.restoredPreview || null,
          preview: null,
          previewSignature: null,
          previewPending: null
        });
      }
      __name(clearPreviewState, "clearPreviewState");
      function getPreviewHostMessageIds(channelId, referencedMessageIds = null) {
        let references = previewHostsByChannel.get(normalizeIdentity(channelId));
        if (!references) return [];
        let requested = referencedMessageIds == null ? [...references.keys()] : [...new Set(referencedMessageIds.map(normalizeIdentity).filter(Boolean))], hostIds = /* @__PURE__ */ new Set();
        for (let referencedMessageId of requested) for (let hostMessageId of references.get(referencedMessageId) || []) hostIds.add(hostMessageId);
        return [...hostIds];
      }
      __name(getPreviewHostMessageIds, "getPreviewHostMessageIds");
      function clearPreviewHostMappings(channelId = null, referencedMessageIds = null) {
        if (channelId == null) return previewHostsByChannel.clear();
        let normalizedChannelId = normalizeIdentity(channelId), references = previewHostsByChannel.get(normalizedChannelId);
        if (references) {
          if (referencedMessageIds == null) return previewHostsByChannel.delete(normalizedChannelId);
          for (let referencedMessageId of referencedMessageIds) references.delete(normalizeIdentity(referencedMessageId));
          references.size || previewHostsByChannel.delete(normalizedChannelId);
        }
      }
      __name(clearPreviewHostMappings, "clearPreviewHostMappings");
      function deleteRecord(record) {
        if (!record || !records.delete(record.messageId)) return !1;
        let channelIds = channelMessageIds.get(record.channelId);
        return channelIds && (channelIds.delete(record.messageId), channelIds.size || channelMessageIds.delete(record.channelId)), !0;
      }
      __name(deleteRecord, "deleteRecord");
      function deleteMessage(messageId, channelId) {
        let normalizedMessageId = normalizeIdentity(messageId), normalizedChannelId = normalizeIdentity(channelId);
        if (!normalizedMessageId || !normalizedChannelId) return !1;
        let record = records.get(normalizedMessageId);
        if (record && record.channelId && record.channelId !== normalizedChannelId) return !1;
        let deleted = !1, references = previewHostsByChannel.get(normalizedChannelId);
        if (references) {
          references.delete(normalizedMessageId) && (deleted = !0);
          for (let [referencedMessageId, hostMessageIds] of references)
            hostMessageIds.delete(normalizedMessageId) && (deleted = !0), hostMessageIds.size || references.delete(referencedMessageId);
          references.size || previewHostsByChannel.delete(normalizedChannelId);
        }
        let eligible = previewEligibility.get(normalizedChannelId);
        return eligible && eligible.delete(normalizedMessageId) && (deleted = !0, eligible.size || previewEligibility.delete(normalizedChannelId)), record && deleteRecord(record) && (deleted = !0), channelMessageIds.has(normalizedChannelId) || channelGenerations.delete(normalizedChannelId), deleted;
      }
      return __name(deleteMessage, "deleteMessage"), Object.freeze({
        captureSource(snapshot) {
          if (!snapshot || typeof snapshot != "object" || !hasGeneration(snapshot.generation)) return null;
          let messageId = normalizeIdentity(snapshot.messageId), channelId = normalizeIdentity(snapshot.channelId);
          if (!messageId || !channelId) return null;
          let current = records.get(messageId);
          if (current && current.channelId && current.channelId !== channelId || channelGenerations.has(channelId) && channelGenerations.get(channelId) !== snapshot.generation) return null;
          let sourceSignature = normalizeIdentity(snapshot.sourceSignature);
          if (current && current.generation === snapshot.generation && current.sourceSignature === sourceSignature) return current;
          let keepsManualTranslation = !!(current && current.origin === MESSAGE_ORIGINS.MANUAL && current.status === MESSAGE_STATUSES.TRANSLATED && !current.sourceSignature), record = Object.freeze({
            ...createBaseRecord(messageId, channelId),
            archive: current ? current.archive : null,
            suppressed: !!(current && current.suppressed),
            preview: current ? current.preview : null,
            previewSignature: current ? current.previewSignature : null,
            previewPending: current ? current.previewPending : null,
            status: keepsManualTranslation ? current.status : MESSAGE_STATUSES.IDLE,
            translation: keepsManualTranslation ? current.translation : null,
            origin: keepsManualTranslation ? current.origin : null,
            manualOptions: keepsManualTranslation ? current.manualOptions : null,
            generation: snapshot.generation,
            sourceSignature,
            source: freezeValue(snapshot.source || {}),
            revision: ++revision
          });
          return records.set(messageId, record), indexRecord(record), channelGenerations.has(channelId) || channelGenerations.set(channelId, snapshot.generation), recordTransition(record, "captured");
        },
        // A referenced message can be painted in a reply header without ever passing through
        // the channel stream, so the preview path seeds its own record instead of translating
        // against no state at all.
        capturePreviewSource(snapshot) {
          if (!snapshot || typeof snapshot != "object") return null;
          let messageId = normalizeIdentity(snapshot.messageId), channelId = normalizeIdentity(snapshot.channelId);
          if (!messageId || !channelId) return null;
          let current = records.get(messageId);
          if (current && current.channelId && current.channelId !== channelId) return null;
          let generation = hasGeneration(snapshot.generation) ? snapshot.generation : channelGenerations.has(channelId) ? channelGenerations.get(channelId) : 1;
          if (channelGenerations.has(channelId) || channelGenerations.set(channelId, generation), current && (current.sourceSignature || current.translation || current.status !== MESSAGE_STATUSES.IDLE)) return current;
          let record = Object.freeze({
            ...current || createBaseRecord(messageId, channelId),
            channelId,
            generation,
            sourceSignature: normalizeIdentity(snapshot.sourceSignature),
            source: freezeValue(snapshot.source || {}),
            revision: ++revision
          });
          return records.set(messageId, record), indexRecord(record), recordTransition(record, "preview-captured");
        },
        setChannelGeneration(channelId, generation) {
          let normalizedChannelId = normalizeIdentity(channelId);
          return !normalizedChannelId || !hasGeneration(generation) ? null : (channelGenerations.set(normalizedChannelId, generation), generation);
        },
        getChannelGeneration(channelId) {
          return channelGenerations.get(normalizeIdentity(channelId));
        },
        getDisplayState(messageId) {
          return records.get(normalizeIdentity(messageId)) || null;
        },
        listChannel,
        listTranslated() {
          return [...records.values()].filter((record) => getDisplayedTranslation(record));
        },
        listPreviewed() {
          return [...records.values()].filter((record) => record.preview || record.previewPending);
        },
        deleteMessage,
        pruneChannel(channelId) {
          let normalizedChannelId = normalizeIdentity(channelId), inFlightStatuses = /* @__PURE__ */ new Set([MESSAGE_STATUSES.PENDING, MESSAGE_STATUSES.TRANSLATING]), pruned = listChannel(normalizedChannelId).filter((record) => !(record.origin === MESSAGE_ORIGINS.MANUAL && record.status === MESSAGE_STATUSES.TRANSLATED) && !inFlightStatuses.has(record.status) && (record.status !== MESSAGE_STATUSES.CANCELLED || record.renderStatus === RENDER_STATUSES.CONFIRMED) && !record.archive && !record.suppressed && !record.previewPending).filter(deleteRecord);
          return previewEligibility.delete(normalizedChannelId), clearPreviewHostMappings(normalizedChannelId), channelMessageIds.has(normalizedChannelId) || channelGenerations.delete(normalizedChannelId), pruned;
        },
        resolveChannelId,
        markPending(request) {
          let current = getCurrentRecord(request);
          if (!current || request.status && request.status !== MESSAGE_STATUSES.PENDING || current.status === MESSAGE_STATUSES.TRANSLATED && !request.supersede) return null;
          let requestIdentity = normalizeRequestIdentity(request.requestIdentity);
          if (requestIdentity === INVALID_REQUEST_IDENTITY) return null;
          let origin = normalizeOrigin(request.origin);
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
          let current = getCurrentRecord(request);
          if (!current || request.status && request.status !== MESSAGE_STATUSES.TRANSLATING) return null;
          let nextRequestIdentity = Object.prototype.hasOwnProperty.call(request, "requestIdentity") ? normalizeRequestIdentity(request.requestIdentity) : null;
          if (nextRequestIdentity === INVALID_REQUEST_IDENTITY) return null;
          let requestIdentity = nextRequestIdentity === null ? current.requestIdentity : nextRequestIdentity, origin = normalizeOrigin(request.origin || current.origin);
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
          if (new Set(results.map((result) => normalizeIdentity(result && result.channelId))).size !== 1) return { committed: [], rejected: results.slice() };
          let recordless = results.filter((result) => !result || typeof result != "object" || !records.has(normalizeIdentity(result.messageId))), recorded = results.filter((result) => !recordless.includes(result)), rejected = recorded.filter((result) => !validatesTerminalResult(result));
          return rejected.length ? { committed: [], rejected: rejected.concat(recordless) } : { committed: recorded.map(applyResult), rejected: recordless };
        },
        releasePending(request) {
          if (!request || typeof request != "object") return null;
          let record = records.get(normalizeIdentity(request.messageId));
          if (!record || request.channelId !== void 0 && normalizeIdentity(request.channelId) !== record.channelId || record.status !== MESSAGE_STATUSES.PENDING && record.status !== MESSAGE_STATUSES.TRANSLATING) return null;
          let requestIdentity = normalizeRequestIdentity(request.requestIdentity);
          return requestIdentity === INVALID_REQUEST_IDENTITY || requestIdentity === null || record.requestIdentity !== requestIdentity ? null : recordTransition(update(record.messageId, {
            status: MESSAGE_STATUSES.IDLE,
            translation: null,
            reason: null,
            requestIdentity: null
          }), "released");
        },
        // Manual untranslate restores whatever it finds, including a manual translation the
        // user is undoing right now.
        restoreMessage(messageId, reason = "manual-untranslate", { origins = ALL_MESSAGE_ORIGINS } = {}) {
          let record = records.get(normalizeIdentity(messageId));
          return restoreRecords(record ? [record] : [], reason, origins);
        },
        // A channel disable is the broader and newer user command: it restores one clean
        // original-language view regardless of how each visible translation was requested.
        restoreChannel(channelId, reason = "channel-disabled", { origins = ALL_MESSAGE_ORIGINS } = {}) {
          return restoreRecords(listChannel(channelId), reason, origins);
        },
        restoreAll(reason = "plugin-stopped", { origins = ALL_MESSAGE_ORIGINS } = {}) {
          return restoreRecords([...records.values()], reason, origins);
        },
        // The archive is deliberately untouched: a rendered message whose props still carry
        // translated text needs it on the next render to get its original back.
        clearDisplayedTranslation(messageId, { preserveArchive = !0, preserveSuppressed = !1, clearPreview = !1 } = {}) {
          let record = records.get(normalizeIdentity(messageId));
          if (!record) return null;
          let changes = {
            status: MESSAGE_STATUSES.IDLE,
            translation: null,
            reason: null,
            origin: null,
            manualOptions: null,
            requestIdentity: null,
            renderStatus: RENDER_STATUSES.PENDING,
            renderReason: null
          };
          return preserveArchive || (changes.archive = null), preserveSuppressed || (changes.suppressed = !1), clearPreview && (clearPreviewHostMappings(previewChannelIdOf(record), [record.messageId]), changes.preview = null, changes.previewSignature = null, changes.previewPending = null), recordTransition(update(messageId, changes), "display-cleared");
        },
        // The manual path has no live request to correlate and reaches messages the automatic
        // pipeline never captured (a disabled channel still translates on demand), so it commits
        // without the generation and request-identity contract commitResult enforces.
        commitManualTranslation(result) {
          if (!result || typeof result != "object") return null;
          let messageId = normalizeIdentity(result.messageId);
          if (!messageId || !result.translation || typeof result.translation.content != "string") return null;
          let channelId = normalizeIdentity(result.channelId), current = ensureRecord(messageId, channelId);
          return recordTransition(update(messageId, {
            status: MESSAGE_STATUSES.TRANSLATED,
            translation: freezeValue(result.translation),
            reason: null,
            origin: MESSAGE_ORIGINS.MANUAL,
            manualOptions: normalizeManualOptions(MESSAGE_ORIGINS.MANUAL, result.manualOptions, current.manualOptions),
            archive: normalizeArchive(result.archive) || current.archive || null,
            suppressed: !1,
            requestIdentity: null,
            renderStatus: RENDER_STATUSES.PENDING,
            renderReason: null
          }), "state-committed");
        },
        hasSourceArchive(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return !!(record && record.archive);
        },
        peekSourceArchive(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return record && record.archive || null;
        },
        // Spending the restore token and telling the render to stop overriding the extracted
        // original are two different decisions, so peek and consume stay separate calls.
        consumeSourceArchive(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          if (!record || !record.archive) return null;
          let archive = record.archive;
          return updateProjection(record.messageId, { archive: null }), archive;
        },
        dropSourceArchive(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return !record || !record.archive ? !1 : (updateProjection(record.messageId, { archive: null }), !0);
        },
        // Suppression sits outside the status machine on purpose: it has to survive the
        // restore and the cancel that untranslate performs immediately after setting it.
        suppress(messageId, { channelId = null } = {}) {
          let id = normalizeIdentity(messageId);
          return id ? (ensureRecord(id, normalizeIdentity(channelId)), recordTransition(updateProjection(id, { suppressed: !0 }), "suppressed")) : null;
        },
        isSuppressed(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return !!(record && record.suppressed);
        },
        clearSuppression(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return !record || !record.suppressed ? null : updateProjection(record.messageId, { suppressed: !1 });
        },
        clearAllSuppression() {
          return [...records.values()].filter((record) => record.suppressed).map((record) => updateProjection(record.messageId, { suppressed: !1 }));
        },
        clearChannelSuppression(channelId) {
          let normalizedChannelId = normalizeIdentity(channelId);
          return normalizedChannelId ? listChannel(normalizedChannelId).filter((record) => record.suppressed).map((record) => updateProjection(record.messageId, { suppressed: !1 })) : [];
        },
        commitPreviewResult(result) {
          if (!result || typeof result != "object") return null;
          let messageId = normalizeIdentity(result.messageId);
          if (!messageId || !result.translation || typeof result.translation != "object") return null;
          let channelId = normalizeIdentity(result.channelId), record = ensureRecord(messageId, channelId), preview = freezeValue({ ...result.translation, channelId: result.translation.channelId || channelId || record.channelId || null });
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
          if (!request || typeof request != "object") return null;
          let messageId = normalizeIdentity(request.messageId);
          if (!messageId) return null;
          let channelId = normalizeIdentity(request.channelId), record = ensureRecord(messageId, channelId), token = `preview-${++previewPendingSequence}`;
          return updateProjection(messageId, {
            previewPending: Object.freeze({
              token,
              channelId: channelId || record.channelId || null,
              signature: normalizeOptionalIdentity(request.signature)
            })
          }), token;
        },
        isPreviewPending(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return !!(record && record.previewPending);
        },
        getPreviewPending(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return record && record.previewPending || null;
        },
        // A superseded request must not release the pending slot its successor now owns.
        releasePreviewPending(messageId, token = null) {
          let record = records.get(normalizeIdentity(messageId));
          return !record || !record.previewPending || token != null && record.previewPending.token !== normalizeIdentity(token) ? !1 : (updateProjection(record.messageId, { previewPending: null }), !0);
        },
        getPreviewTranslation(messageId, { signature = null } = {}) {
          let record = records.get(normalizeIdentity(messageId));
          return !record || !record.preview ? null : signature == null || record.previewSignature === normalizeIdentity(signature) ? record.preview : (updateProjection(record.messageId, { preview: null, previewSignature: null }), null);
        },
        // Preview first: the stable-original resolver walks candidates looking for the oldest
        // surviving original. The restored candidates remain only as proof that already-painted
        // reply props came from the plugin; neither is exposed as an active reply translation.
        getPreviewCandidates(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return record ? [record.preview, getDisplayedTranslation(record), record.restoredTranslation, record.restoredPreview].filter(Boolean) : [];
        },
        // Message first: what the message itself displays outranks the preview-only translation
        // when the reply header decides which text to paint.
        getReplyPreviewProjection(messageId, { channelId = null } = {}) {
          let id = normalizeIdentity(messageId), record = records.get(id);
          if (!record) return null;
          let displayed = getDisplayedTranslation(record);
          return Object.freeze({
            messageId: record.messageId,
            channelId: resolveChannelId(id, { fallbackChannelId: channelId }),
            translation: displayed || record.preview || null,
            fromPreview: !displayed && !!record.preview,
            origin: record.origin,
            manualOptions: record.manualOptions,
            suppressed: record.suppressed,
            revision: record.revision
          });
        },
        clearPreview(messageId) {
          let record = records.get(normalizeIdentity(messageId));
          return !record || !record.preview && !record.previewSignature && !record.previewPending ? null : clearPreviewState(record.messageId);
        },
        clearPreviews(channelId = null) {
          let normalizedChannelId = normalizeIdentity(channelId), cleared = [...records.values()].filter((record) => record.preview || record.previewSignature || record.previewPending).filter((record) => !normalizedChannelId || previewChannelIdOf(record) === normalizedChannelId).map((record) => clearPreviewState(record.messageId));
          return clearPreviewHostMappings(channelId), cleared;
        },
        markPreviewHost(channelId, referencedMessageId, hostMessageId) {
          let normalizedChannelId = normalizeIdentity(channelId), normalizedReferencedId = normalizeIdentity(referencedMessageId), normalizedHostId = normalizeIdentity(hostMessageId);
          if (!normalizedChannelId || !normalizedReferencedId || !normalizedHostId) return !1;
          previewHostsByChannel.has(normalizedChannelId) || previewHostsByChannel.set(normalizedChannelId, /* @__PURE__ */ new Map());
          let references = previewHostsByChannel.get(normalizedChannelId);
          return references.has(normalizedReferencedId) || references.set(normalizedReferencedId, /* @__PURE__ */ new Set()), references.get(normalizedReferencedId).add(normalizedHostId), !0;
        },
        getPreviewHostMessageIds,
        markPreviewEligible(channelId, messageId) {
          let normalizedChannelId = normalizeIdentity(channelId), normalizedMessageId = normalizeIdentity(messageId);
          return !normalizedChannelId || !normalizedMessageId ? !1 : (previewEligibility.has(normalizedChannelId) || previewEligibility.set(normalizedChannelId, /* @__PURE__ */ new Set()), previewEligibility.get(normalizedChannelId).add(normalizedMessageId), !0);
        },
        isPreviewEligible(channelId, messageId) {
          let eligible = previewEligibility.get(normalizeIdentity(channelId));
          return !!(eligible && eligible.has(normalizeIdentity(messageId)));
        },
        clearPreviewEligibility(channelId = null) {
          if (channelId == null) return previewEligibility.clear();
          previewEligibility.delete(normalizeIdentity(channelId));
        },
        markRenderOutcome({ confirmedIds = [], missingIds = [] } = {}) {
          for (let messageId of confirmedIds)
            update(messageId, { renderStatus: RENDER_STATUSES.CONFIRMED, renderReason: null }, { advanceRevision: !1 });
          for (let messageId of missingIds)
            update(messageId, { renderStatus: RENDER_STATUSES.UNCONFIRMED, renderReason: "render-unconfirmed" }, { advanceRevision: !1 });
        }
      });
    }
    __name(createMessageStateStore, "createMessageStateStore");
    module2.exports = { MESSAGE_STATUSES, RENDER_STATUSES, MESSAGE_ORIGINS, createMessageStateStore };
  }
});

// src/display/translation-display-controller.js
var require_translation_display_controller = __commonJS({
  "src/display/translation-display-controller.js"(exports2, module2) {
    function createDisplayView(state) {
      if (!state) return null;
      let translated = state.status === "translated" && !!state.translation, content = translated ? state.translation.content : state.source && state.source.content;
      return Object.freeze({
        messageId: state.messageId,
        channelId: state.channelId,
        revision: state.revision,
        status: state.status,
        content: String(content ?? ""),
        translated,
        showWatermark: translated,
        showLoading: state.status === "pending" || state.status === "translating",
        reason: state.reason,
        renderStatus: state.renderStatus,
        renderReason: state.renderReason,
        translation: state.translation,
        restoredTranslation: state.restoredTranslation || null,
        source: state.source,
        origin: state.origin,
        generation: state.generation,
        sourceSignature: state.sourceSignature,
        requestIdentity: state.requestIdentity
      });
    }
    __name(createDisplayView, "createDisplayView");
    function createEmptyOutcome(additions) {
      return {
        confirmedIds: [],
        missingIds: [],
        fallbackUsed: !1,
        ...additions
      };
    }
    __name(createEmptyOutcome, "createEmptyOutcome");
    function createTranslationDisplayController({ store, renderAdapter, journal = null }) {
      let transactionSequence = 0;
      function recordRenderTransition(view, transition) {
        !journal || !view || journal.append({ channelId: view.channelId, messageId: view.messageId, revision: view.revision, transition });
      }
      __name(recordRenderTransition, "recordRenderTransition");
      async function refreshRecords(records, { channelId = null, ownerMessageIds = [] } = {}) {
        if (!records.length && !ownerMessageIds.length) return createEmptyOutcome();
        let views = records.map((record) => createDisplayView(store.getDisplayState(record.messageId)));
        if (views.some((view) => !view)) throw new Error("A display transaction requires one view per record");
        let channelIds = new Set(views.map((view) => view.channelId));
        if (channelId != null && channelIds.add(String(channelId)), channelIds.size !== 1) throw new Error("A display transaction cannot span channels");
        let transactionChannelId = channelIds.values().next().value, requestedViews = new Map(views.map((view) => [String(view.messageId), view]));
        for (let view of views) recordRenderTransition(view, "render-requested");
        let rawOutcome = await renderAdapter.refreshMessages({
          transactionId: ++transactionSequence,
          channelId: transactionChannelId,
          messageIds: views.map((view) => view.messageId),
          ownerMessageIds,
          views
        }) || createEmptyOutcome(), staleIds = [], staleIdSet = /* @__PURE__ */ new Set();
        function filterCurrentIds(messageIds) {
          return (Array.isArray(messageIds) ? messageIds : []).filter((messageId) => {
            let requestedView = requestedViews.get(String(messageId));
            if (!requestedView) return !1;
            let current = store.getDisplayState(requestedView.messageId);
            return current && current.revision === requestedView.revision ? !0 : (staleIdSet.has(requestedView.messageId) || (staleIdSet.add(requestedView.messageId), staleIds.push(requestedView.messageId)), !1);
          });
        }
        __name(filterCurrentIds, "filterCurrentIds");
        let confirmedIds = filterCurrentIds(rawOutcome.confirmedIds), missingIds = filterCurrentIds(rawOutcome.missingIds), deferredIds = filterCurrentIds(rawOutcome.deferredIds), retryIds = filterCurrentIds(rawOutcome.retryIds);
        for (let messageId of confirmedIds) recordRenderTransition(requestedViews.get(String(messageId)), "render-confirmed");
        for (let messageId of missingIds) recordRenderTransition(requestedViews.get(String(messageId)), "render-unconfirmed");
        store.markRenderOutcome({ confirmedIds, missingIds });
        let filteredOutcome = {
          ...rawOutcome,
          confirmedIds,
          missingIds,
          fallbackUsed: rawOutcome.fallbackUsed === !0
        };
        return deferredIds.length ? filteredOutcome.deferredIds = deferredIds : delete filteredOutcome.deferredIds, retryIds.length ? filteredOutcome.retryIds = retryIds : delete filteredOutcome.retryIds, staleIds.length && (filteredOutcome.staleIds = staleIds), filteredOutcome;
      }
      return __name(refreshRecords, "refreshRecords"), Object.freeze({
        getDisplayView(messageId) {
          return createDisplayView(store.getDisplayState(messageId));
        },
        async renderMessage(messageId) {
          let record = store.getDisplayState(messageId);
          return record ? refreshRecords([record]) : createEmptyOutcome();
        },
        async renderMessages(messageIds) {
          let records = (Array.isArray(messageIds) ? messageIds : []).map((messageId) => store.getDisplayState(messageId)).filter(Boolean);
          return refreshRecords(records);
        },
        async refreshDisplayTransaction({ channelId, messageIds = [], ownerMessageIds = [] } = {}) {
          let records = [...new Set((Array.isArray(messageIds) ? messageIds : []).map(String))].map((messageId) => store.getDisplayState(messageId)).filter(Boolean);
          return refreshRecords(records, { channelId, ownerMessageIds: [...new Set((Array.isArray(ownerMessageIds) ? ownerMessageIds : []).map(String))] });
        },
        async deleteMessage(messageId, channelId, { refresh = !0 } = {}) {
          let ownerMessageIds = store.getPreviewHostMessageIds(channelId, [String(messageId)]);
          return store.deleteMessage(messageId, channelId) ? !refresh || !ownerMessageIds.length ? createEmptyOutcome({ deleted: !0 }) : refreshRecords([], { channelId, ownerMessageIds }) : !1;
        },
        async markPending(request, { refresh = !0 } = {}) {
          let record = store.markPending(request);
          return record ? refresh ? refreshRecords([record]) : createEmptyOutcome({ deferredIds: [record.messageId] }) : createEmptyOutcome({ rejectedIds: [String(request.messageId)] });
        },
        async commitMessageResult(result, { refresh = !0 } = {}) {
          let record = store.commitResult(result);
          return record ? refresh ? refreshRecords([record]) : createEmptyOutcome({ deferredIds: [record.messageId] }) : createEmptyOutcome({ rejectedIds: [String(result.messageId)] });
        },
        async commitHistoricalBatch(results) {
          if (new Set(results.map((result) => result && result.channelId != null ? String(result.channelId) : "")).size === 1) for (let result of results) {
            let current = result && store.getDisplayState(result.messageId);
            result && result.source && (!current || !current.sourceSignature) && store.captureSource({ messageId: result.messageId, channelId: result.channelId, generation: result.generation, sourceSignature: result.sourceSignature, source: result.source });
          }
          let outcome = store.commitBatch(results);
          if (!outcome.committed.length)
            return outcome.rejected.length ? createEmptyOutcome({ rejectedIds: outcome.rejected.map((result) => String(result.messageId)) }) : createEmptyOutcome();
          let refreshOutcome = await refreshRecords(outcome.committed);
          return outcome.rejected.length && (refreshOutcome.rejectedIds = outcome.rejected.map((result) => String(result.messageId))), refreshOutcome;
        },
        async commitPreviewResult(result, { refresh = !0 } = {}) {
          let record = store.commitPreviewResult(result);
          if (!record) return createEmptyOutcome({ rejectedIds: [String(result && result.messageId)] });
          if (!refresh) return createEmptyOutcome();
          let channelId = record.channelId || result.channelId, ownerMessageIds = store.getPreviewHostMessageIds(channelId, [record.messageId]);
          return refreshRecords([], { channelId, ownerMessageIds });
        },
        async restoreMessage(messageId, { refresh = !0 } = {}) {
          let records = store.restoreMessage(messageId);
          return records.length ? refresh ? refreshRecords(records) : createEmptyOutcome({ deferredIds: records.map((record) => record.messageId) }) : createEmptyOutcome();
        },
        async restoreChannel(channelId, { clearPreviews = !1, clearSuppressions = !1 } = {}) {
          let previewHostMessageIds = clearPreviews ? store.getPreviewHostMessageIds(channelId) : [], restored = store.restoreChannel(channelId);
          clearPreviews && store.clearPreviews(channelId), clearSuppressions && store.clearChannelSuppression(channelId);
          let messageIds = [...new Set(restored.map((record) => record.messageId))];
          return refreshRecords(messageIds.map((messageId) => store.getDisplayState(messageId)).filter(Boolean), { channelId, ownerMessageIds: previewHostMessageIds });
        },
        async restoreAll({ refresh = !0 } = {}) {
          let records = store.restoreAll();
          if (!refresh) return records;
          if (!records.length) return createEmptyOutcome();
          let byChannel = /* @__PURE__ */ new Map();
          for (let record of records)
            byChannel.has(record.channelId) || byChannel.set(record.channelId, []), byChannel.get(record.channelId).push(record);
          return Promise.all([...byChannel.values()].map(refreshRecords));
        }
      });
    }
    __name(createTranslationDisplayController, "createTranslationDisplayController");
    module2.exports = { createDisplayView, createTranslationDisplayController };
  }
});

// src/display/discord-render-adapter.js
var require_discord_render_adapter = __commonJS({
  "src/display/discord-render-adapter.js"(exports2, module2) {
    function createDiscordRenderAdapter({ BDFDB, document: document2, requestAnimationFrame: requestAnimationFrame2, getUserScrollIntentSequence, captureScrollState, restoreScrollState, isRuntimeActive = /* @__PURE__ */ __name(() => !0, "isRuntimeActive") }) {
      function escapeAttributeValue(value) {
        return String(value).replace(/(["\\])/g, "\\$1");
      }
      __name(escapeAttributeValue, "escapeAttributeValue");
      let MESSAGE_ROOT_SELECTOR = '[id^="chat-messages-"], [data-list-item-id*="chat-messages"]';
      function getElementAttribute(element, name) {
        if (element.getAttribute)
          try {
            let value = element.getAttribute(name);
            if (value != null) return String(value);
          } catch {
          }
        return element[name] != null ? String(element[name]) : null;
      }
      __name(getElementAttribute, "getElementAttribute");
      function isSupportedMessageRoot(element) {
        if (!element) return !1;
        if (typeof element.id == "string" && element.id.startsWith("chat-messages-")) return !0;
        let listId = getElementAttribute(element, "data-list-item-id");
        if (typeof listId == "string" && listId.includes("chat-messages")) return !0;
        if (typeof element.closest == "function")
          try {
            if (element.closest(MESSAGE_ROOT_SELECTOR)) return !0;
          } catch {
          }
        return !1;
      }
      __name(isSupportedMessageRoot, "isSupportedMessageRoot");
      function elementRepresentsMessageId(element, messageId) {
        let target = String(messageId), values = [
          getElementAttribute(element, "data-list-item-id"),
          getElementAttribute(element, "aria-labelledby"),
          typeof element.id == "string" ? element.id : null
        ].filter(Boolean);
        for (let rawValue of values) {
          let value = String(rawValue), index = value.indexOf(target);
          for (; index !== -1; ) {
            let before = index > 0 ? value.charAt(index - 1) : "";
            if (!before || /[^0-9A-Za-z]/.test(before)) return !0;
            index = value.indexOf(target, index + 1);
          }
        }
        return !1;
      }
      __name(elementRepresentsMessageId, "elementRepresentsMessageId");
      function querySelectorCandidates(selector) {
        if (typeof document2.querySelectorAll == "function")
          try {
            return Array.from(document2.querySelectorAll(selector));
          } catch {
            return [];
          }
        try {
          let element = document2.querySelector(selector);
          return element ? [element] : [];
        } catch {
          return [];
        }
      }
      __name(querySelectorCandidates, "querySelectorCandidates");
      function findMessageElement(messageId) {
        let escapedId = escapeAttributeValue(messageId), selectors = [
          `[id="chat-messages-${escapedId}"]`,
          `[id$="-${escapedId}"]`,
          `[data-list-item-id$="-${escapedId}"]`,
          `[data-list-item-id*="${escapedId}"]`,
          `[aria-labelledby*="${escapedId}"]`
        ];
        for (let selector of selectors)
          for (let element of querySelectorCandidates(selector))
            if (isSupportedMessageRoot(element) && elementRepresentsMessageId(element, messageId)) return element;
        return null;
      }
      __name(findMessageElement, "findMessageElement");
      function waitForPaint() {
        return new Promise((resolve) => requestAnimationFrame2(() => requestAnimationFrame2(resolve)));
      }
      __name(waitForPaint, "waitForPaint");
      function getUniqueMessageIds(messageIds) {
        let seen = /* @__PURE__ */ new Set();
        return messageIds.filter((messageId) => {
          let key = String(messageId);
          return seen.has(key) ? !1 : (seen.add(key), !0);
        });
      }
      __name(getUniqueMessageIds, "getUniqueMessageIds");
      function getViewsByMessageId(views) {
        let viewsByMessageId = /* @__PURE__ */ new Map();
        for (let view of views) {
          if (!view) continue;
          let key = String(view.messageId);
          if (!viewsByMessageId.has(key)) {
            viewsByMessageId.set(key, view);
            continue;
          }
          let existingView = viewsByMessageId.get(key);
          (!existingView || String(existingView.revision) !== String(view.revision)) && viewsByMessageId.set(key, null);
        }
        return viewsByMessageId;
      }
      __name(getViewsByMessageId, "getViewsByMessageId");
      function confirmViews(messageIds, viewsByMessageId) {
        return messageIds.filter((messageId) => {
          let view = viewsByMessageId.get(String(messageId)), element = view && findMessageElement(messageId);
          if (!element || typeof element.querySelector != "function") return !1;
          try {
            return !!element.querySelector(`[data-translator-revision="${escapeAttributeValue(view.revision)}"]`);
          } catch {
            return !1;
          }
        });
      }
      return __name(confirmViews, "confirmViews"), {
        async refreshMessages({ messageIds = [], ownerMessageIds = [], views = [] }) {
          let uniqueMessageIds = getUniqueMessageIds(messageIds), viewsByMessageId = getViewsByMessageId(views), presentIds = uniqueMessageIds.filter((messageId) => !!findMessageElement(messageId)), deferredIds = uniqueMessageIds.filter((messageId) => !presentIds.includes(messageId)), confirmedIds = confirmViews(presentIds, viewsByMessageId), unconfirmedIds = presentIds.filter((messageId) => !confirmedIds.includes(messageId)), hostNeedsPaint = getUniqueMessageIds(ownerMessageIds).some((messageId) => !!findMessageElement(messageId));
          if (!(unconfirmedIds.length > 0 || hostNeedsPaint)) return { confirmedIds, missingIds: [], deferredIds, retryIds: [], fallbackUsed: !1 };
          if (!isRuntimeActive()) return { confirmedIds, missingIds: [], deferredIds: deferredIds.concat(unconfirmedIds), retryIds: [], fallbackUsed: !1 };
          let intentSequence = getUserScrollIntentSequence(), scrollState = document2.querySelector(BDFDB.dotCN.messagesscroller) ? captureScrollState() : null, renderError, hasRenderError = !1;
          try {
            BDFDB.MessageUtils.rerenderAll(!0), await waitForPaint(), confirmedIds = confirmViews(presentIds, viewsByMessageId), unconfirmedIds = presentIds.filter((messageId) => !confirmedIds.includes(messageId)), unconfirmedIds.length && (await waitForPaint(), confirmedIds = confirmViews(presentIds, viewsByMessageId), unconfirmedIds = presentIds.filter((messageId) => !confirmedIds.includes(messageId)));
          } catch (err) {
            renderError = err, hasRenderError = !0;
          } finally {
            try {
              isRuntimeActive() && scrollState && intentSequence === getUserScrollIntentSequence() && restoreScrollState(scrollState);
            } catch (err) {
              hasRenderError || (renderError = err, hasRenderError = !0);
            }
          }
          if (hasRenderError) throw renderError;
          return isRuntimeActive() ? {
            confirmedIds,
            missingIds: unconfirmedIds,
            deferredIds,
            retryIds: unconfirmedIds.slice(),
            fallbackUsed: !1
          } : { confirmedIds, missingIds: [], deferredIds: deferredIds.concat(unconfirmedIds), retryIds: [], fallbackUsed: !1 };
        }
      };
    }
    __name(createDiscordRenderAdapter, "createDiscordRenderAdapter");
    module2.exports = { createDiscordRenderAdapter };
  }
});

// src/display/display-runtime.js
var require_display_runtime = __commonJS({
  "src/display/display-runtime.js"(exports2, module2) {
    var { createMessageStateStore } = require_message_state_store(), { createTranslationDisplayController } = require_translation_display_controller(), { createDiscordRenderAdapter } = require_discord_render_adapter();
    function createDisplayRuntime(dependencies) {
      let store = createMessageStateStore({ journal: null }), renderAdapter = createDiscordRenderAdapter(dependencies), controller = createTranslationDisplayController({ store, renderAdapter, journal: null });
      return Object.freeze({
        getTransitionJournal: /* @__PURE__ */ __name(() => null, "getTransitionJournal"),
        captureSource: /* @__PURE__ */ __name((snapshot) => store.captureSource(snapshot), "captureSource"),
        setChannelGeneration: /* @__PURE__ */ __name((channelId, generation) => store.setChannelGeneration(channelId, generation), "setChannelGeneration"),
        getChannelGeneration: /* @__PURE__ */ __name((channelId) => store.getChannelGeneration(channelId), "getChannelGeneration"),
        getDisplayView: /* @__PURE__ */ __name((messageId) => controller.getDisplayView(messageId), "getDisplayView"),
        markPending: /* @__PURE__ */ __name((request, options) => controller.markPending(request, options), "markPending"),
        releasePending: /* @__PURE__ */ __name((request) => store.releasePending(request), "releasePending"),
        commitMessageResult: /* @__PURE__ */ __name((result, options) => controller.commitMessageResult(result, options), "commitMessageResult"),
        commitHistoricalBatch: /* @__PURE__ */ __name((results) => controller.commitHistoricalBatch(results), "commitHistoricalBatch"),
        renderMessages: /* @__PURE__ */ __name((messageIds) => controller.renderMessages(messageIds), "renderMessages"),
        refreshDisplayTransaction: /* @__PURE__ */ __name((request) => controller.refreshDisplayTransaction(request), "refreshDisplayTransaction"),
        deleteMessage: /* @__PURE__ */ __name((messageId, channelId, options) => controller.deleteMessage(messageId, channelId, options), "deleteMessage"),
        restoreMessage: /* @__PURE__ */ __name((messageId, options) => controller.restoreMessage(messageId, options), "restoreMessage"),
        restoreChannel: /* @__PURE__ */ __name((channelId, options) => controller.restoreChannel(channelId, options), "restoreChannel"),
        restoreAll: /* @__PURE__ */ __name((options) => controller.restoreAll(options), "restoreAll"),
        // The surface the legacy display maps are being retired onto. These are plain
        // store passthroughs rather than controller operations because none of them
        // paints anything - they are state the render paths read on their next pass.
        getDisplayState: /* @__PURE__ */ __name((messageId) => store.getDisplayState(messageId), "getDisplayState"),
        commitManualTranslation: /* @__PURE__ */ __name((request) => store.commitManualTranslation(request), "commitManualTranslation"),
        clearDisplayedTranslation: /* @__PURE__ */ __name((messageId, options) => store.clearDisplayedTranslation(messageId, options), "clearDisplayedTranslation"),
        consumeSourceArchive: /* @__PURE__ */ __name((messageId) => store.consumeSourceArchive(messageId), "consumeSourceArchive"),
        peekSourceArchive: /* @__PURE__ */ __name((messageId) => store.peekSourceArchive(messageId), "peekSourceArchive"),
        dropSourceArchive: /* @__PURE__ */ __name((messageId) => store.dropSourceArchive(messageId), "dropSourceArchive"),
        hasSourceArchive: /* @__PURE__ */ __name((messageId) => store.hasSourceArchive(messageId), "hasSourceArchive"),
        suppress: /* @__PURE__ */ __name((messageId) => store.suppress(messageId), "suppress"),
        isSuppressed: /* @__PURE__ */ __name((messageId) => store.isSuppressed(messageId), "isSuppressed"),
        clearSuppression: /* @__PURE__ */ __name((messageId) => store.clearSuppression(messageId), "clearSuppression"),
        clearAllSuppression: /* @__PURE__ */ __name(() => store.clearAllSuppression(), "clearAllSuppression"),
        resolveChannelId: /* @__PURE__ */ __name((messageId, options) => store.resolveChannelId(messageId, options), "resolveChannelId"),
        listTranslated: /* @__PURE__ */ __name(() => store.listTranslated(), "listTranslated"),
        pruneChannel: /* @__PURE__ */ __name((channelId) => store.pruneChannel(channelId), "pruneChannel"),
        capturePreviewSource: /* @__PURE__ */ __name((snapshot) => store.capturePreviewSource(snapshot), "capturePreviewSource"),
        commitPreviewResult: /* @__PURE__ */ __name((result, options) => controller.commitPreviewResult(result, options), "commitPreviewResult"),
        markPreviewPending: /* @__PURE__ */ __name((request) => store.markPreviewPending(request), "markPreviewPending"),
        isPreviewPending: /* @__PURE__ */ __name((messageId) => store.isPreviewPending(messageId), "isPreviewPending"),
        getPreviewPending: /* @__PURE__ */ __name((messageId) => store.getPreviewPending(messageId), "getPreviewPending"),
        // Two arguments, not one: markPreviewPending hands back a token string, and the
        // store keys the release on the message id with the token as the guard against a
        // superseded request releasing its successor's slot.
        releasePreviewPending: /* @__PURE__ */ __name((messageId, token) => store.releasePreviewPending(messageId, token), "releasePreviewPending"),
        getPreviewTranslation: /* @__PURE__ */ __name((messageId, options) => store.getPreviewTranslation(messageId, options), "getPreviewTranslation"),
        getPreviewCandidates: /* @__PURE__ */ __name((messageId) => store.getPreviewCandidates(messageId), "getPreviewCandidates"),
        getReplyPreviewProjection: /* @__PURE__ */ __name((messageId, options) => store.getReplyPreviewProjection(messageId, options), "getReplyPreviewProjection"),
        clearPreview: /* @__PURE__ */ __name((messageId) => store.clearPreview(messageId), "clearPreview"),
        clearPreviews: /* @__PURE__ */ __name((channelId) => store.clearPreviews(channelId), "clearPreviews"),
        listPreviewed: /* @__PURE__ */ __name(() => store.listPreviewed(), "listPreviewed"),
        markPreviewHost: /* @__PURE__ */ __name((channelId, referencedMessageId, hostMessageId) => store.markPreviewHost(channelId, referencedMessageId, hostMessageId), "markPreviewHost"),
        getPreviewHostMessageIds: /* @__PURE__ */ __name((channelId, referencedMessageIds) => store.getPreviewHostMessageIds(channelId, referencedMessageIds), "getPreviewHostMessageIds"),
        markPreviewEligible: /* @__PURE__ */ __name((channelId, messageId) => store.markPreviewEligible(channelId, messageId), "markPreviewEligible"),
        isPreviewEligible: /* @__PURE__ */ __name((channelId, messageId) => store.isPreviewEligible(channelId, messageId), "isPreviewEligible"),
        clearPreviewEligibility: /* @__PURE__ */ __name((channelId) => store.clearPreviewEligibility(channelId), "clearPreviewEligibility")
      });
    }
    __name(createDisplayRuntime, "createDisplayRuntime");
    module2.exports = { createDisplayRuntime };
  }
});

// src/display/translation-display-logic.js
var require_translation_display_logic = __commonJS({
  "src/display/translation-display-logic.js"(exports2, module2) {
    var MESSAGE_DIRECTIONS = Object.freeze({ RECEIVED: "received", SENT: "sent" });
    function hasOwn(object, key) {
      return !!object && Object.prototype.hasOwnProperty.call(object, key);
    }
    __name(hasOwn, "hasOwn");
    function normalizeEmbedText(plugin, value) {
      return plugin && typeof plugin.normalizeExtractedMessageText == "function" ? plugin.normalizeExtractedMessageText(value ?? "") : value == null ? "" : String(value);
    }
    __name(normalizeEmbedText, "normalizeEmbedText");
    function readVisibleEmbedText(plugin, object, rawKey, plainKey) {
      return object ? normalizeEmbedText(plugin, hasOwn(object, rawKey) ? object[rawKey] : object[plainKey]) : "";
    }
    __name(readVisibleEmbedText, "readVisibleEmbedText");
    function projectVisibleEmbed(plugin, embed) {
      return {
        title: readVisibleEmbedText(plugin, embed, "rawTitle", "title"),
        description: readVisibleEmbedText(plugin, embed, "rawDescription", "description"),
        footerText: normalizeEmbedText(plugin, embed && embed.footer && embed.footer.text),
        fields: (embed && embed.fields || []).map((field) => ({
          name: readVisibleEmbedText(plugin, field, "rawName", "name"),
          value: readVisibleEmbedText(plugin, field, "rawValue", "value")
        }))
      };
    }
    __name(projectVisibleEmbed, "projectVisibleEmbed");
    function embedProjectionMatches(plugin, currentEmbed, sourceEmbed) {
      let current = projectVisibleEmbed(plugin, currentEmbed), source = sourceEmbed || {};
      if (current.title !== normalizeEmbedText(plugin, source.title) || current.description !== normalizeEmbedText(plugin, source.description) || current.footerText !== normalizeEmbedText(plugin, source.footerText)) return !1;
      let sourceFields = Array.isArray(source.fields) ? source.fields : [];
      return current.fields.length !== sourceFields.length ? !1 : current.fields.every((field, index) => field.name === normalizeEmbedText(plugin, sourceFields[index] && sourceFields[index].name) && field.value === normalizeEmbedText(plugin, sourceFields[index] && sourceFields[index].value));
    }
    __name(embedProjectionMatches, "embedProjectionMatches");
    function writeVisibleEmbedText(target, rawKey, plainKey, value) {
      let wrote = !1;
      hasOwn(target, rawKey) && (target[rawKey] = value, wrote = !0), (hasOwn(target, plainKey) || !wrote) && (target[plainKey] = value);
    }
    __name(writeVisibleEmbedText, "writeVisibleEmbedText");
    function restoreEmbedFromSource(currentEmbed, sourceEmbed) {
      let restored = Object.assign({}, currentEmbed || {}), source = sourceEmbed || {};
      writeVisibleEmbedText(restored, "rawTitle", "title", source.title || ""), writeVisibleEmbedText(restored, "rawDescription", "description", source.description || ""), (restored.footer || source.footerText) && (restored.footer = Object.assign({}, restored.footer || {}, { text: source.footerText || "" }));
      let currentFields = Array.isArray(restored.fields) ? restored.fields : [];
      return restored.fields = (Array.isArray(source.fields) ? source.fields : []).map((sourceField, index) => {
        let field = Object.assign({}, currentFields[index] || {});
        return writeVisibleEmbedText(field, "rawName", "name", sourceField && sourceField.name || ""), writeVisibleEmbedText(field, "rawValue", "value", sourceField && sourceField.value || ""), field;
      }), delete restored.originalTitle, delete restored.originalDescription, delete restored.originalFooter, delete restored.originalFields, restored;
    }
    __name(restoreEmbedFromSource, "restoreEmbedFromSource");
    function createTranslationDisplayLogic({ BDFDB } = {}) {
      let translationDisplayLogic = {
        getReceivedDisplayViewRenderContent(_plugin, view) {
          if (!view) return "";
          if (view.translated && view.translation) {
            let translatedContent = view.translation.translatedContent != null && view.translation.translatedContent !== "" ? view.translation.translatedContent : view.translation.content;
            return translationDisplayLogic.buildReceivedDisplayContent(_plugin, String(translatedContent ?? ""), view.translation.originalContent || "");
          }
          return String(view.content == null ? "" : view.content);
        },
        applyReceivedDisplayViewToStream(plugin, stream, view) {
          if (!stream || !stream.content || !view) return;
          let displayContent = translationDisplayLogic.getReceivedDisplayViewRenderContent(plugin, view), sourceEmbeds = !view.translated && view.source && Array.isArray(view.source.embeds) ? view.source.embeds : null, currentEmbeds = Array.isArray(stream.content.embeds) ? stream.content.embeds : [], restoreEmbeds = !!sourceEmbeds && (currentEmbeds.length !== sourceEmbeds.length || sourceEmbeds.some((sourceEmbed, index) => !embedProjectionMatches(plugin, currentEmbeds[index], sourceEmbed)));
          if (stream.content.content === displayContent && !restoreEmbeds) return;
          let clonedMessage = new BDFDB.DiscordObjects.Message(stream.content);
          clonedMessage.content = displayContent, restoreEmbeds && (clonedMessage.embeds = sourceEmbeds.map((sourceEmbed, index) => restoreEmbedFromSource(currentEmbeds[index], sourceEmbed))), stream.content = clonedMessage;
        },
        buildReceivedDisplayContent(plugin, translatedContent, originalContent, forceInlineOriginal = !1) {
          let content = (translatedContent || "").trim();
          return originalContent && (forceInlineOriginal || plugin.settings.general.showOriginalMessage && !plugin.settings.general.showOriginalDirectly) && (content += plugin.formatOriginalTextForMessage(originalContent, plugin.shouldUseSpoilerInReceivedOriginal())), content;
        },
        refreshTranslationDisplay(plugin, translation) {
          if (!translation) return null;
          translation = Object.assign(translation, plugin.normalizeStoredTranslationData(translation));
          let inlineOriginalBySetting = !!(translation.originalContent && plugin.settings.general.showOriginalMessage && !plugin.settings.general.showOriginalDirectly);
          return translation.content = translationDisplayLogic.buildReceivedDisplayContent(plugin, translation.translatedContent || translation.content, translation.originalContent, !1), translation.contentIncludesOriginal = inlineOriginalBySetting, translation;
        },
        getReplyPreviewDisplayContent(plugin, translation) {
          if (!translation) return "";
          translation = plugin.normalizeStoredTranslationData(translation);
          let originalContent = (translation.originalContent || "").trim(), translatedContent = (translation.translatedContent || translation.content || "").trim();
          return plugin.settings.general.showOriginalInReplyPreview && translatedContent || originalContent;
        },
        stripReplyPreviewOriginalSuffix(_plugin, content) {
          if (content = (content || "").trim(), !content) return "";
          if (/\n\|\|[\s\S]*\|\|$/.test(content)) return content.replace(/\n\|\|[\s\S]*\|\|$/, "").trim();
          let lines = content.split(`
`), boundaryIndex = lines.length;
          for (; boundaryIndex > 0 && /^\s*>\s?/.test(lines[boundaryIndex - 1]); ) boundaryIndex--;
          return boundaryIndex < lines.length ? lines.slice(0, boundaryIndex).join(`
`).trim() : content;
        },
        getStableReplyPreviewOriginalContent(plugin, message) {
          if (!message) return "";
          let currentContent = (message.content || "").trim(), storedTranslations = plugin.ensureReceivedDisplayRuntime().getPreviewCandidates(message.id).filter(Boolean);
          for (let storedTranslation of storedTranslations) {
            let normalizedTranslation = plugin.normalizeStoredTranslationData(storedTranslation), originalContent = (normalizedTranslation.originalContent || "").trim(), translatedContent = (normalizedTranslation.translatedContent || normalizedTranslation.content || "").trim(), displayContent = translationDisplayLogic.getReplyPreviewDisplayContent(plugin, normalizedTranslation).trim();
            if (originalContent && (!currentContent || currentContent == originalContent || currentContent == translatedContent || currentContent == displayContent || currentContent == translationDisplayLogic.stripReplyPreviewOriginalSuffix(plugin, displayContent)))
              return originalContent;
          }
          return currentContent;
        },
        getStableReplyPreviewMessage(plugin, message) {
          if (!message) return message;
          let stableMessage = new BDFDB.DiscordObjects.Message(message);
          return stableMessage.content = translationDisplayLogic.getStableReplyPreviewOriginalContent(plugin, message), stableMessage;
        },
        getReplyPreviewFallbackContent(plugin, message) {
          return message ? translationDisplayLogic.stripReplyPreviewOriginalSuffix(plugin, message.content || "") : "";
        },
        getReplyPreviewDisplayContentForMessage(plugin, message, channelId = null) {
          if (!message) return "";
          let originalContent = translationDisplayLogic.getStableReplyPreviewOriginalContent(plugin, message) || (message.content || "").trim(), previewProjection = plugin.ensureReceivedDisplayRuntime().getReplyPreviewProjection(message.id, { channelId }), storedTranslation = previewProjection && previewProjection.translation;
          if (storedTranslation && translationDisplayLogic.shouldDisplayStoredTranslation(plugin, storedTranslation, channelId || translationDisplayLogic.getStoredTranslationChannelId(plugin, message.id))) {
            let normalizedTranslation = plugin.normalizeStoredTranslationData(storedTranslation), translatedContent = (normalizedTranslation.translatedContent || normalizedTranslation.content || "").trim();
            if (!normalizedTranslation.auto || plugin.settings.general.showOriginalInReplyPreview) return translatedContent || originalContent;
          }
          return originalContent;
        },
        applyStoredTranslationToMessage(plugin, message, translation, originalContentData = null) {
          if (!message || !translation) return null;
          let storedTranslation = translationDisplayLogic.refreshTranslationDisplay(plugin, Object.assign({
            channelId: translation.channelId || message.channel_id || null,
            auto: !!translation.auto
          }, translation));
          return plugin.ensureReceivedDisplayRuntime().clearSuppression(message.id), plugin.ensureReceivedDisplayRuntime().commitManualTranslation({
            messageId: message.id,
            channelId: storedTranslation.channelId,
            translation: storedTranslation,
            manualOptions: { independentOfTextAreaSwitch: !!storedTranslation.independentOfTextAreaSwitch },
            archive: { message: new BDFDB.DiscordObjects.Message(message), originalContentData: originalContentData || plugin.extractOriginalContentData(message) }
          }), storedTranslation;
        },
        clearDisplayedTranslationState(plugin, messageId, options = {}) {
          if (!messageId) return;
          let config = Object.assign({
            clearReplyPreview: !1,
            preserveSuppressed: !1
          }, options);
          plugin.ensureReceivedDisplayRuntime().clearDisplayedTranslation(messageId, { preserveArchive: !0, preserveSuppressed: config.preserveSuppressed, clearPreview: config.clearReplyPreview }), config.preserveSuppressed || plugin.ensureReceivedDisplayRuntime().clearSuppression(messageId), config.clearReplyPreview && plugin.ensureReceivedDisplayRuntime().clearPreview(messageId);
        },
        getStoredTranslationChannelId(plugin, messageId, fallbackChannelId = null, translation = null) {
          if (fallbackChannelId) return fallbackChannelId;
          if (translation && translation.channelId) return translation.channelId;
          let displayedTranslation = plugin.ensureReceivedDisplayRuntime().getDisplayState(messageId);
          if (displayedTranslation && displayedTranslation.channelId) return displayedTranslation.channelId;
          let replyPreviewTranslation = plugin.ensureReceivedDisplayRuntime().getPreviewTranslation(messageId);
          if (replyPreviewTranslation && replyPreviewTranslation.channelId) return replyPreviewTranslation.channelId;
          let archive = plugin.ensureReceivedDisplayRuntime().peekSourceArchive(messageId);
          return archive && archive.message.channel_id || null;
        },
        shouldDisplayStoredTranslation(plugin, translation, channelId = null) {
          if (!translation) return !1;
          let normalizedTranslation = plugin.normalizeStoredTranslationData(translation);
          if (normalizedTranslation.manual && normalizedTranslation.independentOfTextAreaSwitch) return !0;
          let resolvedChannelId = channelId || normalizedTranslation.channelId || null;
          return !(normalizedTranslation.auto && resolvedChannelId && !plugin.isTranslationEnabled(resolvedChannelId));
        },
        getStoredTranslationOriginalContent(plugin, translation, fallbackContent = "") {
          if (!translation) return fallbackContent;
          let normalizedTranslation = plugin.normalizeStoredTranslationData(translation);
          return normalizedTranslation.originalContent != null ? String(normalizedTranslation.originalContent) : fallbackContent;
        },
        getActiveMessageTranslation(plugin, message, channelId = null, expectedSignature = null) {
          if (!message || !message.id) return null;
          let displayRecord = plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id), translation = displayRecord && displayRecord.status == "translated" && displayRecord.translation ? Object.assign({}, displayRecord.translation) : null;
          if (!translation) return null;
          let resolvedChannelId = translationDisplayLogic.getStoredTranslationChannelId(plugin, message.id, channelId, translation);
          return !translationDisplayLogic.shouldDisplayStoredTranslation(plugin, translation, resolvedChannelId) || expectedSignature && translation.signature && translation.signature != expectedSignature ? (translationDisplayLogic.clearDisplayedTranslationState(plugin, message.id), null) : (translation = translationDisplayLogic.refreshTranslationDisplay(plugin, translation), translation.auto && plugin.isTranslationResultTooSimilar(translation) ? (translationDisplayLogic.clearDisplayedTranslationState(plugin, message.id), plugin.clearCachedTranslation(message.id), null) : translation);
        },
        getActiveReplyPreviewTranslation(plugin, message, channelId) {
          if (!message || !message.id) return null;
          let translation = plugin.getReplyPreviewTranslation(message, channelId);
          return translation ? translationDisplayLogic.shouldDisplayStoredTranslation(plugin, translation, channelId) ? translation : (plugin.ensureReceivedDisplayRuntime().clearPreview(message.id), null) : null;
        },
        processMessageReply(plugin, e) {
          if (!e.instance.props.referencedMessage || !e.instance.props.referencedMessage.message) return;
          let referencedMessage = e.instance.props.referencedMessage.message, stableReferencedMessage = translationDisplayLogic.getStableReplyPreviewMessage(plugin, referencedMessage), baseMessage = e.instance.props.baseMessage || null, channelId = plugin.getMessageChannelId(baseMessage || stableReferencedMessage), baseProjection = plugin.ensureReceivedDisplayRuntime().getReplyPreviewProjection(stableReferencedMessage.id, { channelId }), storedMessageTranslation = baseProjection && baseProjection.translation, hasVisibleStoredTranslation = storedMessageTranslation && translationDisplayLogic.shouldDisplayStoredTranslation(plugin, storedMessageTranslation, channelId) || translationDisplayLogic.getActiveReplyPreviewTranslation(plugin, stableReferencedMessage, channelId), shouldQueuePreview = !hasVisibleStoredTranslation && plugin.shouldAutoTranslateReplyPreview(baseMessage, stableReferencedMessage, channelId);
          shouldQueuePreview && plugin.queueReplyPreviewTranslation(stableReferencedMessage, channelId, { baseMessage });
          let fallbackContent = translationDisplayLogic.getReplyPreviewDisplayContentForMessage(plugin, stableReferencedMessage, channelId) || translationDisplayLogic.getReplyPreviewFallbackContent(plugin, stableReferencedMessage) || (stableReferencedMessage.content || "").trim();
          e.instance.props.referencedMessage = Object.assign({}, e.instance.props.referencedMessage);
          let previewMessage = new BDFDB.DiscordObjects.Message(stableReferencedMessage);
          previewMessage.content = fallbackContent, plugin.markReplyPreviewRenderMessage(previewMessage, { channelId, hostMessageId: (hasVisibleStoredTranslation || shouldQueuePreview) && baseMessage && baseMessage.id }), e.instance.props.referencedMessage.message = previewMessage, e.returnvalue && e.returnvalue.props && (e.returnvalue = plugin.wrapReplyPreviewJumpPause(plugin.stripTranslatorStylingFromReplyPreviewNode(e.returnvalue)));
        },
        resolveLoadedMessageContentTranslation(plugin, message, channelId) {
          if (plugin.getReceivedAutoTranslateScope() != "loaded_messages" || !plugin.isTranslationEnabled(channelId) || plugin.isOwnMessage(message) || plugin.ensureReceivedDisplayRuntime().isSuppressed(message.id) || plugin.ensureLiveTranslationQueue().isMessageQueued(message.id)) return null;
          let storeView = plugin.getReceivedDisplayRuntimeView(message.id);
          if (storeView && (storeView.translated || storeView.showLoading)) return null;
          let originalContentData = plugin.extractOriginalContentData(message), cachedTranslation = plugin.getCachedReceivedTranslation(message, channelId, originalContentData), liveMessage = plugin.isLikelyLiveAutoTranslateMessage(message, channelId);
          return (cachedTranslation || plugin.shouldAutoTranslateReceivedMessage(message, { id: channelId }, originalContentData)) && plugin.queueAutoTranslateMessage(message, { id: channelId }, originalContentData, {
            historicalLoad: !liveMessage,
            deferWhileReading: !1,
            cachedTranslation
          }), null;
        },
        prepareMessageContentDisplay(plugin, e) {
          let message = e.instance.props.message, channelId = plugin.getMessageChannelId(message), translation = translationDisplayLogic.getActiveMessageTranslation(plugin, message, channelId);
          if (!translation && plugin.ensureReceivedDisplayRuntime().hasSourceArchive(message.id) && (message = e.instance.props.message = new BDFDB.DiscordObjects.Message(plugin.ensureReceivedDisplayRuntime().consumeSourceArchive(message.id).message)), !translation && message.id) {
            let state = plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id);
            state && state.status == "cancelled" && state.restoredTranslation && state.source && state.source.content && message.content !== state.source.content && plugin.matchesPaintedTranslationContent(message.content, state.restoredTranslation) && (message.content = state.source.content);
          }
          return translation || (translation = translationDisplayLogic.resolveLoadedMessageContentTranslation(plugin, message, channelId)), { message, channelId, translation };
        },
        createTranslationWatermarkNode(plugin, translation, key) {
          return !translation || !translation.content ? null : BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
            key,
            text: plugin.getTranslationTooltipText(translation.input, translation.output),
            tooltipConfig: { style: "max-width: 400px" },
            children: BDFDB.ReactUtils.createElement("span", {
              className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.messagetimestamp, BDFDB.disCN.messagetimestampinline, BDFDB.disCN._translatortranslated),
              children: BDFDB.ReactUtils.createElement("span", {
                className: BDFDB.disCN.messageedited,
                children: `(${plugin.labels.translated_watermark})`
              })
            })
          });
        },
        createTranslationLoadingNode(plugin, message) {
          return !message || !plugin.isMessageTranslationPending(message.id, plugin.getMessageChannelId(message)) ? null : BDFDB.ReactUtils.createElement("span", {
            key: "translator-translation-loading",
            className: "translator-translation-loading",
            "aria-label": plugin.isChineseUiLanguage() ? "正在翻译" : "Translating"
          });
        },
        clearTranslatedRenderDecorations(_plugin, e) {
          if (!e || !e.returnvalue || !e.returnvalue.props) return;
          let className = String(e.returnvalue.props.className || "").split(/\s+/).filter((name) => name && name != "translator-translated-message").join(" ");
          e.returnvalue.props.className = className;
          let style = Object.assign({}, e.returnvalue.props.style || {});
          delete style["--translator-accent-color"], delete style["--translator-text-color"], e.returnvalue.props.style = style;
        },
        applyMessageContentRenderDecorations(plugin, e, message, translation) {
          let children = plugin.ensureElementChildrenArray(e.returnvalue);
          plugin.cleanupInjectedMessageChildren(children), translationDisplayLogic.clearTranslatedRenderDecorations(plugin, e);
          let translationPlace = plugin.isOwnMessage(message) ? MESSAGE_DIRECTIONS.SENT : MESSAGE_DIRECTIONS.RECEIVED;
          translation && plugin.shouldProtectWrappedTextForPlace(translationPlace) && (e.returnvalue.props.children = plugin.highlightProtectedWrappedTextInNode(e.returnvalue.props.children, message.id), children = plugin.ensureElementChildrenArray(e.returnvalue)), translation && plugin.settings.general.highlightTranslatedMessages && (e.returnvalue.props.className = BDFDB.DOMUtils.formatClassName(e.returnvalue.props.className, "translator-translated-message")), translation && (e.returnvalue.props.style = Object.assign({}, e.returnvalue.props.style, {
            "--translator-accent-color": plugin.getTranslatedTextColor(),
            "--translator-text-color": plugin.getTranslatedTextColor()
          }));
          let watermarkNode = translationDisplayLogic.createTranslationWatermarkNode(plugin, translation, "translator-translated-watermark");
          watermarkNode && children.push(watermarkNode);
          let loadingNode = !translation && translationDisplayLogic.createTranslationLoadingNode(plugin, message);
          loadingNode && children.push(loadingNode), translation && translation.originalContent && plugin.settings.general.showOriginalMessage && plugin.settings.general.showOriginalDirectly && !translation.contentIncludesOriginal && children.push(plugin.createOriginalMessageBlock(translation.originalContent));
        },
        processEmbed(plugin, e) {
          if (!e.instance.props.embed || !e.instance.props.embed.message_id) return;
          let embed = e.instance.props.embed, hasOwn2 = /* @__PURE__ */ __name((key) => Object.prototype.hasOwnProperty.call(embed, key), "hasOwn"), translation = translationDisplayLogic.getActiveMessageTranslation(plugin, { id: embed.message_id }, plugin.getDisplayedTranslationChannelId(embed.message_id));
          if (!translation) {
            let storeView = plugin.getReceivedDisplayRuntimeView(embed.message_id);
            storeView && storeView.translated && storeView.translation && storeView.translation.embeds && (translation = storeView.translation);
          }
          let embedTranslation = translation && translation.embeds && translation.embeds[embed.id];
          if (embedTranslation) {
            let translatedOrOriginal = /* @__PURE__ */ __name((translated, original) => translated != null && String(translated).trim() ? translated : original, "translatedOrOriginal"), originalDescription = hasOwn2("originalDescription") ? embed.originalDescription : embed.rawDescription, originalTitle = hasOwn2("originalTitle") ? embed.originalTitle : embed.rawTitle, originalFields = hasOwn2("originalFields") ? embed.originalFields : embed.fields, originalFooter = hasOwn2("originalFooter") ? embed.originalFooter : Object.assign({}, embed.footer), translatedFields = Array.isArray(embedTranslation.fields) ? embedTranslation.fields : [], sourceFields = Array.isArray(originalFields) ? originalFields : [], fields = (sourceFields.length ? sourceFields : translatedFields).map((field, index) => ({
              rawName: translatedOrOriginal(translatedFields[index] && translatedFields[index].name, field && (field.rawName || field.name)),
              rawValue: translatedOrOriginal(translatedFields[index] && translatedFields[index].value, field && (field.rawValue || field.value))
            }));
            if (!e.returnvalue) e.instance.props.embed = Object.assign({}, embed, {
              rawDescription: translatedOrOriginal(embedTranslation.description, originalDescription),
              rawTitle: translatedOrOriginal(embedTranslation.title, originalTitle),
              footer: Object.assign({}, embed.footer || {}, {
                text: translatedOrOriginal(embedTranslation.footerText, originalFooter && originalFooter.text)
              }),
              fields,
              originalDescription,
              originalTitle,
              originalFields,
              originalFooter
            });
            else {
              let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, { props: [["className", BDFDB.disCN.embeddescription]] });
              if (index > -1) {
                Array.isArray(children[index].props.children) || (children[index].props.children = [children[index].props.children]), plugin.cleanupInjectedMessageChildren(children[index].props.children);
                let watermarkNode = translationDisplayLogic.createTranslationWatermarkNode(plugin, translation, "translator-embed-watermark");
                watermarkNode && children[index].props.children.push(watermarkNode);
              }
            }
          } else !e.returnvalue && ["originalDescription", "originalTitle", "originalFields", "originalFooter"].some(hasOwn2) && (e.instance.props.embed = Object.assign({}, e.instance.props.embed, {
            rawDescription: e.instance.props.embed.originalDescription,
            rawTitle: e.instance.props.embed.originalTitle,
            fields: e.instance.props.embed.originalFields,
            footer: e.instance.props.embed.originalFooter
          }), delete e.instance.props.embed.originalDescription, delete e.instance.props.embed.originalTitle, delete e.instance.props.embed.originalFields, delete e.instance.props.embed.originalFooter);
        }
      };
      return translationDisplayLogic;
    }
    __name(createTranslationDisplayLogic, "createTranslationDisplayLogic");
    module2.exports = { MESSAGE_DIRECTIONS, createTranslationDisplayLogic };
  }
});

// src/display/repaint-scheduler.js
var require_repaint_scheduler = __commonJS({
  "src/display/repaint-scheduler.js"(exports2, module2) {
    function createDisplayRepaintScheduler({
      renderMessages,
      onRenderOutcome = /* @__PURE__ */ __name(() => {
      }, "onRenderOutcome"),
      canRepaintNow,
      isViewingHistory,
      // The full-list repaint path needs the two predicates separately, because it may
      // be told to ignore one of them.
      isSettingsSurfaceOpen = /* @__PURE__ */ __name(() => !1, "isSettingsSurfaceOpen"),
      isTextAreaFocused = /* @__PURE__ */ __name(() => !1, "isTextAreaFocused"),
      repaintAll = /* @__PURE__ */ __name(() => {
      }, "repaintAll"),
      // Pass BDFDB.TimeUtils.timeout/clear here, never the globals these default to.
      // Every timer below ends in a full-list repaint, and a raw timer outlives the plugin
      // instance that armed it, so after a reload a dead instance keeps repainting
      // alongside the live one. The defaults exist only so a unit test can drive the
      // scheduler without BDFDB; the managed-timer contract test pins the real wiring.
      setTimeout: scheduleTimer = setTimeout,
      clearTimeout: cancelTimer = clearTimeout
    }) {
      let queues = /* @__PURE__ */ new Map(), activeRequests = /* @__PURE__ */ new Map(), timer = null;
      function getActiveRequest(channelId, messageId) {
        let channel = activeRequests.get(String(channelId));
        return channel && channel.get(String(messageId)) || null;
      }
      __name(getActiveRequest, "getActiveRequest");
      function releaseActiveRequests(channelId, messageIds) {
        let key = String(channelId), channel = activeRequests.get(key);
        if (channel) {
          for (let messageId of messageIds) channel.delete(String(messageId));
          channel.size || activeRequests.delete(key);
        }
      }
      __name(releaseActiveRequests, "releaseActiveRequests");
      function removeQueuedRequest(channelId, messageId, maximumAttempt) {
        let key = String(channelId), channel = queues.get(key);
        if (!channel) return;
        let queued = channel.get(String(messageId));
        queued && queued.attempt <= maximumAttempt && channel.delete(String(messageId)), channel.size || queues.delete(key);
      }
      __name(removeQueuedRequest, "removeQueuedRequest");
      function nextDelay() {
        return 120;
      }
      __name(nextDelay, "nextDelay");
      function arm(delay) {
        timer || (timer = scheduleTimer(() => {
          timer = null, flush();
        }, delay));
      }
      __name(arm, "arm");
      function flush() {
        if (!queues.size) return;
        if (!canRepaintNow()) {
          arm(450);
          return;
        }
        let pending = [...queues.entries()];
        queues.clear();
        for (let [channelId, queuedRequests] of pending) {
          let requestsByMessageId = /* @__PURE__ */ new Map(), blockedRequests = /* @__PURE__ */ new Map();
          for (let [messageId, request] of queuedRequests) (getActiveRequest(channelId, messageId) ? blockedRequests : requestsByMessageId).set(messageId, request);
          if (blockedRequests.size) {
            queues.has(channelId) || queues.set(channelId, /* @__PURE__ */ new Map());
            let waiting = queues.get(channelId);
            for (let [messageId, request] of blockedRequests) waiting.set(messageId, request);
          }
          if (!requestsByMessageId.size) continue;
          let messageIds = [...requestsByMessageId.keys()];
          activeRequests.has(channelId) || activeRequests.set(channelId, /* @__PURE__ */ new Map());
          let activeChannel = activeRequests.get(channelId);
          for (let [messageId, request] of requestsByMessageId) activeChannel.set(messageId, request);
          let rendering = renderMessages(messageIds);
          rendering && rendering.then && rendering.then((outcome) => {
            let normalizedOutcome = Object.assign({}, outcome || {}), exhaustedIds = [];
            releaseActiveRequests(channelId, messageIds);
            for (let messageId of normalizedOutcome.retryIds || []) {
              let request = requestsByMessageId.get(String(messageId)) || { attempt: 1, trackingKeys: /* @__PURE__ */ new Set() };
              if (request.attempt < 3) {
                let trackingKeys = [...request.trackingKeys];
                if (!trackingKeys.length) schedule(channelId, messageId, 450, request.attempt + 1);
                else for (let trackingKey of trackingKeys) schedule(channelId, messageId, 450, request.attempt + 1, trackingKey);
              } else
                exhaustedIds.push(String(messageId)), removeQueuedRequest(channelId, messageId, request.attempt);
            }
            for (let messageId of [].concat(normalizedOutcome.confirmedIds || [], normalizedOutcome.deferredIds || [])) {
              let request = requestsByMessageId.get(String(messageId));
              request && removeQueuedRequest(channelId, messageId, request.attempt);
            }
            exhaustedIds.length && (normalizedOutcome.exhaustedIds = exhaustedIds);
            let trackingKeysByMessageId = {};
            for (let [messageId, request] of requestsByMessageId) request.trackingKeys.size && (trackingKeysByMessageId[messageId] = [...request.trackingKeys]);
            let report = { channelId, messageIds, outcome: normalizedOutcome };
            Object.keys(trackingKeysByMessageId).length && (report.trackingKeysByMessageId = trackingKeysByMessageId);
            try {
              onRenderOutcome(report);
            } catch {
            }
            queues.size && arm(nextDelay());
          }).catch(() => {
            releaseActiveRequests(channelId, messageIds), queues.size && arm(nextDelay());
          });
        }
      }
      __name(flush, "flush");
      function schedule(channelId, messageId, delay = null, attempt = 1, trackingKey = null) {
        if (!channelId || messageId == null) return;
        let key = String(channelId);
        queues.has(key) || queues.set(key, /* @__PURE__ */ new Map());
        let requestsByMessageId = queues.get(key), messageKey = String(messageId), queued = requestsByMessageId.get(messageKey) || { attempt: 0, trackingKeys: /* @__PURE__ */ new Set() }, active = getActiveRequest(key, messageKey);
        if (queued.attempt = Math.max(queued.attempt, active && active.attempt || 0, Math.max(1, attempt || 1)), active) for (let activeTrackingKey of active.trackingKeys) queued.trackingKeys.add(activeTrackingKey);
        trackingKey != null && String(trackingKey) && queued.trackingKeys.add(String(trackingKey)), requestsByMessageId.set(messageKey, queued), active || arm(delay ?? nextDelay());
      }
      __name(schedule, "schedule");
      let fullRepaintTimer = null, settingsRetryTimer = null, textAreaRetryTimer = null, deferredFullRepaintPending = !1;
      function scheduleFullRepaint(options = {}) {
        let config = typeof options == "boolean" ? { batched: options } : Object.assign({ batched: !1, allowWhileSettings: !1, allowWhileTyping: !1 }, options);
        if (!config.allowWhileSettings && isSettingsSurfaceOpen()) {
          deferredFullRepaintPending = !0, settingsRetryTimer || (settingsRetryTimer = scheduleTimer(() => {
            settingsRetryTimer = null, scheduleFullRepaint({ batched: !0 });
          }, 1e3));
          return;
        }
        if (!config.allowWhileTyping && isTextAreaFocused()) {
          textAreaRetryTimer && cancelTimer(textAreaRetryTimer), textAreaRetryTimer = scheduleTimer(() => {
            textAreaRetryTimer = null, scheduleFullRepaint(Object.assign({}, config, { batched: !0 }));
          }, 450);
          return;
        }
        if (textAreaRetryTimer && (cancelTimer(textAreaRetryTimer), textAreaRetryTimer = null), deferredFullRepaintPending = !1, !config.batched) {
          fullRepaintTimer && cancelTimer(fullRepaintTimer), fullRepaintTimer = null, repaintAll();
          return;
        }
        if (fullRepaintTimer) return;
        let delay = isViewingHistory() ? 1500 : 120;
        fullRepaintTimer = scheduleTimer(() => {
          fullRepaintTimer = null, repaintAll();
        }, delay);
      }
      return __name(scheduleFullRepaint, "scheduleFullRepaint"), Object.freeze({
        scheduleFullRepaint,
        hasDeferredFullRepaint: /* @__PURE__ */ __name(() => deferredFullRepaintPending, "hasDeferredFullRepaint"),
        flushDeferredFullRepaint() {
          deferredFullRepaintPending && (deferredFullRepaintPending = !1, scheduleFullRepaint({ batched: !0 }));
        },
        cancelFullRepaintTimers() {
          for (let timer2 of [fullRepaintTimer, settingsRetryTimer, textAreaRetryTimer]) timer2 && cancelTimer(timer2);
          fullRepaintTimer = null, settingsRetryTimer = null, textAreaRetryTimer = null, deferredFullRepaintPending = !1;
        },
        schedule,
        flush,
        clear() {
          timer && cancelTimer(timer), timer = null, queues.clear(), activeRequests.clear();
        },
        getNextDelay: nextDelay
      });
    }
    __name(createDisplayRepaintScheduler, "createDisplayRepaintScheduler");
    module2.exports = {
      SETTINGS_RETRY_DELAY_MS: 1e3,
      MAX_TARGETED_REPAINT_ATTEMPTS: 3,
      LIVE_REPAINT_DELAY_MS: 120,
      CALM_REPAINT_DELAY_MS: 1500,
      BUSY_RETRY_DELAY_MS: 450,
      createDisplayRepaintScheduler
    };
  }
});

// src/display/historical-display-tracker.js
var require_historical_display_tracker = __commonJS({
  "src/display/historical-display-tracker.js"(exports2, module2) {
    function createHistoricalDisplayTracker({ isStatusForChannel = /* @__PURE__ */ __name(() => !1, "isStatusForChannel"), getRevision = /* @__PURE__ */ __name(() => null, "getRevision"), updateStatus = /* @__PURE__ */ __name(() => {
    }, "updateStatus") } = {}) {
      let batches = /* @__PURE__ */ new Map(), batchSequence = 0;
      function normalizeId(value) {
        return value == null ? "" : String(value);
      }
      return __name(normalizeId, "normalizeId"), Object.freeze({
        begin({ channelId, batchKey = null, outcome = {}, displayed = 0, displayableIds = null, schedule = /* @__PURE__ */ __name(() => {
        }, "schedule") } = {}) {
          outcome = outcome || {};
          let key = normalizeId(channelId);
          if (!key) return 0;
          let ids = new Set([].concat(outcome.missingIds || [], outcome.retryIds || []).map(normalizeId).filter(Boolean));
          if (!ids.size)
            return batches.delete(key), 0;
          let displayable = new Set((Array.isArray(displayableIds) ? displayableIds : [...ids]).map(normalizeId)), identity = normalizeId(batchKey) || `${key}:display:${++batchSequence}`, revisions = new Map([...ids].map((messageId) => [messageId, getRevision(key, messageId)]));
          batches.set(key, { identity, ids, displayable, revisions, displayed: Math.max(0, displayed || 0) });
          for (let messageId of ids) schedule(messageId, identity);
          return ids.size;
        },
        handle({ channelId, messageIds = [], trackingKeysByMessageId = {}, outcome = {} } = {}) {
          outcome = outcome || {};
          let key = normalizeId(channelId), pending = batches.get(key);
          if (!pending) return !1;
          let requestedIds = new Set([].concat(messageIds || []).map(normalizeId).filter(Boolean)), displayedIds = new Set([].concat(outcome.confirmedIds || [], outcome.deferredIds || []).map(normalizeId)), retryIds = new Set([].concat(outcome.retryIds || []).map(normalizeId)), terminalIds = new Set([].concat(outcome.exhaustedIds || [], outcome.rejectedIds || [], outcome.staleIds || []).map(normalizeId)), resolved = 0, displayableResolved = 0;
          for (let messageId of requestedIds) {
            if (!pending.ids.has(messageId) || ![].concat(trackingKeysByMessageId && trackingKeysByMessageId[messageId] || []).map(normalizeId).includes(pending.identity)) continue;
            let revisionMatches = getRevision(key, messageId) === pending.revisions.get(messageId), shown = revisionMatches && displayedIds.has(messageId), terminal = terminalIds.has(messageId) || !revisionMatches || !retryIds.has(messageId);
            !shown && !terminal || (pending.ids.delete(messageId), resolved++, shown && pending.displayable.has(messageId) && displayableResolved++);
          }
          return !resolved || (pending.displayed += displayableResolved, pending.ids.size || batches.delete(key), !isStatusForChannel(key)) ? !1 : (updateStatus({ channelId: key, displayed: pending.displayed, displayPending: pending.ids.size }), !0);
        },
        clear() {
          batches.clear();
        }
      });
    }
    __name(createHistoricalDisplayTracker, "createHistoricalDisplayTracker");
    module2.exports = { createHistoricalDisplayTracker };
  }
});

// src/ui/styles.js
var require_styles = __commonJS({
  "src/ui/styles.js"(exports2, module2) {
    function createTranslatorStyles(BDFDB) {
      return `
					${BDFDB.dotCN._translatortranslatebutton + BDFDB.dotCNS._translatortranslating + BDFDB.dotCN.textareaicon} {
						color: var(--status-danger) !important;
					}
					${BDFDB.dotCN._translatorconfigbutton} {
						margin: 2px 3px 0 6px;
					}
					.translator-original-message {
						margin-top: 6px;
						padding: 0;
						border: 0;
						white-space: pre-wrap;
						line-height: 1.35;
						opacity: 0.9;
						color: var(--text-normal) !important;
						text-align: left;
					}
					.translator-original-message > span {
						display: block;
						width: 100%;
						color: var(--text-normal) !important;
						text-align: left;
					}
					.translator-discord-emoji {
						width: 1.375em;
						height: 1.375em;
						object-fit: contain;
						vertical-align: -0.275em;
						margin: 0 0.05em;
					}
					.translator-discord-mention {
						display: inline;
						padding: 0 2px;
						border-radius: 3px;
						background: var(--mention-background, color-mix(in srgb, var(--brand-500, #5865f2) 30%, transparent));
						color: var(--mention-foreground, var(--brand-260, #c9cdfb)) !important;
						font-weight: 500;
						white-space: break-spaces;
					}
					.translator-discord-mention:hover {
						background: var(--mention-background-hover, color-mix(in srgb, var(--brand-500, #5865f2) 45%, transparent));
						color: var(--white-500, #fff) !important;
					}
					.translator-translated-message {
						margin-top: 4px;
						padding: 6px 10px 6px 12px;
						border-left: 2px solid var(--translator-accent-color, var(--brand-500, var(--text-link)));
						background: color-mix(in srgb, var(--translator-accent-color, var(--brand-500, var(--text-link))) 8%, transparent);
						border-radius: 6px;
						color: var(--translator-text-color, inherit);
					}
					.translator-translation-loading {
						display: inline-block;
						width: 12px;
						height: 12px;
						margin-left: 6px;
						box-sizing: border-box;
						vertical-align: -1px;
						border: 2px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
						border-top-color: var(--text-link);
						border-radius: 50%;
						animation: translator-loading-spin 750ms linear infinite;
					}
					@keyframes translator-loading-spin {
						to {transform: rotate(360deg);}
					}
					@media (prefers-reduced-motion: reduce) {
						.translator-translation-loading {animation-duration: 1600ms;}
					}
					.translator-protected-quote {
						color: var(--text-link);
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 14%, transparent);
						padding: 0 4px;
						border-radius: 4px;
						font-weight: 600;
					}
					.translator-original-spoiler {
						filter: blur(4px);
						transition: filter 120ms ease;
					}
					.translator-original-message:hover .translator-original-spoiler {
						filter: blur(0);
					}
					.translator-reply-preview-multiline {
						overflow: visible !important;
						max-height: none !important;
					}
					.translator-reply-preview-body {
						overflow: visible !important;
						max-height: none !important;
						height: auto !important;
					}
					.translator-reply-preview-text {
						display: block !important;
						white-space: pre-wrap !important;
						overflow: visible !important;
						text-overflow: unset !important;
						-webkit-line-clamp: unset !important;
						line-clamp: unset !important;
						max-height: none !important;
						height: auto !important;
					}
					.translator-reply-preview-text > span {
						white-space: inherit !important;
						overflow: visible !important;
						text-overflow: unset !important;
					}
					.translator-reply-preview-body .translator-translated-message,
					.translator-reply-preview-text.translator-translated-message,
					.translator-reply-preview-text .translator-translated-message {
						margin: 0 !important;
						padding: 0 !important;
						border: 0 !important;
						border-left: 0 !important;
						background: transparent !important;
						box-shadow: none !important;
						color: inherit !important;
					}
					.translator-reply-preview-body [class*="translator"],
					.translator-reply-preview-text [class*="translator"] {
						background: transparent !important;
						box-shadow: none !important;
						color: inherit !important;
					}
					.translator-settings-inline-header {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 12px;
						margin-bottom: 8px;
					}
					.translator-settings-panel-root {
						overflow-anchor: none;
						overflow-x: hidden;
						max-width: 100%;
						box-sizing: border-box;
					}
					.translator-settings-panel-root [class*="select"] {
						overflow-anchor: none;
					}
										.translator-settings-panel-root {
						overflow-anchor: none;
					}
					.translator-settings-panel-root [class*="select"],
					.translator-settings-panel-root [class*="Select"],
					.translator-settings-panel-root [role="combobox"],
					.translator-stable-select-wrap,
					.translator-stable-select-wrap * {
						overflow-anchor: none;
						scroll-margin-top: 0 !important;
						scroll-margin-bottom: 0 !important;
					}
					.translator-stable-select-wrap {
						width: 100%;
						min-width: 0;
						max-width: 100%;
					}
					.translator-prefix-translation-row {
						display: grid;
						grid-template-columns: minmax(76px, 0.75fr) minmax(0, 1.65fr) 34px;
						gap: 10px;
						align-items: center;
						width: 100%;
						max-width: 100%;
						box-sizing: border-box;
						margin-bottom: 8px;
						overflow: hidden;
					}
					.translator-prefix-translation-cell,
					.translator-prefix-translation-cell > * {
						min-width: 0;
						max-width: 100%;
						box-sizing: border-box;
					}
					.translator-prefix-delete-cell {
						display: flex;
						align-items: center;
						justify-content: flex-end;
						min-width: 0;
						max-width: 34px;
						overflow: hidden;
					}
					.translator-prefix-delete-cell button {
						width: 30px !important;
						min-width: 30px !important;
						max-width: 30px !important;
						padding-left: 0 !important;
						padding-right: 0 !important;
					}
					.translator-prefix-input-cell input,
					.translator-prefix-language-cell .translator-stable-select-wrap,
					.translator-prefix-language-cell [class*="select"],
					.translator-prefix-language-cell [class*="Select"] {
						min-width: 0 !important;
						max-width: 100% !important;
						box-sizing: border-box;
					}
					.translator-token-editor {
						display: flex;
						flex-direction: column;
						gap: 8px;
						width: 100%;
						min-width: 0;
					}
					.translator-token-list {
						display: flex;
						flex-wrap: wrap;
						align-content: flex-start;
						gap: 6px;
						width: 100%;
						min-width: 0;
						min-height: 44px;
						max-height: 112px;
						overflow-y: auto;
						padding: 8px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--input-background, var(--background-tertiary));
						box-sizing: border-box;
					}
					.translator-token-empty {
						color: var(--text-muted);
						font-size: 12px;
						line-height: 1.5;
						padding: 2px 0;
					}
					.translator-token-badge {
						display: inline-flex;
						align-items: center;
						max-width: 100%;
						gap: 6px;
						padding: 4px 8px;
						border-radius: 6px;
						background: var(--bdfdb-blurple);
						color: #fff;
						font-size: 12px;
						line-height: 1.3;
						box-sizing: border-box;
					}
					.translator-token-badge-text {
						max-width: 100%;
						overflow-wrap: anywhere;
						word-break: break-word;
						white-space: normal;
					}
					.translator-token-badge-delete {
						display: inline-flex;
						align-items: center;
						justify-content: center;
						width: 14px;
						height: 14px;
						flex: 0 0 auto;
						cursor: pointer;
						opacity: 0.92;
					}
					.translator-token-badge-delete:hover {
						opacity: 1;
					}
					.translator-token-input-row,
					.translator-token-input-row > * {
						width: 100%;
						min-width: 0;
						max-width: 100%;
						box-sizing: border-box;
					}
					@media (max-width: 620px) {
						.translator-prefix-translation-row {
							grid-template-columns: minmax(76px, 1fr) 34px;
						}
						.translator-prefix-language-cell {
							grid-column: 1 / -1;
						}
					}

.translator-settings-inline-actions {
						display: flex;
						flex-wrap: wrap;
						justify-content: flex-end;
						gap: 8px;
					}
					.translator-settings-divider-spacious {
						margin-top: 14px !important;
						margin-bottom: 14px !important;
					}
					.translator-settings-note {
						margin-bottom: 8px;
						font-size: 12px;
						line-height: 1.45;
						color: var(--text-muted);
					}
					.translator-settings-switch-group {
						display: flex;
						flex-direction: column;
						margin: 6px 0 10px;
					}
					.translator-settings-switch-row {
						margin: 0 !important;
					}
					.translator-settings-switch-row + .translator-settings-switch-row {
						margin-top: 4px !important;
					}
					.translator-settings-primary-actions {
						gap: 10px;
					}
					.translator-settings-inline-grid {
						display: grid;
						grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
						gap: 12px;
						align-items: start;
					}
					.translator-settings-inline-grid > * {
						min-width: 0;
					}
					.translator-settings-color-option {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 12px;
						width: 100%;
					}
					.translator-color-palette {
						display: flex;
						flex-wrap: wrap;
						gap: 6px;
						margin-top: 6px;
					}
					.translator-loaded-status-floating {
						position: fixed;
						z-index: 999;
						display: inline-flex;
						align-items: center;
						gap: 6px;
						width: auto !important;
						min-width: 0 !important;
						max-width: min(230px, calc(100vw - 32px));
						padding: 4px 9px;
						border: 1px solid var(--background-modifier-accent, rgba(255,255,255,0.08)) !important;
						border-radius: 999px;
						background: var(--background-floating, #232428) !important;
						box-shadow: var(--shadow-low, 0 1px 3px rgba(0,0,0,0.32)) !important;
						color: var(--text-muted, #b5bac1);
						font-size: 12px;
						font-weight: 500;
						line-height: 16px;
						pointer-events: none;
						backdrop-filter: none;
						text-shadow: none;
					}
					.translator-loaded-status-floating::before,
					.translator-loaded-status-floating::after {
						content: none !important;
						display: none !important;
					}
					.translator-loaded-status-floating.translator-loaded-status-retryable {pointer-events: auto;}
					.translator-loaded-status-icon {
						display: inline-flex;
						width: 14px;
						height: 14px;
						color: var(--interactive-normal, var(--text-muted));
						flex: 0 0 auto;
					}
					.translator-loaded-status-icon > svg {display: block; width: 100%; height: 100%;}
					.translator-loaded-status-collecting .translator-loaded-status-icon,
					.translator-loaded-status-requesting .translator-loaded-status-icon,
					.translator-loaded-status-committing .translator-loaded-status-icon {color: var(--brand-500, var(--text-link));}
					.translator-loaded-status-repairing .translator-loaded-status-icon {color: var(--status-warning, var(--yellow-300));}
					.translator-loaded-status-done .translator-loaded-status-icon {color: var(--status-positive, var(--green-360));}
					.translator-loaded-status-failed .translator-loaded-status-icon {color: var(--status-danger, var(--red-400));}
					.translator-loaded-status-text {white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; max-width: 100%;}
					.translator-loaded-status-retry {
						appearance: none;
						margin: 0 0 0 2px;
						padding: 0 0 0 7px;
						border: 0;
						border-left: 1px solid var(--background-modifier-accent, rgba(255,255,255,0.12));
						background: transparent;
						color: var(--interactive-active, #f2f3f5);
						font: inherit;
						font-weight: 600;
						line-height: 16px;
						cursor: pointer;
					}
					.translator-loaded-status-retry:hover {color: var(--text-normal, #dbdee1);}
					.translator-loaded-status-inline {
						display: inline-flex;
						align-items: center;
						gap: 6px;
						width: fit-content;
						max-width: 100%;
						margin: 6px 0 10px;
						padding: 4px 9px;
						border: 1px solid var(--background-modifier-accent, rgba(255,255,255,0.08));
						border-radius: 999px;
						background: color-mix(in srgb, var(--background-secondary, #2b2d31) 88%, black 12%);
						color: var(--text-muted, #b5bac1);
						font-size: 12px;
						font-weight: 500;
						line-height: 16px;
						box-sizing: border-box;
					}
					.translator-loaded-status-inline-text {
						white-space: nowrap;
						overflow: hidden;
						text-overflow: ellipsis;
						min-width: 0;
					}
					.translator-native-color-input {
						width: 34px; height: 32px; padding: 0; border: 1px solid var(--background-modifier-accent);
						border-radius: 8px; background: transparent; cursor: pointer;
					}
					.translator-color-chip {
						appearance: none;
						position: relative;
						display: inline-flex;
						align-items: center;
						justify-content: center;
						width: 32px;
						height: 32px;
						padding: 0;
						border-radius: 8px;
						border: 1px solid var(--background-modifier-accent);
						background: var(--background-secondary-alt);
						box-shadow: none;
						color: var(--text-normal);
						cursor: pointer;
						font: inherit;
						transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
					}
					.translator-color-chip:hover {
						background: var(--background-modifier-hover);
						border-color: var(--brand-500, var(--text-link));
						color: var(--header-primary);
					}
					.translator-color-chip-active {
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 14%, var(--background-secondary-alt));
						border-color: var(--brand-500, var(--text-link));
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
						color: var(--header-primary);
					}
					.translator-color-chip-add {
						font-size: 14px;
						font-weight: 700;
					}
					.translator-color-chip-remove {
						font-size: 16px;
						font-weight: 700;
						color: var(--text-muted);
					}
					.translator-color-chip-remove:hover {
						color: var(--status-danger);
						border-color: var(--status-danger);
					}
					.translator-color-chip-delete {
						position: absolute;
						top: -5px;
						right: -5px;
						width: 15px;
						height: 15px;
						border-radius: 50%;
						display: flex;
						align-items: center;
						justify-content: center;
						background: var(--status-danger);
						color: white;
						font-size: 11px;
						font-weight: 700;
						line-height: 1;
						box-shadow: 0 0 0 2px var(--background-secondary-alt);
					}
					.translator-color-chip-code {
						display: none;
					}
					.translator-settings-color-swatch {
						width: 16px;
						height: 16px;
						border-radius: 4px;
						border: 1px solid var(--background-modifier-accent);
						flex: 0 0 auto;
					}
					.translator-color-custom-row {
						display: flex;
						align-items: center;
						gap: 8px;
						margin-top: 8px;
						max-width: 360px;
					}
					.translator-color-custom-input {
						flex: 1 1 auto;
						min-width: 0;
						height: 32px;
						box-sizing: border-box;
						padding: 0 10px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--input-background, var(--background-tertiary));
						color: var(--text-normal);
						font: inherit;
					}
					.translator-color-custom-input:focus {
						outline: none;
						border-color: var(--brand-500, var(--text-link));
					}
					.translator-secret-input-row {
						position: relative;
						margin-bottom: 8px;
					}
					.translator-secret-input-row .translator-secret-input {
						margin-bottom: 0 !important;
					}
					.translator-secret-input input {
						padding-right: 48px !important;
					}
					.translator-secret-toggle {
						position: absolute !important;
						top: 1px;
						right: 1px;
						bottom: 1px;
						width: 40px !important;
						padding: 0 !important;
						margin: 0 !important;
						display: flex !important;
						align-items: center !important;
						justify-content: center !important;
						border-radius: 0 4px 4px 0 !important;
						border: 0 !important;
						border-left: 1px solid var(--background-modifier-accent) !important;
						background: var(--input-background, var(--background-tertiary)) !important;
						box-shadow: none !important;
						color: var(--interactive-normal) !important;
						cursor: pointer !important;
						font-size: 16px !important;
						line-height: 1 !important;
						z-index: 2;
					}
					.translator-secret-toggle:hover {
						background: var(--background-modifier-hover) !important;
					}
					.translator-secret-toggle:focus-visible {
						outline: none !important;
						box-shadow: inset 0 0 0 1px var(--button-filled-brand-background, var(--brand-500)) !important;
					}
					.translator-secret-toggle svg {
						display: block;
					}
					.translator-settings-field-action {
						min-width: 92px !important;
						height: 32px !important;
						box-shadow: none !important;
						flex: 0 0 auto;
					}
					.translator-detector-panel {
						margin-bottom: 14px;
						padding: 12px 14px;
						border: 1px solid rgba(255, 255, 255, 0.055);
						border-radius: 8px;
						background: #202124;
						background: color-mix(in srgb, var(--background-secondary, #2b2d31) 78%, black 22%);
						box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
						box-sizing: border-box;
					}
					.translator-detector-panel .translator-settings-support-title {
						margin-bottom: 4px;
						font-size: 14px;
						font-weight: 700;
						line-height: 20px;
						color: var(--header-primary, #ffffff);
					}
					.translator-detector-panel .translator-settings-support-hint {
						margin-bottom: 10px;
						font-size: 13px;
						line-height: 1.45;
						color: var(--text-muted, #949ba4);
						opacity: 1;
					}
					.translator-detector-input-wrap {
						position: relative;
					}
					.translator-detector-textinput input {
						min-height: 34px !important;
						padding-right: 68px !important;
						border-color: rgba(255, 255, 255, 0.035) !important;
						background: color-mix(in srgb, var(--background-tertiary, #1e1f22) 86%, black 14%) !important;
					}
					.translator-detector-input-button {
						position: absolute !important;
						top: 50%;
						right: 8px;
						height: 26px !important;
						min-width: 46px !important;
						padding: 0 10px !important;
						transform: translateY(-50%);
						box-shadow: none !important;
						z-index: 2;
					}
					.translator-detector-input-button:active {
						transform: translateY(-50%) !important;
					}
					.translator-detector-result-row {
						display: flex;
						align-items: center;
						justify-content: space-between;
						gap: 10px;
						margin-top: 10px;
						padding: 8px 10px;
						border: 1px solid rgba(255, 255, 255, 0.045);
						border-radius: 7px;
						background: color-mix(in srgb, var(--background-tertiary, #1e1f22) 86%, black 14%);
					}
					.translator-detector-result-text {
						min-width: 0;
						color: var(--text-muted, #949ba4);
						font-size: 12.5px;
						line-height: 1.4;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
					.translator-detector-apply-button {
						flex: 0 0 auto;
						height: 28px !important;
						box-shadow: none !important;
					}
					.translator-settings-support-panel {
						margin-bottom: 8px;
						padding: 4px 0 0 0;
						border: 0;
						border-radius: 0;
						background: transparent;
					}
					.translator-advanced-protection-section {
						margin: 0 0 14px;
						padding: 0 0 2px;
					}
					.translator-advanced-protection-section + .translator-advanced-protection-section {
						margin-top: 16px;
						padding-top: 16px;
						border-top: 1px solid var(--background-modifier-accent);
					}
					.translator-advanced-protection-section .translator-settings-switch-group {
						margin-top: 8px;
						margin-bottom: 8px;
					}
					.translator-settings-support-row {
						display: flex;
						flex-wrap: wrap;
						gap: 8px;
					}
					.translator-settings-support-block + .translator-settings-support-block {
						margin-top: 12px;
						padding-top: 12px;
						border-top: 1px solid var(--background-modifier-accent);
					}
					.translator-settings-support-title {
						margin-bottom: 4px;
						font-size: 13px;
						font-weight: 600;
					}
					.translator-settings-support-hint {
						margin-bottom: 8px;
						line-height: 1.45;
						opacity: 0.8;
					}
					.translator-settings-meta {
						margin-top: 6px;
						font-size: 13px;
						line-height: 1.4;
						opacity: 0.75;
					}
					.translator-segmented-group {
						display: flex;
						flex-wrap: wrap;
						gap: 4px;
						margin-bottom: 8px;
						padding: 3px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 8px;
						background: var(--background-tertiary, var(--background-secondary));
					}
					.translator-segmented-button {
						appearance: none;
						display: inline-flex;
						align-items: center;
						justify-content: center;
						min-height: 32px;
						padding: 0 14px;
						border-radius: 7px;
						border: 0;
						background: transparent;
						box-shadow: none;
						color: var(--text-muted);
						cursor: pointer;
						font: inherit;
						font-size: 12px !important;
						font-weight: 600 !important;
						line-height: 1;
						transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
					}
					.translator-segmented-button:hover {
						background: var(--background-modifier-hover);
						color: var(--text-normal);
					}
					.translator-segmented-button-active {
						background: var(--background-secondary-alt);
						color: var(--header-primary);
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
					}
					.translator-segmented-button-disabled {
						opacity: 0.45;
						cursor: not-allowed;
					}
					.translator-segmented-button-disabled:hover {
						background: transparent;
						color: var(--text-muted);
					}
					.translator-decision-mode-grid {
						display: grid;
						grid-template-columns: 1fr 1fr;
						gap: 4px;
						width: 100%;
						margin: 8px 0 10px;
						padding: 3px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 7px;
						background: var(--background-secondary, #2b2d31);
					}
					.translator-decision-mode-grid .translator-segmented-button {
						width: 100%;
						min-height: 34px;
						border-radius: 5px;
						font-size: 13px !important;
						font-weight: 700 !important;
						background: transparent;
						color: var(--text-muted);
					}
					.translator-decision-mode-grid .translator-segmented-button:hover {
						background: var(--background-modifier-hover);
						color: var(--text-normal);
					}
					.translator-decision-mode-grid .translator-segmented-button-active {
						background: var(--brand-500, #5865f2);
						color: var(--white-500, #fff);
						box-shadow: none;
					}
					.translator-decision-mode-grid .translator-segmented-button-disabled {
						opacity: 0.45;
					}
					.translator-ai-prompt-textarea {
						box-sizing: border-box;
						width: 100%;
						min-height: 118px;
						margin: 8px 0;
						padding: 10px 12px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 6px;
						background: var(--input-background, var(--background-secondary, #2b2d31));
						color: var(--text-normal);
						font: inherit;
						font-size: 13px;
						line-height: 1.45;
						resize: vertical;
						outline: none;
						scrollbar-width: thin;
						scrollbar-color: var(--scrollbar-auto-thumb, var(--background-modifier-accent)) var(--input-background, var(--background-secondary, #2b2d31));
					}
					.translator-ai-prompt-textarea:focus {
						border-color: var(--brand-500, #5865f2);
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar {
						width: 8px;
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar-track {
						background: var(--input-background, var(--background-secondary, #2b2d31));
						border-radius: 8px;
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar-thumb {
						background: var(--scrollbar-auto-thumb, var(--background-modifier-accent));
						border: 2px solid var(--input-background, var(--background-secondary, #2b2d31));
						border-radius: 8px;
					}
					.translator-ai-prompt-textarea::-webkit-scrollbar-thumb:hover {
						background: var(--scrollbar-auto-scrollbar-color-thumb, var(--interactive-muted));
					}
					.translator-preset-grid .translator-segmented-button {
						min-width: 84px;
					}
					.translator-scope-grid .translator-segmented-button {
						flex: 1 1 180px;
						min-height: 34px;
					}
					.translator-window-grid .translator-segmented-button {
						flex: 1 1 96px;
						min-height: 34px;
					}
					.translator-scope-switch {
						display: grid;
						grid-template-columns: 1fr 1fr;
						position: relative;
						padding: 3px;
						border: 1px solid var(--background-modifier-accent);
						border-radius: 999px;
						background: var(--background-tertiary, var(--background-secondary));
						overflow: hidden;
					}
					.translator-scope-switch::before {
						content: "";
						position: absolute;
						top: 3px;
						bottom: 3px;
						left: 3px;
						width: calc(50% - 3px);
						border-radius: 999px;
						background: var(--background-secondary-alt);
						box-shadow: inset 0 0 0 1px var(--brand-500, var(--text-link));
						transition: transform 160ms ease;
					}
					.translator-scope-switch-loaded::before {
						transform: translateX(100%);
					}
					.translator-scope-switch-button {
						appearance: none;
						position: relative;
						z-index: 1;
						height: 32px;
						padding: 0 12px;
						border: 0;
						border-radius: 999px;
						background: transparent;
						box-shadow: none;
						color: var(--text-muted);
						cursor: pointer;
						font: inherit;
						font-size: 12px !important;
						font-weight: 700 !important;
						line-height: 1;
					}
					.translator-scope-switch-button-active {
						color: var(--header-primary);
					}
					.translator-loaded-warning {
						margin: 7px 2px 4px;
						font-size: 12px;
						line-height: 1.45;
						color: var(--text-muted);
					}
					.translator-loaded-limit-row {
						display: grid;
						grid-template-columns: minmax(160px, 1fr) minmax(210px, 1.2fr);
						align-items: center;
						gap: 12px;
						margin: 10px 2px 4px;
					}
					.translator-loaded-limit-title {
						font-size: 13px;
						font-weight: 600;
						color: var(--header-primary);
					}
					.translator-loaded-limit-input {
						width: 100%;
					}
					.translator-loaded-window-switch {
						grid-template-columns: repeat(5, 1fr);
					}
					.translator-loaded-window-switch::before {
						display: none;
					}
					.translator-preset-grid {
						display: flex;
						flex-wrap: wrap;
						gap: 8px;
						margin-bottom: 10px;
					}
					.translator-preset-button {
						height: 30px !important;
						padding: 0 12px !important;
						border-radius: 999px !important;
						border: 1px solid var(--background-modifier-accent) !important;
						background: transparent !important;
						box-shadow: none !important;
						color: var(--text-normal) !important;
						font-size: 13px !important;
						font-weight: 600 !important;
					}
					.translator-preset-button:hover {
						background: var(--background-secondary-alt) !important;
						border-color: var(--brand-500, var(--text-link)) !important;
					}
					.translator-preset-button-active {
						background: color-mix(in srgb, var(--brand-500, var(--text-link)) 18%, transparent) !important;
						border-color: var(--brand-500, var(--text-link)) !important;
						color: var(--header-primary) !important;
					}
	`;
    }
    __name(createTranslatorStyles, "createTranslatorStyles");
    module2.exports = { createTranslatorStyles };
  }
});

// src/providers/provider-client.js
var require_provider_client = __commonJS({
  "src/providers/provider-client.js"(exports2, module2) {
    var AI_SKIP_TRANSLATION_TOKEN = "__SKIP_TRANSLATION__", googleLanguages = ["af", "am", "ar", "az", "be", "bg", "bn", "bs", "ca", "ceb", "co", "cs", "cy", "da", "de", "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fr", "fy", "ga", "gd", "gl", "gu", "ha", "haw", "hi", "hmn", "hr", "ht", "hu", "hy", "id", "ig", "is", "it", "iw", "ja", "jw", "ka", "kk", "km", "kn", "ko", "ku", "ky", "la", "lb", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "no", "ny", "or", "pa", "pl", "ps", "pt", "ro", "ru", "rw", "sd", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "ug", "uk", "ur", "uz", "vi", "xh", "yi", "yo", "zh-CN", "zh-TW", "zu"], translationEngines = {
      googleapi: {
        name: "Google",
        auto: !0,
        funcName: "googleApiTranslate",
        languages: googleLanguages
      },
      googlecloud: {
        name: "Google Cloud Translation",
        auto: !0,
        funcName: "googleCloudTranslate",
        languages: googleLanguages,
        key: "AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        endpoint: "https://translation.googleapis.com/language/translate/v2",
        model: "nmt"
      },
      microsoft: {
        name: "Azure Translator",
        auto: !0,
        funcName: "microsoftTranslate",
        languages: ["af", "am", "ar", "az", "ba", "bg", "bn", "bs", "ca", "cs", "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fil", "fr", "fr-CA", "ga", "gl", "gu", "ha", "he", "hi", "hr", "ht", "hu", "hy", "id", "ig", "is", "it", "ja", "ka", "kk", "km", "kn", "ko", "ku", "ky", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mr", "ms", "mt", "my", "ne", "nl", "or", "pa", "pl", "ps", "pt", "pt-PT", "ro", "ru", "rw", "sd", "si", "sk", "sl", "sm", "sn", "so", "sq", "st", "sv", "sw", "ta", "te", "th", "tk", "tr", "tt", "ug", "uk", "ur", "uz", "vi", "xh", "yo", "zh-CN", "zh-TW", "zu"],
        parser: {
          "zh-CN": "zh-Hans",
          "zh-TW": "zh-Hant"
        },
        key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        endpoint: "https://api.cognitive.microsofttranslator.com/translate"
      },
      deepl: {
        name: "DeepL",
        auto: !0,
        funcName: "deepLTranslate",
        languages: ["bg", "cs", "da", "de", "en", "el", "es", "et", "fi", "fr", "hu", "id", "it", "ja", "ko", "lt", "lv", "nl", "no", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "zh"],
        premium: !0,
        key: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx"
      },
      deepseek: {
        name: "DeepSeek",
        auto: !0,
        funcName: "deepSeekTranslate",
        languages: googleLanguages,
        key: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        endpoint: "https://api.deepseek.com/chat/completions",
        // deepseek-chat and deepseek-reasoner were retired; v4-flash is the cheap tier.
        model: "deepseek-v4-flash"
      },
      openai: {
        name: "OpenAI",
        auto: !0,
        funcName: "openAiTranslate",
        languages: googleLanguages,
        key: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        endpoint: "https://api.openai.com/v1/responses",
        model: "gpt-5.6-luna"
      },
      gemini: {
        name: "Google Gemini",
        auto: !0,
        funcName: "geminiTranslate",
        languages: googleLanguages,
        key: "AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
        model: "gemini-2.5-flash"
      },
      oaicompat: {
        name: "OpenAI Compatible",
        auto: !0,
        funcName: "openAiCompatibleTranslate",
        languages: googleLanguages,
        key: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        endpoint: "https://your-provider.example/v1/chat/completions",
        model: "your-model-id"
      },
      itranslate: {
        name: "iTranslate",
        auto: !0,
        funcName: "iTranslateTranslate",
        languages: [...new Set(["af", "ar", "az", "be", "bg", "bn", "bs", "ca", "ceb", "cs", "cy", "da", "de", "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fil", "fr", "ga", "gl", "gu", "ha", "he", "hi", "hmn", "hr", "ht", "hu", "hy", "id", "ig", "is", "it", "ja", "jw", "ka", "kk", "km", "kn", "ko", "la", "lo", "lt", "lv", "mg", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "no", "ny", "pa", "pl", "pt-BR", "pt-PT", "ro", "ru", "si", "sk", "sl", "so", "sq", "sr", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "tr", "uk", "ur", "uz", "vi", "we", "yi", "yo", "zh-CN", "zh-TW", "zu"].concat(googleLanguages))].sort(),
        key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      },
      yandex: {
        name: "Yandex",
        auto: !0,
        funcName: "yandexTranslate",
        languages: ["af", "am", "ar", "az", "ba", "be", "bg", "bn", "bs", "ca", "ceb", "cs", "cy", "da", "de", "el", "en", "eo", "es", "et", "eu", "fa", "fi", "fr", "ga", "gd", "gl", "gu", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jv", "ka", "kk", "km", "kn", "ko", "ky", "la", "lb", "lo", "lt", "lv", "mg", "mhr", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "ne", "nl", "no", "pa", "pap", "pl", "pt", "ro", "ru", "si", "sk", "sl", "sq", "sr", "su", "sv", "sw", "ta", "te", "tg", "th", "tl", "tr", "tt", "udm", "uk", "ur", "uz", "vi", "xh", "yi", "zh"],
        key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      },
      papago: {
        name: "Papago",
        auto: !0,
        funcName: "papagoTranslate",
        languages: ["en", "es", "fr", "id", "ja", "ko", "th", "vi", "zh-CN", "zh-TW"],
        key: "xxxxxxxxxxxxxxxxxxxx xxxxxxxxxx"
      },
      baidu: {
        name: "Baidu",
        auto: !0,
        funcName: "baiduTranslate",
        languages: ["ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "hu", "it", "ja", "ko", "nl", "pl", "pt", "ro", "ru", "sl", "sv", "th", "vi", "zh", "zh-CN", "zh-TW"],
        parser: {
          ar: "ara",
          bg: "bul",
          da: "dan",
          es: "spa",
          et: "est",
          fi: "fin",
          fr: "fra",
          ja: "jp",
          ko: "kor",
          ro: "rom",
          sl: "slo",
          sv: "swe",
          vi: "vie",
          zh: "wyw",
          "zh-CN": "zh",
          "zh-TW": "cht"
        },
        key: "xxxxxxxxxx xxxxxxxxxxxxxxxxxxxx"
      }
    }, enginePortals = {
      googleapi: {
        primaryUrl: "https://translate.google.com/",
        primaryLabelZh: "打开 Google 翻译",
        primaryLabelEn: "Open Google Translate",
        hintZh: "Google 默认模式无需单独购买 API，可直接使用。",
        hintEn: "Google default mode does not require a separate paid API."
      },
      googlecloud: {
        primaryUrl: "https://cloud.google.com/free?hl=zh-cn",
        primaryLabelZh: "注册 / 开通 Google Cloud",
        primaryLabelEn: "Sign up for Google Cloud",
        secondaryUrl: "https://cloud.google.com/translate?hl=zh-cn",
        secondaryLabelZh: "查看文档 / 定价",
        secondaryLabelEn: "Docs / Pricing"
      },
      microsoft: {
        primaryUrl: "https://azure.microsoft.com/zh-cn/free/",
        primaryLabelZh: "注册 / 开通 Azure",
        primaryLabelEn: "Sign up for Azure",
        secondaryUrl: "https://azure.microsoft.com/zh-cn/products/ai-foundry/tools/translator",
        secondaryLabelZh: "查看文档 / 产品页",
        secondaryLabelEn: "Docs / Product"
      },
      deepl: {
        primaryUrl: "https://www.deepl.com/pro-api",
        primaryLabelZh: "注册 / 购买 DeepL API",
        primaryLabelEn: "Get DeepL API",
        secondaryUrl: "https://www.deepl.com/pro-api",
        secondaryLabelZh: "查看定价 / 文档",
        secondaryLabelEn: "Pricing / Docs"
      },
      deepseek: {
        primaryUrl: "https://platform.deepseek.com/api_keys",
        primaryLabelZh: "注册 / 获取 DeepSeek API Key",
        primaryLabelEn: "Get DeepSeek API Key",
        secondaryUrl: "https://api-docs.deepseek.com/zh-cn/",
        secondaryLabelZh: "查看文档 / 模型价格",
        secondaryLabelEn: "Docs / Pricing"
      },
      openai: {
        primaryUrl: "https://platform.openai.com/api-keys",
        primaryLabelZh: "获取 OpenAI API Key",
        primaryLabelEn: "Get OpenAI API Key",
        secondaryUrl: "https://developers.openai.com/api/docs/guides/migrate-to-responses",
        secondaryLabelZh: "查看 Responses API 文档",
        secondaryLabelEn: "Responses API Docs"
      },
      gemini: {
        primaryUrl: "https://aistudio.google.com/app/apikey",
        primaryLabelZh: "获取 Gemini API Key",
        primaryLabelEn: "Get Gemini API Key",
        secondaryUrl: "https://ai.google.dev/gemini-api/docs",
        secondaryLabelZh: "查看 Gemini API 文档",
        secondaryLabelEn: "Gemini API Docs"
      },
      oaicompat: {
        hintZh: "填写你自建或第三方 OpenAI 兼容服务的 API Key、接口地址和模型名。",
        hintEn: "Enter the API key, endpoint, and model for your self-hosted or third-party OpenAI-compatible service."
      },
      itranslate: {
        primaryUrl: "https://developer.itranslate.com/",
        primaryLabelZh: "打开 iTranslate 开发者入口",
        primaryLabelEn: "Open iTranslate Developer Portal"
      },
      yandex: {
        primaryUrl: "https://aistudio.yandex.ru/en/model-gallery#services",
        primaryLabelZh: "打开 Yandex 官方入口",
        primaryLabelEn: "Open Yandex Portal"
      },
      papago: {
        primaryUrl: "https://developers.naver.com/main/",
        primaryLabelZh: "打开 Naver Developers",
        primaryLabelEn: "Open Naver Developers"
      },
      baidu: {
        primaryUrl: "https://fanyi-api.baidu.com/",
        primaryLabelZh: "打开百度翻译开放平台",
        primaryLabelEn: "Open Baidu Translate Open Platform"
      }
    }, CREDENTIAL_REQUIRED_ENGINES = ["microsoft", "googlecloud", "deepl", "deepseek", "openai", "gemini", "oaicompat"], VALIDATABLE_ENGINES = ["googlecloud", "microsoft", "deepl", "deepseek", "openai", "gemini", "oaicompat"], AI_MODEL_ENGINES = ["deepseek", "openai", "gemini", "oaicompat"];
    function engineRequestExtras(engineKey) {
      return engineKey === "deepseek" ? { thinking: { type: "disabled" } } : {};
    }
    __name(engineRequestExtras, "engineRequestExtras");
    function MD5(e) {
      function h(a2, b2) {
        var e2 = a2 & 2147483648, f2 = b2 & 2147483648, c2 = a2 & 1073741824, d2 = b2 & 1073741824, g = (a2 & 1073741823) + (b2 & 1073741823);
        return c2 & d2 ? g ^ 2147483648 ^ e2 ^ f2 : c2 | d2 ? g & 1073741824 ? g ^ 3221225472 ^ e2 ^ f2 : g ^ 1073741824 ^ e2 ^ f2 : g ^ e2 ^ f2;
      }
      __name(h, "h");
      function k(a2, b2, c2, d2, e2, f2, g) {
        return a2 = h(a2, h(h(b2 & c2 | ~b2 & d2, e2), g)), h(a2 << f2 | a2 >>> 32 - f2, b2);
      }
      __name(k, "k");
      function l(a2, b2, c2, d2, e2, f2, g) {
        return a2 = h(a2, h(h(b2 & d2 | c2 & ~d2, e2), g)), h(a2 << f2 | a2 >>> 32 - f2, b2);
      }
      __name(l, "l");
      function m(a2, b2, d2, c2, e2, f2, g) {
        return a2 = h(a2, h(h(b2 ^ d2 ^ c2, e2), g)), h(a2 << f2 | a2 >>> 32 - f2, b2);
      }
      __name(m, "m");
      function n(a2, b2, d2, c2, e2, f2, g) {
        return a2 = h(a2, h(h(d2 ^ (b2 | ~c2), e2), g)), h(a2 << f2 | a2 >>> 32 - f2, b2);
      }
      __name(n, "n");
      function p(a2) {
        var b2 = "", d2 = "", c2;
        for (c2 = 0; 3 >= c2; c2++) d2 = a2 >>> 8 * c2 & 255, d2 = "0" + d2.toString(16), b2 += d2.substr(d2.length - 2, 2);
        return b2;
      }
      __name(p, "p");
      var f = [], q, r, s, t, a, b, c, d;
      for (e = (function(a2) {
        a2 = a2.replace(/\r\n/g, `
`);
        for (var b2 = "", d2 = 0; d2 < a2.length; d2++) {
          var c2 = a2.charCodeAt(d2);
          128 > c2 ? b2 += String.fromCharCode(c2) : (127 < c2 && 2048 > c2 ? b2 += String.fromCharCode(c2 >> 6 | 192) : (b2 += String.fromCharCode(c2 >> 12 | 224), b2 += String.fromCharCode(c2 >> 6 & 63 | 128)), b2 += String.fromCharCode(c2 & 63 | 128));
        }
        return b2;
      })(e), f = (function(b2) {
        var a2, c2 = b2.length;
        a2 = c2 + 8;
        for (var d2 = 16 * ((a2 - a2 % 64) / 64 + 1), e2 = Array(d2 - 1), f2 = 0, g = 0; g < c2; ) a2 = (g - g % 4) / 4, f2 = g % 4 * 8, e2[a2] |= b2.charCodeAt(g) << f2, g++;
        return a2 = (g - g % 4) / 4, e2[a2] |= 128 << g % 4 * 8, e2[d2 - 2] = c2 << 3, e2[d2 - 1] = c2 >>> 29, e2;
      })(e), a = 1732584193, b = 4023233417, c = 2562383102, d = 271733878, e = 0; e < f.length; e += 16) q = a, r = b, s = c, t = d, a = k(a, b, c, d, f[e + 0], 7, 3614090360), d = k(d, a, b, c, f[e + 1], 12, 3905402710), c = k(c, d, a, b, f[e + 2], 17, 606105819), b = k(b, c, d, a, f[e + 3], 22, 3250441966), a = k(a, b, c, d, f[e + 4], 7, 4118548399), d = k(d, a, b, c, f[e + 5], 12, 1200080426), c = k(c, d, a, b, f[e + 6], 17, 2821735955), b = k(b, c, d, a, f[e + 7], 22, 4249261313), a = k(a, b, c, d, f[e + 8], 7, 1770035416), d = k(d, a, b, c, f[e + 9], 12, 2336552879), c = k(c, d, a, b, f[e + 10], 17, 4294925233), b = k(b, c, d, a, f[e + 11], 22, 2304563134), a = k(a, b, c, d, f[e + 12], 7, 1804603682), d = k(d, a, b, c, f[e + 13], 12, 4254626195), c = k(c, d, a, b, f[e + 14], 17, 2792965006), b = k(b, c, d, a, f[e + 15], 22, 1236535329), a = l(a, b, c, d, f[e + 1], 5, 4129170786), d = l(d, a, b, c, f[e + 6], 9, 3225465664), c = l(c, d, a, b, f[e + 11], 14, 643717713), b = l(b, c, d, a, f[e + 0], 20, 3921069994), a = l(a, b, c, d, f[e + 5], 5, 3593408605), d = l(d, a, b, c, f[e + 10], 9, 38016083), c = l(c, d, a, b, f[e + 15], 14, 3634488961), b = l(b, c, d, a, f[e + 4], 20, 3889429448), a = l(a, b, c, d, f[e + 9], 5, 568446438), d = l(d, a, b, c, f[e + 14], 9, 3275163606), c = l(c, d, a, b, f[e + 3], 14, 4107603335), b = l(b, c, d, a, f[e + 8], 20, 1163531501), a = l(a, b, c, d, f[e + 13], 5, 2850285829), d = l(d, a, b, c, f[e + 2], 9, 4243563512), c = l(c, d, a, b, f[e + 7], 14, 1735328473), b = l(b, c, d, a, f[e + 12], 20, 2368359562), a = m(a, b, c, d, f[e + 5], 4, 4294588738), d = m(d, a, b, c, f[e + 8], 11, 2272392833), c = m(c, d, a, b, f[e + 11], 16, 1839030562), b = m(b, c, d, a, f[e + 14], 23, 4259657740), a = m(a, b, c, d, f[e + 1], 4, 2763975236), d = m(d, a, b, c, f[e + 4], 11, 1272893353), c = m(c, d, a, b, f[e + 7], 16, 4139469664), b = m(b, c, d, a, f[e + 10], 23, 3200236656), a = m(a, b, c, d, f[e + 13], 4, 681279174), d = m(d, a, b, c, f[e + 0], 11, 3936430074), c = m(c, d, a, b, f[e + 3], 16, 3572445317), b = m(b, c, d, a, f[e + 6], 23, 76029189), a = m(a, b, c, d, f[e + 9], 4, 3654602809), d = m(d, a, b, c, f[e + 12], 11, 3873151461), c = m(c, d, a, b, f[e + 15], 16, 530742520), b = m(b, c, d, a, f[e + 2], 23, 3299628645), a = n(a, b, c, d, f[e + 0], 6, 4096336452), d = n(d, a, b, c, f[e + 7], 10, 1126891415), c = n(c, d, a, b, f[e + 14], 15, 2878612391), b = n(b, c, d, a, f[e + 5], 21, 4237533241), a = n(a, b, c, d, f[e + 12], 6, 1700485571), d = n(d, a, b, c, f[e + 3], 10, 2399980690), c = n(c, d, a, b, f[e + 10], 15, 4293915773), b = n(b, c, d, a, f[e + 1], 21, 2240044497), a = n(a, b, c, d, f[e + 8], 6, 1873313359), d = n(d, a, b, c, f[e + 15], 10, 4264355552), c = n(c, d, a, b, f[e + 6], 15, 2734768916), b = n(b, c, d, a, f[e + 13], 21, 1309151649), a = n(a, b, c, d, f[e + 4], 6, 4149444226), d = n(d, a, b, c, f[e + 11], 10, 3174756917), c = n(c, d, a, b, f[e + 2], 15, 718787259), b = n(b, c, d, a, f[e + 9], 21, 3951481745), a = h(a, q), b = h(b, r), c = h(c, s), d = h(d, t);
      return (p(a) + p(b) + p(c) + p(d)).toLowerCase();
    }
    __name(MD5, "MD5");
    function isValidatableEngine(engineKey) {
      return VALIDATABLE_ENGINES.includes(engineKey);
    }
    __name(isValidatableEngine, "isValidatableEngine");
    function supportsModelCatalog(engineKey) {
      return AI_MODEL_ENGINES.includes(engineKey);
    }
    __name(supportsModelCatalog, "supportsModelCatalog");
    function normalizeApiEndpoint(engineKey, endpoint) {
      let normalized = (endpoint || "").trim() || translationEngines[engineKey] && translationEngines[engineKey].endpoint || "";
      return normalized ? (normalized = normalized.replace(/\s+/g, "").replace(/\/+$/, ""), engineKey == "deepseek" ? (/\/v1$/i.test(normalized) && (normalized = normalized.slice(0, -3)), /\/v1\/chat\/completions$/i.test(normalized) ? normalized.replace(/\/v1\/chat\/completions$/i, "/chat/completions") : /\/chat\/completions$/i.test(normalized) ? normalized : `${normalized}/chat/completions`) : engineKey == "oaicompat" ? /\/chat\/completions$/i.test(normalized) ? normalized : /\/v1$/i.test(normalized) ? `${normalized}/chat/completions` : /^https?:\/\/[^/]+$/i.test(normalized) ? `${normalized}/v1/chat/completions` : normalized : engineKey == "openai" ? /\/responses$/i.test(normalized) ? normalized : /\/v1$/i.test(normalized) ? `${normalized}/responses` : /^https?:\/\/[^/]+$/i.test(normalized) ? `${normalized}/v1/responses` : normalized : engineKey == "gemini" ? normalized.replace(/\/[^/]+:generateContent$/i, "").replace(/\/models\/[^/]+$/i, "/models") : engineKey == "microsoft" ? (normalized = normalized.replace(/\?.*$/, ""), /\/translate$/i.test(normalized) ? normalized : `${normalized}/translate`) : normalized) : "";
    }
    __name(normalizeApiEndpoint, "normalizeApiEndpoint");
    function getModelCatalogEndpoint(engineKey, endpoint) {
      let normalized = normalizeApiEndpoint(engineKey, endpoint);
      return normalized ? engineKey == "openai" && /\/responses$/i.test(normalized) ? normalized.replace(/\/responses$/i, "/models") : engineKey == "gemini" ? normalized : /\/chat\/completions$/i.test(normalized) ? normalized.replace(/\/chat\/completions$/i, "/models") : `${normalized.replace(/\/+$/, "")}/models` : "";
    }
    __name(getModelCatalogEndpoint, "getModelCatalogEndpoint");
    function mapLanguageCodeForEngine(engineKey, languageId) {
      return languageId && (engineKey == "deepl" ? languageId == "zh-CN" || languageId == "zh" ? "ZH" : languageId == "zh-TW" ? "ZH-HANT" : languageId.toUpperCase() : translationEngines[engineKey] && translationEngines[engineKey].parser && translationEngines[engineKey].parser[languageId] || languageId);
    }
    __name(mapLanguageCodeForEngine, "mapLanguageCodeForEngine");
    function getValidationRequestForEngine(_engineKey) {
      return {
        source: "en",
        target: "de",
        text: "Good morning"
      };
    }
    __name(getValidationRequestForEngine, "getValidationRequestForEngine");
    function getValidationErrorDetails(body) {
      if (!body) return "";
      try {
        body = typeof body == "string" ? JSON.parse(body) : body;
      } catch {
        return typeof body == "string" ? body.slice(0, 160) : "";
      }
      return body && body.error && (body.error.message || body.error.code) || body.message || body.error_msg || body.msg || "";
    }
    __name(getValidationErrorDetails, "getValidationErrorDetails");
    function buildAiProviderTranslationPrompt(data) {
      let decisionInstruction = data.autoDecision ? `
				Auto-translate decision rules:
				${data.decisionPrompt || ""}
				If the message should not be translated, return exactly ${AI_SKIP_TRANSLATION_TOKEN}.
				` : "", targetLanguageName = data.output.name || data.output.id, translationModeInstruction = data.autoDecision ? `
				Auto-translate mode: translate only natural-language content that is not already in ${targetLanguageName}; already-target-language content may stay unchanged according to the decision rules.
				` : `
				Manual translation mode: translate the entire natural-language message into ${targetLanguageName}. Do not keep non-target natural-language text as-is. Preserve only URLs, code, mentions, emoji, IDs, and protected placeholders.
				`;
      return {
        system: data.autoDecision ? "You are a senior bilingual localization specialist and Discord chat translation decision assistant" : "You are a senior bilingual localization specialist",
        prompt: `
				You are a professional localization expert. The target language is exactly ${targetLanguageName}. Do not infer the target language from the source text or from existing bilingual/spoiler content.
				${translationModeInstruction}
				Rules:
				1. Return ONLY the translation without any explanations
				2. Output language must be exactly ${targetLanguageName}; do not output any other language except preserved protected content
				3. Use natural, fluent language
				4. Maintain consistent terminology for technical/game terms
				5. Keep proper nouns/product/game/model names as-is by default; use official/common names in ${targetLanguageName} when clearly established
				6. Preserve the original tone and style
				7. Do not omit any source content, including short interjections, laughter, particles, repeated words, or standalone short lines; translate or preserve them naturally in the target language.
				8. Use concise sentence structures
				9. Convert [NEWLINE] markers to actual line breaks (don't show them literally)
				10. Preserve placeholders like ⟦0⟧, ⟦1⟧ exactly; they are protected mentions/links/emoji/code.
				${decisionInstruction}
				Text to translate:
				${data.text.replace(/\n/g, " [NEWLINE] ").replace(/\s+/g, " ")}
				`
      };
    }
    __name(buildAiProviderTranslationPrompt, "buildAiProviderTranslationPrompt");
    function parseOpenAiResponseText(body) {
      try {
        body = typeof body == "string" ? JSON.parse(body) : body;
      } catch {
        return "";
      }
      if (body && typeof body.output_text == "string") return body.output_text.trim();
      let outputParts = [];
      for (let item of body && body.output || []) for (let content of item && item.content || []) content && typeof content.text == "string" && outputParts.push(content.text);
      return outputParts.length ? outputParts.join("").trim() : body && body.choices && body.choices[0] && body.choices[0].message && typeof body.choices[0].message.content == "string" ? body.choices[0].message.content.trim() : "";
    }
    __name(parseOpenAiResponseText, "parseOpenAiResponseText");
    function parseGeminiResponseText(body) {
      try {
        body = typeof body == "string" ? JSON.parse(body) : body;
      } catch {
        return "";
      }
      return (body && body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts || []).map((part) => part && typeof part.text == "string" ? part.text : "").join("").trim();
    }
    __name(parseGeminiResponseText, "parseGeminiResponseText");
    function parseAiBatchTranslationResponse(content, expectedIds = null) {
      if (content = (content || "").trim(), !content) return null;
      content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      let firstArray = content.indexOf("["), lastArray = content.lastIndexOf("]");
      firstArray > -1 && lastArray > firstArray && (content = content.slice(firstArray, lastArray + 1));
      try {
        let parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.translations) && (parsed = parsed.translations), !Array.isArray(parsed)) return null;
        let expectedIdSet = expectedIds ? new Set(Array.from(expectedIds, (id) => String(id))) : null, duplicateIds = /* @__PURE__ */ new Set();
        return parsed.reduce((dict, item) => {
          if (!item || item.id == null) return dict;
          let id = String(item.id);
          if (expectedIdSet && !expectedIdSet.has(id)) return dict;
          if (duplicateIds.has(id) || Object.prototype.hasOwnProperty.call(dict, id))
            return duplicateIds.add(id), delete dict[id], dict;
          let value = item.translation != null ? item.translation : item.text;
          return dict[id] = value == null ? "" : String(value), dict;
        }, {});
      } catch {
        return null;
      }
    }
    __name(parseAiBatchTranslationResponse, "parseAiBatchTranslationResponse");
    function createProviderClient({
      // The HTTP function, shaped like BDFDB.LibraryRequires.request:
      // (url, options, (error, response, body) => void).
      request = /* @__PURE__ */ __name((_url, _options, callback) => callback(new Error("no request function"), null, ""), "request"),
      // Plugin-scoped timers (BDFDB.TimeUtils.timeout/clear) so a plugin stop cancels an
      // in-flight request window.
      setTimeout: setTimeout2 = /* @__PURE__ */ __name((callback, delay) => globalThis.setTimeout(callback, delay), "setTimeout"),
      clearTimeout: clearTimeout2 = /* @__PURE__ */ __name((timer) => globalThis.clearTimeout(timer), "clearTimeout"),
      // Deliberately NOT the plugin-scoped timer: a backoff wait that a plugin stop
      // cancelled would leave its awaiting promise pending forever.
      sleep = /* @__PURE__ */ __name((ms) => new Promise((resolve) => globalThis.setTimeout(resolve, ms)), "sleep"),
      now = Date.now,
      getAuthKeys = /* @__PURE__ */ __name(() => ({}), "getAuthKeys"),
      saveAuthKeys = /* @__PURE__ */ __name(() => {
      }, "saveAuthKeys"),
      // The plugin's language table, used to name the source language a provider detected.
      getLanguages = /* @__PURE__ */ __name(() => ({}), "getLanguages"),
      notify = /* @__PURE__ */ __name(() => null, "notify"),
      getLabels = /* @__PURE__ */ __name(() => ({}), "getLabels"),
      getCustomText = /* @__PURE__ */ __name(() => "", "getCustomText"),
      getEngineLabel = /* @__PURE__ */ __name((engineKey) => translationEngines[engineKey] && translationEngines[engineKey].name || engineKey, "getEngineLabel"),
      shouldUseAiAutoTranslateDecision = /* @__PURE__ */ __name(() => !1, "shouldUseAiAutoTranslateDecision"),
      getAiAutoTranslatePrompt = /* @__PURE__ */ __name(() => "", "getAiAutoTranslatePrompt"),
      // BDFDB.DOMUtils.create: Yandex answers XML, not JSON.
      createElementFromHtml = /* @__PURE__ */ __name(() => null, "createElementFromHtml"),
      generateId = /* @__PURE__ */ __name(() => String(Date.now()), "generateId"),
      // The settings panel must know an endpoint was rewritten under it.
      onEndpointNormalized = /* @__PURE__ */ __name(() => {
      }, "onEndpointNormalized"),
      // Opening a backoff window is also the queue's cue to re-arm its retry.
      onBackoffScheduled = /* @__PURE__ */ __name(() => {
      }, "onBackoffScheduled")
    } = {}) {
      let backoffUntil = 0, backoffStep = 0, modelCatalogState = {};
      function toast(message, options) {
        return notify(message, options);
      }
      __name(toast, "toast");
      function dangerToast(message) {
        return toast(message, { type: "danger", position: "center" });
      }
      __name(dangerToast, "dangerToast");
      function scheduleBackoff(ms) {
        if (!ms) return;
        let timestamp = now();
        backoffUntil > timestamp ? backoffStep = Math.min(backoffStep + 1, 4) : backoffStep = 0;
        let scaledMs = Math.min(ms * Math.pow(2, backoffStep), 6e4);
        backoffUntil = Math.max(backoffUntil || 0, timestamp + scaledMs), onBackoffScheduled();
      }
      __name(scheduleBackoff, "scheduleBackoff");
      function awaitBackoff() {
        let waitMs = (backoffUntil || 0) - now();
        return waitMs <= 0 ? Promise.resolve() : sleep(waitMs);
      }
      __name(awaitBackoff, "awaitBackoff");
      function requestWithTimeout(url, options, callback, timeoutMs = 3e4) {
        let done = !1, timer = null, finish = /* @__PURE__ */ __name((error, response, body) => {
          if (done) return;
          done = !0, timer && clearTimeout2(timer);
          let statusCode = response && response.statusCode;
          statusCode == 429 ? scheduleBackoff(5e3) : statusCode && statusCode >= 500 && scheduleBackoff(2e3), callback(error, response, body);
        }, "finish");
        timer = setTimeout2((_) => finish(null, { statusCode: 504 }, ""), timeoutMs);
        try {
          request(url, options, finish);
        } catch (err) {
          finish(err, null, "");
        }
        return timer;
      }
      __name(requestWithTimeout, "requestWithTimeout");
      function getAuth(engineKey) {
        return (getAuthKeys() || {})[engineKey] || {};
      }
      __name(getAuth, "getAuth");
      function storeAuth(engineKey, auth) {
        let authKeys = getAuthKeys() || {};
        authKeys[engineKey] = auth, saveAuthKeys(authKeys);
      }
      __name(storeAuth, "storeAuth");
      function isEngineConfiguredForRuntime(engineKey) {
        if (!translationEngines[engineKey]) return !1;
        if (!CREDENTIAL_REQUIRED_ENGINES.includes(engineKey)) return !0;
        let auth = getAuth(engineKey);
        if (!(auth.key || "").trim()) return !1;
        if (engineKey != "oaicompat") return !0;
        let endpoint = (auth.endpoint || "").trim(), model = (auth.model || "").trim();
        return !!endpoint && !!model && endpoint != translationEngines.oaicompat.endpoint && model != translationEngines.oaicompat.model;
      }
      __name(isEngineConfiguredForRuntime, "isEngineConfiguredForRuntime");
      function fetchModelCatalog(engineKey, onUpdate = null) {
        return new Promise((resolve) => {
          if (!supportsModelCatalog(engineKey)) return resolve({ ok: !1, items: [] });
          let updateState = /* @__PURE__ */ __name((patch) => {
            modelCatalogState[engineKey] = Object.assign({}, modelCatalogState[engineKey], patch), typeof onUpdate == "function" && onUpdate();
          }, "updateState"), engineLabel = getEngineLabel(engineKey), auth = getAuth(engineKey), apiKey = (auth.key || "").trim();
          if (!apiKey)
            return dangerToast(`${engineLabel}: ${getCustomText("validate_missing_key")}`), resolve({ ok: !1, items: [] });
          if (engineKey == "oaicompat" && (!(auth.endpoint || "").trim() || (auth.endpoint || "").trim() == translationEngines.oaicompat.endpoint))
            return dangerToast(`${engineLabel}: ${getCustomText("validate_missing_endpoint")}`), resolve({ ok: !1, items: [] });
          let normalizedEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey] && translationEngines[engineKey].endpoint || "");
          if (!normalizedEndpoint)
            return dangerToast(`${engineLabel}: ${getCustomText("validate_missing_endpoint")}`), resolve({ ok: !1, items: [] });
          auth.endpoint && normalizedEndpoint != auth.endpoint && (auth.endpoint = normalizedEndpoint, storeAuth(engineKey, auth), onEndpointNormalized());
          let modelCatalogEndpoint = getModelCatalogEndpoint(engineKey, normalizedEndpoint), requestUrl = engineKey == "gemini" ? `${modelCatalogEndpoint}?key=${encodeURIComponent(apiKey)}` : modelCatalogEndpoint;
          updateState({ loading: !0, items: [], endpoint: requestUrl });
          let requestHeaders = { "Content-Type": "application/json" };
          engineKey != "gemini" && (requestHeaders.Authorization = `Bearer ${apiKey}`), request(requestUrl, {
            method: "get",
            headers: requestHeaders
          }, (error, response, body) => {
            if (!error && body && response && response && response.statusCode == 200)
              try {
                body = JSON.parse(body);
                let items = (engineKey == "gemini" ? (body && body.models || []).filter((item) => !item || !Array.isArray(item.supportedGenerationMethods) || item.supportedGenerationMethods.includes("generateContent")) : body && body.data || []).map((item) => typeof item == "string" ? item : engineKey == "gemini" ? item && item.name && item.name.replace(/^models\//, "") : item && item.id).filter((item) => typeof item == "string" && item.trim()).sort((modelA, modelB) => modelA.localeCompare(modelB));
                return updateState({
                  loading: !1,
                  items,
                  endpoint: requestUrl,
                  fetchedAt: now()
                }), toast(
                  items.length ? `${engineLabel}: ${getCustomText("model_catalog_loaded").replace("{count}", items.length)}` : `${engineLabel}: ${getCustomText("model_catalog_empty")}`,
                  {
                    type: items.length ? "success" : "warning",
                    position: "center"
                  }
                ), resolve({ ok: !0, items });
              } catch {
              }
            updateState({ loading: !1, items: [] });
            let details = getValidationErrorDetails(body);
            return dangerToast(`${engineLabel}: ${getCustomText("validate_failed")}${response && response.statusCode ? ` (${response.statusCode})` : ""}${details ? ` - ${details}` : ""}`), resolve({ ok: !1, items: [] });
          });
        });
      }
      __name(fetchModelCatalog, "fetchModelCatalog");
      function validateEngineConfig(engineKey) {
        return new Promise((resolve) => {
          if (!isValidatableEngine(engineKey)) return resolve({ ok: !1, normalized: !1 });
          let engineLabel = getEngineLabel(engineKey), runningToast = null, finish = /* @__PURE__ */ __name((ok, message, normalized2 = !1) => {
            runningToast && runningToast.close(), toast(message, {
              type: ok ? "success" : "danger",
              position: "center"
            }), resolve({ ok, normalized: normalized2 });
          }, "finish"), auth = getAuth(engineKey), apiKey = (auth.key || "").trim();
          if (!apiKey) return finish(!1, `${engineLabel}: ${getCustomText("validate_missing_key")}`);
          if (engineKey == "oaicompat" && (!(auth.endpoint || "").trim() || (auth.endpoint || "").trim() == translationEngines.oaicompat.endpoint)) return finish(!1, `${engineLabel}: ${getCustomText("validate_missing_endpoint")}`);
          if (engineKey == "oaicompat" && (!(auth.model || "").trim() || (auth.model || "").trim() == translationEngines.oaicompat.model)) return finish(!1, `${engineLabel}: ${getCustomText("validate_missing_model")}`);
          let normalized = !1, apiEndpoint = "";
          if (translationEngines[engineKey] && translationEngines[engineKey].endpoint && (apiEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey].endpoint), auth.endpoint && apiEndpoint != auth.endpoint && (auth.endpoint = apiEndpoint, storeAuth(engineKey, auth), onEndpointNormalized(), normalized = !0), !apiEndpoint))
            return finish(!1, `${engineLabel}: ${getCustomText("validate_missing_endpoint")}`, normalized);
          let modelId = (auth.model || translationEngines[engineKey] && translationEngines[engineKey].model || "").trim();
          if (AI_MODEL_ENGINES.includes(engineKey) && !modelId) return finish(!1, `${engineLabel}: ${getCustomText("validate_missing_model")}`, normalized);
          let sample = getValidationRequestForEngine(engineKey);
          runningToast = toast(`${getCustomText("validate_running")} ${engineLabel}...`, {
            timeout: 0,
            ellipsis: !0,
            position: "center"
          });
          let successMessage = /* @__PURE__ */ __name((translatedText) => {
            let suffix = normalized ? ` ${getCustomText("validate_saved_endpoint")}` : "", preview = translatedText ? ` (${translatedText.slice(0, 48)})` : "";
            return `${engineLabel}: ${getCustomText("validate_success")}.${suffix}${preview}`;
          }, "successMessage"), failMessage = /* @__PURE__ */ __name((statusCode, body) => {
            let details = getValidationErrorDetails(body);
            return `${engineLabel}: ${getCustomText("validate_failed")}${statusCode ? ` (${statusCode})` : ""}${details ? ` - ${details}` : ""}`;
          }, "failMessage");
          switch (engineKey) {
            case "googlecloud": {
              let model = (auth.model || "").trim(), form = {
                key: apiKey,
                q: sample.text,
                source: sample.source,
                target: sample.target,
                format: "text"
              };
              return model && (form.model = model), request(apiEndpoint, {
                method: "post",
                form
              }, (error, response, body) => {
                if (!error && body && response && response && response.statusCode == 200)
                  try {
                    body = JSON.parse(body);
                    let translation = body && body.data && body.data.translations && body.data.translations[0] && body.data.translations[0].translatedText;
                    return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
                  } catch {
                  }
                return finish(!1, failMessage(response && response.statusCode, body), normalized);
              });
            }
            case "microsoft": {
              let headers = {
                "Content-Type": "application/json",
                "Ocp-Apim-Subscription-Key": apiKey
              }, region = (auth.region || "").trim();
              return region && region != "global" && (headers["Ocp-Apim-Subscription-Region"] = region), request(apiEndpoint, {
                method: "post",
                headers,
                body: JSON.stringify([{ Text: sample.text }]),
                form: {
                  "api-version": "3.0",
                  from: mapLanguageCodeForEngine("microsoft", sample.source),
                  to: mapLanguageCodeForEngine("microsoft", sample.target)
                }
              }, (error, response, body) => {
                if (!error && body && response && response && response.statusCode == 200)
                  try {
                    body = JSON.parse(body);
                    let translation = body && body[0] && body[0].translations && body[0].translations[0] && body[0].translations[0].text;
                    return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
                  } catch {
                  }
                return finish(!1, failMessage(response && response.statusCode, body), normalized);
              });
            }
            case "deepl": {
              let translateEndpoint = auth.paid ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
              return request(translateEndpoint, {
                method: "post",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `DeepL-Auth-Key ${apiKey}`
                },
                body: JSON.stringify({
                  text: [sample.text],
                  source_lang: mapLanguageCodeForEngine("deepl", sample.source),
                  target_lang: mapLanguageCodeForEngine("deepl", sample.target)
                })
              }, (error, response, body) => {
                if (!error && body && response && response && response.statusCode == 200)
                  try {
                    body = JSON.parse(body);
                    let translation = body && body.translations && body.translations[0] && body.translations[0].text;
                    return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
                  } catch {
                  }
                return finish(!1, failMessage(response && response.statusCode, body), normalized);
              });
            }
            case "openai":
              return request(apiEndpoint, {
                method: "post",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
                body: JSON.stringify({
                  model: modelId,
                  instructions: "You are a translation validator. Return only the translation.",
                  input: `Translate the following text from English to German.

${sample.text}`,
                  store: !1
                })
              }, (error, response, body) => {
                let translation = !error && response && response && response.statusCode == 200 ? parseOpenAiResponseText(body) : "";
                return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
              });
            case "gemini": {
              let geminiModelId = modelId.replace(/^models\//, ""), requestUrl = `${apiEndpoint}/${encodeURIComponent(geminiModelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
              return request(requestUrl, {
                method: "post",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  system_instruction: { parts: [{ text: "You are a translation validator. Return only the translation." }] },
                  contents: [{ role: "user", parts: [{ text: `Translate the following text from English to German.

${sample.text}` }] }]
                })
              }, (error, response, body) => {
                let translation = !error && response && response && response.statusCode == 200 ? parseGeminiResponseText(body) : "";
                return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
              });
            }
            case "deepseek":
            case "oaicompat":
              return request(apiEndpoint, {
                method: "post",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                  model: modelId,
                  messages: [{
                    role: "system",
                    content: "You are a translation validator."
                  }, {
                    role: "user",
                    content: `Translate the following text from English to German. Return only the translation.

${sample.text}`
                  }],
                  temperature: 0,
                  // Room for a reasoning model to think and still answer. At 32 the
                  // whole budget went to reasoning_content, content came back empty,
                  // and a perfectly good configuration reported validate_failed.
                  max_tokens: 512,
                  ...engineRequestExtras(engineKey)
                })
              }, (error, response, body) => {
                if (!error && body && response && response && response.statusCode == 200)
                  try {
                    body = JSON.parse(body);
                    let choice = body && body.choices && body.choices[0], message = choice && choice.message, translation = message && message.content;
                    if (translation && translation.trim()) return finish(!0, successMessage(translation.trim()), normalized);
                    let answeredWithoutContent = !!(message && message.reasoning_content) || !!(choice && choice.finish_reason == "length");
                    return finish(answeredWithoutContent, answeredWithoutContent ? successMessage("") : failMessage(response && response.statusCode, body), normalized);
                  } catch {
                  }
                return finish(!1, failMessage(response && response.statusCode, body), normalized);
              });
          }
          return finish(!1, `${engineLabel}: ${getCustomText("validate_failed")}`, normalized);
        });
      }
      __name(validateEngineConfig, "validateEngineConfig");
      function googleApiTranslate(data, callback) {
        request("https://translate.googleapis.com/translate_a/single", {
          form: {
            client: "gtx",
            dt: "t",
            dj: "1",
            source: "input",
            sl: data.input.id,
            tl: data.output.id,
            q: encodeURIComponent(data.text)
          }
        }, (error, response, body) => {
          let labels = getLabels(), languages = getLanguages();
          if (!error && body && response && response && response.statusCode == 200)
            try {
              body = JSON.parse(body), !data.specialCase && body.src && body.src && languages[body.src] && (data.input.id = body.src, data.input.name = languages[body.src].name, data.input.ownlang = languages[body.src].ownlang), callback(body.sentences.map((n) => n && n.trans).filter((n) => n).join(""));
            } catch {
              callback("");
            }
          else
            response && response && response.statusCode == 429 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_hourlylimit}`) : dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`), callback("");
        });
      }
      __name(googleApiTranslate, "googleApiTranslate");
      function googleCloudTranslate(data, callback) {
        let auth = getAuth("googlecloud"), apiKey = auth.key || "", apiEndpoint = auth.endpoint || translationEngines.googlecloud.endpoint, modelId = auth.model || translationEngines.googlecloud.model;
        request(apiEndpoint, {
          method: "post",
          form: Object.assign({
            key: apiKey,
            q: data.text,
            target: data.output.id,
            format: "text",
            model: modelId
          }, data.input.auto ? {} : { source: data.input.id })
        }, (error, response, body) => {
          let labels = getLabels(), languages = getLanguages();
          if (!error && body && response && response && response.statusCode == 200)
            try {
              body = JSON.parse(body);
              let translations = body && body.data && body.data.translations || [];
              !data.specialCase && translations[0] && translations[0].detectedSourceLanguage && languages[translations[0].detectedSourceLanguage] && (data.input.id = translations[0].detectedSourceLanguage, data.input.name = languages[translations[0].detectedSourceLanguage].name, data.input.ownlang = languages[translations[0].detectedSourceLanguage].ownlang), callback(translations.map((n) => n && n.translatedText).filter((n) => n).join(""));
            } catch {
              callback("");
            }
          else
            response && (response.statusCode == 401 || response && response && response.statusCode == 403) ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`) : response && response && response.statusCode == 429 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_hourlylimit}`) : dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`), callback("");
        });
      }
      __name(googleCloudTranslate, "googleCloudTranslate");
      function microsoftTranslate(data, callback) {
        let auth = getAuth("microsoft"), apiEndpoint = normalizeApiEndpoint("microsoft", auth.endpoint || translationEngines.microsoft.endpoint), apiKey = auth.key || "", region = auth.region || "", headers = {
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": apiKey
        };
        region && region != "global" && (headers["Ocp-Apim-Subscription-Region"] = region), request(apiEndpoint, {
          method: "post",
          headers,
          body: JSON.stringify([{ Text: data.text }]),
          form: Object.assign({
            "api-version": "3.0",
            to: mapLanguageCodeForEngine("microsoft", data.output.id)
          }, data.input.auto ? {} : { from: mapLanguageCodeForEngine("microsoft", data.input.id) })
        }, (error, response, body) => {
          let labels = getLabels(), languages = getLanguages();
          if (!error && body && response && response && response.statusCode == 200)
            try {
              body = JSON.parse(body)[0], !data.specialCase && body.detectedLanguage && body.detectedLanguage.language && languages[body.detectedLanguage.language.toLowerCase()] && (data.input.name = languages[body.detectedLanguage.language.toLowerCase()].name, data.input.ownlang = languages[body.detectedLanguage.language.toLowerCase()].ownlang), callback(body.translations.map((n) => n && n.text).filter((n) => n).join(""));
            } catch {
              callback("");
            }
          else
            response && response && response.statusCode == 403 || response && response && response.statusCode == 429 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_dailylimit}`) : response && response && response.statusCode == 401 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`) : dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`), callback("");
        });
      }
      __name(microsoftTranslate, "microsoftTranslate");
      function deepLTranslate(data, callback) {
        let auth = getAuth("deepl");
        request(auth.paid ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate", {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            Authorization: `DeepL-Auth-Key ${auth.key || ""}`
          },
          body: JSON.stringify(Object.assign({
            text: [data.text],
            target_lang: mapLanguageCodeForEngine("deepl", data.output.id)
          }, data.input.auto ? {} : { source_lang: mapLanguageCodeForEngine("deepl", data.input.id) }))
        }, (error, response, body) => {
          let labels = getLabels(), languages = getLanguages();
          if (!error && body && response && response && response.statusCode == 200)
            try {
              body = JSON.parse(body), !data.specialCase && body.translations[0] && body.translations[0].detected_source_language && languages[body.translations[0].detected_source_language.toLowerCase()] && (data.input.name = languages[body.translations[0].detected_source_language.toLowerCase()].name, data.input.ownlang = languages[body.translations[0].detected_source_language.toLowerCase()].ownlang), callback(body.translations.map((n) => n && n.text).filter((n) => n).join(""));
            } catch {
              callback("");
            }
          else
            response && response && response.statusCode == 429 || response && response && response.statusCode == 456 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_dailylimit}`) : response && response && response.statusCode == 403 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`) : dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`), callback("");
        });
      }
      __name(deepLTranslate, "deepLTranslate");
      function requestAiProviderTranslation(engineKey, url, options, parseResponse, callback) {
        requestWithTimeout(url, options, (error, response, body) => {
          if (!error && body && response && response && response.statusCode == 200) {
            let translatedText = parseResponse(body);
            if (translatedText) return callback(translatedText);
          }
          let engineName = translationEngines[engineKey] && translationEngines[engineKey].name || engineKey, details = getValidationErrorDetails(body);
          dangerToast(`${getLabels().toast_translating_failed} (${engineName})${details ? ` - ${details}` : ""}`), callback("");
        });
      }
      __name(requestAiProviderTranslation, "requestAiProviderTranslation");
      function openAiTranslate(data, callback) {
        let auth = getAuth("openai"), apiKey = auth.key || "", apiEndpoint = normalizeApiEndpoint("openai", auth.endpoint || translationEngines.openai.endpoint), modelId = auth.model || translationEngines.openai.model, prompt = buildAiProviderTranslationPrompt(data);
        requestAiProviderTranslation("openai", apiEndpoint, {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelId,
            instructions: prompt.system,
            input: prompt.prompt,
            store: !1
          })
        }, (body) => parseOpenAiResponseText(body), callback);
      }
      __name(openAiTranslate, "openAiTranslate");
      function geminiTranslate(data, callback) {
        let auth = getAuth("gemini"), apiKey = auth.key || "", apiEndpoint = normalizeApiEndpoint("gemini", auth.endpoint || translationEngines.gemini.endpoint), modelId = (auth.model || translationEngines.gemini.model).replace(/^models\//, ""), prompt = buildAiProviderTranslationPrompt(data), requestUrl = `${apiEndpoint}/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        requestAiProviderTranslation("gemini", requestUrl, {
          method: "post",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: prompt.system }] },
            contents: [{ role: "user", parts: [{ text: prompt.prompt }] }],
            generationConfig: { temperature: 0.2, topP: 0.8 }
          })
        }, (body) => parseGeminiResponseText(body), callback);
      }
      __name(geminiTranslate, "geminiTranslate");
      function chatCompletionsTranslate(engineKey, data, callback) {
        if (!isEngineConfiguredForRuntime(engineKey)) return callback("");
        let auth = getAuth(engineKey), apiKey = auth.key || "", apiEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey].endpoint), modelId = auth.model || translationEngines[engineKey].model, prompt = buildAiProviderTranslationPrompt(data);
        requestAiProviderTranslation(engineKey, apiEndpoint, {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.prompt }
            ],
            temperature: 0.2,
            top_p: 0.8,
            ...engineRequestExtras(engineKey)
          })
        }, (body) => parseOpenAiResponseText(body).replace(/\[NEWLINE\]/g, `
`), callback);
      }
      __name(chatCompletionsTranslate, "chatCompletionsTranslate");
      function deepSeekTranslate(data, callback) {
        return chatCompletionsTranslate("deepseek", data, callback);
      }
      __name(deepSeekTranslate, "deepSeekTranslate");
      function openAiCompatibleTranslate(data, callback) {
        return chatCompletionsTranslate("oaicompat", data, callback);
      }
      __name(openAiCompatibleTranslate, "openAiCompatibleTranslate");
      function iTranslateTranslate(data, callback) {
        let translate2 = /* @__PURE__ */ __name((_) => {
          request("https://web-api.itranslateapp.com/v3/texts/translate", {
            method: "post",
            headers: {
              "API-KEY": getAuth("itranslate").key || data.engine.APIkey
            },
            body: JSON.stringify({
              source: {
                dialect: data.input.id,
                text: data.text
              },
              target: {
                dialect: data.output.id
              }
            })
          }, (error, response, body) => {
            let labels = getLabels(), languages = getLanguages();
            if (!error && response && response && response.statusCode == 200)
              try {
                body = JSON.parse(body), !data.specialCase && body.source && body.source.dialect && languages[body.source.dialect] && (data.input.id = body.source.dialect, data.input.name = languages[body.source.dialect].name, data.input.ownlang = languages[body.source.dialect].ownlang), callback(body.target.text);
              } catch {
                callback("");
              }
            else
              response && response && response.statusCode == 429 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_dailylimit}`) : response && response && response.statusCode == 403 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`) : dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`), callback("");
          });
        }, "translate");
        getAuth("itranslate").key || data.engine.APIkey ? translate2() : request("https://www.itranslate.com/js/webapp/main.js", { gzip: !0 }, (error, response, body) => {
          if (!error && body) {
            let APIkey = /var API_KEY = "(.+)"/.exec(body);
            APIkey ? (data.engine.APIkey = APIkey[1], translate2()) : callback("");
          } else callback("");
        });
      }
      __name(iTranslateTranslate, "iTranslateTranslate");
      function yandexTranslate(data, callback) {
        request("https://translate.yandex.net/api/v1.5/tr/translate", {
          form: {
            key: getAuth("yandex").key || "",
            text: encodeURIComponent(data.text),
            lang: data.specialCase || data.input.auto ? data.output.id : data.input.id + "-" + data.output.id,
            options: "1"
          }
        }, (error, response, body) => {
          let labels = getLabels(), languages = getLanguages();
          if (!error && body && response && response && response.statusCode == 200)
            try {
              let parsed = createElementFromHtml(body), translation = parsed && parsed.querySelector("text"), detected = parsed && parsed.querySelector("detected");
              if (translation && detected) {
                let detectedLang = detected.getAttribute("lang");
                !data.specialCase && detectedLang && languages[detectedLang] && (data.input.name = languages[detectedLang].name, data.input.ownlang = languages[detectedLang].ownlang), callback(translation.innerText);
              } else callback("");
            } catch {
              callback("");
            }
          else body && body.indexOf('code="408"') > -1 ? (dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_monthlylimit}`), callback("")) : (dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}/${labels.error_keyoutdated}`), callback(""));
        });
      }
      __name(yandexTranslate, "yandexTranslate");
      function papagoTranslate(data, callback) {
        let credentials = (getAuth("papago").key || "").split(" "), doTranslate = /* @__PURE__ */ __name((langCode) => {
          request("https://openapi.naver.com/v1/papago/n2mt", {
            method: "post",
            headers: {
              "X-Naver-Client-Id": credentials[0],
              "X-Naver-Client-Secret": credentials[1],
              "Content-Type": "application/x-www-form-urlencoded"
            },
            form: {
              source: langCode,
              target: data.output.id,
              text: data.text
            }
          }, (error, response, body) => {
            let labels = getLabels();
            if (!error && body && response && response && response.statusCode == 200)
              try {
                let message = (JSON.parse(body) || {}).message, result = message && (message.body || message.result);
                result && result.translatedText ? callback(result.translatedText) : callback("");
              } catch {
                callback("");
              }
            else
              response && response && response.statusCode == 429 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_hourlylimit}`) : dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}/${labels.error_keyoutdated}`), callback("");
          });
        }, "doTranslate");
        data.input.auto ? request("https://openapi.naver.com/v1/papago/detectLangs", {
          method: "post",
          headers: {
            "X-Naver-Client-Id": credentials[0],
            "X-Naver-Client-Secret": credentials[1],
            "Content-Type": "application/x-www-form-urlencoded"
          },
          form: {
            query: data.text
          }
        }, (error, response, body) => {
          let languages = getLanguages(), langCode = "en";
          if (!error && body && response && response && response.statusCode == 200)
            try {
              langCode = JSON.parse(body).langCode;
            } catch {
              langCode = "en";
            }
          data.input.name = languages[langCode].name, data.input.ownlang = languages[langCode].ownlang, doTranslate(langCode);
        }) : doTranslate(data.input.id);
      }
      __name(papagoTranslate, "papagoTranslate");
      function baiduTranslate(data, callback) {
        let credentials = (getAuth("baidu").key || "").split(" "), salt = generateId();
        request("https://fanyi-api.baidu.com/api/trans/vip/translate", {
          bdVersion: !0,
          method: "post",
          form: {
            from: translationEngines.baidu.parser[data.input.id] || data.input.id,
            to: translationEngines.baidu.parser[data.output.id] || data.output.id,
            q: encodeURIComponent(data.text),
            appid: credentials[0],
            salt,
            sign: MD5(credentials[0] + data.text + salt + (credentials[2] || credentials[1]))
          }
        }, (error, response, result) => {
          let labels = getLabels();
          if (!error && result && response && response && response.statusCode == 200)
            try {
              if (result = JSON.parse(result) || {}, result.error_code)
                result.error_code == 54004 ? dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_monthlylimit}.`) : dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${result.error_code} : ${result.error_msg}.`), callback("");
              else {
                let messages = result.trans_result;
                messages && messages.length > 0 && result.from != result.to ? callback(messages.map((message) => decodeURIComponent(message.dst)).join(`
`)) : callback("");
              }
            } catch {
              callback("");
            }
          else
            dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`), callback("");
        });
      }
      __name(baiduTranslate, "baiduTranslate");
      let engineAdapters = {
        googleApiTranslate,
        googleCloudTranslate,
        microsoftTranslate,
        deepLTranslate,
        deepSeekTranslate,
        openAiTranslate,
        geminiTranslate,
        openAiCompatibleTranslate,
        iTranslateTranslate,
        yandexTranslate,
        papagoTranslate,
        baiduTranslate
      };
      function getEngineAdapter(engineKey) {
        let engine = translationEngines[engineKey];
        return engine && engineAdapters[engine.funcName] || null;
      }
      __name(getEngineAdapter, "getEngineAdapter");
      function translate(engineKey, data, callback) {
        let adapter = getEngineAdapter(engineKey);
        return adapter ? adapter(data, callback) : callback("");
      }
      __name(translate, "translate");
      function requestAiBatchTranslationDetailed(engineKey, preparedItems) {
        return new Promise((resolve) => {
          let finishFailure = /* @__PURE__ */ __name((failureKind, statusCode = null) => resolve({ translations: null, failureKind, statusCode }), "finishFailure");
          if (!engineKey || !preparedItems || !preparedItems.length || !isEngineConfiguredForRuntime(engineKey)) return finishFailure("configuration");
          let auth = getAuth(engineKey), apiKey = auth.key || "", apiEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey].endpoint), modelId = auth.model || translationEngines[engineKey].model, output = preparedItems[0].output, input = preparedItems[0].input, payloadItems = preparedItems.map((item) => ({
            id: String(item.message.id),
            text: item.protectedText.replace(/\n/g, " [NEWLINE] ").replace(/\s+/g, " ")
          })), systemPrompt = "You are a strict Discord chat batch translator. Return valid JSON only.", batchChannelId = preparedItems[0].channelId || null, decisionRules = shouldUseAiAutoTranslateDecision(batchChannelId) ? `Apply these skip rules to every message; when a message should not be translated set its "translation" to exactly ${AI_SKIP_TRANSLATION_TOKEN}.
${getAiAutoTranslatePrompt({ input, output })}` : "The plugin has already filtered messages that should be skipped; do not make skip decisions.", batchPrompt = `Target language is exactly ${output.name || output.id}. Input language is ${input && input.auto ? "auto-detect" : input.name || input.id || "auto"}. ${decisionRules}
Rules:
1. Return ONLY a JSON array. Each item must be {"id":"same id","translation":"translated text"}.
2. Translate every provided natural-language message into exactly the target language.
3. Preserve placeholders like ⟦0⟧ and ⟦DTA0⟧ exactly. Preserve URLs, code, emoji, mentions, IDs, and product/model names.
4. Convert [NEWLINE] markers back to real line breaks in the translation; do not show [NEWLINE] literally.
5. Do not omit any source content, including short interjections, laughter, particles, repeated words, or standalone short lines; translate or preserve them naturally in the target language.
6. Do not add explanations. Do not output any language other than the target language except preserved protected content.

Messages JSON:
${JSON.stringify(payloadItems)}`, finishResponse = /* @__PURE__ */ __name((error, response, body, parseResponseText) => {
            let statusCode = response && response.statusCode || null;
            if (!error && response && statusCode == 200) {
              let translations = parseAiBatchTranslationResponse(parseResponseText(body), payloadItems.map((item) => item.id));
              return translations === null ? finishFailure("malformed", statusCode) : resolve({ translations, failureKind: null, statusCode });
            }
            if (statusCode == 401 || statusCode == 403) {
              let labels = getLabels();
              return dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`), finishFailure("auth", statusCode);
            }
            return error || !response || statusCode == 408 || statusCode == 429 || statusCode >= 500 ? finishFailure("transient", statusCode) : finishFailure("permanent", statusCode);
          }, "finishResponse");
          if (engineKey == "openai")
            return requestWithTimeout(apiEndpoint, {
              method: "post",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({ model: modelId, instructions: systemPrompt, input: batchPrompt, store: !1 })
            }, (error, response, body) => finishResponse(error, response, body, parseOpenAiResponseText));
          if (engineKey == "gemini") {
            let geminiModelId = String(modelId || "").replace(/^models\//, ""), requestUrl = `${apiEndpoint}/${encodeURIComponent(geminiModelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            return requestWithTimeout(requestUrl, {
              method: "post",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts: [{ text: batchPrompt }] }], generationConfig: { temperature: 0.1, topP: 0.8 } })
            }, (error, response, body) => finishResponse(error, response, body, parseGeminiResponseText));
          }
          requestWithTimeout(apiEndpoint, {
            method: "post",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model: modelId, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: batchPrompt }], temperature: 0.1, top_p: 0.8, ...engineRequestExtras(engineKey) })
          }, (error, response, body) => finishResponse(error, response, body, parseOpenAiResponseText));
        });
      }
      __name(requestAiBatchTranslationDetailed, "requestAiBatchTranslationDetailed");
      function requestAiBatchTranslation(engineKey, preparedItems) {
        return requestAiBatchTranslationDetailed(engineKey, preparedItems).then((outcome) => outcome.translations);
      }
      return __name(requestAiBatchTranslation, "requestAiBatchTranslation"), Object.freeze({
        translationEngines,
        enginePortals,
        MD5,
        translate,
        getEngineAdapter,
        googleApiTranslate,
        googleCloudTranslate,
        microsoftTranslate,
        deepLTranslate,
        deepSeekTranslate,
        openAiTranslate,
        geminiTranslate,
        openAiCompatibleTranslate,
        iTranslateTranslate,
        yandexTranslate,
        papagoTranslate,
        baiduTranslate,
        chatCompletionsTranslate,
        requestAiProviderTranslation,
        requestAiBatchTranslation,
        requestAiBatchTranslationDetailed,
        normalizeApiEndpoint,
        getModelCatalogEndpoint,
        mapLanguageCodeForEngine,
        getValidationRequestForEngine,
        getValidationErrorDetails,
        isValidatableEngine,
        supportsModelCatalog,
        buildAiProviderTranslationPrompt,
        parseOpenAiResponseText,
        parseGeminiResponseText,
        parseAiBatchTranslationResponse,
        isEngineConfiguredForRuntime,
        requestWithTimeout,
        scheduleBackoff,
        awaitBackoff,
        getBackoffUntil: /* @__PURE__ */ __name(() => backoffUntil || 0, "getBackoffUntil"),
        getBackoffStep: /* @__PURE__ */ __name(() => backoffStep, "getBackoffStep"),
        isBackoffActive: /* @__PURE__ */ __name(() => now() < (backoffUntil || 0), "isBackoffActive"),
        // Nothing clears the window today; a client is per plugin instance, so a restart
        // is the only reset the runtime has ever had.
        resetBackoff() {
          backoffUntil = 0, backoffStep = 0;
        },
        getModelCatalogState: /* @__PURE__ */ __name(() => modelCatalogState, "getModelCatalogState"),
        clearModelCatalogState() {
          modelCatalogState = {};
        },
        fetchModelCatalog,
        validateEngineConfig
      });
    }
    __name(createProviderClient, "createProviderClient");
    module2.exports = {
      AI_SKIP_TRANSLATION_TOKEN,
      PROVIDER_REQUEST_TIMEOUT_MS: 3e4,
      PROVIDER_RATE_LIMIT_BACKOFF_MS: 5e3,
      PROVIDER_SERVER_ERROR_BACKOFF_MS: 2e3,
      PROVIDER_BACKOFF_MAX_STEP: 4,
      PROVIDER_BACKOFF_MAX_MS: 6e4,
      CREDENTIAL_REQUIRED_ENGINES,
      VALIDATABLE_ENGINES,
      AI_MODEL_ENGINES,
      translationEngines,
      enginePortals,
      MD5,
      normalizeApiEndpoint,
      getModelCatalogEndpoint,
      mapLanguageCodeForEngine,
      getValidationRequestForEngine,
      getValidationErrorDetails,
      isValidatableEngine,
      supportsModelCatalog,
      buildAiProviderTranslationPrompt,
      parseOpenAiResponseText,
      parseGeminiResponseText,
      parseAiBatchTranslationResponse,
      createProviderClient
    };
  }
});

// src/ui/settings-panel.js
var require_settings_panel = __commonJS({
  "src/ui/settings-panel.js"(exports2, module2) {
    var { translationEngines, enginePortals } = require_provider_client(), languageTypes = Object.freeze({ INPUT: "input", OUTPUT: "output" }), messageTypes = Object.freeze({ RECEIVED: "received", SENT: "sent" });
    function renderBdfdbLoadingPanel() {
      let panel = document.createElement("div");
      return panel.style.color = "var(--text-normal)", panel.style.fontSize = "16px", panel.style.lineHeight = "22px", panel.style.whiteSpace = "pre-wrap", panel.textContent = `BDFDB 正在加载，请稍后重新打开设置。
BDFDB is loading. Please reopen settings in a few seconds.`, panel;
    }
    __name(renderBdfdbLoadingPanel, "renderBdfdbLoadingPanel");
    function renderSettingsPanel(plugin, collapseStates = {}, dependencies = {}) {
      let { BDFDB } = dependencies;
      if (typeof window > "u" || !window.BDFDB_Global || !window.BDFDB_Global.loaded) return renderBdfdbLoadingPanel();
      let settingsPanel;
      return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(plugin, {
        collapseStates,
        children: /* @__PURE__ */ __name((_) => {
          let settingsItems = [], buildId = plugin.getBuildId && plugin.getBuildId();
          settingsItems.push(BDFDB.ReactUtils.createElement("div", {
            className: "translator-settings-note",
            children: `v${plugin.getVersion()}${buildId ? ` · build ${buildId}` : ""}`
          }));
          let recommendedEngines = ["microsoft", "googlecloud", "googleapi", "deepseek", "openai", "gemini", "oaicompat"], getSettingsPanelRoot = /* @__PURE__ */ __name(() => document.querySelector(".translator-settings-panel-root"), "getSettingsPanelRoot"), isScrollableElement = /* @__PURE__ */ __name((node) => {
            if (!node || node == document || node == document.body || node == document.documentElement || typeof node.scrollTop != "number" || typeof node.scrollHeight != "number" || typeof node.clientHeight != "number" || node.scrollHeight <= node.clientHeight + 1) return !1;
            let overflowY = "";
            try {
              let style = window.getComputedStyle(node);
              overflowY = style && style.overflowY || "";
            } catch {
            }
            return overflowY != "visible" && overflowY != "clip" || node.scrollTop > 0;
          }, "isScrollableElement"), getSettingsPanelScrollElements = /* @__PURE__ */ __name((root) => {
            let scrollers = [], addScroller = /* @__PURE__ */ __name((node) => {
              node && isScrollableElement(node) && !scrollers.includes(node) && scrollers.push(node);
            }, "addScroller"), current = root;
            for (; current && current.parentElement; )
              addScroller(current), current = current.parentElement;
            addScroller(current);
            try {
              for (let node of document.querySelectorAll("div"))
                node.scrollTop > 0 && addScroller(node);
            } catch {
            }
            return scrollers;
          }, "getSettingsPanelScrollElements"), captureSettingsPanelScrollState = /* @__PURE__ */ __name(() => {
            let root = getSettingsPanelRoot();
            if (!root) return null;
            let scrollers = getSettingsPanelScrollElements(root);
            return scrollers.length ? {
              items: scrollers.map((scroller) => ({
                scroller,
                scrollTop: scroller.scrollTop,
                scrollLeft: scroller.scrollLeft
              })),
              windowX: typeof window < "u" ? window.scrollX : 0,
              windowY: typeof window < "u" ? window.scrollY : 0
            } : null;
          }, "captureSettingsPanelScrollState"), applySettingsPanelScrollState = /* @__PURE__ */ __name((scrollState) => {
            if (!(!scrollState || !scrollState.items)) {
              for (let item of scrollState.items) {
                if (!item || !item.scroller) continue;
                let maxScrollTop = Math.max(0, item.scroller.scrollHeight - item.scroller.clientHeight), maxScrollLeft = Math.max(0, item.scroller.scrollWidth - item.scroller.clientWidth);
                item.scroller.scrollTop = Math.max(0, Math.min(item.scrollTop, maxScrollTop)), item.scroller.scrollLeft = Math.max(0, Math.min(item.scrollLeft || 0, maxScrollLeft));
              }
              typeof window < "u" && window.scrollTo(scrollState.windowX || 0, scrollState.windowY || 0);
            }
          }, "applySettingsPanelScrollState"), restoreSettingsPanelScrollState = /* @__PURE__ */ __name((scrollState) => {
            scrollState && (applySettingsPanelScrollState(scrollState), requestAnimationFrame(() => {
              applySettingsPanelScrollState(scrollState), requestAnimationFrame(() => applySettingsPanelScrollState(scrollState));
            }));
          }, "restoreSettingsPanelScrollState"), refreshPanel = /* @__PURE__ */ __name(() => {
            let scrollState = captureSettingsPanelScrollState();
            BDFDB.PluginUtils.refreshSettingsPanel(plugin, settingsPanel, collapseStates), restoreSettingsPanelScrollState(scrollState);
          }, "refreshPanel"), saveAuthField = /* @__PURE__ */ __name((engineKey, field, value) => {
            plugin.ensureSettingsStore().setCredentialField(engineKey, field, value), plugin.SettingsUpdated = !0;
          }, "saveAuthField"), saveReceivedFilterSetting = /* @__PURE__ */ __name((key, value) => {
            saveFilterSetting(key, value);
          }, "saveReceivedFilterSetting"), infoText = /* @__PURE__ */ __name((text) => BDFDB.ReactUtils.createElement("div", {
            className: "translator-settings-note",
            children: text
          }), "infoText"), isChineseUi = plugin.isChineseUiLanguage(), isRussianUi = plugin.isRussianUiLanguage(), compactText = /* @__PURE__ */ __name((zh, en, ru = null) => isChineseUi ? zh : isRussianUi && ru || en, "compactText"), getEnginePortalConfig = /* @__PURE__ */ __name((engineKey) => {
            let portal = enginePortals[engineKey];
            return portal ? {
              primaryUrl: portal.primaryUrl,
              primaryLabel: isChineseUi ? portal.primaryLabelZh : portal.primaryLabelEn,
              secondaryUrl: portal.secondaryUrl,
              secondaryLabel: isChineseUi ? portal.secondaryLabelZh : portal.secondaryLabelEn,
              hint: isChineseUi ? portal.hintZh : portal.hintEn
            } : null;
          }, "getEnginePortalConfig"), defaultSecondaryButtonColor = BDFDB.LibraryComponents.Button.Colors.PRIMARY || BDFDB.LibraryComponents.Button.Colors.GREY || void 0, createActionButton = /* @__PURE__ */ __name(({ label, onClick, color = void 0, look = null, className = null }) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
            size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
            color: color === null ? void 0 : color || defaultSecondaryButtonColor,
            look: look || void 0,
            className,
            onClick,
            children: label
          }), "createActionButton"), stableSelectScrollState = null, stableSelectScrollIntoViewOriginal = null, stableSelectScrollLockTimer = null, restoreStableSelectScrollIntoView = /* @__PURE__ */ __name((_2) => {
            try {
              stableSelectScrollIntoViewOriginal && typeof Element < "u" && Element.prototype.scrollIntoView != stableSelectScrollIntoViewOriginal && (Element.prototype.scrollIntoView = stableSelectScrollIntoViewOriginal);
            } catch {
            }
            stableSelectScrollIntoViewOriginal = null;
          }, "restoreStableSelectScrollIntoView"), lockStableSelectScrollIntoView = /* @__PURE__ */ __name((duration = 900) => {
            try {
              if (typeof Element > "u" || !Element.prototype || typeof Element.prototype.scrollIntoView != "function") return;
              stableSelectScrollIntoViewOriginal || (stableSelectScrollIntoViewOriginal = Element.prototype.scrollIntoView, Element.prototype.scrollIntoView = function() {
                if (!(this && this.closest && this.closest(".translator-settings-panel-root")))
                  return stableSelectScrollIntoViewOriginal.apply(this, arguments);
              }), stableSelectScrollLockTimer && clearTimeout(stableSelectScrollLockTimer), stableSelectScrollLockTimer = setTimeout(restoreStableSelectScrollIntoView, duration);
            } catch {
            }
          }, "lockStableSelectScrollIntoView"), restoreStableSelectScroll = /* @__PURE__ */ __name((scrollState, repeat = !1) => {
            if (!scrollState) return;
            let apply = /* @__PURE__ */ __name((_2) => restoreSettingsPanelScrollState(scrollState), "apply");
            requestAnimationFrame(apply), setTimeout(apply, 0), repeat && [16, 40, 80, 160, 320, 520].forEach((delay) => setTimeout(apply, delay));
          }, "restoreStableSelectScroll"), createStableSelect = /* @__PURE__ */ __name((props) => {
            let getScrollState = /* @__PURE__ */ __name((_2) => stableSelectScrollState || captureSettingsPanelScrollState(), "getScrollState"), rememberScroll = /* @__PURE__ */ __name((_2) => (stableSelectScrollState = captureSettingsPanelScrollState(), stableSelectScrollState), "rememberScroll"), rememberAndSoftRestore = /* @__PURE__ */ __name((repeat = !1) => {
              let scrollState = rememberScroll();
              return lockStableSelectScrollIntoView(repeat ? 1200 : 700), restoreStableSelectScroll(scrollState, repeat), scrollState;
            }, "rememberAndSoftRestore"), callHandler = /* @__PURE__ */ __name((name, event) => {
              if (props && typeof props[name] == "function") return props[name](event);
            }, "callHandler"), captureOnly = /* @__PURE__ */ __name((_2) => {
              rememberScroll(), lockStableSelectScrollIntoView(900);
            }, "captureOnly"), selectProps = Object.assign({
              menuShouldScrollIntoView: !1,
              menuShouldBlockScroll: !1,
              captureMenuScroll: !1,
              menuPosition: "fixed",
              menuPlacement: "auto",
              menuPortalTarget: typeof document < "u" ? document.body : void 0,
              closeMenuOnSelect: !0,
              maxMenuHeight: typeof window < "u" ? Math.max(150, Math.min(240, Math.floor(window.innerHeight * 0.36))) : 220
            }, props);
            return selectProps.onMouseDown = (event) => {
              rememberAndSoftRestore(!0), callHandler("onMouseDown", event);
            }, selectProps.onPointerDown = (event) => {
              rememberAndSoftRestore(!0), callHandler("onPointerDown", event);
            }, selectProps.onClick = (event) => {
              rememberAndSoftRestore(!0), callHandler("onClick", event);
            }, selectProps.onKeyDown = (event) => {
              event && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key) && rememberAndSoftRestore(!0), callHandler("onKeyDown", event);
            }, selectProps.onFocus = (event) => {
              rememberAndSoftRestore(!0), callHandler("onFocus", event);
            }, selectProps.onMenuOpen = (_2) => {
              rememberAndSoftRestore(!0), callHandler("onMenuOpen");
            }, selectProps.onMenuClose = (_2) => {
              let scrollState = getScrollState();
              callHandler("onMenuClose"), restoreStableSelectScroll(scrollState, !0), setTimeout((_3) => {
                stableSelectScrollState = null;
              }, 450);
            }, BDFDB.ReactUtils.createElement("div", {
              className: "translator-stable-select-wrap",
              onMouseDownCapture: captureOnly,
              onPointerDownCapture: captureOnly,
              onFocusCapture: captureOnly,
              children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Select, selectProps)
            });
          }, "createStableSelect"), createSegmentedSelector = /* @__PURE__ */ __name(({ options, value, onChange, className = "" }) => BDFDB.ReactUtils.createElement("div", {
            className: BDFDB.DOMUtils.formatClassName("translator-segmented-group", className),
            children: options.map((option) => BDFDB.ReactUtils.createElement("button", {
              type: "button",
              disabled: !!option.disabled,
              className: BDFDB.DOMUtils.formatClassName("translator-segmented-button", option.value == value && "translator-segmented-button-active", option.disabled && "translator-segmented-button-disabled"),
              onClick: /* @__PURE__ */ __name((_2) => !option.disabled && onChange(option.value), "onClick"),
              children: option.label
            }))
          }), "createSegmentedSelector"), ensureSecretInputState = /* @__PURE__ */ __name(() => (plugin.secretInputState || (plugin.secretInputState = {}), plugin.secretInputState), "ensureSecretInputState"), isSecretFieldVisible = /* @__PURE__ */ __name((fieldKey) => !!ensureSecretInputState()[fieldKey], "isSecretFieldVisible"), toggleSecretFieldVisibility = /* @__PURE__ */ __name((fieldKey) => {
            let secretState = ensureSecretInputState();
            secretState[fieldKey] = !secretState[fieldKey], refreshPanel();
          }, "toggleSecretFieldVisibility"), createSecretToggleIcon = /* @__PURE__ */ __name((visible) => BDFDB.ReactUtils.createElement("svg", {
            viewBox: "0 0 24 24",
            width: 18,
            height: 18,
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 1.8,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": !0,
            children: [
              BDFDB.ReactUtils.createElement("path", { d: "M2.2 12s3.6-5.8 9.8-5.8S21.8 12 21.8 12 18.2 17.8 12 17.8 2.2 12 2.2 12Z", key: "outline" }),
              BDFDB.ReactUtils.createElement("circle", { cx: "12", cy: "12", r: "2.6", key: "pupil" }),
              !visible && BDFDB.ReactUtils.createElement("path", { d: "M4 19.2 19.2 4", key: "slash" })
            ].filter(Boolean)
          }), "createSecretToggleIcon"), createSecretInput = /* @__PURE__ */ __name(({ fieldKey, placeholder, value, onChange }) => BDFDB.ReactUtils.createElement("div", {
            className: "translator-secret-input-row",
            children: [
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                className: "translator-secret-input",
                type: isSecretFieldVisible(fieldKey) ? "text" : "password",
                placeholder,
                value,
                onChange
              }),
              BDFDB.ReactUtils.createElement("button", {
                type: "button",
                className: "translator-secret-toggle",
                "aria-label": isSecretFieldVisible(fieldKey) ? plugin.getCustomText("hide_secret_label") : plugin.getCustomText("show_secret_label"),
                title: isSecretFieldVisible(fieldKey) ? plugin.getCustomText("hide_secret_label") : plugin.getCustomText("show_secret_label"),
                onClick: /* @__PURE__ */ __name((_2) => toggleSecretFieldVisibility(fieldKey), "onClick"),
                children: createSecretToggleIcon(isSecretFieldVisible(fieldKey))
              })
            ]
          }), "createSecretInput"), createExceptionScopeSwitches = /* @__PURE__ */ __name((sentKey, receivedKey, sentLabelKey, receivedLabelKey) => BDFDB.ReactUtils.createElement("div", {
            className: "translator-settings-switch-group",
            children: [
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                type: "Switch",
                className: "translator-settings-switch-row",
                label: plugin.getCustomText(sentLabelKey),
                tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
                value: plugin.getExceptionScopeSetting(sentKey, !0),
                onChange: /* @__PURE__ */ __name((value) => {
                  plugin.settings.exceptions || (plugin.settings.exceptions = {}), plugin.settings.exceptions[sentKey] = !!value, BDFDB.DataUtils.save(!!value, plugin, "exceptions", sentKey), plugin.SettingsUpdated = !0;
                }, "onChange")
              }),
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                type: "Switch",
                className: "translator-settings-switch-row",
                label: plugin.getCustomText(receivedLabelKey),
                tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
                value: plugin.getExceptionScopeSetting(receivedKey, !0),
                onChange: /* @__PURE__ */ __name((value) => {
                  plugin.settings.exceptions || (plugin.settings.exceptions = {}), plugin.settings.exceptions[receivedKey] = !!value, BDFDB.DataUtils.save(!!value, plugin, "exceptions", receivedKey), plugin.SettingsUpdated = !0;
                }, "onChange")
              })
            ]
          }), "createExceptionScopeSwitches"), createStackedTokenInput = /* @__PURE__ */ __name(({ items, maxLength, placeholder, emptyText, onChange }) => BDFDB.ReactUtils.createElement(class extends BdApi.React.Component {
            constructor(props) {
              super(props), this.state = {
                value: "",
                items: BDFDB.ArrayUtils.is(props.items) ? [].concat(props.items) : []
              };
            }
            componentDidUpdate(prevProps) {
              let previousItems = BDFDB.ArrayUtils.is(prevProps.items) ? prevProps.items : [], nextItems = BDFDB.ArrayUtils.is(this.props.items) ? this.props.items : [];
              JSON.stringify(previousItems) != JSON.stringify(nextItems) && this.setState({ items: [].concat(nextItems) });
            }
            commitValue(rawValue) {
              let value = String(rawValue ?? this.state.value).trim();
              if (!value) return;
              typeof this.props.maxLength == "number" && this.props.maxLength > 0 && (value = value.slice(0, this.props.maxLength));
              let currentItems = BDFDB.ArrayUtils.is(this.state.items) ? this.state.items : [];
              if (currentItems.includes(value)) {
                this.setState({ value: "" });
                return;
              }
              let nextItems = [].concat(currentItems, value);
              this.setState({ value: "", items: nextItems }), this.props.onChange(nextItems);
            }
            removeItem(targetItem) {
              let nextItems = (BDFDB.ArrayUtils.is(this.state.items) ? this.state.items : []).filter((item) => item != targetItem);
              this.setState({ items: nextItems }), this.props.onChange(nextItems);
            }
            render() {
              let currentItems = BDFDB.ArrayUtils.is(this.state.items) ? this.state.items : [];
              return BDFDB.ReactUtils.createElement("div", {
                className: "translator-token-editor",
                children: [
                  BDFDB.ReactUtils.createElement("div", {
                    className: "translator-token-list",
                    children: currentItems.length ? currentItems.map((item) => BDFDB.ReactUtils.createElement("div", {
                      className: "translator-token-badge",
                      key: item,
                      children: [
                        BDFDB.ReactUtils.createElement("span", {
                          className: "translator-token-badge-text",
                          children: item
                        }),
                        BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
                          className: "translator-token-badge-delete",
                          name: BDFDB.LibraryComponents.SvgIcon.Names.CLOSE,
                          onClick: /* @__PURE__ */ __name((_2) => this.removeItem(item), "onClick")
                        })
                      ]
                    })) : BDFDB.ReactUtils.createElement("div", {
                      className: "translator-token-empty",
                      children: emptyText || placeholder
                    })
                  }),
                  BDFDB.ReactUtils.createElement("div", {
                    className: "translator-token-input-row",
                    children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                      value: this.state.value,
                      placeholder,
                      maxLength,
                      onChange: /* @__PURE__ */ __name((value) => this.setState({ value }), "onChange"),
                      onKeyDown: /* @__PURE__ */ __name((event) => {
                        event.which == 13 && (event.preventDefault(), this.commitValue());
                      }, "onKeyDown"),
                      onBlur: /* @__PURE__ */ __name((_2) => this.commitValue(), "onBlur")
                    })
                  })
                ]
              });
            }
          }, { items, maxLength, placeholder, emptyText, onChange }), "createStackedTokenInput"), createDisablePrefixForm = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("disable_prefix_title"),
            className: BDFDB.disCN.marginbottom8,
            children: [
              infoText(plugin.getCustomText("disable_prefix_hint")),
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ListInput, {
                placeholder: plugin.getCustomText("disable_prefix_placeholder"),
                maxLength: plugin.defaults.exceptions.wordStart.max,
                items: plugin.settings.exceptions.wordStart,
                onChange: /* @__PURE__ */ __name((value) => {
                  plugin.SettingsUpdated = !0, BDFDB.DataUtils.save(value, plugin, "exceptions", "wordStart");
                }, "onChange")
              })
            ]
          }), "createDisablePrefixForm"), createProtectedTermsForm = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("protected_terms_title"),
            className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.marginbottom8, "translator-advanced-protection-section translator-advanced-protection-terms"),
            children: [
              infoText(plugin.getCustomText("protected_terms_hint")),
              createExceptionScopeSwitches("protectedTermsForSent", "protectedTermsForReceived", "protected_terms_scope_sent", "protected_terms_scope_received"),
              createStackedTokenInput({
                placeholder: plugin.getCustomText("protected_terms_placeholder"),
                emptyText: plugin.getCustomText("protected_terms_placeholder"),
                maxLength: plugin.defaults.exceptions.protectedTerms.max,
                items: plugin.settings.exceptions.protectedTerms || [],
                onChange: /* @__PURE__ */ __name((value) => {
                  let nextValue = BDFDB.ArrayUtils.is(value) ? [].concat(value) : [];
                  plugin.settings.exceptions.protectedTerms = nextValue, plugin.SettingsUpdated = !0, BDFDB.DataUtils.save(nextValue, plugin, "exceptions", "protectedTerms");
                }, "onChange")
              })
            ]
          }), "createProtectedTermsForm"), createWrapperPairsForm = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("wrapper_pairs_title"),
            className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.marginbottom8, "translator-advanced-protection-section translator-advanced-protection-wrapper"),
            children: [
              infoText(plugin.getCustomText("wrapper_pairs_hint")),
              createExceptionScopeSwitches("wrapperPairsForSent", "wrapperPairsForReceived", "wrapper_pairs_scope_sent", "wrapper_pairs_scope_received"),
              createStackedTokenInput({
                placeholder: plugin.getCustomText("wrapper_pairs_placeholder"),
                emptyText: plugin.getCustomText("wrapper_pairs_placeholder"),
                maxLength: plugin.defaults.exceptions.wrapperPairs.max,
                items: plugin.getWrapperPairItemsForSettings(),
                onChange: /* @__PURE__ */ __name((value) => {
                  let nextValue = (BDFDB.ArrayUtils.is(value) ? value : []).filter((rule) => !plugin.isDiscordSpoilerWrapperRule(rule));
                  plugin.settings.exceptions.wrapperPairs = [].concat(nextValue), plugin.SettingsUpdated = !0, BDFDB.DataUtils.save(nextValue, plugin, "exceptions", "wrapperPairs");
                }, "onChange")
              })
            ]
          }), "createWrapperPairsForm"), createTranslatePrefixForm = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("translate_prefix_title"),
            className: BDFDB.disCN.marginbottom8,
            children: [
              infoText(plugin.getCustomText("translate_prefix_hint")),
              ...(plugin.settings.prefixes.translationPrefixData || []).map((entry, index) => BDFDB.ReactUtils.createElement("div", {
                className: "translator-prefix-translation-row",
                children: [
                  BDFDB.ReactUtils.createElement("div", {
                    className: "translator-prefix-translation-cell translator-prefix-input-cell",
                    children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                      placeholder: plugin.getCustomText("translate_prefix_placeholder"),
                      value: entry.prefix,
                      onChange: /* @__PURE__ */ __name((value) => {
                        plugin.settings.prefixes.translationPrefixData[index].prefix = value, BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData"), plugin.SettingsUpdated = !0;
                      }, "onChange")
                    })
                  }),
                  BDFDB.ReactUtils.createElement("div", {
                    className: "translator-prefix-translation-cell translator-prefix-language-cell",
                    children: createStableSelect({
                      value: entry.language,
                      options: plugin.ensureSettingsStore().getLanguageIds().filter((key) => !plugin.ensureSettingsStore().getLanguage(key).auto && !plugin.ensureSettingsStore().getLanguage(key).special).map((key) => ({
                        value: key,
                        label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
                      })).sort((a, b) => a.label.localeCompare(b.label)),
                      onChange: /* @__PURE__ */ __name((value) => {
                        plugin.settings.prefixes.translationPrefixData[index].language = value, BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData"), plugin.SettingsUpdated = !0;
                      }, "onChange")
                    })
                  }),
                  BDFDB.ReactUtils.createElement("div", {
                    className: "translator-prefix-translation-cell translator-prefix-delete-cell",
                    children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
                      color: BDFDB.LibraryComponents.Button.Colors.RED,
                      size: BDFDB.LibraryComponents.Button.Sizes.TINY,
                      onClick: /* @__PURE__ */ __name((_2) => {
                        plugin.settings.prefixes.translationPrefixData.splice(index, 1), BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData"), plugin.SettingsUpdated = !0, refreshPanel();
                      }, "onClick"),
                      children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
                        name: BDFDB.LibraryComponents.SvgIcon.Names.TRASH,
                        width: 16,
                        height: 16
                      })
                    })
                  })
                ]
              })),
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                type: "Button",
                color: BDFDB.LibraryComponents.Button.Colors.GREEN,
                onClick: /* @__PURE__ */ __name((_2) => {
                  plugin.settings.prefixes.translationPrefixData || (plugin.settings.prefixes.translationPrefixData = []), plugin.settings.prefixes.translationPrefixData.push({
                    prefix: "$en",
                    language: "en"
                  }), BDFDB.DataUtils.save(plugin.settings.prefixes.translationPrefixData, plugin, "prefixes", "translationPrefixData"), plugin.SettingsUpdated = !0, refreshPanel();
                }, "onClick"),
                children: plugin.getCustomText("add_prefix_button")
              })
            ]
          }), "createTranslatePrefixForm"), saveTranslatedTextColor = /* @__PURE__ */ __name((color) => {
            color = (color || "").trim() || "#7cc7ff", plugin.settings.general.translatedTextColor = color, BDFDB.ArrayUtils.is(plugin.settings.general.customTranslatedTextColors) || (plugin.settings.general.customTranslatedTextColors = []), !plugin.getTranslatedTextColorPresets().includes(color) && !plugin.settings.general.customTranslatedTextColors.includes(color) && plugin.settings.general.customTranslatedTextColors.unshift(color), plugin.settings.general.customTranslatedTextColors = plugin.settings.general.customTranslatedTextColors.filter((value, index, array) => value && array.indexOf(value) == index).slice(0, 12), BDFDB.DataUtils.save(plugin.settings.general, plugin, "general"), plugin.SettingsUpdated = !0, refreshPanel();
          }, "saveTranslatedTextColor"), removeTranslatedTextColor = /* @__PURE__ */ __name((color) => {
            color = (color || "").trim(), !(!color || plugin.getTranslatedTextColorPresets().includes(color)) && (plugin.settings.general.customTranslatedTextColors = (plugin.settings.general.customTranslatedTextColors || []).filter((savedColor) => savedColor != color), plugin.getTranslatedTextColor() == color && (plugin.settings.general.translatedTextColor = plugin.getTranslatedTextColorPresets()[0] || "#7cc7ff"), BDFDB.DataUtils.save(plugin.settings.general, plugin, "general"), plugin.SettingsUpdated = !0, refreshPanel());
          }, "removeTranslatedTextColor"), resetTranslatedTextColor = /* @__PURE__ */ __name(() => {
            let defaultColor = plugin.getTranslatedTextColorPresets()[0] || "#7cc7ff", colorState = ensureTranslatedTextColorState();
            colorState.showCustom = !1, colorState.customValue = defaultColor, plugin.settings.general.translatedTextColor = defaultColor, BDFDB.DataUtils.save(plugin.settings.general, plugin, "general"), plugin.SettingsUpdated = !0, refreshPanel();
          }, "resetTranslatedTextColor"), ensureTranslatedTextColorState = /* @__PURE__ */ __name(() => (plugin.translatedTextColorState || (plugin.translatedTextColorState = {
            showCustom: !1,
            customValue: plugin.getTranslatedTextColor()
          }), plugin.translatedTextColorState.customValue || (plugin.translatedTextColorState.customValue = plugin.getTranslatedTextColor()), plugin.translatedTextColorState), "ensureTranslatedTextColorState"), getCustomTranslatedTextColors = /* @__PURE__ */ __name(() => BDFDB.ArrayUtils.is(plugin.settings.general.customTranslatedTextColors) ? plugin.settings.general.customTranslatedTextColors : [], "getCustomTranslatedTextColors"), createColorChip = /* @__PURE__ */ __name((color, active) => {
            let isCustomColor = getCustomTranslatedTextColors().includes(color) && !plugin.getTranslatedTextColorPresets().includes(color);
            return BDFDB.ReactUtils.createElement("button", {
              type: "button",
              className: BDFDB.DOMUtils.formatClassName("translator-color-chip", active && "translator-color-chip-active"),
              title: isCustomColor ? `${color} · ${compactText("点击选择，点 × 删除", "Click to select, click × to delete", "Нажмите для выбора, × для удаления")}` : color,
              onClick: /* @__PURE__ */ __name((_2) => {
                let colorState = ensureTranslatedTextColorState();
                colorState.showCustom = !1, colorState.customValue = color, saveTranslatedTextColor(color);
              }, "onClick"),
              children: [
                BDFDB.ReactUtils.createElement("span", {
                  className: "translator-color-chip-code",
                  children: color
                }),
                BDFDB.ReactUtils.createElement("span", {
                  className: "translator-settings-color-swatch",
                  style: { background: color }
                }),
                isCustomColor && BDFDB.ReactUtils.createElement("span", {
                  className: "translator-color-chip-delete",
                  title: compactText("删除这个自定义颜色", "Delete this custom color", "Удалить этот цвет"),
                  onClick: /* @__PURE__ */ __name((event) => {
                    event.preventDefault(), event.stopPropagation(), removeTranslatedTextColor(color);
                  }, "onClick"),
                  children: "×"
                })
              ].filter(Boolean)
            });
          }, "createColorChip"), createColorOptionLabel = /* @__PURE__ */ __name((color) => BDFDB.ReactUtils.createElement("div", {
            className: "translator-settings-color-option",
            children: [
              BDFDB.ReactUtils.createElement("span", {
                children: color
              }),
              BDFDB.ReactUtils.createElement("span", {
                className: "translator-settings-color-swatch",
                style: { background: color }
              })
            ]
          }), "createColorOptionLabel"), createInlineHeader = /* @__PURE__ */ __name((title, actions = []) => BDFDB.ReactUtils.createElement("div", {
            className: "translator-settings-inline-header",
            children: [
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
                tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
                style: { margin: 0 },
                children: title
              }),
              actions.length ? BDFDB.ReactUtils.createElement("div", {
                className: "translator-settings-inline-actions translator-settings-primary-actions",
                children: actions
              }) : null
            ].filter(Boolean)
          }), "createInlineHeader"), createSubsectionTitle = /* @__PURE__ */ __name((title) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
            className: BDFDB.disCN.marginbottom8,
            tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
            children: title
          }), "createSubsectionTitle"), createDivider = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormDivider, {
            className: BDFDB.disCNS.dividerdefault + BDFDB.disCN.marginbottom8
          }), "createDivider"), createSpaciousDivider = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormDivider, {
            className: BDFDB.DOMUtils.formatClassName(BDFDB.disCNS.dividerdefault + BDFDB.disCN.marginbottom8, "translator-settings-divider-spacious")
          }), "createSpaciousDivider"), createEnginePortalButtons = /* @__PURE__ */ __name((engineKey) => {
            let portal = getEnginePortalConfig(engineKey);
            return portal ? {
              portal,
              buttons: [
                portal.primaryUrl && createActionButton({
                  label: portal.primaryLabel,
                  color: BDFDB.LibraryComponents.Button.Colors.BRAND,
                  onClick: /* @__PURE__ */ __name((_2) => BDFDB.DiscordUtils.openLink(portal.primaryUrl), "onClick")
                }),
                portal.secondaryUrl && portal.secondaryLabel && createActionButton({
                  label: portal.secondaryLabel,
                  color: BDFDB.LibraryComponents.Button.Colors.BRAND,
                  onClick: /* @__PURE__ */ __name((_2) => BDFDB.DiscordUtils.openLink(portal.secondaryUrl), "onClick")
                })
              ].filter(Boolean)
            } : { portal: null, buttons: [] };
          }, "createEnginePortalButtons"), createEngineSupportPanel = /* @__PURE__ */ __name((engineKey) => {
            let portalData = createEnginePortalButtons(engineKey);
            return !portalData.buttons.length ? null : BDFDB.ReactUtils.createElement("div", {
              className: "translator-settings-support-panel",
              children: BDFDB.ReactUtils.createElement("div", {
                className: "translator-settings-support-row",
                children: portalData.buttons
              })
            });
          }, "createEngineSupportPanel"), createFetchedModelSelector = /* @__PURE__ */ __name((engineKey) => {
            let state = plugin.modelCatalogState && plugin.modelCatalogState[engineKey];
            return !state || !state.items || !state.items.length ? null : BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
              title: plugin.getCustomText("model_catalog_title"),
              className: BDFDB.disCN.marginbottom8,
              children: [
                createStableSelect({
                  value: plugin.ensureSettingsStore().getCredentialField(engineKey, "model") || "",
                  options: state.items.map((modelId) => ({ value: modelId, label: modelId })),
                  onChange: /* @__PURE__ */ __name((value) => {
                    saveAuthField(engineKey, "model", value), refreshPanel();
                  }, "onChange")
                }),
                BDFDB.ReactUtils.createElement("div", {
                  className: "translator-settings-meta",
                  children: plugin.getCustomText("model_catalog_loaded").replace("{count}", state.items.length)
                })
              ]
            });
          }, "createFetchedModelSelector"), updateEngineSetting = /* @__PURE__ */ __name((field, value) => {
            plugin.settings.engines[field] = value, BDFDB.DataUtils.save(plugin.settings.engines, plugin, "engines"), plugin.setLanguages(), plugin.SettingsUpdated = !0, refreshPanel();
          }, "updateEngineSetting"), saveFilterSetting = /* @__PURE__ */ __name((key, value) => {
            plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters[key] = value, BDFDB.DataUtils.save(value, plugin, "filters", key), plugin.SettingsUpdated = !0;
          }, "saveFilterSetting"), createLanguageOptions = /* @__PURE__ */ __name((direction) => plugin.ensureSettingsStore().getLanguageIds().filter((key) => !plugin.ensureSettingsStore().getLanguage(key).special && (direction == languageTypes.INPUT || !plugin.ensureSettingsStore().getLanguage(key).auto)).map((key) => ({
            value: key,
            label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
          })).sort((a, b) => a.value == "auto" ? -1 : b.value == "auto" ? 1 : a.label.localeCompare(b.label)), "createLanguageOptions"), createLanguageSelector = /* @__PURE__ */ __name((place, direction, title) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title,
            className: BDFDB.disCN.marginbottom8,
            children: createStableSelect({
              value: plugin.settings.choices[place][direction],
              options: createLanguageOptions(direction),
              onChange: /* @__PURE__ */ __name((value) => {
                plugin.settings.choices[place][direction] = value, BDFDB.DataUtils.save(plugin.settings.choices, plugin, "choices"), plugin.setLanguages(), plugin.SettingsUpdated = !0, refreshPanel();
              }, "onChange")
            })
          }), "createLanguageSelector"), createGeneralSwitch = /* @__PURE__ */ __name((key) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
            type: "Switch",
            plugin,
            keys: ["general", key],
            className: "translator-settings-switch-row",
            label: plugin.getGeneralSettingLabel(key),
            value: plugin.settings.general[key]
          }), "createGeneralSwitch"), createGeneralSwitchGroup = /* @__PURE__ */ __name((keys) => BDFDB.ReactUtils.createElement("div", {
            className: "translator-settings-switch-group",
            children: keys.map(createGeneralSwitch)
          }), "createGeneralSwitchGroup"), createUiLanguageSelector = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("plugin_language_title"),
            className: BDFDB.disCN.marginbottom8,
            children: [
              infoText(plugin.getCustomText("plugin_language_hint")),
              createStableSelect({
                value: plugin.settings.general.interfaceLanguage || "system",
                options: plugin.getPluginLanguageOptions(),
                onChange: /* @__PURE__ */ __name((value) => {
                  plugin.settings.general.interfaceLanguage = value || "system", BDFDB.DataUtils.save(plugin.settings.general, plugin, "general"), plugin.SettingsUpdated = !0, plugin.labels = plugin.setLabelsByLanguage(), refreshPanel();
                }, "onChange")
              })
            ]
          }), "createUiLanguageSelector"), createTranslatedTextColorInput = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("translated_text_color_title"),
            className: BDFDB.disCN.marginbottom8,
            children: (() => {
              let currentColor = plugin.getTranslatedTextColor(), colorState = ensureTranslatedTextColorState(), presetColors = plugin.getTranslatedTextColorPalette(), hasCustomCurrentColor = !plugin.getTranslatedTextColorPresets().includes(currentColor);
              return [
                createGeneralSwitch("highlightTranslatedMessages"),
                infoText(compactText("点色板即可切换，+ 号可自定义颜色。", "Pick a swatch or use + for a custom color.", "Нажмите цвет или используйте + для своего варианта.")),
                BDFDB.ReactUtils.createElement("div", {
                  className: "translator-color-palette",
                  children: [
                    ...presetColors.map((color) => createColorChip(color, color == currentColor)),
                    BDFDB.ReactUtils.createElement("button", {
                      type: "button",
                      className: "translator-color-chip translator-color-chip-add",
                      onClick: /* @__PURE__ */ __name((_2) => {
                        colorState.showCustom = !colorState.showCustom, colorState.customValue = currentColor, refreshPanel();
                      }, "onClick"),
                      children: "+"
                    })
                  ]
                }),
                colorState.showCustom && BDFDB.ReactUtils.createElement("div", {
                  className: "translator-color-custom-row",
                  children: [
                    BDFDB.ReactUtils.createElement("input", {
                      type: "color",
                      className: "translator-native-color-input",
                      defaultValue: /^#[0-9a-f]{6}$/i.test(colorState.customValue || "") ? colorState.customValue : "#7cc7ff",
                      onInput: /* @__PURE__ */ __name((event) => {
                        let nextColor = event && event.target && event.target.value || colorState.customValue;
                        colorState.customValue = nextColor;
                        let row = event && event.target && event.target.closest && event.target.closest(".translator-color-custom-row"), textInput = row && row.querySelector && row.querySelector(".translator-color-custom-input");
                        textInput && textInput.value != nextColor && (textInput.value = nextColor);
                      }, "onInput"),
                      onChange: /* @__PURE__ */ __name((event) => {
                        colorState.customValue = event && event.target && event.target.value || colorState.customValue;
                      }, "onChange")
                    }),
                    BDFDB.ReactUtils.createElement("input", {
                      type: "text",
                      className: "translator-color-custom-input",
                      placeholder: "#7cc7ff",
                      defaultValue: colorState.customValue,
                      onInput: /* @__PURE__ */ __name((event) => {
                        colorState.customValue = event && event.target && event.target.value || "";
                      }, "onInput")
                    }),
                    createActionButton({
                      label: plugin.getCustomText("translated_text_color_save_button"),
                      look: BDFDB.LibraryComponents.Button.Looks.OUTLINED,
                      className: "translator-settings-field-action",
                      onClick: /* @__PURE__ */ __name((_2) => {
                        let customColor = (colorState.customValue || "").trim();
                        if (!plugin.isValidCssColorValue(customColor)) return BDFDB.NotificationUtils.toast(plugin.getCustomText("translated_text_color_invalid"), { type: "danger", position: "center" });
                        colorState.showCustom = !1, colorState.customValue = customColor, saveTranslatedTextColor(customColor);
                      }, "onClick")
                    })
                  ]
                })
              ].filter(Boolean);
            })()
          }), "createTranslatedTextColorInput"), createSourceLanguageFilter = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("source_filter_title"),
            className: BDFDB.disCN.marginbottom8,
            children: [
              infoText(plugin.getCustomText("source_filter_hint")),
              !(plugin.settings.filters && plugin.settings.filters.autoTranslateSourceLanguages || []).length && infoText(plugin.getCustomText("source_filter_empty_state")),
              ...(plugin.settings.filters && plugin.settings.filters.autoTranslateSourceLanguages || []).map((languageId, index) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
                className: BDFDB.disCN.marginbottom8,
                align: BDFDB.LibraryComponents.Flex.Align.CENTER,
                children: [
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
                    grow: 1,
                    shrink: 0,
                    basis: "85%",
                    children: createStableSelect({
                      value: languageId,
                      options: plugin.ensureSettingsStore().getLanguageIds().filter((key) => !plugin.ensureSettingsStore().getLanguage(key).auto && !plugin.ensureSettingsStore().getLanguage(key).special).map((key) => ({
                        value: key,
                        label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
                      })).sort((a, b) => a.label.localeCompare(b.label)),
                      onChange: /* @__PURE__ */ __name((value) => {
                        plugin.settings.filters.autoTranslateSourceLanguages[index] = value, BDFDB.DataUtils.save(plugin.settings.filters.autoTranslateSourceLanguages, plugin, "filters", "autoTranslateSourceLanguages"), plugin.SettingsUpdated = !0;
                      }, "onChange")
                    })
                  }),
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
                    grow: 0,
                    shrink: 0,
                    basis: "15%",
                    children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
                      color: BDFDB.LibraryComponents.Button.Colors.RED,
                      size: BDFDB.LibraryComponents.Button.Sizes.TINY,
                      onClick: /* @__PURE__ */ __name((_2) => {
                        plugin.settings.filters.autoTranslateSourceLanguages.splice(index, 1), BDFDB.DataUtils.save(plugin.settings.filters.autoTranslateSourceLanguages, plugin, "filters", "autoTranslateSourceLanguages"), plugin.SettingsUpdated = !0, refreshPanel();
                      }, "onClick"),
                      children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
                        name: BDFDB.LibraryComponents.SvgIcon.Names.TRASH,
                        width: 16,
                        height: 16
                      })
                    })
                  })
                ]
              })),
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                type: "Button",
                color: BDFDB.LibraryComponents.Button.Colors.GREEN,
                onClick: /* @__PURE__ */ __name((_2) => {
                  plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.autoTranslateSourceLanguages || (plugin.settings.filters.autoTranslateSourceLanguages = []), plugin.settings.filters.autoTranslateSourceLanguages.push("en"), BDFDB.DataUtils.save(plugin.settings.filters.autoTranslateSourceLanguages, plugin, "filters", "autoTranslateSourceLanguages"), plugin.SettingsUpdated = !0, refreshPanel();
                }, "onClick"),
                children: plugin.getCustomText("source_filter_add")
              })
            ]
          }), "createSourceLanguageFilter"), createReceivedSourceLanguageFilter = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: plugin.getCustomText("received_source_filter_title"),
            className: BDFDB.disCN.marginbottom8,
            children: [
              infoText(plugin.getCustomText("received_source_filter_hint")),
              !(plugin.settings.filters && plugin.settings.filters.receivedAutoTranslateSourceLanguages || []).length && infoText(plugin.getCustomText("received_source_filter_empty_state")),
              ...(plugin.settings.filters && plugin.settings.filters.receivedAutoTranslateSourceLanguages || []).map((languageId, index) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
                className: BDFDB.disCN.marginbottom8,
                align: BDFDB.LibraryComponents.Flex.Align.CENTER,
                children: [
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
                    grow: 1,
                    shrink: 0,
                    basis: "85%",
                    children: createStableSelect({
                      value: languageId,
                      options: plugin.ensureSettingsStore().getLanguageIds().filter((key) => !plugin.ensureSettingsStore().getLanguage(key).auto && !plugin.ensureSettingsStore().getLanguage(key).special).map((key) => ({
                        value: key,
                        label: plugin.getLanguageDisplayName(plugin.ensureSettingsStore().getLanguage(key))
                      })).sort((a, b) => a.label.localeCompare(b.label)),
                      onChange: /* @__PURE__ */ __name((value) => {
                        plugin.settings.filters.receivedAutoTranslateSourceLanguages[index] = value, BDFDB.DataUtils.save(plugin.settings.filters.receivedAutoTranslateSourceLanguages, plugin, "filters", "receivedAutoTranslateSourceLanguages"), plugin.SettingsUpdated = !0;
                      }, "onChange")
                    })
                  }),
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
                    grow: 0,
                    shrink: 0,
                    basis: "15%",
                    children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
                      color: BDFDB.LibraryComponents.Button.Colors.RED,
                      size: BDFDB.LibraryComponents.Button.Sizes.TINY,
                      onClick: /* @__PURE__ */ __name((_2) => {
                        plugin.settings.filters.receivedAutoTranslateSourceLanguages.splice(index, 1), BDFDB.DataUtils.save(plugin.settings.filters.receivedAutoTranslateSourceLanguages, plugin, "filters", "receivedAutoTranslateSourceLanguages"), plugin.SettingsUpdated = !0, refreshPanel();
                      }, "onClick"),
                      children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
                        name: BDFDB.LibraryComponents.SvgIcon.Names.TRASH,
                        width: 16,
                        height: 16
                      })
                    })
                  })
                ]
              })),
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                type: "Button",
                color: BDFDB.LibraryComponents.Button.Colors.GREEN,
                onClick: /* @__PURE__ */ __name((_2) => {
                  plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.receivedAutoTranslateSourceLanguages || (plugin.settings.filters.receivedAutoTranslateSourceLanguages = []), plugin.settings.filters.receivedAutoTranslateSourceLanguages.push("en"), BDFDB.DataUtils.save(plugin.settings.filters.receivedAutoTranslateSourceLanguages, plugin, "filters", "receivedAutoTranslateSourceLanguages"), plugin.SettingsUpdated = !0, refreshPanel();
                }, "onClick"),
                children: plugin.getCustomText("received_source_filter_add")
              })
            ]
          }), "createReceivedSourceLanguageFilter"), createAutoTranslateDecisionSettings = /* @__PURE__ */ __name(() => {
            let aiCapable = plugin.isAiAutoTranslateDecisionAvailable(), currentMode = plugin.getAutoTranslateDecisionMode(), createLoadedScopeSettings = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
              title: compactText("补翻范围与数量", "Backfill scope and amount", "Объём перевода истории"),
              className: BDFDB.disCN.marginbottom8,
              children: [
                createStableSelect({
                  value: plugin.getReceivedAutoTranslateScope(),
                  options: [
                    { value: "new_only", label: compactText("仅翻译新消息", "New messages only", "Только новые сообщения") },
                    { value: "loaded_messages", label: compactText("含已加载历史消息", "Include loaded history", "Включая загруженную историю") }
                  ],
                  onChange: /* @__PURE__ */ __name((value) => {
                    plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.receivedAutoTranslateScope = value, BDFDB.DataUtils.save(value, plugin, "filters", "receivedAutoTranslateScope"), plugin.SettingsUpdated = !0, refreshPanel();
                  }, "onChange")
                }),
                plugin.getReceivedAutoTranslateScope() == "loaded_messages" && createStableSelect({
                  value: String(plugin.getReceivedAutoTranslateLoadedLimit()),
                  options: [10, 20, 50, 100].map((limit) => ({ value: String(limit), label: compactText(`最多补翻 ${limit} 条`, `Backfill up to ${limit}`, `Не более ${limit}`) })),
                  onChange: /* @__PURE__ */ __name((value) => {
                    plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.receivedAutoTranslateLoadedLimit = value, BDFDB.DataUtils.save(value, plugin, "filters", "receivedAutoTranslateLoadedLimit"), plugin.SettingsUpdated = !0;
                  }, "onChange")
                }),
                infoText(compactText("开启频道翻译后，一次性补翻最近已加载的历史消息；数量是上限，实际按符合条件的消息数决定。", "After enabling a channel, recent loaded history is backfilled once; the amount is a maximum over eligible messages.", "После включения канала загруженная история переводится один раз; количество — максимум по подходящим сообщениям."))
              ].filter(Boolean)
            }), "createLoadedScopeSettings");
            return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
              title: plugin.getCustomText("auto_translate_decision_title"),
              className: BDFDB.disCN.marginbottom8,
              children: [
                createLoadedScopeSettings(),
                infoText(plugin.getCustomText("auto_translate_decision_hint")),
                createSegmentedSelector({
                  className: "translator-decision-mode-grid",
                  value: currentMode,
                  options: [
                    { value: "basic", label: plugin.getCustomText("auto_translate_decision_basic") },
                    { value: "ai", label: aiCapable ? plugin.getCustomText("auto_translate_decision_ai") : plugin.getCustomText("auto_translate_decision_ai_disabled"), disabled: !aiCapable }
                  ],
                  onChange: /* @__PURE__ */ __name((value) => {
                    plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.autoTranslateDecisionMode = value, BDFDB.DataUtils.save(value, plugin, "filters", "autoTranslateDecisionMode"), plugin.SettingsUpdated = !0, refreshPanel();
                  }, "onChange")
                }),
                BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
                  title: compactText("语言检测策略", "Language detection strategy", "Стратегия определения языка"),
                  className: BDFDB.disCN.marginbottom8,
                  children: [
                    createStableSelect({
                      value: plugin.getLanguageDetectionStrategy(),
                      options: [
                        { value: "local_first", label: compactText("本地优先，失败时使用 Google Free", "Local first, then Google Free", "Сначала локально, затем Google Free") },
                        { value: "google_free", label: compactText("仅 Google Free", "Google Free only", "Только Google Free") },
                        { value: "local_only", label: compactText("仅本地检测", "Local only", "Только локально") }
                      ],
                      onChange: /* @__PURE__ */ __name((value) => {
                        plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.languageDetectionStrategy = value, BDFDB.DataUtils.save(value, plugin, "filters", "languageDetectionStrategy"), plugin.SettingsUpdated = !0;
                      }, "onChange")
                    }),
                    infoText(compactText("本地检测只在高置信时返回；默认策略拿不准会回退到免密钥的 Google 检测。", "Local detection returns only high-confidence results; the default falls back to keyless Google detection when uncertain.", "Локальное определение возвращает только уверенные результаты; иначе используется Google без ключа."))
                  ]
                }),
                BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                  type: "Switch",
                  label: compactText("本地预检测:翻前用本地语种识别跳过同语言消息", "Local pre-check: skip same-language messages before requesting translation", "Локальная проверка: пропускать сообщения на целевом языке до запроса"),
                  tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
                  value: plugin.useLocalLanguagePrecheck(),
                  onChange: /* @__PURE__ */ __name((value) => {
                    saveFilterSetting("useLocalLanguagePrecheck", value), refreshPanel();
                  }, "onChange")
                }),
                infoText(compactText("仅在高置信时跳过,拿不准仍照常翻译;关闭后完全交给翻译服务商判定。", "Only skips when highly confident; uncertain text still gets translated. Turn off to rely entirely on the translation provider.", "Пропускает только при высокой уверенности; иначе переводит как обычно.")),
                currentMode == "ai" && aiCapable && infoText(plugin.getCustomText("auto_translate_ai_prompt_hint")),
                currentMode == "ai" && aiCapable && BDFDB.ReactUtils.createElement("textarea", {
                  className: "translator-ai-prompt-textarea",
                  defaultValue: plugin.getAiAutoTranslatePrompt(),
                  onInput: /* @__PURE__ */ __name((event) => {
                    let value = event && event.target ? event.target.value : "";
                    plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.aiAutoTranslatePrompt = value, BDFDB.DataUtils.save(value, plugin, "filters", "aiAutoTranslatePrompt"), plugin.SettingsUpdated = !0;
                  }, "onInput"),
                  onChange: /* @__PURE__ */ __name((event) => {
                    let value = event && event.target ? event.target.value : "";
                    plugin.settings.filters || (plugin.settings.filters = {}), plugin.settings.filters.aiAutoTranslatePrompt = value, BDFDB.DataUtils.save(value, plugin, "filters", "aiAutoTranslatePrompt"), plugin.SettingsUpdated = !0;
                  }, "onChange")
                })
              ].filter(Boolean)
            });
          }, "createAutoTranslateDecisionSettings"), createEngineOptions = /* @__PURE__ */ __name((keys) => keys.filter((key) => translationEngines[key]).map((key) => ({ value: key, label: plugin.getEngineLabel(key) })), "createEngineOptions"), createPrimaryOptions = /* @__PURE__ */ __name(() => createEngineOptions(recommendedEngines.concat(Object.keys(translationEngines).filter((key) => !recommendedEngines.includes(key)))), "createPrimaryOptions"), createBackupOptions = /* @__PURE__ */ __name(() => [{ value: "----", label: plugin.getCustomText("backup_engine_none") }].concat(
            Object.keys(translationEngines).filter((key) => key != plugin.settings.engines.translator).map((key) => ({ value: key, label: plugin.getEngineLabel(key) }))
          ), "createBackupOptions"), createEngineFields = /* @__PURE__ */ __name((engineKey) => {
            let engine = translationEngines[engineKey];
            if (!engine) return [infoText(plugin.getCustomText("engine_unknown_hint"))];
            if (engineKey == "googleapi") return [createEngineSupportPanel(engineKey)];
            let items = [];
            if (engine.premium && items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
              type: "Switch",
              label: plugin.getCustomText("paid_version_label"),
              tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
              value: plugin.ensureSettingsStore().getCredentialField(engineKey, "paid"),
              onChange: /* @__PURE__ */ __name((value) => {
                plugin.ensureSettingsStore().setCredentialFlag(engineKey, "paid", value), plugin.SettingsUpdated = !0;
              }, "onChange")
            })), engine.key && (items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
              className: BDFDB.disCN.marginbottom8,
              tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
              children: plugin.getCustomText("api_key_label")
            })), items.push(createSecretInput({
              fieldKey: `${engineKey}-key`,
              placeholder: engine.key,
              value: plugin.ensureSettingsStore().getCredentialField(engineKey, "key"),
              onChange: /* @__PURE__ */ __name((value) => saveAuthField(engineKey, "key", value), "onChange")
            }))), engine.endpoint && (items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormTitle.Title, {
              className: BDFDB.disCN.marginbottom8,
              tag: BDFDB.LibraryComponents.FormTitle.Tags.H5,
              children: plugin.getCustomText("api_endpoint_label")
            })), items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
              className: BDFDB.disCN.marginbottom8,
              placeholder: engine.endpoint,
              value: plugin.ensureSettingsStore().getCredentialField(engineKey, "endpoint"),
              onChange: /* @__PURE__ */ __name((value) => saveAuthField(engineKey, "endpoint", value), "onChange")
            }))), engine.model) {
              let modelCatalogState = plugin.modelCatalogState && plugin.modelCatalogState[engineKey], modelActions = [];
              plugin.isValidatableEngine(engineKey) && modelActions.push(createActionButton({
                label: plugin.getCustomText("model_detect_button"),
                color: defaultSecondaryButtonColor,
                className: "translator-settings-field-action",
                onClick: /* @__PURE__ */ __name(async (_2) => {
                  let result = await plugin.validateEngineConfig(engineKey);
                  result && result.normalized && refreshPanel();
                }, "onClick")
              })), plugin.supportsModelCatalog(engineKey) && modelActions.push(createActionButton({
                label: modelCatalogState && modelCatalogState.loading ? plugin.getCustomText("model_fetch_loading") : plugin.getCustomText("model_fetch_button"),
                color: defaultSecondaryButtonColor,
                className: "translator-settings-field-action",
                onClick: /* @__PURE__ */ __name((_2) => plugin.fetchModelCatalog(engineKey, refreshPanel), "onClick")
              })), items.push(createInlineHeader(plugin.getCustomText("model_id_label"), modelActions)), items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                className: BDFDB.disCN.marginbottom8,
                placeholder: engine.model,
                value: plugin.ensureSettingsStore().getCredentialField(engineKey, "model"),
                onChange: /* @__PURE__ */ __name((value) => saveAuthField(engineKey, "model", value), "onChange")
              })), modelCatalogState && modelCatalogState.loading && items.push(BDFDB.ReactUtils.createElement("div", {
                className: BDFDB.disCN.marginbottom8,
                style: { opacity: 0.8, lineHeight: "1.5" },
                children: plugin.getCustomText("model_fetch_loading")
              }));
              let fetchedModelSelector = createFetchedModelSelector(engineKey);
              fetchedModelSelector && items.push(fetchedModelSelector);
            }
            engineKey == "microsoft" && items.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
              title: plugin.getCustomText("microsoft_region_label"),
              className: BDFDB.disCN.marginbottom8,
              children: createStableSelect({
                value: plugin.ensureSettingsStore().getCredentialField(engineKey, "region") || "global",
                options: [
                  { value: "global", label: "Global" },
                  { value: "eastasia", label: "East Asia" },
                  { value: "southeastasia", label: "Southeast Asia" },
                  { value: "centralus", label: "Central US" },
                  { value: "eastus", label: "East US" },
                  { value: "eastus2", label: "East US 2" },
                  { value: "westus", label: "West US" },
                  { value: "westeurope", label: "West Europe" },
                  { value: "japaneast", label: "Japan East" }
                ],
                onChange: /* @__PURE__ */ __name((value) => saveAuthField(engineKey, "region", value), "onChange")
              })
            }));
            let supportPanel = createEngineSupportPanel(engineKey);
            return supportPanel && items.push(supportPanel), items.length || items.push(infoText(plugin.getCustomText("engine_no_extra_fields"))), items;
          }, "createEngineFields"), createOtherServiceAuthSection = /* @__PURE__ */ __name(() => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
            title: plugin.getCustomText("other_service_title"),
            collapseStates,
            children: [
              infoText(compactText("只有切换到这些服务商时再填写。", "Only fill these in if you switch to those providers.", "Заполняйте только если будете переключаться на этих провайдеров.")),
              ...plugin.getAdditionalCredentialEngineKeys().map((key) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
                title: plugin.getEngineLabel(key),
                collapseStates,
                children: createEngineFields(key)
              }))
            ]
          }), "createOtherServiceAuthSection"), createProtectionSection = /* @__PURE__ */ __name(() => [
            createProtectedTermsForm(),
            createSpaciousDivider(),
            createWrapperPairsForm()
          ], "createProtectionSection"), createPrefixSection = /* @__PURE__ */ __name(() => [
            createDisablePrefixForm(),
            createTranslatePrefixForm()
          ], "createPrefixSection");
          return settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
            title: plugin.getCustomText("section_service_title"),
            collapseStates,
            children: [
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
                title: plugin.getCustomText("primary_engine_title"),
                className: BDFDB.disCN.marginbottom8,
                children: createStableSelect({
                  value: plugin.settings.engines.translator,
                  options: createPrimaryOptions(),
                  onChange: /* @__PURE__ */ __name((value) => updateEngineSetting("translator", value), "onChange")
                })
              }),
              ...createEngineFields(plugin.settings.engines.translator),
              createDivider(),
              BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
                title: plugin.getCustomText("backup_engine_title"),
                collapseStates,
                children: [
                  infoText(compactText("主服务失败时才会切到备用服务。", "Used only when the primary provider fails.", "Используется только при сбое основного провайдера.")),
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
                    title: plugin.getCustomText("backup_engine_select_title"),
                    className: BDFDB.disCN.marginbottom8,
                    children: createStableSelect({
                      value: plugin.settings.engines.backup,
                      options: createBackupOptions(),
                      onChange: /* @__PURE__ */ __name((value) => updateEngineSetting("backup", value), "onChange")
                    })
                  }),
                  plugin.settings.engines.backup == "----" ? infoText(plugin.getCustomText("backup_engine_none_hint")) : createEngineFields(plugin.settings.engines.backup)
                ]
              }),
              createOtherServiceAuthSection()
            ]
          })), settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
            title: plugin.getCustomText("section_language_title"),
            collapseStates,
            children: [
              createSubsectionTitle(plugin.getCustomText("section_message_language_title")),
              createLanguageSelector(messageTypes.SENT, languageTypes.INPUT, plugin.getCustomText("sent_input_title")),
              createLanguageSelector(messageTypes.SENT, languageTypes.OUTPUT, plugin.getCustomText("sent_output_title")),
              createSourceLanguageFilter(),
              createDivider(),
              createLanguageSelector(messageTypes.RECEIVED, languageTypes.INPUT, plugin.getCustomText("received_input_title")),
              createLanguageSelector(messageTypes.RECEIVED, languageTypes.OUTPUT, plugin.getCustomText("received_output_title")),
              createReceivedSourceLanguageFilter(),
              createSpaciousDivider(),
              createAutoTranslateDecisionSettings()
            ]
          })), settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
            title: plugin.getCustomText("section_display_title"),
            collapseStates,
            children: [
              createSubsectionTitle(plugin.getCustomText("section_display_message_title")),
              createGeneralSwitchGroup([
                "sendOriginalMessage",
                "useSpoilerInSentOriginal",
                "showOriginalMessage",
                "showOriginalDirectly",
                "useSpoilerInReceivedOriginal",
                "showOriginalInReplyPreview"
              ]),
              createSpaciousDivider(),
              createTranslatedTextColorInput(),
              createSpaciousDivider(),
              createUiLanguageSelector()
            ]
          })), settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
            title: plugin.getCustomText("section_advanced_title"),
            collapseStates,
            children: [
              ...createProtectionSection(),
              createSpaciousDivider(),
              ...createPrefixSection()
            ]
          })), BDFDB.ReactUtils.createElement("div", {
            className: "translator-settings-panel-root",
            children: settingsItems.flat(10).filter((n) => n)
          });
        }, "children")
      });
    }
    __name(renderSettingsPanel, "renderSettingsPanel");
    module2.exports = { renderSettingsPanel };
  }
});

// src/ui/translate-components.js
var require_translate_components = __commonJS({
  "src/ui/translate-components.js"(exports2, module2) {
    var { translationEngines } = require_provider_client(), translateIconGeneral = '<svg name="Translate" width="24" height="24" viewBox="0 0 24 24"><mask/><path fill="currentColor" mask="url(#translateIconMask)" d="m 9.6568988,1.9999999 c -1.141416,0 -0.951614,1.2688185 -0.951614,1.2688185 v 0.6505173 h -5.392479 c 0,0 -1.2688185,-0.1898024 -1.2688185,0.9516139 0,1.1414159 1.2688185,0.9516139 1.2688185,0.9516139 H 12.426863 C 12.695162,7.2780713 11.349082,9.1398691 9.7646988,10.765256 8.6555628,9.6878231 7.4332858,8.3134878 6.8664892,7.065981 6.6161862,6.515072 5.9881318,6.6956414 5.7283935,6.9736693 5.1836529,7.5567679 5.5785907,8.592173 6.0833902,9.3409331 c 0.246901,0.366224 1.3724726,1.5182279 2.4570966,2.5995909 -1.6322361,1.477469 -3.154699,2.550028 -3.154699,2.550028 0,0 -1.0769951,0.696378 -0.322161,1.552568 0.7548319,0.856187 1.5810669,-0.125147 1.5810669,-0.125147 0,0 1.5136611,-1.082765 3.2203701,-2.6696 0.5195872,0.508635 0.8970952,0.874172 0.8970952,0.874172 0,0 0.82821,0.985394 1.582925,0.09231 0.754714,-0.893081 -0.354377,-1.545753 -0.354377,-1.545753 0.0097,0.03486 -0.34186,-0.224086 -0.864878,-0.666625 1.804964,-1.884163 3.470802,-4.1622897 3.47686,-6.1799145 h 1.398302 c 0,0 1.268819,0.2176541 1.268819,-0.9516139 0,-1.1692683 -1.268819,-0.9516139 -1.268819,-0.9516139 H 10.608512 V 3.2688184 c 0,0 0.189804,-1.2688185 -0.9516132,-1.2688185 z M 15.056812,10.104826 10.536646,22 h 2.379035 l 0.964624,-2.537637 h 4.732049 L 19.576978,22 h 2.379035 L 17.435847,10.104826 Z m 1.189517,3.130537 1.643021,4.323772 h -3.286042 z"/><extra/></svg>', translateIconMask = '<mask id="translateIconMask" fill="black"><path fill="white" d="M 0 0 H 24 V 24 H 0 Z"/><path fill="black" d="M24 12 H 12 V 24 H 24 Z"/></mask>', translateIcon = translateIconGeneral.replace("<extra/>", "").replace("<mask/>", "").replace(' mask="url(#translateIconMask)"', ""), translateIconUntranslate = translateIconGeneral.replace("<extra/>", '<path fill="none" stroke="#f04747" stroke-width="2" d="m 14.702359,14.702442 8.596228,8.596148 m 0,-8.597139 -8.59722,8.596147 z"/>').replace("<mask/>", translateIconMask), languageTypes = Object.freeze({ INPUT: "input", OUTPUT: "output" }), messageTypes = Object.freeze({ RECEIVED: "received", SENT: "sent" });
    function createTranslateComponents(dependencies = {}) {
      var _a, _b;
      let { BDFDB, getPlugin } = dependencies;
      if (typeof getPlugin != "function") throw new Error("createTranslateComponents requires a getPlugin() accessor: the plugin instance is assigned in onLoad(), after this factory runs.");
      let TranslateButtonComponent = (_a = class extends BdApi.React.Component {
        render() {
          let _this = getPlugin(), enabled = _this.isTranslationEnabled(this.props.channelId);
          return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.ChannelTextAreaButton, {
            className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN._translatortranslatebutton, _this.isTranslationEnabled(this.props.channelId) && BDFDB.disCN._translatortranslating, BDFDB.disCN.textareapickerbutton),
            isActive: this.props.isActive,
            iconSVG: translateIcon,
            nativeClass: !0,
            tooltip: {
              text: /* @__PURE__ */ __name((_) => _this.getTranslateButtonTooltipText(this.props.channelId), "text"),
              tooltipConfig: { style: "max-width: 400px" }
            },
            onClick: /* @__PURE__ */ __name((_) => {
              this.props.isActive = !0, BDFDB.ReactUtils.forceUpdate(this), BDFDB.ModalUtils.open(_this, {
                size: "LARGE",
                header: BDFDB.LanguageUtils.LanguageStrings.SETTINGS,
                subHeader: "",
                onClose: /* @__PURE__ */ __name((_2) => {
                  this.props.isActive = !1, BDFDB.ReactUtils.forceUpdate(this);
                }, "onClose"),
                children: BDFDB.ReactUtils.createElement(TranslateSettingsComponent, {
                  guildId: this.props.guildId,
                  channelId: this.props.channelId
                })
              });
            }, "onClick"),
            onContextMenu: /* @__PURE__ */ __name((_) => {
              _this.toggleTranslation(this.props.channelId), BDFDB.ReactUtils.forceUpdate(this);
            }, "onContextMenu")
          });
        }
      }, __name(_a, "TranslateButton"), _a), TranslateSettingsComponent = (_b = class extends BdApi.React.Component {
        constructor(props) {
          super(props), this.state = {
            detectorText: "",
            detectedLanguageId: null,
            detectingLanguage: !1
          };
        }
        filterLanguages(direction, place) {
          let _this = getPlugin(), isOutput = direction == languageTypes.OUTPUT, settingsStore = _this.ensureSettingsStore(), currentInput = settingsStore.getLanguage(_this.getLanguageChoice(languageTypes.INPUT, place, this.props.channelId)), currentOutput = settingsStore.getLanguage(_this.getLanguageChoice(languageTypes.OUTPUT, place, this.props.channelId));
          return BDFDB.ObjectUtils.toArray(BDFDB.ObjectUtils.map(isOutput ? BDFDB.ObjectUtils.filter(settingsStore.getLanguages(), (lang) => !lang.auto) : settingsStore.getLanguages(), (lang, id) => {
            let input = isOutput ? currentInput : lang, output = isOutput ? lang : currentOutput, primarySupported = _this.engineSupportsLanguagePair(_this.getEffectivePrimaryEngine(this.props.channelId), input, output), backupSupported = _this.engineSupportsLanguagePair(_this.getEffectiveBackupEngine(this.props.channelId), input, output);
            return {
              value: id,
              label: _this.getLanguageDisplayName(lang),
              backup: !primarySupported && backupSupported,
              unsupported: !primarySupported && !backupSupported,
              disabled: !primarySupported && !backupSupported
            };
          }));
        }
        renderChannelPrimaryEngine() {
          let _this = getPlugin(), channelId = this.props.channelId;
          return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
            title: _this.getCustomText("channel_primary_engine_title"),
            className: BDFDB.disCN.marginbottom8,
            children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
              align: BDFDB.LibraryComponents.Flex.Align.CENTER,
              children: [
                BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
                  grow: 1,
                  children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Select, {
                    value: _this.getEffectivePrimaryEngine(channelId),
                    options: Object.keys(translationEngines).map((engineKey) => ({ value: engineKey, label: _this.getEngineLabel(engineKey) })),
                    onChange: /* @__PURE__ */ __name((engineKey) => {
                      _this.setChannelPrimaryEngine(channelId, engineKey), _this.refreshChannelPrimaryEngineRuntime(channelId), _this.setLanguages(), _this.isEngineConfiguredForRuntime(engineKey) || BDFDB.NotificationUtils.toast(`${_this.getEngineLabel(engineKey)}: ${_this.getCustomText("channel_primary_engine_unconfigured_warning")}`, { type: "danger", position: "center" }), BDFDB.ReactUtils.forceUpdate(this);
                    }, "onChange")
                  })
                }),
                _this.hasChannelPrimaryEngineOverride(channelId) && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
                  size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
                  className: BDFDB.disCN.marginleft8,
                  onClick: /* @__PURE__ */ __name((_) => {
                    _this.clearChannelPrimaryEngineOverride(channelId), _this.refreshChannelPrimaryEngineRuntime(channelId), _this.setLanguages(), BDFDB.ReactUtils.forceUpdate(this);
                  }, "onClick"),
                  children: _this.getCustomText("channel_primary_engine_restore")
                })
              ].filter(Boolean)
            })
          });
        }
        async detectLanguageFromInput() {
          let _this = getPlugin(), text = (this.state.detectorText || "").trim();
          if (!text) return BDFDB.NotificationUtils.toast(_this.getCustomText("language_detector_empty"), { type: "danger", position: "center" });
          this.setState({ detectingLanguage: !0 });
          let result = await _this.detectLanguageDetails(text);
          this.setState({
            detectingLanguage: !1,
            detectedLanguageId: result && result.id || null
          }), result || BDFDB.NotificationUtils.toast(_this.getCustomText("language_detector_failed"), { type: "danger", position: "center" });
        }
        applyDetectedLanguage(place, direction) {
          let _this = getPlugin(), detectedLanguageId = this.state.detectedLanguageId;
          detectedLanguageId && (_this.saveLanguageChoice(detectedLanguageId, direction, place, this.props.channelId), _this.setLanguages(), BDFDB.ReactUtils.forceUpdate(this));
        }
        renderLanguageDetector() {
          let _this = getPlugin(), detectedLanguageId = this.state.detectedLanguageId, detectedLanguage = detectedLanguageId && _this.getLanguageData(detectedLanguageId);
          return BDFDB.ReactUtils.createElement("div", {
            className: "translator-detector-panel",
            children: [
              BDFDB.ReactUtils.createElement("div", {
                className: "translator-settings-support-title",
                children: _this.getCustomText("language_detector_title")
              }),
              BDFDB.ReactUtils.createElement("div", {
                className: "translator-settings-support-hint",
                children: _this.getCustomText("language_detector_hint")
              }),
              BDFDB.ReactUtils.createElement("div", {
                className: "translator-detector-input-wrap",
                children: [
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                    className: "translator-detector-textinput",
                    placeholder: _this.getCustomText("language_detector_placeholder"),
                    value: this.state.detectorText,
                    onChange: /* @__PURE__ */ __name((value) => this.setState({ detectorText: value }), "onChange")
                  }),
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
                    size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
                    className: "translator-detector-input-button",
                    disabled: this.state.detectingLanguage,
                    onClick: /* @__PURE__ */ __name((_) => this.detectLanguageFromInput(), "onClick"),
                    children: this.state.detectingLanguage ? _this.getCustomText("language_detector_button_loading") : _this.getCustomText("language_detector_button")
                  })
                ]
              }),
              detectedLanguage && BDFDB.ReactUtils.createElement("div", {
                className: "translator-detector-result-row",
                children: [
                  BDFDB.ReactUtils.createElement("div", {
                    className: "translator-detector-result-text",
                    children: `${_this.getCustomText("language_detector_detected")}: ${_this.getLanguageDisplayName(detectedLanguage)} (${detectedLanguage.id})`
                  }),
                  BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Button, {
                    size: BDFDB.LibraryComponents.Button.Sizes.SMALL,
                    className: "translator-detector-apply-button",
                    onClick: /* @__PURE__ */ __name((_) => this.applyDetectedLanguage(messageTypes.SENT, languageTypes.OUTPUT), "onClick"),
                    children: _this.getCustomText("language_detector_apply_sent_output")
                  })
                ]
              })
            ].filter(Boolean)
          });
        }
        render() {
          let _this = getPlugin();
          return [
            this.renderChannelPrimaryEngine(),
            this.renderLanguageDetector(),
            Object.keys(_this.defaults.choices).map((place) => {
              let isChannelSpecific = _this.ensureSettingsStore().hasChannelLanguageScope(this.props.channelId, place), isGuildSpecific = !isChannelSpecific && _this.ensureSettingsStore().hasGuildLanguageScope(this.props.guildId, place);
              return Object.keys(_this.defaults.choices[place].value).map((direction) => [
                BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormItem, {
                  title: _this.labels[`language_choice_${direction.toLowerCase()}_${place.toLowerCase()}`] + ": ",
                  titleChildren: direction == languageTypes.OUTPUT && [{
                    text: /* @__PURE__ */ __name((_) => isChannelSpecific ? _this.labels.language_selection_channel : isGuildSpecific ? _this.labels.language_selection_server : _this.labels.language_selection_global, "text"),
                    name: isChannelSpecific || isGuildSpecific ? BDFDB.LibraryComponents.SvgIcon.Names.LOCK_CLOSED : BDFDB.LibraryComponents.SvgIcon.Names.LOCK_OPEN,
                    color: isChannelSpecific ? "var(--status-danger)" : isGuildSpecific ? "var(--status-warning)" : null,
                    onClick: /* @__PURE__ */ __name((_) => {
                      let nextScope = _this.ensureSettingsStore().cycleLanguageChoiceScope(this.props.channelId, this.props.guildId, place);
                      isChannelSpecific = nextScope == "channel", isGuildSpecific = nextScope == "guild", BDFDB.ReactUtils.forceUpdate(this);
                    }, "onClick")
                  }, {
                    iconSVG: '<svg width="21" height="21" fill="currentColor"><path d="M 0, 10.515 c 0, 2.892, 1.183, 5.521, 3.155, 7.361 L 0, 21.031 h 7.887 V 13.144 l -2.892, 2.892 C 3.549, 14.722, 2.629, 12.75, 2.629, 10.515 c 0 -3.418, 2.235 -6.309, 5.258 -7.492 v -2.629 C 3.418, 1.577, 0, 5.652, 0, 10.515 z M 21.031, 0 H 13.144 v 7.887 l 2.892 -2.892 C 17.482, 6.309, 18.402, 8.281, 18.402, 10.515 c 0, 3.418 -2.235, 6.309 -5.258, 7.492 V 20.768 c 4.469 -1.183, 7.887 -5.258, 7.887 -10.121 c 0 -2.892 -1.183 -5.521 -3.155 -7.361 L 21.031, 0 z"/></svg>',
                    onClick: /* @__PURE__ */ __name((_) => {
                      let input = _this.getLanguageChoice(languageTypes.INPUT, place, this.props.channelId), output = _this.getLanguageChoice(languageTypes.OUTPUT, place, this.props.channelId);
                      input = input == "auto" ? "en" : input, _this.saveLanguageChoice(output, languageTypes.INPUT, place, this.props.channelId), _this.saveLanguageChoice(input, languageTypes.OUTPUT, place, this.props.channelId), _this.setLanguages(), BDFDB.ReactUtils.forceUpdate(this);
                    }, "onClick")
                  }].map((data) => {
                    let icon = BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Clickable, {
                      className: BDFDB.disCN._translatorconfigbutton,
                      onClick: data.onClick,
                      children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
                        width: 24,
                        height: 24,
                        color: data.color || "currentColor",
                        name: data.name,
                        iconSVG: data.iconSVG
                      })
                    });
                    return data.text ? BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, { tooltipConfig: { type: "bottom" }, text: data.text, children: icon }) : icon;
                  }),
                  className: BDFDB.disCN.marginbottom8,
                  children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Select, {
                    menuShouldScrollIntoView: !1,
                    menuShouldBlockScroll: !1,
                    captureMenuScroll: !1,
                    menuPosition: "fixed",
                    menuPlacement: "auto",
                    menuPortalTarget: typeof document < "u" ? document.body : void 0,
                    maxMenuHeight: typeof window < "u" ? Math.max(150, Math.min(240, Math.floor(window.innerHeight * 0.36))) : 220,
                    value: _this.getLanguageChoice(direction, place, this.props.channelId),
                    options: this.filterLanguages(direction, place),
                    optionRenderer: /* @__PURE__ */ __name((lang) => _this.ensureSettingsStore().getLanguage(lang.value) ? BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex, {
                      align: BDFDB.LibraryComponents.Flex.Align.CENTER,
                      children: [
                        BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Flex.Child, {
                          grow: 1,
                          children: lang.label
                        }),
                        (lang.backup || lang.unsupported) && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
                          text: lang.unsupported ? _this.getCustomText("language_not_supported_by_channel_engines") : _this.labels.backup_engine_warning,
                          tooltipConfig: {
                            color: "red"
                          },
                          children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
                            nativeClass: !0,
                            width: 20,
                            height: 20,
                            color: "var(--status-danger)",
                            name: BDFDB.LibraryComponents.SvgIcon.Names.WARNING
                          })
                        }),
                        BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FavButton, {
                          isFavorite: _this.ensureSettingsStore().isFavorite(lang.value),
                          onClick: /* @__PURE__ */ __name((value) => {
                            _this.ensureSettingsStore().setFavorite(lang.value, value), _this.setLanguages();
                          }, "onClick")
                        })
                      ]
                    }) : null, "optionRenderer"),
                    onChange: /* @__PURE__ */ __name((value) => {
                      _this.saveLanguageChoice(value, direction, place, this.props.channelId), BDFDB.ReactUtils.forceUpdate(this);
                    }, "onChange")
                  })
                }),
                direction == languageTypes.OUTPUT && BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormDivider, {
                  className: BDFDB.disCN.marginbottom8
                })
              ]);
            })
          ].flat(10).filter((n) => n);
        }
      }, __name(_b, "TranslateSettings"), _b);
      return { TranslateButtonComponent, TranslateSettingsComponent };
    }
    __name(createTranslateComponents, "createTranslateComponents");
    module2.exports = {
      createTranslateComponents,
      translateIcon,
      translateIconUntranslate,
      translateIconGeneral
    };
  }
});

// src/ui/loaded-status-position.js
var require_loaded_status_position = __commonJS({
  "src/ui/loaded-status-position.js"(exports2, module2) {
    var hintScanCache = /* @__PURE__ */ new WeakMap(), HINT_MISS_RESCAN_MS = 15e3;
    function findNativeTextAreaStatusElement({ document: documentRef, anchorRect = null, anchorElement = null }) {
      if (!documentRef) return null;
      let now = Date.now(), cached = anchorElement && hintScanCache.get(anchorElement) || null;
      if (cached) {
        if (cached.hint && (!cached.hint.isConnected || typeof cached.hint.isConnected != "boolean")) hintScanCache.delete(anchorElement);
        else if (cached.hint || now - cached.scannedAt < HINT_MISS_RESCAN_MS) return cached.hint;
      }
      let matchIn = /* @__PURE__ */ __name((scope) => {
        let candidates = [];
        try {
          candidates = Array.from(scope.querySelectorAll("div, span"));
        } catch {
          return [];
        }
        return candidates.map((element) => {
          if (!element || element.id == "DiscordAITranslator-loaded-status" || !element.getBoundingClientRect) return null;
          let text = (element.textContent || "").trim();
          if (!text || !/慢速模式|slow\s*mode|slowmode|已开启/i.test(text)) return null;
          let rect = element.getBoundingClientRect();
          if (!rect.width || !rect.height) return null;
          if (anchorRect) {
            let nearInputTop = rect.bottom <= anchorRect.top + 10 && rect.bottom >= anchorRect.top - 42, aboveInput = rect.top >= anchorRect.top - 58 && rect.top <= anchorRect.top + 8, belowInput = rect.top >= anchorRect.bottom - 10 && rect.top <= anchorRect.bottom + 42 && rect.bottom <= anchorRect.bottom + 58;
            if (!(rect.right <= anchorRect.right + 24 && rect.right >= anchorRect.left + anchorRect.width * 0.45) || !(nearInputTop && aboveInput || belowInput)) return null;
          }
          return { element, rect, score: rect.right + rect.bottom };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
      }, "matchIn"), parentScope = anchorElement && anchorElement.parentElement || null, matches = parentScope ? matchIn(parentScope) : [], found = matches.length && matches[0] && matches[0].element || null;
      return anchorElement && hintScanCache.set(anchorElement, { hint: found, scannedAt: now }), found;
    }
    __name(findNativeTextAreaStatusElement, "findNativeTextAreaStatusElement");
    function positionLoadedStatusElement({ BDFDB, document: documentRef, window: windowRef, element }) {
      if (!element || !documentRef || !windowRef || typeof documentRef.querySelectorAll != "function") return;
      let selectors = ['[class*="channelTextArea"]', 'form [role="textbox"]'], anchors = [];
      for (let selector of selectors)
        if (selector)
          try {
            anchors = anchors.concat(Array.from(documentRef.querySelectorAll(selector)).filter(Boolean));
          } catch {
          }
      anchors = anchors.map((anchor2) => {
        if (!anchor2 || !anchor2.getBoundingClientRect) return null;
        let rect = anchor2.getBoundingClientRect();
        if (!rect.width || !rect.height || !(rect.bottom > 0 && rect.top < windowRef.innerHeight && rect.right > 0 && rect.left < windowRef.innerWidth)) return null;
        let nearBottom = Math.max(0, windowRef.innerHeight - rect.bottom), score = Math.min(rect.width, 900) - nearBottom * 2 + rect.right * 0.05;
        return { anchor: anchor2, rect, score };
      }).filter(Boolean).sort((a, b) => b.score - a.score);
      let anchorData = anchors[0], anchor = anchorData && anchorData.anchor, viewportPadding = 12, maxStatusWidth = Math.max(180, Math.min(360, windowRef.innerWidth - viewportPadding * 2));
      if (anchor && anchor.getBoundingClientRect) {
        let anchorRect = anchor.getBoundingClientRect();
        anchorRect && anchorRect.width && (maxStatusWidth = Math.max(180, Math.min(maxStatusWidth, Math.floor(anchorRect.width * 0.55), anchorRect.width - 16)));
      }
      element.style.maxWidth = `${Math.round(maxStatusWidth)}px`;
      let measuredRect = element.getBoundingClientRect ? element.getBoundingClientRect() : null, statusWidth = Math.max(180, Math.min(measuredRect && measuredRect.width || element.offsetWidth || 260, maxStatusWidth)), statusHeight = Math.max(18, measuredRect && measuredRect.height || element.offsetHeight || 20);
      element.style.right = "auto", element.style.bottom = "auto";
      let anchorRectOut = null, nativeHintRect = null, left = 0, top = 0;
      if (anchor && anchor.getBoundingClientRect) {
        let rect = anchor.getBoundingClientRect();
        anchorRectOut = rect;
        let nativeStatus = findNativeTextAreaStatusElement({ document: documentRef, anchorRect: rect, anchorElement: anchor });
        if (left = rect.right - statusWidth - viewportPadding, top = rect.top - statusHeight - 8, nativeStatus && nativeStatus.getBoundingClientRect) {
          let nativeRect = nativeStatus.getBoundingClientRect();
          nativeHintRect = nativeRect, left = Math.max(rect.left + 8, Math.min(nativeRect.right - statusWidth, windowRef.innerWidth - statusWidth - viewportPadding)), top = nativeRect.top - statusHeight - 8;
        } else
          left = Math.max(rect.left + 8, Math.min(left, rect.right - statusWidth - 8));
        top = Math.max(viewportPadding, Math.min(top, windowRef.innerHeight - statusHeight - viewportPadding));
      } else
        left = Math.max(viewportPadding, windowRef.innerWidth - statusWidth - 108), top = Math.max(viewportPadding, windowRef.innerHeight - statusHeight - 54);
      element.style.left = `${Math.round(left)}px`, element.style.top = `${Math.round(top)}px`;
    }
    __name(positionLoadedStatusElement, "positionLoadedStatusElement");
    module2.exports = { findNativeTextAreaStatusElement, positionLoadedStatusElement };
  }
});

// src/channel-title/channel-title-store.js
var require_channel_title_store = __commonJS({
  "src/channel-title/channel-title-store.js"(exports2, module2) {
    function createChannelTitleStore({ now = Date.now } = {}) {
      let translated = {}, pending = {}, failed = {}, requestSequence = 0;
      function normalizeChannelId(channelId) {
        return channelId == null ? "" : String(channelId);
      }
      return __name(normalizeChannelId, "normalizeChannelId"), Object.freeze({
        // A translated title only counts while its signature still matches the current
        // configuration; a stale entry is dropped on read so it cannot resurface.
        getTranslatedTitle(channelId, signature) {
          let key = normalizeChannelId(channelId), entry = translated[key];
          return entry ? entry.signature !== signature ? (delete translated[key], null) : entry.text : null;
        },
        hasTranslatedTitle(channelId) {
          let key = normalizeChannelId(channelId);
          return key ? !!translated[key] : !!Object.keys(translated).length;
        },
        // Returns null when a request for this exact signature is already settled,
        // in flight, or inside its failure cooldown.
        beginRequest(channelId, signature) {
          let key = normalizeChannelId(channelId);
          if (!key || !signature || translated[key] && translated[key].signature === signature || pending[key] && pending[key].signature === signature) return null;
          let failure = failed[key];
          if (failure && failure.signature === signature && failure.retryAfter > now()) return null;
          let request = { id: ++requestSequence, channelId: key, signature };
          return pending[key] = request, request;
        },
        isRequestCurrent(request) {
          return !!request && pending[normalizeChannelId(request.channelId)] === request;
        },
        completeRequest(request, text) {
          let key = normalizeChannelId(request && request.channelId);
          return !key || pending[key] !== request ? !1 : (delete pending[key], translated[key] = { signature: request.signature, text }, delete failed[key], !0);
        },
        failRequest(request) {
          let key = normalizeChannelId(request && request.channelId);
          return !key || pending[key] !== request ? !1 : (delete pending[key], failed[key] = { signature: request.signature, retryAfter: now() + 3e4 }, !0);
        },
        // Drops an in-flight request without recording a failure, so the next render
        // may retry immediately.
        abandonRequest(request) {
          let key = normalizeChannelId(request && request.channelId);
          return !key || pending[key] !== request ? !1 : (delete pending[key], !0);
        },
        cancelPending(channelId = null) {
          let key = normalizeChannelId(channelId);
          if (!key) {
            pending = {}, failed = {};
            return;
          }
          delete pending[key], delete failed[key];
        },
        // Returns whether a visible title was actually removed, so the caller knows
        // if a component refresh is warranted.
        clear(channelId = null) {
          let key = normalizeChannelId(channelId), hadTranslatedTitle = this.hasTranslatedTitle(channelId);
          return this.cancelPending(channelId), key ? delete translated[key] : translated = {}, hadTranslatedTitle;
        },
        // Invalidates every in-flight request without touching displayed titles;
        // used when the plugin stops so late callbacks cannot commit.
        invalidateInFlight() {
          requestSequence++, pending = {};
        }
      });
    }
    __name(createChannelTitleStore, "createChannelTitleStore");
    module2.exports = { CHANNEL_TITLE_FAILURE_RETRY_MS: 3e4, createChannelTitleStore };
  }
});

// src/viewport/message-viewport-store.js
var require_message_viewport_store = __commonJS({
  "src/viewport/message-viewport-store.js"(exports2, module2) {
    var MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS = [60, 180, 420, 900], SCROLL_INTENT_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "], SCROLL_INTENT_EVENTS = ["wheel", "touchmove", "pointerdown", "keydown"], SCROLL_INTENT_END_EVENTS = ["pointerup", "pointercancel"], INPUT_ACTIVITY_EVENTS = ["beforeinput", "input", "keydown"], MESSAGE_ELEMENT_SELECTOR = '[id^="chat-messages-"], [data-list-item-id*="chat-messages"]', TEXT_INPUT_SELECTOR = "textarea, input, [contenteditable='true']";
    function createMessageViewportStore({
      getDocument = /* @__PURE__ */ __name(() => null, "getDocument"),
      setTimeout: setTimeout2,
      clearTimeout: clearTimeout2,
      requestAnimationFrame: requestAnimationFrame2,
      now = Date.now,
      getSelectedChannelId = /* @__PURE__ */ __name(() => null, "getSelectedChannelId"),
      getMessagesScrollerSelector = /* @__PURE__ */ __name(() => null, "getMessagesScrollerSelector"),
      getChannelTextAreaSelector = /* @__PURE__ */ __name(() => null, "getChannelTextAreaSelector"),
      escapeSelectorValue = null,
      // Finishing a scroll is the moment the legacy runtime is allowed to close a
      // historical snapshot; the store must not know what that means.
      onScrollActivityFinished = /* @__PURE__ */ __name(() => {
      }, "onScrollActivityFinished")
    } = {}) {
      let userScrollTime = 0, userScrollChannelId = "", userScrollIntentSequence = 0, programmaticScrollWriteTime = 0, scrollWatcherAttached = !1, scrollWatcherElement = null, scrollActivityHandler = null, scrollIntentHandler = null, scrollIntentEndHandler = null, scrollEndHandler = null, scrollIntentPending = !1, scrollIntentTimer = null, scrollIdleTimer = null, inputActivityTime = 0, inputActivityHandler = null, manualScrollAnchor = null, manualScrollLockTimer = null;
      function normalizeChannelId(channelId) {
        return channelId == null ? "" : String(channelId);
      }
      __name(normalizeChannelId, "normalizeChannelId");
      function escapeSelector(value) {
        return escapeSelectorValue ? escapeSelectorValue(String(value)) : String(value).replace(/(["\\])/g, "\\$1");
      }
      __name(escapeSelector, "escapeSelector");
      function getMessagesScroller() {
        let documentRef = getDocument(), selector = getMessagesScrollerSelector();
        return !documentRef || !selector ? null : documentRef.querySelector(selector);
      }
      __name(getMessagesScroller, "getMessagesScroller");
      function extractMessageIdFromElement(element) {
        if (!element) return null;
        let values = [
          element.getAttribute && element.getAttribute("data-list-item-id"),
          element.getAttribute && element.getAttribute("aria-labelledby"),
          element.id
        ].filter(Boolean);
        for (let value of values) {
          let match = String(value).match(/(\d{15,25})(?!.*\d)/);
          if (match) return match[1];
        }
        return null;
      }
      __name(extractMessageIdFromElement, "extractMessageIdFromElement");
      function findMessageElementById(messageId) {
        let documentRef = getDocument();
        if (!messageId || !documentRef) return null;
        let escapedId = escapeSelector(messageId), selectors = [
          `[id="chat-messages-${escapedId}"]`,
          `[id$="-${escapedId}"]`,
          `[data-list-item-id$="-${escapedId}"]`,
          `[data-list-item-id*="${escapedId}"]`,
          `[aria-labelledby*="${escapedId}"]`
        ];
        for (let selector of selectors)
          try {
            let element = documentRef.querySelector(selector);
            if (element) return element.closest && element.closest(MESSAGE_ELEMENT_SELECTOR) || element;
          } catch {
          }
        return null;
      }
      __name(findMessageElementById, "findMessageElementById");
      function findVisibleMessageAnchor(messagesScroller = null) {
        if (messagesScroller = messagesScroller || getMessagesScroller(), !messagesScroller || !getDocument()) return null;
        let scrollerRect = messagesScroller.getBoundingClientRect(), candidates = [];
        try {
          candidates = Array.from(messagesScroller.querySelectorAll(MESSAGE_ELEMENT_SELECTOR));
        } catch {
          candidates = [];
        }
        let seen = /* @__PURE__ */ new Set();
        for (let element of candidates) {
          if (!element || seen.has(element)) continue;
          seen.add(element);
          let messageId = extractMessageIdFromElement(element);
          if (!messageId) continue;
          let rect = element.getBoundingClientRect();
          if (!(!rect || rect.height <= 0) && !(rect.bottom <= scrollerRect.top + 8 || rect.top >= scrollerRect.bottom - 8))
            return { messageId, element };
        }
        return null;
      }
      __name(findVisibleMessageAnchor, "findVisibleMessageAnchor");
      function captureAnchorState(messageId = null) {
        let messagesScroller = getMessagesScroller(), element = messageId ? findMessageElementById(messageId) : null;
        if (!element) {
          let visibleAnchor = findVisibleMessageAnchor(messagesScroller);
          visibleAnchor && (messageId = visibleAnchor.messageId, element = visibleAnchor.element);
        }
        if (!messagesScroller || !element || !messageId) return null;
        let elementRect = element.getBoundingClientRect(), scrollerRect = messagesScroller.getBoundingClientRect();
        return {
          messageId,
          scrollTop: messagesScroller.scrollTop,
          elementTop: elementRect.top,
          relativeTop: elementRect.top - scrollerRect.top,
          expiresAt: now() + 4500
        };
      }
      __name(captureAnchorState, "captureAnchorState");
      function restoreAnchorPosition(anchorState) {
        if (!anchorState) return;
        let messagesScroller = getMessagesScroller(), element = findMessageElementById(anchorState.messageId);
        if (!messagesScroller || !element) return;
        let scrollerRect = messagesScroller.getBoundingClientRect(), elementRect = element.getBoundingClientRect(), desiredTop = scrollerRect.top + (typeof anchorState.relativeTop == "number" ? anchorState.relativeTop : elementRect.top - scrollerRect.top), delta = elementRect.top - desiredTop;
        if (Math.abs(delta) < 1) return;
        let maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
        programmaticScrollWriteTime = now(), messagesScroller.scrollTop = Math.max(0, Math.min(messagesScroller.scrollTop + delta, maxScrollTop));
      }
      __name(restoreAnchorPosition, "restoreAnchorPosition");
      function restoreAnchorState(anchorState) {
        if (!anchorState) return;
        let restore = /* @__PURE__ */ __name(() => restoreAnchorPosition(anchorState), "restore");
        requestAnimationFrame2(() => requestAnimationFrame2(restore));
        for (let delay of MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS) setTimeout2(restore, delay);
      }
      __name(restoreAnchorState, "restoreAnchorState");
      function lockManualScroll(messageId) {
        let anchorState = captureAnchorState(messageId);
        anchorState && (manualScrollAnchor = anchorState, manualScrollLockTimer && clearTimeout2(manualScrollLockTimer), manualScrollLockTimer = setTimeout2((_) => {
          manualScrollLockTimer = null, manualScrollAnchor = null;
        }, 4500));
      }
      __name(lockManualScroll, "lockManualScroll");
      function getActiveManualScrollAnchor() {
        return manualScrollAnchor ? now() > manualScrollAnchor.expiresAt ? (manualScrollAnchor = null, null) : manualScrollAnchor : null;
      }
      __name(getActiveManualScrollAnchor, "getActiveManualScrollAnchor");
      function clearManualScrollLock() {
        manualScrollLockTimer && clearTimeout2(manualScrollLockTimer), manualScrollLockTimer = null, manualScrollAnchor = null;
      }
      __name(clearManualScrollLock, "clearManualScrollLock");
      function captureScrollerState() {
        let messagesScroller = getMessagesScroller();
        if (!messagesScroller) return null;
        let maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight), keepBottom = Math.max(0, maxScrollTop - messagesScroller.scrollTop) <= 80;
        return {
          scrollTop: messagesScroller.scrollTop,
          keepBottom,
          userScrollIntentSequence,
          anchor: keepBottom ? null : captureAnchorState()
        };
      }
      __name(captureScrollerState, "captureScrollerState");
      function restoreScrollerState(scrollerState) {
        if (!scrollerState) return;
        let restore = /* @__PURE__ */ __name(() => {
          if (scrollerState.userScrollIntentSequence !== userScrollIntentSequence) return;
          let messagesScroller = getMessagesScroller();
          if (!messagesScroller) return;
          if (scrollerState.keepBottom) {
            programmaticScrollWriteTime = now(), messagesScroller.scrollTop = messagesScroller.scrollHeight;
            return;
          }
          if (scrollerState.anchor) {
            restoreAnchorPosition(scrollerState.anchor);
            return;
          }
          let maxScrollTop = Math.max(0, messagesScroller.scrollHeight - messagesScroller.clientHeight);
          programmaticScrollWriteTime = now(), messagesScroller.scrollTop = Math.max(0, Math.min(scrollerState.scrollTop, maxScrollTop));
        }, "restore");
        requestAnimationFrame2(() => requestAnimationFrame2(restore));
      }
      __name(restoreScrollerState, "restoreScrollerState");
      function isViewingMessageHistory() {
        let scrollerState = captureScrollerState();
        return !!(scrollerState && !scrollerState.keepBottom);
      }
      __name(isViewingMessageHistory, "isViewingMessageHistory");
      function clearScrollIntent() {
        scrollIntentTimer && clearTimeout2(scrollIntentTimer), scrollIntentTimer = null, scrollIntentPending = !1;
      }
      __name(clearScrollIntent, "clearScrollIntent");
      function markScrollIntent() {
        clearScrollIntent(), scrollIntentPending = !0, scrollIntentTimer = setTimeout2(() => {
          scrollIntentTimer = null, scrollIntentPending = !1;
        }, 300);
      }
      __name(markScrollIntent, "markScrollIntent");
      function finishScrollActivity(channelId) {
        scrollIdleTimer && clearTimeout2(scrollIdleTimer), scrollIdleTimer = null, clearScrollIntent();
        let key = normalizeChannelId(channelId);
        (!key || userScrollChannelId === key) && (userScrollTime = 0, userScrollChannelId = ""), key && onScrollActivityFinished(channelId);
      }
      __name(finishScrollActivity, "finishScrollActivity");
      function scheduleScrollIdleFinish(channelId, delay = 900) {
        channelId && (scrollIdleTimer && clearTimeout2(scrollIdleTimer), scrollIdleTimer = setTimeout2(() => {
          scrollIdleTimer = null, finishScrollActivity(channelId);
        }, delay));
      }
      __name(scheduleScrollIdleFinish, "scheduleScrollIdleFinish");
      function isUserScrollingChannel(channelId) {
        return userScrollChannelId === normalizeChannelId(channelId) && now() - userScrollTime < 900;
      }
      __name(isUserScrollingChannel, "isUserScrollingChannel");
      function isUserActivelyScrolling(channelId = null) {
        let key = normalizeChannelId(channelId || getSelectedChannelId());
        return !!key && userScrollChannelId === key && !!userScrollTime && now() - userScrollTime < 900;
      }
      __name(isUserActivelyScrolling, "isUserActivelyScrolling");
      function handleScrollActivity() {
        let timestamp = now();
        if (timestamp - programmaticScrollWriteTime < 150) return;
        let channelId = getSelectedChannelId(), key = normalizeChannelId(channelId);
        scrollIntentPending ? (clearScrollIntent(), userScrollChannelId = key, userScrollTime = timestamp, scheduleScrollIdleFinish(channelId)) : key && userScrollChannelId === key && userScrollTime && timestamp - userScrollTime < 900 && (userScrollTime = timestamp, scheduleScrollIdleFinish(channelId));
      }
      __name(handleScrollActivity, "handleScrollActivity");
      function attachScrollWatcher() {
        if (!getDocument()) return;
        let messagesScroller = getMessagesScroller();
        if (messagesScroller && !(scrollWatcherAttached && scrollWatcherElement === messagesScroller)) {
          detachScrollWatcher(), scrollActivityHandler = /* @__PURE__ */ __name((_) => handleScrollActivity(), "scrollActivityHandler"), scrollIntentHandler = /* @__PURE__ */ __name((event) => {
            event && event.type === "keydown" && !SCROLL_INTENT_KEYS.includes(event.key) || (userScrollIntentSequence++, markScrollIntent());
          }, "scrollIntentHandler"), scrollIntentEndHandler = /* @__PURE__ */ __name((_) => {
            clearScrollIntent();
          }, "scrollIntentEndHandler"), scrollEndHandler = /* @__PURE__ */ __name((_) => {
            finishScrollActivity(userScrollChannelId || getSelectedChannelId());
          }, "scrollEndHandler"), scrollWatcherElement = messagesScroller, scrollWatcherAttached = !0, messagesScroller.addEventListener("scroll", scrollActivityHandler, { passive: !0 }), messagesScroller.addEventListener("scrollend", scrollEndHandler, { passive: !0 });
          for (let eventName of SCROLL_INTENT_EVENTS) messagesScroller.addEventListener(eventName, scrollIntentHandler, { passive: eventName !== "keydown" });
          for (let eventName of SCROLL_INTENT_END_EVENTS) messagesScroller.addEventListener(eventName, scrollIntentEndHandler, { passive: !0 });
        }
      }
      __name(attachScrollWatcher, "attachScrollWatcher");
      function detachScrollWatcher() {
        if (scrollIdleTimer && clearTimeout2(scrollIdleTimer), scrollIdleTimer = null, clearScrollIntent(), userScrollTime = 0, userScrollChannelId = "", scrollWatcherElement) {
          if (scrollActivityHandler && scrollWatcherElement.removeEventListener("scroll", scrollActivityHandler), scrollEndHandler && scrollWatcherElement.removeEventListener("scrollend", scrollEndHandler), scrollIntentHandler) for (let eventName of SCROLL_INTENT_EVENTS) scrollWatcherElement.removeEventListener(eventName, scrollIntentHandler);
          if (scrollIntentEndHandler) for (let eventName of SCROLL_INTENT_END_EVENTS) scrollWatcherElement.removeEventListener(eventName, scrollIntentEndHandler);
        }
        scrollWatcherAttached = !1, scrollWatcherElement = null, scrollActivityHandler = null, scrollIntentHandler = null, scrollIntentEndHandler = null, scrollEndHandler = null;
      }
      __name(detachScrollWatcher, "detachScrollWatcher");
      function attachInputActivityWatcher() {
        let documentRef = getDocument();
        if (!(inputActivityHandler || !documentRef)) {
          inputActivityHandler = /* @__PURE__ */ __name((event) => {
            let target = event && event.target;
            if (!target) return;
            let isTextInput = !1;
            try {
              isTextInput = !!(target.matches && target.matches(TEXT_INPUT_SELECTOR) || target.closest && target.closest(TEXT_INPUT_SELECTOR));
            } catch {
            }
            isTextInput && (inputActivityTime = now());
          }, "inputActivityHandler");
          for (let eventName of INPUT_ACTIVITY_EVENTS) documentRef.addEventListener(eventName, inputActivityHandler, !0);
        }
      }
      __name(attachInputActivityWatcher, "attachInputActivityWatcher");
      function detachInputActivityWatcher() {
        let documentRef = getDocument();
        if (!inputActivityHandler || !documentRef) {
          inputActivityHandler = null;
          return;
        }
        for (let eventName of INPUT_ACTIVITY_EVENTS) documentRef.removeEventListener(eventName, inputActivityHandler, !0);
        inputActivityHandler = null;
      }
      __name(detachInputActivityWatcher, "detachInputActivityWatcher");
      function isChannelTextAreaFocused() {
        let documentRef = getDocument();
        if (!documentRef) return !1;
        let activeElement = documentRef.activeElement;
        return !activeElement || activeElement === documentRef.body || !(activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT" || activeElement.getAttribute && activeElement.getAttribute("role") === "textbox" || activeElement.isContentEditable) ? !1 : [getChannelTextAreaSelector(), '[class*="channelTextArea"]', "form"].some((selector) => {
          if (!selector) return !1;
          try {
            return !!(activeElement.matches && activeElement.matches(selector) || activeElement.closest && activeElement.closest(selector));
          } catch {
            return !1;
          }
        });
      }
      __name(isChannelTextAreaFocused, "isChannelTextAreaFocused");
      function pauseForNavigation(duration = 1800) {
        let channelId = getSelectedChannelId();
        userScrollChannelId = normalizeChannelId(channelId), userScrollTime = now() + Math.max(0, duration - 900), channelId && scheduleScrollIdleFinish(channelId, duration);
      }
      return __name(pauseForNavigation, "pauseForNavigation"), Object.freeze({
        getMessagesScroller,
        extractMessageIdFromElement,
        findMessageElementById,
        findVisibleMessageAnchor,
        captureAnchorState,
        restoreAnchorPosition,
        restoreAnchorState,
        lockManualScroll,
        getActiveManualScrollAnchor,
        clearManualScrollLock,
        captureScrollerState,
        restoreScrollerState,
        isViewingMessageHistory,
        attachScrollWatcher,
        detachScrollWatcher,
        markScrollIntent,
        clearScrollIntent,
        finishScrollActivity,
        scheduleScrollIdleFinish,
        isUserActivelyScrolling,
        // Narrower than isUserActivelyScrolling: no fallback to the selected channel and
        // no truthiness check on the timestamp, matching the historical commit gate.
        isUserScrollingChannel,
        getUserScrollIntentSequence: /* @__PURE__ */ __name(() => userScrollIntentSequence, "getUserScrollIntentSequence"),
        attachInputActivityWatcher,
        detachInputActivityWatcher,
        getTimeSinceInputActivity: /* @__PURE__ */ __name(() => now() - inputActivityTime, "getTimeSinceInputActivity"),
        isChannelTextAreaFocused,
        pauseForNavigation
      });
    }
    __name(createMessageViewportStore, "createMessageViewportStore");
    module2.exports = {
      AUTO_TRANSLATION_PROGRAMMATIC_SCROLL_GRACE: 150,
      AUTO_TRANSLATION_SCROLL_IDLE_DELAY: 900,
      AUTO_TRANSLATION_SCROLL_INTENT_WINDOW: 300,
      AUTO_TRANSLATION_BOTTOM_LOCK_THRESHOLD: 80,
      MANUAL_TRANSLATION_SCROLL_LOCK_MS: 4500,
      MANUAL_TRANSLATION_ANCHOR_RESTORE_DELAYS,
      createMessageViewportStore
    };
  }
});

// src/status/loaded-translation-status-store.js
var require_loaded_translation_status_store = __commonJS({
  "src/status/loaded-translation-status-store.js"(exports2, module2) {
    var LOADED_STATUS_PHASES = Object.freeze(["collecting", "requesting", "repairing", "committing", "done", "failed"]), LOADED_STATUS_PHASE_SET = new Set(LOADED_STATUS_PHASES), LOADED_STATUS_TERMINAL_PHASES = /* @__PURE__ */ new Set(["done", "failed"]), LOADED_STATUS_PHASE_BY_JOB_STATE = Object.freeze({
      collecting: "collecting",
      translating: "requesting",
      repairing: "repairing",
      ready: "committing",
      committed: "done",
      cancelled: null
    }), LOADED_STATUS_PROGRESS_FIELDS = Object.freeze(["total", "processed", "displayed", "displayPending", "skipped", "failed"]);
    function createEmptyStatus() {
      return {
        active: !1,
        collecting: !1,
        done: !1,
        channelId: null,
        total: 0,
        processed: 0,
        batch: 0,
        displayed: 0,
        displayPending: 0,
        skipped: 0,
        failed: 0,
        retryable: 0,
        aiDropped: 0,
        lastSkipReason: "",
        lastSkipPreview: "",
        phase: null,
        phaseStartedAt: 0,
        progressAt: 0
      };
    }
    __name(createEmptyStatus, "createEmptyStatus");
    function normalizeChannelId(channelId) {
      return channelId == null ? "" : String(channelId);
    }
    __name(normalizeChannelId, "normalizeChannelId");
    function formatSeconds(ms) {
      return `${Math.max(0, Math.floor((ms || 0) / 1e3))}s`;
    }
    __name(formatSeconds, "formatSeconds");
    function getPhaseLabel(phase, chinese) {
      switch (phase) {
        case "collecting":
          return chinese ? "收集中" : "collecting";
        case "requesting":
          return chinese ? "请求中" : "requesting";
        case "repairing":
          return chinese ? "修复中" : "repairing";
        case "committing":
          return chinese ? "提交中" : "committing";
        case "done":
          return chinese ? "已完成" : "done";
        case "failed":
          return chinese ? "已失败" : "failed";
        default:
          return "";
      }
    }
    __name(getPhaseLabel, "getPhaseLabel");
    function hasCounterMoved(previous, next) {
      return LOADED_STATUS_PROGRESS_FIELDS.some((field) => (previous[field] || 0) !== (next[field] || 0));
    }
    __name(hasCounterMoved, "hasCounterMoved");
    function renderPhaseSegment(status, chinese, currentTime, stalledAfterMs) {
      let phase = status && status.phase;
      if (!phase || LOADED_STATUS_TERMINAL_PHASES.has(phase)) return "";
      let label = getPhaseLabel(phase, chinese);
      if (!label) return "";
      let progressAt = status.progressAt || status.phaseStartedAt || 0, sinceProgressMs = progressAt ? Math.max(0, currentTime - progressAt) : 0;
      if (progressAt && sinceProgressMs >= stalledAfterMs)
        return chinese ? `，${label} ${formatSeconds(sinceProgressMs)} 无进展` : `, ${label} ${formatSeconds(sinceProgressMs)} no progress`;
      let phaseStartedAt = status.phaseStartedAt || 0;
      return phaseStartedAt ? chinese ? `，${label} ${formatSeconds(currentTime - phaseStartedAt)}` : `, ${label} ${formatSeconds(currentTime - phaseStartedAt)}` : chinese ? `，${label}` : `, ${label}`;
    }
    __name(renderPhaseSegment, "renderPhaseSegment");
    function getStatusCounters(status) {
      let total = Math.max(0, status && status.total || 0), processed = Math.max(0, Math.min(total || 0, status && status.processed || 0)), displayed = Math.max(0, Math.min(total || 0, status && status.displayed || 0)), displayPending = Math.max(0, Math.min(total || 0, status && status.displayPending || 0)), skipped = Math.max(0, Math.min(total || 0, status && status.skipped || 0)), failedValue = status && status.failed != null ? status.failed : status && status.aiDropped, failed = Math.max(0, failedValue || 0), retryable = Math.max(0, status && status.retryable || 0), batch = Math.max(1, status && status.batch || 1);
      return { total, processed, displayed, displayPending, skipped, failed, retryable, batch };
    }
    __name(getStatusCounters, "getStatusCounters");
    function renderCompactStatusText(status, currentTime) {
      let { total, processed, displayed, displayPending, skipped, failed, retryable } = getStatusCounters(status), ratio = `${status && status.done ? displayed : processed}/${total}`, repairReady = Math.max(displayed, total - skipped - (retryable || failed));
      if (status && status.phase === "repairing") return `${repairReady}/${total}${retryable || failed ? ` · ${retryable || failed}↻` : ""}`;
      if (status && (status.phase === "failed" || status.done && (failed || retryable))) return `${displayed}/${total} · ${failed || retryable}!`;
      if (status && status.done && displayPending) return `${displayed}/${total} · ${displayPending}↻`;
      if (status && status.done) return `${displayed}/${total}`;
      let phaseStartedAt = status && status.phaseStartedAt || 0;
      return phaseStartedAt ? `${ratio} · ${formatSeconds(currentTime - phaseStartedAt)}` : ratio;
    }
    __name(renderCompactStatusText, "renderCompactStatusText");
    function renderStatusDetailText(status, chinese, phaseSegment) {
      let { total, processed, displayed, displayPending, skipped, failed, retryable, batch } = getStatusCounters(status), extraText = `${displayPending ? chinese ? `，待显示 ${displayPending}` : `, ${displayPending} awaiting display` : ""}${skipped ? chinese ? `，跳过 ${skipped}` : `, skipped ${skipped}` : ""}${failed ? chinese ? `，失败 ${failed}` : `, failed ${failed}` : ""}${retryable && retryable != failed ? chinese ? `，待重试 ${retryable}` : `, retry pending ${retryable}` : ""}`;
      return status && status.done ? total ? chinese ? `已加载翻译：第 ${batch} 批完成，显示 ${displayed}/${total}${extraText}` : `Loaded translation: batch ${batch} done, shown ${displayed}/${total}${extraText}` : failed || retryable ? chinese ? `已加载翻译：失败 ${failed}，待重试 ${retryable}` : `Loaded translation: ${failed} failed, ${retryable} retry pending` : chinese ? "已加载翻译：开启，暂无待翻译" : "Loaded translation: on, no pending messages" : status && status.collecting ? chinese ? `收集已加载：第 ${batch} 批 ${processed}/${total}${extraText}${phaseSegment}` : `Collecting loaded: batch ${batch} ${processed}/${total}${extraText}${phaseSegment}` : total ? chinese ? `翻译已加载：第 ${batch} 批 ${processed}/${total}，显示 ${displayed}${extraText}${phaseSegment}` : `Translating loaded: batch ${batch} ${processed}/${total}, shown ${displayed}${extraText}${phaseSegment}` : chinese ? "已加载翻译：开启，等待消息" : "Loaded translation: on, waiting";
    }
    __name(renderStatusDetailText, "renderStatusDetailText");
    function createLoadedTranslationStatusStore({
      now = Date.now,
      setTimeout: scheduleTimer = null,
      clearTimeout: cancelTimer = null,
      isChineseUiLanguage = /* @__PURE__ */ __name(() => !1, "isChineseUiLanguage"),
      stalledAfterMs = 45e3,
      requestFrame = /* @__PURE__ */ __name((callback) => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : globalThis.setTimeout(callback, 16), "requestFrame"),
      cancelFrame = /* @__PURE__ */ __name((handle) => typeof cancelAnimationFrame == "function" ? cancelAnimationFrame(handle) : globalThis.clearTimeout(handle), "cancelFrame")
    } = {}) {
      let startTimer = scheduleTimer || ((callback, delay) => globalThis.setTimeout(callback, delay)), stopTimer = cancelTimer || ((handle) => globalThis.clearTimeout(handle)), positionFrame = null, status = createEmptyStatus(), hideTimer = null, refreshTimer = null, seenMessages = {}, sealedTotal = null, sealedJobKey = "";
      function resolvePhase(previous, next, updates) {
        if (updates && typeof updates.phase == "string" && LOADED_STATUS_PHASE_SET.has(updates.phase)) return updates.phase;
        if (next.done) return "done";
        if (next.collecting) return "collecting";
        if (!next.active) return null;
        let carried = previous.phase;
        return !carried || carried === "collecting" || LOADED_STATUS_TERMINAL_PHASES.has(carried) ? "requesting" : carried;
      }
      __name(resolvePhase, "resolvePhase");
      function readStatus(statusOverride) {
        return statusOverride === void 0 ? status : statusOverride;
      }
      return __name(readStatus, "readStatus"), Object.freeze({
        getStatus() {
          return Object.assign({}, status);
        },
        getChannelId() {
          return status.channelId;
        },
        isForChannel(channelId) {
          return normalizeChannelId(status.channelId) === normalizeChannelId(channelId);
        },
        isActive() {
          return !!status.active;
        },
        isDone() {
          return !!status.done;
        },
        // The batch label shown for the batch already running.
        getCurrentBatchNumber() {
          return status.batch || 1;
        },
        // Without a channel the counter simply advances. With one it restarts at 1 when
        // the status belongs to a different channel, so a channel switch never inherits
        // another channel's batch number.
        getNextBatchNumber(channelId = null) {
          return channelId == null ? (status.batch || 0) + 1 : (this.isForChannel(channelId) && status.batch || 0) + 1;
        },
        getPhaseForJobState(jobState) {
          return LOADED_STATUS_PHASE_BY_JOB_STATE[jobState] || null;
        },
        update(updates = {}) {
          let previous = status, next = Object.assign({}, previous, updates), nextJobKey = `${normalizeChannelId(next.channelId)}:${Math.max(0, next.batch || 0)}`;
          return nextJobKey !== sealedJobKey && (sealedJobKey = nextJobKey, sealedTotal = null, Object.prototype.hasOwnProperty.call(updates, "displayPending") || (next.displayPending = 0)), next.phase = resolvePhase(previous, next, updates), sealedTotal === null && !next.collecting && (next.active || next.done) && next.total > 0 && (sealedTotal = Math.max(0, next.total || 0)), sealedTotal !== null && !next.collecting && (next.total = sealedTotal), next.phase !== previous.phase ? (next.phaseStartedAt = now(), next.progressAt = next.phaseStartedAt) : (next.phaseStartedAt = previous.phaseStartedAt, next.progressAt = hasCounterMoved(previous, next) ? now() : previous.progressAt), status = next, this.getStatus();
        },
        clear() {
          return this.cancelTimers(), status = createEmptyStatus(), sealedTotal = null, sealedJobKey = "", this.getStatus();
        },
        // Reports whether the phase is progressing, so a caller can log or diagnose
        // without parsing the rendered text.
        getPhaseSnapshot(statusOverride) {
          let target = readStatus(statusOverride), phase = target && target.phase || null, currentTime = now(), phaseStartedAt = target && target.phaseStartedAt || 0, progressAt = target && target.progressAt || phaseStartedAt, terminal = LOADED_STATUS_TERMINAL_PHASES.has(phase), sinceProgressMs = progressAt ? Math.max(0, currentTime - progressAt) : 0, stalled = !!phase && !terminal && !!progressAt && sinceProgressMs >= stalledAfterMs;
          return {
            phase,
            label: getPhaseLabel(phase, !!isChineseUiLanguage()),
            phaseStartedAt,
            phaseElapsedMs: phaseStartedAt ? Math.max(0, currentTime - phaseStartedAt) : 0,
            progressAt,
            sinceProgressMs,
            stalled,
            working: !!phase && !terminal && !stalled
          };
        },
        getStatusText(statusOverride) {
          let target = readStatus(statusOverride);
          return renderCompactStatusText(target, now());
        },
        getStatusDetailText(statusOverride) {
          let target = readStatus(statusOverride), chinese = !!isChineseUiLanguage();
          return renderStatusDetailText(target, chinese, renderPhaseSegment(target, chinese, now(), stalledAfterMs));
        },
        getPreviewText(text) {
          return text = (text || "").replace(/\s+/g, " ").trim(), text ? text.length > 24 ? `${text.slice(0, 24)}...` : text : "";
        },
        // The inline variant falls back to a generic sentence whenever the record belongs
        // to another channel, so a channel switch never shows the previous channel's counts.
        getInlineStatusText(selectedChannelId) {
          let statusChannelId = status.channelId, matchesChannel = !statusChannelId || statusChannelId == "__global" || normalizeChannelId(statusChannelId) === normalizeChannelId(selectedChannelId);
          return (status.active || status.done) && matchesChannel ? this.getStatusText(status) : isChineseUiLanguage() ? "已加载消息自动翻译已开启，等待当前批次…" : "Loaded-message auto-translate is on; waiting for the current batch…";
        },
        hasPendingHide() {
          return hideTimer !== null;
        },
        cancelHide() {
          hideTimer !== null && stopTimer(hideTimer), hideTimer = null;
        },
        // The handle is cleared before the callback runs, so the callback may schedule
        // another hide without cancelling itself.
        scheduleHide(delay, onHide) {
          return this.cancelHide(), hideTimer = startTimer(() => {
            hideTimer = null, typeof onHide == "function" && onHide();
          }, delay), hideTimer;
        },
        hasPendingRefresh() {
          return refreshTimer !== null;
        },
        cancelRefresh() {
          refreshTimer !== null && stopTimer(refreshTimer), refreshTimer = null;
        },
        cancelTimers() {
          this.cancelHide(), this.cancelRefresh();
        },
        scheduleRefresh(delay, onRefresh) {
          return this.cancelRefresh(), refreshTimer = startTimer(() => {
            refreshTimer = null, typeof onRefresh == "function" && onRefresh();
          }, delay), refreshTimer;
        },
        getSeenCount(channelId) {
          let key = normalizeChannelId(channelId), seen = key && seenMessages[key];
          return seen ? Object.keys(seen).length : 0;
        },
        // Returns whether this message had already been seen in this channel session,
        // which is what the boundary dedup decides on.
        markMessageSeen(channelId, messageId) {
          let key = normalizeChannelId(channelId), messageKey = normalizeChannelId(messageId);
          if (!key || !messageKey) return !1;
          seenMessages[key] || (seenMessages[key] = {});
          let wasSeen = !!seenMessages[key][messageKey];
          return seenMessages[key][messageKey] = !0, wasSeen;
        },
        // The banner is repositioned after every status change, and a historical batch
        // changes the status once per message. Repositioning reads getBoundingClientRect,
        // which forces a synchronous layout, so the callers used to pay for two of those
        // per message - one immediate, one in an undeduped animation frame. One frame is
        // enough, and coalescing means a burst of N updates costs one layout, not 2N.
        schedulePosition(callback) {
          return typeof callback != "function" || positionFrame !== null ? !1 : (positionFrame = requestFrame(() => {
            positionFrame = null, callback();
          }), !0);
        },
        cancelScheduledPosition() {
          positionFrame !== null && (cancelFrame(positionFrame), positionFrame = null);
        },
        // The seen map only serves boundary dedup inside the active channel session;
        // keeping it for left channels grows memory for the whole Discord session.
        resetSeen(channelId = null) {
          let key = normalizeChannelId(channelId);
          if (!key) {
            seenMessages = {};
            return;
          }
          delete seenMessages[key];
        }
      });
    }
    __name(createLoadedTranslationStatusStore, "createLoadedTranslationStatusStore");
    module2.exports = {
      LOADED_STATUS_COMPLETION_HIDE_MS: 3e3,
      LOADED_STATUS_REFRESH_MS: 1e3,
      LOADED_STATUS_STALLED_AFTER_MS: 45e3,
      LOADED_STATUS_PREVIEW_MAX_LENGTH: 24,
      LOADED_STATUS_PHASES,
      LOADED_STATUS_PHASE_BY_JOB_STATE,
      createLoadedTranslationStatusStore
    };
  }
});

// src/cache/translation-cache-store.js
var require_translation_cache_store = __commonJS({
  "src/cache/translation-cache-store.js"(exports2, module2) {
    var PERSISTED_RECEIVED_SKIP_REASONS = Object.freeze(["same_language", "too_similar", "ai_skip_signal", "source_filter"]), SIGNATURE_DIGEST_PREFIX = "h1:";
    function createTranslationCacheStore({
      now = Date.now,
      setTimeout: setTimeout2,
      clearTimeout: clearTimeout2,
      // Persistence. loadCache returns whatever is on disk, including garbage.
      loadCache = /* @__PURE__ */ __name(() => null, "loadCache"),
      saveCache = /* @__PURE__ */ __name(() => {
      }, "saveCache"),
      // Message shape helpers owned by the received-translation runtime.
      extractOriginalContentData = /* @__PURE__ */ __name(() => ({}), "extractOriginalContentData"),
      createSignature = /* @__PURE__ */ __name(() => "", "createSignature"),
      normalizeStoredTranslation = /* @__PURE__ */ __name((translation) => translation, "normalizeStoredTranslation"),
      extractLegacyDisplayedParts = /* @__PURE__ */ __name(() => ({}), "extractLegacyDisplayedParts"),
      // Policy and display seams. A cache lookup has no business deciding any of these,
      // but the lookup it replaces did, so they are injected rather than reimplemented.
      refreshTranslationDisplay = /* @__PURE__ */ __name((translation) => translation, "refreshTranslationDisplay"),
      isTranslationResultTooSimilar = /* @__PURE__ */ __name(() => !1, "isTranslationResultTooSimilar"),
      shouldSkipBeforeRequest = /* @__PURE__ */ __name(() => !1, "shouldSkipBeforeRequest"),
      shouldKeepAutoTranslatedResult = /* @__PURE__ */ __name(() => !0, "shouldKeepAutoTranslatedResult"),
      getSkipPreviewText = /* @__PURE__ */ __name((text) => text == null ? "" : String(text), "getSkipPreviewText")
    } = {}) {
      let cache = {}, saveTimer = null;
      function hashSignature(signature) {
        let text = String(signature ?? ""), hash = 2166136261;
        for (let index = 0; index < text.length; index++)
          hash ^= text.charCodeAt(index), hash = Math.imul(hash, 16777619) >>> 0;
        return `${SIGNATURE_DIGEST_PREFIX}${hash.toString(36)}:${text.length.toString(36)}`;
      }
      __name(hashSignature, "hashSignature");
      function matchesSignature(entry, signature) {
        return !entry || entry.signature == null ? !1 : String(entry.signature).indexOf(SIGNATURE_DIGEST_PREFIX) !== 0 ? entry.signature == signature : entry.signature == hashSignature(signature);
      }
      __name(matchesSignature, "matchesSignature");
      function scheduleSave() {
        saveTimer && clearTimeout2(saveTimer), saveTimer = setTimeout2((_) => {
          saveCache(cache), saveTimer = null;
        }, 300);
      }
      __name(scheduleSave, "scheduleSave");
      function cancelPendingSave() {
        saveTimer && clearTimeout2(saveTimer), saveTimer = null;
      }
      __name(cancelPendingSave, "cancelPendingSave");
      function evictOldestBeyondLimit() {
        let cacheKeys = Object.keys(cache);
        cacheKeys.length <= 500 || cacheKeys.sort((keyA, keyB) => (cache[keyA].cachedAt || 0) - (cache[keyB].cachedAt || 0)).slice(0, cacheKeys.length - 500).forEach((key) => delete cache[key]);
      }
      __name(evictOldestBeyondLimit, "evictOldestBeyondLimit");
      function dropEntry(messageId) {
        delete cache[messageId], scheduleSave();
      }
      __name(dropEntry, "dropEntry");
      function getCachedTranslation(message, channelId, originalContentData = null) {
        if (!message || !cache[message.id]) return null;
        let sourceData = originalContentData || extractOriginalContentData(message), signature = createSignature(message, channelId, sourceData);
        if (!matchesSignature(cache[message.id], signature) || cache[message.id].skipped) return null;
        let cachedTranslation = Object.assign({ signature, channelId }, cache[message.id].translation), beforeSerialized = JSON.stringify(cachedTranslation || {});
        if (cachedTranslation = normalizeStoredTranslation(cachedTranslation), !cachedTranslation.originalContent && sourceData && sourceData.content && (cachedTranslation.originalContent = String(sourceData.content)), !cachedTranslation.translatedContent && cachedTranslation.content && (cachedTranslation.translatedContent = extractLegacyDisplayedParts(cachedTranslation.content).translatedContent || cachedTranslation.content), !cachedTranslation.translatedContent || (sourceData && sourceData.content || "").trim() && !String(cachedTranslation.originalContent || "").trim()) return null;
        if (cachedTranslation = refreshTranslationDisplay(cachedTranslation), isTranslationResultTooSimilar(cachedTranslation) || shouldSkipBeforeRequest(sourceData, channelId) || !shouldKeepAutoTranslatedResult(cachedTranslation, channelId))
          return dropEntry(message.id), null;
        if (JSON.stringify(cachedTranslation || {}) != beforeSerialized) {
          let upgradedTranslation = Object.assign({}, cachedTranslation);
          delete upgradedTranslation.signature, cache[message.id].translation = upgradedTranslation, cache[message.id].signature = hashSignature(signature), cache[message.id].cachedAt = cache[message.id].cachedAt || now(), scheduleSave();
        }
        return cachedTranslation;
      }
      __name(getCachedTranslation, "getCachedTranslation");
      function getCachedSkipDecision(message, channelId, originalContentData = null) {
        if (!message || !cache[message.id]) return null;
        let sourceData = originalContentData || extractOriginalContentData(message), signature = createSignature(message, channelId, sourceData);
        if (!matchesSignature(cache[message.id], signature)) return null;
        let skipped = cache[message.id].skipped;
        return !skipped || !skipped.reason ? null : skipped.policyVersion !== 2 ? (dropEntry(message.id), null) : Object.assign({ signature, channelId }, skipped);
      }
      __name(getCachedSkipDecision, "getCachedSkipDecision");
      function shouldPersistSkipDecision(reason) {
        return PERSISTED_RECEIVED_SKIP_REASONS.includes(reason);
      }
      __name(shouldPersistSkipDecision, "shouldPersistSkipDecision");
      function persistTranslation(messageId, signature, translation) {
        let storedTranslation = Object.assign({}, translation);
        delete storedTranslation.signature, cache[messageId] = {
          signature: hashSignature(signature),
          cachedAt: now(),
          translation: storedTranslation
        }, evictOldestBeyondLimit(), scheduleSave();
      }
      __name(persistTranslation, "persistTranslation");
      function persistSkipDecision(messageId, signature, reason, preview = "") {
        !messageId || !signature || !reason || !shouldPersistSkipDecision(reason) || (cache[messageId] = {
          signature: hashSignature(signature),
          cachedAt: now(),
          skipped: {
            policyVersion: 2,
            reason,
            preview: getSkipPreviewText(preview)
          }
        }, evictOldestBeyondLimit(), scheduleSave());
      }
      __name(persistSkipDecision, "persistSkipDecision");
      function clear(messageId) {
        !messageId || !cache[messageId] || dropEntry(messageId);
      }
      __name(clear, "clear");
      function loadPersisted() {
        let loaded = loadCache();
        return cache = loaded && typeof loaded == "object" && !Array.isArray(loaded) ? loaded : {}, cache;
      }
      return __name(loadPersisted, "loadPersisted"), Object.freeze({
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
        // Used when the plugin stops: the pending save is abandoned, not flushed, which
        // is what the legacy shutdown did.
        cancelPendingSave,
        loadPersisted,
        hashSignature,
        matchesSignature,
        // Writes an entry with a raw, undigested signature, the shape a pre-digest install
        // has on disk. Only the compatibility tests need it.
        seedRawEntryForTest(messageId, signature, translation) {
          cache[messageId] = { signature, cachedAt: now(), translation: Object.assign({}, translation) };
        }
      });
    }
    __name(createTranslationCacheStore, "createTranslationCacheStore");
    module2.exports = {
      MAX_TRANSLATION_CACHE_ENTRIES: 500,
      RECEIVED_SKIP_CACHE_POLICY_VERSION: 2,
      TRANSLATION_CACHE_SAVE_DEBOUNCE_MS: 300,
      PERSISTED_RECEIVED_SKIP_REASONS,
      SIGNATURE_DIGEST_PREFIX,
      createTranslationCacheStore
    };
  }
});

// src/sent/sent-translation-store.js
var require_sent_translation_store = __commonJS({
  "src/sent/sent-translation-store.js"(exports2, module2) {
    function createSentTranslationStore({
      now = Date.now,
      // The plugin can be stopped while a translation call is still in flight; a request
      // created before the stop must not be able to commit its result afterwards.
      isRuntimeActive = /* @__PURE__ */ __name(() => !0, "isRuntimeActive"),
      isTranslationEnabled = /* @__PURE__ */ __name(() => !0, "isTranslationEnabled"),
      isOwnMessage = /* @__PURE__ */ __name(() => !1, "isOwnMessage")
    } = {}) {
      let requests = {}, requestSequence = 0, generation = 0, pendingOriginals = [], originalsByMessageId = {}, manualRequests = {};
      function pruneExpiredPendingOriginals() {
        let cutoff = now() - 12e4;
        pendingOriginals = pendingOriginals.filter((entry) => entry && entry.createdAt >= cutoff);
      }
      __name(pruneExpiredPendingOriginals, "pruneExpiredPendingOriginals");
      function isCurrentRequest(request) {
        return !!(request && !request.completed && isRuntimeActive() && request.generation == generation && requests[request.id] === request && isTranslationEnabled(request.channelId));
      }
      __name(isCurrentRequest, "isCurrentRequest");
      function finishRequest(request) {
        return !request || request.completed ? !1 : (request.completed = !0, requests[request.id] === request && delete requests[request.id], !0);
      }
      __name(finishRequest, "finishRequest");
      function appendPendingOriginal(channelId, originalText, submittedText) {
        return originalText = String(originalText || ""), submittedText = String(submittedText || ""), !channelId || !originalText || !submittedText || originalText == submittedText ? !1 : (pruneExpiredPendingOriginals(), pendingOriginals.push({ channelId, originalText, submittedText, createdAt: now() }), pendingOriginals.length > 200 && pendingOriginals.splice(0, pendingOriginals.length - 200), !0);
      }
      __name(appendPendingOriginal, "appendPendingOriginal");
      function rememberOriginalForMessage(messageId, channelId, originalText, submittedText) {
        if (!messageId) return !1;
        if (originalText = String(originalText || ""), submittedText = String(submittedText || ""), !originalText || !submittedText || originalText == submittedText)
          return delete originalsByMessageId[messageId], !1;
        pruneExpiredPendingOriginals(), originalsByMessageId[messageId] = { channelId, originalText, submittedText, capturedAt: now() };
        let messageIds = Object.keys(originalsByMessageId);
        return messageIds.length > 200 && messageIds.sort((left, right) => originalsByMessageId[left].capturedAt - originalsByMessageId[right].capturedAt).slice(0, messageIds.length - 200).forEach((id) => delete originalsByMessageId[id]), !0;
      }
      return __name(rememberOriginalForMessage, "rememberOriginalForMessage"), Object.freeze({
        // A request is the receipt for one send or edit that may be rewritten before it
        // reaches Discord. It carries the generation it was born in so a late callback
        // can be told apart from a live one.
        createRequest(channelId, originalText, messageId = null) {
          if (!channelId) return null;
          let request = {
            id: ++requestSequence,
            generation,
            channelId,
            messageId: messageId ? String(messageId) : null,
            originalText: String(originalText || ""),
            completed: !1
          };
          return requests[request.id] = request, request;
        },
        isRequestCurrent(request) {
          return isCurrentRequest(request);
        },
        // Always submits something: a superseded request falls back to the untranslated
        // text rather than dropping the user's message on the floor. Only a still-current
        // request is allowed to record an original, because only then was one substituted.
        completeRequest(request, translatedText, submit) {
          if (!request || request.completed || typeof submit != "function") return Promise.resolve(!1);
          let current = isCurrentRequest(request), nextText = current ? translatedText : request.originalText;
          return finishRequest(request), Promise.resolve(submit(nextText)).then((_) => (current && (request.messageId ? rememberOriginalForMessage(request.messageId, request.channelId, request.originalText, nextText) : appendPendingOriginal(request.channelId, request.originalText, nextText)), !0));
        },
        // Without a channel this is a runtime-wide invalidation, so the generation moves
        // and every request ever issued becomes stale. A channel-scoped call only drops
        // that channel's requests; requests elsewhere stay live.
        invalidateRequests(channelId = null) {
          channelId || generation++;
          for (let requestId of Object.keys(requests)) {
            let request = requests[requestId];
            channelId && request.channelId != channelId || delete requests[requestId];
          }
        },
        trackPendingOriginal(channelId, originalText, submittedText) {
          return appendPendingOriginal(channelId, originalText, submittedText);
        },
        // Discord echoes our own sent message back; matching it against a pending entry is
        // what promotes an anonymous send into a message id we can prefill on edit.
        captureEcho(message, channelId = null) {
          if (!message || !message.id || !isOwnMessage(message)) return !1;
          channelId = channelId || message.channel_id || null;
          let submittedText = String(message.content || "");
          if (!channelId || !submittedText) return !1;
          pruneExpiredPendingOriginals();
          let pendingIndex = pendingOriginals.findIndex((entry) => entry.channelId == channelId && entry.submittedText == submittedText);
          if (pendingIndex < 0) return !1;
          let pending = pendingOriginals.splice(pendingIndex, 1)[0];
          return rememberOriginalForMessage(String(message.id), channelId, pending.originalText, submittedText);
        },
        // Editing a translated message must show the user what they typed, not what we
        // sent. If the visible text no longer matches what we sent, someone else changed
        // the message and the record is worthless.
        getEditableText(messageId, currentText) {
          pruneExpiredPendingOriginals();
          let stored = messageId && originalsByMessageId[messageId];
          return stored ? String(currentText || "") != stored.submittedText ? (delete originalsByMessageId[messageId], currentText) : stored.originalText : currentText;
        },
        // A restart must not let anything issued by the previous run commit. Remembered
        // originals deliberately survive, so an edit still prefills after a reload.
        resetForStart() {
          generation++, requests = {}, pendingOriginals = [];
        },
        clearPendingOriginals() {
          pendingOriginals = [];
        },
        // Manual requests are keyed by channel and message rather than by an id, because
        // the guard they exist for is "this exact message is already being translated by
        // hand"; the same message in a popout and in the chat list is one request.
        createManualRequestKey(channelId, messageId) {
          return `${channelId || "__global"}:${String(messageId)}`;
        },
        hasManualRequest(key) {
          return !!manualRequests[key];
        },
        beginManualRequest(key) {
          let request = {};
          return manualRequests[key] = request, request;
        },
        // A second manual translation of the same message replaces the first; the first
        // must then discard its result instead of painting over the newer one.
        isManualRequestCurrent(key, request) {
          return manualRequests[key] === request;
        },
        releaseManualRequest(key, request) {
          return !key || manualRequests[key] !== request ? !1 : (delete manualRequests[key], !0);
        },
        clearManualRequests() {
          manualRequests = {};
        }
      });
    }
    __name(createSentTranslationStore, "createSentTranslationStore");
    module2.exports = { SENT_ORIGINAL_MATCH_TTL: 12e4, MAX_SENT_ORIGINAL_ENTRIES: 200, createSentTranslationStore };
  }
});

// src/orchestrator/live-handoff-reservations.js
var require_live_handoff_reservations = __commonJS({
  "src/orchestrator/live-handoff-reservations.js"(exports2, module2) {
    function normalizeIdentity(value) {
      return value == null ? "" : String(value);
    }
    __name(normalizeIdentity, "normalizeIdentity");
    function createLiveHandoffReservations({ onRetired = /* @__PURE__ */ __name(() => {
    }, "onRetired") } = {}) {
      let sequence = 0, reservations = /* @__PURE__ */ new Map();
      function reserve(channelId, ticket) {
        let channelKey = normalizeIdentity(channelId), ticketKey = normalizeIdentity(ticket);
        if (!channelKey || !ticketKey) return null;
        let existing = reservations.get(channelKey);
        return existing && existing.ticket === ticketKey || reservations.set(channelKey, { ticket: ticketKey, order: ++sequence }), ticketKey;
      }
      __name(reserve, "reserve");
      function clear(channelId = null, ticket = null) {
        if (channelId == null)
          return reservations.clear(), !0;
        let channelKey = normalizeIdentity(channelId), existing = reservations.get(channelKey);
        return !existing || ticket != null && existing.ticket !== normalizeIdentity(ticket) ? !1 : (reservations.delete(channelKey), !0);
      }
      __name(clear, "clear");
      function consume(channelId, ticket) {
        let channelKey = normalizeIdentity(channelId), existing = reservations.get(channelKey);
        return !existing || existing.ticket !== normalizeIdentity(ticket) ? !1 : (reservations.delete(channelKey), !0);
      }
      __name(consume, "consume");
      function retire(channelId, ticket, reason = "retired") {
        return clear(channelId, ticket) ? (onRetired(channelId, normalizeIdentity(ticket), reason), !0) : !1;
      }
      __name(retire, "retire");
      function findNextQueueIndex(queue, getIdentity) {
        let selectedIndex = -1, selectedOrder = 1 / 0;
        for (let index = 0; index < queue.length; index++) {
          let identity = getIdentity(queue[index]), existing = identity && reservations.get(normalizeIdentity(identity.channelId));
          !existing || existing.ticket !== normalizeIdentity(identity.ticket) || existing.order >= selectedOrder || (selectedIndex = index, selectedOrder = existing.order);
        }
        return selectedIndex;
      }
      return __name(findNextQueueIndex, "findNextQueueIndex"), Object.freeze({ reserve, clear, consume, retire, findNextQueueIndex });
    }
    __name(createLiveHandoffReservations, "createLiveHandoffReservations");
    module2.exports = { createLiveHandoffReservations };
  }
});

// src/orchestrator/live-request-registry.js
var require_live_request_registry = __commonJS({
  "src/orchestrator/live-request-registry.js"(exports2, module2) {
    function createLiveRequestRegistry({
      normalizeChannelId = /* @__PURE__ */ __name((value) => value == null ? "" : String(value), "normalizeChannelId"),
      isRuntimeActive = /* @__PURE__ */ __name(() => !0, "isRuntimeActive"),
      isTranslationEnabled = /* @__PURE__ */ __name(() => !1, "isTranslationEnabled"),
      extractOriginalContentData = /* @__PURE__ */ __name(() => null, "extractOriginalContentData"),
      createTranslationSignature = /* @__PURE__ */ __name(() => null, "createTranslationSignature"),
      releaseDisplayPending = /* @__PURE__ */ __name(() => {
      }, "releaseDisplayPending"),
      clearReservedLiveRequest = /* @__PURE__ */ __name(() => !1, "clearReservedLiveRequest"),
      retireReservedLiveRequest = /* @__PURE__ */ __name(() => !1, "retireReservedLiveRequest")
    } = {}) {
      let queuedMessages = {}, liveRequests = {}, requestSequence = 0, runtimeGeneration = 0, finishedRequests = /* @__PURE__ */ new WeakSet();
      function getRequestKey(messageId, channelId) {
        return `${channelId || "__global"}:${String(messageId || "")}`;
      }
      __name(getRequestKey, "getRequestKey");
      function releaseRequestDisplayPending(request) {
        return request ? (releaseDisplayPending({
          messageId: request.messageId,
          channelId: request.channelId,
          requestIdentity: String(request.id)
        }), !0) : !1;
      }
      __name(releaseRequestDisplayPending, "releaseRequestDisplayPending");
      function forgetQueuedRequest(request) {
        request && queuedMessages[request.messageId] === request && delete queuedMessages[request.messageId];
      }
      __name(forgetQueuedRequest, "forgetQueuedRequest");
      function finishRequest(request) {
        if (!request || finishedRequests.has(request)) return !1;
        finishedRequests.add(request);
        let key = getRequestKey(request.messageId, request.channelId);
        return liveRequests[key] === request && delete liveRequests[key], forgetQueuedRequest(request), releaseRequestDisplayPending(request), retireReservedLiveRequest(request.channelId, String(request.id), "request-finished"), !0;
      }
      __name(finishRequest, "finishRequest");
      function createRequest(message, channelId, originalContentData = null, signature = null) {
        if (!message || !message.id || !channelId) return null;
        let request = {
          id: ++requestSequence,
          generation: runtimeGeneration,
          channelId,
          messageId: String(message.id),
          signature: signature || createTranslationSignature(message, channelId, originalContentData || extractOriginalContentData(message))
        };
        return liveRequests[getRequestKey(request.messageId, channelId)] = request, request;
      }
      __name(createRequest, "createRequest");
      function isRequestCurrent(request, message = null) {
        return !request || !isRuntimeActive() || request.generation !== runtimeGeneration || !isTranslationEnabled(request.channelId) || liveRequests[getRequestKey(request.messageId, request.channelId)] !== request ? !1 : message ? createTranslationSignature(message, request.channelId, extractOriginalContentData(message)) === request.signature : !0;
      }
      __name(isRequestCurrent, "isRequestCurrent");
      function invalidateRequests(channelId = null) {
        clearReservedLiveRequest(channelId), channelId || runtimeGeneration++;
        let channelKey = normalizeChannelId(channelId);
        for (let requestKey of Object.keys(liveRequests)) {
          let request = liveRequests[requestKey];
          channelKey && normalizeChannelId(request.channelId) !== channelKey || (delete liveRequests[requestKey], finishedRequests.add(request), forgetQueuedRequest(request), releaseRequestDisplayPending(request));
        }
      }
      __name(invalidateRequests, "invalidateRequests");
      function invalidateRequestForMessage(messageId, channelId, currentSignature) {
        if (!messageId || !channelId || !currentSignature) return !1;
        let key = getRequestKey(messageId, channelId), request = liveRequests[key];
        return !request || request.signature === currentSignature ? !1 : (delete liveRequests[key], finishedRequests.add(request), forgetQueuedRequest(request), releaseRequestDisplayPending(request), retireReservedLiveRequest(channelId, String(request.id), "source-invalidated"), !0);
      }
      __name(invalidateRequestForMessage, "invalidateRequestForMessage");
      function removeMessage(messageId, channelId) {
        if (!messageId || !channelId) return !1;
        let key = getRequestKey(messageId, channelId), request = liveRequests[key];
        return request ? (delete liveRequests[key], finishedRequests.add(request), forgetQueuedRequest(request), releaseRequestDisplayPending(request), retireReservedLiveRequest(channelId, String(request.id), "source-deleted"), !0) : !1;
      }
      __name(removeMessage, "removeMessage");
      function clearQueuedMessage(messageId, expectedMarker = null) {
        return expectedMarker && queuedMessages[messageId] !== expectedMarker || !Object.prototype.hasOwnProperty.call(queuedMessages, messageId) ? !1 : (delete queuedMessages[messageId], !0);
      }
      return __name(clearQueuedMessage, "clearQueuedMessage"), Object.freeze({
        getRequestKey,
        createRequest,
        isRequestCurrent,
        finishRequest,
        releaseRequestDisplayPending,
        invalidateRequests,
        invalidateRequestForMessage,
        removeMessage,
        restartRequestGeneration() {
          runtimeGeneration++;
          for (let request of Object.values(liveRequests)) finishedRequests.add(request);
          liveRequests = {};
        },
        getRuntimeGeneration: /* @__PURE__ */ __name(() => runtimeGeneration, "getRuntimeGeneration"),
        isMessageQueued: /* @__PURE__ */ __name((messageId) => !!queuedMessages[messageId], "isMessageQueued"),
        getQueuedMarker: /* @__PURE__ */ __name((messageId) => queuedMessages[messageId] || null, "getQueuedMarker"),
        markMessageQueued(messageId, marker) {
          return queuedMessages[messageId] = marker, marker;
        },
        clearQueuedMessage,
        clearHistoricalQueuedMessage(messageId, jobId) {
          let marker = messageId && queuedMessages[messageId];
          return !marker || marker.type !== "historical" || marker.jobId !== jobId ? !1 : clearQueuedMessage(messageId, marker);
        },
        clearAllQueuedMessages() {
          queuedMessages = {};
        }
      });
    }
    __name(createLiveRequestRegistry, "createLiveRequestRegistry");
    module2.exports = { createLiveRequestRegistry };
  }
});

// src/orchestrator/live-channel-session.js
var require_live_channel_session = __commonJS({
  "src/orchestrator/live-channel-session.js"(exports2, module2) {
    function createLiveChannelSession({
      normalizeChannelId = /* @__PURE__ */ __name((value) => value == null ? "" : String(value), "normalizeChannelId"),
      resetLoadedMessageTracking = /* @__PURE__ */ __name(() => {
      }, "resetLoadedMessageTracking"),
      clearEligibleReplyPreviewMessages = /* @__PURE__ */ __name(() => {
      }, "clearEligibleReplyPreviewMessages"),
      clearChannelTranslationQueue = /* @__PURE__ */ __name(() => {
      }, "clearChannelTranslationQueue"),
      onChannelSessionLeft = /* @__PURE__ */ __name(() => {
      }, "onChannelSessionLeft"),
      onChannelSessionStarted = /* @__PURE__ */ __name(() => {
      }, "onChannelSessionStarted"),
      onLiveTurnStarted = /* @__PURE__ */ __name(() => {
      }, "onLiveTurnStarted")
    } = {}) {
      let channelStates = {}, liveTurnCounts = {}, lastChannelId = null;
      function getChannelState(channelId) {
        if (!channelId) return null;
        let key = normalizeChannelId(channelId);
        return channelStates[key] || (channelStates[key] = { initialized: !1, boundaryMessageId: null }), channelStates[key];
      }
      __name(getChannelState, "getChannelState");
      function noteLiveTurnStarted(channelId) {
        let key = normalizeChannelId(channelId);
        return key ? (liveTurnCounts[key] = (liveTurnCounts[key] || 0) + 1, onLiveTurnStarted(channelId, liveTurnCounts[key]), liveTurnCounts[key]) : 0;
      }
      __name(noteLiveTurnStarted, "noteLiveTurnStarted");
      function reset(channelId = null) {
        channelId ? (delete channelStates[normalizeChannelId(channelId)], delete liveTurnCounts[normalizeChannelId(channelId)], resetLoadedMessageTracking(channelId)) : (channelStates = {}, liveTurnCounts = {}, resetLoadedMessageTracking()), clearEligibleReplyPreviewMessages(channelId), (!channelId || normalizeChannelId(lastChannelId) === normalizeChannelId(channelId)) && (lastChannelId = null);
      }
      __name(reset, "reset");
      function prepare(channelId) {
        if (!channelId || normalizeChannelId(lastChannelId) === normalizeChannelId(channelId)) return;
        let previousChannelId = lastChannelId;
        previousChannelId && (clearChannelTranslationQueue(previousChannelId), resetLoadedMessageTracking(previousChannelId), onChannelSessionLeft(previousChannelId)), lastChannelId = channelId;
        let channelState = getChannelState(channelId);
        channelState.initialized = !1, channelState.boundaryMessageId = null, resetLoadedMessageTracking(channelId), clearEligibleReplyPreviewMessages(channelId), onChannelSessionStarted(channelId);
      }
      return __name(prepare, "prepare"), Object.freeze({
        getChannelState,
        getStartedLiveTurnCount: /* @__PURE__ */ __name((channelId) => liveTurnCounts[normalizeChannelId(channelId)] || 0, "getStartedLiveTurnCount"),
        noteLiveTurnStarted,
        reset,
        prepare,
        getLastChannelId: /* @__PURE__ */ __name(() => lastChannelId, "getLastChannelId")
      });
    }
    __name(createLiveChannelSession, "createLiveChannelSession");
    module2.exports = { createLiveChannelSession };
  }
});

// src/orchestrator/live-translation-queue.js
var require_live_translation_queue = __commonJS({
  "src/orchestrator/live-translation-queue.js"(exports2, module2) {
    var { createLiveHandoffReservations } = require_live_handoff_reservations(), { createLiveRequestRegistry } = require_live_request_registry(), { createLiveChannelSession } = require_live_channel_session(), AUTO_TRANSLATION_QUEUE_RETRY_DELAY = 900, LIVE_AI_BATCH_ITEM_LIMIT = 10;
    function normalizeChannelId(channelId) {
      return channelId == null ? "" : String(channelId);
    }
    __name(normalizeChannelId, "normalizeChannelId");
    function createLiveTranslationQueue({
      setTimeout: scheduleTimer = null,
      clearTimeout: cancelTimer = null,
      batchItemLimit = LIVE_AI_BATCH_ITEM_LIMIT,
      retryDelay = AUTO_TRANSLATION_QUEUE_RETRY_DELAY,
      // Runtime facts the queue has to consult but must never own.
      isRuntimeActive = /* @__PURE__ */ __name(() => !0, "isRuntimeActive"),
      isTranslationEnabled = /* @__PURE__ */ __name(() => !1, "isTranslationEnabled"),
      extractOriginalContentData = /* @__PURE__ */ __name(() => null, "extractOriginalContentData"),
      createTranslationSignature = /* @__PURE__ */ __name(() => null, "createTranslationSignature"),
      getMessageChannelId = /* @__PURE__ */ __name(() => null, "getMessageChannelId"),
      isProviderBackoffActive = /* @__PURE__ */ __name(() => !1, "isProviderBackoffActive"),
      shouldAutoTranslateMessage = /* @__PURE__ */ __name(() => !1, "shouldAutoTranslateMessage"),
      isMessageWithinLoadedRange = /* @__PURE__ */ __name(() => !0, "isMessageWithinLoadedRange"),
      // Display-store ownership stays with the display modules; the queue only says when.
      getDisplayCommitGeneration = /* @__PURE__ */ __name(() => 0, "getDisplayCommitGeneration"),
      markDisplayPending = /* @__PURE__ */ __name(() => null, "markDisplayPending"),
      releaseDisplayPending = /* @__PURE__ */ __name(() => {
      }, "releaseDisplayPending"),
      scheduleDisplayFlush = /* @__PURE__ */ __name(() => {
      }, "scheduleDisplayFlush"),
      // Neighbouring runtime state that a channel session has to reset alongside ours.
      collectHistoricalMessage = /* @__PURE__ */ __name(() => !1, "collectHistoricalMessage"),
      resetLoadedMessageTracking = /* @__PURE__ */ __name(() => {
      }, "resetLoadedMessageTracking"),
      clearEligibleReplyPreviewMessages = /* @__PURE__ */ __name(() => {
      }, "clearEligibleReplyPreviewMessages"),
      clearChannelTranslationQueue = /* @__PURE__ */ __name(() => {
      }, "clearChannelTranslationQueue"),
      onChannelSessionLeft = /* @__PURE__ */ __name(() => {
      }, "onChannelSessionLeft"),
      onChannelSessionStarted = /* @__PURE__ */ __name(() => {
      }, "onChannelSessionStarted"),
      onLiveTurnStarted = /* @__PURE__ */ __name(() => {
      }, "onLiveTurnStarted"),
      onReservedLiveRequestConsumed = /* @__PURE__ */ __name(() => {
      }, "onReservedLiveRequestConsumed"),
      onReservedLiveRequestRetired = /* @__PURE__ */ __name(() => {
      }, "onReservedLiveRequestRetired"),
      // Translation policy. Everything below decides what a translation IS; the queue only
      // decides when it runs, in what order, and what happens to the item afterwards.
      getBatchEngineKey = /* @__PURE__ */ __name(() => null, "getBatchEngineKey"),
      createBurstContext = /* @__PURE__ */ __name(() => null, "createBurstContext"),
      prepareBurstItem = /* @__PURE__ */ __name(() => null, "prepareBurstItem"),
      requestBurstTranslation = /* @__PURE__ */ __name(() => Promise.resolve(null), "requestBurstTranslation"),
      resolveBurstItemResult = /* @__PURE__ */ __name(() => ({ status: "retry" }), "resolveBurstItemResult"),
      commitBurstResult = /* @__PURE__ */ __name(() => null, "commitBurstResult"),
      commitCachedResult = /* @__PURE__ */ __name(() => null, "commitCachedResult"),
      translateSingleItem = /* @__PURE__ */ __name(() => Promise.resolve(), "translateSingleItem")
    } = {}) {
      let startTimer = scheduleTimer || ((callback, delay) => globalThis.setTimeout(callback, delay)), stopTimer = cancelTimer || ((handle) => globalThis.clearTimeout(handle)), queue = [], busyTranslating = !1, liveAutoTranslating = !1, retryTimer = null, lastConsumedLiveRequests = {}, handoffReservations = createLiveHandoffReservations({ onRetired: onReservedLiveRequestRetired }), channelSession = createLiveChannelSession({
        normalizeChannelId,
        resetLoadedMessageTracking,
        clearEligibleReplyPreviewMessages,
        clearChannelTranslationQueue,
        onChannelSessionLeft,
        onChannelSessionStarted,
        onLiveTurnStarted
      }), requestRegistry = createLiveRequestRegistry({
        normalizeChannelId,
        isRuntimeActive,
        isTranslationEnabled,
        extractOriginalContentData,
        createTranslationSignature,
        releaseDisplayPending,
        clearReservedLiveRequest: handoffReservations.clear,
        retireReservedLiveRequest: handoffReservations.retire
      });
      function cancelQueueRetry() {
        retryTimer && stopTimer(retryTimer), retryTimer = null;
      }
      __name(cancelQueueRetry, "cancelQueueRetry");
      function scheduleQueueRetry() {
        retryTimer || (retryTimer = startTimer((_) => {
          retryTimer = null, processQueue();
        }, retryDelay));
      }
      __name(scheduleQueueRetry, "scheduleQueueRetry");
      function clearQueue(channelId = null) {
        if (requestRegistry.invalidateRequests(channelId), !channelId) {
          queue = [], requestRegistry.clearAllQueuedMessages(), lastConsumedLiveRequests = {}, handoffReservations.clear(), cancelQueueRetry();
          return;
        }
        let key = normalizeChannelId(channelId);
        delete lastConsumedLiveRequests[key], handoffReservations.clear(channelId), queue = queue.filter((queueItem) => {
          let shouldRemove = !!(queueItem && queueItem.channel && normalizeChannelId(queueItem.channel.id) === key);
          return shouldRemove && queueItem.message && queueItem.message.id && requestRegistry.clearQueuedMessage(queueItem.message.id, queueItem.liveRequest || null), !shouldRemove;
        }), !queue.length && retryTimer && cancelQueueRetry();
      }
      __name(clearQueue, "clearQueue");
      function removeMessage(messageId, channelId) {
        let normalizedMessageId = messageId == null ? "" : String(messageId), normalizedChannelId = normalizeChannelId(channelId);
        if (!normalizedMessageId || !normalizedChannelId) return !1;
        let removed = requestRegistry.removeMessage(normalizedMessageId, normalizedChannelId);
        return queue = queue.filter((queueItem) => {
          let queueMessageId = queueItem && queueItem.message && String(queueItem.message.id || ""), queueChannelId = normalizeChannelId(queueItem && queueItem.channel && queueItem.channel.id || queueItem && getMessageChannelId(queueItem.message));
          return queueMessageId !== normalizedMessageId || queueChannelId !== normalizedChannelId ? !0 : (removed = !0, requestRegistry.clearQueuedMessage(normalizedMessageId, queueItem.liveRequest || null), !1);
        }), !queue.length && retryTimer && cancelQueueRetry(), removed;
      }
      __name(removeMessage, "removeMessage");
      function reserveQueuedLiveRequest(channelId) {
        let key = normalizeChannelId(channelId);
        if (!key) return null;
        for (let queueItem of queue) {
          let queueChannelId = queueItem && queueItem.channel && queueItem.channel.id || queueItem && getMessageChannelId(queueItem.message);
          if (!queueItem || queueItem.historicalLoad || normalizeChannelId(queueChannelId) !== key || !queueItem.liveRequest || !requestRegistry.isRequestCurrent(queueItem.liveRequest)) continue;
          let ticket = String(queueItem.liveRequest.id);
          return handoffReservations.reserve(key, ticket);
        }
        return handoffReservations.clear(key), null;
      }
      __name(reserveQueuedLiveRequest, "reserveQueuedLiveRequest");
      function recordLiveRequestConsumption(request, reason = "single") {
        if (!request || !request.channelId) return null;
        let key = normalizeChannelId(request.channelId), ticket = String(request.id);
        return key ? (lastConsumedLiveRequests[key] = ticket, handoffReservations.consume(request.channelId, ticket) && onReservedLiveRequestConsumed(request.channelId, ticket, reason), ticket) : null;
      }
      __name(recordLiveRequestConsumption, "recordLiveRequestConsumption");
      function takeNextQueueItem() {
        if (!queue.length) return null;
        let reservedIndex = handoffReservations.findNextQueueIndex(queue, (queueItem) => ({
          channelId: queueItem && queueItem.channel && queueItem.channel.id || queueItem && getMessageChannelId(queueItem.message),
          ticket: queueItem && queueItem.liveRequest ? queueItem.liveRequest.id : null
        }));
        return reservedIndex >= 0 ? queue.splice(reservedIndex, 1)[0] : queue.shift();
      }
      __name(takeNextQueueItem, "takeNextQueueItem");
      function resetTracking(channelId = null) {
        channelId ? (delete lastConsumedLiveRequests[normalizeChannelId(channelId)], handoffReservations.clear(channelId)) : (lastConsumedLiveRequests = {}, handoffReservations.clear()), channelSession.reset(channelId);
      }
      __name(resetTracking, "resetTracking");
      function createQueueItem(message, channel, originalContentData = null, queueOptions = {}) {
        let normalizedOriginalContentData = originalContentData || extractOriginalContentData(message);
        return {
          message,
          channel,
          originalContentData: normalizedOriginalContentData,
          historicalLoad: !!queueOptions.historicalLoad,
          deferHistoricalSnapshotStart: !!queueOptions.deferHistoricalSnapshotStart,
          deferWhileReading: !!queueOptions.deferWhileReading,
          cachedTranslation: queueOptions.cachedTranslation || null,
          liveRequest: null
        };
      }
      __name(createQueueItem, "createQueueItem");
      function enqueueLiveItem(queueItem) {
        return queue.unshift(queueItem), processQueue(), !0;
      }
      __name(enqueueLiveItem, "enqueueLiveItem");
      function queueMessage(message, channel, originalContentData = null, queueOptions = {}) {
        if (!(queueOptions.cachedTranslation || null) && !shouldAutoTranslateMessage(message, channel, originalContentData) || queueOptions.historicalLoad && !isMessageWithinLoadedRange(message)) return !1;
        let queueItem = createQueueItem(message, channel, originalContentData, queueOptions);
        if (queueItem.historicalLoad) return collectHistoricalMessage(queueItem);
        let channelId = channel && channel.id || getMessageChannelId(message);
        if (queueItem.liveRequest = requestRegistry.createRequest(message, channelId, queueItem.originalContentData), !queueItem.liveRequest) return !1;
        requestRegistry.markMessageQueued(message.id, queueItem.liveRequest);
        let pendingMark = markDisplayPending({
          messageId: message.id,
          channelId,
          generation: getDisplayCommitGeneration(channelId),
          origin: "automatic",
          requestIdentity: String(queueItem.liveRequest.id)
        }, { refresh: !1 });
        return pendingMark && pendingMark.catch && pendingMark.catch((_) => {
        }), enqueueLiveItem(queueItem);
      }
      __name(queueMessage, "queueMessage");
      function beginProcessing() {
        return busyTranslating || liveAutoTranslating ? !1 : isProviderBackoffActive() ? (scheduleQueueRetry(), !1) : !0;
      }
      __name(beginProcessing, "beginProcessing");
      function completeCommit(queueItem, channelId, commit) {
        let finish = /* @__PURE__ */ __name((outcome) => {
          outcome && outcome.deferredIds && outcome.deferredIds.length && scheduleDisplayFlush(channelId, queueItem.message.id), requestRegistry.finishRequest(queueItem.liveRequest);
        }, "finish");
        return Promise.resolve(commit).then(finish, (_) => finish(null));
      }
      __name(completeCommit, "completeCommit");
      function handleCachedItem(queueItem) {
        if (!queueItem || !queueItem.cachedTranslation) return !1;
        let channelId = queueItem.channel && queueItem.channel.id || "__global", commit = commitCachedResult(queueItem, channelId);
        return recordLiveRequestConsumption(queueItem.liveRequest, "cached"), completeCommit(queueItem, channelId, commit), !0;
      }
      __name(handleCachedItem, "handleCachedItem");
      function handleGuardFailure(queueItem) {
        return !queueItem || shouldAutoTranslateMessage(queueItem.message, queueItem.channel, queueItem.originalContentData, !0) ? !1 : (recordLiveRequestConsumption(queueItem.liveRequest, "guard"), requestRegistry.finishRequest(queueItem.liveRequest), !0);
      }
      __name(handleGuardFailure, "handleGuardFailure");
      function collectBatchItems(firstItem) {
        let channelId = firstItem.channel && firstItem.channel.id || getMessageChannelId(firstItem.message);
        if (!channelId || firstItem.skipLiveBatch || firstItem.cachedTranslation || !getBatchEngineKey(channelId)) return null;
        let items = [firstItem];
        for (let index = 0; index < queue.length && items.length < batchItemLimit; ) {
          let candidate = queue[index], candidateChannelId = candidate && candidate.channel && candidate.channel.id || candidate && getMessageChannelId(candidate.message);
          if (!candidate || !candidate.message || candidate.historicalLoad || candidate.cachedTranslation || candidate.skipLiveBatch || normalizeChannelId(candidateChannelId) !== normalizeChannelId(channelId)) {
            index++;
            continue;
          }
          queue.splice(index, 1), items.push(candidate);
        }
        return items.length > 1 ? { channelId, items } : null;
      }
      __name(collectBatchItems, "collectBatchItems");
      function commitBurstItem(queueItem, channelId, result) {
        let commit = commitBurstResult(queueItem, channelId, Object.assign({
          requestIdentity: queueItem.liveRequest ? String(queueItem.liveRequest.id) : null
        }, result));
        return completeCommit(queueItem, channelId, commit);
      }
      __name(commitBurstItem, "commitBurstItem");
      function requeueBurstItem(queueItem, settled) {
        if (settled.add(queueItem), queueItem.skipLiveBatch = !0, !requestRegistry.isRequestCurrent(queueItem.liveRequest, queueItem.message)) {
          requestRegistry.finishRequest(queueItem.liveRequest);
          return;
        }
        queue.unshift(queueItem);
      }
      __name(requeueBurstItem, "requeueBurstItem");
      async function translateBurst(burst) {
        let { channelId, items } = burst, settled = /* @__PURE__ */ new Set();
        liveAutoTranslating = !0;
        try {
          let context = createBurstContext(channelId), prepared = [];
          for (let queueItem of items)
            try {
              if (!requestRegistry.isRequestCurrent(queueItem.liveRequest, queueItem.message)) {
                settled.add(queueItem), requestRegistry.finishRequest(queueItem.liveRequest);
                continue;
              }
              let preparedItem = prepareBurstItem(queueItem, channelId, context);
              if (!preparedItem || preparedItem.skipped || preparedItem.cachedTranslation || !preparedItem.protectedText) {
                requeueBurstItem(queueItem, settled);
                continue;
              }
              prepared.push(preparedItem);
            } catch {
              requeueBurstItem(queueItem, settled);
            }
          if (!prepared.length) return;
          channelSession.noteLiveTurnStarted(channelId);
          for (let preparedItem of prepared) if (preparedItem && preparedItem.queueItem && preparedItem.queueItem.liveRequest && recordLiveRequestConsumption(preparedItem.queueItem.liveRequest, "burst")) break;
          let batchOutcome = null;
          try {
            batchOutcome = await requestBurstTranslation(context, prepared);
          } catch {
            batchOutcome = null;
          }
          let detailedOutcome = batchOutcome && typeof batchOutcome == "object" && (Object.prototype.hasOwnProperty.call(batchOutcome, "translations") || batchOutcome.failureKind), resultMap = detailedOutcome ? batchOutcome.translations : batchOutcome, terminalFailure = detailedOutcome && ["auth", "configuration", "permanent"].includes(batchOutcome.failureKind), commits = [];
          for (let preparedItem of prepared) {
            let queueItem = preparedItem.queueItem;
            try {
              let resolved = resolveBurstItemResult(preparedItem, resultMap, channelId) || { status: "retry" };
              if (resolved.status === "retry") {
                if (terminalFailure) {
                  settled.add(queueItem), requestRegistry.finishRequest(queueItem.liveRequest);
                  continue;
                }
                requeueBurstItem(queueItem, settled);
                continue;
              }
              if (resolved.status !== "skipped" && !requestRegistry.isRequestCurrent(queueItem.liveRequest, queueItem.message)) {
                settled.add(queueItem), requestRegistry.finishRequest(queueItem.liveRequest);
                continue;
              }
              settled.add(queueItem), commits.push(commitBurstItem(queueItem, channelId, resolved.result));
            } catch {
              requeueBurstItem(queueItem, settled);
            }
          }
          await Promise.all(commits);
        } finally {
          for (let queueItem of items)
            if (!settled.has(queueItem))
              try {
                requestRegistry.finishRequest(queueItem.liveRequest);
              } catch {
              }
          liveAutoTranslating = !1, processQueue();
        }
      }
      __name(translateBurst, "translateBurst");
      function translateSingle(queueItem) {
        let channelId = queueItem && queueItem.channel && queueItem.channel.id || getMessageChannelId(queueItem && queueItem.message);
        channelSession.noteLiveTurnStarted(channelId), liveAutoTranslating = !0, recordLiveRequestConsumption(queueItem && queueItem.liveRequest, "single"), translateSingleItem(queueItem).then((_) => {
          requestRegistry.finishRequest(queueItem.liveRequest), liveAutoTranslating = !1, processQueue();
        }).catch((_) => {
          requestRegistry.finishRequest(queueItem.liveRequest), liveAutoTranslating = !1, processQueue();
        });
      }
      __name(translateSingle, "translateSingle");
      function processQueue() {
        if (!beginProcessing() || !queue.length) return;
        let nextItem = takeNextQueueItem();
        if (!nextItem || !nextItem.message) return processQueue();
        if (nextItem.historicalLoad)
          return collectHistoricalMessage(nextItem), processQueue();
        if (!requestRegistry.isRequestCurrent(nextItem.liveRequest, nextItem.message))
          return requestRegistry.finishRequest(nextItem.liveRequest), processQueue();
        if (handleCachedItem(nextItem) || handleGuardFailure(nextItem)) return processQueue();
        let burst = null;
        try {
          burst = collectBatchItems(nextItem);
        } catch {
          burst = null;
        }
        return burst ? translateBurst(burst).catch((_) => {
        }) : translateSingle(nextItem);
      }
      return __name(processQueue, "processQueue"), Object.freeze({
        // Live request registry.
        getRequestKey: requestRegistry.getRequestKey,
        createRequest: requestRegistry.createRequest,
        isRequestCurrent: requestRegistry.isRequestCurrent,
        finishRequest: requestRegistry.finishRequest,
        releaseRequestDisplayPending: requestRegistry.releaseRequestDisplayPending,
        invalidateRequests: requestRegistry.invalidateRequests,
        invalidateRequestForMessage: requestRegistry.invalidateRequestForMessage,
        removeRequestForMessage: requestRegistry.removeMessage,
        // A restart retires every in-flight request without releasing display pending
        // records, because the display runtime is reset separately on start.
        restartRequestGeneration() {
          requestRegistry.restartRequestGeneration(), lastConsumedLiveRequests = {}, handoffReservations.clear();
        },
        getRuntimeGeneration: requestRegistry.getRuntimeGeneration,
        // Queued-message markers. Historical jobs park their own marker shape here so a
        // single lookup answers "is this message already spoken for".
        isMessageQueued: requestRegistry.isMessageQueued,
        getQueuedMarker: requestRegistry.getQueuedMarker,
        markMessageQueued: requestRegistry.markMessageQueued,
        clearQueuedMessage: requestRegistry.clearQueuedMessage,
        clearHistoricalQueuedMessage: requestRegistry.clearHistoricalQueuedMessage,
        clearAllQueuedMessages() {
          requestRegistry.clearAllQueuedMessages(), lastConsumedLiveRequests = {}, handoffReservations.clear();
        },
        // Queue contents and order.
        createQueueItem,
        enqueueLiveItem,
        queueMessage,
        removeMessage,
        clearQueue,
        processQueue,
        beginProcessing,
        isQueueEmpty: /* @__PURE__ */ __name(() => !queue.length, "isQueueEmpty"),
        getQueueLength: /* @__PURE__ */ __name(() => queue.length, "getQueueLength"),
        hasQueuedLiveForChannel(channelId) {
          let key = normalizeChannelId(channelId);
          return !!key && queue.some((queueItem) => queueItem && !queueItem.historicalLoad && normalizeChannelId(queueItem.channel && queueItem.channel.id || getMessageChannelId(queueItem.message)) === key);
        },
        reserveQueuedLiveRequest,
        clearReservedLiveRequest: handoffReservations.clear,
        getLastConsumedLiveRequestTicket: /* @__PURE__ */ __name((channelId) => lastConsumedLiveRequests[normalizeChannelId(channelId)] || null, "getLastConsumedLiveRequestTicket"),
        getStartedLiveTurnCount: channelSession.getStartedLiveTurnCount,
        // A copy: a reader must not be able to reorder the queue behind this module's back.
        getQueueSnapshot: /* @__PURE__ */ __name(() => queue.slice(), "getQueueSnapshot"),
        collectBatchItems,
        requeueBurstItem,
        translateBurst,
        translateSingle,
        handleCachedItem,
        handleGuardFailure,
        // Busy flags.
        isBusyTranslating: /* @__PURE__ */ __name(() => !!busyTranslating, "isBusyTranslating"),
        setBusyTranslating(value) {
          busyTranslating = !!value;
        },
        isLiveAutoTranslating: /* @__PURE__ */ __name(() => !!liveAutoTranslating, "isLiveAutoTranslating"),
        setLiveAutoTranslating(value) {
          liveAutoTranslating = !!value;
        },
        // Retry timer.
        scheduleQueueRetry,
        cancelQueueRetry,
        hasPendingQueueRetry: /* @__PURE__ */ __name(() => !!retryTimer, "hasPendingQueueRetry"),
        // Per-channel session bookkeeping.
        getChannelState: channelSession.getChannelState,
        prepareChannelSession: channelSession.prepare,
        resetTracking,
        getLastChannelId: channelSession.getLastChannelId
      });
    }
    __name(createLiveTranslationQueue, "createLiveTranslationQueue");
    module2.exports = {
      AUTO_TRANSLATION_QUEUE_RETRY_DELAY,
      LIVE_AI_BATCH_ITEM_LIMIT,
      createLiveTranslationQueue
    };
  }
});

// src/orchestrator/historical-handoff-runtime.js
var require_historical_handoff_runtime = __commonJS({
  "src/orchestrator/historical-handoff-runtime.js"(exports2, module2) {
    function scheduleMicrotask(callback) {
      typeof queueMicrotask == "function" ? queueMicrotask(callback) : Promise.resolve().then(callback);
    }
    __name(scheduleMicrotask, "scheduleMicrotask");
    function resumeHistoricalHandoff(plugin, channelId = null, handoffTicket = null, { retired = !1 } = {}) {
      let resume = /* @__PURE__ */ __name(() => {
        let entries = channelId ? [plugin.getHistoricalTranslationJobQueue(channelId, !1)].filter(Boolean) : plugin.ensureHistoricalJobRegistry().listQueues();
        for (let entry of entries) {
          let hasSealedJob = entry && entry.jobs.some((job) => job && job.state == "collecting" && job.sealed), ticketMatches = entry && (retired ? entry.pendingLiveHandoffTicket != null && handoffTicket != null && String(handoffTicket) == String(entry.pendingLiveHandoffTicket) : entry.pendingLiveHandoffTicket == null || handoffTicket != null && String(handoffTicket) == String(entry.pendingLiveHandoffTicket));
          if (!(!entry || entry.runningPromise || !hasSealedJob || !ticketMatches)) {
            if (entry.pendingLiveHandoffTicket = null, retired) {
              let liveQueue = plugin.ensureLiveTranslationQueue(), replacementTicket = liveQueue.reserveQueuedLiveRequest(entry.channelId);
              if (replacementTicket) {
                entry.pendingLiveHandoffTicket = replacementTicket, liveQueue.processQueue();
                continue;
              }
            }
            plugin.startCollectedHistoricalTranslationJobs(entry.channelId, { sealCurrent: !1 });
          }
        }
      }, "resume");
      return retired ? scheduleMicrotask(resume) : resume();
    }
    __name(resumeHistoricalHandoff, "resumeHistoricalHandoff");
    module2.exports = { resumeHistoricalHandoff };
  }
});

// src/orchestrator/historical-job-registry.js
var require_historical_job_registry = __commonJS({
  "src/orchestrator/historical-job-registry.js"(exports2, module2) {
    function createHistoricalJobRegistry() {
      let queues = /* @__PURE__ */ new Map(), failedSnapshots = /* @__PURE__ */ new Map(), jobSequence = 0, runtimeGeneration = 0;
      function normalizeChannelId(channelId) {
        return channelId == null ? "" : String(channelId);
      }
      return __name(normalizeChannelId, "normalizeChannelId"), Object.freeze({
        // A queue entry is created on demand so callers can ask about a channel that
        // has never had a job without allocating one.
        getQueue(channelId, createWhenMissing = !0) {
          let key = normalizeChannelId(channelId);
          if (!key) return null;
          let entry = queues.get(key);
          return !entry && createWhenMissing && (entry = { channelId: key, generation: 0, jobs: [], runningPromise: null, startToken: null, intakeBlocked: !1, pendingLiveHandoffTicket: null }, queues.set(key, entry)), entry || null;
        },
        hasQueue(channelId) {
          return queues.has(normalizeChannelId(channelId));
        },
        isCurrentQueue(channelId, entry) {
          return !!entry && queues.get(normalizeChannelId(channelId)) === entry;
        },
        deleteQueue(channelId) {
          return queues.delete(normalizeChannelId(channelId));
        },
        clearQueues() {
          queues.clear();
        },
        listQueues() {
          return [...queues.values()];
        },
        nextJobId(channelId) {
          return `${normalizeChannelId(channelId)}:${++jobSequence}`;
        },
        // Bumping the generation is how a plugin stop or a bulk cancel makes every
        // in-flight job stale without having to reach into each one.
        advanceRuntimeGeneration() {
          return ++runtimeGeneration;
        },
        getRuntimeGeneration() {
          return runtimeGeneration;
        },
        getFailedSnapshot(channelId) {
          let key = normalizeChannelId(channelId);
          return key && failedSnapshots.get(key) || null;
        },
        setFailedSnapshot(channelId, snapshot) {
          let key = normalizeChannelId(channelId);
          return key ? (failedSnapshots.set(key, snapshot), snapshot) : null;
        },
        deleteFailedSnapshot(channelId) {
          return failedSnapshots.delete(normalizeChannelId(channelId));
        },
        clearFailedSnapshots() {
          failedSnapshots.clear();
        }
      });
    }
    __name(createHistoricalJobRegistry, "createHistoricalJobRegistry");
    module2.exports = { createHistoricalJobRegistry };
  }
});

// src/orchestrator/channel-toggle-operations.js
var require_channel_toggle_operations = __commonJS({
  "src/orchestrator/channel-toggle-operations.js"(exports2, module2) {
    function createChannelToggleOperations() {
      let versions = /* @__PURE__ */ new Map();
      function normalizeChannelId(channelId) {
        return String(channelId || "");
      }
      return __name(normalizeChannelId, "normalizeChannelId"), Object.freeze({
        begin(channelId) {
          let normalizedChannelId = normalizeChannelId(channelId), version = (versions.get(normalizedChannelId) || 0) + 1;
          return versions.set(normalizedChannelId, version), version;
        },
        isCurrent(channelId, version) {
          return versions.get(normalizeChannelId(channelId)) === version;
        },
        reset() {
          versions.clear();
        }
      });
    }
    __name(createChannelToggleOperations, "createChannelToggleOperations");
    module2.exports = { createChannelToggleOperations };
  }
});

// src/orchestrator/historical-translation-job.js
var require_historical_translation_job = __commonJS({
  "src/orchestrator/historical-translation-job.js"(exports2, module2) {
    var HISTORICAL_TERMINAL_ITEM_STATES = /* @__PURE__ */ new Set(["translated", "skipped", "failed", "cancelled"]), HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX = 100;
    function normalizeBatchOutcome(outcome) {
      return !!(outcome && typeof outcome == "object" && Object.prototype.hasOwnProperty.call(outcome, "translations") && Object.prototype.hasOwnProperty.call(outcome, "failureKind")) ? outcome : { translations: outcome, failureKind: null, statusCode: null };
    }
    __name(normalizeBatchOutcome, "normalizeBatchOutcome");
    function isTerminalProviderFailure(failureKind) {
      return ["auth", "configuration", "permanent"].includes(failureKind);
    }
    __name(isTerminalProviderFailure, "isTerminalProviderFailure");
    var _HistoricalTranslationJob = class _HistoricalTranslationJob {
      constructor(config = {}) {
        this.id = config.id || `historical-${Date.now()}`, this.channelId = config.channelId || null, this.generation = config.generation || 0, this.configurationSignature = config.configurationSignature || null, this.dependencies = Object.assign({
          prepare: /* @__PURE__ */ __name((item) => ({ status: "pending", prepared: item }), "prepare"),
          translateBatch: /* @__PURE__ */ __name(() => Promise.resolve(null), "translateBatch"),
          repairBatch: null,
          validate: /* @__PURE__ */ __name((_item, translatedText) => translatedText == null ? { ok: !1 } : { ok: !0, translation: translatedText }, "validate"),
          repair: /* @__PURE__ */ __name(() => Promise.resolve({ status: "failed", reason: "unresolved" }), "repair"),
          waitForCommit: /* @__PURE__ */ __name(() => Promise.resolve(), "waitForCommit"),
          isCurrent: /* @__PURE__ */ __name(() => !0, "isCurrent"),
          commit: /* @__PURE__ */ __name(() => {
          }, "commit"),
          onStateChange: /* @__PURE__ */ __name(() => {
          }, "onStateChange")
        }, config.dependencies || {}), this.items = /* @__PURE__ */ new Map(), this.state = "collecting", this.sealed = !1, this.cancelReason = null, this.started = !1, this.repairConcurrency = Math.max(1, parseInt(config.repairConcurrency, 10) || 4), this.repairBatchSize = Math.max(1, parseInt(config.repairBatchSize, 10) || 10);
      }
      add(item) {
        if (this.state != "collecting" || this.sealed) return !1;
        let source = item && item.message ? item : { message: item }, messageId = source.message && source.message.id;
        return !messageId || this.items.has(String(messageId)) ? !1 : (this.items.set(String(messageId), {
          source,
          prepared: null,
          status: "pending",
          translation: null,
          reason: null
        }), this.dependencies.onStateChange(this), !0);
      }
      seal() {
        return this.state != "collecting" || this.sealed ? !1 : (this.sealed = !0, this.dependencies.onStateChange(this), !0);
      }
      cancel(reason = "cancelled") {
        if (this.state == "committed" || this.state == "cancelled") return !1;
        this.cancelReason = reason, this.state = "cancelled";
        for (let record of this.items.values()) HISTORICAL_TERMINAL_ITEM_STATES.has(record.status) || (record.status = "cancelled");
        return this.dependencies.onStateChange(this), !0;
      }
      invalidateMessage(messageId, reason = "source-changed") {
        if (this.state == "committed" || this.state == "cancelled") return !1;
        let record = this.items.get(String(messageId));
        return !record || record.status == "cancelled" ? !1 : (record.status = "cancelled", record.translation = null, record.reason = reason, this.dependencies.onStateChange(this), !0);
      }
      isMessagePending(messageId) {
        let record = this.items.get(String(messageId));
        return !!record && this.state != "cancelled" && !HISTORICAL_TERMINAL_ITEM_STATES.has(record.status);
      }
      setPreparedOutcome(record, outcome) {
        outcome = outcome || { status: "failed", reason: "prepare_failed" }, outcome.status == "translated" ? (record.status = "translated", record.translation = outcome.translation) : outcome.status == "skipped" ? (record.status = "skipped", record.reason = outcome.reason || "skipped") : outcome.status == "failed" ? (record.status = "failed", record.reason = outcome.reason || "failed") : (record.status = "translating", record.prepared = outcome.prepared || record.source);
      }
      createSummary() {
        let summary = { jobId: this.id, channelId: this.channelId, generation: this.generation, translated: [], skipped: [], failed: [] };
        for (let record of this.items.values()) {
          let item = Object.assign({}, record.source, { translation: record.translation, reason: record.reason });
          record.status == "translated" ? summary.translated.push(item) : record.status == "skipped" ? summary.skipped.push(item) : record.status == "failed" && summary.failed.push(item);
        }
        return summary;
      }
      async start() {
        return this.started ? this.runningPromise : (this.sealed = !0, this.started = !0, this.state = "translating", this.dependencies.onStateChange(this), this.runningPromise = this.run(), this.runningPromise);
      }
      async run() {
        for (let record of this.items.values()) {
          if (this.state == "cancelled") return this.createSummary();
          if (record.status != "cancelled")
            try {
              this.setPreparedOutcome(record, await this.dependencies.prepare(record.source, this));
            } catch {
              this.setPreparedOutcome(record, { status: "failed", reason: "prepare_failed" });
            }
        }
        let translatingRecords = [...this.items.values()].filter((record) => record.status == "translating");
        if (translatingRecords.length && this.state != "cancelled") {
          let batchOutcome = null;
          try {
            batchOutcome = await this.dependencies.translateBatch(translatingRecords.map((record) => record.prepared), this);
          } catch {
          }
          if (this.state == "cancelled") return this.createSummary();
          let { translations: resultMap, failureKind } = normalizeBatchOutcome(batchOutcome);
          for (let record of translatingRecords) {
            if (record.status == "cancelled") continue;
            if (isTerminalProviderFailure(failureKind)) {
              record.status = "failed", record.reason = `provider_${failureKind}`;
              continue;
            }
            failureKind == "transient" && (record.transientRetry = !0);
            let messageId = String(record.source.message.id), rawTranslation = resultMap && Object.prototype.hasOwnProperty.call(resultMap, messageId) ? resultMap[messageId] : null, validation = { ok: !1 };
            try {
              validation = await this.dependencies.validate(record.prepared, rawTranslation, this) || { ok: !1 };
            } catch {
            }
            validation.ok ? (record.status = "translated", record.translation = validation.translation) : validation.skipped ? (record.status = "skipped", record.reason = validation.reason || "skipped") : record.status = "repairing";
          }
        }
        if (this.state == "cancelled") return this.createSummary();
        let unresolvedBatchRecords = [...this.items.values()].filter((record) => record.status == "repairing");
        if (unresolvedBatchRecords.length > 1 && typeof this.dependencies.repairBatch == "function") {
          let chunkSize = unresolvedBatchRecords.some((record) => record.transientRetry) ? unresolvedBatchRecords.length : Math.min(this.repairBatchSize, Math.max(1, Math.ceil(translatingRecords.length / 2)));
          for (let offset = 0; offset < unresolvedBatchRecords.length && this.state != "cancelled"; offset += chunkSize) {
            let chunk = unresolvedBatchRecords.slice(offset, offset + chunkSize).filter((record) => record.status == "repairing");
            if (!chunk.length) continue;
            let repairOutcome = null;
            try {
              repairOutcome = await this.dependencies.repairBatch(chunk.map((record) => record.prepared), this);
            } catch {
            }
            if (this.state == "cancelled") return this.createSummary();
            let { translations: repairResultMap, failureKind: repairFailureKind } = normalizeBatchOutcome(repairOutcome);
            for (let record of chunk) {
              if (record.status == "cancelled") continue;
              if (isTerminalProviderFailure(repairFailureKind) || repairFailureKind == "transient") {
                record.status = "failed", record.reason = `provider_${repairFailureKind}`;
                continue;
              }
              let messageId = String(record.source.message.id), rawTranslation = repairResultMap && Object.prototype.hasOwnProperty.call(repairResultMap, messageId) ? repairResultMap[messageId] : null, validation = { ok: !1 };
              try {
                validation = await this.dependencies.validate(record.prepared, rawTranslation, this) || { ok: !1 };
              } catch {
              }
              validation.ok ? (record.status = "translated", record.translation = validation.translation) : validation.skipped ? (record.status = "skipped", record.reason = validation.reason || "skipped") : record.transientRetry && (record.status = "failed", record.reason = "provider_transient");
            }
          }
        }
        if (this.state == "cancelled") return this.createSummary();
        this.state = "repairing", this.dependencies.onStateChange(this);
        let repairingRecords = [...this.items.values()].filter((record) => record.status == "repairing"), repairIndex = 0, repairNext = /* @__PURE__ */ __name(async () => {
          for (; repairIndex < repairingRecords.length && this.state != "cancelled"; ) {
            let record = repairingRecords[repairIndex++];
            if (!record || record.status == "cancelled") continue;
            let repairOutcome;
            try {
              repairOutcome = await this.dependencies.repair(record.prepared || record.source, this);
            } catch {
              repairOutcome = { status: "failed", reason: "repair_failed" };
            }
            record.status != "cancelled" && (this.setPreparedOutcome(record, repairOutcome), HISTORICAL_TERMINAL_ITEM_STATES.has(record.status) || (record.status = "failed", record.reason = "repair_failed"));
          }
        }, "repairNext");
        if (await Promise.all(Array.from({ length: Math.min(this.repairConcurrency, repairingRecords.length) }, () => repairNext())), this.state == "cancelled") return this.createSummary();
        if (this.state = "ready", this.dependencies.onStateChange(this), await this.dependencies.waitForCommit(this), this.state == "cancelled" || !this.dependencies.isCurrent(this))
          return this.cancel("stale_generation"), this.createSummary();
        let summary = this.createSummary();
        return await this.dependencies.commit(summary, this), this.state == "cancelled" ? this.createSummary() : (this.state = "committed", this.dependencies.onStateChange(this), summary);
      }
    };
    __name(_HistoricalTranslationJob, "HistoricalTranslationJob");
    var HistoricalTranslationJob = _HistoricalTranslationJob;
    module2.exports = {
      normalizeBatchOutcome,
      HISTORICAL_TERMINAL_ITEM_STATES,
      HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX,
      HistoricalTranslationJob
    };
  }
});

// src/orchestrator/historical-provider-chunking.js
var require_historical_provider_chunking = __commonJS({
  "src/orchestrator/historical-provider-chunking.js"(exports2, module2) {
    var { normalizeBatchOutcome } = require_historical_translation_job(), HISTORICAL_PROVIDER_CHUNK_SIZE = 10;
    function chunkPreparedItems(preparedItems, chunkSize) {
      let chunks = [];
      for (let offset = 0; offset < preparedItems.length; offset += chunkSize) chunks.push(preparedItems.slice(offset, offset + chunkSize));
      return chunks;
    }
    __name(chunkPreparedItems, "chunkPreparedItems");
    function isTerminalFailure(failureKind) {
      return ["auth", "configuration", "permanent"].includes(failureKind);
    }
    __name(isTerminalFailure, "isTerminalFailure");
    function runChunkedHistoricalBatch({ preparedItems, chunkSize = HISTORICAL_PROVIDER_CHUNK_SIZE, requestChunk, isCurrent = null, onChunkSettled = null }) {
      if (!Array.isArray(preparedItems) || !preparedItems.length) return Promise.resolve(null);
      let size = Math.max(1, Math.floor(chunkSize) || HISTORICAL_PROVIDER_CHUNK_SIZE);
      if (!requestChunk) return Promise.resolve(null);
      if (preparedItems.length <= size) return Promise.resolve(requestChunk(preparedItems)).then(normalizeBatchOutcome);
      let chunks = chunkPreparedItems(preparedItems, size);
      return (async () => {
        let translations = {}, firstFailure = null, answered = 0;
        for (let index = 0; index < chunks.length && !(isCurrent && !isCurrent()); index++) {
          let outcome = normalizeBatchOutcome(await requestChunk(chunks[index]));
          if (outcome && outcome.translations ? Object.assign(translations, outcome.translations) : !firstFailure && outcome && outcome.failureKind && (firstFailure = { failureKind: outcome.failureKind, statusCode: outcome.statusCode == null ? null : outcome.statusCode }), answered += chunks[index].length, onChunkSettled)
            try {
              onChunkSettled({ answered, total: preparedItems.length, chunkIndex: index, chunkCount: chunks.length });
            } catch {
            }
          if (!Object.keys(translations).length && firstFailure && isTerminalFailure(firstFailure.failureKind))
            return { translations: null, failureKind: firstFailure.failureKind, statusCode: firstFailure.statusCode };
        }
        return Object.keys(translations).length ? { translations, failureKind: null, statusCode: null } : firstFailure ? { translations: null, failureKind: firstFailure.failureKind, statusCode: firstFailure.statusCode } : null;
      })();
    }
    __name(runChunkedHistoricalBatch, "runChunkedHistoricalBatch");
    module2.exports = { runChunkedHistoricalBatch, HISTORICAL_PROVIDER_CHUNK_SIZE };
  }
});

// src/protection/protection-logic.js
var require_protection_logic = __commonJS({
  "src/protection/protection-logic.js"(exports2, module2) {
    var MESSAGE_PLACES = Object.freeze({
      RECEIVED: "received",
      SENT: "sent"
    }), TRANSLATION_PROTECTION_SIGNATURE_VERSION = "2026-06-16-auto-protect-v11";
    function createProtectionLogic({
      // The only thing protection needs from the library is the "is this a usable array"
      // guard it applies to the three user-editable exception lists. Defaulted so the
      // module is constructible on its own; the plugin injects the real library.
      BDFDB = { ArrayUtils: { is: Array.isArray } }
    } = {}) {
      let protectionLogic = {
        escapeRegExp(_plugin, string) {
          return (string || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        },
        getExceptionScopeSetting(plugin, key, fallback = !0) {
          let exceptions = plugin.settings && plugin.settings.exceptions || {};
          return exceptions[key] == null ? !!fallback : !!exceptions[key];
        },
        shouldProtectConfiguredTermsForPlace(plugin, place) {
          return place == MESSAGE_PLACES.SENT ? protectionLogic.getExceptionScopeSetting(plugin, "protectedTermsForSent", !0) : protectionLogic.getExceptionScopeSetting(plugin, "protectedTermsForReceived", !0);
        },
        shouldProtectWrappedTextForPlace(plugin, place) {
          return place == MESSAGE_PLACES.SENT ? protectionLogic.getExceptionScopeSetting(plugin, "wrapperPairsForSent", !0) : protectionLogic.getExceptionScopeSetting(plugin, "wrapperPairsForReceived", !0);
        },
        getProtectedTermsList(plugin) {
          let protectedTerms = BDFDB.ArrayUtils.is(plugin.settings.exceptions.protectedTerms) ? plugin.settings.exceptions.protectedTerms : [];
          return [...new Set(protectedTerms.map((term) => (term || "").trim()).filter(Boolean))].sort((termA, termB) => termB.length - termA.length);
        },
        trimTrailingProtectedPunctuation(_plugin, text) {
          if (!text) return { protectedText: text, trailingText: "" };
          let trailingMatch = text.match(/([,.;:!?'"`)\]}>，。！？；：）】」》、]+)$/);
          return !trailingMatch || trailingMatch.index < 1 ? { protectedText: text, trailingText: "" } : {
            protectedText: text.slice(0, trailingMatch.index),
            trailingText: trailingMatch[0]
          };
        },
        protectRegexMatches(plugin, string, regex, protectedSegments = {}, count = 0, options = {}) {
          if (!string || !(regex instanceof RegExp)) return { string, protectedSegments, count };
          regex.lastIndex = 0;
          let lastIndex = 0, nextString = "", hasMatch = !1, match;
          for (; match = regex.exec(string); ) {
            let fullMatch = match[0];
            if (!fullMatch) {
              regex.global && regex.lastIndex === match.index && regex.lastIndex++;
              continue;
            }
            let protectedText = fullMatch, trailingText = "";
            if (typeof options.normalize == "function") {
              let normalized = options.normalize(fullMatch, match, string) || {};
              protectedText = normalized.protectedText != null ? normalized.protectedText : protectedText, trailingText = normalized.trailingText || "";
            }
            if (!(!protectedText || !String(protectedText).trim()) && (hasMatch = !0, nextString += string.slice(lastIndex, match.index), protectedSegments[count] = protectedText, nextString += `${protectionLogic.createProtectionPlaceholder(plugin, count++)}${trailingText}`, lastIndex = match.index + fullMatch.length, !regex.global))
              break;
          }
          return hasMatch ? (nextString += string.slice(lastIndex), { string: nextString, protectedSegments, count }) : { string, protectedSegments, count };
        },
        protectCodeBlockSegments(plugin, string, protectedSegments = {}, count = 0) {
          return protectionLogic.protectRegexMatches(plugin, string, /```[\s\S]*?```/g, protectedSegments, count);
        },
        protectAutoDetectedSegments(plugin, string, protectedSegments = {}, count = 0) {
          let result = protectionLogic.protectRegexMatches(plugin, string, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi, protectedSegments, count);
          string = result.string, protectedSegments = result.protectedSegments, count = result.count;
          let trimTrailing = /* @__PURE__ */ __name((fullMatch) => protectionLogic.trimTrailingProtectedPunctuation(plugin, fullMatch), "trimTrailing");
          return result = protectionLogic.protectRegexMatches(plugin, string, /\bhttps?:\/\/[^\s<>()\u3000]+/gi, protectedSegments, count, { normalize: trimTrailing }), string = result.string, protectedSegments = result.protectedSegments, count = result.count, result = protectionLogic.protectRegexMatches(plugin, string, /\b(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?:\/[^\s<>()\u3000]*)?/gi, protectedSegments, count, {
            normalize: /* @__PURE__ */ __name((fullMatch) => {
              let trimmed = trimTrailing(fullMatch);
              return /[./]/.test(trimmed.protectedText || "") ? trimmed : { protectedText: "", trailingText: fullMatch };
            }, "normalize")
          }), string = result.string, protectedSegments = result.protectedSegments, count = result.count, result = protectionLogic.protectRegexMatches(plugin, string, /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?\b/g, protectedSegments, count), string = result.string, protectedSegments = result.protectedSegments, count = result.count, string = string.replace(/(^|\s)(\/[A-Za-z][A-Za-z0-9_-]{1,32})(?=\s|$)/g, (fullMatch, leading, command) => (protectedSegments[count] = command, `${leading || ""}${protectionLogic.createProtectionPlaceholder(plugin, count++)}`)), { string, protectedSegments, count };
        },
        protectDiscordMarkupSegments(plugin, string, protectedSegments = {}, count = 0) {
          return string ? protectionLogic.protectRegexMatches(plugin, string, /<a?:[A-Za-z0-9_~]+:\d+>|<@[!&]?\d+>|<#\d+>|<@&\d+>|<t:\d+(?::[tTdDfFR])?>/g, protectedSegments, count) : { string, protectedSegments, count };
        },
        protectQuotedTextSegments(plugin, string, protectedSegments = {}, count = 0) {
          if (!plugin.settings.general.protectQuotedText || !string) return { string, protectedSegments, count };
          let quotedRegex = /"([^"\r\n]+)"|“([^”\r\n]+)”/g;
          return string = string.replace(quotedRegex, (fullMatch) => !fullMatch || !fullMatch.slice(1, -1).trim() ? fullMatch : (protectedSegments[count] = fullMatch, protectionLogic.createProtectionPlaceholder(plugin, count++))), { string, protectedSegments, count };
        },
        protectWrappedTextSegments(plugin, string, protectedSegments = {}, count = 0, place = null) {
          if (!protectionLogic.shouldProtectWrappedTextForPlace(plugin, place) || !string) return { string, protectedSegments, count };
          for (let rule of plugin.getProtectedWrapperRules()) {
            let cursor = 0, nextString = "";
            for (; cursor < string.length; ) {
              let startIndex = string.indexOf(rule.left, cursor);
              if (startIndex < 0) {
                nextString += string.slice(cursor);
                break;
              }
              let contentStart = startIndex + rule.left.length, endIndex = string.indexOf(rule.right, contentStart);
              if (endIndex < 0) {
                nextString += string.slice(cursor);
                break;
              }
              let fullText = string.slice(startIndex, endIndex + rule.right.length), innerText = string.slice(contentStart, endIndex);
              nextString += string.slice(cursor, startIndex), innerText.trim() && !/[\r\n]/.test(fullText) ? (protectedSegments[count] = fullText, nextString += protectionLogic.createProtectionPlaceholder(plugin, count++)) : nextString += fullText, cursor = endIndex + rule.right.length;
            }
            string = nextString;
          }
          return { string, protectedSegments, count };
        },
        protectConfiguredTerms(plugin, string, protectedSegments = {}, count = 0) {
          let protectedTerms = protectionLogic.getProtectedTermsList(plugin), boundaryChars = "A-Za-z0-9_";
          for (let term of protectedTerms) {
            if (term = (term || "").trim(), !term) continue;
            let startsWithWord = new RegExp(`^[${boundaryChars}]`).test(term), endsWithWord = new RegExp(`[${boundaryChars}]$`).test(term), termPattern = term.split(/\s+/).filter(Boolean).map((part) => protectionLogic.escapeRegExp(plugin, part)).join("\\s*"), regex = new RegExp(`${startsWithWord ? `(^|[^${boundaryChars}])` : "()"}(${termPattern})${endsWithWord ? `(?=$|[^${boundaryChars}])` : ""}`, "gi");
            string = string.replace(regex, (match, leading, protectedTerm) => protectedTerm ? (protectedSegments[count] = protectedTerm, `${leading || ""}${protectionLogic.createProtectionPlaceholder(plugin, count++)}`) : match);
          }
          return { string, protectedSegments, count };
        },
        protectAutoTechnicalTerms(plugin, string, protectedSegments = {}, count = 0) {
          if (!string) return { string, protectedSegments, count };
          let protectToken = /* @__PURE__ */ __name((fullMatch, offset, fullString) => {
            if (!fullMatch || fullMatch.length < 2) return fullMatch;
            let left = fullString[offset - 1] || "", right = fullString[offset + fullMatch.length] || "";
            return /[A-Za-z0-9_]/.test(left) || /[A-Za-z0-9_]/.test(right) ? fullMatch : (protectedSegments[count] = fullMatch, protectionLogic.createProtectionPlaceholder(plugin, count++));
          }, "protectToken");
          string = string.replace(/\b[A-Za-z0-9_.-]{2,}\/[A-Za-z0-9_.-]{2,}(?:\/[A-Za-z0-9_.-]+)*\b/g, protectToken), string = string.replace(/\b[A-Za-z0-9_.-]+\.(?:js|jsx|ts|tsx|json|yml|yaml|toml|env|py|java|go|rs|cpp|c|h|css|html|md|txt|zip|rar|7z|exe|dll|png|jpg|jpeg|webp|gif|mp4|mov|psd|fig)\b/gi, protectToken), string = string.replace(/\bv\d+(?:\.\d+){1,4}(?:[-+][A-Za-z0-9.-]+)?\b|\b\d+(?:\.\d+){2,4}(?:[-+][A-Za-z0-9.-]+)?\b/gi, protectToken);
          let originalForShoutCheck = String(string);
          return (() => {
            let latinLetters = originalForShoutCheck.match(/[A-Za-z]/g) || [];
            return latinLetters.length < 4 || latinLetters.reduce((n, c) => n + (c >= "A" && c <= "Z" ? 1 : 0), 0) / latinLetters.length < 0.8 ? !1 : (originalForShoutCheck.match(/[一-鿿぀-ヿ가-힯]/g) || []).length * 2 < latinLetters.length;
          })() || (string = string.replace(/\b[A-Z][A-Z0-9]{1,}(?:[-_/+.][A-Z0-9]+)*\b/g, protectToken)), string = string.replace(/\b[A-Za-z]+(?:[A-Z][a-z0-9]+){1,}[A-Za-z0-9]*\b/g, protectToken), string = string.replace(/\b[A-Za-z0-9]+(?:[_-][A-Za-z0-9]+){1,}\b/g, protectToken), { string, protectedSegments, count };
        },
        protectMixedLanguageLatinTokens(_plugin, string, protectedSegments = {}, count = 0) {
          return { string, protectedSegments, count };
        },
        getUnicodeEmojiDetector() {
          try {
            return new RegExp("[\\u200D\\uFE0E\\uFE0F\\u20E3]|\\p{Extended_Pictographic}|\\p{Regional_Indicator}", "u");
          } catch {
            return /[\u200D\uFE0E\uFE0F\u20E3\u2600-\u27BF]|[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
          }
        },
        isUnicodeEmojiGrapheme(_plugin, segment) {
          if (!segment || typeof segment != "string" || /^(?:\d|#|\*)$/.test(segment)) return !1;
          let detector = protectionLogic.getUnicodeEmojiDetector();
          return !!(detector && detector.test(segment));
        },
        getUnicodeEmojiRegex() {
          try {
            return new RegExp("(?:\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?)*)", "gu");
          } catch {
            return /(?:[\u2600-\u27BF]\uFE0F?|[\uD83C-\uDBFF][\uDC00-\uDFFF](?:\uFE0F|\uFE0E)?(?:\u200D[\uD83C-\uDBFF][\uDC00-\uDFFF](?:\uFE0F|\uFE0E)?)*)/g;
          }
        },
        protectUnicodeEmojiSegments(plugin, string, protectedSegments = {}, count = 0) {
          if (!string) return { string, protectedSegments, count };
          if (typeof Intl < "u" && Intl.Segmenter) {
            let detector = protectionLogic.getUnicodeEmojiDetector(), segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" }), nextString = "";
            for (let part of segmenter.segment(string)) {
              let segment = part && part.segment || "";
              segment && detector && protectionLogic.isUnicodeEmojiGrapheme(plugin, segment) ? (protectedSegments[count] = segment, nextString += protectionLogic.createProtectionPlaceholder(plugin, count++)) : nextString += segment;
            }
            return { string: nextString, protectedSegments, count };
          }
          return protectionLogic.protectRegexMatches(plugin, string, protectionLogic.getUnicodeEmojiRegex(), protectedSegments, count);
        },
        createProtectionPlaceholder(_plugin, count) {
          return `⟦${count}⟧`;
        },
        getProtectionPlaceholderRegex(_plugin, count) {
          return new RegExp(`(?:⟦\\s*(?:DTA\\s*)?${count}\\s*⟧|【\\s*${count}\\s*】|\\[\\s*${count}\\s*\\]|<\\s*<\\s*<\\s*${count}\\s*>\\s*>\\s*>|[｛\\{]\\s*[｛\\{]\\s*${count}\\s*[｝\\}]\\s*[｝\\}])`, "g");
        },
        formatProtectedExceptionForDisplay(_plugin, exception) {
          return exception == null ? "" : (exception = String(exception), /^<a?:[A-Za-z0-9_~]+:\d+>$/.test(exception) || /^<@!?\d+>$/.test(exception) || /^<@&\d+>$/.test(exception) || /^<#\d+>$/.test(exception), exception);
        },
        // A protected span can swallow another one: with wrapper rules for both quotes and
        // backticks, `"x"` masks the quotes first, so segment 1 is the backtick pair and
        // its stored text is `<0>`. Placeholder 0 therefore never appears in the string the
        // provider was given, and both functions below have to account for that.
        getNestedProtectionPlaceholderKeys(plugin, protectedSegments) {
          let keys = Object.keys(protectedSegments || {}), nested = /* @__PURE__ */ new Set();
          for (let outer of keys) {
            let outerText = String(protectedSegments[outer]);
            for (let inner of keys)
              inner === outer || nested.has(inner) || protectionLogic.getProtectionPlaceholderRegex(plugin, inner).test(outerText) && nested.add(inner);
          }
          return nested;
        },
        hasAllProtectionPlaceholders(plugin, string, protectedSegments) {
          if (!protectedSegments || !Object.keys(protectedSegments).length) return !0;
          let nested = protectionLogic.getNestedProtectionPlaceholderKeys(plugin, protectedSegments);
          return Object.keys(protectedSegments).every((count) => nested.has(count) || protectionLogic.getProtectionPlaceholderRegex(plugin, count).test(string || ""));
        },
        addExceptions(plugin, string, protectedSegments) {
          let keys = Object.keys(protectedSegments || {});
          if (!keys.length) return string;
          for (let pass = 0; pass <= keys.length; pass++) {
            let changed = !1;
            for (let count of keys) {
              if (!protectionLogic.getProtectionPlaceholderRegex(plugin, count).test(string)) continue;
              let segmentText = String(protectedSegments[count]), exception = BDFDB.ArrayUtils.is(plugin.settings.exceptions.wordStart) && plugin.settings.exceptions.wordStart.some((n) => segmentText.indexOf(n) == 0) ? segmentText.slice(1) : segmentText, replacement = protectionLogic.formatProtectedExceptionForDisplay(plugin, exception);
              string = string.replace(protectionLogic.getProtectionPlaceholderRegex(plugin, count), replacement), changed = !0;
            }
            if (!changed) break;
          }
          return string;
        },
        removeExceptions(plugin, string, place) {
          let protectedSegments = {}, newString = [], count = 0, discordMarkupResult = protectionLogic.protectDiscordMarkupSegments(plugin, string, protectedSegments, count);
          string = discordMarkupResult.string, protectedSegments = discordMarkupResult.protectedSegments, count = discordMarkupResult.count;
          let codeBlockResult = protectionLogic.protectCodeBlockSegments(plugin, string, protectedSegments, count);
          string = codeBlockResult.string, protectedSegments = codeBlockResult.protectedSegments, count = codeBlockResult.count;
          let wrappedTextResult = protectionLogic.protectWrappedTextSegments(plugin, string, protectedSegments, count, place);
          string = wrappedTextResult.string, protectedSegments = wrappedTextResult.protectedSegments, count = wrappedTextResult.count;
          let autoProtectedResult = protectionLogic.protectAutoDetectedSegments(plugin, string, protectedSegments, count);
          if (string = autoProtectedResult.string, protectedSegments = autoProtectedResult.protectedSegments, count = autoProtectedResult.count, protectionLogic.shouldProtectConfiguredTermsForPlace(plugin, place)) {
            let protectedTermsResult = protectionLogic.protectConfiguredTerms(plugin, string, protectedSegments, count);
            string = protectedTermsResult.string, protectedSegments = protectedTermsResult.protectedSegments, count = protectedTermsResult.count;
          }
          let autoTechnicalTermsResult = protectionLogic.protectAutoTechnicalTerms(plugin, string, protectedSegments, count);
          string = autoTechnicalTermsResult.string, protectedSegments = autoTechnicalTermsResult.protectedSegments, count = autoTechnicalTermsResult.count;
          let emojiProtectedResult = protectionLogic.protectUnicodeEmojiSegments(plugin, string, protectedSegments, count);
          if (string = emojiProtectedResult.string, protectedSegments = emojiProtectedResult.protectedSegments, count = emojiProtectedResult.count, place == MESSAGE_PLACES.RECEIVED)
            newString.push(string);
          else {
            let usedExceptions = BDFDB.ArrayUtils.is(plugin.settings.exceptions.wordStart) ? plugin.settings.exceptions.wordStart : [];
            string.split(" ").forEach((word) => {
              word.indexOf("<@!") == 0 || word.indexOf("<#") == 0 || word.indexOf(":") == 0 || word.indexOf("<:") == 0 || word.indexOf("<a:") == 0 || word.indexOf("@") == 0 || word.indexOf("#") == 0 || usedExceptions.some((n) => word.indexOf(n) == 0 && word.length > 1) ? (newString.push(protectionLogic.createProtectionPlaceholder(plugin, count)), protectedSegments[count] = word, count++) : newString.push(word);
            });
          }
          let maskedString = newString.join(place == MESSAGE_PLACES.RECEIVED ? "" : " "), hasTranslatableContent = maskedString.replace(/(?:⟦\s*(?:DTA\s*)?\d+\s*⟧|【\s*\d+\s*】|\[\s*\d+\s*\]|<<<\s*\d+\s*>>>|\{\{\d+\}\})/g, "").trim().length > 0;
          return [maskedString, protectedSegments, hasTranslatableContent];
        }
      };
      return Object.freeze(protectionLogic);
    }
    __name(createProtectionLogic, "createProtectionLogic");
    module2.exports = {
      MESSAGE_PLACES,
      TRANSLATION_PROTECTION_SIGNATURE_VERSION,
      createProtectionLogic
    };
  }
});

// src/received/embed-translation-parser.js
var require_embed_translation_parser = __commonJS({
  "src/received/embed-translation-parser.js"(exports2, module2) {
    function useTranslatedValue(translated, original) {
      return translated != null && String(translated).trim() ? translated : original || "";
    }
    __name(useTranslatedValue, "useTranslatedValue");
    function hasValue(value) {
      return value != null && !!String(value).trim();
    }
    __name(hasValue, "hasValue");
    function parseFields(lines, originalFields) {
      let parsed = lines.join(`
`).trim().split(/\n\s*\n/).filter(Boolean).map((group) => {
        let delimiterIndex = group.indexOf("__________________");
        return delimiterIndex < 0 ? { name: group, value: "" } : { name: group.slice(0, delimiterIndex), value: group.slice(delimiterIndex + 18) };
      }), complete = !originalFields.length || parsed.length === originalFields.length && originalFields.every((field, index) => (!hasValue(field.name) || hasValue(parsed[index] && parsed[index].name)) && (!hasValue(field.value) || hasValue(parsed[index] && parsed[index].value)));
      if (!complete) return { fields: originalFields.map((field) => ({ name: field.name || "", value: field.value || "" })), complete, hasTranslatedContent: !1 };
      let fieldCount = originalFields.length || parsed.length;
      return { fields: Array.from({ length: fieldCount }, (_, index) => ({
        name: useTranslatedValue(parsed[index] && parsed[index].name, originalFields[index] && originalFields[index].name),
        value: useTranslatedValue(parsed[index] && parsed[index].value, originalFields[index] && originalFields[index].value)
      })), complete, hasTranslatedContent: parsed.some((field) => hasValue(field.name) || hasValue(field.value)) };
    }
    __name(parseFields, "parseFields");
    function parseStoredEmbedTranslations({ messageEmbeds = [], originalEmbeds = [], segments = [] } = {}) {
      return messageEmbeds.reduce((translations, messageEmbed, index) => {
        if (!messageEmbed || !messageEmbed.id || index >= segments.length) return translations;
        let original = originalEmbeds[index] || {}, originalFields = Array.isArray(original.fields) ? original.fields : [], lines = String(segments[index] || "").split(`
`), translatedTitle = lines.shift(), translatedDescription = lines.shift(), title = useTranslatedValue(translatedTitle, original.title), description = useTranslatedValue(translatedDescription, original.description), lastLine = lines[lines.length - 1] || "", hasFieldLine = lines.some((line) => line.includes("__________________")), translatedFooter = original.footerText && (!originalFields.length || hasFieldLine && !lastLine.includes("__________________")) ? lines.pop() : "", footerText = original.footerText ? useTranslatedValue(translatedFooter, original.footerText) : "", parsedFields = parseFields(lines, originalFields), complete = (!hasValue(original.title) || hasValue(translatedTitle)) && (!hasValue(original.description) || hasValue(translatedDescription)) && (!hasValue(original.footerText) || hasValue(translatedFooter)) && parsedFields.complete, hasTranslatedContent = hasValue(translatedTitle) || hasValue(translatedDescription) || hasValue(translatedFooter) || parsedFields.hasTranslatedContent;
        return translations[messageEmbed.id] = { title, description, fields: parsedFields.fields, footerText, complete, hasTranslatedContent }, translations;
      }, {});
    }
    __name(parseStoredEmbedTranslations, "parseStoredEmbedTranslations");
    module2.exports = { parseStoredEmbedTranslations };
  }
});

// src/language/language-heuristics.js
var require_language_heuristics = __commonJS({
  "src/language/language-heuristics.js"(exports2, module2) {
    var LANGUAGE_DIRECTIONS = Object.freeze({ INPUT: "input", OUTPUT: "output" }), MESSAGE_DIRECTIONS = Object.freeze({ RECEIVED: "received", SENT: "sent" }), LOADED_AUTO_TRANSLATE_RANGE_MODES = { COUNT: "count", TIME: "time" };
    function getFilterSettings(plugin) {
      return plugin.settings && plugin.settings.filters || {};
    }
    __name(getFilterSettings, "getFilterSettings");
    var loadedAutoTranslatePolicy = {
      getFilterSettings(plugin) {
        return getFilterSettings(plugin);
      },
      getReceivedAutoTranslateScope(plugin) {
        return loadedAutoTranslatePolicy.getFilterSettings(plugin).receivedAutoTranslateScope == "loaded_messages" ? "loaded_messages" : "new_only";
      },
      getReceivedAutoTranslateLoadedRangeMode(_plugin) {
        return LOADED_AUTO_TRANSLATE_RANGE_MODES.COUNT;
      },
      getReceivedAutoTranslateLoadedTimeWindow(plugin) {
        let value = loadedAutoTranslatePolicy.getFilterSettings(plugin).receivedAutoTranslateLoadedTimeWindow;
        return ["15m", "1h", "6h", "24h", "all"].includes(value) ? value : "1h";
      },
      getReceivedAutoTranslateLoadedLimit(plugin) {
        return plugin.normalizeLoadedAutoTranslateLimit(loadedAutoTranslatePolicy.getFilterSettings(plugin).receivedAutoTranslateLoadedLimit);
      },
      shouldPauseLoadedAutoTranslateWhileScrolling(plugin) {
        return loadedAutoTranslatePolicy.getFilterSettings(plugin).pauseLoadedAutoTranslateWhileScrolling !== !1;
      },
      shouldContinueLoadedAutoTranslateOnScroll(plugin) {
        return loadedAutoTranslatePolicy.getFilterSettings(plugin).continueLoadedAutoTranslateOnScroll !== !1;
      },
      getReceivedAutoTranslateLoadedTimeWindowMs(plugin) {
        let window2 = loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindow(plugin);
        return window2 == "15m" ? 900 * 1e3 : window2 == "1h" ? 3600 * 1e3 : window2 == "6h" ? 360 * 60 * 1e3 : window2 == "24h" ? 1440 * 60 * 1e3 : 0;
      }
    }, aiDecisionPolicy = {
      getAutoTranslateDecisionMode(plugin) {
        return getFilterSettings(plugin).autoTranslateDecisionMode == "ai" ? "ai" : "basic";
      },
      supportsAiAutoTranslateDecisionEngine(_plugin, engineKey) {
        return ["deepseek", "openai", "gemini", "oaicompat"].includes(engineKey);
      },
      isAiAutoTranslateDecisionAvailable(plugin, channelId = null) {
        let engineKeys = channelId ? [
          plugin.getEffectivePrimaryEngine(channelId),
          plugin.getEffectiveBackupEngine(channelId)
        ] : [
          plugin.getGlobalPrimaryEngine(),
          plugin.getEffectiveBackupEngine(),
          ...plugin.ensureSettingsStore().listChannelPrimaryEngines()
        ];
        return [...new Set(engineKeys)].some((engineKey) => aiDecisionPolicy.supportsAiAutoTranslateDecisionEngine(plugin, engineKey) && plugin.isEngineConfiguredForRuntime(engineKey));
      },
      shouldUseAiAutoTranslateDecision(plugin, channelId = null) {
        return aiDecisionPolicy.getAutoTranslateDecisionMode(plugin) == "ai" && aiDecisionPolicy.isAiAutoTranslateDecisionAvailable(plugin, channelId);
      }
    }, sentTranslationPolicy = {
      shouldSkipSentTranslationForSameTarget(plugin, text, channelId, forcedOutputLanguage = null, callback) {
        let targetLanguageId = forcedOutputLanguage || plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.OUTPUT, MESSAGE_DIRECTIONS.SENT, channelId), targetLanguage = targetLanguageId && plugin.ensureSettingsStore().getLanguage(targetLanguageId);
        if (!targetLanguageId || targetLanguageId == "auto" || targetLanguage && targetLanguage.special) return callback(!1, null);
        let configuredInputLanguage = plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.INPUT, MESSAGE_DIRECTIONS.SENT, channelId);
        if (configuredInputLanguage && configuredInputLanguage != "auto") return callback(plugin.isSameLanguageOrVariant(configuredInputLanguage, targetLanguageId), configuredInputLanguage);
        let analysis = plugin.analyzeTextForAutoTranslate(text, targetLanguageId);
        if (plugin.isMostlyTargetLanguageMessage(analysis, targetLanguageId)) return callback(!0, targetLanguageId);
        plugin.detectLanguage(text, (detectedLanguage) => callback(!!detectedLanguage && plugin.isSameLanguageOrVariant(detectedLanguage, targetLanguageId), detectedLanguage));
      },
      shouldAutoTranslateSentMessage(plugin, text, channelId, callback, forcedOutputLanguage = null) {
        plugin.shouldSkipSentTranslationForSameTarget(text, channelId, forcedOutputLanguage, (sameLanguage, detectedLanguage) => {
          if (sameLanguage) return callback(!1);
          let sourceLanguages = plugin.getAutoTranslateSourceLanguages();
          if (!sourceLanguages.length) return callback(!0);
          let configuredInputLanguage = plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.INPUT, MESSAGE_DIRECTIONS.SENT, channelId);
          if (configuredInputLanguage && configuredInputLanguage != "auto") return callback(plugin.matchesConfiguredSourceLanguage(configuredInputLanguage, sourceLanguages));
          if (detectedLanguage) return callback(plugin.matchesConfiguredSourceLanguage(detectedLanguage, sourceLanguages));
          plugin.detectLanguage(text, (detectedLanguageId) => callback(plugin.matchesConfiguredSourceLanguage(detectedLanguageId, sourceLanguages)));
        });
      },
      shouldSendOriginalInsteadOfSentTranslation(plugin, originalText, translation, input, output) {
        return !translation || input && output && input.id && output.id && plugin.isSameLanguageOrVariant(input.id, output.id) ? !0 : plugin.getTextSimilarityScore(originalText, translation) >= Math.max(0.94, plugin.getTranslationSimilarityThreshold());
      },
      buildSentTranslationMessageValue(plugin, originalText, translation, input, output) {
        return plugin.shouldSendOriginalInsteadOfSentTranslation(originalText, translation, input, output) ? originalText : plugin.settings.general.sendOriginalMessage ? translation + plugin.formatOriginalTextForMessage(originalText) : translation;
      }
    }, languageHeuristicsRuntime = {
      getLatinStopwordTables(_plugin) {
        return {
          en: "the,and,you,that,this,is,are,was,were,have,has,it,for,not,with,but,they,your,from,been,will,just,like,can,what,there,their",
          es: "que,de,no,es,en,un,una,por,con,se,los,las,su,para,como,mas,pero,le,al,lo,ella,este,eso",
          fr: "le,la,les,de,et,un,une,que,pas,pour,qui,dans,sur,ne,se,au,est,son,il,elle,avec,nous,vous",
          de: "der,die,das,und,ist,nicht,ein,eine,den,von,mit,sich,auf,fur,sie,dem,es,auch,wir,aber,hat",
          pt: "que,de,nao,um,uma,para,com,os,as,se,por,como,mas,mais,eu,voce,sua,seu,ja,esta,isto",
          it: "che,di,non,un,una,per,si,la,il,le,con,come,ma,piu,gli,sono,questo,quella,anche,stato",
          nl: "de,het,een,en,van,is,niet,te,dat,die,in,op,voor,met,zijn,haar,maar,wat,heb,wij,zij",
          pl: "nie,sie,to,na,jest,do,ze,jak,ale,co,dla,moze,tego,tym,byc,lub,oraz,takze,ich,jesli",
          ro: "sa,de,nu,in,ca,pe,un,o,cu,este,la,ai,mai,dar,sunt,pentru,fata,asta,ori,sau,aceasta",
          tr: "ve,bir,bu,icin,ile,ben,sen,degil,ama,daha,cok,var,yok,benim,senin,bana,sana,onlar,gibi,kadar",
          sv: "och,att,det,som,en,den,for,ar,inte,med,har,jag,du,han,hon,ett,kan,sa,men,om,alla",
          da: "og,at,det,som,en,den,er,ikke,med,har,jag,du,han,hun,et,kan,sa,men,om,vi,der",
          no: "og,at,det,som,en,den,er,ikke,med,har,jag,du,han,hun,et,kan,sa,men,om,vi,der",
          cs: "a,se,na,je,to,v,ze,si,pro,ale,jak,tak,ktery,byt,nebo,tento,jejich,coz,vice,ktere",
          hu: "es,egy,nem,hogy,az,is,volt,meg,lehet,csak,de,mint,mar,ott,majd,igen,mert,azzal,ilyen,olyan",
          id: "yang,dan,di,ini,itu,untuk,dengan,tidak,saya,anda,akan,ke,pada,dari,juga,karena,bisa,ada,mereka,sebagai",
          vi: "va,cua,la,mot,cac,trong,khong,co,nay,do,da,duoc,nguoi,cho,voi,den,tu,roi,ra,cung",
          tl: "ang,ng,mga,sa,ay,na,at,ni,si,naman,dahil,hindi,para,kung,ngunit,siya,ako,ikaw,nila,kapag"
        };
      },
      getShortLatinLanguageHintTables(_plugin) {
        return {
          en: "yes,hello,thanks,please",
          es: "hola,gracias",
          fr: "oui,bonjour,merci",
          de: "hallo,danke",
          it: "grazie",
          pt: "obrigado"
        };
      },
      identifyShortLatinLanguageHint(plugin, text) {
        let words = (text || "").toLowerCase().match(/[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)*/g) || [];
        if (words.length != 1) return null;
        if (!plugin._shortLatinLanguageHintIndex) {
          let index = /* @__PURE__ */ Object.create(null), tables = languageHeuristicsRuntime.getShortLatinLanguageHintTables(plugin);
          for (let languageId in tables) for (let word of tables[languageId].split(",")) index[word] = languageId;
          plugin._shortLatinLanguageHintIndex = index;
        }
        return plugin._shortLatinLanguageHintIndex[words[0]] || null;
      },
      identifyLatinLanguage(plugin, text) {
        if (!plugin._latinStopwordIndex) {
          let tables = languageHeuristicsRuntime.getLatinStopwordTables(plugin), index = /* @__PURE__ */ Object.create(null);
          for (let lang in tables)
            for (let word of tables[lang].split(","))
              index[word] || (index[word] = []), index[word].push(lang);
          plugin._latinStopwordIndex = index;
        }
        let words = (text || "").toLowerCase().match(/[a-zà-ÿ]+(?:['’][a-zà-ÿ]+)*/g) || [];
        if (words.length < 5) return { languageId: null, confident: !1, tokenCount: words.length };
        let scores = /* @__PURE__ */ Object.create(null), seen = /* @__PURE__ */ Object.create(null);
        for (let word of words) {
          let langs = plugin._latinStopwordIndex[word];
          if (langs)
            for (let lang of langs) {
              let key = lang + "|" + word;
              seen[key] || (seen[key] = 1, scores[lang] = (scores[lang] || 0) + 1);
            }
        }
        let best = null, bestScore = 0, runnerUp = 0;
        for (let lang in scores) {
          let score = scores[lang];
          score > bestScore ? (runnerUp = bestScore, bestScore = score, best = lang) : score > runnerUp && (runnerUp = score);
        }
        let confident = !!(best && bestScore >= 3 && bestScore >= 2 * runnerUp);
        return { languageId: best, score: bestScore, runnerUp, tokenCount: words.length, confident };
      },
      detectMessageLanguageLocal(plugin, text, analysis, targetLanguageId) {
        if (!analysis || !analysis.totalLetters) return { languageId: null, confident: !1 };
        let targetFamilies = analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId);
        return !targetFamilies.length || targetFamilies[0] != "latin" ? { languageId: null, confident: !1 } : analysis.dominantFamily != "latin" ? { languageId: null, confident: !1 } : languageHeuristicsRuntime.identifyLatinLanguage(plugin, text);
      },
      isClearlyForeignLanguageMessage(plugin, text, targetLanguageId) {
        if (!text || !targetLanguageId || targetLanguageId == "auto") return !1;
        let targetLanguage = plugin.ensureSettingsStore().getLanguage(targetLanguageId);
        if (targetLanguage && targetLanguage.special) return !1;
        let targetFamilies = plugin.getLanguageScriptFamilies(targetLanguageId);
        if (!targetFamilies.length) return !1;
        let targetFamily = targetFamilies[0], analysis = plugin.analyzeTextForAutoTranslate(text, targetLanguageId);
        if (!analysis || !analysis.totalLetters) return !1;
        let dominant = analysis.dominantFamily;
        if (!dominant) return !1;
        if (dominant != targetFamily && analysis.nonTargetLetterCount >= 6) return !0;
        if (targetFamily == "latin" && dominant == "latin") {
          let detected = languageHeuristicsRuntime.identifyLatinLanguage(plugin, text);
          if (detected.confident && detected.languageId && !plugin.isSameLanguageOrVariant(detected.languageId, targetLanguageId)) return !0;
        }
        return !1;
      },
      isHanTargetMessageWithLatinTerms(plugin, analysis, targetLanguageId) {
        if (!analysis || !analysis.totalLetters || !(analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId)).includes("han") || analysis.targetLetterCount < 2 || analysis.hanRunCount < 1) return !1;
        let latinCount = analysis.counts && analysis.counts.latin || 0;
        return Math.max(0, analysis.nonTargetLetterCount - latinCount) > 0 ? !1 : latinCount ? analysis.latinWordCount > 3 ? !1 : analysis.targetShare >= 0.18 : !0;
      },
      isMostlyTargetLanguageMessage(plugin, analysis, targetLanguageId) {
        if (!analysis || !analysis.totalLetters) return !1;
        let targetFamilies = analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId);
        return !targetFamilies.length || targetFamilies[0] == "latin" ? !1 : languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, analysis, targetLanguageId) || analysis.targetLetterCount >= 6 && analysis.targetShare >= 0.55 || analysis.targetLetterCount >= 12 && analysis.targetShare >= 0.45 && analysis.nonTargetLetterCount <= Math.max(8, analysis.targetLetterCount * 0.8) ? !0 : !!analysis.strongTargetScriptMatch;
      },
      isClearlyTargetLanguageMessage(plugin, analysis, targetLanguageId) {
        if (!analysis || !analysis.totalLetters) return !1;
        let targetFamilies = analysis.targetFamilies || plugin.getLanguageScriptFamilies(targetLanguageId);
        return !targetFamilies.length || targetFamilies[0] == "latin" ? !1 : !!(languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(plugin, analysis, targetLanguageId) || analysis.targetLetterCount >= 3 && analysis.targetShare >= 0.82 || analysis.targetLetterCount >= 6 && analysis.targetShare >= 0.68 && analysis.nonTargetLetterCount <= Math.max(3, Math.floor(analysis.targetLetterCount * 0.25)) || analysis.targetLetterCount >= 12 && analysis.targetShare >= 0.6 && analysis.nonTargetLetterCount <= Math.max(6, Math.floor(analysis.targetLetterCount * 0.35)));
      },
      isTranslationLikelyInTargetLanguage(plugin, text, targetLanguageId) {
        if (targetLanguageId = plugin.normalizeLanguageId(targetLanguageId), !text || !targetLanguageId || targetLanguageId == "auto") return !0;
        let targetLanguage = plugin.ensureSettingsStore().getLanguage(targetLanguageId);
        if (targetLanguage && targetLanguage.special) return !0;
        let targetFamilies = plugin.getLanguageScriptFamilies(targetLanguageId);
        if (!targetFamilies.length) return !0;
        let analysis = plugin.analyzeTextForAutoTranslate(text, targetLanguageId);
        if (!analysis || !analysis.totalLetters) return !0;
        let shortLatinLanguageHint = analysis.dominantFamily == "latin" ? languageHeuristicsRuntime.identifyShortLatinLanguageHint(plugin, text) : null;
        if (shortLatinLanguageHint)
          return targetFamilies[0] != "latin" ? !1 : plugin.isSameLanguageOrVariant(shortLatinLanguageHint, targetLanguageId);
        if (analysis.totalLetters < 4) return !0;
        if (targetFamilies[0] == "latin" && analysis.dominantFamily == "latin") {
          let detected = languageHeuristicsRuntime.identifyLatinLanguage(plugin, text);
          if (detected.confident && detected.languageId) return plugin.isSameLanguageOrVariant(detected.languageId, targetLanguageId);
        }
        return analysis.targetLetterCount == 0 && analysis.nonTargetLetterCount >= 4 ? !1 : analysis.targetLetterCount >= 2 && analysis.targetShare >= 0.2 ? !0 : analysis.targetLetterCount >= 4 || analysis.targetShare >= 0.35;
      }
    }, textSimilarityRuntime = {
      normalizeComparisonText(_plugin, text) {
        return text = (text || "").toLowerCase(), typeof text.normalize == "function" && (text = text.normalize("NFKC")), text.replace(/https?:\/\/\S+/gi, "").replace(/[`~!@#$%^&*()\-_=+\[\]{}\\|;:'",.<>/?，。！？；：“”‘’（）【】《》、…·]/g, "").replace(/\s+/g, "");
      },
      getTextSimilarityScore(plugin, textA, textB) {
        let normalizedA = textSimilarityRuntime.normalizeComparisonText(plugin, textA), normalizedB = textSimilarityRuntime.normalizeComparisonText(plugin, textB);
        if (!normalizedA || !normalizedB) return 0;
        if (normalizedA == normalizedB) return 1;
        if (normalizedA.length < 2 || normalizedB.length < 2) return normalizedA == normalizedB ? 1 : 0;
        let createBigrams = /* @__PURE__ */ __name((value) => {
          let bigrams = /* @__PURE__ */ new Map();
          for (let index = 0; index < value.length - 1; index++) {
            let bigram = value.slice(index, index + 2);
            bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
          }
          return bigrams;
        }, "createBigrams"), bigramsA = createBigrams(normalizedA), bigramsB = createBigrams(normalizedB), overlap = 0;
        for (let [bigram, count] of bigramsA.entries()) bigramsB.has(bigram) && (overlap += Math.min(count, bigramsB.get(bigram)));
        return 2 * overlap / (Math.max(1, normalizedA.length - 1) + Math.max(1, normalizedB.length - 1));
      }
    };
    function createLanguageHeuristics({ BDFDB } = {}) {
      let languagePolicy = {
        getConcreteConfiguredLanguages(plugin, settingKey) {
          let sourceLanguages = plugin.settings && plugin.settings.filters && plugin.settings.filters[settingKey], configuredLanguages = BDFDB.ArrayUtils.is(sourceLanguages) ? sourceLanguages : [];
          return [...new Set(configuredLanguages.filter((languageId) => {
            let language = plugin.ensureSettingsStore().getLanguage(languageId);
            return language && !language.auto && !language.special;
          }))];
        },
        normalizeLanguageId(_plugin, languageId) {
          return (languageId || "").toLowerCase();
        },
        matchesConfiguredSourceLanguage(plugin, languageId, sourceLanguages = null) {
          if (!languageId) return !1;
          let normalizedLanguageId = languagePolicy.normalizeLanguageId(plugin, languageId);
          return (sourceLanguages || plugin.getAutoTranslateSourceLanguages()).map((sourceLanguage) => languagePolicy.normalizeLanguageId(plugin, sourceLanguage)).some((sourceLanguage) => sourceLanguage == normalizedLanguageId || sourceLanguage.startsWith(`${normalizedLanguageId}-`) || normalizedLanguageId.startsWith(`${sourceLanguage}-`));
        }
      }, receivedSettingsPolicy = {
        getFilterSettings(plugin) {
          return getFilterSettings(plugin);
        },
        getReceivedAutoTranslateSourceLanguages(plugin) {
          return languagePolicy.getConcreteConfiguredLanguages(plugin, "receivedAutoTranslateSourceLanguages");
        },
        getMinimumAutoTranslateLength(_plugin) {
          return 0;
        },
        getAutoTranslateMinimumLengthForAnalysis(plugin, analysis = null) {
          return receivedSettingsPolicy.getMinimumAutoTranslateLength(plugin);
        },
        getTranslationSimilarityThreshold(plugin) {
          let value = receivedSettingsPolicy.getFilterSettings(plugin).translationSimilarityThreshold;
          return Math.max(0.5, Math.min(0.99, parseFloat(value) || 0.9));
        },
        shouldTreatLanguageVariantsAsSame(plugin) {
          return receivedSettingsPolicy.getFilterSettings(plugin).treatLanguageVariantsAsSame !== !1;
        },
        shouldSkipMixedReceivedMessages(_plugin) {
          return !1;
        },
        shouldSkipSameLanguageReceivedMessages(plugin) {
          return receivedSettingsPolicy.getFilterSettings(plugin).skipSameLanguageReceivedMessages !== !1;
        },
        useLocalLanguagePrecheck(plugin) {
          return receivedSettingsPolicy.getFilterSettings(plugin).useLocalLanguagePrecheck !== !1;
        },
        shouldDropSimilarTranslations(plugin) {
          return receivedSettingsPolicy.getFilterSettings(plugin).dropSimilarTranslations !== !1;
        }
      }, languageDetectionRuntime = {
        getStrategy(plugin) {
          let strategy = plugin.settings && plugin.settings.filters && plugin.settings.filters.languageDetectionStrategy;
          return ["local_first", "google_free", "local_only"].includes(strategy) ? strategy : "local_first";
        },
        getDetectableLanguageText(plugin, text) {
          let [newText, , translate] = plugin.removeExceptions((text || "").trim(), MESSAGE_DIRECTIONS.SENT);
          return translate && newText ? newText : "";
        },
        parseDetectedLanguageResponse(_plugin, body) {
          try {
            return (JSON.parse(body) || {}).src || null;
          } catch {
            return null;
          }
        },
        detectLanguage(plugin, text, callback) {
          let detectableText = languageDetectionRuntime.getDetectableLanguageText(plugin, text);
          if (!detectableText) return callback(null);
          let strategy = languageDetectionRuntime.getStrategy(plugin);
          if (strategy != "google_free") {
            let localDetection = plugin.identifyLatinLanguage(detectableText);
            if (localDetection && localDetection.confident && localDetection.languageId) return callback(localDetection.languageId);
            if (strategy == "local_only") return callback(null);
          }
          BDFDB.LibraryRequires.request("https://translate.googleapis.com/translate_a/single", {
            form: {
              client: "gtx",
              dt: "t",
              dj: "1",
              source: "input",
              sl: "auto",
              tl: "en",
              q: encodeURIComponent(detectableText)
            }
          }, (error, response, body) => {
            if (!error && body && response.statusCode == 200) return callback(languageDetectionRuntime.parseDetectedLanguageResponse(plugin, body));
            callback(null);
          });
        }
      };
      return Object.freeze({ languagePolicy, receivedSettingsPolicy, languageDetectionRuntime });
    }
    __name(createLanguageHeuristics, "createLanguageHeuristics");
    module2.exports = {
      LANGUAGE_DIRECTIONS,
      MESSAGE_DIRECTIONS,
      LOADED_AUTO_TRANSLATE_RANGE_MODES,
      loadedAutoTranslatePolicy,
      aiDecisionPolicy,
      sentTranslationPolicy,
      languageHeuristicsRuntime,
      textSimilarityRuntime,
      createLanguageHeuristics
    };
  }
});

// src/received/received-translation-runtime.js
var require_received_translation_runtime = __commonJS({
  "src/received/received-translation-runtime.js"(exports2, module2) {
    var { LANGUAGE_DIRECTIONS, MESSAGE_DIRECTIONS } = require_language_heuristics(), foreignLanguageDecisionRuntime = {
      isDetectedLanguageForeign(plugin, detectedLanguageId, targetLanguageId) {
        return !!detectedLanguageId && !plugin.isSameLanguageOrVariant(detectedLanguageId, targetLanguageId);
      },
      isReceivedMessageForeignAsync(plugin, text, targetLanguageId, callback) {
        if (plugin.isClearlyForeignLanguageMessage(text, targetLanguageId)) return callback(!0);
        if (!text || !targetLanguageId || targetLanguageId == "auto") return callback(!1);
        plugin.detectLanguage(text, (detectedLanguageId) => callback(foreignLanguageDecisionRuntime.isDetectedLanguageForeign(plugin, detectedLanguageId, targetLanguageId)));
      }
    };
    function hasUsefulEmbedTranslation(translation) {
      return Object.values(translation && translation.embeds || {}).some((embed) => embed && (Object.prototype.hasOwnProperty.call(embed, "hasTranslatedContent") ? embed.hasTranslatedContent && embed.complete !== !1 : [embed.title, embed.description, embed.footerText].some((value) => String(value || "").trim()) || Array.isArray(embed.fields) && embed.fields.some((field) => field && (String(field.name || "").trim() || String(field.value || "").trim()))));
    }
    __name(hasUsefulEmbedTranslation, "hasUsefulEmbedTranslation");
    var receivedMessageFilterRuntime = {
      isTranslationResultTooSimilar(plugin, translation) {
        if (!translation) return !1;
        let normalizedTranslation = plugin.normalizeStoredTranslationData(translation), originalContent = (normalizedTranslation.originalContent || "").trim(), translatedContent = (normalizedTranslation.translatedContent || normalizedTranslation.content || "").trim();
        if (!originalContent || !translatedContent) return !1;
        let normalizedOriginal = plugin.normalizeComparisonText(originalContent), normalizedTranslated = plugin.normalizeComparisonText(translatedContent);
        return !normalizedOriginal || !normalizedTranslated ? !1 : normalizedOriginal == normalizedTranslated ? !0 : plugin.getTextSimilarityScore(originalContent, translatedContent) >= Math.max(0.92, plugin.getTranslationSimilarityThreshold());
      },
      getAutoTranslatedResultRejectReason(plugin, translation, channelId) {
        if (!translation || !translation.translatedContent && !hasUsefulEmbedTranslation(translation)) return "local_guard";
        if (receivedMessageFilterRuntime.isTranslationResultTooSimilar(plugin, translation)) return "too_similar";
        let detectedLanguageId = translation.input && translation.input.id, targetLanguageId = translation.output && translation.output.id || plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.OUTPUT, MESSAGE_DIRECTIONS.RECEIVED, channelId);
        if (plugin.shouldSkipSameLanguageReceivedMessages() && detectedLanguageId && plugin.isSameLanguageOrVariant(detectedLanguageId, targetLanguageId)) return "same_language";
        let sourceLanguages = plugin.getReceivedAutoTranslateSourceLanguages();
        return sourceLanguages.length && detectedLanguageId && !plugin.matchesConfiguredSourceLanguage(detectedLanguageId, sourceLanguages) ? "source_filter" : plugin.shouldDropSimilarTranslations() && translation.originalContent && translation.translatedContent && plugin.getTextSimilarityScore(translation.originalContent, translation.translatedContent) >= plugin.getTranslationSimilarityThreshold() ? "too_similar" : null;
      },
      shouldKeepAutoTranslatedResult(plugin, translation, channelId) {
        return !receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(plugin, translation, channelId);
      },
      buildAutoTranslateAnalysisText(plugin, originalContentData) {
        let rawText = plugin.buildTranslationRequestText(originalContentData), [maskedText, , hasUnprotectedContent] = plugin.removeExceptions(rawText, MESSAGE_DIRECTIONS.RECEIVED);
        return { text: maskedText || "", hasUnprotectedContent };
      },
      isLinkOnlyReceivedContent(plugin, originalContentData) {
        if (!originalContentData) return !1;
        let content = (originalContentData.content || "").trim();
        if (!content) return !1;
        let [maskedContent, , hasUnprotectedContent] = plugin.removeExceptions(content, MESSAGE_DIRECTIONS.RECEIVED);
        if (hasUnprotectedContent) return !1;
        let counts = plugin.countScriptFamilies(maskedContent);
        return !!maskedContent && Object.keys(counts).every((family) => !counts[family]);
      },
      buildReceivedAutoTranslateAnalysis(plugin, originalContentData, channelId) {
        if (!originalContentData || !channelId) return null;
        let targetLanguageId = plugin.getLanguageChoice(LANGUAGE_DIRECTIONS.OUTPUT, MESSAGE_DIRECTIONS.RECEIVED, channelId), analysisSource = receivedMessageFilterRuntime.buildAutoTranslateAnalysisText(plugin, originalContentData), analysis = plugin.analyzeTextForAutoTranslate(analysisSource.text, targetLanguageId);
        return { targetLanguageId, analysisSource, analysis };
      },
      getReceivedAutoTranslateSkipReason(plugin, originalContentData, channelId) {
        if (receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, originalContentData)) return "link_only";
        if (!plugin.hasTranslatableMessageContent(originalContentData)) return "symbol_only";
        let receivedAnalysis = receivedMessageFilterRuntime.buildReceivedAutoTranslateAnalysis(plugin, originalContentData, channelId);
        if (!receivedAnalysis || !receivedAnalysis.analysisSource.hasUnprotectedContent) return "symbol_only";
        let { targetLanguageId, analysis } = receivedAnalysis;
        return analysis.totalLetters ? plugin.isClearlyTargetLanguageMessage(analysis, targetLanguageId) || plugin.shouldSkipSameLanguageReceivedMessages() && plugin.isMostlyTargetLanguageMessage(analysis, targetLanguageId) ? "same_language" : null : "symbol_only";
      },
      shouldSkipReceivedTranslationBeforeRequest(plugin, originalContentData, channelId) {
        if (!originalContentData || !channelId) return !1;
        if (receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, originalContentData)) return !0;
        let receivedAnalysis = receivedMessageFilterRuntime.buildReceivedAutoTranslateAnalysis(plugin, originalContentData, channelId);
        if (!receivedAnalysis) return !1;
        let { targetLanguageId, analysisSource, analysis } = receivedAnalysis, targetLanguage = plugin.ensureSettingsStore().getLanguage(targetLanguageId);
        return !targetLanguageId || targetLanguageId == "auto" || targetLanguage && targetLanguage.special || !analysisSource || !analysisSource.hasUnprotectedContent ? !1 : plugin.isClearlyTargetLanguageMessage(analysis, targetLanguageId);
      },
      shouldSkipByLocalLanguagePrecheck(plugin, text, analysis, targetLanguageId) {
        if (!plugin.useLocalLanguagePrecheck()) return !1;
        let localDetection = plugin.detectMessageLanguageLocal(text, analysis, targetLanguageId);
        if (!localDetection.confident || !localDetection.languageId) return !1;
        if (plugin.isSameLanguageOrVariant(localDetection.languageId, targetLanguageId)) return !0;
        let sourceLanguages = plugin.getReceivedAutoTranslateSourceLanguages();
        return sourceLanguages.length && !plugin.matchesConfiguredSourceLanguage(localDetection.languageId, sourceLanguages);
      },
      shouldAutoTranslateReceivedMessage(plugin, message, channel, originalContentData = null, ignoreQueued = !1) {
        if (!channel || !channel.id || !message || !message.id || !plugin.isTranslationEnabled(channel.id) || plugin.isOwnMessage(message) || plugin.ensureReceivedDisplayRuntime().isSuppressed(message.id) || plugin.isMessageDisplayTranslated(message, channel.id) || !ignoreQueued && plugin.ensureLiveTranslationQueue().isMessageQueued(message.id)) return !1;
        let sourceData = originalContentData || plugin.extractOriginalContentData(message);
        if (plugin.getCachedReceivedSkipDecision(message, channel.id, sourceData) || receivedMessageFilterRuntime.isLinkOnlyReceivedContent(plugin, sourceData) || !plugin.hasTranslatableMessageContent(sourceData)) return !1;
        let receivedAnalysis = receivedMessageFilterRuntime.buildReceivedAutoTranslateAnalysis(plugin, sourceData, channel.id);
        if (!receivedAnalysis || !receivedAnalysis.analysisSource.hasUnprotectedContent) return !1;
        let { analysisSource, targetLanguageId, analysis } = receivedAnalysis;
        return !(!analysis.totalLetters || analysis.totalLetters < plugin.getAutoTranslateMinimumLengthForAnalysis(analysis) || plugin.isClearlyTargetLanguageMessage(analysis, targetLanguageId) || plugin.shouldSkipSameLanguageReceivedMessages() && plugin.isMostlyTargetLanguageMessage(analysis, targetLanguageId) || receivedMessageFilterRuntime.shouldSkipByLocalLanguagePrecheck(plugin, analysisSource.text, analysis, targetLanguageId));
      }
    };
    function createReceivedTranslationRuntime({
      // Only ArrayUtils.is and SelectedChannelStore.getChannelId are used. Defaulted so
      // the module is constructible on its own; the plugin injects the real library.
      BDFDB = { ArrayUtils: { is: Array.isArray }, LibraryStores: { SelectedChannelStore: { getChannelId: /* @__PURE__ */ __name(() => null, "getChannelId") } } },
      // Only the batch counters are read here. Every other call into the status store
      // goes through the plugin, which owns the banner.
      loadedTranslationStatusStore = { getNextBatchNumber: /* @__PURE__ */ __name(() => 0, "getNextBatchNumber"), getCurrentBatchNumber: /* @__PURE__ */ __name(() => 0, "getCurrentBatchNumber") }
    } = {}) {
      let receivedTranslationRuntime = {
        // One object threaded through the whole stream walk, so the per-entry step stays
        // a pure function of (entry, context). It also decides, once per render, whether
        // this is the channel's first pass in loaded-messages scope - the only moment
        // the historical collection banner may be opened.
        //
        // (The legacy copy of this method carried a comment about draining live batch
        // items. That comment belonged to collectBatchItems, which moved to
        // orchestrator/live-translation-queue.js; it is not repeated here.)
        createProcessMessagesContext(plugin, e) {
          e.instance.props.channelStream = [].concat(e.instance.props.channelStream);
          let channel = e.instance.props.channel, channelId = channel && channel.id;
          plugin.prepareAutoTranslationChannelSession(channelId);
          let channelState = plugin.getAutoTranslationChannelState(channelId), shouldInitializeAutoTranslation = !!(channelId && plugin.isTranslationEnabled(channelId) && channelState && !channelState.initialized), historicalLoadedPass = shouldInitializeAutoTranslation && plugin.getReceivedAutoTranslateScope() == "loaded_messages";
          if (historicalLoadedPass) {
            let retainedFailedCount = plugin.getFailedHistoricalTranslationCount(channelId);
            plugin.attachAutoTranslationScrollWatcher(), plugin.updateLoadedAutoTranslationStatus({ active: !0, collecting: !0, done: !1, channelId, batch: loadedTranslationStatusStore.getNextBatchNumber(), total: 0, processed: 0, displayed: 0, skipped: 0, failed: 0, retryable: retainedFailedCount, aiDropped: 0, lastSkipReason: "", lastSkipPreview: "" });
          }
          return {
            channel,
            channelId,
            channelState,
            shouldInitializeAutoTranslation,
            historicalLoadedPass,
            historicalSourceGeneration: historicalLoadedPass && typeof plugin.getHistoricalMessageSourceGeneration == "function" ? plugin.getHistoricalMessageSourceGeneration(channelId) : null,
            renderedHistoricalMessages: [],
            skipInitialLoadedMessages: shouldInitializeAutoTranslation && plugin.shouldDeferInitialAutoTranslate(channelId),
            autoTranslateBoundaryId: channelState ? channelState.boundaryMessageId : null,
            highestMessageId: channelState ? channelState.boundaryMessageId : null,
            collectedHistoricalMessages: !1
          };
        },
        shouldCollectHistoricalStreamMessage(plugin, message, context) {
          if (!message || !message.id || !context.channelId) return !1;
          let wasSeen = plugin.markLoadedAutoTranslationMessageSeen(context.channelId, message.id);
          return plugin.getReceivedAutoTranslateScope() != "loaded_messages" ? !1 : context.historicalLoadedPass ? !0 : !wasSeen && !plugin.isMessageIdNewer(message.id, context.autoTranslateBoundaryId);
        },
        processChannelStreamEntry(plugin, entry, context) {
          let message = entry && entry.content;
          if (!message) return context.highestMessageId;
          if (BDFDB.ArrayUtils.is(message.attachments)) {
            let historicalLoad = receivedTranslationRuntime.shouldCollectHistoricalStreamMessage(plugin, message, context);
            return historicalLoad && (context.collectedHistoricalMessages = !0), historicalLoad && context.historicalLoadedPass && context.renderedHistoricalMessages.push(message), context.highestMessageId = plugin.getNewestMessageId(context.highestMessageId, message.id), plugin.checkMessage(entry, message, context.channel, {
              skipAutoQueue: context.skipInitialLoadedMessages,
              autoTranslateBoundaryId: context.autoTranslateBoundaryId,
              historicalLoad,
              deferHistoricalSnapshotStart: historicalLoad,
              skipHistoricalQueue: historicalLoad && context.historicalLoadedPass
            }), context.highestMessageId;
          }
          if (BDFDB.ArrayUtils.is(message)) for (let index in message) {
            let childMessage = message[index].content;
            if (!childMessage || !BDFDB.ArrayUtils.is(childMessage.attachments)) continue;
            let historicalLoad = receivedTranslationRuntime.shouldCollectHistoricalStreamMessage(plugin, childMessage, context);
            historicalLoad && (context.collectedHistoricalMessages = !0), historicalLoad && context.historicalLoadedPass && context.renderedHistoricalMessages.push(childMessage), context.highestMessageId = plugin.getNewestMessageId(context.highestMessageId, childMessage.id), plugin.checkMessage(message[index], childMessage, context.channel, {
              skipAutoQueue: context.skipInitialLoadedMessages,
              autoTranslateBoundaryId: context.autoTranslateBoundaryId,
              historicalLoad,
              deferHistoricalSnapshotStart: historicalLoad,
              skipHistoricalQueue: historicalLoad && context.historicalLoadedPass
            });
          }
          return context.highestMessageId;
        },
        finishProcessMessages(plugin, context) {
          if (context.channelState && (context.channelState.boundaryMessageId = plugin.getNewestMessageId(context.channelState.boundaryMessageId, context.highestMessageId), context.shouldInitializeAutoTranslation && (context.channelState.initialized = !0)), context.historicalLoadedPass && typeof plugin.buildInitialHistoricalTranslationSnapshot == "function") {
            Promise.resolve(plugin.buildInitialHistoricalTranslationSnapshot({
              channelId: context.channelId,
              generation: context.historicalSourceGeneration,
              renderedMessages: context.renderedHistoricalMessages,
              limit: typeof plugin.getReceivedAutoTranslateLoadedLimit == "function" ? plugin.getReceivedAutoTranslateLoadedLimit() : 0
            })).catch((_) => {
            });
            return;
          }
          if (context.historicalLoadedPass || context.collectedHistoricalMessages) {
            context.collectedHistoricalMessages && !plugin.isUserActivelyScrollingMessages(context.channelId) && plugin.finishHistoricalTranslationSnapshot(context.channelId);
            let historicalEntry = plugin.getHistoricalTranslationJobQueue(context.channelId, !1);
            historicalEntry && (historicalEntry.runningPromise || historicalEntry.jobs.length) || plugin.updateLoadedAutoTranslationStatus({ active: !1, collecting: !1, done: !0, channelId: context.channelId, batch: loadedTranslationStatusStore.getCurrentBatchNumber(), total: 0, processed: 0 });
          }
        },
        processMessages(plugin, e) {
          let context = receivedTranslationRuntime.createProcessMessagesContext(plugin, e);
          for (let index in e.instance.props.channelStream)
            receivedTranslationRuntime.processChannelStreamEntry(plugin, e.instance.props.channelStream[index], context);
          receivedTranslationRuntime.finishProcessMessages(plugin, context);
        },
        // An automatic commit mints no source archive, and the stream pass writes the painted
        // text onto the message the channel stream holds. With no anchor, the NEXT stream pass
        // reads that painted text back as the "original", the recomputed signature changes,
        // captureSource replaces the record with a fresh idle one, and the message keeps its
        // translated text while losing the translation - and with it the accent class that
        // carries the whole colour treatment. It is also re-queued and re-translated, because
        // as far as the plugin can tell the author just edited the message into Chinese.
        // The shapes we could have painted for this translation. Recomposed at render time
        // from the current display settings, so a settings change made after the commit must
        // still read as our own output rather than as a user edit.
        matchesPaintedTranslation(plugin, paintedText, translation) {
          if (!translation) return !1;
          let painted = plugin.normalizeExtractedMessageText(paintedText || "").trim();
          return painted ? [
            translation.content,
            translation.translatedContent,
            plugin.buildReceivedDisplayContent(translation.translatedContent || translation.content, translation.originalContent || "")
          ].map((value) => plugin.normalizeExtractedMessageText(value || "").trim()).filter(Boolean).includes(painted) : !1;
        },
        resolveOriginalContentDataAnchor(plugin, message) {
          let archive = message && message.id && plugin.ensureReceivedDisplayRuntime().peekSourceArchive(message.id);
          if (archive && archive.originalContentData) return archive.originalContentData;
          let record = message && message.id && plugin.ensureReceivedDisplayRuntime().getDisplayState(message.id), translation = record && (record.status == "translated" && record.translation || record.status == "cancelled" && record.restoredTranslation);
          return !translation || !record.source || !record.source.content ? null : receivedTranslationRuntime.matchesPaintedTranslation(plugin, message.content, translation) ? record.source : null;
        },
        createCheckMessageContext(plugin, message, channel, options = {}) {
          let channelId = channel && channel.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId(), sourceChanged = plugin.refreshReceivedMessageSourceState(message, channelId), originalContentData = plugin.extractOriginalContentData(message), channelState = plugin.getAutoTranslationChannelState(channelId), autoTranslateBoundaryId = options.autoTranslateBoundaryId != null ? options.autoTranslateBoundaryId : channelState && channelState.boundaryMessageId, expectedSignature = plugin.createReceivedTranslationSignature(message, channelId, originalContentData), pendingSourceChanged = plugin.invalidateHistoricalTranslationMessage(message.id, channelId, expectedSignature), liveSourceChanged = plugin.invalidateLiveTranslationMessage(message.id, channelId, expectedSignature);
          return {
            channelId,
            channelState,
            originalContentData,
            expectedSignature,
            forceQueue: sourceChanged || pendingSourceChanged || liveSourceChanged,
            skipAutoQueue: !!options.skipAutoQueue,
            skipHistoricalQueue: !!options.skipHistoricalQueue,
            isNewerThanBoundary: plugin.isMessageIdNewer(message.id, autoTranslateBoundaryId),
            historicalLoad: !!options.historicalLoad,
            deferHistoricalSnapshotStart: !!options.deferHistoricalSnapshotStart
          };
        },
        captureReceivedDisplaySource(plugin, message, context) {
          if (!context.channelId || plugin.isOwnMessage(message) || !plugin.isTranslationEnabled(context.channelId)) return null;
          let previousView = plugin.getReceivedDisplayRuntimeView(message.id), generation = plugin.getReceivedDisplayGeneration(context.channelId), record = plugin.captureReceivedMessageSource({
            messageId: message.id,
            channelId: context.channelId,
            generation: generation === void 0 ? 1 : generation,
            sourceSignature: context.expectedSignature,
            source: {
              content: context.originalContentData && context.originalContentData.content || "",
              embeds: context.originalContentData && context.originalContentData.embeds || []
            }
          });
          return previousView && record && previousView.status !== "idle" && previousView.generation === record.generation && previousView.sourceSignature !== record.sourceSignature && (context.forceQueue = !0, plugin.clearCachedTranslation(message.id)), record;
        },
        commitCachedDisplayResult(plugin, message, context, cachedTranslation) {
          let storedTranslation = plugin.refreshTranslationDisplay(Object.assign({ channelId: context.channelId, auto: !0 }, cachedTranslation)), commit = plugin.commitReceivedDisplayResult(plugin.createReceivedDisplayCommitResult(message, context.channelId, {
            sourceSignature: storedTranslation.signature != null ? String(storedTranslation.signature) : context.expectedSignature,
            status: "translated",
            translation: storedTranslation
          }), { refresh: !1 });
          commit && commit.catch && commit.catch((_) => {
          });
          let committedView = plugin.getReceivedDisplayRuntimeView(message.id);
          return !!(committedView && committedView.translated);
        },
        resolveCheckMessageDisplay(plugin, stream, message, context) {
          let hadDisplayedTranslation = !!plugin.ensureReceivedDisplayRuntime().getDisplayView(message.id), translation = plugin.getActiveMessageTranslation(message, context.channelId, context.expectedSignature), messageChanged = hadDisplayedTranslation && !translation, canAutoTranslateMessage = plugin.isTranslationEnabled(context.channelId) && !plugin.ensureReceivedDisplayRuntime().isSuppressed(message.id), canAutoTranslateReplyPreviewForBase = canAutoTranslateMessage && !context.skipAutoQueue && (context.historicalLoad ? plugin.isMessageWithinLoadedRange(message) : context.isNewerThanBoundary), cachedTranslation = null, storeCommitted = !1;
          canAutoTranslateReplyPreviewForBase && plugin.markAutoTranslationEligibleReplyPreviewMessage(context.channelId, message.id), !translation && canAutoTranslateMessage && !context.skipAutoQueue && (context.historicalLoad || context.forceQueue || messageChanged || context.isNewerThanBoundary) && (cachedTranslation = plugin.getCachedReceivedTranslation(message, context.channelId, context.originalContentData), cachedTranslation && !context.historicalLoad && (storeCommitted = receivedTranslationRuntime.commitCachedDisplayResult(plugin, message, context, cachedTranslation)));
          let storeView = !translation && plugin.getReceivedDisplayRuntimeView(message.id);
          return translation ? (plugin.refreshTranslationDisplay(translation), stream.content.content = translation.content) : storeView && storeView.translated ? plugin.applyReceivedDisplayViewToStream(stream, storeView) : plugin.ensureReceivedDisplayRuntime().hasSourceArchive(message.id) ? (stream.content.content = plugin.ensureReceivedDisplayRuntime().consumeSourceArchive(message.id).message.content, messageChanged = !0) : storeView && storeView.status == "cancelled" && storeView.restoredTranslation && storeView.content && stream.content.content !== storeView.content && receivedTranslationRuntime.matchesPaintedTranslation(plugin, stream.content.content, storeView.restoredTranslation) && (stream.content.content = storeView.content, messageChanged = !0), { translation, storeCommitted, messageChanged, cachedTranslation, canAutoTranslateMessage };
        },
        queueCheckMessageTranslation(plugin, message, channel, context, outcome) {
          if (!(outcome.translation || outcome.storeCommitted || context.skipAutoQueue || !outcome.canAutoTranslateMessage) && !(context.historicalLoad && context.skipHistoricalQueue) && (context.channelState && (context.channelState.boundaryMessageId = plugin.getNewestMessageId(context.channelState.boundaryMessageId, message.id)), context.forceQueue || outcome.messageChanged || context.isNewerThanBoundary || context.historicalLoad)) {
            let liveMessage = !context.historicalLoad && (context.isNewerThanBoundary || plugin.isLikelyLiveAutoTranslateMessage(message, context.channelId));
            plugin.queueAutoTranslateMessage(message, channel || { id: context.channelId }, context.originalContentData, {
              historicalLoad: context.historicalLoad && !liveMessage,
              deferHistoricalSnapshotStart: context.deferHistoricalSnapshotStart,
              deferWhileReading: !1,
              cachedTranslation: context.historicalLoad && !liveMessage ? outcome.cachedTranslation : null
            });
          }
        },
        checkMessage(plugin, stream, message, channel, options = {}) {
          if (!message || !stream || !stream.content) return;
          plugin.captureSentOriginalMessage(message, channel && channel.id || message.channel_id || null);
          let context = receivedTranslationRuntime.createCheckMessageContext(plugin, message, channel, options);
          receivedTranslationRuntime.captureReceivedDisplaySource(plugin, message, context);
          let outcome = receivedTranslationRuntime.resolveCheckMessageDisplay(plugin, stream, message, context);
          receivedTranslationRuntime.queueCheckMessageTranslation(plugin, message, channel, context, outcome);
        }
      };
      return Object.freeze({ receivedTranslationRuntime });
    }
    __name(createReceivedTranslationRuntime, "createReceivedTranslationRuntime");
    module2.exports = {
      foreignLanguageDecisionRuntime,
      receivedMessageFilterRuntime,
      createReceivedTranslationRuntime
    };
  }
});

// src/received/historical-message-source.js
var require_historical_message_source = __commonJS({
  "src/received/historical-message-source.js"(exports2, module2) {
    function createHistoricalMessageSource({
      listCachedMessages = /* @__PURE__ */ __name(async () => [], "listCachedMessages"),
      prefetchMessages = /* @__PURE__ */ __name(async () => [], "prefetchMessages"),
      isEligible = /* @__PURE__ */ __name(() => !0, "isEligible"),
      toQueueItem = /* @__PURE__ */ __name((message) => message, "toQueueItem"),
      isGenerationCurrent = /* @__PURE__ */ __name(() => !0, "isGenerationCurrent")
    } = {}) {
      function isAborted(signal) {
        return !!(signal && signal.aborted);
      }
      __name(isAborted, "isAborted");
      function isCurrent(channelId, generation) {
        return isGenerationCurrent(channelId, generation);
      }
      __name(isCurrent, "isCurrent");
      function sortNewestFirst(messages) {
        return messages.slice().sort((left, right) => compareMessageIds(right && right.id, left && left.id));
      }
      __name(sortNewestFirst, "sortNewestFirst");
      function compareMessageIds(leftId, rightId) {
        let left = normalizeComparableId(leftId), right = normalizeComparableId(rightId);
        return left.kind == right.kind && left.kind == "bigint" || left.kind == right.kind ? left.value > right.value ? 1 : left.value < right.value ? -1 : 0 : String(leftId || "").localeCompare(String(rightId || ""));
      }
      __name(compareMessageIds, "compareMessageIds");
      function normalizeComparableId(messageId) {
        let value = String(messageId || "").trim();
        return /^\d+$/.test(value) ? { kind: "bigint", value: BigInt(value) } : { kind: "string", value };
      }
      __name(normalizeComparableId, "normalizeComparableId");
      function uniqueMessages(messages) {
        let seen = /* @__PURE__ */ new Set(), unique = [];
        for (let message of messages || []) {
          let messageId = message && message.id != null ? String(message.id) : "";
          !messageId || seen.has(messageId) || (seen.add(messageId), unique.push(message));
        }
        return unique;
      }
      __name(uniqueMessages, "uniqueMessages");
      function isChannelMessage(message, channelId) {
        return !message || !channelId ? !1 : String(message.channel_id != null ? message.channel_id : message.channelId || "") == String(channelId);
      }
      __name(isChannelMessage, "isChannelMessage");
      function collectEligible(messages, limit) {
        let items = [];
        for (let message of messages)
          if (isEligible(message) && (items.push(message), items.length >= limit))
            break;
        return items;
      }
      __name(collectEligible, "collectEligible");
      function buildResult(messages, prefetched) {
        let items = messages.map((message) => toQueueItem(message));
        return { items, total: items.length, prefetched, cancelled: !1 };
      }
      __name(buildResult, "buildResult");
      async function build({ channelId, generation, renderedMessages = [], limit = 0, signal = null } = {}) {
        let boundedLimit = Math.max(0, parseInt(limit, 10) || 0);
        if (!channelId || !boundedLimit) return { items: [], total: 0, prefetched: 0, cancelled: !1 };
        if (isAborted(signal) || !isCurrent(channelId, generation)) return { items: [], total: 0, prefetched: 0, cancelled: !0 };
        let cachedMessages = await listCachedMessages(channelId) || [];
        if (isAborted(signal) || !isCurrent(channelId, generation)) return { items: [], total: 0, prefetched: 0, cancelled: !0 };
        let combinedMessages = sortNewestFirst(uniqueMessages([].concat(renderedMessages || [], cachedMessages || []).filter((message) => isChannelMessage(message, channelId)))), eligibleMessages = collectEligible(combinedMessages, boundedLimit), prefetchedCount = 0;
        if (eligibleMessages.length < boundedLimit) {
          let missing = boundedLimit - eligibleMessages.length, oldestKnownMessage = combinedMessages[combinedMessages.length - 1] || null;
          try {
            if (isAborted(signal) || !isCurrent(channelId, generation)) return { items: [], total: 0, prefetched: 0, cancelled: !0 };
            let prefetchedMessages = await prefetchMessages({
              channelId,
              beforeMessageId: oldestKnownMessage && oldestKnownMessage.id != null ? String(oldestKnownMessage.id) : null,
              limit: missing,
              signal
            }) || [];
            if (isAborted(signal) || !isCurrent(channelId, generation)) return { items: [], total: 0, prefetched: 0, cancelled: !0 };
            combinedMessages = sortNewestFirst(uniqueMessages(combinedMessages.concat(prefetchedMessages.filter((message) => isChannelMessage(message, channelId)))));
            let prefetchedEligibleMessages = collectEligible(combinedMessages, boundedLimit);
            prefetchedCount = Math.max(0, prefetchedEligibleMessages.length - eligibleMessages.length), eligibleMessages = prefetchedEligibleMessages;
          } catch {
          }
        }
        return isAborted(signal) || !isCurrent(channelId, generation) ? { items: [], total: 0, prefetched: 0, cancelled: !0 } : buildResult(eligibleMessages, prefetchedCount);
      }
      return __name(build, "build"), Object.freeze({ build });
    }
    __name(createHistoricalMessageSource, "createHistoricalMessageSource");
    module2.exports = { createHistoricalMessageSource };
  }
});

// src/received/discord-history-adapter.js
var require_discord_history_adapter = __commonJS({
  "src/received/discord-history-adapter.js"(exports2, module2) {
    function cloneValue(value) {
      if (!value || typeof value != "object") return value;
      if (Array.isArray(value)) return value.map(cloneValue);
      let clone = {};
      for (let key in value) clone[key] = cloneValue(value[key]);
      return clone;
    }
    __name(cloneValue, "cloneValue");
    function extractMessages(value, visited = /* @__PURE__ */ new Set()) {
      if (value == null) return [];
      if (typeof value != "object" && typeof value != "function") return [];
      if (visited.has(value)) return [];
      if (visited.add(value), Array.isArray(value)) return value;
      if (value instanceof Map) return [...value.values()];
      if (typeof value.values == "function" && typeof value.entries == "function")
        try {
          return [...value.values()];
        } catch {
        }
      if (typeof value.toArray == "function")
        try {
          return extractMessages(value.toArray(), visited);
        } catch {
        }
      if (Array.isArray(value._array)) return value._array;
      for (let key of ["messages", "_map", "records", "body", "result", "response", "data"]) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        let extracted = extractMessages(value[key], visited);
        if (extracted.length) return extracted;
      }
      return [];
    }
    __name(extractMessages, "extractMessages");
    function cloneMessages(messages) {
      return extractMessages(messages).map((message) => cloneValue(message));
    }
    __name(cloneMessages, "cloneMessages");
    function resolveMessageStoreSource(messageStore, channelId) {
      if (!messageStore || !channelId) return null;
      for (let methodName of ["getMessages", "getRawMessages", "getMessageCache"])
        if (typeof messageStore[methodName] == "function")
          try {
            let value = messageStore[methodName](channelId);
            if (value != null) return value;
          } catch {
          }
      return null;
    }
    __name(resolveMessageStoreSource, "resolveMessageStoreSource");
    function resolveFetchCandidates(fetchMessages) {
      return fetchMessages ? typeof fetchMessages == "function" ? [fetchMessages] : ["fetchMessages", "loadMessages", "fetch"].filter((methodName) => typeof fetchMessages[methodName] == "function").map((methodName) => fetchMessages[methodName].bind(fetchMessages)) : [];
    }
    __name(resolveFetchCandidates, "resolveFetchCandidates");
    async function callFetch(fetchMessages, payload) {
      let lastError = null;
      for (let candidate of resolveFetchCandidates(fetchMessages)) {
        if (payload.signal && payload.signal.aborted) return [];
        let attempts = [
          () => candidate(payload),
          () => candidate({
            channelId: payload.channelId,
            before: payload.beforeMessageId,
            limit: payload.limit,
            signal: payload.signal
          }),
          () => candidate(payload.channelId, {
            before: payload.beforeMessageId,
            limit: payload.limit,
            signal: payload.signal
          }),
          () => candidate(payload.channelId, payload.beforeMessageId, payload.limit, payload.signal)
        ];
        for (let attempt of attempts)
          try {
            if (payload.signal && payload.signal.aborted) return [];
            let result = await attempt();
            if (result != null) return result;
          } catch (error) {
            if (payload.signal && payload.signal.aborted) return [];
            lastError = error;
          }
      }
      if (lastError) throw lastError;
      return [];
    }
    __name(callFetch, "callFetch");
    function createDiscordHistoryAdapter({
      messageStore = null,
      fetchMessages = null
    } = {}) {
      return Object.freeze({
        async listCachedMessages(channelId) {
          return cloneMessages(resolveMessageStoreSource(messageStore, channelId));
        },
        async prefetchMessages({ channelId, beforeMessageId = null, limit = 0, signal = null } = {}) {
          if (!channelId || !limit || signal && signal.aborted) return [];
          let result = await callFetch(fetchMessages, { channelId, beforeMessageId, limit, signal });
          if (signal && signal.aborted) return [];
          let returnedMessages = cloneMessages(result);
          return returnedMessages.length ? returnedMessages : cloneMessages(resolveMessageStoreSource(messageStore, channelId));
        }
      });
    }
    __name(createDiscordHistoryAdapter, "createDiscordHistoryAdapter");
    module2.exports = { createDiscordHistoryAdapter };
  }
});

// src/received/historical-source-runtime.js
var require_historical_source_runtime = __commonJS({
  "src/received/historical-source-runtime.js"(exports2, module2) {
    var { createHistoricalMessageSource } = require_historical_message_source(), { createDiscordHistoryAdapter } = require_discord_history_adapter();
    function createHistoricalSourceRuntime({
      createSource = createHistoricalMessageSource,
      createHistoryAdapter = createDiscordHistoryAdapter,
      createAbortController = /* @__PURE__ */ __name(() => typeof AbortController == "function" ? new AbortController() : null, "createAbortController"),
      messageStore = null,
      fetchMessages = null,
      isTranslationEnabled = /* @__PURE__ */ __name(() => !1, "isTranslationEnabled"),
      getSelectedChannelId = /* @__PURE__ */ __name(() => null, "getSelectedChannelId"),
      cloneMessage = /* @__PURE__ */ __name((message) => message, "cloneMessage"),
      getMessageChannelId = /* @__PURE__ */ __name(() => null, "getMessageChannelId"),
      extractOriginalContentData = /* @__PURE__ */ __name(() => null, "extractOriginalContentData"),
      cloneOriginalContentData = /* @__PURE__ */ __name((originalContentData) => originalContentData, "cloneOriginalContentData"),
      shouldAutoTranslateReceivedMessage = /* @__PURE__ */ __name(() => !1, "shouldAutoTranslateReceivedMessage"),
      getCachedReceivedTranslation = /* @__PURE__ */ __name(() => null, "getCachedReceivedTranslation"),
      collectHistoricalTranslationMessage = /* @__PURE__ */ __name(() => !1, "collectHistoricalTranslationMessage"),
      finishHistoricalTranslationSnapshot = /* @__PURE__ */ __name(() => !1, "finishHistoricalTranslationSnapshot"),
      getFailedHistoricalTranslationCount = /* @__PURE__ */ __name(() => 0, "getFailedHistoricalTranslationCount"),
      updateLoadedAutoTranslationStatus = /* @__PURE__ */ __name(() => {
      }, "updateLoadedAutoTranslationStatus"),
      getCurrentBatchNumber = /* @__PURE__ */ __name(() => 0, "getCurrentBatchNumber")
    } = {}) {
      let historyAdapter = createHistoryAdapter({ messageStore, fetchMessages }), generations = {}, inFlightBuilds = {};
      function abortInFlightBuild(channelId = null) {
        if (!channelId) {
          for (let key in inFlightBuilds) abortInFlightBuild(key);
          return;
        }
        let entry = inFlightBuilds[channelId];
        if (entry) {
          delete inFlightBuilds[channelId];
          try {
            entry.controller && typeof entry.controller.abort == "function" && !entry.controller.signal.aborted && entry.controller.abort();
          } catch {
          }
        }
      }
      __name(abortInFlightBuild, "abortInFlightBuild");
      function getGeneration(channelId) {
        return channelId ? (generations[channelId] || (generations[channelId] = 1), generations[channelId]) : 0;
      }
      __name(getGeneration, "getGeneration");
      function advanceGeneration(channelId = null) {
        if (!channelId) {
          abortInFlightBuild();
          for (let key in generations) generations[key] = (generations[key] || 0) + 1;
          return generations;
        }
        return abortInFlightBuild(channelId), generations[channelId] = (generations[channelId] || 0) + 1, generations[channelId];
      }
      __name(advanceGeneration, "advanceGeneration");
      function isGenerationCurrent(channelId, generation) {
        if (!channelId || !isTranslationEnabled(channelId) || getGeneration(channelId) != generation) return !1;
        let selectedChannelId = getSelectedChannelId() || channelId;
        return !selectedChannelId || selectedChannelId == channelId;
      }
      __name(isGenerationCurrent, "isGenerationCurrent");
      function handleChannelSessionChange(previousChannelId, channelId) {
        previousChannelId && previousChannelId != channelId && advanceGeneration(previousChannelId), channelId && previousChannelId != channelId && advanceGeneration(channelId);
      }
      __name(handleChannelSessionChange, "handleChannelSessionChange");
      function createQueueItem(message, channelId) {
        let messageChannelId = getMessageChannelId(message, channelId), originalContentData = cloneOriginalContentData(extractOriginalContentData(message));
        return {
          message: cloneMessage(message),
          channel: { id: messageChannelId },
          originalContentData,
          historicalLoad: !0,
          deferHistoricalSnapshotStart: !0,
          cachedTranslation: getCachedReceivedTranslation(message, messageChannelId, originalContentData) || null
        };
      }
      __name(createQueueItem, "createQueueItem");
      async function buildInitialHistoricalTranslationSnapshot({ channelId, generation, renderedMessages = [], limit = 0 } = {}) {
        if (!channelId || !isGenerationCurrent(channelId, generation)) return { items: [], total: 0, prefetched: 0, accepted: 0, cancelled: !0 };
        abortInFlightBuild(channelId);
        let controller = createAbortController(), entry = { generation, controller };
        inFlightBuilds[channelId] = entry;
        let signal = controller && controller.signal || null, source = createSource({
          listCachedMessages: /* @__PURE__ */ __name((requestChannelId) => historyAdapter.listCachedMessages(requestChannelId), "listCachedMessages"),
          prefetchMessages: /* @__PURE__ */ __name((request) => historyAdapter.prefetchMessages(Object.assign({}, request, { signal })), "prefetchMessages"),
          isEligible: /* @__PURE__ */ __name((message) => {
            let messageChannelId = getMessageChannelId(message, channelId), originalContentData = extractOriginalContentData(message);
            return shouldAutoTranslateReceivedMessage(message, { id: messageChannelId }, originalContentData, !0);
          }, "isEligible"),
          toQueueItem: /* @__PURE__ */ __name((message) => createQueueItem(message, channelId), "toQueueItem"),
          isGenerationCurrent: /* @__PURE__ */ __name((requestChannelId, requestGeneration) => isGenerationCurrent(requestChannelId, requestGeneration), "isGenerationCurrent")
        });
        try {
          let result = await source.build({ channelId, generation, renderedMessages, limit, signal });
          if (!result || result.cancelled || !isGenerationCurrent(channelId, generation)) return Object.assign({ accepted: 0 }, result || { items: [], total: 0, prefetched: 0, cancelled: !0 });
          let accepted = 0;
          for (let queueItem of result.items || []) collectHistoricalTranslationMessage(queueItem) && accepted++;
          if (accepted) finishHistoricalTranslationSnapshot(channelId);
          else {
            let failedCount = getFailedHistoricalTranslationCount(channelId);
            updateLoadedAutoTranslationStatus({ active: !1, collecting: !1, done: !0, channelId, batch: getCurrentBatchNumber(channelId), total: result.total || 0, processed: 0, displayed: 0, skipped: 0, failed: 0, retryable: failedCount, aiDropped: 0 });
          }
          return Object.assign({ accepted }, result);
        } finally {
          inFlightBuilds[channelId] === entry && delete inFlightBuilds[channelId];
        }
      }
      return __name(buildInitialHistoricalTranslationSnapshot, "buildInitialHistoricalTranslationSnapshot"), Object.freeze({
        getGeneration,
        advanceGeneration,
        isGenerationCurrent,
        handleChannelSessionChange,
        buildInitialHistoricalTranslationSnapshot
      });
    }
    __name(createHistoricalSourceRuntime, "createHistoricalSourceRuntime");
    module2.exports = { createHistoricalSourceRuntime };
  }
});

// src/received/historical-source-wiring.js
var require_historical_source_wiring = __commonJS({
  "src/received/historical-source-wiring.js"(exports2, module2) {
    var { createHistoricalSourceRuntime } = require_historical_source_runtime();
    function createPluginHistoricalSourceRuntime({
      plugin,
      BDFDB,
      getCurrentBatchNumber,
      debugProbe = null,
      createRuntime = createHistoricalSourceRuntime
    }) {
      let rawMessageStore = BDFDB.LibraryStores && BDFDB.LibraryStores.MessageStore, rawFetchMessages = BDFDB.LibraryModules && (BDFDB.LibraryModules.MessageActions || BDFDB.LibraryModules.MessageManager || BDFDB.LibraryModules.MessageUtils);
      return createRuntime({
        messageStore: debugProbe ? debugProbe.wrapModule(rawMessageStore, { label: "MessageStore", methods: ["getMessages", "getRawMessages", "getMessageCache"] }) : rawMessageStore,
        fetchMessages: debugProbe ? debugProbe.wrapModule(rawFetchMessages, { label: "MessageFetchModule", methods: ["fetchMessages", "loadMessages", "fetch"] }) : rawFetchMessages,
        isTranslationEnabled: /* @__PURE__ */ __name((channelId) => plugin.isTranslationEnabled(channelId), "isTranslationEnabled"),
        getSelectedChannelId: /* @__PURE__ */ __name(() => BDFDB.LibraryStores && BDFDB.LibraryStores.SelectedChannelStore && typeof BDFDB.LibraryStores.SelectedChannelStore.getChannelId == "function" ? BDFDB.LibraryStores.SelectedChannelStore.getChannelId() : null, "getSelectedChannelId"),
        cloneMessage: /* @__PURE__ */ __name((message) => plugin.cloneHistoricalSourceMessage(message), "cloneMessage"),
        getMessageChannelId: /* @__PURE__ */ __name((message, fallbackChannelId) => plugin.getMessageChannelId(message, fallbackChannelId), "getMessageChannelId"),
        extractOriginalContentData: /* @__PURE__ */ __name((message) => plugin.extractOriginalContentData(message), "extractOriginalContentData"),
        cloneOriginalContentData: /* @__PURE__ */ __name((originalContentData) => plugin.cloneOriginalContentData(originalContentData), "cloneOriginalContentData"),
        shouldAutoTranslateReceivedMessage: /* @__PURE__ */ __name((message, channel, originalContentData, ignoreQueued) => plugin.shouldAutoTranslateReceivedMessage(message, channel, originalContentData, ignoreQueued), "shouldAutoTranslateReceivedMessage"),
        getCachedReceivedTranslation: /* @__PURE__ */ __name((message, channelId, originalContentData) => plugin.getCachedReceivedTranslation(message, channelId, originalContentData), "getCachedReceivedTranslation"),
        collectHistoricalTranslationMessage: /* @__PURE__ */ __name((queueItem) => plugin.collectHistoricalTranslationMessage(queueItem), "collectHistoricalTranslationMessage"),
        finishHistoricalTranslationSnapshot: /* @__PURE__ */ __name((channelId) => plugin.finishHistoricalTranslationSnapshot(channelId), "finishHistoricalTranslationSnapshot"),
        getFailedHistoricalTranslationCount: /* @__PURE__ */ __name((channelId) => plugin.getFailedHistoricalTranslationCount(channelId), "getFailedHistoricalTranslationCount"),
        updateLoadedAutoTranslationStatus: /* @__PURE__ */ __name((update) => plugin.updateLoadedAutoTranslationStatus(update), "updateLoadedAutoTranslationStatus"),
        getCurrentBatchNumber
      });
    }
    __name(createPluginHistoricalSourceRuntime, "createPluginHistoricalSourceRuntime");
    module2.exports = { createPluginHistoricalSourceRuntime };
  }
});

// src/lifecycle/message-deletion-lifecycle.js
var require_message_deletion_lifecycle = __commonJS({
  "src/lifecycle/message-deletion-lifecycle.js"(exports2, module2) {
    function createMessageDeletionLifecycle({
      removeLiveMessage = /* @__PURE__ */ __name(() => !1, "removeLiveMessage"),
      getHistoricalQueue = /* @__PURE__ */ __name(() => null, "getHistoricalQueue"),
      getFailedSnapshot = /* @__PURE__ */ __name(() => null, "getFailedSnapshot"),
      setFailedSnapshot = /* @__PURE__ */ __name(() => {
      }, "setFailedSnapshot"),
      deleteFailedSnapshot = /* @__PURE__ */ __name(() => {
      }, "deleteFailedSnapshot"),
      clearHistoricalMarker = /* @__PURE__ */ __name(() => {
      }, "clearHistoricalMarker"),
      hasCachedTranslation = /* @__PURE__ */ __name(() => !1, "hasCachedTranslation"),
      clearCachedTranslation = /* @__PURE__ */ __name(() => {
      }, "clearCachedTranslation"),
      deleteDisplayMessage = /* @__PURE__ */ __name(() => !1, "deleteDisplayMessage")
    } = {}) {
      function removeHistoricalMessage(messageId, channelId) {
        let entry = getHistoricalQueue(channelId), removed = !1;
        for (let job of entry && entry.jobs || [])
          job.invalidateMessage(messageId, "source-deleted") && (removed = !0), clearHistoricalMarker(messageId, job.id);
        let failedEntry = getFailedSnapshot(channelId);
        if (failedEntry && failedEntry.items) {
          let items = failedEntry.items.filter((item) => !item || !item.message || String(item.message.id) !== messageId);
          items.length !== failedEntry.items.length && (removed = !0, items.length ? setFailedSnapshot(channelId, { ...failedEntry, items }) : deleteFailedSnapshot(channelId));
        }
        return removed;
      }
      __name(removeHistoricalMessage, "removeHistoricalMessage");
      async function deleteMessage(messageId, channelId) {
        if (!messageId || !channelId) return !1;
        messageId = String(messageId), channelId = String(channelId);
        let liveRemoved = removeLiveMessage(messageId, channelId), historicalRemoved = removeHistoricalMessage(messageId, channelId), cacheRemoved = hasCachedTranslation(messageId);
        clearCachedTranslation(messageId);
        let displayOutcome = await deleteDisplayMessage(messageId, channelId);
        return { messageId, channelId, removed: !!(liveRemoved || historicalRemoved || cacheRemoved || displayOutcome), displayOutcome };
      }
      __name(deleteMessage, "deleteMessage");
      function handleAction(action) {
        if (!action || action.type != "MESSAGE_DELETE" && action.type != "MESSAGE_DELETE_BULK") return Promise.resolve(!1);
        let channelId = action.channelId || action.channel_id, messageIds = action.type == "MESSAGE_DELETE_BULK" ? action.ids || action.messageIds || action.message_ids || [] : [action.id || action.messageId || action.message_id], uniqueIds = [...new Set([].concat(messageIds || []).filter(Boolean).map(String))];
        return !channelId || !uniqueIds.length ? Promise.resolve(!1) : Promise.all(uniqueIds.map((messageId) => deleteMessage(messageId, channelId)));
      }
      return __name(handleAction, "handleAction"), Object.freeze({ deleteMessage, handleAction });
    }
    __name(createMessageDeletionLifecycle, "createMessageDeletionLifecycle");
    module2.exports = { createMessageDeletionLifecycle };
  }
});

// src/settings/settings-store.js
var require_settings_store = __commonJS({
  "src/settings/settings-store.js"(exports2, module2) {
    var LANGUAGE_DIRECTIONS = Object.freeze({ INPUT: "input", OUTPUT: "output" });
    function isRecord(value) {
      return !!value && typeof value == "object" && !Array.isArray(value);
    }
    __name(isRecord, "isRecord");
    function isEmptyRecord(value) {
      return !value || !Object.keys(value).length;
    }
    __name(isEmptyRecord, "isEmptyRecord");
    function createEmptyChannelEnablementState(globalDefault = !1) {
      return {
        globalDefault: !!globalDefault,
        channelOverrides: {}
      };
    }
    __name(createEmptyChannelEnablementState, "createEmptyChannelEnablementState");
    function normalizeStoredChannelEnablementState(state) {
      if (!isRecord(state)) return null;
      let normalizedState = createEmptyChannelEnablementState(state.globalDefault), overrides = state.channelOverrides;
      if (!isRecord(overrides)) return normalizedState;
      for (let channelId in overrides)
        channelId && typeof overrides[channelId] == "boolean" && (normalizedState.channelOverrides[channelId] = overrides[channelId]);
      return normalizedState;
    }
    __name(normalizeStoredChannelEnablementState, "normalizeStoredChannelEnablementState");
    function migrateLegacyChannelEnablementState(stateKeys) {
      let normalizedState = createEmptyChannelEnablementState(!1);
      for (let stateKey of stateKeys || [])
        typeof stateKey != "string" || !stateKey || stateKey == "global" || (normalizedState.channelOverrides[stateKey] = !0);
      return normalizedState;
    }
    __name(migrateLegacyChannelEnablementState, "migrateLegacyChannelEnablementState");
    function loadChannelEnablementState(primaryStoredState, secondaryStoredState) {
      let normalizedPrimaryState = normalizeStoredChannelEnablementState(primaryStoredState) || (Array.isArray(primaryStoredState) ? migrateLegacyChannelEnablementState(primaryStoredState) : null), normalizedSecondaryState = normalizeStoredChannelEnablementState(secondaryStoredState) || (Array.isArray(secondaryStoredState) ? migrateLegacyChannelEnablementState(secondaryStoredState) : null);
      return {
        globalDefault: !1,
        channelOverrides: Object.assign({}, normalizedSecondaryState && normalizedSecondaryState.channelOverrides, normalizedPrimaryState && normalizedPrimaryState.channelOverrides)
      };
    }
    __name(loadChannelEnablementState, "loadChannelEnablementState");
    function getChannelEnablementStateValue(channelId, state) {
      let normalizedState = normalizeStoredChannelEnablementState(state) || createEmptyChannelEnablementState(!1);
      return channelId && Object.prototype.hasOwnProperty.call(normalizedState.channelOverrides, channelId) ? normalizedState.channelOverrides[channelId] : normalizedState.globalDefault;
    }
    __name(getChannelEnablementStateValue, "getChannelEnablementStateValue");
    function channelEnablementStatesEqual(leftState, rightState) {
      let normalizedLeftState = normalizeStoredChannelEnablementState(leftState) || createEmptyChannelEnablementState(!1), normalizedRightState = normalizeStoredChannelEnablementState(rightState) || createEmptyChannelEnablementState(!1);
      if (normalizedLeftState.globalDefault != normalizedRightState.globalDefault) return !1;
      let leftChannelIds = Object.keys(normalizedLeftState.channelOverrides), rightChannelIds = Object.keys(normalizedRightState.channelOverrides);
      if (leftChannelIds.length != rightChannelIds.length) return !1;
      for (let channelId of leftChannelIds) if (normalizedLeftState.channelOverrides[channelId] != normalizedRightState.channelOverrides[channelId]) return !1;
      return !0;
    }
    __name(channelEnablementStatesEqual, "channelEnablementStatesEqual");
    function createSettingsStore({
      // The engine catalogue. Defaults to "no engine exists" rather than "every engine
      // exists": with no catalogue injected a stored override can never resolve to an
      // engine that is not installed, which is the direction that cannot corrupt state.
      isKnownEngine = /* @__PURE__ */ __name(() => !1, "isKnownEngine"),
      // The legacy table is ordered by favourite through BDFDB; the ordering is a
      // presentation concern, so it stays a hook instead of being reimplemented here.
      sortLanguages = /* @__PURE__ */ __name((table) => table, "sortLanguages"),
      // Channel to guild resolution lives in the Discord stores, and "@me" is the guild
      // id the legacy runtime uses for direct messages.
      resolveGuildId = /* @__PURE__ */ __name(() => null, "resolveGuildId"),
      // Persistence. Every loader may return anything the profile happens to hold,
      // including nothing at all.
      loadFavorites = /* @__PURE__ */ __name(() => [], "loadFavorites"),
      persistFavorites = /* @__PURE__ */ __name(() => {
      }, "persistFavorites"),
      loadAuthKeys = /* @__PURE__ */ __name(() => ({}), "loadAuthKeys"),
      persistAuthKeys = /* @__PURE__ */ __name(() => {
      }, "persistAuthKeys"),
      loadChannelLanguages = /* @__PURE__ */ __name(() => ({}), "loadChannelLanguages"),
      persistChannelLanguages = /* @__PURE__ */ __name(() => {
      }, "persistChannelLanguages"),
      loadGuildLanguages = /* @__PURE__ */ __name(() => ({}), "loadGuildLanguages"),
      persistGuildLanguages = /* @__PURE__ */ __name(() => {
      }, "persistGuildLanguages"),
      loadChannelPrimaryEngineOverrides = /* @__PURE__ */ __name(() => ({}), "loadChannelPrimaryEngineOverrides"),
      persistChannelPrimaryEngineOverrides = /* @__PURE__ */ __name(() => {
      }, "persistChannelPrimaryEngineOverrides"),
      loadTranslationEnabledStates = /* @__PURE__ */ __name(() => null, "loadTranslationEnabledStates"),
      loadReceivedAutoTranslationEnabledStates = /* @__PURE__ */ __name(() => null, "loadReceivedAutoTranslationEnabledStates"),
      // One callback because the two enablement keys are always written together; the
      // compatibility key is what lets an older build of the plugin still read the state.
      persistChannelEnablementState = /* @__PURE__ */ __name(() => {
      }, "persistChannelEnablementState"),
      // The global fallback lives in the plugin settings, not in this store.
      loadGlobalLanguageChoice = /* @__PURE__ */ __name(() => null, "loadGlobalLanguageChoice"),
      persistGlobalLanguageChoice = /* @__PURE__ */ __name(() => {
      }, "persistGlobalLanguageChoice")
    } = {}) {
      let languages = {}, favorites = [], authKeys = {}, channelLanguages = {}, guildLanguages = {}, channelPrimaryEngineOverrides = {}, translationEnabledStates = createEmptyChannelEnablementState(!1);
      function getChannelLanguageScope(channelId, place) {
        let record = channelLanguages[channelId];
        return record && record[place] || null;
      }
      __name(getChannelLanguageScope, "getChannelLanguageScope");
      function getGuildLanguageScope(guildId, place) {
        let record = guildLanguages[guildId];
        return record && record[place] || null;
      }
      __name(getGuildLanguageScope, "getGuildLanguageScope");
      function resolveLanguageChoice(direction, place, channelId) {
        let guildId = resolveGuildId(channelId), choice, channelScope = getChannelLanguageScope(channelId, place), guildScope = guildId ? getGuildLanguageScope(guildId, place) : null;
        return channelScope ? choice = channelScope[direction] : guildScope ? choice = guildScope[direction] : choice = loadGlobalLanguageChoice(place, direction), choice = languages[choice] ? choice : Object.keys(languages)[0], direction == LANGUAGE_DIRECTIONS.OUTPUT && choice == "auto" ? "en" : choice;
      }
      __name(resolveLanguageChoice, "resolveLanguageChoice");
      function createInheritedLanguageScope(place) {
        let scope = {};
        for (let direction of Object.values(LANGUAGE_DIRECTIONS)) scope[direction] = resolveLanguageChoice(direction, place, null);
        return scope;
      }
      __name(createInheritedLanguageScope, "createInheritedLanguageScope");
      function ensureChannelLanguageChoiceScope(channelId, place) {
        if (!channelId || !place) return null;
        if (channelLanguages[channelId] || (channelLanguages[channelId] = {}), !channelLanguages[channelId][place]) {
          channelLanguages[channelId][place] = {};
          for (let direction of Object.values(LANGUAGE_DIRECTIONS)) channelLanguages[channelId][place][direction] = resolveLanguageChoice(direction, place, channelId);
        }
        return channelLanguages[channelId][place];
      }
      __name(ensureChannelLanguageChoiceScope, "ensureChannelLanguageChoiceScope");
      function normalizeStoredChannelPrimaryEngineOverrides(overrides) {
        if (!isRecord(overrides)) return {};
        let normalizedOverrides = {};
        for (let channelId in overrides) {
          let engineKey = overrides[channelId];
          !channelId || typeof engineKey != "string" || !isKnownEngine(engineKey) || (normalizedOverrides[channelId] = engineKey);
        }
        return normalizedOverrides;
      }
      __name(normalizeStoredChannelPrimaryEngineOverrides, "normalizeStoredChannelPrimaryEngineOverrides");
      function saveChannelEnablementState(nextState) {
        return translationEnabledStates = nextState, persistChannelEnablementState(nextState), translationEnabledStates;
      }
      return __name(saveChannelEnablementState, "saveChannelEnablementState"), Object.freeze({
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
          let table = isRecord(builtLanguages) ? builtLanguages : {};
          for (let languageId in table) isRecord(table[languageId]) && (table[languageId].fav = favorites.includes(languageId) ? 0 : 1);
          return languages = sortLanguages(table) || table, languages;
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
          let index = favorites.indexOf(languageId);
          return isFavorite ? index < 0 && favorites.push(languageId) : index >= 0 && (favorites = favorites.filter((id) => id != languageId)), favorites.sort(), persistFavorites(favorites), favorites;
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
          let credential = engineKey && authKeys[engineKey];
          return credential ? credential[field] : void 0;
        },
        // Replaces one engine's whole credential record, which is what the provider
        // client does after it normalises an endpoint or resolves a model id.
        setCredential(engineKey, credential) {
          return engineKey ? (authKeys[engineKey] = credential, persistAuthKeys(authKeys), authKeys[engineKey]) : null;
        },
        // Text fields: key, endpoint, model, region. The trim rule is the legacy one -
        // a value with no trim method is stored as-is - so a field that was never a
        // string keeps whatever the panel passed.
        setCredentialField(engineKey, field, value) {
          return !engineKey || !field ? null : (authKeys[engineKey] || (authKeys[engineKey] = {}), authKeys[engineKey][field] = (value || "").trim ? (value || "").trim() : value, persistAuthKeys(authKeys), authKeys[engineKey]);
        },
        // Non-text fields, currently only the premium "paid" switch. Kept separate
        // because trimming would turn a false switch into an empty string.
        setCredentialFlag(engineKey, field, value) {
          return !engineKey || !field ? null : (authKeys[engineKey] || (authKeys[engineKey] = {}), authKeys[engineKey][field] = value, persistAuthKeys(authKeys), authKeys[engineKey]);
        },
        // The write half of the provider client seam: it mutates the record it got from
        // getAuthKeys and then hands the whole table back here to be persisted.
        replaceAuthKeys(nextAuthKeys) {
          return authKeys = isRecord(nextAuthKeys) ? nextAuthKeys : {}, persistAuthKeys(authKeys), authKeys;
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
          let guildId = resolveGuildId(channelId), channelScope = getChannelLanguageScope(channelId, place);
          if (channelScope)
            return channelScope[direction] = choice, persistChannelLanguages(channelLanguages), "channel";
          let guildScope = guildId ? getGuildLanguageScope(guildId, place) : null;
          return guildScope ? (guildScope[direction] = choice, persistGuildLanguages(guildLanguages), "guild") : (persistGlobalLanguageChoice(place, direction, choice), "global");
        },
        ensureChannelLanguageChoiceScope,
        // Pins one direction to a channel, creating the scope when needed. Used when a
        // reply target language is detected for a channel.
        setChannelLanguageChoice(channelId, place, direction, choice) {
          if (!channelId || !place || !direction) return null;
          let scope = ensureChannelLanguageChoiceScope(channelId, place);
          return scope ? (scope[direction] = choice, persistChannelLanguages(channelLanguages), scope) : null;
        },
        // The settings surface offers one control that walks the scope of a place:
        // global -> guild -> channel -> global. Each step seeds the new scope from the
        // choice that was in effect, and an emptied guild or channel record is removed
        // so the stored file does not accumulate empty objects. Returns the new scope.
        cycleLanguageChoiceScope(channelId, guildId, place) {
          if (!place) return null;
          let nextScope;
          return getChannelLanguageScope(channelId, place) ? (delete channelLanguages[channelId][place], isEmptyRecord(channelLanguages[channelId]) && delete channelLanguages[channelId], nextScope = "global") : getGuildLanguageScope(guildId, place) ? (delete guildLanguages[guildId][place], isEmptyRecord(guildLanguages[guildId]) && delete guildLanguages[guildId], channelLanguages[channelId] || (channelLanguages[channelId] = {}), channelLanguages[channelId][place] = createInheritedLanguageScope(place), nextScope = "channel") : (guildLanguages[guildId] || (guildLanguages[guildId] = {}), guildLanguages[guildId][place] = createInheritedLanguageScope(place), nextScope = "guild"), persistChannelLanguages(channelLanguages), persistGuildLanguages(guildLanguages), nextScope;
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
          let engineKey = channelPrimaryEngineOverrides[channelId];
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
          return !channelId || !isKnownEngine(engineKey) ? !1 : (channelPrimaryEngineOverrides[channelId] = engineKey, persistChannelPrimaryEngineOverrides(channelPrimaryEngineOverrides), !0);
        },
        clearChannelPrimaryEngineOverride(channelId) {
          return !channelId || !Object.prototype.hasOwnProperty.call(channelPrimaryEngineOverrides, channelId) ? !1 : (delete channelPrimaryEngineOverrides[channelId], persistChannelPrimaryEngineOverrides(channelPrimaryEngineOverrides), !0);
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
          let currentState = normalizeStoredChannelEnablementState(translationEnabledStates) || createEmptyChannelEnablementState(!1), nextState = {
            globalDefault: !1,
            channelOverrides: Object.assign({}, currentState.channelOverrides)
          };
          return channelId ? (enabled == nextState.globalDefault ? delete nextState.channelOverrides[channelId] : nextState.channelOverrides[channelId] = !!enabled, saveChannelEnablementState(nextState), nextState) : currentState;
        },
        // --- reload ---------------------------------------------------------------
        // Re-reads everything the user can edit outside the plugin. A loader that hands
        // back something unusable keeps the value already in memory instead of blanking
        // it: an empty in-memory record would be written back to disk by the very next
        // edit, and that is how a transient read failure turns into lost configuration.
        reload() {
          let storedFavorites = loadFavorites();
          favorites = Array.isArray(storedFavorites) ? storedFavorites : favorites;
          let storedAuthKeys = loadAuthKeys();
          authKeys = isRecord(storedAuthKeys) ? storedAuthKeys : authKeys;
          let storedChannelLanguages = loadChannelLanguages();
          channelLanguages = isRecord(storedChannelLanguages) ? storedChannelLanguages : channelLanguages;
          let storedGuildLanguages = loadGuildLanguages();
          guildLanguages = isRecord(storedGuildLanguages) ? storedGuildLanguages : guildLanguages;
          let storedOverrides = loadChannelPrimaryEngineOverrides();
          channelPrimaryEngineOverrides = isRecord(storedOverrides) ? normalizeStoredChannelPrimaryEngineOverrides(storedOverrides) : channelPrimaryEngineOverrides;
          let storedPrimaryState = loadTranslationEnabledStates(), storedSecondaryState = loadReceivedAutoTranslationEnabledStates();
          if (storedPrimaryState == null && storedSecondaryState == null) return translationEnabledStates;
          let normalizedPrimaryState = normalizeStoredChannelEnablementState(storedPrimaryState), normalizedSecondaryState = normalizeStoredChannelEnablementState(storedSecondaryState);
          return translationEnabledStates = loadChannelEnablementState(storedPrimaryState, storedSecondaryState), (!normalizedPrimaryState || !normalizedSecondaryState || !channelEnablementStatesEqual(normalizedPrimaryState, translationEnabledStates) || !channelEnablementStatesEqual(normalizedSecondaryState, translationEnabledStates)) && saveChannelEnablementState(translationEnabledStates), translationEnabledStates;
        }
      });
    }
    __name(createSettingsStore, "createSettingsStore");
    module2.exports = {
      LANGUAGE_DIRECTIONS,
      createEmptyChannelEnablementState,
      normalizeStoredChannelEnablementState,
      migrateLegacyChannelEnablementState,
      loadChannelEnablementState,
      getChannelEnablementStateValue,
      channelEnablementStatesEqual,
      createSettingsStore
    };
  }
});

// src/i18n/labels.js
var require_labels = __commonJS({
  "src/i18n/labels.js"(exports2, module2) {
    function getLabelsForUiLanguage(uiLanguageId) {
      switch (uiLanguageId) {
        case "bg":
          return {
            backup_engine: "Резервен-Преводач",
            backup_engine_warning: "Ще използва Резервен-Преводач",
            context_messagetranslateoption: "Превод на съобщението",
            context_messageuntranslateoption: "Превод на съобщението",
            context_translator: "Търсене превод",
            detect_language: "Разпознаване на езика",
            error_dailylimit: "Дневният лимит на заявките е достигнат.",
            error_hourlylimit: "Почасовият лимит на заявките е достигнат.",
            error_keyoutdated: "API-ключът е остарял.",
            error_monthlylimit: "Месечният лимит на заявките е достигнат.",
            error_serverdown: "Сървърът за превод може да е офлайн.",
            exception_text: "Думите, започващи с {{var0}}, ще бъдат игнорирани",
            general_sendOriginalMessage: "Също така изпраща оригиналното съобщение, когато превежда вашето изпратено съобщение",
            general_showOriginalMessage: "Също така показва оригиналното съобщение при превод на получено съобщение",
            language_choice_input_received: "Език на въвеждане в получените съобщения",
            language_choice_input_sent: "Език на въвеждане в изпратените от вас съобщения",
            language_choice_output_received: "Изходен език в получените съобщения",
            language_choice_output_sent: "Изходен език в изпратените ви съобщения",
            language_selection_channel: "Изборът на език ще бъде променен специално за този канал",
            language_selection_global: "Изборът на език ще бъде променен за всички сървъри",
            language_selection_server: "Изборът на език ще бъде променен специално за този сървър",
            popout_translateoption: "Превод",
            popout_untranslateoption: "Непревод",
            prefixes_disable_text: "Префикси, които деактивират превода на съобщението",
            prefixes_enable_text: "Префикси, които активират превод със специфичен език (напр. $fr, $de, $jp)",
            toast_translating: "Превод",
            toast_translating_failed: "Преводът не бе успешен",
            toast_translating_tryanother: "Опитайте друг преводач",
            translate_your_message: "Преведете вашите съобщения преди изпращане",
            translated_watermark: "преведено",
            translator_engine: "Преводач"
          };
        case "cs":
          return {
            backup_engine: "Backup-Překladatel",
            backup_engine_warning: "Použije Backup-Překladatel",
            context_messagetranslateoption: "Přeložit zprávu",
            context_messageuntranslateoption: "Přeložit zprávu",
            context_translator: "Hledat Překlad",
            detect_language: "Rozpoznat jazyk",
            error_dailylimit: "Denní limit požadavků byl dosažen.",
            error_hourlylimit: "Bylo dosaženo limitu hodinového požadavku.",
            error_keyoutdated: "Klíč API je zastaralý.",
            error_monthlylimit: "Byl dosažen limit měsíčních požadavků.",
            error_serverdown: "Překladový server může být offline.",
            exception_text: "Slova začínající na {{var0}} budou ignorována",
            general_sendOriginalMessage: "Při překladu odeslané zprávy také odešle původní zprávu",
            general_showOriginalMessage: "Také zobrazuje původní zprávu při překladu přijaté zprávy",
            language_choice_input_received: "Vstupní jazyk do přijatých zpráv",
            language_choice_input_sent: "Zadejte jazyk do odeslaných zpráv",
            language_choice_output_received: "Výstupní jazyk v přijatých zprávách",
            language_choice_output_sent: "Jazyk výstupu ve vašich odeslaných zprávách",
            language_selection_channel: "Výběr jazyka bude změněn speciálně pro tento kanál",
            language_selection_global: "Výběr jazyka se změní pro všechny servery",
            language_selection_server: "Výběr jazyka bude změněn speciálně pro tento server",
            popout_translateoption: "Přeložit",
            popout_untranslateoption: "Nepřeložit",
            prefixes_disable_text: "Předpony, které deaktivují překlad zprávy",
            prefixes_enable_text: "Předpony, které aktivují překlad s konkrétním jazykem (např. $fr, $de, $jp)",
            toast_translating: "Překládání",
            toast_translating_failed: "Překlad se nezdařil",
            toast_translating_tryanother: "Zkuste jiný překladač",
            translate_your_message: "Před odesláním si zprávy přeložte",
            translated_watermark: "přeloženo",
            translator_engine: "Překladatel"
          };
        case "da":
          return {
            backup_engine: "Backup-Oversætter",
            backup_engine_warning: "Vil bruge Backup-Oversætter",
            context_messagetranslateoption: "Oversæt besked",
            context_messageuntranslateoption: "Ikke-oversat besked",
            context_translator: "Søg oversættelse",
            detect_language: "Find sprog",
            error_dailylimit: "Daglig anmodningsgrænse nået.",
            error_hourlylimit: "Timegrænsen for anmodning er nået.",
            error_keyoutdated: "API-nøgle forældet.",
            error_monthlylimit: "Månedlig anmodningsgrænse nået.",
            error_serverdown: "Oversættelsesserveren er muligvis offline.",
            exception_text: "Ord, der begynder med {{var0}}, ignoreres",
            general_sendOriginalMessage: "Sender også den originale besked, når du oversætter din sendte besked",
            general_showOriginalMessage: "Viser også den originale besked, når du oversætter modtaget besked",
            language_choice_input_received: "Inputsprog i modtagne beskeder",
            language_choice_input_sent: "Indtast sprog i dine sendte beskeder",
            language_choice_output_received: "Outputsprog i modtagne beskeder",
            language_choice_output_sent: "Outputsprog i dine sendte beskeder",
            language_selection_channel: "Valg af sprog vil blive ændret specifikt for denne kanal",
            language_selection_global: "Valg af sprog vil blive ændret for alle servere",
            language_selection_server: "Sprogvalg vil blive ændret specifikt for denne server",
            popout_translateoption: "Oversætte",
            popout_untranslateoption: "Untranslate",
            prefixes_disable_text: "Præfikser, der deaktiverer oversættelse af meddelelse",
            prefixes_enable_text: "Præfikser, der aktiverer oversættelse med specifikt sprog (f.eks. $fr, $de, $jp)",
            toast_translating: "Oversætter",
            toast_translating_failed: "Kunne ikke oversætte",
            toast_translating_tryanother: "Prøv en anden oversætter",
            translate_your_message: "Oversæt dine beskeder før afsendelse",
            translated_watermark: "oversat",
            translator_engine: "Oversætter"
          };
        case "de":
          return {
            backup_engine: "Backup-Übersetzer",
            backup_engine_warning: "Wird Backup-Übersetzer verwenden",
            context_messagetranslateoption: "Nachricht übersetzen",
            context_messageuntranslateoption: "Nachricht unübersetzen",
            context_translator: "Übersetzung suchen",
            detect_language: "Sprache erkennen",
            error_dailylimit: "Tägliches Anforderungslimit erreicht.",
            error_hourlylimit: "Stündliches Anforderungslimit erreicht.",
            error_keyoutdated: "API-Schlüssel veraltet.",
            error_monthlylimit: "Monatliches Anforderungslimit erreicht.",
            error_serverdown: "Der Übersetzungsserver ist möglicherweise offline.",
            exception_text: "Wörter, die mit {{var0}} beginnen, werden ignoriert",
            general_sendOriginalMessage: "Sendet auch die ursprüngliche Nachricht, wenn die gesendete Nachricht übersetzt wird",
            general_showOriginalMessage: "Zeigt auch die ursprüngliche Nachricht an, wenn eine empfangene Nachricht übersetzt wird",
            language_choice_input_received: "Eingabesprache in empfangenen Nachrichten",
            language_choice_input_sent: "Eingabesprache in gesendeten Nachrichten",
            language_choice_output_received: "Ausgabesprache in empfangenen Nachrichten",
            language_choice_output_sent: "Ausgabesprache in gesendeten Nachrichten",
            language_selection_channel: "Die Sprachauswahl wird speziell für diesen Kanal geändert",
            language_selection_global: "Die Sprachauswahl wird für alle Server geändert",
            language_selection_server: "Die Sprachauswahl wird speziell für diesen Server geändert",
            popout_translateoption: "Übersetzen",
            popout_untranslateoption: "Unübersetzen",
            prefixes_disable_text: "Präfixe, die die Übersetzung der Nachricht deaktivieren",
            prefixes_enable_text: "Präfixe, die die Übersetzung mit einer bestimmten Sprache aktivieren (z.B. $fr, $de, $jp)",
            toast_translating: "Übersetzen",
            toast_translating_failed: "Übersetzung fehlgeschlagen",
            toast_translating_tryanother: "Versuch einen anderen Übersetzer",
            translate_your_message: "Übersetzt Nachrichten vor dem Senden",
            translated_watermark: "übersetzt",
            translator_engine: "Übersetzer"
          };
        case "el":
          return {
            backup_engine: "Μεταφράστης-Αντίγραφο ασφαλείας",
            backup_engine_warning: "Θα χρησιμοποιηθεί Μεταφράστης-Αντίγραφο ασφαλείας",
            context_messagetranslateoption: "Μετάφραση μηνύματος",
            context_messageuntranslateoption: "Αναίρεση μετάφρασης μηνύματος",
            context_translator: "Αναζήτηση μετάφρασης",
            detect_language: "Εντοπισμός γλώσσας",
            error_dailylimit: "Συμπληρώθηκε το ημερήσιο όριο αιτημάτων.",
            error_hourlylimit: "Συμπληρώθηκε το ωριαίο όριο αιτημάτων.",
            error_keyoutdated: "Το κλειδί API δεν είναι ενημερωμένο.",
            error_monthlylimit: "Συμπληρώθηκε το μηνιαίο όριο αιτημάτων.",
            error_serverdown: "Ο διακομιστής μετάφρασης ενδέχεται να είναι εκτός σύνδεσης.",
            exception_text: "Οι λέξεις θα αγνοηθούν που ξεκινούν με {{var0}}",
            general_sendOriginalMessage: "Αποστολή αρχικού Μηνύματος με τη μετάφραση απεσταλμένου μηνύματος",
            general_showOriginalMessage: "Εμφάνιση αρχικού Μηνύματος με τη μετάφραση ενός ληφθέντος μηνύματος",
            language_choice_input_received: "Γλώσσα εισαγωγής στα ληφθέντα μηνύματα",
            language_choice_input_sent: "Γλώσσα εισαγωγής στα απεσταλμένα μηνύματά σας",
            language_choice_output_received: "Γλώσσα εξαγωγής στα ληφθέντα μηνύματα",
            language_choice_output_sent: "Γλώσσα εξαγωγής στα απεσταλμένα μηνύματά σας",
            language_selection_channel: "Η επιλογή γλώσσας θα αλλάξει ειδικά για αυτό το κανάλι",
            language_selection_global: "Η Επιλογή Γλώσσας θα αλλάξει για όλους τους Διακομιστές",
            language_selection_server: "Η επιλογή γλώσσας θα αλλάξει ειδικά για αυτόν τον διακομιστή",
            popout_translateoption: "Μετάφραση",
            popout_untranslateoption: "Αναίρεση μετάφρασης",
            prefixes_disable_text: "Προθέσεις που απενεργοποιούν την μετάφραση του μηνύματος",
            prefixes_enable_text: "Προθέσεις που ενεργοποιούν την μετάφραση με συγκεκριμένη γλώσσα (π.χ. $fr, $de, $jp)",
            toast_translating: "Μετάφραση",
            toast_translating_failed: "Αποτυχία μετάφρασης",
            toast_translating_tryanother: "Δοκιμάστε έναν άλλο Μεταφραστή",
            translate_your_message: "Μεταφράστε τα Μηνύματά σας πριν την αποστολή",
            translated_watermark: "μεταφρασμένο",
            translator_engine: "Μεταφράστης"
          };
        case "es":
          return {
            backup_engine: "Backup-Traductor",
            backup_engine_warning: "Utilizará Backup-Traductor",
            context_messagetranslateoption: "Traducir mensaje",
            context_messageuntranslateoption: "Mensaje sin traducir",
            context_translator: "Buscar traducción",
            detect_language: "Detectar idioma",
            error_dailylimit: "Se alcanzó el límite de solicitudes diarias.",
            error_hourlylimit: "Se alcanzó el límite de solicitudes por hora.",
            error_keyoutdated: "API-Key obsoleta.",
            error_monthlylimit: "Se alcanzó el límite de solicitudes mensuales.",
            error_serverdown: "El servidor de traducción puede estar fuera de línea.",
            exception_text: "Las palabras que comienzan con {{var0}} serán ignoradas",
            general_sendOriginalMessage: "También envía el mensaje original al traducir su mensaje enviado",
            general_showOriginalMessage: "También muestra el mensaje original al traducir un mensaje recibido",
            language_choice_input_received: "Idioma de entrada en los mensajes recibidos",
            language_choice_input_sent: "Idioma de entrada en sus mensajes enviados",
            language_choice_output_received: "Idioma de salida en los mensajes recibidos",
            language_choice_output_sent: "Idioma de salida en sus mensajes enviados",
            language_selection_channel: "La selección de idioma se cambiará específicamente para este canal",
            language_selection_global: "La selección de idioma se cambiará para todos los servidores",
            language_selection_server: "La selección de idioma se cambiará específicamente para este servidor",
            popout_translateoption: "Traducir",
            popout_untranslateoption: "No traducir",
            prefixes_disable_text: "Prefijos que desactivan la traducción del mensaje",
            prefixes_enable_text: "Prefijos que activan la traducción con un idioma específico (por ejemplo, $fr, $de, $jp)",
            toast_translating: "Traductorio",
            toast_translating_failed: "No se pudo traducir",
            toast_translating_tryanother: "Prueba con otro traductor",
            translate_your_message: "Traduce tus mensajes antes de enviarlos",
            translated_watermark: "traducido",
            translator_engine: "Traductor"
          };
        case "es-419":
          return {
            backup_engine: "Traspaso de respaldo",
            backup_engine_warning: "Utilizará el traductor de respaldo",
            context_messagetranslateoption: "Mensaje de traducir",
            context_messageuntranslateoption: "Mensaje no traducido",
            context_translator: "Traducción de búsqueda",
            detect_language: "Detectar lenguaje",
            error_dailylimit: "Límite de solicitud diaria alcanzado.",
            error_hourlylimit: "Límite de solicitud por hora alcanzado.",
            error_keyoutdated: "Api-key anticuado.",
            error_monthlylimit: "Límite de solicitud mensual alcanzado.",
            error_serverdown: "El servidor de traducción puede estar fuera de línea.",
            exception_text: "Las palabras que comienzan con {{var0}} se ignorarán",
            general_sendOriginalMessage: "También envía el mensaje original al traducir su mensaje enviado",
            general_showOriginalMessage: "También muestra el mensaje original al traducir un mensaje recibido",
            language_choice_input_received: "Idioma de entrada en mensajes recibidos",
            language_choice_input_sent: "Idioma de entrada en sus mensajes enviados",
            language_choice_output_received: "Lenguaje de salida en mensajes recibidos",
            language_choice_output_sent: "Lenguaje de salida en sus mensajes enviados",
            language_selection_channel: "La selección del idioma se cambiará específicamente para este canal",
            language_selection_global: "La selección del idioma se cambiará para todos los servidores",
            language_selection_server: "La selección del idioma se cambiará específicamente para este servidor",
            popout_translateoption: "Traducir",
            popout_untranslateoption: "No traducido",
            prefixes_disable_text: "Prefijos que deshabilitan la traducción del mensaje",
            prefixes_enable_text: "Prefijos que habilitan la traducción con un lenguaje específico (por ejemplo, $fr, $de, $jp)",
            toast_translating: "Traductorio",
            toast_translating_failed: "No se pudo traducir",
            toast_translating_tryanother: "Prueba otro traductor",
            translate_your_message: "Traducir sus mensajes antes de enviar",
            translated_watermark: "traducido",
            translator_engine: "Traductor"
          };
        case "fi":
          return {
            backup_engine: "Backup-Kääntäjä",
            backup_engine_warning: "Käyttää Backup-Kääntäjä",
            context_messagetranslateoption: "Käännä viesti",
            context_messageuntranslateoption: "Käännä viesti",
            context_translator: "Hae käännöstä",
            detect_language: "Tunnista kieli",
            error_dailylimit: "Päivittäinen pyyntöraja saavutettu.",
            error_hourlylimit: "Tuntikohtainen pyyntöraja saavutettu.",
            error_keyoutdated: "API-avain vanhentunut.",
            error_monthlylimit: "Kuukauden pyyntöraja saavutettu.",
            error_serverdown: "Käännöspalvelin saattaa olla offline-tilassa.",
            exception_text: "{{var0}} alkavat sanat ohitetaan",
            general_sendOriginalMessage: "Lähettää myös alkuperäisen viestin kääntäessään lähettämääsi viestiä",
            general_showOriginalMessage: "Näyttää myös alkuperäisen viestin käännettäessä vastaanotettua viestiä",
            language_choice_input_received: "Syöttökieli vastaanotetuissa viesteissä",
            language_choice_input_sent: "Syötä kieli lähettämiisi viesteihin",
            language_choice_output_received: "Tulostuskieli vastaanotetuissa viesteissä",
            language_choice_output_sent: "Lähetyskieli lähetetyissä viesteissä",
            language_selection_channel: "Kielen valintaa muutetaan erityisesti tätä kanavaa varten",
            language_selection_global: "Kielen valintaa muutetaan kaikille palvelimille",
            language_selection_server: "Kielen valintaa muutetaan erityisesti tätä palvelinta varten",
            popout_translateoption: "Kääntää",
            popout_untranslateoption: "Käännä",
            prefixes_disable_text: "Etuliitteet, jotka poistavat viestin käännöksen käytöstä",
            prefixes_enable_text: "Etuliitteet, jotka mahdollistavat käännöksen tietyllä kielellä (esim. $fr, $de, $jp)",
            toast_translating: "Kääntäminen",
            toast_translating_failed: "Käännös epäonnistui",
            toast_translating_tryanother: "Kokeile toista kääntäjää",
            translate_your_message: "Käännä viestisi ennen lähettämistä",
            translated_watermark: "käännetty",
            translator_engine: "Kääntäjä"
          };
        case "fr":
          return {
            backup_engine: "Backup-Traducteur",
            backup_engine_warning: "Utilisera Backup-Traducteur",
            context_messagetranslateoption: "Traduire le message",
            context_messageuntranslateoption: "Message non traduit",
            context_translator: "Recherche de traduction",
            detect_language: "Détecter la langue",
            error_dailylimit: "Limite quotidienne de requêtes atteinte.",
            error_hourlylimit: "Limite horaire de demandes atteinte.",
            error_keyoutdated: "Clé API obsolète.",
            error_monthlylimit: "Limite mensuelle de demandes atteinte.",
            error_serverdown: "Le serveur de traduction est peut-être hors ligne.",
            exception_text: "Les mots commençant par {{var0}} seront ignorés",
            general_sendOriginalMessage: "Envoie également le message d'origine lors de la traduction de votre message envoyé",
            general_showOriginalMessage: "Affiche également le message d'origine lors de la traduction d'un message reçu",
            language_choice_input_received: "Langue d'entrée dans les messages reçus",
            language_choice_input_sent: "Langue d'entrée dans vos messages envoyés",
            language_choice_output_received: "Langue de sortie dans les messages reçus",
            language_choice_output_sent: "Langue de sortie dans vos messages envoyés",
            language_selection_channel: "La sélection de la langue sera modifiée spécifiquement pour ce canal",
            language_selection_global: "La sélection de la langue sera modifiée pour tous les serveurs",
            language_selection_server: "La sélection de la langue sera modifiée spécifiquement pour ce serveur",
            popout_translateoption: "Traduire",
            popout_untranslateoption: "Non traduit",
            prefixes_disable_text: "Préfixes qui désactivent la traduction du message",
            prefixes_enable_text: "Préfixes qui activent la traduction avec un langage spécifique (par exemple, $fr, $de, $jp)",
            toast_translating: "Traduction en cours",
            toast_translating_failed: "Échec de la traduction",
            toast_translating_tryanother: "Essayez un autre traducteur",
            translate_your_message: "Traduisez vos messages avant de les envoyer",
            translated_watermark: "traduit",
            translator_engine: "Traducteur"
          };
        case "hi":
          return {
            backup_engine: "बैकअप-अनुवादक",
            backup_engine_warning: "बैकअप-अनुवादक का उपयोग करेंगे",
            context_messagetranslateoption: "संदेश का अनुवाद करें",
            context_messageuntranslateoption: "संदेश का अनुवाद न करें",
            context_translator: "अनुवाद खोजें",
            detect_language: "भाषा की जांच करो",
            error_dailylimit: "दैनिक अनुरोध सीमा पूरी हो गई है।",
            error_hourlylimit: "घंटे के अनुरोध की सीमा पूरी हो गई है.",
            error_keyoutdated: "एपीआई-कुंजी पुरानी हो चुकी है।",
            error_monthlylimit: "मासिक अनुरोध सीमा पूरी हो गई है।",
            error_serverdown: "अनुवाद सर्वर ऑफ़लाइन हो सकता है।",
            exception_text: "{{var0}} से शुरू होने वाले शब्दों पर ध्यान नहीं दिया जाएगा",
            general_sendOriginalMessage: "आपके भेजे गए संदेश का अनुवाद करते समय मूल संदेश भी भेजता है",
            general_showOriginalMessage: "प्राप्त संदेश का अनुवाद करते समय मूल संदेश भी दिखाता है",
            language_choice_input_received: "प्राप्त संदेशों में इनपुट भाषा",
            language_choice_input_sent: "आपके भेजे गए संदेशों में इनपुट भाषा",
            language_choice_output_received: "प्राप्त संदेशों में आउटपुट भाषा",
            language_choice_output_sent: "आपके भेजे गए संदेशों में आउटपुट भाषा",
            language_selection_channel: "इस चैनल के लिए भाषा चयन विशेष रूप से बदला जाएगा",
            language_selection_global: "सभी सर्वरों के लिए भाषा चयन बदल दिया जाएगा",
            language_selection_server: "इस सर्वर के लिए भाषा चयन विशेष रूप से बदल दिया जाएगा",
            popout_translateoption: "अनुवाद करना",
            popout_untranslateoption: "अनुवाद न करें",
            prefixes_disable_text: "उपसर्ग जो संदेश के अनुवाद को अक्षम करते हैं",
            prefixes_enable_text: "उपसर्ग जो विशिष्ट भाषा के साथ अनुवाद को सक्षम करते हैं (जैसे $fr, $de, $jp)",
            toast_translating: "अनुवाद",
            toast_translating_failed: "अनुवाद करने में विफल",
            toast_translating_tryanother: "दूसरे अनुवादक का प्रयास करें",
            translate_your_message: "भेजने से पहले अपने संदेशों का अनुवाद करें",
            translated_watermark: "अनुवाद",
            translator_engine: "अनुवादक"
          };
        case "hr":
          return {
            backup_engine: "Rezervni-Prevoditelj",
            backup_engine_warning: "Koristit će se Rezervni-Prevoditelj",
            context_messagetranslateoption: "Prevedi poruku",
            context_messageuntranslateoption: "Prevedi poruku",
            context_translator: "Pretraži prijevod",
            detect_language: "Prepoznaj jezik",
            error_dailylimit: "Dosegnuto je dnevno ograničenje zahtjeva.",
            error_hourlylimit: "Dosegnuto je ograničenje zahtjeva po satu.",
            error_keyoutdated: "API-ključ zastario.",
            error_monthlylimit: "Dosegnuto je mjesečno ograničenje zahtjeva.",
            error_serverdown: "Translation Server možda je offline.",
            exception_text: "Riječi koje počinju s {{var0}} bit će zanemarene",
            general_sendOriginalMessage: "Također šalje izvornu poruku prilikom prijevoda vaše poslane poruke",
            general_showOriginalMessage: "Također prikazuje izvornu poruku prilikom prijevoda primljene poruke",
            language_choice_input_received: "Jezik unosa u primljenim porukama",
            language_choice_input_sent: "Jezik unosa u vaše poslane poruke",
            language_choice_output_received: "Izlazni jezik u primljenim porukama",
            language_choice_output_sent: "Izlazni jezik u vašim poslanim porukama",
            language_selection_channel: "Odabir jezika bit će promijenjen posebno za ovaj kanal",
            language_selection_global: "Odabir jezika bit će promijenjen za sve poslužitelje",
            language_selection_server: "Odabir jezika bit će promijenjen posebno za ovaj poslužitelj",
            popout_translateoption: "Prevedi",
            popout_untranslateoption: "Neprevedi",
            prefixes_disable_text: "Prefiksi koji onemogućuju prijevod poruke",
            prefixes_enable_text: "Prefiksi koji omogućuju prijevod određenim jezikom (npr. $fr, $de, $jp)",
            toast_translating: "Prevođenje",
            toast_translating_failed: "Prijevod nije uspio",
            toast_translating_tryanother: "Pokušajte s drugim prevoditeljem",
            translate_your_message: "Prevedite svoje poruke prije slanja",
            translated_watermark: "prevedeno",
            translator_engine: "Prevoditelj"
          };
        case "hu":
          return {
            backup_engine: "Backup-Fordító",
            backup_engine_warning: "A Backup-Fordító programot fogja használni",
            context_messagetranslateoption: "Üzenet lefordítása",
            context_messageuntranslateoption: "Az üzenet lefordítása",
            context_translator: "Keresés a fordításban",
            detect_language: "Nyelvfelismerés",
            error_dailylimit: "Elérte a napi igénylési korlátot.",
            error_hourlylimit: "Elérte az óránkénti igénylési korlátot.",
            error_keyoutdated: "API-kulcs elavult.",
            error_monthlylimit: "Elérte a havi igénylési limitet.",
            error_serverdown: "Lehet, hogy a Fordítószerver offline állapotban van.",
            exception_text: "A(z) {{var0}} kezdetű szavak figyelmen kívül maradnak",
            general_sendOriginalMessage: "Az eredeti üzenetet is elküldi az elküldött üzenet fordítása során",
            general_showOriginalMessage: "A fogadott üzenet lefordításakor az eredeti üzenetet is megjeleníti",
            language_choice_input_received: "Beviteli nyelv a fogadott üzenetekben",
            language_choice_input_sent: "Írja be a nyelvet az elküldött üzenetekben",
            language_choice_output_received: "Kimeneti nyelv a fogadott üzenetekben",
            language_choice_output_sent: "Kimeneti nyelv az elküldött üzenetekben",
            language_selection_channel: "A nyelvválasztás kifejezetten ehhez a csatornához fog módosulni",
            language_selection_global: "A nyelv kiválasztása minden szerveren módosul",
            language_selection_server: "A nyelvválasztás kifejezetten ehhez a szerverhez módosul",
            popout_translateoption: "fordít",
            popout_untranslateoption: "Fordítás le",
            prefixes_disable_text: "Az üzenet fordítását letiltó előtagok",
            prefixes_enable_text: "Előtagok, amelyek lehetővé teszik a fordítás meghatározott nyelvvel (például $fr, $de, $jp)",
            toast_translating: "Fordítás",
            toast_translating_failed: "Nem sikerült lefordítani",
            toast_translating_tryanother: "Próbálkozzon másik fordítóval",
            translate_your_message: "Küldés előtt fordítsa le az üzeneteit",
            translated_watermark: "lefordított",
            translator_engine: "Fordító"
          };
        case "it":
          return {
            backup_engine: "Backup-Traduttore",
            backup_engine_warning: "Utilizzerà Backup-Traduttore",
            context_messagetranslateoption: "Traduci messaggio",
            context_messageuntranslateoption: "Annulla traduzione messaggio",
            context_translator: "Cerca traduzione",
            detect_language: "Rileva lingua",
            error_dailylimit: "Limite di richieste giornaliere raggiunto.",
            error_hourlylimit: "Limite di richiesta oraria raggiunto.",
            error_keyoutdated: "Chiave API obsoleta.",
            error_monthlylimit: "Limite di richieste mensili raggiunto.",
            error_serverdown: "Il server di traduzione potrebbe essere offline.",
            exception_text: "Le parole che iniziano con {{var0}} verranno ignorate",
            general_sendOriginalMessage: "Invia anche il messaggio originale durante la traduzione del messaggio inviato",
            general_showOriginalMessage: "Mostra anche il messaggio originale durante la traduzione di un messaggio ricevuto",
            language_choice_input_received: "Lingua di input nei messaggi ricevuti",
            language_choice_input_sent: "Inserisci la lingua nei tuoi messaggi inviati",
            language_choice_output_received: "Lingua di output nei messaggi ricevuti",
            language_choice_output_sent: "Lingua di output nei messaggi inviati",
            language_selection_channel: "La selezione della lingua verrà modificata in modo specifico per questo canale",
            language_selection_global: "La selezione della lingua verrà modificata per tutti i server",
            language_selection_server: "La selezione della lingua verrà modificata in modo specifico per questo server",
            popout_translateoption: "Tradurre",
            popout_untranslateoption: "Non tradurre",
            prefixes_disable_text: "Parole che iniziano con {{var0}} verranno ignorate",
            prefixes_enable_text: "Parole che attivano la traduzione con un linguaggio specifico (ad esempio, $fr, $de, $jp)",
            toast_translating: "Tradurre",
            toast_translating_failed: "Impossibile tradurre",
            toast_translating_tryanother: "Prova un altro traduttore",
            translate_your_message: "Traduci i tuoi messaggi prima di inviarli",
            translated_watermark: "tradotto",
            translator_engine: "Traduttore"
          };
        case "ja":
          return {
            backup_engine: "バックアップ翻訳者",
            backup_engine_warning: "バックアップ翻訳者 を使用します",
            context_messagetranslateoption: "メッセージの翻訳",
            context_messageuntranslateoption: "メッセージの翻訳解除",
            context_translator: "翻訳を検索",
            detect_language: "言語を検出",
            error_dailylimit: "1 日のリクエスト上限に達しました。",
            error_hourlylimit: "1 時間あたりのリクエスト制限に達しました。",
            error_keyoutdated: "API キーが古くなっています。",
            error_monthlylimit: "月間リクエスト制限に達しました。",
            error_serverdown: "翻訳サーバーがオフラインになっている可能性があります。",
            exception_text: "{{var0}} で始まる単語は無視されます",
            general_sendOriginalMessage: "送信したメッセージを翻訳するときに元のメッセージも送信します",
            general_showOriginalMessage: "受信したメッセージを翻訳するときに元のメッセージも表示します",
            language_choice_input_received: "受信メッセージの入力言語",
            language_choice_input_sent: "送信メッセージの入力言語",
            language_choice_output_received: "受信メッセージの出力言語",
            language_choice_output_sent: "送信メッセージの出力言語",
            language_selection_channel: "言語の選択は、このチャンネル専用に変更されます",
            language_selection_global: "すべてのサーバーの言語選択が変更されます",
            language_selection_server: "言語の選択は、このサーバー専用に変更されます",
            popout_translateoption: "翻訳する",
            popout_untranslateoption: "翻訳しない",
            prefixes_disable_text: "メッセージの翻訳を無効にするプレフィックス",
            prefixes_enable_text: "特定の言語で翻訳を可能にするプレフィックス（例：$fr, $de, $jp）",
            toast_translating: "翻訳",
            toast_translating_failed: "翻訳に失敗しました",
            toast_translating_tryanother: "別の翻訳者を試す",
            translate_your_message: "送信する前にメッセージを翻訳する",
            translated_watermark: "翻訳済み",
            translator_engine: "翻訳者"
          };
        case "ko":
          return {
            backup_engine: "백업 번역기",
            backup_engine_warning: "백업 번역기를 사용합니다",
            context_messagetranslateoption: "메시지 번역",
            context_messageuntranslateoption: "메시지 번역 취소",
            context_translator: "번역 검색",
            detect_language: "언어를 감지",
            error_dailylimit: "일일 요청 한도에 도달했습니다.",
            error_hourlylimit: "시간당 요청 한도에 도달했습니다.",
            error_keyoutdated: "API 키가 오래되었습니다.",
            error_monthlylimit: "월간 요청 한도에 도달했습니다.",
            error_serverdown: "번역 서버가 오프라인일 수 있습니다.",
            exception_text: "{{var0}}로 시작하는 단어는 무시됩니다.",
            general_sendOriginalMessage: "또한 보낸 메시지를 번역할 때 원본 메시지를 보냅니다.",
            general_showOriginalMessage: "또한 수신된 메시지를 번역할 때 원본 메시지를 표시합니다.",
            language_choice_input_received: "수신된 메시지의 입력 언어",
            language_choice_input_sent: "보낸 메시지의 입력 언어",
            language_choice_output_received: "수신된 메시지의 출력 언어",
            language_choice_output_sent: "보낸 메시지의 출력 언어",
            language_selection_channel: "이 채널에 대해 특별히 언어 선택이 변경됩니다.",
            language_selection_global: "모든 서버에 대해 언어 선택이 변경됩니다.",
            language_selection_server: "이 서버에 대해 특별히 언어 선택이 변경됩니다.",
            popout_translateoption: "옮기다",
            popout_untranslateoption: "번역 취소",
            prefixes_disable_text: "메시지 변환을 비활성화하는 접두사",
            prefixes_enable_text: "특정 언어로 변환을 가능하게하는 접두사 (예: $fr, $de, $jp)",
            toast_translating: "번역 중",
            toast_translating_failed: "번역하지 못했습니다.",
            toast_translating_tryanother: "다른 번역기 시도",
            translate_your_message: "보내기 전에 메시지 번역",
            translated_watermark: "번역",
            translator_engine: "역자"
          };
        case "lt":
          return {
            backup_engine: "Backup-Vertėjas",
            backup_engine_warning: "Naudos Backup-Vertėjas",
            context_messagetranslateoption: "Versti pranešimą",
            context_messageuntranslateoption: "Išversti pranešimą",
            context_translator: "Paieškos vertimas",
            detect_language: "Aptikti kalbą",
            error_dailylimit: "Pasiektas dienos užklausų limitas.",
            error_hourlylimit: "Pasiektas valandinių užklausų limitas.",
            error_keyoutdated: "API raktas pasenęs.",
            error_monthlylimit: "Pasiektas mėnesio užklausų limitas.",
            error_serverdown: "Vertimo serveris gali būti neprisijungęs.",
            exception_text: "Žodžiai, prasidedantys {{var0}}, bus ignoruojami",
            general_sendOriginalMessage: "Taip pat siunčia originalų pranešimą verčiant jūsų išsiųstą žinutę",
            general_showOriginalMessage: "Taip pat rodomas pradinis pranešimas, kai verčiamas gautas pranešimas",
            language_choice_input_received: "Įvesties kalba gautuose pranešimuose",
            language_choice_input_sent: "Įveskite kalbą siunčiamuose pranešimuose",
            language_choice_output_received: "Išvesties kalba gautuose pranešimuose",
            language_choice_output_sent: "Išvesties kalba jūsų išsiųstuose pranešimuose",
            language_selection_channel: "Kalbos pasirinkimas bus pakeistas specialiai šiam kanalui",
            language_selection_global: "Kalbos pasirinkimas bus pakeistas visiems serveriams",
            language_selection_server: "Kalbos pasirinkimas bus pakeistas specialiai šiam serveriui",
            popout_translateoption: "Išversti",
            popout_untranslateoption: "Neišversti",
            prefixes_disable_text: "Priešdėliai, kurie išjungia pranešimo vertimą",
            prefixes_enable_text: "Priešdėliai, įgalinantys vertimą su konkrečia kalba (pvz., $fr, $de, $jp)",
            toast_translating: "Vertimas",
            toast_translating_failed: "Nepavyko išversti",
            toast_translating_tryanother: "Išbandykite kitą vertėją",
            translate_your_message: "Prieš siųsdami išverskite savo pranešimus",
            translated_watermark: "išverstas",
            translator_engine: "Vertėjas"
          };
        case "nl":
          return {
            backup_engine: "Backup-Vertaler",
            backup_engine_warning: "Zal Backup-Vertaler gebruiken",
            context_messagetranslateoption: "Bericht vertalen",
            context_messageuntranslateoption: "Bericht onvertalen",
            context_translator: "Zoek vertaling",
            detect_language: "Taal detecteren",
            error_dailylimit: "Dagelijkse verzoeklimiet bereikt.",
            error_hourlylimit: "Verzoeklimiet per uur bereikt.",
            error_keyoutdated: "API-sleutel verouderd.",
            error_monthlylimit: "Maandelijkse aanvraaglimiet bereikt.",
            error_serverdown: "Vertaalserver is mogelijk offline.",
            exception_text: "Woorden die beginnen met {{var0}} worden genegeerd",
            general_sendOriginalMessage: "Verzendt ook het originele bericht bij het vertalen van uw verzonden bericht",
            general_showOriginalMessage: "Toont ook het originele bericht bij het vertalen van een ontvangen bericht",
            language_choice_input_received: "Invoertaal in ontvangen berichten",
            language_choice_input_sent: "Invoertaal in uw verzonden berichten",
            language_choice_output_received: "Uitvoertaal in ontvangen berichten",
            language_choice_output_sent: "Uitvoertaal in uw verzonden berichten",
            language_selection_channel: "De taalselectie wordt specifiek voor dit kanaal gewijzigd",
            language_selection_global: "Taalkeuze wordt voor alle servers gewijzigd",
            language_selection_server: "Taalselectie wordt specifiek voor deze server gewijzigd",
            popout_translateoption: "Vertalen",
            popout_untranslateoption: "Onvertalen",
            prefixes_disable_text: "Voorvoegsels die de vertaling van het bericht uitschakelen",
            prefixes_enable_text: "Voorvoegsels die vertaling mogelijk maken met specifieke taal (bijv. $fr, $de, $jp)",
            toast_translating: "Vertalen",
            toast_translating_failed: "Kan niet vertalen",
            toast_translating_tryanother: "Probeer een andere vertaler",
            translate_your_message: "Vertaal uw berichten voordat u ze verzendt",
            translated_watermark: "vertaald",
            translator_engine: "Vertaler"
          };
        case "no":
          return {
            backup_engine: "Backup-Oversetter",
            backup_engine_warning: "Vil bruke Backup-Oversetter",
            context_messagetranslateoption: "Oversett melding",
            context_messageuntranslateoption: "Ikke oversett melding",
            context_translator: "Søk i oversettelse",
            detect_language: "Oppdage språk",
            error_dailylimit: "Daglig forespørselsgrense nådd.",
            error_hourlylimit: "Forespørselsgrensen for time nådd.",
            error_keyoutdated: "API-nøkkel utdatert.",
            error_monthlylimit: "Månedlig forespørselsgrense nådd.",
            error_serverdown: "Oversettelsesserveren kan være frakoblet.",
            exception_text: "Ord som begynner med {{var0}} vil bli ignorert",
            general_sendOriginalMessage: "Sender også den originale meldingen når du oversetter den sendte meldingen",
            general_showOriginalMessage: "Viser også den originale meldingen når du oversetter en mottatt melding",
            language_choice_input_received: "Inndataspråk i mottatte meldinger",
            language_choice_input_sent: "Inntastingsspråk i sendte meldinger",
            language_choice_output_received: "Utdataspråk i mottatte meldinger",
            language_choice_output_sent: "Utdataspråk i dine sendte meldinger",
            language_selection_channel: "Språkvalg vil bli endret spesifikt for denne kanalen",
            language_selection_global: "Språkvalg vil bli endret for alle servere",
            language_selection_server: "Språkvalg vil bli endret spesifikt for denne serveren",
            popout_translateoption: "Oversette",
            popout_untranslateoption: "Ikke oversett",
            prefixes_disable_text: "Prefikser som deaktiverer oversettelse av meldingen",
            prefixes_enable_text: "Prefikser som muliggjør oversettelse med spesifikt språk (f.eks. $fr, $de, $jp)",
            toast_translating: "Oversetter",
            toast_translating_failed: "Kunne ikke oversette",
            toast_translating_tryanother: "Prøv en annen oversetter",
            translate_your_message: "Oversett meldingene dine før sending",
            translated_watermark: "oversatt",
            translator_engine: "Oversetter"
          };
        case "pl":
          return {
            backup_engine: "Backup-Tłumacz",
            backup_engine_warning: "Użyje Backup-Tłumacz",
            context_messagetranslateoption: "Przetłumacz wiadomość",
            context_messageuntranslateoption: "Nieprzetłumacz wiadomość",
            context_translator: "Wyszukaj tłumaczenie",
            detect_language: "Wykryj język",
            error_dailylimit: "Osiągnięto dzienny limit żądań.",
            error_hourlylimit: "Osiągnięto godzinowy limit żądań.",
            error_keyoutdated: "Klucz API jest nieaktualny.",
            error_monthlylimit: "Osiągnięto miesięczny limit żądań.",
            error_serverdown: "Serwer tłumaczeń może być w trybie offline.",
            exception_text: "Słowa zaczynające się od {{var0}} będą ignorowane",
            general_sendOriginalMessage: "Wysyła również oryginalną wiadomość podczas tłumaczenia wysłanej wiadomości",
            general_showOriginalMessage: "Pokazuje również oryginalną wiadomość podczas tłumaczenia otrzymanej wiadomości",
            language_choice_input_received: "Język wprowadzania w odebranych wiadomościach",
            language_choice_input_sent: "Język wprowadzania w wysyłanych wiadomościach",
            language_choice_output_received: "Język wyjściowy w odebranych wiadomościach",
            language_choice_output_sent: "Język wyjściowy w wysłanych wiadomościach",
            language_selection_channel: "Wybór języka zostanie zmieniony specjalnie dla tego kanału",
            language_selection_global: "Wybór języka zostanie zmieniony dla wszystkich serwerów",
            language_selection_server: "Wybór języka zostanie zmieniony specjalnie dla tego serwera",
            popout_translateoption: "Tłumaczyć",
            popout_untranslateoption: "Nie przetłumacz",
            prefixes_disable_text: "Słowa zaczynające się od {{var0}} będą ignorowane",
            prefixes_enable_text: "Słowa, które aktywują tłumaczenie na określony język (np. $fr, $de, $jp)",
            toast_translating: "Tłumaczenie",
            toast_translating_failed: "Nie udało się przetłumaczyć",
            toast_translating_tryanother: "Wypróbuj innego tłumacza",
            translate_your_message: "Przetłumacz swoje wiadomości przed wysłaniem",
            translated_watermark: "przetłumaczony",
            translator_engine: "Tłumacz"
          };
        case "pt-BR":
          return {
            backup_engine: "Backup-Tradutor",
            backup_engine_warning: "Usará o Backup-Tradutor",
            context_messagetranslateoption: "Traduzir mensagem",
            context_messageuntranslateoption: "Mensagem não traduzida",
            context_translator: "Tradução de pesquisa",
            detect_language: "Detectar idioma",
            error_dailylimit: "Limite de solicitações diárias atingido.",
            error_hourlylimit: "Limite de solicitação por hora atingido.",
            error_keyoutdated: "Chave de API desatualizada.",
            error_monthlylimit: "Limite de solicitação mensal atingido.",
            error_serverdown: "O servidor de tradução pode estar offline.",
            exception_text: "Palavras que começam com {{var0}} serão ignoradas",
            general_sendOriginalMessage: "Também envia a Mensagem original ao traduzir sua Mensagem enviada",
            general_showOriginalMessage: "Também mostra a Mensagem original ao traduzir uma Mensagem recebida",
            language_choice_input_received: "Idioma de entrada nas mensagens recebidas",
            language_choice_input_sent: "Idioma de entrada em suas mensagens enviadas",
            language_choice_output_received: "Idioma de saída nas mensagens recebidas",
            language_choice_output_sent: "Idioma de saída em suas mensagens enviadas",
            language_selection_channel: "A seleção de idioma será alterada especificamente para este canal",
            language_selection_global: "A seleção de idioma será alterada para todos os servidores",
            language_selection_server: "A seleção de idioma será alterada especificamente para este servidor",
            popout_translateoption: "Traduzir",
            popout_untranslateoption: "Não traduzido",
            prefixes_disable_text: "Prefixos que desativam a tradução da mensagem",
            prefixes_enable_text: "Prefixos que permitem a tradução com linguagem específica (por exemplo, $fr, $de, $jp)",
            toast_translating: "Traduzindo",
            toast_translating_failed: "Falha ao traduzir",
            toast_translating_tryanother: "Tente outro tradutor",
            translate_your_message: "Traduza suas mensagens antes de enviar",
            translated_watermark: "traduzido",
            translator_engine: "Tradutor"
          };
        case "ro":
          return {
            backup_engine: "Backup-Traducător",
            backup_engine_warning: "Va folosi Backup-Traducător",
            context_messagetranslateoption: "Traduceți mesajul",
            context_messageuntranslateoption: "Untraduceți mesajul",
            context_translator: "Căutare traducere",
            detect_language: "Detecteaza limba",
            error_dailylimit: "Limita zilnică de solicitare a fost atinsă.",
            error_hourlylimit: "Limita orară de solicitare a fost atinsă.",
            error_keyoutdated: "API-Key este învechită.",
            error_monthlylimit: "Limita lunară de solicitare a fost atinsă.",
            error_serverdown: "Serverul de traducere ar putea fi offline.",
            exception_text: "Cuvintele care încep cu {{var0}} vor fi ignorate",
            general_sendOriginalMessage: "De asemenea, trimite mesajul original atunci când traduceți mesajul trimis",
            general_showOriginalMessage: "Afișează, de asemenea, mesajul original atunci când traduceți un mesaj primit",
            language_choice_input_received: "Limba de intrare în mesajele primite",
            language_choice_input_sent: "Introduceți limba în mesajele trimise",
            language_choice_output_received: "Limba de ieșire în mesajele primite",
            language_choice_output_sent: "Limba de ieșire în mesajele trimise",
            language_selection_channel: "Selectarea limbii va fi modificată special pentru acest canal",
            language_selection_global: "Selectarea limbii va fi modificată pentru toate serverele",
            language_selection_server: "Selectarea limbii va fi modificată special pentru acest Server",
            popout_translateoption: "Traduceți",
            popout_untranslateoption: "Netradus",
            prefixes_disable_text: "Prefixele care dezactivează traducerea mesajului",
            prefixes_enable_text: "Prefixele care permit traducerea cu un limbaj specific (de exemplu, $fr, $de, $jp)",
            toast_translating: "Traducere",
            toast_translating_failed: "Nu s-a putut traduce",
            toast_translating_tryanother: "Încercați un alt traducător",
            translate_your_message: "Traduceți mesajele înainte de a le trimite",
            translated_watermark: "tradus",
            translator_engine: "Traducător"
          };
        case "ru":
          return {
            backup_engine: "Резервный-Переводчик",
            backup_engine_warning: "Буду использовать Резервный-Переводчик",
            context_messagetranslateoption: "Перевести сообщение",
            context_messageuntranslateoption: "Непереведенное сообщение",
            context_translator: "Искать перевод",
            detect_language: "Определить язык",
            error_dailylimit: "Достигнут дневной лимит запросов.",
            error_hourlylimit: "Достигнут лимит почасовых запросов.",
            error_keyoutdated: "API-ключ устарел.",
            error_monthlylimit: "Достигнут месячный лимит запросов.",
            error_serverdown: "Сервер переводов может быть отключен.",
            exception_text: "Слова, начинающиеся с {{var0}}, будут игнорироваться.",
            general_sendOriginalMessage: "Также отправляет исходное сообщение при переводе отправленного сообщения.",
            general_showOriginalMessage: "Также показывает исходное сообщение при переводе полученного сообщения.",
            language_choice_input_received: "Язык ввода в полученных сообщениях",
            language_choice_input_sent: "Язык ввода в ваших отправленных сообщениях",
            language_choice_output_received: "Язык вывода в полученных сообщениях",
            language_choice_output_sent: "Язык вывода в ваших отправленных сообщениях",
            language_selection_channel: "Выбор языка будет изменен специально для этого канала.",
            language_selection_global: "Выбор языка будет изменен для всех серверов.",
            language_selection_server: "Выбор языка будет изменен специально для этого сервера",
            popout_translateoption: "Переведите",
            popout_untranslateoption: "Неперевести",
            prefixes_disable_text: "Префиксы, которые отключают перевод сообщения",
            prefixes_enable_text: "Префиксы, которые обеспечивают перевод с конкретным языком (например, $fr, $de, $jp)",
            toast_translating: "Идет перевод",
            toast_translating_failed: "Не удалось перевести",
            toast_translating_tryanother: "Попробуйте другой переводчик",
            translate_your_message: "Переводите свои сообщения перед отправкой",
            translated_watermark: "переведено",
            translator_engine: "Переводчик"
          };
        case "sv":
          return {
            backup_engine: "Backup-Översättare",
            backup_engine_warning: "Kommer att använda Backup-Översättare",
            context_messagetranslateoption: "Översätt meddelande",
            context_messageuntranslateoption: "Untranslate meddelande",
            context_translator: "Sök översättning",
            detect_language: "Upptäck språk",
            error_dailylimit: "Daglig förfrågningsgräns nådd.",
            error_hourlylimit: "Begäran per timme nådd.",
            error_keyoutdated: "API-nyckel föråldrad.",
            error_monthlylimit: "Gränsen för månatlig begäran har nåtts.",
            error_serverdown: "Översättningsservern kan vara offline.",
            exception_text: "Ord som börjar med {{var0}} kommer att ignoreras",
            general_sendOriginalMessage: "Skickar också det ursprungliga meddelandet när du översätter ditt skickade meddelande",
            general_showOriginalMessage: "Visar även det ursprungliga meddelandet när ett mottaget meddelande översätts",
            language_choice_input_received: "Inmatningsspråk i mottagna meddelanden",
            language_choice_input_sent: "Inmatningsspråk i dina skickade meddelanden",
            language_choice_output_received: "Utmatningsspråk i mottagna meddelanden",
            language_choice_output_sent: "Utmatningsspråk i dina skickade meddelanden",
            language_selection_channel: "Språkval kommer att ändras specifikt för denna kanal",
            language_selection_global: "Språkval kommer att ändras för alla servrar",
            language_selection_server: "Språkval kommer att ändras specifikt för denna server",
            popout_translateoption: "Översätt",
            popout_untranslateoption: "Untranslate",
            prefixes_disable_text: "Prefix som inaktiverar översättning av meddelandet",
            prefixes_enable_text: "Prefix som möjliggör översättning med specifikt språk (t.ex. $fr, $de, $jp)",
            toast_translating: "Översätter",
            toast_translating_failed: "Det gick inte att översätta",
            toast_translating_tryanother: "Prova en annan översättare",
            translate_your_message: "Översätt dina meddelanden innan du skickar",
            translated_watermark: "översatt",
            translator_engine: "Översättare"
          };
        case "th":
          return {
            backup_engine: "สำรอง-นักแปล",
            backup_engine_warning: "จะใช้การสำรองข้อมูล-นักแปล",
            context_messagetranslateoption: "แปลข้อความ",
            context_messageuntranslateoption: "ยกเลิกการแปลข้อความ",
            context_translator: "ค้นหาคำแปล",
            detect_language: "ตรวจจับภาษา",
            error_dailylimit: "ถึงขีดจำกัดคำขอรายวันแล้ว",
            error_hourlylimit: "ถึงขีดจำกัดคำขอรายชั่วโมงแล้ว",
            error_keyoutdated: "API-Key ล้าสมัยแล้ว",
            error_monthlylimit: "ถึงขีดจำกัดคำขอรายเดือนแล้ว",
            error_serverdown: "เซิร์ฟเวอร์การแปลอาจออฟไลน์อยู่",
            exception_text: "คำที่ขึ้นต้นด้วย {{var0}} จะถูกละเว้น",
            general_sendOriginalMessage: "ส่งข้อความต้นฉบับเมื่อแปลข้อความที่ส่งของคุณ",
            general_showOriginalMessage: "ยังแสดงข้อความต้นฉบับเมื่อแปลข้อความที่ได้รับ",
            language_choice_input_received: "ป้อนภาษาในข้อความที่ได้รับ",
            language_choice_input_sent: "ป้อนภาษาในข้อความที่คุณส่ง",
            language_choice_output_received: "ภาษาเอาต์พุตในข้อความที่ได้รับ",
            language_choice_output_sent: "ภาษาที่ส่งออกในข้อความที่ส่งของคุณ",
            language_selection_channel: "การเลือกภาษาจะมีการเปลี่ยนแปลงเฉพาะสำหรับช่องนี้",
            language_selection_global: "การเลือกภาษาจะมีการเปลี่ยนแปลงสำหรับเซิร์ฟเวอร์ทั้งหมด",
            language_selection_server: "การเลือกภาษาจะมีการเปลี่ยนแปลงโดยเฉพาะสำหรับเซิร์ฟเวอร์นี้",
            popout_translateoption: "แปลภาษา",
            popout_untranslateoption: "ไม่แปล",
            prefixes_disable_text: "คำนำหน้าการปิดใช้งานการแปลข้อความ",
            prefixes_enable_text: "คำนำหน้าที่เปิดใช้งานการแปลด้วยภาษาที่เฉพาะเจาะจง (เช่น $fr, $de, $jp)",
            toast_translating: "กำลังแปล",
            toast_translating_failed: "แปลไม่สำเร็จ",
            toast_translating_tryanother: "ลองใช้นักแปลคนอื่น",
            translate_your_message: "แปลข้อความของคุณก่อนส่ง",
            translated_watermark: "แปล",
            translator_engine: "นักแปล"
          };
        case "tr":
          return {
            backup_engine: "Yedekleme-Çevirmen",
            backup_engine_warning: "Yedekleme-Çevirmen kullanacak",
            context_messagetranslateoption: "Mesajı Çevir",
            context_messageuntranslateoption: "Çeviriyi Kaldır Mesajı",
            context_translator: "Çeviri ara",
            detect_language: "Dili Algıla",
            error_dailylimit: "Günlük İstek Sınırına ulaşıldı.",
            error_hourlylimit: "Saatlik İstek Sınırına ulaşıldı.",
            error_keyoutdated: "API Anahtarı güncel değil.",
            error_monthlylimit: "Aylık İstek Sınırına ulaşıldı.",
            error_serverdown: "Çeviri Sunucusu çevrimdışı olabilir.",
            exception_text: "{{var0}} ile başlayan kelimeler yok sayılacak",
            general_sendOriginalMessage: "Gönderilen Mesajınızı çevirirken orijinal Mesajı da gönderir",
            general_showOriginalMessage: "Alınan bir Mesajı tercüme ederken orijinal Mesajı da gösterir.",
            language_choice_input_received: "Alınan Mesajlarda Giriş Dili",
            language_choice_input_sent: "Gönderilen Mesajlarınızda Dil Girin",
            language_choice_output_received: "Alınan Mesajlarda Çıktı Dili",
            language_choice_output_sent: "Gönderilen Mesajlarınızda Çıktı Dili",
            language_selection_channel: "Dil Seçimi bu Kanal için özel olarak değiştirilecektir.",
            language_selection_global: "Tüm Sunucular için Dil Seçimi değiştirilecek",
            language_selection_server: "Dil Seçimi bu Sunucuya özel olarak değiştirilecektir.",
            popout_translateoption: "Çevirmek",
            popout_untranslateoption: "Çevirmeyi kaldır",
            prefixes_disable_text: "Mesajın çevirisini devre dışı bırakan önekler",
            prefixes_enable_text: "Belirli bir dille çeviriyi etkinleştiren önekler (örn. $fr, $de, $jp)",
            toast_translating: "Çeviri",
            toast_translating_failed: "Tercüme edilemedi",
            toast_translating_tryanother: "Başka bir Çevirmen deneyin",
            translate_your_message: "Göndermeden önce Mesajlarınızı çevirin",
            translated_watermark: "tercüme",
            translator_engine: "Çevirmen"
          };
        case "uk":
          return {
            backup_engine: "Резервний-перекладач",
            backup_engine_warning: "Використовуватиме Резервний-Перекладач",
            context_messagetranslateoption: "Перекласти повідомлення",
            context_messageuntranslateoption: "Неперекладене повідомлення",
            context_translator: "Пошук перекладу",
            detect_language: "Визначити мову",
            error_dailylimit: "Денний ліміт запитів досягнуто.",
            error_hourlylimit: "Досягнуто погодинного ліміту запитів.",
            error_keyoutdated: "API-ключ застарів.",
            error_monthlylimit: "Досягнуто місячного ліміту запитів.",
            error_serverdown: "Сервер перекладу може бути офлайн.",
            exception_text: "Слова, що починаються з {{var0}}, ігноруватимуться",
            general_sendOriginalMessage: "Також надсилає оригінальне повідомлення під час перекладу вашого надісланого повідомлення",
            general_showOriginalMessage: "Також показує оригінальне повідомлення під час перекладу отриманого повідомлення",
            language_choice_input_received: "Мова введення в отриманих повідомленнях",
            language_choice_input_sent: "Мова введення у ваших надісланих повідомленнях",
            language_choice_output_received: "Мова виводу в отриманих повідомленнях",
            language_choice_output_sent: "Мова виведення у ваших надісланих повідомленнях",
            language_selection_channel: "Вибір мови буде змінено спеціально для цього каналу",
            language_selection_global: "Вибір мови буде змінено для всіх серверів",
            language_selection_server: "Вибір мови буде змінено спеціально для цього сервера",
            popout_translateoption: "Перекласти",
            popout_untranslateoption: "Неперекласти",
            prefixes_disable_text: "Префікси, що відключають переклад повідомлення",
            prefixes_enable_text: "Префікси, що дозволяють перекладати з конкретною мовою (наприклад, $fr, $de, $jp)",
            toast_translating: "Переклад",
            toast_translating_failed: "Не вдалося перекласти",
            toast_translating_tryanother: "Спробуйте іншого перекладача",
            translate_your_message: "Перекладіть свої повідомлення перед надсиланням",
            translated_watermark: "переклав",
            translator_engine: "Перекладач"
          };
        case "vi":
          return {
            backup_engine: "Backup-Gười phiên dịch",
            backup_engine_warning: "Sẽ sử dụng Backup-Gười phiên dịch",
            context_messagetranslateoption: "Dịch tin nhắn",
            context_messageuntranslateoption: "Thư chưa dịch",
            context_translator: "Tìm kiếm bản dịch",
            detect_language: "Phát hiện ngôn ngữ",
            error_dailylimit: "Đã đạt đến Giới hạn Yêu cầu Hàng ngày.",
            error_hourlylimit: "Đã đạt đến Giới hạn Yêu cầu Hàng giờ.",
            error_keyoutdated: "API-Key đã lỗi thời.",
            error_monthlylimit: "Đã đạt đến Giới hạn Yêu cầu Hàng tháng.",
            error_serverdown: "Máy chủ dịch có thể ngoại tuyến.",
            exception_text: "Các từ bắt đầu bằng {{var0}} sẽ bị bỏ qua",
            general_sendOriginalMessage: "Đồng thời gửi Tin nhắn gốc khi dịch Tin nhắn đã gửi của bạn",
            general_showOriginalMessage: "Đồng thời hiển thị Tin nhắn gốc khi dịch một Tin nhắn đã nhận",
            language_choice_input_received: "Nhập Ngôn ngữ trong Tin nhắn đã nhận",
            language_choice_input_sent: "Nhập Ngôn ngữ trong Tin nhắn đã gửi của bạn",
            language_choice_output_received: "Ngôn ngữ đầu ra trong Tin nhắn đã nhận",
            language_choice_output_sent: "Ngôn ngữ đầu ra trong Tin nhắn đã gửi của bạn",
            language_selection_channel: "Lựa chọn ngôn ngữ sẽ được thay đổi cụ thể cho Kênh này",
            language_selection_global: "Lựa chọn ngôn ngữ sẽ được thay đổi cho tất cả các Máy chủ",
            language_selection_server: "Lựa chọn ngôn ngữ sẽ được thay đổi cụ thể cho Máy chủ này",
            popout_translateoption: "Phiên dịch",
            popout_untranslateoption: "Chưa dịch",
            prefixes_disable_text: "Tiền tố vô hiệu hóa dịch tin nhắn",
            prefixes_enable_text: "Tiền tố cho phép dịch với ngôn ngữ cụ thể (ví dụ: $fr, $de, $jp)",
            toast_translating: "Phiên dịch",
            toast_translating_failed: "Không dịch được",
            toast_translating_tryanother: "Thử một Trình dịch khác",
            translate_your_message: "Dịch Tin nhắn của bạn trước khi gửi",
            translated_watermark: "đã dịch",
            translator_engine: "Người phiên dịch"
          };
        case "zh-CN":
          return {
            backup_engine: "备份翻译器",
            backup_engine_warning: "将使用备份翻译器",
            context_messagetranslateoption: "翻译消息",
            context_messageuntranslateoption: "取消翻译消息",
            context_translator: "搜索翻译",
            detect_language: "检测语言",
            error_dailylimit: "已达到每日请求限制。",
            error_hourlylimit: "已达到每小时请求限制。",
            error_keyoutdated: "API 密钥已过时。",
            error_monthlylimit: "已达到每月请求限制。",
            error_serverdown: "翻译服务器可能离线。",
            exception_text: "以 {{var0}} 开头的单词将被忽略",
            general_sendOriginalMessage: "翻译您发送的消息时也会发送原始消息",
            general_showOriginalMessage: "翻译收到的消息时还显示原始消息",
            language_choice_input_received: "收到消息中的输入语言",
            language_choice_input_sent: "在您发送的消息中输入语言",
            language_choice_output_received: "接收消息中的输出语言",
            language_choice_output_sent: "您发送的消息中的输出语言",
            language_selection_channel: "将专门为此频道更改语言选择",
            language_selection_global: "将更改所有服务器的语言选择",
            language_selection_server: "语言选择将专门为此服务器更改",
            popout_translateoption: "翻译",
            popout_untranslateoption: "取消翻译",
            prefixes_disable_text: "禁用消息翻译的前缀",
            prefixes_enable_text: "用特定语言启用翻译的前缀（例如 $fr, $de, $jp）",
            toast_translating: "正在翻译",
            toast_translating_failed: "翻译失败",
            toast_translating_tryanother: "尝试其它翻译器",
            translate_your_message: "发送前翻译您的消息",
            translated_watermark: "已翻译",
            translator_engine: "译者"
          };
        case "zh-TW":
          return {
            backup_engine: "備份翻譯器",
            backup_engine_warning: "將使用備份翻譯器",
            context_messagetranslateoption: "翻譯訊息",
            context_messageuntranslateoption: "取消翻譯訊息",
            context_translator: "搜尋翻譯",
            detect_language: "檢測語言",
            error_dailylimit: "已達到每日請求限制。",
            error_hourlylimit: "已達到每小時請求限制。",
            error_keyoutdated: "API 密鑰已過時。",
            error_monthlylimit: "已達到每月請求限制。",
            error_serverdown: "翻譯服務器可能離線。",
            exception_text: "以 {{var0}} 開頭的單詞將被忽略",
            general_sendOriginalMessage: "翻譯您發送的消息時也會發送原始消息",
            general_showOriginalMessage: "翻譯收到的消息時還顯示原始消息",
            language_choice_input_received: "收到消息中的輸入語言",
            language_choice_input_sent: "在您發送的消息中輸入語言",
            language_choice_output_received: "接收消息中的輸出語言",
            language_choice_output_sent: "您發送的消息中的輸出語言",
            language_selection_channel: "將專門為此頻道更改語言選擇",
            language_selection_global: "將更改所有服務器的語言選擇",
            language_selection_server: "語言選擇將專門為此服務器更改",
            popout_translateoption: "翻譯",
            popout_untranslateoption: "取消翻譯",
            prefixes_disable_text: "禁用消息翻译的前缀",
            prefixes_enable_text: "用特定语言启用翻译的前缀（例如 $fr, $de, $jp）",
            toast_translating: "正在翻譯",
            toast_translating_failed: "無法翻譯",
            toast_translating_tryanother: "嘗試其它翻譯器",
            translate_your_message: "發送前翻譯您的消息",
            translated_watermark: "已翻譯",
            translator_engine: "譯者"
          };
        default:
          return {
            backup_engine: "Backup-Translator",
            backup_engine_warning: "Will use Backup-Translator",
            context_messagetranslateoption: "Translate Message",
            context_messageuntranslateoption: "Untranslate Message",
            context_translator: "Search Translation",
            detect_language: "Detect Language",
            error_dailylimit: "Daily Request Limit reached.",
            error_hourlylimit: "Hourly Request Limit reached.",
            error_keyoutdated: "API-Key outdated.",
            error_monthlylimit: "Monthly Request Limit reached.",
            error_serverdown: "Translation Server might be offline.",
            exception_text: "Words starting with {{var0}} will be ignored",
            general_sendOriginalMessage: "Also sends the original Message when translating your sent Message",
            general_showOriginalMessage: "Also shows the original Message when translating a received Message",
            language_choice_input_received: "Input Language in received Messages",
            language_choice_input_sent: "Input Language in your sent Messages",
            language_choice_output_received: "Output Language in received Messages",
            language_choice_output_sent: "Output Language in your sent Messages",
            language_selection_channel: "Language Selection will be changed specifically for this Channel",
            language_selection_global: "Language Selection will be changed for all Servers",
            language_selection_server: "Language Selection will be changed specifically for this Server",
            popout_translateoption: "Translate",
            popout_untranslateoption: "Untranslate",
            prefixes_disable_text: "Prefixes that disable translation of message",
            prefixes_enable_text: "Prefixes that enable translation with specific language (e.g. $fr, $de, $jp)",
            toast_translating: "Translating",
            toast_translating_failed: "Failed to translate",
            toast_translating_tryanother: "Try another Translator",
            translate_your_message: "Translate your Messages before sending",
            translated_watermark: "translated",
            translator_engine: "Translator"
          };
      }
    }
    __name(getLabelsForUiLanguage, "getLabelsForUiLanguage");
    module2.exports = { getLabelsForUiLanguage };
  }
});

// src/i18n/text.js
var require_text = __commonJS({
  "src/i18n/text.js"(exports2, module2) {
    function getCustomTextValue(key, isChinese, isRussian) {
      let texts = isChinese ? {
        auth_keys_title: "自定义密钥",
        custom_section_title: "自定义",
        api_key_label: "API 密钥：",
        api_endpoint_label: "接口地址：",
        model_id_label: "模型名：",
        paid_version_label: "付费版",
        microsoft_region_label: "地区：",
        section_service_title: "翻译服务",
        section_service_hint: "先选服务商，再填写对应参数。Google 默认可直接用；如果你想用正式接口，推荐选 Azure Translator 或 Google Cloud Translation。",
        primary_engine_title: "主服务商",
        backup_engine_title: "备用服务（可选）",
        backup_engine_select_title: "备用服务商",
        backup_engine_hint: "主服务失败时，才会尝试备用服务。",
        backup_engine_none: "不使用备用服务",
        backup_engine_none_hint: "当前未启用备用服务。",
        google_default_hint: "当前使用 Google 默认模式，不需要填写 API、接口地址或模型名。",
        engine_unknown_hint: "当前服务商的设置项暂时无法显示。",
        engine_no_extra_fields: "当前服务商没有额外的可填写参数。",
        other_service_title: "其他服务商密钥（高级，可不填）",
        other_service_hint: "这里保留兼容功能，只有你以后想切换到这些服务商时才需要填写。",
        section_language_title: "语言设置",
        section_language_hint: "这里是默认语言规则。发送前翻译会优先按这里的设置处理。",
        sent_input_title: "发送消息的源语言",
        sent_output_title: "发送消息的目标语言",
        received_input_title: "收到消息的源语言",
        received_output_title: "收到消息的目标语言",
        source_filter_title: "发送前只翻这些源语言",
        source_filter_hint: "不添加任何语言时，不限制源语言；添加后，只翻译检测为这些语言的发送内容。",
        source_filter_empty_state: "当前未限制发送消息源语言。",
        source_filter_add: "+ 添加源语言",
        section_display_title: "显示与交互",
        section_display_hint: "这里控制按钮显示方式，以及原文和译文的展示规则。这里的剧透模式就是 Discord 原生 spoiler，也就是刮刮乐遮盖效果。",
        section_advanced_title: "高级功能",
        prefix_section_title: "快捷前缀",
        disable_prefix_title: "跳过翻译前缀",
        disable_prefix_hint: "输入以这些前缀开头的消息时，将直接发送原文，不走翻译。",
        disable_prefix_placeholder: "新增禁用前缀（例如 !）",
        translate_prefix_title: "指定目标语言前缀",
        translate_prefix_hint: "例如输入 $fr hello，会把 hello 翻成法语后再发送。",
        translate_prefix_placeholder: "前缀（例如 $fr）",
        add_prefix_button: "+ 添加新前缀",
        validate_button_label: "验证当前配置",
        validate_hint: "会发送一次最小在线请求，用来检查 API Key、接口地址和模型是否可用。",
        validate_running: "正在验证",
        validate_success: "验证成功",
        validate_failed: "验证失败",
        validate_saved_endpoint: "已自动修正并保存接口地址",
        validate_missing_key: "请先填写 API Key。",
        validate_missing_model: "请先填写模型名。",
        validate_missing_endpoint: "请先填写接口地址。",
        support_panel_validate_title: "连接测试",
        support_panel_links_title: "帮助与开通",
        model_detect_button: "检测模型",
        model_fetch_button: "获取模型列表",
        model_fetch_loading: "正在获取模型列表…",
        model_catalog_title: "已获取模型列表",
        model_catalog_loaded: "已获取 {count} 个模型，选择后会自动填回上面的模型输入框。",
        model_catalog_empty: "没有获取到可用模型。"
      } : {
        auth_keys_title: "Own Auth Keys",
        custom_section_title: "Custom",
        api_key_label: "API Key:",
        api_endpoint_label: "API Endpoint:",
        model_id_label: "Model ID:",
        paid_version_label: "Paid Version",
        microsoft_region_label: "Region:",
        section_service_title: "Translation Provider",
        section_service_hint: "Choose a provider first, then fill in only the fields that provider needs. For official paid APIs, Azure Translator and Google Cloud Translation are recommended.",
        primary_engine_title: "Primary Provider",
        backup_engine_title: "Backup Provider (Optional)",
        backup_engine_select_title: "Backup Provider",
        backup_engine_hint: "The backup provider is used only when the primary one fails.",
        backup_engine_none: "No Backup Provider",
        backup_engine_none_hint: "No backup provider is enabled right now.",
        google_default_hint: "Google default mode does not require your own API key, endpoint, or model.",
        engine_unknown_hint: "This provider does not have a visible settings form right now.",
        engine_no_extra_fields: "This provider has no extra editable fields.",
        other_service_title: "Other Provider Keys (Advanced)",
        other_service_hint: "These are kept for compatibility and only matter if you switch to them later.",
        section_language_title: "Language Rules",
        section_language_hint: "These are the default language rules used for sending and receiving messages.",
        sent_input_title: "Source language for sent messages",
        sent_output_title: "Target language for sent messages",
        received_input_title: "Source language for received messages",
        received_output_title: "Target language for received messages",
        source_filter_title: "Outgoing source languages for auto-translate",
        source_filter_hint: "If you do not add any languages here, outgoing source languages are not restricted. After adding languages, only detected outgoing content in those languages is translated.",
        source_filter_empty_state: "Outgoing source languages are currently unrestricted.",
        source_filter_add: "+ Add source language",
        section_display_title: "Display and Interaction",
        section_display_hint: "Control button visibility and how original text is shown together with translations. Spoiler mode here is the same Discord scratch-off effect.",
        section_advanced_title: "Advanced Features",
        prefix_section_title: "Prefix Rules",
        disable_prefix_title: "Skip-translation prefixes",
        disable_prefix_hint: "Messages that start with these prefixes are sent without translation.",
        disable_prefix_placeholder: "New exception prefix (e.g. !)",
        translate_prefix_title: "Forced target-language prefixes",
        translate_prefix_hint: "For example, `$fr hello` translates `hello` into French before sending.",
        translate_prefix_placeholder: "Prefix (e.g. $fr)",
        add_prefix_button: "+ Add new prefix",
        validate_button_label: "Validate Current Config",
        validate_hint: "This sends one minimal live request to verify that the API key, endpoint, and model are usable.",
        validate_running: "Validating",
        validate_success: "Validation succeeded",
        validate_failed: "Validation failed",
        validate_saved_endpoint: "Endpoint was normalized and saved automatically",
        validate_missing_key: "Please enter an API key first.",
        validate_missing_model: "Please enter a model ID first.",
        validate_missing_endpoint: "Please enter an API endpoint first.",
        support_panel_validate_title: "Connection Test",
        support_panel_links_title: "Help and Setup",
        model_detect_button: "Check Model",
        model_fetch_button: "Fetch Models",
        model_fetch_loading: "Loading model list…",
        model_catalog_title: "Fetched Models",
        model_catalog_loaded: "{count} models loaded. Selecting one will fill the model field above.",
        model_catalog_empty: "No models were returned."
      };
      return Object.assign(texts, isChinese ? {
        protected_terms_title: "保护词 / 保护短语",
        protected_terms_hint: "填入不希望被翻译的固定名词或短语，例如项目名、模型名、品牌名或团队名。翻译前会先保护它们，翻译后再原样放回。",
        protected_terms_placeholder: "新增保护词或短语",
        protected_terms_scope_sent: "保护我发送的消息",
        protected_terms_scope_received: "保护收到的消息",
        channel_auto_translate_label: "当前频道收到消息自动翻译",
        channel_auto_translate_on: "当前频道收到消息自动翻译已开启",
        channel_auto_translate_off: "在设置中单独开启当前频道收到消息自动翻译",
        language_detector_title: "语言识别助手",
        language_detector_hint: "把频道里的陌生文本粘贴到这里，插件会识别语言，并可一键填入“您发送的消息中的输出语言”。",
        language_detector_placeholder: "粘贴一小段待识别文本",
        language_detector_button: "识别",
        language_detector_button_loading: "识别中",
        language_detector_empty: "请先粘贴要识别的文本。",
        language_detector_failed: "暂时无法识别这段文本，请换一段更长或更典型的内容再试。",
        language_detector_detected: "识别结果",
        language_detector_apply_received: "填入收到消息源语言",
        language_detector_apply_sent: "填入发送消息输入语言"
      } : {
        protected_terms_title: "Protected Terms / Phrases",
        protected_terms_hint: "Add names or phrases that must stay unchanged, such as project names, model names, brand names, or team names. They will be protected before translation and restored afterward.",
        protected_terms_placeholder: "Add protected term or phrase",
        protected_terms_scope_sent: "Protect sent messages",
        protected_terms_scope_received: "Protect received messages",
        channel_auto_translate_label: "Incoming auto-translate for this channel",
        channel_auto_translate_on: "Incoming auto-translate is enabled for this channel",
        channel_auto_translate_off: "Enable incoming auto-translate separately in settings",
        language_detector_title: "Language Detection Helper",
        language_detector_hint: "Paste a short sample here. The plugin will detect the language and apply it to the sent-message output language.",
        language_detector_placeholder: "Paste text to detect",
        language_detector_button: "Detect",
        language_detector_button_loading: "Detecting",
        language_detector_empty: "Please paste some text to detect first.",
        language_detector_failed: "Could not detect the language from that text. Try a longer or more representative sample.",
        language_detector_detected: "Detected language",
        language_detector_apply_received: "Use for received-source language",
        language_detector_apply_sent: "Use for sent-input language"
      }), Object.assign(texts, isChinese ? {
        language_detector_apply_sent_output: "填入发送消息输出语言",
        context_detect_message_language: "识别这条消息的语言",
        context_reply_in_detected_language: "以该语言回复",
        detect_message_empty: "这条消息没有可识别的文本内容。",
        detect_message_failed: "暂时无法识别这条消息的语言。",
        detect_message_success: "识别到",
        reply_language_applied: "已将当前频道的发送目标语言切换为",
        reply_language_hint: "保持当前频道翻译开启后，直接用你的语言回复即可。",
        translated_label: "译文"
      } : {
        language_detector_apply_sent_output: "Use for sent output language",
        context_detect_message_language: "Detect this message language",
        context_reply_in_detected_language: "Reply in this language",
        detect_message_empty: "This message has no text content to detect.",
        detect_message_failed: "Could not detect the language of this message.",
        detect_message_success: "Detected",
        reply_language_applied: "Sent target language for this channel was switched to",
        reply_language_hint: "Keep translation enabled for this channel, then reply in your own language.",
        translated_label: "Translated"
      }), Object.assign(texts, isChinese ? {
        wrapper_pairs_title: "自动保护包裹符规则",
        wrapper_pairs_hint: '按“左包裹符|右包裹符”的格式添加规则，例如 "|"、“|” 、`|`、【|】、「|」。被这些符号包起来的内容会自动跳过翻译，并在译文里高亮显示。',
        wrapper_pairs_placeholder: "例如 【|】 或 `|`",
        wrapper_pairs_scope_sent: "保护我发送的消息",
        wrapper_pairs_scope_received: "保护收到的消息"
      } : {
        wrapper_pairs_title: "Protected Wrapper Rules",
        wrapper_pairs_hint: 'Add rules in the format left|right, for example "|", “|”, `|`, 【|】, or 「|」. Text wrapped by these symbols will be skipped during translation and highlighted in the translated result.',
        wrapper_pairs_placeholder: "For example 【|】 or `|`",
        wrapper_pairs_scope_sent: "Protect sent messages",
        wrapper_pairs_scope_received: "Protect received messages"
      }), Object.assign(texts, isChinese ? {
        wrapper_pairs_title: "自动保护包裹符规则",
        wrapper_pairs_hint: '按“左包裹符|右包裹符”的格式添加规则，例如 "|"、“|” 、`|`、【|】、「|」。被这些符号包起来的内容会自动跳过翻译，并在译文里高亮显示。',
        wrapper_pairs_placeholder: "例如 【|】 或 `|`"
      } : {
        wrapper_pairs_title: "Protected Wrapper Rules",
        wrapper_pairs_hint: 'Add rules in the format left|right, for example "|", “|”, `|`, 【|】, or 「|」. Text wrapped by these symbols will be skipped during translation and highlighted in the translated result.',
        wrapper_pairs_placeholder: "For example 【|】 or `|`"
      }), Object.assign(texts, isChinese ? {
        received_auto_translate_title: "收到消息自动翻译",
        received_auto_translate_hint: "设置哪些收到的消息自动翻译。",
        received_auto_translate_preset_title: "自动翻译策略",
        received_auto_translate_preset_loose: "宽松",
        received_auto_translate_preset_balanced: "平衡",
        received_auto_translate_preset_strict: "严格",
        received_auto_translate_preset_custom: "自定义",
        received_source_filter_title: "收到消息源语言过滤",
        received_source_filter_hint: "不添加任何语言时，收到的任何源语言都可以自动翻译；添加后，只自动翻译检测为这些语言的收到消息。",
        received_source_filter_empty_state: "当前未限制收到消息源语言。",
        received_source_filter_add: "+ 添加收到消息源语言",
        auto_translate_decision_title: "自动翻译判断方式",
        auto_translate_decision_hint: "基础规则适用于所有服务商；AI 智能判断仅 AI 服务商可用，判断与翻译合并为一次请求。保护词会先本地保护，不参与改写。",
        auto_translate_decision_basic: "基础规则",
        auto_translate_decision_ai: "AI 智能判断",
        auto_translate_decision_ai_disabled: "AI 智能判断（当前服务商不支持）",
        auto_translate_ai_prompt_hint: "下面是默认 AI 判断提示词，可直接修改；{{INPUT_LANGUAGE}} / {{OUTPUT_LANGUAGE}} 会自动替换为当前语言设置，⟦0⟧ 这类占位符会在翻译后恢复。",
        auto_translate_ai_prompt_reset: "恢复默认判断提示词",
        skip_mixed_received_label: "跳过混合语言消息",
        skip_same_language_received_label: "跳过与目标语言相同的消息",
        treat_language_variants_label: "将地区/方言变体视为同一种语言",
        drop_similar_translations_label: "丢弃与原文高度相似的译文",
        minimum_auto_translate_length_title: "自动翻译最小文本长度",
        translation_similarity_threshold_title: "译文相似度过滤阈值",
        plugin_language_title: "插件界面语言",
        plugin_language_hint: "可跟随 Discord，也可单独固定插件界面语言。",
        translated_text_color_title: "译文模块颜色",
        translated_text_color_hint: "直接点击色板切换颜色。点击右侧 + 号后，可手动填写颜色代码并保存。",
        translated_text_color_save_button: "保存",
        translated_text_color_invalid: "颜色代码无效，请填写有效的 HEX 或 CSS 颜色。"
      } : {
        received_auto_translate_title: "Incoming Auto-Translate",
        received_auto_translate_hint: "Choose which incoming messages are auto-translated.",
        received_auto_translate_preset_title: "Auto-translate preset",
        received_auto_translate_preset_loose: "Loose",
        received_auto_translate_preset_balanced: "Balanced",
        received_auto_translate_preset_strict: "Strict",
        received_auto_translate_preset_custom: "Custom",
        received_source_filter_title: "Incoming source language filter",
        received_source_filter_hint: "If you do not add any languages here, incoming source languages are not restricted. After adding languages, only detected incoming messages in those languages are auto-translated.",
        received_source_filter_empty_state: "Incoming source languages are currently unrestricted.",
        received_source_filter_add: "+ Add incoming source language",
        auto_translate_decision_title: "Auto-translate decision mode",
        auto_translate_decision_hint: "Basic rules work with every provider. AI smart decision is only available for AI providers and is merged into the translation request. Protected terms are protected locally first.",
        auto_translate_decision_basic: "Basic rules",
        auto_translate_decision_ai: "AI smart decision",
        auto_translate_decision_ai_disabled: "AI smart decision (unsupported provider)",
        auto_translate_ai_prompt_hint: "Default AI decision prompt. You can edit it directly. {{INPUT_LANGUAGE}} / {{OUTPUT_LANGUAGE}} are replaced with the current language settings, and placeholders like ⟦DTA0⟧ are restored after translation.",
        auto_translate_ai_prompt_reset: "Restore default decision prompt",
        skip_mixed_received_label: "Skip mixed-language messages",
        skip_same_language_received_label: "Skip messages already in the target language",
        treat_language_variants_label: "Treat regional variants as the same language",
        drop_similar_translations_label: "Drop nearly identical translations",
        minimum_auto_translate_length_title: "Minimum text length for auto-translate",
        translation_similarity_threshold_title: "Translation similarity threshold",
        plugin_language_title: "Plugin UI Language",
        plugin_language_hint: "You can follow Discord or pin the plugin UI to its own language.",
        translated_text_color_title: "Translated text color",
        translated_text_color_hint: "Click a swatch to switch colors. Use the + button to enter and save a custom color code.",
        translated_text_color_save_button: "Save",
        translated_text_color_invalid: "Invalid color code. Please enter a valid HEX or CSS color."
      }), Object.assign(texts, isChinese ? {
        received_auto_translate_title: "收到消息自动翻译策略",
        received_auto_translate_hint: "设置收到消息后的自动翻译规则。",
        received_auto_translate_preset_loose: "多翻一点",
        received_auto_translate_preset_balanced: "推荐",
        received_auto_translate_preset_strict: "少翻一点",
        received_auto_translate_preset_custom: "自定义",
        received_auto_translate_profile_loose_title: "多翻一点",
        received_auto_translate_profile_loose_desc: "更积极地自动翻译，适合多语频道，可能会多翻一些短句或混合内容。",
        received_auto_translate_profile_balanced_title: "推荐",
        received_auto_translate_profile_balanced_desc: "在准确率和覆盖率之间做平衡，适合大多数日常聊天频道。",
        received_auto_translate_profile_strict_title: "少翻一点",
        received_auto_translate_profile_strict_desc: "更谨慎，尽量避免误翻，适合已经有较多中文或双语内容的频道。",
        received_auto_translate_profile_custom_title: "自定义",
        received_auto_translate_profile_custom_desc: "你可以自己决定哪些消息跳过，哪些消息继续自动翻译。",
        received_auto_translate_advanced_title: "高级规则",
        received_auto_translate_advanced_locked: "当前正在使用预设模式。普通用户不需要改下面这些细项；如果你想手动调整，请切换到“自定义”。",
        skip_mixed_received_label: "跳过中英混合或多语言混合的消息",
        skip_same_language_received_label: "跳过本来就已经是目标语言的消息",
        treat_language_variants_label: "把地区变体当成同一种语言",
        drop_similar_translations_label: "如果译文和原文几乎一样，就不显示",
        minimum_auto_translate_length_title: "最短多少字才自动翻译",
        translation_similarity_threshold_title: "多像才算“几乎没变”"
      } : {
        received_auto_translate_title: "Incoming Auto-Translate Rules",
        received_auto_translate_hint: "Set the auto-translate rules for incoming messages.",
        received_auto_translate_preset_loose: "Translate More",
        received_auto_translate_preset_balanced: "Recommended",
        received_auto_translate_preset_strict: "Translate Less",
        received_auto_translate_preset_custom: "Custom",
        received_auto_translate_profile_loose_title: "Translate More",
        received_auto_translate_profile_loose_desc: "More aggressive auto-translation for multilingual channels. It may translate more short or mixed messages.",
        received_auto_translate_profile_balanced_title: "Recommended",
        received_auto_translate_profile_balanced_desc: "Balanced for most channels. Good default between coverage and accuracy.",
        received_auto_translate_profile_strict_title: "Translate Less",
        received_auto_translate_profile_strict_desc: "More conservative. Best when the channel already contains lots of bilingual or target-language content.",
        received_auto_translate_profile_custom_title: "Custom",
        received_auto_translate_profile_custom_desc: "Manually decide which incoming messages should be skipped or translated.",
        received_auto_translate_advanced_title: "Advanced Rules",
        received_auto_translate_advanced_locked: "A preset is active right now. Most users do not need these low-level switches. Switch to Custom if you want manual control.",
        drop_similar_translations_label: "Hide translations that are almost identical to the source",
        minimum_auto_translate_length_title: "Minimum text length before auto-translate",
        translation_similarity_threshold_title: "How similar counts as 'almost unchanged'"
      }), isRussian && Object.assign(texts, {
        auth_keys_title: "Ключи доступа",
        custom_section_title: "Настройка",
        api_key_label: "API ключ:",
        api_endpoint_label: "API адрес:",
        model_id_label: "ID модели:",
        paid_version_label: "Платная версия",
        microsoft_region_label: "Регион:",
        section_service_title: "Провайдер перевода",
        section_service_hint: "Сначала выберите провайдера, затем заполните только нужные поля.",
        primary_engine_title: "Основной провайдер",
        backup_engine_title: "Резервный провайдер",
        backup_engine_select_title: "Резервный провайдер",
        backup_engine_hint: "Резервный провайдер используется только при ошибке основного.",
        backup_engine_none: "Без резервного провайдера",
        backup_engine_none_hint: "Резервный провайдер сейчас не включен.",
        google_default_hint: "Режим Google по умолчанию не требует отдельного API ключа.",
        engine_unknown_hint: "Для этого провайдера сейчас нет отдельной формы настроек.",
        engine_no_extra_fields: "Для этого провайдера нет дополнительных полей.",
        other_service_title: "Ключи других провайдеров",
        other_service_hint: "Эти поля оставлены для совместимости, если вы захотите переключиться позже.",
        section_language_title: "Языковые правила",
        section_language_hint: "Базовые языковые правила для отправки и получения сообщений.",
        sent_input_title: "Исходный язык отправляемых сообщений",
        sent_output_title: "Целевой язык отправляемых сообщений",
        received_input_title: "Исходный язык входящих сообщений",
        received_output_title: "Целевой язык входящих сообщений",
        source_filter_title: "Автоперевод исходящих только с этих языков",
        source_filter_hint: "Если языки не добавлены, исходный язык исходящих сообщений не ограничен. После добавления будут переводиться только эти языки.",
        source_filter_empty_state: "Исходные языки исходящих сообщений сейчас не ограничены.",
        source_filter_add: "+ Добавить исходный язык",
        received_auto_translate_title: "Автоперевод входящих сообщений",
        received_auto_translate_hint: "Здесь задаются правила, какие входящие сообщения переводить автоматически.",
        received_auto_translate_preset_title: "Профиль автоперевода",
        received_auto_translate_preset_loose: "Свободный",
        received_auto_translate_preset_balanced: "Сбалансированный",
        received_auto_translate_preset_strict: "Строгий",
        received_auto_translate_preset_custom: "Пользовательский",
        received_source_filter_title: "Разрешённые исходные языки для входящих",
        received_source_filter_hint: "Если языки не добавлены, входящие сообщения на любом исходном языке могут переводиться автоматически. После добавления будут переводиться только эти языки.",
        received_source_filter_empty_state: "Исходные языки входящих сообщений сейчас не ограничены.",
        received_source_filter_add: "+ Добавить язык входящих",
        auto_translate_decision_title: "Режим автоопределения перевода",
        auto_translate_decision_hint: "Базовые правила работают со всеми сервисами. AI-режим доступен только для AI-провайдеров и объединяется с запросом перевода.",
        auto_translate_decision_basic: "Базовые правила",
        auto_translate_decision_ai: "AI-решение",
        auto_translate_decision_ai_disabled: "AI-решение (не поддерживается)",
        auto_translate_ai_prompt_hint: "Если AI вернёт перевод, он будет показан. Если вернёт __SKIP_TRANSLATION__, блок перевода не показывается.",
        auto_translate_ai_prompt_reset: "Восстановить стандартную подсказку",
        skip_mixed_received_label: "Пропускать смешанные сообщения",
        skip_same_language_received_label: "Пропускать сообщения на том же языке, что и целевой",
        treat_language_variants_label: "Считать региональные варианты одним языком",
        drop_similar_translations_label: "Отбрасывать почти одинаковые переводы",
        minimum_auto_translate_length_title: "Минимальная длина текста для автоперевода",
        translation_similarity_threshold_title: "Порог схожести перевода",
        section_display_title: "Отображение и интерфейс",
        section_display_hint: "Управляет тем, как показываются переводы и элементы интерфейса.",
        section_advanced_title: "Дополнительные функции",
        prefix_section_title: "Правила префиксов",
        disable_prefix_title: "Префиксы пропуска перевода",
        disable_prefix_hint: "Сообщения с этими префиксами отправляются без перевода.",
        disable_prefix_placeholder: "Новый префикс исключения",
        translate_prefix_title: "Префиксы целевого языка",
        translate_prefix_hint: "Например, `$fr hello` переведёт `hello` на французский перед отправкой.",
        translate_prefix_placeholder: "Префикс (например, $fr)",
        add_prefix_button: "+ Добавить префикс",
        validate_button_label: "Проверить текущую конфигурацию",
        validate_hint: "Отправляет минимальный запрос, чтобы проверить ключ, адрес и модель.",
        validate_running: "Проверка",
        validate_success: "Проверка успешна",
        validate_failed: "Проверка не удалась",
        validate_saved_endpoint: "Адрес автоматически исправлен и сохранён",
        validate_missing_key: "Сначала введите API ключ.",
        validate_missing_model: "Сначала введите ID модели.",
        validate_missing_endpoint: "Сначала введите API адрес.",
        support_panel_validate_title: "Проверка подключения",
        support_panel_links_title: "Ссылки и помощь",
        model_detect_button: "Проверить модель",
        model_fetch_button: "Получить модели",
        model_fetch_loading: "Загрузка списка моделей…",
        model_catalog_title: "Полученные модели",
        model_catalog_loaded: "Загружено моделей: {count}. Выбор заполнит поле модели выше.",
        model_catalog_empty: "Список моделей пуст.",
        protected_terms_title: "Защищённые слова / фразы",
        protected_terms_hint: "Добавьте имена или фразы, которые нельзя переводить.",
        protected_terms_placeholder: "Добавить защищённый термин",
        protected_terms_scope_sent: "Защищать исходящие сообщения",
        protected_terms_scope_received: "Защищать входящие сообщения",
        channel_auto_translate_label: "Автоперевод этого канала",
        channel_auto_translate_on: "Автоперевод включён для этого канала",
        channel_auto_translate_off: "ЛКМ: открыть настройки, ПКМ: включить автоперевод канала",
        language_detector_title: "Помощник определения языка",
        language_detector_hint: "Вставьте пример текста из канала, чтобы определить язык и применить его к правилам выше.",
        language_detector_placeholder: "Вставьте текст для определения",
        language_detector_button: "Опред.",
        language_detector_button_loading: "Поиск",
        language_detector_empty: "Сначала вставьте текст для определения.",
        language_detector_failed: "Не удалось определить язык этого текста.",
        language_detector_detected: "Определённый язык",
        language_detector_apply_received: "Использовать для входящих",
        language_detector_apply_sent: "Использовать для исходного языка отправки",
        language_detector_apply_sent_output: "Использовать для целевого языка отправки",
        context_detect_message_language: "Определить язык сообщения",
        context_reply_in_detected_language: "Ответить на этом языке",
        detect_message_empty: "В этом сообщении нет текста для определения языка.",
        detect_message_failed: "Не удалось определить язык сообщения.",
        detect_message_success: "Определено",
        reply_language_applied: "Целевой язык отправки для канала переключён на",
        reply_language_hint: "Оставьте перевод в канале включённым и отвечайте на своём языке.",
        translated_label: "Перевод",
        wrapper_pairs_title: "Защищённые пары обрамления",
        wrapper_pairs_hint: 'Добавляйте правила в формате левая|правая часть, например "|", `|`, 【|】 или 「|」.',
        wrapper_pairs_placeholder: "Например 【|】 или `|`",
        wrapper_pairs_scope_sent: "Защищать исходящие сообщения",
        wrapper_pairs_scope_received: "Защищать входящие сообщения",
        plugin_language_title: "Язык интерфейса плагина",
        plugin_language_hint: "Можно следовать языку Discord или зафиксировать язык интерфейса плагина отдельно.",
        translated_text_color_title: "Цвет переведённого текста",
        translated_text_color_hint: "Нажмите на цветовую плашку, чтобы выбрать цвет. Через кнопку + можно ввести и сохранить свой код цвета.",
        translated_text_color_save_button: "Сохранить",
        translated_text_color_invalid: "Некорректный код цвета. Укажите корректный HEX- или CSS-цвет."
      }), Object.assign(texts, {
        channel_primary_engine_title: texts.channel_primary_engine_title || (isChinese ? "当前频道主服务商" : isRussian ? "Основной сервис текущего канала" : "Current Channel Primary Provider"),
        channel_primary_engine_restore: texts.channel_primary_engine_restore || (isChinese ? "恢复全局默认" : isRussian ? "Вернуть глобальный" : "Use Global Default"),
        channel_primary_engine_unconfigured_warning: texts.channel_primary_engine_unconfigured_warning || (isChinese ? "尚未完成 API 配置，翻译时会沿用现有失败处理并尝试备用服务。" : isRussian ? "API ещё не настроен; при ошибке будет использован резервный сервис." : "API setup is incomplete; failures will keep using the existing backup behavior."),
        language_not_supported_by_channel_engines: texts.language_not_supported_by_channel_engines || (isChinese ? "当前频道主服务和全局备用服务都不支持这个语言组合" : isRussian ? "Текущая основная и глобальная резервная службы не поддерживают эту языковую пару" : "Neither the channel primary nor global backup provider supports this language pair"),
        primary_engine_section_title: texts.primary_engine_section_title || (isChinese ? "主服务商设置" : isRussian ? "Настройки основного сервиса" : "Primary Provider Settings"),
        section_message_language_title: texts.section_message_language_title || (isChinese ? "发送与接收语言" : isRussian ? "Языки отправки и получения" : "Sent and Received Languages"),
        section_sent_language_title: texts.section_sent_language_title || (isChinese ? "发送消息" : isRussian ? "Исходящие сообщения" : "Sent Messages"),
        section_received_language_title: texts.section_received_language_title || (isChinese ? "收到消息" : isRussian ? "Входящие сообщения" : "Received Messages"),
        section_display_message_title: texts.section_display_message_title || (isChinese ? "消息显示" : isRussian ? "Отображение сообщений" : "Message Display"),
        protection_section_title: texts.protection_section_title || (isChinese ? "保护规则" : isRussian ? "Правила защиты" : "Protection Rules"),
        received_auto_translate_scope_title: texts.received_auto_translate_scope_title || (isChinese ? "自动翻译模式" : isRussian ? "Диапазон автоперевода" : "Auto-translate range"),
        received_auto_translate_scope_hint: texts.received_auto_translate_scope_hint || (isChinese ? "只翻译新消息，或连当前已加载消息一起翻译。" : isRussian ? "Выберите: переводить только новые сообщения или также уже загруженные на экран." : "Translate only new messages, or include the messages already loaded on screen."),
        received_auto_translate_scope_new_only: texts.received_auto_translate_scope_new_only || (isChinese ? "只翻译新消息" : isRussian ? "Только новые сообщения (рекомендуется)" : "Only new messages (Recommended)"),
        received_auto_translate_scope_loaded_messages: texts.received_auto_translate_scope_loaded_messages || (isChinese ? "当前已加载消息" : isRussian ? "Переводить уже загруженные сообщения" : "Translate currently loaded messages"),
        received_auto_translate_loaded_window_title: texts.received_auto_translate_loaded_window_title || (isChinese ? "已加载消息的时间范围" : isRussian ? "Временной диапазон загруженных сообщений" : "Loaded message time range"),
        received_auto_translate_loaded_window_hint: texts.received_auto_translate_loaded_window_hint || (isChinese ? "只处理这个时间范围内的已加载消息。" : isRussian ? "Переводить только загруженные сообщения в этом диапазоне времени." : "Only translate loaded messages inside this time range."),
        received_auto_translate_loaded_window_15m: texts.received_auto_translate_loaded_window_15m || (isChinese ? "15分钟" : isRussian ? "15 мин" : "15 min"),
        received_auto_translate_loaded_window_1h: texts.received_auto_translate_loaded_window_1h || (isChinese ? "1小时" : isRussian ? "1 час" : "1 hour"),
        received_auto_translate_loaded_window_6h: texts.received_auto_translate_loaded_window_6h || (isChinese ? "6小时" : isRussian ? "6 часов" : "6 hours"),
        received_auto_translate_loaded_window_24h: texts.received_auto_translate_loaded_window_24h || (isChinese ? "24小时" : isRussian ? "24 часа" : "24 hours"),
        received_auto_translate_loaded_window_all: texts.received_auto_translate_loaded_window_all || (isChinese ? "全部已加载（高风险）" : isRussian ? "Все загруженные (риск)" : "All loaded (High risk)"),
        received_auto_translate_scope_new_only_desc: texts.received_auto_translate_scope_new_only_desc || (isChinese ? "只处理开启后出现的新消息，滚动和历史记录最稳定。" : isRussian ? "Переводит только новые сообщения после включения; самый стабильный режим." : "Only translate messages that appear after enabling; safest for scrolling."),
        received_auto_translate_scope_loaded_messages_desc: texts.received_auto_translate_scope_loaded_messages_desc || (isChinese ? "会回扫当前屏幕已加载消息，适合临时看历史，但会限制数量并在滚动时暂停。" : isRussian ? "Сканирует уже загруженные сообщения; лимитируется и ставится на паузу при прокрутке." : "Backfills currently loaded messages; capped and paused while scrolling."),
        received_auto_translate_loaded_range_mode_title: texts.received_auto_translate_loaded_range_mode_title || (isChinese ? "已加载消息范围方式" : isRussian ? "Способ ограничения" : "Loaded message range mode"),
        received_auto_translate_loaded_range_mode_count: texts.received_auto_translate_loaded_range_mode_count || (isChinese ? "按数量" : isRussian ? "По количеству" : "By count"),
        received_auto_translate_loaded_range_mode_time: texts.received_auto_translate_loaded_range_mode_time || (isChinese ? "按时间" : isRussian ? "По времени" : "By time"),
        received_auto_translate_loaded_warning: texts.received_auto_translate_loaded_warning || (isChinese ? "会翻译当前屏幕已加载的消息；每批按数量限制，向上滚动时可继续处理新加载的历史消息。" : isRussian ? "Чем длиннее диапазон, тем больше скачков высоты. Плагин ограничивает очередь, обновляет пакетами и ставит работу на паузу при прокрутке." : "Longer ranges can cause more height changes. The plugin caps the queue, rerenders in batches, and pauses while you scroll."),
        received_auto_translate_loaded_limit_title: texts.received_auto_translate_loaded_limit_title || (isChinese ? "每批最多翻译已加载消息" : isRussian ? "Максимум уже загруженных сообщений" : "Max loaded messages per pass"),
        received_auto_translate_loaded_limit_hint: texts.received_auto_translate_loaded_limit_hint || (isChinese ? "建议 25 或 50，最大 100。AI 服务商会优先按该数量批量请求，失败时自动拆包补翻。" : isRussian ? "Рекомендуется 25 или 50. Чем больше, тем выше риск скачков." : "25 or 50 is recommended; max 100. AI providers try this batch size first and split/fallback if needed."),
        received_auto_translate_loaded_pause_scroll: texts.received_auto_translate_loaded_pause_scroll || (isChinese ? "拖动滚动条/阅读历史时暂停已加载消息翻译" : isRussian ? "Пауза перевода загруженных сообщений при прокрутке" : "Pause loaded-message translation while scrolling")
      }), texts.show_secret_label || (texts.show_secret_label = isChinese ? "显示密钥" : isRussian ? "Показать ключ" : "Show secret"), texts.hide_secret_label || (texts.hide_secret_label = isChinese ? "隐藏密钥" : isRussian ? "Скрыть ключ" : "Hide secret"), texts[key] || key;
    }
    __name(getCustomTextValue, "getCustomTextValue");
    module2.exports = { getCustomTextValue };
  }
});

// src/legacy/runtime.js
var require_runtime = __commonJS({
  "src/legacy/runtime.js"(exports2, module2) {
    module2.exports = ((_) => {
      let changeLog = {}, normalizeSemverVersion = /* @__PURE__ */ __name((version) => {
        let withoutPrefix = String(version ?? "").trim().replace(/^(?:v\s*)+/i, ""), match = withoutPrefix.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/);
        return match ? `${match[1]}.${match[2]}.${match[3]}` : withoutPrefix;
      }, "normalizeSemverVersion");
      return !window.BDFDB_Global || !window.BDFDB_Global.loaded && !window.BDFDB_Global.started ? class {
        constructor(meta) {
          for (let key in meta) this[key] = meta[key];
        }
        getName() {
          return this.name;
        }
        getAuthor() {
          return this.author;
        }
        getVersion() {
          return normalizeSemverVersion(this.version);
        }
        getDescription() {
          return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. 

${this.description}`;
        }
        downloadLibrary() {
          BdApi.Net.fetch("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js").then((r) => {
            if (!r || r.status != 200) throw new Error();
            return r.text();
          }).then((b) => {
            if (b) return require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, (_2) => BdApi.UI.showToast("Finished downloading BDFDB Library", { type: "success" }));
            throw new Error();
          }).catch((error) => {
            BdApi.UI.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
          });
        }
        load() {
          (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) && (window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, { pluginQueue: [] })), window.BDFDB_Global.downloadModal || (window.BDFDB_Global.downloadModal = !0, BdApi.UI.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
            confirmText: "Download Now",
            cancelText: "Cancel",
            onCancel: /* @__PURE__ */ __name((_2) => {
              delete window.BDFDB_Global.downloadModal;
            }, "onCancel"),
            onConfirm: /* @__PURE__ */ __name((_2) => {
              delete window.BDFDB_Global.downloadModal, this.downloadLibrary();
            }, "onConfirm")
          })), window.BDFDB_Global.pluginQueue.includes(this.name) || window.BDFDB_Global.pluginQueue.push(this.name);
        }
        start() {
          this.load();
        }
        stop() {
        }
        getSettingsPanel() {
          let template = document.createElement("template");
          return template.innerHTML = `<div style="color: var(--text-strong); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.
Please click <a style="font-weight: 500;">Download Now</a> to install it.</div>`, template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary), template.content.firstElementChild;
        }
      } : (([Plugin, BDFDB]) => {
        var _a;
        let { createDisplayRuntime } = require_display_runtime(), { createTranslationDisplayLogic } = require_translation_display_logic(), { createDisplayRepaintScheduler } = require_repaint_scheduler(), { createHistoricalDisplayTracker } = require_historical_display_tracker(), { createTranslatorStyles } = require_styles(), { renderSettingsPanel } = require_settings_panel(), { createTranslateComponents, translateIcon, translateIconUntranslate } = require_translate_components(), loadedStatusPosition = require_loaded_status_position(), { createChannelTitleStore } = require_channel_title_store(), { createMessageViewportStore } = require_message_viewport_store(), { LOADED_STATUS_COMPLETION_HIDE_MS, LOADED_STATUS_REFRESH_MS, createLoadedTranslationStatusStore } = require_loaded_translation_status_store(), { createTranslationCacheStore } = require_translation_cache_store(), { createProviderClient, translationEngines, enginePortals } = require_provider_client(), { createSentTranslationStore } = require_sent_translation_store(), { createLiveTranslationQueue } = require_live_translation_queue(), { resumeHistoricalHandoff } = require_historical_handoff_runtime(), { createHistoricalJobRegistry } = require_historical_job_registry(), channelToggleOperations = require_channel_toggle_operations().createChannelToggleOperations(), { HistoricalTranslationJob, HISTORICAL_TERMINAL_ITEM_STATES, HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX } = require_historical_translation_job(), { runChunkedHistoricalBatch } = require_historical_provider_chunking(), { createProtectionLogic, TRANSLATION_PROTECTION_SIGNATURE_VERSION } = require_protection_logic(), { parseStoredEmbedTranslations } = require_embed_translation_parser(), {
          foreignLanguageDecisionRuntime,
          receivedMessageFilterRuntime,
          createReceivedTranslationRuntime
        } = require_received_translation_runtime(), { createPluginHistoricalSourceRuntime } = require_historical_source_wiring(), { createMessageDeletionLifecycle } = require_message_deletion_lifecycle(), {
          LOADED_AUTO_TRANSLATE_RANGE_MODES,
          loadedAutoTranslatePolicy,
          aiDecisionPolicy,
          sentTranslationPolicy,
          languageHeuristicsRuntime,
          textSimilarityRuntime,
          createLanguageHeuristics
        } = require_language_heuristics(), { languagePolicy, receivedSettingsPolicy, languageDetectionRuntime } = createLanguageHeuristics({ BDFDB }), {
          createSettingsStore,
          createEmptyChannelEnablementState,
          normalizeStoredChannelEnablementState,
          migrateLegacyChannelEnablementState,
          loadChannelEnablementState,
          getChannelEnablementStateValue,
          channelEnablementStatesEqual
        } = require_settings_store(), { getLabelsForUiLanguage } = require_labels(), { getCustomTextValue } = require_text();
        var _this;
        let translationProtectionSignatureVersion = TRANSLATION_PROTECTION_SIGNATURE_VERSION, { TranslateButtonComponent } = createTranslateComponents({
          BDFDB,
          // _this is assigned in onLoad(), long after this line runs, so the components
          // resolve the plugin per call instead of capturing it now.
          getPlugin: /* @__PURE__ */ __name(() => _this, "getPlugin")
        }), brailleConverter = {
          0: "⠴",
          1: "⠂",
          2: "⠆",
          3: "⠒",
          4: "⠲",
          5: "⠢",
          6: "⠖",
          7: "⠶",
          8: "⠦",
          9: "⠔",
          "!": "⠮",
          '"': "⠐",
          "#": "⠼",
          $: "⠫",
          "%": "⠩",
          "&": "⠯",
          "'": "⠄",
          "(": "⠷",
          ")": "⠾",
          "*": "⠡",
          "+": "⠬",
          ",": "⠠",
          "-": "⠤",
          ".": "⠨",
          "/": "⠌",
          ":": "⠱",
          ";": "⠰",
          "<": "⠣",
          "=": "⠿",
          ">": "⠜",
          "?": "⠹",
          "@": "⠈",
          a: "⠁",
          b: "⠃",
          c: "⠉",
          d: "⠙",
          e: "⠑",
          f: "⠋",
          g: "⠛",
          h: "⠓",
          i: "⠊",
          j: "⠚",
          k: "⠅",
          l: "⠇",
          m: "⠍",
          n: "⠝",
          o: "⠕",
          p: "⠏",
          q: "⠟",
          r: "⠗",
          s: "⠎",
          t: "⠞",
          u: "⠥",
          v: "⠧",
          w: "⠺",
          x: "⠭",
          y: "⠽",
          z: "⠵",
          "[": "⠪",
          "\\": "⠳",
          "]": "⠻",
          "^": "⠘",
          "⠁": "a",
          "⠂": "1",
          "⠃": "b",
          "⠄": "'",
          "⠅": "k",
          "⠆": "2",
          "⠇": "l",
          "⠈": "@",
          "⠉": "c",
          "⠊": "i",
          "⠋": "f",
          "⠌": "/",
          "⠍": "m",
          "⠎": "s",
          "⠏": "p",
          "⠐": '"',
          "⠑": "e",
          "⠒": "3",
          "⠓": "h",
          "⠔": "9",
          "⠕": "o",
          "⠖": "6",
          "⠗": "r",
          "⠘": "^",
          "⠙": "d",
          "⠚": "j",
          "⠛": "g",
          "⠜": ">",
          "⠝": "n",
          "⠞": "t",
          "⠟": "q",
          "⠠": ", ",
          "⠡": "*",
          "⠢": "5",
          "⠣": "<",
          "⠤": "-",
          "⠥": "u",
          "⠦": "8",
          "⠧": "v",
          "⠨": ".",
          "⠩": "%",
          "⠪": "[",
          "⠫": "$",
          "⠬": "+",
          "⠭": "x",
          "⠮": "!",
          "⠯": "&",
          "⠰": ";",
          "⠱": ":",
          "⠲": "4",
          "⠳": "\\",
          "⠴": "0",
          "⠵": "z",
          "⠶": "7",
          "⠷": "(",
          "⠸": "_",
          "⠹": "?",
          "⠺": "w",
          "⠻": "]",
          "⠼": "#",
          "⠽": "y",
          "⠾": ")",
          "⠿": "=",
          _: "⠸"
        }, morseConverter = {
          0: "−−−−−",
          1: "·−−−−",
          2: "··−−−",
          3: "···−−",
          4: "····−",
          5: "·····",
          6: "−····",
          7: "−−···",
          8: "−−−··",
          9: "−−−−·",
          "!": "−·−·−−",
          '"': "·−··−·",
          $: "···−··−",
          "&": "·−···",
          "'": "·−−−−·",
          "(": "−·−−·",
          ")": "−·−−·−",
          "+": "·−·−·",
          ",": "−−··−−",
          "-": "−····−",
          ".": "·−·−·−",
          "/": "−··−·",
          ":": "−−−···",
          ";": "−·−·−·",
          "=": "−···−",
          "?": "··−−··",
          "@": "·−−·−·",
          a: "·−",
          b: "−···",
          c: "−·−·",
          d: "−··",
          e: "·",
          f: "··−·",
          g: "−−·",
          h: "····",
          i: "··",
          j: "·−−−",
          k: "−·−",
          l: "·−··",
          m: "−−",
          n: "−·",
          o: "−−−",
          p: "·−−·",
          q: "−−·−",
          r: "·−·",
          s: "···",
          t: "−",
          u: "··−",
          v: "···−",
          w: "·−−",
          x: "−··−",
          y: "−·−−",
          z: "−−··",
          "·": "e",
          "··": "i",
          "···": "s",
          "····": "h",
          "·····": "5",
          "····−": "4",
          "···−": "v",
          "···−··−": "$",
          "···−−": "3",
          "··−": "u",
          "··−·": "f",
          "··−−··": "?",
          "··−−·−": "_",
          "··−−−": "2",
          "·−": "a",
          "·−·": "r",
          "·−··": "l",
          "·−···": "&",
          "·−··−·": '"',
          "·−·−·": "+",
          "·−·−·−": ".",
          "·−−": "w",
          "·−−·": "p",
          "·−−·−·": "@",
          "·−−−": "j",
          "·−−−−": "1",
          "·−−−−·": "'",
          "−": "t",
          "−·": "n",
          "−··": "d",
          "−···": "b",
          "−····": "6",
          "−····−": "-",
          "−···−": "=",
          "−··−": "x",
          "−··−·": "/",
          "−·−": "k",
          "−·−·": "c",
          "−·−·−·": ";",
          "−·−·−−": "!",
          "−·−−": "y",
          "−·−−·": "(",
          "−·−−·−": ")",
          "−−": "m",
          "−−·": "g",
          "−−··": "z",
          "−−···": "7",
          "−−··−−": ",",
          "−−·−": "q",
          "−−−": "o",
          "−−−··": "8",
          "−−−···": ":",
          "−−−−·": "9",
          "−−−−−": "0",
          _: "··−−·−"
        }, channelTitleStore = createChannelTitleStore(), loadedTranslationStatusStore = createLoadedTranslationStatusStore({ isChineseUiLanguage: /* @__PURE__ */ __name(() => _this && _this.isChineseUiLanguage(), "isChineseUiLanguage") }), historicalDisplayTracker = createHistoricalDisplayTracker({ isStatusForChannel: /* @__PURE__ */ __name((channelId) => loadedTranslationStatusStore.isForChannel(channelId), "isStatusForChannel"), getRevision: /* @__PURE__ */ __name((_channelId, messageId) => {
          let view = _this && _this.getReceivedDisplayRuntimeView(messageId);
          return view ? view.revision : null;
        }, "getRevision"), updateStatus: /* @__PURE__ */ __name((updates) => _this && _this.updateLoadedAutoTranslationStatus(updates), "updateStatus") });
        var pluginRuntimeActive = !0;
        let DEFAULT_LOADED_AUTO_TRANSLATE_LIMIT = 50, LOADED_AUTO_TRANSLATE_LIMIT_MIN = 1, LOADED_AUTO_TRANSLATE_LIMIT_MAX = 100, DISCORD_EPOCH = 14200704e5, defaultLanguages = {
          INPUT: "auto",
          OUTPUT: "$discord"
        }, languageTypes = {
          INPUT: "input",
          OUTPUT: "output"
        }, messageTypes = {
          RECEIVED: "received",
          SENT: "sent"
        }, AI_SKIP_TRANSLATION_TOKEN = "__SKIP_TRANSLATION__", protectionLogic = createProtectionLogic({ BDFDB }), secondDebugProbe = null;
        secondDebugProbe && typeof window < "u" && secondDebugProbe.installGlobal(window, { resolveScrollerElement: /* @__PURE__ */ __name(() => document.querySelector(BDFDB.dotCN.messagesscroller), "resolveScrollerElement"), forceUpdate: /* @__PURE__ */ __name((...targets) => BDFDB.ReactUtils.forceUpdate(...targets), "forceUpdate"), rerenderAll: /* @__PURE__ */ __name((instant) => BDFDB.MessageUtils.rerenderAll(instant), "rerenderAll"), getRenderCount: /* @__PURE__ */ __name(() => secondDebugProbe.getParentRenderCount(), "getRenderCount"), autoRunExperiment: !0, autoRunMaxAttempts: 60 });
        let { receivedTranslationRuntime } = createReceivedTranslationRuntime({ BDFDB, loadedTranslationStatusStore }), translationDisplayLogic = createTranslationDisplayLogic({ BDFDB });
        return _a = class extends Plugin {
          getVersion() {
            return normalizeSemverVersion(this.version);
          }
          getBuildId() {
            return "aabf95d8c33ea019";
          }
          createHistoricalTranslationJob(config = {}) {
            return new HistoricalTranslationJob(config);
          }
          onLoad() {
            _this = this, this.defaults = {
              general: {
                interfaceLanguage: { value: "system", popout: !1 },
                sendOriginalMessage: { value: !1, popout: !1 },
                showOriginalMessage: { value: !1, popout: !1 },
                showOriginalDirectly: { value: !0, popout: !1 },
                showOriginalInReplyPreview: { value: !1, popout: !1 },
                useSpoilerInSentOriginal: { value: !1, popout: !1 },
                useSpoilerInReceivedOriginal: { value: !1, popout: !1 },
                highlightTranslatedMessages: { value: !0, popout: !1 },
                translatedTextColor: { value: "#7cc7ff", popout: !1 },
                protectQuotedText: { value: !0, popout: !1, description: "Automatically protect and highlight wrapped content" },
                useSpoilerInOriginal: { value: !1, popout: !1, description: "Use Spoilers instead of Quotes for the original Message Text" }
              },
              choices: {},
              filters: {
                autoTranslateSourceLanguages: { value: [] },
                receivedAutoTranslateScope: { value: "new_only" },
                receivedAutoTranslateLoadedRangeMode: { value: "count" },
                receivedAutoTranslateLoadedTimeWindow: { value: "1h" },
                receivedAutoTranslateLoadedLimit: { value: "50" },
                continueLoadedAutoTranslateOnScroll: { value: !0 },
                pauseLoadedAutoTranslateWhileScrolling: { value: !0 },
                receivedAutoTranslateSourceLanguages: { value: [] },
                autoTranslateDecisionMode: { value: "basic" },
                aiAutoTranslatePrompt: { value: "" },
                languageDetectionStrategy: { value: "local_first" },
                skipMixedReceivedMessages: { value: !1 },
                skipSameLanguageReceivedMessages: { value: !0 },
                useLocalLanguagePrecheck: { value: !0 },
                treatLanguageVariantsAsSame: { value: !0 },
                dropSimilarTranslations: { value: !0 },
                minimumAutoTranslateLength: { value: 2 },
                translationSimilarityThreshold: { value: 0.9 }
              },
              exceptions: {
                wordStart: { value: ["!"], max: 3 },
                protectedTerms: { value: [], max: 80 },
                protectedTermsForSent: { value: !0 },
                protectedTermsForReceived: { value: !0 },
                wrapperPairs: { value: ['"|"', "“|”", "`|`"], max: 20 },
                wrapperPairsForSent: { value: !0 },
                wrapperPairsForReceived: { value: !0 }
              },
              prefixes: {
                translationPrefixData: { value: [
                  { prefix: "$fr", language: "fr" },
                  { prefix: "$de", language: "de" },
                  { prefix: "$es", language: "es" },
                  { prefix: "$jp", language: "ja" }
                ] }
              },
              engines: {
                translator: { value: "googleapi" },
                backup: { value: "----" }
              }
            };
            for (let m in messageTypes) this.defaults.choices[messageTypes[m]] = { value: Object.keys(languageTypes).reduce((newObj, l) => (newObj[languageTypes[l]] = defaultLanguages[l], newObj), {}) };
            this.modulePatches = {
              before: [
                "ChannelTextAreaContainer",
                "ChannelTextAreaEditor",
                "Embed",
                "MessageReply",
                "Messages"
              ],
              after: [
                "ChannelTextAreaButtons",
                "ChannelThreadItem",
                "Embed",
                "HeaderBarChannelName",
                "HeaderBarTitle",
                "MessageReply",
                "MessageButtons",
                "MessageContent",
                "ThreadCard",
                "ThreadSidebar"
              ]
            }, this.css = createTranslatorStyles(BDFDB);
          }
          handleEditedMessageSubmit(methodArguments, originalMethod) {
            let args = Array.from(methodArguments || []), channelId = args[0], messageId = args[1], payload = args[2], originalText = typeof payload == "string" ? payload : payload && typeof payload.content == "string" ? payload.content : "", submit = /* @__PURE__ */ __name((nextText) => {
              let nextArgs = args.slice();
              return nextArgs[2] = typeof payload == "string" ? nextText : Object.assign({}, payload || {}, { content: nextText }), Promise.resolve(originalMethod(...nextArgs));
            }, "submit");
            if (this.clearDisplayedTranslationState(messageId, { clearReplyPreview: !0 }), this.ensureReceivedDisplayRuntime().dropSourceArchive(messageId), this.clearCachedTranslation(messageId), !originalText || !channelId || !this.isTranslationEnabled(channelId)) return submit(originalText);
            let sentRequest = this.createSentAutomaticTranslationRequest(channelId, originalText, messageId);
            return new Promise((resolve, reject) => {
              let finishSubmit = /* @__PURE__ */ __name((nextText) => this.completeSentAutomaticTranslationRequest(sentRequest, nextText, submit).then(resolve, reject), "finishSubmit");
              this.shouldAutoTranslateSentMessage(originalText, channelId, (shouldTranslate) => {
                if (!shouldTranslate || !this.isSentAutomaticTranslationRequestCurrent(sentRequest)) return finishSubmit(originalText);
                this.translateText(originalText, messageTypes.SENT, (translation, input, output) => {
                  finishSubmit(this.buildSentTranslationMessageValue(originalText, translation, input, output));
                }, null, { channelId });
              });
            });
          }
          handleDeletedMessage(messageId, channelId) {
            return this.ensureMessageDeletionLifecycle().deleteMessage(messageId, channelId);
          }
          handleMessageDeletionAction(action) {
            return this.ensureMessageDeletionLifecycle().handleAction(action);
          }
          onStart() {
            pluginRuntimeActive = !0, this.resetReceivedDisplayRuntime(), this.ensureLiveTranslationQueue().restartRequestGeneration(), this.ensureSentTranslationStore().resetForStart(), this.ensureHistoricalJobRegistry().advanceRuntimeGeneration(), this.attachAutoTranslationInputActivityWatcher();
            let dispatcher = BDFDB.LibraryModules.Dispatcher || BDFDB.LibraryModules.DispatcherUtils;
            dispatcher && typeof dispatcher.dispatch == "function" && BDFDB.PatchUtils.patch(this, dispatcher, "dispatch", { before: /* @__PURE__ */ __name((event) => {
              let action = event.methodArguments && event.methodArguments[0];
              !action || action.type != "MESSAGE_DELETE" && action.type != "MESSAGE_DELETE_BULK" || this.handleMessageDeletionAction(action).catch((_2) => {
              });
            }, "before") }), BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageUtils, "startEditMessage", { before: /* @__PURE__ */ __name((e) => {
              let editArchive = e.methodArguments[1] && this.ensureReceivedDisplayRuntime().peekSourceArchive(e.methodArguments[1]);
              editArchive && editArchive.message.content ? e.methodArguments[2] = editArchive.message.content : e.methodArguments[1] && (e.methodArguments[2] = this.getEditableSentMessageText(e.methodArguments[1], e.methodArguments[2]));
            }, "before") }), BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageUtils, "editMessage", { instead: /* @__PURE__ */ __name((e) => this.handleEditedMessageSubmit(e.methodArguments, (...args) => e.originalMethod(...args)), "instead") }), BDFDB.PatchUtils.patch(this, BDFDB.LibraryModules.MessageToolbarUtils, "useMessageMenu", { after: /* @__PURE__ */ __name((e) => {
              if (e.instance.props.message && e.instance.props.channel) {
                let channelId = e.instance.props.channel && e.instance.props.channel.id || null, translated = this.isMessageDisplayTranslated(e.instance.props.message, channelId), [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnValue, { id: ["copy-text", "pin", "unpin"] });
                index == -1 && ([children, index] = BDFDB.ContextMenuUtils.findItem(e.returnValue, { id: ["edit", "add-reaction", "add-reaction-1", "quote"] })), children.splice(index + 1, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
                  label: translated ? this.labels.context_messageuntranslateoption : this.labels.context_messagetranslateoption,
                  id: BDFDB.ContextMenuUtils.createItemId(this.name, translated ? "untranslate-message" : "translate-message"),
                  icon: /* @__PURE__ */ __name((_2) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
                    icon: translated ? translateIconUntranslate : translateIcon
                  }), "icon"),
                  action: /* @__PURE__ */ __name((_2) => this.translateMessage(e.instance.props.message, e.instance.props.channel, { manual: !0, independentOfTextAreaSwitch: !0, trackBusy: !1 }), "action")
                })), this.injectMessageLanguageActions(children, index + 1, e.instance.props.message, e.instance.props.channel);
              }
            }, "after") }), this.forceUpdateAll();
          }
          onStop() {
            pluginRuntimeActive = !1, channelToggleOperations.reset(), this.invalidateLiveTranslationRequests(), this.invalidateSentAutomaticTranslationRequests(), this.ensureSentTranslationStore().clearPendingOriginals(), this.ensureHistoricalJobRegistry().advanceRuntimeGeneration(), channelTitleStore.invalidateInFlight(), this.cancelHistoricalTranslationJobs(null, "plugin-stopped"), this.clearChannelTitleTranslations(), this.detachAutoTranslationInputActivityWatcher(), this.detachAutoTranslationScrollWatcher(), this.ensureTranslationCacheStore().cancelPendingSave(), this.ensureReceivedDisplayRepaintScheduler().cancelFullRepaintTimers(), this.ensureLiveTranslationQueue().cancelQueueRetry(), this.ensureMessageViewportStore().clearManualScrollLock(), this.clearReceivedDisplayFlushQueue(), this.restoreAllReceivedDisplay({ refresh: !1 }), this.clearDisplayedTranslations(), this.ensureHistoricalJobRegistry().clearFailedSnapshots(), this.ensureSentTranslationStore().clearManualRequests(), this.ensureReceivedDisplayRuntime().clearAllSuppression(), this.ensureLiveTranslationQueue().clearAllQueuedMessages(), this.ensureReceivedDisplayRuntime().clearPreviews(null), this.ensureReceivedDisplayRuntime().clearPreviewEligibility(null), this.ensureLiveTranslationQueue().setBusyTranslating(!1), this.ensureLiveTranslationQueue().setLiveAutoTranslating(!1), this.clearLoadedAutoTranslationStatus(), BDFDB.MessageUtils.rerenderAll(!0);
          }
          getSettingsPanel(collapseStates = {}) {
            return renderSettingsPanel(this, collapseStates, { BDFDB });
          }
          onSettingsClosed() {
            this.ensureReceivedDisplayRepaintScheduler().hasDeferredFullRepaint() && this.flushDeferredTranslationRerender(), this.SettingsUpdated && (delete this.SettingsUpdated, this.forceUpdateAll());
          }
          getCustomText(key) {
            return getCustomTextValue(key, this.isChineseUiLanguage(), this.isRussianUiLanguage());
          }
          getGeneralSettingLabel(key) {
            let isChinese = this.isChineseUiLanguage(), isRussian = this.isRussianUiLanguage(), labels = isChinese ? {
              sendOriginalMessage: "发送译文时同时附带原文",
              showOriginalMessage: "查看收到的译文时同时显示原文",
              useSpoilerInOriginal: "原文使用剧透样式显示"
            } : {
              sendOriginalMessage: "Also send the original text with translated outgoing messages",
              showOriginalMessage: "Also show the original text with translated incoming messages",
              useSpoilerInOriginal: "Show original text as spoiler blocks"
            };
            return Object.assign(labels, isChinese ? {
              showOriginalDirectly: "直接显示收到消息的原文",
              useSpoilerInOriginal: "原文使用剧透样式显示"
            } : {
              showOriginalDirectly: "Show received original text directly",
              useSpoilerInOriginal: "Show original text as spoiler blocks"
            }), Object.assign(labels, isChinese ? {
              highlightTranslatedMessages: "给译文消息添加更显眼的左侧色条与背景"
            } : {
              highlightTranslatedMessages: "Highlight translated messages with a left accent and background"
            }), Object.assign(labels, isChinese ? {
              protectQuotedText: "自动保护并高亮包裹符内的内容"
            } : {
              protectQuotedText: "Automatically protect and highlight wrapped content"
            }), Object.assign(labels, isChinese ? {
              showOriginalInReplyPreview: "别人引用这条消息时只显示译文"
            } : {
              showOriginalInReplyPreview: "Show translated text only in reply previews"
            }), Object.assign(labels, isChinese ? {
              useSpoilerInSentOriginal: "发送附带原文时使用剧透/刮刮乐遮盖",
              useSpoilerInReceivedOriginal: "查看收到的原文时使用剧透/刮刮乐遮盖"
            } : {
              useSpoilerInSentOriginal: "Hide attached outgoing original text behind spoiler (scratch-off) blocks",
              useSpoilerInReceivedOriginal: "Show received original text as spoiler (scratch-off) blocks"
            }), isRussian && Object.assign(labels, {
              interfaceLanguage: "Язык интерфейса плагина",
              sendOriginalMessage: "Добавлять оригинал к переведённым исходящим сообщениям",
              showOriginalMessage: "Показывать оригинал рядом с переведёнными входящими сообщениями",
              showOriginalDirectly: "Показывать оригинал входящих сообщений напрямую",
              highlightTranslatedMessages: "Подсвечивать переведённые сообщения",
              translatedTextColor: "Цвет переведённого текста",
              protectQuotedText: "Автоматически защищать и подсвечивать текст в обрамляющих символах",
              useSpoilerInOriginal: "Показывать оригинал как спойлер"
            }), isRussian && Object.assign(labels, {
              useSpoilerInSentOriginal: "袩褉褟褌邪褌褜 懈褋褏芯写薪褘泄 褌械泻褋褌 胁 懈褋褏芯写褟褖懈褏 褋芯芯斜褖械薪懈褟褏 泻邪泻 褋锌芯泄谢械褉",
              useSpoilerInReceivedOriginal: "袩芯泻邪蟹褘胁邪褌褜 芯褉懈谐懈薪邪谢 胁褏芯写褟褖懈褏 褋芯芯斜褖械薪懈泄 泻邪泻 褋锌芯泄谢械褉"
            }), labels[key] || this.labels[`general_${key}`] || this.defaults.general[key].description;
          }
          getEngineLabel(engineKey) {
            let isChinese = this.isChineseUiLanguage(), isRussian = this.isRussianUiLanguage();
            return isRussian && engineKey == "googleapi" ? "Google (по умолчанию, без API)" : isRussian && engineKey == "googlecloud" ? "Google Cloud Translation (официальный API)" : isRussian && engineKey == "microsoft" ? "Azure Translator (официальный API)" : isRussian && engineKey == "oaicompat" ? "Пользовательский API (совместимый с OpenAI)" : engineKey == "googleapi" ? isChinese ? "Google（默认，无需 API）" : "Google (Default, no API)" : engineKey == "googlecloud" ? isChinese ? "Google Cloud Translation（正式 API）" : "Google Cloud Translation (Official API)" : engineKey == "microsoft" ? isChinese ? "Azure Translator（正式 API）" : "Azure Translator (Official API)" : engineKey == "openai" ? isChinese ? "OpenAI（官方 API）" : "OpenAI (Official API)" : engineKey == "gemini" ? isChinese ? "Google Gemini（官方 API）" : "Google Gemini (Official API)" : engineKey == "oaicompat" ? isChinese ? "自定义 API（兼容 OpenAI）" : "Custom API (OpenAI Compatible)" : translationEngines[engineKey] && translationEngines[engineKey].name || engineKey;
          }
          getChannelTranslationToggleLabel() {
            return this.isChineseUiLanguage() ? "当前频道收到消息自动翻译" : "Incoming auto-translate for this channel";
          }
          getTranslateButtonTooltipText(channelId) {
            return this.isTranslationEnabled(channelId) ? `${this.isChineseUiLanguage() ? "当前频道翻译插件总开关已开启" : "Translator master switch is enabled in this channel"} | ${this.getTranslationTooltipText(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId), this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId))}` : this.isChineseUiLanguage() ? "左键打开设置，右键开启当前频道的翻译插件总开关" : "Left click for settings, right click to enable the translator master switch in this channel";
          }
          getUiLanguageId() {
            let overrideLanguage = this.settings && this.settings.general && this.settings.general.interfaceLanguage;
            return overrideLanguage && overrideLanguage != "system" ? overrideLanguage : BDFDB.LanguageUtils.getLanguage().id;
          }
          isChineseUiLanguage() {
            return ["zh", "zh-CN", "zh-TW"].includes(this.getUiLanguageId());
          }
          isRussianUiLanguage() {
            return this.getUiLanguageId() == "ru";
          }
          getPluginLanguageOptions() {
            let isChinese = this.isChineseUiLanguage(), isRussian = this.isRussianUiLanguage();
            return [
              { value: "system", label: isChinese ? "跟随 Discord" : isRussian ? "Как в Discord" : "Follow Discord" },
              { value: "zh-CN", label: "简体中文" },
              { value: "en", label: "English" },
              { value: "ru", label: "Русский" }
            ];
          }
          getReceivedAutoTranslateScopeOptions() {
            return [
              { value: "new_only", label: this.getCustomText("received_auto_translate_scope_new_only") },
              { value: "loaded_messages", label: this.getCustomText("received_auto_translate_scope_loaded_messages") }
            ];
          }
          getReceivedAutoTranslateLoadedTimeWindowOptions() {
            return [
              { value: "15m", label: this.getCustomText("received_auto_translate_loaded_window_15m") },
              { value: "1h", label: this.getCustomText("received_auto_translate_loaded_window_1h") },
              { value: "6h", label: this.getCustomText("received_auto_translate_loaded_window_6h") },
              { value: "24h", label: this.getCustomText("received_auto_translate_loaded_window_24h") },
              { value: "all", label: this.getCustomText("received_auto_translate_loaded_window_all") }
            ];
          }
          getReceivedAutoTranslateLoadedRangeModeOptions() {
            return [
              { value: LOADED_AUTO_TRANSLATE_RANGE_MODES.COUNT, label: this.getCustomText("received_auto_translate_loaded_range_mode_count") },
              { value: LOADED_AUTO_TRANSLATE_RANGE_MODES.TIME, label: this.getCustomText("received_auto_translate_loaded_range_mode_time") }
            ];
          }
          normalizeLoadedAutoTranslateLimit(value) {
            let parsedValue = parseInt(value, 10);
            return isFinite(parsedValue) ? Math.max(LOADED_AUTO_TRANSLATE_LIMIT_MIN, Math.min(LOADED_AUTO_TRANSLATE_LIMIT_MAX, parsedValue)) : DEFAULT_LOADED_AUTO_TRANSLATE_LIMIT;
          }
          getTranslatedTextColorPresets() {
            return [
              "#7cc7ff",
              "#5aa9ff",
              "#57d39b",
              "#f0b232",
              "#ff8a5b",
              "#ff6b9a",
              "#c084fc",
              "#e6edf3"
            ];
          }
          getTranslatedTextColorPalette() {
            let colors = this.getTranslatedTextColorPresets().slice(), customColors = this.settings && this.settings.general && BDFDB.ArrayUtils.is(this.settings.general.customTranslatedTextColors) ? this.settings.general.customTranslatedTextColors : [];
            for (let color of customColors) color && !colors.includes(color) && colors.unshift(color);
            let currentColor = this.getTranslatedTextColor();
            return colors.includes(currentColor) || colors.unshift(currentColor), colors;
          }
          getTranslatedTextColorOptions() {
            return this.getTranslatedTextColorPalette().map((color) => ({ value: color, label: color }));
          }
          getTranslatedTextColor() {
            return (this.settings && this.settings.general && this.settings.general.translatedTextColor || "").trim() || "#7cc7ff";
          }
          isValidCssColorValue(color) {
            if (color = (color || "").trim(), !color) return !1;
            if (typeof document > "u" || !document.createElement) return /^#([0-9a-f]{3,8})$/i.test(color);
            let testElement = document.createElement("span");
            return testElement.style.color = "", testElement.style.color = color, !!testElement.style.color;
          }
          shouldUseSpoilerInSentOriginal() {
            let general = this.settings && this.settings.general || {};
            return general.useSpoilerInSentOriginal != null ? !!general.useSpoilerInSentOriginal : !!general.useSpoilerInOriginal;
          }
          shouldUseSpoilerInReceivedOriginal() {
            let general = this.settings && this.settings.general || {};
            return general.useSpoilerInReceivedOriginal != null ? !!general.useSpoilerInReceivedOriginal : !!general.useSpoilerInOriginal;
          }
          getCurrentUserId() {
            try {
              if (BDFDB.LibraryStores.UserStore && typeof BDFDB.LibraryStores.UserStore.getCurrentUser == "function") {
                let currentUser = BDFDB.LibraryStores.UserStore.getCurrentUser();
                if (currentUser && currentUser.id) return currentUser.id;
              }
            } catch {
            }
            return BDFDB.UserUtils && BDFDB.UserUtils.me && BDFDB.UserUtils.me.id || null;
          }
          isOwnMessage(message) {
            let currentUserId = this.getCurrentUserId();
            return !!(currentUserId && message && message.author && message.author.id == currentUserId);
          }
          ensureElementChildrenArray(element) {
            return !element || !element.props ? [] : (Array.isArray(element.props.children) || (element.props.children = element.props.children == null ? [] : [element.props.children]), element.props.children);
          }
          getMessageDetectionSourceText(message) {
            if (!message) return "";
            let detectionRecord = this.ensureReceivedDisplayRuntime().getDisplayState(message.id), translation = detectionRecord && detectionRecord.translation;
            if (translation && translation.originalContent) return translation.originalContent;
            let detectionArchive = this.ensureReceivedDisplayRuntime().peekSourceArchive(message.id), originalContentData = detectionArchive && detectionArchive.originalContentData;
            return originalContentData && originalContentData.content ? originalContentData.content : message.content || "";
          }
          ensureChannelLanguageChoiceScope(channelId, place) {
            return this.ensureSettingsStore().ensureChannelLanguageChoiceScope(channelId, place);
          }
          setReplyTargetLanguageForChannel(channelId, languageId) {
            !channelId || !languageId || (this.ensureSettingsStore().setChannelLanguageChoice(channelId, messageTypes.SENT, languageTypes.OUTPUT, languageId), this.setLanguages(), this.SettingsUpdated = !0);
          }
          extractLegacyDisplayedTranslationParts(content) {
            if (content = (content || "").trim(), !content) return { translatedContent: "", originalContent: "" };
            content = content.replace(/^\s*(?:译文|Translated|Перевод)\s*\n+/i, "");
            let lines = content.split(`
`), originalLabelIndex = lines.findIndex((line) => /^(?:原文|Original|Оригинал)\s*$/i.test((line || "").trim()));
            if (originalLabelIndex > -1) return {
              translatedContent: lines.slice(0, originalLabelIndex).join(`
`).trim(),
              originalContent: lines.slice(originalLabelIndex + 1).join(`
`).trim()
            };
            if (/\n\|\|[\s\S]*\|\|$/.test(content)) {
              let match = content.match(/\n\|\|([\s\S]*)\|\|$/);
              return {
                translatedContent: content.replace(/\n\|\|[\s\S]*\|\|$/, "").trim(),
                originalContent: match && match[1] ? match[1].trim() : ""
              };
            }
            let boundaryLines = content.split(`
`), boundaryIndex = boundaryLines.length;
            for (; boundaryIndex > 0 && /^\s*>\s?/.test(boundaryLines[boundaryIndex - 1]); ) boundaryIndex--;
            return boundaryIndex < boundaryLines.length ? {
              translatedContent: boundaryLines.slice(0, boundaryIndex).join(`
`).trim(),
              originalContent: boundaryLines.slice(boundaryIndex).map((line) => line.replace(/^\s*>\s?/, "")).join(`
`).trim()
            } : { translatedContent: content, originalContent: "" };
          }
          normalizeStoredTranslationData(translation) {
            if (!translation) return translation;
            let normalized = Object.assign({}, translation), legacyParts = this.extractLegacyDisplayedTranslationParts(normalized.content || ""), translatedContent = (normalized.translatedContent || "").trim(), originalContent = normalized.originalContent != null ? String(normalized.originalContent) : "";
            return !translatedContent || /^(?:译文|Translated|Перевод)\s*$/i.test(translatedContent) ? normalized.translatedContent = legacyParts.translatedContent || translatedContent : normalized.translatedContent = translatedContent, !originalContent && legacyParts.originalContent && (normalized.originalContent = legacyParts.originalContent), normalized;
          }
          async handleMessageLanguageAction(message, channel, applyAsReplyTarget = !1) {
            let sourceText = (this.getMessageDetectionSourceText(message) || "").trim();
            if (!sourceText) return BDFDB.NotificationUtils.toast(this.getCustomText("detect_message_empty"), { type: "danger", position: "center" });
            let detectedLanguage = await this.detectLanguageDetails(sourceText);
            return detectedLanguage ? applyAsReplyTarget && channel && channel.id ? (this.setReplyTargetLanguageForChannel(channel.id, detectedLanguage.id), BDFDB.NotificationUtils.toast(`${this.getCustomText("reply_language_applied")} ${this.getLanguageDisplayName(detectedLanguage)} (${detectedLanguage.id}). ${this.getCustomText("reply_language_hint")}`, { type: "success", position: "center" })) : BDFDB.NotificationUtils.toast(`${this.getCustomText("detect_message_success")}: ${this.getLanguageDisplayName(detectedLanguage)} (${detectedLanguage.id})`, { type: "success", position: "center" }) : BDFDB.NotificationUtils.toast(this.getCustomText("detect_message_failed"), { type: "danger", position: "center" });
          }
          injectMessageLanguageActions(children, index, message, channel) {
            if (!children || !message || !channel) return;
            let insertIndex = index > -1 ? index + 1 : 0;
            children.splice(
              insertIndex,
              0,
              BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
                label: this.getCustomText("context_detect_message_language"),
                id: BDFDB.ContextMenuUtils.createItemId(this.name, "detect-message-language"),
                action: /* @__PURE__ */ __name((_2) => this.handleMessageLanguageAction(message, channel, !1), "action")
              }),
              BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
                label: this.getCustomText("context_reply_in_detected_language"),
                id: BDFDB.ContextMenuUtils.createItemId(this.name, "reply-in-detected-language"),
                action: /* @__PURE__ */ __name((_2) => this.handleMessageLanguageAction(message, channel, !0), "action")
              })
            );
          }
          cloneOriginalContentData(originalContentData) {
            return {
              content: originalContentData && originalContentData.content || "",
              embeds: (originalContentData && originalContentData.embeds || []).map((embed) => ({
                description: embed && embed.description || "",
                title: embed && embed.title || "",
                footerText: embed && embed.footerText || "",
                fields: (embed && embed.fields || []).map((field) => ({
                  name: field && field.name || "",
                  value: field && field.value || ""
                }))
              }))
            };
          }
          normalizeExtractedMessageText(value) {
            if (value == null) return "";
            if (typeof value == "string") return value;
            if (typeof value == "number" || typeof value == "boolean") return String(value);
            if (value && typeof value == "object") {
              if (typeof value.text == "string") return value.text;
              if (typeof value.content == "string") return value.content;
              if (typeof value.raw == "string") return value.raw;
            }
            return "";
          }
          getReferencedPreviewContentCandidates(message) {
            let candidates = [], addCandidate = /* @__PURE__ */ __name((value) => {
              value = this.normalizeExtractedMessageText(value).trim(), value && !candidates.includes(value) && candidates.push(value);
            }, "addCandidate"), referencedSources = [
              message && message.referencedMessage,
              message && message.referencedMessage && message.referencedMessage.message,
              message && message.referenced_message,
              message && message.messageReference && message.messageReference.message,
              message && message.reference && message.reference.message
            ].filter(Boolean);
            for (let source of referencedSources)
              addCandidate(source.content), addCandidate(source.originalContent), addCandidate(source.rawContent);
            return candidates;
          }
          stripReferencedPreviewFromContent(message, content) {
            if (content = this.normalizeExtractedMessageText(content), !message || !content || !(message.referencedMessage || message.referenced_message || message.messageReference || message.reference)) return content;
            let trimmedContent = content.trim();
            if (!trimmedContent) return content;
            let candidates = this.getReferencedPreviewContentCandidates(message);
            if (!candidates.length) return content;
            let normalize = /* @__PURE__ */ __name((value) => this.normalizeComparisonText(value || ""), "normalize"), lines = content.split(/\r?\n/);
            for (let candidate of candidates) {
              let normalizedCandidate = normalize(candidate);
              if (!normalizedCandidate) continue;
              if (normalize(trimmedContent) == normalizedCandidate) return content;
              if (trimmedContent.startsWith(candidate)) {
                let remainder = trimmedContent.slice(candidate.length).replace(/^\s+/, "");
                if (remainder) return remainder;
              }
              let firstLine = (lines[0] || "").trim();
              if (firstLine && (normalize(firstLine).includes(normalizedCandidate) || normalizedCandidate.includes(normalize(firstLine)))) {
                let remainder = lines.slice(1).join(`
`).trim();
                if (remainder) return remainder;
              }
            }
            return content;
          }
          refreshReceivedMessageSourceState(message, channelId = null) {
            if (!message || !message.id || !this.ensureReceivedDisplayRuntime().hasSourceArchive(message.id)) return !1;
            let currentContent = this.normalizeExtractedMessageText(message.content).trim();
            if (!currentContent) return !1;
            let storedOriginal = this.ensureReceivedDisplayRuntime().peekSourceArchive(message.id).message, storedOriginalData = storedOriginal.originalContentData || {}, editRecord = this.ensureReceivedDisplayRuntime().getDisplayState(message.id), translation = editRecord && (editRecord.translation || editRecord.restoredTranslation) || {};
            return [
              storedOriginal.content,
              storedOriginalData.content,
              translation.originalContent,
              translation.translatedContent,
              translation.content
            ].map((value) => this.normalizeExtractedMessageText(value).trim()).filter(Boolean).includes(currentContent) ? !1 : (this.ensureReceivedDisplayRuntime().dropSourceArchive(message.id), this.clearDisplayedTranslationState(message.id, { clearReplyPreview: !0 }), this.clearCachedTranslation(message.id), !0);
          }
          matchesPaintedTranslationContent(paintedText, translation) {
            return receivedTranslationRuntime.matchesPaintedTranslation(this, paintedText, translation);
          }
          extractOriginalContentData(message, options = {}) {
            let storedOriginalContentData = receivedTranslationRuntime.resolveOriginalContentDataAnchor(this, message);
            if (storedOriginalContentData) return this.cloneOriginalContentData(storedOriginalContentData);
            let messageContent = this.normalizeExtractedMessageText(message && message.content || "");
            options && options.ignoreReferencedPreview && (messageContent = this.stripReferencedPreviewFromContent(message, messageContent));
            let extractedParts = this.extractLegacyDisplayedTranslationParts(messageContent);
            return this.cloneOriginalContentData({
              content: extractedParts.originalContent || messageContent,
              embeds: (message && message.embeds || []).map((embed) => ({
                description: this.normalizeExtractedMessageText(embed.originalDescription || embed.rawDescription || embed.description || ""),
                title: this.normalizeExtractedMessageText(embed.originalTitle || embed.rawTitle || embed.title || ""),
                footerText: this.normalizeExtractedMessageText(embed.originalFooter ? embed.originalFooter.text : embed.footer ? embed.footer.text : ""),
                fields: (embed.originalFields || embed.fields || []).map((field) => ({
                  name: this.normalizeExtractedMessageText(field.rawName || field.name || ""),
                  value: this.normalizeExtractedMessageText(field.rawValue || field.value || "")
                }))
              }))
            });
          }
          isTranslatorInjectedElement(element) {
            if (!element || typeof element != "object") return !1;
            if (element.key && String(element.key).indexOf("translator-") == 0) return !0;
            let className = element.props && element.props.className;
            if (typeof className == "string" && className.toLowerCase().indexOf("translator") > -1) return !0;
            let nestedChildren = element.props && element.props.children;
            return nestedChildren ? Array.isArray(nestedChildren) ? nestedChildren.some((child) => this.isTranslatorInjectedElement(child)) : this.isTranslatorInjectedElement(nestedChildren) : !1;
          }
          cleanupInjectedMessageChildren(children) {
            if (!Array.isArray(children)) return children;
            for (let index = children.length - 1; index > -1; index--)
              this.isTranslatorInjectedElement(children[index]) && children.splice(index, 1);
            return children;
          }
          buildProtectedQuoteFragments(text, keyPrefix = "0") {
            if (!this.settings.general.protectQuotedText || typeof text != "string" || !text) return text;
            let quotedRegex = /"([^"\r\n]+)"|“([^”\r\n]+)”/g, match, lastIndex = 0, quoteIndex = 0, fragments = [];
            for (; match = quotedRegex.exec(text); ) {
              let quotedText = match[0];
              !quotedText || !quotedText.slice(1, -1).trim() || (match.index > lastIndex && fragments.push(text.slice(lastIndex, match.index)), fragments.push(BDFDB.ReactUtils.createElement("span", {
                key: `translator-protected-quote-${keyPrefix}-${quoteIndex++}`,
                className: "translator-protected-quote",
                children: quotedText
              })), lastIndex = match.index + quotedText.length);
            }
            return fragments.length ? (lastIndex < text.length && fragments.push(text.slice(lastIndex)), fragments.filter((fragment) => fragment !== "")) : text;
          }
          highlightProtectedQuotesInNode(node, keyPrefix = "0") {
            if (!this.settings.general.protectQuotedText || node == null) return node;
            if (typeof node == "string") return this.buildProtectedQuoteFragments(node, keyPrefix);
            if (Array.isArray(node)) {
              let nextNodes = [];
              return node.forEach((childNode, index) => {
                let highlightedNode = this.highlightProtectedQuotesInNode(childNode, `${keyPrefix}-${index}`);
                Array.isArray(highlightedNode) ? nextNodes.push(...highlightedNode) : nextNodes.push(highlightedNode);
              }), nextNodes;
            }
            return typeof node != "object" || this.isTranslatorInjectedElement(node) || !node.props || typeof node.type == "string" && ["code", "pre"].includes(node.type) || node.props.children != null && (node.props.children = this.highlightProtectedQuotesInNode(node.props.children, `${keyPrefix}-c`)), node;
          }
          isDiscordSpoilerWrapperRule(rule) {
            let raw = (rule || "").trim();
            if (!raw) return !1;
            if (/^\|{2,}$/.test(raw)) return !0;
            let splitIndex = raw.indexOf("|");
            if (splitIndex < 1 || splitIndex >= raw.length - 1) return !1;
            let left = raw.slice(0, splitIndex), right = raw.slice(splitIndex + 1);
            return /^\|+$/.test(left) && /^\|+$/.test(right);
          }
          getWrapperPairItemsForSettings() {
            return (BDFDB.ArrayUtils.is(this.settings.exceptions.wrapperPairs) ? this.settings.exceptions.wrapperPairs : []).filter((rule) => !this.isDiscordSpoilerWrapperRule(rule));
          }
          getProtectedWrapperRules() {
            let wrapperPairs = this.getWrapperPairItemsForSettings();
            return [...new Set(wrapperPairs.map((rule) => (rule || "").trim()).filter(Boolean))].map((rule) => {
              let splitIndex = rule.indexOf("|");
              if (splitIndex < 1 || splitIndex >= rule.length - 1) return null;
              let left = rule.slice(0, splitIndex), right = rule.slice(splitIndex + 1);
              return !left || !right ? null : { left, right, raw: rule };
            }).filter(Boolean).sort((ruleA, ruleB) => ruleB.left.length + ruleB.right.length - (ruleA.left.length + ruleA.right.length));
          }
          findNextProtectedWrapperSegment(text, fromIndex = 0) {
            if (typeof text != "string" || !text) return null;
            let bestMatch = null;
            for (let rule of this.getProtectedWrapperRules()) {
              let startIndex = text.indexOf(rule.left, fromIndex);
              for (; startIndex > -1; ) {
                let contentStart = startIndex + rule.left.length, endIndex = text.indexOf(rule.right, contentStart);
                if (endIndex < 0) break;
                let fullText = text.slice(startIndex, endIndex + rule.right.length), innerText = text.slice(contentStart, endIndex);
                if (innerText.trim() && !/[\r\n]/.test(fullText)) {
                  let candidate = { startIndex, endIndex: endIndex + rule.right.length, fullText, innerText, rule };
                  (!bestMatch || candidate.startIndex < bestMatch.startIndex || candidate.startIndex == bestMatch.startIndex && fullText.length > bestMatch.fullText.length) && (bestMatch = candidate);
                  break;
                }
                startIndex = text.indexOf(rule.left, contentStart);
              }
            }
            return bestMatch;
          }
          buildProtectedWrapperFragments(text, keyPrefix = "0") {
            if (typeof text != "string" || !text) return text;
            let fragments = [], cursor = 0, wrapperIndex = 0;
            for (; cursor < text.length; ) {
              let match = this.findNextProtectedWrapperSegment(text, cursor);
              if (!match) break;
              match.startIndex > cursor && fragments.push(text.slice(cursor, match.startIndex)), fragments.push(BDFDB.ReactUtils.createElement("span", {
                key: `translator-protected-quote-${keyPrefix}-${wrapperIndex++}`,
                className: "translator-protected-quote",
                children: match.fullText
              })), cursor = match.endIndex;
            }
            return fragments.length ? (cursor < text.length && fragments.push(text.slice(cursor)), fragments.filter((fragment) => fragment !== "")) : text;
          }
          highlightProtectedWrappedTextInNode(node, keyPrefix = "0") {
            if (node == null) return node;
            if (typeof node == "string") return this.buildProtectedWrapperFragments(node, keyPrefix);
            if (Array.isArray(node)) {
              let nextNodes = [];
              return node.forEach((childNode, index) => {
                let highlightedNode = this.highlightProtectedWrappedTextInNode(childNode, `${keyPrefix}-${index}`);
                Array.isArray(highlightedNode) ? nextNodes.push(...highlightedNode) : nextNodes.push(highlightedNode);
              }), nextNodes;
            }
            return typeof node != "object" || this.isTranslatorInjectedElement(node) || !node.props || typeof node.type == "string" && ["code", "pre"].includes(node.type) || node.props.children != null && (node.props.children = this.highlightProtectedWrappedTextInNode(node.props.children, `${keyPrefix}-c`)), node;
          }
          buildTranslationRequestText(originalContentData) {
            let allTextsToTranslate = originalContentData.content || "";
            return (originalContentData.embeds || []).forEach((embed) => {
              allTextsToTranslate += `
__________________ __________________ __________________
`, allTextsToTranslate += embed.title + `
` + embed.description, (embed.fields || []).forEach((field) => {
                allTextsToTranslate += `

` + field.name + "__________________" + field.value;
              }), embed.footerText && (allTextsToTranslate += `
` + embed.footerText);
            }), allTextsToTranslate.trim();
          }
          hasTranslatableMessageContent(originalContentData) {
            return originalContentData ? (originalContentData.content || "").trim() ? !0 : (originalContentData.embeds || []).some((embed) => (embed.title || "").trim() || (embed.description || "").trim() || (embed.footerText || "").trim() || (embed.fields || []).some((field) => (field.name || "").trim() || (field.value || "").trim())) : !1;
          }
          buildReceivedDisplayContent(translatedContent, originalContent, forceInlineOriginal = !1) {
            return translationDisplayLogic.buildReceivedDisplayContent(this, translatedContent, originalContent, forceInlineOriginal);
          }
          refreshTranslationDisplay(translation) {
            return translationDisplayLogic.refreshTranslationDisplay(this, translation);
          }
          getReceivedTranslationRequestConfigurationData(channelId) {
            return {
              protectionVersion: translationProtectionSignatureVersion,
              channelId: channelId || null,
              input: this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId),
              output: this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId),
              protectQuotedText: this.settings && this.settings.general && this.settings.general.protectQuotedText !== !1,
              protectedTermsForReceived: this.getExceptionScopeSetting("protectedTermsForReceived", !0),
              wrapperPairsForReceived: this.getExceptionScopeSetting("wrapperPairsForReceived", !0),
              wrapperPairs: this.getProtectedWrapperRules().map((rule) => rule.raw),
              protectedTerms: this.getProtectedTermsList().map((term) => term.toLowerCase()),
              wordStart: BDFDB.ArrayUtils.is(this.settings && this.settings.exceptions && this.settings.exceptions.wordStart) ? this.settings.exceptions.wordStart.slice() : [],
              translator: this.getEffectivePrimaryEngine(channelId),
              backup: this.getEffectiveBackupEngine(channelId)
            };
          }
          getReceivedTranslationPolicyConfigurationData() {
            return {
              sourceLanguages: this.getReceivedAutoTranslateSourceLanguages(),
              autoDecisionMode: this.getAutoTranslateDecisionMode(),
              languageDetectionStrategy: this.getLanguageDetectionStrategy(),
              skipSameLanguage: this.shouldSkipSameLanguageReceivedMessages(),
              useLocalLanguagePrecheck: this.useLocalLanguagePrecheck(),
              treatLanguageVariantsAsSame: this.shouldTreatLanguageVariantsAsSame(),
              dropSimilarTranslations: this.shouldDropSimilarTranslations(),
              translationSimilarityThreshold: this.getTranslationSimilarityThreshold()
            };
          }
          getReceivedTranslationConfigurationData(channelId) {
            return Object.assign({}, this.getReceivedTranslationRequestConfigurationData(channelId), {
              policy: this.getReceivedTranslationPolicyConfigurationData()
            });
          }
          createReceivedTranslationSignature(message, channelId, originalContentData = null) {
            let sourceData = originalContentData || this.extractOriginalContentData(message);
            return JSON.stringify(Object.assign({}, this.getReceivedTranslationConfigurationData(channelId), {
              content: sourceData.content || "",
              embeds: sourceData.embeds || []
            }));
          }
          getCachedReceivedTranslation(message, channelId, originalContentData = null) {
            return this.ensureTranslationCacheStore().getCachedTranslation(message, channelId, originalContentData);
          }
          getCachedReceivedSkipDecision(message, channelId, originalContentData = null) {
            return this.ensureTranslationCacheStore().getCachedSkipDecision(message, channelId, originalContentData);
          }
          scheduleTranslationCacheSave() {
            return this.ensureTranslationCacheStore().scheduleSave();
          }
          persistTranslationCacheEntry(messageId, signature, translation) {
            return this.ensureTranslationCacheStore().persistTranslation(messageId, signature, translation);
          }
          shouldPersistReceivedSkipDecision(reason) {
            return this.ensureTranslationCacheStore().shouldPersistSkipDecision(reason);
          }
          hasCachedTranslationEntry(messageId) {
            return this.ensureTranslationCacheStore().hasEntry(messageId);
          }
          getPersistedTranslationCacheEntry(messageId) {
            return this.ensureTranslationCacheStore().getEntry(messageId);
          }
          seedRawTranslationCacheEntryForTest(messageId, signature, translation) {
            return this.ensureTranslationCacheStore().seedRawEntryForTest(messageId, signature, translation);
          }
          // The raw signature embeds the whole request configuration, so storing it verbatim
          // made it the majority of the persisted cache file. Every use is an equality check,
          // so a compact digest carries the same information at a fraction of the size.
          hashReceivedTranslationSignature(signature) {
            return this.ensureTranslationCacheStore().hashSignature(signature);
          }
          matchesCachedTranslationSignature(entry, signature) {
            return this.ensureTranslationCacheStore().matchesSignature(entry, signature);
          }
          getLoadedAutoTranslationSeenCount(channelId) {
            return loadedTranslationStatusStore.getSeenCount(channelId);
          }
          markLoadedAutoTranslationMessageSeen(channelId, messageId) {
            return loadedTranslationStatusStore.markMessageSeen(channelId, messageId);
          }
          hasStoredOriginalMessageClone(messageId) {
            return !!(messageId && this.ensureReceivedDisplayRuntime().hasSourceArchive(messageId));
          }
          persistReceivedSkipDecision(messageId, signature, reason, preview = "") {
            return this.ensureTranslationCacheStore().persistSkipDecision(messageId, signature, reason, preview);
          }
          clearCachedTranslation(messageId) {
            return this.ensureTranslationCacheStore().clear(messageId);
          }
          createReplyPreviewSignature(message, channelId, originalContent = null) {
            return JSON.stringify(Object.assign({}, this.getReceivedTranslationConfigurationData(channelId), {
              content: originalContent ?? (message && message.content || "")
            }));
          }
          getReplyPreviewTranslation(message, channelId) {
            if (!message || !message.id) return null;
            let display = this.ensureReceivedDisplayRuntime();
            return display.getPreviewTranslation(message.id) ? display.getPreviewTranslation(message.id, { signature: this.createReplyPreviewSignature(message, channelId) }) : null;
          }
          createReplyPreviewTranslationData(message, channelId, translation) {
            if (!message || !translation) return null;
            translation = this.normalizeStoredTranslationData(translation);
            let translatedContent = (translation.translatedContent || translation.content || "").trim(), originalContent = (translation.originalContent != null ? translation.originalContent : message.content) || "";
            return translatedContent ? {
              signature: this.createReplyPreviewSignature(message, channelId, originalContent),
              channelId,
              auto: !!translation.auto,
              translatedContent,
              originalContent,
              input: translation.input,
              output: translation.output
            } : null;
          }
          getReplyPreviewDisplayContent(translation) {
            return translationDisplayLogic.getReplyPreviewDisplayContent(this, translation);
          }
          stripReplyPreviewOriginalSuffix(content) {
            return translationDisplayLogic.stripReplyPreviewOriginalSuffix(this, content);
          }
          getStableReplyPreviewOriginalContent(message) {
            return translationDisplayLogic.getStableReplyPreviewOriginalContent(this, message);
          }
          getStableReplyPreviewMessage(message) {
            return translationDisplayLogic.getStableReplyPreviewMessage(this, message);
          }
          getReplyPreviewFallbackContent(message) {
            return translationDisplayLogic.getReplyPreviewFallbackContent(this, message);
          }
          getReplyPreviewDisplayContentForMessage(message, channelId = null) {
            return translationDisplayLogic.getReplyPreviewDisplayContentForMessage(this, message, channelId);
          }
          tagReplyPreviewRenderNode(node) {
            if (node == null) return node;
            if (BDFDB.ArrayUtils.is(node)) return node.map((child) => this.tagReplyPreviewRenderNode(child));
            if (!(BDFDB.ReactUtils && typeof BDFDB.ReactUtils.isValidElement == "function" ? BDFDB.ReactUtils.isValidElement(node) : !!(node && typeof node == "object" && node.props)) || !node.props) return node;
            let props = Object.assign({}, node.props), className = typeof props.className == "string" ? props.className : "", lowerClassName = className.toLowerCase(), extraClasses = [];
            return (lowerClassName.includes("reply") || lowerClassName.includes("replied") || lowerClassName.includes("referenced")) && extraClasses.push("translator-reply-preview-body"), (lowerClassName.includes("repliedtext") || lowerClassName.includes("replycontent") || lowerClassName.includes("messagecontent")) && (extraClasses.push("translator-reply-preview-text"), props.style = Object.assign({}, props.style, {
              whiteSpace: "pre-wrap",
              overflow: "visible",
              textOverflow: "unset",
              maxHeight: "none",
              height: "auto",
              display: "block",
              WebkitLineClamp: "unset",
              lineClamp: "unset"
            }), typeof props.children == "string" && (props.children = props.children.replace(/\n+/g, `
`))), extraClasses.length && (props.className = BDFDB.DOMUtils.formatClassName(className, ...extraClasses)), props.children != null && (props.children = this.tagReplyPreviewRenderNode(props.children)), BDFDB.ReactUtils.createElement(node.type, Object.assign({}, props, { key: node.key, ref: node.ref }));
          }
          queueReplyPreviewTranslation(message, channelId, contextOptions = {}) {
            if (!message || !message.id || !channelId || this.ensureReceivedDisplayRuntime().isPreviewPending(message.id)) return;
            let baseMessage = contextOptions.baseMessage || null;
            if (baseMessage && !this.shouldAutoTranslateReplyPreview(baseMessage, message, channelId) || this.ensureReceivedDisplayRuntime().isSuppressed(message.id) || !this.isTranslationEnabled(channelId) || this.isOwnMessage(message)) return;
            let originalContent = (message.content || "").trim();
            if (!originalContent) return;
            let signature = this.createReplyPreviewSignature(message, channelId, originalContent), existingTranslation = this.ensureReceivedDisplayRuntime().getPreviewTranslation(message.id);
            if (existingTranslation && existingTranslation.signature == signature) return;
            let cachedTranslation = this.getCachedReceivedTranslation(message, channelId);
            if (cachedTranslation) {
              let previewTranslation = this.createReplyPreviewTranslationData(message, channelId, cachedTranslation);
              if (previewTranslation) {
                let previewCommit = this.ensureReceivedDisplayRuntime().commitPreviewResult({ messageId: message.id, channelId, signature, translation: previewTranslation });
                previewCommit && previewCommit.catch && previewCommit.catch((_2) => {
                });
              }
              return;
            }
            let request = this.ensureReceivedDisplayRuntime().markPreviewPending({ messageId: message.id, channelId, signature });
            this.translateText(originalContent, messageTypes.RECEIVED, (translation, input, output) => {
              if (!(!pluginRuntimeActive || !this.ensureReceivedDisplayRuntime().releasePreviewPending(message.id, request)) && this.createReplyPreviewSignature(message, channelId, (message.content || "").trim()) == signature && !(baseMessage && !this.shouldAutoTranslateReplyPreview(baseMessage, message, channelId)) && this.isTranslationEnabled(channelId) && translation) {
                let previewCommit = this.ensureReceivedDisplayRuntime().commitPreviewResult({ messageId: message.id, channelId, signature, translation: {
                  signature,
                  channelId,
                  auto: !0,
                  translatedContent: (translation || "").trim(),
                  originalContent,
                  input,
                  output
                } });
                previewCommit && previewCommit.catch && previewCommit.catch((_2) => {
                });
              }
            }, null, {
              showToast: !1,
              showFailureToast: !1,
              trackBusy: !1,
              channelId
            });
          }
          resetAutoTranslationTracking(channelId = null) {
            return this.ensureHistoricalSourceRuntime().advanceGeneration(channelId), this.ensureLiveTranslationQueue().resetTracking(channelId);
          }
          getAutoTranslationChannelState(channelId) {
            return this.ensureLiveTranslationQueue().getChannelState(channelId);
          }
          prepareAutoTranslationChannelSession(channelId) {
            return this.ensureHistoricalSourceRuntime().handleChannelSessionChange(this.ensureLiveTranslationQueue().getLastChannelId(), channelId), this.ensureLiveTranslationQueue().prepareChannelSession(channelId);
          }
          ensureHistoricalSourceRuntime() {
            return this.historicalSourceRuntimeInstance || (this.historicalSourceRuntimeInstance = createPluginHistoricalSourceRuntime({ plugin: this, BDFDB, getCurrentBatchNumber: /* @__PURE__ */ __name((channelId) => loadedTranslationStatusStore.getCurrentBatchNumber(channelId), "getCurrentBatchNumber"), debugProbe: secondDebugProbe })), this.historicalSourceRuntimeInstance;
          }
          getHistoricalMessageSourceGeneration(channelId) {
            return this.ensureHistoricalSourceRuntime().getGeneration(channelId);
          }
          advanceHistoricalMessageSourceGeneration(channelId = null) {
            return this.ensureHistoricalSourceRuntime().advanceGeneration(channelId);
          }
          compareMessageIds(messageIdA, messageIdB) {
            if (!messageIdA && !messageIdB) return 0;
            if (!messageIdA) return -1;
            if (!messageIdB) return 1;
            try {
              let comparableA = BigInt(messageIdA), comparableB = BigInt(messageIdB);
              return comparableA == comparableB ? 0 : comparableA > comparableB ? 1 : -1;
            } catch {
              let normalizedA = String(messageIdA), normalizedB = String(messageIdB);
              return normalizedA == normalizedB ? 0 : normalizedA.length != normalizedB.length ? normalizedA.length > normalizedB.length ? 1 : -1 : normalizedA > normalizedB ? 1 : -1;
            }
          }
          getNewestMessageId(currentMessageId, candidateMessageId) {
            return this.compareMessageIds(candidateMessageId, currentMessageId) > 0 ? candidateMessageId : currentMessageId;
          }
          isMessageIdNewer(messageId, referenceMessageId) {
            return messageId ? referenceMessageId ? this.compareMessageIds(messageId, referenceMessageId) > 0 : !0 : !1;
          }
          clearAutoTranslationEligibleReplyPreviewMessages(channelId = null) {
            this.ensureReceivedDisplayRuntime().clearPreviewEligibility(channelId);
          }
          markAutoTranslationEligibleReplyPreviewMessage(channelId, messageId) {
            !channelId || !messageId || this.ensureReceivedDisplayRuntime().markPreviewEligible(channelId, messageId);
          }
          isAutoTranslationEligibleReplyPreviewMessage(channelId, messageId) {
            return this.ensureReceivedDisplayRuntime().isPreviewEligible(channelId, messageId);
          }
          markReplyPreviewRenderMessage(message, { channelId = null, hostMessageId = null } = {}) {
            if (message && message.id && channelId && hostMessageId && this.ensureReceivedDisplayRuntime().markPreviewHost(channelId, message.id, hostMessageId), message && typeof message == "object")
              try {
                message.__DiscordAITranslatorReplyPreview = !0;
              } catch {
              }
          }
          isRenderingReplyPreviewMessage(message) {
            return !!(message && typeof message == "object" && message.__DiscordAITranslatorReplyPreview);
          }
          pauseHistoricalAutoTranslationForNavigation(duration = 1800) {
            return this.ensureMessageViewportStore().pauseForNavigation(duration);
          }
          wrapReplyPreviewJumpPause(node) {
            if (node == null) return node;
            if (BDFDB.ArrayUtils.is(node)) return node.map((child) => this.wrapReplyPreviewJumpPause(child));
            if (!(BDFDB.ReactUtils && typeof BDFDB.ReactUtils.isValidElement == "function" ? BDFDB.ReactUtils.isValidElement(node) : !!(node && typeof node == "object" && node.props)) || !node.props) return node;
            let props = Object.assign({}, node.props), oldMouseDownCapture = props.onMouseDownCapture, oldClickCapture = props.onClickCapture, pause = /* @__PURE__ */ __name((event) => {
              this.pauseHistoricalAutoTranslationForNavigation(1800);
            }, "pause");
            return props.onMouseDownCapture = (event) => {
              pause(event), typeof oldMouseDownCapture == "function" && oldMouseDownCapture(event);
            }, props.onClickCapture = (event) => {
              pause(event), typeof oldClickCapture == "function" && oldClickCapture(event);
            }, BDFDB.ReactUtils.createElement(node.type, Object.assign({}, props, { key: node.key, ref: node.ref }));
          }
          stripTranslatorStylingFromReplyPreviewNode(node) {
            if (node == null) return node;
            if (BDFDB.ArrayUtils.is(node)) return node.map((child) => this.stripTranslatorStylingFromReplyPreviewNode(child)).filter(Boolean);
            if (!(BDFDB.ReactUtils && typeof BDFDB.ReactUtils.isValidElement == "function" ? BDFDB.ReactUtils.isValidElement(node) : !!(node && typeof node == "object" && node.props)) || !node.props) return node;
            let props = Object.assign({}, node.props);
            if (typeof props.className == "string" && (props.className = props.className.split(/\s+/).filter((className) => className && className.toLowerCase().indexOf("translator") == -1).join(" ")), props.style && (props.style = Object.assign({}, props.style), delete props.style["--translator-accent-color"], delete props.style["--translator-text-color"], delete props.style.color, delete props.style.background, delete props.style.backgroundColor, delete props.style.borderLeft), props.children != null) {
              let children = BDFDB.ArrayUtils.is(props.children) ? props.children : [props.children];
              props.children = children.filter((child) => !this.isTranslatorInjectedElement(child)).map((child) => this.stripTranslatorStylingFromReplyPreviewNode(child));
            }
            return BDFDB.ReactUtils.createElement(node.type, Object.assign({}, props, { key: node.key, ref: node.ref }));
          }
          shouldAutoTranslateReplyPreview(baseMessage, referencedMessage, channelId) {
            return !this.settings.general.showOriginalInReplyPreview || !channelId || !baseMessage || !baseMessage.id || !referencedMessage || !referencedMessage.id || !this.isTranslationEnabled(channelId) || this.isOwnMessage(baseMessage) || this.isOwnMessage(referencedMessage) || this.ensureReceivedDisplayRuntime().isSuppressed(referencedMessage.id) ? !1 : this.getReceivedAutoTranslateScope() == "loaded_messages" ? this.isMessageWithinLoadedRange(baseMessage) : this.isAutoTranslationEligibleReplyPreviewMessage(channelId, baseMessage.id);
          }
          getMessagesScroller() {
            return this.ensureMessageViewportStore().getMessagesScroller();
          }
          extractMessageIdFromElement(element) {
            return this.ensureMessageViewportStore().extractMessageIdFromElement(element);
          }
          findMessageElementById(messageId) {
            return this.ensureMessageViewportStore().findMessageElementById(messageId);
          }
          findVisibleMessageAnchorElement(messagesScroller = null) {
            return this.ensureMessageViewportStore().findVisibleMessageAnchor(messagesScroller);
          }
          captureMessageAnchorState(messageId = null) {
            return this.ensureMessageViewportStore().captureAnchorState(messageId);
          }
          restoreMessageAnchorPosition(anchorState) {
            return this.ensureMessageViewportStore().restoreAnchorPosition(anchorState);
          }
          restoreMessageAnchorState(anchorState) {
            return this.ensureMessageViewportStore().restoreAnchorState(anchorState);
          }
          lockManualTranslationScroll(messageId) {
            return this.ensureMessageViewportStore().lockManualScroll(messageId);
          }
          getActiveManualTranslationScrollAnchor() {
            return this.ensureMessageViewportStore().getActiveManualScrollAnchor();
          }
          captureMessageScrollerState() {
            return this.ensureMessageViewportStore().captureScrollerState();
          }
          restoreMessageScrollerState(scrollerState) {
            return this.ensureMessageViewportStore().restoreScrollerState(scrollerState);
          }
          rerenderMessagesWithScrollPreserved() {
            this.attachAutoTranslationScrollWatcher();
            let manualAnchor = this.getActiveManualTranslationScrollAnchor(), scrollerState = manualAnchor ? null : this.captureMessageScrollerState();
            BDFDB.MessageUtils.rerenderAll(!0), manualAnchor ? this.restoreMessageAnchorState(manualAnchor) : this.restoreMessageScrollerState(scrollerState);
          }
          getLoadedAutoTranslationStatusText(status) {
            return loadedTranslationStatusStore.getStatusText(status);
          }
          getLoadedAutoTranslationStatusDetailText(status) {
            return loadedTranslationStatusStore.getStatusDetailText(status);
          }
          getLoadedAutoTranslationSkipReasonText(reason) {
            switch (reason) {
              case "symbol_only":
                return this.isChineseUiLanguage() ? "纯符号/无自然语言" : "symbol-only/no natural language";
              case "link_only":
                return this.isChineseUiLanguage() ? "仅链接/受保护内容" : "link-only/protected content";
              case "same_language":
                return this.isChineseUiLanguage() ? "同目标语言" : "same target language";
              case "too_similar":
                return this.isChineseUiLanguage() ? "与原文过于相似" : "too similar to source";
              case "wrong_target_language":
                return this.isChineseUiLanguage() ? "返回语言不对" : "wrong target language";
              case "ai_skip_signal":
                return this.isChineseUiLanguage() ? "AI判定无需翻译" : "AI skipped translation";
              case "source_filter":
                return this.isChineseUiLanguage() ? "不在源语言筛选内" : "outside source-language filter";
              case "local_guard":
                return this.isChineseUiLanguage() ? "本地保护兀底丢弃" : "dropped by local safeguard";
              case "out_of_range":
                return this.isChineseUiLanguage() ? "超出当前已加载范围" : "outside loaded range";
              default:
                return reason || (this.isChineseUiLanguage() ? "已跳过" : "skipped");
            }
          }
          getLoadedAutoTranslationPreviewText(text) {
            return loadedTranslationStatusStore.getPreviewText(text);
          }
          getLoadedAutoTranslationStatusTitleText(status) {
            if (!status) return "";
            let baseText = this.getLoadedAutoTranslationStatusDetailText(status), detailParts = [];
            return status && status.lastSkipReason && detailParts.push(this.getLoadedAutoTranslationSkipReasonText(status.lastSkipReason)), status && status.lastSkipPreview && detailParts.push(status.lastSkipPreview), detailParts.length ? `${baseText} | ${this.isChineseUiLanguage() ? "最近跳过" : "Last skipped"}: ${detailParts.join(" | ")}` : baseText;
          }
          getAutoTranslatedResultRejectReason(translation, channelId) {
            return receivedMessageFilterRuntime.getAutoTranslatedResultRejectReason(this, translation, channelId);
          }
          getReceivedAutoTranslateSkipReason(originalContentData, channelId) {
            return receivedMessageFilterRuntime.getReceivedAutoTranslateSkipReason(this, originalContentData, channelId);
          }
          getLoadedAutoTranslationInlineStatusText(channelId = null) {
            return loadedTranslationStatusStore.getInlineStatusText(channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId());
          }
          updateInlineLoadedAutoTranslationStatusElements() {
            if (typeof document > "u") return;
            let elements = [];
            try {
              elements = Array.from(document.querySelectorAll(".translator-loaded-status-inline"));
            } catch {
              elements = [];
            }
            for (let element of elements)
              element && element.remove && element.remove();
          }
          isTranslateMasterSwitchVisuallyEnabled(channelId) {
            if (!channelId || !this.isTranslationEnabled(channelId) || typeof document > "u") return !1;
            let buttons = [];
            try {
              let selector = [BDFDB.dotCN && BDFDB.dotCN._translatortranslatebutton, BDFDB.disCN && "." + BDFDB.disCN._translatortranslatebutton].filter(Boolean).join(",");
              buttons = selector ? Array.from(document.querySelectorAll(selector)) : [];
            } catch {
              buttons = [];
            }
            return buttons.length ? buttons.some((button) => button && button.classList && button.classList.contains(BDFDB.disCN._translatortranslating)) : !1;
          }
          positionLoadedAutoTranslationStatusElement(element) {
            loadedStatusPosition.positionLoadedStatusElement({ BDFDB, document: typeof document < "u" ? document : null, window: typeof window < "u" ? window : null, element });
          }
          isChannelTextAreaFocused() {
            return this.ensureMessageViewportStore().isChannelTextAreaFocused();
          }
          ensureLoadedAutoTranslationStatusPositionWatcher() {
            if (!(typeof window > "u" || this._loadedAutoTranslationStatusPositionWatcherAttached)) {
              this._loadedAutoTranslationStatusPositionWatcherAttached = !0, this._loadedAutoTranslationStatusPositionHandler = (_2) => {
                let element = typeof document < "u" && document.getElementById("DiscordAITranslator-loaded-status");
                element && (this._loadedAutoTranslationStatusPositionTimer && clearTimeout(this._loadedAutoTranslationStatusPositionTimer), this._loadedAutoTranslationStatusPositionTimer = setTimeout((_3) => {
                  this._loadedAutoTranslationStatusPositionTimer = null, this.positionLoadedAutoTranslationStatusElement(element);
                }, 80));
              }, window.addEventListener("resize", this._loadedAutoTranslationStatusPositionHandler, { passive: !0 }), window.addEventListener("scroll", this._loadedAutoTranslationStatusPositionHandler, !0);
              try {
                typeof ResizeObserver < "u" && document && document.body && (this._loadedAutoTranslationStatusResizeObserver = new ResizeObserver(this._loadedAutoTranslationStatusPositionHandler), this._loadedAutoTranslationStatusResizeObserver.observe(document.body));
              } catch {
              }
            }
          }
          detachLoadedAutoTranslationStatusPositionWatcher() {
            if (!(typeof window > "u" || !this._loadedAutoTranslationStatusPositionWatcherAttached)) {
              if (this._loadedAutoTranslationStatusPositionWatcherAttached = !1, this._loadedAutoTranslationStatusPositionHandler && (window.removeEventListener("resize", this._loadedAutoTranslationStatusPositionHandler, { passive: !0 }), window.removeEventListener("scroll", this._loadedAutoTranslationStatusPositionHandler, !0)), this._loadedAutoTranslationStatusResizeObserver)
                try {
                  this._loadedAutoTranslationStatusResizeObserver.disconnect();
                } catch {
                }
              this._loadedAutoTranslationStatusResizeObserver = null, this._loadedAutoTranslationStatusPositionTimer && clearTimeout(this._loadedAutoTranslationStatusPositionTimer), this._loadedAutoTranslationStatusPositionTimer = null, this._loadedAutoTranslationStatusPositionHandler = null;
            }
          }
          isTranslatorSettingsSurfaceOpen() {
            if (typeof document > "u") return !1;
            try {
              return !!document.querySelector(".translator-settings-panel-root");
            } catch {
              return !1;
            }
          }
          removeLoadedAutoTranslationStatusElement() {
            let element = typeof document < "u" && document.getElementById("DiscordAITranslator-loaded-status");
            element && element.remove(), this.detachLoadedAutoTranslationStatusPositionWatcher();
          }
          shouldShowLoadedAutoTranslationStatus(status) {
            if (!status || !status.active && !status.done) return !1;
            let selectedChannelId = BDFDB.LibraryStores.SelectedChannelStore.getChannelId(), statusChannelId = status.channelId && status.channelId != "__global" ? status.channelId : selectedChannelId;
            return !statusChannelId || !selectedChannelId || statusChannelId != selectedChannelId || this.getReceivedAutoTranslateScope() != "loaded_messages" ? !1 : this.isTranslationEnabled(statusChannelId);
          }
          updateLoadedAutoTranslationStatus(updates = {}) {
            let currentStatus = loadedTranslationStatusStore.update(updates);
            if (!this.shouldShowLoadedAutoTranslationStatus(currentStatus)) {
              this.removeLoadedAutoTranslationStatusElement();
              return;
            }
            if (loadedTranslationStatusStore.cancelTimers(), typeof document > "u" || !document.body) return;
            this.attachAutoTranslationScrollWatcher(), this.ensureLoadedAutoTranslationStatusPositionWatcher();
            let element = document.getElementById("DiscordAITranslator-loaded-status");
            element || (element = document.createElement("div"), element.id = "DiscordAITranslator-loaded-status", document.body.appendChild(element));
            let retryableCount = Math.max(0, currentStatus.retryable || 0), showRetry = !currentStatus.active && retryableCount > 0, visualPhase = showRetry ? "failed" : currentStatus.phase || (currentStatus.collecting ? "collecting" : currentStatus.done ? "done" : "requesting");
            element.className = `translator-loaded-status-floating translator-loaded-status-${visualPhase}${showRetry ? " translator-loaded-status-retryable" : ""}`, (!element.querySelector(".translator-loaded-status-icon") || !element.querySelector(".translator-loaded-status-text") || element.querySelector(".translator-loaded-status-progress")) && (element.innerHTML = '<span class="translator-loaded-status-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M12.9 15.1 10.8 13l.1-.1a14.7 14.7 0 0 0 3.1-5.4h2.4V5.4h-5.2V3.3H9.1v2.1H3.9v2.1H12a12.5 12.5 0 0 1-2.6 4.1 12.4 12.4 0 0 1-1.9-2.7H5.4a14.8 14.8 0 0 0 2.5 4.1l-4.2 4.1 1.5 1.5 4.2-4.2 2.6 2.7.9-2Zm5.9-3.4h-2.1L12 22.2h2.2l1.2-3.1h4.8l1.2 3.1h2.2l-4.8-10.5Zm-2.6 5.3 1.6-4.2 1.6 4.2h-3.2Z"/></svg></span><span class="translator-loaded-status-text"></span>');
            let textElement = element.querySelector(".translator-loaded-status-text");
            textElement && (textElement.textContent = this.getLoadedAutoTranslationStatusText(currentStatus));
            let retryButton = element.querySelector(".translator-loaded-status-retry");
            showRetry ? (retryButton || (retryButton = document.createElement("button"), retryButton.type = "button", retryButton.className = "translator-loaded-status-retry", element.appendChild(retryButton)), retryButton.textContent = this.isChineseUiLanguage() ? "重试" : "Retry", retryButton.title = this.isChineseUiLanguage() ? `重试 ${retryableCount} 条失败消息` : `Retry ${retryableCount} failed messages`, retryButton.onclick = (event) => {
              event && event.stopPropagation && event.stopPropagation();
              let retryResult = this.retryFailedHistoricalTranslations(currentStatus.channelId);
              retryResult && typeof retryResult.catch == "function" && retryResult.catch((_2) => {
              });
            }) : retryButton && retryButton.remove(), element.title = this.getLoadedAutoTranslationStatusTitleText(currentStatus), this.updateInlineLoadedAutoTranslationStatusElements(), loadedTranslationStatusStore.schedulePosition((_2) => this.positionLoadedAutoTranslationStatusElement(element)), loadedTranslationStatusStore.scheduleRefresh(LOADED_STATUS_REFRESH_MS, () => this.updateLoadedAutoTranslationStatus({})), !currentStatus.active && currentStatus.done && !Math.max(0, currentStatus.displayPending || 0) && !retryableCount && !Math.max(0, currentStatus.failed || currentStatus.aiDropped || 0) && loadedTranslationStatusStore.scheduleHide(LOADED_STATUS_COMPLETION_HIDE_MS, () => this.removeLoadedAutoTranslationStatusElement());
          }
          clearLoadedAutoTranslationStatus() {
            historicalDisplayTracker.clear(), loadedTranslationStatusStore.clear();
            let element = typeof document < "u" && document.getElementById("DiscordAITranslator-loaded-status");
            element && element.remove(), this.detachLoadedAutoTranslationStatusPositionWatcher(), this.updateInlineLoadedAutoTranslationStatusElements();
          }
          scheduleTranslationRerender(options = {}) {
            this.ensureReceivedDisplayRepaintScheduler().scheduleFullRepaint(options);
          }
          flushDeferredTranslationRerender() {
            this.ensureReceivedDisplayRepaintScheduler().flushDeferredFullRepaint();
          }
          getDisplayedTranslationChannelId(messageId) {
            if (!messageId) return null;
            let channelRecord = this.ensureReceivedDisplayRuntime().getDisplayState(messageId), translation = channelRecord && channelRecord.translation;
            if (translation && translation.channelId) return translation.channelId;
            let channelArchive = this.ensureReceivedDisplayRuntime().peekSourceArchive(messageId);
            if (channelArchive && channelArchive.message.channel_id) return channelArchive.message.channel_id;
            let displayView = this.getReceivedDisplayRuntimeView(messageId);
            return displayView && displayView.channelId || null;
          }
          getMessageChannelId(message, fallbackChannelId = null) {
            return message && (message.channel_id || message.channelId) || fallbackChannelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
          }
          createLiveTranslationRequest(message, channelId, originalContentData = null, signature = null) {
            return this.ensureLiveTranslationQueue().createRequest(message, channelId, originalContentData, signature);
          }
          isLiveTranslationRequestCurrent(request, message = null) {
            return this.ensureLiveTranslationQueue().isRequestCurrent(request, message);
          }
          finishLiveTranslationRequest(request) {
            return this.ensureLiveTranslationQueue().finishRequest(request);
          }
          invalidateLiveTranslationRequests(channelId = null) {
            return this.ensureLiveTranslationQueue().invalidateRequests(channelId);
          }
          invalidateLiveTranslationMessage(messageId, channelId, currentSignature) {
            return this.ensureLiveTranslationQueue().invalidateRequestForMessage(messageId, channelId, currentSignature);
          }
          clearAutoTranslationQueue(channelId = null, options = {}) {
            if (this.advanceHistoricalMessageSourceGeneration(channelId), this.cancelHistoricalTranslationJobs(channelId, channelId ? "channel-queue-cleared" : "all-queues-cleared"), this.cancelPendingChannelTitleTranslation(channelId), this.invalidateSentAutomaticTranslationRequests(channelId), this.ensureLiveTranslationQueue().clearQueue(channelId), !channelId) {
              options.preservePreviews || this.ensureReceivedDisplayRuntime().clearPreviews(null), this.ensureReceivedDisplayRuntime().clearPreviewEligibility(null), loadedTranslationStatusStore.resetSeen(null), this.clearLoadedAutoTranslationStatus();
              return;
            }
            options.preservePreviews || this.ensureReceivedDisplayRuntime().clearPreviews(channelId), this.ensureReceivedDisplayRuntime().clearPreviewEligibility(channelId), loadedTranslationStatusStore.resetSeen(channelId), loadedTranslationStatusStore.isForChannel(channelId) && this.clearLoadedAutoTranslationStatus();
          }
          clearDisplayedTranslations(channelId = null) {
            for (let record of this.ensureReceivedDisplayRuntime().listTranslated())
              channelId && this.getDisplayedTranslationChannelId(record.messageId) != channelId || this.clearDisplayedTranslationState(record.messageId);
            this.ensureReceivedDisplayRuntime().clearPreviews(channelId);
          }
          clearDisplayedAutoTranslations(channelId = null, options = {}) {
            for (let record of this.ensureReceivedDisplayRuntime().listTranslated())
              !record.translation || !record.translation.auto && !(options && options.includeManual) || channelId && this.getDisplayedTranslationChannelId(record.messageId) != channelId || this.clearDisplayedTranslationState(record.messageId);
            for (let record of this.ensureReceivedDisplayRuntime().listPreviewed())
              !record.preview || !record.preview.auto || channelId && record.preview.channelId != channelId || this.ensureReceivedDisplayRuntime().clearPreview(record.messageId);
            this.clearChannelTitleTranslations(channelId);
          }
          applyStoredTranslationToMessage(message, translation, originalContentData = null) {
            return translationDisplayLogic.applyStoredTranslationToMessage(this, message, translation, originalContentData);
          }
          getMentionDisplayName(userId, message = null) {
            if (!userId) return null;
            let mentionUsers = message && (message.mentions || message.mentioned_users || message.referencedMessage && message.referencedMessage.mentions);
            if (Array.isArray(mentionUsers)) {
              let mentionUser = mentionUsers.find((user) => user && String(user.id) == String(userId));
              if (mentionUser) return mentionUser.globalName || mentionUser.global_name || mentionUser.displayName || mentionUser.nick || mentionUser.username || mentionUser.name || null;
            }
            try {
              let user = BDFDB.LibraryStores.UserStore && BDFDB.LibraryStores.UserStore.getUser && BDFDB.LibraryStores.UserStore.getUser(userId);
              if (user) return user.globalName || user.global_name || user.displayName || user.username || user.name || null;
            } catch {
            }
            return null;
          }
          restoreDiscordMentionTagsForDisplay(text, message = null) {
            return typeof text != "string" || !text ? text : text.replace(/<@!?(\d+)>/g, (fullMatch, userId) => {
              let displayName = this.getMentionDisplayName(userId, message);
              return displayName ? `@${displayName}` : fullMatch;
            });
          }
          clearDisplayedTranslationState(messageId, options = {}) {
            return translationDisplayLogic.clearDisplayedTranslationState(this, messageId, options);
          }
          getStoredTranslationChannelId(messageId, fallbackChannelId = null, translation = null) {
            return translationDisplayLogic.getStoredTranslationChannelId(this, messageId, fallbackChannelId, translation);
          }
          shouldDisplayStoredTranslation(translation, channelId = null) {
            return translationDisplayLogic.shouldDisplayStoredTranslation(this, translation, channelId);
          }
          getStoredTranslationOriginalContent(translation, fallbackContent = "") {
            return translationDisplayLogic.getStoredTranslationOriginalContent(this, translation, fallbackContent);
          }
          getActiveMessageTranslation(message, channelId = null, expectedSignature = null) {
            return translationDisplayLogic.getActiveMessageTranslation(this, message, channelId, expectedSignature);
          }
          getActiveReplyPreviewTranslation(message, channelId) {
            return translationDisplayLogic.getActiveReplyPreviewTranslation(this, message, channelId);
          }
          isMessageTranslationPending(messageId, channelId = null) {
            return this.isHistoricalMessagePending(messageId, channelId) || this.ensureLiveTranslationQueue().isMessageQueued(messageId);
          }
          applyMessageContentRenderDecorations(e, message, translation) {
            return translationDisplayLogic.applyMessageContentRenderDecorations(this, e, message, translation);
          }
          getReceivedAutoTranslateScope() {
            return loadedAutoTranslatePolicy.getReceivedAutoTranslateScope(this);
          }
          getReceivedAutoTranslateLoadedRangeMode() {
            return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedRangeMode(this);
          }
          getReceivedAutoTranslateLoadedTimeWindow() {
            return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindow(this);
          }
          getReceivedAutoTranslateLoadedLimit() {
            return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedLimit(this);
          }
          shouldPauseLoadedAutoTranslateWhileScrolling() {
            return loadedAutoTranslatePolicy.shouldPauseLoadedAutoTranslateWhileScrolling(this);
          }
          shouldContinueLoadedAutoTranslateOnScroll() {
            return loadedAutoTranslatePolicy.shouldContinueLoadedAutoTranslateOnScroll(this);
          }
          getReceivedAutoTranslateLoadedTimeWindowMs() {
            return loadedAutoTranslatePolicy.getReceivedAutoTranslateLoadedTimeWindowMs(this);
          }
          getMessageTimestampMs(message) {
            if (!message) return null;
            let directTimestamp = (/* @__PURE__ */ __name((value) => {
              if (!value) return null;
              if (value instanceof Date) return value.getTime();
              if (typeof value == "number" && isFinite(value)) return value > 1e12 ? value : value * 1e3;
              if (typeof value == "string") {
                let parsed = Date.parse(value);
                if (isFinite(parsed)) return parsed;
              }
              if (value && value._d instanceof Date) return value._d.getTime();
              if (value && typeof value.valueOf == "function") {
                let primitive = value.valueOf();
                if (typeof primitive == "number" && isFinite(primitive)) return primitive > 1e12 ? primitive : primitive * 1e3;
              }
              return null;
            }, "normalizeTimestamp"))(message.timestamp || message.createdAt || message.created_at);
            if (directTimestamp) return directTimestamp;
            if (message.id)
              try {
                return Number((BigInt(message.id) >> 22n) + BigInt(DISCORD_EPOCH));
              } catch {
              }
            return null;
          }
          isMessageWithinLoadedTimeWindow(message) {
            let windowMs = this.getReceivedAutoTranslateLoadedTimeWindowMs();
            if (!windowMs) return !0;
            let timestampMs = this.getMessageTimestampMs(message);
            return timestampMs ? Date.now() - timestampMs <= windowMs : !0;
          }
          isMessageWithinLoadedRange(message) {
            return this.getReceivedAutoTranslateLoadedRangeMode() == LOADED_AUTO_TRANSLATE_RANGE_MODES.TIME ? this.isMessageWithinLoadedTimeWindow(message) : !0;
          }
          isLikelyLiveAutoTranslateMessage(message, channelId = null) {
            if (!message || !message.id) return !1;
            channelId = channelId || this.getMessageChannelId(message);
            let channelState = this.getAutoTranslationChannelState(channelId);
            return !!(channelState && this.isMessageIdNewer(message.id, channelState.boundaryMessageId));
          }
          shouldDeferInitialAutoTranslate(channelId) {
            if (!channelId || this.getReceivedAutoTranslateScope() == "loaded_messages") return !1;
            let channelState = this.getAutoTranslationChannelState(channelId);
            return !!(channelState && !channelState.initialized);
          }
          attachAutoTranslationInputActivityWatcher() {
            return this.ensureMessageViewportStore().attachInputActivityWatcher();
          }
          detachAutoTranslationInputActivityWatcher() {
            return this.ensureMessageViewportStore().detachInputActivityWatcher();
          }
          finishAutoTranslationScrollActivity(channelId) {
            return this.ensureMessageViewportStore().finishScrollActivity(channelId);
          }
          attachAutoTranslationScrollWatcher() {
            return this.ensureMessageViewportStore().attachScrollWatcher();
          }
          detachAutoTranslationScrollWatcher() {
            return this.ensureMessageViewportStore().detachScrollWatcher();
          }
          isViewingMessageHistory() {
            return this.ensureMessageViewportStore().isViewingMessageHistory();
          }
          isUserActivelyScrollingMessages(channelId = null) {
            return this.ensureMessageViewportStore().isUserActivelyScrolling(channelId);
          }
          // The 429/5xx backoff window belongs to the provider client, which is what
          // opens it. These two delegated to receivedTranslationRuntime, which never
          // defined them, so every call threw.
          scheduleAutoTranslationBackoff(ms) {
            return this.ensureProviderClient().scheduleBackoff(ms);
          }
          awaitProviderBackoff() {
            return this.ensureProviderClient().awaitBackoff();
          }
          requestWithTimeout(url, options, callback, timeoutMs = 3e4) {
            return this.ensureProviderClient().requestWithTimeout(url, options, callback, timeoutMs);
          }
          getReceivedAutoTranslateSourceLanguages() {
            return receivedSettingsPolicy.getReceivedAutoTranslateSourceLanguages(this);
          }
          getMinimumAutoTranslateLength() {
            return receivedSettingsPolicy.getMinimumAutoTranslateLength(this);
          }
          getAutoTranslateMinimumLengthForAnalysis(analysis = null) {
            return receivedSettingsPolicy.getAutoTranslateMinimumLengthForAnalysis(this, analysis);
          }
          getTranslationSimilarityThreshold() {
            return receivedSettingsPolicy.getTranslationSimilarityThreshold(this);
          }
          shouldTreatLanguageVariantsAsSame() {
            return receivedSettingsPolicy.shouldTreatLanguageVariantsAsSame(this);
          }
          shouldSkipMixedReceivedMessages() {
            return receivedSettingsPolicy.shouldSkipMixedReceivedMessages(this);
          }
          shouldSkipSameLanguageReceivedMessages() {
            return receivedSettingsPolicy.shouldSkipSameLanguageReceivedMessages(this);
          }
          useLocalLanguagePrecheck() {
            return receivedSettingsPolicy.useLocalLanguagePrecheck(this);
          }
          shouldDropSimilarTranslations() {
            return receivedSettingsPolicy.shouldDropSimilarTranslations(this);
          }
          getAutoTranslateDecisionMode() {
            return aiDecisionPolicy.getAutoTranslateDecisionMode(this);
          }
          supportsAiAutoTranslateDecisionEngine(engineKey) {
            return aiDecisionPolicy.supportsAiAutoTranslateDecisionEngine(this, engineKey);
          }
          isAiAutoTranslateDecisionAvailable(channelId = null) {
            return aiDecisionPolicy.isAiAutoTranslateDecisionAvailable(this, channelId);
          }
          shouldUseAiAutoTranslateDecision(channelId = null) {
            return aiDecisionPolicy.shouldUseAiAutoTranslateDecision(this, channelId);
          }
          getDefaultAiAutoTranslatePrompt() {
            return `输入语言：{{INPUT_LANGUAGE}}
输出语言：{{OUTPUT_LANGUAGE}}

只翻译消息中不是输出语言的自然语言内容，译成输出语言。已是输出语言的内容保持原样。

短词、语气词、感叹词、笑声、重复词和单独一行仍属于有效聊天内容；只要它们不是输出语言，就必须翻译或按输出语言自然表达。不要因为内容很短而跳过或省略，例如 hi、ok、yes、no。

保留原样：URL、IP、端口、@用户名、频道名、ID、代码、命令、表情、⟦0⟧/⟦1⟧ 等保护占位符。专有名词、产品名、模型名、游戏/技术术语默认保留；若在输出语言中有公认译名或官方译名，可使用该译名。

禁止：把源语言同义改写成源语言；把已是输出语言的内容润色改写；解释原文。

如果没有需要翻译的自然语言，或消息主要已是输出语言且只夹杂专名/缩写/技术词，只输出 __SKIP_TRANSLATION__。
需要翻译时只输出处理后的消息。`;
          }
          getLegacyAiAutoTranslatePrompts() {
            return [
              `任务：判断 Discord 收到消息是否需要翻译；需要时，只翻译非目标语言的自然语言内容。
规则：
1. 消息里存在非目标语言的自然语言内容：只翻译这些内容。
2. 已经是目标语言的内容保持原样，不要重写、润色或改写。
3. 专有名词、产品名、模型名、游戏术语、技术术语、URL、IP、端口、用户名、频道名、ID、代码、命令、表情符号保持原样。
4. {{0}}、{{1}}、{{2}} 等保护占位符必须逐字保留，数量、顺序和位置不能改变。
5. 如果消息只有链接、表情、用户名、数字、代码、命令、IP、端口、占位符，或没有需要翻译的自然语言内容，只输出 __SKIP_TRANSLATION__。
6. 如果消息已经主要是目标语言，且只夹杂专有名词、产品名、英文缩写或技术词，只输出 __SKIP_TRANSLATION__。
输出：需要翻译时只输出处理后的消息；不需要翻译时只输出 __SKIP_TRANSLATION__。不要解释，不要添加注释。`,
              `任务：判断 Discord 收到消息是否需要翻译，并在需要时直接翻译成目标语言。
规则：
1. 主要自然语言已是目标语言：只输出 __SKIP_TRANSLATION__。
2. 只有链接、表情、用户名、频道名、ID、数字、IP、端口、代码、命令或占位符：只输出 __SKIP_TRANSLATION__。
3. 主要自然语言不是目标语言：翻译主要文本。
4. 英文产品名、游戏术语、URL、IP、端口、用户名、表情不是“混合语言跳过”理由，保留即可。
5. {{0}}、{{1}} 等保护占位符必须逐字保留，数量和顺序不能改变。
输出：需要翻译时只输出译文；不需要翻译时只输出 __SKIP_TRANSLATION__。`,
              `你是 Discord 聊天翻译判断器。判断这条收到的消息是否值得翻译成目标语言。
需要翻译：主要内容不是目标语言；即使包含链接、表情、用户名、英文产品名、IP、端口、游戏术语，也不要因此跳过；混合少量英文关键词时，仍然翻译主要外语内容。
不需要翻译：消息已经主要是目标语言；只有链接、表情、数字、代码、用户名；翻译后和原文几乎一样。
保护占位符如 {{0}}、{{1}} 必须原样保留，不要改写。
需要翻译时只输出译文；不需要翻译时只输出 __SKIP_TRANSLATION__。`
            ];
          }
          getLanguagePromptName(languageData) {
            return languageData ? languageData.auto ? this.getCustomText("detect_language_label") || "Auto detect" : [languageData.name, languageData.ownlang, languageData.id].filter(Boolean).join(" / ") : "";
          }
          getAiAutoTranslatePrompt(translationData = null) {
            let customPrompt = this.settings.filters && this.settings.filters.aiAutoTranslatePrompt, prompt = this.getDefaultAiAutoTranslatePrompt();
            if (typeof customPrompt == "string" && customPrompt.trim()) {
              let trimmedPrompt = customPrompt.trim();
              this.getLegacyAiAutoTranslatePrompts().some((legacyPrompt) => trimmedPrompt == legacyPrompt.trim()) || (prompt = customPrompt);
            }
            if (!translationData) return prompt;
            let inputLanguage = this.getLanguagePromptName(translationData.input) || "Auto detect", outputLanguage = this.getLanguagePromptName(translationData.output) || "Target language";
            return prompt.replace(/\{\{INPUT_LANGUAGE\}\}/g, inputLanguage).replace(/\{\{OUTPUT_LANGUAGE\}\}/g, outputLanguage).replace(/\{\{TARGET_LANGUAGE\}\}/g, outputLanguage);
          }
          isSkipTranslationSignal(translation) {
            return typeof translation == "string" && translation.trim().replace(/[。.!！\s]+$/g, "") == AI_SKIP_TRANSLATION_TOKEN;
          }
          getLanguageScriptFamilies(languageId) {
            return languageId = this.normalizeLanguageId(languageId), languageId ? languageId.startsWith("zh") ? ["han"] : languageId == "ja" ? ["han", "kana"] : languageId == "ko" ? ["hangul"] : ["ru", "uk", "bg", "be", "mk", "sr", "kk", "ky", "mn"].includes(languageId) ? ["cyrillic"] : ["ar", "fa", "ur", "ps", "sd", "ug"].includes(languageId) ? ["arabic"] : languageId == "el" ? ["greek"] : ["he", "iw", "yi"].includes(languageId) ? ["hebrew"] : ["hi", "mr", "ne"].includes(languageId) ? ["devanagari"] : languageId == "th" ? ["thai"] : ["latin"] : [];
          }
          countScriptFamilies(text) {
            let counts = {
              han: 0,
              kana: 0,
              hangul: 0,
              cyrillic: 0,
              arabic: 0,
              greek: 0,
              hebrew: 0,
              devanagari: 0,
              thai: 0,
              latin: 0
            };
            for (let character of text || "") {
              let codePoint = character.codePointAt(0);
              codePoint >= 19968 && codePoint <= 40959 ? counts.han++ : codePoint >= 12352 && codePoint <= 12543 || codePoint >= 12784 && codePoint <= 12799 ? counts.kana++ : codePoint >= 44032 && codePoint <= 55215 ? counts.hangul++ : codePoint >= 1024 && codePoint <= 1327 ? counts.cyrillic++ : codePoint >= 1536 && codePoint <= 1791 ? counts.arabic++ : codePoint >= 880 && codePoint <= 1023 ? counts.greek++ : codePoint >= 1424 && codePoint <= 1535 ? counts.hebrew++ : codePoint >= 2304 && codePoint <= 2431 ? counts.devanagari++ : codePoint >= 3584 && codePoint <= 3711 ? counts.thai++ : (codePoint >= 65 && codePoint <= 122 || codePoint >= 192 && codePoint <= 591) && counts.latin++;
            }
            return counts;
          }
          sanitizeTextForAutoTranslateAnalysis(text) {
            return (text || "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\r\n]+`/g, " ").replace(/https?:\/\/\S+/gi, " ").replace(/<a?:\w+:\d+>/g, " ").replace(/<@!?\d+>|<#\d+>|<@&\d+>/g, " ").replace(/\s+/g, " ").trim();
          }
          analyzeTextForAutoTranslate(text, targetLanguageId) {
            let cleanedText = this.sanitizeTextForAutoTranslateAnalysis(text), counts = this.countScriptFamilies(cleanedText), latinWordCount = (cleanedText.match(/[A-Za-z][A-Za-z0-9._+-]*/g) || []).length, hanRunCount = (cleanedText.match(/[\u4E00-\u9FFF]+/g) || []).length, scriptEntries = Object.entries(counts).filter(([, count]) => count > 0).sort((entryA, entryB) => entryB[1] - entryA[1]), totalLetters = scriptEntries.reduce((sum, [, count]) => sum + count, 0), targetFamilies = this.getLanguageScriptFamilies(targetLanguageId), targetLetterCount = targetFamilies.reduce((sum, family) => sum + (counts[family] || 0), 0), nonTargetLetterCount = Math.max(0, totalLetters - targetLetterCount), targetShare = totalLetters ? targetLetterCount / totalLetters : 0, dominantEntry = scriptEntries[0] || ["", 0], secondaryEntry = scriptEntries[1] || ["", 0], dominantShare = totalLetters ? dominantEntry[1] / totalLetters : 0, secondaryShare = totalLetters ? secondaryEntry[1] / totalLetters : 0, isMixed = dominantEntry[1] >= 2 && secondaryEntry[1] >= 2 && dominantShare >= 0.2 && secondaryShare >= 0.2, strongTargetScriptMatch = targetFamilies[0] != "latin" && targetLetterCount >= 3 && targetShare >= 0.65 && (!isMixed || nonTargetLetterCount <= Math.max(2, targetLetterCount * 0.35));
            return {
              cleanedText,
              counts,
              latinWordCount,
              hanRunCount,
              targetFamilies,
              totalLetters,
              targetLetterCount,
              nonTargetLetterCount,
              targetShare,
              dominantFamily: dominantEntry[0] || null,
              isMixed,
              strongTargetScriptMatch
            };
          }
          getLatinStopwordTables() {
            return languageHeuristicsRuntime.getLatinStopwordTables(this);
          }
          identifyLatinLanguage(text) {
            return languageHeuristicsRuntime.identifyLatinLanguage(this, text);
          }
          detectMessageLanguageLocal(text, analysis, targetLanguageId) {
            return languageHeuristicsRuntime.detectMessageLanguageLocal(this, text, analysis, targetLanguageId);
          }
          // Local high-confidence "this message is clearly a foreign language" check. Used by the
          // AI-decision safety net: when AI decision mode returns __SKIP_TRANSLATION__, this lets us
          // override the skip without any network call whenever the script family alone proves the
          // message is foreign (e.g. Latin-script message with a Han/Cyrillic/Arabic target).
          isClearlyForeignLanguageMessage(text, targetLanguageId) {
            return languageHeuristicsRuntime.isClearlyForeignLanguageMessage(this, text, targetLanguageId);
          }
          // Safety-net helper for received auto messages. Returns true when the message is foreign
          // (must be translated). First tier is the zero-network local check; second tier falls back
          // to Google gtx detection (covers latin-vs-latin the local check cannot). If gtx is
          // unreachable, the second tier resolves false so the caller honors the original skip.
          isReceivedMessageForeignAsync(text, targetLanguageId, callback) {
            return foreignLanguageDecisionRuntime.isReceivedMessageForeignAsync(this, text, targetLanguageId, callback);
          }
          isHanTargetMessageWithLatinTerms(analysis, targetLanguageId) {
            return languageHeuristicsRuntime.isHanTargetMessageWithLatinTerms(this, analysis, targetLanguageId);
          }
          isMostlyTargetLanguageMessage(analysis, targetLanguageId) {
            return languageHeuristicsRuntime.isMostlyTargetLanguageMessage(this, analysis, targetLanguageId);
          }
          isClearlyTargetLanguageMessage(analysis, targetLanguageId) {
            return languageHeuristicsRuntime.isClearlyTargetLanguageMessage(this, analysis, targetLanguageId);
          }
          shouldSkipReceivedTranslationBeforeRequest(originalContentData, channelId) {
            return receivedMessageFilterRuntime.shouldSkipReceivedTranslationBeforeRequest(this, originalContentData, channelId);
          }
          isTranslationLikelyInTargetLanguage(text, targetLanguageId) {
            return languageHeuristicsRuntime.isTranslationLikelyInTargetLanguage(this, text, targetLanguageId);
          }
          buildAutoTranslateAnalysisText(originalContentData) {
            return receivedMessageFilterRuntime.buildAutoTranslateAnalysisText(this, originalContentData);
          }
          isLinkOnlyReceivedContent(originalContentData) {
            return receivedMessageFilterRuntime.isLinkOnlyReceivedContent(this, originalContentData);
          }
          normalizeComparisonText(text) {
            return textSimilarityRuntime.normalizeComparisonText(this, text);
          }
          getTextSimilarityScore(textA, textB) {
            return textSimilarityRuntime.getTextSimilarityScore(this, textA, textB);
          }
          isSameLanguageOrVariant(languageA, languageB) {
            if (!languageA || !languageB) return !1;
            let normalizedA = this.normalizeLanguageId(languageA), normalizedB = this.normalizeLanguageId(languageB);
            if (normalizedA == normalizedB) return !0;
            if (!this.shouldTreatLanguageVariantsAsSame()) return !1;
            let rootA = normalizedA.split("-")[0], rootB = normalizedB.split("-")[0];
            return rootA && rootA == rootB;
          }
          isTranslationResultTooSimilar(translation) {
            return receivedMessageFilterRuntime.isTranslationResultTooSimilar(this, translation);
          }
          shouldKeepAutoTranslatedResult(translation, channelId) {
            return receivedMessageFilterRuntime.shouldKeepAutoTranslatedResult(this, translation, channelId);
          }
          shouldAutoTranslateReceivedMessage(message, channel, originalContentData = null, ignoreQueued = !1) {
            return receivedMessageFilterRuntime.shouldAutoTranslateReceivedMessage(this, message, channel, originalContentData, ignoreQueued);
          }
          queueAutoTranslateMessage(message, channel, originalContentData = null, queueOptions = {}) {
            return this.ensureLiveTranslationQueue().queueMessage(message, channel, originalContentData, queueOptions);
          }
          createStoredReceivedTranslationData(message, channelId, originalContentData, signature, translation, input, output, auto = !1) {
            if (!translation) return null;
            let strings = String(translation).split(/\n{0,1}__________________ __________________ __________________\n{0,1}/), oldContent = (originalContentData && originalContentData.content || "").trim(), translatedContent = (strings.shift() || "").trim(), embeds = parseStoredEmbedTranslations({ messageEmbeds: message && message.embeds, originalEmbeds: originalContentData && originalContentData.embeds, segments: strings });
            if (!translatedContent && !Object.keys(embeds).length) return null;
            let content = this.buildReceivedDisplayContent(translatedContent, oldContent);
            return {
              signature,
              channelId,
              auto: !!auto,
              content,
              translatedContent,
              originalContent: oldContent,
              embeds,
              input,
              output
            };
          }
          cloneHistoricalSourceMessage(message) {
            if (!message) return null;
            let clone = new BDFDB.DiscordObjects.Message(message);
            return clone.embeds = (message.embeds || []).map((embed) => Object.assign({}, embed, { fields: (embed.fields || []).map((field) => Object.assign({}, field)), footer: embed.footer ? Object.assign({}, embed.footer) : embed.footer })), clone.attachments = (message.attachments || []).map((attachment) => Object.assign({}, attachment)), clone.author = message.author ? Object.assign({}, message.author) : message.author, clone;
          }
          buildInitialHistoricalTranslationSnapshot({ channelId, generation, renderedMessages = [], limit = 0 } = {}) {
            return this.ensureHistoricalSourceRuntime().buildInitialHistoricalTranslationSnapshot({ channelId, generation, renderedMessages, limit });
          }
          createHistoricalTranslationRetrySnapshot(item, channelId) {
            return !item || !item.message || !item.message.id || !channelId ? null : { message: this.cloneHistoricalSourceMessage(item.message), channel: Object.assign({}, item.channel || {}, { id: channelId }), originalContentData: this.cloneOriginalContentData(item.originalContentData || this.extractOriginalContentData(item.message)), historicalLoad: !0, deferWhileReading: !0, reason: item.reason || "provider_failed" };
          }
          updateFailedHistoricalTranslationSnapshots(summary, channelId) {
            if (!channelId) return 0;
            let existingEntry = this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId), snapshotsById = new Map((existingEntry && existingEntry.items || []).map((item) => [String(item.message.id), item]));
            for (let item of [].concat(summary && summary.translated || [], summary && summary.skipped || []))
              item && item.message && item.message.id && snapshotsById.delete(String(item.message.id));
            for (let item of summary && summary.failed || []) {
              let snapshot = this.createHistoricalTranslationRetrySnapshot(item, channelId);
              snapshot && snapshotsById.set(String(snapshot.message.id), snapshot);
            }
            let items = [...snapshotsById.values()];
            return items.length ? this.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, { channelId, items, updatedAt: Date.now() }) : this.ensureHistoricalJobRegistry().deleteFailedSnapshot(channelId), items.length;
          }
          getFailedHistoricalTranslationCount(channelId) {
            let entry = channelId && this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId);
            return entry && entry.items ? entry.items.length : 0;
          }
          retryFailedHistoricalTranslations(channelId = null) {
            channelId = channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
            let failedEntry = channelId && this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId);
            if (!failedEntry || !failedEntry.items || !failedEntry.items.length || !this.isTranslationEnabled(channelId)) return Promise.resolve(!1);
            let queueEntry = this.getHistoricalTranslationJobQueue(channelId, !1);
            if (queueEntry && (queueEntry.runningPromise || queueEntry.jobs.some((job) => job && job.state == "collecting"))) return Promise.resolve(!1);
            let retryItems = failedEntry.items.slice(0, this.getReceivedAutoTranslateLoadedLimit());
            this.updateLoadedAutoTranslationStatus({
              active: !0,
              collecting: !0,
              done: !1,
              channelId,
              batch: loadedTranslationStatusStore.getNextBatchNumber(channelId),
              total: retryItems.length,
              processed: 0,
              displayed: 0,
              skipped: 0,
              failed: 0,
              retryable: this.getFailedHistoricalTranslationCount(channelId),
              aiDropped: 0
            });
            let accepted = 0;
            for (let item of retryItems) this.collectHistoricalTranslationMessage(item) && accepted++;
            if (!accepted) {
              let failedCount = this.getFailedHistoricalTranslationCount(channelId);
              return this.updateLoadedAutoTranslationStatus({ active: !1, collecting: !1, done: !0, channelId, failed: 0, retryable: failedCount, aiDropped: 0 }), Promise.resolve(!1);
            }
            return Promise.resolve(this.startCollectedHistoricalTranslationJobs(channelId)).then((_2) => !0);
          }
          getHistoricalTranslationJobQueue(channelId, create = !0) {
            return this.ensureHistoricalJobRegistry().getQueue(channelId, create);
          }
          createCollectedHistoricalTranslationJob(channelId) {
            let entry = this.getHistoricalTranslationJobQueue(channelId);
            entry.generation++;
            let job;
            return job = this.createHistoricalTranslationJob({
              id: this.ensureHistoricalJobRegistry().nextJobId(channelId),
              channelId,
              generation: entry.generation,
              configurationSignature: this.createHistoricalTranslationJobConfigurationSignature(channelId),
              repairBatchSize: 10,
              dependencies: {
                prepare: /* @__PURE__ */ __name((source) => this.prepareHistoricalTranslationJobItem(source, job), "prepare"),
                translateBatch: /* @__PURE__ */ __name((preparedItems) => this.translateHistoricalTranslationJobBatch(preparedItems, job), "translateBatch"),
                repairBatch: /* @__PURE__ */ __name((preparedItems) => this.repairHistoricalTranslationJobBatch(preparedItems, job), "repairBatch"),
                validate: /* @__PURE__ */ __name((prepared, rawTranslation) => this.validateHistoricalTranslationJobResult(prepared, rawTranslation, job), "validate"),
                repair: /* @__PURE__ */ __name((prepared) => this.repairHistoricalTranslationJobItem(prepared, job), "repair"),
                waitForCommit: /* @__PURE__ */ __name(() => this.waitForHistoricalTranslationCommit(job), "waitForCommit"),
                isCurrent: /* @__PURE__ */ __name(() => this.isHistoricalTranslationJobCurrent(job), "isCurrent"),
                commit: /* @__PURE__ */ __name((summary) => this.commitHistoricalTranslationJob(summary, job), "commit"),
                onStateChange: /* @__PURE__ */ __name(() => this.updateHistoricalTranslationJobStatus(job), "onStateChange")
              }
            }), entry.jobs.push(job), job;
          }
          collectHistoricalTranslationMessage(queueItem) {
            if (!queueItem || !queueItem.message || !queueItem.channel || !queueItem.channel.id) return !1;
            let channelId = queueItem.channel.id;
            if (!this.isTranslationEnabled(channelId)) return !1;
            let entry = this.getHistoricalTranslationJobQueue(channelId);
            if (entry.intakeBlocked) return !1;
            let job = entry.jobs[entry.jobs.length - 1];
            if (job && job.state == "collecting" && !job.sealed && job.items.size >= this.getReceivedAutoTranslateLoadedLimit() || ((!job || job.state != "collecting" || job.sealed) && (job = this.createCollectedHistoricalTranslationJob(channelId)), !job.add(queueItem))) return !1;
            if (this.ensureLiveTranslationQueue().markMessageQueued(queueItem.message.id, { type: "historical", channelId, jobId: job.id }), job.items.size >= this.getReceivedAutoTranslateLoadedLimit()) {
              entry.intakeBlocked = !0, this.finishHistoricalTranslationSnapshot(channelId);
              let reopen = /* @__PURE__ */ __name(() => {
                this.ensureHistoricalJobRegistry().isCurrentQueue(channelId, entry) && (entry.intakeBlocked = !1);
              }, "reopen");
              typeof queueMicrotask == "function" ? queueMicrotask(reopen) : Promise.resolve().then(reopen);
            } else queueItem.deferHistoricalSnapshotStart || this.scheduleHistoricalTranslationJobStart(channelId);
            return !0;
          }
          scheduleHistoricalTranslationJobStart(channelId) {
            let entry = this.getHistoricalTranslationJobQueue(channelId, !1);
            if (!entry || entry.startToken) return;
            let token = {};
            entry.startToken = token;
            let startSnapshot = /* @__PURE__ */ __name((_2) => {
              entry.startToken !== token || !this.ensureHistoricalJobRegistry().isCurrentQueue(channelId, entry) || (entry.startToken = null, this.finishHistoricalTranslationSnapshot(channelId));
            }, "startSnapshot");
            typeof queueMicrotask == "function" ? queueMicrotask(startSnapshot) : Promise.resolve().then(startSnapshot);
          }
          finishHistoricalTranslationSnapshot(channelId) {
            let entry = this.getHistoricalTranslationJobQueue(channelId, !1);
            if (!entry) return !1;
            let job = [...entry.jobs].reverse().find((candidate) => candidate && candidate.state == "collecting" && !candidate.sealed);
            return job ? (job.seal(), !entry.runningPromise && !entry.pendingLiveHandoffTicket && this.startCollectedHistoricalTranslationJobs(channelId, { sealCurrent: !1 }), !0) : !1;
          }
          startCollectedHistoricalTranslationJobs(channelId, options = {}) {
            let entry = this.getHistoricalTranslationJobQueue(channelId, !1);
            if (!entry) return Promise.resolve(null);
            let config = Object.assign({ sealCurrent: !0 }, options);
            if (entry.startToken = null, entry.runningPromise || entry.pendingLiveHandoffTicket) return entry.runningPromise || Promise.resolve(null);
            let job = entry.jobs.find((candidate) => candidate && candidate.state == "collecting" && candidate.sealed);
            if (!job && config.sealCurrent && (job = entry.jobs.find((candidate) => candidate && candidate.state == "collecting"), job && job.seal()), !job) return Promise.resolve(null);
            job.lastConsumedLiveRequestTicketAtStart = this.ensureLiveTranslationQueue().getLastConsumedLiveRequestTicket(channelId);
            let runningPromise = Promise.resolve(job.start()).finally((_2) => {
              for (let record of job.items.values()) {
                let messageId = record && record.source && record.source.message && record.source.message.id, queuedMarker = messageId && this.ensureLiveTranslationQueue().getQueuedMarker(messageId);
                queuedMarker && queuedMarker.type == "historical" && queuedMarker.jobId == job.id && this.ensureLiveTranslationQueue().clearQueuedMessage(messageId);
              }
              if (entry.runningPromise == runningPromise && (entry.runningPromise = null), entry.jobs = entry.jobs.filter((candidate) => candidate != job), entry.jobs.some((candidate) => candidate && candidate.state == "collecting" && candidate.sealed)) {
                let liveQueue = this.ensureLiveTranslationQueue(), consumedTicket = liveQueue.getLastConsumedLiveRequestTicket(channelId);
                if (consumedTicket && consumedTicket != job.lastConsumedLiveRequestTicketAtStart)
                  entry.pendingLiveHandoffTicket = null, this.startCollectedHistoricalTranslationJobs(channelId, { sealCurrent: !1 });
                else {
                  let pendingTicket = liveQueue.reserveQueuedLiveRequest(channelId);
                  pendingTicket ? entry.pendingLiveHandoffTicket = pendingTicket : (entry.pendingLiveHandoffTicket = null, this.startCollectedHistoricalTranslationJobs(channelId, { sealCurrent: !1 }));
                }
              } else !entry.jobs.length && !entry.startToken && this.ensureHistoricalJobRegistry().isCurrentQueue(channelId, entry) && this.ensureHistoricalJobRegistry().deleteQueue(channelId);
            });
            return entry.runningPromise = runningPromise, runningPromise;
          }
          async waitForHistoricalTranslationJobs(channelId) {
            for (; ; ) {
              let entry = this.getHistoricalTranslationJobQueue(channelId, !1);
              if (!entry || (!entry.runningPromise && entry.jobs.length && !entry.pendingLiveHandoffTicket && this.startCollectedHistoricalTranslationJobs(channelId), !entry.runningPromise)) return;
              await entry.runningPromise;
            }
          }
          isHistoricalMessagePending(messageId, channelId = null) {
            return messageId ? (channelId ? [this.getHistoricalTranslationJobQueue(channelId, !1)].filter(Boolean) : this.ensureHistoricalJobRegistry().listQueues()).some((entry) => entry.jobs.some((job) => job.isMessagePending(messageId))) : !1;
          }
          invalidateHistoricalTranslationMessage(messageId, channelId, currentSignature) {
            if (!messageId || !channelId || !currentSignature) return !1;
            let entry = this.getHistoricalTranslationJobQueue(channelId, !1), invalidated = !1;
            for (let job of entry && entry.jobs || []) {
              let record = job && job.items.get(String(messageId));
              if (!record || record.status == "cancelled") continue;
              let source = record.source || {};
              (record.prepared && record.prepared.signature || this.createReceivedTranslationSignature(source.message, channelId, source.originalContentData)) != currentSignature && job.invalidateMessage(messageId, "source-edited") && (invalidated = !0);
            }
            let failedEntry = this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId);
            if (failedEntry && failedEntry.items) {
              let nextItems = failedEntry.items.filter((item) => !item || !item.message || String(item.message.id) != String(messageId) || this.createReceivedTranslationSignature(item.message, channelId, item.originalContentData) == currentSignature ? !0 : (invalidated = !0, !1));
              nextItems.length ? this.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, Object.assign({}, failedEntry, { items: nextItems })) : this.ensureHistoricalJobRegistry().deleteFailedSnapshot(channelId);
            }
            if (invalidated) {
              this.ensureLiveTranslationQueue().clearQueuedMessage(messageId), this.clearCachedTranslation(messageId);
              let repairStatus = loadedTranslationStatusStore.getStatus();
              if (repairStatus.channelId == channelId && repairStatus.done) {
                let failedCount = this.getFailedHistoricalTranslationCount(channelId), visibleFailedCount = Math.min(repairStatus.failed || 0, failedCount);
                this.updateLoadedAutoTranslationStatus({ failed: visibleFailedCount, retryable: failedCount, aiDropped: visibleFailedCount });
              }
            }
            return invalidated;
          }
          cancelHistoricalTranslationJobs(channelId = null, reason = "cancelled") {
            let entries = channelId ? [this.getHistoricalTranslationJobQueue(channelId, !1)].filter(Boolean) : this.ensureHistoricalJobRegistry().listQueues();
            for (let entry of entries) {
              entry.generation++, this.ensureLiveTranslationQueue().clearReservedLiveRequest(entry.channelId, entry.pendingLiveHandoffTicket), entry.startToken = null, entry.pendingLiveHandoffTicket = null;
              for (let job of entry.jobs) {
                job.cancel(reason);
                for (let record of job.items.values()) record.source && record.source.message && this.ensureLiveTranslationQueue().clearQueuedMessage(record.source.message.id);
              }
              entry.jobs = [], channelId && this.ensureHistoricalJobRegistry().deleteQueue(channelId);
            }
            channelId || this.ensureHistoricalJobRegistry().clearQueues(), this.ensureHistoricalJobRegistry().advanceRuntimeGeneration();
          }
          prepareHistoricalTranslationJobItem(queueItem, job) {
            if (!queueItem || !queueItem.message || !this.isHistoricalTranslationJobCurrent(job)) return { status: "failed", reason: "stale_job" };
            let channelId = job.channelId, input = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId)) || {}), output = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId)) || {}), prepared = this.prepareHistoricalAiBatchQueueItem(queueItem, channelId, input, output);
            return prepared ? prepared.cachedTranslation ? { status: "translated", translation: Object.assign({ channelId, auto: !0 }, prepared.cachedTranslation) } : prepared.skipped ? { status: "skipped", reason: prepared.skipReason || "local_guard" } : { status: "pending", prepared } : { status: "failed", reason: "prepare_failed" };
          }
          translateHistoricalTranslationJobBatch(preparedItems, job) {
            if (!preparedItems.length || !this.isHistoricalTranslationJobCurrent(job)) return Promise.resolve(null);
            let engineKey = this.getHistoricalAiBatchEngineKey(job.channelId);
            return engineKey ? runChunkedHistoricalBatch({ preparedItems, requestChunk: /* @__PURE__ */ __name((chunk) => this.requestAiBatchTranslationDetailed(engineKey, chunk), "requestChunk"), isCurrent: /* @__PURE__ */ __name(() => this.isHistoricalTranslationJobCurrent(job), "isCurrent"), onChunkSettled: /* @__PURE__ */ __name((progress) => this.updateLoadedAutoTranslationStatus({ channelId: job.channelId, processed: progress.answered }), "onChunkSettled") }) : Promise.resolve(null);
          }
          repairHistoricalTranslationJobBatch(preparedItems, job) {
            if (!preparedItems.length || !this.isHistoricalTranslationJobCurrent(job)) return Promise.resolve(null);
            let engineKey = this.getHistoricalAiBatchEngineKey(job.channelId);
            return engineKey ? this.awaitProviderBackoff().then((_2) => this.isHistoricalTranslationJobCurrent(job) ? this.requestAiBatchTranslationDetailed(engineKey, preparedItems) : null) : Promise.resolve(null);
          }
          validateHistoricalTranslationJobResult(prepared, rawTranslation, job) {
            if (!prepared || rawTranslation == null || String(rawTranslation).trim() === "") return { ok: !1 };
            if (this.isSkipTranslationSignal(rawTranslation)) return { ok: !1, skipped: !0, reason: "ai_skip_signal" };
            let translatedText = String(rawTranslation).replace(/\[NEWLINE\]/g, `
`).trim();
            if (!this.hasAllProtectionPlaceholders(translatedText, prepared.exceptions)) return { ok: !1 };
            if (translatedText = this.addExceptions(translatedText, prepared.exceptions), !this.isTranslationLikelyInTargetLanguage(translatedText, prepared.output && prepared.output.id)) return { ok: !1 };
            let storedTranslation = this.createStoredReceivedTranslationData(prepared.message, job.channelId, prepared.originalContentData, prepared.signature, translatedText, prepared.input, prepared.output, !0);
            return !storedTranslation || !this.shouldKeepAutoTranslatedResult(storedTranslation, job.channelId) || this.isTranslationResultTooSimilar(storedTranslation) ? { ok: !1 } : { ok: !0, translation: storedTranslation };
          }
          repairHistoricalTranslationJobItem(prepared, job) {
            return new Promise((resolve) => {
              if (!prepared || !prepared.message || !this.isHistoricalTranslationJobCurrent(job)) return resolve({ status: "failed", reason: "stale_job" });
              let requestText = this.buildTranslationRequestText(prepared.originalContentData);
              this.awaitProviderBackoff().then((_2) => {
                if (!this.isHistoricalTranslationJobCurrent(job)) return resolve({ status: "failed", reason: "stale_job" });
                this.translateText(requestText, messageTypes.RECEIVED, (translation, input, output, meta = {}) => {
                  if (!this.isHistoricalTranslationJobCurrent(job)) return resolve({ status: "failed", reason: "stale_job" });
                  if (!translation) return resolve({ status: meta.skipped ? "skipped" : "failed", reason: meta.skipped ? "same_language" : "provider_failed" });
                  let storedTranslation = this.createStoredReceivedTranslationData(prepared.message, job.channelId, prepared.originalContentData, prepared.signature, translation, input, output, !0), rejectReason = storedTranslation && this.getAutoTranslatedResultRejectReason(storedTranslation, job.channelId);
                  if (!storedTranslation || rejectReason || this.isTranslationResultTooSimilar(storedTranslation)) return resolve({ status: "skipped", reason: rejectReason || "too_similar" });
                  resolve({ status: "translated", translation: storedTranslation });
                }, null, { showToast: !1, showFailureToast: !1, trackBusy: !1, auto: !0, forcePlainTranslation: !0, channelId: job.channelId });
              });
            });
          }
          waitForHistoricalTranslationCommit(job) {
            return Promise.resolve();
          }
          createHistoricalTranslationJobConfigurationSignature(channelId) {
            return this.createReceivedTranslationSignature(null, channelId, { content: "", embeds: [] });
          }
          isHistoricalTranslationJobCurrent(job) {
            if (!job || !pluginRuntimeActive || !this.isTranslationEnabled(job.channelId) || job.configurationSignature && job.configurationSignature != this.createHistoricalTranslationJobConfigurationSignature(job.channelId)) return !1;
            let entry = this.getHistoricalTranslationJobQueue(job.channelId, !1);
            return !!entry && entry.jobs.includes(job) && job.state != "cancelled";
          }
          isHistoricalTranslationJobItemCurrent(item, job) {
            if (!item || !item.message || !job || !job.channelId) return !1;
            let racingDisplayView = this.getReceivedDisplayRuntimeView(item.message.id);
            if (racingDisplayView && (racingDisplayView.translated || racingDisplayView.showLoading)) return !1;
            let currentMessage = null;
            try {
              let messageStore = BDFDB.LibraryStores && BDFDB.LibraryStores.MessageStore;
              messageStore && typeof messageStore.getMessage == "function" && (currentMessage = messageStore.getMessage(job.channelId, item.message.id));
            } catch {
            }
            currentMessage = currentMessage || item.message;
            let expectedContentData = item.originalContentData || this.extractOriginalContentData(item.message), currentContentData = this.extractOriginalContentData(currentMessage);
            return this.createReceivedTranslationSignature(item.message, job.channelId, expectedContentData) == this.createReceivedTranslationSignature(currentMessage, job.channelId, currentContentData);
          }
          async commitHistoricalTranslationJob(summary, job) {
            if (!this.isHistoricalTranslationJobCurrent(job)) return;
            summary.translated = summary.translated.filter((item) => this.isHistoricalTranslationJobItemCurrent(item, job)), summary.skipped = summary.skipped.filter((item) => this.isHistoricalTranslationJobItemCurrent(item, job)), summary.failed = summary.failed.filter((item) => this.isHistoricalTranslationJobItemCurrent(item, job));
            let generation = this.getReceivedDisplayCommitGeneration(job.channelId), getRecordRequestIdentity = /* @__PURE__ */ __name((messageId) => {
              let recordView = this.getReceivedDisplayRuntimeView(messageId);
              return recordView && recordView.requestIdentity != null ? recordView.requestIdentity : null;
            }, "getRecordRequestIdentity"), results = [];
            for (let item of summary.translated) {
              if (!item || !item.message || !item.translation) continue;
              let storedTranslation = this.refreshTranslationDisplay(Object.assign({ channelId: job.channelId, auto: !0 }, item.translation));
              results.push({
                messageId: item.message.id,
                channelId: job.channelId,
                generation,
                sourceSignature: storedTranslation.signature != null ? String(storedTranslation.signature) : this.createReceivedTranslationSignature(item.message, job.channelId, item.originalContentData),
                requestIdentity: getRecordRequestIdentity(item.message.id),
                origin: "automatic",
                status: "translated",
                source: { content: item.originalContentData && item.originalContentData.content || "", embeds: item.originalContentData && item.originalContentData.embeds || [] },
                translation: storedTranslation
              }), this.persistTranslationCacheEntry(item.message.id, storedTranslation.signature, storedTranslation), this.ensureLiveTranslationQueue().clearQueuedMessage(item.message.id);
            }
            for (let item of summary.skipped) {
              if (!item || !item.message) continue;
              let signature = this.createReceivedTranslationSignature(item.message, job.channelId, item.originalContentData);
              this.persistReceivedSkipDecision(item.message.id, signature, item.reason || "local_guard", this.buildTranslationRequestText(item.originalContentData || {})), results.push({ messageId: item.message.id, channelId: job.channelId, generation, sourceSignature: signature, source: { content: item.originalContentData && item.originalContentData.content || "", embeds: item.originalContentData && item.originalContentData.embeds || [] }, requestIdentity: getRecordRequestIdentity(item.message.id), origin: "automatic", status: "skipped", reason: item.reason || "local_guard" }), this.ensureLiveTranslationQueue().clearQueuedMessage(item.message.id);
            }
            for (let item of summary.failed)
              !item || !item.message || (results.push({ messageId: item.message.id, channelId: job.channelId, generation, sourceSignature: this.createReceivedTranslationSignature(item.message, job.channelId, item.originalContentData), source: { content: item.originalContentData && item.originalContentData.content || "", embeds: item.originalContentData && item.originalContentData.embeds || [] }, requestIdentity: getRecordRequestIdentity(item.message.id), origin: "automatic", status: "failed", reason: item.reason || "provider_failed" }), this.ensureLiveTranslationQueue().clearQueuedMessage(item.message.id));
            let batchOutcome = null;
            if (results.length)
              try {
                batchOutcome = await this.commitHistoricalReceivedDisplayBatch(results);
              } catch {
                batchOutcome = null;
              }
            let failedCount = this.updateFailedHistoricalTranslationSnapshots(summary, job.channelId), blockedIds = new Set([].concat(batchOutcome && batchOutcome.missingIds || [], batchOutcome && batchOutcome.retryIds || [], batchOutcome && batchOutcome.rejectedIds || [], batchOutcome && batchOutcome.staleIds || []).map(String)), displayReadyIds = new Set([].concat(batchOutcome && batchOutcome.confirmedIds || [], batchOutcome && batchOutcome.deferredIds || []).map(String).filter((messageId) => !blockedIds.has(messageId))), displayed = summary.translated.filter((item) => item && item.message && displayReadyIds.has(String(item.message.id))).length, liveDisplayed = [...job.items.keys()].filter((messageId) => {
              let liveView = this.getReceivedDisplayRuntimeView(String(messageId));
              return liveView && liveView.translated && !displayReadyIds.has(String(messageId));
            }).length, displayPending = historicalDisplayTracker.begin({ channelId: job.channelId, batchKey: job.id, outcome: batchOutcome, displayed, displayableIds: summary.translated.map((item) => item && item.message && String(item.message.id)).filter(Boolean), schedule: /* @__PURE__ */ __name((messageId, trackingKey) => this.scheduleReceivedDisplayFlush(job.channelId, messageId, null, trackingKey), "schedule") });
            this.updateLoadedAutoTranslationStatus({ active: !1, collecting: !1, done: !0, channelId: job.channelId, total: job.items.size, processed: job.items.size, displayed: displayed + liveDisplayed, displayPending, skipped: summary.skipped.length, failed: summary.failed.length, retryable: failedCount, aiDropped: summary.failed.length });
          }
          updateHistoricalTranslationJobStatus(job) {
            if (!job || !job.channelId || job.state == "committed") return;
            let records = [...job.items.values()], retainedFailedCount = this.getFailedHistoricalTranslationCount(job.channelId), currentFailedCount = records.filter((record) => record.status == "failed").length;
            this.updateLoadedAutoTranslationStatus({ active: job.state != "cancelled", collecting: job.state == "collecting", done: !1, channelId: job.channelId, total: records.length, processed: records.filter((record) => HISTORICAL_TERMINAL_ITEM_STATES.has(record.status)).length, displayed: 0, skipped: records.filter((record) => record.status == "skipped").length, failed: currentFailedCount, retryable: retainedFailedCount, aiDropped: currentFailedCount });
          }
          getHistoricalAiBatchItemLimit(channelId = null) {
            return Math.max(LOADED_AUTO_TRANSLATE_LIMIT_MIN, Math.min(HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX, this.getReceivedAutoTranslateLoadedLimit()));
          }
          getHistoricalAiBatchEngineKey(channelId = null) {
            let engineKey = this.getEffectivePrimaryEngine(channelId);
            if (!["deepseek", "openai", "gemini", "oaicompat"].includes(engineKey)) return null;
            let input = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId)) || {}), output = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId)) || {});
            return !input.id || !output.id || output.special ? null : this.validTranslator(engineKey, input, output, null) ? engineKey : null;
          }
          prepareHistoricalAiBatchQueueItem(queueItem, channelId, input, output) {
            if (!queueItem || !queueItem.message || !queueItem.message.id) return null;
            if (queueItem.cachedTranslation) return { queueItem, cachedTranslation: queueItem.cachedTranslation };
            let cachedSkipDecision = this.getCachedReceivedSkipDecision(queueItem.message, channelId, queueItem.originalContentData);
            if (cachedSkipDecision) return { queueItem, skipped: !0, skipReason: cachedSkipDecision.reason, skipPreview: cachedSkipDecision.preview };
            if (!this.shouldAutoTranslateReceivedMessage(queueItem.message, queueItem.channel, queueItem.originalContentData, !0)) return { queueItem, skipped: !0 };
            let originalContentData = queueItem.originalContentData || this.extractOriginalContentData(queueItem.message), rawText = this.buildTranslationRequestText(originalContentData), [protectedText, exceptions, shouldTranslate] = this.removeExceptions((rawText || "").trim(), messageTypes.RECEIVED);
            return !shouldTranslate || !protectedText ? { queueItem, skipped: !0 } : {
              queueItem,
              message: queueItem.message,
              channelId,
              originalContentData,
              signature: this.createReceivedTranslationSignature(queueItem.message, channelId, originalContentData),
              protectedText,
              exceptions,
              input,
              output
            };
          }
          parseAiBatchTranslationResponse(content, expectedIds = null) {
            return this.ensureProviderClient().parseAiBatchTranslationResponse(content, expectedIds);
          }
          requestAiBatchTranslation(engineKey, preparedItems) {
            return this.ensureProviderClient().requestAiBatchTranslation(engineKey, preparedItems);
          }
          requestAiBatchTranslationDetailed(engineKey, preparedItems) {
            return Object.prototype.hasOwnProperty.call(this, "requestAiBatchTranslation") ? this.requestAiBatchTranslation(engineKey, preparedItems) : this.ensureProviderClient().requestAiBatchTranslationDetailed(engineKey, preparedItems);
          }
          processAutoTranslationQueue() {
            return this.ensureLiveTranslationQueue().processQueue();
          }
          resumeQueuedHistoricalTranslationJobs(channelId = null, handoffTicket = null, options = {}) {
            return resumeHistoricalHandoff(this, channelId, handoffTicket, options);
          }
          forceUpdateAll() {
            this.ensureSettingsStore().reload(), this.ensureTranslationCacheStore().loadPersisted(), this.ensureReceivedDisplayRuntime().clearAllSuppression(), this.clearAutoTranslationQueue(), this.resetAutoTranslationTracking(), this.clearLoadedAutoTranslationStatus(), this.ensureLiveTranslationQueue().setLiveAutoTranslating(!1), this.ensureReceivedDisplayRuntime().clearPreviews(null), this.ensureReceivedDisplayRepaintScheduler().cancelFullRepaintTimers(), this.setLanguages(), BDFDB.PatchUtils.forceAllUpdates(this), BDFDB.MessageUtils.rerenderAll();
          }
          onMessageContextMenu(e) {
            if (e.instance.props.message && e.instance.props.channel) {
              let translated = this.isMessageDisplayTranslated(e.instance.props.message, e.instance.props.channel.id), hint = BDFDB.BDUtils.isPluginEnabled("MessageUtilities") ? BDFDB.BDUtils.getPlugin("MessageUtilities").getActiveShortcutString("__Translate_Message") : null, [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, { id: ["copy-text", "pin", "unpin"] });
              index == -1 && ([children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, { id: ["edit", "add-reaction", "add-reaction-1", "quote"] })), children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
                label: translated ? this.labels.context_messageuntranslateoption : this.labels.context_messagetranslateoption,
                id: BDFDB.ContextMenuUtils.createItemId(this.name, translated ? "untranslate-message" : "translate-message"),
                icon: /* @__PURE__ */ __name((_2) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
                  icon: translated ? translateIconUntranslate : translateIcon
                }), "icon"),
                action: /* @__PURE__ */ __name((_2) => this.translateMessage(e.instance.props.message, e.instance.props.channel, { manual: !0, independentOfTextAreaSwitch: !0, trackBusy: !1 }), "action")
              })), this.injectMessageLanguageActions(children, index > -1 ? index + 1 : 0, e.instance.props.message, e.instance.props.channel), this.injectSearchItem(e, !1, e.instance.props.channel.id);
            }
          }
          onTextAreaContextMenu(e) {
            this.injectSearchItem(e, !0);
          }
          injectSearchItem(e, ownMessage, channelId = null) {
            let text = document.getSelection().toString();
            if (text) {
              let translating, foundTranslation, foundInput, foundOutput, copied, [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, { id: ["devmode-copy-id", "search-google"], group: !0 });
              children.splice(index > -1 ? index + 1 : 0, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuGroup, {
                children: BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
                  id: BDFDB.ContextMenuUtils.createItemId(this.name, "search-translation"),
                  icon: /* @__PURE__ */ __name((_2) => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.MenuItems.MenuIcon, {
                    icon: translateIcon
                  }), "icon"),
                  disabled: this.ensureLiveTranslationQueue().isBusyTranslating(),
                  label: this.labels.context_translator,
                  persisting: !0,
                  action: /* @__PURE__ */ __name((event) => {
                    let item = BDFDB.DOMUtils.getParent(BDFDB.dotCN.menuitem, event.target);
                    if (item) {
                      let createTooltip = /* @__PURE__ */ __name((_2) => {
                        BDFDB.TooltipUtils.create(item, foundTranslation ? [
                          `${BDFDB.LanguageUtils.LibraryStrings.from} ${this.getLanguageDisplayName(foundInput)}:`,
                          text,
                          `${BDFDB.LanguageUtils.LibraryStrings.to} ${this.getLanguageDisplayName(foundOutput)}:`,
                          foundTranslation
                        ].map((n) => BDFDB.ReactUtils.createElement("div", { children: n })) : this.labels.toast_translating_failed, {
                          type: "right",
                          color: foundTranslation ? "primary" : "red",
                          className: "googletranslate-tooltip"
                        });
                      }, "createTooltip");
                      foundTranslation && foundInput && foundOutput ? document.querySelector(".googletranslate-tooltip") ? copied ? (BDFDB.ContextMenuUtils.close(e.instance), BDFDB.DiscordUtils.openLink(this.getGoogleTranslatePageURL(foundInput.id, foundOutput.id, text))) : (copied = !0, BDFDB.LibraryModules.WindowUtils.copy(foundTranslation), BDFDB.NotificationUtils.toast(BDFDB.LanguageUtils.LibraryStringsFormat("clipboard_success", BDFDB.LanguageUtils.LanguageStrings.TEXT), { type: "success" })) : createTooltip() : translating || (translating = !0, this.translateText(text, ownMessage ? messageTypes.SENT : messageTypes.RECEIVED, (translation, input, output) => {
                        translation && (foundTranslation = translation, foundInput = input, foundOutput = output), createTooltip();
                      }, null, { channelId: channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId() }));
                    }
                  }, "action")
                })
              }));
            }
          }
          processMessageButtons(e) {
            if (!e.instance.props.message || !e.instance.props.channel) return;
            let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, { props: [["className", BDFDB.disCN.messagebuttons]] });
            if (index == -1) return;
            let channelId = e.instance.props.channel && e.instance.props.channel.id || null, translated = this.isMessageDisplayTranslated(e.instance.props.message, channelId);
            children.unshift(BDFDB.ReactUtils.createElement(class extends BdApi.React.Component {
              render() {
                return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
                  key: translated ? "untranslate-message" : "translate-message",
                  text: /* @__PURE__ */ __name((_2) => translated ? _this.labels.context_messageuntranslateoption : _this.labels.context_messagetranslateoption, "text"),
                  tooltipConfig: { className: BDFDB.disCN.messagetoolbartooltip },
                  children: BDFDB.ReactUtils.createElement("div", {
                    className: BDFDB.disCNS.messagetoolbarhoverbutton + BDFDB.disCN.messagetoolbarbutton,
                    onClick: /* @__PURE__ */ __name((_2) => {
                      _this.translateMessage(e.instance.props.message, e.instance.props.channel, { manual: !0, independentOfTextAreaSwitch: !0, trackBusy: !1 }).then((_3) => {
                        translated = _this.isMessageDisplayTranslated(e.instance.props.message, channelId), BDFDB.ReactUtils.forceUpdate(this);
                      });
                    }, "onClick"),
                    children: BDFDB.ReactUtils.createElement("div", {
                      className: BDFDB.disCNS.messagetoolbaricon + BDFDB.disCN.messagetoolbarbuttoncontent,
                      children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SvgIcon, {
                        className: BDFDB.disCN.messagetoolbaricon,
                        nativeClass: !0,
                        iconSVG: translated ? translateIconUntranslate : translateIcon
                      })
                    })
                  })
                });
              }
            }));
          }
          processChannelTextAreaContainer(e) {
            e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.NORMAL && e.instance.props.type != BDFDB.DiscordConstants.ChannelTextAreaTypes.SIDEBAR || BDFDB.PatchUtils.patch(this, e.instance.props, "onSubmit", { instead: /* @__PURE__ */ __name((e2) => {
              if (e2.methodArguments[0].value) {
                let text = e2.methodArguments[0].value, prefixMap = {}, prefixData = this.settings.prefixes && this.settings.prefixes.translationPrefixData || [];
                for (let entry of prefixData)
                  prefixMap[entry.prefix] = entry.language;
                let foundPrefix = null, targetLanguage = null;
                for (let prefix in prefixMap)
                  if (text.trim().startsWith(prefix)) {
                    foundPrefix = prefix, targetLanguage = prefixMap[prefix];
                    break;
                  }
                if (foundPrefix) {
                  e2.stopOriginalMethodCall();
                  let cleanText = text.trim().substring(foundPrefix.length).trim();
                  return this.shouldAutoTranslateSentMessage(cleanText, e.instance.props.channel.id, (shouldTranslate) => {
                    if (!shouldTranslate) return e2.originalMethod(Object.assign({}, e2.methodArguments[0], { value: cleanText }));
                    this.translateText(cleanText, messageTypes.SENT, (translation, input, output) => {
                      output = { id: targetLanguage, name: (this.ensureSettingsStore().getLanguage(targetLanguage) || {}).name || targetLanguage }, translation = this.buildSentTranslationMessageValue(cleanText, translation, input, output), Promise.resolve(e2.originalMethod(Object.assign({}, e2.methodArguments[0], { value: translation }))).then((_2) => {
                        this.trackPendingSentOriginal(e.instance.props.channel.id, cleanText, translation);
                      });
                    }, targetLanguage, { channelId: e.instance.props.channel.id });
                  }, targetLanguage), Promise.resolve({
                    shouldClear: !0,
                    shouldRefocus: !0
                  });
                } else if (this.isTranslationEnabled(e.instance.props.channel.id)) {
                  e2.stopOriginalMethodCall();
                  let originalValue = e2.methodArguments[0].value, channelId = e.instance.props.channel.id, sentRequest = this.createSentAutomaticTranslationRequest(channelId, originalValue), submit = /* @__PURE__ */ __name((nextValue) => e2.originalMethod(Object.assign({}, e2.methodArguments[0], { value: nextValue })), "submit");
                  return this.shouldAutoTranslateSentMessage(originalValue, e.instance.props.channel.id, (shouldTranslate) => {
                    if (!shouldTranslate || !this.isSentAutomaticTranslationRequestCurrent(sentRequest)) return this.completeSentAutomaticTranslationRequest(sentRequest, originalValue, submit);
                    this.translateText(originalValue, messageTypes.SENT, (translation, input, output) => {
                      translation = this.buildSentTranslationMessageValue(originalValue, translation, input, output), this.completeSentAutomaticTranslationRequest(sentRequest, translation, submit);
                    }, null, { channelId });
                  }), Promise.resolve({
                    shouldClear: !0,
                    shouldRefocus: !0
                  });
                }
              }
              return e2.callOriginalMethodAfterwards();
            }, "instead") }, { noCache: !0 });
          }
          processChannelTextAreaEditor(e) {
          }
          processChannelTextAreaButtons(e) {
            if (e.instance.props.disabled || ![BDFDB.DiscordConstants.ChannelTextAreaTypes.NORMAL, BDFDB.DiscordConstants.ChannelTextAreaTypes.SIDEBAR, "normal", "sidebar"].includes(typeof e.instance.props.type == "string" ? e.instance.props.type : e.instance.props.type && e.instance.props.type.analyticsName) || !e.returnvalue || !e.returnvalue.props) return;
            let children = [].concat(e.returnvalue.props.children || []).filter((child) => !child || child.key == `${this.name}-translate-textarea-button` ? !1 : !(child.props && typeof child.props.className == "string" ? child.props.className : "").includes("_translatortranslatebutton"));
            children.unshift(BDFDB.ReactUtils.createElement(TranslateButtonComponent, {
              key: `${this.name}-translate-textarea-button`,
              guildId: e.instance.props.channel.guild_id ? e.instance.props.channel.guild_id : "@me",
              channelId: e.instance.props.channel.id
            })), e.returnvalue.props.children = children;
          }
          get modelCatalogState() {
            return this.ensureProviderClient().getModelCatalogState();
          }
          ensureHistoricalJobRegistry() {
            return this.historicalJobRegistryInstance || (this.historicalJobRegistryInstance = createHistoricalJobRegistry()), this.historicalJobRegistryInstance;
          }
          ensureMessageDeletionLifecycle() {
            return this.messageDeletionLifecycleInstance || (this.messageDeletionLifecycleInstance = createMessageDeletionLifecycle({
              removeLiveMessage: /* @__PURE__ */ __name((messageId, channelId) => this.ensureLiveTranslationQueue().removeMessage(messageId, channelId), "removeLiveMessage"),
              getHistoricalQueue: /* @__PURE__ */ __name((channelId) => this.getHistoricalTranslationJobQueue(channelId, !1), "getHistoricalQueue"),
              getFailedSnapshot: /* @__PURE__ */ __name((channelId) => this.ensureHistoricalJobRegistry().getFailedSnapshot(channelId), "getFailedSnapshot"),
              setFailedSnapshot: /* @__PURE__ */ __name((channelId, snapshot) => this.ensureHistoricalJobRegistry().setFailedSnapshot(channelId, snapshot), "setFailedSnapshot"),
              deleteFailedSnapshot: /* @__PURE__ */ __name((channelId) => this.ensureHistoricalJobRegistry().deleteFailedSnapshot(channelId), "deleteFailedSnapshot"),
              clearHistoricalMarker: /* @__PURE__ */ __name((messageId, jobId) => this.ensureLiveTranslationQueue().clearHistoricalQueuedMessage(messageId, jobId), "clearHistoricalMarker"),
              hasCachedTranslation: /* @__PURE__ */ __name((messageId) => this.hasCachedTranslationEntry(messageId), "hasCachedTranslation"),
              clearCachedTranslation: /* @__PURE__ */ __name((messageId) => this.clearCachedTranslation(messageId), "clearCachedTranslation"),
              deleteDisplayMessage: /* @__PURE__ */ __name((messageId, channelId) => this.ensureReceivedDisplayRuntime().deleteMessage(messageId, channelId), "deleteDisplayMessage")
            })), this.messageDeletionLifecycleInstance;
          }
          ensureLiveTranslationQueue() {
            return this.liveTranslationQueueInstance || (this.liveTranslationQueueInstance = createLiveTranslationQueue({
              isRuntimeActive: /* @__PURE__ */ __name(() => pluginRuntimeActive, "isRuntimeActive"),
              isTranslationEnabled: /* @__PURE__ */ __name((channelId) => this.isTranslationEnabled(channelId), "isTranslationEnabled"),
              extractOriginalContentData: /* @__PURE__ */ __name((message) => this.extractOriginalContentData(message), "extractOriginalContentData"),
              createTranslationSignature: /* @__PURE__ */ __name((message, channelId, originalContentData) => this.createReceivedTranslationSignature(message, channelId, originalContentData), "createTranslationSignature"),
              getMessageChannelId: /* @__PURE__ */ __name((message) => this.getMessageChannelId(message), "getMessageChannelId"),
              isProviderBackoffActive: /* @__PURE__ */ __name(() => this.ensureProviderClient().isBackoffActive(), "isProviderBackoffActive"),
              shouldAutoTranslateMessage: /* @__PURE__ */ __name((message, channel, originalContentData, ignoreQueued) => this.shouldAutoTranslateReceivedMessage(message, channel, originalContentData, ignoreQueued), "shouldAutoTranslateMessage"),
              isMessageWithinLoadedRange: /* @__PURE__ */ __name((message) => this.isMessageWithinLoadedRange(message), "isMessageWithinLoadedRange"),
              getDisplayCommitGeneration: /* @__PURE__ */ __name((channelId) => this.getReceivedDisplayCommitGeneration(channelId), "getDisplayCommitGeneration"),
              markDisplayPending: /* @__PURE__ */ __name((record, options) => this.markReceivedDisplayPending(record, options), "markDisplayPending"),
              releaseDisplayPending: /* @__PURE__ */ __name((record) => this.releaseReceivedDisplayPending(record), "releaseDisplayPending"),
              scheduleDisplayFlush: /* @__PURE__ */ __name((channelId, messageId) => this.scheduleReceivedDisplayFlush(channelId, messageId), "scheduleDisplayFlush"),
              collectHistoricalMessage: /* @__PURE__ */ __name((queueItem) => this.collectHistoricalTranslationMessage(queueItem), "collectHistoricalMessage"),
              resetLoadedMessageTracking: /* @__PURE__ */ __name((channelId = null) => loadedTranslationStatusStore.resetSeen(channelId), "resetLoadedMessageTracking"),
              clearEligibleReplyPreviewMessages: /* @__PURE__ */ __name((channelId) => this.clearAutoTranslationEligibleReplyPreviewMessages(channelId), "clearEligibleReplyPreviewMessages"),
              clearChannelTranslationQueue: /* @__PURE__ */ __name((channelId) => this.clearAutoTranslationQueue(channelId), "clearChannelTranslationQueue"),
              onChannelSessionLeft: /* @__PURE__ */ __name((channelId) => this.ensureReceivedDisplayRuntime().pruneChannel(channelId), "onChannelSessionLeft"),
              // new_only hides what is already on screen, so a fresh session drops the automatic records the previous one painted.
              onChannelSessionStarted: /* @__PURE__ */ __name((channelId) => this.getReceivedAutoTranslateScope() == "new_only" && this.clearDisplayedAutoTranslations(channelId), "onChannelSessionStarted"),
              onReservedLiveRequestConsumed: /* @__PURE__ */ __name((channelId, handoffTicket) => this.resumeQueuedHistoricalTranslationJobs(channelId, handoffTicket), "onReservedLiveRequestConsumed"),
              onReservedLiveRequestRetired: /* @__PURE__ */ __name((channelId, handoffTicket) => this.resumeQueuedHistoricalTranslationJobs(channelId, handoffTicket, { retired: !0 }), "onReservedLiveRequestRetired"),
              getBatchEngineKey: /* @__PURE__ */ __name((channelId) => this.getHistoricalAiBatchEngineKey(channelId), "getBatchEngineKey"),
              createBurstContext: /* @__PURE__ */ __name((channelId) => ({
                engineKey: this.getHistoricalAiBatchEngineKey(channelId),
                input: Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.INPUT, messageTypes.RECEIVED, channelId)) || {}),
                output: Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.OUTPUT, messageTypes.RECEIVED, channelId)) || {})
              }), "createBurstContext"),
              prepareBurstItem: /* @__PURE__ */ __name((queueItem, channelId, context) => this.prepareHistoricalAiBatchQueueItem(queueItem, channelId, context.input, context.output), "prepareBurstItem"),
              requestBurstTranslation: /* @__PURE__ */ __name((context, prepared) => this.requestAiBatchTranslationDetailed(context.engineKey, prepared), "requestBurstTranslation"),
              // Skip detection, validation and caching are translation policy and stay here;
              // the queue only learns whether the item is done, done-as-skipped, or must be
              // retried alone.
              resolveBurstItemResult: /* @__PURE__ */ __name((preparedItem, resultMap, channelId) => {
                let messageId = String(preparedItem.message.id), rawTranslation = resultMap && Object.prototype.hasOwnProperty.call(resultMap, messageId) ? resultMap[messageId] : null;
                if (rawTranslation != null && this.isSkipTranslationSignal(rawTranslation))
                  return this.persistReceivedSkipDecision(messageId, preparedItem.signature, "ai_skip_signal", preparedItem.protectedText), { status: "skipped", result: { sourceSignature: preparedItem.signature, status: "skipped", reason: "ai_skip_signal" } };
                let validation = { ok: !1 };
                try {
                  validation = this.validateHistoricalTranslationJobResult(preparedItem, rawTranslation, { channelId }) || { ok: !1 };
                } catch {
                  validation = { ok: !1 };
                }
                if (!validation.ok) return { status: "retry" };
                try {
                  this.persistTranslationCacheEntry(messageId, preparedItem.signature, validation.translation);
                } catch {
                }
                return { status: "translated", result: { sourceSignature: preparedItem.signature, status: "translated", translation: validation.translation } };
              }, "resolveBurstItemResult"),
              commitBurstResult: /* @__PURE__ */ __name((queueItem, channelId, result) => this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(queueItem.message, channelId, result), { refresh: !1 }), "commitBurstResult"),
              commitCachedResult: /* @__PURE__ */ __name((queueItem, channelId) => {
                let storedTranslation = this.refreshTranslationDisplay(Object.assign({ channelId, auto: !0 }, queueItem.cachedTranslation));
                return this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(queueItem.message, channelId, {
                  sourceSignature: storedTranslation.signature != null ? String(storedTranslation.signature) : this.createReceivedTranslationSignature(queueItem.message, channelId, queueItem.originalContentData),
                  requestIdentity: queueItem.liveRequest ? String(queueItem.liveRequest.id) : null,
                  status: "translated",
                  translation: storedTranslation
                }), { refresh: !1 });
              }, "commitCachedResult"),
              translateSingleItem: /* @__PURE__ */ __name((queueItem) => this.translateMessage(queueItem.message, queueItem.channel, {
                auto: !0,
                silent: !0,
                trackBusy: !1,
                originalContentData: queueItem.originalContentData,
                liveRequest: queueItem.liveRequest
              }), "translateSingleItem")
            })), this.liveTranslationQueueInstance;
          }
          ensureSentTranslationStore() {
            return this.sentTranslationStoreInstance || (this.sentTranslationStoreInstance = createSentTranslationStore({
              isRuntimeActive: /* @__PURE__ */ __name(() => pluginRuntimeActive, "isRuntimeActive"),
              isTranslationEnabled: /* @__PURE__ */ __name((channelId) => this.isTranslationEnabled(channelId), "isTranslationEnabled"),
              isOwnMessage: /* @__PURE__ */ __name((message) => this.isOwnMessage(message), "isOwnMessage")
            })), this.sentTranslationStoreInstance;
          }
          ensureSettingsStore() {
            return this.settingsStoreInstance || (this.settingsStoreInstance = createSettingsStore({
              isKnownEngine: /* @__PURE__ */ __name((engineKey) => !!translationEngines[engineKey], "isKnownEngine"),
              sortLanguages: /* @__PURE__ */ __name((table) => BDFDB.ObjectUtils.sort(table, "fav"), "sortLanguages"),
              resolveGuildId: /* @__PURE__ */ __name((channelId) => {
                let channel = channelId && BDFDB.LibraryStores.ChannelStore.getChannel(channelId);
                return channel ? channel.guild_id ? channel.guild_id : "@me" : null;
              }, "resolveGuildId"),
              loadFavorites: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "favorites"), "loadFavorites"),
              persistFavorites: /* @__PURE__ */ __name((value) => BDFDB.DataUtils.save(value, this, "favorites"), "persistFavorites"),
              loadAuthKeys: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "authKeys"), "loadAuthKeys"),
              persistAuthKeys: /* @__PURE__ */ __name((value) => BDFDB.DataUtils.save(value, this, "authKeys"), "persistAuthKeys"),
              loadChannelLanguages: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "channelLanguages"), "loadChannelLanguages"),
              persistChannelLanguages: /* @__PURE__ */ __name((value) => BDFDB.DataUtils.save(value, this, "channelLanguages"), "persistChannelLanguages"),
              loadGuildLanguages: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "guildLanguages"), "loadGuildLanguages"),
              persistGuildLanguages: /* @__PURE__ */ __name((value) => BDFDB.DataUtils.save(value, this, "guildLanguages"), "persistGuildLanguages"),
              loadChannelPrimaryEngineOverrides: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "channelPrimaryEngineOverrides"), "loadChannelPrimaryEngineOverrides"),
              persistChannelPrimaryEngineOverrides: /* @__PURE__ */ __name((value) => BDFDB.DataUtils.save(value, this, "channelPrimaryEngineOverrides"), "persistChannelPrimaryEngineOverrides"),
              loadTranslationEnabledStates: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "translationEnabledStates"), "loadTranslationEnabledStates"),
              loadReceivedAutoTranslationEnabledStates: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "receivedAutoTranslationEnabledStates"), "loadReceivedAutoTranslationEnabledStates"),
              persistChannelEnablementState: /* @__PURE__ */ __name((value) => {
                BDFDB.DataUtils.save(value, this, "translationEnabledStates"), BDFDB.DataUtils.save(value, this, "receivedAutoTranslationEnabledStates");
              }, "persistChannelEnablementState"),
              loadGlobalLanguageChoice: /* @__PURE__ */ __name((place, direction) => this.settings.choices[place] && this.settings.choices[place][direction], "loadGlobalLanguageChoice"),
              persistGlobalLanguageChoice: /* @__PURE__ */ __name((place, direction, choice) => {
                this.settings.choices[place][direction] = choice, BDFDB.DataUtils.save(this.settings.choices, this, "choices");
              }, "persistGlobalLanguageChoice")
            })), this.settingsStoreInstance;
          }
          ensureProviderClient() {
            return this.providerClientInstance || (this.providerClientInstance = createProviderClient({
              request: /* @__PURE__ */ __name((url, options, callback) => BDFDB.LibraryRequires.request(url, options, callback), "request"),
              setTimeout: /* @__PURE__ */ __name((callback, delay) => BDFDB.TimeUtils.timeout(callback, delay), "setTimeout"),
              clearTimeout: /* @__PURE__ */ __name((timer) => BDFDB.TimeUtils.clear(timer), "clearTimeout"),
              // A raw global timer on purpose: routing the backoff sleep through BDFDB would
              // leave the awaiting promise pending forever once the plugin stops.
              sleep: /* @__PURE__ */ __name((ms) => new Promise((resolve) => setTimeout(resolve, ms)), "sleep"),
              now: /* @__PURE__ */ __name(() => Date.now(), "now"),
              getAuthKeys: /* @__PURE__ */ __name(() => this.ensureSettingsStore().getAuthKeys(), "getAuthKeys"),
              saveAuthKeys: /* @__PURE__ */ __name((value) => this.ensureSettingsStore().replaceAuthKeys(value), "saveAuthKeys"),
              getLanguages: /* @__PURE__ */ __name(() => this.ensureSettingsStore().getLanguages(), "getLanguages"),
              notify: /* @__PURE__ */ __name((message, options) => BDFDB.NotificationUtils.toast(message, options), "notify"),
              getLabels: /* @__PURE__ */ __name(() => this.labels, "getLabels"),
              getCustomText: /* @__PURE__ */ __name((key) => this.getCustomText(key), "getCustomText"),
              getEngineLabel: /* @__PURE__ */ __name((engineKey) => this.getEngineLabel(engineKey), "getEngineLabel"),
              shouldUseAiAutoTranslateDecision: /* @__PURE__ */ __name((channelId) => this.shouldUseAiAutoTranslateDecision(channelId), "shouldUseAiAutoTranslateDecision"),
              getAiAutoTranslatePrompt: /* @__PURE__ */ __name((translationData) => this.getAiAutoTranslatePrompt(translationData), "getAiAutoTranslatePrompt")
            })), this.providerClientInstance;
          }
          ensureTranslationCacheStore() {
            return this.translationCacheStoreInstance || (this.translationCacheStoreInstance = createTranslationCacheStore({
              now: /* @__PURE__ */ __name(() => Date.now(), "now"),
              setTimeout: /* @__PURE__ */ __name((callback, delay) => BDFDB.TimeUtils.timeout(callback, delay), "setTimeout"),
              clearTimeout: /* @__PURE__ */ __name((timer) => BDFDB.TimeUtils.clear(timer), "clearTimeout"),
              loadCache: /* @__PURE__ */ __name(() => BDFDB.DataUtils.load(this, "translationCache"), "loadCache"),
              saveCache: /* @__PURE__ */ __name((cache) => BDFDB.DataUtils.save(cache, this, "translationCache"), "saveCache"),
              extractOriginalContentData: /* @__PURE__ */ __name((message) => this.extractOriginalContentData(message), "extractOriginalContentData"),
              createSignature: /* @__PURE__ */ __name((message, channelId, sourceData) => this.createReceivedTranslationSignature(message, channelId, sourceData), "createSignature"),
              normalizeStoredTranslation: /* @__PURE__ */ __name((translation) => this.normalizeStoredTranslationData(translation), "normalizeStoredTranslation"),
              extractLegacyDisplayedParts: /* @__PURE__ */ __name((content) => this.extractLegacyDisplayedTranslationParts(content), "extractLegacyDisplayedParts"),
              // Policy and display stay in the received-translation runtime; a cache lookup
              // asks whether an old entry still passes today's guards, it does not decide.
              refreshTranslationDisplay: /* @__PURE__ */ __name((translation) => this.refreshTranslationDisplay(translation), "refreshTranslationDisplay"),
              isTranslationResultTooSimilar: /* @__PURE__ */ __name((translation) => this.isTranslationResultTooSimilar(translation), "isTranslationResultTooSimilar"),
              shouldSkipBeforeRequest: /* @__PURE__ */ __name((sourceData, channelId) => this.shouldSkipReceivedTranslationBeforeRequest(sourceData, channelId), "shouldSkipBeforeRequest"),
              shouldKeepAutoTranslatedResult: /* @__PURE__ */ __name((translation, channelId) => this.shouldKeepAutoTranslatedResult(translation, channelId), "shouldKeepAutoTranslatedResult"),
              getSkipPreviewText: /* @__PURE__ */ __name((text) => this.getLoadedAutoTranslationPreviewText(text), "getSkipPreviewText")
            })), this.translationCacheStoreInstance;
          }
          ensureMessageViewportStore() {
            return this.messageViewportStoreInstance || (this.messageViewportStoreInstance = createMessageViewportStore({
              getDocument: /* @__PURE__ */ __name(() => typeof document > "u" ? null : document, "getDocument"),
              setTimeout: /* @__PURE__ */ __name((callback, delay) => BDFDB.TimeUtils.timeout(callback, delay), "setTimeout"),
              clearTimeout: /* @__PURE__ */ __name((timer) => BDFDB.TimeUtils.clear(timer), "clearTimeout"),
              requestAnimationFrame: /* @__PURE__ */ __name((callback) => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : setTimeout(callback, 0), "requestAnimationFrame"),
              now: /* @__PURE__ */ __name(() => Date.now(), "now"),
              getSelectedChannelId: /* @__PURE__ */ __name(() => BDFDB.LibraryStores.SelectedChannelStore.getChannelId(), "getSelectedChannelId"),
              getMessagesScrollerSelector: /* @__PURE__ */ __name(() => BDFDB.dotCN && BDFDB.dotCN.messagesscroller, "getMessagesScrollerSelector"),
              escapeSelectorValue: /* @__PURE__ */ __name((value) => typeof CSS < "u" && CSS.escape ? CSS.escape(value) : String(value).replace(/(["\\])/g, "\\$1"), "escapeSelectorValue"),
              // Closing the user-scroll window is the moment a historical snapshot may commit.
              onScrollActivityFinished: /* @__PURE__ */ __name((channelId) => this.finishHistoricalTranslationSnapshot(channelId), "onScrollActivityFinished")
            })), this.messageViewportStoreInstance;
          }
          ensureReceivedDisplayRuntime() {
            return this.receivedDisplayRuntimeInstance || (this.receivedDisplayRuntimeInstance = createDisplayRuntime({
              BDFDB: {
                dotCN: BDFDB.dotCN || {},
                MessageUtils: BDFDB.MessageUtils
              },
              document: {
                querySelector: /* @__PURE__ */ __name((selector) => typeof document > "u" || !document || !selector ? null : document.querySelector(selector), "querySelector")
              },
              requestAnimationFrame: /* @__PURE__ */ __name((callback) => typeof requestAnimationFrame == "function" ? requestAnimationFrame(callback) : setTimeout(callback, 0), "requestAnimationFrame"),
              isRuntimeActive: /* @__PURE__ */ __name(() => pluginRuntimeActive, "isRuntimeActive"),
              getUserScrollIntentSequence: /* @__PURE__ */ __name(() => this.ensureMessageViewportStore().getUserScrollIntentSequence(), "getUserScrollIntentSequence"),
              // Scroll preservation is best-effort: a capture or restore failure must never
              // break an acknowledged display transaction.
              captureScrollState: /* @__PURE__ */ __name(() => {
                try {
                  return this.captureMessageScrollerState();
                } catch {
                  return null;
                }
              }, "captureScrollState"),
              restoreScrollState: /* @__PURE__ */ __name((scrollerState) => {
                try {
                  this.restoreMessageScrollerState(scrollerState);
                } catch {
                }
              }, "restoreScrollState")
            })), this.receivedDisplayRuntimeInstance;
          }
          resetReceivedDisplayRuntime() {
            this.receivedDisplayRuntimeInstance = null;
          }
          captureReceivedMessageSource(snapshot) {
            return this.ensureReceivedDisplayRuntime().captureSource(snapshot);
          }
          markReceivedDisplayPending(request, options) {
            return this.ensureReceivedDisplayRuntime().markPending(request, options);
          }
          commitReceivedDisplayResult(result, options) {
            return this.ensureReceivedDisplayRuntime().commitMessageResult(result, options);
          }
          commitHistoricalReceivedDisplayBatch(results) {
            return this.ensureReceivedDisplayRuntime().commitHistoricalBatch(results);
          }
          getReceivedDisplayView(messageId) {
            return this.ensureReceivedDisplayRuntime().getDisplayView(messageId);
          }
          getReceivedDisplayRuntimeView(messageId) {
            return this.ensureReceivedDisplayRuntime().getDisplayView(messageId);
          }
          restoreReceivedDisplayChannel(channelId, options) {
            return this.ensureReceivedDisplayRuntime().restoreChannel(channelId, options);
          }
          restoreAllReceivedDisplay(options) {
            return this.ensureReceivedDisplayRuntime().restoreAll(options);
          }
          setReceivedDisplayGeneration(channelId, generation) {
            return this.ensureReceivedDisplayRuntime().setChannelGeneration(channelId, generation);
          }
          getReceivedDisplayGeneration(channelId) {
            return this.ensureReceivedDisplayRuntime().getChannelGeneration(channelId);
          }
          getReceivedDisplayCommitGeneration(channelId) {
            let generation = this.getReceivedDisplayGeneration(channelId);
            return generation === void 0 ? 1 : generation;
          }
          releaseReceivedDisplayPending(request) {
            return this.ensureReceivedDisplayRuntime().releasePending(request);
          }
          // Live automatic commits write the store immediately and coalesce their visible
          // refresh: one acknowledged display transaction per channel per debounce window
          // instead of one full-list repaint (plus scroll restore) per message.
          // Repaint cadence lives in the scheduler module; the plugin only supplies the
          // predicates that depend on Discord state.
          canRepaintReceivedDisplayNow() {
            return !this.isTranslatorSettingsSurfaceOpen();
          }
          ensureReceivedDisplayRepaintScheduler() {
            return this.receivedDisplayRepaintSchedulerInstance || (this.receivedDisplayRepaintSchedulerInstance = createDisplayRepaintScheduler({
              renderMessages: /* @__PURE__ */ __name((messageIds) => this.ensureReceivedDisplayRuntime().renderMessages(messageIds), "renderMessages"),
              onRenderOutcome: /* @__PURE__ */ __name((report) => historicalDisplayTracker.handle(report), "onRenderOutcome"),
              canRepaintNow: /* @__PURE__ */ __name(() => this.canRepaintReceivedDisplayNow(), "canRepaintNow"),
              isViewingHistory: /* @__PURE__ */ __name(() => this.isViewingMessageHistory(), "isViewingHistory"),
              isSettingsSurfaceOpen: /* @__PURE__ */ __name(() => this.isTranslatorSettingsSurfaceOpen(), "isSettingsSurfaceOpen"),
              isTextAreaFocused: /* @__PURE__ */ __name(() => this.isChannelTextAreaFocused(), "isTextAreaFocused"),
              repaintAll: /* @__PURE__ */ __name(() => this.rerenderMessagesWithScrollPreserved(), "repaintAll"),
              setTimeout: /* @__PURE__ */ __name((callback, delay) => BDFDB.TimeUtils.timeout(callback, delay), "setTimeout"),
              clearTimeout: /* @__PURE__ */ __name((timer) => BDFDB.TimeUtils.clear(timer), "clearTimeout")
            })), this.receivedDisplayRepaintSchedulerInstance;
          }
          scheduleReceivedDisplayFlush(channelId, messageId, delay = null, trackingKey = null) {
            this.ensureReceivedDisplayRepaintScheduler().schedule(channelId, messageId, delay, 1, trackingKey);
          }
          clearReceivedDisplayFlushQueue() {
            this.ensureReceivedDisplayRepaintScheduler().clear();
          }
          restoreReceivedDisplayMessage(messageId, options) {
            return this.ensureReceivedDisplayRuntime().restoreMessage(messageId, options);
          }
          isMessageDisplayTranslated(message, channelId = null) {
            if (!message || !message.id) return !1;
            if (this.getActiveMessageTranslation(message, channelId)) return !0;
            let displayView = this.getReceivedDisplayRuntimeView(message.id);
            return !!(displayView && displayView.translated);
          }
          createReceivedDisplayCommitResult(message, channelId, overrides) {
            return Object.assign({
              messageId: message.id,
              channelId,
              generation: this.getReceivedDisplayCommitGeneration(channelId),
              origin: "automatic",
              requestIdentity: null
            }, overrides);
          }
          // Display composition happens at render time so Display settings changed after a
          // commit still shape the painted content; the frozen store record keeps only the
          // translation facts.
          getReceivedDisplayViewRenderContent(view) {
            return translationDisplayLogic.getReceivedDisplayViewRenderContent(this, view);
          }
          applyReceivedDisplayViewToStream(stream, view) {
            return translationDisplayLogic.applyReceivedDisplayViewToStream(this, stream, view);
          }
          applyReceivedDisplayViewToContent(e, view) {
            if (!(!e || !e.returnvalue || !e.returnvalue.props)) {
              if (this.cleanupInjectedMessageChildren(this.ensureElementChildrenArray(e.returnvalue)), translationDisplayLogic.clearTranslatedRenderDecorations(this, e), !view) {
                delete e.returnvalue.props["data-translator-revision"];
                return;
              }
              if (e.returnvalue.props["data-translator-revision"] = String(view.revision), view.translated && view.translation) {
                this.shouldProtectWrappedTextForPlace(messageTypes.RECEIVED) && (e.returnvalue.props.children = this.highlightProtectedWrappedTextInNode(e.returnvalue.props.children, view.messageId)), this.settings.general.highlightTranslatedMessages && (e.returnvalue.props.className = BDFDB.DOMUtils.formatClassName(e.returnvalue.props.className, "translator-translated-message")), e.returnvalue.props.style = Object.assign({}, e.returnvalue.props.style, {
                  "--translator-accent-color": this.getTranslatedTextColor(),
                  "--translator-text-color": this.getTranslatedTextColor()
                });
                let watermarkNode = translationDisplayLogic.createTranslationWatermarkNode(this, view.translation, "translator-translated-watermark");
                watermarkNode && this.ensureElementChildrenArray(e.returnvalue).push(watermarkNode), view.translation.originalContent && this.settings.general.showOriginalMessage && this.settings.general.showOriginalDirectly && this.ensureElementChildrenArray(e.returnvalue).push(this.createOriginalMessageBlock(view.translation.originalContent));
                return;
              }
              view.showLoading && this.ensureElementChildrenArray(e.returnvalue).push(BDFDB.ReactUtils.createElement("span", {
                key: "translator-translation-loading",
                className: "translator-translation-loading",
                "aria-label": this.isChineseUiLanguage() ? "正在翻译" : "Translating"
              }));
            }
          }
          processMessages(e) {
            return secondDebugProbe && secondDebugProbe.recordParentRenderPass(e, { resolveScrollerElement: /* @__PURE__ */ __name(() => document.querySelector(BDFDB.dotCN.messagesscroller), "resolveScrollerElement") }), receivedTranslationRuntime.processMessages(this, e);
          }
          checkMessage(stream, message, channel, options = {}) {
            return receivedTranslationRuntime.checkMessage(this, stream, message, channel, options);
          }
          processMessageReply(e) {
            return translationDisplayLogic.processMessageReply(this, e);
          }
          processMessageContent(e) {
            if (!e.instance.props.message || !e.returnvalue || !e.returnvalue.props) return;
            let message = e.instance.props.message;
            if (this.isRenderingReplyPreviewMessage(message)) {
              let children = this.ensureElementChildrenArray(e.returnvalue);
              this.cleanupInjectedMessageChildren(children), e.returnvalue = this.stripTranslatorStylingFromReplyPreviewNode(e.returnvalue);
              return;
            }
            let displayState = translationDisplayLogic.prepareMessageContentDisplay(this, e);
            message = displayState.message;
            let translation = displayState.translation, displayView = this.getReceivedDisplayRuntimeView(message.id);
            if (!translation && displayView && displayView.translated) {
              this.applyReceivedDisplayViewToContent(e, displayView);
              return;
            }
            translationDisplayLogic.applyMessageContentRenderDecorations(this, e, message, translation), displayView ? e.returnvalue.props["data-translator-revision"] = String(displayView.revision) : delete e.returnvalue.props["data-translator-revision"];
          }
          processEmbed(e) {
            return translationDisplayLogic.processEmbed(this, e);
          }
          isTranslatableChannelTitle(channel) {
            if (!channel || !channel.id || !(channel.name || "").trim()) return !1;
            try {
              if (BDFDB.ChannelUtils && (BDFDB.ChannelUtils.isThread(channel) || BDFDB.ChannelUtils.isForumPost(channel))) return !0;
            } catch {
            }
            try {
              return typeof channel.isThread == "function" && channel.isThread();
            } catch {
              return !1;
            }
          }
          getChannelTitleTranslationSignature(channel) {
            if (!this.isTranslatableChannelTitle(channel)) return "";
            let channelId = channel.id;
            return JSON.stringify(Object.assign({}, this.getReceivedTranslationRequestConfigurationData(channelId), {
              name: channel.name
            }));
          }
          getActiveChannelTitleTranslation(channel) {
            return !this.isTranslatableChannelTitle(channel) || !this.isTranslationEnabled(channel.id) ? null : channelTitleStore.getTranslatedTitle(channel.id, this.getChannelTitleTranslationSignature(channel));
          }
          cancelPendingChannelTitleTranslation(channelId = null) {
            channelTitleStore.cancelPending(channelId);
          }
          clearChannelTitleTranslations(channelId = null) {
            channelTitleStore.clear(channelId) && this.forceUpdateChannelTitleComponents();
          }
          queueChannelTitleTranslation(channel) {
            if (!pluginRuntimeActive || !this.isTranslatableChannelTitle(channel) || !this.isTranslationEnabled(channel.id)) return !1;
            let channelId = channel.id, signature = this.getChannelTitleTranslationSignature(channel);
            if (!signature) return !1;
            let request = channelTitleStore.beginRequest(channelId, signature);
            return request ? (this.translateText(channel.name, messageTypes.RECEIVED, (translation, _input, _output, meta = {}) => {
              if (channelTitleStore.isRequestCurrent(request)) {
                if (!pluginRuntimeActive || !this.isTranslationEnabled(channelId) || this.getChannelTitleTranslationSignature(channel) != signature) {
                  channelTitleStore.abandonRequest(request);
                  return;
                }
                if (!translation && !(meta && meta.skipped)) {
                  channelTitleStore.failRequest(request);
                  return;
                }
                channelTitleStore.completeRequest(request, translation || channel.name) && this.forceUpdateChannelTitleComponents();
              }
            }, null, { auto: !0, showToast: !1, showFailureToast: !1, trackBusy: !1, channelId }), !0) : !1;
          }
          replaceChannelTitleInRenderTree(node, originalTitle, translatedTitle) {
            if (typeof node == "string") return node == originalTitle ? translatedTitle : node;
            if (BDFDB.ArrayUtils.is(node)) {
              for (let index = 0; index < node.length; index++) node[index] = this.replaceChannelTitleInRenderTree(node[index], originalTitle, translatedTitle);
              return node;
            }
            if (!node || typeof node != "object" || !node.props) return node;
            Object.prototype.hasOwnProperty.call(node.props, "children") && (node.props.children = this.replaceChannelTitleInRenderTree(node.props.children, originalTitle, translatedTitle));
            for (let key of ["text", "title", "aria-label", "threadName", "channelName"]) node.props[key] == originalTitle && (node.props[key] = translatedTitle);
            return node;
          }
          getChannelFromTitlePatchEvent(e) {
            let props = e && e.instance && e.instance.props || {};
            for (let channel of [props.thread, props.activeThread, props.sidebarChannel]) if (channel && channel.id) return channel;
            let threadId = props.threadId || props.activeThreadId || props.sidebarChannelId;
            if (threadId) {
              let thread = BDFDB.LibraryStores.ChannelStore.getChannel(threadId);
              if (thread) return thread;
            }
            if (props.channelId) {
              let explicitChannel = BDFDB.LibraryStores.ChannelStore.getChannel(props.channelId);
              if (this.isTranslatableChannelTitle(explicitChannel)) return explicitChannel;
            }
            for (let channel of [props.channel, props.activeChannel]) if (channel && channel.id) return channel;
            let channelId = props.channelId || props.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId();
            return channelId && BDFDB.LibraryStores.ChannelStore.getChannel(channelId) || null;
          }
          processChannelTitlePatch(e) {
            let channel = this.getChannelFromTitlePatchEvent(e);
            if (!this.isTranslatableChannelTitle(channel) || !this.isTranslationEnabled(channel.id)) return;
            let translatedTitle = this.getActiveChannelTitleTranslation(channel);
            if (!translatedTitle) {
              this.queueChannelTitleTranslation(channel);
              return;
            }
            e.returnvalue = this.replaceChannelTitleInRenderTree(e.returnvalue, channel.name, translatedTitle);
          }
          forceUpdateChannelTitleComponents() {
            BDFDB.PatchUtils.forceAllUpdates(this, ["HeaderBarChannelName", "HeaderBarTitle", "ThreadCard", "ThreadSidebar", "ChannelThreadItem"]);
          }
          processHeaderBarChannelName(e) {
            this.processChannelTitlePatch(e);
          }
          processHeaderBarTitle(e) {
            this.processChannelTitlePatch(e);
          }
          processThreadCard(e) {
            this.processChannelTitlePatch(e);
          }
          processThreadSidebar(e) {
            this.processChannelTitlePatch(e);
          }
          processChannelThreadItem(e) {
            this.processChannelTitlePatch(e);
          }
          normalizeStoredChannelPrimaryEngineOverrides(overrides) {
            return this.ensureSettingsStore().normalizeStoredChannelPrimaryEngineOverrides(overrides);
          }
          getGlobalPrimaryEngine() {
            let engineKey = this.settings && this.settings.engines && this.settings.engines.translator;
            return translationEngines[engineKey] ? engineKey : Object.keys(translationEngines)[0];
          }
          getEffectivePrimaryEngine(channelId = null) {
            return this.ensureSettingsStore().getChannelPrimaryEngineOverride(channelId) || this.getGlobalPrimaryEngine();
          }
          getEffectiveBackupEngine(channelId = null) {
            let backupEngineKey = this.settings && this.settings.engines && this.settings.engines.backup;
            return !translationEngines[backupEngineKey] || backupEngineKey == this.getEffectivePrimaryEngine(channelId) ? "----" : backupEngineKey;
          }
          getAdditionalCredentialEngineKeys() {
            let activeEngineKeys = /* @__PURE__ */ new Set([
              this.settings && this.settings.engines && this.settings.engines.translator,
              this.settings && this.settings.engines && this.settings.engines.backup
            ]);
            return Object.keys(translationEngines).filter((engineKey) => translationEngines[engineKey].key && !activeEngineKeys.has(engineKey));
          }
          isEngineConfiguredForRuntime(engineKey) {
            return this.ensureProviderClient().isEngineConfiguredForRuntime(engineKey);
          }
          engineSupportsLanguage(engineKey, language) {
            let engine = translationEngines[engineKey];
            return !engine || !language ? !1 : language.special ? !0 : language.auto ? !!engine.auto : engine.languages.includes(language.id);
          }
          engineSupportsLanguagePair(engineKey, input, output) {
            return output && output.special ? !0 : this.engineSupportsLanguage(engineKey, input) && this.engineSupportsLanguage(engineKey, output);
          }
          hasChannelPrimaryEngineOverride(channelId) {
            return this.ensureSettingsStore().hasChannelPrimaryEngineOverride(channelId);
          }
          saveChannelPrimaryEngineOverrides() {
            this.ensureSettingsStore().saveChannelPrimaryEngineOverrides();
          }
          setChannelPrimaryEngine(channelId, engineKey) {
            return this.ensureSettingsStore().setChannelPrimaryEngine(channelId, engineKey);
          }
          clearChannelPrimaryEngineOverride(channelId) {
            return this.ensureSettingsStore().clearChannelPrimaryEngineOverride(channelId);
          }
          refreshChannelPrimaryEngineRuntime(channelId) {
            channelId && (this.clearDisplayedAutoTranslations(channelId), this.clearAutoTranslationQueue(channelId), this.resetAutoTranslationTracking(channelId), this.scheduleTranslationRerender(), this.processAutoTranslationQueue());
          }
          createEmptyChannelEnablementState(globalDefault = !1) {
            return createEmptyChannelEnablementState(globalDefault);
          }
          normalizeStoredChannelEnablementState(state) {
            return normalizeStoredChannelEnablementState(state);
          }
          migrateLegacyChannelEnablementState(stateKeys) {
            return migrateLegacyChannelEnablementState(stateKeys);
          }
          loadChannelEnablementState(primaryStoredState, secondaryStoredState) {
            return loadChannelEnablementState(primaryStoredState, secondaryStoredState);
          }
          getChannelEnablementStateValue(channelId, state) {
            return getChannelEnablementStateValue(channelId, state);
          }
          channelEnablementStatesEqual(leftState, rightState) {
            return channelEnablementStatesEqual(leftState, rightState);
          }
          saveChannelEnablementState(nextState) {
            return this.ensureSettingsStore().saveChannelEnablementState(nextState);
          }
          setChannelEnablementStateValue(channelId, enabled) {
            return this.ensureSettingsStore().setChannelEnablementStateValue(channelId, enabled);
          }
          async toggleTranslation(channelId) {
            let operationVersion = channelToggleOperations.begin(channelId), wasEnabled = this.isTranslationEnabled(channelId);
            if (this.setChannelEnablementStateValue(channelId, !wasEnabled), wasEnabled) {
              let displayGeneration = this.getReceivedDisplayGeneration(channelId);
              displayGeneration !== void 0 && this.setReceivedDisplayGeneration(channelId, displayGeneration + 1), this.clearAutoTranslationQueue(channelId, { preservePreviews: !0 }), this.resetAutoTranslationTracking(channelId);
              try {
                await this.restoreReceivedDisplayChannel(channelId, { clearPreviews: !0, clearSuppressions: !0 });
              } finally {
                channelToggleOperations.isCurrent(channelId, operationVersion) && !this.isTranslationEnabled(channelId) && (this.clearDisplayedAutoTranslations(channelId, { includeManual: !0 }), this.processAutoTranslationQueue());
              }
              return;
            }
            this.resetAutoTranslationTracking(channelId), this.scheduleTranslationRerender(), this.processAutoTranslationQueue();
          }
          isTranslationEnabled(channelId) {
            return this.ensureSettingsStore().isTranslationEnabled(channelId);
          }
          toggleReceivedAutoTranslation(channelId) {
            return this.toggleTranslation(channelId);
          }
          isReceivedAutoTranslationEnabled(channelId) {
            return this.isTranslationEnabled(channelId);
          }
          setLanguages() {
            this.settings.engines.translator == this.settings.engines.backup && (this.settings.engines.backup = Object.keys(translationEngines).filter((n) => n != this.settings.engines.translator)[0], BDFDB.DataUtils.save(this.settings.engines, this, "engines"));
            let languageIds = Object.values(translationEngines).reduce((ids, translationEngine) => ids.concat(translationEngine.languages || []), []), builtLanguages = BDFDB.ObjectUtils.deepAssign(
              Object.values(translationEngines).some((translationEngine) => translationEngine.auto) ? {
                auto: {
                  auto: !0,
                  name: this.labels.detect_language,
                  id: "auto"
                }
              } : {},
              BDFDB.ObjectUtils.filter(BDFDB.LanguageUtils.languages, (lang) => languageIds.includes(lang.id)),
              {
                binary: {
                  special: !0,
                  name: "Binary",
                  id: "binary"
                },
                braille: {
                  special: !0,
                  name: "Braille 6-dot",
                  id: "braille"
                },
                morse: {
                  special: !0,
                  name: "Morse",
                  id: "morse"
                },
                hex: {
                  special: !0,
                  name: "Hexadecimal",
                  id: "hex"
                }
              }
            );
            this.ensureSettingsStore().setLanguages(builtLanguages);
          }
          getLanguageData(language) {
            return language ? typeof language == "string" ? this.ensureSettingsStore().getLanguage(language) || BDFDB.LanguageUtils.languages[language] || { id: language, name: language } : language : null;
          }
          getChineseLanguageName(languageId) {
            if (!languageId) return "";
            let overrideNames = {
              auto: "检测语言",
              zh: "中文",
              "zh-CN": "简体中文",
              "zh-TW": "繁体中文"
            };
            if (overrideNames[languageId]) return overrideNames[languageId];
            let normalizedId = {
              iw: "he",
              jw: "jv"
            }[languageId] || languageId;
            try {
              if (typeof Intl < "u" && typeof Intl.DisplayNames == "function")
                return new Intl.DisplayNames(["zh-Hans"], { type: "language" }).of(normalizedId) || "";
            } catch {
            }
            return "";
          }
          getLanguageDisplayName(language) {
            let languageData = this.getLanguageData(language);
            if (!languageData) return "";
            let baseName = BDFDB.LanguageUtils.getName(languageData) || languageData.name || languageData.id, chineseName = this.getChineseLanguageName(languageData.id);
            return !chineseName || baseName == chineseName || baseName.includes(` / ${chineseName}`) ? baseName : `${baseName} / ${chineseName}`;
          }
          getTranslationTooltipText(inputLanguage, outputLanguage) {
            return `${this.getLanguageDisplayName(inputLanguage)} -> ${this.getLanguageDisplayName(outputLanguage)}`;
          }
          detectLanguageDetails(text) {
            return new Promise((resolve) => {
              this.detectLanguage(text, (languageId) => {
                let languageData = languageId && this.getLanguageData(languageId);
                resolve(languageData || null);
              });
            });
          }
          getOriginalMessageLabel() {
            return this.isChineseUiLanguage() ? "原文" : this.isRussianUiLanguage() ? "Оригинал" : "Original";
          }
          formatOriginalTextForMessage(originalText, useSpoiler = this.shouldUseSpoilerInSentOriginal()) {
            return originalText ? useSpoiler ? `
||${originalText}||` : `
> ${originalText.split(`
`).join(`
> `)}` : "";
          }
          getCustomEmojiAssetUrl(emojiId, animated = !1) {
            return emojiId ? `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? "gif" : "webp"}?size=40&quality=lossless` : "";
          }
          createDiscordMarkupDisplayNode(token, key) {
            if (!token) return token;
            let match = /^<(a?):([A-Za-z0-9_~]+):(\d+)>$/.exec(token);
            if (match) {
              let animated = match[1] == "a", emojiName = match[2], emojiId = match[3];
              return BDFDB.ReactUtils.createElement("img", {
                key,
                className: "translator-discord-emoji",
                src: this.getCustomEmojiAssetUrl(emojiId, animated),
                alt: `:${emojiName}:`,
                title: `:${emojiName}:`,
                draggable: !1
              });
            }
            if (match = /^<@!?(\d+)>$/.exec(token), match) {
              let displayName = this.getMentionDisplayName(match[1]) || "user";
              return BDFDB.ReactUtils.createElement("span", {
                key,
                className: "translator-discord-mention",
                children: `@${displayName}`
              });
            }
            if (match = /^<@&(\d+)>$/.exec(token), match) {
              let roleName = "role";
              try {
                let guildId = BDFDB.LibraryStores.SelectedGuildStore && BDFDB.LibraryStores.SelectedGuildStore.getGuildId && BDFDB.LibraryStores.SelectedGuildStore.getGuildId(), role = guildId && BDFDB.LibraryStores.GuildStore && BDFDB.LibraryStores.GuildStore.getRole && BDFDB.LibraryStores.GuildStore.getRole(guildId, match[1]);
                role && role.name && (roleName = role.name);
              } catch {
              }
              return BDFDB.ReactUtils.createElement("span", {
                key,
                className: "translator-discord-mention translator-discord-role-mention",
                children: `@${roleName}`
              });
            }
            if (match = /^<#(\d+)>$/.exec(token), match) {
              let channelName = "channel";
              try {
                let channel = BDFDB.LibraryStores.ChannelStore && BDFDB.LibraryStores.ChannelStore.getChannel && BDFDB.LibraryStores.ChannelStore.getChannel(match[1]);
                channel && channel.name && (channelName = channel.name);
              } catch {
              }
              return BDFDB.ReactUtils.createElement("span", {
                key,
                className: "translator-discord-mention translator-discord-channel-mention",
                children: `#${channelName}`
              });
            }
            return token;
          }
          renderDiscordMarkupText(text, keyPrefix = "discord-markup") {
            if (text == null) return "";
            text = String(text);
            let nodes = [], tokenRegex = /(<a?:[A-Za-z0-9_~]+:\d+>|<@!?\d+>|<@&\d+>|<#\d+>)/g, lastIndex = 0, match, index = 0;
            for (; match = tokenRegex.exec(text); )
              match.index > lastIndex && nodes.push(text.slice(lastIndex, match.index)), nodes.push(this.createDiscordMarkupDisplayNode(match[0], `${keyPrefix}-${index++}`)), lastIndex = match.index + match[0].length;
            return lastIndex < text.length && nodes.push(text.slice(lastIndex)), nodes;
          }
          createOriginalMessageBlock(originalText) {
            return originalText ? BDFDB.ReactUtils.createElement("div", {
              key: "translator-original-message",
              className: "translator-original-message",
              children: BDFDB.ReactUtils.createElement("span", {
                className: this.shouldUseSpoilerInReceivedOriginal() ? "translator-original-spoiler" : null,
                children: this.renderDiscordMarkupText(originalText, "translator-original")
              })
            }) : null;
          }
          getLanguageChoice(direction, place, channelId) {
            return this.ensureSettingsStore().getLanguageChoice(direction, place, channelId);
          }
          saveLanguageChoice(choice, direction, place, channelId) {
            this.ensureSettingsStore().saveLanguageChoice(choice, direction, place, channelId);
          }
          getAutoTranslateSourceLanguages() {
            return languagePolicy.getConcreteConfiguredLanguages(this, "autoTranslateSourceLanguages");
          }
          normalizeLanguageId(languageId) {
            return languagePolicy.normalizeLanguageId(this, languageId);
          }
          matchesConfiguredSourceLanguage(languageId, sourceLanguages = null) {
            return languagePolicy.matchesConfiguredSourceLanguage(this, languageId, sourceLanguages);
          }
          getLanguageDetectionStrategy() {
            return languageDetectionRuntime.getStrategy(this);
          }
          detectLanguage(text, callback) {
            return languageDetectionRuntime.detectLanguage(this, text, callback);
          }
          shouldSkipSentTranslationForSameTarget(text, channelId, forcedOutputLanguage = null, callback) {
            return sentTranslationPolicy.shouldSkipSentTranslationForSameTarget(this, text, channelId, forcedOutputLanguage, callback);
          }
          shouldSendOriginalInsteadOfSentTranslation(originalText, translation, input, output) {
            return sentTranslationPolicy.shouldSendOriginalInsteadOfSentTranslation(this, originalText, translation, input, output);
          }
          buildSentTranslationMessageValue(originalText, translation, input, output) {
            return sentTranslationPolicy.buildSentTranslationMessageValue(this, originalText, translation, input, output);
          }
          shouldAutoTranslateSentMessage(text, channelId, callback, forcedOutputLanguage = null) {
            return sentTranslationPolicy.shouldAutoTranslateSentMessage(this, text, channelId, callback, forcedOutputLanguage);
          }
          createSentAutomaticTranslationRequest(channelId, originalText, messageId = null) {
            return this.ensureSentTranslationStore().createRequest(channelId, originalText, messageId);
          }
          isSentAutomaticTranslationRequestCurrent(request) {
            return this.ensureSentTranslationStore().isRequestCurrent(request);
          }
          completeSentAutomaticTranslationRequest(request, translatedText, submit) {
            return this.ensureSentTranslationStore().completeRequest(request, translatedText, submit);
          }
          invalidateSentAutomaticTranslationRequests(channelId = null) {
            return this.ensureSentTranslationStore().invalidateRequests(channelId);
          }
          trackPendingSentOriginal(channelId, originalText, submittedText) {
            return this.ensureSentTranslationStore().trackPendingOriginal(channelId, originalText, submittedText);
          }
          captureSentOriginalMessage(message, channelId = null) {
            return this.ensureSentTranslationStore().captureEcho(message, channelId);
          }
          getEditableSentMessageText(messageId, currentText) {
            return this.ensureSentTranslationStore().getEditableText(messageId, currentText);
          }
          translateMessage(message, channel, options = {}) {
            return new Promise((callback) => {
              let liveRequest = options.auto && options.liveRequest || null, manualRequestKey = null, manualRequest = null, finish = /* @__PURE__ */ __name((result) => {
                liveRequest && this.finishLiveTranslationRequest(liveRequest), this.ensureSentTranslationStore().releaseManualRequest(manualRequestKey, manualRequest), callback(result);
              }, "finish");
              if (!message) return finish(null);
              let channelId = channel && channel.id || BDFDB.LibraryStores.SelectedChannelStore.getChannelId(), isManualTranslation = !!options.manual || !options.auto;
              isManualTranslation && (manualRequestKey = this.ensureSentTranslationStore().createManualRequestKey(channelId, message.id));
              let activeTranslation = this.getActiveMessageTranslation(message, channelId), storeDisplayView = !activeTranslation && this.getReceivedDisplayRuntimeView(message.id), storeTranslated = !!(storeDisplayView && storeDisplayView.translated && storeDisplayView.origin === "automatic");
              if (isManualTranslation && !activeTranslation && !storeTranslated && this.ensureSentTranslationStore().hasManualRequest(manualRequestKey)) return finish(!1);
              if (isManualTranslation && this.lockManualTranslationScroll(message.id), activeTranslation || storeTranslated) {
                if (options.auto) return finish(!1);
                this.ensureReceivedDisplayRuntime().suppress(message.id), this.restoreReceivedDisplayMessage(message.id).then((_2) => {
                  this.ensureReceivedDisplayRuntime().clearPreview(message.id), finish(!1);
                }, (_2) => finish(!1));
              } else {
                if (options.auto && !this.isTranslationEnabled(channelId)) return finish(!1);
                let rerenderOptions = {
                  batched: options.auto || options.silent,
                  allowWhileTyping: !!options.auto
                }, originalContentData = options.originalContentData || this.extractOriginalContentData(message, { ignoreReferencedPreview: isManualTranslation });
                if (!this.hasTranslatableMessageContent(originalContentData)) return finish(!1);
                if (this.shouldSkipReceivedTranslationBeforeRequest(originalContentData, channelId)) {
                  let skipReason = this.getReceivedAutoTranslateSkipReason(originalContentData, channelId) || "same_language", skipSignature = this.createReceivedTranslationSignature(message, channelId, originalContentData);
                  if (this.persistReceivedSkipDecision(message.id, skipSignature, skipReason, this.buildTranslationRequestText(originalContentData)), options.auto) {
                    this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(message, channelId, {
                      sourceSignature: skipSignature,
                      requestIdentity: liveRequest ? String(liveRequest.id) : null,
                      status: "skipped",
                      reason: skipReason
                    }), { refresh: !1 }).then((_2) => finish(!1), (_2) => finish(!1));
                    return;
                  }
                  return finish(!1);
                }
                let signature = this.createReceivedTranslationSignature(message, channelId, originalContentData);
                if (options.auto && !liveRequest && (liveRequest = this.createLiveTranslationRequest(message, channelId, originalContentData, signature)), options.auto && !this.isLiveTranslationRequestCurrent(liveRequest, message)) return finish(!1);
                let cachedTranslation = this.getCachedReceivedTranslation(message, channelId, originalContentData);
                if (cachedTranslation) {
                  let storedCachedTranslation = Object.assign({}, cachedTranslation, {
                    channelId,
                    auto: !!options.auto,
                    manual: isManualTranslation,
                    independentOfTextAreaSwitch: !!options.independentOfTextAreaSwitch
                  });
                  if (options.auto) {
                    this.refreshTranslationDisplay(storedCachedTranslation), this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(message, channelId, {
                      sourceSignature: storedCachedTranslation.signature != null ? String(storedCachedTranslation.signature) : signature,
                      requestIdentity: liveRequest ? String(liveRequest.id) : null,
                      status: "translated",
                      translation: storedCachedTranslation
                    }), { refresh: !1 }).then((outcome) => {
                      outcome && outcome.deferredIds && outcome.deferredIds.length && this.scheduleReceivedDisplayFlush(channelId, message.id), finish(!0);
                    }, (_2) => finish(!1));
                    return;
                  }
                  return this.applyStoredTranslationToMessage(message, storedCachedTranslation, originalContentData), this.scheduleTranslationRerender(rerenderOptions), finish(!0);
                }
                let allTextsToTranslate = this.buildTranslationRequestText(originalContentData);
                message.embeds.forEach((embed) => embed.message_id = message.id), isManualTranslation && (manualRequest = this.ensureSentTranslationStore().beginManualRequest(manualRequestKey));
                try {
                  this.translateText(allTextsToTranslate, messageTypes.RECEIVED, (translation, input, output, meta = {}) => {
                    try {
                      if (options.auto && !this.isLiveTranslationRequestCurrent(liveRequest, message) || isManualTranslation && !this.ensureSentTranslationStore().isManualRequestCurrent(manualRequestKey, manualRequest)) return finish(!1);
                      if (translation) {
                        let strings = translation.split(/\n{0,1}__________________ __________________ __________________\n{0,1}/), oldContent = (originalContentData.content || "").trim(), translatedContent = (strings.shift() || "").trim(), content = this.buildReceivedDisplayContent(translatedContent, oldContent), embeds = parseStoredEmbedTranslations({ messageEmbeds: message.embeds, originalEmbeds: originalContentData.embeds, segments: strings }), storedTranslation = {
                          signature,
                          channelId,
                          auto: !!options.auto,
                          manual: isManualTranslation,
                          independentOfTextAreaSwitch: !!options.independentOfTextAreaSwitch,
                          content,
                          translatedContent,
                          originalContent: oldContent,
                          embeds,
                          input,
                          output
                        }, rejectReason = this.getAutoTranslatedResultRejectReason(storedTranslation, channelId);
                        if (options.auto && rejectReason || this.isTranslationResultTooSimilar(storedTranslation)) {
                          if (this.persistReceivedSkipDecision(message.id, signature, rejectReason || "too_similar", storedTranslation.originalContent || storedTranslation.translatedContent), options.auto) {
                            this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(message, channelId, {
                              sourceSignature: signature,
                              requestIdentity: liveRequest ? String(liveRequest.id) : null,
                              status: "skipped",
                              reason: rejectReason || "too_similar"
                            }), { refresh: !1 }).then((_2) => finish(!1), (_2) => finish(!1));
                            return;
                          }
                          return finish(!1);
                        }
                        if (options.auto) {
                          this.persistTranslationCacheEntry(message.id, signature, storedTranslation), this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(message, channelId, {
                            sourceSignature: signature,
                            requestIdentity: liveRequest ? String(liveRequest.id) : null,
                            status: "translated",
                            translation: storedTranslation
                          }), { refresh: !1 }).then((outcome) => {
                            outcome && outcome.deferredIds && outcome.deferredIds.length && this.scheduleReceivedDisplayFlush(channelId, message.id), finish(!0);
                          }, (_2) => finish(!1));
                          return;
                        }
                        this.applyStoredTranslationToMessage(message, storedTranslation, originalContentData), this.scheduleTranslationRerender(rerenderOptions), this.persistTranslationCacheEntry(message.id, signature, storedTranslation);
                      } else if (meta && meta.skipped && options.auto) {
                        this.persistReceivedSkipDecision(message.id, signature, "ai_skip_signal", allTextsToTranslate), this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(message, channelId, {
                          sourceSignature: signature,
                          requestIdentity: liveRequest ? String(liveRequest.id) : null,
                          status: "skipped",
                          reason: "ai_skip_signal"
                        }), { refresh: !1 }).then((_2) => finish(!0), (_2) => finish(!0));
                        return;
                      } else if (options.auto && !translation && !(meta && meta.skipped)) {
                        this.commitReceivedDisplayResult(this.createReceivedDisplayCommitResult(message, channelId, {
                          sourceSignature: signature,
                          requestIdentity: liveRequest ? String(liveRequest.id) : null,
                          status: "failed",
                          reason: "provider_failed"
                        }), { refresh: !1 }).then((_2) => finish(!1), (_2) => finish(!1));
                        return;
                      }
                      finish(!!translation || !!(meta && meta.skipped));
                    } catch {
                      finish(!1);
                    }
                  }, null, {
                    showToast: !options.silent,
                    showFailureToast: !options.silent,
                    trackBusy: options.trackBusy !== !1,
                    auto: !!options.auto,
                    forcePlainTranslation: !!options.forcePlainTranslation,
                    channelId
                  });
                } catch {
                  finish(!1);
                }
              }
            });
          }
          translateText(text, place, callback, forcedOutputLanguage = null, options = {}) {
            let showToast = options.showToast !== !1, showFailureToast = options.showFailureToast !== !1, trackBusy = options.trackBusy !== !1, toast = null, toastInterval, finished = !1, retriedAfterSkip = !1, skipSafetyNetHandler = null, finishTranslation = /* @__PURE__ */ __name((translation) => {
              let isSkip = this.isSkipTranslationSignal(translation);
              !isSkip && translation && (translation = this.addExceptions(translation, protectedSegments));
              let wrongTarget = !isSkip && !!translation && !this.isTranslationLikelyInTargetLanguage(translation, output && output.id);
              if (!finished && !retriedAfterSkip && skipSafetyNetHandler && (isSkip || wrongTarget) && options.auto && place == messageTypes.RECEIVED && this.useLocalLanguagePrecheck() && this.shouldUseAiAutoTranslateDecision(channelId)) {
                retriedAfterSkip = !0, skipSafetyNetHandler(translation);
                return;
              }
              if (trackBusy && this.ensureLiveTranslationQueue().setBusyTranslating(!1), toast && toast.close(), BDFDB.TimeUtils.clear(toastInterval), finished) return;
              finished = !0;
              let complete = /* @__PURE__ */ __name((...args) => {
                callback(...args), trackBusy && this.processAutoTranslationQueue();
              }, "complete");
              if (isSkip) return complete("", input, output, { skipped: !0 });
              if (translation && wrongTarget) return complete("", input, output, { failed: !0, wrongTargetLanguage: !0 });
              complete(translation == text ? "" : translation, input, output, { failed: !translation });
            }, "finishTranslation"), [newText, protectedSegments, translate] = this.removeExceptions(text.trim(), place), channelId = options.channelId || BDFDB.LibraryStores.SelectedChannelStore.getChannelId(), primaryEngineKey = this.getEffectivePrimaryEngine(channelId), backupEngineKey = this.getEffectiveBackupEngine(channelId), input = Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.INPUT, place, channelId))), output = forcedOutputLanguage ? Object.assign({}, this.ensureSettingsStore().getLanguage(forcedOutputLanguage) || { id: forcedOutputLanguage, name: forcedOutputLanguage }) : Object.assign({}, this.ensureSettingsStore().getLanguage(this.getLanguageChoice(languageTypes.OUTPUT, place, channelId)));
            if (translate && input.id != output.id) {
              let specialCase = this.checkForSpecialCase(newText, input);
              if (specialCase)
                switch (input.name = specialCase.name, specialCase.id) {
                  case "binary":
                    newText = this.binary2string(newText);
                    break;
                  case "braille":
                    newText = this.braille2string(newText);
                    break;
                  case "morse":
                    newText = this.morse2string(newText);
                    break;
                  case "hex":
                    newText = this.hex2string(newText);
                    break;
                }
              if (output.special) {
                switch (output.id) {
                  case "binary":
                    newText = this.string2binary(newText);
                    break;
                  case "braille":
                    newText = this.string2braille(newText);
                    break;
                  case "morse":
                    newText = this.string2morse(newText);
                    break;
                  case "hex":
                    newText = this.string2hex(newText);
                    break;
                }
                finishTranslation(newText);
              } else {
                let startTranslating = /* @__PURE__ */ __name((engine) => {
                  trackBusy && this.ensureLiveTranslationQueue().setBusyTranslating(!0), toast && toast.close(), BDFDB.TimeUtils.clear(toastInterval), showToast && (toast = BDFDB.NotificationUtils.toast(`${this.labels.toast_translating} (${translationEngines[engine].name}) - ${BDFDB.LanguageUtils.LibraryStrings.please_wait}`, {
                    timeout: 0,
                    ellipsis: !0,
                    position: "center",
                    onClose: /* @__PURE__ */ __name((_2) => BDFDB.TimeUtils.clear(toastInterval), "onClose")
                  }));
                  let timeoutTicks = Math.max(64, Math.min(120, Math.ceil((newText || "").length / 25)));
                  toastInterval = BDFDB.TimeUtils.interval((_2, count) => {
                    count < timeoutTicks || (finishTranslation(""), showFailureToast && BDFDB.NotificationUtils.toast(`${this.labels.toast_translating_failed} (${translationEngines[engine].name}) - ${this.labels.toast_translating_tryanother}`, {
                      type: "danger",
                      position: "center"
                    }));
                  }, 500);
                }, "startTranslating"), aiPrompt = this.getAiAutoTranslatePrompt({ input, output }), normalizeProviderTranslation = /* @__PURE__ */ __name((translation) => !translation || this.isSkipTranslationSignal(translation) || this.hasAllProtectionPlaceholders(translation, protectedSegments) ? translation : "", "normalizeProviderTranslation"), dispatchEngine = /* @__PURE__ */ __name((useAutoDecision2) => {
                  let aiDecisionFor = /* @__PURE__ */ __name((engineKey) => !!useAutoDecision2 && this.supportsAiAutoTranslateDecisionEngine(engineKey), "aiDecisionFor");
                  this.validTranslator(primaryEngineKey, input, output, specialCase) ? (startTranslating(primaryEngineKey), this[translationEngines[primaryEngineKey].funcName].apply(this, [{ input, output, text: newText, specialCase, engine: translationEngines[primaryEngineKey], autoDecision: aiDecisionFor(primaryEngineKey), decisionPrompt: aiPrompt }, (translation) => {
                    translation = normalizeProviderTranslation(translation), !translation && this.validTranslator(backupEngineKey, input, output, specialCase) ? (startTranslating(backupEngineKey), this[translationEngines[backupEngineKey].funcName].apply(this, [{ input, output, text: newText, specialCase, engine: translationEngines[backupEngineKey], autoDecision: aiDecisionFor(backupEngineKey), decisionPrompt: aiPrompt }, (backupTranslation) => finishTranslation(normalizeProviderTranslation(backupTranslation))])) : finishTranslation(translation);
                  }])) : this.validTranslator(backupEngineKey, input, output, specialCase) ? (startTranslating(backupEngineKey), this[translationEngines[backupEngineKey].funcName].apply(this, [{ input, output, text: newText, specialCase, engine: translationEngines[backupEngineKey], autoDecision: aiDecisionFor(backupEngineKey), decisionPrompt: aiPrompt }, (backupTranslation) => finishTranslation(normalizeProviderTranslation(backupTranslation))])) : finishTranslation();
                }, "dispatchEngine");
                skipSafetyNetHandler = /* @__PURE__ */ __name((skipTranslation) => {
                  this.isReceivedMessageForeignAsync(newText, output && output.id, (isForeign) => {
                    isForeign ? dispatchEngine(!1) : finishTranslation(skipTranslation);
                  });
                }, "skipSafetyNetHandler");
                let useAutoDecision = options.auto && !options.forcePlainTranslation && place == messageTypes.RECEIVED && this.shouldUseAiAutoTranslateDecision(channelId) && !this.isClearlyForeignLanguageMessage(newText, output && output.id);
                dispatchEngine(useAutoDecision);
              }
            } else finishTranslation();
          }
          validTranslator(key, input, output, specialCase) {
            let engine = translationEngines[key];
            return !engine || typeof this[engine.funcName] != "function" || !this.isEngineConfiguredForRuntime(key) ? !1 : specialCase || this.engineSupportsLanguagePair(key, input, output);
          }
          isValidatableEngine(engineKey) {
            return this.ensureProviderClient().isValidatableEngine(engineKey);
          }
          normalizeApiEndpoint(engineKey, endpoint) {
            return this.ensureProviderClient().normalizeApiEndpoint(engineKey, endpoint);
          }
          supportsModelCatalog(engineKey) {
            return this.ensureProviderClient().supportsModelCatalog(engineKey);
          }
          getModelCatalogEndpoint(engineKey, endpoint) {
            return this.ensureProviderClient().getModelCatalogEndpoint(engineKey, endpoint);
          }
          fetchModelCatalog(engineKey, onUpdate = null) {
            return this.ensureProviderClient().fetchModelCatalog(engineKey, onUpdate);
          }
          mapLanguageCodeForEngine(engineKey, languageId) {
            return this.ensureProviderClient().mapLanguageCodeForEngine(engineKey, languageId);
          }
          getValidationRequestForEngine(engineKey) {
            return this.ensureProviderClient().getValidationRequestForEngine(engineKey);
          }
          getValidationErrorDetails(body) {
            return this.ensureProviderClient().getValidationErrorDetails(body);
          }
          validateEngineConfig(engineKey) {
            return this.ensureProviderClient().validateEngineConfig(engineKey);
          }
          googleApiTranslate(data, callback) {
            return this.ensureProviderClient().googleApiTranslate(data, callback);
          }
          googleCloudTranslate(data, callback) {
            return this.ensureProviderClient().googleCloudTranslate(data, callback);
          }
          microsoftTranslate(data, callback) {
            return this.ensureProviderClient().microsoftTranslate(data, callback);
          }
          deepLTranslate(data, callback) {
            return this.ensureProviderClient().deepLTranslate(data, callback);
          }
          buildAiProviderTranslationPrompt(data) {
            return this.ensureProviderClient().buildAiProviderTranslationPrompt(data);
          }
          parseOpenAiResponseText(body) {
            return this.ensureProviderClient().parseOpenAiResponseText(body);
          }
          parseGeminiResponseText(body) {
            return this.ensureProviderClient().parseGeminiResponseText(body);
          }
          requestAiProviderTranslation(engineKey, url, options, parseResponse, callback) {
            return this.ensureProviderClient().requestAiProviderTranslation(engineKey, url, options, parseResponse, callback);
          }
          openAiTranslate(data, callback) {
            return this.ensureProviderClient().openAiTranslate(data, callback);
          }
          geminiTranslate(data, callback) {
            return this.ensureProviderClient().geminiTranslate(data, callback);
          }
          chatCompletionsTranslate(engineKey, data, callback) {
            return this.ensureProviderClient().chatCompletionsTranslate(engineKey, data, callback);
          }
          deepSeekTranslate(data, callback) {
            return this.ensureProviderClient().deepSeekTranslate(data, callback);
          }
          openAiCompatibleTranslate(data, callback) {
            return this.ensureProviderClient().openAiCompatibleTranslate(data, callback);
          }
          iTranslateTranslate(data, callback) {
            return this.ensureProviderClient().iTranslateTranslate(data, callback);
          }
          yandexTranslate(data, callback) {
            return this.ensureProviderClient().yandexTranslate(data, callback);
          }
          papagoTranslate(data, callback) {
            return this.ensureProviderClient().papagoTranslate(data, callback);
          }
          baiduTranslate(data, callback) {
            return this.ensureProviderClient().baiduTranslate(data, callback);
          }
          MD5(e) {
            return this.ensureProviderClient().MD5(e);
          }
          checkForSpecialCase(text, input) {
            if (input.special) return input;
            if (input.auto) {
              if (/^[0-1]*$/.test(text.replace(/\s/g, "")))
                return { id: "binary", name: "Binary" };
              if (/^[⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿]*$/.test(text.replace(/\s/g, "")))
                return { id: "braille", name: "Braille 6-dot" };
              if (/^[/|·−._-]*$/.test(text.replace(/\s/g, "")))
                return { id: "morse", name: "Morse" };
              if (/^(0x[0-9a-fA-F]{2}\s*)+$/.test(text.replace(/\s/g, "")))
                return { id: "hex", name: "Hexadecimal" };
            }
            return null;
          }
          string2binary(string) {
            let binary = "";
            for (let character of string) binary += parseInt(character.charCodeAt(0).toString(2)).toPrecision(8).split(".").reverse().join("").toString() + " ";
            return binary;
          }
          string2braille(string) {
            let braille = "";
            for (let character of string) braille += brailleConverter[character.toLowerCase()] ? brailleConverter[character.toLowerCase()] : character;
            return braille;
          }
          string2morse(string) {
            string = string.replace(/ /g, "%%%%%%%%%%");
            let morse = "";
            for (let character of string) morse += (morseConverter[character.toLowerCase()] ? morseConverter[character.toLowerCase()] : character) + " ";
            morse = morse.split(`
`);
            for (let i in morse) morse[i] = morse[i].trim();
            return morse.join(`
`).replace(/% % % % % % % % % % /g, "/ ");
          }
          string2hex(string) {
            let hex = "";
            for (let character of string)
              hex += "0x" + character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0") + " ";
            return hex.trim();
          }
          binary2string(binary) {
            let string = "";
            if (binary = binary.replace(/\n/g, "00001010").replace(/\r/g, "00001101").replace(/\t/g, "00001001").replace(/\s/g, ""), /^[0-1]*$/.test(binary)) {
              let eightDigits = "", counter = 0;
              for (let digit of binary)
                eightDigits += digit, counter++, counter > 7 && (string += String.fromCharCode(parseInt(eightDigits, 2).toString(10)), eightDigits = "", counter = 0);
            } else BDFDB.NotificationUtils.toast("Invalid binary format. Only use 0s and 1s.", {
              type: "danger",
              position: "center"
            });
            return string;
          }
          braille2string(braille) {
            let string = "";
            for (let character of braille) string += brailleConverter[character.toLowerCase()] ? brailleConverter[character.toLowerCase()] : character;
            return string;
          }
          morse2string(morse) {
            let string = "";
            for (let word of morse.replace(/[_-]/g, "−").replace(/\./g, "·").replace(/\r|\t/g, "").split(/\/|\||\n/g)) {
              for (let characterstr of word.trim().split(" ")) string += morseConverter[characterstr] ? morseConverter[characterstr] : characterstr;
              string += " ";
            }
            return string.trim();
          }
          hex2string(hex) {
            let string = "";
            for (let part of hex.trim().split(/\s+/))
              (part.startsWith("0x") || part.startsWith("0X")) && (part = part.slice(2)), part.length === 2 && /^[0-9a-fA-F]{2}$/.test(part) && (string += String.fromCharCode(parseInt(part, 16)));
            return string;
          }
          escapeRegExp(string) {
            return protectionLogic.escapeRegExp(this, string);
          }
          getExceptionScopeSetting(key, fallback = !0) {
            return protectionLogic.getExceptionScopeSetting(this, key, fallback);
          }
          shouldProtectConfiguredTermsForPlace(place) {
            return protectionLogic.shouldProtectConfiguredTermsForPlace(this, place);
          }
          shouldProtectWrappedTextForPlace(place) {
            return protectionLogic.shouldProtectWrappedTextForPlace(this, place);
          }
          getProtectedTermsList() {
            return protectionLogic.getProtectedTermsList(this);
          }
          trimTrailingProtectedPunctuation(text) {
            return protectionLogic.trimTrailingProtectedPunctuation(this, text);
          }
          protectRegexMatches(string, regex, protectedSegments = {}, count = 0, options = {}) {
            return protectionLogic.protectRegexMatches(this, string, regex, protectedSegments, count, options);
          }
          protectCodeBlockSegments(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectCodeBlockSegments(this, string, protectedSegments, count);
          }
          protectAutoDetectedSegments(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectAutoDetectedSegments(this, string, protectedSegments, count);
          }
          protectDiscordMarkupSegments(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectDiscordMarkupSegments(this, string, protectedSegments, count);
          }
          protectQuotedTextSegments(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectQuotedTextSegments(this, string, protectedSegments, count);
          }
          protectWrappedTextSegments(string, protectedSegments = {}, count = 0, place = null) {
            return protectionLogic.protectWrappedTextSegments(this, string, protectedSegments, count, place);
          }
          protectConfiguredTerms(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectConfiguredTerms(this, string, protectedSegments, count);
          }
          protectAutoTechnicalTerms(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectAutoTechnicalTerms(this, string, protectedSegments, count);
          }
          protectMixedLanguageLatinTokens(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectMixedLanguageLatinTokens(this, string, protectedSegments, count);
          }
          getUnicodeEmojiDetector() {
            return protectionLogic.getUnicodeEmojiDetector();
          }
          isUnicodeEmojiGrapheme(segment) {
            return protectionLogic.isUnicodeEmojiGrapheme(this, segment);
          }
          getUnicodeEmojiRegex() {
            return protectionLogic.getUnicodeEmojiRegex();
          }
          protectUnicodeEmojiSegments(string, protectedSegments = {}, count = 0) {
            return protectionLogic.protectUnicodeEmojiSegments(this, string, protectedSegments, count);
          }
          createProtectionPlaceholder(count) {
            return protectionLogic.createProtectionPlaceholder(this, count);
          }
          getProtectionPlaceholderRegex(count) {
            return protectionLogic.getProtectionPlaceholderRegex(this, count);
          }
          formatProtectedExceptionForDisplay(exception) {
            return protectionLogic.formatProtectedExceptionForDisplay(this, exception);
          }
          hasAllProtectionPlaceholders(string, protectedSegments) {
            return protectionLogic.hasAllProtectionPlaceholders(this, string, protectedSegments);
          }
          addExceptions(string, protectedSegments) {
            return protectionLogic.addExceptions(this, string, protectedSegments);
          }
          removeExceptions(string, place) {
            return protectionLogic.removeExceptions(this, string, place);
          }
          getGoogleTranslatePageURL(input, output, text) {
            return `https://translate.google.com/#${BDFDB.LanguageUtils.languages[input] ? input : "auto"}/${output}/${encodeURIComponent(text)}`;
          }
          setLabelsByLanguage() {
            return getLabelsForUiLanguage(this.getUiLanguageId());
          }
        }, __name(_a, "Translator"), _a;
      })(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
    })();
  }
});

// src/plugin/index.js
module.exports = require_runtime();
