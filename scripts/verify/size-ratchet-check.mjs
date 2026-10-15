// 体量棘轮门禁（P7-3）：给「文件行数」和「单函数行数」装上只许降、不许升的闸。
//
// 背景：P6 那六张单把两颗巨石拆开了（main.jsx 5747→2172、outfit-workflow.jsx 4826→2089），
// 但**没有任何机制防止它长回去**。加一个功能在某个大文件里多写 80 行，评审时看不出来，
// 半年后又是一颗巨石——这类退化是全仓唯一没有门禁会亮灯的维度。
//
// 棘轮语义（照搬本仓 shared-ui / frontend / server / api-layering / dead-export 五套）：
//   - **上升判红**：文件/函数当前行数 > 基线 → 失败。不是不许改代码，而是逼你确认一次：
//     「这次变胖是必要的吗？」必要就 `--update --reason "…"` 留个说法，不必要就顺手拆掉。
//   - **下降不判红**：变小是好事，`improved` 只报告不拦。
//   - **stale 判红**：基线记的文件被删、函数整个搬走了，必须 `--update` 让账目追上代码。
//     注意「函数变小到阈值以下」**不算 stale**（见 FUNCTION_MIN_LINES），否则一次成功的拆分
//     反而会换来一个红，那是惩罚正确行为。
//
// 口径（写清楚，否则将来数字会互相打架）：
//   - 行数用 `awk 'END{print NR}'` 同款：先去掉文件末尾那个换行再切行 —— 直接
//     `source.split("\n").length` 会因为结尾有没有换行而虚高一行，历史上有单回填错过 1 行。
//   - 函数体行数 = 起点行 ~ 函数体右花括号所在行（含）。用花括号配平求终点，
//     而不是「到下一个同级起点为止」——后者会把末尾的注释块、空行都算进上一个函数。
//   - 起点认这几种写法（缺一个就整类漏）：`function`/`async function`/
//     `export (default) (async) function`，以及 `const NAME = function` / `= (…) =>` /
//     `= async (…) =>` / `= arg =>`。本项目大量工具函数是 `export const x = (…) => {`，
//     只认 `function` 关键字的话会整片失明。
//
// 两条 celebrate 的取舍，都写在 §2 有据：
//   - 只有 ≥ FUNCTION_MIN_LINES 行的函数才进基线的账。小函数天天增减，全记作基线会被
//     日常的噪声刷满，反而看不见真正的大函数。
//   - 超过绝对值上限（单 FILE_OVER_BUDGET 行文件 / FUNCTION_OVER_BUDGET 行函数）只进
//     `overBudget` 报告、**不判红**：那是「要不要开拆分单」的决策信息，不该冒充回归。
//
// 用法：
//   node scripts/verify/size-ratchet-check.mjs                          # 检查（人读 JSON）
//   node scripts/verify/size-ratchet-check.mjs --json                   # 检查（单行 JSON，给 run-all）
//   node scripts/verify/size-ratchet-check.mjs --update --reason "…"    # 刷新基线（必须写理由）
//
// 本单范围的边界（P7-3 R6）：**只记录与拦截，不拆任何代码**。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { listFrontendSourceFiles } from "./lib/frontend-sources.mjs";

const ROOT = process.cwd();
// 基线与本仓其余七份 *-baseline.json 同处 scripts/verify/（`baselines/` 历来只放 V11 快照目录）。
const BASELINE = path.join(ROOT, "scripts", "verify", "size-ratchet-baseline.json");

/** 小于这个行数的函数不进基线账目（理由见文件头注释）。 */
const FUNCTION_MIN_LINES = 50;
/** 绝对上限：越过只报告不拦。 */
const FILE_OVER_BUDGET = 2500;
const FUNCTION_OVER_BUDGET = 600;

const UPDATE = process.argv.includes("--update");
const AS_JSON = process.argv.includes("--json");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

/** 注释擦成等长空白（行号不漂）。块注释 + 行首 `//`；不动行尾注释，避免误伤含 `//` 的字符串。 */
function blankComments(source) {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.replace(/^[ \t]*\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, " "));
}

