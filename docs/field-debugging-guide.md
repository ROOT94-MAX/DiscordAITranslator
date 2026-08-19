# Refactor and Field-Debugging Handoff

[简体中文](field-debugging-guide.zh-CN.md)

This is the canonical handoff for the display-unification slices and the 2026-08-18 through 2026-08-20 PTB field-debugging session. It starts at the first slice/recon decision, follows every reported symptom through the latest forwarded-message, history-viewport, and settings fixes, and separates proven causes from hypotheses and remaining observations.

User-visible behavior remains owned by `product.md`; setting ownership by `settings.md`; provider contracts by `providers.md`; code boundaries by `architecture.md`; unfinished implementation order by `recovery-plan.md`.

## Verified State at Handoff

- The detailed field history is preserved locally on `codex/capsule-counter` and `backup/pre-publication-detailed-20260820`. The public v0.3.39 branch condenses those 45 field commits into one reviewed release commit so intermediate machine-specific evidence does not enter public history.
- Local `master` contains the completed extraction sequence through `6e7a4cd`; backup tags preserve the pre-publication state.
- Generated artifact: one installable `DiscordAITranslator.plugin.js`, build ID `08e2b0182796eded`.
- Field-handoff verification passed `1247/1247`; the v0.3.39 release gate adds two metadata/bilingual-document contracts and passes `1249/1249`. Generated and installed plugin hashes matched after the last runtime deployment.
- Legacy-runtime ratchet: the planning recon measured 4,322 lines; after the dead watermark cleanup the enforced Slice-1 baseline was 4,318; the current enforced budget is 3,479. This is meaningful reduction, but `src/legacy/runtime.js` is still the composition root.
- Latest accepted PTB results: capsule placement is acceptable; duplicate provider-error toasts are fixed; forwarded automatic/manual translation and restore paths work; and the duplicate direct-original setting is successfully removed. Current tests also pin one forwarded original and history-preserving auto-enable, but those two latest presentation/viewport corrections remain explicit PTB observation items rather than being promoted from test evidence to final field proof.
- Remaining field observations are listed under **Open or Observation Items**. Do not convert an observation into a root cause without new evidence.

## Working Rules

1. Diagnose the trigger lane before changing the repaint primitive. Live messages, cached replay, historical commits, reply previews, manual actions, retries, and lifecycle refreshes can produce the same visible flicker.
2. Add a failing regression test before changing runtime behavior. Render-boundary unit tests are necessary but PTB observation is still required.
3. Do not infer current behavior from old plans, screenshots, or conversation summaries. Read the current module, tests, product contract, build ID, and runtime evidence.
4. Preserve originals, channel isolation, bounded retry, live priority, and the single installable plugin artifact.
5. Keep runtime data outside Git: configuration, provider credentials, probe JSON, debug bundles, deployment backups, and delivery folders.
6. A refactor commit moves one ownership boundary without changing behavior. A field fix changes one proven behavior behind a failing test. Do not mix another compatibility patch into either.

## Refactor Slice Ledger

The refactor was intentionally bottom-up. A top-down rewrite of the composition root was rejected because hundreds of small runtime methods shared closure state; independently reversible ownership slices were lower risk.

