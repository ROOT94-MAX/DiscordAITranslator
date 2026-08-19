const test = require("node:test");
const assert = require("node:assert/strict");
const {MESSAGE_DIRECTIONS, createTranslationDisplayLogic} = require("../src/display/translation-display-logic");

// The module keeps `plugin` as the first parameter of every method, so these tests never
// build a plugin: they hand in a plain object carrying only the collaborators the method
// under test actually reaches. The two fakes below mirror the real behaviour closely
// enough that composition, eviction and the render mutations are observable.

// Mirrors the legacy Translator methods the display logic leans on. Anything a specific
// test needs to observe is overridden through `overrides`.
function createFakePlugin(overrides = {}) {
	const calls = [];
	const display = createFakeDisplayRuntime(calls);
	const plugin = {
		calls,
		display,
		settings: {
			general: {
				showOriginalMessage: false,
				showOriginalDirectly: false,
				showOriginalInReplyPreview: false,
				highlightTranslatedMessages: false
			}
		},
		labels: {translated_watermark: "translated"},
		ensureReceivedDisplayRuntime: () => display,
		shouldUseSpoilerInReceivedOriginal: () => false,
		formatOriginalTextForMessage(originalText, useSpoiler) {
			if (!originalText) return "";
			if (useSpoiler) return `\n||${originalText}||`;
			return `\n> ${originalText.split("\n").join("\n> ")}`;
		},
		// The real one also rescues legacy combined content; the split fields are what the
		// display logic reads, so the fake only has to copy and trim them.
		normalizeStoredTranslationData(translation) {
			if (!translation) return translation;
			const normalized = Object.assign({}, translation);
			normalized.translatedContent = (normalized.translatedContent || "").trim();
			if (normalized.originalContent != null) normalized.originalContent = String(normalized.originalContent);
			return normalized;
		},
		extractOriginalContentData: message => ({content: message.content, embeds: []}),
		getMessageChannelId: message => message && (message.channel_id || null),
		isTranslationEnabled: () => true,
		isTranslationResultTooSimilar: () => false,
		clearCachedTranslation(messageId) {
			calls.push(["clearCachedTranslation", messageId]);
		},
		isOwnMessage: () => false,
		getReceivedAutoTranslateScope: () => "new_only",
		ensureLiveTranslationQueue: () => ({isMessageQueued: () => false}),
		getReceivedDisplayRuntimeView: () => null,
		getCachedReceivedTranslation: () => null,
		isLikelyLiveAutoTranslateMessage: () => false,
		shouldAutoTranslateReceivedMessage: () => false,
		queueAutoTranslateMessage(message, channel, originalContentData, options) {
			calls.push(["queueAutoTranslateMessage", message.id, channel.id, options]);
		},
		getReplyPreviewTranslation: () => null,
		shouldAutoTranslateReplyPreview: () => false,
		queueReplyPreviewTranslation(message, channelId) {
			calls.push(["queueReplyPreviewTranslation", message.id, channelId]);
		},
		markReplyPreviewRenderMessage(message, options) {
			calls.push(["markReplyPreviewRenderMessage", message.id, options]);
		},
		stripTranslatorStylingFromReplyPreviewNode: node => node,
		wrapReplyPreviewJumpPause: node => node,
		getDisplayedTranslationChannelId: () => null,
		getTranslationTooltipText: (input, output) => `${input && input.id}->${output && output.id}`,
		isMessageTranslationPending: () => false,
		isChineseUiLanguage: () => false,
		getTranslatedTextColor: () => "#abcdef",
		shouldProtectWrappedTextForPlace(place) {
			calls.push(["shouldProtectWrappedTextForPlace", place]);
			return false;
		},
		highlightProtectedWrappedTextInNode: children => children,
		createOriginalMessageBlock: originalContent => ({type: "original-block", props: {originalContent}}),
		ensureElementChildrenArray(element) {
			if (!element || !element.props) return [];
			if (!Array.isArray(element.props.children)) element.props.children = element.props.children == null ? [] : [element.props.children];
			return element.props.children;
		},
		cleanupInjectedMessageChildren(children) {
			calls.push(["cleanupInjectedMessageChildren", children.length]);
		}
	};
	return Object.assign(plugin, overrides);
}

// Stands in for ensureReceivedDisplayRuntime(). Records the mutating calls so the tests
// can assert on eviction, and freezes stored records so an accidental in-place recompose
// of a store record would throw instead of silently corrupting the store.
function createFakeDisplayRuntime(calls) {
	const displayStates = new Map();
	const previews = new Map();
	const previewCandidates = new Map();
	const projections = new Map();
	const archives = new Map();
	const suppressed = new Set();
	return {
		displayStates,
		previews,
		previewCandidates,
		projections,
		archives,
		suppressed,
		getDisplayState: messageId => displayStates.get(messageId) || null,
		getPreviewTranslation: messageId => previews.get(messageId) || null,
		getPreviewCandidates: messageId => previewCandidates.get(messageId) || [],
		getReplyPreviewProjection: messageId => projections.get(messageId) || null,
		peekSourceArchive: messageId => archives.get(messageId) || null,
		hasSourceArchive: messageId => archives.has(messageId),
		consumeSourceArchive(messageId) {
			const archive = archives.get(messageId) || null;
			archives.delete(messageId);
			calls.push(["consumeSourceArchive", messageId]);
			return archive;
		},
		isSuppressed: messageId => suppressed.has(messageId),
		clearSuppression(messageId) {
			suppressed.delete(messageId);
			calls.push(["clearSuppression", messageId]);
		},
		commitManualTranslation(request) {
			displayStates.set(request.messageId, {status: "translated", channelId: request.channelId, translation: Object.freeze(request.translation)});
			calls.push(["commitManualTranslation", request]);
		},
		clearDisplayedTranslation(messageId, options) {
			displayStates.delete(messageId);
			calls.push(["clearDisplayedTranslation", messageId, options]);
		},
		clearPreview(messageId) {
			previews.delete(messageId);
			calls.push(["clearPreview", messageId]);
		}
	};
}

