// Owns one historical (loaded-message) translation job: the per-message records, the
// state machine those records move through, and the run pipeline that carries a whole
// channel snapshot from "collecting" to a single atomic commit.
//
// A job is deliberately a batch, not a stream. Nothing it produces reaches the message
// list until run() gets to the commit step, so a scrollback pass repaints once instead
// of flickering per message, and a cancel that arrives before that step costs nothing
// beyond the provider call already in flight.
//
// The module knows nothing about Discord, providers, caches or the display store. Every
// side effect - preparing an item, calling the provider, validating a result, repairing
// a leftover, waiting for the right moment to commit, committing and repainting -
// arrives as an injected dependency, defaulted so the class is constructible alone.
//
// Two invariants hold the whole thing together:
//
// - A record only ever leaves a non-terminal state. cancel() stamps "cancelled" over
//   every non-terminal record, and every later write path re-checks both record.status
//   and this.state before touching a record. That is what makes a provider result which
//   lands after a cancel a no-op rather than a resurrection.
// - createSummary is derived from the records on demand, never accumulated alongside
//   them, so a cancelled job and a committed job report through the same code path.
//
// The pipeline is: prepare every record, translate the survivors in ONE batch, validate
// each result, hand the failures to an optional chunked repair batch, then fall back to
// per-item repair with bounded concurrency. Each stage is a funnel - it only ever sees
// what the previous stage could not resolve - which is why the expensive per-item path
// normally runs on nothing at all.

// The states a record can never be moved out of. "cancelled" is in here so that a
// cancel cannot be overwritten by a late result, and "skipped"/"failed" are in here so
// that a decision already reached is not paid for twice.
const HISTORICAL_TERMINAL_ITEM_STATES = new Set(["translated", "skipped", "failed", "cancelled"]);

// The hard ceiling on how many loaded messages one historical AI batch may carry,
// whatever the user configured as their loaded-message limit. The job class does not
// read it - the plugin clamps its own limit against this before handing items to a job -
// but it is a historical-job number, so it lives with them rather than in the runtime.
const HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX = 100;

function normalizeBatchOutcome(outcome) {
	const detailed = !!(outcome && typeof outcome == "object" && Object.prototype.hasOwnProperty.call(outcome, "translations") && Object.prototype.hasOwnProperty.call(outcome, "failureKind"));
	return detailed ? outcome : {translations: outcome, failureKind: null, statusCode: null};
}

function isTerminalProviderFailure(failureKind) {
	return ["auth", "configuration", "permanent"].includes(failureKind);
}

class HistoricalTranslationJob {
	constructor(config = {}) {
		this.id = config.id || `historical-${Date.now()}`;
		this.channelId = config.channelId || null;
		this.generation = config.generation || 0;
		this.configurationSignature = config.configurationSignature || null;
		this.dependencies = Object.assign({
			prepare: item => ({status: "pending", prepared: item}),
			translateBatch: () => Promise.resolve(null),
			repairBatch: null,
			validate: (_item, translatedText) => translatedText == null ? {ok: false} : {ok: true, translation: translatedText},
			repair: () => Promise.resolve({status: "failed", reason: "unresolved"}),
			waitForCommit: () => Promise.resolve(),
			isCurrent: () => true,
			commit: () => {},
			onStateChange: () => {}
		}, config.dependencies || {});
		this.items = new Map();
		this.state = "collecting";
		this.sealed = false;
		this.cancelReason = null;
		this.started = false;
		this.repairConcurrency = Math.max(1, parseInt(config.repairConcurrency, 10) || 4);
		this.repairBatchSize = Math.max(1, parseInt(config.repairBatchSize, 10) || 10);
	}

	add(item) {
		if (this.state != "collecting" || this.sealed) return false;
		const source = item && item.message ? item : {message: item};
		const messageId = source.message && source.message.id;
		if (!messageId || this.items.has(String(messageId))) return false;
		this.items.set(String(messageId), {
			source,
			prepared: null,
			status: "pending",
			translation: null,
			reason: null
		});
		this.dependencies.onStateChange(this);
		return true;
	}

