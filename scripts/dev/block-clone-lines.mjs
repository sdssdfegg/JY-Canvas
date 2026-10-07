// 只读测量：块级重复 → 折算成「实际被重复覆盖的行数」（RF-032 前置）
// 上一版只报窗口数，窗口之间有重叠（步长 1）会重复计数。本版改为：
// 把每个重复窗口映射回**原始行号区间**，再对区间求并集 ⇒ 得到"这个文件里有多少行是与别处重复的"。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOTS = ["src"];
const SKIP = new Set(["node_modules", "dist", "skill-baselines", "tmp", ".git", ".vite-cache", ".codex-artifacts"]);
const WINDOW = 8;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(e)) out.push(p);
  }
  return out;
}

let files = [];
for (const r of ROOTS) files = files.concat(walk(r));
files = files.map((p) => p.split("\\").join("/"));

/** 归一化并保留原始行号 */
function normalizeLines(src) {
  const out = [];
  src.split(/\r?\n/).forEach((raw, idx) => {
    const t = raw.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "").trim();
    if (t.length > 0) out.push({ t, ln: idx + 1 });
  });
  return out;
}

const totalLines = new Map();
const windows = new Map(); // hash -> Map(file -> [ [start,end], ... ])
const fileWindows = new Map();

for (const f of files) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  totalLines.set(f, src.split(/\r?\n/).length);
  const lines = normalizeLines(src);
  const ranges = new Map();
  for (let i = 0; i + WINDOW <= lines.length; i += 1) {
    const chunk = lines.slice(i, i + WINDOW).map((x) => x.t).join("\n");
    const hash = createHash("sha1").update(chunk).digest("hex").slice(0, 16);
    const range = [lines[i].ln, lines[i + WINDOW - 1].ln];
    if (!windows.has(hash)) windows.set(hash, new Map());
    windows.get(hash).set(f, (windows.get(hash).get(f) || []).concat([range]));
    if (!ranges.has(hash)) ranges.set(hash, []);
    ranges.get(hash).push(range);
  }
  fileWindows.set(f, ranges);
}

// 只保留跨文件的重复窗口，把区间摊回各文件
const covered = new Map(); // file -> [[start,end]]
for (const [, byFile] of windows) {
  if (byFile.size < 2) continue;
  for (const [f, ranges] of byFile) {
    if (!covered.has(f)) covered.set(f, []);
    covered.get(f).push(...ranges);
  }
}

function mergeUnion(ranges) {
  if (!ranges || ranges.length === 0) return 0;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = sorted[0];
  for (const [s, e] of sorted.slice(1)) {
    if (s > ce + 1) { total += ce - cs + 1; cs = s; ce = e; }
    else ce = Math.max(ce, e);
  }
  total += ce - cs + 1;
  return total;
}

console.log(`窗口大小 ${WINDOW} 行 · 扫描 ${files.length} 个文件\n`);
console.log("=== 跨文件重复覆盖的行数（区间并集，已去重）===");
const rows = [];
for (const [f, ranges] of covered) {
  const dup = mergeUnion(ranges);
  const total = totalLines.get(f) || 0;
  rows.push({ f, dup, total, pct: total ? ((dup / total) * 100).toFixed(1) : "0" });
}
rows.sort((a, b) => b.dup - a.dup);
for (const r of rows) {
  console.log(`  ${String(r.dup).padStart(5)} 行 / ${String(r.total).padStart(5)} 行 (${r.pct}%)  ${r.f}`);
}

const sumDup = rows.reduce((a, r) => a + r.dup, 0);
const sumTotal = rows.reduce((a, r) => a + r.total, 0);
console.log(`\n合计：src/ 共 ${sumTotal} 行，其中约 ${sumDup} 行 (${((sumDup / sumTotal) * 100).toFixed(1)}%) 与其它文件成段重复`);
