// 数据目录用量快照（V11-RF-114）。
//
// 从 server/index.js 原样搬来，逐字节等价，调用点零改动。
//
// 关键不变量（行为变更 = 「数据与存储」面板显示与实际磁盘不符）：
//   - STORAGE_TARGETS 五项的 key / label / imagesOnly / resetsHistory 逐字不改
//     （前端按 key 取项、按 label 显示，改了会串项）；
//   - 目录不存在视为 0 且不抛异常、单文件读不到跳过 —— 两个 catch 分支逐字保持；
//   - 返回字段 rootDir / dataDir / logsDir / items / totalBytes / historyCount 不变。

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import {
  dataDir,
  historyImageDir,
  referenceAssetDir,
  resultDir,
  rootDir,
  uploadTempDir
} from "./app-paths.js";
import { readHistoryResults } from "./history-store.js";

const STORAGE_TARGETS = [
  { key: "historyImages", label: "历史图片", resolve: () => historyImageDir, imagesOnly: true, resetsHistory: true },
  { key: "references", label: "参考图缓存", resolve: () => referenceAssetDir, imagesOnly: true },
  { key: "results", label: "结果图缓存", resolve: () => resultDir, imagesOnly: true },
  { key: "logs", label: "运行日志", resolve: () => path.join(rootDir, "logs"), imagesOnly: false },
  { key: "tmpUploads", label: "上传临时文件", resolve: () => uploadTempDir, imagesOnly: false }
];
const STORAGE_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp)$/i;

async function storageDirUsage(dir) {
  let files = 0;
  let bytes = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const info = await stat(path.join(dir, entry.name));
        files += 1;
        bytes += info.size;
      } catch {
        // 单个文件读不到就跳过，不影响整体统计
      }
    }
  } catch {
    // 目录不存在视为 0
  }
  return { files, bytes };
}

async function storageUsageSnapshot() {
  const items = [];
  let totalBytes = 0;
  for (const target of STORAGE_TARGETS) {
    const dir = target.resolve();
    const usage = await storageDirUsage(dir);
    totalBytes += usage.bytes;
    items.push({ key: target.key, label: target.label, path: dir, files: usage.files, bytes: usage.bytes });
  }
  const history = await readHistoryResults();
  return {
    rootDir,
    dataDir,
    logsDir: path.join(rootDir, "logs"),
    items,
    totalBytes,
    historyCount: history.length
  };
}

export { STORAGE_TARGETS, STORAGE_IMAGE_PATTERN, storageUsageSnapshot };
