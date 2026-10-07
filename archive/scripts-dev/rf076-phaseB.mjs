// RF-076 阶段 B 打补丁脚本（同域第二批，追加进既有 src/shared/local-edit-mask.js）。
// 纪律：① 不新建 src/ 文件；② 不改门禁判据；③ 不整文件 Edit（CRLF→LF 致 diff 膨胀）；
//       ④ split("\n") 保留原始行尾 {t,cr}；⑤ 锚点用 startsWith/精确文本，不依赖硬编码行号。
//
// 变更范围：
//   F) 工厂文件：补 import(fitRectToRatioLocked/snapSizeToRatio/sharedConstrainCropRect) +
//      第二份 deps 解构(12 个新依赖) + 4 个参数化函数 + 扩展 return 对象。
//   M) main.jsx：扩展薄壳 deps + 解构；删 4 内联函数；清 snapSizeToRatio 孤儿 import；
//      chooseLocalRatio 调用点改名 chooseRatio。
//   O) outfit-workflow.jsx：扩展薄壳 deps + 解构；删 4 内联函数；清 snapSizeToRatio 孤儿 import。
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const FACTORY = `${ROOT}/src/shared/local-edit-mask.js`;
const MAIN = `${ROOT}/src/main.jsx`;
const OUTFIT = `${ROOT}/src/outfit-workflow.jsx`;

function load(p) {
  const raw = readFileSync(p, "utf8");
  const lines = raw.split("\n");
  const items = lines.map((t) => (t.endsWith("\r") ? { t: t.slice(0, -1), cr: true } : { t, cr: false }));
  return items;
}
function dump(items, p) {
  const s = items.map((it) => it.t + (it.cr ? "\r" : "")).join("\n");
  writeFileSync(p, s.endsWith("\n") ? s : s + "\n");
}
function crOf(items) {
  // 以含 \r 行是否占多数判定该文件是否 CRLF。
  const withCr = items.filter((it) => it.cr).length;
  return withCr > items.length / 2;
}
function insertAfter(items, idx, textLines, cr) {
  const toIns = textLines.map((t) => ({ t, cr }));
  items.splice(idx + 1, 0, ...toIns);
}
function findIndex(items, pred) {
  for (let i = 0; i < items.length; i++) if (pred(items[i], i)) return i;
  return -1;
}
function findFnStart(items, name) {
  return findIndex(items, (it) => it.t.startsWith(`  function ${name}(`));
}
function removeFunction(items, name) {
  const start = findFnStart(items, name);
  if (start < 0) throw new Error(`[removeFunction] 找不到定义: ${name}`);
  let depth = 0, started = false, end = -1;
  for (let i = start; i < items.length; i++) {
    const txt = items[i].t;
    for (let j = 0; j < txt.length; j++) {
      const ch = txt[j];
      if (ch === "{") { depth++; started = true; }
      else if (ch === "}") {
        depth--;
        if (started && depth === 0) { end = i; break; }
      }
    }
    if (end >= 0) break;
  }
  if (end < 0) throw new Error(`[removeFunction] 找不到闭合 }: ${name}`);
  items.splice(start, end - start + 1);
  // 删掉紧随的一个空行，避免留下双空行。
  if (items[start] && items[start].t.trim() === "") items.splice(start, 1);
}

