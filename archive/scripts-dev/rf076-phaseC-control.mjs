// RF-076 阶段 C 行为对照组（落 scripts/dev/ —— tmp/ 被 gitignore，不进 commit）。
//
// 目的：证明 applyLocalEdit 的参数化收口是**行为等价**的，且 fallbackToItem / rectModeTag
//       两个分叉**没有被统一**（这是本单最高风险点）。
//
// ⚠ 关键语义（实测 src/shared/local-edit-geometry.js:434）：
//   cropLocalEditFile(imageItem, cropRect, suffix = "local_edit", { fallbackToItem = false } = {})
//   ⇒ outfit 原本"省略第四参"，其有效值 = false；main 显式传 true。
//   ⇒ 所以比对的是**有效 fallbackToItem**（normalize 后），而不是 arguments.length
//     （BASE outfit 是 3 参、工厂是 4 参，这是等价的正常表现，不是差异）。
//
// 手法：BASE 侧从 `git show <PhaseB 提交>:src/*.jsx` 抽原始函数文本装配（不手抄）；
//       工厂侧真身 import createLocalEditInteraction；两侧共用同一套探针/桩 ⇒ 差异真实可辨。
//       另用**真身 cropLocalEditFile** 断言 fallbackToItem 的语义分叉确实存在（非 mock 自证）。
import { spawn } from "node:child_process";
import { createLocalEditInteraction, maskBoundsFromCanvas, expandMaskBoundsToCropRect, maskCanvasHasPaint } from "../../src/shared/local-edit-mask.js";
import { cropLocalEditFile } from "../../src/shared/local-edit-geometry.js";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
// BASE 锁死在「RF-076-C 之前」的提交（= RF-076-B）：applyLocalEdit 此时仍在两巨石内联。
const BASE_REV = "ee30034";

function gitShow(rev, path) {
  return new Promise((resolve, reject) => {
    const p = spawn("git", ["show", `${rev}:${path}`], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err || `git show exit ${code}`))));
  });
}

