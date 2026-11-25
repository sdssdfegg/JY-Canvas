# JY-Canvas P1-6 · laundryStain 漏拦截最小治理 — 补交报告正文

> 日期：2026-11-21　HEAD：`c14187d`（未变）　性质：按顾问要求补交完整报告正文，**未修改任何代码/测试/门禁/状态文档，未提交 commit**。工作区无已跟踪改动。
> 🔴 P1-6 未关闭，P2 未授权，停止等待审查。文中"缺口"如实标注，未自行补测试。

---

## 1. `filterSubCategorySignalsByRange` 实际实现代码及调用位置

**定义位置**：`server/detail-middleware.js:428`（模块级纯函数，`resolveIndustrySkill` 之前）。实际代码：
```js
// P1-6 laundryStain 子类目污染漏拦截治理：基于"具体命中词及文本范围"排除子类目自身信号。
// 不能以词包含关系全局豁免（例如"领口"⊂"领口去渍"就豁免全文所有"领口"）——只在某次命中
// 完全落于子类目信号短语占据的文本区间内时才排除；独立出现的同名词仍算真实他行业信号。
// 返回清洗后的 risks（保留行业归属与其余真实信号），不修改任何配置/词表/文本。
function filterSubCategorySignalsByRange(text, risks, parentPackId, subCategoryMatch) {
  if (!subCategoryMatch || !parentPackId) return risks;
  const cfg = activeConfig();
  const subPack = cfg?.industryPacks?.[parentPackId]?.subCategories
    ?.find((s) => (s.id || s.industryId) === (subCategoryMatch.subCategoryId || subCategoryMatch.subCategoryName));
  const subSignals = Array.isArray(subPack?.positiveSignals) ? subPack.positiveSignals : [];
  if (subSignals.length === 0) return risks;
  // 子类目信号短语在文本中占据的所有区间（精确位置，非全局词）。
  const ranges = [];
  for (const s of subSignals) {
    const sig = String(s || "");
    if (!sig) continue;
    let i = 0;
    while ((i = text.indexOf(sig, i)) >= 0) { ranges.push([i, i + sig.length]); i += 1; }
  }
  const withinSubRange = (pos, len) => ranges.some(([a, b]) => pos >= a && pos + len <= b);
  return risks.map((r) => ({
    ...r,
    signals: (r.signals || []).filter((w) => {
      const word = String(w || "");
      if (!word) return false;
      // 该词只要有一次命中落在子类目区间之外，即为独立真实信号，保留。
      let i = 0;
      while ((i = text.indexOf(word, i)) >= 0) {
        if (!withinSubRange(i, word.length)) return true;
        i += 1;
      }
      return false;
    })
  })).filter((r) => r.signals.length > 0);
}
```

**调用位置**：`server/detail-middleware.js:498`，在 `resolveIndustrySkill` 的冲突保护块：
```js
const conflictBaselineId = subCategoryMatch ? (parentPackId || resolution.industryId) : resolution.industryId;
const rawAudit = (resolution.confidence === "high" && conflictBaselineId && conflictBaselineId !== "generic")
  ? checkIndustryPollution(text, conflictBaselineId) : null;
const cleanedRisks = subCategoryMatch && rawAudit
  ? filterSubCategorySignalsByRange(text, rawAudit.risks || [], conflictBaselineId, subCategoryMatch) : (rawAudit?.risks || []);
const conflictAudit = rawAudit ? { ...rawAudit, risks: cleanedRisks, hasPollution: cleanedRisks.length > 0 } : null;
const conflictProtected = Boolean(conflictAudit?.hasPollution);
```
命中后走现有 `cross_industry_conflict` 收敛（`industryId=generic, packId=null, confidence=medium`，清 `subCategoryMatch/preResolvedInherited`）。该 diff 在 commit `dc4af4e` 的两个 hunk：`@@ -421,6 +421,42`（新增函数）、`@@ -452,11 +488,15`（调用块）。

## 2. 区间边界定义、重叠/重复短语、同词内外同时出现

