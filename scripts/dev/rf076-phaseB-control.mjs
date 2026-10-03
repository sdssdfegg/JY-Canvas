// RF-076 阶段 B 行为对照组（落 scripts/dev/ —— tmp/ 被 gitignore，不进 commit）。
//
// 目的：证明「参数化收口」是行为等价的，而不是把两侧统一成了一侧。
// 手法（对照 memory §5）：
//   ① BASE 侧运行时 = 从 `git show HEAD:src/*.jsx` 按行切片抽出的**原始函数文本**，
//      用 new Function 装配（绝不手抄），注入的依赖全部是**真实实现**（几何模块真身 +
//      从 BASE 抽出的 ratioValue / defaultXxxCrop / fitRectToRatio），不是 mock。
//   ② 工厂侧运行时 = 真身 import createLocalEditInteraction，按该侧原值传 deps。
//   ③ 同一组 case 双跑，逐字段近似比对。
//   ④ 必须带反证项：只改 deps 里的参数化入参，输出必须随之改变；
//      若不变则证明参数化被写死（= 统一 = 违规），对照组判 FAIL。
import { spawn } from "node:child_process";
import { createLocalEditInteraction, maskBoundsFromCanvas, expandMaskBoundsToCropRect } from "../../src/shared/local-edit-mask.js";
import { fitRectToRatioLocked, snapSizeToRatio, constrainCropRect } from "../../src/shared/local-edit-geometry.js";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
const REV = "HEAD";

// Node 无 window：工厂与 BASE 的 onImageLoad 都调 window.requestAnimationFrame(measureImage)。
globalThis.window = { requestAnimationFrame: () => {} };

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

// 字符串/模板/注释感知的花括号配对
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

// 抽出 `function NAME(...) { ... }` 完整文本（含签名）
function extractFnText(src, name) {
  const re = new RegExp(`(?:^|\\n)[ \\t]*function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) throw new Error(`[extractFnText] BASE 中找不到函数 ${name}`);
  const start = src.indexOf("function", m.index);
  const open = src.indexOf("{", m.index);
  const close = matchClose(src, open);
  if (close < 0) throw new Error(`[extractFnText] ${name} 括号不配对`);
  return src.slice(start, close + 1);
}

// 抽出 `const NAME = [...];` 的数组字面量并求值
function extractConstArray(src, name) {
  const re = new RegExp(`const\\s+${name}\\s*=\\s*(\\[[\\s\\S]*?\\]);`);
  const m = re.exec(src);
  if (!m) throw new Error(`[extractConstArray] BASE 中找不到常量 ${name}`);
  return new Function(`return ${m[1]};`)();
}

// 用 new Function 装配 BASE 运行时：函数文本原样拼装，自由标识符由参数注入
function buildBaseRuntime(src, { fnNames, exports, freeVars }) {
  const body = `${fnNames.map((n) => extractFnText(src, n)).join("\n")}\nreturn { ${exports.join(", ")} };`;
  const factory = new Function(...freeVars, body);
  return (values) => factory(...freeVars.map((v) => values[v]));
}

// 模拟 React setState 语义：函数式 updater 传入当前值，并记录每次写入
function makeSetCropRect(initial) {
  let current = initial;
  const calls = [];
  const fn = (v) => {
    const next = typeof v === "function" ? v(current) : v;
    current = next;
    calls.push(next);
  };
  return { fn, calls, get current() { return current; } };
}

function approxEq(a, b, eps = 1e-9) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= eps;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => approxEq(a[k], b[k], eps));
}

let failures = 0;
function check(label, ok, detail = "") {
  if (ok) console.log(`  [ OK ] ${label}${detail ? ` — ${detail}` : ""}`);
  else { console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ""}`); failures += 1; }
}

const mainSrc = await gitShow(REV, "src/main.jsx");
const outfitSrc = await gitShow(REV, "src/outfit-workflow.jsx");

