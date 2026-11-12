// server/features/detail-studio/tools/create-task.tool.js
// V208 P1：createTask Tool —— 包装 generation/orchestrator.js#submitBatch。
//
// 纯增量包装：原函数一行不改、保留为 Tool 内部实现。generator 由 ctx 注入（复用 /api/images 链路）。

import { submitBatch } from "../generation/orchestrator.js";

export const createTaskTool = {
  id: "createTask",
  description: "批量提交一批屏生成任务：入队、幂等复用、失败隔离、有限重试（复用编排层）。",
  permissions: ["task:create"],
  idempotent: true,
  confirmRequired: true,
  sideEffectScope: "project",
  async run(args, ctx = {}) {
    const spec = {
      projectId: args.projectId,
      apiKey: args.apiKey ?? ctx?.apiKey,
      screens: args.screens
    };
    const result = await submitBatch(spec, {
      generator: ctx?.generator,
      backoffBaseMs: ctx?.backoffBaseMs
    });
    return { ok: true, data: result, sideEffects: ["project"] };
  }
};
