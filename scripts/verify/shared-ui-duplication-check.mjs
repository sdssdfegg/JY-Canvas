// 共享 UI 重复组件棘轮：`V11维护文档/02-重复功能同步登记表.md` 的机器版。
//
// 那份登记表的问题是：它靠人记性兜底——写完就没人再看了。本项目已经有一个活例子：
// `ReferenceThumbTray` 在两个巨石文件里各有一份完整定义（签名一模一样），被登记为
// 「必须同步检查」，但两份实现早就分叉了（详见下面的 drifted 字段）。
//
// 这个脚本不做"必须 0 重复"的强约束，而是和 `lint-ratchet-check.mjs` 同款的棘轮：
//   - 存量重复记账，允许存在，但不许变多；
//   - 出现新的跨文件同名组件 → 失败；
//   - 已有重复又扩散到一个新文件 → 失败；
//   - 抽到 shared 消掉了某个重复 → 通过，并提示刷新基线。
//
// 额外的判别力：同名两份定义会比对**归一化后的实现哈希**。hash 不一致意味着
// 「签名的契约相同、行为已经分叉」——这正是登记表想拦却拦不住的那种漂移。
// drifted 目前只报告、不清零失败（存量问题），但它会一直挂在 `npm test` 的输出里，
// 直到有人把组件抽到 src/shared/ui/ 为止。
//
// 用法：
//   node scripts/verify/shared-ui-duplication-check.mjs            # 检查
//   node scripts/verify/shared-ui-duplication-check.mjs --update   # 刷新基线（去重后执行）
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const BASELINE = path.join(ROOT, "scripts", "verify", "shared-ui-baseline.json");
const UPDATE = process.argv.includes("--update");

// ---------------------------------------------------------------- 收集源码文件
const files = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "node_modules" && entry !== ".git") walk(full);
    } else if (entry.endsWith(".jsx") || entry.endsWith(".js")) {
      files.push(full);
    }
  }
}
walk(SRC_DIR);

// ---------------------------------------------------------------- 提取顶层组件定义
// 只认 PascalCase（`Aaa` / `AaaBbb`），排除全大写的常量（DEFAULT_* 之类）。
const DEF = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*\(|^(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*=>|function)/gm;

/**
 * 从函数关键字处取出整段定义原文。
 *
 * 必须先跳过参数列表再找函数体的花括号：
 * React 组件的写法是 `function Xxx({ a, b }) { ... }`，第一个 `{` 属于**解构参数**，
 * 直接拿它配平会在参数结束处就返回，导致只比对到签名——两份签名相同、函数体早已分叉
 * 的情况就会被误判成"实现一致"（ReferenceThumbTray 正是这样漏掉的）。
 */
function extractBlock(source, startIndex) {
  const parenStart = source.indexOf("(", startIndex);
  if (parenStart < 0) return source.slice(startIndex, startIndex + 400);
  let parenDepth = 0;
  let cursor = parenStart;
  for (; cursor < source.length; cursor += 1) {
    if (source[cursor] === "(") parenDepth += 1;
    else if (source[cursor] === ")") {
      parenDepth -= 1;
      if (parenDepth === 0) break;
    }
  }
  const braceStart = source.indexOf("{", cursor); // 跳过 `=>` 后才是函数体
  if (braceStart < 0) return source.slice(startIndex, cursor + 1);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, i + 1);
    }
  }
  return source.slice(startIndex, startIndex + 4000);
}

/** 去注释去空白后的指纹，用于判断"两份实现是否还一样" */
function fingerprint(block) {
  const flat = block
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\s+/g, "");
  return createHash("sha256").update(flat).digest("hex").slice(0, 12);
}

