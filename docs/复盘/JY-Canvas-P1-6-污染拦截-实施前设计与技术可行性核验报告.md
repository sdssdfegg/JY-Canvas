# JY-Canvas P1-6 · 污染拦截 — 实施前设计与技术可行性核验报告

> 日期：2026-11-20　基线：HEAD `7fcec81`　性质：实施前设计、技术可行性核验、最小方案论证。**本次不授权代码修改**，未改任何代码/测试/门禁/状态文档，未提交 commit，未启动 P2。
> 约束：严格遵守顾问 10 条决策——只处理跨行业强特征污染；拦截对象=污染信号非用户商品；沿用现有置信度/降级机制、不新增 risk 数值字段；不改 P1-1~P1-5 契约。

---

## 0. 原始决策依据
- 顾问 10 条决策（本次任务书二）；权威规划链 `docs/执行单/规划/JY-CANVAS-P1-架构修复任务拆分-2026-11-20.md:93-102`（P1-6 从仅审计→拦截）；ARCH-001:28 诊断；NEXT.md:18 / 规划README:242 顾问复核裁决。
- 原始恢复报告：`docs/复盘/JY-Canvas-P1-6-污染拦截-原始规划恢复与只读取证报告.md`。

## 1. 当前实际代码链路（路径/函数/顺序/行号）
### 1.1 信号来源与 positiveSignals 生成汇总
- 配置真相源 `server/detail-v2-control/config/professional-content-v1.json`：每包 `positiveSignals`/`negativeSignals`/`weakContextWordsMustNotOverride`/`generalizationDetectWords`。cleaning 17 个正信号(:30)、负信号(:31)、弱语境(:29)；apparel 单行(:73)。
- `activeConfig()`（index.js:52-54）读该配置；`readProfessionalConfig`(:41-48) 校验 status/isPlaceholder。
- 硬编码补充：`APPAREL_STRONG_SIGNALS`（index.js:157）用于 cleaning 覆盖的服装否决，**与 apparel 包 positiveSignals 不完全一致**（多"裙/纽扣/拉链/穿搭/模特"，少"女装/男装/鞋/箱包/面料"）——这是配置与硬编码并存的现状，P1-6 不得新增词表，但需注意该差异。

### 1.2 行业识别主链（真实调用顺序）
```
aiIndustry (middleware:479-503)
  → 构造 text = inputText(用户原始:productName/productFeature/userInstruction/sellingPoints) + aiText(AI:industryId/name/name/realSellingPoints/materials) (:480-486)
  → resolveIndustrySkill(text, aiText) (:488)
      → resolveIndustryDecision (index.js:192)
          1. detectIndustryOverride (index.js:159)：cleaning 强特征 + 无 negative + 无 APPAREL_STRONG_SIGNALS → cleaning/high (199-210)
          2. pack 通用正信号 (215-240)：每包 hitPositive/hitNegative/hitWeak；negative 命中 continue(:223)；按 hitPositive 数排序、tie→medium(:229-234)；weak 仅写 evidence(:238)不参与判定
          3. 旧词表 fallback (:243-255) → low
          4. generic (:259-267) → low
      → resolveSubCategory (middleware:432, index.js:516)：父包判出后包内二级子类目
      → applyIndustryResolution (middleware:389) → applyConfidenceToRules (index.js:447)：confidence→level
      → 返回 industrySkill（rules+resolution+ruleLoadDecision+coverage/outputRequirements）
  → 若 generic 且 aiPlan 有合法 industryId → legacy 采纳 (:491-501)
```

