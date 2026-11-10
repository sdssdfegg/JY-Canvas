// prompts/detail-studio/industry/apparel.js
//
// 行业策略包：服装鞋包。覆盖四字段（决策逻辑/内容规划/视觉表达/事实边界）。
// 结构性字段（name/keywords/analyzeAttributes/taboos 等）由旧 INDUSTRY_SKILLS.apparel 底座提供。
//
// 设计真相源：阶段3A设计报告 §3.2.3 + 旧底座 apparel 关键词（女装/男装/面料/版型/模特 等）。

export const apparel = {
  id: "apparel",
  name: "服装鞋包",
  decisionLogic: "版型与面料驱动：先锁定款式结构与穿着场景，强调版型修饰身形、面料肌理真实、搭配关系清晰；模特姿态服务于商品展示，不改变结构。",
  contentPlan: ["首屏主视觉", "版型结构", "材质细节", "穿着体验", "使用场景", "痛点反转", "信任背书", "收尾转化"],
  visualExpression: ["柔和四面光", "低反差", "真实面料纹理", "自然模特姿态", "干净浅色背景", "产品边缘清楚"],
  productFacts: ["款式结构", "面料成分", "版型特征", "尺码规格", "穿着场景"],
  promoBoundaries: ["不改款式结构/袖口层次/纽扣颜色/领口形态", "不虚构面料成分与产地", "不让模特身份互相融合", "不把参考图衣服穿到目标商品"]
};
