const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const resolverPath = path.join(root, "src", "display", "react-flush-sync.js");

function loadResolver() {
	assert.equal(fs.existsSync(resolverPath), true, "the active resolver has its own focused module");
	return require(resolverPath).resolveFlushSync;
}

test("resolveFlushSync prefers the injected ReactUtils function", () => {
	const resolveFlushSync = loadResolver();
	const expected = callback => callback();
	assert.equal(resolveFlushSync({flushSync: expected}), expected);
});

test("resolveFlushSync falls back to BetterDiscord's webpack ReactDOM export", () => {
	const resolveFlushSync = loadResolver();
	const originalBdApi = global.BdApi;
	const expected = callback => callback();
	let query = null;
	try {
		global.BdApi = {Webpack: {getByKeys: (...keys) => {
			query = keys;
			return {flushSync: expected, createPortal() {}};
		}}};
		assert.equal(resolveFlushSync({}), expected);
		assert.deepEqual(query, ["flushSync", "createPortal"]);
	}
	finally {
		if (originalBdApi === undefined) delete global.BdApi;
		else global.BdApi = originalBdApi;
	}
});

test("resolveFlushSync returns null when no supported export exists or lookup throws", () => {
	const resolveFlushSync = loadResolver();
	const originalBdApi = global.BdApi;
	try {
		global.BdApi = {Webpack: {getByKeys: () => null}};
		assert.equal(resolveFlushSync({}), null);
		global.BdApi = {Webpack: {getByKeys: () => {throw new Error("webpack unavailable");}}};
		assert.equal(resolveFlushSync({}), null);
	}
	finally {
		if (originalBdApi === undefined) delete global.BdApi;
		else global.BdApi = originalBdApi;
	}
});

test("the retired atomic rebuild implementation and wiring are absent", () => {
	assert.equal(fs.existsSync(path.join(root, "src", "display", "atomic-chat-rebuild.js")), false);
	assert.equal(fs.existsSync(path.join(root, "tests", "display", "atomic-chat-rebuild.test.js")), false);

	const displayRuntime = fs.readFileSync(path.join(root, "src", "display", "display-runtime.js"), "utf8");
	const adapter = fs.readFileSync(path.join(root, "src", "display", "discord-render-adapter.js"), "utf8");
	const wiring = fs.readFileSync(path.join(root, "src", "display", "display-runtime-wiring.js"), "utf8");
	assert.match(displayRuntime, /require\("\.\/react-flush-sync"\)/);
	assert.doesNotMatch(displayRuntime, /atomic-chat-rebuild|createAtomicChatRebuild/);
	assert.doesNotMatch(adapter, /atomicChatRebuild|createAtomicChatRebuild/);

	const start = wiring.indexOf("return createRuntime({");
	const end = wiring.indexOf("document:", start);
	assert.notEqual(start, -1);
	assert.notEqual(end, -1);
	const bdfdbWiring = wiring.slice(start, end);
	for (const deadHandle of ["ObjectUtils", "LibraryStores", "DMUtils", "ChannelUtils"]) {
		assert.doesNotMatch(bdfdbWiring, new RegExp(`${deadHandle}: BDFDB\\.${deadHandle}`));
	}
});
