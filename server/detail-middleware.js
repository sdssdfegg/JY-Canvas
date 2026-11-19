import {
  BASE_SKILL,
  INDUSTRY_SKILLS,
  PLATFORM_SKILLS,
  QUALITY_SKILL,
  SCREEN_MODULES,
  buildQualityChecklist,
  getIndustrySkillByText,
  getPlatformSkill,
  getScreenModule,
  uniqueList
} from "./detail-skills.js";
import { buildStylePackRound, resolveDetailSkillVersion, stylePackForGroup, variantFor, STYLE_PACKS } from "./detail-skills-v2.js";
import { asText, clamp } from "./core/ai-chat-shared.js";
// S2-C / V2-ARCH：四层控制框架工程机制层（注册表 / 行业包加载 / 任务准入 / 编译审计）。
// 只消费"工程机制"；专业内容由 ChatGPT 交付，未接入前一律占位态，不输出正式规则。
import {
  createTaskRegistry,
  loadIndustryPack,
  admitTasks,
  createCompilerAudit,
  professionalContentStatus,
  detectIndustryOverride,
  activeConfig
} from "./detail-v2-control/index.js";
// V2-PRO-002：Skill 按需触发 + 提示词分层组装 + 编译授权（工程机制）。
import {
  evaluateAllActivations,
  assemblePromptLayers,
  compileWithAuthorization,
  checkSellingPointBoundary,
  buildScreenVisual
} from "./detail-v2-control/skill-activation.js";

const DEFAULT_COUNT = BASE_SKILL.screenCountRule.defaultCount;

// 构图与光线行的 v1 / v2 两版文案（v1 逐字保留，v2 仅替换布光来源，不动结构）。
const V1_LIGHT_LINE = "主体清晰、边缘干净、柔和四面光、低反差、无生硬黑影；细节屏可以近景，但必须保留产品真实结构。";
const V2_LIGHT_TAIL = "主体清晰、边缘干净、无生硬黑影；细节屏可以近景，但必须保留产品真实结构。";

// busboy 1.6.0 解析 multipart 的 filename 时，会把 UTF-8 中文名按 latin1 误解码成
// 类似「ç¾½ç»æ...」的乱码（每个中文字节被当成一个 latin1 字符）。这里做一次安全回解码：
// 仅当字符串里含有 latin1 高位字节字符（U+0080–U+00FF，正是 mojibake 的特征区间）且按
// latin1→utf8 重解码后得到不含替换符的合法 UTF-8 时，才采用重解码结果；原本就是正确 UTF-8
// （汉字在 U+4E00+ 区间，不命中本正则）或纯 ASCII 的文件名一律原样返回，避免二次破坏。
function fixMojibakeName(name) {
  if (typeof name !== "string" || name.length === 0) return name;
  if (!/[\u0080-\u00FF]/.test(name)) return name;
  const attempt = Buffer.from(name, "latin1").toString("utf8");
  if (attempt.length > 0 && attempt !== name && !attempt.includes("�")) {
    return attempt;
  }
  return name;
}

function parseList(value) {
  return String(value || "")
    .split(/\r?\n|[，,；;]/)
    .map((item) => item.replace(/^第?\d+[屏、.:\s-]*/, "").trim())
    .filter(Boolean);
}

// V2-PRO-003 内容质量修复：结构化商品资料解析（保留来源/事实等级/原始内容）。
// 用户以「成分：…适用范围：…使用方法：…」标签提供的资料属于用户明确提供=visible，
// 不得被 parseList 降维成普通卖点串或当成未确认信息。
// 通用商品信息维度词表（非单品专属）：分类与切分同源，避免两处正则漂移。
// V1.1 扩展材质/颜色/版型/洗涤/场景等维度——跨商品测试发现原词表仅覆盖日化，服装/家居资料无法结构化。
const PRODUCT_FACT_LABELS = [
  { key: "ingredient", alts: ["成[分份]", "配方"] },
  { key: "material", alts: ["材质", "面料", "用料"] },
  { key: "color", alts: ["颜色", "配色", "色系"] },
  { key: "applicableScope", alts: ["适用(?:范围|对象|材质|场景|场合)", "可用于", "场景", "用途"] },
  { key: "usage", alts: ["使用(?:方法|方式|步骤)", "操作步骤", "用法"] },
  { key: "care", alts: ["洗涤(?:方法|方式)?", "保养", "维护", "收纳", "清洗方式"] },
  { key: "effect", alts: ["效果", "功效", "作用", "保温", "性能"] },
  { key: "spec", alts: ["规格", "容量", "净含量", "型号", "版型", "尺码", "尺寸"] }
];
const FACT_LABEL_SOURCE = PRODUCT_FACT_LABELS.flatMap((item) => item.alts).join("|");
const FACT_LABEL_SPLIT = new RegExp(`(?=(?:${FACT_LABEL_SOURCE})\\s*[:：])`);
export function parseStructuredFacts(productFeature = "") {
  const text = String(productFeature || "").trim();
  if (!text) return [];
  const segments = text.split(FACT_LABEL_SPLIT);
  const facts = [];
  for (const seg of segments) {
    const match = seg.match(/^(.*?)\s*[:：]\s*([\s\S]+)$/);
    if (!match) continue;
    const label = match[1].trim();
    const content = match[2].trim().replace(/[。；;]+$/, "");
    if (!content) continue;
    const kind = PRODUCT_FACT_LABELS.find((item) => item.alts.some((alt) => new RegExp(`^${alt}$`).test(label)));
    facts.push({
      category: kind ? kind.key : "other",
      label,
      content,
      source: "user_provided",
      level: "visible"
    });
  }
  return facts;
}

// 本地兜底屏级任务分配：按结构化事实分组组织，使用方法作为一个完整任务不拆碎。
// 输出与 aiScreen 同形的屏级任务，供无 AI 规划时编译，避免"按屏号轮流取一句原始资料"。
export function buildLocalScreenTasks(structuredFacts = [], providedSelling = [], count = 4, productName = "") {
  const byCategory = {};
  for (const fact of (Array.isArray(structuredFacts) ? structuredFacts : [])) {
    (byCategory[fact.category] = byCategory[fact.category] || []).push(fact.content);
  }
  // 维度→任务的有序定义（通用信息维度，非固定模板；仅按当前商品实际有的维度生成任务）。
  const definitions = [
    { category: "identity", parts: [String(productName || "").trim(), ...(providedSelling || [])].filter(Boolean), label: "商品身份与核心价值", hint: "首屏以商品主体+核心价值建立认知，不把成分/参数清单当首屏卖点" },
    { category: "ingredient", parts: byCategory.ingredient || [], label: "成分与配方", hint: "只在有依据时说明已确认成分，不推导未经证实的效果" },
    { category: "material", parts: byCategory.material || [], label: "材质与面料", hint: "以真实材质细节建立质感认知，不虚构材质" },
    { category: "applicableScope", parts: byCategory.applicableScope || [], label: "适用范围与场景", hint: "用真实适用对象建立需求关联，不扩展未列对象" },
    { category: "usage", parts: byCategory.usage || [], label: "使用方法", hint: "按真实步骤呈现操作逻辑，不创造未确认步骤" },
    { category: "care", parts: byCategory.care || [], label: "洗涤与保养", hint: "呈现有依据的保养方式，不虚构维护效果" },
    { category: "effect", parts: byCategory.effect || [], label: "效果与性能依据", hint: "只呈现有依据的效果信息，不虚构实验数据" },
    { category: "color", parts: [...(byCategory.color || []), ...(byCategory.spec || [])], label: "颜色与规格选择", hint: "呈现真实可选规格与颜色，辅助购买决策" }
  ];
  const tasks = definitions
    .filter((def) => def.parts.length > 0)
    .map((def) => ({
      sellingPoint: `${def.label}：${def.parts.join("；")}`,
      taskCategory: def.category,
      compositionHint: def.hint
    }));
  // 任务不足 count 时不硬凑重复卖点：返回实际任务数，由上层按"无独立任务则整合未用事实"处理。
  return tasks.slice(0, count);
}

// 本地兜底屏级任务→模块分类：让 moduleKey 反映真实任务，不再全部落 coreSellingPoint。
// 仅用于本地兜底；AI 规划的 moduleId 仍按其输出优先。
const LOCAL_TASK_MODULE = {
  identity: "hero",
  material: "materialDetail",
  applicableScope: "useScenario",
  usage: "useScenario",
  care: "useScenario",
  effect: "trustProof",
  color: "specInfo"
};
export function moduleForLocalTask(taskCategory, index, count) {
  const id = LOCAL_TASK_MODULE[taskCategory];
  if (!id) return index === count - 1 ? "conversionClose" : "coreSellingPoint";
  return id;
}

