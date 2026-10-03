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

## 1. 现状快照（2026-10-03 实测，刷新命令见下）

| 项 | 值 |
|---|---|
| `src/main.jsx` | **7178** 行（RF-073 −16 → RF-076 **−224**） |
| `src/outfit-workflow.jsx` | **10574** 行（RF-076 **−215**） |
| 两巨石合计 | **17752** 行 / 占比 **69.8%**（起点 18867 / 74.6%） |
| `src/shared/` | 4345 行（RF-076 工厂 +263） |
| `src/features/` | 1639 行（js）+ 546 行 css |
| js/jsx 文件数 | 57 / 总 25447 行 |
| 019 基线 `fileCount` | **57** |
| ESLint 全仓 | errors=0 / **warnings=18**（src 17 + `server/routes/outfit.routes.js` 1） |

> 快照 **`d1996a3`**（RF-076 全量完成后）。⚠️ 全仓 warnings 是 **18**（含 server 1 条）；**src 单独是 17**，两个口径别混用。

已抽出的 `src/features/` 模块（12 个）：
`auth/api-key`(67) `canvas/canvas-actions`(313) `canvas/canvas-graph`(102) `detail/detail-group`(272)
`local-edit/*`(342,含 2 个 jsx) `result-queue/quick-result-replace`(103) `savedir/save-directory`(91)
`upload/reference-upload`(**203**，RF-073 −16) `video/video-composer`(146)

**刷新命令**（一条）：
```bash
node -e "
const {execSync}=require('child_process');
const all=execSync('git ls-files src',{encoding:'utf8'}).split('\n').filter(f=>/\.jsx?\$/.test(f));
let tot=0; const rows=[];
for(const f of all){const n=execSync('git show HEAD:'+f,{encoding:'utf8',maxBuffer:1<<28}).split('\n').length-1; tot+=n; rows.push([f,n]);}
const g=n=>rows.find(r=>r[0]==='src/'+n)[1];
const mono=g('main.jsx')+g('outfit-workflow.jsx');
console.log('文件='+all.length+' 总行='+tot+' main='+g('main.jsx')+' outfit='+g('outfit-workflow.jsx')+' 巨石='+mono+' 占比='+(mono/tot*100).toFixed(1)+'%');
console.log('shared='+rows.filter(r=>r[0].startsWith('src/shared')).reduce((a,b)=>a+b[1],0)+' features='+rows.filter(r=>r[0].startsWith('src/features')).reduce((a,b)=>a+b[1],0));
"
```

---

## 1.5 run-all 4 项失败的归因（2026-10-03 已查清，**非代码回归**，别重复查）

| 脚本 | 结论 | 处置 |
|---|---|---|
| `lint-ratchet-check` | **已修（`6726618`）**。51 组"新增"中 48 组来自根目录**未跟踪的垃圾副本 `verify/`**（54 文件，与 `scripts/verify` 逐字相同、无代码引用它，但被 `eslint .` 扫到且不在 Node 全局变量组 ⇒ 48 组 no-undef 假阳性）；另 3 组是本轮自建测量脚本的真债。已把副本移到 `tmp/_verify-legacy-20261003/`（可恢复）+ 修 3 处 ⇒ **超基线组数 51 → 0**，未动基线、未用 `--update` | 已绿 |
| `local-edit-base-file-check` / `resize-long-edge-check` / `modal-shell-check` | 三者**同一个根因**：喂给 `tabbit-cli` 的 program 里 `page.goto` **没有设 `setDefaultNavigationTimeout`**，用 playwright 默认 30s；而 vite 冷启动首次编译 >30s ⇒ goto 超时抛错 ⇒ program 无返回值 ⇒ CLI 回执 `result.value` 为 null ⇒ 脚本降级为"浏览器回执无法解析（长度 ~1KB）"。**非探针 CLI 故障**（手动跑 `console.log("probe-ok")` 67ms 即 `status:"succeeded"`） | ✅ **已修 `9b223ca`（RF-072）**：三脚本 program 各加 `page.setDefaultNavigationTimeout(150000)`；实测项数 **29/5/13 → 36/9/37**，`browser: skipped → ran`。🔴 **自此"探针未执行"这个降级态在本仓应视为异常信号** |

🔑 教训：`eslint .` 的扫描范围是**全仓**，任何游离目录都会污染棘轮；新增 `eslint` 看不到
的目录前，先确认它在 `eslint.config.mjs` 的哪个 `files` 组里。

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
| **1** | 🔴 **RF-077 · 合并两个局部编辑弹窗组件** `QuickLocalEditModal`(main 1695-2090) ↔ `OutfitLocalEditModal`(outfit 4792-5155) | **396 / 369 行**，整段 diff **26 个 hunk（+159/−186）** | **本轮派单**。交互层已收口 ⇒ 剩的是**组件壳**重复，是 main↔outfit 当前最大剩余块。
差异**已识别且大部分可参数化**（见 §3.5 对照表）。需新建 `src/features/local-edit/LocalEditModal.jsx`
⇒ **`fileCount` 57→58，由统筹划账**（执行者不得改 baseline）。预估净省 **≈250–320 行** |
| 2 | **RF-074 · main.result 域** | 10 fn / 123 行，耦合 **0.90**（全场最低可搬量级） | ⚠️ 只碰本域仅 5/10（50%）⇒ 需注入跨域参数（`selectedIds`/`setActiveView`/`saveDirectory`/`setDetailInfoSelection` 等 8+ 项）。其中 `downloadItem` 实为 **directory 域**（误归类）。开工前必须重测 |
| 3 | **RF-075 · 僵尸断言清理** | 1 条断言 | `scripts/` 路（可与 src/ 路并行）：`local-edit-base-file-check` 里 `cropOutfitLocalEditFile` 全 src 已不存在 ⇒ **恒失败**。⚠️ 注意该文件里**已有一处同类僵尸断言被标注移除**，本次是第二处 |
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
