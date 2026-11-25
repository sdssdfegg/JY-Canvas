# 一键详情 V2 · Agent / Skill 原始资料包

> 性质：只读导出。**仅按当前 Git HEAD 逐字提取，未做任何分析、优化、重写或补充。**
> 用途：供外部产品与 AI 架构顾问重新编写一键详情 V2 的专业 Agent / Skill 内容。
> 凡文件不存在、为空或当前未被使用，均在正文对应位置明确标记，不以其它文件冒充。

## 0. 版本信息

| 项目 | 值 |
|---|---|
| 当前分支 | `feature/detail-main-iteration` |
| HEAD commit（完整） | `5274be292cffc16cf77da533025cdfc6032fe82d` |
| HEAD commit（短） | `5274be2` |
| HEAD 提交时间 | 2026-11-17 17:45:51 +0800 |
| HEAD 提交说明 | docs(handoff): 交付 V220 项目现状与架构交接报告（外部顾问专用·只读梳理·零业务代码改动） |
| 导出时间 | 2026-11-17 18:37:02 +0800 |
| 导出时工作区状态 | 干净（无未提交改动） |

## 0.1 文件清单（存在性核对）

| # | 原始路径 | 状态 | 字节 |
|---|---|---|---|
| 1 | `prompts/server/detail-v2-planning/skills/product-understanding/SKILL.md` | 存在 · 非空 | 3223 |
| 2 | `prompts/server/detail-v2-planning/skills/industry-routing/SKILL.md` | 存在 · 非空 | 3417 |
| 3 | `prompts/server/detail-v2-planning/skills/consumer-marketing-strategy/SKILL.md` | 存在 · 非空 | 3284 |
| 4 | `prompts/server/detail-v2-planning/skills/detail-story-planning/SKILL.md` | 存在 · 非空 | 3545 |
| 5 | `prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md` | 存在 · 非空 | 3600 |
| 6 | `prompts/server/detail-v2-planning/skills/ecommerce-copy-layout/SKILL.md` | 存在 · 非空 | 3113 |
| 7 | `prompts/server/detail-v2-planning/skills/cross-screen-coherence/SKILL.md` | 存在 · 非空 | 3225 |
| 8 | `prompts/server/detail-v2-planning/skills/detail-quality-control/SKILL.md` | 存在 · 非空 | 3898 |
| 9 | `prompts/server/detail-v2-planning/agent/planner.md` | 存在 · 非空 | 6251 |
| 10 | `prompts/server/detail-v2-planning/agent/execution-flow.md` | 存在 · 非空 | 3516 |
| 11 | `prompts/server/detail-v2-planning/agent/output-contract.md` | 存在 · 非空 | 3426 |
| 12 | `prompts/server/detail-v2-planning/schemas/planning-result.schema.json` | 存在 · 非空 | 11922 |
| 13 | `prompts/server/detail-v2-planning/schemas/quality-result.schema.json` | 存在 · 非空 | 3898 |
| 14 | `docs/复盘/V4.0-一键详情V2-S2B真机反馈根因定位与S2C拆解-2026-11-17.md` | 存在 · 非空 | 14198 |
| 15 | `server/detail-ai.js`（代码片段） | 存在 · 非空 | 21504 |
| 16 | `server/detail-middleware.js`（代码片段） | 存在 · 非空 | 34705 |

> 说明：本资料包为新生成的导出文件，不属于上述 16 个源文件，也不改变它们的内容。

---

# 一、八个 Skill 文件（完整原文）

## 1.1 `prompts/server/detail-v2-planning/skills/product-understanding/SKILL.md`

```text
# Skill 01 · 商品理解（product-understanding）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.1/§4.2、D-PLAN-12 §2 断言 3、index.js 冻结 directives①。方案原文细节待 Owner 复核。

## 职责
从商品图（唯一必选输入）与可选资料中提取商品事实，并逐条做**事实分级**，为下游行业路由、营销策划、叙事与视觉提供唯一可信的事实底座。商品真实性高于营销创意（V219 §2 五原则）。

## 触发
- 每次策划必经（阶段 A），无板块/有板块均执行。
- 商品资料越不足，越要保守：单张白底图时不得推断材质/使用人群/场景（D-PLAN-11 §5.3，模型保守属合理）。

## 输入
- 商品图（必选）；可选：productName / productFeature / userInstruction / sellingPoints / 行业展示值。
- 现有 `product` 字段语义（`name`/`industryId`/`materials`/`colors`/`structureLocks`/`realSellingPoints`/`riskNotes`/`styleDirection`）。

## 判断方法
每条事实按图片可证性分三级：
- `visible`：图片中直接可见或包装明确标示（如"瓶身标示为血渍清洗剂"）；
- `inferred`：有合理依据但图片不能完全确认（如材质、使用人群），须显式标注推断；
- `mustNotClaim`：图片无法确认且涉及功效/认证/疗效/销量/品牌背书，**禁止作为确定事实输出**。

## 规则
1. 不得虚构材质、参数、认证、疗效、销量、品牌背书（index.js directives①，`productAuthenticityLock` 语义）。
2. 中文标签、商品结构逐字核对，不臆造标签文字（D-PLAN-11 §2.7）。
3. `mustNotClaim` 断言不得进入 `product` 确定事实或 `screens` 卖点（与 `planning.facts` 引用校验联动）。
4. 行业与使用场景分离：衣物血渍清洗剂属日化清洁剂，使用场景"衣物"≠服装行业（V219 §4 案例 A）。
5. 不可确认项写入 `product.uncertainties`，供下游保守表达。

## 输出字段
`product.{name, industryId, industryName, targetAudience, materials, colors, structureLocks, realSellingPoints, riskNotes, styleDirection, uncertainties[]}`；分级事实写入 `planning.facts[{claim, level}]`（level ∈ visible/inferred/mustNotClaim）。

## 边界
本 Skill 只做理解与分级，不做行业规则选择（→ industry-routing）、不做营销转化（→ consumer-marketing-strategy）；不虚构、不替用户补资料；不改运行时代码与 G-2 词表。

## 冲突处理
- 图片与用户资料冲突：以图片可确认事实为准，资料作 `inferred`，冲突点写入 `riskNotes`。
- 资料齐全但图片仅白底：仍按可证性分级，资料标注为外部提供而非图片可见。
- 与旧链路冲突：旧 `product` 字段保留，本 Skill 只增补分级，不改旧字节。

## 测试案例
- 案例 B（资料不足）：单张白底清洗剂图 → 不虚构材质/功效、不强制材质模块，`uncertainties` 非空。
- 案例 A（行业路由）：血渍清洗剂 → 行业=日化清洁剂，不因"衣物"语境词判服装。
- 负向：包装无认证标识却输出"通过 XX 认证" → 必须判 `mustNotClaim` 并拦截。
```


## 1.2 `prompts/server/detail-v2-planning/skills/industry-routing/SKILL.md`

```text
# Skill 02 · 行业路由（industry-routing）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.1/§4.1、D-PLAN-12 §3 问题 1/§4 三项工程项、§5.3 建议 A。方案原文细节待 Owner 复核。

## 职责
判定商品的**展示行业**与**规则词表行业**为同一个决策结果，提供行业强特征识别判据与路由优先级。核心原则（方案转述）："展示行业与专业 Skill 选择必须同一决策结果；一致性由工程代码负责"——本 Skill 给专业判据，一致性校验属工程侧（S2-B 及工程线单）。

## 触发
- 每次策划必经（阶段 B），紧随商品理解之后。
- 商品语境出现跨行业词（如清洗剂含"衣物/面料"）时尤其关键：这是 D-PLAN-11 问题 1（服装规则串入清洗剂）的高发场景。

## 输入
- `product-understanding` 的分级事实（尤其 `industryId`/`realSellingPoints`/`materials`）。
- 行业候选集：apparel / beauty / food / home / electronics / motherBaby / pet / jewelry / sports / generic（现有 10 类）、cleaning（日化清洁剂，V219 §4 六类）。

## 判断方法
1. **强特征词优先**：行业专有的强特征（如"泵头+清洁成分+去渍"→清洁/日化）优先于弱语境词。
2. **弱语境词不越权**："衣物/面料"在清洗剂语境是**使用场景**，不构成服装行业信号（V219 §4 案例 A）。
3. 按商品主功能与品类定行业，不按名词共现计数定行业（D-PLAN-11 §2.1 关键词计数缺陷）。
4. 输出单一 `industryId`，展示值 `industryName` 与之对应；不确定取 `generic` 并记 `uncertainties`。

## 规则
1. 展示行业与规则行业必须取同一 `industryId`；若模型判定与关键词路由不一致，**以商品事实为准**并让工程记录一致性告警（D-PLAN-11 §4.1）。
2. 禁止把清洗剂判为服装、把食品判为美妆等跨品类串规则。
3. 同分/歧义裁决：强特征 > 商品主功能 > 弱语境词 > generic；不得依赖 `Object.values` 枚举顺序（D-PLAN-11 §2.1 同分偏 apparel 缺陷）。
4. 只输出判据与结果，不改 `prompts/server/detail-skills.js` G-2 词表（Owner 裁决⑤：新增覆盖层、不改旧词表）。

## 输出字段
`industryProfile.{industryId, industryName, evidence[], decisionLogic, confidence, uncertaintyNote}`；`evidence` 引用 `product` 已分级事实，不引用 `mustNotClaim`。

## 边界
本 Skill 只做行业判定与判据输出，**不生成行业规则词表、不改 G-2 词表、不做模块选择**；行业一致性校验的机器实现属工程侧（工程线单），本批只落声明。

## 冲突处理
- 模型行业名 vs 关键词路由结果冲突：以商品事实为准取单一 `industryId`，记录 `uncertaintyNote` 交工程一致性校验。
- 场景词 vs 品类词冲突（衣物 vs 清洗剂）：按场景词不越权处理，取日化清洁剂。
- 无法判定：取 `generic`，写入 `product.uncertainties`，不强行归入具体行业。

## 测试案例
- 案例 A（行业路由）：血渍清洗剂（含"衣物血渍"）→ `industryId=cleaning/home`，**不加载服装规则**（不出现版型/袖口/纽扣/模特比例）。
- 负向：仅因文本含"面料"就判 apparel → 判红。
- 正向：服装 T 恤（含版型/模特）→ apparel，规则词表与展示一致。
```


## 1.3 `prompts/server/detail-v2-planning/skills/consumer-marketing-strategy/SKILL.md`

```text
# Skill 03 · 消费者营销策略（consumer-marketing-strategy）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.5/§4.2、D-PLAN-12 §3 问题 5、v1.1 §10.3。方案原文细节待 Owner 复核。

## 职责
把商品事实按"**事实 → 消费者需求 → 利益 → 营销表达**"四层转化，产出消费者洞察与营销策略。消费者利益高于参数罗列（V219 §2 五原则），根治"文案偏商品信息复述、无利益转化"（D-PLAN-11 问题 5）。

## 触发
- 每次策划必经（阶段 C），在商品理解与行业路由之后、叙事规划之前。
- 只有包装参数、无消费者场景素材时（案例 F）尤其要用四层法把参数转成需求与利益，而非空洞罗列。

## 输入
- `product` 分级事实（只用 `visible`/`inferred`，不引用 `mustNotClaim`）；
- `industryProfile`（决定行业禁忌与表达边界）；平台规则、受众、copywriting 档位。

## 判断方法
四层转化逐层推进：
1. **事实**：图片可确认的商品属性（如"按压泵头、局部取用"）；
2. **需求**：该属性对应的消费者真实场景痛点（如"局部污渍需精准处理、不整件浸泡"）；
3. **利益**：解决痛点带来的好处（如"省水省时、减少衣物磨损"）——须可由事实支撑；
4. **营销表达**：面向受众的简短表达句，避免绝对化/医疗化词。
- 每层都不引入图片无证据的新断言；利益与表达可回溯到事实（可追溯性）。

## 规则
1. 禁虚构认证、疗效、销量、绝对化用语（v1.1 禁词表口径、detail-skills 绝对化/医疗化词）；
2. 空洞参数罗列不算营销表达：每个卖点须落到"对消费者有什么好处"；
3. 消费者利益不得越过商品真实性：图片无证据的利益标 `inferred` 或舍弃（与 Skill 01 分级联动）；
4. 表达语气跟随 `copywritingTone`，信息密度跟随 richness 合并档（v1.1 §11）；
5. 分层字段是策划中间产物，遵循 V216 落点口径（不落盘、不进 seed）。

## 输出字段
`consumerInsights.{audience, needs[{need, evidenceRef}]}`；`marketingStrategy.{valueLadder[{fact, need, benefit, expression}], tone, boundaries[]}`；`expression` 不引用 `mustNotClaim` 事实。

## 边界
本 Skill 只做洞察与策略，**不写逐屏标题/版式（→ ecommerce-copy-layout）、不定视觉构图（→ visual-art-direction）、不做行业判定（→ industry-routing）**；不改运行时与词表。

## 冲突处理
- 事实不足以支撑利益：宁可保守表达或舍弃该利益，不虚构（真实性优先）。
- 营销诱感与行业禁忌冲突（如食品疗效暗示）：以行业禁忌与真实性为准，舍弃违规表达。
- 用户已写 sellingPoints 与四层结论冲突：用户确认内容优先，策略结论作为建议、不自动覆盖（决策 #6）。

## 测试案例
- 案例 F（营销表达）：仅有包装参数 → 输出"事实→需求→利益→表达"链，非参数堆砌。
- 案例 B（资料不足）：单图清洗剂 → 不虚构去渍率/销量，利益保守且与"局部取用"事实可回溯。
- 负向：输出"100% 去渍、销量第一" → 判为虚构并拦截。
```


## 1.4 `prompts/server/detail-v2-planning/skills/detail-story-planning/SKILL.md`

```text
# Skill 04 · 详情页叙事规划（detail-story-planning）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.2/§2.3/§4.3、D-PLAN-12 §3 问题 2/3、index.js directives②③④、V219 §2 决策 #2/#3/#4。方案原文细节待 Owner 复核。

## 职责
在用户指定屏数内规划整组叙事线、每屏信息角色与内容任务；首屏默认 hero 但不写死标题与构图；板块是偏好排序而非固定模板。整组叙事高于单屏美观（V219 §2 五原则）。

## 触发
- 每次策划必经（阶段 D）。
- 无板块（selectedSections 空）时必须自主规划；有板块时按用户偏好排序编排。

## 输入
- `consumerInsights`/`marketingStrategy`（内容与利益）；
- `count`（硬约束 1–12，默认 8）、平台 `workflow` 节奏、用户 selectedSections 偏好、可选资料。

## 判断方法
1. 先定叙事线（如：建立认知 → 证明价值 → 消除顾虑 → 促成转化），再逐屏分配信息角色，角色对应 `moduleId` 候选。
2. 每屏承担**独立信息价值与视觉任务**，相邻屏不做语义复述（D-PLAN-11 §2.2 无跨屏去重根因）。
3. 首屏 hero：完成"第一眼确认商品 + 建立购买兴趣"的**可执行任务**，不是只做包装识别；落地"购买兴趣"须给具体画面/信息动作（D-PLAN-11 §2.2 purpose 无落地点问题）。
4. 无板块时按屏序自主拟标题来源，**禁止固定标题轮转**（如"首屏主视觉""收尾转化"模板化标题）。
5. 选板块+调序时尊重用户顺序；板块只是偏好，不构成必须逐字展示的固定模板。

## 规则
1. `screens` 长度恒等于 `count`，不增不减；每屏 `index` 从 0 起、与 `screenRoles` 一一对应（index.js constraints①②）。
2. `materialDetail` 等依赖可确认属性的模块，须有适用性前置条件：**材质不可确认则不选材质模块**（D-PLAN-11 问题 3），选前查 `product` 分级。
3. 首屏 `role=hero` 但标题文字与构图由商品属性/屏序自主拟定（决策 #4，不写死正面居中）。
4. 屏数内内容不得为凑屏重复；每屏有独立 `sellingPoint`/`composition` 任务（index.js directives④）。
5. `planning.narrative`/`screenRoles` 与 `screens` 同步产出（index.js constraints①）。

## 输出字段
`planning.{narrative{id,reason,confidence}, screenRoles[{index,role,sectionRefs}]}`；`screens[{screen,moduleId,title,summary,sellingPoint,composition,referenceReason}]`；复用现有 moduleId 词表值域，不改词表。

## 边界
本 Skill 只做叙事与屏序，**不做视觉 DNA 六维构图（→ visual-art-direction）、不写文案版式细则（→ ecommerce-copy-layout）、不改模块词表（G-2 禁改）**；不改运行时。

## 冲突处理
- 指定屏数与实际内容量不符：在屏数内合并/拆分信息角色，不减屏也不硬凑重复（count 硬约束）。
- 用户板块顺序 vs 叙事最优序：尊重用户顺序，叙事在其顺序内优化，不擅自重排。
- 材质/参数不可确认但用户选了对应板块：保守表达或改选等效可确认模块，不虚构材质（问题 3）。

## 测试案例
- 案例 C（屏数约束）：指定 6 屏 → 恰好 6 屏，首屏 hero 定位，每屏独立任务，无模板化标题。
- 案例 D（空板块）：板块为空 → 自主规划 8 屏叙事，count 硬约束，不回退轮转。
- 案例 B（资料不足）：单图清洗剂 → 不强制选材质模块。
```


