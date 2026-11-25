# JY-Canvas P1-5 第二阶段 B · sellingForPrompt 重复注入只读取证报告

> 日期：2026-11-20　基线：HEAD `92e9f40`（P1-5 阶段A 验收关闭）。性质：**只读取证**，未改任何代码/门禁/测试/状态文档，未提交 commit，未启动阶段C/P1-6/P2。
> 🔴 核心结论（先给答案）：sellingForPrompt 的"两次出现"**不是同一内容被机械重复拼接的无效重复**，而是**同一卖点数据在不同语义上下文中的必要引用**——且第二次出现是**条件性**的（视觉策划缺失时才产生）。**判定：必要重复，不建议治理文本**；如要观测，应新增独立的普通内容重复观测，不扩大 P1-4 Skill Injection 口径。

---

## 1. 调查范围与实际读取文件清单
- 实际读取（只读）：`server/detail-middleware.js`（sellingForPrompt 全部 5 处出现、text 组装、buildScreenVisual 调用）、`server/detail-v2-control/skill-activation.js`（buildScreenVisual 分支:483-512、P1-4 injectionNeedle:1162-1173）、`prompts/server/detail-v2-planning/index.js`（无关，仅核对）、相关门禁脚本。
- 运行时探针：全部在项目源码/测试资产之外以 `node --input-type=module -e` 临时执行，**未写任何项目文件**，结束后无残留。
- 证据边界：探针用 `buildDetailPromptGroup` 真实产出的 `prompts[].text`（最终生图提示词的权威内容）。**未调用真实模型、未抓真实 `/api/images` 请求体**——本报告"请求体"证据指 text 组装结果，非真实 HTTP 发送，如实标注。

## 2. sellingForPrompt 完整数据流
```
卖点输入（AI: aiPlan.product.realSellingPoints / consumerInsights.needs / marketingStrategy.valueLadder；
          本地: 商品资料派生 sellingList）
  → sellingSource = sellingList[index % sellingList.length] (:1374)
  → selling = sellingSource (:1376)
  → checkSellingPointBoundary(selling, ...) 事实边界校验 (:1379-1381)
  → sellingForPrompt = allowed ? selling : 保守表达/事实陈述 (:1382-1387)
      ├─ 分支① →【本屏卖点】${sellingForPrompt}  (:1499，总进入 text)
      ├─ 分支②a → contentTask = sellingForPrompt.slice(0,60) (:1392) → buildScreenVisual
      │            └─ context_assembly 分支 →「本屏信息目标：${contentTask}」(skill-activation.js:504) →【画面任务】(:1501)
      ├─ 分支②b → localTask && sellingForPrompt →「本屏内容任务：${sellingForPrompt}」(:1462) → promptDirectives →【模块指令】(:1503)
      └─ 分支③（审计，非 text）→ promptLayers.screenLines (:1568)
```

## 3. 两次出现的逐项来源和代码位置
| 次序 | 变量来源 | 文件:行 | 生成函数 | 拼接函数 | 所属上下文 | 进入模型位置 | 文本内容摘要 |
|---|---|---|---|---|---|---|---|
| 第1次 | sellingForPrompt 本体 | detail-middleware.js:1382 定义；:1499 拼接 | checkSellingPointBoundary(:1379) | text[] 槽8 `【本屏卖点】` | 卖点内容（本屏要表达什么） | prompts[].text | 如"去渍强" / "商品身份与核心价值：羽绒服干洗剂" |
| 第2次（AI路径） | sellingForPrompt.slice(0,60) | :1392 派生；skill-activation.js:504 拼接 | buildScreenVisual(:1390) | text[] 槽10 `【画面任务】`的"本屏信息目标" | 画面任务（本屏画面要服务的信息目标） | prompts[].text | "本屏信息目标：去渍强" |
| 第2次（本地兜底路径） | sellingForPrompt 本体 | :1462 拼接 | promptDirectives(:1460) | text[] 槽12 `【模块指令】`的"本屏内容任务" | 屏级内容任务（本屏结构化任务指令） | prompts[].text | "本屏内容任务：商品身份与核心价值：…" |
| 第3处（非 text） | sellingForPrompt 本体 | :1568 | assemblePromptLayers | promptLayers.screenLines | 审计分层镜像 | **不进 text** | 同第1次 |

**关键**：第2次有两个互斥来源——AI 规划路径走"本屏信息目标"（context_assembly 分支），本地兜底路径走"本屏内容任务"（localTask 存在）。二者不会同时成立（见第7节）。

