// Owns provider transport and credentials. Before this module the engine catalog,
// the authKeys map, every provider adapter and the 429/5xx backoff window all lived
// in the plugin factory closure, so any of the 9000 surrounding lines could reach a
// wire contract. Everything below talks to live third-party services: request shapes,
// headers, prompt text and response parsing are contracts, not implementation
// details. Changing a byte here silently breaks translation for real users.
//
// A client instance is per plugin instance, so a plugin restart drops the backoff
// window and the model catalog cache.

const AI_SKIP_TRANSLATION_TOKEN = "__SKIP_TRANSLATION__";

// Providers occasionally accept a request and then never answer. Without this window
// the queue's watchdog was the only thing that ever moved, minutes later.
const PROVIDER_REQUEST_TIMEOUT_MS = 30000;
// Base pauses for the two pressure signals; a 429 is a harder no than a 5xx.
const PROVIDER_RATE_LIMIT_BACKOFF_MS = 5000;
// The free web endpoint carries q in the URL. This is an encoded-length limit,
// not a JavaScript-character limit: one CJK character expands to nine characters
// under encodeURIComponent, and the request helper may encode the form once more.
const FREE_ENGINE_CHUNK_LIMIT = 1200;

// Lossless split: chunks always concatenate back to the exact input. Paragraph
// boundaries first, sentence boundaries inside an oversized paragraph, hard cuts
// only for a single sentence longer than the limit.
function splitTextIntoTranslationChunks(text, limit = FREE_ENGINE_CHUNK_LIMIT) {
	const value = String(text == null ? "" : text);
	const encodedLength = part => encodeURIComponent(part).length;
	const boundedLimit = Math.max(16, Number(limit) || FREE_ENGINE_CHUNK_LIMIT);
	if (encodedLength(value) <= boundedLimit) return [value];
	const units = [];
	const addHardSplit = part => {
		let hardPart = "";
		let hardLength = 0;
		// Wire-only DTA tokens are indivisible. A hard cut through one recreates the
		// exact missing-placeholder failure this splitter is meant to prevent.
		const symbols = part.match(/__DTA_\d+__|⟦\d+⟧|[\s\S]/gu) || [];
		for (const symbol of symbols) {
			const symbolLength = encodedLength(symbol);
			if (hardPart && hardLength + symbolLength > boundedLimit) {
				units.push(hardPart);
				hardPart = "";
				hardLength = 0;
			}
			hardPart += symbol;
			hardLength += symbolLength;
		}
		if (hardPart) units.push(hardPart);
	};
	for (const paragraphPart of value.split(/(\r?\n+)/)) {
		if (!paragraphPart) continue;
		if (encodedLength(paragraphPart) <= boundedLimit) {
			units.push(paragraphPart);
			continue;
		}
		for (const sentence of paragraphPart.split(/(?<=[.!?。！？；;])/)) {
			if (!sentence) continue;
			if (encodedLength(sentence) <= boundedLimit) units.push(sentence);
			else addHardSplit(sentence);
		}
	}
	const chunks = [];
	let current = "";
	let currentLength = 0;
	for (const unit of units) {
		const unitLength = encodedLength(unit);
		if (current && currentLength + unitLength > boundedLimit) {
			chunks.push(current);
			current = "";
			currentLength = 0;
		}
		current += unit;
		currentLength += unitLength;
	}
	if (current) chunks.push(current);
	return chunks.length ? chunks : [value];
}

function encodeGoogleFreeProtectionTokens(text) {
	return String(text == null ? "" : text).replace(/⟦(\d+)⟧/g, "__DTA_$1__");
}

function decodeGoogleFreeProtectionTokens(text) {
	return String(text == null ? "" : text).replace(/__\s*DTA\s*_\s*(\d+)\s*__/g, "⟦$1⟧");
}
const PROVIDER_SERVER_ERROR_BACKOFF_MS = 2000;
// Consecutive pressure doubles the pause; four doublings of the 429 base already
// exceed the ceiling, so the step cannot usefully grow past that.
const PROVIDER_BACKOFF_MAX_STEP = 4;
const PROVIDER_BACKOFF_MAX_MS = 60000;

const googleLanguages = ["af","am","ar","az","be","bg","bn","bs","ca","ceb","co","cs","cy","da","de","el","en","eo","es","et","eu","fa","fi","fr","fy","ga","gd","gl","gu","ha","haw","hi","hmn","hr","ht","hu","hy","id","ig","is","it","iw","ja","jw","ka","kk","km","kn","ko","ku","ky","la","lb","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","no","ny","or","pa","pl","ps","pt","ro","ru","rw","sd","si","sk","sl","sm","sn","so","sq","sr","st","su","sv","sw","ta","te","tg","th","tk","tl","tr","tt","ug","uk","ur","uz","vi","xh","yi","yo","zh-CN","zh-TW","zu"];

// Deliberately not frozen: iTranslateTranslate scrapes a public API key at runtime and
// caches it back onto the engine entry it was handed.
const translationEngines = {
	googleapi: {
		name: "Google",
		auto: true,
		funcName: "googleApiTranslate",
		languages: googleLanguages
	},
	googlecloud: {
		name: "Google Cloud Translation",
		auto: true,
		funcName: "googleCloudTranslate",
		languages: googleLanguages,
		key: "Paste Google Cloud API key",
		endpoint: "https://translation.googleapis.com/language/translate/v2",
		model: "nmt"
	},
	microsoft: {
		name: "Azure Translator",
		auto: true,
		funcName: "microsoftTranslate",
		languages: ["af","am","ar","az","ba","bg","bn","bs","ca","cs","cy","da","de","el","en","es","et","eu","fa","fi","fil","fr","fr-CA","ga","gl","gu","ha","he","hi","hr","ht","hu","hy","id","ig","is","it","ja","ka","kk","km","kn","ko","ku","ky","lo","lt","lv","mg","mi","mk","ml","mr","ms","mt","my","ne","nl","or","pa","pl","ps","pt","pt-PT","ro","ru","rw","sd","si","sk","sl","sm","sn","so","sq","st","sv","sw","ta","te","th","tk","tr","tt","ug","uk","ur","uz","vi","xh","yo","zh-CN","zh-TW","zu"],
		parser: {
			"zh-CN": "zh-Hans",
			"zh-TW": "zh-Hant"
		},
		key: "Paste Azure Translator key",
		endpoint: "https://api.cognitive.microsofttranslator.com/translate"
	},
	deepl: {
		name: "DeepL",
		auto: true,
		funcName: "deepLTranslate",
		languages: ["bg","cs","da","de","en","el","es","et","fi","fr","hu","id","it","ja","ko","lt","lv","nl","no","pl","pt","ro","ru","sk","sl","sv","tr","uk","zh"],
		premium: true,
		key: "Paste DeepL API key"
	},
	deepseek: {
		name: "DeepSeek",
		auto: true,
		funcName: "deepSeekTranslate",
		languages: googleLanguages,
		key: "Paste DeepSeek API key",
		endpoint: "https://api.deepseek.com/chat/completions",
		// deepseek-chat and deepseek-reasoner were retired; v4-flash is the cheap tier.
		model: "deepseek-v4-flash"
	},
	openai: {
		name: "OpenAI",
		auto: true,
		funcName: "openAiTranslate",
		languages: googleLanguages,
		key: "Paste OpenAI API key",
		endpoint: "https://api.openai.com/v1/responses",
		model: "gpt-5.6-luna"
	},
	gemini: {
		name: "Google Gemini",
		auto: true,
		funcName: "geminiTranslate",
		languages: googleLanguages,
		key: "Paste Gemini API key",
		endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
		model: "gemini-2.5-flash"
	},
	oaicompat: {
		name: "OpenAI Compatible",
		auto: true,
		funcName: "openAiCompatibleTranslate",
		languages: googleLanguages,
		key: "Paste provider API key",
		endpoint: "https://your-provider.example/v1/chat/completions",
		model: "your-model-id"
	},
	itranslate: {
		name: "iTranslate",
		auto: true,
		funcName: "iTranslateTranslate",
		languages: [...new Set(["af","ar","az","be","bg","bn","bs","ca","ceb","cs","cy","da","de","el","en","eo","es","et","eu","fa","fi","fil","fr","ga","gl","gu","ha","he","hi","hmn","hr","ht","hu","hy","id","ig","is","it","ja","jw","ka","kk","km","kn","ko","la","lo","lt","lv","mg","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","no","ny","pa","pl","pt-BR","pt-PT","ro","ru","si","sk","sl","so","sq","sr","st","su","sv","sw","ta","te","tg","th","tr","uk","ur","uz","vi","we","yi","yo","zh-CN","zh-TW","zu"].concat(googleLanguages))].sort(),
		key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
	},
	yandex: {
		name: "Yandex",
		auto: true,
		funcName: "yandexTranslate",
		languages: ["af","am","ar","az","ba","be","bg","bn","bs","ca","ceb","cs","cy","da","de","el","en","eo","es","et","eu","fa","fi","fr","ga","gd","gl","gu","he","hi","hr","ht","hu","hy","id","is","it","ja","jv","ka","kk","km","kn","ko","ky","la","lb","lo","lt","lv","mg","mhr","mi","mk","ml","mn","mr","ms","mt","my","ne","nl","no","pa","pap","pl","pt","ro","ru","si","sk","sl","sq","sr","su","sv","sw","ta","te","tg","th","tl","tr","tt","udm","uk","ur","uz","vi","xh","yi","zh"],
		key: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
	},
	papago: {
		name: "Papago",
		auto: true,
		funcName: "papagoTranslate",
		languages: ["en","es","fr","id","ja","ko","th","vi","zh-CN","zh-TW"],
		key: "xxxxxxxxxxxxxxxxxxxx xxxxxxxxxx"
	},
	baidu: {
		name: "Baidu",
		auto: true,
		funcName: "baiduTranslate",
		languages: ["ar","bg","cs","da","de","el","en","es","et","fi","fr","hu","it","ja","ko","nl","pl","pt","ro","ru","sl","sv","th","vi","zh","zh-CN","zh-TW"],
		parser: {
			"ar": "ara",
			"bg": "bul",
			"da": "dan",
			"es": "spa",
			"et": "est",
			"fi": "fin",
			"fr": "fra",
			"ja": "jp",
			"ko": "kor",
			"ro": "rom",
			"sl": "slo",
			"sv": "swe",
			"vi": "vie",
			"zh": "wyw",
			"zh-CN": "zh",
			"zh-TW": "cht"
		},
		key: "xxxxxxxxxx xxxxxxxxxxxxxxxxxxxx"
	}
};

