import { readJsonStorage, writeJsonStorage } from "../lib/storage/json-storage.js";
import { PROMPT_LIBRARY_VERSION } from "./app-defaults.js";

// 提示词库的**归一化口径**（唯一实现）。
//
// 为什么要有这个文件（前端专项阶段 B · 刀 5）：
//   `normalizePromptCategoryName` / `normalizePromptCategories` / `normalizePromptPreset`
//   此前在 src/main.jsx 与 src/outfit-workflow.jsx 各有一份，**逐字节完全一致**
//   （比对：两侧同名的这三个函数 —— 三份实现逐字节一致、diff 均无差异；
//     ⚠️ 跨文件引用只写函数名、不写行号：行号随任意一侧的编辑就会漂移，后人按图索骥只会被引到错处，刻意不补。）
//   两个页面对「分类名怎么截断 / 预设怎么补默认值」一旦判定不一致，
//   同一个预设在一处显示成 A、在另一处显示成 B —— 这正是阶段 B 要拆的病根。
//
// 纪律：
//   - **纯函数 + 1 个无副作用 hook**：归一化与工厂不碰 localStorage；
//     V118 起新增的 `loadPromptLibraryPresets` / `loadPromptLibraryCategories` 是两侧唯一加载口径
//     （执行单 §1.2），确需 `readJsonStorage`（含历史键迁移），收口于此以保证「改一次两边一致」。
//   - 归一化口径**只此一份**，改这里等于同时改两处（这正是收口的目的）；
//   - ⚠️ 本次是**纯搬运**：三对均字节一致 ⇒ 行为零变化，未改任何截断长度/默认值/文案。
//
// ## 关于 `usePromptLibrary`（V11-RF-057，2026-10-02 新增）
//
// 它**不是** React hook 意义上的 hook：内部**没有** `useState` / `useCallback` / `useMemo`，
// 也不需要 import React。它只是一个**返回普通函数的工厂**——把提示词库的一组 handler
// 从 `src/main.jsx` / `src/outfit-workflow.jsx` 两处各一份的实现里抽出来，参数化后共用。
//
// 为什么必须是这个形态（三条判据，别只记结论）：
//   1. **不能抽组件**：两侧的提示词编辑弹窗 JSX 是**真分叉**（main 有删除按钮，outfit 无），
//      参数化一堆 props 就等于改视觉 ⇒ 违反「只搬运不改行为」。
//   2. **不能只抽纯函数**：重复单位就是「handler 整体」。抽纯函数只能削掉
//      `setX((current) => …)` 的 updater 体，剩下的 `window.prompt` / 守卫分支仍在两侧，
//      且会把一个 handler 劈成两半。
//   3. **所以是工厂，且必须由调用方注入一切**：现状这些 handler 每次 render 都重建闭包，
//      工厂返回**普通函数**才能行为逐字一致；用 `useMemo`/`useCallback` 反而会改变
//      闭包重建时机，并且会引入新的 `exhaustive-deps` warning。
//
// 🔴 三条硬要求（改了就会改行为，动这里前先看懂）：
//   1. `makePresetId` 必须注入 —— main `makeResultId()` 产 `result_` 前缀、
//      outfit `makeId("prompt")` 产 `prompt_` 前缀，**不注入就改了一侧新建预设的 id 前缀**，
//      会污染用户已有的 localStorage 历史数据。
//   2. `notify` 必须注入 —— 两侧 `addEvent` 已**实质分叉**
//      （main `{time,label,detail}` vs outfit `{id,title,detail,time}`），不可共用。
//   3. 单侧独有的块**不许塞进来** —— main 独有分类页签拖拽排序 9 块、outfit 独有
//      `renamePromptPresetTitle` / `schedulePromptPresetApply`，进来就变成**未接线的死代码**，
//      等同给对方补功能（属业务变更，不属搬运）。
//
// ⚠️ 已知的一处**有意放宽**（已报统筹，待人工冒烟确认）：`dropPromptOnPreset` 取的是
//   **outfit 版**，比 main 版多一句 `setDropCategory("")` ⇒ main 侧拖放后分类高亮会额外清空。
//   按「放宽 > 收窄」取超集（收窄会让在用的静默失败）。
//
// 🔴 同族另两条 **未纳入本刀（已分叉，停手待人类裁决）** —— 状态更新（V11-RF-040，2026-10-02）：
//   `loadPromptPresets` / `loadPromptCategories` 两处**不是**重复搬运，是实质行为分叉：
//     · `loadPromptCategories`：兜底常量不同
//       （main 用 `promptCategories` = ["全部","常用","批量复刻","批量sku","局部迁移"]；
//        outfit 用 `PROMPT_CATEGORIES` = 由 PROMPT_PRESET_GROUPS / PROMPT_BUILTIN_PRESETS 动态聚合——此三常量已于 V130 删除，且 V118 后该兜底口径已不存在，现状见下方 V118 段）
//     · `loadPromptPresets`：main 是**简单版**（stored 非空就返回 stored，否则返回 `builtinPrompts`）；
//       outfit 是**合并版**（内置库优先覆盖非 custom 项的 title/content，再补回 stored 缺失的内置项）
//     · 两者读的 localStorage 键也不同
//       （main：`${STORAGE_PREFIX}-prompt-library-*`；outfit：`jingyin-outfit-workflow-prompt-library-*`）
//   ⇒ 统一会改变其中一侧「用户看到的提示词列表/分类列表」，属**行为归一决策**，不是搬运。
//   ⇒ 统筹裁定：**改名不合并、不开豁免口子**。outfit 侧两处已改名为
//     `loadOutfitPromptPresets` / `loadOutfitPromptCategories`（在 src/outfit-workflow.jsx 内），
//     main 侧保留原名 `loadPromptPresets` / `loadPromptCategories`。
//     storage key 是否合一仍是**未决的产品决策**（REFACTOR_TICKETS §8 待决策项 1）。
//
// 🔴 V118（2026-10-19）更新：上面的「改名不合并」裁定已被本单推翻——两侧提示词助手改为
// 纯用户自建库，内置注入/回灌/覆盖逻辑两侧**都**删除，行为口径已统一，故收口为
// loadPromptLibraryPresets / loadPromptLibraryCategories（见下方「V118 加载口径」段）。
// 注意：**storage key 仍是两个前缀**（main=`${STORAGE_PREFIX}-…`、outfit=`jingyin-outfit-workflow-…`），
// 这一产品决策未变，两侧仍各自传自己的 key 给共享加载函数。上面 outfit 侧的
// loadOutfitPromptPresets / loadOutfitPromptCategories 现在只是薄封装、转发给共享函数。