// 本地兜底完整性判据：v2Planning=true 但 aiPlan=null 时，必须有可编译的结构化规划，
// 否则明确失败、停止错误的分屏编译，不静默生成空洞详情。
export function checkPlanningIntegrity({ v2Planning, aiPlan, structuredFacts = [], sellingPoints = [], rawProductFeature = "" }) {
  if (!v2Planning) return { ok: true, source: "not_v2_planning" };
  if (aiPlan) return { ok: true, source: "ai_plan" };
  // 完整本地兜底：结构化事实 / 用户卖点 / 自由文本商品资料任一存在即可编译。
  // 自由文本（如"棉质"）虽无标签，仍是用户明确提供的资料，不算空洞规划。
  const facts = Array.isArray(structuredFacts) ? structuredFacts : [];
  const selling = Array.isArray(sellingPoints) ? sellingPoints : [];
  const hasStructured = facts.length > 0 || String(rawProductFeature || "").trim().length > 0;
  const hasSelling = selling.length > 0;
  if (!hasStructured && !hasSelling) {
    return {
      ok: false,
      source: "none",
      reason: "v2Planning 已启用但 AI 规划失败且无结构化本地资料；停止编译，避免静默生成空洞详情。"
    };
  }
  return { ok: true, source: "local_structured_fallback", factCount: facts.length, sellingCount: selling.length };
}

function imageDimensions(buffer) {
  if (!buffer || buffer.length < 24) return null;
  if (buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function assetsFromInput(inputImages, files, role) {
  const fileAssets = files.map((file, index) => {
    const dims = imageDimensions(file.buffer);
    return {
      index,
      role,
      name: fixMojibakeName(file.originalname || `${role}-${index + 1}`),
      size: file.size,
      type: file.mimetype || "",
      width: dims?.width || null,
      height: dims?.height || null,
      hasPixels: true
    };
  });
  if (fileAssets.length > 0) return fileAssets;
  return (Array.isArray(inputImages) ? inputImages : []).map((item, index) => ({
    index,
    role,
    name: fixMojibakeName(String(item?.name || `${role}-${index + 1}`)),
    size: Number(item?.size || 0),
    type: String(item?.type || ""),
    width: null,
    height: null,
    hasPixels: false
  }));
}

function inferIndustry(input, productImages) {
  const text = [
    input.productName,
    input.productFeature,
    input.userInstruction,
    input.sellingPoints,
    ...productImages.map((item) => item.name)
  ].join(" ");
  // V2-PRO-001：无 aiPlan 的兼容路径同样走清洁日化覆盖层，避免"包装"误判服装。
  const override = detectIndustryOverride(text);
  if (override) {
    return {
      id: override.industryId,
      name: override.industryName,
      analyzeAttributes: override.analyzeAttributes,
      sellingAngles: ["清洁对象与问题匹配", "明确适用与使用方式", "有依据的效果表达"],
      recommendedScreens: ["首屏主视觉", "核心卖点", "使用场景", "参数说明", "信任背书", "收尾转化"],
      visualAnchors: ["商品主体清晰", "真实使用对象", "干净光线", "无跨品类元素"],
      taboos: override.taboos,
      qcRules: ["检查行业是否串到服装/厨具/卫浴", "检查包装材质是否与使用对象材质混淆", "检查适用范围是否超证据"],
      isIndustryOverride: true,
      overrideSource: override.source
    };
  }
  return getIndustrySkillByText(text);
}

function aiIndustry(input, productImages, aiPlan) {
  const aiText = [
    aiPlan?.product?.industryId,
    aiPlan?.product?.industryName,
    aiPlan?.product?.name,
    ...(Array.isArray(aiPlan?.product?.realSellingPoints) ? aiPlan.product.realSellingPoints : []),
    ...(Array.isArray(aiPlan?.product?.materials) ? aiPlan.product.materials : [])
  ].join(" ");
  // V2-PRO-001 / 第一层+第二层：正式清洁日化包强特征覆盖层（不改 G-2 词表）。
  // 命中清洗剂/去渍等强特征且无服装强特征时，直接用清洁日化规则属性，杜绝"包装"的"包"误判服装。
  const inputText = [input?.productName, input?.productFeature, input?.userInstruction, ...(Array.isArray(input?.sellingPoints) ? input.sellingPoints : [])].join(" ");
  const override = detectIndustryOverride(`${aiText} ${inputText}`);
  if (override) {
    return {
      id: override.industryId,
      name: override.industryName,
      analyzeAttributes: override.analyzeAttributes,
      sellingAngles: ["清洁对象与问题匹配", "明确适用与使用方式", "有依据的效果表达"],
      recommendedScreens: ["首屏主视觉", "核心卖点", "使用场景", "参数说明", "信任背书", "收尾转化"],
      visualAnchors: ["商品主体清晰", "真实使用对象", "干净光线", "无跨品类元素"],
      taboos: override.taboos,
      qcRules: ["检查行业是否串到服装/厨具/卫浴", "检查包装材质是否与使用对象材质混淆", "检查适用范围是否超证据"],
      isIndustryOverride: true,
      overrideSource: override.source
    };
  }
  const skill = getIndustrySkillByText(aiText);
  return skill.id !== "generic" ? skill : inferIndustry(input, productImages);
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => asText(item)).filter(Boolean);
  if (typeof value === "string") return parseList(value);
  return [];
}

function normalizeIndexList(value, max) {
  const indexes = Array.isArray(value) ? value : [];
  return uniqueList(indexes.map((item) => Number.parseInt(item, 10)))
    .filter((index) => Number.isInteger(index) && index >= 0 && index < max)
    .slice(0, 3);
}

// S1-b：缺屏最小占位（替代 {}）。AI 返回的屏不足 count 时，剩余屏用空白占位填充，
// 由下游标题/模块逻辑保守兜底，不引入任何模板化默认文案。
function minimalScreenPlaceholder() {
  return {
    title: "",
    moduleId: "",
    summary: "",
    sellingPoint: "",
    composition: "",
    copywriting: "",
    referenceReason: "",
    modelPolicyHint: "",
    promptDirectives: [],
    negativeConstraints: [],
    qualityChecks: [],
    compositionVariantId: "",
    productFileIndexes: [],
    referenceFileIndexes: []
  };
}

function normalizeAiScreens(aiPlan, count, productCount, referenceCount) {
  const screens = Array.isArray(aiPlan?.screens) ? aiPlan.screens : [];
  if (screens.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const found = screens.find((screen) => Number.parseInt(screen?.screen, 10) === index + 1) || screens[index] || minimalScreenPlaceholder();
    return {
      screen: index + 1,
      moduleId: asText(found.moduleId || found.module || found.moduleName),
      title: asText(found.title),
      summary: asText(found.summary),
      sellingPoint: asText(found.sellingPoint || found.selling_point),
      composition: asText(found.composition),
      copywriting: asText(found.copywriting || found.copy),
      referenceReason: asText(found.referenceReason || found.reference_reason),
      modelPolicyHint: asText(found.modelPolicyHint || found.model_policy),
      promptDirectives: asArray(found.promptDirectives || found.directives),
      negativeConstraints: asArray(found.negativeConstraints || found.negative),
      qualityChecks: asArray(found.qualityChecks || found.qcRules),
      compositionVariantId: asText(found.compositionVariantId || found.composition_variant),
      productFileIndexes: normalizeIndexList(found.productFileIndexes, productCount),
      referenceFileIndexes: normalizeIndexList(found.referenceFileIndexes, referenceCount)
    };
  });
}

function mergeAiAnalysis(localAnalysis, aiPlan, aiMeta, aiError) {
  if (!aiPlan) {
    return {
      ...localAnalysis,
      ...(aiError ? {
        aiError,
        limitation: `AI 分析未完成，已切回本地五层 Skill 兜底。失败原因：${aiError}`
      } : {})
    };
  }

  const product = aiPlan.product || {};
  const strategy = aiPlan.strategy || {};
  const sellingPoints = uniqueList([
    ...asArray(product.realSellingPoints),
    ...asArray(strategy.pageRhythm),
    ...localAnalysis.sellingPoints
  ]);

  return {
    ...localAnalysis,
    mode: aiMeta?.mode || "ai-vision",
    confidence: aiMeta?.mode === "ai-vision" ? "high" : "medium",
    industry: asText(product.industryName, localAnalysis.industry),
    targetAudience: asText(product.targetAudience, localAnalysis.targetAudience),
    materialHints: asArray(product.materials).length > 0 ? asArray(product.materials) : localAnalysis.materialHints,
    sellingPoints: sellingPoints.length > 0 ? sellingPoints : localAnalysis.sellingPoints,
    visualStyle: asText(strategy.globalStyle || product.styleDirection, localAnalysis.visualStyle),
    productLocks: asArray(product.structureLocks),
    colors: asArray(product.colors),
    riskNotes: asArray(product.riskNotes),
    aiModel: aiMeta?.model || "",
    aiTiming: aiMeta?.timing || null,
    limitation: aiMeta?.mode === "ai-vision"
      ? "已调用 AI 文本/视觉模型读取商品图，并由五层 Skill 做规则约束、分屏规划和提示词安全清洗。"
      : "已调用 AI 文本模型做策略规划；当前模型未完成图片读取时，商品事实仍以用户输入和本地 Skill 兜底为准。"
  };
}

function inferAudience(input, industrySkill) {
  const text = `${input.productName || ""} ${input.productFeature || ""} ${input.userInstruction || ""}`;
  if (/女装|裙|通勤|轻熟|温柔|少女|辣妹|显瘦/.test(text)) return "女性消费者，关注版型、显瘦、面料质感和穿搭场景";
  if (/男装|男士|商务|通勤/.test(text)) return "男性消费者，关注质感、实用性、版型和场景适配";
  if (/儿童|宝宝|母婴|童装|亲子/.test(text)) return "亲子/家庭用户，关注安全、舒适、真实使用和清洁便利";
  if (industrySkill.id === "electronics") return "理性决策用户，关注参数、功能、可靠性和兼容场景";
  if (industrySkill.id === "beauty") return "审美与体验型用户，关注包装质感、肤感表达和使用仪式感";
  if (industrySkill.id === "food") return "日常消费用户，关注口感联想、包装规格、食用场景和信任感";
  return "电商浏览用户，关注第一眼质感、核心卖点、真实细节和购买理由";
}

