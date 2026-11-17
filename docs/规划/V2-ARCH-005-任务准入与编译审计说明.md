# V2-ARCH-005 · 任务准入与编译审计说明（阶段 D/E）

> 任务来源：V2-ARCH-001 任务书阶段 D（准入）+ 阶段 E（编译器与提示词质量）。架构依据：`V2-ARCH-002`（主规范）、`V2-ARCH-003`（字段契约）、`V2-ARCH-004`（行业包）。
> 性质：**机制设计文档**，零业务代码改动。**任务内容（哪些任务、专业推理）由 ChatGPT 后续交付**；本文件定义注册结构、四态判定、编译授权与审计机制。
> 日期：2026-11-17　基准 HEAD：`ae786be`。

---

## 1. 为什么需要这一层（阶段 A 现状）

- 现有 `SCREEN_MODULES`（`detail-skills.js:271`，9 个 moduleId）按标题/索引选模块（`:332-354/552-565`），**无适用性前置校验**——真机"材质无法确认仍选材质模块"即源于此。
- 17 槽位编译器（`middleware:602-624`）**无授权检查**：AI 文本直拼（图0/图1冲突）、质检 `slice(0,8)` 截断、策划语汇直入最终提示词。
- 没有任何"任务准入结果"或"指令来源"的结构化记录。

本文件把这两件事补上：**任务准入（L3）** + **编译授权与审计（L4-C）**。

---

## 2. 任务注册表结构

### 2.1 内容任务 / 视觉任务分表
- `contentTaskRegistry`：consumerQuestion 类（定位/问题/证明/用法/边界/规格…）。
- `visualTaskRegistry`：画面表达类（整体展示/结构细节/使用对象细节/使用过程/效果证明/场景…）。
- 两者**分别准入**，不混在一个列表。

### 2.2 注册字段（任务书字段表，逐项落实）
| 字段 | 作用 | 谁填 |
|---|---|---|
| `taskId` | 唯一标识 | 工程（ID 规范） |
| `taskType` | content / visual | 工程 |
| `allowedIndustries` | 允许行业 | ChatGPT（专业） |
| `requiredAttributes` | 必须具备的产品属性 | ChatGPT |
| `requiredFacts` | 必须有依据的事实 | ChatGPT |
| `evidenceRequirements` | 证据类型 | ChatGPT |
| `excludedConditions` | 明确排除条件 | ChatGPT |
| `userOverridePolicy` | 用户指定时处理 | 工程 + ChatGPT |
| `outputRequirements` | 进分屏的输出要求 | ChatGPT |

> 本批定义结构与 ID 规范，**不填具体任务内容**（ChatGPT 职责）。

---

## 3. 四态准入判定

### 3.1 状态定义（裁决 D-PLAN-14-02）
| 状态 | 含义 | 进分屏 |
|---|---|---|
| `admitted` | 事实/适用/排除条件均满足 | 是 |
| `rejected` | 行业不匹配 / 命中排除 / 无依据 | 否 |
| `pending` | 缺必要事实 | 否 |
| `generic_fallback` | 无行业包，安全通用任务 | 是（通用池） |

### 3.2 判定顺序（确定性，优先级从高到低）
1. **行业匹配**：`task.allowedIndustries` 不含当前 `industryId` → `rejected`（如清洁剂遇服装任务）。
2. **排除条件**：`excludedConditions` 命中 `productFacts/capabilityProfile` → `rejected`。
3. **必需事实**：`requiredFacts` 中有 `status≠L1` 者 → `pending`（记缺哪项）。
4. **证据要求**：`evidenceRequirements` 未满足 → `pending`。
5. **行业包**：无匹配包且任务非通用 → `generic_fallback`（若任务 `allowGeneric`）或 `rejected`。
6. **用户偏好**：`selectedSections` 冲突 → 记录但不改变状态（偏好只排序，不越权）。
7. 全部通过 → `admitted`。

### 3.3 准入记录（必须结构化，不让模型"自行判断"）
每个候选写：`{ taskId, taskType, admission, reason, requiredFactsSatisfied, missingFacts, sourceIndustry }`。`reason` 不进最终提示词，但进审计与调试。

