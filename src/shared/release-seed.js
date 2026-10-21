// release-seed.js —— 封装种子机制（V121）：种子导入（客户首跑）+ 种子导出（源码版用户）+ 下载。
//
// 仅在 public 发布模式做导入；导出仅供源码版用户在设置页触发（客户端不显示导出按钮）。
//
// 设计要点（与执行单 §1.1/§1.4 对齐）：
//   · 白名单 / 剥凭据的「唯一实现」在 release-seed-schema.js（纯模块，Node 与浏览器共用）；
//     本文件 import 复用，绝不另写一份。
//   · id → 运行期目标键 的映射写死本模块，且一律用各模块导出的**常量**（不写死字符串）；
//     public 模式下这些常量会被 import.meta.env（VITE_JINGYIN_STORAGE_PREFIX）解析成发布前缀，
//     因此种子目标键始终对应当前运行环境的真实键。
//   · importReleaseSeed 被串在 publicReleaseStorageResetPromise 之后（storage-store.js），
//     在 reset 清空目标键、删掉草稿 IndexedDB 之后填空；main.jsx 的 render 门禁天然成为导入完成的闸门。
//   · 网络出口走 src/api/ 准入层（V121-R1 统筹裁决，P7-6「网络出口只此一处」口径）：
//     种子清单读取用 api/assets.js 的 fetchSeedManifest，本模块不出现裸 fetch。
//   · outfit 侧存储键一律从零依赖叶子模块 outfit-storage-keys.js 取（V121-R2）——
//     本模块在启动链路上，**禁止** import outfit-top.js / outfit-panels.jsx 等特性模块群
//     （既有相互循环 + public 模式启动即挂载 outfit 视图 ⇒ 打包后模块初始化期 TDZ 白屏）。

import { readJsonStorage, writeJsonStorage } from "../lib/storage/json-storage.js";
import { fetchSeedManifest } from "../api/assets.js";
import { syncSeedManifest } from "../api/seed.js";
import {
  PUBLIC_RELEASE_MODE,
  STORAGE_PREFIX,
  PROMPT_PRESETS_KEY,
  PROMPT_CATEGORIES_KEY,
  DETAIL_PRESETS_KEY,
  DETAIL_GROUPS_KEY
} from "./app-defaults.js";
import {
  OUTFIT_DELETED_WORKFLOW_MODES_KEY,
  OUTFIT_PAGES_KEY,
  PROMPT_CATEGORIES_KEY as OUTFIT_PROMPT_CATEGORIES_KEY,
  PROMPT_PRESETS_KEY as OUTFIT_PROMPT_PRESETS_KEY,
  RESIZE_BATCH_CROP_KEY,
  RESIZE_SETTINGS_KEY,
  STORAGE_KEY as OUTFIT_SETTINGS_KEY
} from "../features/outfit/outfit-storage-keys.js";
import { SPLIT_HALVES_STORAGE_KEY } from "./image-split.js";
import { loadPromptLibraryPresets, loadPromptLibraryCategories } from "./prompt-library.js";

import {
  sanitizeOutfitPage,
  sanitizePromptPreset,
  stripCredentials,
  fnv1a32Hex
} from "./release-seed-schema.js";

const SEED_IMPORTED_PREFIX = `${STORAGE_PREFIX}-seed-imported-`;
// 个别 entry 的原始存储不是 JSON（如 split-halves 存 "0"/"1" 字符串），需按原样读写。
const RAW_STRING_ENTRY_IDS = new Set(["white-refine-split-halves"]);

// id → 运行期目标键映射（全部使用各模块导出的常量，不写死字符串）。
const SEED_TARGET_KEYS = {
  "main-prompt-presets": PROMPT_PRESETS_KEY,
  "main-prompt-categories": PROMPT_CATEGORIES_KEY,
  "outfit-prompt-presets": OUTFIT_PROMPT_PRESETS_KEY,
  "outfit-prompt-categories": OUTFIT_PROMPT_CATEGORIES_KEY,
  "outfit-pages": OUTFIT_PAGES_KEY,
  "outfit-deleted-modes": OUTFIT_DELETED_WORKFLOW_MODES_KEY,
  "outfit-settings": OUTFIT_SETTINGS_KEY,
  "resize-settings": RESIZE_SETTINGS_KEY,
  "resize-batch-crop": RESIZE_BATCH_CROP_KEY,
  "detail-presets": DETAIL_PRESETS_KEY,
  "detail-groups": DETAIL_GROUPS_KEY,
  "white-refine-split-halves": SPLIT_HALVES_STORAGE_KEY
};