### 1.3 污染检测现状（仅审计，时序在识别之后）
- `checkIndustryPollution`（index.js:558-579）：入参 `textInput`、`industryId`；遍历其它包 positiveSignals，`text.includes(word) && !ownPositives.has(word) && !weakWords 双向包含` → risks；返回 `{hasPollution, risks, note}`，note 明写"不作硬性拦截"。
- 唯一生产调用点 `middleware:927-930`（在 `buildV2ControlReport`:879 内）：入参 `JSON.stringify(aiPlan.product || {})` + `industryId`（**已识别结果**）；结果挂 `v2Control.pollutionAudit`。
- `pollutionAudit`/`hasPollution`/`risks` 全仓无拦截/降级消费者；`src/` 前端零命中 → **纯审计**。

### 1.4 P1-1/P1-2 降级机制的真实消费者（可复用基础）
- `ruleLoadDecision.level`（index.js:504）在 `middleware:400` 门控：仅 `full_pack_rules` 才 `admitIndustryPack` 并加载包专属 coverage/outputRequirements(:403-416)；降级层不加载并记 `suppressed_by_confidence`(:417-420)。
- 降级后的 `rules` 本体被真实消费：`buildProductAnalysis`(:669-693)、`buildScreenTitles`(:741-746)、`buildGlobalLock`(:827-836)、`applyCoverageToTasks`/`applyOutputRequirements`(:1314-1316) 进屏级提示词。
- **结论**：confidence→level→规则加载链是"真实拦截/降级"（非仅审计），是 P1-6 沿用现有机制的可行落点。
- 仅审计字段：`industrySuppressed`/`subCategorySuppressed`（index.js:491/492/497）生产无读取，仅测试读——不可当作拦截开关。

## 2. 运行时探针：P1-6 要解决的真实问题（关键证据）
只读探针（`node -e`，未改文件）实测：
| 输入 | checkIndustryPollution(以预期行业为基准) | 当前 resolveIndustryDecision 结果 |
|---|---|---|
| "版型修身袖口精致的清洁喷雾"，预期 cleaning | 污染=true，risks=[apparel:版型/袖口] | **apparel high**（污染信号把识别带偏） |
| "手机快充接口性能"，预期 apparel | 污染=true，risks=[electronics:手机] | **electronics high**（同上） |
| "清洗剂去渍重油污"，cleaning | 无污染 | cleaning high |
**结论**：跨行业强特征并存时，当前识别会错误倒向污染来源行业——这就是 P1-6 "隔离异行业强特征、避免影响识别与专属策略激活"要修的真问题（顾问决策5）。

## 3. 拦截位置比较（不凭行号，按调用链）
| 维度 | index.js checkIndustryPollution（风险函数） | middleware 扩展点（buildV2ControlReport:927） |
|---|---|---|
| 时序 | 可在识别前调用（纯函数，输入任意文本+预期行业） | **识别之后**（:1594 才 buildV2ControlReport），此时行业已定案 |
| 最适合判定污染 | ✅ 是——纯函数、配置驱动、已有 weak 过滤 | 否——只能拿到已识别结果 |
| 最适合执行信号隔离 | ✅ 可在 resolveIndustryDecision 前提供"需剔除的污染词" | ❌ 太晚——识别与规则加载(:464)已完成，证据已下游消费 |
| 不改识别契约 | 可行——不改 resolveIndustryDecision 签名，仅在 aiIndustry 组装文本时用污染词做输入侧处理 | 可行但无意义（事后） |
| 重复/时序/证据风险 | 若每次识别都调用需评估开销；需解决"预期行业"来源（见第 6 节阻碍） | 时序过晚是硬伤；不改也能保留审计 |
| 影响其它包/generic | 取决于隔离策略；不当剔除会过度降级到 generic（实测见第 4 节） | 无（仅审计） |
**判定**：判定污染放 index.js（复用 checkIndustryPollution）；执行信号隔离应在 **middleware 的识别入口 aiIndustry（:479-503）识别前**，而非 :927 审计点。:927 保持审计不变。

## 4. 拦截动作最小方案论证（含实测阻碍）
顾问要求的动作：原始资料保留 / 污染信号不作当前行业有效证据 / 现有识别与置信度继续工作 / 无法可靠识别时按现有机制降级 / 不拒绝生成 / 不新增 risk 字段。

