import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Crop,
  Download,
  Eye,
  EyeOff,
  FolderOpen,
  Images,
  Loader2,
  Lock,
  Maximize2,
  ImageOff,
  Minus,
  Move,
  Palette,
  Pencil,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Unlock,
  Upload,
  Video,
  Wand2,
  X
} from "lucide-react";
import { canvasToBlob } from "./shared/canvas-blob.js";
import { fileBaseName } from "./shared/file-name.js";
import { normalizePromptCategories, normalizePromptPreset, usePromptLibrary } from "./shared/prompt-library.js";
import {
  imageBitmapFromBlob,
  imageBitmapFromFile,
  imageExtension,
  imageFilesFromClipboard,
  isImageFile
} from "./shared/image-input.js";
import {
  LOCAL_EDIT_MASK_MODE,
  LOCAL_EDIT_BRUSH_DEFAULT,
  LOCAL_EDIT_MASK_OPACITY_DEFAULT,
  LOCAL_EDIT_RECT_MODE,
  createLocalEditAlphaMask,
  imageBitmapFromDataUrl,
} from "./shared/local-edit-mask.js";
import DebouncedTextarea from "./shared/DebouncedTextarea.jsx";
import { DEFAULT_MODELS } from "./shared/models.js";
import {
  canonicalModel,
  channelsForModel,
  convergeSettingsForModel,
  modelCapabilities,
  routingFields
} from "./shared/routing.js";
import {
  composeLocalPasteBlob,
  fitRectToRatioLocked,
  localPasteSizeReport,
  resolveLocalEditBaseFile
} from "./shared/local-edit-geometry.js";
import { getAppConfig } from "./api/config.js";
import { formatConnectionResult, testConnection } from "./api/connection.js";
import { describeEmptyResult, formatGenerationError, sanitizeErrorText } from "./shared/generation-errors.js";
import {
  imageFileFromUrl,
  beginImageDownloadDrag,
  brokenImageReason,
  dataUrlFromBlob,
  previewDragStart,
  previewPanFromDrag,
  referenceSource,
  resultImageCardState,
} from "./shared/result-image.js";
import { CachedImage } from "./shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "./shared/ui/reference-thumb-tray.jsx";
import { LocalEditModal } from "./features/local-edit/LocalEditModal.jsx";
// 结构化换装意图 + 唯一精简提示词编译器（前端预览与服务端发送同一份实现）。
import {
  FACT_UNRECOGNIZED,
  OUTFIT_AUTO_PROMPT_CHAR_LIMIT,
  OUTFIT_FACT_FIELDS,
  OUTFIT_KEEP_PART_VALUES,
  OUTFIT_PART_OPTIONS,
  UPPER_LAYER_OPTIONS,
  WEARING_MODE_OPTIONS,
  compileOutfitPrompt,
  defaultOutfitIntent,
  normalizeOutfitIntent,
  recognizedFactKeys,
  resolveUpperLayer,
  summarizeOutfitIntent,
  validateOutfitIntent,
  visibleWearingFields
} from "./shared/outfit-intent.js";
import {
  getSaveDirectory,
  openSaveDirectoryRequest,
  pickSaveDirectory as pickSaveDirectoryRequest,
  setSaveDirectory as setSaveDirectoryRequest
} from "./api/save.js";
import { analyzeOutfitMasterFit, checkOutfitQuality, generateOutfit } from "./api/outfit.js";
import { fetchImageBlob } from "./api/assets.js";
import { emitClientDiagnosticEvent } from "./api/client.js";
import {
  normalizeApiKeyInput,
  testApiConnection
} from "./features/auth/api-key.js";
import {
  RETOUCH_AUTO_PROMPT_CHAR_LIMIT,
  RETOUCH_FIT_OPTIONS,
  RETOUCH_GOAL_TEXT,
  RETOUCH_HEM_OPTIONS,
  RETOUCH_SYMMETRY_OPTIONS,
  compileRetouchPrompt,
  defaultRetouchIntent,
  isBuiltinRetouchPrompt,
  normalizeRetouchIntent,
  validateRetouchIntent,
  WHITE_REFINE_BATCH_LEGACY_DEFAULT_PROMPT,
  WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT,
  WHITE_REFINE_DEFAULT_PROMPT
} from "./shared/retouch-intent.js";
import {
  readSplitHalvesEnabled,
  splitHalvesFileName,
  splitImageIntoHalves,
  writeSplitHalvesEnabled
} from "./shared/image-split.js";
import { fileSize, formatWholeSecondMs as formatMs } from "./lib/format/index.js";
import { readJsonStorage, removeStorageItem, writeJsonStorage } from "./lib/storage/json-storage.js";
import "./outfit-workflow.css";
import "./features/outfit/outfit-intent.css";
import "./features/outfit/white-refine-split.css";
import "./features/outfit/retouch-intent.css";
import { copyTextToClipboard } from "./shared/dom-actions.js";
import { loadSaveDirectory, openSaveDirectoryModal, commitSaveDirectory, chooseSaveDirectory } from "./features/savedir/save-directory.js";
import {
  TASK_HISTORY_KEY,
  OUTFIT_DRAFT_DB_KEY,
  OUTFIT_SESSION_ID,
  taskStatusLabel,
  taskRuntimeStageLabel,
  isLiveGenerationTask,
  taskDurationMs,
  taskHasCropReturnResult,
  normalizeQualityCheck,
  normalizeQualityCheckResult,
  summarizeGenerationError,
  imageSource,
  cacheableResultImageSource,
  resultImageCacheKey,
  displayResultImageSource,
  revokeResultImageRuntimeCache,
  revokeRestorableTaskResultImageCaches,
  revokeTaskResultRuntimeCaches,
  cacheResultImageBlob,
  sanitizeTaskReferenceThumbs,
  stripTaskUploadImageCache,
  stripPageNonResultImages,
  imageItemUploadFile,
  taskReferencePreviewItems,
  attachTaskReferenceThumbs,
  hydrateTasksWithUploadReferences,
  revokePageNonResultImageUrls,
  sanitizeTaskHistoryItem,
  recoverPersistedTasks,
  mergeOutfitTasksWithHistory,
  mergeOutfitLiveRuns,
  readTaskHistory,
  readTaskHistoryAsync,
  persistTaskHistory,
  persistFinishedTaskWhileDetached,
  publishOutfitLiveRun,
  outfitLiveRunsForPage,
  localEditRectSnapshot,
  localEditTaskBindingSnapshot,
  prepareOutfitTaskLocalEdit,
  cacheTaskResultImageFile,
  taskDragDownloadName,
  canRerunTask,
  buildRerunReplacementTask,
  canReplaceTaskResult,
  normalizeRandomBackgroundFocus,
  createDocumentObjectUrl,
  outfitLocalGet,
  outfitLocalSet,
  outfitLocalDeleteByPrefix,
  revokePreviewUrl,
  revokeImageUrls,
  cropReturnRectSnapshot,
  normalizeCropReturnMeta,
  subscribeOutfitLiveRuns
} from "./features/outfit/outfit-task.js";
import {
  BatchResizePanel,
  CHANNEL_UPLOAD_LIMIT_BYTES,
  CHANNEL_UPLOAD_MAX_SIDE,
  CHANNEL_UPLOAD_TARGET_BYTES,
  CropModal,
  DEFAULT_PREPROCESS_MODE,
  MAX_UPLOAD_IMAGES,
  PREPROCESS_OPTIONS,
  PromptPresetGrid,
  RESIZE_OUTPUT_FOLDER,
  UploadZone,
  WorkflowQuickVideoPanel,
  compressOriginalImageFile,
  constrainLocalEditRect,
  loadImageFromUrl,
  makeId,
  padImageFile,
  preprocessModeLabel,
  processImageFile,
  ratioParts,
  resolveCropSourceRect
} from "./features/outfit/outfit-panels.jsx";

const STORAGE_KEY = "jingyin-outfit-workflow-settings-v1";
const BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY = "batchConcurrencyDefaultV5Applied";
const GENERATION_COUNT_AUTOLINK_MIGRATION_KEY = "generationCountAutoLinkV11Applied";
const OUTFIT_PAGES_KEY = "jingyin-outfit-workflow-pages-v1";
const OUTFIT_TEMP_IMAGE_CACHE_PREFIX = "temp-image-cache:";

// 2026-09-26 批量结果恢复：区分「浏览器整页刷新/首次打开」和「应用内切换左侧页面」。
// 左侧导航切走会把 OutfitWorkflow 整个卸载（main.jsx 是条件渲染），再切回来是**组件重挂载**，
// 不是页面刷新。模块级变量随 JS 文档一起重建，所以：
//   - 本文档里第一次挂载 = 真的刚刚加载/刷新过页面；
//   - 之后再挂载 = 应用内切换页面。
// 只有前者才允许把"当时还在跑"的任务写成"刷新中断"。
let outfitWorkflowDocumentBooted = false;

// 本文档创建过的对象 URL（blob:）集合。
// 用途：blob: 地址只在创建它的那个文档里有效。
//   - 应用内切换页面 → 同一个文档 → 地址还有效，能继续显示（不能提前 revoke）；
//   - 整页刷新 → 旧地址已死 → 必须显示真实的失效原因，而不是伪装成"结果已保存"。

/**
 * 跨组件挂载周期存活的「批量生成运行账本」。
 *
 * 为什么需要它（2026-09-26 第二轮）：
 *   左侧导航切走会卸载 OutfitWorkflow，但生成请求和它的回调是普通闭包，会继续跑完。
 *   只有页面草稿这一条持久化通道时会出现一个空窗：
 *   用户切走 → 又很快切回来（这一轮还没跑完）→ 草稿里那一条还是 running/queued → 被恢复成
 *   "切换页面时这一轮还没返回结果"；等它真的跑完时，新挂载的组件既不知道这条任务存在，
 *   也没人把结果推给它，于是卡片永远停在"待确认"。
 *
 * 账本把「正在跑 / 刚跑完」的任务快照放在模块级（不随组件卸载消失）：
 *   - 重挂载时先接上账本 → 还在跑就继续显示"生成中"，跑完了就直接收敛成结果；
 *   - 跑完的那一刻通过订阅者推给当前挂载的组件（如果它在看这一页）；
 *   - 组件不在看这一页/没挂载时，走已有的 persistFinishedTaskWhileDetached() 写回页面草稿。
 * 只存任务快照（结果地址是服务端的 /api/result/...，不是大 Blob），不新建第二套缓存。
 */


const PROMPT_LIBRARY_VERSION = "v2-20260802";
const PROMPT_PRESETS_KEY = `jingyin-outfit-workflow-prompt-library-${PROMPT_LIBRARY_VERSION}`;
const PROMPT_CATEGORIES_KEY = `jingyin-outfit-workflow-prompt-categories-${PROMPT_LIBRARY_VERSION}`;
const DEFAULT_OUTFIT_PAGE_NAME = "换装";
const DEFAULT_POSE_REMIX_PAGE_NAME = "批量姿态";
const DEFAULT_LOCAL_DETAIL_PAGE_NAME = "局部回贴";
const DEFAULT_BACKGROUND_CHANGE_PAGE_NAME = "固定背景";
const DEFAULT_RANDOM_BACKGROUND_PAGE_NAME = "随机背景";
const DEFAULT_OUTPAINT_PAGE_NAME = "批量扩图";
const DEFAULT_RECOLOR_PAGE_NAME = "批量改色";
// 2026-09-26：改版后显示名更短（用户要求）：批量换装 → 换装，批量白底图精修 → 精修。
// 旧名字仍作为别名识别（见 normalizeOutfitPageName / isWhiteRefinePageName），
// 老存档里的页面名会在读取时自动迁移到新名字。
const DEFAULT_WHITE_REFINE_PAGE_NAME = "精修";
const DEFAULT_FACE_SWAP_PAGE_NAME = "批量换脸";
const DEFAULT_DESIGN_DRAFT_PAGE_NAME = "设计稿";
const DEFAULT_CUSTOM_PAGE_NAME = "临时需求";
const SINGLETON_WORKFLOW_MODES = new Set(["pose-remix", "local-detail", "background-change", "random-background", "recolor", "white-refine", "face-swap", "design-draft"]);
const POSE_REMIX_DEFAULT_PROMPT = [
  "批量姿态任务：图1上传区是批量姿态参考图，每张图1只提取脸部朝向、头颈方向、肩膀角度、手臂手腕手掌、下半身、重心、站坐走关系和构图动势；不要复制图1人物身份、脸、发型、服装、穿法、背景、镜头风格或颜色。",
  "图2上传区是固定母版成片，人物身份、脸、发型、服装、穿法、场景、光影、镜头和画面风格都作为锁定标准。图2最多上传2张，默认用固定母版。",
  "生成时保持图2同一个模特、同一套衣服、同一穿法、同一场景和同一商业摄影质感，只把图2人物自然调整为当前图1姿态。",
  "姿态相似度要高：结果必须一眼看出是在模仿当前图1动作，抬手高度、手肘弯曲、手腕手掌方向、肩膀高低、身体重心、胯部转向、膝盖弯曲、脚尖方向和半身/全身裁切尽量贴近图1，不要只做轻微动作变化。",
  "服装版型和穿法必须跟图2母版一致：袖子放下/卷起、袖口落点、袖克夫长度、扣子开合、拉链高度、衣摆扎法、裙长/裤长、腰身松量、下摆轮廓、面料纹理和可见细节不要随机漂移。",
  "如果图1姿态与图2服装穿法冲突，先尽量保持图1动作相似度，再让图2服装做真实穿着褶皱和遮挡适配；只有物理上无法同时满足时才轻微折中。不要让图1衣服、裙裤类型或背景影响结果，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
const POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是批量姿态参考图，只提取姿势、身体动作、镜头距离、半身/全身裁切和构图动势；图2上传区是固定母图/母版成片，人物身份、脸、发型、服装、场景、光影和商业摄影质感都以图2为准；图3上传区是可选补充信息。",
  "生成时必须把图2母图里的同一个人物自然调整成图1姿态。图1半身就输出半身，图1全身就输出全身；图1侧身、抬手、坐姿、肩膀角度、手臂手腕手掌、腿脚和重心都要跟随，但不能复制图1的人脸身份、服装、发型、背景、颜色或拍摄风格。",
  "人物脸部身份只能来自图2母图：五官结构、脸型、年龄感、妆容、皮肤质感、发型外轮廓和发色趋势都要像图2，不允许把图1参考图的人脸特征混入结果，不要生成图1和图2混合脸。",
  "场景背景、光影方向、色温、镜头质感和服装事实保留图2母图；如果图1姿态和图2母图场景有冲突，只按图1姿态调整人物动作，不重建新场景、不换背景、不复制图1环境。",
  "最终结果必须像图2母图同一人物在图2场景里按图1姿态重新拍摄出来的真实电商成片，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
const FACE_SWAP_SHORT_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部外接框、下巴位置和脖子肩线全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、五官、脸型、肤色妆容、发色、刘海方向和发缝趋势。图2不提供头部姿态、头部大小、头发整体外轮廓、脖子长度、肩颈关系或头身比例；图2脖子以下全部无效。",
  "只在图1原脸部角度和原头颈连接里融合图2身份，头部位置、脸部朝向、头部大小、头颈关系、下巴到锁骨/衣领的距离不变；如果发型迁移会影响图1服装、肩颈或背景，优先保留图1，只迁移脸部身份。",
  "结果出现图2服装、图2衣领肩膀、图2背景或图2拍摄场景就是失败；不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
const FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部外接框、下巴位置、脖子长度和肩颈连接全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、脸部肤色妆容色调和小范围发型特征：五官、脸型、肤色明暗、妆容质感、发色、刘海方向、发缝趋势和贴脸发丝方向。脸部色调以图2脸母图为主，但只作用在脸部身份融合上。",
  "图2不提供头部姿态、低头/歪头/仰头角度、头部大小、头发整体外轮廓、脖子长度、肩颈关系、头身比例、衣领肩膀、身体、背景、场景、镜头和整体穿搭；图2脖子以下全部无效。",
  "只在图1原脸部角度和原头颈连接里融合图2身份；发顶、脸中心、双眼连线倾斜、下巴、下颌角、脖子上缘、锁骨/衣领交界、双肩基线和人物头身比必须跟图1一致。结果出现图2服装、图2衣领肩膀、图2背景、图2拍摄场景或图2头部姿态就是失败。"
].join("\n");
const FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部外接框、下巴位置、脖子长度和肩颈连接全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、脸部肤色妆容色调和小范围发型特征：五官、脸型、肤色明暗、妆容质感、发色、刘海方向、发缝趋势和贴脸发丝方向。脸部色调以图2脸母图为主，但只作用在脸部身份融合上。",
  "同批统一脸部色彩标准：所有结果都以同一张图2脸母图的肤色明暗、妆容浓淡、口红色相和饱和度、面部对比度、磨皮程度、清晰度作为统一标准；不同图1只允许在脸部边缘做轻微现场光过渡，不能一张口红更鲜艳、一张低饱和、一张更白皙或像不同光源下拍摄。",
  "图2不提供头部姿态、低头/歪头/仰头角度、头部大小、头发整体外轮廓、脖子长度、肩颈关系、头身比例、衣领肩膀、身体、背景、场景、镜头和整体穿搭；图2脖子以下全部无效。",
  "只在图1原脸部角度和原头颈连接里融合图2身份；发顶、脸中心、双眼连线倾斜、下巴、下颌角、脖子上缘、锁骨/衣领交界、双肩基线和人物头身比必须跟图1一致。结果出现图2服装、图2衣领肩膀、图2背景、图2拍摄场景或图2头部姿态就是失败。"
].join("\n");
const FACE_SWAP_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图；图2上传区是脸部身份、脸型、发型和头饰母图；图3上传区是可选补充信息。",
  "图1只作为底图和坐标来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部位置、头部大小、脸部朝向、下巴位置、脖子长度和肩颈连接保持图1，不换衣、不换场景、不重拍。",
  "图2作为头脸妆造标准：五官结构、脸型轮廓、年龄感、肤色明暗、妆容质感、口红色相、发型整体轮廓、发量体积、发顶高度、发色、刘海、发缝、卷直程度、贴脸发丝、头饰、发饰、耳饰都以图2母图为准；图1原脸型、原发型、原发饰和头饰不作为结果参考。",
  "同批统一头脸色彩标准：所有结果都以同一张图2母图的肤色明暗、妆容浓淡、口红色相和饱和度、面部对比度、磨皮程度、清晰度作为统一标准；不同图1只允许在脸颈边缘做轻微现场光过渡，不能一张口红更鲜艳、一张低饱和、一张更白皙或像不同光源下拍摄。",
  "迁移图2发型和头饰时，只适配图1原头部坐标、脸部朝向、头颈连接和画面裁切；允许用图2发型轮廓覆盖图1原发型/头饰干扰，但不能移动头部、放大头身比例、改变肩颈、重绘衣领、换身体、换背景或复制图2衣服。",
  "图2脖子以下全部无效：不能复制图2服装、衣领、肩膀、身体、姿势、背景、拍摄角度、场景和整体穿搭；图2头部姿态也不能覆盖图1脸部朝向。结果保留图1原脸型、原发型或原头饰导致不像图2母图，或出现图2衣服/背景/场景，都是失败。"
].join("\n");
const FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影和画面裁切全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份和可融合发型：五官、脸型、肤色妆容、刘海、发缝、发色和头发轮廓。图2脖子以下全部无效，不能读取图2衣服、衣领、肩膀、身体、姿势、背景、场景、镜头和整体穿搭。",
  "只在图1原头脸位置融合图2身份和发型，头部位置、脸部朝向、头部大小、头颈关系不变；如果发型迁移会影响图1服装、肩颈或背景，优先保留图1，只迁移脸部身份。",
  "结果出现图2服装、图2衣领肩膀、图2背景或图2拍摄场景就是失败；不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
const FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影和画面裁切全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、脸部肤色妆容色调和可融合发型：五官、脸型、肤色明暗、妆容质感、刘海、发缝、发色和头发轮廓。脸部色调以图2脸母图为主，但只作用在脸部身份融合上。",
  "图2脖子以下全部无效，不能读取图2衣服、衣领、肩膀、身体、姿势、背景、场景、镜头和整体穿搭；只在图1原头脸位置融合图2身份和发型，头部位置、脸部朝向、头部大小、头颈关系不变。",
  "如果发型或肤色融合会影响图1服装、肩颈或背景，优先保留图1边界，只让脸部自然过渡；结果出现图2服装、图2衣领肩膀、图2背景或图2拍摄场景就是失败。"
].join("\n");
const LEGACY_FACE_SWAP_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "替换图1人物的脸部身份特征，并参考图2的人脸、发型气质、刘海方向、发缝、卷直程度和发色趋势；图1的人物身体、服装、衣领、肩膀、姿势、场景、背景、光影和画面裁切必须保持。图2不是服装参考、不是身体参考、不是场景参考，不能把图2衣服、衣领、肩膀、背景或拍摄风格带到结果里。",
  "必须保留图1的头部位置、头部大小、脸部朝向、头颈关系、身体比例、衣服、手脚、背景、光影和画面裁切。发型只能在图1原有头部轮廓和发量范围内自然融合，不能导致头部偏移、头变大、脸中心改变或背景被大片重绘。",
  "如果图1已设置局部编辑区域，本次只生成这个局部区域，输出必须和局部区域同构图、同角度、同光影，不要输出整张图、不要扩展画布、不要添加边框。",
  "图2可以是一张或多张脸部/发型参考图，用于身份、五官、妆容气质和发型方向参考；不要复制图2的衣服、背景、拍摄角度、饰品或画面风格。图3不是必填，只在上传时补充妆容、表情、发型细节、年龄感、皮肤质感、客户要求或禁忌。",
  "最终结果必须像原图里真实拍出来的人物，只换脸，不换衣、不换身体、不换背景、不移动人物，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
const FACE_SWAP_LOOSE_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "替换图1人物的脸部身份特征，并在用户需要时参考图2的发型气质、刘海方向、发缝、卷直程度和发色趋势；必须保留图1的头部位置、头部大小、脸部朝向、头颈关系、身体比例、衣服、手脚、背景、光影和画面裁切。发型只能在图1原有头部轮廓和发量范围内自然融合，不能导致头部偏移、头变大、脸中心改变或背景被大片重绘。",
  "如果图1已设置局部编辑区域，本次只生成这个局部区域，输出必须和局部区域同构图、同角度、同光影，不要输出整张图、不要扩展画布、不要添加边框。",
  "图2可以是一张或多张脸部/发型参考图，用于身份、五官、妆容气质和发型方向参考；不要复制图2的衣服、背景、拍摄角度、饰品或画面风格。图3不是必填，只在上传时补充妆容、表情、发型细节、年龄感、皮肤质感、客户要求或禁忌。",
  "最终结果必须像原图里真实拍出来的人物，只换脸，不换衣、不换身体、不换背景、不移动人物，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
const BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT = [
  "批量换背景任务：图1上传区是要保留的人物图，图2上传区是统一场景图，图3上传区是可选补充信息。",
  "必须完全保持图1人物的位置、姿势、身体比例、头部大小、脸部朝向、发型、服装款式、服装颜色、服装细节、手脚姿态和人物在画面中的占比不变。",
  "只把图1人物自然放入图2场景中，让每一张结果都像同一场景里的统一摆拍，光影方向、色温、对比度、地面接触阴影、透视和整体色调必须一致。",
  "如果图1原本有背景或是透明/白底图，只提取人物主体和原服装事实，不保留图1原背景；不能改变人物衣服、姿态或重新摆拍。",
  "图3不是必填，只在上传时用于补充场景氛围、光线、色调、道具边界或客户额外要求；没有图3时不要凭空添加复杂道具、文字、水印或品牌元素。"
].join("\n");
const BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量换背景任务：图1上传区是要保留的人物图，图2上传区是统一场景图，图3上传区是可选补充信息。",
  "图1人物必须原样保留：位置、姿势、身体比例、头部大小、脸部朝向、发型、服装款式、服装颜色、服装细节、手脚姿态、人物占比和当前裁切都不变。",
  "图1是半身就保持半身，图1是全身就保持全身；禁止补全半身下半身、扩出腿脚、拉长身体、重排站位、扩展画布或为了适配背景重新构图。",
  "只替换人物后方场景：背景结构、地面、空间透视和商业氛围来自图2，但人物身上的光源方向、曝光、肤色、服装色和明暗关系以图1为主，背景去适配人物。",
  "只允许做人物边缘融合、脚底接触阴影和背景局部光影衔接，不能把图2色调强行套到人物身上；图3只在上传时补充场景要求，没有图3时不要添加文字、水印、品牌或复杂道具。"
].join("\n");
const BACKGROUND_CHANGE_DEFAULT_PROMPT = [
  "批量固定背景任务：图1上传区是要保留的人物图，图2上传区是固定目标背景/场景图，图3上传区是可选补充信息。",
  "图1人物结构必须原样保留：位置、姿势、身体比例、头部大小、脸部朝向、发型、服装款式、服装细节、手脚姿态、人物占比和当前裁切都不变。",
  "图1是半身就保持半身，图1是全身就保持全身；禁止补全半身下半身、扩出腿脚、拉长身体、重排站位、扩展画布或为了适配背景重新构图。",
  "固定背景是最终光影标准：背景结构、地面、空间透视、主光方向、色温、对比度、阴影强度和商业氛围来自图2；允许对图1人物做自然的整体重光照、色温统一和边缘环境光融合，让人物像真实站在图2场景里。",
  "重光照只服务融合，不改变人物身份、脸、发型、服装颜色款式、服装细节、身体轮廓和手脚位置；必须补足脚底/身体接触阴影、边缘反光、远近虚实和白平衡一致性，避免贴图感、断层、假边和明显 P 图感。图3只在上传时补充场景要求，没有图3时不要添加文字、水印、品牌或复杂道具。"
].join("\n");
const RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘。",
  "服装锁定：完整保留图1服装款式、颜色、亮度、面料纹理、质感、褶皱、配饰和细节，不换衣、不改色、不提亮、不重绘服装结构。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光影以真实融合为目标：柔和自然光，背景光影匹配图1人物明暗和服装展示需求，不要强行打亮人物，不要让脸、肤色、服装色发生明显漂移；无文字、无水印、无多余人物。"
].join("\n");
const RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘。",
  "服装锁定：完整保留图1服装款式、颜色、亮度、面料纹理、质感、褶皱、配饰和细节，不换衣、不改色、不重绘服装结构。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光照标准由目标场景先决定，不由图1原片背光、阴天、暗沉或室内黄光决定；整批要像同一时间段、同一场景体系拍摄的柔和明亮白天自然光。场景主动带动人物做自然补光、白平衡统一、边缘环境光和脚底接触阴影，不要让人物原本背光把新背景压暗。",
  "白平衡必须中性干净、清爽日光感：禁止暖黄、偏橙、咖啡暖滤镜、复古黄调、室内暗沉、假白提亮、强直射阳光、硬阴影、背光剪影、地面大面积太阳光斑或高反差午后强光。同批肤色、脸部明暗、口红、发色、服装白位/黑位保持同一亮度层级，不能一张明亮一张像背光阴天；无文字、无水印、无多余人物。"
].join("\n");
const RANDOM_BACKGROUND_RELIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型轮廓、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘，不做生硬抠图贴背景。",
  "服装锁定：完整保留图1服装款式、版型、面料纹理、质感、褶皱、配饰和细节，不换衣、不重绘服装结构；但允许在不改色相和材质事实的前提下，把图1室内暖光造成的偏黄、偏橙、暗沉人物色温校正到目标场景的统一日光白平衡。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光照标准由目标场景先决定，不由图1原片背光、阴天、暗沉或室内黄光决定；先固定整批统一的柔和明亮白天自然光，再让人物、皮肤、头发和服装做自然重光照与色温统一。",
  "融合方式必须像真实换到同一场景重新拍摄：人物边缘有自然环境光、半透明发丝过渡和脚底接触阴影，不能出现硬抠边、白边、黑边、锯齿边、发丝断裂、人物像贴纸或背景被人物原暖光反向染黄。",
  "白平衡必须中性干净、清爽日光感：禁止暖黄、偏橙、咖啡暖滤镜、复古黄调、室内暗沉、假白提亮、强直射阳光、硬阴影、背光剪影、地面大面积太阳光斑或高反差午后强光。同批肤色、脸部明暗、口红、发色、服装白位/黑位保持同一亮度层级，不能一张明亮一张像背光阴天。"
].join("\n");
const RANDOM_BACKGROUND_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型轮廓、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘，不能像把人物抠出来贴到背景上。",
  "服装锁定：完整保留图1服装款式、版型、面料纹理、质感、褶皱、配饰和细节，不换衣、不重绘服装结构；允许在不改色相和材质事实的前提下，把图1室内暖光、偏黄、偏橙、暗沉校正到目标场景白平衡。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "目标场景先决定整张图的亮度、色温、曝光、主光方向和环境反光；再让人物、皮肤、头发和服装做自然重光照、补光和白平衡统一，人物不能明显比背景暗、黄、灰或像旧图贴上去。",
  "融合方式必须像真实换到同一场景重新拍摄：人物边缘有自然环境光、半透明发丝过渡、服装边缘环境色和脚底接触阴影，不能出现硬抠边、白边、黑边、锯齿边、发丝断裂、人物漂浮或背景被人物原暖光反向染黄。",
  "白平衡必须中性干净、清爽日光感：禁止暖黄、偏橙、咖啡暖滤镜、复古黄调、室内暗沉、假白提亮、强直射阳光、硬阴影、背光剪影、地面大面积太阳光斑或高反差午后强光。同批肤色、脸部明暗、口红、发色、服装白位/黑位保持同一亮度层级。"
].join("\n");
const RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；本页不需要图2和图3，想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘。",
  "服装锁定：完整保留图1服装款式、颜色、亮度、面料纹理、质感、褶皱、配饰和细节，不换衣、不改色、不提亮、不重绘服装结构。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光影以真实融合为目标：柔和自然光，背景光影匹配图1人物明暗和服装展示需求，不要强行打亮人物，不要让脸、肤色、服装色发生明显漂移；无文字、无水印、无多余人物。"
].join("\n");
const OUTPAINT_DEFAULT_PROMPT = [
  "批量扩图任务：只有图1上传区参与生成，图1是要向下扩图的唯一原图，优先把半身照扩成能看到鞋子的全身图；本页没有参考图、没有补充图。",
  "必须保持图1原有内容完全不变：人物身份、脸、发型、肤色、上半身、服装款式、服装颜色、姿势、重心、手臂、背景、光影、清晰度、构图中已有区域都不移动、不缩放、不重绘、不换脸、不换衣。",
  "只在图1画布下方新增内容：自然补全模特下半身、腿部、脚踝、鞋子和脚底接触阴影；鞋子必须可见，腿脚方向、重心、站姿和透视要延续图1已有身体动作。",
  "扩出来的下半身服装、腿部、鞋子、地面和背景必须像原图同一场景继续拍摄，不要像拼接，不要改变原图上半身，不要新增无关人物、道具、文字、水印或品牌标志。",
  "系统会在生成完成后把图1原有区域本地覆盖回结果图，模型只负责下方留白扩展；生成时也必须避免重绘原图上半部分。"
].join("\n");
const RECOLOR_COLOR_LEGACY_DEFAULT_PROMPT = [
  "批量改色任务：图1上传区是要保留的人物原图，图2上传区是目标颜色/服装颜色参考图，图3上传区是可选补充信息。",
  "只改变图1中被图2选项指定的服装部位颜色；人物脸、发型、肤色、身体姿势、手脚、场景、背景、镜头、构图、服装款式、版型、衣长、袖长、扣子、拉链、腰带、图案、刺绣、口袋、面料纹理和褶皱结构都保持图1原样。",
  "图2只提供目标颜色、明暗关系、饱和度、材质色感和局部颜色参考；不能把图2人物、服装款式、穿法、版型、场景、背景、姿势或光影结构带入图1。",
  "同一批结果颜色要统一稳定，目标部位颜色要自然贴合图1原有光影、褶皱、材质纹理和边缘阴影；不要出现断层、涂抹感、边缘溢色、皮肤染色、场景变色或整张图偏色。",
  "如果图1开启局部回贴，只处理选区或蒙版范围内的目标服装颜色，输出必须和选区同构图、同角度、同光影，方便系统贴回原图。"
].join("\n");
const RECOLOR_DEFAULT_PROMPT = [
  "批量改色任务：图1上传区是要保留的人物原图，图2上传区是目标颜色/服装颜色参考图，图3上传区是可选补充信息。",
  "只改变图1中被图2选项指定的服装部位颜色；人物脸、发型、肤色、身体姿势、手脚、场景、背景、镜头、构图、服装款式、版型、衣长、袖长、扣子、拉链、腰带、图案、刺绣、口袋、面料纹理和褶皱结构都保持图1原样。",
  "图2只提供目标颜色、明暗关系、饱和度、材质色感和局部颜色参考；不能把图2人物、服装款式、穿法、版型、场景、背景、姿势或光影结构带入图1。",
  "颜色校准以图2主颜色参考为准：不要增加饱和度、对比度、油润感、高光或商业滤镜；同批保持同一目标色阶，不变深、不变艳、不发油、不发灰。",
  "同一批结果颜色要统一稳定，目标部位颜色要自然贴合图1原有光影、褶皱、材质纹理和边缘阴影；不要出现断层、涂抹感、边缘溢色、皮肤染色、场景变色、整张图偏色或一批里明显色差。",
  "如果图1开启局部回贴，只处理选区或蒙版范围内的目标服装颜色，输出必须和选区同构图、同角度、同光影，方便系统贴回原图。"
].join("\n");
const DESIGN_DRAFT_DEFAULT_PROMPT = [
  "参考图1上传区的实拍服装图或真人实拍服装图，将服装转换为图2上传区所参考的干净服装设计师手稿风格。图1上传区可能只有一张图，也可能有多张正面、背面、侧面或细节图；请把图1上传区的所有图片当作同一件服装的参考，综合识别服装颜色、版型、领口、袖型、袖口、下摆、长度比例、结构线、拼接方式和主要面料特点。图3上传区是可选的细节补充图，只有上传时才作为面料、袖口、裙摆、衣领、纹理或辅助线效果的补充参考；如果图3没有上传，不要强行假设图3内容。",
  "输出纯白背景的服装设计师手稿图，无人体、无模特、无场景、无衣架，画面只保留服装款式图。能从参考图中判断正反面时，优先输出服装正反面左右并排款式图；如果只有单面参考且背面信息不足，背面只能做保守、简洁、符合服装结构逻辑的合理补全，不要编造复杂设计。服装颜色以图1实拍服装为准，保留原服装的版型、廓形、领口、袖型、袖口、下摆、长度比例和主要结构。整体以黑色线稿为主，搭配极浅的米杏色淡填色，不要真实照片质感，不要复杂面料纹理，不要写实细节。",
  "线条使用手绘板绘制的服装款式图线条，外轮廓线清晰干净，起笔轻、收笔轻、中间压力重，线条两头尖、中间略粗，有自然的笔压变化和克制的手绘笔触；不要像儿童涂抹一样粗细一致、反复描边或杂乱涂抹。内部结构线、领口线、袖口线、下摆线、衣身分割线使用更细的线，线条稳定、准确、干净。",
  "服装所有轮廓转角、袖口四角、下摆边角、接缝拐点位置，点缀极短的浅灰色纤细定位短线。短线只停留在拐点外侧，短小零散，不要长贯穿线条；线条浅淡但要比普通起稿痕迹略明显，明度低于黑色衣身轮廓线，是设计师手稿里的拐点定位辅助短线，不杂乱、不延伸。",
  "面料质感只用非常少量的简化材质符号和浅淡铅笔排线暗示，抓住面料特点即可，不出现真实照片级织物细节，不出现复杂编织纹理，不出现杂乱涂抹线。整体像服装打版师、设计师用手绘板画出来的产品工艺手稿，结构清楚、比例准确、线条干净、有轻微手写压感但不凌乱。"
].join("\n");
const GENERATION_COUNT_OPTIONS = ["auto", ...Array.from({ length: MAX_UPLOAD_IMAGES }, (_, index) => index + 1)];
const LOCAL_EDIT_OUTPUT_TARGET_BYTES = 64 * 1024 * 1024;
const LOCAL_EDIT_OUTPUT_JPEG_QUALITIES = [0.985, 0.975, 0.965, 0.95, 0.94];
const DEFAULT_BATCH_CONCURRENCY = 5;
const LOCAL_EDIT_BATCH_CONCURRENCY = 5;
const LOCAL_EDIT_BATCH_PREPARE_CONCURRENCY = 2;
const LOCAL_EDIT_BATCH_REQUEST_GAP_MS = 250;
const CROP_RETURN_OUTPUT_TARGET_BYTES = 64 * 1024 * 1024;
const CROP_RETURN_OUTPUT_JPEG_QUALITIES = [0.985, 0.975, 0.965, 0.95, 0.94];
const OUTFIT_RERUN_DRAG_MIME = "application/x-jingyin-outfit-task";
const CROP_RETURN_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
// 2026-09-25：局部回贴选框要能锁定 2:3（竖版服装图常用），但**不改**裁剪回流
// 用的 CROP_RETURN_RATIOS（那是另一条产品语义），所以这里单独一份列表。
const BATCH_LOCAL_EDIT_RATIOS = ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"];
const GARMENT_PART_OPTIONS = [
  { value: "upper", label: "上装" },
  { value: "lower", label: "下装" },
  { value: "shoes", label: "鞋子" }
];
// 2026-09-26：`GARMENT_COMPOSITION_OPTIONS` / `GARMENT_PART_PRESET_OPTIONS`（单件上衣 /
// 外套+内搭 / 套装）只服务"批量改色"的改色范围，批量换装不再使用这套旧式顶层切换。
const GARMENT_COMPOSITION_OPTIONS = [
  { value: "single-upper", label: "单件上衣", parts: ["upper"] },
  { value: "upper-layer", label: "外套+内搭", parts: ["upper"] },
  { value: "outfit-set", label: "套装", parts: ["upper", "lower"] },
  { value: "custom", label: "自定义范围", parts: [] }
];
const GARMENT_PART_PRESET_OPTIONS = [
  { value: "single-upper", label: "单件上衣", parts: ["upper"], composition: "single-upper" },
  { value: "upper-layer", label: "外套+内搭", parts: ["upper"], composition: "upper-layer" },
  { value: "outfit-set", label: "套装", parts: ["upper", "lower"], composition: "outfit-set" }
];
const DEFAULT_GARMENT_PARTS = ["upper"];
const DEFAULT_GARMENT_COMPOSITION = "single-upper";

