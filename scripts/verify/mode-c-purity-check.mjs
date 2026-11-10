// 模式 C 隔离门禁（V202 §4.3 / §7-6）：断言「完整提示词直通」C 路径不经过任何策划/质检/改写节点。
//
// 检查对象：
//   1) server/features/detail-studio/intake/mode-c.js —— 架构隔离关键文件，必须零 import planner / skill / quality / postChatCompletion；
//   2) 路由文件里「模式 C（完整提示词直接生成）intake 端点」区块（parse + freeze 两个 handler）—— 不得出现 postChatCompletion。
//
// 为什么是硬门禁（阈值 0）：C 模式 0 次模型调用的红线一旦被某次重构打破（比如有人把 analyze 链路牵进 C route），
// 就会在用户不知情的情况下给「纯直通」分支加策划/改写，破坏「展示 == 实际」保证。任何命中即判红。
//
// 负向对照（防锚点搬家变假绿）：断言 postChatCompletion 在全路由文件里**确实存在**（analyze/director 用的是 A/B 路径），
// 证明我们的区块扫描不是扫了空区域；若某天全文件都没了 postChatCompletion（说明 A/B 路径被误删），本门禁会反过来判红提示。
//
// 用法：node scripts/verify/mode-c-purity-check.mjs [--json]

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");

const MODE_C_FILE = path.join(ROOT, "server", "features", "detail-studio", "intake", "mode-c.js");
const ROUTES_FILE = path.join(ROOT, "server", "routes", "detail-studio.routes.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// ── 1) mode-c.js 零违规引用（只扫真实 import 语句与调用，排除注释与否定句）──
if (!existsSync(MODE_C_FILE)) {
  check("mode-c.js 存在", false, "文件缺失：" + MODE_C_FILE);
} else {
  const text = readFileSync(MODE_C_FILE, "utf8");
  // 去掉行注释（支持 `//` 整行与行尾注释），避免「不 import planner」这类否定句误判。
  const code = text.split("\n").map((line) => line.replace(/\/\/.*$/, "")).join("\n");
  // 真实 import：import ... from "..." 或 import("...")
  const importSpecifiers = [];
  const importRe = /import\s*(?:[^;]*?\s+from\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = importRe.exec(code)) !== null) {
    importSpecifiers.push(m[1] || m[2]);
  }
  const badImports = importSpecifiers.filter((spec) => /planner|quality|skill|ai-chat-shared/.test(spec));
  const callsPostChat = /postChatCompletion\s*\(/.test(code);
  const hits = [];
  if (badImports.length) hits.push("违规 import：" + badImports.join(", "));
  if (callsPostChat) hits.push("postChatCompletion 调用");
  check("mode-c.js 零 planner/skill/quality/postChatCompletion 引用", hits.length === 0, hits.length ? hits.join("；") : "无命中（已排除注释与否定句）");
}

// ── 2) 路由文件 C 区块零 postChatCompletion ──
if (!existsSync(ROUTES_FILE)) {
  check("detail-studio.routes.js 存在", false, "文件缺失：" + ROUTES_FILE);
} else {
  const full = readFileSync(ROUTES_FILE, "utf8");
  const startMarker = "模式 C（完整提示词直接生成）intake 端点";
  const startIdx = full.indexOf(startMarker);
  const endMarker = "规划批次①";
  const endIdx = full.indexOf(endMarker);
  // 负向对照：全文件里应确实存在 postChatCompletion（A/B 路径使用），否则扫描区域不可信。
  check("负向对照：全路由存在 postChatCompletion（A/B 路径）", full.indexOf("postChatCompletion") >= 0,
    full.indexOf("postChatCompletion") >= 0 ? "存在，区块扫描可信" : "缺失（A/B 路径疑似被误删）");
  if (startIdx >= 0 && endIdx > startIdx) {
    const region = full.slice(startIdx, endIdx);
    const hit = region.indexOf("postChatCompletion") >= 0;
    check("C 区块（parse+freeze）零 postChatCompletion", !hit, hit ? "C 区块出现 postChatCompletion" : "无命中");
  } else {
    check("C 区块定位", false, `startIdx=${startIdx}, endIdx=${endIdx}`);
  }
}

const failed = results.filter((r) => !r.pass);
if (AS_JSON) {
  console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, entries: results }, null, 2));
} else {
  for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  console.log(`\n[mode-c-purity] ${results.length - failed.length}/${results.length} 通过`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
