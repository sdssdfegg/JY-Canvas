// RF-081 随迁常量行数 + 孤儿 import 测算（只读，落 scripts/dev/）
import { readFileSync } from "node:fs";
import parser from "@babel/parser";
import _traverse from "@babel/traverse";

const traverse = _traverse.default || _traverse;
const src = readFileSync("src/outfit-workflow.jsx","utf8");
const lines = src.split(/\r?\n/);

const ast = parser.parse(src, {
  sourceType:"module",
  plugins:["jsx","optionalChaining","nullishCoalescingOperator","classProperties","objectRestSpread","dynamicImport","topLevelAwait","asyncGenerators","exportDefaultFrom","exportNamespaceFrom","logicalAssignment"],
  errorRecovery:true,
});

const data = JSON.parse(readFileSync("scripts/dev/rf081-result.json","utf8"));
const funcNames = new Set(data.trueTop.map(t=>t.name));

// 收集所有模块级声明（含函数与常量）的 span
const declSpans = {}; // name -> {start,end,kind}
let importSpecifiers = []; // {name, line}
let compRange = {start:-1,end:-1};

traverse(ast, {
  Program(p){
    // 顶层 import
    for(const n of p.node.body){
      if(n.type==="ImportDeclaration"){
        for(const s of n.specifiers){
          if(s.local) importSpecifiers.push({name:s.local.name, line:n.loc.start.line});
        }
      }
    }
  },
  FunctionDeclaration(p){
    if(p.parentPath.isProgram() || (p.parentPath.parentPath && p.parentPath.parentPath.isProgram())){
      // 仅组件外
    }
  },
  VariableDeclaration(p){
    const pp = p.parentPath;
    const top = pp.isProgram() || ((pp.isExportNamedDeclaration()||pp.isExportDefaultDeclaration()) && pp.parentPath.isProgram());
    if(!top) return;
    for(const d of p.node.declarations){
      if(d.id && d.id.type==="Identifier" && d.init){
        const s = p.node.loc.start.line, e = p.node.loc.end.line;
        declSpans[d.id.name] = {start:s, end:e, kind:(d.init.type==="ArrowFunctionExpression"||d.init.type==="FunctionExpression")?"fn":"const"};
      }
    }
  },
});

// 组件区间
traverse(ast, { FunctionDeclaration(p){ if(p.node.id&&p.node.id.name==="OutfitWorkflow"){compRange={start:p.node.loc.start.line,end:p.node.loc.end.line};}}});

// 常量 span 求和（needMigrate 中非常量的）
const needMigrate = data.needMigrate.filter(n=>!funcNames.has(n));
let constLines = 0; const constList=[];
for(const n of needMigrate){
  const sp = declSpans[n];
  if(sp && sp.kind==="const"){
    const len = sp.end - sp.start + 1;
    constLines += len; constList.push({name:n, lines:len, kind:sp.kind, span:`${sp.start}-${sp.end}`});
  } else if(!sp){
    constList.push({name:n, lines:0, kind:"MISSING", span:"?"});
  }
}
console.log(`== 随迁模块级常量（needMigrate 中非常量函数）==`);
console.log(`  常量个数: ${constList.filter(c=>c.kind==="const").length} | 合计行数: ${constLines}`);
console.log(`  MISSING(可能是 import 或已在函数内): ${constList.filter(c=>c.kind==="MISSING").map(c=>c.name).join(", ")||"无"}`);

// 孤儿 import 分析：import 名字在「组件区间」是否被使用
function usedInRange(name, s, e){
  // 简单做法：在该行区间文本里搜单词边界
  const re = new RegExp("(^|[^A-Za-z0-9_$])"+name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"($|[^A-Za-z0-9_$])");
  for(let i=s-1;i<e && i<lines.length;i++){ if(re.test(lines[i])) return true; }
  return false;
}
// 移动的函数引用了哪些 import？从 rf081-result.json 收集所有 imports
const movedImports = new Set();
for(const t of data.trueTop){ for(const im of t.imports) movedImports.add(im); }
// 哪些 import 仅被移动函数用、组件区间不用 → 孤儿（可从 outfit 删）
const orphan = []; const kept = [];
for(const im of importSpecifiers){
  if(!movedImports.has(im.name)) { kept.push(im.name); continue; }
  if(usedInRange(im.name, compRange.start, compRange.end)) kept.push(im.name);
  else orphan.push(im.name);
}
console.log(`\n== 孤儿 import 预判 ==`);
console.log(`  被移动函数引用的 import 总数: ${[...movedImports].length}`);
console.log(`  孤儿(组件区间未用, 可删): ${orphan.length} -> ${orphan.join(", ")}`);
console.log(`  仍需留(组件也用): ${kept.length} -> ${kept.join(", ")}`);

// 输出合并行数估算
const funcLines = data.summary.totalSize;
console.log(`\n== 收益估算基础 ==`);
console.log(`  搬出函数行数: ${funcLines}`);
console.log(`  随迁常量行数: ${constLines}`);
console.log(`  毛搬出(函数+常量): ${funcLines+constLines}`);
console.log(`  孤儿 import 删除行数(≈): ${orphan.length}`);
console.log(`  回填 import 行数(≈): 1 (outfit-top.js 一行) + 既有 panels 已存在`);
console.log(`  A ≈ ${(funcLines+constLines) - orphan.length - 1} (未含可搬项排除调整)`);
