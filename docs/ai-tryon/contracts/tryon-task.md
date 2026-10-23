# 契约：TryOnTask（换装任务数据契约）

> 总纲 §5.1 的落地版。原则：**先定义，再写业务**；所有跨层传递用本契约，不允许各层私传临时结构。
> 版本：contract-v1（2026-10-22 起草，T-001）｜ 状态：待 P1 施工评审

## 1. 字段定义

| 字段 | 类型/示例 | 规则 |
|---|---|---|
| `task_id` | 稳定 ID（字符串） | **复用现有 taskId 语义**（前端批次已生成 taskId，见 `outfit-batch-execution.js:331`）；创建后不可更改；日志/资产/结果全部关联它 |
| `idempotency_key` | 客户端生成的提交键 | 同一请求重复提交不得重复计费；外部不支持幂等时用本地 attempt 记录 + 去重窗口降低风险（总纲 §4.4） |
| `status` | 状态枚举 | 只允许 `contracts/state-machine.md` 定义的合法转移 |
| `input_model_asset` | `{asset_id, version, hash}` | A 图**资产引用**，不存临时路径（临时上传物的教训见 EVIDENCE S12） |
| `input_garment_asset` | `{asset_id, version, hash}` | B 图资产引用 |
| `garment_profile_id` / `garment_profile_version` | 可空 ID + 版本 | 引用档案**快照**；生成过程中不随档案编辑变化（总纲 §5.2 变更策略） |
| `reference_type` | `flat_lay / hanger / worn / auto / unknown` | 低置信度可要求用户确认（需求说明 §6） |
| `fit_type` | `fitted / regular / loose / oversized / unknown` | 允许人工纠正；保留来源与置信度 |
| `options` | `{bodyPreserve, colorFidelity, qualityMode, outputSpec}` | 必须经服务端校验和能力映射（总纲 §5.1） |
| `prompt_template_version` | 版本号或内容哈希 | 每任务冻结（见 `contracts/prompt-template-v1.md`） |
| `model_policy_version` | 版本号 | 记录选择模型与渠道的策略版本（ADR-005 的落点） |
| `preprocess_version` / `postprocess_version` | 版本号 | 允许后续回溯差异 |
| `attempts` / `retry_budget` / `cost_budget` | 整数/金额/时长 | **每次外部调用前校验**（总纲 §4.4 预算） |
| `created_at` / `updated_at` / `finished_at` | ISO 时间戳 | 统一时区/格式 |
| `result_asset_ids` | 资产 ID 列表 | 原始输出/后处理输出/最终交付分别留档 |
| `quality_report_id` | 可空 ID | 评估失败时也记录原因和置信度 |

## 2. 关联对象（契约引用，不在本表展开）

- `GarmentProfile`（服装档案）：P2 交付，字段见总纲 §5.2；本契约只存 `id + version` 快照引用。
- `QualityReport`（质量报告）：P4 交付，字段见总纲 §5.3；本契约只存 `quality_report_id`。
- `attempt` 记录：每次外部调用的 `{attempt_id, request_id, started_at, finished_at, model, channel, error_class, cost}`——`request_id` **复用现有日志 requestId**（`generation-logger.js` 已在记）。

## 3. 存储落点（复用现有模式，不引新数据库）

- 位置：`data/ai-tryon/tasks/<task_id>.json`（参照 `data/history.json` / `data/history-images/` 既有落盘模式，EVIDENCE S11）；
- 写入：**临时文件 + 原子替换**（总纲 §4.4 原子写入；现成先例：generation-logger 的 rename 写法，`generation-logger.js:19`）；
- 索引：`data/ai-tryon/tasks/index.json`（单写入器串行化，防并发写坏——总纲风险表「JSON 并发写入」行）；
- 迁移/备份：随 data/ 既有备份策略（`history.json.bak-*` 先例）。

## 4. 版本冻结规则

1. 任务进入 `READY_TO_GENERATE` 时冻结：输入资产引用、档案快照、Prompt 版本、模型策略、预算；
2. 冻结后任何一侧修改（档案编辑/设置变更）**不影响在途任务**（与现有「任务快照冻结」纪律同构：`outfit-batch-execution.js:337-340` 只认任务快照）；
3. 终态不静默覆盖；需要新尝试时创建受关联的新 attempt/新任务。

## 5. 与现有体系的关系（不推倒重来）

- `task_id` = 现有 taskId；`request_id` = 现有 requestId；资产落盘 = history-images/asset-library 模式；
- 今天 outfit 生成是**客户端驱动的同步请求**（`/api/generate-outfit` 一问一答）；本契约是同一链路之上的轻量任务记录层，P1 最小版不改变现有请求路径，只在两侧补持久化与状态。
