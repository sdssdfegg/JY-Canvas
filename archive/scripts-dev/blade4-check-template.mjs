// 刀 4 对照组：视频任务状态族 4 条收口到 src/shared/video-task.js
//
// 做法（与刀 3 的 blade3-check.mjs 同款，用户已裁定"后续每刀照此"）：
//   把**改前的旧实现逐字抄进来**当基准，再 import 新的共享实现，
//   用同一批入参跑两边，逐条比对返回值（含抛错行为）⇒ 证明"抽走"没有改变任何行为。
//
// 旧实现来源：git HEAD（commit 21d0bfc 之前）src/main.jsx:999-1022，与
// src/outfit-workflow.jsx:6233-6256 **逐字节一致**（已用 diff 证明），所以只抄一份即可。

import { isVideoTaskCompleted, isVideoTaskFailed, videoResultUrl, videoTaskStatusText } from "../src/shared/video-task.js";

// ============================================================
// 对照组：改前旧实现（逐字抄自 src/main.jsx，未改一字）
// ============================================================
function oldVideoResultUrl(task = {}) {
  return String(task.url || task.videoUrl || task.outputUrl || task.output_url || "").trim();
}

function oldIsVideoTaskCompleted(task = {}) {
  const status = String(task.status || "").toLowerCase();
  return Boolean(oldVideoResultUrl(task)) || /complete|completed|success|succeeded|finished|done/.test(status);
}

function oldIsVideoTaskFailed(task = {}) {
  const status = String(task.status || "").toLowerCase();
  return /fail|failed|error|cancel|cancelled|canceled/.test(status) || Boolean(task.error);
}

function oldVideoTaskStatusText(task = {}) {
  if (oldIsVideoTaskCompleted(task)) return "已完成";
  if (oldIsVideoTaskFailed(task)) return "失败";
  const progress = Number(task.progress);
  if (Number.isFinite(progress) && progress > 0) return `生成中 ${Math.round(progress)}%`;
  const status = String(task.status || "").trim();
  if (/queue|queued|pending/i.test(status)) return "排队中";
  if (/progress|running|processing/i.test(status)) return "生成中";
  return status || "生成中";
}

// ============================================================
// 入参矩阵：覆盖 4 个函数的每个分支 + 边界
// ============================================================
const TASKS = [
  ["空对象", {}],
  ["全 undefined 字段", { url: undefined, videoUrl: undefined, outputUrl: undefined, output_url: undefined, status: undefined, error: undefined, progress: undefined }],
  ["url", { url: "https://x/a.mp4" }],
  ["videoUrl", { videoUrl: "https://x/b.mp4" }],
  ["outputUrl", { outputUrl: "https://x/c.mp4" }],
  ["output_url", { output_url: "https://x/d.mp4" }],
  ["url 带首尾空格", { url: "  https://x/e.mp4  " }],
  ["url 只有空格（应为完成态？看实现）", { url: "   " }],
  ["字段优先级：url 胜 videoUrl", { url: "u1", videoUrl: "v1" }],
  ["字段优先级：videoUrl 胜 outputUrl", { videoUrl: "v1", outputUrl: "o1" }],
  ["status=complete", { status: "complete" }],
  ["status=completed", { status: "completed" }],
  ["status=COMPLETED（大小写）", { status: "COMPLETED" }],
  ["status=success", { status: "success" }],
  ["status=succeeded", { status: "succeeded" }],
  ["status=finished", { status: "finished" }],
  ["status=done", { status: "done" }],
  ["status=Complete（混合大小写）", { status: "Complete" }],
  ["status=failed", { status: "failed" }],
  ["status=FAILED", { status: "FAILED" }],
  ["status=fail", { status: "fail" }],
  ["status=error", { status: "error" }],
  ["status=cancel", { status: "cancel" }],
  ["status=cancelled", { status: "cancelled" }],
  ["status=canceled", { status: "canceled" }],
  ["error 对象", { error: { message: "boom" } }],
  ["error 空字符串（falsy）", { error: "" }],
  ["status=queued", { status: "queued" }],
  ["status=Queue", { status: "Queue" }],
  ["status=queue", { status: "queue" }],
  ["status=pending", { status: "pending" }],
  ["status=processing", { status: "processing" }],
  ["status=running", { status: "running" }],
  ["status=PROGRESS", { status: "PROGRESS" }],
  ["progress=42.6", { progress: 42.6 }],
  ["progress=0", { progress: 0 }],
  ["progress=-1", { progress: -1 }],
  ["progress=字符串 70", { progress: "70" }],
  ["progress=非数字 abc", { progress: "abc" }],
  ["progress=null", { progress: null }],
  ["progress=100", { progress: 100 }],
  ["完成态 + progress（完成优先）", { url: "u", progress: 99 }],
  ["失败态 + progress（失败优先）", { status: "failed", progress: 99 }],
  ["完成 + 失败同时命中（完成优先）", { url: "u", status: "failed" }],
  ["未知状态字符串", { status: "weird-state" }],
  ["状态带空格", { status: "  completed  " }],
  ["数字 status", { status: 200 }],
  ["null 入参（默认参数不生效，将抛错）", null],
  ["undefined 入参（走默认 {}）", undefined],
  ["不传参", "__OMIT__"]
];

