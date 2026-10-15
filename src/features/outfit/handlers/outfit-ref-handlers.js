// src/features/outfit/handlers/outfit-ref-handlers.js
// P6-1 (V4.0) 2026-10-15：从 src/outfit-workflow.jsx 抽出的「参考图菜单 / 缓存清理 / 历史刷新 / 质检」handler 钩。
// 内容：参考图菜单关闭副作用（closeReferenceMenu / handleReferenceMenuKey，原组件内 useEffect）、
//   markTaskImageBroken（缺图质检）/ clearAll（清空队列+历史）/ clearNonResultImageCache（缓存清理）/ refreshHistory（历史刷新）。
// 模式：沿用 features/outfit/use-outfit-pages.js 的 deps 注入薄壳（V64 use-outfit-settings-intent.js 同款）——
//   每次 render 由调用方重建 ctx 对象传入，钩内不记忆化，handler 每次 render 重建，与搬出前（组件内函数声明）行为完全一致。
// ⚠️ ctx 漏项 = 运行期 undefined（vite build 验不出），由 P6-1 §4 负向对照兜底（scripts/dev/p6-1-handlercheck.mjs）。
// TDZ：钩调用点置于父组件 refreshHistory 之后（原组A区块末，~1437 行处），全部 ctx 字段均在此之前完成初始化；
//   buildCurrentOutfitPageSnapshot / clearSelection 为父组件 hoisted 函数声明，作 ctx 传入安全。
import { useEffect } from "react";
import { defaultOutfitIntent } from "../../../shared/outfit-intent.js";
import { brokenImageReason } from "../../../shared/result-image.js";
import { removeStorageItem } from "../../../lib/storage/json-storage.js";
import {
  OUTFIT_DRAFT_DB_KEY,
  TASK_HISTORY_KEY,
  displayResultImageSource,
  isLiveGenerationTask,
  revokeTaskResultRuntimeCaches,
  outfitLocalSet,
  outfitLocalDeleteByPrefix,
  readTaskHistoryAsync,
  hydrateTasksWithUploadReferences,
  revokePageNonResultImageUrls,
  stripPageNonResultImages,
  stripTaskUploadImageCache,
  persistTaskHistory
} from "../outfit-task.js";
import {
  ensureWorkflowPages,
  stripOutfitPageGlobalSettings,
  serializeDraftPage
} from "../outfit-page-actions.js";

// 与父文件模块级常量同源（仅本钩使用）。
const OUTFIT_TEMP_IMAGE_CACHE_PREFIX = "temp-image-cache:";

