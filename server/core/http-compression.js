// 网关响应压缩中间件。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 它把自己挂在 res.send 上，对所有响应统一做 br / gzip，
// 目的是让中转站回传的大段 JSON 与前端 bundle 走得更省带宽。
//
// 判断要不要压缩的条件是历史调校的结果，改动前请想清楚：
//   - HEAD 请求、带 Range 的请求、204 / 304 一律不压
//     （前者没 body，后两者本来就是协商缓存响应）；
//   - 已经设过 Content-Encoding 的不重复压；
//   - 只对 json / text / javascript / css / html / xml / svg 压，
//     图片视频这些本身已经压过，再压纯属浪费 CPU；
//   - 小于 GATEWAY_COMPRESSION_MIN_BYTES 不压——小包压缩很可能反而变大；
//   - 压完如果比原文还大，直接丢弃结果发原文。
//
// 下面三个是给中间件用的内部辅助，一并导出，方便回归测试直接打单点。

import { brotliCompressSync, gzipSync } from "node:zlib";
import { GATEWAY_COMPRESSION_MIN_BYTES } from "./runtime-config.js";

export function appendVaryHeader(current, value) {
  const parts = String(current || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.some((item) => item.toLowerCase() === value.toLowerCase())) parts.push(value);
  return parts.join(", ");
}

export function acceptedGatewayEncoding(req) {
  const acceptEncoding = String(req.headers["accept-encoding"] || "").toLowerCase();
  if (/\bbr\b/.test(acceptEncoding) && !/\bbr\s*;\s*q=0(?:\.0+)?\b/.test(acceptEncoding)) return "br";
  if (/\bgzip\b/.test(acceptEncoding) && !/\bgzip\s*;\s*q=0(?:\.0+)?\b/.test(acceptEncoding)) return "gzip";
  return "";
}

export function isCompressibleResponseType(contentType) {
  return /\b(json|text|javascript|css|html|xml|svg)\b/i.test(String(contentType || ""));
}

export function gatewayCompressionMiddleware(req, res, next) {
  const originalSend = res.send.bind(res);

  res.send = function sendWithGatewayCompression(body) {
    const encoding = acceptedGatewayEncoding(req);
    const statusCode = res.statusCode || 200;
    const contentType = String(res.getHeader("Content-Type") || "");
    const shouldSkip = !encoding
      || req.method === "HEAD"
      || req.headers.range
      || statusCode === 204
      || statusCode === 304
      || res.getHeader("Content-Encoding")
      || !isCompressibleResponseType(contentType);

    if (shouldSkip || body == null || (!Buffer.isBuffer(body) && typeof body !== "string")) {
      return originalSend(body);
    }

    const source = Buffer.isBuffer(body) ? body : Buffer.from(body);
    if (source.length < GATEWAY_COMPRESSION_MIN_BYTES) return originalSend(body);

    try {
      const compressed = encoding === "br"
        ? brotliCompressSync(source)
        : gzipSync(source);
      if (compressed.length >= source.length) return originalSend(body);

      res.setHeader("Content-Encoding", encoding);
      res.setHeader("Vary", appendVaryHeader(res.getHeader("Vary"), "Accept-Encoding"));
      res.setHeader("Content-Length", String(compressed.length));
      return originalSend(compressed);
    } catch {
      return originalSend(body);
    }
  };

  next();
}
