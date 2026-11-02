# 静音AI画板 · macOS 封装说明

> 配套脚本（两个，互为补充）：
> - `scripts/secure-mac-release.mjs`：**Mac 原生**流水线（产物 `.app` + 签名 + 公证 + `.dmg`），需要 macOS（`codesign` / `hdiutil` / `xcrun notarytool`）。
> - `scripts/build-mac-cross.mjs`：**跨平台**流水线——在 **Windows / Linux 上也能产出 `.app` + `.zip`**（用「下载的 macOS Node 二进制 + postject + rcodesign + zip」）。**包文件本身不要求 Mac 机器**。
> 配套授权：`scripts/entitlements.mac.plist`（Node/V8 JIT 必需）。
> npm 入口：`npm run release:mac`（走原生流水线）；跨平台用 `node scripts/build-mac-cross.mjs`。

---

## 0. 一句话结论

Mac 版封装**复用 Windows 版的 Node SEA 单文件思路**，但产物形态不同：Windows 是「PE exe + rcedit 改图标 + 改子系统」，Mac 是「node 二进制 → postject 注入 SEA blob（Mach-O 段）→ 装进 `.app` 包 → 签名 → 公证 → .dmg/.zip」。

**关于"必须 Mac"的纠正（重要）**：`.app` 这个**文件**可以在**任意操作系统**造出来——`build-mac-cross.mjs` 已在 Windows 上实跑产出过 118MB 的 `JingyinAIBoard.zip`（含合法 Mach-O + 注入后的 SEA blob）。真正要求 Mac（或至少 Mac 原生工具）的只有最后一步 **Developer ID 签名 + 公证 + .dmg**；而这一步也**能跨平台完成**——用纯 Rust 的 `rcodesign`（Windows/Linux 都可跑）+ 你的 Apple 证书即可，无需 Mac。唯一必须真机的环节是"双击启动验证"（Mach-O 无法在 Windows 执行），那一步交给你的 Mac 或客户。

---

## 1. 关于「Mac 只支持英文路径」——真相与纠正

这是最容易记混的地方，分三层：

1. **macOS 运行时本身完全支持中文路径**（APFS / UTF-8）。你中文命名的家目录、中文文件夹，App 读写都没问题。**系统级没有"只支持英文"的硬限制。**
2. **真正会咬人的是"构建机（打包那台 Mac）的路径"**：用户名是中文（`/Users/张三`）或含空格（`/Users/Brad Old`）时，`npm install`（一旦有需 node-gyp 编译的原生模块）、`node --experimental-sea-config`、postject 注入、codesign 都可能失败。node-gyp 对空格/中文路径是出了名的炸。
   - **好消息**：本仓库 `package.json` 的 17 个依赖**没有任何原生模块**（无 sharp/bcrypt/sqlite3…），`npm install` 不会触发 node-gyp，所以"中文用户名打包"不会像传统项目那样必炸。但仍是**防御性最佳实践**——脚本开头（`assertSafePath`）会检查仓库路径、发布目录、家目录是否含非 ASCII 或空格，**命中即报错退出**。
3. **产物（.app / 数据目录）建议用 ASCII 名**：`.app` 目录名、codesign / notarize / CI 工具对中文路径更脆弱；部分 shell 脚本引用中文路径需转义。
   - 脚本默认把 `.app` 内部名设成 ASCII（`JingyinAIBoard`），但 Finder **显示名仍用中文「静音AI画板」**（走 `CFBundleDisplayName`）。两全其美。

---

## 2. Mac 专属坑（按致命度排序）

| 坑 | 为什么致命 | 本脚本如何处理 |
|---|---|---|
| **必须代码签名 + 公证** | 不上架 App Store 的分发包，macOS 10.15+ 强制公证，否则别人下载双击报"应用已损坏"。需 **Developer ID 证书 + 公证**（每年 $99 开发者账号）。 | 设 `JINGYIN_MAC_SIGN_IDENTITY` 做 Developer ID 签名；设 `JINGYIN_MAC_NOTARIZE=1` + `APPLE_*` 做公证。未配置时 ad-hoc 签名（仅本机可跑）并明确告警。 |
| **Entitlements 必须带 JIT 授权** | Node/V8 在 Hardened Runtime 下需要 `allow-jit` + `allow-unsigned-executable-memory`，否则签名后 Apple Silicon 上启动即 **SIGKILL**。 | `build/entitlements.mac.plist` 已含这两项（+ `disable-library-validation` 防将来加原生模块）。codesign 必带。 |
| **SEA 注入差异** | Mac 的 postject 必须加 `--macho-segment-name NODE_SEA`；且注入前要先 `codesign --remove-signature` 去掉 node 自带签名，否则写不进去。 | 脚本 6.5 步先去签名再注入。 |
| **架构（arm64 / x64）** | 现在 Mac 基本是 Apple Silicon（arm64）。要兼顾老 Intel Mac 得做 universal（lipo 合二为一）。 | 默认跟构建机架构（`process.arch`）。做 universal 需另下 `node-darwin-x64` 二进制并 `lipo`，本脚本暂未内置，留作后续。 |
| **数据目录位置（已修的 bug）** | 原 `app-paths.js` 把 Mac 数据目录放在「`.app` 同级」，用户拖进 `/Applications`（系统目录、普通用户不可写）时首次写入即失败。 | 已改为 `~/Library/Application Support/JingyinAIBoard`（ASCII、永远可写、符合 Mac 惯例）。见 §4。 |

