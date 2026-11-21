// 一键详情 V2 四层控制框架 · 工程机制层（阶段 C/D/E 骨架）
// 职责：注册表结构 / 行业包加载接口 / 任务准入接口 / 编译器授权与审计接口 / 专业内容接入机制。
// 🔴 边界：本模块只实现工程机制，不含任何正式专业规则。
//    所有专业内容（8 Skill 职责、任务专业值、行业正文、质量标准）由 ChatGPT 交付；
//    未接入前一律用 config/pending-professional-content.json 的占位（status=pending_professional_content），
//    且占位状态不得被当作正式规则固化，也不得据本模块判定专业模型质量通过。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PENDING_CONFIG_REL = "server/detail-v2-control/config/pending-professional-content.json";
const PROFESSIONAL_CONFIG_REL = "server/detail-v2-control/config/professional-content-v1.json";

// 准入四态（裁决 D-PLAN-14-02）——与事实三级独立，不得混用。
export const ADMISSION = Object.freeze({
  ADMITTED: "admitted",
  REJECTED: "rejected",
  PENDING: "pending",
  GENERIC_FALLBACK: "generic_fallback"
});

// 事实三级 → 运行时三级枚举（适配层，不改 V219 收窄决策的运行时枚举值）。
// L1 已确认 / L2 有限依据 / L3 未确认；运行时 visible / inferred / mustNotClaim。
export const FACT_LEVEL = Object.freeze({
  L1: "visible",
  L2: "inferred",
  L3: "mustNotClaim"
});

// 阶段 B · ProductBrief 事实信息类别（工程契约，不含专业内容）。
// 用途：把事实来源与"能否当作商品自身事实"显式化——只有 product-confirmed 可作为商品事实消费，
// industry-knowledge / ai-inference / competitor / user-review 一律不得冒充商品事实进入确定性卖点/边界豁免。
export const FACT_CATEGORY = Object.freeze({
  PRODUCT_CONFIRMED: "product-confirmed",   // 用户提供或商品图/可靠资料确证
  INDUSTRY_KNOWLEDGE: "industry-knowledge", // 行业通用知识
  COMPETITOR: "competitor",                 // 竞品公开信息
  USER_REVIEW: "user-review",               // 有来源的真实用户评价
  AI_INFERENCE: "ai-inference",             // AI 推断
  UNCLASSIFIED: "unclassified"              // B-补充：新版事实缺 category/category 无效时的兜底类别，不得视为商品事实
});
const FACT_CATEGORY_VALUES = new Set(Object.values(FACT_CATEGORY));
// 只有 product-confirmed 可作为商品事实进入 visible 消费；其余最多 inferred。
const PRODUCT_FACT_CATEGORIES = new Set([FACT_CATEGORY.PRODUCT_CONFIRMED]);
// B-补充：事实来源类型（至少区分用户输入/商品图可见/外部资料/AI推断）。
export const FACT_SOURCE_TYPE = Object.freeze({
  USER_INPUT: "user-input",           // 用户资料/明确指令
  PRODUCT_IMAGE: "product-image",     // 商品图可见信息
  EXTERNAL_SOURCE: "external-source", // 有出处的外部资料
  AI_INFERENCE: "ai-inference"        // AI 推断（不可作已确认事实）
});
const FACT_SOURCE_VALUES = new Set(Object.values(FACT_SOURCE_TYPE));
// 能支撑"已确认商品事实"的来源类型：用户输入 / 商品图可见 / 有出处外部资料；AI 推断不能。
const CONFIRMABLE_SOURCE_TYPES = new Set([FACT_SOURCE_TYPE.USER_INPUT, FACT_SOURCE_TYPE.PRODUCT_IMAGE, FACT_SOURCE_TYPE.EXTERNAL_SOURCE]);
// B-补充：新版规划结果 schema 标记（>= 此版本启用严格事实分类；旧版无此标记走历史兼容）。
export const PRODUCT_FACT_SCHEMA_VERSION = "2.0";

function readPendingConfig() {
  try {
    return JSON.parse(readFileSync(path.join(HERE, "config", "pending-professional-content.json"), "utf8"));
  } catch {
    return null;
  }
}

// 正式专业内容配置（ChatGPT 交付后接入）。存在且 status=professional_content 时优先使用。
function readProfessionalConfig() {
  try {
    const cfg = JSON.parse(readFileSync(path.join(HERE, "config", "professional-content-v1.json"), "utf8"));
    return cfg?.status === "professional_content" && cfg?.isPlaceholder === false ? cfg : null;
  } catch {
    return null;
  }
}

// 阶段 B · RequestContract：前端基础参数契约（工程语义层，不含专业规则）。
// 每项定义：语义 / 默认值 / 用户明确选择标志 / 适用范围 / 在七层闭环中的作用点。
// 🔴 原则：复用现有字段，不新增字段、不重复建设；语义在此集中定义，运行时行为改造留待后续阶段。
// 特别约定（顾问阶段 B 范围）：
//   - modelUsage 的语义是"整套详情计划安排模特内容屏数的目标"，不是"从第 1 屏起的前 N 屏授权"；
//     targetModelScreens 只是该语义的别名标注，具体屏位分配属于阶段 C，本契约不改 modelPolicy 运行时。
//   - reverseScreens 保留 painReverse 痛点反转原功能，本契约只保证其进入 V2 规划输入，分屏任务组织属于阶段 C。
//   - copywriting 仅明确 need / none 语义；逐屏 ScreenPlan 的实现与消费属于阶段 C。
export const DETAIL_REQUEST_CONTRACT = Object.freeze({
  workflow: { semantic: "详情页工作流/平台策略", defaultValue: "taobao-detail", appliesTo: ["planning", "compile"], scope: "strategy" },
  analysisMode: { semantic: "是否调用 AI 规划", defaultValue: "ai", appliesTo: ["planning"], scope: "strategy" },
  model: { semantic: "生图模型标识", defaultValue: "tt-image-2", appliesTo: ["generation"], scope: "generation" },
  channelId: { semantic: "生图渠道标识", defaultValue: "", appliesTo: ["generation"], scope: "generation" },
  dispatchMode: { semantic: "调度模式", defaultValue: "manual", appliesTo: ["generation"], scope: "generation" },
  ratio: { semantic: "图片比例", defaultValue: "9:16", appliesTo: ["compile", "generation"], scope: "generation" },
  imageSize: { semantic: "分辨率", defaultValue: "2K", appliesTo: ["compile", "generation"], scope: "generation" },
  count: { semantic: "整套详情屏数", defaultValue: 10, appliesTo: ["planning", "compile"], scope: "planning", explicitFlag: "countTouched" },
  countTouched: { semantic: "用户是否主动调整过屏数（true=fixed 用户明确优先）", defaultValue: false, appliesTo: ["planning"], scope: "planning" },
  copywriting: { semantic: "逐屏文案需求：need=需要、none=不需要（海报式）", defaultValue: "need", appliesTo: ["planning", "compile"], scope: "content" },
  richness: { semantic: "画面丰富度/信息密度", defaultValue: "simple", appliesTo: ["compile"], scope: "visual" },
  fontStyle: { semantic: "字体风格", defaultValue: "heiti", appliesTo: ["compile"], scope: "visual" },
  detailSkillVersion: { semantic: "Skill 版本", defaultValue: "v1", appliesTo: ["planning"], scope: "system" },
  stylePackId: { semantic: "风格包标识", defaultValue: "auto", appliesTo: ["compile"], scope: "visual" },
  modelMode: { semantic: "是否允许/要求安排模特内容", defaultValue: "use-model", appliesTo: ["planning", "compile"], scope: "visual" },
  modelPose: { semantic: "模特姿态（仅在安排模特的屏生效）", defaultValue: "regular", appliesTo: ["compile"], scope: "visual" },
  modelUsage: {
    semantic: "整套详情计划安排模特内容屏数的目标（非前 N 屏授权；屏位分配属于阶段 C）",
    defaultValue: 4, appliesTo: ["planning", "compile"], scope: "planning",
    semanticAlias: "targetModelScreens"
  },
  reverseScreens: {
    semantic: "痛点反转（painReverse）屏数，保留原功能；保证进入 V2 规划输入，分屏任务属于阶段 C",
    defaultValue: 2, appliesTo: ["planning"], scope: "content"
  },
  lang: { semantic: "输出语种", defaultValue: "中文", appliesTo: ["compile"], scope: "strategy" },
  productName: { semantic: "商品名称", defaultValue: "", appliesTo: ["planning", "compile"], scope: "fact" },
  productFeature: { semantic: "用户提供的商品资料（商品事实来源之一）", defaultValue: "", appliesTo: ["planning", "compile"], scope: "fact" },
  userInstruction: { semantic: "用户明确指令（单屏明确要求优先于一般策划建议）", defaultValue: "", appliesTo: ["planning"], scope: "fact" },
  sellingPoints: { semantic: "用户明确提供的卖点", defaultValue: "", appliesTo: ["planning", "compile"], scope: "fact" }
});

