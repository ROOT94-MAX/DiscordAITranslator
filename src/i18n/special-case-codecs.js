// The special-case codecs: detection and conversion for the four non-language
// "languages" (binary, braille, morse, hex) the translator supports. Extracted
// verbatim from the legacy runtime in display-unification 5d; the only seam is the
// invalid-binary notice, injected so the codec stays free of BDFDB.
const brailleConverter = {
	"0":"⠴", "1":"⠂", "2":"⠆", "3":"⠒", "4":"⠲", "5":"⠢", "6":"⠖", "7":"⠶", "8":"⠦", "9":"⠔", "!":"⠮", "\"":"⠐", "#":"⠼", "$":"⠫", "%":"⠩", "&":"⠯", "'":"⠄", "(":"⠷", ")":"⠾", "*":"⠡", "+":"⠬", ",":"⠠", "-":"⠤", ".":"⠨", "/":"⠌", ":":"⠱", ";":"⠰", "<":"⠣", "=":"⠿", ">":"⠜", "?":"⠹", "@":"⠈", "a":"⠁", "b":"⠃", "c":"⠉", "d":"⠙", "e":"⠑", "f":"⠋", "g":"⠛", "h":"⠓", "i":"⠊", "j":"⠚", "k":"⠅", "l":"⠇", "m":"⠍", "n":"⠝", "o":"⠕", "p":"⠏", "q":"⠟", "r":"⠗", "s":"⠎", "t":"⠞", "u":"⠥", "v":"⠧", "w":"⠺", "x":"⠭", "y":"⠽", "z":"⠵", "[":"⠪", "\\":"⠳", "]":"⠻", "^":"⠘", "⠁":"a", "⠂":"1", "⠃":"b", "⠄":"'", "⠅":"k", "⠆":"2", "⠇":"l", "⠈":"@", "⠉":"c", "⠊":"i", "⠋":"f", "⠌":"/", "⠍":"m", "⠎":"s", "⠏":"p", "⠐":"\"", "⠑":"e", "⠒":"3", "⠓":"h", "⠔":"9", "⠕":"o", "⠖":"6", "⠗":"r", "⠘":"^", "⠙":"d", "⠚":"j", "⠛":"g", "⠜":">", "⠝":"n", "⠞":"t", "⠟":"q", "⠠":", ", "⠡":"*", "⠢":"5", "⠣":"<", "⠤":"-", "⠥":"u", "⠦":"8", "⠧":"v", "⠨":".", "⠩":"%", "⠪":"[", "⠫":"$", "⠬":"+", "⠭":"x", "⠮":"!", "⠯":"&", "⠰":";", "⠱":":", "⠲":"4", "⠳":"\\", "⠴":"0", "⠵":"z", "⠶":"7", "⠷":"(", "⠸":"_", "⠹":"?", "⠺":"w", "⠻":"]", "⠼":"#", "⠽":"y", "⠾":")", "⠿":"=", "_":"⠸"
};

