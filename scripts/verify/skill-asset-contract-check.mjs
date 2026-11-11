// scripts/verify/skill-asset-contract-check.mjs
//
// V205（2026-11-11）阶段 3C 资产契约门禁：断言「专业能力内容层」资产齐备且非空。
//  - 每个行业策略包（generic/apparel/beauty/home/food/electronics/cleaning）四字段齐全。
//  - 案例库每行业 ≥1 正例 + ≥1 反例。
//  - 禁词表（绝对化 / 医疗化）非空。
//  - 平台规则包导出 resolvePlatformProfile + PLATFORM_PROFILES 且含 11 个平台。
//  - 参考图三角色齐全（product/visualStyle/contentStructure）且各含 constrains/mustNotConstrain/forbiddenCrossovers。
// 纯逻辑、零模型、零上游，进提交钩子快速子集（--fast）。无基线棘轮（纯静态断言，与 mode-c-purity-check 同族）。
//
// 负向对照：用「已知干净文案」断言 scanForbiddenWords 返回空（防词表被清空变假绿），
// 用「已知命中文案」断言真能扫出禁词（防扫描器失效），每个切片比较均带 >=0 守卫。

import { getIndustryStrategy, INDUSTRY_STRATEGIES } from "../../prompts/detail-studio/industry/index.js";
import { resolvePlatformProfile, PLATFORM_PROFILES, PLATFORM_PROFILE_KEYS } from "../../prompts/detail-studio/platform/index.js";
import { REFERENCE_IMAGE_ROLES, ROLE_WHITELIST } from "../../prompts/detail-studio/references/reference-image-roles.js";
import { CASE_LIBRARY, caseLibraryCoverage } from "../../prompts/detail-studio/references/case-library.js";
import { scanForbiddenWords, FORBIDDEN_ABSOLUTE_WORDS, FORBIDDEN_MEDICAL_CLAIM_WORDS } from "../../prompts/detail-studio/references/copywriting.js";

let failures = 0;
function assert(cond, message) {
  if (cond) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

console.log("[skill-asset-contract] 专业能力内容层资产契约断言");

// —— 行业策略包四字段齐备 ——
const INDUSTRY_IDS = ["generic", "apparel", "beauty", "home", "food", "electronics", "cleaning"];
for (const id of INDUSTRY_IDS) {
  const s = INDUSTRY_STRATEGIES[id];
  assert(s && typeof s === "object", `[${id}] 已注册到 INDUSTRY_STRATEGIES`);
  if (!s) continue;
  assert(typeof s.decisionLogic === "string" && s.decisionLogic.length > 0, `[${id}] decisionLogic 非空`);
  assert(Array.isArray(s.contentPlan) && s.contentPlan.length > 0, `[${id}] contentPlan[] 非空`);
  assert(Array.isArray(s.visualExpression) && s.visualExpression.length > 0, `[${id}] visualExpression[] 非空`);
  assert(Array.isArray(s.productFacts) && s.productFacts.length > 0, `[${id}] productFacts[] 非空`);
  assert(Array.isArray(s.promoBoundaries) && s.promoBoundaries.length > 0, `[${id}] promoBoundaries[] 非空`);
  // 每条四字段必须「体现不同决策逻辑」，不得为空壳（长度下限守卫，防占位假绿）
  assert(s.decisionLogic.length >= 12, `[${id}] decisionLogic 有实质内容（≥12 字）`);
}

// —— 案例库覆盖 ——
const coverage = caseLibraryCoverage();
for (const id of INDUSTRY_IDS) {
  const c = coverage[id] || { good: 0, bad: 0 };
  assert(c.good >= 1, `[${id}] 案例库 ≥1 正例`);
  assert(c.bad >= 1, `[${id}] 案例库 ≥1 反例`);
}
assert(Object.keys(CASE_LIBRARY).length >= INDUSTRY_IDS.length, `案例库覆盖行业数 ≥ ${INDUSTRY_IDS.length}`);

// —— 禁词表非空（负向对照：干净文案必须返回空）——
assert(Array.isArray(FORBIDDEN_ABSOLUTE_WORDS) && FORBIDDEN_ABSOLUTE_WORDS.length > 0, "禁绝对化词表非空");
assert(Array.isArray(FORBIDDEN_MEDICAL_CLAIM_WORDS) && FORBIDDEN_MEDICAL_CLAIM_WORDS.length > 0, "禁医疗化词表非空");
const cleanHit = scanForbiddenWords("放在桌边的安静加湿，早晚护肤步骤");
assert(
  Array.isArray(cleanHit.absolute) && cleanHit.absolute.length === 0 &&
  Array.isArray(cleanHit.medical) && cleanHit.medical.length === 0,
  "负向对照：干净文案不误命中禁词（防词表失效变假绿）"
);
const dirtyHit = scanForbiddenWords("全网最好 治疗级 100%");
assert(
  (dirtyHit.absolute && dirtyHit.absolute.length >= 1) && (dirtyHit.medical && dirtyHit.medical.length >= 1),
  "正控制：含绝对化+医疗化词真能扫出（防扫描器失效）"
);

// —— 平台规则包 ——
assert(typeof resolvePlatformProfile === "function", "platform 导出 resolvePlatformProfile");
assert(PLATFORM_PROFILES && typeof PLATFORM_PROFILES === "object", "platform 导出 PLATFORM_PROFILES");
assert(PLATFORM_PROFILE_KEYS.length === 11, `platform 含 11 个平台规则（实得 ${PLATFORM_PROFILE_KEYS.length}）`);
assert(resolvePlatformProfile("amazon-foo").id === "amazon-detail", "resolvePlatformProfile(amazon*)→amazon-detail");
assert(resolvePlatformProfile("x-main-y").id === "taobao-main", "resolvePlatformProfile(*main*)→taobao-main");
assert(resolvePlatformProfile("").id === "taobao-detail", "resolvePlatformProfile(空)→taobao-detail 兜底");
// 平台规则不覆盖事实锁：PLATFORM_PROFILES 不含 fact 分级字段
assert(!("FACT_GRADE" in PLATFORM_PROFILES), "平台规则包不含事实分级字段（不覆盖 BASE_SKILL 事实锁）");

// —— 参考图三角色 ——
const ROLES = ["product", "visualStyle", "contentStructure"];
for (const r of ROLES) {
  const role = REFERENCE_IMAGE_ROLES[r];
  assert(role && typeof role === "object", `参考图角色 ${r} 存在`);
  if (!role) continue;
  assert(Array.isArray(role.constrains) && role.constrains.length > 0, `[${r}] constrains 非空`);
  assert(Array.isArray(role.mustNotConstrain) && role.mustNotConstrain.length > 0, `[${r}] mustNotConstrain 非空`);
  assert(Array.isArray(role.forbiddenCrossovers) && role.forbiddenCrossovers.length > 0, `[${r}] forbiddenCrossovers 非空`);
}
assert(ROLE_WHITELIST.includes("product") && ROLE_WHITELIST.includes("visualStyle") && ROLE_WHITELIST.includes("contentStructure"), "角色白名单含三角色（与 server 同口径）");

if (failures > 0) {
  console.error(`\n[skill-asset-contract] 失败 ${failures} 项`);
  process.exit(1);
}
console.log("\n[skill-asset-contract] 全部通过");
process.exit(0);
