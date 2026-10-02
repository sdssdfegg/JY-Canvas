# REFACTOR_TICKETS.md · 统筹枢纽（v2 · 2026-10-02）

> **本文是唯一有效的派单契约**。跨会话流转只带这一份，不要带聊天记录。
> 旧枢纽已**非破坏性留档**为 `REFACTOR-枢纽-存档-2026-10-02.md`（批次 0–4 全部关闭，含 §0.9 十九条硬约束全文）。
> 更老的原件在 `REFACTOR-存档-2026-10-02.md`；历史工单定义在 `REFACTOR-工单明细.md`（**只读**）。
> **硬约束（§0.9 第 1–19 条）全部继续有效**，本文 §1 只做摘要，执行前**必须整读存档文件里的 §0.9 全文**。

**项目**：静音AI绘画 V11（`jingyin-internal-canvas` v11.0.0）· 工作区 `D:\源码开发\静音AI画板v4.0源码`
**本轮定位**：后端结构已收口 100%，**本轮主线 = 前端债务收口 + 已知缺陷清零 + 后端重复消账**
**🔴 本轮禁区**：`src/main.jsx`（8818 行）、`src/outfit-workflow.jsx`（11404 行）**不做整体搬迁、不做结构重组**。
仅允许两种例外：① 本文点名的「**删定义 + 加 import**」式局部改动（每单 ≤ 2 个 hunk）；② 童子军原则（见 §1.4）。

---

## 0. 权威现状快照（2026-10-02 18:30 实测，非记忆、非转述）

| 维度 | 实测值 | 判据/口径 |
| --- | --- | --- |
| `server/index.js` | **9 行** | 纯引导（PORT + app.js + attachFrontend） |
| `server/app.js` | **141 行** | 装配层 |
| `server/routes/` | **13 个模块** | 201–213 全清 |
| `server/core/` | **33 个模块** | 批次 3 全清 |
| 后端循环依赖 | **0** | 自写 DFS 扫描（src + server + prompts） |
| 后端 lint 债务 | **1 条**（`outfit.routes.js\|no-unused-vars`，刻意保留的 `deferOutfitAutoSave` 标记） | `lint-baseline.json` total=20，其中后端 1 / 前端 19 |
| `src/` 总规模 | **25093 行** | `*.js` + `*.jsx` |
| `src/outfit-workflow.jsx` | **11404 行**（45%） | useState 96 / useEffect 46 / useCallback **0** |
| `src/main.jsx` | **8818 行**（35%） | useState 107 / useEffect 35 / useCallback **0** |
| 019 前端重复基线 | **1 条**（仅 `ReferenceThumbTray`） | 行首顶层函数判据，含 `src/shared/`，42 文件。**已合入 RF-001/040/041/042** |
| 前端块级克隆 | **约 2586 行（12%）**、62 个连续块、最长 130 行 | 8 行滑窗 + 归一化哈希（**019 门禁看不见**） |
| 前端 lint 存量 | **19 条**，全部 `react-hooks/exhaustive-deps` | main 8 / outfit 10 / image-editor 1 |
| `auth-key-parity-check` | **knownDefectCount = 0** ✅（RF-001 已修 `7f6845b`） | 修复前为 1，复现 `'"Bearer sk-abc"'` → `"Bearersk-abc"` |
| 当前 HEAD | **24cfa45** | 行号一律以 commit hash 为锚，不用工作区行号 |
| `npm run check` | = `check-syntax` + `run-all.mjs` | 全套 38 项，本环境恒 27 通过 / 11 失败（见 §9.3） |

> 🔴 **口径提醒（§0.9 第 13/17/19 条）**：上表每个数字都只在其判据下成立。
> 尤其：**019 的「5 条」= 同名顶层函数层面**；它既看不见**改名克隆**（`imageExtension`↔`imageExtensionFromMime`），
> 也看不见**成段复制的代码块**（2586 行）。**不要拿「019 只剩 5 条」当作「前端没有重复了」。**

---

## 0.5 ✅ 已完成存量清单（**禁止重复劳动** · 开工前先查这里）

> 本项目已优化多轮。**下面这些都已经做完了，不要再开同样的单、不要再建同名的模块、不要再写同类的脚本。**

### 0.5.1 后端结构 —— 已收口 100%，**不要再拆**
`server/index.js` 9 行 / `server/app.js` 141 行 / `routes/` 13 模块 / `core/` 33 模块 / **0 循环依赖** /
后端 lint 仅剩 1 条（`outfit.routes.js|no-unused-vars`，**刻意保留**的 `deferOutfitAutoSave` 标记，属业务决定）。
⇒ **后端剩下的只有"重复消账"（RF-027），没有任何结构拆分工作。**

### 0.5.2 前端已抽离的共享模块（搬新函数前**先 grep 这张表**）
`src/shared/`：`text-normalize.js`（asText/pickEnum）、`numeric.js`（clamp）、`image-input.js`（isImageFile / imageFilesFromList / imageFilesFromClipboard / imageBitmapFromFile / imageBitmapFromBlob / **imageExtension**）、`canvas-blob.js`（canvasToBlob）、`file-name.js`（fileBaseName）、`video-task.js`（视频状态族 4 条）、`prompt-library.js`（normalizePromptCategoryName / normalizePromptCategories / normalizePromptPreset）、`local-edit-geometry.js`（resolveLocalEditBaseFile 等）、`local-edit-mask.js`（imageBitmapFromDataUrl）、`routing.js`（isBanana2Model）、`result-image.js`、`outfit-intent.js`、`retouch-intent.js`、`image-hosts.js`、`image-split.js`、`generation-errors.js`、`error-report.js`、`quickgen-prompt-rules.js`、`models.js`、`error-boundary.jsx`、`DebouncedTextarea.jsx`、`ui/Modal.jsx`、`ui/ChannelPicker.jsx`
⇒ **`imageExtension` 与 `imageExtensionFromMime` 的改名克隆已在 `image-input.js:13-15` 注释里登记**（RF-032 直接引用，不用重新发现）。

### 0.5.3 已有门禁（**不要再建同类门禁**，先查这张表）
`frontend-duplication-check`(019) / `server-duplication-check` / `import-path-check` / `state-singleton-check`(监视 8 项) / `routing-check` / `auth-key-parity-check` / `lint-ratchet-check` / `run-all-check` / `local-edit-base-*` / `auth-key-*` 等，共 **38 项**（`run-all.mjs --list` 为准）。

### 0.5.4 已固化的可复用测量脚本（**直接跑，不要重写**）
`scripts/dev/`：`block-clone-lines.mjs`（块级克隆折算行数）、`cycle-scan.mjs`（循环依赖 + 扇入扇出）、
`server-027-scope.mjs`（后端视野外重复测量）、`frontend-duplication-audit.mjs`（宽松判据审计）、
`blade4-check-template.mjs`（**对照组范本**：旧实现抄进来当基准，逐条比对）。
⚠️ 这些原本在 `tmp/`（**`.gitignore` 已忽略**）⇒ 已复制进 `scripts/dev/` 入库，ESLint 0 问题。

### 0.5.5 已裁决事项（**不再重新讨论**，除非有新证据）
- 刀 3 三项：`canvasToBlob` 统一到无默认值版 + 文案「图片压缩失败」；`isImageFile` **有意放宽**到支持 avif；`imageBitmapFromDataUrl` 统一到 `local-edit-mask.js` + 文案「无法读取图片」
- 刀 5 两条 loader：**改名不合并**（`loadOutfitPromptCategories` / `loadOutfitPromptPresets`），**不动 storage key**
- RF-031：探针第 5 份 `canvasToBlob` 判为**陈旧副本**，已改复用 + 3 处显式补 `"image/png"`
- RF-024：`prompts/server/**` 已纳入（0 报红），顶层 `*-ai.js` **不纳入**（16 条走 RF-027 抽走，不许 `--update` 记账）
- 白屏根因已根治（vite 预构建缓存隔离 + `JINGYIN_VITE_CACHE_DIR`），**不要再查白屏**

### 0.5.6 已实测推翻的"疑似 bug"（**不要重复当成问题报**）
`src/outfit-workflow.jsx:6951`：常被举为「闭包读旧值实锤」，实测 `modelImages` 来自 `useState(readOutfitPages)` 的**同步读档**（`:6611` lazy initializer），挂载时不是空数组 ⇒ **空依赖是有意的**，机械补依赖反而会变成"每次换图重新合并历史"。

---

## 1. 硬约束（摘要 · 全文见存档 §0.9）

1. **一次只搬一件事；结构搬运与 bug 修复绝不混在同一次提交。**
2. **只搬运，不改判断条件/阈值/提示词/出图参数/字段名。** 违反即拒收。
3. 每单必须 AB-1~AB-4 全过（§9.1）；**沙盒通过 ≠ 功能正确**。
4. 新功能一律写 `src/features/<功能名>/`；**禁止继续往两个巨石文件加代码**。
5. 遇到「不搬就过不去」的地方，**停手开新单**，不要在同一次提交里解决。
6. 🔒 **单一写入纪律**：**执行者不得修改本文件、任何总表/执行单/交付报告类 `.md`**。成果以**汇报**交回统筹落表。
7. **搬前遍历待搬区间内每一个顶层标识符**，逐个搜全文件引用；两个方向都要查：① 这符号还有谁用；② **它的唯一调用方是不是也在搬走之列**（否则会留孤儿 → ESLint 判红）。
8. 每单 diff **允许且必须**包含三类 hunk：① 删定义 ② 加本单 import ③ **清理因搬家变成孤儿的 import**。
9. **路径保真**：搬进子目录后，内部相对导入必须按新位置重算层级（已发生两次血案，其中一次导致软件起不来）。
10. **每次「搬出新文件」后必须回头问：被搬走的那些行还在不在门禁扫描范围内？**（拆得越干净，护栏越弱）
11. **「有门禁/有覆盖/全绿」必须实测**，不许从体量推断；报覆盖率必须同时给判据并抽样验证。
12. **恒真的断言等于没有断言**；任何断言先自问「它在什么情况下会失败」。
13. 统计数字**必须同时给判据与扫描范围**；拿历史/外部数字前先核口径。
14. **取证一律先量总数**（`grep -c`）；用 `head` 截断时必须声明「只看了前 N 条」；**全称结论必须由未截断输出支撑**。
15. **清单类注释与行号属于代码的一部分**，改结构时必须同步（扫描目录清单、门禁监视名单、断言清单）。
16. **禁止复制实现**：只能 import；确需复制时当场登记欠账。
17. **分叉判定优先于统一**：先逐对 diff 判「字节一致 / 语义等价 / **已分叉**」，**已分叉一律停手报统筹，不得擅自统一**。
18. **无真机冒烟的工单必须在 commit 里写明豁免理由**，不许假装冒过。
19. **对照组手法（刀 3 起定型，每刀照做）**：把旧实现逐字抄进 `tmp/xxx-check.mjs` 当基准，多组入参逐条比对；
    被测函数若含 `Date.now()`/`Math.random()`，**先固定时钟**再比，否则必然误报差异。

