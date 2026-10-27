import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  FolderOpen,
  Images,
  Upload,
  Wand2,
  X
} from "lucide-react";
import { DEFAULT_MODELS } from "./shared/models.js";
import { GALLERY_CARD_MIN_BASE } from "./shared/gallery-layout.js";
import {
    channelsForModel,
  modelCapabilities
} from "./shared/routing.js";
import {
  resolveLocalEditBaseFile
} from "./shared/local-edit-geometry.js";
import { beginImageDownloadDrag } from "./shared/result-image.js";
// CachedImage 已随 preview 浮层迁至 src/features/outfit/panels/ResultPreviewModal.jsx
import { LocalEditModal } from "./features/local-edit/LocalEditModal.jsx";
import { AnnotationEditModal } from "./features/local-edit/AnnotationEditModal.jsx";
import { Button } from "./shared/ui/Button";
import { Modal } from "./shared/ui/Modal.jsx";
import { ModuleHeader } from "./shared/ui/ModuleHeader";
// 结构化换装意图 + 唯一精简提示词编译器（前端预览与服务端发送同一份实现）。
import {
  OUTFIT_AUTO_PROMPT_CHAR_LIMIT,
  compileOutfitPrompt,
  normalizeOutfitIntent,
  recognizedFactKeys,
  resolveUpperLayer,
  summarizeOutfitIntent,
  visibleWearingFields
} from "./shared/outfit-intent.js";
import {
  getSaveDirectory,
  openSaveDirectoryRequest,
  pickSaveDirectory as pickSaveDirectoryRequest,
  setSaveDirectory as setSaveDirectoryRequest
} from "./api/save.js";
import { normalizeApiKeyInput } from "./features/auth/api-key.js";
import {
  RETOUCH_AUTO_PROMPT_CHAR_LIMIT,
  compileRetouchPrompt,
  normalizeRetouchIntent
} from "./shared/retouch-intent.js";
import "./outfit-workflow.css";
import "./features/outfit/outfit-intent.css";
import "./features/outfit/white-refine-split.css";
import "./features/outfit/retouch-intent.css";
import { useSaveDirectory } from "./shared/hooks/useSaveDirectory.js";
import { usePreviewDrag } from "./shared/hooks/usePreviewDrag.js";
import {
  readTaskHistory,
  normalizeRandomBackgroundFocus,
  displayResultImageSource
} from "./features/outfit/outfit-task.js";
import { BatchResizePanel } from "./features/outfit/panels/BatchResizePanel.jsx";
import { CropModal } from "./features/outfit/panels/OutfitCropModal.jsx";
import { MAX_UPLOAD_IMAGES, PREPROCESS_OPTIONS, preprocessModeLabel } from "./features/outfit/outfit-image-utils.js";
import { PromptPresetGrid } from "./features/outfit/panels/PromptPresetGrid.jsx";
import { WorkflowQuickVideoPanel } from "./features/outfit/panels/WorkflowQuickVideoPanel.jsx";
import { DEFAULT_OUTFIT_PAGE_NAME, loadOutfitPromptCategories, loadOutfitPromptPresets, normalizeRecolorPart, normalizeRecolorUpperLayer, normalizeGenerationCount, normalizeTheme, readSettings, themeToVars } from "./features/outfit/outfit-top.js";
import { inferOutfitWorkflowMode, mergeOutfitPageSettings, normalizeUploadLabels, pickInitialOutfitPage, readOutfitPages, stripOutfitPageGlobalSettings } from "./features/outfit/outfit-page-actions.js";
import {  createAsyncLimiter, defaultLocalEditCrop, groupPreprocessValue, processImageFileWithMeta } from "./features/outfit/outfit-image-pipeline.js";
import { useOutfitSettingsIntent } from "./features/outfit/use-outfit-settings-intent.js";
import { useOutfitPages } from "./features/outfit/use-outfit-pages.js";
import { useOutfitPageSwitch } from "./features/outfit/handlers/outfit-page-switch.js";
import { useOutfitPreviewModal } from "./features/outfit/handlers/outfit-preview-modal.js";
import { useOutfitRecolorPart } from "./features/outfit/handlers/outfit-recolor-part.js";
import { useOutfitTaskRetry } from "./features/outfit/handlers/outfit-task-retry.js";
import { useOutfitUploads } from "./features/outfit/use-outfit-uploads.js";
import { useOutfitRefHandlers } from "./features/outfit/handlers/outfit-ref-handlers.js";
import { useOutfitSaveHandlers } from "./features/outfit/handlers/outfit-save-handlers.js";
import { useOutfitBatchExecution } from "./features/outfit/handlers/outfit-batch-execution.js";
import { useOutfitResultDragHandlers } from "./features/outfit/handlers/outfit-result-drag.js";
import { useOutfitSelectionHandlers } from "./features/outfit/handlers/outfit-selection.js";
import { useOutfitEffects } from "./features/outfit/handlers/outfit-effects.js";
import { useOutfitSplitHalvesHandlers } from "./features/outfit/handlers/outfit-split-halves.js";
import { LegacyModulePanel } from "./features/outfit/panels/LegacyModulePanel.jsx";
import WorkbenchSidebar from "./features/outfit/panels/WorkbenchSidebar.jsx";
import OutfitSettingsModal from "./features/outfit/panels/OutfitSettingsModal.jsx";
import OutfitWorkbench from "./features/outfit/panels/OutfitWorkbench.jsx";
import OutfitComposer from "./features/outfit/panels/OutfitComposer.jsx";
import ResultPreviewModal from "./features/outfit/panels/ResultPreviewModal.jsx";
import PromptEditorModal from "./features/outfit/panels/PromptEditorModal.jsx";


