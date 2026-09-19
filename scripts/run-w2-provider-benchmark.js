#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {createReasoningRawKey} = require("../src/settings/reasoning-raw-value");
const {createProviderAttemptOwner} = require("../src/providers/provider-attempt-owner");
const {createAbortableProviderTransport} = require("../src/providers/abortable-provider-transport");
const {createProviderClient, syncCustomEngines} = require("../src/providers/provider-client");
const {createProviderLatencyStore} = require("../src/diagnostics/provider-latency-store");
const {createW2WireBenchmark, W2_DEFAULT_SAMPLES_PER_FIXTURE, W2B_ARM_KEYS} = require("../src/diagnostics/w2-wire-benchmark");
const {W2_ALL_FIXTURES} = require("../src/diagnostics/w2-wire-benchmark-fixtures");
const {W2_ALL_ARMS, sanitizeSegmentDiagnostics, sanitizeStructureDiagnostics} = require("../src/diagnostics/w2-wire-benchmark-store");

const HARNESS_SCHEMA_VERSION = "w2-provider-harness-1";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_ARM_KEYS = Object.freeze(["A", "Ba", "Bm"]);
const ARM_KEYS = W2B_ARM_KEYS;
const STORE_ARM_KEYS = W2_ALL_ARMS;
const FIXTURE_IDS = Object.freeze(W2_ALL_FIXTURES.map(row => row.id));

class HarnessError extends Error {
	constructor(code) {super(code); this.code = code;}
}

function sha256(value) {return crypto.createHash("sha256").update(value).digest("hex").toUpperCase();}
function hashFile(filePath) {return sha256(fs.readFileSync(filePath));}
function plainObject(value) {return !!value && typeof value === "object" && !Array.isArray(value);}
function fixedReason(value, fallback = "unknown") {
	const allowed = new Set(["confirmation-mismatch", "confirmation-required", "configuration", "capability-unverified", "abort-transport-unavailable", "reasoning-invalid", "reasoning-unsupported", "compile", "stale", "cancelled", "consecutive-failures", "integrity-changed", "read-only-write-attempt", "provider-failed", "provider", "network", "timeout", "malformed", "fixture-oracle", "protected-integrity", "body-budget", "attempt-budget", "wrong-language", "too-similar", "empty", "placeholder-mismatch", "marker-schema", "marker-order", "duplicate-marker", "unknown-marker", "missing-terminal-marker", "missing-marker", "item-count", "unexpected-root", "markdown-fence", "unsafe-structure", "candidate-failed", "passed", "not-ready", "running", "not-started", "auth", "not_found", "rate_limit", "server", "abort", "invalid", "invalid_request", "schema", "unknown"]);
	return allowed.has(String(value || "")) ? String(value) : fallback;
}

function defaultPaths() {
	const appData = String(process.env.APPDATA || "");
	// Tests and callers that pass explicit paths must work on Linux/macOS too.
	// Only the implicit BetterDiscord paths require Windows APPDATA.
	if (!appData) return {config: null, installed: null};
	const plugins = path.join(appData, "BetterDiscord", "plugins");
	return {
		config: path.join(plugins, "DiscordAITranslator.config.json"),
		installed: path.join(plugins, "DiscordAITranslator.plugin.js")
	};
}

