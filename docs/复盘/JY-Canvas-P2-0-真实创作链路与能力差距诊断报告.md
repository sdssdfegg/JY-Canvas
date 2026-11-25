# JY-Canvas P2-0 · 真实创作链路与能力差距诊断报告

> 日期：2026-11-21　基线：HEAD `c03ebaa`（P1-6 已关闭）。性质：**只读取证、现状诊断、P2 规划输入**——未改任何代码/配置/Skill/Agent/行业包/测试/门禁/状态文档，未提交 commit，未启动 P2-1/P2-2。
> 🔴 全文区分 **[事实]**（源码/只读探针可复现）、**[推断]**（基于事实的分析判断）、**[建议]**（P2 候选，非承诺）、**[未验证]**（本环境无法证明）。**无 API KEY**（四个 KEY 环境变量均 false），未调真实模型、未抓真实 `/api/images` HTTP 请求体、未出图；不把代码存在/规则注入/测试通过表述成模型实际执行成功。

---

## 1. 当前系统实际架构和创作链路
**[事实]** 完整链路：
```
UI 输入(productName/productFeature/userInstruction/sellingPoints+图片)
 → POST /api/detail-prompts (detail.routes.js:46)
 → 有 apiKey 才 createDetailAiPlan (:58,62-69) → buildDetailChatBody → buildDetailAnalysisContent (detail-ai.js:137-333)
     instruction 注入: skillModuleV2.directives/constraints(:188-189) + 8条 V2_REGISTERED_SKILLS directive(:191) + 4条校准(:192)
     + JSON.stringify(textPayload)(:310-315) 作为 user content
 → aiPlan.plan 返回 → buildDetailPromptGroupV2 → buildDetailPromptGroup (middleware:1247+)
     行业识别(resolveIndustryDecision) → P1-6冲突保护 → 子目(可选) → activate/compile → 17槽位 text
 → POST /api/images：detail-state.js:496 form.set("prompt", prompt.text)（只转发 text）
 → 结果回传前端
```
**[事实]** 一键详情链路**无 Agent/Executor 运行时**：`V2-ARCH-002:19-21` 明确"单次模型调用、不建多 Agent 运行时"；`V2-AGENT-EXECUTION-CLOSURE` 是编译闭包标签非执行器；无 tool_calls/Agent 循环。仓库别处有 `server/ai-canvas-agent.js`（无限画布），本链路未引用。本质是 **prompt 规则 + 确定性编译器**。

## 2. 各模块现有能力及真实证据

### 2.1 商品理解与事实边界
**[事实]** 结构化事实解析（parseStructuredFacts:91-112）、AI facts 的 visible 过滤、confirmedFactsForBoundary(:1281-1284) 驱动卖点边界校验(checkSellingPointBoundary)。清洗剂探针：成分"阴离子表面活性剂"、适用范围"羽绒服/窗帘/沙发"真实进入 `【本屏卖点】`；productAuthenticityLock 原句（"商品图是唯一商品事实来源，不得擅自改变颜色/结构/材质/五金/logo/纹理/比例/关键细节…"）真实进入每屏 `【全局一致性锁定】`。
**[事实-缺口]** 同一样本 `使用方法：按压海绵头刷洗…` **未进入 text**（细分任务数超 count，`slice(0,targetCount)`:277 截断）。不是虚构，是丢失。
**[未验证]** 行业通用知识是否会被模型误写成商品事实——服务端有边界校验，但模型实际输出未验证（无 KEY）。

### 2.2 行业包与子类目策略
**[事实]** P1-1/P1-2/P1-3 已使行业包字段真实消费：coverage/outputRequirements 经 applyCoverageToTasks/applyOutputRequirements 改屏任务(:1314-1316)、置信度决定 level 门控专属规则加载(middleware:400)、子类目 laundryStain 继承 cleaning。P1-6 冲突保护覆盖父行业与子类目。
**[事实]** probe 显示行业包实际改变 text（cleaning 的 analyzeAttributes/taboos、coverage 行进入 globalLock/画面任务）。
**[推断]** 行业策略"是否改变创作质量"仍不可判定——改变的是规则文本，模型是否因此产出更专业内容未验证。

