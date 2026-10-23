# 契约：统一内部接口（换装能力体系）

> 总纲 §6 的落地版。原则：逻辑接口先定义，命名和目录按项目既有风格落地；**Adapter 只做能力声明/参数映射/输入格式/响应规范化，不决定业务质量等级**。
> 版本：contract-v1（2026-10-23 起草，T-002）｜ 状态：待 P1/P4 施工评审。

## 1. 接口清单

| 接口 | 输入 | 输出/约束 | 归属 |
|---|---|---|---|
| `createTryOnTask` | A/B 资产、选项、档案 ID、幂等键 | 校验后持久化任务，返回 `task_id`；**不在请求线程执行完整流水线** | P1 |
| `analyzeInputs` | 任务快照、资产引用 | 输入质量、人物/服装分析、置信度、可用区域信息；不可靠显式 `unknown` | P3（依赖 P0 视觉结论） |
| `buildTryOnPrompt` | 任务快照、档案快照、分析结果、模板版本 | 可审计的分层 Prompt + 哈希；**服务端最终构建为准** | P1 |
| `resolveModelCapabilities` | `model_id`、`channel_id`、能力配置版本 | 多图/Mask/尺寸/seed/限流等能力及**证据状态**（三态，见 §2） | P1（读现有目录） |
| `generateTryOn` | 标准化请求、Adapter、预算许可 | 统一响应：资产引用、request_id、耗时、成本、原始元数据/错误类别 | P1（复用现有路由） |
| `postProcess` | 生成资产、原图、区域信息、策略版本 | 新资产引用 + 每步元数据；🔴 **禁止覆盖输入资产** | P3/P4 |
| `evaluateResult` | 原图、B、生成结果、档案、区域与策略 | QualityReport；可输出低置信度/需人工复核 | P4 |
| `retryOrRoute` | 质量报告、错误类别、预算余额 | 有限、可解释的下一动作；**不得无限循环** | P1（最小版） |

## 2. 能力三态（总纲 §6.1，生产纪律）

- `SUPPORTED`：有真实接口文档**与本项目链路实测证据**；
- `UNSUPPORTED`：接口明确不支持，或受控测试证实不可用；
- `UNKNOWN`：尚未验证——**生产策略不得把 UNKNOWN 当作 SUPPORTED**。

能力矩阵按 `model_id + channel/route_id + 参数映射版本` 记录（避免同一展示名在不同上游线路表现不同）；模型选择由基线数据决定，允许按参考图类型/服装品类/质量模式配置。

## 3. 与现有代码的挂点（EVIDENCE 索引）

- 能力声明基座：`server/channel-config.js` 能力目录 + `server/channel.js` 读取器（S2/S16）——`resolveModelCapabilities` 扩展此结构，**不新建第二套**（ADR-005）；
- 生成出口：现有 `/api/generate-outfit` + channel 多格式适配（S3/S4/S7）——`generateTryOn` 的标准化请求最终经此出海；
- 预算/并发：调用前检查 + 现有并发槽（S14，state-machine.md §2.6）；
- 版本冻结：任务快照纪律同现有「批次开始后冻结」（outfit-batch-execution.js:337-340 先例）。

## 4. P1 实现的接口子集

`createTryOnTask` / `buildTryOnPrompt` / `resolveModelCapabilities`（读目录）/ `generateTryOn`（经现有路由）/ `retryOrRoute`（最小：重试分类 + 预算门）。其余接口留签名占位，P3/P4 实填——**先冻结签名，后填实现**，防各层私传临时结构。
