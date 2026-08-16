const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {createPluginInstance} = require("./helpers/createPluginInstance");

test("plugin metadata uses English description and linked repository author", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "..", "DiscordAITranslator.plugin.js"), "utf8");
	assert.match(source, /^ \* @author ROOT94$/m);
	assert.match(source, /^ \* @authorLink https:\/\/github\.com\/ROOT94-MAX\/DiscordAITranslator$/m);
	assert.match(source, /^ \* @description BetterDiscord translation plugin with channel-aware automatic translation and AI providers\.$/m);
	assert.doesNotMatch(source, /Discord客户端的AI翻译插件/);
});

test("global settings do not retain a duplicate language detection helper", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
	assert.doesNotMatch(source, /const createLanguageDetector\s*=/);
	assert.doesNotMatch(source, /this\.languageDetectorState/);
});

test("obsolete button and global auto-default settings are absent from plugin defaults", () => {
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			dotCN: new Proxy({}, {get: () => ""}),
			dotCNS: new Proxy({}, {get: () => ""})
		}
	});
	plugin.onLoad();

	assert.equal(Object.prototype.hasOwnProperty.call(plugin.defaults.general, "addTranslateButton"), false);
	assert.equal(Object.prototype.hasOwnProperty.call(plugin.defaults.general, "addQuickTranslateButton"), false);
	assert.equal(Object.prototype.hasOwnProperty.call(plugin.defaults.general, "usePerChatTranslation"), false);
});

test("input-box translator button remains visible when obsolete stored setting is false", () => {
	const plugin = createPluginInstance({
		callSetLanguages: false,
		settings: {
			general: {addTranslateButton: false}
		},
		bdfdb: {
			DiscordConstants: {
				ChannelTextAreaTypes: {NORMAL: "NORMAL", SIDEBAR: "SIDEBAR"}
			},
			ReactUtils: {
				createElement: (type, props) => ({type, props})
			},
			disCN: new Proxy({}, {get: () => "x"}),
			dotCN: new Proxy({}, {get: () => ""}),
			dotCNS: new Proxy({}, {get: () => ""})
		}
	});
	plugin.onLoad();
	const event = {
		instance: {
			props: {
				disabled: false,
				type: "NORMAL",
				channel: {id: "channel-1", guild_id: "guild-1"}
			}
		},
		returnvalue: {props: {children: []}}
	};

	plugin.processChannelTextAreaButtons(event);

	assert.equal(event.returnvalue.props.children.length, 1);
});

test("input-box translator button supports Discord composer type descriptors", () => {
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			DiscordConstants: {
				ChannelTextAreaTypes: {NORMAL: "NORMAL", SIDEBAR: "SIDEBAR"}
			},
			ReactUtils: {
				createElement: (type, props) => ({type, props})
			},
			disCN: new Proxy({}, {get: () => "x"}),
			dotCN: new Proxy({}, {get: () => ""}),
			dotCNS: new Proxy({}, {get: () => ""})
		}
	});
	plugin.onLoad();
	const event = {
		instance: {
			props: {
				disabled: false,
				type: {analyticsName: "normal"},
				channel: {id: "channel-1", guild_id: "guild-1"}
			}
		},
		returnvalue: {props: {children: []}}
	};

	plugin.processChannelTextAreaButtons(event);

	assert.equal(event.returnvalue.props.children.length, 1);
});

test("message action translator button remains visible when obsolete stored setting is false", () => {
	const actionChildren = [];
	const plugin = createPluginInstance({
		callSetLanguages: false,
		settings: {
			general: {addQuickTranslateButton: false}
		},
		bdfdb: {
			ReactUtils: {
				createElement: (type, props) => ({type, props}),
				findParent: () => [actionChildren, 0]
			},
			LibraryComponents: {
				TooltipContainer: "TooltipContainer",
				SvgIcon: "SvgIcon"
			},
			disCN: new Proxy({}, {get: () => "x"}),
			disCNS: new Proxy({}, {get: () => "x"}),
			dotCN: new Proxy({}, {get: () => ""}),
			dotCNS: new Proxy({}, {get: () => ""})
		}
	});
	plugin.onLoad();

	plugin.processMessageButtons({
		instance: {
			props: {
				message: {id: "message-1", content: "hello"},
				channel: {id: "channel-1"}
			}
		},
		returnvalue: {}
	});

	assert.equal(actionChildren.length, 1);
});

test("message action translator button remains usable while another translation is busy", async () => {
	const actionChildren = [];
	const plugin = createPluginInstance({
		bdfdb: {
			ReactUtils: {
				createElement: (type, props) => ({type, props}),
				findParent: () => [actionChildren, 0],
				forceUpdate: () => {}
			},
			LibraryComponents: {
				TooltipContainer: "TooltipContainer",
				SvgIcon: "SvgIcon"
			},
			disCN: new Proxy({}, {get: () => "x"}),
			disCNS: new Proxy({}, {get: () => "x"}),
			dotCN: new Proxy({}, {get: () => ""}),
			dotCNS: new Proxy({}, {get: () => ""})
		}
	});
	plugin.onLoad();
	plugin.googleApiTranslate = () => {};
	plugin.translateText("busy translation", "received", () => {}, null, {
		showToast: false,
		showFailureToast: false,
		trackBusy: true,
		channelId: "channel-busy"
	});
	let translateOptions = null;
	plugin.translateMessage = (_message, _channel, options) => {
		translateOptions = options;
		return Promise.resolve(false);
	};

	plugin.processMessageButtons({
		instance: {
			props: {
				message: {id: "message-busy", content: "hello"},
				channel: {id: "channel-busy"}
			}
		},
		returnvalue: {}
	});
	const buttonComponent = new actionChildren[0].type();
	const renderedButton = buttonComponent.render();
	renderedButton.props.children.props.onClick();
	await new Promise(resolve => setImmediate(resolve));

	assert.ok(translateOptions);
	assert.equal(translateOptions.trackBusy, false);
});

test("manual message controls do not use the global translating gate", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "legacy", "runtime.js"), "utf8");
	const manualCalls = [...source.matchAll(/translateMessage\([^\n]+\{manual: true, independentOfTextAreaSwitch: true[^\n]+/g)].map(match => match[0]);

	assert.equal(manualCalls.length >= 3, true);
	for (const call of manualCalls) assert.match(call, /trackBusy: false/);
	assert.doesNotMatch(source, /label:\s*translated\s*\?[\s\S]{0,400}?disabled:\s*isTranslating/);
	assert.doesNotMatch(source, /disabled:\s*!translated\s*&&\s*isTranslating/);
	assert.doesNotMatch(source, /if\s*\(!isTranslating\)\s*_this\.translateMessage/);
});

test("the settings panel exposes the loaded backfill scope and limit controls", () => {
	const source = fs.readFileSync(path.resolve(__dirname, "..", "src", "ui", "settings-panel.js"), "utf8");

	// Audit item 39: the panel rewrite dropped these controls while the runtime kept
	// reading the settings, so users could no longer change how much history each
	// channel backfills (the capsule total looked hardcoded).
	assert.match(source, /receivedAutoTranslateScope/, "the panel must write the backfill scope");
	assert.match(source, /receivedAutoTranslateLoadedLimit/, "the panel must write the backfill limit");
	assert.match(source, /getReceivedAutoTranslateLoadedLimit\(\)/, "the control reads the effective limit, not the raw stored value");
});
