# JY-Canvas 阶段 A · 现有架构与目标架构差异报告

> 日期：2026-11-21　基线：HEAD `852a952`。性质：依据《JY-Canvas 一键详情创作整体架构设计 V1.0》阶段 A 的**只读取证**——未改任何代码/配置/Skill/Agent/行业包/测试/门禁/状态文件，未提交 commit，未调真实模型。
> 证据口径：**[事实]** 源码 + 只读内存探针（node -e）可复现；**[未验证]** 无 KEY/真实请求体/图片，无法证明；所有结论不把"代码存在/规则注入/测试通过"等同于模型执行或图片质量。

---

## 一、取证范围与主链路
- 规划调用：`detail.routes.js:62-110` → `createDetailAiPlan` → `detail-ai.js:137-333`（outputSchema :221-307）。
- 屏级编译：`detail-middleware.js:1247-1744` `buildDetailPromptGroup`，最终 text :1558-1585。
- **并行链路**：`server/features/detail-studio/planning/*`（analyze-strategy / director-visual / qc-review / compile-screen）走独立 `/api/detail-studio/*` 路由，与主链 `detail-middleware.js` **几乎无引用**——目标架构部分能力已存在但**未被一键详情主链使用**（关键发现）。

## 二、七层逐层差异总表
| 层 | 目标能力 | 现状（事实） | 差异类型 | 可复用资产 |
|---|---|---|---|---|
| L1 参数契约 | 四类参数+优先级+七层闭环状态 | 参数进 params/globalLock，无集中分类/优先级/闭环追踪；文案/反转屏有缺口 | **缺机制** | 参数字段已贯通前端→后台（见 P2-0.5 补充表） |
| L2 商品事实 | 五类信息分离+ProductBrief | 仅 `confirmedFacts` 单一概念，facts[].level 全局；AI 推断/行业知识/竞品/评价无结构化区分 | **缺结构** | confirmedFactsForBoundary :1281、checkSellingPointBoundary |
| L3 行业/平台策略 | 单一决策、按品类差异化 | 两套决策器并存（主链 resolveIndustryDecision、studio getIndustryStrategy）；规划 text 全量注入 9 行业底座；平台模块生产零消费 | **口径未统一** | confidence→3档 level 门控、P1-6 跨行业收敛、PLATFORM_SKILLS 11套 |
| L4 分屏规划 | ScreenPlan 14字段+每屏独立任务+去重 | 14 字段仅 copywriting 完整、moduleId 语义降级、productRole 假字段、其余 10 缺失；role/narrative/dedupLog 零消费；index%len 重复；AI 缺屏静默补齐 | **大面积缺** | copywriting/moduleId/composition/modelPolicyHint 落点、cognitionGoal 去重 |
| L5 视觉导演 | 产品角色≠视觉主体、每屏导演、人物/手部/模特三类 | 角色四定义但 AI productRole 不可达、Absent 不可达；人物/手部/模特合并单一信号；光线写死 V1_LIGHT_LINE；context_assembly 抽象套话 | **部分有/部分缺** | PRODUCT_DISPLAY_ROLES/roleClause、buildScreenVisual、studio director-visual（未接入） |
| L6 Skill编译 | 职责分离、忠实编译、CTA治理 | 8 directive 摘要全量注入与激活无关、SKILL.md 全文不进模型；compileWithAuthorization 仅保护人物行；模型 promptDirectives 未授权过滤；CTA 无门禁 | **机制弱** | 17槽位编译、五态审计、P1-5 注入治理、用户覆盖保存链 |
| L7 生图与验证 | 逐屏请求追踪+基础/质量双层验证 | 请求体构造正确（form.set prompt/model/ratio/imageSize）；但日志只记 prompt 长度不记文本，无法回溯每屏实际 prompt；无图片质量验证；QC 当前仅触发可选 | **追踪缺口** | 请求构造链、generation.jsonl 事件流水、studio qc-review（未接入） |

## 三、各层关键差异证据（要点）
### L1 参数契约
- [事实] 前端→后台字段贯通（P2-0.5 补充报告已逐项验证 13 项）；但**无参数七层闭环状态结构**（grep closureStatus/paramTrace 零命中）、**无集中优先级定义**。
- [事实] 参数缺口两项：`copywriting=need` 本地兜底无逐屏文案行；`reverseScreens=2` 在 v2Planning 路径被完全绕过（painReverse 是既有功能，保留，只解决接入）。
- [事实] 确认参数"进 params ≠ 生效"：比例/分辨率/字体/丰富度进的是 globalLock 全局规则，不是分屏任务层。

### L2 商品事实
- [事实] `confirmedFacts`（:957/1281）来自 aiPlan.planning.facts，按 level 过滤；卖点边界校验（:1449）与画面事实（:1464）消费它。
- [事实] 无"行业通用知识/竞品/真实评价/AI 推断"的结构化区分字段——目标方案要求五类分离，现状只有"已确认事实 + 全局 facts"两类。