const QUICK_LOCAL_EDIT_RATIOS = extractConstArray(mainSrc, "QUICK_LOCAL_EDIT_RATIOS");
const BATCH_LOCAL_EDIT_RATIOS = extractConstArray(outfitSrc, "BATCH_LOCAL_EDIT_RATIOS");

// ==================== main 侧 ====================
console.log("== main 侧：BASE(HEAD) vs 工厂 ==");
{
  const buildMain = buildBaseRuntime(mainSrc, {
    fnNames: ["ratioValue", "defaultQuickLocalEditCrop", "onImageLoad", "fitRectToRatio", "chooseLocalRatio", "chooseEditMode", "updateCropRect"],
    exports: ["onImageLoad", "fitRectToRatio", "chooseLocalRatio", "chooseEditMode", "updateCropRect", "ratioValue", "defaultQuickLocalEditCrop"],
    freeVars: ["setImageSize", "savedEdit", "ratioLocked", "activeRatio", "setCropRect", "isLocalMode",
      "QUICK_LOCAL_EDIT_RATIOS", "onRatioChange", "isMaskMode", "maskCanvasRef", "setEditMode", "editMode",
      "cropRect", "imageSize", "maskBoundsFromCanvas", "expandMaskBoundsToCropRect", "fitRectToRatioLocked",
      "snapSizeToRatio", "constrainCropRect", "LOCAL_EDIT_MASK_MODE", "measureImage", "window"],
  });

  const imageSize = { width: 1000, height: 800 };
  const activeRatio = "2:3";
  const existing = { x: 10, y: 20, width: 400, height: 400 };

  // ---- Case M1: updateCropRect, ratioLocked=true ----
  {
    const b = makeSetCropRect(existing);
    const base = buildMain({
      setImageSize: () => {}, savedEdit: null, ratioLocked: true, activeRatio, setCropRect: b.fn,
      isLocalMode: true, QUICK_LOCAL_EDIT_RATIOS, onRatioChange: () => {}, isMaskMode: false,
      maskCanvasRef: { current: null }, setEditMode: () => {}, editMode: "rect", cropRect: existing,
      imageSize, maskBoundsFromCanvas, expandMaskBoundsToCropRect, fitRectToRatioLocked, snapSizeToRatio,
      constrainCropRect, LOCAL_EDIT_MASK_MODE: "mask", measureImage: () => {}, window: globalThis.window,
    });
    base.updateCropRect(null);
    const baseVal = b.calls.at(-1);

    const f = makeSetCropRect(existing);
    const inst = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, lockRatioForUpdate: true,
    });
    inst.updateCropRect(null);
    const facVal = f.calls.at(-1);
    check("M1 updateCropRect(ratioLocked=true) 等价", approxEq(baseVal, facVal), `BASE=${JSON.stringify(baseVal)} 工厂=${JSON.stringify(facVal)}`);
  }

  // ---- Case M2: updateCropRect, ratioLocked=false ----
  {
    const b = makeSetCropRect(existing);
    const base = buildMain({
      setImageSize: () => {}, savedEdit: null, ratioLocked: false, activeRatio, setCropRect: b.fn,
      isLocalMode: true, QUICK_LOCAL_EDIT_RATIOS, onRatioChange: () => {}, isMaskMode: false,
      maskCanvasRef: { current: null }, setEditMode: () => {}, editMode: "rect", cropRect: existing,
      imageSize, maskBoundsFromCanvas, expandMaskBoundsToCropRect, fitRectToRatioLocked, snapSizeToRatio,
      constrainCropRect, LOCAL_EDIT_MASK_MODE: "mask", measureImage: () => {}, window: globalThis.window,
    });
    base.updateCropRect(null);
    const baseVal = b.calls.at(-1);

    const f = makeSetCropRect(existing);
    const inst = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, lockRatioForUpdate: false,
    });
    inst.updateCropRect(null);
    const facVal = f.calls.at(-1);
    check("M2 updateCropRect(ratioLocked=false) 等价", approxEq(baseVal, facVal), `BASE=${JSON.stringify(baseVal)} 工厂=${JSON.stringify(facVal)}`);

    // 反证：同一工厂、同一输入，只改 lockRatioForUpdate，输出必须不同
    //       （若相同 ⇒ 该入参被写死/未接线 ⇒ 参数化形同虚设，等于偷偷统一成某一侧）
    const t = makeSetCropRect(existing);
    createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: t.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, lockRatioForUpdate: true,
    }).updateCropRect(null);
    const u = makeSetCropRect(existing);
    createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: u.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, lockRatioForUpdate: false,
    }).updateCropRect(null);
    check(
      "M2-反证 lockRatioForUpdate 影响输出（true≠false）",
      !approxEq(t.calls.at(-1), u.calls.at(-1)),
      `true=${JSON.stringify(t.calls.at(-1))} false=${JSON.stringify(u.calls.at(-1))}`,
    );
  }

  // ---- Case M3: chooseLocalRatio / chooseRatio ----
  {
    const b = makeSetCropRect(existing);
    const base = buildMain({
      setImageSize: () => {}, savedEdit: null, ratioLocked: true, activeRatio, setCropRect: b.fn,
      isLocalMode: true, QUICK_LOCAL_EDIT_RATIOS, onRatioChange: () => {}, isMaskMode: false,
      maskCanvasRef: { current: null }, setEditMode: () => {}, editMode: "rect", cropRect: existing,
      imageSize, maskBoundsFromCanvas, expandMaskBoundsToCropRect, fitRectToRatioLocked, snapSizeToRatio,
      constrainCropRect, LOCAL_EDIT_MASK_MODE: "mask", measureImage: () => {}, window: globalThis.window,
    });
    base.chooseLocalRatio("2:3");
    const baseVal = b.calls.at(-1);

    const f = makeSetCropRect(existing);
    const inst = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, enabled: true, ratios: QUICK_LOCAL_EDIT_RATIOS,
    });
    inst.chooseRatio("2:3");
    const facVal = f.calls.at(-1);
    check("M3 chooseRatio(enabled=true) 等价", approxEq(baseVal, facVal), `BASE=${JSON.stringify(baseVal)} 工厂=${JSON.stringify(facVal)}`);

    // 反证 1：enabled=false 时两侧都不写（证明 enabled 参数生效且没被写死 true）
    const b2 = makeSetCropRect(existing);
    const base2 = buildMain({
      setImageSize: () => {}, savedEdit: null, ratioLocked: true, activeRatio, setCropRect: b2.fn,
      isLocalMode: false, QUICK_LOCAL_EDIT_RATIOS, onRatioChange: () => {}, isMaskMode: false,
      maskCanvasRef: { current: null }, setEditMode: () => {}, editMode: "rect", cropRect: existing,
      imageSize, maskBoundsFromCanvas, expandMaskBoundsToCropRect, fitRectToRatioLocked, snapSizeToRatio,
      constrainCropRect, LOCAL_EDIT_MASK_MODE: "mask", measureImage: () => {}, window: globalThis.window,
    });
    base2.chooseLocalRatio("2:3");
    const f2 = makeSetCropRect(existing);
    const inst2 = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f2.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, enabled: false, ratios: QUICK_LOCAL_EDIT_RATIOS,
    });
    inst2.chooseRatio("2:3");
    check("M3-反证 enabled=false 两侧均不写", b2.calls.length === 0 && f2.calls.length === 0, `BASE calls=${b2.calls.length} 工厂 calls=${f2.calls.length}`);

    // 反证 2：ratios 不含该比例时不写（证明 ratios 参数生效）
    const f3 = makeSetCropRect(existing);
    const inst3 = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f3.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, enabled: true, ratios: ["1:1"],
    });
    inst3.chooseRatio("2:3");
    check("M3-反证 ratios 不含时工厂不写", f3.calls.length === 0, `calls=${f3.calls.length}`);
  }

  // ---- Case M4: onImageLoad ----
  for (const locked of [true, false]) {
    const evt = { currentTarget: { naturalWidth: 1000, naturalHeight: 800 } };
    const b = makeSetCropRect(null);
    let bSize = null;
    const base = buildMain({
      setImageSize: (v) => { bSize = v; }, savedEdit: null, ratioLocked: locked, activeRatio, setCropRect: b.fn,
      isLocalMode: true, QUICK_LOCAL_EDIT_RATIOS, onRatioChange: () => {}, isMaskMode: false,
      maskCanvasRef: { current: null }, setEditMode: () => {}, editMode: "rect", cropRect: null,
      imageSize, maskBoundsFromCanvas, expandMaskBoundsToCropRect, fitRectToRatioLocked, snapSizeToRatio,
      constrainCropRect, LOCAL_EDIT_MASK_MODE: "mask", measureImage: () => {}, window: globalThis.window,
    });
    base.onImageLoad(evt);
    const baseVal = b.calls.at(-1);

    const f = makeSetCropRect(null);
    let fSize = null;
    const inst = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, setImageSize: (v) => { fSize = v; }, savedEdit: null,
      lockRatioForLoad: locked,
      // 真身：BASE 里抽出的 defaultQuickLocalEditCrop / ratioValue（不是 mock）
      defaultCropRect: base.defaultQuickLocalEditCrop,
      measureImage: () => {},
    });
    inst.onImageLoad(evt);
    const facVal = f.calls.at(-1);
    check(`M4 onImageLoad(lockRatioForLoad=${locked}) 等价`, approxEq(baseVal, facVal), `BASE=${JSON.stringify(baseVal)} 工厂=${JSON.stringify(facVal)}`);
    check(`M4 onImageLoad(lockRatioForLoad=${locked}) setImageSize 等价`, approxEq(bSize, fSize));
  }
}

