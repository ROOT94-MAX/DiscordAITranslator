// Per-row repaint through Discord's own store path. A synthetic MESSAGE_UPDATE whose
// partial `message` carries the record's own current content is a no-op by value:
// the store handler MERGES (embeds and attachments survive), and current-client probe
// evidence shows the message-list projection renders while the Composer, active input,
// row element and scroller identities stay stable. A changed display view is accepted
// only after the adapter sees its exact DOM revision. The payload mirrors the captured
// real event at the top level; __translatorSynthetic marks it for handlers that ignore
// plugin-originated dispatches.
//
// Safety posture: rows without a store record are not attempted, every dispatch is
// individually guarded, and the adapter's DOM confirm still owns the verdict. An
// unconfirmed ordinary row remains on bounded targeted retry or paints on mount.
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
