import React, { useEffect, useMemo, useRef, useState } from "react";
import { StableTextarea } from "./shared/ui/stable-textarea.jsx";
import { ElapsedTimer } from "./shared/ui/elapsed-timer.jsx";
import { createRoot } from "react-dom/client";
import {
  Archive,
  BookOpen,
  Box,
  Brush,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  FileText,
  Flame,
  FolderOpen,
  Image as ImageIcon,
  ImageOff,
  Layers,
  Link2,
  Loader2,
  Maximize2,
  Minus,
  Move,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Unlink,
  Upload,
  Video,
  Wand2,
  X
} from "lucide-react";
import { DEFAULT_MODELS, imageSourceFromResult } from "./shared/models.js";
import {
  channelForModel,
  channelPriceLabel,
  channelsForModel,
  convergeSettingsForModel,
  isRoutingCatalogReady,
  modelCapabilities
} from "./shared/routing.js";
import DebouncedTextarea from "./shared/DebouncedTextarea.jsx";
import { ErrorBoundary } from "./shared/error-boundary.jsx";
import { QuickCropViewportModal } from "./features/crop/quick-crop-panels.jsx";
import { CachedImage } from "./shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "./shared/ui/reference-thumb-tray.jsx";
import { createReferenceUpload, quickReferenceOriginalFile } from "./features/upload/reference-upload.js";
import { LocalEditModal } from "./features/local-edit/LocalEditModal.jsx";
import {
  beginImageDownloadDrag,
  referenceSource,
  resultImageCardState
} from "./shared/result-image.js";
import { classifyGenerationError, formatGenerationError } from "./shared/generation-errors.js";
import { fileSize, formatMs } from "./lib/format/index.js";
import { normalizePromptCategories, normalizePromptPreset } from "./shared/prompt-library.js";
import { readJsonStorage, writeJsonStorage } from "./lib/storage/json-storage.js";
// 建议3b：OutfitWorkflow / ImageEditorPanel 改为 React.lazy 懒加载（见下方 Lazy* 定义），
// 使其脱离首屏 index 主包；feat-outfit(182KB) 等依赖仅在对应视图打开时再拉取，降低首屏 load。
// 注意：release 模式下默认视图是 outfit，首次打开会短暂显示 VIEW_LOADING，属预期行为。
import { getAppConfig } from "./api/config.js";
import {
  getSaveDirectory,
  pickSaveDirectory as pickSaveDirectoryRequest,
  setSaveDirectory as setSaveDirectoryRequest
} from "./api/save.js";
import "./styles.css";
import { useSaveDirectory } from "./shared/hooks/useSaveDirectory.js";
import { usePreviewDrag } from "./shared/hooks/usePreviewDrag.js";
import { incomingCanvasNodes, canvasResultItemsFromNode, canvasImagesForGenerator, canvasImageEntriesForGenerator, splitCanvasBatchEntries } from "./features/canvas/canvas-graph.js";
import { createCanvasActions, createCanvasInteractions } from "./features/canvas/canvas-actions.js";
// P6-4：画布 / 生成类 handler 钩（canvasFileFromResult / addCanvasFiles / runCanvasImageRequest / generateCanvasNode /
// saveProcessedImageFile / optimizePrompt / sendResultToImageEditor / addReferenceThumbToUploads / generate）。
import { useCanvasGenerationHandlers } from "./features/canvas/canvas-generation-handlers.js";
// P6-5：App() 体其余全部 handler 钩（updateSetting / addEvent / copyText / 预览三态 / 参考图排序 / 右键菜单 / rerun 等 38 个）。
import { useMainHandlers } from "./features/main-app/main-handlers.js";
import { createQuickResultReplace, createResultDownload, createResultActions } from "./features/result-queue/quick-result-replace.js";
import { VideoView } from "./features/video/VideoView.jsx";
import { useVideoState } from "./features/video/video-state.js";
import { ReferenceRemixView } from "./features/reference-remix/ReferenceRemixView.jsx";
import { useReferenceState } from "./features/reference-remix/reference-state.js";
// V60（P3-5）：一键详情/主图视图与状态抽取至 src/features/detail/
import { DetailView } from "./features/detail/DetailView.jsx";
import { useDetailState } from "./features/detail/detail-state.js";
// V61（P3-6）：快捷生成 image 模式私有状态与派生收口至 src/features/quickgen/（降级档：仅 state，JSX 留待下轮）
import { useQuickGenState } from "./features/quickgen/quickgen-state.js";
import { ACTIVE_VIEW_KEY, INFINITE_CANVAS_KEY, PROMPT_CATEGORIES_KEY, PROMPT_PRESETS_KEY, STORAGE_KEY, builtinPrompts, defaultState } from "./shared/app-defaults.js";
import { SHOW_INFINITE_CANVAS, loadActiveView, loadHistoryResults, loadState, navItems, publicReleaseStorageResetPromise, removeHistoryResults, saveHistoryResults } from "./features/storage/storage-store.js";
import { hydrateDetailGroupsWithHistory } from "./features/detail/detail-group.js";
import { defaultQuickLocalEditCrop } from "./features/local-edit/crop-rect-resize.js";
// V56（P3-1）：设置弹窗抽取为独立 feature
import { SettingsView } from "./features/settings/SettingsView.jsx";
import { useSettingsState } from "./features/settings/settings-state.js";
import { PromptAssistantView } from "./features/prompt/PromptAssistantView.jsx";
import { usePromptAssistantState } from "./features/prompt/prompt-assistant-state.js";

// —— 建议3b：首屏懒加载（React.lazy）——
// 这两个视图组件位于 src/ 根目录（原本被打进 index 主包），且会拖入 feat-outfit 等大块依赖。
// 改为动态导入后，仅当用户切到对应视图时才拉取对应 chunk，降低首屏 JS 体积与解析耗时。
const VIEW_LOADING = (
  <div style={{ padding: "48px 16px", textAlign: "center", color: "#8a8a8a", fontSize: 14 }}>
    视图加载中…
  </div>
);
const LazyOutfitWorkflow = React.lazy(() => import("./outfit-workflow.jsx"));
const LazyImageEditorPanel = React.lazy(() => import("./image-editor.jsx"));














const QUICK_RESULT_DRAG_TYPE = "application/x-jingyin-quick-result";











const CLIENT_SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_MAX_REFERENCE_FILES = 5;
// 局部回贴可选比例。2026-09-25：补上 2:3 —— 局部回贴选框必须能锁定到用户选的比例，
// 而 2:3 是竖版服装图最常用的比例之一，之前不在列表里会被回落到 1:1。
const QUICK_LOCAL_EDIT_RATIOS = ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"];
const DETAIL_ANALYSIS_MODEL = "gpt-5.4-mini";




const CANVAS_NODE_WIDTH = 236;
const CANVAS_NODE_HEIGHT = 260;
const CANVAS_GENERATOR_WIDTH = 286;
const CANVAS_GENERATOR_HEIGHT = 360;
const COUNT_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const REFERENCE_STRENGTH_OPTIONS = Array.from({ length: 8 }, (_, index) => 30 + index * 10);












const referenceControlOptions = [
  { value: "none", label: "不参考" },
  { value: "light", label: "轻参考" },
  { value: "medium", label: "中等参考" },
  { value: "strong", label: "重点参考" }
];

const canvasImageRoleOptions = [
  { value: "auto", label: "自动" },
  { value: "model", label: "模特图" },
  { value: "fixed", label: "固定服装" },
  { value: "reference", label: "通用参考" }
];

const canvasBatchModeOptions = [
  { value: "single", label: "单次生成" },
  { value: "by-model", label: "按模特批量" }
];



const promptCategories = ["全部", "常用", "批量复刻", "批量sku", "局部迁移"];













// 🔴 与 src/outfit-workflow.jsx 的 `loadOutfitPromptCategories` **同名不同义**（V11-RF-040 裁定：改名不合并，勿合并）。跨文件引用只写函数名、不写行号（V11-RF-040c 裁决）。
function loadPromptCategories() {
  const storedCategories = readJsonStorage(PROMPT_CATEGORIES_KEY, null);
  const storedPrompts = readJsonStorage(PROMPT_PRESETS_KEY, null) || [];
  const presetCategories = Array.isArray(storedPrompts)
    ? storedPrompts.map((preset) => preset?.category)
    : [];
  const base = Array.isArray(storedCategories) && storedCategories.length > 0
    ? ["全部", ...storedCategories]
    : promptCategories;
  return normalizePromptCategories([...base, ...presetCategories]);
}

function createCanvasNode(type, patch = {}) {
  const now = Date.now();
  const size = type === "generator"
    ? { w: CANVAS_GENERATOR_WIDTH, h: CANVAS_GENERATOR_HEIGHT }
    : { w: CANVAS_NODE_WIDTH, h: CANVAS_NODE_HEIGHT };
  const base = {
    id: patch.id || makeResultId(),
    type,
    title: patch.title || (type === "generator" ? "生图节点" : type === "prompt" ? "提示词节点" : type === "output" ? "输出节点" : "图片节点"),
    x: Number.isFinite(patch.x) ? patch.x : 120,
    y: Number.isFinite(patch.y) ? patch.y : 120,
    w: Number.isFinite(patch.w) ? patch.w : size.w,
    h: Number.isFinite(patch.h) ? patch.h : size.h,
    createdAt: patch.createdAt || now,
    updatedAt: now
  };

  if (type === "prompt") {
    return {
      ...base,
      text: patch.text || "输入你要生成的画面要求，连接到生图节点后会自动读取。"
    };
  }

  if (type === "generator") {
    return {
      ...base,
      params: {
        model: patch.params?.model || defaultState.model,
        imageSize: patch.params?.imageSize || defaultState.imageSize,
        aspectRatio: patch.params?.aspectRatio || defaultState.aspectRatio,
        n: clampCount(patch.params?.n || 1),
        batchMode: canvasBatchModeOptions.some((option) => option.value === patch.params?.batchMode)
          ? patch.params.batchMode
          : "single"
      },
      prompt: patch.prompt || "",
      status: patch.status || "idle",
      error: patch.error || "",
      generationMs: Number.isFinite(patch.generationMs) ? patch.generationMs : null
    };
  }

  if (type === "output") {
    return {
      ...base,
      results: Array.isArray(patch.results) ? patch.results : [],
      prompt: patch.prompt || "",
      status: patch.status || "success",
      generationMs: Number.isFinite(patch.generationMs) ? patch.generationMs : null
    };
  }

  return {
    ...base,
    result: patch.result || null,
    role: canvasImageRoleOptions.some((option) => option.value === patch.role) ? patch.role : "auto",
    prompt: patch.prompt || patch.result?.prompt || ""
  };
}

function createInfiniteCanvas(name = "") {
  const createdAt = Date.now();
  const promptNode = createCanvasNode("prompt", {
    title: "画面提示词",
    x: 80,
    y: 100,
    text: "输入本次画面的核心要求。连接图片节点后，生图节点会自动把连入图片当成参考图。"
  });
  const generatorNode = createCanvasNode("generator", {
    title: "API 生图",
    x: 420,
    y: 78
  });

  return {
    id: `canvas_${createdAt}_${Math.random().toString(36).slice(2, 7)}`,
    name: name || `画布 ${new Date(createdAt).toLocaleString("zh-CN", { hour12: false }).slice(5, 16)}`,
    createdAt,
    updatedAt: createdAt,
    nodes: [promptNode, generatorNode],
    connections: [{
      id: makeResultId(),
      fromNodeId: promptNode.id,
      toNodeId: generatorNode.id
    }]
  };
}

