// 只读测量：循环依赖 + 模块扇入扇出（tmp，不入门禁）
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";

const ROOTS = ["src", "server/core", "server/routes", "prompts/server"];
const SKIP = new Set(["node_modules", "dist", "skill-baselines", "tmp", ".git", ".vite-cache"]);

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

const RE = /(?:import|export)[^'"\n]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
const exists = (p) => { try { readFileSync(p); return true; } catch { return false; } };

function resolvePath(from, spec) {
  const base = normalize(join(dirname(from), spec));
  for (const c of [base, base + ".js", base + ".jsx", join(base, "index.js"), join(base, "index.jsx")]) {
    const n = c.split("\\").join("/");
    if (exists(n)) return n;
  }
  return null;
}

const edges = new Map();
let unresolved = 0;
for (const f of files) {
  let src;
  try { src = readFileSync(f, "utf8"); } catch { continue; }
  const deps = new Set();
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith(".")) continue;
    const r = resolvePath(f, spec);
    if (r) deps.add(r);
    else unresolved += 1;
  }
  edges.set(f, [...deps]);
}

const WHITE = 0, GRAY = 1, BLACK = 2;
const color = new Map([...edges.keys()].map((k) => [k, WHITE]));
const cycles = [];
const stack = [];
function dfs(n) {
  color.set(n, GRAY);
  stack.push(n);
  for (const d of edges.get(n) || []) {
    if (!edges.has(d)) continue;
    const c = color.get(d);
    if (c === GRAY) cycles.push([...stack.slice(stack.indexOf(d)), d]);
    else if (c === WHITE) dfs(d);
  }
  stack.pop();
  color.set(n, BLACK);
}
for (const n of edges.keys()) if (color.get(n) === WHITE) dfs(n);

const fanIn = new Map();
for (const [, deps] of edges) for (const d of deps) fanIn.set(d, (fanIn.get(d) || 0) + 1);

console.log("扫描文件数:", edges.size, "（未解析的相对 import:", unresolved, "）");
console.log("\n=== 循环依赖 ===");
console.log("环数量:", cycles.length);
for (const c of cycles.slice(0, 12)) console.log("  ⚠", c.map((x) => relative(process.cwd(), x)).join(" → "));

console.log("\n=== 扇入 Top 12（被最多文件依赖 ⇒ 改动影响面最大）===");
[...fanIn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([f, n]) => console.log(`  ${String(n).padStart(3)}  ${f}`));

console.log("\n=== 扇出 Top 10（自己依赖最多 ⇒ 最容易变成上帝模块）===");
[...edges.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)
  .forEach(([f, d]) => console.log(`  ${String(d.length).padStart(3)}  ${f}`));
