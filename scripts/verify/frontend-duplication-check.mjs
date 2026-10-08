// 前端跨文件同名「顶层函数」棘轮门禁（V11-RF-019 交付物）。
//
// 与服务端 server-duplication-check.mjs 同款思路，但针对【前端函数】：
// 断言「顶层函数声明」在整个 src/ 里只允许出现在 1 个文件——
// 跨文件同名 = 漂移源（复制一份、两份早晚分叉）。活例子：
// `canvasToBlob` 有 4 份，`ReferenceThumbTray` 两份实现已分叉并引发过真实 bug。
//
// ── 边界（名字容易被误读，写清楚）──────────────────────────────
//   ✅ 本门禁覆盖：camelCase / snake_case 的**顶层函数**（function 与 const 箭头函数都收）。
//   ⚠️ PascalCase React 组件由既有 shared-ui-duplication-check.mjs 覆盖。
//      两者**允许重叠**（例如 ReferenceThumbTray 两边都会命中），重叠不代表冲突：
//      它既是组件也是函数声明，两个门禁从不同角度记账而已。
//   ❌ 本门禁不做任何自动修复 —— "把 4 份 canvasToBlob 收成 1 份"属
//      **前端专项阶段 B**，是另一批单，需真机冒烟，不在本单范围内。
//
// ── 为什么是棘轮 ──────────────────────────────────────────────
//   存量 22 条记账、允许存在，但**新增即失败**；抽到共享模块消掉后跑 --update 划掉。
//
// ── 🔴 已知「选择性失明」（必须写在门禁头部，否则等于又一次失明）────────
//   §0.9 第 11 / 17 条：凡是过滤，都要写清它过滤掉了什么。
//   本门禁启用 MIN_NAME_LENGTH = 4（见 lib/def-patterns.mjs），即：
//     **名字长度 1–3 字符的顶层函数不进视野**，它们的跨文件同名既不计数也不报红。
//   启用原因：src/ 里混着大量极短名的局部/工具函数（done / map / foo 之类），
//     不过滤会淹没真实账目。
//   代价（明确承认）：**前端的覆盖率弱于服务端** —— 服务端 duplication 门禁
//     刻意不启用该过滤（026 刚把视野从 51 个函数扩到 216 个，再按名长过滤就是往回缩）。
//   结论：本门禁的「全绿」=「≥4 字符的顶层函数没有新增跨文件同名」，
//     **不等于「src/ 里没有短名重复」**。若将来要收紧这一条，需单独开工单重测基线。
//
// ── 🆕 advisory 档：改名克隆 / 结构克隆（V11-RF-046）─────────────
//   019 是**按名字比对**的，天然看不见「逻辑相同、名字不同」的克隆（§0.9 第 19 条）；
//   RF-032 实测 62 组克隆里 53 组是组件内缩进函数 ⇒ 019 一条也看不见。
//   所以本门禁新增一档 advisory：用「函数体 token 序列 + 两级归一化哈希」把**组件内函数**也纳进来。
//
//   🔴 **只报不记账**（硬约束）：
//     · 不参与 `ok` 判定、不写进 `duplicateCount`、不影响棘轮、不进基线；
//     · 即使本档扫描本身抛异常，也只降级为 advisory 的 error 字段，**不允许**把 019 判红；
//     · 判定字段（`ok` / `duplicateCount` / `regressions` / `scopeDrift`）语义一律不变。
//
//   🔴 **L1 相同 ≠ 语义等价**（必须写进报告，防止后人拿它当"可合并"依据）：
//     只比 token 形状，不比标识符指向什么。实证反例：`loadPromptCategories` 两侧 L1 完全相同，
//     但兜底常量不同源（main 写死 5 项 vs outfit 动态聚合）⇒ 自动合并会在这里翻车。
//     本档输出**只是线索**，能否合并必须人工判。
//
//   判据与已知盲区全文见 scripts/verify/lib/rename-clone.mjs 头注释。
//
// ── 🔴 口径自检（本单的关键设计）─────────────────────────────
//   基线里记着 scanScope（root / extensions / excludes / fileCount / files[]）。
//   运行时比对 **fileCount 与 excludes**，不一致直接判红并报「扫描范围漂移」。
//   理由：98→104→22 这几次数字反复，根因都是**口径漂移静默改变了结论**
//   （初版漏扫 src/shared/；后来发现旧正则未锚定行首，混入了 82 个缩进的内层函数）。
//   门禁必须让口径变化**当场可见**，而不是悄悄改变账目。
//   files[] 只作留档与人工排查用（新增前端文件属正常事，不必每次都炸）。
//
// 用法：
//   node scripts/verify/frontend-duplication-check.mjs            # 检查
//   node scripts/verify/frontend-duplication-check.mjs --update   # 刷新基线（去重后执行）
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  FRONTEND_SCAN_SCOPE,
  listFrontendSourceFiles,
  collectTopLevelDefs,
  crossFileDuplicates,
} from "./lib/frontend-sources.mjs";
import { scanRenameClones } from "./lib/rename-clone.mjs";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "verify", "frontend-duplication-baseline.json");
const UPDATE = process.argv.includes("--update");

