# Codex 工作规则

**当前源码目录 = 本工作区** `D:\源码开发\静音AI画板v4.0源码`（V11 源码的 v4.0 重构 clone；`package.json` 为 `jingyin-internal-canvas` v11.0.0）。所有改动落在这里，日常命令用目录自带的 `runtime\node\node.exe`。

> 2026-10-01 更正：原文写的是 `D:\静音AI绘画V11（源码）` —— 该路径在本机不存在（执行者已两次踩到）。V11 源目录（若有）只作为 `upstream` 对照，**默认不读取、不修改**。V10、V9、V8、V5、旧 `D:\RJ\ai-canvas` 和各 `静音AI绘画-WIN（V*）` 目录仍只作为备份、发布包或排查对象，默认不读取、不修改。

## 默认忽略

- `node_modules/`
- `dist/`
- `.secure-build/`
- `.release-temp/`
- `.codex-artifacts/`
- `data/`
- `logs/`
- 发布包目录 `D:\RJ\静音AI绘画-WIN（V*）`
- 旧安装/asar 修补目录 `D:\RJ\ai-canvas`

## 开发流程

1. 先确认本次目标、模块、复现方式和验收标准。
2. 用 `rg` 定位相关代码，避免全目录大范围读取。
3. 只改和本次目标直接相关的文件。
4. UI 或功能逻辑改动先看 `docs/V11维护文档/00-总索引.md` 和 `docs/V11维护文档/02-重复功能同步登记表.md`，确认是否有同类重复点需要同步。
> UI/视觉改动先看 `docs/V4.0-前端UI全局规范方案.md`；按钮/弹窗/版块外壳一律用 `src/shared/ui/` 组件，禁止新写旧按钮类。
5. API、KEY、登录授权、接口慢、401、413 问题先看 `docs/V11维护文档/04-API调用与登录系统地图.md`、`src/api/README.md`，不要在页面组件里散写 `fetch`。
6. 批量 tab 单独调整先看 `docs/V11维护文档/05-批量分区功能地图.md` 和 `src/features/outfit/workflows/<分区>/README.md`。
7. 默认提示词、SKILL、出图规则先看 `prompts/README.md`；优先改 `prompts/`，不要在 UI 重构时顺手改提示词。
8. 服务端改动至少运行 `runtime/node/node.exe scripts/verify/run-all.mjs`（或 `npm run check`）。
9. 前端或发布相关改动按风险运行 `runtime/node/node.exe node_modules/vite/bin/vite.js build`（或 `npm run build`）。
10. 默认只提交本次相关文件，避免混入已有未提交改动。
11. **封装前确认 `seed/manifest.json` 已同步**（V123 口径）：源码版设置页点「同步到封装配置」生成仓库根 `seed/manifest.json`（新鲜度提示一致即已同步）；封装默认读它、缺失硬失败。不要让 AI 封装会话靠口头交接或手动搬运种子文件——仓库真相源就是这份文件。

## 文档存放纪律

> V40 文档治理确立（2026-10-07 生效）。根目录只保留 5 份常设 md（AGENTS.md / README.md / 版本记录.md / V3-封存说明.md / V4.0-起步说明.md），其余 md 按生命周期归入 `docs/`，禁止扁平堆在根目录。

1. 新执行单一律建在 `docs/执行单/进行中/`，命名 `V4.0-执行单-Vxx-主题.md`（V 号顺延，主题用短横线连接）。
2. **交付当天**：把单文件移入 `docs/执行单/已完成/<YYYY-MM>/`，并同步更新 `docs/执行单/README.md` 总表（回填状态、关联 commit、完成日期）。总表是唯一索引，不更新等于白做。
3. 根目录禁止新增 md 文件；例外仅限 `AGENTS.md` / `README.md` 自身的维护。
4. 汇报类文档（执行汇报 / 隐患复查 / 自检汇报）一律进 `docs/复盘/`，禁止再在根目录生成 `*-执行汇报-YYYY-MM-DD.md`。
5. 所有 md 必须纳入 git 跟踪（游离文件先 `git add` 再操作），避免迁移/重命名时丢失。
6. 分类归口：设计类（`V4.0-设计-RF-*`）→ `docs/设计/`；台账与巨型存档（`REFACTOR_*`）→ `docs/存档-台账/`；方案/规划类并入 `docs/` 根（与既有工具文档同处）；交付报告 → `docs/历史交付报告/`。

## 基线 / 文档漂移门禁（V4.0 规范，2026-10-13 生效）

