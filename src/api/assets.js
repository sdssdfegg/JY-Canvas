import { postForm } from "./client.js";

const IMAGE_BLOB_FETCH_TIMEOUT_MS = 120000;

export function displayImageRequestUrl(src) {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return src;
  return /^https?:\/\//i.test(src) ? `/api/image-proxy?url=${encodeURIComponent(src)}` : src;
}

export async function fetchImageBlob(src, fallbackMessage = "Image request failed", options = {}) {
  const timeoutMs = Math.max(5000, Number.parseInt(options.timeoutMs || IMAGE_BLOB_FETCH_TIMEOUT_MS, 10) || IMAGE_BLOB_FETCH_TIMEOUT_MS);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(displayImageRequestUrl(src), {
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) throw new Error(`${fallbackMessage} HTTP ${response.status}`);
    return response.blob();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${fallbackMessage}：图片读取超时`);
    }
    throw error;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export function uploadCanvasAssets(form) {
  return postForm("/api/canvas-assets", form, "Canvas assets upload failed");
}

/**
 * 带超时的图片 blob 下载（P7-6 从 `src/features/outfit/outfit-task.js` 逐行搬来）。
 *
 * 与紧挨着的 `fetchImageBlob` 是两码事，**刻意没有合成一个**：
 *   - 这里要 `cache: "force-cache"`（结果图是同一张，走 HTTP 缓存才不会重复拉流）；
 *   - 这里拿到的 `url` 已经在外层过过 `displayImageRequestUrl`，再走一次代理会二次编码；
 *   - 错误文案是「缓存图片失败」而不是通用的「图片读取失败」。
 * 合成需要先实测缓存策略差异的影响面，属另一个独立改动，本单只做位置搬运（R6）。
 *
 * @returns {Promise<Blob>}
 */
export function fetchBlobWithTimeout(url, timeoutMs = 45000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  return fetch(url, {
    cache: "force-cache",
    ...(controller ? { signal: controller.signal } : {})
  }).finally(() => {
    if (timer) window.clearTimeout(timer);
  }).then((response) => {
    if (!response.ok) throw new Error(`缓存图片失败 HTTP ${response.status}`);
    return response.blob();
  });
}

/**
 * 本地 blob 读取（`data:` / `blob:` URL，P7-6 从 `src/shared/local-edit-mask.js:159` 搬来）。
 *
 * 这不是业务接口请求，纯粹的本地解码；搬进来的唯一理由是让「网络出口只此一处」
 * 这条规矩没有例外可钻。行为与原来完全一致：`fetch(url).then(r => r.blob())`。
 *
 * @returns {Promise<Blob>}
 */
export function fetchLocalBlob(url) {
  return fetch(url).then((response) => response.blob());
}

/** POST /api/cache-result-image —— 把换装结果图缓存到服务端（P7-6 从 outfit-task.js 搬来）。 */
export function cacheResultImageRequest(form) {
  return fetch("/api/cache-result-image", {
    method: "POST",
    body: form
  });
}
