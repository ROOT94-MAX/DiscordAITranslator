// Restored from the pre-rewrite runtime (git 53ee75d): the composer-anchored capsule
// positioner with the slow-mode hint detector. The 2026-08-16 rewrite rounds deleted
// the proximity guards, and the capsule drifted onto the composer icon row and into
// the strip below the input. The guards accept a slow-mode match only when it really
// sits at the composer's top-right; without a hint the capsule returns to the
// original spot - directly above the input, right side. Debug builds record the
// anchor/hint geometry so future drift is calibrated from evidence, not guesses.
// Real-client regression (2026-08-16): the heartbeat repositions once per second, and
// re-running the ancestor walk every tick read textContent across the composer's
// ancestor subtrees each second - the same layout-thrash cost profile as the old
// document-wide scan, and the user saw the same flicker. Detection also never
// succeeded on this client (149 recorded runs), so the repeated scans were pure
// cost. The result is now cached per anchor element: a new composer (channel switch,
// window rebuild) rescans once; a cached hit is reused while it stays connected, and
// a cached miss rescans at most every 15 seconds in case slow mode turns on later.
const hintScanCache = new WeakMap();
const HINT_MISS_RESCAN_MS = 15000;
// The no-hint fallback hugs the input (8px above its top edge) - the position the
// user verified as correct and asked back after a 26px "hint-strip clearance"
// experiment read as drift (2026-08-19 screenshot). Overlap with a REAL slow-mode
// strip is owned by DETECTION instead: the walk finds the strip and stacks the
// capsule above it, and message-text false positives are structurally rejected in
// the scan below, so the fallback keeps no defensive distance.

function findNativeTextAreaStatusElement({document: documentRef, anchorRect = null, anchorElement = null}) {
	if (!documentRef) return null;
	const now = Date.now();
	const cached = anchorElement && hintScanCache.get(anchorElement) || null;
	if (cached) {
		// A cached hint must still be connected AND still have a real box: Discord can
		// hide the strip while the node stays connected, and aligning to a collapsed
		// rect flung the capsule to the viewport origin (2026-08-19 audit). Either way
		// the entry is dropped and this pass rescans.
		const cachedRect = cached.hint && typeof cached.hint.getBoundingClientRect == "function" ? cached.hint.getBoundingClientRect() : null;
		const cachedHintAlive = cached.hint && cached.hint.isConnected === true && cachedRect && cachedRect.width && cachedRect.height;
		if (cached.hint && !cachedHintAlive) hintScanCache.delete(anchorElement);
		else if (cached.hint || now - cached.scannedAt < HINT_MISS_RESCAN_MS) return cached.hint;
	}
	// Scope history: the 2026-08-16 round restricted the scan to the composer's own
	// parent after the per-tick ancestor walk caused the flicker regression - but the
	// cost came from rescanning every heartbeat tick, not from depth, and the cache
	// below already eliminates per-tick work. Real-client evidence (2026-08-19
	// screenshot: the capsule covering the slow-mode hint) showed the hint lives
	// beyond the parent on current clients - the reason for 149 recorded misses. The
	// walk now climbs three ancestor levels, first hit wins, all under the same
	// once-per-composer cache with the 15s miss-rescan.
	const matchIn = scope => {
		let candidates = [];
		try {candidates = Array.from(scope.querySelectorAll("div, span"));}
		catch (err) {return [];}
		return candidates.map(element => {
			if (!element || element.id == "DiscordAITranslator-loaded-status" || !element.getBoundingClientRect) return null;
			// Translated MESSAGES routinely contain 已开启 / slow mode as ordinary text,
			// and the last message's lines sit exactly in the proximity band above the
			// input (2026-08-19 screenshot: the capsule aligned onto a message). Anything
			// inside a message row or the message scroller is structurally not the hint.
			try {
				if (typeof element.closest == "function" && element.closest('[id^="chat-messages-"], [data-list-item-id*="chat-messages"], ol[class*="scrollerInner"], [class*="messagesWrapper"]')) return null;
			}
			catch (err) {}
			const text = (element.textContent || "").trim();
			if (!text || !(/慢速模式|slow\s*mode|slowmode|已开启/i.test(text))) return null;
			const rect = element.getBoundingClientRect();
			if (!rect.width || !rect.height) return null;
			if (anchorRect) {
				// Old clients render the slow-mode hint in a strip ABOVE the input; this
				// client (PTB 1.0.1214, probe evidence 2026-08-16) renders it BELOW. Both
				// bands pass - anything else (the icon row, the channel list) is rejected.
				const nearInputTop = rect.bottom <= anchorRect.top + 10 && rect.bottom >= anchorRect.top - 42;
				const aboveInput = rect.top >= anchorRect.top - 58 && rect.top <= anchorRect.top + 8;
				const belowInput = rect.top >= anchorRect.bottom - 10 && rect.top <= anchorRect.bottom + 42 && rect.bottom <= anchorRect.bottom + 58;
				const nearInputRight = rect.right <= anchorRect.right + 24 && rect.right >= anchorRect.left + anchorRect.width * 0.45;
				if (!nearInputRight || !(nearInputTop && aboveInput || belowInput)) return null;
			}
			return {element, rect, area: rect.width * rect.height};
			// Smallest match wins: the wrappers around the slow-mode text also match by
			// textContent, and their right edges sit past the visible text (2026-08-19
			// overflow report). The innermost node IS the text the user sees.
		}).filter(Boolean).sort((a, b) => a.area - b.area);
	};
	let found = null;
	let scope = anchorElement && anchorElement.parentElement || null;
	for (let level = 0; level < 3 && scope && !found; level++, scope = scope.parentElement) {
		const matches = matchIn(scope);
		found = matches.length && matches[0] && matches[0].element || null;
	}
	if (anchorElement) hintScanCache.set(anchorElement, {hint: found, scannedAt: now});
	return found;
}