### 1.4 童子军原则（针对两个巨石的唯一许可通道）
- **不主动**拆 `main.jsx` / `outfit-workflow.jsx`。
- 只有当**以后因为业务需求本来就改到某个函数**时，才顺手把它搬到 `src/shared/` 或 `src/features/<名>/`。
- 顺手搬的前提：该次业务改动**与搬运动作分两个 commit**，搬运 commit 仍走本文全部纪律。

---

## 2. 全局路线与批次总览

```
A（缺陷清零 + 前端 B 收尾，可并行）→ B（后端 AI 族消账）→ C（只读审计）→ D（阶段 C 拆分）
```

| 批次 | 工单 | 类型 | 标记 | 上下文预算（执行者需读范围） | 前置 |
| --- | --- | --- | --- | --- | --- |
| **A** ✅ | V11-RF-001 | bug 修复（KEY 清洗顺序） | ✅ **已完成 `7f6845b`** | 极小 | 无 |
| **A** ✅ | V11-RF-040 | 刀 5 尾：两个 loader **改名** | ✅ **已完成 `088ff5b`** | 小 | 无 |
| **A** ✅ | V11-RF-041 | 刀 7：`diagnosticImageSourceType` | ✅ **已完成 `0c7006a`** | 小 | 无 |
| **A** ✅ | V11-RF-042 | 刀 6 上半：`referenceSource` | ✅ **已完成 `24cfa45`**（取超集版） | 小 | 无 |
| **A** ⏳ | V11-RF-044 | **只读定位**：本地详情链路的底图取值点 | 🟢 **待交回**（本报告未包含） | 中 | 无 |
| **A+** ✅ | **V11-RF-045** | 🔴 **真 bug**：`image-editor.jsx:651` undo/redo 陈旧闭包把旧 `tool`/`overlayOpacity` 写回存档 | ✅ **已修 + 人工冒烟通过（`25ce21c`）** | 小 | 无 |
| **A+** ✅ | **V11-RF-043** | 刀 6 下半：`CachedImage` + `ReferenceThumbTray`（019 最后 1 条，已分叉） | ✅ **已完成**：043-1 `9122b3c` / 043-2 `bbf4586`；🟢 **人工复核 2/2 通过（2026-10-02）⇒ 关闭** | 中 | 无 |
| **A+** ✅ | **V11-RF-046** | 门禁加「改名克隆」档（纳组件内函数、**只报不记账**） | ✅ **已完成 `025291b`** | 小 | 无 |
| **A+** ✅ | **V11-RF-040b/040c** | 注释锚点裁决：跨文件互指注释**只写函数名、不写行号** | ✅ **已完成 `89ca172` / `0ea8018`** | 极小 | 无 |
| **B** ✅ | V11-RF-027-1 | 后端：`createAbortSignal` 8 处 → 1 处 | ✅ **已完成 `4fc594f`** | 中（9 个文件） | A 完成 |
| **B** ✅ | V11-RF-027-2 / -2b | 后端：抽 `core/ai-chat-shared.js` + 消 `readResponse`↔`readTextSafely` 改名克隆 | ✅ **已完成 `4ad6461` / `b5af930`** | 大（顶层 `*-ai.js`） | **027-1 通过** |
| **B** ✅ | V11-RF-027-3 / -4 | 参数化抽取 5 族 + 4 族「同名不同义」改名不合并 | ✅ **已完成 `84ae66c` / `28b3b35`** | 大 | **027-2 通过** |
| **B** ⏳ | V11-RF-027-4b | 收口 `compactPreserveNewlines`（改名后仍判重的最后 1 条，字节一致） | 🟢 **待派发**（先于 027-5） | 极小 | **027-4 通过** |
| **B** ⏳ | V11-RF-027-5 | 把顶层 `server/*-ai.js` **纳入门禁视野**（消完后剩余债务登记在册，已授权 `--update`） | 🟢 **待派发** | 中 | **027-4b 通过** |
| **C** | V11-RF-032 | **只读测量**：改名克隆 + 同名不同义 | 🟢 | 大（全 `src/**` 只读） | 无（可与 A/B 并行） |
| **C** | V11-RF-033 | **只读审计**：19 条 `exhaustive-deps` 三类判定 | 🟢 | 中（19 处区间） | 无（可与 A/B 并行） |
| **D** | V11-RF-050… | 阶段 C：局部编辑 4 块 → `src/features/local-edit/` | 🔴 | 大 | A/B/C 完成 |

> **派单建议**：**A 批 5 单一次性派给一个执行者**（互不重叠文件，合计上下文远低于 500K）；
> **B 批两刀串行走**；**C 批两单只读，可与 A/B 交给另一个执行者并行**；D 批等前三个批次收口再开。

---

## 3. 批次 A · 缺陷清零 + 前端 B 收尾 ✅ **已交付（2026-10-02，HEAD `24cfa45`）**

> **交付结果一览（统筹已验收）**
>
> | 单 | commit | 判定 | 对照组 | 019 | 冒烟 |
> | --- | --- | --- | --- | --- | --- |
> | RF-001 | `7f6845b` | 纯函数体内调顺序（三类 hunk 均无） | 46 组入参，仅 9 组不同且全属目标缺陷 | `knownDefectCount 1→0` | 🔴 **豁免**（无真实 KEY/微信来源）→ **待人类补一次粘贴冒烟才关闭** |
> | RF-040 | `088ff5b` | 改名不合并（另同步 2 处清单类注释，§0.9 第 15 条） | 300 次比对，差异 0 | 5→3 | 真机 tab 冒烟 0 报错 |
> | RF-041 | `0c7006a` | **字节一致** ⇒ 落点 `result-image.js`（两文件本就 import，**不新增文件 ⇒ 无漂移、无需划账**） | 40 组 × 三份实现，不一致 0 | 3→2 | tab 冒烟 0 报错 |
> | RF-042 | `24cfa45` | 语义等价 · **超集**（outfit 多 `previewUrl`）⇒ 取超集 | 37 组；与旧 main 差异 7 条**逐条归因**到「带 previewUrl 且无 localUrl」 | 2→1 | tab 冒烟 0 报错；⚠️ 10 个调用点中 6 个需"真有参考图"，**未覆盖、未假装冒过** |
> | RF-044 | 无提交 | **只读定位** | — | — | 见 §7 缺陷③ 改写 |
>
> **全局**：`run-all` 27/38（406s，失败集合与已知环境基线同类别，非回归）；`batch-prompt` 全套失败但 `--only` 2/2（再次印证属资源竞争）；lint 棘轮 20→20、`regressions=[]`；每次改 `.jsx` 均 `vite build` 通过。
> 🔍 **对照组立功**：RF-001 的对照组抓到候选实现**一处收窄**（`"Bearer "` 由 `""` 变 `"Bearer"`），**修正后才落地** —— 这是"对照组手法"第三次避免真回归。
>
> 🔴 **执行者抓出工单自身两处缺陷（统筹认领，非执行者责任）**：① RF-040 裁定与禁止清单自相矛盾；② 划账授权缺失。见 §3.2 的裁决。

### V11-RF-001 · `normalizeApiKeyInput` 清洗顺序导致部分粘贴来源 401

- **任务类型**：【bug 修复】（**独立 commit，禁止与任何搬运动作混交**）
- **目标文件**：
  - `src/features/auth/api-key.js:1-7`
  - `server/features/auth/api-key.js:1-7`（**两份必须逐字一致**，有专属门禁守护）
- **前置依赖**：无 ｜ **标记**：🟢 可并行
- **现状实测（2026-10-02 复核，确认未修）**：
  - `auth-key-parity-check` 输出 **`knownDefectCount = 1`**
  - 复现：`'"Bearer sk-abc"'`（整串带引号粘贴）→ 输出 **`"Bearersk-abc"`** ❌
  - 根因：现有顺序是「去 Bearer → trim → 去首尾引号 → 去全部空白」；**引号在 Bearer 之前被剥掉时，`Bearer` 前缀已错过识别窗口，最后一步去空白又把 `Bearer sk` 粘成 `Bearersk`**
  - 次要：`'""sk-abc""'` → 输出 `' "sk-abc" '`（双层引号只剥一层）
- **禁止修改文件清单**：G 全部（§9.2）+ `scripts/verify/auth-key-parity-check.mjs`（**禁止改脚本或其 `knownDefects` 白名单** —— 修好后缺陷必须**自动消失**，改脚本即视为作弊）+ `server/core/image-error-policy.js`
- **验收条件**：
  1. `auth-key-parity-check` 的 **`knownDefectCount` 由 1 → 0**，且**未修改该脚本**；
  2. 目标用例：输入 `Bearer \u200B"sk-jingyin-123456"\uFEFF ` → 输出**恰为** `sk-jingyin-123456`；
  3. 不变量不回退（脚本 `:88-102` 已钉）：去 `Bearer`（大小写不敏感）、去首尾引号、去 `\s` 与 `\u200B-\u200D\uFEFF`、中间空格也删、空/`null`/`undefined` 返回 `""` 不抛异常；
  4. 两份实现 `diff` 为空；**纯函数、无副作用、不改函数名/导出名/不新增依赖**；
  5. AB-1 全套通过、AB-2 lint 棘轮**无新增**。
- **自测校验点**：
  - `node scripts/verify/run-all.mjs --only auth-key` → `ok:true` 且 `knownDefectCount:0`
  - `git diff --stat` 两文件改动行数相同、内容一致
  - 临时用例（不写进脚本）：`'"Bearer sk-x"'`、`'"Bearer  sk-x"'`、`'""sk-x""'`、`'  "sk-x"  '`
- **真机冒烟**：**【必须】** 从微信聊天窗口复制真 KEY（首尾带不可见字符）→ 设置页粘贴 → 保存 → 出图：① 界面无引号残留 ② 请求 200 ③ 日志无 401/`invalid_api_key`。

---

### V11-RF-040 · 刀 5 尾：两个 loader **改名**（同名不同义，裁定为「不合并」）

- **任务类型**：【结构搬运 · 极小区间】
- **目标文件**：`src/outfit-workflow.jsx`（仅 `loadPromptCategories` / `loadPromptPresets` 两处定义与调用）
- **前置依赖**：无 ｜ **标记**：🟢 可并行
- **🔴 已裁定（不重新讨论，除非有新证据）**：
  - 这两条是 **同名不同义**：main 侧兜底写死 5 项 / outfit 侧动态聚合；main 侧简单返回 / outfit 侧合并覆盖；**且 storage key 不同**。
  - **裁定：改 outfit 侧名**（`loadOutfitPromptCategories` / `loadOutfitPromptPresets`），两侧各加互指注释。
  - **不动 storage key**（合一是产品决策，另立单）；**不开豁免口子**（豁免机制一旦存在，迟早被用来掩盖真重复）。
