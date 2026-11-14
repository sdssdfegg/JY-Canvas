// V214 P2：一键详情「可选详情内容板块」全链路门禁。
//
// 拦的是三件靠自律撑不住的事：
//   ① 前端勾选了但没进 payload / AI 白名单（只做前端等于没做）；
//   ② 空选时 payload 出现空数组或恒定字段，破坏「与改造前逐字节一致」；
//   ③ 板块被机械地一板块一屏，或屏数随板块数量变化。
//
// 口径照搬 api-layering-check：存量违规记基线、新增判红、stale 判红、
// --update --reason 刷新。首次上线基线不存在时按空基线处理，不锁死提交。
// 纯逻辑、零上游、零子进程，进 --fast 快速子集。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildDetailPromptGroup } from "../../server/detail-middleware.js";
import {
  serializeSelectedSections,
  PRESET_SECTIONS,
  createCustomSection
} from "../../src/features/detail/detail-sections.js";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "verify", "detail-sections-chain-baseline.json");
const AS_JSON = process.argv.includes("--json");
const UPDATE = process.argv.includes("--update");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const sources = {
  sections: read("src/features/detail/detail-sections.js"),
  state: read("src/features/detail/detail-state.js"),
  ai: read("server/detail-ai.js"),
  middleware: read("server/detail-middleware.js")
};

const NEEDLE = {
  emptyGuard: "if (!Array.isArray(items) || items.length === 0) return undefined;",
  payloadSpread: "...(sectionPayload ? { selectedSections: sectionPayload } : {})",
  aiInputSpread: "...(selectedSections ? { selectedSections } : {})",
  aiInstruction: "...(selectedSections ? [",
  schema: "hero|painReverse|coreSellingPoint|materialDetail|useScenario|specInfo|trustProof|conversionClose|fitStructure"
};

const checks = [];
const push = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: String(detail || "") });
// 探针必须自带 >= 0 守卫：锚点搬家会如实判红，不会静默变成假绿。
const probe = (source, needle) => source.indexOf(needle) >= 0;
const expectIncludes = (name, source, needle) => push(name, probe(source, needle), "命中锚点");

// ---------------------------------------------------------------- 静态断言
expectIncludes("S1 序列化空选返回 undefined（非 []）", sources.sections, NEEDLE.emptyGuard);
expectIncludes("S2 payload 条件展开（空选 key 不存在）", sources.state, NEEDLE.payloadSpread);
expectIncludes("S3 AI input 白名单条件注入", sources.ai, NEEDLE.aiInputSpread);
expectIncludes("S4 AI instruction 条件追加", sources.ai, NEEDLE.aiInstruction);
expectIncludes("S5 AI 指令含「不机械凑屏」", sources.ai, "禁止为满足板块数量凑屏");
expectIncludes("S6 AI 指令含防虚构", sources.ai, "不得虚构材质、参数、认证");
expectIncludes("S7 AI outputSchema 未被恒定改动", sources.ai, NEEDLE.schema);
expectIncludes("S8 middleware 兜底按板块顺序循环复用", sources.middleware, "selectedSections[index % selectedSections.length]");
expectIncludes("S9 middleware text 保留 filter(Boolean)", sources.middleware, ".filter(Boolean)");
expectIncludes("S10 middleware text 含条件板块行", sources.middleware, "【客户指定内容板块】");
expectIncludes("S11 板块入口按钮存在", read("src/features/detail/DetailView.jsx"), "选择内容板块");

// ---------------------------------------------------------------- 负向对照（护栏非虚设）
const brokenState = sources.state.replace(NEEDLE.payloadSpread, "selectedSections: sectionPayload || []");
push("N1 负向对照·payload 改恒定字段必判红", probe(brokenState, NEEDLE.payloadSpread) === false, "坏夹具应不含条件展开");
const brokenAi = sources.ai.replace(NEEDLE.aiInputSpread, "selectedSections: selectedSections || []");
push("N2 负向对照·AI 白名单改恒定字段必判红", probe(brokenAi, NEEDLE.aiInputSpread) === false, "坏夹具应不含条件展开");
const brokenSections = sources.sections.replace(NEEDLE.emptyGuard, "if (false) return undefined;");
push("N3 负向对照·删空选守卫必判红", probe(brokenSections, NEEDLE.emptyGuard) === false, "坏夹具应不含空选守卫");