function inferMaterials(input, industrySkill) {
  const text = `${input.productName || ""} ${input.productFeature || ""} ${input.userInstruction || ""} ${input.sellingPoints || ""}`;
  const candidates = [
    "棉",
    "羊毛",
    "针织",
    "雪纺",
    "牛仔",
    "皮革",
    "亚麻",
    "丝绸",
    "蕾丝",
    "玻璃",
    "金属",
    "木质",
    "陶瓷",
    "塑料",
    "硅胶",
    "不锈钢",
    "亚克力",
    "真皮",
    "珍珠",
    "黄金",
    "银饰"
  ];
  const matched = candidates.filter((item) => text.includes(item));
  if (matched.length > 0) return matched;
  return [`以${industrySkill.name}商品图中的真实材质为准，重点保留表面纹理、结构边缘和工艺细节`];
}

function inferVisualStyle(input, referenceImages, industrySkill, platformSkill) {
  const text = `${input.userInstruction || ""} ${input.productFeature || ""} ${referenceImages.map((item) => item.name).join(" ")}`;
  if (/极简|白墙|浅色|咖啡馆|草坪|柔粉|米色/.test(text)) return "浅色极简、电商高级感、柔和低反差";
  if (/赛博|科技|未来|金属|冷光/.test(text)) return "科技感、结构化光线、冷静高对比";
  if (/复古|胶片|法式|中古/.test(text)) return "复古生活方式、柔和颗粒、暖色调";
  if (/小红书|种草|生活方式/.test(`${platformSkill.platform} ${text}`)) return "自然生活方式、真实氛围、轻商业感";
  return industrySkill.visualAnchors.join("、");
}

function buildProductAnalysis(input, productImages, referenceImages, industrySkill, platformSkill) {
  const providedFeatures = parseList(input.productFeature);
  const providedSelling = parseList(input.sellingPoints);
  const imageFacts = productImages.map((item) => {
    const ratio = item.width && item.height ? `${item.width}x${item.height}` : "未读取尺寸";
    return `${item.name} / ${item.type || "未知类型"} / ${ratio}`;
  });
  const sellingPoints = uniqueList([
    ...providedSelling,
    ...providedFeatures.slice(0, 4),
    ...industrySkill.sellingAngles
  ]);

  return {
    mode: input.analysisMode === "ai" ? "ai-ready-fallback" : "local-rule",
    confidence: productImages.some((item) => item.hasPixels) ? "medium" : "low",
    industry: industrySkill.name,
    platform: platformSkill.platform,
    targetAudience: inferAudience(input, industrySkill),
    materialHints: inferMaterials(input, industrySkill),
    analyzeAttributes: industrySkill.analyzeAttributes,
    sellingPoints,
    visualStyle: inferVisualStyle(input, referenceImages, industrySkill, platformSkill),
    imageFacts,
    limitation: input.analysisMode === "ai"
      ? "当前版本已接收商品原图，但未额外调用视觉分析模型；在渠道确认支持文本/视觉分析并配置中间件计费前，仍使用本地 Skill 规则规划。"
      : "本地 Skill 规划不会额外消耗 AI 分析费用；真正视觉识别可在后续接入中间件接口。"
  };
}

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

function modelPolicy(input, index, count) {
  const modelMode = String(input.modelMode || "no-model");
  const modelPose = String(input.modelPose || "regular");
  const modelUsage = clamp(input.modelUsage, 1, 12, 4);
  if (modelMode !== "use-model") return "本屏无模特，禁止出现真人、人体局部、手持穿着或模特影子。";
  const useModel = index < Math.min(modelUsage, count);
  if (!useModel) return "本屏不使用模特，使用静物、细节、平铺或场景陈列。";
  if (modelPose === "special") {
    return "本屏使用特殊姿态模特：可用广角镜头、极端透视、动态姿态和视觉主体贴近镜头的冲击力，但产品结构、版型、面料和细节必须真实。";
  }
  return "本屏使用常规姿态模特：自然站姿、坐姿或行走，镜头透视正常，清晰展示穿着效果。";
}

function buildScreenTitles(count, platformSkill, industrySkill, reverseScreens) {
  const targetReverseCount = Math.min(clamp(reverseScreens, 0, 4, 0), Math.max(0, count - 2));
  const seedTitles = uniqueList([
    ...platformSkill.rhythm,
    ...industrySkill.recommendedScreens,
    ...industrySkill.sellingAngles
  ]).filter((title) => getScreenModule(title).id !== "painReverse");
  const titles = Array.from({ length: count }, (_, index) => seedTitles[index % seedTitles.length] || `第${index + 1}屏`);
  const candidateSlots = Array.from({ length: Math.max(0, count - 2) }, (_, index) => index + 1);

  for (let index = 0; index < targetReverseCount; index += 1) {
    const rawSlot = Math.round(((index + 1) * (candidateSlots.length + 1)) / (targetReverseCount + 1)) - 1;
    const slot = candidateSlots[Math.max(0, Math.min(candidateSlots.length - 1, rawSlot))];
    if (slot === undefined) continue;
    titles[slot] = "痛点反转";
  }

  if (count > 0) titles[0] = "首屏主视觉";
  if (count > 1) titles[count - 1] = "收尾转化";

  return titles;
}

function referencePlanForScreen(index, count, productImages, referenceImages, moduleSkill) {
  const productIndexes = [];
  if (productImages.length > 0) productIndexes.push(0);
  if (["materialDetail", "fitStructure"].includes(moduleSkill.id) && productImages.length > 1) productIndexes.push(1);
  if (["useScenario", "hero"].includes(moduleSkill.id) && productImages.length > 2) productIndexes.push(2);

  let referenceIndexes = [];
  if (referenceImages.length > 0) {
    if (["hero", "conversionClose"].includes(moduleSkill.id)) {
      referenceIndexes = [0];
    } else if (["useScenario", "painReverse"].includes(moduleSkill.id)) {
      referenceIndexes = referenceImages.slice(0, 2).map((_, refIndex) => refIndex);
    } else if (["specInfo", "trustProof", "coreSellingPoint"].includes(moduleSkill.id)) {
      referenceIndexes = [referenceImages.length - 1];
    }
  }

  if (index === count - 1 && referenceImages.length > 0) referenceIndexes = [0];

  return {
    productFileIndexes: uniqueList(productIndexes).slice(0, 3),
    referenceFileIndexes: uniqueList(referenceIndexes).slice(0, 3)
  };
}

function buildImageSlots(productImages, referenceImages, plan) {
  const slots = [];
  for (const sourceIndex of plan.productFileIndexes) {
    const image = productImages[sourceIndex];
    if (!image) continue;
    slots.push({
      slot: slots.length + 1,
      role: "product",
      label: `商品图${sourceIndex + 1}`,
      sourceIndex,
      name: image.name
    });
  }
  for (const sourceIndex of plan.referenceFileIndexes) {
    const image = referenceImages[sourceIndex];
    if (!image) continue;
    slots.push({
      slot: slots.length + 1,
      role: "reference",
      label: `参考图${sourceIndex + 1}`,
      sourceIndex,
      name: image.name
    });
  }
  return slots;
}

function imageSlotText(slots) {
  if (!slots.length) return "本屏没有可用图片附件，请根据文字描述生成，但必须保持商品真实性约束。";
  return slots.map((item) => (
    `图${item.slot}=${item.label}「${item.name}」`
  )).join("；");
}

function referenceStrategyText(plan, moduleSkill) {
  return `商品图 ${plan.productFileIndexes.length} / 参考图 ${plan.referenceFileIndexes.length} · ${moduleSkill.referenceNeed}`;
}

function buildGlobalLock({ input, platformSkill, industrySkill, analysis, productName, ratio, imageSize, lang, copywriting }) {
  return [
    `目标平台：${platformSkill.platform}${platformSkill.pageType}；输出语言：${lang}；比例：${ratio}；分辨率：${imageSize}。`,
    `目标商品：只以商品图里的「${productName}」为准，${BASE_SKILL.productAuthenticityLock.join(" ")}`,
    `行业识别：${analysis.industry}；重点观察：${industrySkill.analyzeAttributes.join("、")}。`,
    `受众：${analysis.targetAudience}；材质线索：${analysis.materialHints.join("、")}。`,
    `全局风格：${analysis.visualStyle}；${BASE_SKILL.globalStyleConsistency.join(" ")}`,
    `平台规则：${platformSkill.visualRule} ${platformSkill.copyRule}`,
    `文案规则：${copywritingText(copywriting)}；字体规则：${fontPolicy(input.fontStyle, copywriting)}；信息密度：${richnessPolicy(input.richness)}。`,
    `行业禁忌：${industrySkill.taboos.join("；")}。`
  ].join("\n");
}