// ============================================================
// 比对
// ============================================================
let passed = 0;
let failed = 0;
const diffs = [];

function call(fn, task) {
  try {
    if (task === "__OMIT__") return { ok: true, value: fn() };
    return { ok: true, value: fn(task) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

function sameResult(a, b) {
  if (a.ok !== b.ok) return false;
  if (!a.ok) return a.error === b.error;
  // 用 JSON 比对，顺带覆盖 undefined / NaN 的差异
  return JSON.stringify(a.value) === JSON.stringify(b.value);
}

const PAIRS = [
  ["videoResultUrl", videoResultUrl, oldVideoResultUrl],
  ["isVideoTaskCompleted", isVideoTaskCompleted, oldIsVideoTaskCompleted],
  ["isVideoTaskFailed", isVideoTaskFailed, oldIsVideoTaskFailed],
  ["videoTaskStatusText", videoTaskStatusText, oldVideoTaskStatusText]
];

for (const [label, task] of TASKS) {
  for (const [name, next, old] of PAIRS) {
    const a = call(next, task);
    const b = call(old, task);
    if (sameResult(a, b)) {
      passed += 1;
    } else {
      failed += 1;
      diffs.push({ name, label, next: a, old: b });
    }
  }
}

// 另加一条"自洽性"断言：共享实现内部互相调用没坏（videoTaskStatusText 依赖前两个）
const SELF_CHECK = [
  ["videoTaskStatusText({url:'u'}) = 已完成", videoTaskStatusText({ url: "u" }) === "已完成"],
  ["videoTaskStatusText({status:'failed'}) = 失败", videoTaskStatusText({ status: "failed" }) === "失败"],
  ["videoTaskStatusText({progress:42.6}) = 生成中 43%", videoTaskStatusText({ progress: 42.6 }) === "生成中 43%"],
  ["videoTaskStatusText({status:'queued'}) = 排队中", videoTaskStatusText({ status: "queued" }) === "排队中"],
  ["videoTaskStatusText({status:'processing'}) = 生成中", videoTaskStatusText({ status: "processing" }) === "生成中"],
  ["videoTaskStatusText({}) = 生成中", videoTaskStatusText({}) === "生成中"],
  ["videoTaskStatusText({status:'x'}) 回显原始状态", videoTaskStatusText({ status: "x" }) === "x"],
  ["videoResultUrl({}) = 空串", videoResultUrl({}) === ""],
  ["isVideoTaskCompleted({}) = false", isVideoTaskCompleted({}) === false],
  ["isVideoTaskFailed({}) = false", isVideoTaskFailed({}) === false]
];
let selfPassed = 0;
const selfFailures = [];
for (const [label, ok] of SELF_CHECK) {
  if (ok) selfPassed += 1;
  else selfFailures.push(label);
}

console.log(`[blade4] 入参 ${TASKS.length} 组 × 函数 ${PAIRS.length} 个 = ${passed + failed} 项比对`);
console.log(`[blade4] 新旧一致：${passed} 项通过，${failed} 项失败`);
console.log(`[blade4] 自洽性断言：${selfPassed}/${SELF_CHECK.length}`);
if (diffs.length > 0) {
  console.log("[blade4] ❌ 差异明细：");
  for (const d of diffs) console.log(JSON.stringify(d));
}
if (selfFailures.length > 0) {
  console.log("[blade4] ❌ 自洽性失败：");
  for (const f of selfFailures) console.log(`  - ${f}`);
}
const ok = failed === 0 && selfFailures.length === 0;
console.log(ok ? "[blade4] ✅ 全部通过" : "[blade4] ❌ 存在失败");
process.exit(ok ? 0 : 1);
