// 详情 v2 视觉规则核心函数（服务端权威）。
// 真相源：style-packs.js / composition-variants.js。前端选项只是展示镜像，最终值由本模块计算。
// 版本裁决优先级：请求级 detailSkillVersion > env JINGYIN_DETAIL_SKILL_VERSION > 默认 v1。
// 注意：env 在函数体内惰性读取，不得模块顶层求值、不得写入 runtime-config.js。

import { STYLE_PACKS, autoPoolIds, allowedPackIds } from "./style-packs.js";
import { MODULE_VARIANTS } from "./composition-variants.js";

export { STYLE_PACKS, MODULE_VARIANTS };

export function resolveDetailSkillVersion(input = {}) {
  const requested = String(input?.detailSkillVersion || "").trim().toLowerCase();
  if (requested === "v1" || requested === "v2") return requested;
  const fromEnv = String(process.env.JINGYIN_DETAIL_SKILL_VERSION || "").trim().toLowerCase();
  return fromEnv === "v2" ? "v2" : "v1";
}

export function stylePackForGroup({ groupIndex = 1, platformSkill, userChoice = "auto" }) {
  const index = Math.max(1, Number.parseInt(groupIndex, 10) || 1);
  const pool = autoPoolIds();
  const choice = String(userChoice || "auto").trim();
  if (choice && choice !== "auto" && STYLE_PACKS[choice] && allowedPackIds(platformSkill).includes(choice)) {
    return { pack: STYLE_PACKS[choice], groupIndex: index, reason: `手动指定 ${choice}《${STYLE_PACKS[choice].name}》` };
  }
  const picked = pool[(index - 1) % pool.length];
  const pack = STYLE_PACKS[picked];
  const knownButBanned = choice && choice !== "auto" && STYLE_PACKS[choice];
  return {
    pack,
    groupIndex: index,
    reason: knownButBanned
      ? `所选 ${choice} 不适用${platformSkill?.platform || ""}${platformSkill?.pageType || ""}规范，已按第 ${index} 组自动轮换为 ${picked}《${pack.name}》`
      : `第 ${index} 组自动轮换：${picked}《${pack.name}》`
  };
}

export function variantFor(moduleId, screenIndex, stylePack, groupIndex, aiChoice) {
  const variants = MODULE_VARIANTS[moduleId] || MODULE_VARIANTS.coreSellingPoint;
  const choice = String(aiChoice || "").trim();
  if (choice) {
    const hit = variants.find((v) => v.id === choice || v.letter === choice);
    if (hit) return hit;
  }
  const bias = stylePack?.variantBias?.[moduleId];
  let ordered = variants;
  if (Array.isArray(bias) && bias.length > 0) {
    const preferred = bias.map((letter) => variants.find((v) => v.letter === letter)).filter(Boolean);
    ordered = [...preferred, ...variants.filter((v) => !bias.includes(v.letter))];
  }
  const offset = (Math.max(1, Number.parseInt(groupIndex, 10) || 1) - 1 + Math.max(0, Number.parseInt(screenIndex, 10) || 0)) % ordered.length;
  return ordered[offset];
}

export function buildSkillPackV2({ input, platformSkill }) {
  const decision = stylePackForGroup({
    groupIndex: input.detailGroupIndex,
    platformSkill,
    userChoice: input.stylePackId
  });
  return {
    skillVersion: "v2",
    stylePack: {
      id: decision.pack.id,
      name: decision.pack.name,
      colorTone: decision.pack.colorTone,
      lighting: decision.pack.lighting,
      compositionFamily: decision.pack.compositionFamily,
      background: decision.pack.background,
      fontMood: decision.pack.fontMood,
      avoid: decision.pack.avoid
    },
    stylePackPool: autoPoolIds().map((id) => ({ id, name: STYLE_PACKS[id].name })),
    platformNote: platformSkill.pageType === "主图"
      ? "主图首屏强制使用 S1《白底极简》安全款（白底/干净背景/少文字），其余屏使用本组风格包。"
      : "",
    compositionVariants: Object.keys(MODULE_VARIANTS).map((moduleId) => ({
      moduleId,
      variants: MODULE_VARIANTS[moduleId].map((v) => ({
        id: v.id,
        letter: v.letter,
        name: v.name,
        composition: v.composition,
        firstLook: v.firstLook,
        eyeFlow: v.eyeFlow,
        textSafeZone: v.textSafeZone,
        avoid: v.avoid
      }))
    })),
    decision
  };
}

export function buildStylePackRound(decision) {
  return {
    stage: "视觉风格包",
    title: `${decision.pack.id}《${decision.pack.name}》`,
    content: `本组锁定：色温/色调 ${decision.pack.colorTone}；布光 ${decision.pack.lighting}；构图族 ${decision.pack.compositionFamily}；背景 ${decision.pack.background}；字体 ${decision.pack.fontMood}。轮换池：${autoPoolIds().map((id) => `${id}《${STYLE_PACKS[id].name}》`).join("、")}。禁忌：${decision.pack.avoid.join("；")}。判定：${decision.reason}。`
  };
}
