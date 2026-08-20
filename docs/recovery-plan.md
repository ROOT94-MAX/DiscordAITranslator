# Recovery Plan

This is the canonical recovery status ledger: one verified completed baseline followed by the **active-only** backlog. User-visible behavior belongs to `product.md`, setting ownership to `settings.md`, provider contracts to `providers.md`, and current code boundaries to `architecture.md`.

Completed incident history, rejected approaches, and field evidence live in `field-debugging-guide.md`. Do not copy those timelines back into this file. A backlog item appears here only while it still has an executable next step.

## Verified Completed Baseline (Not TODO)

Everything in this section is already shipped or verified. It is retained only so future work starts from the correct current state.

- v0.3.39 is published from `master` as one deterministic `DiscordAITranslator.plugin.js` artifact.
- Mounted ordinary messages attempt Flux row repaint first; one whole-chat repaint remains the confirmed fallback.
- Historical snapshots seal after a 500 ms quiet window, compatible waiting work merges before start, and one job commits one display batch.
- Viewport restoration is owned by `MessageViewportStore` and obeys newer user scroll intent.
- The capsule uses one cumulative per-channel ratio and records unique translated message IDs at the state-store transition point.
- Forwarded messages use snapshot-aware extraction, paint, original display, cancellation, and restore.
- Google Free chunks by encoded query size and uses reversible transport-safe protected placeholders.
- Field observation is closed for the automatic collection/count mismatch, direct single/bulk message deletion, forwarded one-original display, and enabling automatic translation while reading old history.
- Release metadata, README language entry points, CHANGELOG, generated artifact identity, and the complete automated suite are covered by `npm run verify`.

Working rules:

1. Reproduce and identify the owning state transition before editing.
2. Add a failing regression test before every runtime behavior change.
3. Preserve channel isolation, immutable source, live priority, cumulative identity, and user scroll intent.
4. Use debug probes only to answer a bounded question; keep raw evidence outside Git.
5. Require PTB observation when a change crosses Discord's render, Store, snapshot, or viewport boundary.

## Parked: Historical Source Completeness

**Status: PARKED AFTER FIELD ROLLBACK.** User-driven upward scrolling already loads and batch-translates older messages. Commit `8a3876b` changed only the initial background path from one bounded prefetch to as many as eight requests in an attempt to fill the configured eligible target; field testing reported many errors, so revert `e064fcd` restored the one-request behavior and installed build `d8af59cf7ce43f9c`.

Do not reintroduce automatic multi-page history fetching from this backlog item. Reopen only with a concrete user-visible underfill reproduction, captured fetch/store response shapes, and a design that proves additional background requests will not destabilize scrolling, batching, capsule accounting, or rendering. The working user-scroll translation path is a separate flow and is not evidence for this issue.

## Observation-Gated: Lifecycle And Cancellation

**Status: PARTIALLY COMPLETE — remaining work is observation-gated.** Historical prefetch already has an `AbortController`; `MessageStateStore.pruneChannel` releases unused channel generations; direct deletion subscriptions have exact start/stop ownership; and clean stop now flushes one pending cache debounce inside `translation-cache-store.js` instead of abandoning it.

The 2026-08-20 lifecycle audit found no evidence supporting one global task-registry rewrite. Keep provider physical cancellation, display/viewport delayed-callback consolidation, deep restore-source cloning, remaining map pruning, and a broader runtime epoch parked until a concrete quota, stale-callback, memory-growth, or source-mutation reproduction identifies the owning module. Continue only as independent TDD slices; do not add a parallel lifecycle state table.

## Observation-Gated: Render Truth

**Status: OPEN WITH PARTIAL FOUNDATIONS.** Request identities, display revisions, and channel generations exist, but the following concrete gaps remain in current code/tests:
Strengthen confirmation and command identity after field evidence justifies the change:

- Body text, decoration, embeds, reply previews, and titles need surface-specific confirmation; one child revision marker is not proof that every visible surface is current.
- Manual, live, historical, edit, delete, preview, and disable operations need one latest-command identity so an older callback cannot supersede newer intent.
- Historical terminal validation should account for stale items individually instead of hiding valid siblings without an explicit reason.
- Render projections should remain read-only during one React pass.
- Captured real parent/child and Store shapes outrank synthetic owner mocks for render-boundary decisions.

