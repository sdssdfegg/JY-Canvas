# JY-Canvas 阶段 B-补充 · 参数契约与商品事实边界闭环实施报告

> 日期：2026-11-21　基线：`e76a605` → 本阶段业务 commit `9687dcb`。性质：阶段 B 的限定补充修正——只补 RequestContract / ProductBrief 契约四个缺口，不扩大到阶段 C。
> 🔴 保留清单全部遵守：未改 ScreenPlan 逐屏实现、未改 modelPolicy 前 N 屏运行时、未改 reverseScreens painReverse 功能、未接入 Studio 视觉导演、未新增/重写 Skill、未实施多组对比、未处理其他行业包、未改 P1 治理成果、未启动真实模型调用、未产生 API 费用。

---

## 1. 代码变更清单（5 文件，+259/-43，无新增文件）
| 文件 | 修改 |
|---|---|
| `server/detail-v2-control/index.js` | FACT_CATEGORY 加 UNCLASSIFIED；新增 FACT_SOURCE_TYPE（user-input/product-image/external-source/ai-inference）、PRODUCT_FACT_SCHEMA_VERSION；重写 classifyProductFacts（版本化严格模式+来源/证据校验）；confirmedFactClaims 接 schemaVersion；normalizeDetailRequest 三态溯源；新增 PARAM_PRIORITY/resolveParamConflict/buildParamClosure；default 导出追加 |
| `server/detail-ai.js` | outputSchema planning.facts 提示串加 category/sourceType/evidence 字段（+2/-1） |
| `prompts/server/detail-v2-planning/schemas/planning-result.schema.json` | facts.items.properties 加 category/sourceType/evidence（required 不变，兼容旧数据） |
| `server/detail-middleware.js` | 6 处事实消费点传 `{schemaVersion: aiPlan?.schemaVersion}`；import buildParamClosure；非枚举挂 paramClosure |
| `scripts/verify/detail-v2-control-chain-check.mjs` | 修正 CB3/CB5；新增 CB8-CB13 六项（+91） |

## 2. 契约字段说明
### ProductBrief 版本化事实分类
- `FACT_CATEGORY` 六值：product-confirmed / industry-knowledge / competitor / user-review / ai-inference / **unclassified**（新增兜底）。
- `FACT_SOURCE_TYPE` 四值：user-input（用户输入）/ product-image（商品图可见）/ external-source（外部资料）/ ai-inference（AI 推断）；后两者中 ai-inference 不可作确认来源。
- **版本判定**：只看 aiPlan 顶层 `schemaVersion` 是否存在（新版）或缺失（旧版）——**不因模型自填 category 就认定新版，防绕过**。
- 新版规则：category 缺失/无效 → unclassified（不得进 confirmed）；非 product-confirmed 标 visible → 冒充留痕；product-confirmed 还必须有合法且可确认的 sourceType + 至少一条 evidence，缺一不得 confirmed。
- 旧版规则：无 schemaVersion 且无 category → 原 `level=visible` 兼容（历史结果不变）。

### RequestContract 三态溯源
- `source` 三值：**user**（有 touched 标记且为 true，或值≠默认值）/ **default**（未提交，或有 touched 标记但为 false）/ **unknown**（无 touched 标记、值恰好等于默认值——无法区分用户选同值还是系统默认）。
- `explicit` 仅 source=user 时 true。count 用 countTouched（不破坏既有行为），其余字段无 touched 时诚实标 unknown。
- `paramClosure`：23 项参数各自独立记录 7 阶段（frontSubmit/backReceive/planning/screenTask/finalPrompt/imageRequest/imageResult），只用 passed/failed/unverified/not_applicable。前两级按提交/接收证据判；中间三级按 appliesTo + evidence（默认 unverified）；后两级无真实模型/图片证据恒 unverified 或 not_applicable。

### 参数优先级
`PARAM_PRIORITY` 六层：法律安全平台强制(60) > 用户单屏明确(50) > 用户全局明确(40) > 行业平台软建议(30) > AI 建议(20) > 系统默认(10)。`resolveParamConflict` 取最高优先级候选；若胜出层级高于用户单屏且存在用户明确候选，置 `overridesUserExplicit:true` + reason，**不允许静默覆盖**。

