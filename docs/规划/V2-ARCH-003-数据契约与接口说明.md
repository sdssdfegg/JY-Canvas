# V2-ARCH-003 · 数据契约与接口说明（阶段 C）

> 任务来源：V2-ARCH-001 任务书阶段 C，经补充裁决启动。架构依据：`V2-ARCH-002`（阶段 B，主规范唯一）。
> 性质：**契约设计文档**，零业务代码改动。专业内容由 ChatGPT 后续交付，本文件只定字段与传递机制。
> 日期：2026-11-17　基准 HEAD：`ae786be`。

---

## 0. 本阶段要解决的问题

任务书明确：**新增字段不能只存在于 Schema 里，必须实际经过**——

`产品理解 → 行业路由 → 任务准入 → 分屏规划 → 提示词编译 → 最终生图请求`

阶段 A 实测的断点：`industryProfile / consumerInsights / marketingStrategy / globalVisualDNA` 在编译器 `detail-middleware.js` 出现 **0 次**，`planning` 仅用 `screenRoles`。本文件为每个字段定义六个属性：**产生位置 / 消费位置 / 是否持久化 / 是否进模型上下文 / 是否进最终生图提示词 / 缺失处理**，确保字段真的走完全链。

---

## 1. 契约总表（字段级）

图例：产生/消费位置用当前代码行号或新增模块名（标注「新增」）。持久化三态：`内存`（会话态，不落盘）/ `否`（不保留）/ `可选`（用户主动保存）。

### 1.1 顶层 9 字段（现有 Schema，必须打通）

| 字段 | 产生位置 | 消费位置 | 持久化 | 进模型上下文 | 进最终提示词 | 缺失处理 |
|---|---|---|---|---|---|---|
| `schemaVersion` | 模型输出（固定 "1.0.0"） | 校验 | 内存 | 否 | 否 | 不匹配判异常 |
| `product` | `detail-ai.js` outputSchema `:205-291`；归一 `middleware:173-210` | L1 事实控制、L3 准入、槽 4 AI 洞察 | 内存 | 是（作为下轮/QC 上下文） | 部分（L1 确认项经槽 4/8） | 回退本地 `buildProductAnalysis` |
| `industryProfile` | 模型输出；L2 统一决策（`middleware:91-112` 改造） | L2 加载器、L3 准入、槽 6 全局锁 | 内存 | 是 | **是**（槽 6 行业识别/观察点/禁忌） | 强特征判定 → generic |
| `consumerInsights` | 模型输出 | L4-A storyPlan → 每屏 `consumerQuestion` | 内存 | 是 | **是**（槽 2/8 的"解决谁的问题"） | 省略该表达，不写解释段 |
| `marketingStrategy` | 模型输出 | L4-A → 槽 8 卖点 / 槽 9 文案 | 内存 | 是 | **是**（受 L1 事实边界约束） | 用保守事实陈述，不堆营销 |
| `screens[]` | 模型输出；归一 `normalizeAiScreens:148-171` | L4 分屏规划 → 17 槽位 | 内存 | 是 | **是**（主体） | 缺屏补最小安全占位（已有 `:129-146`） |
| `globalVisualDNA` | 模型输出 | L4-B → 槽 7 风格锁 / 槽 15 构图光线 | 内存 | 是 | **是**（仅视觉属性） | 用安全通用视觉表达 |
| `planning` | 模型输出（`:283-290` 条件注入） | L4-A storyPlan；槽 5/6 现用 `screenRoles`；扩展用 `facts/dedupLog` | 内存 | 是 | 部分（`screenRoles` 已进；其余按本契约扩展） | 首屏 hero 兜底、禁固定轮转 |
| `qc` | 模型输出 + `buildQualityChecklist` | 槽 16 质检自查（去截断）；用户主动 QC 另算 | 内存 | 是 | 部分（通用清单，≠用户 QC） | 用本地通用清单 |

### 1.2 新增结构（阶段 A 列 10 项缺口，逐个定义）

