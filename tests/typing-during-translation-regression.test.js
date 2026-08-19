const test = require("node:test");
const assert = require("node:assert/strict");
const {
	createPluginInstance: createBasePluginInstance,
	createTypingDuringTranslationPluginInstance: createPluginInstance
} = require("./helpers/createPluginInstance");

test("channel text area editor is not disabled while translations are running", () => {
	const plugin = createPluginInstance();
	const props = {
		channel: {id: "channel-1"},
		disabled: false
	};

	plugin.processChannelTextAreaEditor({
		instance: {props}
	});

	assert.equal(props.disabled, false);
});

test("the retained legacy manual-path refresh repaints through the proven chat rebuild", () => {
	// Real-client evidence (2026-08-16, PTB 1.0.1214): PatchUtils.forceAllUpdates is a
	// no-op on this client - same family as the forceUpdate strategies the probe
	// disproved - so manual translations stayed invisible until a channel switch. The
	// manual path must use the same rebuild primitive the display adapter proved.
	let chatLayerRerenders = [];
	let instantFlags = [];
	const plugin = createBasePluginInstance({
		callSetLanguages: false,
		bdfdb: {
			MessageUtils: {
				rerenderAll: instant => {
					chatLayerRerenders.push(instant);
				}
			},
			PatchUtils: {
				forceAllUpdates: () => {
					throw new Error("forceAllUpdates is a proven no-op on this client and must not be used for message repaints");
				}
			}
		}
	});
	plugin.captureMessageScrollerState = () => null;

	plugin.rerenderMessagesWithScrollPreserved();

	assert.deepEqual(chatLayerRerenders, [true], "the manual-path refresh must rebuild the chat once with the instant variant");
});

test("a lifecycle repaint preserves the current viewport instead of a stale manual-translation lock", () => {
	// The manual row transaction already consumed its ID-scoped anchor. Clicking the
	// channel auto-translate switch inside the 4.5s lock window is a different, whole-
	// channel operation and must preserve where the reader is now.
	const plugin = createBasePluginInstance({
		callSetLanguages: false,
		bdfdb: {MessageUtils: {rerenderAll: () => {}}}
	});
	const currentViewport = {scrollTop: 320, keepBottom: false, anchor: {messageId: "august-3"}, userScrollIntentSequence: 4};
	plugin.getActiveManualTranslationScrollAnchor = () => ({messageId: "old-manual-row"});
	plugin.captureMessageScrollerState = () => currentViewport;
	plugin.restoreMessageAnchorState = () => {throw new Error("a full lifecycle repaint must not follow the old manual lock");};
	let restored = null;
	plugin.restoreMessageScrollerState = state => {restored = state;};

	plugin.rerenderMessagesWithScrollPreserved();

	assert.equal(restored, currentViewport);
});

function createScrollRestoreHarness() {
	const realDocument = global.document;
	const realRequestAnimationFrame = global.requestAnimationFrame;
	const realSetTimeout = global.setTimeout;
	const frameCallbacks = [];
	const timerCallbacks = [];
	const eventHandlers = {};
	const scroller = {
		scrollTop: 200,
		scrollHeight: 2000,
		clientHeight: 500,
		addEventListener: (eventName, handler) => {
			eventHandlers[eventName] = handler;
		},
		removeEventListener: () => {},
		getBoundingClientRect: () => ({top: 0, bottom: 500}),
		querySelectorAll: () => []
	};
	global.document = {
		querySelector: selector => selector == ".messages-scroller" ? scroller : null
	};
	global.requestAnimationFrame = callback => {
		frameCallbacks.push(callback);
		return frameCallbacks.length;
	};
	global.setTimeout = callback => {
		timerCallbacks.push(callback);
		return timerCallbacks.length;
	};
	const plugin = createBasePluginInstance({
		callSetLanguages: false,
		bdfdb: {
			dotCN: {messagesscroller: ".messages-scroller"}
		}
	});

	return {
		plugin,
		scroller,
		timerCallbacks,
		userScroll() {
			if (eventHandlers.wheel) eventHandlers.wheel({type: "wheel"});
			if (eventHandlers.scroll) eventHandlers.scroll({type: "scroll"});
		},
		layoutScroll() {
			if (eventHandlers.scroll) eventHandlers.scroll({type: "scroll"});
		},
		runScheduledCallbacks() {
			while (frameCallbacks.length || timerCallbacks.length) {
				while (frameCallbacks.length) frameCallbacks.shift()();
				while (timerCallbacks.length) timerCallbacks.shift()();
			}
		},
		restore() {
			global.document = realDocument;
			global.requestAnimationFrame = realRequestAnimationFrame;
			global.setTimeout = realSetTimeout;
		}
	};
}

