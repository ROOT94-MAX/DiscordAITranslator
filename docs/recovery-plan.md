# Display Core Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce deterministic modular source and replace the coupled received-message display path so translations appear without hover, translated decoration stays synchronized, and channel disable reliably restores original content.

**Architecture:** Preserve the current runtime behind a generated compatibility entry first. Then introduce `MessageStateStore`, `TranslationDisplayController`, and `DiscordRenderAdapter` as one received-message vertical slice. The state store owns immutable source and translation status; patches read one display view; the render adapter refreshes and confirms exact message IDs.

**Tech Stack:** BetterDiscord, BDFDB, CommonJS JavaScript, Node.js 20+, esbuild 0.28.1, Node.js built-in test runner.

---

## Reopened Full Display Debug — Approved 2026-08-10

The 2026-08-04 component-scoped display task is retained below as implementation history, but its central per-message-owner assumption is invalidated by real-client evidence. Hover-dependent translation display, partial translated styling, and hover-dependent channel restoration remain reproducible. The checked boxes below do not represent current release readiness.

### Confirmed root-cause evidence

- Parent `Messages` before-render projection owns message text; child `MessageContent` after-render projection owns decoration. The current per-message update does not guarantee both paths execute in one React cycle.
- Original restoration can change props after text children were built, leaving stale translated children until Discord naturally rerenders the row.
- Per-message owner lookup is synthetic in tests and constrained to updateable class instances in the installed BDFDB runtime. Real message rows may be functional or memoized.
- The adapter's exact selectors have drifted from the more tolerant selector shapes already implemented in `message-viewport-store.js`.
- `deferredIds` include both off-screen rows and mounted-but-unconfirmed rows, allowing status accounting to overstate visible success.
- Reply previews and embeds depend on host-row invalidation; thread titles are a separate render surface.
- The stream pass shallow-clones only the `channelStream` array, then mutates shared entries and message/embed props. Existing source-recapture branches are compensating for plugin-painted text re-entering the source pipeline.
- Manual translations use the state store but still schedule the legacy full-list repaint. Settings, re-enable, stop, and some cleanup paths also retain broad repaint calls, so the architecture currently has two display transaction systems.
- The adapter performs one internal retry while the repaint scheduler allows up to three further attempts. This exceeds the documented single repair transaction and can repeatedly query/update rows without proving the parent projection ran.
- Test `forceUpdate` fakes directly create revision acknowledgement, and lifecycle tests manually invoke parent and child projection in the successful order. This makes the principal regression structurally absent from the suite.
- Historical prefetch probes undocumented action signatures and trusts the first non-null return without validating that it contains messages. A real action that updates the store asynchronously or returns another shape can leave a configured 50-message job sealed near the mounted 20-message window.
- Embed restoration mutates/stashes fields on render props, while title restoration uses global title-component updates without visible acknowledgement.
- Child message rendering can decorate a store-translated revision even when the parent stream never projected translated text. Render hooks also clear state, queue work, and mutate props, so a single React render is not a read-only projection of one revision.
- Preview/suppression/archive projection changes do not advance a display revision. A reply host can be requested for update without any preview-specific DOM acknowledgement.
- Historical source collection performs only one prefetch attempt. Ineligible, duplicate, or off-channel records in that response can underfill the configured eligible-message maximum even when older eligible messages still exist.
- Manual source archives are shallow at nested embed boundaries, and the cache deliberately abandons its final debounced write on stop; both violate the intended immutable-source/cache-retention contract.
- `npm run verify` passed 1,047/1,047 on this exact debug baseline while the real-client hover regressions remain observed. The suite is therefore not a release signal until the render fixtures are replaced.
- Manual anchor restoration has delayed writes that survive channel switch/reload, and toggle versioning does not cover the asynchronous store mutation itself; both can reintroduce scroll jumps or a late disabled projection after rapid toggles.
- Historical source generations are retained for every visited channel instead of being released with the channel session.
- The source graph has no relative-import cycle, but `src/plugin/index.js` still delegates entirely to the 4,428-line legacy runtime, which directly imports 27 of 38 source modules. The current ratchet prevents growth without forcing the final composition-root migration.
- The generated release is 13,305 readable lines and 904,357 bytes, and multiple extracted files remain 700-1,490 lines. Structural extraction is therefore incomplete even though the runtime line ratchet passes.
- The release metadata has no commit/build fingerprint. Current source renders a compact numeric floating status, while the observed client rendered the older sentence-style status; the loaded artifact cannot be identified from the UI or metadata alone.
- This file is 2,106 lines and mixes active work with checked implementation history; `extraction-plan.md` is an additional unlisted plan with conflicting completion language. After the debug evidence is sealed, retain only the active sequence here and archive the historical implementation transcript outside the repository.
- DOM confirmation currently proves only a `MessageContent` revision marker. It does not prove body text, translated decoration, embed, reply preview, or title content, so a partial child render can be reported as complete.
- Manual/live/history do not share a latest-command identity. Late automatic results can overwrite manual results, and old manual callbacks survive channel disable, edit, and deletion.
- One stale item makes `MessageStateStore.commitBatch` discard every otherwise valid item in the same historical batch without reporting the collateral drops.
- Worker locks, preview tokens, post-await historical status updates, animation frames, provider I/O, and channel maps are not governed by one runtime epoch/task registry; stop/start and channel switches leave several ABA and late-callback paths.
- Historical status keys do not use `job.id`, one pending display batch overwrites another per channel, and live priority is only a job-boundary handoff. Historical commit can explicitly supersede a concurrent live request.
- The loaded-message limit is read from persisted settings but has no current settings-panel writer. A swallowed prefetch failure can seal a short snapshot, mark the channel initialized, and hide the apparently successful capsule three seconds later.
- Reply previews are explicitly stripped of translated background/style even though this exception is absent from the product contract. Focused tests may also execute an old root bundle because they do not build first.

### Mandatory second-debug evidence before implementation

- [ ] Trace one mounted translated message through snapshot, provider result, state commit, parent projection, child decoration, DOM revision, and status accounting without changing runtime behavior.
- [x] Capture the real active channel-stream patch instance/Fiber shape and prove which parent render handle is updateable. **(Evidence 2026-08-13 — see "Captured second-debug evidence" below.)**
- [ ] Trace one channel-disable restoration through automatic, manual, reply-preview, embed, and title state and record the first boundary that remains stale.
- [ ] Trace one virtualized-ready message through unmount/remount and distinguish it from a mounted render failure.
- [ ] Trace historical batch parsing by request ID and prove missing, duplicate, reordered, and partial provider results have explicit terminal reasons.
- [ ] Audit live/history/manual/disable/edit/delete races against channel generation and source signature.
- [ ] Audit status counts so translated, background-ready, DOM-confirmed, skipped, failed, cancelled, and stale are never conflated.
- [ ] Audit timers, subscriptions, host mappings, state indexes, and abort controllers for bounded cleanup on channel switch, disable, stop, and reload.
- [ ] Replace fake-owner test contracts with captured parent/child lifecycle fixtures before changing production rendering.
- [ ] Make every render projection read-only: no cache eviction, state transition, provider queueing, or mutation of Discord-owned message/embed props inside child decoration hooks.
- [ ] Add independent acknowledgement for reply previews and thread titles; a helper invocation alone is not visible success.
- [ ] Prove bounded historical pagination fills the eligible maximum when older eligible messages exist and terminates on exhaustion without duplicate fetch actions.
- [ ] Flush the bounded translation cache on clean stop and deep-clone every restore source needed by message and embed projection.
- [ ] Cancel every delayed anchor restore as one lifecycle-owned operation and make disable/re-enable transaction generations reject late state and render acknowledgements.
- [ ] Release historical generation entries with channel-session cleanup and assert long-session state remains bounded.
- [ ] Replace the legacy-runtime entry with a small composition root and make the architecture gate require progress toward its deletion, not merely prevent line-count growth.
- [ ] Split oversized extracted modules by ownership only after their behavior contracts are captured; do not treat file movement or minification as refactoring completion.
- [ ] Embed a deterministic source/build fingerprint in the generated artifact and expose it in a non-localized diagnostics/about surface so repository, installed file, and loaded runtime can be compared exactly.
- [ ] Compress this canonical plan after the audit and archive superseded task transcripts plus `extraction-plan.md` outside Git; keep no second active plan.
- [ ] Introduce one runtime epoch, one channel operation generation, and one message latest-command identity shared by manual, live, historical, edit, delete, preview, and display completion paths.
- [ ] Separate provider-result validation from atomic visual commit: reject stale items individually, account for every dropped item, then reveal all remaining valid results in one channel transaction.
- [ ] Make DOM acknowledgement surface-specific and content-aware for body text, decoration, embeds, reply previews, and titles; never infer complete display from a child revision marker alone.
- [ ] Give every historical job a stable status/display identity and permit multiple pending acknowledgement records without overwriting an earlier job.
- [ ] Put live and historical provider work behind one coordinator, preserve immediate live priority, and prevent historical results from taking ownership from newer live or manual commands.
- [ ] Add physical provider cancellation where supported and a runtime task registry for workers, timers, animation frames, host mappings, and channel-session maps; assert stop/start and long-session cleanup.
- [ ] Restore an explicit loaded-message limit control or remove the persisted setting contract; an unfilled target must report exhausted/failed rather than successful completion and must not auto-hide as complete.
- [ ] Decide and document reply-preview decoration, then test actual computed presentation. Make focused generated-plugin tests build/check first and extend the release gate to changelog plus artifact identity.

### Captured second-debug evidence (2026-08-13, DiscordPTB app-1.0.1212)

Collected with `DiscordAITranslator.debug.plugin.js` (probe `src/diagnostics/second-debug-probe.js`, evidence written to `BetterDiscord/data/translator-second-debug.json`; not committed). The probe is read-only: it never calls `forceUpdate`, never mutates props, and is stripped from release builds by `__TRANSLATOR_DISPLAY_DEBUG__`.

**Parent render handle (top-priority item 2).** The `before: "Messages"` patch hands the plugin a plain data envelope: `instance` is a bare `Object` with `hasForceUpdate: false` and no `_reactInternals`; `component` is an anonymous function component (`oo`). Across 65 render passes the same channel produced a new plain instance every time, so the patch argument is not a stable, updateable handle. The DOM-anchored fiber walk from the messages scroller found the `channelStream` owner at depth 9 (function `oo`, `canForceUpdate: false`), and the nearest ancestor with a usable `forceUpdate` at depth 24 (class `E`), well outside the message list and behind multiple memo/provider boundaries. **Conclusion:** the current "find the message owner and `forceUpdate` it" strategy has no valid target in this client. The replacement must trigger a parent refresh without relying on an updateable channel-stream component instance.

**No fiber-force strategy repaints the list (2026-08-13, corrected).** An earlier note here claimed forcing the channel-stream owner fiber caused re-renders (`caused: true`). That was wrong. A re-run of the auto experiment (`refreshExperiment` entries in `translator-second-debug.json`, timestamps ~1786634661) measured the render-pass delta for three strategies and every one failed:

- `channelStreamOwnerFiber` (force the `oo` function-component fiber at depth 9) → `caused: false`, `renderedDelta: 0`.
- `channelStreamOwnerStateNode` (force its stateNode) → `caused: false`, `renderedDelta: 0`.
- `nearestUpdateableAncestor` (force the class `E` at depth 24) → `caused: false`, `renderedDelta: 0`.

**Deployment counter-evidence.** A build wired to force the channel-stream owner once per transaction (commit `81b1064`, later reverted) was installed on the real client: the chat UI froze and no translations appeared. The force-update was a no-op (matching `caused: false`), so every mounted row stayed unconfirmed and the upstream repaint retry path spun. **Conclusion:** `BDFDB.ReactUtils.forceUpdate` on any node around the channel-stream boundary does not repaint this client's message list. The replacement refresh must NOT rely on React `forceUpdate` of a resolved fiber/instance. The next investigation must find what actually re-projects the list — candidates to probe: the Discord message-list dispatcher/store emit that the old working plugin relied on, `BDFDB.MessageUtils` targeted rerender helpers, or a props-level channel-stream update — and prove `caused: true` with real render-delta evidence before any code change.

**Historical prefetch return shape (top-priority item 3).** `MessageStore.getMessages(channelId)` returns a channel-view object (constructor `f`, 26 keys, `hasToArray: true`) rather than an array; cached enumeration must go through `toArray()`. `MessageActions.fetchMessages({channelId, beforeMessageId, limit, signal})` accepts the plugin's request shape but resolves to the boolean `true` in all four observed calls (limits 47/50/3/21) — it never returns messages and populates the store asynchronously instead. The current `discord-history-adapter.js` returns the first non-null result and then runs `cloneMessages(true)`, which yields `[]`. **Conclusion:** the bounded prefetch always contributes zero messages even on success, so a configured maximum is sealed at the already-mounted window. The replacement prefetch must await store population (re-read `getMessages`/`toArray` after the action settles) instead of trusting the action's return value.

