# JY-Canvas P1-6 · 方案 C 设计收敛报告

> 日期：2026-11-20　基线：HEAD `7fcec81`　性质：**实施前设计收敛**——顾问接受方案 C 方向，但只批准设计、不批准代码实施、不启动 P2。未改任何代码/测试/门禁/Skill/行业包/用户资料/状态文档，未提交 commit，未实施降级。
> 顾问决策：不使用 aiHint 作独立基准；不新增预期行业/risk/分类器字段；方案 C 在无独立基准下识别跨行业强正信号冲突、限制不可靠专属策略；P1-1 冲突语义不得未经论证扩大。

---

## 0. 结论先行
1. **ID 分支消费者逐项核验后，实际治理面比预想小**：真正"按 industryId/packId 选专属策略"且降级后仍可能用错误行业的是 `checkSellingPointBoundary`（:1380）与 `inferAudience` 的 electronics/beauty/food 分支（:624-626）；`triggerCtxKeys` 的 `industry_<id>` 因**键空间错配**实际不触发 cleaning 契约（实测）；targetAudience 的服装分支是**商品文本关键词驱动**、非 ID 分支，不属 P1-6 对象。
2. **P1-1 现有 tie→medium 与 P1-6 污染是不同触发条件**：tie=两个包正信号数相等且无强覆盖；污染=单包内混入他行业强正信号。若方案 C 用"多行业正信号并存"触发，会**扩大 P1-1 契约语义**（P1-1 当前高置信唯一最高分即 high，不因并存降 medium）——**明确标记为契约语义变化**，不能借"复用 medium"隐去。
3. **推荐最小架构**：不碰 P1-1 判定函数、不新增字段；在 `resolveIndustrySkill` 内识别后、规则加载前，用**现有 checkIndustryPollution 以候选行业为基准**产出"识别结果是否倒向污染来源"的保守判定，命中则把 resolution.confidence 降 medium；同时把 `industryId` 本体收敛到 generic（因 medium 场景下 P1-1 已有 resolution.industryId=generic 先例，见实测），从根上阻断 ID 分支绕过——但这需顾问确认是否算改 P1-1 契约。

## 1. 方案 C 的准确语义与触发条件
- **目标**：无独立行业基准时，识别"跨行业强正信号冲突"，限制不可靠的行业专属策略进入规划。
- **触发条件（精确）**：`checkIndustryPollution(text, 候选行业)` 的 risks 来源中**包含当前识别结果 industryId**，且当前识别为 high（即单包唯一最高分，非 P1-1 已判的 tie-medium）。实测（上轮报告）：AG9 预期 cleaning 时 risks 含 apparel 且识别=apparel→命中；AG11 预期 apparel 时 risks 含 electronics 且识别=electronics→命中；"用户明确 cleaning+混入版型但识别仍 cleaning"→识别不在 risks 来源→不命中（不误伤）。
- **不触发**：纯单行业、P1-1 已判 tie-medium、弱语境/使用对象（weak 过滤）、无污染的正常商品。
- **动作**：命中则 confidence→medium（复用现有 level 降级），并把 resolution 的 industryId/packId 收敛到 generic（阻断 ID 分支），不删除用户资料、不拒绝生成。

## 2. 与 P1-1 现有契约的边界（关键，不隐去）
| 维度 | P1-1 多行业候选冲突（tie） | P1-6 拟新增跨行业强信号污染 |
|---|---|---|
| 触发 | ≥2 包 hitPositive 数**相等**且无强覆盖(index.js:229) | 单包唯一最高分但命中文案含他行业强正信号(checkIndustryPollution risks) |
| 现状动作 | confidence=medium(industryId 实测=generic) | 拟降 medium + 收敛 id 到 generic |
| 优先级 | 强覆盖(detectIndustryOverride)>通用正信号>fallback>generic | 拟在识别后施加，不改识别顺序 |
| 重叠 | 都是"多行业信号" | 与 tie 不同：污染场景是"不均匀信号+混入"，非同分 |
| 差异 | P1-1 已消费、门禁锁定 | P1-6 新增判定，**不是 P1-1 的 tie 复用** |
**明确判定**：方案 C 若用"多行业正信号并存/识别倒向污染来源"触发，**扩大了 P1-1 的降级触发条件**（P1-1 当前唯一最高分=high，不因混入他行业词降级）。这是**契约语义变化**，不能称"纯复用 medium"。是否接受该变化，属顾问批准项。