const found = new Map(); // name -> [{ file, hash, line }]
let totalDefs = 0;

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const re = new RegExp(DEF);
  let match = null;
  while ((match = re.exec(source)) !== null) {
    const name = match[1] || match[2];
    if (!name || /^[A-Z0-9_]+$/.test(name)) continue;
    totalDefs += 1;
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    const entry = { file: rel, hash: fingerprint(extractBlock(source, match.index)), line };
    if (!found.has(name)) found.set(name, []);
    found.get(name).push(entry);
  }
}

// 只看跨文件重复；同一个文件内的重名（不太可能）不算
const duplicates = [...found.entries()]
  .filter((entry) => new Set(entry[1].map((item) => item.file)).size > 1)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([name, entries]) => {
    const hashes = [...new Set(entries.map((item) => item.hash))];
    return {
      name,
      fileCount: new Set(entries.map((item) => item.file)).size,
      files: entries.map((item) => item.file).sort(),
      locations: entries.map((item) => item.file + ":" + item.line).sort(),
      implementationCount: hashes.length,
      drifted: hashes.length > 1
    };
  });

// ---------------------------------------------------------------- 棘轮比对
const currentMap = Object.fromEntries(duplicates.map((item) => [item.name, item.files]));

function sameList(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

const payload = {
  note: "共享 UI 重复组件基线：记录当前已存在的跨文件同名组件，只用来拦「新增」。组件抽到 src/shared/ui/ 后跑一次 --update 把它从账单里划掉。",
  generatedAt: new Date().toISOString().slice(0, 10),
  duplicates: Object.fromEntries(
    Object.entries(currentMap).map(([name, list]) => [name, list])
  )
};

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("[shared-ui-ratchet] 基线已刷新：" + Object.keys(currentMap).length + " 个跨文件重复组件");
  for (const item of duplicates) console.log("  " + item.name + " -> " + item.files.join(" | "));
  process.exit(0);
}

let baseline = null;
if (existsSync(BASELINE)) {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} else {
  console.error("[shared-ui-ratchet] 找不到基线 scripts/verify/shared-ui-baseline.json");
  console.error("  首次接入请跑：node scripts/verify/shared-ui-duplication-check.mjs --update");
  process.exit(1);
}

const regressions = [];
const improved = [];

for (const [name, list] of Object.entries(currentMap)) {
  const before = baseline.duplicates?.[name];
  if (before === undefined) {
    regressions.push({ name, kind: "new", files: list, hint: "新增的跨文件同名组件，应抽到 src/shared/ui/ 而不是复制一份" });
    continue;
  }
  const added = list.filter((file) => !before.includes(file));
  if (added.length > 0) {
    regressions.push({ name, kind: "spread", files: list, added, hint: "原有重复又扩散到新文件" });
    continue;
  }
  if (!sameList(list, before)) improved.push({ name, before, now: list });
}
for (const name of Object.keys(baseline.duplicates || {})) {
  if (!(name in currentMap)) improved.push({ name, before: baseline.duplicates[name], now: [] });
}

const drifted = duplicates.filter((item) => item.drifted);
const ok = regressions.length === 0;

console.log(JSON.stringify({
  ok,
  scannedFiles: files.length,
  scannedComponents: totalDefs,
  duplicateCount: duplicates.length,
  regressions,
  improved,
  drifted: drifted.map((item) => ({
    name: item.name,
    locations: item.locations,
    implementations: item.implementationCount,
    meaning: "同名两份定义的实现已不一致：改了一处、另一处没跟上。登记表的纸质记录拦不住这类漂移。"
  })),
  duplicates,
  baselineGeneratedAt: baseline.generatedAt,
  note: ok
    ? "没有新增跨文件重复组件" + (drifted.length ? `；但有 ${drifted.length} 个同名组件实现已分叉（见 drifted），这是存量，建议抽到 src/shared/ui/` : "")
    : `新增了 ${regressions.length} 处跨文件重复，请改为抽到 src/shared/ui/ 后再跑；确实要接受就 --update 并说明原因`
}, null, 2));

process.exit(ok ? 0 : 1);
