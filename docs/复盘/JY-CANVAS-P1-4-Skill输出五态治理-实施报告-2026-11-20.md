# JY-CANVAS P1-4 · Skill 输出五态治理 — 实施报告

> 日期：2026-11-20　任务：P1-4-IMPLEMENTATION（顾问正式批准）　性质：最小范围运行时五态治理。
> 🔴 范围：只改三处代码点；不改 V2_SKILL_DIRECTIVES、八 Skill 正文/契约、行业识别/平台、不建 Executor/Agent、不去重、不改文本、不启 P1-5/6/P2。
> 无 KEY：五态为确定性工程记录；G4/G5 真实模型质量不在本项范围，model_call_succeeded 不证明专业效果。

---

## 一、三处改动点（开工前已列名，实际一致）
| # | 文件 | 函数/位置 | 目的 | 负责五态 |
|---|---|---|---|---|
| 1 | `server/detail-v2-control/skill-activation.js` | 新增 `LIFECYCLE_STATES`/`contentFingerprint`/`validateSkillOutput`/`makeLifecycleEvent`（evaluateActivation 前）；`evaluateActivation:279` 增 lifecycle.activation；`evaluateAllActivations:315` 增 lifecycle.execution | 五态契约、Activation/Execution 判定、Output 校验工具、hash 工具 | Activation, Execution, Output(校验), Injection(工具) |
| 2 | `server/detail-middleware.js` | `compileScreenConditionalInstructions:1043`（reason 矛盾修正）；新增 `SKILL_OUTPUT_MAP`/`UNCONSUMED_FIELDS`/`buildFiveStateLifecycle`；`buildDetailPromptGroup` 开头 runtimePlan + 调用处传 ctx + 按屏收集 + return 非枚举挂字段 | Events 关联、Downstream 消费登记、Injection 三阶段追踪、reason 修复 | Execution(关联), Output, Downstream, Injection |
| 3 | `scripts/verify/detail-v2-control-chain-check.mjs` | AO 组后新增 AP 组 16 项 | 14 项测试矩阵 + 2 项完整性 | 全部（验证） |

**未新增第四处业务代码改动点**。未改 detail-ai.js（V2_SKILL_DIRECTIVES/attempts 原样）、配置、平台、前端。

## 二、修改前后代码位置
- `skill-activation.js`：evaluateActivation 返回新增 `lifecycle`（不改既有 decision/active/auditReason 字段，兼容 AB 组门禁）；evaluateAllActivations 入参新增 `ctx.runId/ctx.runtime`，返回新增 runId。
- `detail-middleware.js`：buildDetailPromptGroup 入参 options 的 aiMeta/aiError 派生 runtimePlan（runId/directiveDispatched/modelCallSucceeded/modelCallFailed）；evaluateAllActivations 调用传 runId+runtime；screen 的 `skillActivation` 落盘剥离 lifecycle（保持字节稳定）；新增 group 顶层**非枚举** `skillLifecycleByScreen`（服务端可读、不进 JSON 序列化、不进 prompts[]、不进生图 text）；compileScreenConditionalInstructions 修"已激活但无 generation instruction 却称已进入提示词"的矛盾。
- `chain-check.mjs`：AP1-AP16。

## 三、五态数据契约与真实事件记录示例
关联标识：`runId`（如 `run_fp_50a6e0cd`）/ `skillId`（真实注册 id）/ `specialtyId`（专项子级）/ `scope`（`planning_whole` 激活判定 / `screen_N` 注入输出消费）/ `eventTime`（真实事件时间）/ `evidence`。每态独立，禁止单布尔。状态由真实事件写入，初始 null，无默认填充。

