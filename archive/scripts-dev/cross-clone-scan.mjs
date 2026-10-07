// 跨文件块级克隆扫描（补 019 Advisory 的盲区）。
//
// 019 门禁的 renameCloneAdvisory 只比对「顶层同名定义」，对
// **两个文件之间逐字相同的代码块**结构性失明 —— main.jsx 与 outfit-workflow.jsx
// 之间历史遗留的大量复制粘贴就藏在这里。
//
// 算法与 self-clone-scan.mjs 相同（N 行滑窗 + 归一化哈希 + 贪心扩展），
// 但索引跨文件共享，且**只报告落在不同文件的配对**。
//
// 用法: node scripts/dev/cross-clone-scan.mjs <fileA> <fileB> [--win=5] [--min=10]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const win = Number((args.find((a) => a.startsWith("--win=")) || "--win=5").slice(6));
const minLines = Number((args.find((a) => a.startsWith("--min=")) || "--min=10").slice(6));
if (files.length < 2) {
  console.error("用法: node scripts/dev/cross-clone-scan.mjs <fileA> <fileB> [--win=5] [--min=10]");
  process.exit(1);
}

const norm = (s) => s.replace(/\r$/, "").trim();
const skip = (s) => s === "" || s.startsWith("//") || s.startsWith("*") || s.startsWith("/*");

// pool: [{file, no, text}]，并记录每个文件的有效行区间，便于判定跨文件
const pool = [];
const ranges = [];
for (const f of files) {
  const lines = readFileSync(f, "utf8").split(/\r?\n/);
  const from = pool.length;
  for (let i = 0; i < lines.length; i++) {
    const n = norm(lines[i]);
    if (skip(n)) continue;
    pool.push({ file: f, no: i + 1, text: n });
  }
  ranges.push({ file: f, from, to: pool.length - 1 });
  console.error(`  ${f}: ${lines.length} 行 → 有效 ${pool.length - from}`);
}

const ownerOf = (k) => ranges.find((r) => k >= r.from && k <= r.to).file;

const index = new Map();
for (let i = 0; i + win <= pool.length; i++) {
  const key = pool.slice(i, i + win).map((e) => e.text).join("\n");
  const arr = index.get(key);
  if (arr) arr.push(i);
  else index.set(key, [i]);
}

function extend(i, j) {
  let len = win;
  while (i + len < pool.length && j + len < pool.length && pool[i + len].text === pool[j + len].text) len++;
  let head = 0;
  while (head < Math.min(i, j) && pool[i - head - 1].text === pool[j - head - 1].text) head++;
  return { i: i - head, j: j - head, len: len + head };
}

const seen = new Map();
for (const [, idxs] of index) {
  if (idxs.length < 2) continue;
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      const i = idxs[a];
      const j = idxs[b];
      if (j - i < win) continue;
      if (ownerOf(i) === ownerOf(j)) continue; // 同文件 self-clone 不在此报告
      const blk = extend(i, j);
      if (blk.len < win) continue;
      seen.set(`${blk.i}:${blk.j}:${blk.len}`, blk);
    }
  }
}

const list = [...seen.values()].filter((b) => b.len >= minLines).sort((x, y) => y.len - x.len);
console.log(`窗口 ${win} / 阈值 ${minLines} 行 ⇒ 跨文件克隆 ${list.length} 组`);
console.log("--- 明细（按块长降序） ---");
for (const b of list.slice(0, 40)) {
  const a1 = pool[b.i];
  const a2 = pool[b.i + b.len - 1];
  const c1 = pool[b.j];
  const c2 = pool[b.j + b.len - 1];
  console.log(`  ${String(b.len).padStart(4)} 有效行  A: ${a1.file}:${a1.no}-${a2.no}  ↔  B: ${c1.file}:${c1.no}-${c2.no}`);
}