// 七层闭环状态枚举：每级独立判定，不得用上游通过替代下游通过。
export const PARAM_CLOSURE_STATUS = Object.freeze({
  PASSED: "passed",
  FAILED: "failed",
  UNVERIFIED: "unverified",
  NOT_APPLICABLE: "not_applicable"
});

// B-补充：参数来源优先级（从高到低），冲突时高优先级胜出，禁止静默覆盖用户明确要求。
export const PARAM_PRIORITY = Object.freeze({
  LEGAL_SAFETY_PLATFORM: 60, // 法律/安全/平台强制约束
  SCREEN_EXPLICIT: 50,       // 用户明确指定的单屏要求
  GLOBAL_EXPLICIT: 40,       // 用户明确选择的全局参数
  SOFT_ADVICE: 30,           // 行业/平台软性策划建议
  AI_ADVICE: 20,             // AI 自主建议
  DEFAULT: 10                // 系统默认值
});
const PRIORITY_LABELS = Object.freeze({
  60: "legal_safety_platform", 50: "screen_explicit", 40: "global_explicit",
  30: "soft_advice", 20: "ai_advice", 10: "default"
});

// 冲突处理：返回胜出值、胜出层级、是否压过了用户明确要求（压过则必须显式说明，不允许静默）。
export function resolveParamConflict(candidates = {}) {
  const order = [
    ["legalSafetyPlatform", PARAM_PRIORITY.LEGAL_SAFETY_PLATFORM],
    ["screenExplicit", PARAM_PRIORITY.SCREEN_EXPLICIT],
    ["globalExplicit", PARAM_PRIORITY.GLOBAL_EXPLICIT],
    ["softAdvice", PARAM_PRIORITY.SOFT_ADVICE],
    ["aiAdvice", PARAM_PRIORITY.AI_ADVICE],
    ["defaultValue", PARAM_PRIORITY.DEFAULT]
  ];
  let winner = null;
  for (const [key, priority] of order) {
    if (Object.prototype.hasOwnProperty.call(candidates, key) && candidates[key] !== undefined) {
      winner = { key, priority, value: candidates[key], source: PRIORITY_LABELS[priority] };
      break;
    }
  }
  if (!winner) return { value: undefined, source: "none", priority: 0, overridesUserExplicit: false, reason: "no_candidate" };
  const userExplicitPresent = Object.prototype.hasOwnProperty.call(candidates, "screenExplicit") || Object.prototype.hasOwnProperty.call(candidates, "globalExplicit");
  // 胜出层级高于"用户单屏要求"且存在用户明确候选 → 用户明确要求被更高优先级压过，必须显式标记。
  const overridesUserExplicit = winner.priority > PARAM_PRIORITY.SCREEN_EXPLICIT && userExplicitPresent;
  return {
    value: winner.value,
    source: winner.source,
    priority: winner.priority,
    overridesUserExplicit,
    reason: overridesUserExplicit ? "higher_priority_overrode_user_explicit" : "highest_priority_won"
  };
}

// B-补充：逐参数七阶段闭环状态结构。
// 阶段：frontSubmit/backReceive/planning/screenTask/finalPrompt/imageRequest/imageResult。
// 判定原则：只有 evidence 提供源码/探针证据的阶段才 passed；后两级无真实模型/图片证据恒 unverified；
// appliesTo 不含的阶段标 not_applicable；unknown 状态一律不作为 passed。
const CLOSURE_STAGES = ["frontSubmit", "backReceive", "planning", "screenTask", "finalPrompt", "imageRequest", "imageResult"];
const STAGE_TO_SCOPE = {
  planning: "planning", screenTask: "planning", finalPrompt: "compile", imageRequest: "generation", imageResult: "generation"
};
export function buildParamClosure(input = {}, evidence = {}) {
  const norm = normalizeDetailRequest(input);
  const result = {};
  for (const [key, def] of Object.entries(DETAIL_REQUEST_CONTRACT)) {
    const stages = {};
    // 前端提交：input 中存在该字段即 passed（源码/探针可证），否则 default 也视为 submitted（系统默认被提交）。
    stages.frontSubmit = Object.prototype.hasOwnProperty.call(input, key) ? PARAM_CLOSURE_STATUS.PASSED : PARAM_CLOSURE_STATUS.NOT_APPLICABLE;
    // 后台接收：normalize 产生 values 即证明接收（服务端纯函数探针可证）。
    stages.backReceive = Object.prototype.hasOwnProperty.call(norm.values, key) ? PARAM_CLOSURE_STATUS.PASSED : PARAM_CLOSURE_STATUS.FAILED;
    // 中间三级：仅当 evidence[key] 给出对应阶段的 true 证据才 passed；appliesTo 不含则 not_applicable；否则 unverified。
    for (const stage of ["planning", "screenTask", "finalPrompt", "imageRequest", "imageResult"]) {
      const stageScope = STAGE_TO_SCOPE[stage];
      const inScope = def.appliesTo.includes(stageScope);
      if (!inScope) {
        stages[stage] = PARAM_CLOSURE_STATUS.NOT_APPLICABLE;
      } else if (evidence?.[key]?.[stage] === true) {
        stages[stage] = PARAM_CLOSURE_STATUS.PASSED;
      } else {
        // 后两级无真实模型/图片证据，恒 unverified；其余阶段无证据也 unverified。
        stages[stage] = PARAM_CLOSURE_STATUS.UNVERIFIED;
      }
    }
    result[key] = { value: norm.values[key], source: norm.trace[key].source, stages };
  }
  return { contractVersion: "stage-b-1.0", stages: CLOSURE_STAGES, params: result };
}

