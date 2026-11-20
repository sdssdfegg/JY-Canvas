// V2-PRO-002：Skill 按需触发契约 + 提示词分层组装（工程机制层）
// 🔴 边界：本模块只实现"触发判定 / 分层组装 / 编译授权"的工程机制。
//    各 Skill / 能力模块的 activation_conditions 等专业值来自 ChatGPT 正式配置；
//    未配置时按 inactive / 保守处理，绝不用工程默认值冒充专业规则。
// 保持单 Planner、单次调用；不新增 Provider / KEY / 生图链路；不改 G-2 与冻结模块。

import { readFileSync } from "node:fs";
import { activeConfig, createCompilerAudit, ADMISSION } from "./index.js";

// V2-PRO-002：卖点事实边界校验（消费正式配置的 noGeneralization，不自行发明规则）。
// 返回 { allowed, reason }；命中行业禁止泛化词时拦截，避免未确认事实进提示词。
export function checkSellingPointBoundary(sellingPoint, industryId = "generic", config = activeConfig(), confirmedFacts = []) {
  const text = String(sellingPoint || "");
  const pack = config?.industryPacks?.[industryId];
  const forbidden = Array.isArray(pack?.noGeneralization) ? pack.noGeneralization : [];
  // P1-2 字段真实消费：可检测词从配置的 generalizationDetectWords 读取（配置驱动，替代硬编码正则）。
  // 每个包的 detectWords 由其 noGeneralization 规则派生，配置里显式列出——这是"配置读取→运行约束"链路。
  // 兼容兜底：旧配置无该字段时，仍从规则句按通用"扩为/推导/虚构/断言"对象提取，避免行为断裂。
  const configuredWords = Array.isArray(pack?.generalizationDetectWords) ? pack.generalizationDetectWords : [];
  const detectWords = [...configuredWords];
  if (detectWords.length === 0) {
    for (const rule of forbidden) {
      const matches = String(rule).match(/(?:扩为|推导为|虚构|断言为|等同于)([^，,；;]{2,12})/g) || [];
      detectWords.push(...matches.map((m) => m.replace(/^(?:扩为|推导为|虚构|断言为|等同于)/, "")));
    }
  }
  const hits = [...new Set(detectWords)].filter((word) => text.includes(word));
  // V2-PRO-003 修复：命中词若已出现在用户明确提供/已确认事实中，属于合法事实复述，不拦截。
  // 原实现注释声称"仅在无对应 visible 事实时拦截"，但代码未核对——导致用户明确提供的
  // 适用范围（如"窗帘"）被误判为未确认扩展、整句卖点被丢弃。此处按注释语义补齐豁免。
  const confirmedText = (Array.isArray(confirmedFacts) ? confirmedFacts : [])
    .map((fact) => String(typeof fact === "object" ? (fact.content || fact.claim || "") : fact || ""))
    .join(" ");
  // P1-2B 豁免精确匹配：事实中出现命中词 ≠ 允许对该词做全称泛化。
  // 只有"命中词在事实中"且"卖点未对该词施加全称/泛化修饰"时才豁免，防止跨范围放行
  // （如事实="适用于窗帘"，卖点="所有窗帘材质都适用"命中泛化词时仍须拦截）。
  const GENERALIZATION_MODIFIERS = /所有|全部|任何|均|都|各类|各种|通用|全系列|全材质|任何一种|一切/;
  // P1-2B 补齐：结论性/功效类词（含"效果/功效/性能/认证/检测/结果/参数/安全/承诺/依据/范围"词根）
  // 仅凭关键词出现在事实中不足以豁免，还要求事实里该词附近有依据标记（数值/检测/实测/报告等），
  // 防止"事实仅提了词，没有对应功效依据"也被放行。
  const CONCLUSION_WORD = /效果|功效|性能|认证|检测|结果|参数|安全|承诺|依据|范围|耐用|承重/;
  const EVIDENCE_MARK = /\d|[0-9]|%|检测|实测|测试|报告|认证编号|实验|数据|依据|数值/;
  const exemptable = (word) => {
    if (!confirmedText.includes(word)) return false;
    const at = text.indexOf(word);
    if (at < 0) return false;
    const window = text.slice(Math.max(0, at - 12), at + word.length + 12);
    if (GENERALIZATION_MODIFIERS.test(window)) return false;
    // 结论性词：在事实里定位该词，检查其局部窗口是否有依据标记。
    if (CONCLUSION_WORD.test(word)) {
      const fat = confirmedText.indexOf(word);
      const factWindow = confirmedText.slice(Math.max(0, fat - 16), fat + word.length + 16);
      if (!EVIDENCE_MARK.test(factWindow)) return false;
    }
    return true;
  };
  const realHits = hits.filter((word) => !exemptable(word));
  return {
    allowed: realHits.length === 0,
    reason: realHits.length ? `forbidden_generalization:${realHits.join(",")}` : (hits.length ? "confirmed_fact_exempt" : "ok"),
    hits: realHits,
    exempted: hits.filter((word) => exemptable(word)),
    // P1-2：检测词来源可追溯（配置包 id + 词数），证明"配置读取→运行约束"链路。
    detectSource: { packId: industryId, fromConfig: configuredWords.length > 0, detectWordCount: configuredWords.length || detectWords.length }
  };
}

