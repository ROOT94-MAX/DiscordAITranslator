const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtimePath = path.join(root, "src", "legacy", "runtime.js");

// A ratchet, not a ceiling. These numbers may only ever be LOWERED. Raising one
// means a change grew the legacy runtime, which is the exact failure the previous
// plan hid: code kept moving into runtime.js while the plan claimed extraction.
// The size backstop that used to live in build-contract.test.js was raised the
// moment it was breached, which made it worthless; do not repeat that here.
const BUDGET = Object.freeze({
	// +3 (2026-08-19): preview-wave coalescer wiring (managed timer + repaint gate).
	// +34 (2026-08-19): debug-only wiring, all stripped from release builds - the
	// MESSAGE_UPDATE probe (strategy ladder), the one-shot merge-semantics
	// experiment, and the forwarded-message shape probe. Not retained legacy.
	// +5 (2026-08-19): flux per-row repaint handles (dispatcher, message record,
	// guild) into the display runtime - the Store-targeted repaint wiring.
	// +8 (2026-08-19): forwarded-message extraction reads the forward snapshot body
	// so 已转发 messages stop being skipped as contentless.
	// +2 (2026-08-19): getStreamBodyContent/paintStreamBody delegations - the
	// forward-aware body accessors the legacy stream writes route through.
	// -24 (2026-08-20): content-view projection moved into the display module;
	// the runtime keeps one delegation instead of owning the forwarded-parent branch.
	// -12 (2026-08-20): removed the dead direct-original React block factory.
	// -1 (2026-08-20): removed atomic-rebuild-only BDFDB handle wiring.
	// -2 (2026-08-20): direct Store deletion subscriptions replaced the legacy
	// global dispatch patch while sharing the active Store dispatcher resolver.
	// -28 (2026-08-20): plugin/BDFDB settings persistence wiring moved into
	// settings-store-wiring.js; runtime retains only the lazy singleton boundary.
	// -17 (2026-08-20): translation-cache persistence, timer and policy wiring moved
	// into translation-cache-wiring.js; runtime retains only the lazy singleton.
	// -16 (2026-08-20): provider request, timer, credential and UI callback wiring
	// moved into provider-client-wiring.js; runtime retains only the lazy singleton.
	// -11 (2026-08-20): viewport document, selector, timer, animation-frame and
	// historical-idle callback wiring moved into message-viewport-wiring.js.
	// -3 (2026-08-21): historical quiet-window timer, scrolling, queue-identity and
	// finish callback wiring moved into historical-snapshot-cadence-wiring.js.
	// -10 (2026-08-21): Store deletion dispatcher plus live/history/cache/display
	// cleanup wiring moved into message-deletion-lifecycle-wiring.js.
	// -22 (2026-08-21): loaded-status Store, browser, positioning, lifecycle and
	// retry callback wiring moved into loaded-status-capsule-wiring.js.
	// -30 (2026-08-21): received-display Flux, Store, browser, timer, capsule and
	// viewport wiring moved into display-runtime-wiring.js.
	// -10 (2026-08-21): repaint render/outcome, Discord-state predicates,
	// lifecycle repaint and managed timers moved into repaint-scheduler-wiring.js.
	// -69 (2026-08-21): live queue policy, display/history handoff, channel-session
	// and managed retry timer wiring moved into live-translation-queue-wiring.js.
	// -12 (2026-08-21): the debug-only MESSAGE_UPDATE experiment's Store, DOM,
	// Composer and evidence-sink ports moved into its own wiring module.
	runtimeLines: 3248,
	moduleLevelVarDeclarators: 2
});

function readRuntimeLines() {
	return fs.readFileSync(runtimePath, "utf8").split("\n");
}

// Module-level state lives in the plugin factory closure, above the class, where
// every helper object and every one of the class methods can read and write it.
// That shared mutability is what makes extraction impossible: a module cannot move
// out while it still reaches into this closure. Counting declarators - not lines -
// keeps `var a = 1, b = 2;` honest.
function countModuleLevelVarDeclarators(lines) {
	const classLine = lines.findIndex(line => /return class Translator extends Plugin/.test(line));
	assert.notEqual(classLine, -1, "the plugin class declaration must be findable");
	let declarators = 0;
	for (let index = 0; index <= classLine; index++) {
		const line = lines[index];
		if (!/^\t\tvar /.test(line)) continue;
		const body = line.replace(/^\t\tvar /, "").replace(/;\s*(\/\/.*)?$/, "");
		declarators += body.split(",").filter(part => /^\s*[a-zA-Z_$]/.test(part)).length;
	}
	return declarators;
}

