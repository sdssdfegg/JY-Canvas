// 产物体积预算门禁（P7-4）：给 `vite build` 的产物设一个硬上限，防止依赖膨胀 /
// 误引入大包把首屏拖慢却没人察觉。
//
// 背景（2026-10-16 架构审计）：当前最大 chunk 261.70 kB（21 个 js + 3 个 css 共 967 kB），
// 全仓**没有任何体积维度的门禁**。包一大的后果是"用户觉得变卡了"，但没有 CI 红灯、
// 没有 diff 提示，只能靠某个人某天偶然打开 Network 面板——典型的静默退化。
//
// 与 P7-1/2/3 那三套**棘轮**（只许降不许升）不同，本单是**预算**（absolute ceiling）：
//   - 棘轮适合"代码体量"，每次 +1 行都问一句，代价是一次 justified 的改动就要 update 一次；
//   - 预算适合"产物体积"——装了新依赖、换了写法，体积跳动十几个 kB 是常态，
//     每次都卡提交会很快被人当成噪声关掉。所以这里给 +15% 左右的余量，
//     只在真的越过天花板时判红，升级要显式调预算并写明理由。
//
// 为什么只记 maxChunk / total 两个数、**不按文件名记账**：vite 的产物名带内容哈希
// （`feat-outfit-6RnS_oyu.js`），源码改一个字节文件名就变。按文件名做基线的话，
// 每次构建都会"旧的 stale + 新的未记账"，和 P7-1 那个 file:line 粒度一个毛病，
// 但这里更严重——它每次必炸。聚合到两个数上就绕开了整个问题。
//
// 为什么 dir 不存在要跳过而不是判红：`dist/` 在 .gitignore 里、不入库，CI 与刚 clone
// 的机器上都没有。判红会让全仓恒红，等于逼所有人先 build 才能跑任何检查——
// 那是把门禁变成路障。跳过的代价是"没构建时管不住"，由 CI（先 build 再 check）兜住。
//
// 用法：
//   node scripts/verify/bundle-budget-check.mjs                     # 检查（人读 JSON）
//   node scripts/verify/bundle-budget-check.mjs --json              # 单行 JSON（给 run-all）
//   node scripts/verify/bundle-budget-check.mjs --update --reason "…"          # 记录实测值
//   node scripts/verify/bundle-budget-check.mjs --update --reason "…" \
//        --budget-max-kb 320 --budget-total-kb 1200                 # 顺手调预算（kB，1000 进制）
//
// 本单范围的边界（P7-4 R6）：**只观测与拦截，不为了压体积改业务代码或依赖**——那是另一单。
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { listFrontendSourceFiles } from "./lib/frontend-sources.mjs";

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, "dist", "assets");
// 基线与本仓其余八份 *-baseline.json 同处 scripts/verify/（`baselines/` 历来只放 V11 快照目录）。
const BASELINE = path.join(ROOT, "scripts", "verify", "bundle-budget-baseline.json");

/** kB 用 1000 进制，与 `vite build` 输出小数的口径一致（用 1024 会对不上，白怀疑一次回归）。 */
const KB = 1000;
/** 首次建基线时的默认预算：实测值 ×1.15 取个整，给日常波动留余量但不放水。 */
const DEFAULT_MAX_CHUNK_BUDGET = 300 * KB;
const DEFAULT_TOTAL_BUDGET = 1120 * KB;

const UPDATE = process.argv.includes("--update");
const AS_JSON = process.argv.includes("--json");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

/** 读 `--budget-xxx-kb N` 形式的参数；返回字节数或 null（没给就用继承/默认）。 */
function readKbFlag(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = Number(process.argv[index + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`[bundle-budget] ${flag} 后面要跟一个正数（kB），例如 ${flag} 320`);
    process.exit(2);
  }
  return Math.round(value * KB);
}

// ---------------------------------------------------------------- 扫描产物
/** @returns {null | Array<{file:string, bytes:number, kind:"js"|"css"}>} null = dist/assets 不存在 */
function readAssets() {
  if (!existsSync(ASSETS_DIR)) return null;
  const assets = [];
  for (const entry of readdirSync(ASSETS_DIR, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name);
    const kind = ext === ".js" ? "js" : ext === ".css" ? "css" : null;
    if (!kind) continue; // .ico / .webp / .map 等不算产物体积：前者是静态资源，后者不进首屏
    assets.push({ file: entry.name, bytes: statSync(path.join(ASSETS_DIR, entry.name)).size, kind });
  }
  return assets;
}

/**
 * 这次 dist 是不是比源码还旧（= 你看到的数字可能来自过期的产物）。
 * 只报告不判红：谁也没保证过 dist 一定是新的，但它决定了"这次绿灯可不可以信"。
 */
function isStaleBuild() {
  if (!existsSync(ASSETS_DIR)) return null;
  let newestAsset = 0;
  for (const entry of readdirSync(ASSETS_DIR, { withFileTypes: true })) {
    if (entry.isFile()) newestAsset = Math.max(newestAsset, statSync(path.join(ASSETS_DIR, entry.name)).mtimeMs);
  }
  let newestSource = 0;
  for (const file of listFrontendSourceFiles()) {
    newestSource = Math.max(newestSource, statSync(path.join(ROOT, file)).mtimeMs);
  }
  return newestSource > newestAsset;
}

/** 跳过（无构建产物）：一览表里标注 skipped，退出 0。 */
function skip(reason) {
  if (AS_JSON) console.log(JSON.stringify({ ok: true, skipped: true, reason }));
  else console.log(`[bundle-budget] 跳过：${reason}`);
  process.exit(0);
}