| 新结构 | 产生位置 | 消费位置 | 持久化 | 进模型上下文 | 进最终提示词 | 缺失处理 |
|---|---|---|---|---|---|---|
| `productFacts[]`（7 字段：<br/>factType/value/sourceType/confidence/status/sourceRef/allowedUse） | L1：模型 + 归一 `mergeAiAnalysis` 改造 | L1 校验、L3 准入、L4-C 授权 | 内存 | 是 | 仅 `status=L1` 且 `allowedUse` 允许者 | 缺 → 标 L3，禁止进提示词 |
| `productCapabilityProfile`（productType/mainFunction/useObject/targetProblem/confirmedApplicability/confirmedUsageMethod/knownPhysicalAttributes/applicableTaskIds/excludedTaskIds/unresolvedFacts） | L1/L2 交界（新增映射） | L3 准入核心输入 | 内存 | 是 | 否（内部画像，不直接输出） | 未确认项进 `unresolvedFacts`，不猜 |
| `contentTaskCandidates[]` | 模型生成 + 注册表（新增） | L3 准入 → `admitted` 集合 → L4 screens | 内存 | 是（作为候选） | 仅 admitted 的任务 | 无候选 → generic 通用任务 |
| `visualTaskCandidates[]` | 同上 | 同上 | 内存 | 是 | 仅 admitted | 同上 |
| `admission`（四态 + reason） | L3 准入模块（新增） | L4 分屏规划（过滤）、审计 | 内存 | 否（内部决策） | 否（原因不输出给生图） | 状态缺失视为 pending |
| `storyPlan`（主线/首屏/递进/重复检测/缺失检测） | L4-A（由 `planning` 扩展） | L4 分屏顺序、重复检测 | 内存 | 是 | 否（策划逻辑不进提示词） | 用简单顺序，不写死模板 |
| `globalVisualDNA`（纯视觉；已列顶层） | L4-B | 槽 7/15 | 内存 | 是 | 是（只视觉部分） | 安全通用视觉 |
| `screens[].consumerQuestion` 等 7 新字段 | L4-A 规划 | L4-C 编译（槽 2/8/9） | 内存 | 是 | 部分（consumerQuestion 转消费者语言，不原样输出分析） | 省略该屏表述 |
| `compilerAudit`（来源/使用/未用/未授权/事实突破） | L4-C 编译器（新增） | 复核/门禁/前端调试 | 可选（调试态） | 否 | 否（审计不进生图） | 审计缺失判编译不合规 |
| `qc` 三层区分（结构校验 / 编译校验 / 用户主动 QC） | L4-C + 用户动作 | 门禁 / UI | 内存（用户 QC 态不落盘，同 B 域做法） | 部分 | 否 | 前两层必做；用户 QC 可跳过 |

---

## 2. 全链路字段流（逐段）

### 2.1 段 1：产品理解 → 行业路由
- **入口**：`POST /api/detail-prompts`（`detail.routes.js:46`）解析 `payload` + 图片（`:51-57`）。
- **模型产出**：`product` / `productFacts[]` / `productCapabilityProfile` 草案 / `industryProfile` 草案。
- **归一**：`mergeAiAnalysis`（`middleware:173-210`）改为按六类 `factType` 拆字段；`materials` 不再单数组混装包装材质与使用对象材质。
- **约束**：事实只有 `status=L1` 才 `allowedUse=true` 进后续确定事实；L2/L3 只能进 `uncertainties` 或内部策划。

### 2.2 段 2：行业路由 → 任务准入
- `industryProfile.industryId` 为**唯一主行业**（单一决策源，替代 `aiIndustry` 另算 + 编译器重判）。
- 加载器按 `industryId` 决定 `loadedIndustryPackIds`；无匹配 → `fallbackMode=generic_no_pack`。
- 输出给 L3：`industryId` + 已加载包的规则（仅规则，非模板）。

### 2.3 段 3：任务准入 → 分屏规划
- L3 对 `contentTaskCandidates/visualTaskCandidates` 逐项判定四态（逻辑见 V2-ARCH-002 §4.4）。
- `screens[].contentTaskIds/visualTaskIds` **只能引用 admitted 或 generic_fallback 的任务 ID**。
- `selectedSections`（用户板块）作为偏好：影响任务优先级，但不得把 rejected/pending 翻转（裁决 -04 与任务书第五节 #4）。

### 2.4 段 4：分屏规划 → 提示词编译
- `normalizeAiScreens`（`middleware:148-171`）从 13 字段扩展到含 `consumerQuestion/contentTaskIds/visualTaskIds/proof/constraints/assetRefs`。
- 编译器（`middleware:467-713`）按 17 槽位消费；每槽重要指令写 `sourceField/sourceTaskId`。

