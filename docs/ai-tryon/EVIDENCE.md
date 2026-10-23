# EVIDENCE — 源码证据清单 / 能力缺口表 / 实验记录索引

> 总纲铁律：结论必须附源码路径或命令输出。本文件是 P0-A 的核验底稿。
> 核验人：统筹 ｜ 日期：2026-10-22 ｜ 基线：main `c0c75b7`（tag `v4.0`）。

## 一、源码证据清单（逐项带 文件:行号）

| # | 事实 | 证据位置 | 结论 |
|---|---|---|---|
| S1 | 模型真实 ID：GPT 系 `tt-image-2`/`tt-image-2.5`；香蕉系 `banana-2`/`banana-2.1`/`nano-banana-pro` | `src/shared/models.js:9-49` | 总纲「GPT 2.5」=`tt-image-2.5`，「香蕉 Pro」=`nano-banana-pro` |
| S2 | **已有按模型能力声明**：maxInputImages / maxPromptLength / maxImageBytes / supportedSizes / supportedVersions / supportedBackgroundModes / supportsCustomSize；越界即拒（imageCount>maxInputImages） | `server/channel-config.js:62,145,155,168,180,190,234,277`；读取器 `server/channel.js:210-231`（`validateModelCapabilities`/`routingModelCapabilities`） | **能力矩阵的现成基座**——P1 起扩展此结构，不新建第二套 |
| S3 | A+B 多参考图：换装生成把 A 模特 + B 服装（+参考）按序 append 进同一 `image` 字段 | `src/features/outfit/handlers/outfit-batch-execution.js:365,380,385-390` | 多图传输已通，P0 验证的是**上游理解质量** |
| S4 | 多图时上游自动走编辑端点：`hasImages ? "/images/edits" : "/images/generations"` | `server/channel.js:55` | 双图换装实际打在 `/images/edits` |
| S5 | Mask 上传通道存在：multer `{ name: "mask", maxCount: 1 }`，maskFile 进渠道参数 | `server/routes/outfit.routes.js:137,395-396` | 通道具备 |
| S6 | **标准换装流程把 mask 置空**：`if (!outpaintWorkflow && !payload.maskEdit) { maskFile = null; }` | `server/routes/outfit.routes.js:210-211` | 「人体保护掩膜」= **缺口，不是能力缺失**；P3 的主改点 |
| S7 | 请求 payload 字段全清单：taskId/apiKey/model/channelId/dispatchMode/imageSize/aspectRatio/prompt/productNote/smartIntervention/outfitIntent/retouchIntent/workflowMode/pageName/uploadLabels/pairingMode/preprocessMode/deferAutoSave/maskEdit/localEdit | `outfit-batch-execution.js:327-358`；服务端读取见 `outfit.routes.js`（`payload.*`） | 实验脚本请求结构的依据 |
| S8 | 路由字段生成规则：`{ model: canonical, channelId: channel?.id \|\| "", dispatchMode: "manual" }` | `src/shared/routing.js:370-375` | channelId 可空，服务端按模型解析默认线路 |
| S9 | 服务端默认端口 8787（未设 PORT 时 +0~+10 回退） | `server/core/runtime-config.js:73-76` | 实验脚本默认 BASE |
| S10 | 生成日志：`generation.jsonl` 记录 endpoint/method/status/ok/model/尺寸/workflowMode/n/fileCount/uploadBytes/mask/contentLength/promptChars/url/channel/attempt/imageCount 等；另有任务日志 URL | `server/core/generation-logger.js:39,139-162` | P1 扩展字段（task_id/attempt/版本/成本）而非另建 |
| S11 | 历史归档：history-store + `data/history-images/` | `server/core/history-store.js` | 档案 MVP 的落盘模式参照 |
| S12 | 上传清理：`removeUploadedFiles` **仅错误路径调用**（payload 解析失败/401 无 KEY/局部回贴缺区域/文件数不足等）；成功路径上传物留存；结果缓存另有 TTL 清理（默认 7 天，启动清一次 + 定时轮询） | `server/core/uploads.js:102,130-138`（错误路径）；`server/routes/outfit.routes.js:143,149,223,232`（全为校验失败分支）；`server/core/result-cache.js:32,160,181` + `server/core/runtime-config.js:36`（TTL 7 天） | ⚠️ tmp/uploads **成功路径无清理、无定期 TTL**；当前磁盘实况为空（tmp/uploads 0 文件）→ 记低风险缺口，P1 任务对象化时一并处理 |
| S13 | 视觉分析三 AI：pose / quality / master-fit 参与生成前分析 | `server/outfit-pose-ai.js`、`server/outfit-quality-ai.js`、`server/outfit-master-fit-ai.js` | **是否具备像素级分割/区域输出待实测**（E6），不得假定 |
| S14 | 并发槽：image-concurrency + runtime-config（IMAGE_CONCURRENCY_LIMIT），客户端驱动为主 | `server/core/image-concurrency.js`、`server/core/runtime-config.js` | P1 任务状态机复用它，不新建并发池 |
| S15 | 本地服务零 KEY 存储：KEY 随请求 payload 每请求传入（`payload.apiKey`），服务端不落盘 | `outfit.routes.js` payload 清单（S7）；架构既有结论 | 实验脚本 KEY 走运行时环境变量，同规矩 |
| S16 | 输入限制代码侧答案（E3）：maxPromptLength 20000 字、maxImageBytes 16MB（默认值）；multer 解析硬顶 16 张；maxInputImages 逐模型 = **GPT2.5 8** / tt-image-2 14 / 香蕉 2·2.1·Pro 14 | `server/channel-config.js:71-72,145-190`；`server/core/uploads.js:8,28` | 双图换装两模型都放行；上游真实上限待实测 |