> 背景：V4.0 起步阶段连续踩到两类「代码改了、但配套物停留在旧位置」的漂移 ——
> ① 抽组件后忘了跑 `shared-ui-duplication-check.mjs --update`，基线 JSON 一直挂着陈旧的重复记账；
> ② README 写死 `D:\静音AI绘画V11（源码）\...`，该路径本机根本不存在却长期没人发现。
> 下面把"防漂移"固化成纪律，并由 `scripts/verify/` 的自动门禁兜底。

1. **改完代码必须同步配套物，再提交。** 任何以下动作后，立刻跑对应步骤，再跑 `npm run check` 全绿才准提交：
   - 移动 / 拆分文件、抽共享组件 → 跑 `shared-ui-duplication-check.mjs --update`、`frontend-duplication-check.mjs --update` 等刷新基线。
   - 改 `server/core/runtime-config.js` 默认值 → 先更新 `runtime-config-baseline.json` 再提交（或直接改基线并写明理由）。
   - 改 lint 规则 → 跑 `lint-ratchet-check.mjs --update`。
2. **文档只准用仓库相对路径，禁止写死本机绝对路径。** README / `docs/` / 根目录 md 里若出现本机不存在的绝对路径，会被 `docs-path-check.mjs` 判红并拦下提交。引用其它仓库（如上游克隆源）也优先用相对路径或显式标注。
3. **提交前门禁已自动化。** 项目提供 `scripts/git-hooks/pre-commit`：启用后每次 `git commit` 自动跑 `check-syntax` + `run-all.mjs --fast`（快速子集，纯源码/逻辑检查，约 40s，避开需起服务/VAE 的慢脚本），任一门禁失败即拦下提交。启用命令（仓库根执行）：
   `cp scripts/git-hooks/pre-commit .git/hooks/pre-commit`
   停用：`rm .git/hooks/pre-commit`。CI 侧应把 `npm run check`（全量）作为必过门禁；本地提交用 `--fast` 求快。
4. **不要带"半截改动"进提交。** 代码已修、但基线 JSON 没刷新 / 文档没更新 / 起步说明没同步的情况，一律视为未完成，先收口再提交。
5. **基线陈旧现在是硬门禁（2026-10-13 升级）。** `shared-ui` / `frontend` / `server` 三套重复棘轮，把"基线记录但代码已无"从"只报告(improved)"升级为"判红(stale)"：基线 JSON 里记的重复项，只要在代码里被消除（抽到 `src/shared/`、拆分文件），就必须跑对应脚本的 `--update` 刷新；否则 `stale` 非空 → 门禁判红、拦下提交。这正是为了杜绝"基线停留在老的不存在的位置"。`improved` 仍只报告不拦（仅指重复仍存在、但文件集/顺序与基线微变）。

## 删除操作纪律（safe-delete 劫持防线，2026-10-16 生效·硬性）

> 背景：客户端（WorkBuddy）给每个 bash / node 子进程注入了 safe-delete 劫持体系——bash 层经 `BASH_ENV` 定义 `rm()/unlink()/rmdir()` 函数、node 层经 `NODE_OPTIONS` patch `fs.unlinkSync/rmdirSync/rmSync` 等。**AI 在终端敲裸 `rm`、或 node 脚本调裸 `fs.rmSync`，只要目标不在系统 temp 下，文件不会真删，而是被移入 Windows 回收站**；且批量删除守卫会在 `%TEMP%\codebuddy-safe-delete-bulk\<hash>\.lock` 建锁目录，锁目录清理环节会把 `.lock` 也转存进回收站——批量执行单跑一轮，回收站就多几百上千个 `.lock`（2026-10-16 实测累计 3671 个索引，解码 100% 来自该目录）。**纪律写"别用 safe-delete 工具"是没用的——裸 `rm` 本身就是 safe-delete，必须写清允许的姿势。**

