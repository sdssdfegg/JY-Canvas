import { clamp } from "./numeric.js";
import {
  fitRectToRatioLocked,
  fitRectToRatioContaining,
  snapSizeToRatio,
  constrainCropRect as sharedConstrainCropRect
} from "./local-edit-geometry.js";
// P7-6：下面的 fetch 收口到 src/api/assets.js。这里是 data:/blob: 的本地读取而非业务接口，
// 但为了「网络出口只此一处」没有例外，仍然搬进准入层（行为逐字一致）。
// 依赖方向 shared → api 并非本单首创：`shared/result-image.js` 早已 import `../api/assets.js`。
import { fetchLocalBlob } from "../api/assets.js";

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
 * 默认行为（不传 `options.lockRatio`）：**只把包围盒夹进图片范围**，宽高保持用户实际涂抹的像素尺寸。
 * 这是 2026-09-25 对齐 3.0 的契约，逐字保持，老调用点（不传 options）行为零变化。
 *
 * 蒙版换装几何对齐修复（V38）：当 `options.lockRatio` 为真时，在"包围盒中心锚"上：
 *   ① 四边各外扩 `options.paddingPx`（上下文边距，让模型看得见描边区外面是什么，避免切边重排）；
 *   ② 以包围盒中心为锚，锁到 `ratio`（= 前端所选比例）的宽高比，取"能容纳外扩后包围盒"的最小同比例矩形；
 *   ③ `constrainCropRect` 夹进原图。
 * 这样得到的 rect 就是 `localEdit.cropRect`，被 裁剪 / 蒙版裁剪 / 回贴选框 三处共用 ⇒ 几何自动一致。
 *
 * `ratio` 与 `options` 参数保留在签名里；仅 lockRatio 开启时才影响返回值（不破坏既有调用方）。
 */
export function expandMaskBoundsToCropRect(bounds, imageWidth, imageHeight, ratio, options = {}) {
  if (!bounds || !imageWidth || !imageHeight) return null;
  const sourceWidth = Math.max(1, Math.round(imageWidth));
  const sourceHeight = Math.max(1, Math.round(imageHeight));
  const width = clamp(Math.round(bounds.width || 1), 1, sourceWidth);
  const height = clamp(Math.round(bounds.height || 1), 1, sourceHeight);
  const x = clamp(Math.round(bounds.x || 0), 0, sourceWidth - width);
  const y = clamp(Math.round(bounds.y || 0), 0, sourceHeight - height);

  // 默认行为：不锁比例，直接返回夹取后的包围盒（逐字保持 2026-09-25 契约）。
  if (!options || !options.lockRatio) {
    return { x, y, width, height };
  }

  // 蒙版换装几何对齐修复（V38）：外扩 → 锁比例，以包围盒中心为锚。
  const paddingPx = Math.min(
    Math.max(0, Math.round(options?.paddingPx ?? computeMaskContextPaddingPx(bounds))),
    sourceWidth,
    sourceHeight
  );
  const expanded = {
    x: x - paddingPx,
    y: y - paddingPx,
    width: width + paddingPx * 2,
    height: height + paddingPx * 2
  };
  return fitRectToRatioContaining(expanded, ratio, sourceWidth, sourceHeight);
}

/**
 * 蒙版换装上下文边距（原图像素）：给模型"看得见描边区外面是什么"的上下文，专治切边重排。
 * 取"6% 的最大边"并夹在 [24, 160] 之间（见 V38 执行单 §2）；
 * 边距越大模型分给"要改的那一块"的像素越少（画质下降），故封顶 160。
 */
