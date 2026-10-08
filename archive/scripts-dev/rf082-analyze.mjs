// RF-082 只读分析：用 @babel/parser + @babel/traverse 做真·词法作用域甄别。
// 输出：main.jsx 全量模块级函数/常量清单 + 每个函数的模块级依赖（自由标识符抽测）。
// 仅读取，不改 src。
import { readFileSync } from "node:fs";
import { parse } from "@babel/parser";
import * as traverseNS from "@babel/traverse";
const traverse = (traverseNS.default && traverseNS.default.default) || traverseNS.default || traverseNS;

const FILE = "src/main.jsx";
const src = readFileSync(FILE, "utf8");
const lines = src.split(/\r?\n/);

const ast = parse(src, {
  sourceType: "module",
  plugins: ["jsx", "classProperties", "decorators-legacy", "dynamicImport"],
  ranges: true,
});

// ---- 内建 / 全局白名单（引用到这些不算"外部依赖"）----
const BUILTINS = new Set([
  "React","useState","useEffect","useMemo","useRef","useCallback","useReducer","useContext","useLayoutEffect",
  "console","Math","JSON","Object","Array","String","Number","Boolean","Promise","Date","RegExp","Map","Set","WeakMap","WeakSet",
  "parseInt","parseFloat","isNaN","isFinite","setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame",
  "document","window","navigator","localStorage","sessionStorage","location","history","fetch","FileReader","Blob","File","URL",
  "Image","FileList","Event","CustomEvent","Error","TypeError","Promise","Symbol","Proxy","Reflect","Intl","structuredClone",
  "undefined","null","true","false","this","arguments","self","globalThis","ImageBitmap","DOMParser","XMLHttpRequest","WebSocket",
  "encodeURIComponent","decodeURIComponent","btoa","atob","TextDecoder","TextEncoder","URLSearchParams","FormData","HTMLElement",
  "getComputedStyle","matchMedia","alert","confirm","prompt","Backbone","Buffer","process","module","exports",
]);

// ---- 收集模块级绑定（Program 直接子节点）----
const moduleFuncs = [];        // 函数型模块级定义
const moduleConsts = [];        // 非函数型模块级常量/变量
const moduleNames = new Set();  // 模块级可解析名字（函数 + const + import）
const importNames = new Set();

traverse(ast, {
  ImportDeclaration(p) {
    for (const s of p.node.specifiers) importNames.add(s.local.name);
  },
});

// 第二遍：模块级声明
const program = ast.program;
for (const node of program.body) {
  const start = node.start;
  const end = node.end;
  const sl = src.slice(0, start).split("\n").length;
  const el = src.slice(0, end).split("\n").length;
  if (node.type === "FunctionDeclaration" && node.id) {
    moduleFuncs.push({ name: node.id.name, start: sl, end: el, kind: "function", node });
    moduleNames.add(node.id.name);
  } else if (node.type === "VariableDeclaration") {
    for (const d of node.declarations) {
      if (!d.id || d.id.type !== "Identifier") continue;
      const name = d.id.name;
      moduleNames.add(name);
      // 是否函数型（init 是箭头 / function）
      const init = d.init;
      const isFn = init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression");
      if (isFn) moduleFuncs.push({ name, start: sl, end: el, kind: "const-arrow", node: init });
      else moduleConsts.push({ name, start: sl, end: el, kind: node.kind, node });
    }
  }
}

// 确定 App 区间（用于真伪校验）
const appNode = moduleFuncs.find((f) => f.name === "App");
const appRange = appNode ? [appNode.start, appNode.end] : null;

// ---- 收集模块级函数 NodePath（用 babel scope 做自由标识符抽测）----
const moduleFnPaths = [];
traverse(ast, {
  Program(path) {
    path.get("body").forEach((stmt) => {
      if (stmt.isFunctionDeclaration() && stmt.node.id) moduleFnPaths.push(stmt);
      else if (stmt.isVariableDeclaration()) {
        stmt.get("declarations").forEach((d) => {
          const init = d.node.init;
          if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression") && d.node.id && d.node.id.type === "Identifier") {
            moduleFnPaths.push(d.get("init"));
          }
        });
      }
    });
  },
});

