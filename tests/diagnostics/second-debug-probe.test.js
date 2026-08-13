const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {createSecondDebugProbe, createSecondDebugEvidenceSink, createMessageRefreshStrategies, SECOND_DEBUG_MARKER} = require("../../src/diagnostics/second-debug-probe");

function createClassInstanceFixture() {
	class MessagesLikeComponent {
		forceUpdate() {}
	}
	const instance = new MessagesLikeComponent();
	instance.props = {
		channel: {id: "channel-1"},
		channelStream: [{content: {id: "m1"}}, {content: {id: "m2"}}]
	};
	const fiber = {
		tag: 1,
		type: MessagesLikeComponent,
		stateNode: instance,
		return: {tag: 0, type: function ParentFunction() {}, stateNode: null, return: null}
	};
	instance._reactInternals = fiber;
	return {instance, fiber};
}

function createFunctionInstanceFixture() {
	function MessagesFunctionComponent() {}
	class UpdateableAncestor {
		forceUpdate() {}
	}
	const ancestorInstance = new UpdateableAncestor();
	const ancestorFiber = {tag: 1, type: UpdateableAncestor, stateNode: ancestorInstance, return: null};
	const fiber = {
		tag: 0,
		type: {$$typeof: Symbol.for("react.memo"), type: MessagesFunctionComponent},
		stateNode: null,
		return: {tag: 5, type: "div", stateNode: {}, return: ancestorFiber}
	};
	const instance = {props: {channel: {id: "channel-2"}, channelStream: []}, _reactInternals: fiber};
	return {instance, fiber};
}

test("a class channel-stream instance is recorded as directly updateable with its fiber shape", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	const {instance} = createClassInstanceFixture();

	probe.recordParentRenderPass({instance, methodname: "render"});
	const entries = probe.list().filter(entry => entry.kind === "parentRenderPass");

	assert.equal(entries.length, 1);
	const entry = entries[0];
	assert.equal(entry.hasForceUpdate, true);
	assert.equal(entry.constructorName, "MessagesLikeComponent");
	assert.equal(entry.channelId, "channel-1");
	assert.equal(entry.channelStreamLength, 2);
	assert.equal(entry.fiber.tag, 1);
	assert.equal(entry.fiber.type.kind, "class");
	assert.equal(entry.fiber.type.name, "MessagesLikeComponent");
	assert.deepEqual(entry.updateableAncestor, {depth: 0, name: "MessagesLikeComponent"});
});

test("a memo function instance is recorded as not directly updateable and reports the nearest class ancestor", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	const {instance} = createFunctionInstanceFixture();

	probe.recordParentRenderPass({instance});
	const entry = probe.list().find(item => item.kind === "parentRenderPass");

	assert.equal(entry.hasForceUpdate, false);
	assert.equal(entry.fiber.tag, 0);
	assert.equal(entry.fiber.type.kind, "memo");
	assert.equal(entry.fiber.type.name, "MessagesFunctionComponent");
	assert.deepEqual(entry.updateableAncestor, {depth: 2, name: "UpdateableAncestor"});
	assert.equal(entry.ancestry.length, 2);
	assert.equal(entry.ancestry[1].type.kind, "class");
});

test("repeated renders of the same instance update one entry instead of appending duplicates", () => {
	const logged = [];
	const probe = createSecondDebugProbe({log: message => logged.push(message)});
	const {instance} = createClassInstanceFixture();

	probe.recordParentRenderPass({instance});
	probe.recordParentRenderPass({instance});
	probe.recordParentRenderPass({instance});
	const entries = probe.list().filter(entry => entry.kind === "parentRenderPass");

	assert.equal(entries.length, 1);
	assert.equal(entries[0].passCount, 3);
	assert.equal(logged.length, 1);

	const second = createClassInstanceFixture();
	probe.recordParentRenderPass({instance: second.instance});
	const afterNewInstance = probe.list().filter(entry => entry.kind === "parentRenderPass");
	assert.equal(afterNewInstance.length, 2);
	assert.equal(afterNewInstance[1].instanceId !== afterNewInstance[0].instanceId, true);
});