/** 分类名归一化：折叠空白、去首尾空格、截到 18 字。 */
export function normalizePromptCategoryName(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 18);
}

/** 分类列表归一化：恒以「全部」开头、去重、去空、上限 24 条；一个都没有时补「常用」。 */
export function normalizePromptCategories(values) {
  const next = ["全部"];
  for (const value of Array.isArray(values) ? values : []) {
    const name = normalizePromptCategoryName(value);
    if (!name || name === "全部" || next.includes(name)) continue;
    next.push(name);
  }
  if (next.length === 1) next.push("常用");
  return next.slice(0, 24);
}

/** 预设归一化：补 id / title / category / content 的默认值（空 category 归到「常用」）。 */
export function normalizePromptPreset(preset, index = 0) {
  const rawCategory = normalizePromptCategoryName(preset?.category);
  const category = rawCategory && rawCategory !== "全部" ? rawCategory : "常用";
  return {
    id: String(preset?.id || `prompt_${Date.now()}_${index}`),
    title: String(preset?.title || "未命名提示词").trim() || "未命名提示词",
    category,
    content: String(preset?.content || "").trim(),
    custom: Boolean(preset?.custom)
  };
}

// ============================================================================
// V118（2026-10-19）：提示词助手改为**纯用户自建库**。下面两个函数是
// src/main.jsx 与 src/features/outfit/outfit-top.js 两侧**唯一**的提示词
// 预设 / 分类加载口径（执行单 §1.2 收口）：不再注入任何内置词、空库返回 `[]`、
// 分类恒以「全部」开头并由用户预设派生。两侧各自的加载入口改为调用它们、传各自
// 的 storage key，保证「改一次两边一致」。加载函数需读 localStorage（readJsonStorage），
// 故收口于此是为了统一行为——这是 V118 的核心诉求。
// ============================================================================

/**
 * 读取提示词存储（含一次性历史键迁移，§1.4）。
 * 当前键有数据 → 直接返回；当前键为空但历史 v1 键有数据 → 迁移过来并保留历史键
 *（不删），然后返回；迁移失败不阻断启动。
 */
