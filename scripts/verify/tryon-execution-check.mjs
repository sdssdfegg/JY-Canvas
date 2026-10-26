// P1-5 统一执行入口单元测试（纯进程内，不起服务、不扣模型额度）。
// 验证：retryOrRoute 决策、classifyTryOnError 分类、buildTryOnPrompt 委托、
// createTryOnTask 幂等 + 状态推进、generateTryOn 经注入 dispatch 的成功/预算拒/可重试/致命 四条路径。
// 注：编排路径会真实写入 data/ai-tryon/tasks（复用 P1-1 存储层，属预期），task_id 以 tryon-verify- 前缀隔离。

import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const importAbs = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

const exec = await importAbs("server/ai-tryon/execution.js");
const { readTask } = await importAbs("server/ai-tryon/task-store.js");
const { normalizeImageRequest } = await importAbs("server/channel.js");

const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(`${name} ${detail || ""}`);
}
function makeSpec() {
  return normalizeImageRequest({
    model: "tt-image-2",
    channelId: "silent-tt2-line-12",
    dispatchMode: "manual",
    prompt: "test-prompt",
    n: 1,
    source: "outfit"
  });
}

// ── retryOrRoute 决策 ──────────────────────────────────────────────────────
const r1 = exec.retryOrRoute({ attempts: [1, 2] }, "network", { maxGenerationAttempts: 3 });
check("retryOrRoute.retry", r1.action === "retry" && r1.nextDelayMs > 0, JSON.stringify(r1));

const r2 = exec.retryOrRoute({ attempts: [1, 2, 3] }, "network", { maxGenerationAttempts: 3 });
check("retryOrRoute.budget", r2.action === "fail" && /budget/.test(r2.reason), JSON.stringify(r2));

const r3 = exec.retryOrRoute({ attempts: [] }, "auth");
check("retryOrRoute.fatal", r3.action === "fail" && /fatal/.test(r3.reason), JSON.stringify(r3));

const r4 = exec.retryOrRoute({ attempts: [] }, "quality");
check("retryOrRoute.quality", r4.action === "needs_review", JSON.stringify(r4));

// ── classifyTryOnError 分类 ───────────────────────────────────────────────
check("classify.returns", typeof exec.classifyTryOnError(500, "boom") === "string");

// ── buildTryOnPrompt 委托 ─────────────────────────────────────────────────
const bp = exec.buildTryOnPrompt({ model: "tt-image-2", workflowMode: "outfit", prompt: "a", options: {} });
check("buildTryOnPrompt.shape", bp && typeof bp.prompt === "string" && typeof bp.hash === "string", JSON.stringify(bp));

// ── 编排：幂等 + 状态推进 ─────────────────────────────────────────────────
const uuid = randomUUID();
const t = await exec.createTryOnTask({ idempotency_key: `verify-${uuid}`, model: "tt-image-2" });
check("create.status", t.status === "READY_TO_GENERATE", t.status);

const t2 = await exec.createTryOnTask({ idempotency_key: `verify-${uuid}`, model: "tt-image-2" });
check("create.idempotent", t2.task_id === t.task_id, `${t2.task_id} vs ${t.task_id}`);

// ── 成功路径 ─────────────────────────────────────────────────────────────
const okRes = await exec.generateTryOn(t, {
  dispatch: async () => ({ ok: true, images: [{ type: "url", value: "http://x/y.png" }], requestId: "r1" }),
  requestSpec: makeSpec()
});
check("gen.success", okRes.ok === true, JSON.stringify(okRes));
const afterOk = await readTask(t.task_id);
check("gen.success.terminal", afterOk.status === "SUCCEEDED", afterOk.status);
check("gen.success.attempts", afterOk.attempts.length === 1, afterOk.attempts.length);
check("gen.success.assets", Array.isArray(afterOk.result_asset_ids) && afterOk.result_asset_ids.length === 1, JSON.stringify(afterOk.result_asset_ids));

// ── 预算拒 ───────────────────────────────────────────────────────────────
const tb = await exec.createTryOnTask({ idempotency_key: `budget-${uuid}`, model: "tt-image-2" });
const bRes = await exec.generateTryOn(tb, {
  dispatch: async () => ({ ok: true, images: [] }),
  requestSpec: makeSpec(),
  budget: { maxGenerationAttempts: 0 }
});
check("gen.budget.refused", bRes.ok === false && bRes.errorClass === "budget", JSON.stringify(bRes));
const afterB = await readTask(tb.task_id);
check("gen.budget.failed", afterB.status === "FAILED", afterB.status);

// ── 可重试路径（维持 GENERATING，交由调用方再 dispatch）─────────────────────
const tr = await exec.createTryOnTask({ idempotency_key: `retry-${uuid}`, model: "tt-image-2" });
const rRes = await exec.generateTryOn(tr, {
  dispatch: async () => ({ ok: false, status: 502, error: "down", errorClass: "network" }),
  requestSpec: makeSpec()
});
check("gen.retry", rRes.ok === false && rRes.retry === true, JSON.stringify(rRes));
const afterR = await readTask(tr.task_id);
check("gen.retry.stillGenerating", afterR.status === "GENERATING", afterR.status);

// ── 致命路径（不重试 → FAILED）─────────────────────────────────────────────
const tf = await exec.createTryOnTask({ idempotency_key: `fatal-${uuid}`, model: "tt-image-2" });
const fRes = await exec.generateTryOn(tf, {
  dispatch: async () => ({ ok: false, errorClass: "auth" }),
  requestSpec: makeSpec()
});
check("gen.fatal", fRes.ok === false && fRes.retry === false, JSON.stringify(fRes));
const afterF = await readTask(tf.task_id);
check("gen.fatal.failed", afterF.status === "FAILED", afterF.status);

// ── 预留接口签名冻结 ──────────────────────────────────────────────────────
for (const name of ["analyzeInputs", "postProcess", "evaluateResult"]) {
  let threw = false;
  try {
    exec[name]();
  } catch (e) {
    threw = e && e.name === "NotImplementedError";
  }
  check(`reserved.${name}`, threw, "expected NotImplementedError");
}

if (failures.length) {
  console.error(`❌ tryon-execution-check 失败 (${failures.length}):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("✅ tryon-execution-check 全部通过（retryOrRoute/classify/buildTryOnPrompt/create/generate×4/预留签名）");
