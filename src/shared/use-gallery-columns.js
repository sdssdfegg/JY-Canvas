// src/shared/use-gallery-columns.js
// V138 后续（2026-10-28）：快捷生成画廊与批量结果网格的「每排列数」统一由 JS 计算。
//
// 背景：两边原本一个 flex-wrap、一个 grid auto-fit，列数公式相同但**输入的可
// 用宽不同**（横向 padding 与滚动条预留差约 20px）⇒ 缩窗时一边先换排、另一边
// 差一点才换。改为两侧共用 `computeGalleryColumns()` 并把结果写进
// `--gallery-columns`，CSS 用 `repeat(var(--gallery-columns, auto-fit), ...)`
// 兜底：JS 未跑时退回 auto-fit（与改造前一致，不会闪成单列）。
//
// 纪律：本文件只依赖 React 与零依赖叶子 gallery-layout.js，不碰业务状态。
import { useEffect } from "react";
import { GALLERY_GAP_PX, computeGalleryColumns } from "./gallery-layout.js";

/**
 * 观测容器内容宽，写入 `--gallery-columns`。
 *
 * 内容宽取 `clientWidth - paddingLeft - paddingRight`：clientWidth 已排除
 * 滚动条与边框，正是 CSS grid/flex 实际用于排布的宽度，两侧口径一致。
 *
 * @param {{current: HTMLElement|null}} ref 容器 ref
 * @param {number} cardMin 卡片宽（--asset-card-min）
 * @param {number} [gap] 轨道间距，默认 GALLERY_GAP_PX
 */
export function useGalleryColumns(ref, cardMin, gap = GALLERY_GAP_PX) {
  useEffect(() => {
    const el = ref?.current;
    if (!el) return undefined;

    const measure = () => {
      const computed = typeof window !== "undefined" && window.getComputedStyle
        ? window.getComputedStyle(el)
        : null;
      const padLeft = parseFloat(computed?.paddingLeft || "0") || 0;
      const padRight = parseFloat(computed?.paddingRight || "0") || 0;
      const contentWidth = el.clientWidth - padLeft - padRight;
      const columns = computeGalleryColumns(contentWidth, cardMin, gap);
      if (columns > 0) el.style.setProperty("--gallery-columns", String(columns));
      else el.style.removeProperty("--gallery-columns");
    };

    measure();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (observer) observer.observe(el);
    if (typeof window !== "undefined") window.addEventListener("resize", measure);

    return () => {
      if (observer) observer.disconnect();
      if (typeof window !== "undefined") window.removeEventListener("resize", measure);
    };
  }, [ref, cardMin, gap]);
}