- **禁止修改文件清单**：G 全部 + 任何 `*.css` + 提示词/默认库数据
  ⚠️ **（2026-10-02 修正）**：原写法「`src/main.jsx`（本单只改 outfit 侧）」与裁定「两侧各加互指注释」**自相矛盾**。
  **正确口径**：**main.jsx 允许加注释行，禁止改逻辑**；搬运动作只在 outfit 侧。⇒ 未完成的 main 侧注释见 **V11-RF-040b**。
- **验收条件**：
  1. `frontend-duplication-check` 的 `duplicateCount` **5 → 3**（这两条从 duplicates 消失），`regressions` 为空；
  2. 改名后 **outfit 侧调用点全部同步**（grep 新名 == grep 旧名的调用点数量）；
  3. **零行为变化**：不改任何兜底数据、不改合并策略、不改 storage key（可用 `--only prompt` 2/2 佐证）；
  4. `vite build` 通过；ESLint 无新增 error。
- **自测校验点**：
  - `node scripts/verify/frontend-duplication-check.mjs --update` 划账后复跑 → `duplicateCount:3`
  - `node scripts/verify/run-all.mjs --only prompt` → 2/2
  - `node_modules/.bin/vite build` 通过

---

### V11-RF-041 · 刀 7：`diagnosticImageSourceType`

- **任务类型**：【结构搬运 · 极小区间】
- **目标文件**：`src/main.jsx`、`src/outfit-workflow.jsx`（同名函数各一份）
- **前置依赖**：无 ｜ **标记**：🟢 可并行
- **开工前必做（§0.9 第 17 条）**：`diff` 两处实现，判三类：
  - **字节一致** ⇒ 直接抽到 `src/shared/`（沿用刀 4 做法：建共享模块 + 两处「删定义 + 加 import」）
  - **语义等价文本不同** ⇒ 抽 + 在 commit 写明取哪版及理由
  - **已分叉** ⇒ **停手报统筹**，出对照表（照 §0.9 第 17/19 条裁决原则：放宽 > 收窄、断言优先于多数派、补全方向优先）
- **禁止修改文件清单**：G 全部 + `scripts/verify/**`（不得为让门禁变绿而改判据或基线）+ 诊断文案（若两侧文案不同，按「断言优先」裁定后再改）
- **验收条件**：
  1. 若判定可搬：`duplicateCount` 相应下降、`regressions` 空、`vite build` 通过、对照组脚本 0 失败；
  2. 若判定分叉：产出对照表交回统筹，**本单改判为「待裁决」并停止代码改动**；
  3. 调用点零改动（除非「补齐参数」类必需，且必须在 commit 写明）。
- **自测校验点**：同 RF-042（共用一套）。

---

### V11-RF-042 · 刀 6 上半：`referenceSource`

- **任务类型**：【结构搬运 · 极小区间】
- **目标文件**：`src/main.jsx`、`src/outfit-workflow.jsx`
- **前置依赖**：无 ｜ **标记**：🟢 可并行（与 RF-041 同批，但**不得同一 commit**）
- **开工前必做**：同上三类判定。
- **预授权规则（统筹已给）**：**超集 ⇒ 统一到超集**；**互不包含 / UI 差异 ⇒ 停手报人**；**文案分歧 ⇒ 取最泛化且断言优先**。
- **禁止修改文件清单**：G 全部 + `scripts/verify/**` + 任何 `*.css`
- **验收条件**：与 RF-041 同构（可搬则搬；分叉则只交对照表）。
- **自测校验点**：
  - `node scripts/verify/frontend-duplication-check.mjs` → 判定字段核对
  - 对照组脚本（旧实现抄进 `tmp/`）：≥ 30 组入参 × 每个函数，0 失败
  - `vite build` 通过

---

### V11-RF-044 · **只读定位**：本地详情链路的底图取值点（已知缺陷③ 的前置单）

- **任务类型**：【只读审计 · **不改任何代码**】
- **目标**：定位「本地详情（local-detail）」链路里**取底图**的所有代码点，与共享规则 `resolveLocalEditBaseFile` 比对，确认是否存在漏走共享规则的点。
- **🔴 事实澄清（开工前必读）**：仓库里**不存在**名为 `LocalDetailPanel` 的符号（全仓 grep 0 命中）。
  与之相关的是 `src/outfit-workflow.jsx` 的 `isLocalDetailPageName`（:1066）、`isLocalDetailWorkflow`（:6705）等分支。
  已知的 `resolveLocalEditBaseFile` 使用点共 5 处：`main.jsx:1045`、`outfit-workflow.jsx:3246 / 3263 / 5012 / 9350`。
- **前置依赖**：无 ｜ **标记**：🟢 可并行（**只读**）
- **交付物**：
  1. 一张表：本地详情链路里**每一处**「取原始图/底图」的代码点（文件:行号 + 当前取值表达式 + 是否走了 `resolveLocalEditBaseFile`）；
  2. 逐条标注：**漏走 / 已走 / 不适用（并说明为什么不适用）**；
  3. 对每条「漏走」给出**风险评估**：是否会导致「编辑的是缩略图而非原图」这类用户可见后果。
- **禁止修改文件清单**：**本单禁止修改任何文件**（包括 `.md`）。
- **验收条件**：表格覆盖 `resolveLocalEditBaseFile` 的 5 个已知点 + 至少 3 个 local-detail 分支内的取值点；每条「已走/不适用」都有可复核的理由（不许空口断言）。
- **自测校验点**：`grep -c "isLocalDetailWorkflow\|isLocalDetailPageName" src/outfit-workflow.jsx` 先量总数再逐条看（§0.9 第 14 条：不许用 `head` 截断下全称结论）。

---

---

## 3.1 批次 A+ · 由 C 批报告催生的新工单

### V11-RF-045 · 🔴 真 bug：undo/redo 陈旧闭包把旧 `tool`/`overlayOpacity` 写回项目存档

- **任务类型**：【bug 修复】（**独立 commit，禁止与任何搬运动作混交**）
- **目标文件**：`src/image-editor.jsx`（`:651` 的键盘 effect 依赖数组；因果链涉及 `:348` `scheduleProjectSave`、`:392` `restoreSnapshot`、`:409` `undo`）
- **前置依赖**：无 ｜ **标记**：🔴 **优先**（唯一确认的真 bug）
- **已确认的因果链（统筹实测，不需重复论证）**：
  键盘 effect 依赖数组为 `[transform, canvasSize.width, canvasSize.height]`，**缺 `undo`/`redo`**
  ⇒ 切换工具（只触发 `setTool`，`transform` 不变）后**effect 不重注册**，监听器里仍是旧版 `undo`
  ⇒ `undo → restoreSnapshot → scheduleProjectSave`
  ⇒ `scheduleProjectSave` 的 `setTimeout(…, 450)` 闭包写入 `tool` / `overlayOpacity` / `brush` / `zoom` / `differenceMode`（`:358-375`）
  ⇒ **把切换工具前的旧值写回 `EDITOR_PROJECT_KEY` 存档**。
- **开工前必做**：**先出修法方案再动手**（本单不给实现）。候选：① 用 ref 转发最新 `undo`/`redo`；② 把 `undo`/`redo` 包 `useCallback` 后入依赖；③ 把 `scheduleProjectSave` 改为读取 ref 而非闭包。
  **裁决口径**：**不许为消除告警而机械补依赖**（补了会让 effect 每次渲染重注册监听器）；**优先选对现有调用点零改动的方案**；若必须引入 `useCallback`（全仓当前 0 个），**必须在 commit 写明这是首个引入点并说明影响面**。
- **禁止修改文件清单**：G 全部 + `scripts/verify/**` + 存档字段结构（**不许增删 `editorSet` 的字段**）
- **验收条件**：
  1. 复现脚本/手工用例：切换工具 → 立即 Ctrl+Z → 等待 500ms → 读 `EDITOR_PROJECT_KEY`，`tool` 必须是**切换后**的值（修复前为旧值）；
  2. `eslint src/image-editor.jsx` 的这条 `exhaustive-deps` **消失**（或存在且带写明理由的豁免注释）；
  3. lint 棘轮无新增；`vite build` 通过；`run-all` 无新增失败类别。
- **自测校验点**：`node node_modules/eslint/bin/eslint.js src/image-editor.jsx` → 0 warning；
  真机冒烟 **【必须】**：打开本地编辑 → 画几笔 → 切换工具（画笔↔橡皮）→ Ctrl+Z 撤销 → 关闭再打开编辑器 → **工具与叠加透明度应与撤销前一致，不得回退**。

> **统筹裁决（据审计表，2026-10-02）**：审计表结论"互不包含、4 处阻断项"。
> 🔑 关键实测：**`main` 侧 4 个调用点 vs `outfit` 侧 1 个调用点**；`CachedImage` 定义在 `main.jsx:1126`、
> 其唯一外部依赖 `emitClientDiagnosticEvent` **已在 `src/api/client.js`**（shared 层）、
> `src/shared/ui/` **已存在**（ChannelPicker / Modal）⇒ **抽组件路径通畅，现在就能收口**。
> **统一方向：以 main 版为基底（真超集 3 处），补 outfit 独有的 key 兜底 ⇒ 对 main 零收窄。**
> 拆两刀：**RF-043-1 先抽 `CachedImage`**（纯搬运，可独立验证）→ **RF-043-2 再抽 `ReferenceThumbTray`**（需改 outfit 侧 1 个调用点）。
> ⚠️ 两刀的共享位必须是 `src/shared/ui/**`，**不许 `outfit` 从 `main.jsx` import**（会造出两个巨石互相依赖）。
>
> ✅ **RF-043-1 已完成**（逐字一致 27/27、build 通过、ESLint errors=0、state-singleton 无新增报红、真机 7 张图正常渲染）。
> 🆕 **统筹补充授权（基线例外，就地划账）**：新增共享组件使两条基线机械报红，**实测确认为记账位移、非新增债务**：
> · 019：`scopeDrift` = 文件数 43 → 44（新增共享组件进视野，与刀 4/刀 5 同款）⇒ `--update` 重建，**`ReferenceThumbTray` 必须保留在基线内**
> · lint：`src/main.jsx|react-hooks/exhaustive-deps` **8 → 7**，新增 `src/shared/ui/cached-image.jsx|react-hooks/exhaustive-deps` = 1
>   ⇒ 同一个 warning 换了位置，**totals 19 → 19 不变**
> 🔴 **硬判据：更新后 lint `totals` 必须仍为 19。若变了 ⇒ 是新引入的问题，停手报告，不许记账。**
> （043-2 新增 `reference-thumb-tray.jsx` 会触发同样情形，同样适用本条授权与判据。）

