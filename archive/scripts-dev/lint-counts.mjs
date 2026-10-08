// 实测 ESLint 全仓分布，按「文件|规则」聚合 —— 用于统筹给 lint 棘轮划账前取真相。
// 用法：node scripts/dev/lint-counts.mjs [--jsonEsc]
// 说明：不用 `eslint .` 的文本输出（会被 tail 截断、且文件名与 variety 分不清），
//       直接吃 --format json，聚合口径与 lint-baseline.json 的 counts 完全一致。
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ["."];

const child = spawn(process.execPath, [path.join("node_modules", "eslint", "bin", "eslint.js"), ...dirs, "--format", "json"], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"]
});
let out = "";
child.stdout.on("data", (d) => { out += d; });
let err = "";
child.stderr.on("data", (d) => { err += d; });
child.on("close", () => {
  const start = out.indexOf("[");
  if (start < 0) {
    console.error("拿不到 JSON：", err.slice(0, 400));
    process.exit(1);
  }
  const results = JSON.parse(out.slice(start));
  const counts = {};
  let errors = 0;
  let warnings = 0;
  const root = process.cwd();
  for (const f of results) {
    for (const m of f.messages) {
      if (m.severity === 2) errors += 1;
      else {
        warnings += 1;
        const rel = path.relative(root, f.filePath).split(path.sep).join("/");
        const key = `${rel}|${m.ruleId}`;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }
  console.log(`实测 errors=${errors} warnings=${warnings} total=${errors + warnings}`);
  console.log("--- counts（可直接抄进 lint-baseline.json）---");
  for (const k of Object.keys(counts).sort()) console.log(`  ${k} : ${counts[k]}`);
  console.log("\n--- JSON 片段 ---");
  console.log(JSON.stringify({ totals: { errors, warnings, total: errors + warnings }, counts }, null, 2));
});
