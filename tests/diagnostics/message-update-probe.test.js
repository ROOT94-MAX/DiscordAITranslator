const test = require("node:test");
const assert = require("node:assert/strict");
const {createMessageUpdateProbe, MESSAGE_UPDATE_ACTION} = require("../../src/diagnostics/message-update-probe");

function createFakeDispatcher() {
	const subscriptions = new Map();
	return {
		subscriptions,
		dispatch(event) {
			for (const handler of [...(subscriptions.get(event.type) || [])]) handler(event);
		},
		subscribe(action, handler) {
			if (!subscriptions.has(action)) subscriptions.set(action, new Set());
			subscriptions.get(action).add(handler);
		},
		unsubscribe(action, handler) {
			const handlers = subscriptions.get(action);
			if (handlers) handlers.delete(handler);
		}
	};
}

function createHarness({dispatcher = createFakeDispatcher(), maxEvents = 2} = {}) {
	const writes = [];
	const probe = createMessageUpdateProbe({
		resolveDispatcher: () => dispatcher,
		sink: text => writes.push(JSON.parse(text)),
		now: () => 12345,
		maxEvents
	});
	return {dispatcher, writes, probe};
}

test("the probe records real MESSAGE_UPDATE shapes and retires itself at the cap", () => {
	const {dispatcher, writes, probe} = createHarness({maxEvents: 2});

	assert.equal(probe.start(), true);
	assert.equal(dispatcher.subscriptions.get(MESSAGE_UPDATE_ACTION).size, 1, "one read-only subscription");

	dispatcher.dispatch({type: MESSAGE_UPDATE_ACTION, message: {id: "m1", channel_id: "c1", content: "edited once"}});
	dispatcher.dispatch({type: MESSAGE_UPDATE_ACTION, message: {id: "m2", channel_id: "c1", content: "edited twice"}});
	dispatcher.dispatch({type: MESSAGE_UPDATE_ACTION, message: {id: "m3", channel_id: "c1", content: "after the cap"}});

	assert.equal(probe.getCapturedCount(), 2, "the cap bounds the evidence");
	assert.equal(dispatcher.subscriptions.get(MESSAGE_UPDATE_ACTION).size, 0, "the probe unsubscribed itself");
	const finalWrite = writes[writes.length - 1];
	assert.equal(finalWrite.reason, "complete");
	assert.equal(finalWrite.events.length, 2);
	assert.equal(finalWrite.events[0].shape.type, "object");
	assert.deepEqual(finalWrite.events[0].shape.keys.sort(), ["message", "type"], "the captured shape names the payload keys");
	assert.equal(finalWrite.dispatcher.hasDispatch, true, "the evidence records whether a synthetic dispatch is even possible");
});

test("a missing dispatcher is recorded as evidence, not thrown", () => {
	const writes = [];
	const probe = createMessageUpdateProbe({
		resolveDispatcher: () => null,
		sink: text => writes.push(JSON.parse(text)),
		now: () => 1
	});

	assert.equal(probe.start(), false);
	assert.equal(writes.length, 1);
	assert.equal(writes[0].reason, "no-dispatcher");
	assert.ok(writes[0].notes[0].includes("no dispatcher"));
});

test("stop unsubscribes and preserves the partial evidence", () => {
	const {dispatcher, writes, probe} = createHarness({maxEvents: 5});
	probe.start();
	dispatcher.dispatch({type: MESSAGE_UPDATE_ACTION, message: {id: "m1"}});

	probe.stop();

	assert.equal(dispatcher.subscriptions.get(MESSAGE_UPDATE_ACTION).size, 0);
	const finalWrite = writes[writes.length - 1];
	assert.equal(finalWrite.reason, "stopped");
	assert.equal(finalWrite.events.length, 1, "the partial capture is kept");
});

test("a probe that never started writes nothing on stop", () => {
	const writes = [];
	const probe = createMessageUpdateProbe({sink: text => writes.push(text)});

	probe.stop();

	assert.equal(writes.length, 0);
});

test("the strategy ladder records every outcome and selects the first subscribable candidate", () => {
	// First field round (2026-08-19) came back "no-dispatcher" with zero detail;
	// a failed run must now name which handles exist on this client.
	const good = createFakeDispatcher();
	const writes = [];
	const probe = createMessageUpdateProbe({
		strategies: [
			{name: "throws", resolve: () => {throw new Error("boom");}},
			{name: "empty", resolve: () => null},
			{name: "no-subscribe", resolve: () => ({dispatch: () => {}})},
			{name: "winner", resolve: () => good},
			{name: "never-reached-but-recorded", resolve: () => createFakeDispatcher()}
		],
		sink: text => writes.push(JSON.parse(text)),
		now: () => 7,
		maxEvents: 1
	});

	assert.equal(probe.start(), true);
	good.dispatch({type: MESSAGE_UPDATE_ACTION, message: {id: "m1"}});

	const finalWrite = writes[writes.length - 1];
	assert.equal(finalWrite.reason, "complete");
	const byName = Object.fromEntries(finalWrite.strategyOutcomes.map(entry => [entry.name, entry]));
	assert.match(byName["throws"].result, /threw: boom/);
	assert.equal(byName["empty"].result, "empty");
	assert.equal(byName["no-subscribe"].hasSubscribe, false);
	assert.equal(byName["winner"].selected, true);
	assert.equal(byName["winner"].hasDispatch, true);
	assert.equal(byName["never-reached-but-recorded"].selected, undefined, "later candidates are recorded but not selected");
});
