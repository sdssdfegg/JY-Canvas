# 一键详情手动分屏 ↔ 基础生图数量双向联动 · 实施报告

> 日期：2026-11-23　基线 `8f405b2` → 实施 commit `7063b38`（HEAD=`7063b38`，工作区无已跟踪改动）。按顾问审核意见补充三项（启用状态一致 / 暂存异步回写保护 / 组类型标记）后实施。未改 Agent/Skill/AI规划提示词/模型渠道接口/AI规划数量规则；未调用真实模型。

## 一、改动文件与原因（9 文件）
| 文件 | 改动 |
|---|---|
| `detail-screen-id.js` | 加组类型 `isManualDetailGroup`/`DETAIL_GROUP_KIND`、有效数 `effectiveDetailPrompts`、稳定 ID 定位 `findDetailScreenLocation`（含暂存）、`updateDetailScreenById`、`applyCountToGroup`（缩减移入暂存/扩容优先恢复）、`findEmptyPromptScreens`；`pruneDeletedScreen` 同时清暂存区 |
| `detail-count-sync.js`（新） | `useDetailCountSync` hook：`applyCountSync`/`syncFromGroup`/`toggleAndSync`/`guardBatchEmpty` + 切组 count 同步 effect；封装同步 ref 与 setState，杜绝异步竞争 |
| `detail-group.js` | group 白名单加 `kind`/`parkedPrompts`；`updateDetailPrompt` 改为活动+暂存按稳定 ID 双写；删除被取代的 add/delete/toggle 裸函数 |
| `detail-manual-group.js` | 手动组工厂加 `kind:"manual"`、`parkedPrompts:[]` |
| `detail-state.js` | 接入 hook；count 入口/新增屏/删除屏/禁用/切组全部走统一入口；批量前空提示词统一阻止 |
| `DetailView.jsx` | 禁用 checkbox 走 `toggleDetailPromptAndSync`；生成数量标签显示"有效N屏/预计N张" |
| `scripts/verify/detail-count-sync-check.mjs`（新） | 29 项断言（20 场景 + 接线锚点） |
| `run-all.mjs` | 全量+fast 注册新门禁（88 脚本） |
| `frontend-duplication-baseline.json` | 新增 1 文件触发扫描范围漂移，仅刷新 fileCount 183→184 + 文件名（未改判据/阈值/排除范围） |

## 二、三项补充要求的落实
### 1. 数量与启用状态一致
- 有效数口径 = `enabled!==false && shouldGenerate!==false && !isEmptyScreen`，与批量 `enabledPrompts` 一致（不含 `status==="running"` 瞬时态）。
- 禁用一屏 → hook `toggleAndSync` 翻转 enabled 后以新有效数回写 count（浏览器实测：2屏禁1 → count=1、标签"有效1屏/预计1张"）。
- 禁用屏保留在 `prompts`（提示词/结果不丢），重新启用恢复有效数。
- 界面生成数量标签实时显示实际有效数与预计生图数，不再出现"显示5实际3无提示"。

### 2. parkedPrompts 异步回写保护
- 数量缩减：`applyCountToGroup` 把尾部有效屏**原样移入** `parkedPrompts`（text/results/稳定 screen ID/状态全保留），**不 retire ID**。
- 扩容：优先按原稳定 ID 放回（浏览器实测 P3 的 text 完整恢复），不足才补空白新屏。
- `detailScreenExists` 改为基于 `findDetailScreenLocation`（活动+暂存）；`updateDetailPrompt` 双写活动与暂存 → 暂存屏正在生图时接口返回仍写回原屏（S16 断言通过）。
- 只有用户点 X 走 `pruneDeletedScreen`：retire ID、从活动与暂存都移除（S18/S19 断言）。

### 3. 分组类型与数量作用范围
- 组级 `kind:"manual" | "ai"` 明确标记（进持久化白名单），历史组无 kind 保守视为 AI——**不用 prompt.source 推断整组**（S12/S20 断言）。
- 手动组：基础数量/增删/禁用双向联动；AI 组：只更新设置值供下次规划，不动服务端规划产物。
- 切回手动组：hook effect 按该组自身有效数恢复 count；暂存状态随组存储、组间不污染。
- 点"新增分屏"时若活动组非手动组（含 AI 组）→ 自动新建手动组（浏览器实测修复点）。

## 三、真实验收结果
### 定向门禁 `detail-count-sync-check`：29/29
- 场景 1-14：手动5/改3/新增2/改8/改4/暂存恢复/交替/拖拽/空白阻止/5任务n=1/单屏/切组隔离/历史兼容/连续快改。
- 场景 15-20：禁用联动、暂存异步写回、暂存恢复保内容、暂存不 retire、X 永久删除、AI组含manual屏不误判。
- 接线锚点 9 项：统一入口、count/新增/禁用接线、批量空检查封装、组类型白名单、手动工厂、界面显示。
- 过程中抓到并修复真实 bug：扩容补空白时 `nextDetailScreenId` 传参结构错误（裸数组 vs `{prompts}`，会生成重复 ID）；活动组为 AI 组时点新增不建手动组。

### 真实浏览器隔离 context（不碰用户历史）
- 点4次新增→4屏、count=4、标签"有效4屏/预计4张"。
- 基础数量改2→2屏/count=2；禁用1屏→count=1/标签"有效1屏/预计1张"。
- 缩减→超出屏进 parked 且 text 完整；扩容→优先恢复原屏内容、ID 单调不复用。

### 全量门禁
| 项 | 结果 |
|---|---|
| run-all --fast | **88/88** |
| detail-count-sync-check | 29/29 |
| detail-v2-control-chain | 全绿（AE11 touched 语义保留） |
| size-ratchet | ok=true、regressions=0（**未改基线**） |
| eslint / check-syntax | 0 errors/0 新增 warning、ok=true |
| vite build | EXIT=0 |

## 四、Git
- 实施 commit：`7063b38`　HEAD：`7063b38`　工作区：无已跟踪改动（27 个既存未跟踪报告原样保留）。

**停止点**：本任务完成，等待顾问验收；不自动开启下一阶段。