## 4. 两次出现的上下文和语义职责对照
| 问题 | 回答 |
|---|---|
| 第1次告诉模型什么 | 【本屏卖点】=本屏要表达的核心卖点内容（内容层） |
| 第2次告诉模型什么 | AI路径"本屏信息目标"=画面应服务的信息目标（画面任务层）；本地路径"本屏内容任务"=屏级结构化任务指令（任务层） |
| 内容是否完全相同 | 第1次=完整 sellingForPrompt；AI第2次=其前 60 字符截断并加前缀；本地第2次=完整值加前缀。**字符串不完全相同**（含前缀/截断），核心卖点文本相同 |
| 上下文职责是否不同 | **不同**——内容 vs 画面任务 vs 任务指令，三者是不同模型行为约束 |
| 删除任一次会丢什么 | 删【本屏卖点】→丢失核心卖点表达；删"本屏信息目标/内容任务"→丢失"画面/任务须围绕该卖点"的约束（尤其视觉策划缺失时，这是唯一的画面信息目标来源） |
| 同卖点跨屏复用 | sellingSource 按 `index % sellingList.length` 分配（:1374），**不同屏取不同卖点**；未见同一卖点在同一批屏内被重复分配到多屏（多卖点场景实测屏1/2/3分别去渍强/温和不伤衣/快速去污） |

**分类判定**：文本层有重叠（核心卖点串相同），但**语义/职责不同** → 属"必要的跨上下文引用"，不是语义重复、不是职责重复、不是无效重复。

## 5. 最终 text 组装过程
text 数组 17 槽位（:1490-1515）`.filter(Boolean).join("\n")`（:1516）。sellingForPrompt 进槽8（:1499，恒在）、槽10（:1501，经 buildScreenVisual 条件）、槽12（:1503，经 promptDirectives 条件）。组装顺序：先算 sellingForPrompt(:1382) → 算 screenVisual(:1389，可能含第2次) → 算 promptDirectives(:1460，可能含第2次) → 组装 text(:1490+)。

## 6. 运行时探针及实际证据
探针统一口径：先取【本屏卖点】值，统计其在 `prompts[0].text` 中的出现次数，并检查"本屏内容任务"/"本屏信息目标"标记。

| 场景 | 卖点出现次数 | 第2次来源 | 证据 |
|---|---|---|---|
| 本地兜底（无 aiPlan） | 2 | 本屏内容任务（:1462） | 第1次上下文"【本屏卖点】商品身份与核心价值：羽绒服干洗剂"；第2次"【模块指令】本屏内容任务：商品身份与核心价值：…" |
| AI 规划（有 aiPlan，无 composition） | 2 | 本屏信息目标（:504） | 第2次"【画面任务】…本屏信息目标：去渍强" |
| **AI 规划 + 真实 composition** | **1** | **无第2次** | buildScreenVisual 走 ai_composition 分支(:490-492)，不拼 contentTask——实测"含composition=true、本屏信息目标=false、卖点出现=1" |

这组对照证明：**重复次数随视觉策划可用性动态变化**，第二次出现是"视觉策划缺失时的信息目标兜底"，不是无条件机械重复。

## 7. 条件性重复场景矩阵
| 场景 | 结果 | 说明 |
|---|---|---|
| 有卖点 vs 无卖点 | 有卖点=2次；无卖点（仅身份/成分等派生卖点）仍2次 | "无卖点"时 sellingForPrompt 退化为商品资料派生（如"成分与配方：表活"），仍有内容+任务两处引用 |
| 单卖点 vs 多卖点 | 均每屏2次 | 多卖点按 index 分配不同屏，非同卖点重复 |
| 多屏 vs 单屏 | 每有内容屏2次 | 资料不足时空屏 sellingForPrompt 为空、0 次（"资料不足"场景 prompts 为空、无 text） |
| 不同屏级任务 | 2次（卖点+任务/画面） | 职责随 moduleId 变，但结构一致 |
| 资料充分 vs 不足 | 充分=正常2次；不足=空屏0次 | 空屏不注入卖点 |
| cleaning | 2次（本屏内容任务） | 本地兜底路径 |
| laundryStain | 2次（本屏内容任务） | 同上；第3、4屏空屏 0 次 |
| 非清洁剂（apparel） | 2次 | 同上 |
| generic 降级 | 2次 | 同上 |
| 平台已选/未选 | 2次（不变） | 平台影响槽位文案，不影响卖点出现次数 |
| **第三次前缀重复（D13）** | **未观察到** | 见第8节 |

## 8. 第三次前缀重复的核验结论
第一阶段 D13 担心 sellingForPrompt.slice(0,60) 前缀在"本屏卖点"+"本屏内容任务"+"本屏信息目标"三处出现。实测：
- 扫描本地兜底、AI无composition、AI真实composition 三类场景，**没有任何一屏同时含"本屏内容任务"和"本屏信息目标"**。
- 根因：`本屏内容任务` 依赖 `localTask`（本地兜底，`aiPlan` 为空）；`本屏信息目标` 依赖 `buildScreenVisual` 走 context_assembly（AI 规划路径，`aiPlan` 存在）。**两条路径互斥**，不会同时成立。
- **结论：D13 的第三次完整重复不会发生**。此前"待核实"在此确认为"不成立"。唯一的第2次出现始终只有一个来源。

