// server/features/detail-studio/planning/director-visual.js
//
// 批次②（导演 + 分屏 + 单屏视觉）：1 次 postChatCompletion，产出结构化 ScreenSpec[]。
// 设计真相源：V4.0-详情创作工作区-阶段3A设计报告.md §3.1.1 / §3.6.5 / §3.8.1（B2）。
//
// 红线：
//  - 批次②只承载「叙事/分屏/单屏视觉」，不写最终生图提示词（那是 B3 确定性编译器的职责）。
//  - 商品事实只接收「可发布」分级；unconfirmed 既在上下文侧过滤，又在 normalize 程序层二次剔除，
//    确保 unconfirmed 事实永不进入 ScreenSpec / frozenPrompt（用户指示 + 验收 §7-2）。
//  - 复用 B1 的 buildAnalyzeContext 产出的规划上下文（options / globalLock / platformProfile / industryStrategy），
//    不重复解析行业/平台。

import { extractJsonObject, modelName, postChatCompletion, responseContent } from "../../../core/ai-chat-shared.js";
import { resolveApiKey } from "../../../core/image-error-policy.js";
import { channelBaseCandidates } from "../../../core/image-channel-candidates.js";
import { DETAIL_STUDIO_MODEL_SPEC } from "../model/model-config.js";
import { buildAnalyzeContext, extractPlanningOptions } from "./analyze-strategy.js";
import { selectScreenModule, SCREEN_MODULE_LIBRARY } from "../../../../prompts/detail-studio/core/screen-composition.js";
import { isPublishableGrade } from "../../../../prompts/detail-studio/core/fact-grading.js";
import {
  DIRECTOR_SYSTEM_PROMPT,
  buildDirectorUserPrompt
} from "../../../../prompts/detail-studio/prompts/director-visual.js";

/** 屏数硬上限（任务书口径 + 阶段 0/2 已定）。 */
export const MAX_SCREEN_COUNT = 20;

// ── V210（2026-11-12）：超时 / max_tokens 按目标屏数分档，不再硬编码 90s/3000 ──
// 20 屏结构化中文 JSON 天然慢且耗 token，90s/3000 是紧约束（执行单 §1.2）。
// 分档只放宽上限，不改任何渠道 / 模型 / KEY 体系；analyze 的 60s/2000 不受此影响。
export const PLANNING_TIERS = Object.freeze([
  { max: 8, timeoutMs: 90000, maxTokens: 3000 },
  { max: 14, timeoutMs: 120000, maxTokens: 5000 },
  { max: 20, timeoutMs: 180000, maxTokens: 8000 }
]);

export function planningTierForCount(count) {
  const c = Number.isFinite(Number(count)) ? Number(count) : 8;
  return PLANNING_TIERS.find((t) => c <= t.max) || PLANNING_TIERS[PLANNING_TIERS.length - 1];
}

// 从项目解析导演目标屏数（与 buildDirectorContext 同源，避免路由与内部两套口径漂移）。
export function directorTargetScreenCount(project = {}) {
  const options = extractPlanningOptions(project);
  return Math.min(MAX_SCREEN_COUNT, Number.isFinite(options.screenCount) ? options.screenCount : 8);
}

// V210：把模型调用失败统一归类为「类别 + 人话建议」，消息绝不夹带上游正文（数据红线）。
// 纯函数、零依赖，供 directVisualPlan 与 verify 脚本共用。
export function classifyPlanningError(kind, options = {}) {
  switch (kind) {
    case "timeout":
      return {
        status: 504,
        errorClass: "timeout",
        message: "规划生成超时：上游未在限定时间内返回结果",
        suggestion: "可点击重试；目标屏数较多时生成较久属正常，请耐心等待或稍后再试"
      };
    case "upstream_error": {
      const status = Number.isFinite(Number(options.status)) ? Number(options.status) : 502;
      return {
        status,
        errorClass: "upstream_error",
        message: `上游返回 HTTP ${status}`,
        suggestion: "请检查网络与网关状态，或稍后重试"
      };
    }
    case "no_content":
      return {
        status: 502,
        errorClass: "no_content",
        message: "上游未返回任何内容",
        suggestion: "请检查网络与 KEY 是否填写正确，或重试"
      };
    case "parse_failed":
    default:
      return {
        status: 502,
        errorClass: "parse_failed",
        message: "上游返回内容解析失败（可能截断或不完整）",
        suggestion: "请重试一次；若仍失败，可减少目标屏数或检查模型/渠道"
      };
  }
}

