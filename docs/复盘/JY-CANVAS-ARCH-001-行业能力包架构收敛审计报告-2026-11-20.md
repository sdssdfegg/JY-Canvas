# JY-CANVAS-ARCH-001 · 全品类一键详情行业能力包架构收敛审计报告

> 日期：2026-11-20　审计基线：HEAD `524d1e4`（含 `8d7fce3` 全品类扩展）。性质：**现状审计 + 架构收敛 + 调整方案**，按任务书要求不做大范围代码改造，交外部产品架构顾问复核后定下一阶段范围。
> 🔴 本次零代码改动（除本报告与状态同步）。无 KEY、无外部市场数据源；真实模型质量一律不标通过。
> 📌 重要自我纠正：上一轮 `8d7fce3` 报告称"行业包扩8类目、可插拔"——本次审计证实这是**"加载层真、消费层假"的假可插拔**，7个非 cooling 包字段大多只进审计。本报告如实纠正。

---

# 交付 1：全品类行业能力包现状架构审计报告

## 判定总表（每项标状态 + 代码路径）
| 审计项 | 判定 | 关键证据 |
|---|---|---|
| 通用核心框架职责 | 部分实现 | `detail-middleware.js` 负责识别/编译/输出契约；但行业知识仍靠 `detail-skills.js` 旧词表，非行业包 |
| 行业识别 | 部分实现 | `getIndustrySkillByText`（detail-skills.js:403）+ `detectIndustryOverride`（index.js:159，硬编码只认 cleaning） |
| 行业包统一数据契约 | 部分实现 | 8 包字段结构一致（professional-content-v1.json:25-64），但无 Schema、无运行时强制校验，缺字段静默兜底 |
| 行业包注册/加载 | 部分实现 | `loadIndustryPack`（index.js:111）通用 id 查表；无注册表/版本管理；pack 子对象零消费 |
| 行业包运行时消费 | **假可插拔为主** | 仅 cleaning 部分字段进提示词；7 包 negativeSignals/professionalValues/coverage/recognitionExamples 完全未消费；noGeneralization 对 7 包实测零效果 |
| 大类目→子类目继承/组合 | 未实现 | 配置为扁平 kv，无 parent/extends/subCategory；loadIndustryPack 单 id 查表 |
| 降级 | 部分实现 | generic 文本路径可用；包缺失降级只进审计；识别置信度低不触发降级 |
| 包间隔离 | 部分实现 | 删除一包不影响其它包加载；但核心对 cleaning 有硬编码依赖 |
| 平台策略独立 | 已实现 | `PLATFORM_SKILLS` 与行业包无交叉 import；默认 taobao-detail；不阻塞策划 |
| 五档内容筛选 | 未实现 | 全库 grep 五档零命中；只有 filter/slice/去重/二元 allow-deny |
| 成分筛选 | 未实现 | ingredient 整条 `join("；")` 塞一屏，expandLocalTasksForFixed 无 ingredient 分支，探针证实罗列 |
| 前后对比三组 | 未实现 | 全库无"三组/左前右后"；仅 professional-skills-v1.json:212 通用描述；相关专项不触发 |
| 专项 Skill 激活 | 部分实现 | 聚合 ID 激活六类；探针 `injectedToPrompt=false`、无 generation instruction |
| 提示词重复注入 | 存在问题 | `buildGlobalLock`(746/749/752) 与 `buildRounds`(762/766/772) 注入同样三份规则，同屏 text 逐字重复 |
| 跨行业污染 | 仅审计 | `checkIndustryPollution` 返回风险挂 v2Control，note 明写"不作硬性拦截" |
| 市场研究/竞品数据 | 无法验证/未实现 | 无任何外部数据源，SKILL02 正文禁虚构调研/竞品；无 KEY |

