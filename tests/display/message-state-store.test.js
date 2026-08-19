const test = require("node:test");
const assert = require("node:assert/strict");
const {
	MESSAGE_STATUSES,
	RENDER_STATUSES,
	MESSAGE_ORIGINS,
	createMessageStateStore
} = require("../../src/display/message-state-store");

function snapshot(messageId, channelId, content, generation = 1) {
	return {
		messageId,
		channelId,
		generation,
		sourceSignature: `${channelId}:${messageId}:${content}`,
		source: {content, embeds: [{description: `${content} embed`}]}
	};
}

function translated(messageId, channelId, sourceContent, content, generation = 1, origin = "automatic", requestIdentity) {
	return {
		messageId,
		channelId,
		generation,
		sourceSignature: `${channelId}:${messageId}:${sourceContent}`,
		origin,
		requestIdentity,
		status: "translated",
		translation: {content}
	};
}

function unsupportedRequestIdentities() {
	return [
		["object", () => ({toString() {throw new Error("structured identities must not be coerced");}})],
		["array", () => ["request"]],
		["function", () => function requestIdentity() {}],
		["symbol", () => Symbol("request")]
	];
}

test("exports the complete message and render status vocabularies", () => {
	assert.deepEqual(MESSAGE_STATUSES, {
		IDLE: "idle",
		PENDING: "pending",
		TRANSLATING: "translating",
		TRANSLATED: "translated",
		SKIPPED: "skipped",
		FAILED: "failed",
		CANCELLED: "cancelled"
	});
	assert.deepEqual(RENDER_STATUSES, {
		IDLE: "idle",
		PENDING: "pending",
		CONFIRMED: "confirmed",
		UNCONFIRMED: "unconfirmed"
	});
	assert.equal(Object.isFrozen(MESSAGE_STATUSES), true);
	assert.equal(Object.isFrozen(RENDER_STATUSES), true);
});

test("translation commits never overwrite the immutable source", () => {
	const store = createMessageStateStore();
	const source = snapshot("m1", "c1", "Hello");
	const translation = {content: "你好", metadata: {language: "zh-CN"}};
	store.captureSource(source);
	store.commitResult({...translated("m1", "c1", "Hello", translation.content), translation});

	source.source.content = "mutated outside";
	source.source.embeds[0].description = "mutated embed";
	translation.content = "mutated translation";
	translation.metadata.language = "mutated language";

	const state = store.getDisplayState("m1");
	assert.equal(state.source.content, "Hello");
	assert.equal(state.source.embeds[0].description, "Hello embed");
	assert.equal(state.translation.content, "你好");
	assert.equal(state.translation.metadata.language, "zh-CN");
	assert.equal(state.status, "translated");
	assert.equal(Object.isFrozen(state), true);
	assert.equal(Object.isFrozen(state.source), true);
	assert.equal(Object.isFrozen(state.source.embeds), true);
	assert.equal(Object.isFrozen(state.source.embeds[0]), true);
	assert.equal(Object.isFrozen(state.translation), true);
	assert.equal(Object.isFrozen(state.translation.metadata), true);
});

test("an edited source replaces stale display state", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Before edit"));
	store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-1"});
	store.commitResult(translated("m1", "c1", "Before edit", "旧译文", 1, "automatic", "request-1"));
	const translatedRevision = store.getDisplayState("m1").revision;

	store.captureSource(snapshot("m1", "c1", "After edit"));

	const state = store.getDisplayState("m1");
	assert.equal(state.sourceSignature, "c1:m1:After edit");
	assert.equal(state.source.content, "After edit");
	assert.equal(state.translation, null);
	assert.equal(state.status, "idle");
	assert.equal(state.reason, null);
	assert.equal(state.origin, null);
	assert.equal(state.requestIdentity, null);
	assert.equal(state.renderStatus, "idle");
	assert.equal(state.renderReason, null);
	assert.equal(state.revision > translatedRevision, true);
});

test("a late result for an edited source cannot replace the newer request state", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Version one"));
	store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-A"});
	store.captureSource(snapshot("m1", "c1", "Version two"));
	const requestB = store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-B"});

	const committed = store.commitResult(translated("m1", "c1", "Version one", "late result A", 1, "automatic", "request-A"));

	assert.equal(committed, null);
	assert.equal(store.getDisplayState("m1"), requestB);
	assert.equal(requestB.source.content, "Version two");
	assert.equal(requestB.status, "pending");
	assert.equal(requestB.requestIdentity, "request-B");
	assert.equal(requestB.translation, null);
});

test("a superseded request cannot commit against an unchanged source", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Same source"));
	store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-A"});
	const requestB = store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-B"});

	assert.equal(store.commitResult(translated("m1", "c1", "Same source", "missing identity")), null);
	assert.equal(store.getDisplayState("m1"), requestB);
	assert.equal(store.commitResult(translated("m1", "c1", "Same source", "late result A", 1, "automatic", "request-A")), null);
	assert.equal(store.getDisplayState("m1"), requestB);
});

test("capturing the same source snapshot is idempotent", () => {
	const store = createMessageStateStore();
	const first = store.captureSource(snapshot("m1", "c1", "Hello"));
	const second = store.captureSource(snapshot("m1", "c1", "Hello"));

	assert.equal(second, first);
	assert.equal(second.revision, first.revision);
	assert.deepEqual(store.listChannel("c1"), [first]);
	assert.equal("records" in store, false);
	assert.equal("channelMessageIds" in store, false);
});

test("channel generations reject stale captures and commits", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	assert.equal(store.getChannelGeneration("c1"), 1);

	store.setChannelGeneration("c1", 2);

	assert.equal(store.getChannelGeneration("c1"), 2);
	assert.equal(store.captureSource(snapshot("m2", "c1", "Stale", 1)), null);
	assert.equal(store.commitResult(translated("m1", "c1", "Hello", "stale")), null);
	assert.equal(store.getDisplayState("m1").status, "idle");
	assert.equal(store.getDisplayState("m2"), null);
});

test("pending and translating transitions update request metadata and revision", () => {
	const store = createMessageStateStore();
	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));
	const pending = store.markPending({
		messageId: "m1",
		channelId: "c1",
		generation: 1,
		status: "pending",
		origin: "manual",
		requestIdentity: "pending-request"
	});

	assert.equal(pending.status, "pending");
	assert.equal(pending.origin, "manual");
	assert.equal(pending.requestIdentity, "pending-request");
	assert.equal(pending.renderStatus, "pending");
	assert.equal(pending.revision > captured.revision, true);

	const translating = store.markTranslating({
		messageId: "m1",
		channelId: "c1",
		generation: 1,
		status: "translating",
		origin: "automatic",
		requestIdentity: "translating-request"
	});

	assert.equal(translating.status, "translating");
	assert.equal(translating.origin, "automatic");
	assert.equal(translating.requestIdentity, "translating-request");
	assert.equal(translating.renderStatus, "pending");
	assert.equal(translating.revision > pending.revision, true);

	store.setChannelGeneration("c1", 2);
	assert.equal(store.markPending({messageId: "m1", channelId: "c1", generation: 1, status: "pending"}), null);
	assert.equal(store.markTranslating({messageId: "m1", channelId: "c2", generation: 1, status: "translating"}), null);
	assert.equal(store.getDisplayState("m1"), translating);
});

test("markPending rejects unsupported request identities without mutating state", () => {
	for (const [label, createIdentity] of unsupportedRequestIdentities()) {
		const store = createMessageStateStore();
		const messageId = `pending-${label}`;
		const captured = store.captureSource(snapshot(messageId, "c1", "Hello"));

		const result = store.markPending({messageId, channelId: "c1", generation: 1, origin: "automatic", requestIdentity: createIdentity()});

		assert.equal(result, null, label);
		assert.equal(store.getDisplayState(messageId), captured, label);
	}
});