// 四种执行模式（裁决语义，字段值固定）
export const EXECUTION_MODE = Object.freeze({
  MANDATORY: "mandatory",
  CONDITIONAL: "conditional",
  OPTIONAL: "optional",
  INACTIVE: "inactive"
});

// Skill Activation Contract 的八个语义字段（每张触发表必须齐备）
const CONTRACT_FIELDS = [
  "activation_conditions",
  "exclusion_conditions",
  "required_context",
  "optional_context",
  "execution_mode",
  "decision_rules",
  "execution_rules",
  "output_contract",
  "downstream_usage",
  "prompt_injection_policy",
  "conflict_priority",
  "failure_fallback"
];

// 默认触发表（工程基线，非专业内容）：只声明"哪些能力在缺配置时必须 inactive"。
// 专业触发条件由正式配置的 skillActivation 覆盖；本表防止"所有 Skill 无条件激活"。
const BASE_ACTIVATION = {
  "model-pose": {
    activation_conditions: ["user_requires_model"],
    exclusion_conditions: [],
    required_context: ["explicit_figure_task"],
    execution_mode: EXECUTION_MODE.CONDITIONAL,
    output_contract: "仅当用户明确人物任务且行业允许时生成人物指令",
    downstream_usage: "generation_instruction(conditional)",
    prompt_injection_policy: "未触发不进入最终提示词",
    conflict_priority: 5
  },
  "product-structure": {
    activation_conditions: ["real_distinct_structure_with_value"],
    exclusion_conditions: ["ordinary_packaging"],
    required_context: ["confirmed_structure_fact"],
    execution_mode: EXECUTION_MODE.CONDITIONAL,
    output_contract: "仅在存在真实且有价值结构时输出结构细节",
    downstream_usage: "generation_instruction(conditional)",
    prompt_injection_policy: "未触发不进入最终提示词",
    conflict_priority: 3
  },
  "effect-evidence": {
    activation_conditions: ["reliable_effect_evidence"],
    exclusion_conditions: ["no_effect_evidence"],
    required_context: ["effect_evidence"],
    execution_mode: EXECUTION_MODE.CONDITIONAL,
    output_contract: "仅在可靠效果依据下输出效果/前后对比",
    downstream_usage: "generation_instruction(conditional)",
    prompt_injection_policy: "未触发不进入最终提示词",
    conflict_priority: 3
  },
  "ingredient-mechanism": {
    activation_conditions: ["ingredient_source_confirmed"],
    exclusion_conditions: ["no_ingredient_data"],
    required_context: ["ingredient_fact"],
    execution_mode: EXECUTION_MODE.CONDITIONAL,
    output_contract: "仅在成分/原理有可靠资料时输出",
    downstream_usage: "generation_instruction(conditional)",
    prompt_injection_policy: "未触发不进入最终提示词",
    conflict_priority: 3
  },
  "industry-cleaning": {
    activation_conditions: ["industry_id_cleaning"],
    exclusion_conditions: ["industry_id_not_cleaning"],
    required_context: ["industryProfile"],
    execution_mode: EXECUTION_MODE.CONDITIONAL,
    output_contract: "仅清洁日化行业加载该包规则",
    downstream_usage: "planning + internal_audit",
    prompt_injection_policy: "仅行业观察点/禁忌进入，非全文",
    conflict_priority: 2
  },
  "product-authenticity": {
    activation_conditions: [],
    exclusion_conditions: [],
    required_context: [],
    execution_mode: EXECUTION_MODE.MANDATORY,
    output_contract: "所有产品必须的商品真实性保护",
    downstream_usage: "generation_instruction + audit_rules",
    prompt_injection_policy: "全局精简指令，不重复全文",
    conflict_priority: 0
  }
};

