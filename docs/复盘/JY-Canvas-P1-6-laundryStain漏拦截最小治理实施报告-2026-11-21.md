# JY-Canvas P1-6 · laundryStain 子类目污染漏拦截最小治理实施报告

> 日期：2026-11-21　基线：HEAD `73c42b3`　依据：补充核验报告第四节。性质：批准实施的最小治理。
> 🔴 边界：只修 laundryStain 命中时漏拦截；不改 P1-1 评分/tie/override/优先级、不改 P1-3 识别/继承/词表、不新增字段/词/弱语境、不改 P1-6 非子目场景、不修 triggerCtxKeys 错配、不启 P2。**P1-6 未经审查不得关闭。**

## 一、实际修改文件、函数、位置
| 文件 | 位置 | 修改 | 解决 |
|---|---|---|---|
| `server/detail-middleware.js` | 模块级，`resolveIndustrySkill` 前 | 新增纯函数 `filterSubCategorySignalsByRange(text, risks, parentPackId, subCategoryMatch)` | 基于**具体命中词及文本范围**排除子目自身信号（不全词包含、不全局豁免） |
| `server/detail-middleware.js` | `resolveIndustrySkill` 冲突保护块 | 子目场景基准改为父包 id；rawAudit.risks 经范围过滤得 cleanedRisks；hasPollution 据 cleanedRisks 重算 | 修复"子目命中→完全跳过"漏拦截 |
| `scripts/verify/detail-v2-control-chain-check.mjs` | CP2 组 | 新增 CP10-CP16（S1-S4 + 精确排除正反例） | 验证治理效果 |

## 二、修改前后调用时序
**修改前**：识别 → 子目命中 → `subCategoryMatch ? 跳过冲突保护 : checkIndustryPollution` → 子目场景永远不收敛 generic。
**修改后**：识别 → 子目命中 → **冲突保护（子目用父包 cleaning 为基准）→ checkIndustryPollution → filterSubCategorySignalsByRange（文本范围排除子目自身信号）→ 对 cleanedRisks 判 hasPollution** → 真冲突走现有 `cross_industry_conflict` 收敛 generic/medium、清子目证据；无真冲突保留 laundryStain 及专属规则。审计点 :927、规则加载链未改。

## 三、子类目自身信号排除机制（关键，符合"不得全局删词"约束）
1. 计算子类目信号短语（衣物去渍/衣领净/领口去渍）在文本中占据的**精确位置区间**（`text.indexOf` 逐个）。
2. 对每个他行业命中词（如 apparel"领口"）的每次出现，检查其位置是否**完全落在某个子目区间内**：
   - 落在区间内 → 属子目自身短语的一部分，排除；
   - **只要有一次命中落在区间外 → 作为独立真实信号保留**。
3. 父包信号（cleaning"去渍"）因以父包为基准被 ownPositives 自动豁免。
4. 例："领口去渍"中的"领口"被排除；"领口设计修身"中独立"领口"仍触发 apparel 冲突。仅基于配置词表与实际位置，不新增词/字段、不改弱语境。

## 四、S1-S4 逐项实际运行结果
| 用例 | 输入 | 预期 | 实际 | 断言 |
|---|---|---|---|---|
| S1 正常 | "衣物去渍护理剂"+"衣物去渍衣领净领口去渍，成分：表活。" | 保留 laundryStain 与继承 | laundryStain/high/subcategory_signal_match/full_pack_rules | CP10 ✅ |
| S2 +apparel | "…版型修身袖口精致" | 检出 apparel 冲突收敛 generic | generic/medium/cross_industry_conflict、子目证据清空 | CP11 ✅ |
| S2b +electronics | "衣物去渍衣领净手机快充" | 检出 electronics 冲突收敛 generic | generic/medium/cross_industry_conflict | CP12 ✅ |
| S3 子目自身领口 | "衣物去渍领口去渍" | 不误报、保留子目 | laundryStain/high | CP13 前半 ✅ |
| S4 父包信号 | "清洗剂去渍重油污" | cleaning 正常识别 | cleaning/high/pack_strong_override | CP14 ✅ |

## 五、精确排除保护正反例
| 断言 | 验证内容 | 结果 |
|---|---|---|
| CP13 后半 | **独立"领口"**（"衣物去渍清洗剂领口设计修身"）仍触发 apparel 冲突 → generic/medium | ✅ 未被全局豁免 |
| CP15 | 独立版型/袖口/手机/口红彩妆强信号均触发收敛 generic | ✅ 不受错误豁免 |
| CP16 | cleaning 弱语境词"棉/面料"由 weakContextWordsMustNotOverride 排除、checkIndustryPollution=false | ✅ 弱语境豁免保持原行为 |
| 负向探针 | 子目区间内"领口"排除、区间外"领口"保留；food/beauty 多行业信号正确检出 | ✅（见补充核验报告第四节算法验证） |

## 六、回归门禁结果
| 门禁 | 结果 |
|---|---|
| 控制链（含 CP10-16） | **553/553**（原 546 + 7） |
| 原有 P1-1 tie（AM7/AN5） | ✅ 不回归（未改判定） |
| 原有 P1-3 laundryStain（AO1/AO4 等） | ✅ 不回归（S1 保留、子目识别/继承未改） |
| 原有 P1-6 AG/CP 非子目场景 | ✅ 不回归（AG9-18、CP1-9 全过） |
| planning | 76/76 |
| assets | ok=true |
| 全量 run-all --fast | **86/86** |
| vite build | EXIT=0 |
| eslint | 0 errors（2 存量 warning，无新增） |
| node --check | 通过 |

## 七、Commit 与状态同步
- 业务实施 commit：`dc4af4e`（detail-middleware.js 范围排除治理 + CP10-16 + 本报告）。
- 状态同步 commit：（提交后回填，见下方状态同步提交）。
- 本轮仅业务 + 状态同步两个 commit；未改测试夹具以外无关文件（CP10-16 随业务提交，属本治理直接测试）。

## 八、未解决问题与证据边界
1. **已知权衡**：范围排除依赖子目信号短语在文本中的精确位置；若同形词在文本中既出现在子目短语内、又独立出现，独立出现者仍触发（已验证）——符合任务书要求。
2. **未修（明确排除）**：triggerCtxKeys 键空间错配（既有缺陷）；targetAudience 服装文本正则分支；P1-1 评分/tie/override；其他行业子类目（本轮仅 laundryStain）。
3. **证据边界**：全部为真实 buildDetailPromptGroup 运行断言 + 只读探针；未抓真实 `/api/images` 请求体、未做真实模型质量测试，不表述为质量验证。

**停止点**：提交报告后停止，等顾问审查；未宣布 P1-6 关闭、未启动 P2、未扩大治理范围。
