# JY-Canvas P2-0.5 · 真实创作验收基线准备报告

> 日期：2026-11-21　基线：HEAD `c03ebaa`（P2-0 诊断已交）。性质：**只读取证 + 测试方案设计**——未改任何代码/配置/Skill/Agent/行业包/测试/门禁/状态文档，未调用真实模型、未产生 API 费用、**未读取或输出任何 API KEY 值**，未启动 P2-1/2/3。
> 🔴 本报告只准备验收基线，**不代表已开始真实模型测试或开发**。文中"方案/建议"均为待实施设计，不是已验证能力。

---

## 1. 模型配置和安全使用方法（非敏感）
### 1.1 配置入口（只报入口名，不报值）
**[事实]** 详情规划模型调用链：
- `POST /api/detail-prompts`（`server/routes/detail.routes.js:46`）从请求体取 `payload.apiKey`，经 `resolveApiKey`（`server/core/image-error-policy.js:28`，内部 `normalizeApiKeyInput`）规范化；仅当 `analysisMode === "ai"` 且有 key 才调用模型（:62-69）。
- `createDetailAiPlan`（`server/detail-ai.js:354`）要求 apiKey 与 baseUrls 非空（:355-357）；baseUrls 来自 `channelBaseCandidates()`（:68，`server/core/image-channel-candidates.js:27`，主渠道 + 当次故障兜备，不缓存上次成功备用）。
- **模型名**：`modelName(input, DETAIL_MODEL_SPEC)`，`DETAIL_MODEL_SPEC = {fields:["detailAnalysisModel","textModel"], fallback:"gpt-5.6-luna"}`（detail-ai.js:14-15）——即模型名由输入字段 `detailAnalysisModel`/`textModel` 决定，缺省 fallback 为 `gpt-5.6-luna`（非敏感模型名）。
- **请求路由**：`/api/detail-prompts` → createDetailAiPlan → postChatCompletion；按 4 种 mode（includeImages × withJsonFormat）重试（:365-378）；生图走 `/api/images`（另有渠道/channelId 机制）。
- **KEY 来源**：用户设置页（前端 `src/features/settings/settings-state.js` 的 `apiKey` 字段）→ 随请求体传入；生图另有渠道配置 KEY（channelApiKey，服务端）。环境变量中与 KEY 相关的有 `JINGYIN_BILLING_GATEWAY_SERVICE_TOKEN`（计费网关服务令牌，非详情模型 KEY）；详情模型走请求体，**不用环境变量 KEY**（当前环境四个常见 KEY 环境变量均不存在）。

### 1.2 本地安全配置方式与可用性判断
**[事实]** 本地安全配置 = 设置页输入 apiKey → 随请求传给服务端，不落仓库（P1 数据红线：KEY 不进仓库/种子）。判断配置是否可用**只看布尔**：现有代码已有 `hasApiKey: Boolean(apiKey)`（images.routes.js:180 等）模式；脱敏由 `sanitizeClientDiagnosticValue`（image-error-policy.js:36+）把 apikey/prompt 字段替换为 `[hidden]`。
**[建议]** 测试前自检只输出 `hasApiKey:true/false`、供应商名、模型名、baseUrl 是否配置（不输出 URL 中的凭据部分/KEY），绝不打印 key 值、前缀或完整内容。

### 1.3 环境隔离
**[事实-缺口]** 未发现详情链路专门的 `NODE_ENV`/test-mode/sandbox 开关（grep 相关位置无命中）；生图日志有 `JINGYIN_DISABLE_GENERATION_LOGS` 开关。**测试环境与正式环境无专门隔离机制**——真实调用将使用同一生产路由与计费路径。
**[建议]** 验收测试在顾问确认的独立时机进行，明确使用哪个渠道/模型，费用与正式环境共用需知悉（见第 7 节风险）。

## 2. 完整请求与响应取证方案（区分四类证据）
| 证据类型 | 现状 | 取证方法（优先现有能力） |
|---|---|---|
| 客户端事件日志 | `logs/generation.jsonl` 7335 行，含 `/api/images`/一键详情/detail-screen-N/stage/event/method/durationMs（P2-0 已证） | 直接读取，作为"曾发生请求与展示事件"的证据；**不得当作请求体或质量证据** |
| 服务端请求日志 | `logs/tasks/<日期>/<requestId>.txt`（历史生成失败排查用）、`logs/runtime-*.jsonl`（受 JINGYIN_RUNTIME_LOG_MAX_BYTES 控制） | 失败时查 tasks 日志里的"前端信息"真实上游码；运行期用 runtime 日志佐证流程，注意脱敏 |
| 真实 HTTP 请求体 | 目前**无固定抓取**（P2-0 标未验证） | [建议] 测试时在测试客户端用一次性内存 fetch 拦截（参考 `detail-v2-planning-chain-check.mjs` 的 captureBody 模式）记录 `/api/detail-prompts` 与 `/api/images` 的 body 到**测试临时目录**（非仓库持久文件），敏感字段脱敏后留存；或由顾问指定现有抓包方式 |
| 模型响应 | `aiPlan.plan` 经 `/api/detail-prompts` 响应返回（detail.routes.js:74 `model: aiPlan.model`）；生图响应经前端结果回传 | [建议] 同一临时抓取记录响应 JSON；区分"模型返回了内容"与"内容质量合格"（后者见第 4 节评分） |

