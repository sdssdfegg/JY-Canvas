// 出图传参自检。
//
// 从 server/index.js 原样搬来（按行区间机器切割），**没有任何逻辑改动**。
//
// 为什么单独成文件：它只负责"把一次出图请求拆成可展示的诊断结构"（变体、路由、
// 计费网关开关、脱敏字段），向上游发探测请求但不计费；跟路由、跟出图执行解耦。
//
// 依赖：
//   ../channel.js          — normalizeImageRequest / buildImageRequestVariants（变体构造/解析）
//   ../channel-config.js   — imageChannelBaseCandidates / PRIMARY_CHANNEL_API_BASE_URL /
//                            channelLogFields / upstreamModelForChannel
//   ../billing-gateway.js  — billingGatewayPolicy
//
// 🔴 逐字保留"脱敏与截断"：任何 [hidden] / [server-mapped] 字段处理都不得改；
//    本模块产物会进日志，改了就可能是"往日志多写东西"或"少写排查线索"。
// 🔴 逐字保留"探测请求形状"：变体数量、占位图构造、字段名 —— 下游
//    tt25-subdirect-wire-check 与 routing-check 是它的断言，改形状会掩盖真实回归。
//
// 关于 imageParamsForBaseUrl：它在 index.js 里还有另一个调用方
// （imageRequestVariantsForBaseUrl，未见得随本单搬走），因此**保留在 index.js 一份、
// 这里再放一份本地副本**，避免循环依赖、也避免破坏"只搬定义 + 只改 import"的两 hunk 纪律。
// 两份文本逐字节一致；日后若把 imageParamsForBaseUrl 提到共享模块，两处一起改。

import { normalizeImageRequest, buildImageRequestVariants } from "../channel.js";
import {
  buildImageChannelBaseCandidates,
  PRIMARY_CHANNEL_API_BASE_URL,
  channelLogFields,
  upstreamModelForChannel
} from "../channel-config.js";
import { billingGatewayPolicy } from "../billing-gateway.js";

// 以下两个是 index.js 里的本地薄包装（imageParamsForBaseUrl / imageChannelBaseCandidates），
// 它们在 index.js 还有别的调用方，不能随本单搬走；这里各放一份本地副本，
// 避免循环依赖、也守住"只搬定义 + 只改 import"的两 hunk 纪律。两份文本逐字节一致。
function imageParamsForBaseUrl(params, baseUrl) {
  const upstreamModel = upstreamModelForChannel(baseUrl, params.model);
  return upstreamModel === params.model ? params : { ...params, model: upstreamModel };
}

function imageChannelBaseCandidates(model) {
  return buildImageChannelBaseCandidates(model);
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

export { buildImageRequestDiagnostic };
