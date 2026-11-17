# V2-ARCH-001 · 现有架构映射与改造方案（阶段 A）

> 任务来源：《JY-Canvas｜一键详情 V2 四层控制框架建设任务书》V2-ARCH-001，阶段 A「现有架构勘察与映射」。
> 执行角色：总控 AI。专业内容角色：ChatGPT（后续负责基础 Agent / Skill / 行业能力包内容设计）——**本阶段未编写任何专业内容**。
> 性质：**只读勘察 + 映射方案**，未修改任何代码 / 提示词 / Skill / Schema / 门禁 / 基线。
> 日期：2026-11-17　对照基准：Git HEAD `5274be292cffc16cf77da533025cdfc6032fe82d`（分支 `feature/detail-main-iteration`）实际代码。
> 关联：`V220` 交接报告、`D-REV-06` 真机根因、`D-PLAN-14` 清洁剂 Skill 适配评估。

> ⚠️ **任务书完整性声明**：Owner 本次提供的任务书正文在「阶段 F：测试与交付」表格处截断（停在「T 恤｜归入服装｜不得」），其后的验收标准 / 交付物清单等章节**未获取**。本方案只覆盖阶段 A 的完整要求；截断部分**标注待补、不猜测、不代写**。

---

## 0. 给 Owner 看的结论（白话）

**这次是"摸家底"，没动软件。**按任务书让我先查清楚"现在有什么、缺什么、哪些白做了"，我照着代码一条条核了。

**最重要的一句话**：我们之前让 AI 想好的那些东西（判了什么行业、消费者要什么、怎么卖、整套视觉什么风格），**其实只有一小部分真的用到了做图那一步**。我数过——"行业判断""消费者洞察""营销策略""视觉风格"这四样，在真正拼做图说明书的代码里**一次都没出现**。它们只停在 AI 的回答里，没往下传。这就是你上次真机看到那些老毛病（串服装、写"棉"、图片编号乱）的根本原因，也正好是这份任务书要解决的。

- 好消息：任务书要的四层框架，**第一层、第二层的一半、第四层的一部分我们其实已经有了**，不用推倒重来。
- 坏消息：第三层（每屏内容和画面要不要用、够不够格用）**完全没有**；第四层的"编译器只能用批准过的东西"也**没有**。这两层是这份任务书的真正新活。
- 需要你拍板的：这份任务书要求的四层框架，跟上一轮我报给你的"清洁剂 Skill 四项待裁决"是同一批决定。我做完这份勘察就停，不往下做架构设计——等你定了再走。

---

## 1. 勘察范围与核对方法

### 1.1 已核对的代码与资产（均在 HEAD `5274be2`）

| 类别 | 路径 | 核对方式 |
|---|---|---|
| 规划请求 | `server/routes/detail.routes.js:46-114` | 逐行 |
| 模型调用与注入 | `server/detail-ai.js:24-50/61-129/131-317/319-401` | 逐行 |
| 结果归一化 | `server/detail-middleware.js:148-171`（`normalizeAiScreens`）、`:173-210`（`mergeAiAnalysis`） | 逐行 |
| 全局规则与分屏编译 | `server/detail-middleware.js:418-429/467-713`（17 槽位 `:602-624`） | 逐行 |
| Skill 注册与资产 | `prompts/server/detail-v2-planning/index.js:17-93`、8 × `SKILL.md` | 逐字 |
| 数据契约 | `schemas/planning-result.schema.json`（9 顶层）、`quality-result.schema.json` | 逐字 |
| Agent 声明 | `agent/{planner,execution-flow,output-contract}.md` | 逐字 |
| 行业词表 | `prompts/server/detail-skills.js:45-160`（10 类）、`:403-412` 路由 | 逐行 |
| 测试集 | `tests/product-cases.md`（六类 × 五场景 + A–F） | 逐字 |
| 前端调用链 | `src/features/detail/detail-state.js:372-439`、`src/api/prompts.js:11-13`、`src/api/images.js:3-5`、`DetailView.jsx` | 逐行（复用上轮取证） |
| QC 逻辑 | `server/detail-middleware.js:579-582/622`、A 域无 QC 入口 | 逐行 |

### 1.2 核对方法
- 关键词出现次数统计（`grep -c`）：判断某字段是否进入编译器。
- 逐行读归一化函数：确认 AI 结果的哪些字段被保留、哪些被丢弃。
- 与 Schema 9 顶层键逐一比对，定位"声明了但没传"的字段。
- 不采信文档声明，以**实际代码**为准（例：Skill 声明 8 项、Schema 声明 9 键，但运行时消费远少于此）。

