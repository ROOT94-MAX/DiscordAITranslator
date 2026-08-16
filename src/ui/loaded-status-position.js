// Restored from the pre-rewrite runtime (git 53ee75d): the composer-anchored capsule
// positioner with the slow-mode hint detector. The 2026-08-16 rewrite rounds deleted
// the proximity guards, and the capsule drifted onto the composer icon row and into
// the strip below the input. The guards accept a slow-mode match only when it really
// sits at the composer's top-right; without a hint the capsule returns to the
// original spot - directly above the input, right side. Debug builds record the
// anchor/hint geometry so future drift is calibrated from evidence, not guesses.
function findNativeTextAreaStatusElement({document: documentRef, anchorRect = null, anchorElement = null}) {
	if (!documentRef) return null;
	let candidates = [];
	// Scoped to the input container: a document-wide scan read textContent off every
	// div and span in the app, once per status update, once per message.
	try {candidates = Array.from((anchorElement && anchorElement.parentElement || anchorElement || documentRef).querySelectorAll("div, span"));}
	catch (err) {return null;}
	const matches = candidates.map(element => {
		if (!element || element.id == "DiscordAITranslator-loaded-status" || !element.getBoundingClientRect) return null;
		const text = (element.textContent || "").trim();
		if (!text || !(/慢速模式|slow\s*mode|slowmode|已开启/i.test(text))) return null;
		const rect = element.getBoundingClientRect();
		if (!rect.width || !rect.height) return null;
		if (anchorRect) {
			const nearInputTop = rect.bottom <= anchorRect.top + 10 && rect.bottom >= anchorRect.top - 42;
			const nearInputRight = rect.right <= anchorRect.right + 24 && rect.right >= anchorRect.left + anchorRect.width * 0.45;
			const aboveInput = rect.top >= anchorRect.top - 58 && rect.top <= anchorRect.top + 8;
			if (!nearInputTop || !nearInputRight || !aboveInput) return null;
		}
		return {element, rect, score: rect.right + rect.bottom};
	}).filter(Boolean).sort((a, b) => b.score - a.score);
	return matches[0] && matches[0].element || null;
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
			// 检测到 Discord 原生“慢速模式已开启”时，放在它的上方并右对齐，不再横向挪到频道列表。
			left = Math.max(rect.left + 8, Math.min(nativeRect.right - statusWidth, rect.right - statusWidth - 8));
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
	}
}

module.exports = {findNativeTextAreaStatusElement, positionLoadedStatusElement};