## 3. ID 分支消费者逐项核验（治理范围收敛）
| 消费者 | 位置 | 读取内容 | 是否进规划上下文 | medium/收敛后行为 | 是否治理对象 |
|---|---|---|---|---|---|
| inferAudience 服装分支 | :621 文本正则 `/女装\|裙\|显瘦/` | **商品文本关键词** | 是(globalLock:832/AI洞察:1479) | 与 industryId 无关，收敛 id 不改变 | ❌ 文本驱动非 ID 分支，不属 P1-6 |
| inferAudience electronics/beauty/food | :624-626 | `industrySkill.id` | 是 | **收敛 id 到 generic 后不再命中** | ✅ 需 id 收敛才阻断 |
| checkSellingPointBoundary | :1380→skill-activation.js:14 读 `config.industryPacks[industryId].generalizationDetectWords` | `industrySkill.id` | 是(卖点边界真实拦截) | 错误行业 id 会加载错误泛化词；**收敛 id 到 generic 后用空词表** | ✅ 需 id 收敛 |
| triggerCtxKeys `industry_<id>` | :1427 | `industrySkill.id`→contextKeys | 进 activation 判定 | 契约 `industry-cleaning` 要 `industry_id_cleaning`→归一 `industry_cleaning_active`；`industry_apparel` 不在映射表(normalizeContextKeys:252-264)→**键空间错配，实际不触发任何 industry_* 契约** | ⚠️ 实测无效，暂不治理（错配是既有缺陷，非 P1-6 引入） |
| buildV2ControlReport | :1594 | id+resolution | 审计 | 收敛后审计显示 generic | 审计，非治理对象 |
| resolveIndustrySkill base 选择 | :462 | `INDUSTRY_SKILLS[resolution.industryId]` | 规则底座 | 收敛 id 到 generic→generic 底座 | ✅ 随 id 收敛自动解决 |
**实测证据**：AG9 场景（识别 apparel high）`analyzeAttributes`=服装专属（款式结构/版型轮廓/袖口领口…）、`industry-cleaning` decision=inactive（错配实证）、`pollutionAudit` 以识别结果为基准 hasPollution=false（自证循环）。apparel+beauty tie 场景（现有 medium）：industry=generic、analyzeAttributes=generic 公共、coverage 不加载，但 targetAudience 仍服装向（文本关键词驱动，非 ID）。

## 4. applyConfidenceToRules 实际行为（上轮实测复核）
high→full_pack_rules 保留 skill 行业属性；medium→parent_common_rules 把 rules 换 generic 底座（analyzeAttributes/taboos 变通用），**但 packId/industryId 本体不变**。因此：
- 只降 confidence：规则**内容**被隔离，ID 分支（:624-626/:1380）仍用错误行业。
- 降 confidence + 收敛 id 到 generic：规则内容与 ID 分支同时隔离。
- `industrySuppressed`/`subCategorySuppressed` 仅审计字段（生产无读取），不可当拦截开关。

## 5. 推荐最小实施架构与关键调用时序
```
aiIndustry(middleware:479) → resolveIndustrySkill (:425)
  → resolveIndustryDecision (:425→index.js:192)   [错误行业此刻选中]
  → resolveSubCategory (:432)                     [子类目此刻激活]
  → 【P1-6 插入点】污染判定(候选行业来自文本语义/配置，非 aiHint)
       └ checkIndustryPollution(text, 候选) → risks 含识别结果? → 命中
       └ 命中: resolution.confidence="medium"; resolution.industryId="generic"; resolution.packId=null;
              清 evidence 中专属信号; 保留原始 input 文本不变
  → applyIndustryResolution (:464) → applyConfidenceToRules  [按 medium+generic 走 generic_rules]
  → 下游 buildProductAnalysis(:669)/buildGlobalLock(:827)/checkSellingPointBoundary(:1380)/triggerCtxKeys(:1427) 全部拿 generic
```
- **唯一业务改动点**：`server/detail-middleware.js` 的 `resolveIndustrySkill`（:425-466）内，识别后、:464 规则加载前插入污染判定与 resolution 修正。
- **不改**：checkIndustryPollution 函数体、resolveIndustryDecision 判定、applyConfidenceToRules、配置/行业包/Skill/P1-1~P1-5 契约、:927 审计、用户原始资料。
- **候选行业来源（未解决，见第 8 节）**：不能用 aiHint；本设计暂以"识别前对所有包做正信号扫描取 top 候选"为输入（与 P1-1 scored 同源但独立计算，不是新分类器）——若顾问认为这也算改 P1-1，需另议。
- **回退**：单点插入可 revert，无配置残留。

