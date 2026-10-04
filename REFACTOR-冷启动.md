# REFACTOR-冷启动.md · 新会话唯一入口

> **用途**：任何新 AI 会话开工前，先读**这一个文件** + `.workbuddy/memory/MEMORY.md`（172 行）即可恢复全部上下文。
> **本文档只管「重构」**。要**新增功能**时读 **`REFACTOR-新功能开发规范.md`**（防大文件复发的长效约束）。
> **不要靠聊天记录流转** —— 聊天会截断，磁盘不会。
> 本文档**每次收口时必须刷新**（行数、候选域、进度都会变）。最后实测：2026-10-03。

---

## 0. 三条不可动摇的顶层规则（违反即停工）

1. **只重构结构，绝不改业务行为**。任何"顺手优化"都是违规。
2. **唯一契约 = `REFACTOR_TICKETS.md`**（1603 行）。跨会话只带契约 + 本文档，不带聊天记录。
   - 硬约束全文在 `REFACTOR-枢纽-存档-2026-10-02.md` §0.9（19 条），**开工前必须整读一次**。
3. **一切结论必须实测**。行号、行数、耦合度、"门禁全绿"——全部跑命令取数，**不许用记忆里的旧值**。
   （已实证：记错 ESLint 基线 18 vs 实测 17、记错净省 −144 vs 实测 −117。）

---

## 1. 现状快照（2026-10-04 **17:5x** 实测，快照 `e5b0f68`）

| 项 | 值 |
|---|---|
| `src/main.jsx` | **6630** 行（RF-073 −16 → RF-076 **−224** → RF-077 **−337** → RF-074 **−211**） |
| `src/outfit-workflow.jsx` | **7185** 行（RF-076 **−215** → RF-077 **−281** → RF-078-b **−39** → 清垃圾 +2 → RF-079 **−988** → **RF-080 −2083**） |
| 两巨石合计 | **13815** 行 / 占比 **54.4%**（起点 18867 / 74.6%）🎉 **首次跌破 55%** |
| `src/shared/` | 4345 行 |
| `src/features/` | **5546** 行（js+jsx，含 RF-079 新建 `outfit/outfit-task.js` **1069**、RF-080 新建 `outfit/outfit-panels.jsx` **2166**）+ 546 行 css |
| js/jsx 文件数 | **60** / 总 **25417** 行 |
| 019 基线 `fileCount` | **60**（RF-077 57→58；RF-079 58→59；**RF-080 59→60 已于 2026-10-04 由统筹划账**；RF-078-b / RF-074 零新建故不划账） |
| ESLint 全仓 | errors=0 / **warnings=16**（src 15 + `server/routes/outfit.routes.js` 1） |

> ⚠️ 两个口径别混用：全仓 **16**，src 单独 **15**。
> 16 的构成：`main.jsx` 5 + `outfit-workflow.jsx` 7 + `LocalEditModal.jsx` 2 +
> `shared/ui/cached-image.jsx` 1 + server 1，全部是 `react-hooks/exhaustive-deps`（server 那条是 `no-unused-vars`）。
> 基线 18→16 是**净改善**（RF-077 搬走 4 条 effect 告警，同时给新组件带来 2 条转移登记），详见 §1.6。

已抽出的 `src/features/` 模块（15 个）：
`auth/api-key`(67) `canvas/canvas-actions`(313) `canvas/canvas-graph`(102) `detail/detail-group`(272)
`local-edit/*`(721,含 3 个 jsx，**RF-077 新增 `LocalEditModal.jsx` 379**) `result-queue/quick-result-replace`(**396**，RF-074 追加两工厂)
`savedir/save-directory`(91) `upload/reference-upload`(**203**，RF-073 −16) `video/video-composer`(146)
`outfit/outfit-task.js`(**1069**，RF-079 新建 —— 普通模块导出，非 B3 工厂)
**`outfit/outfit-panels.jsx`(2166，RF-080 新建 —— 5 个面板组件 + 52 个依赖闭包)**

**刷新命令**（一条，**不要用旧版那条**）：
```bash
node scripts/dev/snapshot-refresh.mjs
```
> 🔴 旧版文档里给的是 `execSync` 版本 —— 本环境 `execSync`/`spawnSync` 必 EBUSY，
> 那条命令根本跑不出数。新版全用 `fs` 直读，零子进程，输出直接就是上表每一行。
> 顺便会打出 features 明细和 TOP5 大文件，抄文档不必手算。

---

## 1.5 run-all 4 项失败的归因（2026-10-03 已查清，**非代码回归**，别重复查）

| 脚本 | 结论 | 处置 |
|---|---|---|
| `lint-ratchet-check` | **已修（`6726618`）**。51 组"新增"中 48 组来自根目录**未跟踪的垃圾副本 `verify/`**（54 文件，与 `scripts/verify` 逐字相同、无代码引用它，但被 `eslint .` 扫到且不在 Node 全局变量组 ⇒ 48 组 no-undef 假阳性）；另 3 组是本轮自建测量脚本的真债。已把副本移到 `tmp/_verify-legacy-20261003/`（可恢复）+ 修 3 处 ⇒ **超基线组数 51 → 0**，未动基线、未用 `--update` | 已绿 |
| `local-edit-base-file-check` / `resize-long-edge-check` / `modal-shell-check` | 三者**同一个根因**：喂给 `tabbit-cli` 的 program 里 `page.goto` **没有设 `setDefaultNavigationTimeout`**，用 playwright 默认 30s；而 vite 冷启动首次编译 >30s ⇒ goto 超时抛错 ⇒ program 无返回值 ⇒ CLI 回执 `result.value` 为 null ⇒ 脚本降级为"浏览器回执无法解析（长度 ~1KB）"。**非探针 CLI 故障**（手动跑 `console.log("probe-ok")` 67ms 即 `status:"succeeded"`） | ✅ **已修 `9b223ca`（RF-072）**：三脚本 program 各加 `page.setDefaultNavigationTimeout(150000)`；实测项数 **29/5/13 → 36/9/37**，`browser: skipped → ran`。🔴 **自此"探针未执行"这个降级态在本仓应视为异常信号** |

🔑 教训：`eslint .` 的扫描范围是**全仓**，任何游离目录都会污染棘轮；新增 `eslint` 看不到
的目录前，先确认它在 `eslint.config.mjs` 的哪个 `files` 组里。

---

## 1.6 一轮「能否转功能开发」的稳定性复核（2026-10-03，**快照 `7a1328a`**）

结论：**可以转**。但复核过程本身就是答案的一半 —— 门禁全绿不代表没问题，
底下三件事只有亲手量才发现。派单前后都要按这一节走一遍。

### 六道门禁实测结果（全部为本次亲手跑，非引用汇报）

