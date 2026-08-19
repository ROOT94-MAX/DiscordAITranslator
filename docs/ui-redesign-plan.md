# UI 重设计计划：移植 DCES 设计系统到两个面板

状态：规划完成，三项决策已齐（2026-08-19），等待 display-unification 重构收尾后开工
日期：2026-08-19
范围裁定：本计划只换「渲染层」（界面长什么样、控件怎么画），所有设置键、保存逻辑、翻译行为零变化。
顺序从属：`docs/recovery-plan.md` 的重构顺序优先。`codex/display-unification` 分支未合并前，本计划的实现分支不得合并（见第 6 节）。

---

## 0. 参考来源（权威设计蓝本，实施时必须对照）

- 蓝本文件：`<USER_HOME>\AppData\Roaming\BetterDiscord\plugins\DiscordChannelExportSummary.plugin.js`
- 蓝本版本：`0.8.5`（下列行号基于此版本；若实施时该插件已更新，按段落标题重新定位，段落标题格式为 `// ==================== NN. XXX ====================`）
- 版权：ROOT94 自有代码，可自由复制。
- 需要移植的段落：

| 段落 | 行号（v0.8.5） | 内容 |
| :--- | :--- | :--- |
| 15. STYLES | 1808-2824 | `--dces-*` 设计令牌层 + 全部控件样式（约 1000 行 CSS） |
| 17. UI: REACT HELPERS | 2854-2892 | `h` / `useState` / `useRef` / `useEffect` 等 BdApi.React 引用方式 |
| 19. UI: SUMMARY MODAL | 2912-3515 | 自绘模态外壳（面板 B 的备选外壳，见 D2） |
| 21. SETTINGS PANEL | 3668-4395 | 全部组件原语 + 标签页根组件 + 服务商双栏页 |

蓝本的设计要点（移植后必须保持）：

- 颜色不写死：全部经 `--dces-*` 令牌映射到 Discord 原生主题变量（`--background-primary`、`--brand-500` 等）并带回退值。换主题（含 system24）自动跟色。
- 分段式标签栏：深色圆角容器内平分的胶囊标签，选中态品牌蓝底白字，支持方向键切换，`role="tab"` 等无障碍属性完整。
- 服务商页双栏布局：左栏 148px 服务列表（每行有「已配置」绿色圆点 + 当前激活对勾），右栏对应表单。`grid-template-columns: 148px minmax(0, 1fr)`。
- 控件全部自绘、样式统一：`SwitchC` 开关、`SelectMenu` 自绘弹出下拉（禁用原生 select）、`PasswordField` 带小眼睛的密钥框、`ModelCombo` 可在线拉取模型列表并过滤的组合框（禁用原生 datalist）、`NumInput` 文本型数字框（禁用 `type="number"`）、`SmallBtn` / `IconBtn`、`Field` / `Row` / `GroupHeader` 布局件、`StatusLine` 状态行（校验结果绿/红反馈）。
- 弹层行为统一：`usePopover`（点外面或按 Escape 关闭）。
- 键盘可达：所有可交互元素 `:focus-visible` 有品牌色描边。

---

## 1. 目标与非目标

目标：

1. 面板 A（BetterDiscord 插件设置面板）：从 BDFDB 折叠区组件树，重建为 DCES 风格的标签页面板。
2. 面板 B（输入框翻译图标左键弹出的频道设置面板）：内容控件全部换成同一套设计体系。
3. 两面板共享一套新基础模块（设计令牌 + 组件原语），与 DiscordChannelExportSummary 视觉一致。

非目标（本计划明确不做）：

- 不移除 BDFDB 依赖。插件核心（消息拦截、译文渲染、补丁）继续用 BDFDB，本计划只换两个面板的皮。
- 不改聊天区译文样式（`src/ui/styles.js` 里的消息底色、水印、加载点等）。
- 状态胶囊不在首批（完成两面板后由 D3 单独决策）。
- 不改任何设置的语义、默认值、存储键名。

---

## 2. 现状盘点（改造对象）

### 面板 A：插件设置面板