function readPromptStorageWithMigration(key) {
  const current = readJsonStorage(key, null);
  if (Array.isArray(current) && current.length > 0) return current;
  const legacyKey = key.replace(PROMPT_LIBRARY_VERSION, "v1");
  if (legacyKey === key) return current; // 版本段不在键里时不做无意义回退
  const legacy = readJsonStorage(legacyKey, null);
  if (Array.isArray(legacy) && legacy.length > 0) {
    try {
      writeJsonStorage(key, legacy);
      console.info(`[V118 迁移] 已从历史键 ${legacyKey} 迁移提示词数据到 ${key}（保留历史键）`);
    } catch {
      // 迁移失败不阻断启动
    }
    return legacy;
  }
  return current;
}

/** 加载用户提示词预设：逐条归一化、过滤空内容；空库 → `[]`，**不注入任何内置**。 */
export function loadPromptLibraryPresets({ presetsKey }) {
  const stored = readPromptStorageWithMigration(presetsKey);
  if (!Array.isArray(stored) || stored.length === 0) return [];
  return stored.map(normalizePromptPreset).filter((preset) => preset.content);
}

/** 加载用户提示词分类：恒以「全部」开头 + 用户自定义分类存档 + 由用户预设派生的分类。 */
export function loadPromptLibraryCategories({ categoriesKey, presetsKey }) {
  const storedCategories = readPromptStorageWithMigration(categoriesKey);
  const storedPrompts = readPromptStorageWithMigration(presetsKey);
  const presetCategories = Array.isArray(storedPrompts)
    ? storedPrompts.map((preset) => preset?.category)
    : [];
  const base = Array.isArray(storedCategories) && storedCategories.length > 0
    ? ["全部", ...storedCategories]
    : [];
  return normalizePromptCategories([...base, ...presetCategories]);
}

/**
 * 兜底分类：取第一个既不是「全部」也不是 `excluded` 的分类，一个都没有就给「常用」。
 *
 * 为什么带 `excluded`：main 侧删除分类时要找一个**不等于被删分类**的兜底（见 main 的
 * `deletePromptCategory`）；outfit 侧无此 UI，不传参时 `excluded` 默认为 `""`，
 * 而分类恒为非空串 ⇒ `category !== ""` 恒真 ⇒ 与 outfit 原实现**逐字等价**。
 */
export function promptFallbackCategory(categories, excluded = "") {
  return categories.find((category) => category !== "全部" && category !== excluded) || "常用";
}

/**
 * 提示词库的 handler 工厂（V11-RF-057）。
 *
 * 🔴 见文件头：这不是 React hook，内部**禁止** `useCallback` / `useMemo` / `useState`。
 * 每次 render 调用一次即可（调用方本来就每次 render 重建这些闭包）。
 *
 * @param {object} api
 * @param {Array}  api.categories         提示词分类数组（state 值）
 * @param {Function} api.setCategories
 * @param {string} api.activeCategory     当前选中的分类（state 值）
 * @param {Function} api.setActiveCategory
 * @param {Function} api.setPresets       预设数组的 setter（本簇只读 setter，从不读值）
 * @param {object|null} api.editing      正在编辑的预设（state 值）
 * @param {Function} api.setEditing
 * @param {string|null} api.draggedId    正在拖拽的预设 id（state 值）
 * @param {Function} api.setDraggedId
 * @param {Function} api.setDropCategory
 * @param {string} api.promptText        新建预设时预填的正文（**已 trim**）
 * @param {Function} api.updateSetting   写回表单设置（两侧实现已分叉，必须注入）
 * @param {Function} api.makePresetId    () => string，新建预设的 id 工厂（两侧前缀不同，必须注入）
 * @param {Function} api.notify          (title, detail) => void，两侧 `addEvent` 已分叉，必须注入
 * @param {Function} api.onApplyPreset   应用预设后的收尾（如关闭弹窗）
 * @returns 13 个 handler
 */
