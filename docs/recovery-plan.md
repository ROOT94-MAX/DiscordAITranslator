# Recovery Plan

This is the canonical recovery status ledger: one verified completed baseline followed by the **active-only** backlog. User-visible behavior belongs to `product.md`, setting ownership to `settings.md`, provider contracts to `providers.md`, and current code boundaries to `architecture.md`.

Completed incident history, rejected approaches, and field evidence live in `field-debugging-guide.md`. Do not copy those timelines back into this file. A backlog item appears here only while it still has an executable next step.

## Verified Completed Baseline (Not TODO)

Everything in this section is already shipped or verified. It is retained only so future work starts from the correct current state.

- v0.3.40 is published from `master` as one deterministic `DiscordAITranslator.plugin.js` artifact.
- Mounted ordinary messages attempt Flux row repaint first; one whole-chat repaint remains the confirmed fallback.
- Historical snapshots seal after a 500 ms quiet window, compatible waiting work merges before start, and one job commits one display batch.
- Viewport restoration is owned by `MessageViewportStore` and obeys newer user scroll intent.
- The capsule uses one cumulative per-channel ratio and records unique translated message IDs at the state-store transition point.
- Forwarded messages use snapshot-aware extraction, paint, original display, cancellation, and restore.
- Google Free chunks by encoded query size and uses reversible transport-safe protected placeholders.
- Field observation is closed for the automatic collection/count mismatch, direct single/bulk message deletion, forwarded one-original display, and enabling automatic translation while reading old history.
- Release metadata, README language entry points, CHANGELOG, generated artifact identity, and the complete automated suite are covered by `npm run verify`.
- Slice 5d composition-root extraction is complete: `src/legacy/runtime.js` is 3,260 lines with two module-level mutable declarators and 19 explicitly inventoried lazy singleton boundaries, each no more than eight lines.

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

Restart this work only after a fresh recon against the current `settings-panel.js`, `translate-components.js`, labels, styles, and v0.3.40+ tests.

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
