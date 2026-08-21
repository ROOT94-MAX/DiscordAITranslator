# Architecture

[简体中文](architecture.zh-CN.md)

This document describes the current runtime boundaries and migration rules. User-visible behavior belongs to `product.md`, setting ownership to `settings.md`, provider contracts to `providers.md`, operational incident history to `field-debugging-guide.md`, and unfinished work to `recovery-plan.md`.

## Current Status

- Release line: v0.3.40.
- Distribution artifact: one readable `DiscordAITranslator.plugin.js` file generated deterministically from `src/`.
- Published v0.3.40 build ID: `c0b27e1479677971`; current repository build ID: `c0b27e1479677971`.
- Legacy composition-root ratchet: 3,248 lines and two module-level shared declarators; Slice 5d originally closed at 3,260 before later bounded wiring extraction.
- Release verification: deterministic build check, syntax check, release-contract checks, and the complete Node test suite through `npm run verify`.
- Display strategy: mounted message rows attempt a channel-scoped Flux `MESSAGE_UPDATE` merge first. A whole-chat rebuild is a confirmed fallback, not the default per-result path.

Slice 5d composition-root extraction is complete. `src/legacy/runtime.js` remains the legacy plugin facade and lifecycle patch shell, with 19 explicitly inventoried lazy singletons of at most eight lines each. This closes the bounded extraction plan; it does not claim that the separate render, lifecycle, or oversized-module debts below are complete.

## Distribution Contract

BetterDiscord users install exactly one file:

```text
DiscordAITranslator.plugin.js
```

The generated file is not edited by hand. Its source path is:

```text
src/plugin/index.js
        -> scripts/build-plugin.mjs
        -> DiscordAITranslator.plugin.js
```

The build uses esbuild in CommonJS mode with an ES2020 target, preserves the BetterDiscord metadata banner, strips release-disabled probes, and embeds a deterministic build ID. `package.json`, `package-lock.json`, `src/plugin/metadata.json`, README, CHANGELOG, and the generated banner must agree on the release version.

## Ownership Map

| Concern | Current owner | Contract |
| --- | --- | --- |
| Received message state | `src/display/message-state-store.js` | Immutable source, request identity, automatic/manual origin, suppression, preview state, display revision, and restore archive |
| Display transactions | `src/display/translation-display-controller.js`, `src/display/display-runtime.js`, `src/display/display-runtime-wiring.js` | One channel-scoped commit boundary for message IDs and reply-preview host IDs; one adapter owns Flux/Store, browser, timer, capsule, and viewport ports |
| Row repaint and fallback | `src/display/flux-row-repaint.js`, `src/display/discord-render-adapter.js`, `src/display/repaint-scheduler.js`, `src/display/repaint-scheduler-wiring.js` | Flux row merge first; body and preview-host DOM revisions confirm independently; all message surfaces stay targeted, while explicit lifecycle work retains separately counted `full` repaint |
| Historical acquisition and batching | `src/received/historical-source-runtime.js`, `src/orchestrator/historical-snapshot-cadence.js`, `src/orchestrator/historical-snapshot-cadence-wiring.js`, `src/orchestrator/historical-translation-job.js` | Immutable channel jobs, 500 ms quiet-window sealing, waiting-job absorption, one atomic batch commit; one adapter owns cadence host ports |
| Live scheduling | `src/orchestrator/live-translation-queue.js`, `src/orchestrator/live-translation-queue-wiring.js` | High-priority channel-aware work that is not delayed behind historical collection; one adapter owns plugin policy/display/history/session ports and managed retry timers |
| Message deletion lifecycle | `src/lifecycle/message-deletion-lifecycle.js`, `src/lifecycle/message-deletion-lifecycle-wiring.js` | Direct Store subscriptions; channel-scoped live/history/cache/display cleanup; one adapter owns cleanup fan-out and dispatcher resolution |
| Translation policy and dispatch | `src/orchestrator/translation-pipeline.js`, `src/providers/provider-client.js`, `src/providers/provider-client-wiring.js` | Protection, language policy, primary/backup dispatch, provider integrity, retry, and error reporting; one adapter owns plugin/BDFDB transport ports |
| Viewport preservation | `src/viewport/message-viewport-store.js`, `src/viewport/message-viewport-wiring.js` | Reading-line anchor, user-intent veto, bottom-stranding rescue, raw-offset fallback, and settle checks; one adapter owns browser/BDFDB host ports |
| Loaded status | `src/status/loaded-translation-status-store.js`, `src/ui/loaded-status-capsule.js`, `src/ui/loaded-status-capsule-wiring.js`, `src/ui/loaded-status-position.js` | Cumulative channel count, capsule lifecycle, retry affordance, and native-hint-aware geometry; one adapter owns Store, browser, positioning, and plugin callback ports |
| Forwarded content projection | `src/display/translation-display-logic.js`, `src/received/received-translation-runtime.js` | Snapshot-aware source, paint, echo detection, one-original composition, and restore |
| Composer and menus | `src/ui/composer-wiring.js`, `src/ui/context-menu-wiring.js` | Channel submit interception, input icon, and manual actions |
| Settings schema and persistence wiring | `src/settings/plugin-defaults.js`, `src/settings/settings-store.js`, `src/settings/settings-store-wiring.js`, `src/ui/settings-panel.js` | One schema and one owner for global versus channel settings; one BDFDB adapter owns the established persisted keys |
| Translation cache and persistence wiring | `src/cache/translation-cache-store.js`, `src/cache/translation-cache-wiring.js` | Bounded paid-result/paid-skip cache; one adapter owns the BDFDB key, managed debounce timers, and caller policy/display ports |
| Legacy plugin facade and composition | `src/legacy/runtime.js` | Plugin lifecycle, BDFDB patch shell, public compatibility facade, and 19 compact lazy singleton boundaries; new host fan-out belongs in owning wiring modules |

