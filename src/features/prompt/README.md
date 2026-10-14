# features/prompt —— 提示词助手（P3-2）

## 职责
主画板「提示词助手」弹窗与编辑弹窗的 UI 与私有状态收口点。把原本内联在 `src/main.jsx` 的提示词助手（分类标签、搜索、预设网格、编辑弹窗、分类拖拽）抽成可复用组件。

## 入口
- `PromptAssistantView.jsx`：纯 JSX 弹窗，零逻辑。由 `main.jsx` 渲染：
  ```jsx
  <PromptAssistantView
    isOpen={isPromptAssistantOpen}
    categories={promptCategories}
    onClose={() => setIsPromptAssistantOpen(false)}
    promptApi={promptApi}
  />
  ```
- `prompt-assistant-state.js`：`usePromptAssistantState(...)` —— 纯逻辑 hook（零 JSX），持有私有 UI 状态、调用共享 `usePromptLibrary`、预设持久化 effect、主画板专属分类拖拽函数。

## 状态归属
| 状态 / 代码 | 归属 | 说明 |
| --- | --- | --- |
| `promptPresets` / `promptCategories` | App() 共享 | 主画板 + 批量页共用数据，作为 props 下发；持久化随数据走 |
| `isPromptAssistantOpen` | App() | 主画板开态（工具栏按钮控制），以 `isOpen`/`onClose` 下发 |
| `editingPrompt` / `promptCategory` / `promptSearch` / `draggedPromptId` / `promptDropCategory` | `usePromptAssistantState` 私有 | 仅本弹窗 UI 使用 |
| `draggedPromptCategory` / `promptCategoryDropTarget` | App()（透传） | 被 `usePreviewDrag` 作为 window 拖拽结束的**重置目标**（resetDragged / resetDropTarget），故必须留在 App，仅 value/setter 透传给 hook |
| 预设 CRUD / 拖拽落点 / 应用预设 | `usePromptLibrary`（共享） | 逻辑早已收口在 `src/shared/prompt-library.js`，两侧共用，不存在复制 |

## 接线方式
`main.jsx` 在 App() 顶部调用：
```js
const promptApi = usePromptAssistantState({
  presets: promptPresets,
  setPresets: setPromptPresets,
  categories: promptCategories,
  setCategories: setPromptCategories,
  settings,
  updateSetting,
  addEvent,
  makePresetId: makeResultId,
  endPromptCategoryDrag,   // 来自 App 的 usePreviewDrag
  onApplyPreset: () => setIsPromptAssistantOpen(false),
  draggedPromptCategory,
  setDraggedPromptCategory,
  promptCategoryDropTarget,
  setPromptCategoryDropTarget
});
```
`promptApi` 透传给 `PromptAssistantView` 作为 `promptApi` prop；组件内解构使用。

## 常见改法
- 改预设/分类 UI：只在 `PromptAssistantView.jsx` 改 JSX。
- 改分类拖拽手感：`prompt-assistant-state.js` 内的 `beginPromptCategoryDrag` / `dragPromptCategoryOver` / `dropPromptCategoryOnCategory`。
- 改预设 CRUD 逻辑：`src/shared/prompt-library.js` 的 `usePromptLibrary`（共享，勿在两侧各写一份）。

## 后端配合
无。预设/分类纯前端持久化（`writeJsonStorage` 到 localStorage，key 见 `shared/app-defaults.js` 的 `PROMPT_PRESETS_KEY` / `PROMPT_CATEGORIES_KEY`）。

## 降级档说明（R4）
按 V57 执行单，批量页（`src/features/outfit/outfit-panels.jsx` 的 `PromptPresetGrid`）**未**改为复用本组件。原因：批量页是始终可见的内嵌网格（无模态/编辑弹窗），与主画板模态范式不同，且核心逻辑早已经 `usePromptLibrary` 共享、不存在重复。批量页复用改造留作后续单列。本单因此 App() 净减约 288 行（略低于 R2 的 ≥300 阈值，因批量页未抽）。
