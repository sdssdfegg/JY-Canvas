# JY-Canvas P1-6 · laundryStain 子类目污染漏拦截补充核验报告

> 日期：2026-11-21　基线：HEAD `73c42b3`　性质：顾问限定的补充只读核验与设计，**未改业务代码/测试/门禁/行业包/Skill/状态文档，未提交 commit，不改变现有实施结果**。
> 唯一文档例外：按本轮明确授权回填实施报告第八节状态同步 commit 占位（见第五节）。

---

## 一、核验目标与结论
核验 laundryStain 命中时"完全跳过冲突保护"是否形成真实漏拦截。**结论：是，存在真实漏拦截**——但已验证一个不改 P1-3 语义、不扩大词表、不改弱语境、不改 P1-1 评分/tie/override 的最小治理方案（父包基准 + 子目信号词窄豁免），待顾问裁决后另行实施。

## 二、关键配置事实（生产配置 `professional-content-v1.json`）
- laundryStain 子目 positiveSignals：`衣物去渍`、`衣领净`、`领口去渍`（extends=cleaning）。
- parent cleaning positiveSignals 含 `去渍` 等 17 词；weakContext 含 `衣物/面料/棉/厨房/卫浴/包装`（**不含"领口"**）。
- apparel positiveSignals 含 `版型/袖口/领口/面料` 等；weakContext 含 `清洁/洗涤/护理/包装`。
- **交叉点**：子目信号"领口去渍"含 apparel 正信号"领口"，且 cleaning weak 不豁免"领口" → 子目自身信号可能被误判为 apparel 污染。

## 三、五场景逐项证据（真实探针，非手工候选）
| # | 原始输入 | 子目命中信号 | 各行业强正信号命中 | 当前污染检测(以 final=laundryStain) | 当前最终 id/conf/path | 子目规则 | 他行业专属规则 | 预期与判断 |
|---|---|---|---|---|---|---|---|---|
| S1 正常 | "衣物去渍护理剂"+"衣物去渍衣领净领口去渍，成分：表活。" | 衣物去渍/衣领净/领口去渍(3) | cleaning:去渍(1)；apparel:领口(1) | **hasPollution=true**，risks=cleaning:去渍 + apparel:领口 | laundryStain/high/subcategory_signal_match | 加载 | 无 | 应保持 P1-3 行为 ✅（当前因跳过保护而保持，但污染检测本身误报） |
| S2 +apparel真信号 | "衣物去渍衣领净领口去渍版型修身袖口精致"+"成分：表活。" | 同上(3) | cleaning:去渍(1)；apparel:版型/袖口/领口(3) | hasPollution=true，risks 含 apparel 三词 | **laundryStain/high/subcategory_signal_match** | 加载 | 无（被跳过逻辑放过） | ❌ **漏拦截**：apparel 真强信号版型/袖口未触发冲突保护 |
| S2b +electronics | "衣物去渍衣领净手机快充"+"成分：表活。" | 衣物去渍/衣领净(2) | cleaning:去渍(1)；electronics:手机(1) | hasPollution=true，risks 含 electronics:手机 | **laundryStain/high** | 加载 | 无 | ❌ **漏拦截**：electronics 真强信号未触发 |
| S3 子目自身领口 | "衣物去渍领口去渍"+"成分：表活。" | 衣物去渍/领口去渍(2) | cleaning:去渍(1)；apparel:领口(1) | hasPollution=true，risks 含 apparel:领口 | laundryStain/high | 加载 | 无 | 应保持（"领口"是子目自身信号，不应判污染）——当前跳过保护恰好避免误伤 |
| S4 父包信号对照 | "清洗剂去渍重油污"+"成分：表活。"（无子目命中） | 无 | cleaning:清洗剂/去渍/重油污(3)；其它 0 | hasPollution=false（以 cleaning） | cleaning/high/pack_strong_override | 不加载子目 | 无 | 正常单行业不误降级 |

**关键结论（对应顾问 5 问）**：
1. 正常 laundryStain（S1）当前保持 P1-3 识别和继承行为 ✅。
2. laundryStain + 他行业真强信号（S2/S2b）：污染检测**能**检出真实冲突（hasPollution=true、risks 含版型/袖口/手机），但**当前跳过逻辑使其不生效**。
3. 子目自身信号"领口"确实被误认为 apparel 污染（S1/S3 的 risks 含 apparel:领口）——这是以子目为基准检测的系统性误报。
4. 真实跨行业冲突下跳过逻辑**确实导致漏拦截**（S2/S2b 仍 laundryStain high + 子目规则加载）。
5. 存在最小治理办法（第四节），验证通过。

## 四、最小治理方案（唯一推荐，待授权）
**核心**：子目场景不再"完全跳过"，改为"父包基准检测 + 子目自身信号词窄豁免"：
1. 子目命中时，以**父包 id（cleaning）**为污染检测基准（而非子目 id）——父包正信号被 ownPositives 自动豁免，解决"去渍"误报。
2. 对检出的 risks 信号词，剔除**被子目信号包含或包含子目信号**的词（如"领口"⊂"领口去渍"）——解决子目自身信号误报。
3. 剔除后若仍有 genuine 异行业信号 → 按现有已实施的收敛逻辑一致收敛 generic/medium（复用 `cross_industry_conflict` 路径）。
4. 不改 P1-1 评分/tie/override；不改子目语义/词表/弱语境；不新增字段。

**实测验证（只读探针，未改代码）**：
| 场景 | 父包基准 + 子目词豁免后的真实冲突 |
|---|---|
| S1 正常 laundryStain | 空（不误报）✅ |
| S2 +版型/袖口 | `[apparel: 版型/袖口]` ✅ |
| S2b +手机 | `[electronics: 手机]` ✅ |
| S3 子目领口 | 空（"领口"被豁免）✅ |
| S4 父包信号 | 空 ✅ |
| 负向 food 信号 | `[food: 食品/饮料]` ✅ |
| 负向多真信号 | `[apparel:版型, beauty:口红, electronics:手机]` ✅ |
| 负向 beauty 彩妆 | `[beauty: 口红/彩妆]` ✅ |

**窄豁免边界**：逐词核对显示子目信号仅包含/被包含"领口"一个 apparel 词；"版型/袖口/面料/手机/口红/彩妆"均不受豁免——副作用范围极窄、可控。

**副作用与风险**：
- 子目信号词表未来若新增与真异行业词重叠的词，该词会被豁免（需后续维护时留意）——当前配置无误。
- 需要把现有"subCategoryMatch → 完全跳过"分支改为"父包基准 + 窄豁免"分支（点改动，仍可回退），属**业务实施**，本轮不执行。

## 五、Commit 记录核实与占位回填
| commit | 核实结果 |
|---|---|
| `6cde039` | 存在：test(detail-v2) P1-6 验收矩阵修正，仅 chain-check.mjs |
| `2ad6951` | 存在：feat(detail-v2) P1-6 跨行业冲突保护业务实施 |
| `73c42b3` | 存在：docs(status) P1-6 状态同步；当前 HEAD=73c42b3 |
实施报告 `JY-Canvas-P1-6-污染拦截-最小范围实施报告-2026-11-20.md` 第八节原"状态同步 commit：（提交后回填）"已据实回填为 `73c42b3` 并注明核实时间与三 commit 记录——**本轮唯一文档改动，按顾问明确授权**，未留占位描述。

## 六、证据边界与停止点
- 全部结论来自只读源码 + 内存探针（`node -e`，无项目文件写入）；未抓真实 `/api/images` 请求体、未做真实模型质量测试。
- **未改业务代码/测试/门禁/行业包/Skill/状态文档**（除授权的实施报告占位回填），未提交 commit，未改变现有实施结果。
- **停止**：等顾问裁决是否授权第四节最小治理实施；未自行修复、未宣布 P1-6 关闭、未启动 P2。
