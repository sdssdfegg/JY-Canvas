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

// 专业内容接入状态：占位 / 已接入。工程验证可见；不得据占位状态判质量通过。
export function professionalContentStatus() {
  const cfg = readPendingConfig();
  return {
    status: cfg?.placeholderPolicy?.status || "pending_professional_content",
    engineeringUseOnly: cfg?.placeholderPolicy?.engineeringUseOnly !== false,
    note: cfg?.placeholderPolicy?.note || "",
    configRel: PENDING_CONFIG_REL,
    isPlaceholder: (cfg?.placeholderPolicy?.status || "pending_professional_content") === "pending_professional_content"
  };
}

// ---------- 注册表结构（只给字段骨架，不给专业值） ----------
// 每项任务：{ taskId, taskType, professionalValues: {...}|null, status }
// professionalValues 为 null 表示该任务尚无 ChatGPT 交付的专业配置，只能走占位。
export function createTaskRegistry(config = readPendingConfig()) {
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
// loadIndustryPack 只做工程判定：传入的 industryId 是否在允许集合内、是否已有正式内容。
// 本骨架不含任何行业专业规则；cleaning 包正文待 ChatGPT 交付。
export function loadIndustryPack(industryId, config = readPendingConfig()) {
  const id = String(industryId || "generic").trim() || "generic";
  const slots = Array.isArray(config?.industryPacks?.slots) ? config.industryPacks.slots : [];
  const matched = slots.includes(id);
  return {
    requestedIndustryId: id,
    activeIndustryId: matched ? id : "generic",
    loadedIndustryPackIds: [], // 专业正文未交付前恒不加载真实规则包。
    matchedButProfessionalContentPending: matched,
    fallbackMode: matched ? "matched_pending_professional_content" : "generic_no_pack",
    status: config?.industryPacks?.status || "pending_professional_content",
    engineeringUseOnly: true
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
  if (Array.isArray(values.allowedIndustries) && values.allowedIndustries.length > 0 && !values.allowedIndustries.includes(industryId)) {
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
  createTaskRegistry,
  loadIndustryPack,
  admitTask,
  admitTasks,
  createCompilerAudit
};
