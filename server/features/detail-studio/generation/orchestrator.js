// 详情创作「批量生成」服务端编排（V203 阶段 4 · P1）。
//
// 职责：把一批「屏生成请求」落成独立任务，排队、调用出图、做状态机迁移、失败隔离、
// 有限重试、断点恢复。出图本身通过注入的 generator 完成（生产环境 = 内部自调用 /api/images，
// 复用其全局 5 并发闸门 + 计费 + 持久化；单测注入 mock 以脱离真实上游）。
//
// 设计红线（见执行单 §2/§4/§5）：
//   - 详情队列本身不设数量上限：一次可排满 MAX_SCREENS 个任务，全部入队、状态可见。
//   - 全局 5 并发是执行层资源保护，由 /api/images 内部的 acquireImageSlot 统一授予，
//     本编排层不另设并发上限、不改 IMAGE_CONCURRENCY_LIMIT。
//   - 幂等：相同 (projectId, screenIndex, frozenPrompt) 指纹 → 直接复用已有成功任务，绝不二次扣费。
//   - 失败隔离：单屏失败只写该任务，不影响其它成功屏与已落盘图片。
//   - 「不确定请求」不自动重试 → needs_confirm，交用户手动点重试。
//
// 依赖方向：本文件 → task-store（薄适配层）→ task-store-core（零依赖叶子）；
//   不 import 任何特性模块 / 浏览器模块；generator 由调用方注入。

import path from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
import { generationTaskStore } from "./task-store.js";
import { detailStudioGenerationResultsDir } from "../../../core/app-paths.js";
import {
  TASK_STATUS,
  MAX_SCREENS,
  MAX_ATTEMPTS,
  idempotencyKey,
  classifyError,
  computeBackoffMs,
  canTransition,
  buildTaskRecord
} from "./task-model.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 进程内幂等账本：idempotencyKey -> taskId。重启后由 recoverOnStartup 从持久化重建。
const ledger = new Map();

async function rebuildLedger() {
  ledger.clear();
  const all = await generationTaskStore.listTasks();
  for (const entry of all) {
    const task = await generationTaskStore.readTask(entry.id);
    if (task && task.idempotencyKey && task.status !== TASK_STATUS.CANCELLED) {
      ledger.set(task.idempotencyKey, task.task_id);
    }
  }
}

function isImageLocalPath(url) {
  if (!url || typeof url !== "string") return null;
  if (url.startsWith("file://")) return url.slice("file://".length);
  // 仅认可仓库 data 下的绝对路径（Windows / POSIX）
  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(url)) return url;
  return null;
}

async function persistResult(task, image) {
  const resultsDir = detailStudioGenerationResultsDir;
  await mkdir(resultsDir, { recursive: true });
  const localPath = isImageLocalPath(image && image.url);
  let resultPath = null;
  if (localPath) {
    try {
      const ext = path.extname(localPath) || ".png";
      const dest = path.join(resultsDir, `${task.task_id}${ext}`);
      await copyFile(localPath, dest);
      resultPath = dest;
    } catch {
      resultPath = null; // 复制失败不致命，仍可保留上游引用
    }
  }
  return resultPath;
}

// ── 提交一批屏生成任务 ──
// spec: { projectId, apiKey, screens: [{ screenIndex, frozenPrompt, referenceImagePaths, model, channelId, imageSize, aspectRatio, referenceRoles }] }
// opts: { generator, backoffBaseMs }
export async function submitBatch(spec, opts = {}) {
  const generator = opts.generator;
  if (typeof generator !== "function") throw new Error("submitBatch requires a generator function");
  const projectId = String(spec.projectId || "");
  const screens = Array.isArray(spec.screens) ? spec.screens : [];
  if (!projectId) throw new Error("submitBatch requires projectId");
  if (screens.length > MAX_SCREENS) {
    throw new Error(`单项目最多 ${MAX_SCREENS} 屏，收到 ${screens.length}`);
  }

  const created = [];
  const skipped = [];
  for (const screen of screens) {
    const fp = screen.frozenPrompt == null ? "" : String(screen.frozenPrompt);
    // versionId 维度（阶段 5 单屏编辑必填 → 同屏同提示词连续生成也产出不同任务，不命中旧账本）。
    const key = idempotencyKey(projectId, screen.screenIndex, fp, screen.versionId);

    // 幂等：同指纹已有非取消任务 → 直接复用，绝不再发上游请求 / 扣费。
    const existingId = ledger.get(key);
    if (existingId) {
      const existing = await generationTaskStore.readTask(existingId);
      if (existing && existing.status !== TASK_STATUS.CANCELLED) {
        skipped.push({ taskId: existingId, status: existing.status, reason: "idempotent_reuse" });
        continue;
      }
    }

    const record = buildTaskRecord({
      projectId,
      screenIndex: screen.screenIndex,
      frozenPrompt: fp,
      model: screen.model,
      channelId: screen.channelId,
      imageSize: screen.imageSize,
      aspectRatio: screen.aspectRatio,
      referenceRoles: screen.referenceRoles,
      idempotencyKey: key,
      versionId: screen.versionId
    });
    await generationTaskStore.writeTask(record);
    ledger.set(key, record.task_id);
    created.push(record.task_id);
    // 立即入队执行（并发上限由 /api/images 内部闸门管控）。
    runTask(record.task_id, { generator: spec.apiKey ? generator : generator, apiKey: spec.apiKey, backoffBaseMs: opts.backoffBaseMs }).catch(() => {});
  }
  return { created, skipped };
}

