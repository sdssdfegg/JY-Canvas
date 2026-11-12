// server/features/detail-studio/tools/image-generate.tool.js
// V208 P1：imageGenerate Tool —— 包装 generation/local-images-generator.js#generateViaLocalApi。
//
// 纯增量包装：原函数一行不改、保留为 Tool 内部实现。本 Tool 只做参数映射契约，
// 不拼装提示词、不改写 frozenPrompt、不读取或落盘 API Key（apiKey 由调用方经 args/ctx 注入）。
// 真实出图（无 KEY、避免触发配额）不在门禁 / 冒烟中执行（见执行单 §2 注）。

import { generateViaLocalApi } from "../generation/local-images-generator.js";

export const imageGenerateTool = {
  id: "imageGenerate",
  description: "调用内部 /api/images 出图（复用全局 5 并发闸门 + 计费 + 持久化）。仅做参数映射，不拼装提示词、不读/落盘 KEY。",
  permissions: ["image:generate"],
  idempotent: true,
  confirmRequired: true,
  sideEffectScope: "screen",
  async run(args, ctx = {}) {
    const req = {
      frozenPrompt: args.frozenPrompt,
      model: args.model,
      channelId: args.channelId,
      apiKey: args.apiKey ?? ctx?.apiKey,
      imageSize: args.imageSize,
      aspectRatio: args.aspectRatio,
      referenceImagePaths: args.referenceImagePaths
    };
    const image = await generateViaLocalApi(req);
    return { ok: Boolean(image && image.ok), data: image, sideEffects: ["screen"] };
  }
};
