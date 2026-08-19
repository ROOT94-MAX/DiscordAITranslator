# Architecture

Operational incident history, rejected approaches, and future-agent guardrails are consolidated in `field-debugging-guide.md`. Read it before changing repaint cadence, viewport restoration, capsule counting/positioning, provider integrity checks, or forwarded-message rendering.

## Status

This document defines the approved target architecture for the repository. The deterministic `src/` build exists, and v0.3.38 (2026-08-16) shipped the display repair series that restored hover-independent translation display on current clients.

The shipped runtime is the generated `DiscordAITranslator.plugin.js` (13,454 lines and 915,364 bytes at v0.3.38, build id `61cbf81a068feabf`). The shipped display strategy supersedes the former parent-transaction refresh design: real-client evidence proved per-message `forceUpdate` is a no-op on current clients, so each display transaction triggers at most one whole-list rebuild (see "DiscordRenderAdapter" below; the full debug evidence is archived outside Git with the pre-compression recovery transcript).

## Distribution Contract

BetterDiscord users install exactly one file:

```text
DiscordAITranslator.plugin.js
```

The repository contains readable source modules under `src/`. A deterministic build bundles those modules into the root plugin file. The generated plugin is a distribution artifact and must not be edited manually.

The build contract is:

```text
src/plugin/index.js
        -> scripts/build-plugin.mjs
        -> DiscordAITranslator.plugin.js
```

The build uses esbuild in CommonJS bundle mode with an ES2020 runtime target, preserves the BetterDiscord metadata banner, excludes tests and release-disabled diagnostics, and produces the same bytes from the same source and dependency lockfile.

## Current Architecture

The current single file contains useful logical modules, but they share closure state and one plugin class:

- Provider registry and provider-specific request code
- Sent and received translation policies
- Live and historical translation queues
- Translation cache and skip cache
- Channel enablement and channel provider overrides
- Message, reply, embed, and thread-title display patches
- BetterDiscord settings and channel popout UI
- Plugin lifecycle and cleanup

The central mutable maps are `translatedMessages`, `oldMessages`, queue records, reply-preview records, channel title records, and several generation counters. They are not owned by one module.

## Confirmed Architectural Failure

Translation data and visible Discord output currently have different owners.

`Messages` can replace message text, while `MessageContent` independently adds translated styling and the watermark. Reply previews, embeds, and thread titles use additional patch paths. A translation can therefore reach any partial state:

- Translation exists in memory but the visible message did not rerender
- Translated text is visible without the translated watermark
- The watermark refreshes while the text remains stale
- Automatic translation is disabled but the old translated React props remain visible

The regression was exposed when a full message-list rerender was replaced with targeted component updates. Unit tests verified the update function call, but not the visible Discord result. Hovering a message causes Discord to rerender that component naturally, which reveals already-stored translation data.

The new architecture must treat a data commit and a visible render commit as separate, observable operations.

### Full Debug Evidence — 2026-08-10

The following findings are confirmed from the repository and the observed hover-dependent UI failure:

