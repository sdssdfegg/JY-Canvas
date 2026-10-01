# V11 重构 · 总表（枢纽）

> 本文是 `REFACTOR_TICKETS.md` 拆分产物（2026-10-02）。
> 拆分原因：原件 189KB / 47k tokens，写入时报 `Win32 1175 (ERROR_UNABLE_TO_REMOVE_REPLACED)`；同时统筹整读吃力。
> 原件已改名留档为 `REFACTOR-存档-2026-10-02.md`（**只读参考，不再编辑**）。
> 本文 = **枢纽**（纪律 / 批次总览 / 冒烟分组 / 关键决策 / 变更记录）—— 每次关闭工单改的是这里。
> 基线、接口→脚本地图与**全部工单定义**见 `REFACTOR-工单明细.md`。


---

# REFACTOR_TICKETS.md

**项目**：静音AI绘画 V11（包名 `jingyin-internal-canvas`，v11.0.0）· 本清单作用于 **v4.0 重构工作目录**
**工作区**：`D:\源码开发\静音AI画板v4.0源码`（V11 源码的 clone，零远程，`upstream` 指向 V11 源目录）
**本轮主线**：`server/index.js` 剩余部分 → `server/routes/*` + 剩余 `server/core` 模块
**本轮禁区**：`src/main.jsx`、`src/outfit-workflow.jsx` **不生成整体搬迁工单**（仅本文点名的极小范围例外）
**配套执行单**（都是**发给具备命令执行能力的 AI 代理**的分步操作单，不是给人手填的表）：
- [V4.0-执行单-V11-RF-000-010.md](V4.0-执行单-V11-RF-000-010.md) —— V11-RF-000 与 V11-RF-010（**两张均已关闭**，只作格式范本与历史留档，**不要再发出去执行**）
- [V4.0-执行单-V11-RF-101-103.md](V4.0-执行单-V11-RF-101-103.md) —— V11-RF-101 / 102 / 103（批次 3 前三单，均已提交、⏳ 待行为验证）
- [V4.0-执行单-V11-RF-011.md](V4.0-执行单-V11-RF-011.md) —— **V11-RF-011 热修**：P1 人工决策门 + 12 步 + 值级复核对照表 + 前端挂载分支切换的核对（**已提交 919d615、已关闭**）
- [V4.0-执行单-V11-RF-104-106.md](V4.0-执行单-V11-RF-104-106.md) —— 批次 3 第二批（104/105/106，**已完成**；含三类 hunk 修正）
- [V4.0-执行单-V11-RF-107-109.md](V4.0-执行单-V11-RF-107-109.md) —— 批次 3 第三批（107/108/109，**已完成**；含依赖符号盘点表与孤儿 import 清理做法）
- [V4.0-执行单-V11-RF-110.md](V4.0-执行单-V11-RF-110.md) —— V11-RF-110（**已完成**；含"应删孤儿"与"看着像孤儿但不许删"两份对照清单）
- [V4.0-执行单-V11-RF-117.md](V4.0-执行单-V11-RF-117.md) —— **🔴 当前有效执行单（P0 热修）**：修 RF-116 回归（`app-bootstrap.js` 相对导入少一层 → 软件无法启动）；含真机启动验证与"顺手扫同类错"步骤

---

## 0. 取证说明（先读这一节，否则后面的验收条件会被误用）

### 0.9 给执行者（人或 AI）的硬约束

1. 一次只搬一件事；**结构搬运与 bug 修复绝不混在同一次提交**。
2. 只搬运，不改判断条件、不改阈值数字、不改提示词、不改出图参数、不改文件名/字段名。
3. 每单必须 AB-1~AB-4 全过；**沙盒通过不等于功能正确，真机冒烟不可省略**。
4. 新功能一律写 `src/features/<功能名>/`；**禁止继续往 `main.jsx` / `outfit-workflow.jsx` 加代码**。
5. 遇到「不搬就过不去」的地方，**停下来开新单**，不要在同一次提交里解决。
6. 🔒 **单一写入纪律**：**执行者不得修改 `REFACTOR_TICKETS.md` 或任何总表 / 执行单 / 交付报告类 `.md`**（每张任务单都会带上这一句）。成果以**汇报**交回，由文档作者统一落表。理由：这类文档是跨会话的唯一契约，两个写入者会互相覆盖（已实际发生过一次）。
7. **搬前必做的一件事（2026-10-01 教训）**：动手前**遍历待搬区间里的每一个顶层标识符**（函数 / 常量 / 正则），逐个搜全文件引用 —— **只被这段内部使用的才随单搬走；被外部使用的必须留下**。
   `V11-RF-106` 漏了这一步：`buildImageRequestDiagnostic` 引用的 `imageParamsForBaseUrl` / `imageChannelBaseCandidates` 在 `index.js` 另有 3 个调用方，结果被迫在新模块里放**逐字节副本** ⇒ **同名函数 2 处定义**（详见 §5 与 V11-RF-110 的强制验收条款）。**复制实现是本项目明令避免的漂移源**，只能作为最后一招并当场登记欠账。
   🔴 **2026-10-01 追加：执行单里那份"依赖清单"也是人写的，同样会漏 —— 已发生四次**（`106` 漏两个薄包装；`111` 漏 `channelEndpointForBaseUrl`；`112` 漏 `isImageAuthError`/`isImageQuotaError`/`isImagePermissionError`/`quotaFailureMessage`/`compactLogMessage`；`113` 漏 **`videoStatusUrlFromRoute` 整个函数** + `resolveApiKey`）。
   ⇒ **权威判定永远是"机械核查"，不是执行单的清单**：把新模块**实际 import 的符号**逐个回搜 `index.js`，再跑 `eslint` 兜底。执行单的清单只用来**提示重点**。
   ⚠️ **113 那次最危险**：漏的不是 import 而是**一个只被区间内调用的函数** ⇒ 若照单施工，搬完 `index.js` 会直接缺定义。**这正是"搬前遍历区间内每个顶层标识符"（本条上半段）存在的理由** —— 两步都要做，不能只做一步。
8. **import 行的放置（为"一单一 commit"服务）**：若一单要在 `server/index.js` 加 import，请把它插在**与被搬函数相关的 import 附近**，**不要**把多单的 import 全堆在同一处 —— 相邻多行会被 git 合成一个 hunk，导致"一单一 commit"无法自然拆分（`9f699a1` 就是这么被并成一个提交的）。
9. 🔴 **「三类 hunk」修正（2026-10-01，来自 RF-104/105/106 真机红）**：此前写的"每单 diff **只允许两个 hunk**（删定义 + 加 import）"是**错的** —— 它把"清理孤儿 import"当成越界，结果三单留下 **4 个只剩 import 行、正文 0 次使用**的符号，`server/index.js|no-unused-vars` 由 1 涨到 **5**（基线 2）⇒ 棘轮报"新增 1 组 lint 问题"（**棘轮行为完全正确**）。
   **正确规则**：每单 diff **允许且必须**包含这三类 hunk ——
   ① **删定义**（搬走的部分）；② **加本单的 import**；③ **清理因搬家而变成孤儿的 import**。
   **第 ③ 类怎么找（机械做法，别靠记性）**：把新模块的依赖清单列出来（它 import 了哪些符号），逐个在 `index.js` 里搜；**若某符号只剩 import 行本身，就删掉那一行**。收尾再用 eslint 兜底：`server/index.js` 的 `no-unused-vars` 只应剩 **`deferOutfitAutoSave`（G-5 刻意保留）** 这 1 条。
   ⚠️ 先例：`V11-RF-103` 当时做过这件事（移除了 `finalizeBillingTask`/`prepareBillingTask` 两个孤儿 import），104–106 漏了 ⇒ 说明**不能靠执行者自觉，要写进单子里**。
10. 🔴 **路径保真（2026-10-01，RF-116 血案）**：**凡把代码搬进子目录，它内部的相对导入/路径必须按新位置重算层级** —— `index.js` 里的 `./x.js` 搬进 `server/core/` 之后是 `../x.js`。
    **已发生两次、方向相反**：RF-011（`app-paths.js` 的 `rootDir` **少一层**，日志写到 `server/logs/`）、RF-116（`app-bootstrap.js` 的 import **多一层** → `ERR_MODULE_NOT_FOUND` → **整个软件起不来**、`run-all` 从 36/36 掉到 21/36）。
    ⚠️ **这类错逃得过全部现有门禁**：`node --check`（只查语法）、ESLint（未开 import 解析规则）、源码级 grep 门禁（只看符号）、`server-duplication-check` **全都抓不到**。**唯一兜底 = 真机启动一次**；⇒ 已开工单 **V11-RF-018** 补一条"**相对导入路径存在性**"静态门禁（纯 fs 存在性判断，零副作用）。
    **执行单的依赖表必须按新位置给出路径**，不能照抄原文件里的写法 —— 这也是"依赖表只是提示、机械核查才是权威"的又一个理由（机械核查也查不出这一层，**必须靠人/执行者按新位置重算**）。
    ✅ **2026-10-01 已解决**：热修 **`209ad60`**（独立 bugfix commit，仅 `app-bootstrap.js` 一行 `./`→`../`）；真机 `node server/index.js` 正常打印监听地址、`run-all` 恢复 **36/36（416.8s）**、启动器四项冒烟全过。执行者另做了一次"同类扫描"：`server/core/*.js` 全部相对导入逐一核对，**无同类漏网**。
    📌 **顺带一条流程更正**：执行者环境**实测能跑 `run-all` 全套（416.8s 跑通 36/36）** —— 此前"沙盒 `spawnSync` EBUSY、跑不了 run-all"的判断**作废**。⇒ 后续执行单**应要求执行者自行跑 AB-1/AB-2**，人类只负责"界面冒烟"与"真机启动"这两类机器替代不了的验证。

---

## 1. 批次与依赖总览

