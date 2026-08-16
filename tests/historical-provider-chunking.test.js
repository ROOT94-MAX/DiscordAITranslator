const test = require("node:test");
const assert = require("node:assert/strict");
const {runChunkedHistoricalBatch, HISTORICAL_PROVIDER_CHUNK_SIZE} = require("../src/orchestrator/historical-provider-chunking");

function createItems(count) {
	return Array.from({length: count}, (_, index) => ({message: {id: String(100 + index)}, channelId: "channel-1"}));
}

test("a batch within the chunk size costs exactly one provider request", async () => {
	const requests = [];
	const outcome = await runChunkedHistoricalBatch({
		preparedItems: createItems(5),
		requestChunk: items => {
			requests.push(items.map(item => item.message.id));
			return Promise.resolve(Object.fromEntries(items.map(item => [item.message.id, `译文 ${item.message.id}`])));
		}
	});

	assert.deepEqual(requests, [["100", "101", "102", "103", "104"]]);
	assert.deepEqual(outcome, {translations: Object.fromEntries([100, 101, 102, 103, 104].map(id => [String(id), `译文 ${id}`])), failureKind: null, statusCode: null});
});

test("an oversized batch splits into chunks and merges map and detailed outcomes", async () => {
	const requests = [];
	const settled = [];
	const outcome = await runChunkedHistoricalBatch({
		preparedItems: createItems(25),
		requestChunk: items => {
			requests.push(items.length);
			// The first chunk answers with the legacy map shape, the second with the
			// detailed typed shape; the merge must accept both.
			if (requests.length === 1) return Promise.resolve(Object.fromEntries(items.map(item => [item.message.id, `a ${item.message.id}`])));
			return Promise.resolve({translations: Object.fromEntries(items.map(item => [item.message.id, `b ${item.message.id}`])), failureKind: null, statusCode: 200});
		},
		onChunkSettled: progress => settled.push({...progress})
	});

	assert.deepEqual(requests, [10, 10, 5]);
	assert.deepEqual(settled.map(progress => progress.answered), [10, 20, 25]);
	assert.equal(Object.keys(outcome.translations).length, 25);
	assert.equal(outcome.translations["109"], "a 109");
	assert.equal(outcome.translations["110"], "b 110");
	assert.equal(outcome.failureKind, null);
});

test("a terminal failure on the first chunk short-circuits the remaining chunks", async () => {
	const requests = [];
	const outcome = await runChunkedHistoricalBatch({
		preparedItems: createItems(25),
		requestChunk: items => {
			requests.push(items.length);
			return Promise.resolve({translations: null, failureKind: "auth", statusCode: 401});
		}
	});

	assert.deepEqual(requests, [10], "an auth failure must not hammer the key with more chunks");
	assert.deepEqual(outcome, {translations: null, failureKind: "auth", statusCode: 401});
});

test("a cancelled job stops issuing chunks and returns what already settled", async () => {
	const requests = [];
	let current = true;
	const outcome = await runChunkedHistoricalBatch({
		preparedItems: createItems(25),
		requestChunk: items => {
			requests.push(items.length);
			return Promise.resolve(Object.fromEntries(items.map(item => [item.message.id, `x ${item.message.id}`])));
		},
		isCurrent: () => current,
		onChunkSettled: () => {current = false;}
	});

	assert.deepEqual(requests, [10]);
	assert.equal(outcome.translations["109"], "x 109");
	assert.equal(Object.keys(outcome.translations).length, 10);
});

test("the provider chunk size stays at the progress-granularity contract", () => {
	assert.equal(HISTORICAL_PROVIDER_CHUNK_SIZE, 10);
});