**逐项取证目标**：
1. `/api/detail-prompts` 输入：payload（input/sellingPoints/count/model 等）+ 图片文件清单；输出：`{group, planning}` + model。
2. `aiPlan`：`group.v2Control`/`analysis`/`skillLayers` 外的原始规划——存响应 JSON 中 `planning`，核对 screens/planning.screenRoles/facts。
3. `prompt.text`：从响应 `group.prompts[].text` 逐屏导出（这是生图实际输入）。
4. `/api/images` 请求体与附件：body 中 `prompt`（=prompt.text）、model/channelId/imageSize/aspectRatio + 图片附件元信息（文件名/role/index）；用 fetch 拦截或日志记录，**附件二进制不落测试报告**。
5. 实际模型返回结果：生图响应中的 URL/本地路径与 requestId，关联 generation.jsonl 同 requestId 的事件链。
6. 最终生成图片：保存到测试临时目录（非仓库），供第 4 节人工评分；报告只记路径与评估结论，不嵌入图片。

## 3. 四类固定测试商品矩阵
> 原则：**没有实际商品资料/图片的地方标记「待用户提供」，不自行编造商品事实**。下表"输入资料"为测试需准备的字段结构，不是具体商品事实。

| 案例 | 商品输入资料（待用户提供具体内容） | 图片要求 | 测试目标 | 应保留的事实 | 不允许的错误 | 预期输出检查项 |
|---|---|---|---|---|---|---|
| C1 日用清洁剂 | productName + productFeature（成分/使用方法/适用范围）+ sellingPoints；具体品牌/成分值待用户提供 | 商品主图≥1（正视图，标签可读）；参考图可选 | AI 规划路径能否产出差异化结构、卖点边界 | 成分/适用范围/使用方法原文事实 | 虚构认证/疗效/品牌背书；把使用对象材质写成包装材质 | screens 数=count；每屏 title 独立；无重复卖点；真实性锁在 text |
| C2 衣物去渍产品 | 同上 + 去渍对象/污渍类型（真实可见事实待用户提供） | **多图输入案例**：商品图≥2（正面+标签特写）+ 使用对象图1（羽绒服/衣领） | 多图一致性、laundryStain 子类目策略、P1-6 冲突保护不误伤多图文案 | 子类目可见事实；去渍对象 | 跨屏主体漂移；把衣物材质当商品包装材质；apparel 词误触发污染降级 | 识别=laundryStain（若信号充足）；跨屏商品主体一致；子类目 coverage 生效 |
| C3 非清洁剂商品 | productName + 材质/版型/规格等真实资料（待用户给） | 商品主图≥1 | 行业差异化：非日化是否正常进入 apparel/beauty/其他包、结构是否不同 | 商品自身材质/结构 | 误判 cleaning；通用空话；品类套错规则 | 识别行业正确；无 cleaning 专属词；结构序列与 C1 不同 |
| C4 资料较少的普通商品 | 仅 productName + 极简 feature（具体商品待用户定） | 商品主图1 | 资料不足时的 fail-fast / 兜底行为 | 仅有的真实商品名 | 虚构事实；产出无意义重复屏；静默空洞详情 | 规划态应 fail-fast 且给出 planningError；兼容态若产出应标注低信息 |

## 4. 六项质量评分标准（可操作，区分自动/人工）
> 每项 0-3 分：0=失败、1=严重不足、2=基本合格、3=良好。失败条件触发即该项判 0，不因其他项高而抵消。

