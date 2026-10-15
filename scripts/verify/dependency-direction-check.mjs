// 依赖方向白名单门禁（P7-5）：管「板块 A 能不能 import 板块 B」这件事。
//
// 背景（2026-10-16 架构审计）：跨 feature 依赖 **24 组**（canvas → local-edit、
// reference-remix → detail 等），既有的 `source-hygiene` 只保证「无环」，
// **方向本身无人管**——横向引用裸奔了一年。环检测是最后一道底线（出环就崩），
// 但它拦不住「合法却该被审视」的依赖：ui ← dom ← layout ← ui 那种环我们已经看得见，
// 而 `outfit → auth`、`detail → crop` 这类会长期存在、悄悄把板块焊死。
//
// 为什么用**白名单 + 逐条 reason**，而不是"禁止某些方向"的黑名单：
// 存量 24 组已经存在且大多合理（找那个 author 问一句就知道），一刀切禁止会让本单变成
// 一次大规模重构；反过来说"想加就加、不用写理由"等于没有门禁。白名单把成本放在
// **增加新方向的那一刻**：想要 `X → Y`，就必须在 reason 里写清楚为什么，
// 将来 P7-6/解耦单可以直接拿这份清单当施工图。这也呼应暂存区既有套路
// （api-layering / dead-export / size-ratchet 都是"存量记账 + 新增必显性确认"）。
//
// 三条边界（别走偏）：
//   - **不拦 `src/shared/**`**：共享层就是给所有 feature 用的，把它算进横向依赖
//     只会产出 200 条没信息量的噪音。ticket §1 明确，脚本也只统计跨 `<A> → <B>` 且 B≠A。
//   - **不做环检测**：那是 source-hygiene 的活儿。本单只回答"这条边该不该存在"。
//   - **发现角度不限于 import 语句**：静态 `from` / 副作用 `import "./x"` /
//     转发 `export ... from` / 动态 `import()`（含 React.lazy）全都要抓，
//     少一种写法就有一条绕过去的路。
//
// 为什么**不擦注释再匹配**（与 P7-1/2 相反）：这里提取的目标是被引号包住的相对路径，
// 注释里几乎不会出现；而擦注释那条路上最大的坑是「URL 里的 `//` 把整行抹掉造成假绿」。
// 权衡下来收益极小、风险不小，所以直接读原文——行号还准，被注释掉的 import 也仍然算
// 一条引用（这也符合"先注释掉、明天还要加回来"时的直觉）。
//
// 语义：
//   - 新方向（不在白名单） → 红：`--update --reason "为什么 X 要用 Y 的东西"` 登记后转绿。
//   - 白名单里记的方向已不存在（stale）→ 红：逼账目追上代码，避免白名单越滚越大。
//   - `--update` 时**保留已存在方向的旧 reason**，只把新方向标注成本次的 reason ——
//     否则每次更新都会把 24 条历史理由覆盖成同一句，追不到当初登记那一笔的为什么。
//
// 用法：
//   node scripts/verify/dependency-direction-check.mjs                 # 检查（人读 JSON）
//   node scripts/verify/dependency-direction-check.mjs --json          # 单行 JSON（run-all 用）
//   node scripts/verify/dependency-direction-check.mjs --update --reason "原因"
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FEATURES_DIR = path.join(ROOT, "src", "features");
// 基线与本仓其余九份 *-baseline.json 同处 scripts/verify/（`baselines/` 历来只放 V11 快照目录）。
const BASELINE = path.join(ROOT, "scripts", "verify", "dependency-direction-baseline.json");

const UPDATE = process.argv.includes("--update");
const AS_JSON = process.argv.includes("--json");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

/** 绝对路径 → 仓库相对路径（统一正斜杠，跨 Windows/Linux 都能比对）。 */
const rel = (absolute) => path.relative(ROOT, absolute).replace(/\\/g, "/");

/** `src/features/<name>/…` → name；不在 features 下返回 null。 */
function featureOf(relativePath) {
  const match = /^src\/features\/([^/]+)\//.exec(relativePath);
  return match ? match[1] : null;
}

/** 收集目录树下所有 .js / .jsx 文件（绝对路径）。 */
function collectSources(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(js|jsx)$/.test(entry.name)) out.push(full);
    }
  }
  return out;
}

/** 抽出这个文件发出的所有相对说明符（静态 / 副作用 / 转发 / 动态 import）。 */
function specifiersOf(source) {
  const specs = [];
  for (const m of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of source.matchAll(/^\s*import\s*["']([^"']+)["']/gm)) specs.push(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  return specs.filter((spec) => spec.startsWith(".")); // 裸包名（react / lucide-react）不是本单对象
}

/** 说明符 → 真实文件（绝对路径）；解析不到返回 null。 */
function resolveSpecifier(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, path.join(base, "index.js")]) {
    try { if (statSync(candidate).isFile()) return candidate; } catch { /* 继续试下一种后缀 */ }
  }
  return null;
}

// ---------------------------------------------------------------- 解析依赖图
const sourceFiles = collectSources(FEATURES_DIR).sort((a, b) => rel(a).localeCompare(rel(b)));
/** key = "from → to"；value = { from, to, edges:Set<"fileA → fileB"> } */
const directions = new Map();
let unresolved = [];
let sharedRefs = 0;

