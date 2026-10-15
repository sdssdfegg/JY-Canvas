// src/features/main-app/main-handlers.js
// P6-5 (V4.0) 2026-10-15：从 src/main.jsx App() 体抽出的「其余全部 handler」钩。
// 内容（38 个，逐字搬运，仅闭包引用改 ctx / lateRef）：
//   updateSetting / screenToCanvasPoint / canvasCenterPoint / handleCanvasDrop / sendResultToCanvas /
//   addEvent / copyText / onComposerPaste / downloadVideoResult / removeReferenceImage /
//   openQuickCropEdit / openQuickLocalEdit / applyQuickCropEdit / applyQuickLocalEdit /
//   clearQuickCropEdit / clearQuickLocalEdit / clearAll / openSaveDirectory / onQuickBoardWheel /
//   autoSaveEventText / openSettingsPanel / openUploadPreview / beginReferenceSort / moveReferenceSort /
//   endReferenceSort / cancelReferenceSort / closeUploadPreview / openReferencePreview /
//   closeReferencePreview / shiftReferencePreview / openPreview / shiftPreview / closePreview /
//   handlePreviewWheel / openContextMenu / openReferenceContextMenu / rerunResult / markDeferredFeature
// 模式：沿用 P6-4 的 deps 注入薄壳——每次 render 由调用方重建 ctx 对象传入，
//   钩内不记忆化，handler 每次 render 重建，与搬出前（组件内函数声明）行为完全一致；
//   闭包引用在钩顶 const 解构自 ctx（handler 体逐字未改，仅晚期产出改 lateRef.current.xxx）。
// ⚠️ ctx 漏项 = 运行期 undefined（vite build 验不出），由 P6-5 §4 负向对照兜底（scripts/dev/p6-5-propcheck.mjs）。
// TDZ：钩调用点置于 usePreviewDrag / useSettingsState / usePromptAssistantState / useSaveDirectory /
//   createCanvasActions 之前——这些下游 deps 引用 addEvent / updateSetting / closePreview / canvasCenterPoint
//   （搬出前依赖函数提升，现由本钩产出，调用点必须在前）。
//   钩内 9 项晚期产出引用统一走 lateRef.current（渲染期之后的回填点赋值）：
//   addCanvasFiles(P6-4 钩) / patchActiveCanvas(createCanvasActions) / videoApi / appendReferenceFiles(createReferenceUpload) /
//   referenceApi / refreshSaveDirectory(useSaveDirectory) / previewNavigationItems(useMemo) / detailApi / generate(P6-4 钩)。
//   handler 只在事件回调与 effect 内被调用（均在渲染之后），无前向引用；effect 的依赖数组不含 handler。
import { imageFilesFromClipboard } from "../../shared/image-input.js";
import { dragDownloadDateStamp, referenceSource } from "../../shared/result-image.js";
import { copyTextToClipboard } from "../../shared/dom-actions.js";
import { openSaveDirectoryRequest } from "../../api/save.js";
import { removeHistoryResults } from "../../features/storage/storage-store.js";
import {
  LOCAL_EDIT_MASK_MODE,
  LOCAL_EDIT_BRUSH_DEFAULT,
  LOCAL_EDIT_MASK_OPACITY_DEFAULT,
  LOCAL_EDIT_RECT_MODE
} from "../../shared/local-edit-mask.js";
import { screenPointToCanvas, canvasCenterFromRect } from "../../features/canvas/canvas-graph.js";
import {
  channelsForModel,
  convergeSettingsForModel,
  modelCapabilities
} from "../../shared/routing.js";

