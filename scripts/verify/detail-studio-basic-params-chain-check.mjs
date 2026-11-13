// 详情创作「基础参数 → 参数链 → frozenPrompt」门禁（V212 P2.6）：
// 证明左列基础参数面板（BasicParamsPanel）写入的 project.basicParams 真的进入
// TRACED_OPTION_KEYS → appliedOptions → globalLock → ScreenSpec → frozenPrompt 链路，
// 而非只存在前端 state、不进规划。
//
// 纯逻辑、零模型、零上游：复用 analyze-strategy.js（extractPlanningOptions/buildAnalyzeContext）
// 与 compile-screen.js / prompt-compiler.js 的纯函数。每个断言配负向对照，防锚点搬家变假绿。
//
// 用法：node scripts/verify/detail-studio-basic-params-chain-check.mjs [--json]

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");

const ANALYZE = pathToFileURL(path.join(ROOT, "server", "features", "detail-studio", "planning", "analyze-strategy.js")).href;
const COMPILE_PLAN = pathToFileURL(path.join(ROOT, "server", "features", "detail-studio", "planning", "compile-screen.js")).href;

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}
const has = (h, n) => typeof h === "string" && h.indexOf(n) >= 0;

async function main() {
  if (!existsSync(path.join(ROOT, "server", "features", "detail-studio", "planning", "analyze-strategy.js"))) {
    check("analyze-strategy.js 存在", false, "缺失");
    return done();
  }
  const { extractPlanningOptions, buildAnalyzeContext } = await import(ANALYZE);
const { compileScreenPlan } = await import(COMPILE_PLAN);

  const baseScreen = {
    id: "s1", index: 0, role: "hero",
    composition: { layout: "产品居中白底", visualWeight: 0.6, hierarchy: { primaryText: "主推款", secondaryText: "" } },
    copy: { headline: "主推款", subcopy: "", tags: [] },
    productFacts: [{ key: "材质", value: "纯棉", grade: "visible" }],
    screenOverrides: [], referenceAssets: []
  };

  // 端到端：basicParams → globalLock → frozenPrompt
  function frozenFrom(basicParams) {
    const project = { basicParams };
    const ctx = buildAnalyzeContext(project);
    project.planning = { screens: [baseScreen], globalLock: ctx.context.globalLock, visualDNA: {} };
    return compileScreenPlan(project).frozenPrompts.s1;
  }

  // 1) basicParams 优先：ratio 来自 basicParams
  const o1 = extractPlanningOptions({ basicParams: { ratio: "4:3", copywriting: "poster" } });
  check("basicParams.ratio 进入选项链", o1.ratio === "4:3", "ratio=" + o1.ratio);

  // 2) 回退：无 basicParams，从 productData.fields 取
  const o2 = extractPlanningOptions({ productData: { fields: { ratio: "1:1", copywriting: "blank" } } });
  check("无 basicParams 回退 productData.fields", o2.ratio === "1:1" && o2.copywriting === "blank", JSON.stringify(o2));

  // 3) basicParams 优先于 fields（两者都存在）
  const o3 = extractPlanningOptions({ basicParams: { ratio: "16:9" }, productData: { fields: { ratio: "1:1" } } });
  check("basicParams 优先于 productData.fields", o3.ratio === "16:9", "ratio=" + o3.ratio);

  // 4) 工作流键即平台标识：basicParams.workflow → options.platform
  const o4 = extractPlanningOptions({ basicParams: { workflow: "tmall-detail" } });
  check("basicParams.workflow 映射为规划 platform", o4.platform === "tmall-detail", "platform=" + o4.platform);

  // 5) 屏数来自 basicParams.count
  const o5 = extractPlanningOptions({ basicParams: { count: 6 } });
  check("basicParams.count 进入 screenCount", o5.screenCount === 6, "screenCount=" + o5.screenCount);

  // 6) 端到端：globalLock 反映 basicParams.ratio（确定性）
  const f43 = frozenFrom({ ratio: "4:3", copywriting: "need" });
  const f11 = frozenFrom({ ratio: "1:1", copywriting: "need" });
  check("端到端·globalLock 含 4:3（basicParams 进锁）", has(f43, "4:3"), "f43 未含 4:3");
  check("端到端·globalLock 含 1:1（切换生效）", has(f11, "1:1") && !has(f11, "4:3"), "f11 异常");

  // 7) 负向对照：改一个选项 → frozenPrompt 必须变（V211 §1.4 铁律）
  check("端到端·改 ratio 使 frozenPrompt 变化", f43 !== f11, "改比例后提示词未变（参数链断）");

  // 8) 文本域 userInstruction 进入分析提示词
  const ctxU = buildAnalyzeContext({ basicParams: { userInstruction: "突出性价比与包邮" } });
  check("文本域·userInstruction 进入 analyze 提示词", has(ctxU.userPrompt, "突出性价比与包邮"), "userInstruction 未进提示词");

  // 9) 文本域 productFeature / sellingPoints 进入分析提示词
  const ctxT = buildAnalyzeContext({ basicParams: { productFeature: "304不锈钢", sellingPoints: "耐用不掉漆" } });
  check("文本域·productFeature 进入提示词", has(ctxT.userPrompt, "304不锈钢"), "productFeature 未进提示词");
  check("文本域·sellingPoints 进入提示词", has(ctxT.userPrompt, "耐用不掉漆"), "sellingPoints 未进提示词");

  // 10) 负向对照：空项目不抛错、走默认（platform=taobao-detail, ratio=21:9）
  let defOk = true, defMsg = "";
  try {
    const o0 = extractPlanningOptions({});
    defOk = o0.platform === "taobao-detail" && o0.ratio === "21:9" && o0.screenCount === 8;
    defMsg = JSON.stringify(o0);
    const f0 = frozenFrom({});
    if (typeof f0 !== "string" || f0.length === 0) { defOk = false; defMsg = "空项目 frozenPrompt 异常"; }
  } catch (e) {
    defOk = false; defMsg = e.message;
  }
  check("负向对照·空项目不抛错且走默认", defOk, defMsg);

  // 11) 负向对照：basicParams.count 非法 → screenCount 回退 8（不 NaN/不崩）
  const oBad = extractPlanningOptions({ basicParams: { count: "abc" } });
  check("负向对照·count 非法回退默认屏数", oBad.screenCount === 8, "screenCount=" + oBad.screenCount);

  // 12) 负向对照：productName 来自 basicParams，无则回退 productData.fields，再无则「目标产品」
  const pnBp = extractPlanningOptions({ basicParams: { productName: "我的商品X" } });
  const pnFields = extractPlanningOptions({ productData: { fields: { productName: "旧字段品" } } });
  const pnNone = buildAnalyzeContext({});
  check("productName·basicParams 优先", pnBp.productName === "我的商品X", "pn=" + pnBp.productName);
  check("productName·回退 productData.fields", pnFields.productName === "旧字段品", "pn=" + pnFields.productName);
  check("productName·全无回退「目标产品」", has(pnNone.context.globalLock, "目标产品"), "globalLock 缺默认品名");

  done();
}

function done() {
  const failed = results.filter((r) => !r.pass);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, entries: results }, null, 2));
  } else {
    for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
    console.log(`\n[detail-studio-basic-params-chain] ${results.length - failed.length}/${results.length} 通过`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("[detail-studio-basic-params-chain] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
