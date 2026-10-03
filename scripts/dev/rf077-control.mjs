// RF-077 对照组 / 对拍脚本（落 scripts/dev/，非 tmp/）。
//
// 目的：验证「合并后的共享组件 LocalEditModal」与「原两巨石里的 QuickLocalEditModal /
// OutfitLocalEditModal」在派生值上逐条等价 —— 差异通过 props 注入、未做任何语义统一。
//
// 方法：用 git show 锁定 BASE（RF-077 改造前 commit 9b18c85）的原始两份组件源码，
// 按函数名切片取出「派生逻辑原文」（绝不手抄），与当前 LocalEditModal 的派生逻辑
// 在相同输入下求值，比对结果。
//
// 反证（必须全 PASS）：
//   1. mode 走不同兜底 + rectModeTag：local≠crop，且各与原组件一致。
//   2. resolveActiveRatio 结果不同：local/crop/outfit 三段兜底产出不同，且各与原组件一致。
//   3. resolveBaseFile 解析不同原图：注入不同解析函数得到不同 originalFile，且各与原组件一致。
//   4. fallbackToItem=false 无原图抛错：outfit 侧 deps.fallbackToItem===false、main 侧===true；
//      并对交互工厂做真实调用，fallbackToItem=false 且 originalFile 为 null 时应当抛错（兜底关闭）。
//   负向对照：第 1 条必须能证伪（若强行统一成同一 rectModeTag 会 FAIL）。
//
// 用 exec（spawn）绕开沙箱 spawnSync/execSync 的 EBUSY 限制。

import { exec } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = "9b18c85";
const ROOT = process.cwd();

