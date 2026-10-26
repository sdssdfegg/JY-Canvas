# e2-tt25-s02-r2 — 人工评分

> 评分规则：`docs/ai-tryon/eval/人工评分规则.md`（六维 × 0–2）。评分方式：目视比对原图 A 与参考图 B。
> ⚠️ 本评分为**视觉模型自评**，按规则只作参考、不作唯一真值；正式交付前建议由用户复核。

## 用例

- 模型：`tt-image-2.5`
- 样本：`s02`（A=目标人物，B=服装参考）
- 提示词：`A` 组（A=用户当前真实基线）
- 掩膜模式：无

## 六维评分

| 维度 | 得分 | 对应失败标签 |
|---|---|---|
| 人体结构 | 2 / 2 | `BODY_SHAPE_DRIFT` |
| 服装轮廓/版型 | 1 / 2 | `GARMENT_TOO_BULKY / FIT_TYPE_DRIFT` |
| 颜色一致性 | 2 / 2 | `COLOR_SHIFT` |
| 图案/细节 | 1 / 2 | `PATTERN_DISTORTION / DETAIL_MISSING` |
| 非编辑区 | 2 / 2 | `BACKGROUND_CHANGED / POSE_OCCLUSION_ERROR` |
| 边缘/完整性 | 2 / 2 | `EDGE_ARTIFACT` |

**总分：10 / 12 ｜ 分级：B 级**

## 依据

上衣与木耳边领口袖口完整；有立体花朵装饰但非全覆盖蕾丝刺绣；色准
