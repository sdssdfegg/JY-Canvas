// 只读测量：024/027 视野外的存量重复（server 顶层 *.js + prompts/server）
// RF-024 当时决定"不纳入" server 顶层 *-ai.js 等文件（纳入会新增 16 条跨文件同名）。
// 本脚本只测数量与分布，不入门禁、不改基线。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TOP_LEVEL_FUNCTION_DEF_RE, TOP_LEVEL_ARROW_CONST_DEF_RE } from "../scripts/verify/lib/def-patterns.mjs";

const ROOTS = ["server", "prompts/server"];
const SKIP = new Set(["node_modules", "dist", "skill-baselines", "tmp", ".git"]);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e)) out.push(p.split("\\").join("/"));
  }
  return out;
}

let files = [];
for (const r of ROOTS) files = files.concat(walk(r));

// 只看 server/ 顶层 + prompts/server（core/ 与 routes/ 已被门禁覆盖）
const scoped = files.filter((f) => /^server\/[^/]+\.js$/.test(f) || f.startsWith("prompts/server/"));

const byName = new Map();
for (const f of scoped) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  const names = new Set();
  let m;
  for (const re of [TOP_LEVEL_FUNCTION_DEF_RE, TOP_LEVEL_ARROW_CONST_DEF_RE]) {
    re.lastIndex = 0;
    while ((m = re.exec(src))) names.add(m[1]);
  }
  for (const n of names) {
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(f);
  }
}

const dups = [...byName.entries()].filter(([, fs2]) => new Set(fs2).size > 1);
console.log(`扫描文件: ${scoped.length}（server 顶层 + prompts/server）`);
console.log(`顶层定义数: ${byName.size}`);
console.log(`跨文件同名（门禁视野外的存量）: ${dups.length} 条\n`);
for (const [n, fs2] of dups.sort((a, b) => new Set(b[1]).size - new Set(a[1]).size)) {
  const uniq = [...new Set(fs2)];
  console.log(`  ⚠ ${n}  (${uniq.length} 处)`);
  for (const f of uniq) console.log(`      ${f}`);
}