## Architectural Invariants

1. Channel state, display records, queues, reply hosts, viewport state, status counters, and cleanup are channel-isolated.
2. Provider credentials, endpoints, models, global primary/backup defaults, and detection strategy remain global.
3. The input-box translator icon controls automatic translation only for the selected channel.
4. Translation state commit and visible render confirmation are distinct operations.
5. Original source content is immutable. Display code works on detached or prototype-preserving clones and never mutates Discord store objects in place.
6. One user action must not create parallel state maps, repaint owners, or original-display branches.
7. Historical results commit as a batch. Cumulative status accounting does not imply per-message visual refresh.
8. User scroll intent outranks delayed restoration work.
9. Missing, reordered, duplicated, wrong-language, or placeholder-damaged provider output is repaired or reported rather than silently displayed.
10. Debug evidence is excluded from the release bundle and repository history.

## Received Translation Flows

### Live and Manual Messages

1. Capture the immutable source and channel generation.
2. Apply eligibility, language, protection, and cache policy.
3. Register a request identity in `MessageStateStore`.
4. Dispatch through the channel's effective primary provider, then the global backup when permitted.
5. Validate the terminal result and commit translation state.
6. Start one ID-scoped display transaction.
7. Attempt Flux row repaint and confirm the exact body or preview-host DOM revision. Unresolved surfaces stay on bounded targeted retry and never remount the Composer.

Manual translation uses the same state and display transaction chain. Manual untranslate restores the archived source and suppresses immediate cached automatic repaint for that message.

### Historical Messages

Mounted and cached snapshots are collected without simulating scroll. Scroll-back arrivals wait for a 500 ms quiet window, then form an immutable channel job. Compatible waiting jobs merge before provider work starts. Valid terminal results enter the store together and one display transaction reveals the batch.

`new_only` has no historical job. During channel-session initialization, `received-translation-runtime.js` seeds the live boundary from the channel model's `lastMessageId`/`last_message_id` before walking the stream. The initial skip is evaluated per row: IDs at or below the frozen boundary are baseline, while an ID above it remains live. An empty stream without any channel boundary stays uninitialised until a real baseline appears. Source capture creates an `idle` display record, but only a previously `translated` view can set `messageChanged`; record existence alone cannot bypass the boundary. Together these rules prevent late virtualized history from entering the live queue. The capsule remains exclusive to `loaded_messages`; showing it in `new_only` would mask a classification defect rather than fix one.

