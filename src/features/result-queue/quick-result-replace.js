// 结果卡拖拽替换（快捷生成侧）—— 工厂形态
//
// 形态说明：这里是【普通工厂】，不是 React hook —— 内部不使用 useState/useCallback/useMemo，
// 也不 import React。调用方在组件体内每次 render 调一次，得到一组捕获了最新 state 与 setter
// 的普通函数 —— 与原先「组件内 function 声明」的语义逐字相同（都是每次 render 重建闭包）。
//
// 🔴 依赖全部由 deps 注入，本文件不得直接引用组件内的 state / setter / addEvent。
//    解构保持【同名】，因此函数体从 src/main.jsx 逐字搬来后一字未改（V11-RF-068）。
//
// ⚠️ 跨文件引用只写函数名、不写行号：行号随任意一侧的编辑就会漂移，
//    后人按图索骥只会被引到错处，刻意不补。

import { imageSourceFromResult } from "../../shared/models.js";

export function createQuickResultReplace(deps) {
  const {
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
  } = deps;

  function quickResultDragId(event) {
    const fromEvent = event.dataTransfer?.getData?.(QUICK_RESULT_DRAG_TYPE) || "";
    return fromEvent || quickResultDragIdRef.current || "";
  }

  function canReplaceQuickResult(source, target) {
    return Boolean(
      source?.id
      && target?.id
      && source.id !== target.id
      && (!source.source || source.source === "quickgen")
      && (!target.source || target.source === "quickgen")
      && imageSourceFromResult(source.image)
      && imageSourceFromResult(target.image)
    );
  }

  function clearQuickResultDragState() {
    quickResultDragIdRef.current = "";
    setQuickResultReplaceTargetId("");
  }

  function handleQuickResultReplaceDragOver(event, target) {
    const sourceId = quickResultDragId(event);
    const source = results.find((item) => item.id === sourceId);
    if (!canReplaceQuickResult(source, target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (quickResultReplaceTargetId !== target.id) setQuickResultReplaceTargetId(target.id);
  }

  function handleQuickResultReplaceDrop(event, target) {
    const sourceId = quickResultDragId(event);
    if (!sourceId || sourceId === target?.id) {
      clearQuickResultDragState();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    clearQuickResultDragState();
    const source = results.find((item) => item.id === sourceId);
    const latestTarget = results.find((item) => item.id === target.id);
    if (!canReplaceQuickResult(source, latestTarget)) return;
    const nextTarget = {
      ...source,
      id: latestTarget.id,
      replacedFromResultId: source.id,
      submittedAt: latestTarget.submittedAt ?? latestTarget.createdAt ?? source.submittedAt,
      createdAt: latestTarget.createdAt ?? source.createdAt
    };
    setResults((current) => current
      .map((item) => item.id === latestTarget.id ? nextTarget : item)
      .filter((item) => item.id !== source.id));
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(source.id);
      return next;
    });
    if (previewResult?.id === source.id || previewResult?.id === latestTarget.id) {
      setPreviewResult(nextTarget);
    }
    void removeHistoryResults([source.id, latestTarget.id]).then(() => saveHistoryResults([nextTarget]));
    addEvent("结果覆盖", "已用拖拽图片覆盖目标图片，原位置已移除");
  }
  return {
    quickResultDragId,
    canReplaceQuickResult,
    clearQuickResultDragState,
    handleQuickResultReplaceDragOver,
    handleQuickResultReplaceDrop
  };
}
