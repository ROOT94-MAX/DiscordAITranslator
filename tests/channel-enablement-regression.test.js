const test = require("node:test");
const assert = require("node:assert/strict");
const {createPluginInstance} = require("./helpers/createPluginInstance");

test("translator icon toggle stays channel-scoped even when legacy global mode was off", () => {
	const savedEntries = [];
	const persisted = {
		translationEnabledStates: [],
		receivedAutoTranslationEnabledStates: []
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		settings: {
			general: {
				usePerChatTranslation: false
			}
		},
		bdfdb: {
			ArrayUtils: {
				is: Array.isArray,
				remove: (array, value, removeAll = false) => {
					if (!Array.isArray(array)) return array;
					for (let index = array.length - 1; index >= 0; index--) {
						if (array[index] != value) continue;
						array.splice(index, 1);
						if (!removeAll) break;
					}
					return array;
				}
			},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = Array.isArray(value) ? value.slice() : value;
					savedEntries.push({key, value: persisted[key]});
				}
			}
		},
		mutatePlugin(instance) {
			instance.clearDisplayedAutoTranslations = () => {};
			instance.clearAutoTranslationQueue = () => {};
			instance.resetAutoTranslationTracking = () => {};
			instance.scheduleTranslationRerender = () => {};
			instance.processAutoTranslationQueue = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();
	const projectionPulses = [];
	plugin.ensureReceivedDisplayRuntime = () => ({pulseChannelProjection: channelId => (projectionPulses.push(channelId), true)});
	plugin.scheduleTranslationRerender = () => assert.fail("channel enablement must not schedule a whole-chat repaint");
	plugin.toggleTranslation("channel-1");

	assert.equal(plugin.isTranslationEnabled("channel-1"), true);
	assert.equal(plugin.isTranslationEnabled("channel-2"), false);
	assert.deepEqual(projectionPulses, ["channel-1"]);
	assert.deepEqual(persisted.translationEnabledStates, {
		globalDefault: false,
		channelOverrides: {
			"channel-1": true
		}
	});
});

test("legacy received auto toggle delegates to the unified channel toggle state", () => {
	const persisted = {
		translationEnabledStates: {
			globalDefault: false,
			channelOverrides: {}
		},
		receivedAutoTranslationEnabledStates: {
			globalDefault: false,
			channelOverrides: {}
		}
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ArrayUtils: {
				is: Array.isArray
			},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
					save: (value, _plugin, key) => {
						persisted[key] = JSON.parse(JSON.stringify(value));
					}
			}
		},
		mutatePlugin(instance) {
			instance.clearDisplayedAutoTranslations = () => {};
			instance.clearAutoTranslationQueue = () => {};
			instance.resetAutoTranslationTracking = () => {};
			instance.clearLoadedAutoTranslationStatus = () => {};
			instance.scheduleTranslationRerender = () => {};
			instance.processAutoTranslationQueue = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();
	plugin.toggleReceivedAutoTranslation("channel-compat");

	assert.equal(plugin.isTranslationEnabled("channel-compat"), true);
	assert.equal(plugin.isReceivedAutoTranslationEnabled("channel-compat"), true);
	assert.equal(plugin.isTranslationEnabled("channel-other"), false);
});

test("legacy global toggle migrates to inherited-off", () => {
	const persisted = {
		translationEnabledStates: ["global"],
		receivedAutoTranslationEnabledStates: []
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ArrayUtils: {
				is: Array.isArray
			},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = Array.isArray(value) ? value.slice() : value;
				}
			}
		},
		mutatePlugin(instance) {
			instance.clearAutoTranslationQueue = () => {};
			instance.resetAutoTranslationTracking = () => {};
			instance.clearLoadedAutoTranslationStatus = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();

	assert.equal(plugin.isTranslationEnabled("channel-1"), false);
	assert.equal(plugin.isTranslationEnabled("channel-2"), false);
	assert.deepEqual(persisted.translationEnabledStates, {
		globalDefault: false,
		channelOverrides: {}
	});
	assert.deepEqual(persisted.receivedAutoTranslationEnabledStates, {
		globalDefault: false,
		channelOverrides: {}
	});
});

