// 🔴 本文件是 outfit-workflow.jsx 的「单侧」抽取，不向 main.jsx 侧共享。
//    以下标识符与 main 侧同名/对位，已在 V11-RF-058 / RF-052 判为【真分叉，登记不搬】：
//      taskDragDownloadName      ↔ main resultDragDownloadName（字段优先级与序号规则不同）
//      canRerunTask              ↔ main 侧对位函数（判定字段不同）
//      canReplaceTaskResult      ↔ main canReplaceQuickResult
//      deleteResultTask          ↔ main deleteResult
//      clearAll / deleteSelected / flashDownloadFeedback（outfit 1100ms 无清理 vs main 1300ms 有清理）
//      handleResultReplaceDragOver / handleResultReplaceDrop（替换拖放，两侧数据模型 results[] vs tasks[]）
//    ⇒ 严禁把这些函数挪进 src/shared/** 或与 main 侧统一；统一 = 功能回退。
//    本文件只被 src/outfit-workflow.jsx 反向 import，绝不反向依赖 outfit-workflow.jsx（避免循环）。

import { formatGenerationError } from "../../shared/generation-errors.js";
import { cacheResultImageRequest, displayImageRequestUrl, fetchBlobWithTimeout } from "../../api/assets.js";
import { dataUrlFromBlob, dragDownloadDateStamp, padDragDownloadNumber } from "../../shared/result-image.js";
import { canvasToBlob } from "../../shared/canvas-blob.js";
import { imageBitmapFromFile } from "../../shared/image-input.js";
import { readJsonStorage, writeJsonStorage, removeStorageItem } from "../../lib/storage/json-storage.js";
import { resolveLocalEditBaseFile, cropLocalEditFile } from "../../shared/local-edit-geometry.js";
import { LOCAL_EDIT_RECT_MODE, LOCAL_EDIT_MASK_MODE } from "../../shared/local-edit-mask.js";

