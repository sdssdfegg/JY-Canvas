// 硬编码颜色棘轮自测护栏（V180 / UI-A6 · T1-b3 前置段）
//
// 为什么存在：hardcoded-color-check.mjs 的 stale 判定曾有死锁——某 CSS 文件 hex 收敛到 0 后
// 跑 --update 把基线也写成 0，下次检查 before===0 && now===0 仍判 stale（旧判定只看 now===0），
// 再 --update 还是 0，永久红灯无解。V180 把判定改成 `before > 0 && now === 0`，与
// legacy-button-ratchet-check.mjs 同口径。本脚本在 mkdtemp 临时目录构造 6 个场景，复制「修复后的
// 真实脚本」后用 spawnSync 跑它，断言 exit code 与 JSON report 字段，结束 rmSync 清理。
//
// 零依赖：只 import Node 内置；不 import 任何服务端模块；不在真实 src/ 写 fixture；不跑 --update。
// 真实仓库运行时本脚本不碰 hardcoded-color-baseline.json 的数字、不碰任何 src/**。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { spawnSync } from "node:child_process";

const VERIFY_DIR = path.dirname(path.resolve(process.argv[1]));
const REAL_SCRIPT = path.join(VERIFY_DIR, "hardcoded-color-check.mjs");
const NODE = process.execPath;

// 生成含 n 个独立 3 位 hex 的 CSS（每个 hex 后不紧跟十六进制字符，确保 HEX_RE 各取一个）。
function cssWithHex(n) {
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(`  --c${i}: #${String(i).padStart(3, "0")};`);
  return `:root {\n${lines.join("\n")}\n}\n`;
}
const CSS_NO_HEX = `:root {\n  color: red;\n}\n`;

function buildTree(tmp, cssFiles, baselineFiles) {
  for (const [rel, content] of Object.entries(cssFiles)) {
    const full = path.join(tmp, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  const baseDir = path.join(tmp, "scripts", "verify");
  mkdirSync(baseDir, { recursive: true });
  writeFileSync(
    path.join(baseDir, "hardcoded-color-baseline.json"),
    JSON.stringify(
      { note: "V180 selftest fixture", generatedAt: "2026-11-07", files: baselineFiles },
      null,
      2
    ) + "\n",
    "utf8"
  );
  // 复制修复后的真实脚本（零外部依赖，单文件即可运行）。
  writeFileSync(path.join(baseDir, "hardcoded-color-check.mjs"), readFileSync(REAL_SCRIPT, "utf8"), "utf8");
}

function runScenario(cssFiles, baselineFiles) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "hcc-selftest-"));
  try {
    buildTree(tmp, cssFiles, baselineFiles);
    const r = spawnSync(NODE, ["scripts/verify/hardcoded-color-check.mjs"], {
      cwd: tmp,
      encoding: "utf8",
    });
    let report = null;
    if (r.stdout) {
      try {
        report = JSON.parse(r.stdout);
      } catch {
        report = null;
      }
    }
    return { status: r.status, report };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// 6 个场景（见 V180 执行单 §4.1）。每个 expect 返回 [pass, detail]。
const SCENARIOS = [
  {
    name: "A 正常",
    css: { "src/a.css": cssWithHex(3) },
    base: { "src/a.css": 3 },
    expect: (rep, st) =>
      rep && rep.ok === true && st === 0 && Array.isArray(rep.stale) && rep.stale.length === 0
        ? [true, `ok=${rep.ok} exit=${st} stale=${rep.stale.length}`]
        : [false, `ok=${rep?.ok} exit=${st} stale=${rep?.stale?.length}`],
  },
  {
    name: "B 归零未刷(逼刷新须保留)",
    css: { "src/a.css": CSS_NO_HEX },
    base: { "src/a.css": 3 },
    expect: (rep, st) =>
      st === 1 && rep && Array.isArray(rep.stale) && rep.stale.length === 1
        ? [true, `exit=${st} stale=${rep.stale.length}(逼刷新语义保留)`]
        : [false, `exit=${st} stale=${rep?.stale?.length}`],
  },
  {
    name: "C 归零已刷(核心修复点)",
    css: { "src/a.css": CSS_NO_HEX },
    base: { "src/a.css": 0 },
    expect: (rep, st) =>
      rep && rep.ok === true && st === 0 && Array.isArray(rep.stale) && rep.stale.length === 0
        ? [true, `ok=${rep.ok} exit=${st} stale=${rep.stale.length}(修复前必判红)`]
        : [false, `ok=${rep?.ok} exit=${st} stale=${rep?.stale?.length}`],
  },
  {
    name: "D 新增 hex",
    css: { "src/a.css": cssWithHex(5) },
    base: { "src/a.css": 2 },
    expect: (rep, st) =>
      st === 1 && rep && Array.isArray(rep.regressions) && rep.regressions.some((x) => x.kind === "added-hex")
        ? [true, `exit=${st} regressions=${rep.regressions.map((x) => x.kind).join(",")}`]
        : [false, `exit=${st} regressions=${rep?.regressions?.map((x) => x.kind).join(",")}`],
  },
  {
    name: "E 归零后又长回来",
    css: { "src/a.css": cssWithHex(2) },
    base: { "src/a.css": 0 },
    expect: (rep, st) =>
      st === 1 && rep && Array.isArray(rep.regressions) && rep.regressions.some((x) => x.kind === "added-hex")
        ? [true, `exit=${st} regressions=${rep.regressions.map((x) => x.kind).join(",")}(棘轮仍有效)`]
        : [false, `exit=${st} regressions=${rep?.regressions?.map((x) => x.kind).join(",")}`],
  },
  {
    name: "F 新文件带 hex",
    css: { "src/a.css": CSS_NO_HEX, "src/b.css": cssWithHex(2) },
    base: { "src/a.css": 0 },
    expect: (rep, st) =>
      st === 1 && rep && Array.isArray(rep.regressions) && rep.regressions.some((x) => x.kind === "new-file")
        ? [true, `exit=${st} regressions=${rep.regressions.map((x) => x.kind).join(",")}`]
        : [false, `exit=${st} regressions=${rep?.regressions?.map((x) => x.kind).join(",")}`],
  },
];

let allPass = true;
const summary = [];
for (const sc of SCENARIOS) {
  const { status, report } = runScenario(sc.css, sc.base);
  const [pass, detail] = sc.expect(report, status);
  if (!pass) allPass = false;
  summary.push(`  [${pass ? "PASS" : "FAIL"}] ${sc.name}: ${detail}`);
}

console.log("[hardcoded-color-ratchet-selftest] 6 场景自测：");
console.log(summary.join("\n"));
console.log(allPass ? "ALL PASS" : "FAILED");
process.exit(allPass ? 0 : 1);