test("explicit markTranslating rejects unsupported request identities without mutating state", () => {
	for (const [label, createIdentity] of unsupportedRequestIdentities()) {
		const store = createMessageStateStore();
		const messageId = `translating-${label}`;
		store.captureSource(snapshot(messageId, "c1", "Hello"));
		const pending = store.markPending({messageId, channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-A"});

		const result = store.markTranslating({messageId, channelId: "c1", generation: 1, origin: "automatic", requestIdentity: createIdentity()});

		assert.equal(result, null, label);
		assert.equal(store.getDisplayState(messageId), pending, label);
	}
});

test("terminal results reject unsupported request identities without mutating state", () => {
	for (const [label, createIdentity] of unsupportedRequestIdentities()) {
		const store = createMessageStateStore();
		const messageId = `terminal-${label}`;
		const captured = store.captureSource(snapshot(messageId, "c1", "Hello"));

		const result = store.commitResult(translated(messageId, "c1", "Hello", "你好", 1, "automatic", createIdentity()));

		assert.equal(result, null, label);
		assert.equal(store.getDisplayState(messageId), captured, label);
	}
});

test("primitive request identities normalize consistently across transitions and results", () => {
	const cases = [
		["number-to-string", 42, "42", "42"],
		["string-to-number", "7", 7, "7"],
		["bigint-to-string", 8n, "8", "8"],
		["boolean-to-string", true, "true", "true"]
	];

	for (const [label, pendingIdentity, resultIdentity, normalizedIdentity] of cases) {
		const store = createMessageStateStore();
		store.captureSource(snapshot(label, "c1", "Hello"));
		const pending = store.markPending({messageId: label, channelId: "c1", generation: 1, origin: "automatic", requestIdentity: pendingIdentity});

		assert.equal(pending.requestIdentity, normalizedIdentity, label);
		const translating = store.markTranslating({messageId: label, channelId: "c1", generation: 1, origin: "automatic"});
		assert.equal(translating.requestIdentity, normalizedIdentity, label);
		const committed = store.commitResult(translated(label, "c1", "Hello", "你好", 1, "automatic", resultIdentity));
		assert.equal(committed.status, "translated", label);
		assert.equal(committed.requestIdentity, null, label);
	}
});

test("nullish translating identities preserve active correlation", () => {
	for (const [label, requestIdentity] of [["null", null], ["undefined", undefined]]) {
		const deferredStore = createMessageStateStore();
		const deferredMessageId = `deferred-${label}`;
		deferredStore.captureSource(snapshot(deferredMessageId, "c1", "Hello"));
		const deferred = deferredStore.markPending({messageId: deferredMessageId, channelId: "c1", generation: 1, origin: "automatic", requestIdentity});
		assert.equal(deferred.requestIdentity, null, label);
		assert.equal(deferredStore.commitResult(translated(deferredMessageId, "c1", "Hello", "你好", 1, "automatic", requestIdentity)).status, "translated", label);

		const store = createMessageStateStore();
		store.captureSource(snapshot(label, "c1", "Hello"));
		store.markPending({messageId: label, channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-A"});

		const translating = store.markTranslating({messageId: label, channelId: "c1", generation: 1, origin: "automatic", requestIdentity});

		assert.equal(translating.requestIdentity, "request-A", label);
		assert.equal(store.commitResult(translated(label, "c1", "Hello", "stale", 1, "automatic", requestIdentity)), null, label);
		assert.equal(store.getDisplayState(label), translating, label);
		assert.equal(store.commitResult(translated(label, "c1", "Hello", "你好", 1, "automatic", "request-A")).status, "translated", label);
	}
});

test("commitResult accepts only valid terminal results", () => {
	const store = createMessageStateStore();
	for (const messageId of ["translated", "skipped", "failed", "cancelled", "pending", "invalid-translation", "stale-source"]) {
		store.captureSource(snapshot(messageId, "c1", `${messageId} source`));
	}

	assert.equal(store.commitResult(translated("translated", "c1", "translated source", "译文")).status, "translated");
	assert.equal(store.commitResult({messageId: "skipped", channelId: "c1", generation: 1, sourceSignature: "c1:skipped:skipped source", origin: "automatic", status: "skipped", reason: "same-language"}).reason, "same-language");
	assert.equal(store.commitResult({messageId: "failed", channelId: "c1", generation: 1, sourceSignature: "c1:failed:failed source", origin: "automatic", status: "failed"}).reason, "failed");
	assert.equal(store.commitResult({messageId: "cancelled", channelId: "c1", generation: 1, sourceSignature: "c1:cancelled:cancelled source", origin: "automatic", status: "cancelled", reason: "queue-cancelled"}).reason, "queue-cancelled");
	assert.equal(store.commitResult({messageId: "pending", channelId: "c1", generation: 1, sourceSignature: "c1:pending:pending source", origin: "automatic", status: "pending"}), null);
	assert.equal(store.commitResult({messageId: "invalid-translation", channelId: "c1", generation: 1, sourceSignature: "c1:invalid-translation:invalid-translation source", origin: "automatic", status: "translated", translation: {content: 42}}), null);
	assert.equal(store.commitResult(translated("stale-source", "c1", "older source", "stale translation")), null);
	assert.equal(store.getDisplayState("pending").status, "idle");
	assert.equal(store.getDisplayState("invalid-translation").status, "idle");
	assert.equal(store.getDisplayState("stale-source").status, "idle");
});

test("restoreChannel restores every translated origin in only the requested channel", () => {
	const store = createMessageStateStore();
	for (const [messageId, channelId, origin] of [["auto-a", "c1", "automatic"], ["manual-a", "c1", "manual"], ["auto-b", "c2", "automatic"]]) {
		store.captureSource(snapshot(messageId, channelId, `${messageId} source`));
		store.commitResult(translated(messageId, channelId, `${messageId} source`, `${messageId} translated`, 1, origin));
	}
	store.captureSource(snapshot("cancelled-a", "c1", "cancelled source"));
	store.commitResult({messageId: "cancelled-a", channelId: "c1", generation: 1, sourceSignature: "c1:cancelled-a:cancelled source", origin: "automatic", status: "cancelled", reason: "already-cancelled"});
	const cancelledRevision = store.getDisplayState("cancelled-a").revision;

	const restored = store.restoreChannel("c1");

	assert.deepEqual(restored.map(record => record.messageId), ["auto-a", "manual-a"]);
	assert.equal(store.getDisplayState("auto-a").status, "cancelled");
	assert.equal(store.getDisplayState("auto-a").translation, null);
	assert.equal(store.getDisplayState("auto-a").reason, "channel-disabled");
	assert.equal(store.getDisplayState("auto-a").renderStatus, "pending");
	assert.equal(store.getDisplayState("manual-a").status, "cancelled");
	assert.equal(store.getDisplayState("manual-a").translation, null);
	assert.equal(store.getDisplayState("manual-a").reason, "channel-disabled");
	assert.equal(store.getDisplayState("auto-b").translation.content, "auto-b translated");
	assert.equal(store.getDisplayState("cancelled-a").reason, "already-cancelled");
	assert.equal(store.getDisplayState("cancelled-a").revision, cancelledRevision);
});

test("restoreAll changes every non-cancelled record, manual included", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("translated-auto", "c1", "One"));
	store.commitResult(translated("translated-auto", "c1", "One", "一"));
	store.captureSource(snapshot("pending-auto", "c2", "Two"));
	store.markPending({messageId: "pending-auto", channelId: "c2", generation: 1, origin: "automatic", requestIdentity: "request-2"});
	store.captureSource(snapshot("translated-manual", "c2", "Three"));
	store.commitResult(translated("translated-manual", "c2", "Three", "三", 1, "manual"));
	store.captureSource(snapshot("cancelled-auto", "c3", "Four"));
	store.commitResult({messageId: "cancelled-auto", channelId: "c3", generation: 1, sourceSignature: "c3:cancelled-auto:Four", origin: "automatic", status: "cancelled", reason: "already-cancelled"});
	const cancelledRevision = store.getDisplayState("cancelled-auto").revision;

	const restored = store.restoreAll("plugin-stopped");

	// Stopping the plugin must leave nothing translated on screen. The legacy path
	// cleared manual translations too; now that they live here, restoreAll owns that.
	assert.deepEqual(restored.map(record => record.messageId), ["translated-auto", "pending-auto", "translated-manual"]);
	for (const messageId of ["translated-auto", "pending-auto", "translated-manual"]) {
		const state = store.getDisplayState(messageId);
		assert.equal(state.status, "cancelled");
		assert.equal(state.translation, null);
		assert.equal(state.reason, "plugin-stopped");
		assert.equal(state.renderStatus, "pending");
	}
	assert.equal(store.getDisplayState("cancelled-auto").revision, cancelledRevision);
});

test("commitBatch is all-or-nothing when one result is stale", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "One"));
	store.captureSource(snapshot("m2", "c1", "Two"));
	const revisions = [store.getDisplayState("m1").revision, store.getDisplayState("m2").revision];

	const outcome = store.commitBatch([
		translated("m1", "c1", "One", "一"),
		translated("m2", "c1", "Two", "二", 0)
	]);

	assert.deepEqual(outcome.committed, []);
	assert.deepEqual(outcome.rejected.map(result => result.messageId), ["m2"]);
	assert.equal(store.getDisplayState("m1").status, "idle");
	assert.equal(store.getDisplayState("m2").status, "idle");
	assert.deepEqual([store.getDisplayState("m1").revision, store.getDisplayState("m2").revision], revisions);
});

