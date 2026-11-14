# JY-Canvas-详情创作改造-修订后架构方案与分阶段实施规划

> **性质**：外部架构审查意见的吸收与裁决 + 重新核代码后的修订方案 + 分阶段实施规划。**不是已实现功能说明，不是执行单。**
> **代码快照**：分支 `feature/v171-r-p2-4`，HEAD `aa78b55`（V212-R1 收口归档）。
> **证据分级**：本轮全量为 **E1 静态代码实证**（Read / Grep / 只读 Node 结构打印 + 三路独立只读代码调研 + 统筹亲自复核 11 份关键源码）。文中引用的 E2/E3/E4 均来自既有交付记录，**不代表本轮重跑**。
> **边界（严格遵守）**：本轮**未修改任何业务代码**（`src/` `server/` `prompts/` `scripts/` `seed/` `data/**` 零改动）；**未创建执行单、未修改 `docs/ai-tryon/NEXT.md`、未修改总表、未提交 git**。本文件是本轮唯一交付物。
> **输入**：《JY-Canvas｜详情创作产品流程审视与最小必要改造方案》（`docs/V4.0-详情创作产品流程审视与最小必要改造方案-2026-11-13.md`）+ Owner 转达的外部架构审查意见 + 《V4.0-项目状态快照与交接报告-2026-11-13.md》。
> **提交对象**：Owner（最终决策）与外部项目架构顾问（复审）。**完成后等待 Owner 审批，不自行开工。**

---

## 0. 结论先行

**外部 6 类裁决的方向全部采纳**，但有 4 处必须按实际代码收窄实现方式（§1.2），不能机械照搬。重新核代码后，比原方案多发现 **4 个 P0 级阻断**，其中两个直接决定「唯一必选 = 产品图」和「板块选择」在物理上能不能成立：

| # | 阻断 | 代码证据 | 不修的后果 |
|---|---|---|---|
| **B1** | **产品图像素从未进入任何策划模型** | `analyze-strategy.js:204-213`、`director-visual.js:253-262` 的 `messages[].content` 均为**字符串**，无 `image_url`；而 `server/core/ai-chat-shared.js:106-114` 已有 `safeImagePart`、`:61-70` 已有 `shouldRetryWithoutImages`，旧版 `server/detail-ai.js:184-206` 真的把 base64 图发进 content 数组 | 「产品图是唯一必选」是空话：图只用于生图参考，不参与商品分析与策划，「缺信息时由 Agent 从图分析、无法确认不虚构」无实现基础 |
| **B2** | **导演 `moduleId` 字段路径错配 + 静默回退** | schema 把 `moduleId` 定义在 `screens[]` 顶层（`prompts/detail-studio/prompts/director-visual.js:42`），`normalizeDirectorResult` 却读 `composition.moduleId`（`director-visual.js:181-183`），未命中即按位置回退到 hero/conversionClose/coreSellingPoint，无告警 | 即使注入客户选定的 18 项板块，也会被静默丢弃；「用户选择的是内容意图」无法落地 |
| **B3** | **screenId 由数组下标派生，三套定位口径互不校验** | `id: screen_${index+1}`（`director-visual.js:193`）；版本链按数字 `screenIndex`（`version-store.js:43,62,107`）；`frozenPrompts` 按 `screen.id`（`compile-screen.js:32`）；幂等键/生成 spec 按数组下标 i（`generation/routes.js:98`、`task-model.js:41-48`）；`VersionPanel.jsx:220` 读不存在的 `s.screenIndex` → `NaN` | 排序/增删屏必然造成版本、提示词、任务三方错配；「稳定 screenId」不是加字段能解决，是一次身份层迁移 |
| **B4** | **终态任务重复点击仍二次扣费** | `orchestrator.js:338-353` 幂等命中后仍 `specs.push(...)` 回传该屏；`detail-studio-generate.js:73-75` 不检查 `beginTask` 返回状态、无条件 `generateImages(form)`；`recordResult` 因终态跳过但不影响已发生的上游扣费 | 直接违反外部裁决「防止重复扣费」，是真金白银风险 |

另有两个会**让新数据结构写不进去 / 让新质检口径判红**的地基问题：`project-store.js:347-358` 的 `planning` 是**白名单重建**，任何新子键被静默丢弃；`checklist.js:246-257` 要求 `frozenPrompt` 与确定性重编译**字节一致**，若对 `resolvedPrompt` 直接跑，手动覆盖将永远判红。二者必须在任何功能开发前定好口径。

**是否具备进入正式执行阶段的条件：方案层面已具备，工程层面尚不具备。** 建议先批准 **S0（阻断清零与地基）** 一个阶段，且 S0 必须通过**真实模型验证**（带 KEY、非空跑门禁）后才逐阶段放行。详见 §9.7。

---

## 1. 外部审查意见的吸收与裁决

### 1.1 已吸收（逐条落到代码）

| 外部裁决 | 本方案落地方式 | 主要落点 |
|---|---|---|
| ① 前台恢复旧版左右两栏；旧页零回归；不新增并存简版页；不暴露项目/项目组/模式/自检/Agent/Skill/上下文 | `DetailStudioView.jsx` 单视图重排为「左：上传+可选设置+板块｜右：分段提示词+生成分屏」+ 固定主按钮；旧 `detail-main` 全链零改动；内部概念沉后台，文案去技术化 | S4 |
| ② 产品图唯一必选，其余可选且有默认；项目/任务/版本/策划后台自动 | 前后端双校验 + `ensure-draft` 幂等自动建项 + 一次点击编排 4 阶段 | S1、S4 |
| ③ 完整 18 项内容意图库；复用 `SCREEN_MODULES` + detail-studio 独立扩展层；不强制选择；AI 决定屏数/合并/顺序/表现；保留事实分级不编造 | 扩展层 `STUDIO_SCREEN_MODULES = {...SCREEN_MODULES, ...新增}` 只加意图元数据、不加固定提示词；不选择 = 现状（导演自主）；`filterPublishableFacts` 与 `prompt-compiler.js` 的 `unconfirmed` 兜底保留 | S3 |
| ④ 四层提示词 `generatedPrompt / manualOverrides / resolvedPrompt / confirmedPromptSnapshot`；展示、确认校验、生图请求、版本记录同用一份最终有效内容；确认后再编辑使确认失效并形成新待确认版本；最终提示词仍受质量约束 | 单一纯函数 `resolvePrompt()` 为唯一真相源 + 确认状态机 + **两轨质检**（§5.4）。**明确不采用原方案的「简单 manualOverrides 优先级」** | S2 |
| ⑤ 整套/单屏严格隔离；项目内多轮沟通上下文；不建通用长期记忆；单屏不改其他屏；整套先出变更草案（新增/删除/修改/顺序）并展示对已确认内容的影响、用户确认后应用；稳定 screenId | `scope=all\|screen` + 按 `screenId` 逐屏 patch + `draft` diff 端点 + 二次确认 + B3 身份层迁移；`project.planning.conversation[]` 项目内有上限轮次，不跨项目 | S2、S3 |
| ⑥ 一次点击生成分段提示词，但允许服务端多阶段；复用现有任务机制，评估进度/超时/恢复/幂等/防重复扣费/保留已完成成果；不建第二套任务系统 | `project.planning.job` 轻量阶段状态（**非**第二套任务系统，见 §1.2 ①）+ `POST /planning/run` / `/resume` + 复用 V210 分档超时与 9 字段日志口径；B4 修复防重复扣费 | S0、S4 |
| ⑦ V207/V208：当前详情创作不依赖 P2–P8、不新增通用 Tool 执行层、V208 适配器暂留不接入不清理、V207 路线图暂停标「历史设计·待重评」、**不推导整个项目未来不需要 Agent Runtime/Tool/Context**；无限画布/服装换装/跨模块智能协作保留独立评估权 | 见 §6，逐条写入架构边界；特别声明「本裁决作用域仅限详情创作模块」 | 全程 |

### 1.2 不采纳 / 按代码实际收窄（含证据）

> 说明：**没有整体否定项**——外部 6 类裁决方向全部成立。以下是「直接照字面实现会与代码冲突，必须收窄实现方式」，属独立判断而非拒绝意见。

**① 收窄「优先复用现有任务机制承载多阶段策划」——不能直接用现有 `generation` 任务层。**
证据：现有 `task-model.js:126` 的 `kind` 只有一个常量 `detail-studio-generation`；`idempotencyKey(projectId, screenIndex, frozenPrompt, versionId)`（`task-model.js:37-48`）绑定三个策划阶段都不存在的字段；策划 5 个端点（`detail-studio.routes.js:253/315/374/386/405`）是彼此独立的同步 HTTP 请求，**不产生任何任务记录**；`project.planning` 8 个字段全是成果数据、无状态位（`project-store.js:258-267`），`currentPlanRunId`（`:252`）全库无读写，是空壳；`logs/planning-calls.jsonl` 只记元数据且无消费方（`planning-call-log.js:16-19,61-69`）。
裁决：把策划塞进生图任务层会污染任务语义、破坏幂等键、与 `versionId` 绑定冲突。改为**复用其设计范式（阶段状态 + 幂等 + 看门狗 + 失败保留成果）**，在 `project.planning.job` 内实现项目内轻量阶段记录；这**不是**第二套任务系统（不新建 store/目录/调度器/任务文件），符合原意见「不新建第二套」的精神，但必须写明它不是对现有 `task-store` 的复用。