test("wrapModule records call arguments and resolved result shapes without changing the return value", async () => {
	const probe = createSecondDebugProbe({log: () => {}});
	const payload = {channelId: "channel-3", before: "m0", limit: 30};
	const resolved = {body: [{id: "m1", channel_id: "channel-3", content: "hi"}]};
	const original = {
		fetchMessages(request) {
			this.lastRequest = request;
			return Promise.resolve(resolved);
		}
	};

	const wrapped = probe.wrapModule(original, {label: "MessageActions", methods: ["fetchMessages"]});
	assert.equal(typeof wrapped.fetchMessages, "function");
	const result = await wrapped.fetchMessages(payload);

	assert.equal(result, resolved);
	assert.equal(original.lastRequest, payload);
	const entry = probe.list().find(item => item.kind === "moduleCall");
	assert.equal(entry.label, "MessageActions");
	assert.equal(entry.method, "fetchMessages");
	assert.equal(entry.args[0].type, "object");
	assert.ok(entry.args[0].keys.includes("channelId"));
	assert.equal(entry.result.type, "object");
	assert.ok(entry.result.keys.includes("body"));
	assert.equal(entry.result.nested.body.type, "array");
	assert.equal(entry.result.nested.body.length, 1);
	assert.equal(entry.error, undefined);
});

test("wrapModule records rejections and rethrows them to the caller", async () => {
	const probe = createSecondDebugProbe({log: () => {}});
	const original = {
		fetchMessages() {
			return Promise.reject(new Error("fetch failed"));
		}
	};

	const wrapped = probe.wrapModule(original, {label: "MessageActions", methods: ["fetchMessages"]});
	await assert.rejects(() => wrapped.fetchMessages({channelId: "c"}), /fetch failed/);
	const entry = probe.list().find(item => item.kind === "moduleCall");
	assert.equal(entry.error, "fetch failed");
	assert.equal(entry.result, undefined);
});

test("wrapModule preserves feature detection for prototype methods and non-listed properties", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	class FluxStoreLike {
		getMessages(channelId) {
			return {toArray: () => [{id: "m1", channel_id: channelId}]};
		}
	}
	const store = new FluxStoreLike();
	store.someFlag = true;

	const wrapped = probe.wrapModule(store, {label: "MessageStore", methods: ["getMessages"]});
	assert.equal(typeof wrapped.getMessages, "function");
	assert.equal(wrapped.someFlag, true);
	const value = wrapped.getMessages("channel-9");
	assert.equal(typeof value.toArray, "function");
	const entry = probe.list().find(item => item.kind === "moduleCall");
	assert.equal(entry.method, "getMessages");
	assert.equal(entry.result.type, "object");
});

test("wrapModule returns absent modules unchanged and records their absence once", () => {
	const probe = createSecondDebugProbe({log: () => {}});

	assert.equal(probe.wrapModule(null, {label: "MessageActions", methods: ["fetchMessages"]}), null);
	const entry = probe.list().find(item => item.kind === "moduleMissing");
	assert.equal(entry.label, "MessageActions");
});

test("the entry buffer is bounded and dump produces marked JSON", () => {
	const probe = createSecondDebugProbe({log: () => {}, limit: 5});
	for (let index = 0; index < 12; index++) probe.record("custom", {index});

	assert.equal(probe.list().length, 5);
	assert.equal(probe.list()[0].index, 7);
	const dumped = JSON.parse(probe.dump());
	assert.equal(dumped.marker, SECOND_DEBUG_MARKER);
	assert.equal(dumped.entries.length, 5);
});

test("the parent render pass records the BDFDB patch envelope and plain-object instance props", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	function MessagesFunction() {}

	probe.recordParentRenderPass({
		instance: {props: {channel: {id: "channel-7"}, channelStream: [1, 2, 3], hasMoreBefore: true}},
		component: MessagesFunction,
		methodname: "type",
		name: "Messages",
		patchtypes: ["before"],
		returnvalue: {$$typeof: Symbol.for("react.element"), type: MessagesFunction}
	});
	const entry = probe.list().find(item => item.kind === "parentRenderPass");

	assert.equal(entry.patchName, "Messages");
	assert.equal(entry.methodName, "type");
	assert.deepEqual(entry.patchTypes, ["before"]);
	assert.equal(entry.component.kind, "function");
	assert.equal(entry.component.name, "MessagesFunction");
	assert.ok(entry.propsKeys.includes("channelStream"));
	assert.equal(entry.hasForceUpdate, false);
	assert.equal(entry.fiber, null);
});