test("commitBatch rejects a stale request without applying valid sibling results", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "One"));
	store.captureSource(snapshot("m2", "c1", "Two"));
	const requestB = store.markPending({messageId: "m2", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-B"});
	const m1Revision = store.getDisplayState("m1").revision;

	const outcome = store.commitBatch([
		translated("m1", "c1", "One", "一"),
		translated("m2", "c1", "Two", "late result A", 1, "automatic", "request-A")
	]);

	assert.deepEqual(outcome.committed, []);
	assert.deepEqual(outcome.rejected.map(result => result.messageId), ["m2"]);
	assert.equal(store.getDisplayState("m1").status, "idle");
	assert.equal(store.getDisplayState("m1").revision, m1Revision);
	assert.equal(store.getDisplayState("m2"), requestB);
});

test("commitBatch rejects mixed-channel input without committing any result", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "One"));
	store.captureSource(snapshot("m2", "c2", "Two"));
	const results = [translated("m1", "c1", "One", "一"), translated("m2", "c2", "Two", "二")];

	const outcome = store.commitBatch(results);

	assert.deepEqual(outcome.committed, []);
	assert.deepEqual(outcome.rejected, results);
	assert.equal(store.getDisplayState("m1").status, "idle");
	assert.equal(store.getDisplayState("m2").status, "idle");
});

test("commitBatch accepts one valid channel and treats empty input as a no-op", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "One"));
	store.captureSource(snapshot("m2", "c1", "Two"));
	const revisionBeforeEmpty = store.getDisplayState("m2").revision;

	assert.deepEqual(store.commitBatch([]), {committed: [], rejected: []});
	assert.equal(store.getDisplayState("m2").revision, revisionBeforeEmpty);

	const outcome = store.commitBatch([translated("m1", "c1", "One", "一"), translated("m2", "c1", "Two", "二")]);
	assert.deepEqual(outcome.rejected, []);
	assert.deepEqual(outcome.committed.map(record => record.messageId), ["m1", "m2"]);
	assert.equal(store.getDisplayState("m1").translation.content, "一");
	assert.equal(store.getDisplayState("m2").translation.content, "二");
});

test("render acknowledgement does not create a new display revision", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(translated("m1", "c1", "Hello", "你好"));
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

test("a message identity cannot be silently moved to another channel", () => {
	const store = createMessageStateStore();
	const original = store.captureSource(snapshot("m1", "c1", "Channel one"));

	assert.equal(store.captureSource(snapshot("m1", "c2", "Channel two")), null);
	assert.equal(store.getDisplayState("m1"), original);
	assert.deepEqual(store.listChannel("c1"), [original]);
	assert.deepEqual(store.listChannel("c2"), []);
	assert.equal(store.getChannelGeneration("c2"), undefined);

	store.setChannelGeneration("c2", 1);
	assert.equal(store.commitResult(translated("m1", "c2", "Channel two", "wrong channel")), null);
	assert.equal(store.getDisplayState("m1"), original);
});

test("releasePending returns a matching pending request to idle without display change", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-1"});

	const released = store.releasePending({messageId: "m1", channelId: "c1", requestIdentity: "request-1"});

	assert.equal(released.status, "idle");
	assert.equal(released.requestIdentity, null);
	assert.equal(released.translation, null);
	assert.equal(store.getDisplayState("m1").status, "idle");
});

test("releasePending ignores mismatched identities and terminal records", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "request-1"});

	assert.equal(store.releasePending({messageId: "m1", channelId: "c1", requestIdentity: "request-other"}), null);
	assert.equal(store.getDisplayState("m1").status, "pending");

	store.commitResult({messageId: "m1", channelId: "c1", generation: 1, sourceSignature: "c1:m1:Hello", requestIdentity: "request-1", origin: "automatic", status: "translated", translation: {content: "你好"}});
	assert.equal(store.releasePending({messageId: "m1", channelId: "c1", requestIdentity: "request-1"}), null);
	assert.equal(store.getDisplayState("m1").status, "translated");
});

test("restoreMessage cancels one automatic record and leaves manual-origin records alone", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult({messageId: "m1", channelId: "c1", generation: 1, sourceSignature: "c1:m1:Hello", origin: "automatic", status: "translated", translation: {content: "你好"}});

	const restored = store.restoreMessage("m1");

	assert.equal(restored.length, 1);
	assert.equal(store.getDisplayState("m1").status, "cancelled");
	assert.equal(store.getDisplayState("m1").reason, "manual-untranslate");
	assert.equal(store.getDisplayState("m1").translation, null);
	assert.deepEqual(store.restoreMessage("missing"), []);
	assert.deepEqual(store.restoreMessage("m1"), []);
});

test("commitBatch rejects unrecorded results individually without discarding the batch", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "One"));

	const outcome = store.commitBatch([
		translated("m1", "c1", "One", "一"),
		{messageId: "never-captured", channelId: "c1", generation: 1, sourceSignature: "c1:never-captured:x", origin: "automatic", status: "translated", translation: {content: "孤儿"}}
	]);

	assert.deepEqual(outcome.committed.map(record => record.messageId), ["m1"]);
	assert.deepEqual(outcome.rejected.map(result => result.messageId), ["never-captured"]);
	assert.equal(store.getDisplayState("m1").status, "translated");
	assert.equal(store.getDisplayState("never-captured"), null);
});

function messageClone(messageId, channelId, content) {
	return {id: messageId, channel_id: channelId, content, timestamp: new Date(1700000000000), embeds: []};
}

function manualArchive(messageId, channelId, content) {
	return {
		message: messageClone(messageId, channelId, content),
		originalContentData: {content, embeds: [{description: `${content} embed`}]}
	};
}

function manualCommit(messageId, channelId, sourceContent, content, extra = {}) {
	return {
		...translated(messageId, channelId, sourceContent, content, 1, MESSAGE_ORIGINS.MANUAL),
		...extra
	};
}

test("exports the origin vocabulary the restore filters are keyed by", () => {
	assert.deepEqual(MESSAGE_ORIGINS, {AUTOMATIC: "automatic", MANUAL: "manual"});
	assert.equal(Object.isFrozen(MESSAGE_ORIGINS), true);
});

test("a manual request carries its origin and manual options through every transition", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));

	const pending = store.markPending({
		messageId: "m1",
		channelId: "c1",
		generation: 1,
		origin: "manual",
		manualOptions: {independentOfTextAreaSwitch: true},
		requestIdentity: "manual-1"
	});
	assert.equal(pending.origin, "manual");
	assert.deepEqual(pending.manualOptions, {independentOfTextAreaSwitch: true});
	assert.equal(Object.isFrozen(pending.manualOptions), true);

	const translating = store.markTranslating({messageId: "m1", channelId: "c1", generation: 1});
	assert.equal(translating.origin, "manual", "an omitted origin inherits the record origin");
	assert.deepEqual(translating.manualOptions, {independentOfTextAreaSwitch: true});

	const committed = store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {requestIdentity: "manual-1"}));
	assert.equal(committed.origin, "manual");
	assert.deepEqual(committed.manualOptions, {independentOfTextAreaSwitch: true}, "a commit without options inherits them");
});

test("an automatic record never carries manual options and unknown origins normalize", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	const pending = store.markPending({messageId: "m1", channelId: "c1", generation: 1, origin: "sideways", manualOptions: {independentOfTextAreaSwitch: true}});

	assert.equal(pending.origin, "automatic");
	assert.equal(pending.manualOptions, null);

	const committed = store.commitResult(translated("m1", "c1", "Hello", "你好"));
	assert.equal(committed.origin, "automatic");
	assert.equal(committed.manualOptions, null);
});

test("a manual commit defaults its manual options rather than leaving them unset", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));

	const committed = store.commitResult(manualCommit("m1", "c1", "Hello", "你好"));

	assert.deepEqual(committed.manualOptions, {independentOfTextAreaSwitch: false});
});

test("restoreChannel can still restore an explicit subset of origins", () => {
	const store = createMessageStateStore();
	for (const [messageId, origin] of [["auto-a", "automatic"], ["manual-a", "manual"]]) {
		store.captureSource(snapshot(messageId, "c1", `${messageId} source`));
		store.commitResult(translated(messageId, "c1", `${messageId} source`, `${messageId} translated`, 1, origin));
	}

	assert.deepEqual(store.restoreChannel("c1", "channel-disabled", {origins: ["automatic"]}).map(record => record.messageId), ["auto-a"]);
	assert.equal(store.getDisplayState("manual-a").translation.content, "manual-a translated");

	const explicit = store.restoreChannel("c1", "channel-disabled", {origins: ["manual"]});

	assert.deepEqual(explicit.map(record => record.messageId), ["manual-a"]);
	assert.equal(store.getDisplayState("manual-a").translation, null);
});

