// 视频生成 / 状态查询路由（V11-RF-203 —— 批次 4 的最后一张，后端结构收尾）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 来源：`server/app.js` 第 110–496 行（220 之前位于 index.js，220 随装配层整体搬到 app.js）。
//   handler **逐字搬移**；注册位置保持 `debug` 之后、`prompts` 之前不变（原地替换）。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                            ← 形参
//   JINGYIN_VIDEO_GATEWAY_CHANNEL_ID / createGatewayVideoBody /
//     gatewayVideoBaseUrl / normalizeVideoGenerationRequest         ← server/video-config.js
//   billingGatewayPolicy / prepareVideoBillingTask /
//     publicBillingErrorPayload                                     ← server/billing-gateway.js
//   VIDEO_BILLING_GATEWAY_REQUIRED                                  ← server/core/runtime-config.js
//   createAbortSignal / readTextSafely                              ← server/core/http-client.js
//   isImageAuthError / resolveApiKey / upstreamErrorMessage          ← server/core/image-error-policy.js
//   publicVideoErrorCode / publicVideoErrorMessage /
//     publicVideoTaskPayload                                        ← server/core/video-error-policy.js
//   writeGenerationLog                                              ← server/core/generation-logger.js
//   finalizeBillingInBackground                                     ← server/core/billing-attempts.js
//   compactLogMessage                                               ← server/core/format-utils.js
//   createVideoRouteFromBillingTask / rememberVideoRouteSession /
//     videoRouteForStatus                                           ← server/core/video-route-session.js
//
// ⇒ **没有任何符号来自 app.js 作用域**（0 条）。签名用默认 `(app)`。
//   模块内零 `express.Router()` / 零第二次 `express()` / 零 `multer(` / 零 `new Map()`。
//   🔴 会话状态 `videoRouteSessions` **只能 import**（定义在 core/video-route-session.js，
//      受 `state-singleton-check` 监视），本模块禁止自建第二份并发/会话状态。
//
// 逐字保留（执行单 §1-3，改一个字就会红一片）：
//   - 所有中文文案、错误码、超时数字（VIDEO_REQUEST_TIMEOUT_MS / VIDEO_STATUS_TIMEOUT_MS）；
//   - `VIDEO_BILLING_GATEWAY_REQUIRED` 的判定语义与 503 分支；
//   - `finalizeBillingInBackground` 的成功/失败两处调用点与全部字段；
//   - status 端点走 `videoRouteForStatus` 兜底（无会话时 `createVideoRouteFromBillingTask(null, …)`）。

import {
  JINGYIN_VIDEO_GATEWAY_CHANNEL_ID,
  createGatewayVideoBody,
  gatewayVideoBaseUrl,
  normalizeVideoGenerationRequest
} from "../video-config.js";
import {
  billingGatewayPolicy,
  prepareVideoBillingTask,
  publicBillingErrorPayload
} from "../billing-gateway.js";
import { VIDEO_BILLING_GATEWAY_REQUIRED } from "../core/runtime-config.js";
import { createAbortSignal, readTextSafely } from "../core/http-client.js";
import {
  isImageAuthError,
  resolveApiKey,
  upstreamErrorMessage,
} from "../core/image-error-policy.js";
import {
  publicVideoErrorCode,
  publicVideoErrorMessage,
  publicVideoTaskPayload
} from "../core/video-error-policy.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import { finalizeBillingInBackground } from "../core/billing-attempts.js";
import { compactLogMessage } from "../core/format-utils.js";
import {
  createVideoRouteFromBillingTask,
  rememberVideoRouteSession,
  videoRouteForStatus
} from "../core/video-route-session.js";

