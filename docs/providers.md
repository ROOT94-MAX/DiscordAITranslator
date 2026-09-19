# 翻译服务接口约定

<a id="translation-provider-interface"></a>

## 统一翻译接口

每个供应商适配器接收相同的逻辑输入：

- 源语言或自动识别
- 目标语言
- 已进行保护处理的文本载荷
- 来自全局配置的凭证和端点
- 可选模型标识
- 翻译回调或 Promise 结果

供应商专有 HTTP 格式留在对应适配器中；频道代码只选择供应商键，不拼装供应商请求。

<a id="current-providers"></a>

## 当前可新配置的服务

| 供应商键 | 用途 | 必要配置 |
| --- | --- | --- |
| `googleapi` | 无需密钥的 Google Free 翻译 | 无 |
| `googlecloud` | Google Cloud Translation v2，默认使用 NMT 的机器翻译 | API 密钥 |
| `microsoft` | Azure Translator | API 密钥，可选区域 |
| `deepl` | DeepL API | API 密钥 |
| `deepseek` | DeepSeek Chat Completions | API 密钥；端点和模型有官方默认值 |
| `gemini` | 原生 Gemini `generateContent` API | API 密钥；端点和模型有官方默认值 |
| `oaicompat` | 自定义第三方或自托管服务 | 明确端点/模型，凭证要求由最终协议决定 |
| `baidu` | 百度通用文本翻译 | 分别填写 APP ID 和密钥 |

运行时仍保留 `openai` 和 `papago` 适配器，但它们已归档，仅用于读取已有主用、备用或频道配置；新安装和新配置不再提供这两个条目。需要新接入 AI 服务时使用 Gemini、DeepSeek 或自定义服务商。本节表格只列出当前可新配置的服务。选择职责见[供应商目录](../src/ui/provider-catalog.js)。

示例 `oaicompat` 端点和模型只是占位符，不能作为有效运行配置，也不会发到网络。

左侧目录保留 Google Cloud，右侧标题为 Cloud Translation，接入 Cloud Translation Basic v2。模型输入与“验证配置”按钮直接显示在同一行，不再设置单独的高级折叠区。留空使用默认 `nmt`，无需手动选择；已有非默认值继续显示，编辑或清空后按实际值保存。说明放在模型标签旁的问号中。布局取舍见[模型直接配置笔记](../.agents/notes/implemented/simplification/2026-09-17-cloud-translation-model-row.md)。

