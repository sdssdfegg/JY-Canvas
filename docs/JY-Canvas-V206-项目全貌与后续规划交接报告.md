# JY-Canvas V206 项目全貌与后续规划交接报告

> 交付对象：ChatGPT 项目架构顾问（无仓库访问权限）
> 取证日期：2026-11-12　取证基准：`feature/v171-r-p2-4` 分支，`HEAD = main = bdfc401`，`git status --short` 为空
> 取证方式：只读遍历当前 Git 工作区源码、文档、验证脚本、提交记录；关键结论由统筹 AI 亲自复跑命令二次确认
> 本报告**未修改任何业务代码**；除本文件外未新增项目文档

---

## 0. 阅读前必看：证据分层与判定口径

本报告对每一项能力标注证据等级，避免把不同层级混为一谈：

| 标记 | 含义 | 能否算「已验证可用」 |
|---|---|---|
| 【机】 | 源码级自动化门禁、`check-syntax`、`vite build`、静态断言 | 只能证明代码形态正确 |
| 【沙】 | 沙盒数据、Mock generator、Stub 响应、无头浏览器探针 | 只能证明链路在模拟条件下可走通 |
| 【真】 | 真实 API KEY 调用上游模型、真实出图、Owner 真机人工操作 | 才算真实环境验证 |
| 【文档】 | 仅在设计报告 / 执行单 / README 中定义，代码无消费方 | **不算已实现** |
| 【证据不足】 | 仓库内无足够材料确认 | 不做推测 |

**全项目最重要的单一事实：V200—V206 的八份交付报告中，【真】级别证据为 0。** 所有「测试通过」均为【机】或【沙】。真实 API KEY 的 LLM 调用、真实图片模型多屏批量生成、三类商品 A/B 完整创作，从未执行过。

报告中出现的路径均为仓库相对路径；行号基于 `bdfc401`。

---

## 1. 项目当前总体状态

### 1.1 Git 与交付链状态

| 项 | 实测值 | 证据 |
|---|---|---|
| 分支 | `feature/v171-r-p2-4` | `git branch --show-current` |
| HEAD | `bdfc401` — V206 快捷生成 OOM 修复 | `git log -1` |
| 本地 `main` | `bdfc401`，与 HEAD 一致（`main..HEAD = 0`） | `git rev-parse main HEAD` |
| 工作区 | 干净，`git status --short` 无输出 | 同上 |
| `进行中/` 执行单 | **空**，`docs/执行单/进行中/` 无文件 | 目录列举 |
| 归档执行单 | V198–V206 均在 `docs/执行单/已完成/2026-11/` | 目录列举 |
| 交付报告 | 阶段 1/2/3A/3B/3C/4/5 + OOM 修复，共 8 份，在 `docs/复盘/` | 目录列举 |
| 远端 `origin/main` 是否已同步 | **【证据不足】** 沙箱无法访问 `github.com`，本地 `origin/main` 跟踪引用不能代表远端真实状态 | AGENTS.md「GIT 仓库发布流程」 |

**V206 单本身已全部完成并归档**：`bdfc401`（9 文件 +412/−80）、验收报告 `docs/复盘/V4.0-快捷生成OOM修复验收报告.md`、总表 V206 行原位更新、`NEXT.md` 顶部「当前无在跑单」。但「V206 单完成」不等于「项目整体可用」，见 1.3 与第 14 章。

### 1.2 当前未关闭项

1. **架构 AI 复核 3A 设计报告**：回执从未到达，V200/V202/V203/V204/V205 交付状态均标「待架构复核」。【文档】
2. **总任务书 §七 验收标准末尾在传输中截断**：停在「测试 A/B 模式的完整创作过程：- 商品分析。- 消费者策划。- 整体详情叙事。-」，剩余条目缺失。【文档】
3. **阶段 6（整体预览 / 长图 / 分屏预览 / 导出 / 综合验收）顺延 V207**，`NEXT.md` 明确「不预建、须 Owner 点头另出单」。【文档】
4. **真实模型端到端验证**：全部未做，见第 13 章。【证据不足】
5. **各阶段报告里「交 Owner 实机覆盖」项无回执文件**：阶段 1 §5、阶段 2 §5、3A §5、3B §7-3/§7-9、3C §9、阶段 4 §8/§9、阶段 5 §9 均列了该项，仓库内无对应回执。【证据不足】
6. **本报告第 14 章新发现的 P0/P1 缺陷**（A/B 生成阻断、参考图未传递等），此前无执行单登记。
7. **已知维护债**：Owner 裁决 A 固定「通用任务叶子 + 仅详情适配，旧换装独立零改动」，两份同构代码需同步维护（阶段 4 验收报告 §2）。【文档 + 代码】
8. **旧底座 4 类行业**（motherBaby / pet / jewelry / sports）无完整四字段，V205 未补。

### 1.3 完成度评估（不给百分比，只给依据）

| 维度 | 判断 | 依据 |
|---|---|---|
| **工程实现完成度** | **高** | 独立工作区、目录契约、20 个前端 + 16 个服务端 + 23 个 prompts 文件全部落地；`run-all.mjs` ORDER 84 / FAST_ORDER 70；11 个 V202–V206 新门禁全部注册双数组；`--fast` 70/70、`check-syntax` 422/422、`vite build` EXIT=0【机】；八份阶段报告齐备 |
| **核心业务能力完成度** | **中偏低** | 规划/导演/编译/冻结/质检/生成/版本的代码骨架齐；但 ① A/B 模式冻结后批量生成被键值不一致阻断（第 14 章 P0-1，已实证）② V205 一批专业资产只被门禁扫描、未进模型上下文（第 5 章）③ 用户选项与模型选择在详情创作前端未有效接线（第 6/10 章）④ 三类商品真机创作零验证 |
| **用户实际可用程度** | **低** | 主路径 A/B 当前无法完成「策划 → 冻结 → 批量生成」；模式 C 路径代码层完整但从未用真实 KEY 出图；唯一经过真实数据验证的是 V206 修复后的快捷生成历史浏览（96 条历史、首屏 89 img、无 OOM、`tmp/v206-realdata-check.mjs`【沙】/无头浏览器） |
| **测试与稳定性成熟度** | **中** | 自动化门禁密度高、负向对照规范、public 首启无头冒烟多次 `SMOKE_PASS`【沙】；但全量门禁（非 `--fast`）历史上只在阶段 1 跑过一次 72/81，V203–V206 只报 `--fast`；真实环境证据 0；服务重启恢复、长任务稳定性、多任务并行均无真机记录 |

### 1.4 本项目是什么

面向女装电商设计的**本地桌面级 AI 生图工作台**：浏览器只是壳，随包自带 Node 服务（`127.0.0.1:8787`，内部 Vite 中间件，改源码刷新即生效）。产品定位文档 `docs/项目定位与开发路线.md` 把「快捷生成 / 批量生成 / 批量换装 / 局部回贴 / 换装 SKILL」定为 P0 生命线。V198 起新增「详情创作」独立工作区，目标是 AI 完成电商详情页从需求理解到逐屏出图、单屏修改、预览导出的完整流程。

---

## 2. 项目功能地图

导航共 9 项（`src/features/storage/storage-store.js:19-29`），无路由库，靠 `activeView` 字符串切换（`src/main.jsx:296` useState / `:977` onSelectView / `:627-628` 写 `ACTIVE_VIEW_KEY`）。`package.json` 无 react-router。8 个内容视图 + 2 个弹窗（提示词助手 / 设置）。4 个 `React.lazy`（`main.jsx:93-98`）：OutfitWorkflow / ImageEditorPanel / AiCanvas / DetailStudio。

| 模块 | 入口 | 主要代码 | 核心能力 | 模型/API | 复用共享设施 | 状态与已知问题 |
|---|---|---|---|---|---|---|
| 快捷生成 | `quickgen`（默认视图） | `src/main.jsx:1108` `MainCanvasBoard`、`src/features/quickgen/quickgen-state.js`、`src/features/main-app/panels/main-canvas-board.jsx`、`quick-gallery-card.jsx` | 文生图、结果画廊、历史回载、下载/删除 | `POST /api/images`（`src/api/images.js`） | `CachedImage`、`src/shared/ui/` | V206 修复 OOM 后可用；首屏渲染限量 30 条、预载并发 ≤4；真实数据 96 条验证通过【沙】 |
| 批量生成 / AI 换装 | `outfit` | `src/outfit-workflow.jsx`、`src/features/outfit/`（54 文件：panels 19 / handlers 11） | 批量换装工作流、页面管理、任务执行 | `/api/generate-outfit`、`/api/outfit-*` | 统一 `/api/images`、全局 KEY、并发闸门 | 旧核心功能；`OutfitSettingsModal.jsx:64` 仍有一处 API Key 输入（见 15 章） |
| 批量改尺寸 | `resize` | `main.jsx:1014` + `outfit/panels/BatchResizePanel.jsx` | 批量尺寸处理 | 同上 | 同上 | 与 outfit 共用外壳 |
| 图片编辑 | `image-editor` | `src/image-editor.jsx` | 裁剪/编辑 | 本地处理为主 | `CachedImage` | — |
| 参考生图 | `reference-remix` | `src/features/reference-remix/`（3 文件） | 参考图重绘 | `/api/images` + `/api/reference-prompt-rewrite` | 同上 | — |
| 一键详情/主图（**旧详情模块**） | `detail-main` | `src/features/detail/DetailView.jsx`、`server/detail-middleware.js`、`server/detail-ai.js`、`prompts/server/detail-skills.js` | 旧版详情页生成，含 11 项用户选项（platform / modelMode / richness / ratio / 视觉风格等） | `/api/detail-prompts`、`/api/images` | 统一网关 | **V200–V206 零改动，保持完整**；详情创作工作区只读复用其选项范式，不修改旧模块 |
| 无限画布 | `ai-canvas` | `src/features/ai-canvas/`（16 文件） | Agent 自然语言操作画布节点 | `/api/ai-canvas-agent`（真 LLM） | `postChatCompletion`、设置页 KEY | 与详情创作无耦合 |
| **详情创作** | `detail-studio` | `src/features/detail-studio/`（20）、`server/features/detail-studio/`（16）、`prompts/detail-studio/`（23）、`server/routes/detail-studio.routes.js` | A/B/C 三模式、商品资料、参考图、规划/导演/编译/冻结/质检、批量生成、单屏编辑与版本 | 文本 `postChatCompletion`；图片复用 `/api/images` | 单网关、全局 KEY、`routingFields`、`/api/images`、全局并发 5 | 本报告主体；存在 P0 缺陷，见 14 章 |
| 提示词助手 / 设置 | 弹窗 | `src/features/prompt/`、`src/features/settings/` | 提示词库、全局 KEY / 模型 / 渠道配置 | `/api/config`、`/api/seed-sync`（internal only） | — | `SettingsView.jsx:124` 是全局唯一正式 KEY 入口 |
| 视频 / 局部重绘 / 上传等 | 内嵌 | `src/features/video/`、`local-edit/`、`upload/` | 辅助能力 | 各自端点 | 共享 UI | 与详情创作无直接依赖 |

**共享底座**：`src/api/client.js`（`apiJson:203` / `postJson:279` / `postForm:286`）；`src/shared/ui/` 18 组件；`src/styles/tokens.css` 单套深色语义令牌（`--app-bg` / `--panel` / `--gold` / `--control-h-*` / `--z-*` 等）；`src/shared/routing.js` 模型与渠道目录。

**构建模式**：`src/shared/app-defaults.js:16` `PUBLIC_RELEASE_MODE`；public 下 `storage-store.js:57-99` 清 11 个 localStorage 键 + 删 6 个 IndexedDB 库，`release-seed.js:183` 才生效；`server/routes/seed.routes.js:67-69` 用 `NODE_ENV === "production"` 提前 return 消除 internal-only 的 `/api/seed-sync`。**详情创作路由禁止该守卫**（`server/routes/detail-studio.routes.js:4-6`），`server/app.js:110/112` 无条件注册，故 public 包内产品功能保留。

---

## 3. V200—V206 阶段执行历史

> 口径：只写当前代码里落地的内容。commit 为各阶段交付提交（派工提交另注）。