// ============ 工厂 ============
{
  const items = load(FACTORY);
  const cr = crOf(items);

  // F1: 补 import
  const impIdx = findIndex(items, (it) => it.t === 'import { clamp } from "./numeric.js";');
  if (impIdx < 0) throw new Error("F1: 找不到 clamp import 锚点");
  // ⚠ 真实导出名是 constrainCropRect；两巨石均以 `constrainCropRect as sharedConstrainCropRect` 引入。
  //    工厂沿用别名可让函数体与两侧逐字一致，故此处必须带 as（ESLint 不校验 import 名，只有 rollup 会拦）。
  insertAfter(items, impIdx, ['import { fitRectToRatioLocked, snapSizeToRatio, constrainCropRect as sharedConstrainCropRect } from "./local-edit-geometry.js";'], cr);

  // F2: 第二份 deps 解构（插在第一份 `} = deps;` 之后）
  const closeDepsIdx = findIndex(items, (it) => it.t.trim() === "} = deps;");
  if (closeDepsIdx < 0) throw new Error("F2: 找不到 deps 解构闭合锚点");
  insertAfter(items, closeDepsIdx, [
    "  const {",
    "    setImageSize, savedEdit, onRatioChange, enabled, ratios, editMode, setEditMode, cropRect,",
    "    fitRectToRatio, lockRatioForLoad, lockRatioForUpdate, defaultCropRect",
    "  } = deps;",
  ], cr);

  // F3: 4 个参数化函数（插在工厂内最后一个函数 syncCropRectFromMask 的闭合 } 之后）
  //     ⚠ 不能用 it.t.trim() === "return {" 作锚点 —— 会命中 maskBoundsFromCanvas 内的 return { x: minX ... }
  const syncFnIdx = findIndex(items, (it) => it.t === "function syncCropRectFromMask() {");
  if (syncFnIdx < 0) throw new Error("F3: 找不到 syncCropRectFromMask 定义锚点");
  let retIdx = -1;
  for (let i = syncFnIdx; i < items.length; i += 1) {
    if (items[i].t === "}") { retIdx = i; break; }
  }
  if (retIdx < 0) throw new Error("F3: 找不到 syncCropRectFromMask 闭合 }");
  const funcs = [
    "  function chooseRatio(nextRatio) {",
    "    if (!enabled || !ratios.includes(nextRatio)) return;",
    "    onRatioChange?.(nextRatio);",
    "    if (isMaskMode) {",
    "      const bounds = maskBoundsFromCanvas(maskCanvasRef.current);",
    "      if (bounds) {",
    "        setCropRect(expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, nextRatio));",
    "      }",
    "      return;",
    "    }",
    "    setCropRect((current) => fitRectToRatio(current, nextRatio));",
    "  }",
    "  function chooseEditMode(nextMode) {",
    "    if (!enabled || nextMode === editMode) return;",
    "    setEditMode(nextMode);",
    "    if (nextMode === LOCAL_EDIT_MASK_MODE) {",
    "      const bounds = maskBoundsFromCanvas(maskCanvasRef.current);",
    "      setMaskPainted(Boolean(bounds));",
    "      if (bounds) {",
    "        setCropRect(expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio));",
    "      }",
    "    } else if (cropRect) {",
    "      setCropRect((current) => fitRectToRatio(current, activeRatio));",
    "    }",
    "  }",
    "  function updateCropRect(nextRect) {",
    "    setCropRect((current) => {",
    "      const source = nextRect || current;",
    "      if (!source || !imageSize.width || !imageSize.height) return current;",
    "      if (lockRatioForUpdate) {",
    "        const size = snapSizeToRatio(source.width, source.height, activeRatio, imageSize.width, imageSize.height);",
    "        return sharedConstrainCropRect({ ...source, ...size }, imageSize.width, imageSize.height);",
    "      }",
    "      return sharedConstrainCropRect(source, imageSize.width, imageSize.height);",
    "    });",
    "  }",
    "  function onImageLoad(event) {",
    "    const width = event.currentTarget.naturalWidth || 1;",
    "    const height = event.currentTarget.naturalHeight || 1;",
    "    setImageSize({ width, height });",
    "    const initial = savedEdit?.cropRect",
    "      ? (lockRatioForLoad",
    "        ? fitRectToRatioLocked(savedEdit.cropRect, activeRatio, width, height)",
    "        : sharedConstrainCropRect(savedEdit.cropRect, width, height))",
    "      : (lockRatioForLoad",
    "        ? fitRectToRatioLocked(null, activeRatio, width, height)",
    "        : defaultCropRect(width, height, activeRatio));",
    "    setCropRect(initial);",
    "    window.requestAnimationFrame(measureImage);",
    "  }",
  ];
  insertAfter(items, retIdx, funcs, cr);

  // F4: 扩展 return 对象（在 syncCropRectFromMask 返回项后追加 4 个键）
  const syncIdx = findIndex(items, (it, i) => it.t.trim() === "syncCropRectFromMask" && items[i + 1] && items[i + 1].t.trim() === "};");
  if (syncIdx < 0) throw new Error("F4: 找不到 return 对象中的 syncCropRectFromMask 锚点");
  items[syncIdx] = { t: "    syncCropRectFromMask,", cr: items[syncIdx].cr };
  insertAfter(items, syncIdx, [
    "    chooseRatio,",
    "    chooseEditMode,",
    "    updateCropRect,",
    "    onImageLoad",
  ], cr);

  dump(items, FACTORY);
  console.log("[F] 工厂已打补丁");
}

