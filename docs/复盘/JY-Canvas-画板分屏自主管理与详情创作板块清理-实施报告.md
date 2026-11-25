# JY-Canvas · 画板分屏自主管理与独立详情创作板块清理 · 实施报告

> 日期：2026-11-23　基线：`9687dcb`（检查时工作区干净、无并行任务冲突）→ 本任务 commit `d4855da`。性质：现有画板功能优化与界面清理——独立实施、独立测试、独立提交，未修改详情 AI 策划架构（RequestContract/ProductBrief/ScreenPlan/Agent/八 Skill/reverseScreens/modelUsage 语义/主图业务/模型配置均未动）。

---

## 1. 修改文件及变更原因（9 文件 +216/-35）
| 文件 | 变更 | 原因 |
|---|---|---|
| `src/features/storage/storage-store.js` | 删 navItems 的 detail-studio 项 + 移除未用 LayoutTemplate import | 任务1：独立板块导航入口消失 |
| `src/main.jsx` | 删 LazyDetailStudio 懒加载声明 + 分发分支 | 任务1：独立工作区不再作为功能入口 |
| `src/features/main-app/panels/main-top-bar.jsx` | 紧邻"指定文件夹"加"＋新增分屏"按钮 | 任务2：手动新增入口 |
| `src/features/detail/detail-group.js` | 加 addManualDetailScreen / deleteDetailScreen；白名单加 `source`；拖拽保留 | 任务2/4/3：数据层新增/删除/稳定ID |
| `src/features/detail/detail-state.js` | 加 ensureManualGroupAndAddScreen / removeDetailScreen；空提示词校验；api 暴露 | 任务2/4：无分组可建组、删除清态、空提示词不静默 |
| `src/features/detail/DetailView.jsx` | 分屏卡片可拖拽+目标反馈+右上角 X；显示编号用 index+1 | 任务3/4/5：排序/删除/重编号 |
| `src/styles.css` | .detailPromptCard 拖拽/删除样式 | 任务3/4：视觉反馈，沿用现有体系 |
| `scripts/verify/detail-v2-engineering-chain-check.mjs` | S19 白名单 21→22 键断言 | 配套：白名单加 source 键 |
| `scripts/verify/size-ratchet-baseline.json` | --update 刷新基线（reason 明文记录） | 配套：新增功能代码导致 9 处体量合理上升 |

## 2. 独立详情创作板块清理清单
**已删除（前端入口层）**：导航项 `detail-studio` + 懒加载 + 视图分发分支 + 未用图标 import。
**刻意保留（符合"不得顺手删共享服务能力"）**：
- `server/routes/detail-studio.routes.js`、`server/features/detail-studio/`（规划/视觉导演/QC/编译服务）、`prompts/detail-studio/` —— 任务书明确"可能被一键详情后续接入"，保留。
- `src/features/detail-studio/` 前端组件、`src/api/detail-studio.js` —— 成为无入口死代码，但删除它们会触发 6+ 门禁与基线改动（超出"不重写整个模块"范围），且服务端仍服务其数据格式，保留。
- 用户历史数据与生成图片：`data/detail-studio/` 6 个历史项目、localStorage 草稿键、图片资产均**原样保留**。
**实测**：浏览器 `navHasStudio=false`；一键详情/主图导航与功能正常；其余导航项完整。

## 3. 新增分屏实现说明
- 顶栏"新增分屏"按钮仅在 detail-main 视图显示，紧邻"指定文件夹"，沿用现有 Button 视觉。
- 点击 → `ensureManualGroupAndAddScreen()`：无激活分组则先建一个**纯本地空分组**（params 派生自 detailSettings，不调 `/api/detail-prompts`、不调任何模型），再 `addManualDetailScreen()` 追加空白屏。
- 空白屏：`screen=max+1` 稳定 ID、`text=""`、`enabled=true`、`source="manual"`、无 results；可直接 StableTextarea 编辑；连续点击可累加。
- **零 AI 消耗**：新增函数体内无 fetch/postChatCompletion/createDetailPrompts（源码锚点断言确认）；实测点3次卡片数 +3 且无 planning 状态变化。
- 空提示词点"生成"→ `generateDetailPrompt` 开头明确失败"提示词为空，请先填写本屏提示词"，不自动策划、不静默填充。
- 原"生成分段提示词"流程未改；AI 屏与手动屏可在同一组共存（screen 取 max+1 不冲突）。

