// 统筹排产测量工具（配平法，替代会失真的「区间减法」）。
//
// 背景：RF-074 只读单里执行者纠正了统筹一处测量失真 —— 旧测法按
// 「上一函数名尾行 → 下一函数名首行」做区间减法，会把**已抽取工厂的 deps 解构块**
// 算成待搬函数体，导致 21 函数被多算 103 行（371 vs 实测 268）。
// ⇒ 本工具改用**花括号配平**定每个函数的真实起止行，行数 = 结束行 − 起始行 + 1。
//
// 用法:
//   node scripts/dev/fn-extent.mjs <file> [startLine] [endLine]
//   不加区间则扫全文；加区间则只统计落在该区间内的函数。
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("用法: node scripts/dev/fn-extent.mjs <file> [startLine] [endLine]");
  process.exit(1);
}
const startArg = Number(process.argv[3] || 0);
const endArg = Number(process.argv[4] || 0);

const src = readFileSync(file, "utf8");
const lines = src.split(/\r?\n/);

// 识别三类定义：function 声明 / const x = (…) => / const x = async (…) =>
const FN_RE = /^(\s*)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/;
const ARROW_RE = /^(\s*)(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>/;

function braceSpan(i) {
  // 从 i 行开始做花括号配平，返回结束行下标；配不平返回 -1
  let depth = 0;
  let opened = false;
  for (let j = i; j < lines.length; j++) {
    const l = lines[j].replace(/\r$/, "");
    // 粗略去字符串/注释干扰：去掉行注释与常见字符串字面量里的括号
    const clean = l.replace(/\/\/.*$/, "").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/`(?:[^`\\]|\\.)*`/g, "``");
    let inStr = false;
    for (const ch of clean) {
      if (ch === "{") { depth++; opened = true; }
      else if (ch === "}") { depth--; }
      void inStr;
    }
    if (opened && depth <= 0) return j;
    if (j - i > 400) return -1; // 防御：超过 400 行认为配平失败
  }
  return -1;
}

const list = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i].replace(/\r$/, "");
  if (/^\s*\/\//.test(l)) continue;
  let m = FN_RE.exec(l) || ARROW_RE.exec(l);
  if (!m) continue;
  const indent = m[1].length;
  const name = m[2];
  const end = braceSpan(i);
  if (end < 0) continue;
  const len = end - i + 1;
  list.push({ name, start: i + 1, end: end + 1, len, indent });
}

const inRange = startArg || endArg
  ? list.filter((f) => f.start >= (startArg || 0) && f.end <= (endArg || Infinity))
  : list;

const totalLines = lines.length; // 末行可能是空行
console.log(`文件 ${file}: 共 ${totalLines} 行（含末空行），识别函数 ${list.length} 个`);
console.log(`区间 ${startArg || "全文"}-${endArg || "全文"}: 命中 ${inRange.length} 个，合计 ${inRange.reduce((a, b) => a + b.len, 0)} 行`);
console.log("--- 明细（按起始行） ---");
for (const f of inRange.sort((a, b) => a.start - b.start)) {
  console.log(`  ${String(f.start).padStart(5)}-${String(f.end).padStart(5)}  ${String(f.len).padStart(4)} 行  indent=${f.indent}  ${f.name}`);
}
