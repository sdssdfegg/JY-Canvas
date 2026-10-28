// src/shared/gallery-layout.js
// V138（2026-10-27）：快捷生成与批量生成的结果卡「基准最小宽度」唯一真相源。
//
// 背景：两边各自写死了一份基准值（快捷 170 / 批量 176），导致同一张结果图在
// 快捷生成和批量生成里显示大小不一致。用户要求以批量生成的尺寸为准统一。
//
// 纪律：这是零依赖叶子模块（只 export 常量），启动链路上的任意模块都可安全 import。
// 以后要调卡片大小只改这一个常量，两边自动一致；不要再在任一侧重算基准值。

// 结果卡基准最小宽度（px）。实际宽度 = 本值 × 画廊缩放（galleryZoom），
// 由调用方（quickgen-state.js / outfit-workflow.jsx）各自乘以自己的 zoom。
export const GALLERY_CARD_MIN_BASE = 176;

// 画廊 / 结果网格的轨道间距（px）。快捷（.galleryStrip）与批量（.taskGrid）必须同值，
// 否则即便卡片宽度一致，列数公式也会因 gap 不同而错档。
export const GALLERY_GAP_PX = 12;

/**
 * 由「容器内容宽」算出每排列数。
 *
 * 背景（V138 遗留问题）：快捷生成用 flex-wrap、批量生成用 grid auto-fit，
 * 两者列数公式其实都是 floor((可用宽 + gap) / (卡宽 + gap))，但因为两边
 * 横向 padding 与滚动条预留不同，可用宽差约 20px ⇒ 缩窗时一边先换排、
 * 另一边差一点才换。改由 JS 用**同一份函数**算列数并写入 --gallery-columns，
 * 两侧共用同一算法，排数口径结构上一致。
 *
 * @param {number} availableWidth 容器内容宽（已扣除 padding 与滚动条占位）
 * @param {number} cardMin 卡片宽（--asset-card-min）
 * @param {number} [gap] 轨道间距，默认 GALLERY_GAP_PX
 * @returns {number} 列数；<=0 表示宽度未知（调用方应保持 CSS 兜底、不写变量）
 */
export function computeGalleryColumns(availableWidth, cardMin, gap = GALLERY_GAP_PX) {
  const width = Number(availableWidth);
  const card = Number(cardMin);
  if (!Number.isFinite(width) || width <= 0) return 0;
  if (!Number.isFinite(card) || card <= 0) return 0;
  const g = Number.isFinite(Number(gap)) ? Math.max(0, Number(gap)) : 0;
  return Math.max(1, Math.floor((width + g) / (card + g)));
}
