# 批量改色 workflow

> 🚧 **2026-10-19 退役声明**：本 workflow 前端实现已退役（V110 起含「改色」字样的页判为 `custom`；V113 起「批量改色」单例不再自动补建）。
> 注意：**服务端仍按页面名识别 recolor**（`server/routes/outfit.routes.js:202-205` 的 `recolorWorkflow` 判定仍在用，用于关闭智能介入与定制报错文案），**该服务端分支不得删除**。
> 当前服装改色工作页 = `custom`（见 `custom/README.md`）。本目录文档仅供参考，不要据此新建 recolor 分支。

> **⚠️ 当前实现仍在 `src/outfit-workflow.jsx`（迁移中）。本目录目前只有约定与规划，无实现代码 —— 搜代码请去那里。**

| 项 | 内容 |
| --- | --- |
| tab | 批量改色 |
| workflowMode | `recolor` |
| 当前代码 | `src/outfit-workflow.jsx` |
| 搜索词 | `DEFAULT_RECOLOR_PAGE_NAME`、`RECOLOR_DEFAULT_PROMPT`、`isRecolorWorkflow` |
| 前端 API | `src/api/outfit.js` 的 `generateOutfit()` |
| 本地接口 | `/api/generate-outfit` |
| 后端提示词出口 | `prompts/server/outfit-skill.js`（2026-09-26 起 = 只发用户原话，SKILL/规则已删除） |

图1是原图，图2是颜色参考。这个分区会复用服装部位选择控件，改控件时同步检查批量换装。
