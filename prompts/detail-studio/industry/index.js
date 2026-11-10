// prompts/detail-studio/industry/index.js
//
// 行业策略包加载与覆盖机制（阶段 3B B5，设计真相源：阶段3A设计报告 §3.2.3）。
//
// 机制：
//  - 只读复用旧底座 prompts/server/detail-skills.js 的 INDUSTRY_SKILLS（含 name/keywords/
//    analyzeAttributes/sellingAngles/recommendedScreens/visualAnchors/taboos/qcRules），不修改它。
//  - 新策略包（generic/apparel/cleaning）只覆盖「决策逻辑 / 内容规划 / 视觉表达 / 事实边界」
//    四字段，不覆盖 BASE_SKILL 事实锁与平台规则。
//  - cleaning 为新增行业，旧底座无对应项，故 cleaning.js 自包含全部字段。
//  - 三条冲突消解规则：
//      ① 显式 industryId 优先（跳过文本打分）。
//      ② 同分专属词优先（tie-break：matchedLen 降序 → conflictPriority 降序 → id）。
//      ③ 新包不复用 home 泛词（cleaning 关键词只用专属词，不含 bare「清洁」）。
//
// generic 为兜底：文本零命中时回退。

import { INDUSTRY_SKILLS } from "../../../server/detail-skills.js";
import { generic } from "./generic.js";
import { apparel } from "./apparel.js";
import { cleaning } from "./cleaning.js";

// 覆盖层：id → 四字段覆盖包。cleaning 在旧底座中不存在，单独处理。
const STRATEGY_OVERRIDES = { generic, apparel };
const NEW_STRATEGIES = { cleaning };

/** 合并旧底座结构与四字段覆盖层；新行业（cleaning）直接采用自包含包。 */
function buildMergedStrategies() {
  const merged = {};
  for (const base of Object.values(INDUSTRY_SKILLS)) {
    const override = STRATEGY_OVERRIDES[base.id];
    merged[base.id] = override ? { ...base, ...override } : { ...base };
  }
  for (const [id, strategy] of Object.entries(NEW_STRATEGIES)) {
    merged[id] = { ...strategy };
  }
  return merged;
}

const MERGED = buildMergedStrategies();

/**
 * 行业策略解析：显式 industryId 优先，否则按文本关键词打分 + 同分 tie-break。
 * @param {string} text 商品描述文本（含产品资料字段 JSON 串、自定义要求等）。
 * @param {string} [explicitIndustryId] 显式行业 id（规则①）。
 * @returns {{ id: string, strategy: Object, explicit: boolean }}
 */
export function getIndustryStrategy(text = "", explicitIndustryId = "") {
  const explicit = String(explicitIndustryId || "").trim();
  if (explicit && MERGED[explicit]) {
    return { id: explicit, strategy: MERGED[explicit], explicit: true };
  }

  const source = String(text || "");
  const candidates = Object.values(MERGED).filter((s) => s.id !== "generic");
  const scored = candidates.map((skill) => {
    const hits = (skill.keywords || []).filter((k) => source.includes(k));
    return {
      skill,
      hits,
      score: hits.length,
      matchedLen: hits.reduce((sum, k) => sum + k.length, 0)
    };
  });

  const maxScore = scored.reduce((m, x) => Math.max(m, x.score), 0);
  if (maxScore === 0) {
    return { id: "generic", strategy: MERGED.generic, explicit: false };
  }

  const top = scored.filter((x) => x.score === maxScore);
  if (top.length === 1) {
    return { id: top[0].skill.id, strategy: top[0].skill, explicit: false };
  }

  // 规则②：同分专属词优先 —— 命中关键词更长（更专属）者优先，再比 conflictPriority，再比 id 稳定序。
  top.sort((a, b) => {
    if (b.matchedLen !== a.matchedLen) return b.matchedLen - a.matchedLen;
    const pa = Number(a.skill.conflictPriority || 0);
    const pb = Number(b.skill.conflictPriority || 0);
    if (pb !== pa) return pb - pa;
    return String(a.skill.id).localeCompare(String(b.skill.id));
  });
  return { id: top[0].skill.id, strategy: top[0].skill, explicit: false };
}

export { MERGED as INDUSTRY_STRATEGIES };
