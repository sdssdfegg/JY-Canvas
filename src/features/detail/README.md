# 一键详情/主图（detail-main）

V60 从 `src/main.jsx` 迁出的详情主图视图切片，对应规划文档 P3-5。

## 入口
- `detail-state.js` — `useDetailState(props)`：详情主图私有状态 + 编排收口（零 JSX），返回 `detailApi` 对象。
- `DetailView.jsx` — 纯 JSX 视图，状态全部来自 `detailApi`。
- `detail-group.js` — 分组 / 拼图 / 预设的底层实现（V60 之前已收口，本次未改动）。
- 渲染位置：`src/main.jsx` 内 `activeView === "detail-main"` 三元分支，由 `<DetailView ... />` 替代。

## 状态归属
| 状态 / 派生 | 归属 | 说明 |
|---|---|---|
| `detailSettings` / `detailPresets` / `detailGroups` / `detailStatus` / `activeDetailGroupId` / `detailInfoSelection` | hook | 详情私有 |
| `detailProductFiles` / `detailReferenceFiles` | hook | 上传列表（`addFilesByRole` 链路，App 侧已无其它引用） |
| `detailColumns` / `detailForwardSort` / `detailDragScreen` | hook | 视图 / 拖拽私有 |
| `stitchPreview` / `stitchZoom` / `stitchPan` / `stitchContextMenu` / `isDetailPresetOpen` | hook | 拼图预览 + 预设弹窗私有 |
| `detailProductInputRef` / `detailReferenceInputRef` / `stitchDragRef` | hook | 上传 input ref / 拼图拖拽 ref |
| `detailModel` / `detailRatios` / `detailSizes` | hook 派生 | 来自注入的 `models` + `detailSettings` |
| `detailRunningCount` / `detailStatusText` | hook 派生 | 工具条徽标文案（App 侧也读） |
| `detailProductPreviews` / `detailReferencePreviews` | hook 派生 | `URL.createObjectURL`，卸载时回收 |
| `activeDetailGroup` / `visibleDetailPrompts` / `activeDetailResults` / `detailInfoItem` | hook 派生 | 分组 / 提示词 / 结果派生 |
| `stitchGroup` / `stitchContextGroup` / `stitchItems` | hook 派生 | 拼图预览数据源 |
| `updateDetailSetting` / `addDetailFiles` / `removeDetailFile` | hook | 参数写入 + 上传（逐字搬自 main.jsx） |
| `createDetailPromptPlan` / `generateDetailPrompt` / `generateDetailGroup` | hook | 生成编排三件套 |
| `downloadDetailGroup` / `downloadStitchPreview` | hook | 下载编排 |
| `applyDetailPromptToQuickgen` | hook | 推送回快捷生成 |
| `findDetailPromptByResult` | hook | 供 App 的 `rerunResult` 反查（重刷共用链路） |
| `selectDetailResult` / `beginDetailScreenDrag` / `endDetailScreenDrag` / `dropDetailScreen` / `openStitchPreview` / `closeStitchPreview` / `handleStitchWheel` / `beginStitchDrag` / `moveStitchDrag` / `endStitchDrag` / `updateDetailPrompt` / `toggleDetailPrompt` / `saveDetailPreset` / `loadDetailPreset` / `deleteDetailPreset` | hook | `createDetailGroup` 工厂返回（工厂调用一并迁入 hook） |
| `openStitchContextMenu` | hook | 拼图右键菜单 |
| `results` / `setResults` | App → props | 全局结果池，详情写回此处 |
| `settings` / `apiKey` / `config` / `models` | App → props | 全局配置源（`settings.apiKey` 由 hook 内 `normalizeApiKeyInput` 读取） |
| `selectedIds` / `toggleSelected` / `selectedCount` | App → props | 跨视图勾选池 |
| 共享 handler（openPreview / openContextMenu / rerunResult / downloadItem / copyText / beginResultImageDrag / openReferencePreview / openReferenceContextMenu / beginReferenceImageDrag / openUploadPreview / markDeferredFeature） | App → props | 跨视图共用 |
| `updateSetting` / `setActiveView` | App → props | 仅 `applyDetailPromptToQuickgen` 用（推送后跳回快捷生成） |
| `setContextMenu` / `setReferenceContextMenu` | App → props | `openStitchContextMenu` 需先关另两个菜单 |
| `setError` / `setIsSettingsOpen` / `addEvent` | App → props | 错误提示 / 设置跳转 / 事件流 |
| `blobFromImageItem` / `downloadItem` / `saveDirectory` / `refreshSaveDirectory` / `setSaveDirectory` / `setDirectoryDraft` | App → props | 下载与长图保存链路 |
| `clampCount` / `makeResultId` / `normalizeGenerationErrorMessage` / `DETAIL_ANALYSIS_MODEL` | App → props | 模块级工具常量 |
| `syncHistoryFromServer` | App → props | 生成后延迟回载历史（**晚绑定**，见偏差③） |
| `MAX_DETAIL_FILES` / `workflowOptions` / `copywritingOptions` / `richnessOptions` / `fontStyleOptions` / `modelModeOptions` / `modelPoseOptions` | hook（随迁入） | 详情独占常量，见偏差④ |
| `COUNT_OPTIONS` | App → props | 快捷生成 / 详情 / 参考三处共用，留在 App |
| `navItems`（含 detail-main 项） | App（storage-store.js） | 导航注册不在本目录，本单不动 |

