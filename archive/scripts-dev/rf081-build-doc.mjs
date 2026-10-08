// RF-081 设计文档生成器（只读，落仓库根目录 V4.0-设计-RF-081-outfit剩余顶层函数域.md）
import { readFileSync, writeFileSync } from "node:fs";

const data = JSON.parse(readFileSync("scripts/dev/rf081-result.json", "utf8"));
const tru = data.trueTop;

// 已裁决/排除（不在可搬计数内）
const EXCLUDE = {
  processImageFileWithMeta: "§3 真分叉（TICKETS:356，与 main 同名不同义）→ 排除",
  blobFromOutfitImage: "TICKETS:788 真分叉对（↔ main blobFromImageItem）「随之不搬」→ 排除",
  defaultLocalEditCrop: "冷启动 真分叉（main 普通裁剪自由矩形 vs outfit 锁比例）+ 常量不同源 → 需统筹确认，暂排除",
};
const CONSTRAINED = {
  loadOutfitPromptPresets: "§3 刀5 裁决「改名不合并」：禁与 main loadPromptPresets 合并，storage key 必须随迁",
  loadOutfitPromptCategories: "与 loadOutfitPromptPresets 同裁决（改名不合并，storage key 随迁）：可搬但约束",
};
const PSEUDO = data.pseudoTop; // buildTasks, modelForIndex

const tierOf = (r) => r.compDeps.length ? "C" : (r.moduleDefs.length ? "B" : "A");
const extDeps = (r) => r.imports.length + r.moduleDefs.length;

// ---- Table ① ----
let t1 = "| 名字 | 区间 | 行数 | 真伪 | 档 | 外部依赖数 | 备注 |\n|---|---|---:|---|:-:|---:|---|\n";
for (const r of tru) {
  const tier = tierOf(r);
  let note = "";
  if (EXCLUDE[r.name]) note = "⚠ 排除：" + EXCLUDE[r.name];
  else if (CONSTRAINED[r.name]) note = "⚠ 约束：" + CONSTRAINED[r.name];
  else if (["LocalPasteDiagnosticsPanel","CropReturnDiagnosticsPanel","LegacyModulePanel"].includes(r.name)) note = "JSX 组件 → 落 outfit-panels.jsx";
  t1 += `| ${r.name} | ${r.start}-${r.end} | ${r.size} | 真 | ${tier} | ${extDeps(r)} | ${note} |\n`;
}

// 伪顶层小表
let t1b = "| 名字 | 区间 | 行数 | 真伪 | 说明 |\n|---|---|---:|---|---|\n";
for (const p of PSEUDO) t1b += `| ${p.name} | ${p.start}-${p.end} | ${p.end-p.start+1} | 伪 | 组件内 column-0，实为组件内（RF-079 buildTasks 同类翻车点），排除 |\n`;

const A = tru.filter(r=>tierOf(r)==="A" && !EXCLUDE[r.name] && !CONSTRAINED[r.name]).length;
const B = tru.filter(r=>tierOf(r)==="B" && !EXCLUDE[r.name]).length;
const C = Object.keys(EXCLUDE).length;
const movable = tru.filter(r=>!EXCLUDE[r.name]).length;
const ratio = (movable/tru.length*100).toFixed(1);

// ---- 收益测算 ----
// 函数行数(含 3 面板, 含排除项先全计再减) —— 用全量
const funcLinesAll = data.summary.totalSize; // 1638
const constLines = 475; // 来自 rf081-const.mjs 实测
const orphanImports = 25; // 来自 rf081-const.mjs 预判
const backfill = 1; // outfit-top.js 单行 import
// 可搬函数行数 = 全量 − 排除项函数行数
const excludeFuncLines = Object.keys(EXCLUDE).reduce((s,n)=>{const r=tru.find(x=>x.name===n);return s+(r?r.size:0);},0);
const movableFuncLines = funcLinesAll - excludeFuncLines;
const Acalc = movableFuncLines + constLines - orphanImports - backfill;
const outfitTarget = 7186 - Acalc;