### L3 行业与平台
- [事实] 平台 8 字段进规划 text、4 字段进生图 text；`prompts/detail-studio/platform/index.js` 的 `resolvePlatformProfile` 生产零消费（仅被门禁引用）——两套平台决策器并存。
- [事实] `compactSkillPack` 的 `industryCandidates`（detail-ai.js:89-97）一次性注入全部 9 行业底座规则，只标 seedIndustry——规划模型看到"全行业清单"而非差异化策略。这是"品类不驱动差异化"的代码级根因。
- [事实] confidence→full/parent/generic 三档真实门控（applyConfidenceToRules:445-511 + applyIndustryResolution:389-422）；但 coverage/outputRequirements 仅本地兜底路径生效，AI 有规划时失效。
- [事实] P1-6 跨行业冲突保护已生效（checkIndustryPollution + filterSubCategorySignalsByRange + 高置信收敛 generic/medium）。

### L4 分屏规划（最大缺口）
- [事实] ScreenPlan 14 字段核对结果：完整且有消费者 1（copywriting）、部分 2（moduleId 语义降级、composition 单串）、假字段 1（productRole 因 outputSchema/normalizeAiScreens 均未定义/提取，AI 给值恒被本地兜底覆盖）、完全缺失 10（含 consumerQuestion/primarySubject/reversalTask/comparisonTask/uniquenessCheck——uniquenessCheck 全代码库零命中）。
- [事实] 差分探针：改 `screenRoles[].role`/`narrative`/`dedupLog` → 生图 text 完全一致（零消费）；改 `sectionRefs` → moduleKey 真实变化。契约 required ≠ 运行时消费。
- [事实] 重复：`sellingList[index%len]`（:1443）+ selectedSections 取模（:1351/1392）；AI 路径无去重。AI 只给 1 屏但 count=4 时 `minimalScreenPlaceholder` 静默补齐、planningConflict=null、4 屏 shouldGenerate 全 true——**AI 缺屏不 fail-fast**（与本地兜底的 fail-fast 不一致）。

### L5 视觉导演
- [事实] `deriveProductDisplayRole`（detail-middleware.js:301-309）本地按 taskCategory 推导 Detail/Contextual/Primary/Secondary；`PRODUCT_DISPLAY_ROLES` 五值含 Absent，但 derive 函数无路径返回 Absent（定义了不可达）。
- [事实] AI productRole 不可达（outputSchema/normalize 都无该字段，:1470 恒取本地兜底）；人物信号只有 `FIGURE_POSITIVE_PATTERN` 一个正则，把模特/真人/手部/穿着合并为一类，派生统一三键、唯一 `【模特与镜头】` 槽——**三类视觉资源无区分**。
- [事实] 全局 productAuthenticityLock（:896-907）进的是真实性约束，**不压制每屏主体**；主体由 roleClause 独立承担。"全局锁压制主体"不成立。
- [事实] `context_assembly` 是抽象骨架句，"isTemplateFallback" 恒 false（skill-activation.js:492/512）；无风格包时光线整行写死 V1_LIGHT_LINE（:1578-1580）。
- [事实] studio 已有独立 `director-visual.js` 每屏视觉导演，主链未引用。

### L6 Skill 与编译
- [事实] 8 句 directive 由注册表全量注入 instruction（detail-ai.js:188-192），与 evaluateAllActivations 激活结果无关（激活只在编译层 :1515）；SKILL.md 全文从不读（esbuild bundle）。
- [事实] `compileWithAuthorization` 生产只构造 1 类 entry（人物行，:1121-1131）、只排除 detail-quality-control；其余 Skill 由固定 17 槽承载，不经授权编译；`aiScreen.promptDirectives` 直接进【模块指令】仅 uniqueList 去重（:1529-1534）。
- [事实] CTA："立即选购"全仓代码/配置零命中，conversionClose 模块仅"温和行动引导"——模型自生成、服务端无 CTA 门禁（按顾问原则，不静态认定为模型自生成，须逐层定位）。
- [事实] "显示=发送=保存"同一 prompt.text state 字段（DetailView.jsx:508-511 / detail-state.js:496/520）成立；显示框可编辑，改后发送保存的是改后文本。

