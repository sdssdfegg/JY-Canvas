// 同文件块级克隆扫描（RF-078-b 模式的排产工具）。
//
// 背景：019 门禁的 renameCloneAdvisory 只能抓「跨文件同名顶层定义」，对
// **同一文件内两块近似/逐字相同的代码**结构性失明。RF-078-b 的 2×76 行
// 逐字克隆就是人工盯出来的。本脚本把这一步自动化。
//
// 算法：N 行滑窗 → 归一化（去行尾空白、去纯注释行、去首尾空格）→ 哈希建索引 →
//       找出现次数 ≥2 的窗口 → 把相邻窗口并成最大连续块 → 输出 ≥ minLines 的块。
//
// 用法: node scripts/dev/self-clone-scan.mjs <file> [--win=6] [--min=12]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const win = Number((args.find((a) => a.startsWith("--win=")) || "--win=6").slice(6));
const minLines = Number((args.find((a) => a.startsWith("--min=")) || "--min=12").slice(6));
if (!file) {
  console.error("用法: node scripts/dev/self-clone-scan.mjs <file> [--win=6] [--min=12]");
  process.exit(1);
}

const raw = readFileSync(file, "utf8");
const lines = raw.split(/\r?\n/);

const norm = (s) => s.replace(/\r$/, "").trim();
const isSkippable = (s) => s === "" || s.startsWith("//") || s.startsWith("*") || s.startsWith("/*");

// 归一化后的「有效行」序列，保留原始行号
const eff = [];
for (let i = 0; i < lines.length; i++) {
  const n = norm(lines[i]);
  if (isSkippable(n)) continue;
  eff.push({ no: i + 1, text: n });
}

const index = new Map(); // key -> [有效行下标...]
for (let i = 0; i + win <= eff.length; i++) {
  const key = eff.slice(i, i + win).map((e) => e.text).join("\n");
  const arr = index.get(key);
  if (arr) arr.push(i);
  else index.set(key, [i]);
}

// 收集重复片段：(起始有效行下标, 长度) 对 —— 用贪心把同 key 的多个起点两两配对记录
const pairs = [];
for (const [, idxs] of index) {
  if (idxs.length < 2) continue;
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      const i = idxs[a];
      const j = idxs[b];
      if (j - i < win) continue; // 重叠窗口不报告
      pairs.push([i, j]);
    }
  }
}

// 把相邻窗口扩展成最大连续相同块
function extend(i, j) {
  let len = win;
  while (i + len < eff.length && j + len < eff.length && eff[i + len].text === eff[j + len].text) len++;
  let head = 0;
  while (head < Math.min(i, j) && eff[i - head - 1].text === eff[j - head - 1].text) head++;
  return { i: i - head, j: j - head, len: len + head };
}

const blocks = new Map(); // key -> block
for (const [i, j] of pairs) {
  const b = extend(i, j);
  if (b.len < win) continue;
  const key = `${b.i}:${b.j}:${b.len}`;
  blocks.set(key, b);
}

const list = [...blocks.values()].filter((b) => b.len >= minLines).sort((x, y) => y.len - x.len);
console.log(`文件 ${file}: ${lines.length} 行 / 有效行 ${eff.length} / 窗口 ${win} / 阈值 ${minLines} 行`);
console.log(`命中近似克隆 ${list.length} 组`);
console.log("--- 明细（按块长降序） ---");
for (const b of list.slice(0, 30)) {
  const a1 = eff[b.i].no;
  const a2 = eff[b.i + b.len - 1].no;
  const c1 = eff[b.j].no;
  const c2 = eff[b.j + b.len - 1].no;
  console.log(`  ${String(b.len).padStart(4)} 有效行  A: ${a1}-${a2}  ↔  B: ${c1}-${c2}`);
}
