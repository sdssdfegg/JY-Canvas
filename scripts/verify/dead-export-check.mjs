// 死导出（dead export）门禁 + 基线棘轮（P7-2）。
//
// 为什么要有它：2026-10-16 架构审计实测出一批「写了却没人用」的导出（临时脚本扫出 12 条），
// 它们长期躺在 `src/api/debug.js`、`src/shared/routing.js` 这些文件里没人发现——
// 没人删，也没人敢删（不确定到底有没有人用，动态引用尤其查不清）。诊断代码、
// 迁移后遗留的函数、搬家时顺手复制的一份 helper，都会以这种形式沉淀成「沉默债务」。
//
// 判定口径（写清楚，否则将来数字会互相打架）：
//   一个导出算「活的」，只要命中下面任意一条——宁可放过，不可误杀：
//   ① 别的文件**具名 import** 了它（`import { x } from './m'`，含 `as` 取原名）；
//   ② 别的文件**整体 import** 了它所在的模块（default / `* as ns` / 副作用 /
//      动态 `import()` / `React.lazy(() => import('./m'))`）——拿整包的时候没法静态知道
//      它内部哪个导出被用到了，一律算引用；
//   ③ 它是 **转发再导出**（`export { x } from './m'` / `export * from './m'`）：
//      这种 `x` 不属于本文件，本文件不是它的归属，且它的真身（m 的 x）已被引用；
//   ④ **兜底宽判**：导出名在别的文件里以标识符形式出现过（`window.__x = foo`、
//      `mod[name]`、字符串表里登记的方法名…都可能躲过静态 import 分析）。
//      代价是「别的模块里恰好有个同名局部变量」会被判成活引用 —— 这是刻意买的保险：
//      把活代码判成死代码，比漏报一个死导出危险得多。这类"疑似"会列进 softReferences 供人看。
//   三条都不中 → 记入候选（dead export candidate）。
//
// 另两个刻意的例外（执行单 §2.1 要求显式处理）：
//   - **入口文件**：由 `index.html` 的 `<script type="module" src=…>` 直接加载，
//     根本不经过 src 的 import 图，它的导出没人 import 属正常。脚本直接读 index.html
//     自动得出这份白名单（不写死文件名，改入口也不用改脚本）。
//   - **本文件内的自使用**：`src/api/debug.js` 里 export 的函数被同文件另一个函数调用，
//     算不算死导出？本门禁**算它活**——它在自己的模块里被用到，履行的是模块内部职责。
//     真要挑出来的是「连自己文件都没人用、外面也没人 import」的那种。
//
// 棘轮口径（照搬本仓 shared-ui / frontend / server / api-layering 四套检查）：
//   存量记账允许存在；新增的 `(file, name)` 判红；基线记的项已消失（stale）也判红，
//   逼着 `--update` 让基线追上代码 —— 「清理了死导出却不刷基线」同样算没完成。
//
// 用法：
//   node scripts/verify/dead-export-check.mjs                            # 检查（人读 JSON）
//   node scripts/verify/dead-export-check.mjs --json                     # 检查（单行 JSON，给 run-all）
//   node scripts/verify/dead-export-check.mjs --update --reason "…"      # 刷新基线（必须写理由）
//
// 本单范围的边界（P7-2 R6）：**只发现，不删除**。存量 11 条的清理归 P7-6。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { listFrontendSourceFiles } from "./lib/frontend-sources.mjs";

const ROOT = process.cwd();
// 基线与本仓其余六份 *-baseline.json（含 P7-1 的 api-layering-baseline.json）同处 scripts/verify/：
// `baselines/` 目录至今只放 V11 快照目录，从未放过 *-baseline.json。
const BASELINE = path.join(ROOT, "scripts", "verify", "dead-export-baseline.json");

const UPDATE = process.argv.includes("--update");
const AS_JSON = process.argv.includes("--json");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

const files = listFrontendSourceFiles();
const fileSet = new Set(files);

