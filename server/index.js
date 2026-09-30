import "dotenv/config";
import express from "express";
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
// 图片地址判定与前端共用同一份（发布时 esbuild 会把 src/shared 内联进 server bundle）。
// 注意：这只管"图片回传"；生图 API 仍然只允许官方中转，见 PRIMARY_CHANNEL_API_BASE_URL。
import {
  buildImageRequestVariants,
  extractImagesFromResponse,
  normalizeBaseUrl,
  normalizeImageRequest,
  validateImageCapabilities,
  validateImageRouting,
  summarizeResponse
} from "./channel.js";
import {
  PRIMARY_CHANNEL_API_BASE_URL,
  buildChannelBaseCandidates,
  buildImageChannelBaseCandidates,
  channelEndpointForBaseUrl,
  apiKeyForChannel,
  apiKeyHeadersForChannel,
  channelLogFields,
  publicChannelGateways,
  publicChannelModels,
  publicChannelPolicyConfig,
  upstreamModelForChannel,
  publicRoutingCatalog
} from "./channel-config.js";
import {
  JINGYIN_VIDEO_GATEWAY_CHANNEL_ID,
  createGatewayVideoBody,
  gatewayVideoBaseUrl,
  normalizeVideoGenerationRequest,
  publicVideoModels,
  publicVideoPolicyConfig
} from "./video-config.js";
import {
  billingGatewayPolicy,
  finalizeBillingTask,
  prepareImageBillingTask,
  prepareVideoBillingTask,
  publicBillingErrorPayload,
  publicBillingGatewayPolicy
} from "./billing-gateway.js";
import { createDetailAiPlan } from "./detail-ai.js";
import { buildDetailPromptGroup as buildDetailPromptGroupV2 } from "./detail-middleware.js";
import { buildOutfitPrompt, primaryOutfitGenerationError } from "./outfit-skill.js";
import { validateOutfitIntent } from "../src/shared/outfit-intent.js";
import { validateRetouchIntent } from "../src/shared/retouch-intent.js";
import { createOutfitMasterFitSpec } from "./outfit-master-fit-ai.js";
import { createOutfitQualityCheck } from "./outfit-quality-ai.js";
import { createOutfitPoseAnchor } from "./outfit-pose-ai.js";
import { createQuickPromptRewrite, quickPromptFallback } from "./quick-prompt-ai.js";
import { createReferencePromptRewrite, localReferencePrompt } from "./reference-ai.js";
import { EMBEDDED_STATIC_ASSETS } from "./static-assets.generated.js";

import {
  canvasAssetDir,
  dataDir,
  historyImageDir,
  packagedRootDir,
  referenceAssetDir,
  resultDir,
  rootDir,
  uploadTempDir
} from "./core/app-paths.js";
import {
  getSaveDirectory,
  normalizeUsableSaveDirectory,
  setSaveDirectory
} from "./core/app-settings.js";
import { gatewayCompressionMiddleware } from "./core/http-compression.js";
import {
  imageExtensionFromType,
  mimeTypeFromFile
} from "./core/file-naming.js";
import {
  downloadExternalImageWithFallback,
  imageProxyUrl,
  parseProxyTarget,
  streamExternalImageProxy
} from "./core/image-proxy.js";
import { createAbortSignal, readTextSafely } from "./core/http-client.js";
import {
  archiveReferenceAssets,
  buildHistoryItems,
  persistGeneratedItemsInBackground,
  sanitizeSubfolderName,
  writeJingyinNumberedImage,
  writeProcessedImage
} from "./core/asset-persist.js";
import {
  clientDiagnosticStage,
  imageFailureMessage,
  imagePromptLogFields,
  isImageAuthError,
  isImagePermissionError,
  isImageQuotaError,
  isSmartOutfitInterventionEnabled,
  publicImageErrorCode,
  publicImageErrorPayload,
  quotaFailureMessage,
  resolveApiKey,
  sanitizeClientDiagnosticValue,
  shouldTreatPrivateChannelAuthAsChannelFault,
  shouldTryNextChannel,
  shouldTryNextImageVariant,
  upstreamErrorMessage
} from "./core/image-error-policy.js";
import { canvasAssetPath, historyImagePath, referenceAssetPath } from "./core/asset-urls.js";
import {
  annotateHistoryIntegrity,
  appendHistoryResults,
  archiveIncomingHistoryItem,
  ensureHistoryRepairBackup,
  itemWithArchivedImage,
  normalizeHistoryItem,
  readHistoryResults,
  writeHistoryResults
} from "./core/history-store.js";
import { imageBufferFromPayload } from "./core/image-payload.js";
const app = express();

import {
  DOWNLOAD_CHUNK_BYTES,
  IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS,
  IMAGE_CONCURRENCY_LIMIT,
  IMAGE_PROXY_TIMEOUT_MS,
  LOCAL_HTTP_TIMEOUT_MS,
  PORT,
  PORT_FALLBACK_LIMIT,
  RESULT_CACHE_CLEANUP_INTERVAL_MS,
  RESULT_CACHE_CONTROL,
  RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS,
  RESULT_CACHE_MAX_DISK_USAGE_RATIO,
  RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS,
  RESULT_CACHE_TTL_DAYS,
  RESULT_CACHE_TTL_MS,
  RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS,
  RESULT_DISPLAY_CACHE_TIMEOUT_MS,
  VIDEO_BILLING_GATEWAY_REQUIRED,
  VIDEO_ROUTE_SESSION_TTL_MS
} from "./core/runtime-config.js";
import { compactLogMessage, sanitizeFilePart } from "./core/format-utils.js";
import { logProcessFault, writeAssetLog, writeGenerationLog } from "./core/generation-logger.js";
import {
  IMAGE_UPLOAD_PARSE_CEILING,
  ensureFileBuffer,
  imageForwardUpload,
  largeImageUpload,
  removeUploadedFiles,
  upload,
  wrapOutfitUpload
} from "./core/uploads.js";
let activeImageRequestCount = 0;
const imageRequestQueue = [];
const videoRouteSessions = new Map();
const localGenerationRequestStartedAt = new Map();
let resultCacheCleanupRunning = false;
let resultCacheCleanupTimer = null;
let resultCacheCleanupStarted = false;

app.use(express.json({ limit: "100mb" }));
app.use(gatewayCompressionMiddleware);
app.use(generationRequestTraceMiddleware);


function shouldAutoOpenBrowser() {
  return process.env.JINGYIN_NO_BROWSER !== "1" && (
    Boolean(packagedRootDir) || process.env.JINGYIN_OPEN_BROWSER === "1"
  );
}

function openAppInBrowser(port = PORT) {
  if (!shouldAutoOpenBrowser()) return;
  const url = `http://127.0.0.1:${port}/`;
  const command = process.platform === "win32"
    ? { file: "cmd.exe", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { file: "open", args: [url] }
      : { file: "xdg-open", args: [url] };
  try {
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
  } catch {
    // Opening the browser is a convenience; the local server still works without it.
  }
}

function sendEmbeddedStaticAsset(req, res) {
  const files = EMBEDDED_STATIC_ASSETS?.files;
  if (!files) return false;

  let pathname = "/";
  try {
    pathname = new URL(req.originalUrl || req.url || "/", "http://127.0.0.1").pathname;
  } catch {
    pathname = "/";
  }

  const normalizedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const asset = files[normalizedPath] || (!path.extname(normalizedPath) ? files["/index.html"] : null);
  if (!asset) return false;

  const body = Buffer.from(asset.data, "base64");
  res.status(200)
    .set({
      "Content-Type": asset.type || "application/octet-stream",
      "Content-Length": String(body.length),
      "Cache-Control": normalizedPath.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache"
    })
    .end(body);
  return true;
}

function imageSlotWeight(value) {
  return Math.max(1, Math.min(IMAGE_CONCURRENCY_LIMIT, Number.parseInt(value, 10) || 1));
}

function drainImageQueue() {
  while (
    imageRequestQueue.length > 0
    && activeImageRequestCount + imageRequestQueue[0].weight <= IMAGE_CONCURRENCY_LIMIT
  ) {
    const next = imageRequestQueue.shift();
    next.grant();
  }
}

function acquireImageSlot(weight = 1) {
  const slotWeight = imageSlotWeight(weight);
  return new Promise((resolve) => {
    const grant = () => {
      activeImageRequestCount += slotWeight;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        activeImageRequestCount = Math.max(0, activeImageRequestCount - slotWeight);
        queueMicrotask(drainImageQueue);
      });
    };

    if (activeImageRequestCount + slotWeight <= IMAGE_CONCURRENCY_LIMIT) {
      grant();
    } else {
      imageRequestQueue.push({ weight: slotWeight, grant });
    }
  });
}

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
      active: activeImageRequestCount,
      queued: imageRequestQueue.length
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
        active: activeImageRequestCount,
        queued: imageRequestQueue.length
      }
    }).catch(() => {});
    localGenerationRequestStartedAt.delete(requestId);
  });

  next();
}

function billingChannelCandidates(baseUrls = [], params = {}) {
  return baseUrls.map((baseUrl, index) => {
    const channel = channelLogFields(baseUrl, index, baseUrls.length);
    return {
      channelId: channel.channelId,
      channelRole: channel.channelRole,
      channelAttempt: channel.channelAttempt,
      channelCandidateCount: channel.channelCandidateCount,
      model: upstreamModelForChannel(baseUrl, params.model),
      billingMode: "lightweight-gateway"
    };
  });
}

function billingAttemptSummaries(attempts = []) {
  return (Array.isArray(attempts) ? attempts : []).map((attempt) => ({
    channelId: attempt?.channelId || "unknown",
    channelRole: attempt?.channelRole || "unknown",
    status: attempt?.status || 0,
    ok: Boolean(attempt?.ok),
    model: attempt?.model || "",
    requestFormat: attempt?.requestFormat || "",
    errorCode: attempt?.errorCode || ""
  }));
}

async function prepareImageBillingForRequest({ requestId, apiKey, params, files, candidates, metadata }) {
  try {
    const billingTask = await prepareImageBillingTask({
      requestId,
      customerApiKey: apiKey,
      params,
      files,
      candidates: billingChannelCandidates(candidates, params),
      metadata
    });
    if (billingTask?.enabled) {
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: true,
        stage: "billing-gateway-prepare",
        billingGatewayTaskId: billingTask.gatewayTaskId,
        hasRouteToken: Boolean(billingTask.routeToken),
        signedRoute: Boolean(billingTask.signedRoute),
        metadata
      });
    }
    return { billingTask, errorPayload: null };
  } catch (error) {
    const errorPayload = publicBillingErrorPayload(error, requestId);
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: false,
      stage: "billing-gateway-prepare",
      status: errorPayload.status,
      error: errorPayload.error,
      message: errorPayload.message,
      metadata
    });
    return { billingTask: null, errorPayload };
  }
}

function finalizeBillingInBackground(billingTask, result = {}) {
  if (!billingTask?.enabled) return;
  const payload = {
    ...result,
    attempts: billingAttemptSummaries(result.attempts)
  };
  setTimeout(() => {
    finalizeBillingTask(billingTask, payload)
      .then((finalized) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: billingTask.requestId,
        ok: true,
        stage: "billing-gateway-finalize",
        billingGatewayTaskId: billingTask.gatewayTaskId,
        status: finalized.status,
        resultOk: Boolean(payload.ok),
        outputCount: payload.outputCount || 0,
        timingMs: payload.timingMs || 0
      }))
      .catch((error) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: billingTask.requestId,
        ok: false,
        stage: "billing-gateway-finalize",
        billingGatewayTaskId: billingTask.gatewayTaskId,
        resultOk: Boolean(payload.ok),
        error: error instanceof Error ? error.message : String(error)
      }));
  }, 0);
}


process.on("unhandledRejection", (reason) => {
  logProcessFault("process-unhandled-rejection", reason);
});

process.on("uncaughtException", (error) => {
  logProcessFault("process-uncaught-exception", error);
});





async function openDirectory(directory) {
  const resolved = await setSaveDirectory(directory || await getSaveDirectory());
  const child = spawn("explorer.exe", [resolved], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  return resolved;
}

async function pickDirectory(initialDirectory) {
  const normalizedInitialDirectory = await normalizeUsableSaveDirectory(initialDirectory);
  await mkdir(normalizedInitialDirectory, { recursive: true });
  return new Promise((resolve, reject) => {
    const script = [
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
      "Add-Type -AssemblyName System.Drawing | Out-Null",
      "$owner = New-Object System.Windows.Forms.Form",
      "$owner.Text = 'Jingyin Directory Picker'",
      "$owner.ShowInTaskbar = $false",
      "$owner.StartPosition = 'Manual'",
      "$owner.Size = New-Object System.Drawing.Size(1, 1)",
      "$owner.Location = New-Object System.Drawing.Point(-32000, -32000)",
      "$owner.TopMost = $true",
      "$owner.Opacity = 0",
      "$null = $owner.Show()",
      "$owner.Activate()",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = 'Select save directory'",
      "$dialog.ShowNewFolderButton = $true",
      "$dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer",
      "$initial = $env:JY_PICK_INITIAL",
      "if ($initial -and (Test-Path -LiteralPath $initial)) { $dialog.SelectedPath = $initial }",
      "try { $result = $dialog.ShowDialog($owner); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath } } finally { $owner.Close(); $owner.Dispose(); $dialog.Dispose() }"
    ].join("; ");

    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], {
      env: { ...process.env, JY_PICK_INITIAL: normalizedInitialDirectory },
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `目录选择器退出 ${code}`));
        return;
      }
      const directory = stdout.trim();
      resolve(directory ? path.resolve(directory) : "");
    });
  });
}



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

function imageForImmediateDisplay(image) {
  if (!image || typeof image !== "object") return image;
  if (image.type !== "url") return image;
  const sourceUrl = String(image.sourceUrl || image.value || "").trim();
  if (!/^https?:\/\//i.test(sourceUrl)) return image;
  const localUrl = imageProxyUrl(sourceUrl);
  return {
    ...image,
    value: sourceUrl,
    localUrl,
    proxySourceUrl: sourceUrl,
    sourceUrl
  };
}

function isBase64ImagePayload(image) {
  if (!image || typeof image !== "object") return false;
  if (image.type === "b64_json") return true;
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(image.value || image.localUrl || ""));
}

function hasHistoryDisplayArchive(item) {
  return Boolean(
    item?.image?.archiveFile
    || String(item?.image?.localUrl || "").startsWith("/api/history-image/")
  );
}

async function historyItemForImmediateDisplay(item, requestId = "", timeoutMs = RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS) {
  const normalized = normalizeHistoryItem(item);
  const wasArchived = hasHistoryDisplayArchive(normalized);
  const cacheStartedAt = Date.now();
  const archived = await archiveIncomingHistoryItem(normalized, timeoutMs);
  if (hasHistoryDisplayArchive(archived)) {
    if (!wasArchived) {
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId: requestId || item.id,
        ok: true,
        stage: isBase64ImagePayload(item?.image) ? "display-cache-base64-history-image" : "display-cache-url-history-image",
        itemId: item.id,
        archiveFile: archived.image.archiveFile || "",
        localUrl: archived.image.localUrl || "",
        timingMs: Date.now() - cacheStartedAt,
        timeoutMs
      });
    }
    return archived;
  }
  if (!wasArchived && normalized?.image) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId: requestId || item.id,
      ok: true,
      stage: "display-cache-history-image-deferred",
      itemId: item.id,
      timingMs: Date.now() - cacheStartedAt,
      timeoutMs
    });
  }
  return {
    ...normalized,
    image: imageForImmediateDisplay(archived?.image || normalized?.image)
  };
}


