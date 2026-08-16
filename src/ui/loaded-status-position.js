// Positions the floating loaded-status capsule. Product rule (2026-08-16): the
// capsule's right edge sits on the same vertical line as the native hint's right
// edge (slow mode etc.), floating above the hint; without a hint it takes the hint's
// own row, right-aligned to the chat area. The hint pick must survive wrappers and
// client layout drift: only nodes inside the bottom strip count, and the smallest
// match wins, because a large container also carries the hint words in its
// textContent and matching it once put the capsule on the icons above the input.
function positionLoadedStatusElement({BDFDB, document: documentRef, window: windowRef, element}) {
	if (!element || !documentRef || typeof documentRef.querySelector != "function") return;
	const viewportPadding = 12;
	const innerWidth = windowRef && windowRef.innerWidth || 1280;
	const innerHeight = windowRef && windowRef.innerHeight || 720;
	let scroller = null, scrollerRect = null;
	try {
		scroller = documentRef.querySelector(BDFDB && BDFDB.dotCN && BDFDB.dotCN.messagesscroller || ".messages-scroller");
		if (scroller && scroller.getBoundingClientRect) scrollerRect = scroller.getBoundingClientRect();
	}
	catch (err) {scroller = null; scrollerRect = null;}
	let composerRect = null, nativeHintRect = null;
	const positioningCandidates = [];
	try {
		const composer = documentRef.querySelector("form");
		if (composer && composer.getBoundingClientRect) composerRect = composer.getBoundingClientRect() || null;
		const hintScope = scroller && scroller.parentElement || composer && composer.parentElement || null;
		const stripFloor = (composerRect && composerRect.bottom || scrollerRect && scrollerRect.bottom || innerHeight) - 48;
		if (hintScope && hintScope.querySelectorAll) {
			const matches = Array.from(hintScope.querySelectorAll("div, span")).map(node => {
				if (!node || !node.getBoundingClientRect) return null;
				const text = (node.textContent || "").trim();
				if (!text || !(/慢速模式|slow\s*mode|slowmode|已开启/i.test(text))) return null;
				const rect = node.getBoundingClientRect();
				if (!rect.width || !rect.height) return null;
				return {rect, area: rect.width * rect.height};
			}).filter(match => match && match.rect.bottom >= stripFloor && match.area <= 400 * 32);
			for (const match of matches.slice(0, 6)) positioningCandidates.push({top: Math.round(match.rect.top), right: Math.round(match.rect.right), bottom: Math.round(match.rect.bottom), area: Math.round(match.area)});
			const nativeHint = matches.sort((a, b) => a.area - b.area)[0];
			nativeHintRect = nativeHint && nativeHint.rect || null;
		}
	}
	catch (err) {composerRect = null;}
	element.style.right = "auto";
	element.style.bottom = "auto";
	let maxStatusWidth = Math.max(180, Math.min(360, innerWidth - viewportPadding * 2));
	if (scrollerRect && scrollerRect.width) maxStatusWidth = Math.max(180, Math.min(maxStatusWidth, Math.floor(scrollerRect.width * 0.55), scrollerRect.width - 16));
	element.style.maxWidth = `${Math.round(maxStatusWidth)}px`;
	const measuredRect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
	const statusWidth = Math.max(180, Math.min(measuredRect && measuredRect.width || element.offsetWidth || 260, maxStatusWidth));
	const statusHeight = Math.max(18, measuredRect && measuredRect.height || element.offsetHeight || 20);
	const anchorRight = nativeHintRect ? nativeHintRect.right : scrollerRect && scrollerRect.width ? scrollerRect.right - viewportPadding : composerRect && composerRect.width ? composerRect.right - viewportPadding : innerWidth - viewportPadding;
	const anchorBottom = nativeHintRect ? nativeHintRect.top - 6 : composerRect && composerRect.height ? composerRect.bottom - 6 : scrollerRect && scrollerRect.height ? scrollerRect.bottom - viewportPadding : innerHeight - viewportPadding;
	const left = Math.max(viewportPadding, Math.min(anchorRight - statusWidth, innerWidth - statusWidth - viewportPadding));
	const top = Math.max(viewportPadding, Math.min(anchorBottom - statusHeight, innerHeight - statusHeight - viewportPadding));
	element.style.left = `${Math.round(left)}px`;
	element.style.top = `${Math.round(top)}px`;
	if (typeof __TRANSLATOR_DISPLAY_DEBUG__ != "undefined" && __TRANSLATOR_DISPLAY_DEBUG__ && windowRef && windowRef.TranslatorDebug && windowRef.TranslatorDebug.recordPositioning) {
		windowRef.TranslatorDebug.recordPositioning({
			composer: composerRect && {top: Math.round(composerRect.top), bottom: Math.round(composerRect.bottom), right: Math.round(composerRect.right)},
			scroller: scrollerRect && {top: Math.round(scrollerRect.top), bottom: Math.round(scrollerRect.bottom), right: Math.round(scrollerRect.right)},
			hint: nativeHintRect && {top: Math.round(nativeHintRect.top), right: Math.round(nativeHintRect.right)},
			candidates: positioningCandidates,
			left: Math.round(left),
			top: Math.round(top)
		});
	}
}

module.exports = {positionLoadedStatusElement};
