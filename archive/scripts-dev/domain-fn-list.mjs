// 线 B 排产辅助：dump 主组件内 handler 的函数级明细（域 / 行区间 / 引用域集合 / 引用到的具体 state）
// 用法: node scripts/dev/domain-fn-list.mjs <file> <start> <end> [area1,area2,...]
import { readFileSync } from "node:fs";

const AREAS = {
  detail: /detail|stitch/i,
  reference: /^reference/i,
  canvas: /canvas/i,
  video: /video/i,
  prompt: /prompt|preset|categor/i,
  directory: /directory|saveDir/i,
  localEdit: /localEdit|mask|brush|crop/i,
  storage: /storage|history|clean/i,
  settings: /settings|connection|apiKey|config/i,
  upload: /upload|drop|file/i,
  preview: /preview|lightbox|zoom|pan/i,
  result: /result|task|download|gallery/i,
};
const areaOf = (n) => {
  for (const [k, re] of Object.entries(AREAS)) if (re.test(n)) return k;
  return "misc";
};

const [, , file, sS, sE, sAreas] = process.argv;
const start = Number(sS), end = Number(sE);
const want = sAreas ? new Set(sAreas.split(",")) : null;
const lines = readFileSync(file, "utf8").split(/\r?\n/);

const state = new Map(), setters = new Map();
for (let i = start - 1; i < end && i < lines.length; i++) {
  const m = /const\s+\[?\s*([A-Za-z0-9_]+)\s*,\s*set([A-Za-z0-9_]+)\s*\]?\s*=\s*useState/.exec(lines[i]);
  if (!m) continue;
  const a = areaOf(m[1]) || "misc";
  state.set(m[1], a);
  setters.set("set" + m[2], a);
}

const fns = [];
for (let i = start - 1; i < end && i < lines.length; i++) {
  const l = lines[i];
  const m = /^(\s+)(?:async\s+)?function\s+([A-Za-z0-9_]+)/.exec(l)
    || /^(\s+)const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/.exec(l);
  if (!m || m[1].length === 0) continue;
  let depth = 0, started = false, e = i;
  for (let j = i; j < lines.length; j++) {
    depth += (lines[j].match(/\{/g) || []).length - (lines[j].match(/\}/g) || []).length;
    if (depth > 0) started = true;
    if (started && depth === 0) { e = j; break; }
    e = j;
  }
  fns.push({ name: m[2], ln: i + 1, end: e + 1, body: lines.slice(i, e + 1).join("\n") });
  i = e;
}

const rows = [];
for (const f of fns) {
  const a = areaOf(f.name);
  if (want && !want.has(a)) continue;
  const vars = [];
  for (const [v, sa] of state) if (new RegExp("\\b" + v + "\\b").test(f.body)) vars.push(v + "[" + sa + "]");
  for (const [v, sa] of setters) if (new RegExp("\\b" + v + "\\b").test(f.body)) vars.push(v + "[" + sa + "]");
  const refs = new Set(vars.map((x) => x.slice(x.indexOf("[") + 1, -1)));
  rows.push({ name: f.name, ln: f.ln, end: f.end, len: f.end - f.ln + 1, refs: [...refs].join(","), vars: vars.join(" ") });
}
rows.sort((x, y) => x.ln - y.ln);
console.log(`\n══════ ${file} ${start}-${end}  ${want ? [...want].join("/") : "ALL"}  共 ${rows.length} 个`);
for (const r of rows) {
  console.log(`${String(r.ln).padStart(5)}-${String(r.end).padEnd(5)} ${String(r.len).padStart(4)}行 ${r.name}`.padEnd(60) + ` 域=${r.refs || "-"}`);
  if (r.vars) console.log(`        ↳ ${r.vars}`);
}
console.log(`合计 ${rows.reduce((a, b) => a + b.len, 0)} 行`);
