import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckSquare,
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
  Upload,
  Video,
  Wand2,
  X
} from "lucide-react";
import { fileBaseName } from "./shared/file-name.js";
import {
      imageExtension,
  imageFilesFromClipboard,
  isImageFile
} from "./shared/image-input.js";
import {
  LOCAL_EDIT_MASK_MODE,
  LOCAL_EDIT_BRUSH_DEFAULT,
  LOCAL_EDIT_MASK_OPACITY_DEFAULT,
  LOCAL_EDIT_RECT_MODE,
  createInpaintUploadMask,
  imageBitmapFromDataUrl
    } from "./shared/local-edit-mask.js";
import DebouncedTextarea from "./shared/DebouncedTextarea.jsx";
import { DEFAULT_MODELS } from "./shared/models.js";
import {
    channelsForModel,
  convergeSettingsForModel,
  modelCapabilities,
  routingFields
} from "./shared/routing.js";
import {
      localPasteSizeReport,
  resolveLocalEditBaseFile
} from "./shared/local-edit-geometry.js";
import { getAppConfig } from "./api/config.js";
import { describeEmptyResult, formatGenerationError, sanitizeErrorText } from "./shared/generation-errors.js";
import {
  imageFileFromUrl,
  beginImageDownloadDrag,
  brokenImageReason,
  dataUrlFromBlob,
  referenceSource,
  resultImageCardState
} from "./shared/result-image.js";
import { CachedImage } from "./shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "./shared/ui/reference-thumb-tray.jsx";
import { LocalEditModal } from "./features/local-edit/LocalEditModal.jsx";
// 结构化换装意图 + 唯一精简提示词编译器（前端预览与服务端发送同一份实现）。
import {
  OUTFIT_AUTO_PROMPT_CHAR_LIMIT,
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
import { checkOutfitQuality, generateOutfit } from "./api/outfit.js";
import { fetchImageBlob } from "./api/assets.js";
import { emitClientDiagnosticEvent } from "./api/client.js";
import { normalizeApiKeyInput } from "./features/auth/api-key.js";
import {
  RETOUCH_AUTO_PROMPT_CHAR_LIMIT,
  RETOUCH_GOAL_TEXT,
  compileRetouchPrompt,
    isBuiltinRetouchPrompt,
  normalizeRetouchIntent,
  validateRetouchIntent,
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
import {  removeStorageItem, writeJsonStorage } from "./lib/storage/json-storage.js";
import "./outfit-workflow.css";
import "./features/outfit/outfit-intent.css";
import "./features/outfit/white-refine-split.css";
import "./features/outfit/retouch-intent.css";
import { copyTextToClipboard } from "./shared/dom-actions.js";
import { useSaveDirectory } from "./shared/hooks/useSaveDirectory.js";
import { usePreviewDrag } from "./shared/hooks/usePreviewDrag.js";
import { ElapsedTimer } from "./shared/ui/elapsed-timer.jsx";
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
    mergeOutfitTasksWithHistory,
  mergeOutfitLiveRuns,
  readTaskHistory,
  readTaskHistoryAsync,
  persistTaskHistory,
  persistFinishedTaskWhileDetached,
  publishOutfitLiveRun,
  outfitLiveRunsForPage,
    localEditTaskBindingSnapshot,
  prepareOutfitTaskLocalEdit,
  cacheTaskResultImageFile,
  taskDragDownloadName,
  canRerunTask,
  buildRerunReplacementTask,
  canReplaceTaskResult,
  normalizeRandomBackgroundFocus,
  createDocumentObjectUrl,
    outfitLocalSet,
  outfitLocalDeleteByPrefix,
  revokePreviewUrl,
  revokeImageUrls,
    normalizeCropReturnMeta,
  subscribeOutfitLiveRuns
} from "./features/outfit/outfit-task.js";
import {
  BatchResizePanel,
        CropModal,
    MAX_UPLOAD_IMAGES,
  PREPROCESS_OPTIONS,
  PromptPresetGrid,
  RESIZE_OUTPUT_FOLDER,
  UploadZone,
  WorkflowQuickVideoPanel,
        makeId,
    preprocessModeLabel,
  processImageFile
    } from "./features/outfit/outfit-panels.jsx";
import { BACKGROUND_CHANGE_DEFAULT_PROMPT, BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT, BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT, CUSTOM_UPLOAD_LABELS, DEFAULT_OUTFIT_PAGE_NAME, DESIGN_DRAFT_DEFAULT_PROMPT, FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT, FACE_SWAP_DEFAULT_PROMPT, FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT, FACE_SWAP_LOOSE_DEFAULT_PROMPT, FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT, FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT, FACE_SWAP_SHORT_DEFAULT_PROMPT, GARMENT_PART_OPTIONS, LEGACY_FACE_SWAP_DEFAULT_PROMPT, LOCAL_DETAIL_DEFAULT_PROMPT, OUTFIT_DEFAULT_PROMPT, OUTFIT_PAGES_KEY, POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT, POSE_REMIX_DEFAULT_PROMPT, PROMPT_CATEGORIES_KEY, PROMPT_PRESETS_KEY, RANDOM_BACKGROUND_DEFAULT_PROMPT, RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT, RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT, RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT, STORAGE_KEY, THEME_OPTIONS, formatClock, garmentCompositionLabel, loadOutfitPromptCategories, loadOutfitPromptPresets, moveItemByDrop, normalizeBatchConcurrency, normalizeGarmentComposition, normalizeGarmentParts, normalizeGenerationCount, normalizeTheme, qualityBadgeTitle, qualityStatusClass, qualityStatusLabel, readSettings, sameGarmentParts, themeToVars } from "./features/outfit/outfit-top.js";
import { defaultPromptForWorkflowMode, defaultUploadLabelsForPage, ensureWorkflowPages, inferOutfitWorkflowMode, loadOutfitDraftState, makeOutfitPage, mentionsOptionalReferenceImage, mergeOutfitPageSettings, normalizeOutfitPageName, normalizeUploadLabelText, normalizeUploadLabels, persistOutfitDraftState, pickInitialOutfitPage, readOutfitPages, sameUploadLabels, serializeDraftPage, serializeOutfitPage, stripOutfitPageGlobalSettings } from "./features/outfit/outfit-page-actions.js";
import { blobFromOutfitImage, composeCropReturnBlob, composeOutfitLocalEditBlob, composeOutpaintOriginalRegionBlob, createAsyncLimiter, createImageItem, defaultLocalEditCrop, delay, ensureOutfitUploadCanvasRatio, fileFromBlob, groupPreprocessValue, prepareOutpaintUploadCanvas, processImageFileWithMeta } from "./features/outfit/outfit-image-pipeline.js";
import { useOutfitSettingsIntent } from "./features/outfit/use-outfit-settings-intent.js";
import { OutfitPageRow } from "./features/outfit/panels/OutfitPageRow.jsx";
import { ImageFactsPanel } from "./features/outfit/panels/ImageFactsPanel.jsx";
import { OutfitIntentPanel } from "./features/outfit/panels/OutfitIntentPanel.jsx";
import { RetouchIntentPanel } from "./features/outfit/panels/RetouchIntentPanel.jsx";
import { CropReturnDiagnosticsPanel, LegacyModulePanel, LocalPasteDiagnosticsPanel } from "./features/outfit/outfit-panels.jsx";


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


// 2026-09-26：改版后显示名更短（用户要求）：批量换装 → 换装，批量白底图精修 → 精修。
// 旧名字仍作为别名识别（见 normalizeOutfitPageName / isWhiteRefinePageName），
// 老存档里的页面名会在读取时自动迁移到新名字。
const DEFAULT_CUSTOM_PAGE_NAME = "临时需求";
const GENERATION_COUNT_OPTIONS = ["auto", ...Array.from({ length: MAX_UPLOAD_IMAGES }, (_, index) => index + 1)];
const LOCAL_EDIT_BATCH_CONCURRENCY = 5;
const LOCAL_EDIT_BATCH_PREPARE_CONCURRENCY = 2;
const LOCAL_EDIT_BATCH_REQUEST_GAP_MS = 250;
const OUTFIT_RERUN_DRAG_MIME = "application/x-jingyin-outfit-task";
const CROP_RETURN_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
// 2026-09-25：局部回贴选框要能锁定 2:3（竖版服装图常用），但**不改**裁剪回流
// 用的 CROP_RETURN_RATIOS（那是另一条产品语义），所以这里单独一份列表。
const BATCH_LOCAL_EDIT_RATIOS = ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"];
// 2026-09-26：`GARMENT_COMPOSITION_OPTIONS` / `GARMENT_PART_PRESET_OPTIONS`（单件上衣 /
// 外套+内搭 / 套装）只服务"批量改色"的改色范围，批量换装不再使用这套旧式顶层切换。
const GARMENT_PART_PRESET_OPTIONS = [
  { value: "single-upper", label: "单件上衣", parts: ["upper"], composition: "single-upper" },
  { value: "upper-layer", label: "外套+内搭", parts: ["upper"], composition: "upper-layer" },
  { value: "outfit-set", label: "套装", parts: ["upper", "lower"], composition: "outfit-set" }
];
// 2026-09-25：批量尺寸导出的「自动裁剪」功能已整体移除（UI / 状态 / 持久化 / 专用逻辑）。
// 与它无关的导出设置（格式、DPI、最长边、适配方式、填充色、裁剪方式、批量裁剪区域）全部保留。
// 2026-09-26 历次精修上传区标题（只用于把还停在旧标题上的页面迁移过来；用户改过的标题不动）：
//   第一代：批量平铺图/挂拍图 + 可选参考/细节图
//   第二代：多图生图（图1~图N）+ 补充素材（图N+1…）
// 旧默认值：用于把"当年没改过、存的只是默认值"的存档迁到 3500。
// 只对这一个值做迁移，其余自定义值（2000/4000/…）不动。

// 中文注释：AI质检只作为生成后标记和返修提示，不写入或暴露 API Key。


// 2026-09-26：原来的「母版锁版型」三件套（masterFitLock / masterFitSpec / masterFitSourceId）
// 已删除 —— 它锁的是一整段母版提示词，而那段提示词从来没进过服务端最终提示词（死逻辑）。
// 现在图2的结论统一走 `outfitIntent.facts`（结构化服装事实），由唯一编译器插入提示词。
const RANDOM_BACKGROUND_FOCUS_OPTIONS = [
  { value: "default", label: "默认" },
  { value: "upper", label: "上衣" },
  { value: "lower", label: "下装" },
  { value: "set", label: "套装" }
];


// 🔴 与 src/main.jsx 的 `loadPromptPresets` **同名不同义**，不是复制、不许合并（V11-RF-040 裁定：改名不合并）。跨文件引用只写函数名、不写行号（V11-RF-040c 裁决）。
//    两边差别（改名前逐对 diff 的结论）：
//      · main 侧是**简单版**：stored 非空就返回 stored（逐条归一化、过滤空内容），否则返回 builtinPrompts；
//      · 本侧（outfit）是**合并版**：内置库优先覆盖非 custom 项的 title/content，再补回 stored 缺失的内置项；
//      · 两边读的 localStorage 键也不同 —— main：`${STORAGE_PREFIX}-prompt-library-*`；
//        outfit：`jingyin-outfit-workflow-prompt-library-*`。
//    ⇒ 统一任一侧都会改变「用户看到的提示词列表」，属**行为归一决策**（storage key 是否合一 = 产品决策，另立单）。
//    ⇒ 本单只做**改名**，让名字名实相符；不动任何兜底数据、不动合并策略、不动 storage key。
// 🔴 与 src/main.jsx 的 `loadPromptCategories` **同名不同义**（V11-RF-040 裁定：改名不合并）。跨文件引用只写函数名、不写行号（V11-RF-040c 裁决）。
//    函数骨架两边逐字相同，**唯一差别是兜底常量**：
//      · main 侧用写死的 5 项 `promptCategories` = ["全部","常用","批量复刻","批量sku","局部迁移"]；
//      · 本侧（outfit）用由 PROMPT_PRESET_GROUPS / PROMPT_BUILTIN_PRESETS **动态聚合**的 `PROMPT_CATEGORIES`。
//    ⇒ 同理只改名、不合并、不豁免（豁免机制一旦存在，迟早被用来掩盖真重复）。
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
  const {
    beginPreviewDrag: startPreviewDrag,
    movePreviewDrag,
    endPreviewDrag,
    changeGalleryZoom,
    endDrag: endOutfitPageDrag,
  } = usePreviewDrag({
    previewDragRef,
    previewPan,
    setPreviewPan,
    closePreview: closePreviewModal,
    setGalleryZoom,
    resetDragged: setDraggedPageId,
    resetDropTarget: setPageDropTarget
  });
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, resultPreviewTasks]);

  const {
    updateSetting,
    enableGenerationCountAutoLink,
    analyzeImageFacts,
    setMasterClothing,
    patchOutfitIntent,
    toggleOutfitPart,
    updateOutfitWearingValue,
    updateOutfitFact,
    wearingFieldValue,
    patchRetouchIntent,
    toggleGarmentPart,
    applyGarmentPartPreset,
    runConnectionTest,
    openSettings,
    saveSettings,
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
    saveEditingPrompt,
    schedulePromptPresetApply,
    renamePromptPresetTitle,
    handlePromptKeyDown,
    addEvent,
    updateTaskRuntime,
    beginGenerationRun,
    endGenerationRun,
  } = useOutfitSettingsIntent({
    settings,
    setSettings,
    config,
    isDesignDraftWorkflow,
    imageFactsAnalyzing,
    setImageFactsAnalyzing,
    effectiveApiKey,
    selectedFixedClothing,
    outfitIntent,
    outfitIntentSummary,
    fixedClothingId,
    setFixedClothingId,
    outfitPromptHandEditedRef,
    retouchPromptHandEditedRef,
    setIsConnectionTesting,
    setConnectionState,
    setConnectionStatus,
    embeddedMode,
    onOpenHostSettings,
    apiKeyDraft,
    setApiKeyDraft,
    setApiSaveStatus,
    setIsSettingsOpen,
    promptCategories,
    setPromptCategories,
    promptCategory,
    setPromptCategory,
    setPromptPresets,
    editingPrompt,
    setEditingPrompt,
    draggedPromptId,
    setDraggedPromptId,
    setPromptDropCategory,
    setIsPromptAssistantOpen,
    promptClickTimerRef,
    setInlineMessage,
    setEvents,
    tasksRef,
    setTasks,
    runningGenerationCountRef,
    setRunning,
    startBatch,
  });

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
  const {
    refreshSaveDirectory,
    openDirectoryModal,
    confirmSaveDirectory,
    pickSaveDirectory,
  } = useSaveDirectory(saveDirectoryDeps);

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

  // 预览平移拖拽 / 画廊缩放 / 拖拽复位 已统一由 usePreviewDrag 提供（见上文解构），此处不再重复定义。

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
    // 蒙版换装（mask-inpaint）：换装 + 涂抹蒙版模式时，把本地蒙版裁到与上传 cropFile 同框、
    // 反转 alpha（透明=重绘服装区 / 不透明白=保留人体），随请求发上游做协议级局部修改。
    // 局部回贴（local-detail）与其它 workflow 不置此开关，保持原行为。
    let inpaintMaskFile = null;
    if (taskIsOutfit && localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl) {
      const maskImage = await imageBitmapFromDataUrl(localEdit.maskDataUrl);
      if (maskImage) {
        const maskCanvas = createInpaintUploadMask(maskImage, localEdit.cropRect);
        if (maskCanvas) {
          inpaintMaskFile = await new Promise((resolve) => {
            maskCanvas.toBlob((blob) => {
              resolve(blob ? new File([blob], `mask_${task.order}_${task.modelItem.name}.png`, { type: "image/png" }) : null);
            }, "image/png");
          });
        }
        maskImage.close?.();
      }
    }
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
      maskEdit: Boolean(inpaintMaskFile),
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
    if (inpaintMaskFile instanceof Blob) {
      form.append("mask", inpaintMaskFile, `mask_${task.order}_${task.modelItem.name}`);
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
      // V38 几何对齐：把「选框比例 vs 生成图比例」的相对差（%）与生成尺寸一起进 COMPOSE 详情。
      // 贴回是等比拉伸填满选框，比例差越大 ⇒ 模型返回图被挤压得越狠 ⇒ 描边区外缘的缝越明显。
      const localEditAspectMismatchPct = Number(localEditDiagnostics.aspectMismatchPct || 0);
      emitClientDiagnosticEvent({
        requestId: task.id,
        stage: "client-generation-local-paste-composed",
        endpoint: "/api/generate-outfit",
        method: "COMPOSE",
        ok: true,
        detail: {
          taskId: task.id,
          baseName: task.modelItem?.name || "",
          localPaste: localPasteSizes,
          generatedWidth: localEditDiagnostics.generatedWidth || 0,
          generatedHeight: localEditDiagnostics.generatedHeight || 0,
          aspectMismatchPct: localEditAspectMismatchPct
        }
      });
      if (!localPasteSizes.matches) {
        addEvent("贴回尺寸异常", `底图 ${localPasteSizes.base || "?"} → 输出 ${localPasteSizes.output || "?"}`);
      }
      if (Math.abs(localEditAspectMismatchPct) > 1) {
        addEvent("贴回比例偏差", `选框与生成图比例差 ${localEditAspectMismatchPct}%（>${1}% 会出现描边缝）`);
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

  function renderResultQueue() {
    return (
      <section className="resultPanel queuePanel" id="result-archive-section">
        {/* 精修页专属：结果图中线剪裁开关（样式与 3.0 一致，只在精修页出现）。 */}
        {isWhiteRefineWorkflow && renderSplitHalvesStrip()}
        <div className="taskGrid" ref={taskGridRef} style={{ "--asset-card-min": `${galleryCardMin}px` }}>
          {visibleTasks.map((task, taskIndex) => {
            const selected = selectedTaskIds.has(task.id);
            const durationMs = taskDurationMs(task);
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
                  <strong>{runningTask ? <ElapsedTimer startedAt={task.startedAt} /> : `${task.imageSize || settings.imageSize} · ${task.aspectRatio || settings.aspectRatio}`}</strong>
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
              sideControls={isOutfitWorkflow ? <ImageFactsPanel
                outfitIntent={outfitIntent}
                selectedFixedClothing={selectedFixedClothing}
                outfitIntentSummary={outfitIntentSummary}
                outfitRecognizedFacts={outfitRecognizedFacts}
                imageFactsAnalyzing={imageFactsAnalyzing}
                factsDetailOpen={factsDetailOpen}
                setFactsDetailOpen={setFactsDetailOpen}
                analyzeImageFacts={analyzeImageFacts}
                updateOutfitFact={updateOutfitFact}
              /> : null}
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
                <OutfitIntentPanel
                  outfitIntent={outfitIntent}
                  outfitLayer={outfitLayer}
                  outfitPreview={outfitPreview}
                  outfitWearingFieldList={outfitWearingFieldList}
                  wearingDetailOpen={wearingDetailOpen}
                  setWearingDetailOpen={setWearingDetailOpen}
                  toggleOutfitPart={toggleOutfitPart}
                  patchOutfitIntent={patchOutfitIntent}
                  updateOutfitWearingValue={updateOutfitWearingValue}
                  wearingFieldValue={wearingFieldValue}
                />
              </div>
            )}
            {/* 精修设置：三组选择排成一条，占满整行 —— 下面才是提示词 + 用户补充并排。 */}
            {isWhiteRefineWorkflow && (
              <div className="retouchSettingsRow">
                <RetouchIntentPanel
                  retouchIntent={retouchIntent}
                  patchRetouchIntent={patchRetouchIntent}
                />
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
              <OutfitPageRow
                showPromptButton
                outfitPages={outfitPages}
                activeOutfitPageId={activeOutfitPageId}
                draggedPageId={draggedPageId}
                pageDropTarget={pageDropTarget}
                activePageDeleteLocked={activePageDeleteLocked}
                setIsPromptAssistantOpen={setIsPromptAssistantOpen}
                switchOutfitPage={switchOutfitPage}
                renameOutfitPage={renameOutfitPage}
                updateOutfitPageDropTarget={updateOutfitPageDropTarget}
                setPageDropTarget={setPageDropTarget}
                dropOutfitPage={dropOutfitPage}
                endOutfitPageDrag={endOutfitPageDrag}
                beginOutfitPageDrag={beginOutfitPageDrag}
                createOutfitPageFromCurrent={createOutfitPageFromCurrent}
                toggleOutfitPageDeleteLock={toggleOutfitPageDeleteLock}
                deleteOutfitPage={deleteOutfitPage}
              />

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

