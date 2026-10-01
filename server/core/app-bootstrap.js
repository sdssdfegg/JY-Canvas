// 启动路径（V11-RF-116）。
//
// 从 server/index.js 原样搬来，逐字节等价，调用点零改动。
// 唯一允许的签名例外（G-8）：启动函数通过工厂 createAppBootstrap(app) 接收 app 参数；
// express 实例仍由 server/index.js 创建，本模块**绝不自行 express() 第二个实例**
// —— 否则中间件与全部路由脱钩，灾难性静默失败。
//
// 关键不变量（行为变更 = 双击启动器表现异常 / 端口占用分支失效）：
//   - EADDRINUSE 且 remainingFallbacks > 0 → port + 1、100ms 后重试；
//   - EADDRINUSE 且允许自动开浏览器 → 打印「已打开现有实例」并 process.exitCode = 0
//     （不是 process.exit()，这是 014 修过的坑）；
//   - server.requestTimeout / headersTimeout(+30000) / keepAliveTimeout(65000) / timeout 四个数值逐字保持；
//   - sendEmbeddedStaticAsset 的命中判定与返回逐字保持（它是 attachFrontend 的资源回落依赖）；
//   - resultCacheCleanupStarted 是进程级单例状态，门禁 state-singleton-check 监视它
//     「全服务端只有 1 处声明」且必须位于本文件。

import { spawn } from "node:child_process";
import path from "node:path";
import {
  PORT,
  PORT_FALLBACK_LIMIT,
  LOCAL_HTTP_TIMEOUT_MS
} from "./runtime-config.js";
import { packagedRootDir } from "./app-paths.js";
import { EMBEDDED_STATIC_ASSETS } from "./static-assets.generated.js";
import { startResultCacheCleanup } from "./result-cache.js";

// 进程级单例（门禁监视目标，全服务端只允许这一处声明）。
let resultCacheCleanupStarted = false;

export function shouldAutoOpenBrowser() {
  return process.env.JINGYIN_NO_BROWSER !== "1" && (
    Boolean(packagedRootDir) || process.env.JINGYIN_OPEN_BROWSER === "1"
  );
}

export function openAppInBrowser(port = PORT) {
  if (!shouldAutoOpenBrowser()) return;
  const url = `http://127.0.0.1:${port}/`;
  const command = process.platform === "win32"
    ? { file: "cmd.exe", args: ["/c", "start", "", url] }
    : process.platform === "darwin"
      ? { file: "open", args: [url] }
      : { file: "xdg-open", args: [url] };
  try {
    const child = spawn(command.file, command.args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
  } catch {
    // Opening the browser is a convenience; the local server still works without it.
  }
}

export function sendEmbeddedStaticAsset(req, res) {
  const files = EMBEDDED_STATIC_ASSETS?.files;
  if (!files) return false;

  let pathname = "/";
  try {
    pathname = new URL(req.originalUrl || req.url || "/", "http://127.0.0.1").pathname;
  } catch {
    pathname = "/";
  }

  const normalizedPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const asset = files[normalizedPath] || (!path.extname(normalizedPath) ? files["/index.html"] : null);
  if (!asset) return false;

  const body = Buffer.from(asset.data, "base64");
  res.status(200)
    .set({
      "Content-Type": asset.type || "application/octet-stream",
      "Content-Length": String(body.length),
      "Cache-Control": normalizedPath.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache"
    })
    .end(body);
  return true;
}

function startResultCacheCleanupOnce() {
  if (resultCacheCleanupStarted) return;
  resultCacheCleanupStarted = true;
  startResultCacheCleanup();
}

function configureHttpServer(server) {
  server.requestTimeout = LOCAL_HTTP_TIMEOUT_MS;
  server.headersTimeout = LOCAL_HTTP_TIMEOUT_MS + 30000;
  server.keepAliveTimeout = 65000;
  server.timeout = LOCAL_HTTP_TIMEOUT_MS;
}

export function createAppBootstrap(app) {
  function listenOnPort(port, remainingFallbacks = PORT_FALLBACK_LIMIT) {
    const server = app.listen(port, "127.0.0.1", () => {
      console.log(`Jingyin AI Canvas http://127.0.0.1:${port}`);
      startResultCacheCleanupOnce();
      openAppInBrowser(port);
    });
    configureHttpServer(server);
    server.on("error", (error) => {
      if (error?.code === "EADDRINUSE" && remainingFallbacks > 0) {
        const nextPort = port + 1;
        console.warn(`Port ${port} is already in use, trying ${nextPort}.`);
        setTimeout(() => listenOnPort(nextPort, remainingFallbacks - 1), 100);
        return;
      }
      if (error?.code === "EADDRINUSE" && shouldAutoOpenBrowser()) {
        console.error(`Port ${port} is already in use. Opened the existing local app instead.`);
        openAppInBrowser(port);
        process.exitCode = 0;
        return;
      }
      console.error(error);
      process.exitCode = 1;
    });
    return server;
  }

  return {
    configureHttpServer,
    listenOnPort,
    openAppInBrowser,
    shouldAutoOpenBrowser,
    startResultCacheCleanupOnce
  };
}
