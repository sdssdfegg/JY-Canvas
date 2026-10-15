// scripts/dev/p6-5-propcheck.mjs
// P6-5 §4 负向对照静态校验（双向）：main.jsx ↔ main-handlers.js ↔ panels/*.jsx 的接线完整性。
// 绿（全部满足才 exit=0）：
//   A. 钩导出集 == 父解构集（37 个 handler，一个不少、一个不多）
//   B. 37 个 handler 声明都在钩文件里；main.jsx 里 0 个残留声明（没搬干净会红）
//   C. 父解构的每个名字在父组件（JSX/hook deps/effect）至少被引用 1 次（解构了没用 = 红）
//   D. 钩 ctx 解构集 ⊆ 父 ctx 对象键（父漏传字段 = 运行期 undefined，vite build 验不出，这里兜底）
//   E. 钩内 lateRef.current.xxx 引用集 == 父 handlerLateRef.current 回填键集（双向：钩引用漏回填 = 红；回填多余 = 提示）
//   F. 钩文件相对 import 全部可解析；不存在反向 import main.jsx（防环）
//   G.（commit 2 起生效）MainTopBar / MainCanvasBoard：组件 props 解构集 == 父 JSX 传入 props 键集
// 红（负向对照实证）：① 删父 ctx 某字段 → D 转红；② 删钩 return 某导出 → A/C 转红；
//   ③ 删父 late 回填某键 → E 转红；④ 改面板 props 名 → G 转红。均已还原复绿。
// 运行：node scripts/dev/p6-5-propcheck.mjs
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const parentPath = resolve(root, "src/main.jsx");
const hookPath = resolve(root, "src/features/main-app/main-handlers.js");
const topBarPath = resolve(root, "src/features/main-app/panels/main-top-bar.jsx");
const canvasBoardPath = resolve(root, "src/features/main-app/panels/main-canvas-board.jsx");

const parent = readFileSync(parentPath, "utf8");
const hook = readFileSync(hookPath, "utf8");

// 执行单 §1 锚点表：37 个导出 handler（screenToCanvasPoint 仅钩内互调，不导出——同 P6-4 的 canvasFileFromResult 模式）
const EXPECTED = [
  "updateSetting", "canvasCenterPoint", "handleCanvasDrop", "sendResultToCanvas",
  "addEvent", "copyText", "onComposerPaste", "downloadVideoResult", "removeReferenceImage",
  "openQuickCropEdit", "openQuickLocalEdit", "applyQuickCropEdit", "applyQuickLocalEdit",
  "clearQuickCropEdit", "clearQuickLocalEdit", "clearAll", "openSaveDirectory",
  "onQuickBoardWheel", "autoSaveEventText", "openSettingsPanel", "openUploadPreview",
  "beginReferenceSort", "moveReferenceSort", "endReferenceSort", "cancelReferenceSort",
  "closeUploadPreview", "openReferencePreview", "closeReferencePreview", "shiftReferencePreview",
  "openPreview", "shiftPreview", "closePreview", "handlePreviewWheel",
  "openContextMenu", "openReferenceContextMenu", "rerunResult", "markDeferredFeature"
];
// 父 late 回填应有的 10 键（执行单锚点）
const EXPECTED_LATE = [
  "addCanvasFiles", "patchActiveCanvas", "moveReferenceFile", "videoApi",
  "appendReferenceFiles", "referenceApi", "refreshSaveDirectory",
  "previewNavigationItems", "detailApi", "generate"
];

const problems = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const stripComments = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const splitNames = (block) => block
  .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n")
  .split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);

// —— 解析钩导出集：export function 之后最后一个 return 块（P6-4 同款防劫持）——
const exportIdx = hook.indexOf("export function useMainHandlers");
ok(exportIdx >= 0, "钩文件找不到 export function useMainHandlers");
const hookBody = exportIdx >= 0 ? hook.slice(exportIdx) : "";
const lastRet = hookBody.lastIndexOf("return {");
const retM = lastRet >= 0 ? hookBody.slice(lastRet).match(/return\s*\{([\s\S]*?)\}\s*;\s*\n\}/) : null;
ok(Boolean(retM), "钩文件找不到导出 return 块");
const hookExports = retM ? splitNames(retM[1]) : [];
ok(
  hookExports.length === EXPECTED.length && EXPECTED.every((n, i) => hookExports[i] === n),
  `钩导出集与执行单不一致：got(${hookExports.length})=[${hookExports.join(",")}] want(${EXPECTED.length})=[${EXPECTED.join(",")}]`
);

