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
//   - 纯函数、无 React、无副作用、不碰 localStorage（存储读写是 loader 的事）；
//   - 归一化口径**只此一份**，改这里等于同时改两处（这正是收口的目的）；
//   - ⚠️ 本次是**纯搬运**：三对均字节一致 ⇒ 行为零变化，未改任何截断长度/默认值/文案。
//
// 🔴 同族另两条 **未纳入本刀（已分叉，停手待人类裁决）** —— 状态更新（V11-RF-040，2026-10-02）：
//   `loadPromptPresets` / `loadPromptCategories` 两处**不是**重复搬运，是实质行为分叉：
//     · `loadPromptCategories`：兜底常量不同
//       （main 用 `promptCategories` = ["全部","常用","批量复刻","批量sku","局部迁移"]；
//        outfit 用 `PROMPT_CATEGORIES` = 由 PROMPT_PRESET_GROUPS / PROMPT_BUILTIN_PRESETS 动态聚合）
//     · `loadPromptPresets`：main 是**简单版**（stored 非空就返回 stored，否则返回 `builtinPrompts`）；
//       outfit 是**合并版**（内置库优先覆盖非 custom 项的 title/content，再补回 stored 缺失的内置项）
//     · 两者读的 localStorage 键也不同
//       （main：`${STORAGE_PREFIX}-prompt-library-*`；outfit：`jingyin-outfit-workflow-prompt-library-*`）
//   ⇒ 统一会改变其中一侧「用户看到的提示词列表/分类列表」，属**行为归一决策**，不是搬运。
//   ⇒ 统筹裁定：**改名不合并、不开豁免口子**。outfit 侧两处已改名为
//     `loadOutfitPromptPresets` / `loadOutfitPromptCategories`（在 src/outfit-workflow.jsx 内），
//     main 侧保留原名 `loadPromptPresets` / `loadPromptCategories`。
//     storage key 是否合一仍是**未决的产品决策**（REFACTOR_TICKETS §8 待决策项 1）。

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