// Where a user goes to obtain the credential each engine asks for. Provider metadata,
// not plugin chrome: it changes when a provider changes its signup flow.
const enginePortals = {
	googleapi: {
		primaryUrl: "https://translate.google.com/",
		primaryLabelZh: "打开 Google 翻译",
		primaryLabelEn: "Open Google Translate",
		hintZh: "Google 默认模式无需单独购买 API，可直接使用。",
		hintEn: "Google default mode does not require a separate paid API."
	},
	googlecloud: {
		primaryUrl: "https://cloud.google.com/free?hl=zh-cn",
		primaryLabelZh: "注册 / 开通 Google Cloud",
		primaryLabelEn: "Sign up for Google Cloud",
		secondaryUrl: "https://cloud.google.com/translate?hl=zh-cn",
		secondaryLabelZh: "查看文档 / 定价",
		secondaryLabelEn: "Docs / Pricing"
	},
	microsoft: {
		primaryUrl: "https://azure.microsoft.com/zh-cn/free/",
		primaryLabelZh: "注册 / 开通 Azure",
		primaryLabelEn: "Sign up for Azure",
		secondaryUrl: "https://azure.microsoft.com/zh-cn/products/ai-foundry/tools/translator",
		secondaryLabelZh: "查看文档 / 产品页",
		secondaryLabelEn: "Docs / Product"
	},
	deepl: {
		primaryUrl: "https://www.deepl.com/pro-api",
		primaryLabelZh: "注册 / 购买 DeepL API",
		primaryLabelEn: "Get DeepL API",
		secondaryUrl: "https://www.deepl.com/pro-api",
		secondaryLabelZh: "查看定价 / 文档",
		secondaryLabelEn: "Pricing / Docs"
	},
	deepseek: {
		primaryUrl: "https://platform.deepseek.com/api_keys",
		primaryLabelZh: "注册 / 获取 DeepSeek API Key",
		primaryLabelEn: "Get DeepSeek API Key",
		secondaryUrl: "https://api-docs.deepseek.com/zh-cn/",
		secondaryLabelZh: "查看文档 / 模型价格",
		secondaryLabelEn: "Docs / Pricing"
	},
	openai: {
		primaryUrl: "https://platform.openai.com/api-keys",
		primaryLabelZh: "获取 OpenAI API Key",
		primaryLabelEn: "Get OpenAI API Key",
		secondaryUrl: "https://developers.openai.com/api/docs/guides/migrate-to-responses",
		secondaryLabelZh: "查看 Responses API 文档",
		secondaryLabelEn: "Responses API Docs"
	},
	gemini: {
		primaryUrl: "https://aistudio.google.com/app/apikey",
		primaryLabelZh: "获取 Gemini API Key",
		primaryLabelEn: "Get Gemini API Key",
		secondaryUrl: "https://ai.google.dev/gemini-api/docs",
		secondaryLabelZh: "查看 Gemini API 文档",
		secondaryLabelEn: "Gemini API Docs"
	},
	oaicompat: {
		hintZh: "填写你自建或第三方 OpenAI 兼容服务的 API Key、接口地址和模型名。",
		hintEn: "Enter the API key, endpoint, and model for your self-hosted or third-party OpenAI-compatible service."
	},
	itranslate: {
		primaryUrl: "https://developer.itranslate.com/",
		primaryLabelZh: "打开 iTranslate 开发者入口",
		primaryLabelEn: "Open iTranslate Developer Portal"
	},
	yandex: {
		primaryUrl: "https://aistudio.yandex.ru/en/model-gallery#services",
		primaryLabelZh: "打开 Yandex 官方入口",
		primaryLabelEn: "Open Yandex Portal"
	},
	papago: {
		primaryUrl: "https://developers.naver.com/main/",
		primaryLabelZh: "打开 Naver Developers",
		primaryLabelEn: "Open Naver Developers"
	},
	baidu: {
		primaryUrl: "https://fanyi-api.baidu.com/",
		primaryLabelZh: "打开百度翻译开放平台",
		primaryLabelEn: "Open Baidu Translate Open Platform"
	}
};

// Engines whose credentials must be present before the runtime will route to them.
const CREDENTIAL_REQUIRED_ENGINES = ["microsoft", "googlecloud", "deepl", "deepseek", "openai", "gemini", "oaicompat"];
// Engines the settings panel can test with a live sample request.
const VALIDATABLE_ENGINES = ["googlecloud", "microsoft", "deepl", "deepseek", "openai", "gemini", "oaicompat"];
// LLM engines: they need an explicit model id and can list their models.
const AI_MODEL_ENGINES = ["deepseek", "openai", "gemini", "oaicompat"];

// DeepSeek's v4 models think by default, and every thinking token is billed as output
// and waited on before the first character of the answer arrives. Translation gains
// nothing from a chain of thought, so the plugin asks for the non-thinking mode.
// Deepseek-only on purpose: "oaicompat" points at arbitrary OpenAI-compatible servers,
// and some reject a request carrying an unknown top-level field.
// https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
function engineRequestExtras(engineKey) {
	return engineKey === "deepseek" ? {thinking: {type: "disabled"}} : {};
}

