# 架构说明

[English](architecture.md)

本文档描述当前运行时边界和迁移规则。用户可见行为由 `product.md` 负责，设置归属由 `settings.md` 负责，供应商契约由 `providers.md` 负责，现场问题历史由 `field-debugging-guide.zh-CN.md` 负责，未完成工作由 `recovery-plan.md` 负责。

## 当前状态

- 发布版本：v0.3.39。
- 分发产物：由 `src/` 确定性生成的一份可读 `DiscordAITranslator.plugin.js`。
- 已发布 v0.3.39 构建 ID：`08e2b0182796eded`；当前未发布构建 ID：`65a775c63d76dffa`。
- 旧运行时组合根约束：3,329 行、两个模块级共享声明。
- 发布验证：`npm run verify` 统一执行确定性构建、语法、发布契约和完整 Node 测试。
- 显示策略：已挂载消息先尝试频道级 Flux `MESSAGE_UPDATE` 合并；整聊天区重建只作为确认后的回退，而不是每个结果的默认路径。

相较 v0.3.38 基线，目前源码已经明显模块化，但 `src/legacy/runtime.js` 仍是组合根和生命周期补丁外壳。重构已经产生实际价值，但尚未结束；文件数量增加本身不代表架构完成。

## 分发契约

BetterDiscord 用户只安装一个文件：

```text
DiscordAITranslator.plugin.js
```

生成文件禁止手工修改，其来源链为：

```text
src/plugin/index.js
        -> scripts/build-plugin.mjs
        -> DiscordAITranslator.plugin.js
```

构建使用 esbuild CommonJS 模式和 ES2020 目标，保留 BetterDiscord 元数据，移除发布版禁用的探针，并嵌入确定性构建 ID。`package.json`、`package-lock.json`、`src/plugin/metadata.json`、README、CHANGELOG 和生成文件头的版本必须一致。

## 职责归属

| 关注点 | 当前所有者 | 契约 |
| --- | --- | --- |
| 收到消息状态 | `src/display/message-state-store.js` | 不可变原文、请求身份、自动/手动来源、抑制状态、回复预览、显示修订和恢复档案 |
| 显示事务 | `src/display/translation-display-controller.js`、`src/display/display-runtime.js`、`src/display/display-runtime-wiring.js` | 消息 ID 与回复预览宿主 ID 的单一频道级提交边界；一个适配器拥有 Flux/Store、浏览器、计时器、胶囊和视口端口 |
| 单行重绘和回退 | `src/display/flux-row-repaint.js`、`src/display/discord-render-adapter.js`、`src/display/repaint-scheduler.js`、`src/display/repaint-scheduler-wiring.js` | 先走 Flux 单行合并，确认 DOM 修订，每个事务最多一次整聊天区回退；一个适配器拥有 Discord 状态门、托管计时器、生命周期重绘和结果回报端口 |
| 历史采集和封批 | `src/received/historical-source-runtime.js`、`src/orchestrator/historical-snapshot-cadence.js`、`src/orchestrator/historical-snapshot-cadence-wiring.js`、`src/orchestrator/historical-translation-job.js` | 不可变频道任务、500ms 安静窗口、等待任务吸收、一次原子批次提交；一个适配器拥有 cadence 宿主端口 |
| 实时调度 | `src/orchestrator/live-translation-queue.js` | 高优先级频道任务，不因历史采集而人为延迟 |
| 消息删除生命周期 | `src/lifecycle/message-deletion-lifecycle.js`、`src/lifecycle/message-deletion-lifecycle-wiring.js` | 直接 Store 订阅；频道级实时/历史/缓存/显示清理；一个适配器拥有清理分发和 dispatcher 解析 |
| 翻译策略和调用 | `src/orchestrator/translation-pipeline.js`、`src/providers/provider-client.js`、`src/providers/provider-client-wiring.js` | 文本保护、语言策略、主备供应商、完整性、重试和错误提示；一个适配器拥有插件/BDFDB 传输端口 |
| 视口保护 | `src/viewport/message-viewport-store.js`、`src/viewport/message-viewport-wiring.js` | 阅读行锚点、用户意图否决、底部搁浅救援、原始偏移回退和稳定检查；一个适配器拥有浏览器/BDFDB 宿主端口 |
| 已加载状态 | `src/status/loaded-translation-status-store.js`、`src/ui/loaded-status-capsule.js`、`src/ui/loaded-status-capsule-wiring.js`、`src/ui/loaded-status-position.js` | 频道累计计数、胶囊生命周期、重试入口和原生提示感知定位；一个适配器拥有 Store、浏览器、定位和插件回调端口 |
| 转发内容投影 | `src/display/translation-display-logic.js`、`src/received/received-translation-runtime.js` | 快照原文、显示、回声判断、单份原文组合和恢复 |
| 输入框与菜单 | `src/ui/composer-wiring.js`、`src/ui/context-menu-wiring.js` | 频道发送拦截、输入框图标和手动操作 |
| 设置结构与持久化接线 | `src/settings/plugin-defaults.js`、`src/settings/settings-store.js`、`src/settings/settings-store-wiring.js`、`src/ui/settings-panel.js` | 全局和频道设置只有一套结构归属；一个 BDFDB 适配器拥有既有持久化键 |
| 翻译缓存与持久化接线 | `src/cache/translation-cache-store.js`、`src/cache/translation-cache-wiring.js` | 有界付费结果/付费跳过缓存；一个适配器拥有 BDFDB 键、托管防抖计时器和调用方策略/显示端口 |
| 剩余组合职责 | `src/legacy/runtime.js` | 插件生命周期、BDFDB 补丁外壳和依赖接线；只能缩小，不能增长 |

