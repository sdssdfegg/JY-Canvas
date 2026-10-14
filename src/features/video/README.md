# features/video —— 视频面板（V58 抽取）

## 职责
主画板「快捷生成 → 视频」模式的面板：参考图上传、提示词输入、模型/比例/分辨率/时长选择、生成按钮、进度与结果展示、计费徽标。

## 入口
- `VideoView.jsx`：纯 JSX 视图，无状态。由 `src/main.jsx` 挂载：
  ```jsx
  <VideoView
    videoApi={videoApi}
    isComposerDragging={isComposerDragging}
    onComposerDragLeave={onComposerDragLeave}
    onComposerPaste={onComposerPaste}
    downloadVideoResult={downloadVideoResult}
    setIsPromptAssistantOpen={setIsPromptAssistantOpen}
    events={events}
    galleryZoom={galleryZoom}
    copyText={copyText}
  />
  ```
- `video-state.js`：`useVideoState({ settings, config, addEvent, setIsSettingsOpen, setIsComposerDragging, clientSessionId, isReferenceDropData, imageFilesFromReferenceDrop })` 收口全部视频私有状态与编排，返回 `videoApi`。

## 状态归属
| 状态 / 逻辑 | 落位 | 说明 |
| --- | --- | --- |
| `videoSettings` `videoReferenceFile` `videoResults` `videoTasks` `videoStatus` `videoError` | `video-state.js` | 视频面板私有 6 状态 |
| `videoReferenceInputRef` `videoReferencePreview`（含 revoke effect）`runningVideoTasks` `videoCount` | `video-state.js` | 视频私有派生 |
| `videoModels` `activeVideoModel` `videoRatios` `videoResolutions` `videoDurations` `videoPromptHint` `videoPriceText` `videoBillingRequired` `billingGatewayEnabled` `videoChannelEnabled` | `video-state.js` | 由 `config` + `videoSettings` 派生 |
| `updateVideoSetting` `onPickVideoReference` `onVideoComposerDragOver` `onVideoComposerDrop` `generateVideoFromComposer` `clearVideoResults` | `video-state.js` | 来自 `createVideoComposer` 或本文件定义 |
| `isComposerDragging` / `setIsComposerDragging` | **留 App()** | 与图片快捷生成面板共享拖拽态（见下「偏差」） |
| `billingGatewayEnabled`（App 侧校验同用） | **留 App()** | 由 App 透传进 `videoApi` |
| `onComposerDragLeave` `onComposerPaste` `downloadVideoResult` | **留 App()** | 图片/视频面板共享上传与下载链路 |
| `settings` `apiKey` `config` `events` `galleryZoom` `copyText` `setIsPromptAssistantOpen` | **留 App()** | 全局共享，下发 |

## 偏差（V58 单规则③，已停手回报）
1. **`isComposerDragging` 不迁入**：执行单状态表原列「搬」，但实测该态同时被图片快捷生成面板（`main.jsx` 4638）复用——拖拽态在视频 composer 与图片 reference-upload 两侧共同置位/复位，必须留在 App()。本文件仅接收 `setIsComposerDragging` 透传给 `createVideoComposer`，`isComposerDragging` 作为 prop 下发。
2. **视频状态被工具条/徽标外引**：`videoStatus`/`runningVideoTasks`/`videoResults`/`videoCount` 被主画板 quickgen 工具条与状态徽标（`main.jsx` 996–1004、3126、3140、3203–3214）引用，不止在面板内。故 `useVideoState` 返回 `videoApi` 对象，App 工具条与 `VideoView` 两端共用同一对象，未复制状态。
3. **`createVideoComposer` deps 含 `isReferenceDropData` / `imageFilesFromReferenceDrop`**：二者来自 App 的 `createReferenceUpload`（图片/视频共享上传链路），由 App 下发，不迁入本文件。
4. **未降级**：面板是干净的 `activeView==="quickgen" && quickMode==="video"` 三元独立分支，JSX 整体迁出（非 R4 降级档）。

## 常见改法
- 调视频模型选项：改 `config.videoModels`（来自服务端），本文件只消费。
- 改轮询频率/可见性暂停：在 `video-composer.js`（V53 收口），本文件不碰。
- 改生成提交逻辑：`generateVideoFromComposer`（本文件）。

## 后端配合
生图主链路 `server/routes/videos.routes.js` + `server/core/video-route-session.js`；模型/计费策略在 `server/video-config.js` / `config.billingGatewayPolicy` / `config.videoPolicy`。
