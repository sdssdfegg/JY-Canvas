// 图片线路候选与请求形态构造。
//
// 从 server/index.js 的顶层函数区（约 255–310 行）原样搬来，**没有任何逻辑改动**。
//
// 为什么单独成文件：这一组函数只做"把一次出图请求解析成候选线路 + 拼出 JSON 转发形态
// （TT 2.5 Subdirect）+ 拼出日志目标"，与路由、出图执行、诊断解耦。它本身不依赖
// express / app / req / res，因此可以被 server/index.js 与 server/core/image-diagnostics.js
// 共同复用，而不必在 image-diagnostics.js 里保留逐字节副本。
//
// 依赖：
//   ../channel-config.js — PRIMARY_CHANNEL_API_BASE_URL / buildChannelBaseCandidates /
//                         buildImageChannelBaseCandidates / upstreamModelForChannel
//   ../channel.js        — buildImageRequestVariants
//   ./uploads.js         — ensureFileBuffer
//   ./file-naming.js     — mimeTypeFromFile

import { upstreamModelForChannel } from "../channel-config.js";
import { activeGatewayBaseUrl } from "./gateway-target.js";
import { buildImageRequestVariants } from "../channel.js";
import { ensureFileBuffer } from "./uploads.js";
import { mimeTypeFromFile } from "./file-naming.js";

function channelBaseCandidates() {
  // 每次请求都走当前选中的网关目标（老 / 新服务器）；切换只改 gateway-target 这一处取值。
  // 不做跨服务器兜底：选择权在用户，选哪台就走哪台。
  return [activeGatewayBaseUrl()];
}

function imageChannelBaseCandidates(_model) {
  // 形参保持与调用方一致；线路取当前活动网关目标（模型映射仍由 upstreamModelForChannel 决定）。
  return [activeGatewayBaseUrl()];
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

export {
  channelBaseCandidates,
  imageChannelBaseCandidates,
  JSON_IMAGE_URLS_CHANNEL,
  prepareJsonImageUrlsForChannel,
  imageParamsForBaseUrl,
  imageRequestVariantsForBaseUrl,
  imageRequestLogTargets
};