function parseArguments(argv = []) {
	const defaults = defaultPaths(), options = {
		mode: null,
		configPath: defaults.config,
		installedPath: defaults.installed,
		outputPath: null,
		engineKey: null,
		confirmationToken: null,
		maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
		inputPricePerMillion: null,
		outputPricePerMillion: null,
		arms: DEFAULT_ARM_KEYS,
		fixtureIds: null,
		samplesPerFixture: W2_DEFAULT_SAMPLES_PER_FIXTURE
	};
	const take = (index, flag) => {
		if (index + 1 >= argv.length || String(argv[index + 1]).startsWith("--")) throw new HarnessError(`argument-${flag}`);
		return String(argv[index + 1]);
	};
	const list = (value, flag, allowed) => {
		const items = String(value).split(",").map(item => item.trim()).filter(Boolean);
		if (!items.length || items.some(item => !allowed.includes(item))) throw new HarnessError(`argument-${flag}`);
		return Object.freeze(allowed.filter(item => items.includes(item)));
	};
	for (let index = 0; index < argv.length; index++) {
		const flag = String(argv[index]);
		if (flag === "--preflight" || flag === "--run") {
			const mode = flag.slice(2);
			if (options.mode && options.mode !== mode) throw new HarnessError("argument-mode");
			options.mode = mode;
		}
		else if (flag === "--config") options.configPath = take(index++, "config");
		else if (flag === "--installed") options.installedPath = take(index++, "installed");
		else if (flag === "--output") options.outputPath = take(index++, "output");
		else if (flag === "--engine") options.engineKey = take(index++, "engine");
		else if (flag === "--confirm") options.confirmationToken = take(index++, "confirm");
		else if (flag === "--max-output-tokens") options.maxOutputTokens = Number(take(index++, "max-output-tokens"));
		else if (flag === "--input-price-per-million") options.inputPricePerMillion = Number(take(index++, "input-price-per-million"));
		else if (flag === "--output-price-per-million") options.outputPricePerMillion = Number(take(index++, "output-price-per-million"));
		else if (flag === "--arms") options.arms = list(take(index++, "arms"), "arms", ARM_KEYS);
		else if (flag === "--fixtures") options.fixtureIds = list(take(index++, "fixtures"), "fixtures", FIXTURE_IDS);
		else if (flag === "--samples-per-fixture") options.samplesPerFixture = Number(take(index++, "samples-per-fixture"));
		else throw new HarnessError("argument-unknown");
	}
	if (!options.mode) throw new HarnessError("argument-mode");
	if (options.mode === "run" && !options.confirmationToken) throw new HarnessError("argument-confirm");
	if (!options.configPath || !options.installedPath) throw new HarnessError("appdata-missing");
	if (!Number.isInteger(options.maxOutputTokens) || options.maxOutputTokens < 1 || options.maxOutputTokens > 65536) throw new HarnessError("argument-max-output-tokens");
	if (!Number.isInteger(options.samplesPerFixture) || options.samplesPerFixture < 1) throw new HarnessError("argument-samples-per-fixture");
	for (const field of ["inputPricePerMillion", "outputPricePerMillion"]) if (options[field] != null && (!Number.isFinite(options[field]) || options[field] < 0)) throw new HarnessError("argument-price");
	const repoRoot = path.resolve(__dirname, "..");
	options.configPath = path.resolve(options.configPath);
	options.installedPath = path.resolve(options.installedPath);
	options.outputPath = path.resolve(options.outputPath || path.join(repoRoot, "artifacts", options.mode === "preflight" ? "w2-provider-preflight.json" : "w2-provider-result.json"));
	const key = value => process.platform === "win32" ? value.toLowerCase() : value;
	if ([options.configPath, options.installedPath].map(key).includes(key(options.outputPath))) throw new HarnessError("output-target-protected");
	return Object.freeze(options);
}

function readConfiguration(configPath) {
	let encoded;
	try {encoded = fs.readFileSync(configPath);}
	catch {throw new HarnessError("config-read");}
	let parsed;
	try {parsed = JSON.parse(encoded.toString("utf8").replace(/^\uFEFF/, ""));}
	catch {throw new HarnessError("config-parse");}
	const all = plainObject(parsed && parsed.all) ? parsed.all : parsed;
	if (!plainObject(all) || !plainObject(all.authKeys) || !plainObject(all.engines)) throw new HarnessError("config-shape");
	return {all, sha256: sha256(encoded)};
}