| 单 | 主题 | 关键 commit | 实际完成 | 当前状态 |
|---|---|---|---|---|
| V200 | 阶段 3A 核心 Agent/SKILL **设计研究**（零业务代码） | `389b7f4`（派工 `29c39c4`） | 3A 设计报告：7 逻辑角色 → 5 执行单元、SKILL 分层包、职责矩阵、A/B/C 调用图、质检上限 | 已交付归档 · **待架构 AI 复核** |
| V201 | **详情创作 UI 布局整改**（Owner 两张实机截图反馈） | `bbcabd9`（派工 `f6edfb4`） | 三下拉移左列、FlowGuidanceBar 主按钮、参考图点击/拖拽/粘贴、能力自检收成单行+折叠、去 checklist 语义；P0 顺带修 3A 报告「11 行业→10 类」 | 已交付归档 |
| V202 | 阶段 3B 核心专业创作能力**框架**实施 B1–B5 | `0674151` / `166cd3e` / `466b0ba` / `4444f50` | 事实分级、全局锁、选项溯源、构图原语、批次①分析、批次②导演、确定性编译与冻结、质检 `MAX_AUTO_FIX=1`、3 行业包（generic/apparel/cleaning）、5 道新门禁 | 已交付归档 · **待架构 AI 复核** |
| V203 | 阶段 4 批量生成与任务管理 | `b5e7086`（派工 `3d2fa73`） | `server/core/task-store-core.js` 通用叶子、详情任务状态机、幂等、失败隔离、有限重试、断点恢复、结果落 `data/detail-studio/generation/` | 已交付归档 · 待架构复核；Owner 裁决 A 固定「旧换装不共用」 |
| V204 | 阶段 5 单屏连续编辑与版本管理 | `ba40411`（派工 `1b9b1ee`/`6c3a8ee`） | `screenVersions[]` / `currentVersionIds` / `editThreads`、`idempotencyKey` 绑定 `versionId`、VersionPanel、4 个新 verify | 已交付归档 · 待架构复核 |
| V205 | 阶段 3C 专业 Agent/SKILL **内容层** | `24f246c`（派工 `1077bbd`/`b01fe3f`） | 4 行业覆盖包、platform 规则包、参考图角色、文案禁词、案例库、方法论、质检清单深化、2 道门禁 | 已交付归档 · 待架构复核；**部分资产未接入执行链**（第 5 章） |
| V206 | **快捷生成 OOM 修复**（生产阻断缺陷，非创作功能） | `bdfc401`（派工 `f166c2f`） | `CachedImage` 视口门控 + 并发 ≤4 + 去 `decode()`、渲染层限量 30 + 加载更多、首屏图片数门禁 | 已交付归档（唯一不待复核） |

### 3.1 逐阶段细项

#### V200 · 阶段 3A 设计
- **原始目标**：Owner 调整阶段 3 重心为「核心创作能力优先」，先做架构与能力设计，不大规模开发。
- **实际完成**：`docs/复盘/V4.0-详情创作工作区-阶段3A设计报告.md`（343 行）。定义 7 逻辑角色、收敛为「1 控制器（无模型）+ 2 批次规划调用 + 1 确定性编译器 + 1 独立质检」、10 项 SKILL 评估、A/B/C 调用流程、行业加载机制、质检一次修正上限、3B 五批实施顺序。
- **核心代码变更**：无（零业务代码，不刷基线、不 build）。
- **架构变化**：仅文档。
- **测试**：未跑门禁（设计阶段）。
- **遗留**：3A 复核回执至今未到；报告里「A/B 3 次调用」与实现「≤4 次」口径不一致（见 5.3）；`docs/执行单/已完成/2026-11/...V200...md` 状态「待架构复核」。
- **状态**：已完成但存在未验证项（设计未经真实创作验证）。

#### V201 · UI 整改
- **原始目标**：Owner 实机反馈七条——界面看不懂、不是所有项必填、缺主流程按钮、只有产品图必传、上传要支持粘贴/拖拽、能力自检占屏过大、模型渠道三下拉应放左列。
- **实际完成**：`FlowGuidanceBar.jsx`（80 行，主按钮仅 `saveProject({})`、不触发生图）、`ReferenceImageDropzone.jsx`（198 行，三入口 + 缩略图 + 三角色分块）、`DetailStudioView.jsx` 左列包裹 `DetailStudioProjectPanel` + `ModelChannelConfigPanel`、`DetailStudioCapabilityPanel.jsx` 单行状态条 + 「开发者信息」折叠、GuidedIntakePanel 去 checklist 语义。
- **核心代码变更**：上述 5 个前端组件 + CSS + 模型参数链回归 `scripts/dev/verify-detail-studio-model-chain.mjs`。
- **架构变化**：确立 `.detailStudioGrid`（左 `minmax(280px,360px)` / 右 `1fr`）布局契约，写入 V201 §2 供后续阶段沿用。
- **测试**：check-syntax 374/374、`--fast` 59/59、`vite build` EXIT=0、参数链 12/12、真机浏览器探针 `rootChildren=1`【沙】。
- **遗留**：Owner 肉眼终验（粘贴/拖拽/折叠/非最大化窗口）无回执；「生成按钮」按阶段边界只做「保存并继续」，批量生成属阶段 4。
- **状态**：已完成并验收（UI 交互细节待真机）。

#### V202 · 阶段 3B 框架
- **原始目标**：把 3A 设计落成可执行框架，优先保证「展示提示词 == 实际生成提示词」。
- **实际完成**：`prompts/detail-studio/core/` 5 文件、`prompts/` 2 文件、`quality/` 2 文件、`industry/` 4 文件（含 index + 3 包）、`server/features/detail-studio/planning/` 4 文件、5 道新门禁。
- **核心代码变更**：`analyze-strategy.js:191` 与 `director-visual.js:200` 各 1 次 `postChatCompletion`；`compile-screen.js` 纯函数零调用；`qc-review.js:20 MAX_AUTO_FIX=1`。
- **架构变化**：新增 planning 业务区、结构化 `ScreenSpec[]`、`frozenPrompts`、事实四级分级（`user/visible/inferred/unconfirmed`，`unconfirmed` 不得 publish）、`appliedOptions` 溯源。
- **测试**：check-syntax 397/397、`--fast` 64/64、`vite build` EXIT=0、`frozen-prompt-parity-check`、`mode-c-purity-check`（带负向对照）、`option-effect-check`、`qc-ceiling-check`、`industry-strategy-match-check`【机】；public 首启 `rootChildren=1`【沙】。
- **遗留**：三类商品 A/B 完整创作、项目重启恢复、真实 LLM/出图均交 Owner；全量门禁未回填。
- **状态**：已完成但存在未验证项。

#### V203 · 阶段 4 批量生成与任务管理
- **原始目标**：≤20 屏、每屏独立任务、失败隔离、单屏重试、断点恢复、幂等防重复扣费；R1 沿用全局并发 5、R2 抽通用任务层。
- **实际完成**：`server/core/task-store-core.js`（338 行零依赖叶子，六机制）、`generation/task-model.js`（6 态）、`orchestrator.js`、`local-images-generator.js`、`routes.js`、前端 `GenerationPanel.jsx`。
- **架构变化**：详情任务系统独立，`idempotencyKey = sha256(projectId|screenIndex|versionId|frozenPrompt)`（V204 补 versionId）；账本 `ledger` 启动时 `rebuildLedger`。
- **测试**：check-syntax 404/404、`--fast` 64/64、`vite build` EXIT=0、core 10/10 + orchestrator 11/11（mock generator）、public 首启 `SMOKE_PASS`【沙】。
- **遗留**：真机端到端出图未跑；R2 最终形态经 Owner 裁决 A 定为「通用叶子 + 仅详情适配，旧换装零改动」，两份同构代码为已知维护债；`server/core/task-store-core.js` 是 V200–V206 期间**唯一新增**的 core 文件。
- **状态**：已完成但存在未验证项。

#### V204 · 阶段 5 单屏连续编辑与版本
- **原始目标**：单屏独立编辑、连续对话式修改、版本历史/对比/切换、单屏修改不影响其他屏。
- **实际完成**：`server/features/detail-studio/versions/{version-store,version-routes}.js`、`src/features/detail-studio/versions/VersionPanel.jsx`（374 行）、`project-store.js` 增 `versions` 子对象、4 道新 verify。
- **架构变化**：`screenVersions[] / currentVersionIds / editThreads` 落在 `project.versions`（**不是顶层字段**，与早期任务书描述不同）；切换版本只改 `isCurrent` + `currentVersionIds`，不删历史、不覆盖图片。
- **测试**：check-syntax 411/411、`--fast` 66/68（2 项 V11 环境性）、`vite build` EXIT=0、public 首启 `SMOKE_PASS`【沙】；统筹独立复跑 68/68 后转绿（`version-routes.js:19` 缺失导出修复）。
- **遗留**：public 真机交互目视终验交 Owner；版本 `pending` 状态无重启自愈（14 章 P1-7）。
- **状态**：已完成但存在未验证项。

#### V205 · 阶段 3C 内容层
- **原始目标**：补齐 3A §3.2.1 分层包里 3B 没做的「内容层」，不重写框架、不增 Agent 数。
- **实际完成**：`industry/{beauty,home,food,electronics}.js` 四覆盖层、`platform/index.js`、`references/{reference-image-roles.js,reference-image-guide.md,copywriting.js,case-library.js,methodology.js}`、`quality/checklist.js` 并入禁词/叙事弧、`qc-prompt.js` 维度 1 改名 + 注入接口；2 道门禁。
- **架构变化**：行业 `MERGED = {...旧底座 10 类, ...四字段覆盖 6 类, cleaning 自包含}`，共 11 个策略 id，完整四字段仅 7 个。
- **测试**：check-syntax 421/421、`--fast` 69/69、`vite build` EXIT=0、两门禁负向对照全过【机】；统筹动态 import 实证四包决策逻辑逐包不同、`promoBoundaries` 真进导演提示词【机】；public 首启 `SMOKE_PASS`【沙】。
- **遗留**：**platform / reference-image-roles / case-library / guide.md 仅被 `skill-asset-contract-check.mjs` 扫描，未进模型上下文**（14 章 P1-3）；4 个旧底座行业无四字段；三类商品端到端未做。
- **状态**：部分完成（资产落地，接入不完整）。

#### V206 · OOM 修复
- **原始目标**：修复 Owner 实机「切换到快捷生成 → 内存不足 / Out of Memory」的生产阻断缺陷。
- **根因实证**：`CachedImage` 的 `[src]` effect 无条件 `preloadDisplayImageUrl()`（`new Image()` + `decode()`）绕过 `loading=lazy`，叠加画廊全量渲染 93–96 条历史大图（534 MB / 172 文件、平均 399 万像素、单张位图约 15 MB、理论解码峰值 ≈1.4 GB）。
- **实际完成**：`cached-image.jsx` 视口门控（IntersectionObserver 200px）+ `MAX_CONCURRENT_PRELOADS=4` + FIFO 队列 + 取消 + 去 `decode()`；`main-canvas-board.jsx` 渲染层 `slice` 最近 30 + 「加载更早的记录」；`quickgen-image-budget-check.mjs`（8/8 含 4 负向对照）。数据层零截断。
- **测试**：check-syntax 422/422、`--fast` 70/70、`vite build` EXIT=0、public 首启 `SMOKE_PASS`【沙】；统筹在 Owner 真实 96 条历史上独立复跑：首屏 89 img / 堆 23 MB / 无 OOM / 加载更多 30→60 生效（`tmp/v206-realdata-check.mjs`）【沙】。
- **遗留**：Owner 真机大历史目视确认属锦上添花、非阻断。
- **状态**：已完成并验收（唯一伴随真实数据无头验证的一单）。

### 3.2 V204–V206 依赖关系

- V204 依赖 V203 的任务层与 `idempotencyKey`（V204 把 `versionId` 加进键，避免同屏连续生成命中旧账本）。
- V205 依赖 V202 的 planning 分层包结构，只在 `prompts/detail-studio/**` 内加内容，不改前端/服务端。
- V206 与详情创作**无代码耦合**，修的是共享 `CachedImage` 与 `MainCanvasBoard`；其副作用是限制了所有视图的历史图渲染量（首屏 30 条 + 按需加载）。
- 阶段 6（预览/导出）代码**不存在**：`src/features/detail-studio/README.md:67` 的 `export/` 明确是「规划占位，不预建」。

---

## 4. 详情创作工作区当前真实架构

### 4.1 进入方式与视图组织

- 导航 id `detail-studio`（`storage-store.js:27`，图标 `LayoutTemplate`），`main.jsx:1090` 分发到 `<LazyDetailStudio />`（`:98` lazy 声明，指向 `components/DetailStudioView.jsx`）。
- 该 lazy 视图**无 props**，自行从 localStorage 读设置与 KEY、自行拉 `/api/config` 与 `/api/detail-studio/*`。
- 无独立路由；项目内所有状态由 `useDetailStudioState()` 单个 hook 管理（16 个 useState、无 Context / zustand / useReducer）。

### 4.2 前端组件关系（代码实证）

`src/features/detail-studio/` 20 文件，按区：

| 区 | 文件（行数） | 职责 |
|---|---|---|
| constants | `workspace-contract.js`(54) | 模式枚举、参考图角色、上限、自检默认；零依赖叶子 |
| state | `use-detail-studio-state.js`(537) | 唯一业务状态与约 30 个动作 |
| components | `DetailStudioView.jsx`(61)、`DetailStudioProjectPanel.jsx`(103)、`DetailStudioBasicsPanel.jsx`(89)、`DetailStudioCapabilityPanel.jsx`(194)、`FlowGuidanceBar.jsx`(80) | 根组合、项目列表/新建、基础信息、能力自检、流程引导 |
| intake | `IntakeArea.jsx`(43)、`ModelChannelConfigPanel.jsx`(121)、`ProductDataPanel.jsx`(116)、`ReferenceImagesPanel.jsx`(71)、`ReferenceImageDropzone.jsx`(198)、`mode-a/GuidedIntakePanel.jsx`(77)、`mode-b/AssistedIntakePanel.jsx`(56)、`mode-c/DirectPromptPanel.jsx`(203) | 录入与三模式面板 |
| planning | `PlanningPanel.jsx`(282) | 分析/导演/编译/冻结/质检五段 UI |
| generation | `GenerationPanel.jsx`(170) | 进度、任务列表、重试/取消 |
| versions | `VersionPanel.jsx`(374) | 版本列表/对比/切换/连续对话 |
| styles | `detail-studio.css`(1643) | token-only 样式，零 hex |

