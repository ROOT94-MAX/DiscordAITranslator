const test = require("node:test");
const assert = require("node:assert/strict");
const {getGeneralSettingLabels} = require("../../src/i18n/labels");

// Pins the general-settings label map extracted from the legacy runtime in
// display-unification 5d: one representative key per language plus the
// missing-key contract the runtime's fallback chain relies on.

test("general setting labels resolve per ui language", () => {
	const english = getGeneralSettingLabels({isChinese: false, isRussian: false});
	assert.equal(english.showOriginalMessage, "Also show the original text with translated incoming messages");
	const chinese = getGeneralSettingLabels({isChinese: true, isRussian: false});
	assert.equal(chinese.showOriginalMessage, "查看收到的译文时同时显示原文");
	const russian = getGeneralSettingLabels({isChinese: false, isRussian: true});
	assert.equal(russian.showOriginalMessage, "Показывать оригинал рядом с переведёнными входящими сообщениями");
});

test("an unknown key stays undefined so the runtime fallback chain can take over", () => {
	const labels = getGeneralSettingLabels({isChinese: false, isRussian: false});
	assert.equal(labels.notARealSettingKey, undefined);
});
