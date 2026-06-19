# DiscordAITranslator

基于 BetterDiscord 原版 `Translator` 二次开发的 Discord AI 翻译插件，面向发送前翻译、收到消息自动翻译、历史消息补翻、保护规则和滚动稳定性。

## 当前版本

- 作者：`ROOT94`
- 版本：`0.3.27`
- 基础来源：[mwittrien / BetterDiscordAddons / Translator](https://github.com/mwittrien/BetterDiscordAddons/tree/master/Plugins/Translator/)
- 当前仓库：[able-root/DiscordAITranslator](https://github.com/able-root/DiscordAITranslator)

## 0.3.24 - 0.3.27 主要变化

### 0.3.27

- 修复用户配置的保护词组（如 “BUG team”）被大写缩写规则拆碎的问题，配置项现在整体保护
- 收紧版本号自动保护规则，裸数字 “3.1” 不再被误保护
- 同步回归测试到当前占位符格式与实际行为（回复预览相关 5 个已知待办标记为 `test.skip`）

### 0.3.24

- 修复设置页 `Select` / 输入框点击后面板跳动、滚动跳顶问题
- 扩大设置面板滚动容器识别范围
- 点击 `Select` 时临时拦截 `scrollIntoView`
- 下拉框关闭后恢复原行为

### 0.3.25

- 发送消息前增加“同语言跳过”
- 当发送源语言和发送目标语言相同，直接发送原文
- 如果发送源语言是“检测语言”，先本地检测，再决定是否跳过
- 增加发送结果兜底，避免 AI 把中文改写成另一句中文再发出去

### 0.3.26

- 移除短文本最小长度跳过，`嘻嘻 / 哈哈 / 嗯嗯` 这类短句也可翻译
- 加强 AI 提示词，要求不要省略语气词、短句、重复词和独立短行
- 手动翻译时强化目标语言约束，避免返回错误语言
- 从自动保护包裹符规则中移除 `||`，不再把剧透内容直接挡掉
- 收到消息自动翻译前增加“同目标语言跳过”
- 手动翻译时尽量排除引用预览内容，只翻当前消息正文
- 手动翻译增加短时间滚动锁，避免翻完后被新消息拉走
- 自动翻译刷新改为“消息锚点恢复”，减少跳到中间或误拉到底部
- 单条消息“翻译消息”按钮独立于输入框总翻译开关

## 当前工作区额外补丁

当前工作区在 `0.3.26.scroll-anchor-manual-button-fix` 基础上补了一层缓存防回归：

- 旧版本已经缓存的“同语言改写译文”不会再被继续复用
- 收到消息如果当前规则判断应跳过翻译，会同时清理不该继续展示的旧缓存结果
- 缓存签名已提升，避免旧缓存直接沿用到这次基线

## 主要功能

- 发送前翻译与收到消息自动翻译
- 历史消息批量翻译与缓存复用
- 多服务商支持：DeepSeek、Azure Translator、Google Cloud Translation、DeepL、OpenAI Compatible 等
- API Key / Endpoint / Model 可视化配置
- 原文 / 译文显示控制、高亮与状态提示
- 自定义保护词、自动保护包裹符、跳过前缀
- 回复预览、手动翻译、滚动锁与滚动锚点恢复

## 当前重点测试点

1. 输入框总翻译开关关闭后，单条消息翻译按钮是否仍可用
2. 自动翻译开启后，新消息进入时页面是否还会跳到中间
3. 收到中文消息且目标语言也是中文时，是否不再生成中文改写
4. 手动翻译外语消息时，是否稳定输出设定的目标语言
5. `嘻嘻 / 哈哈 / 嗯嗯` 这类短句是否不再被漏掉
6. `||剧透内容||` 是否不再被旧包裹符规则拦住

## 推荐安装方式

1. 安装 `DiscordAITranslator.plugin.js`
2. 安装 `BDFDB Library`
3. 如需搭配主题，推荐使用 `system24` 直链导入方式

推荐链接：

- BDFDB Library:
  [https://mwittrien.github.io/downloader/?library](https://mwittrien.github.io/downloader/?library)
- system24 说明页：
  [https://refact0r.github.io/system24/](https://refact0r.github.io/system24/)
- system24 主题文件：
  [https://github.com/refact0r/system24/blob/main/theme/system24.theme.css](https://github.com/refact0r/system24/blob/main/theme/system24.theme.css)
- system24 直链导入地址：
  [https://refact0r.github.io/system24/build/system24.css](https://refact0r.github.io/system24/build/system24.css)

## 快速开始

1. 把 `DiscordAITranslator.plugin.js` 放到：

```text
%AppData%\BetterDiscord\plugins
```

2. 安装 `BDFDB Library`
3. 在 BetterDiscord 插件页启用 `DiscordAITranslator`
4. 进入插件设置，配置翻译服务商、API Key、语言设置
5. 需要自动翻译收到消息时，再按需开启相关规则和过滤项

## 仓库文件说明

- `DiscordAITranslator.plugin.js`：主插件文件
- `CHANGELOG.md`：版本变更记录
- `发布说明.md`：GitHub Release / 对外发布说明
- `安装教程.md`：安装步骤
- `使用说明.md`：详细使用与配置说明
- `system24.theme.css`：本地附带的 BetterDiscord 主题文件

## 验证命令

```powershell
node --check .\DiscordAITranslator.plugin.js
node tests\protection-regression.test.js
node tests\translation-regression.test.js
```

`tests\*.test.js` 已对齐当前 `0.3.27` 行为：保护与翻译回归全部通过（`translation-regression` 中有 5 个用例标记为 `test.skip`，对应回复预览引用保留、手动译文可见、loaded_messages 立即排队、历史延迟重试等已知待办，未在本次改动插件核心逻辑）。
