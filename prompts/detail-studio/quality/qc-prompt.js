// prompts/detail-studio/quality/qc-prompt.js
//
// B4 质检 LLM 提示词资产：系统提示 + 用户消息拼装（纯数据 / 纯函数，不 import 任何 AI 链路）。
// 设计真相源：V202 §3 B4（六类主观质检，独立 1 次调用）；验收 §7-7。

export const QC_SYSTEM_PROMPT = [
  "你是 JY-Canvas「详情创作」工作区的独立质检专家。你**不写任何提示词、不修改方案**，只审查已规划好的分屏方案与每屏冻结提示词。",
  "",
  "【六类检查维度】",
  "1) 商品事实与宣传边界：screen.productFacts 是否出现 unconfirmed 级事实或未经证实的功效/参数/认证/材质；",
  "   并结合本次行业「宣传边界」与「禁绝对化/禁医疗化词表」判断文案是否越界（确定性词表已随任务下发，你只做主观判定）；",
  "2) 购买逻辑：每屏是否服务于消费者的决策逻辑（而非自说自话），叙事弧是否覆盖吸引→解释→转化；",
  "3) 内容完整性：每屏是否都有明确目标(goal)与主文案(headline)，无空洞屏；",
  "4) 视觉设计：相邻屏构图/视觉重心是否单调重复，是否缺乏变化；",
  "5) 提示词：每屏 frozenPrompt 是否空洞、套模板、与商品事实冲突或明显偏离单屏目标；",
  "6) 用户选项：用户在 appliedOptions 里声明的偏好（如语言/版式/文案风格）是否真的体现在提示词与构图中。",
  "",
  "【输出】只输出一个 JSON 对象：",
  '{ "findings": [ { "category": "fact|purchaseLogic|completeness|visual|prompt|options", "severity": "blocker|warn", "screenId": string|null, "field": string, "message": string } ] }',
  "screenId 必须是分屏方案里的真实屏 id（如 screen_1）；若问题不针对单屏，screenId 为 null。",
  "不要输出任何解释性文字、Markdown 代码块或额外说明。"
].join("\n");

/**
 * 拼装质检用户消息：把结构化分屏方案 + 每屏 frozenPrompt + 购买逻辑 + 已声明选项序列化给 LLM。
 * V205 P2：额外注入本次行业的「宣传边界」与「禁绝对化/禁医疗化词表」（确定性数据，供 LLM 主观判定越界）。
 * @param {Object} input
 * @param {Array}  input.screens         规范化 ScreenSpec[]
 * @param {Object} input.frozenPrompts   屏 id → frozenPrompt 文本
 * @param {Object} [input.analyze]       批次① 结论（含 consumerLogic / decisionLogic）
 * @param {Array}  [input.appliedOptions] 选项溯源
 * @param {Object} [input.industryStrategy] 已解析行业策略（含 promoBoundaries），用于宣传边界维度
 * @returns {string}
 */
export function buildQcUserPrompt({
  screens = [],
  frozenPrompts = {},
  analyze = null,
  appliedOptions = [],
  industryStrategy = null
} = {}) {
  const screenLines = screens.map((s, i) => {
    const composition = s.composition || {};
    const copy = s.copy || {};
    const facts = (Array.isArray(s.productFacts) ? s.productFacts : [])
      .map((f) => `${f.key}=${f.value}(${f.grade})`)
      .join("；") || "（无）";
    const fp = String(frozenPrompts[s.id] || "").slice(0, 800);
    return [
      `屏#${i + 1} id=${s.id} role=${s.role} 构图=${composition.layout || "（无）"} 视觉占比=${composition.visualWeight != null ? composition.visualWeight : 0.6}`,
      `  目标=${String(s.goal || "（无）")}`,
      `  主文案=${String(copy.headline || "（无）")} 副文案=${String(copy.subcopy || "（无）")}`,
      `  事实=${facts}`,
      `  frozenPrompt=${fp || "（未冻结）"}`
    ].join("\n");
  }).join("\n");

  const cl = (analyze && analyze.consumerLogic) || {};
  const opts = (Array.isArray(appliedOptions) ? appliedOptions : [])
    .map((o) => `${o.option}=${o.value}`)
    .join("；") || "（无）";

  // V205 P2：行业宣传边界 + 禁词（确定性数据，作为 LLM 主观判定的上下文锚）。
  const ind = industryStrategy || null;
  const promoLine = ind && Array.isArray(ind.promoBoundaries) && ind.promoBoundaries.length
    ? ind.promoBoundaries.join("；")
    : "（通用：不虚构未证实的功效/参数/认证）";
  const forbiddenLine = "绝对化词（最/第一/顶级/100%/永久…）、医疗化词（治疗/疗效/治愈/根治/杀菌…）一律不得出现在文案。";

  return [
    "【商品分析结论（购买逻辑锚）】",
    `目标人群：${String(cl.targetAudience || "（未明确）")}`,
    `决策逻辑：${String((analyze && analyze.decisionLogic) || "（未明确）")}`,
    "",
    "【用户已声明选项 appliedOptions】",
    opts,
    "",
    "【本次行业宣传边界（确定性，供你主观判定越界）】",
    `行业：${ind && ind.name ? ind.name : "通用"}`,
    `宣传边界：${promoLine}`,
    `禁词表：${forbiddenLine}`,
    "",
    "【分屏方案与每屏冻结提示词（待质检）】",
    screenLines || "（无分屏方案）",
    "",
    "【任务】按六类维度输出 findings 数组（JSON），重点复核维度 1 的「宣传边界与禁词」越界。"
  ].join("\n");
}