/**
 * 注释擦成等长空白（保留换行 ⇒ 行号不漂）。
 * 只擦块注释与**行首** `//`：擦`"https://x"`里的行尾 `//` 会把后面的真代码整段抹掉，
 * 造成「明明引用了却判死」的假红。取舍同 P7-1：宁可多记一条疑似，不可漏掉真正的活引用。
 */
function blankComments(source) {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.replace(/^[ \t]*\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, " "));
}

/** 相对说明符 → src 内的目标文件；裸包（node_modules）或解析不到一律返回 null。 */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(path.join(ROOT, fromFile)), spec);
  const candidates = [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js"), path.join(base, "index.jsx")];
  for (const candidate of candidates) {
    const rel = path.relative(ROOT, candidate).split(path.sep).join("/");
    if (fileSet.has(rel)) return rel;
  }
  return null;
}

/**
 * 解析 import 子句 → 是整包拿还是具名拿。
 *  `* as ns` / `X`（default）/ 混合 `X, { a }` 都算整包引用到模块身上。
 */
function parseClause(clause) {
  const named = [];
  let whole = false;
  const brace = /\{([\s\S]*?)\}/.exec(clause);
  if (brace) {
    for (const raw of brace[1].split(",")) {
      const item = raw.trim();
      if (!item) continue;
      // `import { origin as local }`：origin 是目标模块的导出名
      named.push(item.split(/\s+as\s+/)[0].trim());
    }
  }
  const withoutBrace = brace ? clause.replace(/\{[\s\S]*?\}/, "") : clause;
  if (/[A-Za-z_$][\w$]*/.test(withoutBrace.replace(/,/g, ""))) whole = true;
  if (/\*/.test(withoutBrace)) whole = true;
  return { named, whole };
}

// ---------------------------------------------------------------- 每文件的导出 / 引用账
/** file -> { hasWholeImport:boolean, namedImports:Set<string> } */
const usage = new Map(files.map((file) => [file, { hasWholeImport: false, namedImports: new Set() }]));

/**
 * 星号转发关系：`file -> Set<被 export * 指向的文件>`。
 *
 * 为什么要单独走一遍：**转发壳不能算「整包引用」**。本仓有这类壳（`src/models.js` 就是
 * `export * from "./shared/models.js"`），如果把 `export *` 当成「目标被整包引用」，
 * 目标文件里真正的死导出（如 `IMAGE_SIZES`）会被永久掩盖——壳本身无人问津，却替它挡了枪。
 * 正确做法是**记账传递**：外部对壳的引用，沿着星号边透传给被转发的文件；
 * 没人引用壳，就等于没人转发，目标的导出该死还是死。
 */
const starReExports = new Map(files.map((file) => [file, new Set()]));
/** 待结算的引用请求 [{target, whole, named}]，等星号关系收集完再统一结算（见 applyUsage）。 */
const importRequests = [];

/**
 * 结算一次引用到目标文件，并沿星号转发边透传。
 * `seen` 防 `a → b → a` 这类循环转发把脚本跑成死循环。
 */
function applyUsage(target, whole, named, seen = new Set()) {
  if (!target || seen.has(target)) return;
  seen.add(target);
  const record = usage.get(target);
  if (whole) record.hasWholeImport = true;
  named.forEach((name) => record.namedImports.add(name));
  for (const next of starReExports.get(target) || []) applyUsage(next, whole, named, seen);
}

/** file -> Set<导出名>（自有导出，转发不算；default 用固定名 "default"） */
const exportsByFile = new Map();