test("received and reply preview signatures stay channel-isolated even when legacy global mode was off", () => {
	const plugin = createPluginInstance({
		callSetLanguages: false,
		settings: {
			general: {
				usePerChatTranslation: false
			}
		}
	});
	const message = {
		id: "message-1",
		content: "hello world",
		embeds: []
	};
	const originalContentData = {content: "hello world", embeds: []};

	const receivedChannelOne = JSON.parse(plugin.createReceivedTranslationSignature(message, "channel-1", originalContentData));
	const receivedChannelTwo = JSON.parse(plugin.createReceivedTranslationSignature(message, "channel-2", originalContentData));
	const replyPreviewChannelOne = JSON.parse(plugin.createReplyPreviewSignature(message, "channel-1", "hello world"));
	const replyPreviewChannelTwo = JSON.parse(plugin.createReplyPreviewSignature(message, "channel-2", "hello world"));

	assert.equal(receivedChannelOne.channelId, "channel-1");
	assert.equal(receivedChannelTwo.channelId, "channel-2");
	assert.notEqual(receivedChannelOne.channelId, receivedChannelTwo.channelId);
	assert.equal(replyPreviewChannelOne.channelId, "channel-1");
	assert.equal(replyPreviewChannelTwo.channelId, "channel-2");
	assert.notEqual(replyPreviewChannelOne.channelId, replyPreviewChannelTwo.channelId);
});

test("legacy translationEnabledStates stays the primary migration source over received auto state", () => {
	const persisted = {
		translationEnabledStates: ["channel-1"],
		receivedAutoTranslationEnabledStates: ["global"]
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ArrayUtils: {
				is: Array.isArray
			},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = Array.isArray(value) ? value.slice() : value;
				}
			}
		},
		mutatePlugin(instance) {
			instance.clearAutoTranslationQueue = () => {};
			instance.resetAutoTranslationTracking = () => {};
			instance.clearLoadedAutoTranslationStatus = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();

	assert.equal(plugin.isTranslationEnabled("channel-1"), true);
	assert.equal(plugin.isTranslationEnabled("channel-2"), false);
	assert.deepEqual(persisted.translationEnabledStates, {
		globalDefault: false,
		channelOverrides: {
			"channel-1": true
		}
	});
	assert.deepEqual(persisted.receivedAutoTranslationEnabledStates, {
		globalDefault: false,
		channelOverrides: {
			"channel-1": true
		}
	});
});

test("migration preserves explicit channel records found only in the compatibility state", () => {
	const persisted = {
		translationEnabledStates: {
			globalDefault: true,
			channelOverrides: {
				"channel-conflict": false
			}
		},
		receivedAutoTranslationEnabledStates: {
			globalDefault: true,
			channelOverrides: {
				"channel-compat-only": true,
				"channel-compat-false": false,
				"channel-conflict": true
			}
		}
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ArrayUtils: {is: Array.isArray},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = JSON.parse(JSON.stringify(value));
				}
		}
	},
		mutatePlugin(instance) {
			instance.clearAutoTranslationQueue = () => {};
			instance.resetAutoTranslationTracking = () => {};
			instance.clearLoadedAutoTranslationStatus = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();

	assert.equal(plugin.isTranslationEnabled("channel-compat-only"), true);
	assert.equal(plugin.isTranslationEnabled("channel-compat-false"), false);
	assert.equal(plugin.isTranslationEnabled("channel-conflict"), false);
	assert.deepEqual(persisted.translationEnabledStates, {
		globalDefault: false,
		channelOverrides: {
			"channel-compat-only": true,
			"channel-compat-false": false,
			"channel-conflict": false
		}
	});
});

