// 发布包图标校验：确认 exe 里真的嵌了 public/app-avatar.ico。
// 背景：封装脚本 scripts/secure-win-release.mjs 只有在 process.platform === "win32" 时
// 才会调 rcedit --set-icon；非 Windows 下会静默跳过并照样产出 exe（无图标、无版本号）。
// 因此出包后用本脚本做一次二进制指纹比对，避免"exe 能跑但没图标"。
// 用法：
//   node scripts/verify/release-icon-check.mjs
//   node scripts/verify/release-icon-check.mjs "D:\路径\静音AI画板.exe"
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const iconFile = path.join(rootDir, "public", "app-avatar.ico");
const defaultExe = path.join(path.resolve(rootDir, ".."), "静音AI画板（v5.0）", "静音AI画板.exe");
const exePath = path.resolve(process.argv[2] || defaultExe);

const fail = (message) => {
  console.error(`FAIL ${message}`);
  process.exit(1);
};

if (!existsSync(iconFile)) {
  fail(`图标源文件不存在：${iconFile}（exe 一定没图标）`);
}
if (!existsSync(exePath)) {
  fail(`exe 不存在：${exePath}`);
}

const iconBytes = readFileSync(iconFile);
const exeBytes = readFileSync(exePath);
// 跳过 ICO 头部，取中间 512 字节做指纹（这部分是真正的图像数据，会原样落进 PE 资源）。
const probe = iconBytes.subarray(2048, 2560);
const offset = exeBytes.indexOf(probe);

console.log(`图标源文件: ${iconFile} (${iconBytes.length} 字节)`);
console.log(`目标 exe  : ${exePath}`);
console.log(`exe 大小  : ${(statSync(exePath).size / 1024 / 1024).toFixed(2)} MB (${statSync(exePath).size} 字节)`);

if (offset < 0) {
  fail("exe 内未找到图标数据 —— 图标未注入。检查：①脚本是否在 Windows 上跑；②public/app-avatar.ico 是否存在；③rcedit 步骤是否被跳过/注释。详见 docs/V4.0-二进制封装-图标与版本信息.md");
}

console.log(`图标指纹命中，exe 内偏移：${offset}`);
console.log("PASS 图标已注入");

// ---- 子系统检查：必须是 GUI(2)，不能是 CONSOLE(3) ----
// 背景：本发布包是 Node SEA 单文件 exe（基于 node.exe 复制，默认控制台子系统），
// 若是控制台子系统，运行后任务栏/窗口会显示黑色控制台框图标并弹出黑色控制台窗口。
// secure-win-release.mjs 在 Windows 构建时会把子系统从 3 改成 2；这里兜底校验，防止回归。
function readPeSubsystem(exeBuf) {
  if (exeBuf.length < 0x68 || exeBuf.readUInt16LE(0) !== 0x5A4D) return null; // 非 MZ 头（非 PE）
  const peOff = exeBuf.readUInt32LE(0x3C);
  const optOff = peOff + 4 + 20;
  if (exeBuf.length < optOff + 0x48) return null;
  if (exeBuf.toString("ascii", peOff, peOff + 4) !== "PE\0\0") return null;
  const magic = exeBuf.readUInt16LE(optOff);
  if (magic !== 0x10b && magic !== 0x20b) return null;
  return exeBuf.readUInt16LE(optOff + 0x44);
}

const subsystem = readPeSubsystem(exeBytes);
if (subsystem === null) {
  console.log("SKIP 子系统检查：当前 exe 不是可识别的 PE 文件（可能非 Windows 平台产物），跳过");
} else if (subsystem === 2) {
  console.log("PASS 子系统 = GUI(2)：任务栏/窗口显示软件图标，无黑色控制台框");
} else {
  fail(`子系统 = ${subsystem}（非 GUI）。期望 GUI(2)。运行后任务栏会显示黑色控制台框；请确认 secure-win-release.mjs 的 patchPeSubsystemToGui 步骤已执行。`);
}

