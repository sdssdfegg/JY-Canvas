// scripts/dev/p6-6-helpercheck.mjs
// P6-6 §4 负向对照静态校验（双向）：src/image-editor.jsx ↔ features/image-editor/image-editor-helpers.js 的接线完整性。
// 绿（全部满足才 exit=0）：
//   A. 子文件导出集 == 执行单锚点 11 个 helper（一个不少、一个不多）
//   B. 父 import 集 == 执行单锚点 7 个（父真正调用的那 7 个）
//   C. 父 import 的每个名字在父文件至少被引用 2 次（import 处 + ≥1 处调用；import 了没用 = 红）
//   D. 父文件 0 个残留 helper 声明（没搬干净会红）
//   E. 子导出集 − 父 import 集 == 4 个内部互调 helper（openEditorDb / drawTransparentGrid /
//      overlayFitScale / drawOverlayToContext），且这 4 个在子文件内确有引用点（导出但没人用 = 红）
//   F. 3 个随迁私有常量只在子文件定义（父文件若还留着 = 死常量/没搬干净 = 红）
//   G. 子文件相对 import 全部可解析；不存在反向 import 父文件（防环）
// 红（负向对照实证）：① 删子文件某 export → A/E 转红；② 删父 import 某名字 → B/C 转红；
//   ③ 把某 helper 声明塞回父文件 → D 转红。均已还原复绿。
// 运行：node scripts/dev/p6-6-helpercheck.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const parentPath = resolve(root, "src/image-editor.jsx");
const childPath = resolve(root, "src/features/image-editor/image-editor-helpers.js");
const CHILD_DIR = resolve(root, "src/features/image-editor");
const CHILD_SPEC = "./features/image-editor/image-editor-helpers.js";

const parent = readFileSync(parentPath, "utf8");
const child = readFileSync(childPath, "utf8");

// 执行单 §1/§2 锚点：11 个随迁 helper
const EXPECTED_EXPORTS = [
  "openEditorDb", "editorGet", "editorSet", "editorDelete", "drawTransparentGrid",
  "workSizeForBitmap", "resetMaskCanvas", "overlayFitScale", "drawOverlayToContext",
  "createCompositionCanvas", "maskSnapshot"
];
// 父组件实际调用的 7 个（另 4 个只在 helpers 内部互调）
const EXPECTED_PARENT_IMPORT = [
  "editorGet", "editorSet", "editorDelete", "workSizeForBitmap", "resetMaskCanvas",
  "createCompositionCanvas", "maskSnapshot"
];
const EXPECTED_INTERNAL = [
  "openEditorDb", "drawTransparentGrid", "overlayFitScale", "drawOverlayToContext"
];
const MOVED_CONSTANTS = ["EDITOR_DB_NAME", "EDITOR_STORE_NAME", "EDITOR_MAX_WORK_SIDE"];

const problems = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const splitNames = (block) => block
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);

