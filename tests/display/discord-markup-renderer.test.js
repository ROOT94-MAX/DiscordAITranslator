const test = require("node:test");
const assert = require("node:assert/strict");
const {createDiscordMarkupRenderer} = require("../../src/display/discord-markup-renderer");

// Contract tests for the Discord markup renderer extracted from the legacy runtime
// in display-unification 5d: custom emoji, user/role/channel mentions, and the
// tokenizer that keeps plain text segments intact.

function createRenderer({role = null, channel = null, mentionName = null} = {}) {
	const BDFDB = {
		ReactUtils: {createElement: (type, props) => ({type, props})},
		LibraryStores: {
			SelectedGuildStore: {getGuildId: () => "g1"},
			GuildStore: {getRole: () => role},
			ChannelStore: {getChannel: () => channel}
		}
	};
	return createDiscordMarkupRenderer({BDFDB, getMentionDisplayName: () => mentionName});
}

test("a custom emoji token renders as the cdn image with its name as alt text", () => {
	const renderer = createRenderer();
	const node = renderer.createDiscordMarkupDisplayNode("<a:party:12345>", "k1");
	assert.equal(node.type, "img");
	assert.equal(node.props.src, "https://cdn.discordapp.com/emojis/12345.gif?size=40&quality=lossless");
	assert.equal(node.props.alt, ":party:");
	const still = renderer.createDiscordMarkupDisplayNode("<:calm:678>", "k2");
	assert.equal(still.props.src, "https://cdn.discordapp.com/emojis/678.webp?size=40&quality=lossless");
});

test("mention tokens resolve display names with graceful fallbacks", () => {
	const named = createRenderer({mentionName: "Ada", role: {name: "Mods"}, channel: {name: "general"}});
	assert.equal(named.createDiscordMarkupDisplayNode("<@111>", "k").props.children, "@Ada");
	assert.equal(named.createDiscordMarkupDisplayNode("<@&222>", "k").props.children, "@Mods");
	assert.equal(named.createDiscordMarkupDisplayNode("<#333>", "k").props.children, "#general");
	const bare = createRenderer();
	assert.equal(bare.createDiscordMarkupDisplayNode("<@!111>", "k").props.children, "@user");
	assert.equal(bare.createDiscordMarkupDisplayNode("<@&222>", "k").props.children, "@role");
	assert.equal(bare.createDiscordMarkupDisplayNode("<#333>", "k").props.children, "#channel");
});

test("renderDiscordMarkupText splits tokens out and keeps plain text verbatim", () => {
	const renderer = createRenderer({mentionName: "Ada"});
	const nodes = renderer.renderDiscordMarkupText("hi <@111> and <:calm:678> bye");
	assert.equal(nodes[0], "hi ");
	assert.equal(nodes[1].props.children, "@Ada");
	assert.equal(nodes[2], " and ");
	assert.equal(nodes[3].type, "img");
	assert.equal(nodes[4], " bye");
	assert.equal(renderer.renderDiscordMarkupText(null), "");
	assert.deepEqual(renderer.renderDiscordMarkupText("plain"), ["plain"]);
});
