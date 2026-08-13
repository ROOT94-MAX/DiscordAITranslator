function cloneValue(value) {
	if (!value || typeof value != "object") return value;
	if (Array.isArray(value)) return value.map(cloneValue);
	const clone = {};
	for (const key in value) clone[key] = cloneValue(value[key]);
	return clone;
}

function extractMessages(value, visited = new Set()) {
	if (value == null) return [];
	if (typeof value != "object" && typeof value != "function") return [];
	if (visited.has(value)) return [];
	visited.add(value);
	if (Array.isArray(value)) return value;
	if (value instanceof Map) return [...value.values()];
	if (typeof value.values == "function" && typeof value.entries == "function") {
		try {return [...value.values()];}
		catch (error) {}
	}
	if (typeof value.toArray == "function") {
		try {return extractMessages(value.toArray(), visited);}
		catch (error) {}
	}
	if (Array.isArray(value._array)) return value._array;
	for (const key of ["messages", "_map", "records", "body", "result", "response", "data"]) {
		if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
		const extracted = extractMessages(value[key], visited);
		if (extracted.length) return extracted;
	}
	return [];
}

function cloneMessages(messages) {
	return extractMessages(messages).map(message => cloneValue(message));
}

function resolveMessageStoreSource(messageStore, channelId) {
	if (!messageStore || !channelId) return null;
	for (const methodName of ["getMessages", "getRawMessages", "getMessageCache"]) {
		if (typeof messageStore[methodName] != "function") continue;
		try {
			const value = messageStore[methodName](channelId);
			if (value != null) return value;
		}
		catch (error) {}
	}
	return null;
}

function resolveFetchCandidates(fetchMessages) {
	if (!fetchMessages) return [];
	if (typeof fetchMessages == "function") return [fetchMessages];
	return ["fetchMessages", "loadMessages", "fetch"].filter(methodName => typeof fetchMessages[methodName] == "function").map(methodName => fetchMessages[methodName].bind(fetchMessages));
}

async function callFetch(fetchMessages, payload) {
	let lastError = null;
	for (const candidate of resolveFetchCandidates(fetchMessages)) {
		if (payload.signal && payload.signal.aborted) return [];
		const attempts = [
			() => candidate(payload),
			() => candidate({
				channelId: payload.channelId,
				before: payload.beforeMessageId,
				limit: payload.limit,
				signal: payload.signal
			}),
			() => candidate(payload.channelId, {
				before: payload.beforeMessageId,
				limit: payload.limit,
				signal: payload.signal
			}),
			() => candidate(payload.channelId, payload.beforeMessageId, payload.limit, payload.signal)
		];
		for (const attempt of attempts) {
			try {
				if (payload.signal && payload.signal.aborted) return [];
				const result = await attempt();
				if (result != null) return result;
			}
			catch (error) {
				if (payload.signal && payload.signal.aborted) return [];
				lastError = error;
			}
		}
	}
	if (lastError) throw lastError;
	return [];
}

function createDiscordHistoryAdapter({
	messageStore = null,
	fetchMessages = null
} = {}) {
	return Object.freeze({
		async listCachedMessages(channelId) {
			return cloneMessages(resolveMessageStoreSource(messageStore, channelId));
		},
		async prefetchMessages({channelId, beforeMessageId = null, limit = 0, signal = null} = {}) {
			if (!channelId || !limit || signal && signal.aborted) return [];
			const result = await callFetch(fetchMessages, {channelId, beforeMessageId, limit, signal});
			if (signal && signal.aborted) return [];
			const returnedMessages = cloneMessages(result);
			// Real DiscordPTB evidence: fetchMessages resolves to a boolean and populates
			// the store asynchronously instead of returning messages. When the action gives
			// us nothing usable, re-read the store snapshot now that the promise has settled.
			if (returnedMessages.length) return returnedMessages;
			return cloneMessages(resolveMessageStoreSource(messageStore, channelId));
		}
	});
}

module.exports = {createDiscordHistoryAdapter};
