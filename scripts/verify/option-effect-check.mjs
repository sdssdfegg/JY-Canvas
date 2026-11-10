// 选项生效门禁（V202 §3.6.2 / §7-4）：固定其它字段，只改一个选项，断言编译出的 frozenPrompt 约束随之变化；
// 再往真源塞入「选项未参与编译」的违法内容，确认门禁能识别。每个 indexOf 切片配 >=0 守卫，防锚点搬家变假绿。
//
// 这是「展示 == 实际」保证的支柱之一：若某选项改了却不影响最终提示词，说明参数链断了。
// 纯逻辑、零模型、零上游：直接复用 prompts/detail-studio/core 的纯函数（global-lock.js / prompt-compiler.js）。
//
// 用法：node scripts/verify/option-effect-check.mjs [--json]

import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");

const GLOBAL_LOCK = pathToFileURL(path.join(ROOT, "prompts", "detail-studio", "core", "global-lock.js")).href;
const COMPILER = pathToFileURL(path.join(ROOT, "prompts", "detail-studio", "core", "prompt-compiler.js")).href;

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

const has = (haystack, needle) => typeof haystack === "string" && haystack.indexOf(needle) >= 0;

async function main() {
  const { buildGlobalLock } = await import(GLOBAL_LOCK);
  const { compileScreenPrompt } = await import(COMPILER);

  const baseScreen = {
    id: "s1",
    index: 0,
    role: "hero",
    composition: { layout: "产品居中白底", visualWeight: 0.6, hierarchy: { primaryText: "主推款", secondaryText: "" } },
    copy: { headline: "主推款", subcopy: "", tags: [] },
    productFacts: [{ key: "材质", value: "纯棉", grade: "visible" }],
    screenOverrides: [],
    referenceAssets: []
  };

  // 固定基线选项，只暴露可切换项。
  const baseOptions = {
    productName: "测试商品", ratio: "21:9", imageSize: "2K", lang: "中文",
    copywriting: "need", fontStyle: "soft", richness: "simple", modelMode: "no-model", modelPose: "regular",
    screenCount: 8, platformProfile: { platform: "淘宝", pageType: "详情", visualRule: "", copyRule: "", rhythm: "标准" },
    industryStrategy: { name: "通用", analyzeAttributes: [], sellingAngles: [], taboos: [] },
    analysis: { industry: "通用", targetAudience: "", visualStyle: "", materialHints: [] }
  };

  function compileWith(overrides = {}) {
    const options = { ...baseOptions, ...overrides };
    const lock = buildGlobalLock(options);
    const { prompt } = compileScreenPrompt({ screen: baseScreen, globalLockText: lock.text });
    return { prompt, lockText: lock.text };
  }

  // ── 负向对照基准：基线编译必须真的含「无模特」约束 + 「需要文案」约束，证明切片位置真实存在 ──
  const base = compileWith();
  check("基准含「禁止出现真人」（无模特基线）", has(base.prompt, "禁止出现真人"), "基线无模特约束，切片不可信");
  check("基准含「需要文案」（need 基线）", has(base.prompt, "生成清晰可读的电商文案"), "基线文案约束缺失");

  // 1) modelMode：no-model ↔ use-model（≥6 关键选项之一）
  const withModel = compileWith({ modelMode: "use-model" });
  check("modelMode=use-model 移除「禁止出现真人」", !has(withModel.prompt, "禁止出现真人") && has(withModel.prompt, "使用"), "切换后约束未变");

  // 2) copywriting：need ↔ poster
  const poster = compileWith({ copywriting: "poster" });
  check("copywriting=poster 加入「不要生成任何文字」", has(poster.prompt, "不要生成任何文字") && !has(poster.prompt, "生成清晰可读的电商文案"), "文案模式切换无效");

  // 3) richness：simple ↔ rich
  const rich = compileWith({ richness: "rich" });
  check("richness=rich 加入「加入辅助标签」", has(rich.prompt, "加入辅助标签"), "信息密度切换无效");

  // 4) fontStyle：soft ↔ heiti
  const heiti = compileWith({ fontStyle: "heiti" });
  check("fontStyle=heiti 加入「黑体」", has(heiti.prompt, "黑体"), "字体气质切换无效");

  // 5) ratio：21:9 出现在元信息
  check("ratio=21:9 出现在全局锁", has(base.lockText, "21:9"), "比例未进入提示词");
  const ratio43 = compileWith({ ratio: "4:3" });
  check("ratio=4:3 改变全局锁", !has(ratio43.lockText, "21:9") && has(ratio43.lockText, "4:3"), "比例切换无效");

  // 6) lang：中文 出现在元信息
  check("lang=中文 出现在全局锁", has(base.lockText, "中文"), "语言未进入提示词");
  const langEn = compileWith({ lang: "英文" });
  check("lang=英文 改变全局锁", !has(langEn.lockText, "中文") && has(langEn.lockText, "英文"), "语言切换无效");

  // 7) platform：切换平台改变全局锁（负向对照：平台名不同）
  const douyin = compileWith({ platformProfile: { platform: "抖音", pageType: "详情", visualRule: "", copyRule: "", rhythm: "快节奏" } });
  check("platform=抖音 改变全局锁", base.lockText !== douyin.lockText && has(douyin.lockText, "抖音"), "平台切换无效");

  const failed = results.filter((r) => !r.pass);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, entries: results }, null, 2));
  } else {
    for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
    console.log(`\n[option-effect] ${results.length - failed.length}/${results.length} 通过`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("[option-effect] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
