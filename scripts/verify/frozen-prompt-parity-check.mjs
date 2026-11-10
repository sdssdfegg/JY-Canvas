// frozenPrompt 字节一致门禁（V202 §3 B3 / §7-5）：编译产物 == 生成请求体 prompt，用户看到的 == 实际发送的。
//
// 为什么需要它：B3 红线是「后台不得再经任何 Skill / Agent 改写提示词」。本门禁静态 + 单元双保险：
//   1) 确定性：同一 ScreenSpec 编译两次，字节完全一致（零随机、零模型）；
//   2) 唯一源：compileScreenPlan（冻结时服务端重编译落库）与 compileScreenPrompt（预览）同源，不出现第二份改写；
//   3) 事实兜底：unconfirmed 级事实**绝不**进入 frozenPrompt（验收 §7-2 的同一根铁律在编译期再钉一次）。
//
// 纯逻辑、零模型、零上游：复用 prompts/detail-studio/core 与 server/features/.../planning 的纯函数。
//
// 用法：node scripts/verify/frozen-prompt-parity-check.mjs [--json]

import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");

const COMPILER = pathToFileURL(path.join(ROOT, "prompts", "detail-studio", "core", "prompt-compiler.js")).href;
const FACT_GRADING = pathToFileURL(path.join(ROOT, "prompts", "detail-studio", "core", "fact-grading.js")).href;
const COMPILE_PLAN = pathToFileURL(path.join(ROOT, "server", "features", "detail-studio", "planning", "compile-screen.js")).href;

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

async function main() {
  const { compileScreenPrompt } = await import(COMPILER);
  const { FACT_GRADE } = await import(FACT_GRADING);
  const { compileScreenPlan, recompileForFreeze } = await import(COMPILE_PLAN);

  const screenUnconfirmed = {
    id: "screen_1",
    index: 0,
    role: "hero",
    composition: { layout: "产品居中白底", visualWeight: 0.6, hierarchy: { primaryText: "主推款", secondaryText: "" } },
    copy: { headline: "主推款", subcopy: "", tags: [] },
    // 含一条 unconfirmed（美白，待确认）+ 一条 visible（棉）
    productFacts: [
      { key: "功效", value: "美白", grade: FACT_GRADE.UNCONFIRMED },
      { key: "材质", value: "纯棉", grade: FACT_GRADE.VISIBLE }
    ],
    identityAnchor: "测试商品",
    visualDNA: { palette: "暖色", lighting: "", mood: "", fontTone: "" },
    screenOverrides: [],
    referenceAssets: []
  };
  const screenUser = {
    id: "screen_2",
    index: 1,
    role: "coreSellingPoint",
    composition: { layout: "卖点特写", visualWeight: 0.5, hierarchy: { primaryText: "", secondaryText: "" } },
    copy: { headline: "", subcopy: "", tags: [] },
    productFacts: [{ key: "颜色", value: "白色", grade: FACT_GRADE.USER }],
    identityAnchor: "",
    visualDNA: { palette: "暖色", lighting: "", mood: "", fontTone: "" },
    screenOverrides: [],
    referenceAssets: []
  };
  const globalLockText = "目标平台：淘宝详情；输出语言：中文；比例：21:9；禁止出现真人。";
  const visualDNA = { palette: "暖色", lighting: "自然光", mood: "真实质感", fontTone: "清晰可读" };

  const a1 = compileScreenPrompt({ screen: screenUnconfirmed, globalLockText, visualDNA });
  const a2 = compileScreenPrompt({ screen: screenUnconfirmed, globalLockText, visualDNA });
  check("确定性：同屏编译两次字节一致", a1.prompt === a2.prompt, a1.prompt === a2.prompt ? "" : "两次输出不同（含随机/时间）");

  // unconfirmed 不得进 frozenPrompt
  check("unconfirmed 事实（美白）不进入提示词", a1.prompt.indexOf("美白") < 0, "unconfirmed 事实泄漏进 frozenPrompt");
  // visible 事实应保留
  check("visible 事实（纯棉）进入提示词", a1.prompt.indexOf("纯棉") >= 0, "已确认事实被误删");

  const project = { planning: { globalLock: globalLockText, visualDNA, screens: [screenUnconfirmed, screenUser] } };
  const plan = compileScreenPlan(project);
  const refreeze = recompileForFreeze(project);
  check("compileScreenPlan 与 recompileForFreeze 同源一致", JSON.stringify(plan.frozenPrompts) === JSON.stringify(refreeze.frozenPrompts),
    "冻结重编译与预览编译不一致");

  check("compileScreenPlan 逐屏产出与 compileScreenPrompt 一致",
    plan.frozenPrompts.screen_1 === a1.prompt && plan.frozenPrompts.screen_2.indexOf("白色") >= 0,
    "逐屏编译与单屏编译偏离");

  check("user 事实（白色）进入第 2 屏提示词", plan.frozenPrompts.screen_2.indexOf("白色") >= 0, "user 事实未进入");

  const failed = results.filter((r) => !r.pass);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, entries: results }, null, 2));
  } else {
    for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
    console.log(`\n[frozen-prompt-parity] ${results.length - failed.length}/${results.length} 通过`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("[frozen-prompt-parity] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
