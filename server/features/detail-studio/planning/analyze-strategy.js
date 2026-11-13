// server/features/detail-studio/planning/analyze-strategy.js
//
// 批次①（商品分析 + 电商策划）：1 次 postChatCompletion，返回结构化 JSON。
// 设计真相源：V4.0-详情创作工作区-阶段3A设计报告.md §3.1.1 / §3.8.1（B1）。
//
// 红线：
//  - 主路径只调 1 次模型；不引入第二套 Provider / apiKey / 网关（复用 server/core/ai-chat-shared.js）。
//  - 选项 → 全局锁 → 上下文 → 逐屏 的参数链源头在此；appliedOptions 必须完整溯源。
//  - 不 import 任何 planner / skill / quality 之外的越权模块；C 路径完全不经过本文件（见 mode-c-purity 门禁）。
//
// 复用（只读）：prompts/server/detail-skills.js 的 PLATFORM_SKILLS / getPlatformSkill（执行单 §2 #8「只读复用，不修改」）。
// 行业策略解析改走 prompts/detail-studio/industry/index.js 的 getIndustryStrategy（B5 新加载器，含三条冲突消解规则，
// 修复旧 getIndustrySkillByText 把「清洁日化」误判为家居的问题）；旧 INDUSTRY_SKILLS 底座仍被该加载器只读复用。

import { extractJsonObject, modelName, postChatCompletion, responseContent } from "../../../core/ai-chat-shared.js";
import { resolveApiKey } from "../../../core/image-error-policy.js";
import { channelBaseCandidates } from "../../../core/image-channel-candidates.js";
import { DETAIL_STUDIO_MODEL_SPEC } from "../model/model-config.js";
import { buildGlobalLock } from "../../../../prompts/detail-studio/core/global-lock.js";
import { buildAppliedOptions, missingTracedOptions } from "../../../../prompts/detail-studio/core/option-trace.js";
import {
  ANALYZE_SYSTEM_PROMPT,
  buildAnalyzeUserPrompt
} from "../../../../prompts/detail-studio/prompts/analyze-strategy.js";
import { getIndustryStrategy } from "../../../../prompts/detail-studio/industry/index.js";
import { getPlatformSkill } from "../../../../prompts/server/detail-skills.js";

/** 选项白名单：参与编译、必须在 appliedOptions 中被溯源追踪的键。 */
export const TRACED_OPTION_KEYS = Object.freeze([
  "platform", "productName", "industry", "lang", "ratio", "imageSize",
  "copywriting", "fontStyle", "richness", "modelMode", "modelPose"
]);

/**
 * 从项目抽取已迁移的结构化选项（阶段 2 落库的 productData / modelConfig + 规划专属选项）。
 * V212 P2.6：基础参数面板（BasicParamsPanel）写入的 project.basicParams 优先；
 * 回退 project.productData.fields（旧结构化录入），保证存量项目零回归（R12）。
 */
export function extractPlanningOptions(project = {}) {
  const productData = project.productData || {};
  const fields = productData.fields || {};
  const bp = (project.basicParams && typeof project.basicParams === "object" && !Array.isArray(project.basicParams)) ? project.basicParams : {};
  // 取数优先级：basicParams（新建基础参数面板）> productData.fields（旧结构化录入）> 默认值
  const pick = (key, fallback) => {
    const bv = bp[key];
    if (bv !== undefined && bv !== null && String(bv) !== "") return String(bv);
    const fv = fields[key];
    if (fv !== undefined && fv !== null && String(fv) !== "") return String(fv);
    return fallback;
  };
  // 工作流键（basicParams.workflow，如 taobao-detail / tmall-detail）即平台标识，
  // 直接复用为规划链 platform（getPlatformSkill 已兼容 main/amazon 等子串）。
  const platform = (bp.workflow !== undefined && bp.workflow !== null && String(bp.workflow) !== "")
    ? String(bp.workflow)
    : (fields.platform ? String(fields.platform) : "taobao-detail");
  const options = {
    platform,
    lang: pick("lang", "中文"),
    copywriting: pick("copywriting", "need"),
    fontStyle: pick("fontStyle", "soft"),
    richness: pick("richness", "simple"),
    modelMode: pick("modelMode", "no-model"),
    modelPose: pick("modelPose", "regular"),
    ratio: pick("ratio", "21:9"),
    imageSize: pick("imageSize", "2K"),
    // 屏数来自基础参数面板的 count 控件；缺省 8
    screenCount: Number.isFinite(Number(bp.count)) && Number(bp.count) > 0 ? Number(bp.count)
      : (Number.isFinite(fields.screenCount) ? fields.screenCount : 8),
    // 三类文本域：userInstruction→customRequirements；productFeature/sellingPoints 进入分析上下文
    customRequirements: String(bp.userInstruction || fields.customRequirements || ""),
    productFeature: String(bp.productFeature || ""),
    sellingPoints: String(bp.sellingPoints || ""),
    // productName 同为被追踪选项：basicParams 优先、回退 productData.fields
    productName: String(bp.productName || fields.productName || "").trim()
  };
  return options;
}