| Slice | Problem / finding | Shipped result | Verification / consequence |
| --- | --- | --- | --- |
| Pre-slice cleanup (`d8f7ccc`) | The translated watermark was already unconditional, but a dead setting and labels implied that it was configurable | Removed the dead watermark key/copy and documented the always-on contract | Runtime ratchet 4,322 → 4,318; this later established the rule that dead settings are deleted rather than preserved as compatibility branches |
| Slice 0 recon (`13b760e`) | Architecture notes assumed a targeted repaint path, but the actual call graph was unknown | Proved two live paths and both ended in `rerenderAll(true)`: transaction path A and legacy/lifecycle path B. Proved the adapter's bounded retry was load-bearing, while the scheduler comment and constant delay wrapper were stale | No runtime change. This prevented deleting retry behavior based on a false architectural description |
| Slice 1 (`832ad07`) | Refresh semantics lacked a reliable contract | Added six refresh-path contract cases, corrected the false owner-update comment, removed dead `nextDelay/getNextDelay`; retained bounded retries and both real paths | Full verification passed; no UI behavior was claimed changed |
| Slice 2 (`d5f29d0`) | Capsule DOM lifecycle, retry action, visibility, watcher, and cleanup lived in the god object | Moved ownership to `src/ui/loaded-status-capsule.js` behind eight contract tests; left geometry math untouched | Runtime ratchet 4,318 → 4,231. This was extraction, not the later capsule-count/position fix |
| Slice 3 (`fa96971`) | Composer submit interception and input-row icon wiring lived in the runtime | Moved them to `src/ui/composer-wiring.js`; settings panel was already separate | Runtime 4,231 → 4,162. The later icon blink was therefore traced to chat remounts, not duplicated composer wiring |
| Slice 4 (`fc7bfe4`) | `translateMessage` and `translateText` mixed policy, provider calls, fallback, watchdog, cache, and display actions into the runtime | Textually moved the pipeline to `src/orchestrator/translation-pipeline.js` with collaborators injected through the existing plugin seam | Runtime 4,162 → 3,870; translation behavior stayed pinned by the existing suite |
| Slice 5 recon (`8fa9662`, `42ff32c`) | Manual state was already stored centrally, but manual paint still used the legacy whole-list path | Proved the remaining split was paint ownership, not translation state; the render hook already projected manual store views | Split Slice 5 into independently testable 5a–5d instead of attempting one large rewrite |
| Slice 5a (`151402c`, `5c430d9`) | Manual completion mutated legacy props and then requested a whole-list repaint | Routed manual display through the per-message transaction chain. The first implementation exposed a stale manual-anchor hijack; the follow-up scoped that anchor to transactions containing the translated message ID | Regression tests pin manual translate/untranslate and anchor ownership. This is the first example showing that modular code can still fail at a shared viewport boundary |
| Slice 5b/5c audit (`4c12fd9`) | It was unclear whether preview/embed/title paint still required legacy path B | Verified preview commits were host-aware transactions, embeds rode the host row, and titles used a separate header mechanism. Full-list path B remained only for channel/lifecycle repaint semantics | Do not delete lifecycle rebuilds under the claim that all full-list work is obsolete |
| Slice 5d cuts (`cadc29e` through `6e7a4cd`) | The runtime still owned unrelated codecs, labels, menus, markup, defaults/patch lists, and preview queue | Extracted special encodings, general-setting labels, context menus, Discord markup renderer, plugin defaults/patch lists, and reply-preview queue; repaired two Russian mojibake labels in a separate tested fix | Runtime 3,870 → 3,480 before later field changes; each cut lowered the architecture ratchet |
| Field-era ownership cleanup (`1b8f565`, `8ff33bf`) | Forward content projection and duplicate direct-original display still leaked through the runtime | Moved content-view projection into display ownership and removed the obsolete direct-original React/CSS/settings branch | Current ratchet 3,479. `showOriginalMessage` is the sole received-original setting |

### What the refactor did and did not accomplish

The extraction was effective: capsule, composer, pipeline, viewport, status, historical jobs, provider client, display logic, and repaint adapter now have testable owners, and the legacy runtime shrank by roughly 19%. It did not make Discord rendering deterministic. The remaining difficulty came from four cross-boundary facts:

1. Current Discord/BDFDB function-component handles do not provide the class updater assumed by the old architecture.
2. A whole-chat fallback remounts the composer and changes virtualization/scroll geometry even when translation state is correct.
3. History acquisition arrives over several render ticks, so a logically single user action can become many micro-jobs unless cadence is owned above the repaint layer.
4. Forwarded messages render from nested snapshots rather than parent `content`, and Discord normalization may strip unknown marker fields.

Therefore, “module extracted” never means “field behavior solved.” Future work must prove the actual render/store boundary and preserve one owner for state, paint, viewport, and status.

