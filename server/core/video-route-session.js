// 视频线路与会话状态（V11-RF-113）。
//
// 从 server/index.js 原样搬来，逐字节等价，调用点零改动。
//
// 关键不变量（行为变更 = 视频状态查询走错线路 / 401）：
//   - videoRouteSessions 是进程级单例 Map（本文件模块级 const），
//     被 createVideoRouteFromBillingTask / rememberVideoRouteSession / videoRouteForStatus 共享；
//     门禁 state-singleton-check 监视它「全服务端只有 1 处声明」且必须位于本文件。
//   - rememberVideoRouteSession：写入时懒清理过期条目，expiresAt = now + VIDEO_ROUTE_SESSION_TTL_MS。
//   - videoRouteForStatus：会话命中且未过期 → 用会话；否则（会话存在但已过期）取用即删，
//     无会话时用 createVideoRouteFromBillingTask(null, …) 兜底。
//   - TTL 数值、过期清理时机、取用即删语义逐字保持，禁止改 TTL 数字。

import {
  videoRouteText,
  hasHeader,
  safeSignedRouteHeaders,
  signedRouteCredential
} from "./route-helpers.js";
import { normalizeBaseUrl } from "../channel.js";
import {
  gatewayVideoBaseUrl,
  JINGYIN_VIDEO_GATEWAY_CHANNEL_ID
} from "../video-config.js";
import { VIDEO_ROUTE_SESSION_TTL_MS } from "./runtime-config.js";
import { resolveApiKey } from "./image-error-policy.js";

const videoRouteSessions = new Map();

export function videoRouteUrl(rawValue, baseUrl, fallbackPath) {
  const raw = videoRouteText(rawValue || fallbackPath);
  if (/^https?:\/\//i.test(raw)) return raw;
  const normalizedBase = normalizeBaseUrl(baseUrl || gatewayVideoBaseUrl());
  const routePath = raw.startsWith("/") ? raw : `/${raw}`;
  return `${normalizedBase}${routePath}`;
}

export function videoStatusUrlFromRoute(route, taskId) {
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

export function createVideoRouteFromBillingTask(billingTask, fallbackBaseUrl, fallbackApiKey) {
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

export function rememberVideoRouteSession(taskId, route) {
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

export function videoRouteForStatus(taskId, fallbackBaseUrl, fallbackApiKey) {
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