### Approved replacement architecture

- One immutable `MessageStateStore` remains the source of display truth.
- One coalesced channel transaction requests one refresh at the parent `Messages`/channel-stream projection boundary.
- Message IDs and host IDs select state and confirm exact DOM revisions; they are not the primary refresh owners.
- Historical results commit as the configured ID-keyed batch; live results use the immediate priority lane and request an immediate transaction.
- Text, background, text color, watermark, reply preview, and embed projection must derive from the same revision in normal parent-to-child React order.
- Disable invalidates pending work, restores automatic and manual display state, clears reply/embed/title projections, and requests one channel transaction while retaining valid translation cache.
- Mounted-but-unconfirmed rows are visible failures. Only absent rows are virtualized-ready/deferred.
- The old per-message owner refresh, duplicate DOM resolver, fabricated acknowledgement, and obsolete repair scheduler paths are deleted after the replacement passes focused, full, and real-client verification.

### Full debug coverage

The second debug covers acquisition, batch/result parsing, state ownership, rendering, virtualization, scrolling/input, automatic/manual precedence, disable/re-enable, edits/deletes, replies, embeds, titles, status, themes/localization, lifecycle cleanup, deterministic build, artifact identity, rollback, and real-client smoke evidence. `docs/architecture.md` is the canonical detailed contract.

---

## Active Automatic Translation Recovery Design (Approved 2026-08-04)

The completed display-migration tasks below remain verification history. The next active work is the approved automatic-translation recovery slice. It must be implemented with failing regression tests before behavior changes and must not be deployed to Discord until the user separately permits deployment.

### Approved behavior

- Historical quantity is a maximum over eligible messages, not a scan window over arbitrary raw messages.
- Historical collection merges rendered messages and Discord's cached messages, then performs a bounded background prefetch only when needed to fill the configured maximum.
- Prefetch does not simulate scrolling, populate the visible list, or page beyond the configured maximum.
- Live messages use an immediate high-priority lane with a per-message loading icon. They do not wait for the historical job or for a batching timer.
- Historical messages form one immutable ID-keyed job. Provider transport may split an oversized request internally, but display commits once after validation and one targeted repair pass.
- **Superseded:** the former per-message owner transaction is implementation history only. The reopened 2026-08-10 design refreshes the parent channel-stream projection once and uses message/host IDs only for state selection and DOM acknowledgement.
- The viewport anchor restores once unless user intent changes. Composer and unrelated Discord surfaces are excluded from the transaction.
- The compact theme-aware status uses `translation icon completed/total · elapsed`; detailed counts are hover-only.
- Disable restores automatic and manual message presentation, reply previews, embeds, and titles for the affected channel while retaining valid translation-cache entries; stop performs the same presentation restore for every channel.

### Task 1: Build the historical message source

**Files:** create `src/received/historical-message-source.js` and `tests/historical-message-source.test.js`.

**Interface:**

```js
const source = createHistoricalMessageSource({
  listCachedMessages,
  prefetchMessages,
  isEligible,
  toQueueItem,
  isGenerationCurrent
});

await source.build({channelId, generation, renderedMessages, limit});
// => {items, total, prefetched, cancelled}
```

- [x] Write failing tests proving rendered and cached messages merge by ID, newest-first eligibility is applied before the limit, and prefetch receives only the missing quantity.
- [x] Prove a failed prefetch seals the actual available total and a stale generation returns `cancelled: true` without publishing items.
- [x] Implement the pure source builder without provider, display, or status dependencies.
- [x] Run `node --test tests/historical-message-source.test.js` and commit the isolated module.

**Task 1 evidence:** `edb9f4a`, `f43f74f`; the source builder is provider/display independent and its channel, eligibility, limit, prefetch-failure, and stale-generation contracts pass in the final full suite.

### Task 2: Integrate cache enumeration and bounded prefetch

**Files:** modify `src/received/received-translation-runtime.js`, `src/legacy/runtime.js`, `tests/received-translation-runtime.test.js`, and `tests/historical-translation-job.test.js`.

**Interfaces:** the runtime supplies `listCachedMessages(channelId)` and `prefetchMessages({channelId, beforeMessageId, limit, signal})`; accepted source items continue through the existing `collectHistoricalTranslationMessage(queueItem)` contract.

- [x] Write a failing integration test with 20 rendered messages, 20 cached messages, and 10 prefetched messages; assert one immutable 50-ID historical snapshot is sealed without simulated scrolling.
- [x] Write cancellation tests for channel switch, disable, and stale generation; assert prefetched records never mutate the Discord store fixture.
- [x] Add a Discord history adapter with feature-detected cache collection and bounded fetch dependencies; keep internal API shape handling out of the pure source builder.
- [x] Wire the first loaded-message pass to build once, deduplicate before queueing, and preserve the existing historical job batch/repair/atomic-commit pipeline.
- [x] Run the two focused suites and commit.

**Task 2 evidence:** `98b3c39`, `b8cbb02`; the configured eligible-message maximum is filled from rendered, cached, then bounded-prefetched records without simulated scrolling, and cancellation remains generation scoped.

### Task 3: Lock live-message immediacy and priority

**Files:** modify `tests/live-translation-queue.test.js`, `tests/historical-translation-job.test.js`, `tests/integration/received-display-throughput.test.js`, and only the owning scheduler modules if a red test proves a gap.

- [x] Write a failing boundary test proving the first live provider call starts in the same queue turn without waiting for a batch timer.
- [x] Write a failing scheduling test proving a newly queued live item receives the next slot before a sealed follow-up historical job.
- [x] Prove the 120 ms repaint coalescing window affects only visible paint, not provider dispatch, and that the per-message loading view is available immediately.
- [x] Make the smallest scheduler change required by the red tests; retain current provider backoff and live burst behavior.
- [x] Run the three focused suites and commit.

**Task 3 evidence:** `a0357cd`, `dca4c1c`, `f541ecf`, `5fb09af`, `d5fb73e`, `36f7176`, `79295cb`; live work owns the next dispatch slot, stale reservations retire safely, and paint coalescing never delays provider dispatch.

### Task 4: Complete the component-scoped display transaction

**Files:** modify `src/display/discord-render-adapter.js`, `src/display/translation-display-controller.js`, `src/display/display-runtime.js`, `src/legacy/runtime.js`, `tests/display/discord-render-adapter.test.js`, and `tests/integration/received-display-lifecycle.test.js`.

**Interface:**

```js
refreshDisplayTransaction({channelId, messageIds, ownerMessageIds = []});
// => {confirmedIds, missingIds, deferredIds, retryIds, staleIds, fallbackUsed}
```

- [x] Write a failing test where referenced message `m1` is previewed by host rows `m2` and `m3`; committing and restoring `m1` must refresh `m2` and `m3` in the same owner update.
- [x] Write a failing adapter test proving an unconfirmed mounted row returns one `retryId`, while a virtualized row returns `deferred` and never triggers a broad repaint.
- [x] Expose the component-scoped transaction through the display runtime and route normal reply-preview commits away from `scheduleTranslationRerender`.
- [x] Preserve one anchor restoration unless the user-intent sequence changes; keep composer and unrelated surfaces outside the transaction.
- [x] Run focused display and lifecycle suites and commit.

**Task 4 evidence:** `dc643f9`; reply-preview ownership is channel-isolated and one-to-many, mounted owners share one targeted update, virtualized rows defer, and automatic display paths contain no whole-list repaint.

### Task 5: Replace the verbose loaded-status capsule

**Files:** modify `src/status/loaded-translation-status-store.js`, `src/ui/styles.js`, the status DOM methods in `src/legacy/runtime.js`, `tests/loaded-translation-status-store.test.js`, and the status regression cases in `tests/historical-translation-job.test.js`.

**Primary text contract:**

```text
requesting: 20/50 · 8s
done:       50/50
repairing:  48/50 · 2↻
failed:     48/50 · 2!
```

- [x] Write failing tests proving total remains the sealed job size, completed includes valid virtualized-ready records, and generic progress updates cannot overwrite the final exact count.
- [x] Write failing render tests for the translation icon, compact text, hover-only detail, three-second completion hide, and Discord theme-variable colors.
- [x] Replace sentence-style primary text with the language-neutral compact contract while retaining localized hover detail and diagnostic phase data.
- [x] Prove status updates do not invoke any message-list repaint and commit.

**Task 5 evidence:** `d06d620`; the compact icon status keeps the sealed total, reports exact final display readiness, uses theme variables, hides completed work after three seconds, and updates independently from message rendering.

### Task 6: Lifecycle completion, cleanup, and verification

**Files:** modify only owning modules identified by red tests; update this section with evidence after verification.

- [x] Add integration tests for edited/deleted messages, stale source signatures, auth failure without repeated retries, one transient retry, channel isolation, disable restoration, plugin-stop restoration, reply previews, embeds, and thread titles.
- [x] Run focused suites, then `npm run build`, `npm run verify`, and `git diff --check`.
- [x] Run a whole-branch standards/spec review and fix every P0-P2 finding with a failing regression test first.
- [x] Remove only dead compatibility branches proven unreachable by tests; keep test sources in the repository and exclude them from the generated plugin.
- [x] Record commit hashes, exact test totals, artifact hash, and rollback command here.
- [x] Produce the verified repository artifact only; leave installed Discord files untouched until deployment is explicitly permitted.

**Task 6 evidence (2026-08-09):**

- Implementation commits: `77333ee`, `298b4fe`, `2f7b7e1`, `5b8d0ff`; stale structural-test boundary corrected in `ac5a735`.
- TDD coverage includes exact message deletion, late-result rejection, channel-isolated reply hosts, auth/configuration/permanent terminal failures, one transient retry, disable/stop restoration, embeds, previews, and thread titles.
- Whole-branch standards/spec review against `d06d620..ac5a735` found no remaining P0-P2 item after the runtime, provider, queue, display, lifecycle, tests, and canonical documents were checked together.
- Final automated gate: `npm run verify` `1019/1019`; `git diff --check` clean; deterministic build and JavaScript syntax checks exit `0`.
- Legacy runtime ratchet: `4433` split lines, reduced from the pre-cleanup budget while the extracted tests remain outside the release bundle.
- Repository artifact: `DiscordAITranslator.plugin.js`, `891565` bytes, SHA-256 `24c644ced36046abb279c7802b95fcf7d30397c19f05d00af08d6e430c8a4c17`.
- Preserved baseline `d06d620`: SHA-256 `7b021e982d959d446b08dd20cf375da0faed28c82cf1eb263abdb429352406fc`.
- Verified rollback: `powershell -ExecutionPolicy Bypass -File "F:\0.codex软件制作库\chatgpt账号\discord翻译-交付\2026-08-09-auto-translation-recovery\rollback\restore-repository-plugin.ps1" -Target "<repository-plugin-path>"`; the smoke target restored the baseline hash and preserved the modified hash as `.pre-rollback`.
- Delivery roles live outside the repository under `F:\0.codex软件制作库\chatgpt账号\discord翻译-交付\2026-08-09-auto-translation-recovery`; no installed Discord file was read, written, started, or otherwise operated during this recovery slice.

### Ownership boundaries

- `HistoricalMessageSource`: rendered/cache/prefetch snapshot construction only.
- `live-translation-queue.js` plus `historical-job-registry.js`: the logical `TranslationJobCoordinator` boundary for live priority, historical scheduling, cancellation, retry, and timeout. Introduce no additional wrapper unless a failing scheduling test requires shared state.
- `MessageStateStore`: channel/message/source-version translation facts and manual-versus-automatic ownership.
- `TranslationDisplayController` and `DiscordRenderAdapter`: atomic state-to-view transaction, owner acknowledgement, anchor preservation, and restoration.
- `TranslationStatusStore`: compact progress state independent of message rendering.

---

## Scope

This plan implements the first architecture milestone only:

- Deterministic `src/` to single-plugin build
- Received-message display state ownership
- Live and historical received translation commits
- Hover-independent visible refresh
- Text and translated-decoration synchronization
- Channel disable and plugin-stop restoration
- Per-message terminal reason and local diagnostics
- Removal of the replaced received-display globals and branches

The following remain out of scope until this milestone passes every release gate:

- Provider adapter migration
- Sent translation policy migration
- Settings UI and persistent schema migration
- Reply, embed, and thread-title ownership migration beyond compatibility calls required for channel restoration
- New providers or new user-facing features

## Current Failure Baseline

- Stored translation data may remain invisible until Discord rerenders a message on hover.
- `Messages` owns translated text while `MessageContent` independently owns watermark and styling.
- Disabling a channel clears runtime records but may not force the message instances that still display translated props to rerender.
- Tests currently prove that a BDFDB refresh helper was called, not that the expected message IDs visibly committed.

## File Map

