// prompts/detail-studio/industry/food.js
//
// 行业策略包：食品饮品（覆盖层）。
// 结构性字段（name/keywords/analyzeAttributes/taboos 等）由旧 INDUSTRY_SKILLS.food 底座提供，
// 经 industry/index.js 合并后生效（与 apparel/generic 同范式）。本文件只写四字段 + id/name 锚点。
//
// 设计真相源：阶段3A设计报告 §3.2.3 覆盖语义 + 旧底座 food 关键词（食品/零食/饮品/茶/咖啡/饼干…）。

export const food = {
  id: "food",
  name: "食品饮品",
  // 食品饮品的消费者决策逻辑：真实食欲与口感联想，而非健康承诺。真实食材、包装清晰、保质期/产地真实
  // 是说服核心；产地/认证不得虚构、不得夸大健康疗效（旧底座 taboos 已含「不要虚构产地和认证 /
  // 不要夸大健康疗效 / 不要让食物看起来变质」）。
  decisionLogic: "真实食欲与口感联想驱动：以真实食材、新鲜观感、清晰包装建立购买欲，而非健康承诺；强调可验证的规格与产地，不虚构产地认证、不夸大健康疗效。",
  contentPlan: ["首屏食欲主视觉", "真实食材", "口感联想", "食用场景", "包装规格", "保鲜产地", "信任背书", "收尾转化"],
  visualExpression: ["自然食欲感", "包装清晰", "食材新鲜", "暖光不过黄", "干净餐桌"],
  productFacts: ["包装规格", "口味线索(visible)", "食材状态", "保质期/产地(若标)"],
  promoBoundaries: ["不虚构产地和认证", "不夸大健康疗效", "不让食物看起来变质", "不改包装品牌文字"]
};