// 2026-09-25：批量尺寸导出的「自动裁剪」功能已整体移除（UI / 状态 / 持久化 / 专用逻辑）。
// 与它无关的导出设置（格式、DPI、最长边、适配方式、填充色、裁剪方式、批量裁剪区域）全部保留。
const DEFAULT_UPLOAD_LABELS = {
  model: {
    title: "带场景模特图",
    hint: "上传完整模特和场景底图；批量时按左到右顺序逐张生成。"
  },
  clothing: {
    title: "服装/产品图",
    hint: "可上传模特穿着图或平铺产品图；后台只抽取服装款式和细节。"
  },
  reference: {
    title: "参考图/物品图",
    hint: "可选；默认不参与换装，只有在补充提示词里明确说明图3用途时才参考。"
  }
};
const POSE_REMIX_UPLOAD_LABELS = {
  model: {
    title: "批量姿态图",
    hint: "批量上传姿态参考；每张只提取脸部朝向、肩膀、手臂、手腕手掌、下半身、重心和构图动势，不参考衣服和背景。"
  },
  clothing: {
    title: "固定母版成片",
    hint: "上传已满意的模特服装场景成片；固定人物身份、脸、发型、服装、穿法、场景和光影，默认最多2张。"
  },
  reference: {
    title: "补充约束图",
    hint: "可选；只有在提示词里明确说明图3用途时才参考，用于补充禁忌、细节边界或客户要求。"
  }
};
const LEGACY_POSE_REMIX_UPLOAD_LABELS = {
  model: {
    title: "固定母版成片",
    hint: "上传 1 张已满意的模特服装场景成片；批量任务固定人物、服装、穿法、场景和光影。"
  },
  clothing: {
    title: "批量姿势参考图",
    hint: "批量上传姿势参考；每张只提取身体姿态、手脚动作、朝向和重心，不参考衣服和背景。"
  },
  reference: {
    title: "补充约束图",
    hint: "可选；只有在提示词里明确说明图3用途时才参考，用于补充禁忌、细节边界或客户要求。"
  }
};
const LOCAL_DETAIL_UPLOAD_LABELS = {
  model: {
    title: "原图/待回贴图",
    hint: "上传需要局部修改的大图；在图1缩略图下方点局部回贴，框选或涂抹要修改的服装细节。"
  },
  clothing: {
    title: "细节结构参考图",
    hint: "上传要参考的局部结构、形状、五金、缝线或纹理走势；不参考图2颜色。"
  },
  reference: {
    title: "补充说明图",
    hint: "可选；补充局部结构或客户要求，颜色、材质、光影仍以图1原产品为准。"
  }
};
const CUSTOM_UPLOAD_LABELS = {
  model: {
    title: "图1",
    hint: "上传本次临时需求的图1，可按需求使用裁剪或局部回贴。"
  },
  clothing: {
    title: "图2",
    hint: "上传本次临时需求的图2。"
  },
  reference: {
    title: "图3",
    hint: "可选；上传补充参考图或额外要求。"
  }
};
const BACKGROUND_CHANGE_UPLOAD_LABELS = {
  model: {
    title: "人物图/模特图",
    hint: "批量上传要保留的人物；位置、姿势、比例、服装和主体占比都要锁定不变。"
  },
  clothing: {
    title: "固定背景图",
    hint: "上传固定目标背景；批量人物都放进同一场景，人物光影要自然贴合背景。"
  },
  reference: {
    title: "补充参考图",
    hint: "可选；补充场景氛围、光线、色调、道具边界或本次客户要求。"
  }
};
const RANDOM_BACKGROUND_UPLOAD_LABELS = {
  model: {
    title: "批量人物图",
    hint: "批量上传要换随机背景的人物原图；脸、姿势、服装、构图和人物占比都要锁定不变。"
  },
  clothing: {
    title: "不参与",
    hint: "随机背景不使用图2，场景需求请写在场景补充。"
  },
  reference: {
    title: "不参与",
    hint: "随机背景不使用图3，避免参考图干扰人物和服装。"
  }
};
const RECOLOR_UPLOAD_LABELS = {
  model: {
    title: "批量原图/模特图",
    hint: "批量上传要改色的原图；人物、姿势、场景、肤色、服装款式和细节都要锁定不变。"
  },
  clothing: {
    title: "改色服装参考图",
    hint: "上传目标颜色参考，可上传多张；只读取图2选中服装范围的颜色、明暗和材质色感。"
  },
  reference: {
    title: "补充参考图",
    hint: "可选；补充颜色禁忌、局部材质、客户要求或要避免的效果，不上传时不强行添加。"
  }
};
// 2026-09-26 历次精修上传区标题（只用于把还停在旧标题上的页面迁移过来；用户改过的标题不动）：
//   第一代：批量平铺图/挂拍图 + 可选参考/细节图
//   第二代：多图生图（图1~图N）+ 补充素材（图N+1…）
const LEGACY_WHITE_REFINE_UPLOAD_LABELS_1 = {
  model: {
    title: "批量平铺图/挂拍图",
    hint: "批量上传要变白底并精修的服装图；图1款式、颜色、面料和全部细节是唯一主事实。"
  },
  clothing: {
    title: "可选参考/细节图",
    hint: "可选上传标准平铺、袖口腰带扣子等细节或衣架去除参考；只辅助精修，不覆盖图1款式颜色。"
  },
  reference: {
    title: "不参与",
    hint: "白底精修不使用图3，补充要求请写在文字里。"
  }
};
const LEGACY_WHITE_REFINE_UPLOAD_LABELS_2 = {
  model: {
    title: "多图生图（图1~图N）",
    hint: "同一件服装可以一次上传多张（正面/背面/侧面/细节/挂拍）；点生成只输出一张白底精修成品图。"
  },
  clothing: {
    title: "补充素材（图N+1…）",
    hint: "继续补充同一件服装的其它角度或细节；和多图生图里的图一起合成同一张成品，不作为单独款式。"
  },
  reference: {
    title: "不参与",
    hint: "白底精修不使用图3，补充要求请写在文字里。"
  }
};
const WHITE_REFINE_UPLOAD_LABELS = {
  model: {
    // 2026-09-26（按用户要求）：图1 就是多图上传区，标题直接叫「图片上传」。
    // 图2 已经不再渲染（图1 本身就是多图生图），这里保留一份标题只为兼容数据形状。
    title: "图片上传",
    hint: "同一件服装可以一次上传多张（正面/背面/侧面/细节/挂拍）；点生成只输出一张白底精修成品图。"
  },
  clothing: {
    title: "补充素材（已不用）",
    hint: "精修页只需要图1 的多图上传；这里仅为兼容旧数据保留。"
  },
  reference: {
    title: "不参与",
    hint: "白底精修不使用图3，补充要求请写在文字里。"
  }
};
const OUTPAINT_UPLOAD_LABELS = {
  model: {
    title: "待扩图原图",
    hint: "批量上传要向下扩图的半身照或局部人物图；只用图1生成，原有画面会本地覆盖保护。"
  },
  clothing: {
    title: "不参与",
    hint: "批量扩图不使用图2。"
  },
  reference: {
    title: "不参与",
    hint: "批量扩图不使用图3。"
  }
};
const POSE_MOTHER_FACE_SWAP_UPLOAD_LABELS = {
  model: {
    title: "批量姿态图",
    hint: "批量上传姿态参考图；只提取姿势、半身/全身裁切、镜头距离和构图动势，不提取人物身份、服装或背景。"
  },
  clothing: {
    title: "固定母图",
    hint: "上传要保留的人物母图；脸、发型、服装、场景、光影和商业摄影质感都以母图为准。"
  },
  reference: {
    title: "补充参考图",
    hint: "可选；补充本次姿态、表情、妆造、客户要求或禁忌，不上传时不强行添加。"
  }
};
const FACE_SWAP_UPLOAD_LABELS = {
  model: {
    title: "目标人物图",
    hint: "批量上传要换脸的原图；身体、衣服、姿势、背景、构图和头部坐标要保留，原脸型发型头饰不作为结果参考。"
  },
  clothing: {
    title: "脸型发型母图",
    hint: "上传要替换进去的母图；脸型、五官、发型、头饰/发饰、妆容和脸部色调都以这里为准。"
  },
  reference: {
    title: "妆容/表情补充图",
    hint: "可选；补充妆容、表情、年龄感、皮肤质感、客户要求或禁忌，不上传时不强行添加。"
  }
};
const LEGACY_FACE_SWAP_UPLOAD_LABELS = FACE_SWAP_UPLOAD_LABELS;
const DESIGN_DRAFT_UPLOAD_LABELS = {
  model: {
    title: "实拍服装图/真人实拍图",
    hint: "上传单张或多张实拍参考；正反面、侧面会合并识别为同一件服装。"
  },
  clothing: {
    title: "手稿风格参考图",
    hint: "上传设计稿或手稿样式参考；用于笔触、线条、淡填色和拐点短线风格。"
  },
  reference: {
    title: "细节/手稿补充图",
    hint: "可选；补充面料、袖口、裙摆、衣领、纹理或辅助短线效果。"
  }
};
// 旧默认值：用于把"当年没改过、存的只是默认值"的存档迁到 3500。
// 只对这一个值做迁移，其余自定义值（2000/4000/…）不动。

const OUTFIT_DEFAULT_PROMPT = [
  "让图1当前人物穿着图2服装，生成自然干净的电商成片。",
  "以图1为人物姿势和构图基准，不改变图1模特的姿势、位置、身体比例、手部姿势和画面构图；保留身份、发型、原脸质感、镜头、背景和原图光影，不磨皮、不变脸。",
  "图1模特身上的原服装不作为图2服装的款式、版型、大小、松量或长度参考；图1的服装不做任何款式参考，尤其不能影响图2袖长、袖口落点、袖筒松量、衣长、领口、扣子、衣摆扎法、颜色和面料。",
  "图2是唯一服装标准：保留款式、版型、长度、松量、颜色、面料、领口、袖口、袖子穿法、扣合状态、衣摆扎法、下摆、扣子、拉链、拼接、里衬/网纱层次等关键细节。",
  "图2服装颜色校准必须保持：不要增加饱和度、对比度、油润感、高光或商业滤镜；同批保持同一服装色阶，不变浅、不变深、不变艳、不发油、不发灰，也不要因图1环境自动改色。",
  "用户补充文字里明确点名的删除、移除、去掉类要求必须完整执行，不能只处理一部分或留下残影。",
  "只做真实穿着适配，不按模型审美把图2改短、收腰、修身、瘦身、重设计或简化细节。",
  "袖子状态按图2实际穿法执行：放下就放下，卷起就卷起，挽起就挽起；袖口落点、袖克夫长度、卷袖高度和层数不要上提、缩短或随机变化。",
  "扣子、拉链、门襟开合和衣摆扎法按图2保持；如果涉及扎入下装，先识别图1真实下装类型，再把图2同样的扎入位置和露出边界适配过去。",
  "服装细节保持自然真实，面料垂坠、褶皱、光影和原图环境一致，保留清新干净的商业摄影质感。"
].join("\n");
const LOCAL_DETAIL_DEFAULT_PROMPT = [
  "局部服装细节任务：在图1指定局部区域内，只修改用户点名的服装细节。",
  "图1是颜色、基础材质、明暗、光影、纹理尺度和周边衔接的标准；选区外和未点名区域保持图1原样。",
  "图2只参考被点名细节的结构、形状、五金、缝线、纹理走势或工艺位置；不参考图2颜色、色温、曝光、背景，也不要把图2当整件服装来源。",
  "局部结果必须像原本长在图1这件衣服上，边缘自然连续，不出现突兀色块、材质断层或人物位置变化。"
].join("\n");

const PROMPT_BUILTIN_PRESETS = [
  {
    id: "outfit-keep",
    title: "换装保结构",
    category: "常用",
    content: OUTFIT_DEFAULT_PROMPT
  },
  {
    id: "local-outfit-material-fit",
    title: "局部换装锁版型面料",
    category: "常用",
    content: [
      "局部换装任务：图1是原图，已框选局部编辑区域；图2是本次要换上的服装唯一来源。",
      "请先在内部分析图2服装的面料类别和可见材质事实，例如棉麻、帆布、牛仔、雪纺、皮革、蕾丝、网纱、针织等，以及织纹方向、颗粒大小、厚薄、垂感、光泽、高光位置、透明度、褶皱逻辑、缝线方向和边缘结构；不要输出分析文字，只把分析结果用于生成。",
      "把图2服装真实穿到图1人物局部区域内，严格保持图2的服装类别、版型、廓形、宽松/修身程度、腰身松量、肩线、领口形状、袖型、袖长、袖口、袖子穿法、扣合状态、衣摆扎法、衣长、裙长、下摆宽度、开衩、扣子、拉链、口袋、拼接线、颜色、面料纹理、厚薄、垂感、反光和光泽。",
      "图1原服装只用于判断身体轮廓和遮挡，不参考它的袖长、袖口位置、松量、衣长、领口、门襟、扣子、颜色、面料或褶皱。",
      "图2颜色深浅、明度、饱和度和面料光泽必须保持，不要把服装变浅、泛白、发灰、降饱和、加柔光或提亮成浅一号。",
      "只允许做符合图1姿态和身体角度的真实穿着适配与自然褶皱，不能按模型审美自动美化版型；禁止把图2服装改成更收腰、更细腰、更短、更紧身、更修身、更顺滑、更亮、更薄、更厚或更完美状态。",
      "图1人物的脸、发型、头部位置、身体比例、姿势、手臂手腕手指、腿脚、背景光影和选区边缘必须保持稳定；不要输出整张重构图、对比图、文字、水印或边框。"
    ].join("\n")
  },
  {
    id: "detail-lock",
    title: "细节锁定",
    category: "常用",
    content: "重点锁定图2服装的面料纹理、领口、袖口、扣子、拼接线、褶皱、内衬、网纱/蕾丝外层和内里长度差，确保批量结果细节一致，避免衣长漂移、版型变修身、腰身松量变化、错位和材质漂移。"
  },
  {
    id: "soft-pad",
    title: "背景边缘扩充",
    category: "常用",
    content: "只扩充或裁剪画布边缘来匹配目标比例，人物/主体的站位、中心、大小和构图重心必须保持原图不偏移；扩展区域从原图背景边缘自然填充，不要移动、重绘或替换主体。"
  },
  {
    id: "batch-copy",
    title: "批量复刻",
    category: "批量复刻",
    content: "保持同一批结果在人物风格、镜头、布光、构图和商品表现上统一，只允许在目标内容上做必要替换，其他部分尽量一致。"
  },
  {
    id: "batch-sku",
    title: "批量SKU",
    category: "批量sku",
    content: "批量生成同一商品的不同SKU画面时，统一电商调性、背景洁净、主体清晰，颜色和款式切换准确，避免无关变化。"
  },
  {
    id: "partial-migrate",
    title: "局部迁移",
    category: "局部迁移",
    content: "仅迁移指定局部信息，其余区域保持原图结构和风格稳定，避免整体被重绘成新的风格。"
  }
];

const THEME_OPTIONS = [
  { value: "dark", label: "暗夜", colors: ["#080910", "#151522", "#10cfc4"] },
  { value: "jade", label: "柔粉", colors: ["#fff2f7", "#fffafd", "#ec6f9e"] },
  { value: "graphite", label: "米杏", colors: ["#f3e6d4", "#fff8ec", "#c98652"] },
  { value: "mist", label: "浅雾", colors: ["#f5f7fa", "#ffffff", "#0d7a76"] }
];

const PROMPT_PRESET_GROUPS = [
  {
    category: "常用",
    presets: [
      {
        title: "标准换装",
        content: "让图1人物穿着图2服装，保留人物脸部、身材比例和自然姿态，服装版型、颜色、材质、领口、袖口、纽扣、腰线和长度准确自然。"
      },
      {
        title: "电商主图",
        content: "生成一张干净高级的电商主图，人物和服装占画面主体，背景简洁，光线柔和，服装边缘贴合自然，避免拼接感、过曝和廉价滤镜。"
      },
      {
        title: "白底展示",
        content: "输出白底或浅灰干净背景，模特自然站姿，完整展示服装正面穿着效果，保持衣服真实版型、颜色和细节，不改变人物五官和身材比例。"
      }
    ]
  },
  {
    category: "细节锁定",
    presets: [
      {
        title: "面料纹理",
        content: "重点锁定图2服装的面料纹理、厚薄、垂感、光泽和褶皱逻辑，穿到图1人物身上后保持真实服装质感，不能变成塑料感或糊成一片。"
      },
      {
        title: "版型结构",
        content: "严格保留图2服装的版型结构，包括领型、肩线、袖长、腰线、下摆长度、扣子位置和拼接结构，避免错领、错袖、错扣和比例变形。"
      },
      {
        title: "蕾丝双层",
        content: "如果图2是蕾丝、网纱、假两件或内外双层结构，必须保留外层纹理和内层布面/内衬的层次关系，不能合并成单层布料。"
      },
      {
        title: "鞋包配饰",
        content: "保留图1人物原有姿态和适合画面的鞋包配饰，只让服装替换为图2款式；无关品牌标识、水印和文字不要进入最终画面。"
      }
    ]
  },
  {
    category: "构图光线",
    presets: [
      {
        title: "全身海报",
        content: "全身构图，人物从头到脚完整入画，鞋子和下摆不能被裁掉，四周留出自然呼吸空间，适合女装海报和电商详情首屏。"
      },
      {
        title: "柔光质感",
        content: "使用柔和四面补光，低反差，无生硬黑影，突出衣服轮廓、面料纹理和高级质感，背景干净真实，不要过曝。"
      },
      {
        title: "轻场景",
        content: "场景为简约室内、白墙建筑、浅色咖啡馆或干净街拍氛围，场景只服务服装展示，避免繁杂道具和网红打卡感。"
      }
    ]
  }
];

const PROMPT_CATEGORIES = ["全部", ...new Set([
  ...PROMPT_PRESET_GROUPS.map((group) => group.category),
  ...PROMPT_BUILTIN_PRESETS.map((preset) => preset.category)
])];

const BUILTIN_PROMPT_LIBRARY = [
  ...PROMPT_BUILTIN_PRESETS,
  ...PROMPT_PRESET_GROUPS.flatMap((group, groupIndex) => group.presets.map((preset, presetIndex) => ({
    id: `legacy_${groupIndex}_${presetIndex}`,
    title: preset.title,
    category: group.category,
    content: preset.content
  })))
];

function shouldRepairOutfitPrompt(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return true;
  if (/(唯一人物底图和几何基准|图1人物几何锁定|肩胯角度|姿势幅度|鞋脚接地点)/.test(text)
    && /(让图1当前人物穿着图2服装|图2服装|唯一服装标准)/.test(text)) return true;
  if (/补齐画布|背景从原图氛围自然延展|不要引入新的主体元素/.test(text)) return true;
  if (/让图1模特穿着图2服装，图1模特的样貌[\s\S]*不优化图2服装款式/.test(text)) return true;
  if (/必须让图1人物穿着图2服装。保持图1模特[\s\S]*手脚位置[\s\S]*不优化、重设计/.test(text)) return true;
  if (/批量换装任务：图1是当前模特图[\s\S]*图2服装是唯一换装标准[\s\S]*不优化、重设计或简化图2服装款式/.test(text)) return true;
  if (/图3只做可选补充，不替代图2/.test(text)) return true;
  if (/让图1当前人物穿着图2服装，生成自然干净的电商成片。[\s\S]*图1模特身上的原服装不作为图2服装/.test(text)
    && !/以图1为人物姿势和构图基准/.test(text)) return true;
  return false;
}

function normalizeSmartIntervention(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value ?? "false").trim().toLowerCase();
  return ["1", "true", "on", "smart", "智能", "开启"].includes(text);
}

// 中文注释：AI质检只作为生成后标记和返修提示，不写入或暴露 API Key。


function normalizeGarmentParts(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\s|，、]+/);
  const next = GARMENT_PART_OPTIONS
    .map((option) => option.value)
    .filter((part) => raw.includes(part));
  return next.length > 0 ? next : DEFAULT_GARMENT_PARTS;
}

function sameGarmentParts(left, right) {
  const leftParts = normalizeGarmentParts(left).slice().sort();
  const rightParts = normalizeGarmentParts(right).slice().sort();
  return leftParts.length === rightParts.length && leftParts.every((part, index) => part === rightParts[index]);
}

function normalizeGarmentComposition(value, garmentParts = DEFAULT_GARMENT_PARTS) {
  const allowed = new Set(GARMENT_COMPOSITION_OPTIONS.map((option) => option.value));
  const parts = normalizeGarmentParts(garmentParts);
  const next = allowed.has(String(value || "")) ? String(value) : DEFAULT_GARMENT_COMPOSITION;
  const upperOnly = parts.length === 1 && parts.includes("upper");
  const upperLowerOnly = parts.length === 2 && parts.includes("upper") && parts.includes("lower");
  if (["single-upper", "upper-layer"].includes(next)) return upperOnly ? next : "custom";
  if (next === "outfit-set") return upperLowerOnly ? next : "custom";
  return "custom";
}

function garmentCompositionLabel(value) {
  return GARMENT_COMPOSITION_OPTIONS.find((option) => option.value === value)?.label || "自定义范围";
}

// 2026-09-26：原来的「母版锁版型」三件套（masterFitLock / masterFitSpec / masterFitSourceId）
// 已删除 —— 它锁的是一整段母版提示词，而那段提示词从来没进过服务端最终提示词（死逻辑）。
// 现在图2的结论统一走 `outfitIntent.facts`（结构化服装事实），由唯一编译器插入提示词。
const RANDOM_BACKGROUND_FOCUS_OPTIONS = [
  { value: "default", label: "默认" },
  { value: "upper", label: "上衣" },
  { value: "lower", label: "下装" },
  { value: "set", label: "套装" }
];


const defaultSettings = {
  apiKey: "",
  // canonical ID：旧存档里的 gpt-image / nano-banana2 会由 canonicalModel 在读取时映射。
  model: "tt-image-2",
  channelId: "",
  dispatchMode: "manual",
  aspectRatio: "3:4",
  imageSize: "2K",
  concurrency: DEFAULT_BATCH_CONCURRENCY,
  generationCount: "auto",
  smartIntervention: false,
  qualityCheck: false,
  // 批量改色的改色范围（旧机制，只有 recolor 还在用）。
  garmentParts: DEFAULT_GARMENT_PARTS,
  garmentComposition: DEFAULT_GARMENT_COMPOSITION,
  // 批量换装的结构化意图（唯一来源）：更换部位 / 上装层级 / 穿法 / 图2服装事实。
  outfitIntent: defaultOutfitIntent(),
  // 服装精修的结构化意图（唯一来源）：对称 / 衣摆或裙摆 / 版型 / 用户补充。
  retouchIntent: defaultRetouchIntent(),
  pairingMode: "fixed",
  preprocessMode: DEFAULT_PREPROCESS_MODE,
  randomBackgroundFocus: "default",
  theme: "dark",
  prompt: OUTFIT_DEFAULT_PROMPT,
  productNote: ""
};

function readSettings() {
  try {
    const stored = readJsonStorage(STORAGE_KEY, {});
    const settings = { ...defaultSettings, ...stored };
    if (shouldUpgradeLegacyBatchConcurrency(settings)) {
      settings.concurrency = DEFAULT_BATCH_CONCURRENCY;
      settings[BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY] = true;
    }
    if (settings.generationCount === 10 && settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] !== true) {
      settings.generationCount = "auto";
      settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] = true;
    }
    if (shouldRepairOutfitPrompt(settings.prompt)) settings.prompt = OUTFIT_DEFAULT_PROMPT;
    settings.generationCount = normalizeGenerationCount(settings.generationCount);
    settings.smartIntervention = normalizeSmartIntervention(settings.smartIntervention);
    settings.qualityCheck = normalizeQualityCheck(settings.qualityCheck);
    settings.garmentParts = normalizeGarmentParts(settings.garmentParts);
    settings.garmentComposition = normalizeGarmentComposition(settings.garmentComposition, settings.garmentParts);
    settings.outfitIntent = normalizeOutfitIntent(settings.outfitIntent);
    settings.retouchIntent = normalizeRetouchIntent(settings.retouchIntent);
    settings.randomBackgroundFocus = normalizeRandomBackgroundFocus(settings.randomBackgroundFocus);
    settings.concurrency = normalizeBatchConcurrency(settings.concurrency);
    settings.preprocessMode = DEFAULT_PREPROCESS_MODE;
    // 旧存档模型 ID 归一化到 3.0 canonical ID；目录加载完成后还会再收敛一次能力参数。
    settings.model = canonicalModel(settings.model);
    settings.dispatchMode = "manual";
    settings.channelId = String(settings.channelId || "");
    return settings;
  } catch {
    return defaultSettings;
  }
}

function normalizeOutfitPageName(value, fallback = DEFAULT_OUTFIT_PAGE_NAME) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  // 旧名字（批量换装 / 批量AI换装 / 批量生成）统一迁移到新的短名字「换装」。
  if (name === "批量AI换装" || name === "批量生成" || name === "批量换装") return DEFAULT_OUTFIT_PAGE_NAME;
  if (/批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(name)) return DEFAULT_POSE_REMIX_PAGE_NAME;
  if (/局部细节|局部精修|局部贴回|local\s*detail/i.test(name)) return DEFAULT_LOCAL_DETAIL_PAGE_NAME;
  if (/随机背景|随机场景|随机实景|random\s*background/i.test(name)) return DEFAULT_RANDOM_BACKGROUND_PAGE_NAME;
  if (/换固定背景|固定背景|换背景|換背景|背景更换|背景替换|换场景|換場景/i.test(name)) return DEFAULT_BACKGROUND_CHANGE_PAGE_NAME;
  if (/批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(name)) return DEFAULT_OUTPAINT_PAGE_NAME;
  if (/批量改色|改色|换色|服装改色|颜色替换|颜色参考|recolor/i.test(name)) return DEFAULT_RECOLOR_PAGE_NAME;
  // 「精修」是新的短名字；旧的「批量白底（图）精修」仍然识别，老存档读取时自动迁移。
  if (/精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(name)) return DEFAULT_WHITE_REFINE_PAGE_NAME;
  return (name || fallback).slice(0, 18);
}

function isPoseRemixPageName(value) {
  return /批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|固定成片|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(String(value || ""));
}

function isLocalDetailPageName(value) {
  return /局部回贴|局部贴回|局部细节|局部精修|local\s*detail/i.test(String(value || ""));
}

function isBackgroundChangePageName(value) {
  return /换固定背景|固定背景|换背景|換背景|背景更换|背景替换|换场景|換場景|场景图|统一场景/i.test(String(value || ""));
}

function isRandomBackgroundPageName(value) {
  return /随机背景|随机场景|随机实景|random\s*background/i.test(String(value || ""));
}

function isOutpaintPageName(value) {
  return /批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(String(value || ""));
}

function isRecolorPageName(value) {
  return /批量改色|改色|换色|服装改色|颜色替换|颜色参考|recolor/i.test(String(value || ""));
}

function isWhiteRefinePageName(value) {
  return /精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(String(value || ""));
}

function isDesignDraftPageName(value) {
  return /设计稿|設計稿|design/i.test(String(value || ""));
}

function isFaceSwapPageName(value) {
  return /批量换脸|换脸|人脸|脸部|face\s*swap/i.test(String(value || ""));
}

function isCustomWorkflowPageName(value) {
  return /临时需求|自定义需求|批量需求|custom/i.test(String(value || ""));
}

function mentionsOptionalReferenceImage(prompt, productNote) {
  const text = [prompt, productNote].join("\n");
  return /图\s*3|图三|第三张|第三个|补充图|补充参考|参考图\s*3|reference\s*3/i.test(String(text || ""));
}