Google 官方也支持通过完整资源名称指定标准 Translation LLM，见 [Google 官方翻译文档](https://docs.cloud.google.com/translate/docs/translate-text)。此条目按默认接入方式归入机器翻译，不会自动切换模型或获得插件的 AI 决策能力；Gemini 仍是独立条目。

百度的 APP ID 和密钥来自翻译开放平台开发者信息，密钥默认隐藏；无需手动拼接或填写签名。适配器依据 [百度通用文本翻译规范](https://api.fanyi.baidu.com/doc/23)生成 `appid + q + salt + 密钥` 的 MD5 签名。旧两段和三段合并凭证仍可读取；编辑任一新字段时保留另一字段，清空字段不会从旧值补回。完整新配置同时维护旧版可读取的 `key`，未填完整时该兼容值为空。凭证存储与兼容理由见[百度凭证笔记](../.agents/notes/implemented/bug-fix/2026-09-17-baidu-credential-fields.md)。

Papago 先将识别结果 `zh-cn` / `zh-tw` 规范化为其翻译代码 `zh-CN` / `zh-TW`，再按 NAVER 文档中的语言配对矩阵校验。百度将通用中文映射为 `zh`、繁体中文映射为 `cht`，不能把通用中文误当成文言文 `wyw`。

<a id="provider-settings"></a>

## 服务配置的作用范围

- 凭证、端点、模型、连接测试和模型目录均为全局配置。
- 频道只能覆盖自己的主供应商。
- 只被频道选中的供应商也必须能在全局设置中直接配置。
- 全局备用供应商不在频道弹窗中重复设置。
- 至少一个已选中的全局、备用或频道供应商同时具备 AI 能力且已配置时，才提供 AI 决策模式。

<a id="native-ai-adapters"></a>

## 原生 AI 适配器

### OpenAI

官方适配器使用 `/v1/responses`，发送 `store: false`，解析 Responses API 的输出项。ChatGPT 订阅不等于 OpenAI API 凭证。

### Gemini

Gemini 适配器使用原生 `generateContent` 请求和响应格式，不通过 OpenAI 兼容适配器转发。

<a id="custom-providers"></a>

### 自定义服务

自定义供应商通过[适配器注册表](../src/providers/protocol-adapters/index.js)支持 OpenAI Chat Completions、OpenAI Responses、原生 Ollama、原生 Gemini 和 Anthropic Messages。选择或解析出的协议决定请求格式和凭证策略。原生 Ollama 可不填密钥；填写后使用 bearer 认证。其他适配器需要凭证。派发翻译前检查必要凭证、端点或模型是否缺失，示例占位端点/模型不被接受。

<a id="typed-batch-json-output"></a>

混合语言的 typed 消息可携带 `sourceContext`：从不可变原文计划生成，保护词、链接、代码和提及继续遮蔽，仅用于理解当前批次。它与结构语境共用最多 4096 字符预算，同时受既有字节/token 上限约束；超限时整份省略，不扩大请求预算。纯外语片段不重复附带原句；classic 与内置 native-multi 载荷保持原格式。

typed 输出片段的 `allowNameKeep` 表示允许模型作出显式保留决定，不表示本地已认定是名称。模型只有在整段都是应保留的名称、产品/模型名、简称或技术标识（可含版本、百分比、名称列表及保护占位符）时返回 `__KEEP_NAME__`；普通词、俚语及句子仍需翻译。名称与普通语句混合时保留名称、翻译语句。客户端从不可变原文恢复整段，再做完整性校验；原样回显本身不获得这个许可。单词标记可保留逐字相同的外围标点/格式；其他带附加文字或损坏标记的写法不被接受。

许可与可选语境独立，因此独立的多词名称、语境超限的请求也能明确选择保留。许可本身仍受请求预算约束；未发送许可的请求及其修复不能使用保留标记。未知/重复 ID、缺失片段和保护结构损坏继续失败。修复仅请求失败片段，并在原请求末尾明确提示普通回显会再次失败、名称需用保留标记；不增加次数。批次提示词为 `typed-batch-v4`，工作负载分别记录实际启用的语境和名称决定版本。

只有整条响应全部通过校验、完整重组后与原始请求逐字相同时，收到消息才以正常跳过收尾：写入跳过记录、移出失败重试列表，不写译文缓存、不标成已翻译。实际变化的完整结果继续作为译文处理。该判断在原有请求中完成，没有新增 AI 预判或复审；提示词及许可增加少量输入，不能承诺零延迟。模型仍可能把普通词误认成名称，结构校验不能证明语义正确。

### 结构化批次的 JSON 输出

自定义供应商切换协议时，typed 批次始终保持 `messages[].id` / `segments[].id` / `translation` 约定。各适配器把批次的 `jsonObject` 请求映射为原生输出设置：

| 协议 | 结构化批次请求字段 |
| --- | --- |
| OpenAI Chat Completions | Gemini 3.6/3.7 Flash 别名使用精简的 `response_format: {type: "json_schema", json_schema: ...}`；其他模型使用 `{type: "json_object"}` |
| OpenAI Responses | `text: {format: {type: "json_object"}}` |
| Gemini `generateContent` | `generationConfig.responseMimeType: "application/json"`，加上描述既有批次格式的精简 `responseSchema` |
| Ollama `/api/chat` | `format: "json"` |
| Anthropic Messages 中受支持的 Claude 模型 | `output_config.format: {type: "json_schema", schema: ...}` |

这些字段属于各自协议：[OpenAI Responses 迁移说明](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[DeepSeek JSON 输出](https://api-docs.deepseek.com/guides/json_mode/)、[Gemini GenerationConfig](https://ai.google.dev/api/generate-content#v1beta.GenerationConfig)、[Ollama chat](https://docs.ollama.com/api/chat) 和 [Anthropic 结构化输出](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)。

Anthropic 对既有批次格式使用精简、稳定的 schema，不枚举 ID，也不固定消息/片段数量。适配器只对已识别且有文档依据的 Claude 模型开启该字段（Opus 4.5–4.8/5、Sonnet 4.5/4.6/5、Haiku 4.5、Fable 5/5.1、Mythos 5/5.1/Preview）。旧模型和未知别名保留既有提示词与解析约定。自适应推理把 `output_config.effort` 与格式设置合并。Anthropic 首次请求可能编译语法；稳定 schema 有利于复用服务端缓存。

Gemini 使用 `responseSchema` 接受的 OpenAPI 子集，不枚举 ID 或固定数组长度。保留此字段是为了兼容已测试的原生网关：该网关未执行仅 MIME 输出或 `responseJsonSchema` 的约束。公开 API 已将 `responseSchema` 标记为弃用；能接受参数不能证明所有网关都会执行约束。schema 保持在原生适配器中，与 thinking 设置合并，不切换用户选定协议，不新增提示词、能力探测或重试。

Gemini 3.6/3.7 Flash 的 Chat 路径使用稳定 schema，要求包含 `messages`、`id`、`segments` 和 `translation`。受控网关探测执行了该 schema，却忽略了 Chat 中仅要求 JSON MIME 的 `json_object` 请求。ID 仍是每次请求提供的字符串，数组长度不固定。其他 Chat 模型为兼容性继续使用 JSON 模式；模型名判断不能证明所有网关都执行 schema。在已测试 Chat 路径上，请求体约增加 487 字节，不增加请求次数。

旧回退返回数组，因此其请求不带这些对象输出设置。单条翻译、校验请求和 W5 小范围候选验证保留既有格式，不新增能力探测、重试或排队延迟。内置 OpenAI/Gemini/DeepSeek 批次派发器收到已准备的 typed 项时也使用这些适配器，主供应商资格规则不变。JSON 模式有助于输出语法，但不能证明返回 ID 或译文正确，因此原有校验和回退仍必需。

如果完整消息对象之间多出一个右花括号，共享读取器可在本地恢复这些直接成员。恢复要求每个预期消息 ID 恰好出现一次，且外层边界可识别；不能从损坏字符串中间重新开始解析，也不能按位置对齐。下游片段校验仍执行。已采集的多余括号响应由回归数据覆盖；所有消息完整时，无需转到旧路径重发。

<a id="inline-formatting-and-sentence-meaning"></a>

### 行内格式与完整句意

typed 请求把识别出的强调、剧透、删除线和链接标签，与同一行周围文字合为片段。例如 `Please **do not publish** the draft before Friday.` 会作为一个片段传输为 `Please ⟦F0⟧do not publish⟦/F0⟧ the draft before Friday.`，让翻译器能按中文习惯把时间条件放在动作前。格式边界由本地计划恢复；链接目标无需模型生成，代码和其他受保护值继续使用既有本地占位符。

只有包含这些成对边界的请求才附加简短格式指令。本地校验器先检查标记数量、配对顺序、嵌套及区间非空，再恢复准确分隔符。独立区间可按目标语言语序移动。失败句子走既有精确修复路径，成功的同级片段保留。此检查保护结构，不能证明任意译文含义准确。

块级语法、换行、表格和围栏代码块留在本地。不平衡或含糊的连续分隔符保持原有无损规划，不跨行合并格式。格式化请求使用新的工作负载保护身份，避免复用旧碎片化请求的缓存；没有合并格式的请求保留原缓存身份。离线回放格式化前采集的响应时，明确选择历史规划约定，并保留原证据。

<a id="google-free-and-google-cloud"></a>

## Google Free 与 Google Cloud

Google Free 使用无需密钥的公开网页翻译端点，不接受用户 API 密钥；官方 Google 凭证属于独立的 Google Cloud 供应商。传输按编码后查询长度分块，将保护词映射为可逆、安全的传输标记，再使用共享严格占位符校验器。

完全相同的供应商错误在 10 秒内合并提示；不同故障仍分别可见。

<a id="backup-provider"></a>

## 备用供应商

- 备用供应商是全局配置。
- 频道主供应商可以不同于全局主供应商。
- 有效主供应商与备用供应商相同时，不重复调用两次。
- 翻译缓存和回复签名包含有效主备供应商身份。

<a id="language-detection"></a>

## 语言识别

语言识别是独立于翻译供应商选择的全局策略：

1. 默认 `local_first`：先使用高置信本地识别，不确定时回退无需密钥的 Google 识别。
2. `google_free`：始终使用无需密钥的 Google 识别。
3. `local_only`：不发送识别请求，本地证据不确定时不返回结果。

有意不提供 AI 语言识别入口：它增加延迟和付费 token 消耗，对默认翻译路径的提升不足以支撑新增设置。
