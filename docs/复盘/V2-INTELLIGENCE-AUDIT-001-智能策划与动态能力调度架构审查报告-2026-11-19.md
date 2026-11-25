# V2 智能策划与动态能力调度架构审查报告

> 任务编号：V2-INTELLIGENCE-AUDIT-001　日期：2026-11-19　性质：**架构审查/真实链路取证，不改业务代码**
> 基线：commit `2d80c03`（核心修复）+ `82c661f`（状态同步）；当前工作区 `82c661f`，`git diff 2d80c03 HEAD` 仅 docs/ 4 行、无 .js/.json 差异 → 审查代码 == 基线代码。
> 证据等级：**已证实**（代码/运行/真实链路测试支撑）｜**部分证实**（局部证据、完整链路未验）｜**待验证**（缺证据）｜**未实现**（代码不存在）。

---

## 0. 专业结论（先给判断）

**判断：C 为主、B 为辅——目前主要依赖规则、词表与本地兜底，尚未形成真正完整的智能策划中枢；已有动态调度的"判定骨架"，但判定与执行断开。**

- 选 C 的核心证据（已证实）：八项 Skill 的 SKILL.md 正文运行时从不读取（只注入人工硬编码的一句话 directive）；`evaluateAllActivations` 的 activeIds 除 model-pose 外**无任何下游消费**；`compileWithAuthorization` 是死代码；本地兜底用 `parseList`/按屏轮流取资料，不是智能规划；屏数完全由用户 count 决定、系统无自主规划屏数。
- 选 B 的辅证：确实存在触发判定框架（16 个契约项、8 项 Skill 映射、conditionsMet 四态判定、行业包加载、AI 规划请求含 skillPack），只是判定结果没有真正驱动执行。
- 不是 A：远非"少量实现缺陷"，而是"判定层与执行层结构性断开"。
- **真实智能策划能力（AI 规划模型输出）在环境无 KEY 时无法验证；上述判断针对工程确定性行为，G4 待验证。**

---

## 1. 当前真实架构与调用关系（已证实）
两条链路 + 一个判定层：
- **规划链路**：`routes/detail.routes.js:59-93` → `detail-ai.js buildDetailAnalysisContent`（含 8 句 directive + skillPack）→ `postChatCompletion` → `aiPlan`。
- **编译链路**：`detail-middleware.js buildDetailPromptGroup`（`:704` 起）→ 逐屏 17 槽位拼 `text`（`:983-1010`）→ 返回 group。
- **判定层**：`skill-activation.js evaluateAllActivations`（middleware `:947` 唯一调用）→ `activeIds/injectedIds` → 仅审计（`:1044`）与 model-pose 文案（`:1000/:1050`）。
- 关键断裂：规划链路发生在编译链路**之前**，判定层发生在编译链路**内部**——判定的 activeIds 不回传规划链路，也不驱动编译（除 model-pose）。

## 2. 商品理解链路及数据结构
（部分证实，基于本地兜底路径）
- 结构化解析 `parseStructuredFacts`（middleware `:78-107`）：识别成分/适用范围/使用方法/效果/规格标签，产出 `{category,label,content,source:user_provided,level:visible}`——**这是 P0-1 修复新增**，有来源与等级（已证实）。
- 商品图片：`assetsFromInput` 有 role 字段但仅 product/reference；图片进入 AI 规划请求（`detail-ai.js:200-203` 传 fileMeta），**但本地兜底路径下图片只产出文件名/尺寸的 `imageFacts`，不真正"理解"图片内容**（已证实）；图片视觉识别未接入（`:analysis.limitation` 明示）。
- 统一事实画像：**不存在独立的商品事实画像对象**；结构化事实与 aiPlan.planning.facts 分散在局部变量与审计层（部分证实）。
- 结论：**先理解商品再策划？——否**。本地路径是"从商品资料抽结构化事实→按事实分组分配屏"，没有独立的商品理解→营销→叙事逐层产物；真正的逐层规划只在 AI 规划模型里（无 KEY 未验证，待验证）。

