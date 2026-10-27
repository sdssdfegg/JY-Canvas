// src/features/outfit/handlers/outfit-batch-execution.js
// P6-3 (V4.0) 2026-10-15：从 src/outfit-workflow.jsx 抽出的「批量生成执行」逻辑（生图热路径）。
// 内容：buildTasks / runTaskQualityCheck / runSingleTask / startBatch。
// 模式：沿用 P6-1/P6-2 的 deps 注入薄壳（useOutfitRefHandlers / useOutfitSaveHandlers）——
//   每次 render 由调用方重建 ctx 对象传入，钩内不记忆化，函数每次 render 重建，与搬出前（组件内函数声明）行为完全一致。
// ⚠️ ctx 漏项 = 运行期 undefined（vite build 验不出），由 P6-3 §4 负向对照兜底。
import { fileBaseName } from "../../../shared/file-name.js";
import { imageExtension } from "../../../shared/image-input.js";
import {
  LOCAL_EDIT_MASK_MODE,
  LOCAL_EDIT_RECT_MODE,
  createInpaintUploadMask,
  imageBitmapFromDataUrl
} from "../../../shared/local-edit-mask.js";
import { routingFields } from "../../../shared/routing.js";
import { localPasteSizeReport, resolveLocalEditBaseFile } from "../../../shared/local-edit-geometry.js";
import { describeEmptyResult, formatGenerationError, sanitizeErrorText } from "../../../shared/generation-errors.js";
import { dataUrlFromBlob } from "../../../shared/result-image.js";
import { normalizeOutfitIntent, validateOutfitIntent } from "../../../shared/outfit-intent.js";
import { normalizeRetouchIntent, validateRetouchIntent } from "../../../shared/retouch-intent.js";
import { checkOutfitQuality, generateOutfit } from "../../../api/outfit.js";
import { emitClientDiagnosticEvent } from "../../../api/client.js";
import { fileSize, formatWholeSecondMs as formatMs } from "../../../lib/format/index.js";
import {
  OUTFIT_SESSION_ID,
  normalizeQualityCheck,
  normalizeQualityCheckResult,
  imageItemUploadFile,
  attachTaskReferenceThumbs,
  publishOutfitLiveRun,
  localEditTaskBindingSnapshot,
  prepareOutfitTaskLocalEdit,
  cacheTaskResultImageFile,
  createDocumentObjectUrl,
  normalizeCropReturnMeta,
  normalizeRandomBackgroundFocus,
  persistFinishedTaskWhileDetached,
  taskRuntimeStageLabel,
  summarizeGenerationError,
  revokeResultImageRuntimeCache
} from "../outfit-task.js";
import { makeId } from "../outfit-image-utils.js";
import { normalizeBatchConcurrency } from "../outfit-top.js";
import { mentionsOptionalReferenceImage } from "../outfit-page-actions.js";
import {
  blobFromOutfitImage,
  composeCropReturnBlob,
  composeOutfitLocalEditBlob,
  composeOutpaintOriginalRegionBlob,
  delay,
  ensureOutfitUploadCanvasRatio,
  fileFromBlob,
  prepareOutpaintUploadCanvas
} from "../outfit-image-pipeline.js";

export function useOutfitBatchExecution(ctx) {
  const {
    // 组件作用域：状态 / ref / setter / 派生布尔
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
    // 组件作用域：setter / ref / 由 useOutfitSettingsIntent 提供的函数
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
    // 由 useOutfitSaveHandlers 提供的函数
    autoSaveTask,
    splitHalves,
    splitWhiteRefineResult,
    // 仅被 buildTasks 使用的组件内闭包 helper（保持原位，经 ctx 注入）
    modelForIndex,
    clothingForIndex,
    freezeIntentIntoTask,
    // 模块级常量（仅 startBatch 使用，保持原位经 ctx 注入）
    LOCAL_EDIT_BATCH_CONCURRENCY,
    LOCAL_EDIT_BATCH_REQUEST_GAP_MS
  } = ctx;

  function buildTasks(countOverride = plannedGenerationCount) {
    const count = Math.min(countOverride, outfitMaxImages);
    const referenceMentioned = mentionsOptionalReferenceImage(settings.prompt, settings.productNote);
    const selectedReferences = isOutpaintWorkflow || isWhiteRefineWorkflow || isRandomBackgroundWorkflow
      ? []
      : (!isOutfitWorkflow && !isPoseRemixWorkflow) || referenceMentioned
        ? referenceImages.filter((item) => item.selected)
        : [];
    const outpaintReferenceItems = [];
    const intentCtx = { isOutfitWorkflow, isWhiteRefineWorkflow, settings };
    return Array.from({ length: count }, (_, index) => {
      const modelItem = isDesignDraftWorkflow ? activeModels[0] : modelForIndex(index);
      // 设计稿与精修都是「多图进、一张出」：图1 的其余几张要作为图2…图N 一起带上去。
      const extraModelItems = isDesignDraftWorkflow || isWhiteRefineWorkflow ? activeModels.slice(1) : [];
      const clothingItem = isOutpaintWorkflow || isRandomBackgroundWorkflow ? null : clothingForIndex(index);
      const extraClothingItems = isWhiteRefineWorkflow
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
        randomBackgroundFocus: isRandomBackgroundWorkflow ? normalizeRandomBackgroundFocus(settings.randomBackgroundFocus) : undefined,
        ...freezeIntentIntoTask(intentCtx),
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
      randomBackgroundFocus: taskIsRandomBackground ? normalizeRandomBackgroundFocus(task.randomBackgroundFocus || settings.randomBackgroundFocus) : undefined,
      // 结构化换装意图：只认任务快照（批次开始后就冻结），不再读当前界面设置。
      outfitIntent: taskIsOutfit ? normalizeOutfitIntent(task.outfitIntent || settings.outfitIntent) : undefined,
      // P1-8.1：掩膜约束档位随任务快照冻结（批次开始后界面切换不影响在途任务）。
      maskMode: taskIsOutfit ? (settings.maskMode || "none") : undefined,
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
      `已创建 ${nextTasks.length} 个任务，${isDesignDraftWorkflow ? "设计稿SKILL" : isPoseRemixWorkflow ? "批量姿态常规文本" : isRandomBackgroundWorkflow ? settings.smartIntervention ? "随机背景智能文本" : "随机背景常规文本" : isBackgroundChangeWorkflow ? settings.smartIntervention ? "固定背景智能文本" : "固定背景常规文本" : isOutpaintWorkflow ? "批量扩图常规文本" : isFaceSwapWorkflow ? settings.smartIntervention ? "换脸智能文本" : "换脸常规文本" : isLocalDetailWorkflow ? settings.smartIntervention ? "局部回贴智能文本" : "局部回贴常规文本" : settings.smartIntervention ? "智能介入" : "常规模式"}；并发 ${hasLocalEditBatch ? localEditWorkerCount : configuredWorkerCount}`
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

  return {
    buildTasks,
    runTaskQualityCheck,
    runSingleTask,
    startBatch
  };
}