1. `Messages` projects translated or restored message text in a before-render path, while `MessageContent` applies translated decoration in an after-render path. Updating only a message-content owner can therefore repaint decoration without rerunning the parent text projection.
2. The restore path can update message props after React has already built the text children for that render. The style may disappear while translated text remains until a later natural render such as hover.
3. `discord-render-adapter.js` currently locates exact per-message DOM IDs and requests per-message owners. The viewport module already supports newer suffix and containment selector shapes, so the repository has two incompatible message-element resolvers.
4. Installed BDFDB owner lookup and force-update behavior require an updateable class instance. Current tests supply synthetic owners and manually acknowledge revisions, so they prove a helper call rather than the parent-to-child render result.
5. `deferredIds` currently mix truly virtualized rows with mounted rows that failed render confirmation. Historical accounting may therefore report a row as displayed when no matching DOM revision was painted.
6. Reply previews and embeds inherit the host message-row invalidation boundary. Thread titles use a separate title-component refresh and require independent confirmation.
7. The former component-scoped owner plan was marked complete in `recovery-plan.md` even though real UI evidence invalidated its central assumption. That plan is retained only as historical evidence and is superseded by the reopened debug work.
8. `Messages` clones the `channelStream` array but not each stream entry. Translation and restoration then assign `stream.content` or `stream.content.content` on shared entry objects. The code contains source-recapture workarounds specifically because a later pass can observe the plugin's painted text as Discord source data.
9. Manual translation commits into `MessageStateStore`, but visible refresh still goes through the retained full-list repaint scheduler. Automatic, manual, settings, enable, disable, and stop paths therefore do not yet share one display transaction boundary.
10. The full-list compatibility scheduler may delay repaint while typing or settings are open and can wait 1.5 seconds while viewing history. It also permits up to three scheduler attempts after the adapter's own targeted retry, so the documented one-repair limit is not the runtime limit.
11. Adapter and lifecycle tests make `forceUpdate` directly add the requested DOM revision. Integration tests invoke stream projection and content decoration manually in the desired order. Neither test shape proves that the real parent patch reruns or that React produced the acknowledged DOM.
12. The historical prefetch adapter probes several undocumented Discord action signatures and accepts the first non-null result before proving it contains messages. If the action returns dispatch metadata, a promise with another shape, or populates the store asynchronously, the source can seal at the mounted/cache count instead of the configured maximum. This is a leading unverified explanation for a configured 50 appearing as 20.
13. Embed translation stores restoration fields on mutable embed props and restores them in a separate before-render branch. It has the same ownership and stale-prop risk as message text and needs host-row revision acknowledgement.
14. Thread-title refresh uses `forceAllUpdates` across all title surfaces and has no per-title render acknowledgement. Title state cancellation is generation-aware, but visible restoration remains a separate unverified surface.
15. `processMessageContent` may apply translated class, colour, watermark, and revision from `MessageStateStore` even when the parent `Messages` projection did not replace the text. This is a direct path to an original body with translated decoration. The inverse path also exists: shared message props can retain translated text after the active translation and decoration are cleared.
16. Several render hooks are stateful. `getActiveMessageTranslation` may clear display state and cache while rendering; loaded-message resolution may queue provider work while rendering; reply and embed hooks mutate render props. A child render can therefore change the revision after the parent selected its text. The replacement projection must be read-only during one React render.
17. Reply-preview commits, preview clears, suppression changes, and source-archive consumption deliberately do not advance the message display revision. Host-only preview refreshes consequently have no preview-specific revision to acknowledge. Existing tests prove that `forceUpdate` was requested, not that the host preview changed.
18. `historical-message-source.js` performs at most one prefetch for the number of eligible messages initially missing. Duplicates, off-channel records, or locally ineligible messages in that response can leave the final immutable job below the configured maximum even when older eligible messages exist. A bounded source must continue paging until the eligible maximum, an explicit exhaustion signal, or a request/page ceiling is reached.
19. The translation cache cancels rather than flushes its debounced save on plugin stop. Translations committed during the last 300 ms can therefore disappear from persisted cache even though display state already reported them complete.
20. Manual restore archives clone only the top-level message object. Nested embeds and related objects can remain shared with render props, so embed mutation can contaminate the archive that is supposed to restore the immutable original.
21. The compact status currently derives its completed count from `displayed`, but that value includes deferred virtualized-ready rows. The name and detail text imply visible DOM success while the implementation partly means stored-ready. Stored-valid, mounted-confirmed, deferred-ready, skipped, failed, and stale require separate counters and labels.
22. A fresh `npm run verify` passed all 1,047 tests while the hover-dependent text/decorations/restoration defects remain observed. This is positive evidence that the current suite is false-green at the Discord render boundary, not evidence that the UI defect is intermittent or already repaired.
23. `restoreAnchorState` schedules a two-frame restore plus four delayed writes, but those delayed writes are not tracked as a cancellable group. A channel switch, disable, or reload can therefore let an old manual anchor write into the new message list and recreate the scroll-jump class of bug.
24. Channel toggle versions guard only the final cleanup callback. The restore transaction mutates `MessageStateStore` before its asynchronous render acknowledgement, and re-enable does not advance a display transaction generation. A rapid disable -> enable can therefore let an older restore finish after re-enable and leave the store/UI in the disabled projection.
25. `historical-source-runtime.js` removes in-flight builds but retains one generation entry for every channel ever visited during the plugin lifetime. This is small but unbounded session state and can be eliminated when a channel session is pruned.
26. The modular entry point is still only `module.exports = require("../legacy/runtime")`. That 4,428-line runtime directly imports 27 of the 38 source modules and remains the composition root, Discord patch shell, UI coordinator, status DOM owner, repaint compatibility layer, and lifecycle dispatcher. The relative-import graph has no cycles, which is useful, but the fan-out proves that extraction created modules around a retained god object rather than completing the new runtime architecture.
27. The legacy line-count ratchet prevents further growth but does not require the final shell migration. It can remain green forever with the entire 4,428-line class intact. Several extracted modules also exceed the architecture boundary budget (`provider-client.js` 1,490 lines, `settings-panel.js` 1,286, `labels.js` 1,028, `styles.js` 899, and `message-state-store.js` 766), so moving code out of `legacy/runtime.js` has not by itself produced small, independently reviewable responsibilities.
28. The generated plugin is currently 13,305 readable lines and 904,357 bytes, above the documented 7,000-8,500-line and 350-450 KB release guardrails. This is not by itself a functional defect, but it is objective evidence that the architectural cleanup and dead compatibility removal are incomplete.
29. The build banner contains semantic version `0.3.37` but no source commit, build fingerprint, or deterministic artifact identity visible at runtime. Two different bundles built without changing metadata are indistinguishable in BetterDiscord. The repository's current floating status renderer emits compact numeric text such as `0/0`, while the observed client showed the older sentence-style status. Without an embedded build identity, support cannot distinguish a stale loaded bundle, a stale DOM node, or the current source from the UI alone.
30. Documentation remains noisy enough to misdirect implementation. `recovery-plan.md` has grown beyond 2,100 lines and mixes the active reopened debug with checked historical tasks and code templates. The conflicting extraction plan was archived outside Git on 2026-08-16; the remaining work is to compress the canonical recovery plan to one short active sequence.
31. `styles.js` contains an exact duplicate `.translator-settings-panel-root` rule and formatting residue around it. The responsive second `.translator-prefix-translation-row` rule is intentional rather than a conflict. This duplicate does not explain the message colour failure, but it confirms that presentation code has accumulated by append-style edits and needs ownership-based cleanup after the render root cause is fixed.
32. The DOM acknowledgement checks only the revision attribute emitted from `MessageContent`. It does not compare the rendered body text, translated class, computed colours, watermark, embed fields, reply preview, or thread title with the expected revision. A child decoration render can therefore be reported as confirmed while the parent body is still original, and a message-body acknowledgement can hide a stale embed or preview.
33. Manual, live, and historical results do not share one latest-command identity. A manual commit clears `requestIdentity`; the terminal-result validator treats a current null identity as unconstrained, so an older automatic result can overwrite the newer manual result. Channel disable, message edit, and deletion cancel automatic work but do not invalidate an already running manual callback by channel generation, source signature, or deletion tombstone.
34. Historical `commitBatch` rejects the entire recorded batch when any one result is stale or invalid. One edited or superseded message in a 50-message result can therefore prevent the other 49 valid translations from committing, while the return value reports only the actually invalid item and leaves the collateral drops unexplained.
35. Runtime request generations do not cover worker and callback ownership. A live worker's `finally` unconditionally clears the shared busy flag even after stop/start has created a newer worker. Reply-preview tokens restart at `preview-1` with a new display runtime, permitting an old callback to collide with a new token. Historical status/tracker updates also continue after the awaited display transaction without a second current-generation check.
36. Translation-provider requests are logically invalidated but not physically aborted. The live scheduler uses one global busy flag across channels, so a slow request from a left or disabled channel can continue consuming the provider connection and block a new channel until completion or timeout.
37. Historical status identity is based on `channelId + batch`, but runtime job creation owns a distinct `job.id` and does not reliably advance the status batch. `sealedTotal` can consequently carry an old job's total into a later job. `HistoricalDisplayTracker` also stores only one pending batch per channel, so beginning a later display acknowledgement replaces an unfinished earlier one.
38. Live priority is enforced only between historical jobs, not inside a running historical provider request. Worse, historical commit deliberately echoes the currently active request identity so the batch may supersede concurrent live work for the same message. The runtime therefore does not satisfy the documented single coordinator with newest live/manual command ownership.
39. `receivedAutoTranslateLoadedLimit` remains in defaults and runtime reads, but the extracted settings panel has no control that writes it. Tests assign the value directly. The configured quantity shown in an existing installation may therefore be legacy persisted data rather than a setting the current UI can inspect or change.
40. A failed history prefetch is swallowed, the channel is marked initialized before the asynchronous snapshot completes, and the smaller snapshot is allowed to finish normally. The status capsule then hides a successful terminal record after three seconds. This creates the observed chain: configured 50 -> roughly mounted 20 -> apparently complete -> status disappears -> later scroll discovers more messages.
41. The sent-message store validates each request independently but has no per-message latest-edit sequence and no ordered send lane. Two rapid edits can commit in callback order rather than user order, and two translated sends can be submitted in reverse if the second provider call finishes first.
42. Lifecycle cleanup is incomplete beyond the already identified anchor timers. Status positioning has a cancellable animation frame that `clear()` does not cancel; live channel-state, toggle-version, and historical-generation maps retain visited channel keys; provider promises can retain snapshots after logical cancellation. Cleanup needs one runtime-owned task registry and bounded channel-session release contract.
43. Reply-preview styling is deliberately stripped: runtime code removes translator classes/styles and CSS forces preview backgrounds transparent. That explains some reports of translated text without a translation block, but the product specification does not currently state this exception. The visual contract must explicitly decide whether previews share translated decoration; implementation and tests must then match that decision.
44. Focused tests can load the committed root plugin without first rebuilding it. `npm test -- <file>` therefore may execute an older bundle after `src/` changes; only `npm run verify` performs the deterministic build check. RED/GREEN commands must either test source modules directly or build/check the bundle before any test that instantiates the generated plugin.
45. Release bookkeeping is inconsistent: package metadata and the generated bundle are `0.3.37`, while `CHANGELOG.md` still ends at `0.3.36`. The build contract checks package/metadata/bundle agreement but not changelog or deployed/loaded artifact identity.

