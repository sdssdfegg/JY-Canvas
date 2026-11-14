// S0/B4：终态任务防二次扣费 + 既有缺陷收口门禁（沙盒 data 根、零上游、零 KEY）。
//
// 锁死的回归：V212-R1 的幂等只防「重复建任务」，未防「重复出图」——
// registerBatch 幂等命中终态任务仍回传 spec，前端 runOneScreen 不检查 begin 返回状态，
// 无条件 generateImages(form) ⇒ 上游真实二次扣费，而 recordResult 因终态跳过不覆盖结果。
// 顺带锁死两个既有缺陷：task-store-core 终态大小写致 finished_at 永不写、
// run-all.mjs 的 planning-timeout-feedback-check ORDER 漏登 + FAST_ORDER 重复登记。

import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const sandbox = mkdtempSync(path.join(os.tmpdir(), "s0-no-recharge-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const ORCH_SRC = path.join(ROOT, "server", "features", "detail-studio", "generation", "orchestrator.js");
const TASK_STORE_SRC = path.join(ROOT, "server", "features", "detail-studio", "generation", "task-store.js");
const TASK_MODEL_SRC = path.join(ROOT, "server", "features", "detail-studio", "generation", "task-model.js");
const FRONT_SRC = path.join(ROOT, "src", "features", "detail-studio", "generation", "detail-studio-generate.js");
const CORE_SRC = path.join(ROOT, "server", "core", "task-store-core.js");
const RUN_ALL_SRC = path.join(ROOT, "scripts", "verify", "run-all.mjs");

const { registerBatch, beginTask } = await import(pathToFileURL(ORCH_SRC).href);
const { generationTaskStore } = await import(pathToFileURL(TASK_STORE_SRC).href);
const { TASK_STATUS, canTransition } = await import(pathToFileURL(TASK_MODEL_SRC).href);

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}
const has = (h, n) => typeof h === "string" && h.indexOf(n) >= 0;
function done() {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  console.log(`\n[s0-no-recharge] ${results.length - failed.length}/${results.length} 通过`);
  console.log(`ok=${failed.length === 0}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

async function main() {
  const orchSrc = readFileSync(ORCH_SRC, "utf8");
  const frontSrc = readFileSync(FRONT_SRC, "utf8");
  const coreSrc = readFileSync(CORE_SRC, "utf8");
  const runAllSrc = readFileSync(RUN_ALL_SRC, "utf8");

  // ── 1) 静态：三层防护都在 ──
  check("registerBatch 仅 QUEUED 回传 spec（第一层）", has(orchSrc, "if (existing.status === TASK_STATUS.QUEUED)"));
  check("beginTask 返回 started 标记（第二层）", has(orchSrc, "started: false") && has(orchSrc, "started: true"));
  check("前端按 started:false 跳过出图（第三层）", has(frontSrc, "begunTask.started === false"));
  check("started 标记不写回任务文件（无持久化副作用）", !has(orchSrc, "updateStatus(taskId, TASK_STATUS.RUNNING, { started"));
  const strippedOrch = orchSrc.split("if (existing.status === TASK_STATUS.QUEUED)").join("");
  check("负向对照·抹掉 QUEUED 判定后第一层断言变假", !has(strippedOrch, "if (existing.status === TASK_STATUS.QUEUED)"));
  const strippedFront = frontSrc.split("begunTask.started === false").join("");
  check("负向对照·抹掉前端检查后第三层断言变假", !has(strippedFront, "begunTask.started === false"));
  check("认知锚点·canTransition(running→running) === false", canTransition("running", "running") === false);

  // ── 2) 行为：沙盒驱动 registerBatch ──
  const projectId = "s0_t_no_recharge";
  const screen = { screenIndex: 0, frozenPrompt: "S0 防重复扣费提示词", model: "m", channelId: "c" };
  const reg1 = await registerBatch({ projectId, screens: [screen] });
  check("首次登记返回 1 个 spec", reg1.specs.length === 1, `specs=${reg1.specs.length}`);
  const taskId = reg1.specs[0].taskId;

  const reg2 = await registerBatch({ projectId, screens: [screen] });
  check("QUEUED 重复调用仍回传 spec（保留页面刷新恢复能力）", reg2.specs.length === 1, `specs=${reg2.specs.length}`);
  check("QUEUED 重复调用记入 skipped 而非重复建任务", reg2.skipped.length === 1 && reg2.created.length === 0);

  const begun1 = await beginTask(projectId, taskId);
  check("QUEUED → RUNNING 时 started=true", begun1.started === true && begun1.status === TASK_STATUS.RUNNING);
  const begun2 = await beginTask(projectId, taskId);
  check("负向对照·已 RUNNING 再 begin 返回 started=false", begun2.started === false);
  check("started 标记未污染落盘任务", (await generationTaskStore.readTask(taskId)).started === undefined);

  // 置终态（直接经通用任务层），顺带验证 finished_at 大小写修复
  await generationTaskStore.updateStatus(taskId, TASK_STATUS.SUCCESS);
  const finished = await generationTaskStore.readTask(taskId);
  check("终态 success 已写入 finished_at（大小写兼容生效）", Boolean(finished.finished_at), String(finished.finished_at));
  check("task-store-core 终态集合含小写状态", has(coreSrc, "\"success\", \"failed\", \"cancelled\", \"needs_confirm\""));
  const strippedCore = coreSrc.split("\"success\", \"failed\", \"cancelled\", \"needs_confirm\"").join("");
  check("负向对照·抹掉小写终态后断言变假", !has(strippedCore, "\"success\", \"failed\", \"cancelled\", \"needs_confirm\""));

  const reg3 = await registerBatch({ projectId, screens: [screen] });
  check("🔴 终态任务重复点击不再回传 spec（防二次扣费）", reg3.specs.length === 0, `specs=${reg3.specs.length}`);
  check("终态复用仍记入 skipped（可追溯）", reg3.skipped.length === 1 && reg3.skipped[0].status === TASK_STATUS.SUCCESS);
  const begun3 = await beginTask(projectId, taskId);
  check("终态 begin 返回 started=false（前端不会出图）", begun3.started === false);

  // ── 3) 门禁登记缺陷收口 ──
  const orderStart = runAllSrc.indexOf("const ORDER = [");
  const fastStart = runAllSrc.indexOf("const FAST_ORDER = [");
  check("run-all 两个数组均可定位（indexOf >= 0 守卫）", orderStart >= 0 && fastStart > orderStart, `order=${orderStart} fast=${fastStart}`);
  const countIn = (s) => (s.match(/"planning-timeout-feedback-check"/g) || []).length;
  const orderBlock = runAllSrc.slice(orderStart, fastStart);
  const fastBlock = runAllSrc.slice(fastStart);
  check("ORDER 恰好登记 1 次（原为零登记）", countIn(orderBlock) === 1, `count=${countIn(orderBlock)}`);
  check("FAST_ORDER 恰好登记 1 次（原为重复两次）", countIn(fastBlock) === 1, `count=${countIn(fastBlock)}`);
  const strippedRunAll = runAllSrc.split('"planning-timeout-feedback-check"').join("");
  check("负向对照·抹掉条目后登记断言变假", countIn(strippedRunAll) === 0);

  done();
}

main().catch((err) => {
  console.error("[s0-no-recharge] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