## 架构不变量

1. 频道状态、显示记录、队列、回复宿主、视口、状态计数和清理都必须频道隔离。
2. 供应商凭证、端点、模型、全局主备默认值和检测策略保持全局归属。
3. 输入框翻译图标只控制当前频道自动翻译。
4. 翻译状态提交和可见渲染确认是两个不同操作。
5. 原始内容不可变；显示层只能操作分离副本或保留原型的副本，不得原地修改 Discord Store 对象。
6. 一次用户操作不得产生并行状态表、重绘所有者或第二套原文显示分支。
7. 历史结果按批次提交；累计计数不等于逐消息刷新。
8. 用户滚动意图优先于延迟恢复。
9. 缺失、乱序、重复、语言错误或占位符损坏的供应商结果必须修复或报告，不能静默显示。
10. 调试证据不得进入发布包和仓库历史。

## 收到消息翻译流程

### 实时与手动消息

1. 捕获不可变原文和频道世代。
2. 执行资格、语言、保护和缓存策略。
3. 在 `MessageStateStore` 中登记请求身份。
4. 调用频道有效主供应商，并在允许时调用全局备用供应商。
5. 验证终态结果并提交翻译状态。
6. 启动一个按 ID 限定的显示事务。
7. 尝试 Flux 单行重绘并确认精确 DOM 修订；只有未解决的挂载行或特殊宿主才走整聊天区回退。

手动翻译使用同一状态和显示事务链。手动取消翻译会恢复归档原文，并抑制该消息立即被缓存的自动结果重新覆盖。

### 历史消息

已挂载和缓存快照在不模拟滚动的前提下采集。用户上滚产生的快照先等待 500ms 安静窗口，再形成不可变频道任务；兼容的等待任务在供应商请求开始前合并。有效结果一起进入状态存储，并由一个显示事务整体呈现。

`new_only`（仅翻译新消息）不创建历史任务。频道会话初始化时，`received-translation-runtime.js` 会在遍历消息流之前，从频道模型的 `lastMessageId`/`last_message_id` 冻结实时边界。首次跳过按消息判断：小于等于边界的是基线，大于边界的仍是真实时消息；若空流和频道模型都没有边界，则保持未初始化，等待真实基线。原文采集会创建 `idle` 显示记录，但只有此前确实为 `translated` 的视图才能产生 `messageChanged`，不能仅因记录存在就绕过边界。这些规则共同阻止延迟虚拟化历史进入实时队列。胶囊仍只属于 `loaded_messages`；在 `new_only` 中补显示胶囊只会掩盖分类错误。