export const TASK_HISTORY_KEY = "jingyin-outfit-workflow-task-history-v1";
export const OUTFIT_LOCAL_DB_NAME = "jingyin-outfit-workflow-local-v1";
export const OUTFIT_LOCAL_STORE = "state";
export const OUTFIT_TASK_HISTORY_DB_KEY = "task-history";
export const OUTFIT_DRAFT_DB_KEY = "page-draft";
export const OUTFIT_RESULT_IMAGE_CACHE_PREFIX = "result-image-cache:";
export const OUTFIT_SESSION_ID = `outfit_session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
export const LEGACY_DETACHED_MESSAGE = "页面已刷新，结果请到保存目录确认";

export function taskStatusLabel(status) {
  if (status === "queued") return "等待";
  if (status === "running") return "生成中";
  if (status === "success") return "完成";
  if (status === "detached") return "待确认";
  if (status === "failed") return "失败";
  return status || "--";
}
export function taskRuntimeStageLabel(task) {
  const stage = String(task?.runtimeStage || "").trim();
  const detail = String(task?.runtimeDetail || "").trim();
  if (!stage && !detail) return "";
  return [stage, detail].filter(Boolean).join("：");
}
export function hasGenerationPendingStatus(task) {
  return task?.status === "running" || task?.status === "queued";
}
export function isRefreshInterruptedTask(task) {
  const text = [task?.error, task?.errorDetail].filter(Boolean).join("\n");
  return /页面刷新后任务已中断|页面刷新会中断当前浏览器里的批量生成 worker/.test(text);
}
export function detachedTaskMessage(task, reason) {
  const byPageSwitch = reason === "page-switch";
  const savedPath = String(task?.savedPath || "").trim();
  return {
    error: byPageSwitch ? "切换页面时这一轮还没返回结果" : "整页刷新中断了这一轮生成",
    errorDetail: savedPath
      ? `这不是模型失败。这张结果已经保存到：${savedPath}`
      : byPageSwitch
        // 实测：切页面只是卸载组件，生成请求与"返回后自动保存"这段闭包还会继续跑完，
        // 所以图片**可能已经落盘**，只是页面这边不再更新。这里如实说明，不承诺也不否认。
        ? "切页面后这一轮的响应不再回写到本页。若上游已经返回，图片会照常自动保存到指定文件夹（可到保存目录确认）；也可以点“重试”重新生成。"
        : "整页刷新会断开浏览器与本轮生成的连接，结果没有回传到页面，也没有自动保存。可以点“重试”重新生成。",
    runtimeStage: byPageSwitch ? "切换页面后待恢复" : "刷新后待确认"
  };
}
export function refreshDetachedTaskMessage(task, options = {}) {
  if (task?.status !== "detached") return task;
  const text = `${task.error || ""}\n${task.errorDetail || ""}`;
  if (!text.includes(LEGACY_DETACHED_MESSAGE)) return task;
  return { ...task, ...detachedTaskMessage(task, options.detachReason) };
}
export function detachPersistedTask(task, reason = "reload") {
  const finishedAt = Date.now();
  const startedAt = Number(task.startedAt || task.createdAt || finishedAt);
  return {
    ...task,
    status: "detached",
    ...detachedTaskMessage(task, reason),
    runtimeDetail: task.runtimeStage ? `中断前：${taskRuntimeStageLabel(task)}` : "原任务可能仍在后台或上游继续完成",
    runtimeUpdatedAt: finishedAt,
    timingMs: Math.max(1, finishedAt - startedAt),
    finishedAt,
    autoSaveFailed: false
  };
}
export function isLiveGenerationTask(task) {
  return hasGenerationPendingStatus(task) && task?.sessionId === OUTFIT_SESSION_ID;
}
export function taskDurationMs(task, now = Date.now()) {
  if (Number.isFinite(task?.timingMs) && task.timingMs > 0) return task.timingMs;
  const startedAt = Number(task?.startedAt || 0);
  const finishedAt = Number(task?.finishedAt || 0);
  if (startedAt > 0 && finishedAt > 0) return Math.max(0, finishedAt - startedAt);
  if (startedAt > 0 && isLiveGenerationTask(task)) return Math.max(0, now - startedAt);
  if (Number(task?.createdAt) > 0 && finishedAt > 0) return Math.max(0, finishedAt - Number(task.createdAt));
  return null;
}
export function taskHasCropReturnResult(task) {
  return Boolean(task?.cropReturn?.cropRect || task?.result?.cropReturn?.enabled);
}
export function normalizeQualityCheck(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value ?? "false").trim().toLowerCase();
  return ["1", "true", "on", "quality", "qc", "质检", "开启"].includes(text);
}
export function normalizeQualityCheckResult(value) {
  if (!value || typeof value !== "object") return null;
  const statusText = String(value.status || "").trim().toLowerCase();
  const status = ["pending", "checking", "passed", "failed", "error", "skipped"].includes(statusText)
    ? statusText
    : value.pass === true
      ? "passed"
      : value.pass === false
        ? "failed"
        : "pending";
  const scoreRaw = Number(value.score);
  const score = Number.isFinite(scoreRaw) ? Math.max(0, Math.min(100, Math.round(scoreRaw))) : null;
  const issues = Array.isArray(value.issues)
    ? value.issues.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  return {
    status,
    pass: typeof value.pass === "boolean" ? value.pass : status === "passed" ? true : status === "failed" ? false : null,
    score,
    summary: String(value.summary || "").trim().slice(0, 220),
    issues,
    repairPrompt: String(value.repairPrompt || "").trim().slice(0, 520),
    faceQuality: String(value.faceQuality || "").trim().slice(0, 120),
    poseMatch: String(value.poseMatch || "").trim().slice(0, 160),
    outfitMatch: String(value.outfitMatch || "").trim().slice(0, 180),
    checkedAt: Number(value.checkedAt || 0) || null,
    model: String(value.model || "").trim().slice(0, 80)
  };
}
export function summarizeGenerationError(error) {
  const text = (error instanceof Error ? error.message : String(error || "")).trim();
  if (!text) return "";
  const quotaMatch = text.match(/token quota is not enough[\s\S]*?remain quota:\s*[＄$]?([\d.]+)[\s\S]*?need quota:\s*[＄$]?([\d.]+)/i);
  if (quotaMatch) {
    return `额度不足：剩余 $${quotaMatch[1]} / 需要 $${quotaMatch[2]}`;
  }
  return formatGenerationError(error instanceof Error ? error : new Error(text));
}
export function imageSource(image) {
  if (!image) return "";
  if (image.cachedUrl) return image.cachedUrl;
  if (image.localUrl) return image.localUrl;
  if (image.type === "b64_json") {
    const value = String(image.value || "");
    if (value.startsWith("data:")) return value;
    return `data:${image.mimeType || image.archiveMime || "image/png"};base64,${value}`;
  }
  if (image.type === "url") return image.value;
  return "";
}
export function cacheableResultImageSource(image) {
  if (!image) return "";
  const localUrl = String(image.localUrl || "");
  if (/^https?:\/\//i.test(localUrl)) return localUrl;
  const value = String(image.type === "url" ? image.value || "" : "");
  if (/^https?:\/\//i.test(value)) return value;
  return "";
}
export function resultImageCacheKey(image) {
  const source = cacheableResultImageSource(image);
  return source ? `${OUTFIT_RESULT_IMAGE_CACHE_PREFIX}${source}` : "";
}
export function stripRuntimeResultImageCache(image) {
  if (!image || typeof image !== "object") return image;
  const {
    cachedUrl,
    cachedBlob,
    cachedFile,
    cachedFrom,
    cachedAt,
    ...rest
  } = image;
  if (image.type === "local_blob") {
    // 局部回贴/扩图这类"浏览器本地合成"的结果：优先用 /api/result 持久地址；
    // 缓存失败时只剩本次文档里的 blob: 地址——**也要写下去**，否则页面切走再切回来
    // 这张图就直接没了（原来这里返回 null，等于把结果丢掉）。
    // 这个地址在整页刷新后一定失效，恢复时会按"临时地址已失效"显示真实原因。
    const fallbackUrl = String(image.localUrl || cachedUrl || image.value || "");
    if (!fallbackUrl) return null;
    return {
      ...rest,
      type: "url",
      value: fallbackUrl,
      ...(image.localUrl ? { localUrl: image.localUrl } : {})
    };
  }
  return rest;
}
export function hasRestorableResultAddress(image) {
  if (!image || typeof image !== "object") return false;
  return [image.localUrl, image.value].some((value) => {
    const text = String(value || "").trim();
    return Boolean(text) && !text.startsWith("blob:");
  });
}
export function displayResultImageSource(image) {
  const src = imageSource(image);
  return displayImageRequestUrl(src);
}
export function cachedResultBlobFromRecord(record) {
  if (typeof Blob === "undefined") return null;
  if (record instanceof Blob) return record;
  if (record?.blob instanceof Blob) return record.blob;
  return null;
}
// P7-6：`fetchBlobWithTimeout` 已搬到准入层 src/api/assets.js（全文逐字搬运，行为不变）。
// 这里刻意不再留同名转发导出——留了就等于给"网络出口只有一处"重开第二个口子；
// 调用方改从准入层取（本文件顶部已 import）。
// 注：注释里不要写示例代码形式的相对 import，P7-5 依赖方向检查是读原文不擦注释的。
export function revokeResultImageRuntimeCache(image) {
  const url = image?.cachedUrl;
  if (typeof url === "string" && url.startsWith("blob:")) {
    documentObjectUrls.delete(url);
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}
export function revokeRestorableTaskResultImageCaches(tasks = []) {
  (Array.isArray(tasks) ? tasks : []).forEach((task) => {
    if (hasRestorableResultAddress(task?.result)) revokeResultImageRuntimeCache(task?.result);
  });
}
export function revokeTaskResultRuntimeCaches(tasks = []) {
  (Array.isArray(tasks) ? tasks : []).forEach((task) => revokeResultImageRuntimeCache(task?.result));
}
export function markExpiredTempResult(task) {
  if (!task || typeof task !== "object") return task;
  const src = imageSource(task.result);
  if (!src.startsWith("blob:") || isLiveDocumentObjectUrl(src)) return task;
  return {
    ...task,
    result: { ...task.result, missing: true, missingReason: "temp_blob_expired" }
  };
}
export async function cacheResultImageBlob(image) {
  const source = cacheableResultImageSource(image);
  const key = resultImageCacheKey(image);
  if (!source || !key || typeof window === "undefined" || typeof URL === "undefined") return image;

  try {
    const cached = await outfitLocalGet(key, null);
    const cachedBlob = cachedResultBlobFromRecord(cached);
    if (cachedBlob) {
      const cachedUrl = createDocumentObjectUrl(cachedBlob);
      return {
        ...image,
        cachedUrl,
        cachedBlob,
        cachedFrom: source,
        cachedAt: Number(cached?.createdAt || cached?.updatedAt || Date.now())
      };
    }
  } catch {}

  try {
    const blob = await fetchBlobWithTimeout(displayImageRequestUrl(source));
    if (!blob || blob.size <= 0) return image;
    const createdAt = Date.now();
    const cachedUrl = createDocumentObjectUrl(blob);
    await outfitLocalSet(key, {
      blob,
      mimeType: blob.type || image.archiveMime || image.mimeType || "image/png",
      source,
      createdAt
    });
    return {
      ...image,
      cachedUrl,
      cachedBlob: blob,
      cachedFrom: source,
      cachedAt: createdAt
    };
  } catch {
    return image;
  }
}
export function sanitizeTaskReferenceThumbs(references = []) {
  return (Array.isArray(references) ? references : [])
    .map((reference, index) => {
      const url = String(reference?.url || reference?.previewUrl || reference?.localUrl || "").trim();
      if (!url || (!url.startsWith("data:image/") && !url.startsWith("http") && !url.startsWith("/"))) return null;
      return {
        label: String(reference?.label || `图${index + 1}`).slice(0, 16),
        name: String(reference?.name || reference?.label || `参考图 ${index + 1}`).slice(0, 160),
        url
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}
export function stripTaskUploadImageCache(task) {
  if (!task || typeof task !== "object") return task;
  return {
    ...task,
    modelItem: null,
    extraModelItems: [],
    clothingItem: null,
    outpaintReferenceItems: [],
    referenceItems: [],
    referenceThumbs: sanitizeTaskReferenceThumbs(task.referenceThumbs)
  };
}
export function stripPageNonResultImages(page) {
  if (!page || typeof page !== "object") return page;
  return {
    ...page,
    modelImages: [],
    clothingImages: [],
    referenceImages: [],
    fixedClothingId: "",
    originalLibrary: [],
    tasks: Array.isArray(page.tasks) ? page.tasks.map(stripTaskUploadImageCache) : []
  };
}
export function imageItemPreviewSource(item) {
  return item?.localEdit?.previewUrl || item?.previewUrl || item?.originalUrl || "";
}
export function imageItemPreviewFile(item) {
  return item?.localEdit?.cropFile || item?.file || item?.originalFile || null;
}
export function imageItemUploadFile(item) {
  return item?.file || item?.originalFile || null;
}
export function imageItemDisplayName(item) {
  return String(item?.name || item?.originalFile?.name || item?.file?.name || "").trim();
}
export function hasImageItemUploadFile(item) {
  const file = imageItemUploadFile(item);
  if (!file) return false;
  if (typeof Blob === "undefined") return true;
  return file instanceof Blob;
}
export function resolveUploadImageItem(items = [], id = "", name = "", usedIds = new Set()) {
  const list = (Array.isArray(items) ? items : []).filter(hasImageItemUploadFile);
  const normalizedId = String(id || "");
  if (normalizedId) {
    const match = list.find((item) => String(item?.id || "") === normalizedId);
    if (match) return match;
  }
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return null;
  return list.find((item) => !usedIds.has(String(item?.id || "")) && imageItemDisplayName(item) === normalizedName) || null;
}
export function resolveUploadImageItems(items = [], ids = [], fallbackNames = [], usedIds = new Set()) {
  const resolved = [];
  const append = (item) => {
    if (!item) return;
    const id = String(item.id || "");
    if (id && usedIds.has(id)) return;
    if (id) usedIds.add(id);
    resolved.push(item);
  };
  (Array.isArray(ids) ? ids : []).forEach((id) => append(resolveUploadImageItem(items, id, "", usedIds)));
  (Array.isArray(fallbackNames) ? fallbackNames : []).forEach((name) => append(resolveUploadImageItem(items, "", name, usedIds)));
  return resolved;
}
export function taskReferencePreviewItems(task) {
  const extraModelItems = Array.isArray(task?.extraModelItems) ? task.extraModelItems : [];
  const outpaintReferenceItems = Array.isArray(task?.outpaintReferenceItems) ? task.outpaintReferenceItems : [];
  const referenceItems = Array.isArray(task?.referenceItems) ? task.referenceItems : [];
  const fallbackReferenceNames = referenceItems.length || outpaintReferenceItems.length
    ? []
    : (Array.isArray(task?.referenceNames) ? task.referenceNames : []);
  return [
    {
      label: "图1",
      name: task?.modelItem?.name || task?.modelName || "图1",
      url: imageItemPreviewSource(task?.modelItem),
      item: task?.modelItem
    },
    ...extraModelItems.map((item, index) => ({
      label: `图1-${index + 2}`,
      name: item?.name || `图1-${index + 2}`,
      url: imageItemPreviewSource(item),
      item
    })),
    ...(task?.clothingItem || task?.clothingName ? [{
      label: "图2",
      name: task?.clothingItem?.name || task?.clothingName || "图2",
      url: imageItemPreviewSource(task?.clothingItem),
      item: task?.clothingItem
    }] : []),
    ...outpaintReferenceItems.map((item, index) => ({
      label: outpaintReferenceItems.length > 1 ? `图2-${index + 1}` : "图2",
      name: item?.name || `图2-${index + 1}`,
      url: imageItemPreviewSource(item),
      item
    })),
    ...referenceItems.map((item, index) => ({
      label: `图${index + 3}`,
      name: item?.name || `图${index + 3}`,
      url: imageItemPreviewSource(item),
      item
    })),
    ...fallbackReferenceNames.map((name, index) => ({
      label: `图${index + 3}`,
      name,
      url: ""
    }))
  ].filter((reference) => reference.name || reference.url || reference.item);
}
export async function imageThumbnailDataUrlFromFile(file, maxSide = 96) {
  if (!(file instanceof File)) return "";
  const image = await imageBitmapFromFile(file);
  try {
    const sourceWidth = image.width || image.naturalWidth || 1;
    const sourceHeight = image.height || image.naturalHeight || 1;
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return "";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.72);
    return dataUrlFromBlob(blob);
  } finally {
    image.close?.();
  }
}
export async function buildTaskReferenceThumbs(task) {
  const references = taskReferencePreviewItems(task);
  const thumbs = await Promise.all(references.map(async (reference) => {
    let url = reference.url || "";
    const file = imageItemPreviewFile(reference.item);
    if (file instanceof File) {
      try {
        url = await imageThumbnailDataUrlFromFile(file);
      } catch {}
    }
    return {
      label: reference.label,
      name: reference.name || reference.label,
      url
    };
  }));
  return {
    references,
    thumbs: sanitizeTaskReferenceThumbs(thumbs)
  };
}
export async function attachTaskReferenceThumbs(task) {
  const { references, thumbs } = await buildTaskReferenceThumbs(task);
  return {
    ...task,
    referenceThumbs: thumbs,
    referenceCount: references.length
  };
}
export function hydrateTaskUploadReferences(task, sources = {}) {
  if (!task || typeof task !== "object") return task;
  const modelImages = Array.isArray(sources.modelImages) ? sources.modelImages : [];
  const clothingImages = Array.isArray(sources.clothingImages) ? sources.clothingImages : [];
  const referenceImages = Array.isArray(sources.referenceImages) ? sources.referenceImages : [];
  const workflow = task.workflowMode || "";
  const referenceNames = Array.isArray(task.referenceNames) ? task.referenceNames : [];
  const usedModelIds = new Set();
  const usedClothingIds = new Set();
  const usedReferenceIds = new Set();

  const modelItem = hasImageItemUploadFile(task.modelItem)
    ? task.modelItem
    : resolveUploadImageItem(modelImages, task.modelImageId, task.modelName, usedModelIds);
  if (modelItem?.id) usedModelIds.add(String(modelItem.id));

  const clothingItem = hasImageItemUploadFile(task.clothingItem)
    ? task.clothingItem
    : resolveUploadImageItem(clothingImages, task.clothingImageId, task.clothingName, usedClothingIds);
  if (clothingItem?.id) usedClothingIds.add(String(clothingItem.id));

  const extraModelItems = Array.isArray(task.extraModelItems) && task.extraModelItems.some(hasImageItemUploadFile)
    ? task.extraModelItems.filter(hasImageItemUploadFile)
    : resolveUploadImageItems(
        modelImages,
        task.extraModelImageIds,
        workflow === "design-draft" ? referenceNames : [],
        usedModelIds
      );

  const extraClothingItems = Array.isArray(task.extraClothingItems) && task.extraClothingItems.some(hasImageItemUploadFile)
    ? task.extraClothingItems.filter(hasImageItemUploadFile)
    : resolveUploadImageItems(
        clothingImages,
        task.extraClothingImageIds,
        ["recolor", "white-refine"].includes(workflow) ? referenceNames : [],
        usedClothingIds
      );

  const outpaintReferenceItems = Array.isArray(task.outpaintReferenceItems) && task.outpaintReferenceItems.some(hasImageItemUploadFile)
    ? task.outpaintReferenceItems.filter(hasImageItemUploadFile)
    : resolveUploadImageItems(referenceImages, task.outpaintReferenceImageIds, [], usedReferenceIds);

  const referenceItems = Array.isArray(task.referenceItems) && task.referenceItems.some(hasImageItemUploadFile)
    ? task.referenceItems.filter(hasImageItemUploadFile)
    : resolveUploadImageItems(
        referenceImages,
        task.referenceImageIds,
        ["outfit", "pose-remix", "face-swap", "background-change", "local-detail", "custom"].includes(workflow) ? referenceNames : [],
        usedReferenceIds
      );

  return {
    ...task,
    ...(modelItem ? { modelItem } : {}),
    extraModelItems,
    ...(clothingItem ? { clothingItem } : {}),
    extraClothingItems,
    outpaintReferenceItems,
    referenceItems
  };
}
export function hydrateTasksWithUploadReferences(tasks = [], sources = {}) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => hydrateTaskUploadReferences(task, sources));
}
export function revokePageNonResultImageUrls(page) {
  if (!page || typeof page !== "object") return;
  [
    ...(Array.isArray(page.modelImages) ? page.modelImages : []),
    ...(Array.isArray(page.clothingImages) ? page.clothingImages : []),
    ...(Array.isArray(page.referenceImages) ? page.referenceImages : [])
  ].forEach(revokeImageUrls);
  (Array.isArray(page.originalLibrary) ? page.originalLibrary : []).forEach((item) => {
    if (item?.url) {
      try {
        URL.revokeObjectURL(item.url);
      } catch {}
    }
  });
}
export function sanitizeTaskHistoryItem(task) {
  if (!task) return null;
  return {
    id: task.id,
    order: task.order,
    status: task.status,
    error: task.error || "",
    errorDetail: task.errorDetail || "",
    runtimeStage: task.runtimeStage || "",
    runtimeDetail: task.runtimeDetail || "",
    runtimeUpdatedAt: task.runtimeUpdatedAt ?? null,
    prompt: task.prompt || "",
    timingMs: task.timingMs ?? null,
    startedAt: task.startedAt ?? null,
    finishedAt: task.finishedAt ?? null,
    createdAt: task.createdAt ?? Date.now(),
    modelLabel: task.modelLabel || "",
    imageSize: task.imageSize || "",
    aspectRatio: task.aspectRatio || "",
    workflowMode: task.workflowMode || "",
    pageName: task.pageName || "",
    randomBackgroundFocus: task.workflowMode === "random-background" ? normalizeRandomBackgroundFocus(task.randomBackgroundFocus) : "",
    modelImageId: task.modelItem?.id || task.modelImageId || "",
    clothingImageId: task.clothingItem?.id || task.clothingImageId || "",
    extraModelImageIds: Array.isArray(task.extraModelItems)
      ? task.extraModelItems.map((item) => item?.id).filter(Boolean)
      : Array.isArray(task.extraModelImageIds) ? task.extraModelImageIds : [],
    extraClothingImageIds: Array.isArray(task.extraClothingItems)
      ? task.extraClothingItems.map((item) => item?.id).filter(Boolean)
      : Array.isArray(task.extraClothingImageIds) ? task.extraClothingImageIds : [],
    outpaintReferenceImageIds: Array.isArray(task.outpaintReferenceItems)
      ? task.outpaintReferenceItems.map((item) => item?.id).filter(Boolean)
      : Array.isArray(task.outpaintReferenceImageIds) ? task.outpaintReferenceImageIds : [],
    referenceImageIds: Array.isArray(task.referenceItems)
      ? task.referenceItems.map((item) => item?.id).filter(Boolean)
      : Array.isArray(task.referenceImageIds) ? task.referenceImageIds : [],
    modelName: task.modelItem?.name || task.modelName || "",
    clothingName: task.clothingItem?.name || task.clothingName || "",
    referenceNames: Array.isArray(task.referenceItems)
      ? task.referenceItems.map((item) => item?.name).filter(Boolean)
      : Array.isArray(task.referenceNames) ? task.referenceNames : [],
    referenceThumbs: sanitizeTaskReferenceThumbs(task.referenceThumbs),
    referenceCount: Number(task.referenceCount || task.referenceThumbs?.length || 0),
    qualityCheckEnabled: Boolean(task.qualityCheckEnabled),
    qualityCheck: normalizeQualityCheckResult(task.qualityCheck),
    cropReturn: normalizeCropReturnMeta(task.cropReturn || task.result?.cropReturn),
    rerunOf: task.rerunOf || "",
    rerunCandidate: Boolean(task.rerunCandidate),
    result: stripRuntimeResultImageCache(task.result) || null,
    // P1 缺图自愈：把"结果图已失效"持久化下来，下次打开就不再重复请求那个坏地址。
    // 只记地址指纹 + 原因，不删任何东西；结果图恢复后地址变了会自动失效。
    resultMissing: task.resultMissing && typeof task.resultMissing === "object"
      ? { src: String(task.resultMissing.src || ""), reason: String(task.resultMissing.reason || "") }
      : null,
    savedFilename: task.savedFilename || "",
    savedPath: task.savedPath || "",
    autoSaveFailed: Boolean(task.autoSaveFailed),
    source: task.source || "outfit"
  };
}
export function recoverPersistedTask(task, options = {}) {
  const item = sanitizeTaskHistoryItem(task);
  if (!item) return null;
  const recovered = markExpiredTempResult(refreshDetachedTaskMessage(item, options));
  if (isRefreshInterruptedTask(recovered)) return detachPersistedTask(recovered, options.detachReason);
  if (!hasGenerationPendingStatus(recovered)) return recovered;
  return detachPersistedTask(recovered, options.detachReason);
}
export function recoverPersistedTasks(tasks = [], options = {}) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => recoverPersistedTask(task, options)).filter(Boolean);
}
export function mergeOutfitTasksWithHistory(currentTasks = [], historyTasks = []) {
  const current = Array.isArray(currentTasks) ? currentTasks : [];
  const history = Array.isArray(historyTasks) ? historyTasks : [];
  if (history.length === 0) return current;
  if (current.length === 0) return history;
  const historyById = new Map(history.map((task) => [task.id, task]));
  const seen = new Set();
  const merged = current.map((task) => {
    seen.add(task.id);
    const persisted = historyById.get(task.id);
    if (!persisted) return task;
    // 只接受"已经成功 + 有可显示地址"的持久记录，失败/中断记录不覆盖当前状态。
    if (persisted.status !== "success" || !imageSource(persisted.result)) return task;
    if (task.status === "success" && imageSource(task.result)) return task;
    // 保留当前这条的上传引用（历史里只有 id/名字），其余以持久结果为准。
    return {
      ...task,
      ...persisted,
      modelItem: task.modelItem,
      clothingItem: task.clothingItem,
      extraModelItems: task.extraModelItems,
      extraClothingItems: task.extraClothingItems,
      outpaintReferenceItems: task.outpaintReferenceItems,
      referenceItems: task.referenceItems
    };
  });
  history.forEach((task) => {
    if (!seen.has(task.id)) merged.push(task);
  });
  return merged;
}
export function mergeOutfitLiveRuns(currentTasks = [], liveTasks = []) {
  const current = Array.isArray(currentTasks) ? currentTasks : [];
  const live = Array.isArray(liveTasks) ? liveTasks : [];
  if (live.length === 0) return current;
  const liveById = new Map(live.map((task) => [task.id, task]));
  if (!current.some((task) => liveById.has(task.id))) return current;
  return current.map((task) => {
    const snapshot = liveById.get(task.id);
    if (!snapshot) return task;
    if (task.status === "success" && imageSource(task.result) && snapshot.status !== "success") return task;
    return {
      ...task,
      ...snapshot,
      modelItem: task.modelItem,
      clothingItem: task.clothingItem,
      extraModelItems: task.extraModelItems,
      extraClothingItems: task.extraClothingItems,
      outpaintReferenceItems: task.outpaintReferenceItems,
      referenceItems: task.referenceItems
    };
  });
}
export function readTaskHistory() {
  return recoverPersistedTasks(readJsonStorage(TASK_HISTORY_KEY, []), { detachReason: "reload" });
}
export async function readTaskHistoryAsync() {
  const idbHistory = await outfitLocalGet(OUTFIT_TASK_HISTORY_DB_KEY, null);
  if (Array.isArray(idbHistory)) {
    return recoverPersistedTasks(idbHistory, { detachReason: "reload" });
  }
  return readTaskHistory();
}
export async function persistTaskHistory(items) {
  const list = Array.isArray(items) ? items : [];
  await outfitLocalSet(OUTFIT_TASK_HISTORY_DB_KEY, list.map((task) => ({
    ...task,
    result: stripRuntimeResultImageCache(task.result) || null
  })));
  removeStorageItem(TASK_HISTORY_KEY);
  writeJsonStorage(TASK_HISTORY_KEY, list.map((task) => ({
    ...task,
    result: null
  })).slice(-120));
}
export async function persistFinishedTaskWhileDetached(task, savePromise) {
  try {
    const saved = savePromise ? await Promise.resolve(savePromise).catch(() => null) : null;
    const finished = saved
      ? {
          ...task,
          savedFilename: saved.filename || task.savedFilename || "",
          savedPath: saved.path || task.savedPath || "",
          autoSaveFailed: false
        }
      : task;
    const item = sanitizeTaskHistoryItem(finished);
    if (!item) return;
    if (item.status !== "success" && item.status !== "failed") return;
    if (item.status === "success" && !imageSource(item.result)) return;

    const draft = await outfitLocalGet(OUTFIT_DRAFT_DB_KEY, null);
    if (!draft || !Array.isArray(draft.pages) || draft.pages.length === 0) return;
    let changed = false;
    const pages = draft.pages.map((page) => {
      const pageTasks = Array.isArray(page?.tasks) ? page.tasks : [];
      const index = pageTasks.findIndex((entry) => entry?.id === item.id);
      const isTargetPage = index >= 0 || (item.pageName && page?.name === item.pageName);
      if (!isTargetPage) return page;
      changed = true;
      if (index >= 0) {
        const nextTasks = [...pageTasks];
        nextTasks[index] = { ...nextTasks[index], ...item };
        return { ...page, tasks: nextTasks };
      }
      return { ...page, tasks: [...pageTasks, item].slice(-500) };
    });
    if (!changed) return;
    await outfitLocalSet(OUTFIT_DRAFT_DB_KEY, { ...draft, pages, updatedAt: Date.now() });
  } catch {
    // 组件已卸载时的补登记失败不抛错：下一次整页刷新/重新生成仍然可用。
  }
}
export function publishOutfitLiveRun(task) {
  if (!task?.id) return;
  // 只留任务元数据 + 结果地址（sanitizeTaskHistoryItem 会剥掉上传图/对象 URL 等运行时缓存，
  // 避免账本把大 File/Blob 一直钉在内存里）；sessionId 额外保留，
  // 让"是否还有本会话在跑的任务"这套判断在重挂载后仍然成立。
  const snapshot = { ...sanitizeTaskHistoryItem(task), sessionId: task.sessionId || "" };
  if (!snapshot.id) return;
  outfitLiveRuns.set(snapshot.id, { task: snapshot, updatedAt: Date.now() });
  if (outfitLiveRuns.size > OUTFIT_LIVE_RUN_LIMIT) {
    const ordered = [...outfitLiveRuns.values()].sort((a, b) => a.updatedAt - b.updatedAt);
    ordered.slice(0, outfitLiveRuns.size - OUTFIT_LIVE_RUN_LIMIT)
      .forEach((entry) => outfitLiveRuns.delete(entry.task.id));
  }
  outfitLiveRunSubscribers.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // 订阅者自身出错不影响生成流程
    }
  });
}
export function outfitLiveRunsForPage(pageName) {
  const list = [...outfitLiveRuns.values()].map((entry) => entry.task);
  if (!pageName) return list;
  return list.filter((task) => !task.pageName || task.pageName === pageName);
}
export function localEditRectSnapshot(rect) {
  if (!rect) return null;
  return {
    x: Math.round(Number(rect.x || 0)),
    y: Math.round(Number(rect.y || 0)),
    width: Math.round(Number(rect.width || 0)),
    height: Math.round(Number(rect.height || 0))
  };
}
export function localEditFileSnapshot(file) {
  if (typeof File === "undefined" || !(file instanceof File)) return null;
  return {
    name: file.name || "",
    size: Number(file.size || 0),
    type: file.type || ""
  };
}
export function roundLocalEditMetric(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}
export function localEditTaskBindingSnapshot(task, localEdit, taskAspectRatio, uploadFile) {
  return {
    taskId: task?.id || "",
    order: Number(task?.order || 0),
    batchMode: localEdit?.batchMode || task?.localEditBatchMode || "",
    modelImageId: task?.modelItem?.id || "",
    modelName: task?.modelItem?.name || task?.modelName || "",
    sourceImageId: localEdit?.sourceImageId || task?.modelItem?.id || "",
    sourceName: localEdit?.sourceName || task?.modelItem?.name || "",
    aspectRatio: taskAspectRatio || localEdit?.aspectRatio || task?.aspectRatio || "",
    recroppedAt: Number(localEdit?.recroppedAt || 0) || null,
    originalFile: localEditFileSnapshot(resolveLocalEditBaseFile(task?.modelItem)),
    cropFile: localEditFileSnapshot(localEdit?.cropFile),
    uploadFile: localEditFileSnapshot(uploadFile),
    cropRect: localEditRectSnapshot(localEdit?.cropRect),
    contextRect: localEditRectSnapshot(localEdit?.contextRect),
    cropQuality: roundLocalEditMetric(Number(localEdit?.cropQuality || 0)),
    cropBytes: Number(localEdit?.cropBytes || 0) || null
  };
}
export async function prepareOutfitTaskLocalEdit(task, localEdit, model, batchMode = "") {
  if (!localEdit?.cropRect || !task?.modelItem) return localEdit || null;
  const editMode = localEdit.editMode || LOCAL_EDIT_RECT_MODE;
  const isMaskEdit = editMode === LOCAL_EDIT_MASK_MODE;
  // 2026-09-25：所有模型都上传精确选框，不再区分"香蕉2 精确 / 其它带上下文"。
  const cropped = await cropLocalEditFile(
    task.modelItem,
    localEdit.cropRect,
    isMaskEdit ? "mask_edit_run" : "local_edit_run"
  );
  void model;
  return {
    ...localEdit,
    cropFile: cropped.file,
    cropRect: cropped.cropRect,
    contextRect: null,
    sourceWidth: cropped.sourceWidth,
    sourceHeight: cropped.sourceHeight,
    sourceImageId: task.modelItem?.id || localEdit.sourceImageId || "",
    sourceName: task.modelItem?.name || localEdit.sourceName || "",
    sourceOriginalName: task.modelItem?.originalFile?.name || task.modelItem?.file?.name || "",
    batchMode,
    cropQuality: cropped.cropQuality,
    cropBytes: cropped.cropBytes,
    recroppedAt: Date.now()
  };
}
export async function cacheTaskResultImageFile(file, taskId) {
  if (!(file instanceof File)) return null;
  const form = new FormData();
  form.append("taskId", taskId || "");
  form.append("image", file, file.name || "result.png");
  // P7-6：请求本身收口到 src/api/assets.js（URL/method/body 逐字一致）。
  const response = await cacheResultImageRequest(form);
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "缓存结果图片失败");
  }
  return payload;
}
export function taskDragDownloadName(task, fallbackIndex = null) {
  if (task?.savedFilename) return task.savedFilename;
  // 拖拽下载不经过服务端保存目录，使用生成日期时间+任务序号避免模型名反复重名。
  const createdAt = Number(task?.finishedAt || task?.createdAt || task?.startedAt || Date.now());
  const taskOrder = Number(task?.order);
  const sequence = Number.isFinite(taskOrder) && taskOrder > 0
    ? taskOrder
    : Number.isFinite(fallbackIndex)
      ? fallbackIndex + 1
      : Math.max(1, Math.round(createdAt % 100000));
  return `静音AI绘画-${dragDownloadDateStamp(createdAt)}-${padDragDownloadNumber(sequence, 4)}`;
}
export function canRerunTask(task) {
  return Boolean(
    imageItemUploadFile(task?.modelItem)
    && (
      task?.workflowMode === "outpaint"
      || task?.workflowMode === "white-refine"
      || task?.workflowMode === "random-background"
      || imageItemUploadFile(task?.clothingItem)
    )
  );
}
export function buildRerunReplacementTask(task) {
  const createdAt = Date.now();
  return {
    ...task,
    sessionId: OUTFIT_SESSION_ID,
    status: "queued",
    error: "",
    errorDetail: "",
    result: null,
    savedFilename: "",
    savedPath: "",
    autoSaveFailed: false,
    qualityCheck: task.qualityCheckEnabled
      ? { status: "pending", summary: "等待重刷后 AI质检" }
      : null,
    prompt: "",
    timingMs: null,
    startedAt: null,
    finishedAt: null,
    createdAt,
    rerunOf: task.rerunOf || task.id,
    rerunCandidate: false
  };
}
export function canReplaceTaskResult(sourceTask, targetTask) {
  return Boolean(
    sourceTask?.id
    && targetTask?.id
    && sourceTask.id !== targetTask.id
    && sourceTask.status === "success"
    && targetTask.status === "success"
    && imageSource(sourceTask.result)
    && imageSource(targetTask.result)
  );
}
export function normalizeRandomBackgroundFocus(value) {
  const text = String(value || "default").trim().toLowerCase();
  if (["upper", "top", "上衣", "上装"].includes(text)) return "upper";
  if (["lower", "bottom", "下衣", "下装"].includes(text)) return "lower";
  if (["set", "suit", "full", "套装", "整套"].includes(text)) return "set";
  return "default";
}
export const documentObjectUrls = new Set();

export function createDocumentObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  documentObjectUrls.add(url);
  return url;
}

export function isLiveDocumentObjectUrl(url) {
  return typeof url === "string" && url.startsWith("blob:") && documentObjectUrls.has(url);
}
export const outfitLiveRuns = new Map(); // taskId -> { task, updatedAt }
export const outfitLiveRunSubscribers = new Set();
export const OUTFIT_LIVE_RUN_LIMIT = 60;
export function openOutfitLocalDb() {
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(OUTFIT_LOCAL_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTFIT_LOCAL_STORE)) {
          db.createObjectStore(OUTFIT_LOCAL_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function outfitLocalGet(key, fallback = null) {
  const db = await openOutfitLocalDb();
  if (!db) return fallback;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(OUTFIT_LOCAL_STORE, "readonly");
      const store = transaction.objectStore(OUTFIT_LOCAL_STORE);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result?.value ?? fallback);
      request.onerror = () => resolve(fallback);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
      transaction.onabort = () => db.close();
    } catch {
      try {
        db.close();
      } catch {}
      resolve(fallback);
    }
  });
}

export async function outfitLocalSet(key, value) {
  const db = await openOutfitLocalDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(OUTFIT_LOCAL_STORE, "readwrite");
      const store = transaction.objectStore(OUTFIT_LOCAL_STORE);
      store.put({ key, value, updatedAt: Date.now() });
      transaction.oncomplete = () => {
        db.close();
        resolve(true);
      };
      transaction.onerror = () => {
        db.close();
        resolve(false);
      };
      transaction.onabort = () => {
        db.close();
        resolve(false);
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve(false);
    }
  });
}

export async function outfitLocalDeleteByPrefix(prefix) {
  const db = await openOutfitLocalDb();
  if (!db) return 0;
  return new Promise((resolve) => {
    let deleted = 0;
    try {
      const transaction = db.transaction(OUTFIT_LOCAL_STORE, "readwrite");
      const store = transaction.objectStore(OUTFIT_LOCAL_STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = String(cursor.key || "");
        if (key.startsWith(prefix)) {
          cursor.delete();
          deleted += 1;
        }
        cursor.continue();
      };
      transaction.oncomplete = () => {
        db.close();
        resolve(deleted);
      };
      transaction.onerror = () => {
        db.close();
        resolve(deleted);
      };
      transaction.onabort = () => {
        db.close();
        resolve(deleted);
      };
    } catch {
      try {
        db.close();
      } catch {}
      resolve(deleted);
    }
  });
}
export function revokePreviewUrl(item) {
  if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
  if (item?.localEdit?.previewUrl) URL.revokeObjectURL(item.localEdit.previewUrl);
}

export function revokeImageUrls(item) {
  if (item?.originalUrl) URL.revokeObjectURL(item.originalUrl);
  revokePreviewUrl(item);
}
export function cropReturnRectSnapshot(rect) {
  return localEditRectSnapshot(rect);
}

export function normalizeCropReturnMeta(meta) {
  if (!meta?.cropRect) return null;
  const sourceWidth = Number(meta.sourceWidth || 0);
  const sourceHeight = Number(meta.sourceHeight || 0);
  const cropRect = cropReturnRectSnapshot(meta.cropRect);
  if (!sourceWidth || !sourceHeight || !cropRect?.width || !cropRect?.height) return null;
  return {
    enabled: true,
    mode: meta.mode || "crop-return",
    cropRect,
    sourceWidth,
    sourceHeight,
    aspectRatio: meta.aspectRatio || "",
    cropWidth: Number(meta.cropWidth || cropRect.width),
    cropHeight: Number(meta.cropHeight || cropRect.height),
    outputWidth: Number(meta.outputWidth || sourceWidth),
    outputHeight: Number(meta.outputHeight || sourceHeight),
    createdAt: Number(meta.createdAt || Date.now())
  };
}

export function subscribeOutfitLiveRuns(listener) {
  outfitLiveRunSubscribers.add(listener);
  return () => outfitLiveRunSubscribers.delete(listener);
}