// V5.0-008：documentBoot 一次性标志已随 effect 簇迁至 features/outfit/handlers/outfit-effects.js。

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
// 2026-10-15 V66：DEFAULT_CUSTOM_PAGE_NAME 随 createOutfitPageFromCurrent 迁入 use-outfit-pages.js。
const GENERATION_COUNT_OPTIONS = ["auto", ...Array.from({ length: MAX_UPLOAD_IMAGES }, (_, index) => index + 1)];
const LOCAL_EDIT_BATCH_CONCURRENCY = 5;
const LOCAL_EDIT_BATCH_PREPARE_CONCURRENCY = 2;
const LOCAL_EDIT_BATCH_REQUEST_GAP_MS = 250;
const CROP_RETURN_RATIOS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
// 2026-09-25：局部回贴选框要能锁定 2:3（竖版服装图常用），但**不改**裁剪回流
// 用的 CROP_RETURN_RATIOS（那是另一条产品语义），所以这里单独一份列表。
const BATCH_LOCAL_EDIT_RATIOS = ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"];
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


// 🔴 与 src/main.jsx 的 `loadPromptPresets` / `loadPromptCategories` **曾**同名不同义（V11-RF-040 裁定改名不合并）。
//    历史差别（改名前逐对 diff 的结论，2026-10-19 前）：
//      · main 侧原是**简单版**：stored 非空就返回 stored（逐条归一化、过滤空内容），否则返回 builtinPrompts；
//      · 本侧（outfit）原是**合并版**：内置库优先覆盖非 custom 项的 title/content，再补回 stored 缺失的内置项；
//      · 两边读的 localStorage 键也不同 —— main：`${STORAGE_PREFIX}-prompt-library-*`；outfit：`jingyin-outfit-workflow-prompt-library-*`。
//    V118（2026-10-19）已推翻"不合并"裁定：提示词助手改为纯用户自建库，两侧内置注入/回灌/覆盖逻辑**都**删除，
//    行为口径已统一，故收口到 src/shared/prompt-library.js 的 loadPromptLibraryPresets / loadPromptLibraryCategories
//    （本文件这两个函数现在只是薄封装、转发给共享函数，传各自的 storage key）。
//    **storage key 仍是两套前缀**（产品决策未变），所以"同名"只是历史命名，现在语义已一致。
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
  const [activeUploadGroup, setActiveUploadGroup] = useState(() => initialOutfitPage.activeUploadGroup || "model");
  const [originalLibrary, setOriginalLibrary] = useState(() => initialOutfitPage.originalLibrary || []);
  const [imageLightbox, setImageLightbox] = useState(null);
  const [running, setRunning] = useState(false);
  // 图2服装事实：分析中状态 + "展开详细穿法/事实"的折叠开关（默认只显示紧凑摘要）。
  const [imageFactsAnalyzing, setImageFactsAnalyzing] = useState(false);
  const [wearingDetailOpen, setWearingDetailOpen] = useState(false);
  const [_factsDetailOpen, _setFactsDetailOpen] = useState(false); // V76（用户要求·暂时隐藏）停用：图2事实详情折叠开关；state 保留，恢复时去掉 _ 前缀（V80 标记）
  const [inlineMessage, setInlineMessage] = useState("");
  const [, setEvents] = useState([]);
  const [cropTarget, setCropTarget] = useState(null);
  const [localEditTarget, setLocalEditTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  // V138：标注式 AI 编辑目标（批量生成结果卡 / 结果预览共用）。存「结果图描述符」而非整条任务，
  // 避免把整条 task 快照塞进弹窗 state；提交时再按 id 回查任务走重刷分支。
  const [outfitAnnotationTarget, setOutfitAnnotationTarget] = useState(null);
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
  // V5.0-012：预览弹窗域（useOutfitPreviewModal，调用点见下文 useOutfitEffects 前）经本 ref
  // 晚绑定供给 usePreviewDrag 的 closePreview 入参（同 clearSelectionRef 惯例）；
  // usePreviewDrag 仅在 endPreviewDrag 指针事件里调用它，事件期读取恒新。
  const closePreviewRef = useRef(null);
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
    closePreview: () => closePreviewRef.current?.(),
    setGalleryZoom,
    resetDragged: setDraggedPageId,
    resetDropTarget: setPageDropTarget
  });
  const promptClickTimerRef = useRef(null);
  const workspaceRef = useRef(null);
  const taskGridRef = useRef(null);
  const tasksRef = useRef(tasks);
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
  // V111（用户要求·1板块）：自定义改色页的「更换部位」单选 —— 切换逻辑（含提示词联动）已迁入
  // handlers/outfit-recolor-part.js（V5.0-011）；此处仅留派生值 recolorPart/recolorUpperLayer（喂 OutfitComposer props）。
  const recolorPart = normalizeRecolorPart(settings.recolorPart);
  const recolorUpperLayer = normalizeRecolorUpperLayer(settings.recolorUpperLayer);

  // 批量换装的结构化意图（唯一来源）。
  const outfitIntent = normalizeOutfitIntent(settings.outfitIntent);
  const outfitLayer = resolveUpperLayer(outfitIntent);
  const outfitIntentSummary = summarizeOutfitIntent(outfitIntent);
  const outfitWearingFieldList = visibleWearingFields(outfitIntent);
  const _outfitRecognizedFacts = recognizedFactKeys(outfitIntent.facts); // V76（用户要求·暂时隐藏）停用；recognizedFactKeys 数据流保留，恢复时去掉 _ 前缀（V80 标记）
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
  // V5.0-007：原来四个计数各跑一次 filter ⇒ 每次渲染 4 次 O(n)；连同 visibleTasks /
  // resultPreviewTasks 共 7 次 O(n) + 6 个临时数组分配。改为「状态计数一次遍历」+「派生 useMemo 缓存」。
  // 语义等价：task.status 是单值，一个任务不可能同时命中两个分支 ⇒ else-if 链与原 4 次独立
  // filter 逐状态完全等价（pending 等其它状态两边都 +0）。
  const taskCounts = useMemo(() => {
    let completed = 0;
    let failed = 0;
    let running = 0;
    let detached = 0;
    for (const task of tasks) {
      if (task.status === "success") completed += 1;
      else if (task.status === "failed") failed += 1;
      else if (task.status === "running") running += 1;
      else if (task.status === "detached") detached += 1;
    }
    return { completed, failed, running, detached };
  }, [tasks]);
  const completedCount = taskCounts.completed;
  const failedCount = taskCounts.failed;
  const runningCount = taskCounts.running;
  const detachedCount = taskCounts.detached;
  const imageCount = completedCount;
  // 依赖只取 useState 源：tasks（:308）/ resultFilter（:310），二者声明均早于本处 ⇒ 无 TDZ 风险
  // （V136 就是派生消费了后面才声明的变量而崩，此处已复核）。
  // 引用稳定后，:1022 那个以 resultPreviewTasks 为依赖的 keydown effect 不再每次重渲染解绑/重绑。
  const visibleTasks = useMemo(
    () => (resultFilter === "video" ? [] : resultFilter === "image" ? tasks.filter((task) => task.result) : tasks),
    [tasks, resultFilter]
  );
  const resultPreviewTasks = useMemo(() => visibleTasks.filter((task) => task.result), [visibleTasks]);
  // V136 修复：selectedCount / selectedCompletedCount 需要 selectedTaskIds，而它自 V133 起由
  // useOutfitSelectionHandlers（下方 ~1241 行）才声明。此处 tasks 非空时 reduce 回调在声明前执行 =>
  // "Cannot access 'selectedTaskIds' before initialization"（tasks 为空时 reduce 不执行回调，故空态不崩、
  // 极具迷惑性；v4.0.13 二进制已实测崩溃）。两值消费点全在 JSX（~1658/1661），已下移至 hook 之后。
  const galleryZoomPercent = Math.round(galleryZoom * 100);
  // V138：基准值统一取自 shared/gallery-layout.js（与快捷生成同一真相源，改一处两边一致）。
  const galleryCardMin = Math.round(GALLERY_CARD_MIN_BASE * galleryZoom);
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
          : isWhiteRefineWorkflow
            ? "精修"
            : isFaceSwapWorkflow
              ? "批量换脸"
              : isLocalDetailWorkflow
                ? "局部回贴"
                : isCustomWorkflow
                  ? (activeOutfitPage.name || "自定义")
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
          : isWhiteRefineWorkflow
            ? "通用白底精修提示词"
            : isFaceSwapWorkflow
              ? "通用换脸提示词"
              : isLocalDetailWorkflow
                ? "通用局部回贴提示词"
                : isCustomWorkflow
                  ? "通用改色提示词"
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
          : isWhiteRefineWorkflow
            ? "长期复用的白底精修规则，例如去衣架、换白底、整理压痕和褶皱，但不改服装细节颜色。"
            : isFaceSwapWorkflow
              ? "长期复用的换脸规则，例如图1锁定身体衣服姿势背景，图2只提供脸部身份和可融合发型方向。"
              : isLocalDetailWorkflow
                ? "长期复用的局部服装细节规则，例如只改点名细节、图2只取结构、颜色材质跟图1。"
                : isCustomWorkflow
                  ? "长期复用的改色规则，例如：把图1模特的上衣改成图2上衣的颜色，仅改变上衣颜色，不添加缝线、不改变纹理、不添加细节。"
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

  // 只读提示词框随内容自撑高度（见下）；这里先把 ref 挂到 label 上，方便取到里面的 textarea。
  const promptFieldRef = useRef(null);
  // 「通用换装提示词」是否被用户手改过：手改后先不再自动覆盖，直到下一次改换装设置/补充提示词。
  const outfitPromptHandEditedRef = useRef(false);
  // 精修同理：「通用白底精修提示词」被手改过就先不自动覆盖，直到下一次改精修设置/用户补充。
  const retouchPromptHandEditedRef = useRef(false);

  // V5.0-008（R1 effect 簇迁移）：原 654–1045 的 28 个 useEffect 整块搬入
  // useOutfitEffects（src/features/outfit/handlers/outfit-effects.js），按原顺序逐字迁移。
  // 调用点置于三个 ref 声明之后、原 E24 位置之前 ⇒ 28 个 effect 执行顺序逐条不变；
  // 组件内已无其它 effect（下游 hook 的 effect 均在更晚调用点，相对顺序亦不变）。
  // 晚绑定：refreshSaveDirectory 来自 useSaveDirectory（下方，晚于本调用点），
  // 经 refreshSaveDirectoryRef 在 effect 体内读取（effect 后于整棵 render 执行，ref 必已刷新）。
  const refreshSaveDirectoryRef = useRef(null);
  // V5.0-010：clearSelection 晚绑定（useOutfitSelectionHandlers 晚于本调用点）。
  const clearSelectionRef = useRef(null);
  // V5.0-010：页面切换域三函数搬入 handlers/outfit-page-switch.js（V135 第⑤项复扫落地）。
  // ⚠️ 调用点必须早于下方 useOutfitEffects：其 ctx 消费 loadOutfitPage /
  //   buildCurrentOutfitPageSnapshot（原为 hoisted function 声明，641 行引用无碍；
  //   改为 hook 解构后若仍居其后即 TDZ——V136 同族事故）。本 hook 是纯函数工厂
  //   （内部无任何 React hook）⇒ 上移零 hook 顺序影响；ctx 依赖的全部 state/setter
  //   均在 275–363 声明，亦早于本调用点。
  // clearSelection 经 clearSelectionRef 晚绑定（selection hook 晚于本调用点，同 refreshSaveDirectoryRef 惯例）。
  const {
    buildCurrentOutfitPageSnapshot,
    loadOutfitPage
  } = useOutfitPageSwitch({
    activeOutfitPage, activeOutfitPageId,
    uploadLabels, setUploadLabels,
    settings, setSettings,
    modelImages, setModelImages,
    clothingImages, setClothingImages,
    referenceImages, setReferenceImages,
    fixedClothingId, setFixedClothingId,
    tasks, setTasks,
    originalLibrary, setOriginalLibrary,
    activeUploadGroup, setActiveUploadGroup,
    setResultFilter,
    setPreview,
    setImageLightbox,
    setCropTarget,
    setLocalEditTarget,
    setDownloadFeedbackIds,
    setInlineMessage,
    setIsPromptAssistantOpen,
    setEditingPrompt,
    getClearSelection: () => clearSelectionRef.current?.()
  });

  // V5.0-012：预览弹窗域（closePreviewModal / navigatePreview / zoomPreviewByWheel）。
  // 调用点 = 两个时序约束的唯一交集（依据详见 handlers/outfit-preview-modal.js 头注）：
  //   - 须晚于 resultPreviewTasks 派生值：navigatePreview 的 ctx 取值；
  //   - 须早于 useOutfitEffects(下行)：E28 keydown 闭包渲染期消费
  //     navigatePreview / closePreviewModal（收真实 const，无需 ref 包装）。
  // usePreviewDrag(上行) 的 closePreview 入参早于本调用点，经 closePreviewRef 晚绑定读取
  // （刷新点紧随本解构，每渲染刷新；usePreviewDrag 仅事件期调用，恒新）。
  const {
    closePreviewModal,
    navigatePreview,
    zoomPreviewByWheel
  } = useOutfitPreviewModal({
    preview,
    resultPreviewTasks,
    setPreview,
    setImageLightbox,
    setPreviewZoom
  });
  closePreviewRef.current = closePreviewModal;
  useOutfitEffects({
    view, hostTheme, hostApiKey,
    setActiveView,
    tasks, setTasks,
    settings, setSettings, setConfig,
    outfitPages, setOutfitPages, activeOutfitPageId, setActiveOutfitPageId,
    uploadLabels,
    modelImages, clothingImages, referenceImages, fixedClothingId,
    originalLibrary, activeUploadGroup,
    promptPresets, promptCategories,
    ratios, preview, imageLightbox, isSettingsOpen, activeView,
    isOutfitWorkflow, isWhiteRefineWorkflow,
    outfitPromptWithNote, retouchAutoPrompt,
    visibleTasks, resultPreviewTasks, galleryCardMin,
    activeOutfitPage, historyReady, draftReady,
    setHistoryReady, setDraftReady,
    setApiKeyDraft, setApiSaveStatus,
    setPreviewZoom, setPreviewPan, setPreview,
    tasksRef, visibleTaskIdsRef, outfitMountedRef,
    pendingDraftSnapshotRef, resultImageCacheInFlightRef,
    historyHydratingRef, draftHydratingRef, previewDragRef,
    promptFieldRef, outfitPromptHandEditedRef, retouchPromptHandEditedRef,
    taskGridRef, refreshSaveDirectoryRef,
    loadOutfitPage, buildCurrentOutfitPageSnapshot,
    navigatePreview, closePreviewModal
  });

  // P6-3：startBatch 由 useOutfitBatchExecution 在下方定义（晚于本 hook），
  // 用 ref 做晚绑定，供 settings-intent 的 Ctrl+Enter 快捷键在事件触发时再读取，避免 TDZ。
  const startBatchRef = useRef(null);

  const {
    updateSetting,
    enableGenerationCountAutoLink,
    analyzeImageFacts: _analyzeImageFacts, // V76（用户要求·暂时隐藏）停用；hook 导出保留，恢复时去掉 _ 前缀（V80 标记）
    setMasterClothing,
    patchOutfitIntent,
    toggleOutfitPart,
    updateOutfitWearingValue,
    updateOutfitFact: _updateOutfitFact, // V76（用户要求·暂时隐藏）停用；hook 导出保留，恢复时去掉 _ 前缀（V80 标记）
    wearingFieldValue,
    patchRetouchIntent,
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
    startBatchRef,
  });

  // V5.0-011：改色部位/层级域搬入 handlers/outfit-recolor-part.js。
  // 调用点置于 useOutfitSettingsIntent 之后（ctx 消费 addEvent）；派生值 recolorPart/recolorUpperLayer
  // 留在上方（喂 OutfitComposer props）经 ctx 注入；消费方仅 JSX，纯函数工厂无 hook 顺序影响。
  const {
    selectRecolorPart,
    selectRecolorUpperLayer
  } = useOutfitRecolorPart({
    settings, setSettings,
    recolorPart, recolorUpperLayer,
    addEvent
  });

  // 2026-10-15 V66 (P5-4)：页面管理域 9 函数搬入 use-outfit-pages.js（原 1267–1465，派发日实测）。
  // deps 21 项（9 state + 6 setter + 1 ref + 4 函数 + 1 派生）每次 render 重建注入，薄壳模式行为零变化。
  const {
    switchOutfitPage,
    createOutfitPageFromCurrent,
    beginOutfitPageDrag,
    updateOutfitPageDropTarget,
    dropOutfitPage,
    renameOutfitPage,
    toggleOutfitPageDeleteLock,
    deleteOutfitPage
  } = useOutfitPages({
    activeOutfitPageId, setActiveOutfitPageId,
    tasks, running, setRunning,
    runningGenerationCountRef,
    outfitPages, setOutfitPages,
    draggedPageId, setDraggedPageId,
    pageDropTarget, setPageDropTarget,
    uploadLabels, setUploadLabels,
    settings, setSettings,
    activeOutfitPage,
    addEvent, loadOutfitPage, endOutfitPageDrag, buildCurrentOutfitPageSnapshot
  });

  // 2026-10-15 V66 (P5-4)：上传图片组域 18 函数搬入 use-outfit-uploads.js（原 1291–1670，阶段A 后实测）。
  // deps 27 项（17 state + 9 setter + 3 派生布尔 + 3 派生值 + 1 常量 + 4 函数）每次 render 重建注入，薄壳模式行为零变化。
  const {
    editUploadLabel,
    addImages,
    openReferenceContextMenu,
    sendReferenceThumbToModelUpload,
    removeImage,
    replaceImage,
    clearImageGroup,
    toggleImage,
    reorderImage,
    applyCropItem,
    openLocalEdit,
    applyLocalEditItem,
    clearLocalEditItem,
    applyGroupPreprocess,
    applyGlobalPreprocess,
    handleWorkspacePaste,
    removeOriginalImage
  } = useOutfitUploads({
    activeOutfitPage,
    uploadLabels, setUploadLabels,
    modelImages, setModelImages,
    clothingImages, setClothingImages,
    referenceImages, setReferenceImages,
    originalLibrary, setOriginalLibrary,
    fixedClothingId, setFixedClothingId,
    localEditTarget, setLocalEditTarget,
    cropTarget, setCropTarget,
    setReferenceContextMenu,
    activeUploadGroup,
    outfitMaxImages,
    allUploadImages,
    isOutfitWorkflow, isPoseRemixWorkflow, isFaceSwapWorkflow,
    settings, updateSetting, enableGenerationCountAutoLink,
    BATCH_LOCAL_EDIT_RATIOS,
    addEvent
  });

  // V133 第二刀：任务选择删除域搬入 useOutfitSelectionHandlers。
  // 域内自含 selectedTaskIds 状态；外部只注入 tasksRef/setter/preview/addEvent。
  // 注意：clearSelection 被 useOutfitRefHandlers ctx 与页面切换域
  // （handlers/outfit-page-switch.js 的 resetOutfitPageTransients，经 clearSelectionRef 晚绑定）消费，
  // 故本 hook 调用点必须早于 ref-handlers。
  const {
    selectedTaskIds,
    setSelectedTaskIds,
    toggleTaskSelected,
    clearSelection,
    deleteSelected,
    deleteResultTask
  } = useOutfitSelectionHandlers({
    tasksRef,
    setTasks,
    setBrokenTaskImages,
    setPreview,
    preview,
    addEvent
  });
  // V5.0-010：供页面切换域 resetOutfitPageTransients 晚绑定读取（同 refreshSaveDirectoryRef 惯例）。
  clearSelectionRef.current = clearSelection;

  // V136：从 ~497 行原位下移（消费点仅 ~1658/1661 的 JSX）。必须在 useOutfitSelectionHandlers
  // 声明 selectedTaskIds 之后；hook 执行顺序未变，只是两个纯派生 const 换了声明位置。
  const selectedCount = tasks.reduce((count, task) => count + (selectedTaskIds.has(task.id) ? 1 : 0), 0);
  const selectedCompletedCount = tasks.reduce((count, task) => count + (selectedTaskIds.has(task.id) && task.result ? 1 : 0), 0);

  // V134 第三刀：拆分半幅域搬入 useOutfitSplitHalvesHandlers。
  // 顺序约束：晚于 patchRetouchIntent 来源（useOutfitSettingsIntent）、早于 setSplitNote 消费方
  // （useOutfitSaveHandlers 的 splitWhiteRefineResult 实时状态回写）。
  const {
    splitHalves,
    splitNote,
    setSplitNote,
    toggleSplitHalves,
    patchRetouchIntentWithSplit
  } = useOutfitSplitHalvesHandlers({
    retouchIntent,
    patchRetouchIntent
  });

  // 2026-10-15 P6-1：参考图菜单 / 缓存清理 / 历史刷新 / 质检 handler 搬入 useOutfitRefHandlers。
  const {
    markTaskImageBroken,
    clearAll,
    clearNonResultImageCache,
    refreshHistory
  } = useOutfitRefHandlers({
    setReferenceContextMenu,
    setBrokenTaskImages,
    setTasks,
    tasks,
    clearSelection,
    addEvent,
    running,
    activeOutfitPage,
    activeOutfitPageId,
    settings,
    outfitPages,
    setOutfitPages,
    setModelImages,
    setClothingImages,
    setReferenceImages,
    setFixedClothingId,
    setOriginalLibrary,
    setCropTarget,
    setLocalEditTarget,
    setImageLightbox,
    setActiveUploadGroup,
    buildCurrentOutfitPageSnapshot,
    outfitIntent,
    modelImages,
    clothingImages,
    referenceImages
  });

  // V132 第一刀：结果拖拽与覆盖域（drag & replace）搬入 useOutfitResultDragHandlers。
  // 域内自含 resultReplaceTargetId 状态与两个 drag ref；外部只注入 tasksRef/setter/addEvent。
  const {
    resultReplaceTargetId,
    setResultReplaceTargetId,
    beginTaskImageDrag,
    beginReferenceImageDrag,
    clearResultDragState,
    handleResultReplaceDragOver,
    handleResultReplaceDrop
  } = useOutfitResultDragHandlers({
    tasksRef,
    setTasks,
    setSelectedTaskIds,
    setPreview,
    preview,
    addEvent
  });

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
  // V5.0-008：供 effect 簇（useOutfitEffects）E11「挂载刷新保存目录」晚绑定读取。
  refreshSaveDirectoryRef.current = refreshSaveDirectory;

  // 2026-10-15 P6-2：保存 / 导出 / 自动保存 / 下载 handler 搬入 useOutfitSaveHandlers。
  const {
    saveExportedImageToFolder,
    splitWhiteRefineResult,
    autoSaveTask,
    downloadTask,
    copyText
  } = useOutfitSaveHandlers({
    saveDirectory,
    settings,
    setSaveDirectory,
    setDirectoryDraft,
    setSplitNote,
    setTasks,
    setDownloadFeedbackIds,
    refreshSaveDirectory,
    addEvent
  });

  // V78 单向门（需求 R4）：裁剪只有开「正反」才算数。
  // 为什么用派生值而不是直接改 state：splitHalves 的持久化口径是"默认开"（3.0 口径，见 image-split.js），
  // 而 frontback 默认关 —— 二者初值不一致。若直接信 state，用户没碰过任何开关时也会真的切图。
  // 派生口径让"裁剪随正反走"在任何初值组合下都成立；state 仍如实持久化用户手动细调的结果。
  const splitHalvesActive = retouchIntent.frontback === "on" && splitHalves;

  // 2026-10-15 P6-3：批量生成执行逻辑（buildTasks / runTaskQualityCheck / runSingleTask / startBatch）搬入 useOutfitBatchExecution。
  const {
    runSingleTask,
    startBatch
  } = useOutfitBatchExecution({
    plannedGenerationCount,
    outfitMaxImages,
    settings,
    isOutpaintWorkflow,
    isWhiteRefineWorkflow,
    isRandomBackgroundWorkflow,
    isOutfitWorkflow,
    isPoseRemixWorkflow,
    referenceImages,
    isDesignDraftWorkflow,
    activeModels,
    activeClothes,
    workflowMode,
    activeOutfitPage,
    uploadLabels,
    activeModel,
    running,
    canAppendWhileRunning,
    tasks,
    outfitIntent,
    retouchIntent,
    isBackgroundChangeWorkflow,
    isFaceSwapWorkflow,
    isLocalDetailWorkflow,
    workflowEventTitle,
    effectiveApiKey,
    config,
    setTasks,
    addEvent,
    openSettings,
    setInlineMessage,
    updateTaskRuntime,
    beginGenerationRun,
    endGenerationRun,
    localEditPrepareLimiterRef,
    outfitMountedRef,
    visibleTaskIdsRef,
    tasksRef,
    autoSaveTask,
    // V78：交给批量执行的是"正反已开才算数"的派生值 —— 裁切与否在这里一次收敛。
    splitHalves: splitHalvesActive,
    splitWhiteRefineResult,
    modelForIndex,
    clothingForIndex,
    freezeIntentIntoTask,
    LOCAL_EDIT_BATCH_CONCURRENCY,
    LOCAL_EDIT_BATCH_REQUEST_GAP_MS
  });
  startBatchRef.current = startBatch;

  // V5.0-011：任务重试/重刷域搬入 handlers/outfit-task-retry.js。
  // 调用点置于 useOutfitBatchExecution 之后（ctx 消费 runSingleTask/beginGenerationRun/endGenerationRun）；
  // 消费方仅 JSX（OutfitWorkbench props → ResultQueue → result-card 按钮）。
  const {
    retryTask,
    rerunResultTask,
    annotateRerunResultTask
  } = useOutfitTaskRetry({
    running, canAppendWhileRunning,
    beginGenerationRun, endGenerationRun,
    runSingleTask,
    tasksRef, setTasks,
    addEvent
  });

  // ── V138 标注式 AI 编辑（批量生成）：与快捷生成共用 AnnotationEditModal ──────────────
  // 打开：只存结果图描述符 + 已解析的图片地址（不塞整条任务快照）。
  function openOutfitAnnotationEdit(task) {
    if (!task?.result) return;
    setOutfitAnnotationTarget({ id: task.id, src: displayResultImageSource(task.result) });
  }

  // 提交：原图像素绝不修改——由标注生成「标注参考图」副本，随该任务的重刷分支发出，
  // 指令走任务级 annotationPrompt（缺省回落到全局 prompt）。不改 API Key / 模型 / 提示词模板。
  async function applyOutfitAnnotationEdit(item, payload = {}) {
    const { annotations = [], instruction = "" } = payload;
    const target = outfitAnnotationTarget;
    if (!target?.id || !target.src) return;
    try {
      const { fetchLocalBlob } = await import("./api/assets.js");
      const { annotationsToImageBlob } = await import("./shared/annotation-geometry.js");
      const originalBlob = await fetchLocalBlob(target.src);
      const annotatedBlob = await annotationsToImageBlob(originalBlob, annotations, "image/png");
      const file = new File(
        [annotatedBlob],
        `标注参考图-${String(target.id).slice(-8)}.png`,
        { type: "image/png", lastModified: Date.now() }
      );
      const targetTask = tasks.find((entry) => entry.id === target.id);
      setOutfitAnnotationTarget(null);
      if (!targetTask) {
        addEvent("标注编辑失败", "未找到对应任务，已取消");
        return;
      }
      await annotateRerunResultTask(targetTask, file, instruction);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEvent("标注编辑失败", message);
    }
  }

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

  // 预览平移拖拽 / 画廊缩放 / 拖拽复位 已统一由 usePreviewDrag 提供（见上文解构），此处不再重复定义。

  function clothingForIndex(index) {
    if (settings.pairingMode === "fixed") return selectedFixedClothing;
    if (settings.pairingMode === "sequence") return activeClothes[index] || null;
    if (settings.pairingMode === "cycle") return activeClothes.length ? activeClothes[index % activeClothes.length] : null;
    return selectedFixedClothing;
  }

  // V135：以下两个函数声明在历史上丢了缩进（HEAD 即如此），JS 作用域不受缩进影响故无 bug，
  // 但会误导读者以为是模块级函数（模块级就访问不到 activeModels/generationCount 了）。补回缩进。
  function modelForIndex(index) {
    if (!activeModels.length) return null;
    if (generationCount === "auto") return activeModels[index] || null;
    return activeModels[index] || activeModels[index % activeModels.length];
  }

  function freezeIntentIntoTask(intentCtx) {
    const { isOutfitWorkflow, isWhiteRefineWorkflow, settings } = intentCtx;
    return {
      // 中文注释：把本轮结构化换装意图（部位 / 上装层级 / 穿法 / 图2事实）冻结在任务快照里。
      // 批次开始后再改界面，只影响下一批，不会改到在途任务的提示词。
      outfitIntent: isOutfitWorkflow ? normalizeOutfitIntent(settings.outfitIntent) : undefined,
      // 精修结构化意图同样冻结进任务快照：批次开始后改界面不会改到在途任务。
      retouchIntent: isWhiteRefineWorkflow ? normalizeRetouchIntent(settings.retouchIntent) : undefined,
    };
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

  return (
    <main className={`appShell outfitWorkflowEmbedded${embeddedMode ? " embedded" : ""}`} style={themeStyle}>
      <WorkbenchSidebar
        activeView={activeView}
        onSwitchView={switchView}
        openSettings={openSettings}
        completedCount={completedCount}
        tasks={tasks}
        failedCount={failedCount}
        detachedCount={detachedCount}
      />

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
        <OutfitWorkbench
          resultFilter={resultFilter}
          setResultFilter={setResultFilter}
          tasks={tasks}
          imageCount={imageCount}
          switchView={switchView}
          addEvent={addEvent}
          activeOutfitPageId={activeOutfitPageId}
          renameOutfitPage={renameOutfitPage}
          activeOutfitPage={activeOutfitPage}
          refreshHistory={refreshHistory}
          openDirectoryModal={openDirectoryModal}
          openSaveDirectory={openSaveDirectory}
          topbarStatus={topbarStatus}
          topbarStatusText={topbarStatusText}
          downloadSelected={downloadSelected}
          selectedCompletedCount={selectedCompletedCount}
          downloadAll={downloadAll}
          deleteSelected={deleteSelected}
          selectedCount={selectedCount}
          clearAll={clearAll}
          clearNonResultImageCache={clearNonResultImageCache}
          changeGalleryZoom={changeGalleryZoom}
          galleryZoom={galleryZoom}
          galleryZoomPercent={galleryZoomPercent}
          visibleTasks={visibleTasks}
          selectedTaskIds={selectedTaskIds}
          downloadFeedbackIds={downloadFeedbackIds}
          brokenTaskImages={brokenTaskImages}
          resultReplaceTargetId={resultReplaceTargetId}
          galleryCardMin={galleryCardMin}
          taskGridRef={taskGridRef}
          settings={settings}
          isPoseRemixWorkflow={isPoseRemixWorkflow}
          isRandomBackgroundWorkflow={isRandomBackgroundWorkflow}
          isOutpaintWorkflow={isOutpaintWorkflow}
          isFaceSwapWorkflow={isFaceSwapWorkflow}
          toggleTaskSelected={toggleTaskSelected}
          retryTask={retryTask}
          downloadTask={downloadTask}
          rerunResultTask={rerunResultTask}
          openOutfitAnnotationEdit={openOutfitAnnotationEdit}
          deleteResultTask={deleteResultTask}
          setPreview={setPreview}
          setImageLightbox={setImageLightbox}
          handleResultReplaceDragOver={handleResultReplaceDragOver}
          handleResultReplaceDrop={handleResultReplaceDrop}
          setResultReplaceTargetId={setResultReplaceTargetId}
          markTaskImageBroken={markTaskImageBroken}
          beginTaskImageDrag={beginTaskImageDrag}
          clearResultDragState={clearResultDragState}
          openReferenceContextMenu={openReferenceContextMenu}
          beginReferenceImageDrag={beginReferenceImageDrag}
          copyText={copyText}
          originalLibrary={originalLibrary}
          removeOriginalImage={removeOriginalImage}
        />

        <OutfitComposer
          isOutfitWorkflow={isOutfitWorkflow}
          isWhiteRefineWorkflow={isWhiteRefineWorkflow}
          isOutpaintWorkflow={isOutpaintWorkflow}
          isRandomBackgroundWorkflow={isRandomBackgroundWorkflow}
          isPoseRemixWorkflow={isPoseRemixWorkflow}
          isFaceSwapWorkflow={isFaceSwapWorkflow}
          isBackgroundChangeWorkflow={isBackgroundChangeWorkflow}
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
          retouchIntent={retouchIntent}
          // V78：传给精修设置的是带裁剪联动的包装版（参见 patchRetouchIntentWithSplit）。
          patchRetouchIntent={patchRetouchIntentWithSplit}
          splitHalves={splitHalvesActive}
          onToggleSplitHalves={toggleSplitHalves}
          splitNote={splitNote}
          promptFieldRef={promptFieldRef}
          promptFieldTitle={promptFieldTitle}
          promptFieldPlaceholder={promptFieldPlaceholder}
          outfitPromptHandEditedRef={outfitPromptHandEditedRef}
          retouchPromptHandEditedRef={retouchPromptHandEditedRef}
          updateSetting={updateSetting}
          settings={settings}
          OUTFIT_AUTO_PROMPT_CHAR_LIMIT={OUTFIT_AUTO_PROMPT_CHAR_LIMIT}
          outfitAutoPrompt={outfitAutoPrompt}
          addEvent={addEvent}
          RETOUCH_AUTO_PROMPT_CHAR_LIMIT={RETOUCH_AUTO_PROMPT_CHAR_LIMIT}
          retouchPreview={retouchPreview}
          retouchAutoPrompt={retouchAutoPrompt}
          productNoteFieldTitle={productNoteFieldTitle}
          productNotePlaceholder={productNotePlaceholder}
          outfitIntentSummary={outfitIntentSummary}
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
          models={models}
          outfitChannels={outfitChannels}
          ratios={ratios}
          outfitSizes={outfitSizes}
          globalBulkMode={globalBulkMode}
          applyGlobalPreprocess={applyGlobalPreprocess}
          preprocessModeLabel={preprocessModeLabel}
          normalizeRandomBackgroundFocus={normalizeRandomBackgroundFocus}
          PREPROCESS_OPTIONS={PREPROCESS_OPTIONS}
          RANDOM_BACKGROUND_FOCUS_OPTIONS={RANDOM_BACKGROUND_FOCUS_OPTIONS}
          generationCount={generationCount}
          GENERATION_COUNT_OPTIONS={GENERATION_COUNT_OPTIONS}
          plannedGenerationCount={plannedGenerationCount}
          running={running}
          canAppendWhileRunning={canAppendWhileRunning}
          inlineMessage={inlineMessage}
          startBatch={startBatch}
          handlePromptKeyDown={handlePromptKeyDown}
          uploadLabels={uploadLabels}
          editUploadLabel={editUploadLabel}
          modelImages={modelImages}
          addImages={addImages}
          removeImage={removeImage}
          toggleImage={toggleImage}
          reorderImage={reorderImage}
          replaceImage={replaceImage}
          clearImageGroup={clearImageGroup}
          setCropTarget={setCropTarget}
          openLocalEdit={openLocalEdit}
          isDesignDraftWorkflow={isDesignDraftWorkflow}
          isCustomWorkflow={isCustomWorkflow}
          recolorPart={recolorPart}
          onSelectRecolorPart={selectRecolorPart}
          recolorUpperLayer={recolorUpperLayer}
          onSelectRecolorUpperLayer={selectRecolorUpperLayer}
          clothingImages={clothingImages}
          clothingBulkMode={clothingBulkMode}
          setMasterClothing={setMasterClothing}
          fixedClothingId={fixedClothingId}
          referenceImages={referenceImages}
          referenceBulkMode={referenceBulkMode}
          setActiveUploadGroup={setActiveUploadGroup}
          modelBulkMode={modelBulkMode}
          applyGroupPreprocess={applyGroupPreprocess}
          setImageLightbox={setImageLightbox}
        />

        </section>

        <section className={`viewPanel ${activeView === "resize" ? "active" : ""}`}>
          <ModuleHeader
            title="批量尺寸导出"
            subtitle="独立本地处理栏目，只负责批量缩放、转格式、补边、裁剪和导出。"
          />
          <BatchResizePanel
            saveDirectory={saveDirectory}
            onChooseDirectory={openDirectoryModal}
            onOpenSaveDirectory={() => void openSaveDirectory()}
            onSaveImage={saveExportedImageToFolder}
            onAddEvent={addEvent}
          />
        </section>

      </section>

      <OutfitSettingsModal
        isSettingsOpen={isSettingsOpen}
        embeddedMode={embeddedMode}
        setIsSettingsOpen={setIsSettingsOpen}
        apiKeyDraft={apiKeyDraft}
        setApiKeyDraft={setApiKeyDraft}
        showKey={showKey}
        setShowKey={setShowKey}
        saveSettings={saveSettings}
        apiSaveStatus={apiSaveStatus}
        effectiveTheme={effectiveTheme}
        updateSetting={updateSetting}
        isConnectionTesting={isConnectionTesting}
        runConnectionTest={runConnectionTest}
        connectionStatus={connectionStatus}
        connectionState={connectionState}
        isDirectoryModalOpen={isDirectoryModalOpen}
        setIsDirectoryModalOpen={setIsDirectoryModalOpen}
        directoryDraft={directoryDraft}
        isPickingDirectory={isPickingDirectory}
        pickSaveDirectory={pickSaveDirectory}
        confirmSaveDirectory={confirmSaveDirectory}
      />

      {isPromptAssistantOpen && (
        <Modal layerClassName="modalLayer promptLayer" panelClassName="promptAssistantModal" onClose={() => setIsPromptAssistantOpen(false)}>
            <header>
              <h2>提示词助手</h2>
              <Button size="md" iconOnly onClick={() => setIsPromptAssistantOpen(false)}>
                <X size={16} />
              </Button>
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
          </Modal>
      )}

      {editingPrompt && (
        <PromptEditorModal
          editingPrompt={editingPrompt}
          promptCategories={promptCategories}
          onClose={() => setEditingPrompt(null)}
          updateEditingPrompt={updateEditingPrompt}
          saveEditingPrompt={saveEditingPrompt}
        />
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
        <ResultPreviewModal
          preview={preview}
          onClose={() => setPreview(null)}
          resultPreviewTasks={resultPreviewTasks}
          zoomPreviewByWheel={zoomPreviewByWheel}
          startPreviewDrag={startPreviewDrag}
          movePreviewDrag={movePreviewDrag}
          endPreviewDrag={endPreviewDrag}
          navigatePreview={navigatePreview}
          beginTaskImageDrag={beginTaskImageDrag}
          clearResultDragState={clearResultDragState}
          previewPan={previewPan}
          previewZoom={previewZoom}
          copyText={copyText}
          downloadTask={downloadTask}
          openOutfitAnnotationEdit={openOutfitAnnotationEdit}
          activeOutfitPage={activeOutfitPage}
        />
      )}

      {outfitAnnotationTarget && (
        <AnnotationEditModal
          key={outfitAnnotationTarget.id}
          item={outfitAnnotationTarget}
          imageSrc={outfitAnnotationTarget.src}
          onClose={() => setOutfitAnnotationTarget(null)}
          onApply={applyOutfitAnnotationEdit}
        />
      )}
      {imageLightbox && (
        <Modal layerClassName="modalLayer" panelClassName="previewModal" onClose={() => setImageLightbox(null)}>
            <header>
              <div>
                <h2>{imageLightbox.title}</h2>
                <span>原图预览</span>
              </div>
              <Button size="md" iconOnly onClick={() => setImageLightbox(null)}><X size={16} /></Button>
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
          </Modal>
      )}
    </main>
  );
}