---

## 2. 逐层映射：任务书四层 × 现有能力

### 2.1 第一层 · 通用产品理解与事实控制层 —— 🟡 部分存在

| 任务书要求 | 现有实现 | 判定 | 位置 |
|---|---|---|---|
| 从图片/输入识别产品 | AI 视觉规划 + 本地 `buildProductAnalysis` | ✅ 已有 | `detail-ai.js:338-396`；`middleware:262-290` |
| 六档事实状态（用户提供/图片观察/已验证/合理推断/未知/禁止使用） | 运行时三级 `visible/inferred/mustNotClaim`，`detail-ai.js:45` 有六级→三级映射 | ⚠️ 口径不同 | `schema:59-63`；`detail-ai.js:45` |
| 区分产品自身结构/包装材质/使用对象材质/适用范围/使用方式/效果 | **未实现**——`materialHints` 直取 AI `product.materials`，"棉"错误即源于此 | ❌ 缺口 | `middleware:198/592`；D-REV-06 P0-2 |
| 阻止推测写成事实 | `mustNotClaim` 不得进确定事实（契约声明）；但编译器无强制校验 | ⚠️ 契约有、执行弱 | `schema:226`；`product-understanding/SKILL.md:25` |
| 行业包缺失时提供通用安全边界 | 有 `generic` 通用行业（10 类 + generic） | ✅ 已有 | `detail-skills.js:101-103` |

**小结**：识别能力在，但"事实分型"这一核心职责没有真正落地——这是第一层最大的欠账，也直接对应真机的"棉"材质与功效扩大问题。

### 2.2 第二层 · 行业识别与行业能力包层 —— 🟡 一半存在

| 任务书要求 | 现有实现 | 判定 | 位置 |
|---|---|---|---|
| 一个产品一个主行业 ID | `aiIndustry` 返回单一 skill | ✅ 已有 | `middleware:102-112` |
| 强特征优先、弱语境词不越权 | **未实现**——`getIndustrySkillByText` 按关键词计分，apparel 含单字"包/面料/模特"，"包装"命中 | ❌ 缺口 | `detail-skills.js:49/403-412`；D-REV-06 P0-1 |
| 无法判断进 generic | 已有 generic 回退 | ✅ 已有 | `middleware:111` |
| generic 不加载所有行业包 | 现状只选一个 skill，天然满足 | ✅ 已有 | `middleware:110-112` |
| 行业能力包按需加载机制 | **无独立加载机制**——8 Skill 是固定注册表、单次全量派生注入（`planningActive` 时全挂），不按行业开关 | ❌ 缺口 | `detail-ai.js:36-41/112-114` |
| cleaning 日化清洁剂行业包 | 资产声明 cleaning（`industry-routing:14`），但运行时十类词表**无 cleaning** | ❌ 缺口 | `detail-skills.js:45-160`；D-PLAN-14 §3.2 |
| 行业包接口标准 | 有 Skill 九要素段格式（职责/触发/输入/…/测试案例），可作接口雏形 | 🟡 雏形 | 8 × `SKILL.md` |

**小结**：行业"识别"有了，"能力包按需加载"没有——现在的 8 个 Skill 是"要么全挂、要么不挂"，做不到"只有当前行业匹配才加载对应包"。这是任务书第二层的核心新活。

### 2.3 第三层 · 内容任务与视觉任务准入控制层 —— 🔴 完全缺失

| 任务书要求 | 现有实现 | 判定 | 位置 |
|---|---|---|---|
| 内容任务 / 视觉任务分开管理 | 只有 9 个 `moduleId`（SCREEN_MODULES），无独立任务注册表 | ❌ 缺失 | `detail-skills.js:271` |
| 任务机器可读准入字段（taskId/allowedIndustries/requiredFacts/excludedConditions/userOverridePolicy/…） | **完全没有** | ❌ 缺失 | — |
| 准入结果 admitted/rejected/pending/generic_fallback 写入结构化数据 | **完全没有** | ❌ 缺失 | — |
| "产品细节图"不作默认、按适用性判断 | `materialDetail` 模块按标题/索引选取，无适用性前置校验（真机材质模块误用即源于此） | ❌ 缺口 | `middleware:332-354/552-565`；D-PLAN-11 问题 3 |
| 用户指定方向不突破事实/安全边界 | `activeSection` 注入"不得虚构商品事实"字样，但无强制校验 | ⚠️ 弱 | `middleware:605-607` |

