# V2-COUNT-MODE-PRODUCTION-CLOSURE-001 · 屏数来源识别与自动规划生产闭环实施报告

> 日期：2026-11-19　基线：ddc3f18/01c7566。性质：屏数语义补全 + 前后端生产链路打通 + 空屏跳过验收。
> 边界：未新增用户可见按钮/入口/步骤；未新增 Agent/Planner/模型调用/Provider；未改八项 Skill/QC/模型链；未为单品加屏数规则。
> 无 KEY：模式传递/数据流/前端跳过的工程验收已完成；**自动模式的真实 AI 策划质量不标通过**。

---

# 交付 1：屏数来源识别与自动规划实施报告

## 实施前取证（真实代码）
- count 来源：`app-defaults.js:75 detailDefaults.count=10`（前端）；`detail-skills.js:26-31 screenCountRule {min:1,max:12,defaultCount:8}`（后端）。前端默认10、后端兜底8，正常路径前端总传 count。
- count 状态：`detail-state.js:153 useState(detailDefaults)` 内的 `detailSettings.count`；修改入口 `:258-277 updateDetailSetting("count")`（`DetailView.jsx:222-227` 下拉框）；持久化仅经预设/分组 params 间接落盘。
- **实施前 src/ 全目录 grep `shouldGenerate|isEmptyScreen|planningConflict|countTouched|countMode` = 0 命中**：后端上一轮已产出空屏标记，前端从不消费——这是"问题二"的实锤。

## 实施的改造
| 层 | 改动 | 位置 |
|---|---|---|
| 前端模式识别 | detailDefaults 加 `countTouched:false`；用户改 count 置 true（即使改回默认值也保留意图）；payload 加 `countMode: countTouched?"fixed":"auto"` | app-defaults.js / detail-state.js:272 / :398 |
| 前端生图过滤 | 批量 `enabledPrompts` 过滤 `shouldGenerate!==false && !isEmptyScreen`；单屏/重刷入口加空屏守卫；跳过数记事件日志 | detail-state.js:579/453 |
| 前端冲突显示 | DetailView 组头部上方显示 `planningConflict.message`（用 var(--accent)，不引入新 hex） | DetailView.jsx:439 |
| 持久化 | group 白名单加 `planningConflict`，prompt 白名单加 `shouldGenerate/isEmptyScreen`（跨刷新保留） | detail-group.js:15-18/23-28 |
| Middleware 双模式 | 解析 `countMode`（仅显式 "auto" 为 auto，缺省=fixed 兼容旧请求）；auto 时 `prompts` 返回**实际有效屏集合**（过滤空屏），fixed 时保留 count 数组契约；`params` 加 `countMode/effectiveScreenCount`；planningConflict 补 `countMode/effectiveScreens/skippedScreens/hasInsufficientContent/hasTechnicalLimitConflict` 与清晰文案 | detail-middleware.js:837 / finalPrompts / params / conflict |

**不改变**：用户操作流程（下拉框仍在原处）、屏数上限（max=12 未动）、八项 Skill、QC、模型链。

---

# 交付 2：前端 count 来源与状态流转报告
- 初始化默认 count=10，`countTouched=false` → auto。
- 用户通过「生成数量」下拉框修改 → `updateDetailSetting("count")` clamp 后置 `countTouched=true` → fixed（**即使选回10也保持 fixed**）。
- 预设保存 `settings:{...detailSettings}` 含 countTouched；`normalizeDetailSettings` 以 detailDefaults 键集为白名单，已含 countTouched → 从预设恢复保留模式；group.params 同理（middleware 回传的 params 含 countMode，但前端以 countTouched 为准）。
- 页面重渲染不丢（countTouched 在 detailSettings 对象内，useState 整体更新）。
- **未找到"历史所有 count 都当用户主动设置"的证据**，因此旧请求/旧预设默认按 fixed（见兼容交付）。

---