function createFakeBDFDB() {
	function Message(data) {
		Object.assign(this, data);
	}
	return {
		DiscordObjects: {Message},
		LibraryComponents: {TooltipContainer: "TooltipContainer"},
		ReactUtils: {
			createElement: (type, props) => ({type, props}),
			// Depth-first walk for the one shape processEmbed asks for: the child array and
			// index of the node whose className matches.
			findParent(node, filter) {
				const [[key, value]] = filter.props;
				let found = [null, -1];
				const visit = children => {
					if (!Array.isArray(children)) return;
					for (let index = 0; index < children.length; index++) {
						const child = children[index];
						if (!child || typeof child != "object") continue;
						if (child.props && child.props[key] == value) {
							found = [children, index];
							return;
						}
						if (child.props) visit(Array.isArray(child.props.children) ? child.props.children : [child.props.children]);
						if (found[1] > -1) return;
					}
				};
				visit([node]);
				return found;
			}
		},
		DOMUtils: {formatClassName: (...names) => names.filter(Boolean).join(" ")},
		disCN: {
			messagetimestamp: "timestamp",
			messagetimestampinline: "timestamp-inline",
			_translatortranslated: "translator-translated",
			messageedited: "edited",
			embeddescription: "embed-description"
		}
	};
}

function createLogic() {
	return createTranslationDisplayLogic({BDFDB: createFakeBDFDB()});
}

test("MESSAGE_DIRECTIONS keeps the legacy messageTypes values", () => {
	assert.deepEqual({...MESSAGE_DIRECTIONS}, {RECEIVED: "received", SENT: "sent"});
});

test("buildReceivedDisplayContent appends the original only when the settings ask for it", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	assert.equal(logic.buildReceivedDisplayContent(plugin, "  Hello  ", "Hallo"), "Hello");

	plugin.settings.general.showOriginalMessage = true;
	assert.equal(logic.buildReceivedDisplayContent(plugin, "Hello", "Hallo"), "Hello\n> Hallo");

	// A stale persisted value from the removed duplicate mode is ignored.
	plugin.settings.general.showOriginalDirectly = true;
	assert.equal(logic.buildReceivedDisplayContent(plugin, "Hello", "Hallo"), "Hello\n> Hallo");

	// The forced flag is what the manual translation path uses to inline regardless.
	assert.equal(logic.buildReceivedDisplayContent(plugin, "Hello", "Hallo", true), "Hello\n> Hallo");
});

test("buildReceivedDisplayContent uses the spoiler form when the plugin asks for it", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({shouldUseSpoilerInReceivedOriginal: () => true});
	plugin.settings.general.showOriginalMessage = true;
	assert.equal(logic.buildReceivedDisplayContent(plugin, "Hello", "Hallo"), "Hello\n||Hallo||");
});

test("refreshTranslationDisplay recomposes content in place and flags the inlined original", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.showOriginalMessage = true;
	const translation = {translatedContent: "Hello", originalContent: "Hallo", content: "stale text"};
	const refreshed = logic.refreshTranslationDisplay(plugin, translation);
	assert.equal(refreshed, translation, "the caller's copy is recomposed in place");
	assert.equal(refreshed.content, "Hello\n> Hallo");
	assert.equal(refreshed.contentIncludesOriginal, true);

	plugin.settings.general.showOriginalMessage = false;
	const plain = logic.refreshTranslationDisplay(plugin, {translatedContent: "Hello", originalContent: "Hallo"});
	assert.equal(plain.content, "Hello");
	assert.equal(plain.contentIncludesOriginal, false);
	assert.equal(logic.refreshTranslationDisplay(plugin, null), null);
});

test("refreshTranslationDisplay falls back to the stored content when no split translation exists", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	const refreshed = logic.refreshTranslationDisplay(plugin, {content: "Legacy body", originalContent: "Hallo"});
	assert.equal(refreshed.content, "Legacy body");
});

test("applyStoredTranslationToMessage composes, clears suppression and archives the source", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.showOriginalMessage = true;
	plugin.display.suppressed.add("m1");
	const message = {id: "m1", channel_id: "c1", content: "Hallo"};
	const stored = logic.applyStoredTranslationToMessage(plugin, message, {translatedContent: "Hello", originalContent: "Hallo", auto: false, independentOfTextAreaSwitch: true});

	assert.equal(stored.content, "Hello\n> Hallo");
	assert.equal(stored.channelId, "c1", "the channel falls back to the message's own channel");
	assert.equal(plugin.display.isSuppressed("m1"), false);
	const commit = plugin.calls.find(call => call[0] == "commitManualTranslation")[1];
	assert.equal(commit.messageId, "m1");
	assert.equal(commit.channelId, "c1");
	assert.equal(commit.manualOptions.independentOfTextAreaSwitch, true);
	assert.equal(commit.archive.message.content, "Hallo", "the untranslated body is archived for the restore path");
	assert.notEqual(commit.archive.message, message, "the archive holds a clone, not the live message object");
	assert.deepEqual(commit.archive.originalContentData, {content: "Hallo", embeds: []});
	assert.equal(logic.applyStoredTranslationToMessage(plugin, null, {}), null);
});

test("getActiveMessageTranslation composes a detached copy and leaves the store record alone", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.showOriginalMessage = true;
	const record = Object.freeze({translatedContent: "Hello", originalContent: "Hallo", content: "Hello", channelId: "c1", auto: true});
	plugin.display.displayStates.set("m1", {status: "translated", translation: record});

	const translation = logic.getActiveMessageTranslation(plugin, {id: "m1"}, "c1");
	assert.equal(translation.content, "Hello\n> Hallo");
	assert.equal(record.content, "Hello", "the frozen store record is untouched");
	assert.equal(plugin.calls.some(call => call[0] == "clearDisplayedTranslation"), false);
});

test("getActiveMessageTranslation evicts on a signature mismatch", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.display.displayStates.set("m1", {status: "translated", translation: {translatedContent: "Hello", signature: "sig-a", channelId: "c1"}});
	assert.equal(logic.getActiveMessageTranslation(plugin, {id: "m1"}, "c1", "sig-b"), null);
	assert.equal(plugin.display.displayStates.has("m1"), false);
	// Matching signatures survive.
	plugin.display.displayStates.set("m2", {status: "translated", translation: {translatedContent: "Hello", signature: "sig-a", channelId: "c1"}});
	assert.ok(logic.getActiveMessageTranslation(plugin, {id: "m2"}, "c1", "sig-a"));
});

test("getActiveMessageTranslation drops an auto translation once its channel is switched off", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({isTranslationEnabled: channelId => channelId != "c1"});
	plugin.display.displayStates.set("m1", {status: "translated", translation: {translatedContent: "Hello", channelId: "c1", auto: true}});
	assert.equal(logic.getActiveMessageTranslation(plugin, {id: "m1"}, "c1"), null);
	assert.equal(plugin.display.displayStates.has("m1"), false);

	// A manual translation pinned as independent stays visible through the same switch.
	plugin.display.displayStates.set("m2", {status: "translated", translation: {translatedContent: "Hello", channelId: "c1", manual: true, independentOfTextAreaSwitch: true}});
	assert.ok(logic.getActiveMessageTranslation(plugin, {id: "m2"}, "c1"));
});

