// 度量：某文件里「模块顶层（indent=0）」定义的函数/常量，及各自占行（花括号配平法）
import fs from "fs";

const file = process.argv[2];
const src = fs.readFileSync(file, "utf8");
const lines = src.split("\n").map((l) => l.replace(/\r$/, ""));

// 顶层定义的正则：function 声明 / const|let NAME = (...) => / const|let NAME = function
const DEF_RE = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w]+)\s*=>|(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?function\b)/;

// 花括号配平：从 defLine 起找到函数体结束行
function extent(startIdx) {
  let depth = 0;
  let opened = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    // 剥字符串与注释（按行粗剥，够用）
    const stripped = line
      .replace(/\/\/.*$/, "")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/`(?:[^`\\]|\\.)*`/g, "``");
    for (const ch of stripped) {
      if (ch === "{") { depth++; opened = true; }
      else if (ch === "}") depth--;
    }
    if (opened && depth === 0) return i;
    // 单行无花括号（如 const x = 1;）直接算一行
    if (!opened && /[;)]$/.test(line.trim()) && i > startIdx) return i;
    if (!opened && i === startIdx && /;$/.test(line.trim())) return i;
  }
  return startIdx;
}

const defs = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.length === 0) continue;
  if (line[0] === " " || line[0] === "\t") continue; // 只要 indent=0
  const m = line.match(DEF_RE);
  if (!m) continue;
  const name = m[1] || m[2] || m[3];
  const end = extent(i);
  defs.push({ name, start: i + 1, end: end + 1, size: end - i + 1 });
}

const total = defs.reduce((s, d) => s + d.size, 0);
console.log(`文件: ${file}`);
console.log(`总行数: ${lines.length} | indent=0 顶层定义: ${defs.length} | 合计占行: ${total}`);
console.log("--- 按体积降序 Top 25 ---");
defs
  .sort((a, b) => b.size - a.size)
  .slice(0, 25)
  .forEach((d) => console.log(`  ${String(d.size).padStart(4)} 行  ${d.start}-${d.end}  ${d.name}`));
