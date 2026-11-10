// prompts/detail-studio/industry/generic.js
//
// 行业策略包：通用电商（兜底）。
// 只覆盖「决策逻辑 / 内容规划 / 视觉表达 / 事实边界」四字段；
// 结构性字段（name/keywords/analyzeAttributes/taboos 等）由旧 INDUSTRY_SKILLS.generic 底座提供，
// 经 industry/index.js 合并后生效。本文件是「覆盖层」，只写四字段 + id/name 锚点。
//
// 设计真相源：V4.0-详情创作工作区-阶段3A设计报告.md §3.2.3（覆盖语义 + generic 兜底）。

export const generic = {
  id: "generic",
  name: "通用电商",
  // —— 四字段覆盖（决策逻辑 / 内容规划 / 视觉表达 / 事实边界）——
  decisionLogic: "以真实商品事实驱动，避免过度承诺；先确认商品身份与核心卖点，再组织叙事与转化。",
  contentPlan: ["首屏主视觉", "核心卖点", "材质细节", "使用场景", "参数说明", "信任背书", "收尾转化"],
  visualExpression: ["主体清晰", "光线统一", "版式稳定", "细节真实", "背景干净"],
  productFacts: ["商品外观", "核心卖点", "材质", "规格", "适用场景"],
  promoBoundaries: ["不虚构未提供的参数/认证/功效", "不改变商品结构", "不混入参考图里的其它商品"]
};
