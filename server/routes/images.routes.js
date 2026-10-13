// 通用生图端点路由（V11-RF-213）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（44 个外部符号，由 tmp/scan-213-deps.mjs 扫描 + import-map 反查产出：
//   app                                                            ← 形参
//   extractImagesFromResponse / normalizeImageRequest /
//     validateImageCapabilities / validateImageRouting /
//     summarizeResponse                                             ← server/channel.js
//   createAbortSignal / readTextSafely                              ← server/core/http-client.js
//   archiveReferenceAssets / buildHistoryItems /
//     persistGeneratedItemsInBackground                             ← server/core/asset-persist.js
//   imagePromptLogFields / publicImageErrorCode / publicImageErrorPayload /
//     resolveApiKey / shouldTreatPrivateChannelAuthAsChannelFault /
//     shouldTryNextChannel / shouldTryNextImageVariant /
//     upstreamErrorMessage                                          ← server/core/image-error-policy.js
//   IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS / IMAGE_CONCURRENCY_LIMIT /
//     RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS                      ← server/core/runtime-config.js
//   acquireImageSlot / imageSlotWeight / imageQueueSnapshot         ← server/core/image-concurrency.js
//   localUploadParseMs                                              ← server/core/generation-trace.js
//   prepareImageBillingForRequest / finalizeBillingInBackground     ← server/core/billing-attempts.js
//   compactLogMessage                                               ← server/core/format-utils.js
//   writeGenerationLog                                              ← server/core/generation-logger.js
//   imageChannelBaseCandidates / prepareJsonImageUrlsForChannel /
//     imageRequestLogTargets                                        ← server/core/image-channel-candidates.js
//   historyItemForImmediateDisplay / hasHistoryDisplayArchive       ← server/core/history-display.js
//   imageCandidateEntries / imageChannelLogForCandidate /
//     imageApiKeyForCandidate / imageRequestVariantsForCandidate /
//     imageUrlForCandidate / imageHeadersForCandidate               ← server/core/image-route-candidates.js
//   IMAGE_UPLOAD_PARSE_CEILING / imageForwardUpload /
//     removeUploadedFiles / wrapOutfitUpload                        ← server/core/uploads.js
//
// ⇒ **没有任何符号来自 index.js 作用域**（0 条）。签名用默认 `(app)`（0.1 裁定）。
//   模块内零 multer( / 零 express.Router() / 零第二次 express() / 零 new Map()。
//
// 逐字保留（执行单 §10）：
//   - 重试/换线路策略：`shouldTryNextChannel` / `shouldTryNextImageVariant` /
//     `shouldTreatPrivateChannelAuthAsChannelFault` 的**调用点与判定顺序**；
//     `imageCandidateEntries` 的**遍历顺序**；
//   - 落盘与历史写入：`persistGeneratedItemsInBackground` **只被本端点调用**；
//     命名仍走 `writeJingyinNumberedImage` / `writeProcessedImage`；
//   - **413 / 上传上限**行为（`IMAGE_UPLOAD_PARSE_CEILING`、`largeImageUpload`）；
//     失败时 `removeUploadedFiles` **必须仍被调用**，不留临时垃圾。
//
// 🔴 不得改动 `prompts/server/detail-skills.js`、`server/detail-ai.js`、
//    `core/asset-persist.js`、`core/image-error-policy.js`（执行单 §10 禁止清单）。
//
import {
  extractImagesFromResponse,
  normalizeImageRequest,
  validateImageCapabilities,
  validateImageRouting,
  summarizeResponse,
} from "../channel.js";
import {
  createAbortSignal,
  readTextSafely,
} from "../core/http-client.js";
import {
  archiveReferenceAssets,
  buildHistoryItems,
  persistGeneratedItemsInBackground,
} from "../core/asset-persist.js";
import {
  imagePromptLogFields,
  publicImageErrorCode,
  publicImageErrorPayload,
  resolveApiKey,
  shouldTreatPrivateChannelAuthAsChannelFault,
  shouldTryNextChannel,
  shouldTryNextImageVariant,
  upstreamErrorMessage,
} from "../core/image-error-policy.js";
import {
  IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS,
  IMAGE_CONCURRENCY_LIMIT,
  RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS,
} from "../core/runtime-config.js";
import {
  acquireImageSlot,
  imageSlotWeight,
  imageQueueSnapshot,
} from "../core/image-concurrency.js";
import { localUploadParseMs } from "../core/generation-trace.js";
import {
  prepareImageBillingForRequest,
  finalizeBillingInBackground,
} from "../core/billing-attempts.js";
import { compactLogMessage } from "../core/format-utils.js";
import { writeGenerationLog } from "../core/generation-logger.js";
import {
  imageChannelBaseCandidates,
  prepareJsonImageUrlsForChannel,
  imageRequestLogTargets,
} from "../core/image-channel-candidates.js";
import {
  historyItemForImmediateDisplay,
  hasHistoryDisplayArchive,
} from "../core/history-display.js";
import {
  imageCandidateEntries,
  imageChannelLogForCandidate,
  imageApiKeyForCandidate,
  imageRequestVariantsForCandidate,
  imageUrlForCandidate,
  imageHeadersForCandidate,
} from "../core/image-route-candidates.js";
import {
  IMAGE_UPLOAD_PARSE_CEILING,
  imageForwardUpload,
  removeUploadedFiles,
  wrapOutfitUpload,
} from "../core/uploads.js";