for (const file of files) {
  const source = blankComments(readFileSync(path.join(ROOT, file), "utf8"));
  const own = new Set();

  // 1) export (async) function / const|let|var|class NAME
  for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) own.add(m[1]);
  for (const m of source.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) own.add(m[1]);
  // 解构导出 `export const { a, b } = obj;`
  for (const m of source.matchAll(/^export\s+(?:const|let|var)\s*\{([^}]*)\}/gm)) {
    for (const raw of m[1].split(",")) {
      const item = raw.trim().split(":").pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(item)) own.add(item);
    }
  }
  // 2) export { a, b as c }（紧跟 from 的是转发，见下，先别在这收）
  for (const m of source.matchAll(/^export\s*\{([^}]*)\}(?!\s*from)/gm)) {
    for (const raw of m[1].split(",")) {
      const item = raw.trim().split(/\s+as\s+/).pop().trim();
      if (item) own.add(item);
    }
  }
  // 3) export default
  if (/^export\s+default\b/m.test(source)) own.add("default");

  // ---- 引用侧：本文件发出的所有 import（只记账，等星号关系收集完再结算）----
  for (const m of source.matchAll(/import\s+([\s\S]*?)\s+from\s*["']([^"']+)["']/g)) {
    const target = resolveSpecifier(file, m[2]);
    if (!target) continue;
    const { named, whole } = parseClause(m[1]);
    importRequests.push({ target, whole, named });
  }
  // 副作用导入 import "./x"
  for (const m of source.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) {
    const target = resolveSpecifier(file, m[1]);
    if (target) importRequests.push({ target, whole: true, named: [] });
  }
  // 动态 import()：含 React.lazy(() => import("./x")) —— 拿的是整包
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const target = resolveSpecifier(file, m[1]);
    if (target) importRequests.push({ target, whole: true, named: [] });
  }
  // 转发再导出：export { a as b } from "./x" / export * from "./x"
  for (const m of source.matchAll(/export\s*(\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) {
    const target = resolveSpecifier(file, m[2]);
    if (!target) continue;
    if (m[1] === "*") starReExports.get(file).add(target);
    else importRequests.push({ target, whole: false, named: parseClause(m[1]).named });
  }

  exportsByFile.set(file, own);
}

// 结算：到此为止星号转发关系已经全部收集完，逐条透传
for (const request of importRequests) applyUsage(request.target, request.whole, request.named);

// ---------------------------------------------------------------- ④ 兜底宽判用的全局标识符地图
/** name -> Set<file>，用于「导出名在别的文件里出现过吗」 */
const identifierFiles = new Map();
for (const file of files) {
  const source = blankComments(readFileSync(path.join(ROOT, file), "utf8"));
  for (const m of source.matchAll(/[$A-Za-z_][\w$]*/g)) {
    if (!identifierFiles.has(m[0])) identifierFiles.set(m[0], new Set());
    identifierFiles.get(m[0]).add(file);
  }
}

// ---------------------------------------------------------------- 入口白名单（读 index.html，不写死）
const entryFiles = new Set();
const indexHtml = path.join(ROOT, "index.html");
if (existsSync(indexHtml)) {
  const html = readFileSync(indexHtml, "utf8");
  for (const m of html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)) {
    const rel = m[1].replace(/^\/+/, "");
    if (fileSet.has(rel)) entryFiles.add(rel);
  }
}

// ---------------------------------------------------------------- 判定
/**
 * 「本文件内的自使用」是否算活 —— **算**。为什么：
 * `export function helper()` 在同文件被另一个函数调用，说明它在履行模块内部职责，
 * 只是顺手 export 了。这类「导出过剩」确实存在（P7-6 可以顺手去掉 export 关键字，
 * 收益是收窄 API 面），但它不是「写了没人用的死代码」，报出来没有可执行的结论。
 * 2026-10-16 首跑踩过这个坑：不排除自使用时候选数从 ~12 条暴涨到 **189 条**，
 * 真正该删的那十几条被噪声淹没了。故排除自使用，与审计脚本 tmp/audit-dead.mjs 口径一致。
 *
 * 注意 `default` 是合成的导出名，没有真实的 self-use 文本可找，直接按 0 处理（由 whoever 的
 * whole-import 判定兜住）。
 */
function hasSelfUse(source, name) {
  if (name === "default") return false;
  const decl = new RegExp(`^export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`);
  for (const line of source.split(/\r?\n/)) {
    if (decl.test(line)) continue;
    if (new RegExp(`\\b${name}\\b`).test(line)) return true;
  }
  return false;
}

const candidates = [];
const softReferences = [];
let exportTotal = 0;
let selfUsed = 0;

