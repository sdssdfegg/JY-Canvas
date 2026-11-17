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