1. **bash 删文件/目录只允许 `/usr/bin/rm -rf <path>`**（绝对路径执行真二进制，绕过 shell 函数劫持）。禁止裸 `rm` / `rmdir` / `unlink` / `rm -rf`（不带绝对路径）。
2. **node 脚本删文件只允许两种姿势**：① 命令行前缀 `CODEBUDDY_SAFE_DELETE_ENABLED=0 node xxx.mjs`（官方 kill switch，shim 检测到 `"0"` 直接不装补丁）；② 脚本内 `spawnSync('/usr/bin/rm', ['-rf', p])` 调外部真二进制（不依赖"记得加前缀"，推荐用于仓库验证脚本）。禁止裸 `node xxx.mjs` 跑任何含 `fs.rmSync/rmdirSync/unlinkSync` 的脚本。
3. **PowerShell 允许 `Remove-Item -Recurse -Force`**（2026-10-16 实测 delta=0，不在劫持范围）。
4. **禁止调用任何 safe-delete / 软删除 / "先暂存再删"类客户端工具**；删除即可逆性有要求的产物（如用户数据）前，先确认目标清单。
5. **收尾核对两处增量（不是只扫工作区，工作区恒为 0）**：`%TEMP%\codebuddy-safe-delete*` 目录数、回收站 `.lock` 计数（`C:\$Recycle.Bin\<SID>\` 下 `$I*.lock` 索引数）。执行单结束后两处增量应≈0；并行会话在跑时增量归因需先确认无其他会话活动。
6. 存量 `.lock` 清理（用户要求时）用 `scripts/dev/recycle-bin-lock-clean.mjs`（默认 dry-run，`$I` 索引解码验证来源后才删，`--apply` 才真删，非 `.lock` 一律不碰）。

## GIT 仓库发布 / 同步流程（推送到 GitHub，2026-10-22 确立）

> 背景：账号 `sdssdfegg` 下原本有 3 个仓库（JY-Canvas / jingyin-internal-canvas / yan），已决策**只保留 JY-Canvas**，另两个于 2026-10-22 删除。JY-Canvas 的 `main` 分支就是本 4.0 源码的线上真相源，旧内容一律以本地为准覆盖。

### 关键信息（写死，勿改）
- 源码目录（本机绝对路径）：`D:\源码开发\静音AI画板v4.0源码`
  - 注：本文件顶部写的"本工作区"指的就是这个目录；AI 若在别的 working dir 启动，也以这条绝对路径为准，不要去读 `D:\静音AI绘画V11（源码）`（那是 `upstream` 对照源）。
- 远程 `origin`：`https://github.com/sdssdfegg/JY-Canvas.git`，分支 `main`（已设为默认分支）。
- 远程 `upstream`：本地路径 `D:\源码开发\静音AI绘画（源码）`（V11 上游对照），**只作对照，绝不 push**。
- 认证：GitHub 不支持账号密码做 git 操作，必须用品目访问令牌（PAT）。当前用 **fine-grained PAT**，需包含 Repository permissions → `Contents: Read and write`（推送必需）与 `Administration: Read and write`（删仓库 / 改设置用）。令牌由用户从 https://github.com/settings/tokens?type=beta 提供，默认 2026-10-29 过期；缺失写权限会报 `403 Permission ... denied to sdssdfegg`。

### ⚠️ 最大坑：agent 的 Bash 环境推不上去
- WorkBuddy 的 Bash 沙箱**只能访问 `api.github.com`，连不上 `github.com` 本体**（git 推送主机）。在此环境跑 `git push` / `git clone` / `git fetch` 必报 `Empty reply from server` 或 `Failed to connect to github.com:443`。
- 结论：**所有 git 网络操作那一步，必须让用户在自己电脑的终端（cmd / PowerShell / Git Bash，有正常外网）执行**；agent 只负责在本地准备（改代码、`commit`、配 `remote`）并给出"逐字可复制"的命令，不要反复在沙箱里试 push。

### 标准更新步骤（AI 准备 + 用户执行）
1. 在 `D:\源码开发\静音AI画板v4.0源码` 改代码，按上文"基线 / 文档漂移门禁"跑 `npm run check` 全绿（pre-commit 钩子也会拦，勿 `--no-verify` 绕过，除非明确要跳过且后果自担）。
2. 本地提交（按项目纪律只提交本次相关文件；全量同步可用 `git add -A`）：
   ```bat
   cd /d "D:\源码开发\静音AI画板v4.0源码"
   git add -A
   git commit -m "V4.0-更新说明"
   ```
3. 把下面这条交给用户，让其在**自己电脑**的终端执行（agent 在沙箱里跑会失败）：
   ```bat
   cd /d "D:\源码开发\静音AI画板v4.0源码" && git push --force origin main
   ```
   - 用 **force**：线上仓库旧内容以本地为准全量覆盖（用户既定策略；不是增量同步）。
   - 若弹"凭据助手选择器"，选 `wincred`（或 Git Credential Manager），勾"始终使用"；随后走浏览器 GitHub 登录，或在终端贴入 PAT（Username 任意填、Password 粘贴 `github_pat_` 开头的令牌）。
   - 看到 `main -> main (forced update)` 即成功。
4. 若 AI 曾在 remote URL 里临时嵌入令牌（如 `https://x-access-token:<PAT>@github.com/...`）用于本地推送，推送后立即还原，避免令牌留在 `.git/config`：
   ```bat
   git remote set-url origin https://github.com/sdssdfegg/JY-Canvas.git
   ```

### 安全提醒
- 用户的 GitHub 登录密码曾在对话中明文出现，建议去 https://github.com/settings/security 改掉；PAT 过期或不再需要时到 tokens 页 revoke。
- 令牌、密码**绝不写入仓库任何文件**，也别提交进 git。