export function useMainHandlers(ctx) {
  const {
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
    lateRef
  } = ctx;

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

  function screenToCanvasPoint(clientX, clientY) {
    return screenPointToCanvas(canvasStageRef.current?.getBoundingClientRect(), canvasViewport, clientX, clientY);
  }

  function canvasCenterPoint(offsetX = 0, offsetY = 0) {
    return canvasCenterFromRect(canvasStageRef.current?.getBoundingClientRect(), canvasViewport, offsetX, offsetY);
  }

  function handleCanvasDrop(event) {
    if (!Array.from(event.dataTransfer?.types || []).includes("Files")) return;
    event.preventDefault();
    void lateRef.current.addCanvasFiles(event.dataTransfer.files, screenToCanvasPoint(event.clientX, event.clientY));
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
    lateRef.current.patchActiveCanvas((canvas) => ({
      nodes: [...canvas.nodes, node]
    }));
    setActiveView("infinite-canvas");
    setCanvasSelectedNodeId(node.id);
    addEvent("无限画布", "已发送副本到当前画布");
  }

  function addEvent(label, detail) {
    setEvents((current) => [
      { time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), label, detail },
      ...current
    ].slice(0, 6));
  }

  // 实现在 src/shared/dom-actions.js（两侧同一份，20 行逐字节一致）。
  // 这里只保留闭包绑定壳：捕获本组件的 addEvent，14 处调用点因此无需改动。
  const copyText = (text, successMessage = "已复制") =>
    copyTextToClipboard(text, { successMessage, notify: addEvent });

  function onComposerPaste(event) {
    const pastedImages = imageFilesFromClipboard(event.clipboardData);
    if (pastedImages.length === 0) return;
    event.preventDefault();
    if (quickMode === "video") {
      lateRef.current.videoApi.setVideoReferenceFile(pastedImages[0]);
      addEvent("视频参考图", "已从剪贴板添加 1 张参考图");
      return;
    }
    lateRef.current.appendReferenceFiles(pastedImages, {
      eventLabel: "粘贴上传",
      actionText: "已从剪贴板添加"
    });
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

  function clearAll() {
    const targetResults = activeView === "reference-remix" ? lateRef.current.referenceApi.referenceResults : quickResults;
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
      lateRef.current.referenceApi.resetReferenceState();
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

    void lateRef.current.refreshSaveDirectory().then((nextDirectory) => {
      if (nextDirectory) sendOpenRequest(nextDirectory);
    });
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

  function openSettingsPanel() {
    setIsSettingsOpen(true);
  }

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
        lateRef.current.moveReferenceFile(sort.id, sort.target.id, sort.target.placement);
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
    if (!previewResult || lateRef.current.previewNavigationItems.length <= 1) return;
    const index = lateRef.current.previewNavigationItems.findIndex((item) => item.id === previewResult.id);
    if (index < 0) return;
    const nextIndex = Math.max(0, Math.min(lateRef.current.previewNavigationItems.length - 1, index + direction));
    if (nextIndex === index) return;
    openPreview(lateRef.current.previewNavigationItems[nextIndex]);
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

  function openContextMenu(event, itemId) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 176;
    const menuHeight = 476;
    setReferenceContextMenu(null);
    lateRef.current.detailApi.setStitchContextMenu(null);
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
    lateRef.current.detailApi.setStitchContextMenu(null);
    setReferenceContextMenu({
      reference,
      index,
      count: Array.isArray(items) ? items.length : 0,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  function rerunResult(item, count = 1) {
    if (item.source === "infinite-canvas") {
      setActiveView("infinite-canvas");
      addEvent("无限画布", "画布结果请通过生图节点继续生成");
      return;
    }
    const detailMatch = lateRef.current.detailApi.findDetailPromptByResult(item.id);
    if (detailMatch) {
      void lateRef.current.detailApi.generateDetailPrompt(detailMatch.group, detailMatch.prompt, detailMatch.prompt.screen, count);
      return;
    }
    const prompt = item.prompt || settings.prompt;
    setSettings((current) => ({ ...current, prompt, n: count }));
    void lateRef.current.generate({ prompt, n: count, replaceResultId: item.id });
  }

  function markDeferredFeature(label) {
    addEvent(label, "此功能会在后续模块接入");
  }

  return {
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
  };
}
