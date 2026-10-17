// 硬编码颜色棘轮门禁（V74 落地）：给 CSS 里的硬编码 hex 颜色装上「存量记账、只拦新增」的闸。
//
// 背景：250 处硬编码 hex 是「没有统一视觉」的土壤——今天清完，明天又会长出来。
// 本门禁按项目既有「基线棘轮」套路（P7 五门禁同款）建第一道 UI 门禁：存量记账、只拦新增。
//
// 棘轮语义（与 shared-ui / frontend / size-ratchet 同款）：
//   - 某 .css 文件 hex 数 > 基线 → 判红（新增）。
//   - < 基线 → improved 只报告不拦（存量被顺手清掉是好事）。
//   - 基线记了某文件、但该文件已无 hex（或文件没了）→ stale 判红，逼 --update。
//   - 新出现的 .css 文件带 hex → 视为新增，判红（只拦新增）。
//
// 边界（必须写清，否则等于又一次失明）：
//   ✅ 只扫 src/**/*.css（不含 .jsx 内联 style——动态色合法，误拦会破坏主题系统）。
//   ✅ 判据：#rgb / #rrggbb / #rrggbbaa（大小写不敏感）。
//   ⚠️ rgba()/hsla() 等函数色暂不记账（本仓极少，先不拦），只在报告里报 skipped 数。
//   ❌ 不扫 .jsx、不改判据去适配代码、不碰其它基线。
//
// 用法：
//   node scripts/verify/hardcoded-color-check.mjs            # 检查
//   node scripts/verify/hardcoded-color-check.mjs --update    # 刷新基线（首次接入用）
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const BASELINE = path.join(ROOT, "scripts", "verify", "hardcoded-color-baseline.json");
const UPDATE = process.argv.includes("--update");

// hex 颜色：3/4/6/8 位，大小写不敏感；负向 lookahead 保证不截断更长的 hex 串。
const HEX_RE =
  /#[0-9a-fA-F]{3}(?![0-9a-fA-F])|#[0-9a-fA-F]{4}(?![0-9a-fA-F])|#[0-9a-fA-F]{6}(?![0-9a-fA-F])|#[0-9a-fA-F]{8}(?![0-9a-fA-F])/g;
// 函数色（先不拦，只报 skipped）：rgba( / hsla( / hsl( / rgb(
const FN_COLOR_RE = /\b(?:rgba?|hsla?)\(/gi;

// ---------------------------------------------------------------- 收集 src/**/*.css
const files = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry !== "node_modules" && entry !== ".git") walk(full);
    } else if (entry.endsWith(".css")) {
      files.push(full);
    }
  }
}
walk(SRC_DIR);

/** rel -> { hex, fnColors } */
const current = {};
let totalFnColors = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const hexCount = (source.match(HEX_RE) || []).length;
  const fnCount = (source.match(FN_COLOR_RE) || []).length;
  totalFnColors += fnCount;
  current[rel] = { hex: hexCount, fnColors: fnCount };
}

const payload = {
  note:
    "硬编码 hex 颜色存量基线（V74 落地）。仅记账、只拦新增：某 .css 文件 hex 数 > 基线即判红（新增）；" +
    "< 基线只报 improved（存量被顺手清掉是好事）；基线记了某文件、但该文件已无 hex（或文件没了）→ stale 判红逼 --update。" +
    "清理存量由各接入单（V76+）顺手清零，全量清零单独开单。不扫 .jsx 内联 style（动态色合法）。" +
    "rgba()/hsla() 等函数色暂不记账。",
  generatedAt: new Date().toISOString().slice(0, 10),
  files: Object.fromEntries(
    Object.entries(current)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([rel, v]) => [rel, v.hex])
  ),
};

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const total = Object.values(payload.files).reduce((a, b) => a + b, 0);
  console.log(`[hardcoded-color-ratchet] 基线已刷新：${files.length} 个 .css 文件，共 ${total} 处 hex 颜色`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error("[hardcoded-color-ratchet] 找不到基线 scripts/verify/hardcoded-color-baseline.json");
  console.error("  首次接入请跑：node scripts/verify/hardcoded-color-check.mjs --update");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const baseFiles = baseline.files || {};

const regressions = [];
const improved = [];
const stale = [];

for (const [rel, v] of Object.entries(current)) {
  const before = baseFiles[rel];
  if (before === undefined) {
    // 新出现的 .css 文件：带 hex 视为新增判红；纯 0 hex 不拦（合法）。
    if (v.hex > 0) {
      regressions.push({
        file: rel,
        kind: "new-file",
        now: v.hex,
        hint: "新增 .css 文件含硬编码 hex，应改用令牌（tokens.css 里的 CSS 变量）",
      });
    }
    continue;
  }
  if (v.hex > before) {
    regressions.push({ file: rel, kind: "added-hex", before, now: v.hex, delta: v.hex - before, hint: "硬编码 hex 数增长，应改用令牌" });
  } else if (v.hex < before) {
    improved.push({ file: rel, before, now: v.hex, delta: before - v.hex });
  }
}
// stale：基线记录的 hex 在代码里已经没了（文件删除或 hex 归零），必须 --update 刷新基线。
for (const [rel, before] of Object.entries(baseFiles)) {
  if (!(rel in current)) {
    stale.push({ file: rel, before, hint: "基线记录的文件已不在代码中，请 --update 刷新基线" });
  } else if (current[rel].hex === 0) {
    stale.push({ file: rel, before, now: 0, hint: "基线记录有 hex，但当前文件已无 hex，请 --update 刷新基线" });
  }
}

// 基线陈旧（stale）与新增（regressions）都判红：基线必须始终反映代码现状。
const ok = regressions.length === 0 && stale.length === 0;
const failureCount = regressions.length + stale.length;

const report = {
  ok,
  scannedFiles: files.length,
  totalHex: Object.values(current).reduce((a, v) => a + v.hex, 0),
  fnColorsSkipped: totalFnColors,
  regressions,
  improved,
  stale,
  failureCount,
  baselineGeneratedAt: baseline.generatedAt,
  note: ok
    ? `硬编码 hex 未新增（另有 ${improved.length} 个文件 hex 减少，好事）。rgba()/hsla() 等函数色未记账（${totalFnColors} 处）。`
    : (stale.length
        ? `基线已陈旧：记录了 ${stale.length} 个文件 hex 但代码已无（另有 ${regressions.length} 处新增）。请 --update 刷新基线。`
        : `新增了 ${regressions.length} 处硬编码 hex（已点名文件），请改用令牌后再跑；确实要接受就 --update 并说明原因`),
};

console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