- 文件：`src/ui/settings-panel.js`（1329 行），单入口函数 `renderSettingsPanel(plugin, collapseStates, {BDFDB})`。
- 接线点：`src/legacy/runtime.js:352` 的 `getSettingsPanel`，一行调用。
- 现有结构（顶部版本行 + 4 个 BDFDB 折叠区）：

| 区块 | 内容 |
| :--- | :--- |
| 顶部 | `v0.3.38 · build xxxx` 构建指纹行（有回归测试锁定，必须保留） |
| 翻译服务 | 主引擎下拉 + 该引擎字段（API 密钥/端点/模型/模型目录拉取/微软区域）；备用引擎（内嵌折叠，含说明文案与字段）；其他服务凭据（内嵌折叠，9 个引擎各一个子折叠） |
| 语言 | 发送 输入/输出 语言选择 + 发送源语言过滤；接收 输入/输出 语言选择 + 接收源过滤；自动翻译决策（决策模式、语言检测策略、补翻范围与每批数量） |
| 显示 | 5 个开关（sendOriginalMessage、useSpoilerInSentOriginal、showOriginalMessage、useSpoilerInReceivedOriginal、showOriginalInReplyPreview）；译文颜色（预设色 + 自定义色块可增删）；插件界面语言 |
| 高级 | 保护词（堆叠标签输入）；包裹符对（左\|右格式）；跳过前缀；指定语言前缀 |

- 特殊机制（重写时须处理）：
  - 密钥可见性、译文颜色的临时状态挂在 plugin 实例上（`plugin.secretInputState`、`plugin.translatedTextColorState`），因为 BDFDB 每次刷新重建整棵树。新面板改用 React 组件自身 state 即可。
  - `lockStableSelectScrollIntoView`：为 BDFDB Select 打开时临时拦截 `scrollIntoView` 防面板跳动。自绘 `SelectMenu` 不用 `scrollIntoView`，此 hack 预计可删，需 PTB 实测确认（见第 7 节）。

### 面板 B：频道设置弹窗

- 文件：`src/ui/translate-components.js` 中的 `TranslateSettingsComponent`。
- 打开方式：翻译按钮 onClick → `BDFDB.ModalUtils.open(size: "LARGE")`。
- 内容：频道主引擎下拉（含「恢复跟随全局」按钮、选中未配置引擎时的红色 toast 警告）；语言识别助手（输入文本 → 检测 → 一键应用到某个方向）；四个语言选择（接收 输入/输出、发送 输入/输出），选项带「需备用引擎」「不支持（禁用+原因）」标记。

### 现有测试基线

- `tests/settings-contract-regression.test.js` 等为源码文本断言与设置默认值契约，无渲染断言；面板渲染层重写不受其直接约束，但每个控件的设置写路径必须逐一保真（P0 负责枚举）。
- 全量验证入口：`npm run verify`（构建校验 + 语法 + 全部测试，当前 1108 项）。

---

## 3. 目标设计

### 3.1 新基础模块（两面板共享）

- `src/ui/design-tokens.js`（新建）：令牌层 CSS。从蓝本 `--dces-*` 逐条复制，改前缀为 `--dat-*`；类名前缀定为 `dat-`（DiscordAITranslator），避免与现存 `translator-*` 类冲突。样式注入沿用现有 styles 注入通道，实施时确认。
- `src/ui/primitives.js`（新建）：移植蓝本第 21 段的全部组件原语（第 0 节列表），外加两个蓝本没有、本插件需要的新控件：
  - `ColorSwatchRow` 译文颜色控件：行为对照现有 `createTranslatedTextColorInput`（预设色块 + 自定义色增删 + 选中态 + title 提示），视觉按 dat- 令牌重画。
  - `TokenListInput` 堆叠标签输入：行为对照现有 `createStackedTokenInput`（保护词、包裹符使用）。

### 3.2 面板 A 新信息架构（折叠区 → 标签页）

顶部保留构建指纹行，下方一条 4 标签的分段标签栏：