export function usePromptLibrary({
  categories,
  setCategories,
  activeCategory,
  setActiveCategory,
  setPresets,
  editing,
  setEditing,
  draggedId,
  setDraggedId,
  setDropCategory,
  promptText,
  updateSetting,
  makePresetId,
  notify,
  onApplyPreset
}) {
  const promptIdFromDrag = (event) => draggedId || event.dataTransfer.getData("text/plain");

  const applyPromptPreset = (preset) => {
    updateSetting("prompt", preset.content);
    onApplyPreset();
    notify("提示词", `已应用「${preset.title}」`);
  };

  const editPromptPreset = (preset) => {
    setEditing({ ...preset });
  };

  const addPromptCategory = () => {
    const input = window.prompt("请输入新分类名称", "");
    const name = normalizePromptCategoryName(input);
    if (!name) return;
    if (name === "全部") {
      notify("提示词分类", "「全部」是系统分类，不能新建同名分类");
      return;
    }
    if (categories.includes(name)) {
      setActiveCategory(name);
      notify("提示词分类", `「${name}」已存在`);
      return;
    }
    setCategories((current) => normalizePromptCategories([...current, name]));
    setActiveCategory(name);
    notify("提示词分类", `已新建「${name}」`);
  };

  const renamePromptCategory = (category) => {
    if (!category || category === "全部") return;
    const input = window.prompt("修改分类名称", category);
    const nextName = normalizePromptCategoryName(input);
    if (!nextName || nextName === category) return;
    if (nextName === "全部") {
      notify("提示词分类", "不能改成系统分类「全部」");
      return;
    }
    if (categories.includes(nextName)) {
      notify("提示词分类", `「${nextName}」已存在`);
      return;
    }
    setCategories((current) => current.map((item) => item === category ? nextName : item));
    setPresets((current) => current.map((preset) => (
      preset.category === category ? { ...preset, category: nextName } : preset
    )));
    if (activeCategory === category) setActiveCategory(nextName);
    if (editing?.category === category) updateEditingPrompt("category", nextName);
    notify("提示词分类", `已改名为「${nextName}」`);
  };

  const deletePromptPreset = (preset) => {
    setPresets((current) => current.filter((item) => item.id !== preset.id));
    if (editing?.id === preset.id) setEditing(null);
    notify("提示词", "已删除提示词");
  };

  const beginPromptDrag = (event, presetId) => {
    setDraggedId(presetId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", presetId);
  };

  const endPromptDrag = () => {
    setDraggedId(null);
    setDropCategory("");
  };

  const dropPromptOnCategory = (event, category) => {
    const promptId = promptIdFromDrag(event);
    if (!promptId || category === "全部") return;
    event.preventDefault();
    setPresets((current) => current.map((preset) => (
      preset.id === promptId ? { ...preset, category } : preset
    )));
    setDropCategory("");
    setDraggedId(null);
    notify("提示词", `已移动到「${category}」`);
  };

  // ⚠️ 取的是 outfit 版：比 main 版多一句 `setDropCategory("")`（有意放宽，见文件头）。
  const dropPromptOnPreset = (event, targetId) => {
    const promptId = promptIdFromDrag(event);
    if (!promptId || promptId === targetId) return;
    event.preventDefault();
    setPresets((current) => {
      const next = [...current];
      const fromIndex = next.findIndex((item) => item.id === promptId);
      const toIndex = next.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const [moved] = next.splice(fromIndex, 1);
      const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
      next.splice(adjustedIndex, 0, moved);
      return next;
    });
    setDraggedId(null);
    setDropCategory("");
    notify("提示词", "顺序已更新");
  };

  const openNewPromptEditor = () => {
    const content = promptText;
    const category = activeCategory === "全部" ? promptFallbackCategory(categories) : activeCategory;
    setEditing({
      id: "",
      title: "",
      category,
      content,
      custom: true
    });
  };

  const updateEditingPrompt = (key, value) => {
    setEditing((current) => current ? { ...current, [key]: value } : current);
  };

  const saveEditingPrompt = () => {
    if (!editing) return;
    const title = editing.title.trim();
    const content = editing.content.trim();
    const category = categories.includes(editing.category) && editing.category !== "全部"
      ? editing.category
      : promptFallbackCategory(categories);

    if (!title || !content) {
      notify("提示词", "分类、标题和内容都需要填写");
      return;
    }

    const nextPreset = {
      id: editing.id || makePresetId(),
      title,
      category,
      content,
      custom: true
    };
    setPresets((current) => {
      const exists = current.some((item) => item.id === nextPreset.id);
      return exists
        ? current.map((item) => item.id === nextPreset.id ? nextPreset : item)
        : [nextPreset, ...current];
    });
    setActiveCategory(category);
    setEditing(null);
    notify("提示词", "已保存提示词");
  };

  return {
    applyPromptPreset,
    editPromptPreset,
    addPromptCategory,
    renamePromptCategory,
    deletePromptPreset,
    beginPromptDrag,
    endPromptDrag,
    promptIdFromDrag,
    dropPromptOnCategory,
    dropPromptOnPreset,
    openNewPromptEditor,
    updateEditingPrompt,
    saveEditingPrompt
  };
}
