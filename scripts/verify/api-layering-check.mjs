// API 分层门禁：把 AGENTS.md 第 5 条「不要在页面组件里散写 fetch」从文档规则变成硬门禁。
//
// 为什么要有它：`src/api/**`（client.js / images.js / outfit.js …）是既定的接口准入层，
// 但在此之前没有任何东西拦得住绕过——`.workbuddy` 之外的任何组件都能直接
// `await fetch("/api/xxx")`，改了入参、加了请求头、换了兜底策略都没人知道，
// 出问题时要靠人肉 grep 全仓去找散落点。2026-10-16 架构审计把它定为 P0-②。
//
// 棘轮口径（照搬本仓 shared-ui / frontend / server 三套 duplication 检查的套路）：
//   - 存量**记账**：引入当天实测的散写点全部写进基线，允许存在；
//   - 新增**判红**：任何不在基线里的 `file:line` → 失败；
//   - 陈旧**判红**：基线记的项在代码里已经不存在 → stale 失败，逼着跑 `--update`
//     让基线追上代码，**不允许基线停留在旧位置**（这正是 V4.0 规范要治的漂移）；
//   - 修存量（把 fetch 收进 `src/api/**`）会让对应项从扫描结果里消失，
//     此时必须 `--update`，否则 stale 判红 —— 也就是说「修好了而基线没刷」也算没完成。
//
// 用法：
//   node scripts/verify/api-layering-check.mjs                      # 检查（人读 JSON）
//   node scripts/verify/api-layering-check.mjs --json               # 检查（单行 JSON，给 run-all 汇总）
//   node scripts/verify/api-layering-check.mjs --update --reason "…" # 刷新基线（必须写理由）
//
// 注意（2026-10-16 引入时的已知脆弱点，派单已知悉）：
//   基线粒度是 `file:line`，因此**行号漂移**（在被计账的文件里插/删行）也会判红：
//   「旧行号进 stale」+「新行号算新增」两条同时命中。这不是假报警失效而是刻意严格——
//   擦屁股只需跑一次 `--update`；若将来觉得吵，应改成 `file` 粒度（代价：同一文件内
//   新增第二条散写就抓不到），属另一档收紧/放松权衡，不在本单范围内。
//
// 本单范围的边界（P7-1 R6）：只建门禁，**不改任何业务代码**，也不改 `src/api/*` 的行为；
// 存量 9 处的收口另归 P7-6。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
// 基线与本仓其它基线（shared-ui-baseline.json / frontend-duplication-baseline.json /
// lint-baseline.json / runtime-config-baseline.json）同处 `scripts/verify/`：
// `baselines/` 目录至今只放 V11 快照目录（V11-baseline-*），从未放过 *-baseline.json，
// 按 §2.2「照搬本项目 duplication/lint 既有套路」落在这里。
const BASELINE = path.join(ROOT, "scripts", "verify", "api-layering-baseline.json");

const UPDATE = process.argv.includes("--update");
const AS_JSON = process.argv.includes("--json");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

/**
 * 白名单：`src/api/**` 是准入层本身，它内部用 fetch 是天职。
 * 例外清单留空并说明理由：派发日（2026-10-16）复核过唯一的「非端点型」疑点——
 * `src/shared/local-edit-mask.js:159` 的 `fetch(dataUrl)` 读的是 data: URL 的字节，
 * 不是后端请求。但按 R6「只建门禁、不做业务判断」的收窄口径，本单**不替它开后门**，
 * 一并计进存量基线，留给 P7-6 处置时再决定是豁免还是收进准入层。
 */
const ALLOWED_PREFIXES = ["src/api/"];

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

/**
 * 把注释擦成等长空白（保留换行，所以行号不会漂）。
 *
 * 只擦两类**整块**注释：块注释 `/* … *\/`，以及行首（可含缩进）的 `//` 行注释。
 * 刻意**不去动**「代码 + 行尾 // 注释」那一类：要精确识别就得判断引号边界，
 * 一旦把 `"https://x"` 里的 `//` 当成注释起点，后面的真代码会被整段抹掉造成假绿。
 * 取舍是明摆着的——漏报（假绿）比误报（假红）危险得多，行尾注释里写 `fetch(` 的代价
 * 只是让人多跑一次 `--update`。
 */
