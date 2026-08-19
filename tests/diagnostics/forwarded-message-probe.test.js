const test = require("node:test");
const assert = require("node:assert/strict");
const {createForwardedMessageProbe} = require("../../src/diagnostics/forwarded-message-probe");

function forwardedMessage(id, content = "") {
	return {id, content, messageSnapshots: [{message: {content: "the forwarded body", embeds: []}}]};
}

test("the probe records forwarded shapes, dedupes by id, and stops at the cap", () => {
	const writes = [];
	const probe = createForwardedMessageProbe({sink: text => writes.push(JSON.parse(text)), now: () => 5, maxSamples: 2});

	assert.equal(probe.record({id: "plain", content: "no snapshots here"}), false, "ordinary messages are ignored");
	assert.equal(probe.record(forwardedMessage("f1")), true);
	assert.equal(probe.record(forwardedMessage("f1")), false, "the same forward is not recorded twice");
	assert.equal(probe.record(forwardedMessage("f2")), true);
	assert.equal(probe.record(forwardedMessage("f3")), false, "the cap keeps the probe quiet afterwards");

	assert.equal(probe.getSampleCount(), 2);
	const finalWrite = writes[writes.length - 1];
	assert.equal(finalWrite.samples.length, 2);
	assert.equal(finalWrite.samples[0].ownContentLength, 0, "the forward's own content is empty - the reason it never translated");
	assert.equal(finalWrite.samples[0].snapshotCount, 1);
	assert.equal(finalWrite.samples[0].firstSnapshotShape.type, "object");
});

test("gateway-style snake_case snapshots are recognized too", () => {
	const probe = createForwardedMessageProbe({now: () => 1});
	assert.equal(probe.record({id: "g1", content: "", message_snapshots: [{message: {content: "raw"}}]}), true);
});
