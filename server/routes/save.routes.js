// 保存目录 + 保存图片 + 结果图路由（V11-RF-208）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 🔴 **本单是被夹住的一单（§0.2 第 4 条）**：8 条路由原本分两段，中间夹着
//    209 的 `POST /api/detail-prompts`（旧行号 909）：
//      段 A：save-directory(GET/POST) / pick-directory / open-save-directory
//      —— 夹着 detail-prompts ——
//      段 B：save-image / save-processed-image / cache-result-image / result/:filename
//    现合并进本文件（段 A 在前、段 B 在后，相对顺序逐字保持），
//    注册调用插在**段 A 第一条路由的位置**；段 B 因此从 detail-prompts 之后移到之前。
//    **等价性论证**：8 条路径与 `/api/detail-prompts` 互不相同、无通配重叠
//    （`/api/result/:filename` 只匹配 `/api/result/` 前缀，吃不到 `/api/detail-prompts`），
//    且全部仍注册在 app.use 中间件之后 ⇒ 功能等价。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                                  ← 形参
//   existsSync                                                           ← node:fs
//   mkdir / writeFile                                                    ← node:fs/promises
//   path                                                                 ← node:path（默认导入）
//   getSaveDirectory / setSaveDirectory                                  ← server/core/app-settings.js
//   openDirectory / pickDirectory                                        ← server/core/directory-picker.js
//   largeImageUpload                                                     ← server/core/uploads.js
//   imageBufferFromPayload                                               ← server/core/image-payload.js
//   imageExtensionFromType / mimeTypeFromFile                            ← server/core/file-naming.js
//   sanitizeFilePart                                                     ← server/core/format-utils.js
//   sanitizeSubfolderName / writeJingyinNumberedImage /
//     writeProcessedImage                                                ← server/core/asset-persist.js
//   itemWithArchivedImage                                                ← server/core/history-store.js
//   outfitResultPath / outfitResultUrl / scheduleResultCacheCleanup       ← server/core/result-cache.js
//   streamLocalImageFile                                                 ← server/core/local-image-stream.js
// ⇒ **没有任何符号来自 index.js 作用域**。largeImageUpload 是 multer 共享件，
//   只 import 不重写（模块内零 multer(）。
//
// 逐字保留（执行单 §5）：
//   - `normalizeUsableSaveDirectory` / `setSaveDirectory` 的**校验与记忆**行为；
//   - 文件名安全化：`sanitizeFilePart` / `sanitizeSubfolderName` 的口径不得放松；
//   - 「**白底精修中线剪裁成两张**」的落盘行为 —— 这是人类冒烟要验的（组 B）；
//   - `/api/result/:filename` 的**分段读取必须走 core/local-image-stream.js**
//     （V11-RF-108 的成果，不得就地重写一份流式逻辑）；
//   - 四条不同的失败文案（保存目录设置失败 / 目录选择失败 / 打开保存目录失败 …）不得合并；
//   - `pick-directory` 的取消分支仍回 `{ ok:true, cancelled:true, directory:"" }`。
//
// 📌 必须同步确认（执行单 §5 第 2 条）：`scripts/verify/white-refine-split-check.mjs`
//    在 V11-RF-010 之后应已改为「在全部服务端源码里找 /api/save-processed-image 注册」，
//    本单搬完**必须实跑确认它仍能命中**（路由已不在 index.js 里）。
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSaveDirectory, setSaveDirectory } from "../core/app-settings.js";
import { resultDir } from "../core/app-paths.js";
import {
  RESULT_CACHE_CONTROL,
  RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS
} from "../core/runtime-config.js";
import { openDirectory, pickDirectory } from "../core/directory-picker.js";
import { largeImageUpload } from "../core/uploads.js";
import { imageBufferFromPayload } from "../core/image-payload.js";
import { imageExtensionFromType, mimeTypeFromFile } from "../core/file-naming.js";
import { sanitizeFilePart } from "../core/format-utils.js";
import {
  sanitizeSubfolderName,
  writeJingyinNumberedImage,
  writeProcessedImage
} from "../core/asset-persist.js";
import { itemWithArchivedImage } from "../core/history-store.js";
import {
  outfitResultPath,
  outfitResultUrl,
  scheduleResultCacheCleanup
} from "../core/result-cache.js";
import { streamLocalImageFile } from "../core/local-image-stream.js";