### 2.3 详情结构规划（本次重点）
**[事实]** 规划态：`aiPlan.screens[i]` 的 screen 号定序（normalizeAiScreens:615）、moduleId/title/sellingPoint/composition 直接决定屏结构；`planning.screenRoles[].role` 赋值为零消费（仅 sectionRefs 在 moduleId 空时生效）。
**[事实]** 本地兜底：buildLocalScreenTasks/expandLocalTasksForFixed 按**结构化事实维度**（成分/适用/用法）拆任务，**品类词本身不驱动差异化结构**——四品类（cleaning/laundryStain/apparel/generic）标题全为"第N屏"，模块序列差异来自 productFeature 事实维度而非品类。
**[事实-问题]** `sellingList[index % len]`(:1443) 造成卖点交替重复（2卖点8屏真实复现 s2/s4/s6/s8="便携防漏"、s3/s5/s7="保温12小时"）；leftover 分支（"补充信息：…"）在 cleaning 9屏样本中 s7/s8/s9 完全相同 → **重复卖点+重复画面+无意义分屏真实存在**。
**[事实]** 规划态标题缺失退化为"第N屏"（无差异化）；兼容态（selectedSections）仍按 `selectedSections[index%len]` 轮转板块标题与模块（A/B/C/A/B/C 真实复现）。
**[事实]** 资料不足：规划态 fail-fast（checkPlanningIntegrity:313-330，仅商品名→prompts=[]、planningError）；兼容态仅商品名仍产出6屏同构"核心卖点"屏（有结构字段无真实差异化）。

### 2.4 Skill / Agent 五层消费（严格区分）
**[事实]** 五层现状：
| 层次 | 现状 |
|---|---|
| 文件存在 | 注册表8个 SKILL.md 均真实存在、有正文（43-87行） |
| 规则加载 | 运行时**从不读 SKILL.md**；只读 professional-skills-v1.json（skill-activation.js:170）；detail-ai.js:19-23 明确因 esbuild bundle 无法读 md |
| 进模型请求 | 进的是 8 句 directive 摘要（V2_SKILL_DIRECTIVES:24-33）+ skillModuleV2 共 4 条 + 4 条校准；**8条 directive 全量注入，与激活结果无关**（激活判定只在编译层 :1515 调用）；条件 Skill 未触发但其 directive 仍进模型 |
| 模型遵循 | **[未验证]** 无 KEY；生命周期明示"不观测模型内部遵循度" |
| 下游使用 | [事实] 仅 figure/model-pose 经 compileWithAuthorization 进【模特与镜头】、ecommerce-copy-layout 经【本屏文案】槽、visual 经 buildScreenVisual；其余 Skill 的 `generation_instruction` 字段**未被编译器读取**，由固定17槽位承载；模型输出的 `screen.promptDirectives` 直接进【模块指令】**未经授权过滤**（仅 uniqueList 去重） |
**[事实]** 本地兜底真实组五态：7 个 activated 但 execution=not_dispatched、output=invalid、downstream=not_consumed、injection 全 not_required——因五态 output 跟踪的是 `aiPlan.*` 字段（SKILL_OUTPUT_MAP），无 aiPlan 时字段 undefined；**text 仍由确定性兜底真实产出**。即五态 output/downstream 不代表"text 是否有用内容"。
**[事实]** execution_modes 无 inactive 配置、无 disabled 字段；SKILL.md 全文在当前设计下不可测其约束力。

