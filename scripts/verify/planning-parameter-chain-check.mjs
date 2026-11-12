// 详情创作「参数链断点」门禁（V209）：覆盖三条此前断裂的参数链，纯逻辑 + 源码静态断言，零模型、零上游。
//
// 检查对象与回归目标（对应执行单 §1 四断点）：
//   A) 参考图链路：spec.screens[].referenceImagePaths → buildTaskRecord → runTask → generator(FormData image)
//      —— 旧断点：orchestrator 未把该字段传进 buildTaskRecord，导致出图请求不带任何参考图。
//   B) textModel 透传：前端下拉 → 请求体 → modelName 生效
//      —— 旧断点：hook 只传 { apiKey }，用户选的推理模型到不了服务端。
//   C) 质检行业边界：project 行业策略 → qc-review 取 industryStrategy → buildQcUserPrompt 注入 promoBoundaries
//      —— 旧断点：qc-review 未取未传，行业宣传边界只进导演、没进独立质检。
//
// 设计：自包含回归门禁，在当前（V209 修复后）代码上全绿；只拦「新增」回归，不刷无关基线（基线棘轮精神）。
// 负向对照：每条关键断言都配一条「锚点存在性 / 旧写法已消失」对照，防止锚点搬家变假绿。
//
// 用法：node scripts/verify/planning-parameter-chain-check.mjs [--json]

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");

