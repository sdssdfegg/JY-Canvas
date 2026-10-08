// 用进程内 ESLint API 复现 lint-ratchet 的判据（绕开本机 spawnSync EBUSY 限制）。
// 只做「读 + 比对」，绝不写基线 —— 基线刷新是统筹的活。
import { pathToFileURL } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import process from "node:process";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "verify", "lint-baseline.json");

const apiUrl = pathToFileURL(path.join(ROOT, "node_modules", "eslint", "lib", "api.js")).href;
const { ESLint } = await import(apiUrl);

const eslint = new ESLint({ cwd: ROOT });
const report = await eslint.lintFiles(["."]);

function countsOf(entries) {
  const counts = {};
  let errors = 0;
  let warnings = 0;
  for (const file of entries) {
    const rel = path.relative(ROOT, file.filePath).replace(/\\/g, "/");
    for (const message of file.messages) {
      const key = `${rel}|${message.ruleId || "(fatal)"}`;
      counts[key] = (counts[key] || 0) + 1;
      if (message.severity === 2) errors += 1;
      else warnings += 1;
    }
  }
  return { counts, errors, warnings };
}

const current = countsOf(report);
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));

const regressions = [];
for (const [key, count] of Object.entries(current.counts)) {
  const before = baseline.counts[key] ?? 0;
  if (count > before) regressions.push({ key, before, now: count });
}
const improved = Object.entries(baseline.counts)
  .filter(([key, before]) => (current.counts[key] ?? 0) < before)
  .map(([key, before]) => ({ key, before, now: current.counts[key] ?? 0 }));

console.log("=== 当前 ===");
console.log(`errors=${current.errors} warnings=${current.warnings} total=${current.errors + current.warnings}`);
console.log("=== 基线 ===");
console.log(`generatedAt=${baseline.generatedAt}`, JSON.stringify(baseline.totals));
console.log("=== 回归（比基线多 或 全新 key）===");
if (!regressions.length) console.log("（无）");
regressions.forEach((r) => console.log(`  + ${r.key}  ${r.before} -> ${r.now}`));
console.log("=== 改善（比基线少）===");
if (!improved.length) console.log("（无）");
improved.slice(0, 20).forEach((r) => console.log(`  - ${r.key}  ${r.before} -> ${r.now}`));
console.log(`\n结论 ok=${regressions.length === 0}`);
console.log(`注：eslint 版本 ${JSON.parse(readFileSync(path.join(ROOT, "node_modules", "eslint", "package.json"), "utf8")).version} / 基线版 ${baseline.eslintVersion}`);