`DetailStudioView.jsx:40` `.detailStudioGrid`（`css:46-51`，左 `minmax(280px,360px)` / 右 `1fr`）：
- 左列 `.detailStudioLeft`:41-44 = 项目面板 + 三个下拉配置面板
- 右列 `.detailStudioColumn`:45-55 自上而下 = `FlowGuidanceBar` → `BasicsPanel` → `CapabilityPanel`（单行状态条 + 折叠） → `IntakeArea` → `PlanningPanel` → `GenerationPanel` → `Suspense` 内 `VersionPanel`
- 响应式单列 `css:963-964`

### 4.3 项目创建 / 保存 / 读取 / 恢复

- 创建：`DetailStudioProjectPanel.jsx:96` → state `createProject` → `createDetailStudioProject` → `POST /api/detail-studio/projects`；`mode` 在创建时选定，服务端 `updateDetailStudioProject` 白名单不含 `mode`，**创建后不可变**。
- 保存：所有动作走 `updateDetailStudioProject`（`PUT /projects/:id`），服务端受控合并白名单 `name/note/status/modelConfig/productData/referenceImages/modeC/planning`（`project-store.js:283-337`）。
- 读取：`openProject`(`use-detail-studio-state.js:132-147`) → `GET /projects/:id` + `GET /reference-images`，truth 全在服务端 `project.json`。
- 恢复：项目数据落 `data/detail-studio/projects/<id>/project.json`，不在 localStorage、不进 seed、不进 `data/results`（7 天 TTL）。public 首启清库不影响服务端项目数据。【机/代码实证】
- **未验证**：项目关闭后重新打开、服务重启后的完整恢复流程（第 13 章）。

### 4.4 A/B/C 三模式前端实际运行方式

`IntakeArea.jsx:13-17` `MODE_PANELS = {guided, assisted, direct}`，按 `current.mode` 分派；渲染顺序 `:34-39`：模式标签 → `ProductDataPanel` → `ReferenceImagesPanel` → 模式专属面板。

- **A（guided）** `GuidedIntakePanel.jsx`：必填 1 项（产品图）+ 可选 3 项标签化说明（V201 去掉 checklist 语义），**无任何按钮**。
- **B（assisted）** `AssistedIntakePanel.jsx`：3 条引导文字 + 状态点，**无任何按钮**。
- **C（direct）** `DirectPromptPanel.jsx`：四边界完整 UI——`rawPrompt`:74-95（落库后只读 `pre` + 锁标）、`tidyVersion`:154-173（默认关闭、可编辑）、`diff`:134-152（行级 `+/-/` + summary）、`frozenPrompt`:177-194（「冻结并用于生成」按钮）；另有「生成整理版并识别屏结构」:102-104 与屏结构 chips。

⚠️ **`PlanningPanel.jsx` 全局挂载、不按 mode 分支**（`DetailStudioView.jsx` 组合中无 mode 条件）。因此模式 C 用户在前端同样能看到「运行商品分析 / 生成分屏方案」按钮。这是**前端未做模式隔离**；后端 C 路径的零调用隔离是真实的（第 6 章），但「三种模式必须是真正独立的业务路径」在 UI 层未完全兑现。

⚠️ 全目录 grep 无「生成策划方案」按钮；主按钮只有 `FlowGuidanceBar.jsx:64-74` 的「保存并继续」（仅 `saveProject({})`）。

### 4.5 服务端业务区

`server/features/detail-studio/` 16 文件：`store/project-store.js`(369)、`model/model-config.js`(35)、`probe/capabilities.js`(153)、`intake/mode-c.js`(188)、`planning/{analyze-strategy 222, director-visual 228, compile-screen 45, qc-review 151}`、`generation/{orchestrator 323, routes 155, task-model 142, local-images-generator 70, task-store 25}`、`versions/{version-routes 183, version-store 163}`。入口 `server/routes/detail-studio.routes.js`(385)。

### 4.6 数据在各阶段如何传递

```
项目 JSON（data/detail-studio/projects/<id>/project.json）
  ├─ modelConfig{textModel,imageModel,channelId}
  ├─ productData{fields{},text}          ← 自由 key-value，无固定 schema
  ├─ referenceImages[{id,role,url,filename,label,note}]
  ├─ modeC{rawPrompt,tidyVersion,diff,frozenPrompt,frozenAt}
  ├─ planning{analyze,appliedOptions,globalLock,industryId,screens[],narrativeSummary,visualDNA,frozenPrompts{}}
  └─ versions{screenVersions[],currentVersionIds,editThreads{}}
        │
        ├─ A/B：analyze → director(ScreenSpec[]) → compile(frozenPrompts) → freeze 落库 → generation/start
        ├─ C：frozenPrompt → splitIntoScreens → generation/start（原文不改）
        └─ 单屏编辑：versionId → submitSingleScreen → /api/images → finalizeVersion
```

---

## 5. Agent / SKILL 当前实际能力

### 5.1 逻辑角色：文档 7 个 → 代码 5 个执行单元

3A 设计报告 `:60-72` 定义 7 个逻辑角色（总控、商品分析、电商策划、详情导演、视觉设计、生图 Prompt、质量审查）。当前代码实际为：

| 执行单元 | 文件 | 模型调用 | 职责 |
|---|---|---|---|
| 总控控制器 | `server/routes/detail-studio.routes.js` | 0 | 端点编排、校验、落库 |
| 批次① 商品分析 + 电商策划 | `server/features/detail-studio/planning/analyze-strategy.js:162` | 1 次 | 结构化 JSON：事实分级、消费者购买逻辑、信息缺口、`appliedOptions` |
| 批次② 详情导演 + 视觉设计 | `server/features/detail-studio/planning/director-visual.js:171` | 1 次 | `ScreenSpec[]`、叙事摘要、`visualDNA` |
| 确定性编译器（生图 Prompt 角色） | `server/features/detail-studio/planning/compile-screen.js:18` → `prompts/detail-studio/core/prompt-compiler.js:24` | **0 次** | 九段顺序拼装每屏 `frozenPrompts` |
| 独立质检 | `server/features/detail-studio/planning/qc-review.js:99` | ≤2 次 | 六类检查 + 一次定向修正 + 再审查 |

另 `probe/capabilities.js` 的文本探针（`/probe/text`）调 1 次 `postChatCompletion`，属能力自检、不属创作链路。

### 5.2 SKILL / 资产清单与接入判定（**本节是全报告最关键区分**）

`prompts/detail-studio/` 23 文件。判定依据：`server/` 中 `from "...detail-studio..."` 的 import 全仓仅 10 条，集中在 4 个 planning 文件。

| 资产 | 位置 | 消费点 | 判定 |
|---|---|---|---|
| `core/fact-grading.js` | 四级事实分级、`isPublishableGrade` | `director-visual.js:19`、`prompt-compiler.js:12`、`checklist.js:14` | **已接入**（编译/导演/质检三处兜底） |
| `core/global-lock.js` | 全局一致性锁 + 每选项→约束 trace | `analyze-strategy.js:19`；`director-visual.js` 复用 `buildAnalyzeContext` | **已接入** |
| `core/option-trace.js` | `appliedOptions` 溯源与完整性 | `analyze-strategy.js:20`、`checklist.js:16` | **已接入** |
| `core/screen-composition.js` | 构图原语、6-3-1 信息层级、模块库 | `director-visual.js:18` | **已接入** |
| `core/prompt-compiler.js` | 确定性九段编译 | `compile-screen.js:11` | **已接入** |
| `prompts/analyze-strategy.js` / `director-visual.js` | 系统提示 + JSON schema + user prompt | `analyze-strategy.js:24` / `director-visual.js:23` | **已接入** |
| `quality/checklist.js` | 六类质检、禁词扫描、叙事弧自检、`applyDirectedFix` | `qc-review.js:16` | **已接入**（确定性部分） |
| `quality/qc-prompt.js` | 质检系统提示 | `qc-review.js:17` | **部分接入**：`industryStrategy` 入参 `:40/:63-67` 已定义，但 `qc-review.js:31-36` 的 `callQcModel` 不传该参数 → `promoBoundaries` **未进质检上下文**，走 `:67` 通用兜底 |
| `industry/index.js` + 7 子包 | `MERGED`、`getIndustryStrategy` | `analyze-strategy.js:25` → 导演 `prompts/director-visual.js:102/:123` | **已接入**（行业 `promoBoundaries` 真进导演提示词） |
| `references/copywriting.js` | 禁绝对化/医疗化词表、消费者语言 | 仅 `scanForbiddenWords:76` 被 `checklist.js:18/:84` 使用 | **部分接入**（`CONSUMER_LANGUAGE` / `COPY_DIRECTIONS` / `copyHierarchy` 零消费） |
| `references/methodology.js` | 叙事弧、信息节奏、视觉多样性 | 仅 `narrativeSelfCheck:72` 被 `checklist.js:20/:133` 使用 | **部分接入** |
| `platform/index.js` | 11 平台规则、`buildPlatformContext` | **仅** `scripts/verify/skill-asset-contract-check.mjs:15` 扫描 | **资产存在但未接入创作链路**；服务端走旧底座 `prompts/server/detail-skills.js:395 getPlatformSkill` |
| `references/reference-image-roles.js` | 三角色 + `roleGuard` | **仅** `skill-asset-contract-check.mjs:16` | **未接入**；服务端内联 `project-store.js:25 DETAIL_STUDIO_REFERENCE_ROLES` |
| `references/reference-image-guide.md` | 方法论文档 | 零 import | **未接入** |
| `references/case-library.js` | 优秀/失败案例库 | **仅** `skill-asset-contract-check.mjs:17` | **未接入** |

**结论**：V205 交付的「专业能力内容层」约有一半是**结构化资产已落盘但未进入模型上下文**。这不是进度问题而是接线问题，修复成本低、收益直接，见第 16 章方向 3。

### 5.3 调用次数：设计 3 次 vs 代码 ≤4 次

3A 报告 `:49/:72` 写「A/B 模式 3 次调用上限」。代码实际：analyze 1 + director 1 + quality（review 1 + re-review ≤1）= **≤4 次**。`qc-ceiling-check.mjs:42-44` 断言的正是「恰好 2 处调用点」、`MAX_AUTO_FIX=1`（`qc-review.js:20`）。差异原因文档未记录；【证据不足】re-review 是否在运行时真触发（取决于 blocker findings 与 `applyDirectedFix.changed`）。

### 5.4 重复、冲突与职责不清

- **行业包双来源**：`prompts/server/detail-skills.js` 旧底座 10 类 + `prompts/detail-studio/industry/` 新覆盖层 6 + cleaning 自包含，`index.js:37-49` 合并。旧底座 4 类（motherBaby/pet/jewelry/sports）仍参与文本打分（`index.js:64`）但无四字段 → 命中后只有通用兜底。
- **平台规则双来源**：新 `platform/index.js` 未接入，服务端仍调旧底座 `getPlatformSkill`。
- **参考图角色双来源**：新 `reference-image-roles.js` 未接入，服务端用 `project-store.js:25` 内联常量。
- **提示词资产 vs 执行单元同名**：`prompts/detail-studio/prompts/director-visual.js`（提示词）与 `server/features/detail-studio/planning/director-visual.js`（执行单元）容易混淆，但 import 关系清晰。
- **文档漂移**：`probe/capabilities.js:32` 自报 `stage:2`，而代码已到阶段 5；`src/features/README.md:3` 称「多数板块尚未落地」，与 54 个 outfit 文件、20 个 detail-studio 文件不符；`src/shared/ui/README.md:34` 写「7 项 navItem」，实际 9 项。

---

## 6. A/B/C 三种模式执行链路

### 6.1 模式 A（guided，专业引导策划）

| 环节 | 代码 | 模型调用 | 输入上下文 | 输出/落库 |
|---|---|---|---|---|
| 资料录入 | `ProductDataPanel.jsx`、`GuidedIntakePanel.jsx` | 0 | 自由 key-value + 描述文本 | `productData` |
| 参考图 | `ReferenceImageDropzone.jsx` → `POST /reference-images` | 0 | 三角色标注 | `referenceImages[]` |
| 商品分析+策划 | `POST /planning/analyze` → `analyzeProductStrategy:162` | **1** | `buildAnalyzeContext`: 商品资料、`getIndustryStrategy`、`getPlatformSkill`、`buildGlobalLock`（11 选项）、`buildAnalyzeUserPrompt` | `planning.analyze`、`appliedOptions`、`globalLock`、`industryId` |
| 导演分屏 | `POST /planning/director` → `directVisualPlan:171` | **1** | 复用 `buildAnalyzeContext` + `publishableFacts` + `selectScreenModule` | `planning.screens[]`（`id=screen_N`，≤20）、`narrativeSummary`、`visualDNA` |
| 编译 | `POST /planning/compile` → `compileScreenPlan:18` | **0** | `ScreenSpec` + `globalLock` + `visualDNA` + `referenceAssets` | 返回 `frozenPrompts`（**不落库**） |
| 冻结 | `PUT /planning/freeze` → `recompileForFreeze:43` | **0** | 服务端重编译，不信任客户端 | `planning.frozenPrompts` 落库 |
| 质检 | `POST /planning/quality` → `runQualityCheck:99` | **≤2** | 六类 checklist + 质检提示词 | `findings` / `needsHuman`，不落项目 |
| 批量生成 | `POST /generation/start` → `buildBatchSpec` → `submitBatch` | 0（文本侧） | `planning.screens` + `frozenPrompts` | 每屏一任务 → `/api/images` |

