// 把「一个图片字段」解析成 { buffer, mimeType, sourceUrl }。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 撑起这套很像 mic 的原因是历史数据里同一张图可能以五种形态存在：
//   ① 已归档到本地的 archiveFile；
//   ② /api/history-image/xxx 的本地地址；
//   ③ /api/canvas-asset/xxx 的画布素材地址；
//   ④ /api/result/xxx 的批量结果地址；
//   ⑤ 上游给的 http(s) 远程地址或 base64。
// 只要有一个形态漏掉，前端就会显示"图裂"，而且很难查。
//
// 要注意的两条约定：
//   - /api/result/ 分支做了路径穿越校验（解析后必须仍在 resultDir 里），
//     filename 是从 URL 里取出来的，不可信；
//   - 远程地址一律先翻译成 /api/image-proxy 再走代理，
//     不要改成前端直连（会被防盗链和 CORS 拦下）。

import { readFile } from "node:fs/promises";
import path from "node:path";
import { resultDir } from "./app-paths.js";
import { canvasAssetPath, historyImagePath, historyImageUrl } from "./asset-urls.js";
import { downloadExternalImageWithFallback, remoteUrlFromImageProxyPath } from "./image-proxy.js";
import { mimeTypeFromFile } from "./file-naming.js";
import { IMAGE_PROXY_TIMEOUT_MS } from "./runtime-config.js";

// 把 data: URI 解码成 { buffer, mimeType, sourceUrl }；不是 data: 返回 null。
// 上游（如老夜 OpenAI 兼容渠道）可能把 base64 图以 data: URI 形式塞进 `url` 字段，
// 而 `type: "url"` 分支会把它当远程地址去代理 → 抛 `unsupported_protocol`，
// 导致保存 / 自动保存静默失败。这里在入口处统一兜住 data:，跟 b64_json 分支等价处理。
function decodeDataUrl(value) {
  const text = String(value || "").trim();
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(text);
  if (!match) return null;
  const raw = match[2];
  if (!raw) return null;
  return {
    buffer: Buffer.from(raw, "base64"),
    mimeType: match[1] || "image/png",
    sourceUrl: ""
  };
}

export async function imageBufferFromPayload(image, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  if (!image || typeof image !== "object") {
    throw new Error("图片数据无效");
  }

  // 入口优先兜住 data: URI（可能在 value 或 localUrl 上，任意 type 都认），
  // 避免落入远程代理分支抛 unsupported_protocol。
  const decodedDataUrl = decodeDataUrl(image.value) || decodeDataUrl(image.localUrl);
  if (decodedDataUrl) return decodedDataUrl;

  if (image.archiveFile) {
    const file = historyImagePath(image.archiveFile);
    return {
      buffer: await readFile(file),
      mimeType: image.archiveMime || mimeTypeFromFile(image.archiveFile),
      sourceUrl: image.localUrl || historyImageUrl(image.archiveFile)
    };
  }

  const localUrl = String(image.localUrl || image.value || "");
  const proxiedRemoteUrl = String(image.proxySourceUrl || remoteUrlFromImageProxyPath(localUrl) || "").trim();
  if (/^https?:\/\//i.test(proxiedRemoteUrl)) {
    return downloadExternalImageWithFallback(proxiedRemoteUrl, timeoutMs);
  }

  if (localUrl.startsWith("/api/history-image/")) {
    const filename = decodeURIComponent(localUrl.split("/").pop() || "");
    const file = historyImagePath(filename);
    return {
      buffer: await readFile(file),
      mimeType: mimeTypeFromFile(filename),
      sourceUrl: localUrl
    };
  }

  if (localUrl.startsWith("/api/canvas-asset/")) {
    const filename = decodeURIComponent(localUrl.split("/").pop() || "");
    const file = canvasAssetPath(filename);
    return {
      buffer: await readFile(file),
      mimeType: mimeTypeFromFile(filename),
      sourceUrl: localUrl
    };
  }

  if (localUrl.startsWith("/api/result/")) {
    const filename = path.basename(decodeURIComponent(localUrl.split("/").pop() || ""));
    const file = path.join(resultDir, filename);
    if (!file.startsWith(path.resolve(resultDir) + path.sep)) {
      throw new Error("本地换装结果路径无效");
    }
    return {
      buffer: await readFile(file),
      mimeType: mimeTypeFromFile(filename),
      sourceUrl: localUrl
    };
  }

  if (image.type === "b64_json") {
    const value = String(image.value || "");
    const dataUrlMatch = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(value);
    const raw = dataUrlMatch ? dataUrlMatch[2] : value.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
    if (!raw) throw new Error("图片 base64 为空");
    return {
      buffer: Buffer.from(raw, "base64"),
      mimeType: image.mimeType || image.archiveMime || dataUrlMatch?.[1] || "image/png",
      sourceUrl: ""
    };
  }

  if (image.type === "url" && image.value) {
    return downloadExternalImageWithFallback(image.value, timeoutMs);
  }

  throw new Error("不支持的图片类型");
}
