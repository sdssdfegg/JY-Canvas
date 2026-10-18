// src/features/outfit/use-outfit-pages.js
// V66 (P5-4) 2026-10-15：从 src/outfit-workflow.jsx（1268–1466，派发日实测）整块搬出的「页面管理」handler 钩。
// 内容：switchOutfitPage / createOutfitPageFromCurrent / beginOutfitPageDrag / updateOutfitPageDropTarget /
//   dropOutfitPage / renameOutfitPage / revokeOutfitPageAssets / toggleOutfitPageDeleteLock / deleteOutfitPage。
// 模式：沿用 features/savedir/save-directory.js 的 deps 注入薄壳（V64 use-outfit-settings-intent.js 同款）——
//   每次 render 由调用方重建 deps 对象传入，钩内不记忆化，handler 每次 render 重建，与搬出前（组件内函数声明）
//   行为完全一致。⚠️ deps 漏项 = 运行期 undefined（vite build 验不出），由 V66 §3.3 负向对照兜底。
// TDZ：钩调用点置于原区块（组件内 1268 行处），全部 deps 均在此之前完成初始化；
//   buildCurrentOutfitPageSnapshot / loadOutfitPage 为调用方 hoisted 函数声明，作 deps 传入安全。
import {
  CUSTOM_UPLOAD_LABELS,
  DEFAULT_OUTFIT_PAGE_NAME,
  BACKGROUND_CHANGE_DEFAULT_PROMPT,
  BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT,
  BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT,
  DESIGN_DRAFT_DEFAULT_PROMPT,
  FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT,
  FACE_SWAP_DEFAULT_PROMPT,
  FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT,
  FACE_SWAP_LOOSE_DEFAULT_PROMPT,
  FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT,
  FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT,
  FACE_SWAP_SHORT_DEFAULT_PROMPT,
  LEGACY_FACE_SWAP_DEFAULT_PROMPT,
  LOCAL_DETAIL_DEFAULT_PROMPT,
  OUTFIT_DEFAULT_PROMPT,
  GARMENT_RECOLOR_DEFAULT_PROMPT,
  POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT,
  POSE_REMIX_DEFAULT_PROMPT,
  RANDOM_BACKGROUND_DEFAULT_PROMPT,
  RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT,
  RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT,
  RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT,
  moveItemByDrop
} from "./outfit-top.js";
import {
  defaultPromptForWorkflowMode,
  defaultUploadLabelsForPage,
  forgetDeletedWorkflowMode,
  inferOutfitWorkflowMode,
  isSingletonWorkflowMode,
  makeOutfitPage,
  mergeOutfitPageSettings,
  normalizeOutfitPageName,
  normalizeUploadLabels,
  rememberDeletedWorkflowMode,
  sameUploadLabels,
  stripOutfitPageGlobalSettings
} from "./outfit-page-actions.js";
import { isLiveGenerationTask, revokeImageUrls } from "./outfit-task.js";
import {
  WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT,
  WHITE_REFINE_DEFAULT_PROMPT
} from "../../shared/retouch-intent.js";

// 2026-10-15 V66：随 createOutfitPageFromCurrent 从主文件模块级（原 223 行）迁入，
// 主文件搬迁后零使用，不再回导。
const DEFAULT_CUSTOM_PAGE_NAME = "临时需求";