// V210：空 screens（静默 0 屏）明确抛错，禁止 directVisualPlan 返回 ok:true/screens:[] 误导前端。
export function assertNonEmptyScreens(normalized) {
  if (!normalized || !Array.isArray(normalized.screens) || normalized.screens.length === 0) {
    throw new Error("分屏列表为空（empty_screens）");
  }
  return normalized;
}

/**
 * 纯函数：从批次①结论里挑出「可发布」分级的事实（剔除 unconfirmed）。
 * @param {Array} facts
 * @returns {Array<{key,value,grade,field}>}
 */
export function filterPublishableFacts(facts = []) {
  return (Array.isArray(facts) ? facts : [])
    .filter((f) => f && isPublishableGrade(f.grade))
    .map((f) => ({
      key: String(f.key || ""),
      value: String(f.value == null ? "" : f.value),
      grade: f.grade,
      field: String(f.field || "")
    }));
}

/**
 * 纯函数：构建批次②上下文（不触模型）。供单测与「展示 == 实际」核对。
 * 复用 B1 buildAnalyzeContext 的规划上下文，并只暴露「可发布事实」给导演。
 * @returns {{ systemPrompt, userPrompt, context }}
 */
export function buildDirectorContext(project = {}) {
  const base = buildAnalyzeContext(project);
  const planningContext = base.context || {};
  const analyze = (project.planning && project.planning.analyze) || planningContext.analyze || {};
  const rawFacts = Array.isArray(analyze.facts) ? analyze.facts : [];
  const publishableFacts = filterPublishableFacts(rawFacts);
  const options = planningContext.options || {};
  const screenCount = Math.min(
    MAX_SCREEN_COUNT,
    Number.isFinite(Number(options.screenCount)) ? Number(options.screenCount) : 8
  );
  const referenceMeta = (project.referenceImages || [])
    .map((r) => ({ role: r.role, filename: r.filename, label: r.label }));

  const userPrompt = buildDirectorUserPrompt({
    analyze,
    publishableFacts,
    screenCount,
    globalLockContext: {
      globalLock: planningContext.globalLock,
      platformProfile: planningContext.platformProfile
    },
    industryStrategy: planningContext.industryStrategy,
    options,
    referenceMeta
  });

  return {
    systemPrompt: DIRECTOR_SYSTEM_PROMPT,
    userPrompt,
    context: {
      analyze,
      publishableFacts,
      screenCount,
      options,
      globalLock: planningContext.globalLock,
      platformProfile: planningContext.platformProfile,
      industryStrategy: planningContext.industryStrategy,
      appliedOptions: planningContext.appliedOptions,
      referenceMeta
    }
  };
}

/**
 * S0/B2：解析导演返回的模块 id。
 * DIRECTOR_OUTPUT_SCHEMA 把 moduleId 定义在 screens[] 顶层
 * （prompts/detail-studio/prompts/director-visual.js），旧实现却只读 composition.moduleId，
 * 导致模型即使返回库内合法 id 也几乎必然走「按位置回退」，且无任何告警 ——
 * S3 引入客户板块选择后，用户选择会被静默丢弃。这里同时兼容两条路径、优先顶层；
 * 给了 id 但未命中库时返回 warning，由调用方显式输出（不落库、不改 ScreenSpec 结构）。
 */