## 6. AG9–AG11 及补充场景验收矩阵（最终效果断言，非 level=medium）
| # | 场景 | 预期输入 | 污染判断 | 预期信号处理 | 最终效果断言（可验证） |
|---|---|---|---|---|---|
| 1 | AG9 | "版型修身袖口精致的清洁喷雾" | risks 含 apparel 且识别=apparel | 降 medium+id→generic | `industrySkill.id=generic`；`analyzeAttributes` 不含"版型/袖口/款式结构"；`checkSellingPointBoundary` detectSource.packId=generic；text 不含服装专属规则 |
| 2 | AG10 真弱词 | "棉质面料清洁喷雾去渍" | 无污染(棉/面料被 weak 排除) | 不触发 | 识别 cleaning high；level=full_pack_rules；无降级 |
| 3 | AG11 | "手机快充接口性能"(候选 apparel) | risks 含 electronics 且识别=electronics | 降 medium+id→generic | `industrySkill.id=generic`；analyzeAttributes 不含"参数/接口/性能"；inferAudience 非 electronics 分支 |
| 4 | 用户明确正确行业+异行业词 | 用户选 cleaning + "版型…清洗剂"(识别仍 cleaning) | 有 risks 但识别不在来源 | 不触发 | 保持 cleaning high；用户选择不被误伤 |
| 5 | 无独立依据+跨行业强信号 | 无 aiHint，文本混多行业强词 | 按方案 C 命中 | 降 medium+id→generic | 同 #1/#3 最终效果 |
| 6 | 无跨行业强信号正常商品 | "清洗剂去渍重油污" | 无 | 不降级 | cleaning high；规则完整加载 |
| 7 | ID 分支绕过检查 | AG9/AG11 降级后 | — | id 已 generic | `checkSellingPointBoundary` packId=generic；`inferAudience` 非 electronics/beauty/food 专属；triggerCtxKeys 无错误行业键 |
| 8 | 原始资料不变 | 任意场景 | — | 只改 resolution | `input.productName/productFeature/userInstruction/sellingPoints` 原样；无新增持久化字段 |

## 7. 可能误伤场景与回归保护
- **误伤**：①商品文本合理含他行业词（如日化提"棉质使用对象"）→ 靠 weak 词排除（AG10 实证），需扩弱词命中测试；②cleaning 强覆盖场景（detectIndustryOverride）本就高置信且含服装否决，方案 C 不应再触发；③P1-1 已 tie-medium 场景不重复降级。保护：触发条件限定"high 且识别倒向 risks 来源"。
- **回归保护**：全门禁 control 531/531、planning 78/78、assets、全量 86/86、build；P1-1/P1-2/P1-3/P1-4/P1-5 既有断言不动；AG9-AG11 保留原检测断言 + 增最终效果断言。

## 8. 未解决问题与风险
1. **候选行业来源仍未解决**：不能用 aiHint，"识别前独立扫描"与 P1-1 scored 同源，是否算新契约/改 P1-1 待顾问定。
2. **id 收敛到 generic 是否属改 P1-1 契约**：P1-1 现有 high 场景不收敛 id；方案 C 收敛是新增行为，需明确批准。
3. **checkSellingPointBoundary 的 packId=generic 后泛化词为空**——是否削弱事实边界？（generic 无 generalize 词，但 BASE authenticity 仍在）需评估。
4. **triggerCtxKeys 键空间错配**是既有缺陷，本方案不修；若顾问要求一并修，超范围。
5. **效果断言依赖内部对象**（industrySkill.id/analyzeAttributes）——测试用真实 buildDetailPromptGroup 读取，非 mock。
- **证据边界**：源码 + 只读内存探针，未抓真实 `/api/images` 请求体、未做真实模型质量测试；探针中"候选行业"为手工指定。

## 9. 是否需要调整 P1-1 契约（明确回答）
**需要明确批准，但不是修改 P1-1 判定函数**：方案 C 新增"high 且识别倒向污染来源→降 medium+id→generic"的触发条件，扩大了 P1-1 现有"唯一最高分=high"的降级语义。若顾问定义为"P1-6 独立后置治理、不改 P1-1 函数体"，则 P1-1 源码契约不变，但**行为契约（何时应为 high/h generic）实质扩展**——必须在验收标准中显式记录，不能隐去。若顾问要求完全不动 P1-1 行为语义，则方案 C 无合法落点，P1-6 应暂缓。

## 10. 需顾问最终批准事项
1. 接受"候选行业来自识别前独立扫描（与 P1-1 scored 同源）"作为判定输入？还是要求另寻来源/暂缓？
2. 批准方案 C 的"降 medium + id 收敛 generic"作为新增治理动作（行为契约扩展）？
3. 确认 triggerCtxKeys 键空间错配不纳入本轮？
4. 确认 checkSellingPointBoundary 用 generic 空泛化词可接受？
5. 确认验收矩阵以最终效果断言为准、保留原 AG9-AG11。

**停止点**：设计收敛完成，交顾问审查；未实施、未提交、未启 P2。等待批准后另立实施单。