**真实运行示例**（`buildDetailPromptGroup` 带 aiPlan+aiMeta，scope=screen_1）：
```json
product-understanding: {runId:"run_fp_50a6e0cd", A:"activated", E:"model_call_succeeded",
  O:"valid", D:"consumed", I:"not_required",
  evidence_E:{directiveDispatched:true, modelCallSucceeded:true, modelCallFailed:false,
              note:"指令投递/模型调用结果；不代表 Skill 独立执行成功，不观测模型内部遵循度"}}
consumer-marketing-strategy: A:activated E:model_call_succeeded O:valid D:consumed I:not_required
figure-usage-scene: A:not_activated E:not_applicable O:not_applicable D:not_applicable I:not_required
detail-quality-control: A:not_activated E:not_applicable O:not_applicable D:not_applicable I:not_required
```
- **Execution 语义**：E=`model_call_succeeded` 仅表示"承载该指令的规划模型调用成功"；`directiveDispatched` 来自 V2 规划路径经 buildDetailChatBody 装配 directives（detail-ai.js:182-186）这一代码事实 + 本次确实发生规划调用（aiPlan/aiMeta 存在）的运行事件。**不表示 Skill 独立执行、不声称观测模型内部遵循度、未新建 Executor/Agent。**
- 所有 active Skill 共享同一 runId（AP14 断言 ≥3 个且唯一）。

## 四、Skill 真实 ID 与映射
以真实注册表/契约为准（8 正式 Skill + retained/引擎 id，共 16 个判定结果）：
`product-understanding` / `industry-routing`(retained) / `consumer-marketing-strategy` / `detail-story-planning` / `visual-art-direction` / `ecommerce-copy-layout` / `figure-usage-scene`(引擎 model-pose) / `product-specialty-expression`(引擎 product-structure，六类子级) / `detail-quality-control` / `industry-routing-retained` / `cross-screen-coherence-retained` / `effect-evidence` / `ingredient-mechanism` / `industry-cleaning` / `product-authenticity` 等。
**未因聚合契约新增 Skill 注册项**；六类作为 product-specialty-expression 的 specialtyId 子级记录。

### 六类专项状态
| 专项 | 本项状态 | 说明 |
|---|---|---|
| product_structure（结构） | 已有真实触发信号（deriveStructureTaskContextKeys），五态可记录 | 按已有信号补齐运行态 |
| effect_evidence（效果） | 已有真实触发信号（内联 reliable_effect_evidence/effect_evidence），五态可记录 | 同上 |
| ingredient_principle（成分） | **`not_implemented_missing_contract`** | 无触发信号派生，未实现 |
| before_after（前后对比） | **`not_implemented_missing_contract`** | 同上 |
| material_texture（材质） | **`not_implemented_missing_contract`** | 同上 |
| usage_steps（用法） | **`not_implemented_missing_contract`** | 同上 |
**明确：四类专项仍未具备完整生产触发契约；本项未虚构信号、未放宽条件、未记为已激活/已执行/已交付。**

## 五、Output 与 Downstream 真实消费证据
- `validateSkillOutput` 校验非空、非占位、结构与必填字段（非 Boolean 存在性）；AP6 验证 `[{name}]` 缺 benefit → invalid、`"  "` → empty。
- 逐 Skill 映射（`SKILL_OUTPUT_MAP`）只对报告核定字段：
  - product-understanding：product 字段 → aiIndustry/mergeAiAnalysis → 行业决策+卖点（AP8: output=valid, downstream=consumed, effect 非空）。
  - consumer-marketing-strategy / detail-story-planning / visual-art-direction / ecommerce-copy-layout / figure-usage-scene：按核定字段登记 consumer 与 effect。
  - **零消费字段明确标注**：`UNCONSUMED_FIELDS=[planning.narrative, planning.dedupLog, marketingStrategy.tone, marketingStrategy.boundaries, consumerInsights.audience, qc, industryProfile]` 写入每个 downstream.evidence.unconsumedDeclared；qc/industryProfile 的 consumer=null → downstream=`not_consumed`（AP7 验证 industry-routing-retained）。
