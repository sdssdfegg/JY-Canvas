// 应用装配层（V11-RF-220）：中间件 + 路由注册 + 前端挂载，全部集中在这里。
// server/index.js 只保留**进程入口的唯一动作**（挂载前端 -> 监听端口）。
//
// 为什么要拆：220 之前 index.js 同时承担「装配」与「启动」两件事，
// 任何路由改动都要在一个同时负责进程生命周期的文件里动刀。拆开后：
//   - app.js  **可以**被测试/脚本单独 import（不需要真的监听端口）；
//   - index.js 只有 7 行，且**不再承载任何路由与业务逻辑**。
//
// 🔴 与 index.js 同级 ⇒ **所有相对 import 路径逐字未改**（本单是纯搬移）。
// 🔴 注册顺序：中间件与路由的注册顺序与搬家前**自上而下完全一致**
//    （见 commit message 的「旧顺序 → 新顺序」对照表）。
//
import "dotenv/config";
import express from "express";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
// 图片地址判定与前端共用同一份（发布时 esbuild 会把 src/shared 内联进 server bundle）。
// 注意：这只管"图片回传"；生图 API 仍然只允许官方中转，见 PRIMARY_CHANNEL_API_BASE_URL。

import { rootDir } from "./core/app-paths.js";

import { gatewayCompressionMiddleware } from "./core/http-compression.js";

import { createAppBootstrap, sendEmbeddedStaticAsset } from "./core/app-bootstrap.js";
const app = express();
const { listenOnPort } = createAppBootstrap(app);

import { generationRequestTraceMiddleware } from "./core/generation-trace.js";
// logProcessFault 仍被下方两个 process.on 使用 ⇒ **不要当孤儿删掉**。
import { logProcessFault } from "./core/generation-logger.js";

import { registerSystemRoutes } from "./routes/system.routes.js";
import { registerDebugRoutes } from "./routes/debug.routes.js";
import { registerVideosRoutes } from "./routes/videos.routes.js";
import { registerPromptsRoutes } from "./routes/prompts.routes.js";
import { registerHistoryRoutes } from "./routes/history.routes.js";
import { registerStorageRoutes } from "./routes/storage.routes.js";
import { registerAssetsRoutes } from "./routes/assets.routes.js";
import { registerSaveRoutes } from "./routes/save.routes.js";
import { registerDetailRoutes } from "./routes/detail.routes.js";
import { registerOutfitAnalysisRoutes } from "./routes/outfit-analysis.routes.js";
import { registerImageProxyRoutes } from "./routes/image-proxy.routes.js";
import { registerImagesRoutes } from "./routes/images.routes.js";
import { registerOutfitRoutes } from "./routes/outfit.routes.js";

app.use(express.json({ limit: "100mb" }));
app.use(gatewayCompressionMiddleware);
app.use(generationRequestTraceMiddleware);

process.on("unhandledRejection", (reason) => {
  logProcessFault("process-unhandled-rejection", reason);
});

process.on("uncaughtException", (error) => {
  logProcessFault("process-uncaught-exception", error);
});

/**
 * 图片下载/代理允许的目标主机。
 *
 * 2026-09-25 修订（按产品口径）：**生图 API 仍然只允许官方中转**（那是
 * PRIMARY_CHANNEL_API_BASE_URL 管的，见图片转发路径），但**图片回传不限域名**——
 * 官方中转后面挂着 N 个渠道，每个渠道的成图在各自的 CDN 上
 * （实测：leo.yunshuaiapi.com、tos.lingkeai.vip、api.luckfill.com…）。
 * 之前这里拿"渠道 API 主机"当图片白名单，导致这些真实结果图被判 blocked_image_host、
 * 显示缓存失败、前端只能拿到无法加载的原始地址（表现为"图片下载失败 HTTP 403"）。
 *
 * 现在这里只挡两件事：非 https、以及本地/内网主机（SSRF）。
 * 判定与前端共用同一份实现（src/shared/image-hosts.js），发布时由 esbuild 内联进 bundle。
 */

registerSystemRoutes(app);

registerDebugRoutes(app);

registerVideosRoutes(app);

registerPromptsRoutes(app);

registerHistoryRoutes(app);

registerStorageRoutes(app);

registerAssetsRoutes(app);

registerSaveRoutes(app);

registerDetailRoutes(app);

registerOutfitRoutes(app);
registerOutfitAnalysisRoutes(app);

registerImageProxyRoutes(app);

registerImagesRoutes(app);

async function attachFrontend() {
  if (process.env.NODE_ENV === "production") {
    const distDir = path.join(rootDir, "dist");
    const hasDiskFrontend = existsSync(path.join(distDir, "index.html"));
    if (hasDiskFrontend) {
      app.use(express.static(distDir));
      app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
      return;
    }
    app.get("*", (req, res, next) => {
      if (sendEmbeddedStaticAsset(req, res)) return;
      next();
    });
    return;
  }

  const { createServer } = await import("vite");
  const vite = await createServer({
    root: rootDir,
    // 缓存目录刻意不用 vite 默认的 `node_modules/.vite`：
    // 2026-10-02 白屏事故 —— 多个 server 实例（用户正在用的那个，加上 verify 套件起的
    // 十几个测试实例）同时走 attachFrontend() 拉起各自的 vite dev server，共用同一个
    // 默认缓存目录互相清空，把正在跑的实例预构建产物踩成 `optimized: {}`，
    // 页面拿旧 browserHash 去取 react/react-dom ⇒ 504 Outdated Optimize Dep ⇒ 整页白屏。
    // 挪出 node_modules（那里本就是 npm 的地盘）可用根目录独享一份，
    // verify 脚本再通过 JINGYIN_VITE_CACHE_DIR 指到自己的沙盒里，两边永不互踩。
    cacheDir: process.env.JINGYIN_VITE_CACHE_DIR || path.join(rootDir, ".vite-cache"),
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
  app.get("*", async (req, res, next) => {
    try {
      const template = await readFile(path.join(rootDir, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

export { app, listenOnPort, attachFrontend };