## 二、能力/缺口表（总纲 §2 架构的行落点）

| 能力域 | 现状 | 缺口 | 归属阶段 |
|---|---|---|---|
| 多图传输 | ✅ A+B 已传（S3） | 上游双图理解质量未知 | P0 验证 |
| Mask 通道 | ✅ 上传通道在（S5） | 标准换装不用（S6）；上游是否遵守 mask 未知 | P0 验证 → P3 接入 |
| 模型能力声明 | ✅ 目录已存（S2） | 缺换装语义级声明（mask 支持/seed/局部编辑） | P0 补三态标注 |
| 任务编排 | 🟡 客户端驱动 + 并发槽（S14） | 无状态机/幂等/预算/恢复 | P1 |
| Prompt 体系 | 🟡 前端编译 + 服务端权威构建 | 无换装分层模板/版本冻结 | P1 |
| 服装档案 | ❌ 无 | 全新（本地文件+JSON 索引） | P2 |
| 人体保护 | ❌ 无 | 掩膜生成/应用或语义编辑+原图恢复 | P3（路线看 P0 Mask 结论） |
| 校色/后处理 | ❌ 无 | CIELAB/ΔE 受约束校色、边缘融合 | P4 |
| 质量评估 | ❌ 无 | 失败标签/分级/人工反馈 | P4 |
| 观测 | 🟡 generation.jsonl 字段已较全（S10） | 补 task/attempt/版本/成本字段 | P1 |

## 三、实验记录索引（P0-B，跑完后回填）

| 实验 | 状态 | 结果位置 | 结论 |
|---|---|---|---|
| E1 Mask 语义（生死题） | 待跑 | `eval/results/e1-*` | |
| E2 双图忠实度 + A 组基线 | 待跑 | `eval/results/e2-*` | |
| E3 输入限制抽查（不烧额度） | **代码侧已完成** | 本表 S2/S16 | 我方链路上限：maxPromptLength 20000 字、maxImageBytes 16MB、multer 解析硬顶 16 张、maxInputImages = GPT2.5 8 / 香蕉系 14 / tt-image-2 14；**上游真实上限仍 UNKNOWN，待实测抽查** |
| E4 尺寸/可复现性 | 待跑 | `eval/results/e4-*` | |
| E5 B 组结构化 Prompt 初探 | 待跑 | `eval/results/e5-*` | |
| E6 视觉分析可用性（不烧生成额度） | 待跑（直播抽查） | `eval/results/e6-*` | ⚠️ 既有日志无捷径：generation.jsonl（1272 行）中 master-fit/quality 分析记录 **0 条**——分析输出不落标准日志，必须直播抽查 |
| E7 成本/限流/稳定性（伴随记录） | 伴随 | 各结果目录 meta.json | |

## 四、已知风险与未决项

- S12 已核（2026-10-22 补）：tmp/uploads 成功路径无清理、无定期 TTL；结果缓存有 7 天 TTL；当前磁盘为空 → 低风险缺口，P1 任务对象化时处理（建议：任务终态后清上传临时物或并入 result-cache TTL）。
- S13：视觉分析分割能力未知 → 若不可用，P3 掩膜来源需另案（ADR-002 的一部分）；**E6 无既有日志捷径，必须直播抽查**。
- E3 代码侧已完成（S16）；上游真实输入上限仍 UNKNOWN——不影响 E1/E2 开跑（双图远低于上限），实测抽查随 E2 顺带做。
- 中转对 mask 的语义遵守、seed 支持、双图权重——全部 UNKNOWN，**未实测前不得进主路径**（总纲 §6.1 三态纪律）。
