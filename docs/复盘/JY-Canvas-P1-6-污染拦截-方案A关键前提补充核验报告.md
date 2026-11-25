# JY-Canvas P1-6 · 方案 A 关键前提补充核验报告

> 日期：2026-11-20　基线：HEAD `7fcec81`　性质：只读取证——未改任何代码/测试/门禁/状态文档、未提交 commit、未实施 confidence 降级、未启 P2。
> 结论先行：**前提一（aiHint 独立可信）不成立；前提二（降 confidence 阻止错误专属规则）部分成立（规则内容被隔离，但 industryId 分支未被阻断）。** 因此**不推荐按原样批准方案 A**，详见第 6 节 A/B/C 判断。

---

## 1. aiHint.industryId 完整来源与数据流
1. **定义**：`product.industryId` 是规划模型的**输出字段**，`detail-ai.js:228` 的 outputSchema 仅给枚举提示 `"apparel|beauty|food|home|electronics|motherBaby|pet|jewelry|sports|generic"`；`:240` industryProfile.industryId 标"可选：展示=规则同一决策"。
2. **生成**：由 `createDetailAiPlan`（detail-ai.js:348-406）单次 `postChatCompletion` 产出，模型输入为 `buildDetailAnalysisContent`（:131-327）：`instruction` + `input`（productName/productFeature/userInstruction/sellingPoints…:189-209）+ `images`（商品图/参考图）+ skillPack。
3. **写入**：模型返回 `aiPlan.plan`，路由 `detail.routes.js:95-110` 把 `aiPlan.plan` 传给 middleware 的 `aiPlan` 参数；`aiIndustry`（middleware:479-503）读 `aiPlan.product.industryId` 拼进 `aiText`（:480-486）。
4. **是否读同文本**：是——模型输入 `input` 与最终识别 `resolveIndustryDecision` 的输入 text 同源（都来自 productName/productFeature/userInstruction/sellingPoints）。
5. **是否读图片/用户类目**：读商品图/参考图（images），但**全代码无用户显式类目/category 入参**（grep `categoryId|userCategory|类目` 在 detail.routes.js/detail-state.js 零命中）。
6. **是否独立分类**：否——没有独立行业分类过程；是同一规划模型基于同一商品文本+图片的推断。
7. **是否同源**：**是**——更严重的是 aiText 含 `aiPlan.product.industryId`，而 aiText 又作为最终识别输入之一（`aiIndustry:488 resolveIndustrySkill(text, aiText)`，text 已含 aiText），构成"模型输出→识别输入"的自我印证循环。
8. **空值/冲突/低置信/无效 ID**：schema 标可选；`:491-501` 有"aiPlan.product.industryId 且 INDUSTRY_SKILLS 存在才采纳"的兜底，说明无效 ID 是已知情况；无独立置信度字段（industryProfile.confidence 是模型自报、可选）。
9. **可信优先级**：无"用户明确行业 > 外部上下文 > AI 推断"的优先级机制——因为根本没有用户/外部行业输入通道。

## 2. 预期行业来源可信度判断
**明确回答：`aiHint.industryId`（即 aiPlan.product.industryId）不足以成为本次污染检查的独立预期行业依据。**
原因：①与最终识别同源（同一商品文本+图片）；②自我印证循环（输出又作识别输入）；③无用户/外部独立类目通道；④可能空/无效。用它做基准会犯"以被污染者自证是否污染"的循环错误——实测（第 5 节）以识别结果为基准查污染永远 false。

**现有可用替代来源**：无可靠独立来源。配置里有 `seedIndustry`（detail-ai.js:94-97，getIndustrySkillByText 文本推导）也是同源；用户没有类目选择 UI。**明确标记为「未解决」——不自行创造来源**（符合顾问要求）。

