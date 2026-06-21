# DiscordAITranslator 架构基线

## 1. 文档目的

这份文档描述当前仓库里 `DiscordAITranslator.plugin.js` 的**实际实现架构**，目标不是介绍“理想设计”，而是把现状、状态流、配置流、渲染流和已知缺陷一次性梳理清楚，作为后续修复与重构的基线。

当前仓库的真实主实现只有一个核心文件：

- `DiscordAITranslator.plugin.js`

测试和说明文档是辅助材料：

- `tests/translation-regression.test.js`
- `tests/protection-regression.test.js`
- `README.md`

`BetterDiscordAddons` 与 `BetterDiscordAddons-sparse` 目录可用于参考上游来源，但不是当前插件的主实现入口。

## 2. 当前实现边界

### 2.1 运行环境

插件运行在 BetterDiscord + BDFDB 生态上，依赖以下能力：

- `window.BDFDB_Global`
- `BDFDB.DataUtils` 进行持久化
- `BDFDB.PatchUtils` 挂补丁
- `BDFDB.MessageUtils.rerenderAll()` 触发消息重渲染
- `BDFDB.LibraryComponents.*` 构建设置 UI

### 2.2 文件规模

当前主文件约 6800+ 行，所有职责都集中在一个插件类中：

- UI 入口
- 插件生命周期
- 状态持久化
- 运行时缓存
- 自动翻译队列
- 文本保护规则
- 消息/引用/embed 渲染
- 多翻译引擎适配

这意味着当前架构的首要问题不是“某个模块太弱”，而是**模块边界没有被真正拆出来**。

## 3. 插件生命周期

### 3.1 启动路径

插件启动后主要经过以下节点：

1. `onLoad()`
2. 初始化默认配置 `this.defaults`
3. 定义语言表、引擎表、内存状态对象
4. `onStart()`
5. 对 Discord/BDFDB 的消息相关模块挂补丁
6. `forceUpdateAll()`
7. 重新加载持久化数据，清空运行时队列与临时状态
8. `setLanguages()`
9. `BDFDB.PatchUtils.forceAllUpdates(this)` 与 `BDFDB.MessageUtils.rerenderAll()`

### 3.2 关闭与设置面板关闭

- `onStop()` 负责清理定时器，但不会做结构化状态迁移。
- `onSettingsClosed()` 在 `this.SettingsUpdated` 存在时调用 `forceUpdateAll()`。

这意味着：

- BetterDiscord 齿轮设置面板关闭时，会执行一次近似“软重载”。
- 旧弹窗设置与右键频道开关并不一定走同一条“设置关闭后统一刷新”路径。
- 某些状态变化如果只改了持久化层，而没有立刻触发正确的运行时清理，就可能在下一次 `forceUpdateAll()` 或消息重渲染后表现出“看起来像被改回去”。

## 4. UI 结构

当前插件有三类用户入口，它们不是同一个职责层。

### 4.1 聊天框翻译按钮 `TranslateButtonComponent`

职责：

- 左键打开旧弹窗设置 `TranslateSettingsComponent`
- 右键直接调用 `toggleTranslation(channelId)`

特点：

- 这是**频道即时控制入口**
- 它既像“打开设置”，又像“翻译总闸按钮”
- 右键的动作直接改变 `translationEnabledStates`

风险：

- 同一个视觉按钮同时承载“打开设置”和“开启/关闭频道自动翻译”两种语义
- Tooltip 文案与真实运行状态容易被误读

### 4.2 旧弹窗设置 `TranslateSettingsComponent`

职责：

- 语言检测辅助
- 发送/接收的语言选择
- 引擎选择
- 少量通用开关
- 当前频道自动翻译开关

它能直接改的状态包括：

- `settings.choices`
- `settings.engines`
- `channelLanguages`
- `guildLanguages`
- `translationEnabledStates`

它**不完整暴露**以下新规则：

- `receivedAutoTranslatePreset`
- `receivedAutoTranslateScope`
- `minimumAutoTranslateLength`
- `skipMixedReceivedMessages`
- `receivedAutoTranslateSourceLanguages`

因此旧弹窗并不是“完整设置面板”，而是“频道即时操作 + 早期配置入口”的混合体。

### 4.3 BetterDiscord 齿轮设置面板 `getSettingsPanel()`

职责更接近全局配置中心，包含：

- 翻译服务
- 语言设置
- 接收消息自动翻译规则
- 显示与交互
- 高级功能

它能改的状态范围远大于旧弹窗，包括：

- `settings.general.*`
- `settings.filters.*`
- `settings.choices.*`
- `settings.engines.*`
- `authKeys`
- `channelLanguages`
- `guildLanguages`

### 4.4 UI 结构的核心问题

当前 UI 不是“一套设置面板的不同入口”，而是**两套演化阶段不同的设置模型并存**：