// ==================== outfit 侧 ====================
console.log("== outfit 侧：BASE(HEAD) vs 工厂 ==");
{
  const buildOutfit = buildBaseRuntime(outfitSrc, {
    fnNames: ["defaultLocalEditCrop", "onImageLoad", "fitRectToRatio", "chooseRatio", "chooseEditMode", "updateCropRect"],
    exports: ["onImageLoad", "fitRectToRatio", "chooseRatio", "chooseEditMode", "updateCropRect", "defaultLocalEditCrop"],
    freeVars: ["setImageSize", "savedEdit", "activeRatio", "setCropRect", "BATCH_LOCAL_EDIT_RATIOS",
      "onRatioChange", "isMaskMode", "maskCanvasRef", "setEditMode", "editMode", "cropRect", "imageSize",
      "maskBoundsFromCanvas", "expandMaskBoundsToCropRect", "fitRectToRatioLocked", "snapSizeToRatio",
      "constrainLocalEditRect", "LOCAL_EDIT_MASK_MODE", "measureImage", "window"],
  });

  const imageSize = { width: 1000, height: 800 };
  const activeRatio = "2:3";
  const existing = { x: 10, y: 20, width: 400, height: 400 };
  const common = {
    setImageSize: () => {}, savedEdit: null, activeRatio, BATCH_LOCAL_EDIT_RATIOS, onRatioChange: () => {},
    maskCanvasRef: { current: null }, setEditMode: () => {}, editMode: "rect", cropRect: existing,
    imageSize, maskBoundsFromCanvas, expandMaskBoundsToCropRect, fitRectToRatioLocked, snapSizeToRatio,
    constrainLocalEditRect: constrainCropRect, LOCAL_EDIT_MASK_MODE: "mask", measureImage: () => {},
    window: globalThis.window,
  };

  // ---- Case O1: updateCropRect, isMaskMode=false -> 锁比例 ----
  for (const isMaskMode of [false, true]) {
    const b = makeSetCropRect(existing);
    const base = buildOutfit({ ...common, setCropRect: b.fn, isMaskMode });
    base.updateCropRect(null);
    const baseVal = b.calls.at(-1);

    const f = makeSetCropRect(existing);
    const inst = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode,
      fitRectToRatio: base.fitRectToRatio, lockRatioForUpdate: !isMaskMode,
    });
    inst.updateCropRect(null);
    const facVal = f.calls.at(-1);
    check(`O1 updateCropRect(isMaskMode=${isMaskMode}) 等价`, approxEq(baseVal, facVal), `BASE=${JSON.stringify(baseVal)} 工厂=${JSON.stringify(facVal)}`);
  }

  // ---- Case O2: chooseRatio (enabled 恒 true) ----
  {
    const b = makeSetCropRect(existing);
    const base = buildOutfit({ ...common, setCropRect: b.fn, isMaskMode: false });
    base.chooseRatio("2:3");
    const baseVal = b.calls.at(-1);

    const f = makeSetCropRect(existing);
    const inst = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, enabled: true, ratios: BATCH_LOCAL_EDIT_RATIOS,
    });
    inst.chooseRatio("2:3");
    const facVal = f.calls.at(-1);
    check("O2 chooseRatio(enabled=true) 等价", approxEq(baseVal, facVal), `BASE=${JSON.stringify(baseVal)} 工厂=${JSON.stringify(facVal)}`);
  }

  // ---- Case O3: onImageLoad (lockRatioForLoad 恒 true) ----
  {
    const evt = { currentTarget: { naturalWidth: 1000, naturalHeight: 800 } };
    const b = makeSetCropRect(null);
    let bSize = null;
    const base = buildOutfit({ ...common, setCropRect: b.fn, setImageSize: (v) => { bSize = v; }, isMaskMode: false });
    base.onImageLoad(evt);
    const baseVal = b.calls.at(-1);

    const f = makeSetCropRect(null);
    let fSize = null;
    const inst = createLocalEditInteraction({
      imageSize, activeRatio, setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode: false,
      fitRectToRatio: base.fitRectToRatio, setImageSize: (v) => { fSize = v; }, savedEdit: null,
      lockRatioForLoad: true, defaultCropRect: base.defaultLocalEditCrop, measureImage: () => {},
    });
    inst.onImageLoad(evt);
    const facVal = f.calls.at(-1);
    check("O3 onImageLoad(lockRatioForLoad=true) 等价", approxEq(baseVal, facVal), `BASE=${JSON.stringify(baseVal)} 工厂=${JSON.stringify(facVal)}`);
    check("O3 onImageLoad setImageSize 等价", approxEq(bSize, fSize));
  }
}

// ==================== 负向对照（自证对照组不是恒真断言）====================
console.log("== 负向对照：故意改错，对照组必须报 FAIL ==");
{
  const imageSize = { width: 1000, height: 800 };
  const existing = { x: 10, y: 20, width: 400, height: 400 };
  const f = makeSetCropRect(existing);
  const inst = createLocalEditInteraction({
    imageSize, activeRatio: "2:3", setCropRect: f.fn, maskCanvasRef: { current: null }, isMaskMode: false,
    fitRectToRatio: (rect) => rect, lockRatioForUpdate: true,
  });
  inst.updateCropRect({ x: 999, y: 999, width: 50, height: 50 });
  const out = f.calls.at(-1);
  // 输入明显越界，constrain 后不可能原样等于输入 => 若相等说明 constrain 根本没跑（对照组失效）
  check("负向：越界输入必须被 constrain 改写", !approxEq(out, { x: 999, y: 999, width: 50, height: 50 }), `out=${JSON.stringify(out)}`);
}

console.log(`\n阶段 B 对照组结果: ${failures === 0 ? "ALL PASS ✓" : `FAILURES=${failures} ✗`}`);
process.exit(failures === 0 ? 0 : 1);