## 3. 智能判断与任务识别机制
（已证实为规则驱动）
- 消费者需求：`inferAudience`（middleware `:265-272`）按关键词正则判断（女装/男装/儿童/行业）。
- 卖点：`buildProductAnalysis:321-325` = 用户卖点 + productFeature 前几条 + 行业 sellingAngles 拼接去重。
- 页面/板块：`getScreenModule`/`SCREEN_MODULES` 按模块名/位置决定（首屏 hero、末屏 conversionClose、中间 coreSellingPoint）。
- 用户板块/屏数：`selectedSections` 只影响模块归类与标题行；屏数完全由 `count` 决定（无"AI 自主决定屏数"的代码，已证实）。
- 谁判断营销价值/独立成屏/信息组合：**本地路径无专门角色**，靠 `buildLocalScreenTasks` 的类别分组（ingredient/scope/usage/effect）+ 按屏顺序分配（已证实）。AI 路径由规划模型负责（待验证）。

## 4. 八项 Skill 实际触发和调度机制（本次核心，已证实）
### 关键区分：注入 / 触发 / 执行是三条断开的链路
| 环节 | 代码 | 真实行为 |
|---|---|---|
| 正文读取 | 全仓 `readFileSync` 仅读 3 个 JSON | **SKILL.md 正文运行时从不读取**（`detail-ai.js:21` 明示 bundle 后无法读 md） |
| 注册 | `detailV2SkillRegistry`（index.js:44-93） | 只注册 id/path/marker/version 元数据；path 指向 md 但无人读 |
| 注入 | `detail-ai.js:177 V2_REGISTERED_SKILLS.map(skill=>skill.directive)` | 8 句**人工硬编码摘录**无条件全量进 AI 规划 prompt，与 activeIds 无关 |
| 触发 | `evaluateAllActivations`（middleware:947） | 产出 activeIds/injectedIds 四态判定 |
| 执行（改 text） | middleware `:983-1010` | **唯一读 activeIds 的是 `model-pose`（:1000/:1050）** |

### 逐项调度真相
- **Mandatory 四项**（product-understanding/consumer-marketing-strategy/detail-story-planning/visual-art-direction）：契约 `activation_conditions=[]` → 恒 active（**不存在 inactive 状态**）；其 active 结果无人消费，**active 与 inactive 时 text 完全一致**（已证实，穷举 grep 无消费点）。它们的价值只体现在"一句 directive 进规划 prompt"和"规划输出字段（screenRoles/globalVisualDNA）被编译消费"——后者是**输出字段消费，不是 activeIds 执行**。
- **Conditional 五项**（ecommerce-copy-layout/figure-usage-scene/product-structure/effect-evidence/ingredient-mechanism 等）：判定存在；仅 `model-pose/figure-usage-scene` 因按屏人物信号真正改变 text（`:1000`），其余（如 ecommerce-copy-layout）**触发后无任何执行代码**（已证实）。
- **Optional**（detail-quality-control）：QC 触发链路已修（qc_requested），但 QC 正文/报告只在审计层，不进生图 text（已证实）。
- **compileWithAuthorization**（skill-activation.js:319-345）：全仓仅定义/导出/import（middleware:30），**运行时零调用**（死代码，已证实）。
- **行业规则**：`detail-ai.js:85-93` 把全部行业候选全量塞进规划 prompt（规划阶段全量，非按行业）；真正影响生图 text 的行业内容来自 G-2 词表/覆盖层，**不是 industry-cleaning 等 active 判定**；`industryPacks` 正式包仅进审计（已证实）。

## 5. 整套详情规划机制
（本地路径已证实 / AI 路径待验证）
- P0-1 修复后：无用户资料→fail-fast（不静默空洞）；有资料→`buildLocalScreenTasks` 按结构化事实分组分配。
- 使用方法整段保留（修复后实测进屏3）；但**本地任务不足 count 时多屏卖点重复**（跨商品测试 B/C 实测：第2-5屏卖点几乎一样）——即"重复表达次要信息"仍存在。
- 屏间推进：本地路径只有 hero→coreSellingPoint×N→conversionClose 的位置式结构，**不是基于商品事实的认知推进**（已证实）。
- AI 路径是否"先完整规划再按屏取舍"：**待验证**（无 KEY）。