test("automatic translation refresh never pulls the scroller back after user scrolling resumes", () => {
	const harness = createScrollRestoreHarness();
	try {
		harness.plugin.rerenderMessagesWithScrollPreserved();
		harness.scroller.scrollTop = 700;
		harness.userScroll();

		harness.runScheduledCallbacks();

		assert.equal(harness.scroller.scrollTop, 700);
	}
	finally {
		harness.restore();
	}
});

test("layout-induced scroll events do not cancel the single anchor correction", () => {
	const harness = createScrollRestoreHarness();
	try {
		harness.plugin.rerenderMessagesWithScrollPreserved();
		harness.scroller.scrollTop = 350;
		harness.layoutScroll();

		harness.runScheduledCallbacks();

		assert.equal(harness.scroller.scrollTop, 200);
	}
	finally {
		harness.restore();
	}
});

test("delayed settle corrections exist but a user gesture disarms every one of them", () => {
	// Superseding an older pin (was: "no delayed timeout corrections at all"). The
	// original bug was delayed corrections yanking the scroller after the user
	// resumed scrolling. The settle ladder that fixes late-layout drift (the
	// 4:02->4:10 report, 2026-08-19) is allowed back ONLY because every pass runs
	// under the intent veto: one user gesture and the remaining passes write nothing.
	const harness = createScrollRestoreHarness();
	try {
		harness.plugin.attachAutoTranslationScrollWatcher();
		const scrollerState = harness.plugin.captureMessageScrollerState();
		harness.plugin.restoreMessageScrollerState(scrollerState);
		assert.ok(harness.timerCallbacks.length > 0, "the settle ladder is armed");

		harness.userScroll();
		harness.scroller.scrollTop = 350;
		for (const callback of harness.timerCallbacks.splice(0)) callback();

		assert.equal(harness.scroller.scrollTop, 350, "a gesture disarms every settle pass");
	}
	finally {
		harness.restore();
	}
});

test("normal and prefixed sent translations keep the submitted channel id", async () => {
	let submitPatch = null;
	const translateCalls = [];
	const plugin = createBasePluginInstance({
		callSetLanguages: false,
		settings: {
			prefixes: {
				translationPrefixData: [{prefix: "$fr", language: "fr"}]
			}
		},
		bdfdb: {
			DiscordConstants: {
				ChannelTextAreaTypes: {
					NORMAL: "NORMAL",
					SIDEBAR: "SIDEBAR"
				}
			},
			PatchUtils: {
				forceAllUpdates: () => {},
				patch: (_plugin, _target, _method, config) => {
					submitPatch = config.instead;
				}
			}
		},
		isTranslationEnabled: () => true,
		isOwnMessage: message => !!(message && message.author && message.author.id == "current-user")
	});
	plugin.shouldAutoTranslateSentMessage = (_text, _channelId, callback) => callback(true);
	plugin.translateText = (text, place, callback, forcedOutputLanguage, options) => {
		translateCalls.push({text, place, forcedOutputLanguage, channelId: options && options.channelId});
		callback("translated", {id: "en"}, {id: forcedOutputLanguage || "zh-CN"});
	};
	plugin.buildSentTranslationMessageValue = () => "translated";

	plugin.processChannelTextAreaContainer({
		instance: {
			props: {
				type: "NORMAL",
				channel: {id: "channel-submit"},
				onSubmit: () => {}
			}
		}
	});
	assert.equal(typeof submitPatch, "function");

	const invokeSubmit = value => submitPatch({
		methodArguments: [{value}],
		stopOriginalMethodCall: () => {},
		originalMethod: () => Promise.resolve(),
		callOriginalMethodAfterwards: () => Promise.resolve()
	});
	await invokeSubmit("hello");
	await invokeSubmit("$fr bonjour");

	assert.deepEqual(translateCalls, [
		{text: "hello", place: "sent", forcedOutputLanguage: null, channelId: "channel-submit"},
		{text: "bonjour", place: "sent", forcedOutputLanguage: "fr", channelId: "channel-submit"}
	]);
});