| 项 | 实现语义 | 说明 |
|---|---|---|
| 区间边界 | `[i, i+sig.length)`；`withinSubRange(pos,len) = ranges.some(([a,b]) => pos>=a && pos+len<=b)` | **完全包含**才算区间内；部分重叠不算（保守保留为独立信号） |
| 重叠区间 | `ranges.some(...)` 任一区间包含即可 | 子目短语区间可能重叠（如"衣领净"与"领口去渍"），some 语义正确，无特殊分支 |
| 重复短语 | `while ((i=text.indexOf(sig,i))>=0) { ranges.push(...); i+=1 }` | 逐个位置收集**所有**出现区间；`i+=1` 允许重叠短语自身 |
| 同词区间内外同时出现 | 遍历污染词所有出现，**只要有一次 `!withinSubRange` 即 `return true` 保留** | 独立出现的同名词不会被区间内的另一次命中掩盖；符合"不得全局删词" |

**只读实测**（同词内外同时，未写入测试）：
- 纯区间内"衣物去渍领口去渍，成分：表活。" → `laundryStain/high/subcategory_signal_match`（不触发）✅
- 纯区间外"衣物去渍清洗剂领口设计修身，成分：表活。" → `generic/medium/cross_industry_conflict`（触发）✅
- **同一输入内外同时**"衣物去渍领口去渍，领口设计修身，成分：表活。" → `generic/medium/cross_industry_conflict`（区间外独立"领口"使词被保留）✅

> **缺口 1**：上述"同词内外同时出现"只在只读探针验证，**CP10-16 中没有对应正式断言**（CP13 仅分别测纯区间内与纯区间外两个独立用例）。按顾问指示不自行补测试，报告缺口等授权。

## 3. 精确排除的正反例测试（CP10-16 覆盖情况）
| 场景 | 覆盖 | 断言/实测 |
|---|---|---|
| 区间内命中排除 | CP13 前半（"领口去渍"内"领口"） | laundryStain/high，不触发 ✅ |
| 区间外独立命中保留 | CP13 后半（"领口设计修身"独立"领口"） | generic/medium/cross_industry_conflict ✅ |
| 同词内外同时出现 | **未进 CP 断言（缺口 1）** | 仅只读探针验证：generic/medium ✅ |
| 版型/袖口/手机/口红不受错误豁免 | CP15 | 三类输入均 generic/medium ✅ |
| 弱语境豁免保持 | CP16（直接断言 checkIndustryPollution 纯函数） | 棉/面料在 cleaning weak 表、检测 false ✅ |

## 4. S1/S2/S2b/S3/S4 最终运行时断言（完整字段）
| 字段 | S1 正常 | S2 +apparel | S2b +electronics | S3 子目领口 | S4 父包 |
|---|---|---|---|---|---|
| 输入(pn/pf) | 衣物去渍护理剂 / 衣物去渍衣领净领口去渍，成分：表活。 | 衣物去渍衣领净领口去渍版型修身袖口精致 / 成分：表活。 | 衣物去渍衣领净手机快充 / 成分：表活。 | 衣物去渍领口去渍 / 成分：表活。 | 清洗剂去渍重油污 / 成分：表活。 |
| **industryId** | laundryStain | generic | generic | laundryStain | cleaning |
| **packId** | laundryStain | **null** | **null** | laundryStain | cleaning |
| **confidence** | high | medium | medium | high | high |
| **decisionPath** | subcategory_signal_match | cross_industry_conflict | cross_industry_conflict | subcategory_signal_match | pack_strong_override |
| ruleSource | industrySubCategory | generic | generic | industrySubCategory | industryPack |
| **subCategoryMatch** | `{subCategoryId:laundryStain,parentPackId:cleaning,tie:false,inheritedFrom:[cleaning]}` | null | null | 同 S1 | null |
| **preResolvedInherited** | `{packId:laundryStain, effectivePack:{…}, inheritedFrom:[cleaning], isSubCategory:true, parentPackId:cleaning, cycleDetected:false, resolved:true}` | null | null | 同 S1 | null |
| ruleLoadDecision.level | full_pack_rules | generic_rules | generic_rules | full_pack_rules | full_pack_rules |
| analyzeAttributes | 清洁对象/处理问题/使用方式/…（专属） | 商品主体/已确认事实/使用方式（通用） | 同 S2（通用） | 专属（同 S1） | 专属（同 S1） |
| coverage / outputReq applied | true / true | false / false | false / false | true / true | true / true |
| evidence | positive=[衣物去渍,衣领净,领口去渍] via cleaning.subCategories | via=p1_6_cross_industry_conflict, pollutingIndustries=[apparel] | …pollutingIndustries=[electronics] | positive=[衣物去渍,领口去渍] via 子目 | positive=[清洗剂,去渍,重油污] via cleaning.positiveSignals |
| 专属规则词进 text | false | false | false | false | false |
| **下游消费者** | checkSellingPointBoundary 用 laundryStain；inferAudience 非专属分支 | 用 generic（0 专属泛化词）；非专属分支 | 同 S2 | 同 S1 | 用 cleaning（18 泛化词） |