// 参数标准化：返回规范化取值与逐参数溯源（source=user/default、explicit=是否用户明确）。
// 不改变调用方数据；仅提供契约层可查询的标准化视图，运行时消费沿用既有字段，零行为回归。
export function normalizeDetailRequest(input = {}) {
  const values = {};
  const trace = {};
  for (const [key, def] of Object.entries(DETAIL_REQUEST_CONTRACT)) {
    const present = Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined && input[key] !== null;
    let value = present ? input[key] : def.defaultValue;
    // copywriting 仅 two-value 语义归一：非 none 视为 need，兼容任意旧值。
    if (key === "copywriting") value = String(value) === "none" ? "none" : "need";
    // modelUsage 契约归一到正整数档位；语义=整套目标屏数（屏位分配不在本阶段）。
    if (key === "modelUsage") {
      const n = Number(value);
      value = Number.isFinite(n) ? Math.max(1, Math.min(12, Math.trunc(n))) : def.defaultValue;
    }
    values[key] = value;
    // B-补充：source 必须基于真实选择状态，不能只看属性是否存在。
    // ① 有 explicitFlag（如 countTouched）→ 以标记为准：true=user（含主动选同默认值）、false=default。
    // ② 无标记：不 present→default；present 且值等于默认→unknown（无法区分用户选同值/系统默认）；值不同→user。
    let source;
    if (def.explicitFlag && Object.prototype.hasOwnProperty.call(input, def.explicitFlag)) {
      source = input[def.explicitFlag] ? "user" : "default";
    } else if (!present) {
      source = "default";
    } else {
      const sameAsDefault = String(value) === String(def.defaultValue);
      source = sameAsDefault ? "unknown" : "user";
    }
    trace[key] = {
      source,
      value,
      explicit: source === "user",
      appliesTo: def.appliesTo,
      scope: def.scope
    };
  }
  // 语义别名：供阶段 C 及下游按正确语义读取，不改动 modelUsage 字段本身。
  values.targetModelScreens = values.modelUsage;
  trace.targetModelScreens = { source: "derived", value: values.modelUsage, explicit: trace.modelUsage.explicit, appliesTo: ["planning", "compile"], scope: "planning" };
  return { values, trace, contractVersion: "stage-b-1.0" };
}

// B-补充：判断是否"新版规划结果"（启用严格事实分类）。
// 新版 aiPlan 顶层 schemaVersion 存在且非空即视为新版；缺失/为空 = 历史旧版，走原兼容路径。
// 🔴 不因模型填了 category 就认定为新版——版本只看规划结果整体标记，防止绕过。
function isStrictFactSchema(schemaVersion) {
  return typeof schemaVersion === "string" && schemaVersion.trim().length > 0;
}

// ProductBrief 事实防护：识别"行业知识/AI推断/缺分类/缺来源证据冒充商品事实"。
// 版本化兼容：
//   - 旧版（无 schemaVersion，历史数据）：facts 无 category 时沿用 level=visible 旧判定（零行为回归）。
//   - 新版（有 schemaVersion）：每条事实必须有合法 category + 可确认来源类型 + 证据关联；
//     缺/无效 category → unclassified；缺来源或证据 → 不得获得 confirmed 资格；均留痕，不静默放行。
export function classifyProductFacts(facts = [], options = {}) {
  const strict = isStrictFactSchema(options?.schemaVersion);
  const confirmedClaims = [];
  const misuse = [];
  const unclassified = [];
  for (const f of (Array.isArray(facts) ? facts : [])) {
    const claim = String(f?.claim || "");
    if (!claim) continue;
    const level = String(f?.level || "");
    const rawCategory = f?.category == null ? null : String(f.category);
    const sourceType = f?.sourceType == null ? null : String(f.sourceType);
    const hasEvidence = Array.isArray(f?.evidence) ? f.evidence.length > 0 : (typeof f?.evidence === "string" && f.evidence.trim().length > 0);

    // 旧版兼容：无整体 schemaVersion 且无 category → 维持既有 visible 语义，不改历史结果。
    if (!strict && rawCategory === null) {
      if (level === FACT_LEVEL.L1) confirmedClaims.push({ claim, level, category: null, source: f?.source ?? null, compat: true });
      continue;
    }

    // 新版：缺/无效 category → unclassified，绝不自动视为 product-confirmed。
    if (!FACT_CATEGORY_VALUES.has(rawCategory)) {
      const reason = rawCategory === null ? "missing_category" : "invalid_category";
      unclassified.push({ claim, reason, category: FACT_CATEGORY.UNCLASSIFIED });
      misuse.push({ claim, reason, category: rawCategory ?? FACT_CATEGORY.UNCLASSIFIED });
      continue;
    }
    const category = rawCategory;
    // 非商品事实类别标 visible → 冒充，拒绝。
    if (!PRODUCT_FACT_CATEGORIES.has(category)) {
      if (level === FACT_LEVEL.L1) misuse.push({ claim, reason: "non_product_fact_marked_visible", category });
      continue;
    }
    // product-confirmed 仍需来源类型 + 证据关联才能 confirmed；缺一不可，不默认补 product-confirmed。
    if (level === FACT_LEVEL.L1) {
      if (!FACT_SOURCE_VALUES.has(sourceType)) {
        misuse.push({ claim, reason: "missing_or_invalid_source_type", category });
        continue;
      }
      if (!CONFIRMABLE_SOURCE_TYPES.has(sourceType)) {
        misuse.push({ claim, reason: "source_type_not_confirmable", category, sourceType });
        continue;
      }
      if (!hasEvidence) {
        misuse.push({ claim, reason: "missing_evidence", category, sourceType });
        continue;
      }
      confirmedClaims.push({ claim, level, category, sourceType, evidence: f.evidence, source: f?.source ?? null });
    }
  }
  return { confirmedClaims, misuse, unclassified, hasMisuse: misuse.length > 0, schemaVersion: options?.schemaVersion || null, strict };
}

// 商品事实 claim 提取：供 middleware 边界/画面消费。
// 兼容保证：对无 category 的旧 aiPlan，输出与旧逻辑 (level==="visible".map(claim)) 逐项一致；
// 仅当新数据显式 category 且被判冒充时，才排除该项，防止行业知识/推断冒充商品事实。
export function confirmedFactClaims(facts = [], options = {}) {
  return classifyProductFacts(facts, options).confirmedClaims.map((f) => f.claim);
}