function assertReadableFile(filePath, code) {
	try {if (!fs.statSync(filePath).isFile()) throw new Error("not-file");}
	catch {throw new HarnessError(code);}
}

function writeArtifact(filePath, value) {
	fs.mkdirSync(path.dirname(filePath), {recursive: true});
	if (fs.existsSync(filePath)) throw new HarnessError("output-exists");
	const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	try {
		fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: "utf8", flag: "wx"});
		fs.renameSync(temporary, filePath);
		const reopened = JSON.parse(fs.readFileSync(filePath, "utf8"));
		if (JSON.stringify(reopened) !== JSON.stringify(value)) throw new HarnessError("output-verify");
	}
	catch (error) {
		try {if (fs.existsSync(temporary)) fs.rmSync(temporary, {force: true});} catch {}
		throw error instanceof HarnessError ? error : new HarnessError("output-write");
	}
}

function sanitizePreview(preview) {
	return Object.freeze({
		ok: preview.ok === true,
		previewId: String(preview.previewId || ""),
		fixtureRevision: String(preview.fixtureRevision || ""),
		fixtureManifestSha256: String(preview.fixtureManifestSha256 || ""),
		extraFixtureRevision: String(preview.extraFixtureRevision || ""),
		extraFixtureManifestSha256: String(preview.extraFixtureManifestSha256 || ""),
		arms: Object.freeze((preview.arms || []).filter(arm => ARM_KEYS.includes(arm))),
		fixtureIds: Object.freeze((preview.fixtureIds || []).filter(id => FIXTURE_IDS.includes(id))),
		samplesPerFixture: Number(preview.samplesPerFixture) || 0,
		fixtureCount: Number(preview.fixtureCount) || 0,
		warmupRequests: Number(preview.warmupRequests) || 0,
		measuredRequests: Number(preview.measuredRequests) || 0,
		samplesPerArm: Number(preview.samplesPerArm) || 0,
		maxRequests: Number(preview.maxRequests) || 0,
		maxPhysicalRequests: Number(preview.maxPhysicalRequests) || 0,
		hardRequestCap: Number(preview.hardRequestCap) || 0,
		maxOutputTokensPerRequest: Number(preview.maxOutputTokensPerRequest) || 0,
		estimatedInputTokens: Number(preview.estimatedInputTokens) || 0,
		estimatedOutputTokens: preview.estimatedOutputTokens == null ? null : Number(preview.estimatedOutputTokens) || 0,
		hardOutputTokenCap: Number(preview.hardOutputTokenCap) || 0,
		estimatedTotalTokenCap: Number(preview.estimatedTotalTokenCap) || 0,
		inputPricePerMillion: preview.inputPricePerMillion == null ? null : Number(preview.inputPricePerMillion),
		outputPricePerMillion: preview.outputPricePerMillion == null ? null : Number(preview.outputPricePerMillion),
		maxCost: preview.maxCost == null ? null : Number(preview.maxCost),
		currency: preview.currency === "session-input" ? "session-input" : null,
		concurrency: Number(preview.concurrency) || 0,
		cacheBypass: preview.cacheBypass === true,
		syntheticOnly: preview.syntheticOnly === true,
		configDigest: /^w2c1:[0-9a-f]{20}$/.test(String(preview.configDigest || "")) ? String(preview.configDigest) : null
	});
}

function confirmationToken(preview, configSha256, installedSha256) {
	const binding = JSON.stringify({schemaVersion: HARNESS_SCHEMA_VERSION, preview, configSha256, installedSha256});
	return `w2h1:${crypto.createHash("sha256").update(binding).digest("hex").slice(0, 32)}`;
}