**用户确认节点**：有。编译产物在 `PlanningPanel.jsx:195` readOnly textarea 展示，「冻结提示词」由用户点击；质检独立；生成需用户点「开始批量生成」。**但** `frozenPrompts` 在编译后由服务端重新编译落库，前端展示的是 `/planning/compile` 的返回，二者同源（`recompileForFreeze` 调同一 `compileScreenPlan`），`frozen-prompt-parity-check.mjs` 有「同屏编译两次字节一致」断言【机】。

🔴 **P0-1：A/B 模式冻结后批量生成当前被阻断（统筹已实证）**
- `director-visual.js:127` 生成 `id: \`screen_${index+1}\`` → `screen_1`、`screen_2`…
- `compile-screen.js:32` 写 `frozenPrompts[screen.id]` → 键为 `screen_1`
- `generation/routes.js:70` 读 `frozenMap[i]`（数字索引 0、1…），回退 `screen.frozenPrompt || screen.raw`（`ScreenSpec` 无这两个字段）
- 结果：所有屏 `fp` 为空 → `:71 if (!fp) return` 全部跳过 → `:85 throw new Error("没有可生成的屏（请先冻结提示词 / 完成分屏规划）")`
- 实证命令：构造含 2 个 `screen_N` + 对应 `frozenPrompts` 的项目，调 `buildBatchSpec(project, {})`，补合法渠道 `silent-tt26-line-01` 后仍抛该错。
- **影响**：A/B 两条主路径无法完成出图；模式 C 不受影响（走 `splitIntoScreens` 分支）。详见 14 章。

### 6.2 模式 B（assisted，AI 辅助策划）

后端链路与 A **完全相同**（`buildBatchSpec` 的 `else` 分支把 guided/assisted 合并处理），差异仅在前端 `AssistedIntakePanel.jsx` 的引导文案与 `productData.text` 里保留的用户原始想法。3A 设计里「B 保留用户原始意图字段 `rawIntent`」在当前项目 JSON 中**无独立字段**，用户原意混在 `productData.text` 中。【代码事实】
「AI 补充、完善但保留原意」目前没有专门的结构化保障（无 `rawIntent` / `assistPatch` / 采纳状态字段落在 planning 结果里）；V204 补的 `agentSuggestion/adoption` 兼容位在 `editThread`，不在策划阶段。

### 6.3 模式 C（direct，完整提示词直接生成）

| 环节 | 代码 | 模型调用 |
|---|---|---|
| 原文保存 | `PUT /projects/:id`（`modeC.rawPrompt`） | 0 |
| 只读保证 | `project-store.js:32-47 sanitizeModeC:37-39` 非空后忽略新值 | 0 |
| 解析/切屏 | `POST /intake/mode-c/parse` → `parseModeCTidy:173`（`intake/mode-c.js` **零 import 纯函数**） | 0 |
| 整理版 | `tidyPrompt:25` 排版归一 + `splitIntoScreens:137` 按 `// 屏 N` / 序号 / 空行切 `screens[]`，原文一字不改 | 0 |
| 差异 | `computePromptDiff:47`（LCS 行级 diff）+ `structure{rawScreenCount,tidyScreenCount,boundaryShift}` | 0 |
| 冻结 | `PUT /intake/mode-c/freeze` 只写 `frozenPrompt/frozenAt` | 0 |
| 生成 | `generation/routes.js:48-51` `splitIntoScreens(frozen)` → 每屏 `part.raw` → `orchestrator.js:186` → `local-images-generator.js:23 form.set("prompt", req.frozenPrompt)` | 0（文本侧） |

**C 模式隔离结论**：✅ 真正绕过 Planner / Skill / 质检 / AI 改写。`mode-c.js` 零 import；`mode-c-purity-check.mjs` 带负向对照（反向断言路由文件里 `postChatCompletion` 确实存在，防扫描空区域假绿）；生成请求体 `prompt` 直接取 `frozenPrompt`，**无后端二次改写**。这是当前实现最扎实的一条架构保证。

### 6.4 最终生成是否严格使用冻结提示词

- C：是（字节传递，`frozen-prompt-parity-check.mjs` 有断言）。
- A/B：设计上「展示 == 落库 == 发送」同源，但**当前因 P0-1 根本走不到发送**。
- ⚠️ 单屏编辑路径 `version-routes.js:48` 的 `frozenPrompt` 取自**请求体**，服务端只校验非空（`:49`），未与 `planning.frozenPrompts` 或版本链比对 → 用户/调用方可传任意文本，属信任边界缺口（14 章 P1-5）。

---

## 7. 行业策略与专业创作能力

### 7.1 行业包实测

`prompts/detail-studio/industry/index.js:57 getIndustryStrategy(text, explicitIndustryId)` 三条规则：① 显式 `industryId` 优先（`:58-61`）② 同分按命中词长度 → `conflictPriority` → id 稳定序（`:80-93`）③ 新包不复用旧包泛词（`cleaning.js:16` 关键词不含裸「清洁」，化解 `home` 旧底座 `detail-skills.js:82` 已含「清洁」的抢词问题）。`MERGED`（`:49`）= 旧底座 10 类 + 四字段覆盖 6 类 + `cleaning` 自包含 = **11 个策略 id**。

| 行业 | 独立文件 | 决策逻辑/内容/视觉/事实边界四字段 | 专属结构 | 说明 |
|---|---|---|---|---|
| generic | `generic.js` | ✅ | 兜底 | 零命中回退 |
| apparel 服装 | `apparel.js` | ✅ | ✅ | V202 建 |
| cleaning 清洁日化 | `cleaning.js`（自包含 12 字段 + `conflictPriority:10`） | ✅ | ✅ | V202 新增，**不在旧底座** |
| beauty 美妆 | `beauty.js` | ✅ | ✅ | V205 四覆盖层之一 |
| home 家居 | `home.js` | ✅ | ✅ | V205 |
| food 食品 | `food.js` | ✅ | ✅ | V205 |
| electronics 3C | `electronics.js` | ✅ | ✅ | V205 |
| motherBaby / pet / jewelry / sports | 仅旧底座 `detail-skills.js:45-156` | ❌ 无四字段 | ❌ | 仍参与文本打分，命中后只有通用兜底 |

动态 import 实证（`getIndustryStrategy('', id).strategy`）：四包的 `decisionLogic`（成分与质地 / 空间适配与耐用 / 真实食欲 / 参数可信）、`contentPlan`、`visualExpression`、`promoBoundaries` 逐包实质不同，旧底座 `keywords/taboos/qcRules` 合并完整；`promoBoundaries` 真注入导演提示词 `prompts/detail-studio/prompts/director-visual.js:102/:123`【机】。**不是替换行业词汇**。

### 7.2 完整专业创作链路的达成度

| 环节 | 实现 | 判定 |
|---|---|---|
| 产品信息分析 | 批次① `ANALYZE_OUTPUT_SCHEMA` + 事实四级分级 | ✅ 基础实现，结构化 JSON |
| 用户需求分析 / 客户痛点 / 购买动机 / 决策逻辑 | 批次① `consumerLogic` 字段（系统提示要求） | ⚠️ 只有 schema 与提示词约束，**无确定性校验、无真实模型输出样本**；产出质量【证据不足】 |
| 页面故事线 | 批次② `narrativeSummary` | ✅ 字段存在 |
| 页面结构 | `ScreenSpec[]`（≤20，`id=screen_N`，含 role/goal/composition/hierarchy/copy/referenceAssets/prev-next） | ✅ 结构化 |
| 单屏内容策划 | `screen-composition.js` 模块库 + 6-3-1 层级 + `copy` | ✅ 结构化 |
| 视觉方案 | `visualDNA{palette,lighting,mood,fontTone}` + 每屏 `composition` | ✅ 结构化 |
| 可执行图片提示词 | `prompt-compiler.js` 九段确定性拼装 | ✅ 代码完整，但 A/B 因 P0-1 进不了生成 |
| 质量检查 | 六类 checklist + 独立质检模型 | ⚠️ 确定性规则扎实，真实效果无验证 |
| 行业差异化 | 7 个完整四字段包 | ✅ 结构层面 |

**明确结论**：链路在**代码结构上已贯通**，但「专业判断质量」完全没有真实模型输出佐证。不能称「已具备完整专业详情页创作能力」。此外 V205 的 platform / 参考图三角色 / 案例库 / 方法论大部未接入（5.2），行业专属「平台规则」仍走旧底座。

---

## 8. 单屏编辑与版本管理

### 8.1 单屏编辑

- 入口：`VersionPanel.jsx:308-344` 连续对话输入框（`editPrompt` + `instruction`）「生成新版本」→ `POST /screens/:i/edit`。
- 独立编辑：`version-routes.js:40-119` 只取当前屏参数与参考图，`submitSingleScreen`（`orchestrator.js:131`）只派 1 个任务；**不重跑 B1–B4、不改 `planning`、不影响其他屏**（`screen-edit-isolation-check.mjs` 带负向对照【机】）。
- 支持修改：文案/画面指令通过 `frozenPrompt` + `editNote`/`userInstruction` 传入；参考图只读带入（`:53-58`）。**是否支持「基于上一张生成结果继续编辑」**：`parentVersionId` 存在，但生成请求只发 `frozenPrompt`，没有把上一版图片作为输入参考图的证据（`local-images-generator.js:33` 只读 `referenceImagePaths`）→ 属**部分支持**（版本链有血缘，图片级连续编辑无证据）。
- 多轮上下文：`editThreads`（`appendEditThreadRound`，`version-store.js:119`），`userInstruction` 永久只读、`adoption` 默认 `manual`；V204 补的 `agentSuggestion{kind,patch,diff,reason}` 是**兼容位，本期恒 null**，不接任何 Agent 建议 UI。
- 编辑结果进入下一次生成：新 `versionId` → 新 `idempotencyKey` → 新任务 → `finalizeVersion` 回填 `imagePath/resultRef`。

### 8.2 版本数据结构与操作

`project.versions = {screenVersions: [], currentVersionIds: {}, editThreads: {}}`（`project-store.js:105-107`）。**注意**：早期任务书把三者列为项目顶层字段，实际在 `versions` 子对象内，属文档与代码差异。

单版本字段（`version-store.js:38-57`）：`versionId / screenIndex / imagePath / prompt / sourceTaskId / parentVersionId / editNote / editThreadRef / generationContext / status / isCurrent / createdAt`。

| 操作 | 实现 | 状态 |
|---|---|---|
| 创建 | `createPendingVersion:38`（status=pending） | ✅ |
| 切换 | `switchScreenVersion:103-115` 只改 `isCurrent` + `currentVersionIds[idx]` | ✅ 不删历史、不覆盖图片、不重生成 |
| 对比 | `VersionPanel.jsx:185-191` 最多选 2 个 `compareIds` | ✅ 前端并排展示 |
| 回滚 | 通过「切换」实现（无独立 rollback 端点） | ✅ 等价 |
| 保留历史 | 版本数组只追加，图片文件独立命名 | ✅ |
| 服务重启恢复 | 版本随 `project.json` 落盘，`getDetailStudioProject` 读盘 | ⚠️ `pending` 版本无自愈（对比任务侧 `recoverOnStartup`），中断后可能长期 pending |

### 8.3 每个版本能追溯到什么

| 追溯项 | 是否有 | 证据 |
|---|---|---|
| 原始用户指令 | ✅ | `editThread[].userInstruction`（只读） |
| AI 编辑建议 | ⚠️ **字段有、内容无** | `agentSuggestion` 兼容位恒 null，本期不接 Agent |
| 用户确认采用的修改 | ✅ | `adoption` + `appliedPatch` |
| 最终冻结提示词 | ✅ | `version.prompt` = 该版 `frozenPrompt` |
| 参考图片 | ✅ | `generationContext.referenceRoles`（角色名，**非具体文件快照**） |
| 图片生成参数 | ⚠️ 部分 | `generationContext{model,channelId,imageSize:"2K",aspectRatio:"3:4"}`，其中尺寸/比例在 `version-routes.js:72-73` **硬编码**，未取 `project.modelConfig` |
| 生成任务 | ✅ | `sourceTaskId` → `generationTaskStore.readTask`（`version-routes.js:130`） |
| 最终图片文件 | ✅ | `imagePath` / `resultRef`，来自 `task.resultPath` |

### 8.4 风险

- `pending` 版本无重启自愈（P1-7）。
- `generationContext` 硬编码尺寸比例，与「模型参数可追溯」口径有缺口（P1-6）。
- 单屏编辑 `frozenPrompt` 未与冻结链比对（P1-5）。
- 版本图片与任务结果共用 `data/detail-studio/generation/results/`，按 `task_id` 命名，未见覆盖旧图逻辑；但**无自动清理，长期累积**（阶段 4 报告已记）。

---

## 9. 图片生成与任务系统

### 9.1 任务数据结构与状态机