## 3. 行业包/子类目/专属规则真实激活时序
```
aiIndustry(middleware:479)
  → resolveIndustrySkill(text含aiText) (:488)
      → resolveIndustryDecision (:425)  ← 错误行业包此刻被选中(industryId/packId定案)
      → resolveSubCategory (:432)       ← 子类目此刻激活(若生产包有subCategories)
      → applyIndustryResolution (:464)
          → applyConfidenceToRules (:392→index.js:447) ← 此刻按 confidence 决定规则层
              high→full_pack_rules(保留 skill 的行业属性)
              medium→parent_common_rules(rules 换成 generic 底座 + 父 coverage)
              low→generic_rules
          → 仅 high 加载包专属 coverage/outputRequirements (:400-416)
  → 下游消费：buildProductAnalysis(:669-693 analyzeAttributes/sellingAngles)
              buildScreenTitles(:741-746) / buildGlobalLock(:827-836) / applyCoverageToTasks(:1314-1316)
  → v2Control.pollutionAudit (:927) ← 识别完成后纯审计，时序太晚
```
**关键**：错误行业包在 resolveIndustryDecision 就选中、专属规则内容在 applyConfidenceToRules 决定是否加载、下游在 screens 循环消费；污染审计(:927)在所有这些之后。

## 4. applyConfidenceToRules 实际行为（实测证据）
用 AG9 的 resolution 分别以 high/medium 跑：
| confidence | level | analyzeAttributes | taboos | packId/industryId |
|---|---|---|---|---|
| high | full_pack_rules | ["服装版型属性"]（行业专属） | ["服装禁忌"] | apparel |
| medium | parent_common_rules | ["商品主体","已确认事实","使用方式"]（generic） | ["不得虚构未确认事实"] | **apparel（不变）** |
**结论**：
- ✅ 降 confidence **能**把规则内容（analyzeAttributes/taboos/sellingAngles/coverage/outputRequirements）换成通用——错误行业"专属规则内容"不会进上下文。
- ❌ 降 confidence **不改** industryId/packId 本体；以下按 id 分支的消费仍用错误行业：`buildTargetAudience`(:624-626 electronics/beauty/food 分支)、`checkSellingPointBoundary(selling, industrySkill.id, …)`(:1380)、`triggerCtxKeys.push("industry_"+industrySkill.id)`(:1427)、`buildV2ControlReport`(:1594)。这是"绕过 confidence 降级的路径"——不是规则文本，但仍是错误行业上下文信号。
- `industrySuppressed`/`subCategorySuppressed` 仅审计字段（生产无读取），不可当拦截开关。

## 5. AG9–AG11 及补充场景探针结果（只读）
| 场景 | 污染判断(以手工指定预期行业) | 当前识别 | 精确触发条件(污染且识别倒向污染来源) |
|---|---|---|---|
| AG9 "版型修身袖口精致的清洁喷雾"(预期 cleaning) | true[apparel:版型/袖口] | **apparel high** | ✅应降级 |
| AG10 原输入"按压海绵头清洁羽绒服污渍" | false | generic low | 不降级 |
| AG10 真弱词命中"棉质面料清洁喷雾去渍" | false（棉/面料被弱词排除，**真实生效**） | cleaning high | 不降级（弱词豁免正确） |
| AG11 "手机快充接口性能"(预期 apparel) | true[electronics:手机] | **electronics high** | ✅应降级 |
| 用户明确 cleaning 但混入"版型"+"清洗剂" | true[apparel:版型] | **cleaning high（识别正确）** | ❌不应降级——若"污染即降级"会误伤 |
| aiHint 与识别同源（apparel 文本说 apparel） | false | apparel high | 不降级（但无法证明独立可信） |
| 纯日化"清洗剂去渍重油污" | false | cleaning high | 不降级 |

**补偿发现**：简单剔除污染词后重跑识别会**过度降级到 generic**（AG9 剔除"版型/袖口"→"修身精致的清洁喷雾"→generic low；"清洁喷雾"不在 cleaning 正信号精确匹配内）。故"文本剔除"路径不可用。
**精确触发条件验证**："污染 **且** 识别结果等于污染来源行业"可准确区分应降级（AG9/AG11）与不应降级（识别正确/纯日化/同源一致）全部 7 场景。