// ============ main.jsx ============
{
  const items = load(MAIN);
  const cr = crOf(items);

  // M1: 清 snapSizeToRatio 孤儿 import
  // 找 import 块内的 `  snapSizeToRatio` 且下一行以 `} from` 起头
  const sIdx = findIndex(items, (it, i) => it.t.trim() === "snapSizeToRatio" && items[i + 1] && /^\}\s+from/.test(items[i + 1].t));
  if (sIdx < 0) throw new Error("M1: 找不到 snapSizeToRatio import 锚点");
  items.splice(sIdx, 1);

  // M2: 扩展薄壳 deps 对象
  const mDepsIdx = findIndex(items, (it) => it.t.startsWith("  const localEditInteractionDeps = {") && it.t.includes("setBrushSize };"));
  if (mDepsIdx < 0) throw new Error("M2: 找不到 main 薄壳 deps 对象锚点");
  items.splice(mDepsIdx, 1,
    { t: "  const localEditInteractionDeps = {", cr },
    { t: "    imageRef, setDisplaySize, maskCanvasRef, displaySize, imageSize, brushSize, maskTool, paintRef, isMaskMode, working, brushResizeRef, setBrushCursor, setMaskPainted, setCropRect, setMaskRevision, activeRatio, setBrushSize,", cr },
    { t: "    setImageSize, savedEdit, onRatioChange, enabled: isLocalMode, ratios: QUICK_LOCAL_EDIT_RATIOS, editMode, setEditMode, cropRect, fitRectToRatio, lockRatioForLoad: ratioLocked, lockRatioForUpdate: ratioLocked, defaultCropRect: defaultQuickLocalEditCrop", cr },
    { t: "  };", cr },
  );

  // M3: 扩展解构列表
  const mDestIdx = findIndex(items, (it) => it.t.includes("const { measureImage, updateBrushCursor, beginMaskPaint, moveMaskPaint, endMaskPaint, leaveMaskPaint, clearMask, changeBrushByKeyboard, syncCropRectFromMask } = createLocalEditInteraction(localEditInteractionDeps);"));
  if (mDestIdx < 0) throw new Error("M3: 找不到 main 解构锚点");
  items[mDestIdx] = { t: "  const { measureImage, updateBrushCursor, beginMaskPaint, moveMaskPaint, endMaskPaint, leaveMaskPaint, clearMask, changeBrushByKeyboard, syncCropRectFromMask, chooseRatio, chooseEditMode, updateCropRect, onImageLoad } = createLocalEditInteraction(localEditInteractionDeps);", cr: items[mDestIdx].cr };

  // M4: 调用点改名 chooseLocalRatio -> chooseRatio
  const callIdx = findIndex(items, (it) => it.t.includes("chooseLocalRatio(itemRatio)"));
  if (callIdx < 0) throw new Error("M4: 找不到 chooseLocalRatio 调用点");
  items[callIdx] = { t: it_replace(items[callIdx].t, "chooseLocalRatio(itemRatio)", "chooseRatio(itemRatio)"), cr: items[callIdx].cr };

  // M5: 删 4 内联函数
  for (const name of ["onImageLoad", "chooseLocalRatio", "chooseEditMode", "updateCropRect"]) {
    removeFunction(items, name);
  }

  dump(items, MAIN);
  console.log("[M] main.jsx 已打补丁");
}

