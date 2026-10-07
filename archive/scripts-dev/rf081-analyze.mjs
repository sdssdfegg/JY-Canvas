// RF-081 只读设计分析脚本（一次性，落 scripts/dev/，不入门禁、不改 src）。
// 目的：区分「真顶层」与「伪顶层」，并对每个真顶层候选做自由标识符抽测。
import { readFileSync, writeFileSync } from "node:fs";
import parser from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default || _traverse;

const FILE = process.argv[2] || "src/outfit-workflow.jsx";
const src = readFileSync(FILE, "utf8");

const ast = parser.parse(src, {
  sourceType: "module",
  plugins: [
    "jsx", "optionalChaining", "nullishCoalescingOperator", "classProperties",
    "objectRestSpread", "dynamicImport", "topLevelAwait", "asyncGenerators",
    "exportDefaultFrom", "exportNamespaceFrom", "logicalAssignment",
  ],
  errorRecovery: true,
});

let programScope = null;
let componentPath = null;
const trueTopPaths = []; // {name, kind, path}

const isTopLevel = (p) => {
  const pp = p.parentPath;
  if (!pp) return false;
  if (pp.isProgram()) return true;
  if ((pp.isExportNamedDeclaration() || pp.isExportDefaultDeclaration()) && pp.parentPath.isProgram()) return true;
  return false;
};

traverse(ast, {
  Program(p) { programScope = p.scope; },
  FunctionDeclaration(p) {
    if (!isTopLevel(p)) return;
    if (p.node.id && p.node.id.name === "OutfitWorkflow") componentPath = p;
    else if (p.node.id) trueTopPaths.push({ name: p.node.id.name, kind: "function", path: p });
  },
  VariableDeclaration(p) {
    if (!isTopLevel(p)) return;
    for (const d of p.node.declarations) {
      if (d.id && d.id.type === "Identifier" && d.init &&
          (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")) {
        trueTopPaths.push({ name: d.id.name, kind: "const", path: p });
      }
    }
  },
});

const compStart = componentPath ? componentPath.node.loc.start.line : -1;
const compEnd = componentPath ? componentPath.node.loc.end.line : -1;
console.log(`== OutfitWorkflow 组件区间（AST）: ${compStart}-${compEnd} ==`);

// 组件内声明名（用于伪顶层判定与组件依赖判定）
const compDeclNames = new Set();
if (componentPath) {
  componentPath.traverse({
    VariableDeclarator(p) { if (p.node.id && p.node.id.type === "Identifier") compDeclNames.add(p.node.id.name); },
    FunctionDeclaration(p) { if (p.node.id) compDeclNames.add(p.node.id.name); },
    ClassDeclaration(p) { if (p.node.id) compDeclNames.add(p.node.id.name); },
  });
}

// 伪顶层：组件内 column-0 的 FunctionDeclaration / 顶层 const 赋值
const pseudoTop = [];
if (componentPath) {
  componentPath.traverse({
    FunctionDeclaration(p) {
      if (p.node.id && p.node.loc.start.column === 0 && p.node.loc.start.line >= compStart && p.node.loc.end.line <= compEnd) {
        // 排除组件自身
        if (p.node.id.name !== "OutfitWorkflow")
          pseudoTop.push({ name: p.node.id.name, start: p.node.loc.start.line, end: p.node.loc.end.line });
      }
    },
    VariableDeclaration(p) {
      for (const d of p.node.declarations) {
        if (d.id && d.id.type === "Identifier" && p.node.loc.start.column === 0 &&
            p.node.loc.start.line >= compStart && p.node.loc.end.line <= compEnd) {
          pseudoTop.push({ name: d.id.name, start: p.node.loc.start.line, end: p.node.loc.end.line, kind: "var" });
        }
      }
    },
  });
}
console.log(`\n== 伪顶层（组件内 column-0 定义，排除）: ${pseudoTop.length} 个 ==`);
for (const p of pseudoTop.sort((a, b) => a.start - b.start))
  console.log(`  ${String(p.start).padStart(5)}-${String(p.end).padStart(5)}  ${p.name}${p.kind ? " (" + p.kind + ")" : ""}`);

console.log(`\n== 真顶层函数（Program 直接子节点，剔除组件）: ${trueTopPaths.length} 个 ==`);

const isWithin = (scope, ancestor) => { let s = scope; while (s) { if (s === ancestor) return true; s = s.parent; } return false; };

const results = [];
for (const fn of trueTopPaths) {
  const fnScopeRef = fn.path.scope;
  const imports = new Set();
  const moduleDefs = new Set();
  const globals = new Set();
  const compDeps = new Set();
  let refCount = 0;
  fn.path.traverse({
    Identifier(p) {
      if (!p.isReferencedIdentifier()) return;
      const name = p.node.name;
      if (name === fn.name) return;
      refCount++;
      const b = p.scope.getBinding(name);
      if (!b) { globals.add(name); return; }
      if (isWithin(b.scope, fnScopeRef)) return; // 局部
      if (b.kind === "module") { imports.add(name); return; }
      if (b.scope.getProgramParent() === programScope) { moduleDefs.add(name); return; }
      if (compDeclNames.has(name)) compDeps.add(name);
      else moduleDefs.add(name);
    },
  });
  const start = fn.path.node.loc.start.line;
  const end = fn.path.node.loc.end.line;
  const size = end - start + 1;
  results.push({ name: fn.name, start, end, size, imports: [...imports], moduleDefs: [...moduleDefs], globals: [...globals], compDeps: [...compDeps], refCount });
}

results.sort((a, b) => a.start - b.start);
console.log(`\n== 真顶层函数明细（按起始行）==`);
for (const r of results) {
  const tier = r.compDeps.length ? "C" : (r.moduleDefs.length ? "B" : "A");
  console.log(`\n  ${String(r.start).padStart(5)}-${String(r.end).padStart(5)}  ${String(r.size).padStart(4)}行  ${r.name}  [${tier}]`);
  if (r.imports.length) console.log(`      import: ${r.imports.join(", ")}`);
  if (r.moduleDefs.length) console.log(`      moduleDefs: ${r.moduleDefs.join(", ")}`);
  if (r.globals.length) console.log(`      globals: ${r.globals.join(", ")}`);
  if (r.compDeps.length) console.log(`      compDeps(组件依赖): ${r.compDeps.join(", ")}`);
}

const A = results.filter(r => !r.compDeps.length && !r.moduleDefs.length);
const B = results.filter(r => !r.compDeps.length && r.moduleDefs.length);
const C = results.filter(r => r.compDeps.length);
console.log(`\n== 分档汇总 ==`);
console.log(`  A 完全纯净: ${A.length} 个`);
console.log(`  B 需随迁依赖: ${B.length} 个`);
console.log(`  C 不可搬(组件依赖/已裁决): ${C.length} 个`);
const totalSize = results.reduce((s, r) => s + r.size, 0);
console.log(`  真顶层函数合计行数: ${totalSize}`);

const needMigrate = new Set();
for (const r of B) for (const m of r.moduleDefs) needMigrate.add(m);
console.log(`\n== 需随迁的模块级名字（被 B 档引用）==`);
console.log(`  ${[...needMigrate].join(", ")}`);

writeFileSync("scripts/dev/rf081-result.json", JSON.stringify({
  compStart, compEnd, pseudoTop, trueTop: results, summary: { A: A.length, B: B.length, C: C.length, totalSize }, needMigrate: [...needMigrate]
}, null, 2));
console.log(`\n[已写出 scripts/dev/rf081-result.json]`);
