// Read-only evidence collection for the reopened 2026-08-10 display debug. Compiled
// into DiscordAITranslator.debug.plugin.js only (gated by __TRANSLATOR_DISPLAY_DEBUG__
// at every call site); the release build never contains this module.
//
// Two evidence targets, matching the first two "Mandatory second-debug evidence" items
// in docs/recovery-plan.md:
//
// - recordParentRenderPass captures the real channel-stream patch instance/Fiber shape
//   and whether the parent render handle is directly updateable (has forceUpdate) or
//   only reachable through a class ancestor. It never calls forceUpdate itself.
// - wrapModule wraps Discord's history fetch/store modules with a logging proxy so the
//   real argument and return shapes of prefetch actions are recorded verbatim-in-shape
//   (types, keys, lengths) without altering call semantics.

const SECOND_DEBUG_MARKER = "TRANSLATOR_SECOND_DEBUG_PROBE";

const MAX_KEYS = 20;
const MAX_STRING_PREVIEW = 60;
const MAX_ANCESTRY = 8;
const MAX_ANCESTOR_WALK = 30;

function describeReactType(type) {
	if (type == null) return {kind: "none", name: null};
	if (typeof type == "string") return {kind: "host", name: type};
	if (typeof type == "function") {
		const isClass = !!(type.prototype && (type.prototype.isReactComponent || typeof type.prototype.forceUpdate == "function"));
		return {kind: isClass ? "class" : "function", name: type.displayName || type.name || null};
	}
	if (typeof type == "object") {
		const typeOfDescription = String(type.$$typeof || "");
		if (typeOfDescription.includes("react.memo")) {
			const inner = describeReactType(type.type);
			return {kind: "memo", name: type.displayName || inner.name || null, inner: inner.kind};
		}
		if (typeOfDescription.includes("react.forward_ref")) {
			const inner = describeReactType(type.render);
			return {kind: "forwardRef", name: type.displayName || inner.name || null, inner: inner.kind};
		}
		return {kind: "object", name: type.displayName || null};
	}
	return {kind: typeof type, name: null};
}

function summarizeFiber(fiber) {
	if (!fiber) return null;
	return {
		tag: fiber.tag,
		type: describeReactType(fiber.type),
		hasStateNode: !!fiber.stateNode,
		stateNodeCanForceUpdate: !!(fiber.stateNode && typeof fiber.stateNode.forceUpdate == "function")
	};
}

