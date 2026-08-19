<div align="center">

# DiscordAITranslator

[![Platform](https://img.shields.io/badge/Platform-Discord-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.com)
[![Loader](https://img.shields.io/badge/Loader-BetterDiscord-4E5D94?style=flat-square)](https://betterdiscord.app)
[![Version](https://img.shields.io/badge/Version-0.3.39-success?style=flat-square)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases)
[![Downloads](https://img.shields.io/github/downloads/ROOT94-MAX/DiscordAITranslator/total?style=flat-square&color=yellow)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases)
[![License](https://img.shields.io/badge/License-GPL%20v2-blue?style=flat-square)](./LICENSE)

一款专为 Discord 打造的智能翻译插件：发送前双语预审、接收消息自动翻译、历史消息智能补翻，内置文本保护规则与滚动稳定性保障。

**当前版本：v0.3.39** ｜ **运行环境：BetterDiscord + BDFDB Library**

</div>

---

## 目录

- [效果展示](#效果展示)
- [核心特性](#核心特性)
- [支持的翻译服务商](#支持的翻译服务商)
- [智能保护规则](#智能保护规则)
- [安装指南](#安装指南)
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

## 项目结构与测试

自 v0.3.38 起源码已模块化：`src/` 下的模块由构建脚本确定性打包为单文件产物，BetterDiscord 用户只需安装一个 `DiscordAITranslator.plugin.js`。

```text
discord翻译/
├── DiscordAITranslator.plugin.js   # 构建产物（BetterDiscord 安装入口，勿手改）
├── src/                            # 模块化源码
│   ├── plugin/                     # 入口与插件元数据（版本号在此维护）
│   ├── legacy/                     # 迁移中的组合根与补丁外壳
│   ├── display/                    # 显示状态仓库、事务控制器、渲染适配
│   ├── orchestrator/               # 实时/历史队列、频道切换、分块传输
│   ├── received/                   # 接收消息翻译管线与历史消息源
│   ├── sent/                       # 发送消息翻译管线
│   ├── providers/                  # 翻译服务商客户端
│   ├── settings/                   # 设置存储与迁移
│   ├── status/                     # 状态胶囊
│   ├── ui/                         # 设置面板与交互组件
│   └── cache/ viewport/ language/ protection/ …
├── scripts/build-plugin.mjs        # 确定性构建（esbuild，含 @buildId 指纹）
├── tests/                          # 自动化回归测试套件
├── docs/                           # 权威文档（索引见 docs/README.md）
├── AGENTS.md / CONTRIBUTING.md     # 项目规则与开发流程
└── package.json                    # 构建、检查与测试命令
```

### 本地测试校验

安装 Node.js 20 或更高版本后，统一运行：

```powershell
npm run build      # 从 src/ 重新生成插件文件
npm run verify     # 构建校验 + 语法检查 + 全部测试（部署前必跑）
```

注意：测试会加载生成的插件文件，改动 `src/` 后请先 `npm run build` 再跑聚焦测试，否则执行的是旧产物。只运行某一个回归文件时可以使用 `npm test -- tests/translation-regression.test.js`。

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