	seal() {
		if (this.state != "collecting" || this.sealed) return false;
		this.sealed = true;
		this.dependencies.onStateChange(this);
		return true;
	}

	cancel(reason = "cancelled") {
		if (this.state == "committed" || this.state == "cancelled") return false;
		this.cancelReason = reason;
		this.state = "cancelled";
		for (const record of this.items.values()) if (!HISTORICAL_TERMINAL_ITEM_STATES.has(record.status)) record.status = "cancelled";
		this.dependencies.onStateChange(this);
		return true;
	}

	invalidateMessage(messageId, reason = "source-changed") {
		if (this.state == "committed" || this.state == "cancelled") return false;
		const record = this.items.get(String(messageId));
		if (!record || record.status == "cancelled") return false;
		record.status = "cancelled";
		record.translation = null;
		record.reason = reason;
		this.dependencies.onStateChange(this);
		return true;
	}

	isMessagePending(messageId) {
		const record = this.items.get(String(messageId));
		return !!record && this.state != "cancelled" && !HISTORICAL_TERMINAL_ITEM_STATES.has(record.status);
	}

	setPreparedOutcome(record, outcome) {
		outcome = outcome || {status: "failed", reason: "prepare_failed"};
		if (outcome.status == "translated") {
			record.status = "translated";
			record.translation = outcome.translation;
		}
		else if (outcome.status == "skipped") {
			record.status = "skipped";
			record.reason = outcome.reason || "skipped";
		}
		else if (outcome.status == "failed") {
			record.status = "failed";
			record.reason = outcome.reason || "failed";
		}
		else {
			record.status = "translating";
			record.prepared = outcome.prepared || record.source;
		}
	}

	createSummary() {
		const summary = {jobId: this.id, channelId: this.channelId, generation: this.generation, translated: [], skipped: [], failed: []};
		for (const record of this.items.values()) {
			const item = Object.assign({}, record.source, {translation: record.translation, reason: record.reason});
			if (record.status == "translated") summary.translated.push(item);
			else if (record.status == "skipped") summary.skipped.push(item);
			else if (record.status == "failed") summary.failed.push(item);
		}
		return summary;
	}

	async start() {
		if (this.started) return this.runningPromise;
		this.sealed = true;
		this.started = true;
		this.state = "translating";
		this.dependencies.onStateChange(this);
		this.runningPromise = this.run();
		return this.runningPromise;
	}

