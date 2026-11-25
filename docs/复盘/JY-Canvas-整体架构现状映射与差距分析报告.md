# JY-Canvas 整体架构现状映射与差距分析报告

> 日期：2026-11-21　基线：HEAD `852a9520c8c5acec748744cbbea085062b29f632`（工作区干净，关键代码锚点已复核）。性质：**架构核对，不是代码实施**——未改任何代码/配置/Agent/Skill/行业包/测试/门禁/状态文件，未提交 commit，未启动真实模型调用。
> 依据：《JY-Canvas 一键详情创作整体架构设计 V1.0》七层架构；参考 P2-0、P2-0.5 及阶段 A 差异报告（结论已核对仍与当前 HEAD 一致，本轮只补取证未重复取证）。
> 证据口径：**[源码]** 结构/常量存在；**[调用]** 有真实 import/调用路径；**[模型收到]** 进入规划请求体；**[图片体现]** 落地为生成图。四层不能互相替代；凡本环境无 KEY/真实请求体/图片处标 **[未验证]**。

---

## 1. 现有系统架构图（实际关系，非目标）

```text
【前端】DetailView.jsx / detail-state.js
  │  FormData: payload(JSON: 商品资料+参数) + productImage/referenceImage 文件
  │  POST /api/detail-prompts (detail.routes.js:46)
  │  POST /api/images 每屏一次 (detail-state.js:489-508 form.set prompt/model/ratio/imageSize + image 附件)
  ▼
【服务端 · 一键详情主链】(detail.routes.js → detail-ai.js → detail-middleware.js)
  ├─ detail-ai.js:354 createDetailAiPlan
  │    └─ :371 postChatCompletion —— 单次模型调用(渠道×4模式降级重试,非多Agent)
  │       instruction = skillModuleV2.directives/constraints + 8句V2_REGISTERED_SKILLS摘要 + 4校准 (:188-192)
  │       outputSchema = product/planning/screens (:221-307)
  ├─ detail-middleware.js:1247 buildDetailPromptGroup —— 确定性编译(零模型调用)
  │    ├─ 行业链: resolveIndustryDecision → P1-6冲突保护 → resolveSubCategory → applyConfidenceToRules(3档)
  │    ├─ 平台链: getPlatformSkill (PLATFORM_SKILLS 11套)
  │    ├─ Skill激活: evaluateAllActivations (:1515) + deriveXxxTaskContextKeys(按屏派生)
  │    ├─ 授权编译: compileWithAuthorization (:1115-1174, 仅人物行1类entry)
  │    └─ 17槽位 text (:1558-1585)
  └─ 日志: generation.jsonl / tasks/<日期>/<requestId>.txt / asset-errors.jsonl (只记prompt长度,不记原文)
  ▼
【Skill 资产】prompts/server/detail-v2-planning/skills/**/SKILL.md ×8 (策划方法论)
  · 运行时不读md(esbuild bundle) → 只用注册表8句摘要directive注入模型
  · 正式契约 server/detail-v2-control/config/professional-skills-v1.json (10项: 8正式+2 retained)
  · 激活引擎 server/detail-v2-control/skill-activation.js (BASE_ACTIVATION/五态)
  ▼
【行业包/平台包】prompts/server/detail-skills.js
  · INDUSTRY_SKILLS 10+generic (9字段: keywords/analyzeAttributes/sellingAngles/taboos/qcRules…)
  · PLATFORM_SKILLS 11 (8字段: rhythm/copyRule/visualRule/imageNorms/conversionTraits…)
  · 新覆盖层 professional-content-v1.json (decisionLogic/contentPlan/visualExpression…)
```

**并行链路（已存在但主链未用）**：
```text
【detail-studio 工作区】server/features/detail-studio/planning/
  analyze-strategy.js (1次模型调用, 商品分析+策划)
  director-visual.js (1次模型调用, 每屏视觉导演→ScreenSpec[])
  compile-screen.js  (零模型调用, ScreenSpec[]→frozenPrompts)
  qc-review.js       (≤2次模型调用, 独立质量审查)
  端点: /api/detail-studio/projects/:id/planning/* (detail-studio.routes.js:338/397/409)
  ⚠️ detail-ai.js 与 detail.routes.js 均未 import 任何 planning/* —— 两条链路物理隔离
```