test("the legacy runtime only ever shrinks", () => {
	const lines = readRuntimeLines();
	assert.ok(
		lines.length <= BUDGET.runtimeLines,
		`src/legacy/runtime.js grew to ${lines.length} lines (budget ${BUDGET.runtimeLines}). ` +
		"Extraction work must remove more from legacy than it adds. If this change legitimately " +
		"moved code OUT, lower BUDGET.runtimeLines to the new count in the same commit."
	);
});

test("module-level shared state only ever shrinks", () => {
	const declarators = countModuleLevelVarDeclarators(readRuntimeLines());
	assert.ok(
		declarators <= BUDGET.moduleLevelVarDeclarators,
		`the plugin factory closure now declares ${declarators} module-level vars (budget ${BUDGET.moduleLevelVarDeclarators}). ` +
		"New shared mutable state is the coupling that blocks extraction; put the state inside the " +
		"module that owns it instead."
	);
});

test("extracted lifecycle responsibilities do not leave dead runtime forwarding methods", () => {
	const source = readRuntimeLines().join("\n");
	for (const methodName of [
		"isHistoricalMessageSourceGenerationCurrent",
		"clearReplyPreviewRenderMessage",
		"clearAutoTranslationScrollIntent",
		"markAutoTranslationScrollIntent",
		"scheduleAutoTranslationScrollIdleFinish",
		"scheduleAutoTranslationQueueRetry",
		"flushReceivedDisplayQueues"
	]) assert.doesNotMatch(source, new RegExp(`\\b${methodName}\\s*\\(`), `${methodName} has no production caller`);
});

test("plugin-specific settings persistence wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginSettingsStore/);
	assert.doesNotMatch(source, /\bcreateSettingsStore\b/);
	const ensureMethod = source.match(/\n\t\t\tensureSettingsStore \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy settings-store singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /BDFDB\.DataUtils|settings\.choices/, "persistence-key wiring belongs to settings-store-wiring.js");
});

test("plugin-specific translation cache wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginTranslationCacheStore/);
	assert.doesNotMatch(source, /\bcreateTranslationCacheStore\b/);
	const ensureMethod = source.match(/\n\t\t\tensureTranslationCacheStore \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy translation-cache singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /BDFDB\.DataUtils|BDFDB\.TimeUtils|["']translationCache["']/, "cache persistence and timer wiring belongs to translation-cache-wiring.js");
});

test("plugin-specific provider client wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginProviderClient/);
	assert.doesNotMatch(source, /\bcreateProviderClient\b/);
	const ensureMethod = source.match(/\n\t\t\tensureProviderClient \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy provider-client singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /BDFDB\.LibraryRequires|BDFDB\.TimeUtils|BDFDB\.NotificationUtils|ensureSettingsStore|setTimeout/, "provider transport and plugin callback wiring belongs to provider-client-wiring.js");
});

test("plugin-specific message viewport wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginMessageViewportStore/);
	assert.doesNotMatch(source, /\bcreateMessageViewportStore\b/);
	const ensureMethod = source.match(/\n\t\t\tensureMessageViewportStore \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy message-viewport singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /BDFDB\.TimeUtils|SelectedChannelStore|messagesscroller|requestAnimationFrame|finishHistoricalTranslationSnapshot/, "viewport host wiring belongs to message-viewport-wiring.js");
});

test("plugin-specific historical cadence wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginHistoricalSnapshotCadence/);
	assert.doesNotMatch(source, /\bcreateHistoricalSnapshotCadence\b/);
	const ensureLine = source.split("\n").find(line => /ensureHistoricalSnapshotCadence \(\)/.test(line));
	assert.ok(ensureLine, "the lazy historical-cadence singleton boundary remains explicit");
	assert.doesNotMatch(ensureLine, /BDFDB\.TimeUtils|isUserActivelyScrollingMessages|ensureHistoricalJobRegistry|finishHistoricalTranslationSnapshot/, "historical cadence host wiring belongs to historical-snapshot-cadence-wiring.js");
});

