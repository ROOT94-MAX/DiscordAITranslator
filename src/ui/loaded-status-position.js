// Restored from the pre-rewrite runtime (git 53ee75d): the composer-anchored capsule
// positioner with the slow-mode hint detector. The 2026-08-16 rewrite rounds deleted
// the proximity guards, and the capsule drifted onto the composer icon row and into
// the strip below the input. The guards accept a slow-mode match only when it really
// sits at the composer's top-right; without a hint the capsule returns to the
// original spot - directly above the input, right side. Debug builds record the
// anchor/hint geometry so future drift is calibrated from evidence, not guesses.
function findNativeTextAreaStatusElement({document: documentRef, anchorRect = null, anchorElement = null}) {
	if (!documentRef) return null;
	// Survey evidence (2026-08-16): two fixed-depth scope guesses both found nothing
	// while a document-wide survey saw the hint every time - its container depth
	// varies with the client build. The scan WALKS UP from the composer one wrapper
	// at a time and stops before any ancestor reaches deep into the message list
	// (150px above the input), so each scanned subtree stays composer-sized.
	const matchIn = scope => {
		let candidates = [];
		try {candidates = Array.from(scope.querySelectorAll("div, span"));}
		catch (err) {return [];}
		return candidates.map(element => {
			if (!element || element.id == "DiscordAITranslator-loaded-status" || !element.getBoundingClientRect) return null;
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
			return {element, rect, score: rect.right + rect.bottom};
		}).filter(Boolean).sort((a, b) => b.score - a.score);
	};
	let scope = anchorElement && anchorElement.parentElement || null;
	for (let level = 0; scope && level < 8; level++) {
		let scopeRect = null;
		try {scopeRect = scope.getBoundingClientRect && scope.getBoundingClientRect() || null;}
		catch (err) {scopeRect = null;}
		if (anchorRect && scopeRect && scopeRect.top < anchorRect.top - 150) break;
		const matches = matchIn(scope);
		if (matches.length) return matches[0] && matches[0].element || null;
		scope = scope.parentElement;
	}
	return null;
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
	const viewportPadding = 12;
	let maxStatusWidth = Math.max(180, Math.min(360, windowRef.innerWidth - viewportPadding * 2));
	if (anchor && anchor.getBoundingClientRect) {
		const anchorRect = anchor.getBoundingClientRect();
		if (anchorRect && anchorRect.width) maxStatusWidth = Math.max(180, Math.min(maxStatusWidth, Math.floor(anchorRect.width * 0.55), anchorRect.width - 16));
	}
	element.style.maxWidth = `${Math.round(maxStatusWidth)}px`;
	const measuredRect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
	const statusWidth = Math.max(180, Math.min(measuredRect && measuredRect.width || element.offsetWidth || 260, maxStatusWidth));
	const statusHeight = Math.max(18, measuredRect && measuredRect.height || element.offsetHeight || 20);
	element.style.right = "auto";
	element.style.bottom = "auto";
	let anchorRectOut = null, nativeHintRect = null, left = 0, top = 0;
	if (anchor && anchor.getBoundingClientRect) {
		const rect = anchor.getBoundingClientRect();
		anchorRectOut = rect;
		const nativeStatus = findNativeTextAreaStatusElement({document: documentRef, anchorRect: rect, anchorElement: anchor});
		left = rect.right - statusWidth - viewportPadding;
		top = rect.top - statusHeight - 8;
		if (nativeStatus && nativeStatus.getBoundingClientRect) {
			const nativeRect = nativeStatus.getBoundingClientRect();
			nativeHintRect = nativeRect;
			// 检测到 Discord 原生“慢速模式已开启”时，放在它的上方并右对齐。对齐以提示自身的右缘
			// 为准（实测提示可宽于输入框容器，旧代码按输入框右缘截断导致差几个像素）。
			left = Math.max(rect.left + 8, Math.min(nativeRect.right - statusWidth, windowRef.innerWidth - statusWidth - viewportPadding));
			top = nativeRect.top - statusHeight - 8;
		}
		else {
			left = Math.max(rect.left + 8, Math.min(left, rect.right - statusWidth - 8));
		}
		top = Math.max(viewportPadding, Math.min(top, windowRef.innerHeight - statusHeight - viewportPadding));
	}
	else {
		left = Math.max(viewportPadding, windowRef.innerWidth - statusWidth - 108);
		top = Math.max(viewportPadding, windowRef.innerHeight - statusHeight - 54);
	}
	element.style.left = `${Math.round(left)}px`;
	element.style.top = `${Math.round(top)}px`;
	if (typeof __TRANSLATOR_DISPLAY_DEBUG__ != "undefined" && __TRANSLATOR_DISPLAY_DEBUG__ && windowRef.TranslatorDebug && windowRef.TranslatorDebug.recordPositioning) {
		windowRef.TranslatorDebug.recordPositioning({
			anchor: anchorRectOut && {top: Math.round(anchorRectOut.top), bottom: Math.round(anchorRectOut.bottom), right: Math.round(anchorRectOut.right)},
			hint: nativeHintRect && {top: Math.round(nativeHintRect.top), right: Math.round(nativeHintRect.right)},
			left: Math.round(left),
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