	async run() {
		for (const record of this.items.values()) {
			if (this.state == "cancelled") return this.createSummary();
			if (record.status == "cancelled") continue;
			try {
				this.setPreparedOutcome(record, await this.dependencies.prepare(record.source, this));
			}
			catch (error) {
				this.setPreparedOutcome(record, {status: "failed", reason: "prepare_failed"});
			}
		}

		const translatingRecords = [...this.items.values()].filter(record => record.status == "translating");
		if (translatingRecords.length && this.state != "cancelled") {
			let batchOutcome = null;
			try {
				batchOutcome = await this.dependencies.translateBatch(translatingRecords.map(record => record.prepared), this);
			}
			catch (error) {}
			if (this.state == "cancelled") return this.createSummary();
			const {translations: resultMap, failureKind} = normalizeBatchOutcome(batchOutcome);
			for (const record of translatingRecords) {
				if (record.status == "cancelled") continue;
				if (isTerminalProviderFailure(failureKind)) {
					record.status = "failed";
					record.reason = `provider_${failureKind}`;
					continue;
				}
				if (failureKind == "transient") record.transientRetry = true;
				const messageId = String(record.source.message.id);
				const rawTranslation = resultMap && Object.prototype.hasOwnProperty.call(resultMap, messageId) ? resultMap[messageId] : null;
				let validation = {ok: false};
				try {validation = await this.dependencies.validate(record.prepared, rawTranslation, this) || {ok: false};}
				catch (error) {}
				if (validation.ok) {
					record.status = "translated";
					record.translation = validation.translation;
				}
				// A skip verdict is terminal. Sending it to "repairing" left the message showing
				// a spinner and bought a second serial request for an answer we already had.
				else if (validation.skipped) {
					record.status = "skipped";
					record.reason = validation.reason || "skipped";
				}
				else record.status = "repairing";
			}
		}

		if (this.state == "cancelled") return this.createSummary();
		const unresolvedBatchRecords = [...this.items.values()].filter(record => record.status == "repairing");
		if (unresolvedBatchRecords.length > 1 && typeof this.dependencies.repairBatch == "function") {
			// A transport failure retries the original request once as one request. Smaller
			// chunks are reserved for valid responses that merely omitted or mangled items.
			const chunkSize = unresolvedBatchRecords.some(record => record.transientRetry)
				? unresolvedBatchRecords.length
				: Math.min(this.repairBatchSize, Math.max(1, Math.ceil(translatingRecords.length / 2)));
			for (let offset = 0; offset < unresolvedBatchRecords.length && this.state != "cancelled"; offset += chunkSize) {
				const chunk = unresolvedBatchRecords.slice(offset, offset + chunkSize).filter(record => record.status == "repairing");
				if (!chunk.length) continue;
				let repairOutcome = null;
				try {repairOutcome = await this.dependencies.repairBatch(chunk.map(record => record.prepared), this);}
				catch (error) {}
				if (this.state == "cancelled") return this.createSummary();
				const {translations: repairResultMap, failureKind: repairFailureKind} = normalizeBatchOutcome(repairOutcome);
				for (const record of chunk) {
					if (record.status == "cancelled") continue;
					if (isTerminalProviderFailure(repairFailureKind) || repairFailureKind == "transient") {
						record.status = "failed";
						record.reason = `provider_${repairFailureKind}`;
						continue;
					}
					const messageId = String(record.source.message.id);
					const rawTranslation = repairResultMap && Object.prototype.hasOwnProperty.call(repairResultMap, messageId) ? repairResultMap[messageId] : null;
					let validation = {ok: false};
					try {validation = await this.dependencies.validate(record.prepared, rawTranslation, this) || {ok: false};}
					catch (error) {}
					if (validation.ok) {
						record.status = "translated";
						record.translation = validation.translation;
					}
					else if (validation.skipped) {
						record.status = "skipped";
						record.reason = validation.reason || "skipped";
					}
					else if (record.transientRetry) {
						record.status = "failed";
						record.reason = "provider_transient";
					}
				}
			}
		}

		if (this.state == "cancelled") return this.createSummary();
		this.state = "repairing";
		this.dependencies.onStateChange(this);
		const repairingRecords = [...this.items.values()].filter(record => record.status == "repairing");
		let repairIndex = 0;
		const repairNext = async () => {
			while (repairIndex < repairingRecords.length && this.state != "cancelled") {
				const record = repairingRecords[repairIndex++];
				if (!record || record.status == "cancelled") continue;
				let repairOutcome;
				try {repairOutcome = await this.dependencies.repair(record.prepared || record.source, this);}
				catch (error) {repairOutcome = {status: "failed", reason: "repair_failed"};}
				if (record.status == "cancelled") continue;
				this.setPreparedOutcome(record, repairOutcome);
				if (!HISTORICAL_TERMINAL_ITEM_STATES.has(record.status)) {
					record.status = "failed";
					record.reason = "repair_failed";
				}
			}
		};
		await Promise.all(Array.from({length: Math.min(this.repairConcurrency, repairingRecords.length)}, () => repairNext()));

		if (this.state == "cancelled") return this.createSummary();
		this.state = "ready";
		this.dependencies.onStateChange(this);
		await this.dependencies.waitForCommit(this);
		if (this.state == "cancelled" || !this.dependencies.isCurrent(this)) {
			this.cancel("stale_generation");
			return this.createSummary();
		}

		const summary = this.createSummary();
		await this.dependencies.commit(summary, this);
		if (this.state == "cancelled") return this.createSummary();
		this.state = "committed";
		this.dependencies.onStateChange(this);
		return summary;
	}
}

module.exports = {
	normalizeBatchOutcome,
	HISTORICAL_TERMINAL_ITEM_STATES,
	HISTORICAL_AI_BATCH_ITEM_LIMIT_MAX,
	HistoricalTranslationJob
};