test("getActiveMessageTranslation clears the cache when an auto result came back too similar", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({isTranslationResultTooSimilar: () => true});
	plugin.display.displayStates.set("m1", {status: "translated", translation: {translatedContent: "Hello", channelId: "c1", auto: true}});
	assert.equal(logic.getActiveMessageTranslation(plugin, {id: "m1"}, "c1"), null);
	assert.ok(plugin.calls.some(call => call[0] == "clearCachedTranslation" && call[1] == "m1"));
});

test("getActiveMessageTranslation ignores records that are not in the translated state", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.display.displayStates.set("m1", {status: "pending", translation: {translatedContent: "Hello"}});
	assert.equal(logic.getActiveMessageTranslation(plugin, {id: "m1"}, "c1"), null);
	assert.equal(logic.getActiveMessageTranslation(plugin, null, "c1"), null);
});

test("clearDisplayedTranslationState keeps the archive and honours its options", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	logic.clearDisplayedTranslationState(plugin, "m1");
	const [, , options] = plugin.calls.find(call => call[0] == "clearDisplayedTranslation");
	assert.deepEqual(options, {preserveArchive: true, preserveSuppressed: false, clearPreview: false});
	assert.ok(plugin.calls.some(call => call[0] == "clearSuppression" && call[1] == "m1"));
	assert.equal(plugin.calls.some(call => call[0] == "clearPreview"), false);

	const preserving = createFakePlugin();
	logic.clearDisplayedTranslationState(preserving, "m1", {preserveSuppressed: true, clearReplyPreview: true});
	assert.equal(preserving.calls.some(call => call[0] == "clearSuppression"), false);
	assert.ok(preserving.calls.some(call => call[0] == "clearPreview" && call[1] == "m1"));
});

test("getStoredTranslationChannelId walks the fallback chain in order", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	assert.equal(logic.getStoredTranslationChannelId(plugin, "m1", "explicit", {channelId: "from-translation"}), "explicit");
	assert.equal(logic.getStoredTranslationChannelId(plugin, "m1", null, {channelId: "from-translation"}), "from-translation");

	// The store's display record carries the channel at the top level, next to `status`.
	plugin.display.displayStates.set("m1", {status: "translated", channelId: "from-display", translation: {}});
	assert.equal(logic.getStoredTranslationChannelId(plugin, "m1"), "from-display");
	plugin.display.displayStates.delete("m1");

	plugin.display.previews.set("m1", {channelId: "from-preview"});
	assert.equal(logic.getStoredTranslationChannelId(plugin, "m1"), "from-preview");
	plugin.display.previews.delete("m1");

	plugin.display.archives.set("m1", {message: {channel_id: "from-archive"}});
	assert.equal(logic.getStoredTranslationChannelId(plugin, "m1"), "from-archive");
	plugin.display.archives.delete("m1");

	assert.equal(logic.getStoredTranslationChannelId(plugin, "m1"), null);
});

test("getStoredTranslationOriginalContent prefers the stored original over the fallback", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	assert.equal(logic.getStoredTranslationOriginalContent(plugin, {originalContent: "Hallo"}, "fallback"), "Hallo");
	assert.equal(logic.getStoredTranslationOriginalContent(plugin, {originalContent: ""}, "fallback"), "");
	assert.equal(logic.getStoredTranslationOriginalContent(plugin, {}, "fallback"), "fallback");
	assert.equal(logic.getStoredTranslationOriginalContent(plugin, null, "fallback"), "fallback");
});

test("prepareMessageContentDisplay restores the archived original when the translation is gone", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.display.archives.set("m1", {message: {id: "m1", channel_id: "c1", content: "Hallo"}});
	const e = {instance: {props: {message: {id: "m1", channel_id: "c1", content: "Hello\n> Hallo"}}}};

	const state = logic.prepareMessageContentDisplay(plugin, e);
	assert.equal(state.translation, null);
	assert.equal(state.channelId, "c1");
	assert.equal(state.message.content, "Hallo", "the render sees the untranslated body again");
	assert.equal(e.instance.props.message.content, "Hallo", "and the props are rewritten in place");
	assert.ok(plugin.calls.some(call => call[0] == "consumeSourceArchive" && call[1] == "m1"));
});

test("prepareMessageContentDisplay restores a cancelled automatic forward through its snapshot body", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({
		matchesPaintedTranslationContent: (painted, translation) => painted === translation.content
	});
	plugin.display.displayStates.set("fwd", {
		status: "cancelled",
		source: {content: "forwarded original"},
		restoredTranslation: {content: "转发译文"}
	});
	const originalEntry = {message: {content: "转发译文"}};
	const e = {instance: {props: {message: {id: "fwd", channel_id: "c1", content: "", messageSnapshots: [originalEntry]}}}};

	const state = logic.prepareMessageContentDisplay(plugin, e);
	assert.equal(state.translation, null);
	assert.equal(state.message.content, "", "the forward parent stays contentless");
	assert.equal(state.message.messageSnapshots[0].message.content, "forwarded original");
	assert.equal(originalEntry.message.content, "转发译文", "restoration clones instead of mutating Discord's record");
});

test("prepareMessageContentDisplay leaves the archive alone while a translation is displayed", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.display.archives.set("m1", {message: {id: "m1", channel_id: "c1", content: "Hallo"}});
	plugin.display.displayStates.set("m1", {status: "translated", translation: {translatedContent: "Hello", channelId: "c1"}});
	const e = {instance: {props: {message: {id: "m1", channel_id: "c1", content: "Hello"}}}};

	const state = logic.prepareMessageContentDisplay(plugin, e);
	assert.equal(state.translation.content, "Hello");
	assert.equal(plugin.display.hasSourceArchive("m1"), true, "the archive is only consumed by the restore path");
});

test("resolveLoadedMessageContentTranslation queues an eligible loaded message and never returns one", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({
		getReceivedAutoTranslateScope: () => "loaded_messages",
		shouldAutoTranslateReceivedMessage: () => true
	});
	assert.equal(logic.resolveLoadedMessageContentTranslation(plugin, {id: "m1", content: "Hallo"}, "c1"), null);
	const queued = plugin.calls.find(call => call[0] == "queueAutoTranslateMessage");
	assert.deepEqual([queued[1], queued[2]], ["m1", "c1"]);
	assert.equal(queued[3].historicalLoad, true, "a non-live message loads as history");
	assert.equal(queued[3].deferWhileReading, false);
});