## 1.5 `prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md`

```text
# Skill 05 · 视觉艺术指导（visual-art-direction）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.4/§4.4/§5.1、D-PLAN-12 §8/§3 问题 4、v1.1 §9.2 六维度。方案原文与六维算法细节待 Owner 复核。

## 职责
制定整组视觉 DNA（统一基因）与每屏构图/镜头/光影/场景/主体位置/表达类型的**六维实质差异**。视觉服务内容（V219 §2 五原则）；根治"两屏只换背景冒充差异"与"全局规则每屏复制导致提示词过长"（D-PLAN-11 问题 4）。

## 触发
- 每次策划必经（阶段 E），在叙事规划之后、文案版式之前。
- 整组生图时尤其要防"三屏雷同"与"全局规则重复占 2/3 篇幅"。

## 输入
- `planning.screenRoles`、`screens`、`product.styleDirection`、`industryProfile`、平台视觉规范；
- 现有构图变体资产（`composition-variants.js` 9 模块 × 4 变体）、`V1_LIGHT_LINE` 全屏恒定视觉基线（D-PLAN-11 §4.4，v1 默认不生效，属可复用资产）。

## 判断方法
1. **整组 DNA 定一次**：色调/材质质感/光线风格/镜头语言/画面比例/品牌调性，作为全组统一约束，只在整组层声明一次。
2. **每屏六维差异**：构图、主体位置、镜头、场景、光影、表达类型逐屏比较，至少在多个维度有实质区别。
3. 差异来自内容任务不同（卖点特写 / 场景使用 / 结构拆解 / 信任背书），不是换纯色背景。
4. 变体耗尽时按方案规则重规划而非复制已用变体（具体算法属方案原文，待 Owner 复核；工程可复用 `variantFor`）。

## 规则
1. 整组 DNA 统一 + 每屏带**精简约束**，不得期待图片模型记住首屏（D-PLAN-12 §8）；精简约束仍须含行业禁忌与主体锁（防分层加载丢失，见 execution-flow L6/L8）。
2. 六维差异至少多维实质区分，禁止仅背景/颜色变化（案例 E）。
3. 不写死首屏正面居中构图（决策 #4）；首屏构图由 hero 任务决定。
4. 全局视觉规则整组写一次，避免逐屏复制（D-PLAN-11 §2.4 重复占比 41.8%）。
5. 主体/中文标签保真目前靠文字约束；图像链路（抠图/遮罩/合成）属阶段 E 评估，**本批不做路线定型、不接图像处理**。

## 输出字段
`globalVisualDNA.{palette, texture, lighting, cameraLanguage, ratio, tone, integrityLocks[]}`；每屏 `composition`/`negativeConstraints`/可选 `compositionVariantId`（沿用现有 moduleId 变体值域）；差异说明写入 `planning.dedupLog` 供跨屏校验。

## 边界
本 Skill 只做视觉 DNA 与构图决策，**不改视觉参数 UI、不新增视觉偏好必填项（决策 #7）、不接生图链路、不改 `src/**`**；构图变体只消费现有资产，不新建第二套。

## 冲突处理
- DNA 统一 vs 逐屏差异：统一在"风格基因"，差异在"六维表达"，两者不冲突；差异不得破坏 DNA 一致性。
- 六维变体耗尽：重规划构图维度组合，不复制已用变体；仍冲突则降低信息密度而非制造雷同屏。
- 精简约束 vs 关键规则不丢：压缩重复文字，但行业禁忌/主体锁/事实锁必须保留（execution-flow L2/L3）。

## 测试案例
- 案例 E（视觉差异）：服装鞋包 6 屏 → 整组 DNA 统一 + 六维实质差异，非换背景；无两屏雷同。
- 案例 C（屏数约束）：6 屏各有独立构图任务，全局规则不逐屏复制。
- 负向：两屏仅背景色不同、构图/镜头/主体位置全同 → 判为伪差异。
```


## 1.6 `prompts/server/detail-v2-planning/skills/ecommerce-copy-layout/SKILL.md`

```text
# Skill 06 · 电商文案与版式（ecommerce-copy-layout）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.5/问题 2、v1.1 §10/§11（copywriting 三档、fontStyle 并入、信息密度合并）、D-PLAN-12 index.js directives②。方案原文细节待 Owner 复核。

## 职责
把 `marketingStrategy` 的四层结论写成每屏可用文案与标题/版式结构，分层表达、信息有度、不空洞复述参数。承担"购买兴趣→可执行文案"的落地点（D-PLAN-11 §2.2 hero purpose 无落地点问题）。

## 触发
- 每次策划必经（阶段 F），在视觉指导之后、跨屏校验之前。
- copywriting 档位（poster/need/standard 等）、richness 信息密度、fontStyle 合并档决定表达形态。

## 输入
- `marketingStrategy.valueLadder`、`consumerInsights`、`product` 分级事实；
- `planning.screenRoles` 与每屏内容任务、`globalVisualDNA.tone`；平台文案规范与 `lang`（输出语种，默认中文）。

## 判断方法
1. 每屏文案 = 标题来源 + 利益表达句 + 必要的可信支撑（引用 `visible`/`inferred` 事实），与画面任务互补而非重复。
2. 标题由屏序与内容任务决定，非固定轮转；首屏标题不写死（决策 #4）。
3. 信息密度按 richness 合并档控制：高密度多支撑点、低密度留白突出主表达。
4. hero 屏须给"引发购买兴趣"的可执行文案动作（如主利益句/差异钩子），不是"确认商品身份"的空话。
5. 禁绝对化/医疗化词；认证/疗效/销量等无证据不写。

## 规则
1. 文案只引用 `visible`/`inferred` 事实，`mustNotClaim` 不得进入任何屏文案（与 Skill 01 联动）。
2. 相邻屏文案不做语义复述（与 Skill 07 去重联动）。
3. 输出语种跟随 `lang`（v1.1 C-3：默认中文、必须实际进入指令），不硬编码中文。
4. copywriting/ rich ness/fontStyle 按 v1.1 §11 合并语义消费，不新增参数、不改 UI。
5. 文案是建议性策划中间产物，不自动覆盖用户已确认的 `copywriting`（决策 #6）。

## 输出字段
`screens[].{title, summary, sellingPoint, copywriting, promptDirectives[], negativeConstraints[]}`；字段值域沿用现有 outputSchema，不改运行时结构。

## 边界
本 Skill 只做文案与版式结构，**不改前端参数 UI、不新增必填设置、不做视觉构图（→ visual-art-direction）、不改 G-2 词表**；不改运行时。

## 冲突处理
- 文案诱感 vs 真实性：真实性优先，删去无证据表达（五原则）。
- 用户 copywriting 档位 vs 策划更优表达：尊重用户档位，策划在该档内优化。
- 首屏"不写死标题" vs 平台模板习惯：按商品属性拟标题，不套固定句式。

## 测试案例
- 案例 F（营销表达）：只给包装参数 → 文案做事实→需求→利益→表达，非参数罗列。
- 案例 B（资料不足）：单图清洗剂 → 文案保守，不写虚构功效。
- 负向：两屏 summary/sellingPoint 语义几乎相同 → 判为复述。
```


## 1.7 `prompts/server/detail-v2-planning/skills/cross-screen-coherence/SKILL.md`

```text
# Skill 07 · 跨屏一致与差异（cross-screen-coherence）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.2/§4.3/§5.2、D-PLAN-12 §8（§6.2 三层结构）、index.js directives④/constraints④、v1.1 §9.2。方案原文细节待 Owner 复核。

## 职责
保证整组**一致性**（视觉 DNA、商品主体、行业规则、叙事线统一）与逐屏**实质差异**（模块不重复、卖点不复述、六维不同），并做去重记录。整组叙事高于单屏美观（V219 §2 五原则）。

## 触发
- 每次策划必经（阶段 G），在叙事/视觉/文案之后、质检之前。
- 多屏（尤其 ≥4 屏）与"质检三屏雷同"高发场景必须执行。

## 输入
- `screens[]`、`planning.screenRoles`、`globalVisualDNA`、`marketingStrategy`；
- 现有 `dedupLog` 容器（`detail-ai.js:213`，当前只有声明无消费——属工程侧待接，本批只落契约）；模块 id 词表、六维差异判据。

## 判断方法
1. **一致性检查**：所有屏的 `industryId`/视觉 DNA/主体锁/叙事线一致；行业禁忌在每屏精简约束中保留。
2. **模块去重**：同组 `moduleId` 不重复（除确需复现的角色）。
3. **卖点去重**：相邻/全组 `sellingPoint`/`summary` 语义不重复（非仅字符串比对）。
4. **六维差异复核**：调用 Skill 05 的六维判据逐屏比对，至少多维实质不同。
5. 去重动作记入 `planning.dedupLog`，供工程门禁消费（确定性去重属工程线单）。

## 规则
1. 全局规则整组存一次、每屏带精简约束（方案 §6.2），**不能期待图片模型记住首屏**（D-PLAN-12 §8）；精简约束含行业禁忌/主体锁/事实锁。
2. 模块/卖点/构图三类重复均须处理，不得只改标题文字冒充差异。
3. 差异不得破坏一致性：六维差异在统一 DNA 内进行。
4. dedupLog 为契约字段，工程门禁消费；本批不改运行时去重实现。
5. 不机械凑屏：重复来源于内容不足时应合并信息角色而非制造重复屏（index.js directives④）。

## 输出字段
`planning.dedupLog[]`（去重动作与理由）；一致性结论写入 `planning.consistency`（若 Schema 支持，作为扩展说明）；不新增运行时字段。

## 边界
本 Skill 只做一致性/差异判定与去重记录，**不改 `dedupLog` 消费代码、不改 middleware 编译链、不改 G-2 词表**；确定性去重的机器实现属工程线单，本批只落契约声明。

## 冲突处理
- 一致性 vs 差异：一致在"基因/规则"，差异在"表达/信息角色"，分层处理不冲突。
- 差异不足 vs 屏数硬约束：在屏数内重分配信息角色，不删屏、不复制已用变体。
- dedupLog 有记录 vs 运行时无消费：本批如实留白（工程侧待接），不以 JSON 结构正确冒充去重已生效。

## 测试案例
- 案例 E（视觉差异）：6 屏两两比对，无模块重复、无卖点复述、六维多维不同。
- 案例 C（屏数约束）：6 屏全局规则只写一次、每屏精简约束含行业禁忌。
- 负向：两屏 moduleId 相同且 sellingPoint 语义复述 → 判为重复。
```


## 1.8 `prompts/server/detail-v2-planning/skills/detail-quality-control/SKILL.md`

```text
# Skill 08 · 详情质检（detail-quality-control）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.6/§4.6、v1.1 §10.3（A 已确认决策/B 待裁决）、D-PLAN-12 §3 问题 6、V219 §4.3 评价维度与 §5.3。方案原文细节待 Owner 复核。

## 职责
对整组策划做**三维质检**：真实性（事实/虚假功效/行业错误）、单屏任务（是否完成本屏信息价值）、整组逻辑（叙事/一致性/差异），产出分级问题与建议。质检是独立可选、只给建议、不自动覆盖用户提示词（决策 #5/#6）。

## 触发
- **独立可选**：用户主动触发时才运行，可跳过直接生图（决策 #5）；本批只落契约，不接 UI/接口（阶段 D）。
- 用户触发后按本地确定性检查为主；是否叠加模型质检及费用明示（C-4）仍为**待裁决架构建议**，本文件不升级为已确认决策（v1.1 §10.3-B）。

## 输入
- 整组 `screens[]`、`planning`、`product` 分级事实、`industryProfile`、`globalVisualDNA`；
- 现有 `qc` 结构（`globalChecks/commonFailureRisks/retryAdvice`）、`QUALITY_SKILL` 语义；B 域 `qc-review.js` 叙事质检思路（借鉴方法、不照搬文本）。

## 判断方法
三维逐项扫描：
1. **真实性维**：无证据的材质/认证/疗效/对比/销量断言（引用 `mustNotClaim` 校验）；行业串规则。
2. **单屏任务维**：每屏是否完成独立信息价值、首屏是否 hero、文案是否复述。
3. **整组逻辑维**：叙事连贯、模块/卖点去重、DNA 一致、六维差异、板块覆盖、平台合规。
- 每条问题给 `severity`（critical/major/minor）、`evidence`（引用具体字段）、`suggestion`（可执行修正）。

## 规则
1. **严重错误不可被高分抵消**（V219 §4.3）：商品事实错误、虚假功效、行业错误一律 `critical`，即使其它维度高分也判不合格。
2. 六项评价维度逐项记录：商品理解/营销策划/叙事逻辑/视觉创意/提示词质量/真实性，每项 1–5 分 + 严重错误标记（V219 §4.3）。
3. 质检项不得被截断（D-PLAN-11 §2.6 `.slice(0,8)` 把差异质检裁掉的根因）——按屏任务与整组检查都要进入结果；机器实现属工程线单。
4. 建议不自动覆盖用户已确认提示词；是否采纳由用户点击决定（决策 #6、v1.1 §10.3-A）。
5. 任一路径失败返回"质检不可用 + 本地规则结果"，**不阻断生图**（v1.1 §10.3-B 回退）。
6. 本批不打任何 AI 策划质量 PASS（V219 §5.3）：Schema 合法/Skill 存在/门禁绿 ≠ 真实模型质量验证。

## 输出字段
`quality-result`（见 `../../schemas/quality-result.schema.json`）：`{schemaVersion, findings[{screenIndex,type,severity,evidence,suggestion,source}], summary, scores{六维}, criticalFlags[]}`；`type` ∈ 事实越界/跨屏重复/板块覆盖缺失/首屏缺失/DNA 冲突/平台合规/文案语气不一致（v1.1 §10.3-C）。

## 边界
本 Skill 只做质检判定与建议，**不接质检 UI/接口（阶段 D）、不改 middleware 截断逻辑（工程线单）、不改运行时、不改 G-2 词表**；模型质检的费用明示为待裁决，不擅自实现。

## 冲突处理
- 严重错误 vs 综合高分：严重错误优先，判不合格（不可抵消）。
- 模型质检建议 vs 用户已确认提示词：用户内容优先，建议不自动写回。
- 质检发现 vs 生图可用性：质检失败/不可用不阻断生图，回落现有链路。

## 测试案例
- 案例 A/B：清洗剂出现服装规则、单图虚构材质 → 行业错误/事实越界判 `critical`。
- 案例 E：两屏质检几乎一样 → 检出"跨屏重复"并要求按屏差异化。
- 负向：仅结构正确就打 PASS → 违规（本批真实模型层留白，不标 PASS）。
```


---

# 二、Agent 主流程文件（完整原文）

## 2.1 `prompts/server/detail-v2-planning/agent/planner.md`

```text
# 总策划 Agent 定义 · 一键详情 V2 阶段 A

> 资产类型：文档式声明（纯契约、不接运行时）。本文件只描述"总策划 Agent 是谁、做什么、不做什么、产出什么"，**不含任何模型调用代码，也不改变现有业务运行时**。
> 依据：`docs/规划/V4.0-一键详情V2-外部架构方案技术适配评估与实施拆解-2026-11-16.md`（D-PLAN-12）§2.2/§2.3/§5.1/§5.3、`docs/规划/V4.0-一键详情V2-生成质量全链路问题溯源与改进建议-2026-11-16.md`（D-PLAN-11）§2/§4、`docs/规划/V4.0-一键详情V2-产品与AI策划体系专项研究报告-v1.1.md` §8.1/§10、V219 执行单 §2 九条已确认产品决策。
> 🔴 方案《一键详情 V2：总策划 Agent 与专业 Skill 体系架构设计 V1.0》全文由 Owner 提供、当前未落盘为仓库文件。**阶段 A–I 的精确措辞按 D-PLAN-12 §2.3 转述与现有链路编排，待 Owner 对照方案原文复核**；本文件未发明与转述相悖的专业判断规则。

---

## 1. 定位（单次调用、非长期运行时）

总策划 Agent 是一次性、无状态的**策划决策者**：把"商品图（唯一必选输入）+ 可选资料/设置"一次性规划成"整组叙事 + 逐屏内容/视觉任务 + 真实性约束"，产出结构化结果后即结束。它**不是**常驻调度器、不持有跨请求记忆、不再起第二套模型网关或图片生成系统。

- 单次模型调用完成全部策划（Owner 07:31 裁决 C-1：一期单次，质量不足再评估两段式）；沿用现有 `postChatCompletion` 与 4 类降级重试，不新增调用体系。
- 八个专业 Skill 以声明式资产挂在本 Agent 上下文中（见 `../skills/` 与注册表 `../index.js`）；本批只落资产与契约，**S2-B 才消费注册表、接模型调用链**。
- 结果落点遵循 V216 验证口径：`planning` 作响应独立顶层、前端 `detailPlanningContext` 会话态承接、**不落盘、不进 `detailSettings`/`group`/`seed`**（D-PLAN-12 §5.2、V219 §3.3）。

## 2. 职责（D-PLAN-12 §2.2）

1. **商品理解与事实分级**：从商品图与可选资料提取可确认事实，逐条标注 `visible / inferred / mustNotClaim`（D-PLAN-11 §4.2）。
2. **行业单一决策**：展示行业与规则词表行业取同一决策源，专业判据来自 `industry-routing`，**一致性由工程代码负责**（D-PLAN-11 §4.1、D-PLAN-12 §3 问题 1）。
3. **营销策划**：把商品事实按"事实 → 消费者需求 → 利益 → 营销表达"分层转化，不输出空洞参数罗列（D-PLAN-11 §4.2、问题 5）。
4. **叙事与视觉规划**：在用户指定屏数内规划每屏职责、内容任务与视觉 DNA；首屏默认 hero 但不写死标题与正面居中构图；禁止回退固定标题轮转。
5. **跨屏一致与差异**：整组视觉 DNA 统一、每屏带精简约束；六维实质差异，不以换背景冒充差异（D-PLAN-12 §8）。
6. **真实性质检与风险标注**：对无证据的具体断言、跨屏重复、板块覆盖、DNA 冲突等给出分级问题与建议，**只给建议、不自动覆盖用户已确认提示词**。
7. **确定性输出**：产出符合 `../schemas/planning-result.schema.json` 的结构化结果；count 硬约束由工程保证、模型不增不减屏数。

## 3. A–I 九逻辑阶段（D-PLAN-12 §2.3 转述编排）

> 九个阶段是"逻辑分工"，不是九次模型调用；在单次调用中一次完成，由确定性编译落地。每阶段调用的 Skill 见括号。

| 阶段 | 名称 | 职责 | 主用 Skill |
|---|---|---|---|
| A | 商品事实理解 | 提取图片可确认事实并分级，记录不可确认项 | `product-understanding` |
| B | 行业识别与路由 | 判展示行业与规则行业为同一决策结果，强特征优先、弱语境词不越权 | `industry-routing` |
| C | 消费者洞察与营销 | 事实→需求→利益→表达四层转化，避虚构功效/认证 | `consumer-marketing-strategy` |
| D | 详情页叙事规划 | 定叙事线、屏序、每屏信息角色与内容任务；首屏 hero 不写死标题 | `detail-story-planning` |
| E | 视觉艺术指导 | 定整组视觉 DNA 与每屏构图/光影/镜头实质差异 | `visual-art-direction` |
| F | 文案与版式 | 分层文案、标题来源、信息密度，禁空洞复述 | `ecommerce-copy-layout` |
| G | 跨屏一致与差异 | 整组 DNA 统一校验 + 六维差异 + 模块/卖点去重 | `cross-screen-coherence` |
| H | 质检与风险标注 | 真实性/单屏任务/整组逻辑三维质检、风险分级 | `detail-quality-control` |
| I | 确定性编译输出 | 按 Schema 收敛为独立顶层结构；count 与屏序由工程断言 | 输出契约（本目录 `output-contract.md`） |

## 4. 禁止事项（V219 §2 九条决策 + §1.2）

- 不虚构材质、参数、认证、疗效、销量、品牌背书；图片无法确认者只能保守描述或 `mustNotClaim`。
- 不增减用户指定屏数（count 硬约束 1–12，默认 8）；不为凑屏重复或硬凑内容。
- 无板块时自主规划，**禁止回退固定标题轮转**；板块是偏好排序、不是固定模板。
- 不新增第二套 Provider / API Key / 模型网关 / 图片生成系统。
- 不新增叙事/视觉偏好等**必填**设置；不写死首屏标题文字与正面居中构图。
- 质检建议不自动覆盖用户已确认提示词；不把"质检是否调模型/费用"当作已确认决策（C-4 仍待裁决）。
- 不复制外部无授权仓库文本（saibodafu `license:null`，只借鉴方法）。

## 5. 输出契约

见 `../schemas/planning-result.schema.json`（策划结果）与 `../schemas/quality-result.schema.json`（质检结果），说明见本目录 `output-contract.md`。校验约束（长度上限、数组上限、count 校验、facts 引用校验）以 Schema 为准。

## 6. 边界

- 本 Agent 定义与八 Skill 是**阶段 A 资产**：只声明决策方法论与数据契约，不接运行时、不改 `server/**`/`src/**`、不改 G-2 词表与 v2 活壳。
- 与旧链路关系：旧版一键详情逐字节保持；新 Skill 走"新增覆盖层"、不改旧词表（Owner 裁决⑤）。
```


## 2.2 `prompts/server/detail-v2-planning/agent/execution-flow.md`

````text
# 执行流程与优先级 · 一键详情 V2 阶段 A

> 资产类型：文档式声明（纯契约、不接运行时）。
> 依据：D-PLAN-12 §5.4（方案执行优先级/分层加载）、§5.1（九阶段全量注入 vs 单次上限风险）、D-PLAN-11 §4、V219 执行单 §2 九条产品决策与 §3.3 数据落点。
> 🔴 方案原文的精确条款措辞未落盘；本文件按 D-PLAN-12 转述编排，待 Owner 对照方案 V1.0 原文复核。

---

## 1. 单次调用内的执行顺序

```
商品图(唯一必选) + 可选资料/设置
  → A 商品事实理解 → B 行业单一决策 → C 营销策划
  → D 叙事规划 → E 视觉 DNA → F 文案版式
  → G 跨屏一致/差异 → H 质检风险标注
  → I 确定性编译输出（planning 独立顶层 + screens）
```

九阶段是逻辑分工，一次 `postChatCompletion` 内完成；工程侧确定性编译承接屏数、模块映射、全局锁拼装等可计算约束（D-PLAN-12 §2 断言 1）。

## 2. 八级优先级规则（D-PLAN-12 §5.4 分层加载转述）

当 prompt 预算/超时（`DETAIL_ANALYSIS_TIMEOUT_MS`）受限需分层加载时，按下列优先级**从高到低保留，不删关键专业能力**（本批只声明顺序，不实施加载器）：

1. **L1 总策划 Agent 契约**：单次调用、独立顶层输出、count 硬约束、首屏 hero。
2. **L2 商品真实性约束**：事实分级、禁虚构、`productAuthenticityLock` 语义。
3. **L3 行业判据**：强特征词优先、弱语境词不越权、展示行业=规则行业单一决策。
4. **L4 营销策划**：事实→需求→利益→表达四层，禁空洞参数罗列。
5. **L5 叙事结构**：每屏信息角色与独立任务，禁止固定标题轮转。
6. **L6 视觉 DNA**：整组统一 + 六维差异，不以换背景冒充。
7. **L7 文案与跨屏去重**：分层文案 + 模块/卖点去重 + 每屏精简约束。
8. **L8 质检规则**：三维质检与风险分级；可被压缩为精简约束但不得整段丢失（D-PLAN-11 问题 6 的"被截断"根因）。

> 若实测单次调用不可行，按方案 §5.3 授权"拆分专业规则层级"处理，**而非降低专业能力**；是否启用分层加载属 S2-B 及以后阶段，本批不实施。

## 3. 确定性 vs 模型的分界（D-PLAN-11 §5.1/§5.2）

| 交给工程确定性实现 | 交给模型专业判断 |
|---|---|
| 展示行业与规则行业一致性校验（同一 `industryId`） | 行业识别判据、强/弱特征词优先级 |
| count 钳制（1–12）、缺屏补位、多屏告警 | 每屏信息角色与标题来源 |
| 跨屏模块/卖点去重门禁 | 六维视觉差异的具体构图决策 |
| 质检项不被 `slice` 截断、按屏入参 | 三维质检标准与风险分级 |
| 全局锁整组一次 + 每屏精简约束 | 事实→利益→表达的措辞 |

## 4. 数据落点纪律（V219 §3.3）

- `planning` 作响应独立顶层、不挂 `group`；前端 `detailPlanningContext` 会话态承接。
- **不落 localStorage、不进 `detailSettings`/`group`/`seed`**；三通道白名单不放行新字段。
- 资产 JSON 只描述结构，不含客户数据、KEY、生图记录。

## 5. 边界与暂停

- 本文件不接运行时；任何"接入模型调用链""改 `server/**`/`src/**`""改 G-2 词表/v2 活壳"均属越界，触发 V219 §9 暂停条件。
- 质检是否调用模型、是否明示费用（C-4）仍为待裁决架构建议，本文件不升级为已确认决策。
````


## 2.3 `prompts/server/detail-v2-planning/agent/output-contract.md`

```text
# 输出契约说明 · 一键详情 V2 阶段 A

> 资产类型：文档式声明（纯契约、不接运行时）。本文件说明策划结果的顶层结构意图与兼容关系，**字段的机器可读真相源是 `../schemas/planning-result.schema.json` 与 `../schemas/quality-result.schema.json`**。
> 依据：D-PLAN-12 §2 断言 3/§5.2、D-PLAN-11 §4.2、v1.1 §4/§10.2.1、V219 执行单 §3.3/§5.1。

---

## 1. 顶层结构（planning-result）

Schema 含 1 个元字段 `schemaVersion` 与 8 个业务顶层字段。8 字段 = 现有 outputSchema 可映射的 4 个 + 方案新增的 4 个，与 D-PLAN-12 §2 断言 3"4/8 字段可映射"吻合：

| 顶层字段 | 来源 | 语义 |
|---|---|---|
| `product` | 现有可映射（`detail-ai.js:162`） | 商品事实与分级 |
| `industryProfile` | 方案新增（D-PLAN-12 §2 断言 3） | 行业识别与路由结果 |
| `consumerInsights` | 方案新增 | 消费者需求与洞察 |
| `marketingStrategy` | 方案新增 | 事实→利益→表达策划 |
| `screens` | 现有可映射（`detail-ai.js:181`） | 逐屏内容/视觉任务 |
| `globalVisualDNA` | 方案新增 | 整组视觉基因 |
| `planning` | 现有可映射（`detail-ai.js:209`） | 叙事/角色/事实/dedup |
| `qc` | 现有可映射（`detail-ai.js:202`） | 质检与风险 |

> `uncertainties`（D-PLAN-12 §2 断言 3 提到的方案顶层概念）在本 Schema 中作为 `product.uncertainties` 与 `planning.facts[level=inferred|mustNotClaim]` 承载，避免再起第九个顶层键；此映射为工程编排，**待 Owner 对照方案原文复核**。

## 2. 与现有 outputSchema 的兼容映射（不破坏旧版）

新 Schema 是**契约文档、不接运行时**；旧链路 `detail-ai.js:161-216` 的 outputSchema 逐字节不动。映射规则：

- `product` ← 现有 `product`（增补分级字段，旧字段保留）；
- `screens` ← 现有 `screens[]`（moduleId/title/sellingPoint/composition 等旧字段保留）；
- `planning` ← 现有 `planning`（narrative/screenRoles/facts/dedupLog）；
- `qc` ← 现有 `qc`（globalChecks/commonFailureRisks/retryAdvice）；
- `strategy` 的旧字段（globalStyle/copywritingTone/pageRhythm/platformNotes/consistencyRules）在语义上被 `marketingStrategy` + `globalVisualDNA` 吸收，**但旧 `strategy` 字段在运行时仍保留，不做删除**。

## 3. 数据落点（V219 §3.3，红线）

- `planning` 作响应独立顶层、**不挂 `group`**；前端会话态承接。
- **禁止**进入 `sanitizeDetailGroupsForStorage`（`src/features/detail/detail-group.js:336`）、`saveDetailPreset`（`:251`）、`seed/manifest.json` 三条持久化通道。
- Schema JSON 只描述结构，不含任何客户数据、KEY、生图记录。

## 4. 校验约束（§5.1）

- `schemaVersion`：固定 `"1.0.0"`。
- `count`：整数 1–12，默认 8；`screens` 长度必须等于 `count`（模型不增不减，越界由工程判红）。
- 字符串长度、数组条目上限见各字段 `maxLength` / `maxItems`。
- `planning.facts[].level` 限 `visible|inferred|mustNotClaim`；引用了 `mustNotClaim` 的断言不得出现在 `product` 确定事实或 `screens` 卖点中（facts 引用校验）。
- 质检结果结构见 `quality-result.schema.json`；严重错误（商品事实错误/虚假功效/行业错误）单列 `critical`，不可被其它高分抵消（V219 §4.3）。
```


---

# 三、输出 Schema（完整原文）

## 3.1 `prompts/server/detail-v2-planning/schemas/planning-result.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jingyin.local/schemas/detail-v2/planning-result.schema.json",
  "title": "一键详情 V2 · 策划结果契约（阶段 A · 不接运行时）",
  "description": "总策划 Agent 单次模型调用的结构化输出契约。含 schemaVersion 与 8 个业务顶层字段（现有 outputSchema 可映射 4：product/screens/planning/qc；方案新增 4：industryProfile/consumerInsights/marketingStrategy/globalVisualDNA），与 D-PLAN-12『4/8 字段可映射』一致。仅为契约文档：planning 作响应独立顶层、不挂 group、前端 detailPlanningContext 会话态承接、不落盘、不进 detailSettings/group/seed。",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schemaVersion",
    "product",
    "industryProfile",
    "consumerInsights",
    "marketingStrategy",
    "screens",
    "globalVisualDNA",
    "planning",
    "qc"
  ],
  "properties": {
    "schemaVersion": {
      "type": "string",
      "const": "1.0.0",
      "description": "契约版本号；固定 1.0.0，变更须走版本升级与兼容映射复核。"
    },
    "product": {
      "$ref": "#/$defs/product",
      "description": "商品事实与分级（映射现有 detail-ai.js outputSchema.product；增补分级字段，旧字段保留）。"
    },
    "industryProfile": {
      "$ref": "#/$defs/industryProfile",
      "description": "方案新增顶层：行业识别与单一决策结果（展示行业=规则行业）。"
    },
    "consumerInsights": {
      "$ref": "#/$defs/consumerInsights",
      "description": "方案新增顶层：消费者需求与洞察。"
    },
    "marketingStrategy": {
      "$ref": "#/$defs/marketingStrategy",
      "description": "方案新增顶层：事实→需求→利益→营销表达四层策划（吸收现有 strategy 的 globalStyle/copywritingTone 语义）。"
    },
    "screens": {
      "$ref": "#/$defs/screens",
      "description": "逐屏内容/视觉任务（映射现有 outputSchema.screens）；长度必须等于用户指定 count，不增不减。"
    },
    "globalVisualDNA": {
      "$ref": "#/$defs/globalVisualDNA",
      "description": "方案新增顶层：整组视觉基因（吸收现有 strategy 的 consistencyRules 语义）；整组只声明一次。"
    },
    "planning": {
      "$ref": "#/$defs/planning",
      "description": "规划顶层（映射现有 outputSchema.planning）；含叙事/角色/事实分级/dedupLog，uncertainties 亦由本字段承载。"
    },
    "qc": {
      "$ref": "#/$defs/qc",
      "description": "质检与风险（映射现有 outputSchema.qc）；独立可选、只给建议、不自动覆盖用户提示词。"
    }
  },
  "$defs": {
    "factLevel": {
      "type": "string",
      "enum": ["visible", "inferred", "mustNotClaim"],
      "description": "事实分级：图片可见 / 有依据但不可全确认 / 禁止作为确定事实断言。"
    },
    "product": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name", "industryId"],
      "properties": {
        "name": { "type": "string", "maxLength": 120 },
        "industryId": { "type": "string", "maxLength": 40 },
        "industryName": { "type": "string", "maxLength": 120 },
        "targetAudience": { "type": "string", "maxLength": 200 },
        "materials": { "type": "array", "maxItems": 12, "items": { "type": "string", "maxLength": 80 } },
        "colors": { "type": "array", "maxItems": 12, "items": { "type": "string", "maxLength": 80 } },
        "structureLocks": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 120 } },
        "realSellingPoints": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 160 } },
        "riskNotes": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 160 } },
        "styleDirection": { "type": "string", "maxLength": 200 },
        "uncertainties": {
          "type": "array",
          "maxItems": 20,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["claim", "reason"],
            "properties": {
              "claim": { "type": "string", "maxLength": 160 },
              "reason": { "type": "string", "maxLength": 200 }
            }
          },
          "description": "图片无法确认的事项；不得作为确定事实进入 realSellingPoints 或 screens.sellingPoint。"
        }
      }
    },
    "industryProfile": {
      "type": "object",
      "additionalProperties": false,
      "required": ["industryId", "industryName", "decisionLogic"],
      "properties": {
        "industryId": { "type": "string", "maxLength": 40 },
        "industryName": { "type": "string", "maxLength": 120 },
        "evidence": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 160 }, "description": "只能引用 product 中 level=visible|inferred 的事实。" },
        "decisionLogic": { "type": "string", "maxLength": 400, "description": "强特征优先 / 弱语境词不越权的判定依据。" },
        "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
        "uncertaintyNote": { "type": "string", "maxLength": 200 }
      }
    },
    "consumerInsights": {
      "type": "object",
      "additionalProperties": false,
      "required": ["audience"],
      "properties": {
        "audience": { "type": "string", "maxLength": 200 },
        "needs": {
          "type": "array",
          "maxItems": 20,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["need", "evidenceRef"],
            "properties": {
              "need": { "type": "string", "maxLength": 160 },
              "evidenceRef": { "type": "string", "maxLength": 160, "description": "引用 product 事实，不得引用 mustNotClaim。" }
            }
          }
        }
      }
    },
    "marketingStrategy": {
      "type": "object",
      "additionalProperties": false,
      "required": ["valueLadder"],
      "properties": {
        "valueLadder": {
          "type": "array",
          "maxItems": 20,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["fact", "need", "benefit", "expression"],
            "properties": {
              "fact": { "type": "string", "maxLength": 160 },
              "need": { "type": "string", "maxLength": 160 },
              "benefit": { "type": "string", "maxLength": 160 },
              "expression": { "type": "string", "maxLength": 200 }
            }
          },
          "description": "事实→需求→利益→营销表达四层链；每层须可回溯到 product 事实。"
        },
        "tone": { "type": "string", "maxLength": 120, "description": "吸收现有 strategy.copywritingTone 语义。" },
        "boundaries": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 160 }, "description": "行业禁忌与真实性边界。" }
      }
    },
    "screens": {
      "type": "array",
      "minItems": 1,
      "maxItems": 12,
      "description": "count 硬约束：长度必须等于用户指定 count（1–12，默认 8）；缺屏/多屏由工程判红，模型不增不减。",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["screen", "moduleId", "title"],
        "properties": {
          "screen": { "type": "integer", "minimum": 1, "maximum": 12 },
          "moduleId": { "type": "string", "maxLength": 60 },
          "title": { "type": "string", "maxLength": 120, "description": "由屏序与内容任务决定，禁止固定标题轮转；首屏不写死标题文字。" },
          "summary": { "type": "string", "maxLength": 300 },
          "sellingPoint": { "type": "string", "maxLength": 300, "description": "不得引用 mustNotClaim 事实；相邻屏不得语义复述。" },
          "composition": { "type": "string", "maxLength": 400 },
          "copywriting": { "type": "string", "maxLength": 400 },
          "referenceReason": { "type": "string", "maxLength": 200 },
          "promptDirectives": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 200 } },
          "negativeConstraints": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 200 } },
          "compositionVariantId": { "type": "string", "maxLength": 60, "description": "可选：沿用现有 moduleId 变体值域；不新建第二套。" }
        }
      }
    },
    "globalVisualDNA": {
      "type": "object",
      "additionalProperties": false,
      "required": ["palette", "lighting"],
      "properties": {
        "palette": { "type": "string", "maxLength": 160 },
        "texture": { "type": "string", "maxLength": 160 },
        "lighting": { "type": "string", "maxLength": 160 },
        "cameraLanguage": { "type": "string", "maxLength": 160 },
        "ratio": { "type": "string", "maxLength": 40 },
        "tone": { "type": "string", "maxLength": 160 },
        "integrityLocks": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 160 }, "description": "整组主体/中文标签/行业禁忌锁；每屏精简约束须保留，不因分层加载丢失。" }
      }
    },
    "planning": {
      "type": "object",
      "additionalProperties": false,
      "required": ["narrative", "screenRoles", "facts", "dedupLog"],
      "properties": {
        "narrative": {
          "type": "object",
          "additionalProperties": false,
          "required": ["id", "reason", "confidence"],
          "properties": {
            "id": { "type": "string", "maxLength": 80 },
            "reason": { "type": "string", "maxLength": 400 },
            "confidence": { "type": "string", "enum": ["high", "medium", "low"] }
          }
        },
        "screenRoles": {
          "type": "array",
          "minItems": 1,
          "maxItems": 12,
          "description": "index 从 0 起、与 screens 一一对应；首屏 role=hero。",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["index", "role"],
            "properties": {
              "index": { "type": "integer", "minimum": 0, "maximum": 11 },
              "role": { "type": "string", "maxLength": 60 },
              "sectionRefs": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 80 } }
            }
          }
        },
        "facts": {
          "type": "array",
          "maxItems": 40,
          "description": "facts 引用校验：level=mustNotClaim 的 claim 不得出现在 product 确定事实或 screens.sellingPoint。",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["claim", "level"],
            "properties": {
              "claim": { "type": "string", "maxLength": 200 },
              "level": { "$ref": "#/$defs/factLevel" }
            }
          }
        },
        "dedupLog": {
          "type": "array",
          "maxItems": 40,
          "items": { "type": "string", "maxLength": 200 },
          "description": "去重动作与理由；工程门禁消费（本批只落契约、不改运行时消费代码）。"
        }
      }
    },
    "qc": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "globalChecks": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 200 } },
        "commonFailureRisks": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 200 } },
        "retryAdvice": { "type": "array", "maxItems": 20, "items": { "type": "string", "maxLength": 200 } }
      }
    }
  }
}
```


## 3.2 `prompts/server/detail-v2-planning/schemas/quality-result.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jingyin.local/schemas/detail-v2/quality-result.schema.json",
  "title": "一键详情 V2 · 质检结果契约（阶段 A · 不接运行时）",
  "description": "独立可选质检的输出契约（v1.1 §10.3-C 接口返回 + D-PLAN-12 §8 风险分级 + V219 §4.3 六维评价）。质检只给建议、不自动覆盖用户已确认提示词；本批只落契约文档，不接 UI/接口/模型调用。",
  "type": "object",
  "additionalProperties": false,
  "required": ["schemaVersion", "findings", "summary", "scores", "criticalFlags"],
  "properties": {
    "schemaVersion": {
      "type": "string",
      "const": "1.0.0",
      "description": "契约版本号；固定 1.0.0。"
    },
    "findings": {
      "type": "array",
      "maxItems": 60,
      "description": "质检发现项；按屏任务与整组检查都要进入结果，不得被固定 slice 截断（D-PLAN-11 §2.6 根因）。",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["screenIndex", "type", "severity", "evidence", "suggestion", "source"],
        "properties": {
          "screenIndex": {
            "type": "integer",
            "minimum": -1,
            "maximum": 12,
            "description": "-1 表示整组级问题，>=0 为对应屏序。"
          },
          "type": {
            "type": "string",
            "enum": [
              "事实越界",
              "跨屏重复",
              "板块覆盖缺失",
              "首屏缺失",
              "DNA 冲突",
              "平台合规",
              "文案语气不一致"
            ],
            "description": "沿用 v1.1 §10.3-C type 覆盖集合。"
          },
          "severity": {
            "type": "string",
            "enum": ["critical", "major", "minor"],
            "description": "风险分级；严重错误（事实错误/虚假功效/行业错误）一律 critical。"
          },
          "evidence": { "type": "string", "maxLength": 300, "description": "引用具体字段或值，必须可复核。" },
          "suggestion": { "type": "string", "maxLength": 300, "description": "可执行修正建议；用户点击才写回 prompt.text。" },
          "source": { "type": "string", "enum": ["local", "model"], "description": "local=本地确定性规则；model=模型质检（是否启用/费用为 C-4 待裁决）。" }
        }
      }
    },
    "summary": {
      "type": "string",
      "maxLength": 600,
      "description": "质检结论摘要；质检不可用时应返回『质检不可用 + 本地规则结果』，不阻断生图。"
    },
    "scores": {
      "type": "object",
      "additionalProperties": false,
      "description": "六项评价维度逐项 1–5 分（V219 §4.3）；不得以结构正确代替真实模型质量验证。",
      "required": ["商品理解", "营销策划", "叙事逻辑", "视觉创意", "提示词质量", "真实性"],
      "properties": {
        "商品理解": { "$ref": "#/$defs/score" },
        "营销策划": { "$ref": "#/$defs/score" },
        "叙事逻辑": { "$ref": "#/$defs/score" },
        "视觉创意": { "$ref": "#/$defs/score" },
        "提示词质量": { "$ref": "#/$defs/score" },
        "真实性": { "$ref": "#/$defs/score" }
      }
    },
    "criticalFlags": {
      "type": "array",
      "maxItems": 20,
      "items": { "type": "string", "maxLength": 200 },
      "description": "严重错误标记（商品事实错误/虚假功效/行业错误）；一旦非空，整组判不合格，不可被其它高分抵消。"
    }
  },
  "$defs": {
    "score": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "单项 1–5 分；独立于严重错误标记，严重错误另记 criticalFlags。"
    }
  }
}
```


---

# 四、真实用户问题复盘（完整原文）

## 4.1 `docs/复盘/V4.0-一键详情V2-S2B真机反馈根因定位与S2C拆解-2026-11-17.md`

```text
# V4.0 一键详情 V2 · S2-B 真机反馈根因定位与 S2-C 拆解报告

> 类型：一手真机反馈 + 只读根因定位　日期：2026-11-17　状态：**反馈已归档 · 根因已定位 · 零业务代码改动 · S2-C 待 Owner 单独放行**
> 触发：Owner 对 2026-11-17 13:01 生成的「血渍清洗剂」三屏提示词给出结构化反馈（改善 5 点 / 关键问题 5 点 / 结构问题 4 点）。
> 一手证据：`data/history.json` 三条记录 —— 屏1 `c283c231-0ea8-445b-bddf-a342827ae959`、屏2 `dccc0f7e-08b0-4c3f-a958-43f4988abdf1`、屏3 `f52edbda-5fca-4fc8-bf64-89c90fdf1089`（生成时间 2026-11-17 13:01 GMT+8）。
> 范围：全程只读。未改源码 / 配置 / 门禁 / 基线 / 执行单状态；工作区保持干净。
> 关联：`D-REV-05`（封装版无响应排查）、`V220 / S2-B`（8 条规矩接入规划链路）、`D-PLAN-12`（外部方案适配拆解）。

---

## 1. 给 Owner 看的结论（白话，无技术词）

**你指出的方向都对，改善那 5 点确实AI在往对的方向想了。但剩下的问题，根子是同一个：写在"AI 思考要求"里的规矩，和真正拼出那张"做图说明书"的老办法，是两回事。**

- 上一批我们确认了"不许串服装"这 8 条规矩**真的送进了 AI**；这次你看到"服装规矩还在"，说明**老办法在把 AI 的结果写成说明书时，又把服装词塞了回去**。规矩进了脑子，手没跟上。
- 所以这不是改一句文案能解决的。得动那台"老办法"本身的几个开关：挑行业、写材质、给图片编号、定功效范围、写首屏和质检。
- 有**两件事得你先拍板**，不然执行的人只能猜：
  1. "奶渍、蛋白类污渍"到底写不写？商品名字只能证明血渍方向，奶渍得有说明书或资料撑腰才稳。
  2. 首屏文案走 A / B / C 哪个方向，还是让 AI 每次按商品资料自己定？
- 我的建议：**发一张新单专门改这台"老办法"**，把你这 14 条逐条写成验收标准。上面两个问题你给句话，我就写进单里。
- 这批我只查原因、没改软件；真实出图质量**不标通过**，等改完再跑一轮对照。

---

## 2. 一手证据：三屏提示词逐字摘录

| # | Owner 现象 | 屏 | 提示词原话（逐字） |
|---|---|---|---|
| 1 | 行业识别错 | 1/2/3 | `行业识别：家居百货；重点观察：款式结构、版型轮廓、面料肌理、袖口/领口/纽扣/拉链、穿着场景、模特比例和姿态、搭配关系。` |
| 2 | 行业禁忌串服装 | 1/2/3 | `行业禁忌：不要改款式结构；不要改变袖口层次、纽扣颜色和领口形态；不要让模特身份互相融合；不要把参考图衣服穿到目标商品上。` |
| 3 | 材质错误 | 1/2/3 | `真实材质/颜色：棉、白色瓶体、粉色与蓝色标签视觉、透明瓶盖`；`材质线索：棉。` |
| 4 | 功效扩大 | 1 | `【本屏卖点】适用于血渍、奶渍等蛋白类污渍的清洁，具体使用需结合物品洗护标识。` |
| 5 | 图片编号冲突 | 1 | `【本次图片编号】图1=商品图1「白底.jpg」` 与 `【画面任务】…商品图0中的完整按压泵瓶…`、`【模块指令】…以商品图0为唯一商品主体参考…`、`【参考图使用】…仅使用商品图0…`、`【模特与镜头】商品图0是唯一商品事实来源…` |
| 6 | 首屏文案偏弱 | 1 | `【本屏文案】血渍、奶渍等蛋白类污渍` + 标题 `第1屏：针对常见蛋白类污渍的清洁选择` |
| 7 | 全局风格塞叙事 | 1/2/3 | `【全局风格】…采用首屏建立商品认知、第二屏解释适用污渍与物品、第三屏降低使用判断成本的三段式节奏。` |
| 8 | 质检通用清单 | 1/2/3 | `【质检自查】商品是否变形…文案是否出现错字…是否出现虚假卖点…一组详情页的颜色…输出是否符合所选平台的页面节奏…平台规范：商品清晰；…`（8 条截断） |

> 改善 5 点同样属实：蛋白类污渍建立认知、`具体使用需结合物品洗护标识` 保守提示、三段式节奏意识、结构锁定更具体、画面任务明确主体位置与留白边界。

---

## 3. 根因定位（负责人视角）

### P0-1 行业服装规则残留 → 确定性行业选择没做强特征优先

- 拼装点：`server/detail-middleware.js:422`（`industrySkill.analyzeAttributes`）、`:427`（`industrySkill.taboos`）。
- 选择链：`:481` `aiIndustry()` 取 AI plan 的 `industryId/industryName/name/realSellingPoints/materials` 拼文本 → `prompts/server/detail-skills.js:403-412` `getIndustrySkillByText()` 用 `source.includes(keyword)` 逐词打分排序。
- 根因：`prompts/server/detail-skills.js:49` 服装关键词含单字 `包`、`模特`、`面料`；AI plan 的 `materials` / 卖点里出现「包装」「包装材质」即命中 apparel，与 home 的「清洁」形成双路径，**无强特征优先、无行业Id直连**。`[行业路由] Skill` 的「展示行业与规则行业取同一 industryId、强特征优先、弱语境词不越权」只写进了模型指令（S2-B），**没落进这段确定性选择代码**。
- 归属：**S2-C / 行业单一决策源工程项**。

### P0-2 「棉」写进真实材质 → 商品包装材质与使用对象材质未分离

- 拼装点：`server/detail-middleware.js:592` `[...(analysis.materialHints||[]), ...(analysis.colors||[])].slice(0,8).join("、")` → `真实材质/颜色`；`:423` 再输出一次 `材质线索：棉`。
- 来源：`:198` `materialHints = asArray(product.materials).length > 0 ? asArray(product.materials) : localAnalysis.materialHints` —— AI plan 的 `product.materials` **直接覆盖**了本地保守回退（`:281` `inferMaterials()` 原本会输出「瓶身及泵头材质无法仅凭图片确认」）。
- 根因：AI 把使用对象材质（衣物「棉」）写进 `product.materials`，工程未做「商品包装材质 / 使用对象材质 / 商品适用范围」三分离，也未把无证据项降级成 `mustNotClaim`。S2-B 的 `[事实分级映射]` 只在模型指令层。
- 归属：**S2-C / 商品事实分级落到输出**。

### P0-3 功效范围扩大 → AI 输出未做证据校验

- 拼装点：`server/detail-middleware.js:569` `selling = aiScreen?.sellingPoint || …` → `:612` `【本屏卖点】${selling}`。
- 根因：AI plan 的 `sellingPoint` 输出「奶渍等蛋白类污渍」，工程原样拼接；商品名仅支持血渍方向，奶渍/蛋白类无说明书证据，未走 `mustNotClaim` 拦截或降级措辞。
- 归属：**S2-C / 事实分级输出约束**。产品决策（是否扩大表达）需 Owner 拍板后写死。

### P0-4 图片编号冲突 → 工程编号与 AI 文本引用各写各的

- 工程侧：`:388` `label: 商品图${sourceIndex + 1}` → `:609` `【本次图片编号】图1=商品图1「白底.jpg」`。
- AI 文本侧：`:614` `aiScreen?.composition`、`:616` `promptDirectives`、`:617` `referenceReason`、`:618` `modelPolicyHint` 均为 AI plan 原文，内部自写「商品图0」。
- 根因：**无统一素材标识、无 AI 文本编号归一化**；工程按 1 起、AI 按 0 起。Owner 建议的 `product_01 = 白底.jpg / 类型 / 用途 / 本屏引用` 语义化清单是正确方向，且应顺带区分商品图/参考图/人物图类型标识。
- 归属：**S2-C / 素材清单与编号统一**（独立确定性问题，可与 S2-C 同单或独立工程单）。

### P1-5 全局风格塞进三段式节奏 → 叙事与视觉未分离

- 拼装点：`server/detail-middleware.js:424` `全局风格：${analysis.visualStyle}；…`，`visualStyle` 来自 AI plan，内含三段式节奏。
- 根因：AI 未区分「整组叙事策划」与「全局视觉 DNA」；工程也无字段拆分，导致 3 屏改 6 屏时全局风格仍强锁三段式。Owner 给出的正确边界：视觉 DNA = 粉蓝体系 / 字体 / 光影 / 背景质感 / 边距与排版层级；三段式节奏归整组策划数据。
- 归属：**S2-C / 整组策划数据与视觉 DNA 分离**。

### P1-6 质检是通用清单 → 缺本屏质检且被截断

- 拼装点：`server/detail-middleware.js:579-582` `buildQualityChecklist(platformSkill, industrySkill, moduleSkill)` + `aiScreen?.qualityChecks` → `:622` `qualityChecklist.slice(0, 8)`。
- 根因：`prompts/server/detail-skills.js:426-433` 只汇总通用 / 平台 / 行业 / 模块四类，无基于 `screenRole` / `communicationGoal` 的本屏项；且 `.slice(0,8)` 会把后追加的本屏项截掉。Owner 建议两层质检：通用（真实性 / 文字 / 合规）+ 本屏（是否完成商品定位、首眼能否识别、标题与商品关系、首屏吸引力、是否误用他行业规则）。
- 归属：**S2-C / 两层质检 + 去掉截断挤压**。

### P1-7 规则重复稀释 → 全局一次、单屏增量的约束未落地

- 重复分布：`:592` AI 洞察（结构锁定）、`:610` `globalLock`（商品真实性 / 行业 / 平台 / 文案规则）、`:616` 模块指令、`:618` 模特与镜头、`:623` 负面约束，多处复述「商品图唯一事实来源 / 标签不可改 / 结构不可改 / 不混入参考图」。
- 根因：`[跨屏一致] Skill` 已写「全局规则整组存一次、每屏精简约束」、`[视觉指导]` 已写「视觉 DNA 只声明一次」，但都停在模型指令层，编译链仍按旧结构全量重复。
- 归属：**S2-C / 规则去重与职责分离**（含 Owner 指出的「模块指令 vs 画面任务重复」）。

### P2-8 首屏文案偏弱 → 专业策略层，需 Owner 先定方向

- 现状：`【本屏文案】血渍、奶渍等蛋白类污渍` 为品类罗列，缺购买价值；Owner 给 A（建立商品认知）/ B（消费者需求切入）/ C（突出品类）三方向，并强调应由 Agent 按资料决定、不固定套句式。
- 归属：**产品/Agent 策略决策**。与 P0-3 同源（`奶渍`证据问题），需 Owner 拍板后写入 S2-C 验收标准。

---

## 4. S2-A/B 覆盖关系：为什么"规矩进去了"还不够

| Owner 问题 | 8 条规矩里已有的要求 | 落地状态 |
|---|---|---|
| 行业串服装 | `[行业路由]` 同一 industryId、强特征优先 | ❌ 只在模型指令，确定性选择代码未改 |
| 「棉」材质、功效扩大 | `[商品理解]` 三级事实分级、不得虚构 | ❌ 只在模型指令，输出未校验/降级 |
| 规则重复 | `[跨屏一致]` 全局存一次、每屏精简 | ❌ 只在模型指令，编译链仍全量重复 |
| 视觉与叙事混在一起 | `[视觉指导]` 整组 DNA 只声明一次 | ❌ 只在模型指令，无字段拆分 |
| 质检不查本屏 | `[质检]` 六维逐项记录 | ❌ 无本屏质检字段，且被 `slice(0,8)` 截断 |
| 文案不复述 | `[文案版式]` 相邻屏不语义复述 | ⚠️ 指令已进，输出偶发复述（本批未重点复现） |

**结论：8 条规矩覆盖了判断方向，但没有一条落到"最终提示词拼装"这段确定性代码。这正是 S2-C（编译链改造）的定义，也是本批反馈给出的最硬证据。**

---

## 5. S2-C 验收标准拆解（供发单引用）

### P0（高优先级，Owner 明确点名）

1. **行业单一决策源**：展示行业与规则行业取同一 `industryId`；强特征优先，弱语境词不越权；`包装/包材` 不得命中服装关键词；清洗剂三屏**零服装观察点、零服装禁忌**。配真实篡改负向对照。
2. **材质三分离**：`商品包装材质`（未知即写未知）/ `商品包装颜色`（可见项）/ `使用对象材质`（待确认）/ `商品适用范围`（须依标签、说明书或用户资料）；无证据项走 `mustNotClaim`，不得写进「真实材质/颜色」。
3. **功效证据边界**：商品名仅支持血渍方向；奶渍 / 蛋白类需证据，否则降级或删；保守措辞建议 `面向衣物血渍清洁需求，具体使用需结合产品说明及物品洗护标识`。
4. **素材编号统一**：语义化清单 `product_01 = 白底.jpg`（类型 / 用途 / 本屏引用），工程编号与 AI 文本引用一致；禁止同一提示词内 `图0` 与 `图1` 混用；商品图 / 参考图 / 人物图有独立类型标识。

### P1（结构问题，Owner 认为比改文案更重要）

5. **全局视觉 DNA 与整组叙事分离**：视觉只写色彩 / 字体 / 光影 / 背景 / 边距层级；三段式节奏移到整组策划数据；3 屏改 6 屏不得强锁三段式。
6. **规则去重与职责分离**：商品真实性全局只定义一次，单屏只补本屏特有约束；模块指令解释任务、画面任务描述执行方式，二者不互抄。
7. **两层质检**：通用（真实性 / 文字 / 合规）+ 本屏（基于 `screenRole` / `communicationGoal` 自动生成：是否完成商品定位、首眼识别、标题与商品关系、首屏吸引力、是否误用他行业规则）；取消 `.slice(0,8)` 对本屏项的截断挤压。

### P2（需 Owner 拍板后写入）

8. 首屏文案方向 A / B / C 或「按资料自主决定、不固定句式」。
9. 是否扩大奶渍 / 蛋白类营销表达（取决于是否有说明书证据）。

---

## 6. 不改清单 / 挂账

- **不改**：8 条专业规矩资产、已冻结词表、发布种子、S2-A 四项收窄映射、既有枚举值、G-2 红线；本轮未碰任何业务代码。
- **不虚标**：真实模型出图质量本批只做根因定位，不标通过；改完 S2-C 需再跑一轮同素材对照。
- **工作区**：干净，`git status --short` 为空；无在跑执行单，`进行中/` 仅 `.gitkeep`。
- **独立挂账**：`bundle-budget` 超预算技术债继续挂账，与本批无关。

---

## 7. 下一步

1. Owner 拍板 §5 的 P2 两项（奶渍证据 / 首屏文案方向）。
2. Owner 明确放行后，发布 **V221 / S2-C 编译链改造**执行单，把 §5 的 P0/P1 逐条转成验收标准与负向对照；施工交执行 AI，负责人只复核。
3. 改完后用同一份血渍清洗剂素材再跑三屏，按本报告 §2 逐条对照，确认 P0 四项全消失且不引入回归。
```


---

# 五、当前实际运行链路（代码片段）

> 下列片段均按当前 HEAD 的实际文件、绝对行号切片，保留完整函数上下文。行号格式为「行号 | 原文」。

## 5.1 `server/detail-ai.js`：Skill 注册、指令组装、注入模型请求

### 5.1.1 导入与 Skill 注册 / 指令表（第 1–59 行）

```js
   1 | import { createAbortSignal } from "./core/http-client.js";
   2 | import {
   3 |   BASE_SKILL,
   4 |   INDUSTRY_SKILLS,
   5 |   QUALITY_SKILL,
   6 |   SCREEN_MODULES,
   7 |   getIndustrySkillByText,
   8 |   getPlatformSkill
   9 | } from "./detail-skills.js";
  10 | import { clamp, extractJsonObject, fileMeta, modelName, postChatCompletion, responseContent, safeImagePart, shouldRetryWithoutImages, shouldRetryWithoutJsonFormat } from "./core/ai-chat-shared.js";
  11 | import { buildSkillPackV2, resolveDetailSkillVersion } from "./detail-skills-v2.js";
  12 | import { skillModuleV2, detailV2SkillRegistry } from "../prompts/server/detail-v2-planning/index.js";
  13 | 
  14 | const DEFAULT_DETAIL_ANALYSIS_MODEL = "gpt-5.6-luna"; // 2026-11-01 上游已下线 gpt-5.4-mini
  15 | const DETAIL_MODEL_SPEC = { fields: ["detailAnalysisModel", "textModel"], fallback: DEFAULT_DETAIL_ANALYSIS_MODEL };
  16 | const DETAIL_ANALYSIS_TIMEOUT_MS = 120000;
  17 | const MAX_AI_IMAGE_COUNT = 10;
  18 | 
  19 | // V220 / S2-B：注册表式条件注入的紧凑 Skill 指令层。
  20 | // 说明：8 个专业 Skill 的权威全文在 prompts/server/detail-v2-planning/skills/**/SKILL.md（阶段 A 已复核、只读消费）。
  21 | // 本文件被 esbuild bundle:true 打进服务端，运行时无法读 md，故按 detailV2SkillRegistry 的 id 装配一条
  22 | // "关键 directive" 注入模型上下文；每条 directive 含一句逐字摘自该 SKILL.md 规则段的短语，门禁据此回链取证，
  23 | // 证明指令源自专业资产而非凭空改写。新增 Skill 时须在 index.js 注册表登记，并在本表补 directive。
  24 | const V2_SKILL_DIRECTIVES = {
  25 |   "product-understanding": "[商品理解] 逐条做事实分级：图片直接可见=visible、有据但不可全确认=inferred、图片无法确认的功效/认证/疗效/销量/品牌背书=mustNotClaim；不得虚构材质、参数、认证、疗效、销量、品牌背书。",
  26 |   "industry-routing": "[行业路由] 展示行业与规则行业取同一 industryId，强特征优先、弱语境词不越权；禁止把清洗剂判为服装，不得跨品类串规则。",
  27 |   "consumer-marketing-strategy": "[消费者营销] 事实→需求→利益→表达四层策划，空洞参数罗列不算营销表达，每个卖点须落到对消费者的好处；消费者利益不得越过商品真实性。",
  28 |   "detail-story-planning": "[叙事规划] 屏数由 count 硬约束、板块只是偏好顺序；无板块时自主规划，禁止固定标题轮转，不得机械凑屏，每屏独立信息任务。",
  29 |   "visual-art-direction": "[视觉指导] 整组视觉 DNA 只声明一次、每屏带精简约束（含行业禁忌/主体锁）；六维差异须实质区分，禁止仅背景/颜色变化冒充差异。",
  30 |   "ecommerce-copy-layout": "[文案版式] 相邻屏文案不做语义复述；文案只引用 visible/inferred 事实，输出语种跟随 lang，质检建议不自动覆盖用户已确认文案。",
  31 |   "cross-screen-coherence": "[跨屏一致] 全局规则整组存一次、每屏精简约束；不能期待图片模型记住首屏，内容去重与视觉去重并行，重复源于内容不足时合并角色而非制造重复屏。",
  32 |   "detail-quality-control": "[质检] 严重错误不可被高分抵消（商品事实错误/虚假功效/行业错误一律 critical）；六维逐项记录，质检独立可选、只给建议、不自动覆盖提示词。"
  33 | };
  34 | 
  35 | // 由注册表派生 8 项注入视图：marker 来自注册表本体，directive 来自上表；顺序与注册表一致。
  36 | const V2_REGISTERED_SKILLS = detailV2SkillRegistry.map((skill) => ({
  37 |   id: skill.id,
  38 |   version: skill.version,
  39 |   marker: skill.marker,
  40 |   directive: V2_SKILL_DIRECTIVES[skill.id] || `[${skill.id}] 按该专业 Skill 规则执行，不得越过商品真实性。`
  41 | }));
  42 | 
  43 | // V219 §11.3 四项收窄偏差的双向映射说明（校准进 instruction，不改 outputSchema 既有枚举值）。
  44 | // 每项均给出"运行时值 ←→ 原文值"映射与不改枚举的声明，作为策划语义证据进入模型上下文。
  45 | const V2_CALIBRATION_DIRECTIVES = [
  46 |   "[事实分级映射] 运行时三级 visible|inferred|mustNotClaim 对应原文六级 observed/user_provided/verified → visible（其中 user_provided 视资料可靠度记 visible/inferred），inferred → inferred，unknown → inferred（须标注不可确认），prohibited → mustNotClaim；输出仍只用三级枚举，不改 schema 既有值。",
  47 |   "[内容角色映射] 原文十二角色 hero/problem/benefit/mechanism/usage/scenario/detail/comparison/evidence/trust/faq/conversion 为可扩展、可跳过、可调序的策划位，统一映射到现有 9 个 moduleId（hero|painReverse|coreSellingPoint|materialDetail|useScenario|specInfo|trustProof|conversionClose|fitStructure）：problem→painReverse、benefit→coreSellingPoint、mechanism/detail→materialDetail、usage/scenario→useScenario、evidence→specInfo、trust→trustProof、conversion/faq→conversionClose；角色可增可跳可调序，不新增 moduleId 枚举。",
  48 |   "[风险等级映射] 运行时三级 critical|major|minor 对应原文四级 critical|high|medium/low：critical→critical，high→major，medium/low→minor；输出仍只用三级枚举，不改 schema 既有值。",
  49 |   "[Schema 顶层归并] 原文 productProfile/uncertainties/groupQuality 三顶层归并承载于本契约既有顶层：productProfile→product，uncertainties→product.uncertainties 与 planning.facts[level=inferred|mustNotClaim]，groupQuality→qc；按 agent/output-contract.md 映射层转换，不新造第 10 个顶层键。"
  50 | ];
  51 | 
  52 | function industrySeedText(input) {
  53 |   return [
  54 |     input.productName,
  55 |     input.productFeature,
  56 |     input.sellingPoints,
  57 |     input.userInstruction
  58 |   ].join(" ");
  59 | }
