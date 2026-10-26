# P1-7 Prompt 模板挂载与版本冻结（拟稿·⛔阻塞）

> 派发状态：⛔ **阻塞：待 P0-B E1（Mask 语义）结论** ｜ 上位：`P1-分解总览.md` 序 7 ｜ 依赖：P1-5（仅双分支句部分）｜ 契约：`contracts/prompt-template-v1.md` §2。
>
> 本单是从原 V129 拟稿中**隔离**出的唯一 P0-B 依赖项（对应 V129 前置②），不阻塞 P1-1～P1-6 派发。

---

## 0. 现状取证
- 服务端权威提示词：`outfit-skill.js` `buildOutfitPrompt`（routes `:299`/`:380`）已存在且为权威构建（P0-A §3 已确认 ✅）；
- 缺：分层模板结构（固定规则层 + 单次任务指令层；档案层/模特约束层留 P2/P3 接口）、`prompt_template_version` + 内容哈希、**每任务冻结**；
- 双分支句（prompt-template-v1.md §2）需 P0-B E1 结论二选一固化——**提前写会锁定错误措辞**，故阻塞。

## 1. 改动要求（待解除阻塞后实施）

### 1.1 分层组装
- 在 `outfit-skill.js` `buildOutfitPrompt` 扩展为分层 + 版本哈希；档案层/模特约束层留接口（P2/P3 填）。

### 1.2 版本冻结
- 每任务冻结 `prompt_template_version` + `prompt_template_hash`，写入任务（P1-1）与日志（P1-3 `prompt_template_version`/`prompt_template_hash`）；
- 冻结后设置变更不影响在途任务（tryon-task.md §4 冻结规则，与 `outfit-batch-execution.js:337-340` 先例同构）。

### 1.3 双分支句固化（🔴 阻塞点）
- 按 P0-B E1 结论在 `prompt-template-v1.md §2` 二选一固化后，本单方可派发。

## 2. 非目标（明确不做）
- 档案层/模特约束层实质内容（P2/P3）；
- 模板语义重写（沿用现有服务端权威构建，只加版本与分层壳）。

## 3. 验收（解除阻塞后）
- 任一 task 可回溯 `prompt_template_version` + 哈希；
- 双分支句与 E1 结论一致；
- 冻结后任务不受后续设置变更影响（单测）；
- 门禁全绿。

## 4. 回滚
减分支/版本字段即回滚；`v4.0` tag 保底。

## 5. 风险
- 双分支句未定即写 → 锁定错误措辞 → **故本单保持阻塞直至 P0-B E1 结论**；
- 与 P1-5 的 `buildOutfitPrompt` 调用点耦合 → P1-5 仅调用，不依赖本单分层实现。