test("resolveLoadedMessageContentTranslation does not requeue a message the store already owns", () => {
	const logic = createLogic();
	const guarded = [
		createFakePlugin({shouldAutoTranslateReceivedMessage: () => true}),
		createFakePlugin({getReceivedAutoTranslateScope: () => "loaded_messages", isTranslationEnabled: () => false, shouldAutoTranslateReceivedMessage: () => true}),
		createFakePlugin({getReceivedAutoTranslateScope: () => "loaded_messages", isOwnMessage: () => true, shouldAutoTranslateReceivedMessage: () => true}),
		createFakePlugin({getReceivedAutoTranslateScope: () => "loaded_messages", ensureLiveTranslationQueue: () => ({isMessageQueued: () => true}), shouldAutoTranslateReceivedMessage: () => true}),
		createFakePlugin({getReceivedAutoTranslateScope: () => "loaded_messages", getReceivedDisplayRuntimeView: () => ({translated: true}), shouldAutoTranslateReceivedMessage: () => true}),
		createFakePlugin({getReceivedAutoTranslateScope: () => "loaded_messages", getReceivedDisplayRuntimeView: () => ({showLoading: true}), shouldAutoTranslateReceivedMessage: () => true})
	];
	for (const plugin of guarded) {
		assert.equal(logic.resolveLoadedMessageContentTranslation(plugin, {id: "m1", content: "Hallo"}, "c1"), null);
		assert.equal(plugin.calls.some(call => call[0] == "queueAutoTranslateMessage"), false);
	}

	const suppressedPlugin = createFakePlugin({getReceivedAutoTranslateScope: () => "loaded_messages", shouldAutoTranslateReceivedMessage: () => true});
	suppressedPlugin.display.suppressed.add("m1");
	assert.equal(logic.resolveLoadedMessageContentTranslation(suppressedPlugin, {id: "m1", content: "Hallo"}, "c1"), null);
	assert.equal(suppressedPlugin.calls.some(call => call[0] == "queueAutoTranslateMessage"), false);
});

test("stripReplyPreviewOriginalSuffix removes both original-block shapes and nothing else", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	assert.equal(logic.stripReplyPreviewOriginalSuffix(plugin, "Hello\n||Hallo||"), "Hello");
	assert.equal(logic.stripReplyPreviewOriginalSuffix(plugin, "Hello\n> Hallo\n> again"), "Hello");
	assert.equal(logic.stripReplyPreviewOriginalSuffix(plugin, "Hello there"), "Hello there");
	assert.equal(logic.stripReplyPreviewOriginalSuffix(plugin, ""), "");
});

test("getReplyPreviewDisplayContent follows the reply-preview setting", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	const translation = {translatedContent: "Hello", originalContent: "Hallo"};
	assert.equal(logic.getReplyPreviewDisplayContent(plugin, translation), "Hallo");
	plugin.settings.general.showOriginalInReplyPreview = true;
	assert.equal(logic.getReplyPreviewDisplayContent(plugin, translation), "Hello");
	assert.equal(logic.getReplyPreviewDisplayContent(plugin, null), "");
});

test("getStableReplyPreviewOriginalContent recovers the original from an already-translated body", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.showOriginalMessage = true;
	plugin.display.previewCandidates.set("m1", [{translatedContent: "Hello", originalContent: "Hallo"}]);

	// The referenced message's props already carry the translated body; the preview must
	// still quote what the author actually wrote.
	assert.equal(logic.getStableReplyPreviewOriginalContent(plugin, {id: "m1", content: "Hello"}), "Hallo");
	assert.equal(logic.getStableReplyPreviewOriginalContent(plugin, {id: "m1", content: "Hallo"}), "Hallo");
	// An unrelated edit is left as-is rather than reverted to a stale original.
	assert.equal(logic.getStableReplyPreviewOriginalContent(plugin, {id: "m1", content: "something else"}), "something else");
	// No stored candidate at all: the current content is the answer.
	assert.equal(logic.getStableReplyPreviewOriginalContent(plugin, {id: "m2", content: "Hello"}), "Hello");
});

test("getStableReplyPreviewMessage clones the message with the recovered original", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.display.previewCandidates.set("m1", [{translatedContent: "Hello", originalContent: "Hallo"}]);
	const message = {id: "m1", channel_id: "c1", content: "Hello", author: {id: "u1"}};
	const stable = logic.getStableReplyPreviewMessage(plugin, message);
	assert.notEqual(stable, message);
	assert.equal(stable.content, "Hallo");
	assert.equal(message.content, "Hello", "the live message object is not rewritten");
	assert.equal(stable.author.id, "u1");
});

test("getReplyPreviewFallbackContent strips the appended original from the rendered body", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	assert.equal(logic.getReplyPreviewFallbackContent(plugin, {id: "m1", content: "Hello\n> Hallo"}), "Hello");
	assert.equal(logic.getReplyPreviewFallbackContent(plugin, null), "");
});

test("getReplyPreviewDisplayContentForMessage shows an auto translation only when asked", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.display.previewCandidates.set("m1", [{translatedContent: "Hello", originalContent: "Hallo"}]);
	plugin.display.projections.set("m1", {translation: {translatedContent: "Hello", originalContent: "Hallo", auto: true, channelId: "c1"}});
	const message = {id: "m1", content: "Hello"};

	assert.equal(logic.getReplyPreviewDisplayContentForMessage(plugin, message, "c1"), "Hallo");
	plugin.settings.general.showOriginalInReplyPreview = true;
	assert.equal(logic.getReplyPreviewDisplayContentForMessage(plugin, message, "c1"), "Hello");
});

test("getReplyPreviewDisplayContentForMessage always shows a manual translation", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.display.previewCandidates.set("m1", [{translatedContent: "Hello", originalContent: "Hallo"}]);
	plugin.display.projections.set("m1", {translation: {translatedContent: "Hello", originalContent: "Hallo", auto: false, channelId: "c1"}});
	assert.equal(logic.getReplyPreviewDisplayContentForMessage(plugin, {id: "m1", content: "Hello"}, "c1"), "Hello");
});

