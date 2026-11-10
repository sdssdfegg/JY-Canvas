// prompts/detail-studio/core/prompt-compiler.js
//
// 确定性提示词编译器：把一屏的 ScreenSpec + 全局一致性锁 + 视觉 DNA + 选项，编译成最终生图提示词。
// 纯函数、零模型调用、零随机：同一输入永远产出同一字符串（frozenPrompt == 生成请求体 prompt 的架构保证）。
//
// 范式来源：server/detail-middleware.js:531-550 的 text[] 顺序拼接（锁定顺序，不靠模型现编）。
// 本模块只负责「拼」，绝不改「事实」—— 模型只在前序批次产出 ScreenSpec，编译期对事实做最后一次可发布分级兜底。
//
// 红线（V202 §3 B3 / 验收 §7-5）：用户看到的提示词 == 实际发送提示词；生成端只读 compiledPrompt，
// 后台不得经任何 Skill / Agent 再改写。

import { isPublishableGrade } from "./fact-grading.js";

/**
 * 把一屏编译成最终生图提示词（确定性）。
 * @param {Object} input
 * @param {Object} input.screen         规范化后的 ScreenSpec（含 composition / copy / productFacts / screenOverrides / referenceAssets）
 * @param {string} input.globalLockText 来自 core/global-lock.js 的全局锁文本（含无模特 / 无文案 / 平台规则等约束）
 * @param {Object} [input.visualDNA]    整体视觉 DNA 引用
 * @param {Object} [input.options]      已迁移结构化选项（用于回退兜底，不重新生成约束）
 * @param {Array}  [input.referenceAssets] 按角色分类的参考图（屏级覆盖，缺省用 screen.referenceAssets）
 * @returns {{ prompt: string, factCount: number }}
 */
export function compileScreenPrompt({
  screen,
  globalLockText = "",
  visualDNA = {},
  referenceAssets
} = {}) {
  const s = screen && typeof screen === "object" ? screen : {};
  const facts = Array.isArray(s.productFacts) ? s.productFacts : [];
  // 编译期最后一次强制：只把可发布分级的事实写进提示词（unconfirmed 绝不进 frozenPrompt）。
  const publishableFacts = facts.filter((f) => f && isPublishableGrade(f.grade));
  const refs = Array.isArray(referenceAssets) ? referenceAssets : (Array.isArray(s.referenceAssets) ? s.referenceAssets : []);

  const composition = s.composition && typeof s.composition === "object" ? s.composition : {};
  const copy = s.copy && typeof s.copy === "object" ? s.copy : {};
  const hierarchy = composition.hierarchy && typeof s.composition.hierarchy === "object" ? s.composition.hierarchy : {};

  const text = [];

  // 1) 全局一致性锁（每屏都遵守，置于最前，生成端不得绕过）。
  if (globalLockText) text.push(globalLockText);

  // 2) 商品身份锚（hero 屏必须继承，其它屏若未指定则不强加）。
  if (s.identityAnchor) {
    text.push(`商品身份锚：只以商品图里的「${s.identityAnchor}」为准，外观/包装/颜色/标签保持连贯，不得漂移。`);
  }

  // 3) 整体视觉 DNA（统一色彩/光线/情绪/字体气质）。
  const vd = visualDNA && typeof visualDNA === "object" ? visualDNA : {};
  if (vd.palette || vd.lighting || vd.mood || vd.fontTone) {
    text.push(
      `视觉 DNA：调色=${vd.palette || "以商品图为准"}；光线=${vd.lighting || "自然光"}；情绪=${vd.mood || "真实质感"}；字体气质=${vd.fontTone || "清晰可读"}。`
    );
  }

  // 4) 参考图三角色用法（不串用，只吸收各自该吸收的部分）。
  const refByRole = { product: [], visualStyle: [], contentStructure: [] };
  for (const r of refs) {
    if (r && refByRole[r.role]) refByRole[r.role].push(r.label || "");
  }
  if (refByRole.product.length) {
    text.push(`商品身份参考（仅约束外观/包装/颜色/标签一致性，不复制其它商品/品牌/人物身份）：${refByRole.product.join("、")}。`);
  }
  if (refByRole.visualStyle.length) {
    text.push(`视觉风格参考（仅吸收场景/构图/配色/版式，不复制品牌/水印/人物身份）：${refByRole.visualStyle.join("、")}。`);
  }
  if (refByRole.contentStructure.length) {
    text.push(`内容结构参考（仅吸收版式/信息层级，不进身份与风格）：${refByRole.contentStructure.join("、")}。`);
  }

  // 5) 单屏构图（角色 + 布局 + 信息层级，结构化输出而非长文本堆砌）。
  text.push(`屏角色=${s.role || s.moduleId || "coreSellingPoint"}；构图=${composition.layout || "产品主体清晰、留白充足"}；视觉占比=${composition.visualWeight || 0.6}。`);
  if (hierarchy.primaryText) text.push(`主信息=${hierarchy.primaryText}。`);
  if (hierarchy.secondaryText) text.push(`次信息=${hierarchy.secondaryText}。`);

  // 6) 单屏文案（标题 + 副文案 + 标签），与全局锁的文案规则联动。
  if (copy.headline) text.push(`主文案：${copy.headline}。`);
  if (copy.subcopy) text.push(`副文案：${copy.subcopy}。`);
  if (Array.isArray(copy.tags) && copy.tags.length) {
    text.push(`角标/标签：${copy.tags.join("、")}。`);
  }

  // 7) 单屏商品事实（仅可发布分级）。
  if (publishableFacts.length) {
    text.push(
      "本屏事实（均为已确认/可见/可合理推断，不含任何待确认或虚构功效/参数/认证）："
      + publishableFacts.map((f) => `${f.key}=${f.value}`).join("；") + "。"
    );
  }

  // 8) 单屏专属要求（结构化条目）。
  const overrides = Array.isArray(s.screenOverrides) ? s.screenOverrides : [];
  if (overrides.length) {
    text.push("本屏专属要求：" + overrides.join("；") + "。");
  }

  // 9) 前后屏连续性（避免每屏像不同店铺）。
  if (s.prevScreenId || s.nextScreenId) {
    text.push("衔接：与上/下屏保持统一色彩、光线、字体层级与产品大小透视，细节屏可近景但不改商品结构。");
  }

  const prompt = text.join("\n");
  return { prompt, factCount: publishableFacts.length };
}
