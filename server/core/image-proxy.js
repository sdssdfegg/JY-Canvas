// 远程图片代理：把中转站返回的 http(s) 图片拉回本地再交给前端。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 为什么要绕一圈代理，而不是让前端直接访问上游：
//   1. 浏览器直连会被上游的防盗链 / CORS / Referer 校验拦下；
//   2. 只有走本地才能真正做 HTTP Range 分块（有些主机单次响应有体量限制）；
//   3. 域名白名单在 src/shared/image-hosts.js，前后端共用同一份。
//
// 下载策略是几次线上故障之后定下来的形状，改前请想清楚：
//   - 先走 Range 分块（downloadExternalImageWithRanges），失败再退直连
//     （downloadExternalImageDirect）——因为在 disablexiaohu/流量压缩类主机上，
//     Range 会被忽略或返回 200 整包；
//   - 退到直连也算成功，但会把 Range 阶段的错误塞进 rangeFallbackError 带回来，
//     方便事后看出"这条链路其实已经不稳了"；
//   - 直连也失败时，把 rangeError 挂在 directError 上一起抛，
//     两条路的错误信息都不能丢。
//
// 另外注意：这里返回给前端的 Content-* 头只转发一小撮白名单
// （在 forwardHeader 里），而不是全量转发——上游偶尔会带回 Content-Encoding
// 之类会跟本地网关压缩打架的头。


import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isSafeRemoteImageUrl } from "../../src/shared/image-hosts.js";
import { compactLogMessage } from "./format-utils.js";
import { createAbortSignal } from "./http-client.js";
import { mimeTypeFromFile } from "./file-naming.js";
import {
  IMAGE_PROXY_TIMEOUT_MS,
  RESULT_URL_DOWNLOAD_CHUNK_BYTES,
  RESULT_URL_DOWNLOAD_RETRIES
} from "./runtime-config.js";

export function parseProxyTarget(rawUrl) {
  const target = new URL(String(rawUrl || ""));
  if (!["http:", "https:"].includes(target.protocol)) {
    throw new Error("unsupported_protocol");
  }
  if (!isSafeRemoteImageUrl(target.toString())) {
    throw new Error("blocked_image_host");
  }
  return target;
}

export function imageProxyUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  return value ? `/api/image-proxy?url=${encodeURIComponent(value)}` : "";
}

export function remoteUrlFromImageProxyPath(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("/api/image-proxy")) return "";
  try {
    const parsed = new URL(text, "http://127.0.0.1");
    return parsed.pathname === "/api/image-proxy" ? String(parsed.searchParams.get("url") || "") : "";
  } catch {
    return "";
  }
}

export function parseContentRange(value) {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(String(value || "").trim());
  if (!match) return null;
  const start = Number.parseInt(match[1], 10);
  const end = Number.parseInt(match[2], 10);
  const total = match[3] === "*" ? NaN : Number.parseInt(match[3], 10);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end, total };
}