### 4.1 实测阻碍（必须如实报告，不可跳过）
尝试"剔除污染词后重跑识别"（文本侧隔离）实测：
- AG9 "版型修身袖口精致的清洁喷雾" 剔除版型/袖口→"修身精致的清洁喷雾"→识别 **generic low**（未回到 cleaning！）
- AG11 "手机快充接口性能" 剔除手机→"快充接口性能"→ **generic low**
- "清洁喷雾手机快充" 剔除手机→"清洁喷雾快充"→ **generic low**（"清洁喷雾"不在 cleaning 正信号精确匹配内）
**原因**：cleaning 正信号是"清洁剂/清洗剂/去渍/重油污"等，AG9 的"清洁喷雾"不在其中；剔除异行业词后本行业强特征也不足 → 只能 generic。**简单文本剔除会导致过度降级**，达不到"回到本行业"。

### 4.2 循环依赖阻碍（更根本）
- checkIndustryPollution 需要"预期本行业"才能判定何谓"异行业"；但当前 :927 传入的是**已识别结果 industryId**——识别已被污染时，以错误结果为基准查污染永远返回 false（实测：AG9/AG11 以识别结果 apparel/electronics 为基准，污染=false）。
- 因此"预期本行业"必须来自识别之前（如模型 aiHint 的 product.industryId、或用户显式行业），但现有契约中该值只是 aiText 的一部分，**无独立的"预期行业"字段**——若要用它，是否算"新增契约"需顾问裁定（决策8 只禁数值 risk 字段，未禁复用 aiHint）。

### 4.3 方案 A（推荐，最小改动，沿用置信度降级）
核心思路：**不改识别文本、不改 resolveIndustryDecision 判定**；把污染检测作为"识别结果的置信度修正信号"，通过现有 confidence→level 降级链生效。
1. 在 `aiIndustry`（middleware:479-503）识别完成后，用"预期行业=模型 aiHint 的 product.industryId（若配置的合法 industryId）"调 `checkIndustryPollution(inputText+aiText, 预期行业)`——预期行业取 aiPlan.product.industryId，无则从识别候选推断（见第 6 节待决策）。
2. 若 `hasPollution` 且识别结果 industryId ≠ 预期行业（识别倒向污染来源）→ 把 resolution.confidence 降为 `medium`（或 generic 时保持 low），**写回 resolution**（不改 decisionPath/industryId 本体）。
3. 后续 `applyConfidenceToRules` 按现有 medium 逻辑走 `parent_common_rules`：`industrySuppressed=true`、不加载包专属 coverage/outputRequirements——污染来源行业的专属策略自动不激活。
4. 原始用户资料 `inputText` 不删改；只降置信度，不拒绝生成。
- **修改文件/函数**：`server/detail-middleware.js` 的 `aiIndustry`（:479-503）加污染判定与 confidence 修正；复用 `checkIndustryPollution`（index.js:558，**不改其函数体**）；`applyConfidenceToRules` 不改。
- **解决什么**：让"被污染的高置信行业识别"降为 medium，从而不激活污染来源行业的专属规则——符合决策5、8、9、10。
- **为何不改 index.js 风险函数**：其 weak/ownPositives 过滤已正确（AG10 语义），改动会引入新契约风险。
- **阻碍**：预期行业来源（第 4.2 节）需顾问明确；若 aiHint 也不可靠，方案 A 退化为"仅当多行业同分(tie)时已有 medium"，P1-6 无新增价值，需改方案 B。

### 4.4 方案 B（备选，仅当方案 A 的预期行业不可得）
在 `resolveIndustryDecision` 内，对 `scored` 中"被其它包 weakContext 覆盖的 hitPositive"做降权——但**这会改 P1-1 识别契约**（决策9 禁止），故**不推荐**，仅在顾问明确授权改 P1-1 时讨论。当前证据下**方案 A 足够优先，不强行展开 B**。

