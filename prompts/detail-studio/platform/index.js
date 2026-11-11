// prompts/detail-studio/platform/index.js
//
// 平台规则包（阶段 3C P1，3A §3.2.1 已规划、3B 未建）。
//
// 设计真相源：旧 PLATFORM_SKILLS（prompts/server/detail-skills.js，八文件禁改清单，只读复用）。
// 本模块**不修改**旧底座，只做：
//   1) 只读 re-export PLATFORM_SKILLS（11 个平台/页型规则：节奏 rhythm / 比例 imageNorms /
//      文案规则 copyRule / 视觉规则 visualRule / 转化特征 conversionTraits）。
//   2) 提供 resolvePlatformProfile(key) 解析器，供规划链路（director-visual 的 platformProfile）
//      消费；解析口径与旧 getPlatformSkill 一致（amazon→amazon-detail、main→taobao-main、其余→taobao-detail）。
//
// 红线：平台规则**只描述节奏/比例/文案风格**，**绝不覆盖 BASE_SKILL 事实锁**（商品事实分级、
// unconfirmed 禁 publish、frozenPrompt 字节一致等由 core/ 与 quality/ 把控，与本包正交）。

import { PLATFORM_SKILLS } from "../../server/detail-skills.js";

/** 平台规则全集（只读引用，跨规划链路共用，不得在本文件改写）。 */
export const PLATFORM_PROFILES = PLATFORM_SKILLS;

/** 平台 profile 合法 id 列表（供调用方做白名单校验）。 */
export const PLATFORM_PROFILE_KEYS = Object.freeze(Object.keys(PLATFORM_SKILLS));

/**
 * 解析平台/页型 → 平台规则 profile（确定性，零模型）。
 * 与旧 getPlatformSkill 同口径：amazon 系 → amazon-detail；含 main → taobao-main；其余 → taobao-detail。
 * 显式合法 id 直接命中；非法/空 → taobao-detail（默认兜底，与旧逻辑一致）。
 * @param {string} [key] 平台标识或页型标识
 * @returns {Object} 平台规则 profile（含 platform/pageType/rhythm/copyRule/visualRule/imageNorms/conversionTraits）
 */
export function resolvePlatformProfile(key = "") {
  const k = String(key || "").trim().toLowerCase();
  if (k && PLATFORM_SKILLS[k]) return PLATFORM_SKILLS[k];
  if (k.includes("amazon")) return PLATFORM_SKILLS["amazon-detail"];
  if (k.includes("main")) return PLATFORM_SKILLS["taobao-main"];
  return PLATFORM_SKILLS["taobao-detail"];
}

/**
 * 把平台 profile 抽成导演批次可消费的「平台上下文」片段（与 director-visual 的
 * globalLockContext.platformProfile 字段对齐）。纯数据拼装，不引入事实锁。
 * @param {string} [key]
 * @returns {{ platform:string, pageType:string, rhythm:string, copyRule:string, visualRule:string }}
 */
export function buildPlatformContext(key = "") {
  const p = resolvePlatformProfile(key);
  return {
    platform: p.platform || "通用",
    pageType: p.pageType || "",
    rhythm: Array.isArray(p.rhythm) ? p.rhythm.join(" → ") : "标准",
    copyRule: p.copyRule || "中文电商短句，卖点直接，避免夸张极限词。",
    visualRule: p.visualRule || "适合手机端长图阅读，信息密度中等。"
  };
}