- **任务类型**：【先出审计表 → 等裁决 → 再统一】
- **目标文件**：`src/main.jsx`、`src/outfit-workflow.jsx` 各一份
- **前置依赖**：无 ｜ **标记**：🔴（**分叉项，禁止擅自统一**）
- **第一步（本单只做这个）**：产出**分叉审计表** —— 两版的 props 签名 / 默认值 / 渲染结构 / 事件行为 / 调用点（含 `max` 传参差异）逐项对照，并标注差异是「超集/子集」还是「互不包含」。
- **预授权规则**：超集 ⇒ 统一到超集；互不包含或 UI 差异 ⇒ **停手报统筹**；文案分歧 ⇒ 取最泛化且**断言优先**。
- **禁止修改文件清单**：G 全部 + 任何 `*.css` + `scripts/verify/**`
- **验收条件**：审计表交回并经统筹裁决后才允许进入代码改动阶段；`duplicateCount` 目标 **1 → 0**。

### V11-RF-046 · 给 019 加一档「改名克隆」（纳组件内函数，**只报不记账**）

- **任务类型**：【门禁增强 · 只读报告】｜**标记**：🟢
- **需求来源**：RF-032 实测 **53/62 组克隆是组件内缩进函数**，019 一条也看不见。
- **硬性约束**：
  1. **只报不记账** —— 新档**不参与 `ok` 判定**、不写进 `duplicateCount`、不影响棘轮，纯 advisory 输出；
  2. **必须先验证能抓到 §5 里那 4 个活样本**（抓不到就别上）；
  3. **必须在报告里写明"L1 相同 ≠ 语义等价"的警告**（`loadPromptCategories` 是实证反例），防止后人拿它当"可合并"依据；
  4. 输出的**基数（扫描文件数/函数数/命中数）要写进报告头**，便于下次比对。
- **禁止修改文件清单**：G 全部；**不得改变 019 现有判定字段的语义**。
- **验收条件**：负向验证（人工造一个改名克隆 ⇒ 新档要点名它，且 `ok`/`duplicateCount` 不变）。

---

### V11-RF-040b · 补 main 侧互指注释（工单矛盾的收口）

- **任务类型**：【纯注释 · 零逻辑】｜**标记**：🟢 随时可做
- **背景**：RF-040 裁定「两侧各加互指注释」，但禁止清单写了「`main.jsx` 禁改」⇒ 执行者按禁止清单执行，main 侧注释未加。**统筹确认：这是工单写错，执行者判断正确。**
- **目标文件**：`src/main.jsx` 的两个 loader 定义处（`loadPromptCategories` / `loadPromptPresets`）各加**一行**注释，指向 outfit 侧的新名 `loadOutfitPromptCategories` / `loadOutfitPromptPresets`，并说明「同名不同义，勿合并」。
- **禁止修改文件清单**：G 全部 + **`main.jsx` 除这两处注释外的任何内容**
- **验收条件**：diff 只有 2 行新增注释；`vite build` 通过；ESLint 计数不变。

### V11-RF-047 · 🔴 裁剪回流底图漏走 `resolveLocalEditBaseFile`（RF-044 挖出的真漏走）

- **任务类型**：【bug 修复】｜**标记**：🔴（不依赖任何单；**与 RF-043 的代码阶段都碰 `outfit-workflow.jsx` ⇒ 不得同一窗口并行**）
- **位置**：`src/outfit-workflow.jsx:9466`
- **已确认的因果（RF-044 只读定位，统筹采纳）**：
  `cropRect` / `sourceWidth` 由 `processImageFileWithMeta(item.originalFile)`（`:4904` + `:3718`）**按原图算**，
  但底图取 `imageItemUploadFile`（= `item.file`，**已被裁剪结果替换**，`:4907` + `:8250`）
  ⇒ **画布 = 裁剪图尺寸、`cropRect` 被 `constrainLocalEditRect`（`:3420`）夹断**；
  而事件文案 `:8262` 明写「**回流到大图**」⇒ **名实不符，是 bug 不是设计**。
- **禁止修改文件清单**：G 全部 + `src/shared/local-edit-geometry.js`（规则源不许动）+ 裁剪算法本身（`:3718`/`:4904` 的计算逻辑不许改）
- **验收条件**：
  1. 底图改为走 `resolveLocalEditBaseFile`（与原图坐标同源）；
  2. 对照组脚本：以「原图尺寸 / 裁剪后尺寸 / cropRect 越界」等 ≥ 20 组入参比对改动前后，差异**逐条归因**；
  3. `vite build` 通过；lint 棘轮无新增；
  4. **真机冒烟【必须】**：上传大图 → 裁剪 → 触发「回流到大图」→ 确认画布尺寸为**原图**、选区位置与裁剪前一致、不被夹断。
- **不在本单处理**：`outfit:9423`（扩图原图保护）用 `imageItemUploadFile` 但**坐标也按副本算 ⇒ 自洽**，仅输出尺寸降级到副本（≤3072），风险低-中 ⇒ **登记为观察项，不修**（改动会牵动尺寸逻辑，属业务取舍）。

---

## 3.2 🔨 统筹裁决（回应执行者提出的两点）

**① 划账授权 —— 裁决：现在就划。**
- 依据：RF-040/041/042 三条是**真的消失**（`improved` 形式残留会持续污染每份报告，属噪声不是债务）；
  `duplicateCount` 应从旧基线的 5 划到 **1**（`ReferenceThumbTray` 是已知分叉、待裁决，**必须保留在基线里，不得划掉**）。
- **授权执行者跑一次** `node scripts/verify/frontend-duplication-check.mjs --update`，
  并**在 commit 写明「统筹明文授权划账：`improved` 三条入账，`ReferenceThumbTray` 保留」**。
- ⚠️ 基线文件虽在 G 清单内，但 **G 的"禁改"约束的是"执行者擅自改"；经统筹明文授权并写进 commit 的划账是允许的**（本条已同步进 §9.2）。

**② RF-040 的单内矛盾 —— 裁决：执行者判断正确，按禁止清单执行是对的。**
- 冲突时以**禁止清单**为准（它更具体），裁定文字是描述性的 ⇒ 已修正 §3 的禁止清单口径，并开 **V11-RF-040b** 补注释。

---

## 4. 批次 B · 后端 AI 调用族消账（V11-RF-027，四刀串行）

> **🔴 视野告警（RF-027-1 实测证实，统筹确认属实）**：
> 官方 `server-duplication-check` 的视野由 `scripts/verify/lib/server-sources.mjs` 固定为
> `index.js` + `app.js` + `core/**` + `routes/**` + `shared/**` + `prompts/server/**`，
> **不含顶层 `server/*-ai.js`** ⇒ 官方 `duplicateCount` 恒为 0，**对批次 B 无鉴别力**。
> 本节所有 `duplicateCount` 均为**宽口径 63 文件实测值**（`rf027-full-scope-check.mjs`，
> 排除 `static-assets.generated.js` 与 `server/skill-baselines/`）。
> ⇒ 因此 **RF-027-5 必须做**：消完之后把顶层 `server/*-ai.js` 纳入视野，剩余债务**登记进基线在册可见**。

> **背景实测**：`server/` 顶层 9 个 `*-ai.js`（约 3081 行）各自复制一份 AI 调用辅助，
> 新判据 + 全纳 63 文件重测后 **`duplicateCount = 16`**：`asText`×7、`createAbortSignal`×**8**（第 8 处在 `core/http-client.js`，一直在门内、旧判据看不见它）、
> `postChatCompletion`/`readResponse`/`responseContent`/`buildChatBody`/`extractJsonObject`/`safeImagePart`/`fileMeta`/`shouldRetryWithoutJsonFormat`×6、
> `modelName`×5、`compact`×3、`shouldRetryWithoutImages`×3、`buildSkillPayload`/`normalizePlan`/`clamp`×2。
> 🔴 **不许用 `--update` 记账代替抽走** —— 记账是**承认**债务不是**解决**债务（会把它抹平成"永久合法"）。

### V11-RF-027-1 · 第一刀：只做 `createAbortSignal`（8 处 → 1 处） ✅ **已完成（4fc594f）**

- **任务类型**：【结构搬运】｜**标记**：🔴 串行（本刀的目的是**验证后端搬运流水线**）
- **目标文件**：`server/*-ai.js`（7 个）+ `server/billing-gateway.js`；标准实现已在 `server/core/http-client.js`
- **前置依赖**：批次 A 完成
- **禁止修改文件清单**：G 全部 + `server/core/http-client.js`（标准实现不许动）+ 任何提示词/默认参数
- **验收条件**：
  1. `createAbortSignal` 全仓**只剩 1 处定义**（`core/http-client.js`），其余 7 处全部改为 import；
  2. `server-duplication-check`：`ok=true`、`duplicateCount` **16 → 15**、`regressions` 空；
  3. AB-4 沙盒差分：至少 3 组上游端点（正常 / 上游 500 / 缺 KEY）响应体 + HTTP 码一致；
  4. 孤儿 import 机械核查（§0.9 第 7/8 条），ESLint `errors = 0`；
  5. **真机启动一次**（§0.9 第 9 条：这类错唯一兜底是真机）。
- **自测校验点**：`node scripts/verify/run-all.mjs`（失败集合与改前**同类别**）+ `node server/index.js` 打印监听地址 + `/api/health` ok。

### V11-RF-027-2 · 第二刀：只抽「零风险 6 族」✅ **已完成（4ad6461）**

- **任务类型**：【结构搬运】｜**标记**：🔴 串行
- **目标文件**：`server/*-ai.js` → 新建 `server/core/ai-chat-shared.js`
- **范围（**只这 6 族**）**：
  - 字节一致 4 族：`asText`、`clamp`、`responseContent`、`shouldRetryWithoutImages`
  - 语义等价 1 族：`shouldRetryWithoutJsonFormat`（tokenV=1）
  - 纯风格 1 族：`readResponse`（`detail-ai` 的 async/await 版 vs 其余 5 处 `.then()` 版，**语义等价、可无损统一**）
- **前置依赖**：**V11-RF-027-1 已通过** ✅
- **禁止修改文件清单**：G 全部 + `server/core/http-client.js` + 提示词内容 + 任何请求体字段结构
- **验收条件**：
  1. 宽口径 `duplicateCount` **15 → 9**（6 族各归 1 处；`readResponse` 6→1、`asText` 7→1 …）
  2. `regressions=[]`；`import-path-check` violations `[]`；ESLint `errors=0`
  3. 对照组脚本（旧实现抄进 `tmp/` 当基准）+ **mock 上游端到端差分**（见下方裁决 3）
  4. 三类 hunk 齐全（删定义 / 加 import / 清孤儿），孤儿以 ESLint `no-unused-vars` 实测点名为准

### V11-RF-027-2b · 消 `readResponse` ↔ `readTextSafely` 改名克隆（小单）