function normalizeCanvasNode(node, index = 0) {
  if (!node || typeof node !== "object") return null;
  const type = ["image", "prompt", "generator", "output"].includes(node.type) ? node.type : "image";
  return createCanvasNode(type, {
    ...node,
    id: String(node.id || `canvas_node_${index}`),
    x: Number(node.x),
    y: Number(node.y),
    w: Number(node.w),
    h: Number(node.h)
  });
}

function normalizeInfiniteCanvasState(raw) {
  const incoming = raw && typeof raw === "object" ? raw : {};
  const canvases = Array.isArray(incoming.canvases)
    ? incoming.canvases.map((canvas, canvasIndex) => {
        const normalizedNodes = Array.isArray(canvas?.nodes)
          ? canvas.nodes.map(normalizeCanvasNode).filter(Boolean)
          : [];
        const nodeIds = new Set(normalizedNodes.map((node) => node.id));
        const connections = Array.isArray(canvas?.connections)
          ? canvas.connections.filter((connection) => (
              connection?.fromNodeId
              && connection?.toNodeId
              && nodeIds.has(connection.fromNodeId)
              && nodeIds.has(connection.toNodeId)
            )).map((connection, index) => ({
              id: String(connection.id || `canvas_link_${canvasIndex}_${index}`),
              fromNodeId: String(connection.fromNodeId),
              toNodeId: String(connection.toNodeId)
            }))
          : [];
        return {
          id: String(canvas?.id || `canvas_${canvasIndex}_${Date.now()}`),
          name: String(canvas?.name || `画布 ${canvasIndex + 1}`),
          createdAt: Number(canvas?.createdAt || Date.now()),
          updatedAt: Number(canvas?.updatedAt || Date.now()),
          nodes: normalizedNodes.length > 0 ? normalizedNodes : createInfiniteCanvas().nodes,
          connections
        };
      }).filter(Boolean)
    : [];
  const nextCanvases = canvases.length > 0 ? canvases : [createInfiniteCanvas("默认画布")];
  const activeId = nextCanvases.some((canvas) => canvas.id === incoming.activeId)
    ? incoming.activeId
    : nextCanvases[0].id;
  return { activeId, canvases: nextCanvases };
}

function loadInfiniteCanvasState() {
  return normalizeInfiniteCanvasState(readJsonStorage(INFINITE_CANVAS_KEY, null));
}













// 🔴 与 src/outfit-workflow.jsx 的 `loadOutfitPromptPresets` **同名不同义**（V11-RF-040 裁定：改名不合并，勿合并）。跨文件引用只写函数名、不写行号（V11-RF-040c 裁决）。
function loadPromptPresets() {
  const stored = readJsonStorage(PROMPT_PRESETS_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    return stored.map(normalizePromptPreset).filter((preset) => preset.content);
  }

  return builtinPrompts;
}























function clampCount(value) {
  return Math.max(1, Math.min(12, Number.parseInt(value, 10) || 1));
}