- 旧弹窗偏即时、频道级
- 新面板偏全局、规则级

但代码没有把这两者的职责边界正式声明出来，导致用户会自然地把它们当成同一个设置系统。

## 5. 状态与持久化模型

## 5.1 持久化状态

以下数据通过 `BDFDB.DataUtils.save/load` 存储：

| Key | 作用 | 主要写入点 | 主要读取点 |
| --- | --- | --- | --- |
| `favorites` | 语言收藏 | 语言选择 UI | `forceUpdateAll()`、语言选择器 |
| `authKeys` | 各翻译服务的密钥、endpoint、model | 设置面板 | 引擎验证、模型列表、翻译请求 |
| `channelLanguages` | 频道级语言选择覆盖 | 旧弹窗 / 新面板 | `getLanguageChoice()` |
| `guildLanguages` | 服务器级语言选择覆盖 | 旧弹窗 / 新面板 | `getLanguageChoice()` |
| `settings.general` | 显示与交互类全局设置 | 新面板、部分旧弹窗通用开关 | 渲染路径、按钮行为 |
| `settings.filters` | 自动翻译规则 | 新面板 | 自动翻译判定链 |
| `settings.choices` | 全局语言选择默认值 | 新面板 / 旧弹窗 | 发送/接收翻译流程 |
| `settings.engines` | 主/备翻译引擎 | 新面板 / 旧弹窗 | `translateText()` |
| `translationCache` | 持久化翻译缓存 | `persistTranslationCacheEntry()` | `getCachedReceivedTranslation()` |
| `translationEnabledStates` | 频道或全局翻译开关状态 | `toggleTranslation()` | `isTranslationEnabled()` |

### 5.2 运行时内存状态

以下对象只在当前运行进程中存在：

| Runtime State | 作用 |
| --- | --- |
| `translatedMessages` | 当前已显示在界面上的翻译态消息 |
| `oldMessages` | 原始消息快照与原始内容数据 |
| `replyPreviewTranslations` | 回复引用预览的显示缓存 |
| `queuedReplyPreviewTranslations` | 回复预览待翻译队列 |
| `autoTranslationQueue` | 接收消息自动翻译队列 |
| `queuedAutoTranslations` | 已进入自动翻译队列的消息索引 |
| `suppressedAutoTranslations` | 手动取消后暂时禁止自动重进的消息索引 |
| `autoTranslationChannelStates` | 每个频道的自动翻译会话状态 |
| `lastAutoTranslationChannelId` | 最近进入自动翻译会话的频道 |
| `isTranslating` / `isBackgroundTranslating` | 前台/后台翻译忙碌状态 |

### 5.3 `forceUpdateAll()` 的实际作用

`forceUpdateAll()` 不是简单刷新 UI，而是做了三件事：

1. 重载持久化数据
2. 清空多组运行时队列与临时状态
3. 强制所有补丁视图重新渲染

它会直接重置：

- `autoTranslationQueue`
- `queuedAutoTranslations`
- `suppressedAutoTranslations`
- `autoTranslationChannelStates`
- `replyPreviewTranslations`
- `queuedReplyPreviewTranslations`

这说明当前插件并没有把“持久化配置”和“运行时会话状态”做严格分层，很多行为靠一次全量刷新来重新对齐。

## 6. 语言选择模型

语言选择有三层来源：

1. `channelLanguages[channelId][place][direction]`
2. `guildLanguages[guildId][place][direction]`
3. `settings.choices[place][direction]`

读取入口是：

- `getLanguageChoice(direction, place, channelId)`

写入入口是：

- `saveLanguageChoice(choice, direction, place, channelId)`

关键点：

- `place` 分为 `sent` 和 `received`
- `direction` 分为 `input` 和 `output`
- 语言覆盖本身与 `translationEnabledStates` 完全独立

这意味着“频道翻译开关关闭”并不会重置该频道的语言选择；下次重新启用时，会继续沿用旧的频道/服务器/全局语言覆盖。

## 7. 接收消息翻译流水线

接收消息的主链路如下：

1. `processMessages(e)`
2. `prepareAutoTranslationChannelSession(channelId)`
3. 遍历 `channelStream`
4. `checkMessage(stream, message, channel, options)`
5. 若命中已显示翻译，刷新显示
6. 若命中缓存翻译，`applyStoredTranslationToMessage()`
7. 若需要自动翻译，`queueAutoTranslateMessage()`
8. `processAutoTranslationQueue()`
9. `translateMessage(message, channel, {auto: true})`
10. `translateText()`
11. `applyStoredTranslationToMessage()`
12. `persistTranslationCacheEntry()`
13. `scheduleTranslationRerender()`

### 7.1 自动翻译判定链

自动翻译是否进入队列取决于：

