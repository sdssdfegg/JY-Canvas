// 参考图归档 + 成图素材落盘。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 这一层做的是「把生成出来的东西按用户习惯放好」：
//   - archiveReferenceAssets：把本次上传的参考图存进 data/reference-assets，
//     并给每张图分一个稳定的 id（<requestId>_ref_<序号>）供后续回贴引用；
//   - writeJingyinNumberedImage：素材库内的当日序号命名（<日>_<序号>.<ext>），
//     靠 highestDailyImageIndex 扫目录取当前最大值再 +1；
//   - persistGeneratedItems：决定是否自动落盘、落到哪个模块子目录。
//
// 几个不能随手改的点：
//   - withSaveFilenameLock 是为了防止并发写撞上同一个序号文件名。
//     saveFilenameLock 是模块私有状态，故意不导出；
//   - writeProcessedImage 的默认子目录名是「裁剪」，老用户的素材已经按这个名字
//     存在磁盘上了，改了等于把他们已有的目录结构抛弃；
//   - buildHistoryItems 里的 createdAt + index 是为了让同一批图在按时间倒序
//     排列时仍保持批次内的先后顺序，去掉会乱序；
//   - currentDailyImagePrefix 用的是「当月第几日」而不是完整日期，
//     跨月会重复，这是既定行为，不要顺手改成年月日。

import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CHANNEL_MODELS } from "../channel.js";
import { referenceAssetDir } from "./app-paths.js";
import { getSaveDirectory } from "./app-settings.js";
import { referenceAssetUrl } from "./asset-urls.js";
import { sanitizeFilePart } from "./format-utils.js";
import { imageExtensionFromType, mimeTypeFromFile, uniqueFilePath } from "./file-naming.js";
import { writeGenerationLog } from "./generation-logger.js";
import {
  appendHistoryResults,
  archiveHistoryItemImageFromBuffer,
  normalizeReferenceAsset
} from "./history-store.js";
import { imageBufferFromPayload } from "./image-payload.js";

let saveFilenameLock = Promise.resolve();

