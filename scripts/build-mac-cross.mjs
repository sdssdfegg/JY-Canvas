// 跨平台 macOS 封装构建（在 Windows / Linux 上也能产出 .app + .zip）。
//
// 与 secure-mac-release.mjs 的关系：
//   - 两者共用同一套「前端构建 → 种子注入 → 混淆 → 内嵌资源 → esbuild 打 server → SEA blob」
//     的跨平台流水线（本脚本直接复用其逻辑）。
//   - 区别在「Mac 专属工具」这一步：
//       secure-mac-release.mjs 依赖 codesign / hdiutil / xcrun notarytool（仅 macOS 有），
//       本脚本改用【下载 macOS Node 二进制 + postject(Mach-O, 跨平台) + rcodesign(跨平台签名) + .zip 打包】，
//       因此**不要求构建机是 Mac**。
//
// 关于「客户能否打开」的关键事实（务必读 docs/封装/MAC封装说明.md）：
//   - .app 这个「文件」可在任意平台造出来（本脚本已证明）。
//   - 但分发给客户前，**必须做 Developer ID 代码签名 + 公证**，否则客户 Mac 的 Gatekeeper 会拦「已损坏」。
//     这一步【也不要求 Mac】：用本脚本 + rcodesign（纯 Rust 跨平台，Windows/Linux 都可跑）+ 你的 Apple 证书即可。
//     唯一需要真机的是「双击启动验证」（Mach-O 无法在 Windows 上执行）——那一步交给你的 Mac 或客户。
//
// 用法：
//   node scripts/build-mac-cross.mjs
// 环境变量（均可选）：
//   JINGYIN_MAC_NODE_BIN       macOS Node 二进制路径（默认 .secure-build-mac/node-v22.22.2-darwin-arm64/bin/node；缺失则尝试自动下载）
//   JINGYIN_RCODESIGN_BIN      rcodesign 可执行路径（默认 .secure-build-mac/rcodesign.exe；存在则用于签名）
//   JINGYIN_MAC_SIGN_IDENTITY  Developer ID 身份串；为空则做 ad-hoc 签名（仅本机可跑，分发仍需正式签名）
//   JINGYIN_MAC_P12_FILE / JINGYIN_MAC_P12_PASSWORD  跨平台正式签名用的 p12 证书（与 rcodesign 配合）
//   JINGYIN_MAC_NOTARIZE=1     开启公证（需 APPLE_ID / APPLE_APP_PASSWORD / APPLE_TEAM_ID）
//   JINGYIN_MAC_PRODUCT_VERSION / JINGYIN_MAC_APP_NAME / JINGYIN_MAC_EXE_NAME / JINGYIN_MAC_BUNDLE_ID
//   JINGYIN_SEED_ALLOW_MISSING=1  缺少 seed/manifest.json 时放行（工厂空模板包）

