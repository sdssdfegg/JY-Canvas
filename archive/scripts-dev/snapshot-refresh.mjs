// 刷新 REFACTOR-冷启动.md §1「现状快照」所需的全部数字。
// 为什么要单独写：文档里原来给的命令用了 execSync —— 本环境 execSync/spawnSync 必 EBUSY，
// 那条命令实际跑不出结果（§1.5 记的是 history）。这里全用 fs 直读，零子进程。
//
// 用法：node scripts/dev/snapshot-refresh.mjs
import fs from "node:fs";
import path from "node:path";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const norm = (p) => p.split(path.sep).join("/");
const rows = walk("src").map((f) => [norm(f), fs.readFileSync(f, "utf8").split("\n").length - 1]);
const total = rows.reduce((a, b) => a + b[1], 0);
const get = (rel) => {
  const hit = rows.find((r) => r[0] === rel);
  if (!hit) throw new Error(`找不到 ${rel}`);
  return hit[1];
};

const main = get("src/main.jsx");
const outfit = get("src/outfit-workflow.jsx");
const mono = main + outfit;
const sum = (prefix) => rows.filter((r) => r[0].startsWith(prefix)).reduce((a, b) => a + b[1], 0);

console.log(`文件数=${rows.length}  总行=${total}`);
console.log(`main=${main}  outfit=${outfit}  巨石合计=${mono}  占比=${(mono / total * 100).toFixed(1)}%`);
console.log(`shared=${sum("src/shared")}  features=${sum("src/features")}  (其余=${total - sum("src/shared") - sum("src/features") - mono})`);
console.log("--- features 明细 ---");
for (const r of rows.filter((x) => x[0].startsWith("src/features")).sort()) console.log(`  ${r[0]}  ${r[1]}`);
console.log("--- 顶层 css/jsx 之外的大文件 TOP5 ---");
for (const r of [...rows].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ${r[0]}  ${r[1]}`);
