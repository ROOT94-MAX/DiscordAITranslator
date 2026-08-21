const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {createPluginInstance} = require("./helpers/createPluginInstance");

const root = path.resolve(__dirname, "..");
const buildScript = path.join(root, "scripts", "build-plugin.mjs");
const releasePath = path.join(root, "DiscordAITranslator.plugin.js");

test("the committed BetterDiscord plugin matches the deterministic source build", async () => {
	const {createPluginBundle} = await import("../scripts/build-plugin.mjs");
	const firstGenerated = await createPluginBundle();
	const secondGenerated = await createPluginBundle();
	const committed = fs.readFileSync(releasePath, "utf8");

	assert.equal(firstGenerated, secondGenerated);
	assert.equal(committed, firstGenerated);
});

test("the generated plugin keeps metadata and excludes development artifacts", async () => {
	const {createPluginBundle} = await import("../scripts/build-plugin.mjs");
	const generated = await createPluginBundle();
	const debugGenerated = await createPluginBundle({debug: true});
	const releaseBeforeDebug = fs.readFileSync(releasePath);
	const debugResult = childProcess.spawnSync(process.execPath, [buildScript, "--debug"], {
		cwd: root,
		encoding: "utf8"
	});
	const conflictingFlagsResult = childProcess.spawnSync(process.execPath, [buildScript, "--debug", "--check"], {
		cwd: root,
		encoding: "utf8"
	});
	const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
	const metadata = JSON.parse(fs.readFileSync(path.join(root, "src", "plugin", "metadata.json"), "utf8"));
	const activeEsbuildPackage = packageLock.packages[`node_modules/@esbuild/${process.platform}-${process.arch}`];
	const plugin = createPluginInstance({callSetLanguages: false});

	assert.match(generated, /^\/\*\*[\s\S]*@name DiscordAITranslator/);
	assert.ok(generated.includes(`@version ${metadata.version}`));
	assert.doesNotMatch(generated, /sourceMappingURL=/);
	assert.doesNotMatch(generated, /tests\//);
	assert.doesNotMatch(generated, /TRANSLATOR_DISPLAY_DEBUG_JOURNAL/);
	assert.doesNotMatch(generated, /TRANSLATOR_SECOND_DEBUG_PROBE/);
	assert.doesNotMatch(generated, /withMountedUiBoundary|composerPreserved/, "release builds must strip the Composer-isolation probe");
	assert.match(debugGenerated, /TRANSLATOR_SECOND_DEBUG_PROBE/);
	assert.match(debugGenerated, /withMountedUiBoundary/);
	assert.match(debugGenerated, /composerPreserved/);
	assert.equal(plugin.constructor.name, "Translator");
	assert.equal(debugResult.status, 0, debugResult.stderr);
	assert.equal(debugResult.stdout, debugGenerated);
	assert.deepEqual(fs.readFileSync(releasePath), releaseBeforeDebug);
	assert.notEqual(conflictingFlagsResult.status, 0);
	assert.equal(conflictingFlagsResult.stdout, "");
	assert.equal(conflictingFlagsResult.stderr.trim(), "--debug and --check are mutually exclusive.");
	assert.ok(activeEsbuildPackage);
	assert.match(activeEsbuildPackage.resolved, /^https:\/\/registry\.npmjs\.org\/@esbuild\/[^/]+\/-\/[^/]+\.tgz$/);
	assert.match(activeEsbuildPackage.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
});

test("the generated plugin stays readable rather than minified", () => {
	// Artifact bytes were retired as a refactor metric: measured on this tree,
	// `minify: true` alone takes the bundle from 671 KB to 392 KB with zero source
	// changes, so byte count tracked formatting, not structure. Refactoring alone
	// could only reach roughly 660 KB. Structure is now measured by
	// tests/architecture-budget.test.js, and readability is the property worth
	// asserting here: a readable artifact is what makes live DevTools diagnosis of
	// real user reports possible, which outweighs distribution size.
	const generated = fs.readFileSync(releasePath, "utf8");
	const lines = generated.split("\n");
	const averageLineLength = generated.length / lines.length;
	assert.ok(averageLineLength < 200, `the shipped plugin looks minified (average line ${averageLineLength.toFixed(0)} chars); keep it readable for live debugging`);
	assert.match(generated, /\n\t/, "the shipped plugin keeps source indentation");
});

test("the artifact carries a deterministic build identity visible at runtime", async () => {
	// Audit item 29: two bundles built without changing metadata used to be
	// indistinguishable at runtime, so support could not tell a stale loaded bundle
	// from the current source. The banner declares @buildId and the running plugin
	// exposes the exact same id.
	const {createPluginBundle} = await import("../scripts/build-plugin.mjs");
	const firstGenerated = await createPluginBundle();
	const secondGenerated = await createPluginBundle();
	const firstId = (firstGenerated.match(/@buildId ([0-9a-f]{16})/) || [])[1];
	const secondId = (secondGenerated.match(/@buildId ([0-9a-f]{16})/) || [])[1];

	assert.ok(firstId, "the banner carries a 16-hex build id");
	assert.equal(firstId, secondId, "the id is deterministic for the same source");
	const plugin = createPluginInstance({callSetLanguages: false});
	assert.equal(plugin.getBuildId(), firstId, "the running plugin exposes the banner's build id");
});