## 6. 方案 A / B / C 判断（不强行推荐 A）
- **A（以可信独立预期行业为基准，污染后降 medium）**：机制上**部分可行**——降级能隔离专属规则内容、精确触发条件可避免误伤；但**前提缺失**：无独立可信预期行业（aiHint 同源），且降级不阻断按 industryId 的分支消费。**按原样不推荐批准**。
- **B（aiHint 不可信时其他可靠来源）**：**不存在**——无用户类目输入、无独立分类过程；seedIndustry 同源。**明确无可用来源**。
- **C（无独立预期行业时调整污染判定契约，不能反向用识别结果）**：**这是当前唯一可推荐路径**。理由：既然"预期行业"无法独立获得，唯一不自证的判定基准是"**识别结果是否等于某污染来源行业，且该来源信号是本行业弱语境无法解释的**"——即用 `checkIndustryPollution(text, 识别结果)` 的反向逻辑不成立（实测永远 false），但可用"**识别结果 industryId 落在 checkIndustryPollution 以其他候选预期行业算出的 risks 来源中**"作为自洽判定：对 AG9，若以 cleaning 为候选预期（因为文本含"清洁喷雾"这类日化线索），risks 来源含 apparel 且识别=apparel→判定被污染。该候选预期来自"识别前的文本语义线索"，仍是同源推断，**不能宣称独立可信**——故 C 的本质是"承认无独立基准，改用保守的多行业冲突降级"：当多行业信号并存且识别倒向其中之一时，直接沿用现有 tie→medium 纪律（P1-1 已有），把 medium 视为污染降级的结果，不新增独立预期行业概念。

### 唯一推荐方案（基于证据，不强行 A）
**推荐：C 的保守落地——复用 P1-1 现有的"多行业冲突→medium"纪律，不新增预期行业字段，不新增 risk 字段。**
- 判定节点：`aiIndustry` 识别前/后均可，但**降级必须在 `applyIndustryResolution`(:464) 之前写入 resolution.confidence**。
- 触发条件：`resolveIndustryDecision` 的 `scored` 出现 ≥2 个行业各有 positive 命中（现有 tie 逻辑已覆盖同分），或识别结果的 evidence 中同时含"本行业正信号 + 他行业正信号"——**这部分需顾问确认是否算改 P1-1 判定契约**（决策9 禁止改 P1-1）。
- 拦截效果：降 medium 后错误行业专属规则内容不加载（第 4 节实测）；按 id 分支信号(:624/:1380/:1427)仍存在，**需顾问确认是否属"专属规则激活"范畴**——若不处理，P1-6 只能隔离规则文本、不能隔离行业 id 信号。
- **若顾问坚持必须隔离 industryId 信号**：那需要改 id 本体（设为 generic），属改 P1-1 契约，超出当前授权，应单独立项。

## 7. 推荐实施位置与最小修改范围（若获批）
- **位置**：`server/detail-middleware.js` 的 `aiIndustry`（:479-503），在 `resolveIndustrySkill` 返回后、`applyConfidenceToRules` 之前对 `resolution.confidence` 做一次污染修正——但注意 `applyConfidenceToRules` 在 resolveIndustrySkill 内部(:464)已调用，实际最小落点是 **resolveIndustrySkill 内 :464 之前**（或把污染判定下沉为 resolveIndustryDecision 的 optional 入参，需顾问定）。
- **不改**：checkIndustryPollution 函数体、resolveIndustryDecision 判定、行业包/Skill/P1-1~P1-5 契约、:927 审计、原始商品资料。
- **回退**：单点修正可 revert。

## 8. 未解决问题与证据边界
- **未解决**：①独立可信预期行业不存在（前提一无解）；②按 industryId 分支消费(:624/:1380/:1427)是否被降 confidence 覆盖需顾问定性；③触发条件是否触碰 P1-1 契约（决策9）；④降级到 medium vs generic 的最终行业预期（第 5 节场景 2/3）。
- **证据边界**：全部来自只读源码 + 内存探针（node -e），未抓真实 `/api/images` 请求体、未调真实模型、未做质量测试；探针中"预期行业"为手工指定，不代表生产可自动获得。

## 9. 需要顾问最终批准事项
1. 是否接受"无独立预期行业"结论，转向方案 C（复用多行业冲突→medium）？
2. 按 industryId 分支消费（targetAudience/边界校验/triggerCtxKeys）是否属 P1-6 治理范围？若属，需改 id 本体、超出当前授权，需另立单。
3. 触发条件用"多行业正信号并存"是否视为改 P1-1 契约？若是，P1-6 无法在不改 P1-1 前提下达成完整拦截。
4. AG9-AG11 升级断言是否以"level 降级"为通过标准（而非 industryId 改变）？

**停止点**：本次只读取证完成，交顾问审查；未实施 P1-6、未启 P2、未提交 commit。等待顾问就第 9 节批准后另立实施单。