const TASK_MODEL = path.join(ROOT, "server", "features", "detail-studio", "generation", "task-model.js");
const ORCHESTRATOR = path.join(ROOT, "server", "features", "detail-studio", "generation", "orchestrator.js");
const LOCAL_GEN = path.join(ROOT, "server", "features", "detail-studio", "generation", "local-images-generator.js");
const QC_REVIEW = path.join(ROOT, "server", "features", "detail-studio", "planning", "qc-review.js");
const HOOK = path.join(ROOT, "src", "features", "detail-studio", "state", "use-detail-studio-state.js");
const API = path.join(ROOT, "src", "api", "detail-studio.js");
const QC_PROMPT = path.join(ROOT, "prompts", "detail-studio", "quality", "qc-prompt.js");
const AI_SHARED = path.join(ROOT, "server", "core", "ai-chat-shared.js");
const MODEL_CONFIG = path.join(ROOT, "server", "features", "detail-studio", "model", "model-config.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

async function main() {
  // ── A) 参考图链路 ──
  if (!existsSync(TASK_MODEL)) {
    check("A·task-model.js 存在", false, "缺失：" + TASK_MODEL);
  } else {
    const { buildTaskRecord } = await import(pathToFileURL(TASK_MODEL).href);
    const recWith = buildTaskRecord({
      projectId: "p", screenIndex: 0, frozenPrompt: "x", idempotencyKey: "k".repeat(64), referenceImagePaths: ["/a.png", "/b.png"]
    });
    check("A1·buildTaskRecord 含非空 referenceImagePaths", Array.isArray(recWith.referenceImagePaths) && recWith.referenceImagePaths.length === 2, JSON.stringify(recWith.referenceImagePaths));
    const recDef = buildTaskRecord({ projectId: "p", screenIndex: 0, frozenPrompt: "x", idempotencyKey: "k".repeat(64) });
    check("A2·buildTaskRecord 缺省兜底 []（旧任务记录不崩）", Array.isArray(recDef.referenceImagePaths) && recDef.referenceImagePaths.length === 0, JSON.stringify(recDef.referenceImagePaths));
  }

  if (!existsSync(ORCHESTRATOR)) {
    check("A·orchestrator.js 存在", false, "缺失：" + ORCHESTRATOR);
  } else {
    const text = readFileSync(ORCHESTRATOR, "utf8");
    check("A3·submitBatch/submitSingleScreen 把 screen.referenceImagePaths 传进 buildTaskRecord",
      /referenceImagePaths:\s*screen\.referenceImagePaths/.test(text),
      text.includes("buildTaskRecord({") ? "已传参" : "未找到 buildTaskRecord 调用（扫描锚点缺失）");
    check("A4·runTask 读 current.referenceImagePaths || [] 并转发 generator",
      /referenceImagePaths:\s*current\.referenceImagePaths\s*\|\|\s*\[\]/.test(text),
      text.includes("generator({") ? "已转发" : "未找到 generator 调用");
    // 负向对照：幂等键不得包含 referenceImagePaths（红线：换参考图不误判重复扣费）
    check("A5·负向对照：idempotencyKey 调用不含 referenceImagePaths", !/idempotencyKey\([^)]*referenceImagePaths/.test(text), "幂等键误含参考图");
    // 负向对照：buildTaskRecord 形参确实声明 referenceImagePaths（防被误删）
    check("A6·负向对照：buildTaskRecord 形参声明 referenceImagePaths", /buildTaskRecord\(\{\s*[\s\S]*?referenceImagePaths/.test(text), "形参缺失");
  }

  if (!existsSync(LOCAL_GEN)) {
    check("A·local-images-generator.js 存在", false, "缺失：" + LOCAL_GEN);
  } else {
    const text = readFileSync(LOCAL_GEN, "utf8");
    check("A7·local-images-generator 遍历 req.referenceImagePaths 并 append 到 FormData image",
      /req\.referenceImagePaths/.test(text) && /form\.append\(\s*"image"/.test(text),
      "遍历+append 链路存在");
    check("A8·source 字段为 detail-studio（日志归因正确）", /form\.set\(\s*"source",\s*"detail-studio"\s*\)/.test(text), "source 未设为 detail-studio");
    // 负向对照：不得残留旧 detail-main 归因
    check("A9·负向对照：无残留 detail-main 归因", text.indexOf("detail-main") < 0, "仍残留 detail-main");
  }

  // ── B) textModel 透传 ──
  if (!existsSync(AI_SHARED) || !existsSync(MODEL_CONFIG)) {
    check("B·modelName 依赖存在", false, "缺失 ai-chat-shared / model-config");
  } else {
    const { modelName } = await import(pathToFileURL(AI_SHARED).href);
    const { DETAIL_STUDIO_MODEL_SPEC } = await import(pathToFileURL(MODEL_CONFIG).href);
    check("B1·modelName({textModel}) 取到该值（推理模型生效）", modelName({ textModel: "v209-tm" }, DETAIL_STUDIO_MODEL_SPEC) === "v209-tm", modelName({ textModel: "v209-tm" }, DETAIL_STUDIO_MODEL_SPEC));
    check("B2·textModel 缺省走 fallback（不新增模型入口）", modelName({}, DETAIL_STUDIO_MODEL_SPEC) === (DETAIL_STUDIO_MODEL_SPEC.fallback || modelName({}, DETAIL_STUDIO_MODEL_SPEC)), "fallback=" + modelName({}, DETAIL_STUDIO_MODEL_SPEC));
  }

  if (!existsSync(HOOK)) {
    check("B·use-detail-studio-state.js 存在", false, "缺失：" + HOOK);
  } else {
    const text = readFileSync(HOOK, "utf8");
    const tmCalls = (text.match(/DetailStudio\(currentProject\.id,\s*\{\s*apiKey,\s*textModel:/g) || []).length;
    check("B3·analyzeProject/directorProject/qualityReview 均传出 textModel",
      tmCalls >= 3, "命中 { apiKey, textModel: … } 的 DetailStudio 调用 " + tmCalls + " 处（应≥3）");
    // 负向对照：旧写法「只传 { apiKey }」已消失（证明不是只看前端 state）
    check("B4·负向对照：分析/导演/质检调用不再只传 { apiKey }", !/DetailStudio\(currentProject\.id,\s*\{\s*apiKey\s*\}\s*\)/.test(text), "仍存在只传 apiKey 的旧调用");
  }

  if (!existsSync(API)) {
    check("B·detail-studio.js(api) 存在", false, "缺失：" + API);
  } else {
    const text = readFileSync(API, "utf8");
    const count = (text.match(/\{\s*apiKey,\s*textModel\s*\}/g) || []).length;
    check("B5·api 层 analyze/director/quality 请求体均含 textModel", count >= 3, "命中 { apiKey, textModel } " + count + " 处（应≥3）");
    // 负向对照：quality 接口旧写法 { apiKey } 已消失
    check("B6·负向对照：quality 接口不再只传 { apiKey }", text.indexOf('quality", { apiKey }') < 0, "仍残留 quality 只传 apiKey");
  }

  if (!existsSync(QC_REVIEW)) {
    check("C·qc-review.js 存在", false, "缺失：" + QC_REVIEW);
  } else {
    const text = readFileSync(QC_REVIEW, "utf8");
    check("C1·qc-review 引入 resolveIndustryStrategy", /import\s*\{[^}]*resolveIndustryStrategy[^}]*\}\s*from/.test(text), "未引入 resolveIndustryStrategy");
    check("C2·runQualityCheck 调 resolveIndustryStrategy(project) 取策略", /resolveIndustryStrategy\(\s*project\s*\)/.test(text), "未取行业策略");
    check("C3·callQcModel 形参含 industryStrategy", /callQcModel\(\{\s*[^}]*industryStrategy/.test(text), "callQcModel 未接收 industryStrategy");
    check("C4·buildQcUserPrompt 调用注入 industryStrategy", /appliedOptions:\s*planning\.appliedOptions[\s\S]*?industryStrategy/.test(text), "buildQcUserPrompt 未注入 industryStrategy");
    check("C5·两处 callQcModel 调用均传 industryStrategy", (text.match(/signal,\s*industryStrategy\s*\}\s*\)/g) || []).length >= 2, "未把 industryStrategy 传入两次模型调用");
    // 负向对照：MAX_AUTO_FIX 仍为 1（红线不回退）
    const m = text.match(/MAX_AUTO_FIX\s*=\s*(\d+)/);
    check("C6·负向对照：MAX_AUTO_FIX 仍为 1（封顶不回退）", m && m[1] === "1", m ? "MAX_AUTO_FIX=" + m[1] : "未找到");
  }

  if (!existsSync(QC_PROMPT)) {
    check("C·qc-prompt.js 存在", false, "缺失：" + QC_PROMPT);
  } else {
    const { buildQcUserPrompt } = await import(pathToFileURL(QC_PROMPT).href);
    const prompt = buildQcUserPrompt({
      screens: [{ id: "screen_1", role: "hero", composition: {}, copy: {}, productFacts: [] }],
      frozenPrompts: { screen_1: "FP" },
      industryStrategy: { name: "V209测试行业", promoBoundaries: ["禁止宣称治疗功效V209"] }
    });
    check("C7·质检提示词注入行业 promoBoundaries", prompt.indexOf("禁止宣称治疗功效V209") >= 0, "未注入边界文本");
    check("C8·质检提示词注入行业名", prompt.indexOf("V209测试行业") >= 0, "未注入行业名");
    const def = buildQcUserPrompt({ screens: [], frozenPrompts: {} });
    check("C9·无 industryStrategy 不崩溃（返回字符串）", typeof def === "string", "返回非字符串");
  }

  const failed = results.filter((r) => !r.pass);
  if (AS_JSON) {
    console.log(JSON.stringify({ ok: failed.length === 0, passed: results.length - failed.length, total: results.length, entries: results }, null, 2));
  } else {
    for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
    console.log(`\n[planning-parameter-chain] ${results.length - failed.length}/${results.length} 通过`);
  }
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("[planning-parameter-chain] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
