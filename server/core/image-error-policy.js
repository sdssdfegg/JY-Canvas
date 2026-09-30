// 图片请求的「失败定性 + 对外文案」层。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 这一层回答两个问题：
//   1. 上游这次失败到底是什么性质（401 / 余额 / 图太大 / 权限 / 路由 404 /
//      线路未登记 / 线路只允许手动选线 / 超时 / 上游 5xx）？
//   2. 因此该给前端返回什么 HTTP 状态、什么 errorCode、什么人话？
//
// 为什么值得单独成文件：这里的判定顺序就是产品的故障语义，
// 顺序一动用户看到的报错就变了（历史事故：线路未登记被 400 分支吞掉，
// 最后显示成「生成超时」，用户会一直白等重试）。集中放一处，改的时候能一眼看全。
//
// 几个不能随手改的点：
//   - isImageManualChannelNotFoundError / isImageManualDispatchRequiredError
//     必须在 shouldTryNextChannel、publicImageStatus、imageFailureMessage、
//     publicImageErrorCode 里**每一处**都排在 400 分支之前，否则会被吞；
//   - publicImageErrorCode 里「V11 自己等待超时」的识别靠固定文案「图片接口等待超时」：
//     那时 status 也是 504，但必须归到 channel_timeout 而不是 upstream_server_error；
//   - quotaFailureMessage 的正则依赖上游「remain quota: / need quota:」原文，
//     改文案等于改解析；
//   - sanitizeClientDiagnosticValue 把 apikey/prompt 一类字段替换成 [hidden]，
//     这是**脱敏**，不是格式化，别为了「日志更全」放宽它。

import { normalizeApiKeyInput } from "../features/auth/api-key.js";
import { compactLogMessage } from "./format-utils.js";

export function resolveApiKey(requestKey) {
  return normalizeApiKeyInput(requestKey);
}


export function upstreamErrorMessage(parsed, status) {
  const json = parsed?.json;
  const candidates = [
    json?.error?.message,
    json?.message,
    json?.error_description,
    json?.error?.code,
    parsed?.text
  ].map((value) => String(value || "").trim()).filter(Boolean);
  return candidates[0] || `HTTP ${status}`;
}

export function sanitizeClientDiagnosticValue(key, value, depth = 0) {
  const field = String(key || "").toLowerCase();
  if (field.includes("apikey") || field.includes("api_key") || field.includes("authorization") || field.includes("token") || field === "key") {
    return "[hidden]";
  }
  if (field === "prompt" || field.endsWith("prompt") || field.includes("prompttext")) {
    return "[hidden]";
  }
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return compactLogMessage(value, 300);
  if (depth >= 4) return "[depth-limit]";
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((item, index) => sanitizeClientDiagnosticValue(`${key}.${index}`, item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 80).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeClientDiagnosticValue(entryKey, entryValue, depth + 1)
    ]));
  }
  return compactLogMessage(String(value), 300);
}

export function clientDiagnosticStage(value) {
  const stage = String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80);
  return stage.startsWith("client-") ? stage : "client-event";
}

export function imagePromptLogFields(params = {}, payload = {}) {
  const prompt = String(params.prompt || "");
  const userPrompt = String(payload.prompt || "").trim();
  const productNote = String(payload.productNote || "").trim();
  return {
    promptChars: prompt.length,
    promptBytes: Buffer.byteLength(prompt, "utf8"),
    userPromptChars: userPrompt.length,
    productNoteChars: productNote.length
  };
}

export function isImageRouteNotFoundError(status, message) {
  const numericStatus = Number(status) || 0;
  if (numericStatus !== 404) return false;
  return /openai_error|bad_response_status_code|not[_\s-]*found|route|endpoint|model|unsupported|模型.*不可用|模型.*不存在|无可用渠道/i.test(String(message || ""));
}

