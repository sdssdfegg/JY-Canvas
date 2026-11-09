// server/features/detail-studio/model-config.js
// R5 裁决：本期不增加模型选择，沿用现有默认文本模型；但禁止把模型名写死散落在业务模块。
// 本文件是详情创作唯一的「模型调用适配点」：未来若需按策划 / 质检分配不同模型，只改这里。
//
// 保持零依赖：不 import 前端 src/shared/routing.js，避免 public 启动链路引入特性模块群
// 触发 rollup / esbuild 初始化期 TDZ 白屏。默认值与
// src/shared/routing.js:446 DEFAULT_CANVAS_REASONING_MODEL 及服务端各 *-ai.js 兜底同值。
// 严禁在本工作区另建 Provider / API Key / 网关配置。

const DETAIL_STUDIO_DEFAULT_TEXT_MODEL = "gpt-5.6-luna";

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
    selectable: false,
    adapter: "server/core/ai-chat-shared.js#postChatCompletion",
    spec: DETAIL_STUDIO_MODEL_SPEC
  };
}
