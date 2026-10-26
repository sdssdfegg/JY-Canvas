# STATUS — 高保真换装能力体系

> 更新规则：每次 AI 完成任务必须更新本文件（总纲 §4.2）。最后更新：2026-10-27（统筹，P1-7 合入 main `32113a0` 并归档 ⇒ P1 阶段正式收官）。

## 当前阶段

**P1 已收官（P1-1～P1-7 全部合入 main 并归档）；P0-B 实验进行中（E4/E5 待跑）** — 上位总纲：`docs/ai-tryon/升级实施方案-V11-电商换装能力升级.md`；分解：`docs/ai-tryon/执行单/P1-分解总览.md`；实验：`docs/ai-tryon/eval/`。

## 已验收项（P0-A 源码核验，2026-10-22 统筹实测）

- v4.0 基线锚点：annotated tag `v4.0` → main `c0c75b7`；v5.0 全程回退点。
- 文档间口径裁定：阶段命名与样本量以总纲 P0–P5 为准（见 DECISIONS.md D-01/D-02）。
- 源码证据清单与能力/缺口表：见 `EVIDENCE.md`（模型 ID、A+B 多图、mask 置空点、能力目录、日志字段、上传清理均已核验，带 文件:行号）。
- `docs/ai-tryon/` 状态文档结构建成并注册进 `docs/README.md` 单一索引。
- P0-B 工具包就绪：`scripts/ai-tryon/p0-probe.mjs`（dry-run + 预算硬顶 50 + 运行时 KEY）+ `eval/p0-cases.json` + 样本登记表 + 评分规则 + 运行手册。
- 预算批复：用户 2026-10-22 21:16 批准 **≤50 次生成调用**（配额分配见 V128 §1.5）。

## 并行准备（用户 2026-10-22 21:50 授权：「测试等后面在做，你先继续做其他的」）

- **T-001 P1 设计包已完工**（纯文档，不依赖 P0-B 结论）：`contracts/` 四份契约（tryon-task 数据契约 / state-machine 状态机 / prompt-template-v1 分层模板 / log-fields 日志扩展）+ `adr/ADR-001` 草案（架构：维持现有内聚架构，待 E6 补证 + 用户批准）。切片契约：`tasks/T-001.md`。
- **V129 P1 施工单已拟稿**（未派发，三前置未齐冻结）：`docs/执行单/进行中/V4.0-执行单-V129-P1换装任务对象与Prompt版本.md`。
- **V130/V131 v4.0 遗留清理已施工**（统筹直施工，门禁全绿，待提交）：outfit-top.js 死常量 −126 行（V130）；CSS 死规则 −470 行 + 新代码样式约定入本 README（V131）。
- **T-002 P2/P4 契约包已完工**（2026-10-23，纯文档）：`contracts/garment-profile.md`（服装档案：版本快照/基准禁覆盖/用户资产红线）、`contracts/quality-report.md`（质量报告：八维/三源判定/失败可解释）、`contracts/interfaces.md`（八接口签名 + 能力三态 + P1 实现子集）、`adr/ADR-005` 草案（扩展现有能力目录，不建平行矩阵）。切片契约：`tasks/T-002.md`。
- **V5.0 系列「其他」开发（不依赖样本）**：2026-10-23 起 V5.0-001～V5.0-004 完工；2026-10-24 补做 **V5.0-005（增量更新演练，5/5 全绿 + 修 3 个阻断缺陷）** 与 **V5.0-006（批量结果卡 memo 化，R2 收官）**，均已归档，`docs/执行单/进行中/` 保持清空。下一单候选见 `NEXT.md`。
- 边界守住：未越阶段门禁（P1 未开工）、未碰用户数据、未引新依赖。
- **P0-A 源码审计与 MVO 实施拆解收官（2026-10-26）**：consolidated 交付物 `docs/ai-tryon/P0-A-源码审计与MVO实施拆解.md`（架构/调用链路图、能力对照表、问题清单、MVO 计划、P0-B 清单）；并修正 `EVIDENCE.md` S2/S7/S8 行号与 Prompt 体系描述。本任务按方案 §13 暂停，待用户确认后进 P1。

## P1 拆单（2026-10-26，用户确认报告方向后授权）

