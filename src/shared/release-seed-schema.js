// release-seed-schema.js —— 封装种子（V121）的「字段白名单 + 剥凭据」纯模块。
//
// 为什么单独成文件、且必须是纯模块：
//   1) 同一份实现要同时给两处复用——浏览器侧的 buildReleaseSeed（src/shared/release-seed.js）
//      与 Node 构建脚本 scripts/secure-win-release.mjs 的校验。若把白名单写在
//      release-seed.js 里，Node 侧 import 它会连带把 app-defaults.js（用 import.meta.env）
//      一并拉起来，在 Node 里直接抛错。所以这里只放「无浏览器依赖、无 import.meta.env、无
//      React」的纯逻辑，两侧都从这里 import，保证「同一实现、不许两份」。
//   2) 这里是红线①/②/③/④的硬边界——任何随包分发的种子都要先过这里的白名单与剥凭据：
//      · pages 禁项 6 个（C 类图片/任务数据不得随包）；
//      · 提示词仅 5 字段；
//      · 任何深度出现的 apiKey/baseUrl/channelId 一律删除（红线①）；
//      · 任何深度出现的图片记录键（IMAGE_RECORD_KEYS：上传/生成图、图片名、槽位、任务历史）一律删除（红线②，V126）。
//
// 该模块不依赖任何运行期 API，可被 Node 直接 import。

/** outfit 页白名单（serializeOutfitPage 口径的超集收紧）：仅这 6 个字段可随包。 */
export const OUTFIT_PAGE_ALLOWED_FIELDS = [
  "id",
  "name",
  "deleteLocked",
  "settings",
  "uploadLabels",
  "activeUploadGroup"
];

/** outfit 页禁项（C 类：图片/任务数据，绝对不得随包分发）。 */
export const OUTFIT_PAGE_FORBIDDEN_FIELDS = [
  "modelImages",
  "clothingImages",
  "referenceImages",
  "originalLibrary",
  "fixedClothingId",
  "tasks"
];

/**
 * 生图记录键（V126，红线②）：任何深度出现即剥（stripImageRecords）/即拒（containsImageRecords）。
 * 只认结构键名、不认字符串内容——用户提示词正文出现 "image.png" 之类字样不得误杀。
 * 覆盖三类来源：
 *   · outfit 页面域（与 OUTFIT_PAGE_FORBIDDEN_FIELDS 同源，白名单外的第二道深剥）；
 *   · 详情组域（V126 实测泄漏点：productImageNames / imageSlots 等文件名字段）；
 *   · 通用任务历史键。
 */
export const IMAGE_RECORD_KEYS = [
  "modelImages",
  "clothingImages",
  "referenceImages",
  "originalLibrary",
  "fixedClothingId",
  "tasks",
  "taskHistory",
  "productFiles",
  "referenceFiles",
  "productImageNames",
  "referenceImageNames",
  "imageSlots",
  "imageFacts"
];

/** 提示词预设白名单：仅这 5 个字段（normalizePromptPreset 产出即此形态）。 */
export const PROMPT_PRESET_ALLOWED_FIELDS = ["id", "title", "category", "content", "custom"];

/** 剥凭据字段：任何深度出现即删（红线①）。 */
export const CREDENTIAL_FIELDS = ["apiKey", "baseUrl", "channelId"];

/** 合法 seed entry id 全集（构建校验与导入解析共用，单一真相源）。 */
export const SEED_ENTRY_IDS = [
  "main-prompt-presets",
  "main-prompt-categories",
  "outfit-prompt-presets",
  "outfit-prompt-categories",
  "outfit-pages",
  "outfit-deleted-modes",
  "outfit-settings",
  "resize-settings",
  "resize-batch-crop",
  "detail-presets",
  "white-refine-split-halves"
];
// V126：detail-groups 已移出种子范围——该 entry 本质是「生图工作区状态」
// （prompts[].results 持生成图 URL/archiveFile、analysis.imageFacts 持上传图事实、
// prompts[].text 正文嵌图片文件名），键级剥不净，随包即向客户分发开发者生成历史（红线②）。
// 客户详情页从空白自建项目；详情预设（detail-presets，纯配置）仍随包。

/**
 * 递归剥凭据：删除任何深度出现的 CREDENTIAL_FIELDS 键，其余原样保留。
 * 用于 outfit-settings 及任何 settings 状对象（红线①：前端不能出现 KEY 的记录随包）。
 */
export function stripCredentials(value) {
  if (Array.isArray(value)) return value.map(stripCredentials);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (CREDENTIAL_FIELDS.includes(key)) continue;
      out[key] = stripCredentials(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * 深度扫描是否含有任一凭据字段（用于构建期复核：一旦发现即判定种子非法、构建失败）。
 */
export function containsCredentialFields(value) {
  if (Array.isArray(value)) return value.some(containsCredentialFields);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (CREDENTIAL_FIELDS.includes(key)) return true;
      if (containsCredentialFields(value[key])) return true;
    }
  }
  return false;
}

/**
 * V126（红线②）：递归剥除任何深度出现的 IMAGE_RECORD_KEYS，其余原样保留。
 * 与 stripCredentials 同形态；用于种子出口最终关口 / 服务端写入复核 / manifest 清理。
 */
export function stripImageRecords(value) {
  if (Array.isArray(value)) return value.map(stripImageRecords);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (IMAGE_RECORD_KEYS.includes(key)) continue;
      out[key] = stripImageRecords(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * V126（红线②）：深度扫描是否含有任一图片记录键（构建期/服务端拒收判定：发现即非法）。
 */
export function containsImageRecords(value) {
  if (Array.isArray(value)) return value.some(containsImageRecords);
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (IMAGE_RECORD_KEYS.includes(key)) return true;
      if (containsImageRecords(value[key])) return true;
    }
  }
  return false;
}

/**
 * outfit 页序列化（白名单收紧版）：仅保留允许字段；settings 整体过剥凭据。
 * 比 outfit-page-actions.js 的 serializeOutfitPage 更紧——多剔除了 C 类图片/任务字段。
 * 返回 null 表示入参不是合法 page 对象。
 */
export function sanitizeOutfitPage(page) {
  if (!page || typeof page !== "object") return null;
  const out = {};
  for (const field of OUTFIT_PAGE_ALLOWED_FIELDS) {
    if (field === "settings") {
      out.settings = stripCredentials(page.settings && typeof page.settings === "object" ? page.settings : {});
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(page, field)) {
      out[field] = page[field];
    }
  }
  return out;
}

/** 提示词预设白名单（仅 5 字段）。返回 null 表示入参不是合法 preset 对象。 */
export function sanitizePromptPreset(preset) {
  if (!preset || typeof preset !== "object") return null;
  const out = {};
  for (const field of PROMPT_PRESET_ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(preset, field)) {
      out[field] = preset[field];
    }
  }
  return out;
}

/**
 * FNV-1a 32-bit 哈希 → 8 位十六进制串（小写）。
 * 用于种子 seedId：由 entries 内容算出，更新种子即变，保证「换种子重新评估」。
 * 注：对 UTF-16 code unit 做哈希，仅作内容指纹，足够判定内容是否变化。
 */
export function fnv1a32Hex(input) {
  const str = String(input ?? "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
