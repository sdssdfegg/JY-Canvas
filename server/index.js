import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
// 图片地址判定与前端共用同一份（发布时 esbuild 会把 src/shared 内联进 server bundle）。
// 注意：这只管"图片回传"；生图 API 仍然只允许官方中转，见 PRIMARY_CHANNEL_API_BASE_URL。

import {
  JINGYIN_VIDEO_GATEWAY_CHANNEL_ID,
  createGatewayVideoBody,
  gatewayVideoBaseUrl,
  normalizeVideoGenerationRequest
} from "./video-config.js";
import {
  billingGatewayPolicy,
  prepareVideoBillingTask,
  publicBillingErrorPayload
} from "./billing-gateway.js";

import { rootDir } from "./core/app-paths.js";

import { gatewayCompressionMiddleware } from "./core/http-compression.js";

import { createAbortSignal, readTextSafely } from "./core/http-client.js";

import {
  isImageAuthError,
  resolveApiKey,
  upstreamErrorMessage,
} from "./core/image-error-policy.js";
import {
  publicVideoErrorCode,
  publicVideoErrorMessage,
  publicVideoTaskPayload
} from "./core/video-error-policy.js";

import { createAppBootstrap, sendEmbeddedStaticAsset } from "./core/app-bootstrap.js";
const app = express();
const { listenOnPort } = createAppBootstrap(app);

import {
  PORT,
  VIDEO_BILLING_GATEWAY_REQUIRED,
} from "./core/runtime-config.js";

import { generationRequestTraceMiddleware } from "./core/generation-trace.js";
import { finalizeBillingInBackground } from "./core/billing-attempts.js";
import { compactLogMessage } from "./core/format-utils.js";
import { logProcessFault, writeGenerationLog } from "./core/generation-logger.js";

import {
  createVideoRouteFromBillingTask,
  rememberVideoRouteSession,
  videoRouteForStatus
} from "./core/video-route-session.js";

import { registerSystemRoutes } from "./routes/system.routes.js";
import { registerDebugRoutes } from "./routes/debug.routes.js";
import { registerPromptsRoutes } from "./routes/prompts.routes.js";
import { registerHistoryRoutes } from "./routes/history.routes.js";
import { registerStorageRoutes } from "./routes/storage.routes.js";
import { registerAssetsRoutes } from "./routes/assets.routes.js";
import { registerSaveRoutes } from "./routes/save.routes.js";
import { registerDetailRoutes } from "./routes/detail.routes.js";
import { registerOutfitAnalysisRoutes } from "./routes/outfit-analysis.routes.js";
import { registerImageProxyRoutes } from "./routes/image-proxy.routes.js";
import { registerImagesRoutes } from "./routes/images.routes.js";
import { registerOutfitRoutes } from "./routes/outfit.routes.js";

app.use(express.json({ limit: "100mb" }));
app.use(gatewayCompressionMiddleware);
app.use(generationRequestTraceMiddleware);

process.on("unhandledRejection", (reason) => {
  logProcessFault("process-unhandled-rejection", reason);
});

process.on("uncaughtException", (error) => {
  logProcessFault("process-uncaught-exception", error);
});

/**
 * 图片下载/代理允许的目标主机。
 *
 * 2026-09-25 修订（按产品口径）：**生图 API 仍然只允许官方中转**（那是
 * PRIMARY_CHANNEL_API_BASE_URL 管的，见图片转发路径），但**图片回传不限域名**——
 * 官方中转后面挂着 N 个渠道，每个渠道的成图在各自的 CDN 上
 * （实测：leo.yunshuaiapi.com、tos.lingkeai.vip、api.luckfill.com…）。
 * 之前这里拿"渠道 API 主机"当图片白名单，导致这些真实结果图被判 blocked_image_host、
 * 显示缓存失败、前端只能拿到无法加载的原始地址（表现为"图片下载失败 HTTP 403"）。
 *
 * 现在这里只挡两件事：非 https、以及本地/内网主机（SSRF）。
 * 判定与前端共用同一份实现（src/shared/image-hosts.js），发布时由 esbuild 内联进 bundle。
 */

registerSystemRoutes(app);

registerDebugRoutes(app);

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

registerPromptsRoutes(app);

registerHistoryRoutes(app);

registerStorageRoutes(app);

registerAssetsRoutes(app);

registerSaveRoutes(app);

registerDetailRoutes(app);

registerOutfitRoutes(app);
registerOutfitAnalysisRoutes(app);

registerImageProxyRoutes(app);

registerImagesRoutes(app);

async function attachFrontend() {
  if (process.env.NODE_ENV === "production") {
    const distDir = path.join(rootDir, "dist");
    const hasDiskFrontend = existsSync(path.join(distDir, "index.html"));
    if (hasDiskFrontend) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
      return;
    }
    app.get("*", (req, res, next) => {
      if (sendEmbeddedStaticAsset(req, res)) return;
      next();
    });
    return;
  }

  const { createServer } = await import("vite");
  const vite = await createServer({
    root: rootDir,
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
  app.get("*", async (req, res, next) => {
    try {
      const template = await readFile(path.join(rootDir, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

attachFrontend().then(() => {
  listenOnPort(PORT);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
