// prompts/detail-studio/prompts/director-visual.js
//
// 批次②（导演 + 分屏 + 单屏视觉）：模型面提示词资产：系统提示 + 结构化 ScreenSpec JSON schema + 用户消息拼装。
// 纯数据 / 纯函数：不 import 任何 AI 链路，便于单测与「展示提示词 == 实际发送提示词」核对。
//
// 设计真相源：V4.0-详情创作工作区-阶段3A设计报告.md §3.1.1（叙事+分屏合并为 1 次调用）/ §3.6.5（逐屏上下文）。
//
// 关键纪律：
//  - ScreenSpec 是**结构化数组**，每个字段都是可机器消费的短字段；**禁止用一段长文本糊满单屏**，
//    否则既不方便逐屏编译、也不方便前端结构化审阅（用户指示：别用长文本撑窗口）。
//  - 商品事实只接收「可发布」分级（user/visible/inferred）；unconfirmed 已在上下文侧过滤，
//    模型输出若仍夹带 unconfirmed 级事实，由 normalizeDirectorResult 程序层再次剔除，绝不进 ScreenSpec/frozenPrompt。

export const DIRECTOR_SYSTEM_PROMPT = [
  "你是 JY-Canvas「详情创作」工作区的视觉导演与分屏策划专家。你只负责：基于已确认的商品事实与策划结论，",
  "规划整套详情页的叙事、屏数、顺序、每屏的构图与单屏文案；你**不写任何一屏的最终生图提示词**。",
  "",
  "【先定整套叙事，再定单屏】先想清楚这条详情线的故事弧（首屏吸引 → 中段解释卖点/用法/信任 → 收尾转化），",
  "再决定每一屏承担什么角色、放什么内容、用什么构图。",
  "",
  "【不套固定模板】屏数、顺序、构图必须由商品内容与品类驱动，禁止千篇一律地套",
  "「痛点—卖点—参数—总结」固定 10 屏结构；禁止连续多屏都用「产品居中 + 标题在上 + 卖点在下」的单调构图。",
  "同一组里相邻屏的构图应当有变化（视觉重心、信息层级、参考图用法可以轮换）。",
  "",
  "【参考图三角色不串用】product=商品身份锚（只约束外观/包装/颜色/标签一致性）；visualStyle=整体视觉 DNA",
  "（场景/构图/配色/版式，不复制品牌/水印/人物身份）；contentStructure=版式/信息层级（不进身份与风格）。",
  "",
  "【事实纪律】你收到的 productFacts 已经是「可发布」分级（user/visible/inferred），不得把任何待确认/未证实的",
  "功效、参数、认证、材质、性能写成屏幕事实。",
  "",
  "【输出】只输出一个 JSON 对象，字段严格按下述 schema。不要输出任何解释性文字、Markdown 代码块或额外说明。"
].join("\n");

export const DIRECTOR_OUTPUT_SCHEMA = [
  "{",
  '  "narrativeSummary": string,',
  '  "visualDNA": { "palette": string, "lighting": string, "mood": string, "fontTone": string },',
  '  "screens": [',
  "    {",
  '      "role": string,',
  '      "goal": string,',
  '      "moduleId": string,',
  '      "composition": {',
  '        "layout": string,',
  '        "visualWeight": number,',
  '        "referenceNeed": "product"|"visualStyle"|"contentStructure"|"none",',
  '        "hierarchy": { "primaryText": string, "secondaryText": string }',
  "      },",
  '      "copy": { "headline": string, "subcopy": string, "tags": string[] },',
  '      "productFacts": [ { "key": string, "value": string } ],',
  '      "screenOverrides": string[],',
  '      "referenceAssets": [ { "role": "product"|"visualStyle"|"contentStructure", "label": string } ]',
  "    }",
  "  ]",
  "}"
].join("\n");

/**
 * 拼装批次②的用户消息：批次①结论（仅可发布事实）+ 屏数 + 平台节奏 + 整体视觉 DNA + 全局锁 + 选项 + 参考图元信息。
 * 参考图只传元信息（role / label），不传像素。
 * @param {Object} input
 * @param {Object} input.analyze            批次①规范化结论（含 facts 已过滤为可发布分级、consumerLogic、sellingPoints、decisionLogic）
 * @param {Array}  input.publishableFacts   已过滤为可发布分级的事实 [{key,value,grade,field}]
 * @param {number} input.screenCount        目标屏数（≤20）
 * @param {Object} input.globalLockContext  全局锁与平台/风格/构图基调（来自 buildAnalyzeContext 的上下文）
 * @param {Object} input.options            已迁移结构化选项
 * @param {Array}  input.referenceMeta      [{role, label}]
 * @returns {string}
 */
export function buildDirectorUserPrompt({
  analyze = {},
  publishableFacts = [],
  screenCount = 8,
  globalLockContext = {},
  referenceMeta = []
} = {}) {
  const consumerLogic = analyze.consumerLogic || {};
  const factsLines = publishableFacts
    .map((f) => `  - ${f.key}：${f.value}（分级=${f.grade}）`)
    .join("\n");
  const sellingLines = (Array.isArray(analyze.sellingPoints) ? analyze.sellingPoints : [])
    .map((s) => `  - ${s}`)
    .join("\n");
  const refLines = (Array.isArray(referenceMeta) ? referenceMeta : [])
    .map((r) => `  - [${r.role}] ${r.label || r.filename || "未命名"}`)
    .join("\n");
  const meta = globalLockContext || {};
  const globalLockText = String(meta.globalLock || "");
  const platformText = meta.platformProfile
    ? `平台：${meta.platformProfile.platform || "通用"}${meta.platformProfile.pageType || ""}；节奏：${meta.platformProfile.rhythm || "标准"}。`
    : "平台：通用；节奏：标准。";

  return [
    "【商品分析结论（已确认事实 + 策划）】",
    factsLines || "  （无已确认事实，请在屏内只描述可观察内容，不要编造参数/功效）",
    "",
    "【目标人群】",
    String(consumerLogic.targetAudience || "（未明确）"),
    "【购买动机】",
    (Array.isArray(consumerLogic.purchaseMotivations) ? consumerLogic.purchaseMotivations : []).map((m) => `  - ${m}`).join("\n") || "  （未明确）",
    "【核心卖点】",
    sellingLines || "  （未明确）",
    "【决策逻辑】",
    String(analyze.decisionLogic || "以真实商品事实驱动，避免过度承诺。"),
    "",
    "【目标屏数】",
    String(screenCount),
    "【平台节奏】",
    platformText,
    "【全局一致性锁（每屏都要遵守）】",
    globalLockText || "（无）",
    "",
    "【参考图元信息（仅角色与命名）】",
    refLines || "  （无参考图）",
    "",
    "【输出要求】严格输出以下 schema 的一个 JSON 对象，screens 数组长度与「目标屏数」一致（允许 ±1，但不超过 20）：",
    DIRECTOR_OUTPUT_SCHEMA
  ].filter(Boolean).join("\n");
}