The next implementation must first prove the updateable channel-stream render boundary and the real history-fetch return shape with captured runtime evidence. No display owner, prefetch, or acknowledgement strategy is considered complete from mocked helper calls alone.

### Full Debug Coverage Matrix

The release gate covers all boundaries below:

- message acquisition: mounted rows, Discord cache, bounded prefetch, live messages, replies, embeds, short text, and thread titles;
- transport and parsing: exact request IDs, missing/duplicate/reordered provider results, partial success, backup-provider handoff, timeout, retry, and cancellation;
- state: immutable source, message signature, channel generation, automatic/manual origin, suppression, cache reuse, and render revision;
- rendering: parent text projection, child decoration, loading indicator, reply/embed host rows, title refresh, and DOM revision acknowledgement;
- virtualization and interaction: row reuse, unmount/remount, historical loading, row-height change, user scroll intent, composer input, and channel switching;
- lifecycle: edit, delete, disable, re-enable, plugin stop, reload, stale result rejection, cleanup, and bounded runtime memory;
- status and theme: configured historical maximum, translated/ready/visible/failed separation, compact localization, and Discord theme variables;
- distribution: deterministic source bundle, syntax/tests, artifact hash, installed-file hash, backup, rollback, and explicit real-client smoke evidence.

## Design Principles

