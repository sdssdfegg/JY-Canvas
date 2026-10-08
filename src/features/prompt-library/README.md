# 提示词库/词分区

> **⚠️ 本目录目前只有约定与规划，无实现代码 —— 实际实现位置见本文「当前位置」表，不要在这里搜代码。**

截图里的 `词` tab 属于提示词库和提示词助手，不属于图片生成 workflow。

## 当前位置

| 内容 | 当前位置 | 目标位置 |
| --- | --- | --- |
| 提示词助手入口和列表 UI | `src/main.jsx`、`src/outfit-workflow.jsx` | `src/features/prompt-library/` |
| 批量页 `词` tab | `src/outfit-workflow.jsx` 搜索 `showPromptButton`、`prompt assistant`、`PROMPT_*` | `PromptLibraryPanel.jsx` |
| 内置提示词预设 | `src/outfit-workflow.jsx` | `prompts/frontend/prompt-library-presets.js` |

## 规则

1. 改提示词库 UI 时同步检查主画板和批量画板。
2. 改默认提示词内容时先看 `prompts/README.md`。
3. 提示词库不直接调用生图接口；应用提示词后由当前功能页决定怎么生成。
