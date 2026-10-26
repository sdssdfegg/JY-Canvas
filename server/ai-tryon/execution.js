// 统一图像编辑执行入口（P1-5 核心骨架）。
//
// 设计边界（见 docs/ai-tryon/执行单/P1-5-统一接口子集-统一执行入口.md + contracts/interfaces.md §4）：
//   - 本模块是「统一入口编排层」，把既有能力粘合为命名化入口：
//       createTryOnTask / generateTryOn / buildTryOnPrompt / retryOrRoute
//     ；analyzeInputs / postProcess / evaluateResult 为 P3/P4 留位签名（先冻结、后填实现）。
//   - 只增不改语义：所有真实能力来自既有模块，本模块不重写其逻辑：
//       · channel.js —— 请求规范化 / 路由校验 / 能力校验（S2/S16）
//       · outfit-skill.js —— 服务端权威提示词 buildOutfitPrompt（routes :299/:380）
//       · image-error-policy.js —— 错误分类（isImage* / shouldTryNext*）
//       · task-store.js (P1-1) —— 持久化；state-machine.js (P1-4) —— 状态/预算；
//       · channel-config.js (P1-2) —— 能力三态；generation-logger.js (P1-3) —— 日志。
//   - 不破现有请求路径：真正出海（fetch + baseLoop + 候选/计费）由注入的 dispatch 承担，
//     路由内嵌（P1-6）时把现有路由的 dispatch 传进来；本单只固化「统一入口编排」。
//   - 非启动/存储叶子：本模块在请求期被路由 import，不在启动链路 import，故可依赖上述特性模块群。

import { createHash, randomUUID } from "node:crypto";
import { writeTask, readTask, appendAttempt, updateStatus } from "./task-store.js";
import {
  TASK_STATES,
  TASK_EVENTS,
  TERMINAL_STATES,
  FAILURE_TAGS,
  transition,
  checkBudgetBeforeCall,
  isTerminalState,
  isRetryableError,
  BUDGET_DEFAULTS,
  IllegalStateTransitionError
} from "./state-machine.js";
import { resolveModelCapabilities } from "../channel-config.js";
import { normalizeImageRequest, validateImageRouting } from "../channel.js";
import { buildOutfitPrompt } from "../outfit-skill.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import {
  isImageAuthError,
  isImagePermissionError,
  isImageQuotaError,
  isImageTooLargeError,
  shouldTryNextChannel,
  shouldTryNextImageVariant
} from "../core/image-error-policy.js";

// ── 小工具 ───────────────────────────────────────────────────────────────
function shortHash(input) {
  return createHash("sha1").update(String(input ?? "")).digest("hex").slice(0, 16);
}

/** 预留接口未实现错误（analyzeInputs/postProcess/evaluateResult 的占位）。 */
export class NotImplementedError extends Error {
  constructor(interfaceName) {
    super(`接口 ${interfaceName} 为 P3/P4 预留签名，P1-5 不实现`);
    this.name = "NotImplementedError";
    this.interfaceName = interfaceName;
  }
}

// ── 任务创建：校验 → 持久化 → 状态机推进至 READY_TO_GENERATE ──────────────────
/**
 * 创建换装任务（统一入口之一）。幂等：同 idempotency_key 已存在则直接返回既有任务，
 * 不重建、不重复计费（contracts/tryon-task.md §1 idempotency_key）。
 * @param {object} payload 含 task_id? / idempotency_key? / model / channelId? / input_model_asset? / options? 等
 * @returns {Promise<object>} 已持久化的任务对象
 * @throws {Error} 输入校验失败（status 落 FAILED，附 message）
 */
