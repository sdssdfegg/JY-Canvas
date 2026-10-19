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

/**
 * 读取封装种子清单 `/seed/manifest.json`（V121-R1 统筹裁决：按 P7-6「网络出口只此一处」口径收口于此）。
 *
 * 与 fetchLocalBlob 同族——种子是应用自己的内嵌静态资源（随 SEA 分发），不是后端接口，
 * 因此不进 client.js 的业务请求层；但「网络出口只此一处」的规矩没有例外可钻，
 * 故读取也必须走 src/api/，不希望在共享模块里新开一个裸 fetch 的口子。
 *
 * 与 fetchLocalBlob 的差异：种子读取挂在 App 启动门禁（publicReleaseStorageResetPromise 链）上，
 * 服务异常时不能无限期挂住首渲染，因此带 AbortController 超时（默认 3s）；
 * 404 / 超时 / JSON 坏一律抛错，由调用方 catch 后静默放过（不阻断启动）。
 *
 * @returns {Promise<any>} 解析后的种子 JSON
 */
export async function fetchSeedManifest(timeoutMs = 3000) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch("/seed/manifest.json", {
      ...(controller ? { signal: controller.signal } : {})
    });
    if (!response.ok) throw new Error(`种子清单读取失败 HTTP ${response.status}`);
    return await response.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** POST /api/cache-result-image —— 把换装结果图缓存到服务端（P7-6 从 outfit-task.js 搬来）。 */
export function cacheResultImageRequest(form) {
  return fetch("/api/cache-result-image", {
    method: "POST",
    body: form
  });
}
