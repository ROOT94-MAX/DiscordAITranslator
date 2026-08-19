// Read-only probe for the per-row repaint endgame (recovery plan, remaining route
// 1): captures the REAL shape of Discord's internal MESSAGE_UPDATE dispatches on
// this client, so a synthetic per-row dispatch can later be designed against ground
// truth instead of guesses - a wrong payload shape corrupts the visible message
// record, which no fallback can undo. The probe only observes: it never dispatches,
// never mutates the event, and unsubscribes itself once it has enough evidence.
const {summarizeValueShape} = require("./second-debug-probe");

const MESSAGE_UPDATE_ACTION = "MESSAGE_UPDATE";
const DEFAULT_MAX_EVENTS = 5;

function createMessageUpdateProbe({resolveDispatcher = () => null, strategies = null, sink = null, log = () => {}, now = Date.now, maxEvents = DEFAULT_MAX_EVENTS} = {}) {
	const evidence = {startedAt: null, dispatcher: null, strategyOutcomes: [], events: [], notes: []};
	let dispatcher = null;
	let handler = null;

	// Tries every named strategy and records each outcome, so a fully failed run
	// still teaches which handles exist on this client (first probe round came back
	// "no-dispatcher" with zero detail - 2026-08-19). The first candidate with a
	// callable subscribe wins; hasDispatch is recorded because the endgame needs it.
	function resolveThroughStrategies() {
		const candidates = Array.isArray(strategies) && strategies.length ? strategies : [{name: "injected", resolve: resolveDispatcher}];
		let winner = null;
		for (const strategy of candidates) {
			const outcome = {name: strategy && strategy.name || "unnamed"};
			let resolved = null;
			try {resolved = strategy.resolve();}
			catch (error) {
				outcome.result = `threw: ${error && error.message || error}`;
				evidence.strategyOutcomes.push(outcome);
				continue;
			}
			if (!resolved) outcome.result = "empty";
			else {
				outcome.result = "resolved";
				outcome.hasSubscribe = typeof resolved.subscribe == "function";
				outcome.hasDispatch = typeof resolved.dispatch == "function";
				outcome.shape = summarizeValueShape(resolved, 1);
				if (!winner && outcome.hasSubscribe) {
					winner = resolved;
					outcome.selected = true;
				}
			}
			evidence.strategyOutcomes.push(outcome);
		}
		return winner;
	}

	function writeEvidence(reason) {
		if (!sink) return;
		try {sink(JSON.stringify(Object.assign({}, evidence, {finishedAt: now(), reason}), null, "\t"));}
		catch (error) {}
	}

	function unsubscribe() {
		if (dispatcher && handler && typeof dispatcher.unsubscribe == "function") {
			try {dispatcher.unsubscribe(MESSAGE_UPDATE_ACTION, handler);}
			catch (error) {}
		}
		handler = null;
	}

	return Object.freeze({
		start() {
			evidence.startedAt = now();
			dispatcher = resolveThroughStrategies();
			if (!dispatcher) {
				evidence.notes.push("no dispatcher with subscribe() was resolvable on this client");
				log("[translator message-update probe] no dispatcher found");
				writeEvidence("no-dispatcher");
				return false;
			}
			evidence.dispatcher = {
				keys: (() => {try {return Object.keys(dispatcher).slice(0, 30);} catch (error) {return [];}})(),
				hasDispatch: typeof dispatcher.dispatch == "function",
				hasUnsubscribe: typeof dispatcher.unsubscribe == "function"
			};
			handler = event => {
				try {
					evidence.events.push({at: now(), shape: summarizeValueShape(event, 5)});
					log(`[translator message-update probe] captured ${evidence.events.length}/${maxEvents}`);
					// Partial evidence survives a crash or an early quit; the sink
					// writes into BetterDiscord's data folder, which is not watched.
					writeEvidence(evidence.events.length >= maxEvents ? "complete" : "capturing");
					if (evidence.events.length >= maxEvents) {
						unsubscribe();
						log("[translator message-update probe] capture complete");
					}
				}
				catch (error) {}
			};
			try {dispatcher.subscribe(MESSAGE_UPDATE_ACTION, handler);}
			catch (error) {
				evidence.notes.push(`subscribe threw: ${error && error.message || error}`);
				writeEvidence("subscribe-failed");
				handler = null;
				return false;
			}
			log("[translator message-update probe] armed - waiting for real MESSAGE_UPDATE events");
			return true;
		},
		stop() {
			unsubscribe();
			if (evidence.startedAt != null) writeEvidence("stopped");
		},
		getCapturedCount: () => evidence.events.length
	});
}

module.exports = {createMessageUpdateProbe, MESSAGE_UPDATE_ACTION, DEFAULT_MAX_EVENTS};