1. One module owns the complete display state for every message.
2. Original Discord content is captured as an immutable snapshot and is never reconstructed from translated props.
3. Translation policy, provider transport, state commit, and Discord rendering are separate modules.
4. Message text, translated decoration, loading state, and original restoration are committed through one display transaction.
5. Runtime state is channel-isolated and generation-bound.
6. Every item ends as translated, skipped with a reason, failed with a reason, or cancelled.
7. Discord adapters may read and clone Discord objects, but domain modules never mutate Discord store objects.
8. Tests exercise module interfaces and rendered output contracts, not only internal function calls.
9. One migration phase changes one ownership boundary and remains deployable.
10. Legacy code is deleted only after the replacement passes automated and DiscordPTB verification.

## Target Source Layout

```text
src/
  plugin/
    index.js
    lifecycle.js
    discord-patches.js

  display/
    message-state-store.js
    translation-display-controller.js
    discord-render-adapter.js
    message-display-adapter.js
    reply-display-adapter.js
    embed-display-adapter.js
    thread-title-display-adapter.js

  translation/
    orchestrator.js
    received-policy.js
    sent-policy.js
    language-detection.js
    prompt-policy.js
    result-validator.js

  runtime/
    live-translation-queue.js
    historical-translation-job.js
    translation-cache.js
    lifecycle-generation.js

  providers/
    provider-registry.js
    provider-client.js
    google-free.js
    google-cloud.js
    deepl.js
    microsoft.js
    openai.js
    gemini.js
    openai-compatible.js

  settings/
    schema.js
    migrations.js
    settings-store.js
    channel-settings.js
    global-settings.js

  protection/
    placeholders.js
    protected-terms.js

scripts/
  build-plugin.mjs

tests/
  display/
  translation/
  runtime/
  providers/
  settings/
  integration/
```