| 批次 | 工单 | 内容 | 标记 | 前置 |
| --- | --- | --- | --- | --- |
| 批次 0 | V11-RF-000 | 门禁僵尸断言修复（问题③的真实形态） | 🔴 | 无 |
| 批次 1 | V11-RF-001 | KEY 清洗顺序 bug（问题②） | 🟢 | 无（**事实门槛**：000 已合入 + 全套 `npm run check` 绿灯；禁止与 000 的负向测试窗口并行） |
| 批次 1 | V11-RF-002 | `ReferenceThumbTray` 批量版补 P1 修复（问题①） | 🟢 | 无（**事实门槛**：000 已合入 + 全套绿灯；禁止与 000 负向测试窗口并行，且不与 010 之后的文件搬家同期执行） |
| **热修（优先）** | **V11-RF-011** | **`server/core/app-paths.js` 的 `rootDir` 少一层：源码模式下 data/logs 落进源码树**（2026-10-01 核验新发现，见 §1.3） | 🔴 | 无依赖；**决策：先修本单，再跑批次 3 真机验收** |
| 门禁加固 | V11-RF-012 | 把「并发队列语义」固化进门禁（L2-101 转正，纯进程内） | 🟢 | V11-RF-101（已提交）；与 016 抢同一数字位，以改前 `--list` 为准 |
| 测试基建 | V11-RF-014 / 015 / 016 | `run-all` 输出截断修复 / `run-all-check` 两条过时断言 / **服务端同名函数重复门禁**（三单均已关闭；016 已上护栏） | 🟢 | 已完成 |
| **前置抽取（关键）** | **V11-RF-017** | 把图片/视频**共用**的 4 个路由辅助抽到 `core/route-helpers.js` | 🔴 | 无依赖，但**必须排在 111 与 112/113 之前**（见该单说明） |
| **✅ P0 热修（已关闭）** | **V11-RF-117** | 修 RF-116 回归：`server/core/app-bootstrap.js:25` 的 `./static-assets.generated.js` → `../static-assets.generated.js`（一行） | ✅ 已完成 | 无依赖；真机启动验证已过（**209ad60**） |
| **门禁补强** | **V11-RF-018** | 新增「**相对导入路径存在性**」静态门禁（扫 `server/**/*.js` 的相对 import 说明符，必须解析到存在的文件；纯 fs 判断、零副作用） | 🟢 | V11-RF-117（先修完再上护栏，基线才干净） |
| 批次 2 | V11-RF-010 | 校验脚本「服务端源码真相源」统一 | 🔴 | V11-RF-000 |
| 批次 3 | V11-RF-101 ~ 116 | `server/index.js` → 剩余 `server/core` 模块（**16 单**，编号 101–116 连续，账目核对见本批标题下方）<br>✅ **2026-10-01 全部完成**：16/16 单代码与沙盒验证全绿，**8 个新 core 模块**落地（`server/core/` 现 **33 个**），`index.js` **3888 → 2628 行**；真机门禁 **36/36**；`state-singleton-check` 扩至 **4 条监视项**。⚠️ 遗留：`114/115/116` 的真机三组冒烟（组 B / 组 D / 双击 .bat 两次）**尚未做** | 见表 | V11-RF-010 |
| 批次 4 | V11-RF-201 ~ 213 | `server/index.js` → `server/routes/*`（13 单） | 见表 | 对应 core 单 |
| 批次 4' | V11-RF-003 | `ReferenceThumbTray` 抽 `src/shared/ui/`（前端，可选后置） | 🔴 | V11-RF-002 |
| 批次 5 | V11-RF-220 | `server/index.js` 只留启动（抽出 `server/app.js`；**接管 116 留下的 `attachFrontend` 与末尾启动块**，见评审 D1 归属裁定） | 🔴 | 全部批次 4 + V11-RF-116 |
| 持续 | — | 每单收尾的真机冒烟（§3） | — | — |

**建议落地顺序（也是唯一安全顺序）**：000 → 010 →（001、002 任意先后，可插空）→ **011（热修，先做）** → **批次 3 真机验收（清 §5.1 欠账）** → 012（门禁加固，可与后续任意单并行）→ 批次 3 剩余单自底向上 → 批次 4 由小到大 → 220。

### 1.1 评审强制修正记录（Qwen3.8-Max 参谋评审 → 逐条落表）

| 评审项 | 修正要求 | 落在本表的哪里 | 执行结果 |
| --- | --- | --- | --- |
| **D1** | `V11-RF-116` 与 `V11-RF-220` 的 `attachFrontend` 归属矛盾 | V11-RF-116「🔴 本单范围」+ 禁止修改清单 + 验收条件 7；V11-RF-220「🔴 本单接管」+ 验收条件 4 | ✅ 已执行：116 **只搬纯启动函数**，`3809-3842 attachFrontend` 与末尾启动块 `3883-3888` **留在 index.js**，明确移交 220 |
| **D2** | 批次 3「16 单」更正为 15 单（若确认没有第 16 个任务） | 批次 3 标题下方的「批次账目核对」；§1 批次表第 3 行 | ✅ **已关闭**：参谋最新复核确认 D2 属**此前计数错误**，批次 3 **保持 16 张工单（101–116）**，总工单无需改动 |
| **D3** | V11-RF-101 验收缺口（4 处消费方 + 静态断言） | V11-RF-101 验收条件 4、5 + 自测校验点（含负向验证） | ✅ 已执行：4 处消费方逐一列出并要求全部改走只读快照；新增 `state-singleton-check.mjs` 静态断言（符号定义点仅 1 处），并登记进 ORDER |
| **D4** | 批次 4 路由注入契约缺口 | 批次 4「🔴 依赖注入契约」四条 + 留证要求（依赖注入表） | ✅ 已执行：注册函数必须显式接收 `app` + 外部依赖对象；禁止重新实例化 multer/有状态单例；禁止隐式抓取 index.js 作用域变量 |
| **D5-1** | V11-RF-212 基线刷新防掩盖三步 | V11-RF-212 验收条件 2 的「基线刷新三步防护」+ 自测校验点的证据链 | ✅ 已执行：防护① 刷新前证明只有一条且**总数为净增 0**（⚠️ 2026-10-01 修正：原写"总数=26"是错的，26 只是 2026-09-25 的历史基线值，当前真实总数更低，见 §0.1 实测注记）；防护② 刷新后 diff 只允许两处计数变更；防护③ 提交附完整 diff 文本 |
| **D5-2** | V11-RF-001 / 002 前置门槛；002 增加"不与 010 之后的搬家同期" | 两张单的「前置依赖任务ID」字段；§1 批次表第 1 行 | ✅ 已执行：前置仍为「无」，但补上**事实开工门槛**（000 已合入 + 全套绿灯 + 禁止与 000 负向测试窗口并行）；002 另加"不与 010 之后搬家同期" |

**关于 D2 的结案记录**：本表当时按**文件实证**复核 —— `101–116` 为连续 16 个编号、逐个有实体工单（第 16 个即 `V11-RF-116`），故未按"改写为 15 单"执行。
参谋最新复核已确认「15 单」为**此前计数错误**，D2 **结案关闭**，批次 3 账目维持 **16 单**，总工单不做改动。
今后若确实要合并其中两张（例如把 116 并入 220），那属于**重新划分批次**，必须显式写进评审记录，而不是把账目数字改小后让编号悬空。

### 1.2 2026-10-01 交付核验（批次 0 / 批次 2 结项复核 · 由文档作者静态核验）

**核验方式声明**：核验者所在会话**不能执行任何命令**（沙盒拒绝对该工作区授权写 ACL）。以下结论全部来自**读文件 + 读交付留档**，未运行任何脚本。

#### 一、已证实成立的部分

| 项 | 证据 |
| --- | --- |
| V11-RF-010 交付物合契约 | `scripts/verify/lib/server-sources.mjs`：纳入 `index.js + core/routes/shared`（`INCLUDE_DIRS = ["core","routes","shared"]`）；排除 `features/skill-baselines/生成物`（靠"只遍历点名目录"天然实现）；**存在性过滤**到位（目录 `existsSync` 早返回 + 单文件读取 try/catch）；lint 干净（三个导入全部被使用） |
| 4 个脚本改造合契约 | `routing-check`：**逐文件**追加（未合并成整体文本）、未追加 `server/channel-config.js`、未追加 `features` → 与 10-8 的三条「绝对不要」一致；`white-refine`：改用整体文本；`image-host`：改用共享文件列表且保留「找出 import 了 image-hosts 的那个文件」的报告逻辑；`local-edit-base`：`SERVER_SOURCES = listServerSourceFiles()` |
| 零业务改动 | `server/index.js` 仍 **3888 行**；`src/outfit-workflow.jsx` 仍 **11523 行**且第 9470 行 `const originalFile = resolveLocalEditBaseFile(task.modelItem);` **逐字节还原**（000 的 0-7 探针已复原干净） |
| 门禁脚本数未变 | 全套输出末行 `[run-all] 33 个脚本` |
| 部分负向验证留档齐全 | `white-refine`：`negA-white.txt`(ok:true = 搬家后仍命中) / `negB-white.txt`(ok:false = 证伪) / `final-white.txt`(ok:true = 已还原)；000 的 0-7：`local-edit-base-neg.txt`(ok:false) |
| 棘轮替代脚本**逻辑**可信 | `.codex-artifacts/baseline-2026-10-01/compare-ratchet.mjs` 的 `countsOf` / 比较 / 排序与 `lint-ratchet-check.mjs` **逐行等价** → 它的 `regressions=0` **结论可信**（但见下方 #1：它仍不能替代门禁本身） |

#### 二、三处必须修正或补强的偏差

| # | 偏差 | 证据 | 要求 |
| --- | --- | --- | --- |
| **1** | 「14 项失败是 4 类互不相关的环境问题」**不成立** —— 它们是**同一个根因：该执行环境不能可靠 spawn 子进程** | ① `lint-ratchet`：`spawnSync ... EBUSY`（原文）；② `run-all-check`：`run.stdout` 非字符串 → TypeError（该脚本 `:50-51` 正是 spawnSync 之后直接 `.split`）；③ `check-launcher`：`ps1 exit=null, expected=7` + 「ps1 通过 PowerShell 解析」FAIL（子进程根本没跑起来）；④ 11 个脚本 30s 超时「V11 测试实例未起来」。这与 `V4.0-起步说明.md` §二记录的受限环境（"连 `spawnSync("node --version")` 都返回 EBUSY"）是**同一现象** | 在**能正常 spawn 的终端**（真正的 PowerShell，而非受限会话）重跑全套；目标：**「测试实例未起来」归零** + **`lint-ratchet` 自己能跑通**（不接受替代脚本作为门禁结论） |
| **2** | 「000 无源码级断言失败（仅剩浏览器探针类环境红）」**表述过强** | `local-edit-base-file-check.mjs:275` 的 `waitForHealth` 失败会 throw → 第 279 行的 `verifyTaskLogWiring()` **从未执行**、其 2 条断言从未注册。27 项 = 3 逻辑 + 4 对账单 + 10 源码级 + 8 可见性 + 1 浏览器探针 + 1 history 指纹，**全部是静态/逻辑项**。即这一轮**没有拿到任何端到端证据** | 结论不变（无源码回归），但记录必须改写成「**零端到端证据**」，否则后人会误以为端到端过了 |
| **3** | 10-10② 与棘轮结论的**留档缺失** | 留档目录里只有 `routing.txt`(失败 0 / 共 172) 与 `after-routing.txt`(失败 0 / 共 172) 两次"绿"，**没有**「共 173 项 + FAIL 点名 `server/core/uploads.js`」那一次的输出；`compare-ratchet` 的输出也未落成文本（只留了原始 `eslint-full.json`，可复算但未成证） | 补齐这两处留档；在补齐前，这两条按「**未闭环**」记账（本项目纪律：未留证 = 未完成） |