export async function createTryOnTask(payload = {}) {
  const idempotencyKey = payload.idempotency_key || null;
  const taskId =
    payload.task_id ||
    (idempotencyKey ? `tryon-${shortHash(idempotencyKey)}` : `tryon-${randomUUID()}`);

  // 幂等：既有任务直接返回（调用方据此判断是否需重新生成）。
  const existing = await readTask(taskId);
  if (existing) return existing;

  const now = new Date().toISOString();
  const task = {
    task_id: taskId,
    idempotency_key: idempotencyKey,
    status: TASK_STATES.CREATED,
    model: payload.model || null,
    channel_id: payload.channelId || null,
    input_model_asset: payload.input_model_asset || null,
    input_garment_asset: payload.input_garment_asset || null,
    options: payload.options || {},
    prompt_template_version: payload.prompt_template_version || null,
    model_policy_version: payload.model_policy_version || null,
    retry_budget: payload.retry_budget ?? null,
    cost_budget: payload.cost_budget ?? null,
    attempts: [],
    created_at: now,
    updated_at: now
  };

  // CREATED → VALIDATING
  await writeTask(task);
  await updateStatus(taskId, transition({ status: TASK_STATES.CREATED }, TASK_EVENTS.START_VALIDATION), {
    validated_at: now
  });

  // 冻结校验：进入 READY_TO_GENERATE 前必须 model 齐备（输入资产引用由调用方决定是否必需）。
  const validation = validateTryOnInput(task);
  if (!validation.ok) {
    await updateStatus(
      taskId,
      transition({ status: TASK_STATES.VALIDATING }, TASK_EVENTS.VALIDATION_FAILED),
      { error: validation.message }
    );
    throw new Error(`createTryOnTask 校验失败：${validation.message}`);
  }

  // VALIDATING → READY_TO_GENERATE（冻结输入/模型策略/预算，见 tryon-task.md §4）
  await updateStatus(taskId, transition({ status: TASK_STATES.VALIDATING }, TASK_EVENTS.MARK_READY), {
    frozen_at: now
  });

  await writeGenerationLog({
    time: now,
    stage: "tryon-task-created",
    task_id: taskId,
    model: task.model,
    channel_id: task.channel_id,
    idempotency_key: idempotencyKey
  });

  return readTask(taskId);
}

/** 最小输入校验（P1-5 子集：model 必填；资产引用可选，由调用方语义决定）。 */
function validateTryOnInput(task) {
  if (!task.model || typeof task.model !== "string") {
    return { ok: false, message: "model 缺失或非法" };
  }
  return { ok: true };
}

// ── 提示词构建（P1 实现接口；委托 outfit-skill 服务端权威提示词）──────────────
/**
 * 构建换装提示词（统一入口之一）。薄封装 buildOutfitPrompt，返回可审计 {prompt, hash}。
 * P1-7 才做「模板版本冻结」语义；本单只做委托 + 哈希留档。
 * @param {object} task TryOnTask（至少含 model / workflowMode? / options? / prompt?）
 * @returns {{prompt:string, hash:string, templateVersion:string|null}}
 */
export function buildTryOnPrompt(task) {
  const payload = {
    workflowMode: task.workflowMode || "outfit",
    model: task.model,
    prompt: task.prompt || "",
    ...(task.options || {})
  };
  const prompt = buildOutfitPrompt(payload);
  return {
    prompt,
    hash: shortHash(prompt),
    templateVersion: task.prompt_template_version || null
  };
}

// ── 错误分类（委托 image-error-policy 既有谓词）─────────────────────────────
/**
 * 把上游 status/message 归一为 P1-4 的错误类别，供 retryOrRoute 判定。
 * @param {number} [status]
 * @param {string} [message]
 * @param {string} [upstreamMessage]
 * @returns {"rate_limit"|"network"|"timeout"|"auth"|"permission"|"param"|"quality"|"unknown"}
 */
export function classifyTryOnError(status, message, upstreamMessage = "") {
  const text = `${message || ""} ${upstreamMessage || ""}`;
  if (isImageAuthError(status, text)) return "auth";
  if (isImagePermissionError(status, text)) return "permission";
  if (isImageQuotaError(status, text)) return "rate_limit";
  if (isImageTooLargeError(text)) return "param";
  // 可重试的通道/变体级错误（限流/临时故障）→ 归到 network（P1-4 RETRYABLE 类）
  if (shouldTryNextChannel(status, text) || shouldTryNextImageVariant(status, text)) return "network";
  return "unknown";
}