test("the DOM fiber walk reports the channel-stream owner and the nearest updateable ancestor above it", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	class ScrollerClass {
		forceUpdate() {}
	}
	function MessagesFunction() {}
	const scrollerInstance = new ScrollerClass();
	const scrollerFiber = {tag: 1, type: ScrollerClass, stateNode: scrollerInstance, memoizedProps: {}, return: null};
	const messagesFiber = {
		tag: 0,
		type: MessagesFunction,
		stateNode: null,
		memoizedProps: {channelStream: [1, 2], channel: {id: "channel-7"}},
		return: scrollerFiber
	};
	const listFiber = {tag: 5, type: "div", stateNode: {}, memoizedProps: {}, return: messagesFiber};
	const element = {__reactFiber$abc123: listFiber};

	probe.recordDomFiberWalk({label: "messagesScroller", element});
	const entry = probe.list().find(item => item.kind === "domFiberWalk");

	assert.equal(entry.label, "messagesScroller");
	assert.equal(entry.found, true);
	assert.equal(entry.chain.length, 3);
	assert.equal(entry.chain[1].type.name, "MessagesFunction");
	assert.equal(entry.chain[1].hasChannelStream, true);
	assert.equal(entry.chain[1].canForceUpdate, false);
	assert.deepEqual(entry.channelStreamOwner, {depth: 1, name: "MessagesFunction"});
	assert.deepEqual(entry.updateableAboveChannelStream, {depth: 2, name: "ScrollerClass"});
});

test("a DOM element without a React fiber key is recorded as not found", () => {
	const probe = createSecondDebugProbe({log: () => {}});

	probe.recordDomFiberWalk({label: "messagesScroller", element: {className: "scroller"}});
	probe.recordDomFiberWalk({label: "messagesScroller", element: null});
	const entries = probe.list().filter(item => item.kind === "domFiberWalk");

	assert.equal(entries.length, 2);
	assert.equal(entries[0].found, false);
	assert.equal(entries[1].found, false);
	assert.equal(entries[1].reason, "no-element");
});

test("the DOM walk is deferred past the render pass and retries until the scroller is mounted", () => {
	const timers = [];
	const probe = createSecondDebugProbe({
		log: () => {},
		domWalkLimit: 4,
		domWalkDelayMs: 800,
		setTimeoutFn: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		clearTimeoutFn: () => {}
	});
	class Root {
		forceUpdate() {}
	}
	const rootFiber = {tag: 1, type: Root, stateNode: new Root(), memoizedProps: {channelStream: []}, return: null};
	let mounted = null;

	probe.recordParentRenderPass({instance: {props: {}}}, {resolveScrollerElement: () => mounted});
	assert.equal(probe.list().filter(item => item.kind === "domFiberWalk").length, 0, "the walk must not run inside the render pass");
	assert.equal(timers.length, 1);
	assert.equal(timers[0].delay, 800);

	timers[0].callback();
	let walks = probe.list().filter(item => item.kind === "domFiberWalk");
	assert.equal(walks.length, 1);
	assert.equal(walks[0].found, false);
	assert.equal(timers.length, 2, "a failed attempt schedules a retry");

	mounted = {__reactFiber$xyz: rootFiber};
	timers[1].callback();
	walks = probe.list().filter(item => item.kind === "domFiberWalk");
	assert.equal(walks.length, 2);
	assert.equal(walks[1].found, true);
	assert.equal(timers.length, 2, "a successful walk schedules no further retry");

	probe.recordParentRenderPass({instance: {props: {}}}, {resolveScrollerElement: () => mounted});
	assert.equal(timers.length, 2, "later render passes do not re-arm a completed walk");
});