function buildRounds(platformSkill, industrySkill, analysis, count, reverseScreens) {
  return [
    {
      stage: "通用底座",
      title: "真实性、格式、数量和编号",
      content: [
        BASE_SKILL.productAuthenticityLock.join("；"),
        `输出 JSON 字段：${BASE_SKILL.outputJsonFormat.requiredGroupFields.join("、")}；每屏字段：${BASE_SKILL.outputJsonFormat.requiredPromptFields.join("、")}。`,
        `分屏数量：${count}，允许范围 ${BASE_SKILL.screenCountRule.min}-${BASE_SKILL.screenCountRule.max}。`,
        BASE_SKILL.imageNumberRules.join("；"),
        BASE_SKILL.globalStyleConsistency.join("；")
      ].join("\n")
    },
    {
      stage: "行业 Skill",
      title: industrySkill.name,
      content: `分析属性：${industrySkill.analyzeAttributes.join("、")}。\n推荐卖点：${industrySkill.sellingAngles.join("、")}。\n行业禁忌：${industrySkill.taboos.join("、")}。`
    },
    {
      stage: "平台 Skill",
      title: `${platformSkill.platform}${platformSkill.pageType}`,
      content: `页面节奏：${platformSkill.rhythm.join(" -> ")}。\n文案风格：${platformSkill.copyRule}\n图片规范：${platformSkill.imageNorms.join("、")}。\n转化特点：${platformSkill.conversionTraits.join("、")}。`
    },
    {
      stage: "分屏模块库",
      title: `本组 ${count} 屏，反转屏 ${reverseScreens} 屏`,
      content: `可用模块：${Object.values(SCREEN_MODULES).map((module) => module.name).join("、")}。本组会按平台节奏、行业卖点和反转屏数量动态分配。`
    },
    {
      stage: "质检 Skill",
      title: "生成前后自查",
      content: `全局质检：${QUALITY_SKILL.globalChecks.join("；")}。\n负面约束：${QUALITY_SKILL.negativePrompt.join("、")}。\n规划模式：${analysis.limitation}`
    }
  ];
}

// S2-C / V2-ARCH：四层控制框架的"工程验证"辅助。
// 只证明数据贯通 / 行业包按需加载 / 任务准入拒绝 / 编译来源可追溯；不输出正式专业规则到提示词。
// 占位态（ChatGPT 专业内容未接入）下：loadedIndustryPackIds 恒空、任务恒 pending、审计恒 unauthorizedAdded=false。
function buildV2ControlReport(aiPlan, resolvedIndustryId) {
  const status = professionalContentStatus();
  const registry = createTaskRegistry();
  // 单一决策源工程验证：模型 industryProfile 行业为展示行业，运行时词表行业为规则行业，
  // 两者一致性作为可验证证据（不在此处改写 17 槽位文本，避免占位态固化临时规则）。
  const modelIndustryId = String(aiPlan?.industryProfile?.industryId || "").trim();
  const runtimeIndustryId = String(resolvedIndustryId || "generic").trim() || "generic";
  const industryId = modelIndustryId || runtimeIndustryId;
  const pack = loadIndustryPack(industryId);
  const confirmedFacts = (Array.isArray(aiPlan?.planning?.facts)
    ? aiPlan.planning.facts.filter((f) => f?.level === "visible").map((f) => String(f.claim || ""))
    : []);
  const admission = admitTasks([...registry.contentTasks, ...registry.visualTasks], {
    industryId: pack.activeIndustryId,
    confirmedFacts,
    factKeys: [],
    noIndustryPack: pack.loadedIndustryPackIds.length === 0
  });
  const audit = createCompilerAudit();
  // 四个契约顶层字段是否由模型产出——字段贯通的工程证据（不判断内容质量）。
  const fieldsPresent = {
    industryProfile: Boolean(aiPlan?.industryProfile),
    consumerInsights: Boolean(aiPlan?.consumerInsights),
    marketingStrategy: Boolean(aiPlan?.marketingStrategy),
    globalVisualDNA: Boolean(aiPlan?.globalVisualDNA)
  };
  return {
    controlStatus: "engineering_verification_only",
    professionalContentStatus: status.status,
    isPlaceholder: status.isPlaceholder,
    modelIndustryId,
    runtimeIndustryId,
    industrySingleSourceConsistent: modelIndustryId ? modelIndustryId === runtimeIndustryId : null,
    activeIndustryId: pack.activeIndustryId,
    loadedIndustryPackIds: pack.loadedIndustryPackIds,
    fallbackMode: pack.fallbackMode,
    fieldsPresent,
    admission,
    auditBase: audit.report({ plannedTaskIds: [], usedTaskIds: [] }),
    note: "工程验证报告，不代表专业模型质量验收通过；占位态不含正式专业内容。"
  };
}

// V2-PRO-003 缺陷修复：当前屏「人物任务信号」派生（纯函数、只传信号、不绕过契约）。
// 🔴 边界：只从用户明确要求与本屏任务语义派生正式键 screen_needs_figure / user_requires_figure /
//    explicit_figure_task；绝不凭商品行业、商品类型、modelMode 旧参数或历史旧键自动触发。
//    Middleware 只负责正确传递当前屏任务信号，是否激活仍由正式 Activation Contract 判断。
const FIGURE_POSITIVE_PATTERN = /(模特|真人|人物|人手|手部|手持|握持|穿着|佩戴|使用演示|操作演示|生活场景|使用场景|人物互动|人在使用|手持产品)/;
const FIGURE_NEGATIVE_PATTERN = /(不要人物|不出现人物|无人物|不使用模特|不要模特|纯静物|纯产品|仅商品|禁止人物|避免人物|无人像)/;

export function deriveFigureTaskContextKeys({ input = {}, aiScreen = null, moduleSkill = null, screenIndex = null, count = null } = {}) {
  const userText = String(input.userInstruction || input.userRequirement || "");
  const screenText = [
    aiScreen?.composition,
    aiScreen?.sellingPoint,
    aiScreen?.copywriting,
    aiScreen?.modelPolicyHint
    // V2-ADAPTIVE：不再把 moduleSkill.name/id 作为人物信号来源——模块是"分类标签"（如"使用场景"），
    // 不是本屏真实人物任务；把它计入会让 useScenario 分类名误触发 FIGURE_POSITIVE_PATTERN 的"使用场景"。
  ].filter(Boolean).map((v) => String(v)).join(" ");

  // 用户明确不要人物 → 最高优先，返回排除信号（不派生任何正向人物键）。
  if (FIGURE_NEGATIVE_PATTERN.test(userText)) return ["no_figure_requirement"];

  // V2-PRO-003 P0：用户通过 UI 明确选择「使用模特」时，这是一个明确的当前屏人物授权入口。
  // 🔴 必须按屏生效：只有 index < min(modelUsage,count) 的屏获得授权，其他屏不继承；
  //    且仅当调用方传入 screenIndex/count（真实分屏链路）时才启用，孤立探针不因此误触发。
  const hasScreenScope = Number.isInteger(screenIndex) && Number.isInteger(count);
  if (hasScreenScope) {
    const modelMode = String(input.modelMode || "no-model");
    const modelUsage = Math.max(1, Math.min(12, Number(input.modelUsage) || 4));
    const authorizedByUi = modelMode === "use-model" && screenIndex < Math.min(modelUsage, count);
    if (authorizedByUi) {
      // 用户已明确选择该屏使用模特（含特殊姿势）：派生正式人物信号，交契约判定。
      return ["screen_needs_figure", "user_requires_figure", "explicit_figure_task"];
    }
    // 用户选了模特但本屏未获授权 → 不继承人物任务（返回排除信号，防止文本弱命中越权触发）。
    if (modelMode === "use-model") return ["no_figure_requirement"];
  }

  // 正向依据只认两类：① 用户明确要求；② 当前屏任务语义本身需要人物/手部/生活场景。
  const userExplicit = FIGURE_POSITIVE_PATTERN.test(userText);
  const screenTaskNeeds = FIGURE_POSITIVE_PATTERN.test(screenText);
  if (!userExplicit && !screenTaskNeeds) return [];

  // 派生正式三键，交给 evaluateAllActivations 按正式契约判定（本函数不直接激活）。
  return ["screen_needs_figure", "user_requires_figure", "explicit_figure_task"];
}

// V2-PRO-003 缺陷修复：当前屏「结构专项任务信号」派生（纯函数、只传信号、不绕过契约）。
// 🔴 边界（Owner 裁决）：结构事实只能作为 specialty_evidence，不能单独代替专项触发条件；
//    本函数只派生「当前屏确实需要结构表达」的任务信号 structure_task_required，
//    归一化后命中六类专项共用的聚合 activation 键 specialty_condition_met；
//    绝不使用 reliable_effect_evidence（效果证据语义）作结构触发键，避免语义混淆。
//    是否触发仍由正式 Activation Contract 与 SKILL 07 六类独立定义决定。
const STRUCTURE_TASK_PATTERN = /(结构|组成|内部构造|部件关系|拆解|爆炸图|构造细节|接口|卡扣|泵头结构|设计细节)/;
const STRUCTURE_NO_TASK_PATTERN = /(不要结构|无需结构|不展示结构|纯静物|纯产品展示|仅包装|不需要拆解)/;