**小结**：第三层是任务书说的"防止结构乱套的核心层"，当前**一行代码都没有**。所有任务书新建数据契约里，这一层的 `contentTaskCandidates / visualTaskCandidates / 准入结果` 是从零开始。

### 2.4 第四层 · 分屏规划与提示词编译控制层 —— 🟡 有骨架、无约束

| 任务书要求 | 现有实现 | 判定 | 位置 |
|---|---|---|---|
| A 详情策划（顺序/每屏问题/任务/逻辑） | 有 `planning.narrative/screenRoles`（AI 产出） | 🟡 有但不进编译 | `schema:195-237`；`middleware:505-516` |
| B 视觉规划（全局 DNA + 每屏构图） | 有 `globalVisualDNA`、`STYLE_PACKS`、变体 | 🟡 有但 DNA 不进编译 | `schema:178-195`；`middleware:594-600` |
| C 最终提示词编译 | 17 槽位拼装 | ✅ 已有 | `middleware:602-624` |
| 编译器只用已批准任务、不自行增加 | **无约束**——`slice(0,8)` 质检截断、AI 文本直拼（图0/图1冲突） | ❌ 缺口 | `middleware:614/616/622`；D-REV-06 P0-4/P1-6 |
| 编译审计（每段指令来自哪个任务/字段） | **完全没有** | ❌ 缺失 | — |
| 策划分析不写进最终提示词 | 真机显示 `【本屏卖点】适用于血渍…` 等策划语汇直入 | ❌ 缺口 | D-REV-06；任务书 §4 |
| 全局 DNA 与单屏叙事分离 | 契约层分离，但编译层把三段式写进 `visualStyle` | ⚠️ 反复 | `schema:178-195` vs `middleware:424` |

---

## 3. 规划字段传递链核对（任务书阶段 A 明确要求）

### 3.1 决定性发现：四个顶层字段从未进入编译器

对 `server/detail-middleware.js` 全文做字段出现次数统计：

| Schema 顶层字段 | 在编译器中出现次数 | 是否进入最终 17 槽位 | 说明 |
|---|---|---|---|
| `product` | 60 | ✅ 进入 | 经 `mergeAiAnalysis` 展开为 `analysis.*` 后进入 |
| `screens` | 3 | ✅ 进入 | 经 `normalizeAiScreens` 转 `aiScreen` |
| `planning` | 7 | ⚠️ **仅用 1 个子字段** | 只消费 `planning.screenRoles`（`:505-516` 定 hero/module 优先级），其余 `narrative/facts/dedupLog` 未用 |
| `qc` | 1 | ⚠️ 间接 | 走 `buildQualityChecklist` + `aiScreen.qualityChecks`，非顶层直接消费 |
| `industryProfile` | **0** | ❌ 未进入 | 行业判定走 `aiIndustry` 重新算，不用 AI 的 industryProfile |
| `consumerInsights` | **0** | ❌ 未进入 | 消费者洞察完全丢弃 |
| `marketingStrategy` | **0** | ❌ 未进入 | 营销策略完全丢弃 |
| `globalVisualDNA` | **0** | ❌ 未进入 | 视觉 DNA 完全丢弃，反而从 `strategy.globalStyle` 取（旧字段） |

**结论**：Schema 8 个业务顶层字段里，**4 个（industryProfile / consumerInsights / marketingStrategy / globalVisualDNA）在编译器中一次都没出现**。任务书要的四层框架，前两层与第四层 B 的策划成果**只停留在模型输出与 Schema 契约中，没有传到编译链**。这与 D-REV-06「8 条规矩进了请求体但一条未落编译代码」是同一现象的不同侧面。

### 3.2 字段丢失的具体位置（逐段）

1. **`normalizeAiScreens`（`:148-171`）**：从每个 AI screen 只提取 13 个字段（`moduleId/title/summary/sellingPoint/composition/copywriting/referenceReason/modelPolicyHint/promptDirectives/negativeConstraints/qualityChecks/compositionVariantId/productFileIndexes/referenceFileIndexes`）。任务书要求的 `consumerQuestion / contentTaskIds / visualTaskIds / message / proof / constraints / assetRefs` 全部没有。
2. **`mergeAiAnalysis`（`:173-210`）**：只映射 `industryName/targetAudience/materials/sellingPoints/globalStyle/structureLocks/colors/riskNotes` 约 10 项。`industryProfile.evidence/confidence`、`consumerInsights.needs`、`marketingStrategy.valueLadder` 全部丢弃。
3. **`buildDetailPromptGroup`（`:467-713`）**：17 槽位中没有一个引用 `industryProfile / consumerInsights / marketingStrategy / globalVisualDNA`；`planning` 仅取 `screenRoles`。

