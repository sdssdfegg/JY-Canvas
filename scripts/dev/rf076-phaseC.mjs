// RF-076 阶段 C 打补丁脚本（同域第三批，追加进既有 src/shared/local-edit-mask.js）。
// 纪律：① 不新建 src/ 文件；② 不改门禁判据；③ 不整文件 Edit（CRLF→LF 致 diff 膨胀）；
//       ④ split("\n") 保留原始行尾 {t,cr}；⑤ 锚点用 startsWith/精确文本，不依赖硬编码行号。
//
// 变更范围：
//   F) 工厂：第三份 deps 解构(8 个新依赖) + 参数化 applyLocalEdit + 扩展 return 对象。
//   M) main.jsx：薄壳加第三行 deps(fallbackToItem: true / rectModeTag 三元) + 解构加
//      applyLocalEdit + 删内联定义。
//   O) outfit-workflow.jsx：同上，fallbackToItem 显式传 false（保持"省略"的原语义）、
//      rectModeTag 恒 "local_edit"。
//
// ⚠ 参数化依据（实测 src/shared/local-edit-geometry.js:434）：
//   cropLocalEditFile(imageItem, cropRect, suffix = "local_edit", { fallbackToItem = false } = {})
//   ⇒ outfit 省略第四参 等价于 false，与 main 的 true 是**真分叉**，必须各传原值，严禁统一。
import { readFileSync, writeFileSync } from "node:fs";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const FACTORY = `${ROOT}/src/shared/local-edit-mask.js`;
const MAIN = `${ROOT}/src/main.jsx`;
const OUTFIT = `${ROOT}/src/outfit-workflow.jsx`;

function load(p) {
  const raw = readFileSync(p, "utf8");
  return raw.split("\n").map((t) => (t.endsWith("\r") ? { t: t.slice(0, -1), cr: true } : { t, cr: false }));
}
function dump(items, p) {
  const s = items.map((it) => it.t + (it.cr ? "\r" : "")).join("\n");
  writeFileSync(p, s.endsWith("\n") ? s : s + "\n");
}
function crOf(items) {
  return items.filter((it) => it.cr).length > items.length / 2;
}
function insertAfter(items, idx, textLines, cr) {
  items.splice(idx + 1, 0, ...textLines.map((t) => ({ t, cr })));
}
function findIndex(items, pred) {
  for (let i = 0; i < items.length; i += 1) if (pred(items[i], i)) return i;
  return -1;
}
// 支持 async：`  async function NAME(` 与 `  function NAME(` 都要命中
function findFnStart(items, name) {
  return findIndex(items, (it) => it.t.startsWith(`  function ${name}(`) || it.t.startsWith(`  async function ${name}(`));
}
function removeFunction(items, name) {
  const start = findFnStart(items, name);
  if (start < 0) throw new Error(`[removeFunction] 找不到定义: ${name}`);
  let depth = 0;
  let started = false;
  let end = -1;
  for (let i = start; i < items.length; i += 1) {
    const txt = items[i].t;
    for (let j = 0; j < txt.length; j += 1) {
      const ch = txt[j];
      if (ch === "{") { depth += 1; started = true; } else if (ch === "}") {
        depth -= 1;
        if (started && depth === 0) { end = i; break; }
      }
    }
    if (end >= 0) break;
  }
  if (end < 0) throw new Error(`[removeFunction] 找不到闭合 }: ${name}`);
  items.splice(start, end - start + 1);
  if (items[start] && items[start].t.trim() === "") items.splice(start, 1);
}