> **准确性更正**：收敛后 `packId` 的实际值是 **`null`**（`industryId=generic`），此前报告写"packId=generic"是简写不准；本表据实测更正。任务书第四节"packId=generic"应理解为"无行业包专属"，实际字段值为 null。

## 5. CP10–CP16 完整断言内容

**辅助**：`cpSub(pn,pf)=buildDetailPromptGroup({count:4,countMode:"fixed",workflow:"taobao-detail",productName:pn,productFeature:pf,userInstruction:""},[],{})`；`cpIndustry(g)=g.skillLayers?.industry`。

```js
push("CP10 S1正常laundryStain保留子类目", (() => {
  const s = cpIndustry(cpSub("衣物去渍护理剂", "衣物去渍衣领净领口去渍，成分：表活。"));
  return s && s.id === "laundryStain" && s.resolution?.confidence === "high" && s.resolution?.decisionPath === "subcategory_signal_match"
    && Boolean(s.subCategoryMatch) && s.ruleLoadDecision?.level === "full_pack_rules";
})());
```
```js
push("CP11 S2 laundryStain+apparel真信号收敛generic", (() => {
  const s = cpIndustry(cpSub("衣物去渍衣领净领口去渍版型修身袖口精致", "成分：表活。"));
  return s && s.id === "generic" && s.resolution?.confidence === "medium" && s.resolution?.decisionPath === "cross_industry_conflict"
    && !s.subCategoryMatch && Array.isArray(s.analyzeAttributes) && !/版型轮廓|袖口\/领口/.test(JSON.stringify(s.analyzeAttributes));
})());
```
```js
push("CP12 S2b laundryStain+electronics收敛generic", (() => {
  const s = cpIndustry(cpSub("衣物去渍衣领净手机快充", "成分：表活。"));
  return s && s.id === "generic" && s.resolution?.confidence === "medium" && s.resolution?.decisionPath === "cross_industry_conflict";
})());
```
```js
push("CP13 S3子目自身领口不误报+独立领口仍触发", (() => {
  const inSub = cpIndustry(cpSub("衣物去渍领口去渍", "成分：表活。"));
  const independent = cpIndustry(cpSub("衣物去渍清洗剂领口设计修身", "成分：表活。"));
  return inSub && inSub.id === "laundryStain" && inSub.resolution?.confidence === "high"
    && independent && independent.id === "generic" && independent.resolution?.confidence === "medium"
    && independent.resolution?.decisionPath === "cross_industry_conflict";
})());
```
```js
push("CP14 S4父包cleaning信号正常行为", (() => {
  const s = cpIndustry(cpSub("清洗剂去渍重油污", "成分：表活。"));
  return s && s.id === "cleaning" && s.resolution?.confidence === "high" && s.resolution?.decisionPath === "pack_strong_override";
})());
```
```js
push("CP15 独立强信号版型/袖口/手机/口红不受错误豁免", (() => {
  return ["衣物去渍版型修身袖口 成分：表活。", "衣物去渍手机快充 成分：表活。", "衣物去渍口红彩妆 成分：表活。"].every((pf) => {
    const s = cpIndustry(cpSub("衣物去渍产品", pf));
    return s && s.id === "generic" && s.resolution?.confidence === "medium";
  });
})());
```
```js
push("CP16 弱语境豁免保持(cleaning弱词棉/面料不判污染)", (() => {
  const t = "棉质面料清洁喷雾去渍";
  const cleanWeak = agCfg.industryPacks.cleaning.weakContextWordsMustNotOverride || [];
  return cleanWeak.includes("棉") && cleanWeak.includes("面料")
    && uniMod.checkIndustryPollution(t, "cleaning", agCfg).hasPollution === false;
})());
```
> CP16 直接断言纯函数而非走子目识别，是因为"棉质面料衣物去渍"经 P1-3 `resolveSubCategory` 会得 generic/high（既有置信度行为，非治理引入），与弱语境豁免无关——避免断言混入非 P1-6 范围。