- **任务类型**：【收口 · 改名克隆】｜**标记**：🔴 串行（紧跟 027-2）
- **由来**：执行者报备「`ai-chat-shared.js` 的 `readResponse` 与 `http-client.js` 的 `readTextSafely` 逻辑等价」。
  **统筹实测确认：两者函数体逐字节相同，只有函数名不同**（典型的改名克隆，属门禁盲区，与 RF-032 同族）。
- **🔑 关键实测**：`readTextSafely` 在 `server/core/http-client.js:24` **已经是 `export`** ⇒ 无需改禁止清单内的 `http-client.js`，**现在就能消**，不必等 RF-027-5。
- **做法**：删掉 `ai-chat-shared.js` 的 `readResponse`，**6 个** `server/*-ai.js` 改为 `import { readTextSafely }` 并改调用点名。
  🔴 **不要做转发壳**（`export { readTextSafely as readResponse }`）—— 那是把重复换个形式留着。
  > ⚠️ 口径修正（执行者实测）：是 **6 个** `* -ai.js`，不是 7 个 —— `detail-middleware.js` 只 import `asText`/`clamp`，从未用 `readResponse`。
- **禁止修改**：`server/core/http-client.js`（它已是标准实现，且已导出，无需动）
- **验收**：全仓 `readResponse` 定义 0 处；ESLint `errors=0`；错误路径差分（复用 027-2 的 `rf027-2-errorpath-snapshot.mjs`）复跑结果不变
- ✅ **已完成** `b5af930`（7 files / +25 −38）：`readResponse` 定义 1→0、调用点 6→0；`readTextSafely` 调用点 4→10；
  宽口径 `duplicateCount` 仍 9（本族不计入）、`regressions=[]`；错误路径 12 case 字节级一致；真机 `/api/health` ok。**无冒烟豁免**

### V11-RF-027-3 · 第三刀：参数化抽取 5 族（先出调用点对照表）

- **任务类型**：【结构搬运 · 需先出对照表】｜**标记**：🔴 串行
- **范围**：`extractJsonObject` / `safeImagePart` / `fileMeta` / `modelName` / `postChatCompletion`
- **统一手法**：**参数化**，不是"选一版压过去"——差异用参数表达，各调用点传自己的值 ⇒ **零用户可见变化**
  - `extractJsonObject(content, { modelLabel })` —— 6 句抛错文案各不同，**已核实 `scripts/verify/**` 0 断言依赖**（仅 `skill-baselines` 快照重复命中），各调用点传自己的模型名
  - `safeImagePart(file, { detail })` —— `"low"`×3 vs `"high"`×3 是**业务差异**；取**超集**（含 `detail-ai` 的 `mimetype` 兜底）
  - `fileMeta(file, { index, role, fallback })` —— 4 种签名 + 不同默认名；取**超集**（含 quality 版空保护）
  - `modelName(source, paths)` —— 各入口读不同字段链，传路径
  - `postChatCompletion` —— 形参对齐 + 返回取**超集**（`detail-ai` 多返 `url`）
- **前置依赖**：**V11-RF-027-2 + 027-2b 通过**
- **硬要求**：**先交调用点对照表**（每族：调用点数 / 各传入什么 / 参数化后传什么 / 是否改变行为），统筹确认后才动代码
- **禁止**：改动任何一处现有行为（temperature / detail / 默认名 / 文案 / 返回结构）

#### 🔴 统筹裁决（2026-10-02 · 对照表已交，据此施工）

**① 5 族参数化签名照批，但 `fileMeta` 有 1 处会真改行为，执行者对照表判错了**

`quick-prompt-ai.js:112` 是 `references: files.map(fileMeta)` —— **把函数当回调裸传**。
`Array.map` 回调的实参是 `(element, index, array)`，所以：

| | 现在 | 改成具名对象 `fileMeta(file, { index, role, fallback })` 后 |
|---|---|---|
| 第 2 参收到 | 数字 `index`（quick 版正好用） | **数字 `index`** ⇒ 解构 `{ index }` 得到 `undefined` |
| 后果 | `reference-${index+1}` 正常 | **`reference-NaN`** ❌ |

⇒ **必须显式改这一处调用点**为 `files.map((file, index) => fileMeta(file, { index }))`。
这不是"改逻辑"，是**补齐参数**（与 RF-031 的显式补 `"image/png"` 同类）。其余 11 个调用点均显式传参，不受影响。

**② `fileMeta` 的对照组不能只测"不抛错" —— 必须逐点比对 `name` 实际产出字符串**

5 种 `name` 兜底规则各不相同（quick `reference-N` / detail·reference `${role}-N` / quality `fallback` 默认 `"image"` / master-fit `"clothing-master-image"` / pose `"model-image"`）。
统一后必须**用原来 12 个调用点各自的入参，逐条比对产出对象的每个字段值**（含缺省字段是否被 `JSON.stringify` 省略）。
⇒ 对照组 ≥ 12 调用点 × 多个入参形态；**只要有一条 `name` 变了就是失败，不许归因为"等价"**。

**③ `postChatCompletion`：批方案 A（body 构造上移到调用点），但【必须连带抽走】**

统筹实测支持方案 A 的三条依据：
1. `postChatCompletion` 内部**只有 fetch + readTextSafely**，**没有重试逻辑** —— 重试在调用方的 `mode` 四重循环里（见 `quick-prompt-ai.js:229-254`），每次循环本来就重建 body ⇒ **上移不破坏重试路径**
2. `buildChatBody` 在**每个文件里只有 1 个调用点**（就在 `postChatCompletion` 内）⇒ 上移是 1:1 平移，无遗漏
3. `url` = `${baseUrl}/chat/completions` 是常量 ⇒ 统一补 `url` 属**补全方向**，不改判断分支

🔴 **但方案 A 的隐藏收益必须兑现**：body 构造上移后，6 份 `postChatCompletion` 函数体**变成字节一致**
⇒ **必须一并抽到 `server/core/ai-chat-shared.js`（定义 6 → 1）**。
**只做 A 不抽走 ⇒ `duplicateCount` 不降，等于白做一半。**
顺带消掉 `includeImage` / `includeImages` 的单复数不一致。

**④ RF-027-4 现在可与 027-3 同窗口串行（方案 A 已解耦），但【不许拆给两个窗口】**
两者都动 `server/*-ai.js`，同窗口串行即可；跨窗口并发会导致结果不可归因。

**⑤ 踩坑固化**：改**已存在的 CRLF 行**时若脚本保留了 CRLF，会触发 `git diff --check` 的 trailing whitespace 报错。
⇒ 改动行一律统一为 **LF**；提交前跑一次 `git diff --check`。

### V11-RF-027-4 · 第四刀：4 族判定「同名不同义」→ 改名不合并

- **任务类型**：【改名 · 消重复计数】｜**标记**：🔴 串行
- **范围**：`buildSkillPayload` / `normalizePlan` / `buildChatBody` / `compact`
- **裁定**：这 4 族**骨架相似但承载各自业务差异，合并即毁差异** ⇒ 按 RF-040 先例 **改名不合并**：
  - `buildSkillPayload` → `buildQuickSkillPayload` / `buildReferenceSkillPayload`（两套 skill 内容完全不同）
  - `normalizePlan` → `normalizeQuickPlan` / `normalizeReferencePlan`（fallback 源不同、签名差第三参）
  - `buildChatBody` → 各文件加场景前缀（temperature 0.2/0.18/0.15/0.1 + system 提示词与 content 构造器各异）
  - `compact` → `compactPreserveNewlines`（master-fit/quality 保换行）/ `compactSingleLine`（pose 压单行）
- **前置依赖**：**V11-RF-027-3 通过**
- **验收**：改名后该 4 族**不再被任何判据判为重复**；改名纯机械（ESLint `no-undef` 反证无漏改）；`duplicateCount` 归零

> **✅ 027-3 / 027-4 已交付（`84ae66c` / `28b3b35`），统筹复核实测如下**
>
> | 项 | 统筹实测 | 裁决 |
> | --- | --- | --- |
> | 027-3 规模 | 7 文件 +176/−438；宽口径 `duplicateCount` 9→4；`regressions []` | ✅ 收 |
> | **口径修正：`modelName` 实为 6 份** | `detail-ai.js` 那份原名 `detailModel`（**改名克隆**，按名扫描漏掉）。实测已收口：`grep -rn "detailModel" server/` = **0** | ✅ **认可**，无需回退。理由：改名克隆正是本批次要消的对象（027-2b 先例：真删真改、不许转发壳）。📌 **新发现克隆**，登记进 §0.5 存量清单 |
> | **`pose` 的 `mode.includeImage` 保留单数** | 实测 `outfit-pose-ai.js:196` 位于 `attempts.push({…})` **内** ⇒ 确实流进响应体 | ✅ **认可，执行者判断正确**。改名会改 API 响应结构、破坏字节一致 ⇒ 属**有意保留**，027-5 纳视野时**不得误消**。⚠️ 它是**字段名不是顶层函数** ⇒ 函数级门禁永远看不见（RF-032 已坐实的字段级盲区），登记即可，不处理 |
> | **有意放宽 1 处**：`fileMeta` 空保护 | quality 版的 `file?.` 保护提升到共享实现；旧的非 quality 实现遇 `null` 会抛 | ✅ **认可**（放宽方向，符合 §4 原则 1）。🔴 **需补**：加一组 `fileMeta(null, {…})` 对照用例并说明哪个调用点理论上可能传 `null` —— 放宽会让"抛错"变"静默兜底"，静默失败最难查，必须留证 |
> | 027-4 规模 | 7 文件 +40/−40 纯改名，函数体一字未动 | ✅ 收 |
> | "旧名清零"核验 | 统筹用时**误报** 3 处（`buildChatBody(`×2、`function compact(`×1），追查后**全部落在 `server/skill-baselines/` 归档快照** | ✅ 报告准确。📌 **纪律补录**：凡「旧名清零」类核验，报告必须写明「**排除 `skill-baselines/` 后为 0**」，否则下一个人会重复这场虚惊 |
>
> 🔴 **工单缺陷（统筹认领，非执行者责任）：027-4 的验收写「`duplicateCount` 归零」，但纯改名做不到。**
> 与 RF-040 那次同类（裁定与判据自相矛盾）⇒ 开 **RF-027-4b** 补做。

### V11-RF-027-4b · 🆕 收口 `compactPreserveNewlines`（改名后仍判重的最后 1 条）

- **任务类型**：【结构搬运】｜**标记**：🔴 串行（**必须在 RF-027-5 之前**）
- **统筹实测依据**：`outfit-master-fit-ai.js:17` 与 `outfit-quality-ai.js:9` 两份**逐字节一致**，
  连默认参数 `limit = 1200` 也一致 ⇒ **真·字节一致，无分叉**（§0 三类判定的第一类，可直接搬）
- **落点**：`server/core/ai-chat-shared.js`。
  🔑 **零漂移依据**：`master-fit:10` 与 `quality:2` **已经 import 了 `ai-chat-shared.js`**
  ⇒ 只需在既有 import 行加一项，**不新建文件、不新增 import 行** ⇒ 无 `scopeDrift` 类风险