for (const file of files) {
  if (entryFiles.has(file)) continue;
  const own = exportsByFile.get(file) || new Set();
  const used = usage.get(file);
  const source = blankComments(readFileSync(path.join(ROOT, file), "utf8"));
  for (const name of [...own].sort()) {
    exportTotal += 1;
    if (used.namedImports.has(name) || used.hasWholeImport) continue;
    if (hasSelfUse(source, name)) {
      selfUsed += 1;
      continue;
    }
    // 兜底：别的文件里出现过同名标识符 ⇒ 可能是动态/字符串引用，放过
    const others = [...(identifierFiles.get(name) || [])].filter((item) => item !== file);
    if (others.length > 0) {
      softReferences.push({ file, name, appearsIn: others.sort().slice(0, 5) });
      continue;
    }
    candidates.push({ file, name });
  }
}
candidates.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
softReferences.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));

const key = (item) => `${item.file} :: ${item.name}`;
const keys = candidates.map(key);

// ---------------------------------------------------------------- 写基线
if (UPDATE) {
  if (!REASON) {
    console.error("[dead-export] 刷新基线必须写理由：--update --reason \"为什么现在刷新\"");
    console.error("  理由会一起落盘，将来翻基线时能看出是「清理了存量」还是「无奈放行」。");
    process.exit(1);
  }
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    reason: REASON,
    items: candidates.map((item) => ({ file: item.file, name: item.name }))
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[dead-export] 基线已刷新：${candidates.length} 条死导出（scripts/verify/dead-export-baseline.json）`);
  for (const item of keys) console.log("  " + item);
  process.exit(0);
}

// ---------------------------------------------------------------- 棘轮比对
if (!existsSync(BASELINE)) {
  console.error("[dead-export] 找不到基线 scripts/verify/dead-export-baseline.json");
  console.error("  首次接入请跑：node scripts/verify/dead-export-check.mjs --update --reason \"P7-2 引入时存量\"");
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const before = (Array.isArray(baseline.items) ? baseline.items : []).map((item) => `${item.file} :: ${item.name}`);
const beforeSet = new Set(before);

const added = keys.filter((item) => !beforeSet.has(item));
const stale = before.filter((item) => !keys.includes(item));
const kept = keys.filter((item) => beforeSet.has(item));

const ok = added.length === 0 && stale.length === 0;

const FAIL_NOTE = added.length && stale.length
  ? `新增 ${added.length} 条 + 陈旧 ${stale.length} 条：新增的请确认是临时代码（删掉）还是确实要导出（让它有引用）；消失的那几条说明已经清理过了，跑 --update --reason "…" 把账划掉`
  : added.length
    ? `新增了 ${added.length} 条死导出：要么给它补上真实引用，要么别导出（降级成模块内私有函数）；确需放行就 --update 并写明理由`
    : `基线已陈旧 ${stale.length} 条：对应导出已经清理/被引用了，跑 --update --reason "…" 让基线追上代码（「改了代码不刷基线」同样判未完成）`;

const report = {
  ok,
  scannedFiles: files.length,
  exportTotal,
  selfUsedCount: selfUsed,
  candidates: candidates.length,
  kept: kept.length,
  added,
  stale,
  failureCount: added.length + stale.length,
  total: keys.length + stale.length,
  passed: kept.length,
  softReferenceCount: softReferences.length,
  entryFiles: [...entryFiles].sort(),
  baselineGeneratedAt: baseline.generatedAt,
  baselineReason: baseline.reason,
  baselineCount: before.length,
  note: ok
    ? `${kept.length} 条死导出仍在基线内（存量允许，至少没有变多）；清理后记得 --update`
    : FAIL_NOTE
};

if (AS_JSON) {
  console.log(JSON.stringify(report));
} else {
  console.log(JSON.stringify(report, null, 2));
  // softReferences 与明细只在人读模式输出：它们动辄几十上百条，塞进 --json 会把 run-all 的汇总刷屏
  if (softReferences.length > 0) {
    console.log("");
    console.log(`--- 疑似动态引用（已放过 ${softReferences.length} 条，前 20 条）---`);
    for (const item of softReferences.slice(0, 20)) {
      console.log(`  ${item.file} :: ${item.name}  ← 同名标识符出现在 ${item.appearsIn.join(", ")}`);
    }
  }
}

process.exit(ok ? 0 : 1);
