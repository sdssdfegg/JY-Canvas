// 分层 Prompt 模板（换装）—— 模板注册表 + 版本冻结。
//
// 契约：docs/ai-tryon/contracts/prompt-template-v1.md（§1 四层结构 / §2 模板全文 / §3 版本冻结）。
// 上位：总纲 §6 buildTryOnPrompt（服务端权威构建）+ §5.1 TryOnTask（版本冻结规则）。
//
// 零依赖叶子纪律（V121-R2 TDZ 铁律）：本模块**只允许依赖 Node 内置模块**，
// 禁止 import 任何项目内模块（含同目录的 outfit-skill.js），
// 以免被启动链路引用时形成循环依赖 / 渲染期 TDZ。
// 因此「单次任务指令层」的权威构建（buildOutfitPrompt）由调用方负责合成，本模块只做**纯装配**。
//
// 🔴 只增不改：DEFAULT_PROMPT_TEMPLATE_VERSION = null ⇒ **默认不挂载模板**，
//    最终提示词 == 现有权威构建结果，P0 生命线（快捷/批量生成/批量换装/局部回贴）行为零变化。
//    模板挂载后是否切到 v2 生效，需先跑基线/回归样本评测（总纲 §4.1），不在本单自动切换。

import { createHash } from "node:crypto";

/** 四层结构（契约 §1）。数组顺序 = 装配顺序。 */
export const PROMPT_TEMPLATE_LAYERS = Object.freeze([
  "fixRule", // 固定规则层：A 决定人体画面 / B 决定服装属性 / 禁止身材迁移 / 非目标区不变
  "garmentProfile", // 服装档案层：品类/版型/颜色/领型/袖型/衣长/图案/材质/细节 → P2 填
  "modelConstraint", // 目标模特约束层：身份/比例/姿势/皮肤/头发/手部/构图/背景 → P3 填
  "taskInstruction" // 单次任务指令层：本次服装/参考类型/编辑范围/输出规格（每任务动态）
]);

/**
 * v1 固定规则层全文 = 契约 §2 模板全文（**含未固化的双分支句**）。
 * 定位：P0-B B 组实验基线 / 历史留档。**不要在生产挂载**。
 */
const FIX_RULE_V1 = [
  "任务：将服装参考图 B 中的服装自然地穿到目标模特图 A 上。",
  "参考职责：A 决定人物身份、脸部、身体比例、姿势、手臂和手部位置、头发、构图、背景及整体光线；B 只决定服装本身的款式、版型、颜色、图案、材质观感与结构细节。",
  "人体保护：保留 A 的人物身份和身体比例，不要复制 B 中模特的胸部体积、肩宽、腰围、腹部形态、手臂粗细或姿势。不得为了容纳衣服而无依据地改变 A 的身体轮廓。",
  "版型保真：按 B 的真实版型还原服装。合身款不能生成成宽松款；宽松款保留设计余量，但不要额外制造不合理的空腔、鼓包或夸张膨胀。区分衣服自身的褶皱与人体体积，不要把阴影误当成人体结构。",
  "细节保真：尽量保持领口、肩线、袖长、袖口、门襟、纽扣、口袋、下摆、Logo、印花和格纹的相对位置与比例。颜色以 B 的服装区域为参考，不要随意改色。",
  "编辑范围：仅修改完成换装所必需的区域。脸部、头发、裸露皮肤、手部、背景及其他非目标区域尽可能保持 A 原样。",
  "若当前接口的局部编辑/Mask 已通过实测，优先使用对应区域约束；若无效，则使用已验证的兜底流程。",
  "输出要求：生成真实自然、结构合理、边缘干净的换装结果；不要增加不存在的服装部件，不要改变人物身份，不要改变背景，不要生成额外文字或水印。"
].join("\n");

/**
 * v2 固定规则层 = v1 的**双分支句已按 P0-B E1 结论固化**后的版本。
 *
 * E1 结论（EVIDENCE §三-A，2026-10-26 实测 12/12）：
 *   - 掩膜链路端到端接通（探针上传 + 服务端 channel.js:339/378 多部件转发），不存在「发了被丢」；
 *   - **粗掩膜（躯干椭圆）未呈现较「无掩膜」的量化增量**——基础换装靠 A+B 双图输入已能保身份/保背景；
 *   - 精确人体保护掩膜属 P3（EVIDENCE S6/S33 既定归属），当前无证据支持在 v1 模板里写死区域约束。
 *
 * ⇒ v2 固化到**已验证的兜底流程分支**：不附加区域/掩膜约束，依靠 A+B 双图输入保持身份与非编辑区。
 *   与契约 §2 的「双分支句二选一固化，并升 template-v2」一致。
 */