/**
 * 解析行业策略：委托 B5 新加载器 getIndustryStrategy。
 * 显式 industryId 优先（冲突消解规则①），否则按文本关键词打分 + 同分专属词 tie-break（规则②）。
 * 修复旧 getIndustrySkillByText 把「清洁日化」误判为家居（home 关键词含 bare「清洁」）的缺陷。
 * 返回的 strategy 已合并旧 INDUSTRY_SKILLS 底座结构 + 四字段覆盖层（决策逻辑/内容规划/视觉表达/事实边界）。
 */
export function resolveIndustryStrategy(project = {}, options = {}) {
  const explicit = project.industryId || options.industryId;
  const text = [
    (project.productData && project.productData.text) || "",
    JSON.stringify((project.productData && project.productData.fields) || {}),
    options.customRequirements || ""
  ].join(" ");
  return getIndustryStrategy(text, explicit);
}

/**
 * 纯函数：由项目构建批次①上下文（不触模型）。供单测与「展示 == 实际」核对。
 * @returns {{ systemPrompt, userPrompt, context }}
 */
export function buildAnalyzeContext(project = {}) {
  const options = extractPlanningOptions(project);
  const industry = resolveIndustryStrategy(project, options);
  const platformProfile = getPlatformSkill(options.platform);
  // productName 取数已统一到 extractPlanningOptions（basicParams 优先、回退 fields），此处仅补「目标产品」兜底
  const resolvedProductName = (options.productName && options.productName.trim()) || "目标产品";
  const globalLock = buildGlobalLock({
    productName: resolvedProductName,
    ratio: options.ratio,
    imageSize: options.imageSize,
    lang: options.lang,
    copywriting: options.copywriting,
    fontStyle: options.fontStyle,
    richness: options.richness,
    modelMode: options.modelMode,
    modelPose: options.modelPose,
    screenCount: options.screenCount,
    platformProfile,
    industryStrategy: industry.strategy,
    analysis: { industry: industry.strategy.name }
  });
  const referenceMeta = (Array.isArray(project.referenceImages) ? project.referenceImages : [])
    .map((r) => ({ role: r.role, filename: r.filename, label: r.label }));
  const userPrompt = buildAnalyzeUserPrompt({
    productData: project.productData || {},
    referenceMeta,
    globalLock: globalLock.text,
    industryStrategy: industry.strategy,
    customRequirements: options.customRequirements,
    productFeature: options.productFeature,
    sellingPoints: options.sellingPoints
  });
  const appliedOptions = buildAppliedOptions({ globalLockTraces: globalLock.traces });
  const missing = missingTracedOptions(appliedOptions, TRACED_OPTION_KEYS);
  return {
    systemPrompt: ANALYZE_SYSTEM_PROMPT,
    userPrompt,
    context: {
      options,
      industryId: industry.id,
      industryExplicit: industry.explicit,
      platformProfile,
      industryStrategy: industry.strategy,
      globalLock: globalLock.text,
      appliedOptions,
      appliedOptionsComplete: missing.complete,
      appliedOptionsMissing: missing.missing,
      referenceMeta
    }
  };
}

