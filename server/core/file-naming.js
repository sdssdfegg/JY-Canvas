// 文件命名与 MIME 判定。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 这一层先抽出来是因为历史归档、参考图归档、result 缓存都要用到它，
// 它们彼此不搭界，但都依赖这套"把原始图片整理成一个安全且不重名的本地文件名"的逻辑。
// 依赖方向：file-naming → format-utils，单向。
//
// 注意几点历史约定：
//   - mimeTypeFromFile 的兜底是 png（而不是抛错），因为历史上出现过
//     扩展名缺失导致整条历史记录加载失败的情况，宁可判错也不要中断；
//   - uniqueFilePath 的重名策略是加 _2 / _3 后缀，不是覆盖，
//     否则同一秒内批量生成的图会互相覆盖；
//   - imageExtensionFromType 会先信 mimeType、再退回 URL 后缀，
//     因为上游返回的 Content-Type 有时是 application/octet-stream。

import path from "node:path";
import { stat } from "node:fs/promises";

export function imageExtensionFromType(mimeType, fallbackUrl = "") {
  const lower = String(mimeType || "").toLowerCase();
  if (lower.includes("jpeg")) return "jpg";
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  let pathname = String(fallbackUrl || "image.png");
  try {
    pathname = new URL(fallbackUrl || "https://local/image.png", "https://local").pathname;
  } catch {
    pathname = String(fallbackUrl || "image.png");
  }
  const ext = path.extname(pathname).replace(".", "").toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "png";
}

export function mimeTypeFromFile(filename) {
  const ext = path.extname(String(filename || "")).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}


export async function pathExists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function uniqueFilePath(directory, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let candidate = path.join(directory, filename);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(directory, `${base}_${index}${ext}`);
    index += 1;
  }
  return candidate;
}

