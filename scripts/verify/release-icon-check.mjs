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