**关键结论**：①主链是"**单次模型调用 + 确定性编译**"，无真正多 Agent/工具循环（`tool_calls` 仅在 AI 无限画布 ai-canvas-agent.js，详情链未引用）；②"总策划 Agent"是文档式声明（`prompts/.../agent/planner.md:3` 明示"不接运行时"）；③目标架构的视觉导演/QC 编排**已存在于 studio 但主链未接入**。

---

## 2. 七层架构映射表
| 层 | 目标职责 | 现有实现位置 | 实际运行 | 可保留 | 缺失/不完整 | 建议方向 |
|---|---|---|---|---|---|---|
| L1 参数契约 | 四类分类+优先级+七层闭环状态 | detail-state.js:401-417 / detail.routes.js:51-57 / app-defaults.js:67-92 | 13参数前端→后台贯通；无集中分类/优先级/闭环追踪 | 参数字段、表单链路 | 无参数状态结构、无优先级集中定义；文案/反转屏缺口 | 建参数契约与状态追踪（阶段B） |
| L2 商品事实 | 五类信息分离+ProductBrief | detail-ai.js:226-238 product / :303 planning.facts{claim,level} | 事实按level过滤、供边界校验；无来源字段 | facts三级、uncertainties、needs.evidenceRef | 五类信息未分离；facts无source/evidence | 扩facts溯源字段，五类分类（阶段B） |
| L3 行业/平台 | 单一决策、按品类差异化 | detail-middleware.js:461 等 / detail-skills.js:45-269 / professional-content-v1.json | 三档level门控真实生效；两套决策器并存；规划text全量注入9行业底座 | resolveIndustryDecision、applyConfidenceToRules、P1-6收敛、PLATFORM_SKILLS | 口径未统一；coverage/outputRequirements仅本地兜底生效 | 统一决策入口、行业字段进AI路径（阶段E前） |
| L4 分屏规划 | ScreenPlan 14字段+每屏独立任务+去重 | detail-ai.js:272-292 outputSchema / detail-middleware.js:611-634 normalizeAiScreens | 14字段仅copywriting完整、productRole假字段、10缺失；role/narrative/dedupLog零消费；index%len重复 | copywriting/moduleId/composition落点 | ScreenPlan字段大量缺失、AI缺屏静默补齐不fail-fast、无去重 | 建结构化ScreenPlan（阶段C） |
| L5 视觉导演 | 产品角色≠视觉主体、三类视觉资源 | detail-middleware.js:301-309 deriveProductDisplayRole / skill-activation.js:472-482 roleClause / buildScreenVisual | 本地角色分配真实生效；AI productRole不可达、Absent不可达；三类资源合一；光线写死 | 四角色定义、roleClause、buildScreenVisual、studio director-visual | 缺每屏视觉导演主链接入、AI角色不可达、人物/手部/模特无区分 | 接入studio导演、分离三类资源（阶段D） |
| L6 Skill编译 | 职责分离、忠实编译、CTA治理 | 17槽位:detail-middleware.js:1558-1585 / compileWithAuthorization:1115-1174 / detail-ai.js:188-192 | 8 directive全量注入与激活无关；编译授权仅人物行；模型promptDirectives未授权过滤 | 17槽位、五态审计、P1-5注入治理、显示=发送=保存链 | SKILL.md全文不进模型、编译非全量授权、CTA无门禁 | 编译器忠实性+CTA治理（阶段F） |
| L7 生图与验证 | 逐屏追踪+双层验证 | images.routes.js:134-178 / detail-state.js:489-508 / generation-logger.js | 请求构造完整（model/ratio/imageSize/prompt/附件）；日志只记prompt长度；无图片质量验证 | 请求归一化强校验、日志框架、QC独立可选原则 | 无法回溯每屏实际prompt文本、无图片质量验证、QC仅触发可选 | 补逐屏证据+双层验证（阶段F后） |

