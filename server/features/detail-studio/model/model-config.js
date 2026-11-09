// server/features/detail-studio/model-config.js
// 阶段 2 重点 A：详情创作「推理模型 + 模型选择 + 渠道选择」统一配置区，用户在创建工作区后自选自配。
// 本文件是详情创作唯一的「模型调用适配点」：模型名只在此与请求链路间流转，禁止写死散落在业务模块。
//
// 保持零依赖：不 import 前端 src/shared/routing.js，避免 public 启动链路引入特性模块群
// 触发 rollup / esbuild 初始化期 TDZ 白屏。默认值与
// src/shared/routing.js:446 DEFAULT_CANVAS_REASONING_MODEL 及服务端各 *-ai.js 兜底同值。
// 严禁在本工作区另建 Provider / API Key / 网关配置。

const DETAIL_STUDIO_DEFAULT_TEXT_MODEL = "gpt-5.6-luna";

// 重点 A 推荐默认（Owner 裁决）：文本 gpt-5.6-luna、图片 TT Image 2.6（id tt-image-2.6）。
// 仅作回退锚点与能力清单展示；真实清单以 src/shared/routing.js 与 GET /api/config 为准，不在此复制列表。
export const DETAIL_STUDIO_RECOMMENDED_TEXT_MODEL = "gpt-5.6-luna";
export const DETAIL_STUDIO_RECOMMENDED_IMAGE_MODEL = "tt-image-2.6";

// 传给 server/core/ai-chat-shared.js:132 modelName(input, { fields, fallback })。
// fields 是预留位置：将来若前端提供模型选择，可从请求体按优先级读取，无需改业务模块。
export const DETAIL_STUDIO_MODEL_SPEC = {
  fields: ["detailStudioModel", "textModel", "model"],
  fallback: DETAIL_STUDIO_DEFAULT_TEXT_MODEL
};

export function describeDetailStudioModel() {
  return {
    provider: "jy-canvas-existing",
    gateway: "single-locked",
    model: DETAIL_STUDIO_DEFAULT_TEXT_MODEL,
    selectable: true,
    recommendedTextModel: DETAIL_STUDIO_RECOMMENDED_TEXT_MODEL,
    recommendedImageModel: DETAIL_STUDIO_RECOMMENDED_IMAGE_MODEL,
    adapter: "server/core/ai-chat-shared.js#postChatCompletion",
    spec: DETAIL_STUDIO_MODEL_SPEC
  };
}