回复预览状态可以立即提交，但宿主行重绘按频道汇总成 300ms 波次，并服从用户滚动门。实时任务始终优先于下一次历史请求。

### 转发消息

转发消息父级 `content` 可能为空，实际可见正文通常位于 `messageSnapshots[0].message.content`。原文读取、供应商输入、回声检查、显示、原文组合、取消和恢复都使用同一组快照感知函数。

快照以保留原型和转发引用字段的方式克隆。关闭收到消息原文显示时，只显示一份译文；开启时，显示译文和恰好一份引用/剧透形式原文。Discord 规范化可能删除未知属性，因此不使用自定义标记属性判断身份。

## 显示事务

显示事务包含频道 ID、译文消息 ID、回复宿主 ID、期望修订、触发通道和该事务自己的视口意图。控制器先提交状态，再绘制，并记录每行是已挂载确认、虚拟化就绪、跳过、失败还是未解决。

对于普通已挂载消息，`flux-row-repaint.js` 通过 Discord Store dispatcher 发送已经实验确认的无内容变化 `MESSAGE_UPDATE` 合并，随后等待异步 Store 渲染并检查 DOM 修订。已经携带目标修订的消息不需要刷新。

只有单行确认或特殊宿主仍未满足事务时，`discord-render-adapter.js` 才执行一次整聊天区重建。当前客户端函数组件只暴露没有类更新器的 `{props}` 合成对象，因此实例注册表只是机会性路径。同步清空/重挂载实现及其 adapter 空接口已经删除，现场结论保留在调试交接中。

## 视口归属

`MessageViewportStore` 是翻译相关滚动恢复的唯一写入者。

- 锚点选择视口中心附近的可见消息，而不是最上方消息。
- 用户正在滚动时，历史译文暂缓显示。
- 新的滚轮、触摸或拖动会否决所有延迟修正。
- 如果整区回退把正在查看历史的用户搁在最新消息，可在立即恢复阶段救回原锚点。
- 虚拟化导致锚点元素缺失时，使用捕获的原始偏移回退。
- 在 180ms 和 600ms 检查布局稳定，但永远不覆盖更新的用户意图。

译文增加高度后，滚动条滑块大小或位置仍可能变化。系统保证的是阅读内容位置，而不是滑块完全静止。

## 已加载翻译状态

胶囊为每个频道显示一套累计比例。唯一已翻译消息 ID 在消息状态存储提交点登记，胶囊 DOM 只在批次或状态心跳时更新。后续批次扩展同一比例，例如 `13/13 -> 13/33 -> 33/33`。

累计身份包含当前有效的接收翻译配置。配置签名变化时，只重置该频道的已显示 ID、已见消息、失败重试快照、排队任务和初始化边界，再按新配置收集；重复读取相同签名不会重置，因此普通渲染不会让累计比例归零。

配置容量和检查过的消息不能作为分母；已解决跳过项退出待处理数量；旧批次报告被拒绝；失败和重试继续使用累计口径。切换频道会隐藏不相关胶囊，但不会清除该频道累计状态。

定位器只接受输入框附近最小、有效的慢速/冷却提示。存在提示时，胶囊位于提示上方 8px 并右对齐；不存在提示时，位于输入框上方 8px。消息正文误匹配、零尺寸矩形、失效节点和输入框短暂卸载都不能把胶囊移动到无关位置。

## 供应商、持久化与设置

供应商契约见 `providers.md`。Google Free 无需密钥，按 URL 编码后的查询长度切片，把受保护文本映射为可逆、安全的传输占位符，并继续使用统一严格校验器。完全相同的供应商错误在 10 秒内合并，不同错误仍然显示。

