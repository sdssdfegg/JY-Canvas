// prompts/detail-studio/industry/electronics.js
//
// 行业策略包：数码家电（覆盖层）。
// 结构性字段（name/keywords/analyzeAttributes/taboos 等）由旧 INDUSTRY_SKILLS.electronics 底座提供，
// 经 industry/index.js 合并后生效（与 apparel/generic 同范式）。本文件只写四字段 + id/name 锚点。
//
// 设计真相源：阶段3A设计报告 §3.2.3 覆盖语义 + 旧底座 electronics 关键词（数码/手机/耳机/充电/电器…）。

export const electronics = {
  id: "electronics",
  name: "数码家电",
  // 数码家电的消费者决策逻辑：参数可信与功能真实，而非氛围渲染。接口细节、屏幕/按键真实、核心功能
  // 可信是说服核心；参数不得虚构、不得添加不存在的接口、不得生成虚假屏幕内容、不得混入竞品 logo
  // （旧底座 taboos 已含上述全部边界）。
  decisionLogic: "参数可信与功能真实驱动：以接口细节、屏幕/按键真实、核心功能可信建立理性决策，而非氛围渲染；强调可验证的参数与结构，不虚构参数、不添加不存在的接口。",
  contentPlan: ["首屏产品主视觉", "核心功能", "参数可信", "接口细节", "使用场景", "安全保障", "信任背书", "收尾转化"],
  visualExpression: ["科技感但不浮夸", "结构化说明", "产品边缘清晰", "冷静光线", "信息层级明确"],
  productFacts: ["产品型号感(visible)", "接口位置", "屏幕/按键/指示灯", "核心功能", "参数(若标)"],
  promoBoundaries: ["不虚构参数", "不添加不存在的接口", "不生成虚假的屏幕内容", "不把竞品 logo 混入"]
};