export function useOutfitRefHandlers(ctx) {
  const {
    setReferenceContextMenu,
    setBrokenTaskImages,
    setTasks,
    tasks,
    clearSelection,
    addEvent,
    running,
    activeOutfitPage,
    activeOutfitPageId,
    settings,
    outfitPages,
    setOutfitPages,
    setModelImages,
    setClothingImages,
    setReferenceImages,
    setFixedClothingId,
    setOriginalLibrary,
    setCropTarget,
    setLocalEditTarget,
    setImageLightbox,
    setActiveUploadGroup,
    buildCurrentOutfitPageSnapshot,
    outfitIntent,
    modelImages,
    clothingImages,
    referenceImages
  } = ctx;

  // 参考图菜单关闭副作用（原组件内 useEffect）：点击 / 窗口缩放 / ESC 关闭参考图右键菜单。
  // 依赖 setReferenceContextMenu（useState setter，跨渲染稳定），行为与原 `[]` 完全一致。
  useEffect(() => {
    const closeReferenceMenu = () => setReferenceContextMenu(null);
    const handleReferenceMenuKey = (event) => {
      if (event.key === "Escape") setReferenceContextMenu(null);
    };
    window.addEventListener("click", closeReferenceMenu);
    window.addEventListener("resize", closeReferenceMenu);
    window.addEventListener("keydown", handleReferenceMenuKey);
    return () => {
      window.removeEventListener("click", closeReferenceMenu);
      window.removeEventListener("resize", closeReferenceMenu);
      window.removeEventListener("keydown", handleReferenceMenuKey);
    };
  }, [setReferenceContextMenu]);

  /**
   * P1 缺图自愈：结果图真的加载失败时记下来，卡片改为显示可读原因，
   * 并且不再对同一个地址重复请求（避免每次打开页面都刷 404/502）。
   * 记录带失败时的地址，重刷换图后自动失效；同时写进任务记录，重载后依然生效。
   */
  function markTaskImageBroken(task) {
    const src = displayResultImageSource(task?.result);
    if (!task?.id || !src) return;
    const mark = { src, reason: brokenImageReason() };
    setBrokenTaskImages((current) => (
      current[task.id]?.src === src ? current : { ...current, [task.id]: mark }
    ));
    setTasks((current) => current.map((item) => (
      item.id === task.id && item.resultMissing?.src !== src ? { ...item, resultMissing: mark } : item
    )));
  }

  function clearAll() {
    if (tasks.length === 0) return;
    const confirmed = window.confirm("确定清空当前换装生成记录吗？上传图片和原图库不会被清空。");
    if (!confirmed) return;
    revokeTaskResultRuntimeCaches(tasks);
    setTasks([]);
    clearSelection();
    removeStorageItem(TASK_HISTORY_KEY);
    void persistTaskHistory([]);
    addEvent("清空", "生成队列已清空");
  }

  async function clearNonResultImageCache() {
    if (running) {
      addEvent("清理缓存", "当前正在生成，完成后再清理缓存");
      return;
    }
    const confirmed = window.confirm("清理上传图、缩略图和临时草稿缓存？生成结果图和指定文件夹里的图片不会删除。");
    if (!confirmed) return;

    const activeSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    const clearedActiveSnapshot = {
      ...activeSnapshot,
      settings: stripOutfitPageGlobalSettings({
        ...settings,
        // 图2换了，之前分析出来的服装事实不再适用：清掉事实本身，保留部位/层级/穿法选择。
        outfitIntent: { ...outfitIntent, facts: defaultOutfitIntent().facts, factsSource: { mode: "none", sourceId: "", analyzedAt: 0 } }
      })
    };
    const nextPages = ensureWorkflowPages(outfitPages.map((page) => {
      const sourcePage = page.id === activeOutfitPageId ? clearedActiveSnapshot : page;
      revokePageNonResultImageUrls(sourcePage);
      return stripPageNonResultImages(sourcePage);
    }), settings);

    setOutfitPages(nextPages);
    setModelImages([]);
    setClothingImages([]);
    setReferenceImages([]);
    setFixedClothingId("");
    setOriginalLibrary([]);
    setTasks((current) => current.map(stripTaskUploadImageCache));
    setCropTarget(null);
    setLocalEditTarget(null);
    setImageLightbox(null);
    setActiveUploadGroup("model");
    clearSelection();

    await outfitLocalSet(OUTFIT_DRAFT_DB_KEY, {
      activeId: activeOutfitPageId,
      pages: nextPages.map(serializeDraftPage),
      updatedAt: Date.now()
    });
    const deletedTempCacheCount = await outfitLocalDeleteByPrefix(OUTFIT_TEMP_IMAGE_CACHE_PREFIX);
    addEvent("清理缓存", `已清理上传图和临时缓存，结果图保留${deletedTempCacheCount ? `（临时缓存 ${deletedTempCacheCount} 项）` : ""}`);
  }

  async function refreshHistory() {
    const history = await readTaskHistoryAsync();
    const hydratedHistory = hydrateTasksWithUploadReferences(history, {
      modelImages,
      clothingImages,
      referenceImages
    });
    setTasks((current) => {
      const runningItems = current.filter(isLiveGenerationTask);
      return [...hydratedHistory, ...runningItems];
    });
    clearSelection();
    addEvent("刷新", `已载入 ${history.length} 张历史图片`);
  }

  return {
    markTaskImageBroken,
    clearAll,
    clearNonResultImageCache,
    refreshHistory
  };
}
