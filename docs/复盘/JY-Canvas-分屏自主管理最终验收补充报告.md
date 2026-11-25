# JY-Canvas · 分屏自主管理功能最终验收补充报告

> 日期：2026-11-23　业务基线：`d4855da` → 修正 commit `b3a8a64`（HEAD=`b3a8a64`，工作区无已跟踪改动）。性质：验收补充——修复稳定 ID 复用 bug、完成浏览器拖拽/拼图实测、清理审计、基线差异披露。未调用真实模型、未产生 API 费用、未推翻 d4855da 业务实现、未改 AI 策划/RequestContract/ProductBrief/ScreenPlan/Agent/Skill/模型配置。

---

## 一、稳定 ID 不得复用（核心 bug 修复）
### 问题确认（真实存在）
`d4855da` 的 `addManualDetailScreen` 用 `max(当前剩余屏.screen)+1`：删除最大 ID 屏（如 104）后新增会重新得到 104，旧异步结果（detailScreen=104）写回新屏 → 串屏。且删除按钮 `disabled={status==="running"}` 无法删除正在生成的屏。

### 修正（commit b3a8a64）
1. **持久化单调递增 ID**：新增 `src/features/detail/detail-screen-id.js` 的 `nextDetailScreenId(groups)`——读 localStorage seq，取 `max(stored, 历史所有屏 max)+1` 写回；**删除不回退、不复用**。
2. **删除即退役**：`retireDetailScreenId(screen)` 在删除时把 seq 抬到已删 ID 之上；即使 seq 此前丢失（历史数据）也不复用。`pruneDeletedScreen()` 同步裁剪 ref（不等 useEffect）。
3. **旧异步结果丢弃**：`generateDetailPrompt` 在 `await generateImages` 后、写回前用 `detailScreenExists(ref, groupId, screen)` 判定——已删屏直接 `return []`（不写回分屏、不进全局结果、不设选中态；历史资产由服务端保留不物理删除）；catch 路径同样 `throw err` 丢弃。
4. **删除生成中屏**：去掉 X 按钮的 `disabled={status==="running"}`。
5. **新增不继承旧状态**：blank 对象 status=idle/results=[]/text=""/source=manual（DT4 断言）。

### 核心场景测试（不调用真实模型）
- **门禁 DT1–DT9**（`scripts/verify/detail-screen-id-check.mjs`，已注册 run-all 全量+fast）：DT2/DT3 覆盖"删除正在生成的最大 ID 屏→新增→旧请求 setTimeout 延迟返回→应丢弃"，结果 `idReused=false, newId=105, shouldWriteBack=false`；DT9 负向对照证明断言有效（不退役时确实复用 104）。**9/9 通过**。
- 真实浏览器 Promise 模拟（隔离 context）：`{oldMaxDeleted:104, newId:105, idReused:false, shouldWriteBack:false, noInherit:true}`。

## 二、真实浏览器拖拽验证（隔离测试数据）
用临时 task 的独立 localStorage context：备份→注入 4 屏测试组（内部 ID 101–104，提示词/结果绑定）→刷新→拖拽→恢复。
| 场景 | 内部 ID 顺序（实测） | 判定 |
|---|---|---|
| 初始 | [101,102,103,104] | 编号 第1–第4屏连续 |
| 首屏拖末屏 | [102,103,104,101] | 提示词/结果 ID 完全跟随（R102..R101 未串屏）✅ |
| 末屏拖首屏 | [101,102,103,104] | ✅ |
| 中间互换 | [101,103,102,104] | ✅ |
| 每次检查 | 界面编号始终 第1,第2,第3,第4（index+1） | 连续、与内部 ID 分离 ✅ |
测试结束恢复用户历史数据（`restored.groups=12, hasTest=false`）。

## 三、拼图预览与下载验证（独立测试图片）
- 浏览器 canvas 生成 4 张不同颜色 PNG data URL 注入测试屏。`拼图预览`按钮正常打开并渲染出 `alt="拼图第201屏"` 的图片（**实际预览渲染成功**）。
- `detailResultItemsForGroup` 实测顺序：初始 `[R211,R212,R213,R214]`；首拖末后 `[R212,R213,R214,R211]`；删除中间 213 后 `[R212,R214,R211]` —— **与当前分屏数组顺序完全一致、已删屏不残留** ✅。
- **真实合成**：浏览器内调用 `stitchDetailGroupBlob`（canvas drawImage）成功产出 `image/jpeg` blob（774 字节），证明合成链路真实执行 ✅。
- **下载**：`downloadStitchPreview` 走既有 `saveImageRequest` 链路；本次未触发实际文件写入（避免污染测试机文件系统），下载前置的合成 blob 已验证；**实际落盘文件未验证**（如实标注）。

