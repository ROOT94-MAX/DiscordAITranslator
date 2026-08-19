const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(path.join(root, relativePath), "utf8");
const readJson = relativePath => JSON.parse(read(relativePath));
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RELEASE_VERSION = "0.3.39";

test("release metadata, README and changelog agree on v0.3.39", () => {
	const packageJson = readJson("package.json");
	const packageLock = readJson("package-lock.json");
	const metadata = readJson("src/plugin/metadata.json");
	const readme = read("README.md");
	const changelog = read("CHANGELOG.md");
	const plugin = read("DiscordAITranslator.plugin.js");

	assert.equal(packageJson.version, RELEASE_VERSION);
	assert.equal(packageLock.version, RELEASE_VERSION);
	assert.equal(packageLock.packages[""].version, RELEASE_VERSION);
	assert.equal(metadata.version, RELEASE_VERSION);
	assert.match(readme, new RegExp(`Version-${escapeRegex(RELEASE_VERSION)}-`));
	assert.match(readme, new RegExp(`当前版本：v${escapeRegex(RELEASE_VERSION)}`));
	assert.match(changelog, new RegExp(`^## v${escapeRegex(RELEASE_VERSION)}$`, "m"));
	assert.match(plugin, new RegExp(`^ \\* @version ${escapeRegex(RELEASE_VERSION)}$`, "m"));
});

test("architecture and field handoff provide complete Chinese companion entry points", () => {
	const pairs = [
		["docs/architecture.md", "docs/architecture.zh-CN.md", "architecture.zh-CN.md", "architecture.md"],
		["docs/field-debugging-guide.md", "docs/field-debugging-guide.zh-CN.md", "field-debugging-guide.zh-CN.md", "field-debugging-guide.md"]
	];

	for (const [englishPath, chinesePath, chineseLink, englishLink] of pairs) {
		assert.equal(fs.existsSync(path.join(root, chinesePath)), true, `${chinesePath} must exist`);
		const english = read(englishPath);
		const chinese = read(chinesePath);
		assert.match(english, new RegExp(`\\(${escapeRegex(chineseLink)}\\)`), `${englishPath} links to Chinese`);
		assert.match(chinese, new RegExp(`\\(${escapeRegex(englishLink)}\\)`), `${chinesePath} links to English`);
		assert.match(chinese, /[\u4e00-\u9fff]{20}/, `${chinesePath} contains substantive Chinese text`);
	}

	const index = read("docs/README.md");
	assert.match(index, /architecture\.zh-CN\.md/);
	assert.match(index, /field-debugging-guide\.zh-CN\.md/);
});
