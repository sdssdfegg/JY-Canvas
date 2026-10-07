// RF-080 只读分析：outfit-workflow.jsx 模块顶层 5 个"独立组件"的作用域实测
//
// 为什么要写这个脚本（RF-079 教训）：
//   column-0 的文本缩进 ≠ 词法作用域。measure-top.mjs 只是按 indent=0 抓行，
//   抓出来的"顶层"可能是别的东西的内部函数（buildTasks/modelForIndex 就是这样误判的）。
//   本脚本走 ESLint 官方 scope 分析（escope），用 scope.through 取真正的自由标识符。
//
// 输出四块：
//   1) 每个候选组件是否真在 Program.body（真模块顶层）+ 行范围 + props 清单
//   2) 每个组件的自由标识符（scope.through），按来源分类：import / 本文件顶层 / 全局
//   3) 传递闭包：组件依赖的顶层定义 → 它们又依赖谁（能否整体搬走而不反向 import）
//   4) 闭包成员的"区外引用"统计：谁还需要从新文件 import 回去（单向 ≠ 成环）
//
// 用法： node scripts/dev/rf080-scope-scan.mjs [文件] [组件名...]

import fs from "node:fs";
import { Linter } from "eslint";

const file = process.argv[2] || "src/outfit-workflow.jsx";
const targets = process.argv.slice(3);
const code = fs.readFileSync(file, "utf8");

// OutfitWorkflow 本体区间（用于判断"本体是否也用这个顶层定义"）
const BODY_START = 4904;
const BODY_END = 9268;

let sourceCode = null;
let programNode = null;
let moduleScope = null;

// 🔴 JSX 标签不是 escope 的 reference（eslint-plugin-react 需要专门的 jsx-uses-vars 规则就是证据）。
//    所以只靠 scope.through 会漏掉组件在 JSX 里用到的图标 / 子组件，必须自己补。
const jsxRefs = []; // { name, line, free }

const scanRule = {
  create(ctx) {
    sourceCode = ctx.sourceCode || ctx.getSourceCode();
    return {
      Program(node) {
        programNode = node;
        const globalScope = sourceCode.scopeManager.globalScope;
        moduleScope = globalScope.childScopes.find((s) => s.type === "module") || globalScope;
      },
      JSXOpeningElement(node) {
        let name = null;
        if (node.name.type === "JSXIdentifier") name = node.name.name;
        else if (node.name.type === "JSXMemberExpression") name = node.name.object?.name;
        if (!name) return;
        if (/^[a-z]/.test(name)) return; // 内在元素（div/span/...）不算引用
        // 判断是否为自由标识符：从该节点所在 scope 向上找声明，撞到 moduleScope 前找不到 ⇒ 自由
        let scope = sourceCode.getScope(node);
        let declared = false;
        while (scope) {
          // 到了模块层还没找到 ⇒ 它是模块级依赖（import 绑定或本文件顶层定义），对我们算"自由"
          if (scope === moduleScope) break;
          if (scope.set && scope.set.has(name)) { declared = true; break; }
          scope = scope.upper;
        }
        jsxRefs.push({ name, line: node.loc.start.line, free: !declared });
      },
    };
  },
};

const linter = new Linter();
const messages = linter.verify(
  code,
  [
    {
      files: ["**/*.{js,jsx}"],
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      plugins: { local: { rules: { scan: scanRule } } },
      rules: { "local/scan": "error" },
    },
  ],
  file
);

const fatal = messages.filter((m) => m.fatal);
if (fatal.length) {
  console.log("解析失败:", fatal[0].message, "line", fatal[0].line);
  process.exit(1);
}
if (!moduleScope) {
  console.log("未拿到 moduleScope");
  process.exit(1);
}

// ---- 顶层声明表 ----
const topVars = new Map();
function bodyOf(node) {
  // const X = () => {} 的 def.node 是 VariableDeclarator，往上取声明
  return node.type === "VariableDeclarator" ? node.parent : node;
}
for (const v of moduleScope.variables) {
  const def = v.defs && v.defs[0];
  if (!def) continue;
  const declNode = bodyOf(def.node);
  const start = declNode.loc.start.line;
  const end = declNode.loc.end.line;
  topVars.set(v.name, {
    name: v.name,
    variable: v,
    defType: def.type,
    node: declNode,
    start,
    end,
    size: end - start + 1,
    topLevel: declNode.parent === programNode || (declNode.parent?.type === "ExportNamedDeclaration" && declNode.parent.parent === programNode),
  });
}

