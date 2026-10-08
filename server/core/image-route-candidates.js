// server/core/image-route-candidates.js
//
// 图片线路「候选」解析与请求头构造（V11-RF-111）。
//
// 从 server/index.js 的「图片块」逐字节搬来，逻辑零改动。
// 与视频共用的 4 个辅助（videoRouteText / hasHeader / safeSignedRouteHeaders / signedRouteCredential）
// 一律 import 自 ./route-helpers.js（V11-RF-017 的共享模块），**禁止复制**（016 同名函数门禁会当场拦下）。
//
// 本模块不依赖 express / app / req / res。

import {
  videoRouteText,
  hasHeader,
  safeSignedRouteHeaders,
  signedRouteCredential
} from "./route-helpers.js";
import { resolveApiKey } from "./image-error-policy.js";
import { normalizeBaseUrl, buildImageRequestVariants } from "../channel.js";
import {
  channelEndpointForBaseUrl,
  channelLogFields,
  upstreamModelForChannel,
  apiKeyForChannel,
  apiKeyHeadersForChannel
} from "../channel-config.js";

// 把 credential 规整成 Bearer 头值（过 resolveApiKey + 补 Bearer 前缀）。
function bearerHeaderValue(credential) {
  const text = resolveApiKey(credential);
  if (!text) return "";
  return /^Bearer\s+/i.test(text) ? text : `Bearer ${text}`;
}

// 拼出图片线路 URL：绝对地址原样返回；相对路径拼到 baseUrl 后面。
function imageRouteUrl(rawValue, baseUrl, fallbackPath) {
  const raw = videoRouteText(rawValue || fallbackPath);
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const routePath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${normalizedBase}${routePath}`;
}

// 从 route 里取图片上游模型名（多字段兜底）。
function imageRouteModel(route = {}) {
  return videoRouteText(
    route.model
    || route.upstreamModel
    || route.upstream_model
    || route.realModel
    || route.real_model
  );
}

// 计费任务 → 图片签名线路（billing-signed-image）：解析 baseUrl / 头 / 模型 / 渠道标识。
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

// 组装图片线路候选列表：签名线路优先，再补一组 baseUrl 候选（去重、跳过已签名的）。
export function imageCandidateEntries(baseUrls = [], billingTask = null) {
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

// 单个候选的日志字段：签名线路补 channelIsFallback / channelSignedRoute 等。
export function imageChannelLogForCandidate(candidate, index, candidateCount) {
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

// 候选级别的参数换算：命中上游模型时改写 model。
function imageParamsForCandidate(params, candidate) {
  const upstreamModel = candidate?.model || upstreamModelForChannel(candidate.baseUrl, params.model);
  return upstreamModel === params.model ? params : { ...params, model: upstreamModel };
}

// 候选级别的请求变体构造（含参数换算）。
export function imageRequestVariantsForCandidate(params, files, candidate) {
  return buildImageRequestVariants(imageParamsForCandidate(params, candidate), files);
}

// 候选级别的请求 URL：非签名走 baseUrl+path；签名按 有图/无图 选 edit/generation 模板。
export function imageUrlForCandidate(candidate, variant, hasImages) {
  if (!candidate?.usesSignedRoute) return `${candidate.baseUrl}${variant.path}`;
  const route = candidate.route || {};
  const raw = hasImages
    ? route.editUrl || route.edit_url || route.editsUrl || route.edits_url || route.url || route.path
    : route.generationUrl || route.generation_url || route.generationsUrl || route.generations_url || route.createUrl || route.create_url || route.url || route.path;
  return imageRouteUrl(raw, candidate.baseUrl, variant.path);
}

// 候选级别的 API Key：签名且有凭据则不透传；否则按 baseUrl 渠道取。
export function imageApiKeyForCandidate(candidate, fallbackApiKey) {
  if (candidate?.usesSignedRoute && candidate.hasCredential) return "";
  if (candidate?.usesSignedRoute) return signedRouteCredential(candidate.route) || apiKeyForChannel(candidate.baseUrl, fallbackApiKey);
  return apiKeyForChannel(candidate.baseUrl, fallbackApiKey);
}

// 候选级别的请求头：候选自带头 ∪ 渠道鉴权头 ∪ 变体头（不覆盖、空值丢弃）。
export function imageHeadersForCandidate(candidate, channelApiKey, variantHeaders = {}) {
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