// ---------------------------------------------------------------- 收集
const files = listFrontendSourceFiles();
const { found, intraFile, totalDefs } = collectTopLevelDefs(files);
const duplicates = crossFileDuplicates(found);

// 首行打印扫描范围：口径一漂，人一眼就能看出来
console.log(
  `[frontend-dup-ratchet] 扫描范围 root=${FRONTEND_SCAN_SCOPE.root} ` +
    `ext=${FRONTEND_SCAN_SCOPE.extensions.join(",")} ` +
    `excludes=${FRONTEND_SCAN_SCOPE.excludes.join(",")} ` +
    `fileCount=${files.length}`
);

// ---------------------------------------------------------------- 🆕 advisory 档：改名/结构克隆（RF-046 · 只报不记账）
// 失败也不许影响判定：advisory 内部出错只降级成 error 字段，ok/duplicateCount 一律不受影响。
const ADVISORY_GROUP_LIMIT = 50;
let renameCloneAdvisory;
try {
  const scan = scanRenameClones(files);
  const l1 = scan.groups.filter((g) => g.level === "L1");
  const l2 = scan.groups.filter((g) => g.level === "L2");
  renameCloneAdvisory = {
    advisoryOnly: true,
    affectsOk: false,
    judge:
      "函数体 token 序列 + 两级归一化哈希（L1 保留字面量 = 逐 token 等价；L2 抹字面量 = 结构等价）" +
      "，含组件内缩进函数；跨文件才成组，minTokens=" + scan.minTokens,
    warning:
      "L1 相同 ≠ 语义等价：只比 token 形状，不比标识符指向什么。实证反例 loadPromptCategories " +
      "两侧 L1 完全相同但兜底常量不同源（main 写死 5 项 vs outfit 动态聚合）⇒ 自动合并会在这里翻车。" +
      "本档只是线索，能否合并必须人工判。",
    scannedFiles: scan.scannedFiles,
    scannedFunctions: scan.scannedFunctions,
    minTokens: scan.minTokens,
    elapsedMs: scan.elapsedMs,
    l1GroupCount: l1.length,
    l2GroupCount: l2.length,
    groupCount: scan.groups.length,
    renamedGroupCount: scan.groups.filter((g) => g.renamed).length,
    groups: scan.groups.slice(0, ADVISORY_GROUP_LIMIT),
    truncated: scan.groups.length > ADVISORY_GROUP_LIMIT,
    note: "只报不记账：不参与 ok、不写进 duplicateCount、不影响棘轮、不写进基线。",
  };
} catch (error) {
  renameCloneAdvisory = {
    advisoryOnly: true,
    affectsOk: false,
    error: String(error?.message || error),
    note: "advisory 扫描失败已降级，不影响本门禁的判定字段。",
  };
}

// 报告头：基数与判据一眼可见（§0.9 第 13 条：给数字必须同时给判据与扫描范围）
if (renameCloneAdvisory.error) {
  console.log(
    `[rename-clone advisory] 扫描失败，已降级（只报不记账，不影响判定）：${renameCloneAdvisory.error}`
  );
} else {
  console.log(
    `[rename-clone advisory] 只报不记账 | 扫描文件=${renameCloneAdvisory.scannedFiles} ` +
      `抽取函数=${renameCloneAdvisory.scannedFunctions}（含组件内） ` +
      `L1组=${renameCloneAdvisory.l1GroupCount} L2组=${renameCloneAdvisory.l2GroupCount} ` +
      `合计=${renameCloneAdvisory.groupCount}（改名=${renameCloneAdvisory.renamedGroupCount}） ` +
      `耗时=${renameCloneAdvisory.elapsedMs}ms`
  );
  console.log(`[rename-clone advisory] 判据：${renameCloneAdvisory.judge}`);
  console.log(`[rename-clone advisory] ⚠️ ${renameCloneAdvisory.warning}`);
}

