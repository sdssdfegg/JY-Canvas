// prompts/detail-studio/core/global-lock.js
//
// 全局一致性锁拼装（提炼自 server/detail-middleware.js:271/277/289/299/405/523）。
// 纯函数、零依赖：输入已解析的 platformProfile / industryStrategy / analysis，输出：
//   1) text  —— 拼进每屏提示词的全局锁文本（与旧 detail-middleware 文本范式一致）
//   2) traces —— 每个选项影响了哪条约束（供 option-trace.js 聚合成 appliedOptions 溯源）
//
// 注意：逐屏 modelPolicy（第几屏用模特）是 B2/B3 的职责，本模块只给「整组模型姿态」基调。

function copywritingText(copywriting) {
  if (copywriting === "poster") return "无文案纯海报：画面中不要生成任何文字、标题、卖点、标签、促销信息或水印。";
  if (copywriting === "blank") return "文案留白：预留干净文字排版区域，文字极少或不直接生成，留白不能遮挡产品。";
  return "需要文案：生成清晰可读的电商文案，标题、卖点和辅助说明层级分明，文字必须无错字乱码。";
}

function fontPolicy(fontStyle, copywriting) {
  if (copywriting === "poster") return "无文案模式下不生成字体，只保留海报式画面层级。";
  const map = {
    soft: "柔和女性字体气质，笔画圆润、字重中等、排版轻盈，适合女装/美妆/生活方式。",
    heiti: "常用黑体风格，类似思源黑体、微软雅黑、阿里巴巴普惠体的干净无衬线，易读、稳定、适合电商详情。",
    modern: "现代杂志感无衬线，标题克制，留白更多，适合高质感品牌表达。",
    bold: "醒目电商标题，字重更高，但不要廉价促销感，避免大红大黄堆叠。",
    auto: "根据平台和行业自动选择字体气质，优先保证清晰可读和统一。"
  };
  return map[String(fontStyle || "soft")] || map.soft;
}

function richnessPolicy(richness) {
  const map = {
    simple: "画面保持精简，一屏只表达一个重点，文案少、留白充足。",
    balanced: "信息密度均衡，标题、卖点、产品和场景都有明确层级。",
    rich: "信息更完整，可加入辅助标签、局部细节和场景说明，但必须保持清爽不拥挤。"
  };
  return map[String(richness || "simple")] || map.simple;
}

function groupModelPolicy(modelMode, modelPose) {
  if (String(modelMode || "no-model") !== "use-model") {
    return "本组无模特，禁止出现真人、人体局部、手持穿着或模特影子。";
  }
  if (String(modelPose || "regular") === "special") {
    return "本组使用特殊姿态模特：可用广角、动态姿态与视觉主体贴近镜头的冲击力，但产品结构、版型、面料和细节必须真实。";
  }
  return "本组使用常规姿态模特：自然站姿、坐姿或行走，镜头透视正常，清晰展示穿着效果。";
}

const PRODUCT_AUTHENTICITY_LOCK = [
  "商品图是唯一商品事实来源，生成时不得擅自改变颜色、结构、材质、五金、logo、纹理、比例和关键细节。",
  "参考图只用于理解氛围、配色、构图、场景或版式，不得把参考图中的其它商品、品牌、人物身份、文字水印混入目标商品。",
  "当提示词与商品图冲突时，以商品图为准；当提示词与平台规则冲突时，以合规和真实性为准。"
];

const GLOBAL_STYLE_CONSISTENCY = [
  "同一组详情页保持统一色彩体系、字体层级、光线方向、边距节奏和背景质感。",
  "首屏负责吸引，后续屏幕负责解释，收尾负责转化，不能每屏像不同店铺的独立海报。",
  "产品大小和透视要连贯，细节屏可以近景但不得改变商品结构。"
];

/**
 * 拼装全局锁。
 * @param {Object} input
 * @param {string} input.productName
 * @param {string} input.ratio
 * @param {string} input.imageSize
 * @param {string} input.lang
 * @param {string} input.copywriting
 * @param {string} input.fontStyle
 * @param {string} input.richness
 * @param {string} input.modelMode
 * @param {string} input.modelPose
 * @param {number} input.screenCount
 * @param {Object} input.platformProfile  已解析的平台 Skill（须含 platform/pageType/visualRule/copyRule/imageNorms/conversionTraits/rhythm）
 * @param {Object} input.industryStrategy  已解析的行业策略（须含 name/analyzeAttributes/sellingAngles/taboos）
 * @param {Object} input.analysis          商品分析（industry/targetAudience/visualStyle/materialHints/productLocks）
 * @returns {{ text: string, traces: Array }}
 */
