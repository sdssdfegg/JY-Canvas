// server/features/detail-studio/tools/save-version.tool.js
// V208 P1：saveVersion Tool —— 包装 versions/version-store.js#finalizeVersion。
//
// 纯增量包装：原函数一行不改、保留为 Tool 内部实现。

import { finalizeVersion } from "../versions/version-store.js";

export const saveVersionTool = {
  id: "saveVersion",
  description: "生成完成后补全某版本图片与状态（只改该版本字段，不删历史、不覆盖其它版本）。",
  permissions: ["version:write"],
  idempotent: true,
  confirmRequired: false,
  sideEffectScope: "screen",
  async run(args) {
    const result = await finalizeVersion(args.id, args.versionId, {
      status: args.status ?? "success",
      imagePath: args.imagePath ?? null,
      resultRef: args.resultRef ?? null
    });
    return { ok: result !== null, data: result, sideEffects: ["screen"] };
  }
};
