const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function createPluginInstance() {
	class BasePlugin {}
	const BDFDB = {
		ArrayUtils: {
			is: Array.isArray
		},
		DiscordObjects: {
			Message: class Message {
				constructor(data) {
					Object.assign(this, data);
				}
			}
		},
		ObjectUtils: {
			isEmpty: object => !object || !Object.keys(object).length
		},
		LibraryStores: {
			ChannelStore: {
				getChannel: () => null
			}
		},
		UserUtils: {
			me: {id: "current-user"}
		}
	};
	global.BdApi = {
		React: {
			Component: class Component {}
		}
	};
	global.window = {
		BDFDB_Global: {
			loaded: true,
			started: true,
			PluginUtils: {
				buildPlugin: () => [BasePlugin, BDFDB]
			}
		}
	};

	const pluginPath = path.resolve(__dirname, "..", "DiscordAITranslator.plugin.js");
	delete require.cache[pluginPath];
	const PluginClass = require(pluginPath);
	const plugin = new PluginClass();
	plugin.settings = {
		general: {
			protectQuotedText: true,
			usePerChatTranslation: true
		},
		exceptions: {
			wordStart: ["!"],
			protectedTerms: [],
			wrapperPairs: []
		},
		engines: {
			translator: "googleapi",
			backup: "----"
		},
		filters: {
			minimumAutoTranslateLength: 6,
			receivedAutoTranslateLoadedTimeWindow: "1h",
			skipMixedReceivedMessages: true,
			skipSameLanguageReceivedMessages: true,
			treatLanguageVariantsAsSame: true,
			dropSimilarTranslations: true,
			translationSimilarityThreshold: 0.9
		},
		choices: {
			received: {input: "auto", output: "en"},
			sent: {input: "auto", output: "en"}
		}
	};
	plugin.defaults = {
		choices: {
			received: {value: {input: "auto", output: "en"}},
			sent: {value: {input: "auto", output: "en"}}
		},
		general: {}
	};
	plugin.isTranslationEnabled = () => true;
	plugin.isOwnMessage = () => false;
	return plugin;
}

test("emoji inside a word no longer protects the surrounding text", () => {
	const plugin = createPluginInstance();
	const [maskedText, excepts, shouldTranslate] = plugin.removeExceptions("hello😊world", "sent");

	assert.equal(shouldTranslate, true);
	assert.match(maskedText, /^hello\{\{\d+\}\}world$/);
	assert.deepEqual(Object.values(excepts), ["😊"]);
	assert.equal(plugin.addExceptions(maskedText, excepts), "hello😊world");
});

test("messages that already contain translation plus quoted original extract the original for re-translation", () => {
	const plugin = createPluginInstance();
	const originalContentData = plugin.extractOriginalContentData({
		id: "message-1",
		content: "Hola amigo\n> hello friend",
		embeds: []
	});

	assert.equal(originalContentData.content, "hello friend");
	assert.equal(plugin.buildTranslationRequestText(originalContentData), "hello friend");
});

test("short CJK terms can still pass the auto-translate length gate", () => {
	const plugin = createPluginInstance();
	const message = {
		id: "message-2",
		content: "焚决",
		embeds: [],
		author: {id: "other-user"}
	};
	const channel = {id: "channel-1"};

	assert.equal(plugin.shouldAutoTranslateReceivedMessage(message, channel, null, true), true);
	assert.equal(plugin.getAutoTranslateMinimumLengthForAnalysis({dominantFamily: "han", totalLetters: 2}), 2);
});

test("new-only scope skips the messages that are already loaded when a channel session starts", () => {
	const plugin = createPluginInstance();
	const recordedOptions = [];
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	plugin.checkMessage = (_stream, _message, _channel, options) => {
		recordedOptions.push(options);
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: "channel-1"},
				channelStream: [{
					content: {
						id: "100",
						attachments: [],
						content: "hello"
					}
				}]
			}
		}
	});

	assert.equal(recordedOptions.length, 1);
	assert.equal(recordedOptions[0].skipAutoQueue, true);
	assert.equal(plugin.getAutoTranslationChannelState("channel-1").initialized, true);
	assert.equal(plugin.getAutoTranslationChannelState("channel-1").boundaryMessageId, "100");
});

