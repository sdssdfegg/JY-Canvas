# V11 重构 · 基线与工单明细

> 🗄️ **2026-10-19 冻结·历史台账**：本文件是 V11 时期的重构工单存档，**只读证据链，不再维护**。
> 现行工单口径一律以 `docs/执行单/README.md` 为准；本文件内容与现状冲突时，**以现状和现行台账为准**。

> 本文是 `REFACTOR_TICKETS.md` 拆分产物（2026-10-02）。
> 拆分原因：原件 189KB / 47k tokens，写入时报 `Win32 1175 (ERROR_UNABLE_TO_REMOVE_REPLACED)`；同时统筹整读吃力。
> 原件已改名留档为 `REFACTOR-存档-2026-10-02.md`（**只读参考，不再编辑**）。
> 本文 = **基线/接口地图 + 全部工单定义**（大、改动少）。
> 纪律、批次总览、冒烟分组、关键决策、变更记录都在枢纽 `REFACTOR_TICKETS.md` 里 —— **先读枢纽**。


---

### 0.1 快照事实（均为本工作区当前磁盘状态，可逐条复核）

| 事实 | 值 | 复核方式 |
| --- | --- | --- |
| `server/index.js` | **3888 行**，45 处 `app.use/get/post/delete` 注册 | 全文行数 + 路由注册扫描 |
| `server/core/` | **16 个模块**（app-paths、runtime-config、format-utils、generation-logger、uploads、app-settings、http-compression、file-naming、http-client、image-proxy、history-store、asset-urls、image-payload、asset-persist、image-error-policy、result-cache） | `server/core/*.js` 列举 |
| `server/routes/` | **不存在** | 目录列举 |
| `server/shared/` | **不存在** | 目录列举 |
| `src/main.jsx` / `src/outfit-workflow.jsx` / `src/image-editor.jsx` | 8953 / 11523 / 1104 行 | 全文行数 |
| `scripts/verify/run-all.mjs` ORDER | **35 项**（含 101 的 `state-singleton-check`、011 的 `app-paths-check`；另含元测试 `run-all-check`、启动器检查 `check-launcher`）。**数字位链**：101 前 33 → 101 后 **34** → 011 后 **35** → **`012` 与 `016` 都各自会让它 35→36，谁先做谁先占位，一律以改前 `--list` 为准** | `ORDER` 数组 |
| ESLint 棘轮基线 | error 0 / warning 26，按「文件\|规则」记账；`server/index.js\|no-unused-vars = 2` | `scripts/verify/lint-baseline.json` |
| ⚠️ 上格「26」是 **2026-09-25 生成基线时的历史值，不是当前真实总数** | 2026-10-01 全量 eslint 实测：`prompts/server/outfit-skill.js` 已是 **0 warning**（基线记的是 2 —— 该文件里 `referenceMentioned` / `masterWearingLockLines` 两个符号现已不存在）→ **当前真实总数低于 26**。故任何「总数必须等于 26」的写法都是错的；正确不变量是**刷新前后 current.total 不变（净增 0）** | `.codex-artifacts/baseline-2026-10-01/eslint-full.json` |
| 上述那 2 条的**真实构成** | 基线建立于 2026-09-25，当时是 `deferOutfitAutoSave`（刻意保留）+ `buildDetailPromptGroup`（已确认死代码）。后者已于 2026-09-30 删除 → **当前实际应为 1**，即 `server/index.js` 这一格多出 **1 个单位的余量**（棘轮允许变少）。搬家时会用到这笔余量，见 §4 D-2 | `V11-第4b阶段-lint行为风险审查与棘轮-交付报告-2026-09-25.md:224` + `版本记录.md:182` |
| 重复组件基线 | 仅 `ReferenceThumbTray`（`src/main.jsx` + `src/outfit-workflow.jsx`） | `scripts/verify/shared-ui-baseline.json` |
| 打包入口 | `scripts/secure-win-release.mjs` 的 `entryPoints` 硬编码 `server/index.js` | 该脚本内 |

### 0.2 ⚠️ 本会话未能执行任何命令（必须由你在真机复核）

本会话的文件沙盒对该工作区授权失败（`SetNamedSecurityInfoW failed (Win32 5): grantWrite(...)`），**所有 `pwsh` 调用在启动阶段即被拒绝**，因此：

- 本文**没有**实际运行过 `run-all.mjs`、`eslint`、`git`；所有结论均来自**逐文件静态取证**。
- 凡标注「**静态推定**」的结论，请在真机上用本文给出的命令确认后再据此开工。
- 沙盒通过 ≠ 功能正确：**每张工单的收尾都必须有你真机冒烟**，见 §3。

### 0.3 🔴 P0 发现：`npm run check` 当前应为**红**（静态推定，待真机确认）

**证据链（三条互不依赖）**：

1. `scripts/verify/local-edit-base-file-check.mjs:146-148` 断言 `src/outfit-workflow.jsx` 中存在
   `composeOutfitLocalEditBlob(` 换行后跟 `resolveLocalEditBaseFile(selectedBase),` 的调用形状，断言名即 `"批量：局部详情面板贴回底图同样走共享规则"`。
2. 全树取证：`LocalDetailPanel` 在 `src/` 下 **0 处**出现；`selectedBase` 在 `src/` 下 **0 处**出现；
   `composeOutfitLocalEditBlob(` 全树只有 **1 处**调用（`src/outfit-workflow.jsx:9476`），实参是 `originalFile`，不是 `selectedBase`。
3. `版本记录.md:183` 记载：2026-09-30 的清理提交把「**从未渲染的半成品组件 `LocalDetailPanel`**」及其唯一依赖一并删除。
   即：**断言的目标代码已被删除，断言没跟着删** → 该 check 恒为 `false` → 脚本 `process.exitCode = 1` → `run-all.mjs` 报失败 → `npm run check` 红。

**另有环境相关的一条红**（同一脚本）：`local-edit-base-file-check.mjs:368-370` 在拿不到浏览器回执时执行的是 `check(..., false)`，而不是 skip 语义。
所以**没装 Tabbit CLI 的机器上这个脚本必然失败**（其余脚本多是「部分跳过」语义）。是否要改成 skipped 语义是**门禁松紧的决策**，见 §4 待决策项 D-1，本文不擅自开单。

**真机确认命令**（先跑这两条，结果贴进开工记录）：

```powershell
cd "D:\源码开发\静音AI画板v4.0源码"
.\runtime\node\node.exe scripts\verify\run-all.mjs --only local-edit-base
.\runtime\node\node.exe scripts\verify\run-all.mjs
```

### 0.4 🟠 与任务书不一致之处（已按取证结论修正，不改的前提下不做臆测）

| 任务书描述 | 取证结论 | 处理 |
| --- | --- | --- |
| 问题③「`LocalDetailPanel` 没有使用 `resolveLocalEditBaseFile` 原图优先共享规则」 | 该组件在**本工作区不存在**（已作死代码删除）。现存**唯一**贴回路径 `src/outfit-workflow.jsx:9470 → 9476` 已使用 `resolveLocalEditBaseFile(task.modelItem)`，且被同一校验脚本 `:136-138` 覆盖 | 单子改为 **V11-RF-000：门禁僵尸断言修复**；`LocalDetailPanel` 的「复活」属**新功能**，不在这张重构单里 |
| 已抽离模块清单（任务书列 13 项） | 磁盘上 `server/core/` 实为 **16 个模块**（多出 `asset-persist.js`、`image-error-policy.js`、`result-cache.js`） | 本文以磁盘为准 |

### 0.5 标记语义

- 🔴 **串行**：必须先合并前置工单才能开始（共享同一段代码 / 会互相破坏基线 / 会改动同一文件同一区域）。
- 🟢 **可并行**：逻辑上无依赖，**执行先后可任意**。
  但注意：**任何时刻只允许一个人改 `server/index.js`**——本文拆出的路由与 core 工单都要动这个文件。
  多人并行时每人独立分支，最后统一 rebase；不允许两个分支同时改同一行区间。

### 0.6 每张工单都适用的通用验收基线（下称 **AB**）

- **AB-1 `run-all` 全绿**：`.\runtime\node\node.exe scripts\verify\run-all.mjs` → `[run-all] N 个脚本：通过 N，失败 0`，退出码 0。
  （浏览器类探针的 `skipped` 不算失败，但必须在 PR/提交说明里写明「哪些探针这次没跑」。）
- **AB-2 lint 棘轮不新增**：`.\runtime\node\node.exe scripts\verify\lint-ratchet-check.mjs` → `regressions` 为空。
  **新文件 = 新 key**：把代码搬进新模块后，新模块里出现的任何 warning 都算「新增」（`baseline.counts[新key] ?? 0`）；所以**搬运必须不带着 unused 变量走**。
- **AB-3 语法门禁**：`.\runtime\node\node.exe scripts\check-syntax.mjs` 通过（`check-syntax.mjs` 自动扫 `server/src/scripts/prompts`，无需人工登记新文件）。
- **AB-4 沙盒等价差分**：用 `scripts/verify/lib/sandbox.mjs` 的 `freshSandbox / stopChild / removeSandbox` 各起一个实例（搬家前 / 搬家后），对**同一组请求**比对四元组：
  ① HTTP 状态码与响应 JSON（剔除时间戳类字段）② 落盘产物 SHA256 ③ `logs/tasks/<日期>/<任务ID>.txt` 文本 ④ `data/history.json` 指纹。
  差分不一致 = 该工单不通过，**当场回退，不允许「顺手修一下」**。
  🔴 **AB-4 补充（2026-10-01 起生效·值级复核）**：凡搬运涉及 `import.meta.url` / `__filename` / `__dirname` / `process.cwd()` / `path.resolve(自身所在目录, …)` 的代码，
  **必须做「值级」复核**（打印搬运前后的实际解析结果并比对），**文本级 diff 无法发现随目录深度变化的偏移**。
  实例见 §1.3（`app-paths` 的 `rootDir` 因从 `server/` 搬到 `server/core/` 而整体下移一层，逐字未改却改了行为）。
- **AB-5 提交纪律**：一张工单一个 commit。commit message 必须二选一写明：
  「仅结构搬运，无逻辑改动（逐字节等价）」 / 「仅修 bug，无结构改动」。
  **结构搬运与 bug 修复禁止出现在同一个 commit**。
- **AB-6 行号锚定**：本文给出的行区间只对**当前快照**有效，前置工单合并后必然漂移。
  实际切割请按「函数名 + 相邻注释」锚定，禁止按行号盲切（见 `V4.0-起步说明.md` 记录的 V11/v4 行号漂移坑）。

### 0.7 通用禁止修改清单（下称 **G**，每张工单的「禁止修改文件清单」= G + 该单的额外项）

- **G-1** `server/skill-baselines/**` —— V3 对照副本，**禁止修改任何文件**。
- **G-2** `prompts/**` —— 提示词与后端规则集；本清单无任何工单需要动它（改了就是另一个工单、必须单独确认）。
- **G-3** `scripts/verify/lint-baseline.json`、`scripts/verify/shared-ui-baseline.json`、`scripts/verify/runtime-config-baseline.json`
  —— 只有工单**明确要求**时才能 `--update`，且必须在 commit message 写原因。**禁止用 `--update` 掩盖新增问题**。
- **G-4** `server/static-assets.generated.js`、`dist/**`、`data/**`、`logs/**`、`tmp/**`、`node_modules/**`、`.codex-artifacts/**` —— 生成物/运行目录，不手工维护。
- **G-5** `server/index.js` 的 `deferOutfitAutoSave`（快照第 2772 行）—— **刻意保留**的 unused 门禁标记。
  禁止删除、禁止加 `void`、禁止为消除 lint 警告改它。（配套行为钉桩：`outfit-defer-autosave-check.mjs`。）
- **G-6** 红线：禁止新增任何渠道商 KEY、禁止内置旧直连地址、生图/视频只允许 `https://api.jingyin.online/v1`。
  本轮所有搬运**不得触碰** `PRIMARY_CHANNEL_API_BASE_URL` 及其取值来源。
- **G-7** `src/main.jsx`、`src/outfit-workflow.jsx` 不得整体搬迁；仅允许 V11-RF-002 / V11-RF-003 点名的小范围改动。
- **G-8** 搬运时禁止改名（函数/常量/导出名一律逐字保留），禁止调整语句顺序，禁止重排 import 语义，禁止「顺手格式化」。
  唯一允许的例外是 V11-RF-116（启动模块必须把 `app` 作为参数注入，见该单说明）。

### 0.8 接口 → 校验脚本速查（写「自测校验点」时直接查这张表）

| 接口 | 覆盖它的脚本 |
| --- | --- |
| `/api/config` | `http-mock-check` |
| `/api/health` | `error-boundary-check`、`check-launcher`（ps1 文案）、几乎所有脚本的实例就绪探测 |
| `/api/connection-test` | `connection-test-check` |
| `/api/ecommerce/routing`、`/api/gateways*` | `routing-check` |
| `/api/client-diagnostic-event` | `local-edit-base-file-check`（端到端写日志段） |
| `/api/images` | `http-mock-check`、`generation-failure-path-check`、`pro-wire-check` |
| `/api/generate-outfit` | `http-mock-check`、`outfit-defer-autosave-check`、`outfit-intent-request-check`、`retouch-intent-request-check`、`batch-prompt-passthrough-check`、`image-host-allowlist-check`、`local-edit-base-file-check` |
| `/api/save-processed-image` | `white-refine-split-check`（另有**源码级**断言，见 V11-RF-208） |
| `/api/history`、`/api/history/repair` | `history-integrity-check`、`history-repair-check` |
| `/api/canvas-assets`、`/api/canvas-asset/:filename` | `canvas-asset-check` |
| `/api/image-proxy` | `image-host-allowlist-check` |
| `/api/result/:filename` | `history-integrity-check`、`outfit-defer-autosave-check` |
| `/api/videos/*` | **无专用脚本** → 只能靠沙盒差分 + 真机冒烟（见 §3 组C） |
| `/api/storage/*`、`/api/save-directory`、`/api/pick-directory`、`/api/detail-prompts`、`/api/quick-prompt-rewrite`、`/api/reference-prompt-rewrite`、`/api/outfit-master-fit-analysis`、`/api/outfit-quality-check` | **无专用脚本** → 沙盒差分 + 真机冒烟（§3 组B/D/E） |

## 2. 工单

### 批次 0 · 门禁

---

#### V11-RF-000 · 修掉 `local-edit-base-file-check` 的僵尸断言（门禁当前为红）

> **分步操作单**：[V4.0-执行单-V11-RF-000-010.md](V4.0-执行单-V11-RF-000-010.md) §1（含 0-1~0-9 九步与收尾自检清单）