// ── 单屏连续编辑：只提交「某一屏」的一次生成任务（阶段 5）──
// 与 submitBatch 同机制、同账本、同出图链路（复用 V203 generation），但强制绑定 versionId：
//   - 幂等键含版本维度 → 同屏连续两次编辑（即使提示词相同）各得独立任务 / 独立版本 / 独立图片；
//   - 不重跑 B1 分析 / B2 导演 / B3 编译 / B4 质检，不触发整批策划，不影响其他屏任务。
// spec: { projectId, apiKey, screen: { screenIndex, frozenPrompt, versionId, referenceImagePaths, referenceRoles, model, channelId, imageSize, aspectRatio } }
export async function submitSingleScreen(spec, opts = {}) {
  const generator = opts.generator;
  if (typeof generator !== "function") throw new Error("submitSingleScreen requires a generator function");
  const projectId = String(spec.projectId || "");
  if (!projectId) throw new Error("submitSingleScreen requires projectId");
  const screen = spec.screen;
  if (!screen || screen.screenIndex == null) throw new Error("submitSingleScreen requires screen.screenIndex");
  if (!screen.versionId) throw new Error("submitSingleScreen requires screen.versionId（单屏编辑必须绑定版本维度）");
  const fp = screen.frozenPrompt == null ? "" : String(screen.frozenPrompt);
  const key = idempotencyKey(projectId, screen.screenIndex, fp, screen.versionId);

  const existingId = ledger.get(key);
  if (existingId) {
    const existing = await generationTaskStore.readTask(existingId);
    if (existing && existing.status !== TASK_STATUS.CANCELLED) {
      return { created: [], skipped: [{ taskId: existingId, status: existing.status, reason: "idempotent_reuse" }] };
    }
  }

  const record = buildTaskRecord({
    projectId,
    screenIndex: screen.screenIndex,
    frozenPrompt: fp,
    model: screen.model,
    channelId: screen.channelId,
    imageSize: screen.imageSize,
    aspectRatio: screen.aspectRatio,
    referenceRoles: screen.referenceRoles,
    idempotencyKey: key,
    versionId: screen.versionId
  });
  await generationTaskStore.writeTask(record);
  ledger.set(key, record.task_id);
  runTask(record.task_id, { generator, apiKey: spec.apiKey, backoffBaseMs: opts.backoffBaseMs }).catch(() => {});
  return { created: [record.task_id], skipped: [] };
}

// ── 执行单个任务（含有限重试 + 退避）──
export async function runTask(taskId, { generator, apiKey, backoffBaseMs } = {}) {
  if (typeof generator !== "function") throw new Error("runTask requires a generator function");
  const task = await generationTaskStore.readTask(taskId);
  if (!task) throw new Error(`runTask: task not found: ${taskId}`);
  if (!canTransition(task.status, TASK_STATUS.RUNNING)) {
    return task; // 已在终态或非法的源状态，跳过
  }
  await generationTaskStore.updateStatus(taskId, TASK_STATUS.RUNNING);

  let current = task;
  // 重试循环：attempts 已达上限则停止；仅 autoRetry 类错误才自动重试。
  while (true) {
    const attemptNo = (current.attempts?.length || 0) + 1;
    const attemptId = `att_${attemptNo}_${Date.now()}`;
    let genResult;
    try {
      genResult = await generator({
        frozenPrompt: current.frozenPrompt,
        model: current.model,
        channelId: current.channelId,
        apiKey: apiKey || "",
        imageSize: current.imageSize,
        aspectRatio: current.aspectRatio,
        referenceImagePaths: current.referenceImagePaths || []
      });
    } catch (err) {
      genResult = {
        ok: false,
        status: err?.name === "AbortError" ? 504 : undefined,
        name: err?.name,
        message: err instanceof Error ? err.message : String(err),
        uncertain: err?.name === "AbortError"
      };
    }

    // 失败分类（先算，便于写入单次 attempt 记录，避免重复 append 污染次数）。
    const cls = classifyError({
      status: genResult.status,
      name: genResult.name,
      uncertain: genResult.uncertain
    });
    const attemptRecord = {
      attempt_id: attemptId,
      attempt_no: attemptNo,
      started_at: new Date().toISOString(),
      ok: Boolean(genResult.ok),
      status: genResult.status,
      error_class: genResult.ok ? null : cls.errorClass,
      uncertain: Boolean(genResult.uncertain),
      recoverable: genResult.ok ? null : cls.recoverable,
      message: genResult.message || (genResult.ok ? null : "生成失败")
    };
    await generationTaskStore.appendAttempt(taskId, attemptRecord);

    if (genResult.ok) {
      const resultPath = await persistResult(current, genResult.image || {});
      await generationTaskStore.updateStatus(taskId, TASK_STATUS.SUCCESS, {
        resultRef: genResult.image || null,
        resultPath
      });
      return await generationTaskStore.readTask(taskId);
    }

    // attemptsSoFar 含本次已写入的 attempt；上限判定基于「已尝试次数」。
    const attemptsSoFar = attemptNo;
    const canAutoRetry = cls.autoRetry && attemptsSoFar < MAX_ATTEMPTS;
    if (canAutoRetry) {
      const wait = computeBackoffMs(attemptsSoFar, { base: backoffBaseMs || 2000 });
      await sleep(wait);
      current = await generationTaskStore.readTask(taskId);
      if (!current) return null;
      continue; // 重新发起（仍走 running 状态）
    }

    // 不可自动重试：fatal（不可恢复）或重试耗尽 或 不确定请求
    const finalStatus = cls.uncertain
      ? TASK_STATUS.NEEDS_CONFIRM
      : TASK_STATUS.FAILED;
    await generationTaskStore.updateStatus(taskId, finalStatus, {
      error: {
        code: cls.errorClass,
        message: genResult.message || "生成失败",
        recoverable: cls.recoverable,
        attempts: attemptsSoFar
      }
    });
    return await generationTaskStore.readTask(taskId);
  }
}

