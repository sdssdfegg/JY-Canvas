# 详情创作 · 前端工作区目录契约

> 来源：V198 执行单 §2（Owner 2026-11-09「新功能一定要规范分类文件夹，方便后面的切割问题排查和修改」）。
> 本文件是**目录规范真相源**：新增文件、切割模块、排查问题前先读这里。改目录结构必须同步改本文件并登记到当阶段执行单。

## 1. 分类原则

1. 一级目录沿用项目惯例：`src/features/<feature>/`；请求出口统一在 `src/api/`，不新造顶层目录。
2. 二级按「**技术底座 + 业务区域**」分类：底座承载跨阶段复用件，业务区承载阶段专属实现。
3. 一个业务区一个目录；后续阶段新增能力必须进对应业务区，禁止堆回 feature 根目录。
4. 跨区通信只经统一出口：`state/`（业务状态）与 `src/api/detail-studio.js`（网络请求）。业务区组件之间不直接 import。
5. 区内单文件建议 ≤300 行；超出时先在**本区内**拆小文件，不新开业务区、不外溢职责。
6. 启动链路零依赖叶子：`constants/` 不 import 任何模块；`state/` 只 import React 与 api 层。
7. 新目录必须在当阶段执行单与本文件各登记一行，禁止先斩后奏。

## 2. 当前目录

```text
src/api/detail-studio.js                      唯一请求出口（api-layering 白名单内）

src/features/detail-studio/
├── README.md                                本文件（目录契约）
├── constants/workspace-contract.js          零依赖叶子：模式枚举 / 标签 / 屏数上限 / 自检默认值
├── state/use-detail-studio-state.js         独立业务状态；项目级 truth 来自服务端，不依赖 localStorage
├── components/
│   ├── DetailStudioView.jsx                 工作区根视图：只做布局与组合，零业务逻辑
│   ├── DetailStudioProjectPanel.jsx        业务区① 项目列表 + 新建
│   ├── DetailStudioBasicsPanel.jsx         业务区① 当前项目基础信息查看与保存
│   ├── DetailStudioCapabilityPanel.jsx     基础设施：能力自检（单行状态条 + 折叠开发者信息）
│   └── FlowGuidanceBar.jsx                 V201 主流程引导条：当前阶段 / 已完成 / 下一步 + 主按钮（不触发生图）
├── intake/
│   ├── ModelChannelConfigPanel.jsx         重点 A：推理模型 / 图片模型 / 渠道三独立下拉（V201 已迁左列），配置随项目保存
│   ├── IntakeArea.jsx                      录入区组合：商品资料 + 参考图 + 当前模式专属面板（零业务逻辑）
│   ├── ProductDataPanel.jsx                §4 商品资料录入（fields + text），随项目保存
│   ├── ReferenceImagesPanel.jsx            §4 参考图分块面板：三类角色各挂一个 ReferenceImageDropzone
│   ├── ReferenceImageDropzone.jsx          V201 参考图批量上传：点击 / 拖拽 / 粘贴、多文件、缩略图预览、按角色分块
│   ├── mode-a/GuidedIntakePanel.jsx        §3 模式 A 引导式录入骨架（V201 去 checklist 语义，改必填/可选标签化；不 import planner / skill）
│   ├── mode-b/AssistedIntakePanel.jsx      §3 模式 B 保留原意录入骨架（不 import planner / skill）
│   └── mode-c/DirectPromptPanel.jsx        §3 模式 C 四份边界（raw / tidy / diff / frozen，禁止 import planner / skill）
├── planning/
│   └── PlanningPanel.jsx                   阶段 3 规划面板：商品分析展示 / A 模式 completeness>0.8 停追问 / 导演分屏 ScreenSpec[] 结构化审阅 / 编译冻结 / B4 质量审查六类检查。**红线：只调 state 动作与 src/api/detail-studio.js，禁止 import planner / skill / 策划模块**
├── generation/
│   └── GenerationPanel.jsx                 阶段 4 批量生成与任务管理面板：整体进度(成功/失败/待确认/已取消/百分比) + 单屏任务列表 + 每屏重试/取消。只做展示与触发，业务逻辑(排队/并发闸门/幂等/失败隔离/重试/恢复)全在服务端 orchestrator；复用 Button/TaskBadge；CSS 零 hex；挂载顺序按客户操作序在 PlanningPanel 之后
└── styles/detail-studio.css                 私有样式：零 hex、零 :root 新变量，全用 tokens.css 语义令牌
```

