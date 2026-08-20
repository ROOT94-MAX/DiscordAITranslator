const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtime = fs.readFileSync(path.join(root, "src", "legacy", "runtime.js"), "utf8");

function getEnsureBlocks(source) {
	const lines = source.split("\n");
	const blocks = [];
	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].match(/^\t\t\t(ensure[A-Z][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/);
		if (!match) continue;
		let depth = 0;
		let end = index;
		for (let cursor = index; cursor < lines.length; cursor++) {
			for (const character of lines[cursor]) {
				if (character === "{") depth++;
				else if (character === "}") depth--;
			}
			end = cursor;
			if (depth === 0) break;
		}
		blocks.push({name: match[1], lines: lines.slice(index, end + 1)});
	}
	return blocks;
}

const EXPECTED_LAZY_SINGLETONS = [
	"ensureComposerWiring",
	"ensureContextMenuWiring",
	"ensureDiscordMarkupRenderer",
	"ensureHistoricalJobRegistry",
	"ensureHistoricalSnapshotCadence",
	"ensureHistoricalSourceRuntime",
	"ensureLiveTranslationQueue",
	"ensureLoadedStatusCapsuleController",
	"ensureMessageDeletionLifecycle",
	"ensureMessageViewportStore",
	"ensureProviderClient",
	"ensureReceivedDisplayRepaintScheduler",
	"ensureReceivedDisplayRuntime",
	"ensureReplyPreviewQueue",
	"ensureSentTranslationStore",
	"ensureSettingsStore",
	"ensureSpecialCaseCodecs",
	"ensureTranslationCacheStore",
	"ensureTranslationPipeline"
].sort();

test("the final composition root keeps an explicit compact lazy-singleton inventory", () => {
	const singletonBlocks = getEnsureBlocks(runtime).filter(block => /Instance/.test(block.lines.join("\n")) && /\bcreate[A-Z]/.test(block.lines.join("\n")));
	assert.deepEqual(singletonBlocks.map(block => block.name).sort(), EXPECTED_LAZY_SINGLETONS);
	for (const block of singletonBlocks) {
		assert.ok(block.lines.length <= 8, `${block.name} grew to ${block.lines.length} lines; move host fan-out into its owning wiring module`);
	}
});

test("canonical docs close Slice 5d without claiming the broader render debt is gone", () => {
	const recovery = fs.readFileSync(path.join(root, "docs", "recovery-plan.md"), "utf8");
	const architecture = fs.readFileSync(path.join(root, "docs", "architecture.md"), "utf8");
	const fieldGuide = fs.readFileSync(path.join(root, "docs", "field-debugging-guide.md"), "utf8");
	assert.match(recovery, /Slice 5d composition-root extraction is complete/);
	assert.doesNotMatch(recovery, /## Next Executable Slice: Architecture/);
	assert.match(architecture, /Slice 5d composition-root extraction is complete/);
	assert.doesNotMatch(fieldGuide, /Slice 5d is not finished/);
	assert.match(fieldGuide, /composer\/input can still refresh/);
});