## 关键审计发现（供架构顾问重点复核）
1. **假可插拔**：7 个非 cleaning 包由 `8d7fce3` 一次性写入 JSON；门禁 AG1/AG2/AG16 只验证"配置存在/id 相等"，没有任何断言验证字段进入提示词。`detectIndustryOverride` 只取 `config?.industryPacks?.cleaning`（index.js:161），其它包信号词只被 checkIndustryPollution 读取进审计。
2. **两套行业体系并行**：①真正进提示词的 `INDUSTRY_SKILLS` 旧词表（10类）经 `aiIndustry` 装配 17 槽位；②`professional-content-v1.json` 的 industryPacks（8类）只在 v2Control 审计。任务书的"行业包"目前不是提示词的来源。
3. **noGeneralization 实质只对 cleaning 生效**：`checkSellingPointBoundary`（skill-activation.js:19）提取词是硬编码正则，实测 7 个非 cleaning 包提取结果全为 `[]`。
4. **专项 active 但无提示词**：`product-specialty-expression` 判 active，`authorizationTrace` 显示 `injectedToPrompt:false`，reason 文本"已进入本屏提示词"与实际 false 矛盾（skill-activation.js 与 middleware:1361 附近）。
5. **真实业务问题对应代码根因**：成分整条罗列（buildLocalScreenTasks:114）、使用步骤机械拆分（expandLocalTasksForFixed USAGE_STEP_HINT）、商品展示角色虽引入但标识为内部标签、前后对比三组无编译能力。

## 取证方法
全程只读：grep 全仓字段读取点（排除配置与验证脚本）+ Node 只读探针实测（8包加载/6组行业识别/成分展开/前后对比透传/专项激活/重复注入）。每项结论均带代码路径或运行输出，未找到即明说未找到。

---

# 交付 2：通用核心·行业包·商品专项·屏级任务·平台策略职责映射表

| 能力项 | 通用核心框架 | 行业大类包 | 行业子类目包 | 商品事实及专项判断 | 屏级任务 | 独立平台策略 |
|---|---|---|---|---|---|---|
| 商品理解与事实分级 | **主责**（parseStructuredFacts、L1/L2/L3） | 提供 analyzeAttributes | — | 判定 visible/inferred/mustNotClaim | — | — |
| 行业识别 | **主责**（getIndustrySkillByText/aiIndustry） | 提供 positiveSignals（当前仅 cleaning 生效） | 应提供子类目信号（未实现） | — | — | — |
| 行业包加载/降级/隔离 | **主责**（loadIndustryPack/generic 降级） | 数据载体 | 数据载体 | — | — | — |
| 内容筛选五档 | **应主责机制**（当前缺） | 应给判断标准（当前缺） | — | 判具体适用性 | 承载筛选结果 | — |
| 成分筛选 | 应给机制（当前缺） | 应给专业标准（当前缺） | — | 用商品证据+功效关联判断（当前缺） | 承载选中成分 | — |
| 前后对比三组 | **应主责三组结构编译**（当前缺） | 应决定对比内容（当前缺） | — | 判是否有真实效果证据（当前缺） | 承载对比任务 | — |
| 内容地图/屏数 | **主责**（buildLocalScreenTasks/expand） | 提供推荐内容方向（coverage，未消费） | — | — | 消费任务 | — |
| 商品展示角色 | **主责**（PRODUCT_DISPLAY_ROLES/roleClause） | 提供行业视觉锚点 | — | — | 按任务定角色 | — |
| 专项 Skill 激活 | **主责**（evaluateAllActivations） | 应限定本行业可用专项（industry_isolation 仅配置） | — | 事实/证据触发（部分实现） | 派屏级信号 | — |
| 提示词编译/身份保护 | **主责**（buildGlobalLock/17槽位） | 提供 taboos（进提示词） | — | — | 屏级文本 | 平台展示规则（独立，已实现） |

**归属结论**：任务书强调的三项——内容筛选、成分策略、前后对比——当前**都是空白归属**（通用框架没有机制、行业包没有标准、商品层没有判断）。这是下一阶段最该补的三块，而非继续加行业名称。

---

# 交付 3：行业包统一契约与扩展机制建议

> 本节是"建议"，不是已实施。供架构顾问复核。

**现状问题**：8 包字段一致但无 Schema；加载器返回 pack 子对象无人消费；新增行业必须改 `INDUSTRY_SKILLS` 词表或 detectIndustryOverride；无继承/子类目。

