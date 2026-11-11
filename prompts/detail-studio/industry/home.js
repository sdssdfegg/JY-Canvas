// prompts/detail-studio/industry/home.js
//
// 行业策略包：家居百货（覆盖层）。
// 结构性字段（name/keywords/analyzeAttributes/taboos 等）由旧 INDUSTRY_SKILLS.home 底座提供，
// 经 industry/index.js 合并后生效（与 apparel/generic 同范式）。本文件只写四字段 + id/name 锚点。
//
// 重要：旧底座 home 关键词含泛词「清洁」（已由 V202 cleaning.js 用专属词 + conflictPriority 化解竞争，
// 「清洁日化」文本仍命中 cleaning 而非 home）。本覆盖层**不改关键词**，故 V202 的负向对照不回归。
//
// 设计真相源：阶段3A设计报告 §3.2.3 覆盖语义 + 旧底座 home 关键词（家居/收纳/床品/杯/灯/厨房…）。

export const home = {
  id: "home",
  name: "家居百货",
  // 家居百货的消费者决策逻辑：空间适配与材质耐用，而非颜值冲动。尺寸比例可信、结构可用、使用动作自然
  // 是说服核心；承重/安全能力不得夸大（旧底座 taboos 已含「不要夸大承重和安全能力」）。
  decisionLogic: "空间适配与材质耐用驱动：先确认真实使用场景与尺寸比例，强调结构可用、材质耐用、使用便利；不夸大承重与安全能力，不混入无关家具品牌。",
  contentPlan: ["首屏场景代入", "空间适配", "材质耐用", "收纳容量", "使用动作", "尺寸比例", "信任背书", "收尾转化"],
  visualExpression: ["真实家居场景", "尺度参照物", "干净光线", "空间留白", "产品结构清晰"],
  productFacts: ["结构尺寸", "材质", "可见功能", "规格"],
  promoBoundaries: ["不夸大承重与安全能力", "不改变产品结构", "不生成不合理尺寸比例", "不混入无关家具品牌"]
};