// ── 重试/路由决策（有限、可解释、不得无限循环）───────────────────────────────
/**
 * 计算失败后的下一动作。纯函数、可单测；实际再 dispatch 由调用方负责（防内部死循环）。
 * @param {object} report 任务快照或 { attemptsMade:number }
 * @param {string} errorClass classifyTryOnError 的产出
 * @param {object} [budget] 覆盖 BUDGET_DEFAULTS
 * @returns {{action:"retry"|"fail"|"needs_review", nextDelayMs:number, failureTag:string|null, reason:string}}
 */
export function retryOrRoute(report, errorClass, budget = BUDGET_DEFAULTS) {
  const attemptsMade =
    (report && Array.isArray(report.attempts) ? report.attempts.length : 0) ||
    (report && typeof report.attemptsMade === "number" ? report.attemptsMade : 0);
  const max =
    budget && typeof budget.maxGenerationAttempts === "number"
      ? budget.maxGenerationAttempts
      : BUDGET_DEFAULTS.maxGenerationAttempts;

  const failureTag = FAILURE_TAGS.includes(errorClassToTag(errorClass))
    ? errorClassToTag(errorClass)
    : "MODEL_API_ERROR";

  // 质量类错误 → 仅当策略允许时进入人工复核（P1-5 直接判 needs_review，修复动作留 P4）。
  if (errorClass === "quality") {
    return {
      action: "needs_review",
      nextDelayMs: 0,
      failureTag: "DETAIL_MISSING",
      reason: "quality-error-needs-review"
    };
  }

  // 可重试（限流/网络/超时）且仍有预算 → 有限线性退避（先沿用现有线性回退，指数退避为可选增强）。
  if (isRetryableError(errorClass) && attemptsMade < max) {
    const nextDelayMs = Math.min(2000 * attemptsMade, 30000); // 封顶 30s，避免抖动失控
    return {
      action: "retry",
      nextDelayMs,
      failureTag,
      reason: `retryable:${errorClass}:attempts=${attemptsMade}/${max}`
    };
  }

  // 参数/权限/未知 → 不重试；预算耗尽也在此终止。
  return {
    action: "fail",
    nextDelayMs: 0,
    failureTag,
    reason: isRetryableError(errorClass)
      ? `budget-exhausted:attempts=${attemptsMade}/${max}`
      : `fatal:${errorClass}`
  };
}

function errorClassToTag(errorClass) {
  switch (errorClass) {
    case "rate_limit":
      return "MODEL_API_ERROR";
    case "network":
    case "timeout":
      return "MODEL_API_ERROR";
    case "auth":
    case "permission":
    case "param":
      return "MODEL_API_ERROR";
    case "quality":
      return "DETAIL_MISSING";
    default:
      return "MODEL_API_ERROR";
  }
}

// ── 统一生成入口（编排：预算门 + 能力门 + 状态 + attempt + 日志 + 失败分类）────
/**
 * 执行一次统一换装生成。真正出海委托注入的 dispatch（路由在 P1-6 内嵌时传入真实 dispatch）。
 * @param {object} task TryOnTask（含 task_id/status/attempts/model/channel_id）
 * @param {object} [opts]
 * @param {Function} opts.dispatch 真实出海函数：dispatch(requestSpec, ctx) → TryOnDispatchResult
 * @param {object} [opts.requestSpec] 已由调用方用 channel.js 规范化的请求规格（含提示词/模型/渠道）
 * @param {object} [opts.budget] 覆盖 BUDGET_DEFAULTS
 * @returns {Promise<{ok:boolean, retry?:boolean, decision?:object, task_id:string, requestId?:string, images?:Array, errorClass?:string}>}
 * @throws {Error} 未注入 dispatch / requestSpec 时明确报错（指向 P1-6）
 */
