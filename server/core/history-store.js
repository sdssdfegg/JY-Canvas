// 成图历史记录的读写、归档与自修复。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 依赖方向（单向，无环）：
//   asset-urls  ← app-paths
//   image-payload ← asset-urls / file-naming / image-proxy
//   history-store ← 上面三者 + generation-logger
//
// 这个模块里最值钱、也最不能乱改的是 ensureHistoryRepairBackup 与
// recoverHistoryFromImageFiles：历史上出现过 history.json 写坏的情况，
// 当时的处理是「先自动备份、再从 data/history-images 里的真实图片文件重建索引」，
// 而不是直接清空让用户重来。backup 文件名在 historyBackupFile。
//
// annotate* 一组做的是「完整性标注」返回 Studio 继续用它 referencing：
// historyItemIntegrity / referenceAssetIntegrity 判定某条记录是否还指向真实存在的文件，
// 缺失的就标 missing，让前端能显示占位图而不是裂图。

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  dataDir,
  historyBackupFile,
  historyFile,
  historyImageDir,
  referenceAssetDir,
  resultDir
} from "./app-paths.js";
import { historyImagePath, historyImageUrl, referenceAssetUrl } from "./asset-urls.js";
import { sanitizeFilePart } from "./format-utils.js";
import { imageExtensionFromType, mimeTypeFromFile, uniqueFilePath } from "./file-naming.js";
import { writeGenerationLog } from "./generation-logger.js";
import { imageBufferFromPayload } from "./image-payload.js";
import { IMAGE_PROXY_TIMEOUT_MS } from "./runtime-config.js";

