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
//
// 🔴 本文件的函数是 main.jsx 单侧实现。outfit 侧存在同名/对位函数
//    （clearAll / deleteSelected / deleteResult ↔ deleteResultTask /
//     flashDownloadFeedback（1300ms 有清理 vs 1100ms 无清理）/
//     resultDragDownloadName ↔ taskDragDownloadName（字段优先级与序号规则不同）/
//     blobFromImageItem ↔ blobFromOutfitImage），
//     已在 V11-RF-058 / RF-052 判为【真分叉，登记不搬】。
//     ⇒ 严禁与 outfit 侧统一；本文件不向 outfit 侧共享。

import { imageSourceFromResult } from "../../shared/models.js";
import {
  beginImageDownloadDrag,
  brokenImageReason,
  dragDownloadDateStamp,
  padDragDownloadNumber,
  referenceSource
} from "../../shared/result-image.js";
import { fetchImageBlob } from "../../api/assets.js";

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

// === RF-074 阶段 1 · result/download 域（main.jsx 单侧抽出的 B3 工厂）===
// 十个函数体从 src/main.jsx 逐字搬来，一字未改；依赖全部经 deps 注入，
// 解构保持同名 ⇒ main.jsx 里 20 余处调用点零改动。
export function createResultDownload(deps) {
  const {
    quickResults,
    selectedIds,
    addEvent,
    quickResultDragIdRef,
    QUICK_RESULT_DRAG_TYPE,
    copyText,
    saveDirectory,
    refreshSaveDirectory,
    setSaveDirectory,
    setDirectoryDraft,
    setDownloadFeedbackIds,
    downloadFeedbackTimersRef
  } = deps;

  async function blobFromImageItem(item) {
    const src = imageSourceFromResult(item?.image);
    if (!src) throw new Error("图片地址无效");
    return fetchImageBlob(src, "图片下载失败");
  }

  function resultDragDownloadName(item, fallbackIndex = null) {
    const savedName = item?.savedFilename || item?.filename;
    if (savedName) return savedName;
    // 拖拽下载无法读取目标文件夹序号，使用生成日期时间+列表序号避免模型名反复重名。
    const createdAt = Number(item?.createdAt || item?.submittedAt || Date.now());
    const sequence = Number.isFinite(fallbackIndex)
      ? fallbackIndex + 1
      : Math.max(1, Math.round(createdAt % 100000));
    return `静音AI绘画-${dragDownloadDateStamp(createdAt)}-${padDragDownloadNumber(sequence, 4)}`;
  }

  function beginResultImageDrag(event, item, fallbackIndex = null) {
    const src = imageSourceFromResult(item?.image);
    if (!src) return;
    beginImageDownloadDrag(event, src, resultDragDownloadName(item, fallbackIndex), item?.image);
    event.dataTransfer.setData("application/x-jingyin-result-id", item.id || "");
    event.dataTransfer.setData(QUICK_RESULT_DRAG_TYPE, item.id || "");
    event.dataTransfer.effectAllowed = "copyMove";
    quickResultDragIdRef.current = item.id || "";
  }

  function beginReferenceImageDrag(event, reference, index = 0) {
    const src = referenceSource(reference);
    beginImageDownloadDrag(event, src, reference?.name || reference?.label || `参考图-${index + 1}`);
  }

  async function copyImage(item) {
    const src = imageSourceFromResult(item?.image);
    try {
      const blob = await blobFromImageItem(item);
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ [blob.type || "image/png"]: blob })]);
        addEvent("复制", "图片已复制到剪贴板");
        return;
      }
      await copyText(src, "图片地址已复制");
    } catch {
      await copyText(src, "图片地址已复制");
    }
  }

  async function downloadItem(item, _index = 0) {
    try {
      const directory = saveDirectory || await refreshSaveDirectory();
      const response = await fetch("/api/save-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directory,
          item
        })
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "保存图片失败");
      setSaveDirectory(payload.directory);
      setDirectoryDraft(payload.directory);
      flashDownloadFeedback(item.id);
      addEvent("下载", `已保存到 ${payload.filename}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEvent("下载失败", message);
    }
  }

  async function autoSaveGeneratedItems(items) {
    if (!items?.length) return 0;
    let savedCount = 0;
    try {
      const directory = saveDirectory || await refreshSaveDirectory();
      for (const item of items) {
        const response = await fetch("/api/save-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            directory,
            item
          })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) throw new Error(payload?.message || "保存图片失败");
        setSaveDirectory(payload.directory);
        setDirectoryDraft(payload.directory);
        savedCount += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      addEvent("自动保存失败", message);
    }
    return savedCount;
  }

  function flashDownloadFeedback(id) {
    if (!id) return;
    setDownloadFeedbackIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    const previousTimer = downloadFeedbackTimersRef.current.get(id);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      setDownloadFeedbackIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      downloadFeedbackTimersRef.current.delete(id);
    }, 1300);
    downloadFeedbackTimersRef.current.set(id, timer);
  }

  async function downloadSelected() {
    let saved = 0;
    for (const [index, item] of quickResults.entries()) {
      if (selectedIds.has(item.id)) void downloadItem(item, index);
      if (selectedIds.has(item.id)) saved += 1;
    }
    if (saved > 0) addEvent("下载选中", `已提交 ${saved} 张保存任务`);
  }

  async function downloadAll() {
    quickResults.forEach((item, index) => void downloadItem(item, index));
    if (quickResults.length > 0) addEvent("下载全部", `已提交 ${quickResults.length} 张保存任务`);
  }

  return {
    blobFromImageItem,
    resultDragDownloadName,
    beginResultImageDrag,
    beginReferenceImageDrag,
    copyImage,
    downloadItem,
    autoSaveGeneratedItems,
    flashDownloadFeedback,
    downloadSelected,
    downloadAll
  };
}
// === RF-074 阶段 2 · result/history 域（main.jsx 单侧抽出的 B3 工厂）===
// 七个函数体（含 markResultImageBroken 的 JSDoc）从 src/main.jsx 逐字搬来，一字未改；
// removeDetailResultIds 只被 deleteSelected / deleteResult 互调 ⇒ 内部函数，不导出、不进 deps。
export function createResultActions(deps) {
  const {
    setSelectedIds,
    selectedIds,
    activeView,
    quickResults,
    setResults,
    setBrokenResultImages,
    detailInfoSelection,
    setDetailInfoSelection,
    setDetailGroups,
    removeHistoryResults,
    loadHistoryResults,
    hydrateDetailGroupsWithHistory,
    addEvent
  } = deps;

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = activeView === "quickgen"
      ? quickResults.filter((item) => selectedIds.has(item.id)).map((item) => item.id)
      : Array.from(selectedIds);
    if (ids.length === 0) return;
    setResults((current) => current.filter((item) => !ids.includes(item.id)));
    removeDetailResultIds(ids);
    void removeHistoryResults(ids);
    clearSelection();
    addEvent("删除", `已删除 ${ids.length} 张图片`);
  }

  function deleteResult(id) {
    setResults((current) => current.filter((item) => item.id !== id));
    removeDetailResultIds([id]);
    void removeHistoryResults([id]);
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setBrokenResultImages((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    if (detailInfoSelection?.resultId === id) setDetailInfoSelection(null);
    addEvent("删除", "已删除当前图片");
  }

  /**
   * P1 缺图自愈：图片真的加载失败时记下来，卡片改为显示可读原因，
   * 并且不再对同一个地址重复请求（避免每次打开页面都刷 404/502）。
   * 记录里带上失败时的地址，重刷换图后自动失效。
   */
  function markResultImageBroken(item) {
    const src = imageSourceFromResult(item?.image);
    if (!item?.id || !src) return;
    setBrokenResultImages((current) => (
      current[item.id]?.src === src
        ? current
        : { ...current, [item.id]: { src, reason: brokenImageReason() } }
    ));
  }

  function removeDetailResultIds(ids) {
    setDetailGroups((current) => current.map((group) => ({
      ...group,
      prompts: group.prompts.map((prompt) => ({
        ...prompt,
        results: (prompt.results || []).filter((result) => !ids.includes(result.id))
      }))
    })));
  }

  async function refreshHistory() {
    const storedResults = await loadHistoryResults();
    setResults(storedResults);
    setDetailGroups((current) => hydrateDetailGroupsWithHistory(current, storedResults));
    clearSelection();
    addEvent("刷新", `已载入 ${storedResults.length} 张历史图片`);
  }

  async function syncHistoryFromServer() {
    const storedResults = await loadHistoryResults();
    setResults(storedResults);
    setDetailGroups((current) => hydrateDetailGroupsWithHistory(current, storedResults));
  }

  return {
    toggleSelected,
    clearSelection,
    deleteSelected,
    deleteResult,
    markResultImageBroken,
    refreshHistory,
    syncHistoryFromServer
  };
}