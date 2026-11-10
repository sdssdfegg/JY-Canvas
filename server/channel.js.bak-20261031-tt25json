import { openAsBlob } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  CHANNEL_IMAGE_SIZES,
  CHANNEL_MODELS,
  FORBIDDEN_CHANNEL_IDS,
  isForbiddenChannelId,
  routingChannelForModel,
  routingChannelById,
  routingModelCapabilities,
  routingModelFor,
  validateModelCapabilities
} from "./channel-config.js";

export { CHANNEL_MODELS, normalizeBaseUrl } from "./channel-config.js";

const OPENAI_GPT_IMAGE_MODEL = "gpt-image-1";
const ENABLE_OPENAI_GPT_IMAGE_VARIANT = /^(1|true|on|yes)$/i.test(String(process.env.JINGYIN_ENABLE_OPENAI_IMAGE_VARIANT || ""));
const ENABLE_IMAGE_COMPAT_VARIANTS = /^(1|true|on|yes)$/i.test(String(process.env.JINGYIN_ENABLE_IMAGE_COMPAT_VARIANTS || ""));

// 旧存档模型 ID -> 3.0 routing catalog 的 canonical ID。
// 旧存档可以读，但新请求不允许继续把旧 ID 发出去。
export const LEGACY_MODEL_ALIASES = Object.freeze({
  "nano-banana2": "banana-2",
  "nano-banana-2": "banana-2",
  "nano-banana": "banana-2",
  "banana2": "banana-2",
  "banana-2": "banana-2",
  "nano-banana-pro": "nano-banana-pro",
  "banana-pro": "nano-banana-pro",
  "gpt-image": "tt-image-2",
  "gpt-image-2": "tt-image-2",
  "tt-image-2": "tt-image-2",
  "tt-image-2.5": "tt-image-2.5",
  "tt-image-2-5": "tt-image-2.5"
});

export function canonicalChannelModel(value) {
  const key = String(value || "").trim().toLowerCase();
  return LEGACY_MODEL_ALIASES[key] || "";
}

// 中文注释：提高 GPT 图片模型默认质量，优先缓解批量换装、快捷生成和批量姿态里人物头脸发糊。
const OPENAI_IMAGE_QUALITY_BY_SIZE = {
  "1K": "medium",
  "2K": "high",
  "4K": "high"
};
const LONG_EDGE_BY_IMAGE_SIZE = {
  "1K": 1024,
  "2K": 2304,
  "4K": 4096
};

export function channelImagePath(hasImages) {
  return hasImages ? "/images/edits" : "/images/generations";
}

function ratioParts(aspectRatio) {
  const [w, h] = String(aspectRatio || "")
    .split(":")
    .map((value) => Number.parseFloat(value));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { w: 1, h: 1 };
  }
  return { w, h };
}

function exactImageSize(aspectRatio, imageSize) {
  const edge = LONG_EDGE_BY_IMAGE_SIZE[imageSize] || LONG_EDGE_BY_IMAGE_SIZE["2K"];
  const { w, h } = ratioParts(aspectRatio);
  if (Math.abs(w - h) < 0.01) return { width: edge, height: edge };
  if (w > h) return { width: edge, height: Math.max(1, Math.round(edge * h / w)) };
  return { width: Math.max(1, Math.round(edge * w / h)), height: edge };
}

function exactImageSizeText(aspectRatio, imageSize) {
  const { width, height } = exactImageSize(aspectRatio, imageSize);
  return `${width}x${height}`;
}

// 火山方舟 Seedream 5.0 flash 的 size 面积上限（实测：doubao-seedream-5-0-flash-260915）。
// 超限会直接 400： "image area must be at most 4624220 pixels"。
// 注意：官方网页写的 4096x4096 上限是其它模型的，flash 这条线实际是 462 万。
// 同等长边下正方形面积最大，所以 2K 长边(2304) 的 1:1 = 2304x2304 = 5308416 必然超限，
// 其它比例都不超（见实测扫描）。
const VOLC_MAX_IMAGE_AREA = 4624220;

// 火山专用尺寸串：在通用像素尺寸基础上按面积上限等比缩放，保证任何比例/档位都不被上游拒绝。
function volcSizeText(aspectRatio, imageSize) {
  let { width, height } = exactImageSize(aspectRatio, imageSize);
  const area = width * height;
  if (area > VOLC_MAX_IMAGE_AREA) {
    const scale = Math.sqrt(VOLC_MAX_IMAGE_AREA / area);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }
  return `${width}x${height}`;
}