The unresolved product decision is whether reply previews should carry the same translated decoration as full messages. Decide and document that behavior before changing preview styling.

## Next Executable Slice: Architecture

**Status: ACTIVE — Slice 5d composition root.** The retired atomic rebuild cleanup is complete, but the composition root and oversized ownership boundaries remain. The first resumed cut moved plugin/BDFDB settings persistence wiring into `settings-store-wiring.js`; the legacy runtime retained only the lazy singleton boundary and its ratchet dropped from 3,476 to 3,448 lines without changing settings behavior.
Continue bottom-up ownership extraction; do not replace the composition root in one rewrite.

The first-cut PTB smoke exposed three connected configuration-transition gaps. A translation painted under the previous target language could lose its restore proof; old completed IDs and failed retries survived into the new capsule; and dynamic `$discord` was compared/dispatched as a literal special ID instead of Discord English, so English history entered work, same-language echoes became failures, and matching failures were automatically re-collected. The corrections restore immutable source, reset the affected channel session only on a real configuration change, turn same-language echoes into terminal skips, and park failed items until explicit retry or a new source/configuration. Field testing confirmed explicit Simplified Chinese translates loaded English history normally and both output selectors no longer expose `$discord`; that validated cut was fast-forwarded to `master` at `38082f6`.

The second resumed cut moved the translation cache's BDFDB persistence key, managed debounce timers, and source/signature/display/policy callback wiring into `translation-cache-wiring.js`. The cache store and every public runtime delegation remained unchanged; installed build `64ea246abd086f70` preserved all 301 live cache entries byte-for-byte, and the validated cut was fast-forwarded to `master` at `7639cb7` with the ratchet at 3,431 lines.

The third resumed cut moved provider-client request, timer, credential/language, notification, and AI prompt-policy wiring into `provider-client-wiring.js`. Managed retry timers still use BDFDB while backoff sleep remains deliberately raw, so plugin stop cannot strand an awaited promise. All 1,286 tests and a real keyless English-to-Chinese request passed; installed build `27a66a9c04c7b371` left the complete configuration byte-identical, and the validated cut was fast-forwarded to `master` at `ed2b0af` with the ratchet at 3,415 lines.

The fourth resumed cut moved Message Viewport document, managed timer, animation-frame, selected-channel, scroller-selector, CSS escaping, and scroll-idle callback wiring into `message-viewport-wiring.js`. All 1,290 tests passed and installed build `abaa550cd78f3382` left configuration byte-identical. PTB confirmed history position, active-scroll veto, bottom/input focus, and cross-channel isolation. Returning to channel A landed at the native client bottom position, but channel B was never moved by A's restore work; that host navigation behavior was accepted and the validated cut was fast-forwarded to `master` at `ad5b117` with the ratchet at 3,404 lines.

The fifth resumed cut moved historical quiet-window managed timers, active-scroll state, queue identity, and snapshot-finish wiring into `historical-snapshot-cadence-wiring.js`. All 1,294 tests passed and installed build `b99e4ae741747bed` left configuration byte-identical. PTB confirmed one seal after continuous upward scrolling idled, no periodic capsule/repaint growth after completion, and one additional batch for the next newly loaded history segment; the validated cut was fast-forwarded to `master` at `d837f54` with the ratchet at 3,401 lines.

The sixth resumed cut moved Message Deletion Store dispatcher resolution plus live queue, historical job/failure ledger, cache, marker, and display cleanup wiring into `message-deletion-lifecycle-wiring.js`. The lifecycle still owns direct single/bulk subscriptions, deduplication, partial-subscribe rollback, cleanup order, and channel isolation; the legacy runtime keeps only its lazy singleton boundary and the ratchet dropped from 3,401 to 3,391 lines. Deterministic build parity and all 1,297 tests passed; installed build `aa1a1dd0823abeff` left the complete configuration byte-identical. The already-closed direct single/bulk deletion and cross-channel cleanup field evidence covers this wiring-only move, so no duplicate PTB pass was required; the validated functional cut was fast-forwarded to `master` at `66b258f`.