- **任务类型**：【bug修复】（修的是**验证脚本**，不是业务代码；不改任何业务行为）
- **目标操作文件**：
  - `scripts/verify/local-edit-base-file-check.mjs`（第 146-148 行那条断言；必要时补注释说明）
- **前置依赖任务ID**：无（**必须第一个做**，否则后面每一单的 AB-1 都无从判断）
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`src/outfit-workflow.jsx`、`src/main.jsx`、`src/shared/local-edit-geometry.js`（本单**只许动验证脚本**）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（已确认该脚本当前恒红，修完必须转绿）。
  2. **AB-2 lint 棘轮基线不能新增问题**（本单不产生新文件，理论上无变化；仍须实跑确认）。
  3. 该脚本自身 `results` 中不再出现由这条断言产生的 `false`；`--only local-edit-base` 退出码 0（**前提**：真机装有 `%LOCALAPPDATA%\Tabbit\LocalAgent\bin\tabbit-cli.exe`；没有时按 §4 D-1 决策）。
  4. 两分支决策写进 commit message：
     - **分支A（推荐）**：删除该断言，并在脚本注释写明「断言目标 `LocalDetailPanel` 已于 2026-09-30 作为从未渲染的半成品删除，原图优先规则由 136-138 行的四条断言覆盖」。
     - **分支B**：若业务上确要复活「局部详情面板」，**另开新功能单**（不属于本重构清单）；本单仍按分支A先解除门禁红。
  5. `outfit-defer-autosave-check`、`local-edit-base-file-check` 逻辑级断言（原图优先 / 缺原图退回副本 / null 安全）全部保持通过 —— **搬脚本不许削弱已有判别力**。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only local-edit-base`（期望退出码 0）
  - 负向验证（必须有）：临时把 `src/outfit-workflow.jsx:9470` 的 `resolveLocalEditBaseFile(task.modelItem)` 改成取上传副本 → 该脚本 **136-138 行必须变红** → 改回。证明剩余断言仍有判别力。
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs`（全套）
- **真机冒烟**：不需要独立冒烟（无业务改动）；但**必须在真机跑一次全套**，结果贴进开工记录。

---

### 批次 1 · 三处已知问题（②① 为真 bug；③ 见 V11-RF-000）

---

#### V11-RF-001 · `normalizeApiKeyInput` 清洗顺序导致部分粘贴来源 401（问题②）

- **任务类型**：【bug修复】
- **目标操作文件**：
  - `src/features/auth/api-key.js`（第 1-7 行的 `normalizeApiKeyInput`）
  - `server/features/auth/api-key.js`（第 1-7 行，**两份必须逐字一致**）