`generation/task-model.js`：
- `TASK_STATUS:17` = `queued / running / success / failed / cancelled / needs_confirm`；`TERMINAL_STATES:26`。
- `idempotencyKey:37` = sha256(`projectId | screenIndex | versionId | frozenPrompt`)（V204 加 versionId，`versionId` 空时退化为旧公式）。
- `MAX_ATTEMPTS=3`（含首试）、`BACKOFF_BASE_MS=2000`、`BACKOFF_CAP_MS=60000`、`computeBackoffMs:84` = min(cap, base×2^(n-1)) + 30% 抖动。
- `classifyError:51`：`uncertain` / `AbortError` / 504 → `autoRetry:false, uncertain:true`；`orchestrator.js:244-246` 置 `needs_confirm`，**不确定请求不自动重试**。
- `buildTaskRecord:117`：字段见 8.2 之外的 `frozenPrompt/model/channelId/imageSize/aspectRatio/referenceRoles/idempotencyKey/attempts/resultPath/resultRef/error/时间戳`。

⚠️ **`buildTaskRecord` 没有保存 `referenceImagePaths`**（只有 `referenceRoles`）。`orchestrator.js:192` 读 `current.referenceImagePaths || []` → 空数组 → `local-images-generator.js:33` 循环为空。虽然 `generation/routes.js:32/:56/:75` 组装了 `referenceImagePaths` 并放进 screen spec，但 `submitBatch:105-117` 写记录时未传递。**结论：参考图当前不会随出图请求发送**（14 章 P0-2）。

### 9.2 流程

| 流程 | 实现 |
|---|---|
| 创建 | `POST /generation/start` → `buildBatchSpec`（≤20 校验、渠道/模型校验）→ `submitBatch:78` 逐屏 `writeTask` + `runTask` |
| 执行 | `runTask:169` 重试循环 + 退避 + `persistResult:57`（`copyFile` 到 `data/detail-studio/generation/results/<task_id>.png`） |
| 取消 | `cancelTask:273`（`canTransition` 校验） |
| 重试 | `retryTask:260`，仅 `failed / needs_confirm / cancelled` |
| 恢复 | `recoverOnStartup:284`：`rebuildLedger` 从磁盘重建账本；`running` 且无结果 → `needs_confirm`（不盲目重跑） |
| 进度 | `getBatchStatus:302`；前端 `GenerationPanel.jsx:60-68` 3s 轮询 |
| 图片请求 | `local-images-generator.js:21` 内部 POST `http://127.0.0.1:${PORT}/api/images`（PORT 来自 `runtime-config.js:73`），`deferAutoSave=1`，`prompt=req.frozenPrompt` |

### 9.3 并发与隔离

- `server/core/runtime-config.js:35` `IMAGE_CONCURRENCY_LIMIT = clamp[1,24](env || 5)` → **默认 5，可配但 V200–V206 未改**。
- `image-concurrency.js:31 acquireImageSlot` 返回 release 闭包，`images.routes.js:590` finally 释放。
- 详情队列：`task-model.js:12 MAX_SCREENS=20`，`orchestrator.js:84` 只拒 >20；一次可排满 20 屏，全局 5 只是执行层保护（符合 Owner R1 裁决）。
- **共享**：`/api/images`、全局并发闸门、全局 KEY、渠道目录、`routingFields`。
- **隔离**：业务状态与数据目录。详情用 `data/detail-studio/generation/{tasks,results}`，换装用 `server/ai-tryon/task-store.js` 自有目录。
- **R2 最终形态（Owner 裁决 A）**：`server/core/task-store-core.js` 零依赖叶子**只被详情侧** `generation/task-store.js:11` import；旧换装 `server/ai-tryon/task-store.js:18` 仍用自己的 `aiTryonTasksDir`，零改动、未接入 core。两份同构代码同步维护是**已登记的已知维护债**，不是「已共用底层」。

### 9.4 风险

- P0-2 参考图未传递。
- `needs_confirm` / `MAX_ATTEMPTS` / 账本重建只有 `v203-core-smoke.mjs`（10/10）与 `v203-orchestrator-smoke.mjs`（11/11，mock generator）佐证【沙】，无运行时记录。
- 版本 `pending` 无自愈（8.2）。
- `recoverOnStartup` 在 `generation/routes.js:102` 注册时调用，服务重启后任务恢复未真机验证。

---

## 10. 模型与 API 基础设施

### 10.1 文本推理链路

`server/core/ai-chat-shared.js:151 postChatCompletion({baseUrl,apiKey,body,signal})` → `${baseUrl}/chat/completions`，返回 `{url,response,parsed}`；**无内建超时**，靠调用方 `signal`（详情创作 analyze 60s / director 90s / quality 120s / probe 20s，见 `detail-studio.routes.js:247/:288/:356`、`capabilities.js:89-96`）。`modelName(input,{fields,fallback}):132`、`extractJsonObject:85`、`responseContent:50` 同文件。

`server/features/detail-studio/model/model-config.js:19 DETAIL_STUDIO_MODEL_SPEC = {fields:["detailStudioModel","textModel","model"], fallback:"gpt-5.6-luna"}`；`:29 selectable:true`、`:31 gateway:"single-locked"`、`:5-7` 零依赖不 import `routing.js`（防 public 启动链 TDZ）。

调用点：既有 `detail-ai.js:245`、`reference-ai.js:187`、`quick-prompt-ai.js:181`、`outfit-*.js`、`ai-canvas-agent.js:244`；详情创作 `analyze-strategy.js:175`、`director-visual.js:184`、`qc-review.js:42`、`capabilities.js:79`。**全部复用同一 `postChatCompletion`，无第二套 Provider。**

### 10.2 图片生成链路

`POST /api/images`（`images.routes.js:116`）：必填 `apiKey`（`:151`）、`prompt`（`:155`）；`normalizeImageRequest`（`channel.js:126`）产出 `model/prompt/imageSize/aspectRatio/quality/background/n/source/dispatchMode/channelId/referenceDataUrls` 等；`:190 acquireImageSlot`；成功 `:380` 返回 `{ok,requestId,images,historyItems,...}`。前端 `src/api/images.js:3 generateImages(form)` 只 `postForm`，FormData 由调用方拼（`src/api/detail-studio.js:52-64`）。

### 10.3 KEY、网关与模型目录

- `resolveApiKey` 实际定义在 `server/core/image-error-policy.js:28`（= `normalizeApiKeyInput`）；`channelBaseCandidates` 在 `server/core/image-channel-candidates.js:27`；`CHANNEL_POLICY.customerKeyMode = "per-user-gateway-key"`（`channel-config.js:10`），`apiKeyForChannel:694` 恒等直通，服务端不内置 KEY。
- `GET /api/config`（`system.routes.js:66`）下发 `routing:publicRoutingCatalog()`、`hasServerKey:false`、`channelPolicy`、`models`。
- `src/shared/routing.js:441 CANVAS_REASONING_MODELS` = `gpt-5.6-luna`（推荐，`:446 DEFAULT_CANVAS_REASONING_MODEL`）/ `gpt-5.6-sol` / `gpt-6-luna`；`routingFields:570` 返回 `{model,channelId,dispatchMode:"manual"}`。
- `server/channel-config.js:284` `tt-image-2.6` / `"TT Image 2.6"`，合法渠道 `:197-198` `silent-tt26-line-01`(laoye) / `silent-tt26-line-02`(Origin)。
- `scripts/verify/routing-check.mjs:794-801` 断言「生图上游只有静音中转站一个候选地址」+ `clientDirectFallbackEnabled=false` → **单网关锁死**。

### 10.4 🔴 参数链的实际缺口

| 约束 | 代码事实 | 判定 |
|---|---|---|
| 模型可由用户选择 | `ModelChannelConfigPanel.jsx` 三下拉，保存到 `project.modelConfig`；`/probe/text` 透传 `textModel`（`capabilities.js:79` 用 `modelName(input,SPEC)`） | ✅ 探针生效 |
| 选择影响策划链路 | `src/api/detail-studio.js:112/:117` 的 `analyzeDetailStudio/directorDetailStudio` 支持 `{apiKey,textModel}`，但 `use-detail-studio-state.js:360-410` 的 `analyzeProject`/`directorProject` **只传 `{apiKey}`** | ❌ **textModel 未接线**，A/B 策划实际恒用 fallback `gpt-5.6-luna` |
| 旧详情 11 项选项迁入并结构化 | `analyze-strategy.js:29 TRACED_OPTION_KEYS` 11 项；`extractPlanningOptions:34` 从 `productData.fields` 读取并传 `buildGlobalLock` → 选项**确实通过 globalLock 进入 analyze/director 提示词** | ⚠️ 链路存在 |
| 用户能在详情创作设置这些选项 | `ProductDataPanel.jsx:67` 只有自由 key-value（placeholder「字段名（如：品牌 / 品类）」），**无 platform/richness/modelMode/copywriting/fontStyle/ratio 等结构化控件**；全目录 grep 这些键在 `.jsx` 中零命中 | ❌ 实际全部走默认值（`taobao-detail` / `simple` / `no-model` / `21:9` …），用户无法选择 |
| 导演链路 `options` | `director-visual.js:71` 传 `options`，但 `buildDirectorUserPrompt` 签名（`prompts/.../director-visual.js:71-78`）**未解构 options** | ⚠️ 冗余传参；选项已通过 `globalLockContext.globalLock` 间接进入，不致完全失效，但 `customRequirements` 等未单独注入 |
| 生成参数 | `generation/routes.js:60-61` 与 `version-routes.js:72-73` 把 `imageSize/aspectRatio` **硬编码 `"2K"/"3:4"`**，不取 `project.modelConfig` | ❌ 模型参数可追溯性缺口 |

### 10.5 受保护基础设施改动核对

以 `e255931`（V199 阶段 2 报告，V200 开工前）为基线，`git diff --stat e255931 HEAD --` 对以下文件**全部无输出**（本报告亲自抽验）：

`server/core/ai-chat-shared.js`、`server/channel-config.js`、`server/channel.js`、`server/core/image-concurrency.js`、`server/core/runtime-config.js`、`server/core/image-error-policy.js`、`server/core/image-channel-candidates.js`、`server/routes/images.routes.js`、`server/routes/system.routes.js`、`src/shared/routing.js`、`scripts/verify/routing-check.mjs`、`server/ai-tryon/task-store.js`。

**V200–V206 对既有模型 Provider / KEY / 网关 / 图片生成接口零改动**；唯一新增是 `server/core/task-store-core.js`（`b5e7086`，V203）。旧详情模块 `detail-main` 亦零改动。✅

### 10.6 其它

- **KEY 入口**：`SettingsView.jsx:124` 全局唯一正式入口；详情创作工作区 `type="password"` **0 处**（KEY 从 `STORAGE_KEY = jingyin-internal-settings-v3` 读，`use-detail-studio-state.js:44-51`）。⚠️ 但旧换装模块 `src/features/outfit/panels/OutfitSettingsModal.jsx:64` 仍有第二处 KEY 输入（placeholder `sk-...`），属**既有功能遗留**，V200–V206 未触碰，与「全应用只在设置填 KEY」的字面约束有偏差（15 章）。
- **图片结果形态**：本地文件为主（`/api/history-image/*`、`/api/detail-studio/.../generation/results/:filename`），兼容远程 URL（`displayImageRequestUrl` 对 http(s) 走 `/api/image-proxy`）。
- **模型支持范围**：文本经统一网关 `/chat/completions`（`gpt-5.6-luna` 等 OpenAI 兼容）；图片经 `/api/images` 的渠道目录（`tt-image-2.6` / `tt-image-2.5` / banana 系列等）。仓库内**无 Gemini 直连**，也**无第二套 Key 管理**。
- **超时/失败/错误提示**：文本靠 AbortSignal；图片侧 `images.routes.js` 有 504 归一化、`classifyError` 分类；前端 `errorMessage` + banner。**真实上游错误码与重试行为无生产日志**【证据不足】。

---

## 11. 当前 UI / UX 状态

### 11.1 结构与布局（代码实证）

左右两列 grid（`detail-studio.css:46-51`）：
- 左列（280–360px，固定）：项目列表/新建 + 三个紧凑下拉（推理模型 / 图片模型 / 渠道）+ 项目基础信息
- 右列（`1fr`）：FlowGuidanceBar → BasicsPanel → CapabilityPanel（单行状态条，技术信息折进「开发者信息」默认收起） → IntakeArea（模式标签 + 商品资料 + 参考图三角色分块 + 模式专属面板） → PlanningPanel（4 段） → GenerationPanel（进度/任务） → VersionPanel（屏 tabs / 版本列表 / 对比 / 连续对话）
- 两列各自 `display:grid` 纵向 gap 堆叠（`css:53-64`），**整页纵向滚动**；无虚拟滚动/分页（全目录 grep 无 virtual/pagination）；仅局部 `max-height + overflow:auto`（项目列表 260px、diff 200px、屏结构 240px 等）。
- 无抽屉、无独立侧栏弹层；弹窗沿用 `src/shared/ui/Modal.jsx`；`<details>` 折叠用于能力自检。
- 响应式单列 `css:963-964`，但**非最大化窗口的实际可用性无截图/真机证据**【证据不足】。

### 11.2 视觉规范