test("restoreMessage restores a manual translation so untranslate can undo it", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好"));

	const restored = store.restoreMessage("m1");

	assert.deepEqual(restored.map(record => record.messageId), ["m1"]);
	assert.equal(store.getDisplayState("m1").status, "cancelled");
	assert.equal(store.getDisplayState("m1").translation, null);
	assert.equal(store.getDisplayState("m1").reason, "manual-untranslate");
	assert.deepEqual(store.restoreMessage("m1", "manual-untranslate", {origins: ["automatic"]}), []);
});

test("restoreAll restores manual translations so a stopped plugin leaves nothing painted", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("auto-a", "c1", "One"));
	store.commitResult(translated("auto-a", "c1", "One", "一"));
	store.captureSource(snapshot("manual-a", "c2", "Two"));
	store.commitResult(manualCommit("manual-a", "c2", "Two", "二"));

	const restored = store.restoreAll();

	assert.deepEqual(restored.map(record => record.messageId), ["auto-a", "manual-a"]);
	assert.equal(store.getDisplayState("manual-a").translation, null);
	assert.equal(store.getDisplayState("manual-a").reason, "plugin-stopped");
});

test("restore leaves records that never carried a translation untouched", () => {
	const store = createMessageStateStore();
	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));

	assert.deepEqual(store.restoreAll(), []);
	assert.deepEqual(store.restoreChannel("c1"), []);
	assert.equal(store.getDisplayState("m1"), captured);
});

test("markPending refuses to leave a translated record without an explicit supersede", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	const committed = store.commitResult(translated("m1", "c1", "Hello", "你好"));

	const refused = store.markPending({messageId: "m1", channelId: "c1", generation: 1, requestIdentity: "boundary-reset"});

	assert.equal(refused, null);
	assert.equal(store.getDisplayState("m1"), committed);
	assert.equal(store.getDisplayState("m1").translation.content, "你好");

	const superseded = store.markPending({messageId: "m1", channelId: "c1", generation: 1, requestIdentity: "edit-requeue", supersede: true});

	assert.equal(superseded.status, "pending");
	assert.equal(superseded.translation, null);
	assert.equal(superseded.requestIdentity, "edit-requeue");
});

test("markPending still leaves every non-translated status without a supersede flag", () => {
	for (const [label, terminal] of [["skipped", "skipped"], ["failed", "failed"], ["cancelled", "cancelled"]]) {
		const store = createMessageStateStore();
		store.captureSource(snapshot(label, "c1", "Hello"));
		store.commitResult({messageId: label, channelId: "c1", generation: 1, sourceSignature: `c1:${label}:Hello`, origin: "automatic", status: terminal});

		assert.equal(store.markPending({messageId: label, channelId: "c1", generation: 1, requestIdentity: "retry"}).status, "pending", label);
	}
});

test("captureSource never mints a source archive", () => {
	const store = createMessageStateStore();
	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));

	assert.equal(captured.archive, null);
	assert.equal(store.hasSourceArchive("m1"), false);
	assert.equal(store.peekSourceArchive("m1"), null);
	assert.equal(store.consumeSourceArchive("m1"), null);
});

test("only a manual translation commit writes the source archive", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("auto", "c1", "Hello"));
	store.captureSource(snapshot("manual", "c1", "Hello"));

	const automatic = store.commitResult({...translated("auto", "c1", "Hello", "你好"), archive: manualArchive("auto", "c1", "Hello")});
	assert.equal(automatic.archive, null, "an automatic commit may not mint a restore token");

	const manual = store.commitResult(manualCommit("manual", "c1", "Hello", "你好", {archive: manualArchive("manual", "c1", "Hello")}));
	assert.equal(manual.archive.message.content, "Hello");
	assert.equal(manual.archive.message.channel_id, "c1");
	assert.equal(manual.archive.originalContentData.content, "Hello");
});

test("a non-translated manual result may not mint an archive", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));

	store.commitResult({
		messageId: "m1",
		channelId: "c1",
		generation: 1,
		sourceSignature: "c1:m1:Hello",
		origin: "manual",
		status: "skipped",
		reason: "same-language",
		archive: manualArchive("m1", "c1", "Hello")
	});

	assert.equal(store.hasSourceArchive("m1"), false);
});

test("the archive stays a frozen plain object the runtime can re-hydrate", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	const archive = manualArchive("m1", "c1", "Hello");
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive}));

	archive.message.content = "mutated outside";
	archive.originalContentData.content = "mutated data";

	const stored = store.peekSourceArchive("m1");
	assert.equal(stored.message.content, "Hello");
	assert.equal(stored.originalContentData.content, "Hello");
	assert.equal(Object.isFrozen(stored), true);
	assert.equal(Object.isFrozen(stored.message), true);
	assert.equal(Object.isFrozen(stored.originalContentData), true);
	assert.equal(Object.getPrototypeOf(stored.message), Object.prototype);
	// Deep freezing would rebuild this as a bare object and lose the value the clone needs.
	assert.equal(stored.message.timestamp instanceof Date, true);
});

test("an archive without a message clone is refused", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));

	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive: {originalContentData: {content: "Hello"}}}));

	assert.equal(store.hasSourceArchive("m1"), false);
});

test("peek leaves the archive in place and consume spends it exactly once", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive: manualArchive("m1", "c1", "Hello")}));

	assert.equal(store.peekSourceArchive("m1").message.content, "Hello");
	assert.equal(store.peekSourceArchive("m1").message.content, "Hello");
	assert.equal(store.hasSourceArchive("m1"), true);

	const consumed = store.consumeSourceArchive("m1");

	assert.equal(consumed.message.content, "Hello");
	assert.equal(store.hasSourceArchive("m1"), false);
	assert.equal(store.consumeSourceArchive("m1"), null);
	assert.equal(store.peekSourceArchive("m1"), null);
});

test("dropSourceArchive reports whether it had anything to drop", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive: manualArchive("m1", "c1", "Hello")}));

	assert.equal(store.dropSourceArchive("m1"), true);
	assert.equal(store.dropSourceArchive("m1"), false);
	assert.equal(store.dropSourceArchive("missing"), false);
});

test("archive traffic never advances the display revision", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive: manualArchive("m1", "c1", "Hello")}));
	const revision = store.getDisplayState("m1").revision;

	store.peekSourceArchive("m1");
	store.consumeSourceArchive("m1");

	assert.equal(store.getDisplayState("m1").revision, revision, "an in-flight render transaction must not go stale over scratch state");
});

test("an edited source keeps the archive the render still owes the reader", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Before edit"));
	store.commitResult(manualCommit("m1", "c1", "Before edit", "旧译文", {archive: manualArchive("m1", "c1", "Before edit")}));

	store.captureSource(snapshot("m1", "c1", "After edit"));

	assert.equal(store.getDisplayState("m1").translation, null);
	assert.equal(store.peekSourceArchive("m1").message.content, "Before edit", "the runtime drops the archive explicitly, capture does not");
});

test("clearDisplayedTranslation returns a record to idle and keeps the archive", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	const committed = store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive: manualArchive("m1", "c1", "Hello")}));

	const cleared = store.clearDisplayedTranslation("m1");

	assert.equal(cleared.status, "idle");
	assert.equal(cleared.translation, null);
	assert.equal(cleared.reason, null);
	assert.equal(cleared.origin, null);
	assert.equal(cleared.manualOptions, null);
	assert.equal(cleared.requestIdentity, null);
	assert.equal(cleared.renderStatus, "pending");
	assert.equal(cleared.revision > committed.revision, true);
	assert.equal(cleared.archive.message.content, "Hello");
	assert.equal(cleared.sourceSignature, committed.sourceSignature, "the source survives so the original can still paint");
});

test("clearDisplayedTranslation drops the archive only when told to", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive: manualArchive("m1", "c1", "Hello")}));

	assert.equal(store.clearDisplayedTranslation("m1", {preserveArchive: false}).archive, null);
});

test("clearDisplayedTranslation clears suppression unless asked to preserve it", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.suppress("m1");

	assert.equal(store.clearDisplayedTranslation("m1", {preserveSuppressed: true}).suppressed, true);
	assert.equal(store.clearDisplayedTranslation("m1").suppressed, false);
});

test("clearDisplayedTranslation leaves the reply preview alone unless asked", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "preview-sig", translation: {translatedContent: "你好"}});
	store.markPreviewPending({messageId: "m1", channelId: "c1", signature: "preview-sig"});

	assert.equal(store.clearDisplayedTranslation("m1").preview.translatedContent, "你好");

	const cleared = store.clearDisplayedTranslation("m1", {clearPreview: true});

	assert.equal(cleared.preview, null);
	assert.equal(cleared.previewSignature, null);
	assert.equal(cleared.previewPending, null);
});