import JavaScriptObfuscator from "javascript-obfuscator";
import { build as esbuild } from "esbuild";
import { readFileSync, existsSync } from "node:fs";
import {
  copyFile, mkdir, readFile, readdir, rm, stat, writeFile, chmod
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_ENTRY_IDS, OUTFIT_PAGE_FORBIDDEN_FIELDS, PROMPT_PRESET_ALLOWED_FIELDS, containsCredentialFields, containsImageRecords } from "../src/shared/release-seed-schema.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.join(rootDir, ".secure-build-mac");
const releaseDir = path.join(rootDir, "release-mac");
const productName = "静音AI画板";
const productVersion = String(process.env.JINGYIN_MAC_PRODUCT_VERSION || JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8")).version).trim();
const appName = String(process.env.JINGYIN_MAC_APP_NAME || "JingyinAIBoard").trim();
const exeName = String(process.env.JINGYIN_MAC_EXE_NAME || "JingyinBoard").trim();
const bundleId = String(process.env.JINGYIN_MAC_BUNDLE_ID || "com.jingyin.aiboard").trim();
const appBundleDir = path.join(releaseDir, `${appName}.app`);
const appMacOsDir = path.join(appBundleDir, "Contents", "MacOS");
const appResourcesDir = path.join(appBundleDir, "Contents", "Resources");
const appExe = path.join(appMacOsDir, exeName);
const distDir = path.join(rootDir, "dist");
const serverBundle = path.join(buildDir, "server.bundle.cjs");
const protectedServerBundle = path.join(buildDir, "server.protected.cjs");
const seaConfigFile = path.join(buildDir, "sea-config.json");
const seaBlob = path.join(buildDir, "jingyin-sea.blob");
const releaseId = `secure-mac-cross-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const entitlementsFile = path.join(rootDir, "scripts", "entitlements.mac.plist");
const zipPath = path.join(releaseDir, `${appName}.zip`);
const darwinNodeBin = process.env.JINGYIN_MAC_NODE_BIN || path.join(buildDir, "node-v22.22.2-darwin-arm64", "bin", "node");
const rcodesignBin = process.env.JINGYIN_RCODESIGN_BIN || path.join(buildDir, "rcodesign.exe");
const signIdentity = process.env.JINGYIN_MAC_SIGN_IDENTITY || "";
const notarize = process.env.JINGYIN_MAC_NOTARIZE === "1";
const appIconName = "app-avatar";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
      shell: true
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

// —— 封装种子注入（镜像 secure-mac-release.mjs）——
async function injectReleaseSeedIntoDist() {
  const seedFilePath = path.join(rootDir, "seed", "manifest.json");
  if (!existsSync(seedFilePath)) {
    if (process.env.JINGYIN_SEED_ALLOW_MISSING === "1") {
      console.warn("   未找到 seed/manifest.json：工厂包（不含开发者最新板块）。");
      return;
    }
    throw new Error("未找到 seed/manifest.json：本次封装将使用出厂默认板块/空模板。内部试验构建可设 JINGYIN_SEED_ALLOW_MISSING=1 放行。");
  }
  const raw = await readFile(seedFilePath, "utf8");
  const manifest = JSON.parse(raw);
  if (manifest.version !== 1) throw new Error(`种子文件 version 必须为 1，实际为 ${JSON.stringify(manifest.version)}`);
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) throw new Error("种子文件 entries 必须为非空数组");
  for (const entry of manifest.entries) {
    if (entry?.id === "detail-groups") throw new Error("种子含 detail-groups entry：V126 起已移出种子范围");
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
  console.log(`   已注入种子 ${path.relative(rootDir, seedDir)}/manifest.json（${manifest.entries.length} 个 entry）`);
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
</dict>
</plist>
`;
  return writeFile(path.join(appBundleDir, "Contents", "Info.plist"), plist, "utf8");
}

// —— 跨平台 .zip 打包 .app（保留可执行位；Mac 上解压即为可用 .app）——
async function zipApp() {
  const py = path.join(buildDir, "zip_app.py");
  const pySrc = `
import os, zipfile, sys
app_dir, out_zip = sys.argv[1], sys.argv[2]
exe_name = sys.argv[3]
def walk(d):
    for root, _, files in os.walk(d):
        for f in files:
            yield os.path.join(root, f)
with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as z:
    for fp in walk(app_dir):
        arc = os.path.relpath(fp, os.path.dirname(app_dir))
        info = zipfile.ZipInfo(arc)
        mode = 0o755 if os.path.basename(fp) == exe_name else 0o644
        info.external_attr = mode << 16
        with open(fp, "rb") as fh:
            z.writestr(info, fh.read())
print("zipped", out_zip)
`;
  await writeFile(py, pySrc, "utf8");
  await run(process.platform === "win32" ? "python3" : "python3", [py, appBundleDir, zipPath, exeName]);
}

async function safeRm(target) {
  try {
    await rm(target, { recursive: true, force: true });
  } catch (e) {
    console.warn(`   (忽略清理失败，继续) ${target}: ${e.message}`);
  }
}