function isBananaModel(model) {
  // canonical ID 是 banana-2 / nano-banana-pro；旧存档 nano-banana2 / nano-banana 也归到同一族。
  return /^(banana|nano-banana)/i.test(String(model || ""));
}

// TokenGo 的 doubao-seedream 系列：上游原生要的是 `size`(宽高比串，如 "5:4") + `resolution`("2k"/"4k")，
// 而不是像素尺寸串。本地若按其它模型那样发像素串（如 "2304x1843"），new-api 反推比例对不规整比例
// 会失败（2:1 直接 503、9:21 静默 fallback 成 1:1）。故 seedream 单独走原生字段。
function isSeedreamModel(model) {
  return /^doubao-seedream/i.test(String(model || ""));
}

async function appendUploadFile(form, fieldName, file, fallbackName = "reference.png") {
  if (!file?.buffer && !file?.path) return;
  const type = file.mimetype || "application/octet-stream";
  const blob = file.path
    ? await openAsBlob(file.path, { type })
    : new Blob([file.buffer], { type });
  form.append(fieldName, blob, basename(file.originalname || fallbackName));
}

export function normalizeImageRequest(input) {
  const requestedModel = String(input.model || "").trim();
  // 旧存档（nano-banana2 / gpt-image …）只在这里做一次别名归一化，
  // 之后全链路只出现 3.0 routing catalog 的 canonical ID。
  const canonicalModel = canonicalChannelModel(requestedModel);
  const model = routingModelFor(canonicalModel)
    ? canonicalModel
    : (routingModelFor(requestedModel) ? requestedModel : "tt-image-2");
  const modelConfig = CHANNEL_MODELS.find((item) => item.value === model);
  // 线路级尺寸覆盖（如火山引擎 HS 仅支持 1K/2K，SD 模型虽声明 2K/4K，但该线路必须限制）。
  const channel = routingChannelForModel(model, input.channelId);
  const lineSizes = Array.isArray(channel?.sizes) && channel.sizes.length ? channel.sizes : null;
  const modelSizes = lineSizes
    || (Array.isArray(modelConfig.sizes) && modelConfig.sizes.length ? modelConfig.sizes : CHANNEL_IMAGE_SIZES);
  const wantedSize = String(input.imageSize || "").toUpperCase();
  const sizeRank = { "1K": 1, "2K": 2, "4K": 3, "8K": 4 };
  const rankOf = (s) => Number.isFinite(sizeRank[s]) ? sizeRank[s] : 0;
  // 选中的尺寸若不在该线路/模型支持列表内，回退到「不大于原尺寸的最大支持尺寸」（如火山 HS 选 4K → 2K），
  // 而非盲目取第一个，避免用户选大尺寸却被悄悄降级到最小档。
  const imageSize = modelSizes.includes(wantedSize)
    ? wantedSize
    : (modelSizes.filter((s) => rankOf(s) <= rankOf(wantedSize)).sort((a, b) => rankOf(b) - rankOf(a))[0] || modelSizes[0]);
  const aspectRatio = modelConfig.ratios.includes(input.aspectRatio) ? input.aspectRatio : modelConfig.ratios[0];
  const qualityList = Array.isArray(modelConfig.quality) ? modelConfig.quality : [];
  const requestedQuality = String(input.quality || "").trim().toLowerCase();
  const backgroundList = Array.isArray(modelConfig.backgrounds) ? modelConfig.backgrounds : [];
  const requestedBackground = String(input.background || input.backgroundMode || "").trim().toLowerCase();
  const versionList = Array.isArray(modelConfig.versions) ? modelConfig.versions : [];
  const requestedVersion = String(input.version || input.modelVersion || "").trim().toLowerCase();
  // 与 3.0 对齐：只有声明了扩展参数的模型（当前目录里是 tt-image-2.5）才会带上
  // version / quality / background 的默认值（flare / auto / opaque，
  // 见 3.0 static/ecommerce/channel-selector.js 的 TT25_DEFAULTS 与
  // main.py tt25_upstream_fields）。其它模型只在客户端显式传入且该模型允许时才带 quality。
  const extendedParamModel = backgroundList.length > 0 || versionList.length > 0;
  const quality = qualityList.includes(requestedQuality)
    ? requestedQuality
    : (extendedParamModel && qualityList.includes("auto") ? "auto" : "");
  const background = backgroundList.includes(requestedBackground)
    ? requestedBackground
    : (backgroundList.includes("opaque") ? "opaque" : "");
  const version = versionList.includes(requestedVersion)
    ? requestedVersion
    : (versionList.includes("flare") ? "flare" : "");
  const n = Math.max(1, Math.min(12, Number.parseInt(input.n, 10) || 1));
  const source = ["quickgen", "detail-main", "reference-remix", "infinite-canvas", "outfit"].includes(input.source)
    ? input.source
    : "";
  const workflowMode = String(input.workflowMode || "").trim();
  const maxPromptLength = Number(modelConfig.maxPromptLength || 20000);
  const rawPrompt = String(input.prompt || "").trim();
  // 提示词上限来自 routing catalog 的 capabilities；超限直接按目录上限截断，
  // 保证发给中转站的请求永远不超出当前模型能力。
  const prompt = rawPrompt.length > maxPromptLength ? rawPrompt.slice(0, maxPromptLength) : rawPrompt;
  // 2026-09-25：香蕉 Pro 的参考图改用 3.0 已验证的 JSON + image_urls 通道，
  // 客户端会把压缩到 1536 长边的 JPEG data URL 放进 referenceDataUrl 字段。
  const referenceDataUrls = (Array.isArray(input.referenceDataUrls)
    ? input.referenceDataUrls
    : Array.isArray(input.referenceDataUrl)
      ? input.referenceDataUrl
      : input.referenceDataUrl
        ? [input.referenceDataUrl]
        : [])
    .map((value) => String(value || "").trim())
    .filter((value) => /^data:image\//i.test(value))
    .slice(0, 12);

  return {
    model,
    prompt,
    promptTruncated: rawPrompt.length > maxPromptLength,
    imageSize,
    aspectRatio,
    quality,
    background,
    version,
    n,
    source,
    workflowMode,
    dispatchMode: "manual",
    manualModel: model,
    channelId: String(input.channelId || input.channel_id || "").trim(),
    referenceDataUrls,
    maxInputImages: Number(modelConfig.maxInputImages || 1),
    maxImageBytes: Number(modelConfig.maxImageBytes || 0),
    maxPromptLength
  };
}

// 服务端最终校验：模型 + 渠道 + 能力上限，任何一条不过都直接拒绝，不依赖前端。
export function validateImageRouting(params) {
  const requestedModel = String(params?.model || "").trim();
  const model = routingModelFor(requestedModel);
  if (!model) {
    return {
      ok: false,
      code: "unknown_model",
      message: `当前模型未接入 3.0 渠道目录：${requestedModel || "(空)"}`
    };
  }
  const channelId = String(params?.channelId || "").trim();
  // 旧线路：即使前端被绕过，服务端也直接拒绝。
  if (isForbiddenChannelId(channelId)) {
    return {
      ok: false,
      code: "forbidden_channel",
      message: `旧线路已下线，请重新选择当前模型的可用线路（${FORBIDDEN_CHANNEL_IDS.join(" / ")} 不再可用）`
    };
  }
  if (!channelId) {
    return { ok: false, code: "missing_channel", message: "请选择当前模型的可用渠道" };
  }
  const channel = routingChannelForModel(model.value, channelId);
  if (!channel) {
    return {
      ok: false,
      code: "channel_model_mismatch",
      message: "所选渠道不支持当前模型"
    };
  }
  if (String(params?.dispatchMode || "manual").trim().toLowerCase() !== "manual") {
    return { ok: false, code: "invalid_dispatch_mode", message: "只支持手动选择线路（dispatchMode=manual）" };
  }
  return { ok: true, channel };
}

export function validateImageCapabilities(params, files = []) {
  const capability = validateModelCapabilities(params?.model, {
    imageSize: params?.imageSize,
    aspectRatio: params?.aspectRatio,
    quality: params?.quality,
    background: params?.background,
    version: params?.version,
    prompt: params?.prompt,
    imageCount: Array.isArray(files) ? files.length : 0,
    files
  });
  return capability;
}

export function modelCapabilitySummary(model) {
  const capabilities = routingModelCapabilities(model);
  if (!capabilities) return null;
  return {
    modelId: capabilities.modelId,
    maxInputImages: capabilities.maxInputImages,
    maxPromptLength: capabilities.maxPromptLength,
    maxImageBytes: capabilities.maxImageBytes,
    supportedSizes: capabilities.supportedSizes,
    supportedAspectRatios: capabilities.supportedAspectRatios,
    supportedQuality: capabilities.supportedQuality,
    supportedBackgroundModes: capabilities.supportedBackgroundModes
  };
}

// 只有当前模型 capabilities 允许的 quality / background / version 才会写进上游请求体，
// 避免把上游不认识的参数发过去。
function appendCapabilityFields(target, params) {
  if (params.quality) target.quality = params.quality;
  if (params.background) target.background = params.background;
  if (params.version) target.version = params.version;
  return target;
}

/**
 * 把"静音中转站按线路路由"必须的字段写进上游请求体。
 *
 * 2026-09-25 修复（证据见 API 问题记录与本轮日志）：
 *   3.0 的 `main.py:13404-13423 add_lk888_route_fields()` 对**所有**模型都会附带
 *     `dispatchMode` / `channelId` / `manualModel`（TT 2.5 另走 tt25_upstream_fields），
 *     并且同时用于 JSON 体（`json=add_lk888_route_fields({...})` @13447）和
 *     multipart 表单（`data=add_lk888_route_fields({...})` @13483）。
 *     `main.py:2367` 的注释写明了原因：
 *       「中转站的按线路计费只能靠请求体里的 channelId 识别线路，所以线路必须显式发出去」。
 *
 *   V11 原来一个都没发。后果在 logs/generation.jsonl 里有实测：
 *     - banana-2 / tt-image-2（目录里 price_first + manual 双模式）→ 上游自己兜底，200；
 *     - nano-banana-pro（目录里 routes 只有 manual、defaultRoute=manual）→ 上游 400
 *       `manual_channel_required`，2.2~4.5 秒就失败（4 次点击全部如此）。
 *
 * 刻意**不发** `cropAspectRatio`：3.0 用它表示"局部裁剪框的比例"，而 V11 的局部选框
 * 本轮已改成自由矩形（见交付报告），把生成比例塞进 cropAspectRatio 会让上游按比例
 * 重新裁切我们刚裁好的局部图。`outputAspectRatio` / `outputSize` 只是把我们本来就在发的
 * `aspect_ratio` / `image_size` 再声明一次，不引入新的几何语义，所以照 3.0 一起发。
 */
function appendRoutingFields(target, params) {
  if (params.dispatchMode) target.dispatchMode = params.dispatchMode;
  if (params.channelId) target.channelId = params.channelId;
  if (params.manualModel) target.manualModel = params.manualModel;
  if (params.aspectRatio) target.outputAspectRatio = params.aspectRatio;
  if (params.imageSize) target.outputSize = params.imageSize;
  return target;
}

export function buildTextImageBody(params, format = "legacy") {
  const body = {
    model: params.model,
    prompt: params.prompt,
    n: params.n
  };
  appendRoutingFields(body, params);
  appendCapabilityFields(body, params);
  if (format === "seedream") {
    // 上游原生：size=宽高比串、resolution=清晰度(小写)。与 TokenGo 文档 param_schema 对齐。
    body.size = params.aspectRatio;
    body.resolution = String(params.imageSize || "").toLowerCase();
    return body;
  }
  if (format === "size") {
    body.size = exactImageSizeText(params.aspectRatio, params.imageSize);
    return body;
  }
  if (format === "pixel-image-size") {
    body.image_size = exactImageSizeText(params.aspectRatio, params.imageSize);
    body.aspect_ratio = params.aspectRatio;
    return body;
  }
  if (format === "volc") {
    // 火山方舟原生格式：size=像素串(WIDTHxHEIGHT) + response_format=url + watermark=true。
    body.size = exactImageSizeText(params.aspectRatio, params.imageSize);
    body.response_format = "url";
    body.watermark = true;
    return body;
  }
  body.image_size = params.imageSize;
  body.aspect_ratio = params.aspectRatio;
  return body;
}

export async function buildEditImageForm(params, files, format = "legacy") {
  const form = new FormData();
  form.set("model", params.model);
  form.set("prompt", params.prompt);
  form.set("n", String(params.n));
  if (format === "seedream") {
    form.set("size", params.aspectRatio);
    form.set("resolution", String(params.imageSize || "").toLowerCase());
  } else if (format === "size") {
    form.set("size", exactImageSizeText(params.aspectRatio, params.imageSize));
  } else if (format === "pixel-image-size") {
    form.set("image_size", exactImageSizeText(params.aspectRatio, params.imageSize));
    form.set("aspect_ratio", params.aspectRatio);
  } else if (format === "volc") {
    // 火山方舟原生格式（multipart）：size=像素串 + response_format=url + watermark=true。
    form.set("size", exactImageSizeText(params.aspectRatio, params.imageSize));
    form.set("response_format", "url");
    form.set("watermark", "true");
  } else {
    form.set("image_size", params.imageSize);
    form.set("aspect_ratio", params.aspectRatio);
  }
  if (params.quality) form.set("quality", params.quality);
  if (params.background) form.set("background", params.background);
  if (params.version) form.set("version", params.version);
  // 线路路由字段：multipart 表单也要带，否则手动线路（香蕉 Pro）在上游认不出来。
  if (params.dispatchMode) form.set("dispatchMode", params.dispatchMode);
  if (params.channelId) form.set("channelId", params.channelId);
  if (params.manualModel) form.set("manualModel", params.manualModel);
  if (params.aspectRatio) form.set("outputAspectRatio", params.aspectRatio);
  if (params.imageSize) form.set("outputSize", params.imageSize);
  for (const file of files) {
    await appendUploadFile(form, "image", file, "reference.png");
  }
  await appendUploadFile(form, "mask", params.maskFile, "mask.png");

  return form;
}

// 火山方舟(volc) 图生图 / 换装编辑：Seedream 不兼容 OpenAI `/images/edits`（实测 404），
// 必须走 /images/generations。官方文档（ark.volcengine.com 图片生成 API）：
//   参考图字段是 **image**（string | string[]），支持 URL 或 Base64，
//   且 Base64 **必须带前缀** `data:image/<格式>;base64,<编码>`（格式小写）。
// ⚠️ 曾经误用 reference_images（裸 base64）+ image_mode + reference_strength ——
//   那套是「豆包 LAS 算子」的参数，方舟不认，会被静默忽略：
//   实测上传人物图 + "只换背景" → 输出是另一个完全不同的人（参考图未被使用）。

// 图片链路用 imageForwardUpload = multer.diskStorage，上传件落在磁盘：file.buffer 缺省，
// 只有 file.path。所以取字节必须异步按需读盘（与 core/uploads.js 的 ensureFileBuffer 同思路，
// 此处不 import 它以保持 channel.js 的零依赖叶子纪律）。
async function fileBufferOf(file) {
  if (!file) return null;
  if (Buffer.isBuffer(file.buffer) && file.buffer.length > 0) return file.buffer;
  if (file.path) {
    try {
      const buf = await readFile(file.path);
      return Buffer.isBuffer(buf) && buf.length > 0 ? buf : null;
    } catch {
      return null;
    }
  }
  return null;
}

// 解析火山参考图（data URL 数组）：优先用前端下发的 referenceDataUrls，
// 否则把上传件（可能落盘）逐张读成 data URL。必须在 createBody 阶段异步调用。
async function resolveVolcReferenceDataUrls(params, files) {
  const provided = Array.isArray(params?.referenceDataUrls)
    ? params.referenceDataUrls.filter((url) => typeof url === "string" && url)
    : [];
  if (provided.length > 0) return provided;
  const refs = [];
  for (const file of Array.isArray(files) ? files : []) {
    const buf = await fileBufferOf(file);
    if (!buf) continue;
    const mimeType = String(file?.mimetype || "image/png");
    refs.push(`data:${mimeType};base64,${buf.toString("base64")}`);
  }
  return refs;
}

function buildVolcEditBody(params, channel) {
  const model = channel?.upstreamModel || params.model;
  // 官方要求：image 元素是 URL 或「带 data:image/<格式>;base64, 前缀」的完整 data URL。
  const images = [];
  for (const url of Array.isArray(params.referenceDataUrls) ? params.referenceDataUrls : []) {
    if (typeof url === "string" && url) images.push(url);
  }
  // 蒙版（局部重绘）追加为一张参考图（image 支持多张，flash 最多 10 张）。
  // maskBuffer 由调用方异步读盘后传入（落盘存储时 maskFile.buffer 缺省）。
  const maskBuf = Buffer.isBuffer(params.maskBuffer) && params.maskBuffer.length
    ? params.maskBuffer
    : (Buffer.isBuffer(params.maskFile?.buffer) ? params.maskFile.buffer : null);
  if (maskBuf && maskBuf.length) {
    images.push(`data:image/png;base64,${maskBuf.toString("base64")}`);
  }
  const body = {
    model,
    prompt: params.prompt,
    n: params.n,
    // 火山方舟原生格式：尺寸必须走 size="WIDTHxHEIGHT" 像素串（与文生图 volc 分支一致）。
    // 实测：传 width/height 会被上游忽略，输出退化成上游自选的 3:4（用户报"选 2:3 出 3:4"）；
    // 改 size 后精确命中（1536x2304→严格 2:3，1776x2368→严格 3:4）。
    // 用 volcSizeText（带面积上限钳制），避免 1:1 等比例因面积超限被上游 400 拒绝。
    size: volcSizeText(params.aspectRatio, params.imageSize),
    response_format: "url",
    watermark: true
  };
  // 官方字段名是 image（string | string[]），不是 reference_images。
  if (images.length === 1) body.image = images[0];
  else if (images.length > 1) body.image = images;
  const neg = String(params.negativePrompt || "").trim();
  body.negative_prompt = neg || "畸形，扭曲，水印，低质量";
  if (params.dispatchMode) body.dispatchMode = params.dispatchMode;
  if (params.channelId) body.channelId = params.channelId;
  body.manualModel = model;
  return body;
}

function imageOrientation(aspectRatio) {
  const { w, h } = ratioParts(aspectRatio);
  if (Math.abs(w - h) < 0.01) return "square";
  return w > h ? "landscape" : "portrait";
}

function openAiImageSize(aspectRatio) {
  const orientation = imageOrientation(aspectRatio);
  if (orientation === "portrait") return "1024x1536";
  if (orientation === "landscape") return "1536x1024";
  return "1024x1024";
}

function buildOpenAiTextImageBody(params) {
  const body = {
    model: OPENAI_GPT_IMAGE_MODEL,
    prompt: params.prompt,
    size: openAiImageSize(params.aspectRatio),
    quality: OPENAI_IMAGE_QUALITY_BY_SIZE[params.imageSize] || "medium",
    n: params.n
  };
  return body;
}

async function buildOpenAiEditImageForm(params, files) {
  const form = new FormData();
  form.set("model", OPENAI_GPT_IMAGE_MODEL);
  form.set("prompt", params.prompt);
  form.set("size", openAiImageSize(params.aspectRatio));
  form.set("quality", OPENAI_IMAGE_QUALITY_BY_SIZE[params.imageSize] || "medium");
  form.set("n", String(params.n));
  for (const file of files) {
    await appendUploadFile(form, "image", file, "reference.png");
  }
  await appendUploadFile(form, "mask", params.maskFile, "mask.png");

  return form;
}

export function buildImageRequestVariants(params, files) {
  const hasImages = files.length > 0;
  const variants = [];
  // 换装 / 图片编辑链路会先把 model 换成上游模型名（doubao-seedream-5-0-flash-260915），
  // ROUTING_CHANNELS 里登记的是 UI 模型名，按 model 过滤会落空导致 provider 丢失、
  // volc 专用分支不触发（→ /images/edits 404）。故按 channelId 兜底回查渠道。
  const channel = routingChannelForModel(params.model, params.channelId)
    || routingChannelById(params.channelId);
  const provider = channel?.provider;

  // ---------------------------------------------------------------------
  // 2026-09-25 香蕉 Pro 参考图通道修复
  //
  // 现象（logs/generation.jsonl，用户真实请求）：
  //   选 silent-pro-line-10，2 张参考图（无蒙版）→ V11 走 multipart
  //   POST https://api.jingyin.online/v1/images/edits → 等 302 秒后
  //   连接被上游丢掉（upstreamError: "fetch failed"），渠道侧完全没有收到生图。
  //
  // 3.0 的做法（main.py:13428-13454）：**带参考图但无蒙版**的请求走
  //   `gen_url` = /v1/images/generations，并且用 JSON 体里的 `image_urls`
  //   （data URL）传参考图，而不是 multipart 文件。原文注释写明：
  //     「中转站的计费表达式只解析 JSON 请求体。multipart/form-data 里的
  //       channelId / version 一律读不到……已受控实测：同一条线路，JSON 提交
  //       扣 0.1200，multipart 提交扣 0.0978。故带参考图（无蒙版）的请求改走
  //       JSON + image_urls —— 实测参考图被正常使用且线路价生效。」
  //
  // 所以这里对 nano-banana-pro 采用同一条已验证通道；其它模型（banana-2 / tt-image-2
  // 等）在 multipart 下本来就能被上游兜底路由，保持原样不动。
  // 只发 1 个 variant，不产生隐藏重试。
  // ---------------------------------------------------------------------
  const referenceDataUrls = Array.isArray(params.referenceDataUrls) ? params.referenceDataUrls : [];
  if (params.model === "nano-banana-pro" && hasImages && !params.maskFile && referenceDataUrls.length > 0) {
    variants.push({
      id: "jingyin-json-image-urls",
      model: params.model,
      requestFormat: "jingyin-generations-json-image-urls",
      path: "/images/generations",
      protocol: "json",
      headers: { "Content-Type": "application/json" },
      createBody: () => JSON.stringify({
        ...buildTextImageBody(params, "legacy"),
        image_urls: referenceDataUrls
      })
    });
    return variants;
  }

  // New API's billing expression cannot read channelId from multipart fields.
  // Keep this narrow: only TT 2.5 on Subdirect uses the JSON image_urls path;
  // every other TT 2.5 line retains the existing multipart request.
  if (
    params.model === "tt-image-2.5"
    && params.channelId === "silent-tt25-line-07"
    && hasImages
    && referenceDataUrls.length > 0
  ) {
    variants.push({
      id: "jingyin-tt25-subdirect-json-image-urls",
      model: params.model,
      requestFormat: "jingyin-generations-json-image-urls",
      path: "/images/generations",
      protocol: "json",
      headers: { "Content-Type": "application/json" },
      createBody: () => JSON.stringify({
        ...buildTextImageBody(params, "legacy"),
        image_urls: referenceDataUrls
      })
    });
    return variants;
  }

  // 火山引擎(volc) 图生图 / 换装编辑：Seedream 不兼容 OpenAI `/images/edits`（实测 404），
  // 改用 /images/generations + image（官方字段，元素为带 data: 前缀的 data URL，见 buildVolcEditBody）。
  // 触发条件：被编辑原图要么来自上传文件(files)，要么来自前端下发的 referenceDataUrls(data URL)——
  // 两种来源都算"有图要编辑"，避免某一来源缺失时回落到 404 的 /images/edits 分支。
  // 参考图优先取前端下发的 referenceDataUrls（data URL），缺失时回退用上传文件的内存 buffer 现转。
  const hasVolcRefs = provider === "volc" && (
    hasImages
    || (Array.isArray(params.referenceDataUrls) && params.referenceDataUrls.length > 0)
  );
  // 不再要求同步拿到参考图：上传件可能落盘（diskStorage，无 buffer），
  // 参考图改在 createBody（await 的异步阶段）读盘解析；只要确认是 volc 且有图要编辑就走本分支，
  // 否则会因 refs 为空而回落 /images/edits（火山无此端点 → 404 → 前端 502）。
  if (hasVolcRefs) {
    variants.push({
      id: "volc-edit-reference",
      model: channel?.upstreamModel || params.model,
      requestFormat: "volc-generations-reference",
      path: "/images/generations",
      protocol: "json",
      headers: { "Content-Type": "application/json" },
      createBody: async () => JSON.stringify(buildVolcEditBody({
        ...params,
        referenceDataUrls: await resolveVolcReferenceDataUrls(params, files),
        maskBuffer: await fileBufferOf(params.maskFile)
      }, channel))
    });
    return variants;
  }

  const addJingyinVariant = (variantParams, suffix, requestFormatSuffix, format) => {
    variants.push({
      id: `jingyin-channel${suffix}`,
      model: variantParams.model,
      requestFormat: `jingyin-image-size-aspect-ratio${requestFormatSuffix}`,
      path: channelImagePath(hasImages),
      protocol: hasImages ? "multipart" : "json",
      headers: hasImages ? {} : { "Content-Type": "application/json" },
      createBody: () => hasImages ? buildEditImageForm(variantParams, files, format) : JSON.stringify(buildTextImageBody(variantParams, format))
    });
  };
  const addOpenAiVariant = (variantParams, suffix = "", requestFormatSuffix = "") => {
    variants.push({
      id: `openai-gpt-image-1${suffix}`,
      model: OPENAI_GPT_IMAGE_MODEL,
      requestFormat: `openai-size-quality${requestFormatSuffix}`,
      path: channelImagePath(hasImages),
      protocol: hasImages ? "multipart" : "json",
      headers: hasImages ? {} : { "Content-Type": "application/json" },
      createBody: () => hasImages ? buildOpenAiEditImageForm(variantParams, files) : JSON.stringify(buildOpenAiTextImageBody(variantParams))
    });
  };

  // 优先按线路 provider 选格式：火山引擎(volc)走原生像素串格式，与 TokenGo 的 seedream 分支区分。
  const orderedFormats = provider === "volc"
    ? [{ suffix: "", requestFormatSuffix: "-volc", format: "volc" }]
    : isSeedreamModel(params.model)
      ? [{ suffix: "", requestFormatSuffix: "-seedream", format: "seedream" }]
      : isBananaModel(params.model)
        ? [
            { suffix: "", requestFormatSuffix: "", format: "legacy" },
            { suffix: "-pixel", requestFormatSuffix: "-pixel", format: "pixel-image-size" },
            { suffix: "-size", requestFormatSuffix: "-size", format: "size" }
          ]
        : [
            { suffix: "-size", requestFormatSuffix: "-size", format: "size" },
            { suffix: "-pixel", requestFormatSuffix: "-pixel", format: "pixel-image-size" },
            { suffix: "", requestFormatSuffix: "", format: "legacy" }
          ];

  const forceCompatFormats = isBananaModel(params.model) && params.workflowMode === "random-background";
  const activeFormats = ENABLE_IMAGE_COMPAT_VARIANTS || forceCompatFormats ? orderedFormats : orderedFormats.slice(0, 1);
  for (const item of activeFormats) {
    // volc 线路的实际上游模型名(flash 版)与 UI 模型名不同，需覆盖 body.model / manualModel 为上游真实模型，
    // 中转站才能按 model 选中 154 new-api 渠道 30。
    const variantParams = item.format === "volc" && channel?.upstreamModel
      ? { ...params, model: channel.upstreamModel, manualModel: channel.upstreamModel }
      : params;
    addJingyinVariant(variantParams, item.suffix, item.requestFormatSuffix, item.format);
  }

  if (params.model === "tt-image-2" && ENABLE_OPENAI_GPT_IMAGE_VARIANT) {
    addOpenAiVariant(params);
  }

  return variants;
}

export function extractImagesFromResponse(payload) {
  const images = [];
  const pushImage = (item) => {
    if (!item || typeof item !== "object") return;
    if (typeof item.url === "string" && item.url.trim()) {
      // 老夜等 OpenAI 兼容渠道可能把 base64 图以 data: URI 形式回在 url 字段，
      // 标成 type:"url" 会被当成远程地址去代理 → 保存时抛 unsupported_protocol。
      // 这里把 data: URI 归一为 b64_json，与 images[] 字符串分支保持一致。
      if (/^data:image\//i.test(item.url.trim())) {
        images.push({ type: "b64_json", value: item.url.trim() });
      } else {
        images.push({ type: "url", value: item.url.trim() });
      }
      return;
    }
    if (typeof item.b64_json === "string" && item.b64_json.trim()) {
      images.push({ type: "b64_json", value: item.b64_json.trim() });
      return;
    }
    if (typeof item.image_url === "string" && item.image_url.trim()) {
      if (/^data:image\//i.test(item.image_url.trim())) {
        images.push({ type: "b64_json", value: item.image_url.trim() });
      } else {
        images.push({ type: "url", value: item.image_url.trim() });
      }
    }
  };

  if (Array.isArray(payload?.data)) {
    payload.data.forEach(pushImage);
  }
  if (Array.isArray(payload?.images)) {
    payload.images.forEach((value) => {
      if (typeof value === "string") images.push({ type: value.startsWith("http") ? "url" : "b64_json", value });
      else pushImage(value);
    });
  }
  pushImage(payload);

  return images;
}

export function summarizeResponse(payload) {
  if (!payload || typeof payload !== "object") return { type: typeof payload };
  return {
    keys: Object.keys(payload).slice(0, 12),
    dataCount: Array.isArray(payload.data) ? payload.data.length : 0,
    imageCount: extractImagesFromResponse(payload).length
  };
}