| 门禁 | 结果 |
|---|---|
| `source-hygiene-check`（**本轮新立**） | ok，224 文件 0 脏字节 |
| `frontend-duplication-check`（019） | ok / `duplicateCount`=0 / `fileCount`=**58** / 无范围漂移 |
| `import-path-check` | ok，220 specifiers / 0 violations |
| `check-syntax` | **205/205** |
| ESLint 全仓 | 0 errors / **16** warnings（基线 16，**无超基线组**） |
| `vite build` | ✓ 1636 modules，产物 732.80 kB（gzip 228 kB） |
| 全套 `run-all` ORDER | **38 项：净结果全绿**（判定方法见下 ⚠️） |

### 1.6.1 V20/V21 收工复核（2026-10-03，快照 `33a4527`）

两个并行单（V20=RF-074 施工 / V21=RF-079 只读设计）由执行者交付后，**统筹重跑六道门禁实测复核，全部仍为绿**：

| 门禁 | 结果 |
|---|---|
| `source-hygiene-check` | ok，**dirtyFiles=0**（确认 RF-078-b 的二进制污染未复发） |
| `frontend-duplication-check`（019） | ok / `duplicateCount`=0 / `fileCount`=**58** / `scannedFiles`=58（零新建，无范围漂移） |
| `import-path-check` | ok / 220 specifiers / 0 violations |
| `check-syntax` | **216/216** |
| ESLint 全仓 | 0 errors / **16** warnings（精确等于基线，零回归） |
| `vite build` | ✓ 1636 modules，5.91s（**唯一能验 import 名**的门禁，ESLint 抓不到） |
| RF-074 两份对照组 | phaseA **59 项 ALL PASS** / phaseB **61 项 ALL PASS**（含 `flashDownloadFeedback-1300ms` 断言 ⇒ 未与 outfit 1100ms 统一；负向对照 `no-undef 命中 2 条` ⇒ harness 灵敏） |

**实测结论**：V20 把 main.jsx 从 6841 降到 **6630（A=−211 行）**，零新建 src 文件、18 个函数整体搬出、薄壳位置正确无 TDZ；V21 为纯只读设计（仅 +667 行文档，outfit 源码 10256 行零改动），结论**做**、A≈976。两单均通过，阶段切换结论（转功能开发）**再次确认有效**。

### ⚠️ 跑全套验证的正确姿势（本轮实测得出，不照做会得到假结论）

用脚本**串行批处理**整套 ORDER 时，第二次跑出了 **10 项 FAIL**（连同首次异常计 **11 项**），
而且失败名单与第一次完全不重叠（第一次红的是 `modal-shell-check` + `lint-ratchet-check`，
第二次红的是 `batch-prompt-passthrough` / `connection-test` / `http-mock` / `pro-wire` /
`white-refine-split` / `retouch-intent-request` / `run-all-check` 等）。
把这 11 项**单独拎出来逐个重跑，全部 exit=0 / ok=true** ⇒ **零真回归，纯并发干扰**。

根因：这批脚本会各自 `spawn` 一个 `server/index.js` 或占 `127.0.0.1` 端口
（`http-mock-check` 起 8899、`pro-wire-check` 起网关 mock、`*intent-request-check` 起主服务），
批处理时前一项的子进程还没完全退出、端口没释放，后一项就起不来。

⇒ 规则三条：
1. **一次只跑一项**，别用一串 `for` 连着跑 —— 至少这批含 `spawn` 的脚本必须如此。
2. 跑的过程中**不要同时开 `vite build` / `npm run dev`**（本轮就是这么撞出来的）。
3. 批处理报 FAIL 时，**先单独重跑确认**，不要直接当成回归去修代码 —— 否则会去改一段好代码。

### 复核查出的三个问题（均已修并有 commit）

1. 🔴 **`outfit-workflow.jsx` 被二进制污染 ⇒ grep 对该巨石静默失效**（`9e5be71`）
   RF-078-b 给第 5727 行的注释写进 NUL + 9 个控制字符 + 非法 UTF-8。
   后果不是"注释难看"，而是 **grep/rg 把整个 1 万行文件判为 binary** —
   而派单前「四处 grep 判是否被裁决过」、worktree 对拍、「搬 A 查唯一调用方」全依赖 grep。
   等于让审计体系对着 outfit 侧集体失明，**且不报错**。
   ⚠️ build / ESLint 全绿，**只有字节级扫描能发现** ⇒ 已立 `source-hygiene-check` 常驻门禁。
2. **`modal-shell-check` 3 红** —— RF-075 的漏网（`7a1328a`）
   RF-077 换组件后断言失配，按同一口径**重定位**（类名断言改指新组件 + 补"引用到位"断言 +
   数量 4→3）。🔑 **组件改名/合并后，必须 grep 全部 verify 脚本找旧名** —— RF-075 只扫了
   `local-edit-base-file-check`，漏了 `modal-shell-check`。
3. **`rf077-control.mjs` 的死变量 `STUB`** —— 对照组脚本自身没过 lint，属真缺陷，直接删（不划账）。

### 🔴 修 bin 污染时的两个必踩坑（写死在这里）

- **不能用 `latin1` 读整体再原样写回** ⇒ 插入的中文被拆成单字节落盘，反向污染出新垃圾。
- **不能用 `utf8` 读整体再写回** ⇒ 其余行的非法字节被替换成 U+FFFD，一夜间改坏另外 1 万行。
- ✅ 正解：**只在字节层面切那一行** + 插入段用 `Buffer.from(text, "utf8")` 显式编码，其余字节原样。
  参考实现 `scripts/dev/fix-rf078b-garbage.mjs`。

### 登记（本轮**未**处理，知悉即可）

- `outfit-workflow.jsx` 有 **98 行 LF** 混在 10156 行 CRLF 中。经溯源 BASE `98d6178` 同样是
  98 行 LF ⇒ **历史遗留、非本轮引入**，按最小改动原则未动。将来若统一行尾，务必单独开单。
- 分支现状：所有重构提交都在 **`batch3-rf101-103`** 上，领先 `main` **157 个提交**、`main` 无分叉
  ⇒ 随时可快进合并。是否合并属产品决策，**不要擅自作为技术收尾动作执行**。

---

## 2. 两条线（**永不在同一单混做**）

- **线 A · 块级克隆清零** —— 已完成，地毯扫描（shared 131 函数 × 三文件本地函数）**0 处漏搬**。
- **线 B · 巨石按功能域切分** —— 主线，见 §3。**定型形态 = 普通工厂**，不是 hook：
  `export function createXxx(deps)`，不 import React、无 `useState/useCallback/useMemo`；
  函数体**从原文逐字抽取一字不改**，只在顶部加 deps 解构；
  **解构保持同名 ⇒ 调用点零改动**；同域第二批**追加进既有文件**（不新建，免划账）。

已交付（线 B）：RF-061 保存目录 / RF-062 画布纯计算 / RF-066+067 画布动作与交互 /
**RF-068** 结果卡拖拽替换 / **RF-069** 视频编排 / **RF-070** 参考图上传 / **RF-071** 详情页分组拼图。

---

## 3. 下一步候选（按优先级，动手前必须重测耦合度）