test("clearDisplayedTranslation ignores a message this store never saw", () => {
	const store = createMessageStateStore();
	assert.equal(store.clearDisplayedTranslation("missing"), null);
});

test("suppress creates a suppression-only record for a message never captured", () => {
	const store = createMessageStateStore();

	const suppressed = store.suppress("m1");

	assert.equal(suppressed.messageId, "m1");
	assert.equal(suppressed.suppressed, true);
	assert.equal(suppressed.status, "idle");
	assert.equal(suppressed.translation, null);
	assert.equal(store.isSuppressed("m1"), true);
	assert.equal(store.isSuppressed("m2"), false);
});

test("a suppression-only record still accepts the capture that follows it", () => {
	const store = createMessageStateStore();
	store.suppress("m1", {channelId: "c1"});

	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));

	assert.equal(captured.source.content, "Hello");
	assert.equal(captured.suppressed, true, "capture must not undo standing user intent");
	assert.deepEqual(store.listChannel("c1").map(record => record.messageId), ["m1"]);
	assert.equal(store.commitResult(translated("m1", "c1", "Hello", "你好")).status, "translated");
});

test("a suppression-only record without a channel is claimed by its first capture", () => {
	const store = createMessageStateStore();
	store.suppress("m1");
	assert.deepEqual(store.listChannel(""), []);

	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));

	assert.equal(captured.channelId, "c1");
	assert.deepEqual(store.listChannel("c1").map(record => record.messageId), ["m1"]);
});

test("suppression survives the restore and the cancel that untranslate performs", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(translated("m1", "c1", "Hello", "你好"));
	store.suppress("m1");

	store.restoreMessage("m1");

	assert.equal(store.getDisplayState("m1").status, "cancelled");
	assert.equal(store.getDisplayState("m1").translation, null);
	assert.equal(store.isSuppressed("m1"), true, "a cleared suppression would immediately requeue the message");

	store.restoreChannel("c1");
	store.restoreAll();
	assert.equal(store.isSuppressed("m1"), true);
});

test("clearing a translation and restoring it are alternatives, not a sequence", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(translated("m1", "c1", "Hello", "你好"));
	store.clearDisplayedTranslation("m1", {preserveSuppressed: true});

	// The clear already returned the record to idle with no origin, so there is no
	// translation left for restore to cancel and no repaint for it to ask for.
	assert.deepEqual(store.restoreMessage("m1"), []);
	assert.equal(store.getDisplayState("m1").status, "idle");
});

test("a manual translation lifts the suppression the untranslate set", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.suppress("m1");

	assert.equal(store.commitResult(manualCommit("m1", "c1", "Hello", "你好")).suppressed, false);
});

test("an automatic commit leaves suppression exactly as it found it", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.suppress("m1");

	assert.equal(store.commitResult(translated("m1", "c1", "Hello", "你好")).suppressed, true);
});

test("suppression clears one message at a time or all at once", () => {
	const store = createMessageStateStore();
	store.suppress("m1", {channelId: "c1"});
	store.suppress("m2", {channelId: "c2"});

	assert.equal(store.clearSuppression("m1").suppressed, false);
	assert.equal(store.clearSuppression("m1"), null, "a record that is not suppressed reports no change");
	assert.equal(store.clearSuppression("missing"), null);

	assert.deepEqual(store.clearAllSuppression().map(record => record.messageId), ["m2"]);
	assert.equal(store.isSuppressed("m2"), false);
	assert.deepEqual(store.clearAllSuppression(), []);
});

test("channel suppression reset leaves every other channel untouched", () => {
	const store = createMessageStateStore();
	store.suppress("c1-a", {channelId: "c1"});
	store.suppress("c1-b", {channelId: "c1"});
	store.suppress("c2-a", {channelId: "c2"});

	assert.deepEqual(store.clearChannelSuppression("c1").map(record => record.messageId), ["c1-a", "c1-b"]);
	assert.equal(store.isSuppressed("c1-a"), false);
	assert.equal(store.isSuppressed("c1-b"), false);
	assert.equal(store.isSuppressed("c2-a"), true);
	assert.deepEqual(store.clearChannelSuppression("missing"), []);
});

test("suppression traffic never advances the display revision", () => {
	const store = createMessageStateStore();
	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));

	store.suppress("m1");
	store.clearSuppression("m1");

	assert.equal(store.getDisplayState("m1").revision, captured.revision);
});

test("suppress refuses an empty message identity", () => {
	const store = createMessageStateStore();
	assert.equal(store.suppress(""), null);
	assert.equal(store.suppress(null), null);
});

test("a preview commit projects onto the same record as the message translation", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));

	const record = store.commitPreviewResult({
		messageId: "m1",
		channelId: "c1",
		signature: "preview-signature",
		translation: {translatedContent: "你好", originalContent: "Hello", auto: true}
	});

	assert.equal(record.preview.translatedContent, "你好");
	assert.equal(record.preview.channelId, "c1");
	assert.equal(record.previewSignature, "preview-signature");
	assert.equal(Object.isFrozen(record.preview), true);
	assert.equal(store.getDisplayState("m1").sourceSignature, "c1:m1:Hello", "the preview signature is a separate field");
});

test("the preview signature is never measured against the source signature", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "preview-only-content", translation: {translatedContent: "你好"}});

	// The source signature hashes embeds too, so an embed-only change must not evict a
	// preview that is still correct for the content it was hashed over.
	store.captureSource({...snapshot("m1", "c1", "Hello"), sourceSignature: "c1:m1:Hello+embed"});

	assert.equal(store.getPreviewTranslation("m1", {signature: "preview-only-content"}).translatedContent, "你好");
	assert.equal(store.getPreviewTranslation("m1", {signature: "c1:m1:Hello+embed"}), null, "the source signature can never validate a preview");
});

test("a preview read with a stale signature drops the preview", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-1", translation: {translatedContent: "你好"}});

	assert.equal(store.getPreviewTranslation("m1").translatedContent, "你好", "an unchecked read never evicts");
	assert.equal(store.getPreviewTranslation("m1", {signature: "sig-2"}), null);
	assert.equal(store.getDisplayState("m1").preview, null);
	assert.equal(store.getDisplayState("m1").previewSignature, null);
	assert.equal(store.getPreviewTranslation("missing"), null);
});

test("clearing a preview retains only a restore candidate until a newer preview commits", () => {
	const store = createMessageStateStore();
	store.capturePreviewSource({messageId: "m1", channelId: "c1", sourceSignature: "source", source: {content: "Hello"}});
	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-1", translation: {translatedContent: "旧译文", originalContent: "Hello", auto: true}});

	store.clearPreview("m1");

	assert.equal(store.getReplyPreviewProjection("m1").translation, null, "a restore candidate is never an active translation");
	assert.deepEqual(store.getPreviewCandidates("m1").map(candidate => candidate.translatedContent), ["旧译文"]);

	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-2", translation: {translatedContent: "新译文", originalContent: "Hello", auto: true}});
	assert.deepEqual(store.getPreviewCandidates("m1").map(candidate => candidate.translatedContent), ["新译文"]);
});

test("preview candidates and the reply projection resolve in opposite directions", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-1", translation: {translatedContent: "preview 你好"}});
	store.commitResult(translated("m1", "c1", "Hello", "message 你好"));

	assert.deepEqual(store.getPreviewCandidates("m1").map(candidate => candidate.translatedContent || candidate.content), ["preview 你好", "message 你好"]);

	const projection = store.getReplyPreviewProjection("m1");

	assert.equal(projection.translation.content, "message 你好");
	assert.equal(projection.fromPreview, false);
	assert.equal(projection.channelId, "c1");
});

test("the reply projection falls back to the preview when no message translation displays", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-1", translation: {translatedContent: "preview 你好"}});

	const projection = store.getReplyPreviewProjection("m1");

	assert.equal(projection.translation.translatedContent, "preview 你好");
	assert.equal(projection.fromPreview, true);
	assert.deepEqual(store.getPreviewCandidates("m1").map(candidate => candidate.translatedContent), ["preview 你好"]);
});

test("a cancelled record keeps a restore candidate without exposing an active reply translation", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(translated("m1", "c1", "Hello", "你好"));
	store.restoreMessage("m1");

	assert.deepEqual(store.getPreviewCandidates("m1").map(candidate => candidate.content), ["你好"]);
	assert.equal(store.getReplyPreviewProjection("m1").translation, null);
	assert.deepEqual(store.getPreviewCandidates("missing"), []);
	assert.equal(store.getReplyPreviewProjection("missing"), null);
});