## 5. AG9–AG11 现状与升级方案
- **现状**（chain-check.mjs:915-917）：三条均为 `checkIndustryPollution(...).hasPollution === boolean` 的**仅审计断言**，不调用拦截/降级、不查 risks、不改 ruleLoadDecision。AG12(:918) 仅断言 `pollutionAudit` 挂点存在。
- **精确补注**：AG10 输入"按压海绵头清洁羽绒服污渍"不含 cleaning 弱词（衣物/面料/棉/厨房/卫浴/包装之外的"羽绒服"不在弱词表），其 false 是"羽绒服/海绵头/按压不在其它包正信号"，并非弱词豁免生效——现有用例未真正覆盖弱词分支。
- **升级方向**（设计，本次不实施）：保留三条检测断言；新增"识别结果断言"——同一输入经 aiIndustry 后，污染场景下 ruleLoadDecision.level 应为 parent_common_rules/generic_rules（不再 full_pack_rules），且污染来源行业的包专属 coverage/outputRequirements 不加载；无误伤场景应维持原 level。需新增弱词真实命中用例（如含"棉/面料"的 cleaning 文案）补 AG10 缺口。

## 6. 正反例测试矩阵（设计，标预期；缺证据项如实标注）
| # | 场景 | 输入(预期) | 预期污染判断 | 预期信号处理 | 最终行业(level) | 断言 |
|---|---|---|---|---|---|---|
| 1 | 当前行业强特征正常 | "清洗剂去渍重油污" | 无 | 不隔离 | cleaning/high(full) | 原 AG 无污染 + level=full_pack_rules |
| 2 | 单一异行业强特征混入 | AG9 "版型修身袖口精致的清洁喷雾"(预期 cleaning) | 有(apparel) | 降置信度、不激活 apparel 专属 | 预期行业 medium(parent) 或 generic | hasPollution=true + level≠full_pack_rules |
| 3 | 多异行业强特征混入 | "版型袖口清洗剂手机快充"(预期 cleaning) | 有(apparel+electronics) | 同上 | medium/generic | risks 含 2 行业 + level 降级 |
| 4 | 弱语境含它行业词 | "棉面料清洁喷雾"(cleaning 弱词含棉/面料) | 无 | 保留 | cleaning(high/full 或按原识别) | hasPollution=false（弱词豁免真实生效） |
| 5 | 仅使用对象 | AG10 "按压海绵头清洁羽绒服污渍" | 无 | 保留 | 按现有识别 | hasPollution=false |
| 6 | 泛化词不触发污染 | "所有材质通用清洗剂"(泛化词属 noGeneralization/checkSellingPointBoundary，非跨行业信号) | 无跨行业污染 | 交 P1-2 边界机制 | cleaning/high | hasPollution=false + 边界由 checkSellingPointBoundary 管 |
| 7 | 多行业信号冲突 | "清洗剂+口红+手机"(三行业正信号) | 有多来源 | 降置信度 | medium(现有 tie 已 medium) 或 generic | 不激活任何专属规则 |
| 8 | 无有效强特征降级 | "未知商品xyz" | 无 | 保持 | generic/low | 原 generic 行为不变 |
| 9 | cleaning | 同 #1/#2 | — | — | — | P1-1/P1-2 cleaning 不回归 |
| 10 | laundryStain 子类目 | "衣物去渍衣领净领口去渍" | 无跨行业(子目在其包内) | 保留 | laundryStain/high | P1-3 子类目识别不回归 |
| 11 | 非清洁剂行业 | "纯棉T恤版型宽松"(apparel) | 无 | 保留 | apparel/high | 不误判污染 |
| 12 | generic 降级 | 同 #8 | — | — | generic | 不变 |
| 13 | 多行业包同时存在 | 配置 8 包+1 子目全在 | 按实际 | 按实际 | — | 遍历所有包无异常 |
| 14 | P1-1/P1-2 场景不回归 | 复用既有 AG9-AG11 + P1-1/P1-2 全套门禁 | — | — | — | 全门禁绿 |
**标注**：场景 2/3/7 的"最终行业"依赖"预期行业"来源（第 4.2 节待决策），当前配置下实测简单剔除会到 generic——**预期值待顾问确认后才能定死**；场景 10 laundryStain 的生产配置真实存在（P1-3 补充已落地），可测。