### 2.5 最终提示词
**[事实]** 清洗剂4屏 text：成分/适用真实传递、真实性锁明确；但每屏【画面任务】是内容规则（"建立认知""不把成分清单当首屏卖点""商品在合理使用场景中出现"）**不是可执行画面**（无主体位置/道具/台面/镜头/光影）；【模块指令】固定模块句；【构图与光线】写死 V1_LIGHT_LINE。
**[事实]** 本地兜底 4 屏**全部无【本屏文案】**（aiScreen=null）；sellingForPrompt 是"标签：资料原文"式复述，无消费者利益转译。
**[事实]** buildScreenVisual 三分支探针：真实长 composition→具体画面（`ai_composition`）；模板短句/空 composition→`context_assembly` 产出"围绕「X」任务组织画面；本屏信息目标：…；场景、主体与文字关系须服务本屏任务…"抽象骨架（具体信息仅来自 confirmedFacts/DNA）；全空→null。**`isTemplateFallback` 恒为 false**（:492/:512）——字段存在但从未标记回退。
**[事实-结构]** 本地兜底4屏 `visualSource` 全为 `ai_composition`：传入的是 localTask.compositionHint（内容提示句，长度≥12 且不命中模板正则），**误入 ai_composition 分支**，context_assembly 在真实兜底组一次都没触发。

### 2.6 图像生成与运行链路
**[事实]** 代码层只转发 `prompt.text`（detail-state.js:496）；无重复拼接（P1-5 阶段C已确认）。
**[事实]** `logs/generation.jsonl` 有 7335 行历史记录，含 `/api/images` + "一键详情" + "detail-screen-9"（最近 2026-11-20 15:44），证明**曾发生真实请求与展示事件**；但其字段为 time/requestId/stage/event/method/durationMs/detail，**是客户端事件日志，不含 HTTP 请求体、模型响应或图片质量的证据**。
**[未验证]** 真实 `/api/images` 请求体内容、实际附件、模型调用、出图质量——均无证据，不得写成已通过。

## 3. 已发现问题及证据（按根因归并）
| 根因 | 表征（同一根因不拆多任务） | 证据 |
|---|---|---|
| **R1 无真实模型验收条件** | 模型遵循 Skill、composition 具体性、文案营销价值、图片质量全部无法判断 | 四 KEY 均 false；无 /api/images 请求体；生命周期明示不观测遵循度 |
| **R2 本地兜底是确定性拼装，不承担创作质量** | 重复卖点(index%len)、leftover无意义分屏、无文案行、画面抽象套话、品类不差异化、模板标题轮转 | 探针6/7/9/5 + 2.3/2.5 各条 |
| **R3 规则层与创作层脱节** | SKILL.md 全文不进模型、directive 全量注入不看激活、generation_instruction 未被编译读取、promptDirectives 未授权过滤 | 2.4 五层表 |
| **R4 数据契约字段承诺未兑现** | screenRoles.role 零消费、isTemplateFallback 恒 false、planning.narrative/dedupLog 零消费、使用方法被 slice 截断 | 2.1/2.3/2.5 |
| **R5 五态语义与"内容质量"不同轨** | 本地兜底 output=invalid 但 text 真实产出；injectedIds==activeIds 不代表真实注入 | 2.4 五态组 |

## 4. 只有设计、尚未验证的能力
**[未验证清单]** ①模型是否遵循8条directive/Skill规则；②真实模型 composition 是否具体可执行；③真实模型 copywriting/sellingPoint 的营销价值；④真实 /api/images 请求体与附件；⑤出图后商品真实性/外观结构；⑥多图输入下的分屏主体漂移；⑦前端对 isEmptyScreen/shouldGenerate/planningConflict 的跳过逻辑；⑧selectedSections.order 对模型顺序的真实影响。以上均需 KEY + 真实商品案例，**不能因未验证就判定设计失败**。

## 5. 影响最终生成质量的关键瓶颈
**[推断]** 首要瓶颈是 **R1**：没有真实模型与图片验收闭环，"质量"无法度量，任何以质量为目标的设计都无法证伪。其次是 **R2+R3**：当前 non-AI 路径生产的是"结构正确的规则拼装文本"而非"专业创作"，且规则资产（SKILL.md）与模型输入之间只隔一句摘要——即使模型质量提升，规则约束的传递效率也可能成为天花板。R4/R5 是观测与契约层面的次生问题。