export function useOutfitPages(deps) {
  const {
    activeOutfitPageId, setActiveOutfitPageId,
    tasks, running, setRunning,
    runningGenerationCountRef,
    outfitPages, setOutfitPages,
    draggedPageId, setDraggedPageId,
    pageDropTarget, setPageDropTarget,
    uploadLabels, setUploadLabels,
    settings, setSettings,
    activeOutfitPage,
    addEvent, loadOutfitPage, endOutfitPageDrag, buildCurrentOutfitPageSnapshot
  } = deps;

  function switchOutfitPage(pageId) {
    if (!pageId || pageId === activeOutfitPageId) return;
    const hasLiveGeneration = tasks.some(isLiveGenerationTask);
    if (running && hasLiveGeneration) {
      addEvent("页面切换", "当前正在生成，完成后再切换页面");
      return;
    }
    if (running && !hasLiveGeneration) {
      runningGenerationCountRef.current = 0;
      setRunning(false);
    }
    const target = outfitPages.find((page) => page.id === pageId);
    if (!target) return;
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    setOutfitPages((current) => current.map((page) => (
      page.id === activeOutfitPageId ? currentSnapshot : page
    )));
    setActiveOutfitPageId(pageId);
    loadOutfitPage(target);
  }

  function createOutfitPageFromCurrent() {
    if (running) {
      addEvent("新建页面", "当前正在生成，完成后再新建页面");
      return;
    }
    const page = makeOutfitPage(`${DEFAULT_CUSTOM_PAGE_NAME} ${outfitPages.length + 1}`, {
      settings: {
        ...settings,
        prompt: GARMENT_RECOLOR_DEFAULT_PROMPT,
        productNote: "",
        smartIntervention: false
      },
      uploadLabels: CUSTOM_UPLOAD_LABELS,
      activeUploadGroup: "model",
      allowEmptyPrompt: true
    });
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    setOutfitPages((current) => [
      ...current.map((item) => (item.id === activeOutfitPageId ? currentSnapshot : item)),
      page
    ]);
    setActiveOutfitPageId(page.id);
    loadOutfitPage(page);
    addEvent("新建页面", `已创建「${page.name}」`);
  }

  function beginOutfitPageDrag(event, pageId) {
    setDraggedPageId(pageId);
    setPageDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", pageId);
  }

  function updateOutfitPageDropTarget(event, pageId) {
    const sourceId = draggedPageId || event.dataTransfer.getData("text/plain");
    if (!sourceId || sourceId === pageId) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    setPageDropTarget({ id: pageId, placement });
  }

  function dropOutfitPage(event, targetId) {
    const sourceId = draggedPageId || event.dataTransfer.getData("text/plain");
    if (!sourceId || !targetId || sourceId === targetId) {
      endOutfitPageDrag();
      return;
    }
    event.preventDefault();
    const placement = pageDropTarget?.id === targetId ? pageDropTarget.placement : "before";
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    setOutfitPages((current) => {
      const pages = current.map((page) => (
        page.id === activeOutfitPageId ? currentSnapshot : page
      ));
      return moveItemByDrop(pages, sourceId, targetId, placement);
    });
    endOutfitPageDrag();
    addEvent("页面排序", "顺序已更新");
  }

  function renameOutfitPage(pageId = activeOutfitPageId) {
    const page = outfitPages.find((item) => item.id === pageId) || activeOutfitPage;
    if (!page) return;
    const input = window.prompt("修改页面名称", page.name || DEFAULT_OUTFIT_PAGE_NAME);
    const name = normalizeOutfitPageName(input, page.name || DEFAULT_OUTFIT_PAGE_NAME);
    if (!name || name === page.name) return;
    const oldDefaultLabels = defaultUploadLabelsForPage(page.name);
    const shouldApplyNewDefaults = sameUploadLabels(
      page.id === activeOutfitPageId ? uploadLabels : page.uploadLabels,
      oldDefaultLabels
    );
    const nextUploadLabels = shouldApplyNewDefaults
      ? normalizeUploadLabels(defaultUploadLabelsForPage(name), name)
      : normalizeUploadLabels(page.id === activeOutfitPageId ? uploadLabels : page.uploadLabels, name);
    const oldMode = inferOutfitWorkflowMode(page.name, page.id === activeOutfitPageId ? uploadLabels : page.uploadLabels);
    const nextMode = inferOutfitWorkflowMode(name, nextUploadLabels);
    const pageSettings = page.id === activeOutfitPageId ? settings : mergeOutfitPageSettings(page.settings, settings);
    const currentPrompt = String(pageSettings.prompt || "");
    const shouldApplyPromptDefault = shouldApplyNewDefaults
      && oldMode !== nextMode
      && [
        defaultPromptForWorkflowMode(oldMode),
        OUTFIT_DEFAULT_PROMPT,
        LOCAL_DETAIL_DEFAULT_PROMPT,
        POSE_REMIX_DEFAULT_PROMPT,
        BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT,
        BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT,
        BACKGROUND_CHANGE_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT,
        RANDOM_BACKGROUND_DEFAULT_PROMPT,
        WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT,
        WHITE_REFINE_DEFAULT_PROMPT,
        FACE_SWAP_SHORT_DEFAULT_PROMPT,
        FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT,
        FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT,
        FACE_SWAP_DEFAULT_PROMPT,
        FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT,
        FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT,
        LEGACY_FACE_SWAP_DEFAULT_PROMPT,
        FACE_SWAP_LOOSE_DEFAULT_PROMPT,
        POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT,
        DESIGN_DRAFT_DEFAULT_PROMPT
      ].includes(currentPrompt);
    const nextSettings = shouldApplyPromptDefault
      ? {
          ...pageSettings,
          prompt: defaultPromptForWorkflowMode(nextMode),
          productNote: ""
        }
      : pageSettings;
    const nextAllowsEmptyPrompt = nextMode === "custom" || nextMode === "local-detail";
    setOutfitPages((current) => current.map((item) => (
      item.id === pageId ? { ...item, name, uploadLabels: nextUploadLabels, settings: stripOutfitPageGlobalSettings(nextSettings, { allowEmptyPrompt: nextAllowsEmptyPrompt }) } : item
    )));
    if (pageId === activeOutfitPageId) {
      setUploadLabels(nextUploadLabels);
      if (shouldApplyPromptDefault) setSettings(nextSettings);
    }
    if (isSingletonWorkflowMode(nextMode)) forgetDeletedWorkflowMode(nextMode);
    addEvent("页面名称", `已改为「${name}」`);
  }

  function revokeOutfitPageAssets(page) {
    [page?.modelImages, page?.clothingImages, page?.referenceImages].forEach((list) => {
      if (Array.isArray(list)) list.forEach(revokeImageUrls);
    });
    if (Array.isArray(page?.originalLibrary)) {
      page.originalLibrary.forEach((item) => {
        if (item?.url) URL.revokeObjectURL(item.url);
      });
    }
  }

  function toggleOutfitPageDeleteLock(pageId = activeOutfitPageId) {
    const page = outfitPages.find((item) => item.id === pageId) || activeOutfitPage;
    if (!page) return;
    const nextLocked = !page.deleteLocked;
    setOutfitPages((current) => current.map((item) => (
      item.id === pageId ? { ...item, deleteLocked: nextLocked } : item
    )));
    addEvent("页面防误删", nextLocked ? "已锁定当前页删除" : "已解除当前页删除锁");
  }

  function deleteOutfitPage(pageId = activeOutfitPageId) {
    if (running) {
      addEvent("删除页面", "当前正在生成，完成后再删除页面");
      return;
    }
    const currentSnapshot = buildCurrentOutfitPageSnapshot(activeOutfitPage);
    const pagesWithCurrent = outfitPages.map((page) => (
      page.id === activeOutfitPageId ? currentSnapshot : page
    ));
    if (pagesWithCurrent.length <= 1) {
      addEvent("删除页面", "至少保留一个页面");
      return;
    }
    const targetIndex = pagesWithCurrent.findIndex((page) => page.id === pageId);
    if (targetIndex < 0) return;
    const target = pagesWithCurrent[targetIndex];
    if (target.deleteLocked) {
      addEvent("删除页面", "页面已锁定，先解锁再删除");
      return;
    }
    const confirmed = window.confirm(`确定删除「${target.name || DEFAULT_OUTFIT_PAGE_NAME}」吗？该页面里的上传图和生成队列会一起移除。`);
    if (!confirmed) return;
    const remaining = pagesWithCurrent.filter((page) => page.id !== pageId);
    const nextPage = remaining[Math.min(targetIndex, remaining.length - 1)] || remaining[0];
    revokeOutfitPageAssets(target);
    const deletedMode = inferOutfitWorkflowMode(target.name, target.uploadLabels);
    if (isSingletonWorkflowMode(deletedMode)) rememberDeletedWorkflowMode(deletedMode);
    setOutfitPages(remaining);
    if (pageId === activeOutfitPageId && nextPage) {
      setActiveOutfitPageId(nextPage.id);
      loadOutfitPage(nextPage);
    }
    addEvent("删除页面", `已删除「${target.name || DEFAULT_OUTFIT_PAGE_NAME}」`);
  }

  return {
    switchOutfitPage,
    createOutfitPageFromCurrent,
    beginOutfitPageDrag,
    updateOutfitPageDropTarget,
    dropOutfitPage,
    renameOutfitPage,
    revokeOutfitPageAssets,
    toggleOutfitPageDeleteLock,
    deleteOutfitPage
  };
}
