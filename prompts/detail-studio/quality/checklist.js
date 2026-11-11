// prompts/detail-studio/quality/checklist.js
//
// B4 确定性质检规则（零模型）：六类检查，定位到具体屏 / 字段。
// 纯函数、零模型；只 import prompts/detail-studio/core/*（不反向依赖 server，避免破坏分层与打包）。
//
// 六类（V202 §3 B4 / 验收 §7-7）：
//   fact            商品事实（unconfirmed 不得进 ScreenSpec；敏感字段需已确认）
//   purchaseLogic   购买逻辑（屏是否服务决策；分析缺消费者逻辑 / 决策逻辑）
//   completeness    内容完整性（每屏 goal / 主文案齐；首屏身份锚）
//   visual          视觉设计（相邻屏构图不得单调重复）
//   prompt          提示词（frozenPrompt 非空 + 与确定性重编译字节一致）
//   options         用户选项（appliedOptions 覆盖关键选项，参数真实生效）

import { FACT_GRADE, isPublishableGrade } from "../core/fact-grading.js";
import { compileScreenPrompt } from "../core/prompt-compiler.js";
import { missingTracedOptions } from "../core/option-trace.js";
// V205 P2：电商文案与消费者语言子模块（禁绝对化/禁医疗化词表 + 扫描器），用于「宣传合规」确定性检查。
import { scanForbiddenWords } from "../references/copywriting.js";
// V205 P2：叙事弧自检（吸引→解释→转化），用于购买逻辑维度的深化。
import { narrativeSelfCheck } from "../references/methodology.js";

export const QC_CATEGORY_LABELS = Object.freeze({
  fact: "商品事实",
  purchaseLogic: "购买逻辑",
  completeness: "内容完整性",
  visual: "视觉设计",
  prompt: "提示词",
  options: "用户选项"
});

// 质检第⑥类：应被追踪的关键选项键（与 option-effect-check.mjs 同源）。
export const QC_TRACED_OPTIONS = Object.freeze([
  "modelMode", "copywriting", "richness", "fontStyle", "ratio", "lang", "platform"
]);

// 安全构图轮换集（定向修正：相邻重复时向后轮换；不凭空发明新构图）。
const SAFE_LAYOUTS = Object.freeze([
  "centered-product",
  "left-product-right-copy",
  "top-copy-bottom-product",
  "split-comparison"
]);

function rotateLayout(layout) {
  const idx = SAFE_LAYOUTS.indexOf(layout);
  if (idx < 0) return SAFE_LAYOUTS[0];
  return SAFE_LAYOUTS[(idx + 1) % SAFE_LAYOUTS.length];
}

/**
 * 跑确定性质检，返回标准化 findings 数组。
 * 每条 finding：{ category, severity('blocker'|'warn'), screenId(string|null), field, message, autoFixable, fixType? }
 * @param {Object} project 含 planning.{screens, analyze, appliedOptions, frozenPrompts, globalLock, visualDNA}
 * @returns {Array}
 */
