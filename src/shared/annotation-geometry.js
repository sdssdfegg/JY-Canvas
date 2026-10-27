// 标注式 AI 编辑：纯几何 / 渲染内核（V4.0 新增，零依赖叶子）。
//
// 为什么独立成文件：
//   ① 与 src/shared/local-edit-geometry.js 同一思路（image-space 坐标优先），但职责不同——
//      local-edit 是「像素蒙版 + 选框回贴」，这里是「结构化标注对象 + 归一化坐标」；
//   ② 纯函数、无 React / 无 DOM 强依赖（仅 annotationsToImageBlob 用 document，浏览器侧调用），
//      便于 scripts/verify/annotation-geometry-check.mjs 在 Node 里直接单测坐标换算；
//   ③ 复用方：src/features/local-edit/AnnotationEditModal.jsx（渲染 + 导出）。
//
// 坐标契约（任务 §五 · 图片坐标要求）：
//   标注坐标一律以「归一化 [0,1] 相对原图自然尺寸」存储（nx, ny），
//   不记录浏览器视口像素坐标。渲染时按显示尺寸换算；原图尺寸 / 显示尺寸 / 缩放 /
//   弹窗尺寸变化 / 原图比例 全部由「归一化坐标 × 当前尺寸」推导 ⇒ 任意尺寸下都对齐。
//
// 颜色：标注是独立于原图的结构化对象，颜色仅用于可视化引导，不参与任何蒙版语义。

export const ANNOTATION_COLORS = [
  "#ff4d4f", // 红
  "#faad14", // 橙
  "#52c41a", // 绿
  "#13d2c3", // 青（与主题 accent 同源）
  "#1677ff", // 蓝
  "#ffffff"  // 白
];

export const ANNOTATION_TYPES = ["rect", "circle", "arrow", "brush"];