```

### 5.1.2 `compactSkillPack` — 按空选条件装配 skillPack（第 61–129 行）

```js
  61 | function compactSkillPack(input, v2Context = null) {
  62 |   // 空板块 AI 自主规划（决策 #3，Owner A 裁决后为默认能力）：只要未选内容板块即视为规划态，
  63 |   // 不再以 v2Context（V2 风格包）为门控。与 buildDetailAnalysisContent 内的 planningActive 口径一致。
  64 |   const planningActive = !(Array.isArray(input.selectedSections) && input.selectedSections.length > 0);
  65 |   const platformSkill = getPlatformSkill(input.workflow);
  66 |   const industrySeed = industrySeedText(input);
  67 |   const industrySkill = getIndustrySkillByText(industrySeed);
  68 |   const pack = {
  69 |     base: {
  70 |       productAuthenticityLock: BASE_SKILL.productAuthenticityLock,
  71 |       screenCountRule: BASE_SKILL.screenCountRule,
  72 |       imageNumberRules: BASE_SKILL.imageNumberRules,
  73 |       globalStyleConsistency: BASE_SKILL.globalStyleConsistency
  74 |     },
  75 |     platform: {
  76 |       id: platformSkill.id,
  77 |       platform: platformSkill.platform,
  78 |       pageType: platformSkill.pageType,
  79 |       rhythm: platformSkill.rhythm,
  80 |       copyRule: platformSkill.copyRule,
  81 |       visualRule: platformSkill.visualRule,
  82 |       imageNorms: platformSkill.imageNorms,
  83 |       conversionTraits: platformSkill.conversionTraits
  84 |     },
  85 |     industryCandidates: Object.values(INDUSTRY_SKILLS).map((skill) => ({
  86 |       id: skill.id,
  87 |       name: skill.name,
  88 |       analyzeAttributes: skill.analyzeAttributes,
  89 |       sellingAngles: skill.sellingAngles,
  90 |       recommendedScreens: skill.recommendedScreens,
  91 |       taboos: skill.taboos,
  92 |       qcRules: skill.qcRules
  93 |     })),
  94 |     seedIndustry: {
  95 |       id: industrySkill.id,
  96 |       name: industrySkill.name
  97 |     },
  98 |     modules: Object.values(SCREEN_MODULES).map((module) => ({
  99 |       id: module.id,
 100 |       name: module.name,
 101 |       purpose: module.purpose,
 102 |       referenceNeed: module.referenceNeed,
 103 |       qcRules: module.qcRules
 104 |     })),
 105 |     quality: QUALITY_SKILL
 106 |   };
 107 |   // 自建 V2 规划 Skill：条件注入（仅 planningActive 即空板块默认路径时进入 skillPack）。
 108 |   // 保持 compactSkillPack(input, v2Context) 调用锚点不变；planningActive 在函数内部自算，非第三参数。
 109 |   // V220/S2-B：把 index.js 注册表的 8 个专业 Skill 以 {marker,directive} 视图挂进 planningSkill.registeredSkills。
 110 |   // 仍嵌在 planningSkill 内而非新开顶层键——旧门禁 stripPlanningSkill/N6/B12 的"仅空选注入"语义原样成立，
 111 |   // 且 skillModuleV2 本体导出字节不变；8 项由 detailV2SkillRegistry 派生，不再单对象硬编码。
 112 |   const planningSkillField = planningActive
 113 |     ? { planningSkill: { ...skillModuleV2, registeredSkills: V2_REGISTERED_SKILLS } }
 114 |     : {};
 115 |   if (!v2Context) return { ...pack, ...planningSkillField };
 116 |   return {
 117 |     ...pack,
 118 |     ...planningSkillField,
 119 |     stylePack: v2Context.stylePack,
 120 |     stylePackPool: v2Context.stylePackPool,
 121 |     stylePackPlatformNote: v2Context.platformNote,
 122 |     compositionVariants: v2Context.compositionVariants,
 123 |     stylePackDecision: {
 124 |       id: v2Context.decision.pack.id,
 125 |       name: v2Context.decision.pack.name,
 126 |       reason: v2Context.decision.reason
 127 |     }
 128 |   };
 129 | }
