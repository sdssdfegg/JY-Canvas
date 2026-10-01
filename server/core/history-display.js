// 历史条目即时展示解析。
//
// 从 server/index.js 原样搬来（按行区间机器切割），**没有任何逻辑改动**。
//
// 为什么单独成文件：它只处理"一条历史条目如何变成前端可展示的对象"（归档命中 /
// 归档缺失 / 只有 base64 三态），跟路由、跟出图、跟上传都没有耦合。
//
// 依赖：
//   ./image-proxy.js      — imageProxyUrl（url 类图片转本地代理地址）
//   ./history-store.js    — normalizeHistoryItem / archiveIncomingHistoryItem
//   ./runtime-config.js   — RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS
//   ./generation-logger.js — writeGenerationLog
//
// 注意：RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS 是"最长阻塞等待"，不是硬中断；
// 两个日志 stage 名（display-cache-base64-history-image / display-cache-url-history-image）
// 与返回对象的字段名前端按字段取值，都不得改动。

import { imageProxyUrl } from "./image-proxy.js";
import { normalizeHistoryItem, archiveIncomingHistoryItem } from "./history-store.js";
import { RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS } from "./runtime-config.js";
import { writeGenerationLog } from "./generation-logger.js";

function imageForImmediateDisplay(image) {
  if (!image || typeof image !== "object") return image;
  if (image.type !== "url") return image;
  const sourceUrl = String(image.sourceUrl || image.value || "").trim();
  if (!/^https?:\/\//i.test(sourceUrl)) return image;
  const localUrl = imageProxyUrl(sourceUrl);
  return {
    ...image,
    value: sourceUrl,
    localUrl,
    proxySourceUrl: sourceUrl,
    sourceUrl
  };
}

function isBase64ImagePayload(image) {
  if (!image || typeof image !== "object") return false;
  if (image.type === "b64_json") return true;
  return /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(image.value || image.localUrl || ""));
}

function hasHistoryDisplayArchive(item) {
  return Boolean(
    item?.image?.archiveFile
    || String(item?.image?.localUrl || "").startsWith("/api/history-image/")
  );
}

async function historyItemForImmediateDisplay(item, requestId = "", timeoutMs = RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS) {
  const normalized = normalizeHistoryItem(item);
  const wasArchived = hasHistoryDisplayArchive(normalized);
  const cacheStartedAt = Date.now();
  const archived = await archiveIncomingHistoryItem(normalized, timeoutMs);
  if (hasHistoryDisplayArchive(archived)) {
    if (!wasArchived) {
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId: requestId || item.id,
        ok: true,
        stage: isBase64ImagePayload(item?.image) ? "display-cache-base64-history-image" : "display-cache-url-history-image",
        itemId: item.id,
        archiveFile: archived.image.archiveFile || "",
        localUrl: archived.image.localUrl || "",
        timingMs: Date.now() - cacheStartedAt,
        timeoutMs
      });
    }
    return archived;
  }
  if (!wasArchived && normalized?.image) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId: requestId || item.id,
      ok: true,
      stage: "display-cache-history-image-deferred",
      itemId: item.id,
      timingMs: Date.now() - cacheStartedAt,
      timeoutMs
    });
  }
  return {
    ...normalized,
    image: imageForImmediateDisplay(archived?.image || normalized?.image)
  };
}

export { imageForImmediateDisplay, isBase64ImagePayload, hasHistoryDisplayArchive, historyItemForImmediateDisplay };
