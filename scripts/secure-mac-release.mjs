// Mac 封装脚本（镜像 secure-win-release.mjs 的流水线，但产物为 Mach-O + .app 包 + 签名 + 公证 + .dmg）。
//
// 这是「Mac 原生」流水线：依赖 codesign / hdiutil / xcrun notarytool（仅 macOS 有），且 SEA 注入用 Mach-O 段。
// 如果你**没有 Mac**，用 `scripts/build-mac-cross.mjs`——它能在 Windows / Linux 上产出完整的 `.app` + `.zip`
// （下载 macOS Node 二进制 + 跨平台 postject + 跨平台 rcodesign 签名 + zip），包文件本身不要求 Mac 机器。
// 详见 docs/封装/MAC封装说明.md §3b。
//
// ⚠️ 本脚本（原生版）**必须在 macOS 上运行**。在 Windows / Linux 上直接退出并给出说明。
//
// Mac 专属注意事项（详见 docs/封装/MAC封装说明.md）：
//   1. 构建机用户名 / 项目路径必须是纯 ASCII 且无空格（node-gyp / codesign / postject / 部分 CLI 对中文或空格路径脆弱）。
//      本脚本开头会做路径合规检查，命中即退出。本项目无原生模块，npm install 不会触发 node-gyp，
//      但仍是防御性最佳实践。
//   2. 必须代码签名 + 公证（Developer ID 证书），否则分发出去别人双击报"应用已损坏"。
//   3. codesign 必须带 entitlements（allow-jit / allow-unsigned-executable-memory），否则 Apple Silicon 启动即 SIGKILL。
//   4. SEA 注入：postject 必须加 --macho-segment-name NODE_SEA，且注入前先 codesign --remove-signature。
//   5. 架构默认跟构建机（Apple Silicon = arm64）。要兼顾 Intel Mac 需做 universal（lipo 合二为一）。
//
// 环境变量（均可选，带默认值）：
//   JINGYIN_MAC_RELEASE_NAME      发布目录名（默认「静音AI画板 Mac版」）
//   JINGYIN_MAC_PRODUCT_VERSION   版本号（默认 package.json version）
//   JINGYIN_MAC_APP_NAME          .app 目录名（ASCII，默认 JingyinAIBoard）
//   JINGYIN_MAC_EXE_NAME          Contents/MacOS 下可执行文件名（ASCII，默认 JingyinBoard）
//   JINGYIN_MAC_BUNDLE_ID         CFBundleIdentifier（默认 com.jingyin.aiboard）
//   JINGYIN_MAC_ICON              .icns 图标路径（默认尝试 public/app-avatar.icns，再尝试由 webp/png 生成）
//   JINGYIN_MAC_RELEASE_DIR       发布目录（默认仓库同级）
//   JINGYIN_MAC_SIGN_IDENTITY     Developer ID Application 身份串；为空则做 ad-hoc 签名（仅本机可跑）
//   JINGYIN_MAC_NOTARIZE=1        开启公证（需下面三个 APPLE_* 变量）
//   APPLE_ID / APPLE_APP_PASSWORD / APPLE_TEAM_ID   公证凭据
//   JINGYIN_MAC_AGENT=1           设为 agent app（无 Dock 图标，LSUIElement=true）

import JavaScriptObfuscator from "javascript-obfuscator";
import { build as esbuild } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import {
  copyFile, mkdir, readFile, readdir, rm, stat, writeFile, chmod, realpath
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  SEED_ENTRY_IDS,
  OUTFIT_PAGE_FORBIDDEN_FIELDS,
  PROMPT_PRESET_ALLOWED_FIELDS,
  containsCredentialFields,
  containsImageRecords
} from "../src/shared/release-seed-schema.js";

