// 模式：沿用 P6-1/P6-2 的 deps 注入薄壳（V132 第一刀：结果拖拽与覆盖域）。
// 域内自含：resultReplaceTargetId 状态 + 两个 drag ref + OUTFIT_RERUN_DRAG_MIME 常量 + 6 个 handler；
// 外部依赖只注入：tasksRef / setTasks / setSelectedTaskIds / setPreview / addEvent。
// 行为契约（逐字迁移自 outfit-workflow.jsx，V132 验收基准）：
//   - beginTaskImageDrag：同时发起"结果图下载拖拽"与"rerun 换位拖拽"（双 dataTransfer 载荷）；
//   - 覆盖落点判定：源/目标均经 tasksRef 取最新快照；预览模态（preview）跟随源/目标位移；
//   - 仅 canReplaceTaskResult 通过时生效。
import { useRef, useState } from "react";
import { beginImageDownloadDrag, referenceSource } from "../../../shared/result-image.js";
import {
  imageSource,
  revokeResultImageRuntimeCache,
  taskDragDownloadName,
  canReplaceTaskResult,
  normalizeCropReturnMeta
} from "../outfit-task.js";

const OUTFIT_RERUN_DRAG_MIME = "application/x-jingyin-outfit-task";

export function useOutfitResultDragHandlers(ctx) {
  const { tasksRef, setTasks, setSelectedTaskIds, setPreview, preview, addEvent } = ctx;
  const [resultReplaceTargetId, setResultReplaceTargetId] = useState("");
  const resultDragTaskIdRef = useRef("");
  const resultDragPayloadRef = useRef(null);

  function beginTaskImageDrag(event, task, fallbackIndex = null) {
    const src = imageSource(task?.result);
    beginImageDownloadDrag(event, src, taskDragDownloadName(task, fallbackIndex), task?.result);
    if (!src || !task?.id) return;
    const payload = { taskId: task.id, order: task.order || fallbackIndex || 0 };
    event.dataTransfer.setData(OUTFIT_RERUN_DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "copyMove";
    resultDragTaskIdRef.current = task.id;
    resultDragPayloadRef.current = payload;
  }

  function beginReferenceImageDrag(event, reference, index = 0) {
    const src = referenceSource(reference);
    beginImageDownloadDrag(event, src, reference?.name || reference?.label || `参考图-${index + 1}`);
  }

  function clearResultDragState() {
    resultDragTaskIdRef.current = "";
    resultDragPayloadRef.current = null;
    setResultReplaceTargetId("");
  }

  function resultDragTaskId(event) {
    try {
      const raw = event.dataTransfer?.getData?.(OUTFIT_RERUN_DRAG_MIME);
      if (!raw) return resultDragTaskIdRef.current || resultDragPayloadRef.current?.taskId || "";
      const payload = JSON.parse(raw);
      return String(payload?.taskId || resultDragPayloadRef.current?.taskId || "");
    } catch {
      return resultDragTaskIdRef.current || resultDragPayloadRef.current?.taskId || "";
    }
  }

  function handleResultReplaceDragOver(event, targetTask) {
    const sourceId = resultDragTaskId(event);
    const sourceTask = tasksRef.current.find((item) => item.id === sourceId);
    if (!canReplaceTaskResult(sourceTask, targetTask)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (resultReplaceTargetId !== targetTask.id) setResultReplaceTargetId(targetTask.id);
  }

  function handleResultReplaceDrop(event, targetTask) {
    const sourceId = resultDragTaskId(event);
    if (!sourceId || sourceId === targetTask?.id) {
      setResultReplaceTargetId("");
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setResultReplaceTargetId("");
    const sourceTask = tasksRef.current.find((item) => item.id === sourceId);
    const latestTarget = tasksRef.current.find((item) => item.id === targetTask.id);
    if (!canReplaceTaskResult(sourceTask, latestTarget)) return;
    const movedResult = sourceTask.result;
    const targetOldResult = latestTarget.result;
    const nextTarget = {
      ...latestTarget,
      result: movedResult,
      prompt: sourceTask.prompt || latestTarget.prompt,
      timingMs: sourceTask.timingMs ?? latestTarget.timingMs,
      finishedAt: sourceTask.finishedAt || Date.now(),
      aspectRatio: sourceTask.aspectRatio || latestTarget.aspectRatio,
      imageSize: sourceTask.imageSize || latestTarget.imageSize,
      cropReturn: normalizeCropReturnMeta(sourceTask.cropReturn || movedResult?.cropReturn),
      savedFilename: sourceTask.savedFilename || "",
      savedPath: sourceTask.savedPath || "",
      autoSaveFailed: Boolean(sourceTask.autoSaveFailed),
      qualityCheck: sourceTask.qualityCheck || latestTarget.qualityCheck,
      rerunOf: latestTarget.rerunOf || "",
      rerunCandidate: false
    };
    setTasks((current) => {
      return current
        .map((item) => item.id === latestTarget.id ? nextTarget : item)
        .filter((item) => item.id !== sourceTask.id);
    });
    if (targetOldResult && targetOldResult !== movedResult) revokeResultImageRuntimeCache(targetOldResult);
    setSelectedTaskIds((current) => {
      if (!current.has(sourceId)) return current;
      const next = new Set(current);
      next.delete(sourceId);
      return next;
    });
    if (preview?.id === sourceId) setPreview(null);
    if (preview?.id === latestTarget.id) setPreview(nextTarget);
    clearResultDragState();
    addEvent("结果覆盖", `已用 #${sourceTask.order || ""} 覆盖 #${latestTarget.order || ""}，原位置已移除`);
  }

  return {
    resultReplaceTargetId,
    setResultReplaceTargetId,
    beginTaskImageDrag,
    beginReferenceImageDrag,
    clearResultDragState,
    resultDragTaskId,
    handleResultReplaceDragOver,
    handleResultReplaceDrop
  };
}