**② 收窄「稳定 screenId」为一次性身份层迁移，而非加一个字段。**
证据：见 B3 表格。三套定位口径（版本链按数字 `screenIndex`、`frozenPrompts` 按 `screen.id`、幂等/spec 按数组下标）全部随位置漂移，且 `updateDetailStudioProject` 写 `planning` 时不触碰 `versions`（`project-store.js:342-359`）、director 重跑不清空 `frozenPrompts`（`detail-studio.routes.js:353-359`），重排后旧版本链与旧冻结值会被挂到新屏内容上。`VersionPanel.jsx:220` 的 `Number(s.screenIndex)` 读取 ScreenSpec 根本不存在的字段（只有 `id` + `index`），已是 `NaN`。
裁决：必须做跨 10+ 文件的身份层迁移 + 旧项目键映射（§5.6），并把它列为 S2 的前置，不能作为「顺便加个 uuid」。

**③ 收窄「最终提示词也必须经过必要的质量检查」的实现口径。**
证据：`checklist.js:246-257` 的 `prompt` 维度要求 `frozenPrompts[screen.id]` 与 `compileScreenPrompt` 重编译结果**字节一致**，不一致即 `blocker`；`scanForbiddenWords`（`copywriting.js:76-81`）只被 `checklist.js:84` 用来扫 `copy.headline/subcopy`，**不扫提示词全文**；且质检只在用户主动调 `POST /planning/quality` 时才跑（`detail-studio.routes.js:405-460`），单屏编辑端点只校验非空（`version-routes.js:48-49`）。
裁决：若对含手动覆盖的 `resolvedPrompt` 直接跑现有 parity，会永远判红；若为了不判红而跳过质检，又违反「不得绕过全部质量约束」。采用**两轨**（§5.4）：parity 只约束 `generatedPrompt`；对 `resolvedPrompt` 另跑确定性校验并把校验前移到**写入时**。

**④ 收窄「产品图是唯一必选」——现有实现比「缺校验」更严重。**
证据：`FlowGuidanceBar.jsx:23,55` 的「必传」只是样式；`ReferenceImageDropzone.jsx:106` 明写「不传也可继续」；服务端全链无产品图校验。更关键的是 B1：两次 LLM 请求体都是纯文本 content，**产品图没有进入任何策划模型**。
裁决：「唯一必选」必须与「图进模型」捆绑实现，否则客户上传的图对策划毫无作用，只是生图参考图。列为 S0 的 B1，不放到「后续优化」。

### 1.3 外部意见未覆盖、但代码要求必须补的项（不扩大范围，属同目标内必要补齐）

- B4 终点重复点击二次扣费（`orchestrator.js:343-351` + `detail-studio-generate.js:75`）。
- `planning` 白名单重建会吞掉所有新状态字段（`project-store.js:347-358`）→ 新字段落位规则必须先定（§5.5）。
- 自动建项目零幂等：`createDetailStudioProject` 每次新 id（`project-store.js:244`）、端点无 clientToken（`detail-studio.routes.js:83-90`）、`data/detail-studio/projects/index.json` 已有同名重复项目佐证；且 UI 三处硬挡无项目时的上传（`ReferenceImagesPanel.jsx:30-41`、`ReferenceImageDropzone.jsx:84,171`）。
- 参考图闭环缺口：无删除端点（`detail-studio.routes.js` 仅 GET list/POST upload/GET serve）、项目侧上限 60（`project-store.js:27,382`）而生图侧只带 6 张（`detail-image-form.js:16`）、先落盘后写 JSON 无事务会产孤儿文件。
- `ratio / imageSize` 硬编码（`generation/routes.js:80-81,104-105`）与规划默认值 `21:9` 和面板默认 `3:4` 三处不一致（`analyze-strategy.js:64-65`、`basic-param-options.js:89`）。

---

## 2. 重新核代码：10 个技术问题逐条回答

> 以下「现状」均为 E1 实证；「改造要求」是待批准方案，不是已实现。

### Q1 自动创建草稿项目的最佳触发点、幂等、旧项目兼容

- **最佳触发点**：`src/features/detail-studio/state/use-detail-studio-state.js:320-338` 的 `uploadReferenceImage` 是唯一收口（前端 14 个动作在此检查 `currentProject`）。但服务端上传端点要求项目已存在（`detail-studio.routes.js:150-151`），因此必须**先 ensure 拿到 id，再拼上传 URL**。不能放在 `createProject`（`:114-130`，无 in-flight 去重）或 UI 组件里。
- **幂等方案**：浏览器侧 `sessionStorage` 持有 `draftClientToken` + 前端 in-flight ref；服务端新增 `POST /projects/ensure-draft { clientToken }`，按 token 查 index 命中即返回，未命中才调 `createDetailStudioProject`。`ReferenceImageDropzone.jsx:85-88` 逐张 for 循环只 ensure 一次并把新 id 向下传递。名称由首图文件名/时间自动生成，绕过 `project-store.js:241` 的 name 必填；`mode` 固定 `guided`。
- **旧项目兼容**：`migrateProject` 的 `if (schemaVersion === 2) return project`（`project-store.js:57`）是短路，老项目不会自动补新字段 → 读取方一律按 `undefined` 兜底，不 bump schemaVersion（bump 会牵动全量迁移）。`migrateProject:58` 是浅拷贝展开、无 delete，顶层未知字段安全保留。
- **硬约束**：新字段**不能放进 `planning`**（白名单重建），优先放顶层（§5.5）。
- 关联阶段：S1。

### Q2 产品图上传 / 持久化 / 分析模型读取 / 生图引用是否闭环

| 段 | 现状 | 判定 |
|---|---|---|
| 上传 | `ReferenceImageDropzone.jsx:83-92` → `src/api/detail-studio.js:87-93` → `detail-studio.routes.js:142-179`，落 `data/detail-studio/assets/<id>/<filename>`，条目 `{id,role,filename,label,mimeType,size,createdAt}`，GET 时补 `url`（`:133-136`） | ✅ |
| 持久化 | `appendReferenceImage`（`project-store.js:374-392`）append + `slice(-60)`；**无删除端点**；文件先写盘再写 JSON，失败留孤儿文件；无 `path`/像素尺寸字段 | ⚠️ 半闭环 |
| **分析模型读取** | **`analyze-strategy.js:204-213` 与 `director-visual.js:253-262` 的 `messages[].content` 都是字符串**，无 `image_url`；`buildAnalyzeContext` 只传 `referenceMeta = {role,filename,label}`（`analyze-strategy.js:120-121`），提示词明写「不含像素」（`prompts/detail-studio/prompts/analyze-strategy.js:46`） | ❌ **断裂（B1）** |
| 生图引用 | `detail-studio-generate.js:37-58` `loadReferenceBlobs` → `buildDetailStudioImageForm`（`:62-72`）→ `detail-image-form.js:48-87` 把 `image` 多文件 + `referenceMeta` 送 `POST /api/images`；产品图为空则走纯文生图，服务端不拒绝 | ✅（但缺硬校验） |

**能力已具备，只是没接**：`ai-chat-shared.js:106-114` `safeImagePart`、`:61-70` `shouldRetryWithoutImages`；旧版 `detail-ai.js:184-206` 已实现 content 数组带 base64 图 + 四 mode 降级（`:239-244`、`:271`）。改造 = 在 analyze 阶段把 `role==="product"` 的图（≤6 张，读 assets 目录）附进 content；director 不重复发图，消费 analyze 的结构化事实。上游不支持多模态时降级并显式告知，**不静默**。
关联阶段：S0（B1）+ S1（硬校验与删除端点）。

### Q3 现有任务机制能否承载多阶段策划及失败恢复

**不能直接用，但可复用其范式。** 现状：任务层只有生图一种 kind（`task-model.js:126`）；策划 5 端点独立、无编排器、无 job、无阶段状态（`detail-studio.routes.js:253/315/374/386/405`）；`project.planning` 8 字段全是成果（`project-store.js:258-267`）；前端用户逐个点 5 个按钮（`PlanningPanel.jsx:41/159/201/204/255`），`use-detail-studio-state.js` 里是 5 个互不调用的 `useCallback`。

**失败后成果保留是隐式副作用**（每个端点失败即 return 不写盘 + `updateDetailStudioProject` 的 planning 受控合并不清空其它子键，`project-store.js:342-359`），**不是设计的恢复机制**；没有「跳过已完成阶段」判定，也没有阶段耗时/错误类别落库（`logs/planning-calls.jsonl` 只记元数据、无消费方）。