- `isTranslationEnabled(channel.id)`
- `isOwnMessage(message)`
- `suppressedAutoTranslations[message.id]`
- `translatedMessages[message.id]`
- `queuedAutoTranslations[message.id]`
- `hasTranslatableMessageContent()`
- `analyzeTextForAutoTranslate()`
- `shouldSkipMixedReceivedMessages()`
- `shouldSkipSameLanguageReceivedMessages()`

### 7.2 当前实现的关键事实

- `analyzeTextForAutoTranslate()` 只决定**这条消息要不要自动排队**
- 它不修改真正送给引擎的文本
- 它不保护混合句里的英文片段
- 它不影响手动翻译路径
- 它不影响缓存命中后的显示

这就是“中英混合判断存在，但英文仍被翻译”的直接架构原因。

## 8. 发送消息翻译流水线

发送路径与接收路径不同：

### 8.1 自动发送翻译入口

发送文本框在以下补丁路径上介入：

- `processChannelTextAreaContainer`
- `processChannelTextAreaEditor`
- `processChannelTextAreaButtons`

发送前翻译大致流程：

1. 读取文本框值
2. `shouldAutoTranslateSentMessage(text, channelId, callback)`
3. `translateText(text, messageTypes.SENT, ...)`
4. 根据 `sendOriginalMessage` 决定是否把原文拼回发送内容

### 8.2 发送路径使用的规则

发送路径主要依赖：

- `settings.choices.sent.*`
- `settings.filters.autoTranslateSourceLanguages`
- `settings.general.sendOriginalMessage`

注意：

- `autoTranslateSourceLanguages` 只影响“发送前是否要翻”
- 它和 `receivedAutoTranslateSourceLanguages` 是两套完全不同的配置

## 9. 手动翻译流水线

手动翻译入口包括：

- 消息右键菜单
- 消息操作按钮
- 快捷翻译按钮

手动翻译调用：

- `translateMessage(message, channel, options = {})`

手动翻译与自动翻译的主要差异：

- 手动翻译不会走 `shouldAutoTranslateReceivedMessage()`
- 手动翻译不会被“跳过中英混合消息”拦住
- 手动翻译会写入 `translatedMessages`
- 若缓存命中，会直接 `applyStoredTranslationToMessage()`

因此“自动翻译规则关了，但我手动点过的消息仍可能继续以译文显示”在当前架构里是允许发生的，只是 UI 没有把这种区别说清楚。

## 10. 引用预览与 embed 路径

### 10.1 引用预览路径

引用预览走独立链路：

- `processMessageReply(e)`
- `getReplyPreviewTranslation()`
- `createReplyPreviewTranslationData()`
- `queueReplyPreviewTranslation()`
- `getReplyPreviewDisplayContent()`
- `getReplyPreviewFallbackContent()`

关键点：

- 回复预览既可能读 `translatedMessages`
- 也可能读 `replyPreviewTranslations`
- 还可能从 `translationCache` 回填

这说明引用预览不是主消息渲染的“附属视图”，而是**另一个小型显示系统**。

### 10.2 Embed 路径

Embed 走 `processEmbed(e)`，它依赖：

- `translatedMessages[message_id].embeds`
- `originalDescription`
- `originalTitle`
- `originalFields`
- `originalFooter`

Embed 的恢复逻辑与主消息正文、引用预览都不同，因此也是一条独立显示恢复路径。

### 10.3 显示层问题

当前显示层至少有四条独立分支：

- 主消息正文 `processMessageContent()`
- 回复预览 `processMessageReply()`
- Embed `processEmbed()`
- 旧消息恢复 `oldMessages` + `checkMessage()`

这些路径没有共享统一的“显示状态判定函数”，这就是自动翻译关闭后问题反复出现在不同区域的架构根因。

## 11. 文本保护与例外机制

真正送入翻译引擎前，文本会先经过：

1. `removeExceptions()`
2. `translateText()`
3. `addExceptions()`

### 11.1 当前已保护的内容

`removeExceptions()` 及其子函数会保护：

- 代码块 `protectCodeBlockSegments()`
- 自定义包裹符 `protectWrappedTextSegments()`
- 自动识别内容 `protectAutoDetectedSegments()`
  - 邮箱
  - URL
  - 域名
  - Discord mention / emoji
  - 多个模型名与品牌名
- 手动配置的保护词 `protectConfiguredTerms()`
- Emoji / mention / 特殊对象

### 11.2 当前没有保护的内容

它**不会自动保护**：

- 中文句子里的普通英文短语
- 中文句子里的任意 latin 片段
- 双语混排里用户希望保留的英文术语，除非：
  - 被保护词命中
  - 被包裹符命中
  - 被自动识别规则命中

因此当前“跳过中英混合消息”和“保护中英混排英文片段”是两件独立且未打通的事情。

## 12. 翻译引擎适配层

### 12.1 引擎注册表