// ---- import 来源 ----
const importSource = new Map();
for (const st of programNode.body) {
  if (st.type !== "ImportDeclaration") continue;
  for (const sp of st.specifiers) importSource.set(sp.local.name, st.source.value);
}

// ---- 取某个顶层定义的"函数体节点"与自由标识符 ----
function fnNodeOf(entry) {
  if (entry.node.type === "FunctionDeclaration") return entry.node;
  if (entry.node.type === "VariableDeclaration") {
    const init = entry.node.declarations[0]?.init;
    if (init && /FunctionExpression|ArrowFunctionExpression/.test(init.type)) return init;
  }
  return null;
}
// 非函数定义（const X = Y / const X = {...}）没有自有 scope，靠子树扫标识符补依赖
const SKIP_KEYS = new Set(["parent", "loc", "range", "start", "end", "leadingComments", "trailingComments", "comments", "tokens"]);
function collectIdents(node, out, skipSelf) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collectIdents(n, out, skipSelf);
    return;
  }
  if (typeof node.type !== "string") return;
  if (node.type === "Identifier") {
    if (node.name !== skipSelf) out.push({ name: node.name, loc: node.loc });
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (SKIP_KEYS.has(k)) continue;
    if (node.type === "MemberExpression" && k === "property") continue;
    if ((node.type === "Property" || node.type === "MethodDefinition") && k === "key") continue;
    if (node.type === "JSXAttribute" && k === "name") continue;
    if ((node.type === "ImportSpecifier" || node.type === "ImportDefaultSpecifier") && (k === "local" || k === "imported")) continue;
    collectIdents(v, out, skipSelf);
  }
}

function freeOf(entry) {
  const fn = fnNodeOf(entry);
  const out = [];
  if (fn) {
    const scope = sourceCode.getScope(fn);
    out.push(...(scope.through || []).map((r) => r.identifier));
  } else {
    collectIdents(entry.node, out, entry.name);
  }
  // 补：该定义行范围内的 JSX 组件引用（大写开头、且非局部声明）
  for (const j of jsxRefs) {
    if (j.free && j.line >= entry.start && j.line <= entry.end) out.push({ name: j.name, loc: { start: { line: j.line } } });
  }
  return out;
}

const GLOBALS = new Set([
  "window", "document", "console", "Math", "JSON", "Object", "Array", "String", "Number", "Boolean",
  "Date", "Promise", "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame",
  "cancelAnimationFrame", "URL", "FormData", "Blob", "File", "FileReader", "Image", "Error", "RegExp",
  "Map", "Set", "WeakMap", "parseInt", "parseFloat", "isNaN", "undefined", "NaN", "Infinity",
  "navigator", "localStorage", "fetch", "AbortController", "TextDecoder", "structuredClone", "globalThis",
  "Element", "HTMLElement", "HTMLInputElement", "HTMLCanvasElement", "HTMLDivElement", "Node",
  "DataTransfer", "FileList", "MouseEvent", "KeyboardEvent", "Event", "CustomEvent", "DOMRect",
  "CanvasRenderingContext2D", "ImageData", "OffscreenCanvas", "Path2D",
]);

function classify(ident) {
  const n = ident.name;
  if (importSource.has(n)) return "import";
  if (topVars.has(n)) return "top-level";
  if (GLOBALS.has(n)) return "global";
  return "UNKNOWN";
}

function refLines(name) {
  const t = topVars.get(name);
  // 🔴 escope 不把 JSX 标签算 reference ⇒ 组件类名字必须靠自己收集的 jsxRefs 补齐，
  //    否则 "<CropModal>" 这种调用点会被漏掉，误判成"零区外引用"。
  const a = t ? t.variable.references.map((r) => r.identifier.loc.start.line) : [];
  const b = jsxRefs.filter((j) => j.name === name).map((j) => j.line);
  return [...a, ...b];
}

function propsOf(entry) {
  const fn = fnNodeOf(entry);
  if (!fn) return [];
  const p0 = fn.params && fn.params[0];
  if (!p0 || p0.type !== "ObjectPattern") return ["(非解构单参)"];
  return p0.properties.map((p) => (p.type === "RestElement" ? `...${p.argument.name}` : (p.key?.name ?? "?")));
}

const list = targets.length ? targets : ["BatchResizePanel", "UploadZone", "WorkflowQuickVideoPanel", "CropModal", "PromptPresetGrid"];

console.log(`文件: ${file}`);
console.log(`顶层声明总数: ${topVars.size}（真在 Program.body 的: ${[...topVars.values()].filter((v) => v.topLevel).length}）`);
console.log("");

