// V2 S1-a：一键详情 V2 规划链门禁（门禁先行，零业务代码）。
//
// 目的：在 S1-b 动核心分屏函数之前，先把「不许破坏」与「必须做到」变成机器可验的契约。
//   A 组 现行不变量：旧版功能 / 产品决策 / 数据边界 / 范围禁区（硬断言，当前全绿）；
//   B 组 Skill 真实进模型请求上下文：静态证据链 + fetch 探针捕获真实 textPayload（硬断言）；
//   C 组 S1-b 前瞻契约：当前尚不具备，按基线棘轮记为存量；S1-b 实现后违规消失会
//      触发 stale 判红，强制施工方 --update --reason 收窄基线，形成验收闭环。
//
// 口径照搬 detail-sections-chain-check：存量记账、新增判红、stale 判红、--update --reason。
// 额外加 frozenHashes：G-2 禁改词表与发布种子按字节哈希硬锁，不进棘轮、不许借刷基线绕过。
//
// fetch 探针只拦截 globalThis.fetch 并返回内存 Response，不发任何网络请求、
// 不接触任何真实 KEY（apiKey 传入的是固定占位串）；零子进程、零上游，进 --fast 快速子集。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createDetailAiPlan } from "../../server/detail-ai.js";
import { buildDetailPromptGroup } from "../../server/detail-middleware.js";
import {
  PRESET_SECTIONS,
  serializeSelectedSections
} from "../../src/features/detail/detail-sections.js";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "verify", "detail-v2-planning-chain-baseline.json");
const AS_JSON = process.argv.includes("--json");
const UPDATE = process.argv.includes("--update");
const REASON_INDEX = process.argv.indexOf("--reason");
const REASON = REASON_INDEX > -1 ? String(process.argv[REASON_INDEX + 1] || "").trim() : "";

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const bytes = (rel) => readFileSync(path.join(ROOT, rel));
const sha = (rel) => createHash("sha256").update(bytes(rel)).digest("hex");

const REL = {
  ai: "server/detail-ai.js",
  middleware: "server/detail-middleware.js",
  routes: "server/routes/detail.routes.js",
  state: "src/features/detail/detail-state.js",
  detailView: "src/features/detail/DetailView.jsx",
  sections: "src/features/detail/detail-sections.js",
  group: "src/features/detail/detail-group.js",
  skillWords: "prompts/server/detail-skills.js",
  seed: "seed/manifest.json"
};
const sources = Object.fromEntries(Object.entries(REL).map(([key, rel]) => [key, read(rel)]));
const seedText = JSON.stringify(JSON.parse(sources.seed));

const checks = [];
const push = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail: String(detail || "") });
// 所有探针自带 >= 0 守卫：锚点搬家会如实判红，不会静默变成假绿。
const probe = (source, needle) => source.indexOf(needle) >= 0;
const countOf = (source, needle) => source.split(needle).length - 1;
const lineOf = (source, needle) => {
  const at = source.indexOf(needle);
  if (at < 0) return null;
  const start = source.lastIndexOf("\n", at) + 1;
  const end = source.indexOf("\n", at);
  return source.slice(start, end < 0 ? source.length : end);
};
const expectIncludes = (name, source, needle) => push(name, probe(source, needle), "命中锚点：" + needle.slice(0, 48));
const expectAbsent = (name, source, needle) => push(name, !probe(source, needle), "禁用字样：" + needle);

// 负向对照与正向断言共用同一批锚点，避免「正向查 A 串、负向删 B 串」的假绿。
// NEEDLE_FILTER 取 17 槽位拼接的完整尾串（全仓仅 1 处），不用泛化的 .filter(Boolean)。
const NEEDLE_PAYLOAD = "...(sectionPayload ? { selectedSections: sectionPayload } : {})";
const NEEDLE_SKILL = "skillPack: compactSkillPack(input, v2Context)";
const NEEDLE_FILTER = "].filter(Boolean).join(\"\\n\");";
const NEEDLE_DEFAULT_PLANNING = "const planningActive = selectedSections === null;";
const NEEDLE_MIDDLEWARE_PLANNING = "const v2Planning = selectedSections === null;";
const NEEDLE_HERO = "? SCREEN_MODULES.hero";
const PLANNING_MARKER = "JINGYIN_DETAIL_V2_PLANNING_SKILL";
const stripPlanningSkill = (pack) => {
  if (!pack || typeof pack !== "object") return null;
  const copy = { ...pack };
  delete copy.planningSkill;
  return copy;
};

