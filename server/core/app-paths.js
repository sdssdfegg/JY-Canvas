// 应用路径层：唯一负责决定"数据放在哪、tmp 放哪、静态资源在哪"的地方。
//
// 从 server/index.js 原样搬来（原第 68~98 行），**没有任何逻辑改动**。
// 之所以单独成文件：这一段决定了打包版 / 开发版 / macOS 版的数据根目录，
// 是整个后端里最底层的依赖，谁都要用它；留在 index.js 里就意味着
// "只要想知道路径怎么算，就得先读通 5799 行"。
//
// 这里全部是同步计算、没有副作用、也没有网络依赖，
// 所以可以被任意模块安全地 import。
//
// 打包形态识别顺序（改这里等于改部署行为，务必谨慎）：
//   1. JINGYIN_RELEASE_ROOT 环境变量（最高优先级，用于测试与定制部署）
//   2. macOS .app 包         → <App 同级>/静音AI绘画数据
//   3. Windows 打包 exe      → %LOCALAPPDATA%/静音AI绘画数据
//   4. 可执行目录自带 dist/  → 该目录本身
//   5. 源码开发模式          → 仓库根目录
//      （本文件已从 server/ 搬到 server/core/，故"仓库根"需上溯两级，见下方 sourceRootDir 注释）

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runtimeFile = typeof require !== "undefined" && typeof __filename !== "undefined"
  ? __filename
  : fileURLToPath(import.meta.url);
const runtimeDir = path.dirname(runtimeFile);
// 注意：本文件最初位于 server/，后来搬到 server/core/。
// 源码兜底分支必须回到"仓库根"，从 server/core/ 需上溯两级
// （runtimeDir 即 server/core，".." 到 server，"..",".." 才到仓库根）。
// 当初在 server/ 时只需一级；若改回一级，rootDir 会落到 server/，
// data/logs 就会污染源码树（正是 V11-RF-011 要修的缺陷）——勿动。
const sourceRootDir = path.resolve(runtimeDir, "..", "..");
const executableRootDir = process.execPath ? path.dirname(process.execPath) : "";
const executableName = path.basename(process.execPath || "").toLowerCase();
const isMacAppBundleExecutable = process.platform === "darwin"
  && executableRootDir.replace(/\\/g, "/").endsWith(".app/Contents/MacOS");
const macAppDir = isMacAppBundleExecutable ? path.resolve(executableRootDir, "../..") : "";
const macAppDataRoot = macAppDir ? path.join(path.dirname(macAppDir), "静音AI绘画数据") : "";
const looksLikePackagedExecutable = Boolean(executableRootDir)
  && !["node", "node.exe"].includes(executableName);
const windowsPackagedDataRoot = process.platform === "win32" && looksLikePackagedExecutable
  ? path.join(process.env.LOCALAPPDATA || process.env.APPDATA || executableRootDir, "静音AI绘画数据")
  : "";
export const packagedRootDir = executableRootDir && (
  existsSync(path.join(executableRootDir, "dist", "index.html")) || looksLikePackagedExecutable
)
  ? executableRootDir
  : "";

export const rootDir = path.resolve(process.env.JINGYIN_RELEASE_ROOT || macAppDataRoot || windowsPackagedDataRoot || packagedRootDir || sourceRootDir);
export const dataDir = path.join(rootDir, "data");
export const historyFile = path.join(dataDir, "history.json");
export const historyBackupFile = path.join(dataDir, "history.backup.json");
export const historyImageDir = path.join(dataDir, "history-images");
export const referenceAssetDir = path.join(dataDir, "reference-assets");
export const canvasAssetDir = path.join(dataDir, "canvas-assets");
export const resultDir = path.join(dataDir, "results");
export const uploadTempDir = path.join(rootDir, "tmp", "uploads");
export const appSettingsFile = path.join(dataDir, "app-settings.json");
