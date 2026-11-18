// V2-PRO-002：Skill 按需触发契约 + 提示词分层组装（工程机制层）
// 🔴 边界：本模块只实现"触发判定 / 分层组装 / 编译授权"的工程机制。
//    各 Skill / 能力模块的 activation_conditions 等专业值来自 ChatGPT 正式配置；
//    未配置时按 inactive / 保守处理，绝不用工程默认值冒充专业规则。
// 保持单 Planner、单次调用；不新增 Provider / KEY / 生图链路；不改 G-2 与冻结模块。

import { activeConfig, createCompilerAudit, ADMISSION } from "./index.js";

// V2-PRO-002：卖点事实边界校验（消费正式配置的 noGeneralization，不自行发明规则）。
// 返回 { allowed, reason }；命中行业禁止泛化词时拦截，避免未确认事实进提示词。
export function checkSellingPointBoundary(sellingPoint, industryId = "generic", config = activeConfig()) {
  const text = String(sellingPoint || "");
  const pack = config?.industryPacks?.[industryId];
  const forbidden = Array.isArray(pack?.noGeneralization) ? pack.noGeneralization : [];
  // 从禁止泛化规则中提取可检测的关键词（规则是自然句，这里只取明确污渍/材质/功效词）。
  const detectWords = [];
  for (const rule of forbidden) {
    const matches = String(rule).match(/奶渍|蛋白质污渍|蛋白类|所有织物|所有材质|所有卫浴材质|杀菌|除菌|消毒|所有厨具/g) || [];
    detectWords.push(...matches);
  }
  // "所有织物/所有材质"的具体表现词（专业规则 §3.4 禁止把具体对象扩为全部相似对象）：
  // 仅在 cleaning 行业且无对应 visible 事实时视为未确认扩展。
  if (industryId === "cleaning") {
    detectWords.push("可水洗内衣", "贴身衣物", "化纤", "混纺", "布艺沙发", "窗帘", "床垫", "奶渍", "蛋白质");
  }
  const hits = [...new Set(detectWords)].filter((word) => text.includes(word));
  return {
    allowed: hits.length === 0,
    reason: hits.length ? `forbidden_generalization:${hits.join(",")}` : "ok",
    hits
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
  "execution_mode",
  "output_contract",
  "downstream_usage",
  "prompt_injection_policy",
  "conflict_priority"
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

// 读取正式配置的触发表（若 ChatGPT 已交付 skillActivation），否则用工程基线。
function resolveActivationTable(config = activeConfig()) {
  const formal = config?.skillActivation && typeof config.skillActivation === "object" ? config.skillActivation : null;
  return formal && Object.keys(formal).length > 0 ? formal : BASE_ACTIVATION;
}

// 校验触发表每项八字段齐备（门禁可调用）
export function validateActivationContracts(table = resolveActivationTable()) {
  const results = [];
  for (const [id, contract] of Object.entries(table)) {
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
  const ctxKeys = new Set(Array.isArray(ctx.contextKeys) ? ctx.contextKeys : []);
  const mode = contract?.execution_mode || EXECUTION_MODE.INACTIVE;
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
    decision,
    active: decision === EXECUTION_MODE.MANDATORY || decision === EXECUTION_MODE.CONDITIONAL,
    injectToPrompt: Boolean(contract?.prompt_injection_policy) && decision !== EXECUTION_MODE.INACTIVE,
    auditReason: `mode=${mode}; activation=${reason.activationMet}; exclusion=${reason.exclusionHit}; required=${reason.requiredContextMet}`
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

export default {
  EXECUTION_MODE,
  CONTRACT_FIELDS,
  validateActivationContracts,
  evaluateActivation,
  evaluateAllActivations,
  assemblePromptLayers,
  compileWithAuthorization,
  checkSellingPointBoundary
};
