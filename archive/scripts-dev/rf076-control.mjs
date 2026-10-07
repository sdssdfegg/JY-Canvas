// RF-076 阶段 A 对照组：验证「逐字搬运」不变量。
// 三路断言：
//  1) 工厂内 14 个函数体 与 BASE(main.jsx HEAD) 语料库(全部具名函数体 ∪ 全部 useEffect 体内联语句) 逐字相等；
//  2) 工厂 deps 解构覆盖设计约定的 17 个依赖名（缺一个即运行时 ReferenceError）；
//  3) main.jsx / outfit-workflow.jsx 内已无这 14 个函数的内联 `function NAME(` 定义（确已搬走）。
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";

const ROOT = "D:/源码开发/静音AI画板v4.0源码";
// ⚠ BASE 必须锁死在「RF-076-A 之前」的提交：阶段 A 已把 14 个函数从 main.jsx 搬走，
//   若拿 HEAD(已搬空) 当语料库，断言1 会 14 个全 FAIL —— 那是基线取错，不是回归。
const BASE_REV = "30e35c6"; // RF-076-A(73753f8) 的父提交
const FACTORY = `${ROOT}/src/shared/local-edit-mask.js`;
const MAIN = `${ROOT}/src/main.jsx`;
const OUTFIT = `${ROOT}/src/outfit-workflow.jsx`;

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

const NAMES = [
  "measureImage", "maskPointerPoint", "maskPointerDisplayPoint", "updateBrushCursor",
  "sourceBrushSize", "paintMask", "refreshMaskState", "beginMaskPaint", "moveMaskPaint",
  "endMaskPaint", "leaveMaskPaint", "clearMask", "changeBrushByKeyboard", "syncCropRectFromMask",
];

const EXPECTED_DEPS = [
  "imageRef", "setDisplaySize", "maskCanvasRef", "displaySize", "imageSize", "brushSize",
  "maskTool", "paintRef", "isMaskMode", "working", "brushResizeRef", "setBrushCursor",
  "setMaskPainted", "setCropRect", "setMaskRevision", "activeRatio", "setBrushSize",
];

// 字符串/模板/注释感知的花括号扫描，返回从 openBraceIdx(即 '{' 位置) 起的匹配闭合索引
function matchClose(src, openBraceIdx) {
  let depth = 0, inStr = null, templateDepth = 0, comment = 0;
  for (let i = openBraceIdx; i < src.length; i++) {
    const c = src[i], c2 = src[i + 1];
    if (comment === 1) { if (c === "\n") comment = 0; continue; }
    if (comment === 2) { if (c === "*" && c2 === "/") { comment = 0; i++; } continue; }
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (inStr === "`" && c === "$" && c2 === "{") { templateDepth++; i++; continue; }
      if (inStr === "`" && templateDepth > 0 && c === "}") { templateDepth--; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "/" && c2 === "/") { comment = 1; i++; continue; }
    if (c === "/" && c2 === "*") { comment = 2; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// 抽取 `function NAME(...) {` 的函数体（不含 wrapper）
function namedFunctionBody(name, src) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const m = re.exec(src);
  if (!m) return null;
  const open = src.indexOf("{", m.index);
  const close = matchClose(src, open);
  if (close < 0) return null;
  return src.slice(open + 1, close);
}

// 抽取所有 `useEffect(() => { ... }, [...])` 的体内联语句
function effectBodies(src) {
  const out = [];
  const re = /useEffect\(\s*\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1; // 指向 '{'
    const close = matchClose(src, open);
    if (close < 0) continue;
    out.push(src.slice(open + 1, close));
  }
  return out;
}

// BASE 语料库：全部具名函数体 + 全部 useEffect 体
function baseCorpus(src) {
  const set = new Set();
  const normSet = new Set();
  const namedRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let mm;
  while ((mm = namedRe.exec(src))) {
    const open = src.indexOf("{", mm.index);
    const close = matchClose(src, open);
    if (close < 0) continue;
    const body = src.slice(open + 1, close);
    set.add(body);
    normSet.add(norm(body));
  }
  for (const b of effectBodies(src)) {
    set.add(b);
    normSet.add(norm(b));
  }
  return { set, normSet };
}

function norm(text) {
  return text.split("\n").map((l) => l.replace(/\s+$/, "").replace(/^\s+/, "")).join("\n");
}

const factorySrc = readFileSync(FACTORY, "utf8");
const baseMainSrc = await gitShow(BASE_REV, "src/main.jsx");
const mainSrc = readFileSync(MAIN, "utf8");
const outfitSrc = readFileSync(OUTFIT, "utf8");

const corpus = baseCorpus(baseMainSrc);
let failures = 0;

console.log("== 断言1: 工厂函数体 ∈ BASE 语料库(逐字) ==");
for (const name of NAMES) {
  const body = namedFunctionBody(name, factorySrc);
  if (!body) { console.log(`  [FAIL] 工厂内找不到 ${name}`); failures++; continue; }
  if (corpus.set.has(body)) {
    console.log(`  [ OK ] ${name} 逐字命中 BASE 语料 (${body.length} 字符)`);
  } else if (corpus.normSet.has(norm(body))) {
    console.log(`  [WARN] ${name} 空白归一命中(非逐字) (${body.length} 字符)`);
  } else {
    console.log(`  [FAIL] ${name} 在 BASE 语料库中找不到对应 (${body.length} 字符)`);
    failures++;
  }
}

console.log("== 断言2: 工厂 deps 解构覆盖 17 个约定依赖 ==");
const factoryHead = factorySrc.slice(0, factorySrc.indexOf("function measureImage"));
const missingDeps = EXPECTED_DEPS.filter((d) => !new RegExp(`\\b${d}\\b`).test(factoryHead));
if (missingDeps.length) {
  console.log(`  [FAIL] 解构缺少: ${missingDeps.join(", ")}`);
  failures += missingDeps.length;
} else {
  console.log(`  [ OK ] 17 个依赖名全部出现在 deps 解构中`);
}

console.log("== 断言3: main/outfit 已无内联 function 定义 ==");
for (const name of NAMES) {
  const re = new RegExp(`function\\s+${name}\\s*\\(`);
  const inMain = re.test(mainSrc);
  const inOutfit = re.test(outfitSrc);
  if (inMain || inOutfit) {
    console.log(`  [FAIL] ${name} 仍定义在 ${inMain ? "main" : ""}${inOutfit ? "outfit" : ""}`);
    failures++;
  }
}
if (failures === 0 || !Array.from({ length: 0 }).length) {
  // 仅当断言3无 fail 才打印 OK；failures 已累计
}
const assert3Fail = NAMES.some((n) => new RegExp(`function\\s+${n}\\s*\\(`).test(mainSrc) || new RegExp(`function\\s+${n}\\s*\\(`).test(outfitSrc));
if (!assert3Fail) console.log("  [ OK ] 14 个函数已从两巨石移除（仅保留解构引用）");

console.log(`\n对照组结果: ${failures === 0 ? "ALL PASS ✓" : `FAILURES=${failures} ✗`}`);
process.exit(failures === 0 ? 0 : 1);