## 3. 新旧事实兼容证据（端到端探针，同一 facts 分别带/不带 schemaVersion）
| 事实 | 旧版（无 schemaVersion） | 新版（schemaVersion=1.0.0） |
|---|---|---|
| product-confirmed + product-image + evidence | confirmed ✅ | confirmed ✅ |
| industry-knowledge 标 visible | misuse 留痕、不 confirmed ✅ | misuse 留痕、不 confirmed ✅ |
| 无 category 的 visible 事实 | **confirmed（兼容保留）** ✅ | **unclassified、不 confirmed** ✅ |
| strict 标志 | false | true |

## 4. 用户默认值 vs 主动选择区分测试
- CB11 覆盖：未提交 count → `default`；提交 count=10 且 countTouched=false → `default`；提交 lang="中文"（无 touched、同默认）→ `unknown`；提交 count=10 且 countTouched=true → `user`（explicit=true）。
- 结论：未触碰默认值与主动选同值可区分（有 touched 的字段）；无 touched 字段诚实标 unknown，不伪装 user。

## 5. 23 项参数逐项闭环状态结构与样例
- 结构：`{ contractVersion:"stage-b-1.0", stages:[7阶段], params:{ <参数>: {value, source, stages:{7阶段状态}} } }`。
- 样例（本轮探针）：`count` — frontSubmit=passed, backReceive=passed, planning=unverified, screenTask=unverified, finalPrompt=unverified, imageRequest=not_applicable, imageResult=not_applicable；`ratio`（appliesTo 含 generation）— imageRequest=unverified, imageResult=unverified；`lang`（仅 compile）— planning/imageRequest=not_applicable。
- 挂载：middleware 通过 `Object.defineProperty` 非枚举挂 `paramClosure`，不污染序列化/前端 payload/逐字节门禁（CB6/CB12 断言）。

## 6. 参数冲突优先级测试（CB13）
- 法律安全 vs 用户全局 vs AI → 法律安全胜。
- 用户单屏 vs 用户全局 → 用户单屏胜。
- 用户全局 vs 软建议 vs AI vs 默认 → 用户全局胜，overridesUserExplicit=false。
- 软建议 vs 用户全局 → **用户全局胜**（软建议不得静默覆盖用户明确要求）。
- 法律安全 vs 用户单屏 → 法律安全胜且 `overridesUserExplicit=true`（显式标记，不静默）。

## 7. 全量回归及构建结果
| 门禁 | 结果 |
|---|---|
| 控制链（含 CB1-CB13） | **567/567**（原 561 + 6） |
| planning | 78/78 |
| assets 冻结 | ok=true, failureCount 0 |
| source-hygiene | dirtyFiles 0 |
| 全量 run-all --fast | **86/86** |
| vite build | EXIT=0 |
| eslint | 0 errors（新增 warning 已清零；存量 warning 未动） |
| node --check + schema JSON | 通过 |
| 端到端新旧事实探针 | 旧版兼容/新版严格分类均符合预期 ✅ |
| 保留清单核对 | modelPolicy/ScreenPlan/Studio/Skill/对比/其他行业/P1 治理零改动 ✅ |

## 8. Git commit 与工作区
- 业务 commit：`9687dcb`（5 文件 +259/-43）；HEAD=`9687dcb`；工作区无已跟踪改动（本报告作为交付物留工作区未提交）。

## 9. 未解决事项
1. 新版事实能否稳定输出 category/sourceType/evidence 取决于真实模型——**[未验证]**（无 KEY）；但版本判定只看 schemaVersion，模型不填 category 会被正确标 unclassified，不会冒充商品事实。
2. 逐参数闭环的中间三级虽有结构，但 passed 需 evidence 传入；本阶段未接真实请求证据，默认 unverified——符合"不启动真实模型、不产生费用"。
3. "22 项"表述更正：实际契约 23 项（上阶段报告笔误），本报告与测试均按 23 项。

**停止点**：阶段 B-补充完成后提交本报告，停止等待顾问审查，不自行进入阶段 C。