export function resolveScreenModule(screen = {}, index = 0, count = 1) {
  const raw = (screen && typeof screen === "object") ? screen : {};
  const composition = (raw.composition && typeof raw.composition === "object") ? raw.composition : {};
  const requestedId = String(raw.moduleId || composition.moduleId || "").trim();
  const entry = requestedId ? SCREEN_MODULE_LIBRARY[requestedId] : null;
  if (entry) return { moduleEntry: entry, requestedId, fallback: false, warning: "" };
  const fallback = selectScreenModule(raw.role || raw.goal || "", index, count);
  const warning = requestedId
    ? `导演返回未命中模块库的 moduleId="${requestedId}"，屏 #${index + 1} 已回退为 ${fallback.id}`
    : "";
  return { moduleEntry: fallback, requestedId, fallback: true, warning };
}

/**
 * 纯函数：把模型原始 JSON 规范化为结构化 ScreenSpec[]（程序层二次剔除 unconfirmed / 补全结构）。
 * @param {Object} raw
 * @returns {{ narrativeSummary, visualDNA, screens }}
 */
export function normalizeDirectorResult(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const narrativeSummary = String(data.narrativeSummary || "");
  const vd = data.visualDNA && typeof data.visualDNA === "object" ? data.visualDNA : {};
  const visualDNA = {
    palette: String(vd.palette || ""),
    lighting: String(vd.lighting || ""),
    mood: String(vd.mood || ""),
    fontTone: String(vd.fontTone || "")
  };
  let screens = Array.isArray(data.screens) ? data.screens : [];
  screens = screens.map((s, index) => {
    const screen = s && typeof s === "object" ? s : {};
    const composition = screen.composition && typeof screen.composition === "object" ? screen.composition : {};
    const hierarchy = composition.hierarchy && typeof composition.hierarchy === "object" ? composition.hierarchy : {};
    const copy = screen.copy && typeof screen.copy === "object" ? screen.copy : {};
    // S0/B2：兼容 schema 顶层 moduleId 与历史 composition.moduleId；未命中不再静默回退。
    const resolvedModule = resolveScreenModule(screen, index, screens.length);
    const moduleEntry = resolvedModule.moduleEntry;
    if (resolvedModule.warning) {
      console.warn("[detail-studio] " + resolvedModule.warning);
    }
    // 单屏事实：只保留可发布分级（防御模型又把 unconfirmed 写进来）。
    const productFacts = (Array.isArray(screen.productFacts) ? screen.productFacts : [])
      .filter((f) => f && isPublishableGrade(f.grade))
      .map((f) => ({ key: String(f.key || ""), value: String(f.value == null ? "" : f.value), grade: f.grade, field: String(f.field || "") }));
    const referenceAssets = (Array.isArray(screen.referenceAssets) ? screen.referenceAssets : [])
      .filter((r) => r && ["product", "visualStyle", "contentStructure"].includes(r.role))
      .map((r) => ({ role: r.role, label: String(r.label || "") }));
    const visualWeight = Math.min(0.9, Math.max(0.3, Number(composition.visualWeight) || 0.6));
    return {
      id: `screen_${index + 1}`,
      index,
      role: String(screen.role || moduleEntry.id),
      goal: String(screen.goal || ""),
      moduleId: moduleEntry.id,
      moduleName: moduleEntry.name,
      composition: {
        layout: String(composition.layout || moduleEntry.composition || ""),
        visualWeight,
        referenceNeed: ["product", "visualStyle", "contentStructure", "none"].includes(composition.referenceNeed)
          ? composition.referenceNeed
          : "product",
        hierarchy: {
          primaryText: String(hierarchy.primaryText || ""),
          secondaryText: String(hierarchy.secondaryText || "")
        }
      },
      copy: {
        headline: String(copy.headline || ""),
        subcopy: String(copy.subcopy || ""),
        tags: Array.isArray(copy.tags) ? copy.tags.map(String) : []
      },
      productFacts,
      identityAnchor: String((moduleEntry.id === "hero") ? "product" : ""),
      visualDNA,
      screenOverrides: Array.isArray(screen.screenOverrides) ? screen.screenOverrides.map(String) : [],
      referenceAssets,
      prevScreenId: index > 0 ? `screen_${index}` : null,
      nextScreenId: null
    };
  });
  // 屏数钳制（≤20），超出截断（先钳制，再回填衔接链，避免末屏 nextScreenId 越界）。
  if (screens.length > MAX_SCREEN_COUNT) screens = screens.slice(0, MAX_SCREEN_COUNT);
  // 回填 nextScreenId 链。
  for (let i = 0; i < screens.length; i += 1) {
    screens[i].nextScreenId = i < screens.length - 1 ? `screen_${i + 2}` : null;
  }
  return { narrativeSummary, visualDNA, screens };
}

