// 旧按钮类棘轮门禁（V75 收官单落地）：给「旧 11 类按钮类」装上「存量记账、只拦新增」的闸。
//
// 背景：V69-V74 把 9 类基础块与若干版块迁到了 src/shared/ui/Button 等组件，但旧类仍有存量，
// 且没有任何门禁阻止「新版块回头写 .smallButton」或「CSS 里重新定义全局按钮类」。
// 本门禁按项目既有「基线棘轮」套路（与 hardcoded-color / shared-ui / frontend 同款）建第二道 UI 门禁。
//
// 棘轮语义（jsx 用量 + css 定义 两个 section 同机制，逐 key 比对）：
//   - 当前 > 基线 → 判红（复活 / 新增）。
//   - 当前 < 基线 → improved 只报告不拦（存量下降是好事）。
//   - 基线 > 0 且当前 = 0（或该 key 在扫描中消失）→ stale 判红，逼 --update（归零要刷基线）。
//   - 基线 = 0 且当前 = 0 → 无动作（已归零的类不判 stale，否则永久判红）。
//   - 新出现的 .css 文件带旧类行首定义 → 同 new-file 判红。
//
// 边界（必须写清，否则等于又一次失明）：
//   ✅ jsx 用量：扫 src/**/*.jsx，按 11 类名以词边界 \b类名\b 统计全文件出现次数（含注释，保守口径）。
//   ✅ css 定义：扫 src/**/*.css，按（文件,类名）统计行首定义次数
//      （^[ \t]*\.类名\b，覆盖 .类名,/.类名 {/.类名.active/.类名:状态 等行首形态；.foo .smallButton 不算定义）。
//   ❌ 不扫 .jsx 内联 style、不改判据去适配代码、不碰其它基线、不删任何旧类定义块（收口单的活）。
//
// 用法：
//   node scripts/verify/legacy-button-ratchet-check.mjs            # 检查
//   node scripts/verify/legacy-button-ratchet-check.mjs --update    # 刷新基线（首次接入用，仅一次）
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const BASELINE = path.join(ROOT, "scripts", "verify", "legacy-button-baseline.json");
const UPDATE = process.argv.includes("--update");

// 旧 11 类按钮类（V69-V74 迁移后仍有存量的全局按钮类）。
const CLASSES = [
  "smallButton", "iconButton", "toolbarButton", "generateButton", "dangerButton",
  "primaryButton", "secondaryButton", "tabButton", "modeTab", "promptTab", "newPromptButton",
];
const JS_RE = Object.fromEntries(CLASSES.map((c) => [c, new RegExp("\\b" + c + "\\b", "g")]));

// ---------------------------------------------------------------- 收集 src 下文件
function listFiles(ext) {
  const out = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry !== "node_modules" && entry !== ".git") walk(full);
      } else if (entry.endsWith(ext)) {
        out.push(full);
      }
    }
  }
  walk(SRC_DIR);
  return out;
}
const jsxFiles = listFiles(".jsx");
const cssFiles = listFiles(".css");

// ---------------------------------------------------------------- jsx 用量 section
// 全文件出现次数（含注释，保守口径），按类名分桶。
const jsxUsage = Object.fromEntries(CLASSES.map((c) => [c, 0]));
for (const file of jsxFiles) {
  const source = readFileSync(file, "utf8");
  for (const c of CLASSES) {
    const m = source.match(JS_RE[c]);
    if (m) jsxUsage[c] += m.length;
  }
}

// ---------------------------------------------------------------- css 定义 section
// （文件,类名）→ 行首定义次数。key 形如 "src/styles.css::smallButton"。
const cssDefinitions = {};
for (const file of cssFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const c of CLASSES) {
    const re = new RegExp("^[ \\t]*\\." + c + "\\b");
    let count = 0;
    for (const line of lines) if (re.test(line)) count++;
    if (count > 0) cssDefinitions[rel + "::" + c] = count;
  }
}

