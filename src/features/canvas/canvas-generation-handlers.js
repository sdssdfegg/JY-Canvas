// src/features/canvas/canvas-generation-handlers.js
// P6-4 (V4.0) 2026-10-15：从 src/main.jsx 抽出的「画布 / 生成」类 handler 钩。
// 内容：saveProcessedImageFile / optimizePrompt / sendResultToImageEditor / addReferenceThumbToUploads / generate，
//   以及仅被 generate 使用的 4 个模块级辅助（ensureQuickUploadCanvasRatio / fileToCompactJpegDataUrl /
//   JSON_IMAGE_URLS_MODELS / shouldNormalizeQuickUploadForModel —— 父文件中已无其他引用，随本钩整体搬迁，
//   父文件对应定义与 import 一并删除）。
// 模式：沿用 P6-1/P6-2/P6-3 的 deps 注入薄壳——每次 render 由调用方重建 ctx 对象传入，
//   钩内不记忆化，handler 每次 render 重建，与搬出前（组件内函数声明）行为完全一致；
//   闭包引用在钩顶 const 解构自 ctx（handler 体逐字未改）。
// ⚠️ ctx 漏项 = 运行期 undefined（vite build 验不出），由 P6-4 §4 负向对照兜底（scripts/dev/p6-4-handlercheck.mjs）。
// TDZ：钩调用点置于父组件 createReferenceUpload（appendReferenceFiles，最后一项 ctx 字段）之后；
//   addEvent / autoSaveEventText / updateSetting 为父组件 hoisted 函数声明，作 ctx 传入安全。
import { clampPromptForModel, isBanana2Model, routingFields } from "../../shared/routing.js";
import { classifyQuickPrimaryLocalIntent, promptForQuickGeneration } from "../../shared/quickgen-prompt-rules.js";
import { imageBitmapFromFile, imageExtension } from "../../shared/image-input.js";
import { dataUrlFromBlob, imageFileFromUrl, referenceSource } from "../../shared/result-image.js";
import { fileBaseName } from "../../shared/file-name.js";
import { formatMs } from "../../lib/format/index.js";
import { isAuthErrorMessage, normalizeApiKeyInput } from "../../features/auth/api-key.js";
import { LOCAL_EDIT_RECT_MODE } from "../../shared/local-edit-mask.js";
import { LOCAL_EDIT_CROP_UPLOAD_TARGET_BYTES } from "../../shared/local-edit-geometry.js";
import {
  prepareImageFilesForChannel,
  quickReferenceHasLocalEdit,
  quickReferenceOriginalFile,
  quickReferenceRunUploadFile,
  quickReferenceUploadFiles,
  referenceMetaFromQuickRunItems
} from "../../features/upload/reference-upload.js";
import { composeQuickLocalEditBlob } from "../../features/local-edit/crop-rect-resize.js";
import { dedupeResults, normalizeQuickReferenceItem } from "../../features/quickgen/quickgen-state.js";
import { removeHistoryResults, saveHistoryResults } from "../../features/storage/storage-store.js";
import { defaultState } from "../../shared/app-defaults.js";
import { saveProcessedImageRequest } from "../../api/save.js";
import { generateImages } from "../../api/images.js";
import { rewriteQuickPrompt } from "../../api/prompts.js";

// 以下 4 项自 src/main.jsx 模块级整体搬迁（父文件中仅 generate 引用，随 handler 一并搬出）。
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

export function useCanvasGenerationHandlers(ctx) {
  const {
    // 组件作用域：状态 / 派生值
    config,
    settings,
    models,
    files,
    saveDirectory,
    isQuickPromptOptimizing,
    // 组件作用域：setter
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
    // 组件作用域：兄弟函数 / 工厂产物（保持原位，经 ctx 注入）
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
    // 模块级常量（父组件仍需持有，经 ctx 注入）
    DETAIL_ANALYSIS_MODEL,
    CLIENT_SESSION_ID
  } = ctx;





  async function saveProcessedImageFile(file, subfolder = "") {
    const directory = saveDirectory || await refreshSaveDirectory();
    if (!directory) throw new Error("未找到指定文件夹");
    const form = new FormData();
    form.append("directory", directory);
    form.append("subfolder", subfolder || "");
    form.append("image", file, file.name || `image-${Date.now()}.jpg`);
    // P7-6：请求本身收口到 src/api/save.js（URL/method/body 逐字一致），响应处理维持原样。
    const response = await saveProcessedImageRequest(form);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || "保存图片失败");
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    return payload;
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
        setResults((current) => dedupeResults([...nextResults, ...current]));
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

  return {
    saveProcessedImageFile,
    optimizePrompt,
    sendResultToImageEditor,
    addReferenceThumbToUploads,
    generate
  };
}