// ---------------------------------------------------------------- 运行时断言（真实服务端函数，非 Mock）
const base = {
  count: 4,
  workflow: "taobao-detail",
  productName: "门禁测试商品",
  productFeature: "棉质",
  userInstruction: "",
  sellingPoints: [],
  copywriting: "need",
  richness: "standard",
  fontStyle: "clean",
  modelMode: "auto",
  modelPose: "auto",
  lang: "中文",
  ratio: "3:4",
  imageSize: "2K",
  model: "tt-image-2.6",
  analysisMode: "local",
  productImages: [],
  referenceImages: []
};
const pick = (id) => PRESET_SECTIONS.find((item) => item.id === id);
const promptsOf = (group) => JSON.stringify(group.prompts);

push("R1 serializeSelectedSections([]) === undefined", serializeSelectedSections([]) === undefined, "空选不得产生字段");
const chosen = serializeSelectedSections([
  pick("product-material"),
  pick("usage-scene"),
  createCustomSection("开箱体验")
]);
push("R2 order 按数组顺序派生", JSON.stringify(chosen.map((item) => item.order)) === "[1,2,3]", "order=1,2,3");
push("R3 自定义项 moduleId=custom", chosen[2].moduleId === "custom", "custom");

const emptyA = await buildDetailPromptGroup({ ...base }, [], {});
const emptyB = await buildDetailPromptGroup({ ...base, selectedSections: [] }, [], {});
push("R4 空选与空数组逐字节一致", promptsOf(emptyA) === promptsOf(emptyB), "prompts 正文比对");
push("R5 空选不出现板块行", emptyA.prompts.every((item) => !item.text.includes("客户指定内容板块")), "无板块行");
push("R6 空选屏数恒等于 count", emptyA.prompts.length === base.count, "count=4");

const withSections = await buildDetailPromptGroup({ ...base, selectedSections: chosen }, [], {});
push("R7 有选每屏含板块行", withSections.prompts.every((item) => item.text.includes("【客户指定内容板块】")), "每屏可见");
push("R8 首屏体现第 1 优先板块", withSections.prompts[0].text.includes("产品材质细节"), "顺序生效");
push("R9 自定义项进入真实提示词", withSections.prompts[2].text.includes("开箱体验"), "自定义生效");
push("R10 选板块后屏数不变", withSections.prompts.length === base.count, "不机械凑屏");

const reordered = serializeSelectedSections([
  pick("usage-scene"),
  pick("product-material"),
  createCustomSection("开箱体验")
]);
const withReorder = await buildDetailPromptGroup({ ...base, selectedSections: reordered }, [], {});
push("R11 换序后首屏方向改变", withReorder.prompts[0].title === "实际使用场景" && withReorder.prompts[0].title !== withSections.prompts[0].title, "顺序影响优先级");

// ---------------------------------------------------------------- 基线棘轮
const violations = checks.filter((item) => !item.ok).map((item) => item.name);
let baseline = [];
if (existsSync(BASELINE)) {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE, "utf8"));
    if (Array.isArray(parsed.items)) baseline = parsed.items;
  } catch {
    baseline = [];
  }
}
const beforeSet = new Set(baseline);
const currentSet = new Set(violations);
const added = violations.filter((name) => !beforeSet.has(name));
const stale = baseline.filter((name) => !currentSet.has(name));
const ok = added.length === 0 && stale.length === 0;

if (UPDATE) {
  if (!REASON) {
    console.log("--update 须带 --reason 写明刷新理由");
    process.exit(1);
  }
  writeFileSync(BASELINE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    reason: REASON,
    items: violations
  }, null, 2) + "\n");
  console.log("基线已刷新：" + violations.length + " 条存量记账");
  process.exit(0);
}

const report = {
  ok,
  total: checks.length,
  passed: checks.length - violations.length,
  added,
  stale,
  failureCount: added.length + stale.length,
  failures: checks.filter((item) => !item.ok),
  note: ok
    ? "全链路条件注入有效，空选与改造前逐字节一致"
    : "新增违规或基线陈旧：先修因，确有必要再跑 --update --reason"
};
console.log(AS_JSON ? JSON.stringify(report) : JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