## 6. 本地兜底与 AI 规划的职责边界（已证实）
- 判定：`v2Planning = selectedSections===null`，与 `aiPlan` 解耦（已由上一轮修复加 fail-fast 约束）。
- 有 aiPlan：走 AI 规划产物（screenRoles/facts/globalVisualDNA 等）编译。
- 无 aiPlan：走 `buildProductAnalysis` + `buildLocalScreenTasks` 本地规则编译，产出的 promptLayers/v2Control 标注 `controlStatus:engineering_verification_only`。
- **本地兜底成功 ≠ AI 智能规划成功**：本轮所有测试均为 local-rule 模式，不能宣称智能策划已实现。

## 7. 视觉导演与最终提示词编译（部分证实）
- `buildScreenVisual`（skill-activation.js:342-366）：有 AI composition 用之；无则按"模块名+本屏事实+视觉DNA"组装骨架（已证实）。跨商品测试显示各屏画面任务因内容不同而不同（修复后），但第4屏仍骨架式。
- 商品身份保护：`【参考图使用】`（middleware:997 附近）"只吸收场景/构图/配色/版式，不复制其它商品/品牌/人物身份"——**仅文字约束**（已证实，见素材排查报告）。
- 人物/手部：按屏 modelUsage 授权（修复后实测），仅授权屏 active。
- 内部层隔离：`qualityChecklist` 只进审计不进 text（`:1006-1008`）；Skill 正文全文不进 text（已证实）。
- 编译器是否擅加任务：17 槽位由固定字段拼接，未发现凭空新增策划外任务（部分证实）。

## 8. 商品图片及参考素材的模型请求机制（已证实，详见素材排查报告）
- 角色：仅 product/reference 两种，无"姿势参考"角色。
- 模型请求：`channel.js:420-433` 把全部 `image` 文件按序转 image_urls，**referenceMeta 只归档不参与组装** → 角色在模型层被拍平。
- 逐屏附件：detail-main 逐屏过滤（`detail-state.js:447-462`），正常路径空 referenceFileIndexes 不补发图2；detail-studio 整套图传每屏。
- 每屏实际传入模型附件：**无法确认**（无本次 2 图任务日志）；本轮新增的 attachmentAudit 只记"编译层声明"。

## 9. 三种商品跨商品诊断测试（已证实，本地链路）
| 维度 | A 日化清洁剂 | B 服装 T恤 | C 家居保温杯 |
|---|---|---|---|
| 输入 | 成分/适用范围/使用方法 | 材质/版型/颜色/规格/洗涤+use-model usage=2 | 材质/容量/保温/场景 |
| 结构化事实类别 | ingredient/applicableScope/usage（3类） | other/spec（2类，材质版型颜色未识别） | other/spec（2类） |
| 行业识别 | 清洁日化 | 服装鞋包 | 家居百货 |
| 屏数（来自count） | 4 | 5 | 3 |
| 各屏module | hero/core×2/conversion | hero/core×3/conversion | hero/core/conversion |
| 人物active | [F,F,F,F] | [T,T,F,F,F] | [F,F,F] |
| activeIds(屏1) | 四项mandatory+3 retained | 四项+figure/model-pose+3 retained | 四项mandatory+3 retained |
| 卖点重复 | 屏4为整合表达 | **屏2-5几乎相同** | **屏2-3相同** |
| 结论 | 事实分组生效、方法不拆 | 人物按授权触发；卖点重复；材质未结构化 | 行业正确；卖点重复 |

**测试判断**：系统能根据商品事实和行业得出**部分不同**的决策（行业、屏数、人物授权、日化事实分组），但页面结构高度同构（hero/core×N/conversion）、多屏卖点重复、非日化商品结构化识别弱——**未达到"按商品事实形成不同策划"的程度**。

