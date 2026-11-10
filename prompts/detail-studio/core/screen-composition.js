// prompts/detail-studio/core/screen-composition.js
//
// 单屏构图 / 信息层级原语 + 模块库接入。
//
// 复用策略：SCREEN_MODULES 是跨行业共用的「分屏模块库」，已在 prompts/server/detail-skills.js
// （禁改清单，只读复用，见执行单 §2 #8）单点定义。本模块**不重复搬运**该数据，只做：
//   1) 只读 re-export + 本地轻量模块选择器（避免耦合旧模块未导出的内部函数）；
//   2) 新增「6-3-1 信息层级」「构图要素拼装」等详情创作专属原语（旧模块没有）。
// 行业策略包（B5）只覆盖「决策逻辑/内容规划/视觉表达/事实边界」，不覆盖模块库。

import { SCREEN_MODULES } from "../../server/detail-skills.js";

/** 已解析的 SCREEN_MODULES（只读引用，跨行业共用）。 */
export const SCREEN_MODULE_LIBRARY = SCREEN_MODULES;

/**
 * 本地模块选择器：按标题命中别名 → 首屏取 hero → 末屏取 conversionClose → 否则 coreSellingPoint。
 * 与旧 getScreenModule 语义一致，但本模块自持，不依赖旧模块未导出函数。
 */
export function selectScreenModule(title, index = 0, count = 1) {
  const source = String(title || "").toLowerCase();
  const direct = Object.values(SCREEN_MODULES).find((module) => (
    (module.aliases || []).some((alias) => source.includes(String(alias).toLowerCase()))
  ));
  if (direct) return direct;
  if (index === 0) return SCREEN_MODULES.hero;
  if (count > 1 && index === count - 1) return SCREEN_MODULES.conversionClose;
  return SCREEN_MODULES.coreSellingPoint;
}

/**
 * 6-3-1 信息层级原语：一屏的视觉 / 主文案 / 次文案权重分配。
 * 用于导演批次约束「不要每屏都产品居中 + 标题在上 + 卖点在下」的单调构图。
 * @param {Object} input
 * @param {number} input.visualWeight   视觉占比（0-1），默认 0.6
 * @param {string} input.primary        主信息（标题 / 核心卖点），占比 0.3
 * @param {string} input.secondary      次信息（辅助说明 / 标签），占比 0.1
 * @returns {{ visual:number, primary:number, secondary:number, primary, secondary }}
 */
export function infoHierarchy631({ visualWeight = 0.6, primary = "", secondary = "" } = {}) {
  const visual = Math.min(0.9, Math.max(0.3, Number(visualWeight) || 0.6));
  const primaryW = Math.round((1 - visual) * 0.75 * 100) / 100;
  const secondaryW = Math.round((1 - visual - primaryW) * 100) / 100;
  return {
    visual: Math.round(visual * 100) / 100,
    primary: primaryW,
    secondary: secondaryW,
    primaryText: String(primary || ""),
    secondaryText: String(secondary || "")
  };
}

/**
 * 构图要素拼装：把模块 + 6-3-1 + 参考图职责拼成一屏的构图意图描述（确定性，供导演/编译器引用）。
 * @param {Object} input
 * @param {Object} input.module          SCREEN_MODULES 中的一项
 * @param {Object} [input.hierarchy]     infoHierarchy631 结果
 * @param {string} input.referenceNeed   参考图使用说明
 * @returns {{ moduleId, moduleName, purpose, composition, hierarchy, referenceNeed }}
 */
export function composeScreenComposition({ module, hierarchy, referenceNeed } = {}) {
  const mod = module || SCREEN_MODULES.coreSellingPoint;
  const hier = hierarchy || infoHierarchy631();
  return {
    moduleId: mod.id,
    moduleName: mod.name,
    purpose: mod.purpose,
    composition: mod.composition,
    hierarchy: hier,
    referenceNeed: String(referenceNeed || mod.referenceNeed || "")
  };
}