| 序 | 候选 | 实测规模 | 说明 |
|---|---|---|---|
| ~~0~~ | ~~**RF-072 · 修 3 个浏览器探针脚本**~~ | 各 +2 行 | ✅ **已完成 `9b223ca`**（2026-10-03） |
| ~~1~~ | ~~**RF-073 · 参数化收口** `addReferenceRewriteFiles` ↔ `addDetailFiles`~~ | 实测 **−7 行** | ✅ **已完成 `7d7f264`**（2026-10-03，对照表见 §3.1）。advisory **171/2731 → 170/2712**；人工冒烟（上传/删除）已通过 |
| ~~1~~ | ~~**RF-076 · 局部编辑交互层**~~ | 实测净省 **−176 行** | ✅ **已完成**：`73753f8`(A −100) → `ee30034`(B −51) → `d1996a3`(C −25)。
**实测**（统筹复测）：main 7402→**7178**、outfit 10789→**10574**、shared/local-edit-mask.js 194→**457**；
六道门禁全绿；三份对照组 ALL PASS；人工冒烟三条链路已通过。advisory **main↔outfit 这对 1236 → 1035 行（−201）**
（整体 170/2712 → 182/2701 块数上升只是工厂文件让跨文件近克隆显形，**不是新增债**）。详见 §3.4 验收 |
| ~~1~~ | ~~**RF-077 · 合并两个局部编辑弹窗组件**~~ | 实测净省 **−239 行** | ✅ **已完成**：`3f85621`(main 侧接入) → `6a54062`(outfit 侧接入) → `af49552`(收尾)。
**实测**（统筹复测）：main 7178→**6841**、outfit 10574→**10293**、新增 `LocalEditModal.jsx` **379**；
六道门禁全绿；对照组 22/22；**019 基线已由统筹划账 57→58**。详见 §3.6 验收 |
| ~~1~~ | ~~**RF-078 · 提示词预设面板 + 编辑弹窗**~~ | **关单：不抽组件** | ✅ **只读设计单已交付 `802f50b`（167 行，零 src 改动）**，结论 **维持既有裁决「不抽组件」**。
🔴 **裁决源头不在契约文档，而在 `src/shared/prompt-library.js` 文件头**（V11-RF-057，2026-10-02）：
① **不能抽组件** —— 两侧提示词编辑弹窗 JSX 是**真分叉**（main 有删除按钮、outfit 无；main chip 点击立即 `applyPromptPreset`、
outfit 用 `schedulePromptPresetApply` 防抖；main 富 tab 带拖拽排序 vs outfit 简 tab）⇒ 参数化一堆 props 就等于改视觉；
② **单侧独有的块不许塞进来**（main 独有分类页签拖拽排序、outfit 独有 `renamePromptPresetTitle`/`schedulePromptPresetApply`）。
执行者复核另纠正三处统筹误判：「13+ state 要带走」是**高估**（9 个 handler 已由 `usePromptLibrary` 共享，两侧均 import 并调用）；
advisory 的「32 行逐字 + 58 行差 1 行」是**过期快照**（当前是真分叉，唯一差 1 行只是 `aria-label` 假分叉）；
标识符计数不等的根因是 **outfit 面板渲染了两次**（9311 停靠 + 9992 模态）。
若强行抽：必新建 `src/features/prompt/*.jsx` ⇒ `fileCount` 58→59 需划账、props ≥14、**净省仅 ≈+96 行**（远小于 RF-076 −176 / RF-077 −239）⇒ **收益/风险比低，不做**。见 §3.7 |
| **1** | 🔴 **RF-078-b · outfit 内部提示词面板 A/B 去重**（`src/` 路） `outfit-workflow.jsx:9311-9387` ↔ `9992-10068` | **2 × 76 行，diff **0 hunk**（去掉容器行后逐字相同）** | **本轮派单**。🔑 **与 RF-078 性质完全不同**：这是**同一组件内的两处渲染**（同属 `OutfitWorkflow`，5727 起），
共享同一套 state ⇒ **props 两侧传完全相同的值 ⇒ 零分叉、行为零变化**。落点用**同文件内模块顶层局部组件**（不新建文件 ⇒ 019 不划账）。
自由标识符约 19 个，其中 9 个可整包传 `lib={promptLib}`（`usePromptLibrary` 的返回值）压到 ~11 个 props。
**净省保守估 30–50 行**（实测 ≤20 行则报不做）。见 §3.9 |
| **2** | 🔴 **RF-075 · 断言失配修复**（`scripts/` 路，可与 src/ 路并行） | **5 条断言** | 🔴 **比登记时严重**：RF-077 删掉 `OutfitLocalEditModal`/`QuickLocalEditModal` 后，
`local-edit-base-file-check` 从「1 条僵尸」变成 **5 条失配**（4 条是组件搬到 `LocalEditModal.jsx` 后的**断言失配**，1 条是 `cropOutfitLocalEditFile` 真僵尸）。
**修法是「重定位」不是「删除」** —— 被验证的接线都还在，只是换了文件。见 §3.8 |
| **2** | 🔴 **RF-074 · main.result/download 域只读领域设计单** | **21 函数 / 371 行**（`main.jsx:3036-3459`） | **本轮派单（只读，不写 src）**。这是 **main 侧最大的未被搬函数群**。
🔑 选它并行的理由：对象是 **main.jsx**，而 RF-078-b 改的是 `outfit-workflow.jsx` ⇒ **零抢文件、行号不漂移**。见 §3.10 |
| 4 | **main.prompt 域** | 11 fn / 190 行，耦合 **1.36** | 中等 |
| 5 | **outfit.preview 域** | 9 fn / 259 行，耦合 **0.89**，只碰本域 7/9 | ✅ 判据合格、体量最大的**未动**域。⚠️ 其中 235 行是 outfit 独有的诊断面板**渲染函数**（返回 JSX）⇒ 落点须是 `.jsx`，开工前先确认这一点 |
| 6 | **outfit 其余（完全未动）** | misc 53 fn/942 行(1.23)、result 26 fn/940 行(1.15) | 需先出只读领域设计 |

**选域口径**：平均引用域数 ≤1.0 且只碰本域 ≥70% ⇒ 可抽；≥1.5 或纯函数 <30% ⇒ 编排层不抽。
**每抽完一个域必须重测**（画布抽完 1.07→1.75，教训）。
`node scripts/dev/domain-coupling.mjs` ｜ 明细 `node scripts/dev/domain-fn-list.mjs src/main.jsx 2248 8164 <域名>`

### 3.1 RF-073 的派单前对照表（统筹 2026-10-03 实测，快照 `9b223ca`）

> 执行者开工第一件事是**复核这张表**（自己读源码再量一遍），不是照抄。发现不符 ⇒ **停手报统筹**。