const morseConverter = {
	"0":"−−−−−", "1":"·−−−−", "2":"··−−−", "3":"···−−", "4":"····−", "5":"·····", "6":"−····", "7":"−−···", "8":"−−−··", "9":"−−−−·", "!":"−·−·−−", "\"":"·−··−·", "$":"···−··−", "&":"·−···", "'":"·−−−−·", "(":"−·−−·", ")":"−·−−·−", "+":"·−·−·", ",":"−−··−−", "-":"−····−", ".":"·−·−·−", "/":"−··−·", ":":"−−−···", ";":"−·−·−·", "=":"−···−", "?":"··−−··", "@":"·−−·−·", "a":"·−", "b":"−···", "c":"−·−·", "d":"−··", "e":"·", "f":"··−·", "g":"−−·", "h":"····", "i":"··", "j":"·−−−", "k":"−·−", "l":"·−··", "m":"−−", "n":"−·", "o":"−−−", "p":"·−−·", "q":"−−·−", "r":"·−·", "s":"···", "t":"−", "u":"··−", "v":"···−", "w":"·−−", "x":"−··−", "y":"−·−−", "z":"−−··", "·":"e", "··":"i", "···":"s", "····":"h", "·····":"5", "····−":"4", "···−":"v", "···−··−":"$", "···−−":"3", "··−":"u", "··−·":"f", "··−−··":"?", "··−−·−":"_", "··−−−":"2", "·−":"a", "·−·":"r", "·−··":"l", "·−···":"&", "·−··−·":"\"", "·−·−·":"+", "·−·−·−":".", "·−−":"w", "·−−·":"p", "·−−·−·":"@", "·−−−":"j", "·−−−−":"1", "·−−−−·":"'", "−":"t", "−·":"n", "−··":"d", "−···":"b", "−····":"6", "−····−":"-", "−···−":"=", "−··−":"x", "−··−·":"/", "−·−":"k", "−·−·":"c", "−·−·−·":";", "−·−·−−":"!", "−·−−":"y", "−·−−·":"(", "−·−−·−":")", "−−":"m", "−−·":"g", "−−··":"z", "−−···":"7", "−−··−−":",", "−−·−":"q", "−−−":"o", "−−−··":"8", "−−−···":":", "−−−−·":"9", "−−−−−":"0", "_":"··−−·−"
};
function createSpecialCaseCodecs({onInvalidBinary = () => {}} = {}) {
	function checkForSpecialCase(text, input) {
		if (input.special) return input;
		else if (input.auto) {
			if (/^[0-1]*$/.test(text.replace(/\s/g, ""))) {
				return {id: "binary", name: "Binary"};
			}
			else if (/^[⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿]*$/.test(text.replace(/\s/g, ""))) {
				return {id: "braille", name: "Braille 6-dot"};
			}
			else if (/^[/|·−._-]*$/.test(text.replace(/\s/g, ""))) {
				return {id: "morse", name: "Morse"};
			}
			else if (/^(0x[0-9a-fA-F]{2}\s*)+$/.test(text.replace(/\s/g, ""))) {
				return {id: "hex", name: "Hexadecimal"};
			}
		}
		return null;
	}

	function string2binary(string) {
		let binary = "";
		for (let character of string) binary += parseInt(character.charCodeAt(0).toString(2)).toPrecision(8).split(".").reverse().join("").toString() + " ";
		return binary;
	}

	function string2braille(string) {
		let braille = "";
		for (let character of string) braille += brailleConverter[character.toLowerCase()] ? brailleConverter[character.toLowerCase()] : character;
		return braille;
	}

	function string2morse(string) {
		string = string.replace(/ /g, "%%%%%%%%%%");
		let morse = "";
		for (let character of string) morse += (morseConverter[character.toLowerCase()] ? morseConverter[character.toLowerCase()] : character) + " ";
		morse = morse.split("\n");
		for (let i in morse) morse[i] = morse[i].trim();
		return morse.join("\n").replace(/% % % % % % % % % % /g, "/ ");
	}

	function string2hex(string) {
		let hex = "";
		for (let character of string) {
			hex += "0x" + character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0") + " ";
		}
		return hex.trim();
	}

	function binary2string(binary) {
		let string = "";
		binary = binary.replace(/\n/g, "00001010").replace(/\r/g, "00001101").replace(/\t/g, "00001001").replace(/\s/g, "");
		if (/^[0-1]*$/.test(binary)) {
			let eightDigits = "";
			let counter = 0;
			for (let digit of binary) {
				eightDigits += digit;
				counter++;
				if (counter > 7) {
					string += String.fromCharCode(parseInt(eightDigits, 2).toString(10));
					eightDigits = "";
					counter = 0;
				}
			}
		}
		else onInvalidBinary("Invalid binary format. Only use 0s and 1s.");
		return string;
	}

	function braille2string(braille) {
		let string = "";
		for (let character of braille) string += brailleConverter[character.toLowerCase()] ? brailleConverter[character.toLowerCase()] : character;
		return string;
	}

	function morse2string(morse) {
		let string = "";
		for (let word of morse.replace(/[_-]/g, "−").replace(/\./g, "·").replace(/\r|\t/g, "").split(/\/|\||\n/g)) {
			for (let characterstr of word.trim().split(" ")) string += morseConverter[characterstr] ? morseConverter[characterstr] : characterstr;
			string += " ";
		}
		return string.trim();
	}

	function hex2string(hex) {
		let string = "";
		for (let part of hex.trim().split(/\s+/)) {
			if (part.startsWith("0x") || part.startsWith("0X")) {
				part = part.slice(2);
			}
			if (part.length === 2 && /^[0-9a-fA-F]{2}$/.test(part)) {
				string += String.fromCharCode(parseInt(part, 16));
			}
		}
		return string;
	}

	return Object.freeze({checkForSpecialCase, string2binary, string2braille, string2morse, string2hex, binary2string, braille2string, morse2string, hex2string});
}

module.exports = {createSpecialCaseCodecs};