- **动作**：删两份定义 → import → 调用点不变（3 处 + 6 处）
- **验收**：宽口径 `duplicateCount` **4 → 1 → 0**；`regressions []`；ESLint `no-undef` 反证无漏改；
  错误/重试 12 case + 正常路径 6 入口与 027-4 基线**字节一致**
- 🔴 **顺序硬约束（为什么不能留到 027-5）**：027-5 的职责是「把**消完之后剩下的真债务**登记进基线」。
  若把这条**能消的**留到 027-5，等于让基线记一条**假债**——把可消的当债务登记，就是掩盖（违反 §0.9）。
  ⇒ **先 4b 消干净，再让 027-5 面对真实剩余**。

### V11-RF-027-5 · 第五刀：把顶层 `server/*-ai.js` 纳入门禁视野

- **任务类型**：【门禁】｜**标记**：🔴 串行（**必须最后做，且在 027-4b 之后**）
- **目标文件**：`scripts/verify/lib/server-sources.mjs`
- **动作**：把顶层手写 `server/*.js`（排除 `static-assets.generated.js`、`server/skill-baselines/`）纳入视野
- **验收**：剩余债务**登记进 server 基线在册可见**，`regressions` 保持 `[]`（只拦新增）；
  报告必须写明"这是消完之后剩下的真债务，不是被抹平的"
- **理由**：不纳视野 ⇒ 官方门禁恒绿 = 该类重复永久隐身（§0.9 第 17 条）
- 🔴 **统筹明文授权（G 清单例外，凭本条执行）**：本单**允许** `--update` 改写
  `scripts/verify/server-duplication-baseline.json`，用于**登记纳视野后暴露的剩余债务**。
  授权边界（越界即违规）：
  1. 只允许登记**经三类判定确认为「已分叉 / 不可消」**的条目，**已分叉的必须停手报统筹，不得自行登记**；
  2. **不得**登记任何「字节一致 / 语义等价」的条目（那些是要消的债，不是要记的账）；
  3. `regressions` 必须保持 `[]`；
  4. commit message **必须逐条列出**新增登记的条目名 + 判定理由，并写明"统筹授权，见 RF-027-5"。

---

## 5. 批次 C · 只读审计（可与 A/B 并行，交给另一个执行者）

### V11-RF-032 · 改名克隆 + 同名不同义的只读测量 ✅ **已完成（2026-10-02，只读，无提交）**

> **交回结论（已验收）**：
> - 手段：`@babel/parser` + 自写 tokenizer 的**两级归一化哈希**；
> - **4 个活样本全部抓到**，判定方向与文档一致（含 `videoPromptPlaceholder` 被正确判为「文案分叉」而非克隆）⇒ **工具有效性已验证**（§5 验收条件达成）；
> - 实测：**62 组**改名/结构克隆（**51 等价 / 11 需人工确认**）；块级 **2570 行 / 56 块 / 最长 130 行**；
> - 🔴 **其中 53 组是组件内缩进函数 ⇒ 019 门禁一条也看不见**（同族盲区第四次坐实）；
> - 🔴 **实证一个工具盲区**：`loadPromptCategories` 两侧 **L1（一级归一化）完全相同**但**兜底常量不同源**（main 写死 5 项 vs outfit 动态聚合）⇒ **L1 相同 ≠ 语义等价**，任何"哈希相等就合并"的自动化都会在这里翻车。
>
> **落账**：11 组「需人工确认」进入 §6 阶段 D 的开工前置清单；**本单关闭，不再测量**。
>
> ⚠️ **快照纪律**：本测量基于 `088ff5b`，期间并发窗口推进到 `24cfa45` ⇒ **后续引用本报告的组号/行号必须重算**。

- **任务类型**：【只读测量 · **不改代码、不改基线、不入门禁**】｜**标记**：🟢
- **目标**：`src/**` 全量。用离线克隆检测（`jscpd`）或「归一化 token 哈希 + 8 行滑窗」做只读测量。
- **已发现的活样本（用来验证工具有效性）**：
  - `imageExtension`（main）↔ `imageExtensionFromMime`（outfit）**逻辑逐字节相同、仅名字不同**
  - `durationOptionsForVideoModel`（main）↔ `videoDurationOptions`（outfit）函数体除默认值常量外相同
  - `videoPromptPlaceholder`（main）↔ `quickVideoPromptPlaceholder`（outfit）**已分叉**（名字与文案都不同，不是克隆）
  - 块级克隆量级参考：**约 2586 行（12%）**、62 个连续块、最长 130 行；典型内容 = 选框缩放 130 行 / resize 手柄 40 行 / 蒙版笔刷 JSX 47 行 / 选框光标 JSX 29 行
- **⚠️ 先查 §0.5 已完成清单**：`scripts/dev/block-clone-lines.mjs` 与 `cycle-scan.mjs` **已存在且已跑过**（块级克隆约 2586 行 / 62 块、循环依赖 0），**直接复用并在此基础上加深，不要从零重写**。
- **交付物**：① 改名克隆清单（含文件:行号 + 相似度 + 是否真等价）② 块级克隆按「最长 20 块」的内容摘要与归属功能 ③ **建议哪些进阶段 D 的拆分范围**
- **验收条件**：必须报告**判据**（工具名 + 参数 + 扫描文件数 + 阈值）；必须先用上面 4 个活样本**验证工具真能抓到**（抓不到说明工具/参数无效，需换手段）。

### V11-RF-033 · 19 条 `react-hooks/exhaustive-deps` 三类判定 ✅ **已完成（2026-10-02，只读，无提交）**

> **交回结论（统筹已抽样复核）**：**真 bug 仅 1 条 / 有意空依赖 12 条 / 需 useCallback 重构 6 条**（1+12+6 = 19 ✅ 与存量吻合）。
> - 🔴 **唯一的真 bug** → 已立 **V11-RF-045**（`src/image-editor.jsx:651`，见 §3）。
>   **统筹已独立复核因果链**：键盘 effect 依赖数组缺 `undo`/`redo` ⇒ 抓到旧版 `undo` ⇒
>   `undo → restoreSnapshot → scheduleProjectSave`，而 `scheduleProjectSave` 的 `setTimeout(…, 450)` 闭包里
>   写入 `tool` / `overlayOpacity` / `brush` / `zoom` / `differenceMode`（实测 `:358-375`）
>   ⇒ **把切换工具之前的旧值写回项目存档**。**判定成立。**
> - 12 条「有意空依赖」每条都给了反证（如 `diagnostic` 是内联对象 ⇒ 补了会重复 fetch；`refreshSaveDirectory` ⇒ 补了会无限循环）⇒ **维持空依赖，加豁免注释**即可（归入 V11-RF-046 后续或按条加注释）。
> - 6 条「需 useCallback 重构」⇒ **不单独修**，随 §6 阶段 D 的组件拆分自然解决。
> - ✅ 执行者**独立复核确认**了文档推翻的那条（`outfit:6988`，`modelImages` 确系 `useState(() => initialOutfitPage.modelImages || [])` 同步读档）⇒ 该条从"疑似 bug"永久除名。
>
> ⚠️ **行号已漂移**：本报告基于 `088ff5b`，而 041/042 之后 `outfit-workflow.jsx` 行号已变 ⇒
> **12 条有意空依赖的行号必须以 `24cfa45` 重算一次**（或改用函数名锚定）后才可作为施工依据。

- **任务类型**：【只读审计 · **不改代码**】｜**标记**：🟢
- **目标**：`src/main.jsx`（8 条）、`src/outfit-workflow.jsx`（10 条）、`src/image-editor.jsx`（1 条）
- **🔴 必读的事实**：lint 只报「依赖不一致」，**不报该往哪个方向修**。逐条必须判三类，不许机械补依赖：
  1. **真 bug**（确实读了旧值，会静默出错）→ 记录 + 建议修法
  2. **有意空依赖**（只跑一次是设计意图）→ 建议加豁免注释或 `// eslint-disable-next-line` 并写明意图
  3. **需重构才能修**（要引 `useCallback`，而全仓 `useCallback` = 0）→ 归入阶段 D
- **🔴 反例警示（实测已推翻一例）**：`src/outfit-workflow.jsx:6951`（lint 报在 6975）常被举为「实锤 bug」，但实测
  `modelImages` 来自 `useState(readOutfitPages)` 的**同步读档**（`:6611` lazy initializer），挂载时**不是空数组**而是整页快照，
  该 effect 的空依赖是**有意**的（挂载时 hydrate 一次历史，且有 `historyHydratingRef`/`cancelled` 守卫）⇒ **机械补依赖反而会变成「每次换图都重新合并历史」**。
- **⚠️ 先查 §0.5.6**：`outfit-workflow.jsx:6951` 已被实测推翻（有意的同步读档），**判定表里直接按"有意空依赖"归类并注明依据，不要重新论证**。
- **交付物**：19 行判定表（文件:行号 / 类别 / 依据 / 建议 / 风险）。
- **验收条件**：每条判定必须给出**可复核依据**（读了哪个 state、该 state 的初始化方式、effect 是否有 ref 守卫）；不许凭告警文本直接归类。

---

## 6. 批次 D · 阶段 C（拆分两个巨石）—— **已具备开工条件**

### 6.0 🔨 统筹裁决（阶段 D 开工前必须先执行这一条）

**裁决项：outfit 侧蒙版 init 缺 main 侧的 `cancelled` 卸载守卫**
**裁定：统一到 main 侧「带卸载守卫」的版本。**
- 依据：本项目既有裁决原则 —— **补全方向优先、放宽优先于收窄**。加 `cancelled` 守卫只在组件卸载后阻止
  `setState`，**不改变正常路径的任何行为**，属纯补全；反之删掉 main 侧的守卫则是**收窄**，会让
  「卸载后异步回调仍写 state」的风险重新出现（高风险方向）。
- 要求：commit 必须写明「**有意新增卸载守卫**」；并在两侧各加一行互指注释。
- 证据位置（**统筹按 `bbf4586` 重新实测，旧行号已漂**）：
  - `src/main.jsx:1836-1856` —— **有** `cancelled` 守卫（含 `maskImage.onload = null` 清理）
  - `src/outfit-workflow.jsx:5019-5041` —— 同逻辑（`maskInitRef` / `savedEdit?.maskDataUrl` / `maskImage.src`），
    但该 effect 内 **无 `cancelled`**（全仓 `cancelled` 仅出现在 2478 / 6895 / 6921）⇒ **确认缺守卫**

### 6.1 四批推进（按执行者建议，统筹采纳）