| 差异项 | `addReferenceRewriteFiles`（`features/upload/reference-upload.js:38-62`） | `addDetailFiles`（`src/main.jsx:3304-3328`） | 判定 |
|---|---|---|---|
| 入参 | `(role, fileList)` | `(role, fileList)` | 同 |
| 过滤 / 空返回 | `imageFilesFromList(fileList)`；`length === 0` 返回 | 逐字相同 | 等价 |
| **`used` 算法** | `referenceProductFiles.length + referenceStyleFiles.length`（**两列表合计**） | `role === "product" ? detailProductFiles.length : detailReferenceFiles.length`（**按 role 各自**） | 🔴 **真业务分叉** ⇒ `used` 提升为入参，调用点各传原值 |
| 上限常量 | `MAX_REFERENCE_REWRITE_FILES` | `MAX_DETAIL_FILES` | 入参 `maxFiles` |
| 超限文案 | 「产品图和参考图合计最多 N 张」 | 「产品图/参考图最多 N 张」 | 入参 `limitMessage`（整串由调用点生成） |
| 事件前缀 | `"参考生图"` | `"一键详情"` | 入参 `eventLabel` |
| 写入 setter | `setReferenceProductFiles` / `setReferenceStyleFiles` | `setDetailProductFiles` / `setDetailReferenceFiles` | 回调 `onAccept(accepted)` |
| 成功文案 | 「已添加 N 张产品图/参考图」 | 逐字相同 | 留在公共体（由 `role` 派生） |

`removeReferenceRewriteFile` ↔ `removeDetailFile`：去标识符归一化后**逐字节等价** ⇒ 可直接参数化（差异全进 `onRemove` 回调）。
> ✅ **已交付 `7d7f264`**：`used` 按裁决提升为入参，两侧薄壳各传原值（reference=合计 / detail=各自），
> 公共体 `addFilesByRole` / `removeFilesByRole` 落在 `src/shared/image-input.js`（**零新建文件**）。
> 实测净省 main −16 / reference-upload −16 / shared +25 ⇒ **整体 −7**。

⚠️ `remove` 函数体只有 4 行，**抽完的净省行数必须实测**；若 ≤0 行则**不抽，只登记**（搬一块的固定成本与块大小无关，§7.2）。

### 3.2 RF-076 的派单前对照表（统筹 2026-10-03 实测，快照 `7d7f264`）

> 提取方式：`src/main.jsx:1739-2089`（352 行）↔ `src/outfit-workflow.jsx:4831-5152`（322 行）整段 `diff -u`。
> 🔴 **这块不是"一个函数"，是一整段连续区域**（约 20 个函数：measureImage / onImageLoad / fitRectToRatio /
> chooseLocalRatio / chooseEditMode / updateCropRect / maskPointerPoint / paintMask / refreshMaskState /
> begin·move·end·leaveMaskPaint / clearMask / applyLocalEdit 等）。advisory 报的 `[C][L1] 203 行` 只是它的中段。

| # | 差异点 | main 侧 | outfit 侧 | 统筹预判 |
|---|---|---|---|---|
| 1 | 「编辑模式」初始化 `useEffect` | `isLocalMode && savedEdit?...`；deps `[item?.id, isLocalMode]` | 无 `isLocalMode`；deps `[item?.id]` | 🔴 **真分叉**：main 组件**兼管普通裁剪 + 局部编辑**，outfit 侧**只做局部编辑** |
| 2 | mask canvas 初始化 `useEffect` 守卫 | `!canvas \|\| !isLocalMode \|\| ...` | 无 `!isLocalMode` | 🔴 真分叉（同 #1） |
| 3 | 注释文字 | 「见资源生命周期要求」 | 「V11-RF-050 §6.0：与 src/main.jsx 统一到带守卫版」 | ⚪ 假分叉（注释） |
| 4 | mask 初始化收尾 | `if(savedMaskData){…return}` + 后续**穿透** `setMaskPainted(false)` | `if{…return} else {同一逻辑}` | ✅ **已结算：假分叉**（统筹原判「🔴🔴真分叉/行为差异」**判错**，RF-076 执行者纠正、统筹已复核）：main `1819` 的 `setMaskPainted(false)` 在 savedMask 为真时被 `1814` 的 `return` 挡住**不可达**；outfit `4910 else` 同样只在无已存蒙版时触发 ⇒ **两侧行为完全等价**，纯 `穿透` vs `else` 写法差异 ⇒ **无需参数化** |
| 5 | `onImageLoad` 初始选框 | 三元 `ratioLocked ? fitRectToRatioLocked : constrainCropRect`；默认 `defaultQuickLocalEditCrop` | 恒 `fitRectToRatioLocked`；默认 `defaultLocalEditCrop` | 🔴 真分叉（main 保留**普通裁剪自由矩形**语义）+ 常量不同源 |
| 6 | `fitRectToRatio` | `ratioLocked` 分支 + **~30 行自由矩形算法** | 只一行 `fitRectToRatioLocked` | 🔴 真分叉，**行数差最大处**（diff hunk 57→21） |
| 7 | `chooseLocalRatio` / `chooseRatio` | `!isLocalMode \|\| QUICK_LOCAL_EDIT_RATIOS.includes` | `BATCH_LOCAL_EDIT_RATIOS.includes` | 🔴 真分叉（守卫 + 比例常量表） |
| 8 | `chooseEditMode` | `!isLocalMode \|\| nextMode === editMode` | 无 `isLocalMode` | 🔴 真分叉（同 #1） |
| 9 | `updateCropRect` | 判据 `ratioLocked`（`= isLocalMode && !isMaskMode`，1725）；`constrainCropRect` | 判据 `!isMaskMode`；`constrainLocalEditRect` | 🔴🔴 **判据是真分叉**（不是同一变量换名字）⇒ 参数化 `lockRatio`，各传原值（见下方核验）。✅ **但"约束函数不同源"是错的**（统筹原判，RF-076 执行者纠正）：`main.jsx:1186 const constrainCropRect = sharedConstrainCropRect` / `outfit-workflow.jsx:3043 const constrainLocalEditRect = sharedConstrainCropRect` ⇒ **同一个函数的两个别名**，工厂直接调 `sharedConstrainCropRect`，**不计入差异** |
| 11 | `applyLocalEdit` 第四参 | `cropLocalEditFile(..., isLocalMode ? "local_edit" : "crop", { fallbackToItem: true })` | `cropLocalEditFile(..., "local_edit")`（**无第四参**） | 🔴 真分叉（`fallbackToItem`）——🔑 **统筹已实测定案**：`local-edit-geometry.js:438` 的默认解构是 `{ fallbackToItem = false } = {}` ⇒ **省略 ≠ true，等于 false**。⇒ outfit 侧**必须显式传 `false`**（与省略等价），main 传 `true`。两侧语义是**「无原图时抛错」 vs 「兜底回 item」**，按 §6.10 #16 参数化、**严禁统一**；对照组**必须有一条反证**（无原图：main 仍成功 / outfit 仍抛「缺少原图」） |
| 10 | `cropDragCtx` | `ratioLocked` | `ratioLocked: !isMaskMode` | 🔴 同 #9 |
| 11 | `applyLocalEdit` | `cropLocalEditFile(..., isLocalMode ? "local_edit" : "crop", { fallbackToItem: true })` | `cropLocalEditFile(..., "local_edit")`（**无第四参**） | 🔴 真分叉（`fallbackToItem`，§6.10 已记：#16 用**参数化**处置、两侧各传原值，**不得统一**） |
| 12 | 区域尾部 | — | 多出 `cropPercent` / `maskCanvasStyle` / `brushCursorStyle` | 🔴 **渲染期变量**（在组件体里算 style）⇒ **不能进工厂**，必须留在两侧 |

