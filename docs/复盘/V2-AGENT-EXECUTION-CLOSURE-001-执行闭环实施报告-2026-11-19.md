# V2-AGENT-EXECUTION-CLOSURE-001 · 动态能力执行闭环与一致性治理报告

> 日期：2026-11-19　基线：当前 Git 版本（`d03b8a1`/`9e9a735`）。性质：P0 最小架构补全 + P1 一致性治理。
> 边界遵守：未新增第九 Skill/Agent/Planner/模型调用/Provider/KEY/第二套链路；未改前端/用户流程/QC 已关闭机制/Schema 顶层/公开接口；未重写专业正文；未为单品硬编码。
> 证据等级：已证实（代码+真实链路+请求体探针）｜待验证（无 KEY 的真实模型输出质量）。

---

# 交付 1：P0 动态能力执行闭环实施报告

## 实施前核查（第三节十项，真实代码证据）
1. **activeIds 产生**：`skill-activation.js:288-297 evaluateAllActivations`，`activeIds` 由 results.filter(r=>r.active) 映射；裁决在 `:269-284`（MANDATORY 恒 active、CONDITIONAL 条件满足、INACTIVE 排除）。
2. **消费点**：生产代码唯一直接读 activeIds 在 `detail-middleware.js:1023`（Set），唯一真实改变 text 在旧 `:1021` 模特行；`skillActivation`/`promptLayers`/`v2Control` 在 src/ 零消费（仅产出+透传+门禁断言）。任务书给的行号 948/1000/1050 已漂移，实为 1023/1021/1065/1071。
3. **compileWithAuthorization**：`skill-activation.js:319-345`，输入 `entries[{text,sourceField,sourceTaskId}]`+`admittedTaskIds`，输出 kept/dropped/text/audit；职责=丢弃无来源或未授权指令并记审计。死代码原因：仅定义/导出/import，生产 text 直接数组拼接从未构造 entries；与 `assemblePromptLayers`（`:301-315`）并列互不调用。
4. **八句 directive**：`detail-ai.js:24-33`，经 `:177 V2_REGISTERED_SKILLS.map(...)` 进入 `buildDetailAnalysisContent`→`buildDetailChatBody`→`postChatCompletion`；**发生在 middleware 之前**，无条件全量注入（与 activeIds 无关）。
5. **最终 text**：`detail-middleware.js:1058` 起 17 槽位数组拼接，原仅槽14读 activeIds。
6. **按屏信号**：三个 derive 在 `:662/710/744` 定义，`:957/960/962` push 进 triggerCtxKeys，`:968` 判定——全部位于 `:873` 起的单屏 map 循环内。
7. **数据层级**：activeIds 是**屏级**；每屏调用 1 次，N 屏 N 次；无整套级调用。
8. **三概念入请求**：8 句 directive 100% 进规划请求，三概念逐字命中；规划产物仅 screenRoles/globalVisualDNA 有限落地 text，marketingStrategy.valueLadder 等无消费。
9. **时序与循环依赖**：若把 activeIds 回灌规划模型会形成 `规划→activeIds→aiPlan→规划` 闭环，且 activeIds 依赖 aiPlan.planning.facts；**采用"规划阶段静态 directive + 编译阶段消费判定"两阶段方案，不回灌**，无循环依赖、无第二次模型调用。

## 实施内容（已证实）
- 新增 `compileScreenConditionalInstructions`（middleware）：把当前屏 Conditional 生成指令构造成带 `sourceField/sourceTaskId` 的 entries，用 **本屏 activeIds**（过滤 QC 后）调 `compileWithAuthorization` 真实过滤；kept 的 text 才进入最终提示词槽14。
- 槽14 改为使用授权编译结果 `authorizedModelLine`；未授权屏保留明确"禁止人体局部/手部"（符合用户要求，非无条件禁手）。
- `promptLayers.conditionalLines` 同步改用授权编译结果，不再直接判断 injectedIds。
- 每屏 prompt 新增 `authorizationTrace`（来源 Skill/屏/decision/activated/authorized/是否注入/原因）与 `authorizationDropped`。
- **Mandatory 恒执行**：四项 mandatory 仍在 activeIds，由 17 槽位的全局/屏级文本承载，不当条件指令过滤。
- **Conditional 按屏**：人物按 `index<min(modelUsage,count)`；文案 SKILL05 新增按屏信号 `screen_needs_text/screen_content_task`（本屏确有 copywriting/文案任务时），授权后由既有【本屏文案】槽承载、**不重复注入**。
- **QC 隔离**：`NON_INJECTABLE_SKILLS` 含 detail-quality-control；QC 主动触发时 activated=true 但 injectedToPrompt=false、正文不进 text（已实测）。

