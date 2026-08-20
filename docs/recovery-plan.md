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
- Release metadata, README language entry points, CHANGELOG, generated artifact identity, and the complete automated suite are covered by `npm run verify`.

Working rules:

1. Reproduce and identify the owning state transition before editing.
2. Add a failing regression test before every runtime behavior change.
3. Preserve channel isolation, immutable source, live priority, cumulative identity, and user scroll intent.
4. Use debug probes only to answer a bounded question; keep raw evidence outside Git.
5. Require PTB observation when a change crosses Discord's render, Store, snapshot, or viewport boundary.

## Priority 0: Field Observation

**Status: OBSERVATION GATE — no confirmed active regression.** These are reopen conditions, not implementation tasks.
Do not change code for mild or ambiguous reports until one of these contracts reproduces with a build ID and trigger lane:

| Contract | Reopen when | Evidence to capture |
| --- | --- | --- |
| Forwarded original display | A translated forward again shows no translation, two originals, or cannot restore | Message type, automatic/manual action, original-display setting, revision/fallback lane |
| Old-history channel enable | Enabling automatic translation while reading an old date lands at newest or loses the reading line | Before/after visible message IDs, scroll intent sequence, anchor/fallback outcome |
| Composer stability | Repeated whole-chat fallback causes disruptive icon blinking or blocks scrolling | `L/R` and lane diagnostics, action, channel type, whether the user was scrolling |
| Capsule placement/count | Count resets, stale format returns, or alignment leaves the composer after a client UI update | Build ID, channel switch state, capsule text, anchor/hint geometry |

Scrollbar-thumb movement caused only by added row height is expected; reopen when the reader's message position is lost.

## Priority 1: Message Deletion Dispatcher

**Status: SINGLE DELETE FIELD-CONFIRMED — bulk-delete observation pending.** Installed build `d8af59cf7ce43f9c` received a real single-delete event on 2026-08-20; the message disappeared and its dependent view updated normally. The global `dispatch` patch is gone, and both delete action types subscribe directly through the Store resolver already shared with Flux row repaint.

Automated evidence covers idempotent start, exact stop/unsubscribe, partial-start rollback, absent/throwing Store handles, single/bulk payload normalization, and channel-isolated cleanup of display state, reply hosts, live/history queues, and cache. The capsule's cumulative identity deliberately remains: `product.md` defines it as messages displayed during the channel session and resets it only on a global tracking reset.

Close this item after one PTB bulk-delete observation confirms the second real event shape reaches the subscription. Automated tests already cover exact stop/unsubscribe and duplicate-start prevention.

## Priority 2: Historical Source Completeness

**Status: PARKED AFTER FIELD ROLLBACK.** User-driven upward scrolling already loads and batch-translates older messages. Commit `8a3876b` changed only the initial background path from one bounded prefetch to as many as eight requests in an attempt to fill the configured eligible target; field testing reported many errors, so revert `e064fcd` restored the one-request behavior and installed build `d8af59cf7ce43f9c`.

Do not reintroduce automatic multi-page history fetching from this backlog item. Reopen only with a concrete user-visible underfill reproduction, captured fetch/store response shapes, and a design that proves additional background requests will not destabilize scrolling, batching, capsule accounting, or rendering. The working user-scroll translation path is a separate flow and is not evidence for this issue.

## Priority 3: Lifecycle And Cancellation

**Status: PARTIALLY COMPLETE.** Historical prefetch already has an `AbortController`, and `MessageStateStore.pruneChannel` already releases its final channel generation when no retained state needs it. The remaining work is narrower:
Consolidate asynchronous ownership without changing user-visible translation policy:

- one runtime-owned registry for workers, provider abort controllers, timers, animation frames, preview waves, and delayed viewport checks;
- physical cancellation for translation-provider requests where the transport supports it; historical prefetch cancellation is already implemented;
- cache flush on clean stop instead of abandoning the final debounce window;
- audit and deep-clone any remaining ordinary-message/embed restore sources that still share nested render objects;
- release remaining visited-channel maps outside `MessageStateStore`; its record index and generation pruning are already covered;
- stop/start tests proving an older worker cannot clear or overwrite a newer runtime epoch.

Split this priority into small lifecycle slices; do not land one global cancellation rewrite.

## Priority 4: Render Truth

**Status: OPEN WITH PARTIAL FOUNDATIONS.** Request identities, display revisions, and channel generations exist, but the following concrete gaps remain in current code/tests:
Strengthen confirmation and command identity after field evidence justifies the change:

- Body text, decoration, embeds, reply previews, and titles need surface-specific confirmation; one child revision marker is not proof that every visible surface is current.
- Manual, live, historical, edit, delete, preview, and disable operations need one latest-command identity so an older callback cannot supersede newer intent.
- Historical terminal validation should account for stale items individually instead of hiding valid siblings without an explicit reason.
- Render projections should remain read-only during one React pass.
- Captured real parent/child and Store shapes outrank synthetic owner mocks for render-boundary decisions.

The unresolved product decision is whether reply previews should carry the same translated decoration as full messages. Decide and document that behavior before changing preview styling.

## Priority 5: Architecture

**Status: OPEN.** The retired atomic rebuild cleanup is complete on the current branch, but the composition root and oversized ownership boundaries remain.
Continue bottom-up ownership extraction; do not replace the composition root in one rewrite.

- `src/legacy/runtime.js` remains the lifecycle/patch composition root and may only shrink.
- Move wiring into a composition module when one responsibility can leave with contract tests and no new shared state.
- Split oversized provider, settings, label, style, and display modules by ownership rather than arbitrary line count.
- Keep the single readable generated plugin as the distribution contract.

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