🔴🔴 **Hook 边界（本块的关键结论）**：区域内有 **5 个 `useEffect`**，且 **deps 数组两侧不同**
（`[item?.id, isLocalMode]` vs `[item?.id]` 等）。B3 定型形态是**普通工厂**（不 import React、无 `useState/useCallback/useMemo`）
⇒ **`useEffect` 一律进不了工厂** ⇒ 这块**不可能整体搬**，只能是「纯函数/事件处理器进工厂 + effect 与渲染变量留在组件」。

⇒ 因此本单先派了**只读领域设计单**（已交付 `65037d5`）。设计复核结论：
12 项差异中 **10 项与统筹一致，2 项执行者纠偏（④⑨，统筹已复核确认错误）**：
④ mask 初始化收尾**实为假分叉**（main `1814 return` ⇒ `1819` 不可达 ≡ outfit `4910 else`）；
⑨ `constrainCropRect` 与 `constrainLocalEditRect` **同为 `sharedConstrainCropRect` 别名**（非不同源）。

### 3.3 RF-076 设计交付后的统筹裁决（2026-10-03，快照 `65037d5`）

> 对应设计文档 §8.3 的三个待裁决项，**逐条定案**：

| 待裁决项 | 裁决 | 依据 |
|---|---|---|
| ① 落点：追加既有 `src/shared/local-edit-mask.js` vs 新建 `interaction.js` | ✅ **追加既有 `local-edit-mask.js`** | 零新建文件 ⇒ `fileCount` 不变 ⇒ **不触发 019 扫描漂移、不需划账**（§7「同域第二批一律追加进既有文件」）。文件名虽偏 mask，但已是本域共享枢纽。🔴 注意 **`src/local-edit-mask.js`（46 字节转发壳）不许删**（§9 四个一行转发壳之一），它与 `src/shared/local-edit-mask.js` 是两个文件，别混 |
| ② `applyLocalEdit` 省略第四参是否等价 `true` | ❌ **不等价，等于 `false`** | 统筹实测 `src/shared/local-edit-geometry.js:438`：`{ fallbackToItem = false } = {}` ⇒ 省略默认 **false**。两侧语义 = 「outfit 无原图**抛错**」vs「main 兜底回 item」⇒ **参数化 `fallbackToItem`**：main 传 `true`，outfit **显式传 `false`**（与省略等价但更明确）。**严禁统一任一侧**；对照组必须有一条反证 |
| ③ effect#2/#4 体是否抽 `initLocalEditBaseline` / `loadMaskIntoCanvas` 助手 | ⏸ **暂不做**，登记为 **RF-076-D 候选** | 可选收益仅 ~14 行，但 effect#2/#4 属 ③ 真分叉区（deps 两侧不同），动它需额外对照成本，**风险收益比不划算**。等 A/B/C 三单落地后再评估 |
| 附带：`fitRectToRatio` 是否搬 | ❌ **不搬** | 采纳设计结论：outfit 侧已是 shared 薄壳 ⇒ **非重复**（mermaid 式"看着像重复其实不是"，§7「'字节一致'≠'可搬'」的反面教材） |

⚠️ **留给施工单的一条硬约束**：`ratioLocked` 必须以 `lockRatio` 入参由**两侧各传原值**
（main 传 `isLocalMode && !isMaskMode`，outfit 传 `!isMaskMode`）。
**严禁统一成 `!isMaskMode`** —— 那会让 main 的**普通裁剪**也开始吸附比例，**静默改行为**（§6 原则 1：放宽 > 收窄）。

### 3.4 RF-076 验收（统筹 2026-10-03 复测，快照 `d1996a3`）

**净省逐 commit 实测**（`git show <c>:<f> | wc -l`）：

| commit | main | outfit | shared/local-edit-mask.js | 小计 |
|---|---|---|---|---|
| `73753f8` A | −135 | −135 | +170 | **−100** |
| `ee30034` B | −59 | −51 | +59 | **−51** |
| `d1996a3` C | −30 | −29 | +34 | **−25** |
| 合计 | **−224** | **−215** | **+263** | **−176** |

**参数化各传原值**（统筹核对薄壳，全仓 grep `countMode` 命中 0）：
`enabled`: main `isLocalMode` / outfit `true`；`ratios`: `QUICK_` / `BATCH_`；
`lockRatioForUpdate`: main `ratioLocked` / outfit `!isMaskMode`；
`defaultCropRect`: `defaultQuickLocalEditCrop` / `defaultLocalEditCrop`；
`fallbackToItem`: `true` / **显式 `false`**；`rectModeTag`: 三元 / `"local_edit"`。

🔴 **执行者对设计单的第三处纠偏（统筹已复核，`lockRatioForLoad` 不是 `!isMaskMode`）**：
设计 §5 写「outfit 传 `!isMaskMode`」是**推测，实测不成立** —— BASE `outfit onImageLoad` 两个分支**都无条件**锁比例，
且 `defaultLocalEditCrop(w,h,r)` 就是 `fitRectToRatioLocked(null, r, w, h)` 的一行包装（outfit:4788-4792）
⇒ 工厂在 `lockRatioForLoad=true` 时与之**逐字等价** ⇒ **outfit 传 `true` 正确**。

**门禁**（提交后复测全绿）：019 `ok/dup=0/scannedFiles=57/regressions=[]`；import-path `ok/[]/220`；
ESLint 全仓 **errors=0 / warnings=18**（基线）；`vite build` ✓ **8.53s**；`check-syntax` **201/201**；
对照组三份 `scripts/dev/rf076*.mjs` **ALL PASS**（含 5 条反证 + 负向对照）。
行尾：两巨石 **纯 LF 行数 delta=0**（main 116 / outfit 144 是本就存在的 mixed 行尾，执行者逐行保留了）⇒ 未触发行尾膨胀。
`src/local-edit-mask.js` 46 字节转发壳仍在；`fileCount` 仍 **57**（零新建）。

### 3.5 RF-077 派单前对照表（统筹 2026-10-03 实测，快照 `d1996a3`）

整段 `diff -u`（main 1695-2090 ↔ outfit 4792-5155）⇒ **26 个 hunk / +159 −186**。已识别差异：

