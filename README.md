<div align="center">

# DiscordAITranslator

[简体中文](README.md) | [English](README.en.md)

[![平台](https://img.shields.io/badge/Platform-Discord-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.com)
[![加载器](https://img.shields.io/badge/Loader-BetterDiscord-4E5D94?style=flat-square)](https://betterdiscord.app)
[![版本](https://img.shields.io/badge/Version-0.3.41-success?style=flat-square)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest)
[![验证](https://img.shields.io/github/actions/workflow/status/ROOT94-MAX/DiscordAITranslator/verify.yml?branch=master&style=flat-square&label=verify)](https://github.com/ROOT94-MAX/DiscordAITranslator/actions/workflows/verify.yml)
[![下载量](https://img.shields.io/github/downloads/ROOT94-MAX/DiscordAITranslator/total?style=flat-square&color=yellow)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases)
[![许可证](https://img.shields.io/badge/License-GPL%20v2-blue?style=flat-square)](./LICENSE)

一款 BetterDiscord 翻译插件，支持频道级收到消息翻译、发送前翻译、历史补翻、手动操作、转发消息和受保护文本。

**当前版本：v0.3.41** · **运行环境：BetterDiscord + BDFDB Library**

[下载最新版插件](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest/download/DiscordAITranslator.plugin.js) · [查看发布说明](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest) · [阅读技术文档](./docs/README.md)

</div>

## 为什么使用它

DiscordAITranslator 把翻译控制放在当前会话附近，而不是使用一个影响全部频道的全局开关。

- **频道级控制：**右键输入框翻译图标，只为当前频道开启或暂停自动翻译。
- **统一翻译链：**实时消息、历史消息、手动操作、回复、embed、线程标题和转发快照使用同一套状态与恢复规则。
- **历史阅读保护：**历史结果按批次提交，结合阅读行锚点和用户意图判断，减少上滚查看时的干扰。
- **结果完整性：**批量缺项、错误语言、保护占位符损坏和供应商失败会进入修复或备用路径，而不是静默消失。
- **单文件安装：**模块化源码会确定性构建为一份可读的 BetterDiscord 插件文件。

## 效果展示

| 原始会话 | 翻译后的会话 |
| --- | --- |
| ![原始会话](images/chat-overview.png) | ![翻译后的会话](images/translation-effect.png) |

| 供应商配置 | 语言与历史设置 |
| --- | --- |
| ![供应商配置](images/settings-service.png) | ![语言与历史设置](images/settings-language.png) |

## 核心功能

- **收到消息翻译：**自动翻译按频道隔离，每个频道可设置语言并可选覆盖主供应商。
- **发送消息翻译：**发送前翻译，可选择是否附带原文，也支持通过前缀指定目标语言。
- **历史消息补翻：**按范围、数量和时间窗口翻译已加载消息；历史工作不会抢占新实时消息。
- **手动翻译：**即使频道自动翻译关闭，也可以从消息右键菜单翻译或恢复单条消息。
- **转发消息支持：**识别转发快照正文，并统一处理翻译、原文显示、取消和恢复。
- **回复、embed 与标题：**回复预览、embed、论坛帖子和线程标题跟随所属频道翻译状态。
- **原文保护：**在供应商往返过程中保护自定义术语、包裹符、代码式文本、剧透和跳过前缀。
- **主备供应商：**频道可覆盖主供应商，凭证和备用供应商仍保持全局配置。
- **累计历史状态：**浮动胶囊按频道累计唯一已翻译消息，跨多个历史批次继续增长。
- **视口保护：**优先尝试单行重绘；用户正在滚动时延迟历史显示，只在用户意图未改变时恢复阅读行。

## 支持的翻译服务商

| Key | 服务商 | 凭证 | 说明 |
| --- | --- | :---: | --- |
| `googleapi` | Google Free | 无 | 免密钥默认选项；按编码后的查询大小切片 |
| `googlecloud` | Google Cloud Translation | API Key | Google Cloud 官方翻译服务 |
| `microsoft` | Azure Translator | API Key | 支持可选 Azure Region |
| `deepl` | DeepL API | API Key | DeepL 官方翻译 API |
| `deepseek` | DeepSeek | API Key | 支持 AI 翻译、批量和决策模式 |
| `openai` | OpenAI API | API Key | Responses API，支持单条、批量和决策流程 |
| `gemini` | Google Gemini | API Key | 原生 `generateContent` 接口 |
| `oaicompat` | OpenAI 兼容端点 | Endpoint、Model、Key | 可接入自建或第三方兼容服务 |
| `yandex` | Yandex | API Key | 保留的兼容供应商 |

供应商凭证、端点、模型、全局主供应商默认值和备用供应商都在 BetterDiscord 设置中配置。频道只能覆盖自己的主供应商和语言选择。准确行为见[供应商契约](docs/providers.md)。

## 快速安装

### 前置条件

1. 桌面版 Discord 客户端。
2. [BetterDiscord](https://betterdiscord.app/)。
3. [BDFDB Library](https://mwittrien.github.io/downloader/?library)。

### 安装步骤

1. [下载 `DiscordAITranslator.plugin.js`](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest/download/DiscordAITranslator.plugin.js)。
2. 从上面的 BDFDB Library 地址下载 `0BDFDB.plugin.js`。
3. 把两个文件放进 `%AppData%\BetterDiscord\plugins`。
4. 打开 Discord → **用户设置** → **BetterDiscord** → **插件**。
5. 先启用 BDFDB Library，再启用 DiscordAITranslator。
6. 打开插件设置，配置翻译供应商以及收发语言。

替换新版插件后，请重新开关一次插件，或使用 `Ctrl + R` 重载 Discord。

## 使用方法

- **右键输入框翻译图标：**开启或暂停当前频道自动翻译。
- **左键输入框翻译图标：**打开当前频道供应商和语言控制。
- **打开插件全局设置：**配置供应商凭证、备用供应商、检测策略、原文显示、文本保护和历史范围。
- **打开消息右键菜单：**手动翻译、恢复、检测语言或翻译选中文本。
- **查看历史状态胶囊：**查看频道累计进度，并重试符合条件的失败项。

自动翻译没有全局默认开启开关；只有用户明确开启的频道才会自动翻译。

## 已知限制

- Discord 内部组件、Store 和转发快照结构不是公开 API，客户端更新后可能需要重新适配。
- 单行确认或回复宿主未满足显示事务时，仍会回退到整聊天区重绘，因此偶尔可能看到轻微输入框图标闪烁。
- 译文会增加消息行和列表总高度；插件保护阅读消息位置，但滚动条滑块仍可能移动或改变大小。
- 免密钥和第三方供应商可能存在额度、限流、负载大小、区域或输出转换限制，这些不完全由插件控制。
- 即使自动化测试通过，涉及 Discord 渲染边界的变化仍需要 PTB 实际观察。

已证实原因、失败路线和剩余观察项见[中文现场调试交接](docs/field-debugging-guide.zh-CN.md)或其[英文版本](docs/field-debugging-guide.md)。

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

`npm run verify` 会检查源码/产物一致性、JavaScript 语法、架构约束、发布元数据、双语文档入口和完整单元/契约/集成测试。请勿手工编辑生成的插件文件。

贡献规则和仓库不变量见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [AGENTS.md](./AGENTS.md)。

## 技术文档

- 产品行为：[docs/product.md](docs/product.md)
- 设置归属：[docs/settings.md](docs/settings.md)
- 供应商契约：[docs/providers.md](docs/providers.md)
- 架构：[English](docs/architecture.md) | [简体中文](docs/architecture.zh-CN.md)
- 现场调试交接：[English](docs/field-debugging-guide.md) | [简体中文](docs/field-debugging-guide.zh-CN.md)
- 当前恢复计划：[docs/recovery-plan.md](docs/recovery-plan.md)
- 发布历史：[CHANGELOG.md](./CHANGELOG.md)

## 致谢

- BetterDiscord Translator 原始基础：[mwittrien/BetterDiscordAddons](https://github.com/mwittrien/BetterDiscordAddons)
- 运行时库：[BDFDB](https://mwittrien.github.io/downloader/?library)

## 开源协议

本项目使用 [GNU General Public License v2.0](./LICENSE)。再分发和衍生作品必须保持 GPL v2.0 兼容；上游 Translator 基础同样采用 GPL v2.0。