// Baidu signs every request with MD5(appid + text + salt + secret); no dependency is
// worth adding for one signature, so the historical implementation moves verbatim.
function MD5(e) {
	function h(a, b) {
		var e = a & 2147483648, f = b & 2147483648, c = a & 1073741824, d = b & 1073741824, g = (a & 1073741823) + (b & 1073741823);
		return c & d ? g ^ 2147483648 ^ e ^ f : c | d ? g & 1073741824 ? g ^ 3221225472 ^ e ^ f : g ^ 1073741824 ^ e ^ f : g ^ e ^ f;
	}
	function k(a, b, c, d, e, f, g) {
		a = h(a, h(h(b & c | ~b & d, e), g));
		return h(a << f | a >>> 32 - f, b);
	}
	function l(a, b, c, d, e, f, g) {
		a = h(a, h(h(b & d | c & ~d, e), g));
		return h(a << f | a >>> 32 - f, b);
	}
	function m(a, b, d, c, e, f, g) {
		a = h(a, h(h(b ^ d ^ c, e), g));
		return h(a << f | a >>> 32 - f, b);
	}
	function n(a, b, d, c, e, f, g) {
		a = h(a, h(h(d ^ (b | ~c), e), g));
		return h(a << f | a >>> 32 - f, b);
	}
	function p(a) {
		var b = "", d = "", c;
		for (c = 0; 3 >= c; c++) d = a >>> 8 * c & 255, d = "0" + d.toString(16), b += d.substr(d.length - 2, 2);
		return b;
	}

	var f = [], q, r, s, t, a, b, c, d;
	e = function(a) {
		a = a.replace(/\r\n/g, "\n");
		for (var b = "", d = 0; d < a.length; d++) {
			var c = a.charCodeAt(d);
			128 > c ? b += String.fromCharCode(c) : (127 < c && 2048 > c ? b += String.fromCharCode(c >> 6 | 192) : (b += String.fromCharCode(c >> 12 | 224), b += String.fromCharCode(c >> 6 & 63 | 128)), b += String.fromCharCode(c & 63 | 128));
		}
		return b;
	}(e);
	f = function(b) {
		var a, c = b.length;
		a = c + 8;
		for (var d = 16 * ((a - a % 64) / 64 + 1), e = Array(d - 1), f = 0, g = 0; g < c;) a = (g - g % 4) / 4, f = g % 4 * 8, e[a] |= b.charCodeAt(g) << f, g++;
		a = (g - g % 4) / 4;
		e[a] |= 128 << g % 4 * 8;
		e[d - 2] = c << 3;
		e[d - 1] = c >>> 29;
		return e;
	}(e);
	a = 1732584193, b = 4023233417, c = 2562383102, d = 271733878;
	for (e = 0; e < f.length; e += 16) q = a, r = b, s = c, t = d, a = k(a, b, c, d, f[e + 0], 7, 3614090360), d = k(d, a, b, c, f[e + 1], 12, 3905402710), c = k(c, d, a, b, f[e + 2], 17, 606105819), b = k(b, c, d, a, f[e + 3], 22, 3250441966), a = k(a, b, c, d, f[e + 4], 7, 4118548399), d = k(d, a, b, c, f[e + 5], 12, 1200080426), c = k(c, d, a, b, f[e + 6], 17, 2821735955), b = k(b, c, d, a, f[e + 7], 22, 4249261313), a = k(a, b, c, d, f[e + 8], 7, 1770035416), d = k(d, a, b, c, f[e + 9], 12, 2336552879), c = k(c, d, a, b, f[e + 10], 17, 4294925233), b = k(b, c, d, a, f[e + 11], 22, 2304563134), a = k(a, b, c, d, f[e + 12], 7, 1804603682), d = k(d, a, b, c, f[e + 13], 12, 4254626195), c = k(c, d, a, b, f[e + 14], 17, 2792965006), b = k(b, c, d, a, f[e + 15], 22, 1236535329), a = l(a, b, c, d, f[e + 1], 5, 4129170786), d = l(d, a, b, c, f[e + 6], 9, 3225465664), c = l(c, d, a, b, f[e + 11], 14, 643717713), b = l(b, c, d, a, f[e + 0], 20, 3921069994), a = l(a, b, c, d, f[e + 5], 5, 3593408605), d = l(d, a, b, c, f[e + 10], 9, 38016083), c = l(c, d, a, b, f[e + 15], 14, 3634488961), b = l(b, c, d, a, f[e + 4], 20, 3889429448), a = l(a, b, c, d, f[e + 9], 5, 568446438), d = l(d, a, b, c, f[e + 14], 9, 3275163606), c = l(c, d, a, b, f[e + 3], 14, 4107603335), b = l(b, c, d, a, f[e + 8], 20, 1163531501), a = l(a, b, c, d, f[e + 13], 5, 2850285829), d = l(d, a, b, c, f[e + 2], 9, 4243563512), c = l(c, d, a, b, f[e + 7], 14, 1735328473), b = l(b, c, d, a, f[e + 12], 20, 2368359562), a = m(a, b, c, d, f[e + 5], 4, 4294588738), d = m(d, a, b, c, f[e + 8], 11, 2272392833), c = m(c, d, a, b, f[e + 11], 16, 1839030562), b = m(b, c, d, a, f[e + 14], 23, 4259657740), a = m(a, b, c, d, f[e + 1], 4, 2763975236), d = m(d, a, b, c, f[e + 4], 11, 1272893353), c = m(c, d, a, b, f[e + 7], 16, 4139469664), b = m(b, c, d, a, f[e + 10], 23, 3200236656), a = m(a, b, c, d, f[e + 13], 4, 681279174), d = m(d, a, b, c, f[e + 0], 11, 3936430074), c = m(c, d, a, b, f[e + 3], 16, 3572445317), b = m(b, c, d, a, f[e + 6], 23, 76029189), a = m(a, b, c, d, f[e + 9], 4, 3654602809), d = m(d, a, b, c, f[e + 12], 11, 3873151461), c = m(c, d, a, b, f[e + 15], 16, 530742520), b = m(b, c, d, a, f[e + 2], 23, 3299628645), a = n(a, b, c, d, f[e + 0], 6, 4096336452), d = n(d, a, b, c, f[e + 7], 10, 1126891415), c = n(c, d, a, b, f[e + 14], 15, 2878612391), b = n(b, c, d, a, f[e + 5], 21, 4237533241), a = n(a, b, c, d, f[e + 12], 6, 1700485571), d = n(d, a, b, c, f[e + 3], 10, 2399980690), c = n(c, d, a, b, f[e + 10], 15, 4293915773), b = n(b, c, d, a, f[e + 1], 21, 2240044497), a = n(a, b, c, d, f[e + 8], 6, 1873313359), d = n(d, a, b, c, f[e + 15], 10, 4264355552), c = n(c, d, a, b, f[e + 6], 15, 2734768916), b = n(b, c, d, a, f[e + 13], 21, 1309151649), a = n(a, b, c, d, f[e + 4], 6, 4149444226), d = n(d, a, b, c, f[e + 11], 10, 3174756917), c = n(c, d, a, b, f[e + 2], 15, 718787259), b = n(b, c, d, a, f[e + 9], 21, 3951481745), a = h(a, q), b = h(b, r), c = h(c, s), d = h(d, t);
	return (p(a) + p(b) + p(c) + p(d)).toLowerCase();
}

function isValidatableEngine(engineKey) {
	return VALIDATABLE_ENGINES.includes(engineKey);
}

function supportsModelCatalog(engineKey) {
	return AI_MODEL_ENGINES.includes(engineKey);
}

// Users paste whatever their provider's docs show them: a bare host, a `/v1` root, a
// full chat URL, sometimes with a trailing slash or a stray query. Each provider is
// coerced to the one path its adapter actually posts to.
function normalizeApiEndpoint(engineKey, endpoint) {
	let normalized = (endpoint || "").trim() || translationEngines[engineKey] && translationEngines[engineKey].endpoint || "";
	if (!normalized) return "";
	normalized = normalized.replace(/\s+/g, "").replace(/\/+$/, "");

	if (engineKey == "deepseek") {
		if (/\/v1$/i.test(normalized)) normalized = normalized.slice(0, -3);
		if (/\/v1\/chat\/completions$/i.test(normalized)) return normalized.replace(/\/v1\/chat\/completions$/i, "/chat/completions");
		if (/\/chat\/completions$/i.test(normalized)) return normalized;
		return `${normalized}/chat/completions`;
	}
	if (engineKey == "oaicompat") {
		if (/\/chat\/completions$/i.test(normalized)) return normalized;
		if (/\/v1$/i.test(normalized)) return `${normalized}/chat/completions`;
		if (/^https?:\/\/[^/]+$/i.test(normalized)) return `${normalized}/v1/chat/completions`;
		return normalized;
	}
	if (engineKey == "openai") {
		if (/\/responses$/i.test(normalized)) return normalized;
		if (/\/v1$/i.test(normalized)) return `${normalized}/responses`;
		if (/^https?:\/\/[^/]+$/i.test(normalized)) return `${normalized}/v1/responses`;
		return normalized;
	}
	if (engineKey == "gemini") {
		return normalized.replace(/\/[^/]+:generateContent$/i, "").replace(/\/models\/[^/]+$/i, "/models");
	}
	if (engineKey == "microsoft") {
		normalized = normalized.replace(/\?.*$/, "");
		if (/\/translate$/i.test(normalized)) return normalized;
		return `${normalized}/translate`;
	}
	return normalized;
}

function getModelCatalogEndpoint(engineKey, endpoint) {
	const normalized = normalizeApiEndpoint(engineKey, endpoint);
	if (!normalized) return "";
	if (engineKey == "openai" && /\/responses$/i.test(normalized)) return normalized.replace(/\/responses$/i, "/models");
	if (engineKey == "gemini") return normalized;
	if (/\/chat\/completions$/i.test(normalized)) return normalized.replace(/\/chat\/completions$/i, "/models");
	return `${normalized.replace(/\/+$/, "")}/models`;
}

function mapLanguageCodeForEngine(engineKey, languageId) {
	if (!languageId) return languageId;
	if (engineKey == "deepl") {
		if (languageId == "zh-CN" || languageId == "zh") return "ZH";
		if (languageId == "zh-TW") return "ZH-HANT";
		return languageId.toUpperCase();
	}
	return translationEngines[engineKey] && translationEngines[engineKey].parser && translationEngines[engineKey].parser[languageId] || languageId;
}

function getValidationRequestForEngine(_engineKey) {
	const request = {
		source: "en",
		target: "de",
		text: "Good morning"
	};
	return request;
}

// Providers disagree on where the human-readable reason lives; the panel shows
// whichever field this finds, and the raw prefix when the body is not even JSON.
function getValidationErrorDetails(body) {
	if (!body) return "";
	try {
		body = typeof body == "string" ? JSON.parse(body) : body;
	}
	catch (err) {
		return typeof body == "string" ? body.slice(0, 160) : "";
	}
	return body && body.error && (body.error.message || body.error.code) || body.message || body.error_msg || body.msg || "";
}

