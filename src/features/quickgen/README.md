# quickgen（快捷生成 · image 模式）

> ⚠️ **本模块为 V61（P3-6）抽取「降级档」**：本次只收口了 `quickgen-state.js` 纯逻辑
> （23 项私有状态 + 私有 ref + 派生值），JSX（顶部 tab/工具条、image 主内容、五处私有浮层）
> 仍留在 `src/main.jsx`，待下轮抽取 `QuickGenView.jsx` 后整体迁出。详见下方「下轮计划」。

## 职责

承载「快捷生成」image 模式的**私有状态与派生计算**，与 V58 `video/`、V59 `reference-remix/`、
V60 `detail/` 保持同一收口范式：`useQuickGenState()` 持有状态，`main.jsx` 在 `App()` 顶部
解构同名返回值后继续供共享工厂与 JSX 使用。

本模块**不持有**：

- 生成/优化/替换/下载/参考排序等**编排 handler**——仍在 `main.jsx`（`generate` / `optimizePrompt` /
  `openPreview` / `beginReferenceSort` 等），通过解构后的同名状态继续工作。
- `createResultDownload` / `createResultActions` / `createReferenceUpload` / `createQuickResultReplace`
  四个共享/私有工厂——仍在 `main.jsx`，其依赖（如 `quickResults` / `selectedIds` / `setFiles` /
  `setDownloadFeedbackIds`）来自本 hook 的同名返回值。
- 顶部 tab / 工具条（嵌在共享 `topBar` 内）与所有 JSX。

## 入口

- `quickgen-state.js` → `useQuickGenState()`：返回 23 项状态 + setter、3 个私有 ref
  （`quickResultDragIdRef` / `downloadFeedbackTimersRef` / `quickGalleryRef`）及派生值
  （`previewFiles` / `quickResults` / `runningQuickTasks` / `imageCount` / `visibleResults` /
  `quickGalleryItems` / `quickSelectedCount` / `galleryZoomPercent` / `galleryCardMin` /
  `quickStatus` / `latestStatusText` / `contextItem` / `contextIndex` / `quickGalleryTailKey`）。

## 状态归属

| 状态 | 归属 | 备注 |
| --- | --- | --- |
| `files` / `results` / `selectedIds` / `error` / `previewResult` / `contextMenu` 等 | 名义私有，实际被共享视图/工厂复用 | 以「原名返回」方式供 `detail` / `reference-remix` / `无限画布` 与共享工厂使用，不能删除声明 |
| `quickMode` / `status` / `quickTasks` / `galleryZoom` / `isQuickChannelMenuOpen` 等 | 纯私有 | 仅快捷生成 image 模式使用 |
| `previewZoom` / `previewPan` | 结果预览私有 | 预览导航（←/→）由 `main.jsx` 的 `shiftPreview` 驱动 |

## 常见改法

- 改 image 模式默认比例/尺寸/数量：在 `src/main.jsx` 的 `updateSetting` + `convergeSettingsForModel`
  （`config.routing` 的 capabilities 是唯一来源）。
- 改结果画廊去重策略：本文件 `dedupeResults`。
- 改生成链路：仍在 `main.jsx` 的 `generate` / `createResultActions`。

## 后端配合

- 生成接口：`src/api/images.js`（`generateImages`）。
- 渠道/线路价格：`config.routing` + `channelsForModel`（`src/shared/routing.js`）。
- 参考图上传/拖拽/粘贴：`src/features/upload/reference-upload.js`（`createReferenceUpload`）。

## 下轮计划（抽取 QuickGenView.jsx）

1. **先解耦顶部 tab / 工具条与共享 `topBar`**：当前 quickgen 的 tab（全部/图片/视频）与
   工具条块嵌在 `topBar` 内，与 infinite-canvas / detail-main / reference-remix 的标题和工具条同体。
   需要让 `topBar` 不再渲染 quickgen 分支，由 `QuickGenView` 自带头部，否则会重复渲染或丢失
   「指定文件夹 / 打开保存目录 / 拼图预览」等共享入口。
2. 将 image 主内容段（原 `2867–3199`）与五处私有浮层（原 `3332 / 3342 / 3392 / 3416 / 3532`）
   迁入 `QuickGenView.jsx`，`quickApi` 整体下发 + 共享 props（`settings` / `updateSetting` /
   `events` / `isComposerDragging` / `videoApi` / `downloadVideoResult` 等）。
3. 视频子模式（原 `2855–2866`）已由 V58 `VideoView` 承载，本模块只负责 image 子视图；
   `quickMode` 三态切换留在视图内。