test("getReplyPreviewDisplayContentForMessage falls back to the original when the channel is off", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({isTranslationEnabled: () => false});
	plugin.settings.general.showOriginalInReplyPreview = true;
	plugin.display.previewCandidates.set("m1", [{translatedContent: "Hello", originalContent: "Hallo"}]);
	plugin.display.projections.set("m1", {translation: {translatedContent: "Hello", originalContent: "Hallo", auto: true, channelId: "c1"}});
	assert.equal(logic.getReplyPreviewDisplayContentForMessage(plugin, {id: "m1", content: "Hello"}, "c1"), "Hallo");
});

test("getActiveReplyPreviewTranslation evicts a preview whose channel is switched off", () => {
	const logic = createLogic();
	const previewTranslation = {translatedContent: "Hello", auto: true, channelId: "c1"};
	const plugin = createFakePlugin({
		isTranslationEnabled: () => false,
		getReplyPreviewTranslation: () => previewTranslation
	});
	plugin.display.previews.set("m1", previewTranslation);
	assert.equal(logic.getActiveReplyPreviewTranslation(plugin, {id: "m1"}, "c1"), null);
	assert.ok(plugin.calls.some(call => call[0] == "clearPreview" && call[1] == "m1"));

	const enabled = createFakePlugin({getReplyPreviewTranslation: () => previewTranslation});
	assert.equal(logic.getActiveReplyPreviewTranslation(enabled, {id: "m1"}, "c1"), previewTranslation);
});

test("processMessageReply projects the stored translation into the reply preview props", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.showOriginalInReplyPreview = true;
	plugin.display.previewCandidates.set("m1", [{translatedContent: "Hello", originalContent: "Hallo"}]);
	plugin.display.projections.set("m1", {translation: {translatedContent: "Hello", originalContent: "Hallo", auto: true, channelId: "c1"}});
	const referencedMessage = {id: "m1", channel_id: "c1", content: "Hallo"};
	const originalReferenced = {message: referencedMessage};
	const e = {instance: {props: {referencedMessage: originalReferenced, baseMessage: {id: "m2", channel_id: "c1"}}}};

	logic.processMessageReply(plugin, e);
	assert.notEqual(e.instance.props.referencedMessage, originalReferenced, "the props wrapper is replaced, not mutated");
	assert.equal(e.instance.props.referencedMessage.message.content, "Hello");
	assert.equal(referencedMessage.content, "Hallo", "the referenced message itself is untouched");
	assert.ok(plugin.calls.some(call => call[0] == "markReplyPreviewRenderMessage" && call[1] == "m1"));
	assert.deepEqual(plugin.calls.find(call => call[0] == "markReplyPreviewRenderMessage")[2], {channelId: "c1", hostMessageId: "m2"});
	assert.equal(plugin.calls.some(call => call[0] == "queueReplyPreviewTranslation"), false, "an existing translation is not requeued");
});

test("processMessageReply queues a translation when nothing is stored yet", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({shouldAutoTranslateReplyPreview: () => true});
	const e = {instance: {props: {referencedMessage: {message: {id: "m1", channel_id: "c1", content: "Hallo"}}, baseMessage: null}}};
	logic.processMessageReply(plugin, e);
	assert.ok(plugin.calls.some(call => call[0] == "queueReplyPreviewTranslation" && call[1] == "m1"));
	assert.equal(e.instance.props.referencedMessage.message.content, "Hallo");
});

test("processMessageReply bails out when there is no referenced message", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	const e = {instance: {props: {referencedMessage: null}}};
	assert.equal(logic.processMessageReply(plugin, e), undefined);
	assert.equal(plugin.calls.length, 0);
});

test("createTranslationWatermarkNode builds a tooltip-wrapped label and skips empty translations", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	const node = logic.createTranslationWatermarkNode(plugin, {content: "Hello", input: {id: "de"}, output: {id: "en"}}, "k");
	assert.equal(node.type, "TooltipContainer");
	assert.equal(node.props.key, "k");
	assert.equal(node.props.text, "de->en");
	assert.equal(node.props.children.props.children.props.children, "(translated)");
	assert.equal(logic.createTranslationWatermarkNode(plugin, {content: ""}, "k"), null);
	assert.equal(logic.createTranslationWatermarkNode(plugin, null, "k"), null);
});

test("createTranslationLoadingNode only appears while a translation is pending", () => {
	const logic = createLogic();
	assert.equal(createLogic().createTranslationLoadingNode(createFakePlugin(), {id: "m1"}), null);
	const pending = createFakePlugin({isMessageTranslationPending: () => true});
	const node = logic.createTranslationLoadingNode(pending, {id: "m1"});
	assert.equal(node.props.className, "translator-translation-loading");
	assert.equal(node.props["aria-label"], "Translating");

	const chinese = createFakePlugin({isMessageTranslationPending: () => true, isChineseUiLanguage: () => true});
	assert.equal(logic.createTranslationLoadingNode(chinese, {id: "m1"}).props["aria-label"], "正在翻译");
});

test("clearTranslatedRenderDecorations removes the plugin's class and accent variables", () => {
	const logic = createLogic();
	const e = {returnvalue: {props: {className: "base translator-translated-message extra", style: {"--translator-accent-color": "#fff", "--translator-text-color": "#fff", color: "red"}}}};
	logic.clearTranslatedRenderDecorations(createFakePlugin(), e);
	assert.equal(e.returnvalue.props.className, "base extra");
	assert.deepEqual(e.returnvalue.props.style, {color: "red"});
});

test("applyMessageContentRenderDecorations decorates a translated received message", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.highlightTranslatedMessages = true;
	const e = {returnvalue: {props: {className: "base", children: []}}};
	const translation = {content: "Hello", input: {id: "de"}, output: {id: "en"}};

	logic.applyMessageContentRenderDecorations(plugin, e, {id: "m1"}, translation);
	assert.equal(e.returnvalue.props.className, "base translator-translated-message");
	assert.equal(e.returnvalue.props.style["--translator-accent-color"], "#abcdef");
	assert.equal(e.returnvalue.props.children.length, 1);
	assert.equal(e.returnvalue.props.children[0].type, "TooltipContainer");
	// This is the one place the module reads the message-direction vocabulary.
	assert.deepEqual(plugin.calls.find(call => call[0] == "shouldProtectWrappedTextForPlace"), ["shouldProtectWrappedTextForPlace", MESSAGE_DIRECTIONS.RECEIVED]);
});

test("applyMessageContentRenderDecorations reports the sent direction for own messages", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({isOwnMessage: () => true});
	const e = {returnvalue: {props: {className: "", children: []}}};
	logic.applyMessageContentRenderDecorations(plugin, e, {id: "m1"}, {content: "Hello"});
	assert.deepEqual(plugin.calls.find(call => call[0] == "shouldProtectWrappedTextForPlace"), ["shouldProtectWrappedTextForPlace", MESSAGE_DIRECTIONS.SENT]);
});