// 活动配置：正式内容优先，缺失/损坏时回退占位。
// 🔴 回退占位时仍守住"占位不固化"：加载器/准入不会因占位产生 admitted 或加载行业包。
export function activeConfig() {
  return readProfessionalConfig() || readPendingConfig();
}

// 专业内容接入状态：占位 / 已接入。工程验证可见；不得据状态判质量通过。
export function professionalContentStatus() {
  const professional = readProfessionalConfig();
  if (professional) {
    return {
      status: professional.status,
      source: professional.$source || PROFESSIONAL_CONFIG_REL,
      version: professional.$version || "",
      note: "正式专业内容已接入；工程验证≠真实模型质量验收。",
      configRel: PROFESSIONAL_CONFIG_REL,
      isPlaceholder: false
    };
  }
  const cfg = readPendingConfig();
  return {
    status: cfg?.placeholderPolicy?.status || "pending_professional_content",
    engineeringUseOnly: cfg?.placeholderPolicy?.engineeringUseOnly !== false,
    note: cfg?.placeholderPolicy?.note || "",
    configRel: PENDING_CONFIG_REL,
    isPlaceholder: true
  };
}

// ---------- 注册表结构（只给字段骨架，不给专业值） ----------
// 每项任务：{ taskId, taskType, professionalValues: {...}|null, status }
// professionalValues 为 null 表示该任务尚无 ChatGPT 交付的专业配置，只能走占位。
export function createTaskRegistry(config = activeConfig()) {
  const slots = config?.taskRegistry || {};
  const toSkeleton = (list) => (Array.isArray(list) ? list : []).map((item) => ({
    taskId: String(item?.taskId || ""),
    taskType: String(item?.taskType || ""),
    professionalValues: item?.professionalValues
      ? {
          allowedIndustries: Array.isArray(item.professionalValues.allowedIndustries) ? item.professionalValues.allowedIndustries : [],
          requiredAttributes: Array.isArray(item.professionalValues.requiredAttributes) ? item.professionalValues.requiredAttributes : [],
          requiredFacts: Array.isArray(item.professionalValues.requiredFacts) ? item.professionalValues.requiredFacts : [],
          evidenceRequirements: Array.isArray(item.professionalValues.evidenceRequirements) ? item.professionalValues.evidenceRequirements : [],
          excludedConditions: Array.isArray(item.professionalValues.excludedConditions) ? item.professionalValues.excludedConditions : [],
          userOverridePolicy: String(item.professionalValues.userOverridePolicy || ""),
          outputRequirements: String(item.professionalValues.outputRequirements || "")
        }
      : null,
    status: item?.professionalValues ? "professional_content" : "pending_professional_content"
  }));
  return {
    status: slots.status || "pending_professional_content",
    contentTasks: toSkeleton(slots.contentTasks),
    visualTasks: toSkeleton(slots.visualTasks),
    note: slots.note || ""
  };
}

// ---------- 行业包加载接口（单一主行业 / 按需加载 / generic 回退） ----------
// 正式内容接入后：industryPacks.cleaning 是带规则的对象，命中即真正加载该包（单一、按需）。
// 占位态：industryPacks.slots 是字符串数组，命中也只标记 pending、不加载任何规则。
export function loadIndustryPack(industryId, config = activeConfig()) {
  const id = String(industryId || "generic").trim() || "generic";
  const packs = config?.industryPacks || {};

  // 正式专业内容分支：包为带规则对象。
  const formalPack = packs[id] && typeof packs[id] === "object" && !Array.isArray(packs[id]) ? packs[id] : null;
  if (formalPack) {
    return {
      requestedIndustryId: id,
      activeIndustryId: id,
      loadedIndustryPackIds: [id],
      matchedButProfessionalContentPending: false,
      fallbackMode: "professional_pack_loaded",
      status: "professional_content",
      isPlaceholder: false,
      packSource: formalPack.source || "",
      pack: {
        industryId: formalPack.industryId,
        industryName: formalPack.industryName,
        weakContextWordsMustNotOverride: formalPack.weakContextWordsMustNotOverride || [],
        positiveSignals: formalPack.positiveSignals || [],
        negativeSignals: formalPack.negativeSignals || [],
        noGeneralization: formalPack.noGeneralization || []
      }
    };
  }

  // 占位分支：仅识别 slot 存在与否，不加载规则、不判 admitted。
  const slots = Array.isArray(packs.slots) ? packs.slots : [];
  const matched = slots.includes(id);
  return {
    requestedIndustryId: id,
    activeIndustryId: matched ? id : "generic",
    loadedIndustryPackIds: [],
    matchedButProfessionalContentPending: matched,
    fallbackMode: matched ? "matched_pending_professional_content" : "generic_no_pack",
    status: config?.industryPacks?.status || "pending_professional_content",
    isPlaceholder: true,
    engineeringUseOnly: true
  };
}

// ---------- 行业强特征覆盖层（正式 cleaning 包，不改 G-2 词表） ----------
// 输入文本先按正式包的 positiveSignals / weakContextWords 做强特征判定。
// 命中清洁强特征且不含服装强特征时，返回 cleaning 覆盖结果；否则 null 交给既有词表逻辑。
// 🔴 服装强特征词来自"使用对象≠行业"原则的外延保护，不新增行业知识，仅防止弱语境词越权。
const APPAREL_STRONG_SIGNALS = ["衬衫", "T恤", "T 恤", "连衣裙", "裙", "裤", "外套", "毛衣", "版型", "袖口", "领口", "纽扣", "拉链", "穿搭", "模特"];

export function detectIndustryOverride(textInput, config = activeConfig()) {
  // P1-3：空格归一化——与 resolveIndustryDecision 同口径，避免"T 恤"服装强特征漏否决。
  const normalize = (s) => String(s || "").replace(/\s+/g, "");
  const text = normalize(textInput);
  const cleaningPack = config?.industryPacks?.cleaning;
  if (!cleaningPack || typeof cleaningPack !== "object" || Array.isArray(cleaningPack)) return null;

  const positives = Array.isArray(cleaningPack.positiveSignals) ? cleaningPack.positiveSignals : [];
  const negatives = Array.isArray(cleaningPack.negativeSignals) ? cleaningPack.negativeSignals : [];
  const hitPositive = positives.filter((word) => text.includes(normalize(word)));
  const hitNegative = negatives.filter((word) => text.includes(normalize(word)));
  const hitApparel = APPAREL_STRONG_SIGNALS.filter((word) => text.includes(normalize(word)));

  // 清洁强特征命中、无个人护理/化妆/食品负向信号、无服装强特征 → cleaning 覆盖。
  if (hitPositive.length > 0 && hitNegative.length === 0 && hitApparel.length === 0) {
    return {
      industryId: cleaningPack.industryId || "cleaning",
      industryName: cleaningPack.industryName || "清洁日化",
      isOverride: true,
      source: cleaningPack.source || "§3",
      evidence: { positive: hitPositive, negative: hitNegative, apparel: hitApparel },
      // 规则属性由调用方用通用 home 底座 + 清洁语义装配；本函数只给判定，不造专业规则正文。
      analyzeAttributes: ["清洁对象", "处理问题", "使用方式", "适用范围", "使用条件", "效果依据"],
      taboos: ["不得跨品类串规则", "不得把使用对象材质写成商品包装材质", "不得虚构适用范围与功效"]
    };
  }
  return null;
}