function blankComments(source) {
  const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock.replace(/^[ \t]*\/\/[^\n]*/gm, (m) => m.replace(/[^\n]/g, " "));
}

/**
 * 裸 `fetch(`：允许 `await fetch(`、`window.fetch(`、`fetch ("，
 * 但排除 `myFetch(`（前缀是词字符）与 `client.fetch(`/`this.fetch(`（前缀是 `.`）——
 * 后者是走对象方法的调用，不是绕过准入层的全局 fetch。
 */
const FETCH_CALL = /(?<![\w$.])fetch\s*\(/g;

const violations = [];
let scannedFiles = 0;
for (const file of files) {
  scannedFiles += 1;
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (ALLOWED_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
  const source = blankComments(readFileSync(file, "utf8"));
  const lines = source.split(/\r?\n/);
  const re = new RegExp(FETCH_CALL);
  for (let i = 0; i < lines.length; i += 1) {
    re.lastIndex = 0;
    if (re.test(lines[i])) violations.push(`${rel}:${i + 1}`);
  }
}
violations.sort();

// ---------------------------------------------------------------- 写基线
if (UPDATE) {
  if (!REASON) {
    console.error("[api-layering] 刷新基线必须写理由：--update --reason \"为什么现在刷新\"");
    console.error("  理由会一起落盘，将来翻基线时能看出是「修了存量」还是「无奈接受」。");
    process.exit(1);
  }
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    reason: REASON,
    violations
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[api-layering] 基线已刷新：${violations.length} 条散写 fetch（scripts/verify/api-layering-baseline.json）`);
  for (const item of violations) console.log("  " + item);
  process.exit(0);
}

// ---------------------------------------------------------------- 棘轮比对
if (!existsSync(BASELINE)) {
  console.error("[api-layering] 找不到基线 scripts/verify/api-layering-baseline.json");
  console.error("  首次接入请跑：node scripts/verify/api-layering-check.mjs --update --reason \"P7-1 引入时存量\"");
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const before = Array.isArray(baseline.violations) ? baseline.violations : [];
const beforeSet = new Set(before);

const added = violations.filter((item) => !beforeSet.has(item));
const stale = before.filter((item) => !violations.includes(item));
const kept = violations.filter((item) => beforeSet.has(item));

const ok = added.length === 0 && stale.length === 0;

const FAIL_NOTE = added.length && stale.length
  ? `新增 ${added.length} 处 + 陈旧 ${stale.length} 条（很可能是同一处散写的行号漂移）：请先把新增的 fetch 收进 src/api/**，再跑 --update --reason "…" 让基线追上代码`
  : added.length
    ? `新增了 ${added.length} 处散写 fetch：请改为调用 src/api/** 的准入层；确有豁免必要就 --update 并写明理由`
    : `基线已陈旧 ${stale.length} 条：对应的散写 fetch 在代码里已不存在，跑 --update --reason "…" 把这条账划掉（「改了代码不刷基线」同样判未完成）`;

const report = {
  ok,
  scannedFiles,
  violations: violations.length,
  kept: kept.length,
  added,
  stale,
  failureCount: added.length + stale.length,
  total: violations.length + stale.length,
  passed: kept.length,
  baselineGeneratedAt: baseline.generatedAt,
  baselineReason: baseline.reason,
  baselineCount: before.length,
  note: ok
    ? `${kept.length} 处散写 fetch 仍在基线内（存量允许，至少它没有变多）；收进 src/api/** 后记得 --update`
    : FAIL_NOTE
};

if (AS_JSON) {
  console.log(JSON.stringify(report));
} else {
  console.log(JSON.stringify(report, null, 2));
}

process.exit(ok ? 0 : 1);
