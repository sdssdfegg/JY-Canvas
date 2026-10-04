// 局部编辑「选框缩放」共享实现（V11-RF-050 块②：角柄缩放 + Alt 中心缩放）。
//
// 来源：两侧同一个组件内函数逐字搬来 ——
//   `resizeCropRectFromCorner` / `resizeCropRectFromCenter` / `CROP_MIN_PIXEL_SIZE`
//   原在 src/main.jsx:1986-2030 与 src/outfit-workflow.jsx:5057-5101。
//
// 🔴 2026-09-25 对齐要求（沿用原注释）：「局部回贴选框必须跟随用户选定的比例」。
//   - 局部回贴 + 框选区域：角柄缩放 / Alt 中心缩放 / 区域大小滑杆全部锁定 activeRatio，
//     宽高始终精确满足比例（整数像素），且不越出原图。
//   - 普通裁剪：保持上一轮确定的自由矩形语义（拖多大就是多大）。
//   —— 这两句话对应本模块的 `ratioLocked` 开关，见下方参数说明。
//
// 🔴 **参数化的那处分叉**（V11-RF-050 裁决：参数化，两侧行为逐字不变）：
//   抽出前两侧的判断条件**不是同一个变量**：
//     · src/main.jsx 用 `ratioLocked` = `isLocalMode && !isMaskMode`
//       ⇒ main 存在「普通裁剪模式」（mode !== "local"），此时 ratioLocked=false 走自由缩放分支；
//     · src/outfit-workflow.jsx 用 `!isMaskMode`（outfit 无 isLocalMode，恒为局部回贴）
//       ⇒ 只要不是涂抹蒙版就锁比例。
//   因此本模块把该条件提升为入参 `ratioLocked`：
//     · main 调用点传 `ratioLocked`（原值）；
//     · outfit 调用点传 `!isMaskMode`（原值）。
//   两侧传进去的布尔值与抽出前**逐字相同** ⇒ 行为零变化，这不是"统一行为"，只是把不同取值变成实参。
//
// 锁比例分支的数学本身在 `src/shared/local-edit-geometry.js`（resizeRectFrom*Locked），
// 本模块只保留「锁 / 不锁」的两条外衣。

import { resizeRectFromCenterLocked, resizeRectFromCornerLocked } from "../../shared/local-edit-geometry.js";

export const CROP_MIN_PIXEL_SIZE = 1;

/**
 * 角柄缩放选框。
 * @param {{ x: number, y: number, width: number, height: number }} sourceRect 起始选框（原图坐标）
 * @param {string} handle 手柄方位，形如 "nw" | "ne" | "sw" | "se"
 * @param {number} deltaX 指针位移（原图坐标）
 * @param {number} deltaY 指针位移（原图坐标）
 * @param {{ ratioLocked: boolean, activeRatio: any, imageWidth: number, imageHeight: number }} options
 */
export function resizeCropRectFromCorner(sourceRect, handle, deltaX, deltaY, { ratioLocked, activeRatio, imageWidth, imageHeight, drivingAxis }) {
  if (ratioLocked) {
    return resizeRectFromCornerLocked(
      sourceRect, handle, deltaX, deltaY, activeRatio, imageWidth, imageHeight, drivingAxis
    );
  }
  const directionX = handle.includes("e") ? 1 : -1;
  const directionY = handle.includes("s") ? 1 : -1;
  const anchorX = directionX > 0 ? sourceRect.x : sourceRect.x + sourceRect.width;
  const anchorY = directionY > 0 ? sourceRect.y : sourceRect.y + sourceRect.height;
  const maxWidth = Math.max(1, directionX > 0 ? imageWidth - anchorX : anchorX);
  const maxHeight = Math.max(1, directionY > 0 ? imageHeight - anchorY : anchorY);
  const nextWidth = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxWidth, sourceRect.width + deltaX * directionX));
  const nextHeight = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxHeight, sourceRect.height + deltaY * directionY));
  return {
    x: directionX > 0 ? anchorX : anchorX - nextWidth,
    y: directionY > 0 ? anchorY : anchorY - nextHeight,
    width: nextWidth,
    height: nextHeight
  };
}

/**
 * Alt 中心缩放选框（以选框中心为锚点，位移按 2 倍计入宽高）。
 * 参数含义同 {@link resizeCropRectFromCorner}。
 */
export function resizeCropRectFromCenter(sourceRect, handle, deltaX, deltaY, { ratioLocked, activeRatio, imageWidth, imageHeight, drivingAxis }) {
  if (ratioLocked) {
    return resizeRectFromCenterLocked(
      sourceRect, handle, deltaX, deltaY, activeRatio, imageWidth, imageHeight, drivingAxis
    );
  }
  const directionX = handle.includes("e") ? 1 : -1;
  const directionY = handle.includes("s") ? 1 : -1;
  const centerX = sourceRect.x + sourceRect.width / 2;
  const centerY = sourceRect.y + sourceRect.height / 2;
  const maxWidth = Math.max(1, Math.min(centerX, imageWidth - centerX) * 2);
  const maxHeight = Math.max(1, Math.min(centerY, imageHeight - centerY) * 2);
  const nextWidth = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxWidth, sourceRect.width + deltaX * directionX * 2));
  const nextHeight = Math.max(CROP_MIN_PIXEL_SIZE, Math.min(maxHeight, sourceRect.height + deltaY * directionY * 2));
  return {
    x: centerX - nextWidth / 2,
    y: centerY - nextHeight / 2,
    width: nextWidth,
    height: nextHeight
  };
}