| # | 差异点 | main | outfit | 判定与参数化 |
|---|---|---|---|---|
| 1 | 组件签名 | `QuickLocalEditModal({item, ratio, mode="local", …})` | `OutfitLocalEditModal({item, ratio, …})` | 保留 `mode` props：main 传原值、outfit 恒传 `"local"`；`isLocalMode = mode === "local"` |
| 2 | 原图解析 | `quickReferenceOriginalFile(item)` | `resolveLocalEditBaseFile(item)` | 入参 `resolveBaseFile`，各传原值（两函数不同源，**不得统一**） |
| 3 | `savedEdit` | `isLocalMode ? item?.localEdit : item?.cropEdit` | `item?.localEdit \|\| null` | 由 `mode` 派生，组件内三元即可（outfit `mode` 恒 local ⇒ 等价） |
| 4 | `activeRatio` | 三元：`QUICK_` 表命中 ? ratio : (`savedEdit.aspectRatio \|\| ratio \|\| "1:1"`) | 三段：`BATCH_` 表命中 ratio → 命中 savedEdit → 表首项 | 🔴 **真分叉**（兜底顺序不同）⇒ 入参 `resolveActiveRatio(ratio, savedEdit)`，各传原值 |
| 5 | `modalTitle` / `modalDescription` | 「局部回贴」/「普通裁剪」两套文案 | 单套 | 入参或由 `mode` 派生（**不得删 main 的普通裁剪文案**） |
| 6 | effect#2 deps | `[item?.id, isLocalMode]` | `[item?.id]` | 组件内用 `isLocalMode` 变量写 deps ⇒ 两侧自然不同（组件里可以有 hook） |
| 7 | effect#4 守卫 | `!canvas \|\| !isLocalMode \|\| …` | `!canvas \|\| …` | 同上，由 `isLocalMode` 派生 |
| 8 | mask 初始化收尾 | `if{…return}` + 穿透 | `if{…} else {}` | ✅ **假分叉**（§3.2④ 已结算）⇒ 统一为任一写法 |
| 9 | `fitRectToRatio` | 33 行含 ~25 行**自由矩形**（普通裁剪） | 5 行委托 `fitRectToRatioLocked` | 已在 deps 里作为 `fitRectToRatio` 入参 ⇒ 各传原函数 |
| 10 | 交互层 deps 其余项 | 见 §3.4 表 | 见 §3.4 表 | **已参数化完成**，直接沿用 |

⚠️ 未逐一穷举的 hunk（约 16 个，多为渲染片段）**由执行者先复核再动手**；
若发现 **JSX 结构差异 >10 处** ⇒ 按执行单降级路径处理（只做非 JSX 部分并报告），**别硬合并**。

### 3.6 RF-077 验收（统筹 2026-10-03 复测，快照 `af49552`）

| 项 | 汇报 | 统筹复测 | 结论 |
|---|---|---|---|
| 净省 | −239 | main 7178→**6841**、outfit 10574→**10293**、新组件 **379** ⇒ **−239** | ✅ |
| props 各传原值 | 是 | main 传 `mode="local"`/`QUICK_`/`defaultQuickLocalEditCrop`/`fallbackToItem`；outfit 传 `BATCH_`/`resolveActiveRatio` 三段/`defaultLocalEditCrop`/`fallbackToItem={false}`/`lockRatioForLoad={true}`/5 项文案 | ✅ |
| 019 | `ok:false(scopeDrift)` | 划账前 `scopeDrift{57→58}`、**划账后 `ok=true/dup=0/scannedFiles=58/regressions=[]`** | ✅ 已划账 |
| ESLint | 0 / 18→17 | **errors=0 / warnings=17**（src 16 + server 1） | ✅ 改善 |
| build | ✓9.55s | ✓ **6.06s** | ✅ |
| check-syntax | 203/203 | **203/203** | ✅ |
| 对照组 | 22/22 | **22/22 PASS**（4 条反证全过） | ✅ |
| 行尾 | — | 两巨石 CRCR=0；纯 LF 行 delta −22/−50（**删掉的是本来就存在的 mixed 行**）；新文件 379 行全 CRLF | ✅ |

🔑 **统筹补验的一处关键点**（汇报未提）：main 侧 `crop`（普通裁剪）路径由**独立的 `QuickCropViewportModal`**
（main.jsx:1519，仍在）承载；BASE 的 `QuickLocalEditModal` 虽带 `mode` prop，但 main 唯一调用点**从未传 `mode="crop"`**
⇒ 那些 `isLocalMode ?` 的 crop 分支在 main 侧**本来就是死代码**。新组件保留它们无害，main 显式传 `"local"` 与 BASE 等价。

🔑 **执行者对 §3.5 第 9 项的实现说明成立**：`fitRectToRatio` 未独立成 prop，而是作为组件内局部函数 +
`lockRatioForLoad` 回退 `ratioLocked` —— main 不传 ⇒ 回退 `isLocalMode && !isMaskMode`，outfit 传 `true`
⇒ 与两侧原实现逐字等价（已核 `defaultLocalEditCrop` 就是 `fitRectToRatioLocked(null,…)` 的一行包装）。

### 3.7 RF-078 派单前对照表（统筹 2026-10-03 实测，快照 `af49552`）

目标：**提示词预设面板 + 提示词编辑弹窗**（advisory main↔outfit 首条 + 第二条）。

| 块 | main | outfit | 差异 |
|---|---|---|---|
| ① | `6459-6490`（32 行） | `9335-9366` | **逐字相同**（A 类） |
| ② | `6492-6549`（58 行） | `10054-10111` | **仅差 1 行**：main 关闭按钮多 `aria-label="关闭"`（B 类 2%） |

- 合计 **约 90 行重复**。三处契约文档（`TICKETS`/`冷启动`/`MEMORY`）grep `promptPreset|editingPrompt|PromptEditor` **零命中** ⇒ **从未被裁决过**的真新债。
- ⚠️ **这是组件级抽取，不是纯函数抽取**：要把 `promptSearch`/`editingPrompt`/`filteredPromptPresets`/`draggedPromptId`/
  `promptCategories` 等 state 与 `beginPromptDrag`/`applyPromptPreset`/`editPromptPreset`/`updateEditingPrompt` 等回调一起带走。
- ⚠️ **统筹已发现两侧标识符计数不同**（`promptSearch` main=5/outfit=7、`filteredPromptPresets` 3/5、`editingPrompt` 8/6、
  `promptCategories` 12/8、`addPromptCategory` 2/3）⇒ **两侧可能存在额外差异**（例如 outfit 有额外的预设来源/分类处理）。
  ⇒ 只读单必须先把**两侧完整对照**做出来，别只看那 90 行。
- 🔴 **净省可能不成立**：组件壳 + 十几条 props 接线成本可能吃掉 90 行的收益。**估不出正净省就报"不做"**，这是完全可被接受的结论。

### 3.8 RF-075 断言失配表（统筹 2026-10-03 实测，快照 `af49552`）

`scripts/verify/local-edit-base-file-check.mjs` 现状 **31/36，5 条失败**（登记时是 1 条）。

