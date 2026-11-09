# 详情创作 · 服务端工作区目录契约

> 来源：V198 执行单 §2（Owner 2026-11-09「新功能一定要规范分类文件夹，方便后面的切割问题排查和修改」）。
> 与 `src/features/detail-studio/README.md` 是配对契约：业务区目录名前后端同名，便于按阶段切割与排查。

## 1. 分类原则

1. 路由装配统一在 `server/routes/detail-studio.routes.js`（既有惯例，`server/app.js` 无条件注册）；业务逻辑进 `server/features/detail-studio/<分类>/`。
2. 二级按「**技术底座 + 业务区域**」分类：`store/`（持久化）、`model/`（模型适配）、`probe/`（自检）是底座；后续阶段按业务区新增同名目录。
3. **启动链路零依赖叶子**：`store/` 与 `model/` 只依赖 Node 内置模块与 `server/core/app-paths.js`，禁止引入特性模块群——public 生产打包的模块初始化期 TDZ 会整应用白屏（本仓已咬三次），`build EXIT=0` 与 Node 单测都抓不到。
4. 业务区之间不互相 import；统一由 `server/routes/detail-studio.routes.js` 装配，跨区数据只经 `store/`。
5. 区内单文件建议 ≤300 行，超出时先在本区内拆。
6. 新目录必须同步登记到当阶段执行单与本文件。

## 2. 当前目录

```text
server/routes/detail-studio.routes.js         路由装配：无条件注册，严禁 NODE_ENV === "production" 提前 return

server/features/detail-studio/
├── README.md                                 本文件（目录契约）
├── store/project-store.js                    项目持久化：原子写(tmp+rename) / .bak 回退 / index.json 单写入器链（schema v2）
├── model/model-config.js                     文本/图片模型适配单点：重点 A 推荐默认 + selectable 标志，禁止散落到业务模块
├── probe/capabilities.js                     能力清单 + 文本模型探针(接 textModel) + /api/images 请求体预检
└── intake/mode-c.js                          模式 C 纯函数：提示词整理 tidyPrompt / 行级差异 computePromptDiff / 分屏边界 splitIntoScreens（零 AI 依赖，screens 仅解析识别、不生成）
```

| 目录 | 职责 | 允许 import |
|---|---|---|
| `store/` | 项目 JSON 持久化，零依赖叶子 | Node 内置、`app-paths.js` |
| `model/` | 模型名与 spec 的唯一适配点，零依赖 | 无 |
| `probe/` | 复用现有模型链路做连通性自检 | `server/core/*`、`store/`、`model/` |

## 3. 数据与模型边界（红线）

- 项目数据只落 `data/detail-studio/projects/`（`index.json` + 每项目 `project.json`）。
  **不进** `data/results`（`cleanupResultCache` 按 7 天 TTL 清理）、**不进** `seed/manifest.json`、**不进**安装包默认种子，**不允许**封装版安装或首启覆盖用户项目。
- 文本模型：`server/core/ai-chat-shared.js#postChatCompletion` → 单网关 `/chat/completions`；KEY 走 `resolveApiKey` 只在请求内存活，不落盘、不写日志、不回显。
- KEY 红线（Owner 原则）：整个画板只在设置页填一次 KEY。**详情创作前端视图禁止出现 KEY 输入**；`apiKey` 由 `src/features/detail-studio/state/use-detail-studio-state.js` 从全局设置存储（`STORAGE_KEY` + `normalizeApiKeyInput`）读取（与 ai-canvas / video / detail 同源），本视图不新建任何 KEY 输入框或常量；无 KEY 且服务端无内建 KEY 时由前端面板提示「请到设置页填写」。
- 图片：只复用现有 `POST /api/images`；`probe` 只组装并校验请求体契约，**不实际调用上游、不产生费用**。
- **严禁修改**：`server/channel-config.js`、`server/channel.js`、`src/shared/routing.js`、`server/core/image-concurrency.js`、`server/core/ai-chat-shared.js`、`server/routes/detail.routes.js`、`server/ai-tryon/task-store.js`、`scripts/verify/routing-check.mjs`。
- R2 通用持久化任务层抽取授权留**阶段 4**（批量生成与任务管理）落地并单独验证旧换装任务兼容；阶段 1 不动 `server/ai-tryon/task-store.js`。

## 4. 后续阶段业务区归属表（规划占位，不预建空目录）

| 阶段 | 新增业务区目录 | 承载 |
|---|---|---|
| 2 | `intake/` | 三种创作模式入口、商品事实资料、参考图职责分类 |
| 3 | `planning/` | 商品分析、消费者购买逻辑、Storyboard、提示词冻结、质量检查 |
| 4 | `generation/` | 最多 20 屏、任务状态、失败重试、断点恢复、幂等 |
| 5 | `versions/` | 单屏连续编辑、版本历史、版本切换 |
| 6 | `export/` | 整体预览、项目保存恢复、批量导出 |

## 5. 排查顺序

`本 README 目录契约 → 定位业务区目录 → server/routes/detail-studio.routes.js 路由 → src/api/detail-studio.js 前端出口`。

- 路由 404：先确认 `server/app.js` 的 `registerDetailStudioRoutes(app)` 是否还在，且**没有**被 `NODE_ENV` 分支包住（public 打包会死代码消除）。
- 数据丢失：查 `data/detail-studio/projects/`，并确认没被误放进 `data/results`；`.bak` 是上一次写入的回退副本。
- public 首启白屏：优先查启动链路是否混入了非叶子依赖（`store/` / `model/` 是否被加了 import）。
- 文本/图片链路异常：查 `probe/capabilities.js` 的 `channelBaseCandidates()` 与 `postChatCompletion`，**不要**改渠道配置或并发模块。

## 6. 切割原则

- 以业务区为最小搬迁单位，一次只切一个区，切完跑完整门禁 + public 首启冒烟。
- 新增 `server/routes/*.js` 会被 `server-duplication-check.mjs` 扫描：顶层函数名必须独特，避免与既有文件跨文件同名（用 `detailStudio*` 前缀）。
- `server/features/**` 不在 `server-duplication` 真相源内，但仍会被 `check-syntax.mjs` 与 `source-hygiene-check.mjs` 扫描，新文件必须语法与字节都干净。
