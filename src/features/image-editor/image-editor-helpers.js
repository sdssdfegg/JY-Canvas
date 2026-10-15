// src/features/image-editor/image-editor-helpers.js
// P6-6 (V4.0) 2026-10-16：从 src/image-editor.jsx 顶部抽出的纯函数 helpers（逐字搬运，行为零变化）。
// 内容（11 个，全部按原样导出）：
//   openEditorDb / editorGet / editorSet / editorDelete / drawTransparentGrid /
//   workSizeForBitmap / resetMaskCanvas / overlayFitScale / drawOverlayToContext /
//   createCompositionCanvas / maskSnapshot
// 随迁的私有常量：EDITOR_DB_NAME / EDITOR_STORE_NAME / EDITOR_MAX_WORK_SIDE（仅这些 helper 使用）。
//   仍留在父文件的：EDITOR_PROJECT_KEY / EDITOR_HISTORY_LIMIT / EDITOR_BRUSH_DEFAULTS_VERSION /
//   DEFAULT_TRANSFORM / DEFAULT_BRUSH（父组件体内有引用点）。
// 依赖：仅 shared/numeric.js 的 clamp（父文件也 import 了同一份）。helpers 之间互调
//   （drawTransparentGrid ← createCompositionCanvas、overlayFitScale ← drawOverlayToContext ←
//   createCompositionCanvas）整体随迁，无反向 import 父文件，无环。
// ⚠️ 「父调用集 == 本文件导出集」由 scripts/dev/p6-6-helpercheck.mjs（执行单 §4 负向对照）兜底。
import { clamp } from "../../shared/numeric.js";

const EDITOR_DB_NAME = "jingyin-image-editor-v1";
const EDITOR_STORE_NAME = "project";
const EDITOR_MAX_WORK_SIDE = 3000;

export function openEditorDb() {
  if (!window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = window.indexedDB.open(EDITOR_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EDITOR_STORE_NAME)) {
        db.createObjectStore(EDITOR_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function editorGet(key) {
  const db = await openEditorDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(EDITOR_STORE_NAME, "readonly");
    const req = tx.objectStore(EDITOR_STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result?.value || null);
    req.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function editorSet(key, value) {
  const db = await openEditorDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(EDITOR_STORE_NAME, "readwrite");
    tx.objectStore(EDITOR_STORE_NAME).put({ key, value, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export async function editorDelete(key) {
  const db = await openEditorDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(EDITOR_STORE_NAME, "readwrite");
    tx.objectStore(EDITOR_STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

export function drawTransparentGrid(ctx, width, height) {
  ctx.fillStyle = "#0f1018";
  ctx.fillRect(0, 0, width, height);
  const size = 24;
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = 0; y < height; y += size) {
    for (let x = (y / size) % 2 ? 0 : size; x < width; x += size * 2) {
      ctx.fillRect(x, y, size, size);
    }
  }
}

export function workSizeForBitmap(bitmap) {
  const width = bitmap.width || bitmap.naturalWidth || 1;
  const height = bitmap.height || bitmap.naturalHeight || 1;
  const scale = Math.min(1, EDITOR_MAX_WORK_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    sourceWidth: width,
    sourceHeight: height,
    scale
  };
}

export function resetMaskCanvas(maskCanvas, width, height) {
  if (!maskCanvas || !width || !height) return;
  maskCanvas.width = width;
  maskCanvas.height = height;
  const ctx = maskCanvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
}

export function overlayFitScale(canvasSize, overlayBitmap) {
  const width = overlayBitmap?.width || overlayBitmap?.naturalWidth || 1;
  const height = overlayBitmap?.height || overlayBitmap?.naturalHeight || 1;
  return Math.min(canvasSize.width / width, canvasSize.height / height) || 1;
}

export function drawOverlayToContext(ctx, overlayBitmap, canvasSize, transform) {
  if (!overlayBitmap) return;
  const width = overlayBitmap.width || overlayBitmap.naturalWidth || 1;
  const height = overlayBitmap.height || overlayBitmap.naturalHeight || 1;
  const fitScale = overlayFitScale(canvasSize, overlayBitmap);
  const scale = fitScale * clamp(transform.scale || 1, 0.05, 6);
  ctx.save();
  ctx.translate(canvasSize.width / 2 + (Number(transform.x) || 0), canvasSize.height / 2 + (Number(transform.y) || 0));
  ctx.rotate(((Number(transform.rotation) || 0) * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(overlayBitmap, -width / 2, -height / 2, width, height);
  ctx.restore();
}

export function createCompositionCanvas({ baseBitmap, overlayBitmap, maskCanvas, canvasSize, transform, overlayOpacity, differenceMode = false }) {
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return canvas;
  drawTransparentGrid(ctx, canvas.width, canvas.height);
  if (baseBitmap) {
    ctx.drawImage(baseBitmap, 0, 0, canvas.width, canvas.height);
  }
  if (overlayBitmap) {
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = canvas.width;
    overlayCanvas.height = canvas.height;
    const overlayCtx = overlayCanvas.getContext("2d");
    if (overlayCtx) {
      overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      drawOverlayToContext(overlayCtx, overlayBitmap, canvasSize, transform);
      if (maskCanvas) {
        overlayCtx.globalCompositeOperation = "destination-in";
        overlayCtx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
        overlayCtx.globalCompositeOperation = "source-over";
      }
      ctx.save();
      ctx.globalAlpha = clamp(overlayOpacity, 0, 100) / 100;
      if (differenceMode) ctx.globalCompositeOperation = "difference";
      ctx.drawImage(overlayCanvas, 0, 0);
      ctx.restore();
    }
  }
  return canvas;
}

export function maskSnapshot(maskCanvas, transform) {
  if (!maskCanvas) return null;
  return {
    maskDataUrl: maskCanvas.toDataURL("image/png"),
    transform: { ...transform }
  };
}