```

### 5.1.3 `buildDetailAnalysisContent` — 8 条 directive 注入 instruction（第 131–317 行）

```js
 131 | function buildDetailAnalysisContent(input, files, includeImages) {
 132 |   const productFiles = files.filter((file) => file.detailRole === "product");
 133 |   const referenceFiles = files.filter((file) => file.detailRole === "reference");
 134 |   const count = clamp(input.count, BASE_SKILL.screenCountRule.min, BASE_SKILL.screenCountRule.max, BASE_SKILL.screenCountRule.defaultCount);
 135 |   // V214 P1：客户可选内容板块。空选时为 null，客户板块相关条件分支不触发；
 136 |   // 但 A 裁决后空板块即默认规划路径，planningActive 为 true（V2 门控已解耦）。
 137 |   const selectedSections = Array.isArray(input.selectedSections) && input.selectedSections.length > 0
 138 |     ? input.selectedSections
 139 |     : null;
 140 |   const skillVersion = resolveDetailSkillVersion(input);
 141 |   const v2Context = skillVersion === "v2"
 142 |     ? buildSkillPackV2({
 143 |         input,
 144 |         platformSkill: getPlatformSkill(input.workflow),
 145 |         industrySkill: getIndustrySkillByText(industrySeedText(input))
 146 |       })
 147 |     : null;
 148 |   // R1（Owner A 裁决）：无板块 AI 自主规划为默认能力，不再附加 V2 风格包门控。
 149 |   // 仅以 selectedSections === null 判定空选——默认 v1/auto 请求也会注入规划 Skill 与契约。
 150 |   // 已选板块时走客户偏好分支；逐字节一致口径已收窄为「老前端不传新字段 / 显式关闭规划」兼容路径（§16.2）。
 151 |   const planningActive = selectedSections === null;
 152 |   const textPayload = {
 153 |     task: "完整 AI 详情页 Skill 分析与分屏提示词规划",
 154 |     instruction: [
 155 |       "你需要先分析商品图，再结合行业 Skill、平台 Skill、分屏模块库和质检 Skill，输出可直接用于图像生成的分屏 JSON。",
 156 |       "必须保护商品真实性。不要凭空发明材质、参数、认证、疗效、销量、品牌背书。",
 157 |       "productFileIndexes 和 referenceFileIndexes 必须使用 0 基索引，并且只能选择确实存在的图片。",
 158 |       "每屏只选择必要参考图，避免所有图片都进入同一屏导致主体漂移。",
 159 |       "如果无法从图片确认某个属性，请写成保守描述，不要假装确定。",
 160 |       "只输出 JSON，不要 Markdown，不要解释。",
 161 |       ...(skillVersion === "v2" && v2Context ? [
 162 |         `本组视觉风格已锁定为 ${v2Context.stylePack.id}《${v2Context.stylePack.name}》：色温/色调 ${v2Context.stylePack.colorTone}；布光 ${v2Context.stylePack.lighting}；构图族 ${v2Context.stylePack.compositionFamily}；背景 ${v2Context.stylePack.background}；字体气质 ${v2Context.stylePack.fontMood}。每一屏的 composition 必须体现该风格取值，全组禁止漂移到其它风格。`,
 163 |         `每屏必须在 compositionVariants 中该屏 moduleId 的变体里选择一个，将变体字母（A/B/C/D）写入 compositionVariantId 字段。变体已规定第一落点、视线动线、文案安全区与禁忌，composition 描述必须与所选变体兼容；不要自创构图，不要更换风格包取值。`,
 164 |         ...(v2Context.platformNote ? [v2Context.platformNote] : [])
 165 |       ] : []),
 166 |       ...(selectedSections ? [
 167 |         "客户已指定详情内容板块（selectedSections），按 order 作为叙事优先级组织分屏，尽可能遵循客户设定的先后顺序。",
 168 |         "允许按内容合理性合并或拆分客户板块；禁止一个板块机械对应一张图，禁止为满足板块数量凑屏或改变屏数，屏数仍由 screenCount 决定。",
 169 |         "不得虚构材质、参数、认证、疗效、销量、对比结果、品牌资质与品牌背书；图片中无法确认的商品事实不能当成事实输出。客户选择某板块不代表该事实存在，应改为保守表达或跳过无证据的具体断言。",
 170 |         "自定义板块（isCustom=true / moduleId=custom）与预设板块具有同等策划输入地位，须以 label 原文组织该屏文案；可为该屏填 moduleId=custom 并在 customLabel 写回客户原文，其余字段照常。"
 171 |       ] : []),
 172 |       // S1-b：空板块自主规划 Skill 指令（仅 planningActive 时注入，条件注入）
 173 |       ...(planningActive ? [
 174 |         ...skillModuleV2.directives,
 175 |         ...skillModuleV2.constraints,
 176 |         // V220/S2-B：8 个专业 Skill 的关键 directive + 4 项收窄偏差的双向映射说明
 177 |         ...V2_REGISTERED_SKILLS.map((skill) => skill.directive),
 178 |         ...V2_CALIBRATION_DIRECTIVES
 179 |       ] : [])
 180 |     ],
 181 |     input: {
 182 |       workflow: input.workflow,
 183 |       productName: input.productName,
 184 |       productFeature: input.productFeature,
 185 |       userInstruction: input.userInstruction,
 186 |       sellingPoints: input.sellingPoints,
 187 |       copywriting: input.copywriting,
 188 |       richness: input.richness,
 189 |       fontStyle: input.fontStyle,
 190 |       modelMode: input.modelMode,
 191 |       modelPose: input.modelPose,
 192 |       modelUsage: input.modelUsage,
 193 |       reverseScreens: input.reverseScreens,
 194 |       lang: input.lang,
 195 |       ratio: input.ratio,
 196 |       imageSize: input.imageSize,
 197 |       screenCount: count,
 198 |       ...(selectedSections ? { selectedSections } : {})
 199 |     },
 200 |     images: {
 201 |       productImages: productFiles.map((file, index) => fileMeta(file, { index, role: "product" })),
 202 |       referenceImages: referenceFiles.map((file, index) => fileMeta(file, { index, role: "reference" }))
 203 |     },
 204 |     skillPack: compactSkillPack(input, v2Context),
 205 |     outputSchema: {
 206 |       // V220/S2-B：按 V219 planning-result.schema.json 的 9 顶层键增补（agent/output-contract.md 兼容映射）。
 207 |       // 新增 schemaVersion/industryProfile/consumerInsights/marketingStrategy/globalVisualDNA 均为可选契约提示；
 208 |       // 旧 product/strategy/screens/qc/planning 字段一律不删、不改字节语义。
 209 |       schemaVersion: "string（固定 \"1.0.0\"；可选）",
 210 |       product: {
 211 |         name: "string",
 212 |         industryId: "apparel|beauty|food|home|electronics|motherBaby|pet|jewelry|sports|generic",
 213 |         industryName: "string",
 214 |         targetAudience: "string",
 215 |         materials: ["string"],
 216 |         colors: ["string"],
 217 |         structureLocks: ["string"],
 218 |         realSellingPoints: ["string"],
 219 |         riskNotes: ["string"],
 220 |         styleDirection: "string",
 221 |         uncertainties: ["{ claim: string, reason: string }（可选：图片无法确认事项，不作确定事实）"]
 222 |       },
 223 |       industryProfile: {
 224 |         industryId: "string（可选：展示=规则同一决策，强特征优先）",
 225 |         industryName: "string（可选）",
 226 |         evidence: ["string（可选：只引用 visible/inferred 事实）"],
 227 |         decisionLogic: "string（可选）",
 228 |         confidence: "high|medium|low（可选）",
 229 |         uncertaintyNote: "string（可选）"
 230 |       },
 231 |       consumerInsights: {
 232 |         audience: "string（可选）",
 233 |         needs: ["{ need: string, evidenceRef: string }（可选）"]
 234 |       },
 235 |       marketingStrategy: {
 236 |         valueLadder: ["{ fact: string, need: string, benefit: string, expression: string }（可选）"],
 237 |         tone: "string（可选）",
 238 |         boundaries: ["string（可选：行业禁忌与真实性边界）"]
 239 |       },
 240 |       globalVisualDNA: {
 241 |         palette: "string（可选：整组色调，只声明一次）",
 242 |         texture: "string（可选）",
 243 |         lighting: "string（可选：整组装统一布光）",
 244 |         cameraLanguage: "string（可选）",
 245 |         ratio: "string（可选）",
 246 |         tone: "string（可选）",
 247 |         integrityLocks: ["string（可选：主体/中文标签/行业禁忌锁，每屏精简约束保留）"]
 248 |       },
 249 |       strategy: {
 250 |         globalStyle: "string",
 251 |         copywritingTone: "string",
 252 |         pageRhythm: ["string"],
 253 |         platformNotes: ["string"],
 254 |         consistencyRules: ["string"]
 255 |       },
 256 |       screens: [
 257 |         {
 258 |           screen: 1,
 259 |           moduleId: "hero|painReverse|coreSellingPoint|materialDetail|useScenario|specInfo|trustProof|conversionClose|fitStructure",
 260 |           title: "string",
 261 |           summary: "string",
 262 |           sellingPoint: "string",
 263 |           composition: "string",
 264 |           copywriting: "string",
 265 |           productFileIndexes: [0],
 266 |           referenceFileIndexes: [0],
 267 |           referenceReason: "string",
 268 |           modelPolicyHint: "string",
 269 |           promptDirectives: ["string"],
 270 |           negativeConstraints: ["string"],
 271 |           qualityChecks: ["string"],
 272 |           ...(skillVersion === "v2" ? {
 273 |             compositionVariantId: "string（可选：该屏 moduleId 对应变体的字母 A/B/C/D 或完整 id 如 hero-A；无效时服务端按规则分配）"
 274 |           } : {})
 275 |         }
 276 |       ],
 277 |       qc: {
 278 |         globalChecks: ["string"],
 279 |         commonFailureRisks: ["string"],
 280 |         retryAdvice: ["string"]
 281 |       },
 282 |       // S1-b 规划契约（仅 planningActive 时写入 outputSchema，供模型产出 planning 顶层结果）
 283 |       ...(planningActive ? {
 284 |         planning: {
 285 |           narrative: { id: "string", reason: "string", confidence: "string" },
 286 |           screenRoles: [{ index: 0, role: "hero", sectionRefs: ["string"] }],
 287 |           facts: [{ claim: "string", level: "visible|inferred|mustNotClaim" }],
 288 |           dedupLog: ["string"]
 289 |         }
 290 |       } : {})
 291 |     }
 292 |   };
 293 | 
 294 |   const content = [
 295 |     {
 296 |       type: "text",
 297 |       text: JSON.stringify(textPayload, null, 2)
 298 |     }
 299 |   ];
 300 | 
 301 |   if (!includeImages) return content;
 302 | 
 303 |   let attachedCount = 0;
 304 |   for (const [role, list] of [["product", productFiles], ["reference", referenceFiles]]) {
 305 |     for (const [index, file] of list.entries()) {
 306 |       if (attachedCount >= MAX_AI_IMAGE_COUNT) break;
 307 |       content.push({
 308 |         type: "text",
 309 |         text: `${role === "product" ? "产品图" : "参考图"} ${role}Image[${index}]：${file.originalname || `${role}-${index + 1}`}`
 310 |       });
 311 |       content.push(safeImagePart(file, "low"));
 312 |       attachedCount += 1;
 313 |     }
 314 |   }
 315 | 
 316 |   return content;
 317 | }
