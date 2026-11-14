// 一键详情「可选详情内容板块」预设与序列化（V214 P0）。
//
// 零依赖叶子：不 import React / DOM / 任何 feature，供前端状态与门禁共用。
// 预设项映射到服务端既有 SCREEN_MODULES 的 9 个 moduleId
// （prompts/server/detail-skills.js:271-362，该文件 G-2 禁改）。
// 客户可见的 label 是具体侧重点，moduleId 只用于策划归类 / 构图 / 质检规则选取；
// 多个 label 允许共享同一 moduleId，由数组顺序（order）决定叙事优先级。

export const SECTION_GROUPS = [
  { id: "product", label: "产品核心展示" },
  { id: "usage", label: "使用与体验" },
  { id: "decision", label: "辅助决策" }
];

export const PRESET_SECTIONS = [
  { id: "product-function", label: "产品功能展示", group: "product", moduleId: "coreSellingPoint", isCustom: false },
  { id: "product-material", label: "产品材质细节", group: "product", moduleId: "materialDetail", isCustom: false },
  { id: "product-structure", label: "产品结构拆解", group: "product", moduleId: "fitStructure", isCustom: false },
  { id: "product-advantage", label: "产品优势卖点", group: "product", moduleId: "coreSellingPoint", isCustom: false },
  { id: "usage-scene", label: "实际使用场景", group: "usage", moduleId: "useScenario", isCustom: false },
  { id: "usage-method", label: "使用方法说明", group: "usage", moduleId: "useScenario", isCustom: false },
  { id: "usage-effect", label: "使用效果展示", group: "usage", moduleId: "painReverse", isCustom: false },
  { id: "usage-audience", label: "适用人群与对象", group: "usage", moduleId: "useScenario", isCustom: false },
  { id: "decision-compare", label: "产品对比展示", group: "decision", moduleId: "specInfo", isCustom: false },
  { id: "decision-spec", label: "规格参数说明", group: "decision", moduleId: "specInfo", isCustom: false },
  { id: "decision-brand", label: "品牌故事与背书", group: "decision", moduleId: "trustProof", isCustom: false },
  { id: "decision-notice", label: "购买须知与注意事项", group: "decision", moduleId: "conversionClose", isCustom: false }
];

const MAX_LABEL_LENGTH = 40;
const MAX_ID_LENGTH = 80;

export function validateSectionItem(item) {
  if (!item || typeof item !== "object") return false;
  if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > MAX_ID_LENGTH) return false;
  if (typeof item.label !== "string" || item.label.trim().length === 0 || item.label.length > MAX_LABEL_LENGTH) return false;
  if (typeof item.moduleId !== "string" || item.moduleId.length === 0) return false;
  if (typeof item.isCustom !== "boolean") return false;
  return true;
}

// 空数组返回 undefined（不是 []）：调用方据此「条件展开」，保证空选时
// /api/detail-prompts 的 payload 与改造前逐字节一致。
export function serializeSelectedSections(items) {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const valid = items.filter(validateSectionItem);
  if (valid.length === 0) return undefined;
  return valid.map((item, index) => ({
    order: index + 1,
    id: item.id,
    label: item.label,
    moduleId: item.moduleId,
    isCustom: item.isCustom
  }));
}

export function createCustomSection(label) {
  const text = String(label || "").trim().slice(0, MAX_LABEL_LENGTH);
  if (!text) return null;
  const id = "custom-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  return { id, label: text, moduleId: "custom", isCustom: true };
}