### L7 生图与验证
- [事实] 每屏一次 `/api/images`：FormData `prompt=prompt.text`、model/channelId/aspectRatio=params.ratio/imageSize/n + 附件（detail-state.js:489-508）；服务端 normalizeImageRequest 强校验、按模型收敛参数、prompt 截断（images.routes.js:134-178）；上游 body 由 variant.createBody 生成。
- [事实] 三类日志均**不记 prompt 原文**：generation.jsonl 只记 promptChars/Bytes 等长度；tasks/<日期>/<requestId>.txt 只有"提示词长度 N 字"；asset-errors.jsonl 只记图片代理错误。**无法回溯某一屏实际发送的 prompt 文本**。
- [事实] 无出图后图片质量自动/门禁校验；【画面自检】只是一句文本槽。QC 当前仅 `qc_requested` 触发信号 + checklist 隔离（输出不消费、不进生图），studio 才有独立审查编排（未接入主链）。

## 四、断点清单（按目标七层闭环）
| # | 断点 | 影响层 | 证据 |
|---|---|---|---|
| B1 | 参数无七层闭环状态、无集中优先级 | L1 | grep 零命中 |
| B2 | 五类商品信息未分离，只有 confirmedFacts | L2 | :957/:1281 |
| B3 | 两套行业/平台决策器并存、规划全行业规则注入 | L3 | detail-ai.js:69/89-97、studio 模块零消费 |
| B4 | coverage/outputRequirements 仅本地兜底生效 | L3 | :1376-1380 |
| B5 | ScreenPlan 14 字段 10 缺失、3 零消费字段 | L4 | outputSchema :272-292、UNCONSUMED_FIELDS :1190 |
| B6 | 分屏重复（index%len）、AI 缺屏不 fail-fast | L4 | :1443、minimalScreenPlaceholder :592-609 |
| B7 | AI productRole 不可达、Absent 不可达、人物三类合一 | L5 | :611-634、FIGURE_POSITIVE_PATTERN :1011 |
| B8 | 视觉导演/光线写死、context_assembly 抽象套话 | L5 | :1578-1580、skill-activation.js:486-512 |
| B9 | directive 全量注入与激活无关、编译授权只护人物行 | L6 | detail-ai.js:188-192、:1115-1174 |
| B10 | 无 CTA 门禁、日志不记 prompt 文本、无图片质量验证 | L6/L7 | 全仓 grep、generation-logger.js:73-83 |

## 五、应保留、不得推翻的现有能力
1. P1 全部治理：行业单一决策链与置信度降级、字段真实消费、子类目继承与单信号降级、五态审计契约、双路径注入治理、跨行业冲突保护（父行业+子类目）。
2. 行业包/平台策略资产：professional-content-v1.json、PLATFORM_SKILLS 11 套、SCREEN_MODULES 模块库、8 个 SKILL.md 正文。
3. 商品真实性锁 productAuthenticityLock（:896-907）与"显示=发送=保存"一致性链。
4. 本地兜底 fail-fast（checkPlanningIntegrity:311-330、planningConflict）——**需扩展到 AI 缺屏场景**，不是删除。
5. 请求构造与参数归一化（normalizeImageRequest 强校验）、generation.jsonl 事件流水、QC 独立可选原则。
6. 现有门禁与回归体系（控制链/planning/assets/全量/build）。
- [事实] studio 已有 director-visual / qc-review / compile-screen 编排——**目标能力部分已存在**，建议复用/接入，而非重造。

## 六、阶段 B–G 依赖关系与建议顺序（差异报告视角，不含实施授权）
| 阶段 | 前置依赖 | 对应断点 | 风险 |
|---|---|---|---|
| B 参数契约 | 无（可先做） | B1/B2 | 参数语义统一需顾问确认优先级 |
| C 分屏策划+模特动态 | B 的 ScreenPlan 契约 | B5/B6/B7 | 取消前 N 屏硬编码需新策划规则，P1-4 五态语义不动 |
| D 视觉导演 | C 的 primarySubject/productRole 字段 | B7/B8 | 需复用 studio director-visual，避免两套导演 |
| E 专业内容与对比 | C/D 的结构 | B4（行业字段进 AI 路径） | 对比证据门槛需行业包配合 |
| F 编译器与执行闭环 | B–E 的结构化输出 | B9/B10 | CTA/逐屏 prompt 追踪需新日志字段 |
| G 跨行业真实验收 | 全部 + KEY + 真实案例 | 全部验证 | 需单独授权与预算 |

## 七、未验证事项与证据边界
1. 所有"目标能力是否更优"的判断（studio 视觉导演、QC、新四字段行业策略）均 **[未验证]**——需 KEY + 真实案例，不因主链未接入就判定设计失败。
2. 未抓真实 `/api/images` 请求体、未出图、未读真实模型响应；"立即选购"按顾问原则须逐层定位，本报告只记录"代码零命中"。
3. 主链与 studio 两套编排的取舍需顾问决策——本报告只列差异不提合并方案。
4. 本报告全部为源码 + 只读探针，不虚构成功案例。

**停止点**：阶段 A 差异报告完成，交顾问审查；未改任何文件、未提交 commit、未启动阶段 B 或任何实施。
