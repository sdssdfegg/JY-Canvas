#!/usr/bin/env node
// V11-RF-056：后端 DEF 正则盲区的**只读测量**（不改判据、不动基线、不写任何文件）。
//
// 背景 / 前提核查结论（实测，见脚本输出）：
//   §6.11 写「DEF 正则不认 export function」⇒ 该盲区**已被 RF-026（70b46de）关闭**，
//   且 70b46de 是 71c57d5 的祖先。lib/def-patterns.mjs 的 TOP_LEVEL_FUNCTION_DEF_RE
//   现已认 `export function` / `export async function` / `export default function`。
//   ⇒ 本脚本因此改测**真正还剩下的盲区**：服务端门禁只 import 了函数声明族正则，
//     **没有用** TOP_LEVEL_ARROW_CONST_DEF_RE（箭头常量族）。
//     server-duplication-check.mjs:45 自称「服务端该形式极少」——本脚本就是来验这句话的。
//
// 测什么：
//   1. 现状基数：当前判据（仅函数声明族）在服务端范围内命中多少顶层定义、多少文件。
//   2. 候选扩判据形态（各自单独计数，互不重叠）：
//        ARROW_CONST  `const NAME = (` / `const NAME = async (`   （含 export 前缀）
//        FN_EXPR      `const NAME = function (` / `= async function (`
//        BARE_ARROW   `const NAME = async x =>` （无括号单参）
//        CLASS        `class NAME {`
//      行首锚定（列 0）一致，与现判据同口径。
//   3. 每扩一种形态，会**新增**多少顶层定义进视野；以及**新增多少跨文件同名族**。
//   4. 对新增的跨文件同名族做三类判定（A/B/C）：
//        A = 各定义体（去缩进后）逐字节一致
//        B = 差 1–2 行
//        C = 差 ≥3 行
//
// 🔴 只读：不写文件、不改 scripts/verify/ 下任何判据或基线。
// 用法（仓库根目录）：node scripts/dev/server-def-blindspot-scan.mjs [--json]

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { listServerSourceFiles } from "../verify/lib/server-sources.mjs";
import { TOP_LEVEL_FUNCTION_DEF_RE, TOP_LEVEL_ARROW_CONST_DEF_RE } from "../verify/lib/def-patterns.mjs";

const ROOT = process.cwd();
const asJson = process.argv.includes("--json");

