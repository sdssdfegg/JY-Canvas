// 本地请求追踪中间件（从 server/index.js 搬出，保持逐字节等价）。
//
// 进程级单例：localGenerationRequestStartedAt 只此一份（Map）。
// 中间件用 header（x-jingyin-client-request-id）派生 requestId 存入 Map；
// 而路由里的 localUploadParseMs 用 payload 派生的 requestId 去查 —— 两者常态不相等，
// 查不到就回落 receivedAt，结果 localUploadParseMs = 0。这是既有行为，故意保留，不可"顺手修正"。
import { compactLogMessage } from "./format-utils.js";
import { writeGenerationLog } from "./generation-logger.js";
import { IMAGE_CONCURRENCY_LIMIT } from "./runtime-config.js";
import { imageQueueSnapshot } from "./image-concurrency.js";

const localGenerationRequestStartedAt = new Map();

function isGenerationTraceEndpoint(pathname = "") {
  return [
    "/api/images",
    "/api/generate-outfit",
    "/api/videos/generations"
  ].includes(pathname);
}

function generationRequestTraceMiddleware(req, res, next) {
  let pathname = "";
  try {
    pathname = new URL(req.originalUrl || req.url || "/", "http://127.0.0.1").pathname;
  } catch {
    pathname = String(req.path || req.url || "").split("?")[0];
  }
  if (req.method !== "POST" || !isGenerationTraceEndpoint(pathname)) {
    next();
    return;
  }

  const startedAt = Date.now();
  const requestId = String(req.headers["x-jingyin-client-request-id"] || `local_${startedAt}_${Math.random().toString(36).slice(2, 8)}`);
  localGenerationRequestStartedAt.set(requestId, startedAt);
  const contentLength = Number.parseInt(String(req.headers["content-length"] || "0"), 10) || 0;
  const baseLog = {
    requestId,
    endpoint: pathname,
    method: req.method,
    contentLength,
    contentType: compactLogMessage(req.headers["content-type"] || "", 180),
    userAgent: compactLogMessage(req.headers["user-agent"] || "", 180)
  };

  writeGenerationLog({
    time: new Date().toISOString(),
    ok: true,
    stage: "local-request-received",
    ...baseLog,
    imageConcurrency: {
      limit: IMAGE_CONCURRENCY_LIMIT,
      ...imageQueueSnapshot()
    }
  }).catch(() => {});

  let abortedLogged = false;
  req.on("aborted", () => {
    abortedLogged = true;
    writeGenerationLog({
      time: new Date().toISOString(),
      ok: false,
      stage: "local-request-aborted",
      ...baseLog,
      timingMs: Date.now() - startedAt
    }).catch(() => {});
  });

  res.on("finish", () => {
    writeGenerationLog({
      time: new Date().toISOString(),
      ok: res.statusCode < 400 && !abortedLogged,
      stage: "local-response-finished",
      ...baseLog,
      status: res.statusCode,
      timingMs: Date.now() - startedAt,
      imageConcurrency: {
        limit: IMAGE_CONCURRENCY_LIMIT,
        ...imageQueueSnapshot()
      }
    }).catch(() => {});
    localGenerationRequestStartedAt.delete(requestId);
  });

  next();
}

/** 查询某请求的上传解析耗时（ms）。沿用中间件口径：用 payload 派生的 requestId 去查
 *  header 派生的 Map，常态查不到 → 回落 receivedAt → 返回 0。既定的"口径不一致"行为，不可修正。 */
function localUploadParseMs(requestId, receivedAt) {
  return Math.max(0, receivedAt - (localGenerationRequestStartedAt.get(requestId) || receivedAt));
}

export { generationRequestTraceMiddleware, localUploadParseMs };