### 3.4 已知问题的直接消解
| 真机问题 | 准入层如何拦 |
|---|---|
| 材质不可确认仍选材质细节 | `requiredFacts=材质确认`，L3 判 `pending` → 不进分屏 |
| 服装规则串入清洁剂 | `allowedIndustries` 不含 cleaning → `rejected` |
| "棉"写进包装材质 | 六类 factType 分离，L1 才 admitted，L3 不认混装 |
| 功效扩大到奶渍 | `requiredFacts=说明书证据`，无 → `pending/rejected`；用户偏好也不翻转 |

---

## 4. 编译器授权检查（L4-C）

### 4.1 授权白名单（最终提示词只能包含）
1. `productFacts` 中 `status=L1` 且 `allowedUse` 允许的事实值；
2. L3 `admitted` / `generic_fallback` 任务的 `outputRequirements`；
3. 当前屏 `consumerQuestion` 转写的**消费者文案**（非分析原文）；
4. `globalVisualDNA` 中真正影响画面的视觉属性（palette/lighting/texture/cameraLanguage/ratio/tone）；
5. 用户明确提出的视觉要求。

### 4.2 禁止清单（任务书第六节 + 阶段 A 真机）
- ❌ 内部策划分析原样输出（"本屏旨在…/通过视觉语言…/强化购买欲/营造高级质感"无执行方式者）；
- ❌ 消费者洞察写成无意义解释段；
- ❌ 重复堆叠营销策略 / 同一卖点反复；
- ❌ 自动补未规划屏幕任务；
- ❌ 自动加产品结构/材质/适用范围；
- ❌ 无具体执行意义的空泛形容词；
- ❌ 全局视觉 DNA 与分屏叙事混在一起（三段式写进 `visualStyle` 的老问题）；
- ❌ 无来源的产品事实（`middleware:592` 直取 AI materials 的老问题）。

### 4.3 编译净化规则
- 每段重要指令必须有来源：`sourceField` 或 `sourceTaskId`；无来源 → 丢弃并记审计。
- 字段内容不足 → **省略或用安全通用表达**，不让模型用废话补篇幅。
- 17 槽位逐槽授权：`槽6` 行业段取自统一 `industryProfile`（非另算）；`槽16` 质检去 `slice(0,8)` 截断、只列 admitted 的本屏质检；`槽4/8/9` 卖点文案受 L1 事实边界约束。

---

## 5. 编译审计（compilerAudit）

### 5.1 审计字段
| 字段 | 含义 |
|---|---|
| `plannedTaskIds` | L3 admitted 的任务 |
| `usedTaskIds` | 最终提示词实际使用的任务 |
| `unusedTaskIds` | 规划了但未用 |
| `perSegmentSource` | 每段重要指令的 sourceField/sourceTaskId |
| `unauthorizedAdded` | 编译器是否加了未授权内容（布尔+详情） |
| `factBoundaryBroken` | 是否突破事实边界（布尔+详情） |

### 5.2 审计用途
- 门禁：`unauthorizedAdded=true` 或 `factBoundaryBroken=true` → 判红（配负向对照）。
- 调试/复核：顾问可见"哪句提示词来自哪个字段/任务"。
- **审计本身不进生图提示词**（V2-ARCH-003 §5）。

### 5.3 与 QC 三层的关系（任务书 phase D #9 + 阶段 F）
| 层 | 性质 | 是否用户可选 |
|---|---|---|
| 规划阶段基础结构校验 | 系统控制（L2/L3 判定 + 必做） | 否，必做 |
| 最终提示词编译校验 | 系统控制（授权检查 + 审计，必做） | 否，必做 |
| 用户主动整套 QC | 独立按钮，可跳过 | 是；只给建议，不自动覆盖 |

> 前两层是"必要系统控制"，**不等于**把完整 QC 变成生成前置条件（任务书明令）。

---

## 6. 首批任务范围（阶段 D：少量可靠）
- 只建：清洁日化的任务注册机制 + 少量通用任务（商品定位整体展示、已确认用法、保守规格）。
- 不建：庞大任务库、行业专业任务正文（ChatGPT 后续）。
- 每个首批任务配准入负向测试（阶段 F 案例 5）。

---

## 7. 本阶段结论

阶段 D/E 的任务准入与编译审计机制完成：注册表结构、四态判定、七步判定顺序、准入记录、编译授权白名单/禁止清单、compilerAudit 六字段、QC 三层区分均已定义，并逐条对应真机问题。任务具体内容由 ChatGPT 交付后填入注册表；机制落地随 S2-C 排期（见 V2-ARCH-007）。

本阶段零业务代码改动。
