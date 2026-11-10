// prompts/detail-studio/industry/cleaning.js
//
// 行业策略包：清洁日化（新增，旧 INDUSTRY_SKILLS 无此底座，本文件自包含全部字段）。
// 覆盖四字段 + 结构性字段（name/keywords/analyzeAttributes/taboos/...）。
//
// 三条冲突消解规则（阶段3A设计报告 §3.2.3）：
//  ① 显式 industryId 优先 —— 由 getIndustryStrategy(explicit) 处理。
//  ② 同分专属词优先 —— 由 index.js 的 tie-break（matchedLen → conflictPriority）处理。
//  ③ 新包不复用 home 泛词 —— 本包关键词只用专属词（洗护/去污/除菌/纸品/清洁日化/日化/衣物护理/
//     洗衣液/洗洁精/消毒液/柔顺剂），绝不包含 bare「清洁」（home 已占），避免与 home 命中数并列被抢。

export const cleaning = {
  id: "cleaning",
  name: "清洁日化",
  // 关键词：仅专属词，不含 bare「清洁」（避免与 home 泛词冲突，规则③）。
  keywords: ["洗护", "去污", "除菌", "纸品", "清洁日化", "日化", "衣物护理", "洗衣液", "洗洁精", "消毒液", "柔顺剂"],
  analyzeAttributes: ["成分与配方", "净含量与规格", "适用表面/材质", "使用场景", "安全与认证", "气味与肤感"],
  sellingAngles: ["去污力", "成分安全", "使用便利", "气味清新", "适用场景广", "性价比"],
  recommendedScreens: ["首屏功效场景", "核心成分/原理", "使用场景", "安全与认证", "信任背书", "收尾转化"],
  visualAnchors: ["干净明亮", "水感/泡沫质感", "真实使用场景", "不过度美白", "产品包装清晰"],
  taboos: ["不虚构除菌率/认证", "不暗示医疗疗效", "不改包装规格文字", "不夸大清洁效果", "不把清洁日化与家居百货混淆表述"],
  qcRules: ["检查包装文字是否乱码", "检查净含量/规格是否虚构", "检查功效文案是否合规", "检查场景是否真实"],
  // —— 四字段覆盖 ——
  decisionLogic: "理性+信任驱动：安全/成分/认证/使用场景优先，避免夸大功效；强调可验证的事实，不承诺无法证实的效果。",
  contentPlan: ["首屏功效场景", "核心成分/原理", "使用场景", "安全与认证", "信任背书", "收尾转化"],
  visualExpression: ["干净明亮", "水感/泡沫质感", "真实使用场景", "不过度美白", "产品包装清晰"],
  productFacts: ["成分", "净含量", "适用表面/材质", "认证(如有的真实认证)"],
  promoBoundaries: ["不虚构除菌率/认证", "不暗示医疗疗效", "不改包装规格文字"],
  // 规则② tie-break 权重：cleaning 的专属词优先于 home 的泛词「清洁」。
  conflictPriority: 10
};
