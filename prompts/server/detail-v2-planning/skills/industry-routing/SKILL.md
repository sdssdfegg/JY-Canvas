# Skill 02 · 行业路由（industry-routing）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.1/§4.1、D-PLAN-12 §3 问题 1/§4 三项工程项、§5.3 建议 A。方案原文细节待 Owner 复核。

## 职责
判定商品的**展示行业**与**规则词表行业**为同一个决策结果，提供行业强特征识别判据与路由优先级。核心原则（方案转述）："展示行业与专业 Skill 选择必须同一决策结果；一致性由工程代码负责"——本 Skill 给专业判据，一致性校验属工程侧（S2-B 及工程线单）。

## 触发
- 每次策划必经（阶段 B），紧随商品理解之后。
- 商品语境出现跨行业词（如清洗剂含"衣物/面料"）时尤其关键：这是 D-PLAN-11 问题 1（服装规则串入清洗剂）的高发场景。

## 输入
- `product-understanding` 的分级事实（尤其 `industryId`/`realSellingPoints`/`materials`）。
- 行业候选集：apparel / beauty / food / home / electronics / motherBaby / pet / jewelry / sports / generic（现有 10 类）、cleaning（日化清洁剂，V219 §4 六类）。

## 判断方法
1. **强特征词优先**：行业专有的强特征（如"泵头+清洁成分+去渍"→清洁/日化）优先于弱语境词。
2. **弱语境词不越权**："衣物/面料"在清洗剂语境是**使用场景**，不构成服装行业信号（V219 §4 案例 A）。
3. 按商品主功能与品类定行业，不按名词共现计数定行业（D-PLAN-11 §2.1 关键词计数缺陷）。
4. 输出单一 `industryId`，展示值 `industryName` 与之对应；不确定取 `generic` 并记 `uncertainties`。

## 规则
1. 展示行业与规则行业必须取同一 `industryId`；若模型判定与关键词路由不一致，**以商品事实为准**并让工程记录一致性告警（D-PLAN-11 §4.1）。
2. 禁止把清洗剂判为服装、把食品判为美妆等跨品类串规则。
3. 同分/歧义裁决：强特征 > 商品主功能 > 弱语境词 > generic；不得依赖 `Object.values` 枚举顺序（D-PLAN-11 §2.1 同分偏 apparel 缺陷）。
4. 只输出判据与结果，不改 `prompts/server/detail-skills.js` G-2 词表（Owner 裁决⑤：新增覆盖层、不改旧词表）。

## 输出字段
`industryProfile.{industryId, industryName, evidence[], decisionLogic, confidence, uncertaintyNote}`；`evidence` 引用 `product` 已分级事实，不引用 `mustNotClaim`。

## 边界
本 Skill 只做行业判定与判据输出，**不生成行业规则词表、不改 G-2 词表、不做模块选择**；行业一致性校验的机器实现属工程侧（工程线单），本批只落声明。

## 冲突处理
- 模型行业名 vs 关键词路由结果冲突：以商品事实为准取单一 `industryId`，记录 `uncertaintyNote` 交工程一致性校验。
- 场景词 vs 品类词冲突（衣物 vs 清洗剂）：按场景词不越权处理，取日化清洁剂。
- 无法判定：取 `generic`，写入 `product.uncertainties`，不强行归入具体行业。

## 测试案例
- 案例 A（行业路由）：血渍清洗剂（含"衣物血渍"）→ `industryId=cleaning/home`，**不加载服装规则**（不出现版型/袖口/纽扣/模特比例）。
- 负向：仅因文本含"面料"就判 apparel → 判红。
- 正向：服装 T 恤（含版型/模特）→ apparel，规则词表与展示一致。