test("plugin-specific message deletion wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginMessageDeletionLifecycle/);
	assert.doesNotMatch(source, /\bcreateMessageDeletionLifecycle\b/);
	const ensureMethod = source.match(/\n\t\t\tensureMessageDeletionLifecycle \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy message-deletion singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /resolveStoreDispatcher|ensureLiveTranslationQueue|ensureHistoricalJobRegistry|clearCachedTranslation|ensureReceivedDisplayRuntime/, "deletion cleanup fan-out belongs to message-deletion-lifecycle-wiring.js");
});

test("plugin-specific loaded-status capsule wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginLoadedStatusCapsuleController/);
	assert.doesNotMatch(source, /\bcreateLoadedStatusCapsuleController\b/);
	const ensureMethod = source.match(/\n\t\t\tensureLoadedStatusCapsuleController \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy loaded-status capsule singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /SelectedChannelStore|isTranslationEnabled|getReceivedAutoTranslateScope|isChineseUiLanguage|isUserActivelyScrollingMessages|attachAutoTranslationScrollWatcher|retryFailedHistoricalTranslations/, "capsule host and plugin callback wiring belongs to loaded-status-capsule-wiring.js");
});

test("plugin-specific received display runtime wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginReceivedDisplayRuntime/);
	assert.doesNotMatch(source, /\bcreateDisplayRuntime\b/);
	const ensureMethod = source.match(/\n\t\t\tensureReceivedDisplayRuntime \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy received-display singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /BDFDB\.dotCN|MessageStore|ChannelStore|resolveStoreDispatcher|captureDisplayTransactionScrollState|restoreDisplayTransactionScrollState|requestAnimationFrame/, "display host, Flux and viewport wiring belongs to display-runtime-wiring.js");
});

test("plugin-specific display repaint scheduler wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginDisplayRepaintScheduler/);
	assert.doesNotMatch(source, /\bcreateDisplayRepaintScheduler\b/);
	const ensureMethod = source.match(/\n\t\t\tensureReceivedDisplayRepaintScheduler \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy display-repaint scheduler singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /ensureReceivedDisplayRuntime|canRepaintReceivedDisplayNow|isViewingMessageHistory|isTranslatorSettingsSurfaceOpen|isChannelTextAreaFocused|rerenderMessagesWithScrollPreserved|BDFDB\.TimeUtils/, "repaint policy host wiring belongs to repaint-scheduler-wiring.js");
});

test("plugin-specific live translation queue wiring stays out of the legacy runtime", () => {
	const source = readRuntimeLines().join("\n");
	assert.match(source, /createPluginLiveTranslationQueue/);
	assert.doesNotMatch(source, /\bcreateLiveTranslationQueue\b/);
	const ensureMethod = source.match(/\n\t\t\tensureLiveTranslationQueue \(\) \{[\s\S]*?\n\t\t\t\}/);
	assert.ok(ensureMethod, "the lazy live-translation queue singleton boundary remains explicit");
	assert.doesNotMatch(ensureMethod[0], /extractOriginalContentData|shouldAutoTranslateReceivedMessage|collectHistoricalTranslationMessage|resumeQueuedHistoricalTranslationJobs|prepareHistoricalAiBatchQueueItem|requestAiBatchTranslationDetailed|validateHistoricalTranslationJobResult|persistTranslationCacheEntry|translateMessage/, "live queue plugin/policy wiring belongs to live-translation-queue-wiring.js");
});

test("the recorded budget matches the current tree, so drift is visible", () => {
	const lines = readRuntimeLines();
	const declarators = countModuleLevelVarDeclarators(lines);
	// Passing the two assertions above while sitting far below the budget means the
	// budget was never lowered after an extraction. Keep them in lockstep.
	assert.equal(lines.length, BUDGET.runtimeLines, "lower BUDGET.runtimeLines to the current count after removing legacy code");
	assert.equal(declarators, BUDGET.moduleLevelVarDeclarators, "lower BUDGET.moduleLevelVarDeclarators after removing shared state");
});
