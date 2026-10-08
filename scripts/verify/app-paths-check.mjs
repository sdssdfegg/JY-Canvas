// app-paths 取值断言（V11-RF-011 交付物，纯进程内、不 spawn）。
//
// 覆盖三件事：
//   1) 源码兜底分支：未设 JINGYIN_RELEASE_ROOT 时，rootDir 必须等于仓库根
//      （这是本单修复目标——Phase 1 把 app-paths 从 server/ 搬到 server/core/ 后，
//       上溯一级会从仓库根变成 server/，data/logs 会落进源码树）；
//   2) 落点：dataDir / 日志目录 / uploadTempDir / appSettingsFile 必须都落在 rootDir 下；
//   3) 优先级最高分支：设了 JINGYIN_RELEASE_ROOT 后，rootDir 必须等于该值
//      （证明打包分支优先级链未被破坏，沙盒等价差分依赖的开关仍最高优先）。
//
// 不依赖 process.cwd()：仓库根由本脚本自身位置（scripts/verify）上溯两级得到，
// 无论从哪个目录调用，结果都一致。macOS / Windows 打包分支靠静态审查
// （优先级链逐字未改）保证，不在此处伪造。
//
// 退出码：通过 0 / 失败 1。失败时打印实际解析值（有判别力），不只报"不相等"。

import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// scripts/verify -> .. -> scripts -> .. -> 仓库根
const repoRoot = path.resolve(here, "..", "..");
const appPathsPath = path.join(repoRoot, "server", "core", "app-paths.js");

const failures = [];
function assert(cond, label, detail) {
  if (cond) {
    console.log("  ok   " + label);
  } else {
    failures.push({ label, detail });
    console.log("  FAIL " + label + "  =>  " + detail);
  }
}

// 加载 app-paths（可指定 JINGYIN_RELEASE_ROOT；用 query 缓存破坏强制重新求值）。
async function loadAppPaths(releaseRoot) {
  const prev = process.env.JINGYIN_RELEASE_ROOT;
  if (releaseRoot === undefined) {
    delete process.env.JINGYIN_RELEASE_ROOT;
  } else {
    process.env.JINGYIN_RELEASE_ROOT = releaseRoot;
  }
  const mod = await import(pathToFileURL(appPathsPath).href + "?t=" + Date.now());
  if (prev === undefined) {
    delete process.env.JINGYIN_RELEASE_ROOT;
  } else {
    process.env.JINGYIN_RELEASE_ROOT = prev;
  }
  return mod;
}

console.log("[app-paths-check] 仓库根推断: " + repoRoot);

// ---- 1) 源码兜底分支 ----
const ap = await loadAppPaths(undefined);
console.log("[1] 源码兜底分支 rootDir 应等于仓库根");
assert(
  path.resolve(ap.rootDir) === path.resolve(repoRoot),
  "rootDir === 仓库根",
  "rootDir=" + ap.rootDir + "  (期望 " + repoRoot + ")"
);

// ---- 2) 落点必须落在 rootDir 下 ----
console.log("[2] 落点必须落在 rootDir 下");
assert(
  path.resolve(ap.dataDir) === path.resolve(path.join(ap.rootDir, "data")),
  "dataDir === rootDir/data",
  "dataDir=" + ap.dataDir
);
// 日志目录：generation-logger 用 path.join(rootDir, \"logs\")，故其落点必须等于 仓库根/logs
const expectedLogsDir = path.join(repoRoot, "logs");
assert(
  path.resolve(path.join(ap.rootDir, "logs")) === path.resolve(expectedLogsDir),
  "日志目录 === 仓库根/logs",
  "日志目录=" + path.join(ap.rootDir, "logs") + "  (期望 " + expectedLogsDir + ")"
);
assert(
  path.resolve(ap.uploadTempDir) === path.resolve(path.join(ap.rootDir, "tmp", "uploads")),
  "uploadTempDir === rootDir/tmp/uploads",
  "uploadTempDir=" + ap.uploadTempDir
);
assert(
  path.resolve(ap.appSettingsFile) === path.resolve(path.join(ap.rootDir, "data", "app-settings.json")),
  "appSettingsFile === rootDir/data/app-settings.json",
  "appSettingsFile=" + ap.appSettingsFile
);

// ---- 3) JINGYIN_RELEASE_ROOT 优先级最高 ----
const fakeRoot = path.join(os.tmpdir(), "rf011-fake-release-root-" + process.pid);
const ap2 = await loadAppPaths(fakeRoot);
console.log("[3] JINGYIN_RELEASE_ROOT 优先级应最高");
assert(
  path.resolve(ap2.rootDir) === path.resolve(fakeRoot),
  "rootDir === JINGYIN_RELEASE_ROOT",
  "rootDir=" + ap2.rootDir + "  (期望 " + fakeRoot + ")"
);

if (failures.length > 0) {
  console.error("\n[app-paths-check] 失败 " + failures.length + " 项：");
  for (const f of failures) {
    console.error("  - " + f.label + ": " + f.detail);
  }
  process.exit(1);
}
console.log("\n[app-paths-check] ok:true");
process.exit(0);