test("the deferred DOM walk gives up after the attempt limit", () => {
	const timers = [];
	const probe = createSecondDebugProbe({
		log: () => {},
		domWalkLimit: 2,
		setTimeoutFn: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		clearTimeoutFn: () => {}
	});

	probe.recordParentRenderPass({instance: {props: {}}}, {resolveScrollerElement: () => null});
	timers[0].callback();
	timers[1].callback();

	assert.equal(probe.list().filter(item => item.kind === "domFiberWalk").length, 2);
	assert.equal(timers.length, 2);
});

test("a configured sink receives the first evidence write immediately", () => {
	const writes = [];
	let clock = 1000;
	const probe = createSecondDebugProbe({
		log: () => {},
		now: () => clock,
		sink: text => writes.push(text),
		setTimeoutFn: () => 0,
		clearTimeoutFn: () => {}
	});

	probe.record("custom", {index: 1});

	assert.equal(writes.length, 1);
	const written = JSON.parse(writes[0]);
	assert.equal(written.marker, SECOND_DEBUG_MARKER);
	assert.equal(written.entries.length, 1);
});

test("rapid records are throttled into one trailing sink write carrying every entry", () => {
	const writes = [];
	const timers = [];
	let clock = 1000;
	const probe = createSecondDebugProbe({
		log: () => {},
		now: () => clock,
		flushIntervalMs: 1500,
		sink: text => writes.push(text),
		setTimeoutFn: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		clearTimeoutFn: handle => {timers[handle - 1] = null;}
	});

	probe.record("custom", {index: 1});
	assert.equal(writes.length, 1);

	clock = 1100;
	probe.record("custom", {index: 2});
	clock = 1200;
	probe.record("custom", {index: 3});
	assert.equal(writes.length, 1, "records inside the throttle window must not write again");

	const pending = timers.filter(Boolean);
	assert.equal(pending.length, 1, "one trailing flush is scheduled for the whole burst");
	assert.equal(pending[0].delay, 1400);

	clock = 2500;
	pending[0].callback();
	assert.equal(writes.length, 2);
	assert.equal(JSON.parse(writes[1]).entries.length, 3);
});

test("flush writes on demand and a failing sink never breaks recording", () => {
	let failing = true;
	const writes = [];
	const probe = createSecondDebugProbe({
		log: () => {},
		sink: text => {
			if (failing) throw new Error("disk full");
			writes.push(text);
		},
		setTimeoutFn: () => 0,
		clearTimeoutFn: () => {}
	});

	assert.doesNotThrow(() => probe.record("custom", {index: 1}));
	assert.equal(probe.list().length, 1);

	failing = false;
	probe.flush();
	assert.equal(writes.length, 1);
	assert.equal(JSON.parse(writes[0]).entries.length, 1);
});

test("the evidence sink writes beside BetterDiscord's data folder rather than the watched plugins folder", () => {
	const written = [];
	const created = [];
	const sink = createSecondDebugEvidenceSink({
		fs: {
			existsSync: () => false,
			mkdirSync: (directory, options) => created.push({directory, options}),
			writeFileSync: (file, text, encoding) => written.push({file, text, encoding})
		},
		path,
		pluginsFolder: path.join("C:", "BetterDiscord", "plugins")
	});

	sink("evidence");

	const expectedDirectory = path.join("C:", "BetterDiscord", "data");
	assert.deepEqual(created, [{directory: expectedDirectory, options: {recursive: true}}]);
	assert.equal(written.length, 1);
	assert.equal(written[0].file, path.join(expectedDirectory, "translator-second-debug.json"));
	assert.equal(written[0].text, "evidence");
	assert.equal(written[0].encoding, "utf8");
});

test("the evidence sink is absent when the host provides no filesystem or plugins folder", () => {
	assert.equal(createSecondDebugEvidenceSink({fs: null, path, pluginsFolder: "C:\\plugins"}), null);
	assert.equal(createSecondDebugEvidenceSink({fs: {writeFileSync: () => {}}, path, pluginsFolder: ""}), null);
});