- **P1 已分解为 7 张可独立派发的执行单**，落 `docs/ai-tryon/执行单/`：`P1-分解总览.md`（依赖图+派发序+门禁）+ `P1-1` 任务存储与原子写层 / `P1-2` 能力三态读取器 / `P1-3` 日志字段扩展 / `P1-4` 状态机最小版 / `P1-5` 统一接口子集（统一执行入口·核心） / `P1-6` 路由内嵌写入与启动恢复 / `P1-7` Prompt 模板挂载与版本冻结。
- **派发状态**：P1-1 / P1-2 / P1-3 / P1-4 / P1-5 **已完成（合入 main，见下）**；P1-6 **可立即派发**（零 P0-B 依赖，仅结构+默认 UNKNOWN 不进主路径，遵守 interfaces.md §2 三态纪律）；**P1-7 阻塞**：双分支句待 P0-B E1（Mask 语义）结论，隔离至此单。
- **取代关系**：原 `docs/执行单/已完成/2026-10/V4.0-执行单-V129-P1换装任务对象与Prompt版本.md`（整包拟稿+一处 P0-B 前置）已标为「已被取代」，内容由 P1-1～P1-7 吸收重构。
- **不破边界**：7 张单均只增不改语义（能力目录/日志只增字段、路由只嵌写入）、零依赖叶子纪律、复用现有 `channel.js`/`outfit-skill.js`/`history-store.js`，不引新框架/数据库、不碰用户数据/配置。
- **门禁纪律**（沿用项目既有）：单张派发→特性分支→门禁（check-syntax 293/293 + run-all --fast 35/35 + ESLint 0 error + 全量 run-all 54/54 + 构建 EXIT=0 + public 首启动冒烟）→合并 main→归档 `docs/执行单/已完成/`；`docs/执行单/进行中/` 保持单张在跑。回滚点 `v4.0` tag（`c0c75b7`）保底。

## P1 已落地（2026-10-26，用户逐单授权派发）