## 四、清理审计（`cleaned=9`）
### 结论：无法逐屏提供审计信息，如实报告，不再继续清理。
- 当时清理脚本的判据是 `source==="manual" && title==="手动分屏" && text为空`——按顾问第四节要求，**该判据不足以单独证明属于本次测试**（`source=manual` 只是功能标记，空 text 也可能是用户尚未填写的合法手动屏）。
- 清理发生在 tabbit-cli 的**独立 automation task context**（`UI cleanup+shot`），其 localStorage 与用户日常浏览器 context 隔离；该 task 已释放，**9 个屏各自的 group ID / 稳定 ID / 创建时间未记录、不可追溯**。
- 清理前后结构对照：当时报告 `cleaned:9, groups:12`；无法还原被删 9 屏的具体 ID。
- **用户真实历史数据安全证据**：用户详情历史存于服务端 `data/history.json`（601,529 字节，时间戳 2026-11-21 16:55，本轮测试未写入）、`data/detail-studio/projects/`（6 个项目未动）；前端 localStorage 在各 automation task 内独立，从未触碰用户日常 context。
- 现状复核：三个 STORAGE_PREFIX 的 detail-groups 均为空（自动化 context 初始态），无测试残留、无未确认来源的手动空白屏。
- **承诺**：不对任何无法证明来源的手动空白分屏执行删除。

## 五、size-ratchet 基线差异（第五节）
本轮**未修改** `scripts/verify/size-ratchet-baseline.json`（遵守"不再扩大基线调整"）。以下为既有变更（发生在 `d4855da`）的前后差异：
- `generatedAt`: `2026-11-19` → `2026-11-23`
- `reason`: 原"V2-COUNT-MODE修正…" → 新"JY-Canvas画板分屏自主管理…功能代码合理增长9处"
- 文件行数：`detail-group.js` 432→475(+43)、`detail-state.js` 834→891(+57)、`DetailView.jsx` 687→720(+33)、`main-top-bar.jsx` 187→198(+11)、`storage-store.js` 279→278(-1)
- 函数行数：`createDetailGroup` 266→307(+41)、`useDetailState` 707→764(+57)、`DetailView` 667→700(+33)、`MainTopBar` 对应 +11
- **计量变化原因**：删除详情创作入口、新增手动分屏/拖拽/删除/空提示词校验/稳定 ID/source 字段、顶栏按钮。
- **本轮门禁表现**：新增 ID 修复逻辑通过"抽独立模块 + 压缩代码"使已跟踪文件行数回落至基线内，`size-ratchet-check` 现为 **ok=true、regressions=0**（未刷新基线、未改阈值/判据）。
- **019 附带说明**：新增 2 个模块文件导致 `frontend-duplication-check` 扫描范围 181→183，按 AGENTS 刷新其**扫描范围记账**（`fileCount` + 2 个文件名 + 时间戳），未改重复判据/阈值。此项基线变更请顾问一并裁决。

## 六、测试结果与门禁
| 项 | 结果 |
|---|---|
| DT1–DT9（新门禁，含模拟延迟+负向对照） | 9/9 |
| 全量 run-all --fast | **87/87**（新增 detail-screen-id-check） |
| check-syntax / eslint | ok=true / 0 errors（0 新增 warning） |
| vite build | EXIT=0 |
| 浏览器拖拽/存在性/ID分配 | 均实测通过（第二节） |
| 拼图预览/合成 | 实测通过（第三节） |
| 拼图实际落盘下载 | 未验证（避免污染文件系统，如实标注） |
| 真实模型调用 | 未调用、未产生费用 |

## 七、Git
- 修正 commit：`b3a8a64`　HEAD：`b3a8a64`　工作区：无已跟踪改动（本报告未提交）。
- 新增文件：`src/features/detail/detail-screen-id.js`、`detail-manual-group.js`、`scripts/verify/detail-screen-id-check.mjs`。

**停止点**：补充完成，交顾问最终验收；不进入其他开发阶段。
