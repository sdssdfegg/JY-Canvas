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
import { historyImagePath } from "../../../core/asset-urls.js";
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
  // 相对 URL：/api/history-image/<file> → 映射到 historyImageDir（data/history-images/）。
  // 仅当文件名不含路径分隔符 / 上级引用时才解析，防止路径穿越。
  if (url.startsWith("/api/history-image/")) {
    const filename = decodeURIComponent(url.split("/").pop() || "");
    if (!filename || filename.includes("/") || filename.includes("\\") || filename.startsWith("..")) {
      return null;
    }
    return historyImagePath(filename);
  }
  // 仅认可仓库 data 下的绝对路径（Windows / POSIX）
  if (/^(?:[A-Za-z]:[\\/]|\/)/.test(url)) return url;
  return null;
}

async function persistResult(task, image) {
  const resultsDir = detailStudioGenerationResultsDir;
  await mkdir(resultsDir, { recursive: true });
  // 取可落盘的本地图片地址：优先 image.url，兼容 /api/images 返回的 localUrl / value
  // （两者均为 /api/history-image/<file> 形态，旧版只读 image.url 导致 resultPath 恒为 null）。
  const imgUrl = (image && (image.url || image.localUrl || image.value)) || "";
  const localPath = isImageLocalPath(imgUrl);
  let resultPath = null;
  if (localPath) {
    try {
      const ext = path.extname(localPath) || ".png";
      const dest = path.join(resultsDir, `${task.task_id}${ext}`);
      await copyFile(localPath, dest);
      resultPath = dest;
    } catch {
      resultPath = null; // 复制失败不致命，仍可保留上游引用（resultRef 仍可展示）
    }
  }
  return resultPath;
}

// ── 提交一批屏生成任务（服务端内部出图：V208 Tool 层 create-task.tool.js + 单测）──
// 🔴 V212 P1：用户态「开始批量生成」按钮已改为前端直调 generateImages + 回写（routes.js /generation/start → registerBatch），
//    本函数保留给 V208 Tool 层与单测、以及需要服务端完整编排（重试/退避）的场景，不再由用户态 /generation/start 调用。
// spec: { projectId, apiKey, screens: [{ screenIndex, frozenPrompt, referenceImagePaths, model, channelId, imageSize, aspectRatio, referenceRoles }] }
// opts: { generator, backoffBaseMs }
// @internal 保留给 V208 Tool 层（create-task.tool.js）与单测；用户态批量出图走 registerBatch + 前端直调 generateImages。
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
      referenceImagePaths: screen.referenceImagePaths,
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

// ── 单屏连续编辑：只提交「某一屏」的一次生成任务（阶段 5 · V204 单屏编辑 + edit-screen.tool.js）──
// @internal 保留：V204 单屏编辑（version-routes.js）与 V208 Tool 层 edit-screen.tool.js 仍走服务端出图链路。
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
    referenceImagePaths: screen.referenceImagePaths,
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

// ── 手动重试（失败 / 需确认的任务 · 服务端完整编排版）──
// @internal 保留给 V208 Tool / 测试：同步发起重试并写回终态。用户态重试走 resetTaskForRetry + 前端直调 generateImages + recordResult。
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

// ───────────────────────────────────────────────────────────────────────────
// V212 P1 · 用户态「前端直调 generateImages + 回写」登记层
//
// 下面四个函数把「开始批量生成」拆成：登记（registerBatch）→ 前端逐屏直调
// generateImages → 标记开始（beginTask）→ 回写结果（recordResult）。服务端不再
// 发起真实出图（生产路径退役 generateViaLocalApi），仅承担「任务记录 + 幂等 +
// 断点恢复 + V204 单屏编辑版本」登记职责。出图实体与一键详情共用 /api/images，
// 由前端完成并回写，保证两套界面同一套生图链路（V212 §2 裁决①）。
// ───────────────────────────────────────────────────────────────────────────

