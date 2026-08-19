// Per-row repaint through Discord's own store path - the verified endgame route
// (recovery plan route 1; field experiment 2026-08-19, evidence in
// translator-message-update-experiment.json). A synthetic MESSAGE_UPDATE whose
// partial `message` carries the record's own current content is a no-op by value:
// the store handler MERGES (embeds and attachments survived the experiment), the
// row re-renders through Discord's normal path, and the content render patch
// re-applies the translation - no whole-layer rebuild, no composer remount, no
// scroll-restore dance. The payload mirrors the probe-captured real event exactly
// at the top level ({type, guildId, message}); __translatorSynthetic marks it for
// any handler that must ignore our own dispatches.
//
// Safety posture: rows without a store record are not attempted, every dispatch is
// individually guarded, and the adapter's DOM confirm still owns the verdict - an
// unconfirmed row falls through to the rebuild exactly as before.
const MESSAGE_UPDATE_ACTION = "MESSAGE_UPDATE";

function createFluxRowRepaint({resolveDispatcher = () => null, getStoreMessage = () => null, getGuildId = () => null} = {}) {
	function repaintRows(messageIds = [], {channelId = null} = {}) {
		if (!channelId) return [];
		let dispatcher = null;
		try {dispatcher = resolveDispatcher();}
		catch (error) {dispatcher = null;}
		if (!dispatcher || typeof dispatcher.dispatch != "function") return [];
		let guildId;
		try {guildId = getGuildId(channelId) || undefined;}
		catch (error) {guildId = undefined;}
		const attempted = [];
		for (const messageId of messageIds) {
			let record = null;
			try {record = getStoreMessage(channelId, messageId);}
			catch (error) {record = null;}
			if (!record) continue;
			try {
				dispatcher.dispatch({
					type: MESSAGE_UPDATE_ACTION,
					guildId,
					message: {id: String(messageId), channel_id: String(channelId), guild_id: guildId, content: typeof record.content == "string" ? record.content : ""},
					__translatorSynthetic: true
				});
				attempted.push(String(messageId));
			}
			catch (error) {}
		}
		return attempted;
	}

	return Object.freeze({repaintRows});
}

module.exports = {createFluxRowRepaint, MESSAGE_UPDATE_ACTION};
