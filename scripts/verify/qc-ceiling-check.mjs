// 质检上限门禁（V202 §3 B4 / §7-7）：断言 B4 质量审查的「一次定向修正 + 再审查封顶」硬约束。
//
// 检查对象：server/features/detail-studio/planning/qc-review.js
//   1) MAX_AUTO_FIX 常量值必须为 1（验收 §7-7：一次定向修正 + 再审查封顶）。
//   2) 质检循环以 MAX_AUTO_FIX 为界（防无限循环；改大常量即失效，故同时扫常量值）。
//   3) 模型调用（callQcModel）仅 review + re-review 两处，受循环约束（≤2 次，绝不第 3 次）。
//   4) 无显式无限循环（while(true)/for(;;)）。
//
// 负向对照（防锚点搬家变假绿）：文件确实出现 postChatCompletion（否则扫描区域不可信）。
//
// 用法：node scripts/verify/qc-ceiling-check.mjs [--json]

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");

const QC_FILE = path.join(ROOT, "server", "features", "detail-studio", "planning", "qc-review.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

if (!existsSync(QC_FILE)) {
  check("qc-review.js 存在", false, "文件缺失：" + QC_FILE);
} else {
  const text = readFileSync(QC_FILE, "utf8");

  // 1) MAX_AUTO_FIX 常量值必须为 1。
  const m = text.match(/MAX_AUTO_FIX\s*=\s*(\d+)/);
  check("MAX_AUTO_FIX 常量值为 1", m && m[1] === "1", m ? "MAX_AUTO_FIX=" + m[1] : "未找到 MAX_AUTO_FIX");

  // 2) 质检循环以 MAX_AUTO_FIX 为界（防无限循环）。
  check("质检循环以 MAX_AUTO_FIX 为界（无无限循环）",
    /safetyFixes\s*<\s*MAX_AUTO_FIX/.test(text),
    text.includes("MAX_AUTO_FIX") ? "找到以 MAX_AUTO_FIX 为界的循环" : "未找到受 MAX_AUTO_FIX 约束的循环");

  // 3) 模型调用仅 review + re-review 两处，受循环约束（≤2 次）。
  const awaitCount = (text.match(/await\s+callQcModel/g) || []).length;
  check("callQcModel 调用受循环约束（恰好 review + re-review ≤2）",
    awaitCount === 2, "await callQcModel 出现 " + awaitCount + " 次（应恰好 2：review + re-review）");

  // 4) 无显式无限循环。
  const hasInfinite = /\bwhile\s*\(\s*true\s*\)/.test(text) || /for\s*\(\s*;\s*;\s*\)/.test(text);
  check("无显式无限循环（while(true)/for(;;)）", !hasInfinite, hasInfinite ? "发现无限循环" : "未发现");

  // 负向对照：文件确实调用 postChatCompletion（质检模型调用），否则扫描区域不可信。
  check("负向对照：qc-review.js 存在 postChatCompletion（质检模型调用）",
    text.indexOf("postChatCompletion") >= 0,
    text.indexOf("postChatCompletion") >= 0 ? "存在，扫描可信" : "缺失（质检未接模型）");
}

const failed = results.filter((r) => !r.pass);
if (AS_JSON) {
  console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, entries: results }, null, 2));
} else {
  for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  console.log(`\n[qc-ceiling] ${results.length - failed.length}/${results.length} 通过`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