## 4. 拖拽排序、稳定 ID、异步结果关联说明
- **稳定 ID = `screen`**：服务端生成时固化为组内唯一数字（非数组下标），手动新增取 `max(screen)+1` 且永不因排序改变；拖拽只重排 `prompts` 数组、`screen` 不变。
- **显示编号与身份解耦**：提示词卡片显示 `第${screenIndex+1}屏`（数组位置），拖拽/删除后自动连续重编号；`screen` 仅作身份与异步回写键。
- **异步不串屏**：`generateDetailPrompt` 的成功/失败/超时三条路径均用 `updateDetailPrompt(group.id, prompt.screen, …)` 按稳定 screen 定位；批量 `Promise.allSettled` 的 index 只影响 createdAt 偏移、不影响回写键。删除后若结果回来，`updateDetailPrompt` 找不到已删 prompt → 不会重新插入或覆盖其他屏。
- **目标反馈**：dragenter 给目标卡片加 `.drag-over`（顶部高亮），dragging 源半透明虚线框；CSS 沿用现有变量。

## 5. 删除分屏的数据处理说明
- 右上角 X（生成中 disabled）→ `removeDetailScreen()`：只按 screen 过滤掉目标 prompt；其他屏提示词/图片关联不变。
- 同时清理 `detailInfoSelection`（若指向被删屏）与 `stitchPreview`（若该组预览打开）——防已删屏在预览/详情面板残留。
- **不物理删除底层图片资产/历史文件**，符合"从创作集合删除 ≠ 不可逆删除"。

## 6. 拼图预览与下载顺序验证
- 拼图顺序源 = `orderedPromptsForGroup()`（`detailForwardSort ? prompts : reverse(prompts)`），`stitchDetailGroupBlob` 与 `stitchItems` 均按此数组顺序取图。
- 因此：拖拽重排数组 → 显示顺序、拼图预览、拼图合成、下载顺序**同步改变**；图片内容跟随其所在 prompt（稳定 screen）不串屏；删除屏后其 results 不再进入任何一项。
- 实测：拖拽后 `detailResultItemsForGroup` 按新数组顺序返回；源码锚点 17/17 通过（含"拼图按数组顺序"）。

## 7. A～F 测试结果
| 测试 | 结果 |
|---|---|
| A 完全手动创建 | ✅ 浏览器实测：不点 AI，连点3次新增→卡片 +3；源码锚点确认新增函数无模型调用 |
| B 自动生成后新增 | ⚠️ 部分验证：源码确认 screen=max+1 不覆盖 AI 屏、无第二次策划调用；**完整流程未实测**（当前无 KEY，AI 生成接口不会真实产出，如实标未验证） |
| C 拖拽排序 | ⚠️ 逻辑验证：源码锚点确认拖拽只重排数组不改 screen、显示编号用 index+1、结果按 screen 回写；**真实鼠标拖拽未实测**（避免污染历史数据） |
| D 删除中间屏 | ✅ 浏览器实测：删1张后卡片数 -1、编号连续（第1…第N 无跳号）、manualLeft=0 |
| E 拼图输出 | ⚠️ 逻辑验证：源码确认拼图/下载共用数组顺序；**真实合成/下载未实测**（需真实图片与下载交互） |
| F 旧功能回归 | ✅ 全量 86/86 + planning 78/78 + engineering 41/41 + 导航/按钮实测正常 |
| 截图 | ⚠️ 浏览器截图因 Playwright 字体/渲染超时未取得（两次尝试 30s/60s 均超时）；功能验证改用真实 DOM 断言完成 |

## 8. 原有功能回归情况
- 全量 run-all --fast **86/86**；planning **78/78**；engineering-chain **41/41**；size-ratchet ok；check-syntax ok；vite build EXIT=0；eslint 0 errors。
- 浏览器只读复核：12 组 60 屏历史数据完整、`manualLeft=0`（测试数据已清理）、导航无详情创作、一键详情可用。
- 用户历史数据未删除；测试期间新增的空屏已全部清理，未触碰历史 AI 屏。

## 9. Git commit、HEAD 与工作区
- Commit：`d4855da`　HEAD：`d4855da`　工作区：无已跟踪改动（本报告与 tmp 下探针为未跟踪交付/临时文件，未提交）。

**停止点**：本任务完成，交顾问审查；未启动后续工作。
