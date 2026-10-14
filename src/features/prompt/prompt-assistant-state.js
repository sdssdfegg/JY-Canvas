// V57（P3-2）：主画板提示词助手的纯逻辑 / hook（零 JSX）。
// 从 src/main.jsx 抽出：私有 UI 状态 + usePromptLibrary 调用 + 预设持久化 effect
// + 主画板专属的「分类拖拽」系列函数。
// 共享数据（promptPresets / promptCategories）仍由 App() 持有并下发，不在此处定义。
// 注意：draggedPromptCategory / promptCategoryDropTarget 因被 App 的 usePreviewDrag
// 作为 window 拖拽结束的重置目标（resetDragged / resetDropTarget），必须留在 App，
// 此处仅接收其 value / setter 并透传给 UI 与拖拽函数。
import { useEffect, useMemo, useState } from "react";
import {
  normalizePromptCategories,
  promptFallbackCategory,
  usePromptLibrary
} from "../../shared/prompt-library.js";
import { PROMPT_CATEGORIES_KEY, PROMPT_PRESETS_KEY } from "../../shared/app-defaults.js";
import { writeJsonStorage } from "../../lib/storage/json-storage.js";

const PROMPT_CATEGORY_DRAG_TYPE = "application/x-jingyin-prompt-category";

