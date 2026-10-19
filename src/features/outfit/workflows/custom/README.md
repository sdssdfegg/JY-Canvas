# 临时需求 workflow

> **⚠️ 当前实现仍在 `src/outfit-workflow.jsx`（迁移中）。本目录目前只有约定与规划，无实现代码 —— 搜代码请去那里。**

| 项 | 内容 |
| --- | --- |
| tab | 临时需求/自定义新增页 |
| workflowMode | `custom` |
| 当前代码 | `src/outfit-workflow.jsx` |
| 搜索词 | `DEFAULT_CUSTOM_PAGE_NAME`、`isCustomWorkflow`、`CUSTOM_UPLOAD_LABELS` |
| 前端 API | `src/api/outfit.js` 的 `generateOutfit()` |
| 本地接口 | `/api/generate-outfit` |

这个分区用于临时需求和试验页。稳定后应迁成明确 workflow，不要让长期功能一直留在 custom。

> **📌 2026-10-19 现状（服装改色承接页）**：`custom` 页当前是「服装改色」的工作页（用户把旧的「+」自定义页改名为「服装改色」），承载「更换部位」（`recolorPart`）+「上装层级」（`recolorUpperLayer`，仅 upper 时出现）两行控件（V111/V112/V113），提示词框标题为「通用改色提示词」，默认模板 `GARMENT_RECOLOR_DEFAULT_PROMPT`。本目录文档标题「临时需求 workflow」已是旧称，实际语义以代码 `src/features/outfit/outfit-top.js` + `src/outfit-workflow.jsx` 为准。