// ---------------------------------------------------------------- A 组 · 现行不变量
push("A0 八个证据源文件均非空（防文件被清空造成假绿）",
  Object.values(sources).every((text) => text.length > 500), "每份 > 500 字节");

expectIncludes("A1 商品图唯一必选拦截", sources.state, "请至少上传一张产品图");
expectIncludes("A2 屏数由 count 决定（clamp）", sources.middleware, "clamp(input.count");
expectIncludes("A3 屏数由 count 决定（Array.from）", sources.middleware, "Array.from({ length: count }");
expectIncludes("A4 17 槽位文本保留 filter(Boolean)", sources.middleware, NEEDLE_FILTER);
expectIncludes("A5 展示=生图（prompt.text 直送 /api/images）", sources.state, "form.set(\"prompt\", prompt.text)");
expectIncludes("A6 /api/images 保留 dispatchMode 字段", sources.state, "form.set(\"dispatchMode\"");
expectIncludes("A7 /api/images 保留 source=detail-main", sources.state, "form.set(\"source\", \"detail-main\")");
expectIncludes("A8 selectedSections 为会话态 useState", sources.state, "const [selectedSections, setSelectedSections] = useState([])");
expectIncludes("A9 分组持久化清洗函数存在（S1-c 护栏落点）", sources.group, "sanitizeDetailGroupsForStorage");

expectAbsent("A10 发布种子不含 A 域参数键", seedText, "detailSettings");
expectAbsent("A11 发布种子不含 V2 规划字段", seedText, "planningContext");
expectAbsent("A12 发布种子不含 selectedSections", seedText, "selectedSections");
expectAbsent("A13 发布种子不含 detailDefaults", seedText, "detailDefaults");

expectAbsent("A14 S1 不新增 quality-check 端点", sources.routes, "quality-check");
expectAbsent("A15 S1 不新增 rewrite-screen 端点", sources.routes, "rewrite-screen");
expectAbsent("A16 S1 不新增 replan 端点", sources.routes, "replan");
expectAbsent("A17 不新增叙事偏好必填设置", sources.detailView, "叙事偏好");
expectAbsent("A18 不新增视觉偏好必填设置", sources.detailView, "视觉偏好");

push("A19 唯一模型调用入口（routes 仅 1 处 createDetailAiPlan）",
  countOf(sources.routes, "createDetailAiPlan(") === 1, "实测 " + countOf(sources.routes, "createDetailAiPlan(") + " 处");
push("A20 唯一 postChatCompletion 调用（不新增第二套网关）",
  countOf(sources.ai, "postChatCompletion({") === 1, "实测 " + countOf(sources.ai, "postChatCompletion({") + " 处");

// ---------------------------------------------------------------- B 组 · Skill 进请求体
expectIncludes("B1 textPayload 含 skillPack", sources.ai, "skillPack: compactSkillPack(input, v2Context)");
expectIncludes("B2 user content 由 textPayload 序列化", sources.ai, "text: JSON.stringify(textPayload, null, 2)");
expectIncludes("B3 messages[1].content 由 buildDetailAnalysisContent 生成", sources.ai, "content: buildDetailAnalysisContent(input, files, includeImages)");
expectIncludes("B4 请求 body 由 buildDetailChatBody 生成", sources.ai, "body: buildDetailChatBody(input, files, mode.includeImages, mode.withJsonFormat)");

const BASE_INPUT = {
  count: 4,
  workflow: "taobao-detail",
  productName: "V2 门禁探针商品",
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
  analysisMode: "ai",
  productImages: [],
  referenceImages: []
};
const CHOSEN = serializeSelectedSections([PRESET_SECTIONS[0], PRESET_SECTIONS[1]]);

