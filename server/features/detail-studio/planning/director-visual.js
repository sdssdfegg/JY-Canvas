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
import { buildAnalyzeContext } from "./analyze-strategy.js";
import { selectScreenModule, SCREEN_MODULE_LIBRARY } from "../../../../prompts/detail-studio/core/screen-composition.js";
import { isPublishableGrade } from "../../../../prompts/detail-studio/core/fact-grading.js";
import {
  DIRECTOR_SYSTEM_PROMPT,
  buildDirectorUserPrompt
} from "../../../../prompts/detail-studio/prompts/director-visual.js";

/** 屏数硬上限（任务书口径 + 阶段 0/2 已定）。 */
export const MAX_SCREEN_COUNT = 20;

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
    // 模块：模型给的 moduleId 命中库则用，否则按角色/位置回退到 SCREEN_MODULE_LIBRARY 选择器。
    const moduleEntry = (composition.moduleId && SCREEN_MODULE_LIBRARY[composition.moduleId])
      ? SCREEN_MODULE_LIBRARY[composition.moduleId]
      : selectScreenModule(screen.role || screen.goal || "", index, screens.length);
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
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.6,
    max_tokens: 3000,
    response_format: { type: "json_object" }
  };

  const controller = signal || new AbortController();
  const abortSignal = signal || controller.signal;
  let parsed;
  try {
    const result = await postChatCompletion({ baseUrl, apiKey: key, body, signal: abortSignal });
    if (!result.response.ok) {
      return {
        ok: false,
        status: result.response.status,
        message: "上游返回 HTTP " + result.response.status,
        upstream: String(result.parsed && result.parsed.text ? result.parsed.text : "").slice(0, 200),
        context
      };
    }
    parsed = extractJsonObject(responseContent(result.parsed && result.parsed.json), "导演分屏");
  } catch (error) {
    return {
      ok: false,
      status: error && error.name === "AbortError" ? 504 : 502,
      message: error instanceof Error ? error.message : String(error),
      context
    };
  }

  const normalized = normalizeDirectorResult(parsed);
  return {
    ok: true,
    narrativeSummary: normalized.narrativeSummary,
    visualDNA: normalized.visualDNA,
    screens: normalized.screens,
    context
  };
}
