import { useState, useRef, useMemo, useEffect } from "react";
import {
  buildReferenceRemixPrompt,
  buildSmartReferencePrompt,
  renderReferencePolicy,
  referenceMetaFromFiles,
  prepareImageFilesForChannel
} from "../../features/upload/reference-upload.js";
import { referenceDefaults, defaultState } from "../../shared/app-defaults.js";
import { generateImages } from "../../api/images.js";
import { rewriteReferencePrompt } from "../../api/prompts.js";
import { isAuthErrorMessage, normalizeApiKeyInput } from "../../features/auth/api-key.js";
import { formatMs } from "../../lib/format/index.js";
import {
  channelForModel,
  channelsForModel,
  modelCapabilities,
  routingFields
} from "../../shared/routing.js";
import { clampReferenceStrength } from "../../features/detail/detail-group.js";
import { saveHistoryResults } from "../../features/storage/storage-store.js";

// 参考生图面板私有状态 + 编排收口（V59 从 src/main.jsx 迁出）。
//
// ⚠️ 偏差（规则③停手回报，已核实为架构强制，非自行发挥）：
//   1. 本面板结果写全局 results（setResults + saveHistoryResults），与快捷生成/一键详情/无限画布共用同一结果池；
//      referenceResults 由注入的 results 派生，不迁入独立结果状态。
//   2. referenceResults / referenceGalleryItems / referenceStatusText 被主画板预览导航
//      （main.jsx 996–1001，previewSource === "reference-remix"）与工具条徽标（3085–3095）引用，不止在视图内。
//      故本 hook 返回 referenceApi 对象，App 工具条/预览导航与 ReferenceRemixView 两端共用同一对象，避免状态复制。
//   3. createReferenceUpload 工厂调用留在 App（main.jsx 1697）：其返回的 onComposerDragOver / onComposerDragLeave /
//      isReferenceDropData / imageFilesFromReferenceDrop 等被图片快捷生成面板与 videoApi 共用。本 hook 仅接收
//      参考专属的 addReferenceRewriteFiles / removeReferenceRewriteFile 两个 handler（工厂注入）。
//   4. referenceProductFiles / referenceStyleFiles 状态留在 App：createReferenceUpload 在 App 内绑定这两个状态与其
//      setter，视图对它们的读取经 referenceApi 回传；其写入仅经由 App 下发的 addReferenceRewriteFiles /
//      removeReferenceRewriteFile（共享上传链路），本 hook 不持有其 setter。
//   5. COUNT_OPTIONS / REFERENCE_STRENGTH_OPTIONS / referenceControlOptions 为 main.jsx 模块级常量，被快捷生成 /
//      详情 / 参考三处共用，作为 View props 下发，不迁入 hook。

export function useReferenceState({
  settings,
  config,
  models,
  results,
  setResults,
  addEvent,
  setIsSettingsOpen,
  clientSessionId,
  clampCount,
  makeResultId,
  normalizeGenerationErrorMessage,
  DETAIL_ANALYSIS_MODEL,
  // 来自 App 级 createReferenceUpload 工厂（与图片快捷生成 / 视频 composer 共享上传链路）
  referenceProductFiles,
  referenceStyleFiles,
  addReferenceRewriteFiles,
  removeReferenceRewriteFile
}) {
  const [referenceSettings, setReferenceSettings] = useState(referenceDefaults);
  const [referenceTasks, setReferenceTasks] = useState([]);
  const [referenceStatus, setReferenceStatus] = useState("idle");
  const [referenceError, setReferenceError] = useState("");
  const [isReferencePromptRewriting, setIsReferencePromptRewriting] = useState(false);

  const referenceProductInputRef = useRef(null);
  const referenceStyleInputRef = useRef(null);

  // 派生：模型 / 比例 / 分辨率（依赖注入的 models + 本 hook 持有的 referenceSettings）
  const referenceModel = models.find((item) => item.value === referenceSettings.model) || models[0];
  const referenceRatios = referenceModel.ratios || ["1:1", "3:4", "16:9"];
  const referenceSizes = modelCapabilities(referenceSettings.model, config.routing || config).sizes;

  // 派生：参考生图结果（来自全局 results，按 source 过滤）
  const referenceResults = useMemo(
    () => results.filter((item) => item.source === "reference-remix"),
    [results]
  );

  // 派生：上传预览（URL.createObjectURL，卸载时回收）
  const referenceProductPreviews = useMemo(
    () => referenceProductFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [referenceProductFiles]
  );
  const referenceStylePreviews = useMemo(
    () => referenceStyleFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [referenceStyleFiles]
  );

  // 派生：运行中的任务
  const runningReferenceTasks = referenceTasks.filter((task) => task.status === "running");

  // 派生：画廊条目（会话内优先、历史在后）
  const referenceGalleryItems = useMemo(() => {
    const sessionItems = [];
    const historyItems = [];
    referenceResults.forEach((item, index) => {
      const entry = {
        kind: "result",
        key: `reference-result-${item.id}`,
        result: item,
        orderAt: Number.isFinite(item.submittedAt)
          ? item.submittedAt
          : (Number.isFinite(item.createdAt) ? item.createdAt : 0),
        fallbackIndex: index
      };
      if (item.clientSessionId === clientSessionId) {
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
  }, [referenceResults, runningReferenceTasks, clientSessionId]);

  // 派生：状态文案
  const referenceStatusText = runningReferenceTasks.length > 0
    ? `运行中 ${runningReferenceTasks.length} 个任务`
    : referenceStatus === "failed"
      ? "参考生图失败"
      : referenceStatus === "success"
        ? "参考生图已完成"
        : "等待参考生图";

  // 上传预览 URL 回收，避免内存泄漏
  useEffect(() => () => {
    referenceProductPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [referenceProductPreviews]);
  useEffect(() => () => {
    referenceStylePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [referenceStylePreviews]);

  // 清空参考生图模块状态（供 App 级 clearAll 在 activeView === "reference-remix" 分支调用；
  // referenceProductFiles / referenceStyleFiles 留在 App，由 clearAll 直接经其 setter 清空）。
  function resetReferenceState() {
    setReferenceTasks([]);
    setReferenceStatus("idle");
    setReferenceError("");
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

      const totalMs = Number.isFinite(payload.timing?.totalMs)
        ? payload.timing.totalMs
        : performance.now() - started;
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
          clientSessionId,
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

  return {
    referenceSettings,
    setReferenceSettings,
    referenceProductFiles,
    referenceStyleFiles,
    referenceTasks,
    referenceStatus,
    referenceError,
    isReferencePromptRewriting,
    referenceProductInputRef,
    referenceStyleInputRef,
    referenceModel,
    referenceRatios,
    referenceSizes,
    referenceResults,
    referenceProductPreviews,
    referenceStylePreviews,
    runningReferenceTasks,
    referenceGalleryItems,
    referenceStatusText,
    updateReferenceSetting,
    applySmartReferencePrompt,
    generateReferenceRemix,
    resetReferenceState,
    addReferenceRewriteFiles,
    removeReferenceRewriteFile
  };
}