test("getParentRenderCount counts every render pass including deduplicated repeats", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	const instance = {props: {channel: {id: "c"}, channelStream: []}};
	assert.equal(probe.getParentRenderCount(), 0);
	probe.recordParentRenderPass({instance});
	probe.recordParentRenderPass({instance});
	probe.recordParentRenderPass({instance: {props: {channel: {id: "c2"}, channelStream: []}}});
	assert.equal(probe.getParentRenderCount(), 3);
});

test("createMessageRefreshStrategies builds candidate strategies over the messages scroller fiber", () => {
	class Ancestor {
		forceUpdate() {}
	}
	function MessagesFn() {}
	const ancestorFiber = {tag: 1, type: Ancestor, stateNode: new Ancestor(), memoizedProps: {}, return: null};
	const ownerFiber = {tag: 0, type: MessagesFn, stateNode: null, memoizedProps: {channelStream: [1]}, return: ancestorFiber};
	const listFiber = {tag: 5, type: "div", stateNode: {}, memoizedProps: {}, return: ownerFiber};
	const element = {__reactFiber$k: listFiber};
	const forced = [];

	const strategies = createMessageRefreshStrategies({
		resolveScrollerElement: () => element,
		forceUpdate: (...targets) => forced.push(targets)
	});

	assert.ok(strategies.length >= 2);
	const names = strategies.map(strategy => strategy.name);
	assert.ok(names.includes("channelStreamOwnerFiber"));
	assert.ok(names.includes("nearestUpdateableAncestor"));

	strategies.find(strategy => strategy.name === "nearestUpdateableAncestor").run();
	assert.equal(forced.length, 1);
	assert.equal(forced[0][0], ancestorFiber.stateNode);
});

test("createMessageRefreshStrategies strategies throw a clear error when nothing is mounted", () => {
	const strategies = createMessageRefreshStrategies({resolveScrollerElement: () => null, forceUpdate: () => {}});
	for (const strategy of strategies) assert.throws(() => strategy.run(), /no (element|fiber|owner|ancestor)/i);
});

test("the refresh experiment runs each strategy sequentially and records the render-count delta", async () => {
	const probe = createSecondDebugProbe({log: () => {}});
	let renderCount = 0;
	const ran = [];
	const strategies = [
		{name: "forceUpdateAncestor", run: () => {ran.push("forceUpdateAncestor");}},
		{name: "forceUpdateOwner", run: () => {ran.push("forceUpdateOwner"); renderCount += 1;}}
	];

	await probe.runRefreshExperiment({
		strategies,
		getRenderCount: () => renderCount,
		waitForPaint: () => Promise.resolve()
	});

	assert.deepEqual(ran, ["forceUpdateAncestor", "forceUpdateOwner"]);
	const results = probe.list().filter(entry => entry.kind === "refreshExperiment");
	assert.equal(results.length, 2);
	assert.equal(results[0].strategy, "forceUpdateAncestor");
	assert.equal(results[0].renderedDelta, 0);
	assert.equal(results[0].caused, false);
	assert.equal(results[1].strategy, "forceUpdateOwner");
	assert.equal(results[1].renderedDelta, 1);
	assert.equal(results[1].caused, true);
});

test("the refresh experiment records a strategy that throws without aborting the run", async () => {
	const probe = createSecondDebugProbe({log: () => {}});
	let renderCount = 5;
	const strategies = [
		{name: "boom", run: () => {throw new Error("no handle");}},
		{name: "works", run: () => {renderCount += 2;}}
	];

	await probe.runRefreshExperiment({strategies, getRenderCount: () => renderCount, waitForPaint: () => Promise.resolve()});
	const results = probe.list().filter(entry => entry.kind === "refreshExperiment");

	assert.equal(results.length, 2);
	assert.equal(results[0].strategy, "boom");
	assert.equal(results[0].error, "no handle");
	assert.equal(results[0].caused, false);
	assert.equal(results[1].strategy, "works");
	assert.equal(results[1].caused, true);
});

test("installGlobal exposes a refresh experiment runner and dump/copy on the window object", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	const fakeWindow = {};
	probe.installGlobal(fakeWindow);
	assert.equal(typeof fakeWindow.TranslatorDebug.tryRefresh, "function");
});