// —— 解析父解构集：`const { ... } = useMainHandlers(` ——
const callIdx = parent.indexOf("= useMainHandlers(");
ok(callIdx > 0, "父组件找不到 useMainHandlers 调用");
const constIdx = callIdx > 0 ? parent.lastIndexOf("const {", callIdx) : -1;
ok(constIdx > 0 && constIdx < callIdx, "父组件调用点前找不到 const { 解构");
const desBlock = constIdx >= 0 && callIdx > constIdx ? parent.slice(constIdx + "const {".length, callIdx) : "";
const desClose = desBlock.lastIndexOf("}");
const desNames = desClose > 0 ? splitNames(desBlock.slice(0, desClose)) : [];
ok(desNames.length > 0, "父解构集为空");
ok(new Set(desNames).size === desNames.length, `父解构集有重复名：${desNames.join(",")}`);
ok(
  desNames.length === hookExports.length && hookExports.every((n) => desNames.includes(n)),
  `父解构集 != 钩导出集：des=[${desNames.join(",")}]`
);

// —— 解析父 ctx 对象键：调用点 `({` 到紧随的 `\n  });` ——
const ctxObjStart = callIdx >= 0 ? parent.indexOf("({", callIdx) : -1;
const ctxObjEnd = ctxObjStart >= 0 ? parent.indexOf("\n  });", ctxObjStart) : -1;
ok(ctxObjStart > 0 && ctxObjEnd > ctxObjStart, "父组件找不到 ctx 对象字面量边界");
const ctxKeys = ctxObjEnd > ctxObjStart ? splitNames(parent.slice(ctxObjStart + 2, ctxObjEnd)) : [];

// —— 解析钩 ctx 解构集 ——
const ctxM = hookBody.match(/const\s*\{([\s\S]*?)\}\s*=\s*ctx;/);
ok(Boolean(ctxM), "钩文件找不到 ctx 解构");
const ctxNames = ctxM ? splitNames(ctxM[1]) : [];
ok(ctxNames.length > 0, "钩 ctx 解构集为空");

// —— 解析父 late 回填键：`handlerLateRef.current = {` 到 `\n  };` ——
const fillStart = parent.indexOf("handlerLateRef.current = {");
ok(fillStart > 0, "父组件找不到 handlerLateRef.current 回填块");
const fillEnd = fillStart > 0 ? parent.indexOf("\n  };", fillStart) : -1;
const fillKeys = fillStart > 0 && fillEnd > fillStart ? splitNames(parent.slice(fillStart + "handlerLateRef.current = {".length, fillEnd)) : [];
ok(
  fillKeys.length === EXPECTED_LATE.length && EXPECTED_LATE.every((n) => fillKeys.includes(n)),
  `父 late 回填键与执行单不一致：got(${fillKeys.length})=[${fillKeys.join(",")}]`
);

// —— 解析钩内 lateRef.current.xxx 引用集 ——
const lateRefs = [...new Set([...hookBody.matchAll(/lateRef\.current\.([A-Za-z_$][\w$]*)/g)].map((x) => x[1]))];

// —— A/B：声明落点核验 ——
for (const name of EXPECTED) {
  const inHook = new RegExp(`(async )?function ${name}\\(|const ${name} = `).test(hookBody);
  ok(inHook, `钩文件缺少声明：${name}`);
  const inParent = new RegExp(`^\\s*(async )?function ${name}\\(|^\\s*const ${name} = `, "m").test(parent);
  ok(!inParent, `main.jsx 仍有残留声明：${name}（未搬干净）`);
}

// —— C：父解构的每个名字在父组件至少被引用 1 次（解构处之外）——
const parentNoComments = stripComments(parent);
const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const name of EXPECTED) {
  const refCount = (parentNoComments.match(new RegExp(`\\b${escaped(name)}\\b`, "g")) || []).length;
  const destructured = desNames.includes(name);
  if (destructured) {
    ok(refCount >= 2, `父解构了 ${name} 但整体仅出现 ${refCount} 次（解构处之外无引用）`);
  } else {
    ok(refCount === 0, `${name} 未被父解构，但父组件仍有 ${refCount} 处引用（漏接线）`);
  }
}

// —— D：钩 ctx ⊆ 父 ctx 键 ——
const missingInParent = ctxNames.filter((n) => !ctxKeys.includes(n));
ok(missingInParent.length === 0, `父 ctx 对象漏传字段（钩内解构了但父没传）：${missingInParent.join(",")}`);
const extraInParent = ctxKeys.filter((n) => !ctxNames.includes(n));
if (extraInParent.length > 0) notes.push(`提示：父 ctx 多传了钩未解构的字段（无害）：${extraInParent.join(",")}`);

