// 换装任务「路由内嵌写入」（P1-6 §1.1）。
//
// 边界（严守本单 §1.1 / §5）：
//   - **只嵌两侧**：入口建任务（P1-5 `createTryOnTask`）+ 出口落 attempt / 结果资产引用 / 终态；
//   - **不改生成路径**：真正出海仍在 `outfit.routes.js` 既有 baseLoop 内，本模块不接管、不重排；
//   - **不新增路由、不动并发槽**；
//   - 🔴 **任何异常都不得阻断生成**（P0 生命线：快捷/批量生成/批量换装/局部回贴）——
//     全部写操作失败都吞掉并只落日志，绝不向上抛。
//
// 存储可注入（`store` 参数）：默认走真存储，单测注入假存储 ⇒ **不碰用户数据**。
//
// 脱敏红线：只写文件名/字节数等元数据，**绝不写 buffer、绝不写 KEY**（日志写入前还会再过
// generation-logger 的 sanitizeLogEntry 兜底）。

import { appendAttempt, updateStatus } from "./task-store.js";
import { TASK_STATES } from "./state-machine.js";
import { createTryOnTask } from "./execution.js";
import { advanceToTerminal } from "./recovery.js";
import { compactLogMessage } from "../core/format-utils.js";
import { writeGenerationLog } from "../core/generation-logger.js";

const MAX_ASSET_REFS = 4;
const ENDPOINT = "/api/generate-outfit";

/** 默认真存储（生产路径）。 */
const DEFAULT_STORE = Object.freeze({
  createTryOnTask,
  appendAttempt,
  updateStatus,
  log: writeGenerationLog
});

/** 输入资产引用：只取名字/大小，绝不取 buffer。 */
function assetRef(file) {
  if (!file || typeof file !== "object") return null;
  const name = String(file.originalname || file.filename || "").slice(0, 160);
  const size = Number(file.size) || 0;
  if (!name && !size) return null;
  return { name, size };
}

/** 结果资产引用：只取可回溯的字符串（url / 本地路径），绝不内联图片数据。 */
function resultRefs(images) {
  if (!Array.isArray(images)) return [];
  return images
    .slice(0, MAX_ASSET_REFS)
    .map((img) => {
      if (!img) return "";
      if (typeof img === "string") return img.slice(0, 512);
      return String(img.value || img.url || img.localUrl || "").slice(0, 512);
    })
    .filter(Boolean);
}

/**
 * 入口侧：建/复用换装任务。**永不抛出**，失败返回 null（生成照常继续）。
 * @param {object} args
 * @param {string} args.requestId 路由级 requestId（兼作 idempotency_key ⇒ 重复提交不重复建任务）
 * @param {object} args.params 已由 channel.js 规范化的请求参数（含 model/channelId/prompt）
 * @param {object} args.payload 原始 payload（取 workflowMode）
 * @param {Array} args.files 上传文件（multer 对象）
 * @param {object} [store] 注入用（单测）
 * @returns {Promise<object|null>}
 */
export async function beginTryOnTask({ requestId, params = {}, payload = {}, files = [] } = {}, store = DEFAULT_STORE) {
  try {
    return await store.createTryOnTask({
      idempotency_key: requestId || null,
      model: params.model || null,
      channelId: params.channelId || null,
      input_model_asset: assetRef(files[0]),
      input_garment_asset: assetRef(files[1]),
      options: {
        requestId: requestId || null,
        source: ENDPOINT,
        workflowMode: payload.workflowMode || null,
        fileCount: Array.isArray(files) ? files.length : 0,
        promptLength: typeof params.prompt === "string" ? params.prompt.length : 0
      }
    });
  } catch (error) {
    // 任务写入失败绝不阻断生成：只落一条日志，返回 null 让后续写入自然跳过。
    await store
      .log({
        time: new Date().toISOString(),
        requestId: requestId || null,
        ok: false,
        stage: "tryon-task-create-failed",
        endpoint: ENDPOINT,
        message: compactLogMessage(error, 300)
      })
      .catch(() => {});
    return null;
  }
}

/**
 * 出口侧：落 attempt + 终态（可 await，便于单测）。**永不抛出**，返回 {ok, reason?}。
 * @param {object|null} task beginTryOnTask 的产出
 * @param {object} outcome
 * @param {boolean} outcome.ok 是否成功
 * @param {string} [outcome.requestId]
 * @param {string} [outcome.model]
 * @param {string} [outcome.channel]
 * @param {Array} [outcome.images] 成功时的图片数组
 * @param {string} [outcome.error] 失败信息
 * @param {number} [outcome.status] HTTP 状态
 * @param {string} [outcome.errorClass] 失败分类（quality → NEEDS_REVIEW）
 * @param {object} [store] 注入用（单测）
 * @returns {Promise<{ok:boolean, landed?:string, reason?:string}>}
 */
export async function settleTryOnTask(task, outcome = {}, store = DEFAULT_STORE) {
  if (!task || !task.task_id) return { ok: false, reason: "no-task" };
  const taskId = task.task_id;
  const images = Array.isArray(outcome.images) ? outcome.images : [];
  const finishedAt = new Date().toISOString();

  // 1) attempt 记录（失败不影响终态收敛）
  try {
    await store.appendAttempt(taskId, {
      request_id: outcome.requestId || null,
      finished_at: finishedAt,
      model: outcome.model || null,
      channel: outcome.channel || null,
      error_class: outcome.ok ? null : (outcome.errorClass || "unknown"),
      error: outcome.ok ? null : compactLogMessage(outcome.error, 300),
      image_count: images.length,
      http_status: outcome.status ?? null
    });
  } catch (error) {
    await store
      .log({
        time: finishedAt,
        requestId: outcome.requestId || null,
        task_id: taskId,
        ok: false,
        stage: "tryon-attempt-append-failed",
        endpoint: ENDPOINT,
        message: compactLogMessage(error, 300)
      })
      .catch(() => {});
  }

  // 2) 终态收敛（沿合法边；quality 类进 NEEDS_REVIEW 而非 FAILED）
  const target = outcome.ok
    ? TASK_STATES.SUCCEEDED
    : (outcome.errorClass === "quality" ? TASK_STATES.NEEDS_REVIEW : TASK_STATES.FAILED);
  const finalCtx = outcome.ok
    ? { result_asset_ids: resultRefs(images) }
    : { failure_tag: "MODEL_API_ERROR", error: compactLogMessage(outcome.error, 300) };

  try {
    const landed = await advanceToTerminal(
      task.status || TASK_STATES.READY_TO_GENERATE,
      target,
      (status, ctx) => store.updateStatus(taskId, status, ctx),
      finalCtx
    );
    return { ok: true, landed };
  } catch (error) {
    await store
      .log({
        time: finishedAt,
        requestId: outcome.requestId || null,
        task_id: taskId,
        ok: false,
        stage: "tryon-task-settle-failed",
        endpoint: ENDPOINT,
        message: compactLogMessage(error, 300)
      })
      .catch(() => {});
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 后台版出口写入（对齐既有 finalizeBillingInBackground /
 * archiveOutfitGeneratedImageInBackground 惯例）：不占响应时间、不阻断响应。
 * @param {object|null} task
 * @param {object} outcome
 * @param {object} [store] 注入用（单测）
 */
export function settleTryOnTaskInBackground(task, outcome = {}, store = DEFAULT_STORE) {
  if (!task || !task.task_id) return;
  void settleTryOnTask(task, outcome, store).catch(() => {});
}
