import { clamp } from "./numeric.js";

export const LOCAL_EDIT_RECT_MODE = "rect";
export const LOCAL_EDIT_MASK_MODE = "mask";
export const LOCAL_EDIT_MASK_COLOR = "rgba(255, 255, 255, 1)";
export const LOCAL_EDIT_BRUSH_DEFAULT = 34;
export const LOCAL_EDIT_BRUSH_MIN = 8;
export const LOCAL_EDIT_BRUSH_MAX = 160;
export const LOCAL_EDIT_MASK_OPACITY_DEFAULT = 60;

export function clampLocalEditBrushSize(value) {
  return Math.round(clamp(Number(value) || LOCAL_EDIT_BRUSH_DEFAULT, LOCAL_EDIT_BRUSH_MIN, LOCAL_EDIT_BRUSH_MAX));
}

export function clampLocalEditMaskOpacity(value) {
  return Math.round(clamp(Number(value) || LOCAL_EDIT_MASK_OPACITY_DEFAULT, 10, 100));
}

export function maskCanvasHasPaint(canvas, threshold = 10) {
  return Boolean(maskBoundsFromCanvas(canvas, threshold));
}

export function maskBoundsFromCanvas(canvas, threshold = 10) {
  if (!canvas?.width || !canvas?.height) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= threshold) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1
  };
}

/**
 * 涂抹蒙版的包围盒 → 实际选框。
 *
 * 2026-09-25 对齐 3.0 新源码（frontend/ecommerce/src/shared/image/localPaste.ts）：
 * 3.0 的局部回贴几何是"**选框就是选区**"，贴回时唯一一次写入
 * `context.drawImage(local, rect.x, rect.y, rect.width, rect.height)`，框外像素逐字节不变。
 * 它**没有**运行版那套"包围盒 + 48px padding + 按比例外扩"的 Nl()。
 *
 * 所以这里不再做任何外扩或比例适配：
 *   - 不做 `padding = max(44, 48)` 的外扩（那是"自动扩大蒙版/选框外多送区域"）
 *   - 不按 `ratio` 重新凑比例（那是"因为比例设置自动扩展选区"）
 *   - 只把包围盒夹进图片范围内，宽高保持用户实际涂抹的像素尺寸
 *
 * 兼容性：`ratio` 与 `options` 参数保留在签名里，老调用点不用改；
 * 它们不再影响返回值。
 */
export function expandMaskBoundsToCropRect(bounds, imageWidth, imageHeight, _ratio, _options = {}) {
  if (!bounds || !imageWidth || !imageHeight) return null;
  const sourceWidth = Math.max(1, Math.round(imageWidth));
  const sourceHeight = Math.max(1, Math.round(imageHeight));
  const width = clamp(Math.round(bounds.width || 1), 1, sourceWidth);
  const height = clamp(Math.round(bounds.height || 1), 1, sourceHeight);
  const x = clamp(Math.round(bounds.x || 0), 0, sourceWidth - width);
  const y = clamp(Math.round(bounds.y || 0), 0, sourceHeight - height);
  return { x, y, width, height };
}

export function canvasToPngDataUrl(canvas) {
  return canvas?.toDataURL?.("image/png") || "";
}

