// prompts/detail-studio/industry/beauty.js
//
// 行业策略包：美妆护肤（覆盖层）。
// 结构性字段（name/keywords/analyzeAttributes/taboos 等）由旧 INDUSTRY_SKILLS.beauty 底座提供，
// 经 industry/index.js 合并后生效（与 apparel/generic 同范式）。本文件只写四字段 + id/name 锚点，
// 不重复搬运旧底座数据（避免双真相源漂移）。
//
// 设计真相源：阶段3A设计报告 §3.2.3 覆盖语义 + 旧底座 beauty 关键词（护肤/美妆/口红/精华/面霜…）。
// 与 cleaning.js 的区别：cleaning 是旧底座没有的新行业，故自包含全部字段；beauty 已在旧底座，故只覆盖决策层。

export const beauty = {
  id: "beauty",
  name: "美妆护肤",
  // —— 四字段覆盖（决策逻辑 / 内容规划 / 视觉表达 / 事实边界）——
  // 美妆护肤的消费者决策逻辑：信任成分与真实质地，而非功效承诺。肤感、质地、包装质感是说服核心；
  // 医疗化/夸张功效表述是红线（旧底座 taboos 已含「不生成医疗疗效承诺 / 不虚构成分认证」）。
  decisionLogic: "成分与真实质地驱动：以可见质地、包装质感、成分氛围建立信任，而非功效承诺；强调可验证的成分与肤感，不承诺医疗疗效，不把护肤品说成药品。",
  contentPlan: ["首屏质地特写", "成分氛围", "使用仪式感", "肤感场景", "包装质感", "礼赠场景", "信任背书", "收尾转化"],
  visualExpression: ["干净高光", "玻璃/亚克力台面", "液体/膏体质感", "局部微距特写", "柔焦但产品清晰", "肤色自然"],
  productFacts: ["瓶身形态", "包装材质", "可见标签文字", "质地(visible)", "规格"],
  promoBoundaries: ["不虚构功效与成分认证", "不承诺医疗疗效", "不改瓶型与标签文字", "不生成前后对比的夸张效果"]
};