export async function fetchImageRangeChunk(target, start, end, timeoutMs) {
  let lastError = null;
  for (let attempt = 1; attempt <= RESULT_URL_DOWNLOAD_RETRIES; attempt += 1) {
    const abort = createAbortSignal(timeoutMs);
    try {
      const response = await fetch(target, {
        method: "GET",
        headers: {
          Range: `bytes=${start}-${end}`,
          "Accept-Encoding": "identity",
          "User-Agent": "JingyinAI/0.1"
        },
        signal: abort.signal
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${compactLogMessage(text, 200)}`);
      }
      return {
        status: response.status,
        buffer: Buffer.from(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type") || "",
        contentRange: response.headers.get("content-range") || "",
        contentLength: Number.parseInt(response.headers.get("content-length") || "", 10)
      };
    } catch (error) {
      lastError = error;
      if (attempt >= RESULT_URL_DOWNLOAD_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    } finally {
      abort.dispose();
    }
  }
  throw lastError || new Error("range_download_failed");
}

export async function downloadExternalImageWithRanges(rawUrl, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  const target = parseProxyTarget(rawUrl);
  const sourceUrl = String(rawUrl || "");
  const firstEnd = RESULT_URL_DOWNLOAD_CHUNK_BYTES - 1;
  const first = await fetchImageRangeChunk(target, 0, firstEnd, timeoutMs);
  const mimeType = first.mimeType || mimeTypeFromFile(target.pathname);

  if (first.status === 200) {
    return {
      buffer: first.buffer,
      mimeType,
      sourceUrl,
      rangeMode: "ignored"
    };
  }

  if (first.status !== 206) {
    throw new Error(`range_download_unexpected_status_${first.status}`);
  }

  const firstRange = parseContentRange(first.contentRange);
  if (!firstRange || !Number.isFinite(firstRange.total) || firstRange.total <= 0) {
    throw new Error("range_download_missing_total");
  }

  const chunks = [first.buffer];
  let nextStart = firstRange.end + 1;
  while (nextStart < firstRange.total) {
    const nextEnd = Math.min(firstRange.total - 1, nextStart + RESULT_URL_DOWNLOAD_CHUNK_BYTES - 1);
    const next = await fetchImageRangeChunk(target, nextStart, nextEnd, timeoutMs);
    if (next.status !== 206) {
      throw new Error(`range_download_unexpected_status_${next.status}`);
    }
    const nextRange = parseContentRange(next.contentRange);
    if (!nextRange || nextRange.start !== nextStart || nextRange.end < nextRange.start) {
      throw new Error("range_download_mismatched_chunk");
    }
    chunks.push(next.buffer);
    nextStart = nextRange.end + 1;
  }

  return {
    buffer: Buffer.concat(chunks, firstRange.total),
    mimeType,
    sourceUrl,
    rangeMode: "range"
  };
}

export async function downloadExternalImageDirect(rawUrl, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  const target = parseProxyTarget(rawUrl);
  const abort = createAbortSignal(timeoutMs);
  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "JingyinAI/0.1"
      },
      signal: abort.signal
    });
    if (!response.ok) throw new Error(`图片下载失败 HTTP ${response.status}`);
    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") || mimeTypeFromFile(target.pathname),
      sourceUrl: String(rawUrl || ""),
      rangeMode: "direct"
    };
  } finally {
    abort.dispose();
  }
}

export function forwardHeader(response, res, name) {
  const value = response.headers.get(name);
  if (value) res.setHeader(name, value);
}

export async function streamExternalImageProxy(req, res, rawUrl, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  const target = parseProxyTarget(rawUrl);
  const abort = createAbortSignal(timeoutMs);
  try {
    const headers = {
      "Accept-Encoding": "identity",
      "User-Agent": "JingyinAI/0.1"
    };
    if (req.headers.range) headers.Range = String(req.headers.range);
    const response = await fetch(target, {
      headers,
      signal: abort.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const error = new Error(`HTTP ${response.status} ${compactLogMessage(text, 200)}`);
      error.status = response.status;
      throw error;
    }

    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || mimeTypeFromFile(target.pathname));
    res.setHeader("Cache-Control", "private, max-age=300");
    forwardHeader(response, res, "content-length");
    forwardHeader(response, res, "content-range");
    forwardHeader(response, res, "accept-ranges");

    if (response.body) {
      await pipeline(Readable.fromWeb(response.body), res);
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } finally {
    abort.dispose();
  }
}

export async function downloadExternalImageWithFallback(rawUrl, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  try {
    return await downloadExternalImageWithRanges(rawUrl, timeoutMs);
  } catch (rangeError) {
    try {
      const direct = await downloadExternalImageDirect(rawUrl, timeoutMs);
      return {
        ...direct,
        rangeFallbackError: rangeError instanceof Error ? rangeError.message : String(rangeError || "")
      };
    } catch (directError) {
      directError.rangeError = rangeError;
      throw directError;
    }
  }
}