## Current Display Architecture

- `src/display/message-state-store.js` is the state authority for automatic and manual received translations, source snapshots, reply previews, revisions, and restore state.
- `src/display/translation-display-controller.js` commits display transactions. Historical results commit as one batch; reply-preview hosts are wave-coalesced.
- `src/display/flux-row-repaint.js` uses the experiment-verified internal `MESSAGE_UPDATE` merge path for mounted message rows. `src/display/discord-render-adapter.js` confirms DOM revisions and uses one whole-chat rebuild only when row refresh cannot satisfy the transaction.
- `src/orchestrator/historical-snapshot-cadence.js` waits for a 500 ms quiet window. `src/orchestrator/historical-translation-job.js` owns immutable jobs and absorbs compatible sealed work before start, so a scroll-back session does not become one provider/display transaction per render tick.
- `src/viewport/message-viewport-store.js` is the sole owner of reading-line anchors, user-scroll intent, bottom rescue, raw-offset fallback, and 180/600 ms settle checks.
- `src/ui/loaded-status-capsule.js`, `src/ui/loaded-status-position.js`, and `src/status/loaded-translation-status-store.js` own capsule DOM, geometry, and cumulative channel counts.
- A forwarded message has an empty parent `content`; its visible body is `messageSnapshots[0].message.content`. Every source read, paint, echo check, original display, and restore must use the forward-aware display helpers.

## Field-Debugging Timeline

This section preserves the order in which the failures were reported and corrected. Later evidence supersedes earlier hypotheses.

### Phase A — Capsule semantics, placement, and stale instances

1. **Frozen per-batch numbers:** the capsule first showed values such as `12/12` or `13/13`, then reused the same denominator for later history batches. Early variants reset to `0/13` or `0/47`; a session-total experiment added `Σ47`, which still did not match the requested cumulative ratio.
2. **Product contract clarified:** counts are cumulative per channel and both numerator and denominator grow. Example: `13/13`, then discovery of 20 more becomes `13/33`, and completion becomes `33/33`. Channel switch pauses/hides that channel's display without converting the number back to a batch count. `Σ` was explicitly removed.
3. **Wrong accounting sources:** scheduler outcomes, inspected limits, and per-batch reports were each tried as count authorities. They missed direct/manual/store commits, admitted the configured history limit (for example 50) as if it were discovered work, or let a late batch overwrite a newer cumulative state.
4. **Current accounting:** unique translated message IDs are recorded at the message-state-store transition choke point; recording is silent; normal batch/status heartbeats reveal cumulative progress in jumps. Batch-stamped tracker reports drop stale merges; resolved skips leave the denominator; failure/retry formatting uses the same cumulative basis.
5. **No-work `0/N`:** an initial scan reported inspected messages as the total even when none required translation. No-work now reports zero actionable work and uses the completed/check state; `0/N` is reserved for real unresolved work or failure.
6. **One-by-one visual regression:** updating the capsule and display after each store record made history appear to translate one message at a time. Silent record updates plus atomic historical commit restored the required batch behavior. The counter is cumulative; that does not require per-message visual updates.
7. **Old `5/13 · 3s · Σ47` format returned:** field evidence identified a stopped hot-reload instance whose late callbacks could recreate the shared capsule. The runtime-active gate prevents new zombies; a full client restart is required to clear a pre-gate instance already in memory.
8. **Position regressions:** the capsule covered the native slow-mode hint, overflowed the composer, aligned to an outer wrapper, matched ordinary chat text containing “slow mode,” and teleported when a stale zero-size hint or temporarily absent composer was cached. The current locator chooses the smallest valid native hint text, rejects message-row descendants and zero rects, pins the capsule's right edge, and holds a stable position during transient absence. With a real hint it sits 8 px above that hint with right edges aligned; without a hint it hugs the composer 8 px above its top edge.

### Phase B — History batching, repaint attribution, composer flicker, and scroll

