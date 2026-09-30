// 结果缓存层：data/results 里那些「换装/生成结果图」的落盘、访问路径与自动清理。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 三件事：
//   - outfitResultUrl / outfitResultPath：结果文件名 <-> 对外 URL / 磁盘绝对路径。
//     outfitResultPath 里有路径穿越校验，是为了挡住 ../ 之类的文件名；
//   - getResultCacheDiskUsage / cleanupResultCache：按 TTL 删过期图，
//     磁盘占用超阈值时再按「最久未用优先」删到阈值以下（但只删够老的文件）；
//   - scheduleResultCacheCleanup / startResultCacheCleanup：启动清一次 + 定时轮询。
//
// 为什么连 outfitResultPath 一起搬：cleanupResultCache 要靠它把目录项还原成绝对路径，
// 分开放就又要互相 import。这一个文件就是「结果目录的全部读写规则」。
//
// 几个不能随手改的点：
//   - resultCacheCleanupRunning / resultCacheCleanupTimer / resultCacheCleanupStarted
//     是模块私有状态（故意不 export），外部只能通过 schedule/start 触发；
//     导出会让「并发只跑一个清理」这个保证失效；
//   - 磁盘压力清理里 `item.touchedAt > minimumTouchedAt` 是 continue 而不是 break：
//     跳过太新的文件继续找更老的，不能因为遇到一个新文件就停；
//   - deleteResultCacheFile 把 ENOENT 当「没删到」返回 false，其它错误照抛——
//     并发清理时文件被别人先删掉是正常现象，不能当失败。

import { mkdir, readdir, stat, statfs, unlink } from "node:fs/promises";
import path from "node:path";
import { resultDir } from "./app-paths.js";
import { writeGenerationLog } from "./generation-logger.js";
import {
  RESULT_CACHE_CLEANUP_INTERVAL_MS,
  RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS,
  RESULT_CACHE_MAX_DISK_USAGE_RATIO,
  RESULT_CACHE_TTL_DAYS,
  RESULT_CACHE_TTL_MS
} from "./runtime-config.js";

let resultCacheCleanupRunning = false;
let resultCacheCleanupTimer = null;
// 注意：resultCacheCleanupStarted **没有**跟过来。它是 index.js 里
// startResultCacheCleanupOnce() 的「进程内只启动一次」开关，跟本模块的
// 「同一时刻只跑一个清理」不是一回事，留在调用方。

export function outfitResultUrl(filename) {
  return `/api/result/${encodeURIComponent(filename)}`;
}

export function outfitResultPath(filename) {
  const safeName = path.basename(String(filename || ""));
  const resolved = path.resolve(resultDir, safeName);
  if (!resolved.startsWith(path.resolve(resultDir) + path.sep)) {
    throw new Error("本地换装结果路径无效");
  }
  return resolved;
}

export function isResultCacheImageFile(name) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(name || ""));
}