test("applyMessageContentRenderDecorations never appends the removed direct-original block", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.showOriginalMessage = true;
	plugin.settings.general.showOriginalDirectly = true;
	const e = {returnvalue: {props: {className: "", children: []}}};
	logic.applyMessageContentRenderDecorations(plugin, e, {id: "m1"}, {content: "Hello", originalContent: "Hallo", contentIncludesOriginal: false});
	assert.deepEqual(e.returnvalue.props.children.map(child => child.type), ["TooltipContainer"], "a stale setting cannot revive the deleted display mode");

	const inlined = {returnvalue: {props: {className: "", children: []}}};
	logic.applyMessageContentRenderDecorations(plugin, inlined, {id: "m1"}, {content: "Hello", originalContent: "Hallo", contentIncludesOriginal: true});
	assert.deepEqual(inlined.returnvalue.props.children.map(child => child.type), ["TooltipContainer"]);
});

test("applyMessageContentRenderDecorations shows the loading node instead when nothing is translated", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({isMessageTranslationPending: () => true});
	plugin.settings.general.highlightTranslatedMessages = true;
	const e = {returnvalue: {props: {className: "base", children: []}}};
	logic.applyMessageContentRenderDecorations(plugin, e, {id: "m1"}, null);
	assert.equal(e.returnvalue.props.className, "base", "an untranslated message keeps its own classes");
	assert.deepEqual(e.returnvalue.props.children.map(child => child.props.className), ["translator-translation-loading"]);
});

test("applyReceivedDisplayViewToStream restores painted embeds even when message text is already original", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({normalizeExtractedMessageText: value => value == null ? "" : String(value)});
	const sourceEmbeds = Object.freeze([Object.freeze({
		title: "Original title",
		description: "Original description",
		footerText: "Original footer",
		fields: Object.freeze([Object.freeze({name: "Original name", value: "Original value"})])
	})]);
	const paintedEmbed = {
		id: "embed-1",
		rawTitle: "Translated title",
		rawDescription: "Translated description",
		footer: {text: "Translated footer", iconURL: "keep-footer-metadata"},
		fields: [{rawName: "Translated name", rawValue: "Translated value", inline: true}],
		originalTitle: "Original title"
	};
	const stream = {content: {id: "message-1", content: "Original message", embeds: [paintedEmbed]}};
	const view = {
		translated: false,
		status: "cancelled",
		content: "Original message",
		restoredTranslation: {content: "Translated message"},
		source: {content: "Original message", embeds: sourceEmbeds}
	};

	logic.applyReceivedDisplayViewToStream(plugin, stream, view);

	assert.notEqual(stream.content.embeds[0], paintedEmbed, "restoration must not mutate the painted embed object");
	assert.equal(stream.content.embeds[0].id, "embed-1", "Discord embed identity metadata is preserved");
	assert.equal(stream.content.embeds[0].rawTitle, "Original title");
	assert.equal(stream.content.embeds[0].rawDescription, "Original description");
	assert.deepEqual(stream.content.embeds[0].footer, {text: "Original footer", iconURL: "keep-footer-metadata"});
	assert.deepEqual(stream.content.embeds[0].fields, [{rawName: "Original name", rawValue: "Original value", inline: true}]);
	assert.equal("originalTitle" in stream.content.embeds[0], false, "obsolete restore markers are removed");
	assert.equal(sourceEmbeds[0].title, "Original title", "the frozen source snapshot remains unchanged");
});

test("processEmbed swaps the embed fields in and remembers the originals", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({getDisplayedTranslationChannelId: () => "c1"});
	plugin.display.displayStates.set("m1", {
		status: "translated",
		translation: {
			translatedContent: "Hello",
			channelId: "c1",
			embeds: {e1: {title: "Title EN", description: "Body EN", footerText: "Foot EN", fields: [{name: "N EN", value: "V EN"}]}}
		}
	});
	const e = {
		returnvalue: null,
		instance: {props: {embed: {id: "e1", message_id: "m1", rawTitle: "Titel DE", rawDescription: "Text DE", footer: {text: "Fuss DE"}, fields: [{rawName: "N DE", rawValue: "V DE"}]}}}
	};

	logic.processEmbed(plugin, e);
	const embed = e.instance.props.embed;
	assert.equal(embed.rawTitle, "Title EN");
	assert.equal(embed.rawDescription, "Body EN");
	assert.equal(embed.footer.text, "Foot EN");
	assert.deepEqual(embed.fields, [{rawName: "N EN", rawValue: "V EN"}]);
	assert.equal(embed.originalTitle, "Titel DE");
	assert.equal(embed.originalDescription, "Text DE");
	assert.deepEqual(embed.originalFields, [{rawName: "N DE", rawValue: "V DE"}]);
	assert.equal(embed.originalFooter.text, "Fuss DE");
});

test("processEmbed falls back to the store view when no display record is active", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({
		getReceivedDisplayRuntimeView: () => ({translated: true, translation: {embeds: {e1: {title: "T", description: "D", footerText: "", fields: []}}}})
	});
	const e = {returnvalue: null, instance: {props: {embed: {id: "e1", message_id: "m1", rawTitle: "t", rawDescription: "d", fields: []}}}};
	logic.processEmbed(plugin, e);
	assert.equal(e.instance.props.embed.rawDescription, "D");
});

test("processEmbed ignores an embed that is absent from a partial translation map", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({getDisplayedTranslationChannelId: () => "c1"});
	plugin.display.displayStates.set("m1", {
		status: "translated",
		translation: {
			translatedContent: "Hello",
			channelId: "c1",
			embeds: {e1: {title: "Translated", description: "Body", footerText: "", fields: []}}
		}
	});
	const original = {id: "e2", message_id: "m1", rawTitle: "Original", rawDescription: "Body", fields: []};
	const e = {returnvalue: null, instance: {props: {embed: original}}};

	assert.doesNotThrow(() => logic.processEmbed(plugin, e));
	assert.equal(e.instance.props.embed, original);
});

