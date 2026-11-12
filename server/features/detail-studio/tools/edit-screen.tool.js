// server/features/detail-studio/tools/edit-screen.tool.js
// V208 P1：editScreen Tool —— 包装 generation/orchestrator.js#submitSingleScreen。
//
// 纯增量包装：原函数一行不改、保留为 Tool 内部实现。generator 由 ctx 注入（复用 /api/images 链路）。

import { submitSingleScreen } from "../generation/orchestrator.js";

export const editScreenTool = {
  id: "editScreen",
  description: "单屏连续编辑：提交某一屏的一次生成任务（强制绑定 versionId；复用编排层幂等/并发闸门）。",
  permissions: ["task:create"],
  idempotent: true,
  confirmRequired: true,
  sideEffectScope: "screen",
  async run(args, ctx = {}) {
    const spec = {
      projectId: args.projectId,
      apiKey: args.apiKey ?? ctx?.apiKey,
      screen: args.screen
    };
    const result = await submitSingleScreen(spec, {
      generator: ctx?.generator,
      backoffBaseMs: ctx?.backoffBaseMs
    });
    return { ok: true, data: result, sideEffects: ["screen"] };
  }
};
