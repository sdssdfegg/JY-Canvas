// scripts/dev/p6-4-handlercheck.mjs
// P6-4 §4 负向对照静态校验：main.jsx ↔ canvas-generation-handlers.js 的 handler 接线完整性。
// 绿（全部满足才 exit=0）：
//   A. 钩导出集 == 执行单锚点表 9 个 handler（一个不少、一个不多）
//   B. 9 个 handler 声明都在钩文件里；main.jsx 里 0 个残留声明（没搬干净会红）
//   C. 父解构集 == 父组件实际引用集（解构了没用 = 红；引用了没解构 = 红）
//   D. 钩 ctx 解构集 ⊆ 父 ctx 对象键（父漏传字段 = 运行期 undefined，vite build 验不出，这里兜底）
//   E. 钩文件相对 import 全部可解析；不存在反向 import main.jsx（防环）
// 红（负向对照实证 2026-10-15）：把钩文件里 optimizePrompt 改名 → C/B 转红 exit=1；已还原复绿。
// 运行：node scripts/dev/p6-4-handlercheck.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const parentPath = resolve(root, "src/main.jsx");
const hookPath = resolve(root, "src/features/canvas/canvas-generation-handlers.js");

const parent = readFileSync(parentPath, "utf8");
const hook = readFileSync(hookPath, "utf8");

// 执行单 §1 锚点表：9 个 handler（顺序即钩导出顺序）
const EXPECTED = [
  "canvasFileFromResult",
  "addCanvasFiles",
  "runCanvasImageRequest",
  "generateCanvasNode",
  "saveProcessedImageFile",
  "optimizePrompt",
  "sendResultToImageEditor",
  "addReferenceThumbToUploads",
  "generate"
];

const problems = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

// —— 解析钩导出集：export function 之后最后一个 `return { ... };\n}`（钩内 handler 体里的 return 均非行首闭合，取 lastIndexOf 防劫持）——
const exportIdx = hook.indexOf("export function useCanvasGenerationHandlers");
ok(exportIdx >= 0, "钩文件找不到 export function useCanvasGenerationHandlers");
const hookBody = exportIdx >= 0 ? hook.slice(exportIdx) : "";
const lastRet = hookBody.lastIndexOf("return {");
const retM = lastRet >= 0 ? hookBody.slice(lastRet).match(/return\s*\{([\s\S]*?)\}\s*;\s*\n\}/) : null;
ok(Boolean(retM), "钩文件找不到导出 return 块");
const hookExports = retM
  ? retM[1].split(",").map((s) => s.trim()).filter(Boolean)
  : [];
ok(
  hookExports.length === EXPECTED.length && EXPECTED.every((n, i) => hookExports[i] === n),
  `钩导出集与执行单不一致：got=[${hookExports.join(",")}] want=[${EXPECTED.join(",")}]`
);

// —— 解析钩 ctx 解构集（剥离 // 注释行）——
const ctxM = hookBody.match(/const\s*\{([\s\S]*?)\}\s*=\s*ctx;/);
ok(Boolean(ctxM), "钩文件找不到 ctx 解构");
const ctxNames = ctxM
  ? ctxM[1].split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      .split(",").map((s) => s.trim()).filter(Boolean)
  : [];
ok(ctxNames.length > 0, "钩 ctx 解构集为空");
ok(new Set(ctxNames).size === ctxNames.length, `钩 ctx 解构集有重复名：${ctxNames.join(",")}`);

// —— 解析父解构集：`const { ... } = useCanvasGenerationHandlers(`（从调用点回溯最近的 const {）——
const callIdx = parent.indexOf("= useCanvasGenerationHandlers(");
ok(callIdx > 0, "父组件找不到 useCanvasGenerationHandlers 调用");
const constIdx = callIdx > 0 ? parent.lastIndexOf("const {", callIdx) : -1;
ok(constIdx > 0 && constIdx < callIdx, "父组件调用点前找不到 const { 解构");
const desBlock = constIdx >= 0 && callIdx > constIdx ? parent.slice(constIdx + "const {".length, callIdx) : "";
// 解构块以 `} = useCanvas...` 收尾，取最后一个 `}` 前的内容
const desClose = desBlock.lastIndexOf("}");
const desNames = desClose > 0
  ? desBlock.slice(0, desClose).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      .split(",").map((s) => s.trim()).filter(Boolean)
  : [];
ok(desNames.length > 0, "父解构集为空");
ok(new Set(desNames).size === desNames.length, `父解构集有重复名：${desNames.join(",")}`);

