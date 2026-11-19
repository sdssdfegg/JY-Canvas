# V2-ADAPTIVE-DETAIL-PLANNING-001 · 自适应屏数与内容价值策划专项实施报告

> 日期：2026-11-19　基线：G4/G5 验收后当前版本（HEAD `7b1352f`）。
> 性质：8 屏详情实际问题的专项修复；授权对确定性缺陷最小代码修复；未新增 Skill/Agent/模型调用/Provider、未改前端流程、未改 QC、未为羽绒服加专属规则。
> 边界：无 KEY，AI 自主规划屏数无法真实验证；本轮修复集中在**本地兜底与规划后处理**的确定性缺陷。

---

# 交付 1：专项实施报告

## 复现的真实问题（8 屏羽绒服案例，修复前实测）
用 `count=8` + 羽绒服完整资料跑本地链路，确认任务书描述全部属实：
- 屏4-8 卖点全是"本屏资料已在前序屏幕充分表达，无新增独立信息"，却仍生成完整 17 槽位提示词。
- 空屏画面任务注入全量商品事实（"画面须呈现已确认事实：阴离子表面活性剂…羽绒服…"）——空屏+全量事实造成重复。
- 屏2-7 module 全为 coreSellingPoint，与实际任务（成分/适用范围/使用方法）不符。
- 屏1 卖点是成分清单（"商品身份与核心价值：阴离子表面活性剂…"），非商品认知。
- 画面任务用通用骨架"围绕「核心卖点」任务组织画面"。

## 根因（四层区分）
| 层 | 根因 |
|---|---|
| 屏数来源 | `count = clamp(input.count, min=1, max=12, default=8)`；前端默认 `count:10`，**无 8 屏硬上限**，但自动模式实际是"先定默认屏数再填内容" |
| 规划后处理 | `screenTitles` 恒按 count 生成；`buildLocalScreenTasks` 只有 N 个任务，第 N+1 屏无任务时走兜底句但仍生成 prompt → 空屏保留 |
| 事实注入 | `buildScreenVisual.confirmedFacts` 传全量 `structuredFacts` + 兜底句复用全量事实 → 空屏也拿到全部事实 |
| 模块分类 | `getScreenModule` 按位置兜底 coreSellingPoint，未用 localTask.taskCategory |

## 实施的修复（均在本地兜底路径，不动 AI 规划路径/前端/公开契约）
1. **空屏不进入正式编译**：无本屏任务且无未消费事实 → `isEmptyScreen:true, shouldGenerate:false`，卖点/画面改为"已标记为不生成"，不再注入事实；group 增 `planningConflict`（type=insufficient_content_for_requested_screens，含 requestedScreens/independentTasks/emptyScreens）。**保留 `prompts.length===count` 契约**（前端可据 shouldGenerate 跳过）。
2. **事实按屏精准注入**：`screenFacts` 只取本屏 sellingPoint 命中的事实，画面任务不再全量复制。
3. **模块分类按真实任务**：新增 `moduleForLocalTask`，identity→hero、ingredient→coreSellingPoint、material→materialDetail、applicableScope/usage/care→useScenario、effect→trustProof、color→specInfo。
4. **首屏不把成分当核心价值**：identity 用商品名+用户卖点；成分单列为"成分与配方"任务。
5. **误触发修复（真实回归）**：模块改 useScenario 后其名称"使用场景"命中人物信号词表，导致 no-model 屏误触发人物——已从人物信号源移除 moduleSkill.name/id（模块是分类标签，不是屏级人物任务）。

---

# 交付 2：羽绒服八屏问题根因及修复前后对照

| 问题 | 修复前 | 修复后 |
|---|---|---|
| 第4-7屏保留 | 卖点"无新增独立信息"仍编译完整提示词 | `isEmptyScreen=true/shouldGenerate=false`，画面标"不生成" |
| 空屏注入全部事实 | 画面含全量成分/适用范围/使用方法 | 空屏不注入任何事实；非空屏只含本屏命中事实 |
| 第2-7屏都叫核心卖点 | module 全 coreSellingPoint | hero / 成分(核心卖点) / useScenario / useScenario / conversionClose |
| 第1屏选成分 | 卖点="阴离子表面活性剂…" | 卖点="商品身份与核心价值：羽绒服干洗剂" |
| 使用方法与禁人物并存 | 无 | 修复后 no-model 全屏人物 inactive（见误触发修复） |
| 内容不足无声 | 无提示 | `planningConflict` 明确"8屏请求/4独立任务/4空屏" |

修复后 8 屏实测：屏1 hero 身份、屏2 成分、屏3 适用范围(useScenario)、屏4 使用方法(useScenario)、屏5-8 空屏标记不生成。**任务书 8 屏十问已逐项回答并对应到上述代码行为。**

---