export function normalizeMaskCanvas(canvas, threshold = 10) {
  if (!canvas?.width || !canvas?.height) return;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = imageData;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha > threshold) {
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = 255;
    } else {
      data[index] = 0;
      data[index + 1] = 0;
      data[index + 2] = 0;
      data[index + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * data URL → 可绘制位图（ImageBitmap 优先，失败退 HTMLImageElement）。
 *
 * 2026-10-02 · 阶段 B 刀 3 裁决 ④：**统一到这一份**（`src/image-editor.jsx` 的本地私有版已删）。
 * 两版的三处差异与定性（详见 tmp/刀3-imageBitmapFromDataUrl-对照表.txt）：
 *   ① 错误文案：image-editor 版经 `imageBitmapFromFile` 抛出「无法读取图片」，本版原是「无法读取蒙版」
 *      ⇒ **有意统一成「无法读取图片」**（泛化文案在遮罩语境同样成立，且把用户可见变化降到最小；
 *        与 canvas-blob.js 的文案裁决同源：统一到最泛化/最准确的那一句）。
 *      开工前已 grep 全仓取证：`无法读取蒙版` 仅本行 + skill-baselines 快照命中，
 *      `无法读取图片` 仅 image-input.js 命中 —— **scripts/verify/** 与浏览器探针 0 断言依赖** ⇒ 不会打断断言。
 *      （按 §0.9「断言优先于多数派」：若将来某处断言了其中一句，应改回被断言的那句。）
 *   ② 解码参数：本版 `createImageBitmap(blob)` 不带 `{ imageOrientation: "from-image" }`。
 *      入参是 `canvas.toDataURL()` 导出的 PNG 蒙版，无 EXIF 方向信息 ⇒ 实际无差异。
 *   ③ 空值守卫：本版 `if (!dataUrl) return null`。4 个调用点全部已在外层判空 ⇒ 该分支走不到。
 * 返回类型可能是 ImageBitmap 也可能是 HTMLImageElement（只有前者有 close()），调用方一律用 `?.close()`。
 */
export async function imageBitmapFromDataUrl(dataUrl) {
  if (!dataUrl) return null;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  if (window.createImageBitmap) {
    try {
      return await window.createImageBitmap(blob);
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}

export function createLocalEditAlphaMask(maskImage, cropRect, feather = 18) {
  if (!maskImage || !cropRect?.width || !cropRect?.height) return null;
  const rect = {
    x: Math.round(cropRect.x || 0),
    y: Math.round(cropRect.y || 0),
    width: Math.max(1, Math.round(cropRect.width || 1)),
    height: Math.max(1, Math.round(cropRect.height || 1))
  };
  const baseCanvas = document.createElement("canvas");
  baseCanvas.width = rect.width;
  baseCanvas.height = rect.height;
  const baseCtx = baseCanvas.getContext("2d");
  if (!baseCtx) return null;
  baseCtx.clearRect(0, 0, rect.width, rect.height);
  baseCtx.drawImage(maskImage, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  normalizeMaskCanvas(baseCanvas);

  const safeFeather = Math.max(0, Math.round(feather || 0));
  if (safeFeather <= 0) return baseCanvas;

  const softCanvas = document.createElement("canvas");
  softCanvas.width = rect.width;
  softCanvas.height = rect.height;
  const softCtx = softCanvas.getContext("2d");
  if (!softCtx) return baseCanvas;
  if ("filter" in softCtx) {
    softCtx.filter = `blur(${safeFeather}px)`;
  }
  softCtx.drawImage(baseCanvas, 0, 0);
  if ("filter" in softCtx) {
    softCtx.filter = "none";
  }

  const mergedCanvas = document.createElement("canvas");
  mergedCanvas.width = rect.width;
  mergedCanvas.height = rect.height;
  const mergedCtx = mergedCanvas.getContext("2d");
  if (!mergedCtx) return baseCanvas;
  mergedCtx.drawImage(softCanvas, 0, 0);
  mergedCtx.globalCompositeOperation = "source-over";
  mergedCtx.drawImage(baseCanvas, 0, 0);
  mergedCtx.globalCompositeOperation = "source-over";
  return mergedCanvas;
}

// RF-076 · 局部编辑交互层 B3 工厂（阶段 A：12 个无分叉纯函数 + effect#3/#5 体）
// 函数体从 src/main.jsx / src/outfit-workflow.jsx 逐字抽取，仅顶部加 deps 解构。
// 后续阶段 B/C 在此文件内追加参数化函数（同域第二批，不新增 fileCount）。
export function createLocalEditInteraction(deps) {
  const {
    imageRef, setDisplaySize, maskCanvasRef, displaySize, imageSize, brushSize, maskTool,
    paintRef, isMaskMode, working, brushResizeRef, setBrushCursor, setMaskPainted, setCropRect,
    setMaskRevision, activeRatio, setBrushSize
  } = deps;
  function measureImage() {
    const image = imageRef.current;
    if (!image) return;
    setDisplaySize({
      width: image.clientWidth || 0,
      height: image.clientHeight || 0
    });
  }
  function maskPointerPoint(event) {
    const canvas = maskCanvasRef.current;
    if (!canvas || !displaySize.width || !displaySize.height || !imageSize.width || !imageSize.height) return null;
    const box = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(imageSize.width, ((event.clientX - box.left) / Math.max(1, box.width)) * imageSize.width));
    const y = Math.max(0, Math.min(imageSize.height, ((event.clientY - box.top) / Math.max(1, box.height)) * imageSize.height));
    return { x, y };
  }
  function maskPointerDisplayPoint(event) {
    const canvas = maskCanvasRef.current;
    if (!canvas) return null;
    const box = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(box.width, event.clientX - box.left)),
      y: Math.max(0, Math.min(box.height, event.clientY - box.top))
    };
  }
  function updateBrushCursor(event, visible = true) {
    const point = maskPointerDisplayPoint(event);
    if (!point) return;
    setBrushCursor({ ...point, visible });
  }
  function sourceBrushSize() {
    if (!displaySize.width || !displaySize.height) return brushSize;
    const scaleX = imageSize.width / Math.max(1, displaySize.width);
    const scaleY = imageSize.height / Math.max(1, displaySize.height);
    return Math.max(4, brushSize * Math.max(scaleX, scaleY));
  }
  function paintMask(event, fresh = false) {
    const canvas = maskCanvasRef.current;
    const point = maskPointerPoint(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = sourceBrushSize();
    const previous = fresh ? null : paintRef.current?.last || null;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = size;
    ctx.globalCompositeOperation = maskTool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = LOCAL_EDIT_MASK_COLOR;
    ctx.fillStyle = LOCAL_EDIT_MASK_COLOR;
    ctx.beginPath();
    if (previous) {
      ctx.moveTo(previous.x, previous.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else {
      ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    paintRef.current = { painting: true, last: point };
  }
  function refreshMaskState() {
    const canvas = maskCanvasRef.current;
    const bounds = maskBoundsFromCanvas(canvas);
    setMaskPainted(Boolean(bounds));
    if (bounds) {
      setCropRect(expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio));
    }
    setMaskRevision((current) => current + 1);
  }
  function beginMaskPaint(event) {
    if (!isMaskMode || working) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateBrushCursor(event);
    if (event.button === 2) {
      brushResizeRef.current = {
        startX: event.clientX,
        startSize: brushSize
      };
      return;
    }
    paintMask(event, true);
  }
  function moveMaskPaint(event) {
    if (!isMaskMode) return;
    updateBrushCursor(event);
    if (brushResizeRef.current) {
      event.preventDefault();
      const delta = event.clientX - brushResizeRef.current.startX;
      setBrushSize(clampLocalEditBrushSize(brushResizeRef.current.startSize + delta * 0.5));
      return;
    }
    if (!paintRef.current?.painting) return;
    event.preventDefault();
    paintMask(event);
  }
  function endMaskPaint(event) {
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (brushResizeRef.current) {
      brushResizeRef.current = null;
      return;
    }
    if (!paintRef.current?.painting) return;
    paintRef.current = null;
    refreshMaskState();
  }
  function leaveMaskPaint() {
    setBrushCursor((current) => ({ ...current, visible: false }));
  }
  function clearMask() {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMaskPainted(false);
    setMaskRevision((current) => current + 1);
  }
    function changeBrushByKeyboard(event) {
      const target = event.target;
      const isTyping = target?.tagName === "INPUT"
        || target?.tagName === "TEXTAREA"
        || target?.tagName === "SELECT"
        || target?.isContentEditable;
      if (isTyping) return;
      const isDecrease = event.key === "[" || event.code === "BracketLeft";
      const isIncrease = event.key === "]" || event.code === "BracketRight";
      if (!isDecrease && !isIncrease) return;
      event.preventDefault();
      const step = event.shiftKey ? 12 : 4;
      setBrushSize((current) => clampLocalEditBrushSize(current + (isIncrease ? step : -step)));
    }
function syncCropRectFromMask() {
    if (!isMaskMode || !imageSize.width || !imageSize.height) return;
    const bounds = maskBoundsFromCanvas(maskCanvasRef.current);
    if (!bounds) return;
    const nextRect = expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio);
    if (nextRect) setCropRect(nextRect);
}
  return {
    measureImage,
    maskPointerPoint,
    maskPointerDisplayPoint,
    updateBrushCursor,
    sourceBrushSize,
    paintMask,
    refreshMaskState,
    beginMaskPaint,
    moveMaskPaint,
    endMaskPaint,
    leaveMaskPaint,
    clearMask,
    changeBrushByKeyboard,
    syncCropRectFromMask
  };
}