```text
.gitignore
package.json
package-lock.json
scripts/build-plugin.mjs
src/plugin/index.js
src/plugin/metadata.json
src/legacy/runtime.js
src/display/message-state-store.js
src/display/translation-display-controller.js
src/display/discord-render-adapter.js
src/display/display-runtime.js
src/diagnostics/display-transition-journal.js
DiscordAITranslator.plugin.js
tests/build-contract.test.js
tests/display/message-state-store.test.js
tests/display/translation-display-controller.test.js
tests/display/discord-render-adapter.test.js
tests/integration/received-display-runtime.test.js
tests/integration/received-display-lifecycle.test.js
tests/helpers/createPluginInstance.js
tests/helpers/createReceivedDisplayHarness.js
tests/received-display-ownership.test.js
```

`DiscordAITranslator.plugin.js` becomes generated output. Existing regression tests continue to load that generated file.

## Task 1: Establish The Deterministic Build Contract

**Files:**
- Create: `tests/build-contract.test.js`
- Create: `src/plugin/metadata.json`
- Create: `src/plugin/index.js`
- Create: `scripts/build-plugin.mjs`
- Create: `.gitignore`
- Move: `DiscordAITranslator.plugin.js` to `src/legacy/runtime.js`
- Generate: `DiscordAITranslator.plugin.js`
- Modify: `package.json`
- Create: `package-lock.json`

- [x] **Step 1: Write the failing build-contract test**

Create `tests/build-contract.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("the committed BetterDiscord plugin matches the deterministic source build", async () => {
	const {createPluginBundle} = await import("../scripts/build-plugin.mjs");
	const generated = await createPluginBundle();
	const committed = fs.readFileSync(path.join(root, "DiscordAITranslator.plugin.js"), "utf8");

	assert.equal(committed, generated);
});

test("the generated plugin keeps metadata and excludes development artifacts", async () => {
	const {createPluginBundle} = await import("../scripts/build-plugin.mjs");
	const generated = await createPluginBundle();

	assert.match(generated, /^\/\*\*[\s\S]*@name DiscordAITranslator/);
	assert.match(generated, /@version 0\.3\.36/);
	assert.doesNotMatch(generated, /sourceMappingURL=/);
	assert.doesNotMatch(generated, /tests\//);
	assert.doesNotMatch(generated, /TRANSLATOR_DISPLAY_DEBUG_JOURNAL/);
});
```

- [x] **Step 2: Run the test and verify it fails for the missing build module**

Run:

```powershell
node --test tests/build-contract.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/build-plugin.mjs`.

- [x] **Step 3: Install the pinned build dependency**

Run:

```powershell
npm install --save-dev esbuild@0.28.1
```

Expected: `package.json` gains `devDependencies.esbuild` and npm creates `package-lock.json`.

- [x] **Step 4: Create canonical plugin metadata**

Create `src/plugin/metadata.json`:

```json
{
  "name": "DiscordAITranslator",
  "author": "ROOT94",
  "authorLink": "https://github.com/ROOT94-MAX/DiscordAITranslator",
  "version": "0.3.36",
  "description": "BetterDiscord translation plugin with channel-aware automatic translation and AI providers.",
  "source": "https://github.com/ROOT94-MAX/DiscordAITranslator",
  "license": "GPL-2.0"
}
```

Create `.gitignore`:

```gitignore
node_modules/
coverage/
DiscordAITranslator.debug.plugin.js
*.backup.plugin.js
*.bak
```

- [x] **Step 5: Move the current runtime without changing its implementation**

Run:

```powershell
New-Item -ItemType Directory -Force src/legacy, src/plugin, scripts | Out-Null
git mv DiscordAITranslator.plugin.js src/legacy/runtime.js
```

Use `apply_patch` to remove only the leading BetterDiscord metadata comment from `src/legacy/runtime.js`. Do not format or refactor the moved runtime in this task.

Create `src/plugin/index.js`:

```js
module.exports = require("../legacy/runtime");
```

- [x] **Step 6: Implement the deterministic build script**

Create `scripts/build-plugin.mjs`:

```js
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {build} from "esbuild";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const outputPath = path.join(root, "DiscordAITranslator.plugin.js");

function createMetadataBanner(metadata) {
	return [
		"/**",
		` * @name ${metadata.name}`,
		` * @author ${metadata.author}`,
		` * @authorLink ${metadata.authorLink}`,
		` * @version ${metadata.version}`,
		` * @description ${metadata.description}`,
		` * @source ${metadata.source}`,
		` * @license ${metadata.license}`,
		" */",
		""
	].join("\n");
}

export async function createPluginBundle({debug = false} = {}) {
	const metadata = JSON.parse(fs.readFileSync(path.join(root, "src/plugin/metadata.json"), "utf8"));
	const result = await build({
		entryPoints: [path.join(root, "src/plugin/index.js")],
		bundle: true,
		platform: "node",
		format: "cjs",
		target: "es2020",
		charset: "utf8",
		legalComments: "none",
		minify: false,
		minifySyntax: true,
		sourcemap: false,
		define: {__TRANSLATOR_DISPLAY_DEBUG__: debug ? "true" : "false"},
		write: false
	});
	const runtime = result.outputFiles[0].text.replace(/\r\n/g, "\n").trimStart();
	return `${createMetadataBanner(metadata)}${runtime.trimEnd()}\n`;
}

export async function writePluginBundle({check = false, debug = false} = {}) {
	const generated = await createPluginBundle({debug});
	const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
	if (check && current !== generated) throw new Error("DiscordAITranslator.plugin.js is out of date. Run npm run build.");
	if (!check && !debug && current !== generated) fs.writeFileSync(outputPath, generated);
	return generated;
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
	const debug = process.argv.includes("--debug");
	const generated = await writePluginBundle({check: process.argv.includes("--check"), debug});
	if (debug) process.stdout.write(generated);
}
```

- [x] **Step 7: Update package scripts**

Set `package.json` scripts to:

```json
{
  "build": "node scripts/build-plugin.mjs",
  "build:debug": "node scripts/build-plugin.mjs --debug > DiscordAITranslator.debug.plugin.js",
  "build:check": "node scripts/build-plugin.mjs --check",
  "check": "node --check DiscordAITranslator.plugin.js",
  "test": "node --test",
  "verify": "npm run build:check && npm run check && npm test"
}
```

- [x] **Step 8: Generate the root plugin and run the build contract**

Run:

```powershell
npm run build
node --test tests/build-contract.test.js
```

Expected: both build-contract tests PASS.

- [x] **Step 9: Run the complete existing suite**

Run:

```powershell
npm run verify
```

Expected: the existing 203 tests plus the 2 build tests PASS. Any behavior failure means the build migration changed runtime semantics and must be fixed before continuing.

- [x] **Step 10: Commit the build skeleton**

```powershell
git add .gitignore package.json package-lock.json scripts src DiscordAITranslator.plugin.js tests/build-contract.test.js
git commit -m "build: generate plugin from modular source"
```

**Task 1 evidence:** Red contract observed `ERR_MODULE_NOT_FOUND`; final build contract `2/2`; full verification `205/205`; active esbuild binary URL and SHA-512 locked; spec and quality reviews approved. Commits: `0b412bb`, `182c7eb`, `5c4ebed`, `fc1e4ea`, `8477fb2`.

## Task 2: Add The Message State Store

**Files:**
- Create: `src/display/message-state-store.js`
- Create: `tests/display/message-state-store.test.js`

- [x] **Step 1: Write failing state ownership tests**

Create `tests/display/message-state-store.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageStateStore} = require("../../src/display/message-state-store");

function snapshot(messageId, channelId, content, generation = 1) {
	return {
		messageId,
		channelId,
		generation,
		sourceSignature: `${channelId}:${messageId}:${content}`,
		source: {content, embeds: [{description: `${content} embed`}]}
	};
}

function translated(messageId, channelId, content, generation = 1, origin = "automatic") {
	return {messageId, channelId, generation, origin, status: "translated", translation: {content}};
}

test("translation commits never overwrite the immutable source", () => {
	const store = createMessageStateStore();
	const source = snapshot("m1", "c1", "Hello");
	store.captureSource(source);
	source.source.content = "mutated outside";
	source.source.embeds[0].description = "mutated embed";
	store.commitResult(translated("m1", "c1", "你好"));

	const state = store.getDisplayState("m1");
	assert.equal(state.source.content, "Hello");
	assert.equal(state.source.embeds[0].description, "Hello embed");
	assert.equal(state.translation.content, "你好");
	assert.equal(state.status, "translated");
	assert.equal(Object.isFrozen(state.source), true);
});

test("an edited source replaces stale display state", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Before edit"));
	store.commitResult(translated("m1", "c1", "旧译文"));
	const translatedRevision = store.getDisplayState("m1").revision;

	store.captureSource(snapshot("m1", "c1", "After edit"));

	const state = store.getDisplayState("m1");
	assert.equal(state.source.content, "After edit");
	assert.equal(state.translation, null);
	assert.equal(state.status, "idle");
	assert.equal(state.revision > translatedRevision, true);
});

test("restoreChannel changes only automatic records in that channel", () => {
	const store = createMessageStateStore();
	for (const [messageId, channelId, origin] of [["auto-a", "c1", "automatic"], ["manual-a", "c1", "manual"], ["auto-b", "c2", "automatic"]]) {
		store.captureSource(snapshot(messageId, channelId, `${messageId} source`));
		store.commitResult(translated(messageId, channelId, `${messageId} translated`, 1, origin));
	}

	const restored = store.restoreChannel("c1");

	assert.deepEqual(restored.map(record => record.messageId), ["auto-a"]);
	assert.equal(store.getDisplayState("auto-a").translation, null);
	assert.equal(store.getDisplayState("auto-a").reason, "channel-disabled");
	assert.equal(store.getDisplayState("manual-a").translation.content, "manual-a translated");
	assert.equal(store.getDisplayState("auto-b").translation.content, "auto-b translated");
});

test("a stale generation cannot commit into a newer channel session", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.setChannelGeneration("c1", 2);

	assert.equal(store.commitResult(translated("m1", "c1", "stale")), null);
	assert.equal(store.getDisplayState("m1").status, "idle");
});

test("commitBatch is all-or-nothing when one result is stale", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "One"));
	store.captureSource(snapshot("m2", "c1", "Two"));

	const outcome = store.commitBatch([
		translated("m1", "c1", "一"),
		translated("m2", "c1", "二", 0)
	]);

	assert.deepEqual(outcome.committed, []);
	assert.deepEqual(outcome.rejected.map(result => result.messageId), ["m2"]);
	assert.equal(store.getDisplayState("m1").status, "idle");
	assert.equal(store.getDisplayState("m2").status, "idle");
});

test("render acknowledgement does not create a new display revision", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(translated("m1", "c1", "你好"));
	const revision = store.getDisplayState("m1").revision;

	store.markRenderOutcome({confirmedIds: [], missingIds: ["m1"]});
	assert.equal(store.getDisplayState("m1").revision, revision);
	assert.equal(store.getDisplayState("m1").renderStatus, "unconfirmed");
	assert.equal(store.getDisplayState("m1").renderReason, "render-unconfirmed");

	store.markRenderOutcome({confirmedIds: ["m1"], missingIds: []});
	assert.equal(store.getDisplayState("m1").revision, revision);
	assert.equal(store.getDisplayState("m1").renderStatus, "confirmed");
	assert.equal(store.getDisplayState("m1").renderReason, null);
});
```

- [x] **Step 2: Verify the test fails for the missing module**

Run:

```powershell
node --test tests/display/message-state-store.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND`.

- [x] **Step 3: Implement the store as a deep module**

Create `src/display/message-state-store.js` with the API exercised above. The implementation must use these exact exports and record fields:

```js
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

function freezeValue(value) {
	if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
	if (!value || typeof value !== "object") return value;
	return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
}

function createMessageStateStore() {
	const records = new Map();
	const channelMessageIds = new Map();
	const channelGenerations = new Map();
	let revision = 0;

	function indexRecord(record) {
		if (!channelMessageIds.has(record.channelId)) channelMessageIds.set(record.channelId, new Set());
		channelMessageIds.get(record.channelId).add(record.messageId);
	}

	function unindexRecord(record) {
		const ids = channelMessageIds.get(record.channelId);
		if (!ids) return;
		ids.delete(record.messageId);
		if (!ids.size) channelMessageIds.delete(record.channelId);
	}

	function update(messageId, changes, {advanceRevision = true} = {}) {
		const current = records.get(String(messageId));
		if (!current) return null;
		const next = Object.freeze({...current, ...changes, revision: advanceRevision ? ++revision : current.revision});
		records.set(next.messageId, next);
		return next;
	}

	function validates(result) {
		const messageId = String(result && result.messageId || "");
		const channelId = String(result && result.channelId || "");
		const record = records.get(messageId);
		const status = result && (result.status || MESSAGE_STATUSES.TRANSLATED);
		const validStatus = [MESSAGE_STATUSES.TRANSLATED, MESSAGE_STATUSES.SKIPPED, MESSAGE_STATUSES.FAILED, MESSAGE_STATUSES.CANCELLED].includes(status);
		const validTranslation = status !== MESSAGE_STATUSES.TRANSLATED || !!(result.translation && typeof result.translation.content === "string");
		return !!record && validStatus && validTranslation && record.channelId === channelId && record.generation === result.generation && channelGenerations.get(channelId) === result.generation;
	}

	function applyResult(result) {
		const status = result.status || MESSAGE_STATUSES.TRANSLATED;
		const translated = status === MESSAGE_STATUSES.TRANSLATED;
		return update(result.messageId, {
			status,
			translation: translated ? freezeValue(result.translation) : null,
			reason: translated ? null : String(result.reason || status),
			origin: result.origin || "automatic",
			requestIdentity: null,
			renderStatus: RENDER_STATUSES.PENDING,
			renderReason: null
		});
	}

	function restoreRecords(recordsToRestore, reason) {
		return recordsToRestore.filter(record => record && record.origin === "automatic" && record.status !== MESSAGE_STATUSES.CANCELLED).map(record => update(record.messageId, {
			status: MESSAGE_STATUSES.CANCELLED,
			translation: null,
			reason,
			requestIdentity: null,
			renderStatus: RENDER_STATUSES.PENDING,
			renderReason: null
		}));
	}

	function listChannel(channelId) {
		return [...channelMessageIds.get(String(channelId)) || []].map(messageId => records.get(messageId)).filter(Boolean);
	}

	return Object.freeze({
		captureSource(snapshot) {
			const messageId = String(snapshot.messageId);
			const channelId = String(snapshot.channelId);
			const currentGeneration = channelGenerations.get(channelId);
			if (currentGeneration !== undefined && currentGeneration !== snapshot.generation) return null;
			const current = records.get(messageId);
			if (current && current.channelId === channelId && current.generation === snapshot.generation && current.sourceSignature === snapshot.sourceSignature) return current;
			if (current) unindexRecord(current);
			const record = Object.freeze({
				messageId,
				channelId,
				generation: snapshot.generation,
				sourceSignature: String(snapshot.sourceSignature || ""),
				source: freezeValue(snapshot.source || {}),
				status: MESSAGE_STATUSES.IDLE,
				translation: null,
				reason: null,
				origin: null,
				requestIdentity: null,
				renderStatus: RENDER_STATUSES.IDLE,
				renderReason: null,
				revision: ++revision
			});
			records.set(messageId, record);
			indexRecord(record);
			if (currentGeneration === undefined) channelGenerations.set(channelId, snapshot.generation);
			return record;
		},
		setChannelGeneration(channelId, generation) {channelGenerations.set(String(channelId), generation);},
		getChannelGeneration(channelId) {return channelGenerations.get(String(channelId));},
		getDisplayState(messageId) {return records.get(String(messageId)) || null;},
		listChannel,
		markPending(request) {
			if (!validates(request)) return null;
			return update(request.messageId, {status: MESSAGE_STATUSES.PENDING, translation: null, reason: null, origin: request.origin || "automatic", requestIdentity: request.requestIdentity || null, renderStatus: RENDER_STATUSES.PENDING, renderReason: null});
		},
		markTranslating(request) {
			if (!validates(request)) return null;
			return update(request.messageId, {status: MESSAGE_STATUSES.TRANSLATING, reason: null, requestIdentity: request.requestIdentity || null, renderStatus: RENDER_STATUSES.PENDING, renderReason: null});
		},
		commitResult(result) {return validates(result) ? applyResult(result) : null;},
		commitBatch(results) {
			const channelIds = new Set(results.map(result => String(result && result.channelId || "")));
			const rejected = channelIds.size === 1 ? results.filter(result => !validates(result)) : results.slice();
			if (rejected.length) return {committed: [], rejected};
			return {committed: results.map(applyResult), rejected: []};
		},
		restoreChannel(channelId, reason = "channel-disabled") {return restoreRecords(listChannel(channelId), reason);},
		restoreAll(reason = "plugin-stopped") {return restoreRecords([...records.values()], reason);},
		markRenderOutcome({confirmedIds = [], missingIds = []}) {
			for (const messageId of confirmedIds) update(messageId, {renderStatus: RENDER_STATUSES.CONFIRMED, renderReason: null}, {advanceRevision: false});
			for (const messageId of missingIds) update(messageId, {renderStatus: RENDER_STATUSES.UNCONFIRMED, renderReason: "render-unconfirmed"}, {advanceRevision: false});
		}
	});
}

module.exports = {MESSAGE_STATUSES, RENDER_STATUSES, createMessageStateStore};
```

Do not expose either internal map. `markRenderOutcome` must not advance `revision`; the DOM marker acknowledges the revision that was actually requested.

- [x] **Step 4: Run the focused test**

```powershell
node --test tests/display/message-state-store.test.js
```

Expected: PASS.

- [x] **Step 5: Run the complete suite and commit**

```powershell
npm run verify
git add src/display/message-state-store.js tests/display/message-state-store.test.js
git commit -m "refactor: add received message state store"
```

**Verification evidence (2026-07-16):** `d966a45`; focused state-store tests `22/22`; full `npm run verify` `237/237`; specification and code-quality reviews approved.

## Task 3: Add The Translation Display Controller

**Files:**
- Create: `src/display/translation-display-controller.js`
- Create: `tests/display/translation-display-controller.test.js`

- [x] **Step 1: Add failing controller tests**

Create `tests/display/translation-display-controller.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageStateStore} = require("../../src/display/message-state-store");
const {createTranslationDisplayController} = require("../../src/display/translation-display-controller");

function capture(store, messageId, channelId = "c1") {
	store.captureSource({messageId, channelId, generation: 1, sourceSignature: `${channelId}:${messageId}`, source: {content: `${messageId} source`, embeds: []}});
}

function result(messageId, channelId = "c1", origin = "automatic") {
	return {messageId, channelId, generation: 1, origin, status: "translated", translation: {content: `${messageId} translated`}};
}

function createHarness(renderOutcome) {
	const refreshes = [];
	const store = createMessageStateStore();
	const renderAdapter = {
		async refreshMessages(request) {
			refreshes.push(request);
			return renderOutcome ? renderOutcome(request) : {confirmedIds: request.messageIds, missingIds: [], fallbackUsed: false};
		}
	};
	return {store, refreshes, controller: createTranslationDisplayController({store, renderAdapter})};
}

test("one result refreshes text and decoration under one revision", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "m1");

	await controller.commitMessageResult(result("m1"));

	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, ["m1"]);
	assert.equal(refreshes[0].views[0].content, "m1 translated");
	assert.equal(refreshes[0].views[0].translated, true);
	assert.equal(refreshes[0].views[0].showWatermark, true);
	assert.equal(refreshes[0].views[0].revision, store.getDisplayState("m1").revision);
});

test("one historical batch creates one refresh request", async () => {
	const {store, refreshes, controller} = createHarness();
	for (const messageId of ["m1", "m2", "m3"]) capture(store, messageId);

	await controller.commitHistoricalBatch([result("m1"), result("m2"), result("m3")]);

	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, ["m1", "m2", "m3"]);
	assert.deepEqual(refreshes[0].views.map(view => view.content), ["m1 translated", "m2 translated", "m3 translated"]);
});

test("restoreChannel sends original automatic content in one request", async () => {
	const {store, refreshes, controller} = createHarness();
	capture(store, "automatic");
	capture(store, "manual");
	store.commitResult(result("automatic"));
	store.commitResult(result("manual", "c1", "manual"));
	refreshes.length = 0;

	await controller.restoreChannel("c1");

	assert.equal(refreshes.length, 1);
	assert.deepEqual(refreshes[0].messageIds, ["automatic"]);
	assert.equal(refreshes[0].views[0].content, "automatic source");
	assert.equal(refreshes[0].views[0].translated, false);
	assert.equal(refreshes[0].views[0].showWatermark, false);
	assert.equal(controller.getDisplayView("manual").content, "manual translated");
});

test("missing render acknowledgement remains inspectable without changing the display revision", async () => {
	const {store, controller} = createHarness(request => ({confirmedIds: [], missingIds: request.messageIds, fallbackUsed: true}));
	capture(store, "m1");

	await controller.commitMessageResult(result("m1"));

	const view = controller.getDisplayView("m1");
	assert.equal(view.renderStatus, "unconfirmed");
	assert.equal(view.renderReason, "render-unconfirmed");
	assert.equal(view.translated, true);
});
```

- [x] **Step 2: Verify the controller test fails**

```powershell
node --test tests/display/translation-display-controller.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND`.

- [x] **Step 3: Implement the controller**

Create `src/display/translation-display-controller.js`:

```js
function createDisplayView(state) {
	if (!state) return null;
	const translated = state.status === "translated" && !!state.translation;
	return Object.freeze({
		messageId: state.messageId,
		channelId: state.channelId,
		revision: state.revision,
		status: state.status,
		content: translated ? String(state.translation.content || "") : String(state.source.content || ""),
		translated,
		showWatermark: translated,
		showLoading: state.status === "pending" || state.status === "translating",
		reason: state.reason,
		renderStatus: state.renderStatus,
		renderReason: state.renderReason,
		translation: state.translation,
		source: state.source,
		origin: state.origin
	});
}

function createTranslationDisplayController({store, renderAdapter}) {
	let transactionSequence = 0;

	async function refreshRecords(records) {
		const views = records.map(record => createDisplayView(store.getDisplayState(record.messageId))).filter(Boolean);
		if (!views.length) return {confirmedIds: [], missingIds: [], fallbackUsed: false};
		const channelIds = new Set(views.map(view => view.channelId));
		if (channelIds.size !== 1) throw new Error("A display transaction cannot span channels");
		const outcome = await renderAdapter.refreshMessages({
			transactionId: ++transactionSequence,
			channelId: views[0].channelId,
			messageIds: views.map(view => view.messageId),
			views
		});
		store.markRenderOutcome(outcome);
		return outcome;
	}

	return Object.freeze({
		getDisplayView(messageId) {return createDisplayView(store.getDisplayState(messageId));},
		async renderMessage(messageId) {
			const record = store.getDisplayState(messageId);
			return record ? refreshRecords([record]) : {confirmedIds: [], missingIds: [], fallbackUsed: false};
		},
		async markPending(request, {refresh = true} = {}) {
			const record = store.markPending(request);
			if (!record) return {confirmedIds: [], missingIds: [], fallbackUsed: false, rejectedIds: [String(request.messageId)]};
			return refresh ? refreshRecords([record]) : {confirmedIds: [], missingIds: [], fallbackUsed: false, deferredIds: [record.messageId]};
		},
		async commitMessageResult(result) {
			const record = store.commitResult(result);
			return record ? refreshRecords([record]) : {confirmedIds: [], missingIds: [], fallbackUsed: false, rejectedIds: [String(result.messageId)]};
		},
		async commitHistoricalBatch(results) {
			const outcome = store.commitBatch(results);
			if (!outcome.committed.length) return {confirmedIds: [], missingIds: [], fallbackUsed: false, rejectedIds: outcome.rejected.map(result => String(result.messageId))};
			return refreshRecords(outcome.committed);
		},
		async restoreChannel(channelId) {
			return refreshRecords(store.restoreChannel(channelId));
		},
		async restoreAll({refresh = true} = {}) {
			const records = store.restoreAll();
			if (!refresh) return records;
			const byChannel = new Map();
			for (const record of records) {
				if (!byChannel.has(record.channelId)) byChannel.set(record.channelId, []);
				byChannel.get(record.channelId).push(record);
			}
			return Promise.all([...byChannel.values()].map(refreshRecords));
		}
	});
}

module.exports = {createDisplayView, createTranslationDisplayController};
```

- [x] **Step 4: Run focused and full tests**

```powershell
node --test tests/display/message-state-store.test.js tests/display/translation-display-controller.test.js
npm run verify
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add src/display tests/display
git commit -m "refactor: add translation display controller"
```

**Verification evidence (2026-07-26):** `7ffad07`; red phase reproduced `MODULE_NOT_FOUND` with the module absent; focused controller tests `19/19`; full `npm run verify` `256/256`. The committed controller hardens the plan baseline: it filters late render acknowledgements against the current display revision (reported as `staleIds`) and rejects a transaction whose records lack views instead of silently dropping them.

## Task 4: Add The Discord Render Adapter And Render Acknowledgement

**Files:**
- Create: `src/display/discord-render-adapter.js`
- Create: `tests/display/discord-render-adapter.test.js`

- [x] **Step 1: Write failing adapter tests**