export function clamp01(value) {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// 浏览器指针坐标 → 归一化坐标。box = 标注层覆盖盒的 getBoundingClientRect()，
// 该盒必须与 <img> 渲染盒完全一致（同尺寸、同位置）⇒ 换算唯一正确。
export function clientPointToNormalized(clientX, clientY, box) {
  const left = Number(box?.left) || 0;
  const top = Number(box?.top) || 0;
  const width = Number(box?.width) || 1;
  const height = Number(box?.height) || 1;
  return {
    nx: clamp01((clientX - left) / width),
    ny: clamp01((clientY - top) / height)
  };
}

// 归一化坐标 → 原图自然像素坐标（整数，供 canvas 绘制 / 导出）。
export function normalizedToNatural(nx, ny, naturalWidth, naturalHeight) {
  const w = Math.max(1, Math.round(naturalWidth));
  const h = Math.max(1, Math.round(naturalHeight));
  return {
    x: Math.round(clamp01(nx) * w),
    y: Math.round(clamp01(ny) * h)
  };
}

// 拖拽得到的对角点 → 归一化矩形（自动排序 + 夹紧），无论拖动方向。
export function normalizeRect(x0, y0, x1, y1) {
  const nx = Math.min(x0, x1);
  const ny = Math.min(y0, y1);
  const nw = Math.abs(x1 - x0);
  const nh = Math.abs(y1 - y0);
  return {
    x: clamp01(nx),
    y: clamp01(ny),
    w: clamp01(nw),
    h: clamp01(nh)
  };
}

// 箭头头部两个端点的归一化坐标（与箭头同单位，供 SVG / canvas 共用）。
// (ax,ay)=起点，(bx,by)=终点，headLen 为头部长度（同坐标单位）。
export function arrowHeadPoints(ax, ay, bx, by, headLen) {
  const angle = Math.atan2(by - ay, bx - ax);
  const spread = Math.PI / 7; // 约 25.7°
  const p1x = bx - headLen * Math.cos(angle - spread);
  const p1y = by - headLen * Math.sin(angle - spread);
  const p2x = bx - headLen * Math.cos(angle + spread);
  const p2y = by - headLen * Math.sin(angle + spread);
  return [
    { x: p1x, y: p1y },
    { x: p2x, y: p2y }
  ];
}

// 箭头头部长度（同坐标单位）：取箭头长度的固定比例，并夹在合理范围，
// 保证短箭头也有可见头部、长箭头不至于夸张。
export function arrowHeadLength(ax, ay, bx, by, minLen = 0.012, maxLen = 0.06, ratio = 0.22) {
  const len = Math.hypot(bx - ax, by - ay);
  return Math.min(maxLen, Math.max(minLen, len * ratio));
}

// 把一条标注对象渲染到 2D 上下文（原图自然像素坐标）。
// ctx 需为已配置好尺寸（= 原图自然尺寸）的 CanvasRenderingContext2D。
// 仅绘制该标注本身；调用方负责先 drawImage 原图。
export function drawAnnotationOnContext(ctx, annotation, naturalWidth, naturalHeight, options = {}) {
  if (!annotation || !ANNOTATION_TYPES.includes(annotation.type)) return;
  const color = annotation.color || ANNOTATION_COLORS[0];
  const lineWidth = options.lineWidth || Math.max(2, Math.round(Math.min(naturalWidth, naturalHeight) * 0.006));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (annotation.type === "rect") {
    const a = normalizedToNatural(annotation.x, annotation.y, naturalWidth, naturalHeight);
    const b = normalizedToNatural(annotation.x + annotation.w, annotation.y + annotation.h, naturalWidth, naturalHeight);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.strokeRect(x, y, w, h);
  } else if (annotation.type === "circle") {
    const cx = clamp01(annotation.x + annotation.w / 2) * naturalWidth;
    const cy = clamp01(annotation.y + annotation.h / 2) * naturalHeight;
    // 允许反向拖拽：rx/ry 取绝对值（负半径不渲染），圆心不受符号影响。
    const rx = Math.abs(annotation.w / 2) * naturalWidth;
    const ry = Math.abs(annotation.h / 2) * naturalHeight;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (annotation.type === "arrow") {
    const a = normalizedToNatural(annotation.x, annotation.y, naturalWidth, naturalHeight);
    const b = normalizedToNatural(annotation.x + annotation.w, annotation.y + annotation.h, naturalWidth, naturalHeight);
    const head = arrowHeadLength(a.x, a.y, b.x, b.y,
      lineWidth * 1.5, lineWidth * 8, 0.22);
    const [h1, h2] = arrowHeadPoints(a.x, a.y, b.x, b.y, head);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(h1.x, h1.y);
    ctx.lineTo(h2.x, h2.y);
    ctx.closePath();
    ctx.fill();
  } else if (annotation.type === "brush") {
    const pts = Array.isArray(annotation.points) ? annotation.points : [];
    if (pts.length === 0) return;
    ctx.beginPath();
    pts.forEach((p, index) => {
      const np = normalizedToNatural(p.nx, p.ny, naturalWidth, naturalHeight);
      if (index === 0) ctx.moveTo(np.x, np.y);
      else ctx.lineTo(np.x, np.y);
    });
    if (pts.length === 1) {
      const np = normalizedToNatural(pts[0].nx, pts[0].ny, naturalWidth, naturalHeight);
      ctx.arc(np.x, np.y, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  ctx.restore();
}

// 把全部标注渲染到 2D 上下文（原图已 drawImage 的前提下）。
export function drawAnnotationsOnContext(ctx, annotations, naturalWidth, naturalHeight, options = {}) {
  if (!Array.isArray(annotations)) return;
  for (const ann of annotations) {
    drawAnnotationOnContext(ctx, ann, naturalWidth, naturalHeight, options);
  }
}

// 浏览器侧：原图 Blob + 标注 → 叠加标注的副本 Blob。
// ⚠️ 不修改原图：返回的是「原图绘制 + 标注绘制」的全新 canvas 编码结果。
// 仅用于「标注参考图」导出 / 下载，原图字节永不被覆盖。
export async function annotationsToImageBlob(originalBlob, annotations, mimeType = "image/png") {
  if (typeof document === "undefined") {
    throw new Error("annotationsToImageBlob 仅在浏览器环境可用");
  }
  const bitmap = await createImageBitmap(originalBlob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 2D 画布上下文");
    ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
    drawAnnotationsOnContext(ctx, annotations, bitmap.width, bitmap.height, {});
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("标注参考图编码失败"));
      }, mimeType);
    });
  } finally {
    bitmap.close?.();
  }
}