export function registerSaveRoutes(app) {
  app.get("/api/save-directory", async (_req, res) => {
    const directory = await setSaveDirectory(await getSaveDirectory());
    res.json({ ok: true, directory });
  });

  app.post("/api/save-directory", async (req, res) => {
    try {
      const directory = await setSaveDirectory(req.body?.directory);
      res.json({ ok: true, directory });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "保存目录设置失败"
      });
    }
  });

  app.post("/api/pick-directory", async (req, res) => {
    try {
      const directory = await pickDirectory(req.body?.directory);
      if (!directory) {
        return res.json({ ok: true, cancelled: true, directory: "" });
      }
      res.json({ ok: true, cancelled: false, directory });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "目录选择失败"
      });
    }
  });

  app.post("/api/open-save-directory", async (req, res) => {
    try {
      const directory = await openDirectory(req.body?.directory || await getSaveDirectory());
      res.json({ ok: true, directory });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "打开保存目录失败"
      });
    }
  });

  app.post("/api/save-image", async (req, res) => {
    try {
      const item = await itemWithArchivedImage(req.body?.item || req.body);
      const directory = await setSaveDirectory(req.body?.directory || await getSaveDirectory());
      const { buffer, mimeType, sourceUrl } = await imageBufferFromPayload(item.image);
      const { filename, target } = await writeJingyinNumberedImage(
        directory,
        buffer,
        imageExtensionFromType(mimeType, sourceUrl)
      );
      res.json({ ok: true, directory, filename, path: target, bytes: buffer.length });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "保存图片失败"
      });
    }
  });

  app.post("/api/save-processed-image", largeImageUpload.single("image"), async (req, res) => {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ ok: false, message: "缺少整理后的图片文件" });
      }

      const directory = await setSaveDirectory(req.body?.directory || await getSaveDirectory());
      const hasSubfolder = Object.prototype.hasOwnProperty.call(req.body || {}, "subfolder");
      const subfolder = hasSubfolder ? req.body.subfolder : "裁剪";
      const { filename, target } = await writeProcessedImage(
        directory,
        req.file.buffer,
        imageExtensionFromType(req.file.mimetype, req.file.originalname),
        subfolder
      );

      res.json({
        ok: true,
        directory,
        cropDirectory: String(subfolder ?? "").trim() ? path.join(directory, sanitizeSubfolderName(subfolder)) : directory,
        filename,
        path: target,
        bytes: req.file.size
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "保存整理后图片失败"
      });
    }
  });

  app.post("/api/cache-result-image", largeImageUpload.single("image"), async (req, res) => {
    try {
      if (!req.file?.buffer?.length) {
        return res.status(400).json({ ok: false, message: "缺少结果图片文件" });
      }

      const safeTaskId = sanitizeFilePart(req.body?.taskId || "task");
      const ext = imageExtensionFromType(req.file.mimetype, req.file.originalname);
      const filename = `HZ-${new Date().getDate()}-${safeTaskId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const target = outfitResultPath(filename);
      await mkdir(resultDir, { recursive: true });
      await writeFile(target, req.file.buffer, { flag: "wx" });
      scheduleResultCacheCleanup("post-result-write", RESULT_CACHE_POST_WRITE_CLEANUP_DELAY_MS);
      res.json({
        ok: true,
        filename,
        localUrl: outfitResultUrl(filename),
        bytes: req.file.size,
        mimeType: req.file.mimetype || mimeTypeFromFile(filename)
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "缓存结果图片失败"
      });
    }
  });

  app.get("/api/result/:filename", async (req, res) => {
    try {
      const filename = path.basename(decodeURIComponent(req.params.filename || ""));
      const file = outfitResultPath(filename);
      if (!existsSync(file)) return res.status(404).end();
      await streamLocalImageFile(req, res, file, {
        contentType: mimeTypeFromFile(filename),
        cacheControl: RESULT_CACHE_CONTROL
      });
    } catch {
      res.status(404).end();
    }
  });
}