test("late automatic sent translation falls back to original text after channel disable and re-enable", async () => {
	let submitPatch = null;
	let translateCallback = null;
	let enabled = true;
	const submittedValues = [];
	const plugin = createBasePluginInstance({
		callSetLanguages: false,
		bdfdb: {
			DiscordConstants: {
				ChannelTextAreaTypes: {
					NORMAL: "NORMAL",
					SIDEBAR: "SIDEBAR"
				}
			},
			PatchUtils: {
				forceAllUpdates: () => {},
				patch: (_plugin, _target, _method, config) => {
					submitPatch = config.instead;
				}
			}
		},
		isTranslationEnabled: () => enabled
	});
	plugin.shouldAutoTranslateSentMessage = (_text, _channelId, callback) => callback(true);
	plugin.translateText = (_text, _place, callback) => {
		translateCallback = callback;
	};
	plugin.buildSentTranslationMessageValue = () => "translated text";

	plugin.processChannelTextAreaContainer({
		instance: {
			props: {
				type: "NORMAL",
				channel: {id: "channel-late-submit"},
				onSubmit: () => {}
			}
		}
	});
	await submitPatch({
		methodArguments: [{value: "original text"}],
		stopOriginalMethodCall: () => {},
		originalMethod: payload => {
			submittedValues.push(payload.value);
			return Promise.resolve();
		},
		callOriginalMethodAfterwards: () => Promise.resolve()
	});

	enabled = false;
	plugin.clearAutoTranslationQueue("channel-late-submit");
	enabled = true;
	translateCallback("translated text", {id: "en"}, {id: "zh-CN"});
	await new Promise(resolve => setImmediate(resolve));

	assert.deepEqual(submittedValues, ["original text"]);
});