**activeIds 是否真实消费？是。** 屏级 activeIds 经 compileWithAuthorization 决定条件指令能否进入 text（AB-C/AB-H 证据）。
**compileWithAuthorization 是否进生产链路？是。** `compileScreenConditionalInstructions` 在每屏循环内调用它（AB-I 源码断言 + 真实 text 变化）。
**Skill 选择结果是否改变执行？是。** 同一输入 usage=1 时屏1 text 为"使用常规姿态模特"、屏2-4 为"本屏无模特禁止手部"（此前四屏全为禁人物）。

---

# 交付 2：P1 Skill 正文与 Runtime Directive 一致性报告

- 建立新门禁 `scripts/verify/detail-v2-skill-directive-sync-check.mjs`（已注册 run-all 双数组、进 --fast，脚本总数 85→86）。
- A 组：三 Skill 正文含 9 个关键锚点（五层价值链/购买驱动力/证据利益匹配；完整内容地图/禁止一条卖点一屏/屏幕独立价值；五种展示角色/文案画面语义对应/全局统一与单屏差异）。
- B 组：runtime directive 同步命中同 9 项。
- C 组：Skill ID↔directive 键一一对应。
- D 组：**负向对照**——模拟 directive 删除锚点后必须判红（防假绿）。
- E 组：禁止把 SKILL.md 全文塞进 directive（篇幅分级）。
- F 组：**真实请求体快照**——fetch 内存探针抓 `createDetailAiPlan` 组装的 24955 字节请求体，确认三概念与回链 phrase 全在（零真实模型调用）。
- 修复过程中发现 SKILL04 正文缺"文案画面语义对应"锚点（directive 有、正文无）→ 已补齐（V1.1 §6.3），这正是该机制要防的漂移。

**是否仍有漂移风险？** 结构风险仍在（两处物理分离，esbuild bundle 后无法读 md），但已由自动门禁覆盖关键锚点：任一处漏同步即判红，不再靠人工承诺。完全消除需构建期代码生成，超出本次"不改部署架构"边界，列为后续可选。

---

# 交付 3：真实生产链路调用追踪报告

```
routes/detail.routes.js:64 createDetailAiPlan
  └─ detail-ai.js:177 V2_REGISTERED_SKILLS.map(directive) → 八句进规划请求（含三概念）
     └─ postChatCompletion → aiPlan
routes/detail.routes.js:95 buildDetailPromptGroupV2
  └─ 逐屏 map (:873):
     ├─ triggerCtxKeys (:948-967) ← 三个 derive + 新增文案信号
     ├─ evaluateAllActivations (:968) → activeIds（屏级）
     ├─ compileScreenConditionalInstructions → compileWithAuthorization(entries, 本屏admitted)
     │    └─ kept.text → 【模特与镜头】槽14 + promptLayers.conditionalLines
     └─ text 17 槽位 (:1058) + authorizationTrace 挂载
```
**能力选择时机**：整套规划之前（静态 directive 内嵌契约）+ 单屏规划之后（activeIds 判定）；未回灌规划模型，无循环依赖。

---

# 交付 4：最终提示词来源与授权污染检查报告

