// 上传层：multer 实例与 multipart 相关的处理工具。
//
// 从 server/index.js 原样搬来（按行区间机器切割），**没有任何逻辑改动**。
//
// 这里有几个值是实测出来的，改之前务必想清楚：
//   - OUTFIT_UPLOAD_FILE_LIMIT_BYTES = 25MB：单张图片上限。
//     超限时的用户提示文案里会带这个数，别单独改文案口径。
//   - IMAGE_UPLOAD_PARSE_CEILING = 16：multer 的**解析硬上限**，
//     真实业务上限由 routing catalog 的 capabilities.maxInputImages 决定
//     （见 server/channel.js validateImageCapabilities）。
//     这里取各模型最大值 14 再留 2 个余量，保证不会先被 multer 截断。
//   - fieldSize = 8MB：香蕉 Pro 参考图改走 JSON + image_urls 通道时，
//     客户端会把 1536 长边的 JPEG data URL 当文本字段一起上传，
//     multer 默认 fieldSize 只有 1MB 会被截断（踩过这个坑）。
//   - largeImageUpload 的 96MB：走内存的单张大图，给保存/缓存原图用。

import { readFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import { uploadTempDir } from "./app-paths.js";
import { writeGenerationLog } from "./generation-logger.js";

export const OUTFIT_UPLOAD_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
export const OUTFIT_UPLOAD_FILE_LIMIT_MB = Math.round(OUTFIT_UPLOAD_FILE_LIMIT_BYTES / 1024 / 1024);
// multer 的 maxCount 只是**解析硬上限**，真实上限由 routing catalog 的
// capabilities.maxInputImages 决定（见 server/channel.js validateImageCapabilities）。
// 这里取 4 个模型里的最大值 14，再留 2 个余量，保证不会被 multer 先截断。
export const IMAGE_UPLOAD_PARSE_CEILING = 16;
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: IMAGE_UPLOAD_PARSE_CEILING,
    fileSize: OUTFIT_UPLOAD_FILE_LIMIT_BYTES
  }
});
export function safeUploadFilename(name = "upload") {
  const ext = path.extname(String(name || "")) || ".img";
  const base = path.basename(String(name || "upload"), ext)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80) || "upload";
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${base}${ext}`;
}
export const imageForwardUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      mkdir(uploadTempDir, { recursive: true }).then(() => cb(null, uploadTempDir), cb);
    },
    filename: (_req, file, cb) => cb(null, safeUploadFilename(file.originalname))
  }),
  limits: {
    files: IMAGE_UPLOAD_PARSE_CEILING,
    fileSize: OUTFIT_UPLOAD_FILE_LIMIT_BYTES,
    // 香蕉 Pro 参考图改走 JSON + image_urls 通道时，客户端会把 1536 长边的
    // JPEG data URL 作为文本字段一起上传；multer 默认 fieldSize 只有 1MB 会被截断。
    fieldSize: 8 * 1024 * 1024
  }
});
export const largeImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 96 * 1024 * 1024
  }
});
export function requestIdFromMultipartPayload(req, prefix = "upload") {
  try {
    const parsed = req.body?.payload ? JSON.parse(req.body.payload) : null;
    return String(parsed?.taskId || parsed?.requestId || `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  } catch {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function outfitUploadErrorPayload(error) {
  const code = String(error?.code || "");
  if (code === "LIMIT_FILE_SIZE") {
    return {
      status: 413,
      error: "upload_too_large",
      message: `本地上传失败：单张图片超过 ${OUTFIT_UPLOAD_FILE_LIMIT_MB}MB，请缩小局部回贴框或先压缩图片后再生成`
    };
  }
  if (code === "LIMIT_FILE_COUNT") {
    return {
      status: 400,
      error: "upload_file_count",
      message: "本地上传失败：一次上传图片数量过多，请减少图1/图2/图3数量后重试"
    };
  }
  return {
    status: 400,
    error: code || "upload_failed",
    message: `本地上传失败：${error?.message || "图片接收失败"}`
  };
}

export function wrapOutfitUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, async (error) => {
      if (!error) return next();
      await removeUploadedFiles(req.files).catch(() => {});
      const requestId = requestIdFromMultipartPayload(req, "outfit_upload");
      const publicPayload = outfitUploadErrorPayload(error);
      await writeGenerationLog({
        time: new Date().toISOString(),
        requestId,
        ok: false,
        status: publicPayload.status,
        stage: "receive-outfit-upload",
        failureReason: publicPayload.error,
        error: error?.message || String(error || ""),
        message: publicPayload.message
      }).catch(() => {});
      return res.status(publicPayload.status).json({
        ok: false,
        ...publicPayload,
        requestId
      });
    });
  };
}

export function flattenUploadedFiles(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap((item) => Array.isArray(item) ? item : []);
}

export async function removeUploadedFiles(value) {
  const files = flattenUploadedFiles(value);
  await Promise.all(files.map(async (file) => {
    if (!file?.path) return;
    try {
      await unlink(file.path);
    } catch {}
  }));
}

export async function ensureFileBuffer(file) {
  if (!file || file.buffer?.length || !file.path) return file;
  file.buffer = await readFile(file.path);
  return file;
}