**最小调整建议（按优先级）**：
1. **建 industry-pack.schema.json**：固定必填字段（industryId/industryName/positiveSignals/negativeSignals/weakContextWordsMustNotOverride/noGeneralization/professionalValues），启动时校验，缺字段报错而非静默兜底。影响：配置加载入口 `activeConfig()`；回归：8 包全通过 schema、故意删字段判红。
2. **让加载结果真正消费**：把 `loadIndustryPack` 返回的 pack 字段接入 `buildGlobalLock`/`buildRounds`（当前只用审计字段），使 positiveSignals/negativeSignals/noGeneralization 对所有包生效，替代 detectIndustryOverride 的 cleaning 硬编码。影响：提示词编译层；兼容：保留 cleaning 行为逐字节一致；回归：8 包各自信号进提示词、跨包不串。
3. **注册表 + 版本**：industryPacks 每包加 version、status；新增行业只加配置+注册，不改核心。删除一包其它包不受影响（当前已具备）。
4. **大类目→子类目分层**：引入 `extends`/`basePack` 字段，子类目包继承大类目信号再叠加差异（如 cleaning→apparel-cleaning / kitchen-cleaning）。影响：loadIndustryPack 合并逻辑；回归：继承字段正确展开、无循环引用。
5. **置信度驱动降级**：消费 `industryProfile.confidence`，低置信度显式降级 generic 并记原因（当前 confidence 只进 outputSchema）。

**不建议**：把 8 包字段直接复制进通用 Skill；为每行业写独立 if 分支；为了本次把 cleaning 硬编码全删（有回归风险，先并存再迁）。

---

# 交付 4：成分筛选与前后对比策略分层方案

> 方案设计，未实施。两项当前均"未实现"。

## 4.1 成分筛选（当前未实现，真机问题2的根因）
现状：`parseStructuredFacts` 只解析不筛选；`buildLocalScreenTasks:114` 把成分整条 `join("；")` 塞一屏；`expandLocalTasksForFixed` 无 ingredient 分支——实测输入"烟酰胺、熊果苷、维生素C"，展开前后完全相同，纯罗列。

分层归属建议：
- **通用框架**：新增成分筛选机制（输入成分列表+商品功效+证据，输出 优先展示/合并/辅助/暂不使用/禁止表达 的分级结果）。不绑任何行业。
- **行业包**：提供该行业成分专业判断标准（如日化"表面活性剂/乳化剂按去渍关联筛"；美妆"烟酰胺/熊果苷按美白功效证据筛"；食品"配料按含量与消费者理解度筛"）——数据驱动，非硬编码。
- **商品事实层**：用当前商品证据判断某成分能否表达、能表达到什么程度（行业共识≠本商品事实）。
- **屏级任务**：承载"被选中的成分"，一屏讲有理解价值的成分，不是名称清单。

## 4.2 使用前后对比三组（当前未实现）
现状：任务书的"固定三组左右对比、左前右后、三组不同内容、商品不强制出镜"在全库无实现；professional-skills-v1.json:212 的 before_after 是"左右/上下/同画面不同状态"多形式通用描述，且专项在真实链路不触发、`injectedToPrompt=false`。

分层归属建议：
- **通用框架**：新增"三组左右对比"结构编译能力（固定 3 组、左使用前/右使用后、三组内容须不同、商品非强制出镜），作为 one task type 的编译模板。
- **行业包**：决定该行业/子类目适合对比什么内容（日化去渍、家居收纳前后、美妆妆效）。
- **商品事实层**：判是否有真实效果证据；无证据禁止虚构改善结果。
- **屏级任务**：承载对比任务，商品展示角色可为 Absent/Secondary（不强制主体）。

---

# 交付 5：真实业务测试问题归档及后续验收清单

## 5.1 羽绒服干洗剂真机测试问题归档（用户真机，已复现部分）
| # | 真机观察 | 本次核查对应代码根因 | 状态 |
|---|---|---|---|
| 1 | 用户指定10屏，实际9屏，第10屏因缺独立内容跳过 | 实测复现：count=10 fixed→9有效+1空屏；expandLocalTasksForFixed 细分出9任务，第10无独立内容 | 已复现，机制符合当前设计（不编造空屏），但"10屏要求"未满足需产品决策 |
| 2 | 首屏商品价值表达不够吸引 | 首屏卖点=`商品身份与核心价值：羽绒服干洗剂`（仅商品名+维度标签），无营销价值表达 | 已定位：identity 任务只有 productName+providedSelling，valueLadder 仅在有 aiPlan 时进入 |
| 3 | 成分只罗列未筛选 | buildLocalScreenTasks ingredient 整条 join；expandLocalTasksForFixed 无筛选 | 已定位：成分筛选未实现（交付4） |
| 4 | 使用场景缺真实痛点 | 本地兜底 applicableScope 只列对象，无 needs/痛点（needs 仅 aiPlan 时进入） | 部分定位：无 KEY 时缺消费者洞察；有 KEY 时通道已打通待验证 |
| 5 | 使用方法机械拆屏、内容重复 | expandLocalTasksForFixed 按5步骤拆屏（按压/涂抹/刷洗/擦拭/干燥） | 已定位：上一轮为填满固定屏数而拆，与 SKILL03 V1.3 校准后的"合理细分"判据需真机再评估 |
| 6 | 商品多屏占比过大、视觉单一 | 展示角色引入但为内部标签；roleClause 仅骨架兜底时较明显；有 composition 时补一句 | 部分定位：角色编译已加，实际视觉差异待真机 |
| 7 | 人物参数可能未完整生效 | modelUsage 按屏授权代码存在（:870）、专项 active 但 injectedToPrompt=false | 部分定位：授权链路在，专项注入缺失待验证 |

