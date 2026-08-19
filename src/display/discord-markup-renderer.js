// Renders Discord's inline markup tokens (custom emoji, user/role/channel
// mentions) inside translated and original text blocks. Extracted verbatim from
// the legacy runtime in display-unification 5d; mention-name resolution stays on
// the plugin (it reads message mentions and the user store) and is injected.
function createDiscordMarkupRenderer({BDFDB, getMentionDisplayName}) {
	function getCustomEmojiAssetUrl(emojiId, animated = false) {
		if (!emojiId) return "";
		return `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? "gif" : "webp"}?size=40&quality=lossless`;
	}

	function createDiscordMarkupDisplayNode(token, key) {
		if (!token) return token;
		let match = /^<(a?):([A-Za-z0-9_~]+):(\d+)>$/.exec(token);
		if (match) {
			const animated = match[1] == "a";
			const emojiName = match[2];
			const emojiId = match[3];
			return BDFDB.ReactUtils.createElement("img", {
				key,
				className: "translator-discord-emoji",
				src: getCustomEmojiAssetUrl(emojiId, animated),
				alt: `:${emojiName}:`,
				title: `:${emojiName}:`,
				draggable: false
			});
		}
		match = /^<@!?(\d+)>$/.exec(token);
		if (match) {
			const displayName = getMentionDisplayName(match[1]) || "user";
			return BDFDB.ReactUtils.createElement("span", {
				key,
				className: "translator-discord-mention",
				children: `@${displayName}`
			});
		}
		match = /^<@&(\d+)>$/.exec(token);
		if (match) {
			let roleName = "role";
			try {
				const guildId = BDFDB.LibraryStores.SelectedGuildStore && BDFDB.LibraryStores.SelectedGuildStore.getGuildId && BDFDB.LibraryStores.SelectedGuildStore.getGuildId();
				const role = guildId && BDFDB.LibraryStores.GuildStore && BDFDB.LibraryStores.GuildStore.getRole && BDFDB.LibraryStores.GuildStore.getRole(guildId, match[1]);
				if (role && role.name) roleName = role.name;
			}
			catch (err) {}
			return BDFDB.ReactUtils.createElement("span", {
				key,
				className: "translator-discord-mention translator-discord-role-mention",
				children: `@${roleName}`
			});
		}
		match = /^<#(\d+)>$/.exec(token);
		if (match) {
			let channelName = "channel";
			try {
				const channel = BDFDB.LibraryStores.ChannelStore && BDFDB.LibraryStores.ChannelStore.getChannel && BDFDB.LibraryStores.ChannelStore.getChannel(match[1]);
				if (channel && channel.name) channelName = channel.name;
			}
			catch (err) {}
			return BDFDB.ReactUtils.createElement("span", {
				key,
				className: "translator-discord-mention translator-discord-channel-mention",
				children: `#${channelName}`
			});
		}
		return token;
	}

	function renderDiscordMarkupText(text, keyPrefix = "discord-markup") {
		if (text == null) return "";
		text = String(text);
		const nodes = [];
		const tokenRegex = /(<a?:[A-Za-z0-9_~]+:\d+>|<@!?\d+>|<@&\d+>|<#\d+>)/g;
		let lastIndex = 0;
		let match;
		let index = 0;
		while ((match = tokenRegex.exec(text))) {
			if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
			nodes.push(createDiscordMarkupDisplayNode(match[0], `${keyPrefix}-${index++}`));
			lastIndex = match.index + match[0].length;
		}
		if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
		return nodes;
	}

	return Object.freeze({getCustomEmojiAssetUrl, createDiscordMarkupDisplayNode, renderDiscordMarkupText});
}

module.exports = {createDiscordMarkupRenderer};