/**
 * 纯函数：把模型原始 JSON 规范化为可落库结构，并校验事实分级 / 完整性。
 */
export function normalizeAnalyzeResult(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const facts = Array.isArray(data.facts) ? data.facts.map((f) => ({
    key: String(f.key || ""),
    value: String(f.value == null ? "" : f.value),
    grade: ["user", "visible", "inferred", "unconfirmed"].includes(f.grade) ? f.grade : "unconfirmed",
    source: String(f.source || ""),
    field: String(f.field || "")
  })) : [];
  const consumerLogic = data.consumerLogic && typeof data.consumerLogic === "object" ? data.consumerLogic : {};
  const infoGaps = Array.isArray(data.infoGaps) ? data.infoGaps.map((g) => ({
    field: String(g.field || ""),
    why: String(g.why || "")
  })) : [];
  const completeness = Math.min(1, Math.max(0, Number.isFinite(data.completeness) ? data.completeness : 0));
  return {
    facts,
    consumerLogic: {
      targetAudience: String(consumerLogic.targetAudience || ""),
      painPoints: Array.isArray(consumerLogic.painPoints) ? consumerLogic.painPoints.map(String) : [],
      purchaseMotivations: Array.isArray(consumerLogic.purchaseMotivations) ? consumerLogic.purchaseMotivations.map(String) : [],
      purchaseAnxieties: Array.isArray(consumerLogic.purchaseAnxieties) ? consumerLogic.purchaseAnxieties.map(String) : [],
      conversionLogic: String(consumerLogic.conversionLogic || "")
    },
    decisionLogic: String(data.decisionLogic || ""),
    sellingPoints: Array.isArray(data.sellingPoints) ? data.sellingPoints.map(String) : [],
    infoGaps,
    completeness,
    storyDirection: String(data.storyDirection || "")
  };
}

/**
 * 批次①主流程：加载项目 → 构建上下文 → 1 次模型调用 → 规范化 → 返回。
 * 持久化由调用方（路由）负责，保持本函数可单测、可复用。
 */
export async function analyzeProductStrategy({ project, apiKey, textModel, signal } = {}) {
  if (!project || !project.id) return { ok: false, status: 400, message: "项目不存在" };
  const { systemPrompt, userPrompt, context } = buildAnalyzeContext(project);

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
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.4,
    max_tokens: 2000,
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
        status: result.response.status,
        errorClass: "upstream_error",
        message: "上游返回 HTTP " + result.response.status,
        responseChars,
        upstreamStatus: result.response.status,
        context
      };
    }
    const rawText = String(result.parsed && result.parsed.text ? result.parsed.text : "");
    responseChars = rawText.length;
    try {
      parsed = extractJsonObject(responseContent(result.parsed && result.parsed.json), "商品分析");
    } catch (parseError) {
      const isEmpty = /没有返回内容/.test(parseError && parseError.message ? parseError.message : "");
      return {
        ok: false,
        status: 502,
        errorClass: isEmpty ? "no_content" : "parse_failed",
        message: isEmpty ? "上游未返回任何内容" : "上游返回内容解析失败（可能截断或不完整）",
        responseChars,
        upstreamStatus: 200,
        context
      };
    }
  } catch (error) {
    const isAbort = error && error.name === "AbortError";
    return {
      ok: false,
      status: isAbort ? 504 : 502,
      errorClass: isAbort ? "timeout" : "parse_failed",
      message: isAbort ? "商品分析超时：上游未在限定时间内返回" : (error instanceof Error ? error.message : String(error)),
      responseChars: 0,
      context
    };
  }

  const analysis = normalizeAnalyzeResult(parsed, context);
  return {
    ok: true,
    analysis,
    industryId: context.industryId,
    globalLock: context.globalLock,
    appliedOptions: context.appliedOptions,
    appliedOptionsComplete: context.appliedOptionsComplete,
    completeness: analysis.completeness,
    responseChars,
    upstreamStatus: 200,
    context
  };
}
