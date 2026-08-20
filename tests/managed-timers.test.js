const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Every timer that outlives a single call must go through BDFDB.TimeUtils, because
// BDFDB cancels those when the plugin stops or reloads. A raw setTimeout survives its
// own plugin instance, so after a reload the dead instance keeps firing - and for the
// repaint scheduler each of those firings is a full-list repaint racing the live one.
const runtime = fs.readFileSync(path.resolve(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
const translationCacheWiring = fs.readFileSync(path.resolve(__dirname, "..", "src", "cache", "translation-cache-wiring.js"), "utf8");
const providerClientWiring = fs.readFileSync(path.resolve(__dirname, "..", "src", "providers", "provider-client-wiring.js"), "utf8");

function dependencyBlock(factoryName) {
	const start = runtime.indexOf(factoryName + "({");
	assert.notEqual(start, -1, `${factoryName} construction not found`);
	const end = runtime.indexOf("\n\t\t\t\t});", start);
	assert.notEqual(end, -1, `${factoryName} construction has no end`);
	return runtime.slice(start, end);
}

// Every module that schedules work on the plugin's behalf. The provider client is here
// too: its retry timers are managed, and only its backoff sleep is deliberately raw.
const TIMER_OWNING_FACTORIES = [
	"createDisplayRepaintScheduler",
	"createMessageViewportStore"
];

test("modules that schedule work are handed BDFDB timers, never the globals", () => {
	const owners = TIMER_OWNING_FACTORIES.map(factoryName => ({name: factoryName, source: dependencyBlock(factoryName)})).concat({
		name: "createPluginTranslationCacheStore",
		source: translationCacheWiring
	}, {
		name: "createPluginProviderClient",
		source: providerClientWiring
	});
	for (const owner of owners) {
		assert.match(owner.source, /setTimeout:\s*\(callback, delay\) => BDFDB\.TimeUtils\.timeout\(callback, delay\)/, `${owner.name} must receive the managed timer`);
		assert.match(owner.source, /clearTimeout:\s*timer => BDFDB\.TimeUtils\.clear\(timer\)/, `${owner.name} must receive the managed clear`);
	}
});

test("the repaint scheduler refuses to fall back to a global timer", () => {
	// It defaults its own setTimeout parameter, so forgetting to pass one is silent
	// rather than a crash. This is the assertion that makes the omission loud.
	const scheduler = fs.readFileSync(path.resolve(__dirname, "..", "src", "display", "repaint-scheduler.js"), "utf8");
	assert.match(scheduler, /setTimeout: scheduleTimer = setTimeout/, "the default is still there, so the wiring assertion above is what protects us");
	assert.match(dependencyBlock("createDisplayRepaintScheduler"), /BDFDB\.TimeUtils\.timeout/);
});

test("the provider backoff sleep stays a raw timer on purpose", () => {
	// Routing this one through BDFDB would leave the awaiting promise pending forever
	// once the plugin stops, which is worse than the timer outliving the instance.
	assert.match(providerClientWiring, /sleep = ms => new Promise\(resolve => setTimeout\(resolve, ms\)\)/);
});
