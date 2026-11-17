# Skill 06 · 电商文案与版式（ecommerce-copy-layout）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.5/问题 2、v1.1 §10/§11（copywriting 三档、fontStyle 并入、信息密度合并）、D-PLAN-12 index.js directives②。方案原文细节待 Owner 复核。

## 职责
把 `marketingStrategy` 的四层结论写成每屏可用文案与标题/版式结构，分层表达、信息有度、不空洞复述参数。承担"购买兴趣→可执行文案"的落地点（D-PLAN-11 §2.2 hero purpose 无落地点问题）。

## 触发
- 每次策划必经（阶段 F），在视觉指导之后、跨屏校验之前。
- copywriting 档位（poster/need/standard 等）、richness 信息密度、fontStyle 合并档决定表达形态。

## 输入
- `marketingStrategy.valueLadder`、`consumerInsights`、`product` 分级事实；
- `planning.screenRoles` 与每屏内容任务、`globalVisualDNA.tone`；平台文案规范与 `lang`（输出语种，默认中文）。

## 判断方法
1. 每屏文案 = 标题来源 + 利益表达句 + 必要的可信支撑（引用 `visible`/`inferred` 事实），与画面任务互补而非重复。
2. 标题由屏序与内容任务决定，非固定轮转；首屏标题不写死（决策 #4）。
3. 信息密度按 richness 合并档控制：高密度多支撑点、低密度留白突出主表达。
4. hero 屏须给"引发购买兴趣"的可执行文案动作（如主利益句/差异钩子），不是"确认商品身份"的空话。
5. 禁绝对化/医疗化词；认证/疗效/销量等无证据不写。

## 规则
1. 文案只引用 `visible`/`inferred` 事实，`mustNotClaim` 不得进入任何屏文案（与 Skill 01 联动）。
2. 相邻屏文案不做语义复述（与 Skill 07 去重联动）。
3. 输出语种跟随 `lang`（v1.1 C-3：默认中文、必须实际进入指令），不硬编码中文。
4. copywriting/ rich ness/fontStyle 按 v1.1 §11 合并语义消费，不新增参数、不改 UI。
5. 文案是建议性策划中间产物，不自动覆盖用户已确认的 `copywriting`（决策 #6）。

## 输出字段
`screens[].{title, summary, sellingPoint, copywriting, promptDirectives[], negativeConstraints[]}`；字段值域沿用现有 outputSchema，不改运行时结构。

## 边界
本 Skill 只做文案与版式结构，**不改前端参数 UI、不新增必填设置、不做视觉构图（→ visual-art-direction）、不改 G-2 词表**；不改运行时。

## 冲突处理
- 文案诱感 vs 真实性：真实性优先，删去无证据表达（五原则）。
- 用户 copywriting 档位 vs 策划更优表达：尊重用户档位，策划在该档内优化。
- 首屏"不写死标题" vs 平台模板习惯：按商品属性拟标题，不套固定句式。

## 测试案例
- 案例 F（营销表达）：只给包装参数 → 文案做事实→需求→利益→表达，非参数罗列。
- 案例 B（资料不足）：单图清洗剂 → 文案保守，不写虚构功效。
- 负向：两屏 summary/sellingPoint 语义几乎相同 → 判为复述。