/** 行数：与 `awk 'END{print NR}'` 同口径（结尾那个换行不计作一行）。 */
function countLines(source) {
  return source.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

/** 函数起点的几种写法，缺一种就整类函数失明。第 1 组是缩进，第 2 组是名字。 */
const FN_START_RES = [
  /^([ \t]*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/,
  /^([ \t]*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/,
  /^([ \t]*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\(/,
  /^([ \t]*)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?[A-Za-z_$][\w$]*\s*=>/,
];

/** 从 openIdx 处的开括号配平到闭括号；到字符串尾也没配上就返回 -1（调用方据此跳过）。 */
function matchBrace(source, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 求函数体的结束字符位置。
 * 路线：跳过参数列表的圆括号 → 之后第一个 `{` 就是函数体（箭头函数则是 `=>` 后的 `{`）→ 配平。
 * 箭头函数的表达式体（`const f = (x) => x + 1`）没有花括号，退化成单行，按行末算。
 */
function bodyEndIndex(source, startIdx) {
  const paren = source.indexOf("(", startIdx);
  const lineEnd = source.indexOf("\n", startIdx);
  const lineEndIdx = lineEnd < 0 ? source.length : lineEnd;
  let cursor = startIdx;
  if (paren >= 0 && paren < lineEndIdx) {
    const parenEnd = matchBrace(source, paren, "(", ")");
    if (parenEnd > 0) cursor = parenEnd;
  }
  const arrow = source.indexOf("=>", cursor);
  const brace = source.indexOf("{", cursor);
  const semicolon = source.indexOf(";", cursor);
  const guard = lineEndIdx + 4000; // 长函数允许跨很多行，但别在一个字符串里把整个文件吃掉
  // 关键：判的是「谁先出现」，搞反了会把整个 `function f(..) {` 当成"箭头表达式体"量成 1 行。
  //   `{` 先于 `=>` ⇒ function 声明体（含 `const f = function(..) {`）；
  //   `=>` 先于 `{`  ⇒ 箭头函数，真正的函数体是 `=>` 之后那个 `{`。
  if (brace >= 0 && brace < guard && (arrow < 0 || brace < arrow)) {
    const end = matchBrace(source, brace, "{", "}");
    return end > 0 ? end : -1;
  }
  if (arrow >= 0 && arrow < guard) {
    const afterArrowBrace = source.indexOf("{", arrow + 2);
    if (afterArrowBrace >= 0 && afterArrowBrace < guard) {
      const end = matchBrace(source, afterArrowBrace, "{", "}");
      return end > 0 ? end : -1;
    }
    // 表达式体（const f = (x) => x + 1）：算到本语句结束（分号或行末）
    const stops = [semicolon, source.indexOf("\n", arrow)].filter((value) => value > 0);
    return stops.length > 0 ? Math.min(...stops) : -1;
  }
  if (brace >= 0 && brace < guard) {
    const end = matchBrace(source, brace, "{", "}");
    return end > 0 ? end : -1;
  }
  return -1;
}

// ---------------------------------------------------------------- 扫描
/** file -> lines */
const fileLines = new Map();
/** "rel::name"（同名第 n 个加 #n）-> lines */
const fnLines = new Map();
/** file -> Set<该文件的所有函数名>（含小于阈值的，用于 stale 判定：变小不等于搬走） */
const fnNamesByFile = new Map();

for (const file of listFrontendSourceFiles()) {
  const rawRead = readFileSync(path.join(ROOT, file), "utf8");
  const source = blankComments(rawRead);
  fileLines.set(file, countLines(rawRead)); // 行数按原始文件算，去注释只用于定位函数

  const lineStarts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") lineStarts.push(i + 1);
  }
  const lineOf = (charIdx) => {
    // 各行起点是有序数组，二分查找即可定位字符落在第几行
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= charIdx) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };

  const names = new Set();
  const nameCount = new Map(); // 同文件内同名函数的出现序号，用于 key 消歧
  let cursor = 0;
  while (cursor < source.length) {
    const nextBreak = source.indexOf("\n", cursor);
    const lineStart = cursor;
    cursor = nextBreak < 0 ? source.length : nextBreak + 1;
    const line = source.slice(lineStart, nextBreak < 0 ? source.length : nextBreak);
    let matched = null;
    for (const re of FN_START_RES) {
      const found = re.exec(line);
      if (found) {
        matched = found;
        break;
      }
    }
    if (!matched) continue;
    const name = matched[2];
    const endChar = bodyEndIndex(source, lineStart);
    if (endChar < 0) continue;
    const lines = lineOf(endChar) - lineOf(lineStart) + 1;
    names.add(name);
    // 同名函数在同一个文件里可能出现多次（不同缩进层级），按出现顺序编号区分
    const occurrence = (nameCount.get(name) || 0) + 1;
    nameCount.set(name, occurrence);
    if (lines >= FUNCTION_MIN_LINES) {
      const base = `${file}::${name}`;
      fnLines.set(occurrence > 1 ? `${base}#${occurrence}` : base, lines);
    }
  }
  fnNamesByFile.set(file, names);
}

// ---------------------------------------------------------------- 写基线
if (UPDATE) {
  if (!REASON) {
    console.error("[size-ratchet] 刷新基线必须写理由：--update --reason \"行数为什么变了\"");
    console.error("  理由会一起落盘。「多加了一个分支、暂时没工夫拆，接受这 80 行」这类说法以后能翻出来复盘。");
    process.exit(1);
  }
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    reason: REASON,
    budgets: { fileOverBudget: FILE_OVER_BUDGET, functionOverBudget: FUNCTION_OVER_BUDGET, functionMinLines: FUNCTION_MIN_LINES },
    files: Object.fromEntries([...fileLines.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    functions: Object.fromEntries([...fnLines.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[size-ratchet] 基线已刷新：${fileLines.size} 个文件 / ${fnLines.size} 个函数（≥${FUNCTION_MIN_LINES} 行）`);
  const topFiles = [...fileLines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [file, lines] of topFiles) console.log(`  文件 ${file} = ${lines} 行`);
  const topFns = [...fnLines.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [key, lines] of topFns) console.log(`  函数 ${key} = ${lines} 行`);
  process.exit(0);
}

// ---------------------------------------------------------------- 棘轮比对
if (!existsSync(BASELINE)) {
  console.error("[size-ratchet] 找不到基线 scripts/verify/size-ratchet-baseline.json");
  console.error("  首次接入请跑：node scripts/verify/size-ratchet-check.mjs --update --reason \"P7-3 引入时存量基线\"");
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const baseFiles = baseline.files || {};
const baseFns = baseline.functions || {};

const regressions = [];
const improved = [];
const stale = [];

function compare(kind, key, before, now) {
  if (now > before) regressions.push({ kind, key, before, now, delta: now - before });
  else if (now < before) improved.push({ kind, key, before, now, delta: before - now });
}

for (const [file, lines] of fileLines) {
  if (!(file in baseFiles)) continue; // 新文件：不记账也不拦，体量超标由 overBudget 说话
  compare("file", file, baseFiles[file], lines);
}
for (const file of Object.keys(baseFiles)) {
  if (!fileLines.has(file)) stale.push({ kind: "file", key: file, before: baseFiles[file] });
}

for (const [key, lines] of fnLines) {
  if (!(key in baseFns)) continue;
  compare("function", key, baseFns[key], lines);
}
for (const key of Object.keys(baseFns)) {
  if (fnLines.has(key)) continue;
  // 函数「变小到阈值以下」不算搬走：那是变好了，不该判红
  const file = key.slice(0, key.indexOf("::"));
  const name = key.slice(key.indexOf("::") + 2).replace(/#\d+$/, "");
  const stillThere = fnNamesByFile.get(file)?.has(name);
  if (!stillThere) stale.push({ kind: "function", key, before: baseFns[key] });
}

const overBudget = [
  ...[...fileLines.entries()].filter(([, lines]) => lines > FILE_OVER_BUDGET)
    .map(([file, lines]) => ({ kind: "file", key: file, lines, limit: FILE_OVER_BUDGET })),
  ...[...fnLines.entries()].filter(([, lines]) => lines > FUNCTION_OVER_BUDGET)
    .map(([key, lines]) => ({ kind: "function", key, lines, limit: FUNCTION_OVER_BUDGET })),
].sort((a, b) => b.lines - a.lines);

const ok = regressions.length === 0 && stale.length === 0;

const FAIL_NOTE = regressions.length && stale.length
  ? `${regressions.length} 处体量上升 + ${stale.length} 条基线陈旧：上升的要确认是否必要（--update --reason 写明接受理由），消失的要 --update 把账划掉`
  : regressions.length
    ? `${regressions.length} 处体量上升（只许降不许升）：确认必要就 --update --reason "…"，否则请把新增部分拆到别的文件/函数里`
    : `${stale.length} 条基线陈旧：对应文件/函数已不在原处，跑 --update --reason "…" 让账目追上代码`;

const report = {
  ok,
  scannedFiles: fileLines.size,
  trackedFiles: Object.keys(baseFiles).length,
  trackedFunctions: Object.keys(baseFns).length,
  regressions,
  improvedCount: improved.length,
  stale,
  overBudget,
  budgets: { fileOverBudget: FILE_OVER_BUDGET, functionOverBudget: FUNCTION_OVER_BUDGET, functionMinLines: FUNCTION_MIN_LINES },
  failureCount: regressions.length + stale.length,
  total: fileLines.size + fnLines.size + Object.keys(baseFns).length,
  passed: fileLines.size + fnLines.size - regressions.length,
  baselineGeneratedAt: baseline.generatedAt,
  baselineReason: baseline.reason,
  note: ok
    ? `体量没有上升（另有 ${improved.length} 处变小，好事）`
    : FAIL_NOTE
};

if (AS_JSON) {
  console.log(JSON.stringify(report));
} else {
  console.log(JSON.stringify(report, null, 2));
  if (improved.length > 0) {
    console.log("");
    console.log(`--- 体量下降 ${improved.length} 处（鼓励，前 10 条）---`);
    for (const item of improved.sort((a, b) => b.delta - a.delta).slice(0, 10)) {
      console.log(`  ${item.kind} ${item.key}: ${item.before} → ${item.now}（-${item.delta}）`);
    }
  }
}

process.exit(ok ? 0 : 1);
