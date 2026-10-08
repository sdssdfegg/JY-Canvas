// RF-076 阶段 A 构建脚本（稳健版：用函数签名 + 括号配平定位，不依赖设计文档行号）
import fs from "fs";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const MAIN = `${ROOT}/src/main.jsx`;
const OUTFIT = `${ROOT}/src/outfit-workflow.jsx`;
const SHARED = `${ROOT}/src/shared/local-edit-mask.js`;

function readLines(path) {
  const raw = fs.readFileSync(path, "utf8");
  return raw.split("\n").map((line) => {
    const cr = line.endsWith("\r");
    return { t: line.replace(/\r$/, ""), cr };
  });
}
function writeLines(path, lines) {
  let text = lines.map((it) => it.t + (it.cr ? "\r" : "")).join("\n");
  if (!text.endsWith("\n")) text += "\n";
  fs.writeFileSync(path, text);
}
function textOf(lines) { return lines.map((l) => l.t).join("\n"); }

const main = readLines(MAIN);
const outfit = readLines(OUTFIT);

// 定位函数签名（含括号配平取完整函数体）
function findSig(lines, re) {
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i].t)) return i;
  return -1;
}
function extractBalanced(lines, start) {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i].t) { if (ch === "{") depth++; else if (ch === "}") depth--; }
    if (depth <= 0 && i > start) return i;
  }
  return -1;
}

const sigs = [
  "function measureImage()",
  "function maskPointerPoint(event)",
  "function maskPointerDisplayPoint(event)",
  "function updateBrushCursor(event, visible = true)",
  "function sourceBrushSize()",
  "function paintMask(event, fresh = false)",
  "function refreshMaskState()",
  "function beginMaskPaint(event)",
  "function moveMaskPaint(event)",
  "function endMaskPaint(event)",
  "function leaveMaskPaint()",
  "function clearMask()",
  "function changeBrushByKeyboard(event)",
];

function extractIn(file, sigRe) {
  const s = findSig(file, sigRe);
  if (s < 0) throw new Error("未找到签名: " + sigRe);
  const e = extractBalanced(file, s);
  if (e < 0) throw new Error("括号配平失败: " + sigRe);
  return { start: s, end: e, lines: file.slice(s, e + 1) };
}

const mainEx = sigs.map((s) => extractIn(main, new RegExp(s.replace(/[()]/g, "\\$&"))));
const outfitEx = sigs.map((s) => extractIn(outfit, new RegExp(s.replace(/[()]/g, "\\$&"))));

// 逐字相同校验
for (let i = 0; i < sigs.length; i++) {
  const a = textOf(mainEx[i].lines), b = textOf(outfitEx[i].lines);
  if (a !== b) { console.error(`❌ 字节不一致: ${sigs[i]}\nMAIN:\n${a}\nOUTFIT:\n${b}`); process.exit(2); }
}

// effect#5 体（syncCropRectFromMask）—— 用 deps 数组定位
function extractEffect5(file) {
  const depsRe = /activeRatio, imageSize\.height, imageSize\.width, isMaskMode, maskRevision/;
  const depsIdx = findSig(file, depsRe);
  if (depsIdx < 0) throw new Error("effect#5 deps 未找到");
  let openIdx = depsIdx;
  for (let i = depsIdx - 1; i >= 0; i--) { if (file[i].t === "  useEffect(() => {") { openIdx = i; break; } }
  return { openIdx, bodyStart: openIdx + 1, bodyEnd: depsIdx - 1, lines: file.slice(openIdx + 1, depsIdx) };
}
const mainE5 = extractEffect5(main);
const outfitE5 = extractEffect5(outfit);
if (textOf(mainE5.lines) !== textOf(outfitE5.lines)) {
  console.error("❌ effect#5 体不一致\nMAIN:\n" + textOf(mainE5.lines) + "\nOUTFIT:\n" + textOf(outfitE5.lines));
  process.exit(2);
}
console.log("✅ 13 个函数 + effect#5 体与 outfit 逐字相同");

// 工厂函数体（main 为权威源）
const factoryBodies = mainEx.map((ex) => textOf(ex.lines));
factoryBodies.push("function syncCropRectFromMask() {\n" + textOf(mainE5.lines) + "\n}");