#### 三、由本次核验修正的**本文档自身错误**（已就地改掉）

- **「总数严格等于 26」是错的**：`baseline.totals.total = 26` 是 2026-09-25 生成基线时的历史值；2026-10-01 的 `eslint-full.json` 实测显示 `prompts/server/outfit-skill.js` 已是 **0 warning**（基线记的是 2 —— 该文件里 `referenceMentioned` / `masterWearingLockLines` 已不存在，只剩一行注释提到名字）。
  因此 **V11-RF-212 的「基线刷新三步防护①」与 §4 D-2 已全部改为「净增 0」口径**。不改的话，212 会被一条**不可能满足**的条件卡死。

#### 四、批次 3 开工判定（结论：**暂不开工**）

**判据**：批次 3 每张单的验收条件都依赖 `run-all`（AB-1）与 lint 棘轮（AB-2），而这两者**当前在本机都不可执行**（见二 #1）。批次 3 是**第一次真正改 `server/**` 业务代码**（并发队列、计费签发、结果归档、两个主端点），失去这两张网等于闭眼搬 3888 行 —— 执行单 P5 的原话就是"**不要在红的基线上开工**"。

**开工前必须清掉的三项**：

1. 换到能正常 spawn 的终端重跑全套 → 「测试实例未起来」= 0、`lint-ratchet` 自身跑通；
2. 补齐二 #3 的两处留档（或明确记为未闭环）；
3. 按二 #2 修正 000 的表述（已在本文 §5 与 §1.2 记录）。

**已就绪、不需要再确认的**：101 的验收条件 5 要求复用 010 的共享真相源模块 —— **该依赖已具备**；101 合入后门禁脚本数 33 → 34（§0.1 已注记）。

### 1.3 2026-10-01 核验新发现：`app-paths` 的 `rootDir` 少一层（**既有缺陷，非本批引入**）

**现象（磁盘实证）**：`server/logs/tasks/2026-10-01/task_1_verify-localpaste-*.txt`（**17 个残留**）+ `server/logs/generation.jsonl` 落在**源码树内**；仓库根**没有** `logs/`，也没有 `data/`（`**/history.json` 只出现在 `.codex-artifacts/…` 与 `tmp/sb-*` 沙盒目录里）。

**根因（考古对照 —— 决定性证据）**：

| 搬迁前（V3 快照 `server/skill-baselines/V3-…-2026-08-06/server-index.js`） | 搬迁后（`server/core/app-paths.js`） |
| --- | --- |
| `:32 const runtimeDir = path.dirname(runtimeFile);` | `:25` 同 |
| `:33 const sourceRootDir = path.resolve(runtimeDir, "..");` | `:26` **逐字未改** |
| `:50 … \|\| sourceRootDir` | `:44` 同 |

代码**逐字一致**，但**文件所在目录深度变了**：
- 搬迁前文件在 `server/` → `path.resolve(<root>/server, "..")` = **`<root>`** ✓（与该文件"5. 源码开发模式 → 仓库根目录"的注释一致）
- 搬到 `server/core/` 后 → `path.resolve(<root>/server/core, "..")` = **`<root>/server`** ✗

⇒ 这**恰好是"逐行搬运 + ESLint no-undef 零缺失"这类文本级等价证明抓不到的偏差**：它取决于文件自身的位置，而不是文本内容。

**影响**（**仅源码/网页运行模式**，即 `runtime\node\node.exe server\index.js` 或 .bat 启动时）：

1. **用户数据与日志落进源码树**：实际是 `<root>/server/data`、`<root>/server/logs`，与 `AGENTS.md`、`01-目录分区与维护地图.md` 的记载**不符**；任何按 `<root>/data` 做的备份/清理都会**静默漏掉全部数据**。
2. **`local-edit-base-file-check` 的端到端断言被这条缺陷挡住**：脚本按 `<root>/logs/tasks/<日期>/<requestId>.txt` 读，服务端却写在 `<root>/server/logs/…` ⇒ 在**能起实例**的真机上该断言会**失败**（"任务日志未生成"）；而它的清理段删的是不存在的路径，真文件永远清不掉 —— **那 17 个残留就是这么攒出来的**。
3. `server/logs/`、`server/data/` **已被 `.gitignore` 覆盖**（`logs/`、`data/` 是不含斜杠的模式，按 git 语义匹配**任意层级**）⇒ 不会误入提交，但磁盘污染 + "数据到底在哪"的排查成本会长期存在。
4. **打包模式不受影响**：`packagedRootDir` / `%LOCALAPPDATA%\静音AI绘画数据` 分支优先级高于 `sourceRootDir`，EXE 运行时路径正确。

**处置**：见 **V11-RF-011**（热修，独立 commit）。**禁止**把它塞进批次 3 的任一单（结构搬运与行为修复不得同 commit）。

**执行状态（2026-10-01）**：✅ 代码已修复（`sourceRootDir` 由 `path.resolve(runtimeDir, "..")` 改为 `path.resolve(runtimeDir, "..", "..")` —— 文件从 `server/` 搬到 `server/core/` 后需上溯两级才到仓库根），顶部注释与 `sourceRootDir` 注释同步说明"勿改回一级"。✅ **本环境验证全部通过**：① 改前探针 rootDir=`<root>/server`、distDir 不存在；② 改后探针 rootDir=仓库根、dataDir=`<root>/data`、uploadTempDir=`<root>/tmp/uploads`、日志目录=`<root>/logs`、distDir 存在（前端挂载分支将切到磁盘 dist）；③ 新增门禁 `scripts/verify/app-paths-check.mjs`（纯进程内）登记 ORDER（**34→35**），覆盖"源码兜底 rootDir=仓库根 + 落点 + JINGYIN_RELEASE_ROOT 仍最高"；正向 ok:true，负向把层级改回一级→变红并点名 `…/server`（已逐字节还原）；④ `run-all --list` 由 34→35。⛔ **提交暂挂**（执行单 P2 门槛：须等能 spawn 的真机跑完 AB-1 全套 35 项失败 0 + `local-edit-base-file-check` 端到端转 PASS 后再独立提交，禁止与批次 3 混 commit）。⚠️ **P1 数据落点决策**：`server/data/results` 为空（0 文件）、`server/logs/` 仅 17 个 `task_1_verify-localpaste-*` 测试残留 + `generation.jsonl`（测试残留）；仓库根 `data/app-settings.json` 已存在且正是修复后目标落点 ⇒ **无真实用户数据需迁移**。（清理 `server/logs/` 已于 2026-10-01 在本环境执行：删除 17 个 `task_1_verify-localpaste-*` 残留 + `generation.jsonl`；`server/data` 仅空 `results/`，亦一并删除。二者均被 `.gitignore` 覆盖，不进提交；停服后服务端会在仓库根自动重建 `logs/`。）
⚠️ **修之前必须人工确认**：是否已有机器把真实数据落在 `<root>/server/data` —— 因为修复会把落点改回 `<root>/data`，涉及"已有数据怎么办"的人工决策，**不是自动搬迁**。

**给真机验收的一条预警**：跑 AB-1 时若 `local-edit-base-file-check` 出现与"端到端写日志 / 临时日志已清理"相关的 1–2 条失败，**那是本条缺陷，不是 V11-RF-101/102/103 的回归** —— 先别回退那三单。

**清理建议（人工，1 分钟）**：删除 `server/logs/`（17 个 `task_1_verify-localpaste-*` 全是测试残留 + `generation.jsonl`），目录会被服务端自动重建。删之前按文件名确认没有真实运行日志混在里面。

#### 现场发现（同日）：双击启动器「进不了页面」——与本节同源，但**不是本次修复引入的回归**

**证据链（全部来自磁盘，可复核）**：

| 证据 | 读数 | 说明 |
| --- | --- | --- |
| `启动静音内测画板.bat` → `scripts/start-jingyin-board.ps1` | **不设 `NODE_ENV`** | ⇒ 服务器进的是 `attachFrontend()` 的 **vite dev 分支**，不是 production 的 dist/内嵌分支 |
| `logs/launcher-server.log` | `[vite] (client) Re-optimizing dependencies because vite config has changed` + `Jingyin AI Canvas http://127.0.0.1:8787` | 服务器**起来了**，vite 正在跑（root 变化使 vite 依赖缓存失效 → 重新预构建） |
| `logs/launcher-server.err.log` | **空** | 服务端**没有任何异常** |
| `logs/generation.jsonl`（仓库根） | 最后一条是 `2026-09-30T16:06Z`；**没有** 13:13 那次的 `client-app-loaded` | ⇒ **前端从未加载成功**（应用启动时会发这条客户端事件） |
| `node_modules/.vite/deps/_metadata.json` | 存在 | vite 预构建至少跑过一次 |
| `data/app-settings.json`（仓库根） | 存在（`data/` 下唯一文件） | 与"修复后落点 = 仓库根"一致，且**没有** history/results ⇒ P1 的"无真实用户数据需迁移"成立 |

**根因判断（按可能性排序）**：
1. **vite dev 首次预构建窗口**：root 变化让 vite 依赖缓存失效，首次请求触发 re-optimize，期间浏览器常拿到 `504 (Outdated Optimize Dep)` → **白屏/卡住，刷新一次通常即好**。对这个体量（`main.jsx` 8953 行 + `outfit-workflow.jsx` 11523 行）首屏转换本身就慢。
2. **启动器开浏览器太早**：`ps1` 在 `/api/health` 通过后就 `Start-Process $AppUrl`，而 health 通过**与 vite 是否就绪无关** ⇒ 用户看到的是"已经在跑的慢加载"，容易判定为"进不去"。
3. 服务端 500 / 崩溃**已被排除**（stderr 为空、端口已监听）。