> 这段是任务书阶段 A「规划结果没有传递到编译器的字段」的直接答案，也是后续阶段 C「必须检查字段是否真正传递」的基线。

---

## 4. 已存在能力清单（任务书要求：不得重复实现）

| 能力 | 状态 | 复用建议 |
|---|---|---|
| 单次模型调用 + 4 类降级重试 | ✅ 完整 | 直接复用，不建第二套 |
| 屏数硬约束 count 1–12 默认 8 | ✅ 完整 | 编译层断言已有，保留 |
| 首屏 hero 确定性绑定 | ✅ 完整 | 保留，任务书第五节 #5 已满足 |
| 可选内容板块条件注入（selectedSections） | ✅ 完整 | 保留作为"用户偏好约束"输入 |
| 空选自主规划、禁固定标题轮转 | ✅ 完整 | 保留 |
| planning 独立顶层 + 前端会话态（不落盘） | ✅ 完整 | 保留作为策划结果容器 |
| 8 Skill 资产 + 注册表 + 门禁 phrase 回链 | 🟡 资产完整、运行时读 directive | 直接复用，不重写专业内容 |
| 10 类行业词表 + generic 回退 | 🟡 现状 | 保留为第一层基础，cleaning 走新增覆盖层（G-2 禁改） |
| 白名单清理 / 落盘护栏 / 超时补拉 / in-flight 锁 | ✅ 完整 | 保留，不动持久化红线 |
| 17 槽位编译结构 | 🟡 完整但无约束 | 在其内做"净化 + 审计"，不推倒重来 |
| 质检 Schema（5 顶层、severity 三级、criticalFlags） | 🟡 契约完整、A 域无 UI | 契约复用；用户主动入口另议 |

---

## 5. 需新增的数据契约（任务书第三节 × 现有 Schema gap）

| 任务书目标结构 | 现有对应 | 缺口 | 归属阶段 |
|---|---|---|---|
| `productFacts`（7 字段，sourceType/status/allowedUse） | `product.*` + `planning.facts[]`（3 级） | 缺 `factType/sourceType/confidence/sourceRef/allowedUse` 细粒度 | C |
| `industryProfile`（含 `loadedIndustryPackIds/fallbackMode`） | Schema 有 `industryProfile`（5 字段），编译器 0 消费 | 缺 `loadedIndustryPackIds/fallbackMode`；且未接编译 | B/C |
| `productCapabilityProfile`（能力画像，连接行业与产品） | 无 | 全新结构；任务书称"行业知识与具体产品之间的连接层" | C |
| `contentTaskCandidates / visualTaskCandidates`（准入状态+依据） | 无 | 全新结构 | C/D |
| 准入结果 admitted/rejected/pending/generic_fallback | 无 | 全新枚举与记录 | D |
| `storyPlan`（主线/首屏/递进/重复检测/缺失检测） | `planning.narrative/screenRoles`（部分） | 缺重复/缺失检测字段 | C |
| `globalVisualDNA`（纯视觉，禁叙事） | Schema 有，但被 `visualStyle` 三段式污染 | 需净化 + 接编译 | C/E |
| `screens[]`（consumerQuestion/contentTaskIds/visualTaskIds/message/proof/constraints/assetRefs） | 有 13 字段，缺上述 7 项 | 扩字段 + 接编译 | C |
| `compilerAudit`（任务来源/未使用任务/未授权添加/事实突破） | 无 | 全新结构；任务书审计核心 | E |
| `qc` 三层区分（结构校验/编译校验/用户主动 QC） | 仅 `qc` + 提示词文本 | 需区分三层，不把完整 QC 变前置 | E |

---

## 6. 兼容风险（任务书要求标明）