export function deriveStructureTaskContextKeys({ input = {}, aiScreen = null, moduleSkill = null } = {}) {
  const userText = String(input.userInstruction || input.userRequirement || "");
  const screenText = [
    aiScreen?.composition,
    aiScreen?.sellingPoint,
    aiScreen?.copywriting,
    aiScreen?.moduleId,
    moduleSkill?.name,
    moduleSkill?.id
  ].filter(Boolean).map((v) => String(v)).join(" ");

  // 用户明确不要结构展示 → 不派生结构任务信号。
  if (STRUCTURE_NO_TASK_PATTERN.test(userText)) return [];

  // 只认「当前屏明确的结构表达任务」：用户明确要求 或 本屏画面任务本身需要结构表达。
  const userExplicit = STRUCTURE_TASK_PATTERN.test(userText);
  const screenTaskNeeds = STRUCTURE_TASK_PATTERN.test(screenText);
  if (!userExplicit && !screenTaskNeeds) return [];

  // 任务信号键（非事实）；事实键 confirmed_structure_fact 由调用方单独派生为 specialty_evidence。
  return ["structure_task_required"];
}

// PRO-003 QC 主动触发纠偏：两个独立入口任一成立即返回统一信号 qc_requested（OR 语义）。
// 🔴 边界：QC 是独立可选能力——只在用户主动触发时派生；其他 Skill/系统自检/普通生成或修改请求
//    一律不派生；不绕过正式契约；不同时成立两次、不重复执行（返回单一键）。
// 入口① 用户点击独立 QC 按钮：显式入参 qcTrigger/runQC/qcRequested（不依赖自然语言）。
// 入口② 对话中用户明确要求质量审查：userInstruction/userRequirement 命中明确审查语义。
// QC 否定意图排除（2026-11-18 补修）：否定词必须紧邻 QC 动作词（中间只允许 做/进行/先/一次/一下 等连接），
// 避免误伤「不要修改，先帮我检查一下」——那里「不要」否定的是修改、不是 QC 本身。
const QC_NEGATION_PATTERN = /(?:不要|不用|不必|不需要|无需|别|请勿|暂不|先不|这次不|取消|不做|不再)(?:做|进行|执行|来|再|先)?(?:一次|一下)?(?:质量审查|质检|审查|检查.{0,4}详情|检查这套|检查当前屏|检查第[一二三四五六七八九十\d]+屏)/;
const QC_EXPLICIT_REQUEST_PATTERN = /(质量审查|质检|审查这套|审查详情|检查.{0,4}详情|检查当前屏|检查第[一二三四五六七八九十\d]+屏|审查第[一二三四五六七八九十\d]+屏|有没有问题|是否存在问题|检查.{0,12}画面是否合理|诊断.{0,12}详情|评估.{0,12}详情质量|找.{0,12}问题|帮我检查(一下)?(这套)?详情|先.{0,4}检查(一下)?(详情|这套)?)/;
const QC_PLAIN_EDIT_PATTERN = /^(把|改|将|请改|帮我改).*(文案|标题|卖点|颜色|构图|背景|图片|这一屏|第[一二三四五六七八九十\d]+屏)/;

export function deriveQCTaskContextKeys({ input = {} } = {}) {
  // 入口①：独立 QC 按钮点击（显式入参信号）——最高优先，不受自然语言否定排除影响。
  const buttonClicked = input.qcTrigger === "button" || input.runQC === true || input.qcRequested === true;
  // 入口②：用户明确审查请求；纯修改请求、明确拒绝QC（否定紧邻QC动作词）都不视为审查。
  const userText = String(input.userInstruction || input.userRequirement || "");
  const explicitRequest = QC_EXPLICIT_REQUEST_PATTERN.test(userText)
    && !QC_PLAIN_EDIT_PATTERN.test(userText)
    && !QC_NEGATION_PATTERN.test(userText);
  if (!buttonClicked && !explicitRequest) return [];
  // 两个入口同时成立也只返回一个统一键——Activation Contract 只判定一次、不重复执行。
  return ["qc_requested"];
}

// V2-AGENT-EXECUTION-CLOSURE P0：按屏条件指令的真实授权编译。
// 把当前屏的 Conditional 生成指令构造为带来源的 entries，经 compileWithAuthorization 按
// 【本屏 activeIds】过滤——未触发/未授权/QC(optional) 的指令不得进入最终生图 text。
// 🔴 Mandatory 不在此列（它们已由 17 槽位的全局/屏级文本承载，恒执行、不当条件指令过滤）；
//    QC 是 optional 且注入策略禁止进生图提示词，永不进入 kept。
const NON_INJECTABLE_SKILLS = new Set(["detail-quality-control"]);
function compileScreenConditionalInstructions({ activation = null, input = {}, index = 0, count = 1, aiScreen = null } = {}) {
  if (!activation) return { lines: [], trace: [], compiled: false };
  const activeSkillIds = new Set(activation.activeIds || []);
  const entries = [];
  // 唯一当前存在的屏级 Conditional 生成指令：人物与使用场景（正式ID figure-usage-scene / 引擎ID model-pose）。
  // 人物行沿用 modelPolicy（已按 index<modelUsage 授权）；此处只决定"授权通过时是否获得注入资格"。
  const modelLine = activeSkillIds.has("model-pose") && !NON_INJECTABLE_SKILLS.has("model-pose")
    ? `【模特与镜头】${aiScreen?.modelPolicyHint || modelPolicy(input, index, count)}`
    : "";
  if (modelLine) {
    entries.push({
      text: modelLine,
      sourceField: "screen.skill.figure-usage-scene",
      sourceTaskId: "model-pose",
      activationId: "figure-usage-scene"
    });
  }
  // 未触发的 Conditional 能力不构造 entry → 自然不会进入 kept；同时记录原因供追踪。
  const trace = [];
  const formalToEngine = { "figure-usage-scene": "model-pose", "product-specialty-expression": "product-structure" };
  for (const id of ["figure-usage-scene", "product-specialty-expression", "ecommerce-copy-layout"]) {
    const result = activation.results?.find((r) => r.id === id || r.id === formalToEngine[id]);
    const active = activeSkillIds.has(id) || activeSkillIds.has(formalToEngine[id]);
    const hasNewInstruction = entries.some((e) => e.activationId === id);
    // 文案策划的生成指令由既有【本屏文案】槽承载（17槽位之一），授权通过后不重复新增行。
    const carriedByExistingSlot = id === "ecommerce-copy-layout" && active;
    trace.push({
      skillId: id,
      screen: index + 1,
      decision: result?.decision || "inactive",
      activated: Boolean(active),
      authorized: Boolean(active),
      hasGenerationInstruction: hasNewInstruction || carriedByExistingSlot,
      injectedToPrompt: hasNewInstruction,
      carriedByExistingSlot,
      reason: active
        ? (carriedByExistingSlot ? "已授权；生成指令由既有【本屏文案】槽承载，不重复注入" : "已授权且经授权编译进入本屏提示词")
        : (result?.auditReason || "当前屏未满足触发条件")
    });
  }
  // QC optional：显式记录不进入生图 text 的原因（内部审查层隔离）。
  trace.push({
    skillId: "detail-quality-control",
    screen: index + 1,
    decision: activation.results?.find((r) => r.id === "detail-quality-control")?.decision || "inactive",
    activated: activeSkillIds.has("detail-quality-control"),
    hasGenerationInstruction: false,
    injectedToPrompt: false,
    reason: "optional 且 prompt_injection_policy 禁止审查清单进入生图提示词；仅走内部审查层"
  });
  const admitted = [...activeSkillIds].filter((id) => !NON_INJECTABLE_SKILLS.has(id));
  const compiled = compileWithAuthorization(entries, admitted);
  return { lines: compiled.kept.map((entry) => entry.text), trace, compiled, dropped: compiled.dropped };
}