| 新标签页 | 承接的现有内容 | 备注 |
| :--- | :--- | :--- |
| 翻译服务 | 主/备引擎 + 全部引擎凭据 | 采用蓝本服务商双栏模式：左栏 9 个引擎列表（googleapi / googlecloud / microsoft / deepl / deepseek / openai / gemini / oaicompat / yandex），每行配置圆点 + 「主」「备」徽标；右栏该引擎的字段表单 + 「设为主引擎」「设为备用引擎」按钮（D1 已定） |
| 语言与策略 | 收/发四个语言选择、两个源过滤、决策模式、检测策略、补翻范围与数量 | 纯搬迁换皮 |
| 显示 | 6 个开关、译文颜色、界面语言 | 开关换 `SwitchC`，颜色换 `ColorSwatchRow` |
| 规则 | 保护词、包裹符、跳过前缀、指定语言前缀 | 输入控件换 `TokenListInput` / `TextField` |

- 标签页记忆：BDFDB 的 `collapseStates` 持久化不再适用，改为插件自身的一个界面状态键（仅记住上次停留的标签页，不影响任何翻译行为）。
- 文案：全部复用 `src/i18n/labels.js` 现有键；新增仅限 4 个标签页标题键与少量操作按钮键（设为主引擎/设为备用等）。

### 3.3 面板 B 新设计

- 内容区四个部分保持不变（频道主引擎、识别助手、接收语言、发送语言），控件全部换用 primitives；「不支持」的语言选项在 `SelectMenu` 中禁用并保留原因文案；识别助手的检测反馈用 `StatusLine` 模式。
- 外壳（模态框本体）：首批保留 `BDFDB.ModalUtils` 现有外壳不动，只重做内容区（D2 已定）；换自绘外壳（蓝本第 19 段）留待二期评估。

---

## 4. 阶段划分

每阶段独立可交付、可回退，遵循项目既有节奏：先写失败测试 → 实现 → `npm run verify` → 确定性构建 → 涉及界面行为的部署 PTB 冒烟。

- P0 契约固定（不改产品代码）：把面板 A/B 每个控件的「读哪个设置键、调用哪个 setter、触发哪个刷新」枚举成契约表，填入本文件附录 A；为尚无覆盖的写路径补最小契约测试。此表是重写时的对照总账，防漏防错。
- P1 基础模块：`design-tokens.js` + `primitives.js` + 组件单测（SelectMenu 开合与键盘、SwitchC、NumInput 钳制、TokenListInput 增删、ColorSwatchRow 增删选）。此阶段不接线，产品外观零变化。
- P2 面板 A 重建：新建 `src/ui/settings-panel-v2.js` 并行开发（旧面板继续在线），按 3.2 逐标签页搭建并对照附录 A 接线；完成后切换 `runtime.js:352` 一行指向 v2；旧 `settings-panel.js` 保留一个版本周期再删。
- P3 面板 B 重建：重写 `TranslateSettingsComponent` 内容区；外壳按 D2 决议保留 `BDFDB.ModalUtils` 不动。
- P4 清理收尾：删除旧面板文件与失效样式；验证后移除 `scrollIntoView` 拦截 hack；更新 `docs/README.md` 索引、`docs/settings.md` 相关描述、CHANGELOG 与版本号。

---

## 5. 决策点

已定：

- 类名/令牌前缀 `dat-`，令牌逐条对齐蓝本。
- i18n 文案键全部复用，新增键仅限标签页标题与新按钮。
- 设置语义、键名、默认值零变化。
- D1（用户决议 2026-08-19）：「翻译服务」页采用蓝本式列表交互——左栏引擎列表，右栏字段表单，用「设为主引擎」「设为备用引擎」按钮切换，主备状态用徽标展示。
- D2（用户决议 2026-08-19）：面板 B 首批保留 `BDFDB.ModalUtils` 模态外壳，只重做内容区；自绘外壳留待二期评估。
- D3（用户决议 2026-08-19）：状态胶囊换肤不进首批；待两面板完成、display-unification 重构收尾后再单独决策。

待定：无。开工前决策已齐，剩余唯一前置条件是第 6 节的合并顺序（display-unification 先行）。

