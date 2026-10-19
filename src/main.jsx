import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Download,
  Flame,
  FolderOpen,
  Layers,
  Move,
  RotateCcw,
  Trash2,
  Upload
} from "lucide-react";
import { DEFAULT_MODELS, imageSourceFromResult } from "./shared/models.js";
import {
  channelForModel,
  channelsForModel,
  convergeSettingsForModel,
  isRoutingCatalogReady,
  modelCapabilities
} from "./shared/routing.js";
import { ErrorBoundary } from "./shared/error-boundary.jsx";
import { QuickCropViewportModal } from "./features/crop/quick-crop-panels.jsx";
import { CachedImage } from "./shared/ui/cached-image.jsx";
import { Button } from "./shared/ui/Button";
import { AppSidebar } from "./shared/ui/AppSidebar";
import { Modal, ModalHeader } from "./shared/ui/Modal.jsx";
import { createReferenceUpload, quickReferenceOriginalFile } from "./features/upload/reference-upload.js";
import { LocalEditModal } from "./features/local-edit/LocalEditModal.jsx";
import {
  beginImageDownloadDrag,
  referenceSource,
} from "./shared/result-image.js";
import { classifyGenerationError, formatGenerationError } from "./shared/generation-errors.js";
import { fileSize } from "./lib/format/index.js";
import { loadPromptLibraryCategories, loadPromptLibraryPresets } from "./shared/prompt-library.js";
import { writeJsonStorage } from "./lib/storage/json-storage.js";
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
// P6-4：画布 / 生成类 handler 钩（saveProcessedImageFile / optimizePrompt / sendResultToImageEditor / addReferenceThumbToUploads / generate）。
import { useCanvasGenerationHandlers } from "./features/canvas/canvas-generation-handlers.js";
// P6-5：App() 体其余全部 handler 钩（updateSetting / addEvent / copyText / 预览三态 / 参考图排序 / 右键菜单 / rerun 等 38 个）。
import { useMainHandlers } from "./features/main-app/main-handlers.js";
// P6-5：App() return 的顶栏 / 快捷画板面板化（纯展示组件，props 同名下发）。
import { MainTopBar } from "./features/main-app/panels/main-top-bar.jsx";
import { MainCanvasBoard } from "./features/main-app/panels/main-canvas-board.jsx";
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
import { ACTIVE_VIEW_KEY, PROMPT_CATEGORIES_KEY, PROMPT_PRESETS_KEY, STORAGE_KEY, defaultState } from "./shared/app-defaults.js";
import { loadActiveView, loadHistoryResults, loadState, navItems, publicReleaseStorageResetPromise, removeHistoryResults, saveHistoryResults } from "./features/storage/storage-store.js";
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




const COUNT_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const REFERENCE_STRENGTH_OPTIONS = Array.from({ length: 8 }, (_, index) => 30 + index * 10);












const referenceControlOptions = [
  { value: "none", label: "不参考" },
  { value: "light", label: "轻参考" },
  { value: "medium", label: "中等参考" },
  { value: "strong", label: "重点参考" }
];




// V118：提示词分类兜底不再用内置常量；改由 loadPromptLibraryCategories 从用户预设派生（见 §1.1）。













// V118（2026-10-19）：分类加载收口到共享 loadPromptLibraryCategories（§1.2），见 loadPromptPresets 说明。
function loadPromptCategories() {
  return loadPromptLibraryCategories({ categoriesKey: PROMPT_CATEGORIES_KEY, presetsKey: PROMPT_PRESETS_KEY });
}