```

### 5.1.4 `buildDetailChatBody` + `createDetailAiPlan` — 请求体与单次模型调用（第 319–401 行）

```js
 319 | function buildDetailChatBody(input, files, includeImages, withJsonFormat) {
 320 |   const body = {
 321 |     model: modelName(input, DETAIL_MODEL_SPEC),
 322 |     temperature: 0.2,
 323 |     messages: [
 324 |       {
 325 |         role: "system",
 326 |         content: "你是资深电商详情页视觉策略总监、商品真实性审校员和 AI 生图提示词架构师。你必须用中文输出严格 JSON。"
 327 |       },
 328 |       {
 329 |         role: "user",
 330 |         content: buildDetailAnalysisContent(input, files, includeImages)
 331 |       }
 332 |     ]
 333 |   };
 334 |   if (withJsonFormat) body.response_format = { type: "json_object" };
 335 |   return body;
 336 | }
 337 | 
 338 | async function createDetailAiPlan({ input = {}, files = [], apiKey, baseUrls = [], timeoutMs = DETAIL_ANALYSIS_TIMEOUT_MS }) {
 339 |   if (!apiKey) throw new Error("缺少 API Key，无法调用详情 AI 分析模型");
 340 |   const candidates = baseUrls.filter(Boolean);
 341 |   if (candidates.length === 0) throw new Error("没有可用的渠道地址");
 342 | 
 343 |   const startedAt = Date.now();
 344 |   const attempts = [];
 345 |   const abort = createAbortSignal(timeoutMs);
 346 | 
 347 |   try {
 348 |     for (const baseUrl of candidates) {
 349 |       for (const mode of [
 350 |         { includeImages: true, withJsonFormat: true },
 351 |         { includeImages: true, withJsonFormat: false },
 352 |         { includeImages: false, withJsonFormat: true },
 353 |         { includeImages: false, withJsonFormat: false }
 354 |       ]) {
 355 |         const { url, response, parsed } = await postChatCompletion({
 356 |           baseUrl,
 357 |           apiKey,
 358 |           body: buildDetailChatBody(input, files, mode.includeImages, mode.withJsonFormat),
 359 |           signal: abort.signal
 360 |         });
 361 |         const message = parsed.json?.error?.message || parsed.text || `HTTP ${response.status}`;
 362 |         attempts.push({
 363 |           url,
 364 |           status: response.status,
 365 |           ok: response.ok,
 366 |           includeImages: mode.includeImages,
 367 |           withJsonFormat: mode.withJsonFormat,
 368 |           message: String(message).slice(0, 260)
 369 |         });
 370 | 
 371 |         if (!response.ok && mode.withJsonFormat && shouldRetryWithoutJsonFormat(response.status, message)) continue;
 372 |         if (!response.ok && mode.includeImages && shouldRetryWithoutImages(response.status, message)) continue;
 373 |         if (!response.ok) break;
 374 | 
 375 |         const content = responseContent(parsed.json);
 376 |         const plan = extractJsonObject(content, "AI 分析模型");
 377 |         return {
 378 |           ok: true,
 379 |           model: modelName(input, DETAIL_MODEL_SPEC),
 380 |           usedBaseUrl: baseUrl,
 381 |           mode: mode.includeImages ? "ai-vision" : "ai-text",
 382 |           timing: {
 383 |             totalMs: Date.now() - startedAt
 384 |           },
 385 |           attempts,
 386 |           plan
 387 |         };
 388 |       }
 389 |     }
 390 |   } finally {
 391 |     abort.dispose();
 392 |   }
 393 | 
 394 |   const last = attempts[attempts.length - 1];
 395 |   throw new Error(last?.message || "详情 AI 分析失败");
 396 | }
 397 | 
 398 | export {
 399 |   DEFAULT_DETAIL_ANALYSIS_MODEL,
 400 |   createDetailAiPlan
 401 | };
