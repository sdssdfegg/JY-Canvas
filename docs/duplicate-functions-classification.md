# 建议2 · 前端近重复函数分类清单（rename-clone advisory 复盘）

> 数据来源：`scripts/verify/frontend-duplication-check.mjs` 的 `renameCloneAdvisory`（只报不记账）。
> 运行口径：`src/` 68 文件、抽取 725 个函数（含组件内缩进函数），L1 组 13 / L2 组 13，合计 26（去 L1/L2 重复后约 20 个独立关系）。
> 核心判据（脚本头注释，已写入门禁）：**L1 相同 ≠ 语义等价**——只比 token 形状，不比标识符指向什么。实证反例 `loadPromptCategories`：两侧 L1 完全相同却兜底常量不同源。`advisory` 只是线索，能否合并必须人工判。
>
> 初稿口径为 68 文件 / 26 组；**后续已抽 `useSaveDirectory` + `usePreviewDrag` 两个共享 hook 收口 9 个闭包同名克隆，复查口径现为 70 文件 / 13 组 advisory（见第五章）**，脚本 `ok=true`、regressions/stale 均为 0。
>
> 本单已落地动作：合并 2 组（价格函数）+ 收口 9 组（共享 hook），其余按"不强行合并"原则分类。

---

## 一、已合并（确认字节一致，零行为变化）

| 左（被消掉的定义） | 右（唯一真身） | 证据 | 处理方式 |
|---|---|---|---|
| `quickVideoPricePerSecond`（outfit-panels.jsx） | `videoPricePerSecond`（video-composer.js:169） | 除函数名外逐 token 一致 | outfit-panels 改为 `import { videoPricePerSecond as quickVideoPricePerSecond }` |
| `quickVideoPriceLabel`（outfit-panels.jsx） | `videoPriceLabel`（video-composer.js:174） | 除函数名外逐 token 一致（内部调用也对应） | outfit-panels 改为 `import { videoPriceLabel as quickVideoPriceLabel }` |

> 与上一单已收口的 `videoDurationOptions`/`durationOptionsForVideoModel` 同属一个家族（视频模型定价/时长选项），统一收敛到 `video-composer.js` 单一真身。

---

## 二、已裁定不合并（有正式裁决，切勿动）

| 关系 | 位置 | 裁决 |
|---|---|---|
| `loadOutfitPromptCategories` ↔ `loadPromptCategories` | outfit-top.js:1391 ↔ main.jsx:292 | **V11-RF-040 裁定：改名不合并**。main.jsx:292 上方有红色注释"同名不同义，勿合并"。兜底常量不同源（main 写死 5 项 vs outfit 动态聚合）。脚本实证反例。 |

---

## 三、L1 相同但语义不同（陷阱组，**严禁自动合并**）

这些组 L1（保留字面量、归一化标识符）命中，看似"完全相同"，但标识符背后指向**不同的存储键 / 闭包状态 / 文案**，合并会直接改行为或破坏状态读取。

| 关系 | 位置 | 分歧点 | 结论 |
|---|---|---|---|
| `readResizeSettings` ↔ `loadInfiniteCanvasState` | outfit-panels.jsx:161 ↔ main.jsx:443 | 读不同存储键（`RESIZE_SETTINGS_KEY` vs `INFINITE_CANVAS_KEY`）+ 不同 normalizer（`normalizeResizeSettings` vs `normalizeInfiniteCanvasState`） | 不合并——合并会读错状态 |
| `cancelPointerSort` ↔ `cancelReferenceSort` | outfit-panels.jsx:776 ↔ main.jsx:2531 | 引用不同闭包状态（指针排序 refs/setters vs 参考图排序 refs/setters） | 不合并——需参数化重构或共享 hook |
| `quickVideoPromptPlaceholder` ↔ `videoPromptPlaceholder` | outfit-panels.jsx:1714 ↔ video-composer.js:165 | 兜底文案字面量不同（"运动、镜头、服装" vs "镜头运动、人物动作、服装展示"） | 不合并——文案已分叉 |

---

## 四、巧合级 / 结构克隆（L2 仅结构同，语义无关，不合并）

| 关系 | 位置 | 说明 |
|---|---|---|
| `cropReturnRectSnapshot` ↔ `shouldNormalizeQuickUploadForModel` | outfit-task.js:1040 ↔ main.jsx:604 | 都是 `return f(x)` 形态（tokens=13）的巧合匹配，语义完全无关（一个包 `localEditRectSnapshot`，一个包 `isBanana2Model`） |
| `resizeMimeForFormat` ↔ `uploadGroupLabel` | outfit-panels.jsx:303 ↔ outfit-workflow.jsx:2094 | 完全不同功能，仅结构同 |
| `clampReverseScreens` ↔ `clampCount` | detail-group.js:381 ↔ main.jsx:491 | L2 仅结构同、字面量不同，疑似不同语义（夹紧反向屏数 vs 夹紧数量），**建议不合并，需人工最终确认** |