Create `tests/display/discord-render-adapter.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {createDiscordRenderAdapter} = require("../../src/display/discord-render-adapter");

function createHarness({confirmDirectly = true, userScrollDuringUpdate = false} = {}) {
	const visibleRevisions = new Map();
	const messageNodes = new Map(["m1", "m2"].map(messageId => [messageId, {
		querySelector(selector) {
			const match = selector.match(/data-translator-revision="(\d+)"/);
			return match && visibleRevisions.get(messageId) === Number(match[1]) ? {} : null;
		}
	}]));
	const scroller = {scrollTop: 240};
	const owner = {props: {channelStream: []}};
	const calls = {forceUpdate: 0, rerenderAll: 0, restored: 0};
	let userIntentSequence = 7;
	const document = {
		querySelector(selector) {
			if (selector === ".messages-scroller") return scroller;
			const match = selector.match(/m[12]/);
			return match ? messageNodes.get(match[0]) : null;
		}
	};
	const BDFDB = {
		dotCN: {messagesscroller: ".messages-scroller"},
		ReactUtils: {
			findOwner(_node, config) {
				assert.equal(config.filter(owner), true);
				return owner;
			},
			forceUpdate() {
				calls.forceUpdate++;
				if (userScrollDuringUpdate) userIntentSequence++;
				if (confirmDirectly) {
					visibleRevisions.set("m1", 11);
					visibleRevisions.set("m2", 12);
				}
			}
		},
		MessageUtils: {
			rerenderAll(instant) {
				assert.equal(instant, true);
				calls.rerenderAll++;
				visibleRevisions.set("m1", 11);
				visibleRevisions.set("m2", 12);
			}
		}
	};
	const adapter = createDiscordRenderAdapter({
		BDFDB,
		document,
		requestAnimationFrame: callback => callback(),
		setTimeout: callback => callback(),
		getUserScrollIntentSequence: () => userIntentSequence,
		captureScrollState: () => ({scrollTop: scroller.scrollTop}),
		restoreScrollState: state => {
			calls.restored++;
			scroller.scrollTop = state.scrollTop;
		}
	});
	return {adapter, calls, scroller};
}

const request = {
	transactionId: 1,
	channelId: "c1",
	messageIds: ["m1", "m2"],
	views: [{messageId: "m1", revision: 11}, {messageId: "m2", revision: 12}]
};

test("refreshMessages forces the channel stream owner and confirms exact revisions", async () => {
	const {adapter, calls} = createHarness();
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 1);
	assert.equal(calls.rerenderAll, 0);
	assert.equal(calls.restored, 1);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
	assert.deepEqual(outcome.missingIds, []);
	assert.equal(outcome.fallbackUsed, false);
});

test("a missing direct confirmation uses one full-list fallback", async () => {
	const {adapter, calls} = createHarness({confirmDirectly: false});
	const outcome = await adapter.refreshMessages(request);

	assert.equal(calls.forceUpdate, 1);
	assert.equal(calls.rerenderAll, 1);
	assert.equal(outcome.fallbackUsed, true);
	assert.deepEqual(outcome.confirmedIds, ["m1", "m2"]);
});

test("a user scroll after capture prevents anchor correction", async () => {
	const {adapter, calls, scroller} = createHarness({userScrollDuringUpdate: true});
	scroller.scrollTop = 700;
	await adapter.refreshMessages(request);

	assert.equal(calls.restored, 0);
	assert.equal(scroller.scrollTop, 700);
});
```

- [x] **Step 2: Verify the tests fail**

```powershell
node --test tests/display/discord-render-adapter.test.js
```

Expected: FAIL with `MODULE_NOT_FOUND`.

- [x] **Step 3: Implement exact owner lookup instead of component-name scanning**

Create `src/display/discord-render-adapter.js` with dependency injection. Reuse the runtime's existing scroll capture and restoration functions instead of duplicating anchor logic:

```js
function createDiscordRenderAdapter({BDFDB, document, requestAnimationFrame, setTimeout, getUserScrollIntentSequence, captureScrollState, restoreScrollState}) {
	function findMessageElement(messageId) {
		const escapedId = String(messageId).replace(/(["\\])/g, "\\$1");
		return document.querySelector(`[id$="-${escapedId}"], [data-list-item-id$="-${escapedId}"], [data-list-item-id*="${escapedId}"]`);
	}

	function findStreamOwner(scroller) {
		return BDFDB.ReactUtils.findOwner(scroller, {
			up: true,
			unlimited: true,
			filter: instance => {
				const props = instance && (instance.stateNode && instance.stateNode.props || instance.props || instance.memoizedProps);
				return !!(props && Array.isArray(props.channelStream));
			}
		});
	}

	function waitForPaint() {
		return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	}

	function waitForFallbackPaint() {
		return new Promise(resolve => setTimeout(() => waitForPaint().then(resolve), 0));
	}

	function confirmViews(views) {
		return views.filter(view => {
			const element = findMessageElement(view.messageId);
			return !!(element && element.querySelector(`[data-translator-revision="${view.revision}"]`));
		}).map(view => view.messageId);
	}

	return {
		async refreshMessages({messageIds, views}) {
			const scroller = document.querySelector(BDFDB.dotCN.messagesscroller);
			const intentSequence = getUserScrollIntentSequence();
			const scrollState = scroller ? captureScrollState() : null;
			const owner = scroller && findStreamOwner(scroller);
			if (owner) BDFDB.ReactUtils.forceUpdate(owner);
			await waitForPaint();
			let confirmedIds = confirmViews(views);
			let fallbackUsed = false;
			if (confirmedIds.length !== messageIds.length) {
				fallbackUsed = true;
				BDFDB.MessageUtils.rerenderAll(true);
				await waitForFallbackPaint();
				confirmedIds = confirmViews(views);
			}
			if (scrollState && intentSequence === getUserScrollIntentSequence()) restoreScrollState(scrollState);
			return {confirmedIds, fallbackUsed, missingIds: messageIds.filter(id => !confirmedIds.includes(id))};
		}
	};
}

module.exports = {createDiscordRenderAdapter};
```

Do not call `PatchUtils.forceAllUpdates` from this adapter. The direct path uses the actual channel-stream owner. The full-list rerender is a correctness fallback and must run at most once per display transaction.

- [x] **Step 4: Run the adapter tests and full verification**

```powershell
node --test tests/display/discord-render-adapter.test.js
npm run verify
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add src/display/discord-render-adapter.js tests/display/discord-render-adapter.test.js
git commit -m "refactor: add acknowledged Discord render adapter"
```

**Verification evidence (2026-07-16):** `65b24a0`; focused render-adapter tests `10/10`; full `npm run verify` `237/237`; specification and code-quality reviews approved.

## Task 5: Wire The New Display Runtime Into The Generated Plugin

**Files:**
- Create: `src/display/display-runtime.js`
- Modify: `src/legacy/runtime.js`
- Modify: `tests/helpers/createPluginInstance.js`
- Create: `tests/helpers/createReceivedDisplayHarness.js`
- Create: `tests/integration/received-display-runtime.test.js`

- [x] **Step 1: Write failing integration tests for one authoritative display view**

Create `tests/helpers/createReceivedDisplayHarness.js`:

```js
const {createPluginInstance} = require("./createPluginInstance");

function createHarness({confirmDirectly = true, confirmAfterFallback = true} = {}) {
	const originalDocument = global.document;
	const originalRequestAnimationFrame = global.requestAnimationFrame;
	const calls = {forceUpdate: 0, rerenderAll: 0};
	let confirmed = false;
	const messageElement = {querySelector: () => confirmed ? {} : null};
	const scroller = {scrollTop: 100, scrollHeight: 1000, clientHeight: 400};
	global.document = {
		querySelector(selector) {
			if (selector === ".messages-scroller") return scroller;
			if (selector.includes("message-")) return messageElement;
			return null;
		}
	};
	global.requestAnimationFrame = callback => callback();
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			dotCN: {messagesscroller: ".messages-scroller"},
			disCN: {messagetimestamp: "timestamp", messagetimestampinline: "inline", _translatortranslated: "translated", messageedited: "edited"},
			DOMUtils: {formatClassName: (...names) => names.filter(Boolean).join(" ")},
			LibraryComponents: {TooltipContainer: "TooltipContainer"},
			ReactUtils: {
				createElement: (type, props) => ({type, key: props && props.key, props: props || {}}),
				findOwner: () => ({props: {channelStream: []}}),
				forceUpdate: () => {calls.forceUpdate++; if (confirmDirectly) confirmed = true;}
			},
			MessageUtils: {rerenderAll: () => {calls.rerenderAll++; if (confirmAfterFallback) confirmed = true;}}
		}
	});
	plugin.settings.general.highlightTranslatedMessages = true;
	plugin.labels.translated_watermark = "Translated";
	plugin.getTranslatedTextColor = () => "#12a594";
	plugin.shouldProtectWrappedTextForPlace = () => false;
	return {
		plugin,
		calls,
		restore() {
			global.document = originalDocument;
			global.requestAnimationFrame = originalRequestAnimationFrame;
		}
	};
}

function sourceSnapshot() {
	return {messageId: "message-1", channelId: "channel-1", generation: 1, sourceSignature: "signature-1", source: {content: "Original", embeds: []}};
}

function translatedResult() {
	return {messageId: "message-1", channelId: "channel-1", generation: 1, origin: "automatic", status: "translated", translation: {content: "译文", input: {id: "en"}, output: {id: "zh-CN"}}};
}

module.exports = {createHarness, sourceSnapshot, translatedResult};
```

Create `tests/integration/received-display-runtime.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {createHarness, sourceSnapshot, translatedResult} = require("../helpers/createReceivedDisplayHarness");

test("Messages and MessageContent read the same translated revision", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());
		const view = plugin.getReceivedDisplayView("message-1");
		const stream = {content: {id: "message-1", channel_id: "channel-1", content: "Original", embeds: []}};
		plugin.applyReceivedDisplayViewToStream(stream, view);
		const event = {instance: {props: {message: stream.content}}, returnvalue: {props: {children: [], className: "message", style: {}}}};
		plugin.applyReceivedDisplayViewToContent(event, view);

		assert.equal(stream.content.content, "译文");
		assert.equal(event.returnvalue.props["data-translator-revision"], String(view.revision));
		assert.match(event.returnvalue.props.className, /translator-translated-message/);
		assert.equal(event.returnvalue.props.style["--translator-text-color"], "#12a594");
		assert.equal(event.returnvalue.props.children.some(child => child && child.key === "translator-translated-watermark"), true);
	}
	finally {harness.restore();}
});

test("a translated result cannot produce text without translated decoration", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());
		const view = plugin.getReceivedDisplayView("message-1");
		const stream = {content: {id: "message-1", channel_id: "channel-1", content: "Original", embeds: []}};
		const event = {instance: {props: {message: stream.content}}, returnvalue: {props: {children: [], className: "", style: {}}}};

		plugin.applyReceivedDisplayViewToStream(stream, view);
		plugin.applyReceivedDisplayViewToContent(event, view);

		assert.equal(stream.content.content === "译文", event.returnvalue.props.className.includes("translator-translated-message"));
		assert.equal(event.returnvalue.props["data-translator-revision"], String(view.revision));
	}
	finally {harness.restore();}
});

test("render acknowledgement failure keeps the record inspectable", async () => {
	const harness = createHarness({confirmDirectly: false, confirmAfterFallback: false});
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.commitReceivedDisplayResult(translatedResult());

		const view = plugin.getReceivedDisplayView("message-1");
		assert.equal(view.renderStatus, "unconfirmed");
		assert.equal(view.renderReason, "render-unconfirmed");
	}
	finally {harness.restore();}
});

test("a pending view renders one loading indicator without translated decoration", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(sourceSnapshot());
		await plugin.markReceivedDisplayPending({messageId: "message-1", channelId: "channel-1", generation: 1, origin: "automatic", requestIdentity: "request-1"}, {refresh: false});
		const view = plugin.getReceivedDisplayView("message-1");
		const event = {instance: {props: {message: {id: "message-1", channel_id: "channel-1", content: "Original", embeds: []}}}, returnvalue: {props: {children: [], className: "", style: {}}}};

		plugin.applyReceivedDisplayViewToContent(event, view);

		assert.equal(view.showLoading, true);
		assert.equal(event.returnvalue.props.children.filter(child => child && child.key === "translator-translation-loading").length, 1);
		assert.doesNotMatch(event.returnvalue.props.className, /translator-translated-message/);
	}
	finally {harness.restore();}
});
```

- [x] **Step 2: Verify the integration tests fail**

```powershell
npm run build
node --test tests/integration/received-display-runtime.test.js
```

Expected: FAIL because the plugin does not expose or use the new display runtime.

- [x] **Step 3: Create the runtime wiring module**

Create `src/display/display-runtime.js`:

```js
const {createMessageStateStore} = require("./message-state-store");
const {createTranslationDisplayController} = require("./translation-display-controller");
const {createDiscordRenderAdapter} = require("./discord-render-adapter");

function createDisplayRuntime(dependencies) {
	const store = createMessageStateStore();
	const renderAdapter = createDiscordRenderAdapter(dependencies);
	const controller = createTranslationDisplayController({store, renderAdapter});
	return Object.freeze({
		captureSource: snapshot => store.captureSource(snapshot),
		setChannelGeneration: (channelId, generation) => store.setChannelGeneration(channelId, generation),
		getChannelGeneration: channelId => store.getChannelGeneration(channelId),
		getDisplayView: messageId => controller.getDisplayView(messageId),
		markPending: (request, options) => controller.markPending(request, options),
		commitMessageResult: result => controller.commitMessageResult(result),
		commitHistoricalBatch: results => controller.commitHistoricalBatch(results),
		restoreChannel: channelId => controller.restoreChannel(channelId),
		restoreAll: options => controller.restoreAll(options)
	});
}

module.exports = {createDisplayRuntime};
```

- [x] **Step 4: Instantiate it once inside the BDFDB runtime closure**

In `src/legacy/runtime.js`, require `createDisplayRuntime` near the logical module declarations. Add `ensureReceivedDisplayRuntime()` on the plugin class so the runtime is created once per plugin instance. Inject `BDFDB`, `document`, `requestAnimationFrame`, `setTimeout`, a getter for `autoTranslationUserScrollIntentSequence`, and callbacks to the existing `captureMessageScrollerState()` and `restoreMessageScrollerState()` methods.

Expose only temporary compatibility methods on the plugin class:

```text
captureReceivedMessageSource(snapshot)
markReceivedDisplayPending(request, options)
commitReceivedDisplayResult(result)
commitHistoricalReceivedDisplayBatch(results)
getReceivedDisplayView(messageId)
restoreReceivedDisplayChannel(channelId)
restoreAllReceivedDisplay(options)
setReceivedDisplayGeneration(channelId, generation)
getReceivedDisplayGeneration(channelId)
resetReceivedDisplayRuntime()
applyReceivedDisplayViewToStream(stream, view)
applyReceivedDisplayViewToContent(event, view)
```

Do not expose the store object or its maps.

- [ ] **Step 5: Route automatic received commits through the controller**

Update these existing paths in `src/legacy/runtime.js`:

- Source capture and pending-state handling in `checkMessage`
- Cached received result handling
- Live `translateMessage` received result handling
- `getActiveMessageTranslation`
- `clearDisplayedTranslationState`
- `clearDisplayedAutoTranslations`
- `getDisplayedTranslationChannelId`

Historical commit wiring is completed in Task 7. Automatic received records go only to `MessageStateStore`. Manual message translations remain on the legacy path during this milestone and are converted to the same display-view shape by `getReceivedDisplayView`. Do not write one automatic result to both `translatedMessages` and the new store.

When `checkMessage` captures a message during the same Discord render, call `markReceivedDisplayPending(request, {refresh: false})`. `MessageContent` reads that pending view later in the same render and adds the loading indicator without scheduling another list refresh. A caller that marks an already-mounted message pending may use the default `{refresh: true}` path.

- [x] **Step 6: Make both patch paths consume the same view**

`processMessages` obtains one view and calls `applyReceivedDisplayViewToStream`. `processMessageContent` obtains the same revision and calls `applyReceivedDisplayViewToContent` for watermark, translated class, color variables, loading state, and reason. The stream method clones the Discord message before replacing `content`; it never mutates the message store object. Add this prop to the rendered message content root:

```js
e.returnvalue.props["data-translator-revision"] = String(view.revision);
```

Whenever a view exists, set the revision attribute even when the view renders original text. This lets the adapter acknowledge restoration. When no view exists, remove the attribute and every translator decoration.

`applyReceivedDisplayViewToContent` converts a translated view to the existing decoration input only at this compatibility boundary. A pending view adds the fixed-size loading node. A cancelled, skipped, or failed view keeps the revision attribute but removes watermark, translated classes, color variables, and loading state. A missing view removes all translator-owned attributes and decoration.

- [x] **Step 7: Update the test helper only for injected adapter dependencies**

Add no-op patch targets to the base BDFDB fixture so lifecycle tests can call `onStart()` without loading Discord modules:

```js
LibraryModules: {
	MessageUtils: {},
	MessageToolbarUtils: {}
},
PatchUtils: {
	patch: () => {},
	forceAllUpdates: () => {}
}
```

The dedicated `createReceivedDisplayHarness` supplies `ReactUtils.findOwner`, `ReactUtils.forceUpdate`, DOM nodes, animation frames, and message confirmation. Tests still enter through plugin compatibility methods and never bypass the controller.

- [x] **Step 8: Build and run focused tests**

```powershell
npm run build
node --test tests/integration/received-display-runtime.test.js tests/translation-regression.test.js tests/historical-translation-job.test.js
```

Expected: PASS.

- [x] **Step 9: Run full verification and commit**

```powershell
npm run verify
git add src DiscordAITranslator.plugin.js tests
git commit -m "refactor: route received display through one state owner"
```

**Verification evidence (2026-07-26):** `640e01b`; red phase observed 6/6 integration failures (`captureReceivedMessageSource is not a function`); focused integration tests `6/6`; full `npm run verify` `262/262`. Adjustments against the plan baseline: the committed state store requires terminal results to carry a matching `sourceSignature`, so the harness result fixtures include it; the injected `captureScrollState`/`restoreScrollState` callbacks guard exceptions because scroll-anchor capture requires DOM APIs a test environment does not provide. Step 5 is intentionally partial: `checkMessage` now captures every received source into the store and both patch paths consume a store view when one is authoritative, but pending-marking and the live/cached/historical commit-target switch stay on the legacy path because Task 7's red-phase tests require observing that path before replacing it. Until Task 7 lands, no runtime path commits translated results into the store, so the store cannot diverge from the legacy display maps.

- [x] **Step 5 (deferred remainder): moved to Task 7** — route live, cached, and historical automatic received commits through the controller and mark queue items pending in the store. Completed in `179552a` (Task 7).

## Task 6: Fix Channel Disable And Plugin Stop Restoration

**Files:**
- Modify: `src/display/message-state-store.js`
- Modify: `src/display/translation-display-controller.js`
- Modify: `src/display/display-runtime.js`
- Modify: `src/legacy/runtime.js`
- Create: `tests/integration/received-display-lifecycle.test.js`

- [x] **Step 1: Write failing lifecycle regressions**

Create `tests/integration/received-display-lifecycle.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {createHarness} = require("../helpers/createReceivedDisplayHarness");

function snapshot(messageId, channelId, content = `${messageId} original`) {
	return {messageId, channelId, generation: 1, sourceSignature: `${channelId}:${messageId}:${content}`, source: {content, embeds: []}};
}

function result(messageId, channelId, content = `${messageId} translated`, generation = 1, origin = "automatic") {
	return {messageId, channelId, generation, origin, status: "translated", translation: {content}};
}

test("disabling a channel restores visible originals without hover", async () => {
	const harness = createHarness();
	try {
		const {plugin, calls} = harness;
		delete plugin.isTranslationEnabled;
		plugin.setChannelEnablementStateValue("channel-a", true);
		plugin.setChannelEnablementStateValue("channel-b", true);
		for (const [messageId, channelId] of [["message-1", "channel-a"], ["message-2", "channel-a"], ["message-3", "channel-b"]]) {
			plugin.captureReceivedMessageSource(snapshot(messageId, channelId));
			await plugin.commitReceivedDisplayResult(result(messageId, channelId));
		}
		const updatesBeforeDisable = calls.forceUpdate;

		await plugin.toggleTranslation("channel-a");

		assert.equal(plugin.getReceivedDisplayView("message-1").content, "message-1 original");
		assert.equal(plugin.getReceivedDisplayView("message-2").content, "message-2 original");
		assert.equal(plugin.getReceivedDisplayView("message-3").content, "message-3 translated");
		assert.equal(calls.forceUpdate, updatesBeforeDisable + 1);
	}
	finally {harness.restore();}
});

test("disable restoration removes text and decoration under the same revision", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(snapshot("message-1", "channel-a"));
		await plugin.commitReceivedDisplayResult(result("message-1", "channel-a"));
		await plugin.restoreReceivedDisplayChannel("channel-a");
		const view = plugin.getReceivedDisplayView("message-1");
		const stream = {content: {id: "message-1", channel_id: "channel-a", content: "message-1 translated", embeds: []}};
		const event = {instance: {props: {message: stream.content}}, returnvalue: {props: {children: [], className: "translator-translated-message", style: {"--translator-text-color": "#fff", "--translator-accent-color": "#fff"}}}};

		plugin.applyReceivedDisplayViewToStream(stream, view);
		plugin.applyReceivedDisplayViewToContent(event, view);

		assert.equal(stream.content.content, "message-1 original");
		assert.equal(event.returnvalue.props["data-translator-revision"], String(view.revision));
		assert.doesNotMatch(event.returnvalue.props.className, /translator-translated-message/);
		assert.equal(event.returnvalue.props.style["--translator-text-color"], undefined);
		assert.equal(event.returnvalue.props.style["--translator-accent-color"], undefined);
		assert.equal(event.returnvalue.props.children.some(child => child && child.key === "translator-translated-watermark"), false);
	}
	finally {harness.restore();}
});

test("plugin stop restores automatic records before requesting the final rerender", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(snapshot("message-1", "channel-a"));
		await plugin.commitReceivedDisplayResult(result("message-1", "channel-a"));
		const order = [];
		const restoreAll = plugin.restoreAllReceivedDisplay.bind(plugin);
		plugin.restoreAllReceivedDisplay = options => {order.push("restore"); return restoreAll(options);};
		plugin._testBdfdb.MessageUtils.rerenderAll = instant => {order.push(`rerender:${instant}`);};
		plugin.cancelHistoricalTranslationJobs = () => {};
		plugin.clearChannelTitleTranslations = () => {};
		plugin.detachAutoTranslationInputActivityWatcher = () => {};
		plugin.detachAutoTranslationScrollWatcher = () => {};
		plugin.clearDisplayedTranslations = () => {order.push("legacy-clear");};
		plugin.clearLoadedAutoTranslationStatus = () => {};
		plugin.forceUpdateAll = () => {throw new Error("onStop must not reload settings while restoring display");};

		plugin.onStop();

		assert.deepEqual(order.slice(0, 3), ["restore", "legacy-clear", "rerender:true"]);
	}
	finally {harness.restore();}
});

test("a late provider callback cannot recreate a restored automatic record", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(snapshot("message-1", "channel-a"));
		plugin.setReceivedDisplayGeneration("channel-a", 2);
		await plugin.restoreReceivedDisplayChannel("channel-a");

		const outcome = await plugin.commitReceivedDisplayResult(result("message-1", "channel-a", "late translation", 1));

		assert.deepEqual(outcome.rejectedIds, ["message-1"]);
		assert.equal(plugin.getReceivedDisplayView("message-1").content, "message-1 original");
	}
	finally {harness.restore();}
});

test("plugin start replaces the stopped display runtime", async () => {
	const harness = createHarness();
	try {
		const {plugin} = harness;
		plugin.captureReceivedMessageSource(snapshot("message-1", "channel-a"));
		await plugin.commitReceivedDisplayResult(result("message-1", "channel-a"));
		let resetCount = 0;
		const reset = plugin.resetReceivedDisplayRuntime.bind(plugin);
		plugin.resetReceivedDisplayRuntime = () => {resetCount++; return reset();};
		plugin._testBdfdb.PatchUtils.patch = () => {};
		plugin._testBdfdb.LibraryModules = {MessageUtils: {}, MessageToolbarUtils: {}};
		plugin.attachAutoTranslationInputActivityWatcher = () => {};
		plugin.forceUpdateAll = () => {};

		plugin.onStart();

		assert.equal(resetCount, 1);
		assert.equal(plugin.getReceivedDisplayView("message-1"), null);
	}
	finally {harness.restore();}
});
```

- [x] **Step 2: Verify the tests fail**

```powershell
npm run build
node --test tests/integration/received-display-lifecycle.test.js
```

Expected: FAIL on the current clear-then-rerender lifecycle.

- [x] **Step 3: Make restoration a controller transaction**

When disabling, `toggleTranslation(channelId)` becomes async and executes in this order:

```text
increment the channel generation and update MessageStateStore
persist the channel as disabled
cancel channel requests and jobs
await controller.restoreChannel(channelId)
clear reply/embed/title compatibility state
resume unrelated queue work
```

Do not delete immutable source snapshots during channel disable.

`onStop()` remains synchronous. It first calls `restoreAllReceivedDisplay({refresh: false})`, which changes store state synchronously, then clears legacy display records, and finally calls `BDFDB.MessageUtils.rerenderAll(true)`. It must not call `forceUpdateAll()`, because that method reloads settings and queues during shutdown. Late callbacks check the incremented generation and cannot commit.