const measuredAssets = readAssets();
// --update 时不能跳过：没产物就没法记录，静默跳过会让人以为已经建好基线了。
if (UPDATE && (measuredAssets === null || measuredAssets.length === 0)) {
  console.error("[bundle-budget] 没有构建产物可以记录，请先跑 vite build 再 --update");
  process.exit(1);
}
if (measuredAssets === null) skip("dist/assets 不存在（还没跑 vite build）");
if (measuredAssets.length === 0) skip(`dist/assets 下没有 .js / .css 产物`);

const jsAssets = measuredAssets.filter((item) => item.kind === "js");
const cssAssets = measuredAssets.filter((item) => item.kind === "css");
const sumBytes = (list) => list.reduce((acc, item) => acc + item.bytes, 0);
const chunkLeader = jsAssets.slice().sort((a, b) => b.bytes - a.bytes)[0] || null;
const summary = {
  assetCount: measuredAssets.length,
  jsCount: jsAssets.length,
  cssCount: cssAssets.length,
  maxChunkFile: chunkLeader?.file ?? null,
  maxChunkBytes: chunkLeader?.bytes ?? 0,
  jsBytes: sumBytes(jsAssets),
  cssBytes: sumBytes(cssAssets),
  // 预算口径：total 含 css —— 首屏要下的字节里 css 也算，只盯 js 会被 88 kB 的
  // outfit-workflow.css 这类绕过。
  totalBytes: sumBytes(measuredAssets),
};
const bigAssets = measuredAssets.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 5);

// ---------------------------------------------------------------- 写基线
if (UPDATE) {
  if (!REASON) {
    console.error("[bundle-budget] 刷新基线必须写理由：--update --reason \"为什么体积变了 / 为什么调预算\"");
    process.exit(1);
  }
  const previous = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
  const budget = {
    maxChunkBytes: readKbFlag("--budget-max-kb") ?? previous?.budget?.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BUDGET,
    totalBytes: readKbFlag("--budget-total-kb") ?? previous?.budget?.totalBytes ?? DEFAULT_TOTAL_BUDGET,
  };
  writeFileSync(BASELINE, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    reason: REASON,
    budget,
    measured: summary,
    topAssets: bigAssets.map((item) => ({ file: item.file, bytes: item.bytes, kind: item.kind })),
  }, null, 2) + "\n", "utf8");
  console.log(`[bundle-budget] 基线已写入：${summary.assetCount} 个产物 / 最大 ${(summary.maxChunkBytes / KB).toFixed(2)} kB / 合计 ${(summary.totalBytes / KB).toFixed(2)} kB`);
  console.log(`  预算：单 chunk ≤ ${(budget.maxChunkBytes / KB).toFixed(0)} kB，合计 ≤ ${(budget.totalBytes / KB).toFixed(0)} kB`);
  process.exit(0);
}

// ---------------------------------------------------------------- 比预算
if (!existsSync(BASELINE)) {
  console.error(`[bundle-budget] 找不到基线 ${path.relative(ROOT, BASELINE)}`);
  console.error("  首次接入请跑：node scripts/verify/bundle-budget-check.mjs --update --reason \"P7-4 引入时实测\"");
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const budget = {
  maxChunkBytes: baseline.budget?.maxChunkBytes ?? DEFAULT_MAX_CHUNK_BUDGET,
  totalBytes: baseline.budget?.totalBytes ?? DEFAULT_TOTAL_BUDGET,
};

const overBudget = [];
/** @param {"maxChunk"|"total"} metric */
function checkBudget(metric, actual, limit, file) {
  if (actual <= limit) return;
  overBudget.push({
    metric,
    file: file ?? null,
    actualBytes: actual,
    budgetBytes: limit,
    overBytes: actual - limit,
  });
}
checkBudget("maxChunk", summary.maxChunkBytes, budget.maxChunkBytes, summary.maxChunkFile);
checkBudget("total", summary.totalBytes, budget.totalBytes);

const staleBuild = isStaleBuild();
const ok = overBudget.length === 0;
const headroomPercent = (actual, limit) => Number((((limit - actual) / limit) * 100).toFixed(1));

const report = {
  ok,
  skipped: false,
  // dist 比源码旧：数字不可信，绿灯仅供参考（不判红，构建产物本来就不入库）
  staleBuild,
  scannedAssets: summary.assetCount,
  measured: summary,
  budget,
  overBudget,
  headroom: {
    maxChunkPercent: headroomPercent(summary.maxChunkBytes, budget.maxChunkBytes),
    totalPercent: headroomPercent(summary.totalBytes, budget.totalBytes),
  },
  topAssets: bigAssets.map((item) => ({ file: item.file, kb: Number((item.bytes / KB).toFixed(2)), kind: item.kind })),
  failureCount: overBudget.length,
  total: 2,
  passed: 2 - overBudget.length,
  baselineGeneratedAt: baseline.generatedAt,
  baselineReason: baseline.reason,
  note: ok
    ? `产物体积在预算内（余量：单 chunk ${headroomPercent(summary.maxChunkBytes, budget.maxChunkBytes)}%，合计 ${headroomPercent(summary.totalBytes, budget.totalBytes)}%）`
    : `${overBudget.length} 项超体积预算：确认必要就 --update --reason "…" --budget-xxx-kb …, 否则请先查是不是误引入了大依赖/整包`,
};

if (AS_JSON) {
  console.log(JSON.stringify(report));
} else {
  console.log(JSON.stringify(report, null, 2));
  if (staleBuild) {
    console.log("");
    console.log(`提示：dist 比你本地 src 还旧，上面的数字来自过期产物。重跑 vite build 再check 才准。`);
  }
}

process.exit(ok ? 0 : 1);
