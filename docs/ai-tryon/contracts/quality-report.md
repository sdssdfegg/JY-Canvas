# 契约：QualityReport（质量报告）

> 总纲 §5.3 + 需求说明 §10 的落地版。原则：**不以 HTTP 200 作为成功**；自动裁判不能单独决定关键结果，必须保留人工基准与抽检。
> 版本：contract-v1（2026-10-23 起草，T-002）｜ 状态：待 P4 施工评审。

## 1. 字段定义

| 字段 | 类型/规则 |
|---|---|
| `quality_report_id` / `task_id` / `attempt_id` | 与任务和具体尝试绑定 |
| `overall_grade` | `A`（直接交付）/ `B`（可局部修复）/ `C`（重生成或人工复核） |
| `dimensions[]` | 每维 `{name, score(0-2), confidence, source(rule/vision_model/human), evidenceRef}`；维度集 = 人体结构、服装轮廓、版型、颜色、图案细节、边缘遮挡、非编辑区、完整性（对齐 eval/人工评分规则.md） |
| `failure_tags[]` | 标准化标签数组，允许多标签并存（标签集见 state-machine.md §5） |
| `scores` / `confidence` | 汇总分数 + 整体置信度；**低置信度不得触发自动动作** |
| `recommended_action` | `accept / local_repair / retry / restore_non_edit_region / human_review` |
| `evidence` | 指标值（如 ΔE00 中位数/P95）、区域引用、视觉模型判定摘要、人工反馈与时间 |
| `policy_version` | 质量策略版本（阈值/权重/动作映射），任务冻结 |
| `created_at` | ISO 时间戳 |

## 2. 判定来源与优先级

1. **规则指标**（确定性强）：颜色 ΔE00（服装区域内、排除皮肤/背景/阴影边缘）、非编辑区像素差（对齐可靠时）、输出规格符合性；
2. **视觉模型裁判**（辅助）：输出可解释摘要，**不作唯一真值**；
3. **人工反馈**（终审）：用户「通过/版型臃肿/颜色不准/细节错误/人体变化/其他」回写标签，沉淀为回归基准。

## 3. 与状态机的衔接

- `EVALUATING` 产出本报告 → 按 `overall_grade` + `recommended_action` 转移（state-machine.md §1）；
- 评估失败也**必须落报告**（记录原因和置信度）——失败可解释率是指标之一；
- `REPAIR_PENDING` 的修复次数受任务预算约束（初始策略 ≤1 次针对性修复，P0 成本实验后由用户确认）。

## 4. 第一版（P4 MVP）边界

- 必须：八维评分（规则可分阶段补齐，缺的维标 `unknown` 而非 0 分）、失败标签、A/B/C 分级、人工反馈入口、报告落盘（`data/ai-tryon/reports/<report_id>.json`，原子写同任务存储）；
- 不做：复杂评分模型、自动校色执行（置信度达标才做，见 ADR-007）、视觉裁判独裁。

## 5. 红线

- 报告属用户数据：不随包（红线②）、不误删（红线④）；
- 日志只记 report_id 与分级，不复制大块证据图（log-fields.md §4）。