- `src/styles/tokens.css` 单套深色语义令牌；`detail-studio.css` **1600+ 行、零 hex、530 处 `var(--`**，token-only 成立【机】。
- `Button / Field / Panel / ModuleHeader / Toolbar / TaskBadge` 在 components/intake/planning 复用；⚠️ **`GenerationPanel.jsx:111-166` 与 `VersionPanel.jsx:200-345` 大量原生 `<section>/<header>/<h3>/<ul>/<textarea>/<input>`，未用 `Field/Panel/ModuleHeader`**；`IntakeArea` 零 shared/ui 引用。与 `src/features/detail-studio/README.md:89` 的「组件一律用 shared/ui」纪律不一致。
- 空态 / 加载态 / 错误态：各面板有空态文案、`state.busy` → Button `loading`、根 banner `error/notice`（`DetailStudioView.jsx:37-38`）、`localError` banner。**局部统一，非全局统一**。

### 11.3 已解决 / 仍存在

**已解决（V201）**：checklist「全要打勾」错觉、缺主流程引导、能力自检占大屏、三下拉散在右列、上传只有 file input、必填语义不清、product 必传只做软提示（服务端不加全局强校验以免卡死模式 C）。

**仍存在（基于代码，非主观猜测）**：
1. 右列 **7 个顶层块、展开约 15 个 Panel/section 纵向堆叠**，无分区收起/分步导航；用户要滚很久才能从资料走到生成与版本。
2. `PlanningPanel` / `GenerationPanel` / `VersionPanel` **全局挂载、不按当前阶段或 mode 收起**，A 模式刚建项目就能看到空的生成与版本面板；`DetailStudioView.jsx:34` 仍标「阶段 2 · 创作录入」、`FlowGuidanceBar.jsx:4-5` 仍写「策划/生成后续阶段开放」，与实际已挂载阶段 3/4/5 面板矛盾（文案滞后）。
3. 主按钮只有「保存并继续」，无「生成策划方案」等阶段 CTA；规划动作埋在 PlanningPanel 里。
4. `VersionPanel.jsx:13-20` 直接 import 6 个 API 函数绕过 state（与 README「跨区通信只经 state」不一致）；`GenerationPanel.jsx:90/:99` retry/cancel 传空 `apiKey`，与 `startGeneration` 注入 KEY 口径不一。
5. `buildDetailStudioImageForm` 里 `source=detail-main`（旧模块来源标记），会让日志归因混到旧详情。
6. 单文件规模：`use-detail-studio-state.js` 537 行、`detail-studio.css` 1643 行、`VersionPanel.jsx` 374 行，超 README 自定「≤300 行」建议。

**截图证据**：`docs/` 下 120 png + 8 jpg 全在 `docs/ai-tryon/eval/`（试穿 eval 出图/掩膜），**非页面截图**。阶段 1 §4、阶段 2 §4 明写「本环境无法落盘截图，改以浏览器探针回执为证」；V201 引用的 Owner 两张实机截图**不在仓库**。→ **仓库内无 V200–V206 页面截图或结构图证据**【证据不足】。

---

## 12. 数据结构、接口与文件存储

### 12.1 主要数据结构（`server/features/detail-studio/store/project-store.js`）

`DETAIL_STUDIO_SCHEMA_VERSION = 2`（`:20`），`createDetailStudioProject:235-274` 种子：

| 结构 | 字段 | 作用 / 关联 |
|---|---|---|
| Project | `id`(ds_+ts+rand)、`name`、`mode`(guided/assisted/direct，创建后不可变)、`note`、`status`、`currentPlanRunId`、`createdAt/updatedAt` | 主键；`index.json` + `<id>/project.json` |
| modelConfig | `{textModel,imageModel,channelId}` | 三下拉；⚠️ textModel 未接进策划链路 |
| productData | `{fields:{},text:""}` | 自由 key-value；11 个规划选项按约定键名读取，前端无结构化录入 |
| referenceImages | `[{id,role,url,filename,label,note}]` | 三角色 `product/visualStyle/contentStructure`；文件落 `assets/<id>/` |
| modeC | `{rawPrompt,tidyVersion,diff,frozenPrompt,frozenAt}` | `rawPrompt` 落库后只读（`sanitizeModeC:37-39`） |
| planning | `{analyze,appliedOptions,globalLock,industryId,screens[],narrativeSummary,visualDNA,frozenPrompts{}}` | `screens` 为 `ScreenSpec[]`，`frozenPrompts` 键为 `screen_N` |
| ScreenSpec | `id=screen_N`、`index`、`role`、`goal`、`composition{hierarchy,visualWeight,moduleId}`、`copy`、`productFacts[]`、`referenceAssets[]`、`prevScreenId/nextScreenId` | `director-visual.js:109-162` |
| versions | `{screenVersions[],currentVersionIds{},editThreads{}}` | **子对象**，非顶层 |
| ScreenVersion | `versionId/screenIndex/imagePath/prompt/sourceTaskId/parentVersionId/editNote/editThreadRef/generationContext/status/isCurrent/createdAt` | `version-store.js:38-57` |
| EditThread | `userInstruction`（只读）、`agentSuggestion`（兼容位恒 null）、`adoption`、`appliedPatch`、`diff`、`resultVersionId`、`createdAt` | V204 补 Agent 扩展位 |
| GenerationTask | `task_id/kind/projectId/screenIndex/frozenPrompt/versionId/model/channelId/imageSize/aspectRatio/referenceRoles/idempotencyKey/status/attempts[]/resultPath/resultRef/error/时间戳` | `task-model.js:117`；**不含 referenceImagePaths** |

`migrateProject:55-101` 非 v2 强制升级并补 6 组字段；`updateDetailStudioProject:276-347` 白名单仅 `name/note/status/modelConfig/productData/referenceImages/modeC/planning`，`id/mode/createdAt/schemaVersion` 不可变，`versions` 须走 `mutateProject:187-202`。原子写 `writeJsonAtomic:158-174`（tmp+rename+`.bak`，Windows EPERM 退避）、`readJsonWithBackup:143-156`、双串行写链 `withIndexWrite:177-182`。

### 12.2 API 端点（前缀 `/api/detail-studio`，入口 `server/routes/detail-studio.routes.js` + `generation/routes.js` + `versions/version-routes.js`）

| 方法 | 路径 | 用途 | 关键校验 |
|---|---|---|---|
| GET | `/capabilities` | 能力自检元数据 | 无 |
| GET/POST | `/projects` | 列表 / 新建 | name 非空、mode 白名单 |
| GET/PUT | `/projects/:id` | 读取 / 受控更新 | 404；白名单合并 |
| POST | `/probe/text`、`/probe/image` | 文本探针（真调 1 次）/ 图片契约预检（不调上游） | apiKey 脱敏 |
| GET/POST | `/projects/:id/reference-images` | 参考图列表 / 上传 | role 白名单、`safeUploadFilename` |
| GET | `.../reference-images/:filename`、`.../generation/results/:filename` | 文件 serve | basename + `startsWith(dir+sep)` 防穿越 |
| POST | `/intake/mode-c/parse` | 分屏解析（不落盘） | 404 |
| PUT | `/intake/mode-c/freeze` | 冻结 `frozenPrompt` | 非空、≤60000 |
| POST | `/planning/analyze` / `director` | 批次① / ② | 60s / 90s abort |
| POST/PUT | `/planning/compile` / `freeze` | 编译预览 / 冻结落库 | screens 非空 |
| POST | `/planning/quality` | 质检 | 120s abort |
| POST/GET | `/projects/:id/generation/start` / `/generation` | 批量生成 / 进度 | ≤20 屏、渠道与模型校验 |
| POST | `/generation/:taskId/retry` / `cancel` | 单任务重试 / 取消 | 状态机 |
| POST | `/projects/:id/screens/:i/edit` | 单屏编辑生成新版本 | `frozenPrompt` 非空（**未与冻结链比对**） |
| POST | `/versions/:versionId/finalize` / `switch` | 版本定稿 / 切换 | 任务未完成 409 / 版本存在 |
| GET | `/projects/:id/screens/:i/versions` | 版本链 | — |
| POST | `/screens/:i/edit-thread` | 追加对话轮次 | 需 `userInstruction` |

**无 DELETE 端点**（`archived` 状态代替删除）。前端封装全部在 `src/api/detail-studio.js`（~20 个导出）。

### 12.3 文件与目录（`server/core/app-paths.js`）

| 用途 | 路径 |
|---|---|
| 项目 JSON | `data/detail-studio/projects/index.json` + `<id>/project.json` |
| 参考图 | `data/detail-studio/assets/<id>/` |
| 任务记录 | `data/detail-studio/generation/tasks/` |
| 生成结果图 | `data/detail-studio/generation/results/<task_id>.png` |
| 版本元数据 | 随 `project.json` 的 `versions` 子对象（**无独立 versions/ 目录**） |
| 禁区 | `data/results`（7 天 TTL）、`seed/manifest.json` — 全目录 grep 仅在注释中出现，代码不引用 |

**核对结果**：
- ✅ 详情创作与换装任务目录隔离（9.3）。
- ✅ 结果图按 `task_id` 命名，未见覆盖旧图逻辑。
- ⚠️ 版本元数据与任务结果**跨两处存储**，靠 `sourceTaskId` 关联；任务记录若被清理则追溯断链（无自动清理，但也无完整性校验）。
- ❌ 无项目删除端点 → 删除项目后残留文件的问题当前**不会发生**（因为不能删），但也意味着无清理入口。
- ⚠️ 参考图资产长期累积，无自动清理（阶段 4 报告已记）。
- ⚠️ `.bak` 备份机制存在但**恢复流程未真机验证**。

---

## 13. 测试与真实环境验证情况

### 13.1 测试矩阵

| 类别 | 脚本 / 位置 | 执行阶段 | 数量与结果 | 自动化 | 真实 API/出图 |
|---|---|---|---|---|---|
| 单元/纯函数 | `tmp/test-b1.mjs` 22、`test-split.mjs` 7、`test-b2b3.mjs`、`test-b4.mjs`、`scripts/dev/verify-detail-studio-model-chain.mjs` 12 | V202 / V199 | 全通过 | 是（**tmp 未进 git**） | 否（mock fetch） |
| 接口 | `tmp/stage1-http-test.mjs` 10、`tmp/stage2-verify.mjs` 18→27、`tmp/p2-intake-test.mjs` | 阶段 1/2 | 全通过 | 是（tmp） | 否（沙盒服务端） |
| 数据持久化 | `tmp/stage1-store-test.mjs`、`scripts/verify/v203-core-smoke.mjs` 10 | 阶段 1/4 | 全通过 | 部分进 git | 否（沙盒 `JINGYIN_RELEASE_ROOT`） |
| 任务系统 | `scripts/verify/v203-orchestrator-smoke.mjs` 11、`version-idempotency-check`、`screen-edit-isolation-check` | V203/V204 | 全通过 | 是 | 否（mock generator） |
| 前端组件 | 无组件级单测；靠浏览器探针回执 | 各阶段 | — | 半自动 | 否 |
| 构建 | `vite build`（internal + public） | 每阶段 | EXIT=0 | 是 | 否 |
| 浏览器 | `tmp/*-public-check.mjs`、`tmp/v201-browser-check.mjs`、`tmp/v206-realdata-check.mjs`（tabbit-cli 无头） | 各阶段 | `rootChildren=1`、三视图 `fatal=false`、多次 `SMOKE_PASS` | 是（tmp） | 否（无头、无 KEY） |
| 旧功能回归 | 浏览器探针三视图（详情/换装/快捷生成） | 阶段 1/2/3B/4/5/3C/V206 | `fatal=false` | 是 | 否 |
| **真实模型调用** | 无 | — | **0** | — | **从未执行** |
| **真实图片生成** | 无 | — | **0** | — | **从未执行** |
| 服务重启恢复 | `v203-orchestrator-smoke` 的重启段 | V203 | 通过（mock） | 是 | 否 |
| 长时间/多任务稳定性 | 无专门条目 | — | 无 | — | 否 |

### 13.2 门禁现状

- `scripts/verify/run-all.mjs`：**ORDER 84 项 / FAST_ORDER 70 项**，`--fast` 当前 **70/70**（V206 后）。
- V202–V206 新增 11 个 verify，全部注册双数组；8 个带负向对照。`frozen-prompt-parity`、`v203-core-smoke`、`v203-orchestrator-smoke` 为纯断言无负向标注。
- `baselines/` 目录**不存在**；12 份 `*-baseline.json` 散在 `scripts/verify/`。11 个新门禁**均不引用基线 JSON、无内置基线常量** → 与 V202/V203 执行单「新门禁一律基线棘轮上线」的书面要求不符，但因其扫描范围只覆盖新增模块、零存量违规，未触发「接上 pre-commit 全红」风险，属**纪律偏差而非实质故障**。
- 全量门禁（非 `--fast`）历史上**仅阶段 1 跑过一次：81 项通过 72 / 失败 9**（5 浏览器探针、2 自建实例、存量 lint、缺 exe，已逐项单跑定性）。阶段 2 报告明确「全量 81 项本阶段未回填」；V203–V206 只报 `--fast`。V206 §3-8 标题写「全量门禁逐项归因」而内容仅 `--fast`，名不副实。
- V206 `size-ratchet` 基线刷新：只吸收 2 文件（`cached-image.jsx` 223→289、`main-canvas-board.jsx` 481→514），`reason` 完整、`overBudget` 0→0，git `f166c2f` 即刷新前快照，属棘轮正用。

### 13.3 明确未覆盖（不得算作已验证）