## 6. 问题依赖关系
**[推断]** R1 是元瓶颈（决定 R2/R3 的改进能否被验证）；R2 内部各表征同源于"本地兜底=确定性拼装"，应作为一个任务而非多个；R3 承接 P1 已建立的规则资产与"模型真正执行"之间的断层，依赖 R1 才能验证；R4 是 R2/R3 的契约残留，可独立修但优先级低；R5 是 P1-4 五态的语义边界，不应为质量目标而改其契约（P1 已关闭）。

## 7. 候选改进事项（按影响/频率/成本排序）
| 优先级 | 候选 | 预期收益 | 风险 | 涉及模块 | 建议验收 |
|---|---|---|---|---|---|
| P0（前置） | 建立真实模型/图片验收闭环（KEY+真实商品案例+质量判据） | 使所有质量改进可证伪 | 需 KEY 与案例成本；无代码风险 | 测试/流程（非业务码） | 真实请求体抓取+生成图人工/规则评估 |
| P1 | 本地兜底去重复：index%len 卖点分配 + leftover 无意义分屏 | 消除真实存在的重复卖点/画面 | 改屏结构可能影响既有门禁 | detail-middleware 任务拆分 | 多屏探针去重断言+质量回归 |
| P2 | 规则传递效率：评估 SKILL.md 摘要 directive 是否足够，或增加关键规则的编译层注入 | 让已建规则资产真正影响创作 | 增 token、可能触发 P1 重复注入治理 | detail-ai/middleware | A/B 行为对照+真实模型遵循验证 |
| P3 | 本地兜底画面/文案可执行性提升 | 画面从抽象套话变可执行 | 需专业视觉策划输入，避免模板化回潮 | buildScreenVisual/模块库 | 真实出图质量对照 |
| P4 | 契约字段清理（role/isTemplateFallback/narrative/dedupLog/使用方法截断） | 减少承诺与实现落差 | 涉及 P1 已验收语义，需谨慎 | middleware/索引 | 字段消费审计 |

## 8. 应保留、不因新方案推翻的现有能力
**[事实/建议]** 必须保留：P1-1 行业单一决策链与置信度降级、P1-2 字段真实消费与事实边界（checkSellingPointBoundary 配置驱动）、P1-3 子类目继承与单信号降级、P1-4 五态审计契约（语义边界不动）、P1-5 双路径治理与注入最终效果断言、P1-6 跨行业冲突保护（父行业+子类目）、productAuthenticityLock 真实性锁、规划态 fail-fast 防空洞详情、全门禁回归体系。这些是"规则与治理体系已建立"的成果，P2 应在其上增量，不重建。

## 9. 需要用户提供真实案例才能继续判断的事项
**[未验证/需案例]** ①带真实 KEY 的清洁剂/衣物去渍/非清洁剂/普通商品各1例，含多图，用于判断模型遵循与文案质量；②对应真实 `/api/images` 请求体与生成图，用于判断事实保真与画面可执行性；③若可提供"人工认为专业"的参考详情，用于建立质量判据基准。无这些案例，P2 质量类目标只能停留在工程验证层。

## 10. P2 阶段规划建议（区分事实/推断/建议）
- **[事实]** P1 六项全绿已满足立 P2 准入门槛；P2 未授权启动。
- **[推断]** 直接开发 P2-1/P2-2（五档筛选/成分筛选/三组对比，规划README:110）前，若无 R1 验收闭环，新增能力同样无法验证质量。
- **[建议]** P2 就绪度分两步：先补 R1（真实验收闭环，可用用户提供案例），再按第 7 节 P1/P2 顺序推进；P3/P4 视验收结果决定是否纳入。此为规划建议，非开发授权。

**停止点**：本报告为 P2-0 只读取证诊断，交顾问审查；未改任何文件、未提交 commit、未启动 P2-1/P2-2、未宣布任何新阶段。等待顾问下一步指令。
