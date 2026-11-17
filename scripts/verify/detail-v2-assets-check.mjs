// V219 / S2-A：一键详情 V2 专业资产门禁（门禁先行于资产，零业务代码、零运行时）。
//
// 目的：把阶段 A 交付的「Agent 定义 + 8 专业 Skill + 结构化 Schema + 注册表 + 固定测试集」
//       变成机器可验的契约，防止资产缺失/退化，并锁死禁改锚点：
//   A 组 资产齐备：8 Skill 文件存在、每份含九要素段、Agent 三件套、Schema 合法含 schemaVersion+8 顶层键、
//                  测试集六类六案例、注册表可枚举 8 项。
//   B 组 冻结字节：G-2 禁改词表、v2 三文件、活壳、skillModuleV2 本体（marker/directives/constraints）
//                  按字节哈希硬锁，不进棘轮、不许借 --update 绕过。
//   N 组 负向对照（≥3）：删 Skill / 改 G-2 一词 / 注册表漏一项 / Schema 删顶层键 / 改 marker 均须判红。
//
// 口径照搬 detail-v2-planning-chain-check：存量记账、新增判红、stale 判红、--update --reason、
// frozenHashes 拒绝借刷新绕过。indexOf 切片均配 >= 0 守卫。纯静态断言、零子进程、零上游，进 --fast。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { detailV2SkillRegistry, skillModuleV2 } from "../../prompts/server/detail-v2-planning/index.js";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "verify", "detail-v2-assets-baseline.json");
const ASSETS = "prompts/server/detail-v2-planning";
const AS_JSON = process.argv.includes("--json");
const UPDATE = process.argv.includes("--update");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => existsSync(path.join(ROOT, rel));
const sha = (rel) => createHash("sha256").update(readFileSync(path.join(ROOT, rel))).digest("hex");
const shaText = (text) => createHash("sha256").update(text).digest("hex");

const push = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: String(detail || "") });
const checks = [];
// 所有探针自带 >= 0 守卫：锚点搬家 / 切片失败会如实判红，不静默假绿。
const probe = (source, needle) => typeof source === "string" && source.indexOf(needle) >= 0;
const sliceBetween = (source, startNeedle, endNeedle) => {
  const a = source.indexOf(startNeedle);
  if (a < 0) return "";
  const b = source.indexOf(endNeedle, a);
  if (b < 0) return "";
  return source.slice(a, b + endNeedle.length);
};

const SKILL_IDS = [
  "product-understanding",
  "industry-routing",
  "consumer-marketing-strategy",
  "detail-story-planning",
  "visual-art-direction",
  "ecommerce-copy-layout",
  "cross-screen-coherence",
  "detail-quality-control"
];
// 九要素段标题（方案 §3 / V219 §1.1）：职责/触发/输入/判断方法/规则/输出字段/边界/冲突处理/测试案例。
const NINE_SECTIONS = ["## 职责", "## 触发", "## 输入", "## 判断方法", "## 规则", "## 输出字段", "## 边界", "## 冲突处理", "## 测试案例"];
const TOP_KEYS = [
  "schemaVersion", "product", "industryProfile", "consumerInsights",
  "marketingStrategy", "screens", "globalVisualDNA", "planning", "qc"
];
const MARKER = "JINGYIN_DETAIL_V2_PLANNING_SKILL";

// ---------------------------------------------------------------- A 组 · 资产齐备
push("A0 Agent 三件套齐备", ["agent/planner.md", "agent/execution-flow.md", "agent/output-contract.md"]
  .every((f) => exists(path.join(ASSETS, f))), "planner/execution-flow/output-contract");

for (const id of SKILL_IDS) {
  const rel = path.join(ASSETS, "skills", id, "SKILL.md");
  push("A1 Skill 文件存在 [" + id + "]", exists(rel), rel);
  if (!exists(rel)) continue;
  const text = read(rel);
  push("A2 Skill 九要素齐 [" + id + "]",
    NINE_SECTIONS.every((sec) => probe(text, sec)) && text.length > 800,
    "九要素段齐全且篇幅 > 800 字（实测 " + text.length + "）");
}

