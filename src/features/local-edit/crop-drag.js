// 局部编辑「选框拖拽 / 区域大小滑杆」共享实现（V11-RF-050 块①）。
//
// 来源：两侧同一个组件内函数逐字搬来 —— `beginCropDrag` / `moveCropDrag` / `endCropDrag` /
// `changeCropScale`，原在 src/main.jsx:1970-2037 与 src/outfit-workflow.jsx:5042-5108。
//
// 🔴 2026-09-25 对齐要求（沿用原注释）：局部回贴选框锁定所选比例。
//   - 角柄缩放 / Alt 中心缩放 / 区域大小滑杆都锁定 activeRatio，宽高始终精确满足比例；
//   - 涂抹蒙版模式的上下文框不锁比例（由涂抹轨迹决定）；
//   - 普通裁剪（仅 main 侧存在，mode !== "local"）保持自由矩形语义，拖多大就是多大。
//
// 🔴 **参数化的那处分叉**（V11-RF-050 裁决：参数化，两侧行为逐字不变）：
//   抽出前两侧的判断条件不是同一个变量 —— main 用 `ratioLocked`（= isLocalMode && !isMaskMode），
//   outfit 用 `!isMaskMode`（outfit 无 isLocalMode，恒为局部回贴）。
//   本模块把它提升为入参 `ratioLocked`：main 传 `ratioLocked`、outfit 传 `!isMaskMode`，
//   两侧取值与抽出前逐字相同 ⇒ 行为零变化。
//
// 抽出后这些函数不再是组件闭包，调用点需要显式传上下文；两个组件各自就地构造一个
// `cropDragCtx` 对象（含 cropRect / displaySize / imageSize / dragRef / updateCropRect /
// activeRatio / ratioLocked），JSX 里包一层箭头函数传入即可。

import { scaleRectLocked } from "../../shared/local-edit-geometry.js";
import { CROP_MIN_PIXEL_SIZE, resizeCropRectFromCenter, resizeCropRectFromCorner } from "./crop-rect-resize.js";

/**
 * 开始拖拽选框（move）或某个手柄（resize-*）。
 * @param {PointerEvent} event
 * @param {string} mode "move" | "resize-nw" | ...
 */
export function beginCropDrag(event, mode, { cropRect, displaySize, imageSize, dragRef }) {
  if (!cropRect || !displaySize.width || !imageSize.width) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const centerResize = event.altKey && event.button === 0;
  dragRef.current = {
    mode: centerResize && mode === "move" ? "resize-se" : mode,
    centerResize,
    startX: event.clientX,
    startY: event.clientY,
    rect: cropRect
  };
}

/**
 * 拖拽中：把屏幕位移换算回原图坐标，再走 move 或 resize 分支。
 */
export function moveCropDrag(event, { dragRef, cropRect, displaySize, imageSize, updateCropRect, activeRatio, ratioLocked }) {
  const drag = dragRef.current;
  if (!drag || !cropRect || !displaySize.width || !displaySize.height) return;
  event.preventDefault();
  const scaleX = imageSize.width / Math.max(1, displaySize.width);
  const scaleY = imageSize.height / Math.max(1, displaySize.height);
  const deltaX = (event.clientX - drag.startX) * scaleX;
  const deltaY = (event.clientY - drag.startY) * scaleY;
  if (drag.mode === "move") {
    updateCropRect({
      ...drag.rect,
      x: drag.rect.x + deltaX,
      y: drag.rect.y + deltaY
    });
    return;
  }

  const handle = drag.mode.startsWith("resize-") ? drag.mode.slice("resize-".length) : "se";
  updateCropRect((drag.centerResize
    ? resizeCropRectFromCenter
    : resizeCropRectFromCorner)(drag.rect, handle, deltaX, deltaY, {
    ratioLocked,
    activeRatio,
    imageWidth: imageSize.width,
    imageHeight: imageSize.height
  }));
}

/**
 * 结束拖拽：释放指针捕获、清空拖拽态。
 */
export function endCropDrag(event, { dragRef }) {
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  dragRef.current = null;
}

/**
 * 「区域大小」滑杆：锁比例时按目标宽度等比缩放；否则按图宽/图高百分比自由缩放。
 * @param {{ target: { value: any } }} event
 */
export function changeCropScale(event, { cropRect, imageSize, updateCropRect, activeRatio, ratioLocked }) {
  if (!cropRect || !imageSize.width || !imageSize.height) return;
  const percent = Number(event.target.value) / 100;
  // 局部回贴：按目标宽度等比缩放，宽高比例不变（原来分别按图宽/图高取百分比会把选框压变形）。
  if (ratioLocked) {
    updateCropRect(scaleRectLocked(cropRect, imageSize.width * percent, activeRatio, imageSize.width, imageSize.height));
    return;
  }
  // 普通裁剪：保持自由矩形语义，对当前选框按图片宽高的百分比自由缩放。
  const nextWidth = Math.max(CROP_MIN_PIXEL_SIZE, imageSize.width * percent);
  const nextHeight = Math.max(CROP_MIN_PIXEL_SIZE, imageSize.height * percent);
  const centerX = cropRect.x + cropRect.width / 2;
  const centerY = cropRect.y + cropRect.height / 2;
  updateCropRect({
    x: centerX - nextWidth / 2,
    y: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight
  });
}