The target is 25-35 production modules. Normal modules should remain under 400 lines, no production module should exceed 500 lines without an explicit architecture review, and `src/plugin/index.js` should remain under 250 lines.

## Core Message State

`MessageStateStore` is the only owner of translated message display state.

```js
{
  messageId: "123",
  channelId: "456",
  generation: 4,
  source: {
    content: "Hello",
    embeds: []
  },
  status: "translated",
  translation: {
    content: "你好",
    inputLanguage: "en",
    outputLanguage: "zh-CN"
  },
  reason: null,
  origin: "automatic"
}
```

Allowed statuses are:

```text
idle -> pending -> translating -> translated
                              \-> skipped
                              \-> failed
                              \-> cancelled
```

The `source` snapshot is immutable. A translated result never overwrites it. Disabling automatic translation changes what is rendered; it does not need to recover content from a previously mutated Discord object.

## Deep Module Interfaces

### MessageStateStore

Owns immutable source snapshots and current display state.

```text
captureSource(snapshot)
markPending(messageId, requestIdentity)
commitResult(result)
commitBatch(results)
markSkipped(messageId, reason)
markFailed(messageId, reason)
cancelChannel(channelId, generation)
restoreChannel(channelId)
restoreAll()
markRenderOutcome(outcome)
getDisplayState(messageId)
listChannel(channelId)
```

Callers do not access internal maps.

### TranslationDisplayController

Converts message states into one display transaction.

```text
renderMessage(messageId)
commitMessageResult(result)
commitHistoricalBatch(results)
restoreChannel(channelId)
restoreAll()
```

A transaction contains message text, watermark, translated style, loading state, original block, and embed/reply updates together.

### DiscordRenderAdapter

Contains all knowledge of Discord and BDFDB rendering internals.

```text
captureVisibleMessages(channelId)
applyDisplayTransaction(transaction)
refreshChannelTransaction({channelId, views, hostMessageIds, transactionId})
confirmMountedViews({channelId, views})
refreshThreadTitles(channelId)
```

No translation policy or provider logic is allowed in this adapter. Real-client evidence (2026-08-13, DiscordPTB app-1.0.1212; archived debug transcript) proved that `forceUpdate` on any node around the channel-stream boundary — per-message owners, the stream owner, or its nearest updateable ancestor — does not repaint the message list on current clients. The shipped contract is therefore: each display transaction triggers at most one whole-list rebuild, message-row lookup uses a tolerant selector ladder that accepts composite `channelId-messageId` shapes, and message DOM nodes and IDs are used only for mounted-state detection and revision confirmation.

The adapter returns separate `confirmedIds`, `deferredIds`, `missingIds`, and `ownerMissing` evidence. `deferredIds` means the row was not mounted. A mounted row without the requested revision is `missing`, never deferred or displayed. Off-screen rows remain state-ready and render from the store when mounted. A whole-list rebuild is budgeted at most once per display transaction; confirmation retries are read-only DOM checks and never rebuild, and purely virtualized rows never trigger a rebuild.

