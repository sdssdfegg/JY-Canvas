import { existsSync } from "node:fs";
import path from "node:path";
import { rootDir } from "./core/app-paths.js";
import { PORT } from "./core/runtime-config.js";
import { attachFrontend, listenOnPort } from "./app.js";

// 发布版（打包 exe / 以 release 模式构建）运行时必须命中 production 分支，
// 否则 server/app.js 的 attachFrontend() 会拉起 vite dev server（启动进入慢）。
// 标记由 scripts/secure-win-release.mjs 在构建后写入：
//   - dist/.release-mode        → 覆盖 `node server/index.js` 直接运行（rootDir=仓库根）
//   - <exe 目录>/.release-mode   → 覆盖打包 exe（rootDir 运行时解析到数据目录，dist 不在其下）
// dev 模式两者都不存在 ⇒ 不置 production ⇒ 仍走 vite dev server（HMR 正常）。
if (!process.env.NODE_ENV) {
  const markerInDist = existsSync(path.join(rootDir, "dist", ".release-mode"));
  const markerNextToExe = existsSync(path.join(path.dirname(process.execPath), ".release-mode"));
  if (markerInDist || markerNextToExe) {
    process.env.NODE_ENV = "production";
  }
}

attachFrontend().then(() => {
  listenOnPort(PORT);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