**🔴 关键结论（别搞反）**：**修复前，这条 dev 分支本来就打不开页面。**
`attachFrontend()` 的 dev 分支读的是 `path.join(rootDir, "index.html")`：
- **改前** `rootDir = <root>/server` ⇒ 读 `<root>/server/index.html` ⇒ **该文件不存在**（仓库根有 `index.html`，`server/` 下没有）⇒ 必然报错；
- **改后** `rootDir = <root>` ⇒ 读 `<root>/index.html` ⇒ **存在且引用 `/src/main.jsx`** ⇒ 这条分支**第一次具备能打开的条件**。

⇒ "进不了页面"**不是 011 引入的回归**，而是 011 **第一次让这条路可能走通**，从而暴露了 vite dev 的首次加载体验问题（以及一个产品级问题，见 §4 D-5）。

**立即补救（按顺序试，前两步通常就够）**：
1. 页面出来后**手动刷新一次**（vite re-optimize 后必须刷新才能拿到新依赖）；
2. 仍白屏 → F12 看 Console/Network：若为 `504 (Outdated Optimize Dep)` ⇒ 删掉 `node_modules\.vite`、重启服务、再刷新；
3. **最稳的可用路径**：让服务走 **production 分支**（启动前设 `NODE_ENV=production`，或临时在 `.bat` 里加一行）⇒ 服务 `<root>/dist`。
   已核：`dist/index.html` 引用 `/assets/index-FHAEZSa6.js` 与 `/assets/index-4tqmSYnl.css`，**两者都在**；且 `src/` 自该次构建以来未改动 ⇒ 页面应当秒开。
   **这条同时验证执行单 1-6 预警的"前端来源由内嵌切到磁盘 dist"**。

**顺带发现一个启动器证据缺口（值得单开小单）**：`ps1` 只在**启动失败**或"服务已在运行"时才写 `launcher-diagnostic.log`；**启动成功时它保留上一次的内容**（本次残留的正是 08:59 的 `check-launcher` 夹具运行，我一开始就被它误导过）⇒ 现场排障会读到过期诊断。建议：无论成功失败都重写诊断日志（含端口、node 路径、**前端分支判定**）。

**✅ 2026-10-01 真机复测结论（用户实机，双击 `.bat`）**：**页面可以打开、出图正常** ⇒ 上面的判断成立：011 让 dev 分支第一次可用，**不是**回归。这同时构成 **011 的 1-12 冒烟**与 **101 组 A 的主体**（见 §5.1 B4）。

**011 的验收状态（2026-10-01 结论）**：
| 验收项 | 状态 |
| --- | --- |
| 1-5 值级复核（`rootDir`/`dataDir`/`uploadTempDir`/日志目录/distDir） | ✅ 改前/改后对照表已出 |
| 1-7 新门禁 `app-paths-check` + ORDER 34→35 | ✅ 真机全套里 `app-paths-check … 通过` |
| 1-8 正负向成对 | ✅ 负向变红并点名实际值、已还原 |
| **1-11** `local-edit-base-file-check` 端到端转 PASS | ✅ **36/36**（此前一直被本缺陷挡红） |
| **1-12** 真机出图 + `data`/`logs` 落在仓库根 | ✅ 出图正常；日志落在 `logs/tasks/2026-10-01/`；`data/` 在根 |
| **P2 提交门槛**：全套 **35 项失败 0** | ⏳ **仅差这一项** —— 被 `run-all.mjs` 的 `process.exit()` 偶发截断挡住（→ **V11-RF-014**，1 行）。修完补跑一次即可提交 |

**⚠️ 归因待确认的一条（不要抢功）**：用户另报"**批量生成时切换页面会导致生图结果卡住**"的问题现在**不再复现**。
- 这是**前端**（`outfit-workflow.jsx` 的运行账本/结果恢复，见 §0.7 登记表相关行）的语义，本批 101–103 与 011 **都没有碰过前端**；
- 在**能复现出该问题的旧副本**上做一次对照（同一条批量任务、同样的切页面动作）之前，**不得**把"不再复现"写成"本批修复了它"；
- 若确认它在本工作区此前可复现、现在不可复现，才值得单独开一张**前端 bug 单**去定位（那会是一条高价值线索，但不属于本轮 server 搬运的功劳）。

---

## 3. 真机冒烟测试清单（沙盒通过 ≠ 功能正确）

**规则**：每张工单收尾，按它标注的「冒烟组」跑对应组一次；标【必须·独立】的工单必须**单独**跑一次，不允许与其他单合并。

| 组 | 覆盖工单 | 冒烟动作（开发者真机，`.\runtime\node\node.exe server\index.js` 后浏览器操作） | 看什么 |
| --- | --- | --- | --- |
| **A** | 101, 102, 103, 107, 109, 110, 111, 210, 212* | ① 快捷生图 1 张 ② 批量换装 2 张 ③ 局部回贴（涂抹）1 张 ④ 断网再出一次 | 能出图、图片不发虚；贴回输出尺寸=原图尺寸；断网时失败提示正常且任务状态可恢复 |
| **B** | 105, 108, 114, 205, 206, 207, 208 | ① 打开历史/图库看图 ② 打开「数据与存储」看用量 ③ 指定保存目录并保存一张 ④ 历史修复（只标记） | 图片能显示（不半张）；用量数字与磁盘一致；保存的文件真的在目标目录；修复不误删 |
| **C** | 112, 113, 203 | ① 快捷视频出 1 条 ② 批量视频面板出 1 条 ③ 故意给一个无效视频模型 | 能出片、状态轮询正常结束；失败文案正常（不是空白/英文栈） |
| **D** | 104, 115, 201, 209, 211 | ① 打开设置看模型/线路 ② 点连接测试 ③ 指定文件夹 ④ 一键详情/主图 1 张 ⑤ 打开一条含旧 CDN 图的历史 | 列表与价格正常；连接测试有结果；目录弹窗能出能记住；详情能出图；旧图能显示或缺图卡片自愈 |
| **E** | 102, 106, 202, 204 | ⚠️ **注意（2026-10-01 实测更正）**：② 「传参自检」**在界面上已经不存在**（`main.jsx:2904` / `outfit-workflow.jsx:6770` 注明：2026-09-25 起设置里的「开发诊断」区（含传参自检按钮）已整体替换为「连接测试」）。<br>⇒ 组 E 对 **106** 的有效冒烟只能是 ① **提示词优化（联网 + 断网各一次）**；106 自身的验证改为**直接 `POST /api/debug/image-request-params`**（沙盒差分三组入参），**不要再让人类去找那个按钮** | 联网返回模型文案、断网走本地兜底；106 的差分三组响应结构一致 |
| **独立** | 001（微信粘贴 KEY）、002（失效参考图）、116（启动/重复双击）、212（批量全链路）、213（含 >25MB 上传）、220（打包启动） | 见各工单「真机冒烟」条目 | 逐条对照 |

\* 212 虽在组 A 有覆盖，但**必须额外独立跑一次**（见该单）。

**冒烟记录要求**（写进提交或 PR）：日期、机器、执行的工单、做了什么、看到什么、有没有异常截图/日志路径。**没有真机记录 = 该单不算关闭。**

---

## 4. 待决策项（需要你拍板，本文不擅自开单）

> 编号提示：本节的 **D-1 ~ D-4** 是**待决策项**（带连字符）；§1.1 里的 **D1 ~ D5** 是**评审修正项**（不带连字符）。两套编号不要混。
> 工单正文里写「见 §4 D-2 / D-3」时，指的是**本节**的待决策项。

- **D-1 · `local-edit-base-file-check` 的浏览器探针语义**：该脚本在拿不到浏览器回执时记的是**失败**（`check(..., false)`），而其余脚本多是「部分跳过」。若你的机器稳定没有 Tabbit CLI，`run-all` 永远红。要不要把它改成 skipped 语义（会**放松门禁**，属独立决策）？建议：**先确认真机是否装了** `%LOCALAPPDATA%\Tabbit\LocalAgent\bin\tabbit-cli.exe`，装了就不动。
- **D-2 · `deferOutfitAutoSave` 与 lint 棘轮的冲突（V11-RF-212 会遇到）**：它是**刻意保留的 unused**（G-5），且位置就在 V11-RF-212 要整体搬走的 `/api/generate-outfit` 处理函数体内 —— **无法只留这一行在 `server/index.js`**。
  账目（已核对）：基线 `server/index.js|no-unused-vars = 2`，其中 `buildDetailPromptGroup` 已于 2026-09-30 删除 → 现在真实值是 **1**；搬完后 `server/index.js` 2→0（变少，允许）、`server/routes/outfit.routes.js` 0→1（**新 key，字面判失败**），**全项目总数净增 0**（⚠️ 不是"等于 26"：`baseline.totals.total = 26` 是 2026-09-25 的历史值，2026-10-01 实测 `prompts/server/outfit-skill.js` 已从 2 条降为 0 条，当前真实总数更低）。三条路：
  ① **推荐**：搬完后刷新一次 lint 基线，提交信息写明「G-5 刻意保留的门禁标记随代码迁移，全项目 warning 总数未增加（净增 0）」。
     这是唯一既完成搬运、又不掩盖问题、也不撒谎的做法。**但刷新必须走 V11-RF-212 验收条件 2 里的「基线刷新三步防护」（防护① 刷新前证明只有这一条且净增 0 / 防护② 刷新后 diff 只允许两处变更 / 防护③ 提交附完整 diff 文本）** —— 三步缺一即判该单不通过。
  ② **暂缓 V11-RF-212**：把最大的这一单留到最后再决定（`server/index.js` 仍是路由宿主），其余单照做。棘轮零扰动。
  ③ 由你决定**解除这个标记**（删掉或接线使用）—— **那是一次业务决定，不是重构**，必须单独一张工单、单独验证，不得塞进 V11-RF-212。