### TranslationOrchestrator

Coordinates policy, queues, providers, validation, cache, and display commits.

```text
translateLive(snapshot, context)
translateHistorical(snapshots, context)
translateManual(snapshot, context)
cancelChannel(channelId, generation)
```

It returns structured results and never edits React props.

### HistoricalTranslationJob

Owns one immutable, channel-scoped ID snapshot. Provider requests may be split internally, but terminal results are returned as one batch. The job does not render Discord directly.

### ProviderRegistry

Resolves one provider adapter by provider ID. Every adapter returns the same result type and shares timeout, retry, error normalization, and protected-placeholder validation through `provider-client.js`.

## Received Message Flow

```text
Discord patch
  -> MessageSnapshot
  -> MessageStateStore.captureSource
  -> TranslationOrchestrator
  -> live queue or HistoricalTranslationJob
  -> ProviderRegistry
  -> validated TranslationResult
  -> MessageStateStore commit
  -> TranslationDisplayController transaction
  -> DiscordRenderAdapter refresh
  -> render acknowledgement or visible failure
```

Historical results enter the state store together. One historical display transaction then refreshes the active channel-stream projection and confirms the exact committed message revisions. New live messages use a separate high-priority scheduling lane and request an immediate channel transaction without waiting for historical work.

## Live And Historical Scheduling

The orchestrator owns two independent lanes:

- The live lane is high priority and has no intentional batching timer. A new message starts as soon as a provider slot is available. Messages observed in the same event-loop turn may be coalesced without adding delay.
- The historical lane is low priority. One immutable job contains up to the configured number of eligible message snapshots and commits its terminal valid results in one display transaction.

When the provider supports two concurrent requests, one slot may serve live work while one serves historical work. With a single slot, a running request is allowed to finish, then live work is selected before the next historical request. Historical repair never starves live translation.

## Historical Message Source

`HistoricalMessageSource` builds a channel-scoped snapshot in this order:

1. Capture rendered message snapshots.
2. Read compatible snapshots already held by Discord's message store.
3. Deduplicate by message ID and order newest first.
4. Apply translation eligibility rules.
5. If fewer than the configured maximum remain, issue one bounded prefetch sequence for only the missing quantity.

Prefetched records stay in plugin-owned job and translation state. The source does not simulate user scrolling, mutate Discord store objects, or insert records into the virtualized list. Prefetch is cancelled when the channel generation changes or automatic translation is disabled. A failed prefetch seals the job at its actual available size instead of blocking live work.

## Display Transaction And Host Ownership

Translation state and Discord component ownership are related but distinct. A display transaction contains translated message IDs plus any host-row IDs whose reply previews project those translations. The channel-isolated mapping is one referenced message ID to zero or more host reply-row IDs. Clearing a preview retains a non-active restore candidate until the host row confirms the restored revision, so an already-painted preview cannot be mistaken for original text.

The render adapter requests one channel-scoped parent refresh per coalesced transaction. It does not depend on updateability of per-message functional or memoized owners. Parent `Messages` projection selects original or translated content first; child message, reply, and embed render paths then apply matching decoration from the same immutable revision. Thread titles remain a separate surface with a separate acknowledgement.

A mounted row that fails revision acknowledgement is a visible render failure and may receive one repeat of the same channel transaction after evidence is recorded. A row that is not mounted remains virtualized-ready and renders from the state store when it later mounts. Repeated failure reopens root-cause investigation instead of escalating to broader repaint helpers.

Before the update, the adapter captures a visible anchor and offset. It restores that offset once after paint unless user scroll intent changed during the transaction. Composer, channel list, member list, and unrelated channels are not part of the transaction.

## Loaded Translation Status

`TranslationStatusStore` derives its total from the sealed historical job snapshot and its completed count from valid results committed to translation state, including virtualized-ready rows. It does not use the number of currently mounted rows and does not overwrite the exact final count with later generic job progress.

The primary capsule is language-neutral: translation icon, `completed/total`, and elapsed seconds while active. Retry, visible-row, background-ready, and provider detail stay in the hover explanation. The component consumes Discord theme variables and updates independently from message rendering.