function makeResultId() {
  return `result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}


























/**
 * 生图错误的用户可读文案（快捷生成统一出口）。
 *
 * 2026-09-25：不再在这里散写正则，改走 src/shared/generation-errors.js 的分类器，
 * 这样快捷生成和批量生成对同一类错误给出同一句话，并且都会带上服务端返回的 requestId。
 *
 * @param {unknown} error ApiError（带 status/payload）或任意错误 / 错误文本
 * @param {object} [context] `{ phase: "upload"|"request"|"result", cancelled, requestId }`
 */
function normalizeGenerationErrorMessage(error, context = {}) {
  const value = error instanceof Error || (error && typeof error === "object")
    ? error
    : new Error(String(error || ""));
  const info = classifyGenerationError(value, context);
  // 连原始错误文本都没有时，也明确说是"未知错误"，而不是丢一句"生成失败"。
  if (!info.reason && info.kind === "unknown") {
    return `${info.label}：没有拿到具体原因，请重试。${info.advice}`;
  }
  return formatGenerationError(value, context);
}









function App() {
  const [config, setConfig] = useState({ hasServerKey: false, models: DEFAULT_MODELS, defaultBaseUrl: defaultState.baseUrl });
  const [settings, setSettings] = useState(loadState);
  const [promptPresets, setPromptPresets] = useState(loadPromptPresets);
  const [promptCategories, setPromptCategories] = useState(loadPromptCategories);
  const [activeView, setActiveView] = useState(loadActiveView);
  const [referenceProductFiles, setReferenceProductFiles] = useState([]);
  const [referenceStyleFiles, setReferenceStyleFiles] = useState([]);
  const [infiniteCanvasState, setInfiniteCanvasState] = useState(loadInfiniteCanvasState);
  const [canvasViewport, setCanvasViewport] = useState({ x: 34, y: 18, scale: 1 });
  const [canvasTasks, setCanvasTasks] = useState([]);
  const [canvasConnectStart, setCanvasConnectStart] = useState(null);
  const [canvasDrag, setCanvasDrag] = useState(null);
  const [canvasSelectedNodeId, setCanvasSelectedNodeId] = useState("");
  const [saveDirectory, setSaveDirectory] = useState("");
  const [directoryDraft, setDirectoryDraft] = useState("");
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  // V61（P3-6，降级档）：快捷生成 image 模式私有状态 + 私有 ref + 派生值收口到 useQuickGenState，
  // 以原名校验返回，下方共享工厂（createResultDownload / createResultActions / createReferenceUpload）
  // 与 JSX 继续按同名引用，行为不变。JSX 抽取待下轮。
  const quickApi = useQuickGenState();
  const {
    setFiles,
    results, setResults,
    brokenResultImages, setBrokenResultImages,
    resultFilter, setResultFilter,
    quickMode, setQuickMode,
    selectedIds, setSelectedIds,
    status, setStatus,
    setQuickTasks,
    galleryZoom, setGalleryZoom,
    downloadFeedbackIds, setDownloadFeedbackIds,
    error, setError,
    isQuickPromptOptimizing, setIsQuickPromptOptimizing,
    setTiming,
    isQuickChannelMenuOpen, setIsQuickChannelMenuOpen,
    quickResultReplaceTargetId, setQuickResultReplaceTargetId,
    quickCropEditTarget, setQuickCropEditTarget,
    quickLocalEditTarget, setQuickLocalEditTarget,
    previewResult, setPreviewResult,
    uploadPreview, setUploadPreview,
    previewZoom, setPreviewZoom,
    previewPan, setPreviewPan,
    contextMenu, setContextMenu,
    imageEditorSeed, setImageEditorSeed,
    quickResultDragIdRef,
    downloadFeedbackTimersRef,
    quickGalleryRef,
    previewFiles,
    quickResults,
    runningQuickTasks,
    imageCount,
    quickGalleryItems,
    quickSelectedCount,
    galleryZoomPercent,
    galleryCardMin,
    quickStatus,
    latestStatusText,
    contextItem,
    contextIndex,
    quickGalleryTailKey
  } = quickApi;
  const [events, setEvents] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 2026-09-29（v3.7）：数据与存储（用量 / 打开目录 / 清理）。
  // 封装版的数据目录不在安装包内，用户看不到路径也删不掉历史图片，
  // 于是"清空全部"后文件仍在、重启就被扫描重建。这里给出自助入口。
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState(false);
  // V56（P3-1）：设置弹窗私有状态与副作用统一收口到 useSettingsState，App() 只持有共享状态。
  const settingsApi = useSettingsState({ settings, setSettings, config, addEvent, isSettingsOpen });
  const [isPromptAssistantOpen, setIsPromptAssistantOpen] = useState(false);
  const [referenceDropTarget, setReferenceDropTarget] = useState(null);
  // 2026-10-06：快捷生成的参考图「左右调顺序」（批量侧早就有，快捷侧补齐）。
  // 走 pointer 事件而不是 HTML5 drag —— 后者会和已有的「外部图片拖进来=替换」抢 dragover。
  const [referenceSortTarget, setReferenceSortTarget] = useState(null);
  const [draggingReferenceId, setDraggingReferenceId] = useState("");
  const [draggedPromptCategory, setDraggedPromptCategory] = useState("");
  const [promptCategoryDropTarget, setPromptCategoryDropTarget] = useState(null);
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  // V46.1: 移除非必要全局 tick（任务计时下沉到 <ElapsedTimer>）
  const [referencePreview, setReferencePreview] = useState(null);
  const [referenceContextMenu, setReferenceContextMenu] = useState(null);
  const inputRef = useRef(null);
  const referencePointerSortRef = useRef(null);
  // 排序松手后会紧接着触发一次 click ⇒ 会误开预览。沿用批量侧的 150ms 抑制窗口。
  const suppressReferencePreviewRef = useRef(false);
  const canvasStageRef = useRef(null);
  const canvasFileInputRef = useRef(null);
  const previewDragRef = useRef(null);

  // P6-5（V4.0）：App() 体其余全部 handler（38 个）收口到 useMainHandlers（src/features/main-app/）。
  // 调用点置于 usePreviewDrag / useSettingsState / usePromptAssistantState / useSaveDirectory /
  //   createCanvasActions 之前——这些下游 deps 引用 addEvent / updateSetting / closePreview / canvasCenterPoint
  //   （搬出前依赖函数提升可用，现由本钩产出，调用点必须在前）。
  // TDZ：钩内 10 项晚期产出引用统一走 handlerLateRef.current，回填点在 syncHistoryFromServerRef 回填处
  //   （渲染期，此时各产出均已初始化；handler 只在事件回调 / effect 内被调用，均在渲染之后，无前向引用）。
  const handlerLateRef = useRef({});
  const {
    updateSetting,
    canvasCenterPoint,
    handleCanvasDrop,
    sendResultToCanvas,
    addEvent,
    copyText,
    onComposerPaste,
    downloadVideoResult,
    removeReferenceImage,
    openQuickCropEdit,
    openQuickLocalEdit,
    applyQuickCropEdit,
    applyQuickLocalEdit,
    clearQuickCropEdit,
    clearQuickLocalEdit,
    clearAll,
    openSaveDirectory,
    onQuickBoardWheel,
    autoSaveEventText,
    openSettingsPanel,
    openUploadPreview,
    beginReferenceSort,
    moveReferenceSort,
    endReferenceSort,
    cancelReferenceSort,
    closeUploadPreview,
    openReferencePreview,
    closeReferencePreview,
    shiftReferencePreview,
    openPreview,
    shiftPreview,
    closePreview,
    handlePreviewWheel,
    openContextMenu,
    openReferenceContextMenu,
    rerunResult,
    markDeferredFeature
  } = useMainHandlers({
    config,
    settings,
    setSettings,
    activeView,
    setActiveView,
    quickMode,
    setFiles,
    quickResults,
    setResults,
    setSelectedIds,
    setStatus,
    setError,
    setTiming,
    setQuickTasks,
    quickCropEditTarget,
    setQuickCropEditTarget,
    quickLocalEditTarget,
    setQuickLocalEditTarget,
    previewResult,
    setPreviewResult,
    setPreviewZoom,
    setPreviewPan,
    setUploadPreview,
    setContextMenu,
    setReferenceContextMenu,
    setReferencePreview,
    setReferenceSortTarget,
    setDraggingReferenceId,
    previewFiles,
    saveDirectory,
    directoryDraft,
    setSaveDirectory,
    setDirectoryDraft,
    setIsSettingsOpen,
    setReferenceProductFiles,
    setReferenceStyleFiles,
    setEvents,
    setCanvasSelectedNodeId,
    canvasViewport,
    createCanvasNode,
    makeResultId,
    CANVAS_NODE_WIDTH,
    CANVAS_NODE_HEIGHT,
    clampCount,
    QUICK_LOCAL_EDIT_RATIOS,
    referencePointerSortRef,
    suppressReferencePreviewRef,
    previewDragRef,
    quickGalleryRef,
    canvasStageRef,
    lateRef: handlerLateRef
  });
  const {
    beginPreviewDrag,
    movePreviewDrag,
    endPreviewDrag,
    changeGalleryZoom,
    endDrag: endPromptCategoryDrag,
  } = usePreviewDrag({
    previewDragRef,
    setPreviewPan,
    closePreview,
    setGalleryZoom,
    resetDragged: setDraggedPromptCategory,
    resetDropTarget: setPromptCategoryDropTarget
  });

  // V57（P3-2）：提示词助手私有状态/逻辑收口到 usePromptAssistantState，App() 只持有共享 presets/categories 与开态。
  const promptApi = usePromptAssistantState({
    presets: promptPresets,
    setPresets: setPromptPresets,
    categories: promptCategories,
    setCategories: setPromptCategories,
    settings,
    updateSetting,
    addEvent,
    makePresetId: makeResultId,
    endPromptCategoryDrag,
    onApplyPreset: () => setIsPromptAssistantOpen(false),
    draggedPromptCategory,
    setDraggedPromptCategory,
    promptCategoryDropTarget,
    setPromptCategoryDropTarget
  });

  // 保存目录域：实现在 src/features/savedir/save-directory.js（两侧同一份，语义等价）。
  // 这里只保留同名薄壳：每次 render 重建 deps，捕获最新的 state / setter / addEvent。
  // 注意：必须放在首次渲染引用（resultDownloadDeps 在 ~1771 行）之前，
  // 否则渲染期访问尚未初始化的 refreshSaveDirectory 会触发 TDZ，导致整页不挂载（黑屏）。
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


  const models = config.models?.length ? config.models : DEFAULT_MODELS;
  const activeModel = models.find((item) => item.value === settings.model) || models[0];
  // 能力限制唯一来源：routing catalog 的 capabilities（见 src/shared/routing.js）。
  const quickCapabilities = modelCapabilities(settings.model, config.routing || config);
  const ratios = quickCapabilities.ratios;
  const quickSizes = quickCapabilities.sizes;
  // 上传图片数量随当前模型能力收敛：tt-image-2.5 是 8，其余是 14。
  // DEFAULT_MAX_REFERENCE_FILES 只在目录和能力都拿不到时兜底。
  const quickMaxReferenceFiles = Math.max(1, quickCapabilities.maxInputImages || DEFAULT_MAX_REFERENCE_FILES);
  const quickChannels = channelsForModel(settings.model, config.routing || config);
  const quickChannel = quickChannels.find((item) => item.id === settings.channelId) || quickChannels[0] || null;
  const billingGatewayEnabled = Boolean(config.billingGatewayPolicy?.enabled);
  const canvases = infiniteCanvasState.canvases;
  const activeCanvasId = infiniteCanvasState.activeId;
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) || canvases[0] || null;
  const canvasRunningCount = canvasTasks.filter((task) => task.status === "running").length;
  const canvasStatusText = canvasRunningCount > 0
    ? `运行中 ${canvasRunningCount} 个任务`
    : activeCanvas
      ? `${activeCanvas.nodes.length} 个节点`
      : "等待新建画布";
  // 结果去重：同一次生成的图若被重复写入 results（同 id 或「同图不同 id」），
  // 画廊会出现「两张一模一样」的卡。按「图片内容签名优先、缺图回退 id」去重，
  // 只保证画廊展示层不重复，不改数据模型、不动存储结构。
  const selectedCount = selectedIds.size;
  // 2026-10-14（V60）：previewNavigationItems 已下移到 referenceApi 声明之后。
  // 原因：它的 useMemo 依赖数组在渲染期就会求值，而依赖里的 detailApi.activeDetailResults /
  // referenceApi.referenceGalleryItems 两者的 const 声明都在本行之下 ⇒ TDZ ⇒ 整页不挂载。
  // 该 useMemo 体与依赖逐字未改，只改位置。

  useEffect(() => {
    getAppConfig().then((data) => {
      setConfig(data);
      const routingCatalog = data?.routing || data;
      setSettings((current) => {
        // 目录加载完成之前，loadState() 只用 canonical 别名做模型映射，
        // 绝不用默认值覆盖用户存档；目录回来后在这里做一次归一化收敛。
        if (!isRoutingCatalogReady(routingCatalog)) {
          return { ...current, baseUrl: data.defaultBaseUrl || defaultState.baseUrl };
        }
        const converged = convergeSettingsForModel(current, routingCatalog);
        return { ...converged, baseUrl: data.defaultBaseUrl || defaultState.baseUrl };
      });
      // 参考生图 / 一键详情·主图 的渠道状态各自独立保存，目录回来后同样各收敛一次：
      // 目录里没有当前渠道（或当前渠道不支持这个模型）时落到该模型的第一条合法渠道。
      const convergePageChannel = (current) => {
        if (!isRoutingCatalogReady(routingCatalog)) return current;
        const nextChannelId = channelForModel(current.model, current.channelId, routingCatalog)?.id || "";
        return nextChannelId === current.channelId ? current : { ...current, channelId: nextChannelId };
      };
      detailApi.setDetailSettings(convergePageChannel);
      referenceApi.setReferenceSettings(convergePageChannel);
    }).catch(() => {});

    refreshSaveDirectory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    loadHistoryResults().then((storedResults) => {
      if (!active) return;
      setResults(storedResults);
      detailApi.hydrateDetailGroups(storedResults);
      if (storedResults.length > 0) addEvent("历史记录", `已载入 ${storedResults.length} 张图片`);
    });
    return () => {
      active = false;
    };
  // V60：detailApi 由 hook 产出（每次 render 新对象），此处是挂载期跑一次的回载，不纳入依赖。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme || "dark");
    const timer = window.setTimeout(() => {
      writeJsonStorage(STORAGE_KEY, settings);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [settings]);


  useEffect(() => {
    if (!writeJsonStorage(INFINITE_CANVAS_KEY, infiniteCanvasState)) {
      addEvent("无限画布", "画布内容较大，部分临时图片可能无法写入本地缓存");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [infiniteCanvasState]);

  useEffect(() => {
    writeJsonStorage(ACTIVE_VIEW_KEY, activeView);
  }, [activeView]);


  useEffect(() => () => {
    previewFiles.forEach((item) => URL.revokeObjectURL(item.url));
  }, [previewFiles]);

  // V46.1: 任务计时已下沉到 <ElapsedTimer>，此处不再需要全局 500ms 刷新

  useEffect(() => {
    if (activeView !== "quickgen" || quickGalleryItems.length === 0) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const gallery = quickGalleryRef.current;
      if (!gallery) return;
      gallery.scrollTop = gallery.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, quickGalleryItems.length, quickGalleryTailKey, galleryZoom, quickGalleryRef]);

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
      setReferenceContextMenu(null);
      detailApi.setStitchContextMenu(null);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setReferenceContextMenu(null);
        detailApi.setStitchContextMenu(null);
        closeReferencePreview();
        closePreview();
        setIsPromptAssistantOpen(false);
        promptApi.setEditingPrompt(null);
        setIsDirectoryModalOpen(false);
        detailApi.setIsDetailPresetOpen(false);
      }
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeMenu);
    };
  // detailApi / promptApi 均为 hook 产出的每次 render 新对象，此处只注册一次全局监听，不纳入依赖。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!previewResult) return undefined;
    const onPreviewKeyDown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      shiftPreview(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onPreviewKeyDown);
    return () => window.removeEventListener("keydown", onPreviewKeyDown);
  // 2026-10-14（V60）：effect 体只用 shiftPreview（函数声明，调用时才读 previewNavigationItems），
  // 不直接读该值；原依赖数组里的 previewNavigationItems 是无效依赖，且其 const 声明在本 effect
  // 之下 ⇒ 渲染期求值触发 TDZ。依赖收敛为 [previewResult]，监听器注册时机与原先一致。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewResult]);

  useEffect(() => {
    if (!referencePreview) return undefined;
    const onReferencePreviewKeyDown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      shiftReferencePreview(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onReferencePreviewKeyDown);
    return () => window.removeEventListener("keydown", onReferencePreviewKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referencePreview]);

  useEffect(() => () => {
    downloadFeedbackTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    downloadFeedbackTimersRef.current.clear();
  // 卸载期清理，ref 稳定，不纳入依赖
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 线路价格菜单：点击面板外部或按 Esc 关闭，避免菜单挡住底部参数和生成按钮。
  useEffect(() => {
    if (!isQuickChannelMenuOpen) return undefined;
    const onPointerDown = (event) => {
      if (event.target?.closest?.(".quickToolCluster")) return;
      setIsQuickChannelMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setIsQuickChannelMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isQuickChannelMenuOpen, setIsQuickChannelMenuOpen]);

  const {
    patchActiveCanvas, patchCanvasById, updateCanvasNode, updateCanvasNodeByCanvasId,
    createCanvas, renameCanvas, deleteCanvas, clearCanvas, selectCanvas,
    addCanvasNode, deleteCanvasNode
  } = createCanvasActions({
    setInfiniteCanvasState,
    activeCanvas,
    addEvent,
    setCanvasSelectedNodeId,
    setCanvasViewport,
    setCanvasConnectStart,
    createInfiniteCanvas,
    createCanvasNode,
    canvasCenterPoint
  });

  const {
    fitCanvasView, handleCanvasWheel, beginCanvasPan, beginCanvasNodeDrag,
    moveCanvasDrag, endCanvasDrag, beginCanvasConnection,
    completeCanvasConnection, removeCanvasConnection
  } = createCanvasInteractions({
    activeCanvas,
    canvasStageRef,
    canvasViewport,
    setCanvasViewport,
    canvasDrag,
    setCanvasDrag,
    canvasConnectStart,
    setCanvasConnectStart,
    setCanvasSelectedNodeId,
    patchActiveCanvas,
    updateCanvasNode,
    addEvent,
    makeResultId,
  });

  const resultDownloadDeps = { quickResults, selectedIds, addEvent, quickResultDragIdRef, QUICK_RESULT_DRAG_TYPE, copyText, saveDirectory, refreshSaveDirectory, setSaveDirectory, setDirectoryDraft, setDownloadFeedbackIds, downloadFeedbackTimersRef };
  const { blobFromImageItem, beginResultImageDrag, beginReferenceImageDrag, copyImage, downloadItem, autoSaveGeneratedItems, downloadSelected, downloadAll } = createResultDownload(resultDownloadDeps);

  // V60（P3-5）：详情主图状态与编排收口到 useDetailState。
  // ⚠️ syncHistoryFromServer 晚绑定：它由下方 createResultActions 产出，而该工厂又依赖本 hook 的
  // detailInfoSelection / setDetailInfoSelection / setDetailGroups ⇒ 双向引用。
  // 用 ref 承接（工厂调用后回填），避免 TDZ（渲染期访问未初始化的 syncHistoryFromServer 会黑屏）。
  const syncHistoryFromServerRef = useRef(null);
  const detailApi = useDetailState({
    settings,
    config,
    models,
    setResults,
    addEvent,
    setError,
    setIsSettingsOpen,
    updateSetting,
    setActiveView,
    downloadItem,
    blobFromImageItem,
    saveDirectory,
    refreshSaveDirectory,
    setSaveDirectory,
    setDirectoryDraft,
    setContextMenu,
    setReferenceContextMenu,
    clampCount,
    makeResultId,
    normalizeGenerationErrorMessage,
    DETAIL_ANALYSIS_MODEL,
    syncHistoryFromServer: () => syncHistoryFromServerRef.current?.()
  });

  const {
    addReferenceRewriteFiles,
    removeReferenceRewriteFile,
    appendReferenceFiles,
    moveReferenceFile,
    onPickFiles,
    isReferenceDropData,
    onComposerDragOver,
    onComposerDragLeave,
    onComposerDrop,
    beginReferenceDrop,
    endReferenceDrop,
    onReferenceDrop,
    imageFilesFromReferenceDrop
  } = createReferenceUpload({
    referenceProductFiles,
    referenceStyleFiles,
    setReferenceProductFiles,
    setReferenceStyleFiles,
    setFiles,
    quickMaxReferenceFiles,
    addEvent,
    setIsComposerDragging,
    setReferenceDropTarget,
    results,
    detailGroups: detailApi.detailGroups,
    blobFromImageItem
  });

  // 2026-10-15 P6-4：画布 / 生成类 handler 搬入 useCanvasGenerationHandlers（src/features/canvas/）。
  // TDZ：本调用点置于全部 ctx 字段初始化之后（appendReferenceFiles 为最后一项，由上方 createReferenceUpload 产出）；
  //   兄弟函数 handleCanvasDrop / rerunResult 对 addCanvasFiles / generate 的引用均在事件回调体内、渲染期之后求值，无前向引用；
  //   JSX 引用全部位于下方 return 内。runCanvasImageRequest / canvasFileFromResult 仅钩内互相调用，父组件不解构。
  const {
    addCanvasFiles,
    generateCanvasNode,
    saveProcessedImageFile,
    optimizePrompt,
    sendResultToImageEditor,
    addReferenceThumbToUploads,
    generate
  } = useCanvasGenerationHandlers({
    config,
    settings,
    models,
    activeCanvas,
    saveDirectory,
    isQuickPromptOptimizing,
    setError,
    setStatus,
    setResults,
    setTiming,
    setQuickTasks,
    setActiveView,
    setIsSettingsOpen,
    setCanvasTasks,
    setCanvasSelectedNodeId,
    setSaveDirectory,
    setDirectoryDraft,
    setReferenceContextMenu,
    setImageEditorSeed,
    setIsQuickPromptOptimizing,
    addEvent,
    autoSaveEventText,
    updateSetting,
    canvasCenterPoint,
    patchActiveCanvas,
    patchCanvasById,
    updateCanvasNodeByCanvasId,
    refreshSaveDirectory,
    appendReferenceFiles,
    blobFromImageItem,
    autoSaveGeneratedItems,
    makeResultId,
    clampCount,
    createCanvasNode,
    normalizeGenerationErrorMessage,
    CANVAS_NODE_HEIGHT,
    DETAIL_ANALYSIS_MODEL,
    CLIENT_SESSION_ID
  });

  const videoApi = useVideoState({
    settings,
    config,
    addEvent,
    setIsSettingsOpen,
    setIsComposerDragging,
    clientSessionId: CLIENT_SESSION_ID,
    isReferenceDropData,
    imageFilesFromReferenceDrop
  });

  const referenceApi = useReferenceState({
    settings,
    config,
    models,
    results,
    setResults,
    addEvent,
    setIsSettingsOpen,
    clientSessionId: CLIENT_SESSION_ID,
    clampCount,
    makeResultId,
    normalizeGenerationErrorMessage,
    DETAIL_ANALYSIS_MODEL,
    referenceProductFiles,
    referenceStyleFiles,
    addReferenceRewriteFiles,
    removeReferenceRewriteFile
  });

  // 2026-10-14（V60 浏览器实测时发现）：V58 抽 useVideoState 时把这段派生值留在了 videoApi
  // 声明之前 ⇒ 渲染期读 const 的 TDZ ⇒ 整页不挂载（白屏，ReferenceError: Cannot access
  // 'videoApi' before initialization）。发布版 v4.0.6（5533e84）读的是模块级 runningVideoTasks，
  // 没有这个问题；回归由 V58 引入，与本单无关但会挡住所有浏览器验收，故一并修复：
  // 只把派生值下移到 videoApi 声明之后，逻辑与文案逐字不变。
  const latestVideoStatusText = videoApi.runningVideoTasks.length > 0
    ? `视频生成中 ${videoApi.runningVideoTasks.length} 个任务`
    : videoApi.videoStatus === "failed"
      ? "视频任务失败"
      : videoApi.videoStatus === "success"
        ? "视频已完成"
        : videoApi.videoBillingRequired && !billingGatewayEnabled
          ? "等待计费接入"
          : "等待视频生成";

  const previewNavigationItems = useMemo(() => {
    if (!previewResult) return [];
    const previewSource = previewResult.source || "quickgen";
    if (previewSource === "detail-main") {
      return detailApi.activeDetailResults.map((item) => item.result).filter(Boolean);
    }
    if (previewSource === "reference-remix") {
      return referenceApi.referenceGalleryItems
        .filter((item) => item.kind === "result")
        .map((item) => item.result)
        .filter(Boolean);
    }
    if (previewSource === "infinite-canvas") {
      return results
        .filter((item) => item.source === "infinite-canvas")
        .sort((a, b) => (
          (Number.isFinite(a.submittedAt) ? a.submittedAt : (Number.isFinite(a.createdAt) ? a.createdAt : 0))
          - (Number.isFinite(b.submittedAt) ? b.submittedAt : (Number.isFinite(b.createdAt) ? b.createdAt : 0))
        ));
    }
    return quickGalleryItems
      .filter((item) => item.kind === "result")
      .map((item) => item.result)
      .filter(Boolean);
  }, [previewResult, detailApi.activeDetailResults, referenceApi.referenceGalleryItems, quickGalleryItems, results]);



  // V60：详情私有状态已移入 useDetailState，此处经 detailApi 回传（见 detail/README.md 偏差③）。
  const resultActionsDeps = { setSelectedIds, selectedIds, activeView, quickResults, setResults, setBrokenResultImages, detailInfoSelection: detailApi.detailInfoSelection, setDetailInfoSelection: detailApi.setDetailInfoSelection, setDetailGroups: detailApi.setDetailGroups, removeHistoryResults, loadHistoryResults, hydrateDetailGroupsWithHistory, addEvent };
  const { toggleSelected, deleteSelected, deleteResult, markResultImageBroken, refreshHistory, syncHistoryFromServer } = createResultActions(resultActionsDeps);
  // 回填晚绑定 ref：详情生成完成后（2.4s 延时）用它回载历史。
  syncHistoryFromServerRef.current = syncHistoryFromServer;

  // P6-5：useMainHandlers 晚绑定 ref 回填（渲染期执行；此时 addCanvasFiles(P6-4 钩) /
  //   patchActiveCanvas(createCanvasActions) / videoApi / appendReferenceFiles(createReferenceUpload) /
  //   referenceApi / refreshSaveDirectory(useSaveDirectory) / previewNavigationItems(useMemo) /
  //   moveReferenceFile(createReferenceUpload) /
  //   detailApi / generate(P6-4 钩) 均已初始化；handler 只在事件回调 / effect 内调用，无 TDZ）。
  handlerLateRef.current = {
    addCanvasFiles,
    patchActiveCanvas,
    moveReferenceFile,
    videoApi,
    appendReferenceFiles,
    referenceApi,
    refreshSaveDirectory,
    previewNavigationItems,
    detailApi,
    generate
  };

  const {
    clearQuickResultDragState,
    handleQuickResultReplaceDragOver,
    handleQuickResultReplaceDrop
  } = createQuickResultReplace({
    quickResultDragIdRef,
    quickResultReplaceTargetId,
    setQuickResultReplaceTargetId,
    results,
    setResults,
    setSelectedIds,
    previewResult,
    setPreviewResult,
    removeHistoryResults,
    saveHistoryResults,
    addEvent,
    QUICK_RESULT_DRAG_TYPE
  });




  // ---- 参考图左右调顺序（pointer 版，与批量侧 outfit-panels 同一套手感）----
  // V11-RF-043-2：共享 `ReferenceThumbTray` 的 onOpen 约定统一为 `(reference, index, items)`，
  // 第一个实参是**被点击的那一张**，不再是整组（旧版是 `onOpen(items, index)`）。
  // 本页预览要的是整组 ⇒ 取第三个实参 items；items 缺失时退化到被点击的这一张（放宽，不留静默失效）。
  // 正常路径下 items 就是旧版传进来的那个数组 ⇒ 与改前**行为等价**。
  return (
    // 最外层兜底：任何一个视图在渲染期抛错，都不会变成整页白屏。
    <ErrorBoundary label="应用主界面">
      <main className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="avatar">
            <img src="/app-avatar.webp" alt="" />
          </div>
          <div>
            <h1>静音AI绘画</h1>
            <span>静音相伴 从容设计</span>
            <span>静音:15871470202</span>
          </div>
        </div>

        <nav className="navList">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className={`navItem ${activeView === item.id ? "active" : ""} ${item.child ? "subNavItem" : ""}`}
                type="button"
                onClick={() => {
                  if (item.id === "prompts") {
                    setIsPromptAssistantOpen(true);
                    return;
                  }
                  setActiveView(item.id);
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button className="settingsEntry" type="button" onClick={() => openSettingsPanel()}>
          <Settings size={17} />
          <span>设置</span>
        </button>
      </aside>

      <section className={`quickgenArea ${["outfit", "resize"].includes(activeView) ? "embeddedWorkflowArea" : ""}`}>
        {!["outfit", "resize"].includes(activeView) && (
        <header className="topBar">
          <div className="resultTabs">
            {activeView === "infinite-canvas" ? (
              <div className="viewTitle">
                <Box size={16} />
                <span>无限画布</span>
              </div>
            ) : activeView === "detail-main" ? (
              <div className="viewTitle">
                <FileText size={16} />
                <span>一键详情/主图</span>
              </div>
            ) : activeView === "reference-remix" ? (
              <div className="viewTitle">
                <Layers size={16} />
                <span>参考生图</span>
              </div>
            ) : activeView === "image-editor" ? (
              <div className="viewTitle">
                <Brush size={16} />
                <span>图片编辑</span>
              </div>
            ) : (
              <>
                <button
                  className={`tabButton ${quickMode === "image" && resultFilter === "all" ? "active" : ""}`}
                  type="button"
                  onClick={() => { setQuickMode("image"); setResultFilter("all"); }}
                >
                  全部({imageCount + videoApi.videoCount})
                </button>
                <button
                  className={`tabButton ${quickMode === "image" && resultFilter === "image" ? "active" : ""}`}
                  type="button"
                  onClick={() => { setQuickMode("image"); setResultFilter("image"); }}
                >
                  <ImageIcon size={14} /> 图片({imageCount})
                </button>
                <button
                  className={`tabButton ${quickMode === "video" ? "active" : ""}`}
                  type="button"
                  onClick={() => { setQuickMode("video"); setResultFilter("video"); }}
                >
                  <Video size={14} /> 视频({videoApi.videoCount})
                </button>
              </>
            )}
          </div>

          <div className="topActions">
            {activeView === "quickgen" && (
              <button className="toolbarButton" type="button" onClick={() => void refreshHistory()}>
                <RefreshCw size={15} />
                <span>刷新</span>
              </button>
            )}
            <button className="toolbarButton" type="button" onClick={openDirectoryModal}>
              <FolderOpen size={15} />
              <span>指定文件夹</span>
            </button>
            {activeView === "detail-main" && (
              <button
                className="generateButton pinnedFolderButton"
                type="button"
                onClick={() => detailApi.activeDetailGroup && detailApi.openStitchPreview(detailApi.activeDetailGroup)}
                disabled={!detailApi.activeDetailGroup || detailApi.activeDetailResults.length === 0}
              >
                <Layers size={15} />
                <span>拼图预览</span>
              </button>
            )}
            <button className="toolbarButton pinnedFolderButton" type="button" onClick={() => void openSaveDirectory()}>
              <FolderOpen size={15} />
              <span>打开保存目录</span>
            </button>
            {activeView === "infinite-canvas" && (
              <>
                <select className="toolbarSelect" value={activeCanvasId || ""} onChange={(event) => selectCanvas(event.target.value)}>
                  {canvases.map((canvas) => <option key={canvas.id} value={canvas.id}>{canvas.name}</option>)}
                </select>
                <span className={`taskBadge task-${canvasRunningCount > 0 ? "running" : "success"}`}>{canvasStatusText}</span>
                <button className="toolbarButton" type="button" onClick={createCanvas}>
                  <Plus size={15} />
                  <span>新建画布</span>
                </button>
                <button className="toolbarButton" type="button" onClick={renameCanvas} disabled={!activeCanvas}>
                  <Pencil size={15} />
                  <span>重命名</span>
                </button>
                <button className="toolbarButton" type="button" onClick={fitCanvasView} disabled={!activeCanvas}>
                  <Maximize2 size={15} />
                  <span>适配</span>
                </button>
                <button className="dangerButton" type="button" onClick={clearCanvas} disabled={!activeCanvas}>
                  <Trash2 size={15} />
                  <span>清空</span>
                </button>
              </>
            )}
            {activeView === "detail-main" && (
              <span className={`taskBadge task-${detailApi.detailStatus === "failed" ? "failed" : detailApi.detailRunningCount > 0 || detailApi.detailStatus === "planning" ? "running" : "success"}`}>
                {detailApi.detailStatusText}
              </span>
            )}
            {activeView === "quickgen" && (
              <>
                {quickMode === "video" ? (
                  <>
                    <span className={`taskBadge task-${videoApi.videoStatus === "failed" ? "failed" : videoApi.runningVideoTasks.length > 0 ? "running" : videoApi.videoStatus}`}>{latestVideoStatusText}</span>
                    <button className="toolbarButton" type="button" onClick={() => videoApi.videoResults[0] && downloadVideoResult(videoApi.videoResults[0])} disabled={videoApi.videoResults.length === 0}>
                      <Download size={15} />
                      <span>下载最新</span>
                    </button>
                    <button className="dangerButton" type="button" onClick={videoApi.clearVideoResults} disabled={videoApi.videoResults.length === 0 && videoApi.runningVideoTasks.length === 0}>
                      <Trash2 size={15} />
                      <span>清空视频</span>
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`taskBadge task-${quickStatus}`}>{latestStatusText}</span>
                    <button className="toolbarButton" type="button" onClick={downloadSelected} disabled={quickSelectedCount === 0}>
                      <Download size={15} />
                      <span>下载选中</span>
                    </button>
                    <button className="toolbarButton" type="button" onClick={downloadAll} disabled={quickResults.length === 0}>
                      <Download size={15} />
                      <span>下载全部</span>
                    </button>
                    <button className="dangerButton" type="button" onClick={deleteSelected} disabled={quickSelectedCount === 0}>
                      <Trash2 size={15} />
                      <span>删除选中</span>
                    </button>
                    <button className="dangerButton" type="button" onClick={clearAll}>
                      <Trash2 size={15} />
                      <span>清空全部</span>
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
                  </>
                )}
              </>
            )}
            {activeView === "reference-remix" && (
              <>
                <span className={`taskBadge task-${referenceApi.runningReferenceTasks.length > 0 ? "running" : referenceApi.referenceStatus}`}>
                  {referenceApi.referenceStatusText}
                </span>
                <button className="toolbarButton" type="button" onClick={clearAll} disabled={referenceApi.referenceResults.length === 0}>
                  <Trash2 size={15} />
                  <span>清空参考结果</span>
                </button>
              </>
            )}
          </div>
        </header>
        )}

        {["outfit", "resize"].includes(activeView) ? (
          <ErrorBoundary label="批量生成">
            <React.Suspense fallback={VIEW_LOADING}>
              <LazyOutfitWorkflow
                view={activeView}
                hostTheme={settings.theme}
                hostApiKey={settings.apiKey}
                onOpenHostSettings={openSettingsPanel}
              />
            </React.Suspense>
          </ErrorBoundary>
        ) : activeView === "image-editor" ? (
          <ErrorBoundary label="图片编辑">
            <React.Suspense fallback={VIEW_LOADING}>
              <LazyImageEditorPanel
                incomingImage={imageEditorSeed}
                onIncomingHandled={(id) => setImageEditorSeed((current) => current?.id === id ? null : current)}
                resolveDroppedFiles={imageFilesFromReferenceDrop}
                saveDirectory={saveDirectory}
                onChooseDirectory={openDirectoryModal}
                onOpenSaveDirectory={() => void openSaveDirectory()}
                onSaveMergedImage={saveProcessedImageFile}
                onAddEvent={addEvent}
              />
            </React.Suspense>
          </ErrorBoundary>
        ) : activeView === "detail-main" ? (
          <DetailView
            detailApi={detailApi}
            events={events}
            models={models}
            config={config}
            countOptions={COUNT_OPTIONS}
            selectedIds={selectedIds}
            selectedCount={selectedCount}
            toggleSelected={toggleSelected}
            openPreview={openPreview}
            openContextMenu={openContextMenu}
            rerunResult={rerunResult}
            downloadItem={downloadItem}
            copyText={copyText}
            beginResultImageDrag={beginResultImageDrag}
            openReferencePreview={openReferencePreview}
            openReferenceContextMenu={openReferenceContextMenu}
            beginReferenceImageDrag={beginReferenceImageDrag}
            openUploadPreview={openUploadPreview}
            markDeferredFeature={markDeferredFeature}
            onOpenPromptAssistant={() => setIsPromptAssistantOpen(true)}
          />
        ) : activeView === "infinite-canvas" ? (
          <section className="infiniteCanvasView">
            <aside className="canvasToolPanel">
              <header>
                <div>
                  <strong>{activeCanvas?.name || "无限画布"}</strong>
                  <span>{canvasStatusText}</span>
                </div>
              </header>

              <div className="canvasToolGroup">
                <button className="smallButton" type="button" onClick={() => addCanvasNode("prompt", canvasCenterPoint(-180, -80))}>
                  <FileText size={15} />
                  <span>提示词</span>
                </button>
                <button className="smallButton" type="button" onClick={() => addCanvasNode("generator", canvasCenterPoint(40, -120))}>
                  <Sparkles size={15} />
                  <span>生图</span>
                </button>
                <button className="smallButton" type="button" onClick={() => canvasFileInputRef.current?.click()}>
                  <Upload size={15} />
                  <span>图片</span>
                </button>
                <input
                  ref={canvasFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    void addCanvasFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>

              <div className="canvasToolGroup">
                <button className="smallButton" type="button" onClick={createCanvas}>
                  <Plus size={15} />
                  <span>新建</span>
                </button>
                <button className="smallButton" type="button" onClick={renameCanvas} disabled={!activeCanvas}>
                  <Pencil size={15} />
                  <span>重命名</span>
                </button>
                <button className="dangerButton" type="button" onClick={deleteCanvas} disabled={!activeCanvas}>
                  <Trash2 size={15} />
                  <span>删除画布</span>
                </button>
              </div>

              <section className="canvasConnectionList">
                <strong>连线</strong>
                {(activeCanvas?.connections || []).map((connection) => {
                  const fromNode = activeCanvas.nodes.find((node) => node.id === connection.fromNodeId);
                  const toNode = activeCanvas.nodes.find((node) => node.id === connection.toNodeId);
                  return (
                    <div key={connection.id}>
                      <span>{fromNode?.title || "节点"} → {toNode?.title || "节点"}</span>
                      <button className="iconButton" type="button" onClick={() => removeCanvasConnection(connection.id)} title="断开">
                        <Unlink size={14} />
                      </button>
                    </div>
                  );
                })}
                {(!activeCanvas || activeCanvas.connections.length === 0) && <p>暂无连线</p>}
              </section>
            </aside>

            <section
              className={`infiniteCanvasStage ${canvasDrag?.type === "pan" ? "panning" : ""}`}
              ref={canvasStageRef}
              onWheel={handleCanvasWheel}
              onPointerDown={beginCanvasPan}
              onPointerMove={moveCanvasDrag}
              onPointerUp={endCanvasDrag}
              onPointerCancel={endCanvasDrag}
              onDragOver={(event) => {
                if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={handleCanvasDrop}
            >
              <div className="infiniteCanvasGrid" />
              {activeCanvas && (
                <div
                  className="infiniteWorld"
                  style={{ transform: `translate(${canvasViewport.x}px, ${canvasViewport.y}px) scale(${canvasViewport.scale})` }}
                >
                  <svg className="infiniteLinks" aria-hidden="true">
                    {activeCanvas.connections.map((connection) => {
                      const fromNode = activeCanvas.nodes.find((node) => node.id === connection.fromNodeId);
                      const toNode = activeCanvas.nodes.find((node) => node.id === connection.toNodeId);
                      if (!fromNode || !toNode) return null;
                      const fromX = fromNode.x + fromNode.w;
                      const fromY = fromNode.y + 44;
                      const toX = toNode.x;
                      const toY = toNode.y + 44;
                      return (
                        <path
                          key={connection.id}
                          d={`M ${fromX} ${fromY} C ${fromX + 90} ${fromY}, ${toX - 90} ${toY}, ${toX} ${toY}`}
                        />
                      );
                    })}
                  </svg>

                  {activeCanvas.nodes.map((node) => {
                    const selected = canvasSelectedNodeId === node.id;
                    const nodeTasks = canvasTasks.filter((task) => task.canvasId === activeCanvas.id && task.nodeId === node.id);
                    const incomingNodes = node.type === "generator" ? incomingCanvasNodes(activeCanvas, node.id) : [];
                    const incomingImages = node.type === "generator" ? canvasImagesForGenerator(activeCanvas, node) : [];
                    const incomingImageEntries = node.type === "generator" ? canvasImageEntriesForGenerator(activeCanvas, node) : [];
                    const batchParts = node.type === "generator" ? splitCanvasBatchEntries(incomingImageEntries) : { modelEntries: [], fixedEntries: [] };
                    const resultItems = canvasResultItemsFromNode(node);
                    const nodeIcon = node.type === "generator"
                      ? <Sparkles size={15} />
                      : node.type === "prompt"
                        ? <FileText size={15} />
                        : node.type === "output"
                          ? <Layers size={15} />
                          : <ImageIcon size={15} />;
                    return (
                      <article
                        className={`infiniteNode ${node.type} ${selected ? "selected" : ""}`}
                        key={node.id}
                        style={{ left: node.x, top: node.y, width: node.w, minHeight: node.h }}
                        onPointerDown={(event) => beginCanvasNodeDrag(event, node.id)}
                      >
                        {node.type !== "generator" && (
                          <button
                            className={`nodePort output ${canvasConnectStart?.nodeId === node.id ? "active" : ""}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              beginCanvasConnection(node.id);
                            }}
                            title="输出"
                          >
                            <Link2 size={13} />
                          </button>
                        )}
                        {node.type === "generator" && (
                          <button
                            className={`nodePort input ${canvasConnectStart ? "ready" : ""}`}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              completeCanvasConnection(node.id);
                            }}
                            title="输入"
                          >
                            <Link2 size={13} />
                          </button>
                        )}
                        <header>
                          <span>{nodeIcon}</span>
                          <input
                            value={node.title}
                            onChange={(event) => updateCanvasNode(node.id, { title: event.target.value })}
                            onPointerDown={(event) => event.stopPropagation()}
                          />
                          <button className="iconButton" type="button" onClick={() => deleteCanvasNode(node.id)} title="删除节点">
                            <X size={14} />
                          </button>
                        </header>

                        {node.type === "prompt" && (
                          <StableTextarea
                            className="canvasPromptTextarea"
                            value={node.text}
                            onChange={(event) => updateCanvasNode(node.id, { text: event.target.value })}
                            onPointerDown={(event) => event.stopPropagation()}
                          />
                        )}

                        {node.type === "image" && node.result && (
                          <>
                            <button
                              className="canvasImagePreview"
                              type="button"
                              onClick={() => openPreview(node.result)}
                              onContextMenu={(event) => openContextMenu(event, node.result.id)}
                            >
                              <CachedImage
                                src={imageSourceFromResult(node.result.image)}
                                alt={node.title}
                                draggable
                                onDragStart={(event) => beginResultImageDrag(event, node.result)}
                              />
                            </button>
                            <label className="canvasImageRole">
                              <span>角色</span>
                              <select
                                value={node.role || "auto"}
                                onChange={(event) => updateCanvasNode(node.id, { role: event.target.value })}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {canvasImageRoleOptions.map((option) => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <StableTextarea
                              className="canvasNodePrompt"
                              value={node.prompt || ""}
                              onChange={(event) => updateCanvasNode(node.id, { prompt: event.target.value })}
                              onPointerDown={(event) => event.stopPropagation()}
                              placeholder="参考备注"
                            />
                            <button className="smallButton" type="button" onClick={() => void downloadItem(node.result, 0)}>
                              <Download size={14} />
                              <span>下载</span>
                            </button>
                          </>
                        )}

                        {node.type === "generator" && (
                          <div className="canvasGeneratorBody">
                            <div className="canvasNodeStats">
                              <span>输入 {incomingNodes.length}</span>
                              <span>参考图 {incomingImages.length}</span>
                              <span>模特 {batchParts.modelEntries.length}</span>
                              <span>固定 {batchParts.fixedEntries.length}</span>
                            </div>
                            <label>
                              <span>模式</span>
                              <select
                                value={node.params?.batchMode || "single"}
                                onChange={(event) => updateCanvasNode(node.id, {
                                  params: { ...node.params, batchMode: event.target.value }
                                })}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {canvasBatchModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                              </select>
                            </label>
                            <label>
                              <span>模型</span>
                              <select
                                value={node.params?.model || settings.model}
                                onChange={(event) => updateCanvasNode(node.id, {
                                  params: { ...node.params, model: event.target.value }
                                })}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                              </select>
                            </label>
                            <label>
                              <span>比例</span>
                              <select
                                value={node.params?.aspectRatio || settings.aspectRatio}
                                onChange={(event) => updateCanvasNode(node.id, {
                                  params: { ...node.params, aspectRatio: event.target.value }
                                })}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {(models.find((model) => model.value === (node.params?.model || settings.model))?.ratios || ratios).map((ratio) => (
                                  <option key={ratio} value={ratio}>{ratio}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>清晰度</span>
                              <select
                                value={node.params?.imageSize || settings.imageSize}
                                onChange={(event) => updateCanvasNode(node.id, {
                                  params: { ...node.params, imageSize: event.target.value }
                                })}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {quickSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                              </select>
                            </label>
                            <label>
                              <span>数量</span>
                              <select
                                value={node.params?.n || 1}
                                onChange={(event) => updateCanvasNode(node.id, {
                                  params: { ...node.params, n: clampCount(event.target.value) }
                                })}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                {COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}</option>)}
                              </select>
                            </label>
                            <StableTextarea
                              value={node.prompt || ""}
                              onChange={(event) => updateCanvasNode(node.id, { prompt: event.target.value })}
                              onPointerDown={(event) => event.stopPropagation()}
                              placeholder="补充提示词"
                            />
                            <button className="generateButton" type="button" onClick={() => void generateCanvasNode(node.id)}>
                              {nodeTasks.length > 0 ? <Loader2 className="spin" size={15} /> : <Play size={15} />}
                              <span>生成输出</span>
                            </button>
                            {nodeTasks.map((task) => (
                              <small className="canvasTaskLine" key={task.id}>{task.taskLabel || "任务"} · <ElapsedTimer startedAt={task.startedAt} /> · {task.modelLabel}</small>
                            ))}
                            {node.error && <strong className="canvasNodeError">{node.error}</strong>}
                            {node.generationMs && !node.error && <small className="canvasTaskLine">上次 {formatMs(node.generationMs)}</small>}
                          </div>
                        )}

                        {node.type === "output" && (
                          <div className="canvasOutputBody">
                            <div className="canvasOutputGrid">
                              {resultItems.map((result, resultIndex) => (
                                <button
                                  type="button"
                                  key={result.id}
                                  onClick={() => openPreview(result)}
                                  onContextMenu={(event) => openContextMenu(event, result.id)}
                                >
                                  <CachedImage
                                    src={imageSourceFromResult(result.image)}
                                    alt={`输出 ${resultIndex + 1}`}
                                    draggable
                                    onDragStart={(event) => beginResultImageDrag(event, result, resultIndex)}
                                  />
                                </button>
                              ))}
                            </div>
                            <button className="smallButton" type="button" onClick={() => void copyText(node.prompt, "提示词已复制")}>
                              <Copy size={14} />
                              <span>复制提示词</span>
                            </button>
                            {node.generationMs && <small className="canvasTaskLine">用时 {formatMs(node.generationMs)}</small>}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}

              {events.length > 0 && (
                <div className="eventPill">
                  <strong>{events[0].label}</strong>
                  <span>{events[0].detail}</span>
                </div>
              )}
            </section>
          </section>
        ) : activeView === "reference-remix" ? (
          <ReferenceRemixView
            referenceApi={referenceApi}
            events={events}
            downloadFeedbackIds={downloadFeedbackIds}
            models={models}
            config={config}
            openPreview={openPreview}
            openContextMenu={openContextMenu}
            downloadItem={downloadItem}
            copyText={copyText}
            beginResultImageDrag={beginResultImageDrag}
            openReferencePreview={openReferencePreview}
            openReferenceContextMenu={openReferenceContextMenu}
            beginReferenceImageDrag={beginReferenceImageDrag}
            openUploadPreview={openUploadPreview}
            markDeferredFeature={markDeferredFeature}
            countOptions={COUNT_OPTIONS}
            referenceStrengthOptions={REFERENCE_STRENGTH_OPTIONS}
            referenceControlOptions={referenceControlOptions}
          />
        ) : activeView === "quickgen" && quickMode === "video" ? (
          <VideoView
            videoApi={videoApi}
            isComposerDragging={isComposerDragging}
            onComposerDragLeave={onComposerDragLeave}
            onComposerPaste={onComposerPaste}
            downloadVideoResult={downloadVideoResult}
            setIsPromptAssistantOpen={setIsPromptAssistantOpen}
            events={events}
            galleryZoom={galleryZoom}
            copyText={copyText}
          />
        ) : (
        <div className="canvasBoard" onWheel={onQuickBoardWheel}>
          <section ref={quickGalleryRef} className="galleryStrip" style={{ "--asset-card-min": `${galleryCardMin}px` }}>
            {quickGalleryItems.map((galleryItem, index) => {
              if (galleryItem.kind === "task") {
                const task = galleryItem.task;
                return (
                  <article className="assetCard loadingCard" key={galleryItem.key}>
                    <Loader2 className="spin" size={28} />
                    <span>生成中</span>
                    <strong><ElapsedTimer startedAt={task.startedAt} /></strong>
                    <em>{task.modelLabel} · {task.imageSize} · {task.aspectRatio}</em>
                  </article>
                );
              }
              const item = galleryItem.result;
              const src = imageSourceFromResult(item.image);
              // P1 缺图自愈：已知失效（服务端标记）或加载失败过 → 不再发请求，直接显示原因。
              // 失败标记带 src 快照：重刷后地址变了就自动失效，不会把新图也判成坏图。
              const cardState = resultImageCardState(item.image, imageSourceFromResult);
              const brokenEntry = brokenResultImages[item.id];
              const brokenReason = cardState.missing
                ? cardState.reason
                : (brokenEntry && brokenEntry.src === src ? brokenEntry.reason : "");
              const selected = selectedIds.has(item.id);
              return (
                <article
                  className={`assetCard ${quickResultReplaceTargetId === item.id ? "replaceTarget" : ""}`}
                  key={galleryItem.key}
                  onClick={() => openPreview(item)}
                  onContextMenu={(event) => openContextMenu(event, item.id)}
                  onDragOver={(event) => handleQuickResultReplaceDragOver(event, item)}
                  onDragLeave={() => setQuickResultReplaceTargetId((current) => current === item.id ? "" : current)}
                  onDrop={(event) => handleQuickResultReplaceDrop(event, item)}
                >
                  <button
                    className="selectBox"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleSelected(item.id);
                    }}
                    aria-label="选择图片"
                  >
                    {selected ? <CheckSquare size={24} /> : <Square size={24} />}
                  </button>
                  <button
                    className={`assetDownloadButton ${downloadFeedbackIds.has(item.id) ? "downloaded" : ""}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      void downloadItem(item, index);
                    }}
                    title="下载到指定文件夹"
                    aria-label="下载到指定文件夹"
                  >
                    {downloadFeedbackIds.has(item.id) ? <Check size={16} /> : <Download size={16} />}
                  </button>
                  <button
                    className="assetRerunButton"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      rerunResult(item, 1);
                    }}
                    title="重刷这张结果"
                    aria-label="重刷这张结果"
                  >
                    <RefreshCw size={15} />
                  </button>
                  <button
                    className="assetDeleteButton"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteResult(item.id);
                    }}
                    title="删除这张结果"
                    aria-label="删除这张结果"
                  >
                    <Trash2 size={15} />
                  </button>
                  {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
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
                      alt={`生成图片 ${index + 1}`}
                      draggable
                      onDragStart={(event) => beginResultImageDrag(event, item, index)}
                      onDragEnd={clearQuickResultDragState}
                      onError={() => markResultImageBroken(item)}
                      diagnostic={{ requestId: item.requestId || item.id, endpoint: "/api/images", module: "快捷生成", placement: "quick-card" }}
                    />
                  )}
                  <ReferenceThumbTray references={item.references} count={item.referenceCount} className="assetReferenceTray" onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
                  {item.prompt && (
                    <button
                      className="assetPrompt"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        copyText(item.prompt, "提示词已复制");
                      }}
                      title={item.prompt}
                    >
                      {item.prompt}
                    </button>
                  )}
                  <div className="assetMeta">
                    <span>{item.modelLabel}</span>
                    <strong>{item.imageSize} · {item.aspectRatio}</strong>
                  </div>
                </article>
              );
            })}
          </section>

          {quickResults.length === 0 && runningQuickTasks.length === 0 && (
            <div className="emptyCanvas">
              <ImageIcon size={34} />
              <span>{status === "failed" ? error : "暂无图片"}</span>
            </div>
          )}

          <section
            className={`composer ${isComposerDragging ? "dragging" : ""}`}
            onDragOver={onComposerDragOver}
            onDragLeave={onComposerDragLeave}
            onDrop={onComposerDrop}
            onPaste={onComposerPaste}
          >
            {/* 2026-09-25 UI 调整：删除悬浮框里的「图片生成 / 视频生成」页签。
                它与顶部结果栏的「全部 / 图片 / 视频」是同一功能的重复入口，
                切换逻辑和底层 setQuickMode 都保留（顶部栏仍然可以切）。 */}

            {previewFiles.length > 0 && (
              <div className="composerReferences">
                <div
                  className={`referenceInsertZone ${referenceDropTarget?.type === "insert" && referenceDropTarget.index === 0 ? "active" : ""}`}
                  onDragOver={(event) => beginReferenceDrop(event, "insert", 0)}
                  onDragLeave={endReferenceDrop}
                  onDrop={(event) => onReferenceDrop(event, "insert", 0)}
                  title="拖到这里插入图片"
                />
                {previewFiles.map((item, index) => (
                  <React.Fragment key={item.id || `${item.file.name}-${item.file.lastModified}-${index}`}>
                    <div
                      className={`referenceThumbWrap ${draggingReferenceId === item.id ? "sorting" : ""} ${referenceSortTarget?.id === item.id ? (referenceSortTarget.placement === "after" ? "dropAfter" : "dropBefore") : ""}`}
                      data-reference-id={item.id}
                    >
                      <div
                      className={`referenceThumb ${referenceDropTarget?.type === "replace" && referenceDropTarget.index === index ? "replaceTarget" : ""} ${item.cropEdit ? "cropEditReady" : ""} ${item.localEdit ? "localEditReady" : ""}`}
                      data-reference-index={index}
                      draggable={false}
                      onDragOver={(event) => beginReferenceDrop(event, "replace", index)}
                      onDragLeave={endReferenceDrop}
                      onDrop={(event) => onReferenceDrop(event, "replace", index)}
                      onPointerDown={(event) => beginReferenceSort(event, item)}
                      onPointerMove={moveReferenceSort}
                      onPointerUp={endReferenceSort}
                      onPointerCancel={cancelReferenceSort}
                      onClick={() => openUploadPreview(item)}
                      title={previewFiles.length > 1 ? `${item.file.name} · ${fileSize(item.file.size)}，按住可左右拖动调整顺序；拖新图到这里可替换` : `${item.file.name} · ${fileSize(item.file.size)}，拖新图到这里可替换`}
                    >
                      <b>图{index + 1}</b>
                      <img src={item.url} alt={item.file.name} draggable={false} />
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); removeReferenceImage(index); }}
                        onPointerDown={(event) => event.stopPropagation()}
                        aria-label="移除参考图"
                      >
                        <X size={12} />
                      </button>
                      </div>
                      <div className="referenceToolRow">
                        <button
                          className={`referenceToolButton ${item.cropEdit ? "active" : ""}`}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); openQuickCropEdit(item); }}
                          title={item.cropEdit ? "重新调整普通裁剪" : "普通裁剪"}
                          aria-label={item.cropEdit ? "重新调整普通裁剪" : "普通裁剪"}
                        >
                          <Crop size={14} />
                        </button>
                        <button
                          className={`referenceToolButton ${item.localEdit ? "active" : ""}`}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); openQuickLocalEdit(item); }}
                          title={item.localEdit ? "重新调整局部回贴" : "局部回贴"}
                          aria-label={item.localEdit ? "重新调整局部回贴" : "局部回贴"}
                        >
                          <Scissors size={14} />
                        </button>
                      </div>
                    </div>
                    <div
                      className={`referenceInsertZone ${referenceDropTarget?.type === "insert" && referenceDropTarget.index === index + 1 ? "active" : ""}`}
                      onDragOver={(event) => beginReferenceDrop(event, "insert", index + 1)}
                      onDragLeave={endReferenceDrop}
                      onDrop={(event) => onReferenceDrop(event, "insert", index + 1)}
                      title="拖到这里插入图片"
                    />
                  </React.Fragment>
                ))}
              </div>
            )}

            <DebouncedTextarea
              className="promptBox"
              value={settings.prompt}
              onChange={(value) => updateSetting("prompt", value)}
              placeholder="输入你要生成或修改的画面"
            />

            <div className="composerFooter">
              {/* 快捷悬浮框右上角功能组：与 3.0 快捷生成右上角四个功能一一对应。
                  清空图片 / 提示词助手 / 优化提示词 / 渠道价格（线路价格）四个功能
                  在本页只保留这一套入口；底部原来的同名入口已删除。 */}
              <div className="quickToolCluster" role="group" aria-label="快捷生成工具">
                <button
                  className="quickToolButton"
                  type="button"
                  title="清空图片"
                  aria-label="清空图片"
                  onClick={() => { setFiles([]); setQuickCropEditTarget(null); setQuickLocalEditTarget(null); setIsQuickChannelMenuOpen(false); }}
                >
                  <Trash2 size={15} />
                </button>
                <button
                  className="quickToolButton"
                  type="button"
                  title="提示词助手"
                  aria-label="提示词助手"
                  onClick={() => { setIsPromptAssistantOpen(true); setIsQuickChannelMenuOpen(false); }}
                >
                  <BookOpen size={15} />
                </button>
                <button
                  className="quickToolButton"
                  type="button"
                  title="优化提示词"
                  aria-label="优化提示词"
                  disabled={isQuickPromptOptimizing}
                  onClick={() => { setIsQuickChannelMenuOpen(false); void optimizePrompt(); }}
                >
                  {isQuickPromptOptimizing ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
                </button>
                <button
                  className={`quickToolButton channelPriceButton ${isQuickChannelMenuOpen ? "active" : ""}`}
                  type="button"
                  title={quickChannel ? `线路价格：${quickChannel.label} ${channelPriceLabel(quickChannel)}` : "线路价格：当前模型暂无可用线路"}
                  aria-label="线路价格"
                  aria-expanded={isQuickChannelMenuOpen}
                  onClick={() => setIsQuickChannelMenuOpen((current) => !current)}
                >
                  <span className="quickToolGlyph">¥</span>
                </button>

                {isQuickChannelMenuOpen && (
                  <div className="quickChannelMenu" role="menu" aria-label="线路价格菜单">
                    <div className="quickChannelMenuTitle">
                      {activeModel?.label || settings.model} 可用线路
                    </div>
                    {quickChannels.map((channel) => (
                      <button
                        key={channel.id}
                        className={`quickChannelItem ${quickChannel?.id === channel.id ? "active" : ""}`}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          updateSetting("channelId", channel.id);
                          setIsQuickChannelMenuOpen(false);
                        }}
                      >
                        <span>{channel.label}</span>
                        <em>{channelPriceLabel(channel)}</em>
                      </button>
                    ))}
                    {quickChannels.length === 0 && (
                      <p className="quickChannelEmpty">当前模型暂无可用线路，请检查渠道目录</p>
                    )}
                  </div>
                )}
              </div>

              <div className="leftTools">
                {/* 2026-09-25 UI 调整：删除可见的「上传」和「库/素材库」按钮。
                    隐藏的 file input 与拖拽/粘贴上传能力全部保留（onPickFiles / onComposerDrop / onComposerPaste 未改动），
                    只是不再提供这两个重复入口的按钮。 */}
                <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPickFiles} />
              </div>

              <div className="rightTools">
                <select value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
                  {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
                <select value={settings.aspectRatio} onChange={(event) => updateSetting("aspectRatio", event.target.value)}>
                  {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
                <select value={settings.imageSize} onChange={(event) => updateSetting("imageSize", event.target.value)}>
                  {quickSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
                <select value={settings.n} onChange={(event) => updateSetting("n", event.target.value)}>
                  {COUNT_OPTIONS.filter((count) => count <= quickMaxReferenceFiles).map((count) => (
                    <option key={count} value={count}>{count}张</option>
                  ))}
                </select>
                <button className="generateButton" type="button" onClick={() => generate()}>
                  {runningQuickTasks.length > 0 ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                  <span>生成</span>
                </button>
              </div>
            </div>
          </section>

          {events.length > 0 && (
            <div className="eventPill">
              <strong>{events[0].label}</strong>
              <span>{events[0].detail}</span>
            </div>
          )}
        </div>
        )}
      </section>

      {isDirectoryModalOpen && (
        <div className="modalLayer" onMouseDown={() => setIsDirectoryModalOpen(false)}>
          <section className="saveDirectoryModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>指定文件夹</h2>
                <span>生成图片将保存到这个目录</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setIsDirectoryModalOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <label className="modalField">
              <span><FolderOpen size={15} /> 保存目录</span>
              <input
                value={directoryDraft}
                readOnly
                onClick={() => void pickSaveDirectory()}
                placeholder="例如 D:\RJ\静音内测\data\asset-library"
                title="点击选择保存目录"
              />
              <small className="fieldHint">
                {isPickingDirectory ? "正在等待目录选择..." : "点击输入框选择目录，点击确定后生效"}
              </small>
            </label>
            <footer className="directoryModalActions">
              <div>
                <button className="smallButton" type="button" onClick={() => setIsDirectoryModalOpen(false)}>取消</button>
                <button className="generateButton" type="button" onClick={() => void confirmSaveDirectory()}>确定</button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {detailApi.isDetailPresetOpen && (
        <div className="modalLayer" onMouseDown={() => detailApi.setIsDetailPresetOpen(false)}>
          <section className="detailPresetModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>加载详情预设</h2>
                <span>恢复一键详情/主图的参数与文案</span>
              </div>
              <button className="iconButton" type="button" onClick={() => detailApi.setIsDetailPresetOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div className="detailPresetList">
              {detailApi.detailPresets.map((preset) => (
                <article className="detailPresetItem" key={preset.id}>
                  <button type="button" onClick={() => detailApi.loadDetailPreset(preset)}>
                    <strong>{preset.name}</strong>
                    <span>{new Date(preset.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                  </button>
                  <button className="iconButton" type="button" onClick={() => detailApi.deleteDetailPreset(preset.id)} title="删除预设">
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
              {detailApi.detailPresets.length === 0 && <p className="promptEmpty">还没有保存过详情预设</p>}
            </div>
          </section>
        </div>
      )}

      {isSettingsOpen && (
        <SettingsView
          settings={settings}
          config={config}
          updateSetting={updateSetting}
          isSettingsOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          settingsApi={settingsApi}
        />
      )}


      <PromptAssistantView
        isOpen={isPromptAssistantOpen}
        categories={promptCategories}
        onClose={() => setIsPromptAssistantOpen(false)}
        promptApi={promptApi}
      />

      {detailApi.stitchPreview && detailApi.stitchGroup && (
        <div className="modalLayer stitchLayer" onMouseDown={detailApi.closeStitchPreview}>
          <section className="stitchPreviewModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>拼图预览</h2>
                <span>{detailApi.stitchGroup.label} · 共 {detailApi.stitchItems.length} 屏</span>
              </div>
              <div className="stitchHeaderActions">
                <button className="darkButton" type="button" onClick={() => void detailApi.downloadStitchPreview(detailApi.stitchGroup)}>
                  <Download size={15} />
                  <span>下载长图</span>
                </button>
                <button className="iconButton" type="button" onClick={detailApi.closeStitchPreview} aria-label="关闭">
                  <X size={18} />
                </button>
              </div>
            </header>
            <div
              className="stitchCanvasFrame"
              onWheel={detailApi.handleStitchWheel}
              onPointerDown={detailApi.beginStitchDrag}
              onPointerMove={detailApi.moveStitchDrag}
              onPointerUp={detailApi.endStitchDrag}
              onPointerCancel={detailApi.endStitchDrag}
              onContextMenu={(event) => detailApi.openStitchContextMenu(event, detailApi.stitchGroup.id)}
              title="滚轮缩放，按住拖动画面"
            >
              <div
                className="stitchLongImage"
                style={{ transform: `translate(${detailApi.stitchPan.x}px, ${detailApi.stitchPan.y}px) scale(${detailApi.stitchZoom})` }}
              >
                {detailApi.stitchItems.map(({ prompt, result }, stitchIndex) => (
                  <CachedImage
                    key={`${prompt.screen}-${result.id}`}
                    src={imageSourceFromResult(result.image)}
                    alt={`拼图第${prompt.screen}屏`}
                    draggable
                    onDragStart={(event) => beginResultImageDrag(event, result, stitchIndex)}
                    diagnostic={{ requestId: result.requestId || result.id, endpoint: "/api/images", module: "一键详情", placement: "stitch-preview" }}
                  />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {quickCropEditTarget && (
        <QuickCropViewportModal
          item={quickCropEditTarget}
          ratio={settings.aspectRatio}
          onClose={() => setQuickCropEditTarget(null)}
          onApply={applyQuickCropEdit}
          onClear={clearQuickCropEdit}
        />
      )}

      {quickLocalEditTarget && (
        <LocalEditModal
          item={quickLocalEditTarget}
          mode="local"
          ratio={settings.aspectRatio}
          onRatioChange={(nextRatio) => updateSetting("aspectRatio", nextRatio)}
          onClose={() => setQuickLocalEditTarget(null)}
          onApply={applyQuickLocalEdit}
          onClear={clearQuickLocalEdit}
          resolveBaseFile={quickReferenceOriginalFile}
          ratios={QUICK_LOCAL_EDIT_RATIOS}
          defaultCropRect={defaultQuickLocalEditCrop}
          fallbackToItem
        />
      )}

      {referencePreview && (
        <div className="modalLayer previewLayer" onMouseDown={closeReferencePreview}>
          <section className="previewModal referencePreviewModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>使用图预览</h2>
                <span>{referencePreview.items[referencePreview.index]?.name || `参考图 ${referencePreview.index + 1}`} · {referencePreview.index + 1}/{referencePreview.items.length}</span>
              </div>
              <button className="iconButton" type="button" onClick={closeReferencePreview} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div className="previewImageFrame referencePreviewFrame">
              {referencePreview.items.length > 1 && (
                <button className="previewArrow previewArrowLeft" type="button" onClick={(event) => { event.stopPropagation(); shiftReferencePreview(-1); }} disabled={referencePreview.index <= 0}>
                  <ChevronLeft size={22} />
                </button>
              )}
              <CachedImage
                src={referenceSource(referencePreview.items[referencePreview.index])}
                alt="使用图预览"
                draggable
                onDragStart={(event) => beginReferenceImageDrag(event, referencePreview.items[referencePreview.index], referencePreview.index)}
              />
              {referencePreview.items.length > 1 && (
                <button className="previewArrow previewArrowRight" type="button" onClick={(event) => { event.stopPropagation(); shiftReferencePreview(1); }} disabled={referencePreview.index >= referencePreview.items.length - 1}>
                  <ChevronRight size={22} />
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {uploadPreview && (
        <div className="modalLayer previewLayer" onMouseDown={closeUploadPreview}>
          <section className="previewModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>上传图片预览</h2>
                <span>{uploadPreview.name} · {fileSize(uploadPreview.size)}</span>
              </div>
              <button className="iconButton" type="button" onClick={closeUploadPreview} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div className="previewImageFrame uploadPreviewFrame" onMouseDown={closeUploadPreview} title="单击关闭">
              <img
                src={uploadPreview.url}
                alt={uploadPreview.name}
                draggable
                onDragStart={(event) => beginImageDownloadDrag(event, uploadPreview.url, uploadPreview.name || "上传图片")}
              />
            </div>
          </section>
        </div>
      )}

      {previewResult && (
        <div className="modalLayer previewLayer" onMouseDown={closePreview}>
          <section className="previewModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>图片预览</h2>
                <span>{previewResult.modelLabel} · {previewResult.imageSize} · {previewResult.aspectRatio}</span>
              </div>
              <button className="iconButton" type="button" onClick={closePreview} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div
              className="previewImageFrame"
              onWheel={handlePreviewWheel}
              onPointerDown={beginPreviewDrag}
              onPointerMove={movePreviewDrag}
              onPointerUp={endPreviewDrag}
              onPointerCancel={endPreviewDrag}
              onContextMenu={(event) => openContextMenu(event, previewResult.id)}
              title="滚轮缩放，按住拖动，单击关闭"
            >
              {(() => {
                const previewNavIndex = previewNavigationItems.findIndex((item) => item.id === previewResult.id);
                const previewCanNav = previewNavigationItems.length > 1;
                return (
                  <>
                    {previewCanNav && (
                      <button
                        className="previewArrow previewArrowLeft"
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onPointerCancel={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); shiftPreview(-1); }}
                        disabled={previewNavIndex <= 0}
                        aria-label="上一张"
                      >
                        <ChevronLeft size={22} />
                      </button>
                    )}
                    <CachedImage
                      src={imageSourceFromResult(previewResult.image)}
                      alt="放大预览"
                      draggable
                      onDragStart={(event) => beginResultImageDrag(event, previewResult)}
                      style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})` }}
                    />
                    {previewCanNav && (
                      <button
                        className="previewArrow previewArrowRight"
                        type="button"
                        onPointerDown={(event) => event.stopPropagation()}
                        onPointerUp={(event) => event.stopPropagation()}
                        onPointerCancel={(event) => event.stopPropagation()}
                        onClick={(event) => { event.stopPropagation(); shiftPreview(1); }}
                        disabled={previewNavIndex >= previewNavigationItems.length - 1}
                        aria-label="下一张"
                      >
                        <ChevronRight size={22} />
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
            {previewResult.prompt && (
              <button
                className="previewPrompt"
                type="button"
                onClick={() => copyText(previewResult.prompt, "提示词已复制")}
                title="点击复制提示词"
              >
                {previewResult.prompt}
              </button>
            )}
          </section>
        </div>
      )}

      {referenceContextMenu?.reference && (
        <div
          className="imageContextMenu referenceContextMenu"
          style={{ left: referenceContextMenu.x, top: referenceContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => void addReferenceThumbToUploads(referenceContextMenu.reference)}>
            <Upload size={15} />
            <span>发送到图片上传区</span>
          </button>
        </div>
      )}

      {detailApi.stitchContextMenu && detailApi.stitchContextGroup && (
        <div
          className="imageContextMenu stitchContextMenu"
          style={{ left: detailApi.stitchContextMenu.x, top: detailApi.stitchContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => { void detailApi.downloadStitchPreview(detailApi.stitchContextGroup); detailApi.setStitchContextMenu(null); }}>
            <Download size={15} />
            <span>下载长图</span>
          </button>
          <button type="button" onClick={() => { detailApi.downloadDetailGroup(detailApi.stitchContextGroup); detailApi.setStitchContextMenu(null); }}>
            <Layers size={15} />
            <span>下载分屏</span>
          </button>
          <button type="button" onClick={() => { void openSaveDirectory(); detailApi.setStitchContextMenu(null); }}>
            <FolderOpen size={15} />
            <span>打开保存目录</span>
          </button>
        </div>
      )}

      {contextMenu && contextItem && (
        <div
          className="imageContextMenu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => { void copyImage(contextItem); setContextMenu(null); }}>
            <Copy size={15} />
            <span>复制</span>
          </button>
          <button type="button" onClick={() => { rerunResult(contextItem, 1); setContextMenu(null); }}>
            <RotateCcw size={15} />
            <span>重刷</span>
          </button>
          <button type="button" onClick={() => { rerunResult(contextItem, 4); setContextMenu(null); }}>
            <Flame size={15} />
            <span>重刷x4</span>
          </button>
          <button type="button" onClick={() => { void downloadItem(contextItem, contextIndex); setContextMenu(null); }}>
            <Download size={15} />
            <span>下载图片</span>
          </button>
          <button type="button" onClick={() => { void sendResultToImageEditor(contextItem, "base"); setContextMenu(null); }}>
            <Layers size={15} />
            <span>设为编辑底图</span>
          </button>
          <button type="button" onClick={() => { void sendResultToImageEditor(contextItem, "overlay"); setContextMenu(null); }}>
            <Move size={15} />
            <span>设为编辑上层</span>
          </button>
          {SHOW_INFINITE_CANVAS && (
            <button type="button" onClick={() => { sendResultToCanvas(contextItem); setContextMenu(null); }}>
              <Box size={15} />
              <span>发送到无限画布</span>
            </button>
          )}
          <button type="button" onClick={() => { markDeferredFeature("局部编辑"); setContextMenu(null); }}>
            <Crop size={15} />
            <span>局部编辑</span>
          </button>
          <button type="button" onClick={() => { void openSaveDirectory(); setContextMenu(null); }}>
            <FolderOpen size={15} />
            <span>打开所在目录</span>
          </button>
          <button type="button" onClick={() => { markDeferredFeature("转 PSD"); setContextMenu(null); }}>
            <Archive size={15} />
            <span>转 PSD</span>
          </button>
          <hr />
          <button className="contextDanger" type="button" onClick={() => { deleteResult(contextItem.id); setContextMenu(null); }}>
            <Trash2 size={15} />
            <span>删除</span>
          </button>
        </div>
      )}
      </main>
    </ErrorBoundary>
  );
}

const appRootElement = document.getElementById("root");
const appRoot = window.__JINGYIN_REACT_ROOT__ || createRoot(appRootElement);
window.__JINGYIN_REACT_ROOT__ = appRoot;

publicReleaseStorageResetPromise.finally(() => {
  appRoot.render(<App />);
});

// StableTextarea / ElapsedTimer 已抽到 src/shared/ui/
// （见 stable-textarea.jsx / elapsed-timer.jsx），main.jsx 改为 import 复用。
// 这是 main.jsx 巨石拆分的「第一块砖」：两个零闭包依赖的顶层纯组件，先剥离出去探路。