function buildDetailPromptGroup(input = {}, files = [], options = {}) {
  const count = clamp(input.count, BASE_SKILL.screenCountRule.min, BASE_SKILL.screenCountRule.max, DEFAULT_COUNT);
  // V2-COUNT-MODE：内部屏数模式。仅当调用方显式传 countMode:"auto" 时进入自动规划；
  // 旧请求/未传字段一律 fixed（沿用原固定屏数语义，避免影响旧调用方）。
  const countMode = input.countMode === "auto" ? "auto" : "fixed";
  const workflow = String(input.workflow || "taobao-detail").trim();
  const platformSkill = getPlatformSkill(workflow);
  const skillVersion = resolveDetailSkillVersion(input);
  const rawStyleDecision = skillVersion === "v2"
    ? stylePackForGroup({ groupIndex: input.detailGroupIndex, platformSkill, userChoice: input.stylePackId })
    : null;
  const styleDecision = rawStyleDecision && rawStyleDecision.pack ? rawStyleDecision : null;
  const productFiles = files.filter((file) => file.detailRole === "product");
  const referenceFiles = files.filter((file) => file.detailRole === "reference");
  const productImages = assetsFromInput(input.productImages, productFiles, "product");
  const referenceImages = assetsFromInput(input.referenceImages, referenceFiles, "reference");
  const aiPlan = options.aiPlan || null;
  const industrySkill = aiPlan ? aiIndustry(input, productImages, aiPlan) : inferIndustry(input, productImages);
  const localAnalysis = buildProductAnalysis(input, productImages, referenceImages, industrySkill, platformSkill);
  const analysis = mergeAiAnalysis(localAnalysis, aiPlan, options.aiMeta, options.aiError);
  // V2-PRO-003 P0-1：结构化事实 + 规划完整性判据。
  // v2Planning 仅在 selectedSections 空选时为真；若此时 AI 规划失败且无结构化本地资料，
  // 不得把空数据当正常规划继续编译——返回明确失败标记、停止分屏编译，不静默生成空洞详情。
  const structuredFacts = parseStructuredFacts(input.productFeature);
  // 已确认事实集：用户结构化资料 + AI 规划 visible 事实——用于卖点边界豁免（用户明确提供的适用范围不算扩展）。
  const confirmedFactsForBoundary = [
    ...structuredFacts.map((fact) => fact.content),
    ...(Array.isArray(aiPlan?.planning?.facts) ? aiPlan.planning.facts.filter((f) => f?.level === "visible").map((f) => String(f.claim || "")) : [])
  ];
  const userSellingPoints = parseList(input.sellingPoints); // 只认用户明确提供的卖点，不认行业 sellingAngles 兜底
  const selectedSectionsEarly = Array.isArray(input.selectedSections) && input.selectedSections.length > 0 ? input.selectedSections : null;
  const v2PlanningEarly = selectedSectionsEarly === null;
  const planningIntegrity = checkPlanningIntegrity({
    v2Planning: v2PlanningEarly,
    aiPlan,
    structuredFacts,
    sellingPoints: userSellingPoints,
    rawProductFeature: input.productFeature
  });
  const productName = String(input.productName || "").trim() || "目标产品";
  const ratio = String(input.ratio || "21:9").trim();
  const imageSize = String(input.imageSize || "2K").trim();
  const model = String(input.model || "gpt-image").trim();
  const lang = String(input.lang || "中文").trim() || "中文";
  const copywriting = String(input.copywriting || "need") === "none" ? "poster" : String(input.copywriting || "need");
  const reverseScreens = clamp(input.reverseScreens, 0, 4, 0);
  const sellingList = analysis.sellingPoints.length > 0 ? analysis.sellingPoints : industrySkill.sellingAngles;
  // V214 P1：客户可选内容板块。空选时为 null，所有条件分支不触发，输出与改造前逐字节一致。
  const selectedSections = Array.isArray(input.selectedSections) && input.selectedSections.length > 0
    ? input.selectedSections
    : null;
  const aiScreens = normalizeAiScreens(aiPlan, count, productImages.length, referenceImages.length);
  // R1（Owner A 裁决）：无板块 AI 自主规划为默认能力，不再以 styleDecision/V2 风格包为门控。
  // 仅以 selectedSections === null 判定空选——默认 v1/auto 请求也走规划分支，标题由 AI screenRoles/title
  // 驱动；首屏确定性绑定 hero 角色但不写死标题文字；AI 缺屏/失败走最小占位，绝不回退 seedTitles[index%len]。
  // 逐字节一致口径已收窄为兼容路径（§16.2）；styleDecision 仅继续用于 17 槽位风格锁，不再参与规划门控。
  const v2Planning = selectedSections === null;
  // P0-1 fail-fast：规划态启用但 AI 规划失败且本地无结构化资料时，停止分屏编译。
  // 不硬编码四屏模板/固定卖点列表掩盖失败；明确返回 planningError 供上层提示用户。
  if (!planningIntegrity.ok) {
    return {
      prompts: [],
      count,
      params: { ...(input || {}), count, detailSkillVersion: "v2" },
      analysis,
      planningIntegrity,
      planningError: planningIntegrity.reason,
      v2Control: { controlStatus: "planning_failed", reason: planningIntegrity.reason, fieldsPresent: {} },
      note: "规划失败：未生成分屏提示词。请补充商品资料或重试 AI 规划。"
    };
  }
  let screenTitles;
  // R1：首屏确定性 hero 角色（仅规划态）。标题文字仍由 AI title/screenRoles 驱动，绝不写死；
  // 模型 planning.screenRoles 的 sectionRefs 供下方 moduleSkill 优先级使用（§5.2 落点 4）。
  const planningScreenRoles = v2Planning
    ? Array.from({ length: count }, (_, i) => {
        const fromModel = Array.isArray(aiPlan?.planning?.screenRoles)
          ? aiPlan.planning.screenRoles.find((role) => Number(role?.index) === i)
          : null;
        return {
          index: i,
          role: i === 0 ? "hero" : String(fromModel?.role || aiScreens[i]?.role || "content"),
          sectionRefs: Array.isArray(fromModel?.sectionRefs) ? fromModel.sectionRefs : []
        };
      })
    : [];
  if (v2Planning) {
    screenTitles = aiScreens.length > 0
      ? aiScreens.map((screen, screenIndex) => String(screen.title || "").trim() || `第${screenIndex + 1}屏`)
      : Array.from({ length: count }, (_, i) => `第${i + 1}屏`);
  } else {
    // 旧路径（V2 未启用 / 已选板块）：保持 S0 逐字节一致。
    const fallbackScreenTitles = buildScreenTitles(count, platformSkill, industrySkill, reverseScreens);
    const fallbackWithSections = selectedSections
      ? fallbackScreenTitles.map((title, sectionIndex) => {
          const section = selectedSections[sectionIndex % selectedSections.length];
          return String(section?.label || "").trim() || title;
        })
      : fallbackScreenTitles;
    screenTitles = aiScreens.length > 0
      ? aiScreens.map((screen, screenIndex) => screen.title || SCREEN_MODULES[screen.moduleId]?.name || fallbackWithSections[screenIndex])
      : fallbackWithSections;
  }
  const createdAt = Date.now();

  const globalLock = buildGlobalLock({
    input,
    platformSkill,
    industrySkill,
    analysis,
    productName,
    ratio,
    imageSize,
    lang,
    copywriting
  });

  // P1：无 AI 规划时用结构化事实分组的屏级任务，使用方法等完整任务不拆碎。
  const localScreenTasks = (v2Planning && !aiPlan) ? buildLocalScreenTasks(structuredFacts, userSellingPoints, count, productName) : [];
  const prompts = screenTitles.map((title, index) => {
    const aiScreen = aiScreens[index] || null;
    const localTask = localScreenTasks[index] || null;
    // V214 P1：客户板块按屏循环复用，仅作模块归类兜底；AI 已给 moduleId 时以 AI 为准。
    const activeSection = selectedSections ? selectedSections[index % selectedSections.length] : null;
    // R1（§5.2 落点 4）：规划态归类优先级 = 首屏 hero 确定性绑定 > AI moduleId > sectionRefs > 客户板块 > getScreenModule。
    // 有板块路径（selectedSections 非 null）完全沿用旧优先级，保证兼容路径逐字节一致。
    const planningRole = v2Planning ? planningScreenRoles[index] : null;
    const sectionRefModule = planningRole
      ? (planningRole.sectionRefs || []).map((ref) => SCREEN_MODULES[String(ref).trim()]
          || Object.values(SCREEN_MODULES).find((module) => module.id === String(ref).trim() || module.name === String(ref).trim())).find(Boolean)
      : null;
    // V2-ADAPTIVE：本地兜底时按本屏真实任务选模块，消除"第2-7屏全叫核心卖点"的分类错位。
    const localModule = localTask ? SCREEN_MODULES[moduleForLocalTask(localTask.taskCategory, index, count)] : null;
    const moduleSkill = (v2Planning && index === 0)
      ? SCREEN_MODULES.hero
      : SCREEN_MODULES[aiScreen?.moduleId]
        || Object.values(SCREEN_MODULES).find((module) => module.name === aiScreen?.moduleId)
        || sectionRefModule
        || (activeSection && SCREEN_MODULES[activeSection.moduleId])
        || localModule
        || getScreenModule(aiScreen?.title || title, index, count);
    const mainFirstScreen = platformSkill.pageType === "主图" && index === 0;
    const screenPack = styleDecision ? (mainFirstScreen ? STYLE_PACKS.S1 : styleDecision.pack) : null;
    const variant = screenPack ? variantFor(moduleSkill.id, index, screenPack, input.detailGroupIndex, aiScreen?.compositionVariantId) : null;
    // V2-ADAPTIVE：本地兜底屏的"空屏"判定——无本屏任务且无未消费事实，不得进入正式生图编译。
    let isEmptyLocalScreen = false;
    let screenFacts = confirmedFactsForBoundary; // 默认全量（AI规划路径/有aiScreen时不改）
    let sellingSource = "";
    if (aiScreen?.sellingPoint || aiScreen?.summary) {
      sellingSource = aiScreen.sellingPoint || aiScreen.summary;
    } else if (localTask) {
      sellingSource = localTask.sellingPoint;
      // 屏级事实：只取本屏 sellingPoint 命中的事实，避免全量事实重复注入画面任务。
      screenFacts = structuredFacts.filter((fact) => sellingSource.includes(fact.content)).map((fact) => fact.content);
    } else if (localScreenTasks.length && structuredFacts.length) {
      const usedText = localScreenTasks.map((task) => task.sellingPoint).join(" ");
      const leftover = structuredFacts.filter((fact) => !usedText.includes(fact.content));
      if (leftover.length) {
        sellingSource = `补充信息：${leftover.map((fact) => `${fact.label}：${fact.content}`).join("；")}`;
      } else {
        // 无新增独立信息 → 标记空屏，不再编译完整提示词、不注入任何事实。
        isEmptyLocalScreen = true;
        sellingSource = "";
      }
    } else {
      sellingSource = sellingList[index % sellingList.length] || moduleSkill.name;
    }
    const selling = sellingSource;
    // V2-PRO-002：卖点进提示词前做事实边界校验（消费正式配置的禁止泛化规则）。
    // 命中未确认扩展（奶渍/蛋白类/所有材质等）时不注入原卖点，改用保守表达并记入控制报告。
    const sellingBoundary = v2Planning
      ? checkSellingPointBoundary(selling, industrySkill.id, activeConfig(), confirmedFactsForBoundary)
      : { allowed: true, reason: "legacy_path", hits: [] };
    const sellingForPrompt = sellingBoundary.allowed
      ? selling
      // P0-3：不再用通用空话兜底——被拦截时改用本屏已确认事实的具体表达，无事实则不注入（P0-1 已挡无资料场景）。
      : (confirmedFactsForBoundary.length
          ? `本屏仅表达已确认事实：${confirmedFactsForBoundary.slice(0, 3).join("、")}；不扩展未确认的污渍、材质、适用范围或功效。`
          : "仅呈现商品图可直接确认的信息，不扩展未经确认的事实。");
    // V2-PRO-003 第七节：视觉方案缺失不回退固定模板——用本屏任务+已确认事实+视觉DNA 组装。
    const screenVisual = (v2Planning && !isEmptyLocalScreen)
      ? buildScreenVisual({
          moduleName: moduleSkill.name,
          contentTask: String(sellingForPrompt || "").slice(0, 60),
          composition: aiScreen?.composition || localTask?.compositionHint || "",
          // 屏级事实：本地兜底只用本屏命中的事实；AI路径仍用规划的visible事实。不再全量注入。
          confirmedFacts: [
            ...(Array.isArray(aiPlan?.planning?.facts) ? aiPlan.planning.facts.filter((f) => f?.level === "visible").map((f) => String(f.claim || "")) : []),
            ...screenFacts
          ],
          visualDNA: aiPlan?.globalVisualDNA || (analysis.visualStyle ? { tone: analysis.visualStyle } : {})
        })
      : null;
    const visualForPrompt = isEmptyLocalScreen
      ? "本屏无新增独立信息，已标记为不生成；不应进入正式详情提示词。"
      : v2Planning
      ? (screenVisual ? screenVisual.text : "本屏视觉策划缺失：仅保持商品真实结构与清晰呈现，不套用固定模板，不引入未授权元素。")
      : (aiScreen?.composition || moduleSkill.composition);
    const rulePlan = referencePlanForScreen(index, count, productImages, referenceImages, moduleSkill);
    const plan = aiScreen
      ? {
          productFileIndexes: aiScreen.productFileIndexes.length > 0 ? aiScreen.productFileIndexes : rulePlan.productFileIndexes,
          referenceFileIndexes: aiScreen.referenceFileIndexes
        }
      : rulePlan;
    if (plan.productFileIndexes.length === 0 && productImages.length > 0) plan.productFileIndexes = [0];
    const imageSlots = buildImageSlots(productImages, referenceImages, plan);

    // V2-PRO-002：本屏 Skill 触发上下文（仅规划态生效；旧路径不触发、逐字节兼容）。
    // contextKeys 由当前产品事实/行业/用户要求推导，不预置任何"默认激活"能力。
    const triggerCtxKeys = [];
    if (v2Planning) {
      const facts = Array.isArray(aiPlan?.planning?.facts) ? aiPlan.planning.facts : [];
      const visibleFacts = facts.filter((f) => f?.level === "visible").map((f) => String(f.claim || ""));
      facts.forEach((f) => triggerCtxKeys.push(`fact_${f?.level || "unknown"}`));
      visibleFacts.forEach((claim) => triggerCtxKeys.push(`visible:${claim}`));
      triggerCtxKeys.push(`industry_${industrySkill.id}`);
      // V2-PRO-003 缺陷修复：人物任务信号只由当前屏任务语义派生（用户明确要求 / 本屏任务需要），
      // 不凭行业、商品类型或 modelMode 旧参数自动触发；是否激活仍由正式 Activation Contract 判断。
      triggerCtxKeys.push(...deriveFigureTaskContextKeys({ input, aiScreen, moduleSkill, screenIndex: index, count }));
      // V2-PRO-003 结构专项修复：结构事实仍只作 specialty_evidence；结构"任务信号"单独派生
      // （当前屏确实需要结构表达时才派生 specialty_condition_met），不用效果证据键冒充结构触发。
      triggerCtxKeys.push(...deriveStructureTaskContextKeys({ input, aiScreen, moduleSkill }));
      // PRO-003 QC纠偏：只由两个主动入口派生统一 qc_requested 信号（OR）；其他能力/系统自检不派生。
      triggerCtxKeys.push(...deriveQCTaskContextKeys({ input }));
      // V2-AGENT-EXECUTION-CLOSURE：文案策划（SKILL05）按屏任务信号——本屏确有文案产出需求时派生，
      // 仅在 aiScreen.copywriting/文案任务存在时触发，不凭行业或整套设置扩散到其他屏。
      const screenHasCopyTask = Boolean(String(aiScreen?.copywriting || "").trim())
        || /(标题|文案|卖点短语|广告语)/.test(String(aiScreen?.composition || input.userInstruction || ""));
      if (screenHasCopyTask) triggerCtxKeys.push("screen_needs_text", "screen_content_task");
      if (visibleFacts.some((c) => /结构|泵头|喷头|卡扣/.test(c))) triggerCtxKeys.push("confirmed_structure_fact");
      if (facts.some((f) => f?.level === "visible" && /效果|去除率|测试/.test(String(f.claim || "")))) {
        triggerCtxKeys.push("reliable_effect_evidence", "effect_evidence");
      }
    }
    const activation = v2Planning ? evaluateAllActivations({ contextKeys: triggerCtxKeys }) : null;
    const activeSkillIds = new Set(activation?.activeIds || []);
    // P0：按屏授权编译——activeIds 经 compileWithAuthorization 真实决定条件指令能否进入本屏 text。
    const conditionalCompilation = compileScreenConditionalInstructions({ activation, input, index, count, aiScreen });
    const authorizedModelLine = conditionalCompilation.lines.find((line) => line.startsWith("【模特与镜头】")) || "";

    const qualityChecklist = uniqueList([
      ...buildQualityChecklist(platformSkill, industrySkill, moduleSkill),
      ...(aiScreen?.qualityChecks || [])
    ]);
    const promptDirectives = uniqueList([
      // P1：本地兜底时以本屏结构化任务的具体指令优先，避免 SCREEN_MODULES 固定句覆盖屏级规划。
      ...(localTask && sellingForPrompt ? [`本屏内容任务：${sellingForPrompt}`] : []),
      ...moduleSkill.promptDirectives,
      ...(aiScreen?.promptDirectives || [])
    ]);
    const negativeConstraints = uniqueList([
      ...QUALITY_SKILL.negativePrompt,
      ...(aiScreen?.negativeConstraints || [])
    ]);
    // V2-PRO-002 / F-1：材质事实按 L1/L2/L3 分级——L3(mustNotClaim) 不进"真实材质/颜色"，
    // L2(inferred) 只作图片观察标注；避免把使用对象材质（棉）误写成商品包装材质。
    const gradedVisible = (Array.isArray(aiPlan?.planning?.facts) ? aiPlan.planning.facts : [])
      .filter((f) => f?.level === "visible" && /材质|棉|化纤|混纺|颜色|瓶身|泵头/.test(String(f.claim || "")))
      .map((f) => String(f.claim || ""));
    const materialText = v2Planning
      ? (gradedVisible.length > 0 ? gradedVisible.slice(0, 8).join("、") : "以商品图为准确认，未确认材质不作断言")
      : ([...(analysis.materialHints || []), ...(analysis.colors || [])].slice(0, 8).join("、") || "以商品图为准");
    const aiInsight = aiPlan
      ? `【AI商品洞察】目标人群：${analysis.targetAudience}；真实材质/颜色：${materialText}；结构锁定：${(analysis.productLocks || []).slice(0, 6).join("、") || "保持商品图真实结构"}。`
      : "";
    const styleLockLine = screenPack
      ? (mainFirstScreen
          ? `【视觉风格锁】本屏为主图首屏安全款 S1《白底极简》：${STYLE_PACKS.S1.lockLine}；本组其余屏统一使用 ${styleDecision.pack.id}《${styleDecision.pack.name}》：${styleDecision.pack.lockLine}。`
          : `【视觉风格锁】本组锁定 ${screenPack.id}《${screenPack.name}》：${screenPack.lockLine}；全组所有屏保持同一色温、布光方向、背景质感与字体层级，禁止漂移。`)
      : "";
    const variantLine = variant
      ? `【构图变体】${variant.id}《${variant.name}》：${variant.composition}；第一落点：${variant.firstLook}；视线动线：${variant.eyeFlow}；文案安全区：${variant.textSafeZone}；禁忌：${variant.avoid}。`
      : "";
    const text = [
      `第${index + 1}屏：${title}`,
      `【本屏模块】${moduleSkill.name}：${moduleSkill.purpose}`,
      activeSection
        ? `【客户指定内容板块】第${activeSection.order || index + 1}优先方向：${activeSection.label}（${activeSection.moduleId}${activeSection.isCustom ? "，客户自定义" : ""}）。请围绕该方向组织本屏内容，但不得虚构商品事实。`
        : "",
      aiInsight,
      `【本次图片编号】${imageSlotText(imageSlots)}。生成时严格按此编号理解图片，禁止引用未列入本屏的其它素材。`,
      `【全局一致性锁定】${globalLock}`,
      styleLockLine,
      `【本屏卖点】${sellingForPrompt}`,
      aiScreen?.copywriting ? `【本屏文案】${aiScreen.copywriting}` : "",
      `【画面任务】${visualForPrompt}`,
      variantLine,
      `【模块指令】${promptDirectives.join("；")}。`,
      `【参考图使用】${aiScreen?.referenceReason || moduleSkill.referenceNeed}；参考图只吸收允许的场景、构图、配色或版式，不复制品牌、水印、人物身份和无关商品。`,
      // V2-AGENT-EXECUTION-CLOSURE：模特指令必须经 compileWithAuthorization 授权编译；
      // 未授权屏保留明确禁人物/手部约束（不无条件禁手——授权屏走 modelPolicy 特殊姿势）。
      authorizedModelLine
        || `【模特与镜头】本屏无模特，禁止出现真人、人体局部、手持穿着或模特影子。画面主体为商品与使用对象。`,
      screenPack
        ? `【构图与光线】${[screenPack.lighting, variant?.lighting].filter(Boolean).join("；")}；${V2_LIGHT_TAIL}`
        : `【构图与光线】${V1_LIGHT_LINE}`,
      // V2-PRO-002：质检清单内部化——全文保留在 qualityChecklist 数据层供审计，
      // 生图提示词只保留影响画面的精简约束，不注入整份清单。
      `【画面自检】商品与标签保持原样、文案清晰可读、不出现与当前任务无关的元素。`,
      `【负面约束】${negativeConstraints.join("、")}。`
    ].filter(Boolean).join("\n");

    return {
      screen: index + 1,
      title,
      summary: selling,
      intervention: aiPlan
        ? (index === 0 ? "AI视觉定调" : index === count - 1 ? "AI收尾质检" : `AI ${moduleSkill.name}`)
        : (index === 0 ? "通用底座定调" : index === count - 1 ? "收尾转化质检" : `${moduleSkill.name}介入`),
      referenceStrategy: referenceStrategyText(plan, moduleSkill),
      productFileIndexes: plan.productFileIndexes,
      referenceFileIndexes: plan.referenceFileIndexes,
      imageSlots,
      // P2 附件审计：本屏"提示词声明"的图片角色映射。注意这是编译层声明，
      // 不是模型实际收到的附件——实际附件由前端 generateDetailPrompt 选图后提交，
      // 需与 referenceMeta 日志对照才能确认二者一致（不在此反推模型实际收到什么）。
      attachmentAudit: {
        declaredSlots: imageSlots.map((slot) => ({ slot: slot.slot, role: slot.role, label: slot.label, sourceIndex: slot.sourceIndex })),
        declaredProductCount: plan.productFileIndexes.length,
        declaredReferenceCount: plan.referenceFileIndexes.length,
        note: "编译层声明；模型实际附件以生成请求日志为准"
      },
      moduleKey: moduleSkill.id,
      moduleName: moduleSkill.name,
      qualityChecklist,
      aiScreen: aiScreen ? {
        referenceReason: aiScreen.referenceReason,
        copywriting: aiScreen.copywriting,
        composition: aiScreen.composition
      } : null,
      analysisMode: analysis.mode,
      // V2-ADAPTIVE：本地兜底空屏标记——无新增独立信息，不应进入正式生图；前端可据此跳过。
      isEmptyScreen: isEmptyLocalScreen,
      shouldGenerate: !isEmptyLocalScreen,
      text,
      // V2-PRO-002：按需触发/事实边界/编译分层的工程审计证据（不进生图提示词）。
      ...(v2Planning ? {
        skillActivation: activation,
        // P0 授权追踪：每条条件指令的来源Skill/屏/激活依据/授权结果/是否进入提示词。
        authorizationTrace: conditionalCompilation.trace,
        authorizationDropped: conditionalCompilation.dropped,
        sellingBoundary,
        screenVisual,
        promptLayers: assemblePromptLayers({
          globalLines: [globalLock],
          screenLines: [`【本屏卖点】${sellingForPrompt}`, `【画面任务】${visualForPrompt}`],
          conditionalLines: conditionalCompilation.lines,
          internalAudit: qualityChecklist
        })
      } : {}),
      enabled: true,
      status: "pending",
      generationMs: null,
      results: []
    };
  });

  const rounds = styleDecision
    ? [...buildRounds(platformSkill, industrySkill, analysis, count, reverseScreens), buildStylePackRound(styleDecision)]
    : buildRounds(platformSkill, industrySkill, analysis, count, reverseScreens);

  // V2-COUNT-MODE：auto 模式返回实际有效屏集合（不含空屏）；fixed 模式保留 count 数组契约。
  // 保留每屏原 screen 号（不重排），确保 text 标题、imageSlots、结果与单屏定位一致、不错位。
  const finalPrompts = countMode === "auto"
    ? prompts.filter((prompt) => prompt.shouldGenerate !== false && !prompt.isEmptyScreen)
    : prompts;
  // 真正可获得生成结果的屏数（fixed 模式数组长度=count，但空屏不生成，需单独统计）。
  const effectiveScreenCount = prompts.filter((prompt) => prompt.shouldGenerate !== false && !prompt.isEmptyScreen).length;
  // S2-C / V2-ARCH：工程验证控制报告。占位态不注入任何正式专业规则到 17 槽位文本，
  // 仅把"字段是否贯通 / 行业包是否按需加载 / 任务是否可准入拒绝 / 审计基线"作为可验证证据挂在 group 上。
  // 🔴 这是工程验证，不代表专业模型质量验收通过；专业内容由 ChatGPT 交付后另行接入与验收。
  const v2Control = v2Planning ? buildV2ControlReport(aiPlan, industrySkill.id) : null;

  return {
    id: `detail_${createdAt}_${Math.random().toString(36).slice(2, 8)}`,
    label: `${new Date(createdAt).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })} | ${productName}`,
    createdAt,
    status: "confirming",
    params: {
      workflow,
      platform: platformSkill.platform,
      pageType: platformSkill.pageType,
      model,
      ratio,
      imageSize,
      count,
      // V2-COUNT-MODE：模式与实际有效屏数，供前端进度统计与冲突提示使用。
      countMode,
      effectiveScreenCount,
      lang,
      copywriting,
      richness: String(input.richness || "simple"),
      fontStyle: String(input.fontStyle || "soft"),
      modelMode: String(input.modelMode || "no-model"),
      modelPose: String(input.modelPose || "regular"),
      modelUsage: clamp(input.modelUsage, 1, 12, 4),
      reverseScreens,
      analysisMode: analysis.mode,
      industry: analysis.industry,
      productName,
      productImageNames: productImages.map((item) => item.name).filter(Boolean),
      referenceImageNames: referenceImages.map((item) => item.name).filter(Boolean),
      ...(styleDecision ? { detailSkillVersion: "v2", stylePackId: styleDecision.pack.id } : {})
    },
    analysis,
    // V2-ADAPTIVE：内容不足以支撑指定屏数时明确标记冲突，不静默保留空屏。
    ...(v2Planning && !aiPlan && countMode === "fixed" && prompts.some((p) => p.isEmptyScreen)
      ? {
          planningConflict: {
            type: "insufficient_content_for_requested_screens",
            countMode,
            requestedScreens: count,
            independentTasks: localScreenTasks.length,
            effectiveScreens: effectiveScreenCount,
            skippedScreens: prompts.filter((p) => p.isEmptyScreen).map((p) => p.screen || p.index),
            hasInsufficientContent: true,
            hasTechnicalLimitConflict: false,
            message: `您指定了 ${count} 屏，目前商品资料只能支持 ${effectiveScreenCount} 项独立内容任务；其余 ${count - effectiveScreenCount} 屏缺少独立内容依据，已跳过不生成。可补充商品资料、调整屏数，或由 AI 规划补充有依据的内容。`
          }
        }
      : {}),
    ...(v2Control ? { v2Control } : {}),
    ...(styleDecision ? {
      skillVersion: "v2",
      stylePack: {
        id: styleDecision.pack.id,
        name: styleDecision.pack.name,
        reason: styleDecision.reason,
        groupIndex: styleDecision.groupIndex
      }
    } : {}),
    skillLayers: {
      base: BASE_SKILL,
      industry: industrySkill,
      platform: platformSkill,
      modules: finalPrompts.map((prompt) => ({
        screen: prompt.screen,
        moduleKey: prompt.moduleKey,
        moduleName: prompt.moduleName,
        title: prompt.title
      })),
      quality: QUALITY_SKILL
    },
    rounds,
    prompts: finalPrompts
  };
}

export {
  buildDetailPromptGroup,
  BASE_SKILL,
  INDUSTRY_SKILLS,
  PLATFORM_SKILLS,
  QUALITY_SKILL
};