const allClosure = new Set();
const report = {};

for (const name of list) {
  const t = topVars.get(name);
  if (!t) {
    console.log(`### ${name}: 未在顶层声明表中找到`);
    continue;
  }
  const ids = freeOf(t);
  const free = new Map();
  for (const id of ids) {
    const rec = free.get(id.name);
    if (rec) { rec.count++; continue; }
    free.set(id.name, { count: 1, firstLine: id.loc.start.line, kind: classify(id) });
  }
  const rows = [...free].map(([fname, i]) => ({
    name: fname, kind: i.kind, count: i.count, firstLine: i.firstLine,
    source: importSource.get(fname) || "",
    ...(topVars.has(fname) ? { def: `${topVars.get(fname).start}-${topVars.get(fname).end}`, defSize: topVars.get(fname).size, defLines: refLines(fname) } : {}),
  })).sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count);
  report[name] = { entry: t, rows, props: propsOf(t) };

  console.log(`### ${name}  ${t.start}-${t.end} (${t.size} 行)  真顶层=${t.topLevel}`);
  console.log(`  props(${report[name].props.length}): ${report[name].props.join(", ")}`);
  const by = (k) => rows.filter((r) => r.kind === k);
  console.log(`  自由标识符 ${rows.length}：import ${by("import").length} / 本文件顶层 ${by("top-level").length} / 全局 ${by("global").length} / 未知 ${by("UNKNOWN").length}`);
  if (by("UNKNOWN").length) console.log(`  🔴 UNKNOWN: ${by("UNKNOWN").map((f) => `${f.name}@${f.firstLine}`).join(", ")}`);
  console.log("  --- import ---");
  for (const f of by("import")) console.log(`    ${f.name}  <- ${f.source}  (×${f.count})`);
  console.log("  --- 本文件顶层定义（引用分布：本体=4904+，组件区=<4904）---");
  for (const f of by("top-level")) {
    const L = f.defLines;
    const inBody = L.filter((l) => l >= BODY_START && l <= BODY_END).length;
    console.log(`    ${f.name}  def ${f.def} (${f.defSize}行) ×${f.count}  refs{总${L.length} 本体${inBody} 组件区${L.length - inBody}}`);
  }
  console.log(`  --- 全局 --- ${by("global").map((f) => f.name).join(", ") || "(无)"}`);
  console.log("");
}

// ---- 传递闭包 ----
console.log("======== 传递闭包（组件依赖的顶层定义 → 它们又依赖谁） ========");
const componentRanges = list.map((n) => topVars.get(n)).filter(Boolean);

function closureOf(seedNames) {
  const closure = new Map();
  const queue = [...seedNames];
  const missing = new Set();
  while (queue.length) {
    const n = queue.shift();
    if (closure.has(n)) continue;
    const t = topVars.get(n);
    if (!t) continue;
    closure.set(n, t);
    for (const id of freeOf(t)) {
      const k = classify(id);
      if (k === "top-level") { if (!closure.has(id.name)) queue.push(id.name); }
      else if (k === "UNKNOWN") missing.add(`${n}->${id.name}@${id.loc.start.line}`);
    }
  }
  return { closure, missing };
}

for (const name of list) {
  const r = report[name];
  if (!r) continue;
  const seeds = r.rows.filter((x) => x.kind === "top-level").map((x) => x.name);
  const { closure, missing } = closureOf(seeds);
  const inRanges = [...componentRanges, ...closure.values()];
  const inside = (line) => inRanges.some((e) => line >= e.start && line <= e.end);
  let lines = 0;
  const outRefs = [];
  for (const [cn, ce] of closure) {
    lines += ce.size;
    allClosure.add(cn);
    const outside = refLines(cn).filter((l) => !inside(l));
    outRefs.push({ name: cn, def: `${ce.start}-${ce.end}`, size: ce.size, outside: outside.length, sample: outside.slice(0, 4) });
  }
  outRefs.sort((a, b) => a.def.localeCompare(b.def));
  console.log(`### ${name}: 闭包 ${closure.size} 个定义 / ${lines} 行`);
  if (missing.size) console.log(`  🔴 闭包内 UNKNOWN 依赖: ${[...missing].join(", ")}`);
  for (const o of outRefs) {
    if (o.outside > 0) console.log(`    ${o.name} def ${o.def} (${o.size}行) → 区外引用 ${o.outside} 处 @${o.sample.join(",")}${o.outside > 4 ? "…" : ""}`);
  }
  const clean = outRefs.filter((o) => o.outside === 0);
  console.log(`    零区外引用（可直接搬、无需回填 import）: ${clean.length} 个 / ${clean.reduce((s, o) => s + o.size, 0)} 行`);
  console.log("");
}