**额外注意**：
- `.app` 从 Finder 双击启动**不会**弹 Terminal 窗口（只有直接双击裸可执行文件或 `.command`/`.sh` 才会）。所以把 node 二进制作为 `CFBundleExecutable` 放进 `.app` 即可无控制台运行；stdout/stderr 建议落到数据目录日志（本仓库已有 `静音AI绘画数据/logs`）。
- 本地服务监听 `127.0.0.1`，不触发 macOS 的**摄像头/麦克风/通讯录**等 TCC 权限弹窗（那些只有访问对应硬件/地址簿才会要）。无需在 entitlements 里加对应键。
- `LSUIElement`：默认 `false`（正常 Dock 图标 app）。若想做成"无 Dock 图标的驻留型"（agent），设 `JINGYIN_MAC_AGENT=1`。

---

## 3. 操作步骤（在 Mac 构建机上）

```bash
# 0) 前置：Xcode Command Line Tools（codesign / hdiutil / xcrun 来自它）
xcode-select --install

# 1) 把仓库放到纯英文、无空格的路径，例如：
#    /Users/<你的英文用户名>/dev/jingyin
#    （脚本会校验，含中文/空格直接退出）

# 2) 安装依赖（本项目无原生模块，纯 JS，正常 npm install 即可）
npm install

# 3) （可选但推荐）准备图标：放 public/app-avatar.icns
#    或放 1024x1024 的 public/app-avatar.png，脚本会调 sips/iconutil 自动转 icns。

# 4) 先 dry-run 看计划（可不依赖 Mac 环境看一眼将做什么）
node scripts/secure-mac-release.mjs --plan

# 5) 本机测试构建（ad-hoc 签名，仅本机可跑，无需证书）
npm run release:mac

# 6) 正式分发构建（需 Developer ID 证书 + 公证凭据）
export JINGYIN_MAC_SIGN_IDENTITY="Developer ID Application: 你的团队名 (TEAMIDXXXX)"
export JINGYIN_MAC_NOTARIZE=1
export APPLE_ID="you@example.com"
export APPLE_APP_PASSWORD="app-specific-password"   # appleid.apple.com 生成的专用密码
export APPLE_TEAM_ID="TEAMIDXXXX"
npm run release:mac
```

产物在仓库**同级**的 `静音AI画板 Mac版/` 目录：
- `JingyinAIBoard.app`（已签名）
- `JingyinAIBoard.dmg`（已签名，公证模式下已钉票）
- `version.json` / `使用说明.txt` / `校验和.txt` / `导出诊断日志.command`

**分发前验证**（在**另一台**没你签名钥匙的 Mac 上，用 Safari 下载后双击）：
```bash
# 在下载目录
spctl -a -vvv -t install JingyinAIBoard.dmg      # 应看到 source=Notarized Developer ID
codesign --verify --deep --strict -vvv JingyinAIBoard.app
xcrun stapler validate JingyinAIBoard.app
```

---

## 3b. 跨平台构建（Windows / Linux，无需 Mac 机器）

`.app` **文件**可在非 Mac 上产出。已验证：在 Windows（Node v22.22.2）上跑 `node scripts/build-mac-cross.mjs`，得到 `release-mac/JingyinAIBoard.zip`（118MB，含合法 Mach-O + 注入后的 SEA blob，解压后二进制保留可执行位）。

```bash
# 1) 准备 macOS Node 二进制（与本地 node 主版本一致，本次 v22.22.2，arm64）
#    脚本默认找 .secure-build-mac/node-v22.22.2-darwin-arm64/bin/node；
#    缺失则自己下：https://nodejs.org/dist/v22.22.2/node-v22.22.2-darwin-arm64.tar.gz 并解压到该路径。
#    （Intel Mac 用户需改用 node-v22.22.2-darwin-x64，并做 universal 合并，见 §6）

# 2) （可选）放跨平台签名工具 rcodesign 到 .secure-build-mac/rcodesign.exe
#    https://github.com/indygreg/apple-platform-rs/releases （x86_64-pc-windows-msvc.zip）
#    有它在，本脚本能直接做 ad-hoc / Developer ID 签名；没有则只产未签名 .app，留待 Mac 上 codesign 收尾。

# 3) 跑构建
node scripts/build-mac-cross.mjs

# 4) 产物在 release-mac/：JingyinAIBoard.zip（= 完整 .app，Mac 上解压即用）
```