// ---------- P1-1 行业体系统一：单一决策入口 ----------
// 优先级（唯一主判断链）：行业包强特征覆盖(cleaning) > 行业包通用正信号 > 旧词表受控 fallback > generic。
// 旧词表(getIndustrySkillByText)不再作为与行业包并行的第二套主判断，只在包体系无命中时降级使用。
// resolution 随决策返回，供运行时输出：industryId / packId / confidence / evidence / fallbackStatus / ruleSource。
export function resolveIndustryDecision({ text = "", aiHint = "", fallbackLookup = null, config = activeConfig() } = {}) {
  // P1-3：空格归一化——"T 恤"与"T恤"视为同一识别信号，避免带空格写法漏命中。
  const normalize = (s) => String(s || "").replace(/\s+/g, "");
  const source = normalize(`${String(text || "")} ${String(aiHint || "")}`);
  const packs = config?.industryPacks || {};

  // 1) cleaning 强特征覆盖（保留既有能力，含服装强特征否决，回归零风险）。
  const override = detectIndustryOverride(source, config);
  if (override) {
    return {
      industryId: override.industryId,
      packId: "cleaning",
      confidence: "high",
      fallbackStatus: "none",
      ruleSource: "industryPack",
      decisionPath: "pack_strong_override",
      evidence: { positive: override.evidence.positive, negative: override.evidence.negative, apparelBlock: override.evidence.apparel, via: "cleaning.positiveSignals" }
    };
  }

  // 2) 行业包通用正信号匹配：统计每个包 positiveSignals 命中数，取唯一最高分。
  //    weakContextWordsMustNotOverride 命中的词仅作弱语境，不计入行业本身判定（使用对象≠行业）。
  const scored = [];
  for (const [packId, pack] of Object.entries(packs)) {
    if (!pack || typeof pack !== "object" || Array.isArray(pack)) continue;
    const positives = Array.isArray(pack.positiveSignals) ? pack.positiveSignals : [];
    const negatives = Array.isArray(pack.negativeSignals) ? pack.negativeSignals : [];
    const weak = Array.isArray(pack.weakContextWordsMustNotOverride) ? pack.weakContextWordsMustNotOverride : [];
    const hitPositive = positives.filter((word) => source.includes(normalize(word)));
    const hitNegative = negatives.filter((word) => source.includes(normalize(word)));
    const hitWeak = weak.filter((word) => source.includes(normalize(word)));
    if (hitPositive.length === 0 || hitNegative.length > 0) continue;
    scored.push({ packId, industryId: pack.industryId || packId, industryName: pack.industryName || packId, hitPositive, hitNegative, hitWeak });
  }
  scored.sort((a, b) => b.hitPositive.length - a.hitPositive.length);
  if (scored.length > 0) {
    const top = scored[0];
    const tie = scored.length > 1 && scored[1].hitPositive.length === top.hitPositive.length;
    return {
      industryId: top.industryId,
      packId: top.packId,
      // 多包同分或仅命中弱语境词时降为 medium，不强判。
      confidence: tie ? "medium" : "high",
      fallbackStatus: "none",
      ruleSource: "industryPack",
      decisionPath: "pack_signal_match",
      evidence: { positive: top.hitPositive, negative: top.hitNegative, weakContext: top.hitWeak, via: `${top.packId}.positiveSignals`, tiedPacks: tie ? scored.filter((s) => s.hitPositive.length === top.hitPositive.length).map((s) => s.packId) : [] }
    };
  }

  // 3) 旧词表受控 fallback：仅当包体系完全无命中时启用，不再是并行主判断。
  if (typeof fallbackLookup === "function") {
    const skill = fallbackLookup(source);
    if (skill && skill.id && skill.id !== "generic") {
      return {
        industryId: skill.id,
        packId: packs[skill.id] ? skill.id : null,
        confidence: "low",
        fallbackStatus: "legacy_fallback",
        ruleSource: "legacyKeywords",
        decisionPath: "legacy_keyword_fallback",
        evidence: { via: "INDUSTRY_SKILLS.keywords", legacyName: skill.name }
      };
    }
  }

  // 4) generic 末级降级，显式记录原因。
  return {
    industryId: "generic",
    packId: null,
    confidence: "low",
    fallbackStatus: "generic_fallback",
    ruleSource: "generic",
    decisionPath: "generic_fallback",
    evidence: { via: "no_pack_no_keyword_match" }
  };
}

// ---------- P1-2B 三字段真实消费（来源→消费者函数→执行结果→运行时证据） ----------
// 字段1 recognitionExamples：明确定位为"识别回归测试夹具"（非运行时识别输入）。
// 消费者=本函数（供门禁/自检调用），执行结果=逐例识别断言，证据=pass/forbidden 命中情况。
export function validateRecognitionExamples(config = activeConfig(), decide = null) {
  const packs = config?.industryPacks || {};
  const cases = [];
  for (const [packId, pack] of Object.entries(packs)) {
    if (!pack || typeof pack !== "object" || !Array.isArray(pack.recognitionExamples)) continue;
    for (const ex of pack.recognitionExamples) {
      const item = { packId, input: String(ex?.input || ""), expectIndustry: String(ex?.industry || ""), forbidden: String(ex?.forbidden || "") };
      if (typeof decide === "function" && item.input) {
        const got = decide(item.input);
        item.actualIndustry = got?.industryId || got?.id || "";
        item.pass = Boolean(item.actualIndustry) && item.actualIndustry === item.expectIndustry && (!item.forbidden || item.actualIndustry !== item.forbidden);
      } else {
        item.pass = null; // 未提供决策函数时只做夹具枚举，不伪造通过。
      }
      cases.push(item);
    }
  }
  return { source: "industryPacks[*].recognitionExamples", role: "regression_fixture", total: cases.length, cases, allPass: cases.length > 0 && cases.every((c) => c.pass === true) };
}

// 字段2 professionalValues：包级准入——allowedIndustries 决定该包专业规则是否允许用于当前行业。
// 消费者=本函数；执行结果=admitted/rejected；证据=reason + 命中的 allowedIndustries。
export function admitIndustryPack(packId, industryId, config = activeConfig()) {
  const pack = config?.industryPacks?.[packId];
  const values = pack?.professionalValues;
  if (!pack || typeof pack !== "object") return { packId, industryId, admitted: false, reason: "pack_not_found" };
  if (!values || typeof values !== "object") return { packId, industryId, admitted: false, reason: "professional_values_missing" };
  const allowed = Array.isArray(values.allowedIndustries) ? values.allowedIndustries : [];
  const ok = allowed.length === 0 || allowed.includes("*") || allowed.includes(industryId);
  return {
    packId,
    industryId,
    admitted: ok,
    reason: ok ? "industry_allowed" : "industry_not_allowed",
    evidence: { source: `${packId}.professionalValues.allowedIndustries`, allowedIndustries: allowed, outputRequirements: String(values.outputRequirements || "") }
  };
}