/**
 * 批次②主流程：加载项目 → 构建上下文 → 1 次模型调用 → 规范化 → 返回 ScreenSpec[]。
 * 持久化由调用方（路由）负责。
 */
export async function directVisualPlan({ project, apiKey, textModel, signal } = {}) {
  if (!project || !project.id) return { ok: false, status: 400, message: "项目不存在" };
  const { systemPrompt, userPrompt, context } = buildDirectorContext(project);

  const key = resolveApiKey(apiKey);
  if (!key) {
    return { ok: false, status: 401, message: "请先在设置里填写 API Key", context };
  }
  const gateways = channelBaseCandidates();
  const baseUrl = Array.isArray(gateways) && gateways[0] ? gateways[0] : "";
  if (!baseUrl) {
    return { ok: false, status: 502, message: "未配置可用网关", context };
  }
  const model = modelName({ textModel }, DETAIL_STUDIO_MODEL_SPEC);
  // V210：max_tokens 按目标屏数分档（20 屏不再被 3000 卡死）。
  const tier = planningTierForCount(context.screenCount);
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.6,
    max_tokens: tier.maxTokens,
    response_format: { type: "json_object" }
  };

  const controller = signal || new AbortController();
  const abortSignal = signal || controller.signal;
  let parsed;
  let responseChars = 0;
  try {
    const result = await postChatCompletion({ baseUrl, apiKey: key, body, signal: abortSignal });
    if (!result.response.ok) {
      const rawText = String(result.parsed && result.parsed.text ? result.parsed.text : "");
      responseChars = rawText.length;
      // V210：上游 HTTP 非 2xx → upstream_error（消息不含上游正文）。
      return {
        ok: false,
        ...classifyPlanningError("upstream_error", { status: result.response.status }),
        responseChars,
        upstreamStatus: result.response.status,
        context
      };
    }
    const rawText = String(result.parsed && result.parsed.text ? result.parsed.text : "");
    responseChars = rawText.length;
    try {
      parsed = extractJsonObject(responseContent(result.parsed && result.parsed.json), "导演分屏");
    } catch (parseError) {
      const isEmpty = /没有返回内容/.test(parseError && parseError.message ? parseError.message : "");
      // V210：解析失败 → parse_failed；空内容 → no_content（均不含上游正文）。
      return {
        ok: false,
        ...classifyPlanningError(isEmpty ? "no_content" : "parse_failed"),
        responseChars,
        upstreamStatus: 200,
        context
      };
    }
  } catch (error) {
    const isAbort = error && error.name === "AbortError";
    // V210：AbortError → timeout；其它（网络/IO）→ 归为 parse_failed 兜底（不含上游正文）。
    return {
      ok: false,
      ...classifyPlanningError(isAbort ? "timeout" : "parse_failed"),
      responseChars: 0,
      context
    };
  }

  // V210：空 screens 明确判红，禁止静默 ok:true/screens:[]。
  let normalized;
  try {
    normalized = assertNonEmptyScreens(normalizeDirectorResult(parsed));
  } catch (emptyError) {
    return {
      ok: false,
      status: 502,
      errorClass: "empty_screens",
      message: "模型返回了结构，但分屏列表为空（未生成任何屏）",
      suggestion: "请重试一次；若仍为空，请先完善商品分析，或减少目标屏数",
      responseChars,
      outputScreenCount: 0,
      upstreamStatus: 200,
      context
    };
  }
  return {
    ok: true,
    narrativeSummary: normalized.narrativeSummary,
    visualDNA: normalized.visualDNA,
    screens: normalized.screens,
    outputScreenCount: normalized.screens.length,
    responseChars,
    upstreamStatus: 200,
    context
  };
}