## 6. 本轮业务 diff、测试 diff、commit 对应，HEAD 与工作区

| commit | 类型 | 内容 | diff 对应 |
|---|---|---|---|
| `6cde039` | test-only | AG 矩阵修正（AG9/11 负向、AG10b、AG14-18） | 仅 `chain-check.mjs` AG 组 `@@ -911,10 +911,67` |
| `2ad6951` | 业务 | P1-6 基础冲突保护 + CP1-9 | `detail-middleware.js` + `chain-check.mjs` CP 组 + 实施报告 |
| `73c42b3` | 状态同步 | P1-6 基础实施状态 | 3 处状态文档 |
| **`dc4af4e`** | **本轮业务** | **laundryStain 漏拦截治理** | 3 文件 +155/-4：`detail-middleware.js` `@@ -421,6 +421,42`(函数)、`@@ -452,11 +488,15`(调用块)；`chain-check.mjs` `@@ -1451,6 +1451,51`(CP10-16)；本轮实施报告 |
| `81d116a` | 状态同步 | 本轮状态 + 上轮 commit 占位回填 | 5 文件 +7/-3 |
| `c14187d` | 文档回填 | 本轮报告 commit 占位回填 | 1 文件 +1/-1 |

**HEAD**：`c14187dfa37ca8f3d4522b5202ecd94039a918bd`（`c14187d`）。
**工作区**：`git status --short | grep -v '^??'` → 无已跟踪改动；未跟踪文件为历次只读取证/核验报告（未提交、未改动）。**本轮未产生新 commit。**

## 7. 完整门禁结果与未验证事项

| 门禁 | 结果 |
|---|---|
| 控制链 `detail-v2-control-chain-check.mjs`（含 CP10-16） | **553/553**（原 546 + 7） |
| planning | 76/76 |
| assets 冻结 | ok=true |
| 全量 `run-all --fast` | **86/86** |
| vite build | EXIT=0（5.72s） |
| eslint | 0 errors（8 warnings，其中 middleware 2 条存量，无新增） |
| node --check | 通过 |
| P1-1 tie（AM7/AN5）/ P1-3 子类目（AO1/AO4） | 未回归（断言未改、全绿） |
| P1-6 既有 AG/CP 非子目场景 | 未回归（AG9-18、CP1-9 全过） |

**未验证事项 / 缺口**：
1. **缺口 1**：同词区间内外同时出现的正式 CP 断言缺失（仅只读探针验证通过）——需顾问授权才补。
2. 未抓真实 `/api/images` HTTP 请求体、未调真实模型、未做真实模型质量测试——探针结果为工程验证，不表述为质量验证。
3. `targetAudience` 服装文本正则分支、`triggerCtxKeys` 键空间错配按裁定未修（既有缺陷，非本轮范围）。
4. 其他行业子类目（当前配置仅 laundryStain 一个子目）未纳入治理——本轮范围限定 laundryStain。

**停止点**：保持 HEAD `c14187d`，P1-6 未关闭，P2 未授权；等待顾问审查，不自行修复缺口、不扩大范围。
