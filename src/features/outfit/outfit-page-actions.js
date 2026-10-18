// src/features/outfit/outfit-page-actions.js
// V64 (P5-2) 2026-10-15：从 outfit-top.js 拆出的「页面生命周期」层（L1）。
// 内容：页面名判定/旧名迁移、上传标签与提示词默认值、工作流模式推断、页面设置
//   normalize/strip/merge、9 个 make*Page 工厂、ensureWorkflowPages、页面序列化/读取/初页挑选，
//   以及换装草稿（页面 + 图片项）的序列化·水合·持久化（persist/loadOutfitDraftState 一族依赖
//   makeOutfitPage/ensureWorkflowPages 重建页面，随页面域落本文件，见 V4.0-执行单-V64 阶段A）。
// 分层：只 import L0（./outfit-top.js）与外部模块；不 import 另一个 L1（outfit-image-pipeline.js）。

import { normalizeApiKeyInput } from "../auth/api-key.js";
import { DEFAULT_PREPROCESS_MODE, makeId } from "./outfit-panels.jsx";
import { OUTFIT_DRAFT_DB_KEY, hydrateTasksWithUploadReferences, normalizeCropReturnMeta, normalizeQualityCheck, normalizeRandomBackgroundFocus, outfitLocalGet, outfitLocalSet, readTaskHistory, recoverPersistedTasks, sanitizeTaskHistoryItem } from "./outfit-task.js";
import { readJsonStorage, writeJsonStorage } from "../../lib/storage/json-storage.js";
import { LOCAL_EDIT_BRUSH_DEFAULT, LOCAL_EDIT_MASK_OPACITY_DEFAULT, LOCAL_EDIT_RECT_MODE } from "../../shared/local-edit-mask.js";
import { normalizeOutfitIntent } from "../../shared/outfit-intent.js";
import { WHITE_REFINE_BATCH_LEGACY_DEFAULT_PROMPT, WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT, WHITE_REFINE_DEFAULT_PROMPT, normalizeRetouchIntent } from "../../shared/retouch-intent.js";
import { BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY, GENERATION_COUNT_AUTOLINK_MIGRATION_KEY, OUTFIT_PAGES_KEY, OUTFIT_DELETED_WORKFLOW_MODES_KEY, DEFAULT_OUTFIT_PAGE_NAME, DEFAULT_POSE_REMIX_PAGE_NAME, DEFAULT_LOCAL_DETAIL_PAGE_NAME, DEFAULT_BACKGROUND_CHANGE_PAGE_NAME, DEFAULT_RANDOM_BACKGROUND_PAGE_NAME, DEFAULT_OUTPAINT_PAGE_NAME, DEFAULT_RECOLOR_PAGE_NAME, DEFAULT_WHITE_REFINE_PAGE_NAME, DEFAULT_FACE_SWAP_PAGE_NAME, DEFAULT_DESIGN_DRAFT_PAGE_NAME, SINGLETON_WORKFLOW_MODES, POSE_REMIX_DEFAULT_PROMPT, POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT, FACE_SWAP_SHORT_DEFAULT_PROMPT, FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT, FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT, FACE_SWAP_DEFAULT_PROMPT, FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT, FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT, LEGACY_FACE_SWAP_DEFAULT_PROMPT, FACE_SWAP_LOOSE_DEFAULT_PROMPT, BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT, BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT, BACKGROUND_CHANGE_DEFAULT_PROMPT, RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT, RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT, RANDOM_BACKGROUND_RELIGHT_LEGACY_DEFAULT_PROMPT, RANDOM_BACKGROUND_DEFAULT_PROMPT, RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT, OUTPAINT_DEFAULT_PROMPT, RECOLOR_COLOR_LEGACY_DEFAULT_PROMPT, RECOLOR_DEFAULT_PROMPT, DESIGN_DRAFT_DEFAULT_PROMPT, DEFAULT_BATCH_CONCURRENCY, DEFAULT_GARMENT_PARTS, DEFAULT_GARMENT_COMPOSITION, DEFAULT_UPLOAD_LABELS, POSE_REMIX_UPLOAD_LABELS, LEGACY_POSE_REMIX_UPLOAD_LABELS, LOCAL_DETAIL_UPLOAD_LABELS, CUSTOM_UPLOAD_LABELS, BACKGROUND_CHANGE_UPLOAD_LABELS, RANDOM_BACKGROUND_UPLOAD_LABELS, RECOLOR_UPLOAD_LABELS, LEGACY_WHITE_REFINE_UPLOAD_LABELS_1, LEGACY_WHITE_REFINE_UPLOAD_LABELS_2, WHITE_REFINE_UPLOAD_LABELS, OUTPAINT_UPLOAD_LABELS, POSE_MOTHER_FACE_SWAP_UPLOAD_LABELS, FACE_SWAP_UPLOAD_LABELS, LEGACY_FACE_SWAP_UPLOAD_LABELS, DESIGN_DRAFT_UPLOAD_LABELS, OUTFIT_DEFAULT_PROMPT, LOCAL_DETAIL_DEFAULT_PROMPT, shouldRepairOutfitPrompt, normalizeSmartIntervention, normalizeGarmentParts, normalizeGarmentComposition, defaultSettings, readSettings, normalizeTheme, normalizeGenerationCount, normalizeBatchConcurrency, shouldUpgradeLegacyBatchConcurrency } from "./outfit-top.js";