// ---- 对每个模块级函数做自由标识符抽测 ----
function analyzeFn(fnPath) {
  const deps = new Set();       // 引用的模块级名字（其他函数/常量）
  const importRefs = new Set(); // 引用的 import 名字
  const unresolved = new Set(); // 既不是模块级、也不是内建/局部的引用（疑似 App 闭包）
  const programScope = fnPath.scope.getProgramParent();
  const selfName = fnPath.node.id ? fnPath.node.id.name : null;

  fnPath.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (name === selfName) return; // 自引用（递归）忽略
      const binding = p.scope.getBinding(name);
      if (!binding) {
        if (BUILTINS.has(name)) return;
        // 属性访问的成员名（a.b 的 b，非计算）不算自由变量
        const parent = p.parent;
        if (parent.type === "MemberExpression" && parent.property === p.node && !parent.computed) return;
        if (parent.type === "JSXAttribute" && parent.name === p.node) return;
        unresolved.add(name);
        return;
      }
      // 模块级（含 import）绑定
      if (binding.scope === programScope) {
        if (importNames.has(name)) importRefs.add(name);
        else deps.add(name);
      }
      // 否则是函数内局部绑定，忽略
    },
  });

  return { deps: [...deps], imports: [...importRefs], unresolved: [...unresolved] };
}

console.log("=== 全量清单 ===");
console.log("文件总行数:", lines.length);
console.log("App 区间:", appRange ? `${appRange[0]}-${appRange[1]}` : "未找到");
console.log("模块级函数型定义:", moduleFuncs.length, "| 模块级非函数常量:", moduleConsts.length);
console.log();

console.log("--- 模块级函数型定义（按起始行）---");
for (const f of moduleFuncs.sort((a, b) => a.start - b.start)) {
  const len = f.end - f.start + 1;
  const pseudo = appRange && f.start >= appRange[0] && f.start <= appRange[1] && f.name !== "App";
  console.log(`  ${String(f.start).padStart(5)}-${String(f.end).padStart(5)}  ${String(len).padStart(4)} 行  ${f.kind.padEnd(10)}  ${f.name}${pseudo ? "  ⚠伪顶层" : ""}`);
}

console.log();
console.log("--- 模块级非函数常量（随迁项候选）---");
for (const c of moduleConsts.sort((a, b) => a.start - b.start)) {
  const len = c.end - c.start + 1;
  console.log(`  ${String(c.start).padStart(5)}-${String(c.end).padStart(5)}  ${String(len).padStart(4)} 行  ${c.kind}  ${c.name}`);
}

console.log();
console.log("--- 自由标识符抽测（每个函数引用的模块级名字 / import 数 / 未解析）---");
const fnPathByName = new Map(moduleFnPaths.map((p) => [p.node.id ? p.node.id.name : (p.node.id && p.node.id.name), p]));
// 处理 const 箭头（node.id 为 null，用父 VariableDeclarator 的 id）
const fnPathByConst = new Map();
for (const p of moduleFnPaths) {
  if (!p.node.id) {
    const d = p.parentPath && p.parentPath.node && p.parentPath.node.id;
    if (d && d.type === "Identifier") fnPathByConst.set(d.name, p);
  }
}
function findFnPath(name) { return fnPathByName.get(name) || fnPathByConst.get(name); }

for (const f of moduleFuncs.filter((x) => x.name !== "App").sort((a, b) => a.start - b.start)) {
  const fp = findFnPath(f.name);
  if (!fp) { console.log(`\n# ${f.name} (${f.start}-${f.end})  ⚠ 未找到 path`); continue; }
  const r = analyzeFn(fp);
  const len = f.end - f.start + 1;
  console.log(`\n# ${f.name} (${f.start}-${f.end}, ${len} 行)`);
  console.log(`   模块级依赖(${r.deps.length}): ${r.deps.length ? r.deps.join(", ") : "（无）"}`);
  console.log(`   import 引用(${r.imports.length}): ${r.imports.length ? r.imports.slice(0, 12).join(", ") + (r.imports.length > 12 ? " …" : "") : "（无）"}`);
  if (r.unresolved.length) console.log(`   ⚠ 未解析(${r.unresolved.length}): ${[...new Set(r.unresolved)].join(", ")}`);
}

// 汇总：被依赖的模块级名字计数（看哪些最常作为 B 档随迁）
console.log();
console.log("=== 模块级依赖关系汇总（谁依赖谁）===");
const depCount = new Map();
for (const f of moduleFuncs.filter((x) => x.name !== "App")) {
  const fp = findFnPath(f.name);
  if (!fp) continue;
  const r = analyzeFn(fp);
  for (const d of r.deps) {
    if (d === f.name) continue;
    if (!depCount.has(d)) depCount.set(d, new Set());
    depCount.get(d).add(f.name);
  }
}
for (const [d, set] of [...depCount.entries()].sort((a, b) => b[1].size - a[1].size)) {
  console.log(`  ${d}  <- 被 ${set.size} 个函数依赖: ${[...set].join(", ")}`);
}

