const test = require("node:test");
const assert = require("node:assert/strict");
const {createSecondDebugProbe, SECOND_DEBUG_MARKER} = require("../../src/diagnostics/second-debug-probe");

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
