# 参考生图（reference-remix）

V59 从 `src/main.jsx` 迁出的参考生图视图切片，对应规划文档 P3-4。

## 入口
- `reference-state.js` — `useReferenceState(props)`：参考生图私有状态 + 编排收口（零 JSX）。
- `ReferenceRemixView.jsx` — 纯 JSX 视图，状态全部来自 `referenceApi`。
- 渲染位置：`src/main.jsx` 内 `activeView === "reference-remix"` 三元分支，由 `<ReferenceRemixView ... />` 替代。

## 状态归属
| 状态 / 派生 | 归属 | 说明 |
|---|---|---|
| `referenceSettings` / `referenceTasks` / `referenceStatus` / `referenceError` / `isReferencePromptRewriting` | hook | 参考生图私有状态 |
| `referenceProductInputRef` / `referenceStyleInputRef` | hook | 上传 input ref |
| `referenceModel` / `referenceRatios` / `referenceSizes` | hook 派生 | 来自注入的 `models` + `referenceSettings` |
| `referenceResults` | hook 派生 | 来自注入的全局 `results`（按 `source === "reference-remix"` 过滤） |
| `referenceProductPreviews` / `referenceStylePreviews` | hook 派生 | `URL.createObjectURL`，卸载时回收 |
| `runningReferenceTasks` / `referenceGalleryItems` / `referenceStatusText` | hook 派生 | 画廊 / 状态文案 |
| `generateReferenceRemix` / `applySmartReferencePrompt` / `updateReferenceSetting` | hook | 三个编排函数（逐字搬自 main.jsx） |
| `referenceProductFiles` / `referenceStyleFiles` | **App**（留 main.jsx） | `createReferenceUpload` 工厂在 App 内绑定该状态与 setter |
| `addReferenceRewriteFiles` / `removeReferenceRewriteFile` | App 工厂 → 注入 hook | 共享上传链路，仅参考专属两个 handler 下发 |
| `results` / `setResults` / `saveHistoryResults` | App | 全局结果池，参考生图写回此处 |
| 共享 handler（openPreview / openContextMenu / downloadItem / copyText / beginResultImageDrag / openReferencePreview / openReferenceContextMenu / beginReferenceImageDrag / openUploadPreview / markDeferredFeature） | App → props | 跨视图共用 |
| `COUNT_OPTIONS` / `REFERENCE_STRENGTH_OPTIONS` / `referenceControlOptions` | App 模块级常量 → props | 快捷生成 / 详情 / 参考三处共用 |

## 偏差（规则③，已核实为架构强制，非自行发挥）
1. **结果写全局 `results`**：与快捷生成 / 一键详情 / 无限画布共用同一结果池，不迁入独立结果状态。
2. **`referenceApi` 共享对象**：`referenceResults` / `referenceGalleryItems` / `referenceStatusText` 被主画板预览导航（main.jsx 996–1001，`previewSource === "reference-remix"`）与工具条徽标（3085–3095）引用，App 与视图两端共用同一对象，避免状态复制。
3. **`createReferenceUpload` 工厂留 App**：其返回的 `onComposerDragOver` / `onComposerDragLeave` / `isReferenceDropData` / `imageFilesFromReferenceDrop` 等被图片快捷生成面板与 `videoApi` 共用；hook 仅接收参考专属的 `addReferenceRewriteFiles` / `removeReferenceRewriteFile`。
4. **`referenceProductFiles` / `referenceStyleFiles` 留 App**：工厂在 App 内绑定该状态与其 setter，视图读取经 `referenceApi` 回传，写入仅经由工厂下发的两个 handler。

## 常见改法
- 改参考生图参数项（模型 / 比例 / 分辨率 / 数量 / 参考值 / 元素 / 构图 / 场景）：在 `reference-state.js` 的 `referenceDefaults`（`src/shared/app-defaults.js`）与 `updateReferenceSetting` 中调整。
- 改生成编排：改 `generateReferenceRemix` / `applySmartReferencePrompt`。
- 改 UI 布局：改 `ReferenceRemixView.jsx`。

## 后端配合
- 生成入口：`src/api/images.js`（`generateImages`）。
- 智能扩写：`src/api/prompts.js`（`rewriteReferencePrompt`）。
- 上传链路与元信息：`src/features/upload/reference-upload.js`。