// ============ outfit-workflow.jsx ============
{
  const items = load(OUTFIT);
  const cr = crOf(items);

  // O1: 清 snapSizeToRatio 孤儿 import
  const sIdx = findIndex(items, (it, i) => it.t.trim() === "snapSizeToRatio" && items[i + 1] && /^\}\s+from/.test(items[i + 1].t));
  if (sIdx < 0) throw new Error("O1: 找不到 outfit snapSizeToRatio import 锚点");
  items.splice(sIdx, 1);

  // O2: 扩展薄壳 deps 对象
  const oDepsIdx = findIndex(items, (it) => it.t.startsWith("  const localEditInteractionDeps = {") && it.t.includes("setBrushSize };"));
  if (oDepsIdx < 0) throw new Error("O2: 找不到 outfit 薄壳 deps 对象锚点");
  items.splice(oDepsIdx, 1,
    { t: "  const localEditInteractionDeps = {", cr },
    { t: "    imageRef, setDisplaySize, maskCanvasRef, displaySize, imageSize, brushSize, maskTool, paintRef, isMaskMode, working, brushResizeRef, setBrushCursor, setMaskPainted, setCropRect, setMaskRevision, activeRatio, setBrushSize,", cr },
    { t: "    setImageSize, savedEdit, onRatioChange, enabled: true, ratios: BATCH_LOCAL_EDIT_RATIOS, editMode, setEditMode, cropRect, fitRectToRatio, lockRatioForLoad: true, lockRatioForUpdate: !isMaskMode, defaultCropRect: defaultLocalEditCrop", cr },
    { t: "  };", cr },
  );

  // O3: 扩展解构列表
  const oDestIdx = findIndex(items, (it) => it.t.includes("const { measureImage, updateBrushCursor, beginMaskPaint, moveMaskPaint, endMaskPaint, leaveMaskPaint, clearMask, changeBrushByKeyboard, syncCropRectFromMask } = createLocalEditInteraction(localEditInteractionDeps);"));
  if (oDestIdx < 0) throw new Error("O3: 找不到 outfit 解构锚点");
  items[oDestIdx] = { t: "  const { measureImage, updateBrushCursor, beginMaskPaint, moveMaskPaint, endMaskPaint, leaveMaskPaint, clearMask, changeBrushByKeyboard, syncCropRectFromMask, chooseRatio, chooseEditMode, updateCropRect, onImageLoad } = createLocalEditInteraction(localEditInteractionDeps);", cr: items[oDestIdx].cr };

  // O5: 删 4 内联函数
  for (const name of ["onImageLoad", "chooseRatio", "chooseEditMode", "updateCropRect"]) {
    removeFunction(items, name);
  }

  dump(items, OUTFIT);
  console.log("[O] outfit-workflow.jsx 已打补丁");
}

function it_replace(t, from, to) {
  const i = t.indexOf(from);
  if (i < 0) return t;
  return t.slice(0, i) + to + t.slice(i + from.length);
}

// ============ 自检 ============
function selfCheck() {
  function countCr(p) {
    const raw = readFileSync(p, "utf8");
    const crlf = (raw.match(/\r\n/g) || []).length;
    const crcrlf = (raw.match(/\r\r\n/g) || []).length;
    return { crlf, crcrlf };
  }
  const f = countCr(FACTORY), m = countCr(MAIN), o = countCr(OUTFIT);
  console.log(`\n自检 CRLF: factory CRLF=${f.crlf} CRCR=${f.crcrlf} | main CRLF=${m.crlf} CRCR=${m.crcrlf} | outfit CRLF=${o.crlf} CRCR=${o.crcrlf}`);
  if (f.crcrlf || m.crcrlf || o.crcrlf) { console.log("  [FAIL] 检测到双 \\r，CRLF 损坏！"); process.exitCode = 1; }

  const facSrc = readFileSync(FACTORY, "utf8");
  for (const n of ["chooseRatio", "chooseEditMode", "updateCropRect", "onImageLoad"]) {
    if (!new RegExp(`function\\s+${n}\\s*\\(`).test(facSrc)) { console.log(`  [FAIL] 工厂缺少 ${n}`); process.exitCode = 1; }
  }
  const mainSrc = readFileSync(MAIN, "utf8");
  const outfitSrc = readFileSync(OUTFIT, "utf8");
  for (const n of ["onImageLoad", "chooseEditMode", "updateCropRect"]) {
    if (new RegExp(`function\\s+${n}\\s*\\(`).test(mainSrc)) { console.log(`  [FAIL] main 仍定义 ${n}`); process.exitCode = 1; }
    if (new RegExp(`function\\s+${n}\\s*\\(`).test(outfitSrc)) { console.log(`  [FAIL] outfit 仍定义 ${n}`); process.exitCode = 1; }
  }
  if (new RegExp(`function\\s+chooseLocalRatio\\s*\\(`).test(mainSrc)) { console.log("  [FAIL] main 仍定义 chooseLocalRatio"); process.exitCode = 1; }
  if (new RegExp(`function\\s+chooseRatio\\s*\\(`).test(outfitSrc)) { console.log("  [FAIL] outfit 仍定义 chooseRatio"); process.exitCode = 1; }
  if (process.exitCode !== 1) console.log("  [ OK ] 锚点/删除自检通过");
}
selfCheck();
