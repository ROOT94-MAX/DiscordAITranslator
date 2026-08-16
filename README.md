<div align="center">

# DiscordAITranslator

[![Platform](https://img.shields.io/badge/Platform-Discord-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.com)
[![Loader](https://img.shields.io/badge/Loader-BetterDiscord-4E5D94?style=flat-square)](https://betterdiscord.app)
[![Version](https://img.shields.io/badge/Version-0.3.38-success?style=flat-square)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases)
[![Downloads](https://img.shields.io/github/downloads/ROOT94-MAX/DiscordAITranslator/total?style=flat-square&color=yellow)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases)
[![License](https://img.shields.io/badge/License-GPL%20v2-blue?style=flat-square)](./LICENSE)

一款专为 Discord 打造的智能翻译插件：发送前双语预审、接收消息自动翻译、历史消息智能补翻，内置文本保护规则与滚动稳定性保障。

**当前版本：v0.3.38** ｜ **运行环境：BetterDiscord + BDFDB Library**

</div>

---

## 目录

- [效果展示](#效果展示)
- [核心特性](#核心特性)
- [支持的翻译服务商](#支持的翻译服务商)
- [智能保护规则](#智能保护规则)
- [安装指南](#安装指南)
- [常见问题（FAQ）](#常见问题faq)
- [项目结构与测试](#项目结构与测试)
- [致谢](#致谢)
- [开源协议](#开源协议)

---

## 效果展示

原文截图：

![原文截图](images/chat-overview.png)

译文截图：

![译文截图](images/translation-effect.png)

---

## 核心特性

### 发送端：双语智能预审
* **频道级自动化**：输入框右侧翻译图标始终显示。左键打开当前频道设置，右键切换当前频道翻译总开关；单条消息手动翻译始终独立可用。
* **同语言跳过机制**：源语言与目标语言相同时直接发送原文。若设为“检测语言”，会优先进行本地检测，彻底告别 `中文 -> AI -> 中文改写` 的尴尬循环。
* **AI 兜底防护**：防止 AI 引擎因误判而将原文恶性改写。
* **隐私与防剧透**：支持附带原文一起发送，并可配置自动为原文加上 Spoiler（剧透）遮盖。

### 接收端：全自动流式翻译
* **精细化控制**：每个频道单独保存开关状态，没有全局自动开启默认值。
* **频道主引擎覆盖**：左键打开输入框翻译面板，可为当前频道单独选择主服务商；未覆盖频道继续跟随后台全局默认，备用服务仍保持全局配置。
* **轻量级预检测 (`useLocalLanguagePrecheck`)**：内置十几种常用语种的本地停用词表。无需网络请求即可秒级识别拉丁语系同语言消息（如英->英），高置信度时自动跳过。
* **AI 决策安全网 (`autoTranslateDecisionMode=ai`)**：当 AI 误判“无需翻译”时，系统将通过本地书写系统快判 + Google 检测进行双重复核，确保外语消息 100% 被强制重翻。
* **原子历史补翻**：已加载消息按 Discord 消息 ID 组成频道任务，可在内部拆分请求和逐条修复，但所有终态结果只触发一次统一显示刷新。
* **无静默漏翻**：缺失、重复、未知、空结果、错误语言和占位符损坏都会进入修复流程；等待中的消息显示固定尺寸 CSS 加载图标。
* **健壮的队列容错**：请求 30 秒硬超时限制；遇 `429 限流` 自动退避 5 秒，遇 `5xx 错误` 退避 2 秒，严防顶着限流连续轰炸 API。
* **帖子与线程标题**：开启对应频道翻译后，论坛帖子和线程标题会跟随当前频道的语言与主引擎设置，停用或卸载后恢复原文。

### 交互与手动翻译
* **精准正文提取**：单条消息快捷翻译只提取当前消息正文，自动剥离引用预览或剧透内容。
* **滚动锁定技术**：翻译后触发短时间滚动锁，无论新消息涌入还是译文插入，视窗都能精准回到原消息附近。

### 完美的滚动稳定性 (Zero-Jumping)
* **消息锚点恢复**：自动翻译刷新时，系统会精准记录当前 `messageId` 及其距可视区域顶部的位置，并在刷新后重新定位，**彻底解决自动翻译后视角跳到中间、新消息拉到底、历史补翻视角错乱等通病**。
* **临时拦截机制**：在打开设置页 `Select` 或点击输入框时，临时拦截 `scrollIntoView`，避免面板无故跳动。

---

## 支持的翻译服务商

| Key | 服务商 | 需要 API Key | 特色与说明 |
| :--- | :--- | :---: | :--- |
| `googleapi` | **Google (gtx)** | **否** | 默认引擎，免配置，开箱即用 |
| `googlecloud` | **Google Cloud Translation** | 是 | 正式付费级高级 API |
| `microsoft` | **Azure Translator** | 是 | 微软官方正式付费级 API |
| `deepl` | **DeepL** | 是 | 行业公认高质翻译服务 |
| `deepseek` | **DeepSeek** | 是 | 优秀国产 AI 引擎，**完美支持 AI 决策模式** |
| `openai` | **OpenAI 官方 API** | 是 | 使用 Responses API，支持单条、批量与 AI 决策模式 |
| `gemini` | **Google Gemini 官方 API** | 是 | 使用原生 `generateContent` 接口，支持批量与 AI 决策模式 |
| `oaicompat` | **自定义 API (OpenAI 兼容)** | 是 | 必须显式填写真实 Endpoint 和 Model，可接入自建或第三方服务 |
| `yandex` | **Yandex** | 是 | 兼容保留的传统服务商 |

> 💡 **核心提示**：
> 1. AI 决策模式（`autoTranslateDecisionMode=ai`）支持 `deepseek`、`openai`、`gemini` 和 `oaicompat`，且只有服务配置完整时才会启用。
> 2. 插件支持配置**备用引擎 (`backup`)**，当主引擎请求失败时会自动回退，保障翻译不中断。

---

## 智能保护规则

为了防止翻译破坏专业术语、代码块或特定语境，插件内置了双向保护机制：

* **专有名词保护**：支持配置固定术语、产品名、团队名（如 `BUG team`, `DeepSeek V3`）。匹配时自动忽略内部空格（如配置 “BUG team” 也会自动保护 “bugteam”）。
* **自动化免翻豁免**：内置版本号、全大写缩写（如 `CDK` / `GPT` / `API`）自动免翻保护。但若识别到全大写喊话文本（如 `HELLO CRYZYYY`），则会豁免该规则进行正常翻译。
* **自动包裹符隔离**：成段隔离保护，格式为 `左包裹符|右包裹符`。默认支持 `"|"`、`“|”`、`` `|` ``、`【|】`、`「|」`。*(注：`||` 不再作为普通包裹符，确保剧透内容不会被错误阻断)*
* **全局跳过前缀**：支持自定义跳过前缀（如以 `!` 开头的消息），直接不触发翻译逻辑。

---

## 安装指南

### 前置依赖
1. 官方原生 **Discord** 客户端。
2. 安装 **BetterDiscord** 插件加载器。
3. 下载 **BDFDB Library**：[点击前往下载](https://mwittrien.github.io/downloader/?library)

### 安装步骤

> 💡 推荐直接从 [Releases 页面](https://github.com/ROOT94-MAX/DiscordAITranslator/releases) 下载 `DiscordAITranslator.plugin.js`，无需 clone 整个仓库。

1. 将 `DiscordAITranslator.plugin.js` 移动至插件目录 `%AppData%\BetterDiscord\plugins`。
2. 将下载好的 `BDFDB Library` 文件（通常为 `0BDFDB.plugin.js`）放置到同一目录下。
3. 打开 Discord -> `设置` -> `BetterDiscord` -> `插件`，开启 **DiscordAITranslator**。
4. 点击插件设置，选择你心仪的翻译服务商，配置语言后即可开始使用！

> 🔄 **版本更新提示**：替换新版插件后，请在插件页面重新开关一次，或者在 Discord 界面中直接按下 `Ctrl + R` 重载客户端。

### 配置示例

翻译服务配置：选择服务商、填写 API Key / Endpoint / Model（图为 DeepSeek）：

![翻译服务配置](images/settings-service.png)

语言与自动翻译策略：设置收发语言、主备引擎、补翻范围与每批数量：

![语言与自动翻译策略](images/settings-language.png)

### 推荐搭配：system24 主题

打开 BetterDiscord 主题页，直接导入以下直链：

```text
https://refact0r.github.io/system24/build/system24.css
```

---

## 常见问题（FAQ）

### 关于安装与加载

- **Q：插件没有显示在 BetterDiscord 插件列表里？**
- A：确认 `DiscordAITranslator.plugin.js` 放在了 `%AppData%\BetterDiscord\plugins`，且文件名末尾确实是 `.js`（浏览器下载有时会变成 `.js.txt`）。放好后重启一次 Discord。

- **Q：启用时报缺少依赖 / BDFDB 相关错误？**
- A：本插件依赖 BDFDB Library。请先下载 [`0BDFDB.plugin.js`](https://mwittrien.github.io/downloader/?library) 放到同一 `plugins` 目录，在插件页启用 BDFDB 后，再启用 DiscordAITranslator。

- **Q：改了设置 / 替换了新版本插件没有生效？**
- A：在 Discord 按 `Ctrl + R` 重载客户端，或在 BetterDiscord 插件页把插件关一次再开。

### 关于翻译行为

- **Q：收到消息没有自动翻译？**
- A：按顺序排查：① 该频道的自动翻译开关是否打开；② 消息是否被"同语言跳过""源语言过滤"或"译文过于相似"等规则跳过（看译文位置的状态标签会注明原因，如 same-language / source-filter / too_similar）；③ 该消息是否在已加载消息补翻的范围之外。短词不会仅因长度被跳过。

- **Q：自动翻译加载太慢，等了很久还没出现译文？**
- A：实时消息使用独立即时队列，不会等待历史任务。历史消息会先完成校验和修复，再一次性显示，避免反复刷新导致输入框或滚动位置抖动。若单条实时消息仍需等待数秒，通常是当前服务商的网络或模型响应时间；Google 免费接口通常比大型 AI 模型更快。

- **Q：译文和原文几乎一样就不显示了？**
- A：这是 `dropSimilarTranslations`（相似度阈值默认 0.9）在起作用，判定为同语言改写时丢弃。可在设置里调高阈值或关闭该开关。

- **Q：短句像“哈哈”“嗯嗯”能翻译吗？**
- A：可以。自 `0.3.26` 起移除了短文本最小长度跳过，短语气词也会进入翻译流程。

### 关于 AI 决策与漏翻

- **Q：全大写英文消息（如 `HELLO CRYZYYY`）没翻译？**
- A：`0.3.31` / `0.3.32` 已修复全大写喊话漏翻问题。请确认插件版本 ≥ `0.3.32`（在插件设置页顶部或 Release 页查看版本）。

- **Q：开了 AI 决策模式还是偶尔漏翻外语？**
- A：安全网会在 AI 误判“无需翻译”时，本地按书写系统快判 + Google 检测复核，确认为外语则强制重翻。若仍漏，可临时关闭 AI 决策模式改用 `basic`，或检查目标语言是否设对。

### 关于网络与请求

- **Q：翻译卡住不动 / 请求一直失败？**
- A：`0.3.29` 起加了 30 秒硬超时，卡住会自动失败重排；遇 429 退避 5 秒、5xx 退避 2 秒。若持续失败，检查 API Key、Endpoint、网络代理是否正常，或配置备用引擎 (`backup`) 自动回退。

- **Q：用 Google 默认引擎需要 API Key 吗？**
- A：不需要。`googleapi` 免配置直接可用，也不能填写自定义密钥；正式 Google API Key 属于独立的 `googlecloud`。OpenAI、Gemini、DeepSeek 和自定义兼容接口在后台全局设置中配置凭据。

---

## 项目结构与测试

```text
discord翻译/
├── AGENTS.md                        # 项目规则与文档权威顺序
├── CONTRIBUTING.md                  # 开发、测试与部署流程
├── DiscordAITranslator.plugin.js   # 主插件文件 (BetterDiscord 入口)
├── package.json                    # 统一检查与测试命令
├── CHANGELOG.md                    # 版本变更日志
├── README.md                       # 项目说明
├── LICENSE                         # GPL-2.0 协议
├── docs/
│   ├── README.md                    # 文档索引与权威规则
│   ├── product.md                   # 已确认的产品行为
│   ├── settings.md                  # 频道与全局设置边界
│   ├── providers.md                 # 翻译与语言检测服务契约
│   ├── architecture.md              # 当前架构与目标模块边界
│   └── recovery-plan.md              # 唯一恢复与实施顺序
└── tests/                          # 自动化回归测试套件
    ├── helpers/
    │   └── createPluginInstance.js
    ├── channel-enablement-regression.test.js
    ├── channel-primary-engine-regression.test.js
    ├── channel-title-regression.test.js
    ├── historical-translation-job.test.js
    ├── provider-regression.test.js
    ├── settings-contract-regression.test.js
    ├── popout-scope-regression.test.js
    ├── translation-regression.test.js
    ├── protection-regression.test.js
    ├── local-language-precheck.test.js
    ├── auto-translate-precheck-regression.test.js
    ├── ai-decision-allcaps-regression.test.js
    ├── manual-translation-button-regression.test.js
    └── typing-during-translation-regression.test.js
```

### 本地测试校验

安装 Node.js 20 或更高版本后，统一运行：

```powershell
npm run verify
```

只运行某一个回归文件时可以使用 `npm test -- tests/translation-regression.test.js`。

完整版本历史见 [CHANGELOG.md](./CHANGELOG.md)，技术细节见 [docs/](./docs/)。

---

## 致谢

本插件基于 BetterDiscord 原版 `Translator` 插件进行二次开发。衷心感谢以下上游项目及作者的开源贡献：

* **上游原版**：[mwittrien/BetterDiscordAddons](https://github.com/mwittrien/BetterDiscordAddons) 的 `Translator` 核心。
* **运行时基建**：[mwittrien/BDFDB](https://mwittrien.github.io/downloader/?library) 库。
* **主题美化**：[refact0r/system24](https://github.com/refact0r/system24) 的极简美学设计。

---

## 开源协议

本项目基于 [GNU General Public License v2.0](./LICENSE) 开源。你可以自由使用、修改和分发，但再分发或衍生作品必须同样采用 GPL v2.0 协议发布。

本项目基于 mwittrien/BetterDiscordAddons 的 Translator 插件二次开发，上游同样采用 GPL v2.0 协议。
