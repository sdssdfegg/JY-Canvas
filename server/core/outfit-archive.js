import { mkdir, writeFile } from "node:fs/promises";
import { resultDir } from "./app-paths.js";
import { imageExtensionFromType } from "./file-naming.js";
import { imageBufferFromPayload } from "./image-payload.js";
import { sanitizeFilePart } from "./format-utils.js";
import { outfitResultPath, outfitResultUrl, scheduleResultCacheCleanup } from "./result-cache.js";
import { writeGenerationLog } from "./generation-logger.js";
import {
  IMAGE_PROXY_TIMEOUT_MS,
  RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS,
  RESULT_DISPLAY_CACHE_TIMEOUT_MS
} from "./runtime-config.js";
import { imageFromOutfitArchive } from "./outfit-upload-groups.js";

async function archiveOutfitGeneratedImage(image, taskId, timeoutMs = IMAGE_PROXY_TIMEOUT_MS) {
  const payload = await imageBufferFromPayload(image, timeoutMs);
  const ext = imageExtensionFromType(payload.mimeType, payload.sourceUrl);
  const safeTaskId = sanitizeFilePart(taskId || "task");
  const filename = `HZ-${new Date().getDate()}-${safeTaskId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const target = outfitResultPath(filename);
  await mkdir(resultDir, { recursive: true });
  await writeFile(target, payload.buffer, { flag: "wx" });
  scheduleResultCacheCleanup("post-result-write", RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS);
  return {
    type: "local",
    filename,
    localUrl: outfitResultUrl(filename),
    bytes: payload.buffer.length,
    archiveMime: payload.mimeType,
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {})
  };
}

async function cacheOutfitGeneratedImageForDisplay(image, taskId, timeoutMs = RESULT_DISPLAY_CACHE_TIMEOUT_MS) {
  const startedAt = Date.now();
  try {
    const archived = await archiveOutfitGeneratedImage(image, taskId, timeoutMs);
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId: taskId,
      ok: true,
      stage: "display-cache-outfit-result-image",
      bytes: archived.bytes,
      localUrl: archived.localUrl,
      sourceUrl: archived.sourceUrl || "",
      timingMs: Date.now() - startedAt,
      timeoutMs
    });
    return imageFromOutfitArchive(archived) || image;
  } catch (error) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      requestId: taskId,
      ok: false,
      stage: "display-cache-outfit-result-image",
      error: error instanceof Error ? error.message : String(error),
      timingMs: Date.now() - startedAt,
      timeoutMs
    });
    return image;
  }
}

function archiveOutfitGeneratedImageInBackground(image, taskId, stage = "background-cache-outfit-result-image") {
  setTimeout(() => {
    archiveOutfitGeneratedImage(image, taskId)
      .then((archived) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: taskId,
        ok: true,
        stage,
        bytes: archived.bytes,
        localUrl: archived.localUrl,
        sourceUrl: archived.sourceUrl || ""
      }))
      .catch((error) => writeGenerationLog({
        time: new Date().toISOString(),
        requestId: taskId,
        ok: false,
        stage,
        error: error instanceof Error ? error.message : String(error)
      }));
  }, 0);
}

export {
  archiveOutfitGeneratedImage,
  cacheOutfitGeneratedImageForDisplay,
  archiveOutfitGeneratedImageInBackground
};
