// 源码字节卫生门禁（2026-10-03 新建，血案直接解药）。
//
// 断言：源码文件里不允许出现 NUL / 非法控制字符 / 非法 UTF-8 序列。
//
// 为什么必须单独立一道门禁 —— RF-078-b（91ad725）给 src/outfit-workflow.jsx
// 的一条 // 注释写进了二进制垃圾，实测后果：
//
//   1. **grep / rg 会把整个文件判为 binary** ⇒ 对这个 1 万行巨石的 grep 全部静默失效。
//      而本项目的派单前「四处 grep 判是否被裁决过」、worktree 对拍、「搬 A 查唯一调用方」
//      全靠 grep ⇒ 等于让审计体系对 outfit 侧集体失明，且不报任何错。
//   2. **运行时完全无感**：垃圾全在一行注释里 ⇒ vite build 绿、ESLint 绿、
//      所有功能门禁都抓不到。只能靠字节级扫描发现。
//
// 🔴 修复时的两个坑（写在这里防止后人重蹈）：
//   - 不能用 latin1 读整体、再原样写回 ⇒ 插入的中文会被拆成单字节落盘，反向污染。
//   - 不能用 utf8 读整体、再写回 ⇒ 其余行的非法字节会被替换成 U+FFFD，
//     一夜间改坏另外 1 万行。
//   ⇒ 正解：字节层面只切那一行 + 用 Buffer.from(text, "utf8") 显式编码插入段。
//
// 无基线无棘轮：脏字节在任何时刻都是错。
// 退出码：通过 0 / 失败 1。输出 JSON，点名文件 + 行号 + 该行内容。
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOTS = ["src", "server", "scripts"];
const EXTS = /\.(js|jsx|mjs|cjs|ts|tsx|css|json|html)$/i;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vite", "coverage", "release"]);

const isBadByte = (c) => c === 0 || c < 9 || (c > 13 && c < 32) || c === 127;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (EXTS.test(e.name)) out.push(path.join(dir, e.name));
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));
const failures = [];

for (const file of files) {
  const buf = fs.readFileSync(file);
  const badBytes = [];
  for (let i = 0; i < buf.length; i += 1) if (isBadByte(buf[i])) badBytes.push(i);
  let utf8Ok = true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    utf8Ok = false;
  }
  if (badBytes.length === 0 && utf8Ok) continue;

  // 字节偏移 → 行号（贪心推进，避免 O(n²)）
  const rows = new Map();
  let acc = 0;
  let line = 1;
  for (const b of badBytes) {
    while (acc < b) {
      if (buf[acc] === 0x0a) line += 1;
      acc += 1;
    }
    if (!rows.has(line)) rows.set(line, []);
    rows.get(line).push(b);
  }

  const text = buf.toString("latin1");
  const lines = text.split("\n");
  const details = [...rows.entries()].map(([ln, offs]) => {
    const raw = lines[ln - 1] ?? "";
    const shown = raw.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (ch) => `<${ch.charCodeAt(0).toString(16).padStart(2, "0")}>`);
    return { line: ln, bytes: offs.length, excerpt: shown.slice(0, 160) };
  });

  failures.push({ file, badBytes: badBytes.length, utf8Valid: utf8Ok, lines: details });
}

const ok = failures.length === 0;
const output = {
  ok,
  scannedFiles: files.length,
  roots: ROOTS,
  dirtyFiles: failures.length,
  note: "脏字节会让 grep 把文件判为 binary，导致所有基于 grep 的审计对该文件静默失效。此为无基线门禁。"
};
if (!ok) output.failures = failures;
console.log(JSON.stringify(output, null, 2));
process.exit(ok ? 0 : 1);