| 顺序 | 工单 | 内容 | 标记 |
| --- | --- | --- | --- |
| D-0 🆕 | **V11-RF-048** | 🆕 **`PreparedResultImage`（outfit:2470）↔ `CachedImage`（shared/ui）改名克隆** | 🔴 **最先做** |
| D-1 | **V11-RF-050** | 局部编辑 4 块 → `src/features/local-edit/`：选框缩放 130 行 / resize 手柄 40 行 / 蒙版笔刷 JSX 47 行 / 选框光标 JSX 29 行（**边界已实测两处逐行相同**） | 🔴 依赖 D-0，**含 6.0 裁决的守卫统一** |
| D-2 | **V11-RF-051** | 提示词库 + 参考图相关块（**先消化 RF-032 的 11 组「需人工确认」**） | 🔴 依赖 D-1 |
| D-3 | **V11-RF-052** | 按 12 个工作流切 outfit 的配置与面板 | 🔴 依赖 D-2 |
| D-4 | **V11-RF-053** | 剩余任务列表 / 上传区（引用面最广，放最后） | 🔴 依赖 D-3 |

**每批通用验收**：整块搬出 + 改 import（**不许改逻辑**）；`vite build` 必过；
对照组脚本（旧实现抄进 `tmp/`）0 失败；真机冒烟**必做**（局部编辑、提示词库、参考图都有可达 UI）；
`019` 判定字段不恶化；**每批独立 commit**。

**顺序铁律**：**先消重复、后搬目录**（反了 = 把重复固化进新目录）。

### 6.2 V11-RF-048 · `PreparedResultImage` ↔ `CachedImage` 改名克隆（D-0，最先做）

- **任务类型**：【消改名克隆 · 中】｜**标记**：🔴
- **🆕 统筹实测发现（2026-10-02 · `bbf4586`）**：RF-043-1 把 `CachedImage` 抽到 `src/shared/ui/cached-image.jsx` 之后，
  `outfit-workflow.jsx` 里还留着一份**名字不同、功能同构**的实现：

  | | `cached-image.jsx`（shared） | `outfit-workflow.jsx` |
  | --- | --- | --- |
  | 组件 | `CachedImage`（main.jsx 内 9–10 处） | `PreparedResultImage`（**定义 :2470**，使用点 **:10238 / :11252**） |
  | 预加载 | `preloadDisplayImageUrl(url, timeoutMs = 20000)` | `preloadImageUrl(url, timeoutMs = 8000)`（**:2393**） |
  | 卸载守卫 | 有 | 有（:2478 / :2521） |
  | 缓存 | 有（`DISPLAY_IMAGE_CACHE`） | **无** |
  | 埋点 | 有 | 有（`client-result-display-ready`，`emitDisplayReady`） |

  ⚠️ 默认超时 8000 vs 20000 看似分叉，但 outfit 唯一调用点传的是 `RESULT_IMAGE_PRELOAD_TIMEOUT_MS`（**:241 = 20000**）
  ⇒ **实际行为一致，不是真分叉**。
- **裁定**：**先出对照表再定是否统一**（差异是「缓存有无」与「埋点字段」，若统一需取超集，不是纯搬运）。
  判据同 RF-043：**放宽 > 收窄** —— 若统一，outfit 侧应**获得缓存**（放宽方向）；
  不得让 main 侧丢缓存或丢埋点。
- **为什么排 D-0**：它是**重复**。按「先消重复、后搬目录」必须先消，否则 D-1 搬局部编辑时会把这份重复固化进新目录。
- **交付**：① 两版逐项对照表（props / 缓存 / 埋点字段 / 超时 / 守卫）② 是否可统一的建议 ③ 若可统一则实施（独立 commit）

### 6.3 V11-RF-050 · 局部编辑 4 块边界（**统筹按 `bbf4586` 实测，勿用旧行号**）

| 块 | 长度 | `main.jsx` | `outfit-workflow.jsx` | 内容 |
| --- | --- | --- | --- | --- |
| ① 选框缩放 | **130 行** | `:2065~` | `:5212~` | `scaleRectLocked` / `CROP_MIN_PIXEL_SIZE` / 中心缩放 |
| ② resize 手柄 | **40 行** | `:2012~` | `:5159~` | `resizeRectFromCenterLocked` / `directionX|Y` / `maxWidth|Height` |
| ③ 蒙版笔刷 JSX | **47 行** | `:2381~` | `:5521~` | `isMaskMode` / `quickLocalBrushTools` / 白笔·黑笔 |
| ④ 选框光标 JSX | 29 行 | 按块①②邻近自行定位 | 同 | 选框光标样式 |

- 另有 `:4650~ ↔ :8584~` **39 行**块（`imageMimeFromSource`，**组件内缩进函数 —— 019 看不见**）⇒ 建议随本批一并评估。
- **当前重复总规模（实测）**：src **25167 行**，块级重复约 **2511 行（11.7%）**；
  两大文件 8627 + 11346 = **19973 行（79.4%）**。

### 6.4 RF-043-2 带来的 outfit 侧 4 处行为变化 —— **统筹裁决：接受**

| # | 变化 | 方向 | 裁决 |
| --- | --- | --- | --- |
| 1 | 过滤加严（多 `!missing && isAllowedReferenceImage`） | 收窄 | **接受** —— 这是「以 main 版为基底」裁定的直接后果；反向（删过滤）会把地址缺失项渲染成坏图 |
| 2 | 数量口径 → `items.length`（原 `Math.max(count, len)`） | 收窄 | **接受** —— `count` 仍驱动空态 / 不可用文案（pill「N 张参考」），不是丢信息 |
| 3 | 右键菜单 `count` 随之变小 | 收窄 | **接受** —— 该参数只用于张数文案，随 #2 一致 |
| 4 | 原生 `<img>` → `CachedImage` | **放宽** | ✅ 批量侧缩略图从此带缓存与显示埋点 |

> 🔴 前提：已在 `reference-thumb-tray.jsx` 文件头注释写明这 4 处（执行者已做）。
> ⚠️ **遗留**：outfit 侧真实托盘**未做真机验证**（本环境批量页无历史任务）⇒ **必须由用户人工复核**。

### 6.5 互指注释锚点 —— **授权修正，并改为「只写函数名、不写行号」**

当前（按 `bbf4586` 实测）4 处锚点有 **3 处已漂**：

| 注释位置 | 写的 | 实际定义行 | 状态 |
| --- | --- | --- | --- |
| `outfit:1968` → main | `src/main.jsx:476` | 476 | ✅ 准确 |
| `outfit:1935` → main | `src/main.jsx:716` | **722** | ❌ 漂 6 行 |
| `main:475` → outfit | `src/outfit-workflow.jsx:1972` | **1973** | ❌ 漂 1 行 |
| `main:721` → outfit | `src/outfit-workflow.jsx:1942` | **1943** | ❌ 漂 1 行 |

**统筹裁决**：**跨文件注释一律「只写函数名、不写行号」** —— 行号锚点在并发提交下必然反复漂移
（本轮已漂 3 次），维护成本高于收益；函数名稳定且可 grep。
⇒ 授权执行者把上表 4 处改为函数名形式（**纯注释改动，独立小 commit**）。

---

## 7. 已知缺陷清单（录入 + 状态）

| ID | 缺陷 | 状态 | 证据 | 归属工单 |
| --- | --- | --- | --- | --- |
| ① | `normalizeApiKeyInput` 清洗顺序（带引号整串 → `Bearersk-x`） | ✅ **已修 `7f6845b`** | `knownDefectCount` 1 → **0**（实测） | V11-RF-001 |
| ② | `ReferenceThumbTray` 两份实现分叉 | ✅ **已收口 `bbf4586` + 🟢 人工复核通过** | 019 `duplicateCount` **1 → 0**（实测） | V11-RF-043-2 ✅ |
| ②b | RF-043-2 带来的 **outfit 侧 4 处行为变化**（3 收窄 + 1 放宽） | ✅ **裁决接受 + 🟢 人工复核通过** | 见 §6.4 | V11-RF-043-2 ✅ |
| ②c 🆕 | `CachedImage` 同 `src` 去重路径（模块级 `DISPLAY_IMAGE_CACHE`） | ✅ **人工复核通过（2026-10-02）** | 用户实测：同一图片 URL 多次出现的界面显示正常 | V11-RF-043-1 ✅ |
| ⑧ 🆕 | `PreparedResultImage`（outfit）↔ `CachedImage`（shared）改名克隆 | 🔴 **进行中**（窗口①，工作区未提交） | 统筹实测见 §6.2；裁决「可统一，取超集」 | **V11-RF-048**（D-0） |
| ③ | ~~「本地详情未走 `resolveLocalEditBaseFile`」~~ **已证伪 + 改判** | 🔴 **真漏走在裁剪回流链** | RF-044 只读定位：本地详情自身链路 4 个底图点**全部已走**（`:3250/:3267/:5016/:9354`，`outfit:9617` 强制 local-detail 带 `localEdit` 可证）⇒ **在本地详情链路内不成立**；真漏走是 `outfit-workflow.jsx:9466` | **V11-RF-047**（新立） |
| ④ | 🔴 **undo/redo 陈旧闭包把旧 `tool`/`overlayOpacity` 写回项目存档** | ✅ **已修 + 人工冒烟通过** | `image-editor.jsx:651`；统筹已复核 `scheduleProjectSave:358-375` 写入字段 | **V11-RF-045** ✅ `25ce21c` |
| ④b | 残留：`restoreSnapshot` 在 `await` 解码后才调 `scheduleProjectSave`，数毫秒窗口内改 `tool` 仍可能写旧值 | ⏸ **暂缓至阶段 D** | 彻底修法需把 5 个 state 镜像成 ref，改动面大；主路径已修 | **V11-RF-045b** |
| ⑤ | 前端 19 条 `exhaustive-deps` | ✅ **已判定完毕** | 真 bug 1 / 有意 12 / 需重构 6 | RF-033 ✅ + V11-RF-045 |
| ⑥ | 后端 16 条 AI 调用族重复（`createAbortSignal` ×8） | 🔴 **消至最后 1 条** | 027-1/2/2b/3/4 已收：宽口径 16→9→4；**剩 `compactPreserveNewlines`（两份字节一致）** | **V11-RF-027-4b**（027-5 之前必做） |
| ⑥b 🆕 | `detailModel`（detail-ai.js）是 `modelName` 的**改名克隆** | ✅ **已收口 `84ae66c`** | `grep -rn "detailModel" server/` = 0；新发现克隆，已登记存量清单 | V11-RF-027-3 |
| ⑥c 🆕 | `pose` 的 `mode.includeImage`（单数）与 detail 的 `includeImages`（复数） | ✅ **有意保留**（不得消） | 实测 `outfit-pose-ai.js:196` 在 `attempts.push({…})` 内 ⇒ 流进 API 响应体，改名破坏字节一致；且是**字段名**非顶层函数 ⇒ 门禁永远看不见 | — 登记备查 |
| ⑦ | 块级克隆 **2570 行 / 56 块**；改名/结构克隆 **62 组**（51 等价 / **11 需人工确认**） | ✅ **已测量** | 其中 **53 组是组件内函数**，019 完全看不见 | RF-032 ✅ → 归入 D-2 |