| 检查 | 结果 |
|---|---|
| 未触发 Conditional 不注入 | AB-A/AB-D 通过（trace 全 injectedToPrompt=false） |
| 未授权屏条件指令 | AB-C 通过（屏2-4 禁人物，无模特生成指令） |
| QC 主动触发不进 text | AB-H 通过（activated=true，正文不在 text） |
| 内部分析/审计隔离 | qualityChecklist 仅 internalAudit；authorizationTrace 是审计字段不进 text |
| 文案不重复注入 | AB-B 通过（SKILL05 授权由既有【本屏文案】槽承载，不新增行） |
| 来源可追溯 | AB-J 通过（trace 含 skillId/screen/decision/activated/injectedToPrompt/reason） |

---

# 交付 5：新增测试及完整回归报告

A-J 十项已固化为控制链 AB 组（真实 `buildDetailPromptGroup` 链路）：
| 项 | 结果 |
|---|---|
| A 普通展示无 Conditional 注入 | ✅ |
| B 文案按屏授权且不重复 | ✅（屏2 conditional/authorized，屏1/3 inactive） |
| C 仅首屏人物授权不扩散 | ✅ `[T,F,F,F]`，屏2-4 禁人物 |
| D 未触发专项不注入 | ✅ |
| E 多能力 trace 隔离 | ✅ 4 项 skillId 唯一 |
| F Mandatory 恒执行 | ✅ 四项恒在 activeIds |
| G QC 普通不触发 | ✅ |
| H QC 主动触发不进 text | ✅ |
| I compileWithAuthorization 进生产 | ✅ 源码断言 + text 实际变化 |
| J trace 含完整来源字段 | ✅ |

回归：控制链 **396/396**（原 386 + AB 10 + 负向）、同步门禁 **35/35**、planning 76/76、sections 25/25、assets 冻结未破、**全量 86/86**、build EXIT=0。QC 正向/否定、人物按屏、商品事实边界、Sections/用户约束等原有断言全部保留通过。

请求体快照：24955 字节，三概念与回链 phrase 全在（fetch 探针，非真实模型调用）。

---

# 交付 6：修改文件清单及 Commit 清单

修改文件（5）：
1. `server/detail-middleware.js`（+82/-5）：compileScreenConditionalInstructions、文案信号派生、槽14授权编译、trace 挂载。
2. `prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md`（+2）：补文案画面语义对应 §6.3。
3. `scripts/verify/detail-v2-control-chain-check.mjs`（+28）：AB 组 10 项。
4. `scripts/verify/detail-v2-skill-directive-sync-check.mjs`（新增）：P1 一致性门禁 35 项。
5. `scripts/verify/run-all.mjs`（+5）：双数组注册新门禁。

Commit：
- （提交后回填）
- 基线：`d03b8a1`（专业升级）、`9e9a735`（状态同步）。

---

# 交付 7：仍未完成事项及真实模型验收边界

1. **无 API KEY，G4/G5 未验证**：请求体已抓取并确认三概念进入，但模型是否据此产出更优策划/视觉、QC 质量、出图质量——待验证、不标通过、不用 Mock。
2. **两阶段方案未回灌 activeIds 给规划模型**：意在避免循环依赖与第二次模型调用；代价是规划模型不知道判定结果，只在编译侧生效。若产品要求"AI 感知技能状态后重规划"，需新增第二次调用，与单 Planner 契约冲突，须 Owner 裁决。
3. **product-specialty-expression / ecommerce-copy-layout 的独立生成指令**：当前前者无生成指令（trace 记 false），后者由既有文案槽承载；未为它们新增独立指令行，避免重复注入。若需独立专项文案，属能力扩展，未在本轮范围。
4. **SKILL.md ↔ directive 物理分离仍在**：靠门禁覆盖关键锚点防漂移，未做构建期代码生成（不改部署架构）。
5. **未纳入（按任务书第九节）**：图片视觉理解模型调用、AI 自主屏数、新 Agent/Planner、换模型/Provider、重写八项 Skill、重做前端、自动学习系统——均未触碰。
6. 本轮不重开 QC 架构、不改用户屏数/板块/排序、不加商品专属硬编码。

**本次任务到报告与提交为止，停止，不自行进入新的架构升级或新增模型能力。**
