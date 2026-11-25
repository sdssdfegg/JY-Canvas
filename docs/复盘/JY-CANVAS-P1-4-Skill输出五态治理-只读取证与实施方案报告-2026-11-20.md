# JY-CANVAS P1-4 · Skill 输出五态治理 — 只读取证与实施方案报告

> 日期：2026-11-20　任务编号：P1-4-RESEARCH　性质：**只读审查、架构取证、实施方案设计**。
> 🔴 授权边界：本任务仅读取代码/配置/测试/文档/运行结果，**未修改任何项目文件、未提交 commit、未启动 P1-5/P1-6/P2**。唯一新建物为本报告文档。
> 取证原则：结论只建立在真实执行的代码路径上；配置名称、审计字段、日志、测试 mock 均单独标注，不据此推断运行时行为。

---

## 〇、核心问题回答
> 每个 Skill 是否真正经历了激活、执行、有效输出、下游消费、规则注入？每阶段是否有真实证据？

**结论：没有。当前不存在"每个 Skill 逐态经历"的生命周期。**
- **Activation（激活）**：✅ 真实存在——`evaluateAllActivations` 运行时判定并落盘 `screen.skillActivation`。
- **Execution（执行）**：❌ 完全缺失——全仓无 Skill 执行器/执行结果结构；8 项 Skill 被压缩为 directive 一次性注入单次规划模型调用；`activated=true` 不等于 `executed=true`。
- **Output（输出）**：⚠️ 已有但不完整——有 aiPlan / authorizationTrace / promptLayers，但无 Skill 级输出对象、无输出有效性校验；存在"active 但无有效 generation instruction"。
- **Downstream（下游消费）**：⚠️ 已有但不完整——部分 aiPlan 字段真实改变提示词，但多个字段（qc/industryProfile/tone/audience/narrative）零消费；所有五态审计字段前端零消费。
- **Injection（规则注入）**：⚠️ 已有但不完整——文本确实进入规划与生图上下文，但多路径重复注入、最终 `text` 无来源标识。

---

## 一、当前生命周期真实调用链（方案要素1）
```
A 规划链（文本模型，产出 aiPlan）
  detail.routes.js:64  createDetailAiPlan
    → detail-ai.js:348-406
    → buildDetailChatBody(:329-346) / buildDetailAnalysisContent(:131-327)
    → instruction(:154-188)：:182-183 skillModuleV2.directives/constraints
                              :185  V2_REGISTERED_SKILLS.map(directive)  ← 8 Skill 唯一"执行"近似
                              :112-114 skillPack.planningSkill.registeredSkills（同一批 directive 再次挂载）
    → skillPack(:214) = compactSkillPack(:61-129)，含 industryCandidates(:85-93)
    → 一次 postChatCompletion（execution-flow.md:19 明示"九阶段一次调用内完成"）→ aiPlan

B 生图链（图像模型，产出图）
  detail.routes.js:95-110  buildDetailPromptGroupV2({...}, {aiPlan: aiPlan?.plan})
    → detail-middleware.js
      :1330-1354 派生 triggerCtxKeys
        ├ :1339 deriveFigureTaskContextKeys(:942-979)
        ├ :1342 deriveStructureTaskContextKeys(:990-1011)
        ├ :1344 deriveQCTaskContextKeys(:1024-1035)
        └ :1347-1353 文案/结构事实/效果证据键
      :1355 evaluateAllActivations → skill-activation.js:315-324 → evaluateActivation:279-312
      :1358 compileScreenConditionalInstructions(:1043-1096) → compileWithAuthorization(:344-372)
      :1455-1474 screen 落盘：text / skillActivation / authorizationTrace / promptLayers
      :1492 buildV2ControlReport(:876-933) → v2Control
  detail-state.js:496  form.set("prompt", prompt.text) → /api/images   ← 生图只用 text 一个字段
```

---

## 二、五态现状逐项取证（方案要素2/4/5/6/7）

### 2.1 Activation — 已有（真实运行时）
- 判定引擎 `skill-activation.js:279-324`：`evaluateActivation` 四模式裁决（INACTIVE / MANDATORY / CONDITIONAL；`OPTIONAL` 在 :283 落入 else 分支实际返回 `conditional`，契约写 `optional`，U16 门禁只校验字段未校验运行时一致性——**已知不一致**）。
- 条件语义：`conditionsMet:269-276`（`every` AND；`!` 前缀表否定）；旧键归一化 `normalizeContextKeys:252-265` + `LEGACY_CONTEXT_KEY_MAP:234-250`。
- 触发信号派生：人物 `deriveFigureTaskContextKeys:942-979`（只从用户指令+屏任务派生，不凭 modelUsage 旧参数臆断——P1 已修缺陷）；结构 `:990-1011`；QC `:1024-1035`。
- 落盘：`screen.skillActivation`（middleware:1458），随 group 返回。**这是真实激活证据。**
- 状态记录方式：判定对象 `{activationMet, exclusionHit, requiredContextMet, decision, active, injectToPrompt, auditReason}`。**只有判定，无执行语义。**