Reply-preview state may commit immediately, but host-row repaint requests collect into a 300 ms channel wave and remain behind the active-scroll gate. Live work remains higher priority than the next historical request.

### Forwarded Messages

A forwarded message's parent `content` may be empty. Its visible source is normally `messageSnapshots[0].message.content`. Every source read, provider input, echo check, paint, original-display decision, cancel, and restore uses the same snapshot-aware helpers.

The snapshot is cloned with its prototype and forward-reference fields preserved. With received-original display off, one translated body is shown. With it on, the translation and exactly one inline quote/spoiler original are shown. Unknown marker properties are not used because Discord normalization may remove them.

## Display Transactions

A display transaction contains a channel ID, translated message IDs, host reply-row IDs, expected revisions, trigger lanes, and viewport intent captured for that transaction. The controller commits state before paint and records whether each row is mounted, confirmed, virtualized-ready, skipped, failed, or unresolved.

For mounted ordinary rows, `flux-row-repaint.js` dispatches a no-op-by-value `MESSAGE_UPDATE` merge through Discord's Store dispatcher. Current-client evidence confirms one message-list projection render with Composer/input/row/scroller identities preserved; exact DOM revision confirmation remains the visible-success verdict. Rows already carrying the expected revision require no repaint.

`discord-render-adapter.js` returns unresolved ordinary rows to the bounded scheduler and unresolved preview hosts to their 300 ms wave, with at most three attempts. Preview host commands use their own Store-owned surface revision and DOM marker. Function-component registry handles remain opportunistic because the current client exposes synthetic `{props}` objects without a class updater; reply hosts always use Store dispatch. The retired synchronous blank/remount implementation remains deleted.

## Viewport Ownership

`MessageViewportStore` is the only writer of translation-related scroll restoration.

- The reading anchor is the visible message nearest the viewport center, not the topmost row.
- Historical paint waits while the user is actively scrolling.
- A newer wheel/touch/drag gesture vetoes every delayed correction.
- Immediate restore can rescue a fallback remount that stranded an in-history reader at newest.
- Missing virtualized anchors fall back to the captured raw offset.
- Layout settling is checked at 180 and 600 ms without overriding newer user intent.

Scrollbar thumb geometry may still change when translated rows increase total content height. The protected contract is the reader's content position, not a motionless thumb.

When a live message arrives while the selected channel is reading history, the live queue arms a viewport guard before Discord commits the appended row. The viewport store captures the current reading line or reuses the latest user-history snapshot if the host already snapped to bottom, then restores it on the normal paint ladder. A newer user gesture still vetoes that restore.

## Loaded Translation Status

The capsule displays one cumulative ratio per channel. Unique translated message IDs are recorded at the message-state-store transition point, while the capsule DOM updates only on batch/status heartbeat. A later batch extends the same ratio, for example `13/13 -> 13/33 -> 33/33`.

That cumulative identity includes the effective received-translation configuration. When its signature changes, only that channel drops its displayed-ID set, seen-message boundary, failed retry snapshot, queued work, and initialization boundary before collecting the new configuration. Re-reading the same signature is a no-op, so normal renders never reset the ratio.

Configured capacity and inspected rows are not the denominator. Resolved skips leave pending work, stale batch reports are rejected, and retry/failure status uses the same cumulative basis. Channel switch hides the unrelated capsule without discarding its channel state.

Positioning uses the smallest valid native slow-mode/cooldown hint near the composer. With a hint, the capsule sits 8 px above it with right edges aligned; without one, it sits 8 px above the composer. Message-row text matches, zero-size rectangles, stale nodes, and temporary composer unmounts cannot move it to an unrelated location.

## Providers, Persistence, and Settings

Provider contracts live in `providers.md`. Google Free is keyless, uses encoded query length for chunking, maps protected terms to reversible transport-safe tokens, and returns through the same strict placeholder validator as other providers. Exact duplicate provider errors are coalesced for 10 seconds; different failures remain visible.

