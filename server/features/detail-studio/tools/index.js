// server/features/detail-studio/tools/index.js
// V208 P1：集中注册详情创作工作区的 7 个 Tool 适配器。
//
// 纯增量包装层：适配器只做参数映射与结果归一，业务逻辑全部复用既有模块
// （local-images-generator / orchestrator / version-store / project-store），
// 原文件一行不改。本层为 P5（Agent 受控决策）切换调用点的前置，本单不改任何既有调用点。

import { registerTool } from "../../../core/tool-registry.js";
import { imageGenerateTool } from "./image-generate.tool.js";
import { editScreenTool } from "./edit-screen.tool.js";
import { saveVersionTool } from "./save-version.tool.js";
import { switchVersionTool } from "./switch-version.tool.js";
import { manageAssetTool } from "./manage-asset.tool.js";
import { createTaskTool } from "./create-task.tool.js";
import { retryTaskTool } from "./retry-task.tool.js";

const DETAIL_STUDIO_TOOLS = [
  imageGenerateTool,
  editScreenTool,
  saveVersionTool,
  switchVersionTool,
  manageAssetTool,
  createTaskTool,
  retryTaskTool
];

// 集中注册：幂等——重复调用不会重复注册（registerTool 遇重复 id 抛错，调用方保证单次）。
export function registerDetailStudioTools() {
  for (const tool of DETAIL_STUDIO_TOOLS) registerTool(tool);
}