# 交付 3：Middleware 自动/固定模式处理报告
| countMode | 触发条件 | prompts 数组 | 空屏 | planningConflict |
|---|---|---|---|---|
| auto（显式） | payload.countMode==="auto" | **仅有效屏**（finalPrompts 过滤） | 不返回 | 无（已过滤，不算冲突） |
| fixed（显式） | payload.countMode==="fixed" | 长度=count（契约） | 保留但 shouldGenerate=false | 有（内容不足时） |
| 缺省=fixed | 旧请求无字段 | 长度=count | 同上 | 同上 |

运行样本（真实 `buildDetailPromptGroup`，8 屏请求 + 羽绒服资料）：
- 旧请求/无 countMode：prompts=8、mode=fixed、4 空屏、conflict 有。
- auto：prompts=4、effective=4、conflict 无（自动决定4屏）。
- fixed：prompts=8、effective=4、conflict 有（skippedScreens=[5,6,7,8]）。
- auto 跨商品：服装3屏、家居4屏、日化4屏——**不同商品不同屏数，来自同一份资料/同一次本地规划**。

模式一致性：`countMode` 在 count clamp、planning、finalPrompts、params、conflict 全程一致；auto 不被 defaultCount=8 覆盖（AE17）。

---

# 交付 4：shouldGenerate 前端消费与生图调用核查报告
穷举所有消费 prompts 的入口（src/ 全目录）：
| 入口 | 位置 | 是否消费 shouldGenerate | 处理 |
|---|---|---|---|
| 批量生成 | detail-state.js:579 generateDetailGroup | ✅ 本轮新增 | 过滤空屏，跳过数记日志 |
| 单屏生成 | detail-state.js:453 generateDetailPrompt | ✅ 本轮新增 | 空屏守卫直接 return |
| 失败重试/重刷 | main-handlers.js:564 rerunResult → generateDetailPrompt | ✅ 经单屏守卫 | 空屏不重新提交 |
| 自定义板块 | createDetailPromptPlan 产 prompts | N/A | 不受影响 |
| detail-studio 工作区 | detail-studio-generate.js | N/A | 独立链路，不消费此字段 |

**模型调用次数证据**：以 8 屏请求（4 有效+4 空）为例，修复前批量入口 `enabledPrompts.filter(enabled&&status)` 会提交 **8 次** `/api/images`（空屏用"无新增信息"提示词）；修复后过滤条件仅保留有效屏 → 提交 **4 次**。[验证方式]：AE13/AE14 源码断言锁死过滤条件存在；`prompts.length` 在 auto=4、fixed=8 但 `effectiveScreenCount=4`，前端批量以过滤后数组（4）提交。无 KEY 未做真实端到端 fetch 计数，此为代码路径证据。

**不错位证据**：现有定位用 `prompt.screen`（后端 index+1）与 `result.id`（detail-group.js:227/updateDetailPrompt、main-handlers.js:565/findDetailPromptByResult），**不用数组 index**；跳过空屏只减少提交，不改 screen 与 result 归属。auto 模式过滤后 screen 连续（AE9 实测），text 首行"第N屏"与 screen 一致。

---

# 交付 5：规划冲突显示与进度处理报告
- 显示位置：DetailView.jsx 组头部上方（批量按钮之前），用户点批量生成前即可看到；文案："您指定了8屏，目前商品资料只能支持4项独立内容任务；其余4屏缺少独立内容依据，已跳过不生成…"。
- 进度：`detailRunningCount` 统计 status==="running" 的屏；空屏被过滤不进入 running，不记失败；组状态 success/partial 按实际提交的有效屏计算（generateDetailGroup 的 settled 只含有效屏）。
- planningConflict 已在白名单，跨刷新可见。
- 冲突信息含：countMode/requestedScreens/independentTasks/effectiveScreens/skippedScreens/hasInsufficientContent/hasTechnicalLimitConflict/message（AE5/AE6 固化）。

---