test("processEmbed preserves source fields missing from a partial embed translation", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({getDisplayedTranslationChannelId: () => "c1"});
	plugin.display.displayStates.set("m1", {
		status: "translated",
		translation: {translatedContent: "Hello", channelId: "c1", embeds: {e1: {title: "Translated title"}}}
	});
	const e = {returnvalue: null, instance: {props: {embed: {
		id: "e1",
		message_id: "m1",
		rawTitle: "Original title",
		rawDescription: "Original description",
		footer: {text: "Original footer"},
		fields: [{rawName: "Original name", rawValue: "Original value"}]
	}}}};

	logic.processEmbed(plugin, e);
	assert.equal(e.instance.props.embed.rawTitle, "Translated title");
	assert.equal(e.instance.props.embed.rawDescription, "Original description");
	assert.equal(e.instance.props.embed.footer.text, "Original footer");
	assert.deepEqual(e.instance.props.embed.fields, [{rawName: "Original name", rawValue: "Original value"}]);
});

test("processEmbed puts the original embed back once the translation is gone", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	const e = {
		returnvalue: null,
		instance: {props: {embed: {
			id: "e1",
			message_id: "m1",
			rawTitle: "Title EN",
			rawDescription: "Body EN",
			footer: {text: "Foot EN"},
			fields: [{rawName: "N EN", rawValue: "V EN"}],
			originalTitle: "Titel DE",
			originalDescription: "Text DE",
			originalFooter: {text: "Fuss DE"},
			originalFields: [{rawName: "N DE", rawValue: "V DE"}]
		}}}
	};

	logic.processEmbed(plugin, e);
	const embed = e.instance.props.embed;
	assert.equal(embed.rawTitle, "Titel DE");
	assert.equal(embed.rawDescription, "Text DE");
	assert.equal(embed.footer.text, "Fuss DE");
	assert.deepEqual(embed.fields, [{rawName: "N DE", rawValue: "V DE"}]);
	assert.equal("originalTitle" in embed, false, "the restore markers are cleared so the next render is a no-op");
	assert.equal("originalDescription" in embed, false);
	assert.equal("originalFields" in embed, false);
	assert.equal("originalFooter" in embed, false);
});

test("processEmbed restores a title-only embed whose original description was empty", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	const e = {
		returnvalue: null,
		instance: {props: {embed: {
			id: "e1",
			message_id: "m1",
			rawTitle: "Translated title",
			rawDescription: "",
			fields: [],
			originalTitle: "Original title",
			originalDescription: "",
			originalFields: [],
			originalFooter: undefined
		}}}
	};

	logic.processEmbed(plugin, e);
	assert.equal(e.instance.props.embed.rawTitle, "Original title");
	assert.equal("originalTitle" in e.instance.props.embed, false);
});

test("processEmbed appends the watermark to an already-rendered embed description", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({getDisplayedTranslationChannelId: () => "c1"});
	plugin.display.displayStates.set("m1", {
		status: "translated",
		translation: {translatedContent: "Hello", channelId: "c1", input: {id: "de"}, output: {id: "en"}, embeds: {e1: {title: "T", description: "D", footerText: "", fields: []}}}
	});
	const descriptionNode = {props: {className: "embed-description", children: "Body"}};
	const e = {
		returnvalue: {props: {className: "embed", children: [descriptionNode]}},
		instance: {props: {embed: {id: "e1", message_id: "m1"}}}
	};

	logic.processEmbed(plugin, e);
	assert.ok(Array.isArray(descriptionNode.props.children));
	assert.equal(descriptionNode.props.children.length, 2);
	assert.equal(descriptionNode.props.children[1].type, "TooltipContainer");
	assert.equal(descriptionNode.props.children[1].props.key, "translator-embed-watermark");
});

test("processEmbed ignores embeds with no message id", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	const e = {returnvalue: null, instance: {props: {embed: {id: "e1"}}}};
	assert.equal(logic.processEmbed(plugin, e), undefined);
	assert.deepEqual(e.instance.props.embed, {id: "e1"});
});

test("every content render registers its live instance for the per-row repaint path", () => {
	// The live repaint (2026-08-19, replaces rebuild-per-transaction) can only
	// force-update instances it has seen; the content render hook is the one place
	// every mounted row passes through.
	const logic = createLogic();
	const plugin = createFakePlugin();
	const recorded = [];
	plugin.display.recordContentInstance = (messageId, instance) => recorded.push([messageId, instance]);
	const e = {instance: {props: {message: {id: "m1", channel_id: "c1", content: "hello"}}}};

	logic.prepareMessageContentDisplay(plugin, e);

	assert.equal(recorded.length, 1, "the render hook must register the row's instance");
	assert.equal(recorded[0][0], "m1");
	assert.equal(recorded[0][1], e.instance);
});

test("a forwarded message paints its translation into the snapshot, not into its empty content", () => {
	// Field report 2026-08-19: 已转发 messages never translated - their body lives in
	// messageSnapshots[0].message.content (probe evidence), which the paint must
	// target because the forward renderer never reads the message's own content.
	const logic = createLogic();
	const plugin = createFakePlugin({normalizeExtractedMessageText: value => value == null ? "" : String(value)});
	class SnapshotEntry {
		constructor(message) {this.message = message; this.moderatorReport = null;}
		entryMethod() {return "entry";}
	}
	class SnapshotMessage {
		constructor(content) {this.content = content; this.embeds = [];}
		recordMethod() {return "record";}
	}
	const originalEntry = new SnapshotEntry(new SnapshotMessage("the forwarded body"));
	const stream = {content: {id: "fwd-1", content: "", messageSnapshots: [originalEntry], messageReference: {message_id: "orig-1"}}};
	const view = {
		translated: true,
		content: "the forwarded body",
		translation: {translatedContent: "翻译后的正文", originalContent: "the forwarded body"},
		source: {content: "the forwarded body", embeds: []}
	};

	logic.applyReceivedDisplayViewToStream(plugin, stream, view);

	assert.equal(stream.content.content, "", "the forward's own content stays empty");
	assert.equal(stream.content.messageSnapshots[0].message.content, "翻译后的正文", "the paint lands in the snapshot body");
	assert.equal(stream.content.messageReference.message_id, "orig-1", "the forward frame reference survives the clone");
	assert.equal(originalEntry.message.content, "the forwarded body", "the store-owned snapshot object is never mutated");
	assert.equal(stream.content.messageSnapshots[0].entryMethod(), "entry", "the snapshot entry keeps its prototype");
	assert.equal(stream.content.messageSnapshots[0].message.recordMethod(), "record", "the snapshot message keeps its prototype");

	// A second pass over the already-painted snapshot is a no-op, not a re-clone.
	const paintedContent = stream.content;
	logic.applyReceivedDisplayViewToStream(plugin, stream, view);
	assert.equal(stream.content, paintedContent, "an already-painted forward does not clone again");
});