export function runChecklist(project = {}) {
  const planning = project.planning || {};
  const screens = Array.isArray(planning.screens) ? planning.screens : [];
  const analyze = planning.analyze || null;
  const appliedOptions = Array.isArray(planning.appliedOptions) ? planning.appliedOptions : [];
  const frozen = planning.frozenPrompts && typeof planning.frozenPrompts === "object" ? planning.frozenPrompts : {};
  const findings = [];

  // 类别① 商品事实：unconfirmed 不得进 ScreenSpec（程序防御，与 B3 编译期兜底双保险）。
  for (const screen of screens) {
    const facts = Array.isArray(screen.productFacts) ? screen.productFacts : [];
    const bad = facts.filter((f) => f && f.grade === FACT_GRADE.UNCONFIRMED);
    if (bad.length) {
      findings.push({
        category: "fact",
        severity: "blocker",
        screenId: screen.id,
        field: "productFacts",
        message: `屏 ${screen.id} 含 ${bad.length} 条 unconfirmed 事实，禁止进入生成提示词`,
        autoFixable: true,
        fixType: "stripUnconfirmed"
      });
    }
    // V205 P2：宣传合规（确定性，挂在「商品事实与宣传边界」维度）—— 扫描每屏文案是否命中
    // 禁绝对化 / 禁医疗化词表（来自 references/copywriting.js）。命中即告警，交人工/LLM 复核。
    const copy = screen.copy || {};
    const copyText = `${String(copy.headline || "")} ${String(copy.subcopy || "")}`;
    if (copyText.trim()) {
      const hit = scanForbiddenWords(copyText);
      const all = [...hit.absolute, ...hit.medical];
      if (all.length) {
        findings.push({
          category: "fact",
          severity: "warn",
          screenId: screen.id,
          field: "copy",
          message: `屏 ${screen.id} 文案命中禁词（绝对化/医疗化）：${all.join("、")} —— 违反宣传边界，须复核`,
          autoFixable: false
        });
      }
    }
  }

  // 类别② 购买逻辑：缺消费者逻辑 / 决策逻辑。
  if (!analyze) {
    findings.push({
      category: "purchaseLogic",
      severity: "blocker",
      screenId: null,
      field: "analyze",
      message: "尚未运行商品分析，无法质检购买逻辑",
      autoFixable: false
    });
  } else {
    const cl = analyze.consumerLogic || {};
    if (!cl.targetAudience) {
      findings.push({
        category: "purchaseLogic",
        severity: "warn",
        screenId: null,
        field: "analyze.consumerLogic.targetAudience",
        message: "商品分析缺少目标人群，购买逻辑无法锚定",
        autoFixable: false
      });
    }
    if (!analyze.decisionLogic) {
      findings.push({
        category: "purchaseLogic",
        severity: "warn",
        screenId: null,
        field: "analyze.decisionLogic",
        message: "缺少决策逻辑描述（决策逻辑驱动每屏卖点）",
        autoFixable: false
      });
    }
    // V205 P2：叙事弧自检（确定性，挂在购买逻辑维度）—— 整套方案应覆盖「吸引→解释→转化」三段，
    // 否则无法服务消费者决策逻辑。引用 references/methodology.js 的 narrativeSelfCheck。
    const arc = narrativeSelfCheck(screens);
    if (!arc.hasHero) {
      findings.push({
        category: "purchaseLogic",
        severity: "warn",
        screenId: null,
        field: "screens[0].role",
        message: "首屏缺少 hero/身份锚角色，叙事弧「吸引」段缺失",
        autoFixable: false
      });
    }
    if (!arc.hasConversion) {
      findings.push({
        category: "purchaseLogic",
        severity: "warn",
        screenId: null,
        field: "screens[last].role",
        message: "末屏缺少 conversion/close 角色，叙事弧「转化」段缺失",
        autoFixable: false
      });
    }
    if (!arc.ok && arc.hasHero && arc.hasConversion && arc.middleCount < 1) {
      findings.push({
        category: "purchaseLogic",
        severity: "warn",
        screenId: null,
        field: "screens",
        message: "叙事弧中段（解释卖点/用法/信任）屏数不足，无法充分服务决策逻辑",
        autoFixable: false
      });
    }
  }

  // 类别③ 内容完整性：每屏 goal / 主文案；首屏身份锚。
  screens.forEach((screen, i) => {
    const copy = screen.copy || {};
    if (!String(screen.goal || "").trim()) {
      findings.push({
        category: "completeness",
        severity: "warn",
        screenId: screen.id,
        field: "goal",
        message: `屏 ${screen.id} 缺少单屏目标描述`,
        autoFixable: false
      });
    }
    if (!String(copy.headline || "").trim()) {
      findings.push({
        category: "completeness",
        severity: "warn",
        screenId: screen.id,
        field: "copy.headline",
        message: `屏 ${screen.id} 缺少主文案`,
        autoFixable: false
      });
    }
    if (i === 0 && screen.role !== "hero" && !String(screen.identityAnchor || "").trim()) {
      findings.push({
        category: "completeness",
        severity: "warn",
        screenId: screen.id,
        field: "identityAnchor",
        message: "首屏未设身份锚点（hero/identityAnchor），商品身份弱",
        autoFixable: true,
        fixType: "setHeroAnchor"
      });
    }
  });

  // 类别④ 视觉设计：相邻屏构图重复（单调）。
  for (let i = 0; i < screens.length - 1; i += 1) {
    const a = screens[i].composition || {};
    const b = screens[i + 1].composition || {};
    if (String(a.layout || "") && a.layout === b.layout) {
      findings.push({
        category: "visual",
        severity: "warn",
        screenId: screens[i + 1].id,
        field: "composition.layout",
        message: `屏 ${screens[i].id} 与 ${screens[i + 1].id} 构图重复（${a.layout}），视觉单调`,
        autoFixable: true,
        fixType: "rotateLayout"
      });
    }
  }

  // 类别⑤ 提示词：frozenPrompt 为空 / 与确定性重编译字节不一致（parity）。
  let compiled = {};
  try {
    for (const screen of screens) {
      const { prompt } = compileScreenPrompt({
        screen,
        globalLockText: String(planning.globalLock || ""),
        visualDNA: planning.visualDNA || {}
      });
      compiled[screen.id] = prompt;
    }
  } catch {
    compiled = {};
  }
  for (const screen of screens) {
    const fp = String(frozen[screen.id] || "");
    if (!fp.trim()) {
      findings.push({
        category: "prompt",
        severity: "blocker",
        screenId: screen.id,
        field: "frozenPrompts",
        message: `屏 ${screen.id} 尚未冻结提示词`,
        autoFixable: true,
        fixType: "recompile"
      });
    } else {
      const fresh = String(compiled[screen.id] || "");
      if (fresh && fresh !== fp) {
        findings.push({
          category: "prompt",
          severity: "blocker",
          screenId: screen.id,
          field: "frozenPrompts",
          message: `屏 ${screen.id} frozenPrompt 与确定性重编译字节不一致（展示≠实际）`,
          autoFixable: true,
          fixType: "recompile"
        });
      }
    }
  }

  // 类别⑥ 用户选项：appliedOptions 是否覆盖关键选项（参数真实生效）。
  const miss = missingTracedOptions(appliedOptions, QC_TRACED_OPTIONS);
  if (!miss.complete) {
    findings.push({
      category: "options",
      severity: "warn",
      screenId: null,
      field: "appliedOptions",
      message: `选项溯源缺失：${miss.missing.join("、")}`,
      autoFixable: false
    });
  }

  return findings;
}