// 字段3 coverage：能力覆盖判定——判断某内容方向是否在本行业包的覆盖清单内。
// 消费者=本函数；执行结果=covered/uncovered/undeclared；证据=declaration 来源与匹配项。
export function checkIndustryCoverage(packId, contentDirection, config = activeConfig()) {
  const pack = config?.industryPacks?.[packId];
  const coverage = Array.isArray(pack?.coverage) ? pack.coverage : [];
  const direction = String(contentDirection || "");
  if (coverage.length === 0) return { packId, contentDirection: direction, status: "undeclared", covered: false, evidence: { source: `${packId}.coverage`, declaration: [] } };
  const matched = coverage.filter((item) => direction.includes(String(item)) || String(item).includes(direction));
  return {
    packId,
    contentDirection: direction,
    status: matched.length > 0 ? "covered" : "uncovered",
    covered: matched.length > 0,
    evidence: { source: `${packId}.coverage`, declaration: coverage, matched }
  };
}

// ---------- P1-2B 补齐：coverage 影响屏级任务分配 / outputRequirements 影响行业输出约束 ----------
// coverage→通用信息维度的映射（维度名来自 buildLocalScreenTasks 的 taskCategory，非行业专属规则）。
// 覆盖方向里含"对象/适用/场景"→提升适用范围；含"方式/步骤/使用"→提升使用方法；含"效果/依据"→提升效果。
const COVERAGE_TASK_HINTS = [
  { re: /适用|对象|场景|范围/, categories: ["applicableScope"] },
  { re: /使用|方式|步骤|操作|清洁|去渍|去油|除垢/, categories: ["usage", "care", "applicableScope"] },
  { re: /效果|依据|性能/, categories: ["effect"] }
];
// 消费者：applyCoverageToTasks——coverage 真实影响任务的选择/优先/舍弃，不是拼进每屏文本。
export function applyCoverageToTasks(tasks = [], coverage = []) {
  const list = Array.isArray(tasks) ? tasks.map((t) => ({ ...t })) : [];
  const cov = Array.isArray(coverage) ? coverage : [];
  if (cov.length === 0 || list.length === 0) {
    return { tasks: list, decision: { applied: false, reason: "coverage_undeclared", selectedCategories: [], boostCategories: [], deprioritizedCategories: [] } };
  }
  const covText = cov.join("、");
  const boostCategories = new Set();
  for (const hint of COVERAGE_TASK_HINTS) if (hint.re.test(covText)) hint.categories.forEach((c) => boostCategories.add(c));
  // 约束：不改变任务屏位顺序（首屏 identity / 固定深度策划顺序是已验收结构，Y/AD 组锁定）。
  // coverage 通过"覆盖状态标记 + 内容方向约束"影响每个任务实际表达，而非重排屏位。
  // 命中覆盖维度 → in_scope 且补一条覆盖方向约束；未命中且非通用维度 → out_of_scope 供下游降级。
  const selectedCategories = [];
  const deprioritizedCategories = [];
  const scopedTasks = list.map((task) => {
    const category = String(task.taskCategory || "");
    // taskCategory 可能是细分品类（usageStep/careStep），按其基础维度归属匹配覆盖。
    const inScope = boostCategories.has(category) || [...boostCategories].some((base) => category.startsWith(base));
    const universal = category === "identity";
    if (inScope) {
      selectedCategories.push(task.taskCategory);
      return {
        ...task,
        coverageStatus: "in_scope",
        compositionHint: `${task.compositionHint || ""}（行业覆盖方向：${covText}；本屏内容须落在该覆盖内，不扩展到未声明方向）`
      };
    }
    if (!universal) deprioritizedCategories.push(task.taskCategory);
    return { ...task, coverageStatus: universal ? "universal" : "out_of_scope" };
  });
  return {
    tasks: scopedTasks,
    decision: {
      applied: true,
      reason: "coverage_driven_content_scope",
      coverageCount: cov.length,
      selectedCategories: [...new Set(selectedCategories)],
      boostCategories: [...boostCategories],
      deprioritizedCategories: [...new Set(deprioritizedCategories)]
    }
  };
}

// 消费者：applyOutputRequirements——把行业输出约束（"禁止X规则"）注入命中任务的 hint，影响屏级内容。
export function applyOutputRequirements(tasks = [], outputRequirements = "") {
  const list = Array.isArray(tasks) ? tasks.map((t) => ({ ...t })) : [];
  const text = String(outputRequirements || "");
  if (!text) return { tasks: list, applied: false, bans: [] };
  // 从"禁止A/B/C规则"提取被禁对象（按 / 和 、切分），只取明确的短词，避免误伤。
  const banMatch = text.match(/禁止([^，。；]+)/);
  const bans = banMatch ? banMatch[1].split(/[\/、]/).map((s) => s.trim()).filter((s) => s.length >= 1 && s.length <= 8) : [];
  const appliedTasks = list.map((task) => {
    const hint = String(task.compositionHint || "");
    const hit = bans.filter((b) => hint.includes(b) || String(task.taskCategory || "").includes(b));
    return hit.length > 0 ? { ...task, compositionHint: `${hint}（行业约束：不得出现${hit.join("、")}相关表达）`, outputConstraintHits: hit } : task;
  });
  return { tasks: appliedTasks, applied: bans.length > 0, bans, source: "professionalValues.outputRequirements" };
}

// ---------- P1-3 子类目继承与置信度消费 ----------
// 继承字段白名单：子包未声明时从父包继承；子包已声明时覆盖（允许覆盖）。
const INHERITABLE_FIELDS = [
  "weakContextWordsMustNotOverride", "positiveSignals", "negativeSignals",
  "noGeneralization", "generalizationDetectWords", "coverage", "recognitionExamples", "professionalValues"
];
// 禁止覆盖字段：子类目不得改写父行业的身份与跨行业边界根基（防跨行业/跨子类目污染）。
const NON_OVERRIDABLE_FIELDS = ["industryId", "source"];

