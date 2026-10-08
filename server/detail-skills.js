// ⚠️ 有意保留的兼容转发层 —— 不要删，也不要把逻辑写到这里。
//
// 真相源在 `prompts/server/detail-skills.js`；本文件故意只有一行 export *，
// 改提示词/SKILL 逻辑请去那边改，别在这里重写一份（否则两份会各自漂移）。
//
// 为什么保留这个"看起来没用"的一行文件：它是运行时依赖链的一环 ——
//   server/index.js:27  → server/detail-ai.js:8          → 本文件
//   server/index.js:28  → server/detail-middleware.js:12 → 本文件
// 删掉本文件 = 服务启动即失败（ESM 解析阶段就报错，不是运行时才挂）。
//
// 2026-10-02 V11-RF-022 实测：本文件曾被误判为"全仓无引用的死壳"，
// 原因是当时 grep 管道末尾带了 head、输出被截断，只看到 md 里的提及。
// 四路引用核实后确认为活壳，原"删除"方案作废。
export * from "../prompts/server/detail-skills.js";
