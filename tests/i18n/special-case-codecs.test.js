const test = require("node:test");
const assert = require("node:assert/strict");
const {createSpecialCaseCodecs} = require("../../src/i18n/special-case-codecs");

// Contract tests for the special-case codecs extracted from the legacy runtime in
// display-unification 5d. They pin the shipped conversion behavior: auto-detection
// of the four special formats and the exact round-trip conversions.

function createCodecs(invalidNotices = []) {
	return createSpecialCaseCodecs({onInvalidBinary: message => invalidNotices.push(message)});
}

test("checkForSpecialCase detects the four special formats only in auto mode", () => {
	const codecs = createCodecs();
	assert.deepEqual(codecs.checkForSpecialCase("0100 1000", {auto: true}), {id: "binary", name: "Binary"});
	assert.deepEqual(codecs.checkForSpecialCase("⠓⠑⠇⠇⠕", {auto: true}), {id: "braille", name: "Braille 6-dot"});
	assert.deepEqual(codecs.checkForSpecialCase("···· ·", {auto: true}), {id: "morse", name: "Morse"});
	assert.deepEqual(codecs.checkForSpecialCase("0x48 0x49", {auto: true}), {id: "hex", name: "Hexadecimal"});
	assert.equal(codecs.checkForSpecialCase("hello", {auto: true}), null, "plain text is not a special case");
	assert.equal(codecs.checkForSpecialCase("0100 1000", {}), null, "detection only runs for the auto input language");
	const special = {special: true, id: "morse", name: "Morse"};
	assert.equal(codecs.checkForSpecialCase("anything", special), special, "an explicit special input passes through");
});

test("binary, braille, morse, and hex round-trip through their string conversions", () => {
	const codecs = createCodecs();
	assert.equal(codecs.binary2string(codecs.string2binary("Hi")), "Hi");
	assert.equal(codecs.braille2string(codecs.string2braille("hello")), "hello");
	assert.equal(codecs.morse2string(codecs.string2morse("hello world")), "hello world");
	assert.equal(codecs.hex2string(codecs.string2hex("Hi there")), "Hi there");
});

test("invalid binary reports through the injected notice instead of throwing", () => {
	const invalidNotices = [];
	const codecs = createCodecs(invalidNotices);
	assert.equal(codecs.binary2string("01x1"), "", "invalid binary converts to nothing");
	assert.equal(invalidNotices.length, 1, "the invalid-format notice fires exactly once");
});