> 定位：L1/L2 缺机制、L3 口径未统一、L4 大面积缺、L5 部分有部分缺、L6 机制弱、L7 追踪缺口。

---

## 3. Agent 与 Skill 职责表
### 3.1 Agent
| 名称 | 真实形态 | 职责 | 调用关系 | 判定 |
|---|---|---|---|---|
| 总策划 Agent | **文档式声明**（prompts/server/detail-v2-planning/agent/planner.md:3"不接运行时"） | 单次调用内完成 A–I 九阶段策划方法论 | 无运行时代码，仅契约 | 概念存在、代码不存在 |
| 一键详情主链 | 函数编排（非Agent） | createDetailAiPlan 单次模型调用 + buildDetailPromptGroup 确定性编译 | detail.routes.js:62-110 | 真实运行，无Agent循环 |
| detail-studio planning/* | 4 个独立端点 | 分析/导演/编译/QC 分步 | detail-studio.routes.js:37-40 | 真实存在，主链未用 |
| V2-AGENT-EXECUTION-CLOSURE | 编译闭包标签 | 标记"指令授权编译闭环" | detail-middleware.js:1109/1505/1574 + 门禁 | 治理标签，非执行器 |

### 3.2 八个 SKILL.md 职责（与正式契约不完全对应）
| # | SKILL.md | 职责 | 正式契约 mode | 触发 |
|---|---|---|---|---|
| 1 | product-understanding | 建立商品事实边界（是什么/能确认/不能确认） | mandatory | 无条件 |
| 2 | industry-routing | 行业展示与规则词表同一决策，强特征判据 | mandatory（retained_compat） | 无条件 |
| 3 | consumer-marketing-strategy | 真实信息→消费者价值营销策略（事实→需求→利益→表达） | mandatory | 无条件 |
| 4 | detail-story-planning | 整套详情内容结构、屏级叙事、信息推进顺序 | mandatory | 无条件 |
| 5 | visual-art-direction | 每屏视觉创意方案，内容任务→可执行画面指令 | mandatory | 无条件 |
| 6 | ecommerce-copy-layout | 已确认价值→电商文案，不重新定义价值 | conditional | 屏级 `screen_needs_text` |
| 7 | cross-screen-coherence | 整组一致性+逐屏实质差异（六维去重） | mandatory（retained_compat） | 无条件 |
| 8 | detail-quality-control | 独立质量检查，只诊断不授权修改 | optional | 用户主动 `qc_requested` |

**结构缺口**：8 个 SKILL.md ≠ 正式契约 8 项——professional-skills-v1.json 中 figure-usage-scene / product-specialty-expression 无独立 SKILL.md（映射到 skill-activation.js 能力模块）；industry-routing / cross-screen-coherence 标为 retained_compat。**职责重叠**：cross-screen-coherence 的"六维去重"与 detail-story-planning 的"屏级叙事差异"语义相邻；**职责空缺**：无 Skill 负责"多组前后对比"（V1.0 已确认为缺口）。

### 3.3 行业包与平台策略边界
- INDUSTRY_SKILLS（9 字段）：内容/视觉/禁忌的事实底座。PLATFORM_SKILLS（8 字段）：平台节奏/版式与文案规范。字段仅 `id`、`recommendedScreens↔rhythm` 弱对应，**职责基本分离、局部语义重叠**。
- 风险：旧底座（detail-skills.js）与新覆盖层（professional-content-v1.json 的 decisionLogic 等）并存，规划 text 全量注入 9 行业底座而非差异化策略。

---

## 4. 参数闭环差距表（13 项）
> 六段 = 前端控件 → 提交字段 → 后台接收 → 规划决策 → 分屏任务 → 最终提示词 → 生图请求 → 图片体现。无 KEY/真实请求体/图片处标 **[未验证]**，不用上层通过替代下层。

| 参数 | 前端→后台 | 规划决策 | 分屏任务 | 最终提示词 | 生图请求 | 图片体现 | 已确认问题 |
|---|---|---|---|---|---|---|---|
| 工作流 | ✅ workFlow→skillPack | ✅平台策略 | ✅globalLock | ✅平台规则行 | [未验证] | [未验证] | studio平台模块生产零消费 |
| 图片模型 | ✅ model→params.model | 不适用 | 不适用 | 不进text | [未验证] | [未验证] | 老视图字段model≠studio imageModel |
| 比例 9:16 | ✅ ratio | 部分(globalLock) | 不适用 | ✅text含 | [未验证] | [未验证] | — |
| 分辨率 2K | ✅ imageSize | 部分 | 不适用 | ✅text含 | [未验证] | [未验证] | — |
| 数量 10 | ✅ count(max12) | ✅屏循环 | ✅10屏 | ✅10段text | [未验证] | [未验证] | 10屏重复/无意义分屏(P2-0) |
| 文案 need | ✅ copywriting | ❌本地兜底无aiScreen | ❌无逐屏文案 | ❌无【本屏文案】行 | [未验证] | [未验证] | **已确认缺口** |
| 丰富度 精简 | ✅ richness | 部分(globalLock) | 不适用 | ✅信息密度行 | [未验证] | [未验证] | — |
| 字体 黑体 | ✅ fontStyle | 部分(globalLock) | 不适用 | ✅字体规则行 | [未验证] | [未验证] | — |
| 使用模特 | ✅ modelMode | ✅前N屏授权(与产品要求冲突) | ✅按屏 | ✅2条模特行 | [未验证] | [未验证] | 前N屏硬编码需改策划决定 |
| 特殊姿态 | ✅ modelPose | ✅授权屏约束 | ✅ | ✅广角/动态 | [未验证] | [未验证] | 仅授权屏生效 |
| 使用率 2 | ✅ modelUsage | ❌index<2机械分配 | ✅前2屏 | ✅2条+8禁 | [未验证] | [未验证] | **与产品语义冲突**(顾问原则) |
| 反转屏 2 | ✅ reverseScreens→params | ❌v2Planning绕过 | ❌无反转任务 | ❌无痛点反转 | [未验证] | [未验证] | **保留原功能、解决接入** |
| 语种 中文 | ✅ lang | 部分(globalLock) | 不适用 | ✅输出语言行 | [未验证] | [未验证] | — |

**缺口根因**：参数①②全通过，但③参与规划只覆盖 count/workflow/模特类；⑤提示词层除文案/反转屏均体现；⑥⑦完全无证据——与 P2-0.5 基线一致。

---

## 5. 核心数据契约建议（六契约现状）
| 契约 | 现有载体 | 判定 | 具体建议 |
|---|---|---|---|
| RequestContract | app-defaults.js:67-92 + detail-state.js:401-417 + detail.routes.js:51-57 | **需调整** | 字段齐全可复用；补显式契约版本/字段白名单声明，统一 countMode 前后端口径 |
| ProductBrief | detail-ai.js:226-238 product + :303 facts{claim,level} + schema:223-235 | **需调整** | facts三级可复用；确实缺 `facts[].source/evidence`（相邻 needs.evidenceRef 已有，可参照），补事实溯源 |
| StrategyBrief | detail-ai.js:239-255 marketingStrategy/consumerInsights/industryProfile + schema required | **可复用** | 四层价值链与行业单一决策结构完整，无需重设计 |
| ScreenPlan | detail-ai.js:272-292 screens[] + schema:41-43/154 | **可复用（局部调整）** | 逐屏字段与槽位映射可复用；补 screens[]↔prompts[] 稳定关联ID、attachmentAudit 与日志闭环 |
| PromptArtifact | detail-middleware.js:1592-1646 prompts[] + 授权追踪:1630-1631 | **需调整** | 基础字段+授权追踪可复用；确实缺规则版本、用户覆盖标记、结构化 factRefs |
| GenerationEvidence | generation-logger.js:26-38/249-262（扩展字段已定义）+ detail-state.js:514-529 结果项 | **需调整** | 日志框架与脱敏可复用；主链未写入扩展字段（detail.routes.js:70-91 只写阶段/耗时），需实际写入 prompt_template_version/model_policy_version/retry_count 等 |

> 六个契约均有源码载体，**无整类缺失**；缺口集中在子字段层（事实来源、版本/覆盖标记、证据字段实际写入）。不设计新接口。

---

## 6. 改造优先级（依赖关系，非实施授权）
| 阶段 | 前置 | 对应缺口 | 回归风险 |
|---|---|---|---|
| B 参数契约 | 无 | 参数状态/优先级、五类事实、facts来源 | 参数语义需顾问确认；不动 P1 门禁 |
| C 分屏策划+模特动态 | B 的 ScreenPlan 契约 | ScreenPlan字段、去重、前N屏硬编码 | 取消前N屏需新策划规则；P1-4五态语义不动 |
| D 视觉导演 | C 的 primarySubject/productRole | AI角色不可达、三类资源合一 | 复用studio导演，避免两套导演并存 |
| E 专业内容与对比 | C/D 结构 | 行业字段进AI路径、多组对比 | 对比证据门槛需行业包配合 |
| F 编译器与执行闭环 | B–E 结构化输出 | 编译授权、CTA、逐屏prompt追踪 | CTA/日志字段需新取证能力 |
| G 跨行业真实验收 | 全部 + KEY + 真实案例 | 全部验证 | 需单独授权与预算 |

**依赖要点**：B 是前置（无契约则 C–F 无统一数据）；C 先于 D（导演依赖屏级主体字段）；F 最后（依赖前面结构化输出）；G 必须单独授权。

---

## 7. 旧功能保护清单（改造必须保持）
1. **P1 全部治理**：行业单一决策链与置信度降级、字段真实消费、子类目继承与单信号降级、五态审计契约、双路径注入治理、跨行业冲突保护（父行业+子类目）——回归：控制链 554/554（含 CP/AG）、planning 78/78。
2. **行业包/平台资产**：INDUSTRY_SKILLS/PLATFORM_SKILLS、professional-content-v1.json、SCREEN_MODULES、8 个 SKILL.md 正文与回链 phrase——回归：assets 冻结 failureCount 0、planning-chain。
3. **商品真实性锁 productAuthenticityLock** 与"显示=发送=保存"一致性链——回归：用户覆盖内容原样保存/发送断言。
4. **本地兜底 fail-fast**（checkPlanningIntegrity / planningConflict）——需扩展到 AI 缺屏场景，不删除。
5. **请求构造与参数归一化**（normalizeImageRequest 强校验）、generation.jsonl 事件流水、QC 独立可选原则——回归：全量 run-all 86/86、build、eslint。
6. **detail-studio 已有编排**（director-visual/qc-review/compile-screen）——建议复用接入，不重造、不推翻。

---

## 8. 未验证事项与证据边界
1. 目标能力（studio 导演/QC/新行业字段）是否更优 —— **[未验证]**，需 KEY + 真实案例，不因主链未接入判定设计失败。
2. 未抓真实 `/api/images` 请求体、未出图、未读模型响应；"立即选购"按顾问原则须经规划文案/最终prompt/实际生图请求逐层定位，本报告只记"代码零命中"。
3. 主链与 studio 两套编排取舍需顾问决策——本报告只列差异不提合并方案。
4. 全部结论为源码 + 只读探针，不虚构成功案例；所有参数⑥⑦环节标未验证。

**停止点**：架构映射与差距分析报告完成，交顾问审查；未改任何文件、未提交 commit、未启动阶段 B 或真实模型调用、未自行修复任何缺口。等待下一步授权。