export function computeMaskContextPaddingPx(bounds) {
  const maxSide = Math.max(Number(bounds?.width) || 0, Number(bounds?.height) || 0);
  const raw = Math.round(0.06 * maxSide);
  return Math.min(160, Math.max(24, raw));
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
  const blob = await fetchLocalBlob(dataUrl);
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

/**
 * 蒙版换装（maskEdit）贴回时的 alpha 羽化半径（像素）。
 *
 * V37.1 接缝修复：mask 模式贴回用「涂抹边界向外过渡」的软 alpha（blur 后硬边保内、
 * 软边溢出在外），把上游重绘内容与原图的边界从硬切变成 ~N px 渐变带。
 * 仅 mask 模式贴回使用；rect 模式 / local-detail 仍守 2026-09-25「贴回就是贴回」硬边契约。
 */
export const LOCAL_EDIT_MASK_PASTE_FEATHER = 16;

/**
 * 把本地涂抹蒙版转成「上游 inpaint 蒙版」。
 *
 * 上游（GPT-Image / 香蕉 edits）约定：**不透明＝保留，透明＝重绘**。
 * 本地涂抹蒙版语义相反（涂抹区＝白不透明＝用户想改的服装区），故必须 alpha 反转：
 *   涂抹区（白不透明）⇒ 透明（待上游重绘）
 *   其余（透明）      ⇒ 不透明白（上游保留）
 *
 * 输入 maskImage 为「全图尺寸」的涂抹蒙版位图（与 applyLocalEdit 导出的 maskDataUrl 同尺寸），
 * 用 cropRect 裁到与上传的 cropFile 同一框、同一尺寸，保证像素级对齐。
 * 注意：本函数**只追加**，不改动 normalizeMaskCanvas / createLocalEditAlphaMask / applyLocalEdit
 * 既有导出语义（局部回贴前端合成链路依赖它们）。
 */
export function createInpaintUploadMask(maskImage, cropRect) {
  if (!maskImage || !cropRect?.width || !cropRect?.height) return null;
  const rect = {
    x: Math.round(cropRect.x || 0),
    y: Math.round(cropRect.y || 0),
    width: Math.max(1, Math.round(cropRect.width || 1)),
    height: Math.max(1, Math.round(cropRect.height || 1))
  };
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.drawImage(maskImage, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  // 先归一化：涂抹区强制白不透明、其余透明（抗画笔抗锯齿产生的半透明边）。
  normalizeMaskCanvas(canvas);
  const imageData = ctx.getImageData(0, 0, rect.width, rect.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 10) {
      // 涂抹区 ⇒ 透明（待上游重绘）
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    } else {
      // 其余 ⇒ 不透明白（上游保留）
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  // V37.1 上游蒙版边缘羽化：二值硬边会让上游在重绘边界产生生硬的接缝。
  // 给透明（重绘）区边缘一圈 blur 过渡带，让上游在边界处渐变混合而不是硬切。
  // 只影响本函数产出的上传蒙版，不改 normalizeMaskCanvas / applyLocalEdit 语义。
  const featherPx = 8;
  const softCanvas = document.createElement("canvas");
  softCanvas.width = rect.width;
  softCanvas.height = rect.height;
  const softCtx = softCanvas.getContext("2d");
  if (!softCtx) return canvas;
  if ("filter" in softCtx) {
    softCtx.filter = `blur(${featherPx}px)`;
  }
  softCtx.drawImage(canvas, 0, 0);
  if ("filter" in softCtx) {
    softCtx.filter = "none";
  }
  return softCanvas;
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
  const {
    setImageSize, savedEdit, onRatioChange, enabled, ratios, editMode, setEditMode, cropRect,
    fitRectToRatio, lockRatioForLoad, lockRatioForUpdate, defaultCropRect
  } = deps;
  const {
    item, cropLocalEditFile, onApply, canvasToPngDataUrl, maskOpacity, setWorking,
    fallbackToItem, rectModeTag
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
      setCropRect(expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio, { lockRatio: true, paddingPx: computeMaskContextPaddingPx(bounds) }));
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
    const nextRect = expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio, { lockRatio: true, paddingPx: computeMaskContextPaddingPx(bounds) });
    if (nextRect) setCropRect(nextRect);
}
  function chooseRatio(nextRatio) {
    if (!enabled || !ratios.includes(nextRatio)) return;
    onRatioChange?.(nextRatio);
    if (isMaskMode) {
      const bounds = maskBoundsFromCanvas(maskCanvasRef.current);
      if (bounds) {
        setCropRect(expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, nextRatio, { lockRatio: true, paddingPx: computeMaskContextPaddingPx(bounds) }));
      }
      return;
    }
    setCropRect((current) => fitRectToRatio(current, nextRatio));
  }
  function chooseEditMode(nextMode) {
    if (!enabled || nextMode === editMode) return;
    setEditMode(nextMode);
    if (nextMode === LOCAL_EDIT_MASK_MODE) {
      const bounds = maskBoundsFromCanvas(maskCanvasRef.current);
      setMaskPainted(Boolean(bounds));
      if (bounds) {
        setCropRect(expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio, { lockRatio: true, paddingPx: computeMaskContextPaddingPx(bounds) }));
      }
    } else if (cropRect) {
      setCropRect((current) => fitRectToRatio(current, activeRatio));
    }
  }
  function updateCropRect(nextRect) {
    setCropRect((current) => {
      const source = nextRect || current;
      if (!source || !imageSize.width || !imageSize.height) return current;
      if (lockRatioForUpdate) {
        const size = snapSizeToRatio(source.width, source.height, activeRatio, imageSize.width, imageSize.height);
        return sharedConstrainCropRect({ ...source, ...size }, imageSize.width, imageSize.height);
      }
      return sharedConstrainCropRect(source, imageSize.width, imageSize.height);
    });
  }
  function onImageLoad(event) {
    const width = event.currentTarget.naturalWidth || 1;
    const height = event.currentTarget.naturalHeight || 1;
    setImageSize({ width, height });
    const initial = savedEdit?.cropRect
      ? (lockRatioForLoad
        ? fitRectToRatioLocked(savedEdit.cropRect, activeRatio, width, height)
        : sharedConstrainCropRect(savedEdit.cropRect, width, height))
      : (lockRatioForLoad
        ? fitRectToRatioLocked(null, activeRatio, width, height)
        : defaultCropRect(width, height, activeRatio));
    setCropRect(initial);
    window.requestAnimationFrame(measureImage);
  }
  async function applyLocalEdit() {
    if (!cropRect || working) return;
    if (isMaskMode && !maskCanvasHasPaint(maskCanvasRef.current)) return;
    setWorking(true);
    try {
      if (isMaskMode) {
        const canvas = maskCanvasRef.current;
        const bounds = maskBoundsFromCanvas(canvas);
        const maskCropRect = expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio, { lockRatio: true, paddingPx: computeMaskContextPaddingPx(bounds) }) || cropRect;
        const cropped = await cropLocalEditFile(item, maskCropRect, "mask_edit", { fallbackToItem });
        onApply(item.id, {
          ...cropped,
          cropRect: maskCropRect,
          aspectRatio: activeRatio,
          editMode: LOCAL_EDIT_MASK_MODE,
          maskDataUrl: canvasToPngDataUrl(canvas),
          maskBounds: bounds,
          brushSize,
          maskOpacity
        });
      } else {
        // 普通裁剪与局部回贴走**同一套**几何：输出尺寸恒等于选框在原图上的像素尺寸。
        const cropped = await cropLocalEditFile(item, cropRect, rectModeTag, { fallbackToItem });
        onApply(item.id, { ...cropped, aspectRatio: activeRatio, editMode: LOCAL_EDIT_RECT_MODE });
      }
    } finally {
      setWorking(false);
    }
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
    syncCropRectFromMask,
    chooseRatio,
    chooseEditMode,
    updateCropRect,
    onImageLoad,
    applyLocalEdit
  };
}