function positionLoadedStatusElement({BDFDB, document: documentRef, window: windowRef, element}) {
	if (!element || !documentRef || !windowRef || typeof documentRef.querySelectorAll != "function") return;
	const selectors = ['[class*="channelTextArea"]', 'form [role="textbox"]'];
	let anchors = [];
	for (const selector of selectors) {
		if (!selector) continue;
		try {anchors = anchors.concat(Array.from(documentRef.querySelectorAll(selector)).filter(Boolean));}
		catch (err) {}
	}
	anchors = anchors.map(anchor => {
		if (!anchor || !anchor.getBoundingClientRect) return null;
		const rect = anchor.getBoundingClientRect();
		if (!rect.width || !rect.height) return null;
		const visible = rect.bottom > 0 && rect.top < windowRef.innerHeight && rect.right > 0 && rect.left < windowRef.innerWidth;
		if (!visible) return null;
		const nearBottom = Math.max(0, windowRef.innerHeight - rect.bottom);
		const widthScore = Math.min(rect.width, 900);
		const score = widthScore - nearBottom * 2 + rect.right * 0.05;
		return {anchor, rect, score};
	}).filter(Boolean).sort((a, b) => b.score - a.score);
	const anchorData = anchors[0];
	const anchor = anchorData && anchorData.anchor;
	// Every display transaction rebuilds the whole chat layer, so for a frame the
	// composer is unmounted. Teleporting to the legacy bottom-right corner and back is
	// the "old capsule residue" jump users reported (2026-08-19); a capsule that was
	// already positioned keeps its spot until an anchor exists again. The corner
	// fallback below remains for a capsule that has never been positioned.
	if (!anchor && element.style && element.style.top) return;
	const viewportPadding = 12;
	let maxStatusWidth = Math.max(180, Math.min(360, windowRef.innerWidth - viewportPadding * 2));
	if (anchor && anchor.getBoundingClientRect) {
		const anchorRect = anchor.getBoundingClientRect();
		if (anchorRect && anchorRect.width) maxStatusWidth = Math.max(180, Math.min(maxStatusWidth, Math.floor(anchorRect.width * 0.55), anchorRect.width - 16));
	}
	element.style.maxWidth = `${Math.round(maxStatusWidth)}px`;
	const measuredRect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
	const statusHeight = Math.max(18, measuredRect && measuredRect.height || element.offsetHeight || 20);
	// The capsule is pinned by its RIGHT edge (2026-08-19 report: positioning the left
	// edge from a measured width let the pill overflow the border whenever the session
	// counter made the text longer between repositions). With the right edge pinned,
	// growth extends leftward and the border alignment can never break; maxWidth above
	// keeps the leftward growth inside the composer.
	element.style.left = "auto";
	element.style.bottom = "auto";
	let anchorRectOut = null, nativeHintRect = null, right = 0, top = 0;
	if (anchor && anchor.getBoundingClientRect) {
		const rect = anchor.getBoundingClientRect();
		anchorRectOut = rect;
		const nativeStatus = findNativeTextAreaStatusElement({document: documentRef, anchorRect: rect, anchorElement: anchor});
		right = windowRef.innerWidth - (rect.right - viewportPadding);
		top = rect.top - statusHeight - 8;
		if (nativeStatus && nativeStatus.getBoundingClientRect) {
			const nativeRect = nativeStatus.getBoundingClientRect();
			nativeHintRect = nativeRect;
			// 检测到 Discord 原生“慢速模式已开启”时，放在它的正上方并右对齐。对齐以提示自身的
			// 右缘为准（实测提示可宽于输入框容器）。
			right = windowRef.innerWidth - nativeRect.right;
			top = nativeRect.top - statusHeight - 8;
		}
		right = Math.max(viewportPadding, right);
		top = Math.max(viewportPadding, Math.min(top, windowRef.innerHeight - statusHeight - viewportPadding));
	}
	else {
		right = 108;
		top = Math.max(viewportPadding, windowRef.innerHeight - statusHeight - 54);
	}
	element.style.right = `${Math.round(right)}px`;
	element.style.top = `${Math.round(top)}px`;
	if (typeof __TRANSLATOR_DISPLAY_DEBUG__ != "undefined" && __TRANSLATOR_DISPLAY_DEBUG__ && windowRef.TranslatorDebug && windowRef.TranslatorDebug.recordPositioning) {
		windowRef.TranslatorDebug.recordPositioning({
			anchor: anchorRectOut && {top: Math.round(anchorRectOut.top), bottom: Math.round(anchorRectOut.bottom), right: Math.round(anchorRectOut.right)},
			hint: nativeHintRect && {top: Math.round(nativeHintRect.top), right: Math.round(nativeHintRect.right)},
			right: Math.round(right),
			top: Math.round(top)
		});
		// Every hint guess so far failed on the real client (85 positioning runs, zero
		// detections), so while detection comes up empty the whole document is surveyed
		// once per positioning pass and every slow-mode-text node is recorded with its
		// tag, class and rect. The next calibration reads where the hint really lives.
		if (!nativeHintRect && documentRef.querySelectorAll) {
			try {
				const found = [];
				for (const node of documentRef.querySelectorAll("div, span, time, label")) {
					const text = (node.textContent || "").trim();
					if (!text || text.length > 40 || !/慢速模式|slow\s*mode|slowmode|已开启/i.test(text)) continue;
					if (!node.getBoundingClientRect) continue;
					const rect = node.getBoundingClientRect();
					if (!rect.width || !rect.height) continue;
					found.push({tag: node.tagName, cls: String(node.className).slice(0, 80), text: text.slice(0, 24), top: Math.round(rect.top), left: Math.round(rect.left), right: Math.round(rect.right), bottom: Math.round(rect.bottom)});
					if (found.length >= 20) break;
				}
				if (found.length) windowRef.TranslatorDebug.recordPositioning({survey: found});
			}
			catch (err) {}
		}
	}
}

module.exports = {findNativeTextAreaStatusElement, positionLoadedStatusElement};