// —— E：late 双向核对 ——
const lateMissing = lateRefs.filter((n) => !fillKeys.includes(n));
ok(lateMissing.length === 0, `钩内引用但父未回填（运行期 undefined）：${lateMissing.join(",")}`);
const lateExtra = fillKeys.filter((n) => !lateRefs.includes(n));
if (lateExtra.length > 0) notes.push(`提示：父回填了钩内未引用的键（无害）：${lateExtra.join(",")}`);
notes.push(`late 双向：钩引用 ${lateRefs.length} 项 == 父回填 ${fillKeys.length} 项`);

// —— F：钩文件相对 import 可解析 + 不反向 import 父文件 ——
const importRe = /import\s*(?:[\s\S]*?)\s*from\s*"(\.[^"]+)"/g;
let m;
let importCount = 0;
while ((m = importRe.exec(hook))) {
  importCount += 1;
  const spec = m[1];
  ok(!spec.includes("main.jsx"), `钩文件反向 import 了父文件：${spec}`);
  const base = resolve(root, "src/features/main-app", spec);
  const found = [base, `${base}.js`, `${base}.jsx`, resolve(base, "index.js")].some((p) => existsSync(p));
  ok(found, `钩文件 import 无法解析：${spec}`);
}
ok(importCount > 0, "钩文件没有任何 import（异常）");

// —— G：面板 props 核对（commit 2 起生效；文件不存在时跳过）——
for (const [panelPath, tag] of [[topBarPath, "MainTopBar"], [canvasBoardPath, "MainCanvasBoard"]]) {
  if (!existsSync(panelPath)) { notes.push(`${tag} 面板尚未抽取（commit 2），G 跳过`); continue; }
  const panel = readFileSync(panelPath, "utf8");
  const fnIdx = panel.indexOf(`function ${tag}(`);
  ok(fnIdx >= 0, `${tag} 面板找不到 function ${tag}(`);
  const propsM = fnIdx >= 0 ? panel.slice(fnIdx).match(/\{\s*([\s\S]*?)\s*\}\s*\)/) : null;
  const panelProps = propsM ? splitNames(propsM[1]) : [];
  ok(panelProps.length > 0, `${tag} 面板 props 解构为空`);
  // 父传入：`<MainTopBar` 到 `/>`（自闭合）或 `>`（本单两个面板均为自闭合）
  const jsxIdx = parentNoComments.indexOf(`<${tag}`);
  ok(jsxIdx >= 0, `父组件找不到 <${tag} 使用点`);
  const jsxEnd = jsxIdx >= 0 ? parentNoComments.indexOf("/>", jsxIdx) : -1;
  const jsxBlock = jsxIdx >= 0 && jsxEnd > jsxIdx ? parentNoComments.slice(jsxIdx + tag.length + 1, jsxEnd) : "";
  const passedProps = [...new Set([...jsxBlock.matchAll(/(?:^|\s)([a-zA-Z_$][\w$]*)(?==\{)/g)].map((x) => x[1]))];
  ok(passedProps.length > 0, `父组件 <${tag} 未解析到传入 props`);
  const propsMissing = panelProps.filter((n) => !passedProps.includes(n));
  ok(propsMissing.length === 0, `${tag} 解构了但父未传入：${propsMissing.join(",")}`);
  const propsExtra = passedProps.filter((n) => !panelProps.includes(n));
  ok(propsExtra.length === 0, `${tag} 父传入了但面板未解构：${propsExtra.join(",")}`);
  notes.push(`${tag}：props ${panelProps.length} 项双向一致`);
}

if (problems.length > 0) {
  console.error("❌ P6-5 propcheck 失败：");
  for (const p of problems) console.error("   -", p);
  console.error(`\n钩导出(${hookExports.length}): ${hookExports.join(", ")}`);
  console.error(`父解构(${desNames.length}): ${desNames.join(", ")}`);
  console.error(`钩ctx(${ctxNames.length}): ${ctxNames.join(", ")}`);
  console.error(`父ctx(${ctxKeys.length}): ${ctxKeys.join(", ")}`);
  console.error(`late钩引用: ${lateRefs.join(", ")}`);
  console.error(`late父回填: ${fillKeys.join(", ")}`);
  process.exit(1);
}
console.log("✅ P6-5 propcheck 通过");
console.log(`   钩导出(${hookExports.length}) == 父解构(${desNames.length})；37 个 handler 声明落位核验通过`);
console.log(`   钩 ctx ${ctxNames.length} 项全部由父 ctx 对象传入（${ctxKeys.length} 键）`);
console.log(`   late 双向核对通过（钩引用 == 父回填，${fillKeys.length} 项）`);
console.log(`   钩文件 ${importCount} 条相对 import 全部可解析，无反向 import main.jsx`);
for (const n of notes) console.log("   ·", n);
