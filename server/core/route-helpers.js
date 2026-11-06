// server/core/route-helpers.js
//
// 图片 / 视频「共用」的路由辅助函数。
//
// 🔴 命名约定（V11-RF-017，G-8 禁止改名）：
//   `videoRouteText` 这个名字虽然带 "video" 前缀，但它同时服务于「图片路由」与「视频路由」
//   两边（图片块里的 imageRouteUrl / imageRouteModel / createImageRouteFromBillingTask 等都在用它）。
//   当初从视频区抽出共用能力时保留了历史名字；如果改名，会同时破坏图片与视频两条功能线的调用方，
//   所以这里**保持原名不动**。
//
// 本模块不依赖 express / app / req / res，只做纯字符串 / 头字段处理，可被图片与视频两端 import。

import { resolveApiKey } from "./image-error-policy.js";

// 把任意值规整成「去首尾空格的字符串」。视频 / 图片路由构造都用它做字段裁剪。
export function videoRouteText(value) {
  return String(value || "").trim();
}

// 大小写不敏感地判断 headers 里是否已有某个头名（避免重复写 Authorization 等）。
export function hasHeader(headers, name) {
  const target = String(name || "").toLowerCase();
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === target);
}

// 从用户输入的 headers 里挑出「可安全转发」的头：
//   - 丢弃 host / connection / content-length / transfer-encoding（这些由本服务自己控制）；
//   - 空值丢弃；
//   - 其余逐字保留（键名 / 值都过 videoRouteText 裁剪）。
export function safeSignedRouteHeaders(input = {}) {
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

// 从签名线路的 route 对象里按固定兜底顺序取 API Key：
//   apiKey → api_key → bearerToken → bearer_token → token → accessToken → access_token → ""（兜底空串）。
// 最后统一过 resolveApiKey（处理环境变量 / 加密存储等）。
export function signedRouteCredential(route = {}) {
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
