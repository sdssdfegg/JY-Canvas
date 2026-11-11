// prompts/detail-studio/references/copywriting.js
//
// 电商文案与消费者语言子模块（阶段 3C P2）：消费者语言库 + 禁夸大/禁绝对化词表 + 文案方向与信息层级。
// 作为 analyze-strategy / director-visual 的可读资产（纯数据，零依赖、零模型），不单独立 Agent。
//
// 形态铁律（3A §3.2/§3.3）：结构化 JS 常量 + 确定性规则，**不是一大段提示词**。

/** 禁绝对化 / 夸大词表（确定性硬规则，被 quality/checklist.js 扫描）。命中即判违规。 */
export const FORBIDDEN_ABSOLUTE_WORDS = Object.freeze([
  "最", "第一", "顶级", "极致", "绝对", "唯一", "全网", "国家级", "世界级",
  "永久", "永远", "百分百", "100%", "排名第一", "史无前例", "前所未有",
  "guaranteed", "best", "#1", "100%"
]);

/** 禁医疗化 / 疗效暗示词表（跨行业红线，被 quality/checklist.js 扫描；命中提示复核）。 */
export const FORBIDDEN_MEDICAL_CLAIM_WORDS = Object.freeze([
  "治疗", "疗效", "治愈", "根治", "消炎", "杀菌", "抗癌", "防病", "药用", "医用", "医疗"
]);

/** 消费者语言库：按说服功能归类的高频表达（供导演/策划拼文案时取用，非模板堆砌）。 */
export const CONSUMER_LANGUAGE = Object.freeze({
  painPoint: [
    "每次都怕买错", "用完总觉得差点意思", "挑花眼也不知道哪个真合适", "怕踩坑、怕交智商税"
  ],
  trust: [
    "看得见的真实质感", "参数摆出来自己比", "敢把细节放大给你看", "说得出依据、不玩虚的"
  ],
  scene: [
    "下班回家那一刻", "周末给自己一点仪式感", "朋友来家里一眼就问", "早上多睡十分钟也体面"
  ],
  conversion: [
    "现在入手刚好", "先囤一盒不亏", "同款比过再决定", "适合先试一小步"
  ],
  texture: [
    "上手就知道不一样", "摸得到的地方都讲究", "细节经得起凑近看", "该硬的地方硬、该软的地方软"
  ]
});

/** 文案方向（按行业给倾向，不替代行业策略包的四字段；只细化「怎么说」）。 */
export const COPY_DIRECTIONS = Object.freeze({
  beauty: ["成分氛围优先于功效承诺", "用肤感与质地说话", "强调使用仪式感而非治疗结果"],
  food: ["真实食欲与口感联想优先", "包装清晰、规格诚实", "场景化食用瞬间而非健康背书"],
  electronics: ["参数可信与功能真实优先", "接口/按键细节讲清楚", "理性对比而非氛围渲染"],
  home: ["空间适配与材质耐用优先", "真实使用场景与尺寸比例", "生活方式表达而非奢华堆砌"],
  apparel: ["版型与面料肌理优先", "穿着场景与搭配关系", "真实模特姿态而非精修失真"],
  cleaning: ["安全与成分优先", "可验证事实而非功效夸张", "真实使用场景"],
  generic: ["真实商品事实优先", "卖点直接、留白明确", "避免过度承诺"]
});

/**
 * 文案信息层级提炼（确定性原语）：把「主文案 / 次文案 / 视觉」的权重给到一屏，
 * 与 core/screen-composition.js 的 infoHierarchy631 互补（那是视觉占比，这里是文案语气层级）。
 * @param {Object} input
 * @param {string} input.headline 主文案（占比最高，决定一眼印象）
 * @param {string} input.subcopy  次文案（解释/补充）
 * @returns {{ primaryTone:string, secondaryTone:string, hierarchyOrder:string[] }}
 */
export function copyHierarchy({ headline = "", subcopy = "" } = {}) {
  const h = String(headline || "").trim();
  const s = String(subcopy || "").trim();
  // 主文案短而断言（≤12 字倾向「断言式」），次文案给依据（倾向「解释式」）。
  const primaryTone = h.length <= 12 ? "断言式（短句强识别）" : "陈述式（带信息量）";
  const secondaryTone = s.length > 0 ? "解释式（给依据/场景）" : "留白（不强填）";
  return {
    primaryTone,
    secondaryTone,
    hierarchyOrder: ["视觉占比", "主文案", "次文案"].filter(Boolean)
  };
}

/**
 * 确定性：扫描一段文案是否命中禁词（绝对化 / 医疗化）。返回命中清单。
 * @param {string} text
 * @returns {{ absolute:string[], medical:string[] }}
 */
export function scanForbiddenWords(text = "") {
  const t = String(text || "");
  const absolute = FORBIDDEN_ABSOLUTE_WORDS.filter((w) => t.includes(w));
  const medical = FORBIDDEN_MEDICAL_CLAIM_WORDS.filter((w) => t.includes(w));
  return { absolute, medical };
}