改造：`project.planning.job = { runId, status, stages:{analyze,director,compile,quality}, startedAt, updatedAt }`，每阶段状态含 `status/startedAt/finishedAt/durationMs/errorClass/upstreamStatus`（复用 V210 九字段口径）；`POST /planning/run` 串行、每阶段结束即写盘；`/resume` 从第一个非 success 阶段继续，**不重跑已成功阶段**（不重复模型调用/扣费）；`runId` 由 clientToken 派生防重复；进度由 `GET /planning/job` 反馈。见 §1.2 ①。
关联阶段：S0（口径）+ S4（编排）。

### Q4 板块选择如何进入导演输入、结构化输出、规范化校验

现状三处**全缺**：`project` 无 `selectedModules` 字段（`BP_KEYS` 亦无，`project-store.js:312-317`）；`buildDirectorUserPrompt`（`prompts/detail-studio/prompts/director-visual.js:71-78`）无该参数，且声明的 `options` 参数函数体未使用；`DIRECTOR_OUTPUT_SCHEMA` 的 `moduleId` 定义在 `screens[]` 顶层（`:42`），而 `normalizeDirectorResult` 读 `composition.moduleId`（`director-visual.js:181-183`），未命中**静默回退**到位置默认模块（B2）。

改造四步：① `project.selectedModules`（顶层，含 `{moduleId, label, priority, customIntent?}[]`，空数组 = 不强制选择）；② `buildDirectorContext`（`director-visual.js:115-157`）读它并注入 `buildDirectorUserPrompt` 新增段「【客户希望展示的内容（意图与优先级，非固定模板）】」；③ 扩展层 `STUDIO_SCREEN_MODULES` 提供 18 项元数据（只加 `id/name/aliases/purpose/composition/promptDirectives/qcRules`，**不写死提示词**）；④ `normalizeDirectorResult` 修字段路径 + 输出规范化后校验：命中扩展库则保留、未命中则记 `warning` 并回退，**禁止静默丢弃客户选择**；导演 system prompt 已有「不套固定模板」（`director-visual.js:21-23`），保持不变，由 AI 决定屏数、合并、顺序与具体表现。
关联阶段：S0（B2 修复）+ S3。

### Q5 单屏 patch 如何确保其他分屏数据不变

现状：无逐屏 patch / reorder / add / delete 端点（全 `server/features/detail-studio/**` 无命中）；`planning.screens` 是整体替换（`project-store.js:352`）；`frozenPrompts` 一旦传入也是整个对象替换（`:355-357`）；唯一的 `/screens/:screenIndex/edit` 是「带完整提示词触发一次单屏出图」，不是字段 patch（`version-routes.js:40-49`）。

改造：新增 `PATCH /planning/screens/:screenId`，服务端只做「按稳定 `screenId` 定位 → 校验 patch 白名单字段 → 替换该元素」，**不重建数组其它元素**；`reorder/delete/add` 走独立端点且只改顺序与 `index` 字段，不动 `screenId`。落盘前计算其它屏的 `JSON.stringify` 快照，落盘后逐屏比对，**任一字节变化即回滚并返回 409**。门禁 `screen-patch-isolation-check` 断言 + 负向对照（现有 `screen-edit-isolation-check.mjs:70-75` 只断言「版本编辑不重跑 planning」的整体快照，不覆盖逐屏 patch，需新增而非复用）。
关联阶段：S2。

### Q6 整套修改如何预览差异、保护已确认内容

现状：无整套草案能力。可用的只有模式 C 行级 diff（`mode-c.js:45-95`，仅提示词整理）、编译预览（不落库）、版本并排文本对比（`VersionPanel.jsx:237-260`）。

改造：`POST /planning/revise { scope:"all", instruction }` **只返回 draft 不落库**，`draft.diff = { added[], removed[], modified[], reordered[] }`，按稳定 `screenId` 比对；同时返回 `affectedConfirmed: [{ screenId, reason }]`，列出哪些屏的 `confirmedPromptSnapshot` 会失效。前端展示草案 + 影响清单，用户确认后 `POST /planning/revise/apply { draftId }` 才写库；应用时逐屏 patch（复用 Q5 隔离），只把受影响屏置 `confirmState = "dirty"`，其余屏保持 `confirmed`。对已确认内容的影响**未展示、未二次确认时不许应用**（服务端校验 `draftId` 与 `affectedConfirmed` 确认回执）。
关联阶段：S3。

### Q7 四层状态如何实现展示、请求、落库三同源

现状：四层名称在 `server/**` 与 `src/**` **全部未找到**（仅在设计文档里作为提案）；只有单层 `planning.frozenPrompts` + 模式 C 的 `modeC.frozenPrompt/frozenAt`。没有确认标记，确认后再编辑不会使任何状态失效；`planning.screens` 变更时 `frozenPrompts` 保留旧值（`project-store.js:352-357`），生成端仍读旧冻结值。模式 C 的 freeze 甚至直接信任客户端字符串（`detail-studio.routes.js:238-241`），与 B3 freeze 的「服务端重编译」是两套口径。

改造见 §5（单一 `resolvePrompt()` + 确认状态机 + 快照 hash + 两轨质检）。**关键**：`buildBatchSpec` 改为**只读 `confirmedPromptSnapshot[screenId].text`**，无有效快照即 400，不许回退到 `frozenPrompts`；版本记录 `version.prompt` 存快照文本与 hash。
关联阶段：S2。

### Q8 ratio / imageSize / 模型渠道如何真正进入生图请求

现状断链：面板值只进文本 `globalLock`（`analyze-strategy.js:64-65`），而 `generation/routes.js:80-81,104-105` 把每屏写死 `imageSize:"2K"` / `aspectRatio:"3:4"`；`src/api/detail-studio.js:51-55` 与 `detail-image-form.js:37-42` 另有同名默认值；规划默认 `21:9` 与面板默认 `3:4` 不一致。模型/渠道有服务端回退（`generation/routes.js:53-62`、`model-config.js:19-22`），但 `project.modelConfig` 落库默认三项空串（`project-store.js:253`），且 `basicParams.imageModel` 等 5 键只存不消费。

改造：① `buildBatchSpec` 从 `project.basicParams.ratio/imageSize` 取值，缺省回退 `3:4 / 2K`，**删掉两处硬编码**；② 统一默认源（消灭 `21:9`）；③ 明确 `imageModel` 优先级 `modelConfig.imageModel > basicParams.imageModel > 默认 tt-image-2.6`，5 个不生效键要么接通要么从客户可见面板移除；④ 门禁 `detail-studio-basic-params-chain-check.mjs` 从「到 frozenPrompt」扩到「到 FormData」。**注意 `src/features/detail/detail-image-form.js` 是新旧共用文件，改它即改旧页** → 只改 spec 构造侧与 `buildBatchSpec`，不动共享 form。
关联阶段：S1。

### Q9 如何保证旧 detail-main 零回归

**零改动清单**（新增扩展层必须全部不碰）：`src/features/detail/{DetailView.jsx,detail-state.js,detail-group.js,detail-image-form.js}`、`server/{detail-middleware.js,detail-ai.js,detail-skills.js}`、`server/routes/detail.routes.js`（该文件 `:27-33` 明示 `prompts/server/detail-skills.js` 为 G-2 禁改）、`prompts/server/detail-skills.js`、`server/skill-baselines/V3-*/server-index.js`。
共享面只有两处：`detail-image-form.js`（被 `src/api/detail-studio.js:7` import，受 `detail-studio-image-form-parity-check.mjs:19-25` 静态钉桩）与 `prompts/server/detail-skills.js` 被 detail-studio 4 处只读 import（`screen-composition.js:11`、`platform/index.js:15`、`industry/index.js:19`、`analyze-strategy.js:26`）。因此**板块扩展层只能放 `prompts/detail-studio/core/`，绝不改旧词表**；产品图进模型复用 `ai-chat-shared.js` 的现成函数，不改 `detail-ai.js`。
门禁缺口：现有**没有专门的旧页零回归 check**（`detail-main` 只出现在 `image-form-parity-check.mjs:133-135` 的 FormData 断言）。S1 需新增 `detail-main-regression-check.mjs`：对零改动清单做 blob hash 基线棘轮 + 旧页出图 FormData 字段集断言；配合浏览器冒烟（旧页上传→生成分段提示词→单屏出图目视）。
关联阶段：S1（门禁）+ 每阶段回归项。

### Q10 是否存在必须先解决的阻断问题

**是，共 6 项**（B1–B4 + 两项地基）。完整清单见 §3，**全部列入 S0，不以「后续优化」掩盖**。

---

## 3. 必须先解决的阻断问题（S0 清单）