function channelBaseCandidates() {
  // 中文注释：每次请求都从主渠道开始；备用渠道只做当次故障兜底，不把上次成功备用缓存成下一次默认。
  return buildChannelBaseCandidates(PRIMARY_CHANNEL_API_BASE_URL);
}

function imageChannelBaseCandidates(model) {
  return buildImageChannelBaseCandidates(model);
}

const JSON_IMAGE_URLS_CHANNEL = "silent-tt25-line-07";

// New API's billing expression cannot read channelId from multipart fields.
// Prepare the same compact input that the Pro JSON path uses, but keep it
// limited to TT 2.5 Subdirect. Other TT 2.5 lines and masked edits stay on
// their existing multipart path.
async function prepareJsonImageUrlsForChannel(params, files) {
  if (
    params?.model !== "tt-image-2.5"
    || params?.channelId !== JSON_IMAGE_URLS_CHANNEL
    || params?.maskFile
    || (Array.isArray(params?.referenceDataUrls) && params.referenceDataUrls.length > 0)
    || !Array.isArray(files)
    || files.length === 0
  ) return params;

  const referenceDataUrls = [];
  for (const file of files.slice(0, Number(params.maxInputImages || 8))) {
    await ensureFileBuffer(file);
    if (!Buffer.isBuffer(file?.buffer) || file.buffer.length === 0) continue;
    const mimeType = String(file.mimetype || mimeTypeFromFile(file.originalname) || "image/png");
    if (!/^image\//i.test(mimeType)) continue;
    referenceDataUrls.push(`data:${mimeType};base64,${file.buffer.toString("base64")}`);
  }
  return referenceDataUrls.length > 0 ? { ...params, referenceDataUrls } : params;
}

function imageParamsForBaseUrl(params, baseUrl) {
  const upstreamModel = upstreamModelForChannel(baseUrl, params.model);
  return upstreamModel === params.model ? params : { ...params, model: upstreamModel };
}

function imageRequestVariantsForBaseUrl(params, files, baseUrl) {
  return buildImageRequestVariants(imageParamsForBaseUrl(params, baseUrl), files);
}

function imageRequestLogTargets(params, files, baseUrls) {
  return baseUrls.flatMap((baseUrl) => (
    imageRequestVariantsForBaseUrl(params, files, baseUrl).map((variant) => ({
      url: `${baseUrl}${variant.path}`,
      protocol: variant.protocol,
      model: variant.model,
      requestFormat: variant.requestFormat
    }))
  ));
}

function clampDiagnosticImageCount(value) {
  return Math.max(0, Math.min(12, Number.parseInt(value, 10) || 0));
}

function diagnosticPlaceholderFiles(count) {
  return Array.from({ length: count }, (_, index) => ({
    buffer: Buffer.from([0]),
    mimetype: "image/png",
    originalname: `diagnostic-image-${index + 1}.png`,
    size: 0
  }));
}

function diagnosticFieldValue(key, value, params, imageIndex) {
  const field = String(key || "").toLowerCase();
  if (field.includes("key") || field === "authorization" || field.includes("token")) return "[hidden]";
  if (field === "prompt") return "[hidden]";
  if (field === "model") return String(value || "") === params.model ? params.model : "[server-mapped]";
  if (field === "image") return `image#${imageIndex}`;
  return String(value ?? "");
}

async function describeDiagnosticVariantFields(variant, params) {
  if (variant.protocol === "json") {
    const payload = JSON.parse(await variant.createBody());
    return Object.entries(payload).map(([key, value]) => ({
      key,
      value: diagnosticFieldValue(key, value, params, 0)
    }));
  }

  let imageIndex = 0;
  const body = await variant.createBody();
  return Array.from(body.entries()).map(([key, value]) => {
    const isImage = String(key || "").toLowerCase() === "image";
    if (isImage) imageIndex += 1;
    return {
      key,
      value: diagnosticFieldValue(key, typeof value === "string" ? value : "", params, imageIndex)
    };
  });
}

async function buildImageRequestDiagnostic(input = {}) {
  const requestedImageCount = clampDiagnosticImageCount(input.imageCount);
  const hasImages = Boolean(input.hasImages ?? requestedImageCount > 0);
  const imageCount = hasImages ? Math.max(1, requestedImageCount || 2) : 0;
  const params = normalizeImageRequest({
    ...input,
    prompt: "diagnostic prompt omitted",
    n: input.n || 1
  });
  const files = diagnosticPlaceholderFiles(imageCount);
  const baseCandidates = imageChannelBaseCandidates(params.model);
  const primaryBaseUrl = baseCandidates[0] || PRIMARY_CHANNEL_API_BASE_URL;
  const primaryParams = imageParamsForBaseUrl(params, primaryBaseUrl);
  const variants = await Promise.all(buildImageRequestVariants(primaryParams, files).map(async (variant, index) => ({
    attempt: index + 1,
    id: variant.id,
    path: variant.path,
    protocol: variant.protocol,
    requestFormat: variant.requestFormat,
    modelField: variant.model === params.model ? params.model : "[server-mapped]",
    fields: await describeDiagnosticVariantFields(variant, params)
  })));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    charged: false,
    upstreamCalled: false,
    security: {
      apiKeyIncluded: false,
      promptIncluded: false,
      imageContentIncluded: false,
      upstreamBaseUrlIncluded: false,
      priceIncluded: false
    },
    params: {
      model: params.model,
      source: params.source || "",
      workflowMode: params.workflowMode || "",
      imageSize: params.imageSize,
      aspectRatio: params.aspectRatio,
      n: params.n,
      hasImages: files.length > 0,
      imageCount: files.length
    },
    routes: baseCandidates.map((baseUrl, index) => {
      const logFields = channelLogFields(baseUrl, index, baseCandidates.length);
      return {
        attempt: index + 1,
        role: logFields.channelRole,
        fallback: Boolean(logFields.channelIsFallback)
      };
    }),
    billingGateway: {
      enabled: billingGatewayPolicy().enabled,
      note: billingGatewayPolicy().enabled
        ? "真实生成时计费网关可能签发优先路由；自检不会展示签发路由、token、KEY 或真实域名。"
        : "未启用计费签发；自检只展示本地静态候选摘要。"
    },
    primary: variants[0] || null,
    variants
  };
}

function outfitUploadFileGroups(req) {
  if (Array.isArray(req.files)) {
    return {
      imageFiles: req.files,
      maskFile: null
    };
  }
  const groups = req.files && typeof req.files === "object" ? req.files : {};
  return {
    imageFiles: Array.isArray(groups.image) ? groups.image : [],
    maskFile: Array.isArray(groups.mask) ? groups.mask[0] || null : null
  };
}

function outfitResultUrl(filename) {
  return `/api/result/${encodeURIComponent(filename)}`;
}

function outfitResultPath(filename) {
  const safeName = path.basename(String(filename || ""));
  const resolved = path.resolve(resultDir, safeName);
  if (!resolved.startsWith(path.resolve(resultDir) + path.sep)) {
    throw new Error("本地换装结果路径无效");
  }
  return resolved;
}

function imageFromOutfitArchive(archived) {
  if (!archived?.localUrl) return null;
  return {
    type: "url",
    value: archived.localUrl,
    localUrl: archived.localUrl,
    archiveMime: archived.archiveMime || mimeTypeFromFile(archived.filename),
    resultArchiveFile: archived.filename,
    ...(archived.sourceUrl ? { sourceUrl: archived.sourceUrl } : {})
  };
}

function parseByteRange(rangeHeader, size) {
  const raw = String(rangeHeader || "").trim();
  if (!raw) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) return false;

  const [, startText, endText] = match;
  if (!startText && !endText) return false;

  let start;
  let end;
  if (!startText) {
    const suffixLength = Number.parseInt(endText, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return false;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number.parseInt(startText, 10);
    end = endText ? Number.parseInt(endText, 10) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return false;
  }

  return { start, end: Math.min(end, size - 1) };
}

async function streamLocalImageFile(req, res, file, options = {}) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("not_file");

  const size = info.size;
  const range = parseByteRange(req.headers.range, size);
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": options.contentType || mimeTypeFromFile(file),
    "Cache-Control": options.cacheControl || "public, max-age=31536000, immutable"
  };

  if (range === false) {
    res.status(416)
      .set({
        ...headers,
        "Content-Range": `bytes */${size}`
      })
      .end();
    return;
  }

  if (size === 0) {
    res.status(200).set({ ...headers, "Content-Length": "0" }).end();
    return;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const contentLength = end - start + 1;
  res.status(range ? 206 : 200).set({
    ...headers,
    "Content-Length": String(contentLength),
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {})
  });

  await pipeline(createReadStream(file, { start, end, highWaterMark: DOWNLOAD_CHUNK_BYTES }), res);
}

function isResultCacheImageFile(name) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(name || ""));
}

function roundCacheRatio(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

async function getResultCacheDiskUsage() {
  await mkdir(resultDir, { recursive: true });
  const info = await statfs(resultDir);
  const blockSize = Number(info.bsize || info.frsize || 0);
  const totalBlocks = Number(info.blocks || 0);
  const availableBlocks = Number(info.bavail ?? info.bfree ?? 0);
  const totalBytes = blockSize * totalBlocks;
  const availableBytes = Math.max(0, blockSize * availableBlocks);
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  return {
    totalBytes,
    availableBytes,
    usedBytes,
    usedRatio: usedBytes / totalBytes
  };
}

async function deleteResultCacheFile(file) {
  try {
    await unlink(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function cleanupResultCache(reason = "scheduled") {
  if (resultCacheCleanupRunning) return;
  resultCacheCleanupRunning = true;
  const startedAt = Date.now();
  let scannedCount = 0;
  let deletedCount = 0;
  let deletedBytes = 0;
  let expiredDeletedCount = 0;
  let expiredDeletedBytes = 0;
  let pressureDeletedCount = 0;
  let pressureDeletedBytes = 0;
  let diskPressureTriggered = false;
  let diskUsageBeforePressure = null;
  let diskUsageAfterCleanup = null;

  try {
    await mkdir(resultDir, { recursive: true });
    const cutoff = Date.now() - RESULT_CACHE_TTL_MS;
    const entries = await readdir(resultDir, { withFileTypes: true });
    const remainingItems = [];

    for (const entry of entries) {
      if (!entry.isFile() || !isResultCacheImageFile(entry.name)) continue;
      scannedCount += 1;
      const file = outfitResultPath(entry.name);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) continue;
      const touchedAt = Math.max(info.mtimeMs || 0, info.birthtimeMs || 0);
      const size = info.size || 0;
      if (touchedAt >= cutoff) {
        remainingItems.push({ file, size, touchedAt });
        continue;
      }
      if (!await deleteResultCacheFile(file)) continue;
      deletedCount += 1;
      deletedBytes += size;
      expiredDeletedCount += 1;
      expiredDeletedBytes += size;
    }

    diskUsageBeforePressure = await getResultCacheDiskUsage().catch(() => null);
    if (diskUsageBeforePressure?.usedRatio > RESULT_CACHE_MAX_DISK_USAGE_RATIO) {
      diskPressureTriggered = true;
      remainingItems.sort((left, right) => left.touchedAt - right.touchedAt);
      let projectedAvailableBytes = diskUsageBeforePressure.availableBytes;
      const totalBytes = diskUsageBeforePressure.totalBytes;
      const minimumTouchedAt = Date.now() - RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS;

      for (const item of remainingItems) {
        const projectedUsedRatio = (totalBytes - projectedAvailableBytes) / totalBytes;
        if (projectedUsedRatio <= RESULT_CACHE_MAX_DISK_USAGE_RATIO) break;
        if (item.touchedAt > minimumTouchedAt) continue;
        if (!await deleteResultCacheFile(item.file)) continue;
        projectedAvailableBytes += item.size;
        deletedCount += 1;
        deletedBytes += item.size;
        pressureDeletedCount += 1;
        pressureDeletedBytes += item.size;
      }
    }

    diskUsageAfterCleanup = await getResultCacheDiskUsage().catch(() => null);

    if (deletedCount > 0 || diskPressureTriggered) {
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: true,
        stage: "result-cache-cleanup",
        reason,
        ttlDays: RESULT_CACHE_TTL_DAYS,
        maxDiskUsageRatio: RESULT_CACHE_MAX_DISK_USAGE_RATIO,
        diskUsageRatioBeforePressure: roundCacheRatio(diskUsageBeforePressure?.usedRatio),
        diskUsageRatioAfterCleanup: roundCacheRatio(diskUsageAfterCleanup?.usedRatio),
        diskPressureTriggered,
        scannedCount,
        deletedCount,
        deletedBytes,
        expiredDeletedCount,
        expiredDeletedBytes,
        pressureDeletedCount,
        pressureDeletedBytes,
        timingMs: Date.now() - startedAt
      });
    }
  } catch (error) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      ok: false,
      stage: "result-cache-cleanup",
      reason,
      ttlDays: RESULT_CACHE_TTL_DAYS,
      maxDiskUsageRatio: RESULT_CACHE_MAX_DISK_USAGE_RATIO,
      diskUsageRatioBeforePressure: roundCacheRatio(diskUsageBeforePressure?.usedRatio),
      diskUsageRatioAfterCleanup: roundCacheRatio(diskUsageAfterCleanup?.usedRatio),
      diskPressureTriggered,
      scannedCount,
      deletedCount,
      deletedBytes,
      expiredDeletedCount,
      expiredDeletedBytes,
      pressureDeletedCount,
      pressureDeletedBytes,
      timingMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error || "")
    });
  } finally {
    resultCacheCleanupRunning = false;
  }
}

function scheduleResultCacheCleanup(reason = "scheduled", delayMs = 0) {
  if (delayMs <= 0) {
    void cleanupResultCache(reason);
    return;
  }
  if (resultCacheCleanupTimer) return;
  resultCacheCleanupTimer = setTimeout(() => {
    resultCacheCleanupTimer = null;
    void cleanupResultCache(reason);
  }, delayMs);
  resultCacheCleanupTimer.unref?.();
}

function startResultCacheCleanup() {
  scheduleResultCacheCleanup("startup");
  const timer = setInterval(() => {
    scheduleResultCacheCleanup("scheduled");
  }, RESULT_CACHE_CLEANUP_INTERVAL_MS);
  timer.unref?.();
}

