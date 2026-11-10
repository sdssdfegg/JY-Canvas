// server/features/detail-studio/planning/compile-screen.js
//
// B3 确定性编译：把项目里已规划好的 ScreenSpec[] 编译成每屏 frozenPrompts（零模型调用）。
// 设计真相源：V4.0-详情创作工作区-阶段3A设计报告.md §3.2.1 / §3.8.1（B3）/ V202 §3 B3。
//
// 红线：
//  - compileScreenPlan 纯函数、零模型、零随机：同一项目永远产出同一 frozenPrompts（字节一致保证）。
//  - 冻结时服务端**重编译**落库，不信任客户端传来的字符串，确保「展示 == 实际发送 == 落库」三者同源。
//  - 不改任何事实（事实只在前序批次产出），仅做最后一次可发布分级兜底（见 prompt-compiler.js）。

import { compileScreenPrompt } from "../../../../prompts/detail-studio/core/prompt-compiler.js";

/**
 * 纯函数：由项目规划区编译每屏提示词。
 * @param {Object} project 含 planning.{screens, globalLock, visualDNA}
 * @returns {{ frozenPrompts: Object<string,string>, screenCount: number }}
 */
export function compileScreenPlan(project = {}) {
  const planning = project.planning || {};
  const screens = Array.isArray(planning.screens) ? planning.screens : [];
  const globalLockText = String(planning.globalLock || "");
  const visualDNA = planning.visualDNA && typeof planning.visualDNA === "object" ? planning.visualDNA : {};
  const frozenPrompts = {};
  for (const screen of screens) {
    if (!screen || !screen.id) continue;
    const { prompt } = compileScreenPrompt({
      screen,
      globalLockText,
      visualDNA,
      referenceAssets: screen.referenceAssets
    });
    frozenPrompts[screen.id] = prompt;
  }
  return { frozenPrompts, screenCount: screens.length };
}

/**
 * 纯函数：从「导演产出的 screens + 已存 globalLock/visualDNA」重新编译，用于冻结时服务端落库，
 * 不依赖客户端传值，保证 parity。
 * @param {Object} project
 * @returns {{ frozenPrompts: Object<string,string> }}
 */
export function recompileForFreeze(project = {}) {
  return compileScreenPlan(project);
}