/**
 * 一次定向修正（确定性，零模型）：按 findings 里的 autoFixable 项就地纠正。
 * 纠正类型：stripUnconfirmed / setHeroAnchor / rotateLayout / recompile。
 * 不发明任何文案或事实；recompile 修的是编译期产物（frozenPrompts），由调用方重编译。
 * @param {Object} project
 * @param {Array} findings
 * @returns {{ screens: Array, changed: boolean, fixTypes: string[], needRecompile: boolean }}
 */
export function applyDirectedFix(project = {}, findings = []) {
  const planning = project.planning || {};
  const sourceScreens = Array.isArray(planning.screens) ? planning.screens : [];
  const fixes = (Array.isArray(findings) ? findings : []).filter((f) => f && f.autoFixable);
  if (!fixes.length) {
    return { screens: sourceScreens, changed: false, fixTypes: [], needRecompile: false };
  }
  const screens = sourceScreens.map((s) => ({
    ...s,
    composition: { ...(s.composition || {}) },
    copy: { ...(s.copy || {}) },
    productFacts: Array.isArray(s.productFacts) ? [...s.productFacts] : []
  }));
  let needRecompile = false;
  const applied = new Set();
  for (const f of fixes) {
    const screen = screens.find((s) => s.id === f.screenId);
    if (!screen) continue;
    if (f.fixType === "stripUnconfirmed") {
      screen.productFacts = screen.productFacts.filter((fact) => fact && isPublishableGrade(fact.grade));
      applied.add("stripUnconfirmed");
    } else if (f.fixType === "setHeroAnchor") {
      screen.identityAnchor = "product";
      applied.add("setHeroAnchor");
    } else if (f.fixType === "rotateLayout") {
      screen.composition.layout = rotateLayout(screen.composition.layout);
      applied.add("rotateLayout");
    } else if (f.fixType === "recompile") {
      needRecompile = true;
      applied.add("recompile");
    }
  }
  return { screens, changed: applied.size > 0, fixTypes: [...applied], needRecompile };
}