| 项 | 评价维度 | 评分等级要点 | 明确失败条件 | 证据来源 | 自动/人工 |
|---|---|---|---|---|---|
| 1 商品真实性 | 颜色/结构/材质/五金/logo/比例/标签与商品图一致；无虚构事实 | 3=全一致；2=细节轻微偏差；1=主体对但关键细节错；0=见失败条件 | 生成图改变商品结构/颜色/标签；出现未提供的认证/疗效/销量 | 真实生成图 vs 商品图；text 中真实性锁 | 主体/颜色/标签**人工**；text 锁存在性**自动** |
| 2 商品理解 | 成分/适用/用法/材质是否被正确提取并传递 | 3=关键事实全传递；2=大部分；1=少量；0=见失败 | 用户给出的核心事实未进任何屏（如 C1 用法被截断丢失的复现）；把行业知识写成商品事实 | prompt.text 逐屏卖点 vs 输入资料 | 关键词存在性**自动**，正确性**人工** |
| 3 详情规划 | 屏数/顺序/每屏独立目的/无重复无无意义分屏 | 3=每屏有独立任务且无重复；2=1-2 屏弱；1=明显重复；0=见失败 | 出现连续≥2屏卖点/画面完全相同（P2-0 已证 leftover 分支）；标题为"第N屏"占位 | group.prompts[].title/sellingPoint/text | 重复检测**自动**，目的独立性**人工** |
| 4 文案质量 | 消费者视角、利益转译、不空洞参数罗列 | 3=有真实营销价值；2=一般；1=资料复述；0=见失败 | 仅"标签：原文"复述无利益点；无文案行；跨屏语义复述 | text 中【本屏文案】/卖点 | 模板/空行**自动**，营销价值**人工** |
| 5 画面执行力 | 主体位置/道具/台面/镜头/光影/文字关系是否具体可执行 | 3=元素齐全；2=部分具体；1=抽象规则；0=见失败 | 画面任务仅为"围绕X组织画面/建立认知"类抽象句（P2-0 已证 context_assembly 表征） | text【画面任务】/【构图与光线】 | 套话检测**自动**，可执行性**人工** |
| 6 规则遵循 | 模型是否遵循 8 条 directive、screenRoles/规划 schema 要求 | 3=结构完全符合；2=基本符合；1=部分违背；0=见失败 | 屏数不符 count；screen 编号错乱；明确禁止项（固定标题轮转/虚构）出现 | aiPlan + text vs 请求体 directive | schema 校验**自动**，规则语义**人工** |

**总体判据**：六项均 ≥2 且无 0 分才判该商品通过；单项 0 分须记录根因并关联 P2-0 的 R1-R5。

## 5. 对照实验设计（同输入/同图/同参数/同标准）
| 对照 | A 组 | B 组 | 控制变量 | 可否独立运行（现状） |
|---|---|---|---|---|
| AI 规划 vs 本地兜底 | 有 KEY 走 aiPlan | 无 KEY/analysisMode=local | 同商品资料/图片/count/workflow | **[事实]** 本地兜底可独立运行（P2-0 探针）；AI 组需 KEY，当前不可 |
| 行业差异 | C1 cleaning | C3 非清洁剂 | 同屏数/同图片规格/同模型参数 | 均可（本地兜底已可跑）；AI 组需 KEY |
| 多图一致性 | C2 多图（3 张） | C2 单图（仅主图） | 同商品/同参数 | 需真实多图素材，**待用户提供**；代码支持多图（MAX_AI_IMAGE_COUNT=10，detail-ai.js:16） |
| Skill 激活/规则消费 | 触发条件齐全的屏（模拟/真实） | 未触发屏 | 同输入 | [事实] 五态可读；**模型是否遵循规则需 KEY，当前不可** |

**[事实-缺口]** AI 规划路径、多图一致性、Skill 规则遵循三组对照**当前无法独立运行**（无 KEY / 无真实素材），如实记录，不假设具备。

## 6. 真实测试前需要用户准备的内容
1. 可用 API KEY（仅用户设置页输入，不落仓库/报告）与确认使用的渠道/供应商、模型名。
2. C1-C4 四类商品的**真实资料与图片**（按第 3 节规格，尤其 C2 的多图含标签特写与使用对象图）。
3. 每类商品 1 份"人工认为专业"的参考详情（可选但强烈建议，作为第 4 节评分基准）。
4. 测试时间窗口确认（会产生 API 费用、与正式环境共用路由）。

## 7. 预计测试成本与风险
- **[推断]** 成本：每个商品至少 1 次规划调用（4 种 mode 重试最多 ×4）+ 生图请求（屏数×图片数）；4 类商品 + 对照组预计数十次模型调用，费用取决于渠道计价，**需用户确认预算**。
- 风险：①渠道限流/超时导致重试放大成本（detail-ai.js 4-mode 重试）；②测试与正式共用环境，可能影响正常生成；③KEY 误入日志——现有脱敏机制（`[hidden]`）可缓解，取证时仍须人工复核；④无质量基准时评分主观性偏高（故建议提供参考详情）。

## 8. 当前系统哪些能力无法通过现有方式验证
**[未验证清单]** ①模型是否遵循 8 条 directive/Skill 规则；②真实 aiPlan 的结构质量（差异化、无重复、screenRoles 合理）；③真实 composition 的具体可执行性；④真实 copywriting 的营销价值；⑤真实 `/api/images` HTTP 请求体与附件一致性；⑥出图后商品真实性/外观结构；⑦多图跨屏主体一致性；⑧前端对 isEmptyScreen/shouldGenerate/planningConflict 的跳过逻辑。**以上均需 KEY + 真实素材 + 用户提供的质量基准**，不因未验证判定设计失败。

**停止点**：本报告为验收基线准备，交顾问审查；未改任何文件、未提交 commit、未启动 P2-1/2/3、未调用真实模型、未读取或输出 KEY。等待顾问下一步指令。