已退役的 `$discord` 语言哨兵仅作为迁移与兼容输入继续可读。设置重载时通过 `BDFDB.LanguageUtils.getLanguage().id` 将其解析为客户端当前的具体语言，并把全局、服务器或频道范围的接收/发送输出配置持久化为该明确语言；可选语言表会移除该别名键。下游归一化仍会防御性地解析内存中的旧值，再参与签名、同语言、书写系统、供应商派发和结果语言判断。供应商检测源语言与具体目标一致并原样返回时，结果记为终态同语言跳过而不是失败。失败历史快照保存对应配置签名；普通消息流重扫会让匹配失败继续停留在账本，只有显式重试可以绕过门禁。

持久化职责分离如下：

```text
settings              全局行为和显示偏好
channelSettings       频道开关、语言和供应商覆盖
providerCredentials   API 密钥、端点和模型
translationCache      有界成功译文及付费跳过缓存
```

运行时队列、显示状态、视口、计数器、探针和世代只存在于内存。`showOriginalMessage` 是唯一收到消息原文显示开关；旧数据中残留的 `showOriginalDirectly` 会被忽略。

## 关闭、停止、编辑与清理

关闭一个频道时，系统推进频道世代、取消待处理自动任务、恢复该频道的自动和手动消息/预览/embed/标题，并启动一个频道级显示事务。之后仍可手动翻译；旧世代晚到结果不能重新绘制频道。

插件停止前对全部频道执行同样恢复，再释放补丁和受管任务；缓存所有者会先提交一次仍在防抖窗口内的待保存内容，运行时不直接操作其定时器或缓存对象。消息编辑会捕获新原文签名并使旧请求/显示结果失效。频道会话裁剪只保留活跃请求、未确认恢复、手动抑制或原文档案仍需要的状态。

接收翻译配置变化而旧译文仍绘制在消息上时，`MessageStateStore` 只把被替换的译文保留为恢复证明。消息流与内容渲染都会在再次捕获前恢复不可变原文；这份证明不会作为活动译文暴露。这样可防止旧目标语言文本被当成新原文并反复进入历史任务。

## 诊断与隐私

调试构建可启用有界状态日志，以及消息更新、转发快照、消息行所有者和定位证据的一次性探针。发布构建不包含探针激活和调试日志实现。

原始证据、供应商配置、API 密钥、账号/频道标识、已安装插件备份和调试包都保存在 Git 之外。仓库夹具使用合成 ID、保留示例域名和不形似真实令牌的描述性凭证占位符。

## 构建与验证

必需命令：

```text
npm ci
npm run build
npm run verify
```

`npm run verify` 验证源码与产物确定性一致、JavaScript 语法、架构收缩约束、发布元数据、中英文入口和全部单元/契约/集成测试。显示层改动还必须经过 PTB 观察，因为模拟刷新函数被调用并不能证明 Discord 中实际可见内容改变。

## 已知债务

- `src/legacy/runtime.js` 仍是 3,329 行组合根。
- 整聊天区回退诊断 `R` 仍会重挂载或刷新输入框及其所在行。组合显示接线构建 `65a775c63d76dffa` 的 PTB 复验再次观察到这一既有行为；该问题已明确停放，留待后续渲染边界工作处理。
- 供应商物理中止和生命周期任务注册表继续在 `recovery-plan.md` 中由证据触发；自动多页历史读取已在现场回退后暂停，Store 消息删除直接订阅已经完成现场确认。
- Discord 内部 Store 和快照结构在客户端更新后需要重新观察。
- 一些模块仍偏大，只有在职责契约和回归测试存在后才应拆分。

## 迁移规则

- 每次运行时行为变更前先添加失败回归测试。
- 一次只移动一个职责边界，不把重新设计藏进兼容补丁。
- 不得创建第二套状态表、重绘所有者、队列、计数口径或原文显示模式。
- 保持单文件生成产物和频道/全局设置归属。
- 每个提交都必须可构建、可验证、可回滚。
- 不能仅凭合成测试宣称 Discord 渲染工作完成。
- 从旧运行时移出职责时，同一提交降低行数约束；不得为了容纳新代码提高约束。
- 架构或现场调试契约变化时，同时更新中英文入口。
