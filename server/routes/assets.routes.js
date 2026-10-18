// 历史图 / 参考图路由（V11-RF-207）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                                      ← 形参
//   historyImagePath / referenceAssetPath                                    ← server/core/asset-urls.js
//   streamLocalImageFile                                                    ← server/core/local-image-stream.js
//
// 🔴 **路径穿越防护在 core 层，不在本文件** —— 这是本单最容易误判的地方：
//    `:filename` 的清洗（`sanitizeFilePart` / `path.basename` 口径）由
//    `core/asset-urls.js` 的 historyImagePath / referenceAssetPath 完成；
//    本文件只是把 `req.params.filename` 原样交给它们，**不做任何自己的拼接或放行**。
//    搬动本文件时**不得改动 core/asset-urls.js**，也不得在这里"顺手加一层"解析
//    （加不加都会改变既有的拒绝口径）。
//
// 逐字保留：
//   - 两条 404 文案各自不同：`历史图片不存在` / `reference_asset_not_found`
//     （**不得合并成一个**）。
//
// 📌 历史/参考图两条 GET 路由只做「按 filename 取流」，不拼接、不放行；
//    路径穿越防护在 core 层，本文件原样透传 `req.params.filename`。
import {
  historyImagePath,
  referenceAssetPath,
} from "../core/asset-urls.js";
import { streamLocalImageFile } from "../core/local-image-stream.js";

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
}