// 读取正式 professional-skills 配置（V2-PRO-003 八项正式专业规则），映射到评估引擎的现有能力 ID。
// 映射只取"已有能力 ID"作为 key，正式契约 12 字段原样透传；正式配置缺失时回退工程基线。
const PROFESSIONAL_SKILLS_REL = "./config/professional-skills-v1.json";
const FORMAL_TO_ENGINE_ID = {
  // 仅把正式"条件能力"映射到 V2-PRO-002 已建的引擎能力 ID，供既有触发断言消费。
  // 核心强制能力以正式 ID 独立存在，不映射到 industry-cleaning 等语义不同的键。
  "figure-usage-scene": "model-pose",
  "product-specialty-expression": "product-structure"
};
function readProfessionalSkills() {
  try {
    const cfg = JSON.parse(readFileSync(new URL(PROFESSIONAL_SKILLS_REL, import.meta.url), "utf8"));
    return cfg?.status === "professional_content" ? cfg : null;
  } catch {
    return null;
  }
}

export function professionalSkillsConfig() {
  return readProfessionalSkills();
}

function resolveActivationTable(config = activeConfig()) {
  const skillsCfg = readProfessionalSkills();
  if (skillsCfg?.activationContracts) {
    const table = {};
    for (const [formalId, contract] of Object.entries(skillsCfg.activationContracts)) {
      // 用正式 ID 作 key，同时为引擎已知的能力 ID 建别名（不新建能力，仅映射）。
      table[formalId] = contract;
      if (FORMAL_TO_ENGINE_ID[formalId]) {
        const engineId = FORMAL_TO_ENGINE_ID[formalId];
        // Owner 裁决：正式专业触发定义是唯一权威。旧引擎 ID 只是别名，直接指向同一份正式契约，
        // 判定条件不掺入 BASE_ACTIVATION 的旧键——旧机制不得覆盖正式定义、不得造成误触发。
        table[engineId] = { ...contract, _formalId: formalId, _legacyAlias: engineId };
      }
    }
    // 保留引擎既有能力 ID（V2-PRO-002 门禁依赖），缺省时从正式专项契约派生。
    for (const key of Object.keys(BASE_ACTIVATION)) {
      if (!table[key]) table[key] = BASE_ACTIVATION[key];
    }
    return table;
  }
  // 回退：旧 skillActivation 或工程基线。
  const formal = config?.skillActivation && typeof config.skillActivation === "object" ? config.skillActivation : null;
  return formal && Object.keys(formal).length > 0 ? formal : BASE_ACTIVATION;
}

// 校验正式 Skill 触发表每项十二字段齐备（门禁可调用）。
// 默认校验正式 professional-skills 配置的 activationContracts；合并表含 V2-PRO-002 工程基线能力（8 字段），
// 不作为正式契约校验对象（它们不是正式 Skill，只是能力模块）。
export function validateActivationContracts(table = null) {
  const source = table || readProfessionalSkills()?.activationContracts || {};
  const results = [];
  for (const [id, contract] of Object.entries(source)) {
    const missing = CONTRACT_FIELDS.filter((f) => !(f in (contract || {})));
    const modeOk = Object.values(EXECUTION_MODE).includes(contract?.execution_mode);
    results.push({ id, ok: missing.length === 0 && modeOk, missing, mode: contract?.execution_mode || null });
  }
  return contractsReport(results);
}

