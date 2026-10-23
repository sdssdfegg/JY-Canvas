// 模式：V5.0-010（V135 第⑤项复扫落地）——页面切换域整块迁入本 hook。
// 域 = 原 src/outfit-workflow.jsx 749–803 的三个函数，按原声明顺序逐字迁移
//   （buildCurrentOutfitPageSnapshot → resetOutfitPageTransients → loadOutfitPage）。
// 行为契约：零行为变化（纯迁移）——三个函数体逐字不动；唯一外部差异是 clearSelection
//   经 ctx.getClearSelection() 执行（调用方注入 () => clearSelectionRef.current?.()，
//   useOutfitSelectionHandlers 晚于调用方 hook 位，故 ref 晚绑定）。
// 调用点约束：调用方须将 useOutfitPageSwitch 置于 useOutfitEffects 之前
//   （effect 簇 ctx 在渲染期消费 loadOutfitPage / buildCurrentOutfitPageSnapshot——
//    原代码是 hoisted function 声明故晚引用无碍，改 hook 解构后必须提前，否则 TDZ）；
//   本 hook 是纯函数工厂（内部无 React hook）⇒ 提前零 hook 顺序影响。
//   use-outfit-pages.js 的事件 handler 在触发时才读取三函数引用，无时序约束。
import { DEFAULT_OUTFIT_PAGE_NAME } from "../outfit-top.js";
import {
  inferOutfitWorkflowMode,
  mergeOutfitPageSettings,
  normalizeOutfitPageName,
  normalizeUploadLabels,
  stripOutfitPageGlobalSettings
} from "../outfit-page-actions.js";
import { hydrateTasksWithUploadReferences } from "../outfit-task.js";

export function useOutfitPageSwitch(ctx) {
  const {
    activeOutfitPage, activeOutfitPageId,
    uploadLabels, setUploadLabels,
    settings, setSettings,
    modelImages, setModelImages,
    clothingImages, setClothingImages,
    referenceImages, setReferenceImages,
    fixedClothingId, setFixedClothingId,
    tasks, setTasks,
    originalLibrary, setOriginalLibrary,
    activeUploadGroup, setActiveUploadGroup,
    setResultFilter,
    setPreview,
    setImageLightbox,
    setCropTarget,
    setLocalEditTarget,
    setDownloadFeedbackIds,
    setInlineMessage,
    setIsPromptAssistantOpen,
    setEditingPrompt,
    getClearSelection
  } = ctx;

  function buildCurrentOutfitPageSnapshot(basePage = activeOutfitPage) {
    const snapshotUploadLabels = uploadLabels;
    const snapshotWorkflowMode = inferOutfitWorkflowMode(basePage.name, snapshotUploadLabels);
    const snapshotAllowsEmptyPrompt = snapshotWorkflowMode === "custom" || snapshotWorkflowMode === "local-detail";
    return {
      ...basePage,
      id: basePage.id || activeOutfitPageId,
      name: normalizeOutfitPageName(basePage.name, DEFAULT_OUTFIT_PAGE_NAME),
      deleteLocked: Boolean(basePage.deleteLocked),
      settings: stripOutfitPageGlobalSettings(settings, { allowEmptyPrompt: snapshotAllowsEmptyPrompt }),
      modelImages,
      clothingImages,
      referenceImages,
      fixedClothingId,
      tasks,
      originalLibrary,
      activeUploadGroup,
      uploadLabels: snapshotUploadLabels
    };
  }

  function resetOutfitPageTransients() {
    getClearSelection();
    setResultFilter("all");
    setPreview(null);
    setImageLightbox(null);
    setCropTarget(null);
    setLocalEditTarget(null);
    setDownloadFeedbackIds(() => new Set());
    setInlineMessage("");
    setIsPromptAssistantOpen(false);
    setEditingPrompt(null);
  }

  function loadOutfitPage(page) {
    const pageWorkflowMode = inferOutfitWorkflowMode(page.name, page.uploadLabels);
    const pageAllowsEmptyPrompt = pageWorkflowMode === "custom" || pageWorkflowMode === "local-detail";
    const pageModelImages = Array.isArray(page.modelImages) ? page.modelImages : [];
    const pageClothingImages = Array.isArray(page.clothingImages) ? page.clothingImages : [];
    const pageReferenceImages = Array.isArray(page.referenceImages) ? page.referenceImages : [];
    setSettings(mergeOutfitPageSettings(page.settings, settings, { allowEmptyPrompt: pageAllowsEmptyPrompt }));
    setModelImages(pageModelImages);
    setClothingImages(pageClothingImages);
    setReferenceImages(pageReferenceImages);
    setFixedClothingId(page.fixedClothingId || "");
    setTasks(hydrateTasksWithUploadReferences(page.tasks, {
      modelImages: pageModelImages,
      clothingImages: pageClothingImages,
      referenceImages: pageReferenceImages
    }));
    setOriginalLibrary(Array.isArray(page.originalLibrary) ? page.originalLibrary : []);
    setActiveUploadGroup(page.activeUploadGroup || "model");
    setUploadLabels(normalizeUploadLabels(page.uploadLabels || {}, page.name));
    resetOutfitPageTransients();
  }
  return { buildCurrentOutfitPageSnapshot, resetOutfitPageTransients, loadOutfitPage };
}