| # | 脚本行 | 断言名 | 失效原因 | 裁决修法 |
|---|---|---|---|---|
| 1 | 111-113 | 批量：选框裁剪用 `resolveLocalEditBaseFile(imageItem)` | `cropOutfitLocalEditFile` **全 src 已消失**（仅 `local-edit-geometry.js:430` 注释 + `dev/d2-a-class-check.mjs` 残留） | 🔴 **真僵尸** ⇒ 改断言当前接线：组件内 `resolveBaseFile(item)` + outfit 传 `resolveBaseFile={resolveLocalEditBaseFile}` |
| 2 | 114-116 | 批量：弹窗预览用 `resolveLocalEditBaseFile(item)` | 组件搬进 `LocalEditModal.jsx` | **重定位** ⇒ 读新文件（现为 `LocalEditModal.jsx:85 const originalFile = resolveBaseFile(item);`） |
| 3 | 164-166 | 弹窗标题显示底图尺寸与「输出同尺寸」 | 组件搬走；outfit 改为传 prop `modalDescription` | **重定位+拆分** ⇒ ①组件 `subtitle` 含 `底图 ${baseSizeText}`；②outfit 调用点传该文案 |
| 4 | 167-169 | 选框与底图尺寸不一致时偏移警告（`staleRect`） | 组件搬走 | **重定位** ⇒ `LocalEditModal.jsx:245 const staleRect` + `:266 className="quickLocalEditWarning"` |
| 5 | 175-179 | 快捷：弹窗同样显示底图尺寸与偏移警告 | `QuickLocalEditModal` 已删，main 也用新组件 | **与 3/4 同源** ⇒ 不再分批量/快捷重复断言；改为断言 main 调用点接线仍在 |

🔴 **总裁决：重定位，不删除。** 这些是 2026-09-26「批量局部回贴 5 张全错」事故的防回归断言，价值极高，删了等于拆护栏。
⇒ 修完必须做**负向对照**：把组件内 `resolveBaseFile(item)` 临时改成 `item?.file`（＝事故成因「上传副本优先」），
相关断言**必须转 FAIL**；改回后 PASS。**做不到这一点就是恒真断言，验收打回**（§0.9 第 12 条）。

### 3.9 RF-078-b 派单前对照表（统筹 2026-10-03 实测，快照 `af49552`）

🔑 **这块与 RF-078 是两回事，别混**：RF-078 是 **main ↔ outfit 跨文件**（真分叉、已裁决不抽）；
RF-078-b 是 **outfit 自己文件内部的两处渲染**（逐字相同、零分叉）。

| 项 | 面板 A（停靠） | 面板 B（模态） |
|---|---|---|
| 行范围 | `outfit-workflow.jsx:9311-9387` | `outfit-workflow.jsx:9992-10068` |
| 容器 | `<div className="promptAssistantDock">` | `<div className="promptAssistantBody">` |
| 外层 | `<section className="viewPanel …">` + `LegacyModulePanel` | `{isPromptAssistantOpen && (<div className="modalLayer promptLayer">` |
| 去掉容器首尾行后的内容 | **76 行** | **76 行** |
| `diff --unified=0` | — | **0 hunk，逐字相同** |

**为什么是零分叉**：两处都写在 `OutfitWorkflow`（`5727 export default function OutfitWorkflow`）**同一个组件的 render 内**，
引用的 `promptCategories`/`promptSearch`/`filteredPromptPresets`… **就是同一批变量** ⇒ 抽出的组件两侧 props 传**完全相同的值**。

**自由标识符（需提升为 props）约 19 个**：

| 类别 | 标识符 | 处置 |
|---|---|---|
| `usePromptLibrary` 返回的 handler（9） | `applyPromptPreset` `editPromptPreset` `deletePromptPreset` `addPromptCategory` `openNewPromptEditor` `beginPromptDrag` `endPromptDrag` `dropPromptOnPreset` `updateEditingPrompt` | 🔑 **整包传 `lib={promptLib}`**（`outfit:6671` 已解构出该对象）⇒ 9 个压成 1 个 |
| 组件内 state + setter（7） | `promptCategories` `promptCategory` `setPromptCategory` `promptDropCategory` `setPromptDropCategory` `promptSearch` `setPromptSearch` | 逐个传 |
| 派生/其它（3） | `filteredPromptPresets` `draggedPromptId` `dropPromptOnCategory` `renamePromptCategory` `schedulePromptPresetApply` | 逐个传 |

⇒ 压包后 props ≈ **11–13 个**。

**净省估算（保守）**：现状 `2 × 76 = 152` 行 ⇒ 抽出后 `组件体 76 + 解构/签名 ~15 + 2 调用点 × ~11 = ~113` 行
⇒ **净省 ≈ 30–50 行**。⚠️ 若实测 **≤20 行则报「不做」**（搬一块的固定成本与块大小无关，§5.2）。

🔴 **落点硬裁决**：定义在 **`src/outfit-workflow.jsx` 模块顶层**（`function` 声明有提升，位置不限），
**不新建文件** ⇒ `fileCount` 仍 58 ⇒ **019 不划账**。这是本单相对 RF-078 的最大优势。

### 3.10 RF-074 派单前对照表 + 🔴 收益口径澄清（统筹 2026-10-03，快照 `af49552`）

🔴 **先厘清口径，否则这单会被误杀**：

| 单的类型 | 收益来源 | 正确判据 | 错误判据 |
|---|---|---|---|
| **消重单**（RF-073/076/077/078-b） | 消灭两侧重复的一份 | **总行数净省 > 0** | — |
| **单侧拆分单**（RF-066/068/069/070/071，**RF-074 属此类**） | 巨石瘦身 | **巨石减少行数 ≥ 阈值** | ❌ 「总行数净省 > 0」—— **必然为负** |

实测佐证：`V11-RF-070` 参考图上传域 16 函数（**172 行**）→ `src/features/upload/reference-upload.js`（现 **203 行**）
⇒ **main −172**（收益），但**总行数净变化 = −172 + 203 = +31**（净增，这是代价，不是失败）。
§6.18 曾专门更正过 B3-3/B3-4 的净省口径（−144 → −117），就是栽在这个混淆上。

⇒ **RF-074 的判据是「main.jsx 能减多少行」，不是「总行数是否减少」。**

**本单对象：`src/main.jsx:3036-3459`，21 个函数 / 371 行**（统筹实测，逐函数行数见下）。

| 行范围 | 行数 | 函数 | | 行范围 | 行数 | 函数 |
|---|---|---|---|---|---|---|
| 3036-3044 | 9 | `toggleSelected` | | 3330-3360 | 31 | `downloadStitchPreview` |
| 3045-3048 | 4 | `clearSelection` | | 3361-3375 | 15 | `copyImage` |
| 3049-3061 | 13 | `deleteSelected` | | 3376-3398 | 23 | `downloadItem` |
| 3062-3085 | 24 | `deleteResult` | | 3399-3425 | 27 | `autoSaveGeneratedItems` |
| 3086-3117 | 32 | `markResultImageBroken` | | 3426-3445 | 20 | `flashDownloadFeedback` |
| 3118-3127 | 10 | `removeDetailResultIds` | | 3446-3454 | 9 | `downloadSelected` |
| 3128-3157 | 30 | `clearAll` | | 3455-3459 | 5 | `downloadAll` |
| 3158-3165 | 8 | `refreshHistory` | | 3258-3263 | 6 | `blobFromImageItem` |
| 3166-3186 | 21 | `syncHistoryFromServer` | | 3264-3274 | 11 | `resultDragDownloadName` |
| 3216-3233 | 18 | `saveProcessedImageFile` | | 3275-3284 | 10 | `beginResultImageDrag` |
| 3285-3329 | 45 | `beginReferenceImageDrag` | | | | |

