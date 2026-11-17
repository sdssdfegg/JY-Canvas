# Skill 04 · 详情页叙事规划（detail-story-planning）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.2/§2.3/§4.3、D-PLAN-12 §3 问题 2/3、index.js directives②③④、V219 §2 决策 #2/#3/#4。方案原文细节待 Owner 复核。

## 职责
在用户指定屏数内规划整组叙事线、每屏信息角色与内容任务；首屏默认 hero 但不写死标题与构图；板块是偏好排序而非固定模板。整组叙事高于单屏美观（V219 §2 五原则）。

## 触发
- 每次策划必经（阶段 D）。
- 无板块（selectedSections 空）时必须自主规划；有板块时按用户偏好排序编排。

## 输入
- `consumerInsights`/`marketingStrategy`（内容与利益）；
- `count`（硬约束 1–12，默认 8）、平台 `workflow` 节奏、用户 selectedSections 偏好、可选资料。

## 判断方法
1. 先定叙事线（如：建立认知 → 证明价值 → 消除顾虑 → 促成转化），再逐屏分配信息角色，角色对应 `moduleId` 候选。
2. 每屏承担**独立信息价值与视觉任务**，相邻屏不做语义复述（D-PLAN-11 §2.2 无跨屏去重根因）。
3. 首屏 hero：完成"第一眼确认商品 + 建立购买兴趣"的**可执行任务**，不是只做包装识别；落地"购买兴趣"须给具体画面/信息动作（D-PLAN-11 §2.2 purpose 无落地点问题）。
4. 无板块时按屏序自主拟标题来源，**禁止固定标题轮转**（如"首屏主视觉""收尾转化"模板化标题）。
5. 选板块+调序时尊重用户顺序；板块只是偏好，不构成必须逐字展示的固定模板。

## 规则
1. `screens` 长度恒等于 `count`，不增不减；每屏 `index` 从 0 起、与 `screenRoles` 一一对应（index.js constraints①②）。
2. `materialDetail` 等依赖可确认属性的模块，须有适用性前置条件：**材质不可确认则不选材质模块**（D-PLAN-11 问题 3），选前查 `product` 分级。
3. 首屏 `role=hero` 但标题文字与构图由商品属性/屏序自主拟定（决策 #4，不写死正面居中）。
4. 屏数内内容不得为凑屏重复；每屏有独立 `sellingPoint`/`composition` 任务（index.js directives④）。
5. `planning.narrative`/`screenRoles` 与 `screens` 同步产出（index.js constraints①）。

## 输出字段
`planning.{narrative{id,reason,confidence}, screenRoles[{index,role,sectionRefs}]}`；`screens[{screen,moduleId,title,summary,sellingPoint,composition,referenceReason}]`；复用现有 moduleId 词表值域，不改词表。

## 边界
本 Skill 只做叙事与屏序，**不做视觉 DNA 六维构图（→ visual-art-direction）、不写文案版式细则（→ ecommerce-copy-layout）、不改模块词表（G-2 禁改）**；不改运行时。

## 冲突处理
- 指定屏数与实际内容量不符：在屏数内合并/拆分信息角色，不减屏也不硬凑重复（count 硬约束）。
- 用户板块顺序 vs 叙事最优序：尊重用户顺序，叙事在其顺序内优化，不擅自重排。
- 材质/参数不可确认但用户选了对应板块：保守表达或改选等效可确认模块，不虚构材质（问题 3）。

## 测试案例
- 案例 C（屏数约束）：指定 6 屏 → 恰好 6 屏，首屏 hero 定位，每屏独立任务，无模板化标题。
- 案例 D（空板块）：板块为空 → 自主规划 8 屏叙事，count 硬约束，不回退轮转。
- 案例 B（资料不足）：单图清洗剂 → 不强制选材质模块。