// —— 平台门禁 ——
if (process.platform !== "darwin" && !process.argv.includes("--plan")) {
  console.error(
    "✋ 本脚本必须在 macOS 上运行（需要 codesign / hdiutil / xcrun notarytool，且 SEA 注入使用 Mach-O 段）。\n" +
    "   请在 Mac 构建机上执行：node scripts/secure-mac-release.mjs\n" +
    "   若只想看计划，可加 --plan（跳过实际执行，仅打印将做什么）。"
  );
  process.exit(2);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(rootDir, ".secure-build-mac");
const releaseParentDir = path.resolve(rootDir, "..");
const releaseName = String(process.env.JINGYIN_MAC_RELEASE_NAME || "静音AI画板 Mac版").trim();
const productName = "静音AI画板";
const productVersion = String(process.env.JINGYIN_MAC_PRODUCT_VERSION || JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")).version).trim();
const appName = String(process.env.JINGYIN_MAC_APP_NAME || "JingyinAIBoard").trim();
const exeName = String(process.env.JINGYIN_MAC_EXE_NAME || "JingyinBoard").trim();
const bundleId = String(process.env.JINGYIN_MAC_BUNDLE_ID || "com.jingyin.aiboard").trim();
const defaultReleaseDir = path.join(releaseParentDir, releaseName);
const releaseDir = path.resolve(process.env.JINGYIN_MAC_RELEASE_DIR || defaultReleaseDir);
const appBundleDir = path.join(releaseDir, `${appName}.app`);
const appMacOsDir = path.join(appBundleDir, "Contents", "MacOS");
const appResourcesDir = path.join(appBundleDir, "Contents", "Resources");
const appExe = path.join(appMacOsDir, exeName);
const appIconName = "app-avatar"; // 对应 Resources/app-avatar.icns
const signIdentity = process.env.JINGYIN_MAC_SIGN_IDENTITY || "";
const notarize = process.env.JINGYIN_MAC_NOTARIZE === "1";
const agentApp = process.env.JINGYIN_MAC_AGENT === "1";
const distDir = path.join(rootDir, "dist");

const serverBundle = path.join(buildDir, "server.bundle.cjs");
const protectedServerBundle = path.join(buildDir, "server.protected.cjs");
const seaConfigFile = path.join(buildDir, "sea-config.json");
const seaBlob = path.join(buildDir, "jingyin-sea.blob");
const releaseId = `secure-mac-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const entitlementsFile = path.join(rootDir, "scripts", "entitlements.mac.plist");
const dmgPath = path.join(releaseDir, `${appName}.dmg`);

function ensureInsideRoot(target, allowedRoot) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(allowedRoot);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative && (relative.startsWith("..") || path.isAbsolute(relative))) {
    throw new Error(`Refusing to touch path outside ${resolvedRoot}: ${target}`);
  }
}
function ensureChildPath(target, allowedRoot) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(allowedRoot);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to use unsafe release path outside ${resolvedRoot}: ${target}`);
  }
}