test("the reply projection reports origin, manual options and suppression", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {manualOptions: {independentOfTextAreaSwitch: true}}));
	store.suppress("m1");

	const projection = store.getReplyPreviewProjection("m1", {channelId: "c9"});

	assert.equal(projection.origin, "manual");
	assert.deepEqual(projection.manualOptions, {independentOfTextAreaSwitch: true});
	assert.equal(projection.suppressed, true);
	assert.equal(projection.channelId, "c9", "an explicit channel always wins");
	assert.equal(Object.isFrozen(projection), true);
});

test("a preview commit for a message the stream never captured still lands", () => {
	const store = createMessageStateStore();

	const record = store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-1", translation: {translatedContent: "你好"}});

	assert.equal(record.messageId, "m1");
	assert.equal(record.channelId, "c1");
	assert.equal(record.preview.channelId, "c1");
	assert.deepEqual(store.listChannel("c1").map(item => item.messageId), ["m1"]);
});

test("a preview commit without a usable translation is refused", () => {
	const store = createMessageStateStore();

	assert.equal(store.commitPreviewResult(null), null);
	assert.equal(store.commitPreviewResult({messageId: "m1", channelId: "c1"}), null);
	assert.equal(store.commitPreviewResult({messageId: "", channelId: "c1", translation: {translatedContent: "x"}}), null);
	assert.equal(store.getDisplayState("m1"), null);
});

test("preview state never advances the display revision", () => {
	const store = createMessageStateStore();
	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));

	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-1", translation: {translatedContent: "你好"}});
	store.markPreviewPending({messageId: "m1", channelId: "c1", signature: "sig-2"});
	store.clearPreview("m1");

	assert.equal(store.getDisplayState("m1").revision, captured.revision, "a reply header repaint must not invalidate a message render transaction");
});

test("a preview request holds the pending slot until its own token releases it", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));

	const token = store.markPreviewPending({messageId: "m1", channelId: "c1", signature: "sig-1"});

	assert.equal(typeof token, "string");
	assert.equal(store.isPreviewPending("m1"), true);
	assert.deepEqual(store.getPreviewPending("m1"), {token, channelId: "c1", signature: "sig-1"});
	assert.equal(Object.isFrozen(store.getPreviewPending("m1")), true);

	assert.equal(store.releasePreviewPending("m1", token), true);
	assert.equal(store.isPreviewPending("m1"), false);
	assert.equal(store.releasePreviewPending("m1", token), false);
});

test("a superseded preview request cannot release the slot its successor owns", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	const first = store.markPreviewPending({messageId: "m1", channelId: "c1", signature: "sig-1"});
	const second = store.markPreviewPending({messageId: "m1", channelId: "c1", signature: "sig-2"});

	assert.notEqual(first, second);
	assert.equal(store.releasePreviewPending("m1", first), false);
	assert.equal(store.isPreviewPending("m1"), true);
	assert.equal(store.getPreviewPending("m1").signature, "sig-2");
	assert.equal(store.releasePreviewPending("m1", second), true);
});

test("releasing without a token clears whatever is pending", () => {
	const store = createMessageStateStore();
	store.markPreviewPending({messageId: "m1", channelId: "c1", signature: "sig-1"});

	assert.equal(store.releasePreviewPending("m1"), true);
	assert.equal(store.releasePreviewPending("m1"), false);
	assert.equal(store.releasePreviewPending("missing"), false);
});

test("a committed preview retires the pending slot it was waiting on", () => {
	const store = createMessageStateStore();
	store.markPreviewPending({messageId: "m1", channelId: "c1", signature: "sig-1"});

	store.commitPreviewResult({messageId: "m1", channelId: "c1", signature: "sig-1", translation: {translatedContent: "你好"}});

	assert.equal(store.isPreviewPending("m1"), false);
});

test("markPreviewPending refuses an empty message identity", () => {
	const store = createMessageStateStore();
	assert.equal(store.markPreviewPending(null), null);
	assert.equal(store.markPreviewPending({messageId: "", channelId: "c1"}), null);
});

test("previews clear per message and per channel", () => {
	const store = createMessageStateStore();
	for (const [messageId, channelId] of [["m1", "c1"], ["m2", "c1"], ["m3", "c2"]]) {
		store.commitPreviewResult({messageId, channelId, signature: `sig-${messageId}`, translation: {translatedContent: `${messageId} 你好`}});
		store.markPreviewPending({messageId, channelId, signature: `sig-${messageId}`});
	}

	assert.deepEqual(store.clearPreviews("c1").map(record => record.messageId), ["m1", "m2"]);
	assert.equal(store.getDisplayState("m1").preview, null);
	assert.equal(store.getDisplayState("m1").previewPending, null);
	assert.equal(store.getDisplayState("m3").preview.translatedContent, "m3 你好");

	assert.equal(store.clearPreview("m3").preview, null);
	assert.equal(store.clearPreview("m3"), null);
	assert.equal(store.clearPreview("missing"), null);
	assert.deepEqual(store.clearPreviews(), []);
});

test("listPreviewed reports every record carrying preview state", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("plain", "c1", "Hello"));
	store.commitPreviewResult({messageId: "with-preview", channelId: "c1", signature: "sig", translation: {translatedContent: "你好"}});
	store.markPreviewPending({messageId: "with-pending", channelId: "c1", signature: "sig"});

	assert.deepEqual(store.listPreviewed().map(record => record.messageId), ["with-preview", "with-pending"]);
});

test("capturePreviewSource seeds a record for a message the stream never delivered", () => {
	const store = createMessageStateStore();

	const record = store.capturePreviewSource({
		messageId: "m1",
		channelId: "c1",
		sourceSignature: "preview-source",
		source: {content: "Hello"}
	});

	assert.equal(record.messageId, "m1");
	assert.equal(record.channelId, "c1");
	assert.equal(record.generation, 1, "an absent channel generation defaults the way a commit would");
	assert.equal(record.source.content, "Hello");
	assert.equal(record.status, "idle");
	assert.equal(store.getChannelGeneration("c1"), 1);
	assert.deepEqual(store.listChannel("c1").map(item => item.messageId), ["m1"]);
});

test("capturePreviewSource adopts the channel generation already in force", () => {
	const store = createMessageStateStore();
	store.setChannelGeneration("c1", 7);

	const record = store.capturePreviewSource({messageId: "m1", channelId: "c1", sourceSignature: "preview-source", source: {content: "Hello"}});

	assert.equal(record.generation, 7);
	assert.equal(store.commitResult({...translated("m1", "c1", "x", "你好", 7), sourceSignature: "preview-source"}).status, "translated");
});

test("capturePreviewSource never overwrites a source or translation the stream owns", () => {
	const store = createMessageStateStore();
	const captured = store.captureSource(snapshot("m1", "c1", "Hello"));

	assert.equal(store.capturePreviewSource({messageId: "m1", channelId: "c1", sourceSignature: "preview-source", source: {content: "Preview"}}), captured);
	assert.equal(store.getDisplayState("m1").source.content, "Hello");

	store.commitResult(translated("m1", "c1", "Hello", "你好"));
	store.capturePreviewSource({messageId: "m1", channelId: "c1", sourceSignature: "preview-source", source: {content: "Preview"}});

	assert.equal(store.getDisplayState("m1").translation.content, "你好");
	assert.equal(store.getDisplayState("m1").sourceSignature, "c1:m1:Hello");
});

test("capturePreviewSource fills in a suppression-only record without losing it", () => {
	const store = createMessageStateStore();
	store.suppress("m1");

	const record = store.capturePreviewSource({messageId: "m1", channelId: "c1", sourceSignature: "preview-source", source: {content: "Hello"}});

	assert.equal(record.suppressed, true);
	assert.equal(record.source.content, "Hello");
});

test("capturePreviewSource refuses to move a message to another channel", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));

	assert.equal(store.capturePreviewSource({messageId: "m1", channelId: "c2", sourceSignature: "preview-source"}), null);
	assert.equal(store.capturePreviewSource({messageId: "", channelId: "c1"}), null);
	assert.equal(store.capturePreviewSource(null), null);
});

test("reply preview eligibility is keyed by channel and base message", () => {
	const store = createMessageStateStore();

	assert.equal(store.markPreviewEligible("c1", "base-1"), true);
	store.markPreviewEligible("c1", "base-2");
	store.markPreviewEligible("c2", "base-1");

	assert.equal(store.isPreviewEligible("c1", "base-1"), true);
	assert.equal(store.isPreviewEligible("c2", "base-2"), false);
	assert.equal(store.isPreviewEligible("c1", "missing"), false);
	assert.equal(store.markPreviewEligible("", "base-1"), false);
	assert.equal(store.markPreviewEligible("c1", ""), false);
	assert.equal(store.isPreviewEligible(null, null), false);
});