The seventh resumed cut moved Loaded Status Capsule selected-channel Store, browser positioning, runtime-active gate, scroll/retry, and DOM lifecycle callback wiring into `loaded-status-capsule-wiring.js`. The status store still owns cumulative per-channel identity and timers; the capsule controller still owns visibility and DOM policy; the legacy runtime keeps only its lazy singleton and compatibility positioning entry, and the ratchet dropped from 3,391 to 3,369 lines. All 1,300 tests passed; installed deterministic build `4432647c5d41772e` left the complete configuration byte-identical. Existing field evidence for cumulative count, native-hint positioning, heartbeat stability, and cross-channel hiding covered this wiring-only move, so no duplicate PTB pass was required; the validated cut was fast-forwarded to `master` at `2be5c3d`.

The eighth resumed cut moved Received Display Runtime Flux dispatcher, Message/Channel Store, browser DOM/animation-frame, managed timer, capsule accounting, repaint gate, and viewport restoration wiring into `display-runtime-wiring.js`. The display runtime still owns state/controller/render composition, while the legacy runtime keeps only its lazy singleton boundary and the ratchet dropped from 3,369 to 3,339 lines. All 1,303 tests passed; installed deterministic build `143512968d82fab2` left the complete configuration byte-identical. Its field confirmation was paired with the next Display Repaint Scheduler wiring cut.

The ninth resumed cut moved Display Repaint Scheduler render/outcome callbacks, Discord-state gates, lifecycle repaint, and managed timer wiring into `repaint-scheduler-wiring.js`. The scheduler still owns coalescing, lane attribution, bounded retry, deferral, and flush policy; the legacy runtime keeps only its lazy singleton boundary and the ratchet dropped from 3,339 to 3,329 lines. All 1,305 tests passed; installed deterministic build `65a775c63d76dffa` left the complete configuration byte-identical. PTB confirmed active-scroll veto and stable post-scroll completion. The composer/input still refreshed when a whole-chat fallback occurred, matching the already-open render debt rather than a new wiring regression; the user explicitly parked that issue for later. With that known debt recorded, the validated display-runtime and repaint-scheduler cuts were fast-forwarded to `master` at `04ea458` and `aa3057f`.

- `src/legacy/runtime.js` remains the lifecycle/patch composition root and may only shrink.
- Move wiring into a composition module when one responsibility can leave with contract tests and no new shared state.
- Split oversized provider, settings, label, style, and display modules by ownership rather than arbitrary line count.
- Keep the single readable generated plugin as the distribution contract.

Continue from the fresh inventory of lazy `ensureX` factories and their lifecycle ownership. For each cut, select one bounded wiring responsibility, pin its singleton/dependency contract in tests, move that wiring to its owning module, delete the replaced runtime wiring, and lower the architecture ratchet in the same commit. Every cut must preserve render, provider, settings, channel isolation, and installed-plugin behavior.

## Parked UI Redesign

**Status: PARKED — not part of the active implementation order.**
The former detailed UI redesign plan is archived outside Git at:

```text
<PROJECT_ARCHIVE>/2026-08-20-repository-hygiene/ui-redesign-plan.archived.md
```

Preserved decisions:

- Redesign the BetterDiscord settings panel and the channel settings content with one shared token/primitives system.
- Keep setting keys, defaults, persistence, translation behavior, and the BDFDB runtime dependency unchanged.
- Keep the BDFDB modal shell for the first channel-panel iteration.
- Treat capsule restyling as a separate decision after both settings surfaces are stable.
- Begin with a current control-to-setting contract inventory; do not implement from the archived line numbers or old branch assumptions.

Restart this work only after a fresh recon against the current `settings-panel.js`, `translate-components.js`, labels, styles, and v0.3.39+ tests.

## Delivery Gate

**Status: PROCESS RULES — not a product task.**
Every recovery slice must provide:

1. a failing regression test or a bounded evidence capture proving the current gap;
2. the smallest owning-module change, without a parallel compatibility path;
3. focused tests plus `npm run verify`;
4. a deterministic plugin artifact and an installed-plugin backup before deployment;
5. PTB observation for Discord-internal behavior;
6. updated product/architecture/recovery documentation only when its owning contract changed;
7. a local rollback commit or tag before push/merge.

Closed work moves to CHANGELOG or `field-debugging-guide.md`; it does not remain here as a checked historical checklist.