// The leading tabs inside these template literals are part of the prompt the provider
// receives. They came from the class-body indentation this code used to sit at, so
// they are pinned here by hand rather than by the surrounding indentation.
function buildAiProviderTranslationPrompt(data) {
	const decisionInstruction = data.autoDecision ? `
				Auto-translate decision rules:
				${data.decisionPrompt || ""}
				If the message should not be translated, return exactly ${AI_SKIP_TRANSLATION_TOKEN}.
				` : "";
	const targetLanguageName = data.output.name || data.output.id;
	const translationModeInstruction = data.autoDecision ? `
				Auto-translate mode: translate only natural-language content that is not already in ${targetLanguageName}; already-target-language content may stay unchanged according to the decision rules.
				` : `
				Manual translation mode: translate the entire natural-language message into ${targetLanguageName}. Do not keep non-target natural-language text as-is. Preserve only URLs, code, mentions, emoji, IDs, and protected placeholders.
				`;
	return {
		system: data.autoDecision ? "You are a senior bilingual localization specialist and Discord chat translation decision assistant" : "You are a senior bilingual localization specialist",
		prompt: `
				You are a professional localization expert. The target language is exactly ${targetLanguageName}. Do not infer the target language from the source text or from existing bilingual/spoiler content.
				${translationModeInstruction}
				Rules:
				1. Return ONLY the translation without any explanations
				2. Output language must be exactly ${targetLanguageName}; do not output any other language except preserved protected content
				3. Use natural, fluent language
				4. Maintain consistent terminology for technical/game terms
				5. Keep proper nouns/product/game/model names as-is by default; use official/common names in ${targetLanguageName} when clearly established
				6. Preserve the original tone and style
				7. Do not omit any source content, including short interjections, laughter, particles, repeated words, or standalone short lines; translate or preserve them naturally in the target language.
				8. Use concise sentence structures
				9. Convert [NEWLINE] markers to actual line breaks (don't show them literally)
				10. Preserve placeholders like ⟦0⟧, ⟦1⟧ exactly; they are protected mentions/links/emoji/code.
				${decisionInstruction}
				Text to translate:
				${data.text.replace(/\n/g, " [NEWLINE] ").replace(/\s+/g, " ")}
				`
	};
}

// Responses API, chat completions and the odd proxy that only sets output_text all
// answer here; the first shape that yields text wins.
function parseOpenAiResponseText(body) {
	try {body = typeof body == "string" ? JSON.parse(body) : body;}
	catch (error) {return "";}
	if (body && typeof body.output_text == "string") return body.output_text.trim();
	const outputParts = [];
	for (const item of body && body.output || []) for (const content of item && item.content || []) if (content && typeof content.text == "string") outputParts.push(content.text);
	if (outputParts.length) return outputParts.join("").trim();
	return body && body.choices && body.choices[0] && body.choices[0].message && typeof body.choices[0].message.content == "string" ? body.choices[0].message.content.trim() : "";
}

function parseGeminiResponseText(body) {
	try {body = typeof body == "string" ? JSON.parse(body) : body;}
	catch (error) {return "";}
	return ((body && body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) || [])
		.map(part => part && typeof part.text == "string" ? part.text : "")
		.join("")
		.trim();
}

// Models wrap the array in prose or a fence no matter how the prompt is worded, so the
// array is cut out before parsing. An id the batch never asked for, or one answered
// twice, is dropped rather than guessed at: a wrong translation would be pasted onto
// somebody else's message.
function parseAiBatchTranslationResponse(content, expectedIds = null) {
	content = (content || "").trim();
	if (!content) return null;
	content = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
	const firstArray = content.indexOf("[");
	const lastArray = content.lastIndexOf("]");
	if (firstArray > -1 && lastArray > firstArray) content = content.slice(firstArray, lastArray + 1);
	try {
		let parsed = JSON.parse(content);
		if (parsed && Array.isArray(parsed.translations)) parsed = parsed.translations;
		if (!Array.isArray(parsed)) return null;
		const expectedIdSet = expectedIds ? new Set(Array.from(expectedIds, id => String(id))) : null;
		const duplicateIds = new Set();
		return parsed.reduce((dict, item) => {
			if (!item || item.id == null) return dict;
			const id = String(item.id);
			if (expectedIdSet && !expectedIdSet.has(id)) return dict;
			if (duplicateIds.has(id) || Object.prototype.hasOwnProperty.call(dict, id)) {
				duplicateIds.add(id);
				delete dict[id];
				return dict;
			}
			const value = item.translation != null ? item.translation : item.text;
			dict[id] = value == null ? "" : String(value);
			return dict;
		}, {});
	}
	catch (err) {return null;}
}