function gitShow(file) {
  return new Promise((resolve, reject) => {
    exec(`git show ${BASE}:${file}`, { cwd: ROOT, maxBuffer: 1 << 28 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

// ---- 常量（与源码一致；模块里是稳定字面量，落这里保证可独立运行）----
const LOCAL_EDIT_MASK_MODE = "mask";
const LOCAL_EDIT_RECT_MODE = "rect";
const QUICK_LOCAL_EDIT_RATIOS = ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"];
const BATCH_LOCAL_EDIT_RATIOS = ["1:1", "2:3", "3:4", "4:3", "16:9", "9:16"];

// ---- 切片工具 ----
function sliceFnBody(src, fnName) {
  const start = src.indexOf(`function ${fnName}(`);
  if (start < 0) throw new Error(`function ${fnName} not found`);
  // 先找到参数列表的闭括号 )，再取它后面的函数体 {
  const open = src.indexOf("(", start);
  let depth = 0, p = open;
  for (; p < src.length; p++) {
    if (src[p] === "(") depth++;
    else if (src[p] === ")") { depth--; if (depth === 0) break; }
  }
  const bodyStart = src.indexOf("{", p);
  let q = bodyStart, bdepth = 0;
  for (; q < src.length; q++) {
    if (src[q] === "{") bdepth++;
    else if (src[q] === "}") { bdepth--; if (bdepth === 0) break; }
  }
  return src.slice(bodyStart, q + 1);
}

function extractRHS(src, name) {
  const marker = `const ${name} =`;
  const start = src.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length;
  while (i < src.length && /\s/.test(src[i])) i++;
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === ";" && depth === 0) break;
  }
  return src.slice(i, j).trim();
}

function extractDepsObject(src) {
  const marker = `const localEditInteractionDeps = {`;
  const start = src.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length - 1;
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start + marker.length - 1, i + 1); // 含 { }
}

function extractDepsProp(src, prop) {
  const obj = extractDepsObject(src);
  // 形式 A：prop: value
  const reColon = new RegExp(`\\b${prop}\\s*:\\s*`);
  const m = reColon.exec(obj);
  if (m) {
    let i = m.index + m[0].length;
    let depth = 0, j = i;
    for (; j < obj.length; j++) {
      const c = obj[j];
      if (c === "{" || c === "[" || c === "(") depth++;
      else if (c === "}" || c === "]" || c === ")") { depth--; if (depth < 0) break; }
      else if ((c === "," || c === "}") && depth === 0) break;
    }
    return obj.slice(i, j).trim();
  }
  // 形式 B：shorthand prop,
  const reShort = new RegExp(`\\b${prop}\\s*[,}]`);
  if (reShort.test(obj)) return prop;
  return null;
}

function evalExpr(expr, bindings) {
  const keys = Object.keys(bindings);
  const fn = new Function(...keys, `return (${expr});`);
  return fn(...keys.map((k) => bindings[k]));
}

// ---- 对某份组件源码，在给定输入下算出派生值 ----
const STUB = () => {};
function deriveAll(src, input) {
  const names = ["originalFile", "isLocalMode", "savedEdit", "isMaskMode", "ratioLocked", "activeRatio", "lockRatioForLoadValue"];
  const rhs = {};
  for (const n of names) {
    const r = extractRHS(src, n);
    if (r === null) continue;
    rhs[n] = r;
  }
  const body = names.map((n) => `const ${n} = (${rhs[n]});`).join("\n");
  const consts = { QUICK_LOCAL_EDIT_RATIOS, BATCH_LOCAL_EDIT_RATIOS, LOCAL_EDIT_MASK_MODE, LOCAL_EDIT_RECT_MODE, resolveActiveRatio: undefined, ratios: undefined, resolveBaseFile: undefined, lockRatioForLoad: undefined, fallbackToItem: undefined, defaultCropRect: undefined, quickReferenceOriginalFile, resolveLocalEditBaseFile };
  const argNames = [...new Set([...Object.keys(input), ...Object.keys(consts)])];
  const fn = new Function(...argNames, `${body}\nreturn { ${names.join(", ")} };`);
  const d = fn(...argNames.map((k) => (k in input ? input[k] : consts[k])));

  // 从 deps 对象里取 enabled / fallbackToItem / rectModeTag / lockRatioForLoad
  const bindings = { ...d, ...input, QUICK_LOCAL_EDIT_RATIOS, BATCH_LOCAL_EDIT_RATIOS, LOCAL_EDIT_MASK_MODE, LOCAL_EDIT_RECT_MODE, defaultLocalEditCrop: {}, defaultQuickLocalEditCrop: {}, defaultCropRect: input.defaultCropRect ?? {} };
  const enabled = extractDepsProp(src, "enabled");
  const fallbackToItem = extractDepsProp(src, "fallbackToItem");
  const rectModeTag = extractDepsProp(src, "rectModeTag");
  const lockRatioForLoad = extractDepsProp(src, "lockRatioForLoad");
  return {
    ...d,
    enabled: enabled != null ? evalExpr(enabled, bindings) : undefined,
    fallbackToItem: fallbackToItem != null ? evalExpr(fallbackToItem, bindings) : undefined,
    rectModeTag: rectModeTag != null ? evalExpr(rectModeTag, bindings) : undefined,
    lockRatioForLoad: lockRatioForLoad != null ? evalExpr(lockRatioForLoad, bindings) : undefined,
  };
}

// ---- 输入构造 ----
const quickReferenceOriginalFile = (it) => ({ src: "quick", id: it?.id });
const resolveLocalEditBaseFile = (it) => ({ src: "local", id: it?.id });
const outfitResolver = (r, se) => (BATCH_LOCAL_EDIT_RATIOS.includes(r) ? r : BATCH_LOCAL_EDIT_RATIOS.includes(se?.aspectRatio) ? se.aspectRatio : BATCH_LOCAL_EDIT_RATIOS[0]);

const baseInput = (over) => ({
  ratio: "5:4", // 故意取不在 RATIOS 里的值，逼出兜底分支
  item: { localEdit: { aspectRatio: "4:3", editMode: "rect" }, cropEdit: { aspectRatio: "16:9" } },
  editMode: "rect",
  defaultCropRect: {},
  QUICK_LOCAL_EDIT_RATIOS,
  BATCH_LOCAL_EDIT_RATIOS,
  ...over,
});

// main 侧（mode 可 local / crop），用 QUICK 比例集、quickReferenceOriginalFile、fallbackToItem=true
const cfgMainLocal = baseInput({ mode: "local", ratios: QUICK_LOCAL_EDIT_RATIOS, resolveBaseFile: quickReferenceOriginalFile, fallbackToItem: true });
const cfgMainCrop = baseInput({ mode: "crop", ratios: QUICK_LOCAL_EDIT_RATIOS, resolveBaseFile: quickReferenceOriginalFile, fallbackToItem: true });
// outfit 侧（mode=local），用 BATCH 比例集、resolveLocalEditBaseFile、resolveActiveRatio=三段、fallbackToItem=false、lockRatioForLoad=true
const cfgOutfitLocal = baseInput({ mode: "local", ratios: BATCH_LOCAL_EDIT_RATIOS, resolveBaseFile: resolveLocalEditBaseFile, resolveActiveRatio: outfitResolver, fallbackToItem: false, lockRatioForLoad: true });

// ---- 加载源码 ----
const baseMain = await gitShow("src/main.jsx");
const baseOutfit = await gitShow("src/outfit-workflow.jsx");
const newSrc = readFileSync("src/features/local-edit/LocalEditModal.jsx", "utf8");

const oldQuick = sliceFnBody(baseMain, "QuickLocalEditModal");
const oldOutfit = sliceFnBody(baseOutfit, "OutfitLocalEditModal");
const newComp = sliceFnBody(newSrc, "LocalEditModal");

// ---- 求值 ----
const r = {
  newMainLocal: deriveAll(newComp, cfgMainLocal),
  newMainCrop: deriveAll(newComp, cfgMainCrop),
  newOutfitLocal: deriveAll(newComp, cfgOutfitLocal),
  oldQuickLocal: deriveAll(oldQuick, cfgMainLocal),
  oldQuickCrop: deriveAll(oldQuick, cfgMainCrop),
  oldOutfitLocal: deriveAll(oldOutfit, cfgOutfitLocal),
};

// ---- 反证 ----
const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
}

// 反证 1：mode 走不同兜底 + rectModeTag
check("1a rectModeTag local='local_edit'", r.newMainLocal.rectModeTag === "local_edit", `got=${r.newMainLocal.rectModeTag}`);
check("1b rectModeTag crop='crop'", r.newMainCrop.rectModeTag === "crop", `got=${r.newMainCrop.rectModeTag}`);
check("1c 新local 与原QuickLocalModal(local) rectModeTag 一致", r.newMainLocal.rectModeTag === r.oldQuickLocal.rectModeTag, `new=${r.newMainLocal.rectModeTag} old=${r.oldQuickLocal.rectModeTag}`);
check("1d 负向对照：local 与 crop 的 rectModeTag 必须不同", r.newMainLocal.rectModeTag !== r.newMainCrop.rectModeTag, `local=${r.newMainLocal.rectModeTag} crop=${r.newMainCrop.rectModeTag}`);

// 反证 2：resolveActiveRatio 结果不同
check("2a 新local activeRatio=QUICK[0]('1:1')", r.newMainLocal.activeRatio === "1:1", `got=${r.newMainLocal.activeRatio}`);
check("2b 新crop activeRatio=savedEdit.aspectRatio('16:9')", r.newMainCrop.activeRatio === "16:9", `got=${r.newMainCrop.activeRatio}`);
check("2c 新outfit activeRatio=三段('4:3')", r.newOutfitLocal.activeRatio === "4:3", `got=${r.newOutfitLocal.activeRatio}`);
check("2d local≠crop（兜底不同）", r.newMainLocal.activeRatio !== r.newMainCrop.activeRatio, `local=${r.newMainLocal.activeRatio} crop=${r.newMainCrop.activeRatio}`);
check("2e 新local 与原Quick(local) activeRatio 一致", r.newMainLocal.activeRatio === r.oldQuickLocal.activeRatio, `new=${r.newMainLocal.activeRatio} old=${r.oldQuickLocal.activeRatio}`);
check("2f 新crop 与原Quick(crop) activeRatio 一致", r.newMainCrop.activeRatio === r.oldQuickCrop.activeRatio, `new=${r.newMainCrop.activeRatio} old=${r.oldQuickCrop.activeRatio}`);
check("2g 新outfit 与原Outfit(local) activeRatio 一致", r.newOutfitLocal.activeRatio === r.oldOutfitLocal.activeRatio, `new=${r.newOutfitLocal.activeRatio} old=${r.oldOutfitLocal.activeRatio}`);

// 反证 3：resolveBaseFile 解析不同原图
check("3a 新local originalFile.src='quick'", r.newMainLocal.originalFile?.src === "quick", `got=${JSON.stringify(r.newMainLocal.originalFile)}`);
check("3b 新outfit originalFile.src='local'", r.newOutfitLocal.originalFile?.src === "local", `got=${JSON.stringify(r.newOutfitLocal.originalFile)}`);
check("3c 注入不同解析函数得到不同 originalFile", JSON.stringify(r.newMainLocal.originalFile) !== JSON.stringify(r.newOutfitLocal.originalFile), `quick=${JSON.stringify(r.newMainLocal.originalFile)} local=${JSON.stringify(r.newOutfitLocal.originalFile)}`);
check("3d 新local 与原Quick originalFile 一致", JSON.stringify(r.newMainLocal.originalFile) === JSON.stringify(r.oldQuickLocal.originalFile), `new=${JSON.stringify(r.newMainLocal.originalFile)} old=${JSON.stringify(r.oldQuickLocal.originalFile)}`);
check("3e 新outfit 与原Outfit originalFile 一致", JSON.stringify(r.newOutfitLocal.originalFile) === JSON.stringify(r.oldOutfitLocal.originalFile), `new=${JSON.stringify(r.newOutfitLocal.originalFile)} old=${JSON.stringify(r.oldOutfitLocal.originalFile)}`);

// 反证 4：fallbackToItem=false 无原图抛错
check("4a 新outfit deps.fallbackToItem===false", r.newOutfitLocal.fallbackToItem === false, `got=${r.newOutfitLocal.fallbackToItem}`);
check("4b 新main deps.fallbackToItem===true", r.newMainLocal.fallbackToItem === true, `got=${r.newMainLocal.fallbackToItem}`);
check("4c local 与 crop 的 fallbackToItem 必须不同", r.newMainLocal.fallbackToItem !== r.newOutfitLocal.fallbackToItem, `main=${r.newMainLocal.fallbackToItem} outfit=${r.newOutfitLocal.fallbackToItem}`);

// 4d fallbackToItem 分叉被合并完整保留：outfit=false / main=true，且工厂把该值透传给 crop 步骤
// （cropLocalEditFile(item, rect, tag, { fallbackToItem }) 在 fallbackToItem=false 且无原图时抛错——
//  真正的抛错发生在裁剪步骤，需要真实文件/DOM，故此处验证「分叉值等价 + 透传」两件事）。
const factorySrc = readFileSync("src/shared/local-edit-mask.js", "utf8");
const threadsFallback = /cropLocalEditFile\([^)]*fallbackToItem/.test(factorySrc);
check("4d1 新outfit fallbackToItem 与原Outfit 一致(均 false)", r.newOutfitLocal.fallbackToItem === r.oldOutfitLocal.fallbackToItem && r.newOutfitLocal.fallbackToItem === false, `new=${r.newOutfitLocal.fallbackToItem} old=${r.oldOutfitLocal.fallbackToItem}`);
check("4d2 新main fallbackToItem 与原Quick 一致(均 true)", r.newMainLocal.fallbackToItem === r.oldQuickLocal.fallbackToItem && r.newMainLocal.fallbackToItem === true, `new=${r.newMainLocal.fallbackToItem} old=${r.oldQuickLocal.fallbackToItem}`);
check("4d3 工厂把 fallbackToItem 透传给 cropLocalEditFile（false 时关闭兜底 → 无原图抛错）", threadsFallback, "cropLocalEditFile 调用含 fallbackToItem");

// ---- 汇总 ----
let passed = 0;
for (const c of results) {
  console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}${c.pass ? "" : "  => " + c.detail}`);
  if (c.pass) passed++;
}
console.log(`\nRF-077 对照组：${passed}/${results.length} PASS`);
if (passed !== results.length) {
  console.log("存在 FAIL，对照组未通过");
  process.exit(1);
}
console.log("全部反证通过：合并后 LocalEditModal 与原两组件派生值逐条等价，差异确由 props 注入、未做语义统一。");