⚠️ **域归属需执行者重判**（统筹粗判可能有误）：`removeDetailResultIds` 可能属 **detail 域**、
`beginReferenceImageDrag`（45 行，最大）可能属 **upload 域**、`refreshHistory`/`syncHistoryFromServer` 可能属 **history 域**。
⇒ **不要为凑数硬把异域函数塞进同一工厂**（§6 原则 3：单侧独有块不许塞进来）。

⚠️ **该域已部分搬过**：`V11-RF-068` 已搬走「结果卡拖拽替换族 5 函数」⇒ `src/features/result-queue/quick-result-replace.js`（103 行）已存在。
**落点优先追加既有 features 模块**（零 `fileCount` 划账）；确需新建才新建，但必须写明并计入代价。

---

## 4. 开工前必跑（4 条，缺一不可）

```bash
git log --oneline -5 && git status --short   # ① 确认前置单真已 commit、工作区干净
node scripts/dev/domain-coupling.mjs         # ② 重测耦合度（搬走一个域后域间关系会变）
node scripts/verify/block-clone-advisory.mjs # ③ 排产前手工跑一次（登记在 TOOLS，恒 0 退出）
node tmp/lint.mjs                            # ④ 取 ESLint 当前基线（**不要沿用记忆里的数**）
```

收工前必跑：`frontend-duplication-check`（019）→ `import-path-check` → `lint-diff.mjs HEAD`
（改前改后**逐条**比对）→ `node --check` → `npx vite build`。

### 4.1 🔴 「是否已被裁决过」的检测法（2026-10-03 修正，旧法有漏洞）

🔴 **旧判据作废**：「候选名去 `REFACTOR_TICKETS.md` / `REFACTOR-冷启动.md` / `MEMORY.md` 三处 grep，零命中 ⇒ 从未被裁决」
—— **这条是错的**。RF-078 派单时按旧法判「零命中 ⇒ 真新债」，实际**早在 V11-RF-057（2026-10-02）就被裁决过「不抽组件」**，
而裁决**写在 `src/shared/prompt-library.js` 文件头注释里**，不在任何契约文档中。

✅ **修正后的四处 grep**（候选名 + 区域代表性函数名都要扫）：

```bash
grep -rn "<候选名>" REFACTOR_TICKETS.md REFACTOR-冷启动.md .workbuddy/memory/*.md
grep -rn "<候选名>\|不能抽\|不许塞进来\|已分叉，停手\|待人类裁决" src/shared/**/*.js   # 🔴 新增：文件头裁决注释
```

**为什么必须扫 `src/shared/*.js` 文件头**：本项目的既有裁决有一批是以「为什么要有这个文件 / 三条硬要求」的形式
写在被抽出的共享模块文件头（见 `src/shared/prompt-library.js:16-52`，含 `usePromptLibrary` 的三条判据 + 三条硬要求 +
两处「已分叉，停手待人类裁决」）。**它们是权威裁决，但其存在对契约文档不可见。**

⇒ 派单前若漏扫这一处，会把已裁决的债当成新债重开一单（RF-078 就是这么浪费掉一整单只读工时的）。

---

## 5. 🔴 高危坑（本轮踩过，每一条都造成过回滚）

1. **行尾**：读原文 `split("\n")` **不能** `split(/\r?\n/)`；存行时剥 `\r`、写回再补
   （`{t: t.replace(/\r$/,""), cr}`），**干跑加 `CRCR=0` 自检**，否则全文件变 `^M^M` 只能回滚。
2. **提交看 `git diff --cached --stat`，不是 `git diff --stat`** —— `git add` 会把巨石规范化成纯 LF
   而 HEAD blob 是 mixed ⇒ 直接 add 变万行级全文件重写、污染 blame。
   正解：`git diff --ignore-cr-at-eol -- <f> > p.patch` → `git apply --cached --recount --ignore-whitespace p.patch`。
3. **插入锚点所在的那段本身也要进 drop 集合**（RF-071 `bitmapFromBlob` 漏加 ⇒ 旧定义残留 ⇒ no-unused-vars 点名）。
4. **工厂返回值 ≠ 调用点解构清单**：只在工厂内部互调的函数**绝不能**在调用点解构（连续 3 单应验）。以 ESLint 实测为准。
5. **搬走一个域会连带让上游 import 变孤儿**（RF-069 一次清掉 4 个）⇒ 清孤儿 import 是必做项，**只有 ESLint 能可靠点名**。
6. **新建 `src/features/*.js` ⇒ 019 扫描范围漂移判红** ⇒ 必须手工划账：只加 `scanScope.files` + `fileCount`，
   **绝不动 `duplicateCount`**。
7. **对照组两坑**：① 注入给旧模块的依赖必须是**真实实现**不是简化 mock（否则假差异）；
   ② **建一个 env 跑一个**，不能先建两个再跑（模块级缓冲会被重置）；case 名用 `startsWith` 不用 `===`。
8. **反证必须自检**：声明的 A/B 两分支日志必须不同，否则该组无判别力。

---

## 6. 交接协议（每单结束时必做，否则下一会话会重复劳动）

1. 一单一 commit，commit 用 `git commit -F tmp/xxx.txt`（`-F -` 可能被拦）。
2. 在 `REFACTOR_TICKETS.md` §6.18 追加一行进度（**含 commit 号与逐 commit 实测的净省行数**）。
3. 在 `.workbuddy/memory/YYYY-MM-DD.md` 追加当日日志。
4. **刷新本文档 §1 快照与 §3 候选表**。
5. 新判断写进 `.workbuddy/memory/MEMORY.md`（**只在 MEMORY.md 超 3000 字时才压缩重写**）。

---

## 7. 待用户人工冒烟（可攒着一起给，未验证不等于有问题）

✅ **已验通过（2026-10-03，用户亲测）**：参考生图 / 一键详情的**上传与删除**（产品图 ↔ 参考图），
即 RF-073 触及的整条链路 —— 对应下面第 2 条，可划掉。

- 一键详情页：分屏拖拽排序、拼图预览开关 + 滚轮缩放 + 拖拽平移、长图拼接下载、预设保存/加载/删除
- ~~参考生图上传区：拖图落区（含从结果卡拖图）、"产品图+参考图合计最多 6 张"提示~~ → 上传/删除已验通过；**拖图落区**仍未验
- 无限画布全域：新建/重命名/删除/清空/切换画布、拖节点、连线/删连线、滚轮缩放、拖图落画布取坐标、适应视图
- 结果卡：拖一张结果图到另一张上替换（源被移除、选中与预览同步）
- 视频生成：加参考图（>10MB 应报错）、拖图落视频区、换模型/时长、轮询状态与超时文案
- 更早欠的：复制提示词按钮、拖图片文件进窗口（不应触发浏览器跳转）、连接测试两条路径、
  拖到桌面的文件扩展名（png/jpg/webp/gif）、提示词库 main 9 + outfit 7×2 条、预览缩放上下限两侧分别验