// V118（2026-10-19）：提示词助手改为纯用户自建库。两侧加载口径已收口到
// src/shared/prompt-library.js 的 loadPromptLibraryPresets / loadPromptLibraryCategories
// （执行单 §1.2），此处只做薄封装、传各自的 storage key，行为两侧一致。
function loadPromptPresets() {
  return loadPromptLibraryPresets({ presetsKey: PROMPT_PRESETS_KEY });
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
  const [saveDirectory, setSaveDirectory] = useState("");
  const [directoryDraft, setDirectoryDraft] = useState("");
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  // V61（P3-6，降级档）：快捷生成 image 模式私有状态 + 私有 ref + 派生值收口到 useQuickGenState，
  // 以原名校验返回，下方共享工厂（createResultDownload / createResultActions / createReferenceUpload）
  // 与 JSX 继续按同名引用，行为不变。JSX 抽取待下轮。
  const quickApi = useQuickGenState();
  const {
    files, setFiles,
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
  const previewDragRef = useRef(null);

  // P6-5（V4.0）：App() 体其余全部 handler（38 个）收口到 useMainHandlers（src/features/main-app/）。
  // useMainHandlers 必须先于其下游消费方执行：它解构产出 addEvent / updateSetting /
  //   closePreview 等；useSettingsState（已移至本钩之后）与 usePreviewDrag /
  //   usePromptAssistantState / useSaveDirectory 都依赖这些产出，调用点必须在其后。
  // TDZ：钩内 10 项晚期产出引用统一走 handlerLateRef.current，回填点在 syncHistoryFromServerRef 回填处
  //   （渲染期，此时各产出均已初始化；handler 只在事件回调 / effect 内被调用，均在渲染之后，无前向引用）。
  const handlerLateRef = useRef({});
  const {
    updateSetting,
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
    clampCount,
    QUICK_LOCAL_EDIT_RATIOS,
    referencePointerSortRef,
    suppressReferencePreviewRef,
    previewDragRef,
    quickGalleryRef,
    lateRef: handlerLateRef
  });
  // V56（P3-1）：设置弹窗私有状态与副作用统一收口到 useSettingsState，App() 只持有共享状态。BUG02 修复：须置于 useMainHandlers 之后（消费其产出的 addEvent），前置触发 const TDZ 首屏白屏。
  const settingsApi = useSettingsState({ settings, setSettings, config, addEvent, isSettingsOpen });
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
    clearReferenceRewriteFiles,
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
  //   兄弟函数 rerunResult 对 generate 的引用在事件回调体内、渲染期之后求值，无前向引用；
  //   JSX 引用全部位于下方 return 内。
  const {
    saveProcessedImageFile,
    optimizePrompt,
    sendResultToImageEditor,
    addReferenceThumbToUploads,
    generate
  } = useCanvasGenerationHandlers({
    config,
    settings,
    models,
    files,
    saveDirectory,
    isQuickPromptOptimizing,
    setError,
    setStatus,
    setResults,
    setTiming,
    setQuickTasks,
    setActiveView,
    setIsSettingsOpen,
    setSaveDirectory,
    setDirectoryDraft,
    setReferenceContextMenu,
    setImageEditorSeed,
    setIsQuickPromptOptimizing,
    addEvent,
    autoSaveEventText,
    updateSetting,
    refreshSaveDirectory,
    appendReferenceFiles,
    blobFromImageItem,
    autoSaveGeneratedItems,
    makeResultId,
    clampCount,
    normalizeGenerationErrorMessage,
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
    removeReferenceRewriteFile,
    clearReferenceRewriteFiles
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
    return quickGalleryItems
      .filter((item) => item.kind === "result")
      .map((item) => item.result)
      .filter(Boolean);
  }, [previewResult, detailApi.activeDetailResults, referenceApi.referenceGalleryItems, quickGalleryItems]);



  // V60：详情私有状态已移入 useDetailState，此处经 detailApi 回传（见 detail/README.md 偏差③）。
  const resultActionsDeps = { setSelectedIds, selectedIds, activeView, quickResults, setResults, setBrokenResultImages, detailInfoSelection: detailApi.detailInfoSelection, setDetailInfoSelection: detailApi.setDetailInfoSelection, setDetailGroups: detailApi.setDetailGroups, removeHistoryResults, loadHistoryResults, hydrateDetailGroupsWithHistory, addEvent };
  const { toggleSelected, deleteSelected, deleteResult, markResultImageBroken, refreshHistory, syncHistoryFromServer } = createResultActions(resultActionsDeps);
  // 回填晚绑定 ref：详情生成完成后（2.4s 延时）用它回载历史。
  syncHistoryFromServerRef.current = syncHistoryFromServer;

  // P6-5：useMainHandlers 晚绑定 ref 回填（渲染期执行；此时 videoApi /
  //   appendReferenceFiles(createReferenceUpload) /
  //   referenceApi / refreshSaveDirectory(useSaveDirectory) / previewNavigationItems(useMemo) /
  //   moveReferenceFile(createReferenceUpload) /
  //   detailApi / generate(P6-4 钩) 均已初始化；handler 只在事件回调 / effect 内调用，无 TDZ）。
  handlerLateRef.current = {
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

        <AppSidebar
          navItems={navItems}
          activeView={activeView}
          onSelectView={setActiveView}
          onOpenPrompts={() => setIsPromptAssistantOpen(true)}
          onOpenSettings={() => openSettingsPanel()}
        />
      </aside>

      <section className={`quickgenArea ${["outfit", "resize"].includes(activeView) ? "embeddedWorkflowArea" : ""}`}>
        {!["outfit", "resize"].includes(activeView) && (
          <MainTopBar
            activeView={activeView}
            quickMode={quickMode}
            setQuickMode={setQuickMode}
            resultFilter={resultFilter}
            setResultFilter={setResultFilter}
            imageCount={imageCount}
            videoApi={videoApi}
            refreshHistory={refreshHistory}
            openDirectoryModal={openDirectoryModal}
            detailApi={detailApi}
            openSaveDirectory={openSaveDirectory}
            latestVideoStatusText={latestVideoStatusText}
            quickStatus={quickStatus}
            latestStatusText={latestStatusText}
            downloadSelected={downloadSelected}
            quickSelectedCount={quickSelectedCount}
            downloadAll={downloadAll}
            quickResults={quickResults}
            deleteSelected={deleteSelected}
            clearAll={clearAll}
            changeGalleryZoom={changeGalleryZoom}
            galleryZoom={galleryZoom}
            galleryZoomPercent={galleryZoomPercent}
            referenceApi={referenceApi}
            downloadVideoResult={downloadVideoResult}
          />
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
          <MainCanvasBoard
            quickGalleryRef={quickGalleryRef}
            galleryCardMin={galleryCardMin}
            quickGalleryItems={quickGalleryItems}
            brokenResultImages={brokenResultImages}
            selectedIds={selectedIds}
            quickResultReplaceTargetId={quickResultReplaceTargetId}
            setQuickResultReplaceTargetId={setQuickResultReplaceTargetId}
            openPreview={openPreview}
            openContextMenu={openContextMenu}
            handleQuickResultReplaceDragOver={handleQuickResultReplaceDragOver}
            handleQuickResultReplaceDrop={handleQuickResultReplaceDrop}
            toggleSelected={toggleSelected}
            downloadFeedbackIds={downloadFeedbackIds}
            downloadItem={downloadItem}
            rerunResult={rerunResult}
            deleteResult={deleteResult}
            beginResultImageDrag={beginResultImageDrag}
            clearQuickResultDragState={clearQuickResultDragState}
            markResultImageBroken={markResultImageBroken}
            openReferencePreview={openReferencePreview}
            openReferenceContextMenu={openReferenceContextMenu}
            beginReferenceImageDrag={beginReferenceImageDrag}
            copyText={copyText}
            quickResults={quickResults}
            runningQuickTasks={runningQuickTasks}
            status={status}
            error={error}
            isComposerDragging={isComposerDragging}
            onComposerDragOver={onComposerDragOver}
            onComposerDragLeave={onComposerDragLeave}
            onComposerDrop={onComposerDrop}
            onComposerPaste={onComposerPaste}
            previewFiles={previewFiles}
            referenceDropTarget={referenceDropTarget}
            beginReferenceDrop={beginReferenceDrop}
            endReferenceDrop={endReferenceDrop}
            onReferenceDrop={onReferenceDrop}
            draggingReferenceId={draggingReferenceId}
            referenceSortTarget={referenceSortTarget}
            beginReferenceSort={beginReferenceSort}
            moveReferenceSort={moveReferenceSort}
            endReferenceSort={endReferenceSort}
            cancelReferenceSort={cancelReferenceSort}
            openUploadPreview={openUploadPreview}
            removeReferenceImage={removeReferenceImage}
            openQuickCropEdit={openQuickCropEdit}
            openQuickLocalEdit={openQuickLocalEdit}
            settings={settings}
            updateSetting={updateSetting}
            isQuickChannelMenuOpen={isQuickChannelMenuOpen}
            setIsQuickChannelMenuOpen={setIsQuickChannelMenuOpen}
            quickChannel={quickChannel}
            quickChannels={quickChannels}
            activeModel={activeModel}
            inputRef={inputRef}
            onPickFiles={onPickFiles}
            models={models}
            ratios={ratios}
            quickSizes={quickSizes}
            quickMaxReferenceFiles={quickMaxReferenceFiles}
            optimizePrompt={optimizePrompt}
            isQuickPromptOptimizing={isQuickPromptOptimizing}
            generate={generate}
            countOptions={COUNT_OPTIONS}
            events={events}
            onQuickBoardWheel={onQuickBoardWheel}
            setFiles={setFiles}
            setQuickCropEditTarget={setQuickCropEditTarget}
            setQuickLocalEditTarget={setQuickLocalEditTarget}
            setIsPromptAssistantOpen={setIsPromptAssistantOpen}
          />
        )}
      </section>

      {isDirectoryModalOpen && (
        <Modal layerClassName="modalLayer" panelClassName="saveDirectoryModal" onClose={() => setIsDirectoryModalOpen(false)}>
            <ModalHeader
              title="指定文件夹"
              subtitle="生成图片将保存到这个目录"
              onClose={() => setIsDirectoryModalOpen(false)}
              closeLabel="关闭"
            />
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
                <Button size="sm" onClick={() => setIsDirectoryModalOpen(false)}>取消</Button>
                <Button size="md" tone="primary" onClick={() => void confirmSaveDirectory()}>确定</Button>
              </div>
            </footer>
          </Modal>
      )}

      {detailApi.isDetailPresetOpen && (
        <Modal layerClassName="modalLayer" panelClassName="detailPresetModal" onClose={() => detailApi.setIsDetailPresetOpen(false)}>
            <ModalHeader
              title="加载详情预设"
              subtitle="恢复一键详情/主图的参数与文案"
              onClose={() => detailApi.setIsDetailPresetOpen(false)}
              closeLabel="关闭"
            />
            <div className="detailPresetList">
              {detailApi.detailPresets.map((preset) => (
                <article className="detailPresetItem" key={preset.id}>
                  <button type="button" onClick={() => detailApi.loadDetailPreset(preset)}>
                    <strong>{preset.name}</strong>
                    <span>{new Date(preset.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                  </button>
                  <Button size="sm" iconOnly title="删除预设" onClick={() => detailApi.deleteDetailPreset(preset.id)}>
                    <Trash2 size={15} />
                  </Button>
                </article>
              ))}
              {detailApi.detailPresets.length === 0 && <p className="promptEmpty">还没有保存过详情预设</p>}
            </div>
          </Modal>
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
        <Modal layerClassName="modalLayer stitchLayer" panelClassName="stitchPreviewModal" onClose={detailApi.closeStitchPreview}>
            <ModalHeader
              title="拼图预览"
              subtitle={`${detailApi.stitchGroup.label} · 共 ${detailApi.stitchItems.length} 屏`}
              onClose={detailApi.closeStitchPreview}
              closeLabel="关闭"
              action={<Button size="md" tone="primary" onClick={() => void detailApi.downloadStitchPreview(detailApi.stitchGroup)}>
                <Download size={15} />
                <span>下载长图</span>
              </Button>}
            />
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
                )                )}
              </div>
            </div>
          </Modal>
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
        <Modal layerClassName="modalLayer previewLayer" panelClassName="previewModal referencePreviewModal" onClose={closeReferencePreview}>
            <ModalHeader
              title="使用图预览"
              subtitle={<>
                {referencePreview.items[referencePreview.index]?.name || `参考图 ${referencePreview.index + 1}`} · {referencePreview.index + 1}/{referencePreview.items.length}
              </>}
              onClose={closeReferencePreview}
              closeLabel="关闭"
            />
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
          </Modal>
      )}

      {uploadPreview && (
        <Modal layerClassName="modalLayer previewLayer" panelClassName="previewModal" onClose={closeUploadPreview}>
            <ModalHeader
              title="上传图片预览"
              subtitle={`${uploadPreview.name} · ${fileSize(uploadPreview.size)}`}
              onClose={closeUploadPreview}
              closeLabel="关闭"
            />
            <div className="previewImageFrame uploadPreviewFrame" onMouseDown={closeUploadPreview} title="单击关闭">
              <img
                src={uploadPreview.url}
                alt={uploadPreview.name}
                draggable
                onDragStart={(event) => beginImageDownloadDrag(event, uploadPreview.url, uploadPreview.name || "上传图片")}
              />
            </div>
          </Modal>
      )}

      {previewResult && (
        <Modal layerClassName="modalLayer previewLayer" panelClassName="previewModal" onClose={closePreview}>
            <ModalHeader
              title="图片预览"
              subtitle={`${previewResult.modelLabel} · ${previewResult.imageSize} · ${previewResult.aspectRatio}`}
              onClose={closePreview}
              closeLabel="关闭"
            />
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
          </Modal>
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

