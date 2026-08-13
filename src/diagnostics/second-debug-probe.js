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

function createSecondDebugProbe({log = () => {}, now = Date.now, limit = 400} = {}) {
	const entries = [];
	const instanceIds = new WeakMap();
	const parentEntriesBySignature = new Map();
	const missingModuleLabels = new Set();
	let nextInstanceId = 0;
	let nextCallId = 0;

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
		return entry;
	}

	function record(kind, data) {
		return push(Object.assign({kind, timestamp: now()}, data));
	}

	function recordParentRenderPass(e) {
		const instance = e && e.instance;
		let instanceId = null;
		if (instance && (typeof instance == "object" || typeof instance == "function")) {
			if (!instanceIds.has(instance)) instanceIds.set(instance, ++nextInstanceId);
			instanceId = instanceIds.get(instance);
		}
		const fiber = instance && (instance._reactInternals || instance._reactInternalFiber) || null;
		const props = instance && instance.props || null;
		const summary = {
			instanceId,
			instanceType: instance == null ? String(instance) : typeof instance,
			constructorName: instance && instance.constructor && instance.constructor.name || null,
			hasForceUpdate: !!(instance && typeof instance.forceUpdate == "function"),
			hasReactInternals: !!fiber,
			eventKeys: e && typeof e == "object" ? Object.keys(e).slice(0, MAX_KEYS) : [],
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
				resolved => {entry.result = summarizeValueShape(resolved, 3); entry.settledAt = now();},
				error => {entry.error = error && error.message || String(error); entry.settledAt = now();}
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

	function dump() {
		return JSON.stringify({marker: SECOND_DEBUG_MARKER, generatedAt: now(), entryCount: entries.length, entries});
	}

	function installGlobal(target) {
		if (!target) return;
		target.TranslatorDebug = {
			marker: SECOND_DEBUG_MARKER,
			list: () => entries.slice(),
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
		wrapModule,
		list: () => entries.slice(),
		dump,
		installGlobal
	});
}

module.exports = {
	SECOND_DEBUG_MARKER,
	createSecondDebugProbe,
	describeReactType,
	summarizeFiber,
	summarizeValueShape
};