export function normalizeOutfitPageName(value, fallback = DEFAULT_OUTFIT_PAGE_NAME) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  // 旧名字（批量换装 / 批量AI换装 / 批量生成）统一迁移到新的短名字「换装」。
  if (name === "批量AI换装" || name === "批量生成" || name === "批量换装") return DEFAULT_OUTFIT_PAGE_NAME;
  if (/批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(name)) return DEFAULT_POSE_REMIX_PAGE_NAME;
  if (/局部细节|局部精修|局部贴回|local\s*detail/i.test(name)) return DEFAULT_LOCAL_DETAIL_PAGE_NAME;
  if (/随机背景|随机场景|随机实景|random\s*background/i.test(name)) return DEFAULT_RANDOM_BACKGROUND_PAGE_NAME;
  if (/换固定背景|固定背景|换背景|換背景|背景更换|背景替换|换场景|換場景/i.test(name)) return DEFAULT_BACKGROUND_CHANGE_PAGE_NAME;
  if (/批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(name)) return DEFAULT_OUTPAINT_PAGE_NAME;
  // 「精修」是新的短名字；旧的「批量白底（图）精修」仍然识别，老存档读取时自动迁移。
  if (/精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(name)) return DEFAULT_WHITE_REFINE_PAGE_NAME;
  return (name || fallback).slice(0, 18);
}
export function isPoseRemixPageName(value) {
  return /批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|固定成片|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(String(value || ""));
}
export function isLocalDetailPageName(value) {
  return /局部回贴|局部贴回|局部细节|局部精修|local\s*detail/i.test(String(value || ""));
}
export function isBackgroundChangePageName(value) {
  return /换固定背景|固定背景|换背景|換背景|背景更换|背景替换|换场景|換場景|场景图|统一场景/i.test(String(value || ""));
}
export function isRandomBackgroundPageName(value) {
  return /随机背景|随机场景|随机实景|random\s*background/i.test(String(value || ""));
}
export function isOutpaintPageName(value) {
  return /批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(String(value || ""));
}
export function isRecolorPageName(value) {
  return /批量改色|改色|换色|服装改色|颜色替换|颜色参考|recolor/i.test(String(value || ""));
}
export function isWhiteRefinePageName(value) {
  return /精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(String(value || ""));
}
export function isDesignDraftPageName(value) {
  return /设计稿|設計稿|design/i.test(String(value || ""));
}
export function isFaceSwapPageName(value) {
  return /批量换脸|换脸|人脸|脸部|face\s*swap/i.test(String(value || ""));
}
export function isCustomWorkflowPageName(value) {
  return /临时需求|自定义需求|批量需求|custom/i.test(String(value || ""));
}
export function mentionsOptionalReferenceImage(prompt, productNote) {
  const text = [prompt, productNote].join("\n");
  return /图\s*3|图三|第三张|第三个|补充图|补充参考|参考图\s*3|reference\s*3/i.test(String(text || ""));
}
export function defaultUploadLabelsForPage(name) {
  if (isPoseRemixPageName(name)) return POSE_REMIX_UPLOAD_LABELS;
  if (isLocalDetailPageName(name)) return LOCAL_DETAIL_UPLOAD_LABELS;
  if (isDesignDraftPageName(name)) return DESIGN_DRAFT_UPLOAD_LABELS;
  if (isFaceSwapPageName(name)) return FACE_SWAP_UPLOAD_LABELS;
  if (isRandomBackgroundPageName(name)) return RANDOM_BACKGROUND_UPLOAD_LABELS;
  if (isBackgroundChangePageName(name)) return BACKGROUND_CHANGE_UPLOAD_LABELS;
  if (isOutpaintPageName(name)) return OUTPAINT_UPLOAD_LABELS;
  if (isRecolorPageName(name)) return RECOLOR_UPLOAD_LABELS;
  if (isWhiteRefinePageName(name)) return WHITE_REFINE_UPLOAD_LABELS;
  if (isCustomWorkflowPageName(name)) return CUSTOM_UPLOAD_LABELS;
  return DEFAULT_UPLOAD_LABELS;
}
export function defaultPromptForWorkflowMode(mode) {
  if (mode === "pose-remix") return POSE_REMIX_DEFAULT_PROMPT;
  if (mode === "design-draft") return DESIGN_DRAFT_DEFAULT_PROMPT;
  if (mode === "face-swap") return FACE_SWAP_DEFAULT_PROMPT;
  if (mode === "random-background") return RANDOM_BACKGROUND_DEFAULT_PROMPT;
  if (mode === "background-change") return BACKGROUND_CHANGE_DEFAULT_PROMPT;
  if (mode === "outpaint") return OUTPAINT_DEFAULT_PROMPT;
  if (mode === "recolor") return RECOLOR_DEFAULT_PROMPT;
  if (mode === "white-refine") return WHITE_REFINE_DEFAULT_PROMPT;
  if (mode === "local-detail") return LOCAL_DETAIL_DEFAULT_PROMPT;
  if (mode === "custom") return "";
  return OUTFIT_DEFAULT_PROMPT;
}
export function workflowModeFromPage(pageName, uploadLabels) {
  const modelTitle = String(uploadLabels?.model?.title || "");
  const clothingTitle = String(uploadLabels?.clothing?.title || "");
  const referenceTitle = String(uploadLabels?.reference?.title || "");
  const text = [pageName, modelTitle, clothingTitle, referenceTitle].join(" ");
  if (isCustomWorkflowPageName(pageName)) {
    return "custom";
  }
  if (isLocalDetailPageName(pageName)) {
    return "local-detail";
  }
  if (isFaceSwapPageName(pageName)) {
    return "face-swap";
  }
  if (isRandomBackgroundPageName(pageName) || isRandomBackgroundPageName(text)) {
    return "random-background";
  }
  if (isOutpaintPageName(pageName) || isOutpaintPageName(text) || /待扩图原图|扩图参考图|向下扩图|补全下半身/.test(text)) {
    return "outpaint";
  }
  if (isWhiteRefinePageName(pageName) || isWhiteRefinePageName(text) || /平铺图|挂拍图|衣架去除|可选参考\/细节图|白底商品图/.test(text)) {
    return "white-refine";
  }
  if (isRecolorPageName(pageName) || isRecolorPageName(text) || /改色服装参考图|目标颜色|颜色替换/.test(text)) {
    // 2026-10-18 V110 裁决：改色页并入「自定义改色页」（旧 recolor workflow 退役，UI 由 V111 的
    // 「更换部位」行取代）。服务端仍按页面名识别 recolor 且两条路线提示词拼装一致，兼容无碍。
    return "custom";
  }
  if (isPoseRemixPageName(text) || /固定母版成片|批量姿势参考图|批量姿态图|姿态参考图|只提取姿势|固定成片/i.test(text)) {
    return "pose-remix";
  }
  if (isFaceSwapPageName(text) || /目标人物图|人脸参考图|妆容|表情|脸部身份/.test(text)) {
    return "face-swap";
  }
  if (isDesignDraftPageName(text) || /设计稿|設計稿|design|实拍服装|真人实拍|细节补充/.test(text)) {
    return "design-draft";
  }
  const explicitBackgroundPage = isBackgroundChangePageName(pageName) || isBackgroundChangePageName(clothingTitle);
  const backgroundLabelPair = /人物图|人物照|人物|模特图|模特/i.test(modelTitle)
    && /固定背景|统一场景|场景图|目标场景|背景图|换背景|背景/i.test(clothingTitle);
  if (explicitBackgroundPage || backgroundLabelPair || /PS贴回/i.test(text)) {
    return "background-change";
  }
  return "outfit";
}
export function normalizeUploadLabelText(value, fallback, limit = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, limit);
}
export function normalizeUploadLabels(value = {}, pageName = DEFAULT_OUTFIT_PAGE_NAME) {
  const defaults = defaultUploadLabelsForPage(pageName);
  return Object.fromEntries(["model", "clothing", "reference"].map((key) => {
    const current = value?.[key] || {};
    return [key, {
      title: normalizeUploadLabelText(current.title, defaults[key].title, 36),
      hint: normalizeUploadLabelText(current.hint, defaults[key].hint, 140)
    }];
  }));
}
export function sameUploadLabels(left, right) {
  const normalizedLeft = normalizeUploadLabels(left);
  const normalizedRight = normalizeUploadLabels(right);
  return ["model", "clothing", "reference"].every((key) => (
    normalizedLeft[key].title === normalizedRight[key].title
    && normalizedLeft[key].hint === normalizedRight[key].hint
  ));
}
export function uploadLabelsMatchPreset(value, preset) {
  return ["model", "clothing", "reference"].every((key) => (
    String(value?.[key]?.title || "") === String(preset?.[key]?.title || "")
    && String(value?.[key]?.hint || "") === String(preset?.[key]?.hint || "")
  ));
}
export function isLegacyPoseRemixUploadLabels(value = {}) {
  const modelTitle = String(value?.model?.title || "");
  const clothingTitle = String(value?.clothing?.title || "");
  return /固定母版|固定成片|固定模特/i.test(modelTitle)
    && /姿势|姿态|pose/i.test(clothingTitle);
}
export function inferOutfitWorkflowMode(pageName, uploadLabels) {
  return workflowModeFromPage(pageName, uploadLabels);
}
export function isSingletonWorkflowMode(mode) {
  return SINGLETON_WORKFLOW_MODES.has(String(mode || ""));
}
export function outfitPageContentScore(page = {}) {
  const imageCount = (Array.isArray(page.modelImages) ? page.modelImages.length : 0)
    + (Array.isArray(page.clothingImages) ? page.clothingImages.length : 0)
    + (Array.isArray(page.referenceImages) ? page.referenceImages.length : 0);
  const taskCount = Array.isArray(page.tasks) ? page.tasks.length : 0;
  const libraryCount = Array.isArray(page.originalLibrary) ? page.originalLibrary.length : 0;
  return imageCount * 10
    + taskCount * 4
    + libraryCount * 2
    + (page.fixedClothingId ? 3 : 0)
    + (String(page.settings?.productNote || "").trim() ? 1 : 0);
}
export function dedupeSingletonWorkflowPages(pages = []) {
  const output = [];
  const singletonIndexByMode = new Map();
  for (const page of Array.isArray(pages) ? pages : []) {
    if (!page) continue;
    const mode = inferOutfitWorkflowMode(page.name, page.uploadLabels);
    if (!isSingletonWorkflowMode(mode)) {
      output.push(page);
      continue;
    }
    const existingIndex = singletonIndexByMode.get(mode);
    if (existingIndex === undefined) {
      singletonIndexByMode.set(mode, output.length);
      output.push(page);
      continue;
    }
    if (outfitPageContentScore(page) > outfitPageContentScore(output[existingIndex])) {
      output[existingIndex] = page;
    }
  }
  return output;
}
export function normalizeOutfitPageSettings(value = {}, options = {}) {
  const settings = { ...defaultSettings, ...(value || {}) };
  if (shouldUpgradeLegacyBatchConcurrency(settings)) {
    settings.concurrency = DEFAULT_BATCH_CONCURRENCY;
    settings[BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY] = true;
  }
  if (settings.generationCount === 10 && settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] !== true) {
    settings.generationCount = "auto";
    settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] = true;
  }
  if (!(options.allowEmptyPrompt && !String(settings.prompt || "").trim()) && shouldRepairOutfitPrompt(settings.prompt)) {
    settings.prompt = OUTFIT_DEFAULT_PROMPT;
  }
  settings.generationCount = normalizeGenerationCount(settings.generationCount);
  settings.smartIntervention = normalizeSmartIntervention(settings.smartIntervention);
  settings.qualityCheck = normalizeQualityCheck(settings.qualityCheck);
  settings.garmentParts = normalizeGarmentParts(settings.garmentParts);
  settings.garmentComposition = normalizeGarmentComposition(settings.garmentComposition, settings.garmentParts);
  // 旧存档里的 garmentParts / garmentComposition / garmentLengths / masterFit* 只做安全读取：
  // 它们留在对象里不报错，但不再影响批量换装的任何行为，也不会覆盖新的 outfitIntent。
  settings.outfitIntent = normalizeOutfitIntent(settings.outfitIntent);
  settings.retouchIntent = normalizeRetouchIntent(settings.retouchIntent);
  settings.randomBackgroundFocus = normalizeRandomBackgroundFocus(settings.randomBackgroundFocus);
  settings.concurrency = normalizeBatchConcurrency(settings.concurrency);
  settings.theme = normalizeTheme(settings.theme);
  settings.apiKey = normalizeApiKeyInput(settings.apiKey);
  settings.preprocessMode = DEFAULT_PREPROCESS_MODE;
  return settings;
}
export function stripOutfitPageGlobalSettings(value = {}, options = {}) {
  const next = normalizeOutfitPageSettings(value, options);
  const { apiKey, theme, preprocessMode, ...pageSettings } = next;
  return pageSettings;
}
export function mergeOutfitPageSettings(pageSettings = {}, currentSettings = readSettings(), options = {}) {
  const next = normalizeOutfitPageSettings({ ...currentSettings, ...(pageSettings || {}) }, options);
  return {
    ...next,
    apiKey: currentSettings.apiKey || "",
    theme: normalizeTheme(currentSettings.theme)
  };
}
export function makeOutfitPage(name = DEFAULT_OUTFIT_PAGE_NAME, patch = {}) {
  const pageName = normalizeOutfitPageName(name || patch.name, DEFAULT_OUTFIT_PAGE_NAME);
  const pageMode = inferOutfitWorkflowMode(pageName, patch.uploadLabels || {});
  const allowEmptyPrompt = patch.allowEmptyPrompt || pageMode === "custom" || pageMode === "local-detail";
  const sourceSettings = patch.settings || readSettings();
  const sourcePrompt = String(sourceSettings.prompt || "");
  const migratedSettings = pageMode === "face-swap" && (
    !sourcePrompt.trim()
    || sourcePrompt === FACE_SWAP_SHORT_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT
    || sourcePrompt === LEGACY_FACE_SWAP_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_LOOSE_DEFAULT_PROMPT
    || sourcePrompt === POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT
  )
    ? { ...sourceSettings, prompt: FACE_SWAP_DEFAULT_PROMPT, productNote: "", pairingMode: "fixed" }
    : pageMode === "random-background" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_RELIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: RANDOM_BACKGROUND_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed", randomBackgroundFocus: "default" }
    : pageMode === "background-change" && (
      !sourcePrompt.trim()
      || sourcePrompt === BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: BACKGROUND_CHANGE_DEFAULT_PROMPT, productNote: "" }
    : pageMode === "outpaint" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: OUTPAINT_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed", aspectRatio: "9:16" }
    : pageMode === "recolor" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
      || sourcePrompt === RECOLOR_COLOR_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: RECOLOR_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed" }
    : pageMode === "white-refine" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === RECOLOR_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
      || sourcePrompt === WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === WHITE_REFINE_BATCH_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: WHITE_REFINE_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed" }
    : pageMode === "pose-remix"
      ? { ...sourceSettings, pairingMode: "fixed" }
      : pageMode === "local-detail" && !String(sourceSettings.prompt || "").trim()
        ? { ...sourceSettings, prompt: LOCAL_DETAIL_DEFAULT_PROMPT, productNote: "" }
        : sourceSettings;
  const sourceUploadLabels = patch.uploadLabels || {};
  const migratedUploadLabels = pageMode === "face-swap" && (
    !patch.uploadLabels
    || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_FACE_SWAP_UPLOAD_LABELS)
    || uploadLabelsMatchPreset(sourceUploadLabels, POSE_MOTHER_FACE_SWAP_UPLOAD_LABELS)
  )
    ? FACE_SWAP_UPLOAD_LABELS
    : pageMode === "pose-remix" && (
      !patch.uploadLabels
      || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_POSE_REMIX_UPLOAD_LABELS)
      || isLegacyPoseRemixUploadLabels(sourceUploadLabels)
    )
      ? POSE_REMIX_UPLOAD_LABELS
      : pageMode === "random-background" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
        || uploadLabelsMatchPreset(sourceUploadLabels, BACKGROUND_CHANGE_UPLOAD_LABELS)
      )
        ? RANDOM_BACKGROUND_UPLOAD_LABELS
      : pageMode === "background-change" && (
        !patch.uploadLabels
        || String(sourceUploadLabels?.clothing?.title || "").trim() === "统一场景图"
      )
        ? BACKGROUND_CHANGE_UPLOAD_LABELS
      : pageMode === "outpaint" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
        || uploadLabelsMatchPreset(sourceUploadLabels, BACKGROUND_CHANGE_UPLOAD_LABELS)
      )
        ? OUTPAINT_UPLOAD_LABELS
      : pageMode === "recolor" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
        || uploadLabelsMatchPreset(sourceUploadLabels, BACKGROUND_CHANGE_UPLOAD_LABELS)
      )
        ? RECOLOR_UPLOAD_LABELS
      : pageMode === "white-refine" && (
        // 2026-09-26：精修只留一个「图片上传」多图区，图1/图2 的旧标题都要迁移过来。
        // 只在标题还是历史默认值时迁移；用户自己改过的标题不动。
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_WHITE_REFINE_UPLOAD_LABELS_1)
        || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_WHITE_REFINE_UPLOAD_LABELS_2)
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
      )
        ? WHITE_REFINE_UPLOAD_LABELS
      : pageMode === "local-detail" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, CUSTOM_UPLOAD_LABELS)
      )
        ? LOCAL_DETAIL_UPLOAD_LABELS
        : sourceUploadLabels;
  return {
    id: String(patch.id || makeId("outfit_page")),
    name: pageName,
    deleteLocked: Boolean(patch.deleteLocked),
    settings: stripOutfitPageGlobalSettings(migratedSettings, { allowEmptyPrompt }),
    modelImages: Array.isArray(patch.modelImages) ? patch.modelImages : [],
    clothingImages: Array.isArray(patch.clothingImages) ? patch.clothingImages : [],
    referenceImages: Array.isArray(patch.referenceImages) ? patch.referenceImages : [],
    fixedClothingId: String(patch.fixedClothingId || ""),
    tasks: Array.isArray(patch.tasks) ? patch.tasks : [],
    originalLibrary: Array.isArray(patch.originalLibrary) ? patch.originalLibrary : [],
    activeUploadGroup: patch.activeUploadGroup || "model",
    uploadLabels: normalizeUploadLabels(migratedUploadLabels, pageName)
  };
}
export function makeDesignDraftPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_DESIGN_DRAFT_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: DESIGN_DRAFT_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || DESIGN_DRAFT_UPLOAD_LABELS
  });
}
export function makePoseRemixPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_POSE_REMIX_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: POSE_REMIX_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || POSE_REMIX_UPLOAD_LABELS
  });
}
export function makeBackgroundChangePage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_BACKGROUND_CHANGE_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: BACKGROUND_CHANGE_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || BACKGROUND_CHANGE_UPLOAD_LABELS
  });
}
export function makeRandomBackgroundPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_RANDOM_BACKGROUND_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: RANDOM_BACKGROUND_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      randomBackgroundFocus: "default",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || RANDOM_BACKGROUND_UPLOAD_LABELS
  });
}
export function makeRecolorPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_RECOLOR_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: RECOLOR_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      garmentParts: DEFAULT_GARMENT_PARTS,
      garmentComposition: DEFAULT_GARMENT_COMPOSITION,
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || RECOLOR_UPLOAD_LABELS
  });
}
export function makeWhiteRefinePage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_WHITE_REFINE_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: WHITE_REFINE_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || WHITE_REFINE_UPLOAD_LABELS
  });
}
export function makeFaceSwapPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_FACE_SWAP_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: FACE_SWAP_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || FACE_SWAP_UPLOAD_LABELS
  });
}
/** 用户主动删除过的 singleton workflow 模式留痕（V110）：ensureWorkflowPages 不再补建这些页。 */
export function readDeletedWorkflowModes() {
  const stored = readJsonStorage(OUTFIT_DELETED_WORKFLOW_MODES_KEY, []);
  return Array.isArray(stored) ? stored.filter((mode) => typeof mode === "string" && mode) : [];
}
export function rememberDeletedWorkflowMode(mode) {
  const value = String(mode || "");
  if (!value) return;
  const current = readDeletedWorkflowModes();
  if (current.includes(value)) return;
  writeJsonStorage(OUTFIT_DELETED_WORKFLOW_MODES_KEY, [...current, value]);
}
export function forgetDeletedWorkflowMode(mode) {
  const value = String(mode || "");
  if (!value) return;
  const next = readDeletedWorkflowModes().filter((item) => item !== value);
  writeJsonStorage(OUTFIT_DELETED_WORKFLOW_MODES_KEY, next);
}

