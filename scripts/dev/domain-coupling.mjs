// 线 B 关键判据：主组件内 handler 的「跨域耦合度」
// 判据：某域 handler 体内若大量引用他域 state/setter ⇒ 抽 hook 需注入大量参数，收益低/风险高
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
const areaOf = (name) => {
  for (const [k, re] of Object.entries(AREAS)) if (re.test(name)) return k;
  return null;
};

function run(file, start, end) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);

  // 1) 收集主组件内 state 变量 → 域
  const state = new Map(); // 变量名 -> 域
  const setters = new Map(); // setXxx -> 域
  for (let i = start - 1; i < end && i < lines.length; i++) {
    const m = /const\s+\[?\s*([A-Za-z0-9_]+)\s*,\s*set([A-Za-z0-9_]+)\s*\]?\s*=\s*useState/.exec(lines[i]);
    if (!m) continue;
    const a = areaOf(m[1]) || "misc";
    state.set(m[1], a);
    setters.set("set" + m[2], a);
  }

  // 2) 收集主组件内 handler（大括号配对）
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

  // 3) 每个 handler 引用了哪些域
  const own = new Map(); // handler名 -> {域, 引用域集合}
  for (const f of fns) {
    const refs = new Set();
    for (const [v, a] of state) if (new RegExp("\\b" + v + "\\b").test(f.body)) refs.add(a);
    for (const [v, a] of setters) if (new RegExp("\\b" + v + "\\b").test(f.body)) refs.add(a);
    own.set(f.name, { area: areaOf(f.name) || "misc", refs, len: f.end - f.ln });
  }

  // 4) 按域汇总：本域行数 / 平均引用域数 / 纯本域函数数
  const byArea = {};
  for (const [name, info] of own) {
    const a = info.area;
    byArea[a] = byArea[a] || { n: 0, len: 0, refSum: 0, pure: 0, pureLen: 0 };
    byArea[a].n += 1; byArea[a].len += info.len; byArea[a].refSum += info.refs.size;
    const onlyOwn = info.refs.size === 0 || (info.refs.size === 1 && info.refs.has(a));
    if (onlyOwn) { byArea[a].pure += 1; byArea[a].pureLen += info.len; }
  }
  const rows = Object.entries(byArea).sort((x, y) => y[1].len - x[1].len);
  console.log(`\n══════ ${file} :: ${start}-${end}`);
  console.log("域".padEnd(12) + "函数  行数  平均引用域数  只碰本域的函数(数/行)");
  for (const [a, v] of rows) {
    console.log(
      a.padEnd(12) + String(v.n).padStart(4) + String(v.len).padStart(6)
      + (v.refSum / v.n).toFixed(2).padStart(12)
      + `   ${v.pure}/${v.n}  ${v.pureLen}/${v.len} 行`
    );
  }
}

run("src/main.jsx", 2248, 8164);
run("src/outfit-workflow.jsx", 6248, 10828);