/**
 * 2026-09-26：中转站按请求体里的 channelId 做手动选线时，如果这条线路在中转站适配器里
 * **根本没有登记**（例如客户端目录刚加了新线路、中转站还没加），中转站会返回 HTTP 400 +
 * `manual_channel_not_found`。
 *
 * 这类失败不是"等待超时"，也不是网络问题：换请求变体、换上游地址、重试都不会成功，
 * 唯一解是中转站把这条线路补上。所以必须单独识别，原样告诉用户"线路没接通"，
 * 不能被 shouldTryNextChannel 的 400 分支吞掉，最后包装成 504「生成超时，请重新生成。」
 * （真实事故：2026-09-26 15:58:56 批量换装选 banana-2 的 Origin 线路，上游 2.36 秒就返回
 *   `manual_channel_not_found`，界面却显示"生成超时"，用户会一直白等/重试。）
 */
export function isImageManualChannelNotFoundError(message) {
  return /manual[_\s-]*channel[_\s-]*(not[_\s-]*found|missing|unknown|invalid)|channel[_\s-]*not[_\s-]*found|线路[^，。；]{0,16}(不存在|未开通|未接入|未配置|不可用)/i.test(String(message || ""));
}

/**
 * 2026-09-26：有些线路在中转站里声明了「只允许手动选线」（strictManualDispatch）。
 * 客户端带了这条线路的 channelId 但 dispatchMode 不是 manual 时，中转站会直接返回
 * 400 `manual_dispatch_required`——因为不拒绝的话适配器会**把这条线路从自动候选里剔除、
 * 静默改走同模型的其它线路**，用户以为选的是这条线路，实际扣的是别的线路的钱。
 * 这种失败换线路变体/换上游地址都不会成功，重试也没意义，所以单独识别、直接判死。
 */
export function isImageManualDispatchRequiredError(message) {
  return /manual[_\s-]*dispatch[_\s-]*(required|only)|requires?[_\s-]*manual[_\s-]*dispatch|只支持手动选线|只允许手动选线/i.test(String(message || ""));
}

export function imageWorkflowPublicLabel(mode) {
  const key = String(mode || "").trim();
  if (key === "random-background") return "随机背景";
  if (key === "white-refine") return "白底精修";
  if (key === "background-change") return "固定背景";
  if (key === "outpaint") return "批量扩图";
  if (key === "recolor") return "批量改色";
  if (key === "face-swap") return "批量换脸";
  if (key === "pose-remix") return "批量姿态";
  if (key === "local-detail") return "局部回贴";
  if (key === "design-draft") return "设计稿";
  return "图片编辑";
}

export function imageRouteFailureMessage(params = {}) {
  const workflowLabel = imageWorkflowPublicLabel(params.workflowMode);
  return `${workflowLabel}请求被中转站/上游模型路由返回 404；请检查中转站里该模型是否支持当前图片编辑接口，或切换模型/渠道后重试。`;
}

export function shouldTryNextImageVariant(status, message) {
  const numericStatus = Number(status) || 0;
  const text = String(message || "");
  if (
    isImageAuthError(numericStatus, text)
    || isImageQuotaError(numericStatus, text)
    || isImageTooLargeError(text)
    || isImagePermissionError(numericStatus, text)
  ) {
    return false;
  }
  if (isImageRouteNotFoundError(numericStatus, text)) return true;
  if ([429, 500, 502, 503, 504, 524].includes(numericStatus)) return false;
  if (/too many requests|rate\s*limit|timeout|timed out|aborted|openai_error|upstream|bad gateway|gateway|overload|busy|fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(text)) return false;

  const isRequestShapeError = /unsupported|not supported|unknown|unrecognized|invalid[_\s-]*(parameter|param|field|request|format|size|image_size|aspect_ratio)|image_size|aspect_ratio|response_format|size.*must|model_not_found|model.*not.*found|No available channel for model/i.test(text);
  if ([400, 404, 409, 422].includes(numericStatus)) return isRequestShapeError;
  return isRequestShapeError && /model|parameter|param|field|size|image_size|aspect_ratio|format/i.test(text);
}

export function isImageQuotaError(status, message) {
  return status === 402
    || /quota|余额|额度|remain quota|need quota|insufficient[_\s-]*(quota|balance|credit|token|tokens)|insufficient\s+tokens|billing|balance/i.test(String(message || ""));
}

