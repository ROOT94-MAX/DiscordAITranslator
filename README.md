<div align="center">

# DiscordAITranslator

[简体中文](README.md) | [English](README.en.md)

[![平台](https://img.shields.io/badge/Platform-Discord-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.com)
[![加载器](https://img.shields.io/badge/Loader-BetterDiscord-4E5D94?style=flat-square)](https://betterdiscord.app)
[![版本](https://img.shields.io/badge/Version-1.0.0-success?style=flat-square)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest)
[![验证](https://img.shields.io/github/actions/workflow/status/ROOT94-MAX/DiscordAITranslator/verify.yml?branch=master&style=flat-square&label=verify)](https://github.com/ROOT94-MAX/DiscordAITranslator/actions/workflows/verify.yml)
[![下载量](https://img.shields.io/github/downloads/ROOT94-MAX/DiscordAITranslator/total?style=flat-square&color=yellow)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases)
[![许可证](https://img.shields.io/badge/License-GPL%20v2-blue?style=flat-square)](LICENSE)

一款 BetterDiscord 翻译插件，支持频道级收到消息翻译、发送前翻译、历史补翻、手动操作、转发消息和受保护文本。

**当前版本：v1.0.0** · **运行环境：BetterDiscord + BDFDB Library**

1.0.0 已正式发布，公开下载和更新说明以 [GitHub Releases](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest) 为准。缓存容量可在“高级”中设为 100～10,000 条（默认 500）；“诊断”提供版本、构建和服务状态，并可展开排障详情。

[下载最新版插件](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest/download/DiscordAITranslator.plugin.js) · [查看发布说明](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest) · [阅读技术文档](docs/README.md)

</div>

## 为什么使用它

DiscordAITranslator 把翻译控制放在当前会话附近，而不是使用一个影响全部频道的全局开关。

- **频道级控制：**右键输入框翻译图标，只为当前频道开启或暂停自动翻译。
- **统一翻译链：**实时消息、历史消息、手动操作、回复、embed、线程标题和转发快照使用同一套状态与恢复规则。
- **历史阅读保护：**历史结果按批次提交，结合阅读行锚点和用户意图判断，减少上滚查看时的干扰。
- **结果完整性：**批量缺项、错误语言、保护占位符损坏和供应商失败会进入修复或备用路径，而不是静默消失。
- **单文件安装：**模块化源码会确定性构建为一份可读的 BetterDiscord 插件文件。

## 效果展示

以下为合成示例，不包含真实聊天、账号或频道信息。

| 原文 | 翻译结果（目标语言：简体中文） |
| --- | --- |
| Please review the update tomorrow. | 请明天查看更新。 |
| Keep `npm run build` unchanged. | 保持 `npm run build` 不变。 |

收到的消息显示译文与翻译标记；原文是否同时显示取决于设置。实际结果由所选供应商返回。

## 核心功能

- **收到消息翻译：**自动翻译按频道隔离，每个频道可设置语言并可选覆盖主供应商。
- **发送消息翻译：**发送前翻译，可选择是否附带原文，也支持通过前缀指定目标语言。
- **历史消息补翻：**按范围、数量和时间窗口翻译已加载消息；历史工作不会抢占新实时消息。
- **手动翻译：**即使频道自动翻译关闭，也可以从消息右键菜单翻译或恢复单条消息。
- **转发消息支持：**识别转发快照正文，并统一处理翻译、原文显示、取消和恢复。
- **回复、embed 与标题：**回复预览、embed、论坛帖子和线程标题跟随所属频道翻译状态。
- **原文保护：**在供应商往返过程中保护自定义术语、包裹符、代码式文本、剧透和跳过前缀。
- **主备供应商：**频道可覆盖主供应商，凭证和备用供应商仍保持全局配置。
- **五页设置中心：**服务商、翻译策略、通用、高级和诊断各自成页；语言可搜索，原文子项会跟随父开关联动。
- **可复制诊断：**集中显示版本、构建、供应商和重绘状态，并提供只读更新检查与一键复制。
- **累计历史状态：**浮动胶囊按频道累计唯一已翻译消息，跨多个历史批次继续增长。
- **视口保护：**阅读历史消息时尽量保持当前阅读位置；用户正在滚动时延后历史译文显示，避免把视图拉回旧位置。

## 支持的翻译服务商

| Key | 服务商 | 凭证 | 说明 |
| --- | --- | :---: | --- |
| `googleapi` | Google Free | 无 | 免密钥默认选项；按编码后的查询大小切片 |
| `googlecloud` | Google Cloud Translation | API Key | Google Cloud 官方翻译服务 |
| `microsoft` | Azure Translator | API Key | 支持可选 Azure Region |
| `deepl` | DeepL API | API Key | DeepL 官方翻译 API |
| `deepseek` | DeepSeek | API Key | 支持 AI 翻译、批量和决策模式 |
| `gemini` | Google Gemini | API Key | 原生 `generateContent` 接口 |
| `oaicompat` | 自定义服务商 | 端点、模型；按协议提供凭证 | 可接入自建或第三方服务，协议选项见下文 |
| `baidu` | Baidu | App ID 与 Secret | 保留的兼容供应商，使用供应商专用签名 |

上表只列出当前可以新配置和推荐使用的服务。OpenAI 和 Papago 的旧适配器仍保留在运行时中，用于读取已有配置，但已经归档：新安装不会在服务商列表中提供，也不作为 1.0.0 的新服务推荐。已有配置继续按原协议运行；需要新接入 AI 服务时，请使用 Gemini、DeepSeek 或自定义服务商。

自定义服务商支持 OpenAI Chat Completions、OpenAI Responses、Ollama、Gemini 和 Anthropic Messages 协议。端点和模型需与所选服务匹配；Ollama 原生协议的 API Key 可选，是否需要鉴权由你的服务端决定。

供应商凭证、端点、模型、全局主供应商默认值和备用供应商都在 BetterDiscord 设置中配置。频道只能覆盖自己的主供应商和语言选择。准确行为见[供应商契约](docs/providers.md)。

## 快速安装

### 前置条件

1. 桌面版 Discord 客户端。
2. [BetterDiscord](https://betterdiscord.app/)。
3. [BDFDB Library](https://mwittrien.github.io/downloader/?library)。

### 安装步骤

1. [下载 `DiscordAITranslator.plugin.js`](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest/download/DiscordAITranslator.plugin.js)。
2. 从上面的 BDFDB Library 地址下载 `0BDFDB.plugin.js`。
3. 在 BetterDiscord 的插件页打开 **插件文件夹**，把两个文件放进去。Windows 默认路径为 `%AppData%\BetterDiscord\plugins`。
4. 打开 Discord → **用户设置** → **BetterDiscord** → **插件**。
5. 先启用 BDFDB Library，再启用 DiscordAITranslator。
6. 打开插件设置，配置翻译供应商以及收发语言。

替换新版插件后，请重新开关一次插件，或使用 `Ctrl + R` 重载 Discord。

### 完成第一次翻译

1. 在插件设置的 **服务商** 页选择主供应商。Google Free 无需密钥；其他服务按所选协议的要求填写凭证。自定义服务还需填写实际端点和模型，示例地址不能直接使用。
2. 在 **翻译策略** 页设置收到消息与发送消息各自的源语言、目标语言；收到消息通常可使用自动检测源语言。
3. 回到需要翻译的频道，左键输入框旁的翻译图标，核对该频道的语言和供应商；右键图标开启该频道自动翻译。
4. 用普通测试句确认译文和翻译标记出现。只想翻译一条消息时，可保持自动翻译关闭，使用消息右键菜单。

不需要编译源码即可安装发行插件。仓库分支可能包含尚未发布的变更；下载文件的版本与构建号可在 **诊断** 页核对，发布内容以对应 Release 说明为准。

## 使用方法

- **右键输入框翻译图标：**开启或暂停当前频道自动翻译。
- **左键输入框翻译图标：**打开当前频道供应商和语言控制。
- **打开插件全局设置：**通过五个标签页配置供应商、翻译策略、显示、文本保护和诊断。
- **打开消息右键菜单：**手动翻译、恢复、检测语言或翻译选中文本。
- **查看历史状态胶囊：**查看频道累计进度，并重试符合条件的失败项。

自动翻译没有全局默认开启开关；只有用户明确开启的频道才会自动翻译。

### 暂停、更新与卸载

关闭频道自动翻译会取消该频道待处理的自动任务，并恢复当前显示的收到消息、回复、embed 和标题原文，包括此前手动显示的译文。关闭后仍可手动翻译单条消息；有效缓存会保留。

更新时备份自己的插件配置，替换同名 `.plugin.js` 文件，再重新开关插件或重载客户端。卸载时先停用插件，再从插件页移除它。备份和配置含有个人设置或凭证，请保留在自己的机器上。

### 常见问题

| 现象 | 先检查 |
| --- | --- |
| 启用插件后没有自动翻译 | 当前频道是否右键开启；语言方向、消息来源筛选和历史范围是否符合预期 |
| 翻译报错或超时 | 服务商连接测试、凭证、实际端点和模型、额度及网络；必要时配置全局备用供应商 |
| 只翻译了部分历史消息 | 数量是上限，插件处理已加载或缓存的合格消息，不会无限翻页补齐数量 |
| 关闭自动翻译后单条消息仍可翻译 | 手动操作独立可用，这是预期行为 |
| 更新后界面或行为不一致 | 在诊断页核对版本和构建，确认只启用了一份插件，再重载客户端 |

仍有问题时，提交 [Issue](https://github.com/ROOT94-MAX/DiscordAITranslator/issues)，附上版本、构建号、使用的供应商类别、复现步骤和合成测试句。诊断报告复制后先检查内容，不要公开密钥、私人端点、真实聊天或配置文件；安全问题见 [安全问题反馈](SECURITY.md)。

### 数据与隐私

待翻译内容会发送给所选翻译服务；触发备用路径时，也可能发送给备用服务。默认的“本地优先”语言检测在本地判断不足时会请求 Google 检测；可在设置中选择“仅本地”。“仅本地”限制的是语言检测，翻译是否联网仍由供应商决定。

文本保护用于保留术语和格式，不能替代对敏感内容的审查。凭证在插件设置中填写，切勿写入源码或提交到 Issue。检测与请求边界见[供应商契约](docs/providers.md)。

## 已知限制

- Discord 内部组件、Store 和转发快照结构不是公开 API，客户端更新后可能需要重新适配。
- 译文结果只做有界 Store 定向重试，不再扩大为整聊天区重绘。插件启停和应用全局设置仍属于独立宿主生命周期操作，可能短暂刷新输入框。
- 译文会增加消息行和列表总高度；插件保护阅读消息位置，但滚动条滑块仍可能移动或改变大小。
- 免密钥和第三方供应商可能存在额度、限流、负载大小、区域或输出转换限制，这些不完全由插件控制。
- 即使自动化测试通过，涉及 Discord 渲染边界的变化仍需要 PTB 实际观察。

遇到问题时可按[中文调试指南](docs/cookbook/debugging.zh-CN.md)或其[英文版本](docs/cookbook/debugging.md)定位；历史原因与当前观察项分别链接到对应文档。

## 开发与验证

仓库在 `src/` 中维护模块化源码，并确定性生成一份可安装插件。

```text
src/plugin/index.js
        -> scripts/build-plugin.mjs
        -> DiscordAITranslator.plugin.js
```

要求 Node.js 20 或更高版本。

```powershell
npm ci
npm run build
npm run verify
```

`npm run verify` 会检查公开文件隐私规则、Agent Notes 结构与归档、源码/产物一致性、JavaScript 语法、架构约束、发布元数据、双语文档入口和完整单元/契约/集成测试。请勿手工编辑生成的插件文件。

贡献规则见 [开发与贡献指南](CONTRIBUTING.md)；仓库不变量和当前职责边界见[架构文档](docs/architecture.zh-CN.md)。

## 技术文档

- 产品行为：[功能与行为说明](docs/product.md)
- 设置归属：[设置说明与配置迁移](docs/settings.md)
- 供应商契约：[翻译服务接口约定](docs/providers.md)
- 架构：[中文模块架构说明](docs/architecture.zh-CN.md) | [English](docs/architecture.md)
- 调试操作指南：[中文故障排查指南](docs/cookbook/debugging.zh-CN.md) | [English](docs/cookbook/debugging.md)
- 可选开发工具：[Discord MCP 调试与复现](docs/cookbook/discord-mcp.zh-CN.md)，用于客户端现场排查，普通安装无需配置。
- 未关闭的观察边界：[已知限制与待验证事项](docs/recovery-plan.md)
- 发布历史：[版本更新记录](CHANGELOG.md)

## 致谢

- BetterDiscord Translator 原始基础：[mwittrien/BetterDiscordAddons](https://github.com/mwittrien/BetterDiscordAddons)
- 运行时库：[BDFDB](https://mwittrien.github.io/downloader/?library)

## 开源协议

本项目使用 [GNU General Public License v2.0](LICENSE)。再分发和衍生作品必须保持 GPL v2.0 兼容；上游 Translator 基础同样采用 GPL v2.0。
