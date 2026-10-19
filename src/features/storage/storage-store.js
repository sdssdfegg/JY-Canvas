// storage-store.js —— RF-082 从 src/main.jsx 逐字抽出（加 export），未改逻辑。
import { ACTIVE_VIEW_KEY, DETAIL_GROUPS_KEY, DETAIL_PRESETS_KEY, PUBLIC_RELEASE_MODE, PUBLIC_RELEASE_RESET_KEY, STORAGE_KEY, STORAGE_PREFIX, defaultState } from "../../shared/app-defaults.js";
import { BookOpen, Brush, Crop, FileText, Layers, Sparkles, Wand2 } from "lucide-react";
import { readJsonStorage, removeStorageItem, writeJsonStorage } from "../../lib/storage/json-storage.js";
import { canonicalModel } from "../../shared/routing.js";
import { appendHistoryResults, deleteHistoryResults, getHistoryResults } from "../../api/history.js";

export const LEGACY_STORAGE_KEYS = STORAGE_PREFIX === "jingyin-internal" ? ["jingyin-internal-settings-v2"] : [];

export const HISTORY_DB_NAME = `${STORAGE_PREFIX}-history`;

export const HISTORY_DB_VERSION = 1;

export const HISTORY_STORE_NAME = "results";

export const HISTORY_FALLBACK_KEY = `${STORAGE_PREFIX}-history-fallback-v1`;

export const navItems = [
  { id: "quickgen", label: "快捷生成", icon: Sparkles },
  { id: "outfit", label: "批量生成", icon: Wand2 },
  { id: "image-editor", label: "图片编辑", icon: Brush },
  { id: "resize", label: "批量改尺寸", icon: Crop },
  { id: "reference-remix", label: "参考生图", icon: Layers },
  { id: "detail-main", label: "一键详情/主图", icon: FileText },
  { id: "prompts", label: "提示词助手", icon: BookOpen }
];

export const ACTIVE_VIEW_IDS = new Set(navItems.filter((item) => item.id !== "prompts").map((item) => item.id));

export const DEFAULT_ACTIVE_VIEW = PUBLIC_RELEASE_MODE ? "outfit" : "quickgen";

export function normalizeActiveView(value) {
  return ACTIVE_VIEW_IDS.has(value) ? value : DEFAULT_ACTIVE_VIEW;
}

export function loadActiveView() {
  return normalizeActiveView(readJsonStorage(ACTIVE_VIEW_KEY, DEFAULT_ACTIVE_VIEW));
}