function contractsReport(results) {
  return {
    contractStatus: "engineering_verification_only",
    fieldCount: CONTRACT_FIELDS.length,
    fields: CONTRACT_FIELDS.slice(),
    total: results.length,
    passed: results.filter((r) => r.ok).length,
    results
  };
}

// Owner 裁决：旧触发键可以兼容，但必须在输入侧映射到正式键；正式定义权威。
// 映射是"归一化输入"，不是"另起判定源"——旧键只有翻译成正式键后才参与正式条件判定，
// 翻译不到的旧键一律忽略，绝不让旧机制绕过正式条件造成误触发。
export const LEGACY_CONTEXT_KEY_MAP = Object.freeze({
  user_requires_model: "user_requires_figure",
  explicit_figure_task: "explicit_figure_task",
  industry_id_cleaning: "industry_cleaning_active",
  reliable_effect_evidence: "specialty_condition_met",
  effect_evidence: "specialty_evidence",
  // V2-PRO-003 结构专项修复：结构"任务信号"（非事实）归一化到六类专项共用的聚合 activation 键；
  // 结构事实 confirmed_structure_fact 仍只作 specialty_evidence，不冒充触发条件。
  // 与效果路径共用 specialty_condition_met 是为了不改单一聚合契约、不动其他五类专项。
  structure_task_required: "specialty_condition_met",
  confirmed_structure_fact: "specialty_evidence",
  ordinary_packaging: "specialty_condition_unmet",
  // PRO-003 QC纠偏：两个独立主动入口（按钮/用户明确请求）的输入侧旧别名统一归一化到 qc_requested。
  // 单键 activation 经 conditionsMet.every 等价 OR；两入口同时成立只产生一个键，不重复执行。
  user_clicks_qc: "qc_requested",
  user_requests_review: "qc_requested"
});

export function normalizeContextKeys(contextKeys = []) {
  const normalized = new Set();
  const legacyHits = [];
  for (const raw of (Array.isArray(contextKeys) ? contextKeys : [])) {
    const key = String(raw || "");
    normalized.add(key); // 正式键原样保留
    if (Object.hasOwn(LEGACY_CONTEXT_KEY_MAP, key)) {
      const formal = LEGACY_CONTEXT_KEY_MAP[key];
      normalized.add(formal);
      legacyHits.push({ legacy: key, formal });
    }
  }
  return { keys: normalized, legacyHits };
}

// 判断某个上下文事实集合是否满足条件：
// - 条件字符串以 "!" 开头表示要求该 key 不存在；否则要求存在。
function conditionsMet(conditions, ctxKeys) {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  return conditions.every((cond) => {
    const need = String(cond);
    if (need.startsWith("!")) return !ctxKeys.has(need.slice(1));
    return ctxKeys.has(need);
  });
}

// 对单个能力做触发判定，返回四态之一 + 原因（可审计）
export function evaluateActivation(id, contract, ctx = {}) {
  const normalized = normalizeContextKeys(ctx.contextKeys || []);
  const ctxKeys = normalized.keys;
  const mode = contract?.execution_mode || EXECUTION_MODE.INACTIVE;
  // 权威来源：正式契约优先；仅在正式配置缺失时才用工程基线（baseline），并显式标注。
  const authoritySource = contract?._formalId || contract?._legacyAlias
    ? "formal_professional_contract"
    : (readProfessionalSkills() ? "formal_professional_contract" : "engineering_baseline");
  const reason = {
    id,
    mode,
    activationMet: conditionsMet(contract?.activation_conditions, ctxKeys),
    exclusionHit: (Array.isArray(contract?.exclusion_conditions) ? contract.exclusion_conditions : [])
      .some((cond) => String(cond).startsWith("!") ? !ctxKeys.has(String(cond).slice(1)) : ctxKeys.has(String(cond))),
    requiredContextMet: conditionsMet(contract?.required_context, ctxKeys)
  };

  let decision;
  if (mode === EXECUTION_MODE.INACTIVE) decision = EXECUTION_MODE.INACTIVE;
  else if (reason.exclusionHit) decision = EXECUTION_MODE.INACTIVE;
  else if (!reason.activationMet || !reason.requiredContextMet) decision = EXECUTION_MODE.INACTIVE;
  else if (mode === EXECUTION_MODE.MANDATORY) decision = EXECUTION_MODE.MANDATORY;
  else decision = EXECUTION_MODE.CONDITIONAL;

  return {
    ...reason,
    authoritySource,
    legacyHits: normalized.legacyHits,
    decision,
    active: decision === EXECUTION_MODE.MANDATORY || decision === EXECUTION_MODE.CONDITIONAL,
    injectToPrompt: Boolean(contract?.prompt_injection_policy) && decision !== EXECUTION_MODE.INACTIVE,
    auditReason: `authority=${authoritySource}; mode=${mode}; activation=${reason.activationMet}; exclusion=${reason.exclusionHit}; required=${reason.requiredContextMet}`
  };
}

