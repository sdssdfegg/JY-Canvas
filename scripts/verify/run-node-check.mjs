// `npm run check` 的语法检查环节（被 scripts/verify/run-all.mjs 调度）。
//
// 历史包袱：这里原来用正则从 package.json 的 scripts.check 里抠出
// `node --check <file>` 目标列表。那套做法有两个问题：
//   1. 每加一个后端模块都要手动往 package.json 里添一行，忘了添就等于永远不检查；
//   2. 依赖 spawnSync 子进程，在受限环境里会 EBUSY，把环境问题误报成代码问题。
//
// 现在改成直接复用 scripts/check-syntax.mjs 的扫描逻辑（唯一的真相源）：
//   自动遍历 server / src / scripts / prompts，进程内解析，顺带覆盖 .jsx。
//
// 用法：node scripts/verify/run-node-check.mjs

import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSyntaxCheck } from "../check-syntax.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const report = runSyntaxCheck(projectRoot);

for (const item of report.failures) {
  console.log(`[run-node-check] FAIL ${item.file}`);
  console.log(`      ${item.message}`);
}
console.log(`[run-node-check] 扫描 ${report.total} 个文件，通过 ${report.passed} 个，失败 ${report.failed} 个`);
process.exit(report.ok ? 0 : 1);