function safeGetRaw(key) {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

/**
 * 导出当前运行环境里的封装种子（源码版用户点「导出封装种子」时调用）。
 * 仅收集「有内容」的 entry；空值一律不写入（种子只含有内容的项）。
 * 返回 { version, seedId, entries }；若没有任何可导出内容，entries 为空数组。
 */
export function buildReleaseSeed() {
  const entries = [];

  // 提示词两类键：走共享加载器口径，保证「用户看到什么导什么」（main / outfit 双键都随包）。
  const mainPresets = loadPromptLibraryPresets({ presetsKey: PROMPT_PRESETS_KEY })
    .map(sanitizePromptPreset).filter(Boolean);
  if (mainPresets.length) {
    entries.push({ id: "main-prompt-presets", sourceKey: PROMPT_PRESETS_KEY, value: mainPresets });
  }
  const mainCategories = loadPromptLibraryCategories({
    categoriesKey: PROMPT_CATEGORIES_KEY,
    presetsKey: PROMPT_PRESETS_KEY
  });
  if (Array.isArray(mainCategories) && mainCategories.length) {
    entries.push({ id: "main-prompt-categories", sourceKey: PROMPT_CATEGORIES_KEY, value: mainCategories });
  }
  const outfitPresets = loadPromptLibraryPresets({ presetsKey: OUTFIT_PROMPT_PRESETS_KEY })
    .map(sanitizePromptPreset).filter(Boolean);
  if (outfitPresets.length) {
    entries.push({ id: "outfit-prompt-presets", sourceKey: OUTFIT_PROMPT_PRESETS_KEY, value: outfitPresets });
  }
  const outfitCategories = loadPromptLibraryCategories({
    categoriesKey: OUTFIT_PROMPT_CATEGORIES_KEY,
    presetsKey: OUTFIT_PROMPT_PRESETS_KEY
  });
  if (Array.isArray(outfitCategories) && outfitCategories.length) {
    entries.push({ id: "outfit-prompt-categories", sourceKey: OUTFIT_PROMPT_CATEGORIES_KEY, value: outfitCategories });
  }

  // outfit 页面：读原始存储（已保存态），逐页过白名单；不重新 normalize，保证与用户已保存逐字一致。
  const rawPages = readJsonStorage(OUTFIT_PAGES_KEY, null);
  if (Array.isArray(rawPages) && rawPages.length) {
    const pages = rawPages.map(sanitizeOutfitPage).filter(Boolean);
    if (pages.length) {
      entries.push({ id: "outfit-pages", sourceKey: OUTFIT_PAGES_KEY, value: pages });
    }
  }
  const deletedModes = readJsonStorage(OUTFIT_DELETED_WORKFLOW_MODES_KEY, null);
  if (Array.isArray(deletedModes) && deletedModes.length) {
    entries.push({ id: "outfit-deleted-modes", sourceKey: OUTFIT_DELETED_WORKFLOW_MODES_KEY, value: deletedModes });
  }

  // settings 状对象：剥凭据后导出（红线①：不得随包任何 KEY）。
  const outfitSettings = readJsonStorage(OUTFIT_SETTINGS_KEY, null);
  if (outfitSettings && typeof outfitSettings === "object") {
    const cleaned = stripCredentials(outfitSettings);
    if (cleaned && typeof cleaned === "object" && Object.keys(cleaned).length) {
      entries.push({ id: "outfit-settings", sourceKey: OUTFIT_SETTINGS_KEY, value: cleaned });
    }
  }
  const resizeSettings = readJsonStorage(RESIZE_SETTINGS_KEY, null);
  if (resizeSettings && typeof resizeSettings === "object" && Object.keys(resizeSettings).length) {
    entries.push({ id: "resize-settings", sourceKey: RESIZE_SETTINGS_KEY, value: resizeSettings });
  }
  const resizeBatchCrop = readJsonStorage(RESIZE_BATCH_CROP_KEY, null);
  if (resizeBatchCrop && typeof resizeBatchCrop === "object" && Object.keys(resizeBatchCrop).length) {
    entries.push({ id: "resize-batch-crop", sourceKey: RESIZE_BATCH_CROP_KEY, value: resizeBatchCrop });
  }

  // 详情双键。
  const detailPresets = readJsonStorage(DETAIL_PRESETS_KEY, null);
  if (Array.isArray(detailPresets) && detailPresets.length) {
    entries.push({ id: "detail-presets", sourceKey: DETAIL_PRESETS_KEY, value: detailPresets });
  }
  const detailGroups = readJsonStorage(DETAIL_GROUPS_KEY, null);
  if (Array.isArray(detailGroups) && detailGroups.length) {
    entries.push({ id: "detail-groups", sourceKey: DETAIL_GROUPS_KEY, value: detailGroups });
  }

  // white-refine-split-halves：原始存储是 "0"/"1" 字符串（非 JSON），按原样导出。
  const splitRaw = safeGetRaw(SPLIT_HALVES_STORAGE_KEY);
  if (splitRaw === "0" || splitRaw === "1") {
    entries.push({ id: "white-refine-split-halves", sourceKey: SPLIT_HALVES_STORAGE_KEY, value: splitRaw });
  }

  const seedId = fnv1a32Hex(JSON.stringify(entries));
  return { version: 1, seedId, entries };
}

/**
 * 客户首跑导入种子（被串在 publicReleaseStorageResetPromise 之后）。
 * 行为铁律：
 *   · 非 public 模式 → 立即 resolve（internal 模式零影响）；
 *   · 读一次性标记 {STORAGE_PREFIX}-seed-imported-{seedId}：已导过这份种子 → 跳过；
 *   · 经 src/api/assets.js 的 fetchSeedManifest 读 /seed/manifest.json（3s 超时）；
 *     404/网络失败/JSON 坏 → catch 后 resolve，不阻断启动；
 *   · 逐 entry：目标键为空/null/空数组/空对象才写入；非空（回头客已有数据）→ 跳过不覆盖（红线③）；
 *   · 全部处理完写一次性标记。
 */
export async function importReleaseSeed() {
  if (!PUBLIC_RELEASE_MODE) return;

  let manifest;
  try {
    manifest = await fetchSeedManifest();
  } catch {
    return; // 404 / 超时 / 网络失败 / JSON 坏 → 不阻断启动
  }
  if (!manifest || !Array.isArray(manifest.entries)) return;

  const seedId = String(manifest.seedId || "");
  if (!seedId) return;

  const markerKey = `${SEED_IMPORTED_PREFIX}${seedId}`;
  // 同一份种子只导一次；换种子（seedId 变）→ 重新评估。
  if (readJsonStorage(markerKey, null) === seedId) return;

  for (const entry of manifest.entries) {
    const targetKey = SEED_TARGET_KEYS[entry?.id];
    if (!targetKey) continue; // 未知 id 不写未知键

    if (RAW_STRING_ENTRY_IDS.has(entry.id)) {
      // 原始字符串存储（如 split-halves 的 "0"/"1"）：回头客已有数据则不覆盖。
      if (safeGetRaw(targetKey) != null) continue;
      try {
        localStorage.setItem(targetKey, String(entry.value));
      } catch {}
      continue;
    }

    const existing = readJsonStorage(targetKey, null);
    const isEmpty = existing == null
      || (Array.isArray(existing) && existing.length === 0)
      || (typeof existing === "object" && !Array.isArray(existing) && Object.keys(existing).length === 0);
    if (isEmpty) {
      try {
        writeJsonStorage(targetKey, entry.value);
      } catch {}
    }
  }

  try {
    writeJsonStorage(markerKey, seedId);
  } catch {}
}

/**
 * 触发浏览器下载当前种子（设置页「导出封装种子」按钮调用）。
 * 无内容可导出时返回 null（调用方据此给提示）。
 */
export function downloadReleaseSeed() {
  if (typeof document === "undefined") return null;
  const manifest = buildReleaseSeed();
  if (!manifest.entries || manifest.entries.length === 0) return null;

  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  let url = null;
  try {
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jingyin-seed-${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    if (url) URL.revokeObjectURL(url);
    return null;
  }
  if (url) setTimeout(() => URL.revokeObjectURL(url), 0);
  return manifest;
}

/**
 * V123：把当前浏览器里的封装种子同步进仓库 `seed/manifest.json`（经 `/api/seed-sync`）。
 * 仅 internal/开发模式可用（public 构建无此路由、且不渲染按钮）。
 *
 * 行为：
 *   · 调 buildReleaseSeed() 收集当前状态；
 *   · entries 为空 → 返回 { ok:false, reason:"empty", message }（与 downloadReleaseSeed 的 null 口径一致，调用方据此提示）；
 *   · 非空 → POST /api/seed-sync（body = manifest）→ 返回 { ok:true, syncedAt, seedId, entriesCount }；
 *   · 网络/服务端拒收 → 返回 { ok:false, reason:"network"|"rejected", message }（调用方据此可见反馈，不许静默失败）。
 *
 * 网络出口纪律（P7-1 / V121-R1 同款口径）：本函数**不出现裸 fetch**，统一走 src/api/seed.js 的 syncSeedManifest。
 */
export async function syncReleaseSeed() {
  const manifest = buildReleaseSeed();
  if (!manifest.entries || manifest.entries.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "当前没有可同步的提示词模板或页面状态"
    };
  }
  try {
    const res = await syncSeedManifest(manifest);
    return {
      ok: true,
      syncedAt: res?.syncedAt || new Date().toISOString(),
      seedId: res?.seedId || manifest.seedId,
      entriesCount: res?.entriesCount ?? manifest.entries.length
    };
  } catch (err) {
    const message = err?.message || String(err);
    return {
      ok: false,
      reason: "network",
      message
    };
  }
}