```

## 5.2 `server/detail-middleware.js`：全局规则、单屏提示词编译、17 槽位组装

### 5.2.1 `inferIndustry` / `aiIndustry` — 行业判定（第 91–113 行）

```js
  91 | function inferIndustry(input, productImages) {
  92 |   const text = [
  93 |     input.productName,
  94 |     input.productFeature,
  95 |     input.userInstruction,
  96 |     input.sellingPoints,
  97 |     ...productImages.map((item) => item.name)
  98 |   ].join(" ");
  99 |   return getIndustrySkillByText(text);
 100 | }
 101 | 
 102 | function aiIndustry(input, productImages, aiPlan) {
 103 |   const aiText = [
 104 |     aiPlan?.product?.industryId,
 105 |     aiPlan?.product?.industryName,
 106 |     aiPlan?.product?.name,
 107 |     ...(Array.isArray(aiPlan?.product?.realSellingPoints) ? aiPlan.product.realSellingPoints : []),
 108 |     ...(Array.isArray(aiPlan?.product?.materials) ? aiPlan.product.materials : [])
 109 |   ].join(" ");
 110 |   const skill = getIndustrySkillByText(aiText);
 111 |   return skill.id !== "generic" ? skill : inferIndustry(input, productImages);
 112 | }
 113 | 