test("a forwarded translation with direct-original enabled composes one copy inside the forward frame", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({normalizeExtractedMessageText: value => value == null ? "" : String(value)});
	plugin.settings.general.showOriginalMessage = true;
	plugin.settings.general.showOriginalDirectly = true;
	plugin.settings.general.highlightTranslatedMessages = true;
	const stream = {content: {id: "fwd", content: "", messageSnapshots: [{message: {content: "forwarded original"}}]}};
	const translation = {content: "转发译文", translatedContent: "转发译文", originalContent: "forwarded original"};
	logic.applyReceivedDisplayViewToStream(plugin, stream, {translated: true, translation, content: "forwarded original"});

	const painted = stream.content.messageSnapshots[0].message.content;
	assert.match(painted, /^转发译文/);
	assert.equal((painted.match(/forwarded original/g) || []).length, 1, "the snapshot carries exactly one original copy");

	const parentEvent = {returnvalue: {props: {className: "message", children: ["empty-parent"]}}};
	logic.applyMessageContentRenderDecorations(plugin, parentEvent, stream.content, translation);
	assert.equal(parentEvent.returnvalue.props.className.includes("translator-translated-message"), false, "the empty forward parent never becomes a blank translated block");
	assert.equal(parentEvent.returnvalue.props.children.some(child => child && child.type == "TooltipContainer"), false, "the parent owns no watermark");

	// Discord normalises the snapshot record again before MessageContent and drops
	// unknown marker properties. Deduplication therefore has to use the visible body,
	// not an identity tag attached to our intermediate clone.
	const normalizedSnapshotMessage = {content: painted};
	const snapshotEvent = {returnvalue: {props: {className: "message", children: ["painted snapshot body"]}}};
	logic.applyMessageContentRenderDecorations(plugin, snapshotEvent, normalizedSnapshotMessage, translation);
	assert.equal(snapshotEvent.returnvalue.props.className.includes("translator-translated-message"), true, "the nested snapshot owns the translated styling");
	assert.equal(snapshotEvent.returnvalue.props.children.some(child => child && child.type == "TooltipContainer"), true, "the nested snapshot owns one watermark");
	assert.equal(snapshotEvent.returnvalue.props.children.some(child => child && child.type == "original-block"), false, "the inline snapshot original is not appended again as a direct block");
});

test("a store-view render marks but never decorates the empty forwarded parent", () => {
	const logic = createLogic();
	const plugin = createFakePlugin();
	plugin.settings.general.showOriginalMessage = true;
	plugin.settings.general.showOriginalDirectly = true;
	plugin.settings.general.highlightTranslatedMessages = true;
	const e = {
		instance: {props: {message: {id: "fwd", content: "", messageSnapshots: [{message: {content: "译文"}}]}}},
		returnvalue: {props: {className: "message", children: ["empty-parent"]}}
	};
	logic.applyReceivedDisplayViewToContent(plugin, e, {
		revision: 7,
		messageId: "fwd",
		translated: true,
		translation: {content: "译文", originalContent: "original"}
	});
	assert.equal(e.returnvalue.props["data-translator-revision"], "7", "DOM confirmation still sees the transaction");
	assert.equal(e.returnvalue.props.className.includes("translator-translated-message"), false);
	assert.deepEqual(e.returnvalue.props.children, ["empty-parent"], "no watermark or original block is injected into the empty parent");
});

test("restoring a forwarded message puts the snapshot original back", () => {
	const logic = createLogic();
	const plugin = createFakePlugin({normalizeExtractedMessageText: value => value == null ? "" : String(value)});
	const stream = {content: {id: "fwd-1", content: "", messageSnapshots: [{message: {content: "翻译后的正文", embeds: []}}]}};
	const view = {
		translated: false,
		status: "cancelled",
		content: "the forwarded body",
		restoredTranslation: {content: "翻译后的正文"},
		source: {content: "the forwarded body", embeds: []}
	};

	logic.applyReceivedDisplayViewToStream(plugin, stream, view);

	assert.equal(stream.content.messageSnapshots[0].message.content, "the forwarded body");
	assert.equal(stream.content.content, "", "the own content stays empty through the restore too");
});

test("getForwardedMessageSnapshots ignores ordinary messages and empty snapshots", () => {
	const logic = createLogic();
	assert.equal(logic.getForwardedMessageSnapshots(null, {content: "has text", messageSnapshots: [{message: {content: "x"}}]}), null, "a message with its own content is not a forward");
	assert.equal(logic.getForwardedMessageSnapshots(null, {content: "", messageSnapshots: []}), null);
	assert.equal(logic.getForwardedMessageSnapshots(null, {content: "", messageSnapshots: [{message: {content: "  "}}]}), null, "an image-only forward has nothing to translate");
	assert.ok(logic.getForwardedMessageSnapshots(null, {content: "", message_snapshots: [{message: {content: "raw gateway shape"}}]}), "gateway snake_case is recognized");
});

test("paintStreamBody writes a forward's body into a snapshot clone and a normal message directly", () => {
	// The legacy branches (manual translation, archive restore, cancel restore)
	// wrote stream.content.content directly, which a forward frame never displays -
	// manual translate and untranslate on forwards were invisible (2026-08-19 night).
	const logic = createLogic();
	const plugin = createFakePlugin({normalizeExtractedMessageText: value => value == null ? "" : String(value)});

	const normalStream = {content: {id: "m1", content: "original"}};
	logic.paintStreamBody(plugin, normalStream, "translated");
	assert.equal(normalStream.content.content, "translated", "ordinary messages keep the legacy direct write");
	assert.equal(normalStream.content.id, "m1", "the same object is written, not replaced");

	const snapshotEntry = {message: {content: "forwarded original"}};
	const forwardStream = {content: {id: "fwd", content: "", messageSnapshots: [snapshotEntry]}};
	logic.paintStreamBody(plugin, forwardStream, "翻译后的正文");
	assert.equal(forwardStream.content.messageSnapshots[0].message.content, "翻译后的正文", "the forward paint lands in the snapshot");
	assert.equal(forwardStream.content.content, "", "the forward's own content stays empty");
	assert.equal(snapshotEntry.message.content, "forwarded original", "the store-owned snapshot object is never mutated");

	assert.equal(logic.getStreamBodyContent(plugin, forwardStream.content), "翻译后的正文", "the echo read sees the same body the reader sees");
	assert.equal(logic.getStreamBodyContent(plugin, normalStream.content), "translated");
});