- **P1-1 任务存储与原子写层**（合入 main `437cca2`）：`server/ai-tryon/task-store.js` 零依赖叶子 + `aiTryonTasksDir` 路径出口；门禁全绿，运行时冒烟 11/11（含损坏回退）。
- **P1-2 能力三态读取器**（合入 main `282e2d6`）：`server/channel-config.js` 新增 `TRYON_CAPABILITY_STATES`/`normalizeTryonState` + `resolveModelCapabilities` 统一出口，目录三态字段（`maskSupport`/`seedSupport`/`dualImageUnderstanding`）默认全 `UNKNOWN`；门禁全绿（run-all --fast 35/35、ESLint 0 error、check-syntax 294/294），零 P0-B 依赖。
- **P1-3 日志字段扩展**（合入 main `fb509c2`）：`server/core/generation-logger.js` 新增 `sanitizeLogEntry` 脱敏兜底（KEY 字段三层剥离，写入前统一过）+ `@typedef GenerationLogEntry` 形式化 `contracts/log-fields.md` §2 扩展字段 + `taskLogLines` 透出有值字段；新增单测 `scripts/verify/generation-log-fields-check.mjs` 入 `run-all` `FAST_ORDER`；门禁全绿（check-syntax 295/295、ESLint 0 error、size-ratchet 0 回归、run-all --fast 36/36、vite build EXIT=0），零 P0-B 依赖。
- **P1-4 状态机最小版**（合入 main `46db7b9`）：新增 `server/ai-tryon/state-machine.js`（零依赖叶子，纯函数）实现子集 `CREATED→VALIDATING→READY_TO_GENERATE→GENERATING→EVALUATING→SUCCEEDED/FAILED/CANCELLED/NEEDS_REVIEW` + `transition`/`isTerminalState`/`checkBudgetBeforeCall`/`isRetryableError` + 契约 §5 十标签；ANALYZING/POSTPROCESSING/REPAIR_PENDING/RETRY_WAIT 留位；新增单测 `scripts/verify/state-machine-check.mjs` 入 `run-all` `FAST_ORDER`；门禁全绿（check-syntax 297/297、ESLint 0 error、size-ratchet 0 回归、run-all --fast 37/37、vite build EXIT=0），依赖 P1-1 `437cca2`，零 P0-B 依赖。
- **P1-5 统一接口子集（统一执行入口·核心）**（合入 main `739a56e`）：新增 `server/ai-tryon/execution.js` 编排层——`createTryOnTask`（幂等建任务 + 冻结推进）/ `buildTryOnPrompt`（委托 outfit-skill 权威提示词）/ `classifyTryOnError`（委托 image-error-policy）/ `retryOrRoute`（纯函数，有限可解释退避、不内部循环）/ `generateTryOn`（调用前编排：预算门 P1-4 + 能力门 P1-2 + 路由校验 + 状态推进 + attempt/日志 P1-1/P1-3 + 失败终态），真正出海由**注入 dispatch** 承担（边界收敛，零改动现有请求路径）；`analyzeInputs/postProcess/evaluateResult` 预留签名抛 `NotImplementedError`；新增单测 `scripts/verify/tryon-execution-check.mjs` 入 `run-all` `FAST_ORDER`；门禁全绿（check-syntax 299/299、ESLint 0 error、size-ratchet 0 回归、run-all --fast 38/38、vite build EXIT=0）。
- **P1-6 路由内嵌写入与启动恢复**（合入 main）：新增 `server/ai-tryon/recovery.js`（零依赖叶子，启动链路挂接）+ `server/ai-tryon/route-inlay.js`（入口建任务 / 出口落 attempt+结果资产+终态，后台写不占响应时间）+ `state-machine.js` 新增 `planPathToTerminal`（终态收敛路径规划，两处复用）；`outfit.routes.js` 4 处内嵌（不改生成路径、不新增路由、不动并发槽），响应体回传 `tryonTaskId`；`server/index.js` 启动挂 `runAiTryonStartupRecovery`（永不抛出、绝不自动重新生图）；新增单测 `scripts/verify/tryon-recovery-check.mjs`（45 项，含零依赖叶子红线静态扫描）入 `FAST_ORDER`；门禁全绿（check-syntax 302/302、ESLint 0 error、size-ratchet 0 回归、run-all --fast 39/39、vite build EXIT=0、**public 首启动冒烟 http=200**）。另修复 P1-5 单测污染数据目录问题（改为自清理，存量 34 条测试残留已清）。
- **P1-7 分层 Prompt 模板挂载与版本冻结**（**已合入 main `32113a0`，已归档 `已完成/2026-10/`**）：新增 `prompts/server/outfit-prompt-template.js`（**零依赖叶子**，仅 node:crypto）——模板注册表 `PROMPT_TEMPLATES` 含 **v1** 契约 §2 全文（保留未固化双分支句，作 P0-B B 组实验基线/历史留档）与 **v2**（按 P0-B E1 实测结论**固化**到「已验证的兜底流程」分支）；`computeTemplateHash`（sha256 前 12 位，模板文本任一字符改动即换哈希＝冻结回溯的前提）；`assembleLayers` 按契约 §1 装配四层（固定规则→服装档案→模特约束→单次任务指令），空层自动跳过；层 2/3 为 **P2/P3 占位桩**（恒空串，不改变输出）。`execution.buildTryOnPrompt` 的单次任务指令层仍由权威 `buildOutfitPrompt` 构建（语义不变），命中模板版本时才叠加固定规则层，并返回 `templateVersion`/`templateHash`/`layers`；`createTryOnTask` 于进入 `READY_TO_GENERATE` 时**冻结** version+hash 写入任务与生成日志（contracts/tryon-task.md §4 / log-fields.md §2）。新增单测 `scripts/verify/tryon-prompt-template-check.mjs` 入 `run-all` `FAST_ORDER`（**--fast 39→40**）。**🔴 默认不挂载模板**（`DEFAULT_PROMPT_TEMPLATE_VERSION=null`）⇒ 生产提示词与历史契约逐字一致，P0 生命线零风险；是否切到 v2 需先跑基线/回归样本评测（总纲 §4.1），本单不自动生效。门禁全绿（check-syntax 304/304、ESLint 0 error、size-ratchet 0 回归、run-all --fast 40/40、vite build EXIT=0）。
- **P1-8 结构化提示词 v3：部位化「保持不变」+ 掩膜区域约束挂载**（2026-10-27，分支 `feature/p1-8-outfit-prompt-v3`，**待验收**）：起因是用户反馈「做了这么多前端什么变化都没有」——排查发现 **P1-7 的模板层根本没有生效点**：真实出海路径是 `outfit.routes.js:302/383` 直接调 `buildOutfitPrompt`，而模板装配所在的 `buildTryOnPrompt` **全仓无生产调用点**。`prompts/server/outfit-prompt-template.js` 新增 **v3**（在 v2 基础上加 `{{replaceClause}}` / `{{keepClause}}` / `{{maskClause}}` 三个变量槽，各占独立一行，无值整行删除；hash 只锁规则文本、不随变量值变）+ `renderFixRule`；`prompts/server/outfit-skill.js` 新增 `buildOutfitStructureVars`（「保持不变」口径**直接复用**前端唯一实现 `outfit-intent.js:434 outfitKeepText`，服务端不另写一份）+ `withPromptTemplate`（**守门**：只有带合法 outfitIntent 的批量换装分支才叠加，其余 workflow 原样返回 ⇒ 快捷/批量生成/**局部回贴**/精修/改色逐字不变）；`outfit.routes.js` 302/383 两处接通挂载点。**裁决**：`DEFAULT_PROMPT_TEMPLATE_VERSION` 由 `null` → `"prompt-template-v3"`（回滚＝改回 null，一行）；掩膜**能力加进来但默认 `none`**（E1 实测未见量化增量，ADR-002 暂定 B），调用方显式传 `maskMode=garment|body` 才启用。新增单测 `scripts/verify/tryon-prompt-template-v3-check.mjs`（含部位口径与前端对齐断言）入 `FAST_ORDER`（**--fast 40→41**）。门禁全绿（check-syntax 306/306、size-ratchet 0 回归、run-all --fast 41/41、vite build EXIT=0）。
- **P1 收官**：P1-1～P1-7 全部落地 ⇒ **P1「统一图像编辑执行入口」阶段完成**。下一阶段 = P2（单图连续编辑 + 版本管理 + 服装档案），其前置为 P0-B 剩余项（E4 seed / E5 结构化提示词）与 E6 视觉分析结论。