// 现判据（服务端门禁实际只用了这一条）
const RE_FN = new RegExp(TOP_LEVEL_FUNCTION_DEF_RE.source, "gm");
// 候选形态
const FORMS = [
  { id: "ARROW_CONST", label: "const NAME = ( / async (", re: new RegExp(TOP_LEVEL_ARROW_CONST_DEF_RE.source, "gm") },
  { id: "FN_EXPR", label: "const NAME = function ( / async function (", re: /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\*?\s*\(/gm },
  { id: "BARE_ARROW", label: "const NAME = async x => （无括号单参）", re: /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/gm },
  { id: "CLASS", label: "class NAME {", re: /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/gm },
];

/** 抽顶层定义：只取列 0 起步的声明，返回 name/file/line/body（去缩进后的定义体）。 */
function collect(re, files) {
  const out = [];
  for (const rel of files) {
    let source;
    try { source = readFileSync(path.join(ROOT, rel), "utf8"); } catch { continue; }
    const lines = source.split(/\r?\n/);
    const rx = new RegExp(re.source, "gm");
    let m;
    while ((m = rx.exec(source)) !== null) {
      const line = source.slice(0, m.index).split(/\r?\n/).length;
      out.push({ name: m[1], file: rel, line, body: bodyOf(lines, line - 1) });
    }
  }
  return out;
}

/** 从声明行取到"列 0 的闭合花括号"为止；取不到就退化为声明行本身。 */
function bodyOf(lines, startIdx) {
  const end = Math.min(lines.length, startIdx + 400);
  const body = [];
  for (let i = startIdx; i < end; i += 1) {
    body.push(lines[i]);
    if (i > startIdx && lines[i] === "}") break;
  }
  const ind = /^[ \t]*/.exec(lines[startIdx])?.[0].length || 0;
  return body.map((l) => (l.startsWith(" ".repeat(ind)) ? l.slice(ind) : l)).join("\n");
}

/** 跨文件同名族（名字出现在 2+ 个不同文件）。 */
function crossFileGroups(defs) {
  const byName = new Map();
  for (const d of defs) {
    if (!byName.has(d.name)) byName.set(d.name, []);
    byName.get(d.name).push(d);
  }
  return [...byName.entries()]
    .filter(([, list]) => new Set(list.map((d) => d.file)).size > 1)
    .map(([name, list]) => ({ name, members: list.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** 三类判定：两两比较定义体，取"最差"的那一档。 */
function classify(group) {
  const bodies = group.members.map((m) => m.body.split(/\r?\n/));
  let worst = 0;
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      let diff = 0;
      for (let k = 0; k < Math.max(a.length, b.length); k += 1) if (a[k] !== b[k]) diff += 1;
      worst = Math.max(worst, diff);
    }
  }
  return { diff: worst, kind: worst === 0 ? "A" : worst <= 2 ? "B" : "C" };
}

const files = listServerSourceFiles().map((f) => path.relative(ROOT, f).replace(/\\/g, "/")).sort();

const current = collect(RE_FN, files);
const currentNames = new Set(current.map((d) => d.name));
const currentGroups = crossFileGroups(current);

const report = {
  note: "V11-RF-056 只读测量：不改判据、不动基线、不写文件。",
  scope: { root: "server/", files: files.length },
  premiseCheck: {
    claim: "§6.11：server-duplication-check 的 DEF 正则不认 export function",
    verdict: "前提已过期",
    evidence: "RF-026（70b46de，已是 71c57d5 祖先）已把 export 前缀写进 lib/def-patterns.mjs 的 TOP_LEVEL_FUNCTION_DEF_RE",
  },
  current: {
    judgments: ["TOP_LEVEL_FUNCTION_DEF_RE（函数声明族，含 export/async/default）"],
    topLevelDefs: current.length,
    distinctNames: currentNames.size,
    crossFileGroups: currentGroups.length,
    groups: currentGroups.map((g) => ({ name: g.name, files: [...new Set(g.members.map((m) => m.file))].sort() })),
  },
  candidates: [],
  stillInvisibleNote: "以上形态之外仍不在视野的：缩进的内层函数（刻意不扫）、对象方法、匿名 default 导出。",
};

// ── 反事实：直接用当前快照回答 §6.11 的字面问题 ──────────────────
// 「若把 export function 纳入判据，会新增多少命中、哪些族、三类判定是什么」
// 虽然 RF-026 已经纳了，但把**旧判据**跑一遍就能给出这个数（且是活数据，不是历史转述）。
const OLD_RE = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm; // RF-026 之前那版
const PREFIX_FORMS = [
  { id: "裸 function", re: /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm },
  { id: "裸 async function", re: /^async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm },
  { id: "export function", re: /^export\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm },
  { id: "export async function", re: /^export\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*\(/gm },
  { id: "export default function", re: /^export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm },
];

const oldDefs = collect(OLD_RE, files);
const oldGroups = crossFileGroups(oldDefs);
const oldNames = new Set(oldDefs.map((d) => d.name));
const gainedByExport = current.filter((d) => !oldNames.has(d.name));
const gainedGroups = currentGroups.filter((g) => !oldGroups.some((o) => o.name === g.name));

report.exportCounterfactual = {
  question: "若把 export function 纳入判据，会新增多少命中 / 哪些族 / 三类判定是什么",
  answer: "RF-026 已经纳入了；以下是在 71c57d5 上用旧判据重跑得到的**反事实**数字（活数据）。",
  oldJudgmentDefs: oldDefs.length,
  newJudgmentDefs: current.length,
  gainedDefs: gainedByExport.length,
  gainedRatio: Math.round((gainedByExport.length / current.length) * 1000) / 10,
  byPrefixForm: PREFIX_FORMS.map((f) => ({ form: f.id, count: collect(f.re, files).length })),
  oldCrossFileGroups: oldGroups.length,
  newCrossFileGroups: currentGroups.length,
  gainedCrossFileGroups: gainedGroups.length,
  gainedGroupDetail: gainedGroups.map((g) => {
    const c = classify(g);
    return {
      name: g.name,
      kind: c.kind,
      diff: c.diff,
      locations: g.members.map((m) => `${m.file}:${m.line}`),
    };
  }),
};

for (const form of FORMS) {
  const defs = collect(form.re, files);
  const fresh = defs.filter((d) => !currentNames.has(d.name));
  const groups = crossFileGroups(defs);
  const freshGroups = groups.filter((g) => !currentGroups.some((c) => c.name === g.name));
  report.candidates.push({
    id: form.id,
    form: form.label,
    matches: defs.length,
    newDefsInView: fresh.length,
    crossFileGroups: groups.length,
    newCrossFileGroups: freshGroups.length,
    hits: defs.map((d) => `${d.name} @ ${d.file}:${d.line}`),
    groups: groups.map((g) => {
      const c = classify(g);
      return {
        name: g.name,
        kind: c.kind,
        diff: c.diff,
        locations: g.members.map((m) => `${m.file}:${m.line}`),
      };
    }),
  });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`[RF-056 只读测量] 服务端范围：${files.length} 个文件`);
  console.log(`[RF-056] 前提核查：${report.premiseCheck.verdict} —— ${report.premiseCheck.evidence}`);
  console.log(
    `[RF-056] 现状：顶层定义 ${report.current.topLevelDefs} 个 / 去重名 ${report.current.distinctNames} 个 / ` +
      `跨文件同名族 ${report.current.crossFileGroups} 个`
  );
  if (report.current.crossFileGroups) {
    for (const g of report.current.groups) console.log(`    现有同名族：${g.name} -> ${g.files.join(" | ")}`);
  }
  console.log("[RF-056] 候选扩判据形态（各自单独测）：");
  for (const c of report.candidates) {
    console.log(
      `  ${c.id.padEnd(12)} ${c.form.padEnd(44)} 命中 ${String(c.matches).padStart(4)} ` +
        `新增进视野 ${String(c.newDefsInView).padStart(4)} 跨文件同名族 ${c.crossFileGroups}（新增 ${c.newCrossFileGroups}）`
    );
    for (const h of c.hits) console.log(`      命中：${h}`);
    for (const g of c.groups) {
      console.log(`      [${g.kind}] ${g.name}（差 ${g.diff} 行） ${g.locations.join(" ↔ ")}`);
    }
  }
  const cf = report.exportCounterfactual;
  console.log("[RF-056] 反事实（用 RF-026 之前的旧判据在同一快照上重跑）：");
  console.log(
    `  旧判据顶层定义 ${cf.oldJudgmentDefs} → 现判据 ${cf.newJudgmentDefs}` +
      `（新增 ${cf.gainedDefs} 个，占现判据 ${cf.gainedRatio}%）`
  );
  for (const p of cf.byPrefixForm) console.log(`    ${p.form.padEnd(26)} ${p.count}`);
  console.log(
    `  跨文件同名族：旧 ${cf.oldCrossFileGroups} → 现 ${cf.newCrossFileGroups}` +
      `（新增 ${cf.gainedCrossFileGroups} 个）`
  );
  for (const g of cf.gainedGroupDetail) {
    console.log(`    [${g.kind}] ${g.name}（差 ${g.diff} 行） ${g.locations.join(" ↔ ")}`);
  }
  console.log(`[RF-056] ${report.stillInvisibleNote}`);
}