export function roundCacheRatio(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

export async function getResultCacheDiskUsage() {
  await mkdir(resultDir, { recursive: true });
  const info = await statfs(resultDir);
  const blockSize = Number(info.bsize || info.frsize || 0);
  const totalBlocks = Number(info.blocks || 0);
  const availableBlocks = Number(info.bavail ?? info.bfree ?? 0);
  const totalBytes = blockSize * totalBlocks;
  const availableBytes = Math.max(0, blockSize * availableBlocks);
  if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null;
  const usedBytes = Math.max(0, totalBytes - availableBytes);
  return {
    totalBytes,
    availableBytes,
    usedBytes,
    usedRatio: usedBytes / totalBytes
  };
}

export async function deleteResultCacheFile(file) {
  try {
    await unlink(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function cleanupResultCache(reason = "scheduled") {
  if (resultCacheCleanupRunning) return;
  resultCacheCleanupRunning = true;
  const startedAt = Date.now();
  let scannedCount = 0;
  let deletedCount = 0;
  let deletedBytes = 0;
  let expiredDeletedCount = 0;
  let expiredDeletedBytes = 0;
  let pressureDeletedCount = 0;
  let pressureDeletedBytes = 0;
  let diskPressureTriggered = false;
  let diskUsageBeforePressure = null;
  let diskUsageAfterCleanup = null;

  try {
    await mkdir(resultDir, { recursive: true });
    const cutoff = Date.now() - RESULT_CACHE_TTL_MS;
    const entries = await readdir(resultDir, { withFileTypes: true });
    const remainingItems = [];

    for (const entry of entries) {
      if (!entry.isFile() || !isResultCacheImageFile(entry.name)) continue;
      scannedCount += 1;
      const file = outfitResultPath(entry.name);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) continue;
      const touchedAt = Math.max(info.mtimeMs || 0, info.birthtimeMs || 0);
      const size = info.size || 0;
      if (touchedAt >= cutoff) {
        remainingItems.push({ file, size, touchedAt });
        continue;
      }
      if (!await deleteResultCacheFile(file)) continue;
      deletedCount += 1;
      deletedBytes += size;
      expiredDeletedCount += 1;
      expiredDeletedBytes += size;
    }

    diskUsageBeforePressure = await getResultCacheDiskUsage().catch(() => null);
    if (diskUsageBeforePressure?.usedRatio > RESULT_CACHE_MAX_DISK_USAGE_RATIO) {
      diskPressureTriggered = true;
      remainingItems.sort((left, right) => left.touchedAt - right.touchedAt);
      let projectedAvailableBytes = diskUsageBeforePressure.availableBytes;
      const totalBytes = diskUsageBeforePressure.totalBytes;
      const minimumTouchedAt = Date.now() - RESULT_CACHE_DISK_PRESSURE_MIN_FILE_AGE_MS;

      for (const item of remainingItems) {
        const projectedUsedRatio = (totalBytes - projectedAvailableBytes) / totalBytes;
        if (projectedUsedRatio <= RESULT_CACHE_MAX_DISK_USAGE_RATIO) break;
        if (item.touchedAt > minimumTouchedAt) continue;
        if (!await deleteResultCacheFile(item.file)) continue;
        projectedAvailableBytes += item.size;
        deletedCount += 1;
        deletedBytes += item.size;
        pressureDeletedCount += 1;
        pressureDeletedBytes += item.size;
      }
    }

    diskUsageAfterCleanup = await getResultCacheDiskUsage().catch(() => null);

    if (deletedCount > 0 || diskPressureTriggered) {
      await writeGenerationLog({
        time: new Date().toISOString(),
        ok: true,
        stage: "result-cache-cleanup",
        reason,
        ttlDays: RESULT_CACHE_TTL_DAYS,
        maxDiskUsageRatio: RESULT_CACHE_MAX_DISK_USAGE_RATIO,
        diskUsageRatioBeforePressure: roundCacheRatio(diskUsageBeforePressure?.usedRatio),
        diskUsageRatioAfterCleanup: roundCacheRatio(diskUsageAfterCleanup?.usedRatio),
        diskPressureTriggered,
        scannedCount,
        deletedCount,
        deletedBytes,
        expiredDeletedCount,
        expiredDeletedBytes,
        pressureDeletedCount,
        pressureDeletedBytes,
        timingMs: Date.now() - startedAt
      });
    }
  } catch (error) {
    await writeGenerationLog({
      time: new Date().toISOString(),
      ok: false,
      stage: "result-cache-cleanup",
      reason,
      ttlDays: RESULT_CACHE_TTL_DAYS,
      maxDiskUsageRatio: RESULT_CACHE_MAX_DISK_USAGE_RATIO,
      diskUsageRatioBeforePressure: roundCacheRatio(diskUsageBeforePressure?.usedRatio),
      diskUsageRatioAfterCleanup: roundCacheRatio(diskUsageAfterCleanup?.usedRatio),
      diskPressureTriggered,
      scannedCount,
      deletedCount,
      deletedBytes,
      expiredDeletedCount,
      expiredDeletedBytes,
      pressureDeletedCount,
      pressureDeletedBytes,
      timingMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error || "")
    });
  } finally {
    resultCacheCleanupRunning = false;
  }
}

export function scheduleResultCacheCleanup(reason = "scheduled", delayMs = 0) {
  if (delayMs <= 0) {
    void cleanupResultCache(reason);
    return;
  }
  if (resultCacheCleanupTimer) return;
  resultCacheCleanupTimer = setTimeout(() => {
    resultCacheCleanupTimer = null;
    void cleanupResultCache(reason);
  }, delayMs);
  resultCacheCleanupTimer.unref?.();
}

export function startResultCacheCleanup() {
  scheduleResultCacheCleanup("startup");
  const timer = setInterval(() => {
    scheduleResultCacheCleanup("scheduled");
  }, RESULT_CACHE_CLEANUP_INTERVAL_MS);
  timer.unref?.();
}
