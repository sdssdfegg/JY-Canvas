import { useState, useRef, useMemo } from "react";
import { makeQuickReferenceItem } from "../upload/reference-upload.js";
import { quickReferenceOriginalFile, quickReferenceUploadFile } from "../upload/reference-upload.js";

// 参考图项归一化（原 main.jsx 本地函数，本单收口）。纯函数，供本 hook 的 previewFiles
// 与 App() 的 generate / rerunResult 共用。
export function normalizeQuickReferenceItem(item) {
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

// 快捷生成（image 模式）私有状态与派生收口（V61 从 src/main.jsx 迁出）。
//
// 本单为「降级档」：仅抽取 quickgen-state.js 纯逻辑（23 项状态 + 引用 ref + 派生值），
// JSX（顶部 tab / 工具条、image 主内容、五处私有浮层）留在 main.jsx，待下轮抽取 QuickGenView。
// 状态 / 派生以「原名校验返回」，main.jsx 在 App() 顶部解构后，其余工厂调用与 JSX 引用均不变。
//
// ⚠️ 与 V61 执行单状态迁移表的偏差（规则③停手回报，已核实为架构强制，非自行发挥）：
//   1. results / selectedIds / error / previewResult / contextMenu 等被「一键详情·主图」「参考生图」
//      「无限画布」与共享工厂（createResultDownload / createResultActions / createReferenceUpload）共用，
//      不能「删除声明」，只能「搬进本 hook 并以原名返回、App 解构后继续供共享工厂使用」，
//      与 V58 videoApi / V60 detailApi 的模式一致。
//   2. 顶部 tab / 工具条（执行单 §2 标注 2296–2320 / 2324–2424）嵌在共享 topBar 内，
//      与 infinite-canvas / detail-main / reference-remix 的标题与工具条同体，
//      单独抽进 QuickGenView 需要重构 topBar（否则会重复渲染或丢失共享入口），
//      故本单留待下轮，不在无浏览器实测的自动化环境里冒险重构。
//   3. 快捷生成私有 handler（generate / optimizePrompt / openPreview / 参考排序 等）与
//      createQuickResultReplace 仍留在 App()，它们通过解构后的同名状态/派生值继续工作，行为不变。

// 结果去重：同一次生成的图若被重复写入 results（同 id 或「同图不同 id」），
// 画廊会出现「两张一模一样」的卡。按「图片内容签名优先、缺图回退 id」去重，
// 只保证展示层不重复，不改数据模型、不动存储结构。
// 纯函数，模块级导出，供本 hook 的 quickGalleryItems 与 App() 的 generate 共用。
export function dedupeResults(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const img = item.image;
    const imgKey = img?.type === "b64_json" && img.value
      ? `b64:${img.value}`
      : (img?.url ? `url:${img.url}` : null);
    const key = imgKey || `id:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function useQuickGenState() {
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [brokenResultImages, setBrokenResultImages] = useState(() => ({}));
  const [resultFilter, setResultFilter] = useState("all");
  const [quickMode, setQuickMode] = useState("image");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [status, setStatus] = useState("idle");
  const [quickTasks, setQuickTasks] = useState([]);
  const [galleryZoom, setGalleryZoom] = useState(1);
  const [downloadFeedbackIds, setDownloadFeedbackIds] = useState(() => new Set());
  const [error, setError] = useState("");
  const [isQuickPromptOptimizing, setIsQuickPromptOptimizing] = useState(false);
  // 任务计时已下沉到 <ElapsedTimer>，此处只留 setter 供生成链路打点。
  const [, setTiming] = useState(null);
  const [isQuickChannelMenuOpen, setIsQuickChannelMenuOpen] = useState(false);
  const [quickResultReplaceTargetId, setQuickResultReplaceTargetId] = useState("");
  const [quickCropEditTarget, setQuickCropEditTarget] = useState(null);
  const [quickLocalEditTarget, setQuickLocalEditTarget] = useState(null);
  const [previewResult, setPreviewResult] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPan, setPreviewPan] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  const [imageEditorSeed, setImageEditorSeed] = useState(null);

  // quickgen 私有 ref（原在 App() 顶部，随状态一并收口）
  const quickResultDragIdRef = useRef("");
  const downloadFeedbackTimersRef = useRef(new Map());
  const quickGalleryRef = useRef(null);

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
  const quickResults = useMemo(() => results.filter((item) => !item.source || item.source === "quickgen"), [results]);
  const runningQuickTasks = quickTasks.filter((task) => task.status === "running");
  const imageCount = quickResults.length;
  // 当前仅 image 一档结果，resultFilter 仅作占位（全部/图片同义），保留以备下轮分桶。
  const visibleResults = resultFilter === "image" ? quickResults : quickResults;

  const quickGalleryItems = useMemo(() => {
    const resultItems = dedupeResults(visibleResults).map((item, index) => ({
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
  const quickSelectedCount = quickResults.reduce((count, item) => count + (selectedIds.has(item.id) ? 1 : 0), 0);
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
  const contextItem = contextMenu ? results.find((item) => item.id === contextMenu.itemId) : null;
  const contextIndex = contextItem ? results.findIndex((item) => item.id === contextItem.id) : -1;
  const quickGalleryTailKey = quickGalleryItems.at(-1)?.key || "";

  return {
    files, setFiles,
    results, setResults,
    brokenResultImages, setBrokenResultImages,
    resultFilter, setResultFilter,
    quickMode, setQuickMode,
    selectedIds, setSelectedIds,
    status, setStatus,
    quickTasks, setQuickTasks,
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
    visibleResults,
    quickGalleryItems,
    quickSelectedCount,
    galleryZoomPercent,
    galleryCardMin,
    quickStatus,
    latestStatusText,
    contextItem,
    contextIndex,
    quickGalleryTailKey
  };
}