| ID | 级别 | 问题 | 证据 | 不修的后果 |
|---|---|---|---|---|
| **B1** | 🔴 P0 | 产品图不进策划模型 | `analyze-strategy.js:204-213`、`director-visual.js:253-262` 纯文本 content；对照 `detail-ai.js:184-206` | 「唯一必选」与「从图分析」无实现基础 |
| **B2** | 🔴 P0 | 导演 moduleId 路径错配 + 静默回退 | `prompts/.../director-visual.js:42` vs `director-visual.js:181-183` | 板块选择注入即丢失 |
| **B3** | 🔴 P0 | screenId 位置派生、三套口径漂移、`VersionPanel` NaN | `director-visual.js:193`、`version-store.js:43`、`compile-screen.js:32`、`generation/routes.js:98`、`VersionPanel.jsx:220` | 排序/增删必致版本·提示词·任务错配 |
| **B4** | 🔴 P0 | 终态任务重复点击二次扣费 | `orchestrator.js:338-353`、`detail-studio-generate.js:73-75` | 真实费用损失 |
| **B5** | 🟠 P0-地基 | `planning` 白名单重建吞新字段 | `project-store.js:347-358` | 四层状态 / job / selectedModules / conversation 写不进去 |
| **B6** | 🟠 P0-地基 | 质检 parity 与手动覆盖语义冲突 | `checklist.js:246-257`、`copywriting.js:76-81`、`version-routes.js:48-49` | 要么永远判红，要么绕过全部质量约束 |

**顺带在 S0 收口的既有缺陷**（不改变产品行为、低风险）：`task-store-core.js:249` 大写终态集合导致 `finished_at` 永不写（唯一影响 `GenerationPanel.jsx:38` 耗时展示，旧换装侧自洽不受影响）；`run-all.mjs` 的 `planning-timeout-feedback-check` ORDER 漏登 + FAST_ORDER 重复两次（V210 起 `--fast` 计数虚高 1）；`VersionPanel.jsx:220` 的 NaN 并入 B3 一并修。

**未列为阻断但必须在验收中如实标注的证据缺口**（来自《状态快照》§5.5，本轮未重跑）：E4 Owner 带 KEY 的 8 屏全链路出图、长图下载、真机 director 成功出屏、`logs/planning-calls.jsonl` 真机值未回填；public 生产构建（`dist` + `.release-mode`）首启未单独验证。V210/V212 的故障现场是触发证据，**不等于修复验证**。

---

## 4. 修订后的最终产品流程

### 4.1 客户可见（8 步，前台只有这些）

```
1. 上传产品图                    ← 唯一必选；前端 + 服务端双校验；上传即后台自动建草稿项目
2.（可选）展开设置，改想改的      ← 全部有默认；不填不影响；高级区折叠
3.（可选）勾选想展示的内容板块    ← 18 项意图库，多选/排序/自定义；不强制选择
4. 点「生成分段提示词」          ← 一次点击；后台串行 分析→导演→编译→质检，带进度
5. 查看分段内容                  ← 旧版「分段提示词确认」卡片范式：勾选/排序/删/增
6. 直接编辑 或 与 AI 沟通修改    ← 每屏可改全文；每屏「只改这一屏」+ 顶部「对整套说一句」
7. 点「确认提示词」              ← 后台固化快照；客户不接触「编译/冻结/质检」字样
8. 点「生成图片」                ← 复用 V212/R1 出图链路；结果图/失败原因/长图
```

整套沟通先出**变更草案**（新增/删除/修改/顺序变化 + 对已确认内容的影响清单），用户确认后才应用；单屏沟通只改该屏，其他屏的提示词、数据、已确认快照字节不变。

### 4.2 后台自动（客户零感知）

项目创建与命名、模式（`guided`）、商品资料保存、商品分析、分屏方案、编译、质检、确认快照固化、任务登记、版本记录、结果图归属、失败恢复与断点续跑。

### 4.3 明确不出现

项目 / 项目组 / 项目 ID / 状态、模式 A·B·C、能力自检、测试文本模型、预检请求体、生成测试图（会产生费用且结果只留内存）、选择 Agent、配置 Skill、上下文管理、「编译」「冻结」「质检」「确定性」「阶段 N」等内部术语、与实现矛盾的「后续阶段开放」引导条（`FlowGuidanceBar.jsx:63`）。

---

## 5. 最终数据与提示词一致性方案

### 5.1 四层定义（**不采用原方案的简单优先级覆盖**）

| 层 | 定义 | 谁写 | 是否落库 |
|---|---|---|---|
| `generatedPrompt[screenId]` | `compileScreenPlan(project)` 的确定性编译产物，**AI 原始结果，永不手改** | 服务端重编译 | 落库（替代现 `frozenPrompts`） |
| `manualOverrides[screenId]` | `{ text, source: "user" \| "ai-rewrite", baseGeneratedHash, updatedAt }` | 用户编辑 / AI 改写端点 | 落库 |
| `resolvedPrompt[screenId]` | **`resolvePrompt(project, screenId)` 纯函数返回值** = `manualOverrides?.text ?? generatedPrompt` | 无人「写」，纯计算 | **不落库**（避免第二份真相） |
| `confirmedPromptSnapshot[screenId]` | `{ text, hash, version, confirmedAt }`，用户确认时服务端把 `resolvePrompt` 结果**固化** | 服务端 confirm 端点 | 落库 |

配套状态：`confirmState: "draft" | "confirmed" | "dirty"`、`activeSnapshotVersion`、`lastEditedAt`。

### 5.2 唯一真相源

`resolvePrompt(project, screenId)` 是**唯一**决定「最终有效提示词」的纯函数。四处消费方**必须全部调用它，禁止任何一处自行拼串**：

| 消费方 | 用法 |
|---|---|
| 界面展示 | 展示 `resolvePrompt()`；同时标注该屏是「AI 原文」还是「已覆盖」 |
| 确认校验 | confirm 时服务端对每屏调 `resolvePrompt()`，跑两轨质检后写快照 |
| 实际生图请求 | `buildBatchSpec` **只读 `confirmedPromptSnapshot[screenId].text`**，且校验 `hash(text) === snapshot.hash`；无有效快照或 hash 不符 → 400 拒绝出图 |
| 版本记录 | `version.prompt` + `version.promptHash` 存快照文本与 hash，不存其它来源 |

### 5.3 确认状态机（对应「确认后再次编辑，原确认状态必须失效，并形成新的待确认版本」）

```
draft ──confirm(两轨质检通过)──> confirmed [snapshot vN 生效]
  ▲                                   │
  │                                   ├─ 任何写 manualOverrides / screens / globalLock / selectedModules
  │                                   │   → confirmState = "dirty"，confirmedAt 清空，
  │                                   │     vN 保留为「上一确认版」但 isActive=false，
  │                                   │     activeSnapshotVersion+1 生成新的「待确认版本」
  └──────────── re-confirm ───────────┘
```
- `dirty` 状态下**禁止生成图片**（`buildBatchSpec` 拒绝），必须先重新确认。
- 「新的待确认版本」是提示词版本，不自动触发出图、不产生费用。
- 整套草案应用时，只把 `affectedConfirmed` 中的屏置 `dirty`，其余屏保持 `confirmed`（§2 Q6）。

### 5.4 两轨质检（解决 B6，满足「不能因手动覆盖绕过全部质量约束」）

| 轨 | 对象 | 检查 | 时机 |
|---|---|---|---|
| **A · 可复现性 parity** | `generatedPrompt` | 与 `compileScreenPrompt` 重编译**字节一致**（沿用 `checklist.js:246-257` 口径） | 编译后、确认时 |
| **B · 覆盖后确定性校验** | `resolvedPrompt` | ① `scanForbiddenWords` 扫**全文**（现只扫 `copy.headline/subcopy`，需扩）；② 不得残留 `unconfirmed` 级事实；③ 长度上限（对齐模式 C 的 60000）；④ 必含全局锁/身份锚的结构检查；⑤ 非空 | **写入 `manualOverrides` 时即跑**（不是只在点质检时），不通过拒绝写入并给原因；确认时与生图前各再跑一次 |

- 轨 B **不要求**与重编译字节一致，否则手动编辑永远判红。
- 现有 LLM 质检 `qc-review.js`（≤2 次、`MAX_AUTO_FIX=1`、`needsHuman` 交回人工）继续作为策划层审查，后台自动跑、不给客户按钮；它审查的是 ScreenSpec 与规划质量，**不替代**轨 B 的确定性写入拦截。
- 门禁新增 `prompt-resolution-parity-check`：`resolvePrompt` 四处消费方静态同源断言 + 负向对照（改任意一处绕开 → 判红）；`resolved` 与快照 hash 不一致时生图必拒。

### 5.5 数据结构落位与兼容（B5）

**硬约束**：`updateDetailStudioProject` 的 `planning` 分支是**白名单重建**（`project-store.js:347-358` 只保留 8 个子键），任何新子键会被静默丢弃。

| 新字段 | 落位 | 理由 |
|---|---|---|
| `project.selectedModules` | **顶层** | 避开 planning 白名单；`indexEntry` 只取 6 基础字段，不影响索引 |
| `project.promptState` | **顶层**，含 `generatedPrompt / manualOverrides / confirmState / confirmedPromptSnapshot / activeSnapshotVersion / lastEditedAt` | 同上；且 `frozenPrompts` 保留在 planning 内作旧项目兼容读取 |
| `project.planning.conversation[]` | **顶层** `project.conversation` | 项目内多轮，有上限（建议 50 轮），不跨项目、不建长期记忆 |
| `project.planning.job` | **顶层** `project.planningJob` | 阶段状态，避免被白名单吞 |
| `planning` 白名单 | **仍需扩**：加 `job`/`selectedModules` 等仅在确有写入需要时；并给「写入后回读断言」门禁，防再次静默丢弃 | 防止后续维护者把新字段塞回去 |