test("installGlobal wires real refresh strategies and a render-count source into tryRefresh", async () => {
	const probe = createSecondDebugProbe({log: () => {}});
	class Ancestor {
		forceUpdate() {}
	}
	function MessagesFn() {}
	const ancestorFiber = {tag: 1, type: Ancestor, stateNode: new Ancestor(), memoizedProps: {}, return: null};
	const ownerFiber = {tag: 0, type: MessagesFn, stateNode: null, memoizedProps: {channelStream: [1]}, return: ancestorFiber};
	const listFiber = {tag: 5, type: "div", stateNode: {}, memoizedProps: {}, return: ownerFiber};
	const element = {__reactFiber$k: listFiber};
	const forced = [];
	let renderCount = 0;
	const fakeWindow = {};

	probe.installGlobal(fakeWindow, {
		resolveScrollerElement: () => element,
		forceUpdate: (...targets) => {forced.push(targets); renderCount += 1;},
		getRenderCount: () => renderCount,
		waitForPaint: () => Promise.resolve()
	});

	await fakeWindow.TranslatorDebug.tryRefresh();
	const results = probe.list().filter(entry => entry.kind === "refreshExperiment");
	assert.ok(results.length >= 3);
	assert.ok(results.every(result => typeof result.caused === "boolean"));
	assert.ok(forced.length >= 1);
});

test("autoRunExperiment waits for the scroller to mount, then runs the experiment exactly once", async () => {
	const timers = [];
	const probe = createSecondDebugProbe({
		log: () => {},
		setTimeoutFn: (callback, delay) => {timers.push({callback, delay}); return timers.length;},
		clearTimeoutFn: () => {}
	});
	class Ancestor {
		forceUpdate() {}
	}
	function MessagesFn() {}
	const ancestorFiber = {tag: 1, type: Ancestor, stateNode: new Ancestor(), memoizedProps: {}, return: null};
	const ownerFiber = {tag: 0, type: MessagesFn, stateNode: null, memoizedProps: {channelStream: [1]}, return: ancestorFiber};
	const listFiber = {tag: 5, type: "div", stateNode: {}, memoizedProps: {}, return: ownerFiber};
	let mounted = null;
	let renderCount = 0;

	probe.installGlobal({}, {
		resolveScrollerElement: () => mounted,
		forceUpdate: () => {renderCount += 1;},
		getRenderCount: () => renderCount,
		waitForPaint: () => Promise.resolve(),
		autoRunExperiment: true
	});

	assert.equal(timers.length, 1, "auto-run is scheduled, not immediate");
	await timers[0].callback();
	assert.equal(probe.list().filter(entry => entry.kind === "refreshExperiment").length, 0, "no experiment before the list mounts");
	assert.ok(timers.length >= 2, "a retry is scheduled while unmounted");

	mounted = {__reactFiber$k: listFiber};
	await timers[timers.length - 1].callback();
	const firstRunCount = probe.list().filter(entry => entry.kind === "refreshExperiment").length;
	assert.ok(firstRunCount >= 3, "all strategies ran once mounted");

	const timerCountAfterRun = timers.length;
	if (timers[timerCountAfterRun - 1]) await timers[timerCountAfterRun - 1].callback();
	assert.equal(probe.list().filter(entry => entry.kind === "refreshExperiment").length, firstRunCount, "the experiment does not run a second time");
});

test("installGlobal exposes dump and clipboard copy on the provided window object", () => {
	const probe = createSecondDebugProbe({log: () => {}});
	probe.record("custom", {index: 1});
	const copied = [];
	const fakeWindow = {DiscordNative: {clipboard: {copy: text => copied.push(text)}}};

	probe.installGlobal(fakeWindow);

	assert.equal(typeof fakeWindow.TranslatorDebug.dump, "function");
	assert.equal(typeof fakeWindow.TranslatorDebug.copy, "function");
	const message = fakeWindow.TranslatorDebug.copy();
	assert.equal(copied.length, 1);
	assert.equal(JSON.parse(copied[0]).marker, SECOND_DEBUG_MARKER);
	assert.match(message, /copied|已复制/i);
});