function createProviderClient({
	// The HTTP function, shaped like BDFDB.LibraryRequires.request:
	// (url, options, (error, response, body) => void).
	request = (_url, _options, callback) => callback(new Error("no request function"), null, ""),
	// Plugin-scoped timers (BDFDB.TimeUtils.timeout/clear) so a plugin stop cancels an
	// in-flight request window.
	setTimeout = (callback, delay) => globalThis.setTimeout(callback, delay),
	clearTimeout = timer => globalThis.clearTimeout(timer),
	// Deliberately NOT the plugin-scoped timer: a backoff wait that a plugin stop
	// cancelled would leave its awaiting promise pending forever.
	sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms)),
	now = Date.now,
	getAuthKeys = () => ({}),
	saveAuthKeys = () => {},
	// The plugin's language table, used to name the source language a provider detected.
	getLanguages = () => ({}),
	notify = () => null,
	getLabels = () => ({}),
	getCustomText = () => "",
	getEngineLabel = engineKey => translationEngines[engineKey] && translationEngines[engineKey].name || engineKey,
	shouldUseAiAutoTranslateDecision = () => false,
	getAiAutoTranslatePrompt = () => "",
	// BDFDB.DOMUtils.create: Yandex answers XML, not JSON.
	createElementFromHtml = () => null,
	generateId = () => String(Date.now()),
	// The settings panel must know an endpoint was rewritten under it.
	onEndpointNormalized = () => {},
	// Opening a backoff window is also the queue's cue to re-arm its retry.
	onBackoffScheduled = () => {}
} = {}) {
	let backoffUntil = 0;
	let backoffStep = 0;
	let modelCatalogState = {};

	function toast(message, options) {
		return notify(message, options);
	}

	// A chunked batch hitting a dead provider fails every chunk with the same error;
	// the user needs the message once, not once per chunk (2026-08-19: three
	// identical quota popups). Only exact repeats inside the window stay silent.
	const DANGER_TOAST_DEDUP_MS = 10000;
	let lastDangerToast = {message: "", at: 0};

	function dangerToast(message) {
		const timestamp = now();
		if (message === lastDangerToast.message && timestamp - lastDangerToast.at < DANGER_TOAST_DEDUP_MS) return null;
		lastDangerToast = {message, at: timestamp};
		return toast(message, {type: "danger", position: "center"});
	}

	// Escalates while a window is already open (consecutive provider pressure) and
	// starts over once a window has fully expired. There is no success signal: a good
	// response does not shorten an open window, it just stops extending it.
	function scheduleBackoff(ms) {
		if (!ms) return;
		const timestamp = now();
		if (backoffUntil > timestamp) backoffStep = Math.min(backoffStep + 1, PROVIDER_BACKOFF_MAX_STEP);
		else backoffStep = 0;
		const scaledMs = Math.min(ms * Math.pow(2, backoffStep), PROVIDER_BACKOFF_MAX_MS);
		backoffUntil = Math.max(backoffUntil || 0, timestamp + scaledMs);
		onBackoffScheduled();
	}

	function awaitBackoff() {
		const waitMs = (backoffUntil || 0) - now();
		if (waitMs <= 0) return Promise.resolve();
		return sleep(waitMs);
	}

	// Wraps the HTTP function with a hard timeout and centralized 429/5xx backoff. On
	// timeout it synthesizes a 504 response (no error) so existing statusCode-based
	// handlers keep working, and guards against double callbacks.
	function requestWithTimeout(url, options, callback, timeoutMs = PROVIDER_REQUEST_TIMEOUT_MS) {
		let done = false;
		let timer = null;
		const finish = (error, response, body) => {
			if (done) return;
			done = true;
			if (timer) clearTimeout(timer);
			const statusCode = response && response.statusCode;
			if (statusCode == 429) scheduleBackoff(PROVIDER_RATE_LIMIT_BACKOFF_MS);
			else if (statusCode && statusCode >= 500) scheduleBackoff(PROVIDER_SERVER_ERROR_BACKOFF_MS);
			callback(error, response, body);
		};
		timer = setTimeout(_ => finish(null, {statusCode: 504}, ""), timeoutMs);
		try {request(url, options, finish);}
		catch (err) {finish(err, null, "");}
		return timer;
	}

	function getAuth(engineKey) {
		const authKeys = getAuthKeys() || {};
		return authKeys[engineKey] || {};
	}

	function storeAuth(engineKey, auth) {
		const authKeys = getAuthKeys() || {};
		authKeys[engineKey] = auth;
		saveAuthKeys(authKeys);
	}

	function isEngineConfiguredForRuntime(engineKey) {
		if (!translationEngines[engineKey]) return false;
		if (!CREDENTIAL_REQUIRED_ENGINES.includes(engineKey)) return true;
		const auth = getAuth(engineKey);
		if (!(auth.key || "").trim()) return false;
		if (engineKey != "oaicompat") return true;
		// The shipped oaicompat endpoint and model are placeholders, so leaving them
		// untouched means the engine was never actually configured.
		const endpoint = (auth.endpoint || "").trim();
		const model = (auth.model || "").trim();
		return !!endpoint && !!model && endpoint != translationEngines.oaicompat.endpoint && model != translationEngines.oaicompat.model;
	}

	function fetchModelCatalog(engineKey, onUpdate = null) {
		return new Promise(resolve => {
			if (!supportsModelCatalog(engineKey)) return resolve({ok: false, items: []});

			const updateState = patch => {
				modelCatalogState[engineKey] = Object.assign({}, modelCatalogState[engineKey], patch);
				if (typeof onUpdate == "function") onUpdate();
			};

			const engineLabel = getEngineLabel(engineKey);
			const auth = getAuth(engineKey);
			const apiKey = (auth.key || "").trim();
			if (!apiKey) {
				dangerToast(`${engineLabel}: ${getCustomText("validate_missing_key")}`);
				return resolve({ok: false, items: []});
			}
			if (engineKey == "oaicompat" && (!(auth.endpoint || "").trim() || (auth.endpoint || "").trim() == translationEngines.oaicompat.endpoint)) {
				dangerToast(`${engineLabel}: ${getCustomText("validate_missing_endpoint")}`);
				return resolve({ok: false, items: []});
			}

			const normalizedEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey] && translationEngines[engineKey].endpoint || "");
			if (!normalizedEndpoint) {
				dangerToast(`${engineLabel}: ${getCustomText("validate_missing_endpoint")}`);
				return resolve({ok: false, items: []});
			}

			if (auth.endpoint && normalizedEndpoint != auth.endpoint) {
				auth.endpoint = normalizedEndpoint;
				storeAuth(engineKey, auth);
				onEndpointNormalized();
			}

			const modelCatalogEndpoint = getModelCatalogEndpoint(engineKey, normalizedEndpoint);
			const requestUrl = engineKey == "gemini" ? `${modelCatalogEndpoint}?key=${encodeURIComponent(apiKey)}` : modelCatalogEndpoint;
			updateState({loading: true, items: [], endpoint: requestUrl});

			const requestHeaders = {"Content-Type": "application/json"};
			if (engineKey != "gemini") requestHeaders.Authorization = `Bearer ${apiKey}`;
			request(requestUrl, {
				method: "get",
				headers: requestHeaders
			}, (error, response, body) => {
				if (!error && body && response && response && response.statusCode == 200) {
					try {
						body = JSON.parse(body);
						const rawItems = engineKey == "gemini" ? ((body && body.models) || []).filter(item => !item || !Array.isArray(item.supportedGenerationMethods) || item.supportedGenerationMethods.includes("generateContent")) : ((body && body.data) || []);
						const items = rawItems
							.map(item => typeof item == "string" ? item : engineKey == "gemini" ? item && item.name && item.name.replace(/^models\//, "") : item && item.id)
							.filter(item => typeof item == "string" && item.trim())
							.sort((modelA, modelB) => modelA.localeCompare(modelB));
						updateState({
							loading: false,
							items,
							endpoint: requestUrl,
							fetchedAt: now()
						});
						toast(
							items.length
								? `${engineLabel}: ${getCustomText("model_catalog_loaded").replace("{count}", items.length)}`
								: `${engineLabel}: ${getCustomText("model_catalog_empty")}`,
							{
								type: items.length ? "success" : "warning",
								position: "center"
							}
						);
						return resolve({ok: true, items});
					}
					catch (err) {}
				}

				updateState({loading: false, items: []});
				const details = getValidationErrorDetails(body);
				dangerToast(`${engineLabel}: ${getCustomText("validate_failed")}${response && response.statusCode ? ` (${response.statusCode})` : ""}${details ? ` - ${details}` : ""}`);
				return resolve({ok: false, items: []});
			});
		});
	}

	// Sends one real sample translation so the user finds out here, not on their next
	// message, that a key or endpoint is wrong.
	function validateEngineConfig(engineKey) {
		return new Promise(resolve => {
			if (!isValidatableEngine(engineKey)) return resolve({ok: false, normalized: false});

			const engineLabel = getEngineLabel(engineKey);
			let runningToast = null;
			const finish = (ok, message, normalized = false) => {
				if (runningToast) runningToast.close();
				toast(message, {
					type: ok ? "success" : "danger",
					position: "center"
				});
				resolve({ok, normalized});
			};
			const auth = getAuth(engineKey);
			const apiKey = (auth.key || "").trim();
			if (!apiKey) return finish(false, `${engineLabel}: ${getCustomText("validate_missing_key")}`);
			if (engineKey == "oaicompat" && (!(auth.endpoint || "").trim() || (auth.endpoint || "").trim() == translationEngines.oaicompat.endpoint)) return finish(false, `${engineLabel}: ${getCustomText("validate_missing_endpoint")}`);
			if (engineKey == "oaicompat" && (!(auth.model || "").trim() || (auth.model || "").trim() == translationEngines.oaicompat.model)) return finish(false, `${engineLabel}: ${getCustomText("validate_missing_model")}`);

			let normalized = false;
			let apiEndpoint = "";
			if (translationEngines[engineKey] && translationEngines[engineKey].endpoint) {
				apiEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey].endpoint);
				if (auth.endpoint && apiEndpoint != auth.endpoint) {
					auth.endpoint = apiEndpoint;
					storeAuth(engineKey, auth);
					onEndpointNormalized();
					normalized = true;
				}
				if (!apiEndpoint) return finish(false, `${engineLabel}: ${getCustomText("validate_missing_endpoint")}`, normalized);
			}

			const modelId = (auth.model || translationEngines[engineKey] && translationEngines[engineKey].model || "").trim();
			if (AI_MODEL_ENGINES.includes(engineKey) && !modelId) return finish(false, `${engineLabel}: ${getCustomText("validate_missing_model")}`, normalized);

			const sample = getValidationRequestForEngine(engineKey);
			runningToast = toast(`${getCustomText("validate_running")} ${engineLabel}...`, {
				timeout: 0,
				ellipsis: true,
				position: "center"
			});
			const successMessage = translatedText => {
				const suffix = normalized ? ` ${getCustomText("validate_saved_endpoint")}` : "";
				const preview = translatedText ? ` (${translatedText.slice(0, 48)})` : "";
				return `${engineLabel}: ${getCustomText("validate_success")}.${suffix}${preview}`;
			};
			const failMessage = (statusCode, body) => {
				const details = getValidationErrorDetails(body);
				return `${engineLabel}: ${getCustomText("validate_failed")}${statusCode ? ` (${statusCode})` : ""}${details ? ` - ${details}` : ""}`;
			};

			switch (engineKey) {
				case "googlecloud": {
					const model = (auth.model || "").trim();
					const form = {
						key: apiKey,
						q: sample.text,
						source: sample.source,
						target: sample.target,
						format: "text"
					};
					if (model) form.model = model;
					return request(apiEndpoint, {
						method: "post",
						form
					}, (error, response, body) => {
						if (!error && body && response && response && response.statusCode == 200) {
							try {
								body = JSON.parse(body);
								const translation = body && body.data && body.data.translations && body.data.translations[0] && body.data.translations[0].translatedText;
								return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
							}
							catch (err) {}
						}
						return finish(false, failMessage(response && response.statusCode, body), normalized);
					});
				}
				case "microsoft": {
					const headers = {
						"Content-Type": "application/json",
						"Ocp-Apim-Subscription-Key": apiKey
					};
					const region = (auth.region || "").trim();
					if (region && region != "global") headers["Ocp-Apim-Subscription-Region"] = region;
					return request(apiEndpoint, {
						method: "post",
						headers,
						body: JSON.stringify([{Text: sample.text}]),
						form: {
							"api-version": "3.0",
							"from": mapLanguageCodeForEngine("microsoft", sample.source),
							"to": mapLanguageCodeForEngine("microsoft", sample.target)
						}
					}, (error, response, body) => {
						if (!error && body && response && response && response.statusCode == 200) {
							try {
								body = JSON.parse(body);
								const translation = body && body[0] && body[0].translations && body[0].translations[0] && body[0].translations[0].text;
								return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
							}
							catch (err) {}
						}
						return finish(false, failMessage(response && response.statusCode, body), normalized);
					});
				}
				case "deepl": {
					const translateEndpoint = auth.paid ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
					return request(translateEndpoint, {
						method: "post",
						headers: {
							"Content-Type": "application/json",
							"Authorization": `DeepL-Auth-Key ${apiKey}`
						},
						body: JSON.stringify({
							text: [sample.text],
							source_lang: mapLanguageCodeForEngine("deepl", sample.source),
							target_lang: mapLanguageCodeForEngine("deepl", sample.target)
						})
					}, (error, response, body) => {
						if (!error && body && response && response && response.statusCode == 200) {
							try {
								body = JSON.parse(body);
								const translation = body && body.translations && body.translations[0] && body.translations[0].text;
								return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
							}
							catch (err) {}
						}
						return finish(false, failMessage(response && response.statusCode, body), normalized);
					});
				}
				case "openai": {
					return request(apiEndpoint, {
						method: "post",
						headers: {"Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`},
						body: JSON.stringify({
							model: modelId,
							instructions: "You are a translation validator. Return only the translation.",
							input: `Translate the following text from English to German.\n\n${sample.text}`,
							store: false
						})
					}, (error, response, body) => {
						const translation = !error && response && response && response.statusCode == 200 ? parseOpenAiResponseText(body) : "";
						return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
					});
				}
				case "gemini": {
					const geminiModelId = modelId.replace(/^models\//, "");
					const requestUrl = `${apiEndpoint}/${encodeURIComponent(geminiModelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
					return request(requestUrl, {
						method: "post",
						headers: {"Content-Type": "application/json"},
						body: JSON.stringify({
							system_instruction: {parts: [{text: "You are a translation validator. Return only the translation."}]},
							contents: [{role: "user", parts: [{text: `Translate the following text from English to German.\n\n${sample.text}`}]}]
						})
					}, (error, response, body) => {
						const translation = !error && response && response && response.statusCode == 200 ? parseGeminiResponseText(body) : "";
						return finish(!!translation, translation ? successMessage(translation) : failMessage(response && response.statusCode, body), normalized);
					});
				}
				case "deepseek":
				case "oaicompat": {
					return request(apiEndpoint, {
						method: "post",
						headers: {
							"Content-Type": "application/json",
							"Authorization": `Bearer ${apiKey}`
						},
						body: JSON.stringify({
							model: modelId,
							messages: [{
								role: "system",
								content: "You are a translation validator."
							}, {
								role: "user",
								content: `Translate the following text from English to German. Return only the translation.\n\n${sample.text}`
							}],
							temperature: 0,
							// Room for a reasoning model to think and still answer. At 32 the
							// whole budget went to reasoning_content, content came back empty,
							// and a perfectly good configuration reported validate_failed.
							max_tokens: 512,
							...engineRequestExtras(engineKey)
						})
					}, (error, response, body) => {
						if (!error && body && response && response && response.statusCode == 200) {
							try {
								body = JSON.parse(body);
								const choice = body && body.choices && body.choices[0];
								const message = choice && choice.message;
								const translation = message && message.content;
								if (translation && translation.trim()) return finish(true, successMessage(translation.trim()), normalized);
								// What this button is asked to prove is that the provider accepts
								// this key, endpoint and model. A model that reasoned and then ran
								// out of room has proven exactly that, empty content or not.
								const answeredWithoutContent = !!(message && message.reasoning_content) || !!(choice && choice.finish_reason == "length");
								return finish(answeredWithoutContent, answeredWithoutContent ? successMessage("") : failMessage(response && response.statusCode, body), normalized);
							}
							catch (err) {}
						}
						return finish(false, failMessage(response && response.statusCode, body), normalized);
					});
				}
			}
			return finish(false, `${engineLabel}: ${getCustomText("validate_failed")}`, normalized);
		});
	}

	// Each adapter writes the language a provider reports back onto data.input, because
	// the caller renders "translated from X" from that same object.
	// The free endpoint takes the text in the request URL, so a long message used to
	// fail as one oversized request (field 2026-08-19: long messages never translated
	// on the free engine). The text now travels in bounded chunks; any chunk failing
	// fails the whole translation so a partial paint can never look complete.
	function googleApiTranslate(data, callback) {
		// Google sometimes drops the compact corner-bracket placeholder entirely
		// (field reproduction: ⟦4⟧ disappeared from an otherwise valid 200 reply).
		// A wire-only ASCII sentinel survives the same request and is reversed before
		// the shared strict placeholder guard sees the translation.
		const chunks = splitTextIntoTranslationChunks(encodeGoogleFreeProtectionTokens(data.text), FREE_ENGINE_CHUNK_LIMIT);
		const translatedParts = [];
		const requestChunk = index => {
			if (index >= chunks.length) return callback(decodeGoogleFreeProtectionTokens(translatedParts.join("")));
			request("https://translate.googleapis.com/translate_a/single", {
				form: {
					"client": "gtx",
					"dt": "t",
					"dj": "1",
					"source": "input",
					"sl": data.input.id,
					"tl": data.output.id,
					"q": encodeURIComponent(chunks[index])
				}
			}, (error, response, body) => {
				const labels = getLabels();
				const languages = getLanguages();
				if (!error && body && response && response && response.statusCode == 200) {
					try {
						body = JSON.parse(body);
						// The detected language comes from the first chunk only; later
						// chunks of the same message cannot disagree meaningfully.
						if (index === 0 && !data.specialCase && body.src && body.src && languages[body.src]) {
							data.input.id = body.src;
							data.input.name = languages[body.src].name;
							data.input.ownlang = languages[body.src].ownlang;
						}
						const translated = body.sentences.map(n => n && n.trans).filter(n => n).join("");
						if (!translated) return callback("");
						translatedParts.push(translated);
						requestChunk(index + 1);
					}
					catch (err) {callback("");}
				}
				else {
					if (response && response && response.statusCode == 429) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_hourlylimit}`);
					else dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`);
					callback("");
				}
			});
		};
		requestChunk(0);
	}

	function googleCloudTranslate(data, callback) {
		const auth = getAuth("googlecloud");
		const apiKey = auth.key || "";
		const apiEndpoint = auth.endpoint || translationEngines.googlecloud.endpoint;
		const modelId = auth.model || translationEngines.googlecloud.model;

		request(apiEndpoint, {
			method: "post",
			form: Object.assign({
				"key": apiKey,
				"q": data.text,
				"target": data.output.id,
				"format": "text",
				"model": modelId
			}, data.input.auto ? {} : {"source": data.input.id})
		}, (error, response, body) => {
			const labels = getLabels();
			const languages = getLanguages();
			if (!error && body && response && response && response.statusCode == 200) {
				try {
					body = JSON.parse(body);
					const translations = body && body.data && body.data.translations || [];
					if (!data.specialCase && translations[0] && translations[0].detectedSourceLanguage && languages[translations[0].detectedSourceLanguage]) {
						data.input.id = translations[0].detectedSourceLanguage;
						data.input.name = languages[translations[0].detectedSourceLanguage].name;
						data.input.ownlang = languages[translations[0].detectedSourceLanguage].ownlang;
					}
					callback(translations.map(n => n && n.translatedText).filter(n => n).join(""));
				}
				catch (err) {callback("");}
			}
			else {
				if (response && (response.statusCode == 401 || response && response && response.statusCode == 403)) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`);
				else if (response && response && response.statusCode == 429) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_hourlylimit}`);
				else dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`);
				callback("");
			}
		});
	}

	function microsoftTranslate(data, callback) {
		const auth = getAuth("microsoft");
		const apiEndpoint = normalizeApiEndpoint("microsoft", auth.endpoint || translationEngines.microsoft.endpoint);
		const apiKey = auth.key || "";
		const region = auth.region || "";
		const headers = {
			"Content-Type": "application/json",
			"Ocp-Apim-Subscription-Key": apiKey
		};
		if (region && region != "global") headers["Ocp-Apim-Subscription-Region"] = region;
		request(apiEndpoint, {
			method: "post",
			headers,
			body: JSON.stringify([{"Text": data.text}]),
			form: Object.assign({
				"api-version": "3.0",
				"to": mapLanguageCodeForEngine("microsoft", data.output.id)
			}, data.input.auto ? {} : {"from": mapLanguageCodeForEngine("microsoft", data.input.id)})
		}, (error, response, body) => {
			const labels = getLabels();
			const languages = getLanguages();
			if (!error && body && response && response && response.statusCode == 200) {
				try {
					body = JSON.parse(body)[0];
					if (!data.specialCase && body.detectedLanguage && body.detectedLanguage.language && languages[body.detectedLanguage.language.toLowerCase()]) {
						data.input.name = languages[body.detectedLanguage.language.toLowerCase()].name;
						data.input.ownlang = languages[body.detectedLanguage.language.toLowerCase()].ownlang;
					}
					callback(body.translations.map(n => n && n.text).filter(n => n).join(""));
				}
				catch (err) {callback("");}
			}
			else {
				if (response && response && response.statusCode == 403 || response && response && response.statusCode == 429) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_dailylimit}`);
				else if (response && response && response.statusCode == 401) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`);
				else dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`);
				callback("");
			}
		});
	}

	function deepLTranslate(data, callback) {
		const auth = getAuth("deepl");
		request(auth.paid ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate", {
			method: "post",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `DeepL-Auth-Key ${auth.key || ""}`
			},
			body: JSON.stringify(Object.assign({
				"text": [data.text],
				"target_lang": mapLanguageCodeForEngine("deepl", data.output.id)
			}, data.input.auto ? {} : {"source_lang": mapLanguageCodeForEngine("deepl", data.input.id)}))
		}, (error, response, body) => {
			const labels = getLabels();
			const languages = getLanguages();
			if (!error && body && response && response && response.statusCode == 200) {
				try {
					body = JSON.parse(body);
					if (!data.specialCase && body.translations[0] && body.translations[0].detected_source_language && languages[body.translations[0].detected_source_language.toLowerCase()]) {
						data.input.name = languages[body.translations[0].detected_source_language.toLowerCase()].name;
						data.input.ownlang = languages[body.translations[0].detected_source_language.toLowerCase()].ownlang;
					}
					callback(body.translations.map(n => n && n.text).filter(n => n).join(""));
				}
				catch (err) {callback("");}
			}
			else {
				if (response && response && response.statusCode == 429 || response && response && response.statusCode == 456) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_dailylimit}`);
				else if (response && response && response.statusCode == 403) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`);
				else dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`);
				callback("");
			}
		});
	}

	// Only the LLM adapters go through requestWithTimeout: they are the ones that hang,
	// and they are the ones the queue backs off from.
	function requestAiProviderTranslation(engineKey, url, options, parseResponse, callback) {
		requestWithTimeout(url, options, (error, response, body) => {
			if (!error && body && response && response && response.statusCode == 200) {
				const translatedText = parseResponse(body);
				if (translatedText) return callback(translatedText);
			}
			const engineName = translationEngines[engineKey] && translationEngines[engineKey].name || engineKey;
			const details = getValidationErrorDetails(body);
			dangerToast(`${getLabels().toast_translating_failed} (${engineName})${details ? ` - ${details}` : ""}`);
			callback("");
		});
	}

	function openAiTranslate(data, callback) {
		const auth = getAuth("openai");
		const apiKey = auth.key || "";
		const apiEndpoint = normalizeApiEndpoint("openai", auth.endpoint || translationEngines.openai.endpoint);
		const modelId = auth.model || translationEngines.openai.model;
		const prompt = buildAiProviderTranslationPrompt(data);
		requestAiProviderTranslation("openai", apiEndpoint, {
			method: "post",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: modelId,
				instructions: prompt.system,
				input: prompt.prompt,
				store: false
			})
		}, body => parseOpenAiResponseText(body), callback);
	}

	function geminiTranslate(data, callback) {
		const auth = getAuth("gemini");
		const apiKey = auth.key || "";
		const apiEndpoint = normalizeApiEndpoint("gemini", auth.endpoint || translationEngines.gemini.endpoint);
		const modelId = (auth.model || translationEngines.gemini.model).replace(/^models\//, "");
		const prompt = buildAiProviderTranslationPrompt(data);
		const requestUrl = `${apiEndpoint}/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
		requestAiProviderTranslation("gemini", requestUrl, {
			method: "post",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({
				system_instruction: {parts: [{text: prompt.system}]},
				contents: [{role: "user", parts: [{text: prompt.prompt}]}],
				generationConfig: {temperature: 0.2, topP: 0.8}
			})
		}, body => parseGeminiResponseText(body), callback);
	}

	function chatCompletionsTranslate(engineKey, data, callback) {
		if (!isEngineConfiguredForRuntime(engineKey)) return callback("");
		const auth = getAuth(engineKey);
		const apiKey = auth.key || "";
		const apiEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey].endpoint);
		const modelId = auth.model || translationEngines[engineKey].model;
		const prompt = buildAiProviderTranslationPrompt(data);
		requestAiProviderTranslation(engineKey, apiEndpoint, {
			method: "post",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: modelId,
				messages: [
					{role: "system", content: prompt.system},
					{role: "user", content: prompt.prompt}
				],
				temperature: 0.2,
				top_p: 0.8,
				...engineRequestExtras(engineKey)
			})
		}, body => parseOpenAiResponseText(body).replace(/\[NEWLINE\]/g, "\n"), callback);
	}

	function deepSeekTranslate(data, callback) {
		return chatCompletionsTranslate("deepseek", data, callback);
	}

	function openAiCompatibleTranslate(data, callback) {
		return chatCompletionsTranslate("oaicompat", data, callback);
	}

	function iTranslateTranslate(data, callback) {
		const translate = _ => {
			request("https://web-api.itranslateapp.com/v3/texts/translate", {
				method: "post",
				headers: {
					"API-KEY": getAuth("itranslate").key || data.engine.APIkey
				},
				body: JSON.stringify({
					source: {
						dialect: data.input.id,
						text: data.text
					},
					target: {
						dialect: data.output.id
					}
				})
			}, (error, response, body) => {
				const labels = getLabels();
				const languages = getLanguages();
				if (!error && response && response && response.statusCode == 200) {
					try {
						body = JSON.parse(body);
						if (!data.specialCase && body.source && body.source.dialect && languages[body.source.dialect]) {
							data.input.id = body.source.dialect;
							data.input.name = languages[body.source.dialect].name;
							data.input.ownlang = languages[body.source.dialect].ownlang;
						}
						callback(body.target.text);
					}
					catch (err) {callback("");}
				}
				else {
					if (response && response && response.statusCode == 429) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_dailylimit}`);
					else if (response && response && response.statusCode == 403) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`);
					else dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`);
					callback("");
				}
			});
		};
		// iTranslate publishes no key of its own; without a user key the public web app
		// bundle is scraped once and cached on the engine entry.
		if (getAuth("itranslate").key || data.engine.APIkey) translate();
		else request("https://www.itranslate.com/js/webapp/main.js", {gzip: true}, (error, response, body) => {
			if (!error && body) {
				const APIkey = /var API_KEY = "(.+)"/.exec(body);
				if (APIkey) {
					data.engine.APIkey = APIkey[1];
					translate();
				}
				else callback("");
			}
			else callback("");
		});
	}

	function yandexTranslate(data, callback) {
		request("https://translate.yandex.net/api/v1.5/tr/translate", {
			form: {
				"key": getAuth("yandex").key || "",
				"text": encodeURIComponent(data.text),
				"lang": data.specialCase || data.input.auto ? data.output.id : (data.input.id + "-" + data.output.id),
				"options": "1"
			}
		}, (error, response, body) => {
			const labels = getLabels();
			const languages = getLanguages();
			if (!error && body && response && response && response.statusCode == 200) {
				try {
					const parsed = createElementFromHtml(body);
					const translation = parsed && parsed.querySelector("text");
					const detected = parsed && parsed.querySelector("detected");
					if (translation && detected) {
						const detectedLang = detected.getAttribute("lang");
						if (!data.specialCase && detectedLang && languages[detectedLang]) {
							data.input.name = languages[detectedLang].name;
							data.input.ownlang = languages[detectedLang].ownlang;
						}
						callback(translation.innerText);
					}
					else callback("");
				}
				catch (err) {callback("");}
			}
			else if (body && body.indexOf('code="408"') > -1) {
				dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_monthlylimit}`);
				callback("");
			}
			else {
				dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}/${labels.error_keyoutdated}`);
				callback("");
			}
		});
	}

	function papagoTranslate(data, callback) {
		const credentials = (getAuth("papago").key || "").split(" ");
		const doTranslate = langCode => {
			request("https://openapi.naver.com/v1/papago/n2mt", {
				method: "post",
				headers: {
					"X-Naver-Client-Id": credentials[0],
					"X-Naver-Client-Secret": credentials[1],
					"Content-Type": "application/x-www-form-urlencoded"
				},
				form: {
					source: langCode,
					target: data.output.id,
					text: data.text
				}
			}, (error, response, body) => {
				const labels = getLabels();
				if (!error && body && response && response && response.statusCode == 200) {
					try {
						const message = (JSON.parse(body) || {}).message;
						const result = message && (message.body || message.result);
						if (result && result.translatedText) callback(result.translatedText);
						else callback("");
					}
					catch (err) {callback("");}
				}
				else {
					if (response && response && response.statusCode == 429) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_hourlylimit}`);
					else dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}/${labels.error_keyoutdated}`);
					callback("");
				}
			});
		};
		// Papago has no auto-detect on the translate call, so detection is its own hop.
		if (data.input.auto) {
			request("https://openapi.naver.com/v1/papago/detectLangs", {
				method: "post",
				headers: {
					"X-Naver-Client-Id": credentials[0],
					"X-Naver-Client-Secret": credentials[1],
					"Content-Type": "application/x-www-form-urlencoded"
				},
				form: {
					query: data.text
				}
			}, (error, response, body) => {
				const languages = getLanguages();
				let langCode = "en";
				if (!error && body && response && response && response.statusCode == 200) {
					try {
						langCode = JSON.parse(body)["langCode"];
					}
					catch (err) {
						langCode = "en";
					}
				}
				data.input.name = languages[langCode].name;
				data.input.ownlang = languages[langCode].ownlang;
				doTranslate(langCode);
			});
		}
		else doTranslate(data.input.id);
	}

	function baiduTranslate(data, callback) {
		const credentials = (getAuth("baidu").key || "").split(" ");
		const salt = generateId();
		request("https://fanyi-api.baidu.com/api/trans/vip/translate", {
			bdVersion: true,
			method: "post",
			form: {
				from: translationEngines.baidu.parser[data.input.id] || data.input.id,
				to: translationEngines.baidu.parser[data.output.id] || data.output.id,
				q: encodeURIComponent(data.text),
				appid: credentials[0],
				salt: salt,
				sign: MD5(credentials[0] + data.text + salt + (credentials[2] || credentials[1]))
			}
		}, (error, response, result) => {
			const labels = getLabels();
			if (!error && result && response && response && response.statusCode == 200) {
				try {
					result = JSON.parse(result) || {};
					if (!result.error_code) {
						const messages = result.trans_result;
						if (messages && messages.length > 0 && result.from != result.to) callback(messages.map(message => decodeURIComponent(message.dst)).join("\n"));
						else {callback("");}
					}
					else {
						if (result.error_code == 54004) dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_monthlylimit}.`);
						else dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${result.error_code} : ${result.error_msg}.`);
						callback("");
					}
				}
				catch (err) {callback("");}
			}
			else {
				dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_serverdown}`);
				callback("");
			}
		});
	}

	const engineAdapters = {
		googleApiTranslate,
		googleCloudTranslate,
		microsoftTranslate,
		deepLTranslate,
		deepSeekTranslate,
		openAiTranslate,
		geminiTranslate,
		openAiCompatibleTranslate,
		iTranslateTranslate,
		yandexTranslate,
		papagoTranslate,
		baiduTranslate
	};

	function getEngineAdapter(engineKey) {
		const engine = translationEngines[engineKey];
		return engine && engineAdapters[engine.funcName] || null;
	}

	function translate(engineKey, data, callback) {
		const adapter = getEngineAdapter(engineKey);
		if (!adapter) return callback("");
		return adapter(data, callback);
	}

	// One request for a whole screen of history. The wire shape is a JSON array keyed by
	// message id, so a partial or reordered answer still lands on the right messages.
	function requestAiBatchTranslationDetailed(engineKey, preparedItems) {
		return new Promise(resolve => {
			const finishFailure = (failureKind, statusCode = null) => resolve({translations: null, failureKind, statusCode});
			if (!engineKey || !preparedItems || !preparedItems.length || !isEngineConfiguredForRuntime(engineKey)) return finishFailure("configuration");
			const auth = getAuth(engineKey);
			const apiKey = auth.key || "";
			const apiEndpoint = normalizeApiEndpoint(engineKey, auth.endpoint || translationEngines[engineKey].endpoint);
			const modelId = auth.model || translationEngines[engineKey].model;
			const output = preparedItems[0].output;
			const input = preparedItems[0].input;
			const payloadItems = preparedItems.map(item => ({
				id: String(item.message.id),
				text: item.protectedText.replace(/\n/g, " [NEWLINE] ").replace(/\s+/g, " ")
			}));
			const systemPrompt = "You are a strict Discord chat batch translator. Return valid JSON only.";
			// When the channel runs AI decision mode the user's own skip rules must apply
			// to batched messages too; otherwise batching silently translates what the
			// single-message path would have left alone.
			const batchChannelId = preparedItems[0].channelId || null;
			const decisionRules = shouldUseAiAutoTranslateDecision(batchChannelId)
				? `Apply these skip rules to every message; when a message should not be translated set its "translation" to exactly ${AI_SKIP_TRANSLATION_TOKEN}.\n${getAiAutoTranslatePrompt({input, output})}`
				: "The plugin has already filtered messages that should be skipped; do not make skip decisions.";
			const batchPrompt = `Target language is exactly ${output.name || output.id}. Input language is ${input && input.auto ? "auto-detect" : (input.name || input.id || "auto")}. ${decisionRules}\nRules:\n1. Return ONLY a JSON array. Each item must be {"id":"same id","translation":"translated text"}.\n2. Translate every provided natural-language message into exactly the target language.\n3. Preserve placeholders like ⟦0⟧ and ⟦DTA0⟧ exactly. Preserve URLs, code, emoji, mentions, IDs, and product/model names.\n4. Convert [NEWLINE] markers back to real line breaks in the translation; do not show [NEWLINE] literally.\n5. Do not omit any source content, including short interjections, laughter, particles, repeated words, or standalone short lines; translate or preserve them naturally in the target language.\n6. Do not add explanations. Do not output any language other than the target language except preserved protected content.\n\nMessages JSON:\n${JSON.stringify(payloadItems)}`;
			const finishResponse = (error, response, body, parseResponseText) => {
				const statusCode = response && response.statusCode || null;
				if (!error && response && statusCode == 200) {
					const translations = parseAiBatchTranslationResponse(parseResponseText(body), payloadItems.map(item => item.id));
					return translations === null
						? finishFailure("malformed", statusCode)
						: resolve({translations, failureKind: null, statusCode});
				}
				if (statusCode == 401 || statusCode == 403) {
					const labels = getLabels();
					dangerToast(`${labels.toast_translating_failed}. ${labels.toast_translating_tryanother}. ${labels.error_keyoutdated}`);
					return finishFailure("auth", statusCode);
				}
				if (error || !response || statusCode == 408 || statusCode == 429 || statusCode >= 500) return finishFailure("transient", statusCode);
				return finishFailure("permanent", statusCode);
			};
			if (engineKey == "openai") {
				return requestWithTimeout(apiEndpoint, {
					method: "post",
					headers: {"Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`},
					body: JSON.stringify({model: modelId, instructions: systemPrompt, input: batchPrompt, store: false})
				}, (error, response, body) => finishResponse(error, response, body, parseOpenAiResponseText));
			}
			if (engineKey == "gemini") {
				const geminiModelId = String(modelId || "").replace(/^models\//, "");
				const requestUrl = `${apiEndpoint}/${encodeURIComponent(geminiModelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;
				return requestWithTimeout(requestUrl, {
					method: "post",
					headers: {"Content-Type": "application/json"},
					body: JSON.stringify({system_instruction: {parts: [{text: systemPrompt}]}, contents: [{role: "user", parts: [{text: batchPrompt}]}], generationConfig: {temperature: 0.1, topP: 0.8}})
				}, (error, response, body) => finishResponse(error, response, body, parseGeminiResponseText));
			}
			requestWithTimeout(apiEndpoint, {
				method: "post",
				headers: {"Content-Type": "application/json", "Authorization": `Bearer ${apiKey}`},
				body: JSON.stringify({model: modelId, messages: [{role: "system", content: systemPrompt}, {role: "user", content: batchPrompt}], temperature: 0.1, top_p: 0.8, ...engineRequestExtras(engineKey)})
			}, (error, response, body) => finishResponse(error, response, body, parseOpenAiResponseText));
		});
	}

	function requestAiBatchTranslation(engineKey, preparedItems) {
		return requestAiBatchTranslationDetailed(engineKey, preparedItems).then(outcome => outcome.translations);
	}

	return Object.freeze({
		translationEngines,
		enginePortals,
		MD5,
		translate,
		getEngineAdapter,
		googleApiTranslate,
		googleCloudTranslate,
		microsoftTranslate,
		deepLTranslate,
		deepSeekTranslate,
		openAiTranslate,
		geminiTranslate,
		openAiCompatibleTranslate,
		iTranslateTranslate,
		yandexTranslate,
		papagoTranslate,
		baiduTranslate,
		chatCompletionsTranslate,
		requestAiProviderTranslation,
		requestAiBatchTranslation,
		requestAiBatchTranslationDetailed,
		normalizeApiEndpoint,
		getModelCatalogEndpoint,
		mapLanguageCodeForEngine,
		getValidationRequestForEngine,
		getValidationErrorDetails,
		isValidatableEngine,
		supportsModelCatalog,
		buildAiProviderTranslationPrompt,
		parseOpenAiResponseText,
		parseGeminiResponseText,
		parseAiBatchTranslationResponse,
		isEngineConfiguredForRuntime,
		requestWithTimeout,
		scheduleBackoff,
		awaitBackoff,
		getBackoffUntil: () => backoffUntil || 0,
		getBackoffStep: () => backoffStep,
		isBackoffActive: () => now() < (backoffUntil || 0),
		// Nothing clears the window today; a client is per plugin instance, so a restart
		// is the only reset the runtime has ever had.
		resetBackoff() {
			backoffUntil = 0;
			backoffStep = 0;
		},
		getModelCatalogState: () => modelCatalogState,
		clearModelCatalogState() {
			modelCatalogState = {};
		},
		fetchModelCatalog,
		validateEngineConfig
	});
}

module.exports = {
	AI_SKIP_TRANSLATION_TOKEN,
	PROVIDER_REQUEST_TIMEOUT_MS,
	PROVIDER_RATE_LIMIT_BACKOFF_MS,
	PROVIDER_SERVER_ERROR_BACKOFF_MS,
	PROVIDER_BACKOFF_MAX_STEP,
	PROVIDER_BACKOFF_MAX_MS,
	CREDENTIAL_REQUIRED_ENGINES,
	FREE_ENGINE_CHUNK_LIMIT,
	splitTextIntoTranslationChunks,
	VALIDATABLE_ENGINES,
	AI_MODEL_ENGINES,
	translationEngines,
	enginePortals,
	MD5,
	normalizeApiEndpoint,
	getModelCatalogEndpoint,
	mapLanguageCodeForEngine,
	getValidationRequestForEngine,
	getValidationErrorDetails,
	isValidatableEngine,
	supportsModelCatalog,
	buildAiProviderTranslationPrompt,
	parseOpenAiResponseText,
	parseGeminiResponseText,
	parseAiBatchTranslationResponse,
	createProviderClient
};
