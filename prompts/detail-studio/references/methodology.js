// prompts/detail-studio/references/methodology.js
//
// 专业方法论沉淀（阶段 3C P2）：叙事弧与信息节奏、视觉多样性由内容任务驱动。
// 纯数据/纯函数资产，供 director-visual 与质检参考，不单独立 Agent。
// 与 core/screen-composition.js（6-3-1 信息层级 / SAFE_LAYOUTS 轮换）互补，本文件给「为什么这样排」的原则。

/** 叙事弧：一套详情页应有的故事走向（首屏吸引 → 中段解释卖点/用法/信任 → 收尾转化）。 */
export const NARRATIVE_ARC = Object.freeze([
  {
    stage: "吸引",
    position: "首屏",
    purpose: "第一眼确认商品身份、风格与购买兴趣；不堆参数、不喊口号。",
    dos: ["商品主体清晰", "风格与视觉DNA一致", "身份锚明确"],
    donts: ["首屏就列满参数", "用绝对化大词", "主体被文案压住"]
  },
  {
    stage: "解释",
    position: "中段（2~N-1 屏）",
    purpose: "把购买理由讲透：核心卖点、材质/参数、使用场景、信任背书，按决策逻辑排序。",
    dos: ["一屏一个主要卖点", "事实只来自用户资料", "场景真实可感"],
    donts: ["一屏塞太多信息", "虚构未证实功效/参数", "相邻屏构图单调重复"]
  },
  {
    stage: "转化",
    position: "末屏",
    purpose: "给明确的购买理由与行动提示，收束整套叙事。",
    dos: ["回扣首屏身份", "给可信的购买理由", "行动提示克制"],
    donts: ["突然夸大", "虚假限时/库存", "与前面事实冲突"]
  }
]);

/** 信息节奏：张弛原则（确定性可引用）。 */
export const INFO_RHYTHM = Object.freeze({
  principle: "首屏轻、中段实、收尾促；相邻屏信息密度应有呼吸，不在连续多屏都用相同密度。",
  densityPattern: ["轻（身份）", "实（卖点）", "实（材质/参数）", "实（场景/信任）", "促（转化）"],
  avoid: [
    "连续多屏都是「产品居中+标题在上+卖点在下」的单调构图",
    "每屏都满文案无留白",
    "中段所有屏密度相同、缺乏节奏变化"
  ]
});

/**
 * 视觉多样性：由内容任务驱动，而非为多样而多样（确定性原则 + 与 checklist SAFE_LAYOUTS 对齐）。
 * @returns {{ drivenBy:string[], rules:string[], forbidden:string[] }}
 */
export function visualDiversityMethodology() {
  return {
    drivenBy: [
      "内容任务（这一屏要讲什么）决定构图与视觉重心",
      "参考图角色（product/visualStyle/contentStructure）决定参考图用法",
      "行业视觉表达（industry.visualExpression）决定整体基调"
    ],
    rules: [
      "相邻屏构图应轮换（见 checklist SAFE_LAYOUTS：centered-product / left-product-right-copy / top-copy-bottom-product / split-comparison）",
      "视觉重心、信息层级、参考图用法可以轮换，但不能凭空发明新构图",
      "同一组里视觉DNA（配色/光线/版式）跨屏统一，变化的是布局而非风格"
    ],
    forbidden: [
      "为「看起来不一样」而强行换风格（破坏视觉DNA一致）",
      "相邻屏单调重复（视觉疲劳、质检 warn）",
      "把参考图角色串用（见 reference-image-roles.js）"
    ]
  };
}

/**
 * 叙事自检（确定性）：给定屏角色序列，判断是否覆盖「吸引→解释→转化」三段。
 * @param {Array<{role:string}>} screens
 * @returns {{ ok:boolean, hasHero:boolean, hasConversion:boolean, middleCount:number }}
 */
export function narrativeSelfCheck(screens = []) {
  const list = Array.isArray(screens) ? screens : [];
  const hasHero = list.some((s) => (s && (s.role === "hero")) || (s && String(s.role || "").includes("hero")));
  const hasConversion = list.some((s) => (s && String(s.role || "").includes("conversion")) || (s && String(s.role || "").includes("close")));
  const middleCount = list.length - (hasHero ? 1 : 0) - (hasConversion ? 1 : 0);
  return { ok: hasHero && hasConversion && middleCount >= 1, hasHero, hasConversion, middleCount };
}