export function deleteIndexedDbSafely(name) {
  if (typeof window === "undefined" || !window.indexedDB || !name) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function runPublicReleaseStorageReset() {
  if (!PUBLIC_RELEASE_MODE || typeof window === "undefined" || !window.localStorage) {
    return Promise.resolve();
  }

  try {
    const resetMarker = readJsonStorage(PUBLIC_RELEASE_RESET_KEY, localStorage.getItem(PUBLIC_RELEASE_RESET_KEY));
    if (resetMarker === "done") {
      return Promise.resolve();
    }

    // V118（用户硬要求）：提示词助手的预设/分类属于**用户自建资产**，任何发布重置都不得清除
    // —— 用户会把模板写给客户用，丢了就是不可恢复的事故。下面这些键**不在**重置清单内：
    // PROMPT_PRESETS_KEY / PROMPT_CATEGORIES_KEY 及其历史版本键
    //（jingyin-outfit-workflow-prompt-library-v1 / -v2-20260802 等同族键）。
    [
      STORAGE_KEY,
      ACTIVE_VIEW_KEY,
      DETAIL_PRESETS_KEY,
      DETAIL_GROUPS_KEY,
      "jingyin-infinite-canvases-v1",
      "jingyin-outfit-workflow-task-history-v1",
      "jingyin-outfit-workflow-settings-v1",
      "jingyin-outfit-workflow-pages-v1",
      "jingyin-outfit-workflow-resize-settings-v3",
      "jingyin-outfit-workflow-resize-batch-crop-v1",
      HISTORY_FALLBACK_KEY
    ].forEach((key) => removeStorageItem(key));

    writeJsonStorage(PUBLIC_RELEASE_RESET_KEY, "done");
  } catch {
    // Public release packages should still start if storage cleanup is blocked.
  }

  return Promise.all([
    deleteIndexedDbSafely(HISTORY_DB_NAME),
    deleteIndexedDbSafely("jingyin-public-clean-20260728-history"),
    deleteIndexedDbSafely("jingyin-public-clean-history"),
    deleteIndexedDbSafely("jingyin-internal-history"),
    deleteIndexedDbSafely("jingyin-outfit-workflow-local-v1"),
    deleteIndexedDbSafely("jingyin-image-editor-v1")
  ]).then(() => undefined);
}

export const publicReleaseStorageResetPromise = runPublicReleaseStorageReset();

export function loadState() {
  const stored = readJsonStorage(STORAGE_KEY, null)
    || LEGACY_STORAGE_KEYS.map((key) => readJsonStorage(key, null)).find(Boolean)
    || {};
  const { baseUrl: _discardedBaseUrl, ...safeStored } = stored;
  const merged = { ...defaultState, ...safeStored, baseUrl: defaultState.baseUrl };
  merged.model = canonicalModel(merged.model);
  merged.dispatchMode = "manual";
  return merged;
}

export function sanitizeStoredImage(image) {
  if (!image || typeof image !== "object") return null;
  if (image.localUrl || image.archiveFile || image.type === "url") {
    return {
      type: image.type || "url",
      value: image.value || image.localUrl || "",
      ...(image.localUrl ? { localUrl: image.localUrl } : {}),
      ...(image.archiveFile ? { archiveFile: image.archiveFile } : {}),
      ...(image.archiveMime ? { archiveMime: image.archiveMime } : {})
    };
  }
  if (image.type === "b64_json") {
    return { type: "b64_json", value: "" };
  }
  return null;
}

export function openHistoryDb() {
  if (!window.indexedDB) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(HISTORY_DB_NAME, HISTORY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE_NAME)) {
        db.createObjectStore(HISTORY_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function waitForTransaction(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadHistoryResults() {
  await publicReleaseStorageResetPromise;

  try {
    const payload = await getHistoryResults();
    if (Array.isArray(payload.results)) {
      return payload.results.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
  } catch {
    // Browser-only preview can still use local history below.
  }

  try {
    const db = await openHistoryDb();
    if (!db) return readJsonStorage(HISTORY_FALLBACK_KEY, []);

    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(HISTORY_STORE_NAME, "readonly");
      const store = transaction.objectStore(HISTORY_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        resolve((request.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => db.close();
    });
  } catch {
    return readJsonStorage(HISTORY_FALLBACK_KEY, []);
  }
}

export async function saveHistoryResults(items) {
  if (!items?.length) return;
  try {
    await appendHistoryResults(items);
    return;
  } catch {
    // Fall back to browser storage below.
  }

  try {
    const db = await openHistoryDb();
    if (!db) {
      const current = readJsonStorage(HISTORY_FALLBACK_KEY, []);
      writeJsonStorage(HISTORY_FALLBACK_KEY, [...items, ...current].map((item) => ({
        ...item,
        image: sanitizeStoredImage(item.image)
      })).slice(0, 120));
      return;
    }

    const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(HISTORY_STORE_NAME);
    items.forEach((item) => store.put(item));
    await waitForTransaction(transaction);
    db.close();
  } catch {
    const current = readJsonStorage(HISTORY_FALLBACK_KEY, []);
    writeJsonStorage(HISTORY_FALLBACK_KEY, [...items, ...current].map((item) => ({
      ...item,
      image: sanitizeStoredImage(item.image)
    })).slice(0, 120));
  }
}

export async function removeHistoryResults(ids) {
  if (!ids?.length) return;
  try {
    await deleteHistoryResults(ids);
    return;
  } catch {
    // Fall back to browser storage below.
  }

  try {
    const db = await openHistoryDb();
    if (!db) {
      const current = readJsonStorage(HISTORY_FALLBACK_KEY, []);
      writeJsonStorage(HISTORY_FALLBACK_KEY, current.filter((item) => !ids.includes(item.id)).map((item) => ({
        ...item,
        image: sanitizeStoredImage(item.image)
      })).slice(0, 120));
      return;
    }

    const transaction = db.transaction(HISTORY_STORE_NAME, "readwrite");
    const store = transaction.objectStore(HISTORY_STORE_NAME);
    ids.forEach((id) => store.delete(id));
    await waitForTransaction(transaction);
    db.close();
  } catch {
    const current = readJsonStorage(HISTORY_FALLBACK_KEY, []);
    writeJsonStorage(HISTORY_FALLBACK_KEY, current.filter((item) => !ids.includes(item.id)).map((item) => ({
      ...item,
      image: sanitizeStoredImage(item.image)
    })).slice(0, 120));
  }
}

/**
 * 2026-09-29（v3.7）：把字节数格式化成人类可读的存储占用文案。
 * 只用于设置页的"数据与存储"区块，不做任何业务计算。
 */
export function formatStorageSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 100 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}