export function usePromptAssistantState({
  presets,
  setPresets,
  categories,
  setCategories,
  settings,
  updateSetting,
  addEvent,
  makePresetId,
  endPromptCategoryDrag,
  onApplyPreset,
  draggedPromptCategory,
  setDraggedPromptCategory,
  promptCategoryDropTarget,
  setPromptCategoryDropTarget
}) {
  // ---- 私有 UI 状态（仅主画板助理）----
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [promptCategory, setPromptCategory] = useState("全部");
  const [promptSearch, setPromptSearch] = useState("");
  const [draggedPromptId, setDraggedPromptId] = useState(null);
  const [promptDropCategory, setPromptDropCategory] = useState("");

  // ---- 共享逻辑（已收口在 usePromptLibrary）----
  const {
    applyPromptPreset,
    editPromptPreset,
    addPromptCategory,
    renamePromptCategory,
    deletePromptPreset,
    beginPromptDrag,
    endPromptDrag,
    dropPromptOnCategory,
    dropPromptOnPreset,
    openNewPromptEditor,
    updateEditingPrompt,
    saveEditingPrompt
  } = usePromptLibrary({
    categories,
    setCategories,
    activeCategory: promptCategory,
    setActiveCategory: setPromptCategory,
    setPresets,
    editing: editingPrompt,
    setEditing: setEditingPrompt,
    draggedId: draggedPromptId,
    setDraggedId: setDraggedPromptId,
    setDropCategory: setPromptDropCategory,
    promptText: settings.prompt.trim(),
    updateSetting,
    makePresetId,
    notify: addEvent,
    onApplyPreset
  });

  // ---- 过滤（搜索 + 分类）----
  const filteredPromptPresets = useMemo(() => {
    const keyword = promptSearch.trim().toLowerCase();
    return presets.filter((preset) => {
      const matchesCategory = promptCategory === "全部" || preset.category === promptCategory;
      const matchesKeyword = !keyword
        || preset.title.toLowerCase().includes(keyword)
        || preset.content.toLowerCase().includes(keyword);
      return matchesCategory && matchesKeyword;
    });
  }, [presets, promptCategory, promptSearch]);

  // ---- 持久化（共享 presets / categories，随数据走）----
  useEffect(() => {
    writeJsonStorage(PROMPT_PRESETS_KEY, presets);
  }, [presets]);

  useEffect(() => {
    writeJsonStorage(
      PROMPT_CATEGORIES_KEY,
      categories.filter((category) => category !== "全部")
    );
  }, [categories]);

  useEffect(() => {
    if (promptCategory !== "全部" && !categories.includes(promptCategory)) {
      setPromptCategory(categories.find((category) => category !== "全部") || "全部");
    }
  }, [categories, promptCategory]);

  // ---- 主画板专属：分类拖拽 ----
  function deletePromptCategory(category) {
    if (!category || category === "全部") return;
    const fallback = promptFallbackCategory(categories, category);
    const shouldDelete = window.confirm(
      `删除分类「${category}」？里面的提示词会移动到「${fallback}」。`
    );
    if (!shouldDelete) return;
    setCategories((current) =>
      normalizePromptCategories(current.filter((item) => item !== category))
    );
    setPresets((current) =>
      current.map((preset) =>
        preset.category === category ? { ...preset, category: fallback } : preset
      )
    );
    if (promptCategory === category) setPromptCategory(fallback);
    if (editingPrompt?.category === category) updateEditingPrompt("category", fallback);
    addEvent("提示词分类", `已删除「${category}」，提示词已移动到「${fallback}」`);
  }

  function promptCategoryFromDrag(event) {
    return draggedPromptCategory || event.dataTransfer.getData(PROMPT_CATEGORY_DRAG_TYPE);
  }

  function isPromptCategoryDrag(event) {
    return Boolean(
      draggedPromptCategory
        || Array.from(event.dataTransfer?.types || []).includes(PROMPT_CATEGORY_DRAG_TYPE)
    );
  }

  function promptCategoryDropEdge(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2 ? "after" : "before";
  }

  function beginPromptCategoryDrag(event, category) {
    if (!category || category === "全部") return;
    setDraggedPromptCategory(category);
    setPromptDropCategory("");
    setPromptCategoryDropTarget(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(PROMPT_CATEGORY_DRAG_TYPE, category);
  }

  function dragPromptCategoryOver(event, category) {
    if (category === "全部") return;
    if (isPromptCategoryDrag(event)) {
      const source = promptCategoryFromDrag(event);
      if (!source || source === category) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setPromptCategoryDropTarget({ category, edge: promptCategoryDropEdge(event) });
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setPromptDropCategory(category);
  }

  function dropPromptCategoryOnCategory(event, category) {
    const source = promptCategoryFromDrag(event);
    if (
      !source
      || source === "全部"
      || !category
      || category === "全部"
      || source === category
    ) return false;
    event.preventDefault();
    const dropTarget = promptCategoryDropTarget?.category === category
      ? promptCategoryDropTarget
      : { category, edge: promptCategoryDropEdge(event) };
    setCategories((current) => {
      if (!current.includes(source) || !current.includes(category)) return current;
      const next = current.filter((item) => item !== source);
      let insertIndex = next.indexOf(category);
      if (insertIndex < 0) return current;
      if (dropTarget.edge === "after") insertIndex += 1;
      next.splice(Math.max(1, insertIndex), 0, source);
      return normalizePromptCategories(next);
    });
    setDraggedPromptCategory("");
    setPromptCategoryDropTarget(null);
    addEvent("提示词分类", "分类顺序已更新");
    return true;
  }

  function dropOnPromptCategory(event, category) {
    if (isPromptCategoryDrag(event)) {
      dropPromptCategoryOnCategory(event, category);
      return;
    }
    dropPromptOnCategory(event, category);
  }

  return {
    // 共享数据（过滤后）
    filteredPromptPresets,
    // 私有状态 value
    editingPrompt,
    setEditingPrompt,
    promptCategory,
    setPromptCategory,
    promptSearch,
    setPromptSearch,
    draggedPromptId,
    promptDropCategory,
    setPromptDropCategory,
    // 留在 App 的分类拖拽状态（usePreviewDrag 重置目标）
    draggedPromptCategory,
    promptCategoryDropTarget,
    setPromptCategoryDropTarget,
    // 共享逻辑 handler
    applyPromptPreset,
    editPromptPreset,
    addPromptCategory,
    renamePromptCategory,
    deletePromptPreset,
    beginPromptDrag,
    endPromptDrag,
    dropPromptOnCategory,
    dropPromptOnPreset,
    openNewPromptEditor,
    updateEditingPrompt,
    saveEditingPrompt,
    // 主画板分类拖拽
    deletePromptCategory,
    beginPromptCategoryDrag,
    endPromptCategoryDrag,
    dragPromptCategoryOver,
    dropOnPromptCategory
  };
}