async function archiveOutfitGeneratedImage(image, taskId, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  const payload = await imageBufferFromPayload(image, timeoutMs);
  const ext = imageExtensionFromType(payload.mimeType, payload.sourceUrl);
  const safeTaskId = sanitizeFilePart(taskId || "task");
  const filename = `HZ-${new Date().getDate()}-${safeTaskId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const target = outfitResultPath(filename);
  await mkdir(resultDir, { recursive: true });
  await writeFile(target, payload.buffer, { flag: "wx" });
  scheduleResultCacheCleanup("post-result-write", RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS);
  return {
    type: "local",
    filename,
    localUrl: outfitResultUrl(filename),
    bytes: payload.buffer.length,
    archiveMime: payload.mimeType,
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {})
  };
}

async function cacheOutfitGeneratedImageForDisplay(image, taskId, timeoutMs = RESULT_DISPLAY_CACHE_TIMEOUT_MS) {
  const startedAt = Date.now();
  try {
    const archived = await archiveOutfitGeneratedImage(image, taskId, timeoutMs);
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId: taskId,
      ok: true,
      stage: "display-cache-outfit-result-image",
      bytes: archived.bytes,
      localUrl: archived.localUrl,
      sourceUrl: archived.sourceUrl || "",
      timingMs: Date.now() - startedAt,
      timeoutMs
    });
    return imageFromOutfitArchive(archived) || image;
  } catch (error) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId: taskId,
      ok: false,
      stage: "display-cache-outfit-result-image",
      error: error instanceof Error ? error.message : String(error),
      timingMs: Date.now() - startedAt,
      timeoutMs
    });
    return image;
  }
}

function archiveOutfitGeneratedImageInBackground(image, taskId, stage = "background-cache-outfit-result-image") {
  setTimeout(() => {
    archiveOutfitGeneratedImage(image, taskId)
      .then((archived) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: taskId,
        ok: true,
        stage,
        bytes: archived.bytes,
        localUrl: archived.localUrl,
        sourceUrl: archived.sourceUrl || ""
      }))
      .catch((error) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: taskId,
        ok: false,
        stage,
        error: error instanceof Error ? error.message : String(error)
      }));
  }, 0);
}

app.get("/api/config", (_req, res) => {
  const billingPolicy = publicBillingGatewayPolicy();
  const videoPolicy = publicVideoPolicyConfig();
  const videoAvailableByGateway = billingPolicy.enabled;
  const videoAvailable = videoPolicy.enabled || videoAvailableByGateway;
  res.json({
    ok: true,
    defaultBaseUrl: PRIMARY_CHANNEL_API_BASE_URL,
    fallbackBaseUrl: "",
    hasServerKey: false,
    channelPolicy: publicChannelPolicyConfig(),
    models: publicChannelModels(),
    routing: publicRoutingCatalog(),
    billingGatewayPolicy: {
      ...billingPolicy,
      videoRequired: VIDEO_BILLING_GATEWAY_REQUIRED
    },
    videoPolicy: {
      ...videoPolicy,
      enabled: videoAvailable,
      routeSource: videoAvailableByGateway ? "billing-gateway" : (videoPolicy.enabled ? "server-key" : "unconfigured")
    },
    videoModels: publicVideoModels().map((model) => ({
      ...model,
      enabled: videoAvailable
    }))
  });
});

// 与 3.0 使用同一份模型能力/手动线路目录；旧 V11 页面也可直接读取。
app.get("/api/ecommerce/routing", (_req, res) => {
  res.json({ ok: true, ...publicRoutingCatalog() });
});

function gatewayRootUrl(baseUrl) {
  return normalizeBaseUrl(baseUrl).replace(/\/v1$/i, "");
}

async function checkGatewayConnectivity(gateway) {
  const url = gatewayRootUrl(gateway.baseUrl);
  const startedAt = Date.now();
  const abort = createAbortSignal(8000);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      signal: abort.signal
    });
    if (response.status === 405) {
      response = await fetch(url, {
        method: "GET",
        signal: abort.signal
      });
    }
    return {
      ...gateway,
      checkUrl: url,
      reachable: true,
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      statusText: response.statusText,
      server: response.headers.get("server") || "",
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    return {
      ...gateway,
      checkUrl: url,
      reachable: false,
      ok: false,
      status: 0,
      statusText: "",
      server: "",
      latencyMs: Date.now() - startedAt,
      error: error?.name === "AbortError" ? "timeout" : error instanceof Error ? error.message : String(error)
    };
  } finally {
    abort.dispose();
  }
}

/**
 * POST /api/connection-test —— 「连接测试」。
 *
 * 行为对照 3.0 的 `/api/providers/test-connection`：
 *   只向上游发 `GET {base}/models`（带 Authorization），**不调用生图、不上传图片、不扣费**。
 * 与 3.0 的差异：V11 的网关/线路来自本仓库的 channel 配置，KEY 由前端传入（服务端不落盘），
 * 所以这里按 V11 自己的字段名收发。
 *
 * 安全：
 *   - 绝不回显 API Key / Authorization；
 *   - 上游错误信息先做脱敏（去掉 key/token 片段）再返回；
 *   - 不写入任何日志文件，也不返回完整响应体，只给结论 + 状态码 + 耗时。
 */
app.post("/api/connection-test", async (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestedBaseUrl = String(body.baseUrl || body.base_url || "").trim().replace(/\/+$/, "");
  const fallbackBaseUrl = String(channelBaseCandidates()[0] || PRIMARY_CHANNEL_API_BASE_URL || "").replace(/\/+$/, "");
  const baseUrl = requestedBaseUrl || fallbackBaseUrl;
  const startedAt = Date.now();

  if (!baseUrl) {
    return res.status(400).json({ ok: false, status: 0, message: "请先填写请求地址", latencyMs: 0 });
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    return res.status(400).json({ ok: false, status: 0, message: "请求地址必须以 http:// 或 https:// 开头", latencyMs: 0 });
  }

  const apiKey = resolveApiKey(body.apiKey);
  if (!apiKey) {
    return res.status(400).json({ ok: false, status: 0, message: "请先填写或保存 API Key", latencyMs: 0 });
  }

  // 与 3.0 一致：base 以 /v1 结尾就直接拼 /models，否则补 /v1/models。
  const probeUrl = /\/v1$/i.test(baseUrl) ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
  const abort = createAbortSignal(15000);
  try {
    const response = await fetch(probeUrl, {
      method: "GET",
      redirect: "manual",
      signal: abort.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });
    const status = Number(response.status || 0);
    let message;
    if (status === 401 || status === 403) {
      message = `API Key 无效或无权限（HTTP ${status}）`;
    } else if (status === 404) {
      message = "连接可达，但上游没有 /v1/models 接口（HTTP 404）";
    } else if (status >= 500) {
      message = `上游服务暂时不可用（HTTP ${status}）`;
    } else if (status >= 400) {
      message = `上游拒绝了探测请求（HTTP ${status}）`;
    } else {
      // 只读模型清单，用来证明这条线路真的可用；不展示完整响应内容。
      let modelCount = 0;
      try {
        const payload = await response.json();
        const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
        modelCount = list.length;
      } catch { /* 模型清单解析失败不影响连通结论 */ }
      message = modelCount > 0
        ? `连接正常，可用模型 ${modelCount} 个`
        : "连接正常";
    }
    return res.json({
      ok: status >= 200 && status < 400,
      status,
      latencyMs: Date.now() - startedAt,
      model: String(body.model || ""),
      channelId: String(body.channelId || ""),
      message
    });
  } catch (error) {
    const isTimeout = error?.name === "AbortError";
    const raw = error instanceof Error ? error.message : String(error);
    // 脱敏：上游报错里可能带 key/token 片段，统一替换掉再回前端。
    const safe = raw.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***").replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***");
    return res.json({
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      model: String(body.model || ""),
      channelId: String(body.channelId || ""),
      message: isTimeout ? "连接超时（15 秒无响应）" : `连接失败：${safe}`
    });
  } finally {
    abort.dispose();
  }
});

app.get("/api/gateways", (_req, res) => {
  const gateways = publicChannelGateways();
  res.json({
    ok: true,
    priorityRule: "priority 数字越小越靠前；第 1 个是主中转站，后续是备用中转站。",
    activeEndpointCount: gateways.length,
    gateways
  });
});

app.get("/api/gateways/status", async (_req, res) => {
  const gateways = publicChannelGateways();
  const checks = await Promise.all(gateways.map(checkGatewayConnectivity));
  res.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    priorityRule: "priority 数字越小越靠前；本检查不携带用户 KEY、不调用生图、不扣费。",
    activeEndpointCount: checks.length,
    allReachable: checks.every((item) => item.reachable),
    gateways: checks
  });
});

app.get("/api/health", (_req, res) => {
  const memory = process.memoryUsage();
  res.json({
    ok: true,
    version: "11.0.0",
    now: new Date().toISOString(),
    gatewayBaseUrl: PRIMARY_CHANNEL_API_BASE_URL,
    imageConcurrency: {
      limit: IMAGE_CONCURRENCY_LIMIT,
      active: activeImageRequestCount,
      queued: imageRequestQueue.length
    },
    memory: {
      rssMb: Number((memory.rss / 1024 / 1024).toFixed(1)),
      heapUsedMb: Number((memory.heapUsed / 1024 / 1024).toFixed(1)),
      heapTotalMb: Number((memory.heapTotal / 1024 / 1024).toFixed(1)),
      externalMb: Number((memory.external / 1024 / 1024).toFixed(1))
    },
    uptimeSec: Math.floor(process.uptime())
  });
});

app.post("/api/client-diagnostic-event", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestId = String(body.requestId || `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  writeGenerationLog({
    time: new Date().toISOString(),
    requestId,
    ok: body.ok !== false,
    stage: clientDiagnosticStage(body.stage),
    event: sanitizeClientDiagnosticValue("event", body.event || body.stage || ""),
    endpoint: sanitizeClientDiagnosticValue("endpoint", body.endpoint || body.url || ""),
    method: sanitizeClientDiagnosticValue("method", body.method || ""),
    status: Number.isFinite(Number(body.status)) ? Number(body.status) : undefined,
    durationMs: Number.isFinite(Number(body.durationMs)) ? Number(body.durationMs) : undefined,
    detail: sanitizeClientDiagnosticValue("detail", body.detail || {})
  }).catch(() => {});
  res.json({ ok: true });
});

app.post("/api/debug/image-request-params", async (req, res) => {
  try {
    res.json(await buildImageRequestDiagnostic(req.body || {}));
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "传参自检失败"
    });
  }
});

function publicVideoErrorCode(status, message) {
  if (isImageAuthError(status, message)) return "invalid_api_key";
  if (isImageQuotaError(status, message)) return "insufficient_quota";
  if (isImagePermissionError(status, message)) return "permission_denied";
  if (/model_not_found|model.*not.*found|unsupported.*model|模型.*不可用|模型.*不存在/i.test(String(message || ""))) return "model_unavailable";
  if (status >= 500 || status === 429 || !status || /timeout|timed out|upstream|channel|渠道|上游/i.test(String(message || ""))) return "channel_timeout";
  return "upstream_error";
}

function publicVideoErrorMessage(status, message) {
  const code = publicVideoErrorCode(status, message);
  if (code === "invalid_api_key") return "视频 API Key 无效或当前账号无权限，请检查配置后重试。";
  if (code === "insufficient_quota") return quotaFailureMessage(message);
  if (code === "permission_denied") return "当前视频通道无权调用该模型，请检查静音中转站视频权限。";
  if (code === "model_unavailable") return "当前视频模型暂不可用，请稍后重试。";
  if (code === "channel_timeout") return "视频生成超时，请重新生成。";
  return compactLogMessage(message || `HTTP ${status}`, 600);
}

function publicVideoTaskFailureMessage(message) {
  const text = compactLogMessage(message, 600);
  if (!text) return null;
  if (/all cookies failed|cookie#|insufficient\s+tokens/i.test(text)) {
    return "视频上游通道资源不足，任务已自动退款，请稍后重试或切换可用视频渠道。";
  }
  return text;
}

function publicVideoTaskPayload(json = {}, fallbackTaskId = "") {
  const firstDataItem = Array.isArray(json.data) ? json.data.find((item) => item && typeof item === "object") : null;
  const dataObject = json.data && typeof json.data === "object" && !Array.isArray(json.data) ? json.data : null;
  const taskObject = json.task && typeof json.task === "object" && !Array.isArray(json.task) ? json.task : null;
  const nestedDataObject = dataObject?.data && typeof dataObject.data === "object" && !Array.isArray(dataObject.data) ? dataObject.data : null;
  const output = json.output && typeof json.output === "object" ? json.output : null;
  const videoUrl = [
    json.url,
    json.video_url,
    json.output_url,
    output?.url,
    taskObject?.url,
    taskObject?.video_url,
    taskObject?.output_url,
    dataObject?.url,
    dataObject?.video_url,
    dataObject?.output_url,
    dataObject?.result_url,
    nestedDataObject?.url,
    nestedDataObject?.video_url,
    nestedDataObject?.output_url,
    nestedDataObject?.result_url,
    firstDataItem?.url,
    firstDataItem?.video_url,
    firstDataItem?.output_url,
    firstDataItem?.result_url
  ].map((value) => String(value || "").trim()).find((value) => /^(https?:|data:)/i.test(value)) || "";
  const rawErrorMessage = [
    json.error?.message,
    json.error,
    taskObject?.error?.message,
    taskObject?.error,
    dataObject?.fail_reason,
    dataObject?.error?.message,
    dataObject?.error,
    nestedDataObject?.error?.message,
    nestedDataObject?.error,
    nestedDataObject?.fail_reason,
    firstDataItem?.fail_reason,
    firstDataItem?.error?.message,
    firstDataItem?.error,
    dataObject?.result_url && !/^(https?:|data:)/i.test(String(dataObject.result_url)) ? dataObject.result_url : ""
  ].map((value) => String(value || "").trim()).filter(Boolean)[0] || null;
  const errorMessage = publicVideoTaskFailureMessage(rawErrorMessage);
  const taskId = json.task_id
    || json.taskId
    || json.id
    || json.video_id
    || taskObject?.task_id
    || taskObject?.taskId
    || taskObject?.id
    || dataObject?.task_id
    || dataObject?.taskId
    || dataObject?.id
    || nestedDataObject?.task_id
    || nestedDataObject?.taskId
    || nestedDataObject?.id
    || firstDataItem?.task_id
    || firstDataItem?.taskId
    || firstDataItem?.id
    || fallbackTaskId
    || "";
  return {
    taskId,
    id: taskId,
    status: json.status || taskObject?.status || dataObject?.status || nestedDataObject?.status || firstDataItem?.status || (taskId ? "queued" : "unknown"),
    progress: Number.isFinite(Number(json.progress ?? taskObject?.progress ?? dataObject?.progress ?? nestedDataObject?.progress ?? firstDataItem?.progress))
      ? Number(json.progress ?? taskObject?.progress ?? dataObject?.progress ?? nestedDataObject?.progress ?? firstDataItem?.progress)
      : null,
    url: videoUrl,
    format: json.format || taskObject?.format || dataObject?.format || nestedDataObject?.format || firstDataItem?.format || "",
    model: json.model || taskObject?.model || dataObject?.model || nestedDataObject?.model || firstDataItem?.model || "",
    seconds: json.seconds || json.duration || taskObject?.seconds || taskObject?.duration || dataObject?.seconds || dataObject?.duration || nestedDataObject?.seconds || nestedDataObject?.duration || firstDataItem?.seconds || firstDataItem?.duration || "",
    size: json.size || taskObject?.size || dataObject?.size || nestedDataObject?.size || firstDataItem?.size || "",
    metadata: json.metadata || taskObject?.metadata || dataObject?.metadata || nestedDataObject?.metadata || firstDataItem?.metadata || null,
    error: errorMessage,
    raw: json
  };
}

function videoRouteText(value) {
  return String(value || "").trim();
}

function hasHeader(headers, name) {
  const target = String(name || "").toLowerCase();
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === target);
}

function safeSignedRouteHeaders(input = {}) {
  const headers = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return headers;
  const blocked = new Set(["host", "connection", "content-length", "transfer-encoding"]);
  for (const [key, value] of Object.entries(input)) {
    const name = videoRouteText(key);
    if (!name || blocked.has(name.toLowerCase())) continue;
    const text = videoRouteText(value);
    if (text) headers[name] = text;
  }
  return headers;
}

