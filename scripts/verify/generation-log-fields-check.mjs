// generation.jsonl 扩展字段验收（P1-3 交付物，纯进程内、不启动服务、不出图、不扣费）。
//
// 覆盖四件事：
//   1) 脱敏红线（log-fields.md §4 + 封装框架①）：KEY 类字段（apiKey/token/authorization/...）
//      无论顶层还是 detail / detail.payload 嵌套，都必须被 sanitizeLogEntry 剥离；
//   2) 既有的非 KEY 字段（requestId/ok/stage/error 等）必须原样保留，sanitize 是纯兜底、不改正常日志；
//   3) log-fields.md §2 全部新增可选字段在经 sanitize 后完整保留、可 JSON round-trip，
//      且不会被 KEY 正则误伤（无假阳性剥离）；
//   4) 缺失新字段的极小 entry 不会抛错（兼容性规则 2：缺失按「未知」处理）。
//
// 退出码：通过 0 / 失败 1。

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const { sanitizeLogEntry } = await import(
  pathToFileURL(path.join(repoRoot, "server", "core", "generation-logger.js")).href
);

const failures = [];
function assert(cond, label, detail) {
  if (cond) {
    console.log("  ok   " + label);
  } else {
    failures.push({ label, detail });
    console.log("  FAIL " + label + "  =>  " + detail);
  }
}

// log-fields.md §2 新增可选字段全集（顺序无关，逐个断言不被误删即可）
const CONTRACT_FIELDS = [
  "task_id", "attempt_id", "idempotency_key", "failure_tag",
  "model_policy_version",
  "input_asset_id", "input_asset_hash", "input_asset_version",
  "garment_profile_id", "garment_profile_version",
  "mask_asset_id", "mask_version", "mask_strategy",
  "prompt_template_version", "prompt_template_hash",
  "preprocess_version", "postprocess_version", "quality_policy_version",
  "stage_timing_ms", "retry_count",
  "estimated_cost", "actual_cost", "budget_remaining",
  "quality_grade", "quality_dimensions", "quality_confidence",
  "human_feedback", "final_delivered"
];

console.log("[generation-log-fields-check] 仓库根: " + repoRoot);

// ---- 1) KEY 字段被剥离（顶层 / detail / detail.payload 三层） ----
console.log("[1] 脱敏红线：KEY 类字段必须被剥离");
const withKey = {
  requestId: "r1",
  ok: true,
  stage: "local-request-received",
  apiKey: "sk-secret-xxx",
  token: "tok-xxx",
  authorization: "Bearer xxx",
  detail: {
    token: "inner-tok",
    payload: { secret: "s-xxx", task_id: "t1" }
  }
};
const s1 = sanitizeLogEntry(withKey);
assert(!("apiKey" in s1), "剥离顶层 apiKey", JSON.stringify(s1));
assert(!("token" in s1), "剥离顶层 token", JSON.stringify(s1));
assert(!("authorization" in s1), "剥离顶层 authorization", JSON.stringify(s1));
assert(s1.detail && !("token" in s1.detail), "剥离 detail.token", JSON.stringify(s1.detail));
assert(s1.detail && s1.detail.payload && !("secret" in s1.detail.payload), "剥离 detail.payload.secret", JSON.stringify(s1.detail && s1.detail.payload));
assert(s1.detail && s1.detail.payload && s1.detail.payload.task_id === "t1", "保留 detail.payload.task_id", JSON.stringify(s1.detail && s1.detail.payload));

// ---- 2) 既有非 KEY 字段原样保留 ----
console.log("[2] 既有字段不受影响");
assert(s1.requestId === "r1", "保留 requestId", s1.requestId);
assert(s1.ok === true, "保留 ok", String(s1.ok));
assert(s1.stage === "local-request-received", "保留 stage", s1.stage);

// ---- 3) §2 全部字段不被误删 + 可 round-trip ----
console.log("[3] §2 扩展字段完整保留且可 round-trip");
const fullEntry = {};
for (const f of CONTRACT_FIELDS) fullEntry[f] = `v_${f}`;
const s2 = sanitizeLogEntry(fullEntry);
let allKept = true;
for (const f of CONTRACT_FIELDS) {
  if (s2[f] !== `v_${f}`) { allKept = false; break; }
}
assert(allKept, "§2 全部字段经 sanitize 后保留（无假阳性剥离）", JSON.stringify(s2));
const rt = JSON.parse(JSON.stringify(s2));
let allRoundTrip = true;
for (const f of CONTRACT_FIELDS) {
  if (rt[f] !== `v_${f}`) { allRoundTrip = false; break; }
}
assert(allRoundTrip, "§2 字段 JSON round-trip 不丢", JSON.stringify(rt));

// ---- 4) 极小 entry 不抛错 ----
console.log("[4] 缺失新字段的极小 entry 不抛错");
let threw = false;
let s3 = null;
try {
  s3 = sanitizeLogEntry({ requestId: "r2", ok: true });
} catch (err) {
  threw = true;
  console.log("  抛错: " + (err && err.message));
}
assert(!threw, "极小 entry sanitize 不抛错", "threw=" + threw);
assert(s3 && s3.requestId === "r2", "极小 entry 正常返回", JSON.stringify(s3));

if (failures.length > 0) {
  console.error("\n[generation-log-fields-check] 失败 " + failures.length + " 项：");
  for (const f of failures) {
    console.error("  - " + f.label + ": " + f.detail);
  }
  process.exit(1);
}
console.log("\n[generation-log-fields-check] ok:true");
process.exit(0);
