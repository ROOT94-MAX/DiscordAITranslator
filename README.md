```markdown
# DiscordAITranslator

> 一个 Discord 翻译插件：在你发送消息前翻译、收到消息时自动翻译、补翻历史消息，同时保留保护规则与聊天滚动稳定。

---

## 功能特性

### 发送端：双语智能预审
* **无缝自动化**：输入框右侧设总开关，一键控制“发送时自动翻译”，与单条消息手动翻彼此独立。
* **同语言跳过机制**：源语言与目标语言相同时直接发送原文。若设为“检测语言”，会优先进行本地检测，彻底告别 `中文 -> AI -> 中文改写` 的尴尬循环。
* **AI 兜底防护**：防止 AI 引擎因误判而将原文恶性改写。
* **隐私与防剧透**：支持附带原文一起发送，并可配置自动为原文加上 Spoiler（剧透）遮盖。

### 接收端：全自动流式翻译
* **精细化控制**：支持频道级独立开关，可按特定频道或全局记录启用状态。
* **轻量级预检测 (useLocalLanguagePrecheck)**：内置十几种常用语种的本地停用词表。无需网络请求即可秒级识别拉丁语系同语言消息（如英->英），高置信度时自动跳过。
* **AI 决策安全网 (autoTranslateDecisionMode=ai)**：当 AI 误判“无需翻译”时，系统将通过本地书写系统快判 + Google 检测进行双重复核，确保外语消息 100% 被强制重翻。
* **无感历史补翻**：支持“仅新消息”或“已加载消息”范围补翻。按队列排队执行，复用合法缓存，刷新后自动恢复视窗位置。
* **健壮的队列容错**：请求 30 秒硬超时限制；遇 `429 限流` 自动退避 5 秒，遇 `5xx 错误` 退避 2 秒，严防顶着限流连续轰炸 API。

### 交互与手动翻译
* **精准正文提取**：单条消息快捷翻译只提取当前消息正文，自动剥离引用预览或剧透内容。
* **滚动锁定技术**：翻译后触发短时间滚动锁，无论新消息涌入还是译文插入，视窗都能精准回到原消息附近。

### 完美的滚动稳定性 (Zero-Jumping)
* **消息锚点恢复**：自动翻译刷新时，系统会精准记录当前 `messageId` 及其距可视区域顶部的位置，并在刷新后重新定位，彻底解决自动翻译后视角跳到中间、新消息拉到底、历史补翻视角错乱等通病。
* **临时拦截机制**：在打开设置页 `Select` 或点击输入框时，临时拦截 `scrollIntoView`，避免面板无故跳动。

---

## 支持的翻译服务商

| Key | 服务商 | 需要 API Key | 特色与说明 |
| :--- | :--- | :---: | :--- |
| `googleapi` | **Google (gtx)** | **否** | 默认引擎，免配置，开箱即用 |
| `googlecloud` | **Google Cloud Translation** | 是 | 正式付费级高级 API |
| `microsoft` | **Azure Translator** | 是 | 微软官方正式付费级 API |
| `deepl` | **DeepL** | 是 | 行业公认高质翻译服务 |
| `deepseek` | **DeepSeek** | 是 | 优秀国产 AI 引擎，完美支持 AI 决策模式 |
| `oaicompat` | **自定义 API (OpenAI 兼容)** | 是 | 灵活度极高，可接入任何第三方大模型，支持 AI 决策模式 |
| `yandex` | **Yandex** | 否 | 免费好用的备用引擎 |

> 提示：
> 1. AI 决策模式（`autoTranslateDecisionMode=ai`）目前仅在 `deepseek` 和 `oaicompat` 下可用，这是目前规避同语言重复翻译最精准的方式。
> 2. 插件支持配置备用引擎 (`backup`)，当主引擎请求失败时会自动回退，保障翻译不中断。

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
1. 将 `DiscordAITranslator.plugin.js` 移动至插件目录：
   ```text
   %AppData%\BetterDiscord\plugins

```

2. 将下载好的 `BDFDB Library` 文件（`00BDFDB.plugin.js`）放置到同一目录下。
3. 打开 Discord -> `设置` -> `BetterDiscord` -> `插件`，开启 **DiscordAITranslator**。
4. 点击插件设置，选择你心仪的翻译服务商，配置语言后即可开始使用！

> 版本更新提示：替换新版插件后，请在插件页面重新开关一次，或者在 Discord 界面中直接按下 `Ctrl + R` 重载客户端。

### 推荐搭配：system24 主题

为了获得最极致的像素级视觉体验，推荐在 BetterDiscord 主题页中导入以下直链：

<https://refact0r.github.io/system24/build/system24.css>

---

## 项目结构与测试

```text
discord翻译/
├── DiscordAITranslator.plugin.js   # 主插件文件 (BetterDiscord 入口)
├── CHANGELOG.md                    # 版本变更日志
├── README.md                       # 项目说明
├── docs/
│   ├── architecture.md             # 架构基线：边界、状态流、已知缺陷
│   └── config-conflicts.md         # 配置冲突矩阵：UI文案 -> 持久化键映射
└── tests/                          # 自动化回归测试套件
    ├── translation-regression.test.js
    ├── protection-regression.test.js
    └── ...

```

### 本地测试校验

在本地对插件核心逻辑进行修改后，可通过以下命令快速跑通回归测试：

```powershell
node --check .\DiscordAITranslator.plugin.js
node tests\protection-regression.test.js
node tests\translation-regression.test.js
node tests\local-language-precheck.test.js
node tests\ai-decision-allcaps-regression.test.js

```

---

## 致谢

本插件基于 BetterDiscord 原版 `Translator` 插件进行二次开发。衷心感谢以下上游项目及作者的开源贡献：

* **上游原版**：[mwittrien/BetterDiscordAddons](https://github.com/mwittrien/BetterDiscordAddons) 的 `Translator` 核心。
* **运行时基建**：[mwittrien/BDFDB](https://mwittrien.github.io/downloader/?library) 库。
* **主题美化**：[refact0r/system24](https://github.com/refact0r/system24) 的极简美学设计。