1. **Initial symptom:** new live messages were relatively stable, while loading translated history caused one visible update per message or small micro-batch, composer-icon blink, hard-to-move scrolling, and occasional jumps to newest.
2. **False route — synchronous atomic rebuild:** a blank/remount implementation was introduced to make a history batch appear in one step. First the necessary React handles were not wired (`0A/56F`); once wired, `flushSync` guaranteed a remount per transaction (`0L/56A/0F`) and worsened scrolling. It was retired.
3. **False assumption — `rerenderAll(true)` coalescing:** it merges only calls in the same tick. A 200 ms per-message contract plus provider results arriving separately still creates repeated full rebuilds.
4. **Attribution before tuning:** lane diagnostics separated live, cached, historical, manual, retry, preview, lifecycle, and fallback rebuilds. A field read showing `other 69` versus `hist 8` proved reply-preview commits, not only historical body commits, dominated one session.
5. **History cadence fix:** snapshots now seal after a 500 ms quiet window and compatible waiting jobs merge before start. This restores the intended one scroll-back wave → one historical job → one batch commit rather than one job per render tick.
6. **Preview cadence fix:** preview state still commits immediately, but host repaints collect into one tagged 300 ms wave and wait while the repaint gate says the user is scrolling.
7. **Row repaint endgame:** read-only probes showed no usable exported BDFDB dispatcher, then found a store dispatcher route. A guarded experiment proved a no-op `MESSAGE_UPDATE` merge rerenders the target row. `src/display/flux-row-repaint.js` now tries that route, checks the DOM revision on a second frame, and retains whole-chat rebuild only as fallback.
8. **Jump to newest during active history viewing:** historical paint now defers behind the active-scroll gate. If a fallback remount strands the viewport at bottom—a position an in-history upward gesture did not request—the immediate restore may rescue the captured anchor.
9. **Timestamp/reading-line drift after translated rows grow:** anchoring the top visible row preserved the wrong visual point. The anchor is now the visible row nearest viewport center, followed by 180/600 ms settle checks. Every delayed check is vetoed by newer user intent; delayed writes never pull the user back after another gesture.
10. **Enable auto-translate while reading an old date:** a stale 4.5-second manual anchor was reused during a lifecycle repaint, and a virtualized missing row caused restore to return without using the current raw offset. Lifecycle enable now captures the current viewport only; missing element lookup falls back to the captured offset and settle passes refine the exact row.
11. **Expected residual motion:** adding translations changes row and total-list height, so the scrollbar thumb can change size or location even when the center reading-line message is preserved. Treat “content moved away from the reader” and “thumb geometry changed” as different bugs.

### Phase C — Provider errors and translation integrity

1. **Three identical quota errors:** concurrent historical chunks emitted the same provider toast. Exact messages now deduplicate inside a 10-second window; distinct failures remain visible and backup-provider behavior is unchanged.
2. **Long-message hypothesis corrected:** length was initially only a hypothesis. Two independent transport findings were later proven:
   - URL-encoded CJK can exceed the Google Free `q` budget long before raw JavaScript character length does, so splitting uses encoded length while preserving paragraphs/sentences and cutting by Unicode code point when necessary.
   - A screenshot-equivalent long English request returned HTTP 200, but Google altered a protected `⟦N⟧` placeholder; the strict integrity guard correctly rejected it. Google transport now maps protected terms to reversible `__DTA_N__` tokens and the hard splitter treats each token atomically.
3. **Integrity contract:** missing, duplicated, reordered, or damaged protected placeholders enter repair; do not weaken validation merely to make a long message appear translated.
4. **Backup provider:** quota exhaustion followed by a valid configured backup is expected. Diagnostics must show which provider failed and which provider completed without multiplying user toasts.

### Phase D — Forwarded-message source, paint, restore, and original display

1. **Not translated / apparently empty:** the parent message's `content` is empty; the visible source is nested in `messageSnapshots[0].message.content`. A debug-only shape probe established this before implementation.
2. **Translation existed but only original rendered:** extraction was fixed first, but paint still wrote the empty parent. Paint now clones and patches the snapshot while preserving prototypes and forward-reference fields; Discord store objects are never mutated in place.
3. **Manual translate, cancel, and disable did not restore:** legacy branches and archive restore still read/wrote parent content. Automatic and manual flows now share forward-aware body accessors, and cancellation/restore rebuild a cloned snapshot body from the archived visible original.
4. **Duplicate original (`one translation + two originals`) and empty green block:** the parent and nested snapshot both participated in presentation; the ordinary received-original block was appended after the forward already retained an inline original. Unknown custom identity markers were also stripped by Discord snapshot normalization.
5. **Current ownership contract:** an empty forwarded parent owns only revision acknowledgement; the snapshot owns visible translated content and the optional original. `showOriginalMessage=false` shows one translated body. `showOriginalMessage=true` shows the translation plus exactly one inline quote/spoiler original. Normalization-aware comparison, not a custom marker property, prevents a second original.

### Phase E — Settings and cleanup

1. The dead translated-watermark setting was removed before the slices; the watermark is always shown.
2. Two Russian spoiler labels damaged by mojibake were repaired and pinned by tests.
3. “Directly show received original” duplicated “show original while viewing received translation” and created competing display branches, especially for forwarded snapshots. The schema key, UI row, labels, direct React block, CSS, runtime branches, and tests were removed. Stale persisted `showOriginalDirectly` values are ignored.
4. `showOriginalMessage` is now the only received-original control and keeps the established inline quote/spoiler presentation.

## Incident Register

### Repaint, Composer Flicker, and Scroll

| Symptom | Proven cause | Current fix / contract | Do not repeat |
| --- | --- | --- | --- |
| Composer icon blinked whenever translations appeared | Whole-chat rebuild unmounted the composer | Flux row repaint is attempted first; DOM confirmation retains rebuild fallback | Do not treat a faster rebuild as a row repaint |
| Historical messages appeared one by one and each caused a rebuild | Snapshot micro-jobs sealed per render tick; provider and preview completions added separate transactions | 500 ms history quiet window, waiting-job absorption, 300 ms preview waves, one historical batch commit | Do not make cumulative counting drive per-message presentation |
| Atomic rebuild made scrolling worse | Once handles were wired, synchronous blank/remount forced every transaction to rebuild | Atomic rebuild is retired; BDFDB rebuild is fallback only | Do not restore synchronous blank/remount |
| Instance registry stayed at `0L` | Function components appeared as synthetic `{props}` objects without an updater | Registry remains opportunistic; Flux store merge is the working row path | Do not force-update the synthetic instance |
| Scroll jumped to newest and stayed there | Fallback remount defaulted to bottom; gesture veto protected the wrong post-remount position | Defer historical paint during gestures; rescue a bottom-stranded captured anchor | Do not repaint over an active gesture or remove bottom-stranding discrimination |
| Reading line drifted after row height changed | Top-row anchor and a single early restore did not preserve the eye line through late layout | Center-row anchor plus intent-vetoed 180/600 ms settling | Do not use unconditional delayed writes |
| Enabling auto translation in old history jumped to newest | Lifecycle repaint reused stale manual anchor and lacked missing-row raw-offset fallback | Fresh lifecycle capture, offset fallback, then settled row refinement | Manual anchors belong only to transactions containing that message ID |

### Capsule State and Position