- **D-3 · `server/routes` 的注册风格**：本文统一要求「导出注册函数、在 `server/index.js` 按原顺序调用」。若你更想用 `express.Router()`，需要确认中间件顺序与 `app.get("*")` 前端回落注册的相对位置 —— 建议本轮**不引入 Router**，把顺序风险压到最小。
- **D-4 · 前端两大巨石**：本轮**不开整体搬迁单**。`src/features/outfit/workflows/` 下 11 个分区仍只有 README（现状），按童子军原则**只在该分区业务真正被修改时**才迁实体代码。
- **D-5 · 🔴 源码版启动器到底该走哪个前端分支？（新品，现场暴露）**：`启动静音内测画板.bat` → `scripts/start-jingyin-board.ps1` **不设 `NODE_ENV`**，因此双击启动**永远走 vite dev 分支**。后果（见 §1.3 现场发现）：首屏要过 vite 依赖预构建（慢、脆弱、白屏需刷新），且**在 011 之前这条分支根本打不开页面**。
  三条路，需要你拍板（这不是我能擅自改的）：
  1. **让启动器显式走 production 分支**（`.bat`/`ps1` 里设 `NODE_ENV=production`）⇒ 直接服务 `<root>/dist` 或内嵌资源，**秒开、稳**；代价是改源码后需要重新构建才生效（开发时就该用 `npm run dev`）。
  2. **保持 dev 分支**，但补两件事：启动器等"vite 就绪"再开浏览器；诊断日志记录分支判定与首屏耗时。
  3. 两条并存：`.bat` 走 production，另留一个开发者用的 `dev.bat`（`npm run dev`）。
  **建议 1 或 3**（产品承诺是"双击就能用"）。定了之后开 `V11-RF-013` 工单（含 `check-launcher` 的断言同步）。
  顺带一条小单（可与 013 合并）：**启动成功时 `ps1` 不重写 `launcher-diagnostic.log`**，导致现场排障会读到上一次的过期诊断（本次就误导过一次）。
  **⏸️ 2026-10-01 现状**：用户实机确认"能用、出图正常"，因此**暂不改**（能用就别动）；待 011 提交后再定。
- **D-6 · 老交付报告的归档（已定，等时机）**：根目录 21 份 `V11-*-2026-08/09-*.md` 历史交付报告 **不删除**，**等批次 3（101–116）全部关单后一次性归档**到 `docs/历史交付报告/`。
  - **为什么不删**：总表把它们当**证据**引用 —— `V11-第4b阶段-lint行为风险审查与棘轮-交付报告-2026-09-25.md`（§0.1 第 28 行：lint 基线 26 条构成的唯一出处）、`版本记录.md`（§1.3 与 V11-RF-209：`LocalDetailPanel` 删除 / `buildDetailPromptGroup` 不得复活的唯一记载）、`V4.0-起步说明.md`（§0.6：行号漂移与受限环境 EBUSY 的出处）。项目纪律是"**未留证 = 未完成**"，删报告等于拆审计链。
  - **归档时要同步改的引用**：移动后只需改 `REFACTOR_TICKETS.md` 里指向那份 4b 报告的路径（`版本记录.md`、`V4.0-起步说明.md` 留在根不动）。
  - **可随手清的**（不属归档范围）：`.codex-artifacts/` 里的旧目录、`tmp/sb-*`、`logs/` 里旧的 `launcher-*.log`（留最近 2–3 个）。
  - **保留到关单再删**：`.codex-artifacts/baseline-2026-10-01/`、`.codex-artifacts/batch3-2026-10-01/`（当前核验与关单要用）。
  - **绝不能删**：`data/`（用户设置与历史）、`runtime/`、`node_modules/`、**`dist/`**（011 之后 production 分支会用它提供页面）、`server/static-assets.generated.js`（内嵌兜底）。

---

## 5. 变更记录（关闭工单时在这里追加一行）