test("reply preview host ownership is one-to-many and channel-isolated", () => {
	const store = createMessageStateStore();

	assert.equal(store.markPreviewHost("c1", "referenced", "reply-1"), true);
	store.markPreviewHost("c1", "referenced", "reply-2");
	store.markPreviewHost("c1", "referenced", "reply-1");
	store.markPreviewHost("c2", "referenced", "reply-3");

	assert.deepEqual(store.getPreviewHostMessageIds("c1", ["referenced"]), ["reply-1", "reply-2"]);
	assert.deepEqual(store.getPreviewHostMessageIds("c2"), ["reply-3"]);
	assert.equal(store.markPreviewHost("", "referenced", "reply"), false);
	assert.equal(store.markPreviewHost("c1", "", "reply"), false);
	assert.equal(store.markPreviewHost("c1", "referenced", ""), false);
});

test("clearing preview state retires only its recorded host rows", () => {
	const store = createMessageStateStore();
	for (const [messageId, channelId] of [["referenced-1", "c1"], ["referenced-2", "c1"], ["referenced-3", "c2"]]) {
		store.commitPreviewResult({messageId, channelId, signature: messageId, translation: {translatedContent: messageId}});
		store.markPreviewHost(channelId, messageId, `host-${messageId}`);
	}

	store.clearPreview("referenced-1");
	assert.deepEqual(store.getPreviewHostMessageIds("c1"), ["host-referenced-2"]);
	store.clearPreviews("c1");
	assert.deepEqual(store.getPreviewHostMessageIds("c1"), []);
	assert.deepEqual(store.getPreviewHostMessageIds("c2"), ["host-referenced-3"]);
	store.pruneChannel("c2");
	assert.deepEqual(store.getPreviewHostMessageIds("c2"), []);
});

test("deleting one message removes its state and reply ownership without crossing channels", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("referenced", "c1", "source"));
	store.commitPreviewResult({messageId: "referenced", channelId: "c1", signature: "sig", translation: {translatedContent: "preview"}});
	store.markPreviewHost("c1", "referenced", "reply-1");
	store.markPreviewHost("c1", "referenced", "reply-2");
	store.markPreviewEligible("c1", "reply-1");
	store.captureSource(snapshot("other", "c2", "other source"));
	store.markPreviewHost("c2", "other", "other-reply");

	assert.equal(store.deleteMessage("reply-1", "wrong-channel"), false, "a mismatched channel cannot delete ownership");
	assert.equal(store.deleteMessage("reply-1", "c1"), true);
	assert.deepEqual(store.getPreviewHostMessageIds("c1", ["referenced"]), ["reply-2"]);
	assert.equal(store.isPreviewEligible("c1", "reply-1"), false);

	assert.equal(store.deleteMessage("referenced", "c1"), true);
	assert.equal(store.getDisplayState("referenced"), null);
	assert.deepEqual(store.getPreviewHostMessageIds("c1"), []);
	assert.equal(store.getChannelGeneration("c1"), undefined, "deleting the final record releases its generation");
	assert.equal(store.getDisplayState("other").channelId, "c2");
	assert.deepEqual(store.getPreviewHostMessageIds("c2"), ["other-reply"]);
});

test("eligibility is not a record flag and clears per channel or entirely", () => {
	const store = createMessageStateStore();
	store.markPreviewEligible("c1", "base-1");
	store.markPreviewEligible("c2", "base-2");

	assert.equal(store.getDisplayState("base-1"), null, "marking eligibility must not mint a record");

	store.clearPreviewEligibility("c1");

	assert.equal(store.isPreviewEligible("c1", "base-1"), false);
	assert.equal(store.isPreviewEligible("c2", "base-2"), true);

	store.clearPreviewEligibility();

	assert.equal(store.isPreviewEligible("c2", "base-2"), false);
});

test("resolveChannelId walks the five sources in order", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "cRecord", "Hello"));

	assert.equal(store.resolveChannelId("m1", {fallbackChannelId: "cExplicit", translation: {channelId: "cArgument"}}), "cExplicit");
	assert.equal(store.resolveChannelId("m1", {translation: {channelId: "cArgument"}}), "cArgument");
	assert.equal(store.resolveChannelId("m1"), null, "a record with nothing stored resolves to nothing");

	store.commitResult({...translated("m1", "cRecord", "Hello", "你好"), translation: {content: "你好", channelId: "cTranslation"}});
	assert.equal(store.resolveChannelId("m1"), "cTranslation");

	store.clearDisplayedTranslation("m1");
	store.commitPreviewResult({messageId: "m1", channelId: "cPreview", signature: "sig", translation: {translatedContent: "你好", channelId: "cPreview"}});
	assert.equal(store.resolveChannelId("m1"), "cPreview");

	store.clearPreview("m1");
	assert.equal(store.resolveChannelId("m1"), null);
});

test("resolveChannelId falls back to the archived message clone", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(manualCommit("m1", "c1", "Hello", "你好", {archive: manualArchive("m1", "cArchive", "Hello")}));
	store.clearDisplayedTranslation("m1");

	assert.equal(store.resolveChannelId("m1"), "cArchive");

	store.dropSourceArchive("m1");
	assert.equal(store.resolveChannelId("m1"), null);
});

test("resolveChannelId honours an explicit channel even for an unknown message", () => {
	const store = createMessageStateStore();

	assert.equal(store.resolveChannelId("missing", {fallbackChannelId: "c1"}), "c1");
	assert.equal(store.resolveChannelId("missing", {translation: {channelId: "c2"}}), "c2");
	assert.equal(store.resolveChannelId("missing"), null);
	assert.equal(store.resolveChannelId("missing", {}), null);
});

test("listTranslated reports exactly the records that display a translation", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("idle", "c1", "One"));
	store.captureSource(snapshot("auto", "c1", "Two"));
	store.commitResult(translated("auto", "c1", "Two", "二"));
	store.captureSource(snapshot("manual", "c2", "Three"));
	store.commitResult(manualCommit("manual", "c2", "Three", "三"));
	store.captureSource(snapshot("skipped", "c2", "Four"));
	store.commitResult({messageId: "skipped", channelId: "c2", generation: 1, sourceSignature: "c2:skipped:Four", origin: "automatic", status: "skipped"});

	assert.deepEqual(store.listTranslated().map(record => record.messageId), ["auto", "manual"]);

	store.restoreAll();

	assert.deepEqual(store.listTranslated(), []);
});

test("a manual translation commits for a message the automatic pipeline never captured", () => {
	const store = createMessageStateStore();

	const record = store.commitManualTranslation({
		messageId: "m1",
		channelId: "c1",
		translation: {content: "你好", translatedContent: "你好", originalContent: "Hello"},
		manualOptions: {independentOfTextAreaSwitch: true},
		archive: manualArchive("m1", "c1", "Hello")
	});

	assert.equal(record.status, "translated");
	assert.equal(record.origin, "manual");
	assert.equal(record.translation.content, "你好");
	assert.deepEqual(record.manualOptions, {independentOfTextAreaSwitch: true});
	assert.equal(record.archive.message.content, "Hello");
	assert.equal(record.renderStatus, "pending");
	assert.deepEqual(store.listTranslated().map(item => item.messageId), ["m1"]);
	assert.deepEqual(store.listChannel("c1").map(item => item.messageId), ["m1"]);
});

test("a manual translation lifts suppression and keeps an archive it was not given", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitManualTranslation({messageId: "m1", channelId: "c1", translation: {content: "你好"}, archive: manualArchive("m1", "c1", "Hello")});
	store.suppress("m1");

	const recommitted = store.commitManualTranslation({messageId: "m1", channelId: "c1", translation: {content: "你好 2"}});

	assert.equal(recommitted.suppressed, false);
	assert.equal(recommitted.archive.message.content, "Hello");
	assert.equal(recommitted.translation.content, "你好 2");
});

test("a manual translation without usable content is refused", () => {
	const store = createMessageStateStore();

	assert.equal(store.commitManualTranslation(null), null);
	assert.equal(store.commitManualTranslation({messageId: "m1", channelId: "c1"}), null);
	assert.equal(store.commitManualTranslation({messageId: "m1", channelId: "c1", translation: {content: 42}}), null);
	assert.equal(store.commitManualTranslation({messageId: "", channelId: "c1", translation: {content: "x"}}), null);
	assert.equal(store.getDisplayState("m1"), null);
});

