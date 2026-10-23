# 契约：换装任务状态机

> 总纲 §4.3 的落地版。版本：contract-v1（2026-10-22 起草，T-001）｜ 状态：待 P1 施工评审。

## 1. 状态与转移

| 状态 | 允许的转移 | 说明 |
|---|---|---|
| `CREATED` | → `VALIDATING` / `CANCELLED` | 任务已持久化，尚未执行外部调用 |
| `VALIDATING` | → `ANALYZING` / `FAILED` | 检查图片、参数、权限、预算与档案版本 |
| `ANALYZING` | → `READY_TO_GENERATE` / `NEEDS_REVIEW` / `FAILED` | 分析输入并记录置信度；**不可靠不伪造掩膜** |
| `READY_TO_GENERATE` | → `GENERATING` / `CANCELLED` | 冻结输入引用、Prompt 版本、模型策略与预算 |
| `GENERATING` | → `POSTPROCESSING` / `RETRY_WAIT` / `FAILED` / `CANCELLED` | 保存 request_id、尝试次数和错误分类 |
| `POSTPROCESSING` | → `EVALUATING` / `NEEDS_REVIEW` / `FAILED` | 所有后处理有版本、有输入输出引用 |
| `EVALUATING` | → `SUCCEEDED` / `REPAIR_PENDING` / `NEEDS_REVIEW` / `FAILED` | **按质量报告决定，不以 HTTP 200 作为成功** |
| `REPAIR_PENDING` | → `GENERATING` / `POSTPROCESSING` / `NEEDS_REVIEW` | 仅针对可修复问题，修复次数有上限 |
| `RETRY_WAIT` | → `GENERATING` / `FAILED` / `NEEDS_REVIEW` | 只对可重试错误，延迟和次数受限 |
| `SUCCEEDED` / `FAILED` / `CANCELLED` / `NEEDS_REVIEW` | 终态 | 需新尝试时创建受关联的新 attempt；终态不静默覆盖 |

## 2. 可靠性规则（总纲 §4.4 逐条落地）

1. **持久化优先**：外部模型调用**之前**先写任务状态和 attempt 记录；调用返回后保存响应元数据与资产引用；
2. **幂等**：创建任务带 `idempotency_key`；重复提交不重复计费；
3. **恢复**：应用重启后扫描非终态任务——按最后检查点恢复或标记 `NEEDS_REVIEW`，**不盲目重新生图**；
4. **超时与租约**：每阶段有超时；执行中任务带 worker/lease 标识与心跳，防两个执行者同时处理；
5. **重试分类**：限流/临时网络/超时 → 有限指数退避；参数错误/无效输入/权限错误 → **不自动重试**；质量失败 → 仅策略允许时有限修复；
6. **预算门**：每任务最大生成次数/修复次数/耗时/金额；**检查发生在调用之前**；
7. **取消**：取消后不启动新步骤；进行中的外部调用结果返回后记录但不自动继续后处理/重试；
8. **可观测**：task_id/attempt_id/request_id/阶段耗时/模型渠道/错误类别/资产引用/预算消耗（字段见 `contracts/log-fields.md`）。

## 3. 初始策略默认值（须 P0 成本实验后由用户确认）

- 最多 2 次额外生成尝试 + 最多 1 次针对性修复（总纲 §11 建议起点）；
- 退避：指数退避，上限次数受 retry_budget 约束；
- ⚠️ 以上为工程默认值，不是上游模型能力保证；任何策略同时受任务预算上限约束。

## 4. 与现状的衔接（P1 最小版不推翻现有链路）

- 现状：`/api/generate-outfit` 同步请求 → 客户端驱动批次（`outfit-batch-execution.js`）；失败重试靠客户端；
- P1 最小版：在同一链路两侧补「任务记录 + 状态 + attempt」——服务端在现有路由内写任务状态（先持久化后调用），客户端读取状态渲染；**不新建队列、不改并发槽**（EVIDENCE S14）；
- 批量场景：客户端一次提交 N 个任务 = N 条 TryOnTask（taskId 现成），并发仍走现有并发槽 + 任务级公平性。

## 5. 失败标签（第一版，总纲 §5.3/需求说明附录 B）

`BODY_SHAPE_DRIFT`、`GARMENT_TOO_BULKY`、`FIT_TYPE_DRIFT`、`COLOR_SHIFT`、`PATTERN_DISTORTION`、`DETAIL_MISSING`、`EDGE_ARTIFACT`、`BACKGROUND_CHANGED`、`POSE_OCCLUSION_ERROR`、`MODEL_API_ERROR`。