// ============ 工厂 ============
{
  const items = load(FACTORY);
  const cr = crOf(items);

  // F1: 第三份 deps 解构（插在第二份解构的 `} = deps;` 之后）
  //     ⚠ 不能用 findIndex 找第一个 `} = deps;` —— 那是第一份（Phase A 的 17 个依赖）。
  const b2Idx = findIndex(items, (it) => it.t.trim() === "fitRectToRatio, lockRatioForLoad, lockRatioForUpdate, defaultCropRect");
  if (b2Idx < 0) throw new Error("F1: 找不到第二批 deps 特征行");
  if (items[b2Idx + 1].t.trim() !== "} = deps;") throw new Error(`F1: 特征行后不是 } = deps;（实际 "${items[b2Idx + 1].t}"）`);
  insertAfter(items, b2Idx + 1, [
    "  const {",
    "    item, cropLocalEditFile, onApply, canvasToPngDataUrl, maskOpacity, setWorking,",
    "    fallbackToItem, rectModeTag",
    "  } = deps;",
  ], cr);

  // F2: 参数化 applyLocalEdit（插在工厂内最后一个函数 onImageLoad 的闭合 `  }` 之后）
  const onLoadIdx = findIndex(items, (it) => it.t.startsWith("  function onImageLoad("));
  if (onLoadIdx < 0) throw new Error("F2: 找不到 onImageLoad 锚点");
  let closeIdx = -1;
  for (let i = onLoadIdx; i < items.length; i += 1) {
    if (items[i].t === "  }") { closeIdx = i; break; }
  }
  if (closeIdx < 0) throw new Error("F2: 找不到 onImageLoad 闭合 }");
  insertAfter(items, closeIdx, [
    "  async function applyLocalEdit() {",
    "    if (!cropRect || working) return;",
    "    if (isMaskMode && !maskCanvasHasPaint(maskCanvasRef.current)) return;",
    "    setWorking(true);",
    "    try {",
    "      if (isMaskMode) {",
    "        const canvas = maskCanvasRef.current;",
    "        const bounds = maskBoundsFromCanvas(canvas);",
    "        const maskCropRect = expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio) || cropRect;",
    "        const cropped = await cropLocalEditFile(item, maskCropRect, \"mask_edit\", { fallbackToItem });",
    "        onApply(item.id, {",
    "          ...cropped,",
    "          cropRect: maskCropRect,",
    "          aspectRatio: activeRatio,",
    "          editMode: LOCAL_EDIT_MASK_MODE,",
    "          maskDataUrl: canvasToPngDataUrl(canvas),",
    "          maskBounds: bounds,",
    "          brushSize,",
    "          maskOpacity",
    "        });",
    "      } else {",
    "        // 普通裁剪与局部回贴走**同一套**几何：输出尺寸恒等于选框在原图上的像素尺寸。",
    "        const cropped = await cropLocalEditFile(item, cropRect, rectModeTag, { fallbackToItem });",
    "        onApply(item.id, { ...cropped, aspectRatio: activeRatio, editMode: LOCAL_EDIT_RECT_MODE });",
    "      }",
    "    } finally {",
    "      setWorking(false);",
    "    }",
    "  }",
  ], cr);

  // F3: return 对象加 applyLocalEdit（原末项 onImageLoad 补逗号）
  const retItemIdx = findIndex(items, (it, i) => it.t.trim() === "onImageLoad" && items[i + 1] && items[i + 1].t.trim() === "};");
  if (retItemIdx < 0) throw new Error("F3: 找不到 return 对象中的 onImageLoad 锚点");
  items[retItemIdx] = { t: "    onImageLoad,", cr: items[retItemIdx].cr };
  insertAfter(items, retItemIdx, ["    applyLocalEdit"], cr);

  dump(items, FACTORY);
  console.log("[F] 工厂已打补丁");
}

