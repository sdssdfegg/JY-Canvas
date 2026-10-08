// 图片代理路由（V11-RF-211）
//
// 约定见 `system.routes.js` 文件头（批次 4 模板单，V11-RF-201），本文件照抄。
//
// 依赖注入表（本模块用到的每个外部符号 → 来源）：
//   app                                                            ← 形参
//   parseProxyTarget / streamExternalImageProxy /
//     downloadExternalImageWithFallback                            ← server/core/image-proxy.js
//   IMAGE_PROXY_TIMEOUT_MS                                         ← server/core/runtime-config.js
//   writeAssetLog                                                  ← server/core/generation-logger.js
// ⇒ **没有任何符号来自 index.js 作用域**。
//
// 🔴 白名单判定与拒绝路径**逐字保持**（执行单 §8）：
//   - `parseProxyTarget` 抛 `blocked_image_host` ⇒ 直接 **403**
//     `{ ok:false, message:"blocked_image_host" }`，且**不发起任何上游请求**；
//   - 其余解析失败 ⇒ **400** `{ ok:false, message:"图片地址无效" }`；
//   - `blocked_image_host` 的资产日志**仍要写**：
//     `writeAssetLog` 的 stage 名逐字为 `image-proxy-blocked-host`；
//   - 流式失败后回落到 `downloadExternalImageWithFallback`，
//     仍失败才 502，且响应里带 `error` / `rangeError` 两个字段。
//
// 🔴 **G-6**：本端点是**唯一允许的出图图片回传通道** ——
//    **不得新增第二个代理入口**。
//
// 🔴 不得改动 `core/image-proxy.js`、`src/shared/image-hosts.js`
//    （前后端白名单唯一真相源）。
//
import {
  parseProxyTarget,
  streamExternalImageProxy,
  downloadExternalImageWithFallback,
} from "../core/image-proxy.js";
import { IMAGE_PROXY_TIMEOUT_MS } from "../core/runtime-config.js";
import { writeAssetLog } from "../core/generation-logger.js";

export function registerImageProxyRoutes(app) {
  app.get("/api/image-proxy", async (req, res) => {
    let target;
    try {
      target = parseProxyTarget(req.query.url);
    } catch (error) {
      // 非白名单主机：直接回 403，**不发起任何上游请求**（避免无意义的 502 与等待）
      if (error instanceof Error && error.message === "blocked_image_host") {
        await writeAssetLog({
          time: new Date().toISOString(),
          ok: false,
          stage: "image-proxy-blocked-host",
          url: String(req.query.url || "").slice(0, 300),
          error: "blocked_image_host"
        }).catch(() => {});
        return res.status(403).json({ ok: false, message: "blocked_image_host" });
      }
      return res.status(400).json({ ok: false, message: "图片地址无效" });
    }
    void target;

    try {
      await streamExternalImageProxy(req, res, req.query.url, IMAGE_PROXY_TIMEOUT_MS);
      return;
    } catch (streamError) {
      if (res.headersSent) return;
      await writeAssetLog({
        time: new Date().toISOString(),
        ok: false,
        stage: "image-proxy-stream",
        url: String(req.query.url || "").slice(0, 500),
        error: streamError instanceof Error ? streamError.message : String(streamError || "")
      }).catch(() => {});
    }

    const imageDownload = await downloadExternalImageWithFallback(req.query.url, IMAGE_PROXY_TIMEOUT_MS).catch((error) => ({
      error
    }));
    if (res.headersSent) return;
    if (!imageDownload.error) {
      res.status(200);
      res.setHeader("Content-Type", imageDownload.mimeType || "application/octet-stream");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Content-Length", String(imageDownload.buffer.length));
      res.end(imageDownload.buffer);
      return;
    }

    return res.status(502).json({
      ok: false,
      message: "图片下载失败，请检查结果图源是否可访问",
      error: imageDownload.error instanceof Error ? imageDownload.error.message : String(imageDownload.error || ""),
      rangeError: imageDownload.error?.rangeError instanceof Error ? imageDownload.error.rangeError.message : undefined
    });
  });
}