// —— A：子文件导出集 ——
const childExports = [...child.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
ok(
  childExports.length === EXPECTED_EXPORTS.length && EXPECTED_EXPORTS.every((n) => childExports.includes(n)),
  `子文件导出集与执行单不一致：got(${childExports.length})=[${childExports.join(",")}] want(${EXPECTED_EXPORTS.length})=[${EXPECTED_EXPORTS.join(",")}]`
);
ok(new Set(childExports).size === childExports.length, `子文件导出集有重复名：${childExports.join(",")}`);

// —— B：父 import 集（从 helpers 说明符那一处 import 块解析）——
const specIdx = parent.indexOf(`from "${CHILD_SPEC}"`);
ok(specIdx > 0, `父文件找不到 helpers import 说明符：${CHILD_SPEC}`);
const impIdx = specIdx > 0 ? parent.lastIndexOf("import {", specIdx) : -1;
ok(impIdx >= 0 && impIdx < specIdx, "父文件 helpers import 块边界解析失败");
const impClose = impIdx >= 0 ? parent.indexOf("}", impIdx) : -1;
ok(impClose > impIdx, "父文件 helpers import 块找不到闭合 }");
const parentImports = impClose > impIdx ? splitNames(parent.slice(impIdx + "import {".length, impClose)) : [];
ok(
  parentImports.length === EXPECTED_PARENT_IMPORT.length && EXPECTED_PARENT_IMPORT.every((n) => parentImports.includes(n)),
  `父 import 集与执行单不一致：got(${parentImports.length})=[${parentImports.join(",")}] want(${EXPECTED_PARENT_IMPORT.length})=[${EXPECTED_PARENT_IMPORT.join(",")}]`
);
// 父 import 集 ⊆ 子导出集
const importNotExported = parentImports.filter((n) => !childExports.includes(n));
ok(importNotExported.length === 0, `父 import 了子文件未导出的名字：${importNotExported.join(",")}`);

// —— C：父 import 的每个名字在父文件至少被引用 2 次（import 处 + ≥1 处调用）——
const parentNoComments = stripComments(parent);
for (const name of EXPECTED_PARENT_IMPORT) {
  const refCount = (parentNoComments.match(new RegExp(`\\b${escaped(name)}\\b`, "g")) || []).length;
  ok(refCount >= 2, `父 import 了 ${name} 但父文件仅出现 ${refCount} 次（import 处之外无引用）`);
}
for (const name of EXPECTED_INTERNAL) {
  const refCount = (parentNoComments.match(new RegExp(`\\b${escaped(name)}\\b`, "g")) || []).length;
  ok(refCount === 0, `${name} 属 helpers 内部互调，父文件却有 ${refCount} 处引用（应改 import 或留在父文件）`);
}

// —— D：父文件 0 个残留 helper 声明 ——
for (const name of EXPECTED_EXPORTS) {
  const residual = new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+${escaped(name)}\\s*\\(|^\\s*const\\s+${escaped(name)}\\s*=`, "m").test(parentNoComments);
  ok(!residual, `父文件仍有残留声明：${name}（未搬干净）`);
}

// —— E：内部互调集双向核对 ——
const internalSet = childExports.filter((n) => !parentImports.includes(n));
ok(
  internalSet.length === EXPECTED_INTERNAL.length && EXPECTED_INTERNAL.every((n) => internalSet.includes(n)),
  `子导出 − 父 import 与执行单不一致：got(${internalSet.length})=[${internalSet.join(",")}] want=[${EXPECTED_INTERNAL.join(",")}]`
);
for (const name of EXPECTED_INTERNAL) {
  const refCount = (child.match(new RegExp(`\\b${escaped(name)}\\b`, "g")) || []).length;
  ok(refCount >= 2, `子文件 ${name} 仅出现 ${refCount} 次（声明处之外无引用，疑似死导出）`);
}

// —— F：随迁常量只在子文件 ——
for (const name of MOVED_CONSTANTS) {
  const m = child.match(new RegExp(`^const ${escaped(name)} =`, "m"));
  ok(Boolean(m), `子文件缺少随迁常量：${name}`);
  const inParent = new RegExp(`^const ${escaped(name)} =`, "m").test(parentNoComments);
  ok(!inParent, `父文件仍残留随迁常量：${name}（未搬干净 / 死常量）`);
}

// —— G：子文件相对 import 可解析 + 不反向 import 父文件 ——
const importRe = /import\s*(?:[\s\S]*?)\s*from\s*"(\.[^"]+)"/g;
let m;
let importCount = 0;
while ((m = importRe.exec(child))) {
  importCount += 1;
  const spec = m[1];
  ok(!spec.includes("image-editor.jsx"), `子文件反向 import 了父文件：${spec}`);
  const base = resolve(CHILD_DIR, spec);
  const found = [base, `${base}.js`, `${base}.jsx`, resolve(base, "index.js")].some((p) => existsSync(p));
  ok(found, `子文件 import 无法解析：${spec}`);
}
ok(importCount > 0, "子文件没有任何 import（异常：clamp 应来自 shared/numeric.js）");

if (problems.length > 0) {
  console.error("❌ P6-6 helpercheck 失败：");
  for (const p of problems) console.error("   -", p);
  console.error(`\n子导出(${childExports.length}): ${childExports.join(", ")}`);
  console.error(`父import(${parentImports.length}): ${parentImports.join(", ")}`);
  console.error(`内部互调(${internalSet.length}): ${internalSet.join(", ")}`);
  process.exit(1);
}
console.log("✅ P6-6 helpercheck 通过");
console.log(`   子导出 ${childExports.length} 个 == 执行单锚点；父 import ${parentImports.length} 个全部有引用点`);
console.log(`   父文件 0 个残留 helper 声明 / 0 个残留随迁常量`);
console.log(`   内部互调 ${internalSet.length} 个：${internalSet.join(", ")}（父未 import，子内均有引用）`);
console.log(`   子文件 ${importCount} 条相对 import 全部可解析，无反向 import image-editor.jsx`);
for (const n of notes) console.log("   ·", n);
