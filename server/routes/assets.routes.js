// 历史图 / 参考图 / 画布资源路由（V11-RF-207）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                                      ← 形参
//   historyImagePath / referenceAssetPath / canvasAssetPath                  ← server/core/asset-urls.js
//   streamLocalImageFile                                                    ← server/core/local-image-stream.js
//   upload                                                                  ← server/core/uploads.js
//   mimeTypeFromFile / imageExtensionFromType                               ← server/core/file-naming.js
// ⇒ **没有任何符号来自 index.js 作用域**。
//
// 🔴 **路径穿越防护在 core 层，不在本文件** —— 这是本单最容易误判的地方：
//    `:filename` 的清洗（`sanitizeFilePart` / `path.basename` 口径）由
//    `core/asset-urls.js` 的 historyImagePath / referenceAssetPath / canvasAssetPath 完成；
//    本文件只是把 `req.params.filename` 原样交给它们，**不做任何自己的拼接或放行**。
//    `canvas-asset-check` 里 `../data/history.json` 那条用例钉的就是 core 的防护，
//    搬动本文件时**不得改动 core/asset-urls.js**，也不得在这里"顺手加一层"解析
//    （加不加都会改变既有的拒绝口径）。
//
// 逐字保留：
//   - 三条 404 文案各自不同：`历史图片不存在` / `reference_asset_not_found` /
//     `canvas_asset_not_found`（**不得合并成一个**）；
//   - `POST /api/canvas-assets` 空上传 ⇒ `400 missing_canvas_assets`；
//     catch ⇒ `400`，message 取 `error.message` 否则 `canvas_asset_upload_failed`；
//   - 回的是 **data URL**（`data:<mime>;base64,...`），`filename` 恒为空串 ——
//     这是 2026-09-25 第 4b 轮的既定行为，**不得把落盘写回来**；
//   - `id` 的 `canvas_asset_${createdAt}_${index}` 生成规则不变。
//
// 📌 关于执行单 §4 提到的「18 行旧实现」：经实测**它已经不存在** ——
//    `scripts/verify/canvas-asset-check.mjs` 头注释第 5-7 行自证：那段不可达代码
//    与专用的 `canvasAssetUrl()` 已在 2026-09-25 第 4b 轮删除，只保留了本文件的
//    `GET /api/canvas-asset/:filename` 路由（用于兼容历史链接）。
//    故本单**没有冗余可搬**，也就谈不上"顺手删"。
import {
  canvasAssetPath,
  historyImagePath,
  referenceAssetPath,
} from "../core/asset-urls.js";
import { streamLocalImageFile } from "../core/local-image-stream.js";
import { upload } from "../core/uploads.js";
import {
  imageExtensionFromType,
  mimeTypeFromFile,
} from "../core/file-naming.js";

export function registerAssetsRoutes(app) {
  app.get("/api/history-image/:filename", async (req, res) => {
    try {
      const file = historyImagePath(req.params.filename);
      await streamLocalImageFile(req, res, file);
    } catch {
      res.status(404).json({ ok: false, message: "历史图片不存在" });
    }
  });

  app.get("/api/reference-asset/:filename", async (req, res) => {
    try {
      const file = referenceAssetPath(req.params.filename);
      await streamLocalImageFile(req, res, file);
    } catch {
      res.status(404).json({ ok: false, message: "reference_asset_not_found" });
    }
  });

  app.post("/api/canvas-assets", upload.array("image", 12), async (req, res) => {
    try {
      const files = (req.files || []).filter((file) => file?.buffer?.length);
      if (files.length === 0) {
        return res.status(400).json({ ok: false, message: "missing_canvas_assets" });
      }

      const createdAt = Date.now();
      // 现在直接回 data URL：前端把画布资源随请求带上就行，不需要服务端落盘。
      // （旧实现是写 data/canvas-assets 再回 /api/canvas-asset/xxx；那段代码已经删掉，
      //  但 GET /api/canvas-asset/:filename 路由保留，用于兼容历史链接。）
      return res.json({
        ok: true,
        assets: files.map((file, index) => {
          const mimeType = file.mimetype || mimeTypeFromFile(file.originalname || "");
          return {
            id: `canvas_asset_${createdAt}_${index}`,
            name: file.originalname || `canvas-${index + 1}.${imageExtensionFromType(mimeType, file.originalname)}`,
            filename: "",
            url: `data:${mimeType};base64,${file.buffer.toString("base64")}`,
            mimeType,
            size: file.size,
            createdAt: createdAt + index
          };
        })
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        message: error instanceof Error ? error.message : "canvas_asset_upload_failed"
      });
    }
  });

  app.get("/api/canvas-asset/:filename", async (req, res) => {
    try {
      await streamLocalImageFile(req, res, canvasAssetPath(req.params.filename));
    } catch {
      res.status(404).json({ ok: false, message: "canvas_asset_not_found" });
    }
  });
}
