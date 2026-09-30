// 历史 / 参考图 / 画布素材三类本地资源的「文件名 <-> 地址 / 磁盘路径」映射。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 单独拆成一层的唯一理由：image-payload（读历史图）与 history-store（写历史）
// 都要用这套映射，如果留在任一边，两边就会互相依赖形成环。
// 这一层只依赖 app-paths，谁都可以用它。
//
// 每条 xxxPath 都对入参做了 path.basename + 必须落在目标目录内的校验，
// 因为 filename 是从 URL 里取出来的，可被构造。

import path from "node:path";
import { canvasAssetDir, historyImageDir, referenceAssetDir } from "./app-paths.js";

export function historyImageUrl(filename) {
  return `/api/history-image/${encodeURIComponent(filename)}`;
}

export function referenceAssetUrl(filename) {
  return `/api/reference-asset/${encodeURIComponent(filename)}`;
}

export function historyImagePath(filename) {
  const safeName = path.basename(String(filename || ""));
  const resolved = path.resolve(historyImageDir, safeName);
  if (!resolved.startsWith(path.resolve(historyImageDir) + path.sep)) {
    throw new Error("历史图片路径无效");
  }
  return resolved;
}

export function referenceAssetPath(filename) {
  const safeName = path.basename(String(filename || ""));
  const resolved = path.resolve(referenceAssetDir, safeName);
  if (!resolved.startsWith(path.resolve(referenceAssetDir) + path.sep)) {
    throw new Error("invalid_reference_asset_path");
  }
  return resolved;
}

export function canvasAssetPath(filename) {
  const safeName = path.basename(String(filename || ""));
  const resolved = path.resolve(canvasAssetDir, safeName);
  if (!resolved.startsWith(path.resolve(canvasAssetDir) + path.sep)) {
    throw new Error("invalid_canvas_asset_path");
  }
  return resolved;
}