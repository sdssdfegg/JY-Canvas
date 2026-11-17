# Skill 01 · 商品理解（product-understanding）

> 阶段 A 专业资产（职责边界与专业规则不删减）。依据：D-PLAN-11 §2.1/§4.2、D-PLAN-12 §2 断言 3、index.js 冻结 directives①。方案原文细节待 Owner 复核。

## 职责
从商品图（唯一必选输入）与可选资料中提取商品事实，并逐条做**事实分级**，为下游行业路由、营销策划、叙事与视觉提供唯一可信的事实底座。商品真实性高于营销创意（V219 §2 五原则）。

## 触发
- 每次策划必经（阶段 A），无板块/有板块均执行。
- 商品资料越不足，越要保守：单张白底图时不得推断材质/使用人群/场景（D-PLAN-11 §5.3，模型保守属合理）。

## 输入
- 商品图（必选）；可选：productName / productFeature / userInstruction / sellingPoints / 行业展示值。
- 现有 `product` 字段语义（`name`/`industryId`/`materials`/`colors`/`structureLocks`/`realSellingPoints`/`riskNotes`/`styleDirection`）。

## 判断方法
每条事实按图片可证性分三级：
- `visible`：图片中直接可见或包装明确标示（如"瓶身标示为血渍清洗剂"）；
- `inferred`：有合理依据但图片不能完全确认（如材质、使用人群），须显式标注推断；
- `mustNotClaim`：图片无法确认且涉及功效/认证/疗效/销量/品牌背书，**禁止作为确定事实输出**。

## 规则
1. 不得虚构材质、参数、认证、疗效、销量、品牌背书（index.js directives①，`productAuthenticityLock` 语义）。
2. 中文标签、商品结构逐字核对，不臆造标签文字（D-PLAN-11 §2.7）。
3. `mustNotClaim` 断言不得进入 `product` 确定事实或 `screens` 卖点（与 `planning.facts` 引用校验联动）。
4. 行业与使用场景分离：衣物血渍清洗剂属日化清洁剂，使用场景"衣物"≠服装行业（V219 §4 案例 A）。
5. 不可确认项写入 `product.uncertainties`，供下游保守表达。

## 输出字段
`product.{name, industryId, industryName, targetAudience, materials, colors, structureLocks, realSellingPoints, riskNotes, styleDirection, uncertainties[]}`；分级事实写入 `planning.facts[{claim, level}]`（level ∈ visible/inferred/mustNotClaim）。

## 边界
本 Skill 只做理解与分级，不做行业规则选择（→ industry-routing）、不做营销转化（→ consumer-marketing-strategy）；不虚构、不替用户补资料；不改运行时代码与 G-2 词表。

## 冲突处理
- 图片与用户资料冲突：以图片可确认事实为准，资料作 `inferred`，冲突点写入 `riskNotes`。
- 资料齐全但图片仅白底：仍按可证性分级，资料标注为外部提供而非图片可见。
- 与旧链路冲突：旧 `product` 字段保留，本 Skill 只增补分级，不改旧字节。

## 测试案例
- 案例 B（资料不足）：单张白底清洗剂图 → 不虚构材质/功效、不强制材质模块，`uncertainties` 非空。
- 案例 A（行业路由）：血渍清洗剂 → 行业=日化清洁剂，不因"衣物"语境词判服装。
- 负向：包装无认证标识却输出"通过 XX 认证" → 必须判 `mustNotClaim` 并拦截。