// 批量触发判定：返回激活清单 / 未激活清单 / 每项的为什么（可审计）
export function evaluateAllActivations(ctx = {}, table = resolveActivationTable()) {
  const results = Object.entries(table).map(([id, contract]) => evaluateActivation(id, contract, ctx));
  return {
    activationStatus: "engineering_verification_only",
    activeIds: results.filter((r) => r.active).map((r) => r.id),
    inactiveIds: results.filter((r) => !r.active).map((r) => r.id),
    injectedIds: results.filter((r) => r.injectToPrompt).map((r) => r.id),
    results
  };
}

// ---------- 提示词分层组装 ----------
// A 全局共享约束 / B 当前屏任务 / C 条件指令 / D 内部质检（不注入）
export function assemblePromptLayers({ globalLines = [], screenLines = [], conditionalLines = [], internalAudit = [] } = {}) {
  const activeGlobal = globalLines.filter(Boolean);
  const activeScreen = screenLines.filter(Boolean);
  const activeConditional = conditionalLines.filter(Boolean);
  return {
    assemblyStatus: "engineering_verification_only",
    global: activeGlobal,
    screen: activeScreen,
    conditional: activeConditional,
    internalAudit: internalAudit.filter(Boolean),
    // 最终生图指令只由 A/B/C 组成；D 内部质检绝不进入。
    finalInstruction: [...activeGlobal, ...activeScreen, ...activeConditional].join("\n"),
    auditIsolated: true
  };
}

// ---------- 编译器授权（只消费 admitted 任务 + 记录来源） ----------
// 对每段候选指令：无来源或来源任务未 admitted → 丢弃并记审计。
export function compileWithAuthorization(entries = [], admittedTaskIds = []) {
  const audit = createCompilerAudit();
  const admitted = new Set(admittedTaskIds);
  const kept = [];
  const dropped = [];
  for (const entry of entries) {
    const text = String(entry?.text || "");
    const sourceField = String(entry?.sourceField || "");
    const sourceTaskId = String(entry?.sourceTaskId || "");
    const taskAuthorized = !sourceTaskId || admitted.has(sourceTaskId);
    const hasSource = Boolean(sourceField || sourceTaskId);
    if (hasSource && taskAuthorized) {
      audit.record({ text, sourceField, sourceTaskId });
      kept.push(entry);
    } else {
      dropped.push({ text, reason: !hasSource ? "no_source" : "task_not_admitted" });
    }
  }
  return {
    compileStatus: "engineering_verification_only",
    kept,
    dropped,
    admittedTaskIds,
    text: kept.map((e) => e.text).join("\n"),
    audit: audit.report({ plannedTaskIds: admittedTaskIds, usedTaskIds: kept.map((e) => e.sourceTaskId).filter(Boolean) })
  };
}

