// src/features/main-app/panels/main-top-bar.jsx
// P6-5 (V4.0) 2026-10-15：从 src/main.jsx App() return 抽出的顶栏（topBar）展示组件。
// 逐字搬运（仅整体 dedent 4 空格对齐 return 惯例），无状态、无副作用；
// 全部数据与回调由 App() 以同名 props 下发（沿用 DetailView / ReferenceRemixView 模式）。
// 接线完整性由 P6-5 §4 负向对照兜底（scripts/dev/p6-5-propcheck.mjs G 项：props 双向一致）。
import {
  Box,
  FileText,
  Layers,
  Brush,
  Image as ImageIcon,
  Video,
  RefreshCw,
  FolderOpen,
  Download,
  Trash2,
  Plus,
  Pencil,
  Maximize2,
  Minus
} from "lucide-react";

export function MainTopBar({
  activeView,
  quickMode,
  setQuickMode,
  resultFilter,
  setResultFilter,
  imageCount,
  videoApi,
  refreshHistory,
  openDirectoryModal,
  detailApi,
  openSaveDirectory,
  activeCanvasId,
  canvases,
  selectCanvas,
  canvasRunningCount,
  canvasStatusText,
  createCanvas,
  renameCanvas,
  activeCanvas,
  fitCanvasView,
  clearCanvas,
  latestVideoStatusText,
  quickStatus,
  latestStatusText,
  downloadSelected,
  quickSelectedCount,
  downloadAll,
  quickResults,
  deleteSelected,
  clearAll,
  changeGalleryZoom,
  galleryZoom,
  galleryZoomPercent,
  referenceApi,
  downloadVideoResult
}) {
  return (
    <header className="topBar">
      <div className="resultTabs">
        {activeView === "infinite-canvas" ? (
          <div className="viewTitle">
            <Box size={16} />
            <span>无限画布</span>
          </div>
        ) : activeView === "detail-main" ? (
          <div className="viewTitle">
            <FileText size={16} />
            <span>一键详情/主图</span>
          </div>
        ) : activeView === "reference-remix" ? (
          <div className="viewTitle">
            <Layers size={16} />
            <span>参考生图</span>
          </div>
        ) : activeView === "image-editor" ? (
          <div className="viewTitle">
            <Brush size={16} />
            <span>图片编辑</span>
          </div>
        ) : (
          <>
            <button
              className={`tabButton ${quickMode === "image" && resultFilter === "all" ? "active" : ""}`}
              type="button"
              onClick={() => { setQuickMode("image"); setResultFilter("all"); }}
            >
              全部({imageCount + videoApi.videoCount})
            </button>
            <button
              className={`tabButton ${quickMode === "image" && resultFilter === "image" ? "active" : ""}`}
              type="button"
              onClick={() => { setQuickMode("image"); setResultFilter("image"); }}
            >
              <ImageIcon size={14} /> 图片({imageCount})
            </button>
            <button
              className={`tabButton ${quickMode === "video" ? "active" : ""}`}
              type="button"
              onClick={() => { setQuickMode("video"); setResultFilter("video"); }}
            >
              <Video size={14} /> 视频({videoApi.videoCount})
            </button>
          </>
        )}
      </div>

      <div className="topActions">
        {activeView === "quickgen" && (
          <button className="toolbarButton" type="button" onClick={() => void refreshHistory()}>
            <RefreshCw size={15} />
            <span>刷新</span>
          </button>
        )}
        <button className="toolbarButton" type="button" onClick={openDirectoryModal}>
          <FolderOpen size={15} />
          <span>指定文件夹</span>
        </button>
        {activeView === "detail-main" && (
          <button
            className="generateButton pinnedFolderButton"
            type="button"
            onClick={() => detailApi.activeDetailGroup && detailApi.openStitchPreview(detailApi.activeDetailGroup)}
            disabled={!detailApi.activeDetailGroup || detailApi.activeDetailResults.length === 0}
          >
            <Layers size={15} />
            <span>拼图预览</span>
          </button>
        )}
        <button className="toolbarButton pinnedFolderButton" type="button" onClick={() => void openSaveDirectory()}>
          <FolderOpen size={15} />
          <span>打开保存目录</span>
        </button>
        {activeView === "infinite-canvas" && (
          <>
            <select className="toolbarSelect" value={activeCanvasId || ""} onChange={(event) => selectCanvas(event.target.value)}>
              {canvases.map((canvas) => <option key={canvas.id} value={canvas.id}>{canvas.name}</option>)}
            </select>
            <span className={`taskBadge task-${canvasRunningCount > 0 ? "running" : "success"}`}>{canvasStatusText}</span>
            <button className="toolbarButton" type="button" onClick={createCanvas}>
              <Plus size={15} />
              <span>新建画布</span>
            </button>
            <button className="toolbarButton" type="button" onClick={renameCanvas} disabled={!activeCanvas}>
              <Pencil size={15} />
              <span>重命名</span>
            </button>
            <button className="toolbarButton" type="button" onClick={fitCanvasView} disabled={!activeCanvas}>
              <Maximize2 size={15} />
              <span>适配</span>
            </button>
            <button className="dangerButton" type="button" onClick={clearCanvas} disabled={!activeCanvas}>
              <Trash2 size={15} />
              <span>清空</span>
            </button>
          </>
        )}
        {activeView === "detail-main" && (
          <span className={`taskBadge task-${detailApi.detailStatus === "failed" ? "failed" : detailApi.detailRunningCount > 0 || detailApi.detailStatus === "planning" ? "running" : "success"}`}>
            {detailApi.detailStatusText}
          </span>
        )}
        {activeView === "quickgen" && (
          <>
            {quickMode === "video" ? (
              <>
                <span className={`taskBadge task-${videoApi.videoStatus === "failed" ? "failed" : videoApi.runningVideoTasks.length > 0 ? "running" : videoApi.videoStatus}`}>{latestVideoStatusText}</span>
                <button className="toolbarButton" type="button" onClick={() => videoApi.videoResults[0] && downloadVideoResult(videoApi.videoResults[0])} disabled={videoApi.videoResults.length === 0}>
                  <Download size={15} />
                  <span>下载最新</span>
                </button>
                <button className="dangerButton" type="button" onClick={videoApi.clearVideoResults} disabled={videoApi.videoResults.length === 0 && videoApi.runningVideoTasks.length === 0}>
                  <Trash2 size={15} />
                  <span>清空视频</span>
                </button>
              </>
            ) : (
              <>
                <span className={`taskBadge task-${quickStatus}`}>{latestStatusText}</span>
                <button className="toolbarButton" type="button" onClick={downloadSelected} disabled={quickSelectedCount === 0}>
                  <Download size={15} />
                  <span>下载选中</span>
                </button>
                <button className="toolbarButton" type="button" onClick={downloadAll} disabled={quickResults.length === 0}>
                  <Download size={15} />
                  <span>下载全部</span>
                </button>
                <button className="dangerButton" type="button" onClick={deleteSelected} disabled={quickSelectedCount === 0}>
                  <Trash2 size={15} />
                  <span>删除选中</span>
                </button>
                <button className="dangerButton" type="button" onClick={clearAll}>
                  <Trash2 size={15} />
                  <span>清空全部</span>
                </button>
                <div className="zoomControl">
                  <button type="button" onClick={() => changeGalleryZoom(-0.1)} disabled={galleryZoom <= 0.75} aria-label="缩小图库">
                    <Minus size={14} />
                  </button>
                  <span style={{ "--zoom-fill": `${Math.max(0, Math.min(100, ((galleryZoom - 0.75) / 0.7) * 100))}%` }} />
                  <button type="button" onClick={() => changeGalleryZoom(0.1)} disabled={galleryZoom >= 1.45} aria-label="放大图库">
                    <Plus size={14} />
                  </button>
                  <strong>{galleryZoomPercent}%</strong>
                </div>
              </>
            )}
          </>
        )}
        {activeView === "reference-remix" && (
          <>
            <span className={`taskBadge task-${referenceApi.runningReferenceTasks.length > 0 ? "running" : referenceApi.referenceStatus}`}>
              {referenceApi.referenceStatusText}
            </span>
            <button className="toolbarButton" type="button" onClick={clearAll} disabled={referenceApi.referenceResults.length === 0}>
              <Trash2 size={15} />
              <span>清空参考结果</span>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