### 结构克隆大组（各成员语义独立，纯模式相似，**一律不合并**）

- **`isXxx` 谓词族（12 个，L2）**：`isBananaModel` / `isAuthErrorMessage` / `isPoseRemixPageName` / `isLocalDetailPageName` / `isBackgroundChangePageName` / `isRandomBackgroundPageName` / `isOutpaintPageName` / `isRecolorPageName` / `isWhiteRefinePageName` / `isDesignDraftPageName` / `isFaceSwapPageName` / `isCustomWorkflowPageName`。各检查不同条件，结构同但语义各异。
- **api 写操作包装（5 个，L2）**：`appendHistoryResults` / `setSaveDirectory` / `pickSaveDirectory` / `openSaveDirectoryRequest` / `cleanStorageTargets`。各调不同端点。
- **api 函数包装（10 个，L2）**：`uploadCanvasAssets` / `inspectImageRequestParams` / `generateImages` / `analyzeOutfitMasterFit` / `checkOutfitQuality` / `rewriteQuickPrompt` / `rewriteReferencePrompt` / `createDetailPrompts` / `generateVideo` / `getVideoStatus`。同一"fetch 包装"模式，但各自逻辑不同。
- **api getter 包装（4 个，L2）**：`getAppConfig` / `getHistoryResults` / `getSaveDirectory` / `getStorageUsage`。同模式不同目标。

---

## 五、闭包依赖的同名克隆（main.jsx ↔ outfit-workflow.jsx）—— 已于 2026-10-13 收口 ✅

这些组**同名且 L1 字节一致**，是真·重复，但因定义在组件闭包内、引用组件内 state/refs/setters，无法直接抽成纯函数。已抽成**自定义 hook** 共享：

- `src/shared/hooks/useSaveDirectory.js` —— 收口 5.2 的 4 个保存目录薄壳函数。
- `src/shared/hooks/usePreviewDrag.js` —— 收口 5.1 的预览拖拽/画廊缩放/拖拽复位族。

两 hook 的函数体与改造前**逐字节一致**，闭包差异（`previewPan` / `closePreview` / 各 drag 复位 setter）通过参数化传入；调用方用解构重命名保留各自原名（`outfit` 的 `startPreviewDrag = beginPreviewDrag`、`endOutfitPageDrag = endDrag`），**零调用点改动、零运行时行为变化**。

### 5.1 预览拖拽族（已收口到 usePreviewDrag）
| 函数 | main.jsx | outfit-workflow.jsx | hook 真身 |
|---|---|---|---|
| `movePreviewDrag` | 已删 | 已删 | `usePreviewDrag.movePreviewDrag` |
| `endPreviewDrag` | 已删 | 已删 | `usePreviewDrag.endPreviewDrag` |
| `changeGalleryZoom` | 已删 | 已删 | `usePreviewDrag.changeGalleryZoom` |
| `beginPreviewDrag` / `startPreviewDrag` | 已删 | 已删 | `usePreviewDrag.beginPreviewDrag`（outfit 解构别名 `startPreviewDrag`） |
| `endPromptCategoryDrag` / `endOutfitPageDrag` | 已删 | 已删 | `usePreviewDrag.endDrag`（分别别名） |

### 5.2 保存目录族（已收口到 useSaveDirectory）
| 函数 | main.jsx | outfit-workflow.jsx | hook 真身 |
|---|---|---|---|
| `refreshSaveDirectory` | 已删 | 已删 | `useSaveDirectory.refreshSaveDirectory` |
| `confirmSaveDirectory` | 已删 | 已删 | `useSaveDirectory.confirmSaveDirectory` |
| `pickSaveDirectory` | 已删 | 已删 | `useSaveDirectory.pickSaveDirectory` |
| `openDirectoryModal` | 已删 | 已删 | `useSaveDirectory.openDirectoryModal` |

> 收口后 `frontend-duplication-check` 的 advisory 由 22 组降至 13 组（去 L1/L2 重复计入），`ok=true`、regressions/stale 均为 0。

---

## 六、结论与建议

1. **本单已消 2 组**（价格函数）+ **收口 9 组**（共享 hook），累计建议2 已收口 12 组（`videoDurationOptions` + 2 价格函数 + 9 同名克隆）。
2. **1 组已裁决不合并**（RF-040），**3 组 L1 陷阱不合并**，**1 组巧合不合并**，**3 组 L2 小关系 + 4 个大结构组不合并**——总计约 18 个独立关系判定为"不合并"。
3. 剩余 13 组 advisory 全部为"不强行合并"类别（RF-040 裁决组、L1 陷阱、巧合/结构克隆），无需进一步动作。
4. 全程**未改任何运行时行为**：合并组与 hook 收口组函数体逐字节一致；陷阱组/裁决组原样保留。

---
*生成时间：2026-10-13 · 复核人：人工（按脚本 advisory + 逐组读源码确认）*