```

### 5.2.2 `mergeAiAnalysis` / `inferMaterials` / `buildProductAnalysis` — AI 洞察来源（第 173–291 行）

```js
 173 | function mergeAiAnalysis(localAnalysis, aiPlan, aiMeta, aiError) {
 174 |   if (!aiPlan) {
 175 |     return {
 176 |       ...localAnalysis,
 177 |       ...(aiError ? {
 178 |         aiError,
 179 |         limitation: `AI 分析未完成，已切回本地五层 Skill 兜底。失败原因：${aiError}`
 180 |       } : {})
 181 |     };
 182 |   }
 183 | 
 184 |   const product = aiPlan.product || {};
 185 |   const strategy = aiPlan.strategy || {};
 186 |   const sellingPoints = uniqueList([
 187 |     ...asArray(product.realSellingPoints),
 188 |     ...asArray(strategy.pageRhythm),
 189 |     ...localAnalysis.sellingPoints
 190 |   ]);
 191 | 
 192 |   return {
 193 |     ...localAnalysis,
 194 |     mode: aiMeta?.mode || "ai-vision",
 195 |     confidence: aiMeta?.mode === "ai-vision" ? "high" : "medium",
 196 |     industry: asText(product.industryName, localAnalysis.industry),
 197 |     targetAudience: asText(product.targetAudience, localAnalysis.targetAudience),
 198 |     materialHints: asArray(product.materials).length > 0 ? asArray(product.materials) : localAnalysis.materialHints,
 199 |     sellingPoints: sellingPoints.length > 0 ? sellingPoints : localAnalysis.sellingPoints,
 200 |     visualStyle: asText(strategy.globalStyle || product.styleDirection, localAnalysis.visualStyle),
 201 |     productLocks: asArray(product.structureLocks),
 202 |     colors: asArray(product.colors),
 203 |     riskNotes: asArray(product.riskNotes),
 204 |     aiModel: aiMeta?.model || "",
 205 |     aiTiming: aiMeta?.timing || null,
 206 |     limitation: aiMeta?.mode === "ai-vision"
 207 |       ? "已调用 AI 文本/视觉模型读取商品图，并由五层 Skill 做规则约束、分屏规划和提示词安全清洗。"
 208 |       : "已调用 AI 文本模型做策略规划；当前模型未完成图片读取时，商品事实仍以用户输入和本地 Skill 兜底为准。"
 209 |   };
 210 | }
 211 | 
 212 | function inferAudience(input, industrySkill) {
 213 |   const text = `${input.productName || ""} ${input.productFeature || ""} ${input.userInstruction || ""}`;
 214 |   if (/女装|裙|通勤|轻熟|温柔|少女|辣妹|显瘦/.test(text)) return "女性消费者，关注版型、显瘦、面料质感和穿搭场景";
 215 |   if (/男装|男士|商务|通勤/.test(text)) return "男性消费者，关注质感、实用性、版型和场景适配";
 216 |   if (/儿童|宝宝|母婴|童装|亲子/.test(text)) return "亲子/家庭用户，关注安全、舒适、真实使用和清洁便利";
 217 |   if (industrySkill.id === "electronics") return "理性决策用户，关注参数、功能、可靠性和兼容场景";
 218 |   if (industrySkill.id === "beauty") return "审美与体验型用户，关注包装质感、肤感表达和使用仪式感";
 219 |   if (industrySkill.id === "food") return "日常消费用户，关注口感联想、包装规格、食用场景和信任感";
 220 |   return "电商浏览用户，关注第一眼质感、核心卖点、真实细节和购买理由";
 221 | }
 222 | 
 223 | function inferMaterials(input, industrySkill) {
 224 |   const text = `${input.productName || ""} ${input.productFeature || ""} ${input.userInstruction || ""} ${input.sellingPoints || ""}`;
 225 |   const candidates = [
 226 |     "棉",
 227 |     "羊毛",
 228 |     "针织",
 229 |     "雪纺",
 230 |     "牛仔",
 231 |     "皮革",
 232 |     "亚麻",
 233 |     "丝绸",
 234 |     "蕾丝",
 235 |     "玻璃",
 236 |     "金属",
 237 |     "木质",
 238 |     "陶瓷",
 239 |     "塑料",
 240 |     "硅胶",
 241 |     "不锈钢",
 242 |     "亚克力",
 243 |     "真皮",
 244 |     "珍珠",
 245 |     "黄金",
 246 |     "银饰"
 247 |   ];
 248 |   const matched = candidates.filter((item) => text.includes(item));
 249 |   if (matched.length > 0) return matched;
 250 |   return [`以${industrySkill.name}商品图中的真实材质为准，重点保留表面纹理、结构边缘和工艺细节`];
 251 | }
 252 | 
 253 | function inferVisualStyle(input, referenceImages, industrySkill, platformSkill) {
 254 |   const text = `${input.userInstruction || ""} ${input.productFeature || ""} ${referenceImages.map((item) => item.name).join(" ")}`;
 255 |   if (/极简|白墙|浅色|咖啡馆|草坪|柔粉|米色/.test(text)) return "浅色极简、电商高级感、柔和低反差";
 256 |   if (/赛博|科技|未来|金属|冷光/.test(text)) return "科技感、结构化光线、冷静高对比";
 257 |   if (/复古|胶片|法式|中古/.test(text)) return "复古生活方式、柔和颗粒、暖色调";
 258 |   if (/小红书|种草|生活方式/.test(`${platformSkill.platform} ${text}`)) return "自然生活方式、真实氛围、轻商业感";
 259 |   return industrySkill.visualAnchors.join("、");
 260 | }
 261 | 
 262 | function buildProductAnalysis(input, productImages, referenceImages, industrySkill, platformSkill) {
 263 |   const providedFeatures = parseList(input.productFeature);
 264 |   const providedSelling = parseList(input.sellingPoints);
 265 |   const imageFacts = productImages.map((item) => {
 266 |     const ratio = item.width && item.height ? `${item.width}x${item.height}` : "未读取尺寸";
 267 |     return `${item.name} / ${item.type || "未知类型"} / ${ratio}`;
 268 |   });
 269 |   const sellingPoints = uniqueList([
 270 |     ...providedSelling,
 271 |     ...providedFeatures.slice(0, 4),
 272 |     ...industrySkill.sellingAngles
 273 |   ]);
 274 | 
 275 |   return {
 276 |     mode: input.analysisMode === "ai" ? "ai-ready-fallback" : "local-rule",
 277 |     confidence: productImages.some((item) => item.hasPixels) ? "medium" : "low",
 278 |     industry: industrySkill.name,
 279 |     platform: platformSkill.platform,
 280 |     targetAudience: inferAudience(input, industrySkill),
 281 |     materialHints: inferMaterials(input, industrySkill),
 282 |     analyzeAttributes: industrySkill.analyzeAttributes,
 283 |     sellingPoints,
 284 |     visualStyle: inferVisualStyle(input, referenceImages, industrySkill, platformSkill),
 285 |     imageFacts,
 286 |     limitation: input.analysisMode === "ai"
 287 |       ? "当前版本已接收商品原图，但未额外调用视觉分析模型；在渠道确认支持文本/视觉分析并配置中间件计费前，仍使用本地 Skill 规则规划。"
 288 |       : "本地 Skill 规划不会额外消耗 AI 分析费用；真正视觉识别可在后续接入中间件接口。"
 289 |   };
 290 | }
 291 | 
```

### 5.2.3 `buildImageSlots` / `imageSlotText` — 图片编号（第 380–413 行）

```js
 380 | function buildImageSlots(productImages, referenceImages, plan) {
 381 |   const slots = [];
 382 |   for (const sourceIndex of plan.productFileIndexes) {
 383 |     const image = productImages[sourceIndex];
 384 |     if (!image) continue;
 385 |     slots.push({
 386 |       slot: slots.length + 1,
 387 |       role: "product",
 388 |       label: `商品图${sourceIndex + 1}`,
 389 |       sourceIndex,
 390 |       name: image.name
 391 |     });
 392 |   }
 393 |   for (const sourceIndex of plan.referenceFileIndexes) {
 394 |     const image = referenceImages[sourceIndex];
 395 |     if (!image) continue;
 396 |     slots.push({
 397 |       slot: slots.length + 1,
 398 |       role: "reference",
 399 |       label: `参考图${sourceIndex + 1}`,
 400 |       sourceIndex,
 401 |       name: image.name
 402 |     });
 403 |   }
 404 |   return slots;
 405 | }
 406 | 
 407 | function imageSlotText(slots) {
 408 |   if (!slots.length) return "本屏没有可用图片附件，请根据文字描述生成，但必须保持商品真实性约束。";
 409 |   return slots.map((item) => (
 410 |     `图${item.slot}=${item.label}「${item.name}」`
 411 |   )).join("；");
 412 | }
 413 | 
```

### 5.2.4 `buildGlobalLock` / `buildRounds` — 全局规则（第 418–466 行）

```js
 418 | function buildGlobalLock({ input, platformSkill, industrySkill, analysis, productName, ratio, imageSize, lang, copywriting }) {
 419 |   return [
 420 |     `目标平台：${platformSkill.platform}${platformSkill.pageType}；输出语言：${lang}；比例：${ratio}；分辨率：${imageSize}。`,
 421 |     `目标商品：只以商品图里的「${productName}」为准，${BASE_SKILL.productAuthenticityLock.join(" ")}`,
 422 |     `行业识别：${analysis.industry}；重点观察：${industrySkill.analyzeAttributes.join("、")}。`,
 423 |     `受众：${analysis.targetAudience}；材质线索：${analysis.materialHints.join("、")}。`,
 424 |     `全局风格：${analysis.visualStyle}；${BASE_SKILL.globalStyleConsistency.join(" ")}`,
 425 |     `平台规则：${platformSkill.visualRule} ${platformSkill.copyRule}`,
 426 |     `文案规则：${copywritingText(copywriting)}；字体规则：${fontPolicy(input.fontStyle, copywriting)}；信息密度：${richnessPolicy(input.richness)}。`,
 427 |     `行业禁忌：${industrySkill.taboos.join("；")}。`
 428 |   ].join("\n");
 429 | }
 430 | 
 431 | function buildRounds(platformSkill, industrySkill, analysis, count, reverseScreens) {
 432 |   return [
 433 |     {
 434 |       stage: "通用底座",
 435 |       title: "真实性、格式、数量和编号",
 436 |       content: [
 437 |         BASE_SKILL.productAuthenticityLock.join("；"),
 438 |         `输出 JSON 字段：${BASE_SKILL.outputJsonFormat.requiredGroupFields.join("、")}；每屏字段：${BASE_SKILL.outputJsonFormat.requiredPromptFields.join("、")}。`,
 439 |         `分屏数量：${count}，允许范围 ${BASE_SKILL.screenCountRule.min}-${BASE_SKILL.screenCountRule.max}。`,
 440 |         BASE_SKILL.imageNumberRules.join("；"),
 441 |         BASE_SKILL.globalStyleConsistency.join("；")
 442 |       ].join("\n")
 443 |     },
 444 |     {
 445 |       stage: "行业 Skill",
 446 |       title: industrySkill.name,
 447 |       content: `分析属性：${industrySkill.analyzeAttributes.join("、")}。\n推荐卖点：${industrySkill.sellingAngles.join("、")}。\n行业禁忌：${industrySkill.taboos.join("、")}。`
 448 |     },
 449 |     {
 450 |       stage: "平台 Skill",
 451 |       title: `${platformSkill.platform}${platformSkill.pageType}`,
 452 |       content: `页面节奏：${platformSkill.rhythm.join(" -> ")}。\n文案风格：${platformSkill.copyRule}\n图片规范：${platformSkill.imageNorms.join("、")}。\n转化特点：${platformSkill.conversionTraits.join("、")}。`
 453 |     },
 454 |     {
 455 |       stage: "分屏模块库",
 456 |       title: `本组 ${count} 屏，反转屏 ${reverseScreens} 屏`,
 457 |       content: `可用模块：${Object.values(SCREEN_MODULES).map((module) => module.name).join("、")}。本组会按平台节奏、行业卖点和反转屏数量动态分配。`
 458 |     },
 459 |     {
 460 |       stage: "质检 Skill",
 461 |       title: "生成前后自查",
 462 |       content: `全局质检：${QUALITY_SKILL.globalChecks.join("；")}。\n负面约束：${QUALITY_SKILL.negativePrompt.join("、")}。\n规划模式：${analysis.limitation}`
 463 |     }
 464 |   ];
 465 | }
 466 | 