| Symptom | Proven cause | Current fix / contract | Do not repeat |
| --- | --- | --- | --- |
| `13/13` repeated as `0/13 → 13/13` for later history | Per-batch scheduler state was presented as lifetime/channel progress | Store-transition unique-ID accounting with persistent per-channel cumulative ratio | Do not reset cumulative display at batch start |
| No-work scan displayed `0/N` | Inspected rows were reported as actionable translation total | Zero-work completed/check state | Do not count inspected rows as pending work |
| Denominator began at configured 50 | Inspected/target limit was treated as discovered translatable work | Add denominator only for real accepted work; release resolved skips | Do not count configured capacity |
| Numerator/denominator jumped between 26, 48, 106, 123 | Late tracker reports and status branches merged incompatible batch bases | Batch stamps drop stale reports; all states format from cumulative basis | Do not merge reports without job/batch identity |
| Capsule visibly climbed one by one | Store transition repainted status each time | Record silently and reveal on heartbeat/batch transition | Do not update capsule DOM from each store commit |
| Old `5/13 · 3s · Σ47` returned | Pre-gate stopped instance recreated the shared DOM | Runtime-active gate; restart clears an already-running zombie | Check build ID and zombie lifecycle before adding another renderer |
| Capsule overlapped hint or moved outside composer | Wrong hint wrapper, stale geometry, broad text scan, or left-edge/min-width alignment | Smallest structural hint, right-edge pin, zero-rect rejection, stable fallback | Text matching alone is not a locator |

### Providers and Translation Integrity

| Symptom | Proven cause | Current fix / contract | Do not repeat |
| --- | --- | --- | --- |
| Quota exhaustion produced three identical errors | Concurrent chunks emitted identical toasts | Exact-error dedupe for 10 seconds | Do not suppress distinct errors |
| Long Google Free input exceeded transport budget | Encoded query length, especially CJK, exceeded raw-length estimate | Split by encoded `q` length and Unicode code point | Raw character count is not URL size |
| HTTP 200 result was rejected | Google altered a protected placeholder | Reversible Google-safe tokens plus strict shared validation | Do not relax placeholder validation |

### Forwarded Messages

| Symptom | Proven cause | Current fix / contract | Do not repeat |
| --- | --- | --- | --- |
| Forward skipped as empty | Visible body is nested in snapshot | Forward-aware extraction | Parent content is not the only source |
| Only original displayed after translation | Paint targeted empty parent | Prototype-preserving snapshot clone and patch | Never mutate store objects in place |
| Manual/cancel/disable restore failed | Branches and archive restore used parent body | Shared source/read/paint/restore helpers for automatic and manual paths | Do not add another forward side map |
| Translation displayed two originals | Parent and snapshot both owned presentation; custom marker was normalized away | Snapshot sole display ownership and normalization-aware dedupe | Do not depend on unknown marker fields surviving normalization |

## Rejected or Superseded Approaches

- Full-document native-hint scans: flicker, false positives, and unstable geometry.
- Synchronous atomic chat rebuild: guaranteed remounts and higher scroll cost.
- Function-component `forceUpdate`: no usable updater on this client shape.
- Assuming `rerenderAll(true)` merges results arriving hundreds of milliseconds apart: same-tick only.
- One-second debounced live repaint: can starve busy channels and violates the live-display ceiling.
- Per-message history sealing or capsule repaint: violates batch presentation and multiplies remounts.
- Counter ownership at scheduler output: misses direct historical/manual/store commits.
- Configured history limit as capsule denominator: capacity is not discovered work.
- Snapshot identity properties: Discord normalization strips unknown fields.
- Relaxing protected-placeholder validation: silently accepts damaged translations.
- Reusing a manual-message anchor for channel lifecycle repaint: can strand virtualized history at newest.
- Treating every apparent jump as translation-caused: use gesture and jump-to-newest evidence; user action and native UI can legitimately move the viewport.
- Treating Discord developer documentation as a repaint API: the public developer API does not expose the client-internal React/virtual-list boundary used by this plugin; field probes and guarded internal adapters remain necessary.

## Open or Observation Items

