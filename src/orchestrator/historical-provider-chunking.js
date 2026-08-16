// Splits one historical provider batch into sequential chunks so the status capsule
// can tick progress while the job is in flight. The display contract is unchanged:
// chunks exist only at the transport layer, and the merged outcome feeds the job's
// existing validation and one atomic commit.
const {normalizeBatchOutcome} = require("./historical-translation-job");

const HISTORICAL_PROVIDER_CHUNK_SIZE = 10;

function chunkPreparedItems(preparedItems, chunkSize) {
	const chunks = [];
	for (let offset = 0; offset < preparedItems.length; offset += chunkSize) chunks.push(preparedItems.slice(offset, offset + chunkSize));
	return chunks;
}

function isTerminalFailure(failureKind) {
	return ["auth", "configuration", "permanent"].includes(failureKind);
}

function runChunkedHistoricalBatch({preparedItems, chunkSize = HISTORICAL_PROVIDER_CHUNK_SIZE, requestChunk, isCurrent = null, onChunkSettled = null}) {
	if (!Array.isArray(preparedItems) || !preparedItems.length) return Promise.resolve(null);
	const size = Math.max(1, Math.floor(chunkSize) || HISTORICAL_PROVIDER_CHUNK_SIZE);
	if (!requestChunk) return Promise.resolve(null);
	if (preparedItems.length <= size) return Promise.resolve(requestChunk(preparedItems)).then(normalizeBatchOutcome);
	const chunks = chunkPreparedItems(preparedItems, size);
	return (async () => {
		const translations = {};
		let firstFailure = null;
		let answered = 0;
		for (let index = 0; index < chunks.length; index++) {
			if (isCurrent && !isCurrent()) break;
			const outcome = normalizeBatchOutcome(await requestChunk(chunks[index]));
			if (outcome && outcome.translations) Object.assign(translations, outcome.translations);
			else if (!firstFailure && outcome && outcome.failureKind) firstFailure = {failureKind: outcome.failureKind, statusCode: outcome.statusCode == null ? null : outcome.statusCode};
			answered += chunks[index].length;
			if (onChunkSettled) {
				try {onChunkSettled({answered, total: preparedItems.length, chunkIndex: index, chunkCount: chunks.length});}
				catch (error) {}
			}
			// A dead key must not be hammered with the remaining chunks; a transient
			// failure keeps going so the job's repair lane can recover the rest.
			if (!Object.keys(translations).length && firstFailure && isTerminalFailure(firstFailure.failureKind)) {
				return {translations: null, failureKind: firstFailure.failureKind, statusCode: firstFailure.statusCode};
			}
		}
		if (!Object.keys(translations).length) return firstFailure ? {translations: null, failureKind: firstFailure.failureKind, statusCode: firstFailure.statusCode} : null;
		return {translations, failureKind: null, statusCode: null};
	})();
}

module.exports = {runChunkedHistoricalBatch, HISTORICAL_PROVIDER_CHUNK_SIZE};