// 消费者：resolveInheritedPack——解析 extends 链，合并父→子字段，返回有效包 + 继承证据。
export function resolveInheritedPack(packId, config = activeConfig()) {
  const packs = config?.industryPacks || {};
  const chain = [];
  const seen = new Set();
  let current = packId;
  while (current && packs[current] && typeof packs[current] === "object" && !Array.isArray(packs[current])) {
    if (seen.has(current)) {
      return { packId, effectivePack: {}, inheritedFrom: [], cycleDetected: true, error: `inheritance_cycle:${current}`, resolved: false };
    }
    seen.add(current);
    chain.push(current);
    current = packs[current].extends || "";
  }
  if (chain.length === 0) return { packId, effectivePack: {}, inheritedFrom: [], resolved: false, error: "pack_not_found" };

  // 从最顶层父包向下合并：子包覆盖父包（允许覆盖），禁止覆盖字段以最顶层为准。
  const effective = {};
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const pack = packs[chain[i]];
    for (const field of INHERITABLE_FIELDS) if (pack[field] !== undefined) effective[field] = pack[field];
    for (const field of NON_OVERRIDABLE_FIELDS) {
      if (effective[field] === undefined && pack[field] !== undefined) effective[field] = pack[field];
    }
    // 子包自己的 id/name 始终为本包（identity 是子类目自身，不算覆盖父行业）。
    effective.packId = packId;
    effective.industryId = packs[packId].industryId || effective.industryId;
    effective.industryName = packs[packId].industryName || effective.industryName;
  }
  return {
    packId,
    effectivePack: effective,
    inheritedFrom: chain.slice(1), // 除自身外的祖先链
    isSubCategory: chain.length > 1,
    parentPackId: chain[1] || null,
    cycleDetected: false,
    resolved: true
  };
}

// 消费者：applyConfidenceToRules——置信度真实决定运行时加载哪一层专业规则（非仅记录/审计）。
// high → 完整有效包（含继承）；medium（多包同分/子类目不确定）→ 降级父行业公共规则，不启用子包专属；low → generic 公共规则。
export function applyConfidenceToRules(skill, resolution = {}, config = activeConfig()) {
  const confidence = String(resolution.confidence || "low");
  const packId = String(resolution.packId || "");
  // generic 公共底座：不含任何行业专属知识（工程机制层不 import 词表层，避免循环依赖）。
  const generic = {
    id: "generic", name: "通用电商",
    analyzeAttributes: ["商品主体", "已确认事实", "使用方式"],
    sellingAngles: [], visualAnchors: ["商品真实呈现"], taboos: ["不得虚构未确认事实"],
    recommendedScreens: ["首屏主视觉", "核心卖点", "使用场景", "收尾转化"], qcRules: []
  };
  // 子类目场景：调用方（resolveSubCategory）已用临时 config 预解析继承链，直接复用，避免顶层找不到子目包。
  const inherited = resolution?.preResolvedInherited
    ? resolution.preResolvedInherited
    : (packId ? resolveInheritedPack(packId, config) : null);
  let level = "generic_rules";
  let rules = null;

  // 子类目专属规则充分性门槛：仅凭单一信号命中子包不足以下载子专属规则（防"单一弱信号→high→误加载子专属"）。
  // 只作用于 isSubCategory 的 high 场景；生产 8 个平级包无子包，行为零影响（P1-1 不回退）。
  const subCategorySingleSignal = (() => {
    if (confidence !== "high" || !inherited?.isSubCategory) return false;
    // 子类目的 evidence.positive 已由 resolveSubCategory 保证全为子目专属信号（非父包继承），
    // 直接用其数量判充分性；子目 id 不在 industryPacks 顶层，不能按顶层包 positiveSignals 过滤。
    const hits = Array.isArray(resolution?.evidence?.positive) ? resolution.evidence.positive : [];
    return hits.length < 2;
  })();

  if (confidence === "high" && inherited?.resolved && !inherited.cycleDetected && !subCategorySingleSignal) {
    // 高置信：加载完整有效包规则（含继承字段），专业规则属性仍取既有的完整 skill（本项不改属性来源）。
    level = "full_pack_rules";
    rules = { ...skill, activeCoverage: Array.isArray(inherited.effectivePack.coverage) ? inherited.effectivePack.coverage : [], inheritedFrom: inherited.inheritedFrom, isSubCategory: inherited.isSubCategory };
  } else if ((confidence === "medium" || subCategorySingleSignal) && inherited?.resolved && !inherited.cycleDetected) {
    // 中置信（多包同分/子类目不确定）：不启用任何行业专属专业策略——用通用公共底座 +
    // 父行业 coverage（若有），落实架构约束"同分不得凭排序启用某行业专属规则"。
    level = "parent_common_rules";
    const parentId = inherited.parentPackId;
    const parentPack = parentId ? config?.industryPacks?.[parentId] : null;
    const commonCoverage = parentPack && Array.isArray(parentPack.coverage) ? parentPack.coverage : [];
    rules = {
      ...generic,
      name: skill?.name || generic.name,
      activeCoverage: commonCoverage,
      inheritedFrom: [],
      isSubCategory: false,
      subCategorySuppressed: inherited.isSubCategory,
      industrySuppressed: true
    };
  } else {
    // 低置信/未知/generic：只加载通用公共底座，不加载任何行业专属规则。
    level = "generic_rules";
    rules = { ...generic, activeCoverage: [], inheritedFrom: [], isSubCategory: false, industrySuppressed: Boolean(packId) };
  }
  return {
    rules,
    ruleLoadDecision: {
      confidence,
      packId: packId || null,
      level,
      inheritedFrom: inherited?.inheritedFrom || [],
      cycleDetected: Boolean(inherited?.cycleDetected),
      subCategorySingleSignal,
      reason: subCategorySingleSignal ? `subcategory_single_signal_demoted_${level}` : `confidence_${confidence}_${level}`
    }
  };
}

// ---------- P1-3 补充：生产子类目识别入口（包内二级，不改 P1-1 通用行业识别） ----------
// 子目配置嵌在父包 subCategories[*]，extends 必须指回父包 id（跨行业子目拒绝）。
// 返回子类目 resolution；无子目命中/冲突/跨污染时返回 null 由调用方用父行业规则。
export function resolveSubCategory(textInput, parentPackId, config = activeConfig()) {
  const normalize = (s) => String(s || "").replace(/\s+/g, "");
  const text = normalize(textInput);
  const parent = config?.industryPacks?.[parentPackId];
  const subs = Array.isArray(parent?.subCategories) ? parent.subCategories : [];
  if (subs.length === 0) return null;

  const scored = [];
  for (const sub of subs) {
    if (!sub || typeof sub !== "object") continue;
    // 跨行业/跨父类目污染隔离：子目 extends 必须等于当前父包 id。
    if (String(sub.extends || "") !== String(parentPackId)) continue;
    const signals = Array.isArray(sub.positiveSignals) ? sub.positiveSignals : [];
    const hits = signals.filter((w) => text.includes(normalize(w)));
    if (hits.length === 0) continue;
    scored.push({ sub, id: sub.id || sub.industryId, hits });
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.hits.length - a.hits.length);

  // 注入临时包键，复用既有 resolveInheritedPack 的继承链（extends 指回父包）。
  const tmpConfig = { industryPacks: { ...(config?.industryPacks || {}) } };
  const top = scored[0];
  tmpConfig.industryPacks[top.id] = { ...top.sub, industryId: top.id, industryName: top.sub.industryName || top.id };
  const inherited = resolveInheritedPack(top.id, tmpConfig);
  const tie = scored.length > 1 && scored[1].hits.length === top.hits.length;

  return {
    subCategoryId: top.id,
    subCategoryName: top.sub.industryName || top.id,
    parentPackId,
    confidence: tie ? "medium" : "high",
    evidence: { positive: top.hits, via: `${parentPackId}.subCategories[${top.id}].positiveSignals`, tiedSubCategories: tie ? scored.filter((s) => s.hits.length === top.hits.length).map((s) => s.id) : [], crossParentRejected: subs.length - scored.length },
    inherited,
    tie
  };
}