| 日期 | 工单 | 结论 | 真机冒烟 | 提交号 |
| --- | --- | --- | --- | --- |
| 2026-10-01 | V11-RF-000 | 僵尸断言早已由 3ac261e 移除；本回合真机核验：脚本无源码级断言失败（仅剩浏览器探针类环境红，归属 D-1）；0-7 负向验证通过（136/143 断言能抓回归），业务代码已逐字节还原 | 不需要（无业务改动）；已跑脚本+负向验证 | 3ac261e |
| （待填） | V11-RF-001 | | | |
| （待填） | V11-RF-002 | | | |
| 2026-10-01 | **V11-RF-011** | ✅ **已提交**（热修：`rootDir` 少一层，Phase 1 搬迁遗留）。值级复核改前/改后对照 + 新门禁 `app-paths-check`（纯进程内）+ ORDER **34→35**；打包优先级链逐字未改；P1 决策：**无真实用户数据需迁移**（`server/data` 不存在；根 `data/` 仅 `app-settings.json`）。真机证据：`local-edit-base-file-check` **36/36**（此前一直被本缺陷挡红）、真机出图正常、日志落在**仓库根** `logs/tasks/` | 已做（双击 .bat 出图正常） | **919d615**（独立 commit，不与任何批次混） |
| 2026-10-01 | **V11-RF-014** | ✅ **已提交并真机复核生效**（测试基建）：`run-all.mjs` 末行 `process.exit(...)` → `process.exitCode = ...`，让 stdout 完整 flush。真机跑 `run-all-check` 后，「人读输出里点名失败脚本」已由红转 **`pass:true`** ⇒ 本单闭环；同次运行**另行暴露**两条过时断言 → **V11-RF-015** | 不需要 | **cfac8fc**（独立 commit，仅 1 行） |
| 2026-10-01 | **V11-RF-015** | ✅ **实现完成 + 真机复核通过**（测试基建）：`run-all-check.mjs` 两条过时断言改为按 `check-syntax.mjs` 新设计检查（`check` 串 `check-syntax.mjs`；**新增更强断言**从源码正则读 `SCAN_ROOTS` 并断言覆盖 `server/src/scripts/prompts`）；`check:syntax` 改为断言指向 `check-syntax.mjs`；`:137/:155` 两处误导性 detail 改中性。**`package.json` 一个字未改**（没复活那串会腐烂的手写清单）。真机：`run-all-check` 由 `ok:false`（failed 2）转为 **`ok:true`、`total:27`、`failed:0`** | 不需要 | （独立 commit，见执行者汇报） |
| 2026-10-01 | V11-RF-010 | 新建共享模块 `scripts/verify/lib/server-sources.mjs`（统一收集 index.js + core/routes/shared 下所有 .js，目录不存在安全跳过）；4 个脚本改用该模块，零业务改动；10-10 三条负向验证全过（改名路由仍命中 / core 写禁令牌被点名 / routes-shared 不存在四脚本均正常跑完）；全套 run-all 仅 14 项失败且全部为环境类（V11 测试实例未起来 11 项 + lint-ratchet EBUSY + run-all-check 自身 TypeError + check-launcher ps1 环境），无源码级断言回归 | 已跑 4 脚本本体 + 负向验证 + 全量 eslint 棘轮（regressions=0）；主入口 33 项未变 | b990647（原记录写作"待提交"，2026-10-01 由文档作者回填；交付核验见 §1.2） |
| 2026-10-01 | V11-RF-101 | ✅ **已关闭**（AB-1 于 **2026-10-01 真机观测达成**：全套 **35 项、失败 0**；`run-all-check` `ok:true`、`total:27`）。已抽 `server/core/image-concurrency.js`（状态定义仅 1 处、7 个读取点收口到 `imageQueueSnapshot()`、3 个调用点齐、快照只读、limit 来自 runtime-config）；门禁 `state-singleton-check` 已建并登记 ORDER（**33→34**）+ 负向验证两次点名；L2 进程内测试 14 项全过；**真机冒烟**：出图正常 + 任务日志里「本地并发队列已放行 / 本地并发排队：0 毫秒」在册 | 已做（真机出图正常） | 6d9716a |
| 2026-10-01 | V11-RF-102 | ✅ **已关闭**（AB-1 同上达成）。已抽 `server/core/generation-trace.js`（注册行位置未变、内部 Map 未导出、requestId 口径逐字保留并注释标注"不可修正"）；L2 假 `req`/`res` 测试 10 项全过；**真机证据**：`logs/tasks/2026-10-01/task_1_1790837961424_tfhyxo.txt` 显示「本地服务收到生成请求」→「本地服务响应结束」（200）阶段齐全 ⇒ 覆盖了 L2 未覆盖的"日志真的被写出"那一层 | 已做（组 A 主体） | df722b7 |
| 2026-10-01 | V11-RF-103 | ✅ **已关闭**（AB-1 同上达成）。已抽 `server/core/billing-attempts.js`（仅改 import、13+2 调用点零改动、无 KEY 字面量/无新上游地址、孤儿 import 处理正确）；L2 测试 16 项全过（401/429/超时 + 禁用态不调 fetch）。⚠️ **遗留说明（不影响关闭）**：真机日志里**没有** `billing-gateway-prepare/-finalize` 阶段 ⇒ 当前配置下**计费网关未启用**，该模块在真实请求里只跑了"透传 + 未启用早返回"两条路径；`enabled:true` 的签发/落账路径**无真机证据**，留待启用计费网关的环境再补 | 已做（真机出图 3 张，中转站侧计费一致） | edab30d |
| 2026-10-01 | **V11-RF-104 / 105 / 106** | ✅ **已关闭（2026-10-01 真机 35/35）** —— 三单合并为 1 个 commit `9f699a1`（三行 import 相邻被 git 并成一个 hunk；**已知偏离"一单一 commit"**，回退映射见下行）。已抽 `server/core/directory-picker.js`（`openDirectory`/`pickDirectory`）、`history-display.js`（`imageForImmediateDisplay`/`isBase64ImagePayload`/`hasHistoryDisplayArchive`/`historyItemForImmediateDisplay`）、`image-diagnostics.js`（`clampDiagnosticImageCount`/`diagnosticPlaceholderFiles`/`diagnosticFieldValue`/`describeDiagnosticVariantFields`/`buildImageRequestDiagnostic`）；`server/index.js` **3673 → 3430 行**，5 处调用点逐字未改（`719` 调试路由 / `1858`+`1873` 保存目录 / `3133`+`3136` 批量结果历史）。**沙箱内**：`node --check` 4 文件、3 个新模块 eslint 0/0、进程内 `logic-test.mjs` ALL PASS。**真机**：全套 **35/35**；冒烟（人类）——**组 B 通过**（前端上传与缩略图正常）；**组 E 无效**（「传参自检」UI 已于 2026-09-25 移除，见 §3 更正）；**组 D 未单独点**（低风险，可顺手补）。<br>🔴 **两笔记账**：① `V11-RF-106` 因两个薄包装无法搬走而在新模块内放**逐字节副本** ⇒ 同名函数各 2 处定义（收口人 **V11-RF-110**，护栏 **V11-RF-016**；根因是执行单漏写依赖 → §0.9 第 7 条）；② 首次真机红 = **4 个孤儿 import** 未清（`normalizeUsableSaveDirectory:71`/`imageProxyUrl:81`/`archiveIncomingHistoryItem:122`/`normalizeHistoryItem:125`）⇒ `server/index.js\|no-unused-vars` 1→5（基线 2）⇒ **棘轮拦下（行为完全正确）**；根因是执行单"只允许两个 hunk"的规则把"清孤儿 import"误判为越界 ⇒ 已改 **三类 hunk**（§0.9 第 9 条）。<br>回退映射：删 104 → 删 `directory-picker.js` + 对应 import 行；105/106 同理。 | 已做（**组 B + 组 D 均通过**；E 无 UI 入口） | **9f699a1**（搬运）+ **57f01a9**（孤儿修正） |
| 2026-10-01 | **V11-RF-107 / 108 / 109** | ✅ **已关闭（真机 35/35）**。已抽 `server/core/outfit-upload-groups.js`（`outfitUploadFileGroups`/`imageFromOutfitArchive`）、`local-image-stream.js`（`parseByteRange`/`streamLocalImageFile`）、`outfit-archive.js`（`archiveOutfitGeneratedImage`/`cacheOutfitGeneratedImageForDisplay`/`archiveOutfitGeneratedImageInBackground`）；`server/index.js` **3430 → 3264 行**。<br>✅ **本批做对的**：**跨模块依赖 109 → 107 用 import 而不是复制**（已核：`imageFromOutfitArchive` 全服务端只在 `outfit-upload-groups.js:17` 定义、由 `outfit-archive.js:13` import）—— 正面吸收了 106 的教训；`parseByteRange`（纯函数）**8/8 进程内测试通过**；3 个新模块 eslint 0；**孤儿 import 用"全文件 grep + eslint"机械判定**，共清 4 处，其中 `parseByteRange`/`archiveOutfitGeneratedImage` 是执行单**没列到**的险漏（靠机械做法兜住的）。<br>📌 三单各 1 个 commit、import 分散放置（§0.9 第 8 条生效）。<br>⚠️ **未单独做的冒烟**：107 组 A（上传三形态）、108 组 B、109 组 A —— 其中 **109 的显示契约已由 `outfit-defer-autosave-check` 5 组全过覆盖**，108 的"图片完整显示"与 107 的"上传"在用户实机使用中已多次通过 | 部分（用户实机上传/缩略图正常） | 🔴 **未提交（压在工作树里）** —— 见 §5.2 |
| 2026-10-01 | **V11-RF-017 / 111** | ✅ **代码完成 + 真机 36/36**（`server/core/` 现 **28 个模块**；`index.js` **3212 → 3040 行**）。<br>**017**：新建 `server/core/route-helpers.js`，逐字节搬 4 个**图片/视频共用**辅助（`videoRouteText`/`hasHeader`/`safeSignedRouteHeaders`/`signedRouteCredential`，原 `614`–`647` 连续区间）；`videoRouteText` **保持原名**（G-8）并留注释；屏蔽头集合 / 大小写不敏感 / 八字段兜底顺序逐字保留。<br>**111**：新建 `server/core/image-route-candidates.js`，搬 11 个图片线路函数（原 `718`–`861`）；**4 个共用辅助 import 自 `./route-helpers.js`，未复制**（文件头把"禁止复制 + 016 门禁会拦"写进注释）；导出 6 个外部符号、5 个内部符号不导出（最小暴露）。<br>**已核**：`index.js` 12 处调用点全部在位（`1999-2011` / `2620-2632`）；4 个辅助仍被视频块使用（`623`–`687`）故无孤儿；6 条孤儿 import 已清；`server-duplication-check` 绿、0 跨文件同名。<br>📌 **执行单自身又漏了一条依赖**：`111` 还用到 `channelEndpointForBaseUrl`（`../channel-config.js`），由执行者的机械核查抓出 —— 已把"**以机械核查为准、执行单清单只是提示**"写进 §0.9 第 7 条（同类漏项已发生两次：106、111）。 | 组 A 未做（`tt25` JSON 路径；`tt25-subdirect-wire-check` 绿） | ✅ **已落库**（批次提交号**待核**，见 §5.2） |
| 2026-10-01 | **V11-RF-112 / 113** | ✅ **代码完成（待真机验证）** —— `server/core/` 现 **30 个模块**；`index.js` **3040 → 2831 行**（相对本批起点 3888 行共减 **1057 行**）。<br>**112**：新建 `server/core/video-error-policy.js`（`publicVideoErrorCode`/`publicVideoErrorMessage`/`publicVideoTaskFailureMessage`/`publicVideoTaskPayload`）。**实测依赖（初版执行单写"预期零依赖"，错了）**：`isImageAuthError`/`isImageQuotaError`/`isImagePermissionError`/`quotaFailureMessage`（`./image-error-policy.js`）+ `compactLogMessage`（`./format-utils.js`）；其中前两组在 `index.js` 成孤儿已删、`isImageAuthError` 与 `compactLogMessage` 因端点仍在用而**保留**。<br>**113**：新建 `server/core/video-route-session.js`（`videoRouteUrl`/`videoStatusUrlFromRoute`/`createVideoRouteFromBillingTask`/`rememberVideoRouteSession`/`videoRouteForStatus`）。🔴 **执行单漏了 `videoStatusUrlFromRoute` 整个函数**（只被区间内调用，若照单施工会直接缺定义）**＋ `resolveApiKey`** —— 均由机械核查抓出。4 个共用辅助 import 自 `./route-helpers.js`（未复制）；**模块级状态 `videoRouteSessions` 已整行搬入且 `index.js` 那行已删**（状态单例陷阱已按 101 的先例处理）；`VIDEO_ROUTE_SESSION_TTL_MS` 随之从 `index.js` 的 import 清单删除（孤儿）。<br>⚠️ **本单是本批唯一没上过真机的部分** ⇒ 真机若红，凶手范围只有 112/113。 | **组 C（视频：提交 + 轮询状态）待做** | ✅ **已提交**：**112 → 71cf34c**、**113 → 371736b**（3 文件，+155/−118）；`run-all` 真机 **36/36** |
| 2026-10-01 | **V11-RF-114 / 115 / 116** | ✅ **代码完成 + 本环境全绿（批次 3 收官三单）** —— `index.js` **2831 → 2628 行**，`server/core/` 现 **33 个**模块，`--list` 仍 **36**（116 只扩门禁监视名单，未新增脚本）。<br>**114 → `049d4f5`**（`storage-usage.js`：`STORAGE_TARGETS`/`STORAGE_IMAGE_PATTERN`/`storageDirUsage`/`storageUsageSnapshot`；六项字段、两个 `catch`、六个返回字段逐字）；**115 → `b736137`**（`gateway-connectivity.js`：HEAD→GET、8000ms、`ok<500`、7 字段逐字）；**116 → `9d32f30`**（`app-bootstrap.js`：工厂 `createAppBootstrap(app)` 注入 express 实例；7 个启动符号 + 状态 `resultCacheCleanupStarted`）。<br>✅ **已核（本轮抽查）**：`express()` 全服务端**仅 `index.js:115` 一处**（无第二实例）；`attachFrontend` **仅在 `index.js`**（定义 `2588` + 调用 `2623`），新模块内无该字样；`resultCacheCleanupStarted` **唯一定义点在 `app-bootstrap.js:29`**；`state-singleton-check` **已扩到 4 条监视项**（含 `resultCacheCleanupStarted → app-bootstrap.js`），负向验证点名两处后已还原。<br>孤儿 import 由机械核查抓出：114 清 4 条（`canvasAssetDir`/`historyImageDir`/`referenceAssetDir`/`uploadTempDir`）、115 清 `normalizeBaseUrl`、116 清 5 条（`EMBEDDED_STATIC_ASSETS`/`packagedRootDir`/`LOCAL_HTTP_TIMEOUT_MS`/`PORT_FALLBACK_LIMIT`/`startResultCacheCleanup`）。<br>📌 顺带发现一处**注释过期**（低优先）：`server/core/result-cache.js:38` 仍写"`resultCacheCleanupStarted` 是 index.js 里的…"，实际已随 116 迁到 `app-bootstrap.js` | ✅ **已做：四项冒烟全过** | **049d4f5 / b736137 / 9d32f30**（+ 热修 **209ad60**） |
| 2026-10-01 | **V11-RF-117** | ✅ **已关闭（P0 热修）**：`server/core/app-bootstrap.js:25` 的 `./static-assets.generated.js` → **`../static-assets.generated.js`**（生成物在 `server/` 根目录，从 `core/` 出发少一层）。**真机证据**：修复前启动器 `STARTUP FAILED / Exit code: 1` + `ERR_MODULE_NOT_FOUND` + `run-all` 21/36（15 个失败全是「测试实例未起来」）；修复后 `node server/index.js` 正常打印 `Jingyin AI Canvas http://127.0.0.1:8787`、`run-all` **36/36（416.8s）**、启动器四项冒烟全过。同类扫描：`server/core/*.js` 全部相对导入核对，**无漏网**。**独立 bugfix commit，未与结构搬运混**。<br>📌 **流程更正**：执行者环境**实测能跑 `run-all` 全套**（416.8s）—— 此前"沙盒 EBUSY 跑不了"的判断**作废**；后续执行单应要求**执行者自跑 AB-1/AB-2**，人类只做"界面冒烟 + 真机启动" | 已做（启动器双击两次 / 连接测试 / 数据与存储） | **209ad60** |

