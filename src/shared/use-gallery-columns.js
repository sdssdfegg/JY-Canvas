// src/shared/use-gallery-columns.js
// V138：可用宽 → 列数公式的 React 封装。V141 起列数改由纯 CSS auto-fit 计算，本 hook 已无调用点。
// 纪律：本文件只依赖 React 与零依赖叶子 gallery-layout.js，不碰业务状态。
import { useEffect } from "react";
import { GALLERY_GAP_PX, computeGalleryColumns } from "./gallery-layout.js";

/**
 * 观测容器内容宽（clientWidth - padding）写入 `--gallery-columns`。
 *
 * @internal 保留原因 V141：当前无 import，因列数已改由纯 CSS auto-fit 计算。保留是因
 * `computeGalleryColumns()` 是 V138 沉淀的唯一列数公式（按列预分配时可复用），且删本文件
 * 会连带判死 gallery-layout.js 的 GALLERY_GAP_PX / computeGalleryColumns（超本单范围）。
 * 确认不再恢复 JS 列数时，应与那两个导出一起删除。
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