// 仅登记 QUEUED 任务并返回每屏规格（taskId + 屏参数），不发起任何上游请求。
// 幂等账本与 submitBatch 同源：同指纹命中既有非取消任务 → 复用且返回该任务 spec。
// 返回 { created, skipped, specs }，specs 供前端逐屏构造 buildDetailImageForm。
export async function registerBatch(spec) {
  const projectId = String(spec.projectId || "");
  const screens = Array.isArray(spec.screens) ? spec.screens : [];
  if (!projectId) throw new Error("registerBatch requires projectId");
  if (screens.length > MAX_SCREENS) {
    throw new Error(`单项目最多 ${MAX_SCREENS} 屏，收到 ${screens.length}`);
  }

  const created = [];
  const skipped = [];
  const specs = [];
  for (const screen of screens) {
    const fp = screen.frozenPrompt == null ? "" : String(screen.frozenPrompt);
    // 阶段 4 整批无版本维度：versionId 为空，幂等键退化为（projectId|screenIndex|fp）。
    const key = idempotencyKey(projectId, screen.screenIndex, fp, screen.versionId);

    // 幂等：同指纹已有非取消任务 → 直接复用，绝不再发上游请求 / 扣费。
    const existingId = ledger.get(key);
    if (existingId) {
      const existing = await generationTaskStore.readTask(existingId);
      if (existing && existing.status !== TASK_STATUS.CANCELLED) {
        skipped.push({ taskId: existingId, status: existing.status, reason: "idempotent_reuse" });
        specs.push({
          taskId: existingId,
          screenIndex: screen.screenIndex,
          frozenPrompt: fp,
          model: screen.model,
          channelId: screen.channelId,
          imageSize: screen.imageSize,
          aspectRatio: screen.aspectRatio
        });
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
      referenceImagePaths: screen.referenceImagePaths,
      idempotencyKey: key,
      versionId: screen.versionId
    });
    await generationTaskStore.writeTask(record);
    ledger.set(key, record.task_id);
    created.push(record.task_id);
    specs.push({
      taskId: record.task_id,
      screenIndex: screen.screenIndex,
      frozenPrompt: fp,
      model: screen.model,
      channelId: screen.channelId,
      imageSize: screen.imageSize,
      aspectRatio: screen.aspectRatio
    });
  }
  return { created, skipped, specs };
}

// 前端开始生成某屏前调用：把 QUEUED → RUNNING，使面板展示「生成中 + 已等待 Ns」。
export async function beginTask(projectId, taskId) {
  const task = await generationTaskStore.readTask(taskId);
  if (!task) throw new Error(`beginTask: task not found: ${taskId}`);
  if (task.projectId && projectId && task.projectId !== String(projectId)) {
    throw new Error("beginTask: projectId 与任务归属不符");
  }
  if (!canTransition(task.status, TASK_STATUS.RUNNING)) return task; // 已是终态则跳过
  await generationTaskStore.updateStatus(taskId, TASK_STATUS.RUNNING);
  return generationTaskStore.readTask(taskId);
}

// 前端出图完成后回写：RUNNING → SUCCESS / FAILED / NEEDS_CONFIRM。
// success: image 为 /api/images 返回的 historyItem.image（含 url/localUrl/value），
//   经 persistResult 复制到 data/detail-studio/generation/results/。
// error: { status, name, message }，服务端用 classifyError 判定 FAILED 或 NEEDS_CONFIRM。
export async function recordResult(projectId, taskId, { outcome, image = null, error = null } = {}) {
  const task = await generationTaskStore.readTask(taskId);
  if (!task) throw new Error(`recordResult: task not found: ${taskId}`);
  if (task.projectId && projectId && task.projectId !== String(projectId)) {
    throw new Error("recordResult: projectId 与任务归属不符");
  }
  // 已在终态（如重启恢复标了 needs_confirm）→ 不覆盖已完成结果，直接返回。
  if (!canTransition(task.status, TASK_STATUS.RUNNING)) return task;

  await generationTaskStore.updateStatus(taskId, TASK_STATUS.RUNNING);
  if (outcome === "success") {
    const resultPath = await persistResult(task, image || {});
    await generationTaskStore.updateStatus(taskId, TASK_STATUS.SUCCESS, {
      resultRef: image || null,
      resultPath
    });
    return generationTaskStore.readTask(taskId);
  }

  const status = Number(error?.status || 0);
  const name = error?.name;
  const uncertain = Boolean(error?.uncertain) || name === "AbortError" || status === 504;
  const cls = classifyError({ status, name, uncertain });
  const finalStatus = cls.uncertain ? TASK_STATUS.NEEDS_CONFIRM : TASK_STATUS.FAILED;
  await generationTaskStore.updateStatus(taskId, finalStatus, {
    error: {
      code: cls.errorClass,
      message: String(error?.message || "生成失败"),
      recoverable: cls.recoverable,
      attempts: (task.attempts?.length || 0) + 1
    }
  });
  return generationTaskStore.readTask(taskId);
}

// 用户态重试：FAILED / NEEDS_CONFIRM / CANCELLED → QUEUED，返回重置后的任务（含屏参数），
// 由前端重新直调 generateImages 并 recordResult（与首生成同链路，不二次自调用）。
export async function resetTaskForRetry(projectId, taskId) {
  const task = await generationTaskStore.readTask(taskId);
  if (!task) throw new Error(`resetTaskForRetry: task not found: ${taskId}`);
  if (task.projectId && projectId && task.projectId !== String(projectId)) {
    throw new Error("resetTaskForRetry: projectId 与任务归属不符");
  }
  if (task.status !== TASK_STATUS.FAILED && task.status !== TASK_STATUS.NEEDS_CONFIRM && task.status !== TASK_STATUS.CANCELLED) {
    throw new Error(`resetTaskForRetry: 仅失败/待确认/已取消任务可重置，当前 ${task.status}`);
  }
  await generationTaskStore.updateStatus(taskId, TASK_STATUS.QUEUED, { error: null });
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

export {
  ledger,
  isImageLocalPath
};