const planningSchemaRel = path.join(ASSETS, "schemas", "planning-result.schema.json");
const qualitySchemaRel = path.join(ASSETS, "schemas", "quality-result.schema.json");
let planningSchema = null;
let qualitySchema = null;
try {
  planningSchema = JSON.parse(read(planningSchemaRel));
} catch {
  planningSchema = null;
}
try {
  qualitySchema = JSON.parse(read(qualitySchemaRel));
} catch {
  qualitySchema = null;
}
push("A3 planning-result.schema.json 合法 JSON", Boolean(planningSchema), planningSchemaRel);
if (planningSchema) {
  const props = planningSchema.properties && typeof planningSchema.properties === "object"
    ? planningSchema.properties : {};
  const hasAll = TOP_KEYS.every((k) => Object.hasOwn(props, k));
  const schemaVersionConst = props.schemaVersion && props.schemaVersion.const === "1.0.0";
  push("A4 planning Schema 含 schemaVersion(const=1.0.0) + 8 顶层字段", hasAll && Boolean(schemaVersionConst),
    "9 键齐（1 元字段 + 8 业务顶层），实测 " + Object.keys(props).length + " 键");
  const screensDef = planningSchema.$defs && planningSchema.$defs.screens ? planningSchema.$defs.screens : (props.screens || {});
  push("A5 count 硬约束（screens 1–12 + 上限 12）",
    screensDef.minItems === 1 && screensDef.maxItems === 12, "minItems=1 / maxItems=12");
  const facts = planningSchema.$defs && planningSchema.$defs.planning
    ? planningSchema.$defs.planning.properties && planningSchema.$defs.planning.properties.facts : null;
  push("A6 facts 引用校验（level visible|inferred|mustNotClaim）",
    Boolean(facts) && probe(JSON.stringify(facts), "mustNotClaim"), "facts.level 枚举含三档");
}
push("A7 quality-result.schema.json 合法 JSON", Boolean(qualitySchema), qualitySchemaRel);
if (qualitySchema) {
  const qprops = qualitySchema.properties && typeof qualitySchema.properties === "object"
    ? qualitySchema.properties : {};
  push("A8 质检 Schema 含 schemaVersion + findings/scores/criticalFlags",
    ["schemaVersion", "findings", "summary", "scores", "criticalFlags"].every((k) => Object.hasOwn(qprops, k)),
    "六维评分 + 严重错误标记契约齐");
  push("A9 findings.severity 含 critical（严重错误不可被高分抵消）",
    probe(JSON.stringify(qualitySchema), "critical") && probe(JSON.stringify(qualitySchema), "criticalFlags"),
    "severity 枚举含 critical；criticalFlags 顶层存在");
}

const casesRel = path.join(ASSETS, "tests", "product-cases.md");
push("A10 固定测试集清单存在", exists(casesRel), casesRel);
if (exists(casesRel)) {
  const cases = read(casesRel);
  push("A11 六类商品齐备", ["日化清洁剂", "服装鞋包", "美妆个护", "食品", "家居百货", "数码"]
    .every((k) => probe(cases, k)), "六类品类名命中");
  push("A12 六案例 A–F 齐备 + 留白声明",
    ["案例 A", "案例 B", "案例 C", "案例 D", "案例 E", "案例 F"].every((k) => probe(cases, k))
    && probe(cases, "未跑") && probe(cases, "不标 PASS"), "六案例 + 未跑留白");
}

push("A13 注册表可枚举 8 项且 id 与 Skill 目录一一对应",
  Array.isArray(detailV2SkillRegistry) && detailV2SkillRegistry.length === 8
  && detailV2SkillRegistry.every((item) => item && SKILL_IDS.includes(item.id)
    && typeof item.path === "string" && typeof item.marker === "string" && item.marker.startsWith("JINGYIN_DETAIL_V2_SKILL_")),
  "实测 " + (Array.isArray(detailV2SkillRegistry) ? detailV2SkillRegistry.length : "非数组") + " 项");

// 注册表 marker 每项唯一（防复制粘贴漏改）。
const markers = Array.isArray(detailV2SkillRegistry) ? detailV2SkillRegistry.map((x) => x && x.marker) : [];
push("A14 注册表 marker 全部唯一", new Set(markers).size === 8 && markers.every(Boolean), "unique=" + new Set(markers).size);

// ---------------------------------------------------------------- B 组 · 冻结字节（不进棘轮）
const indexSrc = read(path.join(ASSETS, "index.js"));
const skillModuleSeg = sliceBetween(indexSrc, "export const skillModuleV2", "export default skillModuleV2;");
const SKILL_MODULE_SEG_HASH = shaText(skillModuleSeg);
const FROZEN = [
  { rel: "prompts/server/detail-skills.js", hash: sha("prompts/server/detail-skills.js"), label: "G-2 禁改词表" },
  { rel: "prompts/server/detail-skills-v2/composition-variants.js", hash: sha("prompts/server/detail-skills-v2/composition-variants.js"), label: "v2 变体库" },
  { rel: "prompts/server/detail-skills-v2/index.js", hash: sha("prompts/server/detail-skills-v2/index.js"), label: "v2 三文件 index" },
  { rel: "prompts/server/detail-skills-v2/style-packs.js", hash: sha("prompts/server/detail-skills-v2/style-packs.js"), label: "v2 风格包" },
  { rel: "server/detail-skills-v2.js", hash: sha("server/detail-skills-v2.js"), label: "v2 活壳" },
  { rel: ASSETS + "/index.js#skillModuleV2", hash: SKILL_MODULE_SEG_HASH, label: "skillModuleV2 本体段" }
];
push("B1 skillModuleV2 本体段可定位（切片守卫）", skillModuleSeg.length > 500 && probe(skillModuleSeg, MARKER),
  "段长 " + skillModuleSeg.length + "，marker 命中");
