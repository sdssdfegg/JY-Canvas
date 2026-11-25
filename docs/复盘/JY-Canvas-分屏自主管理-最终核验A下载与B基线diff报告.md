# JY-Canvas · 分屏自主管理 · 最终核验 A（真实下载）与 B（019 基线 diff）

> 日期：2026-11-23　基线：HEAD `b3a8a64`（本轮无代码变更、无新 commit）。顾问确认 b3a8a64 核心修复可接受，仅需完成 A/B 两项最终核验。本轮未调用真实模型、未产生费用、未修改任何基线或门禁判据、未触碰用户历史数据。

---

## A. 隔离环境真实拼图文件下载验证

### 环境隔离措施
- 浏览器：tabbit-cli 独立 automation task context（独立 localStorage），未用用户日常浏览器。
- 下载目标：`tmp/stitch-download-test/`（项目内临时目录），**非用户个人下载目录**。
- 服务端 `saveDirectory` 被临时指向该目录以走真实下载链路；测试前备份 `data/app-settings.json`，测试后**已恢复**为 `D:\源码开发\静音AI画板v4.0源码\data\asset-library`（`curl /api/save-directory` 复核通过）。
- 未注入用户历史分组；用 canvas 生成 4 张不同颜色测试图（红/绿/蓝/黄），全部在隔离 context 内。

### 真实链路
调用 `src/api/save.js` 的 `saveImageRequest(tempDir, item)`（与 `downloadStitchPreview` :345-360 的落盘调用逐字一致），配合 `stitchDetailGroupBlob` 真实 canvas 合成 → base64 → 服务端 `/api/save-image` 写盘。两次下载：
1. **初始顺序** `[屏1红, 屏2绿, 屏3蓝, 屏4黄]`
2. **拖拽首→末 + 删除屏3(蓝)** 后 `[屏2绿, 屏4黄, 屏1红]`

### 验证结果
| 项 | 实测 |
|---|---|
| 文件实际写入 | `tmp/stitch-download-test/23-1.jpg`（861 B）、`23-2.jpg`（825 B），服务端返回 `ok:true`、`directory`=临时目录 |
| 文件可读取 | JPEG SOI/EOI 头完整；浏览器 `Image.decode()` + canvas 成功解码，尺寸 30×160 / 30×120 |
| 图片排列正确（像素分带采样） | 初始 `[红, 绿, 蓝, 黄]`；拖拽+删除后 `[绿, 黄, 红]` —— 与 `detailResultItemsForGroup` 顺序 `[IMG1,IMG2,IMG3,IMG4]` → `[IMG2,IMG4,IMG1]` 完全一致 ✅ |
| 删除屏不残留 | 第二张图 `blueResidual:false`（被删的蓝色屏3未出现）；高度 160→120 少一带 ✅ |
| 清理 | 临时目录与两份 jpg 已删除，`app-settings.json` 已恢复，探针脚本已删除 ✅ |
| 用户历史数据 | `data/history.json`（601,529 B，时间戳 11-21 16:55 未变）、`data/detail-studio/projects/` 未触碰 ✅ |

## B. frontend-duplication-check 基线文件 Git diff

### 重要澄清（与任务描述的差异）
顾问要求"提供 `d4855da` 中该基线文件的完整 diff"。**经核验 `d4855da` 并未修改该文件**——其 9 个改动文件中只有 `size-ratchet-baseline.json`（另一份基线）。该 019 基线的实际变更发生在 **`b3a8a64`**（即当前 HEAD）。如实报告，不臆造。

### 完整 Git diff（`git show b3a8a64 -- scripts/verify/frontend-duplication-baseline.json`）
```diff
diff --git a/scripts/verify/frontend-duplication-baseline.json b/scripts/verify/frontend-duplication-baseline.json
index 588b3b5..2764b98 100644
--- a/scripts/verify/frontend-duplication-baseline.json
+++ b/scripts/verify/frontend-duplication-baseline.json
@@ -1,6 +1,6 @@
 {
   "note": "前端跨文件同名顶层函数基线：...(原文未改)...",
-  "generatedAt": "2026-11-14",
+  "generatedAt": "2026-11-23",
   "scanScope": {
     "root": "src/",
     "extensions": [
@@ -14,7 +14,7 @@
       "tmp",
       ".codex-artifacts"
     ],
-    "fileCount": 181,
+    "fileCount": 183,
     "files": [
       "src/api/ai-canvas-agent.js",
       "src/api/assets.js",
@@ -76,6 +76,8 @@
       "src/features/detail/DetailView.jsx",
       "src/features/detail/detail-group.js",
       "src/features/detail/detail-image-form.js",
+      "src/features/detail/detail-manual-group.js",
+      "src/features/detail/detail-screen-id.js",
       "src/features/detail/detail-sections.js",
       "src/features/detail/detail-state.js",
       "src/features/image-editor/image-editor-helpers.js",
```

### 是否严格限于三项
**是**。逐行核对：
1. `generatedAt`：`2026-11-14` → `2026-11-23`（时间记录）
2. `scanScope.fileCount`：`181` → `183`（扫描文件数）
3. `scanScope.files`：新增 `detail-manual-group.js`、`detail-screen-id.js` 两个文件名（因 b3a8a64 新增的 2 个模块文件）

未改动项：`note`（判据说明原文逐字保留）、`root`/`extensions`/`excludes`（扫描口径不变）、`duplicates`/同名函数记账（未增删）、任何阈值或判据（`def-patterns.mjs` 未动）。**本轮核验未修改任何基线或门禁判据。**

---

## 最终状态
| 项 | 值 |
|---|---|
| 下载文件验证 | 2 张真实 JPEG 落盘、可解码、顺序 `[红绿蓝黄]`→`[绿黄红]`、删除蓝色不残留、临时文件与配置已清理恢复 |
| 019 基线 diff | 见上（实际在 b3a8a64，非 d4855da；严格限于时间/fileCount/两文件名） |
| `git status --short` | 无已跟踪改动；仅既存未跟踪报告文档（`docs/复盘/*.md` 等历次交付物，本轮未新增代码类未跟踪文件） |
| HEAD | `b3a8a649622d7a2aa4915e0d46e161b3a7a5960f` |
| 最终 commit | `b3a8a64`（本轮无新 commit） |
| 工作区状态 | 干净（无已跟踪改动；临时下载文件/配置已恢复清理） |

**停止点**：A/B 两项完成，等待顾问最终关闭确认；不进入详情 AI 架构开发，不调用真实模型。
