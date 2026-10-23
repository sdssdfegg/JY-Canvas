# 契约：GarmentProfile（服装档案）

> 总纲 §5.2 的落地版。原则：档案的价值不是把图再存一次，而是让同款衣服跨模特、跨批次复用**一份标准约束**；档案修改生成新版本，既有任务永远引用创建时的快照。
> 版本：contract-v1（2026-10-23 起草，T-002）｜ 状态：待 P2 施工评审。

## 1. 字段定义

| 字段 | 类型/规则 |
|---|---|
| `garment_profile_id` | 稳定 ID（SKU/款式名可作人类可读别名，ID 本身不变） |
| `version` | 整数递增；每次修改升版，**旧版本文件不删不改** |
| `status` | `draft`（自动提取待确认）/ `confirmed`（人工确认）/ `archived` |
| `created_at` / `updated_at` | ISO 时间戳 |
| `reference_assets[]` | `{asset_id, source(user_upload/derived), type(flat_lay/hanger/worn), width, height, hash, role(standard_reference/color_reference)}`——一张或多张标准参考图 |
| `color_profile` | 单色：`{mode:"solid", lab:{L,a,b}, sampleRegionRef, algorithmVersion, confidence}`；多色/格纹：`{mode:"cluster", clusters:[{lab, weight, regionRef}], algorithmVersion, confidence}` |
| `fit_type` | `fitted/regular/loose/oversized/unknown` + `autoDetected` + `humanCorrected` + `correctedBy/correctedAt` |
| `garment_attributes` | 品类、领型、袖型、衣长、下摆、材质观感、图案类型、Logo、口袋、纽扣等关键细节（结构化键值 + 置信度） |
| `region_assets[]` | 可选：服装区域/关键细节标注或 Mask 版本 `{asset_id, version, kind(garment_region/detail_callout), hash}`。⚠️ **不得假定所有档案都具有分割资产**（总纲 §5.2） |
| `approved_baseline_asset_id` | 用户确认的颜色/款式基准资产。🔴 **禁止用生成结果静默覆盖基准**（红线：用户资产） |
| `notes` | 自由文本（用户备注） |

## 2. 存储落点（复用任务存储同款纪律）

- `data/ai-tryon/garments/<garment_profile_id>/profile-v<n>.json`（版本文件只增不改）；
- 资产文件同目录 `assets/<asset_id>.<ext>`（参照 history-images 落盘模式，EVIDENCE S11）；
- 索引 `data/ai-tryon/garments/index.json`：单写入器串行化 + 原子替换（同 tryon-task.md §3）；
- 🔴 **用户资产红线**：档案与基准图属用户资产——任何清理/迁移/封装都不得删除（封装四红线④ + V118 提示词库同款纪律）；删除只能由用户显式触发。

## 3. 与任务的关系（闭环）

- TryOnTask 存 `garment_profile_id + garment_profile_version`（快照引用，tryon-task.md §4 冻结规则）；
- 任务执行时读取**该版本**的档案文件，不读"最新版"——档案编辑不影响在途任务；
- Prompt 编译层的「服装档案层」内容 = 该快照的结构化字段（prompt-template-v1.md §1）。

## 4. 第一版（P2 MVP）边界

- 必须：CRUD（创建/改版/查询）、标准参考图、color_profile（solid 优先，cluster 可选）、fit_type 人工纠正、版本快照、approved_baseline；
- 不做：自动分割 region_assets（依赖 P3 掩膜结论）、跨设备同步、Web UI 以外的入口；
- UI 最小入口：换装 composer 的「关联服装档案」选择 + 档案管理模态（P2 范围内定）。
