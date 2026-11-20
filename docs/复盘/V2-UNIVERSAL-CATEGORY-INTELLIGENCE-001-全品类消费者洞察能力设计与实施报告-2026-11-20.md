# V2-UNIVERSAL-CATEGORY-INTELLIGENCE-001 · 全品类消费者洞察与动态行业策划能力建设报告

> 日期：2026-11-20　基线：HEAD `e12bbf3`。性质：全品类通用策划能力建设 + 类目专业知识动态加载。
> 🔴 边界：保留八项 Skill、单 Planner、四层控制；未加第九 Skill/Agent/模型调用/Provider/第二套链路；未改前端流程/QC；未把羽绒服或单行业写成全局硬规则。
> 无 KEY：真实 AI 规划质量（消费者洞察深度/竞品研究/出图）G4/G5 待验证，不标通过。

---

# 实施前核查结论（任务书第十节，真实代码证据）
先核查避免重复建设，结果：
- **已有**：10 行业词表识别（INDUSTRY_SKILLS）、cleaning 覆盖层防"包装"误判、五层价值链/完整内容地图/五种商品展示角色的 SKILL 正文与 directive、按事实维度动态组织屏数、SKILL04 明确允许 Absent（无"每屏必须展示商品"规则）。
- **核心缺口**（本次修复对象）：① 消费者洞察字段（consumerInsights/marketingStrategy）**只做存在性审计、无运行时消费链**；② 行业能力包 `industryPacks` 只有 cleaning 一个；③ 商品展示角色只是 directive 文本、**无运行时执行**；④ 跨行业污染防护靠 cleaning/apparel 硬编码词表、无可扩展通用机制；⑤ cleaning 正信号缺"干洗剂/洗涤剂"导致本地兜底把日化识别成通用电商；⑥ 内部矛盾——SKILL03 正文禁止拆使用步骤 vs 代码 `expandLocalTasksForFixed` 拆步骤。
- **无法实施（诚实标注）**：真实市场研究/竞品分析（无数据源、无 KEY、SKILL02 正文明确禁止虚构调研/评价/竞品优劣）。

---

# 交付 1：全品类消费者洞察能力设计与实施报告
把"所有商品都经过消费者洞察"从文档承诺落成工程事实：
- `mergeAiAnalysis` 现在把 `consumerInsights.needs`（消费者需求）与 `marketingStrategy.valueLadder`（事实→需求→利益→表达）纳入 `sellingPoints` 候选，**优先级高于原始资料**，使消费者洞察真正进入屏级任务分配（AG3/AG4/AG5）。
- 洞察结果挂到 `analysis.consumerInsights/marketingStrategy`，供下游追踪。
- 诚实边界：无 KEY 时 aiPlan=null，走本地兜底（按事实维度组织），消费者洞察由 AI 规划阶段负责——工程通道已打通，模型实际产出质量待 G4 验证。

# 交付 2：行业识别与专业知识动态加载方案
- 行业包从 1 个（cleaning）扩展到 **8 个**：cleaning/apparel/beauty/food/electronics/home/motherBaby/pet，每包含 positiveSignals/negativeSignals/noGeneralization/weakContextWordsMustNotOverride，数据驱动、非单品硬编码（AG1/AG2）。
- `loadIndustryPack` 按英文 industryId 精确加载，8 类实测全部正确加载（AG16 + 8类目终测）。
- cleaning 正信号补"干洗剂/洗涤剂/去污剂/洗衣液/清洁泡沫/清洁刷"等，本地兜底也能识别日化（AG14）；服装不被日化覆盖（AG15）。
- 加载结果进入 v2Control 审计 + 行业信号通过 detectIndustryOverride/buildGlobalLock 进入提示词，职责分明。

# 交付 3：通用策划能力与类目专业知识职责映射
| 层 | 通用能力（所有商品） | 类目专业知识（按 id 动态） |
|---|---|---|
| 商品理解 | parseStructuredFacts 通用维度 + 事实分级 | 行业包 analyzeAttributes/taboos |
| 营销 | 五层价值链（通用） | 行业 noGeneralization 边界 |
| 叙事 | 完整内容地图 + 动态屏数（通用） | 行业 recommendedScreens（提示） |
| 视觉 | 五种展示角色（通用） | 行业 visualAnchors/禁忌 |
| 专项 | SKILL07 六类专项按需 | capability_module 按任务触发 |
通用知识与行业知识职责分明，行业知识不写进通用 Skill。

# 交付 4：SKILL01—07 专业能力升级差异
- **SKILL01**：无需改正文（已覆盖全品类事实理解），运行识别能力通过行业包扩展增强。
- **SKILL02**：无需改正文（五层价值链/禁虚构已覆盖），消费者洞察从审计接入编译（代码层）。
- **SKILL03**：正文校准"合理细分 vs 机械拆分"矛盾——有独立认知价值的连续步骤可展开、仅换说法的碎片禁止，与 `expandLocalTasksForFixed` 代码一致；directive 同步（V1.3）。
- **SKILL04**：展示角色 Primary/Secondary/Detail/Contextual/Absent 从正文/directive 落到编译层——新增 `PRODUCT_DISPLAY_ROLES`、`roleClause()`，按本屏任务推断，有 AI composition 时也补角色句；明确不强制每屏展示商品（AG6-AG8/AG13）。
- **SKILL05/06/07**：本次不改正文（现有契约已覆盖消费者语言/人物按需/六类专项），无回归。
- 所有 SKILL.md 改动保持"正文↔runtime directive"同步门禁通过（35/35）。