for (const file of sourceFiles) {
  const fromPath = rel(file);
  const fromFeature = featureOf(fromPath);
  if (!fromFeature) continue; // README.md 之类已在 collectSources 过滤；这里是防御
  const source = readFileSync(file, "utf8");
  for (const spec of specifiersOf(source)) {
    const target = resolveSpecifier(file, spec);
    if (!target) { unresolved.push(`${fromPath} → ${spec}`); continue; }
    const toPath = rel(target);
    const toFeature = featureOf(toPath);
    // 共享层 / src 根 / features 外部：都不是横向依赖，不进白名单口径
    if (!toFeature) { if (toPath.startsWith("src/shared/")) sharedRefs += 1; continue; }
    if (toFeature === fromFeature) continue; // 板块内部调用，随它去
    const key = `${fromFeature} → ${toFeature}`;
    const bucket = directions.get(key) ?? { from: fromFeature, to: toFeature, edges: new Set() };
    bucket.edges.add(`${fromPath} → ${toPath}`);
    directions.set(key, bucket);
  }
}

const directionList = [...directions.values()]
  .map((item) => ({
    from: item.from,
    to: item.to,
    refs: item.edges.size,
    sample: [...item.edges].sort((a, b) => a.localeCompare(b))[0],
    edges: [...item.edges].sort((a, b) => a.localeCompare(b)),
  }))
  .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
const keyOf = (item) => `${item.from} → ${item.to}`;

// ---------------------------------------------------------------- 写白名单
if (UPDATE) {
  if (!REASON) {
    console.error("[dependency-direction] 登记必须写理由：--update --reason \"为什么 X 要依赖 Y\"");
    console.error("  新方向会带上这个理由落盘；已经存在的方向保留当年登记的理由不动。");
    process.exit(1);
  }
  const previous = new Map();
  if (existsSync(BASELINE)) {
    for (const item of JSON.parse(readFileSync(BASELINE, "utf8")).allowed || []) {
      previous.set(`${item.from} → ${item.to}`, item.reason);
    }
  }
  const allowed = directionList.map((item) => ({
    from: item.from,
    to: item.to,
    reason: previous.get(keyOf(item)) ?? REASON, // 存量保留旧理由，新方向用本次理由
    refs: item.refs,
    sample: item.sample,
  }));
  const payload = {
    generatedAt: new Date().toISOString().slice(0, 10),
    reason: REASON,
    allowed,
    metrics: {
      featureFiles: sourceFiles.length,
      directions: allowed.length,
      crossFeatureRefs: directionList.reduce((acc, item) => acc + item.refs, 0),
      sharedRefs,
      unresolved: unresolved.length,
    },
  };
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const fresh = allowed.filter((item) => !previous.has(`${item.from} → ${item.to}`));
  console.log(`[dependency-direction] 白名单已写入：${allowed.length} 个方向（其中新增 ${fresh.length} 个）`);
  for (const item of fresh) console.log(`  + ${keyOf(item)}（${item.refs} 条）reason: ${item.reason}`);
  if (previous.size > 0) {
    const gone = [...previous.keys()].filter((key) => !directions.has(key));
    for (const key of gone) console.log(`  - 已划掉不存在了的旧方向 ${key}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- 比对白名单
if (!existsSync(BASELINE)) {
  console.error(`[dependency-direction] 找不到白名单 ${path.relative(ROOT, BASELINE)}`);
  console.error("  首次接入请跑：node scripts/verify/dependency-direction-check.mjs --update --reason \"P7-5 引入时存量登记\"");
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const allowedMap = new Map((baseline.allowed || []).map((item) => [`${item.from} → ${item.to}`, item]));

const violations = directionList
  .filter((item) => !allowedMap.has(keyOf(item)))
  .sort((a, b) => b.refs - a.refs)
  .map((item) => ({
    direction: keyOf(item),
    refs: item.refs,
    sample: item.sample,
    hint: `新方向：要么把它拆成 src/shared 的公共能力，要么 --update --reason 说明为什么 ${item.from} 必须用 ${item.to} 内部的东西`,
  }));

const stale = [...allowedMap.keys()]
  .filter((key) => !directions.has(key))
  .sort((a, b) => a.localeCompare(b))
  .map((key) => ({
    direction: key,
    recordedReason: allowedMap.get(key).reason,
    hint: "白名单里记的方向在代码里已经找不到了：跑 --update 把这条划掉（别让白名单只增不减）",
  }));

const ok = violations.length === 0 && stale.length === 0;
const FAIL_NOTE = violations.length && stale.length
  ? `${violations.length} 个越权方向 + ${stale.length} 条白名单陈旧`
  : violations.length
    ? `${violations.length} 个越权方向（不在白名单里）`
    : `${stale.length} 条白名单陈旧（方向已消失）`;

const report = {
  ok,
  scannedFiles: sourceFiles.length,
  directionCount: directionList.length,
  crossFeatureRefs: directionList.reduce((acc, item) => acc + item.refs, 0),
  // 共享层引用数：不算横向依赖，只用来证明"指向 shared 的新引用不会被误伤"
  sharedRefs,
  unresolvedCount: unresolved.length,
  unresolved: unresolved.slice(0, 5),
  violations,
  stale,
  topDirections: directionList
    .slice()
    .sort((a, b) => b.refs - a.refs)
    .slice(0, 8)
    .map((item) => ({ direction: keyOf(item), refs: item.refs })),
  allowedCount: allowedMap.size,
  failureCount: violations.length + stale.length,
  total: directionList.length + allowedMap.size,
  passed: directionList.length - violations.length,
  baselineGeneratedAt: baseline.generatedAt,
  baselineReason: baseline.reason,
  note: ok
    ? `${directionList.length} 个跨板块方向全部在白名单内（另有 ${sharedRefs} 条指向 src/shared，共享层不计）`
    : FAIL_NOTE,
};

if (AS_JSON) console.log(JSON.stringify(report));
else console.log(JSON.stringify(report, null, 2));

process.exit(ok ? 0 : 1);
