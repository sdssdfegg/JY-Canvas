// 语法检查器：遍历 server / src / scripts / prompts，逐个做语法解析。
//
// 为什么不继续在 package.json 里手写文件清单：
//   原来是 `node --check server/index.js && node --check server/channel.js && ...` 一长串，
//   每加一个后端模块就要手动往里添一行 —— 忘了添，那个文件就永远没人检查。
//   后端拆分成多模块之后这个清单一定会腐烂，所以改成自动扫描。
//
// 为什么用 espree 而不是 spawn node --check：
//   子进程方式在某些受限环境里会 EBUSY 起不来，把"环境问题"误报成"代码语法错"。
//   进程内解析不依赖子进程，也没有这个误判。顺带 espree 原生支持 JSX，
//   src/**/*.jsx 也能一起纳入检查（原来那一串命令根本没有管 .jsx）。
//
// 豁免说明（与 eslint.config.mjs 的 IGNORES 保持同一口径）：
//   server/static-assets.generated.js → 生成物，1.3MB，由 scripts/generate-static-assets.mjs 产出
//   server/skill-baselines/**         → 历史版本快照，只作对照、不维护
//
// 用法：
//   node scripts/check-syntax.mjs            人读
//   node scripts/check-syntax.mjs --json     机器可读
//
// 退出码：0 = 全部通过；1 = 至少一个文件语法错误

import process from "node:process";
import path from "node:path";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
// espree 只提供具名导出（它就是 ESLint 用的那个解析器），没有 default，所以用具名导入
import { parse as espreeParse } from "espree";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wantJson = process.argv.includes("--json");

/** 扫描起始目录：这些下面的人写代码都要过一遍语法检查。 */
const SCAN_ROOTS = ["server", "src", "scripts", "prompts"];

/** 豁免的生成物 / 历史快照（相对项目根，用正斜杠比较）。 */
const EXCLUDED_FILES = new Set(["server/static-assets.generated.js"]);
const EXCLUDED_DIRS = new Set(["server/skill-baselines"]);

/** 只有这三类扩展名参与；其他（md/png/ttf 等）跳过。 */
const SOURCE_PATTERN = /\.(js|jsx|mjs|cjs)$/i;

function collectFiles() {
  const found = [];
  for (const relRoot of SCAN_ROOTS) {
    const absRoot = path.join(projectRoot, relRoot);
    let entries;
    try {
      entries = readdirSync(absRoot);
    } catch {
      continue; // 目录不存在就算了
    }
    walk(absRoot, entries, found);
  }
  return found.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function walk(absDir, entries, out) {
  for (const entry of entries) {
    const abs = path.join(absDir, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    const rel = path.relative(projectRoot, abs).replace(/\\/g, "/");
    if (st.isDirectory()) {
      if (EXCLUDED_DIRS.has(rel) || EXCLUDED_DIRS.has(path.dirname(rel))) continue;
      let children;
      try {
        children = readdirSync(abs);
      } catch {
        continue;
      }
      walk(abs, children, out);
      continue;
    }
    if (!st.isFile() || !SOURCE_PATTERN.test(entry)) continue;
    if (EXCLUDED_FILES.has(rel) || EXCLUDED_DIRS.has(path.dirname(rel))) continue;
    out.push(rel);
  }
}

/** 解析单个文件；返回 { file, ok, message }。 */
function checkFile(relFile) {
  const absFile = path.join(projectRoot, relFile);
  let code;
  try {
    code = readFileSync(absFile, "utf8");
  } catch (error) {
    return { file: relFile, ok: false, message: `读取失败：${error.message}` };
  }
  try {
    espreeParse(code, {
      ecmaVersion: "latest",
      sourceType: relFile.endsWith(".cjs") ? "script" : "module",
      ecmaFeatures: { jsx: /\.(jsx|js)$/i.test(relFile) },
      loc: true
    });
    return { file: relFile, ok: true, message: "" };
  } catch (error) {
    const where = error.lineNumber ? `第 ${error.lineNumber} 行${error.column ? ` 第 ${error.column} 列` : ""}` : "";
    return { file: relFile, ok: false, message: `${where ? `${where}：` : ""}${error.message}` };
  }
}

const files = collectFiles();
const results = files.map(checkFile);
const failures = results.filter((item) => !item.ok);

if (wantJson) {
  console.log(JSON.stringify({
    ok: failures.length === 0,
    total: files.length,
    passed: files.length - failures.length,
    failed: failures.length,
    failures
  }, null, 2));
} else {
  console.log(`语法检查：共 ${files.length} 个文件，通过 ${files.length - failures.length} 个，失败 ${failures.length} 个`);
  for (const item of failures) console.log(`  ✗ ${item.file}\n      ${item.message}`);
}

process.exit(failures.length === 0 ? 0 : 1);
