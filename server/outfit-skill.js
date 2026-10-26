// ⚠️ 有意保留的兼容转发层 —— 不要删，也不要把逻辑写到这里。
//
// 真相源在 `prompts/server/outfit-skill.js`；本文件故意只有一行 export *，
// 改提示词/SKILL 逻辑请去那边改，别在这里重写一份（否则两份会各自漂移）。
//
// 为什么保留这个"看起来没用"的一行文件：它是运行时依赖链的一环 ——
//   server/index.js:29  import { buildOutfitPrompt, primaryOutfitGenerationError } from "./outfit-skill.js"
// 删掉本文件 = 服务启动即失败（ESM 解析阶段就报错，不是运行时才挂）。
//
// 2026-10-02 V11-RF-022 实测：本文件是**活壳**（由第三方评估报告指出并被采纳），
// 与 detail-skills.js 同属"有意保留的打包间接层"：prompts/server/** 是提示词真相源，
// server/*.js 是给 bundler / esbuild 的入口。
export * from "../prompts/server/outfit-skill.js";
// P1-7：分层 Prompt 模板注册表（模板挂载 + 版本冻结）。同样只在壳里转发，逻辑在 prompts/server/。
export * from "../prompts/server/outfit-prompt-template.js";
