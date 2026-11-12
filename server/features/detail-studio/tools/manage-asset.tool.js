// server/features/detail-studio/tools/manage-asset.tool.js
// V208 P1：manageAsset Tool —— 包装 store/project-store.js#appendReferenceImage。
//
// 纯增量包装：原函数一行不改、保留为 Tool 内部实现。

import { appendReferenceImage } from "../store/project-store.js";

export const manageAssetTool = {
  id: "manageAsset",
  description: "向项目追加一条已校验的参考图条目（落 data/detail-studio/assets/ 并更新索引）。",
  permissions: ["asset:write"],
  idempotent: false,
  confirmRequired: false,
  sideEffectScope: "project",
  async run(args) {
    const result = await appendReferenceImage(args.id, args.entry);
    return { ok: result !== null, data: result, sideEffects: ["project"] };
  }
};