test("loaded-messages scope allows the currently loaded messages to enter the auto-translate flow", () => {
	const plugin = createPluginInstance();
	const recordedOptions = [];
	plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
	plugin.checkMessage = (_stream, _message, _channel, options) => {
		recordedOptions.push(options);
	};

	plugin.processMessages({
		instance: {
			props: {
				channel: {id: "channel-2"},
				channelStream: [{
					content: {
						id: "200",
						attachments: [],
						content: "hello"
					}
				}]
			}
		}
	});

	assert.equal(recordedOptions.length, 1);
	assert.equal(recordedOptions[0].skipAutoQueue, false);
	assert.equal(plugin.getAutoTranslationChannelState("channel-2").initialized, true);
	assert.equal(plugin.getAutoTranslationChannelState("channel-2").boundaryMessageId, "200");
});

test("new-only scope does not queue visible reply preview translations during the first channel render", () => {
	const plugin = createPluginInstance();
	let queuedCount = 0;
	plugin.settings.filters.receivedAutoTranslateScope = "new_only";
	plugin.getCachedReceivedTranslation = () => null;
	plugin.queueReplyPreviewTranslation = () => {
		queuedCount++;
	};

	plugin.processMessageReply({
		instance: {
			props: {
				baseMessage: {channel_id: "channel-3"},
				referencedMessage: {
					message: {
						id: "reply-1",
						content: "hello",
						author: {id: "other-user"}
					}
				}
			}
		}
	});

	assert.equal(queuedCount, 0);
});

test("loaded-messages scope can still queue visible reply preview translations immediately", () => {
	const plugin = createPluginInstance();
	let queuedCount = 0;
	plugin.settings.filters.receivedAutoTranslateScope = "loaded_messages";
	plugin.getCachedReceivedTranslation = () => null;
	plugin.queueReplyPreviewTranslation = () => {
		queuedCount++;
	};

	plugin.processMessageReply({
		instance: {
			props: {
				baseMessage: {channel_id: "channel-4"},
				referencedMessage: {
					message: {
						id: "reply-2",
						content: "hello",
						author: {id: "other-user"}
					}
				}
			}
		}
	});

	assert.equal(queuedCount, 1);
});

test("disabled channel auto-translation leaves reply previews untouched", () => {
	const plugin = createPluginInstance();
	const originalContent = "Hola amigo\n> hello friend";
	plugin.isTranslationEnabled = () => false;
	plugin.getCachedReceivedTranslation = () => {
		throw new Error("reply preview should not read translation cache while disabled");
	};
	plugin.queueReplyPreviewTranslation = () => {
		throw new Error("reply preview should not queue translation while disabled");
	};

	const event = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-disabled"},
				referencedMessage: {
					message: {
						id: "reply-disabled",
						content: originalContent,
						author: {id: "other-user"}
					}
				}
			}
		}
	};

	plugin.processMessageReply(event);

	assert.equal(event.instance.props.referencedMessage.message.content, originalContent);
});