1. 真实 API KEY 完成 A/B 模式全流程 —— 阶段 1 §5-1、阶段 2 §5-1、3A §5-4、3B §8
2. 真实图片模型多屏批量生成 —— 阶段 1 §5-2、阶段 4 §8/§9、3C §9
3. 三类商品（清洁日化 / 服装 / 第三类）A/B 完整创作 —— 3A §5-5、3B §7-3、V200 §5（且 §七 验收标准传输截断）
4. 项目关闭后重新打开 —— 3B §7-9（阶段 1/2 的「重新打开」是沙盒 STORE_TEST / 18-18）
5. 服务重启后任务与版本恢复 —— 阶段 4 §8、3B §7-9（`v203-orchestrator-smoke` 是 mock）
6. 多任务并行长时间稳定性 —— 无专门条目
7. 非最大化浏览器下的实际 UI 操作 —— V201 §9.5、阶段 1 §4
8. 单屏多轮编辑后版本保存/切换/回滚 —— 仅 `version-idempotency` 静态断言
9. 真机大历史切 quickgen 不再 OOM —— V206 报告标「锦上添花，非阻断」；统筹已在真实 96 条历史上用无头浏览器验证【沙】，非 Owner 真机

---

## 14. 当前问题与技术债务

> 标注【已实证】的项目均由统筹 AI 亲自复跑代码/命令确认；【代码推断】表示静态可证但无运行证据。

### P0 · 阻塞继续开发或影响数据安全

| # | 现象 | 证据 | 影响 / 发生条件 | 建议阶段 |
|---|---|---|---|---|
| P0-1 | **A/B 模式冻结后无法批量生成** | 【已实证】`compile-screen.js:32` 写 `frozenPrompts["screen_1"]`（`director-visual.js:127` 生成该 id），`generation/routes.js:70` 读 `frozenMap[0]`；回退 `screen.frozenPrompt||screen.raw` 在 ScreenSpec 不存在；构造 2 屏项目调 `buildBatchSpec` 抛「没有可生成的屏（请先冻结提示词 / 完成分屏规划）」 | 所有 guided/assisted 项目在「冻结 → 开始批量生成」必失败；C 模式不受影响 | **立即修**（1 行键映射或统一用 `screen.id`），并补一条跨 compile→generation 的端到端断言 |
| P0-2 | **参考图不随出图请求发送** | 【代码推断，链路完整】`generation/routes.js:32/:56/:75` 组装 `referenceImagePaths`，但 `submitBatch:105-117` 调 `buildTaskRecord`（`task-model.js:117`）未传该字段；`runTask:192` 读 `current.referenceImagePaths||[]` → 空；`local-images-generator.js:33` 循环为空 | 所有模式出图都不带商品参考图 → 商品身份锚点失效、跨屏一致性无保障 | **立即修**（写入任务记录 + 补断言），与 P0-1 同批 |

### P1 · 影响核心体验或主要业务能力

| # | 现象 | 证据 | 影响 | 建议阶段 |
|---|---|---|---|---|
| P1-1 | `textModel` 未接进策划链路 | 【已实证】`src/api/detail-studio.js:112/:117` 支持，但 `use-detail-studio-state.js:360-410` 只传 `{apiKey}` | Owner 裁决「模型可由用户选择」在 A/B 策划上失效，恒用 `gpt-5.6-luna` | 方向 2 |
| P1-2 | 11 个结构化选项无录入 UI | 【已实证】`analyze-strategy.js:29/:34` 从 `productData.fields` 读；`ProductDataPanel.jsx:67` 只有自由 key-value；全目录 `.jsx` 零命中这些键 | 选项链代码存在但用户不可控，全走默认值；「前端选项必须真正影响 AI」未完全兑现 | 方向 2 |
| P1-3 | V205 一批资产未接入创作链路 | 【代码实证】`platform/index.js`、`reference-image-roles.js`、`case-library.js`、`reference-image-guide.md` 仅被 `skill-asset-contract-check.mjs:15-17` 扫描；`qc-prompt.js` 的 `industryStrategy` 入参未被 `qc-review.js:31-36` 传入 | 行业宣传边界进不了质检；平台规则/案例库/参考图方法论对创作无影响 | 方向 3 |
| P1-4 | 三模式在前端未硬隔离、A/B 面板纯展示 | 【代码实证】`PlanningPanel` 全局挂载不按 mode 分支；`GuidedIntakePanel`/`AssistedIntakePanel` 零按钮；3A 的「B 保留 `rawIntent`」无独立字段 | 模式 C 用户可见并点击分析/导演按钮；A/B 的「AI 主动引导」只有静态文案，无追问交互（`completeness>0.8` 只是前端提示） | 方向 1/4 |
| P1-5 | 单屏编辑 `frozenPrompt` 未与冻结链比对 | 【已实证】`version-routes.js:48-49` 只校验非空 | 信任边界缺口，可绕过确认环节传任意提示词 | 方向 1 |
| P1-6 | `generationContext` 尺寸比例硬编码 | 【代码实证】`version-routes.js:72-73` `"2K"/"3:4"` | 版本追溯的生成参数不真实 | 方向 2 |
| P1-7 | 版本 `pending` 无重启自愈 | 【代码推断】任务侧有 `recoverOnStartup:284`，版本侧无 | 服务在生成中重启，版本可能长期 pending | 方向 1 |
| P1-8 | A/B 策划质量无任何真实输出样本 | 【证据不足】见 13.3 | 「专业创作能力」无法评估 | 方向 5 |

### P2 · 体验与效率

- 右列 7 顶层块 / 约 15 Panel 纵向堆叠、无分步收起、无虚拟滚动（`DetailStudioView.jsx:45-55`、`css:53-57`）。
- `PlanningPanel`/`GenerationPanel`/`VersionPanel` 全局挂载，空态面板占屏。
- 文案滞后：`DetailStudioView.jsx:34` 仍写「阶段 2 · 创作录入」，`FlowGuidanceBar.jsx:4-5` 仍写「策划/生成后续阶段开放」，而阶段 3/4/5 面板已挂载。
- 无「生成策划方案」CTA；主按钮只「保存并继续」。
- `version-routes.js` 的 `generationContext`、`buildDetailStudioImageForm` 的 `source=detail-main` 日志归因错误。
- `GenerationPanel.jsx:90/:99` retry/cancel 传空 `apiKey`，口径与 `startGeneration` 不一致。
- 局部未复用 `shared/ui`（GenerationPanel / VersionPanel / IntakeArea）；单文件超 300 行建议（state 537、css 1643、VersionPanel 374）。

### P3 · 长期架构

- R2 两份同构任务代码同步维护债（Owner 裁决 A 已登记，不建议现在为「共用」去改旧换装）。
- 旧底座 4 行业（motherBaby/pet/jewelry/sports）无四字段。
- 11 个新门禁无基线棘轮（当前无实质风险，扩到存量代码时必须补）。
- 版本元数据与任务结果跨两处存储，靠 `sourceTaskId` 关联，缺完整性校验。
- 无项目删除/归档清理端点，参考图与结果图长期累积。
- `agentSuggestion/adoption` 兼容位恒 null，未来 Agent 接入时的契约已备好但未使用。

---

## 15. 历史约束执行情况

| 约束 | 判定 | 证据 |
|---|---|---|
| 渐进改造、不推翻重写 | ✅ | V200–V206 全部新增业务区；受保护 12 文件 `git diff e255931 HEAD` 零输出 |
| 详情创作独立工作区、复用共享基础设施 | ✅ | 独立 `detail-studio` 视图 + 独立 `src/server/prompts` 目录；文本用 `postChatCompletion`、图片用 `/api/images`、KEY 用全局设置、并发用全局闸门 |
| 旧详情模块保持完整 | ✅ | `detail-main` 及 `server/detail-middleware.js` / `detail-skills.js` 零改动；V200 §4 明确「只读盘点、不改旧模块」 |
| 不重复建设 Provider / KEY / 图片网关 | ✅ | 10.5 节 git 取证；`routing-check.mjs:794-801` 单网关锁死 |
| 不随意改全局入口与既有功能 | ✅ | `src/main.jsx` V200–V206 零改动（仅 V198 加过 1 个 lazy 分支） |
| 不影响换装 / 批量换装 / 快捷生成 / 画布 | ⚠️ 形式上是，但 V206 因修共享 `CachedImage` + `MainCanvasBoard`，**改变了所有视图的历史图渲染上限**（首屏 30 条 + 按需加载）。属必要修复且已验证，但「零影响」表述不严谨 | `main-canvas-board.jsx:111/:164-167`、`cached-image.jsx:83` |
| API Key 只在全局设置配置 | ⚠️ **字面未完全遵守**：`SettingsView.jsx:124` 是正式入口，但旧换装 `OutfitSettingsModal.jsx:64` 仍有第二处 KEY 输入（既有遗留，V200–V206 未碰） | 两处 `type="password"` |
| 详情创作不增加独立 KEY 输入 | ✅ | `src/features/detail-studio/` 零 `type="password"`；KEY 从 `STORAGE_KEY` 读 |
| 模型可由用户选择 | ⚠️ 部分 | 三下拉存在、随项目保存、探针生效；但策划链路 `textModel` 未接线（P1-1） |
| 文本推理与图片生成职责分离 | ✅ | `postChatCompletion` vs `/api/images` |
| 图片生成继续复用 `/api/images` | ✅ | `local-images-generator.js:44` 内部 POST 本进程 `/api/images` |
| Mode C 不被 AI 隐式改写 | ✅ | `mode-c.js` 零 import、`sanitizeModeC` 只读、生成 `prompt` 直接取 `frozenPrompt`、`mode-c-purity-check` 带负向对照 |
| 详情创作最多 20 屏 | ✅ | `task-model.js:12 MAX_SCREENS=20`、`director-visual.js:26`、`orchestrator.js:84` |
| 详情任务队列不设人为数量上限 | ✅ | `orchestrator.js:8` 注释 + 只拒 >20；全局 5 是执行层资源保护 |
| 全局图片并发仍为 5 | ✅ | `runtime-config.js:35` 默认 5（可配 1–24），V200–V206 零改动 |
| 单屏编辑不影响其他屏 | ✅ | `version-routes.js:40-119`、`screen-edit-isolation-check.mjs`（负向对照） |
| 任务与版本可追溯 | ⚠️ 部分 | `sourceTaskId` / `frozenPrompt` / `editThread` 齐；但 `generationContext` 尺寸比例硬编码、参考图只有角色名无文件快照、`agentSuggestion` 恒 null |
| 不确定请求不盲目重复执行 | ✅ | `classifyError:51` + `needs_confirm` + `recoverOnStartup` 不重跑 running |
| 深色专业紧凑工作区、不做卡片墙 | ⚠️ 部分 | token-only、左列紧凑、能力自检收起已做；但右列仍 7 块纵向堆叠、空态面板常显（11 章） |
| 浏览器非最大化可用 | 【证据不足】 | 有响应式单列 CSS，无真机/截图证据 |

**被后续明确决策替代的旧口径**（不要擅自恢复）：
- 阶段 0 R5「本期不增加模型选择」→ Owner 阶段 1 后裁决「推理模型 + 模型选择 + 渠道选择放一起、客户自选，推荐 `gpt-5.6-luna` / `TT Image 2.6`」。阶段 0 报告 §9 已加修订标注。
- 阶段 0 R2「新旧任务共用底层能力」→ Owner 裁决 A「通用叶子 + 仅详情适配，旧换装独立零改动」，阶段 4 验收报告 §2 已固定。
- V200 单曾把事实分级写成 `user/inferred/needConfirm/forbidden` → 3A 真相源 `user/visible/inferred/unconfirmed`，V202 复核时已修契约（`03f7e50`）。

---

## 16. 下一阶段建议

> 不拆成大量微任务。基于当前真实进度，最重要的 4 个方向 + 1 个前置。

### 方向 1（最高优先）：打通主链路闭环，先修 P0
- **为什么现在做**：A/B 两条用户路径当前在「冻结 → 生成」必失败；参考图不进出图请求会让商品身份锚点形同虚设。此时做任何 UI 或内容增强，用户都拿不到图。
- **前置**：无（纯代码修复）。
- **交付**：① `frozenPrompts` 键统一（编译端与生成端用同一 `screen.id` 或统一索引）② `referenceImagePaths` 写入任务记录并传到 `/api/images` ③ 单屏编辑 `frozenPrompt` 与冻结链比对 ④ `pending` 版本重启自愈 ⑤ 一条「A/B 完整链路：compile → freeze → buildBatchSpec → generator 收到的 prompt 与冻结值字节一致 + 参考图非空」的常驻 verify（注册双数组 + 负向对照）。
- **验收**：不调真实上游即可用 mock generator 断言每屏请求体；`--fast` 全绿；C 模式不回退。

### 方向 2：把「用户选项真正影响 AI」补成事实
- **为什么**：Owner 在总任务书 §七 与阶段 3 调整里反复强调，且这是产品差异化核心；当前链路有骨架但用户不可控。
- **前置**：方向 1 完成。
- **交付**：① `textModel` 从 `project.modelConfig` 接进 `analyzeProject`/`directorProject`/`quality` ② 把 11 个 `TRACED_OPTION_KEYS` 做成结构化配置区（复用 V201 左列契约，不新增卡片墙），替换 `ProductDataPanel` 的自由 key-value ③ `imageSize/aspectRatio` 从 `modelConfig` 取，去掉硬编码 ④ 负向对照：切换每个选项必须改变 `globalLock` 文本或请求体（`option-effect-check.mjs` 已有基础，需扩到真实字段）。
- **验收**：逐项切换 → 断言策划上下文与最终请求体变化；`option-effect-check` 覆盖 11 项。

