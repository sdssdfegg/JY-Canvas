# shared/ui 目录

> 总纲（前端 UI 全局规范）：`docs/V4.0-前端UI全局规范方案.md`
> 旧按钮类 → `<Button>` 的 size/tone 映射：总纲 §4.2。
> 颜色 / 尺寸令牌（唯一样式来源）：`src/styles/tokens.css`。

这里放多个页面共用的 UI 组件。目标是避免同类 UI 在不同功能里各写一套，导致只改一个页面、另一个页面不同步。

## 必须优先共用的 UI

| UI 类型 | 当前重复风险 | 以后组件名建议 |
| --- | --- | --- |
| 普通按钮、图标按钮、危险按钮 | `main.jsx` 和 `outfit-workflow.jsx` 都有 | `Button.jsx`、`IconButton.jsx` |
| 设置弹窗 | 主画板和批量页都有 KEY/皮肤设置 | `SettingsModal.jsx` |
| 上传区 | 快捷/参考/详情/批量都有上传预览 | `UploadZone.jsx` |
| 结果图库卡片 | 快捷结果、参考结果、批量结果都有 | `ResultCard.jsx`、`ResultGrid.jsx` |
| 参考图缩略条 | 快捷、批量、详情结果都可能用 | `ReferenceThumbTray.jsx` |
| 顶部工具栏 | 主画板和批量页都有刷新、下载、清空、打开目录 | `TopToolbar.jsx` |
| 状态徽标 | running/success/failed/queued 多处重复 | `TaskBadge.jsx` |
| 弹窗底层 | 设置、预览、提示词、裁剪都用 | **已抽：`Modal.jsx`（`Modal` + `ModalHeader`）** |

## 已抽取的组件

| 组件 | 覆盖范围 | 说明 |
| --- | --- | --- |
| `Modal.jsx` | 遮罩层 + 面板 + 点遮罩关闭 + 面板阻止冒泡；`ModalHeader` 提供标题/副标题/关闭按钮 | 2026-09-25 抽取。已接入快捷/批量两侧的**裁剪弹窗**（`QuickCropViewportModal`、`CropModal`）与**局部回贴弹窗**（`QuickLocalEditModal`、`OutfitLocalEditModal`）。只共享外壳与通用交互；裁剪几何、蒙版绘制、请求参数、保存行为仍各自保留。**刻意没有**加 Esc 关闭与 body 滚动锁——抽取前这四个弹窗都没有，加了就是改交互。其余弹窗（设置、预览、提示词等）仍各写一份，可作为后续迁移对象。 |
| `Button.jsx` | 全站通用按钮：`size`(sm 28 / md 36 / lg 44) × `tone`(default / primary / danger / ghost) + `iconOnly` / `loading` / `active`；样式统一在 `ui.css`（`.ui-` 前缀，单份）；`ModalHeader` 关闭钮也用本组件 | 2026-10-16 建（V70）。变体矩阵与旧类映射规则（`smallButton`/`iconButton`/`primaryButton`/`secondaryButton`/`toolbarButton`/`dangerButton`/`modeTab`/`tabButton`/`generateButton`/`promptTab`/`newPromptButton` → 对应 `<Button>` 的 size/tone）见总纲 §4.2。换装模块 36 钮 + 换装设置弹窗 7 钮 + `ModalHeader` 关闭钮已接入；旧全局按钮类（9 类基础块）作为过渡层保留至 V75 收口单删除。 |
| `Toolbar.jsx` | 操作条容器：`align`(start/end) + `wrap` + `gap` + `className`；flex + `--space-2` 间距 | 2026-10-16 建（V72）。主顶栏 `.topActions` 操作区已接入（`align="end" wrap`）；弹窗 footer / 卡片操作行后续按版块接入（V73+）。 |
| `Field.jsx` | 表单项三段式：`label`(ReactNode 可含图标) + children(控件) + `hint` + `hintTone`(default/danger/success) + `as`(label/div) + `className` | 2026-10-16 建（V72）。默认 `<label>` 外壳保持点击聚焦（原 `modalField` 语义）；`as="div"` 用于"标题+说明+动作"区块（原 div 语义，避免 label 隐式关联误触）。换装设置弹窗 3 处已接入（API Key / 保存目录 / 连接测试）。 |
| `Panel.jsx` | 版块外壳：`padding`(md 16px / lg 24px) + `tone`(default / strong) + `className`；grid 堆叠、gap=--space-4、1px 边框 + radius-lg 圆角 + 面板底 | 2026-10-17 建（V73）。替代 `.skinBlock` / `.debugBlock` 一类手写卡片容器；设置视图三分区已接入（皮肤 / 连接测试 / 数据与存储）。 |
| `ModuleHeader.jsx` | 分区标题：`icon`(可选 lucide) + `title`(14px/500) + `subtitle`(12px muted) + `action`(右侧节点) + `divider`(默认 true 1px 分隔线) | 2026-10-17 建（V73）。替代手写 `<span><Icon/> 标题</span>`；设置视图三分区标题已接入。 |
| `UploadClearButton.jsx` | 上传模块统一「清除」钮：`sm` 28px / `default` 中性灰、纯文字「清除」、无图标、挂在模块右上角 | 2026-10-17 建（V82）。替代换装 `UploadZone` 旧 `Trash2+清除` 危险钮与视频「清空参考」smallButton 的图标+文字堆叠溢出；详情/参考生图 `DetailUploadZone` 新增同形清除钮。size/tone 不开 prop，统一视觉防分叉；上游模块经 `onClear` 接各自清空 handler。 |

| 局部编辑/裁剪控件 | 快捷和批量都有 | 后续放 `src/features/local-edit/`，公共底层放 `src/shared/` |

## 修改规则

1. 如果两个以上页面长得一样或行为一样，先抽到 `src/shared/ui/`。
2. 功能页面只传参数，不复制 CSS 和 JSX。
3. 共享组件必须支持必要的变体，例如 `variant="danger"`、`size="small"`、`active`、`disabled`。
4. 共享组件样式只维护一份，功能页不要重新覆盖同名样式。
5. 如果暂时不能抽组件，必须在 `V11维护文档/02-重复功能同步登记表.md` 记录“改 A 要同步看 B”。

## CSS 规则

已建立（V70 起）：

```text
src/shared/ui/ui.css        通用按钮、弹窗、上传、图库、状态
src/features/<name>/*.css   功能私有布局和少量特殊样式
```

不要让同一个概念同时存在 `.toolbarButton`、`.smallButton`、`.legacyAction`、`.referenceToolButton` 等多套样式却长得相似。后续要逐步合并为统一组件变体。
