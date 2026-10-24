// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 90–611 行（工具区，不含 87–89 视频常量））。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：outfit 工具区（常量 / resize 设置规范化 / 图像处理全族 / entry 助手）。
import { RESIZE_SETTINGS_KEY } from "./outfit-storage-keys.js";
import { readJsonStorage } from "../../lib/storage/json-storage.js";
import { canvasToBlob } from "../../shared/canvas-blob.js";
import { fileBaseName } from "../../shared/file-name.js";
import {
  CHANNEL_UPLOAD_LIMIT_BYTES,
  CHANNEL_UPLOAD_MAX_SIDE,
  CHANNEL_UPLOAD_TARGET_BYTES,
  imageExtension,
  imageFilesFromList,
  isImageFile
} from "../../shared/image-input.js";
import { constrainCropRect as sharedConstrainCropRect } from "../../shared/local-edit-geometry.js";
import { imageFileFromUrl } from "../../shared/result-image.js";

export const MAX_UPLOAD_IMAGES = 10;
export const PREPROCESS_OPTIONS = [
  { value: "crop", label: "手动裁剪" },
  { value: "pad", label: "白底补边" },
  { value: "soft", label: "柔和补边" },
  { value: "original", label: "原图" }
];
export const DEFAULT_PREPROCESS_MODE = "original";
export const BATCH_RATIO_OPTIONS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"];
export const RESIZE_RESOLUTION_OPTIONS = [
  { value: "custom", label: "自定义" },
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" }
];
export const RESIZE_RESOLUTION_MAP = {
  "1K": 1024,
  "2K": 2304,
  "4K": 4096
};
export const RESIZE_FILL_OPTIONS = [
  { value: "#ffffff", label: "白" },
  { value: "#000000", label: "黑" }
];
export const RESIZE_FORMAT_OPTIONS = [
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WEBP" }
];
// V121-R2：RESIZE_SETTINGS_KEY / RESIZE_BATCH_CROP_KEY 已迁至 outfit-storage-keys.js（零依赖叶子），此处 import 复用。
export const RESIZE_OUTPUT_FOLDER = "批量尺寸导出";
export const DEFAULT_RESIZE_SETTINGS = {
  ratio: "3:4",
  // 2026-09-25：批量尺寸导出的「最长边」默认值由 3000 调整为 3500。
  // 老存档里存着 3000 的用户（= 从没改过，存的只是当时的默认值）由
  // normalizeResizeSettings 迁移到新默认值；真正自定义过的值原样保留。
  longEdge: 3500,
  resolution: "custom",
  fitMode: "original",
  outputFormat: "jpg",
  dpi: 72,
  fillColor: "#ffffff",
  cropMode: "batch"
};
export const LEGACY_RESIZE_LONG_EDGE_DEFAULT = 3000;
export function clampResizeEdge(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return DEFAULT_RESIZE_SETTINGS.longEdge;
  return Math.max(256, Math.min(8192, number));
}
export function normalizeResizeSettings(settings = {}) {
  const next = { ...DEFAULT_RESIZE_SETTINGS, ...(settings || {}) };
  if (!BATCH_RATIO_OPTIONS.includes(next.ratio)) next.ratio = DEFAULT_RESIZE_SETTINGS.ratio;
  if (!RESIZE_RESOLUTION_OPTIONS.some((option) => option.value === next.resolution)) {
    next.resolution = DEFAULT_RESIZE_SETTINGS.resolution;
  }
  // 2026-09-25：把旧默认值 3000 迁移到新默认值 3500。
  // 旧存档里 3000 几乎都是"从没改过"（当年就是默认值），所以跟着新默认走；
  // 用户真正改过的其它值不受影响。迁移只在读取时生效，下次保存即写回 3500。
  if (Number.parseInt(next.longEdge, 10) === LEGACY_RESIZE_LONG_EDGE_DEFAULT) {
    next.longEdge = DEFAULT_RESIZE_SETTINGS.longEdge;
  }
  next.longEdge = clampResizeEdge(next.longEdge);
  next.fitMode = ["original", "pad", "crop", "original-size"].includes(next.fitMode) ? next.fitMode : DEFAULT_RESIZE_SETTINGS.fitMode;
  next.outputFormat = RESIZE_FORMAT_OPTIONS.some((option) => option.value === next.outputFormat) ? next.outputFormat : DEFAULT_RESIZE_SETTINGS.outputFormat;
  next.dpi = Math.max(1, Math.min(1200, Number.parseInt(next.dpi, 10) || DEFAULT_RESIZE_SETTINGS.dpi));
  next.fillColor = RESIZE_FILL_OPTIONS.some((option) => option.value === next.fillColor) ? next.fillColor : "#ffffff";
  next.cropMode = next.cropMode === "individual" ? "individual" : "batch";
  // 2026-09-25：自动裁剪已移除；把旧存档里遗留的持久化字段清掉，
  // 避免 localStorage 里继续留着一组永远不会被读取的无效状态。
  delete next.autoCropEnabled;
  delete next.autoCropMode;
  delete next.autoCropTopMarginPx;
  delete next.autoCropBottomMarginPx;
  delete next.autoCropHalfMode;
  if (next.resolution !== "custom") {
    next.longEdge = RESIZE_RESOLUTION_MAP[next.resolution] || next.longEdge;
  }
  return next;
}
export function readResizeSettings() {
  return normalizeResizeSettings(readJsonStorage(RESIZE_SETTINGS_KEY, null));
}
export function resolveResizeLongEdge(settings) {
  const normalized = normalizeResizeSettings(settings);
  return normalized.resolution === "custom"
    ? clampResizeEdge(normalized.longEdge)
    : RESIZE_RESOLUTION_MAP[normalized.resolution] || normalized.longEdge;
}
export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export function ratioParts(ratio) {
  const [w, h] = String(ratio || "3:4").split(":").map((part) => Number.parseFloat(part));
  return Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 ? { w, h, value: w / h } : { w: 3, h: 4, value: 3 / 4 };
}
function fileFromEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}
function readDirectoryBatch(reader) {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}
export async function filesFromEntry(entry) {
  if (!entry) return [];
  if (entry.isFile) {
    const file = await fileFromEntry(entry);
    return isImageFile(file) ? [file] : [];
  }
  if (!entry.isDirectory) return [];

  const reader = entry.createReader();
  const entries = [];
  while (true) {
    const batch = await readDirectoryBatch(reader);
    if (!batch.length) break;
    entries.push(...batch);
  }

  entries.sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "zh-Hans-CN", { numeric: true }));
  const nested = await Promise.all(entries.map(filesFromEntry));
  return nested.flat();
}
export async function imageFilesFromDataTransfer(dataTransfer) {
  const items = Array.from(dataTransfer?.items || []);
  const entries = items
    .map((item) => (typeof item.webkitGetAsEntry === "function" ? item.webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entries.length > 0) {
    const nested = await Promise.all(entries.map(filesFromEntry));
    const seen = new Set();
    return nested.flat().filter((file) => {
      const key = `${file.name}_${file.size}_${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return isImageFile(file);
    });
  }

  const directFiles = imageFilesFromList(dataTransfer?.files);
  if (directFiles.length > 0) return directFiles;

  const uri = String(dataTransfer?.getData?.("text/uri-list") || dataTransfer?.getData?.("text/plain") || "")
    .split(/\r?\n/)
    .find((line) => line && !line.startsWith("#"));
  if (uri && (/^https?:\/\//i.test(uri) || uri.startsWith("/") || uri.startsWith("data:"))) {
    return [await imageFileFromUrl(uri, "drag-image")];
  }
  return [];
}
export function preprocessModeLabel(mode) {
  return PREPROCESS_OPTIONS.find((option) => option.value === mode)?.label
    || PREPROCESS_OPTIONS.find((option) => option.value === DEFAULT_PREPROCESS_MODE)?.label
    || "白底补边";
}
export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}
export async function patchJpegDensity(blob, dpi = 72) {
  if (!blob || blob.type !== "image/jpeg") return blob;
  const source = new Uint8Array(await blob.arrayBuffer());
  if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) return blob;

  const density = Math.max(1, Math.min(65535, Math.round(dpi)));
  const app0 = new Uint8Array([
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01,
    0x01,
    density >> 8,
    density & 0xff,
    density >> 8,
    density & 0xff,
    0x00,
    0x00
  ]);

  let pos = 2;
  while (pos + 3 < source.length) {
    if (source[pos] !== 0xff) {
      pos += 1;
      continue;
    }
    let marker = source[pos + 1];
    while (marker === 0xff && pos + 2 < source.length) {
      pos += 1;
      marker = source[pos + 1];
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const segmentLength = (source[pos + 2] << 8) | source[pos + 3];
    if (segmentLength < 2 || pos + 2 + segmentLength > source.length) break;
    if (marker === 0xe0 && segmentLength >= 16) {
      const isJfif =
        source[pos + 4] === 0x4a &&
        source[pos + 5] === 0x46 &&
        source[pos + 6] === 0x49 &&
        source[pos + 7] === 0x46 &&
        source[pos + 8] === 0x00;
      if (isJfif) {
        const updated = source.slice();
        updated[pos + 11] = 0x01;
        updated[pos + 12] = density >> 8;
        updated[pos + 13] = density & 0xff;
        updated[pos + 14] = density >> 8;
        updated[pos + 15] = density & 0xff;
        return new Blob([updated], { type: blob.type });
      }
    }
    pos += 2 + segmentLength;
  }

  return new Blob([source.slice(0, 2), app0, source.slice(2)], { type: blob.type });
}
function resizeMimeForFormat(format) {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "image/jpeg";
}
function fileNameWithImageExtension(name, mimeType) {
  return `${fileBaseName(name || "image")}.${imageExtension(mimeType)}`;
}
export async function canvasToFile(canvas, name, type = "image/jpeg", quality = 0.92, dpi = 72) {
  const blob = await canvasToBlob(canvas, type, quality);
  const outputBlob = type === "image/jpeg" ? await patchJpegDensity(blob, dpi) : blob;
  return new File([outputBlob], fileNameWithImageExtension(name, type), { type, lastModified: Date.now() });
}
export const constrainLocalEditRect = sharedConstrainCropRect;
export async function canvasToChannelFile(canvas, name, type = "image/jpeg", quality = 0.92) {
  const qualities = [quality, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.42];
  let scale = 1;
  let workingCanvas = canvas;
  let bestBlob = null;

  const makeFile = (blob) => new File([blob], `${fileBaseName(name)}_upload.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now()
  });

  for (let attempt = 0; attempt < 7; attempt += 1) {
    for (const nextQuality of qualities) {
      const blob = await canvasToBlob(workingCanvas, type, nextQuality);
      bestBlob = blob;
      if (blob.size <= CHANNEL_UPLOAD_TARGET_BYTES) return makeFile(blob);
    }

    scale *= 0.82;
    const nextCanvas = document.createElement("canvas");
    nextCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    nextCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = nextCanvas.getContext("2d", { alpha: false });
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    ctx.drawImage(canvas, 0, 0, nextCanvas.width, nextCanvas.height);
    workingCanvas = nextCanvas;
  }

  if (bestBlob && bestBlob.size <= CHANNEL_UPLOAD_LIMIT_BYTES) return makeFile(bestBlob);
  throw new Error("图片处理后仍超过 4MB，请换一张更轻的素材再试");
}
export async function compressOriginalImageFile(file) {
  if (!file || file.size <= CHANNEL_UPLOAD_LIMIT_BYTES) return file;
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const scale = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToChannelFile(canvas, file.name);
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
export function outputSizeForRatio(ratio, maxSide = CHANNEL_UPLOAD_MAX_SIDE) {
  const { w, h } = ratioParts(ratio);
  if (w >= h) {
    return { width: maxSide, height: Math.round(maxSide * h / w) };
  }
  return { width: Math.round(maxSide * w / h), height: maxSide };
}
export async function processImageFile(file, ratio, mode = "pad", crop = null) {
  if (mode === "original") return await compressOriginalImageFile(file);
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    if (mode === "crop" && crop) {
      return await cropImageFile(file, image, ratio, crop);
    }
    return await padImageFile(file, image, ratio, mode === "soft");
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
function drawSoftEdgeBackground(ctx, image, drawX, drawY, drawWidth, drawHeight, canvasWidth, canvasHeight) {
  const blur = 14;
  const stripX = Math.max(1, Math.min(image.naturalWidth, Math.round(image.naturalWidth * 0.08)));
  const stripY = Math.max(1, Math.min(image.naturalHeight, Math.round(image.naturalHeight * 0.08)));

  function drawClipped(rectX, rectY, rectWidth, rectHeight, sx, sy, sw, sh, dx, dy, dw, dh) {
    if (rectWidth <= 0 || rectHeight <= 0 || dw <= 0 || dh <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rectX, rectY, rectWidth, rectHeight);
    ctx.clip();
    ctx.filter = `blur(${blur}px) saturate(1.04)`;
    ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  if (drawX > 0.5) {
    drawClipped(0, 0, drawX + 1, canvasHeight, 0, 0, stripX, image.naturalHeight, -blur, -blur, drawX + blur * 2 + 1, canvasHeight + blur * 2);
    drawClipped(drawX + drawWidth - 1, 0, canvasWidth - drawX - drawWidth + 1, canvasHeight, image.naturalWidth - stripX, 0, stripX, image.naturalHeight, drawX + drawWidth - 1 - blur, -blur, canvasWidth - drawX - drawWidth + blur * 2 + 1, canvasHeight + blur * 2);
  }

  if (drawY > 0.5) {
    drawClipped(0, 0, canvasWidth, drawY + 1, 0, 0, image.naturalWidth, stripY, -blur, -blur, canvasWidth + blur * 2, drawY + blur * 2 + 1);
    drawClipped(0, drawY + drawHeight - 1, canvasWidth, canvasHeight - drawY - drawHeight + 1, 0, image.naturalHeight - stripY, image.naturalWidth, stripY, -blur, drawY + drawHeight - 1 - blur, canvasWidth + blur * 2, canvasHeight - drawY - drawHeight + blur * 2 + 1);
  }

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#ffffff";
  if (drawX > 0.5) {
    ctx.fillRect(0, 0, drawX, canvasHeight);
    ctx.fillRect(drawX + drawWidth, 0, canvasWidth - drawX - drawWidth, canvasHeight);
  }
  if (drawY > 0.5) {
    ctx.fillRect(0, 0, canvasWidth, drawY);
    ctx.fillRect(0, drawY + drawHeight, canvasWidth, canvasHeight - drawY - drawHeight);
  }
  ctx.restore();
}
export async function padImageFile(file, image, ratio, softBackground = false) {
  const sourceRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = ratioParts(ratio).value;
  let targetWidth = image.naturalWidth;
  let targetHeight = image.naturalHeight;

  if (sourceRatio < targetRatio) targetWidth = Math.round(image.naturalHeight * targetRatio);
  else targetHeight = Math.round(image.naturalWidth / targetRatio);

  const scaleDown = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(targetWidth, targetHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(targetWidth * scaleDown));
  canvas.height = Math.max(1, Math.round(targetHeight * scaleDown));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = softBackground ? "#f7f1f4" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawWidth = image.naturalWidth * scaleDown;
  const drawHeight = image.naturalHeight * scaleDown;
  const drawX = (canvas.width - drawWidth) / 2;
  const drawY = (canvas.height - drawHeight) / 2;

  if (softBackground) {
    drawSoftEdgeBackground(ctx, image, drawX, drawY, drawWidth, drawHeight, canvas.width, canvas.height);
  }

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  return canvasToChannelFile(canvas, file.name);
}
export function resolveCropSourceRect(image, ratio, crop) {
  const naturalWidth = image.naturalWidth || image.width || 1;
  const naturalHeight = image.naturalHeight || image.height || 1;
  const stageWidth = Math.max(1, Number(crop?.stageWidth) || 1);
  const stageHeight = Math.max(1, Number(crop?.stageHeight) || 1);
  const baseScale = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight);
  const drawScale = baseScale * Math.max(0.05, Number(crop?.scale) || 1);
  const drawWidth = naturalWidth * drawScale;
  const drawHeight = naturalHeight * drawScale;
  const left = stageWidth / 2 - drawWidth / 2 + (Number(crop?.x) || 0);
  const top = stageHeight / 2 - drawHeight / 2 + (Number(crop?.y) || 0);
  const viewLeft = (0 - left) / drawScale;
  const viewTop = (0 - top) / drawScale;
  const viewRight = (stageWidth - left) / drawScale;
  const viewBottom = (stageHeight - top) / drawScale;
  let sourceX = Math.max(0, Math.min(naturalWidth, viewLeft));
  let sourceY = Math.max(0, Math.min(naturalHeight, viewTop));
  let sourceRight = Math.max(0, Math.min(naturalWidth, viewRight));
  let sourceBottom = Math.max(0, Math.min(naturalHeight, viewBottom));

  if (sourceRight - sourceX < 2 || sourceBottom - sourceY < 2) {
    // 2026-09-25：原来这里会按 ratio 重算一个等比源矩形（横图/竖图取中间一块），
    // 属于"因为比例设置自动扩展选区"。现在只把可见范围夹进图片范围，不做比例重算。
    sourceX = Math.max(0, Math.min(naturalWidth - 1, viewLeft));
    sourceY = Math.max(0, Math.min(naturalHeight - 1, viewTop));
    sourceRight = Math.max(sourceX + 1, Math.min(naturalWidth, viewRight));
    sourceBottom = Math.max(sourceY + 1, Math.min(naturalHeight, viewBottom));
  }

  return constrainLocalEditRect({
    x: sourceX,
    y: sourceY,
    width: Math.max(1, sourceRight - sourceX),
    height: Math.max(1, sourceBottom - sourceY)
  }, naturalWidth, naturalHeight);
}
export async function cropImageFile(file, image, ratio, crop) {
  const sourceRect = resolveCropSourceRect(image, ratio, crop);
  const sourceWidth = Math.max(1, sourceRect.width);
  const sourceHeight = Math.max(1, sourceRect.height);
  const scaleDown = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scaleDown));
  canvas.height = Math.max(1, Math.round(sourceHeight * scaleDown));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建裁剪画布");

  ctx.drawImage(
    image,
    sourceRect.x,
    sourceRect.y,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvasToChannelFile(canvas, file.name);
}
export async function resizeImageFile(file, settings, crop = null) {
  const normalized = normalizeResizeSettings(settings);
  const outputMime = resizeMimeForFormat(normalized.outputFormat);
  const outputQuality = outputMime === "image/png" ? undefined : 0.92;
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(sourceUrl);
    if (normalized.fitMode === "original") {
      const edge = resolveResizeLongEdge(normalized);
      const scale = edge / Math.max(1, image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext("2d", { alpha: outputMime !== "image/jpeg" });
      if (!ctx) throw new Error("无法创建画布");
      if (outputMime === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvasToFile(canvas, file.name, outputMime, outputQuality, normalized.dpi);
    }

    if (normalized.fitMode === "original-size") {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { alpha: outputMime !== "image/jpeg" });
      if (!ctx) throw new Error("无法创建画布");
      if (outputMime === "image/jpeg") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight);
      return canvasToFile(canvas, file.name, outputMime, outputQuality, normalized.dpi);
    }

    const edge = resolveResizeLongEdge(normalized);
    const { width, height } = outputSizeForRatio(normalized.ratio, edge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: outputMime !== "image/jpeg" });
    if (!ctx) throw new Error("无法创建画布");

    if (normalized.fitMode === "crop") {
      ctx.fillStyle = outputMime === "image/jpeg" ? normalized.fillColor : "rgba(0,0,0,0)";
      ctx.fillRect(0, 0, width, height);
      if (!crop) {
        const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        const drawWidth = image.naturalWidth * scale;
        const drawHeight = image.naturalHeight * scale;
        ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        return canvasToFile(canvas, file.name, outputMime, outputQuality, normalized.dpi);
      }
      const stageWidth = Math.max(1, Number(crop?.stageWidth) || width);
      const stageHeight = Math.max(1, Number(crop?.stageHeight) || height);
      const baseScale = Math.min(stageWidth / image.naturalWidth, stageHeight / image.naturalHeight);
      const drawScale = baseScale * Math.max(0.05, Number(crop?.scale) || 1);
      const drawWidth = image.naturalWidth * drawScale;
      const drawHeight = image.naturalHeight * drawScale;
      const left = stageWidth / 2 - drawWidth / 2 + (Number(crop?.x) || 0);
      const top = stageHeight / 2 - drawHeight / 2 + (Number(crop?.y) || 0);
      const scaleX = width / stageWidth;
      const scaleY = height / stageHeight;
      ctx.drawImage(
        image,
        left * scaleX,
        top * scaleY,
        drawWidth * scaleX,
        drawHeight * scaleY
      );
      return canvasToFile(canvas, file.name, outputMime, outputQuality, normalized.dpi);
    }

    ctx.fillStyle = normalized.fillColor === "#000000" ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    return canvasToFile(canvas, file.name, outputMime, outputQuality, normalized.dpi);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