export function isImageAuthError(status, message) {
  return status === 401
    || /invalid token|unauthorized|invalid_api_key|api key.*invalid|token.*invalid|key.*invalid|不接受这把 API Key|密钥|key\s*无效|key无效/i.test(String(message || ""));
}

export function isImageTooLargeError(message) {
  return /image too large|file too large|max\s*(?:2|4|10|20|25)\s*mb|(?:2|4|10|20|25)\s*mb|图片.*过大|文件.*过大/i.test(String(message || ""));
}

export function isImagePermissionError(status, message) {
  if (isImageQuotaError(status, message) || isImageAuthError(status, message)) return false;
  return status === 403 || /forbidden|permission|无权限|未开通|not allowed/i.test(String(message || ""));
}

export function shouldTryNextChannel(status, message) {
  if (isImageAuthError(status, message) || isImageQuotaError(status, message) || isImageTooLargeError(message) || isImagePermissionError(status, message)) return false;
  // 线路在中转站没登记：换上游地址/换变体都没有意义，直接判死，不做任何隐藏重试。
  if (isImageManualChannelNotFoundError(message)) return false;
  // 线路只允许手动选线：换变体也不会变成手动，直接判死。
  if (isImageManualDispatchRequiredError(message)) return false;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if ([400, 404, 422].includes(status)) {
    return /model|unsupported|unknown|image_size|aspect_ratio|openai_error|upstream|not[_\s-]*found|模型.*不可用|模型.*不存在/i.test(String(message || ""));
  }
  return /timeout|aborted|abort|fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|gateway|overload|busy|上游|渠道|openai_error|upstream/i.test(String(message || ""));
}

export function shouldTreatPrivateChannelAuthAsChannelFault(candidate, status, message) {
  if (!candidate?.usesSignedRoute || !candidate?.hasCredential) return false;
  return isImageAuthError(status, message) || /Invalid token|not accepted|unrecognized|unsupported.*key/i.test(String(message || ""));
}

export function publicImageStatus(status, message) {
  if (isImageAuthError(status, message)) return 401;
  if (isImageQuotaError(status, message)) return 402;
  if (isImageTooLargeError(message)) return 400;
  if (isImagePermissionError(status, message)) return 403;
  // 线路没在中转站登记：这是"配置缺失"，不是"服务器/超时"，状态保持客户端错误。
  if (isImageManualChannelNotFoundError(message)) return 400;
  // 线路只允许手动选线：同样是客户端参数问题。
  if (isImageManualDispatchRequiredError(message)) return 400;
  if (isImageRouteNotFoundError(status, message)) return 502;
  if (shouldTryNextChannel(status, message) || status >= 500 || status === 429 || !status) return 504;
  return status;
}

export function quotaFailureMessage(message) {
  const text = String(message || "");
  const quotaMatch = text.match(/remain quota:\s*[＄$]?([\d.]+)[\s\S]*?need quota:\s*[＄$]?([\d.]+)/i);
  if (quotaMatch) return `余额不足：剩余 $${quotaMatch[1]} / 需要 $${quotaMatch[2]}，请充值后重新生成。`;
  return "余额不足，请充值后重新生成。";
}

export function imageFailureMessage(status, upstreamMessage, params, _attempts) {
  const message = compactLogMessage(upstreamMessage || `HTTP ${status}`, 600);
  if (isImageAuthError(status, message)) return "API Key 无效，请检查 KEY 后重新生成。";
  if (isImageQuotaError(status, message)) return quotaFailureMessage(message);
  if (isImageTooLargeError(message)) return "上传图片过大，请压缩或更换素材后重新生成。";
  if (isImagePermissionError(status, message)) return "当前 KEY 无权限调用该模型，请检查账号权限。";
  // 线路在中转站没登记：换线路能马上恢复，重试同一条线路永远不会成功。
  if (isImageManualChannelNotFoundError(message)) {
    return "所选线路在中转站尚未开通，请换一条线路；若每条线路都报这个错，请联系管理员。";
  }
  if (isImageManualDispatchRequiredError(message)) {
    return "所选线路只支持手动选线（dispatchMode=manual），请重新选择线路后重试。";
  }
  if (isImageRouteNotFoundError(status, message)) return imageRouteFailureMessage(params);
  if (/model_not_found|model.*not.*found|模型.*不存在|unsupported.*model/i.test(message)) {
    return "当前模型暂不可用，请稍后重新生成。";
  }
  // 上游 HTTP 5xx/429：和"等待超时"分开说，用户才知道是对方服务的问题。
  // （V11 自己等待超时的消息固定是"图片接口等待超时"，那种仍算超时。）
  if (!/图片接口等待超时/.test(message) && (status >= 500 || status === 429)) {
    return `上游服务器返回错误（HTTP ${status}），请稍后重试或换一条线路。`;
  }
  if (shouldTryNextChannel(status, message)) return "生成超时，请重新生成。";
  return message;
}