function findFiberFromElement(element) {
	if (!element) return null;
	for (const key in element) {
		if (key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$")) return element[key];
	}
	return null;
}

function findNearestUpdateableAncestor(fiber) {
	let current = fiber;
	for (let depth = 0; current && depth <= MAX_ANCESTOR_WALK; depth++) {
		if (current.stateNode && typeof current.stateNode.forceUpdate == "function") {
			const type = describeReactType(current.type);
			return {depth, name: type.name};
		}
		current = current.return;
	}
	return null;
}

function summarizeAncestry(fiber) {
	const ancestry = [];
	let current = fiber && fiber.return;
	while (current && ancestry.length < MAX_ANCESTRY) {
		ancestry.push({tag: current.tag, type: describeReactType(current.type)});
		current = current.return;
	}
	return ancestry;
}

function summarizeValueShape(value, depth = 2) {
	if (value === null) return {type: "null"};
	if (value === undefined) return {type: "undefined"};
	const valueType = typeof value;
	if (valueType == "string") return {type: "string", length: value.length, preview: value.slice(0, MAX_STRING_PREVIEW)};
	if (valueType == "number" || valueType == "boolean" || valueType == "bigint") return {type: valueType, value: String(value)};
	if (valueType == "function") return {type: "function", name: value.name || null};
	if (valueType == "symbol") return {type: "symbol", value: String(value)};
	if (Array.isArray(value)) {
		const summary = {type: "array", length: value.length};
		if (depth > 0 && value.length) summary.first = summarizeValueShape(value[0], depth - 1);
		return summary;
	}
	if (value instanceof Map) {
		const summary = {type: "map", size: value.size};
		if (depth > 0 && value.size) summary.firstValue = summarizeValueShape(value.values().next().value, depth - 1);
		return summary;
	}
	let keys = [];
	try {keys = Object.keys(value);}
	catch (error) {keys = [];}
	const summary = {
		type: "object",
		constructorName: value.constructor && value.constructor.name || null,
		keys: keys.slice(0, MAX_KEYS),
		keyCount: keys.length,
		hasToArray: typeof value.toArray == "function"
	};
	if (depth > 0 && keys.length) {
		summary.nested = {};
		for (const key of keys.slice(0, 8)) {
			let child;
			try {child = value[key];}
			catch (error) {child = `<threw: ${error && error.message}>`;}
			summary.nested[key] = summarizeValueShape(child, depth - 1);
		}
	}
	return summary;
}

function createSecondDebugProbe({
	log = () => {},
	now = Date.now,
	limit = 400,
	// The DOM-anchored fiber walk answers the "which parent render handle is
	// updateable" question once per session shape; it does not need to run on
	// every render pass.
	domWalkLimit = 3,
	domWalkDepth = 40,
	// The scroller is not mounted yet while the before-render patch runs, so the
	// walk waits for a paint and retries.
	domWalkDelayMs = 800,
	// An optional evidence file writer. DevTools is not reachable on every client,
	// so the debug build also persists the dump; the throttle keeps a busy channel
	// from writing on every recorded call.
	sink = null,
	flushIntervalMs = 1500,
	setTimeoutFn = typeof setTimeout == "function" ? setTimeout : null,
	clearTimeoutFn = typeof clearTimeout == "function" ? clearTimeout : null
} = {}) {
	const entries = [];
	const instanceIds = new WeakMap();
	const parentEntriesBySignature = new Map();
	const missingModuleLabels = new Set();
	let nextInstanceId = 0;
	let nextCallId = 0;
	let domWalkCount = 0;
	let domWalkSettled = false;
	let domWalkArmed = false;
	let parentRenderCount = 0;
	let lastFlushAt = -Infinity;
	let pendingFlushHandle = null;

	function flush() {
		if (pendingFlushHandle != null && clearTimeoutFn) clearTimeoutFn(pendingFlushHandle);
		pendingFlushHandle = null;
		lastFlushAt = now();
		if (!sink) return;
		try {sink(dump());}
		catch (error) {}
	}

	function scheduleFlush() {
		if (!sink) return;
		const elapsed = now() - lastFlushAt;
		if (elapsed >= flushIntervalMs) return flush();
		if (pendingFlushHandle != null || !setTimeoutFn) return;
		pendingFlushHandle = setTimeoutFn(() => {
			pendingFlushHandle = null;
			flush();
		}, flushIntervalMs - elapsed);
	}

	function push(entry) {
		entries.push(entry);
		if (entries.length > limit) {
			const dropped = entries.splice(0, entries.length - limit);
			for (const droppedEntry of dropped) {
				for (const [signature, tracked] of parentEntriesBySignature) {
					if (tracked === droppedEntry) parentEntriesBySignature.delete(signature);
				}
			}
		}
		log(`[${SECOND_DEBUG_MARKER}] ${entry.kind}: ${JSON.stringify(entry)}`);
		scheduleFlush();
		return entry;
	}

	function record(kind, data) {
		return push(Object.assign({kind, timestamp: now()}, data));
	}

	function recordDomFiberWalk({label = "domFiberWalk", element = null} = {}) {
		if (!element) return record("domFiberWalk", {label, found: false, reason: "no-element", chain: []});
		const startFiber = findFiberFromElement(element);
		if (!startFiber) return record("domFiberWalk", {label, found: false, reason: "no-fiber-key", chain: []});
		const chain = [];
		let channelStreamOwner = null;
		let updateableAboveChannelStream = null;
		let current = startFiber;
		for (let depth = 0; current && depth < domWalkDepth; depth++) {
			const props = current.memoizedProps || current.pendingProps || null;
			let propsKeys = [];
			try {propsKeys = props ? Object.keys(props).slice(0, MAX_KEYS) : [];}
			catch (error) {propsKeys = [];}
			const type = describeReactType(current.type);
			const canForceUpdate = !!(current.stateNode && typeof current.stateNode.forceUpdate == "function");
			const hasChannelStream = !!(props && props.channelStream);
			chain.push({depth, tag: current.tag, type, canForceUpdate, hasChannelStream, propsKeys});
			if (hasChannelStream && !channelStreamOwner) channelStreamOwner = {depth, name: type.name};
			if (channelStreamOwner && canForceUpdate && !updateableAboveChannelStream && depth >= channelStreamOwner.depth) updateableAboveChannelStream = {depth, name: type.name};
			current = current.return;
		}
		return record("domFiberWalk", {label, found: true, chain, channelStreamOwner, updateableAboveChannelStream});
	}

	function scheduleDomFiberWalk(resolveScrollerElement) {
		if (domWalkSettled || domWalkArmed || domWalkCount >= domWalkLimit || !setTimeoutFn) return;
		domWalkArmed = true;
		setTimeoutFn(() => {
			domWalkArmed = false;
			domWalkCount++;
			let scrollerElement = null;
			try {scrollerElement = resolveScrollerElement();}
			catch (error) {scrollerElement = null;}
			const entry = recordDomFiberWalk({label: "messagesScroller", element: scrollerElement});
			if (entry && entry.found) domWalkSettled = true;
			else scheduleDomFiberWalk(resolveScrollerElement);
		}, domWalkDelayMs);
	}

	// Samples the attribute shapes of mounted message rows so the render adapter's
	// lookup selectors can be compared against the real DOM instead of assumptions.
	// The 2026-08-16 client proved exact-match selectors can miss every row while the
	// rebuild primitive itself works.
	function recordMessageRowShapes({label = "messageRowShapes", scroller = null, limit = 8} = {}) {
		if (!scroller || typeof scroller.querySelectorAll != "function") return record(label, {error: "no-query-root"});
		const shapes = [];
		try {
			const rows = Array.from(scroller.querySelectorAll('[id^="chat-messages-"], [data-list-item-id*="chat-messages"]'));
			for (const row of rows.slice(0, limit)) {
				const shape = {};
				for (const attribute of ["id", "data-list-item-id", "aria-labelledby"]) {
					try {
						const value = row.getAttribute ? row.getAttribute(attribute) : row[attribute];
						if (value != null) shape[attribute] = String(value).length > 160 ? String(value).slice(0, 160) + "…" : String(value);
					}
					catch (error) {}
				}
				shapes.push(shape);
			}
		}
		catch (error) {
			return record(label, {error: error && error.message || String(error)});
		}
		return record(label, {sampled: shapes.length, shapes});
	}

	function recordParentRenderPass(e, {resolveScrollerElement = null} = {}) {
		parentRenderCount++;
		const instance = e && e.instance;
		let instanceId = null;
		if (instance && (typeof instance == "object" || typeof instance == "function")) {
			if (!instanceIds.has(instance)) instanceIds.set(instance, ++nextInstanceId);
			instanceId = instanceIds.get(instance);
		}
		const fiber = instance && (instance._reactInternals || instance._reactInternalFiber) || null;
		const props = instance && instance.props || null;
		if (resolveScrollerElement) scheduleDomFiberWalk(resolveScrollerElement);
		let propsKeys = [];
		try {propsKeys = props ? Object.keys(props).slice(0, MAX_KEYS) : [];}
		catch (error) {propsKeys = [];}
		const summary = {
			instanceId,
			instanceType: instance == null ? String(instance) : typeof instance,
			constructorName: instance && instance.constructor && instance.constructor.name || null,
			hasForceUpdate: !!(instance && typeof instance.forceUpdate == "function"),
			hasReactInternals: !!fiber,
			eventKeys: e && typeof e == "object" ? Object.keys(e).slice(0, MAX_KEYS) : [],
			patchName: e && e.name || null,
			methodName: e && e.methodname || null,
			patchTypes: e && Array.isArray(e.patchtypes) ? e.patchtypes.slice() : e && e.patchtypes || null,
			component: describeReactType(e && e.component),
			returnValueType: describeReactType(e && e.returnvalue && e.returnvalue.type),
			propsKeys,
			channelId: props && props.channel && props.channel.id || null,
			channelStreamLength: props && Array.isArray(props.channelStream) ? props.channelStream.length : null,
			fiber: summarizeFiber(fiber),
			updateableAncestor: findNearestUpdateableAncestor(fiber),
			ancestry: summarizeAncestry(fiber)
		};
		const signature = JSON.stringify({
			instanceId: summary.instanceId,
			constructorName: summary.constructorName,
			hasForceUpdate: summary.hasForceUpdate,
			fiber: summary.fiber,
			updateableAncestor: summary.updateableAncestor
		});
		const existing = parentEntriesBySignature.get(signature);
		if (existing) {
			existing.passCount++;
			existing.lastSeen = now();
			existing.channelId = summary.channelId;
			existing.channelStreamLength = summary.channelStreamLength;
			scheduleFlush();
			return existing;
		}
		const entry = record("parentRenderPass", Object.assign({passCount: 1, lastSeen: now()}, summary));
		parentEntriesBySignature.set(signature, entry);
		return entry;
	}

	function recordModuleResult(entry, result) {
		if (result && typeof result.then == "function") {
			entry.resultKind = "promise";
			result.then(
				resolved => {entry.result = summarizeValueShape(resolved, 3); entry.settledAt = now(); scheduleFlush();},
				error => {entry.error = error && error.message || String(error); entry.settledAt = now(); scheduleFlush();}
			);
			return result;
		}
		entry.resultKind = "sync";
		entry.result = summarizeValueShape(result, 3);
		return result;
	}

	function wrapModule(module, {label = "module", methods = []} = {}) {
		if (!module || typeof module != "object" && typeof module != "function") {
			if (!missingModuleLabels.has(label)) {
				missingModuleLabels.add(label);
				record("moduleMissing", {label, moduleType: module === null ? "null" : typeof module});
			}
			return module;
		}
		record("moduleWrapped", {
			label,
			availableMethods: methods.filter(methodName => typeof module[methodName] == "function")
		});
		const trackedMethods = new Set(methods);
		return new Proxy(module, {
			get(target, property, receiver) {
				const value = Reflect.get(target, property, receiver);
				if (typeof value != "function" || !trackedMethods.has(property)) return value;
				return function (...args) {
					const entry = record("moduleCall", {
						callId: ++nextCallId,
						label,
						method: String(property),
						args: args.map(argument => summarizeValueShape(argument, 1))
					});
					try {
						return recordModuleResult(entry, value.apply(target, args));
					}
					catch (error) {
						entry.error = error && error.message || String(error);
						throw error;
					}
				};
			}
		});
	}

	// A manual, user-triggered experiment (never a render hook): it tries each candidate
	// refresh strategy on the mounted message list and records whether the list's render
	// count actually advanced, so the replacement can pick a strategy proven on the real
	// client rather than an assumed updateable owner.
	async function runRefreshExperiment({strategies = [], getRenderCount = () => 0, waitForPaint = defaultWaitForPaint} = {}) {
		const results = [];
		for (const strategy of strategies) {
			const before = getRenderCount();
			const entry = {strategy: strategy.name};
			try {
				strategy.run();
			}
			catch (error) {
				entry.error = error && error.message || String(error);
			}
			try {await waitForPaint();}
			catch (error) {}
			// A chat-layer rebuild lands over several passes plus a timeout(0), so a
			// strategy may declare a longer settle window than one paint.
			if (strategy.settleMs && setTimeoutFn) await new Promise(resolve => setTimeoutFn(resolve, strategy.settleMs));
			const after = getRenderCount();
			entry.renderedDelta = after - before;
			entry.caused = after > before;
			results.push(record("refreshExperiment", entry));
		}
		return results;
	}

	function defaultWaitForPaint() {
		return new Promise(resolve => {
			if (typeof requestAnimationFrame == "function") requestAnimationFrame(() => requestAnimationFrame(resolve));
			else if (setTimeoutFn) setTimeoutFn(resolve, 50);
			else resolve();
		});
	}

	function dump() {
		return JSON.stringify({marker: SECOND_DEBUG_MARKER, generatedAt: now(), entryCount: entries.length, entries});
	}

	function installGlobal(target, {resolveScrollerElement = null, forceUpdate = null, rerenderAll = null, getRenderCount = null, waitForPaint = defaultWaitForPaint, autoRunExperiment = false, autoRunDelayMs = 8000, autoRunMaxAttempts = 15} = {}) {
		if (!target) return;
		const experimentConfig = resolveScrollerElement && forceUpdate ? {
			strategies: createMessageRefreshStrategies({resolveScrollerElement, forceUpdate, rerenderAll}),
			getRenderCount: getRenderCount || (() => parentRenderCount),
			waitForPaint
		} : null;
		// DevTools is unreachable on some clients, so the debug build can run the
		// experiment on its own once a message list is mounted. It runs exactly once.
		if (autoRunExperiment && experimentConfig && setTimeoutFn) {
			let attempts = 0;
			let ran = false;
			const attempt = async () => {
				if (ran) return;
				attempts++;
				let mounted = null;
				try {mounted = resolveScrollerElement();}
				catch (error) {mounted = null;}
				if (mounted) {
					ran = true;
					recordMessageRowShapes({scroller: mounted});
					await runRefreshExperiment(experimentConfig);
					return;
				}
				if (attempts < autoRunMaxAttempts) setTimeoutFn(attempt, autoRunDelayMs);
			};
			setTimeoutFn(attempt, autoRunDelayMs);
		}
		target.TranslatorDebug = {
			marker: SECOND_DEBUG_MARKER,
			list: () => entries.slice(),
			tryRefresh: options => runRefreshExperiment(options || experimentConfig || {}),
			dump,
			copy() {
				const text = dump();
				try {
					if (target.DiscordNative && target.DiscordNative.clipboard && typeof target.DiscordNative.clipboard.copy == "function") {
						target.DiscordNative.clipboard.copy(text);
						return `调试证据已复制到剪贴板 (copied, ${entries.length} entries)`;
					}
				}
				catch (error) {}
				try {
					require("electron").clipboard.writeText(text);
					return `调试证据已复制到剪贴板 (copied, ${entries.length} entries)`;
				}
				catch (error) {}
				try {
					if (target.navigator && target.navigator.clipboard && typeof target.navigator.clipboard.writeText == "function") {
						target.navigator.clipboard.writeText(text);
						return `调试证据已复制到剪贴板 (copied, ${entries.length} entries)`;
					}
				}
				catch (error) {}
				return text;
			}
		};
	}

	return Object.freeze({
		marker: SECOND_DEBUG_MARKER,
		record,
		recordParentRenderPass,
		recordDomFiberWalk,
		recordMessageRowShapes,
		runRefreshExperiment,
		getParentRenderCount: () => parentRenderCount,
		wrapModule,
		list: () => entries.slice(),
		dump,
		flush,
		installGlobal
	});
}

// The evidence file lives in BetterDiscord's data folder, never in the plugins
// folder: BetterDiscord watches that folder and would reload the plugin on every
// write.
function createSecondDebugEvidenceSink({fs, path, pluginsFolder, fileName = "translator-second-debug.json"} = {}) {
	if (!fs || typeof fs.writeFileSync != "function" || !path || !pluginsFolder) return null;
	const directory = path.join(pluginsFolder, "..", "data");
	const filePath = path.join(directory, fileName);
	return text => {
		if (typeof fs.existsSync == "function" && !fs.existsSync(directory) && typeof fs.mkdirSync == "function") fs.mkdirSync(directory, {recursive: true});
		fs.writeFileSync(filePath, text, "utf8");
	};
}

// Candidate parent-refresh strategies to try on the real client. Each resolves the
// mounted messages scroller fiber fresh (nothing is cached across a click) and throws a
// clear reason when its target is absent, so the experiment records a usable failure.
function createMessageRefreshStrategies({resolveScrollerElement, forceUpdate, rerenderAll = null, walkDepth = 40} = {}) {
	function resolveStartFiber() {
		const element = resolveScrollerElement && resolveScrollerElement();
		if (!element) throw new Error("no element: messages scroller is not mounted");
		const fiber = findFiberFromElement(element);
		if (!fiber) throw new Error("no fiber: scroller element has no React fiber");
		return fiber;
	}
	function findChannelStreamOwner(fiber) {
		let current = fiber;
		for (let depth = 0; current && depth < walkDepth; depth++) {
			const props = current.memoizedProps || current.pendingProps || null;
			if (props && props.channelStream) return current;
			current = current.return;
		}
		throw new Error("no owner: channelStream owner fiber not found");
	}
	function findUpdateableAncestor(fiber) {
		let current = fiber;
		for (let depth = 0; current && depth < walkDepth; depth++) {
			if (current.stateNode && typeof current.stateNode.forceUpdate == "function") return current;
			current = current.return;
		}
		throw new Error("no ancestor: no updateable class ancestor found");
	}
	const strategies = [
		{
			name: "channelStreamOwnerFiber",
			run: () => forceUpdate(findChannelStreamOwner(resolveStartFiber()))
		},
		{
			name: "channelStreamOwnerStateNode",
			run: () => {
				const owner = findChannelStreamOwner(resolveStartFiber());
				forceUpdate(owner.stateNode || owner);
			}
		},
		{
			name: "nearestUpdateableAncestor",
			run: () => forceUpdate(findUpdateableAncestor(findChannelStreamOwner(resolveStartFiber())).stateNode)
		}
	];
	// The mechanism the 2026-06 plugin shipped with: BDFDB unmounts and rebuilds the
	// chat layer, which crosses every memo boundary. It settles asynchronously
	// (timeout(0) plus two render passes), hence the longer measurement window.
	if (typeof rerenderAll == "function") strategies.push({
		name: "messageUtilsRerenderAll",
		settleMs: 500,
		run: () => rerenderAll(true)
	});
	return strategies;
}

module.exports = {
	SECOND_DEBUG_MARKER,
	createSecondDebugProbe,
	createSecondDebugEvidenceSink,
	createMessageRefreshStrategies,
	describeReactType,
	summarizeFiber,
	summarizeValueShape
};
