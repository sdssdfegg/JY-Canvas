// server/features/detail-studio/tools/retry-task.tool.js
// V208 P1：retryTask Tool —— 包装 generation/orchestrator.js#retryTask。
//
// 纯增量包装：原函数一行不改、保留为 Tool 内部实现。generator 由 ctx 注入（复用 /api/images 链路）。

import { retryTask } from "../generation/orchestrator.js";

export const retryTaskTool = {
  id: "retryTask",
  description: "手动重试失败/需确认的任务（重置错误后重新入队，复用编排层重试退避）。",
  permissions: ["task:write"],
  idempotent: true,
  confirmRequired: true,
  sideEffectScope: "screen",
  async run(args, ctx = {}) {
    const result = await retryTask(args.taskId, {
      generator: ctx?.generator,
      apiKey: args.apiKey ?? ctx?.apiKey,
      backoffBaseMs: ctx?.backoffBaseMs
    });
    return { ok: result !== null, data: result, sideEffects: ["screen"] };
  }
};
