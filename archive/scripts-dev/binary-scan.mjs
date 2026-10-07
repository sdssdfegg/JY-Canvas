// 源码二进制污染扫描：找出非法 UTF-8 / NUL / 控制字符，定位到行号。
// 背景：RF-078-b 提交给 src/outfit-workflow.jsx 的注释行混入二进制垃圾，
// 导致 grep 把整个 1 万行巨石判为 binary —— 所有基于 grep 的审计对该文件集体失灵。
// 用法：node scripts/dev/binary-scan.mjs [文件...]（不给参数则扫 src/**）
import fs from "node:fs";
import path from "node:path";

const isBad = (c) => c === 0 || c < 9 || (c > 13 && c < 32) || c === 127;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|jsx|mjs|css|json|html)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : walk("src");
let totalFiles = 0;
let totalBad = 0;

for (const f of files) {
  const buf = fs.readFileSync(f);
  const badBytes = [];
  for (let i = 0; i < buf.length; i += 1) if (isBad(buf[i])) badBytes.push(i);

  let utf8Fail = false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    utf8Fail = true;
  }

  if (!badBytes.length && !utf8Fail) continue;
  totalFiles += 1;
  totalBad += badBytes.length;

  const text = buf.toString("latin1");
  // 字节偏移 → 行号：统计首个脏字节之前的换行数
  const lines = text.split("\n");
  const rows = new Set();
  let acc = 0;
  for (const line of lines) {
    const end = acc + line.length;
    for (const b of badBytes) if (b >= acc && b <= end) rows.add(rows.size + 0);
    if (badBytes.some((b) => b >= acc && b <= end)) {
      // 记录真实行号
      rows.delete(rows.size);
      rows.add(lines.indexOf(line) + 1);
    }
    acc = end + 1;
  }

  console.log(`\n✗ ${f}  脏字节=${badBytes.length}  UTF-8 非法=${utf8Fail}`);
  for (const ln of rows) {
    const raw = lines[ln - 1] ?? "";
    const shown = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (ch) => `<${ch.charCodeAt(0).toString(16).padStart(2, "0")}>`);
    console.log(`    行 ${ln}: ${shown.slice(0, 160)}`);
  }
}

console.log(`\n合计：${totalFiles} 个文件含脏字节，脏字节总数 ${totalBad}`);
if (totalFiles > 0) process.exitCode = 1;
