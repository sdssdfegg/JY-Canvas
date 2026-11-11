// V203 P1 验证（常驻门禁，V204 任务 5 固化）：编排层（幂等 / 失败隔离 / 有限重试 /
// 不确定请求 / 断点恢复 / 取消）。用 mock generator 脱离真实上游与端口，直接驱动 orchestrator。
// 沙盒 data 根（JINGYIN_RELEASE_ROOT）隔离真实用户数据。
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// 先设沙盒 data 根，再动态 import 任何 server 模块（app-paths 在模块求值期读该 env）。
const sandbox = mkdtempSync(path.join(os.tmpdir(), "v203-orch-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

const {
  submitBatch,
  getBatchStatus,
  retryTask,
  cancelTask,
  recoverOnStartup,
  ledger
} = await import("../../server/features/detail-studio/generation/orchestrator.js");
const { generationTaskStore } =
  await import("../../server/features/detail-studio/generation/task-store.js");
const { TASK_STATUS, MAX_ATTEMPTS } =
  await import("../../server/features/detail-studio/generation/task-model.js");

let pass = 0;
function assert(cond, msg) {
  if (!cond) throw new Error("FAIL: " + msg);
  pass += 1;
  console.log("  ok -", msg);
}

async function waitUntilTerminal(projectId, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { counts } = await getBatchStatus(projectId);
    const active = counts.queued + counts.running;
    if (active === 0) return counts;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timeout waiting for terminal");
}

// 统计 generator 调用次数，按 frozenPrompt 区分行为
const callLog = [];
function makeGenerator(behaviorByPrompt) {
  return async (req) => {
    callLog.push(req.frozenPrompt);
    const b = behaviorByPrompt[req.frozenPrompt] || { ok: true };
    if (b.ok) return { ok: true, image: { url: "file:///tmp/fake-" + Date.now() + ".png" } };
    if (b.timeout) return { ok: false, status: 504, uncertain: true, message: "timeout" };
    if (b.fail5xx) return { ok: false, status: 502, message: "upstream 5xx" };
    if (b.failAuth) return { ok: false, status: 401, message: "auth" };
    return { ok: false, status: 500, message: "err" };
  };
}

// ── 1. 幂等：重复提交同屏不二次调用 ──
const proj = "v203_t_idem";
callLog.length = 0;
{
  const gen = makeGenerator({ "P-ok": { ok: true } });
  const spec = { projectId: proj, apiKey: "k", screens: [{ screenIndex: 1, frozenPrompt: "P-ok" }] };
  const r1 = await submitBatch(spec, { generator: gen, backoffBaseMs: 10 });
  const r2 = await submitBatch(spec, { generator: gen, backoffBaseMs: 10 });
  await waitUntilTerminal(proj);
  assert(r1.created.length === 1, "首次提交创建 1 个任务");
  assert(r2.created.length === 0 && r2.skipped.length === 1, "重复提交被幂等跳过（created=0, skipped=1）");
  assert(callLog.filter((p) => p === "P-ok").length === 1, "同一屏上游调用仅 1 次（无重复扣费）");
}

// ── 2. 失败隔离：一屏失败不影响其它成功屏 ──
const proj2 = "v203_t_iso";
{
  const gen = makeGenerator({ "ok-a": { ok: true }, "fail-b": { fail5xx: true }, "ok-c": { ok: true } });
  const spec = {
    projectId: proj2, apiKey: "k",
    screens: [
      { screenIndex: 0, frozenPrompt: "ok-a" },
      { screenIndex: 1, frozenPrompt: "fail-b" },
      { screenIndex: 2, frozenPrompt: "ok-c" }
    ]
  };
  await submitBatch(spec, { generator: gen, backoffBaseMs: 10 });
  const counts = await waitUntilTerminal(proj2);
  assert(counts.success === 2 && counts.failed === 1, "失败隔离：2 成功 1 失败，成功屏保留");
  const { tasks } = await getBatchStatus(proj2);
  const okTasks = tasks.filter((t) => t.status === TASK_STATUS.SUCCESS);
  assert(okTasks.every((t) => t.resultRef && t.resultPath !== undefined), "成功屏携带结果引用");
}

// ── 3. 有限重试：可重试错误最多重试到 MAX_ATTEMPTS ──
const proj3 = "v203_t_retry";
{
  let calls = 0;
  const gen = async (req) => {
    calls += 1;
    if (calls < MAX_ATTEMPTS) return { ok: false, status: 502, message: "retryable" };
    return { ok: true, image: { url: "file:///tmp/ok.png" } };
  };
  const spec = { projectId: proj3, apiKey: "k", screens: [{ screenIndex: 0, frozenPrompt: "retry-me" }] };
  await submitBatch(spec, { generator: gen, backoffBaseMs: 5 });
  const counts = await waitUntilTerminal(proj3);
  assert(counts.success === 1, "有限重试后成功");
  assert(calls === MAX_ATTEMPTS, `重试次数==MAX_ATTEMPTS(${MAX_ATTEMPTS})，未无限循环`);
}

// ── 4. 不确定请求（超时）：不自动重试 → needs_confirm ──
const proj4 = "v203_t_unc";
{
  const gen = makeGenerator({ "unc": { timeout: true } });
  const spec = { projectId: proj4, apiKey: "k", screens: [{ screenIndex: 0, frozenPrompt: "unc" }] };
  await submitBatch(spec, { generator: gen, backoffBaseMs: 10 });
  const counts = await waitUntilTerminal(proj4);
  assert(counts.needs_confirm === 1 && counts.failed === 0, "超时→needs_confirm，不自动重试");
}

// ── 5. 不可恢复错误（401）直接 failed，不重试 ──
const proj5 = "v203_t_auth";
{
  const gen = makeGenerator({ "auth": { failAuth: true } });
  const spec = { projectId: proj5, apiKey: "k", screens: [{ screenIndex: 0, frozenPrompt: "auth" }] };
  await submitBatch(spec, { generator: gen, backoffBaseMs: 10 });
  const counts = await waitUntilTerminal(proj5);
  assert(counts.failed === 1, "401→failed，无重试");
}

// ── 6. 取消 ──
const proj6 = "v203_t_cancel";
{
  const record = {
    task_id: "dsg_v203_t_cancel_0_abcd1234", kind: "detail-studio-generation",
    projectId: proj6, screenIndex: 0, frozenPrompt: "x", model: "m", channelId: "c",
    imageSize: "2K", aspectRatio: "3:4", referenceRoles: [], idempotencyKey: "k_cancel",
    status: TASK_STATUS.QUEUED, attempts: [], resultPath: null, resultRef: null, error: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), finished_at: null
  };
  await generationTaskStore.writeTask(record);
  const cancelled = await cancelTask("dsg_v203_t_cancel_0_abcd1234");
  assert(cancelled.status === TASK_STATUS.CANCELLED, "取消 queued 任务 → cancelled");
}

// ── 7. 断点恢复：running 无结果 → needs_confirm ──
{
  const record = {
    task_id: "dsg_v203_t_rec_0_recov9999", kind: "detail-studio-generation",
    projectId: "v203_t_rec", screenIndex: 0, frozenPrompt: "y", model: "m", channelId: "c",
    imageSize: "2K", aspectRatio: "3:4", referenceRoles: [], idempotencyKey: "k_rec",
    status: TASK_STATUS.RUNNING, attempts: [{ attempt_id: "a1" }], resultPath: null, resultRef: null, error: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), finished_at: null
  };
  await generationTaskStore.writeTask(record);
  const recovered = await recoverOnStartup();
  const after = await generationTaskStore.readTask("dsg_v203_t_rec_0_recov9999");
  assert(after.status === TASK_STATUS.NEEDS_CONFIRM, "重启恢复：running 无结果 → needs_confirm（不盲目重跑）");
}

// 清理测试任务
for (const p of [proj, proj2, proj3, proj4, proj5, proj6, "v203_t_rec"]) {
  const { tasks } = await getBatchStatus(p);
  for (const t of tasks) await generationTaskStore.writeTask({ ...t, status: TASK_STATUS.CANCELLED });
}
console.log(`\n✅ V203 P1 编排层验证全部通过（${pass} 项断言）`);

rmSync(sandbox, { recursive: true, force: true });