引擎能力统一由 `translationEngines` 描述，字段包括：

- `name`
- `auto`
- `funcName`
- `languages`
- 可选的 `key`
- 可选的 `endpoint`
- 可选的 `model`
- 可选的 `parser`
- 可选的 `premium`

### 12.2 公共适配契约

运行时依赖的公共接口包括：

- `validTranslator(key, input, output, specialCase)`
- `translateText(text, place, callback, forcedOutputLanguage, options)`
- `normalizeApiEndpoint(engineKey, endpoint)`
- `validateEngineConfig(engineKey)`
- `fetchModelCatalog(engineKey)`

### 12.3 Provider 特例

不同 provider 在以下层面存在分歧：

- endpoint 规范化规则不同
- language code mapping 不同
- 是否需要 API key 不同
- 是否支持 model catalog 不同
- 检测源语言的返回结构不同

这层本身结构相对清晰，但仍与 UI 和持久化紧耦合，因为所有 provider 配置都直接写在同一插件类里。

## 13. 根因审计结论

### P0 架构问题

1. 设置语义没有统一建模
   - `translationEnabledStates` 管频道开关
   - `settings.filters` 管自动翻译规则
   - `settings.general` 管显示与交互
   - UI 没有正式把这三层区分成不同概念

2. 两套设置入口并存，但没有单一真值说明
   - 旧弹窗偏频道即时控制
   - 新面板偏全局规则配置
   - 两边都能动“翻译相关状态”，但可见字段和用户预期不同

3. `receivedAutoTranslatePreset` 已经退出运行时，也不再保留 helper 入口
   - 当前运行时的 `shouldSkipMixedReceivedMessages()`
   - `shouldSkipSameLanguageReceivedMessages()`
   - `shouldDropSimilarTranslations()`
   已经只读取细粒度 `settings.filters.*`
   - 当前只剩旧持久化配置值与未清理文案的历史包袱，说明这层模型已经不再生效，但仓库内仍有收尾空间
   - 但新界面已不再把 preset 作为一等设置暴露

### P1 行为问题

1. 自动翻译关闭后的显示恢复没有统一状态机
   - 主消息
   - 引用预览
   - embed
   - 缓存命中
   是独立路径

2. 混合语言规则只做准入，不做内容保护
   - 只影响“自动翻译是否进队列”
   - 不影响实际翻译请求文本的构造与保护

3. `usePerChatTranslation` 会改变 `translationEnabledStates` 的解释方式
   - 开启时保存 `channelId`
   - 关闭时保存 `"global"`
   - 当前没有迁移逻辑说明

### P2 维护问题

1. 单文件过大，职责高度耦合
2. 文案表有重复定义和演进遗留
3. 运行时行为过度依赖 `forceUpdateAll()` 做重同步

## 14. 重构蓝图

后续修复建议按以下顺序推进：

### 14.1 先拆状态语义

正式把状态分成三类：

- 频道启用状态
- 自动翻译策略状态
- 显示策略状态

三者必须有不同命名、不同 UI 标签、不同读取入口。

### 14.2 再拆 UI 职责

- 旧弹窗只保留当前频道即时控制
- BetterDiscord 设置只保留全局/规则配置
- 不再让同一语义在两套 UI 里以不同方式重复表达

### 14.3 再处理 preset

二选一：

- 重新把 `receivedAutoTranslatePreset` 作为正式一等配置展示出来
- 或继续沿当前方向，彻底删除 legacy preset 的旧文案、历史配置兼容分支和相关死代码，只保留细粒度 `filters.*`

### 14.4 再统一显示状态机

把下列路径统一到同一个判定函数：

- 主消息正文
- reply preview
- embed
- cache restore

目标是让“自动翻译关闭后该显示什么”只由一个函数决定。

### 14.5 最后补混合语言策略

至少要正式支持三种行为：

1. 整条跳过
2. 允许翻译，但保护 latin 片段
3. 完全交给翻译引擎

否则“跳过混合语言消息”和“保护混合语言中的英文术语”永远会是两个错位功能。

## 15. 后续验证基线

后续真正修代码时，建议至少验证以下场景：

- 关闭频道自动翻译后，重开旧弹窗状态一致
- 关闭频道自动翻译后，重开 BetterDiscord 设置状态不误导
- 切频道、切服务器、重载 Discord 后状态不漂移
- preset 不可见时，不允许继续隐式覆盖细粒度 filters
- 中英混排文本可区分“整条跳过”和“片段保护”
- 主消息、引用预览、embed 在自动翻译关闭后恢复一致
- `translationCache` 命中不能绕过当前频道的关闭状态

---

这份文档描述的是**当前实现基线**。后续如果继续重构，应优先维护这份文档的“状态语义”和“路径边界”两部分，因为这正是当前问题反复出现的核心原因。