## Disable And Stop Flow

Disabling one channel:

1. Start a versioned channel-toggle transaction and increment the channel display generation. A stale disable completion cannot clear a newer re-enabled session.
2. Cancel pending automatic work for that channel.
3. Restore automatic and manual message display states and clear channel-scoped manual suppression while retaining immutable source snapshots and valid translation-cache entries.
4. Clear reply-preview and embed projections and restore the thread title as part of the same disable flow.
5. Request one parent channel-stream transaction so all mounted messages and reply/embed hosts read restored state in the same React cycle; virtualized rows read restored state when they mount.
6. Keep manual translation available after disable so a newer per-message action can display a cached or newly translated result.

Stopping the plugin performs the same operation for every channel before unregistering patches.

## Edit Flow

An edited Discord message creates a new immutable source snapshot and a new signature. Previous pending work and display results for that message are cancelled. Sent-message editing obtains original text from the state store, never from translated React props.

## Settings And Persistence

Persistent data is split by responsibility:

```text
settings              Global behavior and display preferences
channelSettings       Channel enablement, languages, and provider override
providerCredentials   API keys, endpoints, and models
translationCache      Bounded successful translation cache
```

The global primary default, global backup provider, detection strategy, and every provider credential remain global. A channel may override only the channel-owned primary provider and language choices defined in `docs/settings.md`.

Runtime queues, message display state, scroll state, and active generations remain in memory and are never stored in the settings document.

When the user leaves a channel, `MessageStateStore` prunes records that can be reconstructed from the bounded translation cache. It retains active requests, active manual translations, manual-untranslate suppression, unconfirmed restore records, and source archives until their owning workflow finishes; a confirmed manual restore becomes prunable after its archive is consumed. If no records remain, the channel index, display generation, and reply-preview eligibility are released too. Revisiting the channel captures the source again and commits a matching cached translation without another provider request.

Every persistent document has an explicit schema version and one migration entry point. Compatibility reads are removed after the corresponding migration has shipped and been verified.

## Build And Verification

Required commands after the build migration:

```text
npm run build
npm run check
npm test
npm run verify
```

`npm run verify` must:

1. Build the plugin from `src/`.
2. Verify the committed plugin file matches a fresh deterministic build.
3. Syntax-check the generated plugin.
4. Run unit, contract, integration, migration, and build tests.

The generated readable release target is 7,000-8,500 lines and 350-450 KB. Size is a guardrail, not a reason to remove required behavior.

## Testing Strategy

Tests are divided by confidence level:

- Domain tests verify state transitions, policy, provider parsing, and cancellation.
- Display contract tests assert complete display transactions, including text, watermark, styling, loading, and restoration.
- Discord adapter tests use captured component/Fiber shapes, exercise the real `Messages` before -> child after order, and verify both the parent refresh boundary and exact DOM revision acknowledgements.
- Build tests verify metadata, one-file output, deterministic bytes, and exclusion of test/debug code.
- DiscordPTB smoke tests verify hover-independent display, disable restoration, atomic historical reveal, scroll stability, edits, titles, stop, and reload.

A test that only asserts `findOwner`, `forceUpdate`, `forceAllUpdates`, or another refresh helper was called is not sufficient evidence that a visible message changed. Tests may not fabricate confirmation as a side effect of the refresh mock.

## Observability

Debug builds expose a bounded in-memory transition journal keyed by channel ID and message ID:

```text
captured -> queued -> provider-started -> provider-finished
         -> state-committed -> render-requested -> render-confirmed
```

Skipped and failed items include a stable reason code. Diagnostic data is excluded from release output unless an explicit local debug build is requested.

## Migration Rules

- Freeze new feature work until the display vertical slice passes DiscordPTB verification.
- Introduce the build pipeline without changing runtime behavior.
- Move one deep module at a time and retain a compatibility adapter only while callers migrate.
- Do not create a second competing state map or queue.
- Do not delete legacy code in the same commit that introduces its replacement.
- Delete the legacy implementation in the next small commit after parity verification.
- Keep every migration commit deployable and reversible.
- Do not mark a phase complete from mocked tests alone when the phase changes Discord rendering.
