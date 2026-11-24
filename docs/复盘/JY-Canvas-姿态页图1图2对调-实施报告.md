# JY-Canvas 姿态页图1/图2 对调实施报告

> 日期：2026-11-24　性质：功能改动（用户要求·为图1权重）　源码 HEAD `568eaff`（代码）/ `39d9b09`（执行单归档）。执行单：`docs/执行单/已完成/2026-11/V5.0-执行单-V5.0-014-姿态页图1图2对调.md`。

## 一、需求
批量姿态页图1/图2 整体对调：**图1 = 固定母版成片**（小模块/最多2张/带锁定按钮）、**图2 = 批量姿态图**（大模块/多图）。目的是让母版处于图1位置、获得更高权重（模型优先锁定人物身份/服装）。
用户明确：全部内容（标题、提示文字、图片、大小、锁定按钮）跟着序号一起对调，**底层构造/数据槽位语义不变**。

## 二、根因/约束
- 原状态：图1=model 槽（4列大区/多图/姿态）、图2=clothing 槽（小区/2张/母版+固定按钮），提示词与服务端文案均按"图1姿态/图2母版"写死。
- 关键约束：`fixedClothingId`（固定母版）绑定 clothing 槽；模块大小绑定槽位参数；服务端发送顺序 model 先发（占图1权重）。
- 因用户要求"底层不变"，采用**显示层 + 发送层对调**，不动数据槽位语义（clothing 槽仍存母版、model 槽仍存姿态）⇒ **老数据无需迁移**，其余页面零影响。

## 三、改动清单（6 处 + 1 门禁）
1. `src/features/outfit/outfit-top.js`：`POSE_REMIX_UPLOAD_LABELS` model/clothing 内容对调；`POSE_REMIX_DEFAULT_PROMPT` 全文"图1↔图2"语义互换（图1母版锁定身份、图2姿态参考）。
2. `src/features/outfit/panels/OutfitComposer.jsx`：姿态页用 z1/z2 别名对调两个 UploadZone 的数据绑定；图1绑定 clothing 槽（小区 maxCount2 + 固定母版按钮）、图2绑定 model 槽（大区多图）；其余页面别名退化为原值。
3. `src/outfit-workflow.css`：`.assetGrid.poseSwapGrid` 列宽 `1fr 2fr 1fr`（图1小区、图2大区）。
4. `src/features/outfit/handlers/outfit-batch-execution.js`：姿态页交换 `taskModelFile`/`taskClothingFile`，使母版先发占图1权重；相关文案同步（图1母版/图2姿态）。
5. `server/routes/outfit.routes.js`：姿态错误文案对调。
6. `server/outfit-quality-ai.js`：pose-remix 质检正则与注释图1/图2 对调。
7. `scripts/verify/outfit-intent-check.mjs`：加 4 条源码锚点断言（提示词语义、图1槽位/固定按钮、grid 列宽、发送权重），门禁 79→83 项全绿。

## 四、验证
- 换装门禁 `outfit-intent-check` **83/83**（含 4 条对调断言）。
- size-ratchet 归零（未刷基线，靠压缩注释/别名/spread 维持）；语法、eslint（唯一 warning 是既有 `deferOutfitAutoSave`，故意保留）；vite build EXIT=0。
- 全量 `run-all --fast` 88 项中 87 通过，唯一失败 `detail-v2-planning-chain` = 种子冻结哈希（发版配套状态，非回归）。
- **浏览器实测（遍历 7 页签）**：姿态页 = 图1固定母版@268小区(带锁定)、图2批量姿态@536大区；换装页 = 图1批量原图@536、图2改色服装@268（原样）；精修/换脸/设计稿等页均保持原样。

## 五、并发排查（用户要求）
排查"其他命名是否也有改名退化 BUG"：上次修复的守卫 `SINGLETON_WORKFLOW_MODES.has(oldMode)` 覆盖全部 8 个 singleton 家族（pose-remix/local-detail/background-change/random-background/recolor/white-refine/face-swap/design-draft）；outpaint 非 singleton（设计上允许多个）、不适用。**结论：无遗漏**。

## 六、注意
- 本改动在 `568eaff`，晚于已封装的 v5.0.2（HEAD `3dece2d`）⇒ **当前 exe 包不含此改动**，如需进包要再发一版。
- 断电中断了 `stash → commit → pop` 流程，已安全收尾：文档整理提交 `39d9b09`、seed 改动（用户 15:30 同步，seedId `2f9ef862`）已恢复、临时 stash 已丢弃、历史 RF-047 stash 完好保留。