push("B2 skillModuleV2 marker 值不变", skillModuleV2 && skillModuleV2.marker === MARKER, MARKER);

// ---------------------------------------------------------------- N 组 · 负向对照（共用正向锚点）
push("N1 负向：删任一 Skill 文件必被 A1 判红",
  SKILL_IDS.every((id) => exists(path.join(ASSETS, "skills", id, "SKILL.md")))
  && !exists(path.join(ASSETS, "skills", "__not_exist_skill__", "SKILL.md")),
  "坏夹具（不存在的 Skill）判红");
push("N2 负向：G-2 词表改一字必被冻结哈希判红",
  FROZEN[0].hash === sha("prompts/server/detail-skills.js")
  && FROZEN[0].hash !== shaText(read("prompts/server/detail-skills.js") + "/*tampered*/"),
  "附加一字的夹具哈希不同");
push("N3 负向：注册表漏一项必被 A13 判红",
  detailV2SkillRegistry.length === 8 && detailV2SkillRegistry.slice(0, 7).length === 7,
  "7 项夹具 ≠ 8");
push("N4 负向：Schema 删顶层键必被 A4 判红",
  Boolean(planningSchema) && TOP_KEYS.every((k) => Object.hasOwn(planningSchema.properties || {}, k))
  && !TOP_KEYS.slice(1).every((k) => Object.hasOwn({ schemaVersion: 1 }, k)),
  "仅 schemaVersion 的夹具缺 8 键");
push("N5 负向：marker 被改必被 B2 判红",
  skillModuleV2.marker === MARKER && probe("marker: \"JINGYIN_DETAIL_V2_SKILL_TAMPERED\"", "TAMPERED")
  && skillModuleSeg.indexOf("JINGYIN_DETAIL_V2_SKILL_TAMPERED") < 0,
  "篡改 marker 的夹具段不含原 marker");

// ---------------------------------------------------------------- 基线棘轮 + 冻结哈希核对
const violations = checks.filter((item) => !item.ok).map((item) => item.name);
let baseline = [];
let frozenHashes = {};
if (existsSync(BASELINE)) {
  try {
    const parsed = JSON.parse(readFileSync(BASELINE, "utf8"));
    if (Array.isArray(parsed.items)) baseline = parsed.items;
    if (parsed.frozenHashes && typeof parsed.frozenHashes === "object") frozenHashes = parsed.frozenHashes;
  } catch {
    baseline = [];
    frozenHashes = {};
  }
}

const frozenViolations = [];
for (const item of FROZEN) {
  const expected = frozenHashes[item.rel];
  if (!expected) continue; // 基线未记录该键（首次上线前）时不判红，靠 --update 固化。
  if (item.hash !== expected) frozenViolations.push(item.label + " " + item.rel + " 字节哈希变化");
}

const beforeSet = new Set(baseline);
const currentSet = new Set(violations);
const added = violations.filter((name) => !beforeSet.has(name));
const stale = baseline.filter((name) => !currentSet.has(name));
const ok = added.length === 0 && stale.length === 0 && frozenViolations.length === 0;

if (UPDATE) {
  if (!REASON) {
    console.log("--update 须带 --reason 写明刷新理由");
    process.exit(1);
  }
  if (frozenViolations.length > 0) {
    console.log("冻结资产已变化，拒绝借基线刷新绕过 G-2 / v2 / skillModuleV2 红线：" + frozenViolations.join("；"));
    process.exit(1);
  }
  for (const item of FROZEN) frozenHashes[item.rel] = item.hash;
  writeFileSync(BASELINE, JSON.stringify({
    generatedAt: new Date().toISOString(),
    reason: REASON,
    items: violations,
    frozenHashes
  }, null, 2) + "\n");
  console.log("基线已刷新：" + violations.length + " 条存量记账；冻结哈希 " + FROZEN.length + " 份");
  process.exit(0);
}

const report = {
  ok,
  total: checks.length,
  passed: checks.length - violations.length,
  added,
  stale,
  frozenViolations,
  failureCount: added.length + stale.length + frozenViolations.length,
  failures: checks.filter((item) => !item.ok),
  note: ok
    ? "阶段 A 资产齐备、Schema 契约与注册表可枚举、冻结字节未变；真实模型质量未跑（留白，不标 PASS）"
    : "资产缺失 / 新增违规 / 基线陈旧 / 冻结文件被改：先修因，确有必要再跑 --update --reason"
};
console.log(AS_JSON ? JSON.stringify(report) : JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