export async function readJsonArray(file) {
  try {
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizeReferenceAsset(item, index = 0) {
  if (!item || typeof item !== "object") return null;
  const archiveFile = item.archiveFile ? path.basename(String(item.archiveFile)) : "";
  const localUrl = archiveFile
    ? referenceAssetUrl(archiveFile)
    : String(item.localUrl || item.url || "");
  return {
    id: String(item.id || `ref_${index}`),
    name: String(item.name || item.originalName || `reference-${index + 1}`),
    role: String(item.role || "reference"),
    index: Number.isFinite(Number(item.index)) ? Number(item.index) : index,
    size: Number(item.size || 0),
    mimeType: String(item.mimeType || ""),
    ...(archiveFile ? { archiveFile } : {}),
    ...(localUrl ? { localUrl } : {}),
    // P1 缺图自愈：失效标记必须一起持久化。
    // 这里原来是字段白名单，不带上 missing 的话标记只存在于接口响应里，
    // 一写盘就被丢掉，前端下次读到的仍是"未标记"（这个 bug 被 history-integrity-check 抓出来）。
    ...(item.missing === true ? { missing: true } : {}),
    ...(item.missingReason ? { missingReason: String(item.missingReason) } : {})
  };
}

export function normalizeHistoryItem(item) {
  if (!item || typeof item !== "object") return null;
  const image = item.image && typeof item.image === "object"
    ? {
        ...item.image,
        ...(item.image.archiveFile ? { localUrl: historyImageUrl(item.image.archiveFile) } : {})
      }
    : item.image;
  const references = Array.isArray(item.references)
    ? item.references.map(normalizeReferenceAsset).filter(Boolean)
    : [];
  return {
    ...item,
    image,
    ...(references.length > 0 ? { references, referenceCount: references.length } : {})
  };
}

/**
 * 判断一条历史记录指向的本地文件是否还在。
 *
 * 「不在」分两种，都会让结果卡片变成无法解释的空白（P1 缺图）：
 *   1. 有 archiveFile 但 data/history-images 下找不到 → archive_missing
 *   2. 只有 /api/history-image/... 或 /api/result/... 的 localUrl，同样找不到 → archive_missing
 * 只有确实是本地引用且文件不存在才算失效；纯远程地址不在这里判定（它可能仍然有效）。
 */
export function historyItemIntegrity(item) {
  const image = item?.image || {};
  const archiveFile = String(image.archiveFile || "").trim();
  if (archiveFile) {
    const target = historyImagePath(archiveFile);
    return existsSync(target)
      ? { missing: false, reason: "" }
      : { missing: true, reason: "archive_missing" };
  }
  const localUrl = String(image.localUrl || "").trim();
  const localMatch = /^\/api\/(history-image|result)\/(.+)$/.exec(localUrl);
  if (localMatch) {
    const dir = localMatch[1] === "result" ? resultDir : historyImageDir;
    const name = decodeURIComponent(localMatch[2]);
    return existsSync(path.join(dir, path.basename(name)))
      ? { missing: false, reason: "" }
      : { missing: true, reason: "archive_missing" };
  }
  return { missing: false, reason: "" };
}

/** 参考图缩略图的完整性（归档文件是否还在）。 */
export function referenceAssetIntegrity(reference) {
  const archiveFile = String(reference?.archiveFile || "").trim();
  if (!archiveFile) return { missing: false, reason: "" };
  const target = path.join(referenceAssetDir, path.basename(archiveFile));
  return existsSync(target)
    ? { missing: false, reason: "" }
    : { missing: true, reason: "reference_missing" };
}

/** 给单条记录里的参考图补/清 missing 标记；返回是否发生变化。 */
export function annotateReferences(references) {
  const list = Array.isArray(references) ? references : [];
  let changed = false;
  const next = list.map((reference) => {
    if (!reference || typeof reference !== "object") return reference;
    const integrity = referenceAssetIntegrity(reference);
    if (integrity.missing) {
      if (reference.missing && reference.missingReason === integrity.reason) return reference;
      changed = true;
      return { ...reference, missing: true, missingReason: integrity.reason };
    }
    if (reference.missing || reference.missingReason) {
      changed = true;
      const { missing: _m, missingReason: _r, ...rest } = reference;
      return rest;
    }
    return reference;
  });
  return { references: next, changed };
}

/**
 * 给历史记录补上完整性标记（**只加字段，绝不删除条目**）。
 * 幂等：已经标记过且结论一致的条目不会产生 diff，因此不会反复写盘。
 *
 * 同时处理两类失效引用：
 *   1. 结果图归档文件丢失（image.missing / archive_missing）
 *   2. 参考图缩略图归档丢失（references[].missing / reference_missing）
 */
export function annotateHistoryIntegrity(items) {
  const list = Array.isArray(items) ? items : [];
  const missingIds = [];
  let changed = false;
  const next = list.map((item) => {
    if (!item || typeof item !== "object") return item;
    const integrity = historyItemIntegrity(item);
    const image = item.image && typeof item.image === "object" ? item.image : null;
    const references = annotateReferences(item.references);
    let nextItem = item;

    if (references.changed) {
      changed = true;
      nextItem = { ...nextItem, references: references.references };
    }

    if (!image) return nextItem;

    const wasMissing = Boolean(image.missing);
    const wasReason = String(image.missingReason || "");
    if (integrity.missing) {
      // 统计必须在幂等判断之前：否则第二次读取时 missingIds 会是空的，
      // 摘要归零、repair 也会找不到失效条目（这个 bug 是被 history-repair-check 抓出来的）。
      missingIds.push(item.id);
      if (wasMissing && wasReason === integrity.reason) return nextItem; // 已标记且结论一致 → 不写盘
      changed = true;
      return {
        ...nextItem,
        image: { ...image, missing: true, missingReason: integrity.reason, missingCheckedAt: Date.now() }
      };
    }
    // 文件回来了（用户手动恢复归档）→ 把旧标记清掉，让卡片恢复正常
    if (wasMissing || wasReason) {
      changed = true;
      const { missing: _m, missingReason: _r, missingCheckedAt: _c, ...restImage } = image;
      return { ...nextItem, image: restImage };
    }
    return nextItem;
  });
  return { items: next, changed, missingIds };
}

/**
 * 首次修复前留一份专用备份，保证"改用户数据"这件事是可回退的。
 * 只在备份不存在时创建一次，不覆盖。
 */
export async function ensureHistoryRepairBackup() {
  const backupPath = path.join(dataDir, "history.pre-repair-backup.json");
  try {
    if (existsSync(backupPath)) return path.basename(backupPath);
    if (!existsSync(historyFile)) return "";
    await copyFile(historyFile, backupPath);
    return path.basename(backupPath);
  } catch {
    return "";
  }
}

export async function recoverHistoryFromImageFiles() {
  try {
    const entries = await readdir(historyImageDir, { withFileTypes: true });
    const imageEntries = entries.filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(entry.name));
    const recovered = await Promise.all(imageEntries.map(async (entry, index) => {
      const file = historyImagePath(entry.name);
      const info = await stat(file);
      return {
        id: `recovered_${info.mtimeMs}_${index}`,
        image: {
          type: "url",
          value: historyImageUrl(entry.name),
          archiveFile: entry.name,
          localUrl: historyImageUrl(entry.name)
        },
        prompt: "",
        modelLabel: "历史图片",
        imageSize: "",
        aspectRatio: "",
        referenceCount: 0,
        generationMs: null,
        recovered: true,
        createdAt: info.mtimeMs
      };
    }));
    return recovered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch {
    return [];
  }
}

export async function readHistoryResults() {
  // 2026-09-29（v3.7）：区分「history.json 不存在」与「history.json 存在但为空数组」。
  // 旧逻辑只要解析结果为空，就会继续从 history.backup.json、再退到扫描 history-images 目录，
  // 把记录"复活"回来。实测封装版里 357 条历史全部是 recovered=true（无提示词），
  // 因此用户点「清空全部」后重启，历史又全部出现。
  // 现在：只要 history.json 在，就完全以它的内容为准（空数组同样尊重），
  // 只有文件缺失或损坏时才走备份/图片扫描恢复，保留老用户迁移能力。
  if (existsSync(historyFile)) {
    const raw = await readFile(historyFile, "utf8").catch(() => null);
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        return (Array.isArray(parsed) ? parsed : []).map(normalizeHistoryItem).filter(Boolean);
      } catch {
        // JSON 损坏：继续走下面的备份 / 图片扫描恢复
      }
    }
  }

  const backup = (await readJsonArray(historyBackupFile)).map(normalizeHistoryItem).filter(Boolean);
  if (backup.length > 0) {
    await writeHistoryResults(backup);
    return backup;
  }

  const recovered = await recoverHistoryFromImageFiles();
  if (recovered.length > 0) {
    await writeHistoryResults(recovered);
  }
  return recovered;
}