## 10. 已实现 / 部分实现 / 未实现
- **已实现**：商品文字资料结构化解析（部分类别）、行业识别、用户屏数硬约束、按屏人物授权、Skill 判定框架、文案隔离（正文不进 text）、fail-fast。
- **部分实现**：商品事实画像（分散无统一对象）、动态 Skill 调度（判定有、执行无）、视觉导演（有骨架无深度策划）、整套叙事（位置式结构非认知推进）、图片角色（上传分角色、模型层拍平）。
- **未实现**：Skill 正文运行时读取与执行、AI 自主规划屏数、activeIds 驱动生成行为、统一商品事实画像、真正的商品图片理解、每屏实际附件可追溯日志（声明有、真值无）。

## 11. 确定性缺陷 / 潜在风险 / 待验证
- **确定性缺陷**（已证实）：① 八项 Skill activeIds 除 model-pose 外零消费（触发≠执行）；② compileWithAuthorization 死代码；③ SKILL.md 正文运行时不读取；④ 本地兜底多屏卖点重复；⑤ 非日化商品结构化标签覆盖不足；⑥ 图片角色模型层拍平。
- **潜在风险**（部分证实）：Mandatory 恒 active 造成"能力已执行"的错觉；行业候选全量进规划 prompt 可能污染；第4屏骨架式。
- **待验证**（无 KEY）：AI 规划模型的实际输出质量、八句 directive 是否真正约束模型、G4 提示词质量、G5 生图质量、效果扩写（温和/不伤等）。

## 12. 下一阶段建议的最小改造路线（**未实施，待确认**）
- **P0（打通判定→执行）**：为何改——activeIds 不驱动行为使八项 Skill 形同虚设；改什么——让至少 3 个 conditional 能力（文案/专项/质检建议）的 active 结果在编译层有明确消费点（如 active 时注入该能力的执行产物，inactive 不注入），并移除/接上 compileWithAuthorization；影响——detail-middleware 编译段、skill-activation；保持——八项架构、契约判定语义、正文隔离；验收——同输入 active/inactive 时 text 有可预期差异；不需 KEY（工程层）。
- **P1（统一商品事实画像 + 扩展结构化）**：为何改——事实分散、非日化识别弱；改什么——把 parseStructuredFacts 扩展材质/版型/颜色/场景等标签，产出贯穿规划与编译的统一 facts 对象（带 source/level）；影响——buildProductAnalysis/buildLocalScreenTasks/buildScreenVisual；保持——Schema 顶层、buildScreenVisual 接口；验收——三商品结构化类别数提升、卖点重复下降；不需 KEY（工程层）。
- **P2（AI 规划质量闭环）**：为何改——无 KEY 无法验证智能中枢；改什么——用真实 KEY 跑三商品对照，验证 directive 约束、规划字段贯通、效果不扩写；影响——仅测试与配置；保持——不改代码；验收——G4/G5 报告；**需要真实 API Key**。
- 全程不改：用户屏数/板块/排序、八项 Skill 正文与架构、模型调用链、QC 已关闭问题。

## 13. 文件路径、函数、调用位置与证据汇总
| 证据 | 位置 |
|---|---|
| Skill 正文不读取 | `detail-ai.js:20-22` 注释；全仓 readFileSync 仅 3 处 JSON |
| directive 全量注入 | `detail-ai.js:24-41,112-115,173-179` |
| activeIds 唯一执行消费 | `detail-middleware.js:947,948,1000,1050`（只 model-pose） |
| compileWithAuthorization 死代码 | `skill-activation.js:319-345`；`detail-middleware.js:30` 仅 import |
| Mandatory 恒 active | `professional-skills-v1.json:103-142`；`skill-activation.js:242-281` |
| 行业候选全量进规划 | `detail-ai.js:85-93` |
| 行业正式包仅审计 | `detail-middleware.js:606,1099`；`index.js:111-151` |
| qualityChecklist 不进 text | `detail-middleware.js:1006-1008` |
| 图片角色拍平 | `channel.js:420-433`；`images.routes.js:343` |
| 跨商品测试 | 本报告 §9（本地真实链路，2026-11-19 运行） |

**本次任务到报告交付为止，未修改任何业务代码、无新提交。** G4/G5 真实模型质量未验证，不标通过。