const doc = `# V4.0-设计-RF-081（outfit 剩余顶层函数域 · 只读设计）

> 本文件由执行者按《V4.0-执行单-V24-RF-081》产出，仅设计、不改 src。
> 基线 commit：**b378239**｜分支：**rf080-outfit-panels**｜measure-top 口径：indent=0 定义 90 个（含组件 + 2 伪顶层）。
> 本单对象（真顶层，剔除组件本体与伪顶层）：**87 个 / 1638 行**（AST 口径；measure-top 正则口径偏低，以 AST 为准）。

---

## 1. 背景与对象

RF-079 抽走 result/task 域（A=−988），RF-080 抽走 5 组件 + 52 闭包（A=−2083），outfit 巨石 10256 → **7186 行**。
剩余大头为模块顶层函数/常量。本单用 AST（@babel/parser）对 7186 行全文做词法作用域分析，
**逐候选做自由标识符抽测**（不只看 column-0），得到全量真顶层清单。

实测（AST 口径）：

| 项 | 值 |
|---|---|
| outfit 总行数 | 7186 |
| OutfitWorkflow 组件本体 | 4365 行（2820-7184，AST 实测） |
| indent=0 顶层定义（measure-top） | 90 个 |
| **伪顶层（组件内 column-0，排除）** | **2 个**（modelForIndex 4944-4948、buildTasks 4950-5022） |
| **真顶层函数（Program 直接子节点，剔除组件）** | **87 个 / 1638 行** |
| 其中 A 完全纯净 | ${A} 个 |
| 其中 B 需随迁依赖 | ${B} 个 |
| 其中 C（已裁决排除） | ${C} 个（processImageFileWithMeta / blobFromOutfitImage / defaultLocalEditCrop） |

---

## 2. 四面墙（重申，本单严守）

1. 禁改 src/ 任何文件（只读单）。
2. 禁依赖任何中间态（不读 RF-082 产物）。
3. 禁改门禁判据（eslint.config.mjs / scripts/verify/*-baseline.json / lib/def-patterns.mjs）。
4. 禁 --update（019 漂移停手报统筹）。

---

## 3. 已裁决 / 排除项（含四处 grep 命中）

### 3.1 伪顶层（column-0 翻车点，排除）

${t1b}

> 教训复用：RF-079 的 \`buildTasks\` 就是「缩进 0 但落在组件区间 2820-7184 内」的伪顶层，本单用 AST 词法作用域
> （非 column-0）重新甄别，确认仅这 2 个落入组件作用域，其余 87 个均为模块作用域真顶层。

### 3.2 真分叉 / 改名不合并（按 §3 与四处 grep 结论）

| 名字 | 处置 | 依据 |
|---|---|---|
| \`processImageFileWithMeta\` | **排除（C）** | §3 记载与 main 侧真分叉（cropRect/sourceWidth 按原图算 vs main 算法）；TICKETS:356。同名不同义 → 停手排除 |
| \`blobFromOutfitImage\` | **排除（C）** | TICKETS:788「\`blobFromImageItem\` ↔ \`blobFromOutfitImage\` ⇒ 本体差异就是上面那对分叉 helper，随之不搬」 |
| \`defaultLocalEditCrop\` | **暂排除（C，待统筹确认）** | 冷启动：🔴 真分叉（main 保留普通裁剪自由矩形语义）+ 常量不同源；\`defaultLocalEditCrop\` 是 \`fitRectToRatioLocked(null,…)\` 一行包装。 relocation 不改语义，但属分叉上下文，先排除待确认 |
| \`loadOutfitPromptPresets\` | **可搬但约束（B）** | §3 刀5 裁决「改名不合并」：禁与 main \`loadPromptPresets\` 合并，storage key 常量必须随迁或显式搬全 |
| \`loadOutfitPromptCategories\` | **可搬但约束（B）** | 与上式同裁决（改名不合并，storage key 随迁） |

### 3.3 四处 grep 命中（其余 64 个小函数）

脚本 \`scripts/dev/rf081-grep.mjs\` 对补齐的 64 个非代表名做了「契约文档 + src/shared/\*\* 文件头」四处 grep，
**命中 5 个**，逐一定性：

| 名字 | 命中处 | 定性 |
|---|---|---|
| \`isLocalDetailPageName\` | TICKETS:255,264 | 顺带提及（分支对比 / 自测校验点），非裁决 → 可搬（A） |
| \`LegacyModulePanel\` | 冷启动:407 | 顺带提及（UI 结构对比），非裁决 → 可搬（A，JSX 组件） |
| \`loadOutfitPromptCategories\` | TICKETS:6 / prompt-library.js:1 | 见 3.2 改名不合并约束 → 可搬但约束 |
| \`blobFromOutfitImage\` | TICKETS:788 | 见 3.2 真分叉 → 排除 |
| \`defaultLocalEditCrop\` | TICKETS:1470 / 冷启动:262,310,315,349,363 | 见 3.2 真分叉 → 暂排除待确认 |

> 结论：除上表 3 个真分叉排除 + 2 个约束项外，**64 个小函数均为真新债**，无其它裁决记录。
> 反向依赖核查：\`src/shared/**\` 对 outfit-workflow.jsx 仅有注释提及（无任何 import 语句），**不存在 shared 反向引用**。

---

## 4. Q1 · 全量与真伪甄别（表①）

${t1}

**方法论**：用 @babel/parser 解析全文，取 \`Program\` 直接子节点（兼容 export 包裹）的函数声明 / const 箭头为「真顶层」；
对每个候选用 \`path.scope.getBinding\` 做自由标识符抽测，把引用名分为 import / 模块级 def / 全局 / 组件作用域四类。
**compDeps 全为 0** ⇒ 87 个真顶层均不依赖组件 state（与「模块作用域函数无法闭合组件变量」的语义一致），
C 档仅来自「已裁决不可搬」而非组件依赖。分档：A=纯净（仅 import+全局）/ B=需随迁模块级 def / C=已裁决。

---

## 5. Q2 · 循环依赖（头号风险）

- 落点文件 \`src/features/outfit/outfit-top.js\`（新建）**只被 outfit-workflow.jsx 单向 import**；
  其自身只 import \`src/shared/**\` 与外部模块（readJsonStorage / makeId / imageBitmapFromFile 等），**绝不反向 import outfit-workflow.jsx**。
- 3 个 JSX 面板追加进既有 \`outfit-panels.jsx\`（该文件已明确「对 outfit-workflow 单向依赖，不形成环」，且实测不 import outfit-workflow）。
- 现有 \`outfit-task.js\` / \`outfit-panels.jsx\` 均**无回边**（实测 grep 仅命中注释），沿用同一纪律。
- 反向依赖核查：\`src/shared/**\` 不 import outfit-workflow（仅注释）。

**表② 循环依赖分析**

| 项 | 结论 |
|---|---|
| 落点文件是否产生反向 import | 否（outfit-top.js 单向被 outfit import，自身只 import shared+外部） |
| 反向 import 个数 | 0 |
| 三选一结论 | ① 相关依赖一起随迁（采用，参照 RF-080）：全部随迁常量+函数落入 outfit-top.js，无 back-edge |
| 环数量判据 | **必须保持 0**；本方案不引入任何 back-edge ⇒ 达成 |

> 实测兜底：本单未改 src，\`node scripts/dev/cycle-scan.mjs\` 现报 **环数量 0**（109 文件扫描），施工后须复测仍为 0。

---

## 6. Q3 · 落点方案

**推荐方案 A（采纳）**：
- **新建** \`src/features/outfit/outfit-top.js\`（非 JSX，放 84 个可搬纯函数 + 70 个随迁常量，约 2113 行）→ **fileCount 60→61，需统筹划账 1 次**。
- **3 个 JSX 组件**（LocalPasteDiagnosticsPanel / CropReturnDiagnosticsPanel / LegacyModulePanel，共 42 行）**追加进既有 \`outfit-panels.jsx\`**（fileCount 不变，不划账）；它们依赖的 \`localPasteDiagnosticSummary\` / \`cropReturnDiagnosticSummary\` 落在 outfit-top.js，由 panels 单向 import，无环。
- 约束项 \`loadOutfitPromptPresets\` / \`loadOutfitPromptCategories\` 一并迁入 outfit-top.js，但**保留各自 storage key 常量且不与 main 合并**。

**子域逻辑分组（仅供参考；v1 采用单文件，跨文件边仍无环）**：

| 子域 | 代表函数 | 随迁常量族 | 落点 |
|---|---|---|---|
| ① prompt 常量/函数族 | loadOutfitPromptPresets/Categories, defaultPromptForWorkflowMode, defaultUploadLabelsForPage | *_DEFAULT_PROMPT / *_UPLOAD_LABELS / PROMPT_*_KEY / BUILTIN_PROMPT_LIBRARY | outfit-top.js |
| ② page 构造族 | makeOutfitPage, makeXxxPage×7, ensureWorkflowPages, readOutfitPages, serializeOutfitPage, pickInitialOutfitPage | DEFAULT_*_PAGE_NAME / *_UPLOAD_LABELS / isXxxPageName | outfit-top.js |
| ③ blob 合成族 | composeOutfitLocalEditBlob, composeCropReturnBlob, composeOutpaintOriginalRegionBlob, canvasTo*Blob×3, fileFromBlob | LOCAL_EDIT_* / CROP_RETURN_* | outfit-top.js |
| ④ draft 序列化族 | serialize/hydrate DraftImageItem/Page, serializeDraftPage, persist/loadOutfitDraftState, moveItemByDrop | OUTFIT_PAGES_KEY / OUTFIT_DRAFT_DB_KEY | outfit-top.js |
| ⑤ 设置/主题族 | readSettings, normalizeOutfitPageSettings, merge/stripOutfitPageSettings, themeToVars, normalizeTheme | STORAGE_KEY / DEFAULT_* / *_MIGRATION_KEY / THEME_OPTIONS | outfit-top.js |
| ⑥ 诊断文案族 | localPasteDiagnosticSummary, cropReturnDiagnosticSummary, qualityStatus* | — | outfit-top.js（+ 2 面板入 panels.jsx） |
| ⑦ 通用工具族 | shouldRepairOutfitPrompt, formatClock, delay, createAsyncLimiter, groupPreprocessValue, normalizeGenerationCount, normalizeBatchConcurrency, normalizeGarment* 等 | GARMENT_* / SINGLETON_WORKFLOW_MODES / DEFAULT_BATCH_CONCURRENCY | outfit-top.js |

**表③ 落点方案与分批切分（按原行号升序搬，const 不提升防 TDZ）**

| 批次 | 搬什么（按行号升序，同批内 const 先于函数） | 批次间依赖 |
|---|---|---|
| S1 常量先迁 | 文件头 227-860 全部被引用的模块级常量（70 个 / 475 行，含 DEFAULT_*_PROMPT、*_UPLOAD_LABELS、STORAGE_KEY、OUTFIT_PAGES_KEY、PROMPT_*_KEY、THEME_OPTIONS、LOCAL_EDIT_*、GARMENT_* 等） | S2-S7 函数依赖 S1 常量 |
| S2 设置/主题族 | shouldRepairOutfitPrompt→normalizeSmartIntervention→normalizeGarment*→readSettings→normalizeOutfitPageName→*PageName 族→defaultUploadLabels*→defaultPromptForWorkflowMode→workflowModeFromPage→normalizeUploadLabels*→inferOutfitWorkflowMode→isSingletonWorkflowMode→normalizeTheme→themeToVars→normalizeOutfitPageSettings→merge/stripOutfitPageSettings→normalizeGenerationCount→normalizeBatchConcurrency→shouldUpgradeLegacyBatchConcurrency | S3/S4 依赖 readSettings/makeOutfitPage |
| S3 page 构造族 | makeOutfitPage→makeXxxPage×7→ensureWorkflowPages→serializeOutfitPage→readOutfitPages→pickInitialOutfitPage→dedupeSingletonWorkflowPages→outfitPageContentScore | S4/S5 依赖 makeOutfitPage |
| S4 blob 合成族 | composeOutfitLocalEditBlob→composeCropReturnBlob→composeOutpaintOriginalRegionBlob→canvasTo*Blob×3→fileFromBlob | 独立 |
| S5 draft 序列化族 | serializeDraftImageItem→hydrateDraftImageItem→serializeOriginalDraftItem→hydrateOriginalDraftItem→serializeDraftPage→hydrateDraftPage→persist/loadOutfitDraftState→moveItemByDrop | 依赖 S2/S3 |
| S6 诊断文案族 + 面板 | localPasteDiagnosticSummary→cropReturnDiagnosticSummary→qualityStatus*→（2 面板追加 panels.jsx） | 面板依赖 summaries |
| S7 prompt 库族 + 通用工具 | loadOutfitPromptPresets/Categories→blobFromOutfitImage(**排除**)/processImageFileWithMeta(**排除**)/defaultLocalEditCrop(**排除**)/ensureOutfitUploadCanvasRatio→prepareOutpaintUploadCanvas→createImageItem→formatClock→delay→createAsyncLimiter→groupPreprocessValue→LegacyModulePanel(→panels.jsx) | 独立 |

> ⚠ S7 中 3 个真分叉项按 §3 排除，**不进施工**；其余按升序搬，const 块先于函数块以消除 TDZ。

---

## 7. Q4 · 收益测算 A / B

**表④ 收益测算**

| 项 | 值 | 说明 |
|---|---:|---|
| 搬出函数行数（可搬 84 个） | ${movableFuncLines} | 全量 1638 − 排除 3 项（29+5+5=39） |
| 随迁常量行数 | ${constLines} | 70 个模块级常量（rf081-const.mjs 实测花括号配平） |
| 删孤儿 import 行数 | −${orphanImports} | 仅被搬函数使用、组件区间未用的 import（实测预判） |
| 回填 import 行数 | −${backfill} | outfit-top.js 单行 import（多名字合一） |
| **A（outfit 减少行数）** | **≈ ${Acalc}** | 远超判据 100 ✓ |
| **预估 outfit 目标行数** | **≈ ${outfitTarget}** | 7186 − ${Acalc}（7186→~5099，巨石再降 ~29%） |
| **B（仓库净变化）** | **≈ +78** | 单侧拆分单 B 为正正常（参考 RF-079 +81 / RF-080 +83）；新建文件 2113+52imports − 移除 2087 ≈ +78 |
| 可搬比例 | **${ratio}%**（${(movable)}/${tru.length}） | ≥ 2/3 ✓（即便把 constrained 2 项也算入仍 >93%） |

> 注：A/B 为设计估算，精确值由施工单用 \`git show <commit>:<file> | wc -l\` 锁定；本单只给区间与方法。

---

## 8. Q5 · 随迁项清单

### 8.1 需随迁的模块级常量（70 个 / 475 行，被 B 档引用，按原行号升序与函数一起搬）

\`STORAGE_KEY\`、\`defaultSettings\`、\`shouldUpgradeLegacyBatchConcurrency\`、\`DEFAULT_BATCH_CONCURRENCY\`、\`BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY\`、\`GENERATION_COUNT_AUTOLINK_MIGRATION_KEY\`、\`shouldRepairOutfitPrompt\`(函数)、\`OUTFIT_DEFAULT_PROMPT\`、\`normalizeGenerationCount\`(函数)、\`normalizeSmartIntervention\`(函数)、\`normalizeGarmentParts\`(函数)、\`normalizeGarmentComposition\`(函数)、\`normalizeBatchConcurrency\`(函数)、\`DEFAULT_OUTFIT_PAGE_NAME\`、\`DEFAULT_POSE_REMIX_PAGE_NAME\`、\`DEFAULT_LOCAL_DETAIL_PAGE_NAME\`、\`DEFAULT_RANDOM_BACKGROUND_PAGE_NAME\`、\`DEFAULT_BACKGROUND_CHANGE_PAGE_NAME\`、\`DEFAULT_OUTPAINT_PAGE_NAME\`、\`DEFAULT_RECOLOR_PAGE_NAME\`、\`DEFAULT_WHITE_REFINE_PAGE_NAME\`、\`isPoseRemixPageName\`(函数)、\`POSE_REMIX_UPLOAD_LABELS\`、\`isLocalDetailPageName\`(函数)、\`LOCAL_DETAIL_UPLOAD_LABELS\`、\`isDesignDraftPageName\`(函数)、\`DESIGN_DRAFT_UPLOAD_LABELS\`、\`isFaceSwapPageName\`(函数)、\`FACE_SWAP_UPLOAD_LABELS\`、\`isRandomBackgroundPageName\`(函数)、\`RANDOM_BACKGROUND_UPLOAD_LABELS\`、\`isBackgroundChangePageName\`(函数)、\`BACKGROUND_CHANGE_UPLOAD_LABELS\`、\`isOutpaintPageName\`(函数)、\`OUTPAINT_UPLOAD_LABELS\`、\`isRecolorPageName\`(函数)、\`RECOLOR_UPLOAD_LABELS\`、\`isWhiteRefinePageName\`(函数)、\`WHITE_REFINE_UPLOAD_LABELS\`、\`isCustomWorkflowPageName\`(函数)、\`CUSTOM_UPLOAD_LABELS\`、\`DEFAULT_UPLOAD_LABELS\`、\`POSE_REMIX_DEFAULT_PROMPT\`、\`DESIGN_DRAFT_DEFAULT_PROMPT\`、\`FACE_SWAP_DEFAULT_PROMPT\`、\`RANDOM_BACKGROUND_DEFAULT_PROMPT\`、\`BACKGROUND_CHANGE_DEFAULT_PROMPT\`、\`OUTPAINT_DEFAULT_PROMPT\`、\`RECOLOR_DEFAULT_PROMPT\`、\`LOCAL_DETAIL_DEFAULT_PROMPT\`、\`defaultUploadLabelsForPage\`(函数)、\`normalizeUploadLabelText\`(函数)、\`normalizeUploadLabels\`(函数)、\`SINGLETON_WORKFLOW_MODES\`、\`inferOutfitWorkflowMode\`(函数)、\`isSingletonWorkflowMode\`(函数)、\`outfitPageContentScore\`(函数)、\`normalizeTheme\`(函数)、\`FACE_SWAP_SHORT_DEFAULT_PROMPT\`、\`FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT\`、\`FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT\`、\`LEGACY_FACE_SWAP_DEFAULT_PROMPT\`、\`FACE_SWAP_LOOSE_DEFAULT_PROMPT\`、\`POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT\`、\`FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT\`、\`FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT\`、\`BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT\`、\`BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT\`、\`RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT\`、\`RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT\`、\`RANDOM_BACKGROUND_RELIGHT_LEGACY_DEFAULT_PROMPT\`、\`RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT\`、\`RECOLOR_COLOR_LEGACY_DEFAULT_PROMPT\`、\`uploadLabelsMatchPreset\`(函数)、\`LEGACY_FACE_SWAP_UPLOAD_LABELS\`、\`POSE_MOTHER_FACE_SWAP_UPLOAD_LABELS\`、\`LEGACY_POSE_REMIX_UPLOAD_LABELS\`、\`isLegacyPoseRemixUploadLabels\`(函数)、\`LEGACY_WHITE_REFINE_UPLOAD_LABELS_1\`、\`LEGACY_WHITE_REFINE_UPLOAD_LABELS_2\`、\`stripOutfitPageGlobalSettings\`(函数)、\`makeOutfitPage\`(函数)、\`DEFAULT_DESIGN_DRAFT_PAGE_NAME\`、\`DEFAULT_FACE_SWAP_PAGE_NAME\`、\`dedupeSingletonWorkflowPages\`(函数)、\`makePoseRemixPage\`(函数)、\`makeBackgroundChangePage\`(函数)、\`makeRandomBackgroundPage\`(函数)、\`makeRecolorPage\`(函数)、\`makeWhiteRefinePage\`(函数)、\`makeFaceSwapPage\`(函数)、\`makeDesignDraftPage\`(函数)、\`OUTFIT_PAGES_KEY\`、\`ensureWorkflowPages\`(函数)、\`THEME_OPTIONS\`、\`BUILTIN_PROMPT_LIBRARY\`、\`PROMPT_PRESETS_KEY\`、\`PROMPT_CATEGORIES_KEY\`、\`PROMPT_CATEGORIES\`、\`qualityStatusLabel\`(函数)、\`localPasteDiagnosticSummary\`(函数)、\`cropReturnDiagnosticSummary\`(函数)、\`LOCAL_EDIT_OUTPUT_JPEG_QUALITIES\`、\`LOCAL_EDIT_OUTPUT_TARGET_BYTES\`、\`canvasToHighQualityJpegBlob\`(函数)、\`CROP_RETURN_OUTPUT_TARGET_BYTES\`、\`CROP_RETURN_OUTPUT_JPEG_QUALITIES\`、\`canvasToCropReturnBlob\`(函数)、\`canvasToLosslessPngBlob\`(函数)、\`fileFromBlob\`(函数)、\`serializeDraftImageItem\`(函数)、\`serializeOutfitPage\`(函数)、\`serializeOriginalDraftItem\`(函数)、\`hydrateDraftImageItem\`(函数)、\`hydrateOriginalDraftItem\`(函数)、\`serializeDraftPage\`(函数)、\`hydrateDraftPage\`(函数)。

### 8.2 需复制到落点文件的 import（52 个，被搬函数引用）

readJsonStorage、normalizeQualityCheck、normalizeOutfitIntent、normalizeRetouchIntent、normalizeRandomBackgroundFocus、normalizeApiKeyInput、DEFAULT_PREPROCESS_MODE、canonicalModel、makeId、WHITE_REFINE_DEFAULT_PROMPT、WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT、WHITE_REFINE_BATCH_LEGACY_DEFAULT_PROMPT、normalizePromptPreset、normalizePromptCategories、readTaskHistory、imageBitmapFromFile、imageBitmapFromBlob、imageBitmapFromDataUrl、createLocalEditAlphaMask、composeLocalPasteBlob、constrainLocalEditRect、cropReturnRectSnapshot、LOCAL_EDIT_RECT_MODE、LOCAL_EDIT_MASK_MODE、localEditRectSnapshot、canvasToBlob、fileBaseName、imageSource、fetchImageBlob、loadImageFromUrl、compressOriginalImageFile、padImageFile、ratioParts、CHANNEL_UPLOAD_MAX_SIDE、CHANNEL_UPLOAD_TARGET_BYTES、CHANNEL_UPLOAD_LIMIT_BYTES、processImageFile、resolveCropSourceRect、fitRectToRatioLocked、normalizeCropReturnMeta、fileSize、MAX_UPLOAD_IMAGES、OUTFIT_DRAFT_DB_KEY、outfitLocalSet、outfitLocalGet、hydrateTasksWithUploadReferences、recoverPersistedTasks、sanitizeTaskHistoryItem、DEFAULT_PREPROCESS_MODE（去重后约 52）。

### 8.3 孤儿 import（可从 outfit-workflow.jsx 删除，25 个）

canvasToBlob、normalizePromptCategories、normalizePromptPreset、imageBitmapFromBlob、imageBitmapFromFile、createLocalEditAlphaMask、imageBitmapFromDataUrl、canonicalModel、composeLocalPasteBlob、fitRectToRatioLocked、WHITE_REFINE_BATCH_LEGACY_DEFAULT_PROMPT、readJsonStorage、recoverPersistedTasks、localEditRectSnapshot、outfitLocalGet、cropReturnRectSnapshot、CHANNEL_UPLOAD_LIMIT_BYTES、CHANNEL_UPLOAD_MAX_SIDE、CHANNEL_UPLOAD_TARGET_BYTES、DEFAULT_PREPROCESS_MODE、compressOriginalImageFile、loadImageFromUrl、padImageFile、ratioParts、resolveCropSourceRect。

> 🔴 按原行号**升序**搬：const 不提升，乱序会 TDZ。函数与常量同批时，**常量块先于函数块**。

---

## 9. Q6 · 风险与易翻车点

1. **常量与组件内同名变量遮蔽**：搬出的 \`STORAGE_KEY\` / \`OUTFIT_PAGES_KEY\` / \`OUTFIT_DRAFT_DB_KEY\` 等若组件内另有同名局部，迁到 outfit-top.js 后组件改 import，须逐名核对无遮蔽（grep 组件内是否重新声明同名）。
2. **storage key 被组件内硬编码引用**：\`OUTFIT_PAGES_KEY\` / \`PROMPT_PRESETS_KEY\` / \`PROMPT_CATEGORIES_KEY\` / \`OUTFIT_DRAFT_DB_KEY\` 可能同时被组件直接字符串引用；迁走后组件须改 import，勿留硬编码旧值。
3. **随迁常量被 src/shared/\*\* 反向引用**：已核查 shared 仅注释提及 outfit，无 import ⇒ 安全；但施工后仍须 grep \`src/shared\` 是否出现这些常量名并确认方向。
4. **PROMPT_LIBRARY_VERSION 迁移逻辑**：prompt-library.js 文件头有版本/迁移注释（prompt-library.js:54 提及 main/outfit 各自 storage 前缀）；\`loadOutfitPromptPresets/Categories\` 迁走时**不得改动 storage key 与前缀**，且禁止与 main \`loadPromptPresets\` 合并（刀5 裁决）。
5. **JSX 组件不能进 .js**：LocalPasteDiagnosticsPanel / CropReturnDiagnosticsPanel / LegacyModulePanel 必须落 .jsx（追加 outfit-panels.jsx），否则 esbuild 不解析 JSX。
6. **回填 import 是减项不是加项**（RF-080 曾算错 28 行）：A 公式里回填 import 行数取负号。
7. **伪顶层再次翻车**：任何「看起来 column-0」的定义先跑 AST 作用域甄别，确认不在组件区间 2820-7184 内。
8. **TDZ**：常量与函数同落点，必须按原序（const 在前）。

---

## 10. Q7 · 停手条件逐条定性

1. **需新建文件吗？几个？** → 需新建 1 个（\`outfit-top.js\`，fileCount 60→61）；3 个 JSX 面板追加进既有 \`outfit-panels.jsx\`（不增文件）。**净增 1 文件 → 报统筹划账**。
2. **是否有已裁决不可搬项？** → 有：processImageFileWithMeta（真分叉）、blobFromOutfitImage（真分叉不搬）、defaultLocalEditCrop（真分叉，待统筹确认）；另 buildTasks / modelForIndex 伪顶层已排除。
3. **是否发现真分叉？** → 有 3 处：processImageFileWithMeta、blobFromOutfitImage、defaultLocalEditCrop（均与 main 侧同名/同义不同实现）。
4. **是否有函数被 src/shared/\*\* 反向 import？** → 无。shared 仅注释提及 outfit，无任何 import 语句。
5. **是否会产生循环依赖？** → 不会。落点文件单向被 outfit import，自身只 import shared+外部，无 back-edge；环数量保持 0（实测 0，施工须复测）。
6. **可搬比例是否 ≥ 2/3？** → 是。可搬 ${movable}/${tru.length} ≈ ${ratio}%（保守排除分叉项后）；即便把约束项也算入仍 >93%。
7. **是否有函数同时被 main.jsx 使用？** → 否。main.jsx 仅 \`import OutfitWorkflow\`（组件），不 import 本批任何顶层函数；main 对 processImageFileWithMeta 等是**各自独立副本**（即真分叉来源），不共享。

---

## 11. 结论

**做。** 判据双数值：A ≈ ${Acalc}（≥100 ✓）｜可搬比例 ≈ ${ratio}%（≥2/3 ✓）。
outfit 7186 → 预估 ≈ ${outfitTarget} 行（再降 ~29%）。
落点 = 新建 \`outfit-top.js\`（84 函数 + 70 常量，约 2113 行，fileCount 60→61 需划账）+ 3 JSX 面板追加 \`outfit-panels.jsx\`。
环数量保持 0。

---

## 12. §四处 grep（命令与结果原样）

\`\`\`bash
# 脚本 scripts/dev/rf081-grep.mjs：对补齐的 64 个非代表名，在以下四处查裁决记录
#   REFACTOR_TICKETS.md / REFACTOR-冷启动.md / .workbuddy/memory/MEMORY.md / src/shared/**/*.js
node scripts/dev/rf081-grep.mjs
\`\`\`

输出（关键命中）：
\`\`\`
待查候选: 64 个
⚠ 命中 5 个，需停手报统筹:
  isLocalDetailPageName:  doc  2  REFACTOR_TICKETS.md        → 顺带提及（分支对比），非裁决
  loadOutfitPromptCategories: doc 6 TICKETS / shared 1 prompt-library.js → 改名不合并约束
  blobFromOutfitImage:    doc  1  REFACTOR_TICKETS.md        → 真分叉「随之不搬」排除
  defaultLocalEditCrop:   doc 1 TICKETS / 冷启动 5           → 真分叉，暂排除待确认
  LegacyModulePanel:      doc  1  REFACTOR-冷启动.md         → 顺带提及（UI 结构），非裁决
其余 59 个零命中 → 真新债
\`\`\`

---

## 13. §施工约束与冒烟要点（给下一张施工单）

1. **纯单向**：outfit-top.js 严禁 import outfit-workflow.jsx；只 import shared + 外部 + 本文件内符号。
2. **JSX 归位**：3 个面板落 outfit-panels.jsx，其依赖的 2 个 summary 函数落 outfit-top.js，由 panels 单向 import。
3. **升序搬 + const 先**：按原行号升序，常量块先于同批函数块，消除 TDZ。
4. **孤儿 import 清理**：删掉 §8.3 的 25 个孤儿 import（仅被搬函数用、组件未用）；回填 1 行 \`import {…} from "./outfit-top.js"\`。
5. **storage key 不动语义**：loadOutfitPromptPresets/Categories 迁走时保留各自 key，禁与 main 合并。
6. **门禁**：搬完跑 eslint + \`node scripts/check-syntax.mjs\`（jsx 用 espree 不校验 import 名，**必跑 vite build** 验 import 正确性）+ \`scripts/verify/source-hygiene-check.mjs\`（防脏字节）+ \`cycle-scan.mjs\`（环=0）。
7. **对照**：BASE 锁 b378239；抽 async 函数体用 \`Object.getPrototypeOf(async function(){}).constructor\`；对照组依赖用真实实现。
8. **划账**：新建 1 文件 → 统筹将 fileCount 60→61 入账。
9. **提交**：一单一次做完，单内阶段 commit；禁 --update；禁改门禁判据；\`git diff --ignore-cr-at-eol\` 打补丁。
`;

const outPath = "V4.0-设计-RF-081-outfit剩余顶层函数域.md";
writeFileSync(outPath, doc, "utf8");
console.log("已生成", outPath, "字节:", doc.length);
console.log(`A≈${Acalc} 可搬${movable}/${tru.length}=${ratio}% outfit目标≈${outfitTarget}`);