function defaultUploadLabelsForPage(name) {
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

function defaultPromptForWorkflowMode(mode) {
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

function workflowModeFromPage(pageName, uploadLabels) {
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
    return "recolor";
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

function normalizeUploadLabelText(value, fallback, limit = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, limit);
}

function normalizeUploadLabels(value = {}, pageName = DEFAULT_OUTFIT_PAGE_NAME) {
  const defaults = defaultUploadLabelsForPage(pageName);
  return Object.fromEntries(["model", "clothing", "reference"].map((key) => {
    const current = value?.[key] || {};
    return [key, {
      title: normalizeUploadLabelText(current.title, defaults[key].title, 36),
      hint: normalizeUploadLabelText(current.hint, defaults[key].hint, 140)
    }];
  }));
}

function sameUploadLabels(left, right) {
  const normalizedLeft = normalizeUploadLabels(left);
  const normalizedRight = normalizeUploadLabels(right);
  return ["model", "clothing", "reference"].every((key) => (
    normalizedLeft[key].title === normalizedRight[key].title
    && normalizedLeft[key].hint === normalizedRight[key].hint
  ));
}

function uploadLabelsMatchPreset(value, preset) {
  return ["model", "clothing", "reference"].every((key) => (
    String(value?.[key]?.title || "") === String(preset?.[key]?.title || "")
    && String(value?.[key]?.hint || "") === String(preset?.[key]?.hint || "")
  ));
}

function isLegacyPoseRemixUploadLabels(value = {}) {
  const modelTitle = String(value?.model?.title || "");
  const clothingTitle = String(value?.clothing?.title || "");
  return /固定母版|固定成片|固定模特/i.test(modelTitle)
    && /姿势|姿态|pose/i.test(clothingTitle);
}

function inferOutfitWorkflowMode(pageName, uploadLabels) {
  return workflowModeFromPage(pageName, uploadLabels);
}

function isSingletonWorkflowMode(mode) {
  return SINGLETON_WORKFLOW_MODES.has(String(mode || ""));
}

function outfitPageContentScore(page = {}) {
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

function dedupeSingletonWorkflowPages(pages = []) {
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

function normalizeOutfitPageSettings(value = {}, options = {}) {
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

function stripOutfitPageGlobalSettings(value = {}, options = {}) {
  const next = normalizeOutfitPageSettings(value, options);
  const { apiKey, theme, preprocessMode, ...pageSettings } = next;
  return pageSettings;
}

function mergeOutfitPageSettings(pageSettings = {}, currentSettings = readSettings(), options = {}) {
  const next = normalizeOutfitPageSettings({ ...currentSettings, ...(pageSettings || {}) }, options);
  return {
    ...next,
    apiKey: currentSettings.apiKey || "",
    theme: normalizeTheme(currentSettings.theme)
  };
}

function makeOutfitPage(name = DEFAULT_OUTFIT_PAGE_NAME, patch = {}) {
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

function makeDesignDraftPage(baseSettings = readSettings(), patch = {}) {
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

function makePoseRemixPage(baseSettings = readSettings(), patch = {}) {
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

function makeBackgroundChangePage(baseSettings = readSettings(), patch = {}) {
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

function makeRandomBackgroundPage(baseSettings = readSettings(), patch = {}) {
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

function makeRecolorPage(baseSettings = readSettings(), patch = {}) {
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

function makeWhiteRefinePage(baseSettings = readSettings(), patch = {}) {
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

function makeFaceSwapPage(baseSettings = readSettings(), patch = {}) {
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

function ensureWorkflowPages(pages = [], baseSettings = readSettings()) {
  let output = dedupeSingletonWorkflowPages(Array.isArray(pages) ? pages.filter(Boolean) : [])
    .filter((page) => {
      const mode = inferOutfitWorkflowMode(page.name, page.uploadLabels);
      return mode !== "local-detail" && mode !== "outpaint";
    });
  const hasPoseRemixPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "pose-remix");
  const hasBackgroundChangePage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change");
  const hasRandomBackgroundPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "random-background");
  const hasRecolorPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "recolor");
  const hasWhiteRefinePage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "white-refine");
  const hasFaceSwapPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "face-swap");
  const hasDesignDraftPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft");

  if (!hasPoseRemixPage) {
    const outfitIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "outfit");
    const poseRemixPage = makePoseRemixPage(baseSettings);
    output = outfitIndex >= 0
      ? [...output.slice(0, outfitIndex + 1), poseRemixPage, ...output.slice(outfitIndex + 1)]
      : [poseRemixPage, ...output];
  }

  if (!hasBackgroundChangePage) {
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const backgroundPage = makeBackgroundChangePage(baseSettings);
    output = designIndex >= 0
      ? [...output.slice(0, designIndex), backgroundPage, ...output.slice(designIndex)]
      : [...output, backgroundPage];
  }

  if (!hasRandomBackgroundPage) {
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

  if (!hasRecolorPage) {
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

  if (!hasWhiteRefinePage) {
    const recolorIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "recolor");
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const whiteRefinePage = makeWhiteRefinePage(baseSettings);
    output = recolorIndex >= 0
      ? [...output.slice(0, recolorIndex + 1), whiteRefinePage, ...output.slice(recolorIndex + 1)]
      : designIndex >= 0
        ? [...output.slice(0, designIndex), whiteRefinePage, ...output.slice(designIndex)]
        : [...output, whiteRefinePage];
  }

  if (!hasFaceSwapPage) {
    const designIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft");
    const faceSwapPage = makeFaceSwapPage(baseSettings);
    output = designIndex >= 0
      ? [...output.slice(0, designIndex), faceSwapPage, ...output.slice(designIndex)]
      : [...output, faceSwapPage];
  }

  if (!hasDesignDraftPage) {
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

function serializeOutfitPage(page) {
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

function readOutfitPages() {
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

function pickInitialOutfitPage(pages = []) {
  const list = Array.isArray(pages) ? pages.filter(Boolean) : [];
  return list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "outfit")
    || list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change")
    || list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft")
    || list[0]
    || makeOutfitPage(DEFAULT_OUTFIT_PAGE_NAME);
}

function normalizeTheme(value) {
  return THEME_OPTIONS.some((theme) => theme.value === value) ? value : defaultSettings.theme;
}

function themeToVars(theme) {
  const palette = {
    dark: {
      appBg: "#07090d",
      shellBg: "#0b0d14",
      sidebarBg: "rgba(12, 13, 20, 0.92)",
      topbarBg: "rgba(7, 9, 13, 0.88)",
      panelBg: "rgba(255, 255, 255, 0.045)",
      panelStrongBg: "rgba(255, 255, 255, 0.055)",
      inputBg: "rgba(255, 255, 255, 0.06)",
      buttonBg: "rgba(255, 255, 255, 0.055)",
      border: "rgba(255, 255, 255, 0.1)",
      text: "#eef4f5",
      textSoft: "#93a0aa",
      accent: "#1fcfc3",
      accentText: "#061515",
      accentBorder: "#1fcfc3",
      danger: "#ffb3b3",
      optionBg: "#141821"
    },
    jade: {
      appBg: "#fff5f9",
      shellBg: "#fff1f6",
      sidebarBg: "rgba(255, 242, 247, 0.96)",
      topbarBg: "rgba(255, 248, 251, 0.94)",
      panelBg: "rgba(255, 255, 255, 0.72)",
      panelStrongBg: "rgba(255, 255, 255, 0.82)",
      inputBg: "rgba(255, 255, 255, 0.85)",
      buttonBg: "rgba(255, 255, 255, 0.8)",
      border: "rgba(236, 111, 158, 0.18)",
      text: "#35212a",
      textSoft: "#8d7280",
      accent: "#ec6f9e",
      accentText: "#ffffff",
      accentBorder: "#ec6f9e",
      danger: "#cf5b79",
      optionBg: "#fff7fb"
    },
    graphite: {
      appBg: "#fcf4e7",
      shellBg: "#f6ebdb",
      sidebarBg: "rgba(249, 239, 226, 0.96)",
      topbarBg: "rgba(252, 246, 236, 0.94)",
      panelBg: "rgba(255, 251, 244, 0.82)",
      panelStrongBg: "rgba(255, 252, 247, 0.9)",
      inputBg: "rgba(255, 255, 255, 0.88)",
      buttonBg: "rgba(255, 255, 255, 0.82)",
      border: "rgba(201, 134, 82, 0.18)",
      text: "#3b2d22",
      textSoft: "#907561",
      accent: "#c98652",
      accentText: "#ffffff",
      accentBorder: "#c98652",
      danger: "#b86c4b",
      optionBg: "#fffaf3"
    },
    mist: {
      appBg: "#eef5f7",
      shellBg: "#f6fbfc",
      sidebarBg: "rgba(245, 249, 250, 0.96)",
      topbarBg: "rgba(248, 251, 252, 0.94)",
      panelBg: "rgba(255, 255, 255, 0.82)",
      panelStrongBg: "rgba(255, 255, 255, 0.92)",
      inputBg: "rgba(255, 255, 255, 0.88)",
      buttonBg: "rgba(255, 255, 255, 0.82)",
      border: "rgba(13, 122, 118, 0.16)",
      text: "#1f3132",
      textSoft: "#6e8082",
      accent: "#0d7a76",
      accentText: "#ffffff",
      accentBorder: "#0d7a76",
      danger: "#c65d5d",
      optionBg: "#f7fbfc"
    }
  };
  return palette[normalizeTheme(theme)] || palette.dark;
}






// 🔴 与 src/main.jsx 的 `loadPromptPresets` **同名不同义**，不是复制、不许合并（V11-RF-040 裁定：改名不合并）。跨文件引用只写函数名、不写行号（V11-RF-040c 裁决）。
//    两边差别（改名前逐对 diff 的结论）：
//      · main 侧是**简单版**：stored 非空就返回 stored（逐条归一化、过滤空内容），否则返回 builtinPrompts；
//      · 本侧（outfit）是**合并版**：内置库优先覆盖非 custom 项的 title/content，再补回 stored 缺失的内置项；
//      · 两边读的 localStorage 键也不同 —— main：`${STORAGE_PREFIX}-prompt-library-*`；
//        outfit：`jingyin-outfit-workflow-prompt-library-*`。
//    ⇒ 统一任一侧都会改变「用户看到的提示词列表」，属**行为归一决策**（storage key 是否合一 = 产品决策，另立单）。
//    ⇒ 本单只做**改名**，让名字名实相符；不动任何兜底数据、不动合并策略、不动 storage key。
function loadOutfitPromptPresets() {
  const builtins = BUILTIN_PROMPT_LIBRARY.map(normalizePromptPreset).filter((preset) => preset.content);
  const stored = readJsonStorage(PROMPT_PRESETS_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    const builtinsById = new Map(builtins.map((preset) => [preset.id, preset]));
    const seenIds = new Set();
    const merged = stored.map(normalizePromptPreset).filter((preset) => preset.content).map((preset) => {
      seenIds.add(preset.id);
      const builtin = builtinsById.get(preset.id);
      if (!builtin || preset.custom) return preset;
      return {
        ...preset,
        title: builtin.title,
        content: builtin.content,
        custom: false
      };
    });
    builtins.forEach((preset) => {
      if (!seenIds.has(preset.id)) merged.push(preset);
    });
    return merged;
  }
  return builtins;
}

// 🔴 与 src/main.jsx 的 `loadPromptCategories` **同名不同义**（V11-RF-040 裁定：改名不合并）。跨文件引用只写函数名、不写行号（V11-RF-040c 裁决）。
//    函数骨架两边逐字相同，**唯一差别是兜底常量**：
//      · main 侧用写死的 5 项 `promptCategories` = ["全部","常用","批量复刻","批量sku","局部迁移"]；
//      · 本侧（outfit）用由 PROMPT_PRESET_GROUPS / PROMPT_BUILTIN_PRESETS **动态聚合**的 `PROMPT_CATEGORIES`。
//    ⇒ 同理只改名、不合并、不豁免（豁免机制一旦存在，迟早被用来掩盖真重复）。
function loadOutfitPromptCategories() {
  const storedCategories = readJsonStorage(PROMPT_CATEGORIES_KEY, null);
  const storedPrompts = readJsonStorage(PROMPT_PRESETS_KEY, null) || [];
  const presetCategories = Array.isArray(storedPrompts)
    ? storedPrompts.map((preset) => preset?.category)
    : [];
  const base = Array.isArray(storedCategories) && storedCategories.length > 0
    ? ["全部", ...storedCategories]
    : PROMPT_CATEGORIES;
  return normalizePromptCategories([...base, ...presetCategories]);
}



function formatClock(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return "--";
  return new Date(time).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}


function qualityStatusClass(check) {
  const status = normalizeQualityCheckResult(check)?.status || "";
  if (status === "passed") return "pass";
  if (status === "failed") return "fail";
  if (status === "checking" || status === "pending") return "checking";
  if (status === "skipped") return "skipped";
  return status ? "error" : "";
}

function qualityStatusLabel(check) {
  const item = normalizeQualityCheckResult(check);
  if (!item) return "";
  const score = Number.isFinite(item.score) ? ` ${item.score}` : "";
  if (item.status === "passed") return `质检合格${score}`;
  if (item.status === "failed") return `质检不合格${score}`;
  if (item.status === "checking") return "AI质检中";
  if (item.status === "pending") return "等待质检";
  if (item.status === "skipped") return "未质检";
  return "质检异常";
}

function qualityBadgeTitle(check) {
  const item = normalizeQualityCheckResult(check);
  if (!item) return "";
  return [
    qualityStatusLabel(item),
    item.summary,
    item.faceQuality ? `脸部：${item.faceQuality}` : "",
    item.poseMatch ? `姿态：${item.poseMatch}` : "",
    item.outfitMatch ? `服装：${item.outfitMatch}` : "",
    item.issues.length ? `问题：${item.issues.join("；")}` : "",
    item.repairPrompt ? `返修：${item.repairPrompt}` : ""
  ].filter(Boolean).join("\n");
}


function localPasteDiagnosticSummary(image) {
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

function LocalPasteDiagnosticsPanel({ image }) {
  const summary = localPasteDiagnosticSummary(image);
  if (!summary) return null;
  return (
    <section className="previewLocalPastePanel">
      <header>
        <strong>{summary.title}</strong>
      </header>
      <div className="previewQualityFacts">
        {summary.items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}

function cropReturnDiagnosticSummary(image) {
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

function CropReturnDiagnosticsPanel({ image }) {
  const summary = cropReturnDiagnosticSummary(image);
  if (!summary) return null;
  return (
    <section className="previewCropReturnPanel">
      <header>
        <strong>{summary.title}</strong>
      </header>
      <div className="previewQualityFacts">
        {summary.items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}



// 中断任务的真实原因文案（整页刷新 / 应用内切页面 两种情况分开写）。
// 2026-09-26：原来统一写"页面已刷新，结果请到保存目录确认" —— 两个问题：
//   ① 应用内切换左侧页面并不是刷新；② 客户端拿到图之前不会自动保存，
//   所以"结果请到保存目录确认"对大多数中断都不成立（用户看到的正是这条误报）。
// 只有确实保存过（task.savedPath 有值）时才提保存目录。

// 旧版本（V9 起）落盘过的"页面已刷新，结果请到保存目录确认"：恢复时按真实原因改写一次。
// 只改这三条展示文案，不动状态、时间、结果和保存记录。










// 结果是否已经有"可恢复地址"（不是本次文档的 blob: 临时地址）。
// 有可恢复地址 → 切页面 / 重挂载后能用这个地址重新显示，内存里的对象 URL 可以立刻释放；
// 只有 blob: 临时地址 → 不能 revoke，否则切回来这张图就再也拿不到了。



// 恢复时判读"只剩 blob: 临时地址、而且这个地址已经不是本文档创建的" → 真实失效。
// 不再让这种记录显示成莫名其妙的空白卡片，也不会拿这个死地址去发请求。




















function fileFromBlob(blob, name, fallbackMimeType = "image/png") {
  const mimeType = blob?.type || fallbackMimeType;
  const extension = imageExtension(mimeType);
  return new File([blob], `${fileBaseName(name || "image")}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });
}







function groupPreprocessValue(items, fallbackMode) {
  if (!items.length) return fallbackMode;
  const modes = [...new Set(items.map((item) => item.mode || fallbackMode))];
  return modes.length === 1 ? modes[0] : "mixed";
}

function normalizeGenerationCount(value) {
  if (value === "auto") return "auto";
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return "auto";
  return Math.max(1, Math.min(MAX_UPLOAD_IMAGES, number));
}

function normalizeBatchConcurrency(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return DEFAULT_BATCH_CONCURRENCY;
  return Math.max(1, Math.min(DEFAULT_BATCH_CONCURRENCY, number));
}

function shouldUpgradeLegacyBatchConcurrency(value = {}) {
  const number = Number.parseInt(value?.concurrency, 10);
  return number === 3 && value?.[BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY] !== true;
}

/**
 * 批量生成错误的用户可读文案。
 *
 * 2026-09-25：统一走 src/shared/generation-errors.js 的分类器，
 * 只在批量独有的"额度明细"上做增强，其余 10 类错误与快捷生成保持同一套说法。
 * 传入 Error 对象时能带出服务端返回的 requestId 便于查日志。
 */




/**
 * 把「持久任务历史里的已完成结果」合并回当前任务列表。
 *
 * 为什么需要它（2026-09-26 结果丢失问题）：
 *   页面草稿（page-draft）里存的是**最后一次落盘的实时状态**，任务历史（task-history）里
 *   存的是**已经成功的结果**。原实现是二选一：
 *       hasLiveResults ? current : [...hydratedHistory, ...runningItems]
 *   只要草稿里还有任意一条成功结果，就把整份历史丢掉 —— 于是"草稿里还停在运行中、
 *   但历史里其实已经成功"的那几条永远恢复不回来，只能被显示成"刷新中断"。
 *   现在改成按任务 id 合并：历史里已经成功且有可显示地址的，就用历史那条覆盖。
 */



/**
 * 把「跨挂载周期账本里的任务快照」合并进当前任务列表。
 * 见 outfitLiveRuns 的说明：这是"切走又切回来"时不再误判成中断的关键。
 * 规则：
 *   - **只更新列表里已经有的任务**，绝不新增。否则用户删掉一条结果后，账本会在
 *     下次切页面时把它"复活"回来（账本是按 id 覆盖的补充信息，不是第二份任务列表）；
 *   - 已经成功且有图的任务不被账本里的"运行中"降级；
 *   - 匹配上的任务以账本快照为准（它是同一轮生成的最新状态）。
 */



function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function createAsyncLimiter(limit) {
  const max = Math.max(1, Number(limit) || 1);
  let active = 0;
  const queue = [];
  const release = () => {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  };
  return async function runLimited(task) {
    if (active >= max) {
      await new Promise((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}

async function canvasToHighQualityJpegBlob(canvas, options = {}) {
  const qualities = Array.isArray(options.qualities) && options.qualities.length
    ? options.qualities
    : LOCAL_EDIT_OUTPUT_JPEG_QUALITIES;
  const targetBytes = Math.max(1, Number(options.targetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES));
  let best = null;
  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    best = { blob, quality };
    if (blob.size <= targetBytes) return best;
  }
  return best;
}

async function canvasToLosslessPngBlob(canvas) {
  const blob = await canvasToBlob(canvas, "image/png");
  return { blob, quality: 1 };
}

async function canvasToCropReturnBlob(canvas, options = {}) {
  return canvasToHighQualityJpegBlob(canvas, {
    targetBytes: Number(options.targetBytes || CROP_RETURN_OUTPUT_TARGET_BYTES),
    qualities: CROP_RETURN_OUTPUT_JPEG_QUALITIES
  });
}





// 选框几何统一走 src/shared/local-edit-geometry.js（快捷生成 src/main.jsx 用同一份），
// 这里保留同名局部引用，调用点不用改。







/**
 * 把模型返回的局部结果**按原图坐标**贴回底图（批量侧）。
 *
 * 2026-09-25 对齐 3.0 新源码 `frontend/ecommerce/src/shared/image/localPaste.ts:128-202`：
 *   1. 画布 = 底图完整尺寸，先把底图画满；
 *   2. 唯一一次写入 = `drawImage(generated, rect.x, rect.y, rect.width, rect.height)`
 *      （返回图尺寸不一致时按选框尺寸拉伸，不做 cover 裁切）；
 *   3. 不做羽化 / 自动对齐 / 颜色匹配 / 中性色调匹配 / 锐化 / 护脸护身；
 *   4. 选框外像素保持底图。
 *
 * 因此删除的 V11 专有后处理：alignLocalEditPatchCanvas、colorMatchLocalEditPatchCanvas、
 * neutralToneMatchLocalEditPatchCanvas、sharpenLocalEditPatchCanvas、
 * protectSkinAndFaceFromLocalOutfitPatch、createFeatherMask，以及 `frameFit:"cover"` 裁切。
 *
 * 涂抹蒙版（用户自己画的选区）保留，按硬边裁剪。
 * `diagnostics` 字段保留（调用方读 `taskBinding` 等），只是不再有后处理相关项。
 */
/**
 * 把模型返回的局部结果**按原图坐标**贴回底图（批量侧）。
 *
 * 2026-09-25 对齐 3.0 新源码 `frontend/ecommerce/src/shared/image/localPaste.ts:128-202`：
 *   1. 画布 = 底图完整尺寸，先把底图画满；
 *   2. 唯一一次写入 = `drawImage(generated, rect.x, rect.y, rect.width, rect.height)`
 *      （返回图尺寸不一致时按选框尺寸拉伸，不做 cover 裁切）；
 *   3. 不做羽化 / 自动对齐 / 颜色匹配 / 中性色调匹配 / 锐化 / 护脸护身；
 *   4. 选框外像素保持底图。
 *
 * 实际合成在 src/shared/local-edit-geometry.js（与快捷生成侧同一份实现）。
 * `diagnostics` 字段保留，调用方读 `taskBinding`；后处理相关项恒为 false/0。
 */
async function composeOutfitLocalEditBlob(originalFile, generatedBlob, cropRect, localEdit = null, options = {}) {
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  let maskImage = null;
  let blendMask = null;
  try {
    const sourceWidth = original.width || original.naturalWidth;
    const sourceHeight = original.height || original.naturalHeight;
    const pasteRect = constrainLocalEditRect(localEdit?.cropRect || cropRect, sourceWidth, sourceHeight);

    const diagnostics = {
      strategy: String(options.strategy || "local-paste"),
      editMode: localEdit?.editMode || LOCAL_EDIT_RECT_MODE,
      sourceWidth,
      sourceHeight,
      generatedWidth: generated.width || generated.naturalWidth || 0,
      generatedHeight: generated.height || generated.naturalHeight || 0,
      frameFit: "stretch",
      pasteRect: localEditRectSnapshot(pasteRect),
      contextRect: null,
      hasContext: false,
      hasMask: Boolean(localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl),
      autoAlign: false,
      maxShift: 0,
      colorMatch: false,
      neutralToneMatch: false,
      sharpenPatch: false,
      protectSkinAndFace: false,
      feather: 0,
      patchRect: { x: pasteRect.x, y: pasteRect.y, width: pasteRect.width, height: pasteRect.height },
      composedAt: Date.now()
    };

    if (localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl) {
      maskImage = await imageBitmapFromDataUrl(localEdit.maskDataUrl);
      blendMask = createLocalEditAlphaMask(maskImage, pasteRect, 0);
    }

    const useLosslessOutput = options.losslessOutput !== false;
    const composed = await composeLocalPasteBlob(original, generated, pasteRect, {
      maskImage: blendMask,
      mimeType: useLosslessOutput ? "image/png" : "image/jpeg",
      targetBytes: Number(options.outputTargetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES),
      qualities: LOCAL_EDIT_OUTPUT_JPEG_QUALITIES
    });
    diagnostics.output = {
      mimeType: composed.blob.type || (useLosslessOutput ? "image/png" : "image/jpeg"),
      quality: composed.quality,
      bytes: composed.blob.size,
      lossless: useLosslessOutput,
      targetBytes: Number(options.outputTargetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES)
    };
    return options.returnDiagnostics ? { blob: composed.blob, diagnostics } : composed.blob;
  } finally {
    original.close?.();
    generated.close?.();
    maskImage?.close?.();
  }
}

async function composeCropReturnBlob(originalFile, generatedBlob, cropReturn, options = {}) {
  if (!originalFile) throw new Error("缺少原图，无法回流到大图画布");
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  try {
    const rect = normalizeCropReturnMeta(cropReturn);
    if (!rect?.cropRect) throw new Error("缺少裁剪回流尺寸，无法回流到大图画布");
    const sourceWidth = Math.max(1, Math.round(original.width || original.naturalWidth || rect.sourceWidth));
    const sourceHeight = Math.max(1, Math.round(original.height || original.naturalHeight || rect.sourceHeight));
    const pasteRect = constrainLocalEditRect(rect.cropRect, sourceWidth, sourceHeight);
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法创建裁剪回流画布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(original, 0, 0, sourceWidth, sourceHeight);
    ctx.drawImage(generated, pasteRect.x, pasteRect.y, pasteRect.width, pasteRect.height);
    const { blob, quality } = await canvasToCropReturnBlob(canvas, options);
    return {
      blob,
      diagnostics: {
        strategy: "crop-return-full-canvas-v1",
        sourceWidth,
        sourceHeight,
        cropRect: cropReturnRectSnapshot(pasteRect),
        outputWidth: sourceWidth,
        outputHeight: sourceHeight,
        generatedWidth: generated.width || generated.naturalWidth || 0,
        generatedHeight: generated.height || generated.naturalHeight || 0,
        output: {
          mimeType: "image/jpeg",
          quality,
          bytes: blob.size,
          targetBytes: Number(options.targetBytes || CROP_RETURN_OUTPUT_TARGET_BYTES)
        },
        composedAt: Date.now()
      }
    };
  } finally {
    original.close?.();
    generated.close?.();
  }
}

async function composeOutpaintOriginalRegionBlob(originalFile, generatedBlob, outpaintMeta, options = {}) {
  if (!originalFile) throw new Error("缺少原图，无法保护扩图原有区域");
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  try {
    const outputWidth = Math.max(1, Math.round(generated.width || generated.naturalWidth || outpaintMeta?.outputWidth || 1));
    const outputHeight = Math.max(1, Math.round(generated.height || generated.naturalHeight || outpaintMeta?.outputHeight || 1));
    const sourceWidth = Math.max(1, Math.round(original.width || original.naturalWidth || outpaintMeta?.sourceWidth || 1));
    const sourceHeight = Math.max(1, Math.round(original.height || original.naturalHeight || outpaintMeta?.sourceHeight || 1));
    const preparedWidth = Math.max(1, Number(outpaintMeta?.outputWidth) || outputWidth);
    const preparedHeight = Math.max(1, Number(outpaintMeta?.outputHeight) || outputHeight);
    const sourceRect = outpaintMeta?.originalRect || {
      x: 0,
      y: 0,
      width: preparedWidth,
      height: Math.min(preparedHeight, Math.round(preparedWidth * (sourceHeight / sourceWidth)))
    };
    const protectedRect = constrainLocalEditRect({
      x: Math.round(Number(sourceRect.x || 0) * outputWidth / preparedWidth),
      y: Math.round(Number(sourceRect.y || 0) * outputHeight / preparedHeight),
      width: Math.round(Number(sourceRect.width || preparedWidth) * outputWidth / preparedWidth),
      height: Math.round(Number(sourceRect.height || preparedHeight) * outputHeight / preparedHeight)
    }, outputWidth, outputHeight);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法创建扩图原图保护画布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(generated, 0, 0, outputWidth, outputHeight);
    const featherHeight = Math.max(0, Math.min(
      Math.max(24, Math.round(protectedRect.height * 0.08)),
      160,
      Math.max(0, protectedRect.height - 4)
    ));
    const lockedHeight = Math.max(0, protectedRect.height - featherHeight);
    if (lockedHeight > 0) {
      const lockedSourceHeight = Math.max(1, Math.round(sourceHeight * lockedHeight / protectedRect.height));
      ctx.drawImage(
        original,
        0,
        0,
        sourceWidth,
        lockedSourceHeight,
        protectedRect.x,
        protectedRect.y,
        protectedRect.width,
        lockedHeight
      );
    }
    if (featherHeight > 0) {
      const featherCanvas = document.createElement("canvas");
      featherCanvas.width = protectedRect.width;
      featherCanvas.height = featherHeight;
      const featherCtx = featherCanvas.getContext("2d");
      if (featherCtx) {
        const sourceFeatherHeight = Math.max(1, Math.round(sourceHeight * featherHeight / protectedRect.height));
        featherCtx.imageSmoothingEnabled = true;
        featherCtx.imageSmoothingQuality = "high";
        featherCtx.drawImage(
          original,
          0,
          Math.max(0, sourceHeight - sourceFeatherHeight),
          sourceWidth,
          sourceFeatherHeight,
          0,
          0,
          protectedRect.width,
          featherHeight
        );
        featherCtx.globalCompositeOperation = "destination-in";
        const gradient = featherCtx.createLinearGradient(0, 0, 0, featherHeight);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(0.58, "rgba(0,0,0,0.78)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        featherCtx.fillStyle = gradient;
        featherCtx.fillRect(0, 0, protectedRect.width, featherHeight);
        ctx.drawImage(featherCanvas, protectedRect.x, protectedRect.y + lockedHeight);
      }
    } else {
      ctx.drawImage(original, 0, 0, sourceWidth, sourceHeight, protectedRect.x, protectedRect.y, protectedRect.width, protectedRect.height);
    }
    const { blob, quality } = await canvasToLosslessPngBlob(canvas);
    const diagnostics = {
      strategy: "outpaint-original-region-lock-v2-feather",
      sourceWidth,
      sourceHeight,
      preparedWidth,
      preparedHeight,
      generatedWidth: outputWidth,
      generatedHeight: outputHeight,
      originalRect: cropReturnRectSnapshot(sourceRect),
      protectedRect: cropReturnRectSnapshot(protectedRect),
      featherHeight,
      blankRect: outpaintMeta?.blankRect ? cropReturnRectSnapshot(outpaintMeta.blankRect) : null,
      output: {
        mimeType: blob.type || "image/png",
        quality,
        bytes: blob.size,
        lossless: true
      },
      composedAt: Date.now()
    };
    return options.returnDiagnostics ? { blob, diagnostics } : blob;
  } finally {
    original.close?.();
    generated.close?.();
  }
}

async function blobFromOutfitImage(image) {
  const src = imageSource(image);
  if (!src) throw new Error("图片地址无效");
  return fetchImageBlob(src, "图片下载失败");
}








async function processImageFileWithMeta(file, ratio, mode = "pad", crop = null) {
  const outputFile = await processImageFile(file, ratio, mode, crop);
  if (mode !== "crop" || !crop) return { file: outputFile, cropReturn: null };
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const sourceWidth = image.naturalWidth || image.width || 0;
    const sourceHeight = image.naturalHeight || image.height || 0;
    const cropRect = resolveCropSourceRect(image, ratio, crop);
    return {
      file: outputFile,
      cropReturn: {
        enabled: true,
        mode: "crop-return",
        cropRect,
        sourceWidth,
        sourceHeight,
        aspectRatio: ratio,
        cropWidth: cropRect.width,
        cropHeight: cropRect.height,
        outputWidth: sourceWidth,
        outputHeight: sourceHeight,
        createdAt: Date.now()
      }
    };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}



async function ensureOutfitUploadCanvasRatio(file, ratio) {
  if (!(file instanceof File)) return file;
  const targetRatio = ratioParts(ratio).value;
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return await compressOriginalImageFile(file);
    const sourceRatio = width / height;
    if (Math.abs(sourceRatio - targetRatio) <= 0.015) {
      return await compressOriginalImageFile(file);
    }
    return await padImageFile(file, image, ratio, false);
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}

async function prepareOutpaintUploadCanvas(file, ratio) {
  const emptyMeta = async (nextFile = file, sourceWidth = 0, sourceHeight = 0) => ({
    file: nextFile,
    maskFile: null,
    originalRect: null,
    blankRect: null,
    maskRect: null,
    outputWidth: 0,
    outputHeight: 0,
    sourceWidth,
    sourceHeight
  });
  if (!(file instanceof File)) {
    return emptyMeta(file, 0, 0);
  }
  const targetRatio = ratioParts(ratio || "9:16").value;
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      return emptyMeta(await compressOriginalImageFile(file), 0, 0);
    }

    const ratioHeight = Math.round(width / targetRatio);
    const minExtensionHeight = Math.round(height * 0.42);
    const targetHeight = Math.max(ratioHeight, height + minExtensionHeight);
    const baseScale = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(width, targetHeight));
    const qualities = [0.92, 0.88, 0.84, 0.78, 0.72, 0.66, 0.6, 0.54, 0.48];
    let scaleFactor = 1;
    let lastAttempt = null;

    function renderPair(scaleDown) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scaleDown));
      canvas.height = Math.max(1, Math.round(targetHeight * scaleDown));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("无法创建扩图上传画布");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawWidth = Math.max(1, Math.round(width * scaleDown));
      const drawHeight = Math.max(1, Math.round(height * scaleDown));
      const drawX = Math.round((canvas.width - drawWidth) / 2);
      ctx.drawImage(image, drawX, 0, drawWidth, drawHeight);

      const blankStartY = drawHeight;
      if (blankStartY < canvas.height) {
        const stripHeight = Math.max(2, Math.round(drawHeight * 0.035));
        const bleedHeight = Math.min(canvas.height - blankStartY, Math.max(8, stripHeight * 5));
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.filter = "blur(10px)";
        ctx.drawImage(
          image,
          0,
          Math.max(0, height - Math.round(height * 0.05)),
          width,
          Math.max(1, Math.round(height * 0.05)),
          drawX,
          blankStartY - Math.round(stripHeight / 2),
          drawWidth,
          bleedHeight
        );
        ctx.restore();
      }

      const overlapHeight = Math.max(0, Math.min(
        Math.max(24, Math.round(drawHeight * 0.08)),
        192,
        Math.max(0, drawHeight - 4),
        Math.max(0, canvas.height - 1)
      ));
      const editableStartY = Math.max(0, drawHeight - overlapHeight);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) throw new Error("无法创建扩图蒙版");
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCtx.fillStyle = "rgba(255,255,255,1)";
      maskCtx.fillRect(0, 0, maskCanvas.width, editableStartY);

      return {
        canvas,
        maskCanvas,
        scaleDown,
        drawX,
        drawWidth,
        drawHeight,
        blankStartY,
        overlapHeight,
        editableStartY
      };
    }

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const rendered = renderPair(baseScale * scaleFactor);
      const maskBlob = await canvasToBlob(rendered.maskCanvas, "image/png");
      for (const quality of qualities) {
        const imageBlob = await canvasToBlob(rendered.canvas, "image/jpeg", quality);
        lastAttempt = { rendered, imageBlob, maskBlob, quality };
        if (imageBlob.size <= CHANNEL_UPLOAD_TARGET_BYTES && maskBlob.size <= CHANNEL_UPLOAD_LIMIT_BYTES) {
          return {
            file: fileFromBlob(imageBlob, `${fileBaseName(file.name)}_outpaint_upload`, "image/jpeg"),
            maskFile: fileFromBlob(maskBlob, `${fileBaseName(file.name)}_outpaint_mask`, "image/png"),
            originalRect: {
              x: rendered.drawX,
              y: 0,
              width: rendered.drawWidth,
              height: rendered.drawHeight
            },
            blankRect: {
              x: rendered.drawX,
              y: rendered.drawHeight,
              width: rendered.drawWidth,
              height: Math.max(0, rendered.canvas.height - rendered.drawHeight)
            },
            maskRect: {
              x: 0,
              y: rendered.editableStartY,
              width: rendered.canvas.width,
              height: Math.max(0, rendered.canvas.height - rendered.editableStartY)
            },
            outputWidth: rendered.canvas.width,
            outputHeight: rendered.canvas.height,
            sourceWidth: width,
            sourceHeight: height,
            scale: rendered.scaleDown,
            maskOverlapHeight: rendered.overlapHeight,
            imageQuality: quality,
            createdAt: Date.now()
          };
        }
      }
      scaleFactor *= 0.84;
    }

    if (lastAttempt?.imageBlob?.size <= CHANNEL_UPLOAD_LIMIT_BYTES && lastAttempt?.maskBlob?.size <= CHANNEL_UPLOAD_LIMIT_BYTES) {
      const { rendered, imageBlob, maskBlob, quality } = lastAttempt;
      return {
        file: fileFromBlob(imageBlob, `${fileBaseName(file.name)}_outpaint_upload`, "image/jpeg"),
        maskFile: fileFromBlob(maskBlob, `${fileBaseName(file.name)}_outpaint_mask`, "image/png"),
        originalRect: {
          x: rendered.drawX,
          y: 0,
          width: rendered.drawWidth,
          height: rendered.drawHeight
        },
        blankRect: {
          x: rendered.drawX,
          y: rendered.drawHeight,
          width: rendered.drawWidth,
          height: Math.max(0, rendered.canvas.height - rendered.drawHeight)
        },
        maskRect: {
          x: 0,
          y: rendered.editableStartY,
          width: rendered.canvas.width,
          height: Math.max(0, rendered.canvas.height - rendered.editableStartY)
        },
        outputWidth: rendered.canvas.width,
        outputHeight: rendered.canvas.height,
        sourceWidth: width,
        sourceHeight: height,
        scale: rendered.scaleDown,
        maskOverlapHeight: rendered.overlapHeight,
        imageQuality: quality,
        createdAt: Date.now()
      };
    }

    throw new Error("扩图上传图和蒙版压缩后仍超过 4MB，请换一张更轻的素材再试");
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}




async function createImageItem(file, ratio, mode) {
  const originalUrl = URL.createObjectURL(file);
  const processedFile = await processImageFile(file, ratio, mode);
  const processedUrl = URL.createObjectURL(processedFile);
  return {
    id: makeId("img"),
    name: file.name,
    originalFile: file,
    file: processedFile,
    originalUrl,
    previewUrl: processedUrl,
    mode,
    cropReturn: null,
    localEdit: null,
    selected: true,
    createdAt: Date.now()
  };
}

function serializeDraftImageItem(item) {
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

function hydrateDraftImageItem(item) {
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

function serializeOriginalDraftItem(item, imageById) {
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

function hydrateOriginalDraftItem(item) {
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

function serializeDraftPage(page) {
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

function hydrateDraftPage(page, options = {}) {
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

async function persistOutfitDraftState(pages, activeId) {
  const serializablePages = ensureWorkflowPages(pages, readSettings()).map(serializeDraftPage);
  await outfitLocalSet(OUTFIT_DRAFT_DB_KEY, {
    activeId,
    pages: serializablePages,
    updatedAt: Date.now()
  });
}

async function loadOutfitDraftState(options = {}) {
  const draft = await outfitLocalGet(OUTFIT_DRAFT_DB_KEY, null);
  if (!draft || !Array.isArray(draft.pages) || draft.pages.length === 0) return null;
  const pages = draft.pages.map((page) => hydrateDraftPage(page, options)).filter(Boolean);
  if (!pages.length) return null;
  return {
    activeId: pages.some((page) => page.id === draft.activeId) ? draft.activeId : pages[0].id,
    pages
  };
}

/**
 * 「切页面时还在生成、随后才完成/失败」的那一条结果，就地登记回页面草稿。
 *
 * 背景（2026-09-26 结果丢失问题）：
 *   左侧导航切走会把 OutfitWorkflow 整个卸载（main.jsx 是条件渲染），React state 随之消失。
 *   但生成请求和它后面的 `autoSaveTask()` 是普通闭包，会继续跑完 —— 也就是说图片**确实生成、
 *   也确实自动保存到了指定文件夹**，只是页面这边再也写不回状态：草稿里那一条永远停在
 *   running/queued，切回来就被恢复成"中断/待确认"，用户看到的就是"结果不能查看"。
 *
 * 这里用现有的 page-draft 存储，按任务 id 把这一条就地 upsert 成终态（成功或失败）：
 *   - 不新建第二套缓存；
 *   - 不重复写（同一个 id 只覆盖，不追加）；
 *   - 不碰其它页面的任务；
 *   - 只在组件已经卸载时调用（挂载状态下由原来的持久化 effect 负责）。
 */

function moveItemByDrop(items, fromId, toId, placement) {
  if (!fromId || !toId || fromId === toId) return items;
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const targetIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || targetIndex < 0) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  const normalizedTargetIndex = next.findIndex((item) => item.id === toId);
  next.splice(placement === "after" ? normalizedTargetIndex + 1 : normalizedTargetIndex, 0, moved);
  return next;
}




function defaultLocalEditCrop(width, height, ratio) {
  // 2026-09-25：默认选框就是上次/当前选定的比例（居中、约占 62%），
  // 因为局部回贴选框必须"始终"等于所选比例。
  return fitRectToRatioLocked(null, ratio, width, height);
}










function LegacyModulePanel({ title, subtitle, icon, children }) {
  return (
    <section className="legacyPanel">
      <header className="moduleHeader">
        <div>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
        <div className="legacyPanelIcon">{icon}</div>
      </header>
      {children}
    </section>
  );
}

// RF-078-b：提示词预设面板 JSX 在「停靠视图」与「模态弹窗」两处逐字重复，这里抽成共用组件。
// 🔴 必须定义在模块顶层（本文件全局作用域），严禁挪进 OutfitWorkflow 组件体内 ——
//    否则每次 render 都会重建组件类型，React 卸载重挂整棵子树，导致搜索框失焦、拖拽态重置。

export default function OutfitWorkflow({
  view = "outfit",
  hostTheme = "dark",
  hostApiKey = "",
  onOpenHostSettings = null
}) {
  const [config, setConfig] = useState({ models: DEFAULT_MODELS });
  const [activeView, setActiveView] = useState("outfit");
  const [outfitPages, setOutfitPages] = useState(readOutfitPages);
  const initialOutfitPage = pickInitialOutfitPage(outfitPages);
  const [activeOutfitPageId, setActiveOutfitPageId] = useState(() => initialOutfitPage.id || "");
  const [settings, setSettings] = useState(() => mergeOutfitPageSettings(initialOutfitPage.settings, readSettings()));
  const [modelImages, setModelImages] = useState(() => initialOutfitPage.modelImages || []);
  const [clothingImages, setClothingImages] = useState(() => initialOutfitPage.clothingImages || []);
  const [referenceImages, setReferenceImages] = useState(() => initialOutfitPage.referenceImages || []);
  const [fixedClothingId, setFixedClothingId] = useState(() => initialOutfitPage.fixedClothingId || "");
  const [tasks, setTasks] = useState(() => initialOutfitPage.tasks?.length ? initialOutfitPage.tasks : readTaskHistory());
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set());
  const [galleryZoom, setGalleryZoom] = useState(1);
  const [resultFilter, setResultFilter] = useState("all");
  const [saveDirectory, setSaveDirectory] = useState("");
  const [directoryDraft, setDirectoryDraft] = useState("");
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState(false);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [downloadFeedbackIds, setDownloadFeedbackIds] = useState(() => new Set());
  // P1 缺图自愈：记录"结果图确实加载失败"的任务 id → { src, reason }。
  // 只存在内存里；服务端另有"归档文件丢失"的持久标记（走 /api/history）。
  const [brokenTaskImages, setBrokenTaskImages] = useState(() => ({}));
  const [resultReplaceTargetId, setResultReplaceTargetId] = useState("");
  const [activeUploadGroup, setActiveUploadGroup] = useState(() => initialOutfitPage.activeUploadGroup || "model");
  const [originalLibrary, setOriginalLibrary] = useState(() => initialOutfitPage.originalLibrary || []);
  const [imageLightbox, setImageLightbox] = useState(null);
  const [running, setRunning] = useState(false);
  // 图2服装事实：分析中状态 + "展开详细穿法/事实"的折叠开关（默认只显示紧凑摘要）。
  const [imageFactsAnalyzing, setImageFactsAnalyzing] = useState(false);
  const [wearingDetailOpen, setWearingDetailOpen] = useState(false);
  const [factsDetailOpen, setFactsDetailOpen] = useState(false);
  const [inlineMessage, setInlineMessage] = useState("");
  // 精修页「结果图中线剪裁成两张」开关（默认开，和 3.0 的 localStorage 口径一致）+ 状态提示。
  const [splitHalves, setSplitHalves] = useState(() => readSplitHalvesEnabled());
  const [splitNote, setSplitNote] = useState("");
  const [, setEvents] = useState([]);
  const [clockNow, setClockNow] = useState(Date.now());
  const [cropTarget, setCropTarget] = useState(null);
  const [localEditTarget, setLocalEditTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [referenceContextMenu, setReferenceContextMenu] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey || "");
  const [apiSaveStatus, setApiSaveStatus] = useState("");
  const [showKey, setShowKey] = useState(false);
  // 2026-09-25：设置里原有的「开发诊断」区域（含传参自检按钮）已整体替换为「连接测试」。
  const [isConnectionTesting, setIsConnectionTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [isPromptAssistantOpen, setIsPromptAssistantOpen] = useState(false);
  const [promptPresets, setPromptPresets] = useState(loadOutfitPromptPresets);
  const [promptCategories, setPromptCategories] = useState(loadOutfitPromptCategories);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [promptCategory, setPromptCategory] = useState("全部");
  const [promptSearch, setPromptSearch] = useState("");
  const [draggedPromptId, setDraggedPromptId] = useState(null);
  const [promptDropCategory, setPromptDropCategory] = useState("");
  const [draggedPageId, setDraggedPageId] = useState("");
  const [pageDropTarget, setPageDropTarget] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [uploadLabels, setUploadLabels] = useState(() => normalizeUploadLabels(initialOutfitPage.uploadLabels || {}, initialOutfitPage.name));
  const previewDragRef = useRef(null);
  const promptClickTimerRef = useRef(null);
  const workspaceRef = useRef(null);
  const taskGridRef = useRef(null);
  const tasksRef = useRef(tasks);
  const resultDragTaskIdRef = useRef("");
  const resultDragPayloadRef = useRef(null);
  const runningGenerationCountRef = useRef(0);
  const localEditPrepareLimiterRef = useRef(createAsyncLimiter(LOCAL_EDIT_BATCH_PREPARE_CONCURRENCY));
  const resultImageCacheInFlightRef = useRef(new Set());
  const draftHydratingRef = useRef(false);
  const historyHydratingRef = useRef(false);
  // 防抖中的草稿快照：卸载时立即补写，避免"刚生成完就切页面"把最新状态丢掉。
  const pendingDraftSnapshotRef = useRef(null);
  // 组件是否还挂载：切页面会卸载 OutfitWorkflow，卸载后 setState 不再生效，
  // 需要在生成完成时把结果直接补登记进页面草稿（见 persistFinishedTaskWhileDetached）。
  const outfitMountedRef = useRef(true);
  // 当前页面正在显示的任务 id：用来判断"这一条完成时用户是不是正看着它"。
  // 正看着 → 交给正常的持久化 effect；没看着（切了页面 / 切了批量分区）→ 直接补登记草稿。
  const visibleTaskIdsRef = useRef(new Set());
  const [draftReady, setDraftReady] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);

  const activeOutfitPage = outfitPages.find((page) => page.id === activeOutfitPageId) || outfitPages[0] || {
    id: activeOutfitPageId,
    name: DEFAULT_OUTFIT_PAGE_NAME,
    deleteLocked: false,
    settings: stripOutfitPageGlobalSettings(settings),
    uploadLabels
  };
  const workflowMode = inferOutfitWorkflowMode(activeOutfitPage.name, uploadLabels);
  const isDesignDraftWorkflow = workflowMode === "design-draft";
  const isBackgroundChangeWorkflow = workflowMode === "background-change";
  const isRandomBackgroundWorkflow = workflowMode === "random-background";
  const isOutpaintWorkflow = workflowMode === "outpaint";
  const isRecolorWorkflow = workflowMode === "recolor";
  const isWhiteRefineWorkflow = workflowMode === "white-refine";
  const isFaceSwapWorkflow = workflowMode === "face-swap";
  const isLocalDetailWorkflow = workflowMode === "local-detail";
  const isCustomWorkflow = workflowMode === "custom";
  const isPoseRemixWorkflow = workflowMode === "pose-remix";
  const isOutfitWorkflow = workflowMode === "outfit";
  const canAppendWhileRunning = true;
  const activePageDeleteLocked = Boolean(activeOutfitPage.deleteLocked);
  const models = config.models?.length ? config.models : DEFAULT_MODELS;
  const activeModel = models.find((model) => model.value === settings.model) || models[0];
  // 能力限制唯一来源：routing catalog 的 capabilities（见 src/shared/routing.js）。
  const outfitCapabilities = modelCapabilities(settings.model, config.routing || config);
  const ratios = outfitCapabilities.ratios;
  const outfitSizes = outfitCapabilities.sizes;
  // 每个模型的单次请求图片数量上限（tt-image-2.5 = 8，其余 = 14）。
  const outfitMaxImages = Math.max(1, Math.min(MAX_UPLOAD_IMAGES, outfitCapabilities.maxInputImages));
  const outfitChannels = channelsForModel(settings.model, config.routing || config);
  const activeModels = modelImages.filter((item) => item.selected);
  const activeClothes = clothingImages.filter((item) => item.selected);
  const selectedFixedClothing = clothingImages.find((item) => item.id === fixedClothingId) || activeClothes[0] || clothingImages[0];
  // 批量改色的改色范围（只有 recolor 还在用这套旧机制）。
  const selectedGarmentParts = normalizeGarmentParts(settings.garmentParts);
  const selectedGarmentComposition = normalizeGarmentComposition(settings.garmentComposition, selectedGarmentParts);
  // 批量换装的结构化意图（唯一来源）。
  const outfitIntent = normalizeOutfitIntent(settings.outfitIntent);
  const outfitLayer = resolveUpperLayer(outfitIntent);
  const outfitIntentSummary = summarizeOutfitIntent(outfitIntent);
  const outfitWearingFieldList = visibleWearingFields(outfitIntent);
  const outfitRecognizedFacts = recognizedFactKeys(outfitIntent.facts);
  // 换装目标 + 图2事实 + 穿法 + 人物基准（不含补充提示词）：这是"通用换装提示词"框的自动主体。
  const outfitPreview = compileOutfitPrompt({ intent: outfitIntent });
  const outfitAutoPrompt = outfitPreview.prompt;
  // 通用换装提示词框里最终该有的完整内容 = 自动主体 + 下面的补充提示词（接着写在下边）。
  // 补充提示词只作为这个框的正文出现一次，不再作为独立字段重复发给 API。
  const outfitPromptWithNote = [outfitAutoPrompt, String(settings.productNote || "").trim()]
    .filter(Boolean)
    .join("\n");

  // 服装精修的结构化意图（唯一来源）：对称 / 衣摆或裙摆 / 版型 / 用户补充。
  const retouchIntent = normalizeRetouchIntent(settings.retouchIntent);
  // 精修最终提示词：与提交时服务端用的是**同一个编译器**。
  // 2026-09-26（按用户要求）：精修跟换装一个逻辑 —— 这一份就是「通用白底精修提示词」框的内容，
  // 由「精修设置 + 用户补充」自动生成，也可以直接手改；点设置按钮会按设置重新生成。
  const retouchPreview = compileRetouchPrompt({
    intent: retouchIntent,
    productNote: settings.productNote
  });
  const retouchAutoPrompt = retouchPreview.prompt;
  const completedCount = tasks.filter((task) => task.status === "success").length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const runningCount = tasks.filter((task) => task.status === "running").length;
  const detachedCount = tasks.filter((task) => task.status === "detached").length;
  // 只要列表里还有排队/生成中的任务，就让耗时秒数继续走：
  // 切页面回来时组件自己的 running 状态已经重置，但账本恢复出来的"生成中"卡片仍要能读秒。
  const hasPendingTasks = tasks.some((task) => task.status === "running" || task.status === "queued");
  const imageCount = completedCount;
  const visibleTasks = resultFilter === "video" ? [] : resultFilter === "image" ? tasks.filter((task) => task.result) : tasks;
  const resultPreviewTasks = visibleTasks.filter((task) => task.result);
  const selectedCount = tasks.reduce((count, task) => count + (selectedTaskIds.has(task.id) ? 1 : 0), 0);
  const selectedCompletedCount = tasks.reduce((count, task) => count + (selectedTaskIds.has(task.id) && task.result ? 1 : 0), 0);
  const galleryZoomPercent = Math.round(galleryZoom * 100);
  const galleryCardMin = Math.round(176 * galleryZoom);
  const generationCount = normalizeGenerationCount(settings.generationCount);
  // 2026-09-26（按用户要求）：精修是「多图生图」——图1、图2…图N 一起上传，
  // 点一次生成**只出一张**成品图，所以这一页的计划数量恒为 1，不再跟生成数量走。
  const plannedGenerationCount = isWhiteRefineWorkflow
    ? 1
    : generationCount === "auto"
      ? Math.min(
          isDesignDraftWorkflow
            ? Math.max(1, activeClothes.length)
            : isPoseRemixWorkflow
              ? Math.max(1, activeModels.length)
              : activeModels.length,
          outfitMaxImages
        )
      : generationCount;
  const topbarStatus = runningCount > 0 ? "running" : failedCount > 0 ? "failed" : detachedCount > 0 ? "detached" : completedCount > 0 ? "success" : "idle";
  const topbarStatusText = runningCount > 0
    ? `生成中 ${runningCount}/${tasks.length}`
    : tasks.length > 0
      ? detachedCount > 0
        ? `待确认 ${detachedCount} 个`
        : `完成 ${completedCount}/${tasks.length}`
      : "等待生成";
  const workflowEventTitle = isDesignDraftWorkflow
    ? "设计稿"
    : isPoseRemixWorkflow
      ? "批量姿态"
      : isRandomBackgroundWorkflow
        ? "随机背景"
        : isBackgroundChangeWorkflow
          ? "固定背景"
        : isOutpaintWorkflow
          ? "批量扩图"
          : isRecolorWorkflow
            ? "批量改色"
            : isWhiteRefineWorkflow
              ? "精修"
              : isFaceSwapWorkflow
                ? "批量换脸"
                : isLocalDetailWorkflow
                  ? "局部回贴"
                  : "换装";
  const promptFieldTitle = isDesignDraftWorkflow
    ? "通用设计稿提示词"
    : isPoseRemixWorkflow
      ? "通用批量姿态提示词"
      : isRandomBackgroundWorkflow
        ? "通用随机背景提示词"
        : isBackgroundChangeWorkflow
          ? "通用固定背景提示词"
        : isOutpaintWorkflow
          ? "通用批量扩图提示词"
          : isRecolorWorkflow
            ? "通用改色提示词"
            : isWhiteRefineWorkflow
              ? "通用白底精修提示词"
              : isFaceSwapWorkflow
                ? "通用换脸提示词"
                : isLocalDetailWorkflow
                  ? "通用局部回贴提示词"
                  : isCustomWorkflow
                    ? "本次临时提示词"
                    : "通用换装提示词";
  const promptFieldPlaceholder = isDesignDraftWorkflow
    ? "长期复用的设计稿规则，例如笔触压感、手稿风格、服装结构和辅助短线。"
    : isPoseRemixWorkflow
      ? "长期复用的批量姿态规则，例如图1只取姿态，图2锁定人物、服装穿法和场景。"
      : isRandomBackgroundWorkflow
        ? "长期复用的随机背景规则，例如锁定人物和服装，只按场景补充生成同一场景体系的不同机位。"
        : isBackgroundChangeWorkflow
          ? "长期复用的固定背景规则，例如锁定人物结构、统一目标背景光影和整体色温。"
        : isOutpaintWorkflow
          ? "长期复用的批量扩图规则，例如锁定图1已有内容，只向下补出下半身、鞋子和原场景延展。"
          : isRecolorWorkflow
            ? "长期复用的改色规则，例如只改指定服装颜色，人物、场景、款式和材质细节不变。"
            : isWhiteRefineWorkflow
              ? "长期复用的白底精修规则，例如去衣架、换白底、整理压痕和褶皱，但不改服装细节颜色。"
              : isFaceSwapWorkflow
                ? "长期复用的换脸规则，例如图1锁定身体衣服姿势背景，图2只提供脸部身份和可融合发型方向。"
                : isLocalDetailWorkflow
                  ? "长期复用的局部服装细节规则，例如只改点名细节、图2只取结构、颜色材质跟图1。"
                  : isCustomWorkflow
                    ? "这个页面不会自动套用后台 SKILL；按你当前临时需求直接写。"
                    : "长期复用的换装规则，例如保留人物、锁定服装版型、真实贴合、批量一致。";
  // 2026-09-26：精修页把「本次需求 / 商品补充信息」改名叫「用户补充」——
  // 它就是精修的补充要求，会被编译器并入最终提示词的【用户补充】段。
  const productNoteFieldTitle = isRandomBackgroundWorkflow
    ? "场景补充"
    : isWhiteRefineWorkflow
      ? "用户补充"
      : "本次需求 / 商品补充信息";
  const productNotePlaceholder = isRandomBackgroundWorkflow
    ? "写你想要的大概场景需求，例如：早秋休闲度假实景街景，少量斑马线，适度景深虚化，平视机位，画面干净。"
    : "只写这次要额外控制的内容，例如袖长、裙长、SKU颜色、背景、鞋包是否保留。";
  const effectiveTheme = normalizeTheme(hostTheme || settings.theme);
  const effectiveApiKey = normalizeApiKeyInput(hostApiKey || settings.apiKey);
  const embeddedMode = typeof onOpenHostSettings === "function";
  const themePalette = useMemo(() => themeToVars(effectiveTheme), [effectiveTheme]);
  const themeStyle = useMemo(() => ({
    "--app-bg": themePalette.appBg,
    "--shell-bg": themePalette.shellBg,
    "--sidebar-bg": themePalette.sidebarBg,
    "--topbar-bg": themePalette.topbarBg,
    "--panel-bg": themePalette.panelBg,
    "--panel-strong-bg": themePalette.panelStrongBg,
    "--input-bg": themePalette.inputBg,
    "--button-bg": themePalette.buttonBg,
    "--border": themePalette.border,
    "--text": themePalette.text,
    "--text-soft": themePalette.textSoft,
    "--accent": themePalette.accent,
    "--accent-text": themePalette.accentText,
    "--accent-border": themePalette.accentBorder,
    "--danger": themePalette.danger,
    "--option-bg": themePalette.optionBg
  }), [themePalette]);
  const filteredPromptPresets = useMemo(() => {
    const keyword = promptSearch.trim().toLowerCase();
    return promptPresets.filter((preset) => {
      const matchesCategory = promptCategory === "全部" || preset.category === promptCategory;
      const matchesKeyword = !keyword
        || preset.title.toLowerCase().includes(keyword)
        || preset.content.toLowerCase().includes(keyword);
      return matchesCategory && matchesKeyword;
    });
  }, [promptPresets, promptCategory, promptSearch]);
  const modelBulkMode = groupPreprocessValue(modelImages, settings.preprocessMode);
  const clothingBulkMode = groupPreprocessValue(clothingImages, settings.preprocessMode);
  const referenceBulkMode = groupPreprocessValue(referenceImages, settings.preprocessMode);
  const allUploadImages = [...modelImages, ...clothingImages, ...referenceImages];
  const globalBulkMode = groupPreprocessValue(allUploadImages, settings.preprocessMode);

  useEffect(() => {
    if (view === "outfit" || view === "resize") {
      setActiveView(view);
    }
  }, [view]);

  useEffect(() => {
    tasksRef.current = tasks;
    visibleTaskIdsRef.current = new Set(tasks.map((task) => task.id));
  }, [tasks]);

  // 订阅跨挂载周期的生成账本：切走又切回来时，这一轮跑完的那一刻能把结果推给当前页面。
  useEffect(() => {
    const listener = (liveTask) => {
      setTasks((current) => (current.some((task) => task.id === liveTask.id)
        ? mergeOutfitLiveRuns(current, [liveTask])
        : current));
    };
    return subscribeOutfitLiveRuns(listener);
  }, []);

  // 卸载清理（2026-09-26 修正）：
  //   1) 只释放"已经有可恢复地址"的结果的对象 URL —— 这类结果切页面回来后用 /api/result
  //      或上传引用就能重新显示，blob: 可以立刻释放，不会越切越占内存；
  //   2) 只靠 blob: 临时地址的结果**不 revoke**，否则"切页面再切回来"这张图就没了。
  // 结果的真正释放走 clearAll / 删除 / 原位重刷那几条路径。
  useEffect(() => () => {
    outfitMountedRef.current = false;
    revokeRestorableTaskResultImageCaches(tasksRef.current);
  }, []);

  useEffect(() => {
    setSettings((current) => {
      const nextTheme = normalizeTheme(hostTheme || current.theme);
      const nextApiKey = hostApiKey ? normalizeApiKeyInput(hostApiKey) : current.apiKey;
      if (current.theme === nextTheme && current.apiKey === nextApiKey) return current;
      return { ...current, theme: nextTheme, apiKey: nextApiKey };
    });
  }, [hostTheme, hostApiKey]);

  useEffect(() => {
    getAppConfig()
      .then((payload) => {
        if (payload?.models?.length) {
          setConfig(payload);
          // 目录加载完成后再按 capabilities 归一化一次；目录没回来之前不动用户存档。
          const routingCatalog = payload.routing || payload;
          setSettings((current) => convergeSettingsForModel(current, routingCatalog));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    historyHydratingRef.current = true;
    readTaskHistoryAsync()
      .then((history) => {
        if (cancelled || !history.length) return;
        const hydratedHistory = hydrateTasksWithUploadReferences(history, {
          modelImages,
          clothingImages,
          referenceImages
        });
        // 2026-09-26：不再"草稿里有结果就丢掉整份历史"。
        // 按任务 id 合并：历史里已经成功的结果优先，页面切换/重挂载后不会再退回成"刷新中断"。
        setTasks((current) => mergeOutfitTasksWithHistory(current, hydratedHistory));
      })
      .finally(() => {
        if (!cancelled) {
          historyHydratingRef.current = false;
          setHistoryReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    draftHydratingRef.current = true;
    // 2026-09-26：只有"真正的整页刷新/首次打开"才允许把还停在 running/queued 的任务
    // 标成刷新中断。左侧导航切走再切回来只是组件重挂载，同一个文档里的 blob: 地址还有效，
    // 不能按刷新处理（那正是用户看到的"页面已刷新，结果请到保存目录确认"误报来源）。
    const documentBoot = !outfitWorkflowDocumentBooted;
    outfitWorkflowDocumentBooted = true;
    loadOutfitDraftState({ detachReason: documentBoot ? "reload" : "page-switch" })
      .then((draft) => {
        if (cancelled || !draft?.pages?.length) return;
        const pages = ensureWorkflowPages(draft.pages, readSettings());
        const activePage = pages.find((page) => page.id === draft.activeId) || pages[0];
        setOutfitPages(pages);
        setActiveOutfitPageId(activePage.id);
        loadOutfitPage(activePage);
        // 2026-09-26：接上跨挂载周期的生成账本。
        // 切走又很快切回来时，草稿里这一条还是 running/queued；账本里如果它还在跑就继续
        // 显示"生成中"，已经跑完就直接收敛成结果 —— 不再误判成"切换页面时这一轮还没返回结果"。
        setTasks((current) => mergeOutfitLiveRuns(current, outfitLiveRunsForPage(activePage.name)));
      })
      .finally(() => {
        if (!cancelled) {
          draftHydratingRef.current = false;
          setDraftReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!historyReady || !draftReady || historyHydratingRef.current || draftHydratingRef.current) return;
    const persisted = tasks
      .filter((task) => task.status === "success" && imageSource(task.result))
      .map(sanitizeTaskHistoryItem)
      .filter(Boolean)
      .slice(-500);
    void persistTaskHistory(persisted);
  }, [tasks, historyReady, draftReady]);

  useEffect(() => {
    if (!historyReady) return undefined;
    const inFlight = resultImageCacheInFlightRef.current;
    const targets = tasks
      .map((task) => ({ task, key: resultImageCacheKey(task.result) || task.id }))
      .filter(({ task, key }) => (
        task.status === "success"
        && task.result
        && cacheableResultImageSource(task.result)
        && !task.result.cachedUrl
        && key
        && !inFlight.has(key)
      ))
      .slice(0, 2);
    if (targets.length === 0) return undefined;

    let cancelled = false;
    targets.forEach(({ key }) => inFlight.add(key));
    Promise.all(targets.map(async ({ task, key }) => {
      try {
        return {
          id: task.id,
          result: await cacheResultImageBlob(task.result)
        };
      } finally {
        inFlight.delete(key);
      }
    })).then((cachedItems) => {
      if (cancelled) return;
      const resultById = new Map(cachedItems
        .filter((item) => item.result?.cachedUrl)
        .map((item) => [item.id, item.result]));
      if (resultById.size === 0) return;
      setTasks((current) => current.map((task) => {
        const result = resultById.get(task.id);
        if (!result || task.result?.cachedUrl) return task;
        return { ...task, result };
      }));
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [tasks, historyReady]);

  useEffect(() => {
    void refreshSaveDirectory();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      writeJsonStorage(STORAGE_KEY, settings);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    if (!outfitPages.length) return;
    if (outfitPages.some((page) => page.id === activeOutfitPageId)) return;
    setActiveOutfitPageId(outfitPages[0].id);
  }, [outfitPages, activeOutfitPageId]);

  useEffect(() => {
    const nextPages = outfitPages.map((page) => (
      page.id === activeOutfitPageId
        ? {
            ...page,
            settings,
            uploadLabels
          }
        : page
    ));
    writeJsonStorage(OUTFIT_PAGES_KEY, nextPages.map(serializeOutfitPage));
  }, [
    outfitPages,
    activeOutfitPageId,
    settings,
    uploadLabels
  ]);

  useEffect(() => {
    if (!draftReady || draftHydratingRef.current) return undefined;
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    const pages = ensureWorkflowPages(outfitPages.map((page) => (
      page.id === activeOutfitPageId ? currentSnapshot : page
    )), settings);
    // 记下最近一次待落盘的快照：卸载时用它补一次立即落盘（见下面的 unmount flush）。
    pendingDraftSnapshotRef.current = { pages, activeId: activeOutfitPageId };
    const timer = window.setTimeout(() => {
      pendingDraftSnapshotRef.current = null;
      void persistOutfitDraftState(pages, activeOutfitPageId);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    draftReady,
    outfitPages,
    activeOutfitPageId,
    settings,
    uploadLabels,
    modelImages,
    clothingImages,
    referenceImages,
    fixedClothingId,
    tasks,
    originalLibrary,
    activeUploadGroup
  ]);

  // 2026-09-26 结果丢失修复：
  // 上面那个效果是 350ms 防抖，原来卸载时只 clearTimeout —— 也就是"最近 350ms 内的状态全部丢掉"。
  // 批量刚生成完就点左侧导航切页面时，这条刚好把"已完成"抹掉，草稿里留在"运行中"，
  // 切回来就被判成"刷新中断 / 请到保存目录确认"。
  // 组件重挂载并不会丢内存状态的机会，所以这里在卸载时把待落盘快照立刻补写一次。
  useEffect(() => () => {
    const snapshot = pendingDraftSnapshotRef.current;
    if (!snapshot) return;
    pendingDraftSnapshotRef.current = null;
    void persistOutfitDraftState(snapshot.pages, snapshot.activeId);
  }, []);

  useEffect(() => {
    writeJsonStorage(PROMPT_PRESETS_KEY, promptPresets);
  }, [promptPresets]);

  useEffect(() => {
    writeJsonStorage(PROMPT_CATEGORIES_KEY, promptCategories.filter((category) => category !== "全部"));
  }, [promptCategories]);

  useEffect(() => {
    if (!running && !hasPendingTasks) return undefined;
    setClockNow(Date.now());
    const timer = window.setInterval(() => setClockNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [running, hasPendingTasks]);

  useEffect(() => {
    if (!ratios.includes(settings.aspectRatio)) {
      setSettings((current) => ({ ...current, aspectRatio: ratios[0] || "3:4" }));
    }
  }, [ratios, settings.aspectRatio]);

  useEffect(() => {
    if (isSettingsOpen) {
      setApiKeyDraft(settings.apiKey || "");
      setApiSaveStatus("");
    }
  }, [isSettingsOpen, settings.apiKey]);

  useEffect(() => {
    if (!preview && !imageLightbox) return;
    setPreviewZoom(1);
    setPreviewPan({ x: 0, y: 0 });
    previewDragRef.current = null;
  }, [preview, imageLightbox]);

  useEffect(() => {
    if (!preview?.id) return;
    const latestPreview = tasks.find((task) => task.id === preview.id);
    if (latestPreview && latestPreview !== preview) {
      setPreview(latestPreview);
    } else if (!latestPreview) {
      setPreview(null);
    }
  }, [tasks, preview]);

  useEffect(() => {
    const closeReferenceMenu = () => setReferenceContextMenu(null);
    const handleReferenceMenuKey = (event) => {
      if (event.key === "Escape") setReferenceContextMenu(null);
    };
    window.addEventListener("click", closeReferenceMenu);
    window.addEventListener("resize", closeReferenceMenu);
    window.addEventListener("keydown", handleReferenceMenuKey);
    return () => {
      window.removeEventListener("click", closeReferenceMenu);
      window.removeEventListener("resize", closeReferenceMenu);
      window.removeEventListener("keydown", handleReferenceMenuKey);
    };
  }, []);

  useEffect(() => {
    if (activeView !== "outfit") return;
    window.requestAnimationFrame(() => {
      const grid = taskGridRef.current;
      if (!grid) return;
      // 2026-09-26：结果网格不再自己滚动（整页只有一条滚动条），
      // 所以"自动看到最新结果"改成把外层滚动容器调到让结果区底部对齐可视区底部。
      const scroller = grid.closest(".outfitScrollArea");
      if (!scroller) return;
      const delta = grid.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
      if (delta > 0) scroller.scrollTop += delta;
    });
  }, [activeView, visibleTasks.length, tasks.length, galleryCardMin]);

  // 只读提示词框随内容自撑高度（见下）；这里先把 ref 挂到 label 上，方便取到里面的 textarea。
  const promptFieldRef = useRef(null);
  // 「通用换装提示词」是否被用户手改过：手改后先不再自动覆盖，直到下一次改换装设置/补充提示词。
  const outfitPromptHandEditedRef = useRef(false);
  // 精修同理：「通用白底精修提示词」被手改过就先不自动覆盖，直到下一次改精修设置/用户补充。
  const retouchPromptHandEditedRef = useRef(false);
  // 切页视为没有手改（换回这一页时按当前设置重新生成）。
  useEffect(() => {
    outfitPromptHandEditedRef.current = false;
    retouchPromptHandEditedRef.current = false;
  }, [activeOutfitPageId]);

  // 2026-09-26（按用户要求）：批量换装的「通用换装提示词」由换装设置 + 图2事实 + 补充提示词自动生成。
  // - 换装部位/层级/穿法/图2事实一变，就按新设置重新生成一遍（"再点服装部位还是这套逻辑"）；
  // - 下面的补充提示词改写时，实时接到这一框的最后面；
  // - 用户直接手改这一框时，手改内容保留，不会被自动生成立刻盖掉；
  // - 依赖里带上 settings.prompt 是必须的：草稿加载会把存档里的旧提示词写回来，
  //   只靠 outfitPromptWithNote 变化会漏掉这一拍，导致页面上留着旧的手写文案（已实测踩过）。
  useEffect(() => {
    if (!isOutfitWorkflow) return;
    if (outfitPromptHandEditedRef.current) return;
    setSettings((current) => (String(current.prompt || "") === outfitPromptWithNote
      ? current
      : { ...current, prompt: outfitPromptWithNote }));
  }, [isOutfitWorkflow, outfitPromptWithNote, settings.prompt]);

  // 精修：和换装完全同一套逻辑 ——「通用白底精修提示词」由「精修设置 + 用户补充」自动生成，
  // 也可以直接手改；点对称/衣摆/版型或改用户补充就按新设置重新生成。
  useEffect(() => {
    if (!isWhiteRefineWorkflow) return;
    if (retouchPromptHandEditedRef.current) return;
    setSettings((current) => {
      const currentPrompt = String(current.prompt || "");
      const currentNote = String(current.productNote || "");
      // 2026-09-26 一次性迁移：以前用户是在「通用白底精修提示词」里手写整段要求的
      //（那时这一框就是唯一提示词）。现在这一框变成"自动结果"，所以先把用户**自己写的**内容
      // 搬进「用户补充」，再由编译器合并回去 —— 保证原来写的东西一个字都不丢。
      //
      // ⚠️ 必须排除"这一框里已经是编译器产出"的情况（含固定目标段），否则自动生成的结果会被
      //    当成用户手写内容反复搬进用户补充，越滚越长（这个坑已经踩过一次）。
      const looksCompiled = currentPrompt.includes(RETOUCH_GOAL_TEXT);
      const userWritten = currentPrompt.trim()
        && !looksCompiled
        && !isBuiltinRetouchPrompt(currentPrompt)
        && currentPrompt.length <= 6000
        && currentNote.length <= 20000;
      if (userWritten && !currentNote.includes(currentPrompt.trim())) {
        return {
          ...current,
          productNote: [currentNote, currentPrompt].filter((item) => String(item || "").trim()).join("\n"),
          prompt: retouchAutoPrompt
        };
      }
      return currentPrompt === retouchAutoPrompt ? current : { ...current, prompt: retouchAutoPrompt };
    });
  }, [isWhiteRefineWorkflow, retouchAutoPrompt, settings.prompt]);

  // 提示词框按内容自撑高度（**只给换装**）：整页只保留一条滚动条，框内不出现第二条。
  // 精修页按用户要求改成"定高 + 框内滑动"（提示词长了用滑轮看），所以不在这里撑高。
  useEffect(() => {
    if (!isOutfitWorkflow) return;
    const el = promptFieldRef.current?.querySelector("textarea.outfitPromptLive");
    if (!el) return;
    const supportsFieldSizing = typeof CSS !== "undefined"
      && typeof CSS.supports === "function"
      && CSS.supports("field-sizing", "content");
    if (supportsFieldSizing) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 480)}px`;
  }, [isOutfitWorkflow, settings.prompt]);

  useEffect(() => {
    if (!preview) return undefined;
    function handleKeyDown(event) {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigatePreview(-1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigatePreview(1);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closePreviewModal();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [preview, resultPreviewTasks]);

  function updateSetting(key, value) {
    if (key === "model") {
      // 切换模型时按新模型的 capabilities 重新收敛比例 / 尺寸 / 生成数量 / 线路。
      setSettings((current) => convergeSettingsForModel(
        { ...current, model: value },
        config.routing || config
      ));
      return;
    }
    if (key === "channelId") {
      const channels = channelsForModel(settings.model, config.routing || config);
      setSettings((current) => ({
        ...current,
        channelId: channels.some((channel) => channel.id === value) ? value : (channels[0]?.id || "")
      }));
      return;
    }
    const normalizeValue = (current) => {
      if (key === "generationCount") return normalizeGenerationCount(value);
      if (key === "smartIntervention") return normalizeSmartIntervention(value);
      if (key === "qualityCheck") return normalizeQualityCheck(value);
      if (key === "garmentParts") return normalizeGarmentParts(value);
      if (key === "garmentComposition") return normalizeGarmentComposition(value, current.garmentParts);
      if (key === "outfitIntent") return normalizeOutfitIntent(value);
      return value;
    };
    setSettings((current) => {
      const next = {
        ...current,
        [key]: normalizeValue(current)
      };
      if (key === "generationCount") next[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] = true;
      return next;
    });
  }

  function enableGenerationCountAutoLink() {
    if (isDesignDraftWorkflow) return;
    setSettings((current) => current.generationCount === "auto"
      ? current
      : {
          ...current,
          generationCount: "auto",
          [GENERATION_COUNT_AUTOLINK_MIGRATION_KEY]: true
        });
  }

  // 中文注释：把图2分析结果（结构化服装事实）写进当前页面的 outfitIntent。
  // 分析失败只提示，不清空用户已有的手动选择，也不让整批失效。
  async function analyzeImageFacts() {
    if (imageFactsAnalyzing) return;
    if (!effectiveApiKey) {
      addEvent("图2分析", "请先填写 API Key");
      openSettings();
      return;
    }
    const source = selectedFixedClothing;
    if (!source?.file) {
      addEvent("图2分析", "请先上传并选中一张图2服装图");
      return;
    }
    if (outfitIntent.parts.length === 0) {
      addEvent("图2分析", "请先在「更换部位」里至少选择一个部位，分析才会只提取相关事实");
      return;
    }

    setImageFactsAnalyzing(true);
    addEvent("图2分析", `正在按【${outfitIntentSummary.replaceText}】读取图2服装事实`);
    try {
      const form = new FormData();
      form.append("payload", JSON.stringify({
        apiKey: effectiveApiKey,
        model: settings.model,
        imageSize: settings.imageSize,
        aspectRatio: settings.aspectRatio,
        // 分析只认结构化意图（部位 + 上装层级），与最终提示词编译器读的是同一份数据。
        outfitIntent,
        prompt: settings.prompt,
        productNote: settings.productNote
      }));
      form.append("image", source.file, `clothing_${source.name || "image2.jpg"}`);
      const payload = await analyzeOutfitMasterFit(form);
      const facts = normalizeOutfitIntent({ ...outfitIntent, facts: payload.facts }).facts;
      if (recognizedFactKeys(facts).length === 0) throw new Error("服务端没有返回可识别的图2服装事实");
      setSettings((current) => {
        const currentIntent = normalizeOutfitIntent(current.outfitIntent);
        return {
          ...current,
          outfitIntent: {
            ...currentIntent,
            facts,
            factsSource: { mode: "auto", sourceId: source.id, analyzedAt: Date.now() }
          }
        };
      });
      addEvent("图2分析", `已提取 ${recognizedFactKeys(facts).length} 项服装事实（可展开修改后再生成）`);
    } catch (error) {
      // 分析失败：保留用户已选部位与手动事实，批次照样可以生成。
      addEvent("图2分析失败", error instanceof Error ? error.message : String(error));
    } finally {
      setImageFactsAnalyzing(false);
    }
  }

  // 中文注释：切换固定图2时不覆盖用户已手动修改的图2事实，只标记事实来源已过期。
  // （旧实现在这里清母版锁并弹提示；现在事实是否过期由 factsSource.sourceId 判断，UI 会显示提示。）
  function setMasterClothing(id) {
    if (id === fixedClothingId) return;
    setFixedClothingId(id);
  }

  // 中文注释：以下是唯一改动结构化换装意图的入口。所有写入都经过 normalizeOutfitIntent，
  // 保证枚举合法、字段完整；界面只改这一份数据，请求与提示词都从它派生。
  function patchOutfitIntent(patch) {
    // 改换装设置 = 重新按设置生成「通用换装提示词」（用户手改过也让位给这次重算）。
    outfitPromptHandEditedRef.current = false;
    setSettings((current) => {
      const currentIntent = normalizeOutfitIntent(current.outfitIntent);
      const nextPatch = typeof patch === "function" ? patch(currentIntent) : patch;
      return { ...current, outfitIntent: normalizeOutfitIntent({ ...currentIntent, ...nextPatch }) };
    });
  }

  function toggleOutfitPart(part) {
    const nextParts = outfitIntent.parts.includes(part)
      ? outfitIntent.parts.filter((item) => item !== part)
      : [...outfitIntent.parts, part];
    patchOutfitIntent({ parts: nextParts });
    if (nextParts.length === 0) addEvent("换装设置", "请至少选择一个更换部位");
  }

  function updateOutfitWearingValue(key, value) {
    patchOutfitIntent((current) => ({
      wearing: { ...current.wearing, values: { ...current.wearing.values, [key]: value } }
    }));
  }

  function updateOutfitFact(key, value) {
    patchOutfitIntent((current) => ({
      facts: { ...current.facts, [key]: value },
      // 用户手改过事实后标记为 manual：来源图2换了也不清空用户手工内容。
      factsSource: { ...current.factsSource, mode: current.factsSource.mode === "auto" ? "manual" : current.factsSource.mode || "manual" }
    }));
  }

  function wearingFieldValue(key) {
    return outfitIntent.wearing.values[key] || "";
  }

  // 精修：唯一改动结构化精修意图的入口（同一个 normalize，保证枚举合法、字段完整）。
  function patchRetouchIntent(patch) {
    // 改精修设置 = 按设置重新生成「通用白底精修提示词」（用户手改过也让位给这次重算）。
    retouchPromptHandEditedRef.current = false;
    setSettings((current) => {
      const currentIntent = normalizeRetouchIntent(current.retouchIntent);
      const nextPatch = typeof patch === "function" ? patch(currentIntent) : patch;
      return { ...current, retouchIntent: normalizeRetouchIntent({ ...currentIntent, ...nextPatch }) };
    });
  }

  // 中文注释：批量改色的改色范围（只有 recolor 还在用这套旧机制）。
  function toggleGarmentPart(part) {
    const currentParts = normalizeGarmentParts(settings.garmentParts);
    const nextParts = currentParts.includes(part)
      ? currentParts.filter((item) => item !== part)
      : [...currentParts, part];
    if (nextParts.length === 0) {
      addEvent("图2部位", "至少保留一个改色部位");
      return;
    }
    setSettings((current) => ({
      ...current,
      garmentParts: nextParts,
      garmentComposition: normalizeGarmentComposition(current.garmentComposition, nextParts)
    }));
  }

  function applyGarmentPartPreset(preset) {
    const nextParts = normalizeGarmentParts(preset?.parts);
    const nextComposition = normalizeGarmentComposition(preset?.composition || preset?.value, nextParts);
    setSettings((current) => ({
      ...current,
      garmentParts: nextParts,
      garmentComposition: nextComposition
    }));
  }

  /**
   * 连接测试：对齐 3.0 `/api/providers/test-connection` 的做法 —— 只探测 /v1/models。
   * 不发提示词、不上传图片、不调用生图接口，所以既不会出图也不会扣费。
   */
  // 连通性测试的实现在 src/features/auth/api-key.js（两侧同一份，23 行逐字节一致）。
  // 这里只保留闭包绑定壳：每次 render 重建，捕获最新的 settings / config 与各 setter。
  const runConnectionTest = () => testApiConnection({
    setIsConnectionTesting,
    setConnectionState,
    setConnectionStatus,
    settings,
    config,
    testConnection,
    formatConnectionResult,
    addEvent
  });

  function openSettings() {
    if (embeddedMode) {
      // 批量页嵌在快捷生成里时，设置面板由宿主页面渲染；连接测试也在宿主面板里。
      onOpenHostSettings();
      return;
    }
    setApiKeyDraft(settings.apiKey || "");
    setApiSaveStatus("");
    setIsSettingsOpen(true);
  }

  function saveSettings() {
    const nextKey = normalizeApiKeyInput(apiKeyDraft);
    setApiKeyDraft(nextKey);
    updateSetting("apiKey", nextKey);
    setApiSaveStatus("已保存");
    window.setTimeout(() => setApiSaveStatus(""), 1200);
  }

  const {
    applyPromptPreset,
    editPromptPreset,
    addPromptCategory,
    renamePromptCategory,
    deletePromptPreset,
    beginPromptDrag,
    endPromptDrag,
    dropPromptOnCategory,
    dropPromptOnPreset,
    openNewPromptEditor,
    updateEditingPrompt,
    saveEditingPrompt
  } = usePromptLibrary({
    categories: promptCategories,
    setCategories: setPromptCategories,
    activeCategory: promptCategory,
    setActiveCategory: setPromptCategory,
    setPresets: setPromptPresets,
    editing: editingPrompt,
    setEditing: setEditingPrompt,
    draggedId: draggedPromptId,
    setDraggedId: setDraggedPromptId,
    setDropCategory: setPromptDropCategory,
    promptText: settings.prompt.trim(),
    updateSetting,
    makePresetId: () => makeId("prompt"),
    notify: addEvent,
    onApplyPreset: () => setIsPromptAssistantOpen(false)
  });

  function schedulePromptPresetApply(preset) {
    if (promptClickTimerRef.current) window.clearTimeout(promptClickTimerRef.current);
    promptClickTimerRef.current = window.setTimeout(() => {
      promptClickTimerRef.current = null;
      applyPromptPreset(preset);
    }, 180);
  }

  function renamePromptPresetTitle(preset) {
    if (promptClickTimerRef.current) {
      window.clearTimeout(promptClickTimerRef.current);
      promptClickTimerRef.current = null;
    }
    const input = window.prompt("修改提示词标题", preset.title);
    const title = String(input || "").trim();
    if (!title || title === preset.title) return;
    setPromptPresets((current) => current.map((item) => (
      item.id === preset.id ? { ...item, title } : item
    )));
    addEvent("提示词", `标题已改为「${title}」`);
  }

  function handlePromptKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void startBatch();
    }
  }

  function addEvent(title, detail) {
    const time = Date.now();
    const text = detail ? `${title}：${detail}` : title;
    setInlineMessage(text);
    setEvents((current) => [{ id: makeId("event"), title, detail: detail || "", time }, ...current].slice(0, 6));
  }

  function updateTaskRuntime(taskId, runtimeStage, runtimeDetail = "") {
    if (!taskId) return;
    const runtimeUpdatedAt = Date.now();
    setTasks((current) => current.map((item) => item.id === taskId ? {
      ...item,
      runtimeStage,
      runtimeDetail,
      runtimeUpdatedAt
    } : item));
    // 同步进跨挂载周期账本：用户切走页面后，重挂载回来的卡片也能看到实时阶段
    // （本地预处理 / 等待中转站返回 / 模型已返回 …），而不是停在开始那一刻的"准备任务"。
    const latest = tasksRef.current.find((item) => item.id === taskId);
    if (latest) publishOutfitLiveRun({ ...latest, runtimeStage, runtimeDetail, runtimeUpdatedAt });
  }

  function beginGenerationRun() {
    runningGenerationCountRef.current += 1;
    if (runningGenerationCountRef.current === 1) {
      setRunning(true);
    }
  }

  function endGenerationRun() {
    runningGenerationCountRef.current = Math.max(0, runningGenerationCountRef.current - 1);
    if (runningGenerationCountRef.current === 0) {
      setRunning(false);
    }
  }

  function buildCurrentOutfitPageSnapshot(basePage = activeOutfitPage) {
    const snapshotUploadLabels = uploadLabels;
    const snapshotWorkflowMode = inferOutfitWorkflowMode(basePage.name, snapshotUploadLabels);
    const snapshotAllowsEmptyPrompt = snapshotWorkflowMode === "custom" || snapshotWorkflowMode === "local-detail";
    return {
      ...basePage,
      id: basePage.id || activeOutfitPageId,
      name: normalizeOutfitPageName(basePage.name, DEFAULT_OUTFIT_PAGE_NAME),
      deleteLocked: Boolean(basePage.deleteLocked),
      settings: stripOutfitPageGlobalSettings(settings, { allowEmptyPrompt: snapshotAllowsEmptyPrompt }),
      modelImages,
      clothingImages,
      referenceImages,
      fixedClothingId,
      tasks,
      originalLibrary,
      activeUploadGroup,
      uploadLabels: snapshotUploadLabels
    };
  }

  function resetOutfitPageTransients() {
    clearSelection();
    setResultFilter("all");
    setPreview(null);
    setImageLightbox(null);
    setCropTarget(null);
    setLocalEditTarget(null);
    setDownloadFeedbackIds(() => new Set());
    setInlineMessage("");
    setIsPromptAssistantOpen(false);
    setEditingPrompt(null);
  }

  function loadOutfitPage(page) {
    const pageWorkflowMode = inferOutfitWorkflowMode(page.name, page.uploadLabels);
    const pageAllowsEmptyPrompt = pageWorkflowMode === "custom" || pageWorkflowMode === "local-detail";
    const pageModelImages = Array.isArray(page.modelImages) ? page.modelImages : [];
    const pageClothingImages = Array.isArray(page.clothingImages) ? page.clothingImages : [];
    const pageReferenceImages = Array.isArray(page.referenceImages) ? page.referenceImages : [];
    setSettings(mergeOutfitPageSettings(page.settings, settings, { allowEmptyPrompt: pageAllowsEmptyPrompt }));
    setModelImages(pageModelImages);
    setClothingImages(pageClothingImages);
    setReferenceImages(pageReferenceImages);
    setFixedClothingId(page.fixedClothingId || "");
    setTasks(hydrateTasksWithUploadReferences(page.tasks, {
      modelImages: pageModelImages,
      clothingImages: pageClothingImages,
      referenceImages: pageReferenceImages
    }));
    setOriginalLibrary(Array.isArray(page.originalLibrary) ? page.originalLibrary : []);
    setActiveUploadGroup(page.activeUploadGroup || "model");
    setUploadLabels(normalizeUploadLabels(page.uploadLabels || {}, page.name));
    resetOutfitPageTransients();
  }

  function switchOutfitPage(pageId) {
    if (!pageId || pageId === activeOutfitPageId) return;
    const hasLiveGeneration = tasks.some(isLiveGenerationTask);
    if (running && hasLiveGeneration) {
      addEvent("页面切换", "当前正在生成，完成后再切换页面");
      return;
    }
    if (running && !hasLiveGeneration) {
      runningGenerationCountRef.current = 0;
      setRunning(false);
    }
    const target = outfitPages.find((page) => page.id === pageId);
    if (!target) return;
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    setOutfitPages((current) => current.map((page) => (
      page.id === activeOutfitPageId ? currentSnapshot : page
    )));
    setActiveOutfitPageId(pageId);
    loadOutfitPage(target);
    addEvent("页面切换", `已切换到「${target.name}」`);
  }

  function createOutfitPageFromCurrent() {
    if (running) {
      addEvent("新建页面", "当前正在生成，完成后再新建页面");
      return;
    }
    const page = makeOutfitPage(`${DEFAULT_CUSTOM_PAGE_NAME} ${outfitPages.length + 1}`, {
      settings: {
        ...settings,
        prompt: "",
        productNote: "",
        smartIntervention: false
      },
      uploadLabels: CUSTOM_UPLOAD_LABELS,
      activeUploadGroup: "model",
      allowEmptyPrompt: true
    });
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    setOutfitPages((current) => [
      ...current.map((item) => (item.id === activeOutfitPageId ? currentSnapshot : item)),
      page
    ]);
    setActiveOutfitPageId(page.id);
    loadOutfitPage(page);
    addEvent("新建页面", `已创建「${page.name}」`);
  }

  function beginOutfitPageDrag(event, pageId) {
    setDraggedPageId(pageId);
    setPageDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
  }

  function updateOutfitPageDropTarget(event, pageId) {
    const sourceId = draggedPageId || event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === pageId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    setPageDropTarget({ id: pageId, placement });
  }

  function endOutfitPageDrag() {
    setDraggedPageId("");
    setPageDropTarget(null);
  }

  function dropOutfitPage(event, targetId) {
    const sourceId = draggedPageId || event.dataTransfer.getData("text/plain");
    if (!sourceId || !targetId || sourceId === targetId) {
      endOutfitPageDrag();
      return;
    }
    event.preventDefault();
    const placement = pageDropTarget?.id === targetId ? pageDropTarget.placement : "before";
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    setOutfitPages((current) => {
      const pages = current.map((page) => (
        page.id === activeOutfitPageId ? currentSnapshot : page
      ));
      return moveItemByDrop(pages, sourceId, targetId, placement);
    });
    endOutfitPageDrag();
    addEvent("页面排序", "顺序已更新");
  }

  function renameOutfitPage(pageId = activeOutfitPageId) {
    const page = outfitPages.find((item) => item.id === pageId) || activeOutfitPage;
    if (!page) return;
    const input = window.prompt("修改页面名称", page.name || DEFAULT_OUTFIT_PAGE_NAME);
    const name = normalizeOutfitPageName(input, page.name || DEFAULT_OUTFIT_PAGE_NAME);
    if (!name || name === page.name) return;
    const oldDefaultLabels = defaultUploadLabelsForPage(page.name);
    const shouldApplyNewDefaults = sameUploadLabels(
      page.id === activeOutfitPageId ? uploadLabels : page.uploadLabels,
      oldDefaultLabels
    );
    const nextUploadLabels = shouldApplyNewDefaults
      ? normalizeUploadLabels(defaultUploadLabelsForPage(name), name)
      : normalizeUploadLabels(page.id === activeOutfitPageId ? uploadLabels : page.uploadLabels, name);
    const oldMode = inferOutfitWorkflowMode(page.name, page.id === activeOutfitPageId ? uploadLabels : page.uploadLabels);
    const nextMode = inferOutfitWorkflowMode(name, nextUploadLabels);
    const pageSettings = page.id === activeOutfitPageId ? settings : mergeOutfitPageSettings(page.settings, settings);
    const currentPrompt = String(pageSettings.prompt || "");
    const shouldApplyPromptDefault = shouldApplyNewDefaults
      && oldMode !== nextMode
      && [
        defaultPromptForWorkflowMode(oldMode),
        OUTFIT_DEFAULT_PROMPT,
        LOCAL_DETAIL_DEFAULT_PROMPT,
        POSE_REMIX_DEFAULT_PROMPT,
        BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT,
        BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT,
        BACKGROUND_CHANGE_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_DEFAULT_PROMPT,
        WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT,
        WHITE_REFINE_DEFAULT_PROMPT,
        FACE_SWAP_SHORT_DEFAULT_PROMPT,
        FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT,
        FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT,
        FACE_SWAP_DEFAULT_PROMPT,
        FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT,
        FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT,
        LEGACY_FACE_SWAP_DEFAULT_PROMPT,
        FACE_SWAP_LOOSE_DEFAULT_PROMPT,
        POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT,
        DESIGN_DRAFT_DEFAULT_PROMPT
      ].includes(currentPrompt);
    const nextSettings = shouldApplyPromptDefault
      ? {
          ...pageSettings,
          prompt: defaultPromptForWorkflowMode(nextMode),
          productNote: ""
        }
      : pageSettings;
    const nextAllowsEmptyPrompt = nextMode === "custom" || nextMode === "local-detail";
    setOutfitPages((current) => current.map((item) => (
      item.id === pageId ? { ...item, name, uploadLabels: nextUploadLabels, settings: stripOutfitPageGlobalSettings(nextSettings, { allowEmptyPrompt: nextAllowsEmptyPrompt }) } : item
    )));
    if (pageId === activeOutfitPageId) {
      setUploadLabels(nextUploadLabels);
      if (shouldApplyPromptDefault) setSettings(nextSettings);
    }
    addEvent("页面名称", `已改为「${name}」`);
  }

  function revokeOutfitPageAssets(page) {
    [page?.modelImages, page?.clothingImages, page?.referenceImages].forEach((list) => {
      if (Array.isArray(list)) list.forEach(revokeImageUrls);
    });
    if (Array.isArray(page?.originalLibrary)) {
      page.originalLibrary.forEach((item) => {
        if (item?.url) URL.revokeObjectURL(item.url);
      });
    }
  }

  function toggleOutfitPageDeleteLock(pageId = activeOutfitPageId) {
    const page = outfitPages.find((item) => item.id === pageId) || activeOutfitPage;
    if (!page) return;
    const nextLocked = !page.deleteLocked;
    setOutfitPages((current) => current.map((item) => (
      item.id === pageId ? { ...item, deleteLocked: nextLocked } : item
    )));
    addEvent("页面防误删", nextLocked ? "已锁定当前页删除" : "已解除当前页删除锁");
  }

  function deleteOutfitPage(pageId = activeOutfitPageId) {
    if (running) {
      addEvent("删除页面", "当前正在生成，完成后再删除页面");
      return;
    }
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    const pagesWithCurrent = outfitPages.map((page) => (
      page.id === activeOutfitPageId ? currentSnapshot : page
    ));
    if (pagesWithCurrent.length <= 1) {
      addEvent("删除页面", "至少保留一个页面");
      return;
    }
    const targetIndex = pagesWithCurrent.findIndex((page) => page.id === pageId);
    if (targetIndex < 0) return;
    const target = pagesWithCurrent[targetIndex];
    if (target.deleteLocked) {
      addEvent("删除页面", "页面已锁定，先解锁再删除");
      return;
    }
    const confirmed = window.confirm(`确定删除「${target.name || DEFAULT_OUTFIT_PAGE_NAME}」吗？该页面里的上传图和生成队列会一起移除。`);
    if (!confirmed) return;
    const remaining = pagesWithCurrent.filter((page) => page.id !== pageId);
    const nextPage = remaining[Math.min(targetIndex, remaining.length - 1)] || remaining[0];
    revokeOutfitPageAssets(target);
    setOutfitPages(remaining);
    if (pageId === activeOutfitPageId && nextPage) {
      setActiveOutfitPageId(nextPage.id);
      loadOutfitPage(nextPage);
    }
    addEvent("删除页面", `已删除「${target.name || DEFAULT_OUTFIT_PAGE_NAME}」`);
  }

  function editUploadLabel(group, field) {
    const groupIndex = group === "model" ? 1 : group === "clothing" ? 2 : 3;
    const defaults = defaultUploadLabelsForPage(activeOutfitPage.name);
    const current = uploadLabels[group]?.[field] || defaults[group]?.[field] || "";
    const label = field === "title" ? `图${groupIndex}标题` : `图${groupIndex}说明`;
    const input = window.prompt(`修改${label}`, current);
    if (input == null) return;
    const nextText = normalizeUploadLabelText(input, current, field === "title" ? 36 : 140);
    if (!nextText || nextText === current) return;
    setUploadLabels((labels) => normalizeUploadLabels({
      ...labels,
      [group]: {
        ...labels[group],
        [field]: nextText
      }
    }, activeOutfitPage.name));
    addEvent("上传说明", `已修改${label}`);
  }

  async function addImages(group, files) {
    const currentCount = group === "model" ? modelImages.length : group === "clothing" ? clothingImages.length : referenceImages.length;
    // 中文注释：批量姿态页图1承载多张姿态，图2只保留固定母版和备用母版。
    const uploadLimit = group === "clothing" && (isOutfitWorkflow || isPoseRemixWorkflow || isFaceSwapWorkflow)
      ? 2
      : outfitMaxImages;
    const allowed = Math.max(0, uploadLimit - currentCount);
    if (allowed <= 0) {
      addEvent("上传限制", `当前图片区最多 ${uploadLimit} 张`);
      return;
    }
    const acceptedFiles = Array.from(files || []).slice(0, allowed);
    if (acceptedFiles.length < Array.from(files || []).length) {
      addEvent("上传限制", `已保留前 ${uploadLimit} 张，超出的图片未加入`);
    }

    const items = [];
    const originals = [];
    for (const file of acceptedFiles) {
      try {
        const item = await createImageItem(file, settings.aspectRatio, settings.preprocessMode);
        items.push(item);
        originals.push({
          id: makeId("origin"),
          group,
          sourceId: item.id,
          name: file.name,
          url: URL.createObjectURL(file),
          size: file.size,
          createdAt: Date.now()
        });
      } catch (error) {
        addEvent("图片整理失败", `${file.name}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (group === "model") {
      setModelImages((current) => [...current, ...items]);
      if (items.length) enableGenerationCountAutoLink();
    }
    if (group === "clothing") {
      setClothingImages((current) => {
        const next = [...current, ...items];
        if (!fixedClothingId && next[0]) setFixedClothingId(next[0].id);
        return next;
      });
    }
    if (group === "reference") setReferenceImages((current) => [...current, ...items]);
    if (originals.length) setOriginalLibrary((current) => [...current, ...originals].slice(-80));
  }

  function openReferenceContextMenu(event, reference, index, items) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 188;
    const menuHeight = 52;
    setReferenceContextMenu({
      reference,
      index,
      count: Array.isArray(items) ? items.length : 0,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  async function sendReferenceThumbToModelUpload(reference) {
    const src = referenceSource(reference);
    setReferenceContextMenu(null);
    if (!src) {
      addEvent("参考图", "这张缩略图没有可读取的图片地址");
      return;
    }
    try {
      const file = await imageFileFromUrl(src, reference?.name || reference?.label || "reference");
      await addImages("model", [file]);
      addEvent("参考图", "已发送到图1上传区");
    } catch (error) {
      addEvent("参考图失败", error instanceof Error ? error.message : String(error));
    }
  }

  function removeImage(group, id, options = {}) {
    const { unlinkOriginal = true } = options;
    const remove = (items) => {
      const target = items.find((item) => item.id === id);
      revokeImageUrls(target);
      return items.filter((item) => item.id !== id);
    };
    if (group === "model") {
      setModelImages(remove);
      enableGenerationCountAutoLink();
    }
    if (group === "clothing") {
      setClothingImages((items) => {
        const next = remove(items);
        if (fixedClothingId === id) setFixedClothingId(next[0]?.id || "");
        return next;
      });
    }
    if (group === "reference") setReferenceImages(remove);
    if (localEditTarget?.group === group && localEditTarget?.item?.id === id) setLocalEditTarget(null);
    if (unlinkOriginal) {
      setOriginalLibrary((current) => current.filter((item) => {
        const linked = item.group === group && item.sourceId === id;
        if (linked && item.url) URL.revokeObjectURL(item.url);
        return !linked;
      }));
    }
  }

  async function replaceImage(group, id, file) {
    if (!isImageFile(file)) {
      addEvent("替换失败", "只能替换为图片文件");
      return;
    }
    try {
      const nextItem = await createImageItem(file, settings.aspectRatio, settings.preprocessMode);
      const replace = (items) => items.map((current) => {
        if (current.id !== id) return current;
        revokeImageUrls(current);
        return {
          ...nextItem,
          id,
          selected: current.selected,
          localEdit: null,
          createdAt: current.createdAt || nextItem.createdAt
        };
      });
      if (group === "model") setModelImages(replace);
      if (group === "clothing") {
        setClothingImages(replace);
      }
      if (group === "reference") setReferenceImages(replace);
      setOriginalLibrary((current) => {
        let matched = false;
        const next = current.map((item) => {
          if (item.group !== group || item.sourceId !== id) return item;
          if (item.url) URL.revokeObjectURL(item.url);
          matched = true;
          return {
            ...item,
            name: file.name,
            url: URL.createObjectURL(file),
            size: file.size,
            createdAt: Date.now()
          };
        });
        if (matched) return next;
        return [...next, {
          id: makeId("origin"),
          group,
          sourceId: id,
          name: file.name,
          url: URL.createObjectURL(file),
          size: file.size,
          createdAt: Date.now()
        }].slice(-80);
      });
      addEvent("图片替换", `${file.name} 已替换`);
    } catch (error) {
      addEvent("替换失败", `${file.name}：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function clearImageGroup(group) {
    const clear = (items) => {
      items.forEach(revokeImageUrls);
      return [];
    };
    if (group === "model") {
      setModelImages(clear);
      enableGenerationCountAutoLink();
    }
    if (group === "clothing") {
      setClothingImages(clear);
      setFixedClothingId("");
    }
    if (group === "reference") setReferenceImages(clear);
    setOriginalLibrary((current) => current.filter((item) => {
      const matched = item.group === group;
      if (matched && item.url) URL.revokeObjectURL(item.url);
      return !matched;
    }));
    if (cropTarget?.group === group) setCropTarget(null);
    if (localEditTarget?.group === group) setLocalEditTarget(null);
    addEvent("清除图片", group === "model" ? "图1已清空" : group === "clothing" ? "图2已清空" : "图3已清空");
  }

  function toggleImage(group, id) {
    const toggle = (items) => items.map((item) => item.id === id ? { ...item, selected: !item.selected } : item);
    if (group === "model") {
      setModelImages(toggle);
      enableGenerationCountAutoLink();
    }
    if (group === "clothing") setClothingImages(toggle);
    if (group === "reference") setReferenceImages(toggle);
  }

  function reorderImage(group, fromId, toId, placement) {
    const reorder = (items) => moveItemByDrop(items, fromId, toId, placement);
    if (group === "model") setModelImages(reorder);
    if (group === "clothing") setClothingImages(reorder);
    if (group === "reference") setReferenceImages(reorder);
  }

  function applyCropItem(group, item) {
    const replace = (items) => items.map((current) => {
      if (current.id !== item.id) return current;
      revokePreviewUrl(current);
      return {
        ...item,
        cropReturn: group === "model" ? normalizeCropReturnMeta(item.cropReturn) : null
      };
    });
    if (group === "model") setModelImages(replace);
    if (group === "clothing") {
      setClothingImages(replace);
    }
    if (group === "reference") setReferenceImages(replace);
    setCropTarget(null);
    if (group === "model" && item.cropReturn?.cropRect) {
      addEvent("裁剪生成回流", `图1已记录 ${item.cropReturn.cropWidth || item.cropReturn.cropRect.width}×${item.cropReturn.cropHeight || item.cropReturn.cropRect.height} 裁剪框，生成后回流到 ${item.cropReturn.outputWidth}×${item.cropReturn.outputHeight} 大图`);
    }
  }

  function openLocalEdit(group, item) {
    if (group !== "model") {
      addEvent("局部回贴", "只有图1支持局部回贴；图2和图3只作为参考图使用普通裁剪。");
      return;
    }
    const nextRatio = BATCH_LOCAL_EDIT_RATIOS.includes(settings.aspectRatio)
      ? settings.aspectRatio
      : BATCH_LOCAL_EDIT_RATIOS[0];
    if (nextRatio !== settings.aspectRatio) updateSetting("aspectRatio", nextRatio);
    setLocalEditTarget({ group, item });
  }

  function applyLocalEditItem(group, itemId, cropped) {
    if (group !== "model") {
      setLocalEditTarget(null);
      addEvent("局部回贴", "已忽略非图1的局部回贴设置。");
      return;
    }
    const localEdit = {
      cropFile: cropped.file,
      cropRect: cropped.cropRect,
      contextRect: cropped.contextRect || null,
      sourceWidth: cropped.sourceWidth,
      sourceHeight: cropped.sourceHeight,
      previewUrl: URL.createObjectURL(cropped.file),
      aspectRatio: BATCH_LOCAL_EDIT_RATIOS.includes(cropped.aspectRatio) ? cropped.aspectRatio : BATCH_LOCAL_EDIT_RATIOS[0],
      editMode: cropped.editMode || LOCAL_EDIT_RECT_MODE,
      maskDataUrl: cropped.maskDataUrl || "",
      maskBounds: cropped.maskBounds || null,
      brushSize: cropped.brushSize || LOCAL_EDIT_BRUSH_DEFAULT,
      maskOpacity: cropped.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT,
      appliedAt: Date.now()
    };
    const replace = (items) => items.map((current) => {
      if (current.id !== itemId) return current;
      if (current.localEdit?.previewUrl) URL.revokeObjectURL(current.localEdit.previewUrl);
      return { ...current, localEdit };
    });
    setModelImages(replace);
    updateSetting("aspectRatio", localEdit.aspectRatio);
    setLocalEditTarget(null);
    addEvent("局部回贴", `${uploadGroupLabel(group)} 已启用 ${localEdit.aspectRatio} ${localEdit.editMode === LOCAL_EDIT_MASK_MODE ? "涂抹蒙版" : "局部区域"}`);
  }

  function clearLocalEditItem(group, itemId) {
    if (group !== "model") {
      setLocalEditTarget(null);
      return;
    }
    const replace = (items) => items.map((current) => {
      if (current.id !== itemId) return current;
      if (current.localEdit?.previewUrl) URL.revokeObjectURL(current.localEdit.previewUrl);
      return { ...current, localEdit: null };
    });
    setModelImages(replace);
    setLocalEditTarget(null);
    addEvent("局部回贴", `${uploadGroupLabel(group)} 已取消局部回贴`);
  }

  async function applyGroupPreprocess(group, mode) {
    if (mode === "mixed") return;
    if (mode === "crop") {
      addEvent("手动裁剪", "请点单张图片的裁剪按钮调整裁剪区域");
      return;
    }
    updateSetting("preprocessMode", mode);
    const sourceItems = group === "model" ? modelImages : group === "clothing" ? clothingImages : referenceImages;
    if (!sourceItems.length) return;

    const nextItems = await Promise.all(sourceItems.map(async (item) => {
      try {
        const nextFile = await processImageFile(item.originalFile, settings.aspectRatio, mode);
        revokePreviewUrl(item);
        const nextItem = {
          ...item,
          file: nextFile,
          previewUrl: URL.createObjectURL(nextFile),
          mode
        };
        return nextItem;
      } catch (error) {
        addEvent("批量统一失败", `${item.name}：${error instanceof Error ? error.message : String(error)}`);
        return item;
      }
    }));

    if (group === "model") setModelImages(nextItems);
    if (group === "clothing") {
      setClothingImages(nextItems);
    }
    if (group === "reference") setReferenceImages(nextItems);
  }

  async function applyGlobalPreprocess(mode) {
    if (mode === "mixed") return;
    if (mode === "crop") {
      addEvent("手动裁剪", "请点单张图片的裁剪按钮调整裁剪区域");
      return;
    }
    if (allUploadImages.length === 0) {
      updateSetting("preprocessMode", mode);
      return;
    }
    await Promise.all([
      applyGroupPreprocess("model", mode),
      applyGroupPreprocess("clothing", mode),
      applyGroupPreprocess("reference", mode)
    ]);
    addEvent("统一处理", `已统一为${preprocessModeLabel(mode)}`);
  }

  function uploadGroupLabel(group) {
    if (group === "model") return "图1";
    if (group === "clothing") return "图2";
    return "图3";
  }

  function handleWorkspacePaste(event) {
    const pastedImages = imageFilesFromClipboard(event.clipboardData);
    if (pastedImages.length === 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("textarea,input,select")) return;
    event.preventDefault();
    void addImages(activeUploadGroup, pastedImages);
    addEvent("粘贴上传", `已加入${uploadGroupLabel(activeUploadGroup)}`);
  }

  function removeOriginalImage(id) {
    const target = originalLibrary.find((item) => item.id === id);
    if (target?.group && target?.sourceId) {
      removeImage(target.group, target.sourceId, { unlinkOriginal: false });
    }
    if (target?.url) URL.revokeObjectURL(target.url);
    setOriginalLibrary((current) => {
      return current.filter((item) => item.id !== id);
    });
  }

  function toggleTaskSelected(id) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedTaskIds(new Set());
  }

  function deleteSelected() {
    if (selectedTaskIds.size === 0) return;
    const ids = new Set(selectedTaskIds);
    setTasks((current) => {
      const removed = current.filter((task) => ids.has(task.id));
      revokeTaskResultRuntimeCaches(removed);
      return current.filter((task) => !ids.has(task.id));
    });
    clearSelection();
    addEvent("删除", `已删除 ${selectedTaskIds.size} 个队列项`);
  }

  function deleteResultTask(taskId) {
    const target = tasksRef.current.find((task) => task.id === taskId);
    if (!target) return;
    revokeTaskResultRuntimeCaches([target]);
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setSelectedTaskIds((current) => {
      if (!current.has(taskId)) return current;
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
    setBrokenTaskImages((current) => {
      if (!current[taskId]) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    if (preview?.id === taskId) setPreview(null);
    addEvent("删除", `已删除 #${target.order || ""} 结果图`);
  }

  /**
   * P1 缺图自愈：结果图真的加载失败时记下来，卡片改为显示可读原因，
   * 并且不再对同一个地址重复请求（避免每次打开页面都刷 404/502）。
   * 记录带失败时的地址，重刷换图后自动失效；同时写进任务记录，重载后依然生效。
   */
  function markTaskImageBroken(task) {
    const src = displayResultImageSource(task?.result);
    if (!task?.id || !src) return;
    const mark = { src, reason: brokenImageReason() };
    setBrokenTaskImages((current) => (
      current[task.id]?.src === src ? current : { ...current, [task.id]: mark }
    ));
    setTasks((current) => current.map((item) => (
      item.id === task.id && item.resultMissing?.src !== src ? { ...item, resultMissing: mark } : item
    )));
  }

  function clearAll() {
    if (tasks.length === 0) return;
    const confirmed = window.confirm("确定清空当前换装生成记录吗？上传图片和原图库不会被清空。");
    if (!confirmed) return;
    revokeTaskResultRuntimeCaches(tasks);
    setTasks([]);
    clearSelection();
    removeStorageItem(TASK_HISTORY_KEY);
    void persistTaskHistory([]);
    addEvent("清空", "生成队列已清空");
  }

  async function clearNonResultImageCache() {
    if (running) {
      addEvent("清理缓存", "当前正在生成，完成后再清理缓存");
      return;
    }
    const confirmed = window.confirm("清理上传图、缩略图和临时草稿缓存？生成结果图和指定文件夹里的图片不会删除。");
    if (!confirmed) return;

    const activeSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    const clearedActiveSnapshot = {
      ...activeSnapshot,
      settings: stripOutfitPageGlobalSettings({
        ...settings,
        // 图2换了，之前分析出来的服装事实不再适用：清掉事实本身，保留部位/层级/穿法选择。
        outfitIntent: { ...outfitIntent, facts: defaultOutfitIntent().facts, factsSource: { mode: "none", sourceId: "", analyzedAt: 0 } }
      })
    };
    const nextPages = ensureWorkflowPages(outfitPages.map((page) => {
      const sourcePage = page.id === activeOutfitPageId ? clearedActiveSnapshot : page;
      revokePageNonResultImageUrls(sourcePage);
      return stripPageNonResultImages(sourcePage);
    }), settings);

    setOutfitPages(nextPages);
    setModelImages([]);
    setClothingImages([]);
    setReferenceImages([]);
    setFixedClothingId("");
    setOriginalLibrary([]);
    setTasks((current) => current.map(stripTaskUploadImageCache));
    setCropTarget(null);
    setLocalEditTarget(null);
    setImageLightbox(null);
    setActiveUploadGroup("model");
    clearSelection();

    await outfitLocalSet(OUTFIT_DRAFT_DB_KEY, {
      activeId: activeOutfitPageId,
      pages: nextPages.map(serializeDraftPage),
      updatedAt: Date.now()
    });
    const deletedTempCacheCount = await outfitLocalDeleteByPrefix(OUTFIT_TEMP_IMAGE_CACHE_PREFIX);
    addEvent("清理缓存", `已清理上传图和临时缓存，结果图保留${deletedTempCacheCount ? `（临时缓存 ${deletedTempCacheCount} 项）` : ""}`);
  }

  async function refreshHistory() {
    const history = await readTaskHistoryAsync();
    const hydratedHistory = hydrateTasksWithUploadReferences(history, {
      modelImages,
      clothingImages,
      referenceImages
    });
    setTasks((current) => {
      const runningItems = current.filter(isLiveGenerationTask);
      return [...hydratedHistory, ...runningItems];
    });
    clearSelection();
    addEvent("刷新", `已载入 ${history.length} 张历史图片`);
  }

  // 保存目录域：实现在 src/features/savedir/save-directory.js（两侧同一份，语义等价）。
  // 这里只保留同名薄壳：每次 render 重建 deps，捕获最新的 state / setter / addEvent。
  const saveDirectoryDeps = {
    getSaveDirectory,
    setSaveDirectoryRequest,
    pickSaveDirectoryRequest,
    setSaveDirectory,
    setDirectoryDraft,
    setIsDirectoryModalOpen,
    setIsPickingDirectory,
    saveDirectory,
    directoryDraft,
    isPickingDirectory,
    notify: addEvent
  };
  async function refreshSaveDirectory() { return loadSaveDirectory(saveDirectoryDeps); }
  function openDirectoryModal() { openSaveDirectoryModal(saveDirectoryDeps); }
  async function confirmSaveDirectory() { return commitSaveDirectory(saveDirectoryDeps); }
  async function pickSaveDirectory() { return chooseSaveDirectory(saveDirectoryDeps); }

  function openSaveDirectory() {
    const directory = saveDirectory || directoryDraft;
    openSaveDirectoryRequest(directory).then((payload) => {
      setSaveDirectory(payload.directory);
      setDirectoryDraft((current) => current || payload.directory);
      addEvent("保存目录", "已打开");
    }).catch((error) => {
      addEvent("打开失败", error instanceof Error ? error.message : String(error));
    });
  }

  async function saveProcessedImageToFolder(file, subfolder = "", directoryOverride = "") {
    const directory = directoryOverride || saveDirectory || await refreshSaveDirectory();
    if (!directory) throw new Error("未找到指定文件夹");
    const form = new FormData();
    form.append("directory", directory);
    form.append("subfolder", String(subfolder ?? ""));
    form.append("image", file, file.name || "processed.jpg");
    const response = await fetch("/api/save-processed-image", {
      method: "POST",
      body: form
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || "保存整理后图片失败");
    }
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    return payload;
  }

  async function saveExportedImageToFolder(file, subfolder = RESIZE_OUTPUT_FOLDER) {
    return saveProcessedImageToFolder(file, subfolder);
  }


  function taskToDownloadItem(task, imageOverride = null) {
    return {
      id: task.id,
      image: imageOverride || task.result,
      prompt: task.prompt || "",
      modelLabel: task.modelLabel || settings.model,
      imageSize: task.imageSize || settings.imageSize,
      aspectRatio: task.aspectRatio || settings.aspectRatio,
      createdAt: task.finishedAt || task.createdAt || Date.now()
    };
  }


  function beginTaskImageDrag(event, task, fallbackIndex = null) {
    const src = imageSource(task?.result);
    beginImageDownloadDrag(event, src, taskDragDownloadName(task, fallbackIndex), task?.result);
    if (!src || !task?.id) return;
    const payload = { taskId: task.id, order: task.order || fallbackIndex || 0 };
    event.dataTransfer.setData(OUTFIT_RERUN_DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "copyMove";
    resultDragTaskIdRef.current = task.id;
    resultDragPayloadRef.current = payload;
  }

  function beginReferenceImageDrag(event, reference, index = 0) {
    const src = referenceSource(reference);
    beginImageDownloadDrag(event, src, reference?.name || reference?.label || `参考图-${index + 1}`);
  }

  function clearResultDragState() {
    resultDragTaskIdRef.current = "";
    resultDragPayloadRef.current = null;
    setResultReplaceTargetId("");
  }



  function resultDragTaskId(event) {
    try {
      const raw = event.dataTransfer?.getData?.(OUTFIT_RERUN_DRAG_MIME);
      if (!raw) return resultDragTaskIdRef.current || resultDragPayloadRef.current?.taskId || "";
      const payload = JSON.parse(raw);
      return String(payload?.taskId || resultDragPayloadRef.current?.taskId || "");
    } catch {
      return resultDragTaskIdRef.current || resultDragPayloadRef.current?.taskId || "";
    }
  }


  function flashDownloadFeedback(id) {
    if (!id) return;
    setDownloadFeedbackIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setDownloadFeedbackIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 1100);
  }

  function toggleSplitHalves() {
    const next = !splitHalves;
    setSplitHalves(next);
    writeSplitHalvesEnabled(next);
    setSplitNote(next ? "已开启：生成后会自动裁切并保存左右两张" : "已关闭：只输出整张结果图");
  }

  // 精修页结果图中线剪裁：只在这一页、且开关打开时生效，其它页面/其它 workflow 完全不受影响。
  // 与 3.0 的口径一致 —— 竖切中线、左右各存一张；只是 3.0 在服务端用 Pillow 切，
  // V11 服务端不做图像处理，所以这里用 canvas 切好再走既有的 /api/save-processed-image。
  async function splitWhiteRefineResult(task, image) {
    const source = image?.cachedFile instanceof File ? image.cachedFile : imageSource(image);
    if (!source) {
      setSplitNote("裁切失败：结果图地址不可用");
      return;
    }
    setSplitNote("正在从中线裁切…");
    try {
      const { halves, middle } = await splitImageIntoHalves(source);
      const sourceName = task?.savedFilename || task?.result?.archiveFile || "";
      const saved = [];
      for (const half of halves) {
        const file = new File([half.blob], splitHalvesFileName(half.label, sourceName), { type: "image/png" });
        // 直接放保存目录根（和 3.0 一样），不塞子目录。
        const payload = await saveProcessedImageToFolder(file, "");
        saved.push({ label: half.label, filename: payload?.filename || "", path: payload?.path || "" });
      }
      const names = saved.map((item) => `${item.label} ${item.filename}`).join("　");
      setSplitNote(`已裁切保存到：${saved[0]?.path ? saved[0].path.replace(/[\\/][^\\/]*$/, "") : ""}　${names}`);
      addEvent("精修裁切", `已从中线（第 ${middle}px）切成左右两张：${names}`);
    } catch (error) {
      setSplitNote(`裁切失败：${error instanceof Error ? error.message : String(error)}`);
      addEvent("精修裁切失败", error instanceof Error ? error.message : String(error));
    }
  }

  function renderSplitHalvesStrip() {
    return (
      <div className="whiteRefineSplit">
        <button
          className={`whiteRefineSplitSwitch ${splitHalves ? "on" : ""}`}
          type="button"
          aria-pressed={splitHalves ? "true" : "false"}
          onClick={toggleSplitHalves}
          title="把生成的结果从中线竖切成左右两张，分别保存"
        >
          <span>裁剪</span>
          <i><b /></i>
        </button>
        <span className="whiteRefineSplitNote">{splitNote}</span>
      </div>
    );
  }

  async function saveTaskImageToDirectory(task, imageOverride = null) {
    const image = imageOverride || task?.result;
    if (!task || !image) return null;
    const directory = saveDirectory || await refreshSaveDirectory();
    if (image.cachedFile instanceof File) {
      const payload = await saveProcessedImageToFolder(image.cachedFile, "", directory);
      return payload;
    }
    const response = await fetch("/api/save-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directory, item: taskToDownloadItem(task, image) })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || "保存图片失败");
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    return payload;
  }

  async function saveTaskImageToDirectoryViaBlob(task, imageOverride = null) {
    const image = imageOverride || task?.result;
    const src = imageSource(image);
    if (!task || !src) throw new Error("图片地址无效");
    const directory = saveDirectory || await refreshSaveDirectory();
    const blob = await fetchImageBlob(src, "图片下载失败");
    const file = fileFromBlob(blob, taskDragDownloadName(task), image?.mimeType || image?.archiveMime || "image/png");
    return saveProcessedImageToFolder(file, "", directory);
  }

  function markTaskSaved(taskId, payload, options = {}) {
    setTasks((current) => current.map((item) => item.id === taskId ? {
      ...item,
      savedFilename: payload?.filename || item.savedFilename || "",
      savedPath: payload?.path || item.savedPath || "",
      autoSaveFailed: false
    } : item));
    if (options.flash !== false) flashDownloadFeedback(taskId);
  }

  // 返回保存结果（payload 或 null）：调用方在"组件已卸载"时需要拿到 savedPath
  // 一起补登记进页面草稿，所以这里把结果返回出去（原来的 `void autoSaveTask(...)` 用法不受影响）。
  async function autoSaveTask(task, image) {
    try {
      const payload = await saveTaskImageToDirectory(task, image);
      markTaskSaved(task.id, payload, { flash: true });
      return payload;
    } catch (error) {
      try {
        const payload = await saveTaskImageToDirectoryViaBlob(task, image);
        markTaskSaved(task.id, payload, { flash: true });
        addEvent("自动保存兜底", "已通过本地代理重新保存结果图");
        return payload;
      } catch (fallbackError) {
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, autoSaveFailed: true } : item));
        addEvent("自动保存失败", fallbackError instanceof Error ? fallbackError.message : (error instanceof Error ? error.message : String(error)));
        return null;
      }
    }
  }

  async function downloadTask(task) {
    if (!task?.result) return;
    try {
      const payload = await saveTaskImageToDirectory(task);
      markTaskSaved(task.id, payload, { flash: true });
      addEvent("下载", `已保存为 ${payload.filename}`);
    } catch (error) {
      try {
        const payload = await saveTaskImageToDirectoryViaBlob(task);
        markTaskSaved(task.id, payload, { flash: true });
        addEvent("下载兜底", `已保存为 ${payload.filename}`);
      } catch (fallbackError) {
        addEvent("下载失败", fallbackError instanceof Error ? fallbackError.message : (error instanceof Error ? error.message : String(error)));
      }
    }
  }

  function downloadSelected() {
    const targets = tasks.filter((task) => selectedTaskIds.has(task.id) && task.result);
    targets.forEach((task) => void downloadTask(task));
    if (targets.length > 0) addEvent("下载选中", `已提交 ${targets.length} 张保存任务`);
  }

  function downloadAll() {
    const targets = tasks.filter((task) => task.result);
    targets.forEach((task) => void downloadTask(task));
    if (targets.length > 0) addEvent("下载全部", `已提交 ${targets.length} 张保存任务`);
  }

  function changeGalleryZoom(delta) {
    setGalleryZoom((current) => Math.max(0.75, Math.min(1.45, Number((current + delta).toFixed(2)))));
  }

  // 实现在 src/shared/dom-actions.js（两侧同一份，20 行逐字节一致）。
  // 这里只保留闭包绑定壳：捕获本组件的 addEvent，14 处调用点因此无需改动。
  const copyText = (text, successMessage = "已复制") =>
    copyTextToClipboard(text, { successMessage, notify: addEvent });

  function closePreviewModal() {
    setPreview(null);
    setImageLightbox(null);
  }

  function navigatePreview(direction) {
    if (!preview || resultPreviewTasks.length <= 1) return;
    const currentIndex = resultPreviewTasks.findIndex((task) => task.id === preview.id);
    if (currentIndex < 0) return;
    const nextIndex = (currentIndex + direction + resultPreviewTasks.length) % resultPreviewTasks.length;
    setPreview(resultPreviewTasks[nextIndex]);
  }

  function zoomPreviewByWheel(event) {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.12 : 0.12;
    setPreviewZoom((current) => Math.max(0.35, Math.min(5, Number((current + delta).toFixed(2)))));
  }

  function startPreviewDrag(event) {
    const drag = previewDragStart(event, previewPan);
    if (drag) previewDragRef.current = drag;
  }

  function movePreviewDrag(event) {
    const drag = previewDragRef.current;
    if (!drag?.active) return;
    const { pan, moved } = previewPanFromDrag(drag, event);
    if (moved) drag.moved = true;
    setPreviewPan(pan);
  }

  function endPreviewDrag(event) {
    const drag = previewDragRef.current;
    if (!drag?.active) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    previewDragRef.current = null;
    if (!drag.moved) closePreviewModal();
  }

  function clothingForIndex(index) {
    if (settings.pairingMode === "fixed") return selectedFixedClothing;
    if (settings.pairingMode === "sequence") return activeClothes[index] || null;
    if (settings.pairingMode === "cycle") return activeClothes.length ? activeClothes[index % activeClothes.length] : null;
    return selectedFixedClothing;
  }

function modelForIndex(index) {
  if (!activeModels.length) return null;
  if (generationCount === "auto") return activeModels[index] || null;
  return activeModels[index] || activeModels[index % activeModels.length];
}

function buildTasks(countOverride = plannedGenerationCount) {
    const count = Math.min(countOverride, outfitMaxImages);
    const referenceMentioned = mentionsOptionalReferenceImage(settings.prompt, settings.productNote);
    const selectedReferences = isOutpaintWorkflow || isWhiteRefineWorkflow || isRandomBackgroundWorkflow
      ? []
      : (!isOutfitWorkflow && !isPoseRemixWorkflow) || referenceMentioned
        ? referenceImages.filter((item) => item.selected)
        : [];
    const outpaintReferenceItems = [];
    return Array.from({ length: count }, (_, index) => {
      const modelItem = isDesignDraftWorkflow ? activeModels[0] : modelForIndex(index);
      // 设计稿与精修都是「多图进、一张出」：图1 的其余几张要作为图2…图N 一起带上去。
      const extraModelItems = isDesignDraftWorkflow || isWhiteRefineWorkflow ? activeModels.slice(1) : [];
      const clothingItem = isOutpaintWorkflow || isRandomBackgroundWorkflow ? null : clothingForIndex(index);
      const extraClothingItems = isRecolorWorkflow || isWhiteRefineWorkflow
        ? activeClothes.filter((item) => item.id !== clothingItem?.id)
        : [];
      const localEdit = !isDesignDraftWorkflow && !isPoseRemixWorkflow && !isOutpaintWorkflow && !isWhiteRefineWorkflow && !isRandomBackgroundWorkflow && modelItem?.localEdit?.cropFile && modelItem?.localEdit?.cropRect ? modelItem.localEdit : null;
      const cropReturn = !localEdit && !isDesignDraftWorkflow && !isPoseRemixWorkflow && !isOutpaintWorkflow && !isWhiteRefineWorkflow && !isRandomBackgroundWorkflow && modelItem?.cropReturn?.cropRect
        ? normalizeCropReturnMeta(modelItem.cropReturn)
        : null;
      const qualityCheckEnabled = !isOutpaintWorkflow && !isWhiteRefineWorkflow && !isRandomBackgroundWorkflow && normalizeQualityCheck(settings.qualityCheck);
      return {
        id: makeId(`task_${index + 1}`),
        sessionId: OUTFIT_SESSION_ID,
        order: index + 1,
        modelItem,
        extraModelItems,
        clothingItem,
        extraClothingItems,
        outpaintReferenceItems,
        referenceItems: selectedReferences,
        localEdit,
        cropReturn,
        workflowMode,
        pageName: activeOutfitPage.name,
        uploadLabels,
        modelImageCount: isDesignDraftWorkflow || isWhiteRefineWorkflow ? activeModels.length : 1,
        status: "queued",
        error: "",
        result: null,
        runtimeStage: "等待调度",
        runtimeDetail: "",
        runtimeUpdatedAt: Date.now(),
        qualityCheckEnabled,
        qualityCheck: qualityCheckEnabled
          ? { status: "pending", summary: "等待生成后 AI质检" }
          : null,
        prompt: "",
        timingMs: null,
        createdAt: Date.now() + index,
        imageSize: settings.imageSize,
        aspectRatio: localEdit?.aspectRatio || cropReturn?.aspectRatio || settings.aspectRatio,
        garmentParts: isRecolorWorkflow ? normalizeGarmentParts(settings.garmentParts) : undefined,
        garmentComposition: isRecolorWorkflow ? normalizeGarmentComposition(settings.garmentComposition, settings.garmentParts) : undefined,
        randomBackgroundFocus: isRandomBackgroundWorkflow ? normalizeRandomBackgroundFocus(settings.randomBackgroundFocus) : undefined,
        // 中文注释：把本轮结构化换装意图（部位 / 上装层级 / 穿法 / 图2事实）冻结在任务快照里。
        // 批次开始后再改界面，只影响下一批，不会改到在途任务的提示词。
        outfitIntent: isOutfitWorkflow ? normalizeOutfitIntent(settings.outfitIntent) : undefined,
        // 精修结构化意图同样冻结进任务快照：批次开始后改界面不会改到在途任务。
        retouchIntent: isWhiteRefineWorkflow ? normalizeRetouchIntent(settings.retouchIntent) : undefined,
        pairingMode: settings.pairingMode,
        modelLabel: activeModel.label,
        modelName: modelItem?.name || "",
        clothingName: clothingItem?.name || "",
        referenceNames: [
          ...extraModelItems.map((item) => item.name),
          ...extraClothingItems.map((item) => item.name),
          ...selectedReferences.map((item) => item.name)
        ].filter(Boolean)
      };
    }).filter((task) => task.modelItem && (isOutpaintWorkflow || isWhiteRefineWorkflow || isRandomBackgroundWorkflow || task.clothingItem));
  }

  // 中文注释：生成结果先显示，AI质检后台补标记，避免质检耗时拖慢图片接收。
  async function runTaskQualityCheck(task, modelUploadFile, resultImage, taskAspectRatio, prompt) {
    if (!task?.qualityCheckEnabled) return;
    if (["outpaint", "white-refine", "random-background"].includes(task.workflowMode || workflowMode)) return;
    setTasks((current) => current.map((item) => item.id === task.id ? {
      ...item,
      qualityCheck: {
        status: "checking",
        summary: "AI质检员正在检查脸部、姿态和服装一致性"
      }
    } : item));

    try {
      const resultBlob = await blobFromOutfitImage(resultImage);
      const resultType = resultBlob.type || resultImage?.mimeType || "image/png";
      const resultFile = new File([resultBlob], `result_${task.order}.${imageExtension(resultType)}`, {
        type: resultType,
        lastModified: Date.now()
      });
      const form = new FormData();
      const qualityClothingFile = imageItemUploadFile(task.clothingItem);
      form.append("payload", JSON.stringify({
        apiKey: effectiveApiKey,
        workflowMode: task.workflowMode || workflowMode,
        pageName: task.pageName || activeOutfitPage.name,
        prompt: prompt || task.prompt || settings.prompt,
        productNote: settings.productNote,
        model: settings.model,
        imageSize: task.imageSize || settings.imageSize,
        aspectRatio: taskAspectRatio || task.aspectRatio || settings.aspectRatio,
        uploadLabels: task.uploadLabels || uploadLabels
      }));
      form.append("image1", modelUploadFile, `image1_${task.order}_${task.modelItem.name || "pose"}`);
      if (qualityClothingFile instanceof Blob) {
        form.append("image2", qualityClothingFile, `image2_${task.order}_${task.clothingItem.name || "master"}`);
      }
      form.append("result", resultFile, resultFile.name);
      (task.referenceItems || []).forEach((item, index) => {
        const file = imageItemUploadFile(item);
        if (file instanceof Blob) form.append("reference", file, `reference_${index + 1}_${item.name || "ref"}`);
      });

      const payload = await checkOutfitQuality(form);
      const qualityCheck = normalizeQualityCheckResult({
        ...payload,
        status: payload.pass ? "passed" : "failed",
        checkedAt: Date.now()
      });
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, qualityCheck } : item));
    } catch (error) {
      const summary = error instanceof Error ? error.message : String(error);
      setTasks((current) => current.map((item) => item.id === task.id ? {
        ...item,
        qualityCheck: normalizeQualityCheckResult({
          status: "error",
          summary: `AI质检失败：${summary}`,
          checkedAt: Date.now()
        })
      } : item));
      addEvent("AI质检失败", summary);
    }
  }

  async function runSingleTask(task) {
    const startedAt = Date.now();
    const taskWorkflowMode = task.workflowMode || workflowMode;
    const taskIsOutpaint = taskWorkflowMode === "outpaint";
    const taskIsWhiteRefine = taskWorkflowMode === "white-refine";
    const taskIsRandomBackground = taskWorkflowMode === "random-background";
    const taskIsOutfit = taskWorkflowMode === "outfit";
    const taskIsRecolor = taskWorkflowMode === "recolor";
    const taskModelFile = imageItemUploadFile(task.modelItem);
    const taskClothingFile = imageItemUploadFile(task.clothingItem);
    let localEdit = taskIsOutpaint || taskIsWhiteRefine || taskIsRandomBackground
      ? null
      : task.localEdit?.cropFile && task.localEdit?.cropRect
        ? task.localEdit
        : task.modelItem?.localEdit?.cropFile && task.modelItem?.localEdit?.cropRect
          ? task.modelItem.localEdit
          : null;
    setClockNow(startedAt);
    const runningPatch = {
      sessionId: OUTFIT_SESSION_ID,
      status: "running",
      startedAt,
      error: "",
      errorDetail: "",
      runtimeStage: "准备任务",
      runtimeDetail: task.modelItem?.name ? `图1 ${task.modelItem.name}` : "",
      runtimeUpdatedAt: startedAt
    };
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, ...runningPatch } : item)));
    // 跨挂载周期账本：切走再切回来时这一条继续显示"生成中"。
    publishOutfitLiveRun({ ...task, ...runningPatch });
    if (localEdit) {
      updateTaskRuntime(task.id, "本地预处理", "重新裁剪局部回贴区域");
      localEdit = await localEditPrepareLimiterRef.current(() => prepareOutfitTaskLocalEdit(task, localEdit, settings.model, task.localEditBatchMode || ""));
      updateTaskRuntime(task.id, "本地预处理完成", `局部图 ${fileSize(localEdit.cropFile?.size || 0)}`);
    }
    if (!taskModelFile) {
      throw new Error("缺少图1原始上传图，无法生成");
    }
    if (!taskIsOutpaint && !taskIsWhiteRefine && !taskIsRandomBackground && !taskClothingFile) {
      throw new Error("缺少图2原始上传图，无法生成");
    }
    const taskAspectRatio = localEdit?.aspectRatio || task.aspectRatio || settings.aspectRatio;
    if (!localEdit) {
      updateTaskRuntime(task.id, "图片比例处理", `${taskAspectRatio} 上传准备`);
    }
    const outpaintUploadMeta = !localEdit && taskIsOutpaint
      ? await prepareOutpaintUploadCanvas(taskModelFile, taskAspectRatio)
      : null;
    const modelUploadFile = localEdit?.cropFile || (taskIsOutpaint
      ? outpaintUploadMeta?.file
      : await ensureOutfitUploadCanvasRatio(taskModelFile, taskAspectRatio));
    const localEditTaskBinding = localEdit
      ? localEditTaskBindingSnapshot(task, localEdit, taskAspectRatio, modelUploadFile)
      : null;
    updateTaskRuntime(
      task.id,
      "等待中转站返回",
      taskIsOutpaint
        ? `图1 ${fileSize(modelUploadFile?.size || 0)} · 蒙版 ${fileSize(outpaintUploadMeta?.maskFile?.size || 0)}`
        : taskIsWhiteRefine
          ? `图1 ${fileSize(modelUploadFile?.size || 0)} · 参考图 ${(taskClothingFile ? 1 : 0) + (task.extraClothingItems || []).length} 张`
          : taskIsRandomBackground
            ? `图1 ${fileSize(modelUploadFile?.size || 0)} · 场景补充`
            : `图1 ${fileSize(modelUploadFile?.size || 0)} · 图2 ${fileSize(taskClothingFile?.size || 0)}`
    );

    const form = new FormData();
    form.append("payload", JSON.stringify({
      taskId: task.id,
      apiKey: effectiveApiKey,
      // canonical 路由字段：批量换装同样必须带 model / channelId / dispatchMode。
      ...routingFields(settings.model, settings.channelId, config.routing || config),
      imageSize: settings.imageSize,
      aspectRatio: taskAspectRatio,
      prompt: settings.prompt,
      productNote: settings.productNote,
      smartIntervention: settings.smartIntervention,
      garmentParts: taskIsRecolor ? normalizeGarmentParts(task.garmentParts || settings.garmentParts) : undefined,
      garmentComposition: taskIsRecolor ? normalizeGarmentComposition(task.garmentComposition || settings.garmentComposition, task.garmentParts || settings.garmentParts) : undefined,
      randomBackgroundFocus: taskIsRandomBackground ? normalizeRandomBackgroundFocus(task.randomBackgroundFocus || settings.randomBackgroundFocus) : undefined,
      // 结构化换装意图：只认任务快照（批次开始后就冻结），不再读当前界面设置。
      outfitIntent: taskIsOutfit ? normalizeOutfitIntent(task.outfitIntent || settings.outfitIntent) : undefined,
      // 精修结构化意图：同样只认任务快照（冻结），批次开始后改界面不影响在途任务。
      retouchIntent: taskIsWhiteRefine ? normalizeRetouchIntent(task.retouchIntent || settings.retouchIntent) : undefined,
      workflowMode: taskWorkflowMode,
      pageName: task.pageName || activeOutfitPage.name,
      uploadLabels: task.uploadLabels || uploadLabels,
      modelImageCount: task.modelImageCount || 1,
      colorReferenceCount: taskWorkflowMode === "recolor" ? (task.extraClothingItems || []).length : 0,
      whiteRefineReferenceCount: taskIsWhiteRefine ? (taskClothingFile ? 1 : 0) + (task.extraClothingItems || []).length : 0,
      outpaintReferenceCount: 0,
      referenceCount: taskIsOutpaint || taskIsWhiteRefine || taskIsRandomBackground ? 0 : (task.referenceItems || []).length,
      pairingMode: task.pairingMode || settings.pairingMode,
      preprocessMode: settings.preprocessMode,
      deferAutoSave: Boolean(localEdit || taskIsOutpaint),
      localEdit: localEdit ? {
        enabled: true,
        editMode: localEdit.editMode || LOCAL_EDIT_RECT_MODE,
        aspectRatio: taskAspectRatio,
        cropRect: localEdit.cropRect,
        contextRect: localEdit.contextRect || null,
        sourceWidth: localEdit.sourceWidth,
        sourceHeight: localEdit.sourceHeight,
        maskBounds: localEdit.maskBounds || null
      } : null
    }));
    form.append("image", modelUploadFile, `model_${task.order}_${task.modelItem.name}`);
    if (taskIsOutpaint && outpaintUploadMeta?.maskFile instanceof File) {
      form.append("mask", outpaintUploadMeta.maskFile, `mask_${task.order}_${task.modelItem.name}`);
    }
    // 设计稿 / 精修：图1 上传区可能有多张（精修是「多图生图」），其余几张按 图2…图N 一起发上去。
    if (taskWorkflowMode === "design-draft" || taskIsWhiteRefine) {
      (task.extraModelItems || []).forEach((item, index) => {
        const file = imageItemUploadFile(item);
        if (file instanceof Blob) form.append("image", file, `model_ref_${index + 2}_${item.name}`);
      });
    }
    if (!taskIsOutpaint && taskClothingFile instanceof Blob) {
      form.append("image", taskClothingFile, `clothing_${task.order}_${task.clothingItem.name}`);
    }
    if (!taskIsOutpaint && (taskWorkflowMode === "recolor" || taskIsWhiteRefine)) {
      (task.extraClothingItems || []).forEach((item, index) => {
        const file = imageItemUploadFile(item);
        if (file instanceof Blob) form.append("image", file, `${taskIsWhiteRefine ? "white_refine_ref" : "color_ref"}_${index + 2}_${item.name}`);
      });
    }
    (taskIsOutpaint || taskIsWhiteRefine || taskIsRandomBackground ? [] : (task.referenceItems || [])).forEach((item, index) => {
      const file = imageItemUploadFile(item);
      if (file instanceof Blob) form.append("image", file, `ref_${index + 1}_${item.name}`);
    });

    const payload = await generateOutfit(form);
    const finishedAt = Date.now();
    const timingMs = Number.isFinite(payload.timingMs) && payload.timingMs > 0
      ? payload.timingMs
      : Math.max(1, finishedAt - startedAt);
    updateTaskRuntime(task.id, "模型已返回", `接口耗时 ${formatMs(timingMs)}`);
    // 上游 200 但没有图片：明确报"响应缺少图片"，而不是走到后面才炸成未知错误。
    if (!payload?.image) {
      throw Object.assign(
        new Error(formatGenerationError(describeEmptyResult({ requestId: payload?.requestId || payload?.taskId || task.id, status: 200 }))),
        { generationErrorInfo: describeEmptyResult({ requestId: payload?.requestId || payload?.taskId || task.id, status: 200 }) }
      );
    }
    let resultImage = payload.image;
    let displayImage = null;
    if (localEdit) {
      updateTaskRuntime(task.id, "本地贴回合成", "下载模型结果并贴回原图");
      // 贴回底图必须与选框坐标同一张图：选框/裁剪都是按 originalFile（原图）算的。
      // 不能用 imageItemUploadFile()（那是"上传副本优先"，>4MB 的原图会被压到长边 3072）。
      // 用错会在 3072 画布上贴 3500 坐标的选框：输出尺寸掉到 3072、补丁放大并偏移。
      const originalFile = resolveLocalEditBaseFile(task.modelItem);
      if (!originalFile) throw new Error("缺少图1原图，无法把局部结果贴回");
      const generatedBlob = await blobFromOutfitImage(payload.image);
      // 2026-09-25 对齐 3.0：贴回不再做任何后处理（自动对齐 / 颜色匹配 /
      // 中性色调匹配 / 羽化 / 护脸护身）。3.0 localPaste.ts 的契约是"贴回就是贴回"。
      const localCompositeOptions = {};
      const { blob: composedBlob, diagnostics: localEditDiagnostics } = await composeOutfitLocalEditBlob(originalFile, generatedBlob, localEdit.cropRect, localEdit, {
        ...localCompositeOptions,
        returnDiagnostics: true
      });
      localEditDiagnostics.taskBinding = localEditTaskBinding;
      // 尺寸对账单：底图（我给的图）/ 选框 / 上传副本 / 贴回输出。
      // 用户口径是"我给的图多少尺寸，返回的就是多少尺寸"，这里把四个数写进任务日志，
      // 以后出现"尺寸不对/偏移"的争议可以直接拿日志核对，不用靠肉眼判断。
      const localPasteSizes = localPasteSizeReport({
        base: { width: localEditDiagnostics.sourceWidth, height: localEditDiagnostics.sourceHeight },
        rect: localEditDiagnostics.pasteRect,
        output: { width: localEditDiagnostics.sourceWidth, height: localEditDiagnostics.sourceHeight }
      });
      emitClientDiagnosticEvent({
        requestId: task.id,
        stage: "client-generation-local-paste-composed",
        endpoint: "/api/generate-outfit",
        method: "COMPOSE",
        ok: true,
        detail: {
          taskId: task.id,
          baseName: task.modelItem?.name || "",
          localPaste: localPasteSizes
        }
      });
      if (!localPasteSizes.matches) {
        addEvent("贴回尺寸异常", `底图 ${localPasteSizes.base || "?"} → 输出 ${localPasteSizes.output || "?"}`);
      }
      const cachedUrl = createDocumentObjectUrl(composedBlob);
      const composedFile = fileFromBlob(
        composedBlob,
        `${fileBaseName(task.modelItem?.name || `task_${task.order}`)}_局部贴回`,
        "image/png"
      );
      const localCache = await cacheTaskResultImageFile(composedFile, task.id).catch((error) => {
        addEvent("结果缓存失败", error instanceof Error ? error.message : String(error));
        return null;
      });
      updateTaskRuntime(task.id, "本地贴回完成", `输出 ${fileSize(composedBlob.size || 0)}`);
      resultImage = {
        type: localCache?.localUrl ? "url" : "local_blob",
        value: localCache?.localUrl || cachedUrl,
        localUrl: localCache?.localUrl || "",
        archiveMime: localCache?.mimeType || composedBlob.type || "image/png",
        mimeType: localCache?.mimeType || composedBlob.type || "image/png",
        cachedUrl,
        cachedBlob: composedBlob,
        cachedFile: composedFile,
        localEdit: {
          enabled: true,
          editMode: localEdit.editMode || LOCAL_EDIT_RECT_MODE,
          sourceName: task.modelItem?.name || "",
          cropRect: localEdit.cropRect,
          contextRect: localEdit.contextRect || null,
          sourceWidth: localEdit.sourceWidth,
          sourceHeight: localEdit.sourceHeight,
          maskBounds: localEdit.maskBounds || null,
          diagnostics: localEditDiagnostics
        }
      };
      displayImage = resultImage;
    } else if (taskIsOutpaint && outpaintUploadMeta?.originalRect) {
      updateTaskRuntime(task.id, "本地原图保护", "下载扩图结果并覆盖回图1原有区域");
      const originalFile = imageItemUploadFile(task.modelItem);
      const generatedBlob = await blobFromOutfitImage(payload.image);
      const { blob: outpaintBlob, diagnostics: outpaintDiagnostics } = await composeOutpaintOriginalRegionBlob(
        originalFile,
        generatedBlob,
        outpaintUploadMeta,
        { returnDiagnostics: true }
      );
      const cachedUrl = createDocumentObjectUrl(outpaintBlob);
      const outpaintFile = fileFromBlob(
        outpaintBlob,
        `${fileBaseName(task.modelItem?.name || `task_${task.order}`)}_扩图原图保护`,
        "image/png"
      );
      const localCache = await cacheTaskResultImageFile(outpaintFile, task.id).catch((error) => {
        addEvent("结果缓存失败", error instanceof Error ? error.message : String(error));
        return null;
      });
      updateTaskRuntime(task.id, "原图保护完成", `输出 ${fileSize(outpaintBlob.size || 0)}`);
      resultImage = {
        type: localCache?.localUrl ? "url" : "local_blob",
        value: localCache?.localUrl || cachedUrl,
        localUrl: localCache?.localUrl || "",
        archiveMime: localCache?.mimeType || outpaintBlob.type || "image/png",
        mimeType: localCache?.mimeType || outpaintBlob.type || "image/png",
        cachedUrl,
        cachedBlob: outpaintBlob,
        cachedFile: outpaintFile,
        outpaint: {
          originalLocked: true,
          sourceName: task.modelItem?.name || "",
          originalRect: outpaintUploadMeta.originalRect,
          blankRect: outpaintUploadMeta.blankRect || null,
          maskRect: outpaintUploadMeta.maskRect || null,
          maskOverlapHeight: outpaintUploadMeta.maskOverlapHeight || 0,
          sourceWidth: outpaintUploadMeta.sourceWidth,
          sourceHeight: outpaintUploadMeta.sourceHeight,
          diagnostics: outpaintDiagnostics
        }
      };
      displayImage = resultImage;
    } else if (task.cropReturn?.cropRect) {
      updateTaskRuntime(task.id, "裁剪回流合成", "回填到原图裁剪坐标");

      // 回流画布的底图必须和 cropRect 同源：cropRect / sourceWidth 是 CropModal
      // 拿 item.originalFile（原图）算出来的（见 CropModal 的 confirm → processor(item.originalFile, …)），
      // 而 imageItemUploadFile() 取的是 item.file —— 裁剪后它已经**被裁剪结果替换**，
      // 拿它当底图会让画布变成裁剪后的尺寸、cropRect 被 constrainLocalEditRect 夹到 (0,0)，
      // 与「回流到大图」名实不符（V11-RF-047）。
      // ⇒ 与上方 localEdit 贴回链一致，统一走 resolveLocalEditBaseFile（原图优先，
      //   没有 originalFile 时兜底回 file，旧草稿不会因此变差）。
      const originalFile = resolveLocalEditBaseFile(task.modelItem);
      const generatedBlob = await blobFromOutfitImage(payload.image);
      const { blob: cropReturnBlob, diagnostics: cropReturnDiagnostics } = await composeCropReturnBlob(originalFile, generatedBlob, task.cropReturn);
      const dataUrl = await dataUrlFromBlob(cropReturnBlob);
      const cachedUrl = createDocumentObjectUrl(cropReturnBlob);
      const cropReturnMeta = normalizeCropReturnMeta({
        ...task.cropReturn,
        diagnostics: cropReturnDiagnostics
      });
      resultImage = {
        type: "b64_json",
        value: dataUrl,
        mimeType: "image/jpeg",
        cachedUrl,
        cropReturn: {
          ...cropReturnMeta,
          diagnostics: cropReturnDiagnostics
        }
      };
      displayImage = resultImage;
    } else {
      // 中文注释：普通结果先用接口返回地址显示，二次下载和 IndexedDB 缓存交给后台 effect，减少“生成完成后还要等一下”的体感。
      displayImage = resultImage;
    }
    setClockNow(finishedAt);
    // 这一条完成后的完整任务快照：既用于 setState，也用于"组件已被卸载"时的补登记。
    const finishedTaskPatch = {
      status: "success",
      result: displayImage,
      prompt: payload.prompt,
      timingMs,
      error: "",
      errorDetail: "",
      runtimeStage: "完成",
      runtimeDetail: `总耗时 ${formatMs(timingMs)}`,
      runtimeUpdatedAt: finishedAt,
      autoSaveFailed: false,
      finishedAt,
      cropReturn: normalizeCropReturnMeta(task.cropReturn),
      aspectRatio: taskAspectRatio
    };
    const finishedTaskForSave = {
      ...task,
      ...finishedTaskPatch,
      result: resultImage,
      cropReturn: normalizeCropReturnMeta(task.cropReturn)
    };
    setTasks((current) => current.map((item) => {
      if (item.id !== task.id) return item;
      if (item.result?.cachedUrl && item.result.cachedUrl !== displayImage?.cachedUrl) {
        revokeResultImageRuntimeCache(item.result);
      }
      return {
        ...item,
        ...finishedTaskPatch,
        qualityCheck: item.qualityCheckEnabled
          ? { ...(item.qualityCheck || {}), status: "checking", summary: "生成完成，AI质检员正在检查" }
          : null
      };
    }));
    const autoSavePromise = autoSaveTask(finishedTaskForSave, resultImage);
    // 精修页：结果图自动再从中线裁成左右两张（开关默认开，和 3.0 一样）。
    // 用**任务自己记录的 workflowMode**判断，避免生成过程中切页导致误裁别的页面。
    if (taskIsWhiteRefine && splitHalves) {
      void autoSavePromise.then(() => splitWhiteRefineResult(finishedTaskForSave, resultImage));
    }
    if (task.qualityCheckEnabled) {
      void runTaskQualityCheck({ ...task, prompt: payload.prompt, result: resultImage }, modelUploadFile, resultImage, taskAspectRatio, payload.prompt);
    }
    // 跨挂载周期账本：先记下这一条已经完成，切走又切回来时能立刻收敛成结果。
    publishOutfitLiveRun(finishedTaskForSave);
    // 保存完成后再补发一次：把保存文件名 / 保存路径同步给页面（含重挂载后的页面）。
    void autoSavePromise.then((saved) => {
      if (!saved) return;
      publishOutfitLiveRun({
        ...finishedTaskForSave,
        savedFilename: saved.filename || finishedTaskForSave.savedFilename || "",
        savedPath: saved.path || finishedTaskForSave.savedPath || "",
        autoSaveFailed: false
      });
    });
    // 用户此刻没有在看这一条（切走了左侧页面，或切到了别的批量分区）：
    // 上面的 setState 不会生效，这里把结果直接补登记进页面草稿，保证切回来还能看到、能下载。
    if (!outfitMountedRef.current || !visibleTaskIdsRef.current.has(task.id)) {
      void persistFinishedTaskWhileDetached(finishedTaskForSave, autoSavePromise);
    }
  }

  async function startBatch() {
    if (running && !canAppendWhileRunning) return;
    // 批量换装必须先选部位：没选部位时服务端会 400，这里提前拦住并给中文提示。
    if (isOutfitWorkflow) {
      const intentCheck = validateOutfitIntent(outfitIntent);
      if (!intentCheck.ok) {
        addEvent("换装设置", intentCheck.errors[0] || "请至少选择一个更换部位");
        setInlineMessage(intentCheck.errors[0] || "请至少选择一个更换部位，再生成");
        return;
      }
    }
    if (!effectiveApiKey) {
      addEvent("缺少 Key", "请先填写 API Key");
      openSettings();
      return;
    }
    if (isRandomBackgroundWorkflow && !String(settings.productNote || "").trim()) {
      addEvent("随机背景", "未填写场景补充，本轮先按干净真实电商实景背景生成；想指定风格时再补场景需求。");
    }
    // 精修：提交前再自检一次结构化意图（枚举/版本），不合法的直接拦下并提示，
    // 避免把非法枚举发到服务端换一个 400。
    if (isWhiteRefineWorkflow) {
      const retouchCheck = validateRetouchIntent(retouchIntent);
      if (!retouchCheck.ok) {
        addEvent("精修设置", retouchCheck.errors[0] || "精修设置不合法");
        setInlineMessage(retouchCheck.errors[0] || "精修设置不合法");
        return;
      }
    }
    const taskCount = isDesignDraftWorkflow ? 1 : Math.min(plannedGenerationCount, outfitMaxImages);
    const baseOrder = tasks.length;
    const taskDrafts = buildTasks(taskCount).map((task, index) => ({
      ...task,
      order: baseOrder + index + 1
    }));
    const nextTasks = await Promise.all(taskDrafts.map((task) => attachTaskReferenceThumbs(task).catch(() => task)));
    if ((isOutfitWorkflow || isPoseRemixWorkflow) && referenceImages.some((item) => item.selected) && !mentionsOptionalReferenceImage(settings.prompt, settings.productNote)) {
      addEvent("图3未参与", isPoseRemixWorkflow
        ? "补充提示词未说明图3用途，本轮不上传图3，避免影响图1姿态和图2母版。"
        : "补充提示词未说明图3用途，本轮不上传图3，避免影响图2服装。");
    }
    if (!nextTasks.length) {
      addEvent("无法开始", isDesignDraftWorkflow
        ? "至少上传 1 张图1实拍参考和 1 张图2设计稿参考"
        : isPoseRemixWorkflow
          ? "至少上传 1 张图1姿态参考图和 1 张图2固定母版成片"
            : isRandomBackgroundWorkflow
              ? "至少上传 1 张图1人物图"
              : isBackgroundChangeWorkflow
                ? "至少上传 1 张图1人物图和 1 张图2场景图"
        : isOutpaintWorkflow
          ? "至少上传 1 张图1待扩图原图"
          : isWhiteRefineWorkflow
            ? "至少上传 1 张图1平铺图/挂拍图；图2参考图可选"
          : isRecolorWorkflow
                  ? "至少上传 1 张图1原图和 1 张图2颜色参考图"
                  : isFaceSwapWorkflow
                    ? "至少上传 1 张图1目标人物图和 1 张图2人脸参考图"
                    : isLocalDetailWorkflow
                      ? "至少上传 1 张图1待回贴图和 1 张图2细节结构参考图"
                      : "至少选择 1 张模特图和 1 张服装图");
      return;
    }
    if (isLocalDetailWorkflow && nextTasks.some((task) => !task.localEdit)) {
      addEvent("局部回贴", "请先在图1缩略图下方点“局部回贴”，框选或涂抹要修改的服装细节区域");
      return;
    }
    if (!isDesignDraftWorkflow && nextTasks.length < plannedGenerationCount) {
      addEvent(workflowEventTitle, `按当前配对规则只能创建 ${nextTasks.length}/${plannedGenerationCount} 个任务`);
    }

    const hasLocalEditBatch = nextTasks.some((task) => task.localEdit?.cropFile && task.localEdit?.cropRect);
    const configuredWorkerCount = Math.max(1, Math.min(normalizeBatchConcurrency(settings.concurrency), nextTasks.length));
    const localEditWorkerCount = Math.max(1, Math.min(LOCAL_EDIT_BATCH_CONCURRENCY, configuredWorkerCount, nextTasks.length));
    const runMode = hasLocalEditBatch ? `controlled-${localEditWorkerCount}` : "parallel";
    const runnableTasks = nextTasks.map((task) => ({
      ...task,
      localEditBatchMode: runMode
    }));
    setTasks((current) => [...current, ...runnableTasks]);
    // 记进跨挂载周期账本：用户点完生成立刻切走时，重挂载后这一条仍然显示"等待/生成中"。
    runnableTasks.forEach((task) => publishOutfitLiveRun(task));
    beginGenerationRun();
    addEvent(
      workflowEventTitle,
      `已创建 ${nextTasks.length} 个任务，${isDesignDraftWorkflow ? "设计稿SKILL" : isPoseRemixWorkflow ? "批量姿态常规文本" : isRandomBackgroundWorkflow ? settings.smartIntervention ? "随机背景智能文本" : "随机背景常规文本" : isBackgroundChangeWorkflow ? settings.smartIntervention ? "固定背景智能文本" : "固定背景常规文本" : isOutpaintWorkflow ? "批量扩图常规文本" : isRecolorWorkflow ? "改色常规文本" : isFaceSwapWorkflow ? settings.smartIntervention ? "换脸智能文本" : "换脸常规文本" : isLocalDetailWorkflow ? settings.smartIntervention ? "局部回贴智能文本" : "局部回贴常规文本" : settings.smartIntervention ? "智能介入" : "常规模式"}；并发 ${hasLocalEditBatch ? localEditWorkerCount : configuredWorkerCount}`
    );

    let cursor = 0;
    // 中文注释：所有批量生成都走受控并发，避免几十个请求在同一台电脑上瞬时冲向中转站。
    const workerCount = hasLocalEditBatch ? localEditWorkerCount : configuredWorkerCount;
    async function worker() {
      while (cursor < runnableTasks.length) {
        const index = cursor;
        cursor += 1;
        const task = runnableTasks[index];
        try {
          if (hasLocalEditBatch && index > 0) {
            await delay(Math.min(LOCAL_EDIT_BATCH_REQUEST_GAP_MS * index, LOCAL_EDIT_BATCH_REQUEST_GAP_MS * 4));
          }
          await runSingleTask(task);
        } catch (error) {
          const latestTask = tasksRef.current.find((item) => item.id === task.id);
          const stageDetail = taskRuntimeStageLabel(latestTask);
          const errorDetail = [
            stageDetail ? `失败阶段：${stageDetail}` : "",
            sanitizeErrorText(error?.detail || (error instanceof Error ? error.message : String(error)))
          ].filter(Boolean).join("\n");
          // 传 Error 对象（不是只有 message），这样服务端给的 requestId 能显示出来。
          const failedAt = Date.now();
          const failedPatch = {
            status: "failed",
            error: summarizeGenerationError(error),
            errorDetail,
            runtimeStage: "失败",
            runtimeDetail: stageDetail || "",
            runtimeUpdatedAt: failedAt,
            finishedAt: failedAt
          };
          setTasks((current) => current.map((item) => item.id === task.id ? {
            ...item,
            ...failedPatch,
            qualityCheck: item.qualityCheckEnabled
              ? { status: "skipped", summary: "生成失败，未质检" }
              : null
          } : item));
          publishOutfitLiveRun({ ...task, ...failedPatch });
          // 用户此刻没有在看这一条：把失败原因也补登记进页面草稿，
          // 切回来能看到真实原因而不是"待确认"。
          if (!outfitMountedRef.current || !visibleTaskIdsRef.current.has(task.id)) {
            void persistFinishedTaskWhileDetached({ ...task, ...failedPatch }, null);
          }
        }
      }
    }

    try {
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
    } finally {
      endGenerationRun();
    }
    addEvent(workflowEventTitle, "任务队列已完成");
  }

  async function retryTask(task) {
    if (running && !canAppendWhileRunning) return;
    beginGenerationRun();
    try {
      await runSingleTask({ ...task, status: "queued", error: "", result: null });
    } catch (error) {
      const latestTask = tasksRef.current.find((item) => item.id === task.id);
      const stageDetail = taskRuntimeStageLabel(latestTask);
      const errorDetail = [
        stageDetail ? `失败阶段：${stageDetail}` : "",
        sanitizeErrorText(error instanceof Error ? error.message : String(error))
      ].filter(Boolean).join("\n");
      setTasks((current) => current.map((item) => item.id === task.id ? {
        ...item,
        status: "failed",
        error: summarizeGenerationError(error),
        errorDetail,
        runtimeStage: "失败",
        runtimeDetail: stageDetail || "",
        runtimeUpdatedAt: Date.now(),
        qualityCheck: item.qualityCheckEnabled
          ? { status: "skipped", summary: "生成失败，未质检" }
          : null
      } : item));
    } finally {
      endGenerationRun();
    }
  }

  async function rerunResultTask(task) {
    if (!task?.result || task.status !== "success") return;
    if (!canRerunTask(task)) {
      addEvent("重刷", "这张历史结果缺少原始上传图，请重新上传后再生成");
      return;
    }
    const previousTask = task;
    const runnableTask = {
      ...buildRerunReplacementTask(task),
      localEditBatchMode: task.localEdit?.cropFile && task.localEdit?.cropRect ? "rerun-controlled-1" : "rerun"
    };
    setTasks((current) => current.map((item) => item.id === task.id ? runnableTask : item));
    beginGenerationRun();
    addEvent("重刷", `#${task.order || ""} 已开始原位重刷`);
    try {
      await runSingleTask(runnableTask);
      revokeResultImageRuntimeCache(previousTask.result);
      addEvent("重刷完成", `#${task.order || ""} 已用新结果覆盖原图`);
    } catch (error) {
      setTasks((current) => current.map((item) => item.id === runnableTask.id ? {
        ...previousTask,
        error: "",
        errorDetail: "",
        runtimeStage: "重刷失败",
        runtimeDetail: summarizeGenerationError(error),
        runtimeUpdatedAt: Date.now(),
        rerunCandidate: false
      } : item));
      addEvent("重刷失败", `${summarizeGenerationError(error)}；已保留原结果图`);
    } finally {
      endGenerationRun();
    }
  }

  function handleResultReplaceDragOver(event, targetTask) {
    const sourceId = resultDragTaskId(event);
    const sourceTask = tasksRef.current.find((item) => item.id === sourceId);
    if (!canReplaceTaskResult(sourceTask, targetTask)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (resultReplaceTargetId !== targetTask.id) setResultReplaceTargetId(targetTask.id);
  }

  function handleResultReplaceDrop(event, targetTask) {
    const sourceId = resultDragTaskId(event);
    if (!sourceId || sourceId === targetTask?.id) {
      setResultReplaceTargetId("");
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setResultReplaceTargetId("");
    const sourceTask = tasksRef.current.find((item) => item.id === sourceId);
    const latestTarget = tasksRef.current.find((item) => item.id === targetTask.id);
    if (!canReplaceTaskResult(sourceTask, latestTarget)) return;
    const movedResult = sourceTask.result;
    const targetOldResult = latestTarget.result;
    const nextTarget = {
      ...latestTarget,
      result: movedResult,
      prompt: sourceTask.prompt || latestTarget.prompt,
      timingMs: sourceTask.timingMs ?? latestTarget.timingMs,
      finishedAt: sourceTask.finishedAt || Date.now(),
      aspectRatio: sourceTask.aspectRatio || latestTarget.aspectRatio,
      imageSize: sourceTask.imageSize || latestTarget.imageSize,
      cropReturn: normalizeCropReturnMeta(sourceTask.cropReturn || movedResult?.cropReturn),
      savedFilename: sourceTask.savedFilename || "",
      savedPath: sourceTask.savedPath || "",
      autoSaveFailed: Boolean(sourceTask.autoSaveFailed),
      qualityCheck: sourceTask.qualityCheck || latestTarget.qualityCheck,
      rerunOf: latestTarget.rerunOf || "",
      rerunCandidate: false
    };
    setTasks((current) => {
      return current
        .map((item) => item.id === latestTarget.id ? nextTarget : item)
        .filter((item) => item.id !== sourceTask.id);
    });
    if (targetOldResult && targetOldResult !== movedResult) revokeResultImageRuntimeCache(targetOldResult);
    setSelectedTaskIds((current) => {
      if (!current.has(sourceId)) return current;
      const next = new Set(current);
      next.delete(sourceId);
      return next;
    });
    if (preview?.id === sourceId) setPreview(null);
    if (preview?.id === latestTarget.id) setPreview(nextTarget);
    clearResultDragState();
    addEvent("结果覆盖", `已用 #${sourceTask.order || ""} 覆盖 #${latestTarget.order || ""}，原位置已移除`);
  }

  function switchView(view) {
    setActiveView(view);
    if (view === "outfit") {
      const target = outfitPages.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "outfit");
      if (target && target.id !== activeOutfitPageId) {
        switchOutfitPage(target.id);
      }
    }
    window.requestAnimationFrame(() => {
      workspaceRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  function renderOutfitPageRow({ showPromptButton = true } = {}) {
    return (
      <div className="composerPageRow">
        {showPromptButton && (
          <div className="leftTools">
            <button className="smallButton" type="button" onClick={() => setIsPromptAssistantOpen(true)}>
              <BookOpen size={16} />
              <span>词</span>
            </button>
          </div>
        )}

        <div className="outfitPageDock" role="tablist" aria-label="批量生成页面">
          {outfitPages.map((page) => (
            <button
              className={`outfitPageTab ${page.id === activeOutfitPageId ? "active" : ""} ${draggedPageId === page.id ? "dragging" : ""} ${pageDropTarget?.id === page.id ? `drop-${pageDropTarget.placement}` : ""}`}
              type="button"
              key={page.id}
              role="tab"
              aria-selected={page.id === activeOutfitPageId}
              onClick={() => switchOutfitPage(page.id)}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                renameOutfitPage(page.id);
              }}
              onDragOver={(event) => updateOutfitPageDropTarget(event, page.id)}
              onDragLeave={() => setPageDropTarget((current) => current?.id === page.id ? null : current)}
              onDrop={(event) => dropOutfitPage(event, page.id)}
              onDragEnd={endOutfitPageDrag}
              title="单击切换，双击改名，拖拽排序"
            >
              <span
                className="outfitPageDragHandle"
                draggable
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onDragStart={(event) => beginOutfitPageDrag(event, page.id)}
                title="拖拽排序"
              >
                <Move size={12} />
              </span>
              <span>{page.name}</span>
            </button>
          ))}
          <button className="outfitPageAdd" type="button" onClick={createOutfitPageFromCurrent} title="新建批量生成页面">
            <Plus size={16} />
          </button>
          <button
            className={`outfitPageLock ${activePageDeleteLocked ? "locked" : ""}`}
            type="button"
            onClick={() => toggleOutfitPageDeleteLock(activeOutfitPageId)}
            aria-pressed={activePageDeleteLocked}
            title={activePageDeleteLocked ? "当前页已防误删，点击解除" : "锁定当前页删除，防止误删"}
          >
            {activePageDeleteLocked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>
          <button
            className="outfitPageDelete"
            type="button"
            onClick={() => deleteOutfitPage(activeOutfitPageId)}
            title="删除当前页面"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  }

  // 图2 卡片里的「图2服装事实」面板：只做分析 + 查看/修改结构化事实，不产生任何提示词文本。
  function renderImageFactsPanel() {
    const factsSource = outfitIntent.factsSource;
    const stale = Boolean(factsSource.sourceId)
      && Boolean(selectedFixedClothing?.id)
      && factsSource.sourceId !== selectedFixedClothing.id;
    const visibleFields = OUTFIT_FACT_FIELDS.filter((field) => field.parts.some((part) => outfitIntent.parts.includes(part)));
    const summary = visibleFields
      .map((field) => {
        const value = outfitIntent.facts[field.key];
        if (!value || value === FACT_UNRECOGNIZED) return "";
        return `${field.label}：${value}`;
      })
      .filter(Boolean)
      .join("；");
    return (
      <div className="imageFactPanel">
        <div className="imageFactHeader">
          <strong><Sparkles size={13} /> 图2服装事实</strong>
          <span>
            {outfitIntent.parts.length === 0
              ? "先在下方「更换部位」里选部位，分析才知道该提取什么"
              : stale
                ? "图2已更换，这份事实可能过期，建议重新分析"
                : `只保留本次所选部位（${outfitIntentSummary.replaceText}）的服装事实`}
          </span>
          <em>{outfitRecognizedFacts.length > 0 ? `已识别 ${outfitRecognizedFacts.length} 项` : "未识别"}</em>
        </div>
        <div className="imageFactActions">
          <button
            className="smallButton"
            type="button"
            onClick={() => void analyzeImageFacts()}
            disabled={imageFactsAnalyzing}
            title="读取当前图2的服装事实（不会覆盖你的部位/层级/穿法选择，也不会覆盖你手改过的内容）"
          >
            {imageFactsAnalyzing ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />}
            <span>{imageFactsAnalyzing ? "分析中" : "分析当前图2"}</span>
          </button>
          <button className="imageFactToggle" type="button" onClick={() => setFactsDetailOpen((value) => !value)} aria-expanded={factsDetailOpen}>
            {factsDetailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <span>{factsDetailOpen ? "收起" : "查看/修改摘要"}</span>
          </button>
        </div>
        <p className="imageFactSummary">
          {summary || "还没分析：可以点「分析当前图2」自动读取，也可以留空完全靠手写。"}
        </p>
        {factsDetailOpen && (
          <div className="imageFactEditor">
            {visibleFields.length === 0 && <small>请先选择更换部位，才会出现对应的服装事实字段。</small>}
            {visibleFields.map((field) => (
              <label key={field.key}>
                <span>{field.label}</span>
                <input
                  value={outfitIntent.facts[field.key] === FACT_UNRECOGNIZED ? "" : outfitIntent.facts[field.key]}
                  placeholder={FACT_UNRECOGNIZED}
                  onChange={(event) => updateOutfitFact(field.key, event.target.value)}
                />
              </label>
            ))}
            {visibleFields.length > 0 && (
              <small>留空或写「未识别」就表示这一项没有可用事实，不会写进最终提示词。</small>
            )}
          </div>
        )}
      </div>
    );
  }

  // 换装设置区（图1～图3下面）：更换部位 / 上装层级 / 穿法。旧的「单件上衣 / 外套+内搭 / 套装」
  // 顶层切换和「上装长度 / 下装长度」已删除，长度只作为图2事实被分析出来，不再做成长短按钮。
  function renderOutfitIntentPanel() {
    const parts = outfitIntent.parts;
    // 保持列表口径与编译器一致：不含鞋子；选了连衣裙时也不列上装/下装。
    const keepLabels = OUTFIT_KEEP_PART_VALUES
      .filter((part) => !parts.includes(part))
      .filter((part) => !(parts.includes("dress") && (part === "upper" || part === "lower")))
      .map((part) => OUTFIT_PART_OPTIONS.find((item) => item.value === part)?.label || part)
      .join("、");
    // 2026-09-26：删掉「自动识别图2」后，层级一律由用户选，这里只说"会怎么写"。
    const layerHint = `将写作「图2的${outfitLayer.promptLabel}」`;
    return (
      <section className="outfitIntentPanel" aria-label="换装设置">
        <header>
          <div>
            <h3>换装设置</h3>
            <span>这里的选择会进入最终提示词；批次开始后再改只影响下一批。</span>
          </div>
          <span className={`outfitIntentCount ${parts.length === 0 ? "warn" : ""}`}>
            {parts.length === 0 ? "未选择更换部位" : `已选 ${parts.length} 个部位`}
          </span>
        </header>

        <div className="outfitIntentRow">
          <span className="outfitIntentRowTitle">更换部位</span>
          <div className="outfitIntentChips">
            {OUTFIT_PART_OPTIONS.map((part) => {
              const active = parts.includes(part.value);
              return (
                <button
                  className={active ? "active" : ""}
                  key={part.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleOutfitPart(part.value)}
                >
                  {active && <Check size={13} />}
                  <span>{part.label}</span>
                </button>
              );
            })}
          </div>
          <small className={parts.length === 0 ? "outfitIntentWarn" : ""}>
            {parts.length === 0 ? "至少选择一个更换部位才能生成" : `未选择的部位保持图1原样：${keepLabels}`}
          </small>
        </div>

        {parts.includes("upper") && (
          <div className="outfitIntentRow">
            <span className="outfitIntentRowTitle">上装层级</span>
            <div className="outfitIntentChips">
              {UPPER_LAYER_OPTIONS.map((option) => {
                const active = outfitIntent.upperLayer === option.value;
                return (
                  <button
                    className={active ? "active" : ""}
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => patchOutfitIntent({ upperLayer: option.value })}
                  >
                    {active && <Check size={13} />}
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <small className={outfitLayer.uncertain ? "outfitIntentWarn" : ""}>{layerHint}</small>
          </div>
        )}

        <div className="outfitIntentRow">
          <span className="outfitIntentRowTitle">穿法</span>
          <div className="outfitIntentChips">
            {WEARING_MODE_OPTIONS.map((mode) => {
              const active = outfitIntent.wearing.mode === mode.value;
              return (
                <button
                  className={active ? "active" : ""}
                  key={mode.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => patchOutfitIntent({ wearing: { ...outfitIntent.wearing, mode: mode.value } })}
                >
                  {active && <Check size={13} />}
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
          <div className="outfitIntentInline">
            <small>{outfitWearingTextSummary()}</small>
            {outfitIntent.wearing.mode === "custom" && (
              <button className="imageFactToggle" type="button" onClick={() => setWearingDetailOpen((value) => !value)} aria-expanded={wearingDetailOpen}>
                {wearingDetailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>{wearingDetailOpen ? "收起详细设置" : "展开详细设置"}</span>
              </button>
            )}
          </div>
        </div>

        {outfitIntent.wearing.mode === "custom" && wearingDetailOpen && (
          <div className="outfitWearingEditor">
            {outfitWearingFieldList.length === 0 && (
              <small>当前部位没有可设置的穿法项目（鞋子不需要衣领和袖子，未选上装/下装时也不会出现对应项目）。</small>
            )}
            {outfitWearingFieldList.map((field) => (
              <label key={field.key}>
                <span>{field.label}</span>
                <select value={wearingFieldValue(field.key)} onChange={(event) => updateOutfitWearingValue(field.key, event.target.value)}>
                  <option value="">不指定</option>
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {outfitPreview.warnings.length > 0 && (
          <ul className="outfitIntentWarnings">
            {outfitPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        )}
      </section>
    );
  }

  // 穿法摘要：只说明"当前会怎么写"，不重复编译器的原句。
  function outfitWearingTextSummary() {
    if (outfitIntent.wearing.mode === "natural") return "按常规自然穿着，不刻意复刻图2穿法细节";
    if (outfitIntent.wearing.mode === "custom") {
      const picked = outfitWearingFieldList
        .map((field) => {
          const option = field.options.find((item) => item.value === wearingFieldValue(field.key));
          return option ? `${field.label}：${option.label}` : "";
        })
        .filter(Boolean);
      return picked.length ? picked.join("｜") : "还没指定任何状态，将只保留部位与图2事实";
    }
    return "跟随图2穿法，不自行改变扣合、衣摆、袖子和领口";
  }

  // 精修设置区（位置与换装的换装设置一致：都在提示词区左半边）。
  // 2026-09-26（按用户要求）：只留"选择按钮"，把标题/说明/摘要那一段不是按钮的显示全部去掉，
  // 左侧因此省下不少高度；当前状态本来就体现在右边「通用白底精修提示词」框里。
  function renderRetouchIntentPanel() {
    const chipGroup = (options, current, onPick) => options.map((option) => {
      const active = current === option.value;
      return (
        <button
          className={active ? "active" : ""}
          key={option.value}
          type="button"
          aria-pressed={active}
          onClick={() => onPick(option.value)}
        >
          {active && <Check size={13} />}
          <span>{option.label}</span>
        </button>
      );
    });
    return (
      <section className="retouchIntentPanel" aria-label="精修设置">
        <div className="retouchIntentRow">
          <span className="retouchIntentRowTitle">对称</span>
          <div className="retouchIntentChips">
            {chipGroup(RETOUCH_SYMMETRY_OPTIONS, retouchIntent.symmetry, (value) => patchRetouchIntent({ symmetry: value }))}
          </div>
        </div>

        <div className="retouchIntentRow">
          <span className="retouchIntentRowTitle">衣摆或裙摆</span>
          <div className="retouchIntentChips">
            {chipGroup(RETOUCH_HEM_OPTIONS, retouchIntent.hemTreatment, (value) => patchRetouchIntent({ hemTreatment: value }))}
          </div>
        </div>

        <div className="retouchIntentRow">
          <span className="retouchIntentRowTitle">版型</span>
          <div className="retouchIntentChips">
            {chipGroup(RETOUCH_FIT_OPTIONS, retouchIntent.fit, (value) => patchRetouchIntent({ fit: value }))}
          </div>
        </div>
      </section>
    );
  }
  function renderResultQueue() {
    return (
      <section className="resultPanel queuePanel" id="result-archive-section">
        {/* 精修页专属：结果图中线剪裁开关（样式与 3.0 一致，只在精修页出现）。 */}
        {isWhiteRefineWorkflow && renderSplitHalvesStrip()}
        <div className="taskGrid" ref={taskGridRef} style={{ "--asset-card-min": `${galleryCardMin}px` }}>
          {visibleTasks.map((task, taskIndex) => {
            const selected = selectedTaskIds.has(task.id);
            const durationMs = taskDurationMs(task, clockNow);
            const fallbackReferences = taskReferencePreviewItems(task);
            const storedReferences = sanitizeTaskReferenceThumbs(task.referenceThumbs);
            const references = storedReferences.length ? storedReferences : fallbackReferences;
            const referenceCount = Math.max(
              Number(task.referenceCount || 0),
              references.length,
              fallbackReferences.length
            );
            if (task.status !== "success") {
              const failed = task.status === "failed";
              const runningTask = task.status === "running";
              const canRetry = failed && canRerunTask(task);
              return (
                <article className={`assetCard loadingCard outfitAssetCard ${task.status} ${selected ? "selected" : ""}`} key={task.id}>
                  <button
                    className="selectBox"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleTaskSelected(task.id);
                    }}
                    aria-label={selected ? "取消选中" : "选择图片"}
                  >
                    {selected ? <CheckSquare size={24} /> : <Square size={24} />}
                  </button>
                  {runningTask ? <Loader2 className="spin" size={28} /> : <Sparkles size={28} />}
                  <span>{taskStatusLabel(task.status)}</span>
                  <strong>{runningTask ? formatMs(Math.max(durationMs || 0, 1000)) : `${task.imageSize || settings.imageSize} · ${task.aspectRatio || settings.aspectRatio}`}</strong>
                  <em>{task.modelLabel || settings.model}</em>
                  {taskRuntimeStageLabel(task) && (
                    <p className="assetError runtimeStage" title={taskRuntimeStageLabel(task)}>
                      {taskRuntimeStageLabel(task)}
                    </p>
                  )}
                  {canRetry && (
                    <button className="assetRetryButton" type="button" onClick={() => retryTask(task)}>
                      重试
                    </button>
                  )}
                  {task.error && <p className="assetError" title={task.errorDetail || task.error}>{task.error}</p>}
                </article>
              );
            }

            const promptText = task.prompt || settings.prompt;
            const src = displayResultImageSource(task.result);
            // P1 缺图自愈：已知失效或加载失败过 → 不再重复请求，直接显示可读原因。
            const cardState = resultImageCardState(task.result, displayResultImageSource);
            // 会话内的失败标记优先，其次用持久化在任务记录里的标记（重载后依然生效）。
            const brokenEntry = brokenTaskImages[task.id] || task.resultMissing;
            const brokenReason = cardState.missing
              ? cardState.reason
              : (brokenEntry && brokenEntry.src === src ? brokenEntry.reason : "");
            const hasCropReturn = taskHasCropReturnResult(task);
            return (
              <article
                className={`assetCard outfitAssetCard success ${selected ? "selected" : ""} ${task.rerunCandidate ? "rerunCandidate" : ""} ${hasCropReturn ? "cropReturnResult" : ""} ${resultReplaceTargetId === task.id ? "replaceTarget" : ""}`}
                key={task.id}
                onClick={() => setPreview(task)}
                onDragOver={(event) => handleResultReplaceDragOver(event, task)}
                onDragLeave={() => setResultReplaceTargetId((current) => current === task.id ? "" : current)}
                onDrop={(event) => handleResultReplaceDrop(event, task)}
              >
                <button
                  className="selectBox"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleTaskSelected(task.id);
                  }}
                  aria-label={selected ? "取消选中" : "选择图片"}
                >
                  {selected ? <CheckSquare size={24} /> : <Square size={24} />}
                </button>
                <button
                  className={`assetDownloadButton ${downloadFeedbackIds.has(task.id) ? "downloaded" : ""}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void downloadTask(task);
                  }}
                  title="下载到指定文件夹"
                  aria-label="下载到指定文件夹"
                >
                  {downloadFeedbackIds.has(task.id) ? <Check size={16} /> : <Download size={16} />}
                </button>
                <button
                  className="assetRerunButton"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void rerunResultTask(task);
                  }}
                  disabled={!canRerunTask(task)}
                  title={canRerunTask(task) ? "重刷这张结果" : "历史结果缺少原始上传图，不能重刷"}
                  aria-label="重刷这张结果"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  className="assetDeleteButton"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    deleteResultTask(task.id);
                  }}
                  title="删除这张结果"
                  aria-label="删除这张结果"
                >
                  <Trash2 size={15} />
                </button>
                {task.rerunCandidate && <div className="assetRerunBadge">重刷候选</div>}
                {hasCropReturn && <div className="assetCropReturnBadge">裁剪回流</div>}
                {Number.isFinite(durationMs) && durationMs > 0 && <div className="assetTimeBadge">用时 {formatMs(durationMs)}</div>}
                {task.qualityCheck && (
                  <div
                    className={`qualityBadge ${qualityStatusClass(task.qualityCheck)}`}
                    title={qualityBadgeTitle(task.qualityCheck)}
                  >
                    {qualityStatusLabel(task.qualityCheck)}
                  </div>
                )}
                {brokenReason ? (
                  <div className="assetImageFallback" title={brokenReason}>
                    <ImageOff size={26} />
                    <strong>原图已失效</strong>
                    <span>{brokenReason}</span>
                    <em>可点右上角删除按钮清理这条记录</em>
                  </div>
                ) : (
                  <CachedImage
                    src={src}
                    alt={`AI换装结果 ${task.order || ""}`}
                    decoding="async"
                    loading={taskIndex < 6 ? "eager" : "lazy"}
                    fetchPriority={taskIndex < 4 ? "high" : "low"}
                    draggable
                    onDragStart={(event) => beginTaskImageDrag(event, task, taskIndex)}
                    onDragOver={(event) => handleResultReplaceDragOver(event, task)}
                    onDrop={(event) => handleResultReplaceDrop(event, task)}
                    onDragEnd={clearResultDragState}
                    onError={() => markTaskImageBroken(task)}
                    diagnostic={{ requestId: task.id, endpoint: "/api/generate-outfit", module: "批量生成", workflowMode: task.workflowMode || activeOutfitPage.workflowMode || "", placement: "outfit-card" }}
                  />
                )}
                <ReferenceThumbTray
                  references={references}
                  count={referenceCount}
                  className="assetReferenceTray"
                  onOpen={(reference) => setImageLightbox({ title: reference.name || reference.label || "参考图", src: referenceSource(reference) })}
                  onContextMenu={openReferenceContextMenu}
                  onImageDragStart={beginReferenceImageDrag}
                />
                {promptText && (
                  <button
                    className="assetPrompt"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyText(promptText, "提示词已复制");
                    }}
                    title={promptText}
                  >
                    {promptText}
                  </button>
                )}
                <div className="assetMeta">
                  <span>{task.modelLabel || settings.model}</span>
                  <strong>{task.imageSize || settings.imageSize} · {task.aspectRatio || settings.aspectRatio}</strong>
                </div>
              </article>
            );
          })}
          {visibleTasks.length === 0 && (
            <div className="emptyTasks">
              <Sparkles size={28} />
              <span>{resultFilter === "video" ? "视频模块暂未接入。" : isPoseRemixWorkflow ? "上传图1姿态参考图和图2固定母版成片后，点击生成。" : isRandomBackgroundWorkflow ? "上传图1人物图，并在场景补充里写大概场景后，点击生成。" : isOutpaintWorkflow ? "上传图1半身照后，点击生成向下扩图。" : isRecolorWorkflow ? "上传图1原图和图2颜色参考图后，点击生成。" : isFaceSwapWorkflow ? "上传图1目标人物图和图2人脸参考图后，点击生成。" : "上传模特图和服装图后，点击生成。"}</span>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <main className="appShell outfitWorkflowEmbedded" style={themeStyle}>
      <aside className="sidebar">
        <div className="brand">
          <img src="/app-avatar.webp" alt="" />
          <div>
            <h1>静音AI换装</h1>
            <span>换装流水线</span>
          </div>
        </div>
        <nav>
          <button className={activeView === "quick" ? "active" : ""} type="button" onClick={() => switchView("quick")}><Sparkles size={18} /> 快捷生成</button>
          <button className={activeView === "outfit" ? "active" : ""} type="button" onClick={() => switchView("outfit")}><Wand2 size={18} /> 批量生成</button>
          <button className={activeView === "resize" ? "active" : ""} type="button" onClick={() => switchView("resize")}><Crop size={18} /> 批量尺寸导出</button>
          <button className={activeView === "reference" ? "active" : ""} type="button" onClick={() => switchView("reference")}><Images size={18} /> 参考生图</button>
          <button className={activeView === "detail" ? "active" : ""} type="button" onClick={() => switchView("detail")}><BookOpen size={18} /> 一键详情/主图</button>
          <button className={activeView === "prompt" ? "active" : ""} type="button" onClick={() => switchView("prompt")}><BookOpen size={18} /> 提示词助手</button>
        </nav>
        <button className="settingsEntry" type="button" onClick={openSettings}>
          <Settings size={18} />
          <span>设置</span>
        </button>
        <div className="statusBox">
          <strong>{completedCount}/{tasks.length || 0}</strong>
          <span>完成任务</span>
          {failedCount > 0 && <em>{failedCount} 个失败</em>}
          {failedCount === 0 && detachedCount > 0 && <em>{detachedCount} 个待确认</em>}
        </div>
      </aside>

      <section className="workspace" ref={workspaceRef} onPaste={activeView === "outfit" ? handleWorkspacePaste : undefined}>
        <section className={`viewPanel ${activeView === "quick" ? "active" : ""}`}>
          <WorkflowQuickVideoPanel
            config={config}
            apiKey={effectiveApiKey}
            onOpenSettings={openSettings}
            onAddEvent={addEvent}
          />
        </section>

        <section className={`viewPanel ${activeView === "reference" ? "active" : ""}`}>
          <LegacyModulePanel
            title="参考生图"
            subtitle="独立栏目，后续迁移参考生图时会使用独立上传区和独立历史。"
            icon={<Images size={22} />}
          >
            <div className="legacyGrid">
              <button className="legacyAction" type="button" onClick={() => switchView("outfit")}>
                <Upload size={18} />
                <span>使用当前换装上传区</span>
              </button>
              <button className="legacyAction" type="button" onClick={() => setIsPromptAssistantOpen(true)}>
                <BookOpen size={18} />
                <span>打开提示词</span>
              </button>
            </div>
          </LegacyModulePanel>
        </section>

        <section className={`viewPanel ${activeView === "detail" ? "active" : ""}`}>
          <LegacyModulePanel
            title="一键详情/主图"
            subtitle="独立栏目，保留老版本入口；不和 AI换装生成结果互相写入。"
            icon={<BookOpen size={22} />}
          >
            <div className="legacyGrid">
              <button className="legacyAction" type="button" onClick={() => void openSaveDirectory()}>
                <FolderOpen size={18} />
                <span>打开保存目录</span>
              </button>
              <button className="legacyAction" type="button" onClick={() => switchView("outfit")}>
                <Wand2 size={18} />
                <span>返回 AI换装</span>
              </button>
            </div>
          </LegacyModulePanel>
        </section>

        <section className={`viewPanel ${activeView === "prompt" ? "active" : ""}`}>
          <LegacyModulePanel
            title="提示词助手"
            subtitle="提示词库独立管理，可拖拽分类、编辑、搜索和应用到当前 AI换装提示词。"
            icon={<BookOpen size={22} />}
          >
            <div className="promptAssistantDock">
              <PromptPresetGrid
                categories={promptCategories} activeCategory={promptCategory} onSelectCategory={setPromptCategory}
                dropCategory={promptDropCategory} onDropCategoryChange={setPromptDropCategory}
                search={promptSearch} onSearchChange={setPromptSearch}
                presets={filteredPromptPresets} draggedId={draggedPromptId}
                onApplyPreset={schedulePromptPresetApply} onRenamePreset={renamePromptPresetTitle}
                onRenameCategory={renamePromptCategory} onDropPresetToCategory={dropPromptOnCategory}
                onAddCategory={addPromptCategory} onCreatePreset={openNewPromptEditor}
                onBeginDrag={beginPromptDrag} onEndDrag={endPromptDrag} onDropPresetToPreset={dropPromptOnPreset}
                onEditPreset={editPromptPreset} onDeletePreset={deletePromptPreset}
              />
            </div>
          </LegacyModulePanel>
        </section>

        <section className={`viewPanel outfitViewPanel ${activeView === "outfit" ? "active" : ""}`}>
        <header className="topbar">
          <div className="resultTabs">
            <button className={`tabButton ${resultFilter === "all" ? "active" : ""}`} type="button" onClick={() => setResultFilter("all")}>
              全部({tasks.length})
            </button>
            <button className={`tabButton ${resultFilter === "image" ? "active" : ""}`} type="button" onClick={() => setResultFilter("image")}>
              <Images size={14} />
              <span>图片({imageCount})</span>
            </button>
            <button className="tabButton" type="button" onClick={() => { setResultFilter("all"); switchView("quick"); addEvent("视频", "已打开快捷视频生成"); }}>
              <Video size={14} />
              <span>视频(0)</span>
            </button>
            <button
              className="outfitPageNameChip"
              type="button"
              onDoubleClick={() => renameOutfitPage(activeOutfitPageId)}
              title="双击修改页面名称"
            >
              <Pencil size={13} />
              <span>{activeOutfitPage.name}</span>
            </button>
          </div>
          <div className="topActions">
            <button className="toolbarButton" type="button" onClick={() => void refreshHistory()}>
              <RefreshCw size={15} />
              <span>刷新</span>
            </button>
            <button className="toolbarButton" type="button" onClick={openDirectoryModal}>
              <FolderOpen size={15} />
              <span>指定文件夹</span>
            </button>
            <button className="toolbarButton" type="button" onClick={() => void openSaveDirectory()}>
              <FolderOpen size={15} />
              <span>打开保存目录</span>
            </button>
            <span className={`taskBadge task-${topbarStatus}`}>{topbarStatusText}</span>
            <button className="toolbarButton" type="button" onClick={downloadSelected} disabled={selectedCompletedCount === 0}>
              <Download size={15} />
              <span>下载选中</span>
            </button>
            <button className="toolbarButton" type="button" onClick={downloadAll} disabled={imageCount === 0}>
              <Download size={15} />
              <span>下载全部</span>
            </button>
            <button className="dangerButton" type="button" onClick={deleteSelected} disabled={selectedCount === 0}>
              <Trash2 size={15} />
              <span>删除选中</span>
            </button>
            <button className="dangerButton" type="button" onClick={clearAll}>
              <Trash2 size={15} />
              <span>清空全部</span>
            </button>
            <button className="toolbarButton" type="button" onClick={() => void clearNonResultImageCache()}>
              <RefreshCw size={15} />
              <span>清缓存</span>
            </button>
            <div className="zoomControl">
              <button type="button" onClick={() => changeGalleryZoom(-0.1)} disabled={galleryZoom <= 0.75} aria-label="缩小图库">
                <Minus size={14} />
              </button>
              <span style={{ "--zoom-fill": `${Math.max(0, Math.min(100, ((galleryZoom - 0.75) / 0.7) * 100))}%` }} />
              <button type="button" onClick={() => changeGalleryZoom(0.1)} disabled={galleryZoom >= 1.45} aria-label="放大图库">
                <Plus size={14} />
              </button>
              <strong>{galleryZoomPercent}%</strong>
            </div>
          </div>
        </header>

        <div className="outfitScrollArea">
          {renderResultQueue()}

          <section className="assetGrid">
          <UploadZone
            primary
            title={`图1：${uploadLabels.model.title}`}
            hint={uploadLabels.model.hint}
            slotPrefix="图1："
            titleText={uploadLabels.model.title}
            hintText={uploadLabels.model.hint}
            onEditTitle={() => editUploadLabel("model", "title")}
            onEditHint={() => editUploadLabel("model", "hint")}
            items={modelImages}
            onPick={(files) => addImages("model", files)}
            onRemove={(id) => removeImage("model", id)}
            onToggle={(id) => toggleImage("model", id)}
            onReorder={(fromId, toId, placement) => reorderImage("model", fromId, toId, placement)}
            onReplace={(id, file) => void replaceImage("model", id, file)}
            onClear={() => clearImageGroup("model")}
            onPreview={(item) => setImageLightbox({ title: item.name, src: item.previewUrl })}
            onOpenCrop={(item) => setCropTarget({ group: "model", item })}
            onOpenLocalEdit={(item) => openLocalEdit("model", item)}
            localEditEnabled={!isDesignDraftWorkflow && !isPoseRemixWorkflow && !isOutpaintWorkflow && !isWhiteRefineWorkflow && !isRandomBackgroundWorkflow}
            maxCount={MAX_UPLOAD_IMAGES}
            onLimit={(message) => addEvent("图1上传", message)}
            onActivate={() => setActiveUploadGroup("model")}
            bulkMode={modelBulkMode}
            onBulkModeChange={(mode) => void applyGroupPreprocess("model", mode)}
          />
          {/* 2026-09-26（按用户要求）：精修页不再需要图2 —— 图1 本身就是多图上传，
              所有图片一起合成一张成品图。所以精修页只渲染图1 这一个上传区。
              其它分区的图2 原样保留；这里只是不渲染，已有的 clothingImages 数据不动。 */}
          {!isOutpaintWorkflow && !isRandomBackgroundWorkflow && !isWhiteRefineWorkflow && <div className="assetSide">
            <UploadZone
              compact
              title={`图2：${uploadLabels.clothing.title}`}
              hint={uploadLabels.clothing.hint}
              slotPrefix="图2："
              titleText={uploadLabels.clothing.title}
              hintText={uploadLabels.clothing.hint}
              onEditTitle={() => editUploadLabel("clothing", "title")}
              onEditHint={() => editUploadLabel("clothing", "hint")}
              items={clothingImages}
              onPick={(files) => addImages("clothing", files)}
              onRemove={(id) => removeImage("clothing", id)}
              onToggle={(id) => toggleImage("clothing", id)}
              onReorder={(fromId, toId, placement) => reorderImage("clothing", fromId, toId, placement)}
              onReplace={(id, file) => void replaceImage("clothing", id, file)}
              onClear={() => clearImageGroup("clothing")}
              onSetFixed={isWhiteRefineWorkflow ? null : isPoseRemixWorkflow ? settings.pairingMode === "fixed" ? setMasterClothing : null : setMasterClothing}
              fixedId={isWhiteRefineWorkflow || (isPoseRemixWorkflow && settings.pairingMode !== "fixed") ? "" : fixedClothingId}
              fixedTitle={isPoseRemixWorkflow ? "设为固定母版" : isFaceSwapWorkflow ? "设为固定人脸" : isBackgroundChangeWorkflow ? "设为固定场景" : isOutpaintWorkflow ? "设为主扩图参考" : isRecolorWorkflow ? "设为主颜色参考" : "设为固定服装"}
              onPreview={(item) => setImageLightbox({ title: item.name, src: item.previewUrl })}
              onOpenCrop={(item) => setCropTarget({ group: "clothing", item })}
              maxCount={(isOutfitWorkflow || isPoseRemixWorkflow || isFaceSwapWorkflow) ? 2 : MAX_UPLOAD_IMAGES}
              onLimit={(message) => addEvent("图2上传", message)}
              onActivate={() => setActiveUploadGroup("clothing")}
              bulkMode={clothingBulkMode}
              onBulkModeChange={(mode) => void applyGroupPreprocess("clothing", mode)}
              footerControls={isRecolorWorkflow ? (
                <div className="garmentTransferControls" aria-label="图2改色范围设置">
                  <div className="garmentPartPresetGroup" aria-label="图2常用改色范围">
                    {GARMENT_PART_PRESET_OPTIONS.map((preset) => {
                      const active = sameGarmentParts(selectedGarmentParts, preset.parts)
                        && selectedGarmentComposition === normalizeGarmentComposition(preset.composition, preset.parts);
                      return (
                        <button
                          className={active ? "active" : ""}
                          key={preset.value}
                          type="button"
                          onClick={() => applyGarmentPartPreset(preset)}
                          aria-pressed={active}
                          title={`改色范围：${preset.label}；当前按${garmentCompositionLabel(preset.composition)}理解图2服装结构`}
                        >
                          <Check size={13} />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="garmentPartPicker" aria-label="图2改色部位">
                    {GARMENT_PART_OPTIONS.map((part) => {
                      const active = selectedGarmentParts.includes(part.value);
                      return (
                        <button
                          className={active ? "active" : ""}
                          key={part.value}
                          type="button"
                          onClick={() => toggleGarmentPart(part.value)}
                          aria-pressed={active}
                          title={`图2改色${part.label}`}
                        >
                          <Check size={13} />
                          <span>{part.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              sideControls={isOutfitWorkflow ? renderImageFactsPanel() : null}
            />
            {!isWhiteRefineWorkflow && <UploadZone
              compact
              title={`图3：${uploadLabels.reference.title}`}
              hint={uploadLabels.reference.hint}
              slotPrefix="图3："
              titleText={uploadLabels.reference.title}
              hintText={uploadLabels.reference.hint}
              onEditTitle={() => editUploadLabel("reference", "title")}
              onEditHint={() => editUploadLabel("reference", "hint")}
              items={referenceImages}
              onPick={(files) => addImages("reference", files)}
              onRemove={(id) => removeImage("reference", id)}
              onToggle={(id) => toggleImage("reference", id)}
              onReorder={(fromId, toId, placement) => reorderImage("reference", fromId, toId, placement)}
              onReplace={(id, file) => void replaceImage("reference", id, file)}
              onClear={() => clearImageGroup("reference")}
              onPreview={(item) => setImageLightbox({ title: item.name, src: item.previewUrl })}
              onOpenCrop={(item) => setCropTarget({ group: "reference", item })}
              maxCount={MAX_UPLOAD_IMAGES}
              onLimit={(message) => addEvent("图3上传", message)}
              onActivate={() => setActiveUploadGroup("reference")}
              bulkMode={referenceBulkMode}
              onBulkModeChange={(mode) => void applyGroupPreprocess("reference", mode)}
            />}
          </div>}
          </section>

          {/* 2026-09-26（按用户要求）：换装设置已搬到下方提示词区的左半边，
              这里不再占一整块竖向空间，图1~图3 下面直接就是原图库。 */}

          <section className="originalLibraryPanel">
          <header>
            <div>
              <h3>原图库</h3>
              <span>保留你上传的原始图片，方便后续重新取细节。</span>
            </div>
            <span>{originalLibrary.length} 张</span>
          </header>
          <div className="originalLibraryGrid">
            {originalLibrary.map((item) => (
              <article className="originalLibraryCard" key={item.id}>
                <button type="button" onClick={() => setImageLightbox({ title: item.name, src: item.url })}>
                  <img src={item.url} alt="" />
                </button>
                <div>
                  <strong title={item.name}>{item.name}</strong>
                  <span>{fileSize(item.size)}</span>
                </div>
                <button type="button" onClick={() => removeOriginalImage(item.id)}>
                  <Trash2 size={13} />
                </button>
              </article>
            ))}
            {originalLibrary.length === 0 && (
              <div className="emptyOriginal">
                <Crop size={22} />
                <span>上传后会自动保留原图副本</span>
              </div>
            )}
          </div>
          </section>
        </div>

        <section className="composerPanel">
          <div className="composerHeader">
            <div className="composerTabs">
              <button className="active" type="button">图片换装</button>
            </div>
          </div>

          {/* 2026-09-26（按用户要求）：换装设置内容不多，搬到提示词左边这半边的空位里，
              原来在图1~图3下面占的那一整块竖向空间就省出来了。
              左边 = 换装设置；右边 = 通用换装提示词 + 补充提示词。
              精修页后来又按用户要求压成两行：第一行三组设置排成一条，第二行提示词 + 用户补充并排。 */}
          <div className={`composerBody ${isOutfitWorkflow ? "withIntent" : ""} ${isWhiteRefineWorkflow ? "withRetouch" : ""}`}>
            {isOutfitWorkflow && (
              <div className="composerIntentCol">
                {renderOutfitIntentPanel()}
              </div>
            )}
            {/* 精修设置：三组选择排成一条，占满整行 —— 下面才是提示词 + 用户补充并排。 */}
            {isWhiteRefineWorkflow && (
              <div className="retouchSettingsRow">
                {renderRetouchIntentPanel()}
              </div>
            )}

            <div className="composerPromptCol">
              <label className="composerField" ref={promptFieldRef}>
                <span>
                  {promptFieldTitle}
                  {isOutfitWorkflow && (
                    <em className="composerFieldHint">按换装设置自动生成，也可以直接手改</em>
                  )}
                  {isWhiteRefineWorkflow && (
                    <em className="composerFieldHint">按精修设置自动生成，也可以直接手改</em>
                  )}
                </span>
                {/* 换装 / 精修：这个框就是**真正发送的内容**。
                    它由「设置 + 补充」自动生成；用户可以随手调整/增删，
                    点设置按钮时会按设置重新生成一遍。 */}
                <DebouncedTextarea
                  className={isOutfitWorkflow ? "outfitPromptLive" : isWhiteRefineWorkflow ? "retouchPromptLive" : undefined}
                  value={settings.prompt}
                  onChange={(value) => {
                    // 手改提示词：先记下来，别让自动生成立刻盖掉用户写的东西。
                    if (isOutfitWorkflow) outfitPromptHandEditedRef.current = true;
                    if (isWhiteRefineWorkflow) retouchPromptHandEditedRef.current = true;
                    updateSetting("prompt", value);
                  }}
                  onKeyDown={handlePromptKeyDown}
                  placeholder={promptFieldPlaceholder}
                />
                {isOutfitWorkflow && (
                  <div className="outfitPromptMeta">
                    <span>
                      共 {String(settings.prompt || "").length} 字（其中自动内容 {outfitPreview.autoChars}/{OUTFIT_AUTO_PROMPT_CHAR_LIMIT} 字）
                    </span>
                    <button
                      className="outfitPromptClear"
                      type="button"
                      onClick={() => {
                        updateSetting("prompt", outfitAutoPrompt);
                        addEvent("换装设置", "已按当前换装设置重新生成提示词");
                      }}
                      title="把上面这个框恢复成按当前换装设置生成的内容"
                    >
                      按设置重新生成
                    </button>
                  </div>
                )}
                {isWhiteRefineWorkflow && (
                  <div className="outfitPromptMeta">
                    <span>
                      共 {String(settings.prompt || "").length} 字（其中自动内容 {retouchPreview.autoChars}/{RETOUCH_AUTO_PROMPT_CHAR_LIMIT} 字
                      {retouchPreview.userChars > 0 ? `、用户补充 ${retouchPreview.userChars} 字` : ""}）
                    </span>
                    <button
                      className="outfitPromptClear"
                      type="button"
                      onClick={() => {
                        retouchPromptHandEditedRef.current = false;
                        updateSetting("prompt", retouchAutoPrompt);
                        addEvent("精修设置", "已按当前精修设置重新生成提示词");
                      }}
                      title="把上面这个框恢复成按当前精修设置生成的内容"
                    >
                      按设置重新生成
                    </button>
                  </div>
                )}
              </label>

              <label className="composerField composerNote">
                <span>
                  {productNoteFieldTitle}
                  {isOutfitWorkflow && (
                    <em className="composerFieldHint">会实时接到上面提示词的最后（只作为提示词正文的一部分，不再单独重复发给 API）</em>
                  )}
                  {isWhiteRefineWorkflow && (
                    <em className="composerFieldHint">会实时并入上面提示词的【用户补充】段，不再单独重复发给 API</em>
                  )}
                </span>
                <DebouncedTextarea
                  value={settings.productNote}
                  onChange={(value) => {
                    // 补充提示词本身就是最终提示词正文的一部分：改它就重新拼一次，
                    // 保证"实时并进去"这件事在手改过提示词之后也照样成立。
                    if (isOutfitWorkflow) outfitPromptHandEditedRef.current = false;
                    if (isWhiteRefineWorkflow) retouchPromptHandEditedRef.current = false;
                    updateSetting("productNote", value);
                  }}
                  onKeyDown={handlePromptKeyDown}
                  placeholder={productNotePlaceholder}
                />
              </label>
            </div>
          </div>

          <div className="composerStickyControls">
            {/* 提交按钮旁的一行摘要（完整提示词在「通用换装提示词」下面常显，不用再点开）。 */}
            {isOutfitWorkflow && (
              <div className="outfitIntentBar">
                <span className="outfitIntentBarText">
                  本次替换：<b>{outfitIntentSummary.replaceText}</b>
                  <em>｜</em>保持：{outfitIntentSummary.keepText}
                  <em>｜</em>穿法：{outfitIntentSummary.wearingText}
                </span>
                <span className="outfitIntentBarChars">{outfitPreview.autoChars}/{OUTFIT_AUTO_PROMPT_CHAR_LIMIT} 字</span>
              </div>
            )}
            <div className="composerFooter">
              {renderOutfitPageRow()}

              <div className="rightTools">
                <select value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
                  {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
                {/* 线路选择：请求必须带 canonical channelId；旧线路不会出现在这里，服务端也会拒绝。
                    2026-09-26：批量页保持原来的下拉框样式（和旁边模型/比例/尺寸同级），
                    只让"当前选中的渠道"用快捷生成那套金色 #fbbf24 显示，其余样式不变。 */}
                <select
                  className="channelSelect"
                  value={outfitChannels.some((channel) => channel.id === settings.channelId) ? settings.channelId : (outfitChannels[0]?.id || "")}
                  onChange={(event) => updateSetting("channelId", event.target.value)}
                  title="当前模型的可用线路"
                >
                  {outfitChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.label}{Number(channel.price || 0) > 0 ? ` ¥${Number(channel.price).toFixed(2)}/张` : ""}
                    </option>
                  ))}
                </select>
                <select value={settings.aspectRatio} onChange={(event) => updateSetting("aspectRatio", event.target.value)}>
                  {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
                <select value={settings.imageSize} onChange={(event) => updateSetting("imageSize", event.target.value)}>
                  {outfitSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                <select className={globalBulkMode === "mixed" ? "mixed" : ""} value={globalBulkMode} onChange={(event) => void applyGlobalPreprocess(event.target.value)}>
                  <option value="mixed" disabled>混合状态</option>
                  {globalBulkMode === "crop" && <option value="crop" disabled>{preprocessModeLabel("crop")}</option>}
                  {PREPROCESS_OPTIONS.filter((option) => option.value !== "crop").map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {isOutpaintWorkflow || isRandomBackgroundWorkflow ? (
                  <select value="fixed" disabled>
                    <option value="fixed">{isRandomBackgroundWorkflow ? "按场景补充生成" : "图1向下扩图"}</option>
                  </select>
                ) : (
                  <select value={settings.pairingMode} onChange={(event) => updateSetting("pairingMode", event.target.value)}>
                    <option value="fixed">{isPoseRemixWorkflow ? "固定母版" : isFaceSwapWorkflow ? "固定人脸" : isBackgroundChangeWorkflow ? "固定场景" : "固定服装"}</option>
                    <option value="sequence">{isPoseRemixWorkflow ? "母版一一对应" : isFaceSwapWorkflow ? "人脸一一对应" : isBackgroundChangeWorkflow ? "人物场景一一对应" : "按顺序一一对应"}</option>
                    <option value="cycle">{isPoseRemixWorkflow ? "母版循环配对" : isFaceSwapWorkflow ? "人脸循环配对" : isBackgroundChangeWorkflow ? "场景循环配对" : "服装循环配对"}</option>
                  </select>
                )}
                {isRandomBackgroundWorkflow && (
                  <select
                    value={normalizeRandomBackgroundFocus(settings.randomBackgroundFocus)}
                    onChange={(event) => updateSetting("randomBackgroundFocus", event.target.value)}
                    title="随机背景视觉重点"
                  >
                    {RANDOM_BACKGROUND_FOCUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                )}
                <select value={generationCount} onChange={(event) => updateSetting("generationCount", event.target.value)}>
                  {GENERATION_COUNT_OPTIONS.map((count) => (
                    <option key={count} value={count}>{count === "auto" ? `数量(${plannedGenerationCount})` : `数量 ${count}`}</option>
                  ))}
                </select>
                <button
                  className={`smartInterventionSwitch ${!isPoseRemixWorkflow && !isOutpaintWorkflow && !isRandomBackgroundWorkflow && settings.smartIntervention ? "on" : ""}`}
                  type="button"
                  onClick={() => {
                    if (isPoseRemixWorkflow) {
                      addEvent("批量姿态", "该页按图1姿态和图2母版直接生成，暂不启用锁图1人物的智能文本");
                      return;
                    }
                    if (isOutpaintWorkflow) {
                      addEvent("批量扩图", "该页使用前端扩图画布和独立扩图 SKILL，不启用额外智能文本");
                      return;
                    }
                    if (isRandomBackgroundWorkflow) {
                      addEvent("随机背景", "该页按场景补充和随机背景 SKILL 直接生成，暂不启用额外智能文本");
                      return;
                    }
                    updateSetting("smartIntervention", !settings.smartIntervention);
                  }}
                  aria-pressed={!isPoseRemixWorkflow && !isOutpaintWorkflow && !isRandomBackgroundWorkflow && settings.smartIntervention}
                  title={isPoseRemixWorkflow ? "批量姿态页暂不启用锁图1人物的智能文本" : isOutpaintWorkflow ? "批量扩图页使用固定扩图文本" : isRandomBackgroundWorkflow ? "随机背景页使用场景补充和固定 SKILL" : "切换文本模型介入"}
                >
                  <span>{isPoseRemixWorkflow || isOutpaintWorkflow || isRandomBackgroundWorkflow ? "常规文本" : settings.smartIntervention ? "智能文本" : "常规文本"}</span>
                  <i aria-hidden="true"><b /></i>
                </button>
                <button
                  className={`qualityCheckSwitch ${settings.qualityCheck ? "on" : ""}`}
                  type="button"
                  onClick={() => updateSetting("qualityCheck", !settings.qualityCheck)}
                  aria-pressed={settings.qualityCheck}
                  title="生成完成后调用 AI质检员标记合格/不合格"
                >
                  <span>AI质检</span>
                  <i aria-hidden="true"><b /></i>
                </button>
                <button className="generateButton" type="button" onClick={() => void startBatch()} disabled={running && !canAppendWhileRunning}>
                  {running ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                  <span>生成</span>
                </button>
              </div>
            </div>
            {inlineMessage && <div className="composerStatus">{inlineMessage}</div>}
          </div>
        </section>

        </section>

        <section className={`viewPanel ${activeView === "resize" ? "active" : ""}`}>
          <header className="moduleHeader">
            <div>
              <h2>批量尺寸导出</h2>
              <span>独立本地处理栏目，只负责批量缩放、转格式、补边、裁剪和导出。</span>
            </div>
          </header>
          <BatchResizePanel
            saveDirectory={saveDirectory}
            onChooseDirectory={openDirectoryModal}
            onOpenSaveDirectory={() => void openSaveDirectory()}
            onSaveImage={saveExportedImageToFolder}
            onAddEvent={addEvent}
          />
        </section>

      </section>

      {isSettingsOpen && !embeddedMode && (
        <div className="modalLayer" onMouseDown={() => setIsSettingsOpen(false)}>
          <section className="settingsModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>设置</h2>
                <span>API Key 与界面皮肤</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setIsSettingsOpen(false)}>
                <X size={18} />
              </button>
            </header>

            <label className="modalField">
              <span><Lock size={15} /> API Key</span>
              <div className="apiKeyRow">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKeyDraft}
                  placeholder="sk-..."
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                />
                <button className="iconButton" type="button" onClick={() => setShowKey((value) => !value)} title={showKey ? "隐藏 API Key" : "显示 API Key"}>
                  {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
                <button className="smallButton saveKeyButton" type="button" onClick={saveSettings}>
                  <Save size={15} />
                  <span>保存</span>
                </button>
              </div>
              {apiSaveStatus && <small>{apiSaveStatus}</small>}
            </label>

            <div className="skinBlock">
              <span><Palette size={15} /> 皮肤</span>
              <div className="themeGrid">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    className={`themeButton ${effectiveTheme === theme.value ? "selected" : ""}`}
                    key={theme.value}
                    type="button"
                    onClick={() => updateSetting("theme", theme.value)}
                  >
                    <i>{theme.colors.map((color) => <b key={color} style={{ backgroundColor: color }} />)}</i>
                    <span>{theme.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="debugBlock">
              <span><Settings size={15} /> 连接测试</span>
              <p>只向上游请求模型清单探测连通性，<strong>不调用生图、不上传图片、不扣费</strong>，也不会显示或保存你的 API Key。</p>
              <div className="debugActions">
                <button className="smallButton" type="button" onClick={() => void runConnectionTest()} disabled={isConnectionTesting}>
                  {isConnectionTesting ? <Loader2 className="spin" size={15} /> : <PlugZap size={15} />}
                  <span>{isConnectionTesting ? "测试中…" : "连接测试"}</span>
                </button>
              </div>
              {connectionStatus && (
                <small className={`fieldHint connectionHint ${connectionState}`}>{connectionStatus}</small>
              )}
            </div>
          </section>
        </div>
      )}

      {isDirectoryModalOpen && (
        <div className="modalLayer" onMouseDown={() => setIsDirectoryModalOpen(false)}>
          <section className="saveDirectoryModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>指定文件夹</h2>
                <span>下载图片会保存到这个目录</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setIsDirectoryModalOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <label className="modalField">
              <span><FolderOpen size={15} /> 保存目录</span>
              <input
                value={directoryDraft}
                readOnly
                onClick={() => void pickSaveDirectory()}
                placeholder="点击选择保存目录"
                title="点击选择保存目录"
              />
              <small>{isPickingDirectory ? "正在等待目录选择..." : "点击输入框选择目录，点确定后生效"}</small>
            </label>
            <footer className="directoryModalActions">
              <button className="secondaryButton" type="button" onClick={() => setIsDirectoryModalOpen(false)}>取消</button>
              <button className="primaryButton" type="button" onClick={() => void confirmSaveDirectory()}>
                <Save size={16} />
                <span>确定</span>
              </button>
            </footer>
          </section>
        </div>
      )}

      {isPromptAssistantOpen && (
        <div className="modalLayer promptLayer" onMouseDown={() => setIsPromptAssistantOpen(false)}>
          <section className="promptAssistantModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>提示词助手</h2>
              <button className="iconButton" type="button" onClick={() => setIsPromptAssistantOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <div className="promptAssistantBody">
              <PromptPresetGrid
                categories={promptCategories} activeCategory={promptCategory} onSelectCategory={setPromptCategory}
                dropCategory={promptDropCategory} onDropCategoryChange={setPromptDropCategory}
                search={promptSearch} onSearchChange={setPromptSearch}
                presets={filteredPromptPresets} draggedId={draggedPromptId}
                onApplyPreset={schedulePromptPresetApply} onRenamePreset={renamePromptPresetTitle}
                onRenameCategory={renamePromptCategory} onDropPresetToCategory={dropPromptOnCategory}
                onAddCategory={addPromptCategory} onCreatePreset={openNewPromptEditor}
                onBeginDrag={beginPromptDrag} onEndDrag={endPromptDrag} onDropPresetToPreset={dropPromptOnPreset}
                onEditPreset={editPromptPreset} onDeletePreset={deletePromptPreset}
              />
            </div>
          </section>
        </div>
      )}

      {editingPrompt && (
        <div className="modalLayer promptEditorLayer" onMouseDown={() => setEditingPrompt(null)}>
          <section className="promptEditorModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>编辑提示词</h2>
              <button className="iconButton" type="button" onClick={() => setEditingPrompt(null)}>
                <X size={18} />
              </button>
            </header>
            <div className="promptEditorBody">
              <label className="editorField">
                <span>分类</span>
                <select
                  value={editingPrompt.category}
                  onChange={(event) => updateEditingPrompt("category", event.target.value)}
                >
                  {promptCategories.filter((category) => category !== "全部").map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="editorField">
                <span>标题</span>
                <input
                  value={editingPrompt.title}
                  onChange={(event) => updateEditingPrompt("title", event.target.value)}
                  placeholder="输入标题"
                />
              </label>
              <label className="editorField">
                <span>提示词内容</span>
                <textarea
                  value={editingPrompt.content}
                  onChange={(event) => updateEditingPrompt("content", event.target.value)}
                  placeholder="输入提示词内容"
                />
              </label>
            </div>
            <footer>
              <button className="secondaryButton" type="button" onClick={() => setEditingPrompt(null)}>取消</button>
              <button className="primaryButton" type="button" onClick={saveEditingPrompt}>
                <Save size={16} />
                <span>保存</span>
              </button>
            </footer>
          </section>
        </div>
      )}

      {cropTarget && (
        <CropModal
          item={cropTarget.item}
          ratio={cropTarget.group === "model"
            ? CROP_RETURN_RATIOS.includes(settings.aspectRatio) ? settings.aspectRatio : "3:4"
            : settings.aspectRatio}
          ratioOptions={cropTarget.group === "model" ? CROP_RETURN_RATIOS : null}
          ratioLabel={cropTarget.group === "model" ? "回流比例" : "裁剪比例"}
          processor={processImageFileWithMeta}
          onClose={() => setCropTarget(null)}
          onApply={(item) => applyCropItem(cropTarget.group, item)}
        />
      )}

      {localEditTarget && (
        <LocalEditModal
          item={localEditTarget.item}
          ratio={settings.aspectRatio}
          onRatioChange={(ratio) => updateSetting("aspectRatio", ratio)}
          onClose={() => setLocalEditTarget(null)}
          onApply={(itemId, cropped) => applyLocalEditItem(localEditTarget.group, itemId, cropped)}
          onClear={(itemId) => clearLocalEditItem(localEditTarget.group, itemId)}
          mode="local"
          resolveBaseFile={resolveLocalEditBaseFile}
          ratios={BATCH_LOCAL_EDIT_RATIOS}
          resolveActiveRatio={(r, se) => BATCH_LOCAL_EDIT_RATIOS.includes(r) ? r : BATCH_LOCAL_EDIT_RATIOS.includes(se?.aspectRatio) ? se.aspectRatio : BATCH_LOCAL_EDIT_RATIOS[0]}
          defaultCropRect={defaultLocalEditCrop}
          fallbackToItem={false}
          lockRatioForLoad={true}
          modalDescription="生成后贴回同一坐标，输出同尺寸"
          maskHint="涂抹需要 AI 修改的区域，生成后只把涂抹部分羽化贴回原图。"
          rectHint="拖动选区调整位置，生成后会用羽化边缘贴回原图。"
          baseSizePlaceholder="读取中…"
          clearIconName="RefreshCw"
        />
      )}

      {referenceContextMenu?.reference && (
        <div
          className="imageContextMenu outfitReferenceContextMenu"
          style={{ left: referenceContextMenu.x, top: referenceContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => void sendReferenceThumbToModelUpload(referenceContextMenu.reference)}>
            <Upload size={15} />
            <span>发送到图1上传区</span>
          </button>
        </div>
      )}

      {preview && (
        <div className="modalLayer" onMouseDown={() => setPreview(null)}>
          <section className="previewModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>结果预览 #{preview.order}</h2>
                <span>{preview.timingMs ? formatMs(preview.timingMs) : ""}</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setPreview(null)}><X size={18} /></button>
            </header>
            <div
              className="previewImageFrame outfitPreviewImageFrame"
              onWheel={zoomPreviewByWheel}
              onPointerDown={startPreviewDrag}
              onPointerMove={movePreviewDrag}
              onPointerUp={endPreviewDrag}
              onPointerCancel={endPreviewDrag}
            >
              {resultPreviewTasks.length > 1 && (
                <button className="previewArrow previewArrowLeft" type="button" onClick={(event) => {
                  event.stopPropagation();
                  navigatePreview(-1);
                }} aria-label="上一张">
                  ‹
                </button>
              )}
              <CachedImage
                src={displayResultImageSource(preview.result)}
                alt=""
                draggable
                onDragStart={(event) => beginTaskImageDrag(event, preview)}
                onDragEnd={clearResultDragState}
                style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})` }}
                diagnostic={{ requestId: preview.id, endpoint: "/api/generate-outfit", module: "批量生成", workflowMode: preview.workflowMode || activeOutfitPage.workflowMode || "", placement: "outfit-preview" }}
              />
              {resultPreviewTasks.length > 1 && (
                <button className="previewArrow previewArrowRight" type="button" onClick={(event) => {
                  event.stopPropagation();
                  navigatePreview(1);
                }} aria-label="下一张">
                  ›
                </button>
              )}
            </div>
            {preview.prompt && (
              <button className="previewPrompt" type="button" onClick={() => void copyText(preview.prompt, "提示词已复制")}>
                {preview.prompt}
              </button>
            )}
            <LocalPasteDiagnosticsPanel image={preview.result} />
            <CropReturnDiagnosticsPanel image={preview.result} />
            {preview.qualityCheck && (
              <section className={`previewQualityPanel ${qualityStatusClass(preview.qualityCheck)}`}>
                <header>
                  <strong>{qualityStatusLabel(preview.qualityCheck)}</strong>
                  {preview.qualityCheck.checkedAt && <span>{formatClock(preview.qualityCheck.checkedAt)}</span>}
                </header>
                {preview.qualityCheck.summary && <p>{preview.qualityCheck.summary}</p>}
                <div className="previewQualityFacts">
                  {preview.qualityCheck.faceQuality && <span>脸部：{preview.qualityCheck.faceQuality}</span>}
                  {preview.qualityCheck.poseMatch && <span>姿态：{preview.qualityCheck.poseMatch}</span>}
                  {preview.qualityCheck.outfitMatch && <span>服装：{preview.qualityCheck.outfitMatch}</span>}
                </div>
                {preview.qualityCheck.issues?.length > 0 && (
                  <ul>
                    {preview.qualityCheck.issues.map((issue, index) => <li key={`${issue}_${index}`}>{issue}</li>)}
                  </ul>
                )}
                {preview.qualityCheck.repairPrompt && (
                  <button className="previewQualityRepair" type="button" onClick={() => void copyText(preview.qualityCheck.repairPrompt, "返修提示已复制")}>
                    {preview.qualityCheck.repairPrompt}
                  </button>
                )}
              </section>
            )}
            <footer>
              <button className="primaryButton" type="button" onClick={() => void downloadTask(preview)}>
                <Download size={16} />
                <span>{preview.savedFilename || preview.savedPath ? "已保存" : "保存结果"}</span>
              </button>
              <button className="secondaryButton" type="button" onClick={() => window.open(imageSource(preview.result), "_blank")}>
                <Maximize2 size={16} />
                <span>新窗口打开</span>
              </button>
            </footer>
          </section>
        </div>
      )}

      {imageLightbox && (
        <div className="modalLayer" onMouseDown={() => setImageLightbox(null)}>
          <section className="previewModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>{imageLightbox.title}</h2>
                <span>原图预览</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setImageLightbox(null)}><X size={18} /></button>
            </header>
            <div
              className="previewImageFrame outfitPreviewImageFrame"
              onWheel={zoomPreviewByWheel}
              onPointerDown={startPreviewDrag}
              onPointerMove={movePreviewDrag}
              onPointerUp={endPreviewDrag}
              onPointerCancel={endPreviewDrag}
            >
              <img
                src={imageLightbox.src}
                alt=""
                draggable
                onDragStart={(event) => beginImageDownloadDrag(event, imageLightbox.src, imageLightbox.title || "参考图")}
                style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})` }}
              />
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

