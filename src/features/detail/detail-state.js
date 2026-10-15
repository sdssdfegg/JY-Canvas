import { useState, useRef, useMemo, useEffect } from "react";
import {
  clampDetailCount,
  clampDetailModelUsage,
  clampReverseScreens,
  hydrateDetailGroupsWithHistory,
  loadDetailGroups,
  loadDetailPresets,
  normalizeDetailSettings,
  sanitizeDetailGroupsForStorage,
  createDetailGroup
} from "./detail-group.js";
import { DETAIL_GROUPS_KEY, DETAIL_PRESETS_KEY, defaultState, detailDefaults } from "../../shared/app-defaults.js";
import { writeJsonStorage } from "../../lib/storage/json-storage.js";
import { addFilesByRole, removeFilesByRole } from "../../shared/image-input.js";
import { prepareImageFilesForChannel, referenceMetaFromFiles } from "../upload/reference-upload.js";
import { generateImages } from "../../api/images.js";
import { saveImageRequest } from "../../api/save.js";
import { createDetailPrompts } from "../../api/prompts.js";
import { isAuthErrorMessage, normalizeApiKeyInput } from "../auth/api-key.js";
import { dataUrlFromBlob } from "../../shared/result-image.js";
import { formatMs } from "../../lib/format/index.js";
import {
  channelForModel,
  channelsForModel,
  modelCapabilities,
  routingFields
} from "../../shared/routing.js";
import { saveHistoryResults } from "../storage/storage-store.js";

// 一键详情/主图面板私有状态 + 编排收口（V60 从 src/main.jsx 迁出）。
//
// ⚠️ 偏差（规则③，已核实为架构强制，非自行发挥）：
//   1. detailApi 共享对象：App 工具条（main.jsx 的 activeView === "detail-main" 两个子块：拼图预览按钮 / 状态徽标）
//      与 DetailView 两端共用同一 detailApi，避免状态复制（镜像 V57 promptApi / V58 videoApi / V59 referenceApi 模式）。
//   2. results 全局写回：generateDetailPrompt 仍走 setResults + saveHistoryResults 写全局 results，
//      因详情结果与历史/画廊共用 results（resultActions 的 removeDetailResultIds / hydrateDetailGroupsWithHistory
//      也在读写同一批 id），未改为视图自管局部结果状态。
//   3. createResultActions 留 App：其依赖 detailInfoSelection / setDetailInfoSelection / setDetailGroups，
//      而这些状态在本 hook 内 ⇒ 工厂调用与本 hook 互相引用，App 侧用 detailApi.* 回传打破环。
//   4. 六个选项常量（workflowOptions / copywritingOptions / richnessOptions / fontStyleOptions /
//      modelModeOptions / modelPoseOptions）为 main.jsx 模块级常量，搬移前实测每项仅 2 处引用
//      （定义 + 详情块内 1 处），详情独占，故随视图一并迁入本文件，不再经 props 下发。
//      COUNT_OPTIONS 为快捷生成 / 详情 / 参考三处共用，留在 App 作为 props 下发（同 V59 口径）。
//   5. rerunResult 留 App：它被快捷生成上下文菜单与画板共用，但需要 detailGroups 做结果反查
//      （findDetailPromptByResult）⇒ 留 App 并经 detailApi.findDetailPromptByResult / detailApi.generateDetailPrompt 调用。

const MAX_DETAIL_FILES = 6;

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

