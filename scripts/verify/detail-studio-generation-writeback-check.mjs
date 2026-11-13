// V212-R1 P0：详情创作「前端直调 generateImages → /result 回写」状态机端到端门禁。
//
// 背景（必须锁死的回归）：V212 P1 的 recordResult 曾用
//   if (!canTransition(task.status, TASK_STATUS.RUNNING)) return task;
// 判「是否终态」，而正常路径 beginTask 已把任务置为 RUNNING，
// canTransition 规定 from === to 返回 false ⇒ 直接 return ⇒
// SUCCESS / resultRef / resultPath / 图片全不落盘，任务永远「生成中」而上游已扣费。
// V212 验收只做 HTTP 启动冒烟（basicParams:{}），没跑状态机端到端，所以漏检。
//
// 本门禁在 JINGYIN_RELEASE_ROOT 沙盒里真实驱动
// registerBatch → beginTask → recordResult，覆盖 success / failed / needs_confirm
// 三条终态与 ≥4 条负向对照；同时对源码 guard 形态做静态断言（带 indexOf >= 0 守卫，
// 防锚点搬家变假绿）。零上游、零 KEY、不碰用户真实 data/。

import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sandbox = mkdtempSync(path.join(os.tmpdir(), "v212-r1-writeback-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const ORCH_SRC = path.join(ROOT, "server", "features", "detail-studio", "generation", "orchestrator.js");

const { registerBatch, beginTask, recordResult, getBatchStatus, reconcileStaleRunning } =
  await import("../../server/features/detail-studio/generation/orchestrator.js");
const { generationTaskStore } =
  await import("../../server/features/detail-studio/generation/task-store.js");
const { TASK_STATUS, TERMINAL_STATES, canTransition } =
  await import("../../server/features/detail-studio/generation/task-model.js");
const { historyImageDir, detailStudioGenerationResultsDir } =
  await import("../../server/core/app-paths.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}
function done() {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  }
  console.log(`\n[detail-studio-generation-writeback] ${results.length - failed.length}/${results.length} 通过`);
  console.log(`ok=${failed.length === 0}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

async function main() {
  // ── 1) 源码形态静态断言：guard 必须是「终态集合」而非 canTransition(status, RUNNING) ──
  const src = readFileSync(ORCH_SRC, "utf8");
  const fnStart = src.indexOf("export async function recordResult");
  const fnEnd = src.indexOf("export async function", fnStart + 1);
  const guardIdx = fnStart >= 0 ? src.indexOf("if (TERMINAL_STATES.has(task.status)) return task;", fnStart) : -1;
  check("recordResult 函数可定位（indexOf >= 0 守卫）", fnStart >= 0 && fnEnd > fnStart, `start=${fnStart} end=${fnEnd}`);
  check("recordResult 用终态集合判定，正常 RUNNING 不被误拦", guardIdx >= 0 && guardIdx < fnEnd, `guardIdx=${guardIdx}`);
  const legacyGuard = "if (!canTransition(task.status, TASK_STATUS.RUNNING)) return task;";
  const legacyIdx = src.indexOf(legacyGuard, fnStart);
  check("旧 canTransition 守卫已彻底移除（负向对照）", legacyIdx < 0 || legacyIdx > fnEnd, `legacyIdx=${legacyIdx}`);
  check("TERMINAL_STATES 已导入编排层", src.indexOf("TERMINAL_STATES,") >= 0);

  // ── 2) 认知锚点：证明旧守卫确实会误拦（负向对照的前提） ──
  check("canTransition(running → running) === false", canTransition("running", "running") === false);
  check("旧守卫条件 !canTransition(running, RUNNING) 为 true（会误拦）", !canTransition("running", "running") === true);
  check("canTransition(queued → running) === true", canTransition("queued", "running") === true);
  check("终态集合含 success/failed/cancelled/needs_confirm 且不含 running",
    ["success", "failed", "cancelled", "needs_confirm"].every((s) => TERMINAL_STATES.has(s)) && !TERMINAL_STATES.has("running"));

  // ── 3) 沙盒假图：让 persistResult 能真实复制出 resultPath ──
  mkdirSync(historyImageDir, { recursive: true });
  const fakeName = "v212r1_fake.png";
  writeFileSync(path.join(historyImageDir, fakeName), Buffer.from("fake-png-bytes"));
  const localUrl = `/api/history-image/${fakeName}`;
  const image = { type: "url", value: localUrl, localUrl, archiveFile: fakeName, archiveMime: "image/png" };

  async function registerOne(projectId, prompt) {
    const reg = await registerBatch({
      projectId,
      screens: [{ screenIndex: 0, frozenPrompt: prompt, model: "tt-image-2.6", channelId: "sandbox-channel" }]
    });
    return reg.specs[0];
  }

  // ── 4) 主路径：registerBatch → begin → result(success) 必须全部落盘 ──
  const projectOk = "v212r1_t_success";
  const specOk = await registerOne(projectOk, "屏1冻结提示词");
  check("登记返回 taskId", Boolean(specOk && specOk.taskId), String(specOk && specOk.taskId));
  const queued = await generationTaskStore.readTask(specOk.taskId);
  check("登记后状态 queued", queued.status === TASK_STATUS.QUEUED, queued.status);
  await beginTask(projectOk, specOk.taskId);
  const running = await generationTaskStore.readTask(specOk.taskId);
  check("begin 后状态 running", running.status === TASK_STATUS.RUNNING, running.status);

  const okTask = await recordResult(projectOk, specOk.taskId, { outcome: "success", image });
  check("🔴 回写 success 后状态为 success（旧 guard 会在这里失败）", okTask.status === TASK_STATUS.SUCCESS, okTask.status);
  check("resultRef 已落盘", Boolean(okTask.resultRef));
  check("resultPath 已落盘且文件真实存在", Boolean(okTask.resultPath) && existsSync(okTask.resultPath), String(okTask.resultPath));
  check("结果图落在工作区独立目录", Boolean(okTask.resultPath)
    && path.resolve(okTask.resultPath).startsWith(path.resolve(detailStudioGenerationResultsDir)), String(okTask.resultPath));
  check("批次计数 success=1 / running=0", (await getBatchStatus(projectOk)).counts.success === 1
    && (await getBatchStatus(projectOk)).counts.running === 0);

  // ── 5) 负向对照组 ──
  // 5.1 终态重复回写不得覆盖既有成功结果
  const again = await recordResult(projectOk, specOk.taskId, {
    outcome: "error", error: { status: 400, message: "不得覆盖已有结果" }
  });
  check("负向对照·终态重复回写不覆盖", again.status === TASK_STATUS.SUCCESS
    && Boolean(again.resultRef) && !again.error, `status=${again.status}`);

  // 5.2 项目归属不符必须拒绝，避免跨项目写结果
  let rejected = false;
  try {
    await recordResult("another_project", specOk.taskId, { outcome: "success", image });
  } catch {
    rejected = true;
  }
  check("负向对照·projectId 不符被拒", rejected);

  // 5.3 路径穿越的相对 URL 不得解析成本地文件（P0 已有防护，此处锁死不回退）
  const projectTraversal = "v212r1_t_traversal";
  const specTraversal = await registerOne(projectTraversal, "路径穿越提示词");
  await beginTask(projectTraversal, specTraversal.taskId);
  const traversalTask = await recordResult(projectTraversal, specTraversal.taskId, {
    outcome: "success",
    image: { ...image, localUrl: "/api/history-image/..%2F..%2Fsecret.png", value: "/api/history-image/..%2F..%2Fsecret.png" }
  });
  check("负向对照·路径穿越 URL 不产生 resultPath", !traversalTask.resultPath, String(traversalTask.resultPath));

  // 5.4 普通失败 → FAILED（不是静默 success）
  const projectFail = "v212r1_t_failed";
  const specFail = await registerOne(projectFail, "普通失败提示词");
  await beginTask(projectFail, specFail.taskId);
  const failedTask = await recordResult(projectFail, specFail.taskId, {
    outcome: "error", error: { status: 400, message: "请先上传目标商品实物图" }
  });
  check("普通失败落 FAILED（负向对照：不得静默成功）", failedTask.status === TASK_STATUS.FAILED, failedTask.status);
  check("失败原因完整保留", failedTask.error && failedTask.error.message === "请先上传目标商品实物图");

  // 5.5 不确定失败（504 / AbortError）→ NEEDS_CONFIRM
  const projectUncertain = "v212r1_t_uncertain";
  const specUncertain = await registerOne(projectUncertain, "超时不确定提示词");
  await beginTask(projectUncertain, specUncertain.taskId);
  const uncertainTask = await recordResult(projectUncertain, specUncertain.taskId, {
    outcome: "error", error: { status: 504, name: "AbortError", message: "上游超时" }
  });
  check("不确定失败落 NEEDS_CONFIRM", uncertainTask.status === TASK_STATUS.NEEDS_CONFIRM, uncertainTask.status);

  // 5.6 空 image 时成功仍为 success 但 resultPath 为 null（不误判为失败）
  const projectNoImage = "v212r1_t_noimage";
  const specNoImage = await registerOne(projectNoImage, "无图提示词");
  await beginTask(projectNoImage, specNoImage.taskId);
  const noImageTask = await recordResult(projectNoImage, specNoImage.taskId, { outcome: "success", image: null });
  check("负向对照·空 image 仍 success 且 resultPath=null",
    noImageTask.status === TASK_STATUS.SUCCESS && !noImageTask.resultPath, `status=${noImageTask.status}`);

  // 5.7 未 begin 直接回写（QUEUED）也应落到终态，不留悬挂 running
  const projectDirect = "v212r1_t_direct";
  const specDirect = await registerOne(projectDirect, "未 begin 提示词");
  const directTask = await recordResult(projectDirect, specDirect.taskId, { outcome: "success", image });
  check("负向对照·QUEUED 直接回写也落终态", directTask.status === TASK_STATUS.SUCCESS, directTask.status);

  // ── 6) V212-R1 P1：RUNNING 悬挂看门狗（页面刷新 / 切走导致 /result 丢失） ──
  // writeTask 会强制把 updated_at 刷成当前时间，故用 getBatchStatus 的注入参数 now
  // 模拟「时间已过去 20 分钟」，而不是 hack 落盘文件；生产调用不传该参数。
  const futureNow = Date.now() + 20 * 60 * 1000;
  async function makeRunning(projectId, prompt, extra = {}) {
    const spec = await registerOne(projectId, prompt);
    await beginTask(projectId, spec.taskId);
    if (Object.keys(extra).length) {
      const task = await generationTaskStore.readTask(spec.taskId);
      await generationTaskStore.writeTask({ ...task, ...extra });
    }
    return spec;
  }

  const projectStale = "v212r1_t_stale";
  const specStale = await makeRunning(projectStale, "悬挂超时提示词");
  const staleStatus = await getBatchStatus(projectStale, { now: futureNow });
  const staleAfter = await generationTaskStore.readTask(specStale.taskId);
  check("超时 RUNNING 自动转 needs_confirm", staleAfter.status === TASK_STATUS.NEEDS_CONFIRM, staleAfter.status);
  check("看门狗给出可诊断原因与可重试标记", staleAfter.error && staleAfter.error.code === "stalled_running"
    && staleAfter.error.recoverable === true, JSON.stringify(staleAfter.error || {}));
  check("看门狗后统计 running=0 / needs_confirm=1",
    staleStatus.counts.running === 0 && staleStatus.counts.needs_confirm === 1,
    `running=${staleStatus.counts.running} needs_confirm=${staleStatus.counts.needs_confirm}`);

  // 负向对照：未超时的正常 RUNNING 不被误伤（生产默认 now = 当前时间）
  const projectFresh = "v212r1_t_fresh";
  const specFresh = await makeRunning(projectFresh, "新鲜运行中提示词");
  const freshStatus = await getBatchStatus(projectFresh);
  check("负向对照·未超时 RUNNING 不被误伤",
    (await generationTaskStore.readTask(specFresh.taskId)).status === TASK_STATUS.RUNNING
    && freshStatus.counts.running === 1, `running=${freshStatus.counts.running}`);

  // 负向对照：看门狗按项目隔离，不跨项目改写其它项目的悬挂任务
  const projectOther = "v212r1_t_other";
  const specOther = await makeRunning(projectOther, "别的项目悬挂提示词");
  await getBatchStatus(projectFresh, { now: futureNow });
  check("负向对照·看门狗不跨项目误伤",
    (await generationTaskStore.readTask(specOther.taskId)).status === TASK_STATUS.RUNNING);
  check("显式全量 reconcile 能回收其它项目的悬挂任务",
    (await reconcileStaleRunning(undefined, { now: futureNow })).includes(specOther.taskId));

  // 负向对照：已有 resultRef 的旧 RUNNING 是「等回写」，不应被改写成需确认
  const projectHasResult = "v212r1_t_hasresult";
  const specHasResult = await makeRunning(projectHasResult, "已有结果提示词", { resultRef: { localUrl } });
  await getBatchStatus(projectHasResult, { now: futureNow });
  check("负向对照·已有结果的旧 RUNNING 不被改写",
    (await generationTaskStore.readTask(specHasResult.taskId)).status === TASK_STATUS.RUNNING);
}

try {
  await main();
} catch (err) {
  check("门禁运行无异常", false, err && err.message ? err.message : String(err));
} finally {
  done();
  rmSync(sandbox, { recursive: true, force: true });
}