test("a manual translation is restorable and clearable like any other record", () => {
	const store = createMessageStateStore();
	store.commitManualTranslation({messageId: "m1", channelId: "c1", translation: {content: "你好"}, archive: manualArchive("m1", "c1", "Hello")});

	assert.deepEqual(store.restoreChannel("c1", "automatic-only", {origins: ["automatic"]}), [], "an explicit automatic-only restore leaves a manual translation alone");
	assert.deepEqual(store.restoreMessage("m1").map(record => record.messageId), ["m1"]);
	assert.equal(store.getDisplayState("m1").status, "cancelled");
	assert.equal(store.peekSourceArchive("m1").message.content, "Hello");
});

test("a manual translation survives the source capture that follows it", () => {
	const store = createMessageStateStore();
	store.commitManualTranslation({messageId: "m1", channelId: "c1", translation: {content: "你好"}});

	// The manual record carries no generation, so an automatic commit stays rejected until
	// the channel stream captures a real source for it.
	assert.equal(store.commitResult(translated("m1", "c1", "Hello", "auto")), null);

	// Capturing must not discard it. A manual translation is standing user intent: the
	// legacy path kept it across every render and refused to auto-translate over it, and
	// only an explicit untranslate ends one.
	store.captureSource(snapshot("m1", "c1", "Hello"));
	assert.equal(store.getDisplayState("m1").translation.content, "你好");
	assert.equal(store.getDisplayState("m1").origin, "manual");

	store.clearDisplayedTranslation("m1");
	assert.equal(store.getDisplayState("m1").translation, null);
	assert.equal(store.commitResult(translated("m1", "c1", "Hello", "auto")).status, "translated");
});

test("pruning a left channel drops only recoverable automatic display records", () => {
	const store = createMessageStateStore();
	for (const messageId of ["idle", "translated", "skipped", "failed", "pending", "manual", "suppressed"]) {
		store.captureSource(snapshot(messageId, "c1", `${messageId} source`));
	}
	store.capturePreviewSource(snapshot("preview-only", "c1", "preview source"));
	store.commitPreviewResult({messageId: "preview-only", channelId: "c1", signature: "preview", translation: {content: "预览译文"}});
	store.commitResult(translated("translated", "c1", "translated source", "译文"));
	store.commitResult({...translated("skipped", "c1", "skipped source", ""), status: "skipped", reason: "same-language", translation: undefined});
	store.commitResult({...translated("failed", "c1", "failed source", ""), status: "failed", reason: "provider-failed", translation: undefined});
	store.markPending({messageId: "pending", channelId: "c1", generation: 1, origin: "automatic", requestIdentity: "pending-1"});
	store.commitManualTranslation({messageId: "manual", channelId: "c1", translation: {content: "手动译文"}});
	store.suppress("suppressed", {channelId: "c1"});
	store.captureSource(snapshot("other-channel", "c2", "other source"));
	store.commitResult(translated("other-channel", "c2", "other source", "其他译文"));

	const pruned = store.pruneChannel("c1");

	assert.deepEqual(pruned.map(record => record.messageId).sort(), ["failed", "idle", "preview-only", "skipped", "translated"]);
	assert.equal(store.getDisplayState("idle"), null);
	assert.equal(store.getDisplayState("translated"), null);
	assert.equal(store.getDisplayState("skipped"), null);
	assert.equal(store.getDisplayState("failed"), null);
	assert.equal(store.getDisplayState("preview-only"), null);
	assert.equal(store.getDisplayState("pending").status, MESSAGE_STATUSES.PENDING);
	assert.equal(store.getDisplayState("manual").origin, MESSAGE_ORIGINS.MANUAL);
	assert.equal(store.isSuppressed("suppressed"), true);
	assert.equal(store.getDisplayState("other-channel").channelId, "c2");
	assert.equal(store.getChannelGeneration("c1"), 1, "retained in-flight or user state keeps the channel generation");
});

test("pruning the last record releases the channel generation and index", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("only-message", "c1", "source"));

	assert.deepEqual(store.pruneChannel("c1").map(record => record.messageId), ["only-message"]);
	assert.equal(store.getChannelGeneration("c1"), undefined);
	assert.deepEqual(store.listChannel("c1"), []);
});

test("channel pruning preserves automatic records that still own restore state", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("archived", "c1", "original"));
	store.commitManualTranslation({
		messageId: "archived",
		channelId: "c1",
		translation: {content: "manual"},
		archive: {message: {id: "archived", channel_id: "c1", content: "original"}}
	});
	store.clearDisplayedTranslation("archived", {preserveArchive: true});

	assert.deepEqual(store.pruneChannel("c1"), []);
	assert.equal(store.hasSourceArchive("archived"), true);
});

test("channel pruning releases confirmed restores and all session-only preview eligibility", () => {
	const store = createMessageStateStore();
	for (const messageId of ["confirmed-restore", "unconfirmed-restore"]) {
		store.captureSource(snapshot(messageId, "c1", `${messageId} source`));
		store.commitResult(translated(messageId, "c1", `${messageId} source`, `${messageId} translated`));
	}
	store.restoreChannel("c1");
	store.markRenderOutcome({confirmedIds: ["confirmed-restore"], missingIds: ["unconfirmed-restore"]});
	store.commitManualTranslation({messageId: "manual", channelId: "c1", translation: {content: "manual"}});
	store.markPreviewEligible("c1", "base-message");

	assert.deepEqual(store.pruneChannel("c1").map(record => record.messageId), ["confirmed-restore"]);
	assert.equal(store.getDisplayState("confirmed-restore"), null);
	assert.equal(store.getDisplayState("unconfirmed-restore").status, MESSAGE_STATUSES.CANCELLED);
	assert.equal(store.isPreviewEligible("c1", "base-message"), false);
});

test("channel pruning releases a confirmed manual restore after its archive is consumed", () => {
	const store = createMessageStateStore();
	store.captureSource(snapshot("manual", "c1", "original"));
	store.commitManualTranslation({
		messageId: "manual",
		channelId: "c1",
		translation: {content: "手动译文"},
		archive: manualArchive("manual", "c1", "original")
	});
	store.restoreChannel("c1");
	store.markRenderOutcome({confirmedIds: ["manual"], missingIds: []});
	store.consumeSourceArchive("manual");

	assert.deepEqual(store.pruneChannel("c1").map(record => record.messageId), ["manual"]);
	assert.equal(store.getDisplayState("manual"), null);
	assert.equal(store.getChannelGeneration("c1"), undefined);
});

// The session-counter chokepoint (2026-08-19 audit): displays reach the screen
// through three doors - scheduler transactions, the batch atomic commit, and the
// manual commit - but ALL of them mutate a record here. Counting at this store is
// what makes the capsule total complete; counting at the scheduler tap missed the
// batch door entirely and the numerator collapsed at every batch boundary.

test("every translated commit reports through onTranslationDisplayed, once per door", () => {
	const displayedReports = [];
	const store = createMessageStateStore({onTranslationDisplayed: (channelId, messageId) => displayedReports.push(`${channelId}:${messageId}`)});
	// Door 1: the single live commit.
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult(translated("m1", "c1", "Hello", "你好"));
	// Door 2: the batch atomic commit.
	store.captureSource(snapshot("m2", "c1", "World"));
	store.captureSource(snapshot("m3", "c1", "Later"));
	store.commitBatch([translated("m2", "c1", "World", "世界"), translated("m3", "c1", "Later", "稍后")]);
	// Door 3: the manual commit.
	store.commitManualTranslation({messageId: "m4", channelId: "c1", translation: {content: "手动"}});
	assert.deepEqual(displayedReports, ["c1:m1", "c1:m2", "c1:m3", "c1:m4"]);
});

test("skips, failures, restores, and previews never report as displayed", () => {
	const displayedReports = [];
	const store = createMessageStateStore({onTranslationDisplayed: (channelId, messageId) => displayedReports.push(String(messageId))});
	store.captureSource(snapshot("m1", "c1", "Hello"));
	store.commitResult({...translated("m1", "c1", "Hello", ""), status: "skipped", reason: "same_language", translation: null});
	store.captureSource(snapshot("m2", "c1", "World"));
	store.commitResult({...translated("m2", "c1", "World", ""), status: "failed", reason: "provider_failed", translation: null});
	store.commitPreviewResult({messageId: "m3", channelId: "c1", signature: "sig", translation: {signature: "sig", channelId: "c1", auto: true, translatedContent: "预览", originalContent: "Preview"}});
	assert.deepEqual(displayedReports, [], "no non-display transition may inflate the count");
	// An untranslate after a real commit does not subtract or re-report.
	store.captureSource(snapshot("m4", "c1", "Real"));
	store.commitResult(translated("m4", "c1", "Real", "真的"));
	store.restoreMessage && store.restoreMessage("m4");
	assert.deepEqual(displayedReports, ["m4"], "the restore neither subtracts nor double-counts");
});