// ---------- 全品类跨行业污染检测（配置驱动、可扩展，非硬编码几个行业） ----------
// 原理：一段文案若命中"其他行业的强特征词"(positiveSignals)，且这些词不在本行业的
// weakContextWordsMustNotOverride(使用对象/弱语境词)中，视为跨行业规则污染风险。
// 只输出证据供审计/上游判断，不改变 detectIndustryOverride 的既有判定，避免破坏已验收行为。
export function checkIndustryPollution(textInput = "", industryId = "generic", config = activeConfig()) {
  const text = String(textInput || "");
  const packs = config?.industryPacks || {};
  const own = packs[industryId] || {};
  const weakWords = Array.isArray(own.weakContextWordsMustNotOverride) ? own.weakContextWordsMustNotOverride : [];
  const ownPositives = new Set(Array.isArray(own.positiveSignals) ? own.positiveSignals : []);
  const risks = [];
  for (const [otherId, other] of Object.entries(packs)) {
    if (otherId === industryId || !other || typeof other !== "object") continue;
    const signals = Array.isArray(other.positiveSignals) ? other.positiveSignals : [];
    const foreign = signals.filter((word) => (
      text.includes(word) && !ownPositives.has(word) && !weakWords.some((weak) => weak.includes(word) || word.includes(weak))
    ));
    if (foreign.length) risks.push({ industry: otherId, industryName: other.industryName || otherId, signals: foreign });
  }
  return {
    industryId,
    hasPollution: risks.length > 0,
    risks,
    note: "基于行业包 positiveSignals 的配置驱动检测；弱语境词(使用对象)已排除，不作硬性拦截。"
  };
}

// ---------- 任务准入接口（四态判定骨架） ----------
// 专业值缺失（占位态）时不给 admitted——避免占位被固化为正式规则。
// 传 professionalValues=null 或未交付 → 一律 pending，reason 明确。
export function admitTask(task, ctx = {}) {
  const taskId = String(task?.taskId || "");
  const taskType = String(task?.taskType || "content");
  const values = task?.professionalValues || null;
  const industryId = String(ctx.industryId || "generic");
  const base = { taskId, taskType, industryId, requiredFactsSatisfied: false, missingFacts: [] };

  if (!values) {
    return { ...base, admission: ADMISSION.PENDING, reason: "professional_content_pending:ChatGPT 尚未交付该任务的专业准入规则，禁止用占位值判 admitted" };
  }
  const industryAllowed = Array.isArray(values.allowedIndustries)
    && (values.allowedIndustries.length === 0
      || values.allowedIndustries.includes("*")
      || values.allowedIndustries.includes(industryId));
  if (Array.isArray(values.allowedIndustries) && values.allowedIndustries.length > 0 && !industryAllowed) {
    return { ...base, admission: ADMISSION.REJECTED, reason: "industry_not_allowed:当前行业不在 allowedIndustries" };
  }
  if (Array.isArray(values.excludedConditions) && values.excludedConditions.some((cond) => ctx.factKeys?.includes?.(cond))) {
    return { ...base, admission: ADMISSION.REJECTED, reason: "excluded_condition_hit:命中排除条件" };
  }
  const missing = (values.requiredFacts || []).filter((fact) => !(ctx.confirmedFacts || []).includes(fact));
  if (missing.length > 0) {
    return { ...base, admission: ADMISSION.PENDING, reason: "required_facts_missing", missingFacts: missing };
  }
  if (ctx.noIndustryPack && values.allowGeneric !== true) {
    return { ...base, admission: ADMISSION.GENERIC_FALLBACK, reason: "generic_no_pack:无行业包且任务未声明可用于 generic" };
  }
  return { ...base, admission: ADMISSION.ADMITTED, reason: "all_conditions_satisfied", requiredFactsSatisfied: true };
}

// 准入批次：返回 admitted 任务 ID 与逐项原因；工程验证可见，质量不在此判定。
export function admitTasks(tasks, ctx) {
  const list = Array.isArray(tasks) ? tasks : [];
  const results = list.map((task) => admitTask(task, ctx));
  return {
    admissionStatus: "engineering_verification_only",
    admittedTaskIds: results.filter((r) => r.admission === ADMISSION.ADMITTED).map((r) => r.taskId),
    rejectedTaskIds: results.filter((r) => r.admission === ADMISSION.REJECTED).map((r) => r.taskId),
    pendingTaskIds: results.filter((r) => r.admission === ADMISSION.PENDING).map((r) => r.taskId),
    genericFallbackTaskIds: results.filter((r) => r.admission === ADMISSION.GENERIC_FALLBACK).map((r) => r.taskId),
    results
  };
}

// ---------- 编译器授权与审计接口 ----------
// authorizeSegment：每段提示词指令必须声明来源字段或来源任务 ID；无来源 → 拒绝并记录。
export function createCompilerAudit() {
  const segments = [];
  return {
    record({ text, sourceField = "", sourceTaskId = "" }) {
      const hasSource = Boolean(String(sourceField).trim() || String(sourceTaskId).trim());
      segments.push({
        text: String(text || ""),
        sourceField: String(sourceField || ""),
        sourceTaskId: String(sourceTaskId || ""),
        authorized: hasSource
      });
      return hasSource;
    },
    report({ plannedTaskIds = [], usedTaskIds = [] }) {
      const unauthorized = segments.filter((s) => !s.authorized);
      const unused = plannedTaskIds.filter((id) => !usedTaskIds.includes(id));
      return {
        auditStatus: "engineering_verification_only",
        plannedTaskIds,
        usedTaskIds,
        unusedTaskIds: unused,
        segments: segments.slice(),
        unauthorizedAdded: unauthorized.length > 0,
        unauthorizedSegments: unauthorized.map((s) => s.text),
        factBoundaryBroken: false, // 事实边界由 middleware 的事实分级判定回填，本骨架不擅自置真。
        note: "审计仅证明指令来源可追溯（工程验证），不代表专业模型质量验收通过。"
      };
    }
  };
}

export default {
  ADMISSION,
  FACT_LEVEL,
  FACT_CATEGORY,
  FACT_SOURCE_TYPE,
  PRODUCT_FACT_SCHEMA_VERSION,
  DETAIL_REQUEST_CONTRACT,
  PARAM_CLOSURE_STATUS,
  PARAM_PRIORITY,
  normalizeDetailRequest,
  classifyProductFacts,
  confirmedFactClaims,
  buildParamClosure,
  resolveParamConflict,
  professionalContentStatus,
  activeConfig,
  createTaskRegistry,
  loadIndustryPack,
  detectIndustryOverride,
  admitTask,
  admitTasks,
  createCompilerAudit
};