export function ensureWorkflowPages(pages = [], baseSettings = readSettings()) {
  let output = dedupeSingletonWorkflowPages(Array.isArray(pages) ? pages.filter(Boolean) : [])
    .filter((page) => {
      const mode = inferOutfitWorkflowMode(page.name, page.uploadLabels);
      return mode !== "local-detail" && mode !== "outpaint";
    });
  const deletedModes = readDeletedWorkflowModes();
  const hasPoseRemixPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "pose-remix");
  const hasBackgroundChangePage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change");
  const hasRandomBackgroundPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "random-background");
  const hasRecolorPage = output.some((page) => isRecolorPageName(page.name));
  const hasWhiteRefinePage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "white-refine");
  const hasFaceSwapPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "face-swap");
  const hasDesignDraftPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft");

  if (!hasPoseRemixPage && !deletedModes.includes("pose-remix")) {
    const outfitIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "outfit");
    const poseRemixPage = makePoseRemixPage(baseSettings);
    output = outfitIndex >= 0
      ? [...output.slice(0, outfitIndex + 1), poseRemixPage, ...output.slice(outfitIndex + 1)]
      : [poseRemixPage, ...output];
  }

  if (!hasBackgroundChangePage && !deletedModes.includes("background-change")) {
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const backgroundPage = makeBackgroundChangePage(baseSettings);
    output = designIndex >= 0
      ? [...output.slice(0, designIndex), backgroundPage, ...output.slice(designIndex)]
      : [...output, backgroundPage];
  }

  if (!hasRandomBackgroundPage && !deletedModes.includes("random-background")) {
    const backgroundIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change");
    const recolorIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "recolor");
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const randomBackgroundPage = makeRandomBackgroundPage(baseSettings);
    output = backgroundIndex >= 0
      ? [...output.slice(0, backgroundIndex + 1), randomBackgroundPage, ...output.slice(backgroundIndex + 1)]
      : recolorIndex >= 0
        ? [...output.slice(0, recolorIndex), randomBackgroundPage, ...output.slice(recolorIndex)]
        : designIndex >= 0
          ? [...output.slice(0, designIndex), randomBackgroundPage, ...output.slice(designIndex)]
          : [...output, randomBackgroundPage];
  }

  if (!hasRecolorPage && !deletedModes.includes("recolor")) {
    const randomBackgroundIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "random-background");
    const backgroundIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change");
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const recolorPage = makeRecolorPage(baseSettings);
    output = randomBackgroundIndex >= 0
      ? [...output.slice(0, randomBackgroundIndex + 1), recolorPage, ...output.slice(randomBackgroundIndex + 1)]
      : backgroundIndex >= 0
        ? [...output.slice(0, backgroundIndex + 1), recolorPage, ...output.slice(backgroundIndex + 1)]
      : designIndex >= 0
        ? [...output.slice(0, designIndex), recolorPage, ...output.slice(designIndex)]
        : [...output, recolorPage];
  }

  if (!hasWhiteRefinePage && !deletedModes.includes("white-refine")) {
    const recolorIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "recolor");
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const whiteRefinePage = makeWhiteRefinePage(baseSettings);
    output = recolorIndex >= 0
      ? [...output.slice(0, recolorIndex + 1), whiteRefinePage, ...output.slice(recolorIndex + 1)]
      : designIndex >= 0
        ? [...output.slice(0, designIndex), whiteRefinePage, ...output.slice(designIndex)]
        : [...output, whiteRefinePage];
  }

  if (!hasFaceSwapPage && !deletedModes.includes("face-swap")) {
    const designIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft");
    const faceSwapPage = makeFaceSwapPage(baseSettings);
    output = designIndex >= 0
      ? [...output.slice(0, designIndex), faceSwapPage, ...output.slice(designIndex)]
      : [...output, faceSwapPage];
  }

  if (!hasDesignDraftPage && !deletedModes.includes("design-draft")) {
    output = [...output, makeDesignDraftPage(baseSettings)];
  }

  const faceSwapIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "face-swap");
  const poseRemixIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "pose-remix");
  if (faceSwapIndex >= 0 && poseRemixIndex >= 0 && faceSwapIndex !== poseRemixIndex + 1) {
    const faceSwapPage = output[faceSwapIndex];
    const withoutFaceSwap = output.filter((_, index) => index !== faceSwapIndex);
    const nextPoseRemixIndex = withoutFaceSwap.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "pose-remix");
    output = [
      ...withoutFaceSwap.slice(0, nextPoseRemixIndex + 1),
      faceSwapPage,
      ...withoutFaceSwap.slice(nextPoseRemixIndex + 1)
    ];
  }

  return dedupeSingletonWorkflowPages(output);
}
export function serializeOutfitPage(page) {
  const pageName = normalizeOutfitPageName(page?.name, DEFAULT_OUTFIT_PAGE_NAME);
  const pageMode = inferOutfitWorkflowMode(pageName, page?.uploadLabels || {});
  const allowEmptyPrompt = pageMode === "custom" || pageMode === "local-detail";
  return {
    id: String(page?.id || makeId("outfit_page")),
    name: pageName,
    deleteLocked: Boolean(page?.deleteLocked),
    settings: stripOutfitPageGlobalSettings(page?.settings || {}, { allowEmptyPrompt }),
    uploadLabels: normalizeUploadLabels(page?.uploadLabels || {}, pageName)
  };
}
export function readOutfitPages() {
  const baseSettings = readSettings();
  const stored = readJsonStorage(OUTFIT_PAGES_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    const pages = stored.map((page, index) => makeOutfitPage(
      page?.name || (index === 0 ? DEFAULT_OUTFIT_PAGE_NAME : `批量需求 ${index + 1}`),
      {
        ...page,
        settings: { ...baseSettings, ...(page?.settings || {}) },
        tasks: index === 0 ? readTaskHistory() : []
      }
    ));
    if (pages.length > 0) return ensureWorkflowPages(pages, baseSettings);
  }
  return ensureWorkflowPages([
    makeOutfitPage(DEFAULT_OUTFIT_PAGE_NAME, { settings: baseSettings, tasks: readTaskHistory() })
  ], baseSettings);
}
export function pickInitialOutfitPage(pages = []) {
  const list = Array.isArray(pages) ? pages.filter(Boolean) : [];
  return list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "outfit")
    || list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change")
    || list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft")
    || list[0]
    || makeOutfitPage(DEFAULT_OUTFIT_PAGE_NAME);
}
export function serializeDraftImageItem(item) {
  if (!item?.originalFile && !item?.file) return null;
  const cropReturn = normalizeCropReturnMeta(item.cropReturn);
  const localEdit = item.localEdit?.cropFile && item.localEdit?.cropRect
    ? {
        cropFile: item.localEdit.cropFile,
        cropRect: item.localEdit.cropRect,
        contextRect: item.localEdit.contextRect || null,
        sourceWidth: Number(item.localEdit.sourceWidth || 0),
        sourceHeight: Number(item.localEdit.sourceHeight || 0),
        aspectRatio: item.localEdit.aspectRatio || "1:1",
        editMode: item.localEdit.editMode || LOCAL_EDIT_RECT_MODE,
        maskDataUrl: item.localEdit.maskDataUrl || "",
        maskBounds: item.localEdit.maskBounds || null,
        brushSize: item.localEdit.brushSize || LOCAL_EDIT_BRUSH_DEFAULT,
        maskOpacity: item.localEdit.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT,
        appliedAt: Number(item.localEdit.appliedAt || Date.now())
      }
    : null;
  return {
    id: String(item.id || makeId("img")),
    name: String(item.name || item.originalFile?.name || item.file?.name || "image.jpg"),
    originalFile: item.originalFile || item.file,
    file: item.file || item.originalFile,
    mode: item.mode || DEFAULT_PREPROCESS_MODE,
    cropReturn,
    localEdit,
    selected: item.selected !== false,
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function hydrateDraftImageItem(item) {
  const originalFile = item?.originalFile || item?.file;
  const file = item?.file || originalFile;
  if (!originalFile || !file) return null;
  return {
    id: String(item.id || makeId("img")),
    name: String(item.name || originalFile.name || file.name || "image.jpg"),
    originalFile,
    file,
    originalUrl: URL.createObjectURL(originalFile),
    previewUrl: URL.createObjectURL(file),
    mode: item.mode || DEFAULT_PREPROCESS_MODE,
    cropReturn: normalizeCropReturnMeta(item.cropReturn),
    localEdit: item.localEdit?.cropFile && item.localEdit?.cropRect
      ? {
          cropFile: item.localEdit.cropFile,
          cropRect: item.localEdit.cropRect,
          contextRect: item.localEdit.contextRect || null,
          sourceWidth: Number(item.localEdit.sourceWidth || 0),
          sourceHeight: Number(item.localEdit.sourceHeight || 0),
          previewUrl: URL.createObjectURL(item.localEdit.cropFile),
          aspectRatio: item.localEdit.aspectRatio || "1:1",
          editMode: item.localEdit.editMode || LOCAL_EDIT_RECT_MODE,
          maskDataUrl: item.localEdit.maskDataUrl || "",
          maskBounds: item.localEdit.maskBounds || null,
          brushSize: item.localEdit.brushSize || LOCAL_EDIT_BRUSH_DEFAULT,
          maskOpacity: item.localEdit.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT,
          appliedAt: Number(item.localEdit.appliedAt || Date.now())
        }
      : null,
    selected: item.selected !== false,
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function serializeOriginalDraftItem(item, imageById) {
  const source = imageById.get(item?.sourceId);
  const file = source?.originalFile || source?.file || null;
  if (!file) return null;
  return {
    id: String(item.id || makeId("origin")),
    group: item.group || "",
    sourceId: String(item.sourceId || source.id || ""),
    name: String(item.name || file.name || "image.jpg"),
    file,
    size: Number(item.size || file.size || 0),
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function hydrateOriginalDraftItem(item) {
  const file = item?.file;
  if (!file) return null;
  return {
    id: String(item.id || makeId("origin")),
    group: item.group || "",
    sourceId: String(item.sourceId || ""),
    name: String(item.name || file.name || "image.jpg"),
    url: URL.createObjectURL(file),
    size: Number(item.size || file.size || 0),
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function serializeDraftPage(page) {
  const modelImages = (page?.modelImages || []).map(serializeDraftImageItem).filter(Boolean);
  const clothingImages = (page?.clothingImages || []).map(serializeDraftImageItem).filter(Boolean);
  const referenceImages = (page?.referenceImages || []).map(serializeDraftImageItem).filter(Boolean);
  const imageById = new Map([...modelImages, ...clothingImages, ...referenceImages].map((item) => [item.id, item]));
  return {
    ...serializeOutfitPage(page),
    modelImages,
    clothingImages,
    referenceImages,
    fixedClothingId: String(page?.fixedClothingId || ""),
    originalLibrary: (page?.originalLibrary || []).map((item) => serializeOriginalDraftItem(item, imageById)).filter(Boolean),
    activeUploadGroup: page?.activeUploadGroup || "model",
    tasks: Array.isArray(page?.tasks) ? page.tasks.map(sanitizeTaskHistoryItem).filter(Boolean) : []
  };
}
export function hydrateDraftPage(page, options = {}) {
  const pageName = normalizeOutfitPageName(page?.name, DEFAULT_OUTFIT_PAGE_NAME);
  const modelImages = (page?.modelImages || []).map(hydrateDraftImageItem).filter(Boolean);
  const clothingImages = (page?.clothingImages || []).map(hydrateDraftImageItem).filter(Boolean);
  const referenceImages = (page?.referenceImages || []).map(hydrateDraftImageItem).filter(Boolean);
  const tasks = hydrateTasksWithUploadReferences(recoverPersistedTasks(page?.tasks, options), {
    modelImages,
    clothingImages,
    referenceImages
  });
  return makeOutfitPage(pageName, {
    ...page,
    modelImages,
    clothingImages,
    referenceImages,
    originalLibrary: (page?.originalLibrary || []).map(hydrateOriginalDraftItem).filter(Boolean),
    uploadLabels: normalizeUploadLabels(page?.uploadLabels || {}, pageName),
    tasks
  });
}
export async function persistOutfitDraftState(pages, activeId) {
  const serializablePages = ensureWorkflowPages(pages, readSettings()).map(serializeDraftPage);
  await outfitLocalSet(OUTFIT_DRAFT_DB_KEY, {
    activeId,
    pages: serializablePages,
    updatedAt: Date.now()
  });
}
export async function loadOutfitDraftState(options = {}) {
  const draft = await outfitLocalGet(OUTFIT_DRAFT_DB_KEY, null);
  if (!draft || !Array.isArray(draft.pages) || draft.pages.length === 0) return null;
  const pages = draft.pages.map((page) => hydrateDraftPage(page, options)).filter(Boolean);
  if (!pages.length) return null;
  return {
    activeId: pages.some((page) => page.id === draft.activeId) ? draft.activeId : pages[0].id,
    pages
  };
}
