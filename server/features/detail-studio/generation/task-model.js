// 详情创作「批量生成」任务模型与状态机（V203 阶段 4 · P0/P1）。
//
// 纯逻辑模块：零外部副作用、不 import 任何 IO / 网络 / 业务模块，便于单测与编排层复用。
// 状态机、幂等键、错误分类、退避、重试上限全部在此定义；实际出图由 orchestrator 注入的生成器完成。
//
// 依赖方向：仅 node:crypto（内置）。不依赖 server/core/*、不依赖 /api/images、不依赖浏览器模块，
// 保持「零依赖叶子」以免疫 public 启动链路 TDZ。

import { createHash } from "node:crypto";

// ── 常量（与执行单 §4 / §8 对应）──
export const MAX_SCREENS = 20; // 单个详情项目最多 20 屏
export const MAX_ATTEMPTS = 3; // 重试上限：含首试共 3 次（额外最多 2 次重试）
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_CAP_MS = 60000;

export const TASK_STATUS = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCESS: "success",
  FAILED: "failed",
  CANCELLED: "cancelled",
  NEEDS_CONFIRM: "needs_confirm" // 「不确定请求」：上游可能已生成但响应丢失，交用户手动重试
};

export const TERMINAL_STATES = new Set([
  TASK_STATUS.SUCCESS,
  TASK_STATUS.FAILED,
  TASK_STATUS.CANCELLED,
  TASK_STATUS.NEEDS_CONFIRM
]);

// ── 幂等键：项目 id + 屏 index + versionId + frozenPrompt 内容指纹 ──
// 阶段 4（初始整批）无版本维度：versionId 为空时退化为原公式（向后兼容，存量任务幂等复用不失效）。
// 阶段 5（单屏编辑）：versionId 必填 → 同屏连续两次生成（即使提示词相同）得到不同键，
// 直接产出两个独立任务 / 两个独立版本 / 两张独立图片，不复用旧账本、不覆盖历史版本。
export function idempotencyKey(projectId, screenIndex, frozenPrompt, versionId) {
  const fp = String(frozenPrompt == null ? "" : frozenPrompt);
  const vid = String(versionId == null ? "" : versionId);
  const seed = vid
    ? `${projectId || ""}|${screenIndex == null ? "" : screenIndex}|${vid}|${fp}`
    : `${projectId || ""}|${screenIndex == null ? "" : screenIndex}|${fp}`;
  return createHash("sha256").update(seed).digest("hex");
}

// ── 错误分类 ──
// 返回 { retryable, autoRetry, errorClass, recoverable }
//   - retryable：是否属于「可重试」大类（429/5xx/临时网络）
//   - autoRetry：是否由系统自动重试（false 含 401/413/400 参数违规 与「不确定请求」）
//   - recoverable：用户手动重试是否有意义（false 为不可恢复，如鉴权/违规）
export function classifyError(info = {}) {
  const status = info.status == null ? undefined : Number(info.status);
  const name = info.name;
  const uncertain = Boolean(info.uncertain);

  // 「不确定请求」：上游可能已生成但响应丢失（如请求已发出后超时）—— 绝不盲重，交用户确认。
  if (uncertain) {
    return { retryable: false, autoRetry: false, errorClass: "uncertain", uncertain: true, recoverable: true };
  }
  // 超时（AbortError）一律按「不确定」处理：不自动重试，避免重复扣费。
  if (name === "AbortError" || status === 504) {
    return { retryable: false, autoRetry: false, errorClass: "timeout_uncertain", uncertain: true, recoverable: true };
  }
  if (status === 401) {
    return { retryable: false, autoRetry: false, errorClass: "auth", recoverable: false };
  }
  if (status === 413) {
    return { retryable: false, autoRetry: false, errorClass: "payload_too_large", recoverable: false };
  }
  if (status === 400) {
    return { retryable: false, autoRetry: false, errorClass: "bad_request", recoverable: false };
  }
  if (status === 429) {
    return { retryable: true, autoRetry: true, errorClass: "rate_limited", recoverable: true };
  }
  if (status != null && status >= 500 && status < 600) {
    return { retryable: true, autoRetry: true, errorClass: "upstream_5xx", recoverable: true };
  }
  // 无状态码（网络层错误 / DNS / 连接重置等临时错误）：可自动重试。
  return { retryable: true, autoRetry: true, errorClass: "network", recoverable: true };
}

// ── 指数退避 + 抖动 ──
export function computeBackoffMs(attempt, { base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS } = {}) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  const exp = Math.min(cap, base * Math.pow(2, safeAttempt - 1));
  const jitter = Math.random() * exp * 0.3;
  return Math.round(exp + jitter);
}

// ── 状态机：仅允许程序判定的转移，杜绝非法跳变 ──
export function canTransition(from, to) {
  if (from === to) return false;
  switch (from) {
    case TASK_STATUS.QUEUED:
      return to === TASK_STATUS.RUNNING || to === TASK_STATUS.CANCELLED;
    case TASK_STATUS.RUNNING:
      return (
        to === TASK_STATUS.SUCCESS ||
        to === TASK_STATUS.FAILED ||
        to === TASK_STATUS.CANCELLED ||
        to === TASK_STATUS.NEEDS_CONFIRM
      );
    case TASK_STATUS.NEEDS_CONFIRM:
      return to === TASK_STATUS.RUNNING || to === TASK_STATUS.CANCELLED;
    case TASK_STATUS.FAILED:
      return to === TASK_STATUS.RUNNING || to === TASK_STATUS.CANCELLED; // 手动重试 / 取消
    case TASK_STATUS.CANCELLED:
      return to === TASK_STATUS.QUEUED || to === TASK_STATUS.RUNNING; // 恢复
    default:
      return false; // 终态不可再变
  }
}

// 构建一条新任务记录的骨架（不落盘，交由编排层 writeTask）。
// versionId：阶段 5 单屏编辑必填，写入任务记录以便 finalize 时反查版本；阶段 4 初始整批为 null。
export function buildTaskRecord({ projectId, screenIndex, frozenPrompt, model, channelId, idempotencyKey: key, imageSize, aspectRatio, referenceRoles, versionId }) {
  const now = new Date().toISOString();
  const vidTag = versionId ? String(versionId).slice(0, 8) : "v0";
  return {
    task_id: `dsg_${projectId}_${screenIndex}_${vidTag}_${key.slice(0, 12)}`,
    kind: "detail-studio-generation",
    projectId,
    screenIndex,
    frozenPrompt,
    versionId: versionId || null,
    model: model || "",
    channelId: channelId || "",
    imageSize: imageSize || "2K",
    aspectRatio: aspectRatio || "3:4",
    referenceRoles: Array.isArray(referenceRoles) ? referenceRoles : [],
    idempotencyKey: key,
    status: TASK_STATUS.QUEUED,
    attempts: [],
    resultPath: null,
    resultRef: null,
    error: null,
    created_at: now,
    updated_at: now,
    finished_at: null
  };
}