// 在内存中拦截 fetch，捕获「真正发给模型的那个 body」。占位 KEY，零网络、零上游。
async function captureBody(input) {
  const originalFetch = globalThis.fetch;
  let captured = null;
  globalThis.fetch = async (url, init) => {
    if (!captured) captured = JSON.parse(init.body);
    const reply = JSON.stringify({
      choices: [{ message: { content: "{\"product\":{},\"screens\":[]}" } }]
    });
    return new globalThis.Response(reply, { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    await createDetailAiPlan({
      input,
      files: [],
      apiKey: "v2-gate-placeholder-no-real-key",
      baseUrls: ["http://127.0.0.1:1"],
      timeoutMs: 3000
    });
  } catch {
    // 只关心捕获到的请求体；响应解析失败不影响请求体断言。
  } finally {
    globalThis.fetch = originalFetch;
  }
  return captured;
}
const parseUserPayload = (body) => {
  const text = body?.messages?.[1]?.content?.[0]?.text;
  if (typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const bodyA = await captureBody({ ...BASE_INPUT });
const bodyB = await captureBody({ ...BASE_INPUT, selectedSections: CHOSEN });
const payloadA = parseUserPayload(bodyA);
const payloadB = parseUserPayload(bodyB);
// R1（owner A 裁决）：C1 改回默认 payloadA（无手工 V2 开关、沿用真实默认 v1），
// 断言制单 Skill 在真实默认空选请求里进入 skillPack。bodyV2 保留作附加对照，非唯一依据。
const bodyV2 = await captureBody({ ...BASE_INPUT, detailSkillVersion: "v2" });
const payloadV2 = parseUserPayload(bodyV2);

push("B5 真实捕获模型请求 body", Boolean(bodyA && bodyB), "fetch 探针");
push("B6 messages[1].content[0].text 可解析为 textPayload", Boolean(payloadA && payloadB), "JSON.parse");
push("B7 skillPack.modules 真实进入模型上下文", Boolean(payloadA?.skillPack?.modules), "modules 存在");
push("B8 instruction 含商品真实性防虚构约束",
  Array.isArray(payloadA?.instruction) && payloadA.instruction.some((line) => line.includes("不要凭空发明")), "防虚构句");
push("B9 空选时请求 input 不含 selectedSections",
  Boolean(payloadA?.input) && !Object.hasOwn(payloadA.input, "selectedSections"), "字段不存在而非空数组");
push("B10 outputSchema.screens 结构化契约存在", Boolean(payloadA?.outputSchema?.screens), "screens 定义");
push("B11 有选时 selectedSections 真进请求 input",
  Boolean(payloadB?.input?.selectedSections), "条件注入生效");
// R1（A 裁决）：默认空选也注入 planningSkill，故 A/B 的 skillPack 必然不同。
// 断言改为「剥离规划 Skill 后基础 Skill 一致 + 异 input + planningSkill 仅空选出现」，强度不降反升。
push("B12 代码级 A/B：板块注入改变 input 但不改基础 skillPack（规划 Skill 仅空选）",
  Boolean(payloadA && payloadB)
    && JSON.stringify(stripPlanningSkill(payloadA.skillPack)) === JSON.stringify(stripPlanningSkill(payloadB.skillPack))
    && JSON.stringify(payloadA.input) !== JSON.stringify(payloadB.input)
    && Object.hasOwn(payloadA.skillPack || {}, "planningSkill")
    && !Object.hasOwn(payloadB.skillPack || {}, "planningSkill"),
  "同基础 Skill / 异 input / planningSkill 仅空选");

// ---------------------------------------------------------------- 运行时：空选逐字节一致
const promptsOf = (group) => JSON.stringify(group.prompts);
push("B13 serializeSelectedSections([]) === undefined", serializeSelectedSections([]) === undefined, "空选不产生字段");
const EMPTY_INPUT = { ...BASE_INPUT, analysisMode: "local", productImages: [], referenceImages: [] };
const emptyA = await buildDetailPromptGroup({ ...EMPTY_INPUT }, [], {});
const emptyB = await buildDetailPromptGroup({ ...EMPTY_INPUT, selectedSections: [] }, [], {});
push("B14 空选与空数组 prompts 逐字节一致", promptsOf(emptyA) === promptsOf(emptyB), "真实服务端函数");
push("B15 空选屏数恒等于 count", emptyA.prompts.length === BASE_INPUT.count, "count=" + BASE_INPUT.count);
push("B16 空选不出现客户板块行",
  emptyA.prompts.every((item) => !item.text.includes("客户指定内容板块")), "无板块行");

// ---------------------------------------------------------------- C 组 · S1-b 前瞻契约（基线棘轮）
const responseLine = lineOf(sources.routes, "res.json({ ok: true, group");
// C1：断言默认 payloadA（无手工 V2 开关、真实默认 v1）里自建 Skill 真进 skillPack（marker+directives）。
const hasPlanningSkill = (payload) => Boolean(payload?.skillPack) && Object.values(payload.skillPack).some(
  (value) => value && typeof value === "object" && !Array.isArray(value)
    && Object.hasOwn(value, "marker") && value.marker === PLANNING_MARKER && Array.isArray(value.directives)
);
push("C1 自建规划 Skill 进入默认请求 skillPack（marker+directives，默认 payloadA）",
  hasPlanningSkill(payloadA)
    && countOf(sources.ai, NEEDLE_DEFAULT_PLANNING) >= 1
    && !probe(sources.ai, "Boolean(v2Context) && selectedSections === null"),
  "默认 v1 空选请求体断言 marker+directives；detail-ai planningActive 已解耦（两处口径一致）");
// C1b 附加对照：显式 V2 开关路径同样含 Skill（非唯一依据，仅证明两条路径一致）。
push("C1b 附加：显式 V2 开关请求体同样含规划 Skill（非唯一依据）",
  hasPlanningSkill(payloadV2), "附加对照，不作为 C1 唯一依据");
// C2 语义级：空选分支不再调用 buildScreenTitles，也不再出现 seedTitles 轮转派生标题。
// 禁止靠变量改名让锚点消失——对 v2Planning 真值与「规划分支源码切片」做语义断言（带 >=0 守卫）。
const planningFlagLine = lineOf(sources.middleware, NEEDLE_MIDDLEWARE_PLANNING);
const v2BranchStart = sources.middleware.indexOf("if (v2Planning) {");
const v2BranchEnd = v2BranchStart >= 0 ? sources.middleware.indexOf("} else {", v2BranchStart) : -1;
const v2Branch = v2BranchStart >= 0 && v2BranchEnd > v2BranchStart
  ? sources.middleware.slice(v2BranchStart, v2BranchEnd)
  : "";
push("C2 空选规划分支不回退固定轮转（语义级：v2Planning 仅判空选且分支不调 buildScreenTitles/seedTitles）",
  planningFlagLine !== null
    && !probe(planningFlagLine, "styleDecision")
    && v2Branch.length > 0
    && !probe(v2Branch, "buildScreenTitles(")
    && !probe(v2Branch, "seedTitles"),
  "v2Planning 门控无 styleDecision；规划分支切片无 buildScreenTitles/seedTitles");
push("C3 planning 为响应独立顶层字段（与 group 平级）",
  responseLine !== null && probe(responseLine, "planning"), "S0 §5.2 契约");
// C4/C5 判定函数：正向断言与负向对照共用同一逻辑，证明探针能区分好坏夹具。
const hasHeroRole = (roles) => Array.isArray(roles)
  && roles.some((role) => role && Number(role.index) === 0 && role.role === "hero");
const isHeroFirst = (group) => Boolean(group?.prompts?.[0]) && group.prompts[0].moduleKey === "hero";
// C4 运行时：默认请求体 outputSchema.planning.screenRoles 含 index:0 / role:hero（不再靠 schema 示例文本）。
const planningSchema = payloadA?.outputSchema?.planning;
const screenRoles = planningSchema?.screenRoles;
push("C4 运行时默认请求 outputSchema.planning.screenRoles 含 index:0/role:hero",
  hasHeroRole(screenRoles) && hasPlanningSkill(payloadA),
  "真实请求体断言；planningActive=true 时契约写入");
// C5 运行时：buildDetailPromptGroup 默认空选首屏 moduleKey 为 hero（真绑定，不靠 role 文本命中）。
push("C5 运行时默认空选首屏 moduleKey=hero（决策 #4 首屏默认核心任务）",
  isHeroFirst(emptyA) && probe(sources.middleware, NEEDLE_HERO),
  "真实函数输出首屏 moduleKey=" + (emptyA?.prompts?.[0]?.moduleKey ?? "缺失")
    + "；源码含 hero 确定性绑定锚点");

// ---------------------------------------------------------------- 负向对照（证明锚点非虚设）
push("N1 负向：payload 改恒定字段必被探针判红",
  probe(sources.state, NEEDLE_PAYLOAD) && !probe(sources.state.replace(NEEDLE_PAYLOAD, "selectedSections: sectionPayload || []"), NEEDLE_PAYLOAD),
  "坏夹具不含条件展开");
push("N2 负向：删 skillPack 注入必被探针判红",
  probe(sources.ai, NEEDLE_SKILL) && !probe(sources.ai.replace(NEEDLE_SKILL, "skillPack: null"), NEEDLE_SKILL),
  "坏夹具不含 Skill 注入");
push("N3 负向：删 17 槽位拼接必被探针判红",
  probe(sources.middleware, NEEDLE_FILTER) && !probe(sources.middleware.replace(NEEDLE_FILTER, ""), NEEDLE_FILTER),
  "坏夹具不含 17 槽位拼接");
const brokenPayload = { ...(payloadA || {}), skillPack: null };
push("N4 负向：请求体删掉 skillPack 必被 B7 检出",
  Boolean(payloadA?.skillPack?.modules) && !brokenPayload.skillPack?.modules,
  "运行时断言有效");
push("N5 负向：routes 多一次模型调用必被 A19 检出",
  countOf(sources.routes, "createDetailAiPlan(") === 1
    && countOf(sources.routes + "\nawait createDetailAiPlan({", "createDetailAiPlan(") === 2,
  "唯一调用断言有效");
// N6（R1 反向固化修正）：默认空选请求体应含 planningSkill marker（A 裁决后默认能力生效）；
// 负向对照 = 已选板块请求体不含 marker，证明仍是「仅空选注入」而非无条件注入。
push("N6 默认空选请求体含 planningSkill marker（删注入必判红，条件注入实证）",
  Boolean(payloadA?.skillPack) && JSON.stringify(payloadA.skillPack).includes(PLANNING_MARKER)
    && Boolean(payloadB?.skillPack) && !JSON.stringify(payloadB.skillPack).includes(PLANNING_MARKER),
  "默认注入 / 选板块不注入，双向条件实证");
// R1 配套负向对照：每个改动锚点至少 1 条坏夹具判红。
push("N7 负向：删默认 planningSkill 注入必被 C1 判红",
  hasPlanningSkill(payloadA)
    && !hasPlanningSkill({ skillPack: stripPlanningSkill(payloadA?.skillPack) }),
  "坏夹具剥离 planningSkill 后 marker 消失");
push("N8 负向：给 v2Planning 恢复 styleDecision 门控必被 C2 判红",
  planningFlagLine !== null && !probe(planningFlagLine, "styleDecision")
    && probe("const v2Planning = Boolean(styleDecision) && selectedSections === null;", "styleDecision"),
  "坏夹具门控含 styleDecision，判定逻辑可区分");
push("N8b 负向：给 planningActive 恢复 v2Context 门控必被 C1 判红",
  countOf(sources.ai, NEEDLE_DEFAULT_PLANNING) >= 1
    && !probe(sources.ai, "Boolean(v2Context) && selectedSections === null")
    && probe("const planningActive = Boolean(v2Context) && selectedSections === null;", "Boolean(v2Context)"),
  "坏夹具 planningActive 含 v2Context 门控，判定逻辑可区分");
push("N9 负向：删 planning.screenRoles 或改非 hero 必被 C4 判红",
  hasHeroRole(screenRoles)
    && !hasHeroRole([])
    && !hasHeroRole([{ index: 0, role: "conversionClose" }]),
  "坏夹具无 screenRoles / 非 hero 角色均判红");
push("N10 负向：首屏非 hero 必被 C5 判红",
  isHeroFirst(emptyA)
    && !isHeroFirst({ prompts: [{ moduleKey: "conversionClose" }] })
    && !isHeroFirst({ prompts: [] }),
  "坏夹具首屏 moduleKey 非 hero / 缺首屏均判红");

// ---------------------------------------------------------------- 冻结哈希（硬红线，不进棘轮）
const FROZEN = [
  { rel: REL.skillWords, label: "G-2 禁改词表" },
  { rel: REL.seed, label: "发布种子" }
];

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
  if (!expected) continue;
  if (sha(item.rel) !== expected) frozenViolations.push(item.label + " " + item.rel + " 字节哈希变化");
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
    console.log("冻结文件已变化，拒绝借基线刷新绕过 G-2 / 发布种子红线：" + frozenViolations.join("；"));
    process.exit(1);
  }
  for (const item of FROZEN) frozenHashes[item.rel] = sha(item.rel);
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
    ? "现行不变量与 Skill 请求体实证全绿；C 组前瞻契约按基线记账，待 S1-b 收窄"
    : "新增违规 / 基线陈旧 / 冻结文件被改：先修因，确有必要再跑 --update --reason"
};
console.log(AS_JSON ? JSON.stringify(report) : JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
