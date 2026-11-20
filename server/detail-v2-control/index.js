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
  const text = String(textInput || "");
  const cleaningPack = config?.industryPacks?.cleaning;
  if (!cleaningPack || typeof cleaningPack !== "object" || Array.isArray(cleaningPack)) return null;

  const positives = Array.isArray(cleaningPack.positiveSignals) ? cleaningPack.positiveSignals : [];
  const negatives = Array.isArray(cleaningPack.negativeSignals) ? cleaningPack.negativeSignals : [];
  const hitPositive = positives.filter((word) => text.includes(word));
  const hitNegative = negatives.filter((word) => text.includes(word));
  const hitApparel = APPAREL_STRONG_SIGNALS.filter((word) => text.includes(word));

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
  const source = `${String(text || "")} ${String(aiHint || "")}`;
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
    const hitPositive = positives.filter((word) => source.includes(word));
    const hitNegative = negatives.filter((word) => source.includes(word));
    const hitWeak = weak.filter((word) => source.includes(word));
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
  professionalContentStatus,
  activeConfig,
  createTaskRegistry,
  loadIndustryPack,
  detectIndustryOverride,
  admitTask,
  admitTasks,
  createCompilerAudit
};