// ---- App 自身的模块级依赖（哪些模块常量被 App 与待搬函数"共享" → 必须下沉 shared 才能环=0）----
console.log();
console.log("=== App 组件引用的模块级名字（共享常量判定）===");
const appFp = moduleFnPaths.find((p) => (p.node.id && p.node.id.name === "App"));
const appDeps = new Set();
const appConstDeps = new Set();
if (appFp) {
  const programScope = appFp.scope.getProgramParent();
  appFp.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      const binding = p.scope.getBinding(name);
      if (!binding) return;
      if (binding.scope === programScope && !importNames.has(name)) appDeps.add(name);
    },
  });
}
// 区分：被 App 引用的模块级"常量"（非函数）与"函数"
for (const n of appDeps) {
  const isFn = moduleFuncs.some((f) => f.name === n);
  if (!isFn) appConstDeps.add(n);
}
console.log("App 引用的模块级常量(" + appConstDeps.size + "):");
console.log("  " + [...appConstDeps].sort().join(", "));
console.log("App 引用的模块级函数(" + (appDeps.size - appConstDeps.size) + "):");
console.log("  " + [...appDeps].filter((n) => moduleFuncs.some((f) => f.name === n)).sort().join(", "));

// ---- 共享常量交叉：待搬函数的模块常量依赖 且 被 App 引用 → 下沉 shared ----
console.log();
console.log("=== 共享常量（待搬函数依赖 ∩ App 引用）⇒ 必须下沉 shared 否则环=0 ===");
const sharedConsts = new Set();
for (const f of moduleFuncs.filter((x) => x.name !== "App")) {
  const fp = findFnPath(f.name);
  if (!fp) continue;
  const r = analyzeFn(fp);
  for (const d of r.deps) {
    if (appConstDeps.has(d)) sharedConsts.add(`${f.name} → ${d}`);
  }
}
if (sharedConsts.size === 0) console.log("  （无）");
else [...sharedConsts].sort().forEach((s) => console.log("  " + s));

// ---- import 用途分类（A 测算：孤儿 import 删 / 回填 import 加）----
console.log();
console.log("=== import 用途分类（仅被待搬函数用 ⇒ main 中变孤儿）===");
const excludedNames = new Set([
  "createCanvasNode", "createInfiniteCanvas", "normalizeCanvasNode",
  "normalizeInfiniteCanvasState", "loadInfiniteCanvasState",
  "loadPromptCategories", "loadPromptPresets",
]);

// 收集每个模块函数的引用 import（去重）
function usedImportsOf(fnPath) {
  const set = new Set();
  const programScope = fnPath.scope.getProgramParent();
  fnPath.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      const binding = p.scope.getBinding(name);
      if (binding && binding.scope === programScope && importNames.has(name)) set.add(name);
    },
  });
  return set;
}

const impUsedByMoved = new Set();
const impUsedByStaying = new Set();
for (const f of moduleFuncs.filter((x) => x.name !== "App")) {
  const fp = findFnPath(f.name);
  if (!fp) continue;
  const used = usedImportsOf(fp);
  if (excludedNames.has(f.name)) used.forEach((i) => impUsedByStaying.add(i));
  else used.forEach((i) => impUsedByMoved.add(i));
}
// App 的 import 使用
if (appFp) {
  usedImportsOf(appFp).forEach((i) => impUsedByStaying.add(i));
}
const orphanImports = [...impUsedByMoved].filter(() => !impUsedByStaying).sort();
const keptImports = [...impUsedByMoved].filter(() => impUsedByStaying).sort();
console.log(`待搬函数用到的 import 总数: ${impUsedByMoved.size}`);
console.log(`  其中"仅被待搬用"（main 中变孤儿，可删）: ${orphanImports.length}`);
console.log("    " + orphanImports.join(", "));
console.log(`  其中"App/留存也用"（留 main，但 landing 文件需复制）: ${keptImports.length}`);
console.log("    " + keptImports.join(", "));

// 行数汇总（measure-top 口径，花括号配平）
const movedLines = moduleFuncs
  .filter((f) => f.name !== "App" && !excludedNames.has(f.name))
  .reduce((s, f) => s + (f.end - f.start + 1), 0);
const excludedLines = moduleFuncs
  .filter((f) => excludedNames.has(f.name))
  .reduce((s, f) => s + (f.end - f.start + 1), 0);
console.log();
console.log("=== 行数口径（measure-top 花括号配平）===");
console.log(`59 候选总行数: 1134（ticket 口径）| 实测 60 顶层含 App=6080`);
console.log(`已排除（7 个）: ${excludedLines} 行  ${[...excludedNames].join(", ")}`);
console.log(`待搬（52 个）函数行数: ${movedLines} 行`);
console.log(`孤儿 import 可删: ${orphanImports.length} 行`);
console.log(`回填 forward import ≈ 落点文件数（本设计约 10~12 个文件各 1 行）`);