function sameList(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

const currentMap = Object.fromEntries(duplicates.map((d) => [d.name, d.files]));
const locationsOf = (name) => duplicates.find((d) => d.name === name)?.locations || [];

const scanScope = {
  ...FRONTEND_SCAN_SCOPE,
  fileCount: files.length,
  files,
};

const payload = {
  note:
    "前端跨文件同名顶层函数基线：记录当前已存在的跨文件同名顶层函数，只用来拦「新增」。注意本基线按" +
    "「行首顶层」判据生成（缩进的内层函数不纳入），与评估报告初版那 104 条（未锚定行首、混入内层函数）" +
    "不是同一口径。抽到 src/shared/ 消掉后跑一次 --update 把它从账单里划掉。" +
    "【已知选择性失明 · §0.9 第 11/17 条】本基线启用 MIN_NAME_LENGTH=4 过滤：" +
    "名字长度 1–3 字符的顶层函数不进视野，其跨文件同名既不计数也不报红；" +
    "⇒ 「基线条数」与「门禁全绿」都只覆盖 ≥4 字符的函数，前端覆盖率弱于服务端" +
    "（服务端 duplication 门禁刻意不启用该过滤）。判据见 scripts/verify/lib/def-patterns.mjs。",
  generatedAt: new Date().toISOString().slice(0, 10),
  scanScope,
  duplicates: currentMap,
};

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[frontend-dup-ratchet] 基线已刷新：${Object.keys(currentMap).length} 个跨文件同名顶层函数`);
  for (const d of duplicates) console.log(`  ${d.name} -> ${d.files.join(" | ")}`);
  process.exit(0);
}

let baseline = null;
if (existsSync(BASELINE)) {
  baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
} else {
  console.error("[frontend-dup-ratchet] 找不到基线 scripts/verify/frontend-duplication-baseline.json");
  console.error("  首次接入请跑：node scripts/verify/frontend-duplication-check.mjs --update");
  process.exit(1);
}

// ---------------------------------------------------------------- 🔴 口径自检
const scopeBefore = baseline.scanScope;
if (scopeBefore) {
  const drift = [];
  if (scopeBefore.fileCount !== files.length) {
    drift.push(`文件数 ${scopeBefore.fileCount} → ${files.length}`);
  }
  if (!sameList(scopeBefore.excludes, FRONTEND_SCAN_SCOPE.excludes)) {
    drift.push(`排除项 [${scopeBefore.excludes.join(",")}] → [${FRONTEND_SCAN_SCOPE.excludes.join(",")}]`);
  }
  if (scopeBefore.root !== FRONTEND_SCAN_SCOPE.root) {
    drift.push(`根目录 ${scopeBefore.root} → ${FRONTEND_SCAN_SCOPE.root}`);
  }
  if (drift.length > 0) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          scopeDrift: {
            kind: "scan-scope",
            detail: drift,
            hint: "扫描范围漂移：基线口径与当前口径已不一致，结论不可比。请复核新增/移除的前端文件，确认后跑 --update 重建基线。",
          },
          scanScope,
          baselineScope: scopeBefore,
          duplicateCount: duplicates.length,
          note: `扫描范围漂移：${drift.join("；")}`,
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------- 棘轮比对
const regressions = [];
const improved = [];

for (const [name, filesNow] of Object.entries(currentMap)) {
  const before = baseline.duplicates?.[name];
  if (before === undefined) {
    regressions.push({
      name,
      kind: "new",
      files: filesNow,
      locations: locationsOf(name),
      hint: "新增的跨文件同名顶层函数，应抽到 src/shared/ 而不是复制一份",
    });
    continue;
  }
  const added = filesNow.filter((f) => !before.includes(f));
  if (added.length > 0) {
    regressions.push({
      name,
      kind: "spread",
      files: filesNow,
      added,
      locations: locationsOf(name),
      hint: "原有同名又扩散到新文件",
    });
    continue;
  }
  if (!sameList(filesNow, before)) improved.push({ name, before, now: filesNow });
}
for (const name of Object.keys(baseline.duplicates || {})) {
  if (!(name in currentMap)) improved.push({ name, before: baseline.duplicates[name], now: [] });
}

const ok = regressions.length === 0;

console.log(
  JSON.stringify(
    {
      ok,
      scanScope,
      scannedFiles: files.length,
      scannedFunctions: totalDefs,
      duplicateCount: duplicates.length,
      regressions,
      improved,
      intraFileDuplicates: intraFile,
      duplicates,
      // 🆕 只报不记账（RF-046）：不参与 ok、不写进基线、不影响棘轮
      renameCloneAdvisory,
      baselineGeneratedAt: baseline.generatedAt,
      note: ok
        ? intraFile.length
          ? `没有新增跨文件同名函数；但发现 ${intraFile.length} 处同文件内重名（见 intraFileDuplicates），属异常但不拦`
          : "没有新增跨文件同名函数"
        : `新增了 ${regressions.length} 处跨文件同名函数（已点名文件:行号），请改为抽到 src/shared/ 后再跑；确实要接受就 --update 并说明原因`,
    },
    null,
    2
  )
);

process.exit(ok ? 0 : 1);