# 交付 5：全品类消费者研究与竞品分析评测
**诚实结论：本项未实现真实市场研究。** 核查确认：无任何市场/评价/竞品数据源，SKILL02 正文明确"禁虚构消费者调研、市场规模、用户评价、竞品优劣"，环境无 KEY 与联网授权。本次做的是"让 AI 规划产出的消费者洞察（needs/valueLadder）进入编译"的**通道建设**，不是引入外部市场数据。评测以"消费者洞察是否被消费"为准（AG4/AG5 通过），真实研究深度待有 KEY/数据源后验证，不伪装成市场结论。

# 交付 6：跨行业规则污染测试
新增 `checkIndustryPollution`（`detail-v2-control/index.js`）：配置驱动、可扩展——检测文案是否混入"其他行业强特征词"，排除本行业弱语境词（使用对象），只输出证据不硬拦截。挂到 v2Control.pollutionAudit 供可观测（AG9-AG12）。
实测：
| 输入 | 行业 | 结果 |
|---|---|---|
| "按压海绵头清洁羽绒服污渍" | cleaning | 无污染（羽绒服是弱语境使用对象，正确排除） |
| "版型修身袖口精致的清洁喷雾" | cleaning | 报 apparel 污染（版型/袖口） |
| "手机快充接口性能" | apparel | 报 electronics 污染 |
| 跨类目"清洁收纳盒" | cleaning | 报 home 交叉污染（符合混合商品负向测试预期） |

# 交付 7：全品类详情视觉差异化测试（8 类目本地真实链路）
| 商品 | 识别 id | 加载包 | 有效屏 | 模块结构 |
|---|---|---|---|---|
| 纯棉T恤 | apparel | apparel | 5 | hero/materialDetail/useScenario/specInfo |
| 羽绒服干洗剂 | cleaning | cleaning | 6 | hero/coreSellingPoint/useScenario |
| 云南咖啡豆 | food | food | 6 | hero/specInfo/coreSellingPoint/conversionClose |
| 玻尿酸精华 | beauty | beauty | 4 | hero/coreSellingPoint/useScenario/specInfo |
| 实木收纳架 | home | home | 3 | hero/materialDetail/useScenario |
| 蓝牙耳机 | electronics | electronics | 6 | hero/specInfo/coreSellingPoint/conversionClose |
| 婴儿连体衣 | motherBaby | motherBaby | 3 | hero/materialDetail/useScenario |
| 多功能清洁收纳盒 | cleaning(主)+home(交叉) | cleaning | 3 | hero/materialDetail/useScenario/specInfo |

不同商品形成**不同有效屏数（3-6）与不同模块结构**，无统一模板；商品展示角色按任务推断（材质→Detail、使用→Contextual、身份→Primary）。

# 交付 8：不同商品提示词前后对照
改造前：消费者洞察字段只做存在性审计、不进任何屏级内容；行业包只有 cleaning；展示角色无编译落点；日化本地识别成"通用电商"。
改造后：valueLadder 表达进入卖点；8 行业包各自加载；展示角色句进入【画面任务】；日化正确识别 cleaning。示例（AG4）：咖啡豆"轻松收纳不凌乱"类消费者利益表达进入屏级任务（真实 AI 输出待 KEY）。

# 交付 9：修改文件、Commit、测试
文件：`detail-middleware.js`（+35/-）、`detail-ai.js`（directive 同步）、`professional-content-v1.json`（+9/-2，8 包 + cleaning 信号）、`detail-v2-control/index.js`（checkIndustryPollution）、`skill-activation.js`（展示角色）、`detail-story-planning/SKILL.md`（V1.3 校准）、`detail-v2-control-chain-check.mjs`（AG 组 16 项）。
Commit：`8d7fce3`（8 文件 +229/-7，含本报告）；pre-commit 86/86。
测试：控制链 **454/454**（AG16）、同步门禁 35/35、planning 76/76、assets 冻结未破、**全量 86/86**、build EXIT=0；8 类目跨商品终测通过。

## 八问回答
1. 所有商品都经过消费者洞察？—— 工程通道已打通（needs/valueLadder 进入编译），真实洞察深度待 KEY 验证。
2. 不同类别用不同策划方法？—— 是（8 行业包 + 不同模块结构，实测）。
3. 自动识别主类目和交叉类目？—— 主类目是（8/8 正确）；交叉类目以污染检测标记（混合商品实测报 home），非独立多类目输出结构。
4. 按需加载类别知识不污染？—— 是（checkIndustryPollution 配置驱动，弱词排除）。
5. 根据购买需求形成不同详情结构？—— 是（有效屏 3-6、模块各异）。
6. 不同商品不同视觉表达？—— 是（展示角色按任务推断 + 行业视觉锚点）。
7. 仍存在每屏必须展示商品的隐性规则？—— 无（核查确认 SKILL04 明确允许 Absent，编译层角色句不强制展示）。
8. 新商品无专属行业知识仍能工作？—— 能（generic 走通用策划 + 通用能力，行业包缺失不阻塞）。

**羽绒服仅作日化测试样本，未写成全局规则。本次完成停止，不进入下一轮规则优化或架构改造。**