**跨平台产出的 .app 在分发前仍需签名 + 公证**（否则客户 Mac 报"已损坏"）。两种方式任选：
- **方式 A（跨平台，推荐无 Mac 时）**：把 Apple 证书的 p12 给脚本 → `JINGYIN_MAC_P12_FILE` / `JINGYIN_MAC_P12_PASSWORD` + `JINGYIN_MAC_SIGN_IDENTITY` + `JINGYIN_MAC_NOTARIZE=1` + `APPLE_*`，由 rcodesign 在本机（Windows/Linux）完成签名 + 公证。
- **方式 B（有 Mac 时）**：把 `JingyinAIBoard.zip` 拷到 Mac 解压，一行收尾：
  ```bash
  codesign --force --sign "Developer ID Application: 你的身份" --options runtime \
    --entitlements scripts/entitlements.mac.plist JingyinAIBoard.app
  # 再公证：xcrun notarytool submit ...  /  stapler staple
  ```

> 说明：跨平台脚本默认打 **.zip** 而非 .dmg。`.zip` 在 Mac 上解压即为可用 `.app`，是合法分发形态；若一定要 .dmg，在 Mac 上 `hdiutil create -volname JingyinAIBoard -srcfolder JingyinAIBoard.app -ov -format UDZO JingyinAIBoard.dmg` 即可（或对未签名包先签名）。

---

## 4. 本次对代码的改动

| 文件 | 改动 | 原因 |
|---|---|---|
| `scripts/secure-mac-release.mjs`（新增） | Mac 封装流水线 | 镜像 Windows 版，产物改为 Mach-O + `.app` + 签名 + 公证 + `.dmg`；开头路径合规检查。 |
| `scripts/entitlements.mac.plist`（新增） | JIT 授权 | Node/V8 在 Hardened Runtime 下必需，否则 Apple Silicon 启动即 SIGKILL。 |
| `server/core/app-paths.js` | Mac 数据目录改到 `~/Library/Application Support/JingyinAIBoard`（原「`.app` 同级」） | 修真 bug：拖进 `/Applications` 后数据目录不可写、首次写入失败；同时 ASCII 名更安全。 |
| `package.json` | 加 `release:mac` 脚本 | 入口。 |

> 注：`app-paths.js` 的改动只影响 **macOS** 分支；Windows 分支（`%LOCALAPPDATA%/静音AI绘画数据`）与源码开发分支**未动**。若你更希望 Mac 也保持"数据随 .app 走"的便携风格，可改回，但需确保用户把 .app 放在用户可写目录（如 `~/Applications`），否则仍会写失败。

---

## 5. 发布前检查清单

- [ ] 构建机用户名为纯英文、项目路径无空格/中文（脚本会自动拦）。
- [ ] `node -v` 需与打包进去的 macOS Node 主版本一致（本次用 **v22.22.2**；SEA blob 与打包二进制必须同版本，否则 blob 无法加载）。
- [ ] 已放图标（`public/app-avatar.icns` 或 `app-avatar.png`）。
- [ ] 已配 `JINGYIN_MAC_SIGN_IDENTITY`（Developer ID Application）。
- [ ] 已开 `JINGYIN_MAC_NOTARIZE=1` 且 `APPLE_*` 三件套齐全。
- [ ] 公证后**在另一台 Mac** 用 Safari 下载双击验证通过（见 §3 验证命令）。
- [ ] `version.json` / `使用说明.txt` / `校验和.txt` 随包发出。
- [ ] 数据目录 `~/Library/Application Support/JingyinAIBoard` 在首启后能正常创建与写入（已修 bug，但建议实机确认）。

## 6. 已知限制 / 后续

- **Universal 二进制**（同时支持 Intel + Apple Silicon）未内置：需另下 `node-darwin-x64` 二进制、`lipo` 合并两个 Mach-O 再注入。当前默认只产构建机架构（多为 arm64）。
- **自动更新**未做（无 Sparkle / electron-updater）。如需，后续加 `.zip` 差分 + 更新服务。
- **`.pkg` 安装包**未做（仅 `.dmg` 拖放式）。若要走企业 MDM 或装 LaunchAgent/守护进程，再补 `productbuild` + Developer ID Installer 证书。
- 跨平台构建（`build-mac-cross.mjs`）已能在 Windows/Linux 产出完整 `.app` + `.zip`；签名/公证若用 `rcodesign`（跨平台）也能在 Windows/Linux 完成，只有 `codesign`/`hdiutil`/`xcrun` 这类苹果原生工具才要求 Mac。`.app` 文件本身不要求 Mac 机器。