// ── 手动重试（失败 / 需确认的任务）──
export async function retryTask(taskId, { generator, apiKey, backoffBaseMs } = {}) {
  if (typeof generator !== "function") throw new Error("retryTask requires a generator function");
  const task = await generationTaskStore.readTask(taskId);
  if (!task) throw new Error(`retryTask: task not found: ${taskId}`);
  if (task.status !== TASK_STATUS.FAILED && task.status !== TASK_STATUS.NEEDS_CONFIRM && task.status !== TASK_STATUS.CANCELLED) {
    throw new Error(`retryTask: 仅失败/需确认任务可重试，当前 ${task.status}`);
  }
  // 重置错误后重新入队
  await generationTaskStore.updateStatus(taskId, TASK_STATUS.QUEUED, { error: null });
  return runTask(taskId, { generator, apiKey, backoffBaseMs });
}

// ── 取消 ──
export async function cancelTask(taskId) {
  const task = await generationTaskStore.readTask(taskId);
  if (!task) throw new Error(`cancelTask: task not found: ${taskId}`);
  if (!canTransition(task.status, TASK_STATUS.CANCELLED)) {
    throw new Error(`cancelTask: 当前状态 ${task.status} 不可取消`);
  }
  await generationTaskStore.updateStatus(taskId, TASK_STATUS.CANCELLED);
  return generationTaskStore.readTask(taskId);
}

// ── 断点恢复：服务重启后重建账本，running 且无结果 → 标 needs_confirm（不盲目重跑）──
export async function recoverOnStartup() {
  await rebuildLedger();
  const all = await generationTaskStore.listTasks();
  const recovered = [];
  for (const entry of all) {
    const task = await generationTaskStore.readTask(entry.id);
    if (!task) continue;
    if (task.status === TASK_STATUS.RUNNING && !task.resultPath && !task.resultRef) {
      await generationTaskStore.updateStatus(task.task_id, TASK_STATUS.NEEDS_CONFIRM, {
        error: { code: "recovered_interrupted", message: "服务重启时任务仍在运行，已标记为需确认", recoverable: true }
      });
      recovered.push(task.task_id);
    }
  }
  return recovered;
}

// ── 聚合某项目的批次状态 ──
export async function getBatchStatus(projectId) {
  const all = await generationTaskStore.listTasks();
  const tasks = [];
  for (const entry of all) {
    if (!entry.id.startsWith(`dsg_${projectId}_`)) continue;
    const task = await generationTaskStore.readTask(entry.id);
    if (task) tasks.push(task);
  }
  const counts = { total: tasks.length, queued: 0, running: 0, success: 0, failed: 0, cancelled: 0, needs_confirm: 0 };
  for (const t of tasks) {
    if (t.status === TASK_STATUS.QUEUED) counts.queued++;
    else if (t.status === TASK_STATUS.RUNNING) counts.running++;
    else if (t.status === TASK_STATUS.SUCCESS) counts.success++;
    else if (t.status === TASK_STATUS.FAILED) counts.failed++;
    else if (t.status === TASK_STATUS.CANCELLED) counts.cancelled++;
    else if (t.status === TASK_STATUS.NEEDS_CONFIRM) counts.needs_confirm++;
  }
  counts.percent = counts.total ? Math.round((counts.success / counts.total) * 100) : 0;
  return { counts, tasks };
}

export { ledger, isImageLocalPath };