export function buildGlobalLock(input = {}) {
  const productName = String(input.productName || "目标产品").trim() || "目标产品";
  const ratio = String(input.ratio || "21:9").trim() || "21:9";
  const imageSize = String(input.imageSize || "2K").trim() || "2K";
  const lang = String(input.lang || "中文").trim() || "中文";
  const copywriting = String(input.copywriting || "need");
  const fontStyle = String(input.fontStyle || "soft");
  const richness = String(input.richness || "simple");
  const modelMode = String(input.modelMode || "no-model");
  const modelPose = String(input.modelPose || "regular");
  const screenCount = Number.isFinite(input.screenCount) ? input.screenCount : 0;
  const platform = input.platformProfile || {};
  const industry = input.industryStrategy || {};
  const analysis = input.analysis || {};

  const platformLabel = `${platform.platform || "通用"}${platform.pageType || ""}`;
  const copywritingClause = copywritingText(copywriting);
  const fontClause = fontPolicy(fontStyle, copywriting);
  const richnessClause = richnessPolicy(richness);
  const modelClause = groupModelPolicy(modelMode, modelPose);
  const authClause = PRODUCT_AUTHENTICITY_LOCK.join(" ");
  const styleClause = GLOBAL_STYLE_CONSISTENCY.join(" ");
  const platformRuleClause = `${platform.visualRule || ""} ${platform.copyRule || ""}`.trim();
  const industryClause = `行业识别：${industry.name || analysis.industry || "通用"}；重点观察：${(industry.analyzeAttributes || []).join("、") || "以商品图为准"}。`;
  const audienceClause = `受众：${analysis.targetAudience || "以商品图与目标人群推断"}；材质线索：${(analysis.materialHints || []).join("、") || "以商品图为准"}。`;
  const visualClause = `全局风格：${analysis.visualStyle || "真实商品质感"}；${styleClause}`;
  const tabooClause = `行业禁忌：${(industry.taboos || []).join("；") || "无特殊禁忌"}。`;
  const metaClause = `目标平台：${platformLabel}；输出语言：${lang}；比例：${ratio}；分辨率：${imageSize}；屏数：${screenCount || "待定"}。`;
  const productClause = `目标商品：只以商品图里的「${productName}」为准，${authClause}`;

  const text = [
    metaClause,
    productClause,
    industryClause,
    audienceClause,
    visualClause,
    platformRuleClause ? `平台规则：${platformRuleClause}。` : "",
    `文案规则：${copywritingClause}；字体规则：${fontClause}；信息密度：${richnessClause}。`,
    `模特与镜头：${modelClause}`,
    tabooClause
  ].filter(Boolean).join("\n");

  const traces = [
    { option: "platform", value: platformLabel, affected: "globalLock", clause: metaClause },
    { option: "productName", value: productName, affected: "globalLock", clause: productClause },
    { option: "industry", value: industry.name || analysis.industry || "通用", affected: "globalLock", clause: industryClause },
    { option: "lang", value: lang, affected: "globalLock", clause: metaClause },
    { option: "ratio", value: ratio, affected: "globalLock", clause: metaClause },
    { option: "imageSize", value: imageSize, affected: "globalLock", clause: metaClause },
    { option: "copywriting", value: copywriting, affected: "globalLock", clause: copywritingClause },
    { option: "fontStyle", value: fontStyle, affected: "globalLock", clause: fontClause },
    { option: "richness", value: richness, affected: "globalLock", clause: richnessClause },
    { option: "modelMode", value: modelMode, affected: "globalLock", clause: modelClause },
    { option: "modelPose", value: modelPose, affected: "globalLock", clause: modelClause }
  ];

  return { text, traces };
}

export { copywritingText, fontPolicy, richnessPolicy, groupModelPolicy, PRODUCT_AUTHENTICITY_LOCK, GLOBAL_STYLE_CONSISTENCY };
