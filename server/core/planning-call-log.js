// server/core/planning-call-log.js
//
// 零依赖叶子：只记录「详情创作规划批次（analyze / director / quality）」的调用元数据。
// 宪法级数据红线（执行单 V210 §3）：绝不接收/落盘 API Key、用户提示词正文、商品资料、
// 参考图内容、上游返回正文。任何不在白名单内的字段一律丢弃；对误传的敏感字段只告警、不写盘。
//
// 日志落 <数据根>/logs/planning-calls.jsonl（gitignore，不进 seed / 封装包 / git）。

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { rootDir } from "./app-paths.js";

const LOG_FILE = path.join(rootDir, "logs", "planning-calls.jsonl");

// 只允许落盘的元数据字段白名单（执行单 §0.4）。
const ALLOWED_KEYS = [
  "time", "stage", "model", "durationMs", "upstreamStatus",
  "responseChars", "outputScreenCount", "errorClass", "ok"
];

// 错误类别枚举（执行单 §2）：超时 / 上游 HTTP 非 2xx / JSON 解析失败 / 空屏 / 无内容 / 未知。
export const PLANNING_ERROR_CLASSES = Object.freeze([
  "timeout", "upstream_error", "parse_failed", "empty_screens", "no_content", "unknown"
]);

// 防御性敏感字段黑名单（即便调用方误传，也不写盘）。覆盖 KEY 类与内容类。
const SENSITIVE_KEY_PATTERN = /^(api[_-]?key|apikey|token|secret|authorization|auth[_-]?token|password|passwd|pwd|cookie|access[_-]?key|private[_-]?key|bearer|prompt|systemprompt|userprompt|message_text|upstream|text|content|productdata|referencimage|rawprompt|frozenprompt)$/i;

function coerceNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isMissing(value) {
  return value === null || value === undefined;
}

// 纯函数：从调用方传入的元数据中，只保留白名单字段并规范类型，丢弃其它一切。
// 返回的对象安全可写盘（不含任何敏感内容）。本函数被 verify 脚本负向对照断言。
export function buildPlanningLogEntry(meta) {
  const source = meta && typeof meta === "object" ? meta : {};
  const entry = {
    time: (typeof source.time === "string" && source.time) ? source.time : new Date().toISOString(),
    stage: typeof source.stage === "string" ? source.stage : "unknown",
    model: typeof source.model === "string" ? source.model : "",
    durationMs: coerceNumber(source.durationMs),
    upstreamStatus: isMissing(source.upstreamStatus) ? null : coerceNumber(source.upstreamStatus),
    responseChars: coerceNumber(source.responseChars),
    outputScreenCount: isMissing(source.outputScreenCount) ? null : coerceNumber(source.outputScreenCount),
    errorClass: PLANNING_ERROR_CLASSES.includes(source.errorClass) ? source.errorClass : null,
    ok: source.ok === true
  };
  // 防御：任何敏感键误传 → 只告警不写盘（白名单已天然排除）。
  const leaked = Object.keys(source).filter((k) => !ALLOWED_KEYS.includes(k) && SENSITIVE_KEY_PATTERN.test(k));
  if (leaked.length) {
    console.warn("[planning-call-log] 检测到敏感字段误传，已丢弃不写盘：", leaked.join(", "));
  }
  return entry;
}

export async function logPlanningCall(meta) {
  const entry = buildPlanningLogEntry(meta);
  try {
    const logDir = path.join(rootDir, "logs");
    await mkdir(logDir, { recursive: true });
    await appendFile(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // 日志写入失败绝不能影响规划主流程。
  }
}