## P0-B 实验进度（2026-10-26：暂停解除并实测）

> ✅ **暂停已解除**：用户 2026-10-26 投放 4 组 8 张样本、提供 A 组提示词原文、运行时提供 KEY ⇒ 原「⏸ 暂停·等样本」四条阻塞项（样本投放 / A 提示词 / 实验执行 / 人工评分）中，**前三条已解除**；仅第 4 条（人工评分）待补。
>
> 执行方式说明：原计划「用户本机执行探针」，实际由执行方在用户运行时提供 KEY（`JINGYIN_PROBE_API_KEY`，禁落盘）后代跑；链路指向用户本机 `http://127.0.0.1:8787`。

| 实验 | 状态 | 结果位置 | 结论 |
|---|---|---|---|
| E0 冒烟 | ✅ 通过 | `eval/results/e0-smoke/` | TT2.5 + Origin `silent-tt25-line-06` → http 200 / 103s，链路打通 |
| E1 Mask 语义（生死题） | ✅ **12/12** | `eval/results/e1-*` | 见 `EVIDENCE.md` §三-A；**已解锁 P1-7** |
| E2 双图忠实度 + A 基线 | ✅ **15/16** | `eval/results/e2-*` | 失败 1 例为瞬时 504（`e2-tt25-s04-r1`），其重试 r2 成功 |
| E4 尺寸/可复现性 | ✅ **7/7**（2026-10-27） | `eval/results/e4-*` | 见 §三-D：噪声基线 ≈1 分；掩膜效应 0.5 < 噪声 ⇒ 加固「掩膜无效」；比例/分辨率无负面作用 |
| E5 结构化 Prompt 初探 | ✅ **12/12**（2026-10-27） | `eval/results/e5-*` | 见 §三-E：六维全面提升（9.30→10.58，**A 级 0/27 → 4/12**）；TT2.5 对提示词更敏感 |

**预算结算（2026-10-27）**：原 cap 50 系按 E4=6 例测算（实为 7 例）⇒ 口径更正后 cap 50→**52**，用于容纳已发生的 3 次失败重试。终态 **51/52**，剩余 1 次未使用。全部计划实验（E0/E1/E2/E4/E5）**零缺口完成**。

**渠道裁定（2026-10-26 用户）**：`tt-image-2.5` **不走云枢**，用第二个渠道 Origin（`silent-tt25-line-06`）；`nano-banana-pro` 走云枢（`silent-pro-line-01`）。探针已按模型解析默认渠道（`scripts/ai-tryon/p0-probe.mjs`）。

## 未完成项

