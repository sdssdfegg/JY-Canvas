// server/features/detail-studio/planning/qc-review.js
//
// B4 质量审查编排：确定性 checklist + 独立 1 次模型调用（review）+ 一次定向修正 + 再审查（封顶）。
// 设计真相源：V202 §3 B4 / §4 / 验收 §7-7。
//
// 红线：
//  - 质检步骤模型调用封顶为「review + re-review」合计 ≤2 次；MAX_AUTO_FIX=1 保证定向修正只发生一次、不无限循环。
//  - 定向修正零模型：只做确定性纠正（剔 unconfirmed / 设首屏锚 / 轮换相邻构图 / 重编译 parity），绝不发明文案或事实。
//  - 仍不合格就明确交回人工（needsHuman=true），禁止第三轮调用。

import { extractJsonObject, modelName, postChatCompletion, responseContent } from "../../../core/ai-chat-shared.js";
import { resolveApiKey } from "../../../core/image-error-policy.js";
import { channelBaseCandidates } from "../../../core/image-channel-candidates.js";
import { DETAIL_STUDIO_MODEL_SPEC } from "../model/model-config.js";
import { compileScreenPlan } from "./compile-screen.js";
import { runChecklist, applyDirectedFix } from "../../../../prompts/detail-studio/quality/checklist.js";
import { QC_SYSTEM_PROMPT, buildQcUserPrompt } from "../../../../prompts/detail-studio/quality/qc-prompt.js";

/** 质检步骤定向修正次数硬上限（验收 §7-7：一次定向修正 + 再审查封顶）。 */
export const MAX_AUTO_FIX = 1;

/**
 * 单一模型质检调用（review 或 re-review 共用）。
 * @returns {{ ok: boolean, findings?: Array, status?: number, message?: string }}
 */
async function callQcModel({ project, apiKey, textModel, signal }) {
  const planning = project.planning || {};
  const screens = Array.isArray(planning.screens) ? planning.screens : [];
  const frozen = planning.frozenPrompts && typeof planning.frozenPrompts === "object" ? planning.frozenPrompts : {};
  const systemPrompt = QC_SYSTEM_PROMPT;
  const userPrompt = buildQcUserPrompt({
    screens,
    frozenPrompts: frozen,
    analyze: planning.analyze,
    appliedOptions: planning.appliedOptions
  });
  const key = resolveApiKey(apiKey);
  if (!key) return { ok: false, status: 401, message: "请先在设置页填写 API Key" };
  const gateways = channelBaseCandidates();
  const baseUrl = Array.isArray(gateways) && gateways[0] ? gateways[0] : "";
  if (!baseUrl) return { ok: false, status: 502, message: "未配置可用网关" };
  const model = modelName({ textModel }, DETAIL_STUDIO_MODEL_SPEC);
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3,
    max_tokens: 3000,
    response_format: { type: "json_object" }
  };
  let parsed;
  try {
    const result = await postChatCompletion({ baseUrl, apiKey: key, body, signal });
    if (!result.response.ok) {
      return { ok: false, status: result.response.status, message: "上游返回 HTTP " + result.response.status };
    }
    parsed = extractJsonObject(responseContent(result.parsed && result.parsed.json), "质检");
  } catch (error) {
    return {
      ok: false,
      status: error && error.name === "AbortError" ? 504 : 502,
      message: error instanceof Error ? error.message : String(error)
    };
  }
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  return { ok: true, findings };
}

function normalizeLlmFindings(findings = []) {
  return (Array.isArray(findings) ? findings : []).map((f) => ({
    category: String(f.category || "completeness"),
    severity: f.severity === "blocker" ? "blocker" : "warn",
    screenId: f.screenId != null ? String(f.screenId) : null,
    field: String(f.field || ""),
    message: String(f.message || ""),
    autoFixable: false
  }));
}

function mergeFindings(...lists) {
  const seen = new Set();
  const out = [];
  for (const f of lists.flat()) {
    if (!f) continue;
    const key = `${f.category}|${f.screenId}|${f.field}|${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

/**
 * B4 质检主流程。
 * @returns {{ ok, findings, deterministicFindings, llmFindings, reReviewFindings, fixedCount, needsHuman, updatedScreens?, recompiled? } | { ok:false, status, message }}
 */
export async function runQualityCheck({ project, apiKey, textModel, signal } = {}) {
  if (!project || !project.id) return { ok: false, status: 400, message: "项目不存在" };
  const planning = project.planning || {};
  const screens = Array.isArray(planning.screens) ? planning.screens : [];
  if (!screens.length) return { ok: false, status: 400, message: "尚无分屏方案，无法质检" };

  const deterministicFindings = runChecklist(project);

  // 第 1 次模型调用：独立质检（review）。
  const review = await callQcModel({ project, apiKey, textModel, signal });
  if (!review.ok) return { ok: false, status: review.status || 502, message: review.message };
  const llmFindings = normalizeLlmFindings(review.findings);

  let findings = mergeFindings(deterministicFindings, llmFindings);
  let safetyFixes = 0;
  let reReviewFindings = [];
  let updatedScreens = null;
  let recompiled = null;

  // 一次定向修正 + 再审查：受 MAX_AUTO_FIX 上限约束，永不触发第 3 次模型调用。
  while (findings.some((f) => f.severity === "blocker") && safetyFixes < MAX_AUTO_FIX) {
    const fixResult = applyDirectedFix(project, findings);
    if (!fixResult.changed) break;
    updatedScreens = fixResult.screens;
    if (fixResult.needRecompile) {
      const compiled = compileScreenPlan({ ...project, planning: { ...planning, screens: updatedScreens } });
      recompiled = compiled.frozenPrompts;
    }
    safetyFixes += 1;
    // 第 2 次模型调用：再审查（re-review），封顶。
    const reProject = {
      ...project,
      planning: { ...planning, screens: updatedScreens, frozenPrompts: recompiled || planning.frozenPrompts }
    };
    const reReview = await callQcModel({ project: reProject, apiKey, textModel, signal });
    if (reReview.ok) reReviewFindings = normalizeLlmFindings(reReview.findings);
    findings = mergeFindings(findings, reReviewFindings);
  }

  const finalFindings = mergeFindings(deterministicFindings, llmFindings, reReviewFindings);
  const stillBlocker = finalFindings.some((f) => f.severity === "blocker");
  return {
    ok: true,
    findings: finalFindings,
    deterministicFindings,
    llmFindings,
    reReviewFindings,
    fixedCount: safetyFixes,
    needsHuman: stillBlocker,
    updatedScreens,
    recompiled
  };
}
