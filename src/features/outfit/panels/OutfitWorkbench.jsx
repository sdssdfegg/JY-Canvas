// src/features/outfit/panels/OutfitWorkbench.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出 outfit 主工作台（原内联巨石）。
// 内容（按执行单 §2.2 三段顺序搬，本文件逐步增长）：
//   ① topbar（结果筛选 tab + 工具栏）
//   ② outfitScrollArea（ResultQueue + assetGrid 上传区 + originalLibraryPanel 原图库）
//   ③ composerPanel（换装/精修设置 + 提示词/补充 + 底部生成控制条）—— 后续 commit 追加
// 模式：原闭包捕获的 state / handler / 派生值全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   模块级工具/常量（MAX_UPLOAD_IMAGES / GARMENT_PART_OPTIONS / sameGarmentParts /
//   normalizeGarmentComposition / garmentCompositionLabel / fileSize）与子组件（ResultQueue / UploadZone /
//   ImageFactsPanel）直接 import；GARMENT_PART_PRESET_OPTIONS 为父模块级常量，以同名 prop 传入。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V68 §3.2 负向对照 + v68-free-idents 兜底。
import {
  Crop,
  Download,
  FolderOpen,
  Images,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Video
} from "lucide-react";
import { fileSize } from "../../../lib/format/index.js";
import { ResultQueue } from "./ResultQueue.jsx";
import { ImageFactsPanel } from "./ImageFactsPanel.jsx";
import { Button } from "../../../shared/ui/Button";

export default function OutfitWorkbench({
  resultFilter,
  setResultFilter,
  tasks,
  imageCount,
  switchView,
  addEvent,
  activeOutfitPageId,
  renameOutfitPage,
  activeOutfitPage,
  refreshHistory,
  openDirectoryModal,
  openSaveDirectory,
  topbarStatus,
  topbarStatusText,
  downloadSelected,
  selectedCompletedCount,
  downloadAll,
  deleteSelected,
  selectedCount,
  clearAll,
  clearNonResultImageCache,
  changeGalleryZoom,
  galleryZoom,
  galleryZoomPercent,
  visibleTasks,
  selectedTaskIds,
  downloadFeedbackIds,
  brokenTaskImages,
  resultReplaceTargetId,
  galleryCardMin,
  taskGridRef,
  settings,
  isWhiteRefineWorkflow,
  isPoseRemixWorkflow,
  isRandomBackgroundWorkflow,
  isOutpaintWorkflow,
  isRecolorWorkflow,
  isFaceSwapWorkflow,
  renderSplitHalvesStrip,
  toggleTaskSelected,
  retryTask,
  downloadTask,
  rerunResultTask,
  deleteResultTask,
  setPreview,
  setImageLightbox,
  handleResultReplaceDragOver,
  handleResultReplaceDrop,
  setResultReplaceTargetId,
  markTaskImageBroken,
  beginTaskImageDrag,
  clearResultDragState,
  openReferenceContextMenu,
  beginReferenceImageDrag,
  copyText,
  originalLibrary,
  removeOriginalImage,
}) {
  return (
    <>
      <header className="topbar">
        <div className="resultTabs">
          <Button size="sm" active={resultFilter === "all"} type="button" onClick={() => setResultFilter("all")}>
            全部({tasks.length})
          </Button>
          <Button size="sm" active={resultFilter === "image"} type="button" onClick={() => setResultFilter("image")}>
            <Images size={14} />
            <span>图片({imageCount})</span>
          </Button>
          <Button size="sm" type="button" onClick={() => { setResultFilter("all"); switchView("quick"); addEvent("视频", "已打开快捷视频生成"); }}>
            <Video size={14} />
            <span>视频(0)</span>
          </Button>
          <button
            className="outfitPageNameChip"
            type="button"
            onDoubleClick={() => renameOutfitPage(activeOutfitPageId)}
            title="双击修改页面名称"
          >
            <Pencil size={13} />
            <span>{activeOutfitPage.name}</span>
          </button>
        </div>
        <div className="topActions">
          <Button size="sm" type="button" onClick={() => void refreshHistory()}>
            <RefreshCw size={15} />
            <span>刷新</span>
          </Button>
          <Button size="sm" type="button" onClick={openDirectoryModal}>
            <FolderOpen size={15} />
            <span>指定文件夹</span>
          </Button>
          <Button size="sm" type="button" onClick={() => void openSaveDirectory()}>
            <FolderOpen size={15} />
            <span>打开保存目录</span>
          </Button>
          <span className={`taskBadge task-${topbarStatus}`}>{topbarStatusText}</span>
          <Button size="sm" type="button" onClick={downloadSelected} disabled={selectedCompletedCount === 0}>
            <Download size={15} />
            <span>下载选中</span>
          </Button>
          <Button size="sm" type="button" onClick={downloadAll} disabled={imageCount === 0}>
            <Download size={15} />
            <span>下载全部</span>
          </Button>
          <Button size="sm" tone="danger" type="button" onClick={deleteSelected} disabled={selectedCount === 0}>
            <Trash2 size={15} />
            <span>删除选中</span>
          </Button>
          <Button size="sm" tone="danger" type="button" onClick={clearAll}>
            <Trash2 size={15} />
            <span>清空全部</span>
          </Button>
          <Button size="sm" type="button" onClick={() => void clearNonResultImageCache()}>
            <RefreshCw size={15} />
            <span>清缓存</span>
          </Button>
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
        </div>
      </header>

      <div className="outfitScrollArea">
        <ResultQueue
          visibleTasks={visibleTasks}
          selectedTaskIds={selectedTaskIds}
          downloadFeedbackIds={downloadFeedbackIds}
          brokenTaskImages={brokenTaskImages}
          resultReplaceTargetId={resultReplaceTargetId}
          galleryCardMin={galleryCardMin}
          taskGridRef={taskGridRef}
          settings={settings}
          activeOutfitPage={activeOutfitPage}
          resultFilter={resultFilter}
          isWhiteRefineWorkflow={isWhiteRefineWorkflow}
          isPoseRemixWorkflow={isPoseRemixWorkflow}
          isRandomBackgroundWorkflow={isRandomBackgroundWorkflow}
          isOutpaintWorkflow={isOutpaintWorkflow}
          isRecolorWorkflow={isRecolorWorkflow}
          isFaceSwapWorkflow={isFaceSwapWorkflow}
          renderSplitHalvesStrip={renderSplitHalvesStrip}
          toggleTaskSelected={toggleTaskSelected}
          retryTask={retryTask}
          downloadTask={downloadTask}
          rerunResultTask={rerunResultTask}
          deleteResultTask={deleteResultTask}
          setPreview={setPreview}
          setImageLightbox={setImageLightbox}
          handleResultReplaceDragOver={handleResultReplaceDragOver}
          handleResultReplaceDrop={handleResultReplaceDrop}
          setResultReplaceTargetId={setResultReplaceTargetId}
          markTaskImageBroken={markTaskImageBroken}
          beginTaskImageDrag={beginTaskImageDrag}
          clearResultDragState={clearResultDragState}
          openReferenceContextMenu={openReferenceContextMenu}
          beginReferenceImageDrag={beginReferenceImageDrag}
          copyText={copyText}
        />

        {/* V76（2026-10-16）：上传三区横条已移入 OutfitComposer 的冻结区（.composerPanel 顶部），
            见 OutfitComposer.jsx 的 <section className="assetGrid">。本滚动区只保留结果区 + 原图库。 */}

        {/* 2026-09-26（按用户要求）：换装设置已搬到下方提示词区的左半边，
            这里不再占一整块竖向空间，图1~图3 下面直接就是原图库。 */}

        <section className="originalLibraryPanel">
        <header>
          <div>
            <h3>原图库</h3>
            <span>保留你上传的原始图片，方便后续重新取细节。</span>
          </div>
          <span>{originalLibrary.length} 张</span>
        </header>
        <div className="originalLibraryGrid">
          {originalLibrary.map((item) => (
            <article className="originalLibraryCard" key={item.id}>
              <button type="button" onClick={() => setImageLightbox({ title: item.name, src: item.url })}>
                <img src={item.url} alt="" />
              </button>
              <div>
                <strong title={item.name}>{item.name}</strong>
                <span>{fileSize(item.size)}</span>
              </div>
              <button type="button" onClick={() => removeOriginalImage(item.id)}>
                <Trash2 size={13} />
              </button>
            </article>
          ))}
          {originalLibrary.length === 0 && (
            <div className="emptyOriginal">
              <Crop size={22} />
              <span>上传后会自动保留原图副本</span>
            </div>
          )}
        </div>
        </section>
      </div>
    </>
  );
}