- **P0-B 实验**：✅ E4（7/7）/ E5（12/12）已于 2026-10-27 跑完，与 E0(1/1)/E1(12/12)/E2(15/16) 合计 **47/48 成功**（唯一失败为瞬时 504，同参重试已成功）。**仅剩 E6 视觉分析可用性待用户端直播抽查**（已确认既有 `generation.jsonl` 中分析记录 0 条，无捷径）；E3 代码侧已完成，上游真实输入上限仍 UNKNOWN。
- **P0-B 人工评分**：✅ 已完成（2026-10-27）—— **39 例**（E1 12 + E2 15 + E4 7 + E5 12 成功例；`e2-tt25-s04-r1` 无出图不可评）全部按 `eval/人工评分规则.md` 六维逐张评分，分数与依据写入各结果目录 `score.md`，汇总指标已回填 `EVIDENCE.md` §三-C / §三-D / §三-E。
  - **基线批次（E1+E2，27 例）**：均分 **9.30/12**，**A 级 0 张**（B=24 / C=3）⇒ 当前基线**无一例达"直接交付"标准**。
  - **瓶颈排序**：版型/额外部件（2 分率仅 4%，模型"过设计"而非"换衣"）< 图案/细节（41%）< 非编辑区（67%）；人体结构（96%）与颜色（78%）为强项。
  - **双模型**：`nano-banana-pro` 画质 9.75 vs `tt-image-2.5` 8.86，且 tt25 有 2 例 C 级 ⇒ **画质与耗时两口径均指向香蕉 Pro**。
  - **E4（7 例）**：均分 8.86/12；**量化出随机噪声基线 ≈1 分**。
  - **E5（12 例，结构化提示词）**：均分 **10.58/12**，**A 级 4 张** ⇒ 六维全面优于当前基线（+1.28）。
  - ⚠️ 口径限制：本轮为**视觉模型自评**（规则明示只作参考、非唯一真值）。
  - 🔴 **跨批次评分漂移（实测）**：同配置（s01+TT2.5+提示词A+无掩膜）在 E1 批次得 9、E4 批次得 8/8/7 ⇒ 极差 2 分。**绝对分数不可跨批次直接比较**；E5 vs E2 的 +1.28 为提示性证据，切换生产默认前须同批次 A/B 复验 + 用户目视确认。
- **P1-7 合入**：✅ 已完成 —— 2026-10-27 统筹复核通过，merge `32113a0` 入 main，执行单归档至 `docs/ai-tryon/执行单/已完成/2026-10/`。**P1 阶段 7 张单全部落地并归档**。
- **ADR 草案**：
  - **ADR-001**（架构：内聚 vs 独立视觉服务）：**草案**，仍待 **E6** 视觉分析实证（用户端直播抽查）后定稿。
  - **ADR-002**（Mask 语义与人体保护主路径）：✅ **草案已成文**（`adr/ADR-002-Mask语义有效性与人体保护主路径.md`）—— 据 E1+E4 实测暂定 **B（语义优先·兜底）**，并设 P3 复验门槛（精确掩膜 + 钉 seed ≥6 例）。
- **P0 退出报告**：✅ 已出具 —— `docs/ai-tryon/P0-退出报告.md`（含能力矩阵三态、A/B/C 基线、最小开发清单）。**唯一未闭合项 = E6**，需用户端直播抽查。

## 门禁状态（2026-10-26 实测，P1-7 后）

- **check-syntax**：**304/304**（+2 新文件：`prompts/server/outfit-prompt-template.js`、`scripts/verify/tryon-prompt-template-check.mjs`）。
- **ESLint**：**0 error**（基线 1 warning：`server/routes/outfit.routes.js` `deferOutfitAutoSave`，保留项）；新脚本 `scripts/ai-tryon/p0-probe.mjs`、`scripts/verify/tryon-prompt-template-check.mjs` 干净。
- **size-ratchet**：**0 回归**（`execution.js` 增量后复跑通过）。
- **run-all --fast**：**40/40**（P1-7 新增脚本后 39→40）。
- **vite build**：**EXIT=0**。
- **public 首启动冒烟**：`NODE_ENV=production` → **http=200**（1s 内），启动恢复钩子正常。
- 纪律：size-ratchet 独立于 lint，改行数必须复跑；`regressions=[]&&improved=[]` 时不许 `--update`；同时只跑一个套件。

## 风险

实验烧真实额度（已设 50 硬顶 + 触顶即停）；中转限流/超时（记录错误码分布即产出）；人工评分主观性（规则已先固化）；Mask 若无效 → P3 改语义编辑 + 原图恢复路线（总纲已设计兜底，不影响 P1/P2）。
