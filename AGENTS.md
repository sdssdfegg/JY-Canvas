# Codex 工作规则

**当前源码目录 = 本工作区** `D:\源码开发\静音AI画板v4.0源码`（V11 源码的 v4.0 重构 clone；`package.json` 为 `jingyin-internal-canvas` v11.0.0）。所有改动落在这里，日常命令用目录自带的 `runtime\node\node.exe`。

> 2026-10-01 更正：原文写的是 `D:\静音AI绘画V11（源码）` —— 该路径在本机不存在（执行者已两次踩到）。V11 源目录（若有）只作为 `upstream` 对照，**默认不读取、不修改**。V10、V9、V8、V5、旧 `D:\RJ\ai-canvas` 和各 `静音AI绘画-WIN（V*）` 目录仍只作为备份、发布包或排查对象，默认不读取、不修改。

## 默认忽略

- `node_modules/`
- `dist/`
- `.secure-build/`
- `.release-temp/`
- `.codex-artifacts/`
- `data/`
- `logs/`
- 发布包目录 `D:\RJ\静音AI绘画-WIN（V*）`
- 旧安装/asar 修补目录 `D:\RJ\ai-canvas`

## 开发流程

1. 先确认本次目标、模块、复现方式和验收标准。
2. 用 `rg` 定位相关代码，避免全目录大范围读取。
3. 只改和本次目标直接相关的文件。
4. UI 或功能逻辑改动先看 `docs/V11维护文档/00-总索引.md` 和 `docs/V11维护文档/02-重复功能同步登记表.md`，确认是否有同类重复点需要同步。
5. API、KEY、登录授权、接口慢、401、413 问题先看 `docs/V11维护文档/04-API调用与登录系统地图.md`、`src/api/README.md`，不要在页面组件里散写 `fetch`。
6. 批量 tab 单独调整先看 `docs/V11维护文档/05-批量分区功能地图.md` 和 `src/features/outfit/workflows/<分区>/README.md`。
7. 默认提示词、SKILL、出图规则先看 `prompts/README.md`；优先改 `prompts/`，不要在 UI 重构时顺手改提示词。
8. 服务端改动至少运行 `runtime/node/node.exe scripts/verify/run-all.mjs`（或 `npm run check`）。
9. 前端或发布相关改动按风险运行 `runtime/node/node.exe node_modules/vite/bin/vite.js build`（或 `npm run build`）。
10. 默认只提交本次相关文件，避免混入已有未提交改动。

## 文档存放纪律

> V40 文档治理确立（2026-10-07 生效）。根目录只保留 5 份常设 md（AGENTS.md / README.md / 版本记录.md / V3-封存说明.md / V4.0-起步说明.md），其余 md 按生命周期归入 `docs/`，禁止扁平堆在根目录。

1. 新执行单一律建在 `docs/执行单/进行中/`，命名 `V4.0-执行单-Vxx-主题.md`（V 号顺延，主题用短横线连接）。
2. **交付当天**：把单文件移入 `docs/执行单/已完成/<YYYY-MM>/`，并同步更新 `docs/执行单/README.md` 总表（回填状态、关联 commit、完成日期）。总表是唯一索引，不更新等于白做。
3. 根目录禁止新增 md 文件；例外仅限 `AGENTS.md` / `README.md` 自身的维护。
4. 汇报类文档（执行汇报 / 隐患复查 / 自检汇报）一律进 `docs/复盘/`，禁止再在根目录生成 `*-执行汇报-YYYY-MM-DD.md`。
5. 所有 md 必须纳入 git 跟踪（游离文件先 `git add` 再操作），避免迁移/重命名时丢失。
6. 分类归口：设计类（`V4.0-设计-RF-*`）→ `docs/设计/`；台账与巨型存档（`REFACTOR_*`）→ `docs/存档-台账/`；方案/规划类并入 `docs/` 根（与既有工具文档同处）；交付报告 → `docs/历史交付报告/`。

## 基线 / 文档漂移门禁（V4.0 规范，2026-10-13 生效）

> 背景：V4.0 起步阶段连续踩到两类「代码改了、但配套物停留在旧位置」的漂移 ——
> ① 抽组件后忘了跑 `shared-ui-duplication-check.mjs --update`，基线 JSON 一直挂着陈旧的重复记账；
> ② README 写死 `D:\静音AI绘画V11（源码）\...`，该路径本机根本不存在却长期没人发现。
> 下面把"防漂移"固化成纪律，并由 `scripts/verify/` 的自动门禁兜底。

1. **改完代码必须同步配套物，再提交。** 任何以下动作后，立刻跑对应步骤，再跑 `npm run check` 全绿才准提交：
   - 移动 / 拆分文件、抽共享组件 → 跑 `shared-ui-duplication-check.mjs --update`、`frontend-duplication-check.mjs --update` 等刷新基线。
   - 改 `server/core/runtime-config.js` 默认值 → 先更新 `runtime-config-baseline.json` 再提交（或直接改基线并写明理由）。
   - 改 lint 规则 → 跑 `lint-ratchet-check.mjs --update`。
2. **文档只准用仓库相对路径，禁止写死本机绝对路径。** README / `docs/` / 根目录 md 里若出现本机不存在的绝对路径，会被 `docs-path-check.mjs` 判红并拦下提交。引用其它仓库（如上游克隆源）也优先用相对路径或显式标注。
3. **提交前门禁已自动化。** 项目提供 `scripts/git-hooks/pre-commit`：启用后每次 `git commit` 自动跑 `run-all.mjs --skip-launcher`，任一门禁失败即拦下提交。启用命令（仓库根执行）：
   `cp scripts/git-hooks/pre-commit .git/hooks/pre-commit`
   停用：`rm .git/hooks/pre-commit`。CI 侧也应把 `npm run check` 作为必过门禁。
4. **不要带"半截改动"进提交。** 代码已修、但基线 JSON 没刷新 / 文档没更新 / 起步说明没同步的情况，一律视为未完成，先收口再提交。