The retired `$discord` language sentinel remains readable only as a migration/compatibility input. Settings reload resolves it through `BDFDB.LanguageUtils.getLanguage().id`, persists that concrete id at global/server/channel output scope, and the selectable language table drops the alias key. The downstream normalizer still resolves an in-memory legacy value defensively before signature, same-language, script-family, provider-dispatch, and result-validation comparisons. A provider echo whose detected source matches that concrete target is a terminal same-language skip, not a failure. A failed historical snapshot stores the resolved configuration signature; ordinary stream rescans leave matching failures parked, while explicit retry bypasses the guard.

Persistent responsibilities are separated:

```text
settings              Global behavior and display preferences
channelSettings       Channel enablement, languages, and provider override
providerCredentials   API keys, endpoints, and models
translationCache      Bounded successful translation and paid-skip cache
```

Runtime queues, display state, viewport state, counters, probes, and generations are in memory only. `showOriginalMessage` is the sole received-original setting; the removed `showOriginalDirectly` value is ignored if it remains in old persisted data.

## Disable, Stop, Edit, and Cleanup

Disabling a channel advances its generation, cancels pending automatic work, restores automatic and manual message/preview/embed/title display for that channel, and starts one channel-scoped display transaction. Manual translation remains available afterward. A late result from an older generation cannot repaint the channel.

Stopping applies the same restoration to every channel before patches and managed tasks are released. The cache owner flushes one pending debounced write first; the runtime never reaches into its timer or cache object. Editing a message captures a new source signature and invalidates old pending/display results. Channel-session pruning keeps only state still needed for an active request, unconfirmed restore, manual suppression, or source archive.

When received translation configuration changes while an old translation is still painted, `MessageStateStore` retains that displaced translation only as restoration proof. Both stream and content render paths restore the immutable source before another capture; the proof is never exposed as an active translation. This prevents a previous target-language paint from becoming source text and repeatedly re-entering historical work.

## Diagnostics and Privacy

Debug builds may enable bounded transition journals and one-shot probes for message-update, forwarded-snapshot, row-owner, or positioning evidence. Release builds exclude probe activation and debug journals.

Raw evidence, provider configuration, API keys, account/channel identifiers, installed-plugin backups, and debug bundles stay outside Git. Repository fixtures use synthetic IDs, reserved example domains, and descriptive non-token-shaped credential placeholders.

## Build and Verification

Required commands:

```text
npm ci
npm run build
npm run verify
```

`npm run verify` checks deterministic source/artifact parity, JavaScript syntax, architecture ratchets, release metadata, bilingual document entry points, and all unit/contract/integration tests. A display change also requires PTB observation because a mocked refresh call alone does not prove visible Discord output.

## Known Debt

- `src/legacy/runtime.js` remains a 3,248-line legacy facade; further shrinkage requires a separately scoped ownership contract rather than an open-ended line-count task.
- Ordinary and reply-preview message transactions no longer enter whole-chat fallback. Explicit channel/provider/plugin lifecycle refreshes can still increment `full` and remount/refresh the Composer; they are the remaining render-boundary slice.
- Provider abort support and lifecycle task registry cleanup remain observation-gated in `recovery-plan.md`; automatic multi-page history fetching is parked after field rollback, while direct Store message-delete subscriptions are field-closed.
- Discord internal store and snapshot shapes require re-observation after client updates.
- Some modules remain large and should split only when ownership contracts and regression tests exist.

## Migration Rules

- Add a failing regression test before every runtime behavior change.
- Move one ownership boundary at a time; do not hide a redesign inside a compatibility patch.
- Do not create a second state map, repaint owner, queue, counter basis, or original-display mode.
- Preserve the single generated plugin artifact and channel/global ownership rules.
- Keep every commit buildable, verifiable, and reversible.
- Do not mark Discord-render work complete from synthetic tests alone.
- Lower the legacy runtime ratchet in the same commit that removes runtime ownership; never raise it to accommodate new code.
- Update both language entry points when architecture or field-debugging contracts change.