> 🔴 **2026-10-01 23:00 真机回归（P0，来自 RF-116）**：双击启动器 → `STARTUP FAILED / Exit code: 1`；`run-all` 由 **36/36** 掉到 **21/36**，15 个失败**全部**是「V11 测试实例未起来」（凡需起服务实例的检查全红，纯静态检查全绿）。
> **根因（真实快照 `logs/launcher-failure-20261001-230004.log` / `-230055.log`）**：
> `ERR_MODULE_NOT_FOUND: Cannot find module '...\server\core\static-assets.generated.js' imported from '...\server\core\app-bootstrap.js'`
> —— `app-bootstrap.js:25` 写的是 `./static-assets.generated.js`，但该生成物在 **`server/` 根目录**（生成器 `scripts/generate-static-assets.mjs:7` 也写在那里）⇒ 从 `server/core/` 出发应是 **`../static-assets.generated.js`**。
> **热修 = 把 `./` 改成 `../`（一行），见 V11-RF-117。**
> ⚠️ **所有静态门禁都抓不到这类错**：`node --check` 只查语法、ESLint 未开 import 解析规则、源码级 grep 门禁只看符号 → 只有"真的启动一次"才暴露（⇒ 新门禁 **V11-RF-018**）。
> 📌 **责任在文档作者**：RF-116 执行单 §3-2 的依赖表把 `EMBEDDED_STATIC_ASSETS` 的来源**照抄成 `./static-assets.generated.js`**（那是 `server/index.js` 视角的正确写法），**没有按新位置重算相对层级**。这与 RF-011 的 `app-paths.js`"少一层目录"是**同一个病、相反方向**。
| 2026-10-01 | **V11-RF-110** | ✅ **已关闭（真机 35/35）**。已抽 `server/core/image-channel-candidates.js`（`channelBaseCandidates` / `imageChannelBaseCandidates` / `JSON_IMAGE_URLS_CHANNEL` / `prepareJsonImageUrlsForChannel` / `imageParamsForBaseUrl` / `imageRequestVariantsForBaseUrl` / `imageRequestLogTargets`）；`server/index.js` **3264 → 3212 行**，**12 处调用点逐字未改**（行号一致偏移 −52）；`JSON_IMAGE_URLS_CHANNEL` 值仍为 `silent-tt25-line-07`。<br>✅ **强制还债条款已兑现**：删除 `image-diagnostics.js` 里 106 遗留的**两份逐字节副本**，改为 `import` 自新模块；**并连带清掉该文件里随之变孤儿的 `buildImageChannelBaseCandidates` / `upstreamModelForChannel` 两项 import**（这是"清孤儿的连锁反应"，正是我在执行单里标红的陷阱）。<br>✅ **收口证据（已核）**：全服务端 `function imageParamsForBaseUrl` / `function imageChannelBaseCandidates` **各只剩 1 处定义**（都在 `image-channel-candidates.js`）；`index.js` 里 `buildChannelBaseCandidates` / `buildImageChannelBaseCandidates` 两个孤儿**已消失**；"不许删"的 4 项（`buildImageRequestVariants` / `upstreamModelForChannel` / `ensureFileBuffer` / `mimeTypeFromFile`）**均仍在**。<br>📌 该文件头部注释已更新说明"副本已在 110 抽走、循环依赖消失"，把欠账的来龙去脉留在了代码里 | 组 A 未单独做（`tt25` 走 JSON 路径；`tt25-subdirect-wire-check` 已过） | 🔴 **未提交（压在工作树里）** —— 见 §5.2 |
| 2026-10-01 | **V11-RF-016** | ✅ **已关闭（真机 36/36）**（测试基建）：新增 `scripts/verify/server-duplication-check.mjs`（138 行，**复用 `listServerSourceFiles()`**；只认**行首**顶层 `function`/`async function`；跨文件同名即红并**点名两处 `文件:行号`**；棘轮 + `--update`）+ 基线 `server-duplication-baseline.json`（**`duplicates: {}` = 考古确认基线干净**，扫描 27 文件 / 70 函数 / 0 重复）+ `run-all --list` **35 → 36**（插在纯源码批次、`state-singleton-check` 之后）。**负向验证**：临时把 `parseByteRange` 复制进 `__tmp_dup.js` → 变红并点名两处（`local-image-stream.js:7` 与 `__tmp_dup.js:3`）→ 删除后转绿。**本单是 106 事故的机器护栏**：此后任何"复制一份实现"都会被当场拦下 | 不需要（纯源码） | **8730a09**（独立 commit，3 文件 146 行） |
| （删） | ~~V11-RF-011 重复行~~ | 2026-10-01 由文档作者删除：执行者在并发写入时另加过一条 011 记录（状态停在"提交暂挂/（待提交）"），权威行在上方（含提交号 **919d615** 与已关闭状态）。**这行留痕本身就是为了记住"两个写入者会互相覆盖"的教训** | — | — |
| … | … | | | |

### 5.1 行为证据欠账回收清单（批次 3 前三单 · 逐条勾掉后才可把 ⏳ 改 ✅）

> **口径**：`§5` 的「关闭」绑定 **① 欠账清零 + ② 分支合入**，不是"提交了"。三单现处 `⏳ 待行为验证`。
> **AB-2 的准确说法**：**棘轮脚本本身未跑通**（本环境 `spawnSync` EBUSY）；已完成的替代证据是「eslint 全量直跑 + 与棘轮逻辑逐行等价的比较脚本」——替代证据**可信但不能写成"AB-2 通过"**。

**A. 在本环境即可完成（纯源码 / 进程内，不需要 spawn）—— ✅ 2026-10-01 全部完成并已由文档作者核验留档**
- [x] **A1 · 101 门禁负向验证（执行单 1-8）**：✅ 两次都变红并点名 —— `neg-1-index.json`（`ok:false`、定义点 2 处、点名 `server\index.js`）、`neg-2-routes.json`（点名 `server\routes\__tmp_neg\foo.js`），临时目录已清理（`server/routes` 已不存在）。留档：`.codex-artifacts/batch3-2026-10-01/`
- [x] **A2 · L2-101 进程内逻辑测试**：✅ 14 项全过（`l2-101.json`，`failed:[]`）—— 含**快照只读**（改返回值不影响内部）、取满后第 6 个排队且未放行、释放后按 **FIFO** 放行、`weight` 夹取、重复释放 no-op、清空后回 0。
- [x] **A3 · L2-102 进程内逻辑测试**：✅ 10 项全过（`l2-102.json`）。⚠️ **覆盖边界（必须记住）**：该测试设 `JINGYIN_DISABLE_GENERATION_LOGS=1`（开关真实存在于 `generation-logger.js:26`），因此验证的是 Map 生命周期 / 未追踪端点不写日志 / `localUploadParseMs` 口径，**未验证三个 stage 日志真的被写出** → 那层**只能靠 B3**。
- [x] **A4 · L2-103 进程内逻辑测试**：✅ 16 项全过（`l2-103.json`）—— 两个纯函数 + monkey-patch 全局 `fetch` 造 401/429/超时（含 429→504 的公开口径）+ 禁用态不调 fetch。
- [x] **A5 · AB-2 替代证据留档**：✅ `eslint-batch.json` + `eslint-batch.err` 已落盘（棘轮脚本本身仍未跑通，B2 不变）。
- [ ] **A6 ·（建议，非必须）把 L2-101 转正为门禁** → 已开 **V11-RF-012**（现在它们只在 `.codex-artifacts/` 里，**是取证不是门禁，下次没人会跑**）。

**B. 必须在能 spawn 的真机终端完成**
- [x] **B1 · AB-1**：✅ **2026-10-01 真机最终观测：全套 `[run-all] 35 个脚本：通过 35，失败 0`**（先用 `run-all-check` 单跑确认 `ok:true / total:27 / failed:0`）。
  过程留痕：真机首跑曾是 **34/35**，唯一失败为元测试 `run-all-check`，且先后暴露**两个互不相关的测试基建缺陷** → `V11-RF-014`（`run-all.mjs` 用 `process.exit()` 硬退出导致管道输出被截断）+ `V11-RF-015`（`run-all-check` 两条按老写法检查 `package.json` 的过时断言）。两者与本批业务改动**均无关**，修复后即 35/35。
  ✅ 其余全绿，其中关键几条：`local-edit-base-file-check` **36/36**（此前一直被 §1.3 缺陷挡红 ⇒ **011 的 1-11 验收达成**；且端到端 2 条与浏览器探针 7 条这次全部跑到）、`app-paths-check` ✓、`state-singleton-check` ✓、`check-launcher` 44/44 ✓、`pro/http-mock/routing/white-refine/outfit-defer` 等全过。
- [x] **B2 · AB-2**：✅ **2026-10-01 真机通过**（跑的是**真棘轮脚本**，不是替代证据）：`regressions` **为空数组**；`current` = **20** warning（基线记 26）。
  `improved` 三条：`prompts/server/outfit-skill.js|no-unused-vars` 2→0、**`server/index.js|no-unused-vars` 2→1**、`src/outfit-workflow.jsx|no-unused-vars` 3→0。
  🔴 **注意**：`deferOutfitAutoSave` **不可能**出现在 `regressions`（它在基线里）。若它出现在 `regressions`，说明该文件计数**反而增加**了 → 当场回退，不要放行。
- [~] **B3 · AB-4 沙盒等价差分**（对照父提交 `b990647`）：**🔶 形式未做，实质已由真机证据覆盖大半** —— 用户 2026-10-01 的真实出图在仓库根留下了任务日志 `logs/tasks/2026-10-01/task_1_1790837961424_tfhyxo.txt`（177 行，`/api/generate-outfit` 全流程），其中：
  - ✅ **102 的中间件三段都在**：「前端点击生成，准备提交」（前端 stage）→「**本地服务收到生成请求**」→ … →「**本地服务响应结束**」（状态码 200、本地请求体大小、本阶段耗时都在）⇒ 102 的日志流水在真实请求下正常。
  - ✅ **101 的并发放行与计费无关字段都在**：「**本地并发队列已放行**」+「本地并发排队：0 毫秒」（即 `image-slot-acquired` 的 `queueWaitMs` 字段）。
  - ✅ **011 的落点**：日志落在**仓库根** `logs/tasks/…`（不是 `server/logs/`）。
  - ⛔ **仍未做**：与父提交 `b990647` 的**逐字节对照**；**103 的计费签发/落账路径在真实请求里没有出现**（见下）。
  - 🔎 **重要观察（降低 103 风险，但要说清）**：该日志里**没有** `billing-gateway-prepare` / `billing-gateway-finalize` 阶段 ⇒ 当前配置下计费网关**未启用**（`prepareImageBillingTask` 走 `{enabled:false}` 早返回）。也就是说 103 搬走的代码在真实请求里**只跑了"透传 + 未启用早返回"两条路径**，`enabled:true` 的签发/落账路径**没有真机证据**（L2 里只用了 mocked `fetch`）。⇒ 103 的"五响应真机差分"要么在**启用计费网关**的环境做，要么明确记为"该路径当前不在生产配置中执行"。
  - 📌 另记一条**性能观察（不是缺陷，不开单）**：「批量结果图下载/本地缓存」本阶段耗时 **23.657 秒**，而日志标注「本阶段超时上限：8.000 秒」—— 说明该"上限"不是硬中断。若用户后续再报"结果出来慢/像卡住"，这里是第一个嫌疑点（对应尚未搬运的 109 `outfit-archive`）。
