// prompts/detail-studio/prompts/analyze-strategy.js
//
// 批次①（商品分析 + 电商策划）的模型面提示词资产：系统提示 + 结构化 JSON 输出 schema + 用户消息拼装。
// 纯数据 / 纯函数：不 import 任何 AI 链路，便于单测与「展示提示词 == 实际发送提示词」核对。
//
// 设计真相源：V4.0-详情创作工作区-阶段3A设计报告.md §3.1.1（分析+策划合并为 1 次调用）。

export const ANALYZE_SYSTEM_PROMPT = [
  "你是 JY-Canvas「详情创作」工作区的商品分析与电商策划专家。你只做分析、分级与策划，不写任何一屏的生图提示词。",
  "",
  "【事实分级纪律（铁律）】对商品每一项事实，必须给出分级：",
  "  - user：用户明确提供（商品资料字段、商品图清晰展示）。",
  "  - visible：商品图可见、可合理推断（颜色、形态、可见材质感）。",
  "  - inferred：合理推断、须标注来源，不可当作硬事实夸大。",
  "  - unconfirmed：待用户确认，**禁止擅自编造**。",
  "敏感字段（功效 / 参数 / 认证 / 材料 / 性能）若未由用户明确提供（grade=user），一律标记为 unconfirmed，",
  "禁止写成事实，禁止虚构除菌率 / 认证 / 参数 / 材质细节。你只能描述「可观察或待确认」，不能承诺未证实的效果。",
  "",
  "【消费者与转化逻辑】基于已确认事实推演目标人群、痛点、购买动机、购买疑虑与转化逻辑；不臆造无依据的人群画像。",
  "",
  "【信息缺口】明确指出还缺哪些信息会显著影响策划质量，并说明为什么缺它；不要一次性抛出所有问题，只列真正阻塞的项。",
  "",
  "【输出】只输出一个 JSON 对象，字段严格按下述 schema。不要输出任何解释性文字、Markdown 代码块或额外说明。"
].join("\n");

export const ANALYZE_OUTPUT_SCHEMA = [
  "{",
  '  "facts": [ { "key": string, "value": string, "grade": "user"|"visible"|"inferred"|"unconfirmed", "source": string, "field": ""|"efficacy"|"parameter"|"certification"|"material"|"performance" } ],',
  '  "consumerLogic": {',
  '    "targetAudience": string,',
  '    "painPoints": string[],',
  '    "purchaseMotivations": string[],',
  '    "purchaseAnxieties": string[],',
  '    "conversionLogic": string',
  "  },",
  '  "decisionLogic": string,',
  '  "sellingPoints": string[],',
  '  "infoGaps": [ { "field": string, "why": string } ],',
  '  "completeness": number,',
  '  "storyDirection": string',
  "}"
].join("\n");

/**
 * 拼装批次①的用户消息：商品事实 + 参考图元信息 + 全局锁 + 行业决策逻辑 + 输出 schema。
 * 参考图只传元信息（role / 数量 / 文件名），不传像素，满足 §3.5 上下文窗口约束。
 * @param {Object} input
 * @param {Object} input.productData   { fields, text }
 * @param {Array}  input.referenceMeta [{ role, filename, label }]
 * @param {string} input.globalLock    来自 core/global-lock.js 的拼装文本
 * @param {Object} input.industryStrategy 已解析行业策略（含 decisionLogic / name）
 * @returns {string}
 */
export function buildAnalyzeUserPrompt({ productData = {}, referenceMeta = [], globalLock = "", industryStrategy = {} } = {}) {
  const fields = (productData && productData.fields) || {};
  const text = (productData && productData.text) || "";
  const fieldLines = Object.keys(fields).map((k) => `  - ${k}：${fields[k]}`).join("\n");
  const refLines = (Array.isArray(referenceMeta) ? referenceMeta : [])
    .map((r) => `  - [${r.role}] ${r.label || r.filename || "未命名"}`)
    .join("\n");
  const decisionLogic = (industryStrategy && industryStrategy.decisionLogic) || "通用决策逻辑：以真实商品事实驱动，避免过度承诺。";

  return [
    "【商品资料（用户填写）】",
    fieldLines || "  （无结构化字段）",
    text ? `\n【商品描述】\n${text}` : "",
    "",
    "【参考图元信息（仅角色与命名，不含像素）】",
    refLines || "  （无参考图）",
    "",
    "【全局一致性锁（已注入，生成须遵守）】",
    globalLock || "（无）",
    "",
    "【行业决策逻辑】",
    decisionLogic,
    "",
    "【输出要求】严格输出以下 schema 的一个 JSON 对象：",
    ANALYZE_OUTPUT_SCHEMA
  ].filter(Boolean).join("\n");
}