async function main() {
  // 注：不删除 buildDir（里面含已下载的 macOS Node 二进制，重复下载成本高；脚本只覆盖各自产物文件）。
  await safeRm(releaseDir);
  await safeRm(distDir);
  await mkdir(buildDir, { recursive: true });
  await mkdir(releaseDir, { recursive: true });

  console.log("1/8 Build frontend in public release mode");
  await run(npmCmd, ["run", "build"], {
    env: {
      NODE_ENV: "production",
      VITE_JINGYIN_PUBLIC_RELEASE: "1",
      VITE_JINGYIN_RELEASE_ID: releaseId,
      VITE_JINGYIN_STORAGE_PREFIX: "jingyin-public-secure"
    }
  });

  console.log("1.1/8 Write .release-mode marker into dist");
  await mkdir(distDir, { recursive: true });
  await writeFile(path.join(distDir, ".release-mode"), "", "utf8");

  console.log("1.2/8 Inject release seed into dist");
  await injectReleaseSeedIntoDist();

  console.log("2/8 Obfuscate frontend JS assets");
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

  console.log("3/8 Embed frontend assets into server module");
  await run(process.execPath, [path.join(rootDir, "scripts", "generate-static-assets.mjs")]);

  console.log("4/8 Bundle server (target node22 匹配打包进去的 macOS Node)");
  await esbuild({
    entryPoints: [path.join(rootDir, "server", "index.js")],
    bundle: true, platform: "node", target: "node22", format: "cjs",
    outfile: serverBundle, minify: true, legalComments: "none",
    define: {
      "process.env.NODE_ENV": "\"production\"",
      "process.env.JINGYIN_DISABLE_GENERATION_LOGS": "\"0\""
    },
    external: ["vite", "lightningcss"]
  });

  console.log("5/8 Obfuscate server bundle");
  await copyFile(serverBundle, protectedServerBundle);
  await obfuscateFile(protectedServerBundle, {
    compact: true, controlFlowFlattening: false, deadCodeInjection: false,
    identifierNamesGenerator: "hexadecimal", numbersToExpressions: true, renameGlobals: false,
    selfDefending: false, simplify: true, splitStrings: true, splitStringsChunkLength: 8,
    stringArray: true, stringArrayEncoding: ["base64"], stringArrayThreshold: 0.6,
    transformObjectKeys: false
  });

  console.log("6/8 Build Node SEA blob");
  await writeFile(seaConfigFile, JSON.stringify({
    main: protectedServerBundle, output: seaBlob,
    disableExperimentalSEAWarning: true, useCodeCache: false
  }, null, 2), "utf8");
  await run(process.execPath, ["--experimental-sea-config", seaConfigFile]);

  console.log("6.5/8 Copy macOS Node binary → .app/Contents/MacOS, postject Mach-O blob (跨平台注入)");
  if (!existsSync(darwinNodeBin)) throw new Error(`未找到 macOS Node 二进制：${darwinNodeBin}（请先下载 node-v22.22.2-darwin-arm64 并解压，或用 JINGYIN_MAC_NODE_BIN 指定）`);
  await mkdir(appMacOsDir, { recursive: true });
  await mkdir(appResourcesDir, { recursive: true });
  await copyFile(darwinNodeBin, appExe);
  await chmod(appExe, 0o755);
  const postjectCli = path.join(rootDir, "node_modules", "postject", "dist", "cli.js");
  const postjectArgs = [
    appExe, "NODE_SEA_BLOB", seaBlob,
    "--sentinel-fuse", "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    "--macho-segment-name", "NODE_SEA"
  ];
  if (existsSync(postjectCli)) await run(process.execPath, [postjectCli, ...postjectArgs]);
  else await run(npxCmd, ["postject", ...postjectArgs]);

  console.log("6.6/8 Assemble .app (Info.plist / Resources / .release-mode)");
  await writeInfoPlist();
  await writeFile(path.join(appMacOsDir, ".release-mode"), "", "utf8");

  console.log("7/8 Codesign .app (rcodesign 跨平台；缺 rcodesign 则跳过，留给 Mac 上 codesign 收尾)");
  if (existsSync(rcodesignBin)) {
    if (!existsSync(entitlementsFile)) throw new Error(`缺少 entitlements：${entitlementsFile}`);
    const args = [rcodesignBin, "sign", "--entitlements", entitlementsFile];
    if (signIdentity) args.push("--sign", signIdentity);
    else args.push("--ad-hoc");
    const p12 = process.env.JINGYIN_MAC_P12_FILE;
    if (p12) {
      args.push("--p12-file", p12);
      args.push("--p12-password", process.env.JINGYIN_MAC_P12_PASSWORD || "");
    }
    args.push(appBundleDir);
    await run(process.execPath, args);
    await run(process.execPath, [rcodesignBin, "verify", appBundleDir]);
    if (notarize) {
      const { APPLE_ID, APPLE_APP_PASSWORD, APPLE_TEAM_ID } = process.env;
      if (!APPLE_ID || !APPLE_APP_PASSWORD || !APPLE_TEAM_ID) throw new Error("公证开启但缺少 APPLE_* 变量");
      await run(process.execPath, [rcodesignBin, "notary-submit", "--api-issuer", APPLE_TEAM_ID, "--api-key", APPLE_ID, "--api-key-password", APPLE_APP_PASSWORD, zipPath]);
    }
  } else {
    console.warn("   ⚠️ 未找到 rcodesign（.secure-build-mac/rcodesign.exe）。已跳过签名。");
    console.warn("   在 Mac 上收尾签名（必做，否则客户 Mac 无法打开）：");
    console.warn(`   codesign --force --sign "Developer ID Application: <你的身份>" --options runtime --entitlements ${path.relative(rootDir, entitlementsFile)} ${appName}.app`);
  }

  console.log("8/8 Zip .app → .zip (跨平台打包；Mac 上解压即为可用 .app)");
  await zipApp();

  const zipInfo = await stat(zipPath);
  const hash = await sha256(zipPath);
  const buildTime = new Date().toISOString();
  await writeFile(path.join(releaseDir, "使用说明.txt"), [
    `${productName} macOS 使用说明（本包由 Windows/Linux 跨平台构建）`,
    "",
    `版本：${productVersion}  |  releaseId：${releaseId}`,
    "",
    "本安装包的来历：",
    "1. 前端 + 本地服务被打包进一个 macOS 可执行文件（Node SEA 单文件技术）。",
    "2. 打包动作本身在任何操作系统都能完成（已在 Windows 上实跑产出本 .zip）。",
    "3. 但分发给客户前必须做 Developer ID 签名 + 公证（否则客户 Mac 报「已损坏」）。",
    "   这一步也不要求 Mac：用 rcodesign（跨平台）+ 你的 Apple 证书即可；或在本机 Mac 用 codesign。",
    "",
    "启动（在 Mac 上）：",
    "1. 解压，双击 JingyinAIBoard.app（或先拖到「应用程序」）。",
    "2. 自动打开浏览器进入前端；没自动打开就访问 http://127.0.0.1:8787 。",
    "",
    "数据目录：~/Library/Application Support/JingyinAIBoard",
    "卸载：拖进废纸篓；数据目录需自行删除。",
    "",
    "本安装包不含任何 KEY、上传图、历史图片或图片缓存。"
  ].join("\n") + "\n", "utf8");
  await writeFile(path.join(releaseDir, "version.json"), JSON.stringify({
    productName, appVersion: productVersion, releaseId, buildTime,
    executable: `${appName}.app`, zip: path.basename(zipPath),
    sha256: hash, sizeBytes: zipInfo.size, sizeMB: Number((zipInfo.size / 1024 / 1024).toFixed(2)),
    builtOn: process.platform, signed: existsSync(rcodesignBin) && (signIdentity || true),
    defaultDataDir: "~/Library/Application Support/JingyinAIBoard"
  }, null, 2) + "\n", "utf8");

  console.log(`Release ready: ${zipPath}`);
  console.log(`SHA256: ${hash}`);
  console.log(`size: ${(zipInfo.size / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error("\n❌ 跨平台 Mac 构建失败：", err.message);
  process.exit(1);
});
