import React, { useEffect, useMemo, useRef, useState } from "react";
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
  Eye,
  EyeOff,
  FileText,
  Flame,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  ImageOff,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  Maximize2,
  Minus,
  Move,
  Palette,
  Pencil,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Scissors,
  Search,
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
  clampPromptForModel,
  convergeSettingsForModel,
  isBanana2Model,
  isRoutingCatalogReady,
  modelCapabilities,
  routingFields
} from "./shared/routing.js";
import {
  classifyQuickPrimaryLocalIntent,
  promptForQuickGeneration
} from "./shared/quickgen-prompt-rules.js";
import DebouncedTextarea from "./shared/DebouncedTextarea.jsx";
import { ErrorBoundary } from "./shared/error-boundary.jsx";
import { DetailUploadZone, QuickCropViewportModal } from "./features/crop/quick-crop-panels.jsx";
import ChannelPicker from "./shared/ui/ChannelPicker.jsx";
import { CachedImage } from "./shared/ui/cached-image.jsx";
import { ReferenceThumbTray } from "./shared/ui/reference-thumb-tray.jsx";
import { createDetailGroup } from "./features/detail/detail-group.js";
import { MAX_REFERENCE_REWRITE_FILES, buildReferenceRemixPrompt, buildSmartReferencePrompt, createReferenceUpload, makeQuickReferenceItem, prepareImageFilesForChannel, quickReferenceHasLocalEdit, quickReferenceOriginalFile, quickReferenceRunUploadFile, quickReferenceUploadFile, quickReferenceUploadFiles, referenceMetaFromFiles, referenceMetaFromQuickRunItems, renderReferencePolicy } from "./features/upload/reference-upload.js";
import { LocalEditModal } from "./features/local-edit/LocalEditModal.jsx";
import {
  imageFileFromUrl,
  beginImageDownloadDrag,
  dataUrlFromBlob,
  dragDownloadDateStamp,
  previewDragStart,
  previewPanFromDrag,
  referenceSource,
  resultImageCardState
} from "./shared/result-image.js";
import { classifyGenerationError, formatGenerationError } from "./shared/generation-errors.js";
import { fileSize, formatMs } from "./lib/format/index.js";
import { fileBaseName } from "./shared/file-name.js";
import { videoResultUrl } from "./shared/video-task.js";
import { normalizePromptCategories, normalizePromptPreset, promptFallbackCategory, usePromptLibrary } from "./shared/prompt-library.js";
import {
  imageBitmapFromFile,
  imageExtension,
  imageFilesFromClipboard,
  imageFilesFromList, addFilesByRole, removeFilesByRole
} from "./shared/image-input.js";
import { readJsonStorage, writeJsonStorage } from "./lib/storage/json-storage.js";
import OutfitWorkflow from "./outfit-workflow.jsx";
import ImageEditorPanel from "./image-editor.jsx";
import { getAppConfig } from "./api/config.js";
import { formatConnectionResult, testConnection } from "./api/connection.js";
import {
  getSaveDirectory,
  openSaveDirectoryRequest,
  pickSaveDirectory as pickSaveDirectoryRequest,
  setSaveDirectory as setSaveDirectoryRequest
} from "./api/save.js";
import {
  cleanStorageTargets,
  getStorageUsage,
  revealStorageDir
} from "./api/storage.js";
import { generateImages } from "./api/images.js";
import {
  createDetailPrompts,
  rewriteQuickPrompt,
  rewriteReferencePrompt
} from "./api/prompts.js";
import { generateVideo } from "./api/videos.js";
import { uploadCanvasAssets } from "./api/assets.js";
import {
  isAuthErrorMessage,
  normalizeApiKeyInput,
  testApiConnection
} from "./features/auth/api-key.js";
import {
  LOCAL_EDIT_MASK_MODE,
  LOCAL_EDIT_BRUSH_DEFAULT,
  LOCAL_EDIT_MASK_OPACITY_DEFAULT,
  LOCAL_EDIT_RECT_MODE,
} from "./shared/local-edit-mask.js";
import "./styles.css";
import { copyTextToClipboard } from "./shared/dom-actions.js";
import { loadSaveDirectory, openSaveDirectoryModal, commitSaveDirectory, chooseSaveDirectory } from "./features/savedir/save-directory.js";
import { incomingCanvasNodes, canvasResultItemsFromNode, canvasPromptForGenerator, canvasImagesForGenerator, canvasImageEntriesForGenerator, splitCanvasBatchEntries, buildCanvasBatchPrompt, screenPointToCanvas, canvasCenterFromRect } from "./features/canvas/canvas-graph.js";
import { createCanvasActions, createCanvasInteractions } from "./features/canvas/canvas-actions.js";
import { createQuickResultReplace, createResultDownload, createResultActions } from "./features/result-queue/quick-result-replace.js";
import { createVideoComposer, durationOptionsForVideoModel, normalizeVideoSettingValue, videoPriceLabel, videoPromptPlaceholder } from "./features/video/video-composer.js";
import { ACTIVE_VIEW_KEY, DETAIL_GROUPS_KEY, DETAIL_PRESETS_KEY, INFINITE_CANVAS_KEY, PROMPT_CATEGORIES_KEY, PROMPT_PRESETS_KEY, STORAGE_KEY, builtinPrompts, defaultState, detailDefaults, referenceDefaults, videoDefaults } from "./shared/app-defaults.js";
import { SHOW_INFINITE_CANVAS, formatStorageSize, loadActiveView, loadHistoryResults, loadState, navItems, publicReleaseStorageResetPromise, removeHistoryResults, saveHistoryResults } from "./features/storage/storage-store.js";
import { clampDetailCount, clampDetailModelUsage, clampReferenceStrength, clampReverseScreens, hydrateDetailGroupsWithHistory, loadDetailGroups, loadDetailPresets, normalizeDetailSettings, sanitizeDetailGroupsForStorage } from "./features/detail/detail-group.js";
import { composeQuickLocalEditBlob, defaultQuickLocalEditCrop } from "./features/local-edit/crop-rect-resize.js";














const PROMPT_CATEGORY_DRAG_TYPE = "application/x-jingyin-prompt-category";
const QUICK_RESULT_DRAG_TYPE = "application/x-jingyin-quick-result";











const CLIENT_SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_MAX_REFERENCE_FILES = 5;
const MAX_DETAIL_FILES = 6;
// 局部回贴可选比例。2026-09-25：补上 2:3 —— 局部回贴选框必须能锁定到用户选的比例，
// 而 2:3 是竖版服装图最常用的比例之一，之前不在列表里会被回落到 1:1。
const QUICK_LOCAL_EDIT_RATIOS = ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"];
const DETAIL_ANALYSIS_MODEL = "gpt-5.4-mini";



const LOCAL_EDIT_CROP_UPLOAD_TARGET_BYTES = 16 * 1024 * 1024;


const CANVAS_NODE_WIDTH = 236;
const CANVAS_NODE_HEIGHT = 260;
const CANVAS_GENERATOR_WIDTH = 286;
const CANVAS_GENERATOR_HEIGHT = 360;
const COUNT_OPTIONS = Array.from({ length: 12 }, (_, index) => index + 1);
const REFERENCE_STRENGTH_OPTIONS = Array.from({ length: 8 }, (_, index) => 30 + index * 10);

const VIDEO_STATUS_POLL_INTERVAL_MS = 4000;
const VIDEO_STATUS_MAX_POLLS = 180;
const VIDEO_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;











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



const workflowOptions = [
  { value: "taobao-main", label: "淘宝 / 主图" },
  { value: "taobao-detail", label: "淘宝 / 详情页" },
  { value: "tmall-detail", label: "天猫 / 详情页" },
  { value: "jd-detail", label: "京东 / 详情页" },
  { value: "douyin-detail", label: "抖音 / 详情页" },
  { value: "redbook-detail", label: "小红书 / 种草图文" },
  { value: "pdd-detail", label: "拼多多 / 详情页" },
  { value: "amazon-main", label: "亚马逊 / 主图" },
  { value: "amazon-detail", label: "亚马逊 / 详情页" },
  { value: "shein-detail", label: "SHEIN / 详情页" },
  { value: "temu-detail", label: "Temu / 详情页" }
];

const copywritingOptions = [
  { value: "need", label: "需要文案" },
  { value: "blank", label: "文案留白" },
  { value: "poster", label: "无文案纯海报" }
];

const richnessOptions = [
  { value: "simple", label: "精简" },
  { value: "balanced", label: "均衡" },
  { value: "rich", label: "丰富" }
];

const fontStyleOptions = [
  { value: "soft", label: "柔和女性" },
  { value: "heiti", label: "常用黑体" },
  { value: "modern", label: "现代杂志" },
  { value: "bold", label: "醒目电商" },
  { value: "auto", label: "自动判断" }
];

const modelModeOptions = [
  { value: "no-model", label: "无模特" },
  { value: "use-model", label: "使用模特" }
];

const modelPoseOptions = [
  { value: "regular", label: "常规姿态" },
  { value: "special", label: "特殊姿态" }
];