const FALLBACK_BRANCH_CLAUSE =
  "本任务采用已验证的兜底流程：不附加区域/掩膜约束，依靠 A+B 双图输入保持人物身份、姿势与非编辑区域一致。";

const FIX_RULE_V2 = [
  "任务：将服装参考图 B 中的服装自然地穿到目标模特图 A 上。",
  "参考职责：A 决定人物身份、脸部、身体比例、姿势、手臂和手部位置、头发、构图、背景及整体光线；B 只决定服装本身的款式、版型、颜色、图案、材质观感与结构细节。",
  "人体保护：保留 A 的人物身份和身体比例，不要复制 B 中模特的胸部体积、肩宽、腰围、腹部形态、手臂粗细或姿势。不得为了容纳衣服而无依据地改变 A 的身体轮廓。",
  "版型保真：按 B 的真实版型还原服装。合身款不能生成成宽松款；宽松款保留设计余量，但不要额外制造不合理的空腔、鼓包或夸张膨胀。区分衣服自身的褶皱与人体体积，不要把阴影误当成人体结构。",
  "细节保真：尽量保持领口、肩线、袖长、袖口、门襟、纽扣、口袋、下摆、Logo、印花和格纹的相对位置与比例。颜色以 B 的服装区域为参考，不要随意改色。",
  "编辑范围：仅修改完成换装所必需的区域。脸部、头发、裸露皮肤、手部、背景及其他非目标区域尽可能保持 A 原样。",
  FALLBACK_BRANCH_CLAUSE,
  "输出要求：生成真实自然、结构合理、边缘干净的换装结果；不要增加不存在的服装部件，不要改变人物身份，不要改变背景，不要生成额外文字或水印。"
].join("\n");

/**
 * 内容哈希：sha256 前 12 位十六进制。
 * 用途：`prompt_template_hash` 冻结——模板文本任一字符改动即换哈希，可回溯/比对。
 * @param {string} text 模板文本
 * @returns {string} 12 位十六进制
 */
export function computeTemplateHash(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex").slice(0, 12);
}

function makeTemplate(id, text) {
  return Object.freeze({ id, version: id, text, hash: computeTemplateHash(text) });
}

/** 模板注册表（版本标识 → 冻结模板）。 */
export const PROMPT_TEMPLATES = Object.freeze({
  "prompt-template-v1": makeTemplate("prompt-template-v1", FIX_RULE_V1), // 实验基线，含未固化双分支句
  "prompt-template-v2": makeTemplate("prompt-template-v2", FIX_RULE_V2) // E1 结论固化后版本
});

/**
 * 默认挂载版本 = null（**不挂载**）。
 * 保证默认链路最终提示词与历史契约逐字一致（只发权威构建正文），P0 生命线零风险。
 * @type {string|null}
 */
export const DEFAULT_PROMPT_TEMPLATE_VERSION = null;

/**
 * 解析模板版本。未知/空一律返回 null（不挂载，回落历史契约）。
 * @param {string|null|undefined} version
 * @returns {{id:string, version:string, text:string, hash:string}|null}
 */
export function resolvePromptTemplate(version) {
  const key = String(version || "").trim();
  if (!key) return null;
  return PROMPT_TEMPLATES[key] || null;
}

/** 列出可挂载的版本标识。 */
export function listPromptTemplateVersions() {
  return Object.keys(PROMPT_TEMPLATES);
}

/** 层 1：固定规则层内容 = 模板全文。 */
export function buildFixRuleLayer(template) {
  return template && typeof template.text === "string" ? template.text : "";
}

/**
 * 层 2：服装档案层（**P2 接口**）。
 * 契约 §1：品类/版型/颜色/领型/袖型/衣长/图案/材质与关键细节，由档案生成（P2 交付），允许用户修正。
 * 当前未接档案 → 恒返回空串，装配时自动跳过，**不改变输出**。
 */
export function buildGarmentProfileLayer() {
  return "";
}

/**
 * 层 3：目标模特约束层（**P3 接口**）。
 * 契约 §1：人物身份/身体比例/姿势/皮肤/头发/手部/构图与背景，尽量利用视觉分析结构化输出
 * （E6 结论前不得假定有分割）。当前未接 → 恒返回空串，装配时自动跳过，**不改变输出**。
 */
export function buildModelConstraintLayer() {
  return "";
}

/**
 * 纯函数装配四层；空层自动跳过，用空行分隔。
 * @param {{fixRule?:string, garmentProfile?:string, modelConstraint?:string, taskInstruction?:string}} layers
 * @returns {string}
 */
export function assembleLayers(layers = {}) {
  return PROMPT_TEMPLATE_LAYERS
    .map((key) => layers[key])
    .filter((text) => typeof text === "string" && text.trim())
    .join("\n\n");
}
