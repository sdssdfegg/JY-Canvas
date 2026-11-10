// scripts/verify/industry-strategy-match-check.mjs
//
// V202（2026-11-10）阶段 3B B5 行业策略包门禁：
//  - 断言 cleaning 文本命中 cleaning 而非 home（三条冲突消解规则生效）。
//  - 断言 apparel / generic 命中预期包。
//  - 断言显式 industryId 优先（规则①）。
//  - 断言同分专属词 tie-break（规则②）。
//  - 断言三包均带齐四字段（决策逻辑/内容规划/视觉表达/事实边界）。
//  - 断言覆盖层不覆盖 BASE 结构性字段（name/analyzeAttributes/taboos 仍保留）。
// 纯逻辑、零模型、零上游，进提交钩子快速子集（--fast）。

import { getIndustryStrategy } from "../../prompts/detail-studio/industry/index.js";

let failures = 0;
function assert(cond, message) {
  if (cond) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log("[industry-strategy-match] 行业策略包加载与冲突消解断言");

// 规则③ + 主测试：清洁日化不得误判为 home（旧 getIndustrySkillByText 的缺陷）
const cleaningText = "清洁日化 洗衣液 除菌 去污 衣物护理";
const cleaningRes = getIndustryStrategy(cleaningText);
assert(cleaningRes.id === "cleaning", `清洁日化文本命中 cleaning（实得 ${cleaningRes.id}）`);
assert(cleaningRes.id !== "home", "清洁日化文本未误判为 home");

// 服装命中 apparel
const apparelText = "女士连衣裙 面料 版型 穿搭 模特";
const apparelRes = getIndustryStrategy(apparelText);
assert(apparelRes.id === "apparel", `服装文本命中 apparel（实得 ${apparelRes.id}）`);

// 无命中回退 generic
const genericRes = getIndustryStrategy("某未知商品 xyz 没有行业词");
assert(genericRes.id === "generic", `零命中回退 generic（实得 ${genericRes.id}）`);

// 规则①：显式 industryId 优先（即便文本像 cleaning 也按显式）
const explicitHome = getIndustryStrategy(cleaningText, "home");
assert(explicitHome.id === "home" && explicitHome.explicit === true, "显式 industryId=home 优先（规则①）");
const explicitCleaning = getIndustryStrategy("家居收纳 抹布", "cleaning");
assert(explicitCleaning.id === "cleaning" && explicitCleaning.explicit === true, "显式 industryId=cleaning 优先（规则①）");

// 规则②：同分专属词 tie-break（"家用清洁喷雾除菌" 同时含 home 的「清洁」与 cleaning 的「除菌」，cleaning 更专属应胜）
const tieText = "家用清洁喷雾 除菌";
const tieRes = getIndustryStrategy(tieText);
assert(tieRes.id === "cleaning", `同分专属词 tie-break 取 cleaning（实得 ${tieRes.id}）`);

// 四字段齐备断言（三包）
for (const id of ["generic", "apparel", "cleaning"]) {
  const s = getIndustryStrategy("", id).strategy; // 显式取包
  assert(typeof s.decisionLogic === "string" && s.decisionLogic.length > 0, `[${id}] 含 decisionLogic`);
  assert(Array.isArray(s.contentPlan) && s.contentPlan.length > 0, `[${id}] 含 contentPlan[]`);
  assert(Array.isArray(s.visualExpression) && s.visualExpression.length > 0, `[${id}] 含 visualExpression[]`);
  assert(Array.isArray(s.productFacts) && s.productFacts.length > 0, `[${id}] 含 productFacts[]`);
  assert(Array.isArray(s.promoBoundaries) && s.promoBoundaries.length > 0, `[${id}] 含 promoBoundaries[]`);
}

// 不覆盖 BASE / 平台规则：合并后仍保留旧底座的 name/analyzeAttributes/taboos（结构性字段）
const apparelMerged = getIndustryStrategy("", "apparel").strategy;
assert(typeof apparelMerged.name === "string" && apparelMerged.name.length > 0, "[apparel] 合并后保留 name（未覆盖 BASE）");
assert(Array.isArray(apparelMerged.analyzeAttributes) && apparelMerged.analyzeAttributes.length > 0, "[apparel] 合并后保留 analyzeAttributes（未覆盖 BASE）");
assert(Array.isArray(apparelMerged.taboos) && apparelMerged.taboos.length > 0, "[apparel] 合并后保留 taboos（未覆盖 BASE）");

if (failures > 0) {
  console.error(`\n[industry-strategy-match] 失败 ${failures} 项`);
  process.exit(1);
}
console.log("\n[industry-strategy-match] 全部通过");
process.exit(0);