**兼容策略**：`migrateProject:57` 的 v2 短路不改动，不 bump `schemaVersion`；所有新字段读取方一律 `undefined` 兜底（等价于「未选择板块 / 无覆盖 / draft 无快照 / 无 job」）；`generatedPrompt` 缺省时从现有 `planning.frozenPrompts[screen.id]` 迁移，`confirmState` 缺省 `"draft"`；旧项目不强制重新确认即可继续查看，但**生成图片前必须有有效快照**（一次性引导确认，不静默沿用旧冻结值）。`data/detail-studio/projects/` 现有 6 个项目均为 v2、无这些新字段，实测可读（只读结构扫描，未读业务内容）。

### 5.6 稳定 screenId 身份层迁移（B3）

- 新增 `screenId`（`scr_` + uuid 或内容指纹），与展示序号 `index` **解耦**；`normalizeDirectorResult` 改为「已有 screenId 则保留、新屏才生成」，排序/增删不再改 id。
- 四层提示词、`frozenPrompts`、生成 spec、幂等键、版本链**统一按 `screenId` 定位**：`version-store.js` 从数字 `screenIndex` 迁到 `screenId`（保留 `screenIndex` 仅作展示序号），`generation/routes.js:115-120` 的 `screenIndexes` 过滤改按 `screenId` 集合，`idempotencyKey` 改 `projectId | screenId | hash(resolvedPrompt) | versionId`。
- `prevScreenId/nextScreenId` 只存 id 不存位置，按数组顺序重建。
- 旧项目迁移：`screens[]` 无 `screenId` 时按当时 `screen_${i+1}` 生成并写回；`versions.currentVersionIds` 的数字键映射到对应 `screenId`；`frozenPrompts` 的 `screen_N` 键同步迁移。
- `VersionPanel.jsx:220/75` 改用 `s.id`（并修 `frozenPrompts[String(screenIndex)]` 键不匹配）。
- 门禁：`screen-identity-stability-check` 断言「重排/增删后其它屏 `screenId`、提示词、版本指针全部不变」+ 负向对照。

### 5.7 单屏 patch 与整套草案

见 §2 Q5 / Q6。两者共用同一个「按 `screenId` 逐屏 patch + 落盘前后其它屏字节快照比对」的实现，草案 `apply` 只是批量调用该 patch 并附带 `affectedConfirmed` 状态变更。

---

## 6. 最终 Agent / Tool 架构边界

### 6.1 现状（E1）

无 Agent 运行时、无 Skill 执行注册表；`dispatchTool`（`server/core/tool-registry.js:80-95`）在 `server/**` 与 `src/**` 生产代码零调用，生产侧只有 `detail-studio.routes.js:68-72` 的 `listTools()` 只读发现端点；7 个 Tool 适配器 `run()` 零生产执行。策划能力由 2 次真实 LLM（`analyze-strategy.js:220`、`director-visual.js:269`）+ 纯函数编译器（`compile-screen.js`）+ ≤2 次质检（`qc-review.js`）构成。V212 后 `submitBatch` 在用户态退役，`create-task.tool.js` 包装对象已标 `@internal 保留`（《状态快照》§2.2）。

### 6.2 边界裁决（严格限定作用域）

| 项 | 裁决 |
|---|---|
| 当前详情创作是否依赖 V207 P2–P8 | **否**。本次改造所需仅为「2 个薄端点（revise / patch）+ 1 个纯函数 resolvePrompt + 1 层板块扩展 + 项目内阶段状态」，全部复用现有 `postChatCompletion` 单网关与确定性编译器 |
| 是否新增通用 Tool 执行层 | **否**。不新增 `dispatchTool` 生产调用点，不建注册表/调度器 |
| V208 Tool 适配器 | **暂时保留，不强行接入，也不立即清理**；文档标注「只读元数据 / 未来可选」 |
| V207 路线图 | **暂停，标记「历史设计 · 待重新评估」**（形成于 V212 之前，主路径已变）；不删除文档 |
| 是否推导「JY-Canvas 整个项目未来不需要 Agent Runtime / Tool / Context」 | **否，明确拒绝该推导**。本裁决作用域**仅限详情创作模块** |
| 无限画布 / 服装换装 / 跨模块智能协作 | **保留独立评估权**，不受本裁决约束，不因本方案清理其架构资产 |

### 6.3 项目内多轮沟通（不是长期记忆）

`project.conversation[]` = `{ turnId, scope, screenId?, instruction, draftId?, applied, createdAt }`，上限 50 轮，随项目 JSON 持久化，项目删除即消失。复用 `versions.editThreads` 的轮次结构范式（`version-store.js:119-139`）——该结构现有字段 `userInstruction / agentSuggestion / adoption / appliedPatch / diff / resultVersionId / createdAt`，但 `agentSuggestion` 恒 null、`adoption` 恒 `"manual"`、`version-routes.js:12` 明确「本期不调用任何 Agent/SKILL」，因此**复用其结构、不复用其「只留痕不执行」语义**：本方案里 `instruction` 要真正触发改写模型。`scope` 严格区分整套/单屏，单屏轮次不得作为整套改写的隐含上下文。

### 6.4 产品图进模型不是「新建视觉链」

复用 `ai-chat-shared.js` 的 `safeImagePart` / `shouldRetryWithoutImages` 与旧版 `detail-ai.js` 的四 mode 降级范式；不新增 Provider、不新增 KEY 读取点、不新增第二套网关。降级时标 `visionAvailable:false` 并显式提示用户补充资料，**不静默当作已读图**。

---

## 7. 分阶段实施规划

> 阶段编号 `S0–S5` 是**本方案内部拆分**，不占用执行单 V 编号、**不预建执行单**。每阶段独立可验收、独立回滚；未通过真实模型验证不得进入下一阶段。所有阶段共同遵守：零业务代码改动尚未解除（本轮仅规划）；旧 `detail-main` 零回归；八文件禁改清单；单网关与 KEY 口径；`main.jsx` 零改动；新增 verify 必须注册 `run-all.mjs` 双数组 + 负向对照 + 按基线棘轮上线；禁 `--no-verify`；一单一 commit、精确 `git add`。

### S0 · 阻断清零与地基（**建议首个批准**）

| 要素 | 内容 |
|---|---|
| 产品目标 | 不新增任何客户可见功能；先让「唯一必选」「板块选择」「四层提示词」「防重复扣费」在物理上可实现 |
| 实际文件 | `server/features/detail-studio/planning/{analyze-strategy,director-visual,qc-review}.js`、`prompts/detail-studio/{prompts/analyze-strategy,prompts/director-visual,quality/checklist,references/copywriting}.js`、`server/features/detail-studio/generation/orchestrator.js`、`src/features/detail-studio/generation/detail-studio-generate.js`、`server/features/detail-studio/store/project-store.js`、`server/core/task-store-core.js`、`scripts/verify/run-all.mjs`、新增 3 个 check |
| 复用模块 | `server/core/ai-chat-shared.js`（`safeImagePart` / `shouldRetryWithoutImages`）、`server/detail-ai.js`（只读参考，不改）、V210 `planning-call-log.js` 九字段口径、现有 `registerBatch` 幂等账本 |
| 接口 | 无新增对外端点；改 `/planning/analyze` 请求体支持多模态 content；改 `/generation/start` 返回 spec 过滤终态任务 |
| 数据结构 | `planning` 白名单补「写入后回读断言」；暂不新增业务字段；`task-store-core.js` 终态集合兼容两套 casing |
| 主要风险 | 多模态请求体变更可能影响上游渠道兼容性（需真机验证降级）；改 `orchestrator` 幂等分支可能误伤正常重试；改 `project-store` 白名单可能波及其它 patch 调用方 |
| 自动化验收 | 新增 `vision-input-check`（analyze content 含 image_url、降级路径、无图时不附空 part）、`idempotent-no-recharge-check`（终态重复点击不产出 spec、不调 generateImages）、`planning-whitelist-roundtrip-check`（新子键写入回读不丢）+ 三者负向对照；`check-syntax` / `--fast` / `vite build` 全绿；**不以此为通过标准** |
| 真实模型验证 | **必须**：Owner 带 KEY，同一张产品图、不填任何文字，跑 analyze，确认返回含可观察商品事实（非编造）；切换不支持多模态的渠道验证降级提示；确认重复点击生成不产生第二条上游扣费记录（`logs/generation.jsonl` 比对） |
| Owner 验证 | 目视确认「未读图」时前端有明确提示、非静默；确认旧页一键详情分析与出图无变化 |
| 回滚 | 单 commit 精确 revert；`project-store` 白名单与 `orchestrator` 改动互不影响其它模块；无数据迁移（本阶段不写新字段） |
| 前置依赖 | Owner 批准 S0；提供可用于真机的 KEY 与至少 1 张产品图 |