test("disabled channel auto-translation hides stored reply preview translations", () => {
	const plugin = createPluginInstance();
	const originalContent = "Top up at half price";
	const referencedMessage = {
		id: "reply-stored-disabled",
		channel_id: "channel-disabled",
		content: originalContent,
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(referencedMessage, {
		channelId: "channel-disabled",
		auto: false,
		content: "半价充值",
		translatedContent: "半价充值",
		originalContent,
		embeds: {}
	});
	plugin.isTranslationEnabled = () => false;

	const event = {
		instance: {
			props: {
				baseMessage: {channel_id: "channel-disabled"},
				referencedMessage: {
					message: referencedMessage
				}
			}
		}
	};

	plugin.processMessageReply(event);

	assert.equal(event.instance.props.referencedMessage.message.content, originalContent);
});

test("disabled channel auto-translation restores stale automatic message content", () => {
	const plugin = createPluginInstance();
	const message = {
		id: "stale-auto-disabled",
		channel_id: "channel-disabled",
		content: "Top up at half price",
		embeds: [],
		author: {id: "other-user"}
	};
	plugin.applyStoredTranslationToMessage(message, {
		channelId: "channel-disabled",
		auto: true,
		content: "半价充值",
		translatedContent: "半价充值",
		originalContent: "Top up at half price",
		embeds: {}
	});
	plugin.isTranslationEnabled = () => false;

	const event = {
		instance: {
			props: {
				message
			}
		},
		returnvalue: {
			props: {
				children: []
			}
		}
	};

	plugin.processMessageContent(event);

	assert.equal(event.instance.props.message.content, "Top up at half price");
	assert.deepEqual(event.returnvalue.props.children, []);
});

test("historical loaded messages outside the configured time window are skipped", () => {
	const plugin = createPluginInstance();
	let processCount = 0;
	plugin.settings.filters.receivedAutoTranslateLoadedTimeWindow = "15m";
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.processAutoTranslationQueue = () => {
		processCount++;
	};

	plugin.queueAutoTranslateMessage({
		id: "history-1",
		content: "hello",
		timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
		author: {id: "other-user"}
	}, {id: "channel-5"}, {content: "hello"}, {
		historicalLoad: true,
		deferWhileReading: true
	});

	assert.equal(processCount, 0);
});

test("historical loaded messages are deferred while browsing history, but new messages still run first", async () => {
	const plugin = createPluginInstance();
	let retryCount = 0;
	let translatedIds = [];
	plugin.settings.filters.receivedAutoTranslateLoadedTimeWindow = "24h";
	plugin.shouldAutoTranslateReceivedMessage = () => true;
	plugin.isViewingMessageHistory = () => true;
	plugin.scheduleAutoTranslationQueueRetry = () => {
		retryCount++;
	};
	plugin.translateMessage = message => {
		translatedIds.push(message.id);
		return Promise.resolve(true);
	};

	plugin.queueAutoTranslateMessage({
		id: "history-2",
		content: "hello",
		timestamp: new Date().toISOString(),
		author: {id: "other-user"},
		embeds: []
	}, {id: "channel-6"}, {content: "hello"}, {
		historicalLoad: true,
		deferWhileReading: true
	});
	plugin.queueAutoTranslateMessage({
		id: "new-1",
		content: "hello",
		timestamp: new Date().toISOString(),
		author: {id: "other-user"},
		embeds: []
	}, {id: "channel-6"}, {content: "hello"}, {
		historicalLoad: false,
		deferWhileReading: false
	});

	await new Promise(resolve => setTimeout(resolve, 0));

	assert.equal(retryCount >= 1, true);
	assert.deepEqual(translatedIds, ["new-1"]);
});

test("late auto-translation results are ignored after the channel toggle is disabled", async () => {
	const plugin = createPluginInstance();
	let enabled = true;
	let applyCount = 0;
	plugin.isTranslationEnabled = () => enabled;
	plugin.applyStoredTranslationToMessage = () => {
		applyCount++;
		return {};
	};
	plugin.persistTranslationCacheEntry = () => {};
	plugin.scheduleTranslationRerender = () => {};
	plugin.translateText = (_text, _place, callback) => {
		enabled = false;
		callback("你好，世界", {id: "en"}, {id: "zh-CN"});
	};

	const result = await plugin.translateMessage({
		id: "late-auto-1",
		content: "hello world",
		embeds: [],
		attachments: [],
		author: {id: "other-user"}
	}, {id: "channel-late-auto"}, {
		auto: true,
		silent: true,
		trackBusy: false
	});

	assert.equal(result, false);
	assert.equal(applyCount, 0);
});