export function useDetailState({
  settings,
  config,
  models,
  setResults,
  addEvent,
  setError,
  setIsSettingsOpen,
  updateSetting,
  setActiveView,
  selectedIds,
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
  syncHistoryFromServer
}) {
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
  const [isDetailPresetOpen, setIsDetailPresetOpen] = useState(false);
  const [stitchContextMenu, setStitchContextMenu] = useState(null);
  const detailProductInputRef = useRef(null);
  const detailReferenceInputRef = useRef(null);
  const stitchDragRef = useRef(null);

  const detailModel = models.find((item) => item.value === detailSettings.model) || models[0];
  const detailRatios = detailModel.ratios || ["1:1", "3:4", "16:9"];
  const detailSizes = modelCapabilities(detailSettings.model, config.routing || config).sizes;
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
  const detailProductPreviews = useMemo(
    () => detailProductFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [detailProductFiles]
  );
  const detailReferencePreviews = useMemo(
    () => detailReferenceFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [detailReferenceFiles]
  );
  const activeDetailGroup = detailGroups.find((group) => group.id === activeDetailGroupId) || detailGroups[0] || null;
  const visibleDetailPrompts = useMemo(() => activeDetailGroup
    ? (detailForwardSort ? activeDetailGroup.prompts : [...activeDetailGroup.prompts].reverse())
    : [], [activeDetailGroup, detailForwardSort]);
  const activeDetailResults = useMemo(() => activeDetailGroup
    ? visibleDetailPrompts.flatMap((prompt) => (prompt.results || []).map((result) => ({ group: activeDetailGroup, prompt, result })))
    : [], [activeDetailGroup, visibleDetailPrompts]);
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

  useEffect(() => {
    writeJsonStorage(DETAIL_PRESETS_KEY, detailPresets);
  }, [detailPresets]);

  useEffect(() => {
    writeJsonStorage(DETAIL_GROUPS_KEY, sanitizeDetailGroupsForStorage(detailGroups));
  }, [detailGroups]);

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
    detailProductPreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [detailProductPreviews]);

  useEffect(() => () => {
    detailReferencePreviews.forEach((item) => URL.revokeObjectURL(item.url));
  }, [detailReferencePreviews]);

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

  function addDetailFiles(role, fileList) {
    addFilesByRole(role, fileList, role === "product" ? detailProductFiles.length : detailReferenceFiles.length,
      MAX_DETAIL_FILES, `${role === "product" ? "产品图" : "参考图"}最多 ${MAX_DETAIL_FILES} 张`,
      "一键详情", addEvent, setDetailProductFiles, setDetailReferenceFiles);
  }

  function removeDetailFile(role, index) {
    removeFilesByRole(role, index, setDetailProductFiles, setDetailReferenceFiles);
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
      // P7-6：请求本身收口到 src/api/save.js（URL/method/headers/body 逐字一致）；
      // 这里原来是 `response.json()` 不带 catch，JSON 解析失败会直接抛，
      // 为保持行为不变，容错方式维持原样。
      const response = await saveImageRequest(directory, {
        id: `${group.id}_stitch_${Date.now()}`,
        image: { type: "b64_json", value: dataUrl },
        modelLabel: "详情长图",
        imageSize: `${detailResultItemsForGroup(group).length}屏`,
        aspectRatio: "long",
        createdAt: Date.now()
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

  // 历史回载：App 启动时从 localStorage / 服务端载入历史后，把结果重新挂回详情分组。
  function hydrateDetailGroups(storedResults) {
    setDetailGroups((current) => hydrateDetailGroupsWithHistory(current, storedResults));
  }

  return {
    // 状态
    detailSettings,
    setDetailSettings,
    detailPresets,
    setDetailPresets,
    detailProductFiles,
    setDetailProductFiles,
    detailReferenceFiles,
    setDetailReferenceFiles,
    detailGroups,
    setDetailGroups,
    detailStatus,
    setDetailStatus,
    activeDetailGroupId,
    setActiveDetailGroupId,
    detailInfoSelection,
    setDetailInfoSelection,
    detailColumns,
    setDetailColumns,
    detailForwardSort,
    setDetailForwardSort,
    detailDragScreen,
    setDetailDragScreen,
    stitchPreview,
    setStitchPreview,
    stitchZoom,
    setStitchZoom,
    stitchPan,
    setStitchPan,
    isDetailPresetOpen,
    setIsDetailPresetOpen,
    stitchContextMenu,
    setStitchContextMenu,
    // ref
    detailProductInputRef,
    detailReferenceInputRef,
    // 派生
    detailModel,
    detailRatios,
    detailSizes,
    detailRunningCount,
    detailStatusText,
    detailProductPreviews,
    detailReferencePreviews,
    activeDetailGroup,
    visibleDetailPrompts,
    activeDetailResults,
    detailInfoItem,
    stitchGroup,
    stitchContextGroup,
    stitchItems,
    // 编排
    updateDetailSetting,
    addDetailFiles,
    removeDetailFile,
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
    downloadStitchPreview,
    downloadDetailGroup,
    createDetailPromptPlan,
    applyDetailPromptToQuickgen,
    generateDetailPrompt,
    generateDetailGroup,
    findDetailPromptByResult,
    openStitchContextMenu,
    hydrateDetailGroups,
    // 详情独占的选项常量
    MAX_DETAIL_FILES,
    workflowOptions,
    copywritingOptions,
    richnessOptions,
    fontStyleOptions,
    modelModeOptions,
    modelPoseOptions
  };
}