---

## 6. 与并行重构（codex/display-unification）的协调

- 合并顺序：display-unification 先合并，本计划分支后合并。本计划从属 `docs/recovery-plan.md` 的顺序控制。
- 隔离方式：新建独立 git worktree + 分支（建议名 `codex/ui-redesign`），基点取 display-unification 的最新提交（它已移动 composer-wiring 与 labels，若基于 master 开工会立即产生结构冲突）。
- 触碰面切割：本计划只动 `src/ui/*` 新文件、`src/i18n/labels.js` 新增键、以及最后一步的 `runtime.js:352` 单行接线。display 侧 5a/5d 动的是 orchestrator / display / runtime 的显示路径。两边在 runtime.js 的重叠仅为接线行，冲突可控。
- 生成产物 `DiscordAITranslator.plugin.js` 与两侧都冲突时不手工合并，一律以重新 `npm run build` 为准。
- 本文件在 display-unification 收尾前保持未提交（untracked）状态，避免混入对方分支的提交。

---

## 7. 风险与对策

| 风险 | 对策 |
| :--- | :--- |
| BetterDiscord 能否直接渲染纯 React 设置面板 | 已验证可行：蓝本插件同一加载器下 `getSettingsPanel` 返回纯 React 元素正常工作。BDFDB 的 `createSettingsPanel` 附带的 collapseStates 持久化改由 3.2 的标签页记忆键替代 |
| 删除 `scrollIntoView` 拦截后面板跳动回归 | P2 先保留 hack 上线，PTB 实测自绘 SelectMenu 无跳动后，P4 再删并冒烟复验 |
| 译文颜色控件为全新自绘 | 行为逐项对照现有 `createTranslatedTextColorInput`，P0 契约表列全（预设选中、自定义添加、删除、悬停提示、持久化） |
| 面板打开期间设置被外部改动（如弹窗改了频道引擎） | 现面板靠 BDFDB 整树重建同步；新面板用 React state，P2 需明确「重开面板必见最新值、打开中不强制同步」的行为并写入附录 A |
| 蓝本行号漂移 | 蓝本版本 ≠ 0.8.5 时按段落标题重新定位；必要时把 0.8.5 快照存档到 Git 外的 `discord翻译-交付/` 存档目录 |
| 界面语言切换后文案残留旧语言 | 现有面板有此修复先例（v0.3.28），新面板文案取值必须走 `getCustomText` 动态读取，禁止构建时固化 |

---

## 8. 附录 A：控件契约表（P0 填充）

待 P0 阶段逐控件填写：控件名 / 所在标签页 / 读取路径 / 写入 setter / 触发的刷新 / 特殊行为（警告、恢复按钮、禁用条件）。

## 9. 附录 B：PTB 冒烟清单（P2/P3 交付门槛）

面板 A：

1. 打开插件设置，四个标签页齐全，顶部构建指纹行正确。
2. 翻译服务页：切换引擎表单跟随；密钥输入、小眼睛切换、保存生效；模型目录在线拉取；微软区域字段仅 Azure 显示；设为主/备后徽标与实际翻译引擎一致；选未配置引擎出提示。
3. 语言与策略页：四个语言选择、两个源过滤、决策模式、检测策略、补翻范围数量全部可改且持久化。
4. 显示页：六开关即时生效；译文颜色预设/自定义增删选并在聊天区生效；界面语言切换后全部文案即时刷新。
5. 规则页：保护词、包裹符、两个前缀编辑往返无丢失。
6. 重启 Discord 后以上设置全部保留；换主题（含 system24）面板跟色。

面板 B：

1. 左键输入框翻译图标打开面板；右键总开关行为不受影响。
2. 频道主引擎覆盖生效、恢复跟随全局生效、选未配置引擎出红色警告。
3. 识别助手：输入 → 检测 → 应用到指定方向。
4. 四个语言选择可改且持久化；不支持的语言组合显示为禁用并带原因。
5. 与面板 A 的同名设置互通（一处改，另一处重开可见）。