// —— 解析父 ctx 对象键：调用点 `({` 到紧随的 `\n  });`——
const ctxObjStart = callIdx >= 0 ? parent.indexOf("({", callIdx) : -1;
const ctxObjEnd = ctxObjStart >= 0 ? parent.indexOf("\n  });", ctxObjStart) : -1;
ok(ctxObjStart > 0 && ctxObjEnd > ctxObjStart, "父组件找不到 ctx 对象字面量边界");
const ctxKeys = ctxObjEnd > ctxObjStart
  ? parent.slice(ctxObjStart + 2, ctxObjEnd).split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
      .split(",").map((s) => s.trim()).filter(Boolean)
  : [];

// —— A/B：声明落点核验——
for (const name of EXPECTED) {
  const inHook = new RegExp(`(async )?function ${name}\\(`).test(hookBody);
  ok(inHook, `钩文件缺少声明：${name}`);
  const inParent = new RegExp(`^\\s*(async )?function ${name}\\(`, "m").test(parent);
  ok(!inParent, `main.jsx 仍有残留声明：${name}（未搬干净）`);
}

// —— C：父解构集 == 父实际引用集（剥注释后计数）——
// 剥注释策略（2026-10-15 踩坑记录）：不能朴素剥 /* */ —— main.jsx JSX 里 accept="image/*" 的 /* 会让
// 非贪婪匹配一直吃到 2300 行外的 */，把真正的 JSX 引用行整段吞掉（负向对照变假绿）。这里只剥
// ① 行首 // 注释行；② 单行 {/* ... */} JSX 注释。多行块注释在本文件不含任何 handler 名，不影响计数。
const parentNoComments = parent
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const name of EXPECTED) {
  const refCount = (parentNoComments.match(new RegExp(`\\b${escaped(name)}\\b`, "g")) || []).length;
  const destructured = desNames.includes(name);
  if (destructured) {
    ok(refCount >= 2, `父解构了 ${name} 但整体仅出现 ${refCount} 次（解构处之外无引用）`);
  } else {
    ok(refCount === 0, `${name} 未被父解构，但父组件仍有 ${refCount} 处引用（漏接线）`);
  }
  notes.push(`${name}: 父引用=${refCount} 父解构=${destructured ? "是" : "否"}`);
}

// —— D：钩 ctx ⊆ 父 ctx 键（父漏传 = 运行期 undefined）——
const missingInParent = ctxNames.filter((n) => !ctxKeys.includes(n));
ok(missingInParent.length === 0, `父 ctx 对象漏传字段（钩内解构了但父没传）：${missingInParent.join(",")}`);
const extraInParent = ctxKeys.filter((n) => !ctxNames.includes(n));
if (extraInParent.length > 0) notes.push(`提示：父 ctx 多传了钩未解构的字段（无害）：${extraInParent.join(",")}`);

// —— E：钩文件相对 import 可解析 + 不反向 import 父文件——
const importRe = /import\s*(?:[\s\S]*?)\s*from\s*"(\.[^"]+)"/g;
let m;
let importCount = 0;
while ((m = importRe.exec(hook))) {
  importCount += 1;
  const spec = m[1];
  ok(!spec.includes("main.jsx"), `钩文件反向 import 了父文件：${spec}`);
  const base = resolve(root, "src/features/canvas", spec);
  const found = [base, `${base}.js`, `${base}.jsx`, resolve(base, "index.js")].some(
    (p) => existsSync(p)
  );
  ok(found, `钩文件 import 无法解析：${spec}`);
}
ok(importCount > 0, "钩文件没有任何 import（异常）");

if (problems.length > 0) {
  console.error("❌ P6-4 handlercheck 失败：");
  for (const p of problems) console.error("   -", p);
  console.error(`\n钩导出(${hookExports.length}): ${hookExports.join(", ")}`);
  console.error(`父解构(${desNames.length}): ${desNames.join(", ")}`);
  console.error(`钩ctx(${ctxNames.length}): ${ctxNames.join(", ")}`);
  console.error(`父ctx(${ctxKeys.length}): ${ctxKeys.join(", ")}`);
  process.exit(1);
}
console.log("✅ P6-4 handlercheck 通过");
console.log(`   钩导出(${hookExports.length}) == 执行单 9 项；父解构(${desNames.length}) == 父实际引用集`);
console.log(`   钩 ctx ${ctxNames.length} 项全部由父 ctx 对象传入（${ctxKeys.length} 键）`);
console.log(`   钩文件 ${importCount} 条相对 import 全部可解析，无反向 import main.jsx`);
for (const n of notes) console.log("   ·", n);