// ---- 工厂源（追加进 local-edit-mask.js）----
const factoryHeader = `// RF-076 · 局部编辑交互层 B3 工厂（阶段 A：12 个无分叉纯函数 + effect#3/#5 体）
// 函数体从 src/main.jsx / src/outfit-workflow.jsx 逐字抽取，仅顶部加 deps 解构。
// 后续阶段 B/C 在此文件内追加参数化函数（同域第二批，不新增 fileCount）。

export function createLocalEditInteraction(deps) {
  const {
    imageRef, setDisplaySize, maskCanvasRef, displaySize, imageSize, brushSize, maskTool,
    paintRef, isMaskMode, working, brushResizeRef, setBrushCursor, setMaskPainted, setCropRect,
    setMaskRevision, activeRatio, setBrushSize
  } = deps;
`;
const factoryReturn = `
  return {
    measureImage,
    maskPointerPoint,
    maskPointerDisplayPoint,
    updateBrushCursor,
    sourceBrushSize,
    paintMask,
    refreshMaskState,
    beginMaskPaint,
    moveMaskPaint,
    endMaskPaint,
    leaveMaskPaint,
    clearMask,
    changeBrushByKeyboard,
    syncCropRectFromMask
  };
}`;
const factorySource = factoryHeader + "\n" + factoryBodies.join("\n\n") + "\n" + factoryReturn + "\n";
fs.writeFileSync(`${ROOT}/tmp/rf076-factory-A.txt`, factorySource);

// 追加到 shared 文件（保留 CRLF）
{
  const shared = readLines(SHARED);
  const appended = [];
  if (shared[shared.length - 1].t.trim() !== "") appended.push({ t: "", cr: true });
  for (const l of factorySource.split("\n")) {
    if (l === "") continue;
    appended.push({ t: l, cr: true });
  }
  writeLines(SHARED, shared.concat(appended));
}
console.log("✅ 工厂已追加到 src/shared/local-edit-mask.js");

// ---- 薄壳 ----
const shellLines = [
  { t: "  const localEditInteractionDeps = { imageRef, setDisplaySize, maskCanvasRef, displaySize, imageSize, brushSize, maskTool, paintRef, isMaskMode, working, brushResizeRef, setBrushCursor, setMaskPainted, setCropRect, setMaskRevision, activeRatio, setBrushSize };", cr: true },
  { t: "  const { measureImage, updateBrushCursor, beginMaskPaint, moveMaskPaint, endMaskPaint, leaveMaskPaint, clearMask, changeBrushByKeyboard, syncCropRectFromMask } = createLocalEditInteraction(localEditInteractionDeps);", cr: true },
];
const e5Call = [{ t: "    syncCropRectFromMask();", cr: true }];

// 删除集合（0-based）：13 个函数体 + effect#5 体
function buildDrop(...exList) {
  const drop = new Set();
  for (const ex of exList) for (let i = ex.start; i <= ex.end; i++) drop.add(i);
  return drop;
}
const mainDrop = buildDrop(...mainEx, { start: mainE5.bodyStart, end: mainE5.bodyEnd });
const outfitDrop = buildDrop(...outfitEx, { start: outfitE5.bodyStart, end: outfitE5.bodyEnd });
const mainInserts = [
  { anchor: mainEx[0].start, lines: shellLines },
  { anchor: mainE5.bodyStart, lines: e5Call },
];
const outfitInserts = [
  { anchor: outfitEx[0].start, lines: shellLines },
  { anchor: outfitE5.bodyStart, lines: e5Call },
];

function patch(lines, drop, inserts) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    for (const ins of inserts) if (i === ins.anchor) out.push(...ins.lines);
    if (drop.has(i)) continue;
    out.push(lines[i]);
  }
  return out;
}
let mainPatched = patch(main, mainDrop, mainInserts);
let outfitPatched = patch(outfit, outfitDrop, outfitInserts);

// import 加入 createLocalEditInteraction
function addImport(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].t === '} from "./shared/local-edit-mask.js";') {
      const prev = out[out.length - 1];
      prev.t = prev.t.replace(/\s*$/, "") + ",";
      out.push({ t: "  createLocalEditInteraction", cr: true });
    }
    out.push(lines[i]);
  }
  return out;
}
mainPatched = addImport(mainPatched);
outfitPatched = addImport(outfitPatched);

function selfCheck(name, before, after) {
  const crBefore = before.filter((l) => l.cr).length;
  const crAfter = after.filter((l) => l.cr).length;
  const crcr = after.filter((l) => l.t.endsWith("\r")).length;
  console.log(`[${name}] 行数 改前=${before.length} 改后=${after.length} | CRLF 改前=${crBefore} 改后=${crAfter} | CRCR=${crcr}`);
  if (crcr !== 0) { console.error("❌ 出现 CRCR（^M^M）"); process.exit(3); }
}
selfCheck("main.jsx", main, mainPatched);
selfCheck("outfit-workflow.jsx", outfit, outfitPatched);

writeLines(MAIN, mainPatched);
writeLines(OUTFIT, outfitPatched);
console.log("✅ 两巨石已打补丁（CRLF 保留）");
