// RF-080 (V23): outfit 5 个独立面板组件 + 其依赖闭包，从 src/outfit-workflow.jsx 抽出。
// 本文件对 src/outfit-workflow.jsx 单向依赖（原文件 import 回组件与共享定义），不形成环。
// 组件必须保持模块顶层（PromptPresetGrid 尤其），不得塞进其它组件体内。
// 随迁闭包全部为模块顶层、不依赖组件 state 的普通定义。
// 生成于 RF-080 施工单；行尾 CRLF。
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Check,
  Crop,
  Download,
  FolderOpen,
  Images,
  Loader2,
  Lock,
  Move,
  Pencil,
  Play,
  Plus,
  Save,
  Scissors,
  Search,
  Trash2,
  Upload,
  Video,
  X
} from "lucide-react";
import { generateVideo, getVideoStatus } from "../../api/videos.js";
import {
  fileSize,
  formatWholeSecondMs as formatMs
} from "../../lib/format/index.js";
import {
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage
} from "../../lib/storage/json-storage.js";
import { canvasToBlob } from "../../shared/canvas-blob.js";
import { preventFileDropNavigation } from "../../shared/dom-actions.js";
import { fileBaseName } from "../../shared/file-name.js";
import {
  CHANNEL_UPLOAD_LIMIT_BYTES,
  CHANNEL_UPLOAD_MAX_SIDE,
  CHANNEL_UPLOAD_TARGET_BYTES,
  imageExtension,
  imageFilesFromClipboard,
  imageFilesFromList,
  isImageFile
} from "../../shared/image-input.js";
import {
  clampCropTransform,
  constrainCropRect as sharedConstrainCropRect,
  formatPixelSize
} from "../../shared/local-edit-geometry.js";
import { imageFileFromUrl, dataUrlFromBlob } from "../../shared/result-image.js";
import { Modal, ModalHeader } from "../../shared/ui/Modal.jsx";
import { ModuleHeader } from "../../shared/ui/ModuleHeader";
import { Button } from "../../shared/ui/Button";
import { TaskBadge } from "../../shared/ui/TaskBadge";
import { UploadClearButton } from "../../shared/ui/UploadClearButton";
// 与 src/features/video/video-composer.js 的 durationOptionsForVideoModel 逐字等价
// （仅默认时长常量来源不同，但 QUICK_VIDEO_DEFAULTS 与 videoDefaults 取值完全相同），
// 故直接复用，消除 28 组近重复里的这一对改名克隆。
import {
  durationOptionsForVideoModel as videoDurationOptions,
  videoPriceLabel as quickVideoPriceLabel,
} from "../video/video-composer.js";
import {
  isVideoTaskCompleted,
  isVideoTaskFailed,
  videoResultUrl,
  videoTaskStatusText
} from "../../shared/video-task.js";
import { normalizeApiKeyInput } from "../auth/api-key.js";
import {
  OUTFIT_SESSION_ID,
  imageItemPreviewSource,
  normalizeCropReturnMeta
} from "./outfit-task.js";
export const VIDEO_STATUS_POLL_INTERVAL_MS = 4000;
export const VIDEO_STATUS_MAX_POLLS = 180;
export const VIDEO_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
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
export const RESIZE_SETTINGS_KEY = "jingyin-outfit-workflow-resize-settings-v4";
export const RESIZE_BATCH_CROP_KEY = "jingyin-outfit-workflow-resize-batch-crop-v1";
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
export function fileFromEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}
export function readDirectoryBatch(reader) {
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
export function resizeMimeForFormat(format) {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "image/jpeg";
}
export function fileNameWithImageExtension(name, mimeType) {
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
export function drawSoftEdgeBackground(ctx, image, drawX, drawY, drawWidth, drawHeight, canvasWidth, canvasHeight) {
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
export function UploadZone({
  title,
  hint,
  slotPrefix = "",
  titleText = "",
  hintText = "",
  onEditTitle = null,
  onEditHint = null,
  items,
  onPick,
  onRemove,
  onOpenCrop,
  onOpenLocalEdit,
  onToggle,
  onReorder,
  onReplace,
  onClear,
  onSetFixed,
  onPreview,
  fixedId,
  fixedTitle = "设为固定服装",
  acceptMultiple = true,
  compact = false,
  primary = false,
  /* V77（§3.1）：显式列数覆盖。图1 传 4（大区 ~10 张容量），图2/图3 不传走默认 2。
     说明：执行单建议按 maxCount 分档（≥8→4 列），但图3 的 maxCount 同为 MAX_UPLOAD_IMAGES(10)，
     分档会把图3 也推成 4 列，违背「图2/图3 保持 2 列」，故改为显式 columns prop。 */
  columns,
  maxCount = MAX_UPLOAD_IMAGES,
  onLimit,
  onActivate,
  bulkMode = "pad",
  /* V77 Park：统一处理停用，但 props 与 handler 保留 —— 别名 _ 前缀（eslint 允许的未使用参数命名），
     恢复 = 去掉 _ 前缀并还原 uploadZoneFooter 里的 bulkModeControl / small 两段。 */
  onBulkModeChange: _onBulkModeChange,
  localEditEnabled = false,
  footerControls = null,
  sideControls = null
}) {
  const inputRef = useRef(null);
  const pointerSortRef = useRef(null);
  const suppressOpenRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [draggingImageId, setDraggingImageId] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [replaceTargetId, setReplaceTargetId] = useState("");
  // 缩略图 meta 要显示像素尺寸：直接读已渲染 <img> 的 naturalWidth/Height（零额外解码）。
  const thumbSizeRef = useRef(new Map());
  const [, bumpThumbSizeRevision] = useState(0);
  function rememberThumbSize(itemId, image) {
    const width = image?.naturalWidth || 0;
    const height = image?.naturalHeight || 0;
    if (!itemId || !width || !height) return;
    const previous = thumbSizeRef.current.get(itemId);
    if (previous && previous.width === width && previous.height === height) return;
    thumbSizeRef.current.set(itemId, { width, height });
    bumpThumbSizeRevision((value) => value + 1);
  }
  // V77（§3.1）：列数改为显式 columns 优先（图1=4），未传时保持原判据（primary 10 列兜底，其余 2 列）。
  const columnCount = columns ?? (primary ? 10 : 2);
  const mixedMode = bulkMode === "mixed";
  const displayTitle = titleText || title;
  const displayHint = hintText || hint;

  useEffect(() => {
    window.addEventListener("dragover", preventFileDropNavigation);
    window.addEventListener("drop", preventFileDropNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileDropNavigation);
      window.removeEventListener("drop", preventFileDropNavigation);
    };
  }, []);

  function handleFiles(fileList) {
    const incoming = imageFilesFromList(fileList);
    const allowed = Math.max(0, maxCount - items.length);
    if (allowed <= 0) {
      onLimit?.(`最多上传 ${maxCount} 张`);
      return;
    }
    const files = incoming.slice(0, allowed);
    if (incoming.length > files.length) onLimit?.(`已保留前 ${maxCount} 张，超出的图片未加入`);
    if (files.length) onPick(files);
  }

  async function handleReplaceDrop(event, item) {
    if (isSortingDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setReplaceTargetId("");
    try {
      const files = await imageFilesFromDataTransfer(event.dataTransfer);
      const file = files.find(isImageFile);
      if (!file) {
        onLimit?.("没有读取到可替换的图片");
        return;
      }
      onReplace?.(item.id, file);
    } catch (error) {
      onLimit?.(`替换失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function isSortingDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes("application/x-jingyin-image-id");
  }

  function isLeavingElement(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = event;
    return clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom;
  }

  function markReplaceTarget(event, item) {
    if (isSortingDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setReplaceTargetId(item.id);
  }

  function beginPointerSort(event, item) {
    if (event.button !== 0 || items.length <= 1) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".thumbActions,.thumbImage")) return;
    pointerSortRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointerSort(event) {
    const sort = pointerSortRef.current;
    if (!sort) return;
    const deltaX = event.clientX - sort.startX;
    const deltaY = event.clientY - sort.startY;
    if (!sort.active && Math.hypot(deltaX, deltaY) < 8) return;

    sort.active = true;
    setDraggingImageId(sort.id);
    event.preventDefault();
    event.stopPropagation();

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const card = target?.closest?.(".thumbCard[data-image-id]");
    const targetId = card?.dataset?.imageId;
    if (!card || !targetId || targetId === sort.id) {
      sort.target = null;
      setDropTarget(null);
      return;
    }

    const rect = card.getBoundingClientRect();
    const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    sort.target = { id: targetId, placement };
    setDropTarget(sort.target);
  }

  function endPointerSort(event) {
    const sort = pointerSortRef.current;
    if (!sort) return;
    if (sort.active) {
      event.preventDefault();
      event.stopPropagation();
      if (sort.target) onReorder?.(sort.id, sort.target.id, sort.target.placement);
      suppressOpenRef.current = true;
      window.setTimeout(() => {
        suppressOpenRef.current = false;
      }, 150);
    }
    pointerSortRef.current = null;
    setDraggingImageId("");
    setDropTarget(null);
  }

  function cancelPointerSort() {
    pointerSortRef.current = null;
    setDraggingImageId("");
    setDropTarget(null);
  }

  function openLocalEdit(item) {
    if (suppressOpenRef.current) return;
    onOpenLocalEdit?.(item);
  }

  return (
    <section
      tabIndex={0}
      className={`uploadZone ${compact ? "compact" : ""} ${primary ? "primary" : ""} ${sideControls ? "hasSideControls" : ""} ${dragging ? "dragging" : ""}`}
      style={{ "--upload-columns": columnCount }}
      onFocus={onActivate}
      onPointerDown={onActivate}
      onDragOver={(event) => {
        if (isSortingDrag(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (isLeavingElement(event)) setDragging(false);
      }}
      onDrop={async (event) => {
        if (isSortingDrag(event)) return;
        event.preventDefault();
        setDragging(false);
        try {
          const files = await imageFilesFromDataTransfer(event.dataTransfer);
          handleFiles(files);
        } catch (error) {
          onLimit?.(`文件夹读取失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }}
      onPaste={(event) => {
        const pastedImages = imageFilesFromClipboard(event.clipboardData);
        if (pastedImages.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        handleFiles(pastedImages);
      }}
    >
      <header>
        <div>
          {slotPrefix ? (
            <h3 className="uploadTitleLine">
              <span className="uploadSlotPrefix">{slotPrefix}</span>
              <button className="uploadEditableText" type="button" onDoubleClick={onEditTitle} title="双击修改">
                {displayTitle}
              </button>
            </h3>
          ) : (
            <h3>{displayTitle}</h3>
          )}
          {onEditHint ? (
            <button className="uploadEditableHint" type="button" onDoubleClick={onEditHint} title="双击修改">
              {displayHint} · {items.length}/{maxCount}
            </button>
          ) : (
            <span>{displayHint} · {items.length}/{maxCount}</span>
          )}
        </div>
        <div className="uploadHeaderActions">
          {/* V77（用户要求·停用）：上传按钮移除（空态点击/拖入仍走 inputRef 链，有图后靠拖入 + 单张替换）；
              右上角仅保留清除钮。 */}
          <UploadClearButton onClick={onClear} disabled={!onClear || items.length === 0} />
        </div>
      </header>
      <div className="uploadZoneBody">
        <div className="thumbGrid">
          {items.map((item, index) => {
            const placement = dropTarget?.id === item.id ? dropTarget.placement : "";
            const thumbPreviewUrl = imageItemPreviewSource(item);
            return (
            <article
              className={`thumbCard ${items.length > 1 ? "sortable" : ""} ${!item.selected ? "muted" : ""} ${fixedId === item.id ? "fixed" : ""} ${item.localEdit ? "localEditReady" : ""} ${draggingImageId === item.id ? "sorting" : ""} ${replaceTargetId === item.id ? "replaceTarget" : ""} ${placement === "before" ? "dropBefore" : ""} ${placement === "after" ? "dropAfter" : ""}`}
              data-image-id={item.id}
              key={item.id}
              onPointerDown={(event) => beginPointerSort(event, item)}
              onPointerMove={movePointerSort}
              onPointerUp={endPointerSort}
              onPointerCancel={cancelPointerSort}
              onDragEnter={(event) => markReplaceTarget(event, item)}
              onDragOver={(event) => markReplaceTarget(event, item)}
              onDragLeave={(event) => {
                if (isLeavingElement(event)) setReplaceTargetId("");
              }}
              onDrop={(event) => void handleReplaceDrop(event, item)}
            >
              <button className={`thumbImage mode-${item.mode || "pad"}`} type="button" onClick={() => onPreview?.({ ...item, previewUrl: thumbPreviewUrl })}>
                <img src={thumbPreviewUrl} alt="" draggable={false} onLoad={(event) => rememberThumbSize(item.id, event.currentTarget)} />
                <i>{index + 1}</i>
                <em>{item.mode === "crop" ? "裁" : item.mode === "soft" ? "柔" : item.mode === "original" ? "原" : "白"}</em>
                {items.length > 1 && <span className="dragHandle" title="拖拽调整顺序"><Move size={13} /></span>}
              </button>
              <div className="thumbMeta">
                <strong title={item.name}>{item.name}</strong>
                <span>
                  {item.mode === "crop" ? "手动裁剪" : item.mode === "soft" ? "柔和补边" : item.mode === "original" ? "原图" : "白底补边"} · {fileSize(item.file.size)}
                  {item.localEdit?.cropRect
                    ? ` · 局部 ${formatPixelSize(item.localEdit.cropRect.width, item.localEdit.cropRect.height)} · 底图 ${formatPixelSize(item.localEdit.sourceWidth, item.localEdit.sourceHeight)}`
                    : thumbSizeRef.current.get(item.id)
                      ? ` · 上传 ${formatPixelSize(thumbSizeRef.current.get(item.id).width, thumbSizeRef.current.get(item.id).height)}`
                      : ""}
                </span>
              </div>
              <div className="thumbActions">
                <button type="button" onClick={() => onToggle(item.id)} title="参与本次批量">
                  {item.selected ? <Check size={12} /> : <X size={12} />}
                </button>
                {onSetFixed && (
                  <button type="button" onClick={() => onSetFixed(item.id)} title={fixedTitle}>
                    <Lock size={12} />
                  </button>
                )}
                <button type="button" onClick={() => onOpenCrop(item)} title="裁剪/补边">
                  <Crop size={12} />
                </button>
                {localEditEnabled && (
                  <button
                    className={item.localEdit ? "active" : ""}
                    type="button"
                    onClick={() => openLocalEdit(item)}
                    title={item.localEdit ? "重新调整局部回贴" : "局部回贴"}
                  >
                    <Scissors size={12} />
                  </button>
                )}
                <button type="button" onClick={() => onRemove(item.id)} title="删除">
                  <Trash2 size={12} />
                </button>
              </div>
            </article>
            );
          })}
          {items.length === 0 && (
            <button className="emptyUpload" type="button" onClick={() => inputRef.current?.click()}>
              <Images size={24} />
              <span>拖入图片或点击上传</span>
            </button>
          )}
        </div>
        {sideControls && <div className="uploadZoneSideControls">{sideControls}</div>}
      </div>
      {/* V77（用户要求·停用）：「统一处理」select 与「新上传默认：…」说明停用；
          bulkMode/onBulkModeChange props 与 applyGroupPreprocess handler 按 Park 纪律保留，
          恢复时传回 bulkMode/onBulkModeChange 并还原本段。改色范围 footerControls 保留不动。 */}
      {footerControls && (
        <div className={`uploadZoneFooter ${mixedMode ? "mixed" : ""}`}>
          <div className="uploadZoneFooterControls">{footerControls}</div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={acceptMultiple}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </section>
  );
}
export function CropModal({
  item,
  ratio,
  onRatioChange = null,
  ratioOptions = null,
  ratioLabel = "输出比例",
  onClose,
  onApply,
  processor = processImageFile,
  initialMode = null,
  title = "裁剪 / 比例整理",
  subtitle = null,
  footerText = null,
  modeOptions = null,
  collectOnly = false,
  onCollectCrop = null
}) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [mode, setMode] = useState(initialMode || modeOptions?.[0]?.[0] || "crop");
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [localRatio, setLocalRatio] = useState(ratio);
  const [working, setWorking] = useState(false);

  const ratioChoices = Array.isArray(ratioOptions)
    ? ratioOptions.filter((itemRatio) => typeof itemRatio === "string" && itemRatio.trim())
    : [];
  const activeRatio = ratioChoices.includes(localRatio) ? localRatio : ratio;
  const ratioValue = ratioParts(activeRatio).value;

  function minCropScale() {
    const frame = stageRef.current?.getBoundingClientRect();
    if (!frame?.width || !frame?.height || !imageSize.width || !imageSize.height) return 1;
    const containScale = Math.min(frame.width / imageSize.width, frame.height / imageSize.height);
    const coverScale = Math.max(frame.width / imageSize.width, frame.height / imageSize.height);
    return Math.max(1, coverScale / containScale);
  }

  function resetCropTransform() {
    if (mode !== "crop") return;
    setTransform({ x: 0, y: 0, scale: minCropScale() });
  }

  useEffect(() => {
    if (mode !== "crop") return undefined;
    const frame = window.requestAnimationFrame(resetCropTransform);
    return () => window.cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize.height, imageSize.width, item?.id, mode, activeRatio]);

  useEffect(() => {
    setLocalRatio(ratio);
  }, [item?.id, ratio]);

  function changeLocalRatio(nextRatio) {
    if (!ratioChoices.includes(nextRatio)) return;
    setLocalRatio(nextRatio);
    onRatioChange?.(nextRatio);
  }

  function onPointerDown(event) {
    if (mode !== "crop") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, start: transform };
  }

  function onPointerMove(event) {
    if (!dragRef.current || mode !== "crop") return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    setTransform(clampCropTransform({
      ...dragRef.current.start,
      x: dragRef.current.start.x + deltaX,
      y: dragRef.current.start.y + deltaY
    }, {
      frame: stageRef.current?.getBoundingClientRect(),
      imageSize,
      minScale: minCropScale(),
      enabled: mode === "crop"
    }));
  }

  function onWheel(event) {
    if (mode !== "crop") return;
    event.preventDefault();
    setTransform((current) => clampCropTransform({
      ...current,
      scale: Math.max(0.2, Math.min(4, current.scale + (event.deltaY > 0 ? -0.08 : 0.08)))
    }, {
      frame: stageRef.current?.getBoundingClientRect(),
      imageSize,
      minScale: minCropScale(),
      enabled: mode === "crop"
    }));
  }

  async function confirm() {
    setWorking(true);
    try {
      let crop = null;
      if (mode === "crop") {
        const stage = stageRef.current;
        const frame = stage?.getBoundingClientRect();
        crop = {
          x: transform.x,
          y: transform.y,
          scale: transform.scale,
          stageWidth: frame?.width,
          stageHeight: frame?.height
        };
      }
      if (collectOnly) {
        onCollectCrop?.(crop, mode);
        return;
      }
      const processed = await processor(item.originalFile, activeRatio, mode, crop);
      const nextFile = processed?.file instanceof File ? processed.file : processed;
      const nextUrl = URL.createObjectURL(nextFile);
      onApply({
        ...item,
        file: nextFile,
        previewUrl: nextUrl,
        mode,
        cropReturn: normalizeCropReturnMeta(processed?.cropReturn)
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal layerClassName="modalLayer" panelClassName="cropModal" onClose={onClose}>
      <ModalHeader
        title={title}
        subtitle={subtitle || `${item.name} · 输出 ${activeRatio}`}
        onClose={onClose}
      />
        <div className="cropModeTabs">
          {(modeOptions || [
            ["crop", "手动裁剪"],
            ["pad", "白底补边"],
            ["soft", "柔和补边"],
            ["original", "原图"]
          ]).map(([value, label]) => (
            <button className={mode === value ? "active" : ""} key={value} type="button" onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
        {ratioChoices.length > 0 && (
          <div className="cropRatioPresetGroup" role="group" aria-label={ratioLabel}>
            {ratioChoices.map((itemRatio) => (
              <button
                className={activeRatio === itemRatio ? "active" : ""}
                key={itemRatio}
                type="button"
                onClick={() => changeLocalRatio(itemRatio)}
              >
                {itemRatio}
              </button>
            ))}
          </div>
        )}
        <div className="cropPreviewWrap">
          <div
            className={`cropStage ${mode === "crop" ? "interactive" : ""}`}
            ref={stageRef}
            style={{ aspectRatio: `${ratioValue}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => { dragRef.current = null; }}
            onWheel={onWheel}
          >
            <img
              src={item.originalUrl}
              alt=""
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth || 0,
                  height: event.currentTarget.naturalHeight || 0
                });
              }}
              style={mode === "crop" ? {
                transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})`
              } : undefined}
            />
          </div>
        </div>
        <footer>
          <span>{footerText || (mode === "crop" ? "默认显示完整原图，拖动画面选择区域，滚轮缩放后再应用。" : "确认后会在本地生成整理后的参考图。")}</span>
          <div>
            <Button size="md" type="button" onClick={onClose}>取消</Button>
            <Button size="md" tone="primary" type="button" onClick={confirm} disabled={working}>
              {working ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              <span>应用</span>
            </Button>
          </div>
        </footer>
    </Modal>
  );
}
export function resizeSettingsFingerprint(settings, cropSignature = "") {
  const normalized = normalizeResizeSettings(settings);
  return [
    normalized.ratio,
    resolveResizeLongEdge(normalized),
    normalized.fitMode,
    normalized.outputFormat,
    normalized.dpi,
    normalized.fillColor,
    normalized.cropMode,
    cropSignature
  ].join("|");
}
export function BatchResizePanel({
  saveDirectory,
  onChooseDirectory,
  onOpenSaveDirectory,
  onSaveImage,
  onAddEvent
}) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(readResizeSettings);
  const [longEdgeDraft, setLongEdgeDraft] = useState(() => String(settings.longEdge));
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [cropTarget, setCropTarget] = useState(null);
  const [batchCropTarget, setBatchCropTarget] = useState(null);
  const [batchCropTemplate, setBatchCropTemplate] = useState(() => readJsonStorage(RESIZE_BATCH_CROP_KEY, null));

  const isOriginalSizeMode = settings.fitMode === "original-size";
  const isOriginalRatioMode = settings.fitMode === "original";
  const fixedOutputRatioMode = settings.fitMode === "pad" || settings.fitMode === "crop";
  const targetSize = isOriginalSizeMode || isOriginalRatioMode ? null : outputSizeForRatio(settings.ratio, resolveResizeLongEdge(settings));
  const batchCropSignature = useMemo(() => JSON.stringify(batchCropTemplate || null), [batchCropTemplate]);
  const currentSettingsKey = resizeSettingsFingerprint(settings, batchCropSignature);

  useEffect(() => {
    writeJsonStorage(RESIZE_SETTINGS_KEY, settings);
  }, [settings]);

  useEffect(() => {
    setLongEdgeDraft(String(settings.longEdge));
  }, [settings.longEdge]);

  useEffect(() => {
    if (batchCropTemplate) {
      writeJsonStorage(RESIZE_BATCH_CROP_KEY, batchCropTemplate);
    } else {
      removeStorageItem(RESIZE_BATCH_CROP_KEY);
    }
  }, [batchCropTemplate]);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  function updateResizeSetting(key, value) {
    setSettings((current) => normalizeResizeSettings({ ...current, [key]: value }));
  }

  function updateResolution(value) {
    const edge = RESIZE_RESOLUTION_MAP[value] || settings.longEdge;
    setSettings((current) => normalizeResizeSettings({
      ...current,
      resolution: value,
      longEdge: value === "custom" ? current.longEdge : edge
    }));
  }

  function changeLongEdgeDraft(value) {
    const cleaned = String(value || "").replace(/[^\d]/g, "").slice(0, 4);
    setLongEdgeDraft(cleaned);
    const number = Number.parseInt(cleaned, 10);
    if (Number.isFinite(number) && number >= 256 && number <= 8192) {
      setSettings((current) => normalizeResizeSettings({
        ...current,
        longEdge: number,
        resolution: "custom"
      }));
    } else {
      setSettings((current) => current.resolution === "custom" ? current : { ...current, resolution: "custom" });
    }
  }

  function commitLongEdgeDraft() {
    const number = Number.parseInt(longEdgeDraft, 10);
    const longEdge = clampResizeEdge(number);
    setSettings((current) => normalizeResizeSettings({
      ...current,
      longEdge,
      resolution: "custom"
    }));
    setLongEdgeDraft(String(longEdge));
  }

  function revokeResizeItem(item) {
    const urls = new Set([item?.originalUrl, item?.previewUrl].filter(Boolean));
    urls.forEach((url) => URL.revokeObjectURL(url));
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || [])
      .filter(isImageFile)
      .sort((a, b) => String(a.webkitRelativePath || a.name).localeCompare(String(b.webkitRelativePath || b.name), "zh-CN", { numeric: true }));

    if (!files.length) {
      setStatus("没有读取到图片文件");
      return;
    }

    const nextItems = files.map((file) => {
      const url = URL.createObjectURL(file);
      return {
        id: makeId("resize"),
        name: file.webkitRelativePath || file.name,
        originalFile: file,
        file,
        originalUrl: url,
        previewUrl: url,
        mode: "original",
        customized: false,
        settingsKey: "",
        createdAt: Date.now()
      };
    });

    setItems((current) => [...current, ...nextItems]);
    setStatus(`已导入 ${nextItems.length} 张图片`);
    onAddEvent?.("批量尺寸导出", `已导入 ${nextItems.length} 张图片`);
  }

  function removeItem(id) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      revokeResizeItem(target);
      return current.filter((item) => item.id !== id);
    });
  }

  function clearItems() {
    setItems((current) => {
      current.forEach(revokeResizeItem);
      return [];
    });
    setStatus("已清空待处理图片");
  }

  function openBatchCropEditor() {
    if (!items.length) {
      setStatus("请先导入图片，再设置批量裁剪区域");
      return;
    }
    setBatchCropTarget({
      ...items[0],
      mode: "crop"
    });
  }

  function applyBatchCropTemplate(crop) {
    if (!crop) {
      setStatus("没有读取到有效裁剪区域，请重新设置");
      setBatchCropTarget(null);
      return;
    }
    setBatchCropTemplate(crop);
    setBatchCropTarget(null);
    setStatus("已设置批量裁剪区域，导出时会按这个区域处理未单独裁剪的图片");
    onAddEvent?.("批量尺寸导出", "已设置统一裁剪区域");
  }

  function clearBatchCropTemplate() {
    setBatchCropTemplate(null);
    setStatus("已清除批量裁剪区域，将恢复默认中心裁剪");
  }

  function applyCropItem(item) {
    setItems((current) => current.map((currentItem) => {
      if (currentItem.id !== item.id) return currentItem;
      if (currentItem.previewUrl && currentItem.previewUrl !== currentItem.originalUrl) URL.revokeObjectURL(currentItem.previewUrl);
      return {
        ...currentItem,
        file: item.file,
        previewUrl: item.previewUrl,
        mode: item.mode,
        customized: true,
        settingsKey: currentSettingsKey
      };
    }));
    setCropTarget(null);
  }

  async function exportItems() {
    if (working) return;
    if (!items.length) {
      setStatus("请先导入需要改尺寸的图片");
      return;
    }
    if (!saveDirectory) {
      setStatus("请先指定保存文件夹");
      onChooseDirectory?.();
      return;
    }

    setWorking(true);
    let finished = 0;
    try {
      for (const item of items) {
        setStatus(`正在导出 ${finished + 1}/${items.length}`);
        const useCustom = !["original-size", "original"].includes(settings.fitMode) && item.customized && item.settingsKey === currentSettingsKey;
        const sharedCrop = settings.fitMode === "crop" && settings.cropMode === "batch" ? batchCropTemplate : null;
        const file = useCustom
          ? item.file
          : await resizeImageFile(item.originalFile, settings, sharedCrop);
        await onSaveImage(file, RESIZE_OUTPUT_FOLDER);
        finished += 1;
      }
      setStatus(`已导出 ${finished} 张到「${RESIZE_OUTPUT_FOLDER}」`);
      onAddEvent?.("批量尺寸导出", `已导出 ${finished} 张`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`导出失败：${message}`);
      onAddEvent?.("批量尺寸导出失败", message);
    } finally {
      setWorking(false);
    }
  }

  function openCropEditor(item) {
    setCropTarget({
      ...item,
      mode: "crop"
    });
  }

  return (
    <section
      className={`batchResizePanel ${dragging ? "dragging" : ""}`}
      id="batch-resize-section"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setDragging(false);
        try {
          addFiles(await imageFilesFromDataTransfer(event.dataTransfer));
        } catch (error) {
          setStatus(`文件夹读取失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }}
      onPaste={(event) => {
        const pastedImages = imageFilesFromClipboard(event.clipboardData);
        if (!pastedImages.length) return;
        event.preventDefault();
        event.stopPropagation();
        addFiles(pastedImages);
      }}
    >
      <ModuleHeader
        title="批量尺寸导出"
        subtitle="本地批量改尺寸和转格式，不消费 API；默认 JPG、最长边 3500、72DPI，导出到「{RESIZE_OUTPUT_FOLDER}」。"
        action={<div className="batchResizeActions">
          <Button size="sm" type="button" onClick={() => folderInputRef.current?.click()}>
            <FolderOpen size={15} />
            <span>选择文件夹</span>
          </Button>
          <Button size="sm" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            <span>选择图片</span>
          </Button>
          <Button size="sm" type="button" onClick={onChooseDirectory}>
            <FolderOpen size={15} />
            <span>指定文件夹</span>
          </Button>
          <Button size="sm" type="button" onClick={onOpenSaveDirectory}>
            <FolderOpen size={15} />
            <span>打开目录</span>
          </Button>
          <Button size="md" tone="primary" type="button" onClick={exportItems} disabled={working || items.length === 0}>
            {working ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
            <span>{working ? "导出中" : "导出"}</span>
          </Button>
          <UploadClearButton onClick={clearItems} disabled={items.length === 0} />
        </div>}
      />

      <div className="resizeControlGrid">
        {!isOriginalSizeMode && (
          <>
            <label className="field">
              <span>尺寸档</span>
              <select value={settings.resolution} onChange={(event) => updateResolution(event.target.value)}>
                {RESIZE_RESOLUTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>最长边(px)</span>
              <input
                type="number"
                min="256"
                max="8192"
                step="64"
                value={longEdgeDraft}
                onChange={(event) => changeLongEdgeDraft(event.target.value)}
                onBlur={commitLongEdgeDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
            <label className="field">
              <span>导出格式</span>
              <select value={settings.outputFormat} onChange={(event) => updateResizeSetting("outputFormat", event.target.value)}>
                {RESIZE_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>DPI</span>
              <input
                type="number"
                min="1"
                max="1200"
                step="1"
                value={settings.dpi}
                onChange={(event) => updateResizeSetting("dpi", event.target.value)}
              />
            </label>
            <label className={`field ${fixedOutputRatioMode ? "" : "muted"}`}>
              <span>输出比例</span>
              <select
                value={settings.ratio}
                onChange={(event) => updateResizeSetting("ratio", event.target.value)}
                disabled={!fixedOutputRatioMode}
                title={fixedOutputRatioMode ? "固定画幅输出比例" : "原图等比缩放时不使用输出比例"}
              >
                {BATCH_RATIO_OPTIONS.map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="resizeSegment">
          <span>适配方式</span>
          <div>
            <button className={settings.fitMode === "original" ? "active" : ""} type="button" onClick={() => updateResizeSetting("fitMode", "original")}>原图</button>
            <button className={settings.fitMode === "pad" ? "active" : ""} type="button" onClick={() => updateResizeSetting("fitMode", "pad")}>补边</button>
            <button className={settings.fitMode === "crop" ? "active" : ""} type="button" onClick={() => updateResizeSetting("fitMode", "crop")}>裁剪</button>
          </div>
        </div>
        {!isOriginalSizeMode && !isOriginalRatioMode && (
          <>
            <div className={`resizeSwatches ${settings.fitMode !== "pad" ? "muted" : ""}`}>
              <span>填充色</span>
              <div>
                {RESIZE_FILL_OPTIONS.map((option) => (
                  <button
                    className={settings.fillColor === option.value ? "active" : ""}
                    key={option.value}
                    style={{ "--swatch": option.value }}
                    type="button"
                    disabled={settings.fitMode !== "pad"}
                    onClick={() => updateResizeSetting("fillColor", option.value)}
                    title={option.label}
                  >
                    <i />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={`resizeSegment ${settings.fitMode !== "crop" ? "muted" : ""}`}>
              <span>裁剪方式</span>
              <div>
                <button className={settings.cropMode === "batch" ? "active" : ""} type="button" onClick={() => updateResizeSetting("cropMode", "batch")} disabled={settings.fitMode !== "crop"}>批量裁剪</button>
                <button className={settings.cropMode === "individual" ? "active" : ""} type="button" onClick={() => updateResizeSetting("cropMode", "individual")} disabled={settings.fitMode !== "crop"}>每张裁剪</button>
              </div>
            </div>
            <div className={`resizeCropTemplate ${settings.fitMode !== "crop" || settings.cropMode !== "batch" ? "muted" : ""}`}>
              <span>批量裁剪区域</span>
              <div>
                <button
                  type="button"
                  disabled={settings.fitMode !== "crop" || settings.cropMode !== "batch" || items.length === 0}
                  onClick={openBatchCropEditor}
                >
                  <Crop size={14} />
                  <span>{batchCropTemplate ? "重新设置" : "设置区域"}</span>
                </button>
                <button
                  type="button"
                  disabled={!batchCropTemplate || settings.fitMode !== "crop" || settings.cropMode !== "batch"}
                  onClick={clearBatchCropTemplate}
                >
                  <X size={14} />
                  <span>清除</span>
                </button>
              </div>
              <small>{batchCropTemplate ? "已设置：未单独裁剪的图片会沿用这个区域" : "未设置时默认中心裁剪"}</small>
            </div>
          </>
        )}
        <div className="resizeSummary">
          <strong>{isOriginalSizeMode ? `原像素 ${settings.dpi}DPI` : isOriginalRatioMode ? `原图比例 · 最长边 ${resolveResizeLongEdge(settings)}` : `${targetSize.width} × ${targetSize.height}`}</strong>
          <span>{isOriginalSizeMode ? "像素不改，只重写 DPI" : isOriginalRatioMode ? `${settings.outputFormat.toUpperCase()} · ${settings.dpi}DPI · 等比缩放` : `${settings.outputFormat.toUpperCase()} · 当前导出尺寸`}</span>
        </div>
      </div>

      <div className="resizeDropHint">
        <Images size={24} />
        <span>拖入批量图片，或使用上方“选择文件夹”读取整文件夹图片。</span>
        <em>{saveDirectory ? `指定文件夹：${saveDirectory}` : "尚未指定保存文件夹"} · {RESIZE_OUTPUT_FOLDER}</em>
      </div>

      <div className="resizeImageGrid">
        {items.map((item, index) => {
          const freshCustom = item.customized && item.settingsKey === currentSettingsKey;
          const canEditIndividually = settings.fitMode === "crop" && settings.cropMode === "individual";
          return (
            <article className={`resizeImageCard ${freshCustom ? "customized" : ""}`} key={item.id}>
              <div
                className="resizeThumb"
                role={canEditIndividually ? "button" : undefined}
                tabIndex={canEditIndividually ? 0 : undefined}
                onClick={() => canEditIndividually && openCropEditor(item)}
                onKeyDown={(event) => {
                  if (canEditIndividually && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    openCropEditor(item);
                  }
                }}
              >
                <img src={item.previewUrl} alt="" draggable={false} />
                <i>{index + 1}</i>
              </div>
              <div className="resizeMeta">
                <strong title={item.name}>{item.name}</strong>
                <span>{fileSize(item.originalFile.size)} · {freshCustom ? "已单张调整" : settings.fitMode === "original-size" ? `原像素 ${settings.dpi}DPI` : settings.fitMode === "original" ? "原图等比缩放" : settings.fitMode === "crop" ? "中心裁剪" : "补边缩放"}</span>
              </div>
              <div className="resizeCardActions">
                <button
                  type="button"
                  onClick={() => openCropEditor(item)}
                  disabled={!canEditIndividually}
                  title="每张裁剪模式下可单独调整"
                >
                  <Crop size={14} />
                </button>
                <button type="button" onClick={() => removeItem(item.id)} title="删除">
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          );
        })}
        {items.length === 0 && (
          <button className="resizeEmpty" type="button" onClick={() => fileInputRef.current?.click()}>
            <Images size={28} />
            <span>还没有图片，点击选择图片或直接拖拽进来</span>
          </button>
        )}
      </div>

      <footer className="batchResizeFooter">
        <span>{status || `已导入 ${items.length} 张，目标文件夹：${RESIZE_OUTPUT_FOLDER}`}</span>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {batchCropTarget && (
        <CropModal
          item={batchCropTarget}
          ratio={settings.ratio}
          initialMode="crop"
          title="批量裁剪区域"
          subtitle={`${batchCropTarget.name} · ${targetSize.width} × ${targetSize.height}`}
          footerText="拖动画面选择统一裁剪区域，滚轮缩放；确认后会应用到批量裁剪模式下的未单独裁剪图片。"
          modeOptions={[["crop", "裁剪区域"]]}
          collectOnly
          onCollectCrop={applyBatchCropTemplate}
          onClose={() => setBatchCropTarget(null)}
          onApply={() => {}}
        />
      )}

      {cropTarget && (
        <CropModal
          item={cropTarget}
          ratio={settings.ratio}
          initialMode="crop"
          title="单张裁剪 / 尺寸导出"
          subtitle={`${cropTarget.name} · ${targetSize?.width || resolveResizeLongEdge(settings)} × ${targetSize?.height || "原图比例"}`}
          footerText="拖动画面选择裁剪位置，滚轮缩放；确认后只更新当前图片，不消费 API。"
          modeOptions={[["crop", "裁剪"], ["pad", "补边"]]}
          processor={(file, ratio, mode, crop) => resizeImageFile(file, { ...settings, ratio, fitMode: mode === "crop" ? "crop" : "pad" }, crop)}
          onClose={() => setCropTarget(null)}
          onApply={applyCropItem}
        />
      )}
    </section>
  );
}
export const QUICK_VIDEO_DEFAULTS = {
  model: "seedance-2.0",
  prompt: "",
  duration: 5,
  resolution: "720p",
  aspectRatio: "9:16",
  outputAudio: false,
  imageUrl: ""
};
export function quickVideoPromptPlaceholder(model = {}) {
  return String(model.promptPlaceholder || "输入视频画面、镜头运动、人物动作、服装展示和氛围要求").trim();
}
export function normalizeQuickVideoSettings(current = {}, model = {}) {
  const durations = videoDurationOptions(model);
  const resolutions = Array.isArray(model.resolutions) && model.resolutions.length ? model.resolutions : ["720p"];
  const ratios = Array.isArray(model.aspectRatios) && model.aspectRatios.length ? model.aspectRatios : ["9:16"];
  const defaultDuration = Number(model.defaultDuration || durations[0] || QUICK_VIDEO_DEFAULTS.duration);
  const requestedDuration = Number.parseInt(current.duration ?? defaultDuration, 10);
  return {
    ...current,
    model: model.value || current.model || QUICK_VIDEO_DEFAULTS.model,
    duration: durations.includes(requestedDuration) ? requestedDuration : defaultDuration,
    resolution: resolutions.includes(current.resolution) ? current.resolution : (model.defaultResolution || resolutions[0]),
    aspectRatio: ratios.includes(current.aspectRatio) ? current.aspectRatio : (model.defaultAspectRatio || ratios[0])
  };
}
export function WorkflowQuickVideoPanel({
  config,
  apiKey,
  onOpenSettings,
  onAddEvent
}) {
  const videoModels = useMemo(() => Array.isArray(config?.videoModels) && config.videoModels.length ? config?.videoModels : [], [config?.videoModels]);
  const [settings, setSettings] = useState(QUICK_VIDEO_DEFAULTS);
  const [referenceFile, setReferenceFile] = useState(null);
  const [results, setResults] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const activeModel = videoModels.find((model) => model.value === settings.model) || videoModels[0] || null;
  const ratios = activeModel?.aspectRatios?.length ? activeModel.aspectRatios : ["9:16", "16:9", "1:1"];
  const resolutions = activeModel?.resolutions?.length ? activeModel.resolutions : ["720p"];
  const durations = activeModel ? videoDurationOptions(activeModel) : [5];
  const promptHint = activeModel ? quickVideoPromptPlaceholder(activeModel) : "输入视频画面、镜头运动、人物动作、服装展示和氛围要求";
  const priceText = activeModel ? quickVideoPriceLabel(activeModel, settings.resolution) : "";
  const channelEnabled = Boolean(config?.videoPolicy?.enabled);
  const billingEnabled = Boolean(config?.billingGatewayPolicy?.enabled);
  const billingRequired = Boolean(config?.billingGatewayPolicy?.videoRequired);
  const referencePreview = useMemo(() => (
    referenceFile ? { file: referenceFile, url: URL.createObjectURL(referenceFile) } : null
  ), [referenceFile]);

  useEffect(() => {
    if (!videoModels.length) return;
    setSettings((current) => normalizeQuickVideoSettings(current, videoModels.find((item) => item.value === current.model) || videoModels[0]));
  }, [videoModels]);

  useEffect(() => () => {
    if (referencePreview?.url) URL.revokeObjectURL(referencePreview.url);
  }, [referencePreview]);

  function updateSetting(key, value) {
    setSettings((current) => {
      if (key === "model") {
        const model = videoModels.find((item) => item.value === value) || activeModel || videoModels[0] || {};
        return normalizeQuickVideoSettings({ ...current, model: value }, model);
      }
      if (key === "duration") return { ...current, duration: Number.parseInt(value, 10) || QUICK_VIDEO_DEFAULTS.duration };
      if (key === "outputAudio") return { ...current, outputAudio: Boolean(value) };
      return { ...current, [key]: value };
    });
  }

  function pickReference(event) {
    const file = Array.from(event.target.files || []).find(isImageFile);
    event.target.value = "";
    if (!file) return;
    if (file.size > VIDEO_REFERENCE_MAX_BYTES) {
      setError("参考图超过 10MB，请先压缩后再上传");
      onAddEvent?.("视频参考图", "参考图超过 10MB");
      return;
    }
    setReferenceFile(file);
    setError("");
    onAddEvent?.("视频参考图", `已添加 ${file.name}`);
  }

  async function referencePayload() {
    const url = String(settings.imageUrl || "").trim();
    if (url) return url;
    if (!referenceFile) return "";
    return dataUrlFromBlob(referenceFile);
  }

  async function waitVideoTask(initialTask, requestId, runSettings, startedAt) {
    let task = initialTask || {};
    if (!task.taskId && !task.id && !videoResultUrl(task)) {
      throw new Error("视频任务没有返回任务 ID");
    }
    // V53：页面不可见时降频（双倍间隔），切回前台立即补查一次。
    // 不停止轮询——视频任务结果还要收；只是不空转。
    let wakeDelay = null;
    let resumeRequested = false;
    const pollDelay = () => new Promise((resolve) => {
      if (resumeRequested) {
        resumeRequested = false;
        return resolve();
      }
      const interval = document.hidden ? VIDEO_STATUS_POLL_INTERVAL_MS * 2 : VIDEO_STATUS_POLL_INTERVAL_MS;
      const timer = setTimeout(() => { wakeDelay = null; resolve(); }, interval);
      wakeDelay = () => { clearTimeout(timer); wakeDelay = null; resolve(); };
    });
    let resumePoll = () => {
      if (wakeDelay) { const wake = wakeDelay; wakeDelay = null; wake(); } // 正睡着：立即唤醒当前等待（唤醒后该次 pollDelay 即导向查询）
      else { resumeRequested = true; } // 轮询间隙：标记下一次 pollDelay 立即返回（切回立即补查一次）
    };
    const onVisibilityChange = () => {
      if (!document.hidden) resumePoll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    try {
      for (let attempt = 0; attempt < VIDEO_STATUS_MAX_POLLS; attempt += 1) {
        if (isVideoTaskCompleted(task)) return task;
        if (isVideoTaskFailed(task)) throw new Error(task.error?.message || task.error || "视频生成失败");
        setTasks((current) => current.map((item) => item.id === requestId ? {
          ...item,
          statusText: videoTaskStatusText(task),
          progress: task.progress,
          elapsedMs: Date.now() - startedAt
        } : item));
        // V53：页面不可见时降频（双倍间隔），切回前台立即补查一次。
        await pollDelay();
        const previousTaskId = task.taskId || task.id;
        const payload = await getVideoStatus({
          apiKey,
          taskId: previousTaskId
        });
        const nextTask = payload.task || {};
        task = {
          ...nextTask,
          taskId: nextTask.taskId || nextTask.id || previousTaskId,
          id: nextTask.id || nextTask.taskId || previousTaskId
        };
      }
      throw new Error("视频生成等待超时，请稍后到上游任务记录中查看。");
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  }

  async function startVideoGeneration() {
    const normalizedApiKey = normalizeApiKeyInput(apiKey);
    const model = activeModel || videoModels[0];
    const runSettings = normalizeQuickVideoSettings(settings, model || {});
    const modelLabel = model?.label || runSettings.model || "Seedance";
    if (!normalizedApiKey) {
      setError("请先在设置里填写 API Key");
      setStatus("failed");
      onOpenSettings?.();
      onAddEvent?.("无法生成视频", "请先填写 API Key");
      return;
    }
    if (!videoModels.length) {
      setError("视频模型配置未加载");
      setStatus("failed");
      return;
    }
    if (!channelEnabled) {
      setError("视频通道未配置，请先配置兰兰达视频 KEY 或静音签发路由");
      setStatus("failed");
      onAddEvent?.("无法生成视频", "视频通道未配置");
      return;
    }
    if (billingRequired && !billingEnabled) {
      setError("视频计费网关未启用，请先接入静音中转站计费后再生成。");
      setStatus("failed");
      onAddEvent?.("无法生成视频", "视频计费网关未启用");
      return;
    }
    if (!String(runSettings.prompt || "").trim()) {
      setError("请输入视频提示词");
      setStatus("failed");
      return;
    }

    const requestId = `workflow_video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    setStatus("running");
    setError("");
    setTasks((current) => [...current, {
      id: requestId,
      startedAt,
      statusText: "提交中",
      modelLabel,
      resolution: runSettings.resolution,
      aspectRatio: runSettings.aspectRatio,
      duration: runSettings.duration,
      prompt: runSettings.prompt
    }]);
    onAddEvent?.("视频提交", `${modelLabel} / ${runSettings.resolution} / ${runSettings.aspectRatio} / ${runSettings.duration}s`);

    try {
      const image = await referencePayload();
      const payload = await generateVideo({
        apiKey: normalizedApiKey,
        model: runSettings.model,
        prompt: runSettings.prompt,
        duration: runSettings.duration,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        image,
        outputAudio: runSettings.outputAudio,
        metadata: {
          source: "workflow-quick-video",
          clientSessionId: OUTFIT_SESSION_ID
        }
      });
      const finalTask = await waitVideoTask(payload.task || {}, requestId, runSettings, startedAt);
      const url = videoResultUrl(finalTask);
      if (!url) throw new Error("视频任务已完成，但没有返回视频地址");
      const totalMs = Date.now() - startedAt;
      setResults((current) => [{
        id: requestId,
        url,
        prompt: runSettings.prompt,
        modelLabel,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        duration: runSettings.duration,
        generationMs: totalMs,
        createdAt: Date.now()
      }, ...current]);
      setStatus("success");
      onAddEvent?.("视频完成", `生成 1 条视频，用时 ${formatMs(totalMs)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("failed");
      onAddEvent?.("视频失败", message);
    } finally {
      setTasks((current) => current.filter((item) => item.id !== requestId));
    }
  }

  function downloadVideo(item) {
    if (!item?.url) return;
    const link = document.createElement("a");
    link.href = item.url;
    link.download = `静音AI视频-${new Date(item.createdAt || Date.now()).toISOString().replace(/[:.]/g, "-")}.mp4`;
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAddEvent?.("视频下载", "已开始下载视频");
  }

  const statusText = tasks.length
    ? `视频生成中 ${tasks.length}`
    : status === "failed"
      ? error || "视频任务失败"
      : status === "success"
        ? "视频已完成"
        : "等待视频生成";

  return (
    <section className="workflowVideoPanel">
      <ModuleHeader
        title="快捷视频生成"
        subtitle="参考图、提示词和视频参数独立管理，不读取批量换装上传区。"
        action={<div className="moduleHeaderActions">
          <TaskBadge status={status === "running" || tasks.length ? "running" : status}>{statusText}</TaskBadge>
          <Button size="sm" type="button" onClick={() => results[0] && downloadVideo(results[0])} disabled={!results.length}>
            <Download size={15} />
            <span>下载最新</span>
          </Button>
          <Button size="sm" tone="danger" type="button" onClick={() => { setResults([]); setTasks([]); setStatus("idle"); setError(""); }} disabled={!results.length && !tasks.length}>
            <Trash2 size={15} />
            <span>清空视频</span>
          </Button>
        </div>}
      />

      <div className="workflowVideoLayout">
        <section className="workflowVideoResults">
          {tasks.map((task) => (
            <article className="workflowVideoCard loadingCard" key={task.id}>
              <Loader2 className="spin" size={28} />
              <span>{task.statusText || "视频生成中"}</span>
              <strong>{formatMs(Date.now() - task.startedAt)}</strong>
              <em>{task.modelLabel} · {task.resolution} · {task.aspectRatio} · {task.duration}s</em>
            </article>
          ))}
          {results.map((item) => (
            <article className="workflowVideoCard" key={item.id}>
              <button className="assetDownloadButton" type="button" onClick={() => downloadVideo(item)} title="下载视频" aria-label="下载视频">
                <Download size={16} />
              </button>
              {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
              <video src={item.url} controls preload="metadata" />
              <button className="assetPrompt" type="button" title={item.prompt} onClick={() => void navigator.clipboard?.writeText(item.prompt || "")}>
                {item.prompt}
              </button>
              <div className="assetMeta">
                <span>{item.modelLabel}</span>
                <strong>{item.resolution} · {item.aspectRatio} · {item.duration}s</strong>
              </div>
            </article>
          ))}
          {!tasks.length && !results.length && (
            <div className="workflowVideoEmpty">
              <Video size={34} />
              <span>{error || "暂无视频"}</span>
            </div>
          )}
        </section>

        <section className="workflowVideoComposer">
          {priceText && <span className="workflowVideoPriceBadge">{priceText}</span>}
          <div className="videoReferenceLine">
            <input ref={inputRef} type="file" accept="image/*" onChange={pickReference} />
            <button className="videoReferenceTile" type="button" onClick={() => inputRef.current?.click()}>
              {referencePreview ? (
                <>
                  <img src={referencePreview.url} alt={referencePreview.file.name} />
                  <span>{referencePreview.file.name}</span>
                </>
              ) : (
                <>
                  <Plus size={18} />
                  <span>参考图</span>
                </>
              )}
            </button>
            <input
              className="videoUrlInput"
              value={settings.imageUrl}
              onChange={(event) => updateSetting("imageUrl", event.target.value)}
              placeholder="图片参考 URL，可留空"
            />
            <UploadClearButton onClick={() => { setReferenceFile(null); updateSetting("imageUrl", ""); }} disabled={!referenceFile && !settings.imageUrl} />
          </div>

          <label className="composerField">
            <span>视频提示词</span>
            <textarea
              value={settings.prompt}
              onChange={(event) => updateSetting("prompt", event.target.value)}
              placeholder={promptHint}
            />
          </label>

          <div className="workflowVideoControls">
            <select value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
              {videoModels.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
            </select>
            <select value={settings.aspectRatio} onChange={(event) => updateSetting("aspectRatio", event.target.value)}>
              {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
            <select value={settings.resolution} onChange={(event) => updateSetting("resolution", event.target.value)}>
              {resolutions.map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
            </select>
            <select value={settings.duration} onChange={(event) => updateSetting("duration", event.target.value)}>
              {durations.map((duration) => <option key={duration} value={duration}>{duration}s</option>)}
            </select>
            <Button size="sm" active={settings.outputAudio} type="button" onClick={() => updateSetting("outputAudio", !settings.outputAudio)}>
              <Video size={15} />
              <span>{settings.outputAudio ? "音频开" : "音频关"}</span>
            </Button>
            {billingRequired && !billingEnabled && <span className="workflowVideoBadge">计费未接入</span>}
            <Button size="lg" tone="primary" type="button" onClick={() => void startVideoGeneration()} disabled={tasks.length > 0}>
              {tasks.length ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
              <span>生成视频</span>
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
export function PromptPresetGrid(props) {
  const {
    categories, activeCategory, onSelectCategory, dropCategory, onDropCategoryChange,
    search, onSearchChange, presets, draggedId, onApplyPreset, onRenamePreset,
    onRenameCategory, onDropPresetToCategory, onAddCategory, onCreatePreset,
    onBeginDrag, onEndDrag, onDropPresetToPreset, onEditPreset, onDeletePreset
  } = props;
  return (
    <>
      <div className="promptTabs">
        {categories.map((category) => (
          <Button
            size="sm"
            active={activeCategory === category}
            className={dropCategory === category ? "dropTarget" : ""}
            key={category}
            onClick={() => onSelectCategory(category)}
            onDoubleClick={(event) => {
              if (category === "全部") return;
              event.preventDefault();
              event.stopPropagation();
              onRenameCategory(category);
            }}
            onDragOver={(event) => {
              if (category === "全部") return;
              event.preventDefault();
              onDropCategoryChange(category);
            }}
            onDragLeave={() => onDropCategoryChange("")}
            onDrop={(event) => onDropPresetToCategory(event, category)}
          >
            {category}
          </Button>
        ))}
        <Button size="sm" className="promptCategoryAdd" onClick={onAddCategory} title="新建分类">
          <Plus size={13} />
          <span>新建</span>
        </Button>
      </div>
      <label className="promptSearch">
        <Search size={16} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索标题或内容..."
        />
      </label>
      <Button size="sm" className="promptNewCta" onClick={onCreatePreset}>
        <Plus size={15} />
        <span>新建提示词</span>
      </Button>
      <div className="promptPresetGrid">
        {presets.map((preset) => (
          <div
            className={`promptChip ${draggedId === preset.id ? "dragging" : ""}`}
            key={preset.id}
            draggable
            onDragStart={(event) => onBeginDrag(event, preset.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => onDropPresetToPreset(event, preset.id)}
            onDragEnd={onEndDrag}
          >
            <button
              className="promptChipMain"
              type="button"
              onClick={() => onApplyPreset(preset)}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRenamePreset(preset);
              }}
              title={preset.content}
            >
              {preset.title}
            </button>
            <button className="promptChipIcon" type="button" onClick={() => onEditPreset(preset)} title="编辑提示词">
              <Pencil size={14} />
            </button>
            <button className="promptChipIcon" type="button" onClick={() => onDeletePreset(preset)} title="删除">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {presets.length === 0 && <p className="promptEmpty">没有找到匹配的提示词</p>}
      </div>
    </>
  );
}

export function LocalPasteDiagnosticsPanel({ image }) {
  const summary = localPasteDiagnosticSummary(image);
  if (!summary) return null;
  return (
    <section className="previewLocalPastePanel">
      <ModuleHeader title={summary.title} />
      <div className="previewQualityFacts">
        {summary.items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}
export function CropReturnDiagnosticsPanel({ image }) {
  const summary = cropReturnDiagnosticSummary(image);
  if (!summary) return null;
  return (
    <section className="previewCropReturnPanel">
      <ModuleHeader title={summary.title} />
      <div className="previewQualityFacts">
        {summary.items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}
export function LegacyModulePanel({ title, subtitle, icon, children }) {
  return (
    <section className="legacyPanel">
      <ModuleHeader
        title={title}
        subtitle={subtitle}
        action={icon ? <div className="legacyPanelIcon">{icon}</div> : undefined}
      />
      {children}
    </section>
  );
}

export function localPasteDiagnosticSummary(image) {
  const diagnostics = image?.localEdit?.diagnostics;
  if (!diagnostics) return null;
  const align = diagnostics.align || {};
  const color = diagnostics.colorMatchDetail || {};
  const neutral = diagnostics.neutralToneMatchDetail || {};
  const paste = diagnostics.pasteRect || {};
  const binding = diagnostics.taskBinding || {};
  const sharpen = diagnostics.sharpen || {};
  const output = diagnostics.output || {};
  const items = [
    diagnostics.strategy ? `策略 ${diagnostics.strategy}` : "",
    binding.modelName ? `图1 ${binding.modelName}` : "",
    binding.batchMode ? `批量 ${binding.batchMode}` : "",
    Number.isFinite(binding.cropQuality) && binding.cropQuality > 0 ? `裁剪 Q${binding.cropQuality}` : "",
    output.lossless ? "输出 PNG无损" : output.quality ? `输出 Q${output.quality}` : "",
    diagnostics.autoAlign
      ? `对齐 ${align.applied ? `${align.dx || 0},${align.dy || 0}` : align.reason || "未偏移"}`
      : "对齐 关闭",
    diagnostics.colorMatch
      ? `色彩 ${color.applied ? `${color.deltaR ?? 0}/${color.deltaG ?? 0}/${color.deltaB ?? 0}` : color.reason || "未调整"}`
      : "色彩 关闭",
    diagnostics.neutralToneMatch
      ? `中性色偏 ${neutral.applied ? `${neutral.deltaR ?? 0}/${neutral.deltaG ?? 0}/${neutral.deltaB ?? 0}` : neutral.reason || "未调整"}`
      : "",
    diagnostics.sharpenPatch
      ? `清晰 ${sharpen.applied ? "补偿" : sharpen.reason || "未补偿"}`
      : "",
    Number.isFinite(diagnostics.feather) ? `羽化 ${diagnostics.feather}px` : "",
    paste.width && paste.height ? `贴回 ${paste.width}x${paste.height}` : ""
  ].filter(Boolean);
  if (!items.length) return null;
  return {
    title: diagnostics.hasMask ? "局部回贴诊断 · 蒙版" : "局部回贴诊断",
    items
  };
}
export function cropReturnDiagnosticSummary(image) {
  const cropReturn = normalizeCropReturnMeta(image?.cropReturn);
  if (!cropReturn?.cropRect) return null;
  const diagnostics = image?.cropReturn?.diagnostics || {};
  const output = diagnostics.output || {};
  const items = [
    diagnostics.strategy ? `策略 ${diagnostics.strategy}` : "",
    cropReturn.sourceWidth && cropReturn.sourceHeight ? `原图 ${cropReturn.sourceWidth}x${cropReturn.sourceHeight}` : "",
    cropReturn.cropRect.width && cropReturn.cropRect.height ? `裁剪 ${cropReturn.cropRect.width}x${cropReturn.cropRect.height}` : "",
    cropReturn.outputWidth && cropReturn.outputHeight ? `大图 ${cropReturn.outputWidth}x${cropReturn.outputHeight}` : "",
    diagnostics.generatedWidth && diagnostics.generatedHeight ? `生成 ${diagnostics.generatedWidth}x${diagnostics.generatedHeight}` : "",
    output.quality ? `输出 Q${output.quality}` : "",
    output.bytes ? `文件 ${fileSize(output.bytes)}` : ""
  ].filter(Boolean);
  if (!items.length) return null;
  return {
    title: "裁剪回流诊断",
    items
  };
}
