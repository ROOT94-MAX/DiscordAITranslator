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
	const readmeZh = read("README.zh-CN.md");
	const changelog = read("CHANGELOG.md");
	const plugin = read("DiscordAITranslator.plugin.js");

	assert.equal(packageJson.version, RELEASE_VERSION);
	assert.equal(packageLock.version, RELEASE_VERSION);
	assert.equal(packageLock.packages[""].version, RELEASE_VERSION);
	assert.equal(metadata.version, RELEASE_VERSION);
	assert.match(readme, new RegExp(`Version-${escapeRegex(RELEASE_VERSION)}-`));
	assert.match(readme, new RegExp(`Latest release: v${escapeRegex(RELEASE_VERSION)}`));
	assert.match(readmeZh, new RegExp(`当前版本：v${escapeRegex(RELEASE_VERSION)}`));
	assert.match(changelog, new RegExp(`^## v${escapeRegex(RELEASE_VERSION)}$`, "m"));
	assert.match(plugin, new RegExp(`^ \\* @version ${escapeRegex(RELEASE_VERSION)}$`, "m"));
});

test("root README offers complete English and Simplified Chinese mirrors", () => {
	const english = read("README.md");
	const chinese = read("README.zh-CN.md");
	const languageSwitch = "[English](README.md) | [简体中文](README.zh-CN.md)";
	const latestDownload = "releases/latest/download/DiscordAITranslator.plugin.js";

	assert.match(english, new RegExp(escapeRegex(languageSwitch)));
	assert.match(chinese, new RegExp(escapeRegex(languageSwitch)));
	assert.match(english, new RegExp(escapeRegex(latestDownload)));
	assert.match(chinese, new RegExp(escapeRegex(latestDownload)));

	for (const heading of [
		"## Why This Plugin",
		"## Screenshots",
		"## Features",
		"## Supported Providers",
		"## Quick Start",
		"## Usage",
		"## Known Limitations",
		"## Development",
		"## Documentation",
		"## Credits",
		"## License"
	]) assert.match(english, new RegExp(`^${escapeRegex(heading)}$`, "m"));

	for (const heading of [
		"## 为什么使用它",
		"## 效果展示",
		"## 核心功能",
		"## 支持的翻译服务商",
		"## 快速安装",
		"## 使用方法",
		"## 已知限制",
		"## 开发与验证",
		"## 技术文档",
		"## 致谢",
		"## 开源协议"
	]) assert.match(chinese, new RegExp(`^${escapeRegex(heading)}$`, "m"));

	assert.doesNotMatch(english, /\bperfect\b|zero-jumping|\b100%\b/i);
	assert.doesNotMatch(chinese, /完美|彻底解决|100%/);

	const imagePattern = /\]\((images\/[^)]+)\)/g;
	const englishImages = [...english.matchAll(imagePattern)].map(match => match[1]).sort();
	const chineseImages = [...chinese.matchAll(imagePattern)].map(match => match[1]).sort();
	assert.deepEqual(chineseImages, englishImages, "both README languages use the same screenshots");
	assert.ok(englishImages.length >= 4, "the README keeps the product and settings screenshots");

	const docsIndex = read("docs/README.md");
	assert.match(docsIndex, /\.\.\/README\.md/);
	assert.match(docsIndex, /\.\.\/README\.zh-CN\.md/);
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