// V2-PRO-003 第七节：视觉方案缺失时不得回退固定模板。
// 用当前屏内容任务 + 已确认事实 + 整套视觉DNA 组装确定性视觉骨架（非"商品居中/标题上方"套话）。
// 若三项皆缺，返回 null 表示"视觉策划缺失"，由调用方只输出商品真实性约束、不冒充专业策划。
// V2-UNIVERSAL-CATEGORY：商品展示角色（Primary/Secondary/Detail/Contextual/Absent）在编译层有落点。
// 全品类通用——角色由本屏任务推断，不强制每屏展示商品；Absent 允许商品不直接出现。
export const PRODUCT_DISPLAY_ROLES = Object.freeze({
  PRIMARY: "Primary", SECONDARY: "Secondary", DETAIL: "Detail", CONTEXTUAL: "Contextual", ABSENT: "Absent"
});
// 商品展示角色→可执行的呈现约束句（全品类通用；Primary/未指定不加句）。
function roleClause(productRole = "") {
  if (productRole === PRODUCT_DISPLAY_ROLES.DETAIL) return "以商品真实局部细节为主体，不要求完整商品占据画面";
  if (productRole === PRODUCT_DISPLAY_ROLES.CONTEXTUAL) return "商品在合理使用场景中出现，重点表现商品与场景/对象的关系";
  if (productRole === PRODUCT_DISPLAY_ROLES.SECONDARY) return "商品作辅助识别出现，不必占据画面主体";
  if (productRole === PRODUCT_DISPLAY_ROLES.ABSENT) return "本屏不直接展示完整商品，商品身份由整套商品参考资料保持约束";
  return "";
}
export function buildScreenVisual({ moduleName = "", contentTask = "", composition = "", confirmedFacts = [], visualDNA = {}, productRole = "" } = {}) {
  const comp = String(composition || "").trim();
  // 固定套话识别（任务书第七节点名的模板）：命中即视为无有效视觉策划，不用模板冒充。
  const templatePattern = /(主体清晰|商品居中|产品居中|居中或略偏黄金分割|一屏只讲|一个主要卖点|画面简洁|有结束感|背景干净|标题层级明确|标题上方|卖点两侧|突出产品|保留呼吸感)/;
  const isTemplate = templatePattern.test(comp) || comp.length < 12;
  const hasComposition = comp.length >= 8 && !isTemplate;
  // 有 AI composition 时也补一句角色约束（不覆盖原构图），确保展示角色在编译层真正生效。
  if (hasComposition) {
    const clause = roleClause(productRole);
    return { text: clause ? `${comp}；${clause}。` : comp, source: "ai_composition", isTemplateFallback: false };
  }

  // 用已确认事实与视觉DNA 组装具体骨架；每条都来自真实上下文，不是固定句库。
  const facts = (Array.isArray(confirmedFacts) ? confirmedFacts : []).filter(Boolean).slice(0, 4);
  const palette = String(visualDNA.palette || "").trim();
  const lighting = String(visualDNA.lighting || "").trim();
  const camera = String(visualDNA.cameraLanguage || "").trim();
  const parts = [];
  if (moduleName) parts.push(`围绕「${moduleName}」任务组织画面`);
  const roleText = roleClause(productRole);
  if (roleText) parts.push(roleText);
  if (contentTask) parts.push(`本屏信息目标：${contentTask}`);
  if (facts.length) parts.push(`画面须呈现已确认事实：${facts.join("、")}`);
  if (palette) parts.push(`色调遵循整套 DNA：${palette}`);
  if (lighting) parts.push(`布光：${lighting}`);
  if (camera) parts.push(`镜头语言：${camera}`);
  parts.push("场景、主体与文字关系须服务本屏任务，不得引入未授权事实或专项");

  if (parts.length <= 1 && !palette && !lighting) return null; // 无可依据内容 → 视觉策划缺失，不冒充。
  return { text: parts.join("；") + "。", source: "context_assembly", isTemplateFallback: false };
}

export default {
  EXECUTION_MODE,
  CONTRACT_FIELDS,
  LEGACY_CONTEXT_KEY_MAP,
  normalizeContextKeys,
  professionalSkillsConfig,
  validateActivationContracts,
  evaluateActivation,
  evaluateAllActivations,
  assemblePromptLayers,
  compileWithAuthorization,
  checkSellingPointBoundary,
  buildScreenVisual
};