`onStart()` creates a fresh display runtime before accepting new work. It does not reuse the stopped runtime, so a reload cannot expose stale translated state from the previous plugin instance.

- [x] **Step 4: Run focused and full verification**

```powershell
npm run build
node --test tests/integration/received-display-lifecycle.test.js tests/channel-enablement-regression.test.js tests/translation-regression.test.js
npm run verify
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add src DiscordAITranslator.plugin.js tests
git commit -m "fix: restore received originals through display transactions"
```

**Verification evidence (2026-07-26):** `adcfa60`; red phase observed 4/6 lifecycle failures on the clear-then-rerender lifecycle (the two passing tests exercised Task 5 machinery only); focused lifecycle plus channel-enablement and translation regressions `83/83`; full `npm run verify` `268/268`. Adjustments against the plan baseline: `toggleTranslation` performs the legacy clears synchronously before awaiting the restore transaction because existing regressions assert cleared state immediately after an un-awaited call; the disable path increments the store channel generation only when the store already tracks the channel; the harness scroller stubs `addEventListener`/`getBoundingClientRect` and the harness document stubs `getElementById` so the immediate rerender path runs under tests.

## Task 7: Make Historical And Live Display Commits Explicit

**Files:**
- Modify: `src/legacy/runtime.js`
- Modify: `tests/historical-translation-job.test.js`
- Modify: `tests/translation-regression.test.js`

- [x] **Step 1: Add failing commit-count tests**

Historical test:

```js
test("one historical job performs one acknowledged display commit", async () => {
	const plugin = configureHistoricalCoordinatorPlugin();
	const commits = [];
	plugin.isHistoricalTranslationJobItemCurrent = () => true;
	plugin.commitHistoricalReceivedDisplayBatch = async results => {
		commits.push(results);
		return {confirmedIds: results.map(result => result.messageId), missingIds: [], fallbackUsed: false};
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("historical automatic results must not write the legacy display map");};
	const messages = [createMessage("100", "first"), createMessage("200", "second"), createMessage("300", "third")];
	const summary = {
		translated: messages.map(message => ({message, originalContentData: {content: message.content, embeds: []}, translation: {channelId: message.channel_id, auto: true, content: `${message.content} translated`, translatedContent: `${message.content} translated`, signature: `sig-${message.id}`}})),
		skipped: [],
		failed: []
	};
	const job = {channelId: "channel-history-job", generation: 1, items: new Map(messages.map(message => [message.id, {message}]))};

	await plugin.commitHistoricalTranslationJob(summary, job);

	assert.equal(commits.length, 1);
	assert.deepEqual(commits[0].map(result => result.messageId), ["100", "200", "300"]);
	assert.equal(commits[0].every(result => result.status === "translated" && result.generation === 1), true);
});
```

Live test:

```js
test("one live result performs one ID-scoped display commit", async () => {
	const plugin = createPluginInstance({callSetLanguages: false});
	const channel = {id: "channel-live-commit"};
	const message = createMessage("live-1", "live source");
	message.channel_id = channel.id;
	const commits = [];
	plugin.captureReceivedMessageSource({messageId: message.id, channelId: channel.id, generation: 1, sourceSignature: "live-signature", source: {content: message.content, embeds: []}});
	plugin.shouldSkipReceivedTranslationBeforeRequest = () => false;
	plugin.getCachedReceivedTranslation = () => ({channelId: channel.id, auto: true, content: "live translated", translatedContent: "live translated", originalContent: message.content, signature: "live-signature", embeds: {}});
	plugin.commitReceivedDisplayResult = async result => {
		commits.push(result);
		return {confirmedIds: [result.messageId], missingIds: [], fallbackUsed: false};
	};
	plugin.applyStoredTranslationToMessage = () => {throw new Error("live automatic results must not write the legacy display map");};
	plugin.scheduleTranslationRerender = () => {throw new Error("live display commits must not use the generic timer");};

	const handled = await plugin.translateMessage(message, channel, {auto: true, silent: true, trackBusy: false});

	assert.equal(handled, true);
	assert.equal(commits.length, 1);
	assert.equal(commits[0].messageId, "live-1");
	assert.equal(commits[0].status, "translated");
});
```

- [x] **Step 2: Verify both tests fail at the compatibility rerender path**

```powershell
npm run build
node --test --test-name-pattern "acknowledged display commit|ID-scoped display commit" tests/historical-translation-job.test.js tests/translation-regression.test.js
```

- [x] **Step 3: Replace generic rerender scheduling for received completions**

Historical jobs convert translated, skipped, and failed terminal items to one result array and call only:

```js
await this.commitHistoricalReceivedDisplayBatch(results);
```

Live received results call only:

```js
await this.commitReceivedDisplayResult(result);
```

Generic `scheduleTranslationRerender` remains temporarily for settings, manual translation, reply, embed, and title compatibility paths. It must no longer repaint automatic received message completions.

- [x] **Step 4: Run focused, full, and build checks**

```powershell
npm run build
node --test tests/historical-translation-job.test.js tests/translation-regression.test.js tests/display/*.test.js tests/integration/*.test.js
npm run verify
```

Expected: PASS.

- [x] **Step 5: Commit**

```powershell
git add src DiscordAITranslator.plugin.js tests
git commit -m "refactor: commit received translations by message id"
```

**Verification evidence (2026-07-26):** `179552a`; red phase observed 3/3 new contract tests failing on the legacy commit path; full `npm run verify` `279/279`. The flip covers all six automatic legacy-write call sites (live, cached in checkMessage/queue/loaded-content, historical batch); manual translation keeps the legacy path. Extensions beyond the plan baseline, each driven by an adversarial review of the diff before commit: the store gained `releasePending` (a live request that ends without a terminal commit returns its record to idle, so stale request identities cannot poison later commits) and `restoreMessage` (manual untranslate of a store-owned automatic translation); the display view now exposes `generation`, `sourceSignature`, and `requestIdentity` so historical batch results echo each record's active identity instead of rejecting the batch; `commitHistoricalTranslationJob` guards batch-commit rejections and reports `displayed: 0` when the batch did not commit; terminal skip/fail live commits use `{refresh: false}` to preserve legacy repaint semantics and avoid refresh-requeue loops; `resolveLoadedMessageContentTranslation` gates on store-translated/pending views to prevent endless requeues; source edits are detected through same-generation signature changes at capture time (replacing the `oldMessages`-based detection automatic results no longer feed); `processEmbed` and the translated-label checks fall back to store views. Known accepted consequences: the live auto queue serializes behind acknowledged display transactions (it pauses while the window is hidden and rAF is throttled, resuming on focus), and loaded-scope messages rendered outside a captured channel stream (for example search results) queue provider work whose store commit is rejected; both are recorded for the orchestrator milestone.

## Task 8: Add Per-Message Reasons And A Local Transition Journal

**Files:**
- Create: `src/diagnostics/display-transition-journal.js`
- Modify: `src/display/message-state-store.js`
- Modify: `src/display/translation-display-controller.js`
- Modify: `src/display/display-runtime.js`
- Create: `tests/display/display-transition-journal.test.js`
- Modify: `tests/build-contract.test.js`

- [x] **Step 1: Write failing reason and journal tests**

Create `tests/display/display-transition-journal.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageStateStore} = require("../../src/display/message-state-store");
const {createDisplayView} = require("../../src/display/translation-display-controller");
const {createDisplayTransitionJournal} = require("../../src/diagnostics/display-transition-journal");

function capture(store, messageId) {
	store.captureSource({messageId, channelId: "c1", generation: 1, sourceSignature: messageId, source: {content: `${messageId} source`, embeds: []}});
}

test("pending skipped failed and render-unconfirmed records expose stable reason codes", () => {
	const store = createMessageStateStore();
	for (const messageId of ["pending", "skipped", "failed", "unconfirmed"]) capture(store, messageId);
	store.markPending({messageId: "pending", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-1"});
	store.commitResult({messageId: "skipped", channelId: "c1", generation: 1, origin: "automatic", status: "skipped", reason: "same-language"});
	store.commitResult({messageId: "failed", channelId: "c1", generation: 1, origin: "automatic", status: "failed", reason: "provider-timeout"});
	store.commitResult({messageId: "unconfirmed", channelId: "c1", generation: 1, origin: "automatic", status: "translated", translation: {content: "translated"}});
	store.markRenderOutcome({confirmedIds: [], missingIds: ["unconfirmed"]});

	assert.equal(createDisplayView(store.getDisplayState("pending")).showLoading, true);
	assert.equal(createDisplayView(store.getDisplayState("skipped")).reason, "same-language");
	assert.equal(createDisplayView(store.getDisplayState("failed")).reason, "provider-timeout");
	assert.equal(createDisplayView(store.getDisplayState("unconfirmed")).renderReason, "render-unconfirmed");
});

test("the debug journal is bounded and keyed by channel and message", () => {
	const journal = createDisplayTransitionJournal({enabled: true, limit: 2, now: () => 123});
	journal.append({channelId: "c1", messageId: "m1", transition: "captured"});
	journal.append({channelId: "c1", messageId: "m2", transition: "pending"});
	journal.append({channelId: "c2", messageId: "m3", transition: "state-committed"});

	assert.deepEqual(journal.list().map(entry => entry.messageId), ["m2", "m3"]);
	assert.deepEqual(journal.list({channelId: "c1"}).map(entry => entry.messageId), ["m2"]);
	assert.deepEqual(journal.list({messageId: "m3"})[0], {channelId: "c2", messageId: "m3", transition: "state-committed", timestamp: 123});
});

test("the release bundle removes the debug journal implementation", async () => {
	const {createPluginBundle} = await import("../../scripts/build-plugin.mjs");
	const releaseBundle = await createPluginBundle({debug: false});
	const debugBundle = await createPluginBundle({debug: true});

	assert.doesNotMatch(releaseBundle, /TRANSLATOR_DISPLAY_DEBUG_JOURNAL/);
	assert.match(debugBundle, /TRANSLATOR_DISPLAY_DEBUG_JOURNAL/);
});
```

- [x] **Step 2: Verify the tests fail**

```powershell
node --test tests/display/display-transition-journal.test.js tests/build-contract.test.js
```

- [x] **Step 3: Implement the bounded journal**

The module interface is:

```js
const DISPLAY_JOURNAL_MARKER = "TRANSLATOR_DISPLAY_DEBUG_JOURNAL";

function createDisplayTransitionJournal({enabled = false, limit = 500, now = Date.now} = {}) {
	const entries = [];
	return Object.freeze({
		append(entry) {
			if (!enabled) return;
			entries.push(Object.freeze({...entry, timestamp: entry.timestamp || now()}));
			if (entries.length > limit) entries.splice(0, entries.length - limit);
		},
		list({channelId, messageId} = {}) {
			return entries.filter(entry => (!channelId || entry.channelId === channelId) && (!messageId || entry.messageId === messageId));
		},
		clear() {entries.length = 0;},
		marker: DISPLAY_JOURNAL_MARKER
	});
}

module.exports = {createDisplayTransitionJournal};
```

Record these transitions:

```text
captured
pending
state-committed
render-requested
render-confirmed
render-unconfirmed
skipped
failed
cancelled
restored
```

Task 8 changes `createMessageStateStore` and `createTranslationDisplayController` to accept an optional `journal` dependency. Store transitions append after the immutable state update; render transitions append immediately before and after `refreshMessages`. Each entry includes `channelId`, `messageId`, `revision`, and `transition`. Provider timing remains a later orchestrator milestone and is not fabricated inside the display layer.

- [x] **Step 4: Wire the existing debug and release build modes**

In `src/display/display-runtime.js`, create the journal only behind the compile-time constant:

```js
const debugEnabled = typeof __TRANSLATOR_DISPLAY_DEBUG__ !== "undefined" && __TRANSLATOR_DISPLAY_DEBUG__;
const journal = debugEnabled ? require("../diagnostics/display-transition-journal").createDisplayTransitionJournal({enabled: true}) : null;
const store = createMessageStateStore({journal});
const controller = createTranslationDisplayController({store, renderAdapter, journal});
```

Normal `npm run build` defines the constant as `false`; `npm run build:debug` defines it as `true`. Release verification compares only the non-debug artifact, and `DiscordAITranslator.debug.plugin.js` remains ignored and uncommitted.

- [x] **Step 5: Run verification and commit**

```powershell
npm run build
npm run verify
git add src scripts package.json DiscordAITranslator.plugin.js tests
git commit -m "feat: add received display diagnostics"
```

**Verification evidence (2026-07-26):** `bd908bd`; red phase reproduced `MODULE_NOT_FOUND` for the journal module; focused journal tests `5/5` (bounded buffer, reason codes, injected store/controller transitions, release-bundle exclusion, debug-bundle inclusion); full `npm run verify` `284/284`. Additions beyond the plan baseline: the store also records `translating` and `released` transitions (the latter for the post-plan `releasePending` operation), and the display runtime exposes `getTransitionJournal()` so the debug build can be inspected from the console.