function signedRouteCredential(route = {}) {
  return resolveApiKey(
    route.apiKey
    || route.api_key
    || route.bearerToken
    || route.bearer_token
    || route.token
    || route.accessToken
    || route.access_token
    || ""
  );
}

function videoRouteUrl(rawValue, baseUrl, fallbackPath) {
  const raw = videoRouteText(rawValue || fallbackPath);
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedBase = normalizeBaseUrl(baseUrl || gatewayVideoBaseUrl());
  const routePath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${normalizedBase}${routePath}`;
}

function videoStatusUrlFromRoute(route, taskId) {
  const encodedTaskId = encodeURIComponent(taskId);
  const template = videoRouteText(route.statusUrlTemplate || route.statusUrl || "");
  if (template) {
    return videoRouteUrl(
      template
        .replace(/\{task_id\}/g, encodedTaskId)
        .replace(/\{taskId\}/g, encodedTaskId)
        .replace(/:taskId\b/g, encodedTaskId)
        .replace(/:task_id\b/g, encodedTaskId),
      route.baseUrl,
      `/video/generations/${encodedTaskId}`
    );
  }
  return videoRouteUrl(route.statusPath, route.baseUrl, `/video/generations/${encodedTaskId}`);
}

function createVideoRouteFromBillingTask(billingTask, fallbackBaseUrl, fallbackApiKey) {
  const signedRoute = billingTask?.signedRoute && typeof billingTask.signedRoute === "object" && !Array.isArray(billingTask.signedRoute)
    ? billingTask.signedRoute
    : null;
  const route = signedRoute || {};
  const baseUrl = normalizeBaseUrl(
    route.baseUrl
    || route.base_url
    || route.upstreamBaseUrl
    || route.upstream_base_url
    || fallbackBaseUrl
  );
  const headers = safeSignedRouteHeaders(route.headers);
  const credential = signedRouteCredential(route) || resolveApiKey(fallbackApiKey);
  if (credential && !hasHeader(headers, "authorization")) {
    headers.Authorization = /^Bearer\s+/i.test(credential) ? credential : `Bearer ${credential}`;
  }
  const routeTokenHeader = videoRouteText(route.routeTokenHeader || route.route_token_header);
  if (routeTokenHeader && billingTask?.routeToken && !hasHeader(headers, routeTokenHeader)) {
    headers[routeTokenHeader] = billingTask.routeToken;
  }

  return {
    baseUrl,
    createUrl: videoRouteUrl(
      route.createUrl
      || route.create_url
      || route.generationUrl
      || route.generation_url
      || route.url
      || route.path,
      baseUrl,
      "/video/generations"
    ),
    statusUrlTemplate: videoRouteText(route.statusUrlTemplate || route.status_url_template || route.statusUrl || route.status_url),
    statusPath: videoRouteText(route.statusPath || route.status_path),
    headers,
    usesSignedRoute: Boolean(signedRoute),
    hasCredential: hasHeader(headers, "authorization") || Boolean(routeTokenHeader && billingTask?.routeToken),
    channelId: videoRouteText(route.channelId || route.channel_id || JINGYIN_VIDEO_GATEWAY_CHANNEL_ID),
    channelRole: videoRouteText(route.channelRole || route.channel_role || "video-primary")
  };
}

function bearerHeaderValue(credential) {
  const text = resolveApiKey(credential);
  if (!text) return "";
  return /^Bearer\s+/i.test(text) ? text : `Bearer ${text}`;
}

function imageRouteUrl(rawValue, baseUrl, fallbackPath) {
  const raw = videoRouteText(rawValue || fallbackPath);
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const routePath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${normalizedBase}${routePath}`;
}

function imageRouteModel(route = {}) {
  return videoRouteText(
    route.model
    || route.upstreamModel
    || route.upstream_model
    || route.realModel
    || route.real_model
  );
}

function createImageRouteFromBillingTask(billingTask) {
  const signedRoute = billingTask?.signedRoute && typeof billingTask.signedRoute === "object" && !Array.isArray(billingTask.signedRoute)
    ? billingTask.signedRoute
    : null;
  if (!signedRoute) return null;

  const route = signedRoute;
  const baseUrl = normalizeBaseUrl(
    route.baseUrl
    || route.base_url
    || route.upstreamBaseUrl
    || route.upstream_base_url
    || ""
  );
  if (!baseUrl) return null;

  const headers = safeSignedRouteHeaders(route.headers);
  const credential = signedRouteCredential(route);
  const routeApiKeyHeader = videoRouteText(route.apiKeyHeader || route.api_key_header || route.authHeader || route.auth_header);
  if (credential && routeApiKeyHeader && !hasHeader(headers, routeApiKeyHeader)) {
    headers[routeApiKeyHeader] = credential;
  } else if (credential && !hasHeader(headers, "authorization")) {
    headers.Authorization = bearerHeaderValue(credential);
  }
  const routeTokenHeader = videoRouteText(route.routeTokenHeader || route.route_token_header);
  if (routeTokenHeader && billingTask?.routeToken && !hasHeader(headers, routeTokenHeader)) {
    headers[routeTokenHeader] = billingTask.routeToken;
  }
  const hasApiKeyHeader = Boolean(routeApiKeyHeader && hasHeader(headers, routeApiKeyHeader));

  return {
    baseUrl,
    headers,
    usesSignedRoute: true,
    hasCredential: hasHeader(headers, "authorization") || hasApiKeyHeader || Boolean(routeTokenHeader && billingTask?.routeToken),
    channelId: videoRouteText(route.channelId || route.channel_id || "billing-signed-image"),
    channelRole: videoRouteText(route.channelRole || route.channel_role || "image-signed"),
    channelLabel: videoRouteText(route.channelLabel || route.channel_label || "静音计费签发图片路由"),
    model: imageRouteModel(route),
    route
  };
}

function imageCandidateEntries(baseUrls = [], billingTask = null) {
  const entries = [];
  const signedRoute = createImageRouteFromBillingTask(billingTask);
  if (signedRoute) entries.push(signedRoute);
  const seen = new Set(entries.map((entry) => normalizeBaseUrl(entry.baseUrl)));
  for (const baseUrl of baseUrls) {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const endpoint = channelEndpointForBaseUrl(normalized);
    entries.push({
      baseUrl: normalized,
      headers: {},
      usesSignedRoute: false,
      hasCredential: Boolean(endpoint?.upstreamApiKey),
      channelId: endpoint?.id || "",
      channelRole: endpoint?.role || "",
      channelLabel: endpoint?.label || "",
      model: "",
      route: null
    });
  }
  return entries;
}

function imageChannelLogForCandidate(candidate, index, candidateCount) {
  const baseLog = channelLogFields(candidate.baseUrl, index, candidateCount);
  if (!candidate?.usesSignedRoute) return baseLog;
  const channelRole = candidate.channelRole || baseLog.channelRole || "image-signed";
  return {
    ...baseLog,
    channelId: candidate.channelId || baseLog.channelId || "billing-signed-image",
    channelLabel: candidate.channelLabel || baseLog.channelLabel || "静音计费签发图片路由",
    channelRole,
    channelIsFallback: index > 0 || /fallback|backup/i.test(channelRole),
    channelBaseUrl: normalizeBaseUrl(candidate.baseUrl),
    channelAttempt: index + 1,
    channelCandidateCount: candidateCount,
    channelSignedRoute: true
  };
}

function imageParamsForCandidate(params, candidate) {
  const upstreamModel = candidate?.model || upstreamModelForChannel(candidate.baseUrl, params.model);
  return upstreamModel === params.model ? params : { ...params, model: upstreamModel };
}

function imageRequestVariantsForCandidate(params, files, candidate) {
  return buildImageRequestVariants(imageParamsForCandidate(params, candidate), files);
}

function imageUrlForCandidate(candidate, variant, hasImages) {
  if (!candidate?.usesSignedRoute) return `${candidate.baseUrl}${variant.path}`;
  const route = candidate.route || {};
  const raw = hasImages
    ? route.editUrl || route.edit_url || route.editsUrl || route.edits_url || route.url || route.path
    : route.generationUrl || route.generation_url || route.generationsUrl || route.generations_url || route.createUrl || route.create_url || route.url || route.path;
  return imageRouteUrl(raw, candidate.baseUrl, variant.path);
}

function imageApiKeyForCandidate(candidate, fallbackApiKey) {
  if (candidate?.usesSignedRoute && candidate.hasCredential) return "";
  if (candidate?.usesSignedRoute) return signedRouteCredential(candidate.route) || apiKeyForChannel(candidate.baseUrl, fallbackApiKey);
  return apiKeyForChannel(candidate.baseUrl, fallbackApiKey);
}

function imageHeadersForCandidate(candidate, channelApiKey, variantHeaders = {}) {
  const headers = { ...(candidate?.headers || {}) };
  const authHeaders = apiKeyHeadersForChannel(candidate?.baseUrl, channelApiKey);
  for (const [name, value] of Object.entries(authHeaders)) {
    if (value && !hasHeader(headers, name)) headers[name] = value;
  }
  return {
    ...headers,
    ...variantHeaders
  };
}

function rememberVideoRouteSession(taskId, route) {
  if (!taskId || !route?.hasCredential) return;
  const now = Date.now();
  for (const [id, session] of videoRouteSessions) {
    if (!session?.expiresAt || session.expiresAt <= now) videoRouteSessions.delete(id);
  }
  videoRouteSessions.set(taskId, {
    ...route,
    createUrl: "",
    expiresAt: now + VIDEO_ROUTE_SESSION_TTL_MS
  });
}

function videoRouteForStatus(taskId, fallbackBaseUrl, fallbackApiKey) {
  const now = Date.now();
  const session = videoRouteSessions.get(taskId);
  if (session?.expiresAt > now) {
    return {
      ...session,
      statusUrl: videoStatusUrlFromRoute(session, taskId)
    };
  }
  if (session) videoRouteSessions.delete(taskId);
  const route = createVideoRouteFromBillingTask(null, fallbackBaseUrl, fallbackApiKey);
  return {
    ...route,
    statusUrl: videoStatusUrlFromRoute(route, taskId)
  };
}

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

app.post("/api/quick-prompt-rewrite", upload.array("image", 6), async (req, res) => {
  let payload = {};
  try {
    payload = req.body?.payload ? JSON.parse(req.body.payload) : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, message: "快捷生成提示词优化参数解析失败" });
  }

  const apiKey = resolveApiKey(payload.apiKey);
  if (!apiKey) {
    return res.status(400).json({ ok: false, error: "missing_api_key", message: "缺少 API Key，无法调用快捷生成文本模型" });
  }

  const files = (req.files || []).map((file, index) => ({ ...file, quickRole: "reference", quickIndex: index }));

  try {
    const plan = await createQuickPromptRewrite({
      input: payload,
      files,
      apiKey,
      baseUrls: channelBaseCandidates(apiKey)
    });
    res.json({ ok: true, ...plan });
  } catch (error) {
    const fallbackPrompt = quickPromptFallback(payload, files);
    res.status(502).json({
      ok: false,
      message: error instanceof Error ? error.message : "快捷生成文本模型优化失败",
      fallbackPrompt
    });
  }
});

app.post("/api/reference-prompt-rewrite", upload.fields([
  { name: "productImage", maxCount: 6 },
  { name: "referenceImage", maxCount: 6 }
]), async (req, res) => {
  let payload = {};
  try {
    payload = req.body?.payload ? JSON.parse(req.body.payload) : (req.body || {});
  } catch {
    return res.status(400).json({ ok: false, message: "参考生图扩写参数解析失败" });
  }

  const apiKey = resolveApiKey(payload.apiKey);
  if (!apiKey) {
    return res.status(400).json({ ok: false, error: "missing_api_key", message: "缺少 API Key，无法调用参考生图文本模型" });
  }

  const files = [
    ...((req.files?.productImage || []).map((file, index) => ({ ...file, referenceRole: "product", referenceIndex: index }))),
    ...((req.files?.referenceImage || []).map((file, index) => ({ ...file, referenceRole: "reference", referenceIndex: index })))
  ];

  try {
    const plan = await createReferencePromptRewrite({
      input: payload,
      files,
      apiKey,
      baseUrls: channelBaseCandidates(apiKey)
    });
    res.json({ ok: true, ...plan });
  } catch (error) {
    const fallbackPrompt = localReferencePrompt(payload);
    res.status(502).json({
      ok: false,
      message: error instanceof Error ? error.message : "参考生图文本模型扩写失败",
      fallbackPrompt
    });
  }
});

app.get("/api/history", async (_req, res) => {
  const stored = await readHistoryResults();
  // P1 缺图自愈：读历史时顺带核对"归档文件是否还在"，把失效条目标记出来并落盘一次。
  // 只加标记、不删条目；标记过的条目不会重复写盘。
  const annotated = annotateHistoryIntegrity(stored);
  if (annotated.changed) {
    await ensureHistoryRepairBackup();
    await writeHistoryResults(annotated.items);
  }
  res.json({
    ok: true,
    results: annotated.items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    integrity: {
      checked: annotated.items.length,
      missing: annotated.missingIds.length,
      missingIds: annotated.missingIds
    }
  });
});

/**
 * POST /api/history/repair —— 显式修复失效历史引用。
 *
 * 默认只做"标记"，**不会删除任何记录**（`dropMissing` 必须由用户显式传入 true 才清理）。
 * 第一次修复前会留一份 data/history.pre-repair-backup.json，保证可回退。
 */
app.post("/api/history/repair", async (req, res) => {
  const dropMissing = req.body?.dropMissing === true;
  const stored = await readHistoryResults();
  const annotated = annotateHistoryIntegrity(stored);
  const backupFile = annotated.changed || dropMissing ? await ensureHistoryRepairBackup() : "";
  let kept = annotated.items;
  let dropped = 0;
  if (dropMissing && annotated.missingIds.length > 0) {
    const missingSet = new Set(annotated.missingIds);
    kept = annotated.items.filter((item) => !missingSet.has(item.id));
    dropped = annotated.items.length - kept.length;
  }
  if (annotated.changed || dropped > 0) {
    await writeHistoryResults(kept, { replaceBackup: kept.length === 0 });
  }
  res.json({
    ok: true,
    checked: annotated.items.length,
    missing: annotated.missingIds.length,
    missingIds: annotated.missingIds,
    marked: annotated.changed ? annotated.missingIds.length : 0,
    dropped,
    remaining: kept.length,
    backupFile
  });
});

app.post("/api/history", async (req, res) => {
  const incoming = Array.isArray(req.body?.items) ? req.body.items : [];
  if (incoming.length === 0) {
    return res.json({ ok: true, count: 0 });
  }

  const results = await appendHistoryResults(incoming);
  res.json({ ok: true, count: incoming.length, total: results.length, results });
});

app.delete("/api/history", async (req, res) => {
  const current = await readHistoryResults();
  if (req.body?.clear) {
    await writeHistoryResults([], { replaceBackup: true });
    return res.json({ ok: true, total: 0 });
  }

  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  const results = current.filter((item) => !ids.includes(item.id));
  await writeHistoryResults(results, { replaceBackup: results.length === 0 });
  res.json({ ok: true, total: results.length });
});