// ============ 通用：扩展薄壳 deps + 解构 + 删内联 ============
function patchShell(p, label, thirdDepsLine) {
  const items = load(p);
  const cr = crOf(items);

  // 锚点：第二批 deps 行（含 lockRatioForLoad: 的那一行），第三批插在它后面
  const b2 = findIndex(items, (it) => it.t.trim().startsWith("setImageSize, savedEdit, onRatioChange,"));
  if (b2 < 0) throw new Error(`${label}: 找不到第二批 deps 行`);
  // ⚠ 第二批行末尾没有逗号（它是当时最后一行），插第三批前必须补上，否则 Parsing error
  items[b2] = { t: `${items[b2].t},`, cr: items[b2].cr };
  insertAfter(items, b2, [thirdDepsLine], cr);

  const destIdx = findIndex(items, (it) => it.t.includes("syncCropRectFromMask, chooseRatio, chooseEditMode, updateCropRect, onImageLoad } = createLocalEditInteraction("));
  if (destIdx < 0) throw new Error(`${label}: 找不到解构锚点`);
  items[destIdx] = {
    t: items[destIdx].t.replace(
      "syncCropRectFromMask, chooseRatio, chooseEditMode, updateCropRect, onImageLoad }",
      "syncCropRectFromMask, chooseRatio, chooseEditMode, updateCropRect, onImageLoad, applyLocalEdit }",
    ),
    cr: items[destIdx].cr,
  };
  if (!items[destIdx].t.includes("applyLocalEdit }")) throw new Error(`${label}: 解构替换未命中`);

  removeFunction(items, "applyLocalEdit");

  // 清孤儿 import：搬运后 maskCanvasHasPaint 只剩 import 一处（ESLint no-unused-vars 实测点名）。
  // 其余候选（cropLocalEditFile / canvasToPngDataUrl / expandMaskBoundsToCropRect /
  // maskBoundsFromCanvas）在 deps 对象或 effect 里仍有引用，不是孤儿，不得误删。
  const orphanIdx = findIndex(items, (it) => it.t.trim() === "maskCanvasHasPaint,");
  if (orphanIdx < 0) throw new Error(`${label}: 找不到 maskCanvasHasPaint import 行`);
  items.splice(orphanIdx, 1);

  dump(items, p);
  console.log(`[${label}] 已打补丁`);
}

patchShell(MAIN, "M", "    item, cropLocalEditFile, onApply, canvasToPngDataUrl, maskOpacity, setWorking, fallbackToItem: true, rectModeTag: isLocalMode ? \"local_edit\" : \"crop\"");
patchShell(OUTFIT, "O", "    item, cropLocalEditFile, onApply, canvasToPngDataUrl, maskOpacity, setWorking, fallbackToItem: false, rectModeTag: \"local_edit\"");

// ============ 自检 ============
function countCr(p) {
  const raw = readFileSync(p, "utf8");
  return { crlf: (raw.match(/\r\n/g) || []).length, crcrlf: (raw.match(/\r\r\n/g) || []).length };
}
const f = countCr(FACTORY);
const m = countCr(MAIN);
const o = countCr(OUTFIT);
console.log(`\n自检 CRLF: factory CRLF=${f.crlf} CRCR=${f.crcrlf} | main CRLF=${m.crlf} CRCR=${m.crcrlf} | outfit CRLF=${o.crlf} CRCR=${o.crcrlf}`);
let bad = false;
if (f.crcrlf || m.crcrlf || o.crcrlf) { console.log("  [FAIL] 检测到双 \\r，CRLF 损坏！"); bad = true; }

const facSrc = readFileSync(FACTORY, "utf8");
if (!/async function applyLocalEdit\s*\(/.test(facSrc)) { console.log("  [FAIL] 工厂缺少 applyLocalEdit"); bad = true; }
if (!/\bfallbackToItem\b/.test(facSrc) || !/\brectModeTag\b/.test(facSrc)) { console.log("  [FAIL] 工厂缺少参数化入参"); bad = true; }
for (const src of [readFileSync(MAIN, "utf8"), readFileSync(OUTFIT, "utf8")]) {
  if (/function\s+applyLocalEdit\s*\(/.test(src)) { console.log("  [FAIL] 仍存在内联 applyLocalEdit 定义"); bad = true; }
}
if (!bad) console.log("  [ OK ] 锚点/删除自检通过");
process.exitCode = bad ? 1 : 0;