// V47：history.json 的读-改-写必须整体串行——批量出图的 append 是即发即忘的，
// 两个 append 交错时后写者会基于旧 current 计算，把先写者的条目静默吞掉（丢历史）。
// 参照 server/core/asset-persist.js 的 withSaveFilenameLock 范式；失败也继续排。
let historyWriteChain = Promise.resolve();

function enqueueHistoryWrite(task) {
  const run = historyWriteChain.then(task, task);
  historyWriteChain = run.then(() => {}, () => {});
  return run;
}

async function writeHistoryFileAtomic(file, text) {
  const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    await writeFile(temporary, text, "utf8");
    await rename(temporary, file); // rename 覆盖已存在文件，原子替换
  } catch (error) {
    // V55：rename 失败（典型：Windows 下目标文件正被其他程序占用/锁定）时必须清掉
    // 临时文件，否则 data/ 里会永久积累 .tmp 残渣。unlink 失败不掩盖原始错误。
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

async function writeHistoryResultsUnlocked(results, options = {}) {
  const normalized = (Array.isArray(results) ? results : []).map(normalizeHistoryItem).filter(Boolean);
  await mkdir(dataDir, { recursive: true });
  await writeHistoryFileAtomic(historyFile, JSON.stringify(normalized, null, 2));
  if (normalized.length > 0 || options.replaceBackup) {
    await writeHistoryFileAtomic(historyBackupFile, JSON.stringify(normalized, null, 2));
  }
}

export async function writeHistoryResults(results, options = {}) {
  return enqueueHistoryWrite(() => writeHistoryResultsUnlocked(results, options));
}

export function mergeHistoryItem(existing, incoming) {
  if (!existing) return normalizeHistoryItem(incoming);
  const next = normalizeHistoryItem({ ...existing, ...incoming });
  if (existing.image?.archiveFile && incoming?.image && !incoming.image.archiveFile) {
    next.image = {
      ...incoming.image,
      archiveFile: existing.image.archiveFile,
      archiveMime: existing.image.archiveMime,
      localUrl: historyImageUrl(existing.image.archiveFile)
    };
  }
  if (Array.isArray(existing.references) && existing.references.length > 0 && !Array.isArray(incoming?.references)) {
    next.references = existing.references;
    next.referenceCount = existing.references.length;
  }
  return next;
}

export async function archiveHistoryItemImageFromBuffer(item, buffer, mimeType, sourceUrl = "") {
  const normalized = normalizeHistoryItem(item);
  const ext = imageExtensionFromType(mimeType, sourceUrl);
  const baseName = sanitizeFilePart(normalized?.id || `history_${Date.now()}`) || `history_${Date.now()}`;
  await mkdir(historyImageDir, { recursive: true });
  const target = await uniqueFilePath(historyImageDir, `${baseName}.${ext}`);
  await writeFile(target, buffer, { flag: "wx" });
  const archiveFile = path.basename(target);
  const localUrl = historyImageUrl(archiveFile);
  return normalizeHistoryItem({
    ...normalized,
    image: {
      type: "url",
      value: localUrl,
      archiveFile,
      archiveMime: mimeType || mimeTypeFromFile(archiveFile),
      localUrl,
      ...(sourceUrl ? { sourceUrl } : {})
    }
  });
}

export async function archiveIncomingHistoryItem(item, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  const normalized = normalizeHistoryItem(item);
  if (!normalized?.image || normalized.image.archiveFile || String(normalized.image.localUrl || "").startsWith("/api/history-image/")) {
    return normalized;
  }

  try {
    const { buffer, mimeType, sourceUrl } = await imageBufferFromPayload(normalized.image, timeoutMs);
    return archiveHistoryItemImageFromBuffer(normalized, buffer, mimeType, sourceUrl);
  } catch (error) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId: normalized.id || "history",
      ok: false,
      stage: "archive-history-image",
      error: error instanceof Error ? error.message : String(error)
    });
    return normalized;
  }
}

export async function appendHistoryResults(items) {
  return enqueueHistoryWrite(async () => {
    const rawIncoming = Array.isArray(items) ? items.filter((item) => item?.id) : [];
    const incoming = [];
    for (const item of rawIncoming) {
      const archived = await archiveIncomingHistoryItem(item);
      if (archived) incoming.push(archived);
    }
    if (incoming.length === 0) return [];
    const current = await readHistoryResults();
    const byId = new Map(current.map((item) => [item.id, item]));
    incoming.forEach((item) => {
      byId.set(item.id, mergeHistoryItem(byId.get(item.id), item));
    });
    const results = Array.from(byId.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    await writeHistoryResultsUnlocked(results);
    return results;
  });
}

export async function itemWithArchivedImage(item) {
  if (!item?.id || item.image?.archiveFile || String(item.image?.localUrl || "").startsWith("/api/history-image/")) {
    return item;
  }
  const historyItems = await readHistoryResults();
  const match = historyItems.find((historyItem) => historyItem.id === item.id);
  if (!match?.image?.archiveFile && !String(match?.image?.localUrl || "").startsWith("/api/history-image/")) {
    return item;
  }
  return {
    ...item,
    image: match.image
  };
}