// ---------------------------------------------------------------------------
// 2026-09-29（v3.7）：数据与存储自助接口。
// 背景：历史图/参考图/结果缓存都写在数据目录（封装版为 %LOCALAPPDATA%\静音AI绘画数据），
// 用户既看不到路径，也没有能真正清掉文件的手段（只清 history.json 会被图片扫描复活）。
// 这里提供：用量查询 / 打开数据目录 / 安全清理（只删固定目录下的普通文件，
// 图片类目录只删图片扩展名；清历史图片时同时把历史清单置空并覆盖备份）。
const STORAGE_TARGETS = [
  { key: "historyImages", label: "历史图片", resolve: () => historyImageDir, imagesOnly: true, resetsHistory: true },
  { key: "references", label: "参考图缓存", resolve: () => referenceAssetDir, imagesOnly: true },
  { key: "results", label: "结果图缓存", resolve: () => resultDir, imagesOnly: true },
  { key: "canvasAssets", label: "画布资源", resolve: () => canvasAssetDir, imagesOnly: true },
  { key: "logs", label: "运行日志", resolve: () => path.join(rootDir, "logs"), imagesOnly: false },
  { key: "tmpUploads", label: "上传临时文件", resolve: () => uploadTempDir, imagesOnly: false }
];
const STORAGE_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp)$/i;

async function storageDirUsage(dir) {
  let files = 0;
  let bytes = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const info = await stat(path.join(dir, entry.name));
        files += 1;
        bytes += info.size;
      } catch {
        // 单个文件读不到就跳过，不影响整体统计
      }
    }
  } catch {
    // 目录不存在视为 0
  }
  return { files, bytes };
}

async function storageUsageSnapshot() {
  const items = [];
  let totalBytes = 0;
  for (const target of STORAGE_TARGETS) {
    const dir = target.resolve();
    const usage = await storageDirUsage(dir);
    totalBytes += usage.bytes;
    items.push({ key: target.key, label: target.label, path: dir, files: usage.files, bytes: usage.bytes });
  }
  const history = await readHistoryResults();
  return {
    rootDir,
    dataDir,
    logsDir: path.join(rootDir, "logs"),
    items,
    totalBytes,
    historyCount: history.length
  };
}

app.get("/api/storage/usage", async (_req, res) => {
  try {
    res.json({ ok: true, ...(await storageUsageSnapshot()) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
});

app.post("/api/storage/reveal", async (req, res) => {
  const which = String(req.body?.target || "data");
  const target = STORAGE_TARGETS.find((item) => item.key === which);
  const dir = target ? target.resolve() : dataDir;
  try {
    await mkdir(dir, { recursive: true });
    if (process.platform === "win32") {
      spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [dir], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [dir], { detached: true, stdio: "ignore" }).unref();
    }
    res.json({ ok: true, path: dir });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || String(error), path: dir });
  }
});

app.post("/api/storage/clean", async (req, res) => {
  const requested = Array.isArray(req.body?.targets) ? req.body.targets.map(String) : [];
  const chosen = STORAGE_TARGETS.filter((item) => requested.includes(item.key));
  if (chosen.length === 0) {
    return res.status(400).json({ ok: false, error: "no_targets" });
  }
  const report = [];
  for (const target of chosen) {
    const dir = target.resolve();
    let removedFiles = 0;
    let freedBytes = 0;
    let skipped = 0;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) {
          skipped += 1;
          continue;
        }
        if (target.imagesOnly && !STORAGE_IMAGE_PATTERN.test(entry.name)) {
          skipped += 1;
          continue;
        }
        const file = path.join(dir, entry.name);
        try {
          const info = await stat(file);
          await unlink(file);
          removedFiles += 1;
          freedBytes += info.size;
        } catch {
          skipped += 1;
        }
      }
    } catch {
      // 目录不存在等：视为已经清空
    }
    if (target.resetsHistory) {
      await writeHistoryResults([], { replaceBackup: true });
    }
    report.push({ key: target.key, label: target.label, path: dir, removedFiles, freedBytes, skipped });
  }
  res.json({ ok: true, report, ...(await storageUsageSnapshot()) });
});

app.get("/api/history-image/:filename", async (req, res) => {
  try {
    const file = historyImagePath(req.params.filename);
    await streamLocalImageFile(req, res, file);
  } catch {
    res.status(404).json({ ok: false, message: "历史图片不存在" });
  }
});

app.get("/api/reference-asset/:filename", async (req, res) => {
  try {
    const file = referenceAssetPath(req.params.filename);
    await streamLocalImageFile(req, res, file);
  } catch {
    res.status(404).json({ ok: false, message: "reference_asset_not_found" });
  }
});

app.post("/api/canvas-assets", upload.array("image", 12), async (req, res) => {
  try {
    const files = (req.files || []).filter((file) => file?.buffer?.length);
    if (files.length === 0) {
      return res.status(400).json({ ok: false, message: "missing_canvas_assets" });
    }

    const createdAt = Date.now();
    // 现在直接回 data URL：前端把画布资源随请求带上就行，不需要服务端落盘。
    // （旧实现是写 data/canvas-assets 再回 /api/canvas-asset/xxx；那段代码已经删掉，
    //  但 GET /api/canvas-asset/:filename 路由保留，用于兼容历史链接。）
    return res.json({
      ok: true,
      assets: files.map((file, index) => {
        const mimeType = file.mimetype || mimeTypeFromFile(file.originalname || "");
        return {
          id: `canvas_asset_${createdAt}_${index}`,
          name: file.originalname || `canvas-${index + 1}.${imageExtensionFromType(mimeType, file.originalname)}`,
          filename: "",
          url: `data:${mimeType};base64,${file.buffer.toString("base64")}`,
          mimeType,
          size: file.size,
          createdAt: createdAt + index
        };
      })
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "canvas_asset_upload_failed"
    });
  }
});

app.get("/api/canvas-asset/:filename", async (req, res) => {
  try {
    await streamLocalImageFile(req, res, canvasAssetPath(req.params.filename));
  } catch {
    res.status(404).json({ ok: false, message: "canvas_asset_not_found" });
  }
});

app.get("/api/save-directory", async (_req, res) => {
  const directory = await setSaveDirectory(await getSaveDirectory());
  res.json({ ok: true, directory });
});

app.post("/api/save-directory", async (req, res) => {
  try {
    const directory = await setSaveDirectory(req.body?.directory);
    res.json({ ok: true, directory });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "保存目录设置失败"
    });
  }
});

app.post("/api/pick-directory", async (req, res) => {
  try {
    const directory = await pickDirectory(req.body?.directory);
    if (!directory) {
      return res.json({ ok: true, cancelled: true, directory: "" });
    }
    res.json({ ok: true, cancelled: false, directory });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "目录选择失败"
    });
  }
});

app.post("/api/open-save-directory", async (req, res) => {
  try {
    const directory = await openDirectory(req.body?.directory || await getSaveDirectory());
    res.json({ ok: true, directory });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "打开保存目录失败"
    });
  }
});

app.post("/api/detail-prompts", upload.fields([
  { name: "productImage", maxCount: 6 },
  { name: "referenceImage", maxCount: 6 }
]), async (req, res) => {
  try {
    const payload = req.body?.payload
      ? JSON.parse(req.body.payload)
      : (req.body || {});
    const files = [
      ...((req.files?.productImage || []).map((file, index) => ({ ...file, detailRole: "product", detailIndex: index }))),
      ...((req.files?.referenceImage || []).map((file, index) => ({ ...file, detailRole: "reference", detailIndex: index })))
    ];
    const apiKey = resolveApiKey(payload.apiKey);
    let aiPlan = null;
    let aiError = "";

    if (String(payload.analysisMode || "ai") === "ai" && apiKey) {
      try {
        aiPlan = await createDetailAiPlan({
          input: payload,
          files,
          apiKey,
          baseUrls: channelBaseCandidates()
        });
        await writeGenerationLog({
          time: new Date().toISOString(),
          ok: true,
          stage: "detail-ai-plan",
          model: aiPlan.model,
          usedBaseUrl: aiPlan.usedBaseUrl,
          mode: aiPlan.mode,
          timing: aiPlan.timing,
          attempts: aiPlan.attempts
        });
      } catch (error) {
        const rawAiError = error?.name === "AbortError"
          ? "详情 AI 分析超时"
          : error instanceof Error ? error.message : String(error);
        aiError = imageFailureMessage(error?.name === "AbortError" ? 504 : 502, rawAiError, payload, []);
        await writeGenerationLog({
          time: new Date().toISOString(),
          ok: false,
          stage: "detail-ai-plan",
          error: rawAiError,
          publicError: aiError
        });
      }
    }

    const group = await buildDetailPromptGroupV2(
      {
        ...payload,
        analysisMode: aiPlan?.ok ? "ai" : "local"
      },
      files,
      {
        aiPlan: aiPlan?.plan || null,
        aiMeta: aiPlan ? {
          model: aiPlan.model,
          mode: aiPlan.mode,
          timing: aiPlan.timing
        } : null,
        aiError
      }
    );
    res.json({ ok: true, group });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "详情提示词生成失败"
    });
  }
});

app.post("/api/save-image", async (req, res) => {
  try {
    const item = await itemWithArchivedImage(req.body?.item || req.body);
    const directory = await setSaveDirectory(req.body?.directory || await getSaveDirectory());
    const { buffer, mimeType, sourceUrl } = await imageBufferFromPayload(item.image);
    const { filename, target } = await writeJingyinNumberedImage(
      directory,
      buffer,
      imageExtensionFromType(mimeType, sourceUrl)
    );
    res.json({ ok: true, directory, filename, path: target, bytes: buffer.length });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "保存图片失败"
    });
  }
});

app.post("/api/save-processed-image", largeImageUpload.single("image"), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, message: "缺少整理后的图片文件" });
    }

    const directory = await setSaveDirectory(req.body?.directory || await getSaveDirectory());
    const hasSubfolder = Object.prototype.hasOwnProperty.call(req.body || {}, "subfolder");
    const subfolder = hasSubfolder ? req.body.subfolder : "裁剪";
    const { filename, target } = await writeProcessedImage(
      directory,
      req.file.buffer,
      imageExtensionFromType(req.file.mimetype, req.file.originalname),
      subfolder
    );

    res.json({
      ok: true,
      directory,
      cropDirectory: String(subfolder ?? "").trim() ? path.join(directory, sanitizeSubfolderName(subfolder)) : directory,
      filename,
      path: target,
      bytes: req.file.size
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "保存整理后图片失败"
    });
  }
});