- **前置依赖任务ID**：无
  **【事实开工门槛（评审 D5-2）：V11-RF-000 已合入，且全套 `npm run check` 绿灯；禁止与 V11-RF-000 的负向测试窗口并行操作】**（000 的 0-7 会临时改坏业务源码，同期操作会让失败归属无法判定）
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`scripts/verify/auth-key-parity-check.mjs`（**禁止**改脚本或其 `knownDefects` 白名单 —— 修好后缺陷条目必须**自动消失**，改脚本即视为作弊）、`server/core/image-error-policy.js`（`resolveApiKey` 只是转发，不得改）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**；其中 `auth-key-parity-check` 必须仍为通过（20 个用例前后端逐字节一致 + 6 条关键规则生效）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. `auth-key-parity-check` 输出的 `knownDefectCount` 由 1 → **0**，`knownDefects` 为空数组，**且未修改该脚本**。
  4. 目标行为（脚本 `:135-136` 的同一条用例）：输入 `'Bearer \u200B"sk-jingyin-123456"\uFEFF '` → 输出必须恰为 `sk-jingyin-123456`。
  5. 不变量不得回退（脚本 `:88-102` 已钉）：去 `Bearer`（大小写不敏感）、去首尾引号、去 `\s` 与 `\u200B-\u200D\uFEFF`、中间空格也删、空/`null`/`undefined` 返回 `""` 不抛异常。
  6. 两份实现 diff 为空（防「改一边忘一边」）。
  7. 保持纯函数、无副作用；不改函数名、不改导出名、不新增依赖。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only auth-key` → `ok:true` 且 `knownDefectCount:0`
  - `git diff --stat src/features/auth/api-key.js server/features/auth/api-key.js` → 两文件改动行数相同、内容一致
  - 手工用例（不写进脚本，临时 node -e 验证后丢弃）：微信粘贴样本 `'"sk-xxx"\u200B'`、Excel 样本 `'\t"sk-xxx"\t'`
- **真机冒烟**：**【必须·独立】** 从**微信聊天窗口**复制一个真 KEY（首尾带不可见字符）→ 粘贴进设置 → 保存 → 直接出图。看：① 界面显示无引号残留 ② 请求 200 ③ `logs/tasks/<日期>/` 里该请求没有 401/`invalid_api_key`。

---

#### V11-RF-002 · 批量版 `ReferenceThumbTray` 缺失 P1 修复（问题①，只修行为，不搬代码）

- **任务类型**：【bug修复】（**本单禁止同时抽组件**——抽取是 V11-RF-003，必须另一个 commit）
- **目标操作文件**：
  - `src/outfit-workflow.jsx`（`ReferenceThumbTray`，快照第 2697-2757 行；以及第 82 行的 `result-image.js` import 行；调用点第 10430-10437 行需复核签名）
- **前置依赖任务ID**：无
  **【事实开工门槛（评审 D5-2）：V11-RF-000 已合入，且全套 `npm run check` 绿灯；禁止与 V11-RF-000 的负向测试窗口并行操作】**（000 的负向验证会**临时改坏本单要动的同一个文件** `src/outfit-workflow.jsx`，同期操作必然互相污染）
  **另：不与 V11-RF-010 之后的任何文件搬家同期执行**（搬家会改动校验脚本的扫描范围，同期做会让失败归属无法判定）
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：
  - `src/main.jsx` 的 `ReferenceThumbTray`（第 1291-1362 行）与 `CachedImage`（第 1198 行）——**本单是单侧补齐，不是双侧改写**
  - `src/shared/result-image.js`（只许 import，不许改）
  - `scripts/verify/shared-ui-baseline.json`（**禁止** `--update`：本单不消除重复，重复基线保持原样）
  - `src/outfit-workflow.css` / `src/styles.css`（样式不动）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**；其中 `shared-ui-duplication-check` 必须仍为 `ok:true`
     （`ReferenceThumbTray` 实现哈希仍不一致 → 该脚本会继续把它挂在 `drifted` 里，这是**预期**，属存量，不判死）。
  2. **AB-2 lint 棘轮基线不能新增问题**（新增 import 必须真的被用上，否则产生新的 `no-unused-vars` → 直接判不通过）。
  3. 批量版行为向主画板版对齐，**且只对齐 P1 那两条**：
     - a) 带 `missing: true` 标记的参考图**不再渲染、不再发请求**；
     - b) 地址不在白名单的参考图**不再渲染、不再发请求**（改用 `isAllowedReferenceImage(reference, referenceSource)`）。
     - 缺失数量 > 0 或仅剩数量提示时，仍渲染原有的「N 张参考」数量提示（`referenceCountPill`），`title` 文案与主画板版同义。
  4. **不得改变**批量版自身的既有契约（这是与主画板版的真实差异，本单不合并它们）：
     - `onOpen(reference, index, items)` 的调用形状与第 10434 行调用点的期望保持一致；
     - 仍用原生 `<img>`（不引入 `CachedImage`）；
     - `key` 兜底、`className`、`onContextMenu` / `onImageDragStart` 行为逐字保持。
  5. 不引入新的跨文件同名组件；不新增样式类名。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only shared-ui`（期望 `ok:true`，`drifted` 仍列出 ReferenceThumbTray）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only ui-duplication` 与 `--only modal-shell`（回归）
  - 静态自查：`isAllowedReferenceImage` 在 `src/outfit-workflow.jsx` 中确有使用点（否则 lint 会红）
- **真机冒烟**：**【必须·独立】** 批量页 → 打开一条**含失效参考图**的历史记录（或用旧记录复现）→ 观察：① 网络面板**不再**对失效/非白名单地址发请求 ② 缩略条显示数量提示而不是破图 ③ 正常参考图仍能点开大图、右键菜单、拖拽。

---

#### V11-RF-011 · 🔴 热修：`server/core/app-paths.js` 的 `rootDir` 少一层（源码模式 data/logs 落进源码树）

> **背景与新发现**：见 §1.3（含考古对照证据）。这是 **既有缺陷**（Phase 1 把 app-paths 从 `server/` 搬到 `server/core/` 时引入），**不是** V11-RF-101/102/103 造成的。
> **决策（2026-10-01）**：**先修本单，再跑批次 3 的真机验收**（采纳"方案 A"）—— 否则 AB-1 里 `local-edit-base-file-check` 的端到端断言会失败，看起来像三单的回归，每跑一次都要重新人工判断。
> **分步操作单**：[V4.0-执行单-V11-RF-011.md](V4.0-执行单-V11-RF-011.md)（P1 人工决策门 + 12 步 + 值级复核对照表 + 判读速查 + 自检清单）

- **任务类型**：【bug修复】（**只改行为，不做任何结构搬运**；独立 commit，禁止与任何搬迁单同提交）
- **目标操作文件**：
  - `server/core/app-paths.js`（`sourceRootDir` 的层级计算，快照 `:25-26`；必要时同步该文件顶部那条已经失效的注释"5. 源码开发模式 → 仓库根目录"）
  - 新增一条断言脚本（建议 `scripts/verify/app-paths-check.mjs`，**纯进程内、不 spawn**）并登记进 `run-all.mjs` 的 `ORDER`（脚本数 **34 → 35**）
- **前置依赖任务ID**：无
- **标记**：🔴 串行（与批次 3 的真机验收互斥：**要么先修完再跑 AB-1，要么在跑 AB-1 时明确按 §1.3 的预警忽略该失败项**，二选一并记录）
- **禁止修改文件清单**：G 全部；额外禁止：
  - `server/skill-baselines/**`（V3 对照副本，**只许读来对照**）
  - 任何 `*baseline*.json`
  - **`data/**`、`logs/**`、`server/data/**`、`server/logs/**`**：本单**只允许读**，**禁止**任何自动搬迁/删除动作（数据搬迁是人工决策）
  - `server/index.js` 与三个新 core 模块（本单**不得**顺手动批次 3 的文件）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**；**AB-2 lint 棘轮基线不能新增问题**。
  2. **修复依据可复现**：`server/skill-baselines/V3-…-2026-08-06/server-index.js:32-33,50` 与 `server/core/app-paths.js:25-26,44` 三行逐字对应，但两文件**所在目录深度不同** ⇒ `path.resolve(runtimeDir, "..")` 的**值**从 `<root>` 变成 `<root>/server`。
  3. 修复后（源码模式）新增断言必须证明：**`rootDir` == 仓库根**（即 `<root>/data`、`<root>/logs` 为落点），并断言**打包分支优先级未被破坏**（`JINGYIN_RELEASE_ROOT` / macOS / `%LOCALAPPDATA%\静音AI绘画数据` / 自带 `dist` 四种情形仍优先于源码兜底）。
  4. **正向 + 负向成对**：断言在修好的代码上通过；把层级改回少一层的写法 → 断言**必须变红并点明实际解析值**。
  5. 🔴 **数据落点确认（人工前置，不得跳过）**：先检查是否存在 `<root>/server/data`、`<root>/server/logs` 里已积累的**真实**数据（本轮已知只有 17 个测试残留日志）；若存在真实数据，**必须由人决定**是否迁移、如何迁移，并把决定写进 commit message。**禁止**脚本自动搬。
  6. 修复后 `local-edit-base-file-check` 的端到端断言（"服务端：把该事件写进任务日志"与"临时任务日志已清理"）应在**能起实例的真机上转为 PASS** —— 这是本单最强的验收证据（它此前一直被这条缺陷挡住，见 §1.3 影响 2）。
  7. 🔴 **必须有连带行为变化的记录（前端挂载分支切换）**：`server/index.js` 的 `attachFrontend()` 用 `path.join(rootDir, "dist")` 判断磁盘前端是否存在。
     - **改前**：`rootDir` 指错 ⇒ `<root>/server/dist` 不存在 ⇒ 生产模式走**内嵌静态资源**（`server/static-assets.generated.js`）；
     - **改后**：`<root>/dist/index.html` **确实存在**（已核）⇒ 生产模式改走**磁盘 `dist/`**。
     所以本单**必须**：先跑一次前端构建让 `<root>/dist` 与当前 `src/` 一致，再真机对照界面；并在 commit message 里写明"前端来源分支由内嵌切换为磁盘 dist"。
     ⚠️ 若真机界面**变旧**，那是 `<root>/dist` 过期（本修复把一直没被用到的 dist 启用了），**处理方式是重新构建，不是回退本单**。
- **自测校验点**：
  - 值级复核（AB-4 补充）：分别在**修复前/后**打印源码模式下的 `rootDir` / `dataDir` / `logs` 落点，并排比对（这是本单的核心证据）
  - `.\runtime\node\node.exe scripts\verify\app-paths-check.mjs`（正/负向各一次）
  - `run-all --list` 由 **34 → 35**
  - 真机：起一次服务 → 确认日志写到 `<root>/logs/tasks/<日期>/`（而不是 `server/logs/`）→ 跑一次 `local-edit-base-file-check` 的端到端段
- **真机冒烟**：**【必须·独立】**：双击 `启动静音内测画板.bat` → 出一张图 → 确认数据/日志落在**仓库根**的 `data/`、`logs/`（而不是 `server/` 下）；再从设置里看历史记录是否仍能读到旧数据（若旧数据在 `server/data`，此处会暴露"要不要迁移"的问题）。

---

#### V11-RF-012 · 把「并发队列语义」固化进门禁（L2-101 转正）

> **决策（2026-10-01）**：L2 测试原先只落在 `.codex-artifacts/`（gitignored）⇒ **它们是取证、不是门禁，下次没人会跑**。按"至少固化 101 那条"的建议开出本小单（101 守的是**单例契约**里"这一份的行为"，与源码级的 `state-singleton-check` 互补）。
> **分步操作单**：待补（本单很小，照本条执行即可；开工前记下改前 `--list` 数字）

- **任务类型**：【结构搬运重构】（**只增验证，零业务改动**）
- **目标操作文件**：
  - 新建 `scripts/verify/image-queue-semantics-check.mjs`（**纯进程内**，直接 import `server/core/image-concurrency.js`，不 spawn、不起服务）
  - 改 `scripts/verify/run-all.mjs` 的 `ORDER`（加一行；数字位见下）
- **前置依赖任务ID**：V11-RF-101（已提交于 `6d9716a`）
- **标记**：🟢 可并行（与 V11-RF-011 无逻辑依赖，但**两者抢同一个数字位**：谁先做谁先占，**一律以改前 `--list` 为准**，不要互相假定 35/36）
- **禁止修改文件清单**：G 全部；额外禁止：
  - `server/core/image-concurrency.js`（本单**零业务改动**；若断言发现模块行为与契约不符 → **另开 bug 单**，不要在本单里改业务代码）
  - 任何 `*baseline*.json`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**；**AB-2 lint 棘轮基线不能新增问题**。
  2. 断言至少覆盖（把 `.codex-artifacts/batch3-2026-10-01/l2-101.mjs` 的 13 项**转正**，并补齐边界）：
     - `imageSlotWeight` 记账：超过 `IMAGE_CONCURRENCY_LIMIT` 被夹住；`0` / 非数字 → `1`；中间值原样；
     - 取满 `IMAGE_CONCURRENCY_LIMIT` 后，第 N+1 个**进入排队**且**尚未被放行**；
     - 释放一个后**按 FIFO 放行**，`active` 回到上限、`queued` 归 0；
     - **重复释放是 no-op**，`active` **不为负**；
     - 快照**返回新对象**，且改写返回值**不影响**内部状态（只读契约）；
     - 全部释放后 `active` 回到 `0`。
  3. **不许把测试写脆**：等待放行用**确定性的任务让渡**（微/宏任务顺序），并在注释里写明依赖的是哪一层任务队列；不要依赖墙钟睡眠或"重试若干次"。
  4. 文件头必须写清与 `state-singleton-check` 的分工：**前者管"状态只有一份"（源码级）**，**本单管"这一份的行为契约"（运行级）** —— 两者一起才构成 101 的完整护栏。
- **自测校验点**：
  - 新脚本正/负向成对：把 `imageSlotWeight` 的夹取临时改错（例如去掉上限）→ 新脚本**必须变红并打印实际值** → 逐字节还原；
  - `run-all --list` 相对改前 **+1**（011 未做则 34→35；011 已做则 35→36）；
  - `run-all-check` 的"顺序表覆盖所有磁盘脚本"不报漏登记。
- **真机冒烟**：不需要（纯进程内逻辑）；但**必须**在能 spawn 的终端跑一次全套，确认新脚本没影响其它脚本的顺序与结论。

---

#### V11-RF-014 · `run-all.mjs` 用 `process.exit()` 硬退出，管道输出会被截断（元测试偶发红）

> **发现来源（2026-10-01 真机首跑）**：全套 **34/35**，唯一失败是元测试 `run-all-check`，失败项为
> 「run-all：人读输出里点名失败脚本」，detail = `status=1 输出未点名`（即**退出码正确、但输出里找不到 `失败脚本：__fail-fixture-check`**）。
> 而在**用户自己的终端里**（TTY）同一命令**能看到**那行 `[run-all] 失败脚本：…` ⇒ 典型的"管道 vs TTY"差异。

- **任务类型**：【bug修复】（**测试基建**，零业务改动；独立 commit）
- **目标操作文件**：`scripts/verify/run-all.mjs`（**结尾处**：`process.exit(failed.length === 0 ? 0 : 1);`）
- **前置依赖任务ID**：无
- **标记**：🟢 可并行（但建议**排在 011 提交之前**，见验收条件 3）
- **禁止修改文件清单**：G 全部；额外禁止：任何业务代码、任何 `*baseline*.json`、`run-all.mjs` 的 `ORDER` 顺序表（本单只改结尾那一行）
- **根因（已定位，可直接复核）**：`run-all.mjs` 结尾用 `process.exit(code)` **强制退出**。Node 文档明确：`process.exit()` 会"尽快退出，**即使还有未完成的异步 I/O**（包括写到 `process.stdout`/`process.stderr` 的）"。
  - stdout 是 **TTY**（用户终端）→ 写入同步 → 最后几行正常显示；
  - stdout 是**管道**（`run-all-check` 用 `spawnSync(..., {encoding:"utf8"})` 捕获）→ 写入异步 → **最后一行 `失败脚本：…` 可能被丢掉** ⇒ 元测试正则匹配失败。
  - 这也解释了它为什么是**偶发**：取决于时序，不取决于代码正确性。
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（**35 项、失败 0**）；**AB-2 lint 棘轮基线不能新增问题**。
  2. 改法：把强制退出改成"设置退出码后正常结束"（`process.exitCode = …`），让 Node 自己 flush 完再退；**不得**顺手改其它任何输出/逻辑。
  3. **稳定性验证（本单的核心）**：连续跑 `run-all-check` **至少 3 次**，每次都必须是 `ok:true`（偶发 bug 必须用重复跑证明修掉了，而不是一次通过就算）。
  4. 顺带记录：`.[\runtime\node\node.exe scripts\verify\run-all.mjs]` 的末行 `[run-all] 失败脚本：…` 在**管道捕获**下也能稳定出现（可用 `--only __fail-fixture-check` 单测这一条路径）。
- **自测校验点**：
  - `scripts/verify/run-all-check.mjs` 连跑 3 次全绿；
  - `run-all --only __fail-fixture-check` 退出码 1 且输出含 `失败脚本：__fail-fixture-check`；
  - 全套 35/35。
- **真机冒烟**：不需要（纯测试基建）。
- **为什么建议排在 011 之前**：011 的提交门槛写的是"全套 **35 项失败 0**"。有这么一条**已知偶发**的红，门槛就退化成"人工判断例外"，以后每单都要重复判断一次 —— 用 1 行改动把门槛恢复成"二值"，比每次豁免更省事。
- **✅ 2026-10-01 真机复核：修复生效** —— 真机跑 `run-all-check.mjs` 后，「run-all：人读输出里点名失败脚本」已变为 **`pass: true`**（此前在管道捕获下必红）⇒ 本单**已闭环**。

---

#### V11-RF-015 · `run-all-check.mjs` 两条**过时断言**（按 `check-syntax.mjs` 改造前的老写法检查 `package.json`）

> **发现来源（2026-10-01 真机复核 V11-RF-014 时一并暴露）**：`run-all-check` 报 `ok:false`、`failed:2`，两条失败都不是业务问题，而是**断言内容过期**：
> - 「check 仍然包含全部源码语法检查（14 个 `node --check` 目标）」→ detail `实际 0 个`
> - 「保留 `check:syntax` 便于单独跑语法检查」→ 要求含字面量 `node --check`

- **任务类型**：【bug修复】（**测试基建**，零业务改动；独立 commit）
- **目标操作文件**：`scripts/verify/run-all-check.mjs`（`34-41` 两条断言；外加 detail 文案中性化，见验收 4）
- **前置依赖任务ID**：V11-RF-014（已完成）
- **标记**：🟢 可并行（但**建议排在"全套 35/35"确认之前**，否则那条门槛永远差一项）
- **禁止修改文件清单**：G 全部；额外禁止：**`package.json`**（见下方"别修错方向"）、任何业务代码、任何 `*baseline*.json`
- **根因（已定位）**：`package.json` 的语法检查入口**早已改成** `scripts/check-syntax.mjs`（espree 进程内自动扫描 `server/src/scripts/prompts`，见该文件头部注释与 `V4.0-起步说明.md` 的"node --check 清单会腐烂"一节）：
  - 现在 `check` = `node scripts/check-syntax.mjs && node scripts/verify/run-all.mjs`
  - 现在 `check:syntax` = `node scripts/check-syntax.mjs`
  但 `run-all-check.mjs` 里那两条断言**还停留在"package.json 里有一串手写的 `node --check <文件>`"的旧设计**（旧设计要求正好 14 个目标）⇒ 正则匹配 0 个、`check:syntax` 不含 `node --check` ⇒ **永远红**。`run-all-check` 自己的另一条断言（`:31-33`「`check` 里串上了 run-all」）**当时改过了**，这两条漏改。
- **🔴 别修错方向**：**不要**为了迎合断言，把 14 条 `node --check <文件>` 写回 `package.json` —— 那正是当年被删掉的"会腐烂的手写清单"（每加一个后端模块就要手动添一行）。**要改的是断言**。
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（**35 项、失败 0**）；**AB-2 lint 棘轮基线不能新增问题**。
  2. 断言 3 改为**按新设计检查**：`check` 必须包含 `scripts/check-syntax.mjs`（语法检查入口在位）。
     **建议再补一条更强的**：从 `scripts/check-syntax.mjs` 源码里读出 `SCAN_ROOTS`，断言它覆盖 `server`、`src`、`scripts`、`prompts`（这才是"覆盖全部源码"这一意图在新设计下的等价物）。
  3. 断言 4 改为：`check:syntax` 存在且指向 `scripts/check-syntax.mjs`（不再要求含 `node --check`）。
  4. **detail 文案中性化（顺手，但要做）**：现在 `check(name, cond, detail)` 的 `detail` **无论通过与否都会打印**，而且有两处写成了"结论式"文本 ——
     - `:142` `status=${…} 输出未点名`
     - `:124` `夹具混进默认列表了`
     于是**通过时也会显示"未点名/混进列表了"**，把读者带偏（本次已实际误导过两轮）。改成中性描述（如 `status=1 stdout含点名=true`）。
  5. 不得削弱其它断言的判别力：改完后**负向验证**——临时把 `package.json` 的 `check` 改成不含 `check-syntax.mjs`，断言 3 必须变红并说明缺了什么；复原。
- **自测校验点**：
  - `scripts/verify/run-all-check.mjs` **连续 3 次** `ok:true`、`failed:0`、`total` 不变（偶发类改动必须重复跑）；
  - `run-all --list` 仍 **35 项**；
  - **全套 `run-all` = 35 项、失败 0**（这一步同时是 **V11-RF-011 提交门槛的最终观测**——011 已提交，但"35/35"此前从未被观测到）。
- **真机冒烟**：不需要（纯测试基建）。
- **完成后的连带效果**：这是"全套 35/35"的**最后一块拼图**；它绿了，`V11-RF-011` 与批次 3 前三单的 AB-1 才算形式上闭环，之后才可以开 `V11-RF-104`。
- **✅ 2026-10-01 真机复核通过**：`run-all-check` 由 `ok:false`（failed 2）转为 **`ok:true`、`total:27`、`failed:0`**；全套 **35/35** ⇒ 本单闭环。

---

#### V11-RF-016 · 新增「服务端同名函数重复」门禁（把 RF-106 暴露的漂移源机器化）

> **为什么值得做**：前端跨文件同名组件已有机器门禁（`shared-ui-duplication-check`），但**服务端函数没有**。
> 2026-10-01 `V11-RF-106` 就实际产生了 **`imageParamsForBaseUrl` / `imageChannelBaseCandidates` 各 2 处定义**（`index.js` + 新模块的逐字节副本）—— 这正是"登记表拦不住、只靠人记性必然漂移"的那类问题，和当初 `ReferenceThumbTray` 分叉是同一个病。

- **任务类型**：【结构搬运重构】（**测试基建**，零业务改动；独立 commit）
- **目标操作文件**：新建 `scripts/verify/server-duplication-check.mjs`；改 `scripts/verify/run-all.mjs` 的 `ORDER`（登记一行；脚本数 **35 → 36**）
- **前置依赖任务ID**：V11-RF-010（复用其 `lib/server-sources.mjs` 作为源码真相源）
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：任何 `server/**` 业务代码、任何 `*baseline*.json`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**；**AB-2 lint 棘轮基线不能新增问题**。
  2. 断言内容：扫描**服务端源码**（复用 `listServerSourceFiles()`），找出**跨文件同名**的顶层 `function` 声明；对存量做**棘轮记账**（允许存在、新增即失败），并单独报告"同一份实现被复制"的可疑项。
  3. **棘轮要有基线文件**：`scripts/verify/server-duplication-baseline.json`，配套 `--update`，与 `shared-ui-baseline.json` 同款。
  4. **首跑必须先把现有存量登记清楚**，至少包含：`imageParamsForBaseUrl`、`imageChannelBaseCandidates`（RF-106 遗留，等 **V11-RF-110** 收口后从账单里划掉）、以及 `skill-baselines` 下的历史副本（**必须排除**，那是冻结快照）。
  5. **负向验证**：临时把 `server/core/` 下某个函数复制到另一个服务端文件 → 该门禁**必须变红并点名两处文件** → 复原。
- **自测校验点**：新脚本正/负向成对；`--list` 由 35 → 36；`run-all-check` 的"顺序表覆盖所有磁盘脚本"不报漏登记。
- **真机冒烟**：不需要（纯源码检查）。
- **与 V11-RF-110 的关系**：110 收口后要跑一次 `--update` 把那两条从账单划掉 —— **这正好证明门禁在跟着代码走**，而不是一份死账。

---

#### V11-RF-003 · `ReferenceThumbTray` 抽到 `src/shared/ui/`（结构与接口归一，前端，可选后置）

> **分步操作单**：待补（本单为可选后置，开工前先确认 V11-RF-002 已合入且 `run-all` 绿）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：
  - 新建：`src/shared/ui/ReferenceThumbTray.jsx`
  - 改：`src/main.jsx`（删除本地定义 1291-1362 行 → 改 import；调用点 7185 / 7236 / 7793 / 8084 行复核）
  - 改：`src/outfit-workflow.jsx`（删除本地定义 → 改 import；调用点 10430-10437 行复核）
  - 改：`scripts/verify/shared-ui-baseline.json`（**本单明确要求** `--update` 把 `ReferenceThumbTray` 从重复账单划掉 —— G-3 的授权例外）
- **前置依赖任务ID**：**V11-RF-002**（必须在两份行为对齐后再抽；否则等于把 P1 差异固化进共享组件）
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`src/features/outfit/workflows/**`、`src/shared/result-image.js`、两个 CSS 文件（类名与作用域**不得**改：批量侧样式挂在 `.outfitWorkflowEmbedded` 作用域下，主画板侧是全局同名类，改名即视觉回归）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**；`shared-ui-duplication-check` 由 `ok:true + drifted:1` 变为 **`ok:true` 且 `duplicates` 不含 `ReferenceThumbTray`**。
  2. **AB-2 lint 棘轮基线不能新增问题**；特别地，新文件不得引入 `react-hooks/exhaustive-deps` 或 `no-unused-vars` 新 key。
  3. **接口归一必须是「等价改写」而不是「随手统一」**，两条调用点语义逐一对齐：
     - 主画板侧原为 `onOpen(items, index)`；
     - 批量侧原为 `onOpen(reference, index, items)`；
     - 统一签名由**本单在 commit message 里写明**，并在批量侧的调用点做**机械等价改写**（取 `items[index]`），
       **必须给出「点第 N 张缩略图 → 打开的还是第 N 张」的真机证据**。
  4. 图片渲染组件差异用**注入**解决：共享组件接收可选的图片组件参数（默认原生 `img`），`src/main.jsx` 传它自己的 `CachedImage`，
     `src/outfit-workflow.jsx` 不传（继续用原生 `img`）。**不允许**把 `CachedImage` 反向搬进批量页。
  5. `missing` 过滤 + 白名单过滤 + 数量提示 + `+N` 溢出提示 + 键盘 Enter/Space 打开 + 右键菜单 + 拖拽 行为逐条保持不变。
  6. 两处调用点的 props 完整性以沙盒/真机对照截图为准（改前 / 改后同一条历史记录、同一条批量结果）。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\shared-ui-duplication-check.mjs --update`（然后 `git diff` 确认账单只剩该条的删除，**没有**其他条目被误删）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only shared-ui` → 期望 `duplicateCount` 下降、`regressions` 为空
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only ui-duplication` / `--only modal-shell`
  - `.\runtime\node\node.exe node_modules\vite\bin\vite.js build`（前端改动，AB 之外的必跑项）
- **真机冒烟**：**【必须·独立】** 主画板（快捷生成 + 一键详情 + 图库）与批量页各打开一条含多张参考图的历史记录：逐张点击、右键、拖拽，与改前截图逐张对照。

---

### 批次 2 · 验证基建

---

#### V11-RF-010 · 统一「服务端源码真相源」，让后续搬家不再逐个改脚本

> **分步操作单**：[V4.0-执行单-V11-RF-000-010.md](V4.0-执行单-V11-RF-000-010.md) §2（含 10-1~10-12 十二步、三条负向验证与收尾自检清单）

- **任务类型**：【结构搬运重构】（**只动验证基建，不动业务代码**）
- **目标操作文件**：
  - 新建：`scripts/verify/lib/server-sources.mjs`
  - 改：`scripts/verify/local-edit-base-file-check.mjs`（第 41-60 行现地自建 `collectServerCoreSources()` → 改用共享实现）
  - 改：`scripts/verify/image-host-allowlist-check.mjs`（第 366-372 行同类逻辑 → 改用共享实现）
  - 改：`scripts/verify/white-refine-split-check.mjs`（第 31 行 `SERVER` 单词定死 `server/index.js`，第 107 行断言 `/app\.post\("\/api\/save-processed-image"/` → 改为在**全部服务端源码**里找该路由注册，保住判别力）
  - 改：`scripts/verify/routing-check.mjs`（第 44-53 行 `scanned` 列表 → 追加 `server/core/**`、`server/routes/**`、`server/shared/**`，**保持逐文件粒度**）
- **前置依赖任务ID**：V11-RF-000
- **标记**：🔴 串行（批次 3 的任何一单开始之前必须合入）
- **禁止修改文件清单**：G 全部；额外禁止：`server/**`（本单**零业务改动**）、`scripts/verify/run-all.mjs` 的 ORDER（不改执行顺序）、任何 `*baseline*.json`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**，且**至少**：`local-edit-base-file-check`、`image-host-allowlist-check`、`white-refine-split-check`、`routing-check` 四个脚本的断言语义**保持不变**（失败项数量与项名与改前一致）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 共享实现的范围**明确排除**：`server/features/**`（KEY 清洗有自己的 parity 脚本）、`server/skill-baselines/**`、`server/static-assets.generated.js`。
     若把 `features/` 一并纳入，`routing-check` 的逐文件语义会被稀释 —— **不允许**。
  4. `server-sources.mjs` 放在 `lib/` 下是刻意的：`run-all.mjs` 只把**根目录**的 `.mjs` 当可执行脚本（见该脚本 `discoverRunnable()`），新文件不会被误跑成独立门禁。
  5. **负向验证（必须有）**：临时把 `server/index.js` 里 `/api/save-processed-image` 的注册整段剪切到一个临时新文件 `server/routes/__tmp.js` → `white-refine-split-check` 必须仍通过 → 删除临时文件 → 复原。证明「搬家后断言自动跟随」真的生效。
  6. `routing-check` 的负向验证：在 `server/core/` 下某个文件里临时写入一个旧渠道 token → 必须变红 → 复原。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only local-edit-base` / `--only image-host` / `--only white-refine` / `--only routing`
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --list`（确认脚本清单条数与改前一致：**33 项**；若 V11-RF-101 已先行合入则为 34 —— 以你 10-3 记下的改前基线为准）
  - 上述两条负向验证的**失败输出**贴在提交里
- **真机冒烟**：不需要（无业务改动）。

---

### 批次 3 · `server/index.js` → 剩余 `server/core` 模块

> 统一搬运手法（每单都按这套做，下文不重复）：
> ① 按「函数名 + 相邻注释」定位，把整段**逐字节**剪切到新模块；② 在 `server/index.js` 原位置改为 import；
> ③ 清理因搬家产生的孤儿 import（`check-syntax.mjs` + eslint 都会抓）；④ AB-4 沙盒差分；⑤ 收尾真机冒烟。
> **路由注册顺序、中间件注册顺序、常量取值来源一律不得变动。**

> **🔴 批次账目核对（评审 D2 的复核结论：保留 16 单，不改为 15）**
> 编号区间 `101–116` 是**连续 16 个编号**，逐个都对应一张有实体内容的工单，**无跳号、无空号、无遗漏**：
> `101` image-concurrency · `102` generation-trace · `103` billing-attempts · `104` directory-picker · `105` history-display ·
> `106` image-diagnostics · `107` outfit-upload-groups · `108` local-image-stream · `109` outfit-archive ·
> `110` image-channel-candidates · `111` image-route-candidates · `112` video-error-policy · `113` video-route-session ·
> `114` storage-usage · `115` gateway-connectivity · `116` app-bootstrap（范围已按 D1 收窄，见该单）。
> **结论**：本批次确为 **16 单**，「第 16 个任务」就是 **V11-RF-116**，因此**不执行"全部改写为 15 单"**。
> 评审意见 D2 的改写条件是"若没有第 16 个任务"；核对结果是有，故按证据保留 16。
> ⚠️ 易混淆点：批次 3 **开始前** `server/core/` 已有 **16 个模块**（见 §0.1），批次 3 是在此之上**再加 16 个**新模块；
> 两个「16」含义不同（前者是存量，后者是本批工单数），不要据此推断本批应为 15。

---

#### V11-RF-101 · `core/image-concurrency.js`（出图并发槽位与排队）

> **分步操作单**：[V4.0-执行单-V11-RF-101-103.md](V4.0-执行单-V11-RF-101-103.md) §1（1-1~1-12；含新增 `state-singleton-check` 与 33→34 的账目变更）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/image-concurrency.js`；改 `server/index.js`（状态 `160-161`；函数 `225 imageSlotWeight` / `229 drainImageQueue` / `239 acquireImageSlot`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/runtime-config.js`（`IMAGE_CONCURRENCY_LIMIT` 是实测调校值，由 `runtime-config-baseline-check` 守着）、`scripts/verify/runtime-config-baseline.json`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`http-mock-check`、`outfit-defer-autosave-check`、`generation-failure-path-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**（新文件不得出现 `no-unused-vars` 新 key）。
  3. 状态必须仍是**进程级单例**：`activeImageRequestCount` / `imageRequestQueue` 搬家后**只能有一份**，禁止出现「路由各持一份 Map/数组」。
     必须导出：`acquireImageSlot`、`imageSlotWeight`，以及**一个只读快照**（供消费方拿 `active` / `queued`）。
  4. 🔴 **4 处消费方必须全部改为调用新导出的只读快照**（与第 3 条配套，逐一核对，**不允许任何一处继续直接读状态变量**）：
     - ① `/api/health`（快照 `1134-1138`，`imageConcurrency.limit/active/queued`）
     - ② trace 中间件 **2 处**：`local-request-received`（`299-303`）与 `local-response-finished`（`326-330`）
     - ③ `/api/generate-outfit`（`2796-2800` 请求诊断、`2815-2819` 取槽后日志）
     - ④ `/api/images`（`3430-3431` 请求诊断、`3445-3450` 取槽后日志）
  5. 🔴 **新增静态断言（本单的硬性交付物，不是可选项）**：
     `activeImageRequestCount` 与 `imageRequestQueue` 这两个符号在全服务端源码里**只允许各有 1 处定义点**（都在 `server/core/image-concurrency.js` 内）；
     其余任何出现位置**必须是通过 import 引用**（调用导出函数 / 读快照），**不得出现第二处 `let` / `const` 声明**。
     - **落点**：新增 `scripts/verify/state-singleton-check.mjs`（本项目惯例：一个关注点一个脚本），并登记进 `run-all.mjs` 的 `ORDER`。
     - **实现要求**：断言用的源码范围**必须复用 V11-RF-010 的共享真相源模块**（`scripts/verify/lib/server-sources.mjs`），
       这样将来 `server/routes/**` 出现"各持一份"时能被自动抓住，不需要回来改这个脚本。
     - ⚠️ **连带影响**：本单合入后全套门禁脚本数由 **33 → 34**。本文与 `V4.0-执行单-V11-RF-000-010.md` 里所有「33」的表述
       都要同步更新（§0.1 已加注记）。这是**预期内的数字变化**，不是漂移。
  6. 排队/放行时序**逐字保持**：`queueMicrotask(drainImageQueue)`、`Math.max(0, ...)` 兜底、`weight` 默认值 1 均不得改。
  7. `/api/health` 响应 JSON 的 `imageConcurrency` 三字段（`limit` / `active` / `queued`）与搬家前逐字段相同。
- **自测校验点**：
  - AB-4 沙盒差分：同时打 6 个并发 `/api/images` 请求，比对两版 `/api/health` 的 `imageConcurrency` 序列与生成日志里的 `image-slot-acquired` / `queueWaitMs` 字段
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only http-mock` / `--only outfit-defer`
  - **新断言的正向验证**：新脚本输出 `ok:true`，且报告里能看到「定义点 1 处 / 引用点 N 处」的分列统计
  - **新断言的负向验证（必须做，证明它有判别力）**：临时在 `server/index.js` 顶部加一行 `let activeImageRequestCount = 0;` → 新脚本**必须变红并点名该文件** → 删除该行后恢复绿；
    再临时在 `server/routes/` 下一个文件里加同样一行（该目录可能尚不存在，可临时创建）→ 仍必须变红 → 复原
- **真机冒烟**：**【必须·合并 组A】**

---

#### V11-RF-102 · `core/generation-trace.js`（本地请求追踪中间件）

> **分步操作单**：[V4.0-执行单-V11-RF-101-103.md](V4.0-执行单-V11-RF-101-103.md) §2（2-1~2-9；含"注册顺序不得挪"与 requestId 口径陷阱）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/generation-trace.js`；改 `server/index.js`（状态 `163`；`261 isGenerationTraceEndpoint` / `269 generationRequestTraceMiddleware`；注册点 `168`）
- **前置依赖任务ID**：V11-RF-101（同段区域相邻，串行更安全）
- **标记**：🔴 串行（与 V11-RF-101 同属 `160-337` 区块）
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/generation-logger.js`（既有模块，本单只调用）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`local-edit-base-file-check` 的端到端写日志段、`generation-failure-path-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. **中间件注册顺序不得变**：必须在 `app.use(express.json(...))` / `app.use(gatewayCompressionMiddleware)` **之后**、所有 `/api` 路由**之前**注册。
  4. 🔴 **必须逐字保留一处既有「口径不一致」**（这是最容易被人/AI「顺手修好」的陷阱）：
     中间件用 **header**（`x-jingyin-client-request-id`）派生 `requestId` 存入 map；
     而 `/api/generate-outfit`（`2791`）与 `/api/images`（`3425`）查 map 用的是 **payload 派生**的 `requestId`。
     两者常态不相等 → 查不到 → 回落 `receivedAt` → `localUploadParseMs = 0`。
     **搬运后行为必须一模一样**；如需修正，另开 bug 单并单独验证，**不得混在本单**。
     因此本模块需要导出的是**查询函数**（例如按 `requestId` 取开始时间 + 回落 `receivedAt`），而不是把 Map 暴露出去让路由自己查。
  5. 仍只对 `POST /api/images`、`POST /api/generate-outfit`、`POST /api/videos/generations` 三个端点生效；三处日志 stage 名（`local-request-received` / `local-request-aborted` / `local-response-finished`）与文本逐字保持。
- **自测校验点**：
  - AB-4 沙盒差分：分别对三个端点各发 1 个成功请求 + 1 个中断请求，比对 `logs/tasks/<日期>/<任务ID>.txt` **全文**（含 `imageConcurrency`、`localUploadParseMs`、`timingMs` 字段的存在性与相对关系）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only local-edit-base` / `--only generation-failure-path`
- **真机冒烟**：**【必须·合并 组A + 组E】**

---

#### V11-RF-103 · `core/billing-attempts.js`（中转站计费/签发与尝试汇总）

> **分步操作单**：[V4.0-执行单-V11-RF-101-103.md](V4.0-执行单-V11-RF-101-103.md) §3（3-1~3-9；含"只改 import、调用点零改动"与计费条数核对）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/billing-attempts.js`；改 `server/index.js`（`338 billingChannelCandidates` / `352 billingAttemptSummaries` / `364 prepareImageBillingForRequest` / `403 finalizeBillingInBackground`）
- **前置依赖任务ID**：V11-RF-102
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/billing-gateway.js`、`server/channel-config.js`（本单只调用）、`server/core/image-error-policy.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`http-mock-check` 全 8 组 `/api/images` + 4 组 `/api/generate-outfit`、`pro-wire-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. **计费语义零偏移**：`prepare*` / `finalize*` 的调用时机、参数、错误吞并方式（`finalizeBillingInBackground` 的后台不阻塞）逐字保持；**禁止**把「先记账后出图」改成别的顺序。
  4. 与 `https://api.jingyin.online` 的通信路径不变（G-6）；不得新增任何上游地址或 KEY 读取。
  5. 上游失败/超时的公开口径（`publicBillingErrorPayload` 等来自 `server/billing-gateway.js`）不变。
- **自测校验点**：
  - AB-4 沙盒差分：mock 上游返回 200 / 401 / 429 / 500 / 超时 各一次，比对两版**响应 JSON**（含 `error` / `message`）与生成日志里的计费相关字段
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only http-mock` / `--only pro-wire`
  - 用 `speed-investigation.mjs`（只读取证工具，`run-all` 不含它）对比搬家前后计费阶段耗时量级，异常即停
- **真机冒烟**：**【必须·合并 组A】**（并额外确认：真机出图后中转站后台的计费记录条数与出图张数一致）

---

#### V11-RF-104 · `core/directory-picker.js`（保存目录的选择/打开）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/directory-picker.js`；改 `server/index.js`（`447 openDirectory` / `458 pickDirectory`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/app-settings.js`、`server/core/app-paths.js`（保存目录的读取/记忆归它们）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 三平台分支（`win32` / `darwin` / 其他）的 PowerShell / osascript / zenity 命令文本**逐字保持**（禁止「优化」命令、禁止改超时与参数）。
  4. 失败与取消路径的返回值语义不变（取消 ≠ 异常；无 GUI 环境的兜底行为不变）。
- **自测校验点**：
  - AB-4 沙盒差分：调用 `POST /api/pick-directory`（无 GUI 时会走失败/兜底分支）比对两版响应；`GET/POST /api/save-directory` 往返一致
  - 静态自查：`child_process.spawn` 的 stdio 配置与搬家前逐字一致
- **真机冒烟**：**【必须·合并 组D】**（真机点一次「指定文件夹」，确认弹窗能出、能记住）

---

#### V11-RF-105 · `core/history-display.js`（历史条目即时展示解析）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/history-display.js`；改 `server/index.js`（`535 imageForImmediateDisplay` / `550 isBase64ImagePayload` / `556 hasHistoryDisplayArchive` / `563 historyItemForImmediateDisplay`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/history-store.js`、`server/core/result-cache.js`（既有模块，只调用）、`scripts/verify/runtime-config-baseline.json`（`RESULT_DISPLAY_CACHE_*` 常量受基线保护）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`history-integrity-check`、`history-repair-check`、`outfit-defer-autosave-check` 的显示契约段）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 展示缓存的三态（命中 / 未命中 / 超时阻塞上限）与 `data:` base64 判定分支逐字保持；**禁止**改 `RESULT_DISPLAY_CACHE_BLOCKING_TIMEOUT_MS` 的用法。
  4. 返回对象的字段名与结构不变（前端按字段名取值）。
- **自测校验点**：
  - AB-4 沙盒差分：构造「归档存在 / 归档缺失 / 只有 base64」三种历史条目，比对 `/api/history` 响应 JSON 与 `logs` 文本
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only history-integrity` / `--only history-repair` / `--only outfit-defer`
- **真机冒烟**：**【必须·合并 组B】**

---

#### V11-RF-106 · `core/image-diagnostics.js`（出图传参自检）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/image-diagnostics.js`；改 `server/index.js`（`658 clampDiagnosticImageCount` / `662 diagnosticPlaceholderFiles` / `671 diagnosticFieldValue` / `680 describeDiagnosticVariantFields` / `701 buildImageRequestDiagnostic`）
- **前置依赖任务ID**：V11-RF-101
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/channel.js`、`server/core/image-error-policy.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. **脱敏范围不得扩大或缩小**：`sanitize*` / 截断长度（如 `compactLogMessage(..., 180/900)`）逐字保持；KEY 类字段仍然不落盘、不返回。
  4. 该模块会**真的向上游发探测请求**（`/api/debug/image-request-params`）：请求形状（变体数量、占位图、字段名）逐字保持 —— 它正是 `tt25-subdirect-wire-check` 那条链路的诊断入口，改形状会掩盖真实回归。
- **自测校验点**：
  - AB-4 沙盒差分：对同一份参数调用 `POST /api/debug/image-request-params`，比对两版响应 JSON（剔除时间戳）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only tt25-subdirect-wire` / `--only routing`
  - 手工：真机点一次界面上的「传参自检」，确认输出条目数与改前一致
- **真机冒烟**：**【必须·合并 组E】**

---

#### V11-RF-107 · `core/outfit-upload-groups.js`（批量上传分组）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/outfit-upload-groups.js`；改 `server/index.js`（`765 outfitUploadFileGroups` / `780 imageFromOutfitArchive`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/uploads.js`（multer 实例与字段上限，受既有断言保护）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`http-mock-check` 的 `/api/generate-outfit` 4 组、`batch-prompt-passthrough-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 分组规则（`image` / `mask` / 兼容旧字段名）与「多图只取第一张」等既有取舍逐字保持；**禁止**顺手放宽 `IMAGE_UPLOAD_PARSE_CEILING`。
  4. 返回结构（`imageFiles` / `maskFile` 等字段名）不变。
- **自测校验点**：
  - AB-4 沙盒差分：分别上传 1 图 / 6 图 / 带 mask / 带旧字段名 四组，比对两版响应与落盘产物 SHA256
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only http-mock` / `--only batch-prompt-passthrough`
- **真机冒烟**：**【必须·合并 组A】**

---

#### V11-RF-108 · `core/local-image-stream.js`（本地图片分段读取）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/local-image-stream.js`；改 `server/index.js`（`792 parseByteRange` / `820 streamLocalImageFile`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/file-naming.js`、`server/core/http-compression.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`history-integrity-check`、`canvas-asset-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 分段（`Range`）语义逐字保持：`206` / `416` / `200` 三种状态码分支、`Content-Range` / `Accept-Ranges` / `Content-Length` 头、以及 `RESULT_CACHE_CONTROL` 的用法均不得改。
  4. `parseByteRange` 与 `streamLocalImageFile` 是否拆成两个文件由本单决定：**若拆，则拆成两个 commit**（「一次只搬一件事」）。
     两者是唯一调用关系（`825` 是唯一调用点），合并为一个模块 `local-image-stream.js` 也算一件事。
- **自测校验点**：
  - AB-4 沙盒差分：对 `/api/result/*.png`、`/api/history-image/*`、`/api/canvas-asset/*`、`/api/reference-asset/*` 各发「无 Range / 合法 Range / 越界 Range」三种请求，比对状态码 + 响应头 + 字节 SHA256
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only history-integrity` / `--only canvas-asset` / `--only image-host`
- **真机冒烟**：**【必须·合并 组B】**（重点看：历史图/结果图能正常显示、不出现半张图）

---

#### V11-RF-109 · `core/outfit-archive.js`（批量结果归档与显示缓存）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/outfit-archive.js`；改 `server/index.js`（`860 archiveOutfitGeneratedImage` / `879 cacheOutfitGeneratedImageForDisplay` / `909 archiveOutfitGeneratedImageInBackground`）
- **前置依赖任务ID**：V11-RF-105
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：
  - `server/index.js` 的 `deferOutfitAutoSave`（`2772`，**G-5 刻意保留的 unused 标记**）
  - `server/core/result-cache.js`、`server/core/image-proxy.js`
  - `scripts/verify/outfit-defer-autosave-check.mjs`（**禁止改测试**：它钉的是当前显示契约）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`outfit-defer-autosave-check` 5 组断言全过）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. **显示契约不得改**：`/api/generate-outfit` 仍返回本地 `HZ-` 地址且该地址能取回 PNG；归档**没有**被 `deferAutoSave` 跳过（这是 V11 的现状，与 V3 不同）。
     **禁止**「参考 V3 把跳过归档照搬回来」——那会同时踩到显示契约与 `outfit-defer-autosave-check`。
  4. 后台归档的 fire-and-forget 时机与 `.catch(() => {})` 吞并方式逐字保持。
- **自测校验点**：
  - AB-4 沙盒差分：`/api/generate-outfit` 两组（带 `deferAutoSave`+`localEdit` / 不带），比对响应形状、`data/results` 落盘 SHA256、`data/history.json` 指纹（**该接口本身不写历史**，指纹必须不变）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only outfit-defer` / `--only outfit-intent-request` / `--only retouch-intent-request`
- **真机冒烟**：**【必须·合并 组A】**（重点：批量出图后结果图在界面上**立刻可见**，且重启软件后历史里仍能看到）

---

#### V11-RF-110 · `core/image-channel-candidates.js`（图片线路候选与 JSON 转发形状）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/image-channel-candidates.js`；改 `server/index.js`（`602 channelBaseCandidates` / `607 imageChannelBaseCandidates` / `611 JSON_IMAGE_URLS_CHANNEL` / `617 prepareJsonImageUrlsForChannel` / `638 imageParamsForBaseUrl` / `643 imageRequestVariantsForBaseUrl` / `647 imageRequestLogTargets`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/channel-config.js`、`server/channel.js`、`src/shared/routing.js`（线路目录的唯一真相源）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`routing-check`、`tt25-subdirect-wire-check`、`http-mock-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. `JSON_IMAGE_URLS_CHANNEL` 的取值（`silent-tt25-line-07`）**逐字不改**；它触发的「JSON + `image_urls`」转发形状（中转计费表达式只解析 JSON 请求体）不得改。
  4. 线路候选顺序与过滤规则逐字保持（旧线路 token 不得因搬运而出现在新文件里 —— `routing-check` 会扫）。
  5. 🔴 **强制收口条款（2026-10-01 新增，来自 `V11-RF-106` 的偏差）**：本单搬走 `imageParamsForBaseUrl` 与 `imageChannelBaseCandidates` 之后，**必须删除 `server/core/image-diagnostics.js` 里那两份本地副本**（该单为避开循环依赖临时放了一份逐字节副本，见 §5 的 RF-104/105/106 记录），并把 `image-diagnostics.js` 改为**从本模块 import**。
      **验收证据**：`imageParamsForBaseUrl` 与 `imageChannelBaseCandidates` 在全服务端源码里**各只剩 1 处定义**（在 `server/core/image-channel-candidates.js` 内）。这正是"同名函数只允许一处定义"的判据，也是 **V11-RF-016** 要机器化盯住的东西。
     ⚠️ 本单**是本条欠账的唯一负责人**：不删就算本单未完成。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only routing` / `--only tt25-subdirect-wire` / `--only http-mock`
  - AB-4 沙盒差分：mock 上游记录请求体形状，比对两版（multipart vs JSON 的切换点必须一致）
- **真机冒烟**：**【必须·合并 组A】**

---

#### V11-RF-017 · `core/route-helpers.js`（图片/视频**共用**的路由辅助）· 🔴 **必须排在 111 之前**

> **为什么新增这一单（2026-10-01 发现）**：`V11-RF-111` 的块引用了 4 个"住在视频区"的辅助函数 ——
> `videoRouteText:614` / `hasHeader:618` / `safeSignedRouteHeaders:623` / `signedRouteCredential:636`，
> 而它们**同时被图片与视频两条功能共用**（图片块用到 `725/733/758/759/761/763/766/770/776/777/778/779/842/847/855`；视频区用到 `650/659/686/687/688/691/692/708/709/712/713/714`）。
> 按项目规则"**共用能力不进功能私有目录**"，必须先抽到 `server/core/`。
> 若先做 111，只剩两条错路：**在新模块里复制**（＝ 第二次 106 事故，`server-duplication-check` 会当场拦下）或**图片模块 import 视频模块**（依赖方向与命名都错）。
> ✅ 这 4 个函数正好是**连续区间 `614`–`647`**，可整段搬。

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/route-helpers.js`；改 `server/index.js`（`614`–`647`）
- **前置依赖任务ID**：无
- **标记**：🔴 串行（**V11-RF-111 与 112/113 都以本单为前置**）
- **禁止修改文件清单**：G 全部；额外禁止：`index.js` 的 `649 videoRouteUrl` 及之后（视频块属 112/113）；**不得给 `videoRouteText` 改名**（G-8）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（**36 项、失败 0**）；**AB-2 lint 棘轮基线不能新增问题**。
  2. 4 个函数逐字节搬运；`videoRouteText` **名字不变**，并在文件头注释说明"图片/视频共用、名字是历史遗留"。
  3. 逐字保留：`safeSignedRouteHeaders` 的屏蔽头集合（`host`/`connection`/`content-length`/`transfer-encoding`）与空值丢弃；`hasHeader` 的**大小写不敏感**；`signedRouteCredential` 的**八字段兜底顺序**。
  4. 调用点零改动；`eslint server/index.js` 只剩 `deferOutfitAutoSave` 1 条。
  5. **`server-duplication-check` 绿**（`duplicates` 为空）。
- **自测校验点**：全套 36/36 + 棘轮空 + 新门禁绿。
- **真机冒烟**：不需要（真实影响由 111 与 112 的冒烟覆盖）。
- **分步操作单**：[V4.0-执行单-V11-RF-017-111.md](V4.0-执行单-V11-RF-017-111.md) §1

---

#### V11-RF-111 · `core/image-route-candidates.js`（图片线路解析与请求头）

> **🔴 前置变更（2026-10-01）**：本单**必须**在 `V11-RF-017` 之后做 —— 它要 import `./route-helpers.js` 里的 4 个共用辅助（`videoRouteText` / `hasHeader` / `safeSignedRouteHeaders` / `signedRouteCredential`），**禁止复制**。
> **分步操作单**：[V4.0-执行单-V11-RF-017-111.md](V4.0-执行单-V11-RF-017-111.md) §2（含依赖清单、12 处调用点、孤儿清理重点）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/image-route-candidates.js`；改 `server/index.js`（`1390 bearerHeaderValue` / `1396 imageRouteUrl` / `1404 imageRouteModel` / `1414 createImageRouteFromBillingTask` / `1457 imageCandidateEntries` / `1482 imageChannelLogForCandidate` / `1499 imageParamsForCandidate` / `1504 imageRequestVariantsForCandidate` / `1508 imageUrlForCandidate` / `1517 imageApiKeyForCandidate` / `1523 imageHeadersForCandidate`）
- **前置依赖任务ID**：V11-RF-103（依赖计费任务对象形状）
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/billing-gateway.js`、`server/core/image-error-policy.js`（`resolveApiKey` / `shouldTryNextChannel` 等判定归它）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`http-mock-check`、`pro-wire-check`、`tt25-subdirect-wire-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 计费任务 → 线路的映射逐字保持（含 `signedRouteCredential`、`resolveApiKey` 兜底顺序）；**KEY 仍然只在内存中经手，不落盘、不进日志**。
  4. 请求头拼装顺序与覆盖规则（`variantHeaders` 合并）逐字保持 —— 顺序变了可能改变上游行为。
- **自测校验点**：
  - AB-4 沙盒差分：mock 上游返回「签名线路 / 非签名线路 / 无线路回落默认」三类，比对两版请求头 + 请求体（KEY 除外，按脱敏比对）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only http-mock` / `--only pro-wire` / `--only tt25-subdirect-wire`
- **真机冒烟**：**【必须·合并 组A】**

---

#### V11-RF-112 · `core/video-error-policy.js`（视频错误码与公开文案）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/video-error-policy.js`；改 `server/index.js`（`1178 publicVideoErrorCode` / `1187 publicVideoErrorMessage` / `1197 publicVideoTaskFailureMessage` / `1206 publicVideoTaskPayload`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/image-error-policy.js`、`server/video-config.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 错误码枚举与**每一个中文字案逐字不改**（用户可见文案；改了要单独确认）。
  4. 「上游资源不足 → 已自动退款」这类特殊文案的触发正则逐字保持。
- **自测校验点**：
  - AB-4 沙盒差分（**该模块无专用脚本**）：mock 上游分别返回 401 / 403 / 429 / 500 / 超时 / `all cookies failed`，比对两版响应 JSON 的 `error` + `message`（逐字节）
- **真机冒烟**：**【必须·合并 组C】**

---

#### V11-RF-113 · `core/video-route-session.js`（视频线路会话与状态查询）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/video-route-session.js`；改 `server/index.js`（状态 `162 const videoRouteSessions = new Map()`；`1286 videoRouteText` → `1563 videoRouteForStatus` 整段，含 `1535 rememberVideoRouteSession`）
- **前置依赖任务ID**：V11-RF-103、V11-RF-112
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/video-config.js`、`scripts/verify/runtime-config-baseline.json`（`VIDEO_ROUTE_SESSION_TTL_MS` 受基线保护）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 会话 Map 仍是**进程级单例**、TTL 清理时机（懒清理循环）与 `expiresAt` 字段语义逐字保持；**禁止**改 TTL 数值。
  4. 状态查询的**降级链**逐字保持：会话命中 → 签名线路 → 回落默认 baseUrl/apiKey；`hasHeader` 大小写不敏感判定不变。
- **自测校验点**：
  - AB-4 沙盒差分（**无专用脚本**）：mock 上游，走「创建任务 → 轮询状态」全流程，比对两次响应 JSON + 生成日志；再构造「会话过期」场景比对降级结果
- **真机冒烟**：**【必须·合并 组C】**

---

#### V11-RF-114 · `core/storage-usage.js`（数据目录用量快照）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/storage-usage.js`；改 `server/index.js`（`2101-2156`：说明注释块 + `STORAGE_TARGETS` + `STORAGE_IMAGE_PATTERN` + `storageDirUsage` + `storageUsageSnapshot`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/app-paths.js`（6 个目录的解析归它）、`server/core/history-store.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. `STORAGE_TARGETS` 六项的 `key` / `label` / `imagesOnly` / `resetsHistory` **逐字不改**（前端按 `key` 取项、按 `label` 显示）。
  4. 目录不存在视为 0（不抛异常）、单文件读不到跳过 —— 两个 `catch` 分支逐字保持。
  5. 返回字段（`rootDir` / `dataDir` / `logsDir` / `items` / `totalBytes` / `historyCount`）不变。
- **自测校验点**：
  - AB-4 沙盒差分：沙盒里造几个文件，比对两版 `/api/storage/usage` 响应 JSON（剔除路径前缀差异）
- **真机冒烟**：**【必须·合并 组B】**（打开「数据与存储」面板，核对六个目录的文件数与体积**与磁盘实际一致**）

---

#### V11-RF-115 · `core/gateway-connectivity.js`（网关连通性探测）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/gateway-connectivity.js`；改 `server/index.js`（`965 gatewayRootUrl` / `969 checkGatewayConnectivity`，含尾部到 `1023`）
- **前置依赖任务ID**：V11-RF-010
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/http-client.js`（`createAbortSignal` 归它）、`server/channel.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`connection-test-check`、`routing-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 探测手法逐字保持：`HEAD` → 405 时回落 `GET`；8000ms 超时；`ok = status >= 200 && status < 500` 的判定边界不变。
  4. 返回字段（`checkUrl` / `reachable` / `ok` / `status` / `statusText` / `server` / `latencyMs`）不变；失败分支的 `reachable:false` 语义不变。
- **自测校验点**：
  - AB-4 沙盒差分：mock 网关分别返回 200 / 405+GET 200 / 500 / 连接拒绝，比对两版 `/api/gateways/status` 响应形状
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only connection-test` / `--only routing`
- **真机冒烟**：**【必须·合并 组D】**（真机点「连接测试」，看结果与改前一致）

---

#### V11-RF-116 · `core/app-bootstrap.js`（前端挂载与监听启动）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/core/app-bootstrap.js`；改 `server/index.js`（状态 `164`；`171 shouldAutoOpenBrowser` / `177 openAppInBrowser` / `197 sendEmbeddedStaticAsset` / `3844 startResultCacheCleanupOnce` / `3850 configureHttpServer` / `3857 listenOnPort`）
- **🔴 本单范围（已按评审 D1 收窄）**：**只搬「纯启动函数」**。`3809-3842` 的 `attachFrontend`（前端挂载 / 静态资源 / SPA 回落 / dev 中间件）与末尾启动块 `3883-3888` **原样保留在 `server/index.js`**，**归属 V11-RF-220 处理**（见该单）。本单完成后 `server/index.js` 里仍应能读到 `attachFrontend` 的定义与它的调用 —— 这是本单与 220 的**职责分界**，不允许交叉。
- **前置依赖任务ID**：V11-RF-114、V11-RF-115（放在 core 批次最后）
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：
  - `scripts/secure-win-release.mjs` 的 `entryPoints`（**打包入口必须仍是 `server/index.js`**）
  - 🔴 `server/index.js` 的 `3809-3842 attachFrontend`（**一行都不许动**；含它的四个分支与 vite 动态导入）。
    —— 唯一的例外是**文件顶部**为 `sendEmbeddedStaticAsset` 新增/调整 import（见验收条件 7），该 import 不在 `3809-3842` 区间内
  - 🔴 `server/index.js` 末尾的启动块（`3883-3888` 的 `attachFrontend().then(...)`）—— 保留在 `index.js`
  - `启动静音内测画板.bat`、`scripts/check-launcher` 相关文件
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`check-launcher`、`error-boundary-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 这是**唯一允许改签名**的搬运单（G-8 例外）：`express()` 实例仍由 `server/index.js` 创建，
     启动相关函数改为**接收 `app` 参数**（或返回 `{ configureHttpServer, listenOnPort }` 的工厂）。
     **禁止**在新模块里 `express()` 出第二个 app 实例 —— 那会让中间件/路由全部脱钩（灾难性静默失败）。
  4. 端口占用回落逐字保持：`EADDRINUSE` 且 `remainingFallbacks > 0` → `port + 1`、100ms 后重试；
     `EADDRINUSE` 且允许自动开浏览器 → 打印「已打开现有实例」并 `process.exitCode = 0`。
  5. `PORT_FALLBACK_LIMIT` 的取值来源仍是 `server/core/runtime-config.js`（受基线保护）。
  6. `server.requestTimeout` / `headersTimeout`(+30000) / `keepAliveTimeout`(65000) / `timeout` 四个数值逐字保持。
  7. **职责分界证明**：diff 里 `attachFrontend`（`3809-3842`）**函数体零改动**、启动块（`3883-3888`）零改动；
     **不得搬 `attachFrontend` 内的静态资源挂载 / SPA 回落 / vite dev 分支逻辑**；
     **`sendEmbeddedStaticAsset`（快照 `197`）作为被 `attachFrontend` 调用的工具函数，随本单搬走属允许** ——
     它的定义进 `server/core/app-bootstrap.js`，**调用点仍留在 `server/index.js` 的 `attachFrontend` 内**
     （`index.js` 只允许在文件顶部新增/调整 import，`attachFrontend` 函数体内那一行调用不得改）。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only check-launcher` / `--only error-boundary`
  - **端口占用负向验证**：先起一个实例，再起第二个 → 必须看到 `Port 8787 is already in use, trying 8788.` 与「打开现有实例」行为，与改前逐字一致
  - **边界自查**：在 `server/index.js` 里仍能搜到 `attachFrontend` 的定义与调用；`server/core/app-bootstrap.js` 内**不得**出现 `attachFrontend` 字样；
    反向确认 `sendEmbeddedStaticAsset` 的**定义已落在 `app-bootstrap.js`**、而它的**调用点仍在 `index.js` 的 `attachFrontend` 内**（这是验收条件 7 的正向证据）
  - 静态：`server/index.js` 行数下降，且末尾启动块仍在 index.js
- **真机冒烟**：**【必须·独立】**（本单影响启动路径）双击 `启动静音内测画板.bat` → 页面能打开；再**重复双击一次** → 走端口占用分支、正确打开已有实例、不报错。

---

### 批次 4 · `server/index.js` → `server/routes/*`

> 统一手法：新建 `server/routes/<名字>.routes.js`，导出**注册函数**，在 `server/index.js` 里按**原来的顺序**调用注册；
> 注册顺序即中间件生效顺序，**不得重排**。每个路由单都必须先跑一次全套验证建立改前基线。
>
> **🔴 依赖注入契约（评审 D4 —— 对批次 4 每一张单都是硬性验收项，各单不再重复罗列）**
> 1. ✅ **路由注册函数签名（2026-10-02 修订，取代原"必须有第二个参数"）**：
>    - **默认 `registerXxxRoutes(app)`**；
>    - **只有当确实存在"无法 import、只能在 `index.js` 作用域构造"的依赖时**，才写 `(app, deps)`，
>      并在**文件头逐项列出 `deps` 每个来源**。
>    **修订理由（实测）**：`V11-RF-201` 的模块有 **18 个外部符号、全部可 import**，硬塞未使用的 `deps` 形参
>    会让 ESLint `no-unused-vars` 直接判红 —— 那是让签名"挂空壳"。
>    🔴 **契约精神未变**：**依赖必须显式、不得隐式抓 `index.js` 作用域**（自检句见第 3 条）。
> 2. **不允许路由模块内部重新实例化任何共享件。** 本仓库的对应物，照此逐条核对：
>    - **multer / 上传中间件**：`upload`、`imageForwardUpload`、`largeImageUpload`、`wrapOutfitUpload`、`IMAGE_UPLOAD_PARSE_CEILING`
>      —— **只能**来自 `server/core/uploads.js`（import 或经 `deps` 注入）；**禁止**在路由模块里再写一次 `multer(...)`。
>    - **有状态单例**：并发队列与只读快照、视频线路会话、本地请求追踪时间表
>      —— **只能**来自批次 3 抽出的 `server/core/*` 模块（同一份 ESM 实例）；**禁止**在路由模块里 `new Map()` / `let count = 0` 自建第二份。
>    - **路径 / 设置 / 阈值**：只能来自 `server/core/app-paths.js`、`app-settings.js`、`runtime-config.js`。
> 3. **不允许从「旧的 `server/index.js` 作用域」隐式抓取变量。** `server/index.js` 里为注册而存在的临时变量
>    （局部 `const`、循环变量、注册用的包装对象）一律不得被路由模块依赖 —— 路由模块只能依赖「它自己 import 的」和「`deps` 里显式给的」。
>    **自检办法**：把 `server/routes/<新文件>.js` 单独拿出来看，能否不打开 `server/index.js` 就讲清每个自由标识符的来处；讲不清即违反契约。
> 4. **禁止为了"省事"引入 `express.Router()` 或第二次 `express()`**（本轮明确不引入 Router，见 §4 D-3）。
> 5. **注册顺序的精确口径（2026-10-02 新增 —— 因为各单路由在 `index.js` 里互相穿插）**：
>    实测各单路由并非连续（例如 **208 的 8 条被 209 的 `/api/detail-prompts` 夹在中间**）。因此"顺序不得重排"具体化为：
>    (a) **同一模块内部**路由的**相对顺序逐字保持**；
>    (b) 所有路由仍必须在**全部 `app.use` 中间件之后**；
>    (c) **不得跨越任何通配 / 兜底路由**（如 `app.get("*")`、SPA 回落）；
>    (d) 若某单路由被别的路由夹住 ⇒ **在该单"第一条路由"的位置插入注册调用**即可，
>        但**必须在 commit message 里列出「旧顺序 vs 新顺序」的差异点**，并说明"**路径不同、无通配重叠、故功能等价**"。
>    **只允许这种"证明过等价"的位移**；任何**跨中间件、跨通配路由**的位移一律禁止。
>
> **留证要求**：批次 4 每张单的 commit message 必须附一张**依赖注入表**（两列即可）：
> 左列 = 该路由模块用到的每个外部符号；右列 = 它的来源（`import server/core/xxx.js` / `deps` 注入 / `app` 形参）。
> 表里只要出现「来自 index.js 作用域」这一种来源，本单直接判不通过。

---

#### V11-RF-201 · `routes/system.routes.js`（配置 / 线路 / 网关 / 健康 / 客户端诊断）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/system.routes.js`；改 `server/index.js`（`931 /api/config`、`961 /api/ecommerce/routing`、`1024 /api/connection-test`、`1104 /api/gateways`、`1114 /api/gateways/status`、`1127 /api/health`、`1149 /api/client-diagnostic-event`）
- **前置依赖任务ID**：V11-RF-101（健康检查读并发快照）、V11-RF-115（网关探测）
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`scripts/check-launcher`、`启动静音内测画板.bat`（依赖 `/api/health` 文案）、`server/channel-config.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`http-mock-check` 的 `/api/config`、`connection-test-check`、`routing-check`、`error-boundary-check`、`check-launcher`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. `/api/config` 的**每一个字段**逐字保持（`defaultBaseUrl` / `hasServerKey: false` / `channelPolicy` / `models` / `routing` / `billingGatewayPolicy.videoRequired` / `videoPolicy.enabled+routeSource` / 映射后的 `videoModels`）；
     `hasServerKey` **必须仍为 `false`**（G-6：本地不内置 KEY）。
  4. `/api/health` 的 `version: "11.0.0"`、`imageConcurrency` 三字段、`memory` 四项、`uptimeSec` 全保持。
  5. `/api/client-diagnostic-event` 的落盘行为不变（`local-edit-base-file-check` 的端到端断言依赖它写 `logs/tasks/<日期>/<任务ID>.txt`）。
- **自测校验点**：
  - AB-4 沙盒差分：`GET /api/config`、`/api/ecommerce/routing`、`/api/gateways`、`/api/gateways/status`、`/api/health` + `POST /api/connection-test`、`POST /api/client-diagnostic-event` 逐个比对响应 JSON（剔除 `now` / `uptimeSec` / `latencyMs`）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only http-mock` / `--only connection-test` / `--only routing` / `--only error-boundary` / `--only check-launcher`
- **真机冒烟**：**【必须·合并 组D】**（打开设置面板看模型/线路列表、点连接测试、看「数据与存储」页无异常）

---

#### V11-RF-202 · `routes/debug.routes.js`（出图传参自检）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/debug.routes.js`；改 `server/index.js`（`1167 /api/debug/image-request-params`）
- **前置依赖任务ID**：V11-RF-106
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/image-diagnostics.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 错误分支逐字保持：异常时 `400` + `{ ok:false, message: "传参自检失败" }`。
  4. 该端点是**调试入口**，仍然只在本地服务上暴露；不得为它开新的鉴权或网络监听（不改变监听地址 `127.0.0.1`）。
- **自测校验点**：
  - AB-4 沙盒差分：正常参数 / 空 body / 非法参数三组比对响应
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only tt25-subdirect-wire`
- **真机冒烟**：**【必须·合并 组E】**

---

#### V11-RF-203 · `routes/videos.routes.js`（视频生成与状态）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/videos.routes.js`；改 **`server/app.js`**
  （🔴 **2026-10-02 更正**：220 之后路由已不在 `index.js`（现仅 **9 行**）—— 两条视频路由的**内联 handler 现在住在 `server/app.js` 的 `110`–`496`**，
  由 `108 registerDebugRoutes(app)` 与 `498 registerPromptsRoutes(app)` 夹在中间）
- **前置依赖任务ID**：V11-RF-112、V11-RF-113（**均已完成**）
- **标记**：🟢 **可开工**（原按 D-7 暂缓，2026-10-02 修订为"做"：它是**纯搬运**，**不需要视频功能可用**，沙盒 mock 即可验证）
- **为什么仍要做**：不做则视频代码**长期住在装配层 `app.js` 里** ⇒ 日后开发视频功能会往装配层加代码，**违反刚建立的分区**。
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/video-error-policy.js`、`server/core/video-route-session.js`、
  `server/video-config.js`、`server/billing-gateway.js`、`server/core/route-helpers.js`；**不得改**任何视频中文文案 / 错误码 / 超时数字；
  **不得改** `VIDEO_BILLING_GATEWAY_REQUIRED` 的判定语义。
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（**38 项**；该端点**无专用脚本** ⇒ 沙盒差分必须逐字节）。
  2. **AB-2 lint 棘轮基线不能新增问题**（`regressions` 为空数组）。
  3. **依赖注入契约（批次 4 统一契约 D4）**：导出 `registerVideosRoutes(app)`（默认单参，见 D4 第 1 条修订）；
     新模块**不得** `new Map()` 自建会话状态（`videoRouteSessions` 在 `core/video-route-session.js`，**只能 import**）；
     commit message 必附**依赖注入表**。
  4. **注册位置 = 原位置**：在 `app.js` 的 `108 registerDebugRoutes(app)` 与 `498 registerPromptsRoutes(app)` **之间**插入 `registerVideosRoutes(app);`，**顺序不动**。
  5. 逐字保留：两端点响应结构、112 的四处错误/文案函数调用点、`writeGenerationLog` 的 stage 名（如 `video-generate`）、
     113 的会话写入与**取用即删**语义、`JINGYIN_VIDEO_GATEWAY_CHANNEL_ID` 的用法。
  6. `app.js` 里因本单而变成孤儿的 import **必须清理**（机械核查：`VIDEO_BILLING_GATEWAY_REQUIRED`、`compactLogMessage`、
     `writeGenerationLog`、`finalizeBillingInBackground`、`createVideoRouteFromBillingTask` / `rememberVideoRouteSession` / `videoRouteForStatus` 逐个回搜）。
- **自测校验点**：
  - AB-4 沙盒差分：`generations`（正常 / 上游错误 / 缺 KEY / 禁用网关）+ `status`（有会话 / **无会话走兜底** / 上游错误），比对响应 JSON 与生成日志文本
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only routing` / `--only http-mock` / `--only generation-failure-path`
  - **真机启动**：`node server/index.js` 能监听（018 门禁兜路径错，兜不住"漏搬函数"）
- **真机冒烟**：**不需要**（视频功能未启用；**组 C 继续豁免**，见 §3 与 D-7）—— 但**真机启动 + 全套 38/38 必做**。
- **禁止修改文件清单**：G 全部；额外禁止：`server/video-config.js`、`server/billing-gateway.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（注意：**该端点无专用脚本**，AB 通过不足以证明正确 → 真机冒烟不可替代）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 请求解析（`normalizeVideoGenerationRequest`）、网关视频 body 构造、计费签发与状态查询链路逐字保持；`VIDEO_BILLING_GATEWAY_REQUIRED` 的用法不变。
  4. 中间件追踪对该端点仍然生效（`isGenerationTraceEndpoint` 列表包含 `/api/videos/generations`）。
  5. 视频私钥仍只在中转站侧（G-6）：本地不新增任何视频 KEY 读取分支。
- **自测校验点**：
  - AB-4 沙盒差分：mock 上游，走「创建 → 轮询到成功」「创建失败」「轮询到失败」「上游超时」四条路径，比对两版响应 JSON + 生成日志（**该模块无专用脚本，这里必须逐字节比**）
- **真机冒烟**：**【必须·合并 组C】**（快捷视频与批量视频面板各跑一次，看能出片、状态轮询正常、失败提示文案正常）

---

#### V11-RF-204 · `routes/prompts.routes.js`（快捷/参考提示词重写）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/prompts.routes.js`；改 `server/index.js`（`1953 /api/quick-prompt-rewrite`、`1986 /api/reference-prompt-rewrite`）
- **前置依赖任务ID**：V11-RF-110
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/quick-prompt-ai.js`、`server/reference-ai.js`、`prompts/**`（G-2：提示词规则集不在这张单里）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 两条端点的降级行为逐字保持：解析失败 `400` 文案、缺 KEY `400 + missing_api_key` 文案、上游失败 `502` 时的本地兜底提示词（`quickPromptFallback` / `localReferencePrompt`）**必须仍然生效** —— 这是断网时的可用性保障。
  4. 上传字段与上限（`upload.array("image", 6)`、`upload.fields([...])`）逐字保持。
- **自测校验点**：
  - AB-4 沙盒差分（**这两个端点没有专用脚本**）：mock 上游返回 200 / 500 / 超时，比对两版响应与兜底文案
  - 注意区分：`quickgen-prompt-passthrough-check` 是**前端纯函数**检查（`src/shared/quickgen-prompt-rules.js` 的「只发用户原话」契约），**不覆盖这两个端点**，不要拿它当本单的证据
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs`（全套，确认没有连带回归）
- **真机冒烟**：**【必须·合并 组E】**（在快捷生成里点一次提示词优化；再**断网**点一次，确认走了本地兜底而不是白屏/报错）

---

#### V11-RF-205 · `routes/history.routes.js`（历史读写/修复/清空）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/history.routes.js`；改 `server/index.js`（`2025 GET /api/history`、`2051 POST /api/history/repair`、`2078 POST /api/history`、`2088 DELETE /api/history`）
- **前置依赖任务ID**：V11-RF-105
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/history-store.js`、`server/core/history-display.js`、**`data/history.json`**（真实数据，禁止用于试验）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`history-integrity-check`、`history-repair-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. **写盘语义逐字保持**：`writeHistoryResults(results, { replaceBackup: results.length === 0 })` 这类「清空才覆盖备份」的规则不得改；
     `POST /api/history` 的合并规则与 `DELETE /api/history` 的 `POST body 的 ids 过滤` 语义不得改。
  4. `POST /api/history/repair` 默认**只标记不删除**；只有显式 `dropMissing:true` 才清理 —— 逐字保持。
  5. 验证脚本用的沙盒数据目录机制不变（脚本靠环境变量指向沙盒，真实 `data/` 指纹必须前后一致）。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only history-integrity` / `--only history-repair`
  - AB-4 沙盒差分：GET / POST / DELETE / repair（含 `dropMissing` 两态）五组请求，比对响应 JSON + 沙盒 `history.json` 指纹
  - 收尾确认：真实 `data/history.json` 的 SHA256 与开工前一致
- **真机冒烟**：**【必须·合并 组B】**（真机上：出图后看历史里能看到 → 打开「历史修复」看只标记不删 → 清空一次历史看界面与磁盘一致）

---

#### V11-RF-206 · `routes/storage.routes.js`（数据与存储自助）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/storage.routes.js`；改 `server/index.js`（`2158 /api/storage/usage`、`2166 /api/storage/reveal`、`2185 /api/storage/clean`）
- **前置依赖任务ID**：V11-RF-114
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/storage-usage.js`、`server/core/app-paths.js`、**真实 `data/**` 与 `logs/**`**（清理类接口的验证一律在沙盒里做）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（该端点**无专用脚本** → 沙盒差分必须逐字节比）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 🔴 **`/api/storage/clean` 的安全边界逐字保持**（这是全项目最危险的一端）：
     只删固定目录下的**普通文件**；图片类目录**只删图片扩展名**；清历史图片时**同时把历史清单置空并覆盖备份**；
     **禁止**跟随符号链接/目录递归删除/越界路径；接受的目标 `key` 必须仍在白名单内（未知 key 一律拒绝）。
  4. `/api/storage/reveal` 只打开目录、不执行 shell 拼接外部输入。
  5. 失败时返回 `500 + { ok:false, error }`，不得静默成功。
- **自测校验点**：
  - AB-4 沙盒差分：usage / reveal（无 GUI 环境走失败分支）/ clean（合法 key、未知 key、目录不存在）逐个比对，**重点是删除了哪些文件、留下了哪些文件**（用文件清单比对，不用体积）
  - 负向验证（必须有）：在沙盒里放一个**非图片扩展名**文件到图片类目录 → 调 clean → 该文件**必须还在**
- **真机冒烟**：**【必须·合并 组B】**（真机打开「数据与存储」：看用量、打开数据目录、**只对非关键目录试一次清理**并核对磁盘）

---

#### V11-RF-207 · `routes/assets.routes.js`（历史图/参考图/画布资源读取）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/assets.routes.js`；改 `server/index.js`（`2229 /api/history-image/:filename`、`2238 /api/reference-asset/:filename`、`2247 POST /api/canvas-assets`、`2281 /api/canvas-asset/:filename`）
- **前置依赖任务ID**：V11-RF-108
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/asset-urls.js`、`server/core/local-image-stream.js`、`server/core/app-paths.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`canvas-asset-check`、`history-integrity-check`、`image-host-allowlist-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 🔴 **路径穿越防护逐字保持**：`canvas-asset-check` 里那条 `../data/history.json` 的用例必须仍然被拒；
     `:filename` 的清洗（`sanitizeFilePart` / `path.basename` 口径）不得放松。
  4. `canvas-asset-check` 提到的「`return res.json({...})` 之后还留着 18 行旧实现」这类**已知冗余**在本单**原样搬走**，
     **禁止**借搬运顺手删除（删死代码是另一张单，必须单独确认判别力）。
  5. 上传上限与字段名（`upload.array("image", 12)`）、空上传的 `400` 行为不变。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only canvas-asset` / `--only history-integrity` / `--only image-host`
  - AB-4 沙盒差分：合法文件 / 不存在文件 / 穿越路径 / 空上传 四组
- **真机冒烟**：**【必须·合并 组B】**（无限画布/图库/历史里的图片都能正常显示）

---

#### V11-RF-208 · `routes/save.routes.js`（保存目录 + 保存图片 + 结果图读取）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/save.routes.js`；改 `server/index.js`（`2289 GET /api/save-directory`、`2294 POST /api/save-directory`、`2306 POST /api/pick-directory`、`2321 POST /api/open-save-directory`、`2407 POST /api/save-image`、`2426 POST /api/save-processed-image`、`2458 POST /api/cache-result-image`、`2486 GET /api/result/:filename`）
- **前置依赖任务ID**：V11-RF-104、V11-RF-108
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/app-settings.js`、`server/core/asset-persist.js`、`server/core/file-naming.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`white-refine-split-check`）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 🔴 **必须同步更新一条源码级断言**：`scripts/verify/white-refine-split-check.mjs`（第 31 行 `SERVER`、第 107 行断言）
     在 `V11-RF-010` 之后应已改为「在全部服务端源码里找 `/api/save-processed-image` 注册」。本单搬完后**必须实跑确认它仍能命中**；
     若 T-010 尚未合入，则本单不得开工。
  4. 保存语义逐字保持：`normalizeUsableSaveDirectory` / `setSaveDirectory` 的校验与记忆；文件名安全化（`sanitizeFilePart`、`sanitizeSubfolderName`）不得放松；「白底精修中线剪裁成两张」的落盘行为不得变。
  5. `/api/result/:filename` 的分段读取走 `server/core/local-image-stream.js`（V11-RF-108 的成果），不得复制一份新实现。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only white-refine` / `--only history-integrity` / `--only local-edit-base`
  - AB-4 沙盒差分：保存到沙盒目录后比对**落盘文件 SHA256 + 文件名**；非法目录名 / 不可写目录的失败文案逐字比对
- **真机冒烟**：**【必须·合并 组B】**（真机：指定保存目录 → 出一张图 → 下载/保存到该目录 → 打开目录确认文件在；白底精修跑一次确认落两张）

---

#### V11-RF-209 · `routes/detail.routes.js`（一键详情/主图提示词组）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/detail.routes.js`；改 `server/index.js`（`2333 POST /api/detail-prompts`）
- **前置依赖任务ID**：V11-RF-107
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：
  - **`prompts/server/detail-skills.js`（G-2 里的历史硬性决策：一键详情/主图保留完整规则集，本单严禁改动）**
  - `server/detail-ai.js`、`server/detail-middleware.js`
  - `server/index.js` 里已被删除的 `buildDetailPromptGroup` **不得复活**（见 `版本记录.md:182`）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 上传字段（`upload.fields([...])`）、`resolveApiKey` 校验、`createDetailAiPlan` 调用与错误公开口径逐字保持。
  4. 响应结构（前端按字段取用）不变。
- **自测校验点**：
  - AB-4 沙盒差分：mock 上游，走「正常 / 缺 KEY / 上游失败」三条路径比对响应
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs`（全套；该端点无专用脚本）
- **真机冒烟**：**【必须·合并 组D】**（真机跑一次一键详情/主图，确认能出图且提示词组行为与改前一致）

---

#### V11-RF-210 · `routes/outfit-analysis.routes.js`（母版贴合分析 + 质检）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/outfit-analysis.routes.js`；改 `server/index.js`（`3155 POST /api/outfit-master-fit-analysis`、`3229 POST /api/outfit-quality-check`）
- **前置依赖任务ID**：V11-RF-103、V11-RF-107
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`server/outfit-master-fit-ai.js`、`server/outfit-quality-ai.js`、`server/outfit-pose-ai.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（该端点无专用脚本 → 沙盒差分必须逐字节）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 失败分支的公开错误映射（`publicPayload.*`）与 `writeGenerationLog` 的 stage 名（`outfit-quality-check` 等）逐字保持；
     `timing.totalMs` 的计算口径不变。
  4. 上传上限与字段名不变。
- **自测校验点**：
  - AB-4 沙盒差分：mock 上游 200 / 500 / 超时，比对响应 JSON 与生成日志文本
- **真机冒烟**：**【必须·合并 组A】**（批量里跑一次姿态/质检相关子流程，看结果与日志）

---

#### V11-RF-211 · `routes/image-proxy.routes.js`（图片代理）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/image-proxy.routes.js`；改 `server/index.js`（`3321 GET /api/image-proxy`）
- **前置依赖任务ID**：V11-RF-010（`server/core/image-proxy.js` 已抽出）
- **标记**：🟢 可并行
- **禁止修改文件清单**：G 全部；额外禁止：`server/core/image-proxy.js`、`src/shared/image-hosts.js`（前后端白名单唯一真相源）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（重点：`image-host-allowlist-check`：私网地址拒、真实 CDN 放行、`ftp://` 拒）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. 🔴 **白名单判定与拒绝路径逐字保持**：非白名单主机直接 `403 { ok:false, message:"blocked_image_host" }` 且**不发起任何上游请求**；无效地址 `400`；
     `blocked_image_host` 的资产日志（`writeAssetLog` stage `image-proxy-blocked-host`）仍要写。
  4. 该端点仍是**唯一**允许的出图图片回传通道；不得新增第二个代理入口（G-6）。
- **自测校验点**：
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only image-host`
  - AB-4 沙盒差分：白名单 / 私网 / `ftp://` / 缺 `url` 参数 四组
- **真机冒烟**：**【必须·合并 组D】**（旧的 CDN 结果图仍能显示；非白名单地址显示为缺图而不是长时间转圈）

---

#### V11-RF-212 · `routes/outfit.routes.js`（批量生成主端点，最大一单）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/outfit.routes.js`；改 `server/index.js`（`2500-3154`，`POST /api/generate-outfit` 整段）
- **前置依赖任务ID**：V11-RF-101、V11-RF-102、V11-RF-103、V11-RF-105、V11-RF-107、V11-RF-109、V11-RF-110、V11-RF-111（**缺一不可**）
- **标记**：🔴 串行（本单是全局风险最高的一单，**必须独占一个工作日，不允许与其他单并行**）
- **禁止修改文件清单**：G 全部；额外禁止：
  - **`deferOutfitAutoSave`（G-5：刻意保留的 unused，本单严禁删除/加 `void`/改它）**
  - `prompts/server/outfit-skill.js`、`server/outfit-skill.js`、`src/shared/outfit-intent.js`、`src/shared/retouch-intent.js`
    （历史硬性决策：2026-09-26 起批量侧**只发用户原话** + 结构化意图编译，**严禁偷偷复原已删除的通用 SKILL 规则块/换装规则开关字段**）
  - `src/outfit-workflow.jsx` 的任务构建代码（本单只动服务端）
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**，其中**必须全过**：`http-mock-check`（4 组 `/api/generate-outfit`）、`outfit-defer-autosave-check`、`outfit-intent-request-check`、`retouch-intent-request-check`、`batch-prompt-passthrough-check`、`local-edit-base-file-check`、`resize-long-edge-check`、`image-host-allowlist-check`。
  2. **AB-2 lint 棘轮不能新增问题** —— 本单有一处**已预告的、必须显式处理的例外**（见 §4 D-2）：
     `deferOutfitAutoSave`（G-5 刻意保留的 unused）就在本单要整体搬走的 `2500-3154` 段里，**无法把它单独留在 `server/index.js`**。
     搬完后必然出现 `server/routes/outfit.routes.js|no-unused-vars = 1` 这个**新 key** → 棘轮按字面判失败。
     事实账目（已核对）：`server/index.js|no-unused-vars` 现在的真实值是 **1**，而基线写的是 **2**
     （基线里另一条 `buildDetailPromptGroup` 已于 2026-09-30 删除），所以搬完后**全项目 warning 总数不变（净增 0；不是"等于 26"——见 §0.1 的实测注记）**：
     `server/index.js` 由 2→0（变少，允许）、新文件 0→1（新 key）。
     **处理方式二选一，必须在 commit message 里写明选哪个**：
     ① 刷新基线并附说明（**本文推荐的唯一诚实做法**）；
     ② 由你决定解除这个标记（**那是业务决定，不是重构**，见 D-2 ③），解除后本单不需要动基线。
     **除这一处之外，AB-2 不得有任何其它新增。**
     🔴 **基线刷新三步防护（评审 D5-1：三步逐条留证，缺一条即判本单不通过）**
     - **防护① · 刷新前先证明「只有这一条」**：必须能证明除预告条目外没有任何其它回归。两种可接受方式，任选其一并在提交里写明用了哪种：
       - **(a) 删行探针**：临时把 `deferOutfitAutoSave` 那一行**整行删掉**再跑棘轮 → `regressions` 必须为**空**，且**全项目 warning 总数与刷新前的实测值相同（净增 0）**；
         随后**逐字节还原**，并用 diff 证明还原干净（该行仍在、文件与探针前一致）。
       - **(b) 直读输出**：不删代码，直接读棘轮输出 → `regressions` 数组里**只有预告的那一条**，
         且 `current.total` **等于刷新前的实测总数**。
         ⚠️ **不要拿基线文件里的 `baseline.totals.total = 26` 当基准** —— 那是 2026-09-25 的历史值，当前真实总数已更低（见 §0.1 的实测注记）。
       - **唯一不变量是「净增为 0」**：删行探针后总数高于实测值，或刷新后总数高于刷新前 → **停，不许刷新基线**。
     - **防护② · 刷新后核对 diff，只允许两处变更**：
       - (i) `counts` 里 `"server/index.js|no-unused-vars"` 这条**整条消失**（该文件计数归 0 时，刷新逻辑会把整个 key 移除）；
       - (ii) 新增 `"server/routes/outfit.routes.js|no-unused-vars": 1`。
       - **除这两处之外，任何其它条目变化、任何 `totals` 变化，一律判失败并回退。**
       - 说明性例外（须在提交里点明，避免被误当成第三处变更）：`generatedAt` 会变成刷新当天的日期 —— 这是刷新动作本身写入的，属预期内的非计数变更。
     - **防护③ · 提交必须附带基线的完整 diff 文本**（`scripts/verify/lint-baseline.json` 的 diff 全文贴进 commit message 或作为提交附件），**不接受"只说刷新了"的提交**。
  3. **请求/响应形状逐字节保持**：`/api/generate-outfit` 返回的本地 `HZ-` 地址、错误码/文案、`attempts` 数组、诊断字段（含 `localUploadParseMs`、`imageConcurrency`）全部不变。
  4. **提示词出口不变**：真正发给上游的 prompt 与搬家前**逐字节相同**（这条由 mock 脚本钉住，必须贴出对比证据）。
  5. **结构化意图校验不变**：非法枚举仍返回 `400`（`validateOutfitIntent` / `validateRetouchIntent` 的调用点与顺序不变）。
  6. **局部回贴底图规则不变**：仍由前端决定并经服务端转发；服务端不得新增任何「底图选择」逻辑。
- **自测校验点**：
  - AB-4 沙盒差分（**本单必须做最细的一组**）：至少覆盖「普通批量 / 换装结构化意图 / 精修结构化意图 / 局部回贴（带 mask）/ 扩图 / 多图 / 缺 KEY / 上游 401 / 上游 429 / 上游超时 / 中途中断」11 条路径；
    每条比对响应 JSON + mock 上游收到的**最终 prompt 全文** + 落盘产物 SHA256 + 任务日志全文
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only outfit`（连带 outfit-intent 两单）
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only http-mock` / `--only batch-prompt` / `--only local-edit` / `--only resize-long-edge`
  - **基线刷新的证据链（对应验收条件 2 的三步防护，缺一条即不通过）**：
    ① 刷新**前**：棘轮输出（证明除预告条目外 `regressions` 为空 / 或删行探针后的空 `regressions`）+ **本次实测的 current.total 读数**；
    ② 刷新**后**：`scripts/verify/lint-baseline.json` 的 diff（只允许「`server/index.js|no-unused-vars` 整条消失」+「新增 `server/routes/outfit.routes.js|no-unused-vars: 1`」这两处计数变更）；
    ③ 把上述完整 diff 文本附进 commit message（不接受"只说刷新了"）。
    另：删行探针若使用，必须用 diff 证明 `deferOutfitAutoSave` 那一行**已逐字节还原**（G-5）。
- **真机冒烟**：**【必须·独立】**（本单必须单独冒烟，不能与其他单合并）：
  ① 批量换装出 2 张图；② 局部回贴（涂抹蒙版）出 1 张并确认**贴回尺寸 = 原图尺寸**；③ 扩图 1 张；
  ④ 中途点停止/关页面再回来，确认任务状态与历史恢复正确；⑤ 看 `logs/tasks/<日期>/<任务ID>.txt` 阶段流水完整。

---

#### V11-RF-213 · `routes/images.routes.js`（通用生图端点）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/routes/images.routes.js`；改 `server/index.js`（`3376-3807`，`POST /api/images` 整段）
- **前置依赖任务ID**：V11-RF-101、V11-RF-102、V11-RF-103、V11-RF-110、V11-RF-111
- **标记**：🔴 串行
- **禁止修改文件清单**：G 全部；额外禁止：`prompts/server/detail-skills.js`、`server/detail-ai.js`、`server/core/asset-persist.js`、`server/core/image-error-policy.js`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**，其中**必须全过**：`http-mock-check`（8 组 `/api/images`）、`generation-failure-path-check`、`pro-wire-check`、`tt25-subdirect-wire-check`、`canvas-asset-check`、`history-integrity-check`。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. **重试/换线路策略逐字保持**：`shouldTryNextChannel` / `shouldTryNextImageVariant` / `shouldTreatPrivateChannelAuthAsChannelFault` 的调用点与判定顺序不变；
     `imageCandidateEntries` 的遍历顺序不变。
  4. **落盘与历史写入语义不变**：`persistGeneratedItemsInBackground` 只被本端点调用；结果文件命名（`writeJingyinNumberedImage` / `writeProcessedImage`）不变。
  5. **413 / 上传上限**行为不变（`IMAGE_UPLOAD_PARSE_CEILING`、`largeImageUpload`、失败时 `removeUploadedFiles` 必须仍被调用，不留临时垃圾）。
- **自测校验点**：
  - AB-4 沙盒差分：至少覆盖「单图成功 / 多图 / 私网 KEY 鉴权失败换线路 / 429 / 500 / 超时 / 超大上传(413) / 无 KEY」8 条路径；
    比对响应 JSON + 落盘文件名与 SHA256 + `tmp/uploads` 是否残留
  - `.\runtime\node\node.exe scripts\verify\run-all.mjs --only http-mock` / `--only generation-failure-path` / `--only pro-wire` / `--only tt25-subdirect-wire`
- **真机冒烟**：**【必须·独立】**：主画板快捷生图 2 张 + 参考生图 1 张；上传一张 **>25MB** 的图确认报错文案里的 MB 数字正确、`tmp/uploads` 无残留；断网出图一次确认失败提示与重试行为正常。

---

### 批次 5 · 收尾（可选）

---

#### V11-RF-220 · `server/index.js` 只留启动（抽出 `server/app.js`）

- **任务类型**：【结构搬运重构】
- **目标操作文件**：新建 `server/app.js`（创建 app、注册中间件与全部路由，导出 `app`/`createApp`）；改 `server/index.js`
- **🔴 本单接管 V11-RF-116 明确留下的两块（评审 D1 的归属裁定）**：
  - `attachFrontend`（快照 `3809-3842`）：前端挂载 —— `NODE_ENV === "production"` 分支、「有 `dist/index.html` 用静态文件 / 否则用内嵌资源」两级回落、dev 分支的 vite 中间件与 `transformIndexHtml`。
    **归属建议**：随 `server/app.js` 一起走（它本质是 app 的装配），但**必须在本单 commit message 里写明最终落点**。
  - 末尾启动块（快照 `3883-3888` 的 `attachFrontend().then(...)`）：**必须留在 `server/index.js`**（它是进程入口的唯一动作）。
  - 本单完成后 `server/index.js` 只保留「导入 + 创建 app + 调用 attachFrontend + 启动」的最小引导；`listenOnPort` / `configureHttpServer` 已在 V11-RF-116 搬走，**不得在本单重复搬运或就地重建**。
- **前置依赖任务ID**：V11-RF-116、V11-RF-201 ~ V11-RF-213（**全部**）
- **标记**：🔴 串行（放最后）
- **禁止修改文件清单**：G 全部；额外禁止：`scripts/secure-win-release.mjs` 的 `entryPoints`（**必须仍是 `server/index.js`**，若改成 `server/app.js` 需单独确认打包链路）、`启动静音内测画板.bat`
- **验收条件**：
  1. **AB-1 `run-all.mjs` 全部通过**（全套 33 项；若 V11-RF-101 已合入则为 34 项 —— 以你改前的基线数字为准）。
  2. **AB-2 lint 棘轮基线不能新增问题**。
  3. **中间件与路由注册顺序逐字保持**（这是本单唯一的真实风险：顺序变了鉴权/压缩/追踪行为就会变）。
     注册顺序必须与搬家前的 `server/index.js` 自上而下**完全一致**，并在 commit message 里贴出「旧顺序 → 新顺序」对照表。
  4. **`attachFrontend` 内部逐字保持**（本单从 V11-RF-116 接管）：
     `NODE_ENV === "production"` 分支、「有 `dist/index.html` 用静态文件 / 否则用内嵌资源」的两级回落、
     dev 分支里 `await import("vite")` 的懒加载与 `transformIndexHtml` 流程、以及 `app.get("*")` 的注册位置，全部不得改。
  5. `server/index.js` 行数降到百行量级；不得再承载任何路由与业务逻辑；末尾启动块仍在 `index.js`。
  6. `scripts/check-syntax.mjs` 自动覆盖新文件（无需人工登记）；`run-all.mjs --list` 脚本数与改前基线一致（33，或 101 合入后的 34）。
- **自测校验点**：
  - AB-4 沙盒差分：跑**全套 run-all** 作为最强等价性证据（全套脚本都在打同一个服务）+ 至少 3 条真机路径的响应比对
  - **前端挂载两条分支都要验**：① `vite build` 通过（产物可被 `dist/` 静态分支消费）；② dev 启动后浏览器能正常打开页面（走 vite 中间件与 `transformIndexHtml` 分支）
  - 打包冒烟：`.\runtime\node\node.exe scripts\secure-win-release.mjs` 的**干跑/构建阶段**若可用则跑一次，确认入口未变
- **真机冒烟**：**【必须·独立】**（双击 `启动静音内测画板.bat`，确认能起、能用）

---

