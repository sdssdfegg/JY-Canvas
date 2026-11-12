// server/features/detail-studio/tools/switch-version.tool.js
// V208 P1：switchVersion Tool —— 包装 versions/version-store.js#switchScreenVersion。
//
// 纯增量包装：原函数一行不改、保留为 Tool 内部实现。

import { switchScreenVersion } from "../versions/version-store.js";

export const switchVersionTool = {
  id: "switchVersion",
  description: "切换某屏当前版本：只改 currentVersionIds 与 isCurrent 标志，不删历史、不触发重生成。",
  permissions: ["version:write"],
  idempotent: true,
  confirmRequired: true,
  sideEffectScope: "screen",
  async run(args) {
    const result = await switchScreenVersion(args.id, args.screenIndex, args.versionId);
    return { ok: result !== null, data: result, sideEffects: ["screen"] };
  }
};