function matchClose(src, openBraceIdx) {
  let depth = 0;
  let inStr = null;
  let templateDepth = 0;
  let comment = 0;
  for (let i = openBraceIdx; i < src.length; i += 1) {
    const c = src[i];
    const c2 = src[i + 1];
    if (comment === 1) { if (c === "\n") comment = 0; continue; }
    if (comment === 2) { if (c === "*" && c2 === "/") { comment = 0; i += 1; } continue; }
    if (inStr) {
      if (c === "\\") { i += 1; continue; }
      if (inStr === "`" && c === "$" && c2 === "{") { templateDepth += 1; i += 1; continue; }
      if (inStr === "`" && templateDepth > 0 && c === "}") { templateDepth -= 1; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && c2 === "/") { comment = 1; i += 1; continue; }
    if (c === "/" && c2 === "*") { comment = 2; i += 1; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}

// 抽出 `function NAME(...) {...}` 完整文本，支持 `async function`
function extractFnText(src, name) {
  const re = new RegExp(`(?:^|\\n)[ \\t]*(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) throw new Error(`[extractFnText] BASE 中找不到函数 ${name}`);
  // ⚠ 起点必须从 `async`（若有）算起：用 indexOf("function") 会丢掉 async 关键字，
  //    导致 async 函数体里的 await 变成语法错误。
  const start = m.index + (m[0][0] === "\n" ? 1 : 0);
  const open = src.indexOf("{", m.index);
  const close = matchClose(src, open);
  if (close < 0) throw new Error(`[extractFnText] ${name} 括号不配对`);
  return src.slice(start, close + 1);
}

// ⚠ applyLocalEdit 是 async function，函数体含 await ⇒ 必须用 AsyncFunction 构造器，
//   用普通 new Function 会抛 "await is only valid in async functions"。
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function buildBaseRuntime(src, { fnNames, exports, freeVars }) {
  const body = `${fnNames.map((n) => extractFnText(src, n)).join("\n")}\nreturn { ${exports.join(", ")} };`;
  const factory = new AsyncFunction(...freeVars, body);
  return async (values) => factory(...freeVars.map((v) => values[v]));
}

// ---- 探针：记录 cropLocalEditFile 的调用契约（两侧共用同一探针 ⇒ 差异真实可辨）----
function makeCropProbe() {
  const calls = [];
  const fn = async (itemArg, rect, suffix, opts) => {
    calls.push({ rect, suffix, opts });
    return {
      file: { name: `out_${suffix}.jpg` }, cropRect: rect, contextRect: null,
      sourceWidth: rect.width, sourceHeight: rect.height, cropQuality: 1, cropBytes: 1,
    };
  };
  return { fn, calls };
}
// 有效 fallbackToItem：省略第四参 ⇒ false（与真身默认值一致）
const effFallback = (call) => (call.opts && typeof call.opts === "object" ? Boolean(call.opts.fallbackToItem) : false);

function makeOnApplyProbe() {
  const calls = [];
  const fn = (id, payload) => { calls.push({ id, payload }); };
  return { fn, calls };
}

// Node 无 DOM：给 mask 链路打最小桩（BASE 与工厂共用 ⇒ 公平）
function makeFakeCanvas(w = 4, h = 4) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255; // alpha 全不透明 ⇒ 有涂抹
  return {
    width: w, height: h,
    getContext: () => ({ getImageData: () => ({ data }) }),
    toDataURL: () => "data:image/png;base64,STUB",
  };
}

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) console.log(`  [ OK ] ${label}${detail ? ` — ${detail}` : ""}`);
  else { console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`); failures += 1; }
}

const mainSrc = await gitShow(BASE_REV, "src/main.jsx");
const outfitSrc = await gitShow(BASE_REV, "src/outfit-workflow.jsx");

const MAIN_FREE = ["cropRect", "working", "isMaskMode", "maskCanvasHasPaint", "maskCanvasRef", "setWorking",
  "maskBoundsFromCanvas", "expandMaskBoundsToCropRect", "imageSize", "activeRatio", "cropLocalEditFile",
  "item", "onApply", "canvasToPngDataUrl", "LOCAL_EDIT_MASK_MODE", "brushSize", "maskOpacity",
  "LOCAL_EDIT_RECT_MODE", "isLocalMode"];
const OUTFIT_FREE = MAIN_FREE.filter((v) => v !== "isLocalMode");

const buildMain = buildBaseRuntime(mainSrc, { fnNames: ["applyLocalEdit"], exports: ["applyLocalEdit"], freeVars: MAIN_FREE });
const buildOutfit = buildBaseRuntime(outfitSrc, { fnNames: ["applyLocalEdit"], exports: ["applyLocalEdit"], freeVars: OUTFIT_FREE });

const imageSize = { width: 1000, height: 800 };
const activeRatio = "2:3";
const cropRect = { x: 10, y: 20, width: 400, height: 600 };
const item = { id: "item-1", name: "a.jpg" };
const brushSize = 34;
const maskOpacity = 60;

// ==================== main 侧：rect 分支（isLocalMode true / false）====================
console.log("== main 侧 applyLocalEdit：BASE vs 工厂 ==");
for (const isLocalMode of [true, false]) {
  const expectedSuffix = isLocalMode ? "local_edit" : "crop";
  // BASE
  const bp = makeCropProbe();
  const ba = makeOnApplyProbe();
  const base = await buildMain({
    cropRect, working: false, isMaskMode: false, maskCanvasHasPaint, maskCanvasRef: { current: null },
    setWorking: () => {}, maskBoundsFromCanvas, expandMaskBoundsToCropRect, imageSize, activeRatio,
    cropLocalEditFile: bp.fn, item, onApply: ba.fn, canvasToPngDataUrl: () => "data:image/png;base64,STUB",
    LOCAL_EDIT_MASK_MODE: "mask", brushSize, maskOpacity, LOCAL_EDIT_RECT_MODE: "rect", isLocalMode,
  });
  await base.applyLocalEdit();

  // 工厂
  const fp = makeCropProbe();
  const fa = makeOnApplyProbe();
  const inst = createLocalEditInteraction({
    cropRect, working: false, isMaskMode: false, maskCanvasRef: { current: null }, imageSize, activeRatio,
    brushSize, cropLocalEditFile: fp.fn, item, onApply: fa.fn,
    canvasToPngDataUrl: () => "data:image/png;base64,STUB", maskOpacity, setWorking: () => {},
    fallbackToItem: true, rectModeTag: isLocalMode ? "local_edit" : "crop",
  });
  await inst.applyLocalEdit();

  const tag = `main rect(isLocalMode=${isLocalMode})`;
  check(`${tag} suffix 等价`, bp.calls[0]?.suffix === fp.calls[0]?.suffix && fp.calls[0]?.suffix === expectedSuffix,
    `BASE=${bp.calls[0]?.suffix} 工厂=${fp.calls[0]?.suffix} 期望=${expectedSuffix}`);
  check(`${tag} fallbackToItem 等价`, effFallback(bp.calls[0]) === effFallback(fp.calls[0]) && effFallback(fp.calls[0]) === true,
    `BASE=${effFallback(bp.calls[0])} 工厂=${effFallback(fp.calls[0])}`);
  check(`${tag} onApply payload 等价`,
    JSON.stringify(ba.calls[0]?.payload) === JSON.stringify(fa.calls[0]?.payload),
    `BASE=${JSON.stringify(ba.calls[0]?.payload)} 工厂=${JSON.stringify(fa.calls[0]?.payload)}`);
}

// ==================== main 侧：mask 分支 ====================
{
  const canvas = makeFakeCanvas();
  const bp = makeCropProbe();
  const ba = makeOnApplyProbe();
  const base = await buildMain({
    cropRect, working: false, isMaskMode: true, maskCanvasHasPaint, maskCanvasRef: { current: canvas },
    setWorking: () => {}, maskBoundsFromCanvas, expandMaskBoundsToCropRect, imageSize, activeRatio,
    cropLocalEditFile: bp.fn, item, onApply: ba.fn, canvasToPngDataUrl: (c) => c.toDataURL(),
    LOCAL_EDIT_MASK_MODE: "mask", brushSize, maskOpacity, LOCAL_EDIT_RECT_MODE: "rect", isLocalMode: true,
  });
  await base.applyLocalEdit();

  const fp = makeCropProbe();
  const fa = makeOnApplyProbe();
  const inst = createLocalEditInteraction({
    cropRect, working: false, isMaskMode: true, maskCanvasRef: { current: canvas }, imageSize, activeRatio,
    brushSize, cropLocalEditFile: fp.fn, item, onApply: fa.fn, canvasToPngDataUrl: (c) => c.toDataURL(),
    maskOpacity, setWorking: () => {}, fallbackToItem: true, rectModeTag: "local_edit",
  });
  await inst.applyLocalEdit();

  check("main mask suffix 等价", bp.calls[0]?.suffix === fp.calls[0]?.suffix && fp.calls[0]?.suffix === "mask_edit",
    `BASE=${bp.calls[0]?.suffix} 工厂=${fp.calls[0]?.suffix}`);
  check("main mask onApply payload 等价",
    JSON.stringify(ba.calls[0]?.payload) === JSON.stringify(fa.calls[0]?.payload),
    `BASE=${JSON.stringify(ba.calls[0]?.payload)} 工厂=${JSON.stringify(fa.calls[0]?.payload)}`);
}

// ==================== outfit 侧：rect / mask（fallbackToItem 原语义 = false）====================
console.log("== outfit 侧 applyLocalEdit：BASE vs 工厂 ==");
for (const isMaskMode of [false, true]) {
  const canvas = makeFakeCanvas();
  const bp = makeCropProbe();
  const ba = makeOnApplyProbe();
  const base = await buildOutfit({
    cropRect, working: false, isMaskMode, maskCanvasHasPaint, maskCanvasRef: { current: canvas },
    setWorking: () => {}, maskBoundsFromCanvas, expandMaskBoundsToCropRect, imageSize, activeRatio,
    cropLocalEditFile: bp.fn, item, onApply: ba.fn, canvasToPngDataUrl: (c) => c.toDataURL(),
    LOCAL_EDIT_MASK_MODE: "mask", brushSize, maskOpacity, LOCAL_EDIT_RECT_MODE: "rect",
  });
  await base.applyLocalEdit();

  const fp = makeCropProbe();
  const fa = makeOnApplyProbe();
  const inst = createLocalEditInteraction({
    cropRect, working: false, isMaskMode, maskCanvasRef: { current: canvas }, imageSize, activeRatio,
    brushSize, cropLocalEditFile: fp.fn, item, onApply: fa.fn, canvasToPngDataUrl: (c) => c.toDataURL(),
    maskOpacity, setWorking: () => {},
    // ⚠ outfit 原语义是"省略第四参"，有效值 = false ⇒ 显式传 false 才是保语义，绝不是省略
    fallbackToItem: false, rectModeTag: "local_edit",
  });
  await inst.applyLocalEdit();

  const tag = `outfit ${isMaskMode ? "mask" : "rect"}`;
  check(`${tag} suffix 等价`, bp.calls[0]?.suffix === fp.calls[0]?.suffix,
    `BASE=${bp.calls[0]?.suffix} 工厂=${fp.calls[0]?.suffix}`);
  // 这是本单命门：BASE 省略(3参⇒false) vs 工厂显式 false(4参) —— 有效值必须都是 false
  check(`${tag} 有效 fallbackToItem 均为 false`,
    effFallback(bp.calls[0]) === false && effFallback(fp.calls[0]) === false,
    `BASE=${effFallback(bp.calls[0])}(${bp.calls[0] ? Object.keys(bp.calls[0]).length : "-"}参) 工厂=${effFallback(fp.calls[0])}`);
  check(`${tag} onApply payload 等价`,
    JSON.stringify(ba.calls[0]?.payload) === JSON.stringify(fa.calls[0]?.payload),
    `BASE=${JSON.stringify(ba.calls[0]?.payload)} 工厂=${JSON.stringify(fa.calls[0]?.payload)}`);
}

// ==================== 反证：两个参数化入参必须真的影响调用契约 ====================
console.log("== 反证：参数化入参确实生效（未被统一/写死）==");
{
  const run = async (deps) => {
    const p = makeCropProbe();
    const a = makeOnApplyProbe();
    const inst = createLocalEditInteraction({
      cropRect, working: false, isMaskMode: false, maskCanvasRef: { current: null }, imageSize, activeRatio,
      brushSize, cropLocalEditFile: p.fn, item, onApply: a.fn, canvasToPngDataUrl: () => "x",
      maskOpacity, setWorking: () => {}, ...deps,
    });
    await inst.applyLocalEdit();
    return p.calls[0];
  };
  const t = await run({ fallbackToItem: true, rectModeTag: "local_edit" });
  const f = await run({ fallbackToItem: false, rectModeTag: "local_edit" });
  check("反证 fallbackToItem 传入值不同 ⇒ 契约不同", effFallback(t) === true && effFallback(f) === false,
    `true=${JSON.stringify(t.opts)} false=${JSON.stringify(f.opts)}`);

  const c1 = await run({ fallbackToItem: true, rectModeTag: "crop" });
  const c2 = await run({ fallbackToItem: true, rectModeTag: "local_edit" });
  check("反证 rectModeTag 传入值不同 ⇒ suffix 不同", c1.suffix === "crop" && c2.suffix === "local_edit",
    `${c1.suffix} vs ${c2.suffix}`);
}

// ==================== 真身断言：fallbackToItem 在 cropLocalEditFile 里确有语义差异 ====================
console.log("== 真身断言：cropLocalEditFile 的 fallbackToItem 语义（非 mock）==");
{
  // 无 originalFile / file 的 item ⇒ resolveLocalEditBaseFile 返回 null
  const bare = { id: "bare", name: "bare.jpg" };
  const msgOf = async (opts) => {
    try {
      await cropLocalEditFile(bare, cropRect, "local_edit", opts);
      return "<no-throw>";
    } catch (e) {
      return String(e?.message || e);
    }
  };
  const mFalse = await msgOf({ fallbackToItem: false });
  const mTrue = await msgOf({ fallbackToItem: true });
  check("真身：fallbackToItem=false 且无原图 ⇒ 报「缺少原图」", mFalse.includes("缺少原图"), `msg=${mFalse}`);
  check("真身：fallbackToItem=true 走 fallback 分支（不再报「缺少原图」）", !mTrue.includes("缺少原图"), `msg=${mTrue}`);
}

// ==================== 负向对照 ====================
console.log("== 负向对照：故意传错，对照组必须能检出 ==");
{
  const p = makeCropProbe();
  const inst = createLocalEditInteraction({
    cropRect, working: false, isMaskMode: false, maskCanvasRef: { current: null }, imageSize, activeRatio,
    brushSize, cropLocalEditFile: p.fn, item, onApply: () => {}, canvasToPngDataUrl: () => "x",
    maskOpacity, setWorking: () => {}, fallbackToItem: true, rectModeTag: "WRONG_TAG",
  });
  await inst.applyLocalEdit();
  check("负向：rectModeTag 传错时 suffix 应为 WRONG_TAG（证明探针确实在测这个量）",
    p.calls[0]?.suffix === "WRONG_TAG", `suffix=${p.calls[0]?.suffix}`);
}

console.log(`\n阶段 C 对照组结果: ${failures === 0 ? "ALL PASS ✓" : `FAILURES=${failures} ✗`}`);
process.exit(failures === 0 ? 0 : 1);