// —— 路径合规检查（Mac「英文路径」防御）——
// 构建机用户名、项目路径含非 ASCII 或空格，会让 node-gyp / codesign / postject 等 CLI 失败。
function assertSafePath(p, label) {
  if (/[^\x20-\x7E]/.test(p)) {
    throw new Error(
      `${label} 含非 ASCII 字符：「${p}」\n` +
      "   Mac 构建机的用户名或项目路径必须是纯英文（ASCII）。\n" +
      "   请把仓库放到纯英文路径（如 /Users/<ascii>/dev/jingyin），或在 /opt/build 之类纯英文目录下构建。"
    );
  }
  if (p.includes(" ")) {
    throw new Error(
      `${label} 含空格：「${p}」\n` +
      "   Mac 构建机路径不能有空格（node-gyp / codesign / postject 等对空格路径脆弱）。\n" +
      "   请把仓库放到无空格的纯英文路径下再构建。"
    );
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: { ...process.env, ...options.env },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

async function obfuscateFile(file, options) {
  const source = await readFile(file, "utf8");
  const result = JavaScriptObfuscator.obfuscate(source, options).getObfuscatedCode();
  await writeFile(file, `${result}\n`, "utf8");
}

async function sha256(file) {
  const data = await readFile(file);
  return createHash("sha256").update(data).digest("hex").toUpperCase();
}

// —— 封装种子注入（镜像 secure-win-release.mjs §1.2；仅当仓库 seed/manifest.json 存在时）——
async function injectReleaseSeedIntoDist() {
  const seedFilePath = path.join(rootDir, "seed", "manifest.json");
  if (!existsSync(seedFilePath)) {
    if (process.env.JINGYIN_SEED_ALLOW_MISSING === "1") {
      console.warn("   未找到 seed/manifest.json：工厂包（不含开发者最新板块）。");
      return;
    }
    throw new Error(
      "   未找到 seed/manifest.json：本次封装将使用出厂默认板块/空模板，红线③不满足。\n" +
      "   请先在源码版设置页点「同步到封装配置」生成它；内部试验构建可设 JINGYIN_SEED_ALLOW_MISSING=1 放行。"
    );
  }
  const raw = await readFile(seedFilePath, "utf8");
  let manifest;
  try { manifest = JSON.parse(raw); } catch (e) { throw new Error(`种子文件不是合法 JSON：${seedFilePath} —— ${e.message}`); }
  if (manifest.version !== 1) throw new Error(`种子文件 version 必须为 1，实际为 ${JSON.stringify(manifest.version)}`);
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) throw new Error("种子文件 entries 必须为非空数组");
  for (const entry of manifest.entries) {
    if (entry?.id === "detail-groups") throw new Error("种子含 detail-groups entry：V126 起已移出种子范围（红线②）");
    if (!SEED_ENTRY_IDS.includes(entry.id)) throw new Error(`种子含未知 entry id：${entry.id}`);
    const value = entry.value;
    if (entry.id === "outfit-pages") {
      if (!Array.isArray(value)) throw new Error("outfit-pages 的 value 必须是数组");
      for (const page of value) {
        for (const forbidden of OUTFIT_PAGE_FORBIDDEN_FIELDS) {
          if (page && typeof page === "object" && forbidden in page) {
            throw new Error(`outfit-pages 含禁项字段 ${forbidden}（红线③/④）`);
          }
        }
      }
    }
    if (entry.id === "main-prompt-presets" || entry.id === "outfit-prompt-presets") {
      if (!Array.isArray(value)) throw new Error(`${entry.id} 的 value 必须是数组`);
      for (const preset of value) {
        for (const key of Object.keys(preset || {})) {
          if (!PROMPT_PRESET_ALLOWED_FIELDS.includes(key)) {
            throw new Error(`${entry.id} 含非法字段 ${key}（白名单仅允许 ${PROMPT_PRESET_ALLOWED_FIELDS.join("/")}）`);
          }
        }
      }
    }
    if (containsCredentialFields(value)) throw new Error(`种子 entry ${entry.id} 含凭据字段，违反红线①`);
    if (containsImageRecords(value)) throw new Error(`种子 entry ${entry.id} 含生图记录字段，违反红线②`);
  }
  const seedDir = path.join(distDir, "seed");
  await mkdir(seedDir, { recursive: true });
  await copyFile(seedFilePath, path.join(seedDir, "manifest.json"));
  console.log(`   已校验并将种子注入 ${path.relative(rootDir, seedDir)}/manifest.json（${manifest.entries.length} 个 entry）`);
}

// —— 解析/生成 .icns 图标 ——
async function resolveIcon() {
  const explicit = process.env.JINGYIN_MAC_ICON;
  if (explicit && existsSync(explicit)) return explicit;
  const inResources = path.join(appResourcesDir, `${appIconName}.icns`);
  if (existsSync(inResources)) return inResources;
  const icnsInPublic = path.join(rootDir, "public", `${appIconName}.icns`);
  if (existsSync(icnsInPublic)) return icnsInPublic;
  // 尝试由 webp/png 用 macOS 自带工具生成（仅在 Mac 且命令存在时）。
  const srcWebp = path.join(rootDir, "public", "app-avatar.webp");
  const srcPng = path.join(rootDir, "public", "app-avatar.png");
  const src = existsSync(srcPng) ? srcPng : (existsSync(srcWebp) ? srcWebp : null);
  if (src && process.platform === "darwin") {
    try {
      const tmpPng = path.join(buildDir, "app-avatar.png");
      await mkdir(buildDir, { recursive: true });
      await run("sips", ["-s", "format", "png", src, "--out", tmpPng]);
      const iconset = path.join(buildDir, "app-avatar.iconset");
      await rm(iconset, { recursive: true, force: true });
      await mkdir(iconset, { recursive: true });
      // 生成多尺寸（iconutil 需要 16/32/128/256/512 等，至少提供 512@2x）。
      await run("sips", ["-z", "1024", "1024", tmpPng, "--out", path.join(iconset, "icon_512x512@2x.png")]);
      await run("sips", ["-z", "512", "512", tmpPng, "--out", path.join(iconset, "icon_512x512.png")]);
      await run("sips", ["-z", "256", "256", tmpPng, "--out", path.join(iconset, "icon_256x256.png")]);
      await run("sips", ["-z", "128", "128", tmpPng, "--out", path.join(iconset, "icon_128x128.png")]);
      await run("sips", ["-z", "32", "32", tmpPng, "--out", path.join(iconset, "icon_32x32.png")]);
      await run("sips", ["-z", "16", "16", tmpPng, "--out", path.join(iconset, "icon_16x16.png")]);
      await run("iconutil", ["--convert", "icns", "--output", inResources, iconset]);
      if (existsSync(inResources)) return inResources;
    } catch (e) {
      console.warn(`   ⚠️ 自动生成 icns 失败（${e.message}），将使用默认 Mac 图标。`);
    }
  } else {
    console.warn("   ⚠️ 未提供 .icns 且无可转换的 png/webp 源，将使用默认 Mac 图标（建议放 public/app-avatar.icns）。");
  }
  return null;
}

function writeInfoPlist() {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>Jingyin AI Board</string>
  <key>CFBundleDisplayName</key>
  <string>${productName}</string>
  <key>CFBundleExecutable</key>
  <string>${exeName}</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleVersion</key>
  <string>${productVersion}</string>
  <key>CFBundleShortVersionString</key>
  <string>${productVersion}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleIconFile</key>
  <string>${appIconName}</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSPrincipalClass</key>
  <string>NSApplication</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>LSUIElement</key>
  <${agentApp ? "true" : "false"}/>
</dict>
</plist>
`;
  return writeFile(path.join(appBundleDir, "Contents", "Info.plist"), plist, "utf8");
}

// —— 诊断导出脚本（Mac 版，替代 Windows 的 PowerShell）——
function writeDiagnosticCommand() {
  const bash = `#!/bin/bash
set -u
DATA_DIR="$HOME/Library/Application Support/JingyinAIBoard"
OUT_BASE="$HOME/Desktop/静音AI画板诊断日志_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT_BASE"
LOG_ROOT="$DATA_DIR/logs"
[ -d "$LOG_ROOT" ] && cp -f "$LOG_ROOT"/*.jsonl "$LOG_ROOT"/*.log "$OUT_BASE"/ 2>/dev/null
for port in $(seq 8787 8797); do
  if curl -s -m 3 "http://127.0.0.1:$port/api/health" -o "$OUT_BASE/health-$port.json" 2>/dev/null; then
    FOUND=$port; break
  fi
done
if [ -n "\${FOUND:-}" ]; then
  for p in /api/config /api/gateways /api/gateways/status; do
    curl -s -m 8 "http://127.0.0.1:$FOUND$p" -o "$OUT_BASE/$(echo $p | tr '/' '-').json" 2>/dev/null
  done
else
  echo "没有扫描到正在运行的本地服务。请先双击 JingyinAIBoard.app，等浏览器打开后再导出。" > "$OUT_BASE/health.txt"
fi
echo "导出时间：$(date)" > "$OUT_BASE/说明.txt"
echo "数据目录：$DATA_DIR" >> "$OUT_BASE/说明.txt"
echo "本地服务端口：\${FOUND:-未找到}" >> "$OUT_BASE/说明.txt"
echo "请把整个文件夹发给管理员，不需要单独挑文件。" >> "$OUT_BASE/说明.txt"
open "$OUT_BASE"
`;
  const target = path.join(releaseDir, "导出诊断日志.command");
  return writeFile(target, bash, "utf8").then(() => chmod(target, 0o755));
}

async function main() {
  if (process.argv.includes("--plan")) {
    console.log(`[plan] 将构建 Mac 封装：
  appName     = ${appName}.app
  exeName     = ${exeName}
  bundleId    = ${bundleId}
  productVer  = ${productVersion}
  releaseDir  = ${releaseDir}
  signIdent   = ${signIdentity || "(空 → ad-hoc 签名，仅本机可跑)"}
  notarize    = ${notarize ? "是（需 APPLE_* 变量）" : "否"}
  agentApp    = ${agentApp ? "是(LSUIElement)" : "否"}
`);
    return;
  }

  // 路径合规检查（Mac「英文路径」防御）。
  // 🔴 只检查「构建机自身路径」（仓库路径、用户家目录）。
  //    发布目录名（releaseDir 末段）是用户可见文件夹，允许中文（如默认「静音AI画板（v5.0）Mac版」），
  //    不在此检查范围内——否则 Mac 上一启动就会因默认中文发布名被误判为非法路径而退出。
  assertSafePath(rootDir, "仓库路径");
  assertSafePath(os.homedir(), "构建机用户家目录($HOME)");

  ensureInsideRoot(buildDir, rootDir);
  ensureChildPath(releaseDir, releaseParentDir);
  await rm(buildDir, { recursive: true, force: true });
  await rm(releaseDir, { recursive: true, force: true });
  await rm(distDir, { recursive: true, force: true });
  await mkdir(buildDir, { recursive: true });
  await mkdir(releaseDir, { recursive: true });

  console.log("1/9 Build frontend in public release mode");
  await run("npm", ["run", "build"], {
    env: {
      NODE_ENV: "production",
      VITE_JINGYIN_PUBLIC_RELEASE: "1",
      VITE_JINGYIN_RELEASE_ID: releaseId,
      VITE_JINGYIN_STORAGE_PREFIX: "jingyin-public-secure"
    }
  });

  console.log("1.1/9 Write .release-mode marker into dist");
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, ".release-mode"), "", "utf8");

  console.log("1.2/9 Inject release seed into dist (if seed/manifest.json exists)");
  await injectReleaseSeedIntoDist();

  console.log("2/9 Obfuscate frontend JavaScript assets");
  const distAssetFiles = await walkFiles(distDir);
  for (const file of distAssetFiles.filter((item) => item.endsWith(".js"))) {
    await obfuscateFile(file, {
      compact: true, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.25,
      deadCodeInjection: true, deadCodeInjectionThreshold: 0.05, identifierNamesGenerator: "hexadecimal",
      numbersToExpressions: true, renameGlobals: false, selfDefending: false, simplify: true,
      splitStrings: true, splitStringsChunkLength: 10, stringArray: true,
      stringArrayEncoding: ["base64"], stringArrayThreshold: 0.75, transformObjectKeys: true
    });
  }

  console.log("3/9 Embed frontend assets into server module");
  await run(process.execPath, [path.join(rootDir, "scripts", "generate-static-assets.mjs")]);

  console.log("4/9 Bundle server");
  await esbuild({
    entryPoints: [path.join(rootDir, "server", "index.js")],
    bundle: true, platform: "node", target: "node24", format: "cjs",
    outfile: serverBundle, minify: true, legalComments: "none",
    define: {
      "process.env.NODE_ENV": "\"production\"",
      "process.env.JINGYIN_DISABLE_GENERATION_LOGS": "\"0\""
    },
    external: ["vite", "lightningcss"]
  });

  console.log("5/9 Obfuscate server bundle");
  await copyFile(serverBundle, protectedServerBundle);
  await obfuscateFile(protectedServerBundle, {
    compact: true, controlFlowFlattening: false, deadCodeInjection: false,
    identifierNamesGenerator: "hexadecimal", numbersToExpressions: true, renameGlobals: false,
    selfDefending: false, simplify: true, splitStrings: true, splitStringsChunkLength: 8,
    stringArray: true, stringArrayEncoding: ["base64"], stringArrayThreshold: 0.6,
    transformObjectKeys: false
  });

  console.log("6/9 Build Node SEA blob");
  await writeFile(seaConfigFile, JSON.stringify({
    main: protectedServerBundle, output: seaBlob,
    disableExperimentalSEAWarning: true, useCodeCache: false
  }, null, 2), "utf8");
  await run(process.execPath, ["--experimental-sea-config", seaConfigFile]);

  console.log("6.5/9 Copy Node binary → .app/Contents/MacOS, remove signature, inject blob (Mach-O)");
  await mkdir(appMacOsDir, { recursive: true });
  await mkdir(appResourcesDir, { recursive: true });
  // realpath 解决 nvm 等软链，复制到真实 Mach-O 二进制。
  const nodeBin = await realpath(process.execPath);
  await copyFile(nodeBin, appExe);
  await chmod(appExe, 0o755);
  // Mac 必须先去掉 node 自带签名，否则 postject 无法写入。
  await run("codesign", ["--remove-signature", appExe]);
  const postjectCli = path.join(rootDir, "node_modules", "postject", "dist", "cli.js");
  const postjectArgs = [
    appExe, "NODE_SEA_BLOB", seaBlob,
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    "--macho-segment-name", "NODE_SEA"
  ];
  if (existsSync(postjectCli)) await run(process.execPath, [postjectCli, ...postjectArgs]);
  else await run("npx", ["postject", ...postjectArgs]);

  console.log("6.6/9 Assemble .app bundle (Info.plist / Resources / .release-mode)");
  await writeInfoPlist();
  const icon = await resolveIcon();
  if (icon) {
    const dest = path.join(appResourcesDir, `${appIconName}.icns`);
    await copyFile(icon, dest);
  }
  // server/index.js 按 <exe 同级>/.release-mode 判定 release 模式；.app 下 exe 在 Contents/MacOS。
  await writeFile(path.join(appMacOsDir, ".release-mode"), "", "utf8");

  console.log("7/9 Codesign .app (Hardened Runtime + entitlements)");
  if (!existsSync(entitlementsFile)) {
    throw new Error(`缺少 entitlements 文件：${entitlementsFile}（Node/V8 必须带 JIT 授权，否则签名后启动即 SIGKILL）`);
  }
  const signArgs = [
    "--force", "--options", "runtime",
    "--entitlements", entitlementsFile,
    "--sign", signIdentity || "-"
  ];
  if (signIdentity) signArgs.push("--timestamp");
  signArgs.push(appBundleDir);
  await run("codesign", signArgs);
  await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundleDir]);

  console.log("8/9 Build .dmg");
  await run("hdiutil", ["create", "-volname", appName, "-srcfolder", appBundleDir, "-ov", "-format", "UDZO", dmgPath]);
  if (signIdentity) {
    await run("codesign", ["--force", "--timestamp", "--sign", signIdentity, dmgPath]);
  }

  console.log("8.5/9 Notarize + staple (if enabled)");
  if (notarize) {
    const { APPLE_ID, APPLE_APP_PASSWORD, APPLE_TEAM_ID } = process.env;
    if (!APPLE_ID || !APPLE_APP_PASSWORD || !APPLE_TEAM_ID) {
      throw new Error("公证已开启(JINGYIN_MAC_NOTARIZE=1)但缺少 APPLE_ID / APPLE_APP_PASSWORD / APPLE_TEAM_ID");
    }
    await run("xcrun", ["notarytool", "submit", dmgPath,
      "--apple-id", APPLE_ID, "--password", APPLE_APP_PASSWORD, "--team-id", APPLE_TEAM_ID, "--wait"]);
    await run("xcrun", ["stapler", "staple", dmgPath]);
    await run("xcrun", ["stapler", "staple", appBundleDir]);
  } else {
    console.warn("   ⚠️ 未开启公证（JINGYIN_MAC_NOTARIZE=1）。未公证的包在别人 Mac 上双击会报「应用已损坏」；" +
      "本机构签/ad-hoc 签名仅本机可跑。分发前务必开启公证。");
  }

  console.log("9/9 Write release notes and checksum");
  const dmgInfo = await stat(dmgPath);
  const hash = await sha256(dmgPath);
  const buildTime = new Date().toISOString();
  await writeDiagnosticCommand();
  await writeFile(path.join(releaseDir, "使用说明.txt"), [
    `${productName} macOS 使用说明`,
    "",
    `版本：${releaseName} / ${productVersion}`,
    "",
    "启动：",
    `1. 双击 ${appName}.app（或先拖到「应用程序」再从启动台打开）。`,
    "2. 软件会自动打开浏览器进入前端；若没自动打开，手动访问 http://127.0.0.1:8787 。",
    "3. 注册/兑换等流程与 Windows 版一致（见官网 api.jingyin.online）。",
    "",
    "数据存放位置（重要）：",
    "1. 历史图片、参考图、结果缓存、日志都保存在你的用户目录：",
    "   ~/Library/Application Support/JingyinAIBoard/",
    "2. 想彻底清理：打开软件 → 左下角「设置」→「数据与存储」→ 相应清理按钮；",
    "   或直接在 Finder 按 Cmd+Shift+G 输入上面的路径删除整个 JingyinAIBoard 文件夹。",
    "3. 便携模式：在终端用 JINGYIN_RELEASE_ROOT=/你的路径 启动 .app，数据就写到那里。",
    "4. 卸载：把 .app 拖进废纸篓即可；数据目录需自行删除。",
    "",
    "排查：启动超过 5 分钟没出图/卡顿，双击「导出诊断日志.command」，桌面会生成诊断文件夹，发给管理员。",
    "",
    "安装包不含任何 KEY、历史图片或图片缓存：这些只会在你本机运行时写入上面的数据目录。"
  ].join("\n") + "\n", "utf8");
  await writeFile(path.join(releaseDir, "version.json"), JSON.stringify({
    productName, releaseName, appVersion: productVersion, releaseId, buildTime,
    executable: `${appName}.app`, dmg: path.basename(dmgPath),
    sha256: hash, sizeBytes: dmgInfo.size, sizeMB: Number((dmgInfo.size / 1024 / 1024).toFixed(2)),
    defaultDataDir: "~/Library/Application Support/JingyinAIBoard",
    dataDirOverrideEnv: "JINGYIN_RELEASE_ROOT",
    notes: "未公证的包仅供本机测试；分发需开启 JINGYIN_MAC_NOTARIZE=1 并配置 APPLE_* 变量。"
  }, null, 2) + "\n", "utf8");
  await writeFile(path.join(releaseDir, "校验和.txt"), [
    `${productName} ${releaseName}`,
    `构建时间：${buildTime}`,
    `文件：${path.basename(dmgPath)}`,
    `大小：${(dmgInfo.size / 1024 / 1024).toFixed(2)} MB (${dmgInfo.size} 字节)`,
    `SHA256：${hash}`,
    "",
    "本安装包不含任何 KEY、上传图、历史图片或图片缓存；这些只会在运行时写入数据目录。"
  ].join("\n") + "\n", "utf8");

  console.log(`Release ready: ${dmgPath}`);
  console.log(`SHA256: ${hash}`);
  console.log(`Release files: ${path.basename(dmgPath)}, ${appName}.app, version.json, 使用说明.txt, 导出诊断日志.command, 校验和.txt`);
}

main().catch((err) => {
  console.error("\n❌ Mac 封装失败：", err.message);
  process.exit(1);
});
