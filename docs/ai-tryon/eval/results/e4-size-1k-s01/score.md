# e4-size-1k-s01 — 人工评分

> 评分规则：`docs/ai-tryon/eval/人工评分规则.md`（六维 × 0–2）。评分方式：目视比对原图 A 与参考图 B。
> ⚠️ 本评分为**视觉模型自评**，按规则只作参考、不作唯一真值；正式交付前建议由用户复核。

## 用例

- 模型：`tt-image-2.5`
- 样本：`s01`（A=目标人物，B=服装参考）
- 提示词：`A` 组（A=用户当前真实基线）
- 掩膜模式：无掩膜
- 分辨率档位：`imageSize=1K`

## 六维评分

| 维度 | 得分 | 对应失败标签 |
|---|---|---|
| 人体结构 | 2 / 2 | `BODY_SHAPE_DRIFT` |
| 服装轮廓/版型 | 2 / 2 | `GARMENT_TOO_BULKY / FIT_TYPE_DRIFT` |
| 颜色一致性 | 1 / 2 | `COLOR_SHIFT` |
| 图案/细节 | 2 / 2 | `PATTERN_DISTORTION / DETAIL_MISSING` |
| 非编辑区 | 2 / 2 | `BACKGROUND_CHANGED / POSE_OCCLUSION_ERROR` |
| 边缘/完整性 | 1 / 2 | `EDGE_ARTIFACT` |

**总分：10 / 12 ｜ 分级：B 级**

## 依据

1K 档位清晰度足够，灯芯绒肌理可辨；灯笼袖收腰短夹克廓形完整、oversize 落肩明确；色调偏深偏绿与参考一致度略降；局部发梢/裤脚轻微糊化
