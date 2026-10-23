# 契约：generation.jsonl 扩展字段（换装任务）

> 总纲 §12 的落地版。原则：**扩展现有 JSONL，不另建重复系统**；字段增量兼容，旧消费者不受影响。
> 版本：contract-v1（2026-10-22 起草，T-001）｜ 状态：待 P1 施工评审。

## 1. 现有字段（不动，EVIDENCE S10）

`time / requestId / ok / status / stage / event / endpoint / method / model / requestedModel / imageSize / aspectRatio / workflowMode / n / fileCount / uploadBytes / maskBytes / contentLength / promptChars / promptBytes / url / channelId / channelLabel / attempt / imageCount / durationMs / detail` 等（以 `generation-logger.js:139-162` 实测为准）。

## 2. 新增字段（全部可选，缺失时消费者按默认处理）

| 字段 | 说明 |
|---|---|
| `task_id` | 关联 TryOnTask（= 现有 taskId 语义） |
| `attempt_id` | 本次尝试标识 |
| `idempotency_key` | 提交幂等键 |
| `failure_tag` | 标准化失败标签（state-machine.md §5 标签集） |
| `model_policy_version` | 模型/渠道策略版本 |
| `input_asset_id` / `input_asset_hash` / `input_asset_version` | A/B 输入资产引用（引用优于复制，见 §4） |
| `garment_profile_id` / `garment_profile_version` | 服装档案快照引用 |
| `mask_asset_id` / `mask_version` / `mask_strategy` | 掩膜资产与策略版本 |
| `prompt_template_version` / `prompt_template_hash` | 冻结的模板版本 |
| `preprocess_version` / `postprocess_version` / `quality_policy_version` | 处理链版本 |
| `stage_timing_ms` | 阶段耗时（分析/生成/后处理/评估分段） |
| `retry_count` | 第几次重试 |
| `estimated_cost` / `actual_cost` / `budget_remaining` | 成本与预算余额（actual_cost 若上游可获得） |
| `quality_grade` / `quality_dimensions` / `quality_confidence` | 质量分级与各维分数（P4 起填） |
| `human_feedback` / `final_delivered` | 人工反馈与是否最终交付 |

## 3. 兼容性规则

1. 只增不删不改语义；旧字段旧消费者零影响；
2. 新字段缺失 = 该任务未走新链路，消费者按「未知」处理，不得报错；
3. JSONL 追加须容忍尾部不完整行 + 有备份/重建策略（总纲 §4.4；现有 rename 原子写法可沿用）；
4. 字段命名与现有风格一致（camelCase）。

## 4. 脱敏与红线（总纲 §12 + 封装框架①）

- **禁写 KEY**（apiKey/token/authorization 一律不进日志——现有链路本就不记，新增字段不得破例）；
- 不把大块原图/完整高敏提示词复制进日志——记**资产引用与哈希**；
- 日志文件属 data/ 用户数据目录，不随包（红线②：包内零生图信息记录——`logs/` 已在 .gitignore）。