### 7.1 人工复核记录（2026-10-02 · 用户实测）

| # | 复核项 | 场景 | 结果 | 结论 |
| --- | --- | --- | --- | --- |
| ① | outfit 侧参考图托盘（有历史任务时） | 批量生成页**带历史任务** → 看缩略图数量 / 右键菜单 / 点击预览 | ✅ 正常 | RF-043-2 的「main 版为基底 + outfit key 兜底」裁决成立；§6.4 的 4 处行为变化**未见负面体感** ⇒ **关闭** |
| ② | `CachedImage` 同 `src` 去重 | 同一图片 URL 多次出现的界面 | ✅ 正常显示 | 模块级 `DISPLAY_IMAGE_CACHE` 去重路径未破坏渲染 ⇒ **关闭**（缺陷 ②c 注销） |

> 🔴 **019 归零的账由此坐实**：`duplicateCount = 0` 是门禁实测，②/②b/②c 是人工实测，两条腿都齐了。
> 后续阶段 D 再动 `src/shared/ui/` 下的组件时，**仍必须按 §0.9 重跑一遍人工复核**（自动化门禁看不到视觉回归）。

---

## 8. 待决策项（需人类拍板，本文不擅自开单）

1. **storage key 是否合一**：`loadPromptCategories`/`loadPromptPresets` 两侧 key 不同。**合一 ⇒ 两页共享同一份提示词库，属产品决策。**
   🔴 新证据（RF-032）：这两条 **L1 归一化哈希完全相同**但**兜底常量不同源** ⇒ **任何"哈希相等就自动合并"的做法都会在这里翻车**，人工裁决不可省略。
2. ✅ **`ReferenceThumbTray` 统一到哪一版** → **已裁决**：以 main 版为基底（4 调用点 vs 1，且是真超集），
   补 outfit 独有的 key 兜底；拆 **RF-043-1（抽 `CachedImage` → shared/ui）→ RF-043-2（抽 `ReferenceThumbTray` → shared/ui）**。
   **它是 019 最后 1 条，在 043-2 完成前必须保留在基线内，不得划掉。**
3. **RF-027 的 16 条是否先纳入门禁视野**：**已裁定 —— 不纳、不 `--update`**，直接抽走（见 §4）。
4. **护栏形态**：**已裁定 —— 继续扩展 `scripts/verify/`，不引入 vitest**（不加依赖）。
5. **`exhaustive-deps` 是否从 `warn` 升 `error`**：**现在具备升级条件了** —— 19 条已判完（1 真 bug → RF-045；12 条有意 → 加豁免注释；6 条随阶段 D 解决）。
   ⇒ **待 RF-045 完成 + 12 条豁免注释补齐后，由统筹另立「升级」单**。在此之前**不要擅自改 `eslint.config.mjs:88`**。
6. 🆕 **12 条「有意空依赖」是否逐条加豁免注释**：建议**加**（否则它们永远以 warning 形式污染报告）。可与 RF-045 同批做，但**必须分 commit**。

---

## 9. 通用基线（每张工单默认适用）

### 9.1 AB 验收基线
- **AB-1**：`node scripts/verify/run-all.mjs` 通过（本环境恒 27/38，见 §9.3）
- **AB-2**：lint 棘轮不恶化：`node scripts/verify/lint-ratchet-check.mjs`（本环境需进程内 ESLint 代理，见 §9.3）
- **AB-3**：`node --check <改动文件>` 语法自检
- **AB-4**：沙盒差分（改动端点前后响应体 + HTTP 码一致；**易变字段必须剔除**：`now`/`uptimeSec`/`latencyMs`/`checkedAt`/`memory`/`requestId`/`generatedAt`；**日志比对必须先排序**）

### 9.2 G 通用禁止修改清单
`scripts/verify/lib/def-patterns.mjs`（判据唯一真相源）、`eslint.config.mjs`、`lint-baseline.json`、各门禁 `*-baseline.json`、
`AGENTS.md`、`prompts/**`（提示词）、任何 `*.css`、任何发布/打包脚本。
⚠️ **例外**：**经统筹明文授权并在 commit 写明理由的棘轮划账（`--update`）是允许的**（见 §3.2 ①）；
G 清单约束的是「执行者为让门禁变绿而擅自改」。
**执行者不得修改本文及任何总表/执行单/汇报类 `.md`**（§0.9 第 6 条）。

### 9.3 本环境已知限制（执行者须知，别误判为回归）
- `spawnSync` 在本沙盒**必然 EBUSY** ⇒ `lint-ratchet-check` / `run-all-check` / `check-launcher` **恒失败**，属环境限制，不是代码问题；
  替代：用进程内 ESLint API 跑（`ESLint` 从 `node_modules/eslint/lib/api.js` 导出，Windows 下需 `pathToFileURL`）。
- 全套 38 项本环境恒 **27 通过 / 11 失败**：8 项串行资源竞争（**单独 `--only` 重跑会通过**，集合会飘）+ 上述 3 项环境限制。
  ⇒ **比对的是「失败类别」不是「失败名单逐字相同」**。
- `git commit -F - <<EOF` 可能被安全策略拦截 ⇒ 改用 `git commit -F tmp/commit-xxx.txt`。
- 前端改动 `.jsx` **必须 `vite build`**；涉及服务端 import 的前端模块要用 release 同款 esbuild 打一次 bundle 验证。
- Windows 下 `taskkill /PID` 在 Git Bash 会被路径转换破坏 ⇒ 用 PowerShell `Stop-Process -Id`。

---

## 10. 交付纪律（执行者汇报模板）

每单完成后交回：
1. **commit hash** + 一行为什么（取哪版 / 有没有有意的行为变化）
2. **diff 三类 hunk 清单**（删了什么 / 加了什么 import / 清了哪些孤儿）
3. **对照组脚本路径 + 项数/失败数**（刀 3 起定型的手法）
4. **门禁前后对比**：`duplicateCount` / `regressions` / `violations` / lint 逐文件计数
5. **冒烟结果**；**无冒烟的必须写明豁免理由**（§0.9 第 18 条）
6. **遇到的分叉**（若有）：停手 + 对照表，等统筹裁决

**统筹据此更新本文件的 §7 缺陷清单与批次状态；执行者不直接改本文件。**

---

## 11. 并行派单规则（两个窗口同时开工前必读）

### 11.1 三条硬前提
1. 🔴 **同一个工作目录不允许两个 AI 同时写代码** —— 会互相覆盖文件、`git` 冲突、且失败无法归因。
   ⇒ 要么**串行**，要么**用 git worktree / 目录副本做物理隔离**（命令见 11.2）。
2. 🔴 **C 批的报告带行号，会与 A 批的编辑打架**：RF-033 要列 19 处 `file:line`、RF-032 要测全 `src/**`；
   而 A 批会改 `main.jsx` / `outfit-workflow.jsx` ⇒ **行号漂移，报告与代码对不上**。
   ⇒ 三选一：① **先 C 后 A**（C 只读、快，先出地图）；② C 在独立 worktree 里跑；③ C 的报告**必须标注所基于的 commit hash**，并由执行者改用「函数名 + 行号（注明快照 hash）」写法。
3. 🔴 **A 批内部 5 单必须同一个执行者串行做**（RF-040/041/042 都碰 `main.jsx` 与 `outfit-workflow.jsx`，文件重叠）；**不得拆给两个人**。

### 11.2 物理隔离（若坚持并行）
```bash
# 在仓库内为第二个执行者开独立工作树（共享 .git，工作区互不干扰）
git worktree add ..\jingyin-wt-batchC  HEAD
# 第二个窗口把工作目录切到 ..\jingyin-wt-batchC 再做（需在该目录单独 npm i 或软链 node_modules）
```
⚠️ 两个窗口**都不要起服务抢端口**（8787 常被遗留进程占用，8788 也被占用过）；确需起服务时用不同 `PORT`。
⚠️ 前端验证脚本已用 `JINGYIN_VITE_CACHE_DIR=tmp/vite-cache-verify` 隔离预构建缓存，**副本目录同样安全**。

### 11.3 窗口一 · A 批（5 单）开场提示词
```
你是执行者。工作目录：D:\源码开发\静音AI画板v4.0源码
先整读两份文档，再动任何代码：
  1) REFACTOR_TICKETS.md（唯一有效派单契约）
  2) REFACTOR-枢纽-存档-2026-10-02.md 的 §0.9 十九条硬约束（全文，必读）
本轮只做「批次 A」这 5 单，按 V11-RF-001 → 040 → 041 → 042 → 044 顺序串行：
  V11-RF-001（KEY 清洗顺序 bug 修复）/ V11-RF-040（两个 loader 改名，不合并）
  V11-RF-041（diagnosticImageSourceType）/ V11-RF-042（referenceSource）
  V11-RF-044（只读定位本地详情底图取值点，不改任何代码）
硬性要求：
  · 一单一 commit；结构搬运与 bug 修复绝不混交
  · 每单开工前先 diff 判三类（字节一致 / 语义等价 / 已分叉），已分叉立即停手报告，不得擅自统一
  · 每单必须有对照组脚本（旧实现抄进 tmp/ 当基准）；改 .jsx 必须 vite build
  · 禁止修改任何 .md（含本文档）；禁止改判据、禁止 --update 掩盖债务
  · RF-041/042 若判为分叉：只交对照表，不动代码
完成后按本文 §10 的模板逐单汇报。
```

### 11.4 窗口二 · C 批（2 单，只读）开场提示词
```
你是执行者。工作目录：D:\源码开发\静音AI画板v4.0源码（若已有人在同目录改代码，改用 git worktree 独立目录）
先整读 REFACTOR_TICKETS.md，重点 §5。
本轮只做「批次 C」两单，且【只读】——不改任何代码、不改基线、不入门禁：
  V11-RF-032（改名克隆 + 块级克隆只读测量，src/** 全量）
  V11-RF-033（19 条 react-hooks/exhaustive-deps 三类判定：真 bug / 有意空依赖 / 需重构）
硬性要求：
  · 报告必须在开头写明「基于 commit <hash>」；行号一律写「函数名 + 行号（快照 hash）」
  · RF-032 必须先用文档里给的 4 个活样本验证工具真能抓到，抓不到就换手段并说明
  · RF-033 每条判定必须给可复核依据（读了哪个 state、该 state 怎么初始化、effect 有无 ref 守卫）
    ⚠️ 文档里已实测推翻一例（outfit-workflow.jsx:6951 常被当"实锤 bug"，实为有意的挂载时同步读档），别凭告警文本直接归类
  · 禁止修改任何文件（含 .md）
完成后交回两张表（RF-032 清单 / RF-033 判定表）+ 对阶段 D 的拆分建议。
```
