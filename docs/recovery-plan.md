# Recovery Plan

This is the canonical **active-only** backlog. User-visible behavior belongs to `product.md`, setting ownership to `settings.md`, provider contracts to `providers.md`, and current code boundaries to `architecture.md`.

Completed incident history, rejected approaches, and field evidence live in `field-debugging-guide.md`. Do not copy those timelines back into this file. An item appears here only while it still has an executable next step.

## Current Baseline

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

Do not change code for mild or ambiguous reports until one of these contracts reproduces with a build ID and trigger lane:

| Contract | Reopen when | Evidence to capture |
| --- | --- | --- |
| Forwarded original display | A translated forward again shows no translation, two originals, or cannot restore | Message type, automatic/manual action, original-display setting, revision/fallback lane |
| Old-history channel enable | Enabling automatic translation while reading an old date lands at newest or loses the reading line | Before/after visible message IDs, scroll intent sequence, anchor/fallback outcome |
| Composer stability | Repeated whole-chat fallback causes disruptive icon blinking or blocks scrolling | `L/R` and lane diagnostics, action, channel type, whether the user was scrolling |
| Capsule placement/count | Count resets, stale format returns, or alignment leaves the composer after a client UI update | Build ID, channel switch state, capsule text, anchor/hint geometry |

Scrollbar-thumb movement caused only by added row height is expected; reopen when the reader's message position is lost.

## Priority 1: Message Deletion Dispatcher

The existing MESSAGE_DELETE/MESSAGE_DELETE_BULK cleanup patch was originally pointed at a BDFDB dispatcher surface absent from BDFDB 4.5.4. The Store dispatcher discovered for Flux row repaint is the candidate replacement.

Next slice:

1. Add a failing integration test proving a deleted message removes display state, reply-host ownership, queue entries, and status identity only in its channel.
2. Extract one dispatcher resolver shared with the verified Store path; do not add another global lookup strategy.
3. Patch delete actions through the resolved handle and verify stop/start unsubscribe behavior.
4. Run the full suite and one PTB delete/bulk-delete observation before closing the item.

## Priority 2: Historical Source Completeness

The historical source must keep paging until it reaches the configured number of **eligible unique** messages, receives an explicit exhaustion signal, or reaches a documented page/request ceiling.

Required behavior:

- Off-channel, duplicate, already-owned, or ineligible records do not consume the eligible target.
- Prefetch failure and true exhaustion remain distinguishable from successful completion.
- An underfilled target never auto-hides as a successful full batch.
- Channel generation changes cancel collection without blocking live work.

Add source-level pagination tests before changing the Discord history adapter.

## Priority 3: Lifecycle And Cancellation

Consolidate asynchronous ownership without changing user-visible translation policy:

- one runtime-owned registry for workers, provider abort controllers, timers, animation frames, preview waves, and delayed viewport checks;
- physical provider cancellation where the transport supports it;
- cache flush on clean stop instead of abandoning the final debounce window;
- deep immutable restore sources for message and embed data;
- release channel generations and session maps once no active request, suppression, archive, or unconfirmed restore needs them;
- stop/start tests proving an older worker cannot clear or overwrite a newer runtime epoch.

Split this priority into small lifecycle slices; do not land one global cancellation rewrite.

## Priority 4: Render Truth

Strengthen confirmation and command identity after field evidence justifies the change:

- Body text, decoration, embeds, reply previews, and titles need surface-specific confirmation; one child revision marker is not proof that every visible surface is current.
- Manual, live, historical, edit, delete, preview, and disable operations need one latest-command identity so an older callback cannot supersede newer intent.
- Historical terminal validation should account for stale items individually instead of hiding valid siblings without an explicit reason.
- Render projections should remain read-only during one React pass.
- Captured real parent/child and Store shapes outrank synthetic owner mocks for render-boundary decisions.

The unresolved product decision is whether reply previews should carry the same translated decoration as full messages. Decide and document that behavior before changing preview styling.

## Priority 5: Architecture

Continue bottom-up ownership extraction; do not replace the composition root in one rewrite.

- `src/legacy/runtime.js` remains the lifecycle/patch composition root and may only shrink.
- Move wiring into a composition module when one responsibility can leave with contract tests and no new shared state.
- Split oversized provider, settings, label, style, and display modules by ownership rather than arbitrary line count.
- Separately clean the retired atomic rebuild implementation: `resolveFlushSync` is active, while `createAtomicChatRebuild` and its behavior tests are historical code. Move the resolver to a focused module only after a failing source contract pins the active consumer.
- Keep the single readable generated plugin as the distribution contract.

## Parked UI Redesign

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

Every recovery slice must provide:

1. a failing regression test or a bounded evidence capture proving the current gap;
2. the smallest owning-module change, without a parallel compatibility path;
3. focused tests plus `npm run verify`;
4. a deterministic plugin artifact and an installed-plugin backup before deployment;
5. PTB observation for Discord-internal behavior;
6. updated product/architecture/recovery documentation only when its owning contract changed;
7. a local rollback commit or tag before push/merge.

Closed work moves to CHANGELOG or `field-debugging-guide.md`; it does not remain here as a checked historical checklist.