test("echoed automatic and prefixed sent translations restore their original text when editing", async () => {
	let submitPatch = null;
	let startEditBefore = null;
	const submittedValues = [];
	const plugin = createBasePluginInstance({
		callSetLanguages: false,
		settings: {
			prefixes: {
				translationPrefixData: [{prefix: "$fr", language: "fr"}]
			}
		},
		bdfdb: {
			DiscordConstants: {
				ChannelTextAreaTypes: {
					NORMAL: "NORMAL",
					SIDEBAR: "SIDEBAR"
				}
			},
			LibraryModules: {
				MessageUtils: {},
				MessageToolbarUtils: {}
			},
			PatchUtils: {
				forceAllUpdates: () => {},
				patch: (_plugin, _target, method, config) => {
					if (method == "onSubmit") submitPatch = config.instead;
					if (method == "startEditMessage") startEditBefore = config.before;
				}
			}
		},
		isTranslationEnabled: () => true,
		isOwnMessage: message => !!(message && message.author && message.author.id == "current-user")
	});
	plugin.forceUpdateAll = () => {};
	plugin.shouldAutoTranslateSentMessage = (_text, _channelId, callback) => callback(true);
	plugin.translateText = (_text, _place, callback) => callback("translated text", {id: "en"}, {id: "zh-CN"});
	plugin.buildSentTranslationMessageValue = () => "translated text";
	plugin.onStart();
	plugin.processChannelTextAreaContainer({
		instance: {
			props: {
				type: "NORMAL",
				channel: {id: "channel-edit-echo"},
				onSubmit: () => {}
			}
		}
	});

	await submitPatch({
		methodArguments: [{value: "original text"}],
		stopOriginalMethodCall: () => {},
		originalMethod: payload => {
			submittedValues.push(payload.value);
			return Promise.resolve();
		},
		callOriginalMethodAfterwards: () => Promise.resolve()
	});
	await new Promise(resolve => setImmediate(resolve));
	const echoedMessage = {
		id: "sent-echo-1",
		channel_id: "channel-edit-echo",
		content: "translated text",
		embeds: [],
		attachments: [],
		author: {id: "current-user"}
	};
	plugin.checkMessage({content: echoedMessage}, echoedMessage, {id: echoedMessage.channel_id}, {skipAutoQueue: true});
	const editEvent = {methodArguments: [echoedMessage.channel_id, echoedMessage.id, echoedMessage.content]};
	startEditBefore(editEvent);

	assert.deepEqual(submittedValues, ["translated text"]);
	assert.equal(editEvent.methodArguments[2], "original text");

	await submitPatch({
		methodArguments: [{value: "$fr bonjour"}],
		stopOriginalMethodCall: () => {},
		originalMethod: payload => {
			submittedValues.push(payload.value);
			return Promise.resolve();
		},
		callOriginalMethodAfterwards: () => Promise.resolve()
	});
	await new Promise(resolve => setImmediate(resolve));
	const prefixedMessage = {
		id: "sent-echo-prefix",
		channel_id: "channel-edit-echo",
		content: "translated text",
		embeds: [],
		attachments: [],
		author: {id: "current-user"}
	};
	plugin.checkMessage({content: prefixedMessage}, prefixedMessage, {id: prefixedMessage.channel_id}, {skipAutoQueue: true});
	const prefixedEditEvent = {methodArguments: [prefixedMessage.channel_id, prefixedMessage.id, prefixedMessage.content]};
	startEditBefore(prefixedEditEvent);

	assert.deepEqual(submittedValues, ["translated text", "translated text"]);
	assert.equal(prefixedEditEvent.methodArguments[2], "bonjour");
});

test("a sent original remains editable after the short echo-correlation window expires", () => {
	const realNow = Date.now;
	let now = realNow();
	Date.now = () => now;
	try {
		const plugin = createBasePluginInstance({
			callSetLanguages: false,
			isOwnMessage: message => !!(message && message.author && message.author.id == "current-user")
		});
		plugin.trackPendingSentOriginal("channel-edit-later", "original later", "translated later");
		plugin.captureSentOriginalMessage({
			id: "sent-edit-later",
			channel_id: "channel-edit-later",
			content: "translated later",
			author: {id: "current-user"}
		}, "channel-edit-later");

		now += 3 * 60 * 1000;

		assert.equal(plugin.getEditableSentMessageText("sent-edit-later", "translated later"), "original later");
	}
	finally {
		Date.now = realNow;
	}
});

test("no repaint lands while the user is actively scrolling through history", () => {
	// 2026-08-19 report: with auto-translate on, scrolling up through history kept
	// snapping the scroller back. Every landed transaction rebuilds the list and
	// restores a captured scroll state - mid-gesture that restore IS the snap-back.
	// The commit is already stored; the repaint defers until the scroll idles
	// (the scheduler re-checks canRepaintNow on its busy-retry cadence).
	const plugin = createPluginInstance({callSetLanguages: false});
	plugin.isTranslatorSettingsSurfaceOpen = () => false;
	plugin.isViewingMessageHistory = () => true;
	plugin.isUserActivelyScrollingMessages = () => true;
	assert.equal(plugin.canRepaintReceivedDisplayNow(), false, "a mid-scroll history view must not repaint");
	plugin.isUserActivelyScrollingMessages = () => false;
	assert.equal(plugin.canRepaintReceivedDisplayNow(), true, "the paint lands once the scroll idles");
	plugin.isUserActivelyScrollingMessages = () => true;
	plugin.isViewingMessageHistory = () => false;
	assert.equal(plugin.canRepaintReceivedDisplayNow(), true, "the live view keeps painting; the bottom lock owns that case");
});