const themeOptions = [
  { value: "dark", label: "暗夜", colors: ["#080910", "#151522", "#10cfc4"] },
  { value: "jade", label: "柔粉", colors: ["#fff2f7", "#fffafd", "#ec6f9e"] },
  { value: "graphite", label: "米杏", colors: ["#f3e6d4", "#fff8ec", "#c98652"] },
  { value: "mist", label: "浅雾", colors: ["#f5f7fa", "#ffffff", "#0d7a76"] }
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











function normalizeQuickReferenceItem(item) {
  if (!item) return null;
  if (item instanceof File) return makeQuickReferenceItem(item);
  const file = item.file || item.originalFile;
  if (!(file instanceof File)) return null;
  return {
    ...item,
    id: item.id || `quick_ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file,
    originalFile: item.originalFile || file,
    cropEdit: item.cropEdit || null,
    localEdit: item.localEdit || null
  };
}
















// 2026-09-25 对齐 3.0：删除了"把上传图补白到模型比例"的逻辑。
// 3.0 的裁剪输出就是选框本身，没有任何 letterbox；用户看到的白边正是这里产生的
// （横图按 3:4 上传时上下各补一条白边）。
// 现在上传用的就是裁剪/选框原图，比例交给服务的模型能力校验去处理。
async function ensureQuickUploadCanvasRatio(file) {
  return file;
}

/**
 * 把参考图压成"送 JSON 通道用"的紧凑 data URL。
 *
 * 3.0 对带参考图的请求改走 /v1/images/generations + JSON `image_urls`
 * （main.py:13428-13454），参考图用 `encode_reference_data_url(ref, max_size=1536)`
 * 压到 1536 长边再转 data URL。这里对齐同样的上限与质量：
 *   - 长边不超过 1536
 *   - JPEG q0.85（单张约 200~500KB，base64 后仍在服务端 8MB fieldSize 内）
 * 只在香蕉 Pro（nano-banana-pro）路径上使用，其它模型不受影响。
 */
async function fileToCompactJpegDataUrl(file, maxEdge = 1536, quality = 0.85) {
  if (!(file instanceof Blob)) return "";
  const bitmap = await imageBitmapFromFile(file);
  try {
    const width = bitmap.width || bitmap.naturalWidth || 0;
    const height = bitmap.height || bitmap.naturalHeight || 0;
    if (!width || !height) return "";
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return "";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", quality);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    bitmap.close?.();
  }
}

// 需要走 JSON + image_urls 参考图通道的模型（对齐 3.0 的带图路径）。
const JSON_IMAGE_URLS_MODELS = new Set(["nano-banana-pro"]);








function shouldNormalizeQuickUploadForModel(model) {
  return isBanana2Model(model);
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
  const [detailSettings, setDetailSettings] = useState(detailDefaults);
  const [detailPresets, setDetailPresets] = useState(loadDetailPresets);
  const [detailProductFiles, setDetailProductFiles] = useState([]);
  const [detailReferenceFiles, setDetailReferenceFiles] = useState([]);
  const [detailGroups, setDetailGroups] = useState(loadDetailGroups);
  const [detailStatus, setDetailStatus] = useState("idle");
  const [activeDetailGroupId, setActiveDetailGroupId] = useState("");
  const [detailInfoSelection, setDetailInfoSelection] = useState(null);
  const [detailColumns, setDetailColumns] = useState(5);
  const [detailForwardSort, setDetailForwardSort] = useState(true);
  const [detailDragScreen, setDetailDragScreen] = useState(null);
  const [stitchPreview, setStitchPreview] = useState(null);
  const [stitchZoom, setStitchZoom] = useState(1);
  const [stitchPan, setStitchPan] = useState({ x: 0, y: 0 });
  const [referenceSettings, setReferenceSettings] = useState(referenceDefaults);
  const [referenceProductFiles, setReferenceProductFiles] = useState([]);
  const [referenceStyleFiles, setReferenceStyleFiles] = useState([]);
  const [referenceTasks, setReferenceTasks] = useState([]);
  const [referenceStatus, setReferenceStatus] = useState("idle");
  const [referenceError, setReferenceError] = useState("");
  const [isReferencePromptRewriting, setIsReferencePromptRewriting] = useState(false);
  const [infiniteCanvasState, setInfiniteCanvasState] = useState(loadInfiniteCanvasState);
  const [canvasViewport, setCanvasViewport] = useState({ x: 34, y: 18, scale: 1 });
  const [canvasTasks, setCanvasTasks] = useState([]);
  const [canvasConnectStart, setCanvasConnectStart] = useState(null);
  const [canvasDrag, setCanvasDrag] = useState(null);
  const [canvasSelectedNodeId, setCanvasSelectedNodeId] = useState("");
  const [saveDirectory, setSaveDirectory] = useState("");
  const [directoryDraft, setDirectoryDraft] = useState("");
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  // P1 缺图自愈：记录"图片确实加载失败"的结果 id → 原因文案。
  // 只存在内存里，不回写持久化数据（服务端另有"归档文件丢失"的持久标记）。
  const [brokenResultImages, setBrokenResultImages] = useState(() => ({}));
  const [resultFilter, setResultFilter] = useState("all");
  const [quickMode, setQuickMode] = useState("image");
  const [videoSettings, setVideoSettings] = useState(videoDefaults);
  const [videoReferenceFile, setVideoReferenceFile] = useState(null);
  const [videoResults, setVideoResults] = useState([]);
  const [videoTasks, setVideoTasks] = useState([]);
  const [videoStatus, setVideoStatus] = useState("idle");
  const [videoError, setVideoError] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [status, setStatus] = useState("idle");
  const [quickTasks, setQuickTasks] = useState([]);
  const [galleryZoom, setGalleryZoom] = useState(1);
  const [downloadFeedbackIds, setDownloadFeedbackIds] = useState(() => new Set());
  const [error, setError] = useState("");
  const [isQuickPromptOptimizing, setIsQuickPromptOptimizing] = useState(false);
  const [, setTiming] = useState(null);
  const [events, setEvents] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 2026-09-29（v3.7）：数据与存储（用量 / 打开目录 / 清理）。
  // 封装版的数据目录不在安装包内，用户看不到路径也删不掉历史图片，
  // 于是"清空全部"后文件仍在、重启就被扫描重建。这里给出自助入口。
  const [storageUsage, setStorageUsage] = useState(null);
  const [storageBusy, setStorageBusy] = useState("");
  const [storageStatus, setStorageStatus] = useState("");

  const refreshStorageUsage = async () => {
    try {
      const data = await getStorageUsage();
      if (data?.ok) setStorageUsage(data);
    } catch (error) {
      setStorageStatus(`读取存储用量失败：${error?.message || error}`);
    }
  };

  useEffect(() => {
    if (!isSettingsOpen) return;
    setStorageStatus("");
    void refreshStorageUsage();
  }, [isSettingsOpen]);

  const handleRevealStorage = async (target) => {
    try {
      const data = await revealStorageDir(target);
      setStorageStatus(data?.ok ? `已打开：${data.path}` : `打开失败：${data?.error || "未知错误"}`);
    } catch (error) {
      setStorageStatus(`打开失败：${error?.message || error}`);
    }
  };

  const handleCleanStorage = async (targets, label) => {
    const confirmed = window.confirm(`确定清理${label}吗？\n\n这会直接删除磁盘上的文件，无法撤销。`);
    if (!confirmed) return;
    setStorageBusy(targets.join(","));
    setStorageStatus(`正在清理${label}…`);
    try {
      const data = await cleanStorageTargets(targets);
      if (data?.ok) {
        setStorageUsage(data);
        const removed = (data.report || []).reduce((sum, item) => sum + (item.removedFiles || 0), 0);
        const freed = (data.report || []).reduce((sum, item) => sum + (item.freedBytes || 0), 0);
        setStorageStatus(`${label}完成：删除 ${removed} 个文件，释放 ${formatStorageSize(freed)}`);
      } else {
        setStorageStatus(`清理失败：${data?.error || "未知错误"}`);
      }
    } catch (error) {
      setStorageStatus(`清理失败：${error?.message || error}`);
    } finally {
      setStorageBusy("");
    }
  };
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [apiSaveStatus, setApiSaveStatus] = useState("");
  // 2026-09-25：设置里原有的「开发诊断」区域（含传参自检按钮）已整体替换为「连接测试」。
  const [isConnectionTesting, setIsConnectionTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");
  const [connectionState, setConnectionState] = useState("idle");
  const [isDirectoryModalOpen, setIsDirectoryModalOpen] = useState(false);
  const [isDetailPresetOpen, setIsDetailPresetOpen] = useState(false);
  const [isPromptAssistantOpen, setIsPromptAssistantOpen] = useState(false);
  const [isQuickChannelMenuOpen, setIsQuickChannelMenuOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [promptCategory, setPromptCategory] = useState("全部");
  const [promptSearch, setPromptSearch] = useState("");
  const [referenceDropTarget, setReferenceDropTarget] = useState(null);
  // 2026-10-06：快捷生成的参考图「左右调顺序」（批量侧早就有，快捷侧补齐）。
  // 走 pointer 事件而不是 HTML5 drag —— 后者会和已有的「外部图片拖进来=替换」抢 dragover。
  const [referenceSortTarget, setReferenceSortTarget] = useState(null);
  const [draggingReferenceId, setDraggingReferenceId] = useState("");
  const [quickResultReplaceTargetId, setQuickResultReplaceTargetId] = useState("");
  const [quickCropEditTarget, setQuickCropEditTarget] = useState(null);
  const [quickLocalEditTarget, setQuickLocalEditTarget] = useState(null);
  const [draggedPromptId, setDraggedPromptId] = useState(null);
  const [promptDropCategory, setPromptDropCategory] = useState("");
  const [draggedPromptCategory, setDraggedPromptCategory] = useState("");
  const [promptCategoryDropTarget, setPromptCategoryDropTarget] = useState(null);
  const [isComposerDragging, setIsComposerDragging] = useState(false);
  // V46.1: 移除非必要全局 tick（任务计时下沉到 <ElapsedTimer>）
  const [previewResult, setPreviewResult] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [referencePreview, setReferencePreview] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  const [referenceContextMenu, setReferenceContextMenu] = useState(null);
  const [stitchContextMenu, setStitchContextMenu] = useState(null);
  const [imageEditorSeed, setImageEditorSeed] = useState(null);
  const inputRef = useRef(null);
  const referencePointerSortRef = useRef(null);
  // 排序松手后会紧接着触发一次 click ⇒ 会误开预览。沿用批量侧的 150ms 抑制窗口。
  const suppressReferencePreviewRef = useRef(false);
  const videoReferenceInputRef = useRef(null);
  const detailProductInputRef = useRef(null);
  const detailReferenceInputRef = useRef(null);
  const referenceProductInputRef = useRef(null);
  const referenceStyleInputRef = useRef(null);
  const canvasStageRef = useRef(null);
  const canvasFileInputRef = useRef(null);
  const previewDragRef = useRef(null);
  const stitchDragRef = useRef(null);
  const quickResultDragIdRef = useRef("");
  const downloadFeedbackTimersRef = useRef(new Map());

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
  const videoModels = Array.isArray(config.videoModels) && config.videoModels.length ? config.videoModels : [];
  const activeVideoModel = videoModels.find((item) => item.value === videoSettings.model) || videoModels[0] || null;
  const videoRatios = activeVideoModel?.aspectRatios?.length ? activeVideoModel.aspectRatios : ["9:16", "16:9", "1:1"];
  const videoResolutions = activeVideoModel?.resolutions?.length ? activeVideoModel.resolutions : ["720p"];
  const videoDurations = activeVideoModel ? durationOptionsForVideoModel(activeVideoModel) : [5];
  const videoPromptHint = activeVideoModel ? videoPromptPlaceholder(activeVideoModel) : "输入视频画面、运动、镜头、服装和氛围要求";
  const videoPriceText = activeVideoModel ? videoPriceLabel(activeVideoModel, videoSettings.resolution) : "";
  const videoChannelEnabled = Boolean(config.videoPolicy?.enabled);
  const billingGatewayEnabled = Boolean(config.billingGatewayPolicy?.enabled);
  const videoBillingRequired = Boolean(config.billingGatewayPolicy?.videoRequired);
  const detailModel = models.find((item) => item.value === detailSettings.model) || models[0];
  const detailRatios = detailModel.ratios || ["1:1", "3:4", "16:9"];
  const referenceModel = models.find((item) => item.value === referenceSettings.model) || models[0];
  const referenceRatios = referenceModel.ratios || ["1:1", "3:4", "16:9"];
  // 分辨率下拉同样吃 capabilities，不再用写死的 1K/2K/4K。
  const detailSizes = modelCapabilities(detailSettings.model, config.routing || config).sizes;
  const referenceSizes = modelCapabilities(referenceSettings.model, config.routing || config).sizes;
  const detailRunningCount = detailGroups.reduce((count, group) => (
    count + group.prompts.reduce((screenCount, prompt) => screenCount + (prompt.status === "running" ? 1 : 0), 0)
  ), 0);
  const detailStatusText = detailStatus === "planning"
    ? "正在生成分段提示词"
    : detailRunningCount > 0
      ? `详情图生成中 ${detailRunningCount} 个任务`
      : detailStatus === "failed"
        ? "详情任务失败"
        : detailGroups.length > 0
          ? "提示词已生成"
          : "等待输入产品信息";
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
  const previewFiles = useMemo(
    () => files
      .map(normalizeQuickReferenceItem)
      .filter(Boolean)
      .map((item) => {
        const originalFile = quickReferenceOriginalFile(item);
        const uploadFile = quickReferenceUploadFile(item);
        const displayFile = uploadFile || originalFile;
        return {
          ...item,
          file: originalFile,
          uploadFile,
          originalFile,
          url: URL.createObjectURL(displayFile || originalFile),
          uploadName: uploadFile?.name || originalFile?.name || "",
          uploadSize: uploadFile?.size || originalFile?.size || 0
        };
      }),
    [files]
  );
  const detailProductPreviews = useMemo(
    () => detailProductFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [detailProductFiles]
  );
  const detailReferencePreviews = useMemo(
    () => detailReferenceFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [detailReferenceFiles]
  );
  const referenceProductPreviews = useMemo(
    () => referenceProductFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [referenceProductFiles]
  );
  const referenceStylePreviews = useMemo(
    () => referenceStyleFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [referenceStyleFiles]
  );
  const canvases = infiniteCanvasState.canvases;
  const activeCanvasId = infiniteCanvasState.activeId;
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) || canvases[0] || null;
  const canvasRunningCount = canvasTasks.filter((task) => task.status === "running").length;
  const canvasStatusText = canvasRunningCount > 0
    ? `运行中 ${canvasRunningCount} 个任务`
    : activeCanvas
      ? `${activeCanvas.nodes.length} 个节点`
      : "等待新建画布";
  const activeDetailGroup = detailGroups.find((group) => group.id === activeDetailGroupId) || detailGroups[0] || null;
  const visibleDetailPrompts = activeDetailGroup
    ? (detailForwardSort ? activeDetailGroup.prompts : [...activeDetailGroup.prompts].reverse())
    : [];
  const activeDetailResults = activeDetailGroup
    ? visibleDetailPrompts.flatMap((prompt) => (prompt.results || []).map((result) => ({ group: activeDetailGroup, prompt, result })))
    : [];
  const detailInfoItem = detailInfoSelection
    ? activeDetailResults.find((item) => item.result.id === detailInfoSelection.resultId) || null
    : null;
  const stitchGroup = stitchPreview
    ? detailGroups.find((group) => group.id === stitchPreview.groupId) || null
    : null;
  const stitchContextGroup = stitchContextMenu
    ? detailGroups.find((group) => group.id === stitchContextMenu.groupId) || null
    : null;
  const stitchPrompts = stitchGroup
    ? (detailForwardSort ? stitchGroup.prompts : [...stitchGroup.prompts].reverse())
    : [];
  const stitchItems = stitchPrompts.flatMap((prompt) => (prompt.results || []).map((result) => ({ prompt, result })));
  const quickResults = useMemo(() => results.filter((item) => !item.source || item.source === "quickgen"), [results]);
  const referenceResults = useMemo(() => results.filter((item) => item.source === "reference-remix"), [results]);
  const videoReferencePreview = useMemo(() => (
    videoReferenceFile ? { file: videoReferenceFile, url: URL.createObjectURL(videoReferenceFile) } : null
  ), [videoReferenceFile]);
  const quickGalleryRef = useRef(null);
  const runningQuickTasks = quickTasks.filter((task) => task.status === "running");
  const runningVideoTasks = videoTasks.filter((task) => task.status === "running");
  const runningReferenceTasks = referenceTasks.filter((task) => task.status === "running");
  const imageCount = quickResults.length;
  const videoCount = videoResults.length;
  const visibleResults = resultFilter === "image" ? quickResults : quickResults;
  const quickGalleryItems = useMemo(() => {
    const resultItems = visibleResults.map((item, index) => ({
        kind: "result",
        key: `result-${item.id}`,
        result: item,
        orderAt: Number.isFinite(item.submittedAt) ? item.submittedAt : (Number.isFinite(item.createdAt) ? item.createdAt : 0),
        fallbackIndex: index
      }))
      .sort((a, b) => (a.orderAt - b.orderAt) || (a.fallbackIndex - b.fallbackIndex));
    const galleryItems = [...resultItems];
    runningQuickTasks.forEach((task, index) => {
      galleryItems.push({
        kind: "task",
        key: `task-${task.id}`,
        task,
        orderAt: task.startedAt || 0,
        fallbackIndex: visibleResults.length + index
      });
    });
    return galleryItems.sort((a, b) => (a.orderAt - b.orderAt) || (a.fallbackIndex - b.fallbackIndex));
  }, [visibleResults, runningQuickTasks]);
  const referenceGalleryItems = useMemo(() => {
    const sessionItems = [];
    const historyItems = [];
    referenceResults.forEach((item, index) => {
      const entry = {
        kind: "result",
        key: `reference-result-${item.id}`,
        result: item,
        orderAt: Number.isFinite(item.submittedAt) ? item.submittedAt : (Number.isFinite(item.createdAt) ? item.createdAt : 0),
        fallbackIndex: index
      };
      if (item.clientSessionId === CLIENT_SESSION_ID) {
        sessionItems.push(entry);
      } else {
        historyItems.push(entry);
      }
    });
    runningReferenceTasks.forEach((task, index) => {
      sessionItems.push({
        kind: "task",
        key: `reference-task-${task.id}`,
        task,
        orderAt: task.startedAt || 0,
        fallbackIndex: referenceResults.length + index
      });
    });
    sessionItems.sort((a, b) => (a.orderAt - b.orderAt) || (a.fallbackIndex - b.fallbackIndex));
    return [...sessionItems, ...historyItems];
  }, [referenceResults, runningReferenceTasks]);
  const quickSelectedCount = quickResults.reduce((count, item) => count + (selectedIds.has(item.id) ? 1 : 0), 0);
  const selectedCount = selectedIds.size;
  const galleryZoomPercent = Math.round(galleryZoom * 100);
  const galleryCardMin = Math.round(170 * galleryZoom);
  const quickStatus = runningQuickTasks.length > 0 ? "running" : status;
  const latestStatusText = runningQuickTasks.length > 0
    ? `运行中 ${runningQuickTasks.length} 个任务`
    : status === "failed"
      ? "当前任务失败"
      : status === "success"
        ? "当前任务已完成"
        : "等待生成";
  const latestVideoStatusText = runningVideoTasks.length > 0
    ? `视频生成中 ${runningVideoTasks.length} 个任务`
    : videoStatus === "failed"
      ? "视频任务失败"
      : videoStatus === "success"
        ? "视频已完成"
        : videoBillingRequired && !billingGatewayEnabled
          ? "等待计费接入"
          : "等待视频生成";
  const referenceStatusText = runningReferenceTasks.length > 0
    ? `运行中 ${runningReferenceTasks.length} 个任务`
    : referenceStatus === "failed"
      ? "参考生图失败"
      : referenceStatus === "success"
        ? "参考生图已完成"
        : "等待参考生图";
  const contextItem = contextMenu ? results.find((item) => item.id === contextMenu.itemId) : null;
  const contextIndex = contextItem ? results.findIndex((item) => item.id === contextItem.id) : -1;
  const quickGalleryTailKey = quickGalleryItems.at(-1)?.key || "";
  const previewNavigationItems = useMemo(() => {
    if (!previewResult) return [];
    const previewSource = previewResult.source || "quickgen";
    if (previewSource === "detail-main") {
      return activeDetailResults.map((item) => item.result).filter(Boolean);
    }
    if (previewSource === "reference-remix") {
      return referenceGalleryItems
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
  }, [previewResult, activeDetailResults, referenceGalleryItems, quickGalleryItems, results]);

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
      setDetailSettings(convergePageChannel);
      setReferenceSettings(convergePageChannel);
    }).catch(() => {});

    refreshSaveDirectory();
  }, []);

  useEffect(() => {
    let active = true;
    loadHistoryResults().then((storedResults) => {
      if (!active) return;
      setResults(storedResults);
      setDetailGroups((current) => hydrateDetailGroupsWithHistory(current, storedResults));
      if (storedResults.length > 0) addEvent("历史记录", `已载入 ${storedResults.length} 张图片`);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", settings.theme || "dark");
    const timer = window.setTimeout(() => {
      writeJsonStorage(STORAGE_KEY, settings);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [settings]);

  useEffect(() => {
    writeJsonStorage(PROMPT_PRESETS_KEY, promptPresets);
  }, [promptPresets]);

  useEffect(() => {
    writeJsonStorage(PROMPT_CATEGORIES_KEY, promptCategories.filter((category) => category !== "全部"));
  }, [promptCategories]);

  useEffect(() => {
    if (promptCategory !== "全部" && !promptCategories.includes(promptCategory)) {
      setPromptCategory(promptCategories.find((category) => category !== "全部") || "全部");
    }
  }, [promptCategories, promptCategory]);

  useEffect(() => {
    writeJsonStorage(DETAIL_PRESETS_KEY, detailPresets);
  }, [detailPresets]);

  useEffect(() => {
    writeJsonStorage(DETAIL_GROUPS_KEY, sanitizeDetailGroupsForStorage(detailGroups));
  }, [detailGroups]);

  useEffect(() => {
    if (!writeJsonStorage(INFINITE_CANVAS_KEY, infiniteCanvasState)) {
      addEvent("无限画布", "画布内容较大，部分临时图片可能无法写入本地缓存");
    }
  }, [infiniteCanvasState]);

  useEffect(() => {
    writeJsonStorage(ACTIVE_VIEW_KEY, activeView);
  }, [activeView]);

  useEffect(() => {
    if (!videoModels.length) return;
    setVideoSettings((current) => {
      const model = videoModels.find((item) => item.value === current.model) || videoModels[0];
      return normalizeVideoSettingValue(current, model);
    });
  }, [config.videoModels]);

  useEffect(() => {
    if (detailGroups.length === 0) {
      setActiveDetailGroupId("");
      setDetailInfoSelection(null);
      return;
    }
    if (!activeDetailGroupId || !detailGroups.some((group) => group.id === activeDetailGroupId)) {
      setActiveDetailGroupId(detailGroups[0].id);
    }
  }, [detailGroups, activeDetailGroupId]);

  useEffect(() => () => {
    previewFiles.forEach((item) => URL.revokeObjectURL(item.url));
  }, [previewFiles]);

  useEffect(() => () => {
    detailProductPreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [detailProductPreviews]);

  useEffect(() => () => {
    detailReferencePreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [detailReferencePreviews]);

  useEffect(() => () => {
    referenceProductPreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [referenceProductPreviews]);

  useEffect(() => () => {
    referenceStylePreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [referenceStylePreviews]);

  useEffect(() => () => {
    if (videoReferencePreview?.url) URL.revokeObjectURL(videoReferencePreview.url);
  }, [videoReferencePreview]);

  // V46.1: 任务计时已下沉到 <ElapsedTimer>，此处不再需要全局 500ms 刷新

  useEffect(() => {
    if (activeView !== "quickgen" || quickGalleryItems.length === 0) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const gallery = quickGalleryRef.current;
      if (!gallery) return;
      gallery.scrollTop = gallery.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeView, quickGalleryItems.length, quickGalleryTailKey, galleryZoom]);

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
      setReferenceContextMenu(null);
      setStitchContextMenu(null);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setReferenceContextMenu(null);
        setStitchContextMenu(null);
        closeReferencePreview();
        closePreview();
        setIsPromptAssistantOpen(false);
        setEditingPrompt(null);
        setIsDirectoryModalOpen(false);
        setIsDetailPresetOpen(false);
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
  }, [previewResult, previewNavigationItems]);

  useEffect(() => {
    if (!referencePreview) return undefined;
    const onReferencePreviewKeyDown = (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      shiftReferencePreview(event.key === "ArrowRight" ? 1 : -1);
    };
    window.addEventListener("keydown", onReferencePreviewKeyDown);
    return () => window.removeEventListener("keydown", onReferencePreviewKeyDown);
  }, [referencePreview]);

  useEffect(() => () => {
    downloadFeedbackTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    downloadFeedbackTimersRef.current.clear();
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
  }, [isQuickChannelMenuOpen]);

  function updateSetting(key, value) {
    setSettings((current) => {
      const next = { ...current, [key]: value };
      if (key === "model") {
        // 切换模型时按新模型的 capabilities 重新收敛：
        // 比例 / 尺寸 / 生成数量 / 质量 / 背景 / 版本 / 线路。
        return convergeSettingsForModel(next, config.routing || config);
      }
      if (key === "channelId") {
        const channels = channelsForModel(next.model, config.routing || config);
        next.channelId = channels.some((item) => item.id === value) ? value : (channels[0]?.id || "");
        return next;
      }
      if (key === "n") next.n = Math.min(clampCount(value), modelCapabilities(next.model, config.routing || config).maxInputImages);
      return next;
    });
  }

  function updateDetailSetting(key, value) {
    setDetailSettings((current) => {
      const next = { ...current, [key]: value };
      if (key === "model") {
        const nextModel = models.find((item) => item.value === value) || models[0];
        if (!nextModel.ratios.includes(next.ratio)) next.ratio = nextModel.ratios[0];
        // 切换模型后按现有能力目录重新校验渠道：当前渠道不支持新模型时，
        // 沿用现有默认渠道规则（channelForModel = 该模型目录里的第一条合法渠道）。
        next.channelId = channelForModel(next.model, next.channelId, config.routing || config)?.id || "";
      }
      if (key === "channelId") {
        const channels = channelsForModel(next.model, config.routing || config);
        next.channelId = channels.some((item) => item.id === value) ? value : (channels[0]?.id || "");
      }
      if (key === "count") next.count = clampDetailCount(value);
      if (key === "modelUsage") next.modelUsage = clampDetailModelUsage(value);
      if (key === "reverseScreens") next.reverseScreens = clampReverseScreens(value);
      return next;
    });
  }

  function updateReferenceSetting(key, value) {
    setReferenceSettings((current) => {
      const next = { ...current, [key]: value };
      if (key === "model") {
        const nextModel = models.find((item) => item.value === value) || models[0];
        if (!nextModel.ratios.includes(next.aspectRatio)) next.aspectRatio = nextModel.ratios[0];
        // 同 updateDetailSetting：模型换了就按新模型的合法渠道重新落一次。
        next.channelId = channelForModel(next.model, next.channelId, config.routing || config)?.id || "";
      }
      if (key === "channelId") {
        const channels = channelsForModel(next.model, config.routing || config);
        next.channelId = channels.some((item) => item.id === value) ? value : (channels[0]?.id || "");
      }
      if (key === "n") next.n = Math.min(clampCount(value), modelCapabilities(next.model, config).maxInputImages);
      if (key === "strength") next.strength = clampReferenceStrength(value);
      return next;
    });
  }

  async function applySmartReferencePrompt() {
    if (isReferencePromptRewriting) return;
    const apiKey = normalizeApiKeyInput(settings.apiKey);
    if (!apiKey && !config.hasServerKey) {
      setReferenceError("请先在左下角设置里填写 API Key，智能扩写需要调用当前 AI 模型");
      setIsSettingsOpen(true);
      addEvent("参考生图", "请先保存 API Key 后再智能扩写");
      return;
    }

    setIsReferencePromptRewriting(true);
    setReferenceError("");
    try {
      const productUpload = await prepareImageFilesForChannel(referenceProductFiles);
      const referenceUpload = await prepareImageFilesForChannel(referenceStyleFiles);
      if (productUpload.compressedCount + referenceUpload.compressedCount > 0) {
        addEvent("图片压缩", `智能扩写已压缩 ${productUpload.compressedCount + referenceUpload.compressedCount} 张素材到 4MB 内`);
      }

      const form = new FormData();
      form.set("payload", JSON.stringify({
        ...referenceSettings,
        policies: renderReferencePolicy({
          strength: referenceSettings.strength,
          element: referenceSettings.element,
          composition: referenceSettings.composition,
          scene: referenceSettings.scene,
          styleCount: referenceStyleFiles.length
        }),
        apiKey,
        baseUrl: config.defaultBaseUrl || settings.baseUrl || defaultState.baseUrl,
        detailAnalysisModel: DETAIL_ANALYSIS_MODEL,
        productImages: productUpload.files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
        referenceImages: referenceUpload.files.map((file) => ({ name: file.name, size: file.size, type: file.type }))
      }));
      productUpload.files.forEach((file) => form.append("productImage", file, file.name));
      referenceUpload.files.forEach((file) => form.append("referenceImage", file, file.name));

      let payload = null;
      try {
        payload = await rewriteReferencePrompt(form);
      } catch (requestError) {
        payload = requestError?.payload || null;
        const message = requestError instanceof Error ? requestError.message : "参考生图提示词扩写失败";
        if (isAuthErrorMessage(message)) {
          setIsSettingsOpen(true);
          throw new Error(message);
        }
        const fallbackPrompt = payload?.fallbackPrompt || buildSmartReferencePrompt(referenceSettings, referenceStyleFiles.length);
        setReferenceSettings((current) => ({ ...current, prompt: fallbackPrompt }));
        addEvent("参考生图", "文本模型扩写失败，已使用保守 Skill 兜底");
        throw new Error(message);
      }

      setReferenceSettings((current) => ({
        ...current,
        prompt: payload.prompt || current.prompt
      }));
      addEvent("参考生图", `文本模型扩写完成：${payload.mode === "ai-vision" ? "已读取图片" : "纯文本规划"}`);
    } catch (err) {
      const message = normalizeGenerationErrorMessage(err);
      setReferenceError(message);
      addEvent("智能扩写失败", message);
    } finally {
      setIsReferencePromptRewriting(false);
    }
  }

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










  function screenToCanvasPoint(clientX, clientY) {
    return screenPointToCanvas(canvasStageRef.current?.getBoundingClientRect(), canvasViewport, clientX, clientY);
  }

  function canvasCenterPoint(offsetX = 0, offsetY = 0) {
    return canvasCenterFromRect(canvasStageRef.current?.getBoundingClientRect(), canvasViewport, offsetX, offsetY);
  }



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










  async function canvasFileFromResult(item, index) {
    const blob = await blobFromImageItem(item);
    return new File([blob], `canvas-ref-${index + 1}.${imageExtension(blob.type)}`, {
      type: blob.type || "image/png"
    });
  }

  async function addCanvasFiles(fileList, point = canvasCenterPoint()) {
    const picked = imageFilesFromList(fileList);
    if (picked.length === 0) return;
    const form = new FormData();
    picked.slice(0, 12).forEach((file) => form.append("image", file, file.name));
    try {
      const payload = await uploadCanvasAssets(form);
      if (!payload?.ok) throw new Error(payload?.message || "Canvas assets upload failed");
      const nodes = (payload.assets || []).map((asset, index) => createCanvasNode("image", {
        title: asset.name || `图片 ${index + 1}`,
        x: point.x + index * 28,
        y: point.y + index * 28,
        result: {
          id: asset.id || makeResultId(),
          image: { type: "url", value: asset.url, localUrl: asset.url },
          prompt: "",
          modelLabel: "画布素材",
          imageSize: fileSize(asset.size),
          aspectRatio: "",
          referenceCount: 0,
          source: "infinite-canvas",
          originalName: asset.name,
          createdAt: asset.createdAt || Date.now() + index
        }
      }));
      patchActiveCanvas((canvas) => ({ nodes: [...canvas.nodes, ...nodes] }));
      if (nodes[0]) setCanvasSelectedNodeId(nodes[0].id);
      addEvent("无限画布", `已加入 ${nodes.length} 张图片节点`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEvent("无限画布上传失败", message);
    }
  }

  function handleCanvasDrop(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    void addCanvasFiles(event.dataTransfer.files, screenToCanvasPoint(event.clientX, event.clientY));
  }

  function sendResultToCanvas(item) {
    if (!item) return;
    const point = canvasCenterPoint(-CANVAS_NODE_WIDTH / 2, -CANVAS_NODE_HEIGHT / 2);
    const copy = {
      ...item,
      id: makeResultId(),
      source: "infinite-canvas",
      copiedFromResultId: item.id,
      copiedToCanvasAt: Date.now()
    };
    const node = createCanvasNode("image", {
      title: item.modelLabel || "跨模块图片",
      x: point.x,
      y: point.y,
      result: copy,
      prompt: item.prompt || ""
    });
    patchActiveCanvas((canvas) => ({
      nodes: [...canvas.nodes, node]
    }));
    setActiveView("infinite-canvas");
    setCanvasSelectedNodeId(node.id);
    addEvent("无限画布", "已发送副本到当前画布");
  }

  async function runCanvasImageRequest({ canvasId, nodeId, params, runModel, prompt, referenceItems, taskLabel }) {
    const taskId = makeResultId();
    const startedAt = Date.now();
    setCanvasTasks((current) => [{
      id: taskId,
      canvasId,
      nodeId,
      startedAt,
      prompt,
      taskLabel,
      modelLabel: runModel.label,
      imageSize: params.imageSize,
      aspectRatio: params.aspectRatio
    }, ...current]);

    try {
      const filesFromNodes = await Promise.all(referenceItems.slice(0, 6).map((item, index) => canvasFileFromResult(item, index)));
      const form = new FormData();
      form.set("baseUrl", config.defaultBaseUrl || settings.baseUrl || defaultState.baseUrl);
      form.set("apiKey", normalizeApiKeyInput(settings.apiKey));
      const canvasRoute = routingFields(params.model, settings.channelId, config.routing);
      form.set("model", canvasRoute.model);
      form.set("channelId", canvasRoute.channelId);
      form.set("dispatchMode", canvasRoute.dispatchMode);
      form.set("prompt", prompt);
      form.set("imageSize", params.imageSize);
    form.set("aspectRatio", params.aspectRatio);
    form.set("n", String(params.n));
    form.set("source", "infinite-canvas");
    form.set("referenceMeta", JSON.stringify(referenceItems.slice(0, 6).map((item, index) => ({
      name: item.originalName || item.modelLabel || item.taskLabel || `canvas-reference-${index + 1}`,
      role: item.source === "quickgen" ? "reference" : (item.source || "reference"),
      index,
      size: 0,
      type: ""
    }))));
    const upload = await prepareImageFilesForChannel(filesFromNodes);
      if (upload.compressedCount > 0) {
        addEvent("图片压缩", `画布节点已压缩 ${upload.compressedCount} 张素材到 4MB 内`);
      }
      upload.files.forEach((file) => form.append("image", file, file.name));

      const started = performance.now();
      const payload = await generateImages(form);
      if (!payload.images?.length) throw new Error("接口返回成功，但没有解析到图片");

      const totalMs = Number.isFinite(payload.timing?.totalMs) ? payload.timing.totalMs : performance.now() - started;
      const returnedItems = Array.isArray(payload.historyItems) && payload.historyItems.length > 0
        ? payload.historyItems
        : null;
      const nextResults = (returnedItems || payload.images).map((entry, index) => {
        const serverItem = returnedItems ? entry : null;
        return {
          ...serverItem,
          id: serverItem?.id || makeResultId(),
          image: serverItem?.image || entry,
          prompt,
          modelLabel: runModel.label,
          imageSize: params.imageSize,
          aspectRatio: params.aspectRatio,
          referenceCount: filesFromNodes.length,
          generationMs: totalMs,
          source: "infinite-canvas",
          canvasId,
          generatorNodeId: nodeId,
          taskLabel,
          createdAt: serverItem?.createdAt || Date.now() + index
        };
      });
      if (nextResults.length === 0) throw new Error("接口返回成功，但没有解析到图片");

      return {
        prompt,
        results: nextResults,
        totalMs,
        taskLabel
      };
    } finally {
      setCanvasTasks((current) => current.filter((task) => task.id !== taskId));
    }
  }

  async function generateCanvasNode(nodeId) {
    const canvas = activeCanvas;
    const node = canvas?.nodes.find((item) => item.id === nodeId);
    if (!canvas || !node || node.type !== "generator") return;
    if (!normalizeApiKeyInput(settings.apiKey) && !config.hasServerKey) {
      setIsSettingsOpen(true);
      addEvent("无限画布", "请先在设置里填写 API Key");
      updateCanvasNodeByCanvasId(canvas.id, nodeId, { status: "failed", error: "missing_api_key" });
      return;
    }

    const prompt = canvasPromptForGenerator(canvas, node);
    if (!prompt) {
      updateCanvasNodeByCanvasId(canvas.id, nodeId, { status: "failed", error: "请连接提示词节点，或在生图节点里输入提示词" });
      addEvent("无限画布", "缺少提示词");
      return;
    }

    const params = {
      model: node.params?.model || settings.model,
      imageSize: node.params?.imageSize || settings.imageSize,
      aspectRatio: node.params?.aspectRatio || settings.aspectRatio,
      n: clampCount(node.params?.n || 1),
      batchMode: node.params?.batchMode || "single"
    };
    const runModel = models.find((item) => item.value === params.model) || models[0];
    const imageEntries = canvasImageEntriesForGenerator(canvas, node);
    const startedAt = Date.now();
    updateCanvasNodeByCanvasId(canvas.id, nodeId, { status: "running", error: "", generationMs: null });

    try {
      const runs = params.batchMode === "by-model"
        ? (() => {
            const { modelEntries, fixedEntries } = splitCanvasBatchEntries(imageEntries);
            if (modelEntries.length === 0) {
              throw new Error("按模特批量需要至少连接一张模特图");
            }
            return modelEntries.map((entry, index) => ({
              prompt: buildCanvasBatchPrompt(prompt, index, modelEntries.length, fixedEntries.length),
              referenceItems: [entry.result, ...fixedEntries.map((item) => item.result)],
              taskLabel: `模特 ${index + 1}/${modelEntries.length}`,
              yOffset: index * 42
            }));
          })()
        : [{
            prompt,
            referenceItems: imageEntries.map((entry) => entry.result),
            taskLabel: "单次生成",
            yOffset: 0
          }];

      addEvent("无限画布", params.batchMode === "by-model"
        ? `并发提交 ${runs.length} 个模特任务`
        : `${runModel.label} / ${params.imageSize} / ${params.aspectRatio}`);

      const settled = await Promise.allSettled(runs.map((run) => runCanvasImageRequest({
        canvasId: canvas.id,
        nodeId,
        params,
        runModel,
        prompt: run.prompt,
        referenceItems: run.referenceItems,
        taskLabel: run.taskLabel
      })));

      const successfulRuns = settled
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.status === "fulfilled")
        .map(({ item, index }) => ({ ...item.value, index }));
      const failedRuns = settled.filter((item) => item.status === "rejected");
      if (successfulRuns.length === 0) {
        const firstError = failedRuns[0]?.reason;
        throw firstError instanceof Error ? firstError : new Error(String(firstError || "画布批量生成失败"));
      }

      const outputNodes = successfulRuns.map((run) => createCanvasNode("output", {
        title: params.batchMode === "by-model" ? run.taskLabel : `输出 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
        x: node.x + node.w + 86,
        y: node.y + (params.batchMode === "by-model" ? run.index * (CANVAS_NODE_HEIGHT + 24) : Math.max(0, canvas.nodes.filter((item) => item.type === "output").length % 4) * 36),
        results: run.results,
        prompt: run.prompt,
        generationMs: run.totalMs,
        status: "success"
      }));
      const allResults = successfulRuns.flatMap((run) => run.results);
      patchCanvasById(canvas.id, (currentCanvas) => ({
        nodes: [...currentCanvas.nodes, ...outputNodes],
        connections: [
          ...currentCanvas.connections,
          ...outputNodes.map((outputNode) => ({ id: makeResultId(), fromNodeId: nodeId, toNodeId: outputNode.id }))
        ]
      }));
      setResults((current) => [...allResults, ...current]);
      void saveHistoryResults(allResults);
      updateCanvasNodeByCanvasId(canvas.id, nodeId, {
        status: failedRuns.length > 0 ? "partial" : "success",
        generationMs: Date.now() - startedAt,
        error: failedRuns.length > 0 ? `${failedRuns.length} 个任务失败，其余已输出` : ""
      });
      if (outputNodes[0]) setCanvasSelectedNodeId(outputNodes[0].id);
      addEvent("无限画布", failedRuns.length > 0
        ? `完成 ${allResults.length} 张，${failedRuns.length} 个任务失败`
        : `生成 ${allResults.length} 张，用时 ${formatMs(Date.now() - startedAt)}`);
    } catch (err) {
      const message = normalizeGenerationErrorMessage(err);
      if (isAuthErrorMessage(message)) setIsSettingsOpen(true);
      updateCanvasNodeByCanvasId(canvas.id, nodeId, { status: "failed", error: message, generationMs: Date.now() - startedAt });
      addEvent("无限画布失败", message);
    }
  }

  function addEvent(label, detail) {
    setEvents((current) => [
      { time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), label, detail },
      ...current
    ].slice(0, 6));
  }

  function addDetailFiles(role, fileList) {
    addFilesByRole(role, fileList, role === "product" ? detailProductFiles.length : detailReferenceFiles.length,
      MAX_DETAIL_FILES, `${role === "product" ? "产品图" : "参考图"}最多 ${MAX_DETAIL_FILES} 张`,
      "一键详情", addEvent, setDetailProductFiles, setDetailReferenceFiles);
  }

  function removeDetailFile(role, index) {
    removeFilesByRole(role, index, setDetailProductFiles, setDetailReferenceFiles);
  }

  // 实现在 src/shared/dom-actions.js（两侧同一份，20 行逐字节一致）。
  // 这里只保留闭包绑定壳：捕获本组件的 addEvent，14 处调用点因此无需改动。
  const copyText = (text, successMessage = "已复制") =>
    copyTextToClipboard(text, { successMessage, notify: addEvent });

  const resultDownloadDeps = { quickResults, selectedIds, addEvent, quickResultDragIdRef, QUICK_RESULT_DRAG_TYPE, copyText, saveDirectory, refreshSaveDirectory, setSaveDirectory, setDirectoryDraft, setDownloadFeedbackIds, downloadFeedbackTimersRef };
  const { blobFromImageItem, beginResultImageDrag, beginReferenceImageDrag, copyImage, downloadItem, autoSaveGeneratedItems, downloadSelected, downloadAll } = createResultDownload(resultDownloadDeps);

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
    detailGroups,
    blobFromImageItem
  });

  function onComposerPaste(event) {
    const pastedImages = imageFilesFromClipboard(event.clipboardData);
    if (pastedImages.length === 0) return;
    event.preventDefault();
    if (quickMode === "video") {
      setVideoReferenceFile(pastedImages[0]);
      addEvent("视频参考图", "已从剪贴板添加 1 张参考图");
      return;
    }
    appendReferenceFiles(pastedImages, {
      eventLabel: "粘贴上传",
      actionText: "已从剪贴板添加"
    });
  }

  const {
    updateVideoSetting,
    onPickVideoReference,
    onVideoComposerDragOver,
    onVideoComposerDrop,
    videoReferencePayload,
    pollVideoUntilFinished
  } = createVideoComposer({
    videoSettings,
    setVideoSettings,
    videoModels,
    activeVideoModel,
    videoDefaults,
    normalizeVideoSettingValue,
    VIDEO_REFERENCE_MAX_BYTES,
    addEvent,
    videoReferenceFile,
    setVideoReferenceFile,
    isReferenceDropData,
    setIsComposerDragging,
    imageFilesFromReferenceDrop,
    setVideoTasks,
    VIDEO_STATUS_MAX_POLLS,
    VIDEO_STATUS_POLL_INTERVAL_MS
  });
  async function generateVideoFromComposer() {
    const model = activeVideoModel || videoModels[0];
    const modelLabel = model?.label || videoSettings.model || "Seedance";
    const runSettings = normalizeVideoSettingValue({ ...videoSettings }, model || {});
    const apiKey = normalizeApiKeyInput(settings.apiKey);

    if (!apiKey && !config.hasServerKey) {
      setVideoError("请先在左下角设置里填写 API Key");
      setIsSettingsOpen(true);
      setVideoStatus("failed");
      addEvent("无法生成视频", "请先填写 API Key");
      return;
    }
    if (!videoModels.length) {
      setVideoError("视频模型配置未加载");
      setVideoStatus("failed");
      addEvent("无法生成视频", "视频模型配置未加载");
      return;
    }
    if (!videoChannelEnabled) {
      setVideoError("视频通道未配置，请先配置兰兰达视频 KEY");
      setVideoStatus("failed");
      addEvent("无法生成视频", "视频通道未配置");
      return;
    }
    if (videoBillingRequired && !billingGatewayEnabled) {
      setVideoError("视频计费网关未启用，请先接入静音中转站计费后再生成。");
      setVideoStatus("failed");
      addEvent("无法生成视频", "视频计费网关未启用");
      return;
    }
    if (!String(runSettings.prompt || "").trim()) {
      setVideoError("请输入视频提示词");
      setVideoStatus("failed");
      addEvent("无法生成视频", "请输入视频提示词");
      return;
    }
    if (!billingGatewayEnabled) {
      addEvent("计费提示", "当前源码侧计费网关未启用，正式客户版需开启后再交付");
    }

    const requestId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    setVideoStatus("running");
    setVideoError("");
    setVideoTasks((current) => [...current, {
      id: requestId,
      status: "running",
      startedAt,
      modelLabel,
      resolution: runSettings.resolution,
      aspectRatio: runSettings.aspectRatio,
      duration: runSettings.duration,
      prompt: runSettings.prompt,
      statusText: "提交中"
    }]);
    addEvent("视频提交", `${modelLabel} / ${runSettings.resolution} / ${runSettings.aspectRatio} / ${runSettings.duration}s`);

    try {
      const image = await videoReferencePayload();
      const payload = await generateVideo({
        apiKey,
        model: runSettings.model,
        prompt: runSettings.prompt,
        duration: runSettings.duration,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        image,
        outputAudio: runSettings.outputAudio,
        metadata: {
          source: "quick-video",
          clientSessionId: CLIENT_SESSION_ID
        }
      });
      const finalTask = await pollVideoUntilFinished(payload.task || {}, requestId, { ...runSettings, modelLabel }, apiKey, startedAt);
      const url = videoResultUrl(finalTask);
      if (!url) throw new Error("视频任务已完成，但没有返回视频地址");
      const totalMs = Date.now() - startedAt;
      const result = {
        id: requestId,
        taskId: finalTask.taskId || payload.task?.taskId || requestId,
        url,
        prompt: runSettings.prompt,
        modelLabel,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        duration: runSettings.duration,
        generationMs: totalMs,
        createdAt: Date.now(),
        submittedAt: startedAt,
        status: "success",
        referenceName: videoReferenceFile?.name || (runSettings.imageUrl ? "URL参考图" : "")
      };
      setVideoResults((current) => [result, ...current]);
      setVideoStatus("success");
      addEvent("视频完成", `生成 1 条视频，用时 ${formatMs(totalMs)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthErrorMessage(message)) setIsSettingsOpen(true);
      setVideoStatus("failed");
      setVideoError(message);
      addEvent("视频失败", message);
    } finally {
      setVideoTasks((current) => current.filter((task) => task.id !== requestId));
    }
  }

  function downloadVideoResult(item) {
    if (!item?.url) return;
    const link = document.createElement("a");
    link.href = item.url;
    link.download = `静音AI视频-${dragDownloadDateStamp(item.createdAt || Date.now())}.mp4`;
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addEvent("视频下载", "已开始下载视频");
  }

  function clearVideoResults() {
    setVideoResults([]);
    setVideoTasks([]);
    setVideoStatus("idle");
    setVideoError("");
    addEvent("视频", "已清空视频结果");
  }

  function removeReferenceImage(index) {
    setFiles((current) => {
      const removed = current[index];
      if (quickCropEditTarget?.id && removed?.id === quickCropEditTarget.id) {
        setQuickCropEditTarget(null);
      }
      if (quickLocalEditTarget?.id && removed?.id === quickLocalEditTarget.id) {
        setQuickLocalEditTarget(null);
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  function openQuickCropEdit(item) {
    if (!item?.id) return;
    setQuickCropEditTarget(item);
  }

  function openQuickLocalEdit(item) {
    if (!item?.id) return;
    // 2026-09-25：这里原来会在 settings.aspectRatio 不属于 QUICK_LOCAL_EDIT_RATIOS 时
    // 把比例强改成 QUICK_LOCAL_EDIT_RATIOS[0]（也就是 "1:1"）。
    // 模型目录里的 2:3 / auto 等合法比例会因此被悄悄改成正方形，
    // 于是"打开局部回贴就变成正方形选框"。现在不再改用户的比例设置。
    setQuickLocalEditTarget(item);
  }

  function applyQuickCropEdit(itemId, cropped) {
    setFiles((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        cropEdit: {
          cropFile: cropped.file,
          cropRect: cropped.cropRect,
          sourceWidth: cropped.sourceWidth,
          sourceHeight: cropped.sourceHeight,
          aspectRatio: cropped.aspectRatio || settings.aspectRatio,
          appliedAt: Date.now()
        },
        localEdit: null
      };
    }));
    setQuickCropEditTarget(null);
    addEvent("普通裁剪", "已启用普通裁剪，生成结果不会贴回原图");
  }

  function applyQuickLocalEdit(itemId, cropped) {
    const nextRatio = QUICK_LOCAL_EDIT_RATIOS.includes(cropped.aspectRatio) ? cropped.aspectRatio : QUICK_LOCAL_EDIT_RATIOS[0];
    updateSetting("aspectRatio", nextRatio);
    setFiles((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        cropEdit: null,
        localEdit: {
          cropFile: cropped.file,
          cropRect: cropped.cropRect,
          contextRect: cropped.contextRect || null,
          sourceWidth: cropped.sourceWidth,
          sourceHeight: cropped.sourceHeight,
          aspectRatio: nextRatio,
          editMode: cropped.editMode || LOCAL_EDIT_RECT_MODE,
          maskDataUrl: cropped.maskDataUrl || "",
          maskBounds: cropped.maskBounds || null,
          brushSize: cropped.brushSize || LOCAL_EDIT_BRUSH_DEFAULT,
          maskOpacity: cropped.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT,
          appliedAt: Date.now()
        }
      };
    }));
    setQuickLocalEditTarget(null);
    addEvent("局部编辑", cropped.editMode === LOCAL_EDIT_MASK_MODE ? "已启用涂抹蒙版，生成后只回贴涂抹区域" : "已启用局部裁剪，生成后会贴回原图");
  }

  function clearQuickCropEdit(itemId) {
    setFiles((current) => current.map((item) => (
      item.id === itemId ? { ...item, cropEdit: null } : item
    )));
    setQuickCropEditTarget(null);
    addEvent("普通裁剪", "已取消普通裁剪");
  }

  function clearQuickLocalEdit(itemId) {
    setFiles((current) => current.map((item) => (
      item.id === itemId ? { ...item, localEdit: null } : item
    )));
    setQuickLocalEditTarget(null);
    addEvent("局部编辑", "已取消局部裁剪");
  }

  const resultActionsDeps = { setSelectedIds, selectedIds, activeView, quickResults, setResults, setBrokenResultImages, detailInfoSelection, setDetailInfoSelection, setDetailGroups, removeHistoryResults, loadHistoryResults, hydrateDetailGroupsWithHistory, addEvent };
  const { toggleSelected, deleteSelected, deleteResult, markResultImageBroken, refreshHistory, syncHistoryFromServer } = createResultActions(resultActionsDeps);

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




  function clearAll() {
    const targetResults = activeView === "reference-remix" ? referenceResults : quickResults;
    const moduleName = activeView === "reference-remix" ? "参考生图" : "快捷生成";
    const confirmed = window.confirm(`确定清空${moduleName}历史记录吗？这个操作不会影响其他模块。`);
    if (!confirmed) return;
    const ids = targetResults.map((item) => item.id);
    setResults((current) => current.filter((item) => !ids.includes(item.id)));
    setSelectedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    if (activeView === "reference-remix") {
      setReferenceProductFiles([]);
      setReferenceStyleFiles([]);
      setReferenceTasks([]);
      setReferenceStatus("idle");
      setReferenceError("");
    } else {
      setFiles([]);
      setQuickLocalEditTarget(null);
      setTiming(null);
      setError("");
      setStatus("idle");
      setQuickTasks([]);
    }
    setEvents([]);
    void removeHistoryResults(ids);
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
    const sendOpenRequest = (directory) => {
      addEvent("保存目录", "正在打开保存目录");
      openSaveDirectoryRequest(directory).then((payload) => {
        setSaveDirectory(payload.directory);
        setDirectoryDraft((current) => current || payload.directory);
        addEvent("保存目录", `已打开 ${payload.directory}`);
      }).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        addEvent("打开失败", message);
      });
    };

    const directory = saveDirectory || directoryDraft;
    if (directory) {
      sendOpenRequest(directory);
      return;
    }

    void refreshSaveDirectory().then((nextDirectory) => {
      if (nextDirectory) sendOpenRequest(nextDirectory);
    });
  }

  async function saveProcessedImageFile(file, subfolder = "") {
    const directory = saveDirectory || await refreshSaveDirectory();
    if (!directory) throw new Error("未找到指定文件夹");
    const form = new FormData();
    form.append("directory", directory);
    form.append("subfolder", subfolder || "");
    form.append("image", file, file.name || `image-${Date.now()}.jpg`);
    const response = await fetch("/api/save-processed-image", {
      method: "POST",
      body: form
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || "保存图片失败");
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    return payload;
  }

  function changeGalleryZoom(delta) {
    setGalleryZoom((current) => Math.max(0.75, Math.min(1.45, Number((current + delta).toFixed(2)))));
  }

  function onQuickBoardWheel(event) {
    const gallery = quickGalleryRef.current;
    if (!gallery) return;
    if (event.target?.closest?.("textarea,input,select,.composerReferences")) return;
    if (gallery.contains(event.target)) return;
    if (gallery.scrollHeight <= gallery.clientHeight) return;
    event.preventDefault();
    gallery.scrollTop += event.deltaY;
  }

  function autoSaveEventText(payload, overrideCount = null) {
    const count = Number((overrideCount ?? payload?.autoSavedCount) || 0);
    return count > 0 ? `，已自动保存 ${count} 张` : "";
  }

  const {
    stitchDetailGroupBlob,
    detailResultItemsForGroup,
    selectDetailResult,
    beginDetailScreenDrag,
    endDetailScreenDrag,
    dropDetailScreen,
    openStitchPreview,
    closeStitchPreview,
    handleStitchWheel,
    beginStitchDrag,
    moveStitchDrag,
    endStitchDrag,
    updateDetailPrompt,
    toggleDetailPrompt,
    saveDetailPreset,
    loadDetailPreset,
    deleteDetailPreset,
  } = createDetailGroup({
    blobFromImageItem,
    detailForwardSort,
    setDetailInfoSelection,
    detailDragScreen,
    setDetailDragScreen,
    setDetailGroups,
    setStitchPreview,
    setStitchZoom,
    setStitchPan,
    stitchPan,
    setStitchContextMenu,
    stitchDragRef,
    detailSettings,
    setDetailSettings,
    setDetailPresets,
    setIsDetailPresetOpen,
    addEvent,
    makeResultId,
    normalizeDetailSettings
  });

  async function downloadStitchPreview(group) {
    try {
      const directory = saveDirectory || await refreshSaveDirectory();
      const blob = await stitchDetailGroupBlob(group);
      const dataUrl = await dataUrlFromBlob(blob, "长图编码失败");
      const response = await fetch("/api/save-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directory,
          item: {
            id: `${group.id}_stitch_${Date.now()}`,
            image: { type: "b64_json", value: dataUrl },
            modelLabel: "详情长图",
            imageSize: `${detailResultItemsForGroup(group).length}屏`,
            aspectRatio: "long",
            createdAt: Date.now()
          }
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "保存长图失败");
      setSaveDirectory(payload.directory);
      setDirectoryDraft(payload.directory);
      addEvent("拼图下载", `长图已保存到 ${payload.filename}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEvent("拼图下载失败", message);
    }
  }

  async function optimizePrompt() {
    if (isQuickPromptOptimizing) return;
    const apiKey = normalizeApiKeyInput(settings.apiKey);
    if (!apiKey && !config.hasServerKey) {
      setError("请先在左下角设置里填写 API Key，优化提示词需要调用当前 AI 模型");
      setIsSettingsOpen(true);
      addEvent("优化提示词", "请先保存 API Key 后再优化");
      return;
    }

    setIsQuickPromptOptimizing(true);
    setError("");
    try {
      const quickFiles = quickReferenceUploadFiles(files.map(normalizeQuickReferenceItem).filter(Boolean));
      const upload = await prepareImageFilesForChannel(quickFiles);
      if (upload.compressedCount > 0) {
        addEvent("图片压缩", `优化提示词已压缩 ${upload.compressedCount} 张参考图到 4MB 内`);
      }

      const form = new FormData();
      form.set("payload", JSON.stringify({
        prompt: settings.prompt,
        model: settings.model,
        imageSize: settings.imageSize,
        aspectRatio: settings.aspectRatio,
        n: settings.n,
        apiKey,
        baseUrl: config.defaultBaseUrl || settings.baseUrl || defaultState.baseUrl,
        detailAnalysisModel: DETAIL_ANALYSIS_MODEL,
        referenceImages: upload.files.map((file) => ({ name: file.name, size: file.size, type: file.type }))
      }));
      upload.files.forEach((file) => form.append("image", file, file.name));

      let payload = null;
      try {
        payload = await rewriteQuickPrompt(form);
      } catch (requestError) {
        payload = requestError?.payload || null;
        const message = requestError instanceof Error ? requestError.message : "快捷生成提示词优化失败";
        if (isAuthErrorMessage(message)) {
          setIsSettingsOpen(true);
          throw new Error(message);
        }
        if (payload?.fallbackPrompt) {
          updateSetting("prompt", payload.fallbackPrompt);
          addEvent("优化提示词", "文本模型优化失败，已使用保守 Skill 兜底");
        }
        throw new Error(message);
      }

      updateSetting("prompt", payload.prompt || settings.prompt);
      addEvent("优化提示词", `文本模型优化完成，${payload.mode === "ai-vision" ? "已读取参考图" : "纯文本优化"}`);
    } catch (err) {
      const message = normalizeGenerationErrorMessage(err);
      setError(message);
      addEvent("优化提示词失败", message);
    } finally {
      setIsQuickPromptOptimizing(false);
    }
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
    makePresetId: makeResultId,
    notify: addEvent,
    onApplyPreset: () => setIsPromptAssistantOpen(false)
  });

  function deletePromptCategory(category) {
    if (!category || category === "全部") return;
    const fallback = promptFallbackCategory(promptCategories, category);
    const shouldDelete = window.confirm(`删除分类「${category}」？里面的提示词会移动到「${fallback}」。`);
    if (!shouldDelete) return;
    setPromptCategories((current) => normalizePromptCategories(current.filter((item) => item !== category)));
    setPromptPresets((current) => current.map((preset) => (
      preset.category === category ? { ...preset, category: fallback } : preset
    )));
    if (promptCategory === category) setPromptCategory(fallback);
    if (editingPrompt?.category === category) updateEditingPrompt("category", fallback);
    addEvent("提示词分类", `已删除「${category}」，提示词已移动到「${fallback}」`);
  }

  function promptCategoryFromDrag(event) {
    return draggedPromptCategory || event.dataTransfer.getData(PROMPT_CATEGORY_DRAG_TYPE);
  }

  function isPromptCategoryDrag(event) {
    return Boolean(
      draggedPromptCategory
      || Array.from(event.dataTransfer?.types || []).includes(PROMPT_CATEGORY_DRAG_TYPE)
    );
  }

  function promptCategoryDropEdge(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2 ? "after" : "before";
  }

  function beginPromptCategoryDrag(event, category) {
    if (!category || category === "全部") return;
    setDraggedPromptCategory(category);
    setPromptDropCategory("");
    setPromptCategoryDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(PROMPT_CATEGORY_DRAG_TYPE, category);
  }

  function endPromptCategoryDrag() {
    setDraggedPromptCategory("");
    setPromptCategoryDropTarget(null);
  }

  function dragPromptCategoryOver(event, category) {
    if (category === "全部") return;
    if (isPromptCategoryDrag(event)) {
      const source = promptCategoryFromDrag(event);
      if (!source || source === category) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setPromptCategoryDropTarget({ category, edge: promptCategoryDropEdge(event) });
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setPromptDropCategory(category);
  }

  function dropPromptCategoryOnCategory(event, category) {
    const source = promptCategoryFromDrag(event);
    if (!source || source === "全部" || !category || category === "全部" || source === category) return false;
    event.preventDefault();
    const dropTarget = promptCategoryDropTarget?.category === category
      ? promptCategoryDropTarget
      : { category, edge: promptCategoryDropEdge(event) };
    setPromptCategories((current) => {
      if (!current.includes(source) || !current.includes(category)) return current;
      const next = current.filter((item) => item !== source);
      let insertIndex = next.indexOf(category);
      if (insertIndex < 0) return current;
      if (dropTarget.edge === "after") insertIndex += 1;
      next.splice(Math.max(1, insertIndex), 0, source);
      return normalizePromptCategories(next);
    });
    setDraggedPromptCategory("");
    setPromptCategoryDropTarget(null);
    addEvent("提示词分类", "分类顺序已更新");
    return true;
  }

  function dropOnPromptCategory(event, category) {
    if (isPromptCategoryDrag(event)) {
      dropPromptCategoryOnCategory(event, category);
      return;
    }
    dropPromptOnCategory(event, category);
  }

  function saveApiKey() {
    const cleanedKey = normalizeApiKeyInput(settings.apiKey);
    const nextSettings = { ...settings, apiKey: cleanedKey };
    setSettings(nextSettings);
    writeJsonStorage(STORAGE_KEY, nextSettings);
    setApiSaveStatus(cleanedKey ? `已清理格式并保存（长度 ${cleanedKey.length}）` : "已清空本机 Key");
    addEvent("设置", "API Key 已保存");
    window.setTimeout(() => setApiSaveStatus(""), 1800);
  }

  function openSettingsPanel() {
    setIsSettingsOpen(true);
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

  function openUploadPreview(item) {
    if (!item?.url) return;
    // 排完序松手会紧跟一次 click，这时不能开预览（同批量侧 outfit-panels 的 150ms 抑制窗口）。
    if (suppressReferencePreviewRef.current) return;
    setUploadPreview({
      url: item.url,
      name: item.uploadName || item.file?.name || "上传图片",
      size: item.uploadSize || item.file?.size || 0
    });
  }

  // ---- 参考图左右调顺序（pointer 版，与批量侧 outfit-panels 同一套手感）----
  function beginReferenceSort(event, item) {
    if (event.button !== 0) return;
    // 移除按钮 / 裁剪 / 局部回贴这三个工具按钮不参与拖拽。
    if (event.target instanceof Element && event.target.closest(".referenceToolRow")) return;
    referencePointerSortRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveReferenceSort(event) {
    const sort = referencePointerSortRef.current;
    if (!sort) return;
    // 只有 1 张图时排不了序，也不需要起步。
    if (previewFiles.length <= 1) return;
    const deltaX = event.clientX - sort.startX;
    const deltaY = event.clientY - sort.startY;
    // 8px 阈值：没超过就当作普通点击，不要抢走 click。
    if (!sort.active && Math.hypot(deltaX, deltaY) < 8) return;

    sort.active = true;
    setDraggingReferenceId(sort.id);
    event.preventDefault();
    event.stopPropagation();

    const under = document.elementFromPoint(event.clientX, event.clientY);
    const wrap = under?.closest?.(".referenceThumbWrap[data-reference-id]");
    const targetId = wrap?.dataset?.referenceId;
    if (!wrap || !targetId || targetId === sort.id) {
      sort.target = null;
      setReferenceSortTarget(null);
      return;
    }

    const rect = wrap.getBoundingClientRect();
    // 左右分半：过中线算"放到它后面"，否则算"放到它前面"。
    const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    sort.target = { id: targetId, placement };
    setReferenceSortTarget(sort.target);
  }

  function endReferenceSort(event) {
    const sort = referencePointerSortRef.current;
    if (!sort) return;
    if (sort.active) {
      event.preventDefault();
      event.stopPropagation();
      if (sort.target) {
        moveReferenceFile(sort.id, sort.target.id, sort.target.placement);
      }
      suppressReferencePreviewRef.current = true;
      window.setTimeout(() => {
        suppressReferencePreviewRef.current = false;
      }, 150);
    }
    referencePointerSortRef.current = null;
    setDraggingReferenceId("");
    setReferenceSortTarget(null);
  }

  function cancelReferenceSort() {
    referencePointerSortRef.current = null;
    setDraggingReferenceId("");
    setReferenceSortTarget(null);
  }

  function closeUploadPreview() {
    setUploadPreview(null);
  }

  // V11-RF-043-2：共享 `ReferenceThumbTray` 的 onOpen 约定统一为 `(reference, index, items)`，
  // 第一个实参是**被点击的那一张**，不再是整组（旧版是 `onOpen(items, index)`）。
  // 本页预览要的是整组 ⇒ 取第三个实参 items；items 缺失时退化到被点击的这一张（放宽，不留静默失效）。
  // 正常路径下 items 就是旧版传进来的那个数组 ⇒ 与改前**行为等价**。
  function openReferencePreview(reference, index = 0, items = []) {
    const source = Array.isArray(items) && items.length > 0 ? items : [reference];
    const previewItems = source.filter((item) => referenceSource(item));
    if (previewItems.length === 0) return;
    setReferencePreview({
      items: previewItems,
      index: Math.max(0, Math.min(previewItems.length - 1, index))
    });
  }

  function closeReferencePreview() {
    setReferencePreview(null);
  }

  function shiftReferencePreview(direction) {
    setReferencePreview((current) => {
      if (!current?.items?.length) return current;
      const nextIndex = Math.max(0, Math.min(current.items.length - 1, current.index + direction));
      return nextIndex === current.index ? current : { ...current, index: nextIndex };
    });
  }

  function openPreview(item) {
    setPreviewResult(item);
    setPreviewZoom(1);
    setPreviewPan({ x: 0, y: 0 });
  }

  function shiftPreview(direction) {
    if (!previewResult || previewNavigationItems.length <= 1) return;
    const index = previewNavigationItems.findIndex((item) => item.id === previewResult.id);
    if (index < 0) return;
    const nextIndex = Math.max(0, Math.min(previewNavigationItems.length - 1, index + direction));
    if (nextIndex === index) return;
    openPreview(previewNavigationItems[nextIndex]);
  }

  function closePreview() {
    setPreviewResult(null);
    setPreviewZoom(1);
    setPreviewPan({ x: 0, y: 0 });
    previewDragRef.current = null;
  }

  function handlePreviewWheel(event) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setPreviewZoom((current) => {
      const next = current + direction * 0.12;
      return Math.max(0.35, Math.min(4, Number(next.toFixed(2))));
    });
  }

  function beginPreviewDrag(event) {
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
    if (!drag.moved) closePreview();
  }

  async function sendResultToImageEditor(item, slot = "base") {
    try {
      const blob = await blobFromImageItem(item);
      const file = new File([blob], `${fileBaseName(item?.modelLabel || item?.id || "result")}-${slot}-${Date.now()}.${imageExtension(blob.type)}`, {
        type: blob.type || "image/png",
        lastModified: Date.now()
      });
      setImageEditorSeed({
        id: `image_editor_seed_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        slot,
        file
      });
      setActiveView("image-editor");
      addEvent("图片编辑", slot === "overlay" ? "已设为上层图" : "已设为底图");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEvent("图片编辑失败", message);
    }
  }

  async function addReferenceThumbToUploads(reference) {
    const src = referenceSource(reference);
    setReferenceContextMenu(null);
    if (!src) {
      addEvent("参考图", "这张缩略图没有可读取的图片地址");
      return;
    }
    try {
      const file = await imageFileFromUrl(src, reference?.name || reference?.label || "reference");
      appendReferenceFiles([file], {
        eventLabel: "参考图",
        actionText: "已发送到图片上传区"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEvent("参考图失败", message);
    }
  }

  function openContextMenu(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 176;
    const menuHeight = 476;
    setReferenceContextMenu(null);
    setStitchContextMenu(null);
    setContextMenu({
      itemId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  function openReferenceContextMenu(event, reference, index, items) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 190;
    const menuHeight = 52;
    setContextMenu(null);
    setStitchContextMenu(null);
    setReferenceContextMenu({
      reference,
      index,
      count: Array.isArray(items) ? items.length : 0,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  function openStitchContextMenu(event, groupId) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 176;
    const menuHeight = 132;
    setContextMenu(null);
    setReferenceContextMenu(null);
    setStitchContextMenu({
      groupId,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  function findDetailPromptByResult(resultId) {
    for (const group of detailGroups) {
      for (const prompt of group.prompts) {
        if ((prompt.results || []).some((result) => result.id === resultId)) {
          return { group, prompt };
        }
      }
    }
    return null;
  }

  function rerunResult(item, count = 1) {
    if (item.source === "infinite-canvas") {
      setActiveView("infinite-canvas");
      addEvent("无限画布", "画布结果请通过生图节点继续生成");
      return;
    }
    const detailMatch = findDetailPromptByResult(item.id);
    if (detailMatch) {
      void generateDetailPrompt(detailMatch.group, detailMatch.prompt, detailMatch.prompt.screen, count);
      return;
    }
    const prompt = item.prompt || settings.prompt;
    setSettings((current) => ({ ...current, prompt, n: count }));
    void generate({ prompt, n: count, replaceResultId: item.id });
  }

  function markDeferredFeature(label) {
    addEvent(label, "此功能会在后续模块接入");
  }

  function downloadDetailGroup(group, selectedOnly = false) {
    const items = detailResultItemsForGroup(group).filter(({ result }) => !selectedOnly || selectedIds.has(result.id));
    if (items.length === 0) {
      addEvent("下载", selectedOnly ? "请先勾选要下载的分屏图片" : "暂无可下载分屏图片");
      return;
    }
    items.forEach(({ result }, index) => void downloadItem(result, index));
    addEvent("下载", `已提交 ${items.length} 张分屏图片保存任务`);
  }

  async function createDetailPromptPlan() {
    if (detailProductFiles.length === 0) {
      addEvent("一键详情", "请至少上传一张产品图");
      return;
    }
    const detailApiKey = normalizeApiKeyInput(settings.apiKey);
    if (!detailApiKey && !config.hasServerKey) {
      setError("请先在左下角设置里填写 API Key，AI 详情页分析需要调用当前 AI 模型");
      setIsSettingsOpen(true);
      setDetailStatus("failed");
      return;
    }

    setDetailStatus("planning");
    try {
      const productUpload = await prepareImageFilesForChannel(detailProductFiles);
      const referenceUpload = await prepareImageFilesForChannel(detailReferenceFiles);
      if (productUpload.compressedCount + referenceUpload.compressedCount > 0) {
        addEvent("图片压缩", `已压缩 ${productUpload.compressedCount + referenceUpload.compressedCount} 张素材到 4MB 内`);
      }
      const form = new FormData();
      form.set("payload", JSON.stringify({
        ...detailSettings,
        analysisMode: "ai",
        detailAnalysisModel: DETAIL_ANALYSIS_MODEL,
        apiKey: detailApiKey,
        baseUrl: config.defaultBaseUrl || settings.baseUrl || defaultState.baseUrl,
        productImages: productUpload.files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
        referenceImages: referenceUpload.files.map((file) => ({ name: file.name, size: file.size, type: file.type }))
      }));
      productUpload.files.forEach((file) => form.append("productImage", file, file.name));
      referenceUpload.files.forEach((file) => form.append("referenceImage", file, file.name));
      const payload = await createDetailPrompts(form);
      const group = {
        ...payload.group,
        productFiles: [...productUpload.files],
        referenceFiles: [...referenceUpload.files]
      };
      setDetailGroups((current) => [group, ...current].slice(0, 20));
      setActiveDetailGroupId(group.id);
      setDetailInfoSelection(null);
      setDetailStatus("ready");
      addEvent("一键详情", `已生成 ${group.prompts.length} 屏分段提示词`);
    } catch (err) {
      const message = normalizeGenerationErrorMessage(err);
      setDetailStatus("failed");
      addEvent("一键详情失败", message);
    }
  }

  function applyDetailPromptToQuickgen(prompt) {
    updateSetting("prompt", prompt.text);
    setActiveView("quickgen");
    addEvent("快捷生成", `已推送第${prompt.screen}屏提示词`);
  }

  async function generateDetailPrompt(group, prompt, index = 0, count = 1) {
    const pickFiles = (list, indexes) => {
      if (!Array.isArray(indexes) || indexes.length === 0) return list.length > 0 ? [list[0]] : [];
      return indexes.map((fileIndex) => list[fileIndex]).filter(Boolean);
    };
    const productFiles = group.productFiles || [];
    const referenceFiles = group.referenceFiles || [];
    const selectedProductFiles = pickFiles(productFiles, prompt.productFileIndexes);
    const selectedReferenceFiles = Array.isArray(prompt.referenceFileIndexes)
      ? prompt.referenceFileIndexes.map((fileIndex) => referenceFiles[fileIndex]).filter(Boolean)
      : referenceFiles.slice(0, 1);
    const runFiles = [...selectedProductFiles, ...selectedReferenceFiles].slice(0, 6);
    const runReferenceMeta = [
      ...referenceMetaFromFiles(selectedProductFiles, "product"),
      ...referenceMetaFromFiles(selectedReferenceFiles, "reference", selectedProductFiles.length)
    ].slice(0, 6);
    const runModel = models.find((item) => item.value === group.params.model) || models[0];
    const started = performance.now();
    updateDetailPrompt(group.id, prompt.screen, { status: "running", error: "", generationMs: null });

    const form = new FormData();
    form.set("baseUrl", config.defaultBaseUrl || settings.baseUrl || defaultState.baseUrl);
    form.set("apiKey", normalizeApiKeyInput(settings.apiKey));
    const detailRoute = routingFields(group.params.model, detailSettings.channelId, config.routing);
    form.set("model", detailRoute.model);
    form.set("channelId", detailRoute.channelId);
    form.set("dispatchMode", detailRoute.dispatchMode);
    form.set("prompt", prompt.text);
    form.set("imageSize", group.params.imageSize);
    form.set("aspectRatio", group.params.ratio);
    form.set("n", String(clampCount(count)));
    form.set("source", "detail-main");
    form.set("referenceMeta", JSON.stringify(runReferenceMeta));

    try {
      const upload = await prepareImageFilesForChannel(runFiles);
      if (upload.compressedCount > 0) {
        addEvent("图片压缩", `第${prompt.screen}屏已压缩 ${upload.compressedCount} 张素材到 4MB 内`);
      }
      upload.files.forEach((file) => form.append("image", file, file.name));
      const payload = await generateImages(form);
      const totalMs = Number.isFinite(payload.timing?.totalMs) ? payload.timing.totalMs : performance.now() - started;
      const returnedItems = Array.isArray(payload.historyItems) && payload.historyItems.length > 0
        ? payload.historyItems
        : null;
      const nextResults = (returnedItems || payload.images || []).map((entry, resultIndex) => {
        const serverItem = returnedItems ? entry : null;
        return {
          ...serverItem,
          id: serverItem?.id || makeResultId(),
          image: serverItem?.image || entry,
          prompt: prompt.text,
          modelLabel: runModel.label,
          imageSize: group.params.imageSize,
          aspectRatio: group.params.ratio,
          referenceCount: runFiles.length,
          generationMs: totalMs,
          source: "detail-main",
          detailScreen: prompt.screen,
          createdAt: serverItem?.createdAt || Date.now() + index + resultIndex
        };
      });
      if (nextResults.length === 0) throw new Error("接口返回成功，但没有解析到图片");
      setResults((current) => [...nextResults, ...current]);
      void saveHistoryResults(nextResults);
      window.setTimeout(() => {
        void syncHistoryFromServer();
      }, 2400);
      if (nextResults[0]) {
        setDetailInfoSelection({ groupId: group.id, promptScreen: prompt.screen, resultId: nextResults[0].id });
      }
      updateDetailPrompt(group.id, prompt.screen, {
        status: "success",
        generationMs: totalMs,
        results: nextResults
      });
      addEvent("一键详情", `第${prompt.screen}屏完成，用时 ${formatMs(totalMs)}`);
      return nextResults;
    } catch (err) {
      const message = normalizeGenerationErrorMessage(err);
      if (isAuthErrorMessage(message)) {
        setIsSettingsOpen(true);
        setError("API Key 无效，请检查后在设置里重新保存。");
      }
      updateDetailPrompt(group.id, prompt.screen, {
        status: "failed",
        error: message,
        generationMs: performance.now() - started
      });
      addEvent(`第${prompt.screen}屏失败`, message);
      throw err;
    }
  }

  async function generateDetailGroup(groupId) {
    const group = detailGroups.find((item) => item.id === groupId);
    if (!group) return;
    if (!normalizeApiKeyInput(settings.apiKey) && !config.hasServerKey) {
      setError("请先在左下角设置里填写 API Key");
      setIsSettingsOpen(true);
      setDetailStatus("failed");
      return;
    }
    const enabledPrompts = group.prompts.filter((prompt) => prompt.enabled && prompt.status !== "running");
    if (enabledPrompts.length === 0) {
      addEvent("一键详情", "没有可提交的分屏，请先勾选未在生成中的提示词");
      return;
    }

    setDetailStatus("generating");
    setDetailGroups((current) => current.map((item) => (
      item.id === groupId ? { ...item, status: "generating" } : item
    )));
    addEvent("一键详情", `并发提交 ${enabledPrompts.length} 个分屏任务`);
    const settled = await Promise.allSettled(
      enabledPrompts.map((prompt, index) => generateDetailPrompt(group, prompt, index))
    );
    const failed = settled.filter((item) => item.status === "rejected").length;
    const hasAuthFailure = settled.some((item) => (
      item.status === "rejected" && isAuthErrorMessage(item.reason instanceof Error ? item.reason.message : String(item.reason))
    ));
    if (hasAuthFailure) {
      setIsSettingsOpen(true);
      setError("API Key 无效，请检查后在设置里重新保存。");
      addEvent("一键详情", "有分屏返回 API Key 无效，请检查 KEY");
    }
    setDetailGroups((current) => current.map((item) => (
      item.id === groupId ? { ...item, status: failed ? "partial" : "success" } : item
    )));
    setDetailStatus(failed ? "failed" : "ready");
    addEvent("一键详情", failed ? `完成，${failed} 屏失败` : "全部屏幕生成完成");
  }

  async function generate(overrides = {}) {
    const { replaceResultId = "", ...settingOverrides } = overrides;
    const runSettings = {
      ...settings,
      ...settingOverrides,
      n: clampCount(settingOverrides.n ?? settings.n),
      baseUrl: config.defaultBaseUrl || settings.baseUrl || defaultState.baseUrl
    };
    const runItems = files.map(normalizeQuickReferenceItem).filter(Boolean);
    const localEditItems = runItems.filter(quickReferenceHasLocalEdit);
    const primaryRunItem = runItems[0] || null;
    const localEditItem = quickReferenceHasLocalEdit(primaryRunItem) ? primaryRunItem : null;
    const primaryLocalEdit = Boolean(localEditItem?.id);
    const ignoredLocalEditCount = localEditItems.filter((item) => item?.id !== localEditItem?.id).length;
    const hasLocalEditConflict = primaryLocalEdit && ignoredLocalEditCount > 0;
    const quickPrimaryLocalIntent = primaryLocalEdit ? classifyQuickPrimaryLocalIntent(runSettings.prompt) : "";
    let localEditForRun = localEditItem?.localEdit || null;
    let localEditRunItem = localEditItem;
    const wholeOutfitIntent = !localEditForRun
      && runItems.length >= 2
      && classifyQuickPrimaryLocalIntent(runSettings.prompt) === "outfit";
    // 2026-09-25 对齐 3.0：删除了 shouldUseExactBanana2LocalCrop 的"香蕉2 再精确重裁一次"分支。
    // 它存在的理由是当时只有香蕉2 用精确选框、其它模型用 contextRect 大图；
    // 现在所有模型上传的都是精确选框（见 cropLocalEditFile），这个特殊分支已经没有意义。
    const runFiles = runItems.map((item) => quickReferenceRunUploadFile(item, localEditRunItem)).filter((file) => file instanceof File);
    // 2026-09-26：SKILL 规则已整体删除 —— 发给接口的提示词就是用户输入框里的原文。
    const apiPrompt = promptForQuickGeneration(runSettings.prompt);
    // 提示词上限来自当前模型 capabilities；超限时按目录上限截断并提示，
    // 用户输入框里的原文保持不动。
    const promptClamp = clampPromptForModel(apiPrompt, runSettings.model, config.routing || config);
    const finalPrompt = promptClamp.prompt;
    if (promptClamp.truncated) {
      addEvent("提示词截断", `已按当前模型上限截断到 ${promptClamp.maxPromptLength} 字`);
    }
    const runModel = models.find((item) => item.value === runSettings.model) || models[0];
    const runReferenceMeta = referenceMetaFromQuickRunItems(runItems, localEditRunItem, "reference");

    if (!normalizeApiKeyInput(runSettings.apiKey) && !config.hasServerKey) {
      setError("请先在左下角设置里填写 API Key");
      setIsSettingsOpen(true);
      setStatus("failed");
      addEvent("无法生成", "请先填写 API Key");
      return;
    }
    if (!runSettings.prompt.trim()) {
      setError("请输入提示词");
      setStatus("failed");
      addEvent("无法生成", "请输入提示词");
      return;
    }
    if (localEditForRun?.aspectRatio && localEditForRun.aspectRatio !== runSettings.aspectRatio) {
      runSettings.aspectRatio = localEditForRun.aspectRatio;
      updateSetting("aspectRatio", localEditForRun.aspectRatio);
    }

    const taskId = makeResultId();
    const taskStartedAt = Date.now();
    setStatus("running");
    setError("");
    setTiming(null);
    setQuickTasks((current) => [...current, {
      id: taskId,
      status: "running",
      startedAt: taskStartedAt,
      modelLabel: runModel.label,
      imageSize: runSettings.imageSize,
      aspectRatio: runSettings.aspectRatio,
      prompt: runSettings.prompt
    }]);
    addEvent("提交", `${runModel.label} / ${runSettings.imageSize} / ${runSettings.aspectRatio}`);
    if (hasLocalEditConflict) {
      addEvent("局部回贴", "检测到多张局部图，本次只用第一张做回贴，其他图按普通参考图上传");
    }
    if (!primaryLocalEdit && ignoredLocalEditCount > 0) {
      addEvent("局部回贴", "只有图1会触发局部回贴，图2/图3不会切换成回贴模式");
    }
    if (primaryLocalEdit && quickPrimaryLocalIntent) {
      addEvent(
        "局部触发",
        quickPrimaryLocalIntent === "outfit"
          ? "已启用局部换装"
          : quickPrimaryLocalIntent === "appearance"
            ? "已启用局部换样貌"
            : "已启用局部精修"
      );
    } else if (wholeOutfitIntent) {
      addEvent("换装触发", "已启用整图换装姿势锁定");
    }

    const form = new FormData();
    form.set("baseUrl", runSettings.baseUrl);
    form.set("apiKey", normalizeApiKeyInput(runSettings.apiKey));
    const route = routingFields(runSettings.model, runSettings.channelId, config.routing);
    form.set("model", route.model);
    form.set("channelId", route.channelId);
    form.set("dispatchMode", route.dispatchMode);
    form.set("prompt", finalPrompt);
    form.set("imageSize", runSettings.imageSize);
    form.set("aspectRatio", runSettings.aspectRatio);
    form.set("n", String(runSettings.n));
    form.set("source", "quickgen");
    if (localEditForRun) form.set("deferAutoSave", "1");
    form.set("referenceMeta", JSON.stringify(runReferenceMeta));

    const started = performance.now();
    try {
      const uploadRunFiles = (!localEditForRun && runFiles.length > 0)
        ? [await ensureQuickUploadCanvasRatio(runFiles[0], runSettings.aspectRatio), ...runFiles.slice(1)]
        : runFiles;
      const normalizeForBanana2 = shouldNormalizeQuickUploadForModel(runSettings.model) && uploadRunFiles.length > 0 && !localEditForRun;
      const upload = await prepareImageFilesForChannel(uploadRunFiles, {
        forceJpeg: normalizeForBanana2,
        preserveFirstFile: Boolean(localEditForRun),
        preserveFirstFileMaxBytes: LOCAL_EDIT_CROP_UPLOAD_TARGET_BYTES
      });
      if (upload.compressedCount > 0) {
        addEvent("图片压缩", `已压缩 ${upload.compressedCount} 张参考图到 4MB 内`);
      }
      if (upload.normalizedCount > 0) {
        addEvent("香蕉2原图兼容", `已转换 ${upload.normalizedCount} 张参考图为兼容 JPEG`);
      }
      upload.files.forEach((file) => form.append("image", file, file.name));
      // 香蕉 Pro：参考图改走服务端的 JSON + image_urls 通道（对齐 3.0 的带图路径），
      // 这里额外附上 1536 长边的 JPEG data URL。其它模型不带这个字段，链路不变。
      if (JSON_IMAGE_URLS_MODELS.has(route.model) && upload.files.length > 0 && !localEditForRun?.maskDataUrl) {
        const compactUrls = await Promise.all(upload.files.map((file) => fileToCompactJpegDataUrl(file)));
        compactUrls.filter(Boolean).forEach((dataUrl) => form.append("referenceDataUrl", dataUrl));
      }
      const payload = await generateImages(form);
      if (!payload.images?.length) {
        throw new Error("接口返回成功，但没有解析到图片");
      }

      const totalMs = Number.isFinite(payload.timing?.totalMs) ? payload.timing.totalMs : performance.now() - started;
      const returnedItems = Array.isArray(payload.historyItems) && payload.historyItems.length > 0
        ? payload.historyItems
        : null;
      let nextResults = (returnedItems || payload.images).map((entry, index) => {
        const serverItem = returnedItems ? entry : null;
        return {
          ...serverItem,
          id: serverItem?.id || makeResultId(),
          image: serverItem?.image || entry,
          prompt: runSettings.prompt,
          modelLabel: runModel.label,
          imageSize: runSettings.imageSize,
          aspectRatio: runSettings.aspectRatio,
          referenceCount: runFiles.length,
          generationMs: totalMs,
          source: "quickgen",
          taskId,
          submittedAt: taskStartedAt + index,
          clientSessionId: CLIENT_SESSION_ID,
          createdAt: serverItem?.createdAt || taskStartedAt + index
        };
      });
      let clientAutoSavedCount = 0;
      if (localEditRunItem && localEditForRun) {
        const originalFile = quickReferenceOriginalFile(localEditRunItem);
        // 2026-09-25 对齐 3.0：贴回不再做任何后处理。
        // 原来按模型分派的 autoAlign / colorMatch / protectSkinAndFace / feather
        // 全部停用（3.0 localPaste.ts 明确"贴回就是贴回"）。
        // 这里保留一个空对象，调用点签名不变。
        const localCompositeOptions = {};
        nextResults = await Promise.all(nextResults.map(async (item) => {
          const generatedBlob = await blobFromImageItem(item);
          const composedBlob = await composeQuickLocalEditBlob(originalFile, generatedBlob, localEditForRun.cropRect, localEditForRun, localCompositeOptions);
          const dataUrl = await dataUrlFromBlob(composedBlob, "长图编码失败");
          return {
            ...item,
            image: { type: "b64_json", value: dataUrl, mimeType: "image/jpeg" },
          localEdit: {
            enabled: true,
            editMode: localEditForRun.editMode || LOCAL_EDIT_RECT_MODE,
            sourceName: originalFile?.name || "",
            cropRect: localEditForRun.cropRect,
            contextRect: localEditForRun.contextRect || null,
            sourceWidth: localEditForRun.sourceWidth,
            sourceHeight: localEditForRun.sourceHeight,
            maskBounds: localEditForRun.maskBounds || null
          }
          };
        }));
        clientAutoSavedCount = await autoSaveGeneratedItems(nextResults);
      }
      if (replaceResultId && nextResults[0]) {
        const replacement = {
          ...nextResults[0],
          id: replaceResultId,
          replacedFromResultId: nextResults[0].id
        };
        const extraResults = nextResults.slice(1);
        setResults((current) => [
          ...extraResults,
          ...current.map((item) => item.id === replaceResultId ? {
            ...replacement,
            submittedAt: item.submittedAt ?? replacement.submittedAt,
            createdAt: item.createdAt ?? replacement.createdAt
          } : item)
        ]);
        void removeHistoryResults([replaceResultId, ...nextResults.map((item) => item.id)])
          .then(() => saveHistoryResults([replacement, ...extraResults]));
      } else {
        setResults((current) => [...nextResults, ...current]);
        void saveHistoryResults(nextResults);
      }
      setTiming(payload.timing);
      setStatus("success");
      addEvent(replaceResultId ? "重刷完成" : "完成", `${replaceResultId ? "已原位覆盖，" : `生成 ${nextResults.length} 张，`}用时 ${formatMs(totalMs)}${autoSaveEventText(payload, localEditForRun ? clientAutoSavedCount : null)}`);
    } catch (err) {
      const message = normalizeGenerationErrorMessage(err);
      if (isAuthErrorMessage(message)) {
        setIsSettingsOpen(true);
      }
      setStatus("failed");
      setError(message);
      addEvent("失败", message);
    } finally {
      setQuickTasks((current) => current.filter((task) => task.id !== taskId));
    }
  }

  async function generateReferenceRemix(overrides = {}) {
    const runSettings = {
      ...referenceSettings,
      ...overrides,
      n: clampCount(overrides.n ?? referenceSettings.n),
      strength: clampReferenceStrength(overrides.strength ?? referenceSettings.strength)
    };
    const productFiles = [...referenceProductFiles];
    const styleFiles = [...referenceStyleFiles];
    const runFiles = [...productFiles, ...styleFiles];
    const runReferenceMeta = [
      ...referenceMetaFromFiles(productFiles, "product"),
      ...referenceMetaFromFiles(styleFiles, "style", productFiles.length)
    ];
    const runModel = models.find((item) => item.value === runSettings.model) || models[0];

    if (!normalizeApiKeyInput(settings.apiKey) && !config.hasServerKey) {
      setReferenceError("请先在左下角设置里填写 API Key");
      setIsSettingsOpen(true);
      setReferenceStatus("failed");
      return;
    }
    if (productFiles.length === 0) {
      setReferenceError("请先上传产品图，参考生图需要先锁定商品主体");
      setReferenceStatus("failed");
      addEvent("参考生图", "请先上传产品图");
      return;
    }

    const expandedPrompt = buildReferenceRemixPrompt(runSettings, productFiles.length, styleFiles.length);
    const taskId = makeResultId();
    const taskStartedAt = Date.now();
    setReferenceStatus("running");
    setReferenceError("");
    setReferenceTasks((current) => [...current, {
      id: taskId,
      status: "running",
      startedAt: taskStartedAt,
      modelLabel: runModel.label,
      imageSize: runSettings.imageSize,
      aspectRatio: runSettings.aspectRatio,
      prompt: expandedPrompt
    }]);
    addEvent("参考生图", `${runModel.label} / 参考值 ${runSettings.strength}% / ${runSettings.imageSize}`);

    const form = new FormData();
    form.set("baseUrl", config.defaultBaseUrl || defaultState.baseUrl);
    form.set("apiKey", normalizeApiKeyInput(settings.apiKey));
    const route = routingFields(runSettings.model, runSettings.channelId, config.routing);
    form.set("model", route.model);
    form.set("channelId", route.channelId);
    form.set("dispatchMode", route.dispatchMode);
    form.set("prompt", expandedPrompt);
    form.set("imageSize", runSettings.imageSize);
    form.set("aspectRatio", runSettings.aspectRatio);
    form.set("n", String(runSettings.n));
    form.set("source", "reference-remix");
    form.set("referenceMeta", JSON.stringify(runReferenceMeta));

    const started = performance.now();
    try {
      const upload = await prepareImageFilesForChannel(runFiles);
      if (upload.compressedCount > 0) {
        addEvent("图片压缩", `参考生图已压缩 ${upload.compressedCount} 张素材到 4MB 内`);
      }
      upload.files.forEach((file) => form.append("image", file, file.name));
      const payload = await generateImages(form);
      if (!payload.images?.length) {
        throw new Error("接口返回成功，但没有解析到图片");
      }

      const totalMs = Number.isFinite(payload.timing?.totalMs) ? payload.timing.totalMs : performance.now() - started;
      const returnedItems = Array.isArray(payload.historyItems) && payload.historyItems.length > 0
        ? payload.historyItems
        : null;
      const nextResults = (returnedItems || payload.images).map((entry, index) => {
        const serverItem = returnedItems ? entry : null;
        return {
          ...serverItem,
          id: serverItem?.id || makeResultId(),
          image: serverItem?.image || entry,
          prompt: expandedPrompt,
          displayPrompt: runSettings.prompt,
          modelLabel: runModel.label,
          imageSize: runSettings.imageSize,
          aspectRatio: runSettings.aspectRatio,
          referenceCount: runFiles.length,
          generationMs: totalMs,
          source: "reference-remix",
          referenceStrength: runSettings.strength,
          referenceControls: {
            element: runSettings.element,
            composition: runSettings.composition,
            scene: runSettings.scene
          },
          taskId,
          submittedAt: taskStartedAt + index,
          clientSessionId: CLIENT_SESSION_ID,
          createdAt: serverItem?.createdAt || taskStartedAt + index
        };
      });
      setResults((current) => [...nextResults, ...current]);
      void saveHistoryResults(nextResults);
      setReferenceStatus("success");
      addEvent("参考生图", `生成 ${nextResults.length} 张，用时 ${formatMs(totalMs)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthErrorMessage(message)) setIsSettingsOpen(true);
      setReferenceStatus("failed");
      setReferenceError(message);
      addEvent("参考生图失败", message);
    } finally {
      setReferenceTasks((current) => current.filter((task) => task.id !== taskId));
    }
  }

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
                  全部({imageCount + videoCount})
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
                  <Video size={14} /> 视频({videoCount})
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
                onClick={() => activeDetailGroup && openStitchPreview(activeDetailGroup)}
                disabled={!activeDetailGroup || activeDetailResults.length === 0}
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
              <span className={`taskBadge task-${detailStatus === "failed" ? "failed" : detailRunningCount > 0 || detailStatus === "planning" ? "running" : "success"}`}>
                {detailStatusText}
              </span>
            )}
            {activeView === "quickgen" && (
              <>
                {quickMode === "video" ? (
                  <>
                    <span className={`taskBadge task-${videoStatus === "failed" ? "failed" : runningVideoTasks.length > 0 ? "running" : videoStatus}`}>{latestVideoStatusText}</span>
                    <button className="toolbarButton" type="button" onClick={() => videoResults[0] && downloadVideoResult(videoResults[0])} disabled={videoResults.length === 0}>
                      <Download size={15} />
                      <span>下载最新</span>
                    </button>
                    <button className="dangerButton" type="button" onClick={clearVideoResults} disabled={videoResults.length === 0 && runningVideoTasks.length === 0}>
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
                <span className={`taskBadge task-${runningReferenceTasks.length > 0 ? "running" : referenceStatus}`}>
                  {referenceStatusText}
                </span>
                <button className="toolbarButton" type="button" onClick={clearAll} disabled={referenceResults.length === 0}>
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
            <OutfitWorkflow
              view={activeView}
              hostTheme={settings.theme}
              hostApiKey={settings.apiKey}
              onOpenHostSettings={openSettingsPanel}
            />
          </ErrorBoundary>
        ) : activeView === "image-editor" ? (
          <ErrorBoundary label="图片编辑">
            <ImageEditorPanel
              incomingImage={imageEditorSeed}
              onIncomingHandled={(id) => setImageEditorSeed((current) => current?.id === id ? null : current)}
              resolveDroppedFiles={imageFilesFromReferenceDrop}
              saveDirectory={saveDirectory}
              onChooseDirectory={openDirectoryModal}
              onOpenSaveDirectory={() => void openSaveDirectory()}
              onSaveMergedImage={saveProcessedImageFile}
              onAddEvent={addEvent}
            />
          </ErrorBoundary>
        ) : activeView === "detail-main" ? (
          <section className="detailWorkbench">
            <aside className="detailInputPanel">
              <div className="detailPanelScroll">
                <DetailUploadZone
                  title="产品图（包含模特图）"
                  subtitle={`最多 ${MAX_DETAIL_FILES} 张，优先放主商品、细节、模特图`}
                  previews={detailProductPreviews}
                  count={detailProductFiles.length}
                  maxCount={MAX_DETAIL_FILES}
                  inputRef={detailProductInputRef}
                  onPick={(event) => {
                    addDetailFiles("product", event.target.files);
                    event.target.value = "";
                  }}
                  onAddFiles={(fileList) => addDetailFiles("product", fileList)}
                  onRemove={(index) => removeDetailFile("product", index)}
                  onPreview={openUploadPreview}
                  onAssetLibrary={() => markDeferredFeature("素材库")}
                />

                <DetailUploadZone
                  title="参考图（设计风格参考）"
                  subtitle={`最多 ${MAX_DETAIL_FILES} 张，只参考风格、配色、版式`}
                  previews={detailReferencePreviews}
                  count={detailReferenceFiles.length}
                  maxCount={MAX_DETAIL_FILES}
                  inputRef={detailReferenceInputRef}
                  onPick={(event) => {
                    addDetailFiles("reference", event.target.files);
                    event.target.value = "";
                  }}
                  onAddFiles={(fileList) => addDetailFiles("reference", fileList)}
                  onRemove={(index) => removeDetailFile("reference", index)}
                  onPreview={openUploadPreview}
                  onAssetLibrary={() => markDeferredFeature("素材库")}
                />

                <div className="detailPresetRow">
                  <button className="smallButton" type="button" onClick={saveDetailPreset}>
                    <Save size={15} />
                    <span>保存预设</span>
                  </button>
                  <button className="smallButton" type="button" onClick={() => setIsDetailPresetOpen(true)}>
                    <FolderOpen size={15} />
                    <span>加载预设</span>
                  </button>
                </div>

                <div className="detailDivider" />

                <section className="detailFormSection">
                  {/* 2026-09-26：在「基础参数」标题行右侧加一个紧凑圆形渠道入口。
                      入口绝对定位（见 styles.css 的 .detailFormHeader / .channelPicker），
                      所以不新增整行控件、不改参数区高度；渠道列表走共享 ChannelPicker。 */}
                  <div className="detailFormHeader">
                    <h3>基础参数</h3>
                    <ChannelPicker
                      model={detailSettings.model}
                      modelLabel={detailModel?.label || detailSettings.model}
                      channelId={detailSettings.channelId}
                      routing={config.routing || config}
                      onChange={(channelId) => updateDetailSetting("channelId", channelId)}
                    />
                  </div>
                  <div className="detailParamGrid">
                    <label>
                      <span>工作流</span>
                      <select value={detailSettings.workflow} onChange={(event) => updateDetailSetting("workflow", event.target.value)}>
                        {workflowOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>图片模型</span>
                      <select value={detailSettings.model} onChange={(event) => updateDetailSetting("model", event.target.value)}>
                        {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>图片比例</span>
                      <select value={detailSettings.ratio} onChange={(event) => updateDetailSetting("ratio", event.target.value)}>
                        {detailRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>分辨率</span>
                      <select value={detailSettings.imageSize} onChange={(event) => updateDetailSetting("imageSize", event.target.value)}>
                        {detailSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>生成数量</span>
                      <select value={detailSettings.count} onChange={(event) => updateDetailSetting("count", event.target.value)}>
                        {COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}张</option>)}
                      </select>
                    </label>
                    <label>
                      <span>文案设置</span>
                      <select value={detailSettings.copywriting} onChange={(event) => updateDetailSetting("copywriting", event.target.value)}>
                        {copywritingOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>画面丰富</span>
                      <select value={detailSettings.richness} onChange={(event) => updateDetailSetting("richness", event.target.value)}>
                        {richnessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>字体风格</span>
                      <select value={detailSettings.fontStyle} onChange={(event) => updateDetailSetting("fontStyle", event.target.value)}>
                        {fontStyleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>模特设置</span>
                      <select value={detailSettings.modelMode} onChange={(event) => updateDetailSetting("modelMode", event.target.value)}>
                        {modelModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>模特姿势</span>
                      <select
                        value={detailSettings.modelPose}
                        disabled={detailSettings.modelMode !== "use-model"}
                        onChange={(event) => updateDetailSetting("modelPose", event.target.value)}
                      >
                        {modelPoseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>模特使用率</span>
                      <select
                        value={detailSettings.modelUsage}
                        disabled={detailSettings.modelMode !== "use-model"}
                        onChange={(event) => updateDetailSetting("modelUsage", event.target.value)}
                      >
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                          <option key={count} value={count}>{count}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>插入反转屏</span>
                      <select value={detailSettings.reverseScreens} onChange={(event) => updateDetailSetting("reverseScreens", event.target.value)}>
                        {Array.from({ length: 5 }, (_, index) => index).map((count) => (
                          <option key={count} value={count}>{count}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>输出语种</span>
                      <input value={detailSettings.lang} onChange={(event) => updateDetailSetting("lang", event.target.value)} />
                    </label>
                  </div>
                </section>

                <div className="detailDivider" />

                <section className="detailFormSection">
                  <h3>内容输入（可选）</h3>
                  <label className="detailField">
                    <span>产品名称</span>
                    <input
                      value={detailSettings.productName}
                      onChange={(event) => updateDetailSetting("productName", event.target.value)}
                      placeholder="例：女装假两件上衣"
                    />
                  </label>
                  <label className="detailField">
                    <span>产品特征</span>
                    <textarea
                      value={detailSettings.productFeature}
                      onChange={(event) => updateDetailSetting("productFeature", event.target.value)}
                      placeholder="产品大小，尺寸，特征信息用于锁死产品一致性（可不输入）"
                    />
                  </label>
                  <label className="detailField">
                    <span className="detailFieldTitle">
                      <b>用户指令</b>
                      <button type="button" onClick={() => setIsPromptAssistantOpen(true)}>
                        <BookOpen size={13} />
                        提示词助手
                      </button>
                    </span>
                    <textarea
                      value={detailSettings.userInstruction}
                      onChange={(event) => updateDetailSetting("userInstruction", event.target.value)}
                      placeholder="用户指令：屏数、风格、图1/2/3 用法等"
                    />
                  </label>
                  <label className="detailField">
                    <span>卖点</span>
                    <textarea
                      value={detailSettings.sellingPoints}
                      onChange={(event) => updateDetailSetting("sellingPoints", event.target.value)}
                      placeholder="每行一个卖点，可留空"
                    />
                  </label>
                </section>
              </div>

              <div className="detailPanelFooter">
                <button
                  className="generateButton"
                  type="button"
                  disabled={detailStatus === "planning"}
                  onClick={() => void createDetailPromptPlan()}
                >
                  {detailStatus === "planning" ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                  <span>{detailStatus === "planning" ? "分析中..." : "生成分段提示词"}</span>
                </button>
              </div>
            </aside>

            <section className={`detailResultBoard ${detailInfoItem ? "withInfo" : ""}`}>
              <div className="detailBoardMain">
                {detailGroups.length === 0 ? (
                  <div className="detailEmpty">
                    <FileText size={34} />
                    <span>上传产品图后，点击「生成分段提示词」开始</span>
                  </div>
                ) : (
                  <>
                    <div className="detailGroupTabs">
                      <div>
                        {detailGroups.map((group, index) => (
                          <button
                            className={activeDetailGroup?.id === group.id ? "active" : ""}
                            key={group.id}
                            type="button"
                            onClick={() => {
                              setActiveDetailGroupId(group.id);
                              setDetailInfoSelection(null);
                            }}
                          >
                            分组 #{detailGroups.length - index}
                          </button>
                        ))}
                      </div>
                      <div className="detailViewControls">
                        <label>
                          <span>每行展示</span>
                          <select value={detailColumns} onChange={(event) => setDetailColumns(Number(event.target.value))}>
                            {[2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count}</option>)}
                          </select>
                        </label>
                        <button
                          className={`switchButton ${detailForwardSort ? "active" : ""}`}
                          type="button"
                          onClick={() => setDetailForwardSort((current) => !current)}
                        >
                          <span>正向排序</span>
                          <i />
                        </button>
                      </div>
                    </div>

                    {activeDetailGroup && (
                      <article className="detailGroup" key={activeDetailGroup.id}>
                        <header className="detailGroupHeader">
                          <div>
                            <strong>{activeDetailGroup.label}</strong>
                            <span>
                              {activeDetailGroup.params.platform}{activeDetailGroup.params.pageType} ·
                              {activeDetailGroup.params.model} · {activeDetailGroup.params.ratio} · {activeDetailGroup.params.imageSize} ·
                              已出图 {activeDetailResults.length} 屏
                            </span>
                          </div>
                          <div className="detailGroupActions">
                            <button
                              className="smallButton"
                              type="button"
                              onClick={() => markDeferredFeature("切换模型")}
                            >
                              <Settings size={14} />
                              <span>切换模型</span>
                            </button>
                            <button className="smallButton" type="button" onClick={() => downloadDetailGroup(activeDetailGroup)}>
                              <Download size={14} />
                              <span>下载全部</span>
                            </button>
                            <button className="smallButton" type="button" disabled={selectedCount === 0} onClick={() => downloadDetailGroup(activeDetailGroup, true)}>
                              <Download size={14} />
                              <span>下载选中</span>
                            </button>
                            <button
                              className="generateButton"
                              type="button"
                              onClick={() => void generateDetailGroup(activeDetailGroup.id)}
                            >
                              {detailRunningCount > 0 ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                              <span>批量生成</span>
                            </button>
                          </div>
                        </header>

                        <section className="detailPromptConfirm">
                          <header>
                            <div>
                              <strong>分段提示词确认</strong>
                              <span>确认每一屏内容无误后，再点击批量生成或单屏生成。</span>
                            </div>
                          </header>
                          <div className="detailPromptGrid">
                            {visibleDetailPrompts.map((prompt) => (
                              <article className={`detailPromptCard ${prompt.status}`} key={`${activeDetailGroup.id}-${prompt.screen}`}>
                                <header>
                                  <label className="detailCheck">
                                    <input
                                      type="checkbox"
                                      checked={prompt.enabled}
                                      onChange={() => toggleDetailPrompt(activeDetailGroup.id, prompt.screen)}
                                    />
                                    <span>第{prompt.screen}屏</span>
                                  </label>
                                  <small>{prompt.intervention}</small>
                                </header>
                                <h3>{prompt.title}</h3>
                                <p>{prompt.summary}</p>
                                {prompt.referenceStrategy && <small>{prompt.referenceStrategy}</small>}
                                <StableTextarea
                                  value={prompt.text}
                                  onChange={(event) => updateDetailPrompt(activeDetailGroup.id, prompt.screen, { text: event.target.value })}
                                />
                                <div className="detailPromptActions">
                                  <button className="smallButton" type="button" onClick={() => void copyText(prompt.text, `第${prompt.screen}屏提示词已复制`)}>
                                    <Copy size={14} />
                                    <span>复制</span>
                                  </button>
                                  <button className="smallButton" type="button" onClick={() => applyDetailPromptToQuickgen(prompt)}>
                                    <Sparkles size={14} />
                                    <span>推送</span>
                                  </button>
                                  <button
                                    className="smallButton"
                                    type="button"
                                    disabled={prompt.status === "running"}
                                    onClick={() => void generateDetailPrompt(activeDetailGroup, prompt, prompt.screen)}
                                  >
                                    {prompt.status === "running" ? <Loader2 className="spin" size={14} /> : <Play size={14} />}
                                    <span>生成</span>
                                  </button>
                                </div>
                                {(prompt.generationMs || prompt.status === "failed") && (
                                  <div className="detailPromptStatus">
                                    {prompt.generationMs && <span>用时 {formatMs(prompt.generationMs)}</span>}
                                    {prompt.error && <strong>{prompt.error}</strong>}
                                  </div>
                                )}
                              </article>
                            ))}
                          </div>
                        </section>

                        {activeDetailResults.length > 0 && (
                          <section className="detailImageSection">
                            <header>
                              <div>
                                <strong>生成分屏</strong>
                                <span>左键点击查看信息，按住拖拽调整拼图顺序，右键打开图片操作。</span>
                              </div>
                            </header>
                            <div className="detailScreensGrid" style={{ "--detail-columns": detailColumns }}>
                              {activeDetailResults.map(({ prompt, result }, resultIndex) => {
                                const src = imageSourceFromResult(result.image);
                                const selected = selectedIds.has(result.id);
                                return (
                                  <article
                                    className={`detailScreenCard ${detailInfoSelection?.resultId === result.id ? "selected" : ""} ${detailDragScreen?.screen === prompt.screen ? "dragging" : ""}`}
                                    key={result.id}
                                    draggable
                                    onDragStart={(event) => beginDetailScreenDrag(event, activeDetailGroup.id, prompt.screen)}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={(event) => dropDetailScreen(event, activeDetailGroup.id, prompt.screen)}
                                    onDragEnd={endDetailScreenDrag}
                                  >
                                    <header>
                                      <span>{String(resultIndex + 1).padStart(2, "0")}</span>
                                      <i>⋮</i>
                                    </header>
                                    <button
                                      className="detailScreenSelect"
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        toggleSelected(result.id);
                                      }}
                                      aria-label="选择分屏图片"
                                    >
                                      {selected ? <CheckSquare size={18} /> : <Square size={18} />}
                                    </button>
                                    <button
                                      className="detailScreenImage"
                                      type="button"
                                      draggable={false}
                                      onClick={() => {
                                        selectDetailResult(activeDetailGroup, prompt, result);
                                        openPreview(result);
                                      }}
                                      onContextMenu={(event) => openContextMenu(event, result.id)}
                                    >
                                      <CachedImage
                                        src={src}
                                        alt={`第${prompt.screen}屏结果`}
                                        draggable
                                        onDragStart={(event) => beginResultImageDrag(event, result, resultIndex)}
                                        diagnostic={{ requestId: result.requestId || result.id, endpoint: "/api/images", module: "一键详情", placement: `detail-screen-${prompt.screen}` }}
                                      />
                                    </button>
                                    <button
                                      className="detailScreenPrompt"
                                      type="button"
                                      onClick={() => void copyText(prompt.text, `第${prompt.screen}屏提示词已复制`)}
                                      title={prompt.text}
                                    >
                                      {prompt.text}
                                    </button>
                                    <div className="detailReferenceTray">
                                      <ReferenceThumbTray references={result.references} count={result.referenceCount} max={5} onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
                                      <button type="button" onClick={() => markDeferredFeature("追加参考图")}>
                                        <Plus size={13} />
                                      </button>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </section>
                        )}
                      </article>
                    )}
                  </>
                )}
              </div>

              {detailInfoItem && (
                <aside className="detailInfoPanel">
                  <header>
                    <div>
                      <strong>生图信息</strong>
                      <span>第{detailInfoItem.prompt.screen}屏 · {detailInfoItem.prompt.title}</span>
                    </div>
                    <button className="iconButton" type="button" onClick={() => setDetailInfoSelection(null)} aria-label="关闭">
                      <X size={16} />
                    </button>
                  </header>
                  <button
                    className="detailInfoPreview"
                    type="button"
                    onClick={() => openPreview(detailInfoItem.result)}
                    onContextMenu={(event) => openContextMenu(event, detailInfoItem.result.id)}
                  >
                    <CachedImage
                      src={imageSourceFromResult(detailInfoItem.result.image)}
                      alt="详情分屏预览"
                      draggable
                      onDragStart={(event) => beginResultImageDrag(event, detailInfoItem.result)}
                      diagnostic={{ requestId: detailInfoItem.result.requestId || detailInfoItem.result.id, endpoint: "/api/images", module: "一键详情", placement: "detail-info" }}
                    />
                  </button>
                  <div className="detailInfoMeta">
                    <span>模型</span><strong>{detailInfoItem.result.modelLabel}</strong>
                    <span>尺寸</span><strong>{detailInfoItem.result.imageSize} · {detailInfoItem.result.aspectRatio}</strong>
                    <span>参考图</span><strong>{detailInfoItem.result.referenceCount} 张</strong>
                    <span>用时</span><strong>{detailInfoItem.result.generationMs ? formatMs(detailInfoItem.result.generationMs) : "--"}</strong>
                    <span>状态</span><strong>{detailInfoItem.prompt.status === "success" ? "已完成" : detailInfoItem.prompt.status}</strong>
                  </div>
                  <section className="detailInfoReferences">
                    <span>本张参考图</span>
                    <ReferenceThumbTray references={detailInfoItem.result.references} count={detailInfoItem.result.referenceCount} max={6} onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
                  </section>
                  <label className="detailInfoPrompt">
                    <span>提示词</span>
                    <textarea value={detailInfoItem.prompt.text} readOnly />
                  </label>
                  <div className="detailInfoActions">
                    <button className="smallButton" type="button" onClick={() => void copyText(detailInfoItem.prompt.text, "提示词已复制")}>
                      <Copy size={14} />
                      <span>复制提示词</span>
                    </button>
                    <button className="smallButton" type="button" onClick={() => rerunResult(detailInfoItem.result, 1)}>
                      <RotateCcw size={14} />
                      <span>重刷</span>
                    </button>
                    <button className="smallButton" type="button" onClick={() => void downloadItem(detailInfoItem.result, 0)}>
                      <Download size={14} />
                      <span>下载</span>
                    </button>
                  </div>
                </aside>
              )}

              {events.length > 0 && (
                <div className="eventPill">
                  <strong>{events[0].label}</strong>
                  <span>{events[0].detail}</span>
                </div>
              )}
            </section>
          </section>
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
          <section className="referenceWorkbench">
            <aside className="referenceInputPanel">
              <div className="detailPanelScroll">
                <DetailUploadZone
                  title="产品图（主体锁定）"
                  subtitle={`产品图 + 参考图合计最多 ${MAX_REFERENCE_REWRITE_FILES} 张`}
                  previews={referenceProductPreviews}
                  count={referenceProductFiles.length + referenceStyleFiles.length}
                  maxCount={MAX_REFERENCE_REWRITE_FILES}
                  inputRef={referenceProductInputRef}
                  onPick={(event) => {
                    addReferenceRewriteFiles("product", event.target.files);
                    event.target.value = "";
                  }}
                  onAddFiles={(fileList) => addReferenceRewriteFiles("product", fileList)}
                  onRemove={(index) => removeReferenceRewriteFile("product", index)}
                  onPreview={openUploadPreview}
                  onAssetLibrary={() => markDeferredFeature("素材库")}
                />

                <DetailUploadZone
                  title="参考图（运营参考）"
                  subtitle={`元素、构图、场景方向 · 与产品图合计最多 ${MAX_REFERENCE_REWRITE_FILES} 张`}
                  previews={referenceStylePreviews}
                  count={referenceProductFiles.length + referenceStyleFiles.length}
                  maxCount={MAX_REFERENCE_REWRITE_FILES}
                  inputRef={referenceStyleInputRef}
                  onPick={(event) => {
                    addReferenceRewriteFiles("style", event.target.files);
                    event.target.value = "";
                  }}
                  onAddFiles={(fileList) => addReferenceRewriteFiles("style", fileList)}
                  onRemove={(index) => removeReferenceRewriteFile("style", index)}
                  onPreview={openUploadPreview}
                  onAssetLibrary={() => markDeferredFeature("素材库")}
                />

                <div className="detailDivider" />

                <section className="detailFormSection">
                  {/* 2026-09-26：参考生图的渠道入口与「参考控制」参数区同一行，
                      与快捷生成/一键详情共用 src/shared/ui/ChannelPicker.jsx；
                      渠道状态保存在本页自己的 referenceSettings.channelId 里，互不污染。 */}
                  <div className="detailFormHeader">
                    <h3>参考控制</h3>
                    <ChannelPicker
                      model={referenceSettings.model}
                      modelLabel={referenceModel?.label || referenceSettings.model}
                      channelId={referenceSettings.channelId}
                      routing={config.routing || config}
                      onChange={(channelId) => updateReferenceSetting("channelId", channelId)}
                    />
                  </div>
                  <div className="detailParamGrid">
                    <label>
                      <span>图片模型</span>
                      <select value={referenceSettings.model} onChange={(event) => updateReferenceSetting("model", event.target.value)}>
                        {models.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>图片比例</span>
                      <select value={referenceSettings.aspectRatio} onChange={(event) => updateReferenceSetting("aspectRatio", event.target.value)}>
                        {referenceRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>分辨率</span>
                      <select value={referenceSettings.imageSize} onChange={(event) => updateReferenceSetting("imageSize", event.target.value)}>
                        {referenceSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>生成数量</span>
                      <select value={referenceSettings.n} onChange={(event) => updateReferenceSetting("n", event.target.value)}>
                        {COUNT_OPTIONS.map((count) => <option key={count} value={count}>{count}张</option>)}
                      </select>
                    </label>
                    <label>
                      <span>参考值</span>
                      <select value={referenceSettings.strength} onChange={(event) => updateReferenceSetting("strength", event.target.value)}>
                        {REFERENCE_STRENGTH_OPTIONS.map((value) => <option key={value} value={value}>{value}%</option>)}
                      </select>
                    </label>
                    <label>
                      <span>参考元素</span>
                      <select value={referenceSettings.element} onChange={(event) => updateReferenceSetting("element", event.target.value)}>
                        {referenceControlOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>参考构图</span>
                      <select value={referenceSettings.composition} onChange={(event) => updateReferenceSetting("composition", event.target.value)}>
                        {referenceControlOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>参考场景主题</span>
                      <select value={referenceSettings.scene} onChange={(event) => updateReferenceSetting("scene", event.target.value)}>
                        {referenceControlOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="detailFormSection">
                  <div className="referencePromptHeader">
                    <h3>整体提示词</h3>
                    <button className="smallButton" type="button" onClick={() => void applySmartReferencePrompt()} disabled={isReferencePromptRewriting}>
                      {isReferencePromptRewriting ? <Loader2 className="spin" size={15} /> : <Wand2 size={15} />}
                      <span>智能扩写提示词</span>
                    </button>
                  </div>
                  <label className="detailField">
                    <span>生成要求</span>
                    <StableTextarea
                      value={referenceSettings.prompt}
                      onChange={(event) => updateReferenceSetting("prompt", event.target.value)}
                      placeholder="例：生成一张女装主图，浅色调，干净电商质感，突出面料和版型，不要照抄参考图文字。"
                    />
                  </label>
                  <p className="referenceHint">
                    30% 以下参考意义很弱，所以这里从 30% 起步；参考越高越接近运营图方向，但后台会强制避开照抄、品牌、水印和相同文字。
                  </p>
                </section>
              </div>

              <div className="detailPanelFooter">
                <button className="generateButton" type="button" onClick={() => void generateReferenceRemix()}>
                  {runningReferenceTasks.length > 0 ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                  <span>生成参考图</span>
                </button>
              </div>
            </aside>

            <section className="referenceResultBoard">
              <header className="referenceBoardHeader">
                <div>
                  <strong>参考生图结果</strong>
                  <span>结果只保存在参考生图模块，不进入快捷生成和一键详情分屏。</span>
                </div>
              </header>

              <div className="referenceGallery">
                {referenceGalleryItems.map((galleryItem, index) => {
                  if (galleryItem.kind === "task") {
                    const task = galleryItem.task;
                    return (
                      <article className="assetCard loadingCard referenceAssetCard" key={galleryItem.key}>
                        <Loader2 className="spin" size={28} />
                        <span>参考生图中</span>
                        <strong><ElapsedTimer startedAt={task.startedAt} /></strong>
                        <em>{task.modelLabel} · {task.imageSize} · {task.aspectRatio}</em>
                      </article>
                    );
                  }
                  const item = galleryItem.result;
                  const src = imageSourceFromResult(item.image);
                  const promptText = item.displayPrompt || item.prompt;
                  return (
                    <article
                      className="assetCard referenceAssetCard"
                      key={galleryItem.key}
                      onClick={() => openPreview(item)}
                      onContextMenu={(event) => openContextMenu(event, item.id)}
                    >
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
                      {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
                      <CachedImage src={src} alt={`参考生图 ${index + 1}`} draggable onDragStart={(event) => beginResultImageDrag(event, item, index)} diagnostic={{ requestId: item.requestId || item.id, endpoint: "/api/images", module: "参考生图", placement: "reference-card" }} />
                      <ReferenceThumbTray references={item.references} count={item.referenceCount} className="assetReferenceTray" onOpen={openReferencePreview} onContextMenu={openReferenceContextMenu} onImageDragStart={beginReferenceImageDrag} />
                      {promptText && (
                        <button
                          className="assetPrompt"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            copyText(promptText, "提示词已复制");
                          }}
                          title={promptText}
                        >
                          {promptText}
                        </button>
                      )}
                      <div className="assetMeta">
                        <span>{item.modelLabel}</span>
                        <strong>{item.referenceStrength || referenceSettings.strength}% · {item.imageSize}</strong>
                      </div>
                    </article>
                  );
                })}
              </div>

              {referenceResults.length === 0 && runningReferenceTasks.length === 0 && (
                <div className="referenceEmpty">
                  <Layers size={34} />
                  <span>{referenceStatus === "failed" ? referenceError : "上传产品图和运营参考图后开始生成"}</span>
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
        ) : activeView === "quickgen" && quickMode === "video" ? (
        <div className="canvasBoard videoCanvasBoard">
          <section className="galleryStrip videoGalleryStrip" style={{ "--asset-card-min": `${Math.round(236 * galleryZoom)}px` }}>
            {videoTasks.map((task) => (
              <article className="assetCard loadingCard videoAssetCard" key={task.id}>
                <Loader2 className="spin" size={28} />
                <span>{task.statusText || "视频生成中"}</span>
                <strong><ElapsedTimer startedAt={task.startedAt} /></strong>
                <em>{task.modelLabel} · {task.resolution} · {task.aspectRatio} · {task.duration}s</em>
              </article>
            ))}
            {videoResults.map((item) => (
              <article className="assetCard videoAssetCard" key={item.id}>
                <button
                  className="assetDownloadButton"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    downloadVideoResult(item);
                  }}
                  title="下载视频"
                  aria-label="下载视频"
                >
                  <Download size={16} />
                </button>
                {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
                <video src={item.url} controls preload="metadata" />
                {item.prompt && (
                  <button
                    className="assetPrompt"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      copyText(item.prompt, "视频提示词已复制");
                    }}
                    title={item.prompt}
                  >
                    {item.prompt}
                  </button>
                )}
                <div className="assetMeta">
                  <span>{item.modelLabel}</span>
                  <strong>{item.resolution} · {item.aspectRatio} · {item.duration}s</strong>
                </div>
              </article>
            ))}
          </section>

          {videoResults.length === 0 && runningVideoTasks.length === 0 && (
            <div className="emptyCanvas">
              <Video size={34} />
              <span>{videoStatus === "failed" ? videoError : "暂无视频"}</span>
            </div>
          )}

          <section
            className={`composer videoComposer ${isComposerDragging ? "dragging" : ""}`}
            onDragOver={onVideoComposerDragOver}
            onDragLeave={onComposerDragLeave}
            onDrop={onVideoComposerDrop}
            onPaste={onComposerPaste}
          >
            {videoPriceText && <span className="videoPriceBadge">{videoPriceText}</span>}
            {/* 2026-09-25 UI 调整：同一组「图片生成 / 视频生成」页签在视频悬浮框里也删掉，
                切回图片模式仍然可以走顶部结果栏的「全部 / 图片」按钮。 */}

            <div className="videoReferenceLine">
              <input ref={videoReferenceInputRef} type="file" accept="image/*" onChange={onPickVideoReference} />
              <button className="videoReferenceTile" type="button" onClick={() => videoReferenceInputRef.current?.click()}>
                {videoReferencePreview ? (
                  <>
                    <img src={videoReferencePreview.url} alt={videoReferencePreview.file.name} />
                    <span>{videoReferencePreview.file.name}</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    <span>参考图</span>
                  </>
                )}
              </button>
              <input
                className="videoUrlInput"
                value={videoSettings.imageUrl}
                onChange={(event) => updateVideoSetting("imageUrl", event.target.value)}
                placeholder="图片参考 URL，可留空"
              />
              {(videoReferenceFile || videoSettings.imageUrl) && (
                <button className="smallButton" type="button" onClick={() => { setVideoReferenceFile(null); updateVideoSetting("imageUrl", ""); }}>
                  <Trash2 size={15} />
                  <span>清空参考</span>
                </button>
              )}
            </div>

            <StableTextarea
              className="promptBox videoPromptBox"
              value={videoSettings.prompt}
              onChange={(event) => updateVideoSetting("prompt", event.target.value)}
              placeholder={videoPromptHint}
            />

            <div className="composerFooter">
              <div className="leftTools">
                <button className="smallButton" type="button" onClick={() => setIsPromptAssistantOpen(true)}>
                  <BookOpen size={16} />
                  <span>词</span>
                </button>
                <button
                  className={`smallButton ${videoSettings.outputAudio ? "active" : ""}`}
                  type="button"
                  onClick={() => updateVideoSetting("outputAudio", !videoSettings.outputAudio)}
                >
                  <Flame size={16} />
                  <span>{videoSettings.outputAudio ? "音频开" : "音频关"}</span>
                </button>
                {videoBillingRequired && !billingGatewayEnabled && <span className="videoBillingBadge">计费未接入</span>}
              </div>

              <div className="rightTools videoRightTools">
                <select value={videoSettings.model} onChange={(event) => updateVideoSetting("model", event.target.value)}>
                  {videoModels.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
                </select>
                <select value={videoSettings.aspectRatio} onChange={(event) => updateVideoSetting("aspectRatio", event.target.value)}>
                  {videoRatios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
                <select value={videoSettings.resolution} onChange={(event) => updateVideoSetting("resolution", event.target.value)}>
                  {videoResolutions.map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
                </select>
                <select value={videoSettings.duration} onChange={(event) => updateVideoSetting("duration", event.target.value)}>
                  {videoDurations.map((duration) => <option key={duration} value={duration}>{duration}s</option>)}
                </select>
                <button
                  className="generateButton"
                  type="button"
                  onClick={() => void generateVideoFromComposer()}
                  disabled={runningVideoTasks.length > 0}
                >
                  {runningVideoTasks.length > 0 ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
                  <span>生成视频</span>
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

      {isDetailPresetOpen && (
        <div className="modalLayer" onMouseDown={() => setIsDetailPresetOpen(false)}>
          <section className="detailPresetModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>加载详情预设</h2>
                <span>恢复一键详情/主图的参数与文案</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setIsDetailPresetOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div className="detailPresetList">
              {detailPresets.map((preset) => (
                <article className="detailPresetItem" key={preset.id}>
                  <button type="button" onClick={() => loadDetailPreset(preset)}>
                    <strong>{preset.name}</strong>
                    <span>{new Date(preset.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                  </button>
                  <button className="iconButton" type="button" onClick={() => deleteDetailPreset(preset.id)} title="删除预设">
                    <Trash2 size={15} />
                  </button>
                </article>
              ))}
              {detailPresets.length === 0 && <p className="promptEmpty">还没有保存过详情预设</p>}
            </div>
          </section>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modalLayer" onMouseDown={() => setIsSettingsOpen(false)}>
          <section className="settingsModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>设置</h2>
                <span>API Key 与界面皮肤</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setIsSettingsOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>

            <label className="modalField">
              <span><KeyRound size={15} /> API Key</span>
              <div className="apiKeyRow">
                <input
                  type={isApiKeyVisible ? "text" : "password"}
                  value={settings.apiKey}
                  placeholder={config.hasServerKey ? "服务器已配置" : "sk-..."}
                  onChange={(event) => updateSetting("apiKey", event.target.value)}
                />
                <button
                  className="iconButton"
                  type="button"
                  onClick={() => setIsApiKeyVisible((current) => !current)}
                  title={isApiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
                >
                  {isApiKeyVisible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
                <button className="smallButton saveKeyButton" type="button" onClick={saveApiKey}>
                  <Save size={15} />
                  <span>保存</span>
                </button>
              </div>
              {apiSaveStatus && <small className="fieldHint">{apiSaveStatus}</small>}
            </label>

            <div className="skinBlock">
              <span><Palette size={15} /> 皮肤</span>
              <div className="themeGrid">
                {themeOptions.map((theme) => (
                  <button
                    className={`themeButton ${settings.theme === theme.value ? "selected" : ""}`}
                    key={theme.value}
                    type="button"
                    onClick={() => updateSetting("theme", theme.value)}
                  >
                    <i>
                      {theme.colors.map((color) => <b key={color} style={{ backgroundColor: color }} />)}
                    </i>
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

            <div className="debugBlock storageBlock">
              <span><HardDrive size={15} /> 数据与存储</span>
              <p>
                生成的图片、上传的参考图和日志都保存在本机数据目录，<strong>不在安装包内</strong>。
                清理会直接删除磁盘文件，无法撤销。
              </p>
              {storageUsage ? (
                <>
                  <div className="storagePathRow">
                    <code title={storageUsage.dataDir}>{storageUsage.dataDir}</code>
                    <button className="smallButton" type="button" onClick={() => void handleRevealStorage("data")}>
                      <FolderOpen size={15} />
                      <span>打开目录</span>
                    </button>
                  </div>
                  <ul className="storageList">
                    {(storageUsage.items || []).map((item) => (
                      <li key={item.key}>
                        <span>{item.label}</span>
                        <em>{item.files} 个 / {formatStorageSize(item.bytes)}</em>
                      </li>
                    ))}
                    <li>
                      <span>历史记录条数</span>
                      <em>{storageUsage.historyCount} 条</em>
                    </li>
                  </ul>
                </>
              ) : (
                <small className="fieldHint">正在读取存储用量…</small>
              )}
              <div className="debugActions">
                <button
                  className="smallButton"
                  type="button"
                  disabled={Boolean(storageBusy)}
                  onClick={() => void handleCleanStorage(["historyImages"], "历史图片（含历史清单）")}
                >
                  <Trash2 size={15} />
                  <span>清理历史图片</span>
                </button>
                <button
                  className="smallButton"
                  type="button"
                  disabled={Boolean(storageBusy)}
                  onClick={() => void handleCleanStorage(["references"], "参考图缓存")}
                >
                  <Trash2 size={15} />
                  <span>清理参考图</span>
                </button>
                <button
                  className="smallButton"
                  type="button"
                  disabled={Boolean(storageBusy)}
                  onClick={() => void handleCleanStorage(["results", "canvasAssets"], "结果图缓存")}
                >
                  <Trash2 size={15} />
                  <span>清理结果缓存</span>
                </button>
                <button className="smallButton" type="button" onClick={() => void refreshStorageUsage()}>
                  <RefreshCw size={15} />
                  <span>刷新</span>
                </button>
              </div>
              {storageStatus && <small className="fieldHint">{storageStatus}</small>}
            </div>
          </section>
        </div>
      )}

      {isPromptAssistantOpen && (
        <div className="modalLayer promptLayer" onMouseDown={() => setIsPromptAssistantOpen(false)}>
          <section className="promptAssistantModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>提示词助手</h2>
              <button className="iconButton" type="button" onClick={() => setIsPromptAssistantOpen(false)} aria-label="关闭">
                <X size={18} />
              </button>
            </header>
            <div className="promptAssistantBody">
              <div className="promptTabs">
                {promptCategories.map((category) => (
                  <span className="promptCategoryItem" key={category}>
                    <button
                      className={[
                        "promptTab",
                        promptCategory === category ? "active" : "",
                        promptDropCategory === category ? "dropTarget" : "",
                        draggedPromptCategory === category ? "categoryDragging" : "",
                        promptCategoryDropTarget?.category === category ? `categoryDrop-${promptCategoryDropTarget.edge}` : ""
                      ].filter(Boolean).join(" ")}
                      type="button"
                      draggable={category !== "全部"}
                      onClick={() => setPromptCategory(category)}
                      onDoubleClick={(event) => {
                        if (category === "全部") return;
                        event.preventDefault();
                        event.stopPropagation();
                        renamePromptCategory(category);
                      }}
                      onDragStart={(event) => beginPromptCategoryDrag(event, category)}
                      onDragEnd={endPromptCategoryDrag}
                      onDragOver={(event) => dragPromptCategoryOver(event, category)}
                      onDragLeave={() => {
                        setPromptDropCategory("");
                        setPromptCategoryDropTarget(null);
                      }}
                      onDrop={(event) => dropOnPromptCategory(event, category)}
                      title={category === "全部" ? "全部分类" : "双击改名，按住拖动调整顺序"}
                    >
                      {category}
                    </button>
                    {category !== "全部" && (
                      <button
                        className="promptCategoryDelete"
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          deletePromptCategory(category);
                        }}
                        title={`删除分类「${category}」`}
                        aria-label={`删除分类${category}`}
                      >
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
                <button className="promptTab promptCategoryAdd" type="button" onClick={addPromptCategory} title="新建分类">
                  <Plus size={13} />
                  <span>新建</span>
                </button>
              </div>
              <label className="promptSearch">
                <Search size={16} />
                <input
                  value={promptSearch}
                  onChange={(event) => setPromptSearch(event.target.value)}
                  placeholder="搜索标题或内容..."
                />
              </label>
              <button className="newPromptButton" type="button" onClick={openNewPromptEditor}>
                <Plus size={15} />
                <span>新建提示词</span>
              </button>
              <div className="promptPresetGrid">
                {filteredPromptPresets.map((preset) => (
                  <div
                    className={`promptChip ${draggedPromptId === preset.id ? "dragging" : ""}`}
                    key={preset.id}
                    draggable
                    onDragStart={(event) => beginPromptDrag(event, preset.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropPromptOnPreset(event, preset.id)}
                    onDragEnd={endPromptDrag}
                  >
                    <button
                      className="promptChipMain"
                      type="button"
                      onClick={() => applyPromptPreset(preset)}
                      title={preset.content}
                    >
                      {preset.title}
                    </button>
                    <button className="promptChipIcon" type="button" onClick={() => editPromptPreset(preset)} title="编辑提示词">
                      <Pencil size={14} />
                    </button>
                    <button className="promptChipIcon" type="button" onClick={() => deletePromptPreset(preset)} title="删除">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {filteredPromptPresets.length === 0 && <p className="promptEmpty">没有找到匹配的提示词</p>}
              </div>
            </div>
          </section>
        </div>
      )}

      {editingPrompt && (
        <div className="modalLayer promptEditorLayer" onMouseDown={() => setEditingPrompt(null)}>
          <section className="promptEditorModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <h2>编辑提示词</h2>
              <button className="iconButton" type="button" onClick={() => setEditingPrompt(null)} aria-label="关闭">
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
              <button className="dangerButton editorDeleteButton" type="button" onClick={() => deletePromptPreset(editingPrompt)}>
                删除
              </button>
              <div>
                <button className="smallButton" type="button" onClick={() => setEditingPrompt(null)}>取消</button>
                <button className="generateButton editorSaveButton" type="button" onClick={saveEditingPrompt}>保存</button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {stitchPreview && stitchGroup && (
        <div className="modalLayer stitchLayer" onMouseDown={closeStitchPreview}>
          <section className="stitchPreviewModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>拼图预览</h2>
                <span>{stitchGroup.label} · 共 {stitchItems.length} 屏</span>
              </div>
              <div className="stitchHeaderActions">
                <button className="darkButton" type="button" onClick={() => void downloadStitchPreview(stitchGroup)}>
                  <Download size={15} />
                  <span>下载长图</span>
                </button>
                <button className="iconButton" type="button" onClick={closeStitchPreview} aria-label="关闭">
                  <X size={18} />
                </button>
              </div>
            </header>
            <div
              className="stitchCanvasFrame"
              onWheel={handleStitchWheel}
              onPointerDown={beginStitchDrag}
              onPointerMove={moveStitchDrag}
              onPointerUp={endStitchDrag}
              onPointerCancel={endStitchDrag}
              onContextMenu={(event) => openStitchContextMenu(event, stitchGroup.id)}
              title="滚轮缩放，按住拖动画面"
            >
              <div
                className="stitchLongImage"
                style={{ transform: `translate(${stitchPan.x}px, ${stitchPan.y}px) scale(${stitchZoom})` }}
              >
                {stitchItems.map(({ prompt, result }, stitchIndex) => (
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
              <CachedImage
                src={imageSourceFromResult(previewResult.image)}
                alt="放大预览"
                draggable
                onDragStart={(event) => beginResultImageDrag(event, previewResult)}
                style={{ transform: `translate(${previewPan.x}px, ${previewPan.y}px) scale(${previewZoom})` }}
              />
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

      {stitchContextMenu && stitchContextGroup && (
        <div
          className="imageContextMenu stitchContextMenu"
          style={{ left: stitchContextMenu.x, top: stitchContextMenu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => { void downloadStitchPreview(stitchContextGroup); setStitchContextMenu(null); }}>
            <Download size={15} />
            <span>下载长图</span>
          </button>
          <button type="button" onClick={() => { downloadDetailGroup(stitchContextGroup); setStitchContextMenu(null); }}>
            <Layers size={15} />
            <span>下载分屏</span>
          </button>
          <button type="button" onClick={() => { void openSaveDirectory(); setStitchContextMenu(null); }}>
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

// V46.1 任务计时下沉：自管 500ms 局部 tick，替换原先顶层的 setNowTick，
// 避免「有任务在跑时每 500ms 强制巨石全树重渲染」导致的打字/交互卡顿。
function ElapsedTimer({ startedAt }) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    setTick(Date.now());
    const timer = window.setInterval(() => setTick(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const started = startedAt || tick;
  return <>{formatMs(tick - started)}</>;
}

// V46.3 输入 memo 下沉：受控 textarea 用 ref 持有最新 onChange / onPointerDown，
// 渲染时改用 useMemo([]) 产出的「稳定包装函数」，并配自定义 memo 比较器刻意忽略
// 函数 prop 身份。这样父级（main.jsx 巨石）因其它 state 变动重渲时，value 未变的
// 输入框可跳过重渲，缓解「别的输入框打字也拖着本框重渲」的卡顿。
// 若只套 React.memo 而不忽略 handler 身份，inline arrow 每次都是新引用、memo 永远
// 失效（零收益陷阱），故必须 ref + 自定义比较器双管齐下。
const StableTextarea = React.memo(
  function StableTextarea({
    value,
    onChange,
    onPointerDown,
    className,
    placeholder,
    disabled,
    readOnly,
    rows,
    ...rest
  }) {
    const onChangeRef = useRef(onChange);
    const onPointerDownRef = useRef(onPointerDown);
    onChangeRef.current = onChange;
    onPointerDownRef.current = onPointerDown;

    const stableOnChange = useMemo(
      () => (event) => { if (onChangeRef.current) onChangeRef.current(event); },
      []
    );
    const stableOnPointerDown = useMemo(
      () => (event) => { if (onPointerDownRef.current) onPointerDownRef.current(event); },
      []
    );

    return (
      <textarea
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        rows={rows}
        value={value}
        onChange={stableOnChange}
        onPointerDown={onPointerDownRef.current ? stableOnPointerDown : undefined}
        {...rest}
      />
    );
  },
  (prev, next) => {
    // 仅当「非 handler 的渲染相关 prop」真正变化时才重渲；
    // onChange / onPointerDown 身份变化被刻意忽略（已通过 ref 持有最新实现）。
    // 其余 prop（含未来可能新增的 style / maxLength 等）一律做值比较，保证行为正确。
    const prevKeys = Object.keys(prev);
    if (prevKeys.length !== Object.keys(next).length) return false;
    for (const key of prevKeys) {
      if (key === "onChange" || key === "onPointerDown") continue;
      if (prev[key] !== next[key]) return false;
    }
    return true;
  }
);
