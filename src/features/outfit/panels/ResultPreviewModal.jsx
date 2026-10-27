// src/features/outfit/panels/ResultPreviewModal.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出 preview 浮层
// （结果预览弹窗：图片缩放拖拽 + 上/下张 + 提示词复制 + 质检面板 + 保存/新窗口打开）。
// 模式：原闭包捕获的 state / handler 全部改为同名 props（调用方每次 render 重建传参，JSX 一行不动）；
//   图标 X / Download / Maximize2、CachedImage、LocalPasteDiagnosticsPanel / CropReturnDiagnosticsPanel
//   及纯函数 formatMs / displayResultImageSource / qualityStatusClass / qualityStatusLabel / formatClock / imageSource 直接 import；
//   setPreview(null) 收敛为 onClose prop。与 imageLightbox 共享的 previewPan / previewZoom / 拖拽 handler 仍由父组件持有并下传。
import { X, Download, Maximize2, Pencil } from "lucide-react";
import { CachedImage } from "../../../shared/ui/cached-image.jsx";
import { LocalPasteDiagnosticsPanel, CropReturnDiagnosticsPanel } from "./OutfitDiagnosticsPanels.jsx";
import { qualityStatusClass, qualityStatusLabel, formatClock } from "../outfit-top.js";
import { imageSource, displayResultImageSource } from "../outfit-task.js";
import { formatWholeSecondMs as formatMs } from "../../../lib/format/index.js";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";

export default function ResultPreviewModal({
  preview,
  onClose,
  resultPreviewTasks,
  zoomPreviewByWheel,
  startPreviewDrag,
  movePreviewDrag,
  endPreviewDrag,
  navigatePreview,
  beginTaskImageDrag,
  clearResultDragState,
  previewPan,
  previewZoom,
  copyText,
  downloadTask,
  openOutfitAnnotationEdit,
  activeOutfitPage
}) {
  return (
<Modal layerClassName="modalLayer" panelClassName="previewModal" onClose={() => onClose()}>
    <header>
      <div>
        <h2>结果预览 #{preview.order}</h2>
        <span>{preview.timingMs ? formatMs(preview.timingMs) : ""}</span>
      </div>
      <Button size="md" iconOnly onClick={() => onClose()}><X size={16} /></Button>
    </header>
    <div
      className="previewImageFrame outfitPreviewImageFrame"
      onWheel={zoomPreviewByWheel}
      onPointerDown={startPreviewDrag}
      onPointerMove={movePreviewDrag}
      onPointerUp={endPreviewDrag}
      onPointerCancel={endPreviewDrag}
    >
      {resultPreviewTasks.length > 1 && (
        <button className="previewArrow previewArrowLeft" type="button" onClick={(event) => {
          event.stopPropagation();
          navigatePreview(-1);
        }} aria-label="上一张">
          ‹
        </button>
      )}
      <CachedImage
        src={displayResultImageSource(preview.result)}
        alt=""
        draggable
        onDragStart={(event) => beginTaskImageDrag(event, preview)}
        onDragEnd={clearResultDragState}
        style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})` }}
        diagnostic={{ requestId: preview.id, endpoint: "/api/generate-outfit", module: "批量生成", workflowMode: preview.workflowMode || activeOutfitPage.workflowMode || "", placement: "outfit-preview" }}
      />
      {resultPreviewTasks.length > 1 && (
        <button className="previewArrow previewArrowRight" type="button" onClick={(event) => {
          event.stopPropagation();
          navigatePreview(1);
        }} aria-label="下一张">
          ›
        </button>
      )}
    </div>
    {preview.prompt && (
      <button className="previewPrompt" type="button" onClick={() => void copyText(preview.prompt, "提示词已复制")}>
        {preview.prompt}
      </button>
    )}
    <LocalPasteDiagnosticsPanel image={preview.result} />
    <CropReturnDiagnosticsPanel image={preview.result} />
    {preview.qualityCheck && (
      <section className={`previewQualityPanel ${qualityStatusClass(preview.qualityCheck)}`}>
        <header>
          <strong>{qualityStatusLabel(preview.qualityCheck)}</strong>
          {preview.qualityCheck.checkedAt && <span>{formatClock(preview.qualityCheck.checkedAt)}</span>}
        </header>
        {preview.qualityCheck.summary && <p>{preview.qualityCheck.summary}</p>}
        <div className="previewQualityFacts">
          {preview.qualityCheck.faceQuality && <span>脸部：{preview.qualityCheck.faceQuality}</span>}
          {preview.qualityCheck.poseMatch && <span>姿态：{preview.qualityCheck.poseMatch}</span>}
          {preview.qualityCheck.outfitMatch && <span>服装：{preview.qualityCheck.outfitMatch}</span>}
        </div>
        {preview.qualityCheck.issues?.length > 0 && (
          <ul>
            {preview.qualityCheck.issues.map((issue, index) => <li key={`${issue}_${index}`}>{issue}</li>)}
          </ul>
        )}
        {preview.qualityCheck.repairPrompt && (
          <button className="previewQualityRepair" type="button" onClick={() => void copyText(preview.qualityCheck.repairPrompt, "返修提示已复制")}>
            {preview.qualityCheck.repairPrompt}
          </button>
        )}
      </section>
    )}
    <footer>
      <Button size="md" tone="primary" onClick={() => void downloadTask(preview)}>
        <Download size={16} />
        <span>{preview.savedFilename || preview.savedPath ? "已保存" : "保存结果"}</span>
      </Button>
      <Button size="md" onClick={() => window.open(imageSource(preview.result), "_blank")}>
        <Maximize2 size={16} />
        <span>新窗口打开</span>
      </Button>
      {/* V138：预览里也能直接进标注编辑（与快捷生成预览一致）。 */}
      <Button size="md" onClick={() => openOutfitAnnotationEdit(preview)}>
        <Pencil size={16} />
        <span>标注编辑</span>
      </Button>
    </footer>
</Modal>
  );
}