### S1 · 自动草稿项目、图片闭环与参数入口

| 要素 | 内容 |
|---|---|
| 产品目标 | 客户打开页面即可直接传图，无需建项目；上传后图既能被分析也能被生图引用；面板设置所见即所得 |
| 实际文件 | `src/features/detail-studio/state/use-detail-studio-state.js`、`src/features/detail-studio/intake/{ReferenceImagesPanel,ReferenceImageDropzone}.jsx`、`components/{FlowGuidanceBar,DetailStudioProjectPanel}.jsx`、`src/api/detail-studio.js`、`server/routes/detail-studio.routes.js`、`server/features/detail-studio/{store/project-store,generation/routes}.js`、新增 `detail-main-regression-check.mjs` |
| 复用模块 | `createDetailStudioProject`（不动其内部，仅加 ensure 包装）、`appendReferenceImage`、`buildDetailStudioImageForm` / `detail-image-form.js`（**只读复用，不改共享文件**）、`extractPlanningOptions` 的取值口径 |
| 接口 | 新增 `POST /projects/ensure-draft { clientToken }`、`DELETE /projects/:id/reference-images/:refId`；改 `/planning/*` 与 `/generation/start` 加产品图必选校验；改 `/generation/start` 的 spec 带真实 ratio/imageSize/模型渠道 |
| 数据结构 | `project.draftClientToken`（顶层，用于幂等）；`referenceImages` 条目补 `path` 与删除标记（不改字段名以兼容旧项目）；统一 60/6 上限口径 |
| 主要风险 | ensure 幂等若只做前端 in-flight，刷新页面仍会重复建项（必须服务端按 token）；删除端点与磁盘文件一致性；改 `generation/routes.js` _spec 可能影响 V203 幂等键（fp 未变、尺寸变 → 需把尺寸纳入或明确不纳入）；共享 form 一旦被改即破旧页 |
| 自动化验收 | `ensure-draft-idempotency-check`（同 token 重复调用返回同 id、不新增 index 条目、双击/重试/多图并发均只 1 个项目 + 负向对照）、`product-image-required-check`（无图时前后端都拦且不发上游）、`basic-params-to-formdata-check`（改 ratio/imageSize/模型 → FormData 实际值随之变 + 负向对照）、`detail-main-regression-check`（零改动清单 blob hash 基线 + 旧页 FormData 断言） |
| 真实模型验证 | 带 KEY 真跑一次「只传 1 张图 → 生成分段提示词」，确认 analyze 用到图（S0 已验）、生图请求带该图且 ratio/尺寸与面板一致 |
| Owner 验证 | 浏览器实测：新会话直接传图、刷新页面不产生第二个项目、删除已传图后列表与磁盘一致、旧页一键详情完整走一遍 |
| 回滚 | ensure 端点与 UI 放行可整体 revert；已建的草稿项目保留不删（用户数据不动）；FormData 改动 revert 后旧值仍在 spec 上游 |
| 前置依赖 | S0 通过真实验证；`docs/ai-tryon/NEXT.md` 指针届时由 Owner 决定是否切换 |

### S2 · 稳定身份与四层提示词一致性

| 要素 | 内容 |
|---|---|
| 产品目标 | 排序/增删屏不再错配；客户可直接改提示词、确认后再改自动失效；展示/请求/落库/版本同用一份内容 |
| 实际文件 | `server/features/detail-studio/planning/{director-visual,compile-screen}.js`、`server/features/detail-studio/{store/project-store,versions/version-store,versions/version-routes,generation/routes,generation/task-model,generation/orchestrator}.js`、`src/features/detail-studio/{versions/VersionPanel,planning/PlanningPanel,generation/detail-studio-generate}.js`、新增 `core/prompt-resolver.js`、`scripts/verify/screen-identity-stability-check.mjs` 与 `prompt-resolution-parity-check.mjs` |
| 复用模块 | `compileScreenPrompt`（作为 `generatedPrompt` 唯一来源）、`recompileForFreeze` 的「服务端不信任客户端」纪律、`scanForbiddenWords`、`frozen-prompt-parity-check.mjs` 的断言范式 |
| 接口 | 新增 `PATCH /planning/screens/:screenId`、`POST /planning/screens/{reorder,add,delete}`、`PUT /planning/confirm`、`GET /planning/prompt-state`；改 `/generation/start` 只读 `confirmedPromptSnapshot`；`/screens/:id/edit` 由 screenIndex 迁到 screenId |
| 数据结构 | `screenId` + 四层 `project.promptState` + `confirmState`；`frozenPrompts` 保留作兼容；旧项目迁移映射（§5.6）；`idempotencyKey` 改按 `screenId + hash(resolvedPrompt)` |
| 主要风险 | **本阶段改动面最大**：版本链、任务幂等键、生成 spec 三处同时换定位键，任一遗漏即静默错配；旧项目迁移若写坏会污染用户数据（需先备份 + dry-run）；`confirmState=dirty` 会让存量项目暂时无法生成（需一次性引导） |
| 自动化验收 | `screen-identity-stability-check`（重排/增删后其它屏 id/提示词/版本指针字节不变 + 负向对照）、`screen-patch-isolation-check`（§2 Q5）、`prompt-resolution-parity-check`（四处消费方同源 + hash 不符拒出图 + 负向对照）、`confirm-invalidation-check`（确认后编辑 → dirty → 拒绝生成 → 重新确认生成新版本）、`prompt-override-quality-check`（禁词/长度/unconfirmed 写入即拒）；全部注册双数组 |
| 真实模型验证 | 带 KEY 真跑一次「AI 生成整套 → 手改第 N 屏 → 确认 → 出图」，核对上游请求体 prompt 与快照文本逐字一致；再改第 N 屏后确认无法出图、其它 N-1 屏请求体字节不变 |
| Owner 验证 | 浏览器：拖拽排序、删除/新增屏、直接改提示词、确认后再改提示「需重新确认」、版本面板切屏不再 NaN |
| 回滚 | 迁移前对每个 project.json 做 `.bak` 备份；`screenId` 迁移函数写成可逆（保留原 `screen_N` 于 `legacyScreenId`）；单阶段 revert 后旧读取路径仍可用 |
| 前置依赖 | S0（B3 口径定义 + B5/B6 地基）、S1（确认提示词数据稳定）；需 Owner 授权对用户项目 JSON 做迁移 |

### S3 · 板块库与 AI 全局/单屏沟通

| 要素 | 内容 |
|---|---|
| 产品目标 | 18 项内容意图可选可不选；整套/单屏沟通严格隔离；整套先出变更草案并保护已确认内容 |
| 实际文件 | 新增 `prompts/detail-studio/core/studio-screen-modules.js`（扩展层）、改 `prompts/detail-studio/core/screen-composition.js`、`prompts/detail-studio/prompts/director-visual.js`、`server/features/detail-studio/planning/director-visual.js`、`server/routes/detail-studio.routes.js`、`src/features/detail-studio/components/` 新增板块选择与沟通组件 |
| 复用模块 | `SCREEN_MODULES`（`prompts/server/detail-skills.js`，**只读，零改动**）、`selectScreenModule`、`normalizeDirectorResult`、`mode-c.js:45-95` 的 LCS diff 范式、`version-store.js` 的 editThreads 结构范式 |
| 接口 | 新增 `POST /planning/revise`（只返回 draft 不落库）、`POST /planning/revise/apply`、`GET /planning/conversation`；改 `/planning/director` 注入 selectedModules |
| 数据结构 | `project.selectedModules`（顶层）、`project.conversation[]`（顶层，≤50 轮）、draft 仅内存/临时不落项目；`draft.diff = {added,removed,modified,reordered}` + `affectedConfirmed[]` |
| 主要风险 | 扩展层若写成固定模板会违背「意图非模板」（导演 system prompt 已禁套模板，需门禁静态断言扩展层无 `prompt` 常量）；`normalizeDirectorResult` 回退路径若仍静默会丢用户选择；整套改写若不限定 scope 会连带改其它屏；LLM 返回结构不稳需 `normalizeDirectorResult` 兜底 |
| 自动化验收 | `studio-module-library-check`（18 项齐备、只含意图元数据无提示词常量、旧库 9 项零改动 + 负向对照）、`module-injection-check`（选定板块进 prompt、规范化后 moduleId 保留、未命中记 warning 而非静默 + 负向对照）、`revision-scope-isolation-check`（单屏 revise 后其它屏 ScreenSpec/提示词/快照字节不变）、`draft-diff-check`（新增/删除/修改/顺序四类变化可枚举、未确认 apply 返回 409、影响已确认内容未展示不许应用） |
| 真实模型验证 | 带 KEY：选 3 个板块 + 1 个自定义意图，确认导演输出屏的 moduleId 命中且屏数/顺序由商品驱动（非固定 10 屏模板）；整套沟通一次、单屏沟通一次，核对上游两次调用上下文与落库范围；无产品图信息时确认不编造参数/认证 |
| Owner 验证 | 浏览器：不选任何板块直接生成（行为与现在一致）、多选+排序+自定义、整套草案展示四类变化与已确认影响清单、二次确认后应用、单屏沟通后目视其它屏未变 |
| 回滚 | 扩展层是纯新增模块，`screen-composition.js` 改一行 re-export 指向即可回退；`selectedModules` 空数组即等价现状；draft 不落库故无数据清理 |
| 前置依赖 | S0（B2 修复）、S2（稳定 screenId 与四层状态，草案按 screenId 比对） |

