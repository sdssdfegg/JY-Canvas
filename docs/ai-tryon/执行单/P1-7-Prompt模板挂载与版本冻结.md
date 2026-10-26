# P1-7 Prompt 模板挂载与版本冻结（✅ 已实施·待合入 main）

> 派发状态：✅ **已实施**（特性分支 `feature/p1-7-prompt-template-freeze`）｜ 上位：`docs/ai-tryon/执行单/P1-分解总览.md` 序 7 ｜ 依赖：P1-5（仅双分支句部分）｜ 契约：`contracts/prompt-template-v1.md` §2。
>
> **解锁依据**：E1 实测（`EVIDENCE.md` §三-A）显示基础换装不依赖掩膜即能保身份/保背景，精确人体保护掩膜属 P3（S6/S33 既定归属）→ 双分支句固化到「不提前承诺掩膜分支」。
>
> **待办**：代码已提交（`68511a0` 探针渠道修复 / `33e71b0` 模板实现），**待统筹复核后合入 main**，合入后按约定归档至 `docs/ai-tryon/执行单/已完成/2026-10/`。

---

## 0. 现状取证（含落点更正）

- 服务端权威提示词 `buildOutfitPrompt` **真实定义**在 `prompts/server/outfit-skill.js:113`；
- ⚠️ **落点更正**：本单初稿引用为 `server/outfit-skill.js`，但该文件实为 **13 行 `export *` 转发壳**（仅用于保持单一导入路径约定），不含函数定义。施工时按真实落点改。
- 缺：分层模板结构（固定规则层 + 单次任务指令层；档案层/模特约束层留 P2/P3 接口）、`prompt_template_version` + 内容哈希、**每任务冻结**。

## 1. 已实施改动

### 1.1 分层组装
- 新增 `prompts/server/outfit-prompt-template.js`（**零依赖叶子**，仅 `node:crypto`）：
  - `PROMPT_TEMPLATES` 注册表：`v1` = 契约 §2 全文（**保留**未固化双分支句，作 B 组实验基线/历史留档）；`v2` = 按 E1 结论**固化**到「已验证的兜底流程」分支；
  - `computeTemplateHash`：sha256 前 12 位，模板文本任一字符改动即换哈希（冻结回溯前提）；
  - `assembleLayers`：按契约 §1 装配四层（固定规则→服装档案→模特约束→单次任务指令），空层自动跳过；层 2/3 为 **P2/P3 占位桩**（恒空串，不改变输出）。
- `server/outfit-skill.js` 壳转发新模块（保持单一导入路径）。

### 1.2 版本冻结
- `execution.buildTryOnPrompt`：单次任务指令层**仍由权威 `buildOutfitPrompt` 构建**（语义不变），命中模板版本时才叠加固定规则层，返回 `templateVersion`/`templateHash`/`layers`；
- `createTryOnTask`：进入 `READY_TO_GENERATE` 时**冻结** version + hash，写入任务（P1-1）与生成日志（P1-3，字段 `prompt_template_version`/`prompt_template_hash`），符合 `tryon-task.md §4` 与 `log-fields.md §2`。

### 1.3 双分支句固化（🔴 原阻塞点 → 已裁定）
- 按 E1 结论固化到 `contracts/prompt-template-v1.md` §2.1：**「不提前承诺掩膜分支；基础换装走双图身份保持，精确人体保护掩膜留 P3 接入」**。
- 🔴 **关键安全设计**：`DEFAULT_PROMPT_TEMPLATE_VERSION = null` ⇒ **默认不挂载模板**，生产提示词与历史契约**逐字一致**，P0 生命线零风险。是否切到 v2 需先跑基线/回归样本评测（总纲 §4.1），本单不自动生效。

## 2. 非目标（明确不做）
- 档案层/模特约束层实质内容（P2/P3）；
- 模板语义重写（沿用现有服务端权威构建，只加版本与分层壳）。

## 3. 验收（已完成）
- ✅ 任一 task 可回溯 `prompt_template_version` + 哈希（单测覆盖）；
- ✅ 双分支句与 E1 结论一致（契约 §2.1 已固化）；
- ✅ 冻结后任务不受后续设置变更影响（单测）；
- ✅ 门禁全绿：check-syntax **304/304**、ESLint **0 error**、size-ratchet **0 回归**、run-all --fast **40/40**（39→40，新增 `tryon-prompt-template-check.mjs`）、vite build **EXIT=0**。

## 4. 回滚
减分支/版本字段即回滚；`v4.0` tag 保底。

## 5. 风险与遗留
- 双分支句已按 E1 结论固化，但**精确掩膜有效性仍待 P2/P3 用精确掩膜 + 钉 seed（E4）复验**；
- 与 P1-5 的 `buildOutfitPrompt` 调用点耦合 —— P1-5 仅调用，不依赖本单分层实现；
- 模板默认不生效，切换前须完成基线/回归评测。