## Task 9: Remove The Replaced Received Display Path

**Files:**
- Modify: `src/legacy/runtime.js`
- Modify: `tests/translation-regression.test.js`
- Modify: `tests/typing-during-translation-regression.test.js`
- Modify: `tests/helpers/createPluginInstance.js`
- Create: `tests/received-display-ownership.test.js`
- Modify: `tests/build-contract.test.js`

- [x] **Step 1: Add an absence test for replaced runtime symbols**

Create `tests/received-display-ownership.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");

function methodSlice(name, nextName) {
	const start = source.indexOf(`\n\t\t\t${name} (`);
	const end = source.indexOf(`\n\t\t\t${nextName} (`, start + 1);
	assert.notEqual(start, -1, `${name} method not found`);
	assert.notEqual(end, -1, `${nextName} method not found after ${name}`);
	return source.slice(start, end);
}

test("replaced received display methods do not write legacy display ownership", () => {
	const automaticCommitMethods = [
		methodSlice("commitReceivedDisplayResult", "commitHistoricalReceivedDisplayBatch"),
		methodSlice("commitHistoricalReceivedDisplayBatch", "getReceivedDisplayView"),
		methodSlice("commitHistoricalTranslationJob", "rerenderHistoricalTranslationJob")
	];
	for (const method of automaticCommitMethods) {
		assert.doesNotMatch(method, /translatedMessages|oldMessages|applyStoredTranslationToMessage|scheduleTranslationRerender|PatchUtils\.forceAllUpdates/);
	}
});

test("the received display compatibility path delegates to the display runtime", () => {
	assert.match(methodSlice("commitReceivedDisplayResult", "commitHistoricalReceivedDisplayBatch"), /ensureReceivedDisplayRuntime\(\)\.commitMessageResult/);
	assert.match(methodSlice("commitHistoricalReceivedDisplayBatch", "getReceivedDisplayView"), /ensureReceivedDisplayRuntime\(\)\.commitHistoricalBatch/);
});
```

The source contract deliberately inspects only automatic received-display methods. Manual translation, sent-edit compatibility, reply previews, and embeds may still use `translatedMessages` or `oldMessages` until their own milestone.

- [x] **Step 2: Run the absence test and verify it fails**

```powershell
node --test tests/received-display-ownership.test.js
```

- [x] **Step 3: Delete replaced branches and compatibility methods**

Run both audits before editing:

```powershell
rg -n "translatedMessages|oldMessages" src/legacy/runtime.js
rg -n "scheduleTranslationRerender|PatchUtils\.forceAllUpdates" src/legacy/runtime.js
```

Delete automatic received writes and automatic original snapshots already replaced by the state store. Keep accesses required by manual message translation, sent editing, reply previews, and embeds. Keep `scheduleTranslationRerender` only for those compatibility paths plus settings and titles.

Remove the test that asserts name-based `PatchUtils.forceAllUpdates` is the correct visible refresh. Replace it with adapter acknowledgement tests.

- [x] **Step 4: Verify module and artifact guardrails**

Add a first-milestone growth guard to `tests/build-contract.test.js`:

```js
const pluginPath = path.join(root, "DiscordAITranslator.plugin.js");
const pluginBytes = fs.statSync(pluginPath).size;
assert.ok(pluginBytes <= 700 * 1024, `generated plugin unexpectedly exceeds 700 KB: ${pluginBytes} bytes`);
```

The approved 350-450 KB target remains a final migration gate after all legacy modules are replaced. This first milestone must not remove behavior merely to reach that final target.

- [x] **Step 5: Run full verification and commit**

```powershell
npm run build
npm run verify
git diff --check
git add src DiscordAITranslator.plugin.js tests
git commit -m "refactor: remove legacy received display ownership"
```

**Verification evidence (2026-07-26):** `345e406`; full `npm run verify` `288/288`; `git diff --check` clean; generated artifact `708180` bytes, inside the 700 KB first-milestone guard now enforced by `tests/build-contract.test.js`. Sequencing note: because Task 7 already severed every automatic legacy write, the ownership absence tests passed green on first run instead of the red phase the plan predicted — the red phase for this contract was observed in Task 7 (`179552a`). The `translatedMessages`/`oldMessages` audit confirmed every remaining access serves manual message translation, sent editing, reply previews, embeds, or titles, which this milestone explicitly keeps; `applyStoredTranslationToMessage` remains the single legacy writer with manual-only callers, so no additional deletions were required. The methodSlice contract tolerates `async` methods and object-literal method shorthand; the old `forceAllUpdates` refresh test was rescoped to the retained legacy manual-path helper instead of deleted, and adapter acknowledgement tests (Task 4 plus the integration suites) cover the received refresh contract.

## Task 10: Review, Deploy, And Complete The Display Milestone

**Files:**
- Modify only if review finds a tested defect
- Update: `docs/recovery-plan.md` after evidence exists

- [x] **Step 1: Run the complete verification gate**

```powershell
npm run build
npm run verify
git diff --check
git status --short
```

Expected: zero failures, clean diff check, and only intended milestone changes.

- [x] **Step 2: Run Standards and Spec reviews against the milestone base commit**

The Standards review uses `AGENTS.md`, `docs/architecture.md`, and ADR-0002. The Spec review uses `docs/product.md`, `docs/settings.md`, and the current plan. Resolve every P0-P2 finding with a failing test before proceeding.

- [x] **Step 3: Create a milestone commit if review fixes were required**

```powershell
git add src scripts tests package.json package-lock.json DiscordAITranslator.plugin.js docs/recovery-plan.md
git commit -m "fix: address display milestone review"
```

**Verification evidence (2026-07-26):** `5a1fe17`; Standards and Spec reviews ran against `92406ca..HEAD`. One P1 and two P2 findings were each resolved with an observed failing test first: (P1) a disabled channel's repaint recaptured cancelled records with the bumped generation, replacing them mid-transaction so the restore could never confirm and always fell back to the full-list rerender — capture now skips disabled channels; (P2) store-owned translations froze the Display composition (inline original and related settings) at commit time — the compatibility appliers now compose the painted content at render time from the stored translation facts; (P2) a result for a never-captured message (for example queued from a pins or search surface) poisoned the whole historical batch through the all-or-nothing commit — `commitBatch` now rejects unrecorded results individually while keeping atomicity over recorded ones, and the controller surfaces partial `rejectedIds`. Accepted P3 remainders: the live queue's rAF pause while the window is hidden (documented in Task 7 evidence), and the pre-existing dead duplicate `icon` key was removed, making the deterministic build warning-free. Final gate after fixes: `npm run verify` `292/292`; `git diff --check` clean.

- [x] **Step 4: Back up and deploy the generated plugin** — deployed 2026-07-26 17:56 with DiscordPTB running (hot reload triggered); installed SHA-256 `4D0D1C0F0E3938865C5179B9FE878820AFFE1D1EFBFA5EBE2A1CAF997D280821` matches the repository artifact; previous version backed up to `plugin-backups\DiscordAITranslator\DiscordAITranslator-20260726-175610.plugin.js` (SHA-256 `E3A5C624F6118442E14C42A98F4FC0C0DE7886717238C1206F38B839956BE246`).

Run from the repository root:

```powershell
$repositoryPlugin = (Resolve-Path '.\DiscordAITranslator.plugin.js').Path
$installedPlugin = Join-Path $env:APPDATA 'BetterDiscord\plugins\DiscordAITranslator.plugin.js'
$backupDirectory = Join-Path $env:APPDATA 'BetterDiscord\plugin-backups\DiscordAITranslator'
if (-not (Test-Path -LiteralPath $installedPlugin)) { throw "Installed BetterDiscord plugin not found: $installedPlugin" }
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPlugin = Join-Path $backupDirectory "DiscordAITranslator-$timestamp.plugin.js"
$installedBeforeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installedPlugin).Hash
Copy-Item -LiteralPath $installedPlugin -Destination $backupPlugin
Copy-Item -LiteralPath $repositoryPlugin -Destination $installedPlugin -Force
$repositoryHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $repositoryPlugin).Hash
$installedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installedPlugin).Hash
$backupHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backupPlugin).Hash
if ($repositoryHash -ne $installedHash) { throw "Installed plugin hash does not match the repository artifact" }
if ($installedBeforeHash -ne $backupHash) { throw "Backup hash does not match the previously installed plugin" }
[pscustomobject]@{Repository=$repositoryHash; Installed=$installedHash; Backup=$backupHash; BackupPath=$backupPlugin}
```

- [ ] **Step 5: Inspect the renderer log after hot reload** — this BetterDiscord install writes no renderer log file to disk; inspect the DevTools console (Ctrl+Shift+I) in the running client as part of the manual pass.

Confirm the plugin stop event is followed by its start event after the file copy. No new `SyntaxError`, `TypeError`, `ReferenceError`, unhandled rejection, or `DiscordAITranslator` error may appear.

- [ ] **Step 6: Run the DiscordPTB smoke gate**

Verify in this order:

1. Enable automatic translation in one channel.
2. Confirm translated text and watermark appear without hovering.
3. Confirm one loaded historical batch appears together.
4. Scroll and type while a translation finishes; neither position nor input changes unexpectedly.
5. Disable the channel and confirm original messages return immediately.
6. Confirm another channel is unchanged.
7. Stop and reload the plugin and confirm originals and state remain coherent.
8. Inspect any missing item through the debug build and confirm a pending, skipped, failed, cancelled, or render-unconfirmed reason.

- [ ] **Step 7: Mark only observed checks complete**

Update this document with exact automated counts, deployed hash, commit, and observed smoke evidence. Leave every unobserved checkbox unchecked.

- [ ] **Step 8: Commit milestone evidence**

```powershell
git add docs/recovery-plan.md
git commit -m "docs: record display milestone verification"
```

## Display Milestone Evidence

- Base commit: `92406ca`
- Implementation commits: `7ffad07`, `640e01b`, `adcfa60`, `179552a`, `bd908bd`, `345e406`, `5a1fe17`
- Automated verification: `npm run verify` `292/292` at `5a1fe17`; `git diff --check` clean; deterministic build warning-free
- Generated artifact bytes: `711035` (700 KB guard enforced by `tests/build-contract.test.js`)
- Repository artifact SHA-256: `4d0d1c0f0e3938865c5179b9fe878820affe1d1efbfa5ebe2a1caf997d280821`
- Deployed SHA-256: `422E76152EEE14FAA38F90B130A4C0CB4CCF6EFF02ECCC8EE04FD83F782F0BDC` (2026-07-26 18:27, `443a54a`; backups `-175610` and `-182726` retained)
- DiscordPTB smoke gate: first operator pass FAILED and the defect is fixed — the loaded-history capsule stalled at `0/N` with N growing while the client janked, because per-commit scroll restores fired scroll events that kept extending the user-scroll idle window, starving the snapshot seal; reproduced in `tests/integration/received-display-throughput.test.js`, fixed in `443a54a` (programmatic-scroll grace window plus coalesced live display flushes), redeployed. The eight observation checks now need a fresh operator pass.
- Bounded display-state follow-up (2026-07-29): channel-session exit now prunes recoverable automatic, idle, and settled preview records while retaining in-flight work, manual translations, suppression, cancelled restore state, and source archives. Focused red/green coverage proves channel indexes and generations are released when empty and that revisiting a pruned channel restores from the bounded persistent cache without another provider request. The DiscordPTB smoke gate above remains required before marking the display milestone fully observed.

## Later Milestones — RETIRED, superseded by `docs/extraction-plan.md`

The original list cut milestones by feature and by layer and scheduled legacy removal last:

1. Reply, embed, thread-title, edit, and sent-original lifecycle ownership
2. Translation orchestrator and live/historical queue extraction
3. Shared provider client and provider adapter extraction
4. Received, sent, language detection, prompt, protection, and validation policy extraction
5. Versioned settings, credentials, channel settings, cache, and migration stores
6. Remaining legacy removal, test consolidation, size enforcement, and canonical documentation update

That ordering was retired after measurement showed it could not shrink the legacy runtime.
Task 9 of this plan — "remove the replaced received display path" — deleted zero production
lines because `translatedMessages` is read by six unrelated features, so a display-scoped
milestone can never drive its reader count to zero. The same argument applies to every row
above. The four commits after this milestone added 394 lines to `src/legacy/runtime.js` and 5
to `src/display`, because state that lives in the plugin factory closure is free to read from
anywhere while modules must be hand-injected.

The replacement cuts by state ownership and deletes the owned state in the same commit, with a
ratchet (`tests/architecture-budget.test.js`) that fails the suite whenever `runtime.js` or its
module-level var count grows. See `docs/extraction-plan.md`.

The display milestone recorded above stands as completed history; its outstanding debt is
listed in the replacement plan and paid in that plan's M0.
