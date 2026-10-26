# e5-nano-s01-r1 — 人工评分

> 评分规则：`docs/ai-tryon/eval/人工评分规则.md`（六维 × 0–2）。评分方式：目视比对原图 A 与参考图 B。
> ⚠️ 本评分为**视觉模型自评**，按规则只作参考、不作唯一真值；正式交付前建议由用户复核。

## 用例

- 模型：`nano-banana-pro`
- 样本：`s01`（A=目标人物，B=服装参考）
- 提示词：`B` 组（结构化提示词，含人体保护/版型保真/细节保真/禁止额外部件约束）
- 掩膜模式：无掩膜

## 六维评分

| 维度 | 得分 | 对应失败标签 |
|---|---|---|
| 人体结构 | 2 / 2 | `BODY_SHAPE_DRIFT` |
| 服装轮廓/版型 | 0 / 2 | `GARMENT_TOO_BULKY / FIT_TYPE_DRIFT` |
| 颜色一致性 | 2 / 2 | `COLOR_SHIFT` |
| 图案/细节 | 1 / 2 | `PATTERN_DISTORTION / DETAIL_MISSING` |
| 非编辑区 | 2 / 2 | `BACKGROUND_CHANGED / POSE_OCCLUSION_ERROR` |
| 边缘/完整性 | 2 / 2 | `EDGE_ARTIFACT` |

**总分：9 / 12 ｜ 分级：C 级**

## 依据

颜色与参考一致、非编辑区（背景/裤/鞋）干净，边缘无撕裂；但版型由 oversize 变为收腰短款并新增黑毛领与腰封，面料质感无法核对。