### S4 · 前台归位与一键策划编排

| 要素 | 内容 |
|---|---|
| 产品目标 | 客户 8 步流程落地；一次点击后台串完 4 阶段，带进度与失败恢复；内部概念全部消失 |
| 实际文件 | `src/features/detail-studio/components/DetailStudioView.jsx`、`components/{DetailStudioBasicsPanel,DetailStudioCapabilityPanel,FlowGuidanceBar,DetailStudioProjectPanel}.jsx`、`intake/basic-params/BasicParamsPanel.jsx`、`planning/PlanningPanel.jsx`、`generation/GenerationPanel.jsx`、`state/use-detail-studio-state.js`、`styles/detail-studio.css`、`server/routes/detail-studio.routes.js`、新增 `server/features/detail-studio/planning/plan-job.js` |
| 复用模块 | `src/shared/ui/*`、旧版 `DetailView.jsx` 的布局与交互范式（**只读参考，不改**）、4 个既有规划函数、V210 分档超时 `PLANNING_TIERS` 与五类 errorClass、`logs/planning-calls.jsonl` 九字段、`registerBatch` 的幂等账本范式 |
| 接口 | 新增 `POST /planning/run { clientToken }`、`POST /planning/resume`、`GET /planning/job`；保留 5 个原有单步端点（内部/兼容，不暴露给客户）；移除客户可见的「能力自检/测试图」入口 |
| 数据结构 | `project.planningJob`（顶层，`{runId,status,stages:{analyze,director,compile,quality},startedAt,updatedAt}`，每阶段含 status/耗时/errorClass/upstreamStatus）；**复用现有项目文件，不新建任务目录/调度器** |
| 主要风险 | 一次点击后若服务端同步长请求超时，前端会误判失败（必须 job 化 + 轮询，不能单请求阻塞）；阶段失败后 resume 若误重跑 analyze 会重复模型调用；隐藏 7 面板可能遗漏仍有客户价值的能力（需逐项核对 §4.3）；`use-detail-studio-state.js` 653 行状态改造易引入 TDZ / 前向引用（本仓已咬三次，改后必跑 `main-render-tdz-check`） |
| 自动化验收 | `planning-job-check`（4 阶段顺序、每阶段落盘、失败保留已完成成果、resume 跳过 success 阶段、同 runId 不重复执行 + 负向对照）、`client-flow-step-check`（静态断言客户可见按钮集合不含项目/模式/自检/编译/冻结/质检/Agent/Skill 字样）、`main-render-tdz-check`、`check-syntax` / `--fast` / `vite build` / `source-hygiene` 全绿 |
| 真实模型验证 | 带 KEY：只传 1 张图、不填任何可选字段，一次点击完成 4 阶段并产出分段提示词；中途模拟 director 超时 → resume 后确认 analyze 未重跑（`logs/planning-calls.jsonl` 比对调用次数）；确认全流程无重复扣费 |
| Owner 验证 | 浏览器实测 8 步；新客户不看说明能否 3 分钟内出图；刷新/离开再回来进度与成果仍在；旧页一键详情目视无回归；public 生产构建首启（`.release-mode`）单独冒烟 |
| 回滚 | 视图层是单文件重排 + 新增组件，可整体 revert；旧 7 面板代码保留不删（仅不渲染）直至 S5 验收通过；`planningJob` 是顶层附加字段，revert 后旧端点仍可读 |
| 前置依赖 | S0–S3 全部通过；需 Owner 确认「旧 7 面板是否保留为兼容路径」 |

### S5 · 真实验收与交付收口

| 要素 | 内容 |
|---|---|
| 产品目标 | 不以门禁全绿代替真实可用；补齐 E4 证据缺口，确认可交客户 |
| 实际文件 | 仅文档与门禁脚本（验收报告、总表/NEXT 由 Owner 决定是否更新）；不新增功能代码 |
| 复用模块 | 既有 `scripts/verify/*` 全量、浏览器冒烟脚本范式 `tmp/v212-r1-browser-smoke.mjs`（只读参考） |
| 接口 | 无 |
| 数据结构 | 无变化 |
| 主要风险 | 真机结果与门禁结论不一致（V212 曾发生 P0 阻断在全绿下漏检）；不得把触发证据当修复验证 |
| 自动化验收 | `npm run check` 全量（89 项）+ `--fast` + `check-syntax` + `vite build` + 所有新增 check 的负向对照复跑；核对新增 check 均已注册 ORDER 与 FAST_ORDER 双数组（注意 V210 遗留的重复登记问题已在 S0 收口） |
| 真实模型验证 | **Owner 带 KEY 完整跑**：3 类商品（服装/日化/3C）× 8 屏全链路出图、长图下载、真机 director 成功出屏并回填 `logs/planning-calls.jsonl` 的 `durationMs/upstreamStatus/outputScreenCount`；整套/单屏沟通各一次并核对上游调用；重复点击不二次扣费 |
| Owner 验证 | 旧 `detail-main` 完整回归（上传→分段提示词→单屏/批量出图→结果图）、public 生产构建首启、跨模块（无限画布/服装换装）冒烟、用户数据零改动核对 |
| 回滚 | 若任一 E4 不通过，回退到对应阶段而非整包回滚；已生成的用户项目与结果图一律保留不删 |
| 前置依赖 | S0–S4 全部通过；Owner 提供 KEY、真机环境、至少 3 类商品图 |

---

## 8. 验收口径（不得把门禁全绿当成真实可用）

1. **只用 1 张产品图、不填任何可选字段**，必须能走完 8 步并产出分段提示词与图片。
2. 不上传产品图时，「生成分段提示词」在**前端与服务端都被拦住**，且不产生任何上游调用/扣费。
3. `analyze` 确实读取了产品图像素（真机日志与返回事实可证），渠道不支持多模态时有**显式降级提示**而非静默。
4. 改第 N 屏后，其它 N-1 屏的 `ScreenSpec` / `resolvedPrompt` / `confirmedPromptSnapshot` **字节一致**；单屏沟通不改变其它屏。
5. 确认后再次编辑 → 原确认失效、生成被拒、形成新待确认版本；上游请求体 prompt 与 `confirmedPromptSnapshot.text` 逐字一致且 hash 相符。
6. 面板所选 ratio / imageSize / 模型渠道与真实生图 FormData 一致。
7. 整套修改必须先看到四类变化与已确认影响清单，未二次确认不得应用。
8. 重复点击生成、重复上传、刷新页面，不产生第二个项目、不重复调用已成功阶段、不二次扣费。
9. 客户全程看不到 §4.3 列出的任何内部概念或字样。
10. 旧 `detail-main` 运行时零回归（blob hash 基线 + 浏览器实测），public 生产构建首启通过。

---

## 9. 报告结论汇总（按交付要求逐项给出）

### 9.1 已吸收的外部审查意见

全部 6 类方向采纳，并逐条落到代码：① 前台恢复旧版两栏骨架、旧页零回归、不建并存简版页、不暴露内部概念；② 产品图唯一必选、其余可选有默认、项目/任务/版本/策划后台自动；③ 18 项内容意图库、复用 `SCREEN_MODULES` + 独立扩展层、不强制选择、AI 决定屏数/合并/顺序/表现、保留事实分级不编造；④ 四层提示词 + 单一 `resolvePrompt()` 真相源 + 确认失效与新待确认版本 + 两轨质检；⑤ 整套/单屏严格隔离、项目内多轮上下文、不建长期记忆、单屏不改其它屏、整套先出草案并保护已确认内容、稳定 screenId；⑥ 一次点击多阶段、复用现有任务机制的**设计范式**、进度/超时/恢复/幂等/防重复扣费/保留已完成成果、不建第二套任务系统；⑦ V207 暂停标历史设计、V208 适配器暂留不接入不清理、当前详情创作不依赖 P2–P8 且不新增通用 Tool 执行层、**不推导整个项目未来不需要 Agent/Tool/Context**、其它模块保留独立评估权。

### 9.2 不采纳的意见及证据