app.post("/api/cache-result-image", largeImageUpload.single("image"), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ ok: false, message: "缺少结果图片文件" });
    }

    const safeTaskId = sanitizeFilePart(req.body?.taskId || "task");
    const ext = imageExtensionFromType(req.file.mimetype, req.file.originalname);
    const filename = `HZ-${new Date().getDate()}-${safeTaskId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const target = outfitResultPath(filename);
    await mkdir(resultDir, { recursive: true });
    await writeFile(target, req.file.buffer, { flag: "wx" });
    scheduleResultCacheCleanup("post-result-write", RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS);
    res.json({
      ok: true,
      filename,
      localUrl: outfitResultUrl(filename),
      bytes: req.file.size,
      mimeType: req.file.mimetype || mimeTypeFromFile(filename)
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error instanceof Error ? error.message : "缓存结果图片失败"
    });
  }
});

app.get("/api/result/:filename", async (req, res) => {
  try {
    const filename = path.basename(decodeURIComponent(req.params.filename || ""));
    const file = outfitResultPath(filename);
    if (!existsSync(file)) return res.status(404).end();
    await streamLocalImageFile(req, res, file, {
      contentType: mimeTypeFromFile(filename),
      cacheControl: RESULT_CACHE_CONTROL
    });
  } catch {
    res.status(404).end();
  }
});

app.post("/api/generate-outfit", wrapOutfitUpload(imageForwardUpload.fields([
  { name: "image", maxCount: IMAGE_UPLOAD_PARSE_CEILING },
  { name: "mask", maxCount: 1 }
])), async (req, res) => {
  let payload = {};
  try {
    payload = req.body?.payload ? JSON.parse(req.body.payload) : {};
  } catch {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, message: "任务参数解析失败" });
  }

  const apiKey = resolveApiKey(payload.apiKey);
  if (!apiKey) {
    await removeUploadedFiles(req.files);
    return res.status(401).json({ ok: false, message: "请先在设置里填写 API Key" });
  }
  const receivedAt = Date.now();
  const requestId = String(payload.taskId || `outfit_${receivedAt}_${Math.random().toString(36).slice(2, 8)}`);
  const uploaded = outfitUploadFileGroups(req);
  let files = uploaded.imageFiles || [];
  let maskFile = uploaded.maskFile || null;
  const errors = [];
  const attempts = [];
  const helperBaseCandidates = channelBaseCandidates();
  let poseAi = null;
  let promptPayload = payload;
  const pageNameForWorkflow = String(payload.pageName || "");
  const modelTitleForWorkflow = String(payload.uploadLabels?.model?.title || "");
  const clothingTitleForWorkflow = String(payload.uploadLabels?.clothing?.title || "");
  const referenceTitleForWorkflow = String(payload.uploadLabels?.reference?.title || "");
  const workflowText = [
    payload.workflowMode,
    pageNameForWorkflow,
    modelTitleForWorkflow,
    clothingTitleForWorkflow,
    referenceTitleForWorkflow
  ].join(" ");
  const customWorkflow = String(payload.workflowMode || "") === "custom"
    || /临时需求|自定义需求|批量需求|custom/i.test(pageNameForWorkflow);
  const localDetailWorkflow = String(payload.workflowMode || "") === "local-detail"
    || /局部回贴|局部贴回|局部细节|局部精修|local\s*detail/i.test(workflowText);
  const designDraftWorkflow = String(payload.workflowMode || "") === "design-draft"
    || /设计稿|設計稿|design|实拍服装|真人实拍|细节补充/i.test(workflowText);
  const faceSwapWorkflow = String(payload.workflowMode || "") === "face-swap"
    || /批量换脸|换脸|人脸|脸部|face\s*swap/i.test(pageNameForWorkflow)
    || /人脸参考|脸部参考|人脸身份|脸部身份/i.test(workflowText)
    || (/目标人物图|人物图|模特图|原图/i.test(modelTitleForWorkflow)
      && /人脸参考|脸部参考|人脸身份|换脸|脸/i.test(clothingTitleForWorkflow));
  const poseRemixWorkflow = !faceSwapWorkflow && (
    String(payload.workflowMode || "") === "pose-remix"
    || /批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|固定成片|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(workflowText)
    || /固定母版成片|批量姿势参考图|只提取姿势/i.test(workflowText)
  );
  const outpaintWorkflow = String(payload.workflowMode || "") === "outpaint"
    || /批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(workflowText)
    || /待扩图原图|扩图参考图/i.test(workflowText);
  const randomBackgroundWorkflow = String(payload.workflowMode || "") === "random-background"
    || /随机背景|随机场景|随机实景|random\s*background/i.test(pageNameForWorkflow);
  const backgroundChangeWorkflow = !randomBackgroundWorkflow && (
    String(payload.workflowMode || "") === "background-change"
    || /换背景|換背景|背景更换|背景替换|换场景/i.test(pageNameForWorkflow)
    || /统一场景|场景图|目标场景|背景图|换背景|背景/i.test(clothingTitleForWorkflow)
    || (/人物图|人物照|人物|模特图|模特/i.test(modelTitleForWorkflow)
      && /统一场景|场景图|目标场景|背景图|换背景|背景/i.test(clothingTitleForWorkflow))
    || /PS贴回/i.test(workflowText)
  );
  const recolorWorkflow = String(payload.workflowMode || "") === "recolor"
    || /批量改色|改色|换色|服装改色|颜色替换|颜色参考|recolor/i.test(pageNameForWorkflow)
    || /改色服装参考图|目标颜色|颜色参考|颜色替换|换色/i.test(clothingTitleForWorkflow)
    || /改色服装参考图|目标颜色|颜色替换/i.test(workflowText);
  const whiteRefineWorkflow = String(payload.workflowMode || "") === "white-refine"
    || /批量白底精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(pageNameForWorkflow)
    || /批量平铺图|挂拍图|可选参考.*细节图|白底商品图|衣架去除/i.test(workflowText);
  const outfitWorkflow = !customWorkflow && !localDetailWorkflow && !poseRemixWorkflow && !outpaintWorkflow && !backgroundChangeWorkflow && !randomBackgroundWorkflow && !recolorWorkflow && !whiteRefineWorkflow && !designDraftWorkflow && !faceSwapWorkflow;
  if (!outpaintWorkflow) {
    maskFile = null;
  }
  const outfitReferenceMentioned = /图\s*3|图三|第三张|第三个|补充图|补充参考|参考图\s*3|reference\s*3/i.test([
    payload.prompt,
    payload.productNote
  ].join("\n"));
  if (outfitWorkflow && files.length > 2 && !outfitReferenceMentioned) {
    files = files.slice(0, 2);
    payload = { ...payload, referenceCount: 0 };
    promptPayload = payload;
  }
  if (localDetailWorkflow && !payload.localEdit?.enabled) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({
      ok: false,
      message: "局部回贴页需要先在图1缩略图下方设置局部回贴区域"
    });
  }

  const minRequiredFiles = outpaintWorkflow || whiteRefineWorkflow || randomBackgroundWorkflow ? 1 : 2;
  if (!Array.isArray(files) || files.length < minRequiredFiles) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({
      ok: false,
      message: faceSwapWorkflow
        ? "至少需要 1 张图1目标人物图和 1 张图2人脸参考图"
        : poseRemixWorkflow
          ? "至少需要 1 张图1姿态参考图和 1 张图2固定母版成片"
          : outpaintWorkflow
            ? "至少需要 1 张图1待扩图原图"
            : whiteRefineWorkflow
              ? "至少需要 1 张图1平铺图或挂拍图；图2参考图可选"
            : randomBackgroundWorkflow
              ? "至少需要 1 张图1人物图"
            : backgroundChangeWorkflow
              ? "至少需要 1 张人物图和 1 张场景图"
              : recolorWorkflow
                ? "至少需要 1 张图1原图和 1 张图2颜色参考图"
                : localDetailWorkflow
                  ? "至少需要 1 张图1待回贴图和 1 张图2细节结构参考图"
                  : "至少需要 1 张模特图和 1 张服装图"
    });
  }

  // 结构化换装意图：服务端权威校验。
  // 必须在智能介入之前 —— 非法枚举不能等到可能真实扣费的那一步才拒绝。
  // 只有"批量换装"带 outfitIntent 时才校验/收敛；其它 workflow 不带这个字段，行为不变。
  if (payload.outfitIntent !== undefined) {
    const intentCheck = validateOutfitIntent(payload.outfitIntent);
    if (!intentCheck.ok) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({
        ok: false,
        error: "invalid_outfit_intent",
        message: `换装设置不合法：${intentCheck.errors[0]}`,
        errors: intentCheck.errors
      });
    }
    if (String(payload.workflowMode || "") === "outfit") {
      // 用归一化后的意图覆盖，后面 buildOutfitPrompt() 只认这一份。
      payload = { ...payload, outfitIntent: intentCheck.intent };
      promptPayload = payload;
    }
  }

  // 服装精修结构化意图：服务端权威校验（与换装同口径）。
  // 非法枚举 / 版本不对 / customPrompt 不是字符串 → 明确 400，绝不让 [object Object] 进提示词。
  if (payload.retouchIntent !== undefined) {
    const retouchCheck = validateRetouchIntent(payload.retouchIntent);
    if (!retouchCheck.ok) {
      await removeUploadedFiles(req.files);
      return res.status(400).json({
        ok: false,
        error: "invalid_retouch_intent",
        message: `精修设置不合法：${retouchCheck.errors[0]}`,
        errors: retouchCheck.errors
      });
    }
    if (String(payload.workflowMode || "") === "white-refine") {
      payload = { ...payload, retouchIntent: retouchCheck.intent };
      promptPayload = payload;
    }
  }

  // 路由 + 能力校验必须排在智能介入之前。
  // 智能介入会带服务器 KEY 调上游（可能真实扣费），旧 channelId 不能等到那之后才拒绝。
  const preflightParams = normalizeImageRequest({
    ...payload,
    prompt: buildOutfitPrompt(payload),
    n: 1,
    source: "outfit"
  });
  const preflightRouting = validateImageRouting(preflightParams);
  if (!preflightRouting.ok) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: preflightRouting.code || "invalid_channel", message: preflightRouting.message });
  }
  const preflightCapability = validateImageCapabilities(preflightParams, files);
  if (!preflightCapability.ok) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: preflightCapability.code, message: preflightCapability.message });
  }

  const smartInterventionEnabled = !designDraftWorkflow
    && !customWorkflow
    && !poseRemixWorkflow
    && !outpaintWorkflow
    && !randomBackgroundWorkflow
    && !recolorWorkflow
    && !whiteRefineWorkflow
    && isSmartOutfitInterventionEnabled(payload.smartIntervention);

  if (smartInterventionEnabled) {
    const smartStartedAt = Date.now();
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: true,
      stage: "smart-intervention-start",
      endpoint: "/api/generate-outfit",
      workflowMode: payload.workflowMode || null,
      fileCount: files.length,
      uploadBytes: files.reduce((sum, file) => sum + file.size, 0),
      baseCandidateCount: helperBaseCandidates.length
    });
    try {
      poseAi = await createOutfitPoseAnchor({
        input: payload,
        modelFile: await ensureFileBuffer(files[0]),
        apiKey,
        baseUrls: helperBaseCandidates
      });
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: true,
        stage: "smart-intervention-finished",
        endpoint: "/api/generate-outfit",
        timingMs: Date.now() - smartStartedAt,
        model: poseAi.model || "",
        mode: poseAi.mode || "",
        attemptCount: Array.isArray(poseAi.attempts) ? poseAi.attempts.length : 0
      });
      promptPayload = {
        ...payload,
        smartIntervention: true,
        poseAnchorPrompt: poseAi.promptBlock
      };
    } catch (error) {
      poseAi = {
        ok: false,
        message: error?.name === "AbortError"
          ? (faceSwapWorkflow ? "头脸锚点分析超时，已回退到基础换脸 SKILL" : poseRemixWorkflow ? "母版锚点分析超时，已回退到基础换姿势 SKILL" : backgroundChangeWorkflow ? "人物锚点分析超时，已回退到基础换背景 SKILL" : "姿态分析超时，已回退到基础香蕉 SKILL")
          : error instanceof Error ? error.message : String(error)
      };
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: false,
        stage: "smart-intervention-failed",
        endpoint: "/api/generate-outfit",
        timingMs: Date.now() - smartStartedAt,
        error: poseAi.message
      });
    }
  }

  const params = normalizeImageRequest({
    ...promptPayload,
    prompt: buildOutfitPrompt(promptPayload),
    n: 1,
    source: "outfit"
  });
  const routing = validateImageRouting(params);
  if (!routing.ok) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: routing.code || "invalid_channel", message: routing.message });
  }
  // 批量换装同样走 capabilities 最终校验（图片数量 / 单张大小 / 提示词长度 / 比例 / 尺寸）。
  const capability = validateImageCapabilities(params, files);
  if (!capability.ok) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: capability.code, message: capability.message });
  }
  if (maskFile) {
    params.maskFile = maskFile;
  }
  const promptLog = imagePromptLogFields(params, promptPayload);
  // 注意（2026-09-25 审查）：这个信号前端确实在发（src/outfit-workflow.jsx 的
  // `deferAutoSave: Boolean(localEdit || taskIsOutpaint)`），但**这里算完没人用**。
  // V3 基线里同名字段（deferOutfitArchive）是拿来跳过服务端归档的；V11 架构变了：
  // 批量接口压根没有"写历史"这一步（persistGeneratedItemsInBackground 只被 /api/images 调用），
  // 服务端只做 HZ- 显示缓存，而 UI 依赖这个本地地址显示结果——照搬"跳过归档"会踩到显示契约。
  // 所以**先保留、不改保存时机**，等产品确认批量局部回贴/扩图到底要不要省掉这次归档。
  // 现状已被 scripts/verify/outfit-defer-autosave-check.mjs 钉住，改行为必须先让它红。
  // 这里**故意不加 `void`**：让 ESLint 继续报它未使用，等于把"这个问题还没定"留在门禁视野里。
  const deferOutfitAutoSave = Boolean(payload.deferAutoSave || payload.localEdit?.enabled);
  const uploadBytes = files.reduce((sum, file) => sum + file.size, 0) + (maskFile?.size || 0);
  const baseCandidates = imageChannelBaseCandidates(params.model);
  let releaseImageSlot = null;
  let billingTask = null;

  writeGenerationLog({
    time: new Date().toISOString(),
    requestId,
    ok: true,
    stage: "local-outfit-request-prepared",
    endpoint: "/api/generate-outfit",
    workflowMode: payload.workflowMode || null,
    model: params.model,
    imageSize: params.imageSize,
    aspectRatio: params.aspectRatio,
    fileCount: files.length,
    hasMask: Boolean(maskFile),
    uploadBytes,
    localUploadParseMs: Math.max(0, receivedAt - (localGenerationRequestStartedAt.get(requestId) || receivedAt)),
    hasApiKey: Boolean(apiKey),
    smartIntervention: smartInterventionEnabled,
    masterFitLock: Boolean(promptPayload.masterFitLock),
    localEdit: Boolean(payload.localEdit?.enabled),
    imageConcurrency: {
      limit: IMAGE_CONCURRENCY_LIMIT,
      active: activeImageRequestCount,
      queued: imageRequestQueue.length
    }
  }).catch(() => {});

  try {
    const queueStartedAt = Date.now();
    releaseImageSlot = await acquireImageSlot(1);
    const queueWaitMs = Date.now() - queueStartedAt;
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: true,
      stage: "image-slot-acquired",
      endpoint: "/api/generate-outfit",
      weight: 1,
      queueWaitMs,
      imageConcurrency: {
        limit: IMAGE_CONCURRENCY_LIMIT,
        active: activeImageRequestCount,
        queued: imageRequestQueue.length
      }
    });
    const billing = await prepareImageBillingForRequest({
      requestId,
      apiKey,
      params,
      files,
      candidates: baseCandidates,
      metadata: {
        endpoint: "/api/generate-outfit",
        workflowMode: payload.workflowMode || null,
        localEdit: Boolean(payload.localEdit?.enabled),
        hasMask: Boolean(maskFile),
        smartIntervention: smartInterventionEnabled,
        masterFitLock: Boolean(promptPayload.masterFitLock)
      }
    });
    if (billing.errorPayload) {
      return res.status(billing.errorPayload.status).json({
        ...billing.errorPayload,
        errors: [billing.errorPayload.message],
        smartIntervention: smartInterventionEnabled,
        poseAi
      });
    }
    billingTask = billing.billingTask;
    const imageCandidates = imageCandidateEntries(baseCandidates, billingTask);
    const forwardParams = await prepareJsonImageUrlsForChannel(params, files);

    baseLoop:
    for (const [baseIndex, candidate] of imageCandidates.entries()) {
      const channelLog = imageChannelLogForCandidate(candidate, baseIndex, imageCandidates.length);
      const channelApiKey = imageApiKeyForCandidate(candidate, apiKey);
      const usesPrivateChannelKey = Boolean((candidate.usesSignedRoute && candidate.hasCredential) || (channelApiKey && channelApiKey !== apiKey));
      const requestVariants = imageRequestVariantsForCandidate(forwardParams, files, candidate);
      for (const [variantIndex, variant] of requestVariants.entries()) {
        const url = imageUrlForCandidate(candidate, variant, files.length > 0);
        const body = await variant.createBody();
        const headers = imageHeadersForCandidate(candidate, channelApiKey, variant.headers);
        const abort = createAbortSignal(IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS);
        const forwardedAt = Date.now();
        try {
          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: true,
            stage: "forward-outfit-request",
            url,
            ...channelLog,
            attempt: attempts.length + 1,
            baseAttempt: baseIndex + 1,
            candidateCount: imageCandidates.length,
            requestVariant: variant.id,
            requestFormat: variant.requestFormat,
            requestedModel: params.model,
            requestedChannelId: params.channelId,
            model: variant.model,
            protocol: variant.protocol,
            imageSize: params.imageSize,
            aspectRatio: params.aspectRatio,
            ...promptLog,
            fileCount: files.length,
            hasMask: Boolean(maskFile),
            uploadBytes,
            hasApiKey: Boolean(apiKey),
            hasChannelApiKey: Boolean(channelApiKey) || candidate.hasCredential,
            usesPrivateChannelKey,
            usesSignedRoute: Boolean(candidate.usesSignedRoute),
            smartIntervention: smartInterventionEnabled,
            masterFitLock: Boolean(promptPayload.masterFitLock),
            workflowMode: payload.workflowMode || null
          });
          const response = await fetch(url, {
            method: "POST",
            headers,
            body,
            signal: abort.signal
          });
          const responseAt = Date.now();
          const parsed = await readTextSafely(response);
          const upstreamMessage = upstreamErrorMessage(parsed, response.status);
          const privateChannelAuthFault = !response.ok && shouldTreatPrivateChannelAuthAsChannelFault(candidate, response.status, upstreamMessage);
          const timing = {
            totalMs: Date.now() - receivedAt,
            channelWaitMs: responseAt - forwardedAt,
            parseMs: Date.now() - responseAt
          };
          attempts.push({
            url,
            ...channelLog,
            status: response.status,
            ok: response.ok,
            model: variant.model,
            requestFormat: variant.requestFormat,
            errorCode: response.ok ? "" : (privateChannelAuthFault ? "channel_timeout" : publicImageErrorCode(response.status, upstreamMessage)),
            message: compactLogMessage(upstreamMessage, 500)
          });

          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: response.ok,
            status: response.status,
            url,
            ...channelLog,
            stage: "generate-outfit",
            attempt: attempts.length,
            baseAttempt: baseIndex + 1,
            candidateCount: imageCandidates.length,
            requestVariant: variant.id,
            requestFormat: variant.requestFormat,
            requestedModel: params.model,
            requestedChannelId: params.channelId,
            model: variant.model,
            protocol: variant.protocol,
            imageSize: params.imageSize,
            aspectRatio: params.aspectRatio,
            ...promptLog,
            fileCount: files.length,
            hasMask: Boolean(maskFile),
            uploadBytes,
            hasApiKey: Boolean(apiKey),
            hasChannelApiKey: Boolean(channelApiKey) || candidate.hasCredential,
            usesPrivateChannelKey,
            usesSignedRoute: Boolean(candidate.usesSignedRoute),
            timing,
            smartIntervention: smartInterventionEnabled,
            masterFitLock: Boolean(promptPayload.masterFitLock),
            workflowMode: payload.workflowMode || null,
            customWorkflow,
            localDetailWorkflow,
            outpaintWorkflow,
            backgroundChangeWorkflow,
            randomBackgroundWorkflow,
            faceSwapWorkflow,
            localEdit: Boolean(payload.localEdit?.enabled),
            poseAi: poseAi ? {
              ok: poseAi.ok,
              model: poseAi.model,
              mode: poseAi.mode,
              totalMs: poseAi.timing?.totalMs,
              message: poseAi.message ? compactLogMessage(poseAi.message, 400) : undefined
            } : null,
            response: parsed.json ? summarizeResponse(parsed.json) : { textLength: parsed.text.length },
            ...(response.ok ? {} : {
              failureReason: privateChannelAuthFault ? "channel_timeout" : publicImageErrorCode(response.status, upstreamMessage),
              upstreamError: compactLogMessage(upstreamMessage, 900)
            })
          });

          if (!response.ok) {
            errors.push(`HTTP ${response.status} ${compactLogMessage(upstreamMessage, 500)} [${variant.model} / ${variant.requestFormat}]`);
            if (variantIndex < requestVariants.length - 1 && shouldTryNextImageVariant(response.status, upstreamMessage)) continue;
            if (baseIndex < imageCandidates.length - 1 && (privateChannelAuthFault || shouldTryNextChannel(response.status, upstreamMessage))) continue baseLoop;
            const publicPayload = publicImageErrorPayload({
              requestId,
              status: privateChannelAuthFault ? 504 : response.status,
              upstreamMessage: privateChannelAuthFault ? "private channel auth failed" : upstreamMessage,
              params,
              attempts
            });
            finalizeBillingInBackground(billingTask, {
              ok: false,
              status: publicPayload.status,
              error: publicPayload.error,
              message: publicPayload.message,
              usedModel: variant.model,
              timingMs: timing.totalMs,
              attempts
            });
            return res.status(publicPayload.status).json({
              ...publicPayload,
              errors: [publicPayload.message],
              smartIntervention: smartInterventionEnabled,
              poseAi
            });
          }

          const images = extractImagesFromResponse(parsed.json);
          if (!images.length) {
            errors.push(`渠道返回成功但没有图片 [${variant.model} / ${variant.requestFormat}]`);
            if (variantIndex < requestVariants.length - 1) continue;
            if (baseIndex < imageCandidates.length - 1 && shouldTryNextChannel(502, "渠道返回成功但没有图片")) continue baseLoop;
            const publicPayload = publicImageErrorPayload({
              requestId,
              status: 502,
              upstreamMessage: "渠道返回成功但没有图片",
              params,
              attempts
            });
            finalizeBillingInBackground(billingTask, {
              ok: false,
              status: publicPayload.status,
              error: publicPayload.error,
              message: publicPayload.message,
              usedModel: variant.model,
              timingMs: timing.totalMs,
              attempts
            });
            return res.status(publicPayload.status).json({
              ...publicPayload,
              errors: [publicPayload.message],
              smartIntervention: smartInterventionEnabled,
              poseAi
            });
          }

          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: true,
            stage: "upstream-outfit-images-ready",
            imageCount: images.length,
            timing,
            postParseMs: Date.now() - responseAt
          });
          const displayCacheStartedAt = Date.now();
          const displayImage = await cacheOutfitGeneratedImageForDisplay(images[0], requestId, RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS);
          const displayCacheMs = Date.now() - displayCacheStartedAt;
          const hasLocalDisplayImage = String(displayImage?.localUrl || "").startsWith("/api/result/")
            || Boolean(displayImage?.resultArchiveFile);
          if (!hasLocalDisplayImage) {
            archiveOutfitGeneratedImageInBackground(images[0], requestId, "background-display-cache-outfit-result-image");
          }
          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: true,
            stage: "local-outfit-response-ready",
            imageCount: images.length,
            hasLocalDisplayImage,
            displayCacheMs,
            totalMs: Date.now() - receivedAt,
            upstreamChannelWaitMs: timing.channelWaitMs
          });
          finalizeBillingInBackground(billingTask, {
            ok: true,
            status: response.status,
            usedChannel: attempts[attempts.length - 1] || null,
            usedModel: variant.model,
            outputCount: images.length,
            timingMs: Date.now() - receivedAt,
            attempts
          });
          return res.json({
            ok: true,
            taskId: requestId,
            image: displayImage,
            prompt: params.prompt,
            timingMs: Date.now() - receivedAt,
            usedModel: params.model,
            autoSavePending: false,
            smartIntervention: smartInterventionEnabled,
            poseAi: poseAi ? {
              ok: poseAi.ok,
              model: poseAi.model || null,
              mode: poseAi.mode || null,
              timing: poseAi.timing || null
            } : null
          });
        } catch (error) {
          const errorMessage = error?.name === "AbortError" ? "图片接口等待超时" : error instanceof Error ? error.message : String(error);
          const failureStatus = error?.name === "AbortError" ? 504 : 502;
          errors.push(errorMessage);
          attempts.push({
            url,
            ...channelLog,
            status: failureStatus,
            ok: false,
            model: variant.model,
            requestFormat: variant.requestFormat,
            errorCode: error?.name === "AbortError" ? "channel_timeout" : "channel_error",
            message: compactLogMessage(errorMessage, 500)
          });
          if (variantIndex < requestVariants.length - 1 && shouldTryNextImageVariant(failureStatus, errorMessage)) continue;
          if (baseIndex < imageCandidates.length - 1 && shouldTryNextChannel(failureStatus, errorMessage)) continue baseLoop;
          const publicPayload = publicImageErrorPayload({
            requestId,
            status: failureStatus,
            upstreamMessage: errorMessage,
            params,
            attempts
          });
          finalizeBillingInBackground(billingTask, {
            ok: false,
            status: publicPayload.status,
            error: publicPayload.error,
            message: publicPayload.message,
            usedModel: variant.model,
            timingMs: Date.now() - receivedAt,
            attempts
          });
          return res.status(publicPayload.status).json({
            ...publicPayload,
            errors: [publicPayload.message],
            smartIntervention: smartInterventionEnabled,
            poseAi,
            timingMs: Date.now() - receivedAt
          });
        } finally {
          abort.dispose();
        }
      }
    }

    const upstreamMessage = primaryOutfitGenerationError(errors);
    const publicPayload = publicImageErrorPayload({
      requestId,
      status: 502,
      upstreamMessage,
      params,
      attempts
    });
    finalizeBillingInBackground(billingTask, {
      ok: false,
      status: publicPayload.status,
      error: publicPayload.error,
      message: publicPayload.message,
      usedModel: params.model,
      timingMs: Date.now() - receivedAt,
      attempts
    });
    res.status(publicPayload.status).json({
      ...publicPayload,
      errors: [publicPayload.message],
      smartIntervention: smartInterventionEnabled,
      poseAi,
      timingMs: Date.now() - receivedAt
    });
  } finally {
    releaseImageSlot?.();
    await removeUploadedFiles(req.files);
  }
});

// 中文注释：只分析当前图2上身母版一次，返回可编辑的固定版型规格，不参与图片生成。
app.post("/api/outfit-master-fit-analysis", upload.single("image"), async (req, res) => {
  let payload = {};
  try {
    payload = req.body?.payload ? JSON.parse(req.body.payload) : {};
  } catch {
    return res.status(400).json({ ok: false, message: "母版分析参数解析失败" });
  }

  const apiKey = resolveApiKey(payload.apiKey);
  if (!apiKey) {
    return res.status(401).json({ ok: false, message: "请先在设置里填写 API Key" });
  }
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ ok: false, message: "请先选择图2服装母版" });
  }

  const receivedAt = Date.now();
  try {
    const result = await createOutfitMasterFitSpec({
      input: payload,
      clothingFile: req.file,
      apiKey,
      baseUrls: channelBaseCandidates()
    });
    await writeGenerationLog({
      time: new Date().toISOString(),
      ok: true,
      stage: "outfit-master-fit-analysis",
      model: result.model,
      usedBaseUrl: result.usedBaseUrl,
      mode: result.mode,
      timing: result.timing,
      attempts: result.attempts,
      source: result.source
    });
    res.json({
      ok: true,
      model: result.model,
      mode: result.mode,
      timingMs: Date.now() - receivedAt,
      source: result.source,
      // 2026-09-26：只返回结构化服装事实。
      // 原来的 spec / promptBlock（整段母版提示词）已删除 —— 分析结果必须先转结构化数据，
      // 再由 src/shared/outfit-intent.js 的唯一编译器按选中部位插进最终提示词，
      // 不允许再把一整段文本直接拼进生图提示词。
      facts: result.facts
    });
  } catch (error) {
    const rawMessage = error?.name === "AbortError"
      ? "图2母版版型分析超时，请稍后重试"
      : error instanceof Error ? error.message : String(error);
    const publicPayload = publicImageErrorPayload({
      requestId: `master_fit_${receivedAt}`,
      status: error?.name === "AbortError" ? 504 : 502,
      upstreamMessage: rawMessage,
      attempts: []
    });
    await writeGenerationLog({
      time: new Date().toISOString(),
      ok: false,
      stage: "outfit-master-fit-analysis",
      timing: { totalMs: Date.now() - receivedAt },
      error: rawMessage,
      publicError: publicPayload.message
    });
    res.status(publicPayload.status).json({
      ok: false,
      error: publicPayload.error,
      message: publicPayload.message
    });
  }
});

// 中文注释：生成后可选 AI 质检，只标记结果和返修建议，不自动返修，方便先测试质检准确性。
app.post("/api/outfit-quality-check", upload.fields([
  { name: "image1", maxCount: 1 },
  { name: "image2", maxCount: 1 },
  { name: "result", maxCount: 1 },
  { name: "reference", maxCount: 6 }
]), async (req, res) => {
  let payload = {};
  try {
    payload = req.body?.payload ? JSON.parse(req.body.payload) : {};
  } catch {
    return res.status(400).json({ ok: false, message: "AI质检参数解析失败" });
  }

  const apiKey = resolveApiKey(payload.apiKey);
  if (!apiKey) {
    return res.status(401).json({ ok: false, message: "请先在设置里填写 API Key" });
  }

  const files = {
    image1: req.files?.image1?.[0] || null,
    image2: req.files?.image2?.[0] || null,
    result: req.files?.result?.[0] || null,
    reference: req.files?.reference || []
  };
  if (!files.image1?.buffer?.length || !files.image2?.buffer?.length || !files.result?.buffer?.length) {
    return res.status(400).json({ ok: false, message: "AI质检需要图1、图2和生成结果" });
  }

  const receivedAt = Date.now();
  try {
    const result = await createOutfitQualityCheck({
      input: payload,
      files,
      apiKey,
      baseUrls: channelBaseCandidates()
    });
    await writeGenerationLog({
      time: new Date().toISOString(),
      ok: true,
      stage: "outfit-quality-check",
      workflowMode: payload.workflowMode || null,
      pageName: payload.pageName || null,
      pass: result.pass,
      score: result.score,
      model: result.model,
      usedBaseUrl: result.usedBaseUrl,
      mode: result.mode,
      timing: result.timing,
      attempts: result.attempts
    });
    res.json({
      ok: true,
      pass: result.pass,
      score: result.score,
      summary: result.summary,
      issues: result.issues,
      repairPrompt: result.repairPrompt,
      faceQuality: result.faceQuality,
      poseMatch: result.poseMatch,
      outfitMatch: result.outfitMatch,
      model: result.model,
      mode: result.mode,
      timingMs: Date.now() - receivedAt
    });
  } catch (error) {
    const rawMessage = error?.name === "AbortError"
      ? "AI质检超时，请稍后重试"
      : error instanceof Error ? error.message : String(error);
    const publicPayload = publicImageErrorPayload({
      requestId: `quality_${receivedAt}`,
      status: error?.name === "AbortError" ? 504 : 502,
      upstreamMessage: rawMessage,
      attempts: []
    });
    await writeGenerationLog({
      time: new Date().toISOString(),
      ok: false,
      stage: "outfit-quality-check",
      workflowMode: payload.workflowMode || null,
      pageName: payload.pageName || null,
      timing: { totalMs: Date.now() - receivedAt },
      error: compactLogMessage(rawMessage, 600),
      publicError: publicPayload.message
    });
    res.status(publicPayload.status).json({
      ok: false,
      error: publicPayload.error,
      message: publicPayload.message
    });
  }
});

app.get("/api/image-proxy", async (req, res) => {
  let target;
  try {
    target = parseProxyTarget(req.query.url);
  } catch (error) {
    // 非白名单主机：直接回 403，**不发起任何上游请求**（避免无意义的 502 与等待）
    if (error instanceof Error && error.message === "blocked_image_host") {
      await writeAssetLog({
        time: new Date().toISOString(),
        ok: false,
        stage: "image-proxy-blocked-host",
        url: String(req.query.url || "").slice(0, 300),
        error: "blocked_image_host"
      }).catch(() => {});
      return res.status(403).json({ ok: false, message: "blocked_image_host" });
    }
    return res.status(400).json({ ok: false, message: "图片地址无效" });
  }
  void target;

  try {
    await streamExternalImageProxy(req, res, req.query.url, IMAGE_PROXY_TIMEOUT_MS);
    return;
  } catch (streamError) {
    if (res.headersSent) return;
    await writeAssetLog({
      time: new Date().toISOString(),
      ok: false,
      stage: "image-proxy-stream",
      url: String(req.query.url || "").slice(0, 500),
      error: streamError instanceof Error ? streamError.message : String(streamError || "")
    }).catch(() => {});
  }

  const imageDownload = await downloadExternalImageWithFallback(req.query.url, IMAGE_PROXY_TIMEOUT_MS).catch((error) => ({
    error
  }));
  if (res.headersSent) return;
  if (!imageDownload.error) {
    res.status(200);
    res.setHeader("Content-Type", imageDownload.mimeType || "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Length", String(imageDownload.buffer.length));
    res.end(imageDownload.buffer);
    return;
  }

  return res.status(502).json({
    ok: false,
    message: "图片下载失败，请检查结果图源是否可访问",
    error: imageDownload.error instanceof Error ? imageDownload.error.message : String(imageDownload.error || ""),
    rangeError: imageDownload.error?.rangeError instanceof Error ? imageDownload.error.rangeError.message : undefined
  });
});

app.post("/api/images", wrapOutfitUpload(imageForwardUpload.array("image", IMAGE_UPLOAD_PARSE_CEILING)), async (req, res) => {
  const receivedAt = Date.now();
  const files = req.files || [];
  const deferAutoSave = String(req.body?.deferAutoSave || "") === "1";
  const params = normalizeImageRequest(req.body);
  const routing = validateImageRouting(params);
  if (!routing.ok) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: routing.code || "invalid_channel", message: routing.message });
  }
  // 服务端最终校验：图片数量 / 单张大小 / 提示词长度 / 比例 / 尺寸 / 质量 / 背景
  // 全部以 routing catalog 的 capabilities 为准，不依赖前端。
  const capability = validateImageCapabilities(params, files);
  if (!capability.ok) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: capability.code, message: capability.message });
  }
  const apiKey = resolveApiKey(req.body.apiKey);
  const candidates = imageChannelBaseCandidates(params.model);
  const requestId = String(req.headers["x-jingyin-client-request-id"] || `img_${receivedAt}_${Math.random().toString(36).slice(2, 9)}`);

  if (!apiKey) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: "missing_api_key", message: "缺少 API Key" });
  }
  if (!params.prompt) {
    await removeUploadedFiles(req.files);
    return res.status(400).json({ ok: false, error: "missing_prompt", message: "缺少提示词" });
  }

  const uploadBytes = files.reduce((sum, file) => sum + file.size, 0);
  const promptLog = imagePromptLogFields(params, req.body || {});
  const attempts = [];
  let releaseImageSlot = null;
  let lastForwardedAt = receivedAt;
  let billingTask = null;

  writeGenerationLog({
    time: new Date().toISOString(),
    requestId,
    ok: true,
    stage: "local-api-images-request-prepared",
    endpoint: "/api/images",
    model: params.model,
    imageSize: params.imageSize,
    aspectRatio: params.aspectRatio,
    n: params.n,
    fileCount: files.length,
    uploadBytes,
    localUploadParseMs: Math.max(0, receivedAt - (localGenerationRequestStartedAt.get(requestId) || receivedAt)),
    hasApiKey: Boolean(apiKey),
    deferAutoSave,
    imageConcurrency: {
      limit: IMAGE_CONCURRENCY_LIMIT,
      active: activeImageRequestCount,
      queued: imageRequestQueue.length
    }
  }).catch(() => {});

  try {
    const queueStartedAt = Date.now();
    releaseImageSlot = await acquireImageSlot(params.n);
    const queueWaitMs = Date.now() - queueStartedAt;
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: true,
      stage: "image-slot-acquired",
      endpoint: "/api/images",
      weight: imageSlotWeight(params.n),
      queueWaitMs,
      imageConcurrency: {
        limit: IMAGE_CONCURRENCY_LIMIT,
        active: activeImageRequestCount,
        queued: imageRequestQueue.length
      }
    });
    const billing = await prepareImageBillingForRequest({
      requestId,
      apiKey,
      params,
      files,
      candidates,
      metadata: {
        endpoint: "/api/images",
        deferAutoSave
      }
    });
    if (billing.errorPayload) {
      return res.status(billing.errorPayload.status).json(billing.errorPayload);
    }
    billingTask = billing.billingTask;
    const imageCandidates = imageCandidateEntries(candidates, billingTask);
    const forwardParams = await prepareJsonImageUrlsForChannel(params, files);

    baseLoop:
    for (const [baseIndex, candidate] of imageCandidates.entries()) {
      const channelLog = imageChannelLogForCandidate(candidate, baseIndex, imageCandidates.length);
      const channelApiKey = imageApiKeyForCandidate(candidate, apiKey);
      const usesPrivateChannelKey = Boolean((candidate.usesSignedRoute && candidate.hasCredential) || (channelApiKey && channelApiKey !== apiKey));
      const requestVariants = imageRequestVariantsForCandidate(forwardParams, files, candidate);
      for (const [variantIndex, variant] of requestVariants.entries()) {
        const url = imageUrlForCandidate(candidate, variant, files.length > 0);
        const body = await variant.createBody();
        const headers = imageHeadersForCandidate(candidate, channelApiKey, variant.headers);

        const forwardedAt = Date.now();
        lastForwardedAt = forwardedAt;
        const abort = createAbortSignal(IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS);
        try {
          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: true,
            stage: "forward-api-images-request",
            url,
            ...channelLog,
            attempt: attempts.length + 1,
            baseAttempt: baseIndex + 1,
            candidateCount: imageCandidates.length,
            requestVariant: variant.id,
            requestFormat: variant.requestFormat,
            protocol: variant.protocol,
            requestedModel: params.model,
            requestedChannelId: params.channelId,
            model: variant.model,
            imageSize: params.imageSize,
            aspectRatio: params.aspectRatio,
            ...promptLog,
            fileCount: files.length,
            uploadBytes,
            hasApiKey: Boolean(apiKey),
            hasChannelApiKey: Boolean(channelApiKey) || candidate.hasCredential,
            usesPrivateChannelKey,
            usesSignedRoute: Boolean(candidate.usesSignedRoute)
          });
          const response = await fetch(url, {
            method: "POST",
            headers,
            body,
            signal: abort.signal
          });
          const responseAt = Date.now();
          const parsed = await readTextSafely(response);
          const images = parsed.json ? extractImagesFromResponse(parsed.json) : [];
          const upstreamMessage = upstreamErrorMessage(parsed, response.status);
          const privateChannelAuthFault = !response.ok && shouldTreatPrivateChannelAuthAsChannelFault(candidate, response.status, upstreamMessage);
          const timing = {
            totalMs: Date.now() - receivedAt,
            channelWaitMs: responseAt - forwardedAt,
            parseMs: Date.now() - responseAt
          };
          const attempt = {
            url,
            ...channelLog,
            status: response.status,
            ok: response.ok,
            model: variant.model,
            requestFormat: variant.requestFormat,
            errorCode: response.ok ? "" : (privateChannelAuthFault ? "channel_timeout" : publicImageErrorCode(response.status, upstreamMessage)),
            message: compactLogMessage(upstreamMessage, 500)
          };
          attempts.push(attempt);

          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: response.ok,
            status: response.status,
            url,
            ...channelLog,
            attempt: attempts.length,
            baseAttempt: baseIndex + 1,
            candidateCount: imageCandidates.length,
            requestVariant: variant.id,
            requestFormat: variant.requestFormat,
            protocol: variant.protocol,
            requestedModel: params.model,
            requestedChannelId: params.channelId,
            model: variant.model,
            imageSize: params.imageSize,
            aspectRatio: params.aspectRatio,
            ...promptLog,
            fileCount: files.length,
            uploadBytes,
            hasApiKey: Boolean(apiKey),
            hasChannelApiKey: Boolean(channelApiKey) || candidate.hasCredential,
            usesPrivateChannelKey,
            usesSignedRoute: Boolean(candidate.usesSignedRoute),
            timing,
            response: parsed.json ? summarizeResponse(parsed.json) : { textLength: parsed.text.length },
            ...(response.ok ? {} : {
              failureReason: privateChannelAuthFault ? "channel_timeout" : publicImageErrorCode(response.status, upstreamMessage),
              upstreamError: compactLogMessage(upstreamMessage, 900)
            })
          });

          if (response.ok && images.length) {
            await writeGenerationLog({
              time: new Date().toISOString(),
              requestId,
              ok: true,
              stage: "upstream-api-images-ready",
              imageCount: images.length,
              timing,
              postParseMs: Date.now() - responseAt
            });
            const referenceAssets = await archiveReferenceAssets(files, req.body.referenceMeta, requestId);
            const historyItems = buildHistoryItems(images, params, files, requestId, timing, responseAt, referenceAssets);
            const displayCacheStartedAt = Date.now();
            const displayHistoryItems = await Promise.all(historyItems.map((item) => (
              historyItemForImmediateDisplay(item, requestId, RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS)
            )));
            const displayCacheMs = Date.now() - displayCacheStartedAt;
            const localDisplayCount = displayHistoryItems.filter(hasHistoryDisplayArchive).length;
            if (!deferAutoSave) {
              persistGeneratedItemsInBackground(displayHistoryItems, requestId, "api-images-background-persist");
            }
            await writeGenerationLog({
              time: new Date().toISOString(),
              requestId,
              ok: true,
              stage: "local-api-images-response-ready",
              imageCount: images.length,
              localDisplayCount,
              displayCacheMs,
              totalMs: Date.now() - receivedAt,
              upstreamChannelWaitMs: timing.channelWaitMs
            });

            finalizeBillingInBackground(billingTask, {
              ok: true,
              status: response.status,
              usedChannel: attempt,
              usedModel: variant.model,
              outputCount: images.length,
              timingMs: timing.totalMs,
              attempts
            });

            return res.json({
              ok: true,
              requestId,
              images: displayHistoryItems.map((item) => item.image),
              historyItems: displayHistoryItems,
              autoSavedCount: 0,
              autoSavePending: !deferAutoSave && historyItems.length > 0,
              timing,
              usedModel: params.model,
              response: parsed.json ? summarizeResponse(parsed.json) : { textLength: parsed.text.length }
            });
          }

          const failureStatus = response.ok ? 502 : response.status;
          const failureMessage = response.ok ? "渠道返回成功但没有图片" : upstreamMessage;
          if (variantIndex < requestVariants.length - 1 && shouldTryNextImageVariant(failureStatus, failureMessage)) continue;
          if (baseIndex < imageCandidates.length - 1 && (privateChannelAuthFault || shouldTryNextChannel(failureStatus, failureMessage))) continue baseLoop;

          const publicPayload = publicImageErrorPayload({
            requestId,
            status: privateChannelAuthFault ? 504 : failureStatus,
            upstreamMessage: privateChannelAuthFault ? "private channel auth failed" : failureMessage,
            params,
            attempts
          });
          finalizeBillingInBackground(billingTask, {
            ok: false,
            status: publicPayload.status,
            error: publicPayload.error,
            message: publicPayload.message,
            usedModel: variant.model,
            timingMs: timing.totalMs,
            attempts
          });
          return res.status(publicPayload.status).json({
            ...publicPayload,
            timing
          });
        } catch (error) {
          const errorMessage = error?.name === "AbortError" ? "图片接口等待超时" : error instanceof Error ? error.message : String(error);
          const failureStatus = error?.name === "AbortError" ? 504 : 502;
          attempts.push({
            url,
            ...channelLog,
            status: failureStatus,
            ok: false,
            model: variant.model,
            requestFormat: variant.requestFormat,
            errorCode: error?.name === "AbortError" ? "channel_timeout" : "channel_error",
            message: compactLogMessage(errorMessage, 500)
          });
          await writeGenerationLog({
            time: new Date().toISOString(),
            requestId,
            ok: false,
            status: failureStatus,
            url,
            ...channelLog,
            stage: "api-images-channel-error",
            attempt: attempts.length,
            baseAttempt: baseIndex + 1,
            candidateCount: imageCandidates.length,
            requestVariant: variant.id,
            requestFormat: variant.requestFormat,
            protocol: variant.protocol,
            requestedModel: params.model,
            requestedChannelId: params.channelId,
            model: variant.model,
            imageSize: params.imageSize,
            aspectRatio: params.aspectRatio,
            ...promptLog,
            fileCount: files.length,
            uploadBytes,
            hasApiKey: Boolean(apiKey),
            hasChannelApiKey: Boolean(channelApiKey) || candidate.hasCredential,
            usesPrivateChannelKey,
            usesSignedRoute: Boolean(candidate.usesSignedRoute),
            timing: {
              totalMs: Date.now() - receivedAt,
              channelWaitMs: Date.now() - forwardedAt,
              parseMs: 0
            },
            failureReason: error?.name === "AbortError" ? "channel_timeout" : "channel_error",
            upstreamError: compactLogMessage(errorMessage, 900)
          });
          if (variantIndex < requestVariants.length - 1 && shouldTryNextImageVariant(failureStatus, errorMessage)) continue;
          if (baseIndex < imageCandidates.length - 1 && shouldTryNextChannel(failureStatus, errorMessage)) continue baseLoop;
          const publicPayload = publicImageErrorPayload({
            requestId,
            status: failureStatus,
            upstreamMessage: errorMessage,
            params,
            attempts
          });
          const catchTiming = {
            totalMs: Date.now() - receivedAt,
            channelWaitMs: Date.now() - forwardedAt,
            parseMs: 0
          };
          finalizeBillingInBackground(billingTask, {
            ok: false,
            status: publicPayload.status,
            error: publicPayload.error,
            message: publicPayload.message,
            usedModel: variant.model,
            timingMs: catchTiming.totalMs,
            attempts
          });
          return res.status(publicPayload.status).json({
            ...publicPayload,
            timing: catchTiming
          });
        } finally {
          abort.dispose();
        }
      }
    }

    const publicPayload = publicImageErrorPayload({
      requestId,
      status: 502,
      upstreamMessage: "图片接口请求失败",
      params,
      attempts
    });
    finalizeBillingInBackground(billingTask, {
      ok: false,
      status: publicPayload.status,
      error: publicPayload.error,
      message: publicPayload.message,
      usedModel: params.model,
      timingMs: Date.now() - receivedAt,
      attempts
    });
    return res.status(publicPayload.status).json({
      ...publicPayload,
      timing: {
        totalMs: Date.now() - receivedAt,
        channelWaitMs: Date.now() - receivedAt,
        parseMs: 0
      }
    });
  } catch (error) {
    const timing = {
      totalMs: Date.now() - receivedAt,
      channelWaitMs: Date.now() - lastForwardedAt,
      parseMs: 0
    };
    const requestTargets = imageRequestLogTargets(params, files, candidates);
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId,
      ok: false,
      urls: requestTargets.map((target) => target.url),
      protocols: [...new Set(requestTargets.map((target) => target.protocol))],
      upstreamModels: [...new Set(requestTargets.map((target) => target.model))],
      requestFormats: [...new Set(requestTargets.map((target) => target.requestFormat))],
      model: params.model,
      imageSize: params.imageSize,
      aspectRatio: params.aspectRatio,
      fileCount: files.length,
      uploadBytes,
      hasApiKey: Boolean(apiKey),
      timing,
      attempts,
      error: error instanceof Error ? error.message : String(error)
    });
    const publicPayload = publicImageErrorPayload({
      requestId,
      status: error?.name === "AbortError" ? 504 : 502,
      upstreamMessage: error?.name === "AbortError" ? "图片接口等待超时" : error?.message || "图片接口请求失败",
      params,
      attempts
    });
    finalizeBillingInBackground(billingTask, {
      ok: false,
      status: publicPayload.status,
      error: publicPayload.error,
      message: publicPayload.message,
      usedModel: params.model,
      timingMs: timing.totalMs,
      attempts
    });
    return res.status(publicPayload.status).json({
      ...publicPayload,
      timing
    });
  } finally {
    releaseImageSlot?.();
    await removeUploadedFiles(req.files);
  }
});

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

function startResultCacheCleanupOnce() {
  if (resultCacheCleanupStarted) return;
  resultCacheCleanupStarted = true;
  startResultCacheCleanup();
}

function configureHttpServer(server) {
  server.requestTimeout = LOCAL_HTTP_TIMEOUT_MS;
  server.headersTimeout = LOCAL_HTTP_TIMEOUT_MS + 30000;
  server.keepAliveTimeout = 65000;
  server.timeout = LOCAL_HTTP_TIMEOUT_MS;
}

function listenOnPort(port, remainingFallbacks = PORT_FALLBACK_LIMIT) {
  const server = app.listen(port, "127.0.0.1", () => {
    console.log(`Jingyin AI Canvas http://127.0.0.1:${port}`);
    startResultCacheCleanupOnce();
    openAppInBrowser(port);
  });
  configureHttpServer(server);
  server.on("error", (error) => {
    if (error?.code === "EADDRINUSE" && remainingFallbacks > 0) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is already in use, trying ${nextPort}.`);
      setTimeout(() => listenOnPort(nextPort, remainingFallbacks - 1), 100);
      return;
    }
    if (error?.code === "EADDRINUSE" && shouldAutoOpenBrowser()) {
      console.error(`Port ${port} is already in use. Opened the existing local app instead.`);
      openAppInBrowser(port);
      process.exitCode = 0;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });
  return server;
}

attachFrontend().then(() => {
  listenOnPort(PORT);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