| 目录 | 职责 | 允许 import |
|---|---|---|
| `constants/` | 纯常量与契约，跨阶段复用 | 无（零依赖叶子） |
| `state/` | 业务状态与所有异步动作（含 §4 商品资料 / 参考图、§3 模式 C 四边界动作） | React、`src/api/detail-studio.js` |
| `components/` | 视图，按业务区分文件 | `src/shared/ui/`、`constants/`、`state/` 经 props、api 层 |
| `intake/` | 录入区组合与 §3/§4 面板（商品资料、参考图、三种模式专属面板）。**红线：任何面板禁止 import planner / skill / 策划模块** | `src/shared/ui/`、`constants/`、`state/` 经 props、`src/api/detail-studio.js`（仅经 state 动作间接触发） |
| `planning/` | 阶段 3 规划面板（分析 / 分屏 / 冻结 UI）。**红线：禁止 import planner / skill / 策划模块**，只经 state 动作触发 | `src/shared/ui/`、`state/` 经 props、`src/api/detail-studio.js`（仅经 state 动作间接触发） |
| `generation/` | 阶段 4 批量生成与任务管理面板（进度 / 任务列表 / 单屏重试取消）。**红线：只经 state 动作触发，禁止 import 服务端模块 / 策划模块** | `src/shared/ui/`、`state/` 经 props、`src/api/detail-studio.js`（仅经 state 动作间接触发） |
| `styles/` | 本 feature 私有 CSS | 无 |

## 3. 后续阶段业务区归属表（规划占位，不预建空目录）

| 阶段 | 新增业务区目录 | 承载 |
|---|---|---|
| 2 | `intake/` | 三种创作模式入口、商品资料、参考图分类；重点 A 模型与渠道配置面板（ModelChannelConfigPanel.jsx，三独立下拉随项目保存） |
| 3 | `planning/` | 商品分析、消费者逻辑、Storyboard、提示词冻结、质检 |
| 4 | `generation/` | 最多 20 屏、批量任务、状态、失败重试、断点恢复（**阶段 4 已落地**：`generation/GenerationPanel.jsx`，业务逻辑全在服务端 `server/features/detail-studio/generation/`） |
| 5 | `versions/` | 单屏连续编辑、版本历史、版本切换 |
| 6 | `export/` | 整体预览、项目保存恢复、批量导出 |

建目录时同步：① 当阶段执行单登记；② 本文件 §2 目录树与 §3 归属表更新；③ 跑完整门禁（新增 src 文件会撞 `frontend-duplication` 的 `fileCount` 基线，按 R6 授权 `--update --reason`）。

## 4. 排查顺序

`本 README 目录契约 → 定位业务区目录 → 区内具体文件 → state/ 与 src/api/detail-studio.js 出口 → main.jsx 的 lazy 分发分支`。

- 视图不显示 / 白屏：先看 `main.jsx` lazy 分支与 `storage-store.js` 的 `navItems`，再看根视图与 `ErrorBoundary`。
- 数据没保存：看 `state/` → `src/api/detail-studio.js` → `server/routes/detail-studio.routes.js` → `server/features/detail-studio/store/`。
- 模型调用异常：看 `server/features/detail-studio/model/` 与 `probe/`，**不要**去改 `server/channel-config.js` / `src/shared/routing.js` 等红线文件。

## 5. 切割原则

- 以**业务区为最小搬迁单位**，一次只切一个区，切完跑完整门禁。
- 切割不改动该区对外的 props / api 契约；需要改契约时先在当阶段执行单登记。
- 禁止把业务区文件合并回一个"大 View"，也禁止跨区复制常量（一律回 `constants/`）。

## 6. 红线

- 旧 `src/features/detail/**` 保持原状，本工作区不 import、不修改。
- 不引入第二套模型 Provider / API Key / 网关 / 图片生成体系；图片只经 `src/api/images.js` → `/api/images`。
- 组件一律用 `src/shared/ui/`，禁止新写旧按钮类；CSS 禁止 hex 与新建 `:root` 变量。
- 项目数据只落服务端 `data/detail-studio/projects/`，不进 `seed/manifest.json`、不进浏览器 localStorage。
- KEY 红线（Owner 原则）：整个画板只在设置页填一次 KEY，详情创作视图（及任何其他视图）**禁止出现 KEY 输入**。`apiKey` 一律由 `state/use-detail-studio-state.js` 从全局设置存储（`STORAGE_KEY` + `normalizeApiKeyInput`）读取，与 ai-canvas / video / detail 同源；无 KEY 且服务端无内建 KEY 时由面板提示「请到设置页填写」，不在此视图新建任何 KEY 输入框或常量。