# 交付 3：跨商品动态屏数规划测试（本地真实链路）
| 商品/场景 | 请求屏数 | 有效屏 | 空屏 | 模块结构 |
|---|---|---|---|---|
| 日化-内容少 | 8 | 4 | 4 | hero/核心卖点/useScenario/useScenario |
| 日化-内容多 | 8 | 6 | 2 | +trustProof/specInfo |
| 服装 | 8 | 4 | 4 | hero/materialDetail/useScenario/specInfo |
| 家居 | 8 | 5 | 3 | hero/materialDetail/useScenario/trustProof/specInfo |
| 信息不足要求10屏 | 10 | 2 | 8 | hero/materialDetail + conflict |

**结论**：不同商品/不同资料量产生不同有效屏数与模块结构；内容多的日化比内容少的多 2 屏——**屏数随内容变化而非固定**；但请求屏数仍由前端 count 决定（见未完成事项）。

---

# 交付 4：屏级商品事实注入与重复内容检查
- 非空屏：`screenFacts` = sellingPoint 命中的事实，画面任务只呈现这些（AD5：使用方法屏不含成分）。
- 空屏：零事实注入（AD4：不含"画面须呈现已确认事实"）。
- 全局仍保留：商品身份保护（【参考图使用】等 17 槽位约束）、视觉 DNA。
- 门禁 AD1-AD13 固化：空屏标记/非空生成/conflict/事实隔离/模块分类/首屏/无8屏上限/使用方法整段/误触发/简单商品不空屏/模块各异/少屏不重复——全过。

---

# 交付 5：最终提示词质量对照
修复前空屏提示词：卖点="无新增独立信息"、画面="围绕「核心卖点」…画面须呈现已确认事实：全部事实"。
修复后空屏提示词：卖点/画面="本屏无新增独立信息，已标记为不生成；不应进入正式详情提示词"，且 `shouldGenerate=false`。
非空屏提示词：卖点与画面与屏级任务一致（成分屏讲成分、使用屏讲步骤），无跨屏事实复制。

---

# 交付 6：修改文件、测试结果与 Commit
- `server/detail-middleware.js`（+95/-26）：空屏判定与标记、screenFacts 按屏注入、moduleForLocalTask、首屏身份、人物信号去模块名。
- `scripts/verify/detail-v2-control-chain-check.mjs`（+33）：AD 组 13 项 + Y7/Y8/Z10 适配新屏位。
- Commit：（提交后回填）
- 回归：控制链 **409/409**（原396+AD13）、planning 76/76、sections 25/25、assets 冻结未破、**全量 86/86**、build EXIT=0。
- 真回归已修：no-model 因 useScenario 模块名误触发人物（AD10 固化）。

---

# 交付 7：未完成事项与真实模型验收边界
1. **AI 自主决定屏数未真正实现**：`count` 由前端固定传入（默认 10/8），middleware 尊重用户 count 契约。本轮实现的是"内容不足时标记空屏+冲突，不静默造重复"，**不是自动减少到内容匹配的屏数**——那需要前端传 undefined 触发自主模式或产品层定义，属接口/产品变更，未擅自做。真实 AI 自主屏数待 KEY + 产品决策。
2. **8 屏上限不存在但默认值仍是策划性默认**：max=12、defaultCount=8、前端默认 10；本轮未改默认值（避免破坏用户期望），但已证明系统可产出 2-6 有效屏、无硬上限。
3. **SKILL05 文案仍未提前生成具体标题**：本地兜底无营销/文案策划模型，文案职责仍部分留给图像模型；待 AI 规划路径（KEY）验证。
4. **G4/G5 真实质量未验证**：无 KEY，全部为本地链路；不标通过。
5. **参考素材编号**：本轮未发现"编号与实际附件不一致"的确定缺陷（编译层 imageSlots 与实际选图同源，见素材隔离排查报告）；模型层实际附件仍无法确认。

## 八问回答
- 系统如何决定屏数？—— `count` 入参 clamp(1,12)；本地任务按事实维度生任务，超出的屏标空屏+冲突。
- 还有固定8屏/人为上限？—— max=12 无 8 屏上限；default=8 是默认值非上限，前端默认 10。
- 屏数是否由内容决定？—— 本地兜底下有效屏数由内容任务数决定（2-6 实测），请求屏数仍听 count。
- 以前为何保留空屏？—— screenTitles 恒按 count 生成、无任务时走兜底句仍编译。
- 空屏为何收到全部事实？—— buildScreenVisual 传全量 structuredFacts、兜底句复用全量。
- 是否做到屏级精准注入？—— 本地兜底路径已做到（screenFacts 按屏）；AI 规划路径未改。
- 三类商品能否生成不同结构？—— 能（实测 4/5/6 有效屏、模块各异）。
- 是否既避免重复又不过度压缩？—— 空屏不重复、内容多的商品自动多屏；用户 count 不足时明确冲突不静默压缩。

**本轮完成停止，未进入新一轮 Skill 扩充或架构重构。**