export function registerVideosRoutes(app) {
  app.post("/api/videos/generations", async (req, res) => {
    const receivedAt = Date.now();
    const requestId = `vid_${receivedAt}_${Math.random().toString(36).slice(2, 9)}`;
    const apiKey = resolveApiKey(req.body?.apiKey);
    const fallbackBaseUrl = gatewayVideoBaseUrl();
    const params = normalizeVideoGenerationRequest(req.body || {});

    if (!apiKey) {
      return res.status(400).json({ ok: false, error: "missing_api_key", message: "缺少 API Key" });
    }
    if (params.validationError === "missing_prompt") {
      return res.status(400).json({ ok: false, error: "missing_prompt", message: "缺少视频提示词" });
    }
    if (params.validationError === "invalid_duration") {
      return res.status(400).json({ ok: false, error: "invalid_duration", message: "当前视频模型不支持该时长" });
    }
    if (VIDEO_BILLING_GATEWAY_REQUIRED && !billingGatewayPolicy().enabled) {
      return res.status(503).json({
        ok: false,
        error: "video_billing_gateway_required",
        message: "视频计费网关未启用，请先接入静音中转站计费后再生成。"
      });
    }

    const body = createGatewayVideoBody(params);
    let abort = null;
    let forwardedAt = receivedAt;
    let billingTask = null;
    let route = null;

    try {
      try {
        billingTask = await prepareVideoBillingTask({
          requestId,
          customerApiKey: apiKey,
          params,
          metadata: {
            endpoint: "/api/videos/generations"
          }
        });
        if (billingTask?.enabled) {
          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: true,
            stage: "billing-gateway-prepare-video",
            billingGatewayTaskId: billingTask.gatewayTaskId,
            hasRouteToken: Boolean(billingTask.routeToken),
            signedRoute: Boolean(billingTask.signedRoute)
          });
        }
      } catch (error) {
        const errorPayload = publicBillingErrorPayload(error, requestId);
        await writeGenerationLog({
          time: new Date().toISOString(),
          requestId,
          ok: false,
          stage: "billing-gateway-prepare-video",
          status: errorPayload.status,
          error: errorPayload.error,
          message: errorPayload.message
        });
        return res.status(errorPayload.status).json(errorPayload);
      }

      route = createVideoRouteFromBillingTask(billingTask, fallbackBaseUrl, apiKey);
      if (!route.hasCredential) {
        return res.status(400).json({
          ok: false,
          requestId,
          error: "video_channel_not_configured",
          message: billingTask?.enabled
            ? "视频通道未签发网关路由，请检查静音中转站的视频渠道配置。"
            : "视频通道未配置，请先在静音中转站启用视频模型路由。"
        });
      }

      abort = createAbortSignal(Math.max(60_000, Number.parseInt(process.env.VIDEO_REQUEST_TIMEOUT_MS || "120000", 10) || 120_000));
      forwardedAt = Date.now();

      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: true,
        stage: "forward-video-request",
        url: route.createUrl,
        channelId: route.channelId,
        channelRole: route.channelRole,
        requestedModel: params.model,
        duration: params.duration,
        resolution: params.resolution,
        aspectRatio: params.aspectRatio,
        width: params.width,
        height: params.height,
        hasApiKey: Boolean(apiKey),
        hasChannelApiKey: route.hasCredential,
        usesSignedRoute: route.usesSignedRoute,
        usesPrivateChannelKey: false,
        hasImageReference: Boolean(params.image),
        costEstimate: params.costEstimate
      });

      const response = await fetch(route.createUrl, {
        method: "POST",
        headers: {
          ...route.headers,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: abort.signal
      });
      const responseAt = Date.now();
      const parsed = await readTextSafely(response);
      const upstreamMessage = upstreamErrorMessage(parsed, response.status);
      const timing = {
        totalMs: Date.now() - receivedAt,
        channelWaitMs: responseAt - forwardedAt,
        parseMs: Date.now() - responseAt
      };

      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: response.ok,
        status: response.status,
        stage: "video-generate",
        url: route.createUrl,
        channelId: route.channelId,
        channelRole: route.channelRole,
        requestedModel: params.model,
        duration: params.duration,
        resolution: params.resolution,
        aspectRatio: params.aspectRatio,
        width: params.width,
        height: params.height,
        hasApiKey: Boolean(apiKey),
        hasChannelApiKey: route.hasCredential,
        usesSignedRoute: route.usesSignedRoute,
        usesPrivateChannelKey: false,
        hasImageReference: Boolean(params.image),
        costEstimate: params.costEstimate,
        timing,
        response: parsed.json ? { taskId: parsed.json.task_id || parsed.json.id || "", status: parsed.json.status || "" } : { textLength: parsed.text.length },
        ...(response.ok ? {} : {
          failureReason: publicVideoErrorCode(response.status, upstreamMessage),
          upstreamError: compactLogMessage(upstreamMessage, 900)
        })
      });

      if (!response.ok) {
        const error = publicVideoErrorCode(response.status, upstreamMessage);
        finalizeBillingInBackground(billingTask, {
          ok: false,
          status: isImageAuthError(response.status, upstreamMessage) ? 401 : response.status >= 500 ? 504 : response.status,
          error,
          message: publicVideoErrorMessage(response.status, upstreamMessage),
          usedModel: params.model,
          timingMs: timing.totalMs,
          attempts: [{
            channelId: route.channelId,
            channelRole: route.channelRole,
            status: response.status,
            ok: false,
            model: params.model,
            errorCode: error
          }]
        });
        return res.status(isImageAuthError(response.status, upstreamMessage) ? 401 : response.status >= 500 ? 504 : response.status).json({
          ok: false,
          requestId,
          error,
          message: publicVideoErrorMessage(response.status, upstreamMessage),
          timing
        });
      }

      const publicTask = publicVideoTaskPayload(parsed.json || {});
      rememberVideoRouteSession(publicTask.taskId, route);
      finalizeBillingInBackground(billingTask, {
        ok: true,
        status: response.status,
        usedChannel: {
          channelId: route.channelId,
          channelRole: route.channelRole,
          status: response.status,
          ok: true,
          model: params.model
        },
        usedModel: params.model,
        upstreamTaskId: publicTask.taskId,
        outputCount: publicTask.taskId ? 1 : 0,
        timingMs: timing.totalMs,
        attempts: [{
          channelId: route.channelId,
          channelRole: route.channelRole,
          status: response.status,
          ok: true,
          model: params.model
        }]
      });

      return res.json({
        ok: true,
        requestId,
        task: publicTask,
        timing,
        usedModel: params.model,
        duration: params.duration,
        resolution: params.resolution,
        aspectRatio: params.aspectRatio,
        costEstimate: params.costEstimate
      });
    } catch (error) {
      const message = error?.name === "AbortError" ? "视频接口等待超时" : error instanceof Error ? error.message : String(error);
      const status = error?.name === "AbortError" ? 504 : 502;
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: false,
        status,
        stage: "video-generate-error",
        url: route?.createUrl || "",
        channelId: route?.channelId || JINGYIN_VIDEO_GATEWAY_CHANNEL_ID,
        channelRole: route?.channelRole || "video-primary",
        requestedModel: params.model,
        duration: params.duration,
        resolution: params.resolution,
        aspectRatio: params.aspectRatio,
        hasApiKey: Boolean(apiKey),
        hasChannelApiKey: Boolean(route?.hasCredential),
        usesSignedRoute: Boolean(route?.usesSignedRoute),
        usesPrivateChannelKey: false,
        timing: {
          totalMs: Date.now() - receivedAt,
          channelWaitMs: Date.now() - forwardedAt,
          parseMs: 0
        },
        failureReason: publicVideoErrorCode(status, message),
        upstreamError: compactLogMessage(message, 900)
      });
      finalizeBillingInBackground(billingTask, {
        ok: false,
        status,
        error: publicVideoErrorCode(status, message),
        message: publicVideoErrorMessage(status, message),
        usedModel: params.model,
        timingMs: Date.now() - receivedAt,
        attempts: [{
          channelId: route?.channelId || JINGYIN_VIDEO_GATEWAY_CHANNEL_ID,
          channelRole: route?.channelRole || "video-primary",
          status,
          ok: false,
          model: params.model,
          errorCode: publicVideoErrorCode(status, message)
        }]
      });
      return res.status(status).json({
        ok: false,
        requestId,
        error: publicVideoErrorCode(status, message),
        message: publicVideoErrorMessage(status, message)
      });
    } finally {
      abort?.dispose();
    }
  });

  app.post("/api/videos/status", async (req, res) => {
    const receivedAt = Date.now();
    const taskId = String(req.body?.taskId || req.body?.id || "").trim();
    const requestId = `vid_status_${receivedAt}_${Math.random().toString(36).slice(2, 9)}`;
    const apiKey = resolveApiKey(req.body?.apiKey);

    if (!apiKey) {
      return res.status(400).json({ ok: false, error: "missing_api_key", message: "缺少 API Key" });
    }
    if (!taskId) {
      return res.status(400).json({ ok: false, error: "missing_task_id", message: "缺少视频任务 ID" });
    }
    const route = videoRouteForStatus(taskId, gatewayVideoBaseUrl(), apiKey);
    if (!route.hasCredential) {
      return res.status(400).json({
        ok: false,
        error: "video_channel_not_configured",
        message: "视频通道未配置或任务签发路由已过期，请重新生成。"
      });
    }

    const url = route.statusUrl;
    const abort = createAbortSignal(Math.max(30_000, Number.parseInt(process.env.VIDEO_STATUS_TIMEOUT_MS || "60000", 10) || 60_000));
    const forwardedAt = Date.now();

    try {
      const response = await fetch(url, {
        headers: route.headers,
        signal: abort.signal
      });
      const responseAt = Date.now();
      const parsed = await readTextSafely(response);
      const upstreamMessage = upstreamErrorMessage(parsed, response.status);
      const timing = {
        totalMs: Date.now() - receivedAt,
        channelWaitMs: responseAt - forwardedAt,
        parseMs: Date.now() - responseAt
      };
      const statusTask = publicVideoTaskPayload(parsed.json || {}, taskId);

      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: response.ok,
        status: response.status,
        stage: "video-status",
        url,
        channelId: route.channelId,
        channelRole: route.channelRole,
        taskId,
        hasApiKey: Boolean(apiKey),
        hasChannelApiKey: route.hasCredential,
        usesSignedRoute: route.usesSignedRoute,
        usesPrivateChannelKey: false,
        timing,
        response: parsed.json
          ? {
              taskId: statusTask.taskId,
              status: statusTask.status || "",
              hasUrl: Boolean(statusTask.url),
              error: compactLogMessage(statusTask.error, 300)
            }
          : { textLength: parsed.text.length },
        ...(response.ok ? {} : {
          failureReason: publicVideoErrorCode(response.status, upstreamMessage),
          upstreamError: compactLogMessage(upstreamMessage, 900)
        })
      });

      if (!response.ok) {
        return res.status(isImageAuthError(response.status, upstreamMessage) ? 401 : response.status >= 500 ? 504 : response.status).json({
          ok: false,
          requestId,
          error: publicVideoErrorCode(response.status, upstreamMessage),
          message: publicVideoErrorMessage(response.status, upstreamMessage),
          timing
        });
      }

      return res.json({
        ok: true,
        requestId,
        task: statusTask,
        timing
      });
    } catch (error) {
      const message = error?.name === "AbortError" ? "视频状态查询超时" : error instanceof Error ? error.message : String(error);
      const status = error?.name === "AbortError" ? 504 : 502;
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: false,
        status,
        stage: "video-status-error",
        url,
        channelId: route.channelId,
        channelRole: route.channelRole,
        taskId,
        hasApiKey: Boolean(apiKey),
        hasChannelApiKey: route.hasCredential,
        usesSignedRoute: route.usesSignedRoute,
        usesPrivateChannelKey: false,
        timing: {
          totalMs: Date.now() - receivedAt,
          channelWaitMs: Date.now() - forwardedAt,
          parseMs: 0
        },
        failureReason: publicVideoErrorCode(status, message),
        upstreamError: compactLogMessage(message, 900)
      });
      return res.status(status).json({
        ok: false,
        requestId,
        error: publicVideoErrorCode(status, message),
        message: publicVideoErrorMessage(status, message)
      });
    } finally {
      abort.dispose();
    }
  });
}