export function publicImageErrorCode(status, message) {
  if (isImageAuthError(status, message)) return "invalid_api_key";
  if (isImageQuotaError(status, message)) return "insufficient_quota";
  if (isImageTooLargeError(message)) return "image_too_large";
  if (isImagePermissionError(status, message)) return "permission_denied";
  if (isImageManualChannelNotFoundError(message)) return "channel_not_available";
  if (isImageManualDispatchRequiredError(message)) return "manual_dispatch_required";
  if (isImageRouteNotFoundError(status, message)) return "channel_route_not_found";
  if (/model_not_found|model.*not.*found|模型.*不存在|unsupported.*model/i.test(String(message || ""))) return "model_unavailable";
  // 2026-09-25：上游真的返回了 HTTP 5xx/429 时，不要再统一报成"超时"。
  // 用户需要能区分"服务器返回错误"（上游挂了/限流）和"请求超时"（一直在等没响应）。
  // 注意：V11 自己等待超时被中断时，状态也写成 504，但消息固定是"图片接口等待超时"，
  // 那种情况必须仍然归到 channel_timeout，不能算成上游服务器错误。
  const localWaitTimeout = /图片接口等待超时/.test(String(message || ""));
  if (!localWaitTimeout && (status >= 500 || status === 429)) return "upstream_server_error";
  if (shouldTryNextChannel(status, message) || !status) return "channel_timeout";
  return "upstream_error";
}

export function isFallbackAuthMismatchAfterChannelFault(status, message, attempts) {
  if (!isImageAuthError(status, message) || !Array.isArray(attempts) || attempts.length < 2) return false;
  return attempts.slice(0, -1).some((attempt) => {
    const attemptMessage = attempt?.message || "";
    const attemptStatus = Number(attempt?.status) || 0;
    if (
      isImageAuthError(attemptStatus, attemptMessage)
      || isImageQuotaError(attemptStatus, attemptMessage)
      || isImageTooLargeError(attemptMessage)
      || isImagePermissionError(attemptStatus, attemptMessage)
    ) {
      return false;
    }
    return shouldTryNextChannel(attemptStatus, attemptMessage)
      || attempt?.errorCode === "channel_timeout"
      || attempt?.errorCode === "channel_error";
  });
}

export function publicImageErrorPayload({ requestId = "", status = 502, upstreamMessage = "", params = {}, attempts = [] }) {
  const fallbackAuthMismatch = isFallbackAuthMismatchAfterChannelFault(status, upstreamMessage, attempts);
  return {
    ok: false,
    requestId,
    status: fallbackAuthMismatch ? 504 : publicImageStatus(status, upstreamMessage),
    error: fallbackAuthMismatch ? "channel_timeout" : publicImageErrorCode(status, upstreamMessage),
    message: fallbackAuthMismatch || publicImageErrorCode(status, upstreamMessage) === "channel_timeout"
      ? "生成超时，请重新生成。"
      : imageFailureMessage(status, upstreamMessage, params, attempts),
    attemptCount: attempts.length
  };
}

export function isSmartOutfitInterventionEnabled(value) {
  if (value === false) return false;
  const text = String(value ?? "true").trim().toLowerCase();
  return !["0", "false", "off", "no", "regular", "normal", "常规", "关闭"].includes(text);
}