function tokensEqual(left, right) {
	const a = Buffer.from(String(left || "")), b = Buffer.from(String(right || ""));
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createReadOnlyRuntime(all, {fetchFunction, now = Date.now} = {}) {
	const authKeys = all.authKeys;
	syncCustomEngines(all.engines);
	let physicalRequestCount = 0, callbackRequestCount = 0, settingsWriteAttemptCount = 0, active = 0, activeHighWater = 0;
	const providerAttemptOwner = createProviderAttemptOwner();
	const guardedFetch = async (url, options) => {
		physicalRequestCount++;
		active++;
		activeHighWater = Math.max(activeHighWater, active);
		try {return await fetchFunction(url, options);}
		finally {active--;}
	};
	const streamTransport = createAbortableProviderTransport({fetchFunction: guardedFetch, attemptOwner: providerAttemptOwner, now});
	const blockedWrite = () => {settingsWriteAttemptCount++; throw new HarnessError("settings-write-blocked");};
	const providerClient = createProviderClient({
		request: (_url, _options, callback) => {callbackRequestCount++; callback(new Error("callback-transport-forbidden"), null, "");},
		now,
		getAuthKeys: () => authKeys,
		saveAuthKeys: blockedWrite,
		createReasoningRawKey,
		getReasoningModelPref: (engineKey, modelId) => authKeys[engineKey] && authKeys[engineKey].reasoningModels && authKeys[engineKey].reasoningModels[modelId] || null,
		setReasoningModelPref: blockedWrite,
		setReasoningModelCapability: blockedWrite,
		setReasoningModelTierState: blockedWrite,
		clearReasoningModelCapability: blockedWrite,
		setInterfaceDetection: blockedWrite,
		clearInterfaceDetection: blockedWrite,
		loadModelCatalogs: () => ({}),
		saveModelCatalogs: blockedWrite,
		getLanguages: () => ({}),
		notify: () => null,
		getLabels: () => ({}),
		getCustomText: () => "",
		getEngineLabel: engineKey => String(engineKey || ""),
		providerAttemptOwner,
		streamTransport
	});
	const observationStore = createProviderLatencyStore({now});
	const benchmark = createW2WireBenchmark({providerClient, observationStore, now});
	return Object.freeze({
		providerClient,
		observationStore,
		benchmark,
		metrics() {
			const resources = providerAttemptOwner.getSnapshot();
			return Object.freeze({physicalRequestCount, callbackRequestCount, settingsWriteAttemptCount, activeHighWater, resources});
		},
		abort(reason = "w2-harness-stop") {benchmark.cancel(reason); return providerAttemptOwner.abortAll(reason);},
		drain: () => providerAttemptOwner.drain()
	});
}

function sanitizeBenchmarkResult(value) {
	const arm = input => Object.freeze({
		arm: ARM_KEYS.includes(String(input && input.arm || "")) ? String(input.arm) : null,
		planned: Number(input && input.planned) || 0,
		attempted: Number(input && input.attempted) || 0,
		succeeded: Number(input && input.succeeded) || 0,
		failed: Number(input && input.failed) || 0,
		timeout: Number(input && input.timeout) || 0,
		cancelled: Number(input && input.cancelled) || 0,
		repairRequested: Number(input && input.repairRequested) || 0,
		repairValid: Number(input && input.repairValid) || 0,
		p50Ms: input && input.p50Ms == null ? null : Number(input.p50Ms),
		p95Ms: input && input.p95Ms == null ? null : Number(input.p95Ms),
		promptTokens: input && input.promptTokens == null ? null : Number(input.promptTokens),
		completionTokens: input && input.completionTokens == null ? null : Number(input.completionTokens),
		reasoningTokens: input && input.reasoningTokens == null ? null : Number(input.reasoningTokens),
		orderDetectable: input && input.orderDetectable !== false
	});
	return Object.freeze({
		schemaVersion: "w2-1",
		status: ["complete", "failed", "cancelled", "stale"].includes(String(value && value.status || "")) ? String(value.status) : "failed",
		reason: value && value.reason == null ? null : fixedReason(value.reason),
		completedRequests: Number(value && value.completedRequests) || 0,
		physicalRequests: Number(value && value.physicalRequests) || 0,
		repairRequests: Number(value && value.repairRequests) || 0,
		maxRequests: Number(value && value.maxRequests) || 0,
		hardRequestCap: Number(value && value.hardRequestCap) || 0,
		gateReady: value && value.gateReady === true,
		configDigest: /^w2c1:[0-9a-f]{20}$/.test(String(value && value.configDigest || "")) ? String(value.configDigest) : null,
		arms: Object.freeze(Object.fromEntries(ARM_KEYS.map(key => [key, arm(value && value.arms && value.arms[key])])) )
	});
}

function sanitizeStoreSnapshot(snapshot) {
	const topNumbers = ["generation", "fixtureCount", "plannedSamplesPerArm", "plannedWarmupCount", "plannedLogicalRequests", "plannedPhysicalRequests", "estimatedPromptTokenCap", "completionTokenCap", "estimatedCostMicrounits", "maxTrials", "trialCount", "measuredTrialCount", "warmupTrialCount", "rejectedTrialCount", "startedAt", "finishedAt"];
	const output = {
		schemaVersion: "w2-wire-benchmark-1",
		status: ["idle", "running", "complete", "cancelled", "failed"].includes(String(snapshot && snapshot.status || "")) ? String(snapshot.status) : "failed",
		active: snapshot && snapshot.active === true,
		fixtureSetVersion: /^[A-Za-z0-9._:-]{1,64}$/.test(String(snapshot && snapshot.fixtureSetVersion || "")) ? String(snapshot.fixtureSetVersion) : null,
		plannedArms: Object.freeze(STORE_ARM_KEYS.filter(arm => Array.isArray(snapshot && snapshot.plannedArms) && snapshot.plannedArms.includes(arm))),
		planComplete: snapshot && snapshot.planComplete === true,
		cancelled: snapshot && snapshot.cancelled === true,
		reason: snapshot && snapshot.reason == null ? null : fixedReason(snapshot.reason),
		arms: {},
		comparisons: {},
		gate: Object.freeze({ready: snapshot && snapshot.gate && snapshot.gate.ready === true, passed: snapshot && snapshot.gate && snapshot.gate.passed === true, reason: fixedReason(snapshot && snapshot.gate && snapshot.gate.reason, "unknown")}),
		resources: Object.freeze(Object.fromEntries(["activeSessionCount", "trialCount", "timerCount", "controllerCount", "listenerCount"].map(key => [key, Math.max(0, Number(snapshot && snapshot.resources && snapshot.resources[key]) || 0)])))
	};
	for (const key of topNumbers) output[key] = snapshot && snapshot[key] == null ? null : Math.max(0, Number(snapshot[key]) || 0);
	const armNumbers = ["warmupCount", "sampleCount", "successCount", "failureCount", "timeoutCount", "cancelledCount", "invalidCount", "protectedFailureCount", "providerSampleCount", "providerP50Ms", "providerP95Ms", "promptTokenSampleCount", "completionTokenSampleCount", "reasoningTokenSampleCount", "promptTokens", "completionTokens", "reasoningTokens", "wireByteSampleCount", "wireBytes", "requestCount", "nonSingleRequestCount"];
	for (const key of STORE_ARM_KEYS) {
		const input = snapshot && snapshot.arms && snapshot.arms[key] || {};
		const row = {arm: key, p50Ready: input.p50Ready === true, p95Ready: input.p95Ready === true, orderDetectable: input.orderDetectable !== false};
		for (const field of armNumbers) row[field] = input[field] == null ? null : Math.max(0, Number(input[field]) || 0);
		const reasonCounts = {};
		for (const [reason, value] of Object.entries(input.reasonCounts || {})) reasonCounts[fixedReason(reason)] = (reasonCounts[fixedReason(reason)] || 0) + Math.max(0, Number(value) || 0);
		row.reasonCounts = Object.freeze(reasonCounts);
		output.arms[key] = Object.freeze(row);
	}
	for (const key of ["compact-order", "compact-marker"]) {
		const input = snapshot && snapshot.comparisons && snapshot.comparisons[key] || {};
		output.comparisons[key] = Object.freeze({
			arm: key,
			sampleReady: input.sampleReady === true,
			latencyReady: input.latencyReady === true,
			usageReady: input.usageReady === true,
			promptReductionPercent: input.promptReductionPercent == null ? null : Number(input.promptReductionPercent),
			completionReductionPercent: input.completionReductionPercent == null ? null : Number(input.completionReductionPercent),
			providerP50ImprovementPercent: input.providerP50ImprovementPercent == null ? null : Number(input.providerP50ImprovementPercent),
			providerP95ChangePercent: input.providerP95ChangePercent == null ? null : Number(input.providerP95ChangePercent),
			correctnessPassed: input.correctnessPassed === true,
			orderDetectable: input.orderDetectable !== false,
			performancePassed: input.performancePassed === true,
			productionPassed: input.productionPassed === true
		});
	}
	output.arms = Object.freeze(output.arms);
	output.comparisons = Object.freeze(output.comparisons);
	output.trials = Object.freeze((snapshot && snapshot.trials || []).slice(0, 180).map(trial => Object.freeze({
		trialId: Math.max(0, Number(trial && trial.trialId) || 0),
		fixtureId: /^[A-Za-z0-9._:-]{1,32}$/.test(String(trial && trial.fixtureId || "")) ? String(trial.fixtureId) : null,
		orderId: trial && trial.orderId == null ? null : Math.max(0, Number(trial.orderId) || 0),
		position: trial && trial.position == null ? null : Math.max(0, Number(trial.position) || 0),
		arm: STORE_ARM_KEYS.includes(String(trial && trial.arm || "")) ? String(trial.arm) : null,
		warmup: trial && trial.warmup === true,
		providerMs: trial && trial.providerMs == null ? null : Math.max(0, Number(trial.providerMs) || 0),
		status: ["ok", "failed", "timeout", "cancelled"].includes(String(trial && trial.status || "")) ? String(trial.status) : "failed",
		httpStatus: trial && trial.httpStatus == null ? null : Math.max(0, Number(trial.httpStatus) || 0),
		errorClass: trial && trial.errorClass == null ? null : fixedReason(trial.errorClass, "unknown"),
		valid: trial && trial.valid === true,
		protectedIntegrity: ["pass", "fail", "unknown"].includes(String(trial && trial.protectedIntegrity || "")) ? String(trial.protectedIntegrity) : "unknown",
		orderDetectable: trial && trial.orderDetectable !== false,
		requestCount: Math.max(0, Number(trial && trial.requestCount) || 0),
		wireBytes: trial && trial.wireBytes == null ? null : Math.max(0, Number(trial.wireBytes) || 0),
		promptTokens: trial && trial.promptTokens == null ? null : Math.max(0, Number(trial.promptTokens) || 0),
		completionTokens: trial && trial.completionTokens == null ? null : Math.max(0, Number(trial.completionTokens) || 0),
		reasoningTokens: trial && trial.reasoningTokens == null ? null : Math.max(0, Number(trial.reasoningTokens) || 0),
		reason: trial && trial.reason == null ? null : fixedReason(trial.reason),
		segmentDiagnostics: sanitizeSegmentDiagnostics(trial && trial.segmentDiagnostics),
		structureDiagnostics: sanitizeStructureDiagnostics(trial && trial.structureDiagnostics)
	})));
	return Object.freeze(output);
}

function sanitizeTransport(metrics) {
	const resources = metrics && metrics.resources || {};
	return Object.freeze({
		physicalRequestCount: Math.max(0, Number(metrics && metrics.physicalRequestCount) || 0),
		callbackRequestCount: Math.max(0, Number(metrics && metrics.callbackRequestCount) || 0),
		settingsWriteAttemptCount: Math.max(0, Number(metrics && metrics.settingsWriteAttemptCount) || 0),
		activeHighWater: Math.max(0, Number(metrics && metrics.activeHighWater) || 0),
		resources: Object.freeze(Object.fromEntries(["generation", "active", "highWater", "controllerCount", "readerCount", "decoderCount", "timerCount", "logicalSignalCount", "bufferBytes"].map(key => [key, Math.max(0, Number(resources[key]) || 0)])))
	});
}

function integritySnapshot(configBefore, configAfter, installedBefore, installedAfter) {
	return Object.freeze({
		configBeforeSha256: configBefore,
		configAfterSha256: configAfter,
		configUnchanged: configBefore === configAfter,
		installedBeforeSha256: installedBefore,
		installedAfterSha256: installedAfter,
		installedUnchanged: installedBefore === installedAfter
	});
}

async function runW2ProviderHarness(argv = [], dependencies = {}) {
	const options = parseArguments(argv);
	assertReadableFile(options.configPath, "config-read");
	assertReadableFile(options.installedPath, "installed-read");
	const fetchFunction = dependencies.fetchFunction || (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
	if (typeof fetchFunction !== "function") throw new HarnessError("fetch-unavailable");
	const configuration = readConfiguration(options.configPath), configBefore = configuration.sha256, installedBefore = hashFile(options.installedPath);
	const engineKey = String(options.engineKey || configuration.all.engines.translator || "");
	if (!engineKey || engineKey === "----") throw new HarnessError("configuration");
	const runtime = createReadOnlyRuntime(configuration.all, {fetchFunction, now: dependencies.now || Date.now});
	const previewRaw = runtime.benchmark.prepare(engineKey, {
		maxOutputTokens: options.maxOutputTokens,
		inputPricePerMillion: options.inputPricePerMillion,
		outputPricePerMillion: options.outputPricePerMillion,
		arms: options.arms,
		fixtureIds: options.fixtureIds,
		samplesPerFixture: options.samplesPerFixture
	});
	if (!previewRaw || !previewRaw.ok) throw new HarnessError(fixedReason(previewRaw && previewRaw.reason, "configuration"));
	const preview = sanitizePreview(previewRaw), expectedConfirmation = confirmationToken(preview, configBefore, installedBefore);

	if (options.mode === "preflight") {
		const configAfter = hashFile(options.configPath), installedAfter = hashFile(options.installedPath), transport = sanitizeTransport(runtime.metrics());
		if (transport.physicalRequestCount !== 0 || transport.callbackRequestCount !== 0 || transport.settingsWriteAttemptCount !== 0) throw new HarnessError("preflight-side-effect");
		const output = Object.freeze({
			schemaVersion: HARNESS_SCHEMA_VERSION,
			mode: "preflight",
			status: "ready",
			reason: null,
			confirmationToken: expectedConfirmation,
			preview,
			integrity: integritySnapshot(configBefore, configAfter, installedBefore, installedAfter),
			transport
		});
		writeArtifact(options.outputPath, output);
		if (typeof dependencies.stdout === "function") dependencies.stdout(`${JSON.stringify(output)}\n`);
		return output;
	}

	if (!tokensEqual(options.confirmationToken, expectedConfirmation)) {
		const configAfter = hashFile(options.configPath), installedAfter = hashFile(options.installedPath);
		const output = Object.freeze({
			schemaVersion: HARNESS_SCHEMA_VERSION,
			mode: "run",
			status: "failed",
			reason: "confirmation-mismatch",
			previewId: preview.previewId,
			integrity: integritySnapshot(configBefore, configAfter, installedBefore, installedAfter),
			transport: sanitizeTransport(runtime.metrics())
		});
		writeArtifact(options.outputPath, output);
		if (typeof dependencies.stdout === "function") dependencies.stdout(`${JSON.stringify(output)}\n`);
		return output;
	}

	const internalConfirmation = runtime.benchmark.confirm(preview.previewId);
	if (!internalConfirmation) throw new HarnessError("confirmation-required");
	let abortListener = null;
	if (dependencies.signal && typeof dependencies.signal.addEventListener === "function") {
		abortListener = () => runtime.abort(dependencies.signal.reason || "external-cancelled");
		dependencies.signal.addEventListener("abort", abortListener, {once: true});
		if (dependencies.signal.aborted) abortListener();
	}
	let benchmarkRaw;
	try {benchmarkRaw = await runtime.benchmark.run(internalConfirmation, {onProgress: typeof dependencies.onProgress === "function" ? dependencies.onProgress : () => {}});}
	finally {
		if (dependencies.signal && abortListener) try {dependencies.signal.removeEventListener("abort", abortListener);} catch {}
		await runtime.drain();
	}
	const benchmark = sanitizeBenchmarkResult(benchmarkRaw), store = sanitizeStoreSnapshot(runtime.observationStore.getW2Snapshot());
	const configAfter = hashFile(options.configPath), installedAfter = hashFile(options.installedPath), integrity = integritySnapshot(configBefore, configAfter, installedBefore, installedAfter), transport = sanitizeTransport(runtime.metrics());
	let status = benchmark.status, reason = benchmark.reason;
	if (!integrity.configUnchanged || !integrity.installedUnchanged) {status = "failed"; reason = "integrity-changed";}
	if (transport.settingsWriteAttemptCount !== 0 || transport.callbackRequestCount !== 0) {status = "failed"; reason = "read-only-write-attempt";}
	const output = Object.freeze({
		schemaVersion: HARNESS_SCHEMA_VERSION,
		mode: "run",
		status,
		reason,
		previewId: preview.previewId,
		benchmark,
		store,
		integrity,
		transport
	});
	writeArtifact(options.outputPath, output);
	if (typeof dependencies.stdout === "function") dependencies.stdout(`${JSON.stringify(output)}\n`);
	return output;
}

async function main() {
	const controller = new AbortController();
	const stop = () => controller.abort("console-stop");
	process.once("SIGINT", stop);
	try {
		const output = await runW2ProviderHarness(process.argv.slice(2), {stdout: text => process.stdout.write(text), signal: controller.signal});
		if (output.mode === "preflight" && output.preview) {
			const p = output.preview;
			process.stderr.write(`W2 preflight: ${p.maxRequests} requests (${p.warmupRequests} warm-up + ${p.measuredRequests} measured, hard cap ${p.hardRequestCap}); arms=${p.arms.join(",")}; fixtures=${p.fixtureIds.join(",")}; samplesPerFixture=${p.samplesPerFixture}; maxOutputTokens/request=${p.maxOutputTokensPerRequest}; hardOutputTokenCap=${p.hardOutputTokenCap}; estimatedInputTokens=${p.estimatedInputTokens}; estimatedOutputTokens(D ranges)=${p.estimatedOutputTokens == null ? "n/a" : p.estimatedOutputTokens}\n`);
		}
		if (output.status !== "ready" && output.status !== "complete") process.exitCode = 1;
	}
	catch (error) {
		const reason = error instanceof HarnessError ? error.code : "unknown";
		process.stdout.write(`${JSON.stringify({schemaVersion: HARNESS_SCHEMA_VERSION, mode: "error", status: "failed", reason})}\n`);
		process.exitCode = 1;
	}
	finally {process.removeListener("SIGINT", stop);}
}

if (require.main === module) main();

// P3 probe reuses the read-only runtime and config reader; nothing else is shared.
module.exports = {HARNESS_SCHEMA_VERSION, HarnessError, parseArguments, runW2ProviderHarness, defaultPaths, readConfiguration, hashFile, createReadOnlyRuntime};