1. **G-2 词表禁改**：`prompts/server/detail-skills.js` 受冻结约束，cleaning 与新任务注册表只能走"新增覆盖层"（Owner 裁决⑤，D-PLAN-12）。直接改十类表会撞门禁与既定决策。
2. **8 Skill 资产已复核通过**（V219 §9）：`SKILL.md` + 注册表 + 门禁 phrase 四处同步，改动需同步维护、强度不降；重写专业内容属 ChatGPT 职责，总控不越权。
3. **Schema 收窄决策**（V219 §9 四项偏差）：六级→三级、12→9 角色、四级→三级风险、三顶层归并。任务书第三节的 7 字段 productFacts 与三级 `factLevel` 存在口径差，需明确"新增字段"还是"替换枚举"——**替换会推翻既定决策**。
4. **测试集唯一一份**（Owner 裁决④）：任务书阶段 F 测试表（截断）与现有 A–F 六案例、清洁剂 Skill 案例 B–E 三方需归一，不得三套并存（D-PLAN-14 §3.3）。
5. **旧版逐字节兼容**：`detail-middleware.js:602-624` 的 17 槽位文本格式受门禁锚点保护（`NEEDLE_*`、`V1_LIGHT_LINE`）；编译净化不能破坏旧版输出，否则撞门禁。
6. **不落盘红线**：planning / selectedSections 仅内存，禁止进 `sanitizeDetailGroupsForStorage` / `saveDetailPreset` / `seed`（`output-contract.md:3`）。新增结构须遵守。
7. **R1 串行互斥**：新增数据契约涉及 `detail-ai.js` 核心与门禁锚点，须单系列单 commit，不得与 S2-C 编译链改造并行。

---

## 7. 改造路径建议（供阶段 B 设计输入，非本阶段实施）

> 以下只标"顺序与依赖"，不含专业内容、不写代码。阶段 B 架构设计须经 Owner 对 D-PLAN-14 四项裁决后开展。

1. **前置裁决**（阻塞阶段 B/C）：D-PLAN-14 §7 四项——形态（覆盖层/第9 Skill/拆并）、分级口径（沿用映射/新增映射/改 Schema）、测试编号归一、奶渍边界与首屏文案。
2. **第一层补强**：事实分型（包装/使用对象/范围/用法/效果分离）→ 直接消解真机"棉"与功效扩大。
3. **第二层补强**：强特征优先 + cleaning 覆盖层 → 直接消解服装串规则。可与 S2-C 同批（工程可自主）。
4. **第三层从零建**：任务注册 + 准入规则 + admitted/rejected 结构化记录 → 任务书最大新活，需 ChatGPT 提供内容前先建机制。
5. **第四层编译净化 + 审计**：只消费已准入任务、写 `compilerAudit`、四顶层字段接编译、去策划语汇 → 消解图片编号冲突、规则重复、质检截断。
6. **阶段 F 测试**：待任务书截断部分补全后，与唯一测试集 A–F 归一。

**与 S2-C 的关系**：本报告 §3 的四字段未传递、§2.3 的准入层缺失、§2.4 的编译无约束，与 D-REV-06 的 P0/P1 改造高度重合。建议**S2-C 作为四层框架第三/四层的第一批落地**，避免两批改同一段 `middleware:602-624` 造成 R1 冲突。

---

## 8. 本阶段输出与边界

### 8.1 已交付
- 本文件：`docs/规划/V2-ARCH-001-现有架构映射与改造方案.md`（阶段 A 产物）。

### 8.2 未做（明确）
- 未写阶段 B 架构设计（涉 Owner 裁决，停在阶段 A）。
- 未写任何 Agent / Skill / 行业能力包专业内容（ChatGPT 职责）。
- 未改代码 / 提示词 / Skill / Schema / 门禁 / 基线。
- 未发执行单；`docs/执行单/进行中/` 仍空。

### 8.3 待补 / 待裁决
- **任务书截断部分**：阶段 F 测试表后半 + 后续章节，待 Owner 补全。
- **D-PLAN-14 §7 四项裁决**：阶段 B 的前置。
- **ChatGPT 专业内容**：行业能力包（清洁日化第一个）内容到位后，才能进阶段 C/D 的内容填充。

---

## 9. 阶段 A 结论

任务书要的四层控制框架，**第一层、第二层、第四层有可复用骨架，第三层完全缺失**；最严重的系统性欠账是**四个策划顶层字段（industryProfile / consumerInsights / marketingStrategy / globalVisualDNA）在编译器中出现 0 次**——规划成果断在编译链门口，这正是真机问题的结构性根因，也是后续阶段 C/E 必须先接通的地方。

本阶段只读勘察完成，未改任何东西。按任务书顺序，下一步是阶段 B「四层控制架构设计」，但它依赖 Owner 对 D-PLAN-14 四项裁决与任务书截断部分的补全——**停在此处等待确认**。