**无整体否定项。** 以下 4 项为「按代码实际收窄实现方式」，证据见 §1.2：
1. 不能直接复用现有 `generation` 任务层承载策划——`task-model.js:126` 只有生图 kind、`idempotencyKey`（`:37-48`）绑定策划阶段不存在的字段、5 个规划端点不产生任务记录、`project.planning` 无状态位、`currentPlanRunId`（`project-store.js:252`）是空壳。改为 `project.planningJob` 项目内阶段记录，复用设计范式而非复用 store。
2. 「稳定 screenId」不是加字段——`director-visual.js:193` 位置派生 id、`version-store.js:43` 数字定位、`compile-screen.js:32` 按 id 键、`generation/routes.js:98` 下标定位、`VersionPanel.jsx:220` 已 NaN，需跨 10+ 文件身份层迁移 + 旧项目键映射。
3. 「最终提示词质量检查」不能沿用现有 parity——`checklist.js:246-257` 要求与重编译字节一致，对 `resolvedPrompt` 会永远判红；`scanForbiddenWords` 只扫 `copy.headline/subcopy`（`checklist.js:84`），且质检只在主动调用时跑（`detail-studio.routes.js:405`）。改为两轨 + 写入时拦截。
4. 「产品图唯一必选」必须与「图进模型」捆绑——`analyze-strategy.js:204-213`、`director-visual.js:253-262` 的 content 是纯字符串，产品图像素从未进入策划模型；不修则该裁决在产品语义上为空。

另补 5 项外部意见未覆盖但代码要求必须补齐的内容（B4 二次扣费、B5 白名单、B6 质检冲突、自动建项目零幂等 + UI 三处硬挡、参考图闭环与 ratio 硬编码），见 §1.3。

### 9.3 修订后的最终产品流程

§4.1 的 8 步：上传产品图 →（可选）设置 →（可选）选板块 → 点「生成分段提示词」→ 查看分段内容 → 直接编辑 / 与 AI 沟通（整套或单屏）→ 确认提示词 → 生成图片。后台自动完成项目、模式、资料保存、分析/分屏/编译/质检、快照固化、任务与版本；客户看不到 §4.3 列出的任何内部概念。

### 9.4 最终数据与提示词一致性方案

四层：`generatedPrompt`（重编译产物，永不手改）/ `manualOverrides`（用户或 AI 改写，写入即受轨 B 校验）/ `resolvedPrompt`（`resolvePrompt()` 纯函数结果，**不落库**）/ `confirmedPromptSnapshot`（确认时服务端固化，含 hash 与 version）。**单一真相源 `resolvePrompt()`**，界面展示、确认校验、`buildBatchSpec` 生图请求、版本记录四处全部调用它；生图只读快照并校验 hash，无有效快照即拒绝。状态机 `draft → confirmed → (编辑) dirty → re-confirm`，dirty 禁止出图并生成新待确认版本。两轨质检：轨 A parity 只管 `generatedPrompt`，轨 B 对 `resolvedPrompt` 做禁词全文扫描 / 事实分级 / 长度 / 结构 / 非空且在写入时即拦截。新字段一律放**顶层**避开 `planning` 白名单重建（`project-store.js:347-358`），旧项目按 `undefined` 兜底、不 bump schemaVersion。稳定 `screenId` 统一四套定位口径并迁移旧键。详见 §5。

### 9.5 最终 Agent / Tool 架构边界

当前详情创作**不依赖** V207 P2–P8、**不新增**通用 Tool 执行层、**不新增** `dispatchTool` 生产调用点；V208 七个适配器**暂时保留、不接入、不清理**；V207 路线图**暂停并标注「历史设计 · 待重新评估」**。所需能力仅为复用现有 `postChatCompletion` 单网关的 2 个薄端点（revise / patch）+ 1 个纯函数 resolver + 1 层板块扩展 + 项目内阶段状态。多轮上下文为 `project.conversation[]`（≤50 轮、随项目存亡，**不是**通用长期记忆）。产品图进模型复用 `ai-chat-shared.js` 的 `safeImagePart` 与降级函数，不新建 Provider/KEY/网关。**明确拒绝**由本裁决推导出「JY-Canvas 整个项目未来不需要 Agent Runtime / Tool / Context」；无限画布、服装换装、跨模块智能协作的架构需求保留独立评估权。详见 §6。

### 9.6 分阶段实施顺序

`S0 阻断清零与地基` → `S1 自动草稿项目·图片闭环·参数入口` → `S2 稳定身份与四层提示词` → `S3 板块库与 AI 沟通` → `S4 前台归位与一键策划编排` → `S5 真实验收与交付收口`。每阶段含产品目标 / 实际文件 / 复用模块 / 接口 / 数据结构与兼容 / 风险 / 自动化验收 / 真实模型验证 / 浏览器·Owner 验证 / 回滚 / 前置依赖 11 要素，独立可验收、独立回滚，详见 §7。**未将全部改造打包成一个执行单；未创建任何执行单。**

### 9.7 当前是否具备进入正式执行阶段的条件

**方案层面具备，工程层面不具备直接开工条件。**

- 具备的部分：外部意见已裁决、10 个技术问题已逐条回到代码实证、四层一致性方案与身份层迁移路径已定义、阶段拆分与验收口径已明确、每阶段回滚方式已给出。
- 不具备的部分：① **6 项 P0 阻断（B1–B6）未修**，其中 B1（产品图不进模型）不修则「唯一必选」是空裁决，B2 不修则板块选择会被静默丢弃，B3 不修则排序必然错配，B4 不修会真实重复扣费；② E4 真机证据缺口仍在（8 屏全链路出图、长图下载、真机 director 成功回填、public 生产构建首启），触发证据不等于修复验证；③ 旧 `detail-main` 零回归门禁尚未建立；④ 门禁以静态断言+基线棘轮为主，V212 的 P0 阻断正是在全绿下漏检，不能作为通过标准。
- **建议裁决**：批准 **S0 单阶段**先行（阻断清零，不含任何客户可见功能），且 S0 必须通过本文件 §7 表中列出的**真实模型验证 + Owner 验证**后才逐阶段放行 S1–S5。S2 因涉及用户项目 JSON 迁移，届时需 Owner 单独授权与备份确认。
- **本轮状态**：等待 Owner 审批。**未自行开工、未改业务代码、未创建执行单、未改 `NEXT.md`、未提交 Git。**

---

## 附录 A：关键证据索引（仓库相对路径）

| 主题 | 路径 |
|---|---|
| 项目 store / 迁移 / 白名单 | `server/features/detail-studio/store/project-store.js:55-105, 239-279, 281-370, 374-392` |
| 路由（项目 / 参考图 / 规划 / 版本 / 生成） | `server/routes/detail-studio.routes.js:83-90, 142-179, 234-248, 253-460`；`server/features/detail-studio/{versions/version-routes,generation/routes}.js` |
| 策划链 | `server/features/detail-studio/planning/{analyze-strategy,director-visual,compile-screen,qc-review}.js`；`prompts/detail-studio/prompts/{analyze-strategy,director-visual}.js` |
| 提示词编译 / 质检 | `prompts/detail-studio/core/{prompt-compiler,global-lock,screen-composition,option-trace}.js`；`prompts/detail-studio/quality/{checklist,qc-prompt}.js`；`prompts/detail-studio/references/copywriting.js` |
| 多模态既有能力（待复用） | `server/core/ai-chat-shared.js:55-125`；`server/detail-ai.js:184-226`（只读参考） |
| 任务层 | `server/features/detail-studio/generation/{task-model,task-store,orchestrator,local-images-generator}.js`；`server/core/task-store-core.js:249` |
| 版本链 | `server/features/detail-studio/versions/{version-store,version-routes}.js`；`src/features/detail-studio/versions/VersionPanel.jsx` |
| 前端状态 / 上传 / 生成 | `src/features/detail-studio/state/use-detail-studio-state.js`；`src/features/detail-studio/intake/{ReferenceImagesPanel,ReferenceImageDropzone}.jsx`；`src/features/detail-studio/generation/detail-studio-generate.js`；`src/api/detail-studio.js` |
| 共享 form（旧页零回归红线） | `src/features/detail/detail-image-form.js`；`src/features/detail/{DetailView,detail-state,detail-group}.jsx/js`；`prompts/server/detail-skills.js` |
| 门禁 | `scripts/verify/run-all.mjs`（ORDER / FAST_ORDER）、`scripts/verify/detail-studio-*-check.mjs`、`frozen-prompt-parity-check.mjs`、`screen-edit-isolation-check.mjs`、`skill-asset-contract-check.mjs` |
| 输入文档 | `docs/V4.0-详情创作产品流程审视与最小必要改造方案-2026-11-13.md`、`docs/复盘/V4.0-项目状态快照与交接报告-2026-11-13.md`、`docs/ai-tryon/NEXT.md:5` |

## 附录 B：本轮识别的阻断编号对照

| 编号 | 简称 | 处置阶段 |
|---|---|---|
| B1 | 产品图不进策划模型 | S0 |
| B2 | 导演 moduleId 路径错配 + 静默回退 | S0 |
| B3 | screenId 位置派生 / 三套口径漂移 / VersionPanel NaN | S0 定口径 → S2 迁移 |
| B4 | 终态任务重复点击二次扣费 | S0 |
| B5 | `planning` 白名单重建吞新字段 | S0 定落位 → S1/S2 落地 |
| B6 | 质检 parity 与手动覆盖语义冲突 | S0 定两轨 → S2 落地 |

---

> **报告结束**。本文件为只读调查 + 待批准规划产物；除本文件外，工作区与 HEAD `aa78b55` 一致，业务代码零改动。等待 Owner 审批，不自行开工。
