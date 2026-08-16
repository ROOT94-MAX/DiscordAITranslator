# Recovery Plan

Canonical incomplete-work document. User-visible behavior is owned by `docs/product.md`; code boundaries and migration rules by `docs/architecture.md`. No item here is complete without recorded verification evidence.

**Shipped baseline (2026-08-16):** v0.3.38 released with the display repair series — hover-independent repaint via at-most-one whole-list rebuild per transaction, tolerant message-row selectors for composite `channelId-messageId` shapes, manual-path refresh, disable restoration, live/historical race guard, chunked historical progress, restored loaded-message limit control, capsule channel-exit cleanup, and the build fingerprint. Release tag `v0.3.38` → `e88c30d`; `npm run verify` 1108/1108; deployed build id `61cbf81a068feabf`. Rollback anchors: tags `v0.3.38` and `snapshot/pre-walk-removal-20260816`, plus the versioned backups in the BetterDiscord plugin directory.

**Archive:** the pre-compression transcript (reopened-debug evidence, the superseded 2026-08-10 parent-transaction design, captured fiber/prefetch shapes, all task history and code templates) is archived outside Git under `discord翻译-交付/2026-08-16-recovery-plan-archive/`. It is evidence, not a plan.

## Open Item: Floating Capsule Hint Alignment (parked 2026-08-16, awaiting fresh analysis)

**User rule:** with a native hint (slow mode etc.) the capsule floats directly above it and both RIGHT edges share one vertical line; without a hint it sits above the input, right side. The capsule must never cover the composer input or linger outside its channel (the lingering fix and the every-state visibility heartbeat are already shipped).

**Evidence collected (probe file `translator-second-debug.json`, `statusPositioning` + `survey` entries):**

- The hint is the `cooldownWrapper` ("慢速模式已开启"), recorded at top 1104-1126, right 1501 while the composer anchor was top 1127, right 1493 - i.e. directly above the input's top-right, 8px wider than the composer.
- Every container-scoped hint scan (composer parent, grandparent, then an 8-level ancestor walk bounded to 150px above the input) detected the hint 0 times across ~149 recorded positioning runs, while the document-wide survey saw it every time. The hint is not under any scanned composer ancestor within the walk bound.
- The old shipped plugin (0.3.32) detected it via a full `document.querySelectorAll("div, span")` scan plus proximity guards - but the user reports that full-document scan caused visible page flicker, and its final alignment was also wrong. Do NOT restore that approach.

**Constraint:** no document-wide per-positioning scan (flicker); no fixed-container or fixed-depth guess (all failed); nothing may read textContent off large subtrees per tick.

**Proposed but unapproved approach:** geometry probe - sample `document.elementsFromPoint()` at 2-3 points computed live from the composer rect (anchor.right - 30, anchor.top - 10/-20/-30), text-check only the few returned nodes, cache the found hint element and re-read its live rect for alignment. All coordinates are computed per pass from the live anchor; nothing absolute is stored. Needs a fresh reviewer to validate or replace.

The ancestor walk was removed entirely (2026-08-16, `e88c30d`; it also caused a per-second rescan flicker regression, cached afterwards); only the composer-parent scan from the shipped 0.3.32 remains, once per composer, and a regression test pins deeper levels off-limits.

**Current behavior:** hint detection effectively never succeeds on PTB 1.0.1214, so the capsule uses the no-hint fallback (above the input, right-aligned to the composer) at all times. In slow-mode channels this fallback visually OVERLAPS the hint strip (both sit directly above the input on this client), which users read as the old recognition having returned - the parked solution should also separate the fallback band from the hint strip.

## Paused: Observe Before Reopening

Scroll re-translation, race-damage leftovers, and failure-notice readability are paused. Use the plugin normally; when something reproduces, record what was happening at that moment (channel type, action, timing) before reopening any investigation.

## Next Phase: Display System Unification

The modular extraction created modules around a retained god object: `src/legacy/runtime.js` is still the composition root, Discord patch shell, UI coordinator, status DOM owner, and lifecycle dispatcher, directly importing most source modules, and the generated artifact exceeds the documented size guardrails. The next major phase:

- Replace the legacy entry with a small composition root and make the architecture gate require progress toward its deletion, not merely prevent line-count growth.
- Split oversized modules by ownership only after their behavior contracts are captured by tests; file movement alone is not refactoring completion.
- Keep every migration commit deployable and reversible (architecture.md migration rules).

## Deferred Hardening Backlog

Shipped by v0.3.38 (closed with evidence):

- [x] Deterministic build fingerprint in the artifact banner and settings panel (`04d81e0`; build id visible at runtime).
- [x] Explicit loaded-message limit control restored to the settings panel (v0.3.38 changelog; the runtime read was never removed).
- [x] Conflicting extraction plan archived outside Git; this file compressed to the active sequence (2026-08-16).

Still open, grouped by theme (full original wording in the archive transcript):

- **Render truth audits:** end-to-end trace of one mounted translated message; disable-restoration boundary trace across automatic, manual, reply-preview, embed, and title state; virtualized unmount/remount versus mounted render failure; historical batch terminal reasons for missing, duplicate, reordered, and partial provider results; race audits for live/history/manual/disable/edit/delete against channel generation and source signature; status-count separation (translated, background-ready, DOM-confirmed, skipped, failed, cancelled, stale); bounded-cleanup audit of timers, subscriptions, host mappings, state indexes, and abort controllers.
- **Test realism:** replace fake-owner render fixtures with captured parent/child lifecycle shapes before changing production rendering; make focused generated-plugin tests build/check first (documented in CONTRIBUTING; not yet enforced by an automated gate).
- **Read-only projections:** render hooks must not evict cache, transition state, queue provider work, or mutate Discord-owned message/embed props; separate provider-result validation from atomic visual commit, rejecting stale items individually and accounting for every dropped item.
- **Surface-specific acknowledgement:** body text, decoration, embeds, reply previews, and titles each need content-aware DOM confirmation; a child revision marker alone is not visible success.
- **Coordination identity:** one runtime epoch, one channel operation generation, and one message latest-command identity shared by manual, live, historical, edit, delete, preview, and display completion paths; a stable per-job status/display identity with multiple pending acknowledgement records; one coordinator owning live and historical provider work so historical results never supersede newer live or manual commands.
- **Lifecycle and cancellation:** physical provider cancellation where supported; one runtime task registry for workers, timers, animation frames, host mappings, and channel-session maps with asserted stop/start and long-session cleanup; flush the bounded translation cache on clean stop; deep-clone every restore source; cancel delayed anchor restores as one lifecycle-owned operation; release historical generation entries with the channel session.
- **Historical source completeness:** bounded pagination must fill the eligible maximum when older eligible messages exist and terminate on exhaustion without duplicate fetch actions; an unfilled target must report exhausted/failed rather than successful completion and must not auto-hide as complete.
- **Product decision:** decide and document whether reply previews share translated decoration, then test the actual computed presentation.
- **Release process:** extend the release gate to changelog agreement plus artifact identity.

New runtime bug fixes and behavior changes still require a failing regression test first, `npm run verify` before deployment, and a backed-up installed plugin before copying a new version into BetterDiscord (AGENTS.md).
