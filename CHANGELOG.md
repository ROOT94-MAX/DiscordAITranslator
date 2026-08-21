# Changelog

## Unreleased

- Display: ordinary received-message transactions now remain on the Store-targeted repaint path; DOM confirmation failure uses bounded targeted retry instead of remounting the whole chat and Composer. Historical batching, virtualized-on-mount display, live priority, and viewport intent remain unchanged; reply-preview hosts and explicit lifecycle refreshes are tracked as later independent cuts.

## v0.3.40

- Architecture: 完成 Slice 5d composition-root 收口；新增 19 个延迟单例的显式白名单与每项最多 8 行的紧凑边界契约，确认 `runtime.js` 终态为 3,260 行和两个模块级可变声明。后续渲染、生命周期及大模块债务继续按独立证据开启，不再把无边界的继续缩行列为活动任务
- Fixed: 用户上滚阅读历史时，新实时消息到达不再把虚拟消息列表推到最新位置；Live Queue 在新行提交前通知 Viewport Store，后者优先捕获当前阅读线，并在 Discord 已经跳底时回用最近一次用户历史滚动快照。恢复仍服从更新的用户手势否决，主动回到底部不会被旧锚点拉回
- Refactor: Slice 5d 第十个 composition-root 切片把 Live Translation Queue 的运行时/频道判断、显示提交、历史交接、频道会话、批量翻译结果策略和单条回退接线迁入 `live-translation-queue-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,329 行降至 3,260 行，实时消息优先、同频道批量、历史让位和频道隔离策略保持不变
- Lifecycle: Live Translation Queue 的 900ms 重试计时器改由 wiring 显式接入 BDFDB 托管 `timeout/clear`，插件停止或热重载时不再依赖全局计时器存活；新增完整 30 项端口、托管计时器、会话/历史交接、跳过/重试/缓存提交契约
- Refactor: Slice 5d 第九个 composition-root 切片把 Display Repaint Scheduler 的显示事务入口、历史显示结果回报、Discord 页面状态判断、生命周期整区重绘和 BDFDB 托管计时器接线迁入 `repaint-scheduler-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,339 行降至 3,329 行，重绘合并、延迟、重试、来源归因和输入/设置/滚动门保持不变
- Test: 新增 Repaint Scheduler 全部 9 项端口透传契约；既有调度策略、实时吞吐、滚动门、设置/输入门、整区回退和显示归属测试继续通过
- Refactor: Slice 5d 第八个 composition-root 切片把 Received Display Runtime 的 Flux dispatcher、Message/Channel Store、浏览器 DOM/RAF、BDFDB 托管计时器、胶囊计数和视口恢复接线迁入 `display-runtime-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,369 行降至 3,339 行，显示状态、单行重绘、整区回退和滚动恢复策略保持不变
- Test: 新增 Received Display Runtime 的完整宿主/插件端口、Store 异常收敛和 best-effort 视口恢复契约；显示生命周期、吞吐、Flux、手动锚点与 `flushSync` 既有契约继续通过
- Refactor: Slice 5d 第七个 composition-root 切片把已加载状态胶囊的 SelectedChannel Store、浏览器定位、运行时存活门、滚动/重试及 DOM 生命周期回调接线迁入 `loaded-status-capsule-wiring.js`；`runtime.js` 仅保留延迟单例和兼容定位入口，架构约束从 3,391 行降至 3,369 行，累计计数、频道隔离和胶囊定位行为保持不变
- Test: 新增已加载状态胶囊接线的完整依赖、插件回调透传及 BDFDB/document/window 定位 envelope 契约；既有胶囊 DOM、心跳、慢速模式提示定位和运行时停止门测试继续通过
- Refactor: Slice 5d 第六个 composition-root 切片把消息删除的 Store dispatcher、实时队列、历史任务/失败账本、缓存、显示状态清理接线迁入 `message-deletion-lifecycle-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,401 行降至 3,391 行，单条/批量删除订阅和频道隔离行为保持不变
- Test: 新增消息删除接线的完整 10 项依赖及全部清理 owner 参数透传契约；Store dispatcher 定位契约改由新 wiring 模块持有
- Refactor: Slice 5d 第五个 composition-root 切片把历史消息安静窗口的 BDFDB 托管计时器、滚动状态、队列身份和封批回调接线迁入 `historical-snapshot-cadence-wiring.js`；`runtime.js` 保留紧凑延迟单例入口，架构约束从 3,404 行降至 3,401 行，500ms 封批、滚动延迟和等待批次合并策略保持不变
- Test: 新增历史封批接线的完整 5 项依赖、`timeout/clear` 托管端口以及滚动、当前队列、完成封批回调透传契约
- Refactor: Slice 5d 第四个 composition-root 切片把 Message Viewport 的 document、BDFDB 托管计时器、RAF、当前频道、消息滚动区选择器、CSS 转义和历史封批回调接线迁入 `message-viewport-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,415 行降至 3,404 行，滚动意图、阅读锚点和输入焦点规则保持不变
- Test: 新增 Message Viewport 接线的完整 9 项依赖、托管计时器、document/RAF/频道/选择器/CSS 委托及滚动停止后历史封批回调契约
- Refactor: Slice 5d 第三个 composition-root 切片把 provider client 的 BDFDB 网络请求、托管重试计时器、原始退避睡眠、凭证/语言读取和提示词/UI 回调接线迁入 `provider-client-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,431 行降至 3,415 行，所有供应商请求与响应契约保持不变
- Test: 新增 provider client 接线的完整依赖清单、请求/计时器/退避语义、凭证持久化、语言表、通知和 AI 提示策略透传契约
- Refactor: Slice 5d 第二个 composition-root 切片把翻译缓存的 BDFDB 持久化键、托管计时器以及来源/签名/显示/策略回调接线迁入 `translation-cache-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,448 行降至 3,431 行，缓存格式、500 条上限、300ms 防抖和停止时提交行为保持不变
- Test: 新增翻译缓存接线的完整依赖清单、`translationCache` 持久化键、托管计时器和全部策略回调透传契约
- Removed: 接收与发送输出语言下拉框不再提供动态 `$discord` 目标；旧的全局、服务器和频道输出值首次加载时迁移为客户端当前的明确语言，之后客户端界面语言变化不会暗中改变翻译目标
- Fixed: 动态目标 `$discord` 在签名、脚本分析、同语言比较和供应商派发前解析为 Discord 客户端实际语言；Discord English 不再误走特殊编码分支，供应商检测为同语言并原样返回时记录为终态跳过而不是 `provider_failed`。失败历史消息按消息 ID 与配置签名停留在重试账本，只有显式“重试”或真实编辑/配置变化才重新进入，阻断 `hist` 周期增长和数秒一次的整区重绘
- Fixed: 有效接收翻译配置变化时为该频道开启新的累计会话，清除旧目标语言的已显示 ID、已见消息、失败重试快照、排队任务和初始化边界；相同配置重复渲染不会再次重置，旧 `36` 条完成记录和 `50` 条失败不会进入英语配置胶囊
- Fixed: 接收目标语言变更时保留已退役译文的恢复证明，先把仍绘制在消息上的旧目标语言译文还原为不可变原文，再按新配置最多进入一次替代判断；旧中文译文不再被当成英语频道的新原文反复入队和重绘
- Refactor: Slice 5d 首个 composition-root 切片把设置存储的 BDFDB 数据键、频道到服务器解析和全局语言选择持久化接线迁入 `settings-store-wiring.js`；`runtime.js` 仅保留延迟单例入口，架构约束从 3,476 行降至 3,448 行，设置键、存储格式和优先级保持不变
- Test: 新增设置存储接线的完整依赖清单、七个持久化记录键、双写频道开关兼容键和全局语言选择保存契约
- Refactor: 删除已经退出运行路径的同步原子聊天区重建实现、无效 adapter 参数、多余 BDFDB 句柄接线和对应历史行为测试；活动的 `resolveFlushSync` 迁移到单一职责模块 `react-flush-sync.js`，单行重绘行为保持不变，旧运行时约束从 3,479 行降至 3,478 行
- Test: 新增 `resolveFlushSync` 注入优先、Webpack 回退、缺失/异常降级以及退役原子路径完全移除的契约测试
- Fixed: 消息删除和批量删除改为直接订阅已验证的 Discord Store dispatcher；移除对全局 `dispatch` 的旧补丁，插件重复启动不会重复订阅，停止时解除原处理器，部分订阅失败会自动回滚
- Refactor: 显示层逐行重绘与消息删除订阅共用 `store-dispatcher.js` 解析器；旧运行时约束继续从 3,478 行降至 3,476 行，没有新增事件兼容补丁
- Reverted: 取消自动连续读取多页 Discord 历史以凑满配置数量的实验；现场测试报告大量错误后恢复单次初始预取和原有“用户上滚后按批翻译”路径，安装构建回到 `d8af59cf7ce43f9c`
- Fixed: 插件正常停止时由翻译缓存模块立即提交最后一个 300ms 防抖窗口，不再直接放弃刚写入的译文/付费跳过缓存；无待保存内容时不写盘，保存异常也不阻断其余停止清理
- Reverted: 撤回“手动译文内容 props 投影”实验；用户澄清截图发生在手动翻译之前，真实问题是自动翻译漏收/漏记一条而胶囊仍显示完成，不能用后续手动缓存结果替代自动链路取证
- Fixed: “仅翻译新消息”在频道首次聊天流为空或分批挂载时，不再以 `null` 边界或新建的空闲显示记录把历史行误判为实时消息；初始化先冻结频道模型的最后消息 ID，缺少边界的空流暂不完成初始化，首次流中边界后的真新消息仍即时翻译

## v0.3.39

- Changed: 已挂载消息优先通过 Discord Store 的 `MESSAGE_UPDATE` 合并路径逐行重绘；只有行级确认失败、回复预览宿主或频道生命周期刷新才回退到整聊天区重建，显著减少输入框图标闪烁
- Fixed: 历史消息在 500ms 安静窗口后封批，同一上滚过程的微批次在启动前合并；回复预览按 300ms 窗口合并重绘，不再出现“一条消息一次刷新”
- Fixed: 历史翻译等待用户滚动手势结束后再显示，使用视口中心阅读行作为锚点，并在 180/600ms 布局稳定阶段复核；开启自动翻译时只捕获当前视口，不再复用旧手动翻译锚点跳到最新消息
- Fixed: 状态胶囊改为频道级累计计数，按唯一消息 ID 在状态存储提交点记账；拒绝旧批次回报、配置上限充当分母、逐条 DOM 刷新和旧实例复活，失败/重试继续使用同一累计口径
- Fixed: 胶囊在有原生慢速提示时与其右边缘对齐并位于上方，无提示时贴近输入框；过滤消息正文误匹配、失效零尺寸提示和输入框短暂卸载造成的位置漂移
- Fixed: 转发消息统一从快照正文提取、翻译、显示与恢复；自动/手动翻译、取消翻译和关闭频道都保留快照结构，显示原文时只保留一份原文
- Fixed: Google Free 长文本按 URL 编码后的查询长度切片，并使用可逆安全占位符避免供应商改写保护标记；重复供应商错误在 10 秒窗口内合并提示
- Removed: 删除重复的“直接显示收到消息的原文”设置及其 React/CSS/运行时分支；`showOriginalMessage` 成为唯一收到消息原文显示控制
- Refactor: 完成状态胶囊、输入框接线、翻译流水线、编码转换、设置标签、上下文菜单、Discord 标记渲染、默认设置和回复预览队列的职责拆分；旧运行时预算从 4,318 行降至 3,479 行
- Docs: 新增完整现场调试交接文档、中文架构文档和中文调试交接文档，记录失败方案、证据边界、回归入口和后续观察项
- Test: 发布契约覆盖版本一致性与中英文文档互链；全量验证 1,249 项通过

## v0.3.38

> v0.3.37 为未发布的开发版本，其变更合并计入本条。

- Fixed: 译文不再需要鼠标悬停才显示。真机取证证明逐消息 forceUpdate 在新版客户端上是空操作，刷新统一改为整列表重建（每次翻译事务最多一次、已绘制行重试只读、纯虚拟化行不触发），并重写消息行查找为宽容选择器阶梯，适配新版复合消息 ID（`频道ID-消息ID`）
- Fixed: 手动翻译/取消翻译后无需切换频道即可显示——旧刷新原语（forceAllUpdates）实测无效，已换用同一重建机制
- Fixed: 关闭频道自动翻译后，自动与手动译文均当场恢复原文；修复恢复残留被误判为"用户编辑"导致原文无法还原的缺陷
- Fixed: 实时翻译与历史补翻竞态防护——已被实时翻译拥有（或请求在途）的消息，历史批次不再覆盖，杜绝"翻译两次后无底色且无法取消"的卡死链
- Added: 历史补翻按每批 10 条分块请求，状态胶囊进度实时跳数；被实时接管的消息计入已显示，不再显示误导性缺口
- Added: 恢复设置面板中的"补翻范围与数量"控件（面板重构时遗失，运行时仍在读取）
- Added: 状态胶囊离开所属频道后一秒内自动消失，不再悬浮在其他界面上
- Added: 构建指纹——文件头 `@buildId` 与设置面板顶部的 `v0.3.38 · build xxxx` 一致，可随时核对已装构建与仓库产物是否相同
- Test: 全量验证 1106 项通过；新增刷新接线、竞态、分块进度、胶囊生命周期与构建指纹等回归测试

## v0.3.36

- Fixed: 自动译文与原文相同或高度相似时，显示层会清除陈旧译文状态，不再错误添加译文颜色、背景和水印
- Fixed: 历史消息 AI 批量响应缺项、返回跳过信号或目标语言错误时，改为回退强制单条纯翻译，不再直接丢弃或重复跳过短词
- Changed: 历史译文按每个已完成请求块立即应用并触发合并刷新，不再等待整个历史快照结束或后续重扫
- Fixed: 历史单条翻译遇到无明确跳过结论的临时失败时自动重试一次
- Test: 增加相同文本显示、分块渐进显示、批量无效项兜底和临时失败重试回归测试

## v0.3.35

- Changed: 未显式配置的频道自动翻译默认关闭，旧全局启用状态不再影响所有频道
- Fixed: 迁移时合并两份历史频道状态，保留显式频道开关记录，冲突时主存储优先
- Removed: BetterDiscord 设置中的全局自动翻译默认开关
- Removed: 输入框翻译按钮和消息操作栏快捷翻译按钮的显示开关；两个入口现在固定可用
- Removed: 三个废弃设置对应的 90 行旧多语言文案和全局默认读写方法
- Test: 增加设置契约、旧状态迁移和固定按钮回归测试

## v0.3.34

- Added: 当前频道可以覆盖全局主翻译服务商，并可通过独立操作恢复跟随全局默认
- Fixed: 收到消息、发送消息、回复预览、历史批处理和缓存签名统一使用当前频道的有效主服务商
- Fixed: 发送消息与指定语言前缀路径显式保留提交频道 ID，避免切换频道时串用配置
- Added: 不受当前主备服务支持的语言组合仍显示，但会禁用并说明原因
- Added: 选择缺少必要全局 API 配置的服务商时立即提示
- Changed: 左键频道弹窗只保留频道主服务、语言识别助手和四个收发语言设置
- Test: 增加频道主服务、恢复全局、发送频道接线和弹窗范围回归测试

## v0.3.33

- Fixed: 实时新消息不再等待正在执行的历史 AI 批量翻译
- Fixed: 手动翻译结束后恢复处理自动翻译队列
- Changed: 实时译文界面刷新延迟由 650ms 缩短到 120ms
- Fixed: 用户正在输入时允许实时自动译文安全刷新，不再长期隐藏结果

## v0.3.32

- Fixed: AI 决策模式下全大写外语消息(如 “HELLO CRYZYYY”)自动翻译漏翻。根因是 AI 把全大写当缩写/专名而**原样回显**(不输出 `__SKIP_TRANSLATION__`),v0.3.30 安全网只拦 skip token、不拦回显,于是 `isTranslationLikelyInTargetLanguage` 判非目标语言后静默丢弃;手动翻译强制整段翻译所以不受影响
- 改动 1(主修复):`translateText` 对“收消息自动 + AI 决策”且按书写系统判定为明确外语(源脚本≠目标脚本且非目标字母≥6)的消息,强制 `autoDecision=false` 直接整段翻译,不给 AI skip/回显的机会
- 改动 2(兜底):安全网触发条件从“仅 skip 信号”扩展为“skip 信号 或 wrongTarget(原样回显/非目标语言)”;复核确为外语则强制纯翻译重翻,用既有 `retriedAfterSkip` 防死循环
- Notes: 仅作用于“收消息自动 + AI 决策模式”;manual、basic、同脚本 latin↔latin 行为不变

## v0.3.31

- Fixed: 全大写拉丁字母消息(如 “HELLO CRYZYYY”)无法翻译——根因是 `protectAutoTechnicalTerms` 的全大写缩写规则把每个大写词都当技术缩写保护，整条消息被占位符替换后无剩余可翻译内容，`shouldAutoTranslateReceivedMessage` 直接跳过。现新增“全大写喊话”判定:拉丁主导且大写占比高时跳过该缩写规则，让喊话文本正常翻译;CJK 主导(如 “我需要CDK用于GPT”)与正常大小写文本中的真缩写(CDK/GPT/API)仍照常保护
- Notes: 修的是 v0.3.30 未覆盖的真正根因，作用于所有引擎与模式(不仅 AI 决策模式);单点改动，正常大小写与 CJK 主导文本行为不变

## v0.3.30

- Fixed: AI 决策模式(`autoTranslateDecisionMode=ai`)偶发把明确的外语消息误判为 `__SKIP_TRANSLATION__` 导致漏翻(典型:全大写英文消息目标中文未翻)
- Added: 收到消息 AI 决策安全网——AI 返回 skip 时先本地"明确外语"快判(零网络,靠书写系统区分,如拉丁 vs 汉字),再 Google gtx 检测复核(覆盖拉丁语之间),确认是外语则强制纯翻译重翻(不给 AI skip 选项),确保真外语不被漏翻
- Notes: 安全网仅在 AI 决策模式下、AI 误判 skip 时触发,平时零额外请求;gtx 不通时本地快判仍能兜住不同字形的多数情况,拉丁语之间维持原 skip(不比原来差);挂在 `useLocalLanguagePrecheck` 开关下,basic 模式不受影响;不改 AI 提示词

## v0.3.29

- Added: 本地语种识别预检测,翻前用本地停用词识别跳过拉丁语系同语言消息(英→英、法→法等),避免无意义的 AI 请求。覆盖英/法/西/德/葡/意/荷/波兰/罗马尼亚/土/瑞典/丹麦/挪威/捷/匈/印尼/越/塔加洛等常用语种,仅在高置信时跳过,拿不准仍照常翻译,可开关
- Added: 收到消息源语言过滤改为请求前本地判定(原为翻完后丢弃,白花一次请求)
- Added: 翻译请求加 30 秒硬超时,卡住不再无限阻塞队列;超时合成 504 走原有失败分支
- Added: 429/5xx 触发队列退避暂停(429 暂 5 秒、5xx 暂 2 秒),避免顶着限流连续重打
- Docs: 说明 AI 决策模式(`autoTranslateDecisionMode=ai`)是 AI 引擎最准的同语言跳过,本地预检测是全引擎通用补充

## v0.3.28

- Fixed: 保护词匹配忽略内部空格,配置 “BUG team” 现在也能保护 “bugteam”(无空格)、“bug  team”
- Fixed: 切换插件界面语言后重新加载面板文案,弹窗/快捷设置不再残留旧语言
- Docs: 告知用户“包裹符对/保护词”节的“保护我发送的消息/保护收到的消息”开关位置(对方/自己分别控制)

## v0.3.27

- Fixed: 用户配置的保护词组（如 “BUG team”）现在整体保护，不再被大写缩写规则拆成 “BUG”
- Fixed: 收紧版本号自动保护规则，裸数字 “3.1” 不再被误保护；仍保护 “v3.7”“1.2.3”“v0.3.27” 等
- Test: 同步保护/翻译回归测试到当前占位符格式 ⟦N⟧ 与实际行为
- Test: 短句长度门、new_only scope、手动取消翻译缓存抑制等用例对齐插件现状并通过
- Deferred: 回复预览在自动翻译关闭时的引用内容保留、手动译文可见、loaded_messages scope 立即排队、历史延迟重试，标记为已知待办（test.skip），不在本次修改插件核心逻辑

## v0.3.26

- Fixed: 自动翻译刷新改为消息锚点恢复，减少插入译文后跳到中间或错误位置
- Fixed: 单条消息“翻译消息”按钮不再受输入框总翻译开关影响
- Fixed: 收到消息自动翻译前增加同目标语言预检测，尽量拦住“中文改写中文”
- Fixed: 手动翻译时尽量排除引用预览内容，避免把引用正文一起翻进去
- Fixed: 手动翻译后增加短时间滚动锁，避免新消息把视角拉走
- Fixed: 手动翻译目标语言提示词加强，减少返回错误目标语言
- Fixed: 从自动保护包裹符规则里移除 `||`，避免剧透内容被旧规则直接挡掉
- Fixed: 移除短文本长度跳过，并在提示词中要求不要省略短语气词、短句和重复词
- Fixed: 工作区补充旧缓存防回归，不再复用同语言改写的旧自动翻译缓存
- Docs: 同步 README、发布说明、安装教程、使用说明到 `0.3.26`

## v0.3.25

- Fixed: 发送消息前增加同语言跳过
- Fixed: 发送源语言固定时直接判定同语言，不再额外走 AI
- Fixed: 发送源语言为“检测语言”时，先本地检测再决定是否翻译
- Fixed: 发送结果增加兜底，避免“中文 -> AI -> 中文改写”后误发

## v0.3.24

- Fixed: 修复后台设置页点击 `Select` / 输入框时面板跳动、滚动跳顶问题
- Fixed: 扩大设置滚动容器识别范围，并在下拉打开期间临时拦截 `scrollIntoView`
- Fixed: 下拉关闭后恢复原始滚动行为
- Docs: 首次统一仓库版本文档和发布说明