### 2.2 Execution — 完全缺失
- 全仓检索 `executeSkill|runSkill|SkillExecutor|executionResult|executionStatus|skillRuntime` 在 V2 相关目录**零命中**；`execution_rules` 仅存在于 `professional-skills-v1.json` 配置文件（描述性文本，非代码）。
- 唯一"执行"近似：`detail-ai.js:24-41,182-186` 把 8 个 Skill 压成 directive 注入单次模型调用——这是**模型一次生成**，不是"每个 Skill 各自执行"。
- `compileScreenConditionalInstructions`（middleware:1043-1096）是**授权/注入过滤器**，不是执行器；其 `authorizationTrace[].authorized`（:1074）= `Boolean(active)`，直接复制激活态，**非独立授权/执行结果**。
- **feasibility**：五态第二态须新建"执行"语义（见 §五实施方案）。

### 2.3 Output — 已有但不完整
- 真实产出：`aiPlan`（模型一次生成）、`authorizationTrace`/`authorizationDropped`（工程编译）、`promptLayers`（`:1464-1469`，`assemblePromptLayers`:skill-activation.js:328-342 产 `{global,screen,conditional,internalAudit,finalInstruction,auditIsolated}`）、`text`。
- 缺口：① 无 Skill 级输出对象——8 个 Skill 的 `output_contract` 混在 aiPlan 顶层字段，**无法区分哪个 Skill 产出**；② 无输出有效性校验——`fieldsPresent`（middleware:896-901）只做 `Boolean()` 存在性检查，明确注释"不判断内容质量"(:895)；③ 存在 `active=true` 但无 generation instruction（见 §三反例）。

### 2.4 Downstream — 已有但不完整
真实消费（改变生图 text）：
| aiPlan 字段 | 消费函数 | 真实影响 |
|---|---|---|
| `product.industryId/name/realSellingPoints/materials` | `aiIndustry`:477-503 / `resolveIndustryDecision` | 决定行业规则→屏任务/全局锁 |
| `product.*`（audience/materials/structureLocks/colors…） | `mergeAiAnalysis`:575-604 | 写 analysis，sellingPoints 进屏卖点 |
| `consumerInsights.needs` | `mergeAiAnalysis`:579-581,585-591 | 并入卖点候选→`【本屏卖点】`:1404 |
| `marketingStrategy.valueLadder` | `mergeAiAnalysis`:582-584,587 | 利益表达优先于原始资料→卖点 |
| `globalVisualDNA` | `buildScreenVisual`:1308,413-415→`【画面任务】`:1406 | 真进生图 text |
| `planning.screenRoles/facts` | :1172-1249 / :1125,1289,1305,1332-1335 | 决定 moduleId/卖点放行/视觉事实/触发 |

**零消费（有输出未消费）**：`aiPlan.qc`（detail-ai.js:287-291 声明，全仓无读取点）；`industryProfile`（仅 :881 一致性比较，不参与决策）；`marketingStrategy.tone/boundaries`；`consumerInsights.audience`；`planning.narrative/dedupLog`（仅 outputSchema 声明）。
**前端零消费**：`skillActivation`/`authorizationTrace`/`authorizationDropped`/`promptLayers`/`v2Control`/`coverageDecision`/`outputRequirementsApplied`/`rounds` 在 `src/` 全无命中——服务端算出并返回，但未贯通到生成请求。**因此这些字段是审计镜像，不能作为"下游已消费"的证据。**

### 2.5 Injection — 已有但不完整
最终生图 text 唯一组装点 `detail-middleware.js:1394-1421`（17 槽位），五类来源：
| 类别 | 注入函数/行号 | 落点 |
|---|---|---|
| Skill 原始规则 | detail-ai.js:24-41,182-186（**仅 A 链规划模型**，B 链无 directive 原文，只有 `roleClause`:skill-activation.js:383-389 等派生短语） | 规划 instruction |
| 行业包专业规则 | `buildGlobalLock`:824-835（`analyzeAttributes`:828/`taboos`:833）→`【全局一致性锁定】`:1402；`buildRounds`:850-854 行业 Skill stage；coverage→compositionHint(index.js:361)→`【画面任务】`:1302 | globalLock/rounds/画面 |
| 平台策略 | `getPlatformSkill`:1104；`buildGlobalLock`:826,831；`buildRounds`:855-858 | 全局锁/rounds |
| 商品事实/屏级任务 | `normalizeAiScreens`:539-562；`sellingForPrompt`:1285-1296；`visualForPrompt`:1313-1317；`promptDirectives`:1365-1370 | 多槽位 |
| 全局约束 | BASE_SKILL authenticity/consistency:827,830；QUALITY_SKILL.negativePrompt:1372 | 全局锁/负面约束 |