### 2.5 段 5：提示词编译 → 生图请求
- `group` 返回前端（`detail.routes.js:113-114`，planning 平级）。
- 前端 `createDetailPromptPlan`（`detail-state.js:372-439`）取提示词 → `generateImages`（`src/api/images.js:3-5`）→ `POST /api/images`。
- **本契约保证**：生图请求里的提示词只含"已确认事实 + admitted 任务 + 用户明确视觉要求"，不含策划分析语汇。

---

## 3. Schema 变更清单（配合裁决，不推翻 9 顶层）

| 变更 | 位置 | 说明 |
|---|---|---|
| 事实三级口径说明改为 L1/L2/L3→visible/inferred/mustNotClaim | `planning-result.schema.json:59-63` description | 枚举值不变（V219 收窄决策），只改说明；映射文本在 `detail-ai.js:45` 同步 |
| `product` 增 `factType` 分类字段（六类分离） | `$defs.product:64-96` | 增字段，不改现有 `materials` 等旧字段（兼容） |
| `productCapabilityProfile` 新增（可挂 planning 或独立顶层） | 新增 `$defs` | 需 Owner/ChatGPT 确认挂载点；建议挂 `planning` 下避免第 10 顶层 |
| `screens[]` 增 7 字段 | `$defs.screens:154-176` | consumerQuestion/contentTaskIds/visualTaskIds/message/proof/constraints/assetRefs |
| `contentTaskCandidates/visualTaskCandidates` 新增 | 新增 `$defs` | 含 admission 四态 + reason |
| `compilerAudit` 新增 | 新增 `$defs` | 非生图内容，供门禁/审计 |
| `globalVisualDNA` 明确禁叙事字段 | `$defs.globalVisualDNA:178-194` | description 增禁令，不新增叙事键 |

> 🔴 挂载点、`factType` 枚举具体值等**需 ChatGPT 专业内容到位后定**；本文件只定"必须存在且贯通"的字段语义，不代替专业定型（第九节禁令）。

---

## 4. 缺失与降级规则（汇总）

| 缺失字段 | 降级 | 禁止 |
|---|---|---|
| productFacts | 本地 `buildProductAnalysis` + 全标 L2/L3 | 不把未知写成 L1 |
| industryProfile | 强特征判定 → generic | 不加载其他行业包 |
| capabilityProfile | 只准入"无属性要求"的通用任务 | 不猜属性 |
| 候选任务 | generic 通用任务池 | 不硬凑屏/不固定轮转 |
| admission 状态 | 视为 pending（不进分屏） | 不默认 admitted |
| storyPlan | 简单顺序 + 首屏 hero | 不写死三段式 |
| globalVisualDNA | 安全通用视觉 | 不借叙事填视觉 |
| screens 新字段 | 省略该屏表述 | 不写策划废话 |
| compilerAudit | 判编译不合规 | 不允许无来源指令 |

---

## 5. 不输出给生图模型的字段（明确清单）

以下只用于内部控制，**不得进最终生图提示词**（任务书第四节"必须减少或禁止"）：
`productFacts.status/sourceRef/confidence`（除 L1 事实值）、`admission.reason`、`storyPlan` 主线与递进分析、`consumerInsights` 原始分析语、`marketingStrategy` 的策略说明、`compilerAudit`、`qc` 内部结构、任何"本屏旨在…/通过视觉语言…/强化购买欲"式策划语汇。

> 允许进入的只有：已确认产品事实值、admitted 任务的执行要求、当前屏 consumerQuestion 转写的**消费者文案**、globalVisualDNA 的视觉属性、用户明确视觉要求。

---

## 6. 本阶段结论

阶段 C 完成：9 顶层字段 + 10 新增结构逐一定义六属性（产生/消费/持久化/上下文/提示词/缺失），并给出全链路五段流。核心修复——四个"0 次字段"现在各有明确落槽位置（`industryProfile→槽6`、`consumerInsights→槽2/8`、`marketingStrategy→槽8/9`、`globalVisualDNA→槽7/15`），保证不再只停在 Schema。

本阶段零业务代码改动。字段的实际落地随 S2-C / V2-ARCH-007 排期执行；专业字段语义待 ChatGPT 定型。
