// 文档绝对路径卫生检查（V4.0 规范，2026-10-13）。
//
// 定位：这是一个**告警型 linter，永不拦截提交（退出码恒为 0）**。
// 它把文档里写死的本机绝对路径「显形」出来——哪些在本机不存在、哪些是历史机器痕迹——
// 让漂移在 `npm run check` / 提交前门禁的输出里看得见，而不是沉默地烂在文档里。
//
// 为什么不做成硬门禁：
//   绝对路径存在与否无法区分「项目内应当解析的引用」和「示例/常见位置枚举」
//   （如 README 里 `C:\Program Files\nodejs` 这类"常见安装位置"示例，本就不保证本机存在）。
//   硬拦会产生大量误报、反而逼人 `--no-verify` 绕过。真正的硬门禁交给棘轮脚本
//   （shared-ui / frontend-duplication / runtime-config-baseline / auth-key-parity /
//    import-path / app-paths / lint-ratchet），它们对回归是真正零容忍的。
//
// 输出：README.md 内的死路径始终打印（它是项目门面，最该干净）；docs/ 与根目录 md 的
//   死路径只在 `--verbose` 时全量打印，平时只报计数，避免刷屏。
//
// 扫描排除 AGENTS.md（机器特定的元规则文件，里面故意列备份/忽略目录，不应被误伤）。
//
// 用法：node scripts/verify/docs-path-check.mjs [--verbose]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const verbose = process.argv.includes("--verbose");

/** README.md 是最该干净的门面文档。 */
function readmeFile() {
  const readme = path.join(ROOT, "README.md");
  return existsSync(readme) ? readme : null;
}

/** 软扫描：根目录其它 *.md（排除 AGENTS.md 与 README.md）+ docs 递归。 */
function softFiles() {
  const files = [];
  const rootMd = readdirSync(ROOT).filter(
    (n) => n.endsWith(".md") && n !== "AGENTS.md" && n !== "README.md"
  );
  for (const n of rootMd) files.push(path.join(ROOT, n));

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
    }
  };
  const docsDir = path.join(ROOT, "docs");
  if (existsSync(docsDir)) walk(docsDir);
  return files;
}

// 绝对 Windows 路径：盘符 + 冒号 + 斜杠，后接「非分隔符」字符。
// 分隔符含空白外的常见中英文标点与括号，使 `C:\Program Files\nodejs` 能完整捕获、
// 并在 `、`/换行等处正确终止；同时容忍路径中的空格（合法，如 Program Files）。
// 边界字符避免误吞 `https://` 里的 "s:/"（其前是字母 p，不在边界集合内）。
const SEG = `[^<>"'\\r\\n、，,。；;：:（）()【】\\[\\]{}《》>]`;
const ABS_PATH_RE = new RegExp(`(^|[\\s(\\["'<])([A-Za-z]:[\\\\/]${SEG}+)`, "g");

function findAbsPaths(text) {
  const out = [];
  let m;
  ABS_PATH_RE.lastIndex = 0;
  while ((m = ABS_PATH_RE.exec(text)) !== null) out.push(m[2]);
  return out;
}

function existsAny(p) {
  if (existsSync(p)) return true;
  const trimmed = p.replace(/[\\/]+$/, "");
  return trimmed.length > 0 && trimmed !== p && existsSync(trimmed);
}

const readmeDead = [];
const softDead = [];
const seen = new Set();

function scan(file, bucket) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const rel = path.relative(ROOT, file);
  for (const p of findAbsPaths(text)) {
    const key = `${rel}::${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!existsAny(p)) bucket.push({ file: rel, path: p });
  }
}

const readme = readmeFile();
if (readme) scan(readme, readmeDead);
for (const f of softFiles()) scan(f, softDead);

const lines = [];
for (const f of readmeDead) lines.push(`  ⚠ README.md: ${f.path}（本机不存在）`);
if (verbose) {
  for (const s of softDead) lines.push(`  ⚠ ${s.file}: ${s.path}（本机不存在）`);
} else if (softDead.length > 0) {
  lines.push(`  （docs/ 与根目录 md 另有 ${softDead.length} 处历史/文档死路径，仅记录；加 --verbose 查看）`);
}

console.log(`[docs-path-check] 文档绝对路径卫生（告警型，不拦提交）`);
if (lines.length) console.log(lines.join("\n"));
else console.log("  无死路径。");
console.log(JSON.stringify(
  { ok: true, readmeDead: readmeDead.length, softDead: softDead.length, note: "warn-only, never blocks" },
  null,
  2
));

// 告警型：退出码恒为 0，避免误伤合法示例路径（如常见安装位置枚举）。
process.exitCode = 0;