export async function generateTryOn(task, opts = {}) {
  const { dispatch, requestSpec, budget = BUDGET_DEFAULTS } = opts;
  if (typeof dispatch !== "function") {
    throw new Error("generateTryOn 必须注入 dispatch（真实出海由 P1-6 路由内嵌传入）");
  }
  if (!requestSpec || typeof requestSpec !== "object") {
    throw new Error("generateTryOn 必须提供 requestSpec（调用方用 channel.js 规范化后传入）");
  }
  const taskId = task.task_id;
  const requestId = `try-${shortHash(`${taskId}:${Date.now()}`)}`;

  // 拒绝闭环：把任务从当前态（READY_TO_GENERATE 或已 GENERATING）安全推到 FAILED。
  // 状态机无 READY_TO_GENERATE→FAILED 直边，故先 READY_TO_GENERATE→START_GENERATION 再到 FAILED。
  const refuseTask = async (ctx) => {
    let status = task.status;
    if (status === TASK_STATES.READY_TO_GENERATE) {
      try {
        await updateStatus(taskId, transition({ status: TASK_STATES.READY_TO_GENERATE }, TASK_EVENTS.START_GENERATION));
        status = TASK_STATES.GENERATING;
      } catch {
        /* 已非此态则跳过首跳 */
      }
    }
    try {
      await updateStatus(taskId, transition({ status: TASK_STATES.GENERATING }, TASK_EVENTS.GENERATION_FAILED), ctx);
    } catch {
      /* 终态或非法态：以既有记录为准 */
    }
  };

  // 1) 预算门（调用前）
  if (!checkBudgetBeforeCall(task, budget)) {
    await refuseTask({ failure_tag: null, error: "budget_exhausted" });
    await writeGenerationLog({
      time: new Date().toISOString(),
      stage: "tryon-generate-refused",
      task_id: taskId,
      request_id: requestId,
      reason: "budget_exhausted"
    });
    return { ok: false, retry: false, task_id: taskId, requestId, errorClass: "budget" };
  }

  // 2) 能力门（P1-2 三态；UNKNOWN 不伪装 SUPPORTED，但也不阻断；unknown_model 才拒）
  const caps = resolveModelCapabilities(task.model);
  if (!caps.available) {
    await refuseTask({ failure_tag: null, error: "unknown_model" });
    await writeGenerationLog({
      time: new Date().toISOString(),
      stage: "tryon-generate-refused",
      task_id: taskId,
      request_id: requestId,
      reason: "unknown_model",
      model: task.model
    });
    return { ok: false, retry: false, task_id: taskId, requestId, errorClass: "unknown_model" };
  }

  // 3) 路由校验（调用前，纯函数；不阻断 UNKNOWN 能力，仅校验 channel 合法性）
  const routing = validateImageRouting(normalizeImageRequest(requestSpec));
  if (!routing.ok) {
    await refuseTask({ failure_tag: null, error: routing.code || "invalid_routing", message: routing.message });
    return { ok: false, retry: false, task_id: taskId, requestId, errorClass: "routing" };
  }

  // 4) 状态推进 READY_TO_GENERATE → GENERATING（仅当处于待生成态）
  if (task.status === TASK_STATES.READY_TO_GENERATE) {
    await updateStatus(taskId, transition({ status: TASK_STATES.READY_TO_GENERATE }, TASK_EVENTS.START_GENERATION));
  }

  // 5) 出海（attempt 记录在出结果时一次性写入，避免重复 append）
  const attemptId = `att_${task.attempts.length + 1}_${Date.now()}`;
  const startedAt = new Date().toISOString();

  await writeGenerationLog({
    time: startedAt,
    stage: "tryon-generate-start",
    task_id: taskId,
    request_id: requestId,
    attempt_id: attemptId,
    model: task.model,
    channel_id: task.channel_id || null,
    capability_evidence: caps.evidence,
    mask_support: caps.maskSupport,
    seed_support: caps.seedSupport,
    dual_image_understanding: caps.dualImageUnderstanding
  });

  let result;
  try {
    result = await dispatch(requestSpec, { task, attemptId, requestId });
  } catch (err) {
    result = {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
      errorClass: "network"
    };
  }

  const finishedAt = new Date().toISOString();

  if (result.ok) {
    await appendAttempt(taskId, {
      attempt_id: attemptId,
      request_id: requestId,
      started_at: startedAt,
      finished_at: finishedAt,
      model: task.model,
      channel: task.channel_id || null,
      cost: result.cost ?? null
    });
    // GENERATING → EVALUATING → SUCCEEDED
    await updateStatus(taskId, transition({ status: TASK_STATES.GENERATING }, TASK_EVENTS.EVALUATE));
    const imageRefs = Array.isArray(result.images) ? result.images.map((img) => img.value || img.url || String(img)) : [];
    await updateStatus(taskId, transition({ status: TASK_STATES.EVALUATING }, TASK_EVENTS.SUCCEED), {
      result_asset_ids: imageRefs
    });
    await writeGenerationLog({
      time: finishedAt,
      stage: "tryon-generate-success",
      task_id: taskId,
      request_id: requestId,
      attempt_id: attemptId,
      image_count: imageRefs.length
    });
    return { ok: true, task_id: taskId, requestId, images: result.images || [] };
  }

  // 失败：分类 + 记录 attempt + 决策
  const errorClass = result.errorClass || classifyTryOnError(result.status, result.error, result.upstreamMessage);
  await appendAttempt(taskId, {
    attempt_id: attemptId,
    request_id: requestId,
    started_at: startedAt,
    finished_at: finishedAt,
    model: task.model,
    channel: task.channel_id || null,
    error_class: errorClass,
    error: result.error || null
  });

  const decision = retryOrRoute(task, errorClass, budget);
  await writeGenerationLog({
    time: finishedAt,
    stage: "tryon-generate-failed",
    task_id: taskId,
    request_id: requestId,
    attempt_id: attemptId,
    ok: false,
    status: result.status || null,
    error_class: errorClass,
    failure_tag: decision.failureTag,
    retry_action: decision.action,
    retry_reason: decision.reason
  });

  if (decision.action === "retry") {
    // 维持 GENERATING，交由调用方按 nextDelayMs 重新 dispatch（防内部无限循环）。
    return { ok: false, retry: true, decision, task_id: taskId, requestId, errorClass };
  }

  // 终态：FAILED 或 NEEDS_REVIEW。
  if (decision.action === "needs_review") {
    await updateStatus(taskId, transition({ status: TASK_STATES.GENERATING }, TASK_EVENTS.EVALUATE));
    await updateStatus(
      taskId,
      transition({ status: TASK_STATES.EVALUATING }, TASK_EVENTS.MARK_NEEDS_REVIEW),
      { failure_tag: decision.failureTag, error: result.error || null }
    );
  } else {
    await updateStatus(
      taskId,
      transition({ status: TASK_STATES.GENERATING }, TASK_EVENTS.GENERATION_FAILED),
      { failure_tag: decision.failureTag, error: result.error || null }
    );
  }
  return { ok: false, retry: false, decision, task_id: taskId, requestId, errorClass };
}

// ── P3/P4 预留签名（先冻结，后填实现；防各层私传临时结构）────────────────────
/** @returns {never} */
export function analyzeInputs() {
  throw new NotImplementedError("analyzeInputs");
}
/** @returns {never} */
export function postProcess() {
  throw new NotImplementedError("postProcess");
}
/** @returns {never} */
export function evaluateResult() {
  throw new NotImplementedError("evaluateResult");
}

// 显式重导出以便调用方按需取用（不新建第二套状态定义，ADR-005）。
export { TASK_STATES, TASK_EVENTS, TERMINAL_STATES, FAILURE_TAGS, IllegalStateTransitionError, isTerminalState };