**来源标识**：生图 `text` 无来源标识；`promptLayers` 只分层（global/screen/conditional/internalAudit）不含 Skill id；只有 `authorizationTrace` 对 Conditional 指令有局部来源（`sourceField`/`sourceTaskId`/`activationId`，middleware:1053-1081），但不进 text、前端不消费。
**重复注入位置（仅识别、不治理）**：① Skill directive 双注入 detail-ai.js:185 vs :112-114；② `analyzeAttributes/taboos` 在 A 链 industryCandidates(:88,91) + B 链 globalLock(:828,833，每屏重复) + rounds 行业 stage(:853) 三处；③ `productAuthenticityLock/globalStyleConsistency` 在 globalLock+rounds+compactSkillPack.base 三处（P1-5 已立项未整改，plan 文档:84-91 佐证）。

---

## 三、六类专项 Skill 五态映射（方案要素3）
**概念澄清**：配置里不存在 6 个独立专项 Skill。`product-specialty-expression` 是**一个聚合契约**，其内部 `formal_professional_contract_v1.six_specialties`（`professional-skills-v1.json:208-215`）定义六类：

| 六类专项 | 配置行 | 运行时触发信号 | 五态现状 |
|---|---|---|---|
| product_structure | :209 | ✅ `deriveStructureTaskContextKeys`(:990-1011)→`specialty_condition_met` | A✅ E❌ O⚠️ D❌ I❌（active 但无 entry，reason 矛盾） |
| effect_evidence | :211 | ✅ 内联 `reliable_effect_evidence/effect_evidence`(:1351-1353)→归一 specialty_condition_met | 同上 |
| ingredient_principle | :210 | ❌ 无成分信号派生 | A❌（不激活）E/O/D/I 均不适用 |
| before_after | :212 | ❌ 无 | 同上 |
| material_texture | :213 | ❌ 无 | 同上 |
| usage_steps | :214 | ❌ 无 | 同上 |

规划文档已承认缺口（`JY-CANVAS-P1-架构修复任务拆分:77`："这四项专项当前不触发；仅补触发信号，不实现 P2 能力本身"）。**P1-4 只补触发信号派生，不放宽条件、不实现 P2 能力。**

其余 Skill 契约（`professional-skills-v1.json`）：
| Skill | 触发条件 | 模式 |
|---|---|---|
| product-understanding / consumer-marketing-strategy / detail-story-planning / visual-art-direction | `[]` 恒真 | mandatory |
| ecommerce-copy-layout | `screen_needs_text` | conditional |
| figure-usage-scene | `screen_needs_figure`,`user_requires_figure` | conditional |
| product-specialty-expression | `specialty_condition_met` | conditional |
| detail-quality-control | `qc_requested` | optional（运行 decision 实为 conditional，见 §2.1） |
| industry-routing-retained / cross-screen-coherence-retained | `[]` | mandatory（retained 兼容） |

测试覆盖（`detail-v2-control-chain-check.mjs`）：契约字段 L9-L10/M11/O11/P10/U12/Q9/S11；激活行为 Q3-Q14（人物）/S5,S15-S17（专项配置）/W-X（QC）/AB（授权追踪）。**性质**：真实调用纯函数 + buildDetailPromptGroup（但 aiPlan 是手写 mock :59-68）+ 大量 `probe(read(...))` 源码文本断言。**无任何测试断言"执行成功/失败/跳过"或"输出有效性"。**

---

## 四、五态数据契约设计（方案要素2）
> 建议在 `evaluateActivation` 返回值上扩展五态字段（不改八 Skill 正文/契约），每态独立字段+证据来源，禁止压缩为单布尔。

```js
{
  id, authoritySource, decision, active, injectToPrompt, auditReason,   // 现有（保留兼容）
  // 新增五态（建议）
  lifecycle: {
    activation: { state: "activated|inactive|excluded|not_applicable", reason, evidence: {contextKeys, contractId, authoritySource} },
    execution:  { state: "executed|failed|skipped|not_applicable", entry, reason, evidence: {executor, timestamp, resultRef} },
    output:     { state: "valid|empty|invalid|not_applicable", type, count, contractCheck, evidence: {fields, validator} },
    downstream: { state: "consumed|not_consumed|not_required", consumers: [{fn, field, effect}], reason, evidence },
    injection:  { state: "injected|not_injected|duplicate|not_required", paths: [{location, sourceSkillId, sourceField}], count, evidence }
  }
}
```
状态转换：`inactive → (not_applicable 终止)`；`activated → executed/failed/skipped → valid/empty/invalid → consumed/not_consumed/not_required → injected/not_injected/duplicate/not_required`。每态不得由上一态推断（如 active ⇏ executed）。

---

## 五、实施方案（要素8/9/10/11/12）

### 5.1 最小改动范围（预计文件/函数）
| 文件 | 函数/位置 | 改动 |
|---|---|---|
| `server/detail-v2-control/skill-activation.js` | `evaluateActivation:279-312` / `evaluateAllActivations:315-324` | 增 `lifecycle` 五态字段；增 `validateSkillOutput`（有效性校验）；增 `markConsumption` / `markInjection` 记录函数 |
| `server/detail-middleware.js` | `compileScreenConditionalInstructions:1043-1096` | 把 `trace` 的 `authorized=Boolean(active)` 改为独立执行/注入态；修 product-specialty-expression reason 矛盾；把五态落盘到 screen |
| `server/detail-middleware.js` | `:1330-1354` triggerCtxKeys | 补 ingredient/before_after/material/usage 四类触发信号派生（仅信号，不实现 P2 能力） |
| `scripts/verify/detail-v2-control-chain-check.mjs` | 新 AO/AQ 组 | 五态断言 + 8 类反例 + 无 active/injected 矛盾 |

**不改**：八 Skill 正文、契约字段、prompt_injection_policy、`resolveIndustryDecision`（P1-1）、行业包配置（P1-2/3）、平台策略、detail-ai.js 的 directive 装配（属 P1-5 边界）、前端。

### 5.2 各状态成功/失败/跳过/不适用定义（要素4）
- **Activation**：条件满足且无排除→activated；排除命中或条件不满足→inactive；契约 mode=inactive 或任务不适用→not_applicable。
- **Execution**：有真实执行入口且返回成功→executed；入口抛错/返回失败→failed；条件 Skill 未授权执行→skipped；mandatory 由全局文本承载无独立执行→not_applicable（须显式标注，不冒充 executed）。
- **Output**：产出非空且通过契约字段+有效性校验→valid；无产出→empty；产出但校验不通过→invalid；not_applicable 时无输出需求→not_applicable。
- **Downstream**：有函数读取该输出并改变任务/卖点/提示词→consumed（须记 fn+field+effect）；产出但无读取→not_consumed；设计上无需下游（如内部审查）→not_required。
- **Injection**：规则进入最终 `text` 一次→injected；应进未进→not_injected；同一规则多路径进入→duplicate（只记录，治理归 P1-5）；本就无需注入（如内部资产）→not_required。

### 5.3 有效输出判定（要素5，非仅非空）
`validateSkillOutput(output, contract)`：① 必填字段齐备（对照 output_contract 而非 `Boolean()` 存在性）；② 字段内容非空且非占位（排除"待补充/示例/模板/TODO"）；③ 结构与声明类型一致（数组/对象/枚举）；④ 事实一致性（输出不得含 `mustNotClaim` 事实，复用 `checkSellingPointBoundary` / 事实等级）；⑤ 对 aiPlan 类混合输出，按字段切片归属到对应 Skill 的输出契约。**有效=全部通过，任一失败标 invalid 并记原因。**

### 5.4 下游真实消费证明（要素6）
在每个消费点显式登记 `consumptionRecord`：`{skillId, outputField, consumerFn, consumerLine, effect}`。判定标准：该函数读取输出后**改变了** sellingPoints/taskCategory/compositionHint/moduleId/text 中的一个（有 before/after 差异），才算 consumed；仅挂到返回对象（如 v2Control/promptLayers）不算。对 qc/industryProfile 等零消费字段，明确标 not_consumed + 真实原因（"仅审计比对"/"outputSchema 声明但无读取点"）。

### 5.5 规则实际进入生成上下文证明（要素7）
在 text 组装时（middleware:1394-1421）为每段注入记录 `injectionRecord`：`{segment, sourceSkillId, sourceCategory, path, hash}`。判定标准：段文本在最终 `text` 中真实出现（可用 `text.includes(segment)` 或哈希比对）→ injected；同一 `hash` 出现多次→ duplicate。**本阶段只记录，不去重（P1-5 治理）。**

### 5.6 与 P1-5 精确边界（要素8）
- P1-4：五态字段/校验/记录函数；补四类触发信号；修 reason 矛盾；**记录 duplicate 状态**。
- P1-5：`buildGlobalLock`(:824-835) 与 `buildRounds`(:850-858) 二选一保留注入点，删除另一处重复；detail-ai.js:185 vs :112-114 directive 去重；验证 text 中每份规则出现次数 2→1。**本阶段严禁修改这些注入点。**

### 5.7 依赖关系与回归风险（要素10）
- 依赖：P1-1/2/3 已关闭，五态字段建立在现有 `activation` 对象上，不改其既有字段（兼容 AB 组断言）；前端零消费意味着五态主要服务审计/门禁，不强行贯通前端（避免扩大范围）。
- 风险：① `evaluateActivation` 返回新增字段可能触发快照/序列化断言变化（须保留既有字段顺序）；② OPTIONAL→conditional 不一致若顺手修正会改 U16 语义（本阶段只记录不修）；③ 补四类触发信号可能使原本 inactive 的专项变 active，须确认不放宽条件、不引入 P2 能力（用门禁锁定"补信号后六类仍只有有事实依据时激活"）。

### 5.8 测试矩阵（要素11，含 8 类反例）
| 反例 | 预期五态 |
|---|---|
| 激活但未执行 | activation=activated, execution=failed/skipped（不得 executed） |
| 执行但失败 | execution=failed, output=not_applicable, downstream=not_applicable |
| 执行成功但无有效输出 | execution=executed, output=empty/invalid, injection=not_injected |
| 有输出但下游未消费 | output=valid, downstream=not_consumed + 真实原因 |
| 被消费但无注入需求 | downstream=consumed, injection=not_required（如内部审查） |
| 规则多路径重复注入 | injection=duplicate + paths 列全部路径（不去重） |
| 条件不满足正确不激活 | activation=inactive, 其余 not_applicable（不伪造 executed） |
| 不适用于当前任务 | activation=not_applicable（如 QC 对无审查需求屏） |
每项以真实 `buildDetailPromptGroup` 驱动（区分 mock aiPlan 与生产），断言 `screen.lifecycle.*` 与 text 实际内容。

### 5.9 完整回归门禁（要素12）
`node scripts/verify/run-all.mjs`（86 脚本全绿）+ 控制链（现有 515 项不回退）+ planning 链 + assets 冻结 + `vite build` + `node --check`/ESLint 0 errors。新增测试脚本须注册 `run-all.mjs`（项目既有纪律）；五态字段为增量，不改 P1-1/2/3 既有断言。

---

## 六、已有 / 不完整 / 缺失 清单（交付要求）
| 类别 | 内容 |
|---|---|
| **已有能力** | Activation 判定引擎（evaluateAllActivations）+ 触发信号派生 + 旧键归一化；aiPlan 部分字段真实消费；五类文本真实进入 text；authorizationTrace 局部注入来源 |
| **已有但不完整** | Output（有产出无 Skill 级结构/有效性校验）；Downstream（部分字段消费、审计字段前端零消费）；Injection（多路径重复、无来源标识）；六类专项仅 2 类有触发信号 |
| **完全缺失** | Execution（独立执行器/执行结果结构/成功失败跳过记录）；五态状态对象（规划中未实现）；输出有效性校验；下游消费记录字段；最终 text 来源标识 |
| **需要修改的真实代码位置** | skill-activation.js:279-324（五态字段+校验）；detail-middleware.js:1043-1096（trace 独立化+reason 矛盾）、:1330-1354（补四类信号）、:1394-1421（注入记录）；chain-check.mjs（新测试组） |
| **不能仅靠日志解决的问题** | Execution 真实性（需执行器）；Output 有效性（需校验函数）；Downstream 消费（需消费点登记+before/after 差异）；Injection 来源（需 text 段级标识）；reason 矛盾（需状态与文本一致的逻辑） |

---

## 七、完成条件与停止点
本只读取证与方案设计已完成。**按授权边界：不修改代码/配置、不提交 commit、不启动 P1-5/P1-6/P2。** 现停止工作，等待顾问审查报告后另行决定是否批准 P1-4 第二阶段正式实施。
当前 P1-4 状态：只读取证阶段完成，待顾问审查。

---

# 补充审查结果（顾问 P1-4-RESEARCH 补充要求，同日）

> 性质：**在原报告基础上做方案补充核验**，仍只允许文档核验——未修改任何代码/配置/门禁、未提交 commit、未启动 P1-5/P1-6/P2。本节为追加，不改上文任何结论。

## 补充一：Execution 语义（设计状态：原报告需修正 → 本次补全）
**核实结论**：原报告"Execution 完全缺失（无独立执行器）"的判断正确，但五态契约里 Execution 的**可观测对象定义不清**——顾问要求明确"记录指令是否投递至模型 + 对应模型调用是否成功"，本次补全。

- **真实可观测点（代码级）**：
  - 指令投递：`detail-ai.js:365` `postChatCompletion({ body: buildDetailChatBody(...) })`——`buildDetailChatBody:329-346` 内含 8 条 directive（:185）与 registeredSkills（:112-114）；投递这一动作由该函数真实发生。
  - 调用成功：`:372-378` `attempts.push({url,status,ok,includeImages,withJsonFormat,message})`；`:384-399` 成功返回 `{ok:true, model, usedBaseUrl, timing, attempts, plan}`；失败 `:404` throw；路由 `detail.routes.js:70-90` 写 `stage=detail-ai-plan, ok:true/false` 日志，`:103-108` 把 `aiMeta` 传给 group。
- **五态契约 Execution 精确定义（修正原 §2.2/§4）**：
  - `delivery: "delivered|not_delivered"`——证据=`attempts[].url/status/ok` + `body` 含该 Skill 的 directive/marker（投递粒度=整次规划请求，非单 Skill）。
  - `callResult: "success|failed|timeout|not_called"`——证据=`aiPlan.ok` / `attempts` / `aiError`。
  - `state: "executed|failed|skipped|not_applicable"`——**此处 executed 仅表示"承载该指令的模型调用成功"，不表示 Skill 独立执行成功**；契约字段名建议改 `callDispatched/callSucceeded` 以免误导，或保留 executed 但强制附 `scope: "planning_call_not_skill_executor"`。
- **三条禁止（写入契约注释）**：① 不得把"指令注入成功"等同于"Skill 独立执行成功"；② 不得声称观测模型内部是否遵循某条 Skill 规则（无任何代码可观测模型内部注意力/遵循度，响应体只有 aiPlan 字段）；③ 不得借 P1-4 新建多 Agent / 独立 Skill Executor / 调度体系——本阶段只记录既有单次规划调用，不引入任何执行框架。
- **尚存风险**：`aiPlan.ok=true` 只能证明"某次模型调用返回了可解析 JSON"，不能证明八条 directive 每条都被遵循；五态Execution 必须在字段命名/注释上显式声明这一边界，否则会被误读为"每 Skill 已执行"。

## 补充二：Output 与 Downstream 逐 Skill 映射（设计状态：原报告已有框架 → 本次逐项补全）
**核实结论**：原报告 §2.3/§2.4 已给总体框架，但缺"逐 Skill 输出字段→有效性→消费者→影响"的表。本次补全，并按顾问要求分三类标注。

| Skill | 预期输出字段（来自 aiPlan/contract） | 有效性条件（建议 validateSkillOutput） | 真实下游消费者与影响 | 分类 |
|---|---|---|---|---|
| product-understanding | aiPlan.product{industryId,name,realSellingPoints,materials,…} | industryId 合法 + realSellingPoints 非空且非占位 + 无 mustNotClaim 事实 | `aiIndustry`:477-503→行业决策；`mergeAiAnalysis`:575-604→sellingPoints→`【本屏卖点】`:1404 | **必须消费**（已消费） |
| industry-routing(retained) | aiPlan.industryProfile.industryId | id 合法 | `buildV2ControlReport`:881 仅一致性比较，不参与决策 | **仅供参考**（当前仅审计，非消费） |
| consumer-marketing-strategy | consumerInsights.needs / marketingStrategy.valueLadder；另有 tone/boundaries/audience | needs/valueLadder 为非空数组且元素非占位 | `mergeAiAnalysis`:579-584,587→卖点候选→`【本屏卖点】` | needs/valueLadder=**必须消费**（已）；tone/boundaries/audience=**预留未接入**（明确标零消费） |
| detail-story-planning | planning.screenRoles / planning.facts / narrative / dedupLog | screenRoles 数量与 count 一致；facts 有 level 枚举 | `planning.screenRoles`:1172-1249→moduleId；facts 多处消费 | screenRoles/facts=**必须消费**（已）；narrative/dedupLog=**预留未接入**（零消费） |
| visual-art-direction | globalVisualDNA{palette,lighting,camera…} | 字段非空且非占位 | `buildScreenVisual`:1308,413-415→`【画面任务】`:1406 | **必须消费**（已消费） |
| ecommerce-copy-layout | aiScreen.copywriting / screen_needs_text 信号 | copywriting 非空 | `sellingForPrompt`/`promptDirectives`（由既有【本屏文案】槽承载，trace:`carriedByExistingSlot`） | **必须消费**（经既有槽，不新增注入） |
| figure-usage-scene | modelPolicyHint / 人物屏任务 | 仅 UI 授权且屏内有明确人物需求 | `authorizedModelLine`→`【模特与镜头】`:1412-1413 | **必须消费**（真实注入，唯一有 entry 的 Conditional） |
| product-specialty-expression | 六类各自 output（见补充三） | 见补充三证据条件 | 当前 active 但无 entry、`injectedToPrompt=false`（reason 矛盾待修） | **必须消费的最小实现范围**：仅结构/效果两类（已有信号），补 entry 使 active 与注入一致；其余四类不接入 |
| detail-quality-control | qc{globalChecks,commonFailureRisks,retryAdvice} | 有检查结果且非占位 | **零消费**：全仓无 `aiPlan.qc` 读取点；`prompt_injection_policy` 禁止进生图，走内部审查层（但无独立 QC 执行函数） | **仅供参考/内部**（明确标 not_consumed + 原因；不强行接入生图） |

- **三类划分**：必须被消费（product/needs/valueLadder/screenRoles/facts/visualDNA/copy/figure/结构+效果专项）；仅供参考（industryProfile 一致性、qc 内部、tone/boundaries/audience 若未来需要）；尚未接入生产链预留（narrative/dedupLog、ingredient/before_after/material/usage 四类专项信号）。
- **最小实现范围**：只对"已有触发信号且 active 但注入矛盾"的两类专项补 entry；qc/industryProfile/narrative 等明确标零消费原因，**不扩大 P1-4 去接入**；四类无信号专项只补信号派生（plan文档:77），不实现 P2 能力。
- **尚存风险**：若把"字段存在"当消费，会把 qc/narrative 误判完成——必须以"消费函数读取后改变 sellingPoints/taskCategory/compositionHint/moduleId/text"（before/after 差异）为 consumed 判据。

## 补充三：六类专项（设计状态：确认聚合 → 本次逐类补正反测试）
**确认**：`product-specialty-expression` 是实际聚合 Skill（`professional-skills-v1.json:190` 契约，六类定义在其 `formal_professional_contract_v1.six_specialties:208-215`），**六类不是六个独立 Skill**，勿据此新建六个执行器。

| 专项 | 真实触发条件（运行时信号） | 所需证据 | 正向测试 | 反向不触发测试 | 证据不足状态/降级 |
|---|---|---|---|---|---|
| product_structure | `deriveStructureTaskContextKeys:990-1011`→`structure_task_required`→归一 `specialty_condition_met`；用户明确要求 或 本屏任务需结构表达（screenText 含 moduleSkill 名/模块 id 属屏任务语义，非行业判断） | `confirmed_structure_fact`（visible 事实含 结构/泵头/喷头/卡扣，middleware:1349） | 输入"展示泵头结构"+ visible 事实"卡扣连接"→ activation active | "不要结构展示"（STRUCTURE_NO_TASK_PATTERN）或无结构词→ inactive | 有任务信号无事实→ `specialty_condition_met` 不足→降 inactive/父行业，不虚构结构 |
| effect_evidence | 内联 `:1351-1353` `reliable_effect_evidence/effect_evidence`→归一 specialty_condition_met | visible 事实含 效果/去除率/测试（:1351-1352） | "去除率99%，附检测报告" visible→ active | 仅营销词"强效去渍"无 evidence→ inactive | 无证据→ inactive + reason `insufficient_effect_evidence`，不生成效果断言 |
| ingredient_principle | ❌ 当前无信号派生 | 已确认成分+作用关系事实 | （P1-4 补信号后）"成分表+作用原理"有据→ active | 仅名称/包装推断→ inactive | 未实现/缺触发契约→ `not_applicable_missing_contract`，不伪装已实现 |
| before_after | ❌ 当前无信号派生 | 已确认前后状态对比事实 | （补信号后）"使用前/使用后"有据→ active | 无对比依据或需虚构→ inactive | 同上 |
| material_texture | ❌ 当前无信号派生 | 已确认材质/表面事实 | （补信号后）已确认材质特写→ active | 凭外观推断材质→ inactive | 同上 |
| usage_steps | ❌ 当前无信号派生 | 已确认使用步骤事实 | （补信号后）说明书记载步骤→ active | 按行业惯例编步骤→ inactive | 同上 |

- **不为六类全激活而放宽条件**：四类的正向测试是"补信号后的预期"，当前状态必须如实标 `not_applicable_missing_contract`，不能写成已具备。
- **尚存风险**：结构信号的 screenText 含 moduleSkill 名/id，若模块名恰好含"结构"两字会在无用户要求时触发——需在测试中锁定"仅屏任务语义触发"，不把它当用户显式要求，避免误激活。

## 补充四：Injection 三阶段（设计状态：原报告已列来源 → 本次按三阶段重构）
**核实结论**：必须区分三个阶段，不能混为一谈：

| 阶段 | 入口/出口 | 注入内容 | 来源 | 规则标识 | 次数证据 |
|---|---|---|---|---|---|
| ① 规划模型请求 | `detail-ai.js:329-346 buildDetailChatBody` → `:365 postChatCompletion` | instruction(:182-186 directive + registeredSkills)、skillPack(:61-129 含 industryCandidates)、outputSchema(:215-301) | Skill 原始规则 / 行业候选 / 平台 / 全局 | `V2_REGISTERED_SKILLS[].marker`(:36-41) 在 skillPack 有、instruction 的 directive 是裸文本无 marker | `attempts[].includeImages/withJsonFormat` 记录投递次数；**内容级重复需按 hash 统计**（directive 在 :185 与 :112-114 各一次） |
| ② 最终详情提示词编译 | `detail-middleware.js:1394-1421 text[]` → `assemblePromptLayers`:1464 | 17 槽位：全局锁(:1402,来源于:824-835)、本屏卖点(:1404)、画面任务(:1406)、模块指令(:1408)等 | 行业包规则 / 平台策略 / 商品事实 / 屏级任务 / 全局约束 | 中文槽名硬编码，**无 Skill id**；promptLayers 只分层不标源 | 同一规则在 globalLock+rounds 各一次（P1-5 待治理） |
| ③ 生图请求 | `detail-state.js:496 form.set("prompt", prompt.text)` → `/api/images` | **只有 `prompts[].text` 一个字段** | 来自阶段② | 无（text 不携带标识） | 每屏 text 一次 |

- **P1-4 只做追踪**：在阶段①②③记录 `injectionRecord{segmentHash, sourceSkillId, sourceCategory, stage, path, occurrence}`，occurrence 统计同 hash 出现次数；**不去重、不改 text、不改 directive 装配**（那是 P1-5）。
- **尚存风险**：阶段①的 directive 双注入（:185 vs :112-114）与阶段②的 globalLock/rounds 重复会被记为 `duplicate`，但本阶段不改；顾问需在 P1-5 批准后才能动这些位置。

## 补充五：状态契约（设计状态：原报告 §四有骨架 → 本次补运行标识/范围/完整枚举）
**核实结论**：原 §四 lifecycle 结构可用，但缺顾问要求的标识与精确枚举，本次补全。

- **标识字段**：`runId`（一次规划调用，取 aiPlan.usedBaseUrl+timing 或新建 run id）/ `skillId`（契约 id）/ `specialtyId`（六类子 id，仅 product-specialty-expression 填）/ `scope`（`planning_whole` 整次规划 / `screen_i` 单屏）。
- **完整状态枚举（九类，逐项对应顾问要求）**：
  1. `inactive`（未激活，条件不满足）——由 evaluateActivation 真实判定产生；
  2. `not_applicable`（不适用，如 QC 对无审查需求屏、mandatory 无独立执行需求）——由任务类型/屏任务真实事件产生；
  3. `not_implemented_missing_contract`（未实现或缺乏触发契约，四类无信号专项）——由"派生函数无该信号"的真实检查产生；
  4. `execution_failed`（执行失败，模型调用 ok=false/timeout）——由 attempts/aiError 真实事件产生；
  5. `output_invalid`（输出无效，含 empty）——由 validateSkillOutput 真实校验产生；
  6. `output_not_consumed`（有输出但未消费）——由消费点登记缺失+无 before/after 差异产生；
  7. `consumed`（已消费）——由真实消费函数+字段变化产生；
  8. `injected`（已注入）——由阶段②text 中 segmentHash 出现产生；
  9. `duplicate_injected`（重复注入）——由同 hash occurrence≥2 产生。
- **状态由真实事件产生，不预设默认值**：所有枚举值必须由上述真实运行事件（判定结果/调用结果/校验结果/消费登记/hash 计数）写入；**禁止用静态配置或默认 `consumed/injected` 填充**——实现时字段初始为 `undefined/pending`，只有事件触发才赋值。
- **尚存风险**：`not_applicable` 与 `not_implemented_missing_contract` 易混淆——前者是"契约有但本任务不适用"，后者是"根本没有触发契约"，字段来源不同，测试须分别构造。

## 五项设计完整性总表与最终精确实施范围
| 项 | 是否已有完整设计 | 对应章节 | 尚存风险 |
|---|---|---|---|
| Execution 语义 | ✅ 本次补全（原报告需修正） | 补充一 | 命名边界（executed 易被误读为独立执行）；不得观测模型内部 |
| Output/Downstream 映射 | ✅ 本次逐项补全 | 补充二 | 零消费字段勿误判；最小范围勿扩大 |
| 六类专项 | ✅ 本次逐类补全 | 补充三 | 四类未实现勿伪装；结构信号 moduleSkill 边界 |
| Injection 三阶段 | ✅ 本次按三阶段重构 | 补充四 | 重复只记录不改；P1-5 边界 |
| 状态契约 | ✅ 本次补全 | 补充五 | 两 not_* 枚举区分；状态禁默认值填充 |

**最终精确实施范围（P1-4 第二阶段，待顾问另行批准）**：
1. `skill-activation.js`：evaluateActivation/evaluateAllActivations 扩 lifecycle（补充五枚举+标识）；新增 validateSkillOutput、消费/注入记录函数。
2. `detail-middleware.js:1043-1096`：trace 独立化（executed 表示模型调用成功非独立执行）、修 product-specialty-expression reason 矛盾；:1330-1354 补四类专项触发信号（仅信号不实现能力）；:1394-1421 记注入 hash/occurrence。
3. `scripts/verify/detail-v2-control-chain-check.mjs`：新测试组覆盖五项 + 8 类反例 + 六类正反测试。
4. **明确不改**：八 Skill 正文/契约、行业包(P1-2/3)、平台策略、`resolveIndustryDecision`、detail-ai.js directive 装配（P1-5）、任何去重/删注入（P1-5）、前端（零消费不强推）。

**停止点**：本次补充审查为文档核验，未修改代码/配置/门禁、未提交 commit、未启动 P1-5/P1-6/P2。现停止工作，交顾问最终审批；P1-4 状态＝补充审查完成，待审批是否批准第二阶段实施。