export function parseReferenceMeta(rawValue) {
  try {
    const parsed = JSON.parse(String(rawValue || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function archiveReferenceAssets(files, rawMeta, requestId) {
  const incoming = Array.isArray(files) ? files.filter((file) => file?.buffer?.length || file?.path) : [];
  if (incoming.length === 0) return [];
  const metadata = parseReferenceMeta(rawMeta);
  const createdAt = Date.now();

  await mkdir(referenceAssetDir, { recursive: true });
  return Promise.all(incoming.map(async (file, index) => {
    const meta = metadata[index] && typeof metadata[index] === "object" ? metadata[index] : {};
    const ext = imageExtensionFromType(file.mimetype, file.originalname);
    const baseName = sanitizeFilePart(`${requestId}_ref_${index + 1}_${meta.name || file.originalname || "reference"}`);
    const target = await uniqueFilePath(referenceAssetDir, `${baseName}.${ext}`);
    if (file.path) {
      await copyFile(file.path, target);
    } else {
      await writeFile(target, file.buffer);
    }
    const archiveFile = path.basename(target);
    return {
      id: `${requestId}_ref_${index + 1}`,
      name: String(meta.name || file.originalname || `reference-${index + 1}.${ext}`),
      role: String(meta.role || "reference"),
      index: Number.isFinite(Number(meta.index)) ? Number(meta.index) : index,
      size: Number(meta.size || file.size || 0),
      mimeType: String(meta.type || file.mimetype || mimeTypeFromFile(`reference.${ext}`)),
      archiveFile,
      localUrl: referenceAssetUrl(archiveFile),
      ...(meta.localEdit ? { localEdit: true } : {}),
      createdAt: createdAt + index
    };
  }));
}

export function modelLabel(model) {
  return CHANNEL_MODELS.find((item) => item.value === model)?.label || model || "图片";
}

export function buildHistoryItems(images, params, files, requestId, timing, createdAt, references = []) {
  const normalizedReferences = Array.isArray(references)
    ? references.map(normalizeReferenceAsset).filter(Boolean)
    : [];
  return images.map((image, index) => ({
    id: `${requestId}_${index + 1}`,
    requestId,
    image,
    prompt: params.prompt,
    modelLabel: modelLabel(params.model),
    imageSize: params.imageSize,
    aspectRatio: params.aspectRatio,
    referenceCount: normalizedReferences.length || files.length,
    ...(normalizedReferences.length > 0 ? { references: normalizedReferences } : {}),
    generationMs: timing.totalMs,
    source: params.source,
    createdAt: createdAt + index
  }));
}



export function autoSaveModuleFolder(source) {
  if (source === "detail-main") return "一键详情主图";
  if (source === "reference-remix") return "参考生图";
  if (source === "infinite-canvas") return "无限画布";
  return "";
}

export async function withSaveFilenameLock(task) {
  const previous = saveFilenameLock;
  let releaseLock = () => {};
  saveFilenameLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  await previous;
  try {
    return await task();
  } finally {
    releaseLock();
  }
}

export function currentDailyImagePrefix() {
  return String(new Date().getDate());
}

export async function highestDailyImageIndex(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  let highest = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)\\.[^.]+$`, "i");
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = pattern.exec(entry.name);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > highest) highest = value;
  }
  return highest;
}

export async function writeJingyinNumberedImage(directory, buffer, extension) {
  const ext = sanitizeFilePart(extension || "png").replace(/^_+/, "").toLowerCase() || "png";
  await mkdir(directory, { recursive: true });
  return withSaveFilenameLock(async () => {
    const prefix = currentDailyImagePrefix();
    const start = await highestDailyImageIndex(directory, prefix) + 1;
    for (let index = start; index < start + 100000; index += 1) {
      const filename = `${prefix}-${index}.${ext}`;
      const target = path.join(directory, filename);
      try {
        await writeFile(target, buffer, { flag: "wx" });
        return { filename, target };
      } catch (error) {
        if (error?.code === "EEXIST") continue;
        throw error;
      }
    }
    throw new Error("当天图片文件序号已超过可用范围");
  });
}

export function sanitizeSubfolderName(value) {
  const cleaned = String(value || "").trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
  return cleaned || "裁剪";
}

export async function writeProcessedImage(directory, buffer, extension, subfolder = "裁剪") {
  const outputFolder = String(subfolder ?? "").trim()
    ? path.join(directory, sanitizeSubfolderName(subfolder))
    : directory;
  await mkdir(outputFolder, { recursive: true });
  return writeJingyinNumberedImage(outputFolder, buffer, extension);
}

export async function persistGeneratedItems(items) {
  const incoming = Array.isArray(items) ? items.filter((item) => item?.id) : [];
  if (incoming.length === 0) return { items: [], autoSavedCount: 0 };

  const saveRoot = await getSaveDirectory();
  const persistedItems = [];
  let autoSavedCount = 0;

  for (const item of incoming) {
    let nextItem = item;
    let buffer = null;
    let mimeType = "";
    let sourceUrl = "";

    try {
      const payload = await imageBufferFromPayload(item.image);
      buffer = payload.buffer;
      mimeType = payload.mimeType;
      sourceUrl = payload.sourceUrl;
    } catch (error) {
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId: item.id,
        ok: false,
        stage: "prepare-generated-image",
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (buffer) {
      try {
        const moduleFolder = autoSaveModuleFolder(item.source);
        const targetDirectory = moduleFolder ? path.join(saveRoot, moduleFolder) : saveRoot;
        await mkdir(targetDirectory, { recursive: true });
        await writeJingyinNumberedImage(
          targetDirectory,
          buffer,
          imageExtensionFromType(mimeType, sourceUrl)
        );
        autoSavedCount += 1;
      } catch (error) {
        await writeGenerationLog({
          time: new Date().toISOString(),
          requestId: item.id,
          ok: false,
          stage: "auto-save-generated-image",
          error: error instanceof Error ? error.message : String(error)
        });
      }

      try {
        nextItem = item.image?.archiveFile || String(item.image?.localUrl || "").startsWith("/api/history-image/")
          ? item
          : await archiveHistoryItemImageFromBuffer(item, buffer, mimeType, sourceUrl);
      } catch (error) {
        await writeGenerationLog({
          time: new Date().toISOString(),
          requestId: item.id,
          ok: false,
          stage: "cache-generated-image",
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    persistedItems.push(nextItem);
  }

  await appendHistoryResults(persistedItems);
  return { items: persistedItems, autoSavedCount };
}

export function persistGeneratedItemsInBackground(items, requestId, stage = "background-persist-generated-items") {
  const incoming = Array.isArray(items) ? items.filter((item) => item?.id) : [];
  if (incoming.length === 0) return;

  setTimeout(() => {
    persistGeneratedItems(incoming)
      .then((result) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: true,
        stage,
        itemCount: incoming.length,
        autoSavedCount: result.autoSavedCount
      }))
      .catch((error) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: false,
        stage,
        itemCount: incoming.length,
        error: error instanceof Error ? error.message : String(error)
      }));
  }, 0);
}