```

### 5.2.5 `buildDetailPromptGroup` — 单屏提示词编译 + 17 槽位组装 + 导出（第 467–720 行，至文件末行）

```js
 467 | function buildDetailPromptGroup(input = {}, files = [], options = {}) {
 468 |   const count = clamp(input.count, BASE_SKILL.screenCountRule.min, BASE_SKILL.screenCountRule.max, DEFAULT_COUNT);
 469 |   const workflow = String(input.workflow || "taobao-detail").trim();
 470 |   const platformSkill = getPlatformSkill(workflow);
 471 |   const skillVersion = resolveDetailSkillVersion(input);
 472 |   const rawStyleDecision = skillVersion === "v2"
 473 |     ? stylePackForGroup({ groupIndex: input.detailGroupIndex, platformSkill, userChoice: input.stylePackId })
 474 |     : null;
 475 |   const styleDecision = rawStyleDecision && rawStyleDecision.pack ? rawStyleDecision : null;
 476 |   const productFiles = files.filter((file) => file.detailRole === "product");
 477 |   const referenceFiles = files.filter((file) => file.detailRole === "reference");
 478 |   const productImages = assetsFromInput(input.productImages, productFiles, "product");
 479 |   const referenceImages = assetsFromInput(input.referenceImages, referenceFiles, "reference");
 480 |   const aiPlan = options.aiPlan || null;
 481 |   const industrySkill = aiPlan ? aiIndustry(input, productImages, aiPlan) : inferIndustry(input, productImages);
 482 |   const localAnalysis = buildProductAnalysis(input, productImages, referenceImages, industrySkill, platformSkill);
 483 |   const analysis = mergeAiAnalysis(localAnalysis, aiPlan, options.aiMeta, options.aiError);
 484 |   const productName = String(input.productName || "").trim() || "目标产品";
 485 |   const ratio = String(input.ratio || "21:9").trim();
 486 |   const imageSize = String(input.imageSize || "2K").trim();
 487 |   const model = String(input.model || "gpt-image").trim();
 488 |   const lang = String(input.lang || "中文").trim() || "中文";
 489 |   const copywriting = String(input.copywriting || "need") === "none" ? "poster" : String(input.copywriting || "need");
 490 |   const reverseScreens = clamp(input.reverseScreens, 0, 4, 0);
 491 |   const sellingList = analysis.sellingPoints.length > 0 ? analysis.sellingPoints : industrySkill.sellingAngles;
 492 |   // V214 P1：客户可选内容板块。空选时为 null，所有条件分支不触发，输出与改造前逐字节一致。
 493 |   const selectedSections = Array.isArray(input.selectedSections) && input.selectedSections.length > 0
 494 |     ? input.selectedSections
 495 |     : null;
 496 |   const aiScreens = normalizeAiScreens(aiPlan, count, productImages.length, referenceImages.length);
 497 |   // R1（Owner A 裁决）：无板块 AI 自主规划为默认能力，不再以 styleDecision/V2 风格包为门控。
 498 |   // 仅以 selectedSections === null 判定空选——默认 v1/auto 请求也走规划分支，标题由 AI screenRoles/title
 499 |   // 驱动；首屏确定性绑定 hero 角色但不写死标题文字；AI 缺屏/失败走最小占位，绝不回退 seedTitles[index%len]。
 500 |   // 逐字节一致口径已收窄为兼容路径（§16.2）；styleDecision 仅继续用于 17 槽位风格锁，不再参与规划门控。
 501 |   const v2Planning = selectedSections === null;
 502 |   let screenTitles;
 503 |   // R1：首屏确定性 hero 角色（仅规划态）。标题文字仍由 AI title/screenRoles 驱动，绝不写死；
 504 |   // 模型 planning.screenRoles 的 sectionRefs 供下方 moduleSkill 优先级使用（§5.2 落点 4）。
 505 |   const planningScreenRoles = v2Planning
 506 |     ? Array.from({ length: count }, (_, i) => {
 507 |         const fromModel = Array.isArray(aiPlan?.planning?.screenRoles)
 508 |           ? aiPlan.planning.screenRoles.find((role) => Number(role?.index) === i)
 509 |           : null;
 510 |         return {
 511 |           index: i,
 512 |           role: i === 0 ? "hero" : String(fromModel?.role || aiScreens[i]?.role || "content"),
 513 |           sectionRefs: Array.isArray(fromModel?.sectionRefs) ? fromModel.sectionRefs : []
 514 |         };
 515 |       })
 516 |     : [];
 517 |   if (v2Planning) {
 518 |     screenTitles = aiScreens.length > 0
 519 |       ? aiScreens.map((screen, screenIndex) => String(screen.title || "").trim() || `第${screenIndex + 1}屏`)
 520 |       : Array.from({ length: count }, (_, i) => `第${i + 1}屏`);
 521 |   } else {
 522 |     // 旧路径（V2 未启用 / 已选板块）：保持 S0 逐字节一致。
 523 |     const fallbackScreenTitles = buildScreenTitles(count, platformSkill, industrySkill, reverseScreens);
 524 |     const fallbackWithSections = selectedSections
 525 |       ? fallbackScreenTitles.map((title, sectionIndex) => {
 526 |           const section = selectedSections[sectionIndex % selectedSections.length];
 527 |           return String(section?.label || "").trim() || title;
 528 |         })
 529 |       : fallbackScreenTitles;
 530 |     screenTitles = aiScreens.length > 0
 531 |       ? aiScreens.map((screen, screenIndex) => screen.title || SCREEN_MODULES[screen.moduleId]?.name || fallbackWithSections[screenIndex])
 532 |       : fallbackWithSections;
 533 |   }
 534 |   const createdAt = Date.now();
 535 | 
 536 |   const globalLock = buildGlobalLock({
 537 |     input,
 538 |     platformSkill,
 539 |     industrySkill,
 540 |     analysis,
 541 |     productName,
 542 |     ratio,
 543 |     imageSize,
 544 |     lang,
 545 |     copywriting
 546 |   });
 547 | 
 548 |   const prompts = screenTitles.map((title, index) => {
 549 |     const aiScreen = aiScreens[index] || null;
 550 |     // V214 P1：客户板块按屏循环复用，仅作模块归类兜底；AI 已给 moduleId 时以 AI 为准。
 551 |     const activeSection = selectedSections ? selectedSections[index % selectedSections.length] : null;
 552 |     // R1（§5.2 落点 4）：规划态归类优先级 = 首屏 hero 确定性绑定 > AI moduleId > sectionRefs > 客户板块 > getScreenModule。
 553 |     // 有板块路径（selectedSections 非 null）完全沿用旧优先级，保证兼容路径逐字节一致。
 554 |     const planningRole = v2Planning ? planningScreenRoles[index] : null;
 555 |     const sectionRefModule = planningRole
 556 |       ? (planningRole.sectionRefs || []).map((ref) => SCREEN_MODULES[String(ref).trim()]
 557 |           || Object.values(SCREEN_MODULES).find((module) => module.id === String(ref).trim() || module.name === String(ref).trim())).find(Boolean)
 558 |       : null;
 559 |     const moduleSkill = (v2Planning && index === 0)
 560 |       ? SCREEN_MODULES.hero
 561 |       : SCREEN_MODULES[aiScreen?.moduleId]
 562 |         || Object.values(SCREEN_MODULES).find((module) => module.name === aiScreen?.moduleId)
 563 |         || sectionRefModule
 564 |         || (activeSection && SCREEN_MODULES[activeSection.moduleId])
 565 |         || getScreenModule(aiScreen?.title || title, index, count);
 566 |     const mainFirstScreen = platformSkill.pageType === "主图" && index === 0;
 567 |     const screenPack = styleDecision ? (mainFirstScreen ? STYLE_PACKS.S1 : styleDecision.pack) : null;
 568 |     const variant = screenPack ? variantFor(moduleSkill.id, index, screenPack, input.detailGroupIndex, aiScreen?.compositionVariantId) : null;
 569 |     const selling = aiScreen?.sellingPoint || aiScreen?.summary || sellingList[index % sellingList.length] || moduleSkill.name;
 570 |     const rulePlan = referencePlanForScreen(index, count, productImages, referenceImages, moduleSkill);
 571 |     const plan = aiScreen
 572 |       ? {
 573 |           productFileIndexes: aiScreen.productFileIndexes.length > 0 ? aiScreen.productFileIndexes : rulePlan.productFileIndexes,
 574 |           referenceFileIndexes: aiScreen.referenceFileIndexes
 575 |         }
 576 |       : rulePlan;
 577 |     if (plan.productFileIndexes.length === 0 && productImages.length > 0) plan.productFileIndexes = [0];
 578 |     const imageSlots = buildImageSlots(productImages, referenceImages, plan);
 579 |     const qualityChecklist = uniqueList([
 580 |       ...buildQualityChecklist(platformSkill, industrySkill, moduleSkill),
 581 |       ...(aiScreen?.qualityChecks || [])
 582 |     ]);
 583 |     const promptDirectives = uniqueList([
 584 |       ...moduleSkill.promptDirectives,
 585 |       ...(aiScreen?.promptDirectives || [])
 586 |     ]);
 587 |     const negativeConstraints = uniqueList([
 588 |       ...QUALITY_SKILL.negativePrompt,
 589 |       ...(aiScreen?.negativeConstraints || [])
 590 |     ]);
 591 |     const aiInsight = aiPlan
 592 |       ? `【AI商品洞察】目标人群：${analysis.targetAudience}；真实材质/颜色：${[...(analysis.materialHints || []), ...(analysis.colors || [])].slice(0, 8).join("、") || "以商品图为准"}；结构锁定：${(analysis.productLocks || []).slice(0, 6).join("、") || "保持商品图真实结构"}。`
 593 |       : "";
 594 |     const styleLockLine = screenPack
 595 |       ? (mainFirstScreen
 596 |           ? `【视觉风格锁】本屏为主图首屏安全款 S1《白底极简》：${STYLE_PACKS.S1.lockLine}；本组其余屏统一使用 ${styleDecision.pack.id}《${styleDecision.pack.name}》：${styleDecision.pack.lockLine}。`
 597 |           : `【视觉风格锁】本组锁定 ${screenPack.id}《${screenPack.name}》：${screenPack.lockLine}；全组所有屏保持同一色温、布光方向、背景质感与字体层级，禁止漂移。`)
 598 |       : "";
 599 |     const variantLine = variant
 600 |       ? `【构图变体】${variant.id}《${variant.name}》：${variant.composition}；第一落点：${variant.firstLook}；视线动线：${variant.eyeFlow}；文案安全区：${variant.textSafeZone}；禁忌：${variant.avoid}。`
 601 |       : "";
 602 |     const text = [
 603 |       `第${index + 1}屏：${title}`,
 604 |       `【本屏模块】${moduleSkill.name}：${moduleSkill.purpose}`,
 605 |       activeSection
 606 |         ? `【客户指定内容板块】第${activeSection.order || index + 1}优先方向：${activeSection.label}（${activeSection.moduleId}${activeSection.isCustom ? "，客户自定义" : ""}）。请围绕该方向组织本屏内容，但不得虚构商品事实。`
 607 |         : "",
 608 |       aiInsight,
 609 |       `【本次图片编号】${imageSlotText(imageSlots)}。生成时严格按此编号理解图片，禁止引用未列入本屏的其它素材。`,
 610 |       `【全局一致性锁定】${globalLock}`,
 611 |       styleLockLine,
 612 |       `【本屏卖点】${selling}`,
 613 |       aiScreen?.copywriting ? `【本屏文案】${aiScreen.copywriting}` : "",
 614 |       `【画面任务】${aiScreen?.composition || moduleSkill.composition}`,
 615 |       variantLine,
 616 |       `【模块指令】${promptDirectives.join("；")}。`,
 617 |       `【参考图使用】${aiScreen?.referenceReason || moduleSkill.referenceNeed}；参考图只吸收允许的场景、构图、配色或版式，不复制品牌、水印、人物身份和无关商品。`,
 618 |       `【模特与镜头】${aiScreen?.modelPolicyHint || modelPolicy(input, index, count)}`,
 619 |       screenPack
 620 |         ? `【构图与光线】${[screenPack.lighting, variant?.lighting].filter(Boolean).join("；")}；${V2_LIGHT_TAIL}`
 621 |         : `【构图与光线】${V1_LIGHT_LINE}`,
 622 |       `【质检自查】${qualityChecklist.slice(0, 8).join("；")}。`,
 623 |       `【负面约束】${negativeConstraints.join("、")}。`
 624 |     ].filter(Boolean).join("\n");
 625 | 
 626 |     return {
 627 |       screen: index + 1,
 628 |       title,
 629 |       summary: selling,
 630 |       intervention: aiPlan
 631 |         ? (index === 0 ? "AI视觉定调" : index === count - 1 ? "AI收尾质检" : `AI ${moduleSkill.name}`)
 632 |         : (index === 0 ? "通用底座定调" : index === count - 1 ? "收尾转化质检" : `${moduleSkill.name}介入`),
 633 |       referenceStrategy: referenceStrategyText(plan, moduleSkill),
 634 |       productFileIndexes: plan.productFileIndexes,
 635 |       referenceFileIndexes: plan.referenceFileIndexes,
 636 |       imageSlots,
 637 |       moduleKey: moduleSkill.id,
 638 |       moduleName: moduleSkill.name,
 639 |       qualityChecklist,
 640 |       aiScreen: aiScreen ? {
 641 |         referenceReason: aiScreen.referenceReason,
 642 |         copywriting: aiScreen.copywriting,
 643 |         composition: aiScreen.composition
 644 |       } : null,
 645 |       analysisMode: analysis.mode,
 646 |       text,
 647 |       enabled: true,
 648 |       status: "pending",
 649 |       generationMs: null,
 650 |       results: []
 651 |     };
 652 |   });
 653 | 
 654 |   const rounds = styleDecision
 655 |     ? [...buildRounds(platformSkill, industrySkill, analysis, count, reverseScreens), buildStylePackRound(styleDecision)]
 656 |     : buildRounds(platformSkill, industrySkill, analysis, count, reverseScreens);
 657 | 
 658 |   return {
 659 |     id: `detail_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
 660 |     label: `${new Date(createdAt).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })} | ${productName}`,
 661 |     createdAt,
 662 |     status: "confirming",
 663 |     params: {
 664 |       workflow,
 665 |       platform: platformSkill.platform,
 666 |       pageType: platformSkill.pageType,
 667 |       model,
 668 |       ratio,
 669 |       imageSize,
 670 |       count,
 671 |       lang,
 672 |       copywriting,
 673 |       richness: String(input.richness || "simple"),
 674 |       fontStyle: String(input.fontStyle || "soft"),
 675 |       modelMode: String(input.modelMode || "no-model"),
 676 |       modelPose: String(input.modelPose || "regular"),
 677 |       modelUsage: clamp(input.modelUsage, 1, 12, 4),
 678 |       reverseScreens,
 679 |       analysisMode: analysis.mode,
 680 |       industry: analysis.industry,
 681 |       productName,
 682 |       productImageNames: productImages.map((item) => item.name).filter(Boolean),
 683 |       referenceImageNames: referenceImages.map((item) => item.name).filter(Boolean),
 684 |       ...(styleDecision ? { detailSkillVersion: "v2", stylePackId: styleDecision.pack.id } : {})
 685 |     },
 686 |     analysis,
 687 |     ...(styleDecision ? {
 688 |       skillVersion: "v2",
 689 |       stylePack: {
 690 |         id: styleDecision.pack.id,
 691 |         name: styleDecision.pack.name,
 692 |         reason: styleDecision.reason,
 693 |         groupIndex: styleDecision.groupIndex
 694 |       }
 695 |     } : {}),
 696 |     skillLayers: {
 697 |       base: BASE_SKILL,
 698 |       industry: industrySkill,
 699 |       platform: platformSkill,
 700 |       modules: prompts.map((prompt) => ({
 701 |         screen: prompt.screen,
 702 |         moduleKey: prompt.moduleKey,
 703 |         moduleName: prompt.moduleName,
 704 |         title: prompt.title
 705 |       })),
 706 |       quality: QUALITY_SKILL
 707 |     },
 708 |     rounds,
 709 |     prompts
 710 |   };
 711 | }
 712 | 
 713 | export {
 714 |   buildDetailPromptGroup,
 715 |   BASE_SKILL,
 716 |   INDUSTRY_SKILLS,
 717 |   PLATFORM_SKILLS,
 718 |   QUALITY_SKILL
 719 | };
 720 | 
```

---

> 资料包结束。以上内容全部来自当前 Git HEAD 的实际文件，未包含任何导出方的分析、建议或改写。