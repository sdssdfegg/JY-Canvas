// 收口 main.jsx 与 outfit-workflow.jsx 中「预览平移拖拽 + 画廊缩放 + 拖拽结束复位」三族函数。
//
// 改造前两侧为同名 / L1 一致的克隆：
//   beginPreviewDrag(startPreviewDrag) / movePreviewDrag / endPreviewDrag / changeGalleryZoom
//   + 拖拽结束复位（main 的 endPromptCategoryDrag / outfit 的 endOutfitPageDrag）
// 闭包差异（previewPan、closePreview、各 drag 复位的 setter）通过参数化传入，
// 函数体与改造前逐字节一致，运行时行为 0 变化。
//
// 调用方用解构重命名保留各自原名（如 outfit 的 startPreviewDrag = beginPreviewDrag、
// endOutfitPageDrag = endDrag），无需改动任何调用点。
import { previewDragStart, previewPanFromDrag } from "../../shared/result-image.js";

export function usePreviewDrag({
  previewDragRef,
  previewPan,
  setPreviewPan,
  closePreview,
  setGalleryZoom,
  resetDragged,
  resetDropTarget
}) {
  function beginPreviewDrag(event) {
    const drag = previewDragStart(event, previewPan);
    if (drag) previewDragRef.current = drag;
  }

  function movePreviewDrag(event) {
    const drag = previewDragRef.current;
    if (!drag?.active) return;
    const { pan, moved } = previewPanFromDrag(drag, event);
    if (moved) drag.moved = true;
    setPreviewPan(pan);
  }

  function endPreviewDrag(event) {
    const drag = previewDragRef.current;
    if (!drag?.active) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    previewDragRef.current = null;
    if (!drag.moved) closePreview();
  }

  function changeGalleryZoom(delta) {
    setGalleryZoom((current) => Math.max(0.75, Math.min(1.45, Number((current + delta).toFixed(2)))));
  }

  function endDrag() {
    resetDragged("");
    resetDropTarget(null);
  }

  return { beginPreviewDrag, movePreviewDrag, endPreviewDrag, changeGalleryZoom, endDrag };
}