// ---- 合并闭包（方案甲：5 个组件合一个文件）----
console.log("======== 五组件合并闭包 ========");
const seedsAll = [];
for (const name of list) {
  const r = report[name];
  if (r) seedsAll.push(...r.rows.filter((x) => x.kind === "top-level").map((x) => x.name));
}
const { closure: cAll, missing: mAll } = closureOf([...new Set(seedsAll)]);
const compLines = componentRanges.reduce((s, e) => s + e.size, 0);
const closLines = [...cAll.values()].reduce((s, e) => s + e.size, 0);
console.log(`组件本身: ${componentRanges.length} 个 / ${compLines} 行`);
console.log(`闭包定义: ${cAll.size} 个 / ${closLines} 行`);
console.log(`合计可搬: ${compLines + closLines} 行`);
if (mAll.size) console.log(`🔴 合并闭包内 UNKNOWN 依赖: ${[...mAll].join(", ")}`);

// 以「5 组件 + 全部闭包成员」为内部区域，重算每个闭包成员的区外引用
const movedRanges = [...componentRanges, ...cAll.values()];
const insideMoved = (line) => movedRanges.some((e) => line >= e.start && line <= e.end);
const shared = [];
const exclusive = [];
for (const [cn, ce] of cAll) {
  const outside = refLines(cn).filter((l) => !insideMoved(l));
  const rec = { name: cn, def: `${ce.start}-${ce.end}`, size: ce.size, outside: outside.length, sample: outside.slice(0, 6) };
  (outside.length ? shared : exclusive).push(rec);
}
shared.sort((a, b) => a.def.localeCompare(b.def));
exclusive.sort((a, b) => a.def.localeCompare(b.def));
const sum = (arr) => arr.reduce((s, o) => s + o.size, 0);
console.log("");
console.log(`【专属闭包】区外引用=0，可随组件一起进新文件、原文件零回填：${exclusive.length} 个 / ${sum(exclusive)} 行`);
console.log(`  ${exclusive.map((o) => `${o.name}(${o.size})`).join(", ")}`);
console.log("");
console.log(`【共享闭包】本体或其它留存代码仍在用 ⇒ 搬走后原文件必须从新文件 import 回来（单向，不成环）：${shared.length} 个 / ${sum(shared)} 行`);
for (const o of shared) {
  console.log(`  ${o.name}  def ${o.def} (${o.size}行)  区外 ${o.outside} 处 @${o.sample.join(",")}${o.outside > 6 ? "…" : ""}`);
}

// ---- 孤儿 import 预测 ----
console.log("");
console.log("======== 搬走后可能变孤儿的 import（引用全部落在搬走区域内）========");
const orphan = [];
const kept = [];
for (const [name, src] of importSource) {
  const v = moduleScope.variables.find((x) => x.name === name);
  if (!v) continue;
  const lines = v.references.map((r) => r.identifier.loc.start.line);
  const allIn = lines.length > 0 && lines.every((l) => insideMoved(l));
  (allIn ? orphan : kept).push({ name, src, count: lines.length });
}
orphan.sort((a, b) => a.src.localeCompare(b.src));
console.log(`孤儿（可删）${orphan.length} 个；仍需保留 ${kept.length} 个`);
for (const o of orphan) console.log(`  ${o.name} <- ${o.src} (×${o.count})`);

// ---- 新文件需要的 import 全量清单 ----
console.log("");
console.log("======== 新文件（组件 + 闭包）需要的 import ========");
const need = new Map(); // source -> Set(name)
for (const name of list) {
  const r = report[name];
  if (!r) continue;
  for (const f of r.rows) if (f.kind === "import") need.set(f.source, (need.get(f.source) || new Set()).add(f.name));
}
for (const [, ce] of cAll) {
  for (const id of freeOf(ce)) {
    if (classify(id) === "import") need.set(importSource.get(id.name), (need.get(importSource.get(id.name)) || new Set()).add(id.name));
  }
}
let needCount = 0;
const sortedSrc = [...need.keys()].sort();
for (const src of sortedSrc) {
  const names = [...need.get(src)].sort();
  needCount += names.length;
  console.log(`  ${src}: ${names.join(", ")}`);
}
console.log(`合计 ${sortedSrc.length} 个来源 / ${needCount} 个绑定 ⇒ 写成多行 import 块约 ${needCount + 2 * sortedSrc.length} 行`);
