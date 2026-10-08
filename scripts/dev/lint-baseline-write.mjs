// 用进程内 ESLint API 重算 lint 棘轮基线并写盘（绕开本机 spawnSync EBUSY 限制）。
//
// 为什么单开一个脚本而不是给 lint-ratchet-mirror.mjs 加开关：
//   mirror 的定位是「只读比对」，任何执行者都能放心跑；写基线是统筹的活，
//   把写能力和读能力分文件放，手滑 `--update` 的成本才高到拦得住。
//
// 为什么不能用 npm run lint:baseline（lint-ratchet-check.mjs --update）：
//   它内部走 spawnSync(eslint)，在本机恒 EBUSY → run.stdout 为空 → 计数全 0
//   → **会把一条全 0 的基线写进去，棘轮当场失能且看起来是绿的**。
//
// 安全闸（任一不满足即拒绝写盘，避免把错误状态烤进基线）：
//   1. 当前 errors 必须为 0（棘轮只该记 warning，error 必须先修）
//   2. src/ 下不能有未跟踪文件（防止把半成品当成新基线，同 019 划账的时序纪律）
//   3. 必须由命令行显式给出 --write 且附带 --reason
//
// 用法：node scripts/dev/lint-baseline-write.mjs --write --reason "理由写这里"
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "verify", "lint-baseline.json");

const argv = process.argv.slice(2);
const WRITE = argv.includes("--write");
const reason = (() => {
  const i = argv.indexOf("--reason");
  return i >= 0 ? argv.slice(i + 1).join(" ") : "";
})();

const apiUrl = pathToFileURL(path.join(ROOT, "node_modules", "eslint", "lib", "api.js")).href;
const { ESLint } = await import(apiUrl);

const eslint = new ESLint({ cwd: ROOT });
const report = await eslint.lintFiles(["."]);
const eslintVersion = JSON.parse(readFileSync(path.join(ROOT, "node_modules", "eslint", "package.json"), "utf8")).version;

function countsOf(entries) {
  const counts = {};
  let errors = 0;
  let warnings = 0;
  for (const file of entries) {
    const rel = path.relative(ROOT, file.filePath).replace(/\\/g, "/");
    for (const message of file.messages) {
      const key = `${rel}|${message.ruleId || "(fatal)"}`;
      counts[key] = (counts[key] || 0) + 1;
      if (message.severity === 2) errors += 1;
      else warnings += 1;
    }
  }
  return { counts, errors, warnings };
}

const current = countsOf(report);
const oldBaseline = JSON.parse(readFileSync(BASELINE, "utf8"));

console.log(`当前：errors=${current.errors} warnings=${current.warnings} total=${current.errors + current.warnings}`);
console.log(`旧基线：generatedAt=${oldBaseline.generatedAt} ${JSON.stringify(oldBaseline.totals)}`);

// ---- 安全闸 ----
const blockers = [];
if (current.errors > 0) blockers.push(`当前有 ${current.errors} 条 error，必须先修掉再划账`);
// ⚠️ 本机的 spawnSync 恒 EBUSY ⇒ 这道闸可能探不出来。探不出来时必须明说，
// 不能当成「没有未跟踪文件」放行（假绿比没有闸更危险）。
const untracked = spawnSync("git", ["status", "--porcelain", "--", "src/"], { cwd: ROOT, encoding: "utf8" });
if (untracked.error) {
  if (!argv.includes("--untracked-verified")) {
    blockers.push(
      `git 探针不可用（spawnSync ${untracked.error.code}）⇒ 「src/ 无未跟踪文件」这道闸本次没生效。` +
      `请先在 shell 里跑 git status --short -- src/ 确认为空，再加 --untracked-verified 表示已人工确认`
    );
  } else {
    console.log(`[注意] git 探针不可用（spawnSync ${untracked.error.code}），已由人工确认 src/ 无未跟踪文件`);
  }
} else {
  const untrackedSrc = (untracked.stdout || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (untrackedSrc.length > 0) {
    blockers.push(`src/ 下有 ${untrackedSrc.length} 个未跟踪文件（划账会把半成品烤进基线）：${untrackedSrc.join(" | ")}`);
  }
}
if (!WRITE) blockers.push("没有显式给出 --write，本次只做预演（不写盘）");
if (!reason) blockers.push("没有给出 --reason，新基线必须写明为什么这批存量是合法的");

if (blockers.length > 0) {
  console.log("\n[拒绝/预演] 未写盘，原因：");
  blockers.forEach((b) => console.log(`  - ${b}`));
  console.log("\n（下面是本次将要写盘的 diff 预览）");
} else {
  console.log("\n[写盘] 安全闸全部通过");
}

const newCounts = Object.fromEntries(Object.entries(current.counts).sort(([a], [b]) => a.localeCompare(b)));
const keys = new Set([...Object.keys(oldBaseline.counts), ...Object.keys(current.counts)]);
console.log("\n=== 基线 diff（旧 -> 新）===");
[...keys].sort().forEach((k) => {
  const before = oldBaseline.counts[k] ?? 0;
  const now = current.counts[k] ?? 0;
  if (before !== now) console.log(`  ${before} -> ${now}   ${k}`);
});
console.log(`  未列出的 key 均不变（${[...keys].filter((k) => (oldBaseline.counts[k] ?? 0) === (current.counts[k] ?? 0)).length} 个）`);

if (blockers.length > 0) process.exit(1);

const note = [
  // ⚠️ 上半句以「npm run lint:baseline」结尾、不带句号，拼接处必须补句号，
  // 否则会连成 "...lint:baseline2026-10-06 由统筹划账..." 这种糊在一起的长句。
  "ESLint 棘轮基线：按「文件|规则」记条数，只用来拦新增问题。刷新方式：npm run lint:baseline。",
  `${new Date().toISOString().slice(0, 10)} 由统筹划账：${reason}`
].join("");

writeFileSync(BASELINE, `${JSON.stringify({
  note,
  generatedAt: new Date().toISOString().slice(0, 10),
  eslintVersion,
  totals: { errors: current.errors, warnings: current.warnings, total: current.errors + current.warnings },
  counts: newCounts
}, null, 2)}\n`, "utf8");
console.log(`\n[lint-baseline-write] 已写盘：error ${current.errors} / warning ${current.warnings}（${Object.keys(newCounts).length} 个 文件|规则 分组）`);