- [~] **B4 · 真机冒烟**：🔶 **2026-10-01 真机部分通过**（用户实机：双击 `.bat` → **页面可打开**、**出图正常**）。这同时顶掉了 **V11-RF-011 的 1-12 冒烟**（页面可用）与 **101 组 A 的主体**。
  ⛔ 仍缺、需单独核：**102 的组 E**（提示词优化，联网+断网各一次）与**日志流水**；**103 的中转站后台计费条数 = 出图张数**；**局部回贴（涂抹蒙版）贴回尺寸 = 原图尺寸**（这条最容易看出 101/103 有没有搬坏）。
  📌 用户另报"批量生成时切换页面导致结果卡住"的问题**当前不再复现** —— **归因待确认**，在确认前**不得**写成"本批修复了该问题"（见 §1.3 现场发现末尾）。

**C. 收口动作（全部勾完后）**
- [ ] 🔴 **先做 V11-RF-011，再跑 B1/B2**（决策 2026-10-01）：否则 `local-edit-base-file-check` 的端到端断言会因 `rootDir` 缺陷变红，污染 B1 的判读（详见 §1.3）。
- [ ] 把 §5 三行由 ⏳ 改为 ✅，并把本清单的 A/B 全部标为已勾。
- [ ] 确认三单所在分支 `batch3-rf101-103` **已合入主线**；未合入前，任何下游工作区都要先确认包含该分支（否则会照旧快照 3888 行切错位置）。
- [ ] 之后才允许开 **V11-RF-104**（行号已随本批漂移，一律按符号名锚定）。

### 5.2 🔴 未提交改动的落地方案（2026-10-01 状态）

**现状（2026-10-01 收尾）**：`107/108/109/110/017/111` **已落库**（批次提交号待核，见下），`112 → 71cf34c`、`113 → 371736b` 各自独立提交 ⇒ **八单全部落库，工作树仅剩本文档 `REFACTOR_TICKETS.md` 的改动**（属文档作者，需单独一个 `docs:` commit）。

**113 的硬交付物（已核）**：`scripts/verify/state-singleton-check.mjs` 的监视名单已扩到 3 条 ——
`activeImageRequestCount` / `imageRequestQueue`（`image-concurrency.js`）+ **`videoRouteSessions`（`video-route-session.js`）**；
正/负向均已验（负向临时在 `index.js` 加第二处声明 → 变红并点名 **两处**：`index.js` + `video-route-session.js`，已逐字节还原）。**脚本数未变（仍 36）**：门禁只是扩监视名单，不是新脚本。

**⚠️ 待补的提交号**：`107/108/109/110/017/111` 六单的落库批次提交号（需 `git log --oneline -8` 核对后回填）。

**✅ 2026-10-01 真机核对完毕，账目清楚、无"来源不明"的改动**（`git diff --stat` 实测）：
| 文件 | 改动量 | 归属 |
| --- | --- | --- |
| `AGENTS.md` | 4 行 | 文档修正（过期源码路径）—— **不要混进代码 commit**，单独一个 `docs:` 提交 |
| `server/core/image-diagnostics.js` | 25 行 | **110 的强制还债**（删两份副本 + 连带孤儿 + 注释） |
| `server/index.js` | **438 行**（删 ≈408 / 加 ≈30） | **正好等于六单搬走的总量**，即上表六个区间之和 |

⇒ 执行者先前说的"9 个 pre-existing hunk"**不是别的改动**，只是 git 把六单的"删块 / 加 import"自动切成的 9 个 hunk。**可以放心按下面方案 A 拆。**

**已落库的提交（真机核对）**：`9f699a1`（104–106 搬运）→ `57f01a9`（104–106 孤儿修正）→ `8730a09`（016 门禁）。当前分支 **`batch3-rf101-103`**（尚未合入主线）。

**⚠️ 两个待办（本轮发现）**：
1. **文档层完全没有纳入版本控制** —— `REFACTOR_TICKETS.md` 与 7 份执行单、2 份交接/报告全是 `??` 未跟踪。**这是整个重构的契约层，丢了就全丢**。建议单独一个 commit 纳管；若坚持不入库，请定期备份到仓库外。
2. `?? .workbuddy/`（执行者的记忆目录）建议加进 `.gitignore`（属工具临时产物，不该入库）。

**🔴 本轮决定（2026-10-01）：本批采用「方案 B」落库。**
**原因（环境决定，不是偷懒）**：方案 A 需要**交互式** `git add -p` 逐个选 hunk，而执行环境的 shell **大概率没有 TTY**（`git add -p` 跑不起来）；让人类对着满屏 diff 按 `y`/`n` 更不可取。
方案 B 只需整文件 `git add`（非交互），且**归属信息不丢** —— 把「工单 ↔ 模块 ↔ 原 index.js 区块」的**映射表写进 commit message**（见下方命令的第 3 个 `-m`），将来回退某张单照样能从 `git log` 查出来。
**方案 A 保留**：等以后在**有 TTY 的终端**里、且改动分组明显时再用。

**方案 A（备选，需要交互式 `git add -p`）：按「物理可分组」做 3 个代码 commit + 1 个文档 commit**

> **为什么不是 6 个**：六单删块在 `index.js` 里的间隔 ——
> `110`(255–310) → `107`(312–337，**隔 1 行**) → `108`(339–404，**隔 1 行**) → `109`(407–476，**隔 2 行**) → `017`(614–647，隔 **138** 行 ✓) → `111`(718–861，隔 **71** 行 ✓)。
> 前四块只隔 1–2 行，**git 视为同一段改动**；硬拆必须手工编辑 patch（`git add -p` 的 `e`）—— 对"逐字节搬运"这种活，手编 patch 的**风险 > 收益**。能自然分开的就是 **3 组**。

| # | commit 内容 | 必须同时包含 |
| --- | --- | --- |
| 1 | **107 + 108 + 109 + 110**（四个区块物理相邻，必须同组） | `outfit-upload-groups.js` + `local-image-stream.js` + `outfit-archive.js` + `image-channel-candidates.js` + **`image-diagnostics.js`（删两份副本）** + `index.js` 的「255–476 删块 + 这四单的 import 行」 |
| 2 | **017** | `core/route-helpers.js` + `index.js` 的「614–647 删块 + import」 |
| 3 | **111** | `core/image-route-candidates.js` + `index.js` 的「718–861 删块 + import + 清掉的孤儿」 |
| 4 | **文档**（不混进代码 commit） | `AGENTS.md` + `REFACTOR_TICKETS.md` + 全部 `V4.0-执行单-*.md` |

**建议的提交命令**（`git add -p` 只需 `y`/`n`，**不要**用 `e` 手工编辑）：

```
git add server/core/outfit-upload-groups.js server/core/local-image-stream.js server/core/outfit-archive.js server/core/image-channel-candidates.js server/core/image-diagnostics.js
git add -p server/index.js      # 选「255–476 删块」+ 这四单的 import 行 → y，其余 → n
git commit -m "refactor(server): 批次3 · RF-107/108/109/110 结构搬运（4 个 core 模块 + 删两份副本，调用点零改动）"

git add server/core/route-helpers.js
git add -p server/index.js      # 选「614–647 删块 + route-helpers import」
git commit -m "refactor(server): RF-017 抽取图片/视频共用路由辅助到 core/route-helpers.js（videoRouteText 保持原名）"

git add server/core/image-route-candidates.js
git add -p server/index.js      # 选「718–861 删块 + import + 清掉的孤儿」
git commit -m "refactor(server): RF-111 抽取图片线路候选到 core/image-route-candidates.js（import 017 模块，禁复制）"

git add AGENTS.md REFACTOR_TICKETS.md V4.0-执行单-*.md
git commit -m "docs: 修正源码路径 + 纳入重构契约层（工单总表与执行单）"
```

- 🔴 **原子性铁律（不可妥协）**：每个 commit 里，**「删掉的定义块」与「对应的 import 行」必须一起进**。
  只进一半 ⇒ 中间状态的 `index.js` 要么缺定义（调用点直接 `ReferenceError`），要么多一个没人用的 import（lint 红）。
- **import 行无需手工编辑**：执行者上一批已按 §0.9 第 8 条把 import **分开放**（`83` / `116` / `143` 附近 / `147-151` / `154-159`），它们本身就是分开的 hunk。
  ⚠️ 仅 `017` 与 `111` 的两组 import 只隔 2 行：若 git 合成一个 hunk，**整段归给对应 commit** 即可，不要去 `e`。

**方案 B（✅ 本批采用）：1 个 commit 打包**（message 里列全工单号）+ **1 个文档 commit**。
- **本批实际覆盖 8 单**：`107/108/109/110/017/111` **+ `112/113`**（后两单也已在工作树里完成 —— `index.js` 已 **3888 → 2831 行**；`112/113` 是**唯一没上过真机**的部分，因此真机若红，凶手只有它们，无需 bisect）。
- **非交互**：只 `git add <整文件>`，不需要 TTY、不需要选 hunk —— 这是本批真正的决策依据。
- **归属不丢**：commit message 第 3 个 `-m` 写入**工单↔模块映射表**（8 条），回退定位靠它。
- 理由：八单均为**同一类纯搬运**；`107`–`111` 已整体验证 **36/36 + 真机冒烟**；每个模块都是独立文件 ⇒ 回退＝删文件 + 删对应 import 行。

**❌ 明确否决**：① **脏树上直接开工下一批**（两批叠在同一 diff，出问题分不清归属）；② **先 stash 上批改动**（把已验证的 36/36 藏起来，`pop` 冲突即白干，且下一批改区与 stash 重叠、冲突概率高）；③ **让人类手工落库/选 hunk**（人最不该做的事）。

**无论哪个方案**：落库后跑一次 `run-all`（**36/36**）确认提交后的工作树仍是绿的；提交号报回，由**文档作者**回填本表。
