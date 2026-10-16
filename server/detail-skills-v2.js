// ⚠️ 有意保留的兼容转发层 —— 不要删，也不要把逻辑写到这里。
//
// 真相源在 `prompts/server/detail-skills-v2/index.js`；本文件故意只有一行 export *，
// 改 v2 视觉规则（风格包/构图变体/轮换）请去那边改，别在这里重写一份（否则两份会各自漂移）。
//
// 为什么保留这个"看起来没用"的一行文件：它是运行时依赖链的一环 ——
//   server/index.js → server/detail-ai.js → 本文件
//   server/index.js → server/detail-middleware.js → 本文件
// 删掉本文件 = 服务启动即失败（ESM 解析阶段就报错，不是运行时才挂）。
export * from "../prompts/server/detail-skills-v2/index.js";