// ---------------------------------------------------------------- 基线 payload
const payload = {
  note:
    "旧按钮类存量基线（V75 收官单落地）。仅记账、只拦新增：jsx 用量 > 基线即判红（旧类复活/新增）；" +
    "< 基线只报 improved（存量下降是好事）；基线记了某类/某文件定义、但当前已无（或归零）→ stale 判红逼 --update。" +
    "新 .css 文件带旧类行首定义 → new-file 判红。基线=0 且当前=0 不判 stale（已归零的类不永久判红）。" +
    "旧类迁移由 V82+ 接入单推进，定义块删除归收口单；本门禁不删任何旧类定义。",
  generatedAt: new Date().toISOString().slice(0, 10),
  jsxUsage,
  cssDefinitions,
};

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const jsxTotal = Object.values(jsxUsage).reduce((a, b) => a + b, 0);
  const cssTotal = Object.values(cssDefinitions).reduce((a, b) => a + b, 0);
  console.log(
    `[legacy-button-ratchet] 基线已刷新：${jsxFiles.length} 个 .jsx（${jsxTotal} 处旧类用量）、` +
      `${cssFiles.length} 个 .css（${cssTotal} 处行首定义）`
  );
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error("[legacy-button-ratchet] 找不到基线 scripts/verify/legacy-button-baseline.json");
  console.error("  首次接入请跑：node scripts/verify/legacy-button-ratchet-check.mjs --update");
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const baseJsx = baseline.jsxUsage || {};
const baseCss = baseline.cssDefinitions || {};

/**
 * 逐 key 比对当前与基线（jsx 用量 / css 定义 同机制）。
 * 当前 > 基线 → 判红；当前 < 基线 → improved（仅 baseline>0）；基线 > 0 且当前 = 0 → stale；基线=0 且当前=0 → 无动作。
 */
function judge(current, base) {
  const regressions = [];
  const improved = [];
  const stale = [];
  const keys = new Set([...Object.keys(current), ...Object.keys(base)]);
  for (const key of keys) {
    const before = base[key] ?? 0;
    const now = current[key] ?? 0;
    if (now > before) {
      regressions.push({ key, before, now, delta: now - before, hint: "旧类用量/定义增长，应改用 src/shared/ui/ 组件" });
    } else if (now === 0 && before > 0) {
      // 基线记了、但当前已无（或归零）→ stale 判红，逼 --update。必须排在 now<before 之前，
      // 否则 now=0 且 before>0 会被 `now<before` 误判成 improved。
      stale.push({ key, before, hint: "基线记录仍有，但当前已无（或归零），请 --update 刷新基线" });
    } else if (now < before) {
      // 存量下降但仍在（before>0 且 now>0）→ improved 只报告不拦
      improved.push({ key, before, now, delta: before - now });
    }
    // now === before（含 before===0 && now===0）→ 无动作（已归零的类不判 stale）
  }
  return { regressions, improved, stale };
}

const j = judge(jsxUsage, baseJsx);
const c = judge(cssDefinitions, baseCss);

const regressions = [
  ...j.regressions.map((r) => ({ section: "jsxUsage", ...r })),
  ...c.regressions.map((r) => ({ section: "cssDefinitions", ...r })),
];
const improved = [
  ...j.improved.map((r) => ({ section: "jsxUsage", ...r })),
  ...c.improved.map((r) => ({ section: "cssDefinitions", ...r })),
];
const stale = [
  ...j.stale.map((r) => ({ section: "jsxUsage", ...r })),
  ...c.stale.map((r) => ({ section: "cssDefinitions", ...r })),
];

// 基线陈旧（stale）与新增（regressions）都判红：基线必须始终反映代码现状。
const ok = regressions.length === 0 && stale.length === 0;
const failureCount = regressions.length + stale.length;

const report = {
  ok,
  failureCount,
  regressions,
  improved,
  stale,
  sections: {
    jsxUsage: {
      scannedFiles: jsxFiles.length,
      current: jsxUsage,
      regressions: j.regressions,
      improved: j.improved,
      stale: j.stale,
    },
    cssDefinitions: {
      scannedFiles: cssFiles.length,
      current: cssDefinitions,
      regressions: c.regressions,
      improved: c.improved,
      stale: c.stale,
    },
  },
  baselineGeneratedAt: baseline.generatedAt,
  note: ok
    ? `旧按钮类未新增（jsx 用量另有 ${j.improved.length} 项下降、css 定义另有 ${c.improved.length} 项下降，均为好事）。`
    : (stale.length
        ? `基线已陈旧：记录了 ${stale.length} 个旧类用量/定义但代码已无（另有 ${regressions.length} 处新增）。请 --update 刷新基线。`
        : `新增了 ${regressions.length} 处旧按钮类用量/定义（已点名），请改用 src/shared/ui/ 组件后再跑；确实要接受就 --update 并说明原因`),
};

console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