**工程测试 ≠ 真实效果**：此前 8 类目本地测试只验证"识别/加载/门禁"，不证明真实模型专业策划能力；跨行业污染检测仅审计；固定屏数本地扩展不代表真实模型能稳定产出 N 屏高质量内容。无 KEY、无外部数据源，市场研究不标完成。

## 5.2 后续真实模型验收清单（待 KEY，均未通过）
1. 固定10屏能否产出10个有效且不重复的内容任务；
2. 成分是否正确筛选而非罗列；
3. 行业内容是否匹配具体子类目（需先实现子目分层）；
4. 前后对比是否按三组左右结构生成且遵守效果证据边界（需先实现）；
5. 不同屏是否按内容任务采用不同商品展示比例/视觉主体；
6. 人物专项能力是否正常激活并进入提示词（当前 injectedToPrompt=false）；
7. 未知行业是否合理降级 generic；
8. 新增/移除行业包是否影响其它行业与核心流程；
9. 平台策略是否保持独立。
> 以上每项在真实模型运行、真实 KEY、实际生成结果出现前，一律标"待验收"，不得标通过。

---

# 交付 6：最小必要调整实施计划及风险说明

> 只列确认缺口，不重建八 Skill、不复制行业能力、不改稳定接口。分两阶段，均待架构顾问复核。

| 阶段 | 调整项 | 兼容性/影响范围 | 回归方案 |
|---|---|---|---|
| P1（机制补齐，不改接口） | ① 建 industry-pack.schema.json + 启动校验；② buildGlobalLock/Rounds 消费 pack 字段（先并存 cleaning 硬编码） | 配置加载 + 提示词编译；需保证 cleaning 行为逐字节一致 | 8 包 schema 通过；cleaning 提示词逐字节对照；删字段判红；8 类目提示词各含本行业信号 |
| P1 | ③ 修复专项 active 但 injectedToPrompt=false（reason 与实际一致）；④ 消除 buildGlobalLock/Rounds 重复注入 | 授权编译 + 17 槽位；输出文本会变（需产品确认） | 专项注入断言；重复注入计数从 N→1；控制链/同步门禁全绿 |
| P2（能力新增，需产品拍板） | ⑤ 五档内容筛选机制；⑥ 成分筛选（通用机制+行业标准+商品证据）；⑦ 前后对比三组编译 | 新增机制/任务类型，不改对外接口；涉及 SKILL 正文需走专业正文接入纪律 | 每机制正负向测试；成分筛选实测；三组结构实测；跨行业污染测试 |
| P2 | ⑧ 子类目分层继承（extends/basePack）；⑨ 置信度驱动降级 | loadIndustryPack 合并逻辑；配置结构扩展 | 继承展开正确、无循环；低置信度降级 generic 有因 |

**最大风险**：把"配置存在"误当"能力已实现"（本次审计已发现此问题）——所以每项 P1/P2 都必须有"运行时消费证据"断言，不只看配置门禁。

---

## 最终判断（回答任务书判定标准）
- **通用核心是否稳定**：机制层稳定，但行业知识仍混在旧词表/编译层，职责未完全收敛 → 部分达成。
- **行业能力是否真正可插拔**：否——加载层可插拔、消费层假可插拔（本次最重要纠正）。
- **具体商品是否得到匹配的专业策划**：本地工程路径按事实组织，但消费者痛点/成分筛选/行业专项未真正注入 → 未达成，待 P1/P2 + 真实模型。
- **用户指定屏数能否获得有价值、不重复、可信内容**：不重复已部分达成（去重+空屏不编造）；"有价值/可信"受成分筛选、痛点、首屏价值缺失制约 → 未达成。

**本次未改核心代码，报告交外部产品架构顾问复核后再定实施范围。零代码改动（除本报告与状态同步）。**