- 未把字段存在/模型输出成功/日志写入当消费；未扩大到接入 qc/narrative 等预留字段。

## 六、Injection 三阶段追踪（hash/来源/次数，只记不去重）
三阶段划分：A 规划模型请求（detail-ai.js:329-346/365，**本项未改**）；B 最终详情提示词编译（middleware:1410-1437 text[]）；C 生图请求（detail-state.js:496 只送 prompt.text，**本项未改**）。
- 本项在 B 阶段对规则段做 `contentFingerprint`（FNV-1a，形如 `fp_xxxx`）并记录 `occurrenceCount`、`duplicate`；`targetStage:"final_detail_prompt"`。示例：figure-usage-scene 激活屏 `【模特与镜头】`→hash+occurrence=1→`injected`；未激活屏不把"本屏无模特"兜底文本算作该 Skill 注入（已修，无"未激活却注入"矛盾）。
- AP11 验证重复可识别（同段出现2次计数=2、不同内容 hash 不同）；**未删除/合并任何重复、未改最终文本、未动 detail-ai.js directive 装配**——P1-5 边界保持。
- group 顶层 `skillLifecycleByScreen` 为非枚举属性：服务端可读审计，但不进 JSON 序列化/前端 payload（前端对五态本就零消费），从而不污染旧门禁的逐字节等价断言。

## 七、正反向测试（AP 组 16 项）
覆盖任务书 14 项矩阵 + 2 项完整性：正确激活投递(AP1)、未激活跳过(AP2)、不适用态(AP3)、投递但调用失败(AP4)、调用成功输出为空(AP5)、输出无效(AP6)、有效但无消费者(AP7)、真实消费(AP8)、只进规划未进提示词(AP9)、进提示词并送生图(AP10)、重复注入识别不去重(AP11)、六类正反与缺契约(AP12)、scope 不混(AP13)、多 Skill 共享调用关联(AP14)、五态独立(AP15)、枚举真实事件(AP16)。**全部通过（531/531）**。

## 八、旧门禁回归结果（无回退）
| 门禁 | 结果 |
|---|---|
| 控制链（含 AP16） | **531/531**（原 515 + AP16，旧断言一条未删未放宽） |
| planning 链 | 76/76 |
| assets 冻结 | ok=true |
| 全量 `--fast` | **86/86**（曾因五态 eventTime 破坏 3 个逐字节门禁，已通过"剥离 skillActivation.lifecycle + 顶层非枚举"修复，未改旧脚本） |
| vite build | EXIT=0 |
| 语法检查 | node --check 通过 |
| eslint | 0 errors（2 条存量 warning：moduleSkill/activeSkillIds，非本项引入） |

P1-1 行业体系 / P1-2 字段消费与事实边界 / P1-3 子类目继承与置信度降级：由上述全门禁覆盖，无回退。

## 九、未实现能力与遗留限制
1. 四类专项（成分/前后对比/材质/用法）仍 `not_implemented_missing_contract`，无生产触发契约——需后续单独立项，**本项明确不伪称具备**。
2. Execution 只到"模型调用结果"，无法观测模型内部是否遵循某条 Skill，也不证明专业效果（G4/G5 待验收）。
3. qc/narrative/dedupLog/tone/boundaries/audience 等字段保持 not_consumed/预留，未接入生产链（按最小范围）。
4. Injection 重复仅识别记录，实际去重属 P1-5（未启动）。
5. 五态为非枚举审计字段，不进前端 payload；如需前端展示须另行批准（本项不扩大）。

## 十、提交与状态同步
- **Commit**：（提交后回填）；单项单 commit，禁 --no-verify。
- 状态同步：NEXT.md / 执行单 README / 规划 README；P1-4 状态＝实施完成，待顾问独立验收；**P1-4 未验收不得关闭，P1-5/P1-6 未启、P2 冻结**。
- 停止点：完成后停止，交顾问独立验收。