# 交付 6：自动屏数与固定屏数测试报告（A-J）
| 项 | 结果 | 证据 |
|---|---|---|
| A 默认 auto | ✅ 前端 countTouched=false→auto；auto 不把默认10当硬性要求；prompts=有效屏 | AE10/AE12/AE2 |
| B fixed 8 | ✅ mode=fixed，prompts=8（4有效+4空标记+conflict），不变3/10 | AE3/AE5 |
| C fixed 5 | ✅ strict count=5（clamp 1-12），不产第6屏 | clamp 源码 + 模式测试 |
| D fixed10 丰富 | ✅ 内容多则独立任务多（实测日化多内容6有效屏） | 跨商品测试 |
| E fixed10 不足 | ✅ 不编造，冲突明确，空屏不提交 | AE5/交付4 |
| F 旧请求兼容 | ✅ 无 countMode→fixed，prompts.length=count | AE1 |
| G 用户切换数值 | ✅ countTouched 置位、预设/params 恢复保留 | 交付2 + AE11 |
| H 前端实际跳过 | ✅ 批量+单屏+重刷三入口过滤；screen/result 对应不变 | AE13/AE14/交付4 |
| I 跨商品 | ✅ 不同商品不同有效屏数（日化4/服装3/家居4）、无空屏正式屏 | AE8/AE9 |
| J 全流程回归 | ✅ 全量门禁 86/86、构建通过，人物/Skill/QC 原断言未破 | 下节 |

---

# 交付 7：旧请求兼容及全量回归报告
- 旧请求（无 countMode）：fixed，prompts.length=count，行为与上一轮完全一致（AE1）。
- 回归结果：控制链 **426/426**（原409+AE17）、engineering-chain ok、module-template ok、planning 76/76、sections 25/25、assets 冻结未破、**全量 86/86**、`vite build` EXIT=0。
- 处理中修复的真问题：① planningConflict 在 fixed 模式错用 finalPrompts.length 导致 effectiveScreens=8/message"跳过0屏"与 skippedScreens=[5,6,7,8] 矛盾——改用 effectiveScreenCount（非空屏数）；② 新冲突提示的 `#a86a10` 触发颜色基线——改 `var(--accent)`；③ 白名单 19→21 键触发 engineering S19——更新断言；④ 新增行数触发 size-ratchet——`--update --reason` 刷新基线（9 处 delta 全为本轮 detail 相关改动）。

---

# 交付 8：修改文件、Commit 与测试清单
修改文件（8）：`server/detail-middleware.js`、`src/features/detail/detail-state.js`、`src/features/detail/detail-group.js`、`src/features/detail/DetailView.jsx`、`src/shared/app-defaults.js`、`scripts/verify/detail-v2-control-chain-check.mjs`、`scripts/verify/detail-v2-engineering-chain-check.mjs`、`scripts/verify/size-ratchet-baseline.json`。
Commit：（提交后回填）

## 十问回答
1. 前端如何识别默认/明确 count？——内部 `countTouched`：初值 false=auto，用户改 count（含改回默认值）置 true=fixed；预设/params 恢复保留。**不增加用户操作**。
2. countMode 是否贯穿真实链路？——是：前端 payload→middleware 解析→count clamp→finalPrompts→params→planningConflict 全程一致（AE2/AE3/AE17）。
3. auto 是否不受默认 count 限制？——是：默认 count 仅作规划输入上限，auto 返回有效屏集合（4<8）；不被 defaultCount=8 覆盖。
4. 自动屏数是否来自同一次 Planner？——是：未新增第二次模型调用；本轮本地路径由同一次内容任务的独立屏集合决定（真实 AI 规划质量待 KEY）。
5. fixed 是否尊重用户数量？——是：prompts.length=count，内容不足出冲突而非改屏数。
6. 前端所有生图入口是否消费 shouldGenerate？——是：批量+单屏+重刷三入口；detail-studio 独立链路不消费（不在本字段作用域）。
7. 空屏是否退出图像模型调用？——是：三入口过滤；8屏案例提交次数从8→4（代码路径证据）。
8. 进度/编号/结果/重试是否正确？——是：定位用 screen/result.id 不用 index；auto 屏号连续；空屏不记失败。
9. 旧调用方兼容？——是：无 countMode=fixed 原语义。
10. 是否仍有默认8/10屏限制？——max=12 无8屏上限；default=8/前端10 仅作缺省值，auto 模式已不作为硬性数量。真实 AI 自主屏数质量待 KEY 验证。

**本轮完成停止，不新增 Skill 规则、不重构 Planner、不加模型调用、不进入下一阶段质量优化。**