## 9. P1-4 occurrenceCount 统计边界分析
1. sellingForPrompt **不属于**现有 Skill Injection 统计对象：injectionNeedle 硬编码仅 `figure-usage-scene`→"【模特与镜头】" 与 `ecommerce-copy-layout`→copywriting（:1164-1165）。
2. occurrenceCount 设计边界：**只统计 Skill 规则注入段的精确子串重复**，targetStage 固定 `final_detail_prompt`（:1171）。这是有意限定，不是遗漏——P1-4 职责是 Skill 五态，不是全内容审计。
3. 若把 sellingForPrompt 纳入：会把"普通内容字段重复"混入"Skill 规则注入"统计，改变 P1-4 五态契约语义（injection 态从"Skill 规则是否进 text"变成"任意内容是否重复"）——**不应扩大**。
4. 建议：如未来要观测此类重复，增加**独立的普通内容重复观测**（与 Skill Injection 并列），而非改 P1-4 口径。本阶段只分析、不改。

## 10. 门禁及下游消费者依赖分析
- `sellingForPrompt` 在 `scripts/verify/**`、`src/**`、`server/routes/**` 中**零引用**（grep 确认）——仅 detail-middleware.js 内部使用，无门禁断言、无前端/下游直接依赖。
- 但其派生的【本屏卖点】文本是事实边界校验后的产物（checkSellingPointBoundary :1379-1387），受 P1-2 事实边界门禁间接保护；治理时不得破坏"未确认扩展被替换为保守表达"的逻辑。

## 11. 重复类型分类与逐项判断
| 项 | 文本 | 语义 | 职责 | 分类 | 判断 |
|---|---|---|---|---|---|
| 【本屏卖点】 vs 本屏信息目标/内容任务 | 核心串相同（含前缀/截断差异） | 不同（内容 vs 画面/任务） | 不同 | **必要跨上下文引用** | 保留 |
| promptLayers.screenLines 的同值 | 相同 | 审计镜像 | 审计 | 非 text 重复 | 保留（不进生图） |
| D13 第三次完整重复 | — | — | — | 经核验**不成立** | 无对象 |

## 12. 最小治理方案（如果确实有必要）
**结论：不建议对文本做去重治理。** 两次出现职责不同，且第二次是视觉策划缺失时的唯一信息目标来源，删除会丢失约束。

若顾问仍要求降低"文本重复计数"（非删除语义），可选最小方案（需另行授权）：
- 保留【本屏卖点】（内容权威源）与"本屏信息目标/内容任务"（任务权威源）两处语义；
- 若要减少机械重复串，可考虑在 context_assembly 分支用"见本屏卖点"类指代替代完整卖点串——但这会**削弱画面任务的独立性**（模型在该上下文看不到具体卖点），**风险高于收益，不推荐**。
- 唯一低风险动作是**新增独立观测**（非治理）：加一条普通内容重复探针，记录 sellingForPrompt 在 text 的出现次数与上下文，不删任何文本。

## 13. 不应治理的内容及原因
- 不删【本屏卖点】：核心内容表达，删则卖点丢失。
- 不删"本屏信息目标/内容任务"：视觉策划缺失时唯一任务约束，删则画面失去信息目标。
- 不改 P1-4 injectionNeedle/统计口径：会让普通内容重复污染 Skill 规则注入态。
- 不改 promptLayers.screenLines：审计层，不进 text。
- 不动阶段A D1 治理、D2/D3 保留结论。

## 14. 尚未确认的事项和证据局限
1. 未抓真实 `/api/images` HTTP 请求体——本报告"最终 text"来自 `buildDetailPromptGroup` 真实产出，是生图输入权威内容，但未验证前端是否对 text 再做加工（`form.set("prompt", prompt.text)` 前端 :496 原样转发，阶段A已核）。
2. 未调用真实模型——无法验证"两处卖点引用"对图像生成质量的实际影响（正/负），本报告只判定工程语义必要性。
3. "无卖点"定义为无显式 realSellingPoints，此时 sellingForPrompt 退化为商品资料派生；该语义是否产品期望，属业务确认项，本阶段不改。

## 15. 零改动核验
- 代码/测试/门禁/状态文档：**零改动**（未修改任何项目文件）。
- 临时探针均以 `node -e` 内存执行，无项目文件写入。

## 16. Git 状态及 commit 核验
- 基线 HEAD `92e9f40`（阶段A 验收关闭），本次未产生新 commit。
- 工作树：除本报告（新增，未提交）外无改动。

## 17. 下一阶段建议
1. **建议不对 sellingForPrompt 做文本治理**——判定为必要跨上下文引用，且第二次条件性出现有明确职责。
2. 若顾问要求可观测性，另立"普通内容重复观测"小项（不改 P1-4 五态），与阶段 B 治理解耦。
3. D13 已确认为"不成立"，无需后续处理。
4. 阶段 C（生图请求转发）此前取证显示只转发 prompt.text、无重复拼接——如需正式关闭阶段 C，可另立只读取证确认，但本阶段不启动。
5. **不自动进入任何后续阶段**，等待顾问审查本报告与下一步指令。

**停止点**：报告交付后立即停止，不实施治理、不创建修复 commit、不启动阶段C/P1-6/P2、不修改 NEXT.md 标记未批准工作。
