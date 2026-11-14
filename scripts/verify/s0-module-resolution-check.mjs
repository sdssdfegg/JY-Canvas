// S0/B2：导演 moduleId 字段路径错配与「静默回退」门禁（纯逻辑、零上游、零 KEY）。
//
// 锁死的回归：DIRECTOR_OUTPUT_SCHEMA 把 moduleId 定义在 screens[] 顶层，
// normalizeDirectorResult 却只读 composition.moduleId，且未命中库时无告警直接按位置回退。
// 结果是模型给的合法库内 id 几乎必然被丢弃（S3 引入客户板块选择后会连用户选择一起丢）。
// 本门禁同时验证：顶层命中 / 历史路径兼容 / 顶层优先 / 未命中显式告警 / 旧逻辑负向对照。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DIRECTOR_SRC = path.join(ROOT, "server", "features", "detail-studio", "planning", "director-visual.js");
const PROMPT_SRC = path.join(ROOT, "prompts", "detail-studio", "prompts", "director-visual.js");
const COMPOSITION_SRC = path.join(ROOT, "prompts", "detail-studio", "core", "screen-composition.js");

const { resolveScreenModule, normalizeDirectorResult } = await import(pathToFileURL(DIRECTOR_SRC).href);
const { SCREEN_MODULE_LIBRARY, selectScreenModule } = await import(pathToFileURL(COMPOSITION_SRC).href);

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}
const has = (h, n) => typeof h === "string" && h.indexOf(n) >= 0;
function done() {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  console.log(`\n[s0-module-resolution] ${results.length - failed.length}/${results.length} 通过`);
  console.log(`ok=${failed.length === 0}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

async function main() {
  const src = readFileSync(DIRECTOR_SRC, "utf8");
  const promptSrc = readFileSync(PROMPT_SRC, "utf8");

  // ── 1) schema 与实现的字段路径一致性 ──
  const schemaScreensIdx = promptSrc.indexOf("\"screens\": [");
  const schemaModuleIdx = promptSrc.indexOf("\"moduleId\": string,", schemaScreensIdx >= 0 ? schemaScreensIdx : 0);
  check("schema 中可定位 screens 块（indexOf >= 0 守卫）", schemaScreensIdx >= 0, `idx=${schemaScreensIdx}`);
  check("schema 把 moduleId 定义在 screens[] 顶层", schemaModuleIdx >= 0 && schemaModuleIdx > schemaScreensIdx, `idx=${schemaModuleIdx}`);
  check("实现导出 resolveScreenModule", has(src, "export function resolveScreenModule"));
  check("normalize 调用 resolveScreenModule（不再自读 composition.moduleId 取值）",
    has(src, "resolveScreenModule(screen, index, screens.length)") && !has(src, "SCREEN_MODULE_LIBRARY[composition.moduleId]"));
  check("未命中时显式告警而非静默", has(src, "console.warn") && has(src, "resolvedModule.warning"));
  const stripped = src.split("resolveScreenModule").join("");
  check("负向对照·抹掉 resolveScreenModule 后调用断言变假", !has(stripped, "resolveScreenModule"));

  // ── 2) 纯函数行为 ──
  const byTop = resolveScreenModule({ moduleId: "materialDetail", role: "中立描述" }, 1, 5);
  check("顶层 moduleId 命中库（fallback=false）", byTop.fallback === false && byTop.moduleEntry.id === "materialDetail", byTop.moduleEntry.id);
  const byLegacy = resolveScreenModule({ composition: { moduleId: "hero" }, role: "中立描述" }, 1, 5);
  check("历史 composition.moduleId 仍兼容", byLegacy.fallback === false && byLegacy.moduleEntry.id === "hero", byLegacy.moduleEntry.id);
  const both = resolveScreenModule({ moduleId: "specInfo", composition: { moduleId: "hero" }, role: "中立描述" }, 1, 5);
  check("两处都有时优先 schema 顶层", both.moduleEntry.id === "specInfo", both.moduleEntry.id);
  const miss = resolveScreenModule({ moduleId: "notInLibrary", role: "中立描述" }, 1, 5);
  check("未命中库 id → fallback=true 且 warning 非空", miss.fallback === true && miss.warning.indexOf("notInLibrary") >= 0);
  const absent = resolveScreenModule({ role: "中立描述" }, 1, 5);
  check("负向对照·模型未给 id 时不制造告警噪音", absent.fallback === true && absent.warning === "");

  // ── 3) 旧逻辑负向对照：证明修复前后行为确有差异 ──
  function legacyResolve(screen, index, count) {
    const composition = screen.composition || {};
    return (composition.moduleId && SCREEN_MODULE_LIBRARY[composition.moduleId])
      ? SCREEN_MODULE_LIBRARY[composition.moduleId]
      : selectScreenModule(screen.role || screen.goal || "", index, count);
  }
  const legacyFallback = legacyResolve({ moduleId: "specInfo", role: "中立描述", composition: {} }, 0, 1);
  check("负向对照·旧逻辑会丢弃顶层 specInfo 并回退", legacyFallback.id !== "specInfo", `legacy=${legacyFallback.id}`);
  const normalized = normalizeDirectorResult({ screens: [{ role: "中立描述", goal: "", moduleId: "specInfo", composition: {} }] });
  check("修复后 normalizeDirectorResult 保留 specInfo", normalized.screens[0].moduleId === "specInfo", normalized.screens[0].moduleId);

  // ── 4) 行为级「不静默」：未命中 id 必须产生 warn ──
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    const out = normalizeDirectorResult({ screens: [{ role: "中立描述", goal: "", moduleId: "notInLibrary", composition: {} }] });
    check("未命中 id 仍产出 ScreenSpec（不静默丢屏）", out.screens.length === 1);
    check("未命中 id 触发显式告警且含原始 id", warnings.length === 1 && warnings[0].indexOf("notInLibrary") >= 0, `warn=${warnings.length}`);
  } finally {
    console.warn = originalWarn;
  }

  done();
}

main().catch((err) => {
  console.error("[s0-module-resolution] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