## 偏差（规则③，已核实为架构强制，非自行发挥）
1. **`detailApi` 共享对象**：App 工具条（`activeView === "detail-main"` 的两个子块：拼图预览按钮 / 任务状态徽标）与 `DetailView` 两端共用同一 `detailApi`，避免状态复制（镜像 V57 `promptApi` / V58 `videoApi` / V59 `referenceApi` 模式）。这两个子块留在 App，因其与「指定文件夹」「无限画布」等同处 `topActions` 行、跨视图并列。
2. **结果写全局 `results`**：`generateDetailPrompt` 仍走 `setResults` + `saveHistoryResults` 写全局 `results`。因 `createResultActions` 的 `removeDetailResultIds` / `hydrateDetailGroupsWithHistory` 与详情共用同一批结果 id，改为视图自管会与历史/画廊脱钩。
3. **`createResultActions` 留 App + `syncHistoryFromServer` 晚绑定**：`createResultActions` 依赖 `detailInfoSelection` / `setDetailInfoSelection` / `setDetailGroups`，而这些状态在本 hook 内 ⇒ 工厂调用与 hook 互相引用。处理：工厂调用留 App，经 `detailApi.*` 回传（同偏差①）；反向的 `generateDetailPrompt` 需要 `syncHistoryFromServer`（生成后 2.4s 回载历史），经 props 晚绑定注入 —— hook 调用点必须排在 `createResultActions` 之后，否则 TDZ。
4. **七个详情独占常量随迁入**：`MAX_DETAIL_FILES` 与六个选项常量（`workflowOptions` / `copywritingOptions` / `richnessOptions` / `fontStyleOptions` / `modelModeOptions` / `modelPoseOptions`）搬移前实测每项仅 2 处引用（模块级定义 + 详情块内 1 处），详情独占，故迁入 `detail-state.js` 而非经 props 下发。`COUNT_OPTIONS` 三处共用，留在 App。
5. **`rerunResult` 留 App**：`rerunResult` 被快捷生成的上下文菜单（重刷 1 / 4 张）与画板共用，但需要 `detailGroups` 做结果反查（`findDetailPromptByResult`）⇒ 留 App，经 `detailApi.findDetailPromptByResult` / `detailApi.generateDetailPrompt` 调用。
6. **提示词助手开关留 App**：`isPromptAssistantOpen` 被 `PromptAssistantView`（App 级弹窗）与快捷生成的 `optimizePrompt` 共享，故 `DetailView` 收 `onOpenPromptAssistant` 回调而非状态。

## 常见改法
- 改详情参数项（工作流 / 模型 / 比例 / 分辨率 / 数量 / 文案 / 丰富度 / 字体 / 模特 / 反转屏 / 语种）：改 `detail-state.js` 的 `detailDefaults`（`src/shared/app-defaults.js`）与 `updateDetailSetting`。
- 改分段提示词生成编排：`createDetailPromptPlan`（一次生成整组）与 `generateDetailPrompt`（单屏）/ `generateDetailGroup`（批量）。
- 改拼图长图：`detail-group.js` 的 `createDetailGroup`（缩放 / 拖拽 / 拼接算法）+ 本目录 `downloadStitchPreview`（保存链路）。
- 改预设存取：`detail-group.js` 的 `saveDetailPreset` / `loadDetailPreset` / `deleteDetailPreset`。
- 改 UI 布局：改 `DetailView.jsx`。

## 后端配合
- 分段提示词生成：`src/api/prompts.js`（`createDetailPrompts`）。
- 单屏 / 批量出图：`src/api/images.js`（`generateImages`）。
- 上传压缩与参考图元信息：`src/features/upload/reference-upload.js`（`prepareImageFilesForChannel` / `referenceMetaFromFiles`）。
- 长图保存：`/api/save-image`。