### 方向 3：把 V205 已建内容资产接进执行链路
- **为什么**：资产已写好、门禁已扫描，但没进模型上下文；这是当前投入产出比最高的「专业能力补强」，不需要重写框架、不需要新增 Agent。
- **前置**：方向 1（否则看不到效果）。
- **交付**：① `qc-review.js` 的 `callQcModel` 传 `industryStrategy`，让 `promoBoundaries` 进质检 ② `platform/index.js` 替换/补充 `getPlatformSkill`，或明确二选一避免双真相源 ③ `reference-image-roles.js` 与服务端内联常量统一 ④ `case-library` / `methodology` / `copywriting` 的未消费导出求值后择要注入系统提示或质检上下文 ⑤ 4 个旧底座行业补四字段（可选）。
- **验收**：每个资产至少有一个 `server/` 侧消费点（静态断言），且 `skill-asset-contract-check` 升级为「资产存在且被消费」而不只是「文件存在」。

### 方向 4（可与方向 2 合并）：工作台信息架构收敛
- **为什么**：V201 解决了「看不懂」，但阶段 3/4/5 面板全部堆上后，右列又变成纵向卡片墙；空态面板常显、文案滞后。
- **前置**：方向 1 完成（先保证能跑通再谈体验）。
- **交付**：按当前阶段分步显示（录入 → 规划 → 生成 → 版本），非当前阶段折叠；A/B/C 在前端按 mode 硬隔离（C 不显示规划/质检）；统一 `shared/ui`；修正滞后文案；主 CTA 与实际动作一致。**保持 V201 布局契约，不重新设计全局视觉系统**（Owner 已关闭视觉系统研究）。
- **验收**：非最大化窗口真机操作录屏/截图（当前仓库无此类证据，需补）。

### 方向 5（与方向 1 并行、由 Owner 侧执行）：真实环境端到端验证
- **为什么**：全项目【真】证据为 0，任何「质量/稳定性/专业度」判断目前都无依据。
- **前置**：设置页填一次真实 KEY。
- **交付**：① 三类商品（清洁日化 / 服装 / 食品或 3C）各跑一次 A/B 完整创作 ② 真实图片模型多屏批量生成 ≤20 屏 ③ 单屏多轮编辑后版本保存/切换/回滚 ④ 项目关闭重开 + 服务重启后任务与版本恢复 ⑤ 多任务并行 30 分钟稳定性 ⑥ public 封装版首启真机冒烟。
- **验收**：落一份带上游 requestId、真实图片、耗时与失败的回报文档，补进 `docs/复盘/`。

### 应暂缓 / 不应重做

- **暂缓**：阶段 6 长图预览 / 分屏预览 / 批量导出（V207）——主链路未跑通前做导出无意义；3A 架构复核回执与任务书 §七 补齐是 Owner 侧输入，不阻塞方向 1–3 的代码修复，但阻塞「阶段验收」定性。
- **不应重做**：不重写 JY-Canvas；不替换旧详情模块；不引入第二套 Provider / KEY / 网关；不为「共用」去改旧换装 `task-store.js`（裁决 A 已定）；不新增 Agent 数量或把 7 逻辑角色拆成 7 次模型调用；不重新开展视觉系统/设计 Token 研究；不一次性把 6 类行业做到最终水平。

---

## 17. 需要 ChatGPT 进行架构判断的问题

> 以下给出统筹 AI 的初步判断与证据，**最终决策留给架构顾问**。

1. **A/B 主链路阻断应算「V202/V203 未交付」还是「新发现回归」？** 初步判断：键不一致自 V202 编译端与 V203 生成端分别落地时即存在，从未被端到端断言覆盖；`frozen-prompt-parity-check` 只验编译两次一致，未跨到 `buildBatchSpec`。证据：6.1、14 P0-1。
2. **当前 Agent/SKILL 是否足以支撑专业详情页创作？** 初步判断：**结构足够、内容不足、验证为零**。5 执行单元与 ≤4 次调用的成本控制合理；但一半 V205 资产未接入、A/B 面板无主动追问、真实输出零样本。证据：第 5、7、13 章。
3. **哪些专业能力已存在、不应重复建设？** 初步判断：事实四级分级、全局锁 + 选项溯源、ScreenSpec 结构化、确定性编译、C 模式隔离、六类质检 + 一次修正封顶、行业 `MERGED` 加载机制均已落地且质量较好；**不应重做**。缺的是接线与真实验证。证据：5.2、6.3、7.1。
4. **版本管理是否真正闭环？** 初步判断：**数据层闭环、运行层未验证**。切换/对比/回滚/任务关联/`versionId` 幂等都有；但 `pending` 无自愈、`generationContext` 硬编码、`agentSuggestion` 恒 null、真机多轮编辑零验证。证据：第 8 章。
5. **三种模式是否真的独立？** 初步判断：**后端是（C 零调用、纯函数隔离），前端不是**（PlanningPanel 全局挂载、A/B 面板无差异化交互、B 无 `rawIntent` 字段）。需要判断「独立」的验收边界应定在调用图还是 UI。证据：4.4、6.3。
6. **工作台布局是否需要重新做信息架构？** 初步判断：需要**收敛而非重设计**——按阶段折叠 + 模式隔离即可，V201 的左右列契约应保留。证据：11 章。
7. **是否存在不合理耦合？** 初步判断：`VersionPanel` 直连 API 绕过 state、`buildDetailStudioImageForm` 的 `source=detail-main`、平台/参考图规则双来源、行业底座双来源，属可收敛的局部耦合，不是架构级问题。证据：4.2、5.4、11.3。
8. **下一阶段优先业务能力还是 UI？** 初步判断：**业务能力（方向 1→2→3）优先**，UI 收敛可合并但排在后面；因为当前用户根本拿不到图。证据：14 章 P0。
9. **Stage 6 可以开始吗？** 初步判断：**不建议**。除主链路阻断外，3A 复核回执与任务书 §七 截断两前置未齐，且导出需要的结果图/版本链尚未经真实环境验证。证据：1.2、13.3、16。
10. **哪些技术债应先处理？** 初步判断：P0-1/P0-2 > `textModel` 与选项接线 > 资产接入 > 新门禁基线棘轮（低风险可延后）> R2 同构代码维护债（裁决 A 已接受，不建议现在动）。证据：14 章。
11. **真实模型验证应该在哪个阶段做、由谁承担？** 初步判断：不应继续后推；建议与方向 1 并行，由 Owner 在设置页填 KEY 后执行，产出文档而不是口头结论。证据：13.3。
12. **「模型可选」的边界应定在哪？** 初步判断：当前推理模型 3 项 + 图片模型/渠道目录已够，不宜扩展成模型管理系统；只需把选择值接进现有 `modelName(input, SPEC)` 与 `routingFields`。证据：10.1、10.4。
13. **旧详情模块何时可以动？** 初步判断：在详情创作三条路径真机验收通过前不动；届时也应只读盘点、逐步迁移，而非删除。证据：15 章、总任务书 §三。
14. **V206 改了共享 `CachedImage`/`MainCanvasBoard`，是否需要给旧功能补回归？** 初步判断：已有无头三视图 `fatal=false` 与真实 96 条历史探针【沙】，但缺 Owner 真机非最大化窗口与长会话滚动验证，建议纳入方向 5。证据：11.3、13.3。
15. **「全应用只在设置页填 KEY」是否要追改旧换装弹窗？** 初步判断：属既有功能遗留、与本次工作区无关；若严格解释约束应另出小单处理，但**不应混进方向 1–5**，避免扩大范围。证据：10.6、15 章。

---

## 18. 关键代码、文档、测试和截图索引

### 18.1 关键代码

| 主题 | 路径 |
|---|---|
| 导航 / 视图分发 | `src/features/storage/storage-store.js:19-41`、`src/main.jsx:93-98, 1014-1108` |
| 详情创作根视图 / 状态 | `src/features/detail-studio/components/DetailStudioView.jsx`、`state/use-detail-studio-state.js` |
| A/B/C 面板 | `src/features/detail-studio/intake/`（`IntakeArea.jsx`、`mode-a|b|c/`） |
| 规划/生成/版本面板 | `src/features/detail-studio/{planning,generation,versions}/` |
| 前端 API 封装 | `src/api/detail-studio.js`（~20 导出）、`src/api/images.js`、`src/api/client.js` |
| 服务端路由 | `server/routes/detail-studio.routes.js`、`generation/routes.js`、`versions/version-routes.js` |
| 项目存储 | `server/features/detail-studio/store/project-store.js` |
| 规划编排 | `server/features/detail-studio/planning/{analyze-strategy,director-visual,compile-screen,qc-review}.js` |
| 任务系统 | `server/features/detail-studio/generation/{task-model,orchestrator,local-images-generator,task-store}.js`、`server/core/task-store-core.js` |
| 版本系统 | `server/features/detail-studio/versions/{version-store,version-routes}.js` |
| 模式 C 纯函数 | `server/features/detail-studio/intake/mode-c.js` |
| 能力资产 | `prompts/detail-studio/{core,prompts,quality,industry,platform,references}/` |
| 旧底座（只读复用） | `prompts/server/detail-skills.js`、`server/detail-middleware.js` |
| 模型基础设施（零改动） | `server/core/ai-chat-shared.js`、`server/channel-config.js`、`server/channel.js`、`server/core/image-concurrency.js`、`server/core/runtime-config.js`、`server/routes/images.routes.js`、`src/shared/routing.js` |
| 共享 UI / 令牌 | `src/shared/ui/`、`src/styles/tokens.css`、`src/features/detail-studio/styles/detail-studio.css` |
| V206 修复 | `src/shared/ui/cached-image.jsx:83-124,219-268`、`src/features/main-app/panels/main-canvas-board.jsx:111,164-198` |

### 18.2 文档

- 阶段 0：`docs/V4.0-详情创作工作区-阶段0技术摸底报告.md`（含 §9 Owner 六项裁决与 R5 修订）
- 执行单：`docs/执行单/README.md`（总表，V198–V206）、`docs/执行单/已完成/2026-11/V4.0-执行单-V2*.md`
- 验收/设计报告：`docs/复盘/V4.0-详情创作工作区-阶段{1,2,3A,3B,3C,4,5}*.md`、`docs/复盘/V4.0-快捷生成OOM修复验收报告.md`
- 指针：`docs/ai-tryon/NEXT.md`（当前「无在跑单 · 阶段 6 顺延 V207」）
- 项目纪律：`AGENTS.md`、`docs/项目定位与开发路线.md`、两端 `src/features/detail-studio/README.md` 与 `server/features/detail-studio/README.md`、`prompts/README.md`

### 18.3 测试与门禁

- `scripts/verify/run-all.mjs`（ORDER 84 / FAST_ORDER 70）
- V202–V206 新门禁：`mode-c-purity-check`、`option-effect-check`、`frozen-prompt-parity-check`、`qc-ceiling-check`、`industry-strategy-match-check`、`skill-asset-contract-check`、`screen-edit-isolation-check`、`version-idempotency-check`、`v203-core-smoke`、`v203-orchestrator-smoke`、`quickgen-image-budget-check`
- `scripts/dev/verify-detail-studio-model-chain.mjs`（12/12 mock fetch）
- `tmp/` 留存但未进 git：`test-b1.mjs`、`test-split.mjs`、`stage1-*.mjs`、`stage2-verify.mjs`、`v201-browser-check.mjs`、`v202/v203/v204/v206-public-check.mjs`、`v206-realdata-check.mjs`、`oom-quickgen-check.mjs`、`v203-*-smoke.mjs`

### 18.4 截图

**仓库内无 V200–V206 页面截图或结构图。** `docs/ai-tryon/eval/` 下 120 png + 8 jpg 是 AI 试穿 eval 出图/掩膜，与本次工作区无关。阶段 1 §4、阶段 2 §4 明确「本环境无法落盘截图，改以浏览器探针回执为证」；V201 引用的 Owner 两张实机截图不在仓库。若需要 UI 判断，请由 Owner 另行提供当前版本截图。

---

## 附：统筹 AI 取证说明

- 本报告结论基于 `bdfc401` 只读取证；六路并行源码探查 + 统筹亲自复跑关键命令。
- P0-1「A/B 生成阻断」由 `buildBatchSpec` 动态 import 实证（补合法渠道后仍抛「没有可生成的屏」）；P0-2「参考图未传递」由 `buildTaskRecord` → `runTask` → `local-images-generator` 三处代码链路静态确认，标为【代码推断】因未发送真实请求。
- 受保护基础设施零改动由 `git diff --stat e255931 HEAD -- <12 文件>` 无输出确认。
- 行业包差异由 `getIndustryStrategy` 动态 import 逐包打印 `decisionLogic/contentPlan/promoBoundaries` 确认。
- V206 真实数据效果由 `tmp/v206-realdata-check.mjs` 在 8787（96 条真实历史）无头浏览器确认：`historyCount=96`、首屏 89 img、堆 23 MB、无 OOM、加载更多 30→60 生效。
- 所有「真实 API / 真机」类结论均标注为未验证，未把 Mock / Sandbox / 无头探针计入。