export function registerImagesRoutes(app) {
  app.post("/api/images", wrapOutfitUpload(imageForwardUpload.array("image", IMAGE_UPLOAD_PARSE_CEILING)), async (req, res) => {
    const receivedAt = Date.now();
    const files = req.files || [];
    // V52：交互单图——客户端断开（关页面/取消）后没有理由继续打上游。
    // 批量链路（/api/generate-outfit）要跑完出结果，故意不加此监听。
    let clientGone = false;
    let attemptClientAbort = null; // 每个 attempt 重建的 AbortController，监听器据此 abort 掉「当前」attempt
    // 断开判定必须用「底层 socket 关闭」而非 req 流关闭：req 流的 'close' 在请求体收完即触发
    // （与客户端是否还在无关），会误判成"已断开"；只有在 res.writableEnded 仍 false 时 socket 关闭，
    // 才是真正的客户端断开（关页面/取消）。req.on('aborted') 覆盖"上传中途断开"场景。
    const onClientGone = () => {
      if (res.writableEnded) return; // 响应已正常 flush，socket 关闭是正常尾流，不误伤
      clientGone = true;
      attemptClientAbort?.abort(); // 排队阶段 attemptClientAbort 仍为 null，可选调用；attempt 中则中断当前上游 fetch
    };
    req.on("aborted", onClientGone);
    req.socket?.on("close", onClientGone);
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
      localUploadParseMs: localUploadParseMs(requestId, receivedAt),
      hasApiKey: Boolean(apiKey),
      deferAutoSave,
      imageConcurrency: {
        limit: IMAGE_CONCURRENCY_LIMIT,
        ...imageQueueSnapshot()
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
          ...imageQueueSnapshot()
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
          // V52：把「当前 attempt」的手动 abort 暴露给 onClientGone（createAbortSignal 只管超时，不暴露 abort）。
          // 提前到首个 await 前赋值，确保断开发生在 createBody / writeGenerationLog 等待期间也能让后续 fetch 立即中止。
          attemptClientAbort = new AbortController();
          const abort = createAbortSignal(IMAGE_CHANNEL_ATTEMPT_TIMEOUT_MS);
          const attemptSignal = (typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function")
            ? AbortSignal.any([abort.signal, attemptClientAbort.signal])
            : abort.signal;
          const url = imageUrlForCandidate(candidate, variant, files.length > 0);
          const body = await variant.createBody();
          const headers = imageHeadersForCandidate(candidate, channelApiKey, variant.headers);

          const forwardedAt = Date.now();
          lastForwardedAt = forwardedAt;
          try {
            // V52：进入候选后客户端已断开，立即中止本次 attempt，不再发起/等待上游。
            if (clientGone) break baseLoop;
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
              signal: attemptSignal
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

              // V52：响应回写前客户端已断开，跳过 res.json（连接已不存在，回写只会写向已关闭 socket）。
              // 上方 finalize(ok:true) 已执行——图已生成，正常记账；落盘/缓存也已在上文完成。
              if (clientGone) return;

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
            if (clientGone) break baseLoop; // V52：客户端已断开，不再重试后续候选渠道/变体
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
            if (clientGone) break baseLoop; // V52：客户端已断开，不再重试后续候选渠道/变体
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
            attemptClientAbort?.abort();
            abort.dispose();
          }
        }
      }

      if (clientGone) {
        // 客户端已断开：上游 attempt 已 abort，不再重试，也无需回写响应（连接已不存在，回写只会写向已关闭 socket）。
        // 仍 finalize 计费为「失败尝试」（ok:false → 计费网关不扣成功额度），避免任务悬挂。
        finalizeBillingInBackground(billingTask, {
          ok: false,
          status: 499,
          error: "client_disconnected",
          message: "客户端已断开，已中断上游请求",
          usedModel: params.model,
          timingMs: Date.now() - receivedAt,
          attempts
        });
        return;
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
      // V52：客户端已断开或响应已结束，不再回写（连接已不存在）。
      if (clientGone || res.writableEnded) return;
      return res.status(publicPayload.status).json({
        ...publicPayload,
        timing
      });
    } finally {
      req.off("aborted", onClientGone);
      req.socket?.off("close", onClientGone);
      releaseImageSlot?.();
      await removeUploadedFiles(req.files);
    }
  });
}