## 7. 兼容性与风险
| 项 | 方案 A 影响 | 说明 |
|---|---|---|
| P1-1 行业优先级 | **不改变** | 不改 detectIndustryOverride/resolveIndustryDecision 判定，只在识别后改 confidence |
| P1-2 字段消费 | 不改变 | coverage/outputRequirements 加载逻辑不变，仅因 level 降级而少加载 |
| P1-3 子类目继承/降级 | 不改变 | resolveSubCategory 与 single-signal 门槛不动 |
| P1-4 五态契约 | 不改变 | 不碰 lifecycle/injection |
| P1-5 注入治理 | 不改变 | 不碰 D1 治理/D2/D3 |
| 行业包独立性 | 不改变 | 不新增词表、不改包配置 |
| generic 降级 | **受影响但符合预期** | 污染场景可能降 generic（实测文本剔除路径）；这是"无法可靠识别时按现有机制降级"（决策5）的体现 |
**风险**：① 过度降级——若预期行业判定不准，正常多行业文案可能被降 medium/generic，损害专属策略质量；② 预期行业循环依赖（第 4.2 节）；③ 硬编码 APPAREL_STRONG_SIGNALS 与配置不一致，可能使某些污染漏检或误检。三项均需顾问决策而非自行处理。

## 8. 需顾问最终批准的实施范围
1. **确认"预期行业"来源**：用 aiPlan.product.industryId 作基准是否授权？（决策8 只禁数值 risk 字段，未明确此项）
2. **确认拦截动作=降 confidence 到 medium**（经现有 level 链不激活污染来源专属规则），而非文本剔除/拒绝生成。
3. **确认 :927 审计点保持纯审计**，不改为拦截点。
4. **确认 AG9-AG11 升级形态**：保留检测断言 + 新增 level/规则加载断言 + 补弱词真实命中用例。
5. **确认方案 A 足够、无需方案 B**（B 需改 P1-1 契约，当前不推荐）。
6. 若以上任一不获批准，P1-6 实施范围需重新界定。

## 9. 绝对不改清单
业务代码除 `aiIndustry` 单点外不动；不改 resolveIndustryDecision/detectIndustryOverride/applyConfidenceToRules 函数体；不改 checkIndustryPollution；不改配置/Skill/行业包；不改 P1-1~P1-5 契约与门禁；不新增 risk 数值字段/Executor/Agent/Skill；不启动 P2。

## 10. 回退方案
方案 A 为单点 confidence 修正，回退=移除 aiIndustry 中的污染判定与修正逻辑（单 commit 可 revert）；配置/函数体/门禁未改，回退无残留。

## 11. 风险/冲突/未确认 & 停止点
- **冲突**：拆分文档称 checkIndustryPollution"提供 risk 等级"但代码无数值 risk（决策8 已定为不新增，按决策执行）；硬编码 APPAREL_STRONG_SIGNALS vs 配置 positiveSignals 不一致（并列记录）。
- **未确认**：预期行业来源（第 4.2/8 节）；AG9-AG11 升级后最终行业预期值；laundryStain 跨子类目污染是否纳入（决策3 暂不纳入）。
- **证据边界**：全部结论来自只读源码 + 内存探针；未抓真实 `/api/images` 请求体、未做真实模型质量测试；探针结果不表述为质量验证。
- **停止点**：本报告为设计与可行性核验，交顾问审查；未实施 P1-6、未启动 P2、未提交 commit。等待顾问就第 8 节范围批准后再另立实施单。