1. Some whole-chat rebuild fallbacks remain (`R` lane/diagnostic), so occasional composer-icon flicker can still occur when row confirmation fails, preview hosts require a broad paint, or lifecycle settings change.
2. Scrollbar thumb size/position can move when translated rows change total height. Reopen only when the center reading-line message itself is lost or the view is stranded at newest.
3. The message-delete cleanup hook was previously wired to a dispatcher surface absent from BDFDB 4.5.4. Repoint and prove it against the store dispatcher before claiming delete cleanup complete.
4. Forwarded one-original rendering and forwarded-row DOM confirmation remain under PTB observation because the latest normalization-aware dedupe has test evidence but the user did not explicitly close that exact screenshot case after the final implementation, and Discord may change the snapshot render tree.
5. The history-preserving auto-enable correction has regression coverage but still needs a focused PTB repeat at an old date; capsule cumulative behavior and native-hint alignment should also be rechecked after Discord UI changes.
6. Slice 5d is not finished: `src/legacy/runtime.js` is still a 3,479-line composition root with two module-level shared declarators. Continue ownership extraction only behind contract tests; do not call the refactor complete merely because many modules exist.
7. Oversized modules and generated-bundle size remain architecture debt. Split by ownership after contracts exist; do not split merely to reduce a line count.
8. History source completeness, provider cancellation, lifecycle task cleanup, and release identity/changelog gates remain in `recovery-plan.md`; they were not solved by this field series.

## Regression and Evidence Map

| Boundary | Primary tests / evidence |
| --- | --- |
| Refresh scheduler and rebuild contract | `tests/display/repaint-scheduler.test.js`, repaint-lane diagnostics |
| Capsule lifecycle, count, and position | `tests/ui/loaded-status-capsule.test.js`, `tests/loaded-translation-status-store.test.js`, position tests, build-ID field check |
| Manual display and anchor ownership | `tests/manual-translation-button-regression.test.js`, `tests/received-display-ownership.test.js`, `tests/message-viewport-store.test.js` |
| Historical batching and display commit | `tests/historical-translation-job.test.js`, translation-display-controller tests, cadence diagnostics |
| Reply-preview repaint waves | translation-display-controller and received-display-lifecycle tests, `prev` lane readout |
| Flux row repaint | `tests/display/flux-row-repaint.test.js`, debug-only store-dispatch experiment, DOM revision confirmation |
| Google long text and placeholder integrity | `tests/provider-client.test.js`, encoded-size and protected-token cases |
| Forward source/paint/restore/original dedupe | `tests/translation-display-logic.test.js`, `tests/received-translation-runtime.test.js`, debug-only forwarded-shape probe |
| Settings cleanup and i18n | settings-contract, plugin-defaults, general-setting-label tests |
| Architecture ratchet and deterministic artifact | `tests/architecture-budget.test.js`, build-contract tests, `npm run verify` |

Debug probes are evidence tools, not release features. Probe JSON and debug bundles stay outside Git, and release builds strip the probe code paths.

## Privacy and Evidence Rules

- Never commit `DiscordAITranslator.config.json`, API keys, account/channel identifiers from live probes, probe JSON, debug bundles, BetterDiscord backups, ad-hoc screenshots, or delivery folders.
- Tests use synthetic IDs, descriptive placeholder credentials, and reserved example domains.
- Documentation uses `<USER_HOME>`, `CHANNEL_ID`, `MESSAGE_ID`, and similar placeholders instead of machine-specific paths or live identifiers.
- Committed product screenshots must have usernames/avatars obscured and credentials visually masked.
- When summarizing a probe, record only shape, counts, status, and the behavior conclusion; keep raw evidence outside Git.

## Handoff Checklist

1. Read `product.md`, `settings.md`, `providers.md`, `architecture.md`, this guide, then `recovery-plan.md`.
2. Confirm branch, commit, installed build ID, Git status, deterministic build parity, and whether a stale hot-reload instance requires a full client restart.
3. Reproduce once and classify the trigger lane, channel, batch/job identity, viewport intent, and display owner before editing.
4. Distinguish a hypothesis from evidence. Record the disproving observation when a route fails.
5. Write a failing regression test against the smallest owning module.
6. Preserve channel isolation, source snapshots, cumulative count identity, user-scroll intent, historical batch atomicity, and live-message priority.
7. Run focused tests and `npm run verify`; back up the installed plugin before deployment and compare source/build/installed hashes.
8. Keep all work local until the user explicitly approves push or remote merge. Preserve rollback tags/artifacts for local integration.