test("structured global state migrates to off while preserving explicit channel records", () => {
	const persisted = {
		translationEnabledStates: {
			globalDefault: true,
			channelOverrides: {
				"channel-1": false,
				"channel-2": true
			}
		},
		receivedAutoTranslationEnabledStates: {
			globalDefault: true,
			channelOverrides: {
				"channel-1": false,
				"channel-2": true
			}
		}
	};
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ArrayUtils: {
				is: Array.isArray
			},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = Array.isArray(value) ? value.slice() : JSON.parse(JSON.stringify(value));
				}
			}
		},
		mutatePlugin(instance) {
			instance.clearDisplayedAutoTranslations = () => {};
			instance.clearAutoTranslationQueue = () => {};
			instance.resetAutoTranslationTracking = () => {};
			instance.clearLoadedAutoTranslationStatus = () => {};
			instance.scheduleTranslationRerender = () => {};
			instance.processAutoTranslationQueue = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();
	assert.equal(plugin.isTranslationEnabled("channel-1"), false);
	assert.equal(plugin.isTranslationEnabled("channel-2"), true);
	assert.equal(plugin.isTranslationEnabled("channel-3"), false);
	assert.deepEqual(persisted.translationEnabledStates, {
		globalDefault: false,
		channelOverrides: {
			"channel-1": false,
			"channel-2": true
		}
	});

	plugin.toggleTranslation("channel-2");

	assert.equal(plugin.isTranslationEnabled("channel-2"), false);
	assert.deepEqual(persisted.translationEnabledStates, {
		globalDefault: false,
		channelOverrides: {
			"channel-1": false
		}
	});
});

test("turning off an explicitly enabled channel clears only that channel runtime state", async () => {
	const persisted = {
		translationEnabledStates: {
			globalDefault: true,
			channelOverrides: {
				"channel-1": true
			}
		},
		receivedAutoTranslationEnabledStates: {
			globalDefault: true,
			channelOverrides: {
				"channel-1": true
			}
		}
	};
	const clearedDisplayChannels = [];
	const clearedQueueChannels = [];
	const resetTrackingChannels = [];
	const plugin = createPluginInstance({
		callSetLanguages: false,
		bdfdb: {
			ArrayUtils: {
				is: Array.isArray
			},
			DataUtils: {
				load: (_plugin, key) => persisted[key],
				save: (value, _plugin, key) => {
					persisted[key] = Array.isArray(value) ? value.slice() : JSON.parse(JSON.stringify(value));
				}
			}
		},
		mutatePlugin(instance) {
			instance.clearDisplayedAutoTranslations = channelId => {
				clearedDisplayChannels.push(channelId);
			};
			instance.clearAutoTranslationQueue = channelId => {
				clearedQueueChannels.push(channelId);
			};
			instance.resetAutoTranslationTracking = channelId => {
				resetTrackingChannels.push(channelId);
			};
			instance.clearLoadedAutoTranslationStatus = () => {};
			instance.scheduleTranslationRerender = () => {};
			instance.processAutoTranslationQueue = () => {};
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	plugin.forceUpdateAll();
	clearedDisplayChannels.length = 0;
	clearedQueueChannels.length = 0;
	resetTrackingChannels.length = 0;
	await plugin.toggleTranslation("channel-1");

	assert.deepEqual(clearedDisplayChannels, ["channel-1"]);
	assert.deepEqual(clearedQueueChannels, ["channel-1"]);
	assert.deepEqual(resetTrackingChannels, ["channel-1"]);
	assert.equal(plugin.isTranslationEnabled("channel-1"), false);
	assert.equal(plugin.isTranslationEnabled("channel-2"), false);
});

test("translate button tooltip no longer describes a global toggle when legacy global mode was off", () => {
	const plugin = createPluginInstance({
		callSetLanguages: false,
		settings: {
			general: {
				usePerChatTranslation: false
			}
		},
		mutatePlugin(instance) {
			instance.isChineseUiLanguage = () => false;
			instance.isTranslationEnabled = Object.getPrototypeOf(instance).isTranslationEnabled.bind(instance);
		}
	});

	const tooltipText = plugin.getTranslateButtonTooltipText("channel-1");

	assert.match(tooltipText, /this channel/i);
	assert.doesNotMatch(tooltipText, /global/i);
});

test("global automatic translation default API is removed", () => {
	const plugin = createPluginInstance({callSetLanguages: false});

	assert.equal(plugin.getGlobalTranslationEnabledDefault, undefined);
	assert.equal(plugin.setGlobalTranslationEnabledDefault, undefined);
});
