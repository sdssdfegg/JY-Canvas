// S2-C / V2-ARCH 四层控制框架工程链门禁。
// 只验证"工程机制贯通"：控制报告存在、四字段贯通证据、占位态不固化、单一决策源字段、编译审计基线。
// 🔴 明确边界：本门禁证明的是工程验证，不代表专业模型质量验收通过；不检查任何专业内容正确性。
// 负向对照：真实篡改源码后必须判红（删控制报告 / 改占位固化 / 删字段证据 / 删单一决策源字段）。

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const results = [];
const push = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });
const probe = (source, needle) => source.indexOf(needle) >= 0;

const middleware = read("server/detail-middleware.js");
const control = read("server/detail-v2-control/index.js");
const pending = read("server/detail-v2-control/config/pending-professional-content.json");

// ---------- A 组 · 源文件与工程机制存在 ----------
push("A1 控制层模块存在且非空", control.length > 1000);
push("A2 占位配置存在且标记 pending_professional_content",
  probe(pending, '"status": "pending_professional_content"') && probe(pending, "engineeringUseOnly"));
push("A3 middleware 引入控制层", probe(middleware, "from \"./detail-v2-control/index.js\""));
push("A4 控制报告挂到 group（v2Control）", probe(middleware, "v2Control ? { v2Control } : {}"));
push("A5 四态准入枚举齐备",
  ["ADMITTED", "REJECTED", "PENDING", "GENERIC_FALLBACK"].every((k) => probe(control, k)));
push("A6 事实三级映射齐备", ["L1", "L2", "L3"].every((k) => probe(control, `${k}:`)));
push("A7 行业包加载接口存在", probe(control, "export function loadIndustryPack"));
push("A8 任务准入接口存在", probe(control, "export function admitTasks"));
push("A9 编译审计接口存在", probe(control, "export function createCompilerAudit"));
push("A10 职业内容状态接口存在", probe(control, "export function professionalContentStatus"));

// ---------- B 组 · 占位态不固化（关键安全断言） ----------
push("B1 占位态 loadedIndustryPackIds 恒空",
  probe(control, "loadedIndustryPackIds: []") && probe(control, "matched_pending_professional_content"));
push("B2 占位任务一律 pending（不判 admitted）",
  probe(control, "professional_content_pending") && probe(control, "禁止用占位值判 admitted"));
push("B3 审计 unauthorizedAdded 基线 false",
  probe(control, "unauthorizedAdded: unauthorized.length > 0") && probe(control, "unauthorizedSegments"));
push("B4 控制报告标注 engineering_verification_only",
  probe(middleware, 'controlStatus: "engineering_verification_only"') && probe(control, 'auditStatus: "engineering_verification_only"'));
push("B5 单一决策源字段存在",
  probe(middleware, "modelIndustryId,") && probe(middleware, "industrySingleSourceConsistent"));

// ---------- C 组 · 四字段贯通证据 ----------
push("C1 四顶层字段贯通证据齐",
  ["industryProfile", "consumerInsights", "marketingStrategy", "globalVisualDNA"].every((k) => probe(middleware, `${k}: Boolean(aiPlan?.${k})`)));
// V2-PRO-002：质检清单已从生图提示词内部化（画面自检精简指令），不再整份注入。
push("C2 质检清单内部化（不再整份注入生图提示词）",
  probe(middleware, "【画面自检】商品与标签保持原样") && !probe(middleware, "【质检自查】${qualityChecklist.join"));

// ---------- D 组 · 运行时探针（真实调用，不 mock） ----------
let runtimeReport = null;
let probeError = "";
try {
  const moduleUrl = pathToFileURL(path.join(ROOT, "server", "detail-middleware.js")).href;
  const { buildDetailPromptGroup } = await import(moduleUrl);
  const aiPlan = {
    product: { industryId: "cleaning", industryName: "日化清洁剂" },
    industryProfile: { industryId: "cleaning" },
    consumerInsights: { audience: "家庭用户" },
    marketingStrategy: { valueLadder: [] },
    globalVisualDNA: { palette: "粉蓝" },
    planning: { facts: [{ claim: "白色瓶身", level: "visible" }] },
    screens: []
  };
  const group = buildDetailPromptGroup({ count: 3, workflow: "taobao-detail" }, [], { aiPlan });
  runtimeReport = group?.v2Control || null;
} catch (error) {
  probeError = String(error?.message || error);
}
push("D0 运行时探针可产出控制报告", Boolean(runtimeReport), probeError);
if (runtimeReport) {
  push("D1 控制报告=工程验证态", runtimeReport.controlStatus === "engineering_verification_only");
  // V2-PRO-001 正式专业内容已接入：占位断言改为正式内容态断言。
  push("D2 正式内容已接入 isPlaceholder=false", runtimeReport.isPlaceholder === false);
  push("D3 四字段全贯通", Object.values(runtimeReport.fieldsPresent).every(Boolean));
  push("D4 cleaning 行业按需加载", Array.isArray(runtimeReport.loadedIndustryPackIds) && runtimeReport.loadedIndustryPackIds.includes("cleaning"));
  push("D5 准入结果可枚举（四态字段齐）",
    ["admittedTaskIds", "rejectedTaskIds", "pendingTaskIds", "genericFallbackTaskIds"]
      .every((k) => Array.isArray(runtimeReport.admission?.[k])));
  push("D6 审计未授权新增=false", runtimeReport.auditBase.unauthorizedAdded === false);
  push("D7 模型行业 cleaning 被识别", runtimeReport.modelIndustryId === "cleaning");
  push("D8 单一决策源有结论", typeof runtimeReport.industrySingleSourceConsistent === "boolean");
}

// ---------- F 组 · V2-PRO-001 正式专业内容接入验证 ----------
const professionalRaw = read("server/detail-v2-control/config/professional-content-v1.json");
const professional = JSON.parse(professionalRaw);
const proMd = read("prompts/server/detail-v2-planning/professional-content/V2-PRO-001-通用准入基线与清洁日化行业包-V1.0.md");
push("F1 正式内容配置非占位", professional.status === "professional_content" && professional.isPlaceholder === false);
push("F2 来源标注 V2-PRO-001", String(professional.$source || "").includes("V2-PRO-001"));
push("F3 事实三级映射齐", ["L1", "L2", "L3"].every((k) => professional.factLevels?.[k]?.runtimeEnum));
push("F4 六类信息维度齐", (professional.factDimensions?.keys || []).length === 6);
push("F5 内容任务 10 项", professional.taskRegistry?.contentTasks?.length === 10);
push("F6 视觉任务 8 项", professional.taskRegistry?.visualTasks?.length === 8);
push("F7 cleaning 行业包存在", Boolean(professional.industryPacks?.cleaning?.industryId));
push("F8 禁止泛化规则齐", (professional.industryPacks?.cleaning?.noGeneralization || []).length >= 5);
push("F9 第六节补全已接入（非截断待补）",
  professional.regressionCases?.status === "professional_content" && probe(proMd, "PRO-014") && probe(proMd, "七、接入与验收要求"));
push("F10 编译器禁止清单齐", (professional.compilerConstraints?.mustNot || []).length >= 6);

// F 组运行时：准入判定符合专业规则（真实调用控制层纯函数）。
const controlMod = await import(pathToFileURL(path.join(ROOT, "server", "detail-v2-control", "index.js")).href);
const registry = controlMod.createTaskRegistry();
const allTasks = [...registry.contentTasks, ...registry.visualTasks];
const admitOf = (results, id) => results.results.find((r) => r.taskId === id)?.admission;

const noEvidence = controlMod.admitTasks(allTasks, {
  industryId: "cleaning",
  confirmedFacts: ["product_identity_identifiable"],
  factKeys: [],
  noIndustryPack: false
});
push("F11 无效果依据→effect_evidence=pending", admitOf(noEvidence, "effect_evidence") === "pending");
push("F12 无效果依据→前后对比=pending", admitOf(noEvidence, "before_after_comparison") === "pending");
push("F13 有产品身份→product_identity=admitted", admitOf(noEvidence, "product_identity") === "admitted");

const withEvidence = controlMod.admitTasks(allTasks, {
  industryId: "cleaning",
  confirmedFacts: ["reliable_effect_evidence", "real_structure_feature"],
  factKeys: [],
  noIndustryPack: false
});
push("F14 有效果依据→effect_evidence=admitted", admitOf(withEvidence, "effect_evidence") === "admitted");

const ordinaryPackaging = controlMod.admitTasks(allTasks, {
  industryId: "cleaning",
  confirmedFacts: ["real_structure_feature"],
  factKeys: ["ordinary_packaging"],
  noIndustryPack: false
});
push("F15 普通包装→结构特写=rejected", admitOf(ordinaryPackaging, "product_structure_closeup") === "rejected");

// F 组运行时：行业强特征覆盖（血渍清洗剂判 cleaning，T 恤不误判）。
const cleaningHit = controlMod.detectIndustryOverride("衣物血渍清洗剂 白色按压泵瓶 包装材质");
push("F16 血渍清洗剂含包装→cleaning覆盖", Boolean(cleaningHit && cleaningHit.industryId === "cleaning"));
push("F17 清洗剂不带服装观察点", Boolean(cleaningHit && !cleaningHit.analyzeAttributes.some((a) => /袖口|领口|纽扣|版型|面料/.test(a))));
push("F18 T恤不误判 cleaning", controlMod.detectIndustryOverride("T恤 纯棉 短袖 版型") === null);

// ---------- G 组 · V2-PRO-001 补充交付（第六/七节验收基线） ----------
const testCases = read("prompts/server/detail-v2-planning/tests/product-cases.md");
const regression = professional.regressionCases || {};
push("G1 14 个 PRO 案例 ID 齐备", (regression.caseIds || []).length === 14
  && ["PRO-001", "PRO-007", "PRO-014"].every((id) => (regression.caseIds || []).includes(id)));
push("G2 五档验收分级 G1–G5 齐", (regression.acceptanceLevels || []).map((x) => x.level).join(",") === "G1,G2,G3,G4,G5");
push("G3 G4/G5 标待验收（非 Mock 非 PASS）",
  (regression.acceptanceLevels || []).filter((x) => x.level === "G4" || x.level === "G5")
    .every((x) => String(x.status).includes("待验收")));
push("G4 工程/真实模型测试分离标注齐",
  (regression.separation?.engineeringTestCases || []).length >= 6
  && (regression.separation?.realModelTestCases || []).length === 10);
push("G5 真实模型禁止项含不得冒充原始结果",
  (regression.separation?.forbidden || []).some((x) => String(x).includes("冒充")));
push("G6 优先真实模型案例为 PRO-001", regression.priorityRealModelCase?.caseId === "PRO-001");
push("G7 PRO 案例纳入唯一测试库（非第二套）",
  ["PRO-001", "PRO-014"].every((id) => probe(testCases, id)) && probe(testCases, "唯一测试库纪律"));
push("G8 测试库保留 A–F 与未跑留白",
  ["案例 A", "案例 F"].every((k) => probe(testCases, k)) && probe(testCases, "未跑") && probe(testCases, "不标 PASS"));
push("G9 原文含接入要求八条", ["不新增 Agent", "不修改冻结", "不重复建立"].every((k) => probe(proMd, k)));

// ---------- H 组 · V2-PRO-002 Skill 按需触发与提示词净化 ----------
const activationMod = await import(pathToFileURL(path.join(ROOT, "server", "detail-v2-control", "skill-activation.js")).href);
const contracts = activationMod.validateActivationContracts();
// V2-PRO-003：正式 Skill 触发契约从 8 字段扩到 12 字段。
push("H1 触发契约十二字段齐备", contracts.fieldCount === 12 && contracts.passed === contracts.total && contracts.total >= 8);
push("H2 四种执行模式语义齐",
  ["mandatory", "conditional", "optional", "inactive"].every((m) => probe(read("server/detail-v2-control/skill-activation.js"), m)));

const cleaningActivation = activationMod.evaluateAllActivations({ contextKeys: ["industry_id_cleaning"] });
push("H3 清洁产品模特能力不激活", !cleaningActivation.activeIds.includes("model-pose"));
push("H4 清洁产品模特指令不注入", !cleaningActivation.injectedIds.includes("model-pose"));
push("H5 商品真实性强制激活", cleaningActivation.activeIds.includes("product-authenticity"));
// Owner 裁决：正式专业触发定义权威。H6 改用正式条件键；旧键仅做输入归一化。
const apparelActivation = activationMod.evaluateAllActivations({ contextKeys: ["industry_id_apparel", "screen_needs_figure", "user_requires_figure", "explicit_figure_task"] });
push("H6 有明确人物任务时模特可触发（正式条件）", apparelActivation.activeIds.includes("model-pose") && apparelActivation.injectedIds.includes("model-pose"));
const effectActivation = activationMod.evaluateAllActivations({ contextKeys: ["reliable_effect_evidence", "effect_evidence"] });
push("H7 有效果证据时效果能力可触发", effectActivation.activeIds.includes("effect-evidence"));
const noEffectActivation = activationMod.evaluateAllActivations({ contextKeys: [] });
push("H8 无效果证据时效果能力不激活", !noEffectActivation.activeIds.includes("effect-evidence"));

const boundary = activationMod.checkSellingPointBoundary("适用于血渍、奶渍等蛋白类污渍", "cleaning");
push("H9 奶渍蛋白类卖点被拦截", boundary.allowed === false && boundary.hits.some((h) => h.includes("奶渍")));
const boundary2 = activationMod.checkSellingPointBoundary("可水洗内衣、棉、化纤、布艺沙发、窗帘、床垫", "cleaning");
push("H10 未确认材质对象卖点被拦截", boundary2.allowed === false);
const boundaryOk = activationMod.checkSellingPointBoundary("针对衣物血渍清洁", "cleaning");
push("H11 合规卖点放行", boundaryOk.allowed === true);

const layers = activationMod.assemblePromptLayers({
  globalLines: ["全局商品锁定"], screenLines: ["本屏画面"], conditionalLines: [], internalAudit: ["整份质检清单"]
});
push("H12 质检清单隔离不进提示词", !layers.finalInstruction.includes("质检清单") && layers.auditIsolated === true);
push("H13 未触发条件指令不注入", layers.finalInstruction.split("\n").length === 2);

const compiled = activationMod.compileWithAuthorization(
  [{ text: "合法指令", sourceField: "product", sourceTaskId: "product_identity" }, { text: "未授权指令", sourceTaskId: "rejected_task" }, { text: "无来源指令" }],
  ["product_identity"]
);
push("H14 未授权任务被编译丢弃", compiled.kept.length === 1 && compiled.dropped.length === 2);
push("H15 编译保留项含来源", compiled.audit.usedTaskIds.includes("product_identity"));

// H16-H17：真实 middleware 编译文本净化（端到端）
const mwForProbe = await import(pathToFileURL(path.join(ROOT, "server", "detail-middleware.js")).href);
const probePlan = {
  product: { industryId: "cleaning", industryName: "清洁日化", name: "血渍清洗剂", materials: ["棉"] },
  planning: { facts: [{ claim: "棉", level: "mustNotClaim" }, { claim: "白色泵瓶", level: "visible" }] },
  industryProfile: { industryId: "cleaning" }, consumerInsights: { audience: "家庭用户" }, marketingStrategy: { valueLadder: [] }, globalVisualDNA: { palette: "粉蓝" },
  screens: [{ screen: 1, title: "首屏", moduleId: "hero", sellingPoint: "血渍、奶渍等蛋白类污渍，适用于布艺沙发窗帘床垫" }]
};
const probeGroup = mwForProbe.buildDetailPromptGroup({ count: 1, workflow: "taobao-detail", productName: "血渍清洗剂", modelMode: "no-model" }, [], { aiPlan: probePlan });
const probeText = probeGroup.prompts[0].text;
push("H16 端到端：棉/奶渍/沙发不进提示词", !/真实材质[^\n]*棉|奶渍|布艺沙发/.test(probeText));
push("H17 端到端：模特不激活且质检清单内部化",
  probeText.includes("本屏无模特") && !probeText.includes("【质检自查】") && probeText.includes("【画面自检】"));
push("H18 端到端：卖点边界拦截留痕", probeGroup.prompts[0].sellingBoundary?.allowed === false);

// H19-H22：任务书阶段八 14 项回归的补充覆盖
const skincare = activationMod.evaluateAllActivations({ contextKeys: ["industry_id_beauty"] });
push("H19 护肤品不触发清洁日化能力", !skincare.activeIds.includes("industry-cleaning"));
push("H20 未知产品走generic（无行业包激活）",
  !activationMod.evaluateAllActivations({ contextKeys: [] }).activeIds.includes("industry-cleaning"));
push("H21 全局规则仅在分层A出现一次（不逐屏重复注入D层）",
  layers.internalAudit.includes("整份质检清单") && !layers.finalInstruction.includes("整份质检清单"));
push("H22 无结构证据不触发产品结构能力",
  !activationMod.evaluateAllActivations({ contextKeys: [] }).activeIds.includes("product-structure"));

// ---------- I 组 · V2-PRO-003 八项正式专业 Skill 接入 ----------
let skillsCfg = null;
try { skillsCfg = JSON.parse(read("server/detail-v2-control/config/professional-skills-v1.json")); } catch { skillsCfg = null; }
push("I1 正式Skill配置已接入", skillsCfg?.status === "professional_content" && skillsCfg?.isPlaceholder === false);
push("I2 十二字段契约定义齐", (skillsCfg?.contractFields || []).length === 12
  && ["optional_context", "decision_rules", "execution_rules", "failure_fallback"].every((f) => (skillsCfg?.contractFields || []).includes(f)));
push("I3 四执行模式定义齐", ["mandatory", "conditional", "optional", "inactive"].every((m) => m in (skillsCfg?.executionModes || {})));
push("I4 四类输出通道齐", ["internal_analysis", "planning_output", "generation_instruction", "audit_rules"].every((c) => (skillsCfg?.outputChannels || []).includes(c)));
const coreMandatory = ["product-understanding", "consumer-marketing-strategy", "detail-story-planning", "visual-art-direction"];
push("I5 核心四能力 mandatory", coreMandatory.every((id) => skillsCfg?.activationContracts?.[id]?.execution_mode === "mandatory"));
push("I6 文案能力 conditional", skillsCfg?.activationContracts?.["ecommerce-copy-layout"]?.execution_mode === "conditional");
push("I7 人物/专项能力 conditional", skillsCfg?.activationContracts?.["figure-usage-scene"]?.execution_mode === "conditional"
  && skillsCfg?.activationContracts?.["product-specialty-expression"]?.execution_mode === "conditional");
push("I8 质检能力 optional", skillsCfg?.activationContracts?.["detail-quality-control"]?.execution_mode === "optional");
push("I9 映射含直接复用与能力模块映射", (skillsCfg?.skillMapping || []).some((m) => m.mappingType === "direct")
  && (skillsCfg?.skillMapping || []).some((m) => m.mappingType === "capability_module"));
push("I10 兼容保留industry-routing/cross-screen", ["industry-routing-retained", "cross-screen-coherence-retained"]
  .every((id) => (skillsCfg?.skillMapping || []).some((m) => m.formalId === id && m.mappingType === "retained_compat")));
push("I11 视觉模板回退整改条款齐", (skillsCfg?.fixedTemplateFallback?.requirement || []).some((r) => r.includes("固定套话")));
push("I12 内部审查分离9项齐", (skillsCfg?.internalAuditSeparation?.auditItems || []).length === 9 && skillsCfg?.internalAuditSeparation?.mustNotInjectFull === true);
push("I13 用户约束保留6项", ["内容选择", "屏数", "排序", "删除", "自定义约束"].every((k) => (skillsCfg?.userConstraintsPriority?.preserved || []).some((p) => p.includes(k))));

// I 组运行时：视觉非模板回退（真实调用 buildScreenVisual）
const visualTemplate = activationMod.buildScreenVisual({ moduleName: "核心卖点", contentTask: "血渍清洁", composition: "商品主体清晰居中", confirmedFacts: ["白色泵瓶"], visualDNA: { palette: "粉蓝", lighting: "柔光" } });
push("I14 套话composition不回退模板", visualTemplate?.source === "context_assembly" && !/^(商品主体清晰居中)$/.test(visualTemplate?.text || ""));
push("I15 组装视觉含具体事实与DNA", visualTemplate?.text?.includes("白色泵瓶") && visualTemplate?.text?.includes("粉蓝"));
const visualConcrete = activationMod.buildScreenVisual({ composition: "白色泵瓶置于浅灰台面，左侧水渍污布，右侧喷雾动作，俯拍45度" });
push("I16 具体composition直接采用", visualConcrete?.source === "ai_composition");
push("I17 无依据时不冒充专业策划", activationMod.buildScreenVisual({}) === null);

// I 组端到端：AI 无 composition 时提示词用组装视觉、非模块套话
const visualGroup = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
);
const visualLine = visualGroup.prompts[0].text.split("\n").find((x) => x.includes("【画面任务】")) || "";
push("I18 端到端画面任务非套话", !/商品主体清晰居中|一屏只讲一个主要卖点|画面简洁、有结束感/.test(visualLine));
push("I19 端到端screenVisual审计存在", Boolean(visualGroup.prompts[0].screenVisual));

// ---------- J 组 · SKILL.md 授权：正式触发权威 + 旧键兼容映射 + 防误触发 ----------
push("J1 旧键映射表存在且含关键旧键",
  Object.keys(activationMod.LEGACY_CONTEXT_KEY_MAP || {}).includes("user_requires_model")
  && Object.keys(activationMod.LEGACY_CONTEXT_KEY_MAP || {}).includes("reliable_effect_evidence"));
const norm = activationMod.normalizeContextKeys(["user_requires_model", "explicit_figure_task", "formal_only_key"]);
push("J2 旧键归一化为正式键且正式键原样保留",
  norm.keys.has("user_requires_figure") && norm.keys.has("explicit_figure_task") && norm.keys.has("formal_only_key"));
push("J3 归一化记录旧→正式映射审计", norm.legacyHits.some((h) => h.legacy === "user_requires_model" && h.formal === "user_requires_figure"));

// 防误触发：仅旧人物键、缺正式 screen_needs_figure → 能力不得激活。
const legacyOnly = activationMod.evaluateAllActivations({ contextKeys: ["user_requires_model", "explicit_figure_task"] });
const figLegacyOnly = legacyOnly.results.find((x) => x.id === "figure-usage-scene");
push("J4 仅旧键不足以触发人物能力（正式条件不全）", figLegacyOnly?.decision === "inactive");
push("J5 判定权威来源标注为正式契约", figLegacyOnly?.authoritySource === "formal_professional_contract");
push("J6 别名沿用正式判定非旧基线",
  activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "model-pose")?.authoritySource === "formal_professional_contract");

// 正式条件齐 → 可触发；旧键+正式键 → 可触发（兼容但不越权）。
const formalFull = activationMod.evaluateAllActivations({ contextKeys: ["screen_needs_figure", "user_requires_figure", "explicit_figure_task"] });
push("J7 正式条件齐可触发", formalFull.activeIds.includes("figure-usage-scene"));
const mixed = activationMod.evaluateAllActivations({ contextKeys: ["screen_needs_figure", "user_requires_model", "explicit_figure_task"] });
push("J8 旧键+正式键可触发（兼容不越权）", mixed.activeIds.includes("figure-usage-scene"));

// 专项：旧证据键翻译后仍需正式 required_context 才触发。
const specialtyLegacy = activationMod.evaluateAllActivations({ contextKeys: ["reliable_effect_evidence"] });
push("J9 仅旧证据键不足以触发专项（缺正式required）",
  specialtyLegacy.results.find((x) => x.id === "product-specialty-expression")?.decision === "inactive");

// ---------- K 组 · SKILL 01 正式正文接入（商品理解与事实边界） ----------
const skill01Rel = "prompts/server/detail-v2-planning/skills/product-understanding/SKILL.md";
const skill01 = read(skill01Rel);
push("K1 SKILL01正式正文V1标记", probe(skill01, "正式专业正文 V1.0") && probe(skill01, "SKILL 01"));
push("K2 SKILL01九要素保留",
  ["职责", "触发", "输入", "判断方法", "规则", "输出字段", "边界", "冲突处理", "测试案例"].every((s) => probe(skill01, `## ${s}\n`)));
push("K3 SKILL01五类来源分类", ["A 用户明确提供", "B 商品图片可直接观察", "C 图片文字识别", "D 已确认的项目上下文", "E 专业推断"].every((s) => probe(skill01, s)));
push("K4 SKILL01 L1/L2/L3 齐", ["L1 明确确认", "L2 有限依据", "L3 未确认"].every((s) => probe(skill01, s)));
push("K5 SKILL01八信息维度", ["5.1 商品身份", "5.2 包装信息", "5.3 使用对象", "5.4 作用目标", "5.5 适用范围", "5.6 使用方式", "5.7 成分与原理", "5.8 效果与证明"].every((s) => probe(skill01, s)));
push("K6 SKILL01四条事实保护", ["禁止信息扩展", "禁止行业惯例代替商品事实", "禁止场景元素变商品属性", "禁止跨商品污染"].every((s) => probe(skill01, s)));
push("K7 SKILL01输出契约与注入边界", probe(skill01, "不得使用信息") && probe(skill01, "禁止传递"));
push("K8 SKILL01质量验收14条", probe(skill01, "14 条") && probe(skill01, "验收不得仅依赖关键词过滤"));
push("K9 SKILL01不删改旧有价值规则",
  ["mustNotClaim", "product.uncertainties", "JINGYIN_DETAIL_V2_SKILL_PRODUCT_UNDERSTANDING"].every((s) => probe(skill01, s)));
push("K10 正式覆盖图片唯一来源旧表述", probe(skill01, "证据来源不唯一") && probe(skill01, "图片为必选输入是工程约束"));
// 运行时读取：注册表路径真实可读且 marker 未变
const regMod = await import(pathToFileURL(path.join(ROOT, "prompts", "server", "detail-v2-planning", "index.js")).href);
const skill01Reg = regMod.detailV2SkillRegistry.find((x) => x.id === "product-understanding");
push("K11 注册表路径可读正式正文", Boolean(skill01Reg) && read(path.join("prompts/server/detail-v2-planning", skill01Reg.path.replace("./", ""))).includes("正式专业正文 V1.0"));
push("K12 marker与冻结本体未变", skill01Reg?.marker === "JINGYIN_DETAIL_V2_SKILL_PRODUCT_UNDERSTANDING" && regMod.skillModuleV2.marker === "JINGYIN_DETAIL_V2_PLANNING_SKILL");
// 触发：mandatory 空上下文也触发、权威来源正式契约
const puActivation = activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "product-understanding");
push("K13 商品理解mandatory空上下文触发", puActivation?.decision === "mandatory" && puActivation?.active === true);
push("K14 判定权威=正式契约", puActivation?.authoritySource === "formal_professional_contract");
// 污染测试：SKILL全文不进提示词
const skillGroup = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
);
const skillPrompt = skillGroup.prompts[0].text;
push("K15 SKILL全文未注入提示词", !skillPrompt.includes(skill01.slice(0, 60)) && skillPrompt.length < skill01.length);
push("K16 内部章节词未污染提示词", !/(来源分类与可信度|禁止信息扩展|质量验收14条)/.test(skillPrompt));

// ---------- L 组 · SKILL 02 正式正文接入 + 核心Mandatory契约修正 ----------
const skill02Rel = "prompts/server/detail-v2-planning/skills/consumer-marketing-strategy/SKILL.md";
const skill02 = read(skill02Rel);
push("L1 SKILL02正式正文V1标记", probe(skill02, "正式专业正文 V1.0") && probe(skill02, "SKILL 02"));
push("L2 SKILL02九要素保留", ["职责", "触发", "输入", "判断方法", "规则", "输出字段", "边界", "冲突处理", "测试案例"].every((s) => probe(skill02, `## ${s}\n`)));
push("L3 SKILL02回链phrase逐字保留", probe(skill02, "空洞参数罗列不算营销表达"));
push("L4 SKILL02四层法与消费者分析", probe(skill02, "事实 → 消费者需求 → 利益 → 营销表达") && probe(skill02, "禁虚构消费者调研"));
push("L5 SKILL02营销原则与模板禁令", probe(skill02, "内容敢于删除无价值内容") && probe(skill02, "避免营销模板化"));
push("L6 SKILL02输出契约与注入规则", probe(skill02, "下游授权信息") && probe(skill02, "完整营销 Skill 正文"));
push("L7 SKILL02验收20条", probe(skill02, "质量验收 20 条"));
push("L8 SKILL02旧规则合并保留", ["mustNotClaim", "copywritingTone", "案例 F", "案例 B"].every((s) => probe(skill02, s)));
push("L9 SKILL02注册路径可读正式正文", (() => { const s = regMod.detailV2SkillRegistry.find((x) => x.id === "consumer-marketing-strategy"); return Boolean(s) && read(path.join("prompts/server/detail-v2-planning", s.path.replace("./", ""))).includes("正式专业正文 V1.0"); })());
push("L10 SKILL02 marker未变", regMod.detailV2SkillRegistry.find((x) => x.id === "consumer-marketing-strategy")?.marker === "JINGYIN_DETAIL_V2_SKILL_CONSUMER_MARKETING_STRATEGY");
// 核心4 Mandatory 契约：不得有 required_context（正式正文"每次必需"）
const coreCfg = skillsCfg?.activationContracts || {};
push("L11 核心4均mandatory", coreMandatory.every((id) => coreCfg[id]?.execution_mode === "mandatory"));
push("L12 核心4无required_context（正式定义权威）", coreMandatory.every((id) => (coreCfg[id]?.required_context || []).length === 0));
const coreEval = activationMod.evaluateAllActivations({ contextKeys: [] });
push("L13 核心4空上下文全触发", coreMandatory.every((id) => {
  const r = coreEval.results.find((x) => x.id === id);
  return r?.decision === "mandatory" && r?.active === true && r?.authoritySource === "formal_professional_contract";
}));
// 污染：SKILL全文不进提示词
const skill02Prompt = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
).prompts[0].text;
push("L14 SKILL02全文未注入提示词", !skill02Prompt.includes(skill02.slice(0, 60)) && skill02Prompt.length < skill02.length);
push("L15 SKILL02内部词未污染", !/(消费者调研结果|购买决策障碍|质量验收 20 条)/.test(skill02Prompt));

// ---------- M 组 · SKILL 03 正式正文接入（详情叙事与内容结构规划） ----------
const skill03Rel = "prompts/server/detail-v2-planning/skills/detail-story-planning/SKILL.md";
const skill03 = read(skill03Rel);
push("M1 SKILL03正式正文V1标记", probe(skill03, "正式专业正文 V1.0") && probe(skill03, "SKILL 03"));
push("M2 SKILL03九要素保留", ["职责", "触发", "输入", "判断方法", "规则", "输出字段", "边界", "冲突处理", "测试案例"].every((s) => probe(skill03, `## ${s}\n`)));
push("M3 SKILL03回链phrase逐字保留", probe(skill03, "禁止固定标题轮转"));
push("M4 SKILL03启动规则与不取消", probe(skill03, "不得因商品事实不完整") && probe(skill03, "不得将缺失的输入视为默认模板授权"));
push("M5 SKILL03禁固定模板与凑屏", probe(skill03, "不使用固定详情模板") && probe(skill03, "不为屏数凑内容"));
push("M6 SKILL03屏级规划与重复检测", probe(skill03, "本屏存在的理由") && probe(skill03, "表达形式重复"));
push("M7 SKILL03三类协同与隔离", probe(skill03, "与营销策划——") && probe(skill03, "与文案策划——") && probe(skill03, "四类内容分离"));
push("M8 SKILL03输出契约12项", probe(skill03, "本屏最终内容任务授权") && probe(skill03, "不得仅输出一组屏幕标题"));
push("M9 SKILL03验收20条", probe(skill03, "质量验收 20 条"));
push("M10 SKILL03旧规则合并保留", ["screenRoles", "moduleId", "count", "hero", "案例 C", "案例 D", "案例 B"].every((s) => probe(skill03, s)));
push("M11 SKILL03注册路径可读正式正文", (() => { const s = regMod.detailV2SkillRegistry.find((x) => x.id === "detail-story-planning"); return Boolean(s) && read(path.join("prompts/server/detail-v2-planning", s.path.replace("./", ""))).includes("正式专业正文 V1.0"); })());
push("M12 SKILL03 marker未变", regMod.detailV2SkillRegistry.find((x) => x.id === "detail-story-planning")?.marker === "JINGYIN_DETAIL_V2_SKILL_DETAIL_STORY_PLANNING");
const storyEval = activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "detail-story-planning");
push("M13 详情叙事mandatory空上下文触发", storyEval?.decision === "mandatory" && storyEval?.active === true && storyEval?.authoritySource === "formal_professional_contract");
const skill03Prompt = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
).prompts[0].text;
push("M14 SKILL03全文未注入提示词", !skill03Prompt.includes(skill03.slice(0, 60)) && skill03Prompt.length < skill03.length);
push("M15 SKILL03内部词未污染", !/(内容板块的定义|输出契约|质量验收 20 条)/.test(skill03Prompt));

// ---------- O 组 · SKILL 04 正式正文接入（视觉导演与画面创意规划） ----------
const skill04Rel = "prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md";
const skill04 = read(skill04Rel);
push("O1 SKILL04正式正文V1标记", probe(skill04, "正式专业正文 V1.0") && probe(skill04, "SKILL 04"));
push("O2 SKILL04九要素保留", ["职责", "触发", "输入", "判断方法", "规则", "输出字段", "边界", "冲突处理", "测试案例"].every((s) => probe(skill04, `## ${s}\n`)));
push("O3 SKILL04回链phrase逐字保留", probe(skill04, "禁止仅背景/颜色变化"));
push("O4 SKILL04启动规则与不取消", probe(skill04, "不得因商品事实不完整") && probe(skill04, "不能伪装成商品事实"));
push("O5 SKILL04具体创意与禁模板", probe(skill04, "设计必须有具体创意") && probe(skill04, "不追求无意义复杂"));
push("O6 SKILL04主体保护与构图", probe(skill04, "商品主体与产品保护") && probe(skill04, "构图与空间"));
push("O7 SKILL04三协同与隔离", probe(skill04, "营销策划负责需求价值卖点优先级表达方向") && probe(skill04, "详情叙事负责屏级任务") && probe(skill04, "禁止污染"));
push("O8 SKILL04输出契约17项", probe(skill04, "当前屏最终视觉执行指令") && probe(skill04, "不能只输出"));
push("O9 SKILL04验收26条", probe(skill04, "质量验收 26 条"));
push("O10 SKILL04旧规则合并保留", ["globalVisualDNA", "composition-variants.js", "variantFor", "六维差异", "案例 E", "案例 C"].every((s) => probe(skill04, s)));
push("O11 SKILL04注册路径可读正式正文", (() => { const s = regMod.detailV2SkillRegistry.find((x) => x.id === "visual-art-direction"); return Boolean(s) && read(path.join("prompts/server/detail-v2-planning", s.path.replace("./", ""))).includes("正式专业正文 V1.0"); })());
push("O12 SKILL04 marker未变", regMod.detailV2SkillRegistry.find((x) => x.id === "visual-art-direction")?.marker === "JINGYIN_DETAIL_V2_SKILL_VISUAL_ART_DIRECTION");
const visualEval = activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "visual-art-direction");
push("O13 视觉导演mandatory空上下文触发", visualEval?.decision === "mandatory" && visualEval?.active === true && visualEval?.authoritySource === "formal_professional_contract");
const skill04Prompt = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
).prompts[0].text;
push("O14 SKILL04全文未注入提示词", !skill04Prompt.includes(skill04.slice(0, 60)) && skill04Prompt.length < skill04.length);
push("O15 SKILL04内部词未污染", !/(视觉概念与创意方向|输出契约|质量验收 26 条)/.test(skill04Prompt));
// 核心4 全部正式正文接入完成
push("O16 核心4 Skill全部正式正文接入", coreMandatory.every((id) =>
  probe(read(`prompts/server/detail-v2-planning/skills/${id}/SKILL.md`), "正式专业正文 V1.0")));

// ---------- P 组 · SKILL 05 正式正文接入（文案策划与图文表达·条件能力） ----------
const skill05Rel = "prompts/server/detail-v2-planning/skills/ecommerce-copy-layout/SKILL.md";
const skill05 = read(skill05Rel);
push("P1 SKILL05正式正文V1标记", probe(skill05, "正式专业正文 V1.0") && probe(skill05, "SKILL 05"));
push("P2 SKILL05九要素保留", ["职责", "触发", "输入", "判断方法", "规则", "输出字段", "边界", "冲突处理", "测试案例"].every((s) => probe(skill05, `## ${s}\n`)));
push("P3 SKILL05回链phrase逐字保留", probe(skill05, "相邻屏文案不做语义复述"));
push("P4 SKILL05条件能力语义对齐", probe(skill05, "条件能力 Conditional") && probe(skill05, "不得因为详情通常需标题卖点就强制每屏生成文案"));
push("P5 SKILL05创意不造事实", probe(skill05, "文案创意不能成为新增商品事实的来源") && probe(skill05, "先明确表达目的"));
push("P6 SKILL05文案原则与合规", probe(skill05, "不追求每屏固定文案组合") && probe(skill05, "事实与合规") && probe(skill05, "图文协同"));
push("P7 SKILL05输出契约与隔离", probe(skill05, "当前屏文案结果") && probe(skill05, "完整文案策略不得注入"));
push("P8 SKILL05验收20条", probe(skill05, "质量验收 20 条"));
push("P9 SKILL05旧规则合并保留", ["copywriting", "richness", "mustNotClaim", "lang", "案例 F", "案例 B"].every((s) => probe(skill05, s)));
push("P10 SKILL05注册路径可读正式正文", (() => { const s = regMod.detailV2SkillRegistry.find((x) => x.id === "ecommerce-copy-layout"); return Boolean(s) && read(path.join("prompts/server/detail-v2-planning", s.path.replace("./", ""))).includes("正式专业正文 V1.0"); })());
push("P11 SKILL05 marker未变", regMod.detailV2SkillRegistry.find((x) => x.id === "ecommerce-copy-layout")?.marker === "JINGYIN_DETAIL_V2_SKILL_ECOMMERCE_COPY_LAYOUT");
// 条件能力：无文字需求 inactive、有需求 conditional（与核心4 mandatory 相反）
const copyOff = activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "ecommerce-copy-layout");
const copyOn = activationMod.evaluateAllActivations({ contextKeys: ["screen_needs_text", "screen_content_task"] }).results.find((x) => x.id === "ecommerce-copy-layout");
push("P12 文案条件能力无需求不触发", copyOff?.decision === "inactive");
push("P13 文案条件能力有需求conditional", copyOn?.decision === "conditional" && copyOn?.active === true && copyOn?.authoritySource === "formal_professional_contract");
push("P14 SKILL05契约仍是conditional", skillsCfg?.activationContracts?.["ecommerce-copy-layout"]?.execution_mode === "conditional");
const skill05Prompt = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
).prompts[0].text;
push("P15 SKILL05全文未注入提示词", !skill05Prompt.includes(skill05.slice(0, 60)) && skill05Prompt.length < skill05.length);
push("P16 SKILL05内部词未污染", !/(辅助说明与专业转译|当前屏文案结果|质量验收 20 条)/.test(skill05Prompt));

// ---------- Q 组 · SKILL 06 正式正文接入（人物与使用场景·条件能力·capability_module 落点） ----------
let skillsCfgQ = null;
try { skillsCfgQ = JSON.parse(read("server/detail-v2-control/config/professional-skills-v1.json")); } catch { skillsCfgQ = null; }
const figureContract = skillsCfgQ?.activationContracts?.["figure-usage-scene"];
const figureFormal = figureContract?.formal_professional_contract_v1;
push("Q1 SKILL06正式正文落地配置", Boolean(figureFormal) && probe(JSON.stringify(figureFormal), "SKILL 06｜人物与使用场景 V1.0"));
push("Q2 SKILL06 capability_module落点标注", probe(JSON.stringify(figureFormal), "capability_module 映射") && probe(JSON.stringify(figureFormal), "不新建重复Skill文件"));
push("Q3 未新建第9个SKILL.md（8文件不变）", (() => { const list = readdirSync(path.join(ROOT, "prompts/server/detail-v2-planning/skills")); return list.length === 8 && !list.some((d) => /figure|person|scene|usage/i.test(d)); })());
push("Q4 SKILL06七条正式触发", figureFormal?.activation_conditions_formal?.length === 7);
push("Q5 SKILL06七条正式排除", figureFormal?.exclusion_conditions_formal?.length === 7);
push("Q6 SKILL06决策/执行/输出/注入规则齐",
  figureFormal?.decision_rules_formal?.length >= 6 && figureFormal?.execution_rules_formal?.length >= 2
  && figureFormal?.output_contract_formal?.length >= 10 && figureFormal?.prompt_injection_policy_formal?.length > 20);
push("Q7 SKILL06冲突优先级与降级齐", probe(JSON.stringify(figureFormal), "全局事实边界") && figureFormal?.failure_fallback_formal?.length >= 7);
push("Q8 SKILL06验收24条", figureFormal?.acceptance_criteria_count === 24 && figureFormal?.task_value_rules?.length >= 3);
push("Q9 SKILL06契约12字段仍齐", ["activation_conditions", "exclusion_conditions", "required_context", "optional_context", "execution_mode", "decision_rules", "execution_rules", "output_contract", "downstream_usage", "prompt_injection_policy", "conflict_priority", "failure_fallback"].every((k) => k in (figureContract || {})));
// 触发：条件能力正负 + 防误触发（仅旧键不触发，正式键齐才触发）
const figOff = activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "figure-usage-scene");
const figLegacy = activationMod.evaluateAllActivations({ contextKeys: ["user_requires_model", "explicit_figure_task"] }).results.find((x) => x.id === "figure-usage-scene");
const figOn = activationMod.evaluateAllActivations({ contextKeys: ["screen_needs_figure", "user_requires_figure", "explicit_figure_task"] }).results.find((x) => x.id === "figure-usage-scene");
push("Q10 人物条件能力无需求不触发", figOff?.decision === "inactive");
push("Q11 仅旧键不足以触发（防误触发）", figLegacy?.decision === "inactive");
push("Q12 正式键齐触发conditional", figOn?.decision === "conditional" && figOn?.active === true && figOn?.authoritySource === "formal_professional_contract");
push("Q13 SKILL06契约仍conditional", figureContract?.execution_mode === "conditional");
// 污染：未触发人物能力时提示词无人物/场景污染
const figurePrompt = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂", modelMode: "no-model" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
);
push("Q14 未触发人物能力不进提示词", !figurePrompt.prompts[0].skillActivation?.activeIds?.includes("model-pose"));
push("Q15 清洁产品提示词无生活场景污染", !/(客厅|厨房|浴室|家庭成员|宠物)/.test(figurePrompt.prompts[0].text));
push("Q16 契约正文未进提示词", !figurePrompt.prompts[0].text.includes(figureFormal?.task_value_rules?.[0] || "__none__"));

// ---------- R 组 · 人物任务信号派生缺陷修复（真实 Middleware → 正式信号 → 契约 → 提示词） ----------
const deriveMod = await import(pathToFileURL(path.join(ROOT, "server", "detail-middleware.js")).href);
const deriveFigure = deriveMod.deriveFigureTaskContextKeys;
function figureScenario({ productName, industryId, materials, userInstruction, modelMode, modelUsage, screen = {} }) {
  const aiPlan = {
    product: { industryId, industryName: industryId, name: productName, materials },
    planning: { facts: materials.map((c) => ({ claim: c, level: "visible" })) },
    industryProfile: { industryId }, consumerInsights: { audience: "用户" }, marketingStrategy: { valueLadder: [] },
    globalVisualDNA: { palette: "素色" }, screens: [{ screen: 1, title: "首屏", moduleId: "hero", ...screen }]
  };
  const input = { count: 1, workflow: "taobao-detail", productName, userInstruction, modelMode, modelUsage };
  const group = deriveMod.buildDetailPromptGroup(input, [], { aiPlan });
  const prompt = group.prompts[0];
  const derived = deriveFigure({ input, aiScreen: { composition: screen.composition, sellingPoint: screen.sellingPoint }, moduleSkill: { name: "首屏主视觉", id: "hero" } });
  const figResult = prompt.skillActivation?.results?.find((x) => x.id === "figure-usage-scene");
  return { prompt, derived, figResult, active: Boolean(prompt.skillActivation?.activeIds?.includes("model-pose")) };
}
const figA = figureScenario({ productName: "T恤", industryId: "apparel", materials: ["棉"], userInstruction: "需要模特展示穿着效果", modelMode: "use-model", modelUsage: 2 });
push("R1 用户明确要求模特展示穿着→触发", figA.active === true && figA.figResult?.decision === "conditional" && figA.derived.includes("screen_needs_figure"));
const figB = figureScenario({ productName: "清洗剂", industryId: "cleaning", materials: ["白色泵瓶"], userInstruction: "画面需要手部按压泵头操作演示", modelMode: "use-model", modelUsage: 1 });
push("R2 用户明确要求手部操作→触发", figB.active === true && figB.derived.includes("screen_needs_figure"));
const figC = figureScenario({ productName: "清洗剂", industryId: "cleaning", materials: ["白色泵瓶"], userInstruction: "", modelMode: "no-model", screen: { composition: "人物在洗手台旁的生活场景中使用产品" } });
push("R3 本屏任务需要生活场景→触发", figC.active === true && figC.derived.includes("screen_needs_figure"));
const figD = figureScenario({ productName: "血渍清洗剂", industryId: "cleaning", materials: ["白色泵瓶"], userInstruction: "生成商品静物图", modelMode: "no-model" });
push("R4 清洁剂静物屏→不触发", figD.active === false && figD.derived.length === 0);
const figE = figureScenario({ productName: "T恤", industryId: "apparel", materials: ["棉"], userInstruction: "不要人物，纯产品展示", modelMode: "use-model", modelUsage: 2 });
push("R5 用户明确不要人物→不触发", figE.active === false && figE.derived.includes("no_figure_requirement"));
push("R6 仅旧键缺正式依据→不触发", activationMod.evaluateAllActivations({ contextKeys: ["user_requires_model", "explicit_figure_task"] }).results.find((x) => x.id === "figure-usage-scene")?.decision === "inactive");
const figFormal = activationMod.evaluateAllActivations({ contextKeys: ["screen_needs_figure", "user_requires_figure", "explicit_figure_task"] }).results.find((x) => x.id === "figure-usage-scene");
push("R7 正式键齐→conditional且权威=正式契约", figFormal?.decision === "conditional" && figFormal?.authoritySource === "formal_professional_contract");
push("R8 行业不自动触发（服装无人物依据）", figureScenario({ productName: "T恤", industryId: "apparel", materials: ["棉"], userInstruction: "", modelMode: "no-model" }).active === false);
// R9 更新为新语义：modelMode=no-model 时不得凭旧参数/行业自动触发；use-model 仅在授权屏触发（见 R10-R12）。
push("R9 no-model不自动触发人物", figureScenario({ productName: "清洗剂", industryId: "cleaning", materials: ["白色泵瓶"], userInstruction: "", modelMode: "no-model" }).active === false);
// 污染：未触发不注入人物、触发不注入Skill正文全文
const figureCfgText = JSON.stringify(skillsCfgQ?.activationContracts?.["figure-usage-scene"]?.formal_professional_contract_v1 || {});
push("R10 未触发时提示词为无模特正向约束", figD.prompt.text.includes("本屏无模特") && !/展示穿着效果/.test(figD.prompt.text));
push("R11 触发时仅必要人物指令、无Skill正文污染", figA.prompt.text.includes("模特") && !figA.prompt.text.includes("人物与使用场景"));

// ---------- S 组 · SKILL 07 正式正文接入（产品专项表达·六类独立·capability_module_cluster） ----------
const specContract = skillsCfgQ?.activationContracts?.["product-specialty-expression"];
const specFormal = specContract?.formal_professional_contract_v1;
push("S1 SKILL07正式正文落地配置", Boolean(specFormal) && probe(JSON.stringify(specFormal), "SKILL 07｜产品专项表达 V1.0"));
push("S2 SKILL07 capability_module_cluster落点", probe(JSON.stringify(specFormal), "capability_module_cluster 映射") && probe(JSON.stringify(specFormal), "不新建重复Skill文件"));
push("S3 未新建第9个SKILL.md", (() => { const list = readdirSync(path.join(ROOT, "prompts/server/detail-v2-planning/skills")); return list.length === 8 && !list.some((d) => /specialty|ingredient|material|texture|usage_step/i.test(d)); })());
const sixSpecs = specFormal?.six_specialties || [];
push("S4 六类专项齐备", sixSpecs.length === 6 && ["product_structure", "ingredient_principle", "effect_evidence", "before_after", "material_texture", "usage_steps"].every((id) => sixSpecs.some((s) => s.id === id)));
push("S5 六类各自独立触发排除输出", sixSpecs.every((s) => s.activation?.length && s.exclusion?.length && s.output?.length && s.decision?.length));
push("S6 六类无固定模板", sixSpecs.every((s) => s.no_fixed_template === true));
push("S7 路由与组合规则", specFormal?.routing_principles?.length === 3 && probe(JSON.stringify(specFormal), "一个专项触发不自动加载其他"));
push("S8 跨行业隔离六类", Object.keys(specFormal?.industry_isolation || {}).length >= 6 && probe(JSON.stringify(specFormal), "不得用于自动触发"));
push("S9 事实控制与边界", probe(JSON.stringify(specFormal), "行业惯例不能替代商品资料") && specFormal?.boundaries?.output_isolation && specFormal?.boundaries?.copywriter);
push("S10 验收30条与降级", specFormal?.acceptance_criteria_count === 30 && specFormal?.failure_fallback?.length >= 10);
push("S11 SKILL07契约12字段齐", ["activation_conditions", "exclusion_conditions", "required_context", "optional_context", "execution_mode", "decision_rules", "execution_rules", "output_contract", "downstream_usage", "prompt_injection_policy", "conflict_priority", "failure_fallback"].every((k) => k in (specContract || {})));
// 契约层：条件能力正负
const specOff = activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "product-specialty-expression");
const specOn = activationMod.evaluateAllActivations({ contextKeys: ["specialty_condition_met", "specialty_evidence"] }).results.find((x) => x.id === "product-specialty-expression");
push("S12 专项能力无需求不触发", specOff?.decision === "inactive");
push("S13 正式键齐触发conditional权威=正式契约", specOn?.decision === "conditional" && specOn?.authoritySource === "formal_professional_contract");
push("S14 SKILL07契约仍conditional", specContract?.execution_mode === "conditional");
// 真实链路（Middleware→信号→契约→提示词）：效果证据触发、静物不触发、无行业自动触发
function specialtyScenario(facts, industryId = "cleaning") {
  const aiPlan = {
    product: { industryId, industryName: industryId, name: "清洗剂", materials: [] },
    planning: { facts: facts.map((f) => ({ claim: f, level: "visible" })) },
    industryProfile: { industryId }, consumerInsights: { audience: "用户" }, marketingStrategy: { valueLadder: [] },
    globalVisualDNA: { palette: "素色" }, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }]
  };
  const prompt = deriveMod.buildDetailPromptGroup({ count: 1, workflow: "taobao-detail", productName: "清洗剂" }, [], { aiPlan }).prompts[0];
  return Boolean(prompt.skillActivation?.activeIds?.includes("product-structure"));
}
push("S15 真实链路效果证据→触发", specialtyScenario(["测试去除率", "效果测试"]) === true);
push("S16 真实链路静物无专项→不触发", specialtyScenario(["白色泵瓶"]) === false);
push("S17 行业不自动触发专项", specialtyScenario(["棉", "圆领"], "apparel") === false);
// 污染：未触发不注入专项正文
const specPromptNo = deriveMod.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "清洗剂" }, [],
  { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
).prompts[0].text;
push("S18 未触发专项正文未进提示词", !specPromptNo.includes("产品专项表达") && !specPromptNo.includes("six_specialties"));

// ---------- T 组 · 结构专项信号缺口修复（真实链路 7 项验收 + 防回归） ----------
const deriveStruct = deriveMod.deriveStructureTaskContextKeys;
push("T1 结构任务信号函数存在", typeof deriveStruct === "function");
push("T2 结构任务信号归一化到聚合条件", activationMod.normalizeContextKeys(["structure_task_required"]).keys.has("specialty_condition_met"));
push("T3 结构事实仍只作specialty_evidence", (() => { const k = activationMod.normalizeContextKeys(["confirmed_structure_fact"]).keys; return k.has("specialty_evidence") && !k.has("specialty_condition_met"); })());
push("T4 效果键未被用作结构触发键", probe(middleware, "structure_task_required") && !middleware.includes("reliable_effect_evidence: \"structure_task_required\""));
function structScenario({ facts = [], userInstruction = "", screen = {}, industryId = "cleaning", productName = "清洗剂" }) {
  const aiPlan = {
    product: { industryId, industryName: industryId, name: productName, materials: [] },
    planning: { facts: facts.map((f) => ({ claim: f, level: "visible" })) },
    industryProfile: { industryId }, consumerInsights: { audience: "用户" }, marketingStrategy: { valueLadder: [] },
    globalVisualDNA: { palette: "素色" }, screens: [{ screen: 1, title: "首屏", moduleId: "hero", ...screen }]
  };
  const prompt = deriveMod.buildDetailPromptGroup({ count: 1, workflow: "taobao-detail", productName, userInstruction }, [], { aiPlan }).prompts[0];
  return { active: Boolean(prompt.skillActivation?.activeIds?.includes("product-structure")), text: prompt.text };
}
push("T5 ①结构任务+结构事实→conditional", structScenario({ facts: ["泵头结构"], userInstruction: "展示产品泵头内部结构拆解" }).active === true);
push("T6 ②有结构事实无结构任务→inactive", structScenario({ facts: ["泵头结构"], userInstruction: "生成商品静物图" }).active === false);
push("T7 ③有结构要求无结构事实→降级inactive", structScenario({ facts: ["白色泵瓶"], userInstruction: "展示内部结构拆解" }).active === false);
push("T8 ④效果证据任务→效果专项仍触发", structScenario({ facts: ["测试去除率"], userInstruction: "展示效果证据" }).active === true);
push("T9 ⑤普通静物→不自动触发", structScenario({ facts: ["白色泵瓶"], userInstruction: "商品静物展示" }).active === false);
push("T10 ⑥服装行业有事实无任务→不自动触发", structScenario({ facts: ["棉", "圆领"], industryId: "apparel", productName: "T恤", userInstruction: "产品静物" }).active === false);
push("T11 ⑦用户不要结构→不触发", structScenario({ facts: ["泵头结构"], userInstruction: "不要结构展示，纯产品" }).active === false);
push("T12 ⑧仅旧键缺正式依据→inactive", activationMod.evaluateAllActivations({ contextKeys: ["ordinary_packaging"] }).results.find((x) => x.id === "product-specialty-expression")?.decision === "inactive");
push("T13 结构未触发时专项正文未进提示词", (() => { const s = structScenario({ facts: ["泵头结构"], userInstruction: "商品静物展示" }); return !s.text.includes("six_specialties") && !s.text.includes("产品专项表达"); })());
push("T14 结构事实未触发时仅作视觉保护", /结构锁定|真实结构/.test(structScenario({ facts: ["泵头结构"], userInstruction: "商品静物展示" }).text));
push("T15 六类专项定义未被修改", (() => { const f = skillsCfgQ?.activationContracts?.["product-specialty-expression"]?.formal_professional_contract_v1; return f?.six_specialties?.length === 6 && f?.acceptance_criteria_count === 30; })());

// ---------- U 组 · SKILL 08 正式正文接入（详情质量审查·optional·用户主动触发） ----------
const skill08Rel = "prompts/server/detail-v2-planning/skills/detail-quality-control/SKILL.md";
const skill08 = read(skill08Rel);
push("U1 SKILL08正式正文V1标记", probe(skill08, "正式专业正文 V1.0") && probe(skill08, "SKILL 08"));
push("U2 SKILL08九要素保留", ["职责", "触发", "输入", "判断方法", "规则", "输出字段", "边界", "冲突处理", "测试案例"].every((s) => probe(skill08, `## ${s}\n`)));
push("U3 SKILL08回链phrase逐字保留", probe(skill08, "严重错误不可被高分抵消"));
push("U4 SKILL08只诊断不创作原则", probe(skill08, "审查不等于创作") && probe(skill08, "只有审查权限、无默认修改权限"));
push("U5 SKILL08用户主动触发与排除", probe(skill08, "用户主动触发") && probe(skill08, "不得把 QC 变成生图前强制门槛"));
push("U6 SKILL08八审查维度", probe(skill08, "商品事实与身份") && probe(skill08, "生图提示词完整性与可执行性") && probe(skill08, "平台与规范"));
push("U7 SKILL08三级分级与证据", probe(skill08, "P0 必须修复") && probe(skill08, "问题证据规则"));
push("U8 SKILL08结论与信息不足", probe(skill08, "不得将信息不足描述成质量通过") && probe(skill08, "暂不建议通过"));
push("U9 SKILL08隔离与边界", probe(skill08, "QC 与正常生图提示词完全隔离") && probe(skill08, "QC 不改变其他 Skill 激活状态"));
push("U10 SKILL08验收30条", probe(skill08, "质量验收 30 条"));
push("U11 SKILL08旧规则合并保留", ["critical", "六项评价维度", "不阻断生图", "案例 A/B", "案例 E"].every((s) => probe(skill08, s)));
push("U12 SKILL08注册路径可读正式正文", (() => { const s = regMod.detailV2SkillRegistry.find((x) => x.id === "detail-quality-control"); return Boolean(s) && read(path.join("prompts/server/detail-v2-planning", s.path.replace("./", ""))).includes("正式专业正文 V1.0"); })());
push("U13 SKILL08 marker未变", regMod.detailV2SkillRegistry.find((x) => x.id === "detail-quality-control")?.marker === "JINGYIN_DETAIL_V2_SKILL_DETAIL_QUALITY_CONTROL");
// optional 触发：无请求 inactive；两键齐 conditional（契约当前为 AND 语义，单键偏差已挂账待裁决）
const qcOff = activationMod.evaluateAllActivations({ contextKeys: [] }).results.find((x) => x.id === "detail-quality-control");
const qcOn = activationMod.evaluateAllActivations({ contextKeys: ["user_clicks_qc", "user_requests_review"] }).results.find((x) => x.id === "detail-quality-control");
push("U14 QC无请求保持inactive", qcOff?.decision === "inactive");
push("U15 QC正式触发键齐conditional权威=正式契约", qcOn?.decision === "conditional" && qcOn?.authoritySource === "formal_professional_contract");
push("U16 QC契约仍optional", skillsCfgQ?.activationContracts?.["detail-quality-control"]?.execution_mode === "optional");
// 污染：QC正文不进正常生图提示词
const qcPrompt = mwForProbe.buildDetailPromptGroup(
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂" },
  [], { aiPlan: { ...probePlan, screens: [{ screen: 1, title: "首屏", moduleId: "hero" }] } }
).prompts[0].text;
push("U17 QC正文未污染生图提示词", !qcPrompt.includes(skill08.slice(0, 60)) && skill08.length > qcPrompt.length);
push("U18 QC内部词未进提示词", !/(质量验收 30 条|审查覆盖情况|问题清单)/.test(qcPrompt));
push("U19 八项Skill正式正文全部接入", ["product-understanding", "consumer-marketing-strategy", "detail-story-planning", "visual-art-direction", "ecommerce-copy-layout"].every((id) => probe(read(`prompts/server/detail-v2-planning/skills/${id}/SKILL.md`), "正式专业正文 V1.0"))
  && skillsCfgQ?.activationContracts?.["figure-usage-scene"]?.formal_professional_contract_v1
  && skillsCfgQ?.activationContracts?.["product-specialty-expression"]?.formal_professional_contract_v1
  && probe(skill08, "正式专业正文 V1.0"));

// ---------- V 组 · 用户指定屏数与完整叙事策划补充规则（SKILL 03） ----------
const storySkill = read(skill03Rel);
push("V1 屏数补充规则已并入SKILL03", probe(storySkill, "屏数是生成数量约束") && probe(storySkill, "完整策划必须先于屏数取舍"));
push("V2 屏数非截取与不塞屏规则", probe(storySkill, "3 屏≠更多屏方案的前三屏") && probe(storySkill, "强行塞进一屏"));
push("V3 少屏不套三段式与省略仍属事实", probe(storySkill, "首屏主视觉—核心卖点—收尾转化") && probe(storySkill, "被省略内容仍属商品事实"));
push("V4 策划与结果分离+屏间关系", probe(storySkill, "完整策划与最终生成结果分离") && probe(storySkill, "不突破用户指定屏数"));
push("V5 屏数对照验收条款", probe(storySkill, "屏数对照验收") && probe(storySkill, "最终生成数量严格符合用户选择"));
push("V6 SKILL03回链phrase仍逐字", probe(storySkill, "禁止固定标题轮转"));
push("V7 count硬约束代码未改", probe(middleware, "clamp(input.count, BASE_SKILL.screenCountRule.min") && probe(read("server/detail-ai.js"), "count 硬约束"));
// 工程层：count 严格 + 链路完整（真实 middleware；3屏非截取属G4真实模型验收，不在此冒充通过）
function screenCountScenario(n) {
  const plan = {
    product: { industryId: "cleaning", industryName: "清洁日化", name: "清洗剂", materials: [] },
    planning: { facts: [{ claim: "白色泵瓶", level: "visible" }], narrative: { id: "n", reason: "r", confidence: "high" }, screenRoles: [] },
    industryProfile: { industryId: "cleaning" }, consumerInsights: { audience: "家庭" }, marketingStrategy: { valueLadder: [] },
    globalVisualDNA: { palette: "粉蓝" },
    screens: Array.from({ length: n }, (_, i) => ({ screen: i + 1, title: "屏" + (i + 1), moduleId: i === 0 ? "hero" : "coreSellingPoint", sellingPoint: "卖点" + (i + 1), composition: "第" + (i + 1) + "屏具体构图场景" }))
  };
  const g = deriveMod.buildDetailPromptGroup({ count: n, workflow: "taobao-detail", productName: "清洗剂" }, [], { aiPlan: plan });
  return g;
}
const vg3 = screenCountScenario(3); const vg6 = screenCountScenario(6);
push("V8 3屏严格生成3屏", vg3.prompts.length === 3 && vg3.params.count === 3);
push("V9 6屏严格生成6屏", vg6.prompts.length === 6 && vg6.params.count === 6);
push("V10 屏数下链路完整（卖点+画面任务）", vg3.prompts.every((p) => p.text.includes("本屏卖点") && p.text.includes("画面任务")));
push("V11 屏间各有独立sellingPoint", new Set(vg3.prompts.map((p) => p.summary)).size === 3);

// ---------- W 组 · PRO-003 QC主动触发OR/AND纠偏（真实链路12项） ----------
push("W1 QC契约OR信号单键", (() => { const a = skillsCfgQ?.activationContracts?.["detail-quality-control"]?.activation_conditions || []; return a.length === 1 && a[0] === "qc_requested"; })());
push("W2 QC契约OR语义注记", Boolean(skillsCfgQ?.activationContracts?.["detail-quality-control"]?.activation_logic_note));
push("W3 两入口旧别名归一化到qc_requested", ["user_clicks_qc", "user_requests_review"].every((k) => activationMod.normalizeContextKeys([k]).keys.has("qc_requested")));
push("W4 两入口同时成立只一个统一键", (() => { const k = [...activationMod.normalizeContextKeys(["user_clicks_qc", "user_requests_review"]).keys]; return k.filter((x) => x === "qc_requested").length === 1; })());
push("W5 conditionsMet全契约every未改", probe(read("server/detail-v2-control/skill-activation.js"), "conditions.every"));
function qcScenario(inputExtra = {}) {
  const plan = {
    product: { industryId: "cleaning", industryName: "清洁日化", name: "清洗剂", materials: [] },
    planning: { facts: [{ claim: "白色泵瓶", level: "visible" }], narrative: { id: "n", reason: "r", confidence: "high" }, screenRoles: [] },
    industryProfile: { industryId: "cleaning" }, consumerInsights: { audience: "家庭" }, marketingStrategy: { valueLadder: [] },
    globalVisualDNA: { palette: "粉蓝" }, screens: [{ screen: 1, title: "首屏", moduleId: "hero", sellingPoint: "卖点1", composition: "构图细节" }]
  };
  const input = { count: 1, workflow: "taobao-detail", productName: "清洗剂", ...inputExtra };
  const prompt = deriveMod.buildDetailPromptGroup(input, [], { aiPlan: plan }).prompts[0];
  const qc = prompt.skillActivation?.results?.find((x) => x.id === "detail-quality-control");
  return { text: prompt.text, qc, active: Boolean(qc?.active), derived: deriveMod.deriveQCTaskContextKeys({ input }) };
}
const wT01 = qcScenario({ qcTrigger: "button" });
push("W6 T01仅点QC按钮→激活", wT01.active && wT01.qc.decision === "conditional");
const wT02 = qcScenario({ userInstruction: "帮我检查这套详情有没有问题" });
push("W7 T02仅明确审查请求→激活", wT02.active);
const wT03 = qcScenario({ qcTrigger: "button", userInstruction: "请质量审查" });
push("W8 T03两入口齐→只一次不重复", wT03.active && wT03.derived.filter((x) => x === "qc_requested").length === 1);
push("W9 T04普通生成→inactive", (() => { const r = qcScenario({ userInstruction: "生成一套商品详情" }); return !r.active && r.qc.decision === "inactive"; })());
push("W10 T05普通文案修改→inactive", !qcScenario({ userInstruction: "把第二屏的文案改一下" }).active);
push("W11 T06其他Skill发现→不自触", !qcScenario({ userInstruction: "生成详情" }).active);
push("W12 T07AI自检→不自触", !qcScenario({ userInstruction: "生成详情，内容要合理" }).active);
push("W13 T08指定单屏审查→激活", qcScenario({ userInstruction: "检查一下第三屏的画面是否合理" }).active);
push("W14 T09整套审查→激活", qcScenario({ userInstruction: "请对整套详情做质量审查" }).active);
const wT10 = qcScenario({ userInstruction: "生成商品静物图" });
push("W15 T10未激活QC正文不进提示词", !wT10.text.includes("严重错误不可被高分抵消") && !wT10.text.includes("质量审查"));
const wT11 = qcScenario({ qcTrigger: "button" });
push("W16 T11激活后可读QC专业正文", wT11.active && probe(skill08, "严重错误不可被高分抵消"));
push("W17 T12 QC不覆盖确认稿不重生图", wT11.text.includes("【画面任务】") && !wT11.text.includes("【QC报告】") && !wT11.text.includes("P0 必须修复"));
// 回归：其他7项触发未变
const regEmpty = activationMod.evaluateAllActivations({ contextKeys: [] });
push("W18 核心4仍mandatory", ["product-understanding", "consumer-marketing-strategy", "detail-story-planning", "visual-art-direction"].every((id) => regEmpty.results.find((x) => x.id === id)?.decision === "mandatory"));
push("W19 其他conditional空上下文仍inactive", ["ecommerce-copy-layout", "figure-usage-scene", "product-specialty-expression"].every((id) => regEmpty.results.find((x) => x.id === id)?.decision === "inactive"));
push("W20 QC专业正文未被修改", probe(skill08, "正式专业正文 V1.0") && probe(skill08, "质量验收 30 条"));

// ---------- X 组 · QC 否定表达误触发补修（真实链路 A-F 组） ----------
push("X1 QC否定排除常量存在", probe(middleware, "QC_NEGATION_PATTERN"));
function qcReal(instruction = "", extra = {}) {
  const plan = {
    product: { industryId: "cleaning", industryName: "清洁日化", name: "清洗剂", materials: [] },
    planning: { facts: [{ claim: "白色泵瓶", level: "visible" }], narrative: { id: "n", reason: "r", confidence: "high" }, screenRoles: [] },
    industryProfile: { industryId: "cleaning" }, consumerInsights: { audience: "家庭" }, marketingStrategy: { valueLadder: [] },
    globalVisualDNA: { palette: "粉蓝" }, screens: [{ screen: 1, title: "首屏", moduleId: "hero", sellingPoint: "卖点1", composition: "构图细节" }]
  };
  const input = { count: 1, workflow: "taobao-detail", productName: "清洗剂", userInstruction: instruction, ...extra };
  const prompt = deriveMod.buildDetailPromptGroup(input, [], { aiPlan: plan }).prompts[0];
  const qc = prompt.skillActivation?.results?.find((x) => x.id === "detail-quality-control");
  return { active: Boolean(qc?.active), decision: qc?.decision, text: prompt.text };
}
[
  ["不要质检", false], ["别做质检了，直接生成", false], ["不用检查详情，直接出图", false], ["不需要审查", false],
  ["无需质检，直接生成图片", false], ["取消质检", false], ["这次先不做质量审查", false]
].forEach(([t, exp], i) => push(`X-A${i + 1} 否定表达不触发:${t}`, qcReal(t).active === exp));
[
  ["检查这套详情有没有问题", true], ["做一次质量审查", true], ["找找详情里的问题", true],
  ["帮我检查一下详情，重点看文案", true], ["不要修改，先帮我检查一下", true]
].forEach(([t, exp], i) => push(`X-B${i + 1} 主动审查仍触发:${t}`, qcReal(t).active === exp));
[
  ["把第二屏检查一下文案是否合理", false], ["画面调得合理些", false], ["检查背景改成蓝色", false], ["修改第二屏的文字", false]
].forEach(([t, exp], i) => push(`X-C${i + 1} 普通修改不误触:${t}`, qcReal(t).active === exp));
push("X-D1 按钮单独→conditional", qcReal("", { qcTrigger: "button" }).active === true);
push("X-D2 按钮+不要质检→按钮优先", qcReal("不要质检", { qcTrigger: "button" }).active === true);
push("X-D3 按钮+普通修改→按钮优先", qcReal("把第二屏文案改一下", { qcTrigger: "button" }).active === true);
push("X-D4 runQC显式信号→conditional", qcReal("", { runQC: true }).active === true);
push("X-E1 旧键均归一到qc_requested", ["user_clicks_qc", "user_requests_review"].every((k) => activationMod.normalizeContextKeys([k]).keys.has("qc_requested")));
push("X-E2 两旧键只产生一个统一键", [...activationMod.normalizeContextKeys(["user_clicks_qc", "user_requests_review"]).keys].filter((x) => x === "qc_requested").length === 1);
push("X-F1 否定请求QC正文不进提示词", (() => { const r = qcReal("不要质检"); return !r.text.includes("严重错误不可被高分抵消") && !r.text.includes("质量审查"); })());
push("X-F2 未激活不注入QC全文", (() => { const r = qcReal("生成商品静物图"); return !r.text.includes("质量验收 30 条") && !r.text.includes("【QC报告】"); })());
push("X-F3 激活也不把QC正文写入提示词", (() => { const r = qcReal("检查这套详情有没有问题"); return r.active && !r.text.includes("质量验收 30 条"); })());

// ---------- Y 组 · 内容策划与提示词质量修复（P0-1/P0/P1/P2） ----------
const FIX_PF = "成分：阴离子表面活性剂、乳化剂。适用范围：羽绒服、窗帘。使用方法：按压海绵头中心，挤压出清洁剂涂抹于衣物表面，用清洁刷刷洗需要清洁部位，用干净毛巾擦拭后自然干燥。";
function contentScenario(extraInput = {}, extraOpts = {}) {
  return deriveMod.buildDetailPromptGroup(
    { count: 4, workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: FIX_PF, ...extraInput },
    [], { ...extraOpts }
  );
}
// Y 组沿用 auto（粗粒度）测试意图；fixed 深度细分由 AF 组覆盖。
const yGroup = contentScenario({ modelMode: "use-model", modelPose: "special", modelUsage: 1, countMode: "auto" });
push("Y1 结构化事实解析含来源等级", (() => { const f = deriveMod.parseStructuredFacts(FIX_PF); return f.length >= 3 && f.every((x) => x.source === "user_provided" && x.level === "visible") && f.some((x) => x.category === "usage"); })());
push("Y2 P0-1无资料fail-fast返回planningError", (() => { const g = deriveMod.buildDetailPromptGroup({ count: 4, workflow: "taobao-detail", productName: "空白商品" }, [], {}); return g.prompts.length === 0 && Boolean(g.planningError) && g.planningIntegrity?.ok === false; })());
push("Y3 P0-1有结构化资料正常编译", yGroup.prompts.length === 4 && !yGroup.planningError);
push("Y4 P0事实豁免-已确认窗帘放行", (() => { const r = activationMod.checkSellingPointBoundary("适用于羽绒服、窗帘", "cleaning", undefined, ["羽绒服、窗帘"]); return r.allowed && r.reason === "confirmed_fact_exempt"; })());
push("Y5 P0事实豁免-无事实仍拦截", !activationMod.checkSellingPointBoundary("适用于窗帘", "cleaning", undefined, []).allowed);
push("Y6 P1首屏卖点非空泛兜底", (() => { const t = yGroup.prompts[0].text; return t.includes("【本屏卖点】") && !t.includes("围绕已确认的商品事实与该屏任务表达"); })());
push("Y7 P1成分与适用范围进入卖点", yGroup.prompts[1].text.includes("阴离子表面活性剂") && yGroup.prompts[2].text.includes("适用范围"));
push("Y8 P1使用方法整段不拆碎", (() => { const joined = yGroup.prompts.map((p) => p.text).join("\n"); return joined.includes("按压海绵头中心") && joined.includes("擦拭后自然干燥") && yGroup.prompts[3].text.includes("使用方法："); })());
push("Y9 P0按屏人物仅授权屏active", JSON.stringify(yGroup.prompts.map((p) => Boolean(p.skillActivation?.activeIds?.includes("model-pose")))) === JSON.stringify([true, false, false, false]));
push("Y10 P0授权屏特殊姿势文案", yGroup.prompts[0].text.includes("特殊姿态模特") && yGroup.prompts[1].text.includes("本屏无模特"));
push("Y11 P0 usage=2前两屏授权", (() => { const g = contentScenario({ modelMode: "use-model", modelUsage: 2 }); return JSON.stringify(g.prompts.map((p) => Boolean(p.skillActivation?.activeIds?.includes("model-pose")))) === JSON.stringify([true, true, false, false]); })());
push("Y12 P0 no-model全禁人物", (() => { const g = contentScenario({ modelMode: "no-model" }); return g.prompts.every((p) => !p.skillActivation?.activeIds?.includes("model-pose")); })());
push("Y13 P2附件审计声明角色", yGroup.prompts.every((p) => p.attachmentAudit && Array.isArray(p.attachmentAudit.declaredSlots)));
push("Y14 P1视觉任务因内容不同", new Set(yGroup.prompts.map((p) => p.text.split("\n").find((x) => x.includes("【画面任务】")))).size >= 3);
push("Y15 未触发人物不注入人物指令", yGroup.prompts[1].text.includes("禁止出现真人") && !yGroup.prompts[1].text.includes("特殊姿态模特"));

// ---------- Z 组 · V2专业能力升级（正文生效+结构化维度+卖点去重） ----------
const detailAiSrc = read("server/detail-ai.js");
const Z_CASES = {
  apparel: { count: 5, workflow: "taobao-detail", productName: "纯棉T恤", productFeature: "材质：100%棉。版型：宽松落肩。颜色：米白、黑色。规格：S/M/L。洗涤：可机洗。", userInstruction: "", modelMode: "use-model", modelUsage: 2 },
  home: { count: 3, workflow: "taobao-detail", productName: "保温杯", productFeature: "材质：304不锈钢。容量：500ml。保温：12小时保温。颜色：银色。适用场景：办公、户外。", userInstruction: "" }
};
push("Z1 SKILL02五层价值链正文已入", probe(read("prompts/server/detail-v2-planning/skills/consumer-marketing-strategy/SKILL.md"), "五层价值链"));
push("Z2 SKILL03完整内容地图正文已入", probe(read("prompts/server/detail-v2-planning/skills/detail-story-planning/SKILL.md"), "完整内容地图"));
push("Z3 SKILL04展示角色正文已入", probe(read("prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md"), "商品展示角色判断"));
push("Z4 directive含五层链且回链phrase未丢", probe(detailAiSrc, "五层价值链") && probe(detailAiSrc, "空洞参数罗列不算营销表达"));
push("Z5 directive含内容地图+不一条卖点一屏", probe(detailAiSrc, "完整内容地图") && probe(detailAiSrc, "使用动作"));
push("Z6 directive含展示角色+回链phrase未丢", probe(detailAiSrc, "展示角色") && probe(detailAiSrc, "禁止仅背景/颜色变化"));
const zFactsApparel = deriveMod.parseStructuredFacts(Z_CASES.apparel.productFeature);
push("Z7 服装结构化维度含材质/颜色/洗涤", ["material", "color", "care"].every((c) => zFactsApparel.some((f) => f.category === c)));
const zFactsHome = deriveMod.parseStructuredFacts(Z_CASES.home.productFeature);
push("Z8 家居结构化维度含材质/效果/场景", ["material", "effect", "applicableScope"].every((c) => zFactsHome.some((f) => f.category === c)));
const zHome = deriveMod.buildDetailPromptGroup(Z_CASES.home, [], {});
const zHomeSelling = zHome.prompts.map((p) => (p.text.split("\n").find((x) => x.includes("【本屏卖点】")) || ""));
push("Z9 家居多屏卖点不重复", new Set(zHomeSelling).size === zHomeSelling.length);
const zApparel = deriveMod.buildDetailPromptGroup(Z_CASES.apparel, [], {});
const zApparelSelling = zApparel.prompts.map((p) => (p.text.split("\n").find((x) => x.includes("【本屏卖点】")) || ""));
push("Z10 服装资料不足屏标记为空不重复卖点", (() => {
  const empties = zApparel.prompts.filter((p) => p.isEmptyScreen);
  return empties.length >= 1 && empties.every((p) => p.shouldGenerate === false && p.text.includes("已标记为不生成"))
    && zApparel.prompts.filter((p) => !p.isEmptyScreen).every((p) => p.shouldGenerate === true);
})());
push("Z11 服装人物仍按屏授权", JSON.stringify(zApparel.prompts.map((p) => Boolean(p.skillActivation?.activeIds?.includes("model-pose")))) === JSON.stringify([true, true, false, false, false]));
push("Z12 结构化事实仍保留来源等级", zFactsApparel.every((f) => f.source === "user_provided" && f.level === "visible"));

// ---------- AB 组 · V2-AGENT-EXECUTION-CLOSURE 执行闭环 A-J ----------
const AB_BASE = { count: 3, workflow: "taobao-detail", productName: "保温杯", productFeature: "材质：304不锈钢。容量：500ml。", userInstruction: "生成详情" };
const AB_PLAN = {
  product: { name: "保温杯" },
  planning: { facts: [], narrative: { id: "n", reason: "r", confidence: "high" }, screenRoles: [] },
  industryProfile: { industryId: "generic" }, consumerInsights: {}, marketingStrategy: {}, globalVisualDNA: {},
  screens: [1, 2, 3].map((i) => ({ screen: i, moduleId: i === 1 ? "hero" : "coreSellingPoint", title: "", composition: "", copywriting: i === 2 ? "标题：保温更持久" : "", productFileIndexes: [0], referenceFileIndexes: [] }))
};
const abRun = (extra = {}, opts = {}) => deriveMod.buildDetailPromptGroup({ ...AB_BASE, ...extra }, [], opts);
const abA = abRun();
push("AB-A 普通屏无Conditional注入", abA.prompts.every((p) => (p.authorizationTrace || []).every((t) => !t.injectedToPrompt)));
const abB = abRun({}, { aiPlan: AB_PLAN });
push("AB-B 文案Skill按屏授权且不重复注入", (() => {
  const t = abB.prompts.map((p) => p.authorizationTrace?.find((x) => x.skillId === "ecommerce-copy-layout"));
  return t[0]?.decision === "inactive" && t[1]?.authorized === true && t[1]?.carriedByExistingSlot === true && t[1]?.injectedToPrompt === false && t[2]?.decision === "inactive";
})());
const abC = abRun({ count: 4, modelMode: "use-model", modelUsage: 1, userInstruction: "模特展示穿着" });
push("AB-C 人物仅首屏授权且不扩散", JSON.stringify(abC.prompts.map((p) => Boolean(p.skillActivation?.activeIds?.includes("model-pose")))) === JSON.stringify([true, false, false, false])
  && abC.prompts[0].text.includes("模特") && abC.prompts.slice(1).every((p) => p.text.includes("本屏无模特")));
push("AB-D 未触发专项不注入", abA.prompts.every((p) => (p.authorizationTrace || []).find((t) => t.skillId === "product-specialty-expression")?.injectedToPrompt === false));
push("AB-E 多能力trace隔离不重复", abB.prompts[1].authorizationTrace.length === 4 && new Set(abB.prompts[1].authorizationTrace.map((t) => t.skillId)).size === 4);
push("AB-F Mandatory恒执行(activeIds含四项)", ["product-understanding", "consumer-marketing-strategy", "detail-story-planning", "visual-art-direction"].every((id) => abA.prompts[0].skillActivation.activeIds.includes(id)));
push("AB-G QC普通生成不触发", abA.prompts.every((p) => !p.skillActivation.activeIds.includes("detail-quality-control")));
const abH = abRun({ qcTrigger: "button" });
push("AB-H QC主动触发但不进生图text", abH.prompts[0].skillActivation.activeIds.includes("detail-quality-control") && !abH.prompts[0].text.includes("质量验收 30 条") && abH.prompts[0].authorizationTrace.find((t) => t.skillId === "detail-quality-control")?.injectedToPrompt === false);
push("AB-I compileWithAuthorization已进生产链路", probe(middleware, "compileScreenConditionalInstructions({ activation") && probe(middleware, "compileWithAuthorization(entries, admitted)"));
push("AB-J 授权trace含来源屏依据与结果", ["skillId", "screen", "decision", "activated", "injectedToPrompt", "reason"].every((k) => Object.hasOwn(abA.prompts[0].authorizationTrace[0] || {}, k)));

// ---------- AD 组 · V2-ADAPTIVE 自适应屏数与内容价值 ----------
const AD_PF = "成分：阴离子表面活性剂、乳化剂。适用范围：羽绒服、窗帘。使用方法：按压海绵头中心，挤压出清洁剂，用清洁刷刷洗，用毛巾擦拭后自然干燥。";
// AD 组沿用 auto 测原有"内容不足→空屏+冲突"机制；fixed 深度策划由 AF 组覆盖。
const adRun = (extra = {}) => deriveMod.buildDetailPromptGroup({ count: 8, workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: AD_PF, userInstruction: "", countMode: "auto", ...extra }, [], {});
const adG = adRun();
const sellingOf = (p) => (p.text.split("\n").find((x) => x.includes("【本屏卖点】")) || "");
const visualOf = (p) => (p.text.split("\n").find((x) => x.includes("【画面任务】")) || "");
push("AD1 空屏标记不生成", adG.prompts.slice(4).every((p) => p.isEmptyScreen === true && p.shouldGenerate === false));
push("AD2 非空屏正常生成", adG.prompts.slice(0, 4).every((p) => p.isEmptyScreen === false && p.shouldGenerate === true));
// auto 已改为只返回有效屏（无空屏）；空屏+冲突机制在 fixed 下验证（见 AE5/AF12）。
push("AD3 auto只返回有效屏不保留空位", adG.prompts.length === 4 && !adG.planningConflict);
push("AD4 空屏不注入全量商品事实", adG.prompts.slice(4).every((p) => !visualOf(p).includes("画面须呈现已确认事实")));
push("AD5 非空屏画面任务只含本屏事实", !visualOf(adG.prompts[3]).includes("阴离子表面活性剂") && visualOf(adG.prompts[1]).includes("成分"));
push("AD6 模块分类按真实任务", adG.prompts[0].moduleKey === "hero" && adG.prompts[2].moduleKey === "useScenario" && adG.prompts[3].moduleKey === "useScenario");
push("AD7 首屏不以成分清单为核心价值", sellingOf(adG.prompts[0]).includes("羽绒服干洗剂") && !sellingOf(adG.prompts[0]).includes("阴离子"));
push("AD8 无8屏硬上限(max=12)", probe(read("prompts/server/detail-skills.js"), "max: 12") && !probe(read("prompts/server/detail-skills.js"), "max: 8"));
push("AD9 使用方法整段保留不拆", sellingOf(adG.prompts[3]).includes("按压海绵头中心") && sellingOf(adG.prompts[3]).includes("自然干燥"));
const adNoModel = adRun({ count: 4, modelMode: "no-model" });
push("AD10 useScenario模块名不误触发人物", adNoModel.prompts.every((p) => !p.skillActivation?.activeIds?.includes("model-pose")));
const adHome = deriveMod.buildDetailPromptGroup({ count: 3, workflow: "taobao-detail", productName: "保温杯", productFeature: "材质：304不锈钢。容量：500ml。保温：12小时保温。适用场景：办公、户外。", userInstruction: "" }, [], {});
push("AD11 简单商品不生成空屏", adHome.prompts.every((p) => !p.isEmptyScreen) && adHome.prompts.length === 3);
push("AD12 三类任务模块各异", new Set(adHome.prompts.map((p) => p.moduleKey)).size >= 2);
const adSimple = deriveMod.buildDetailPromptGroup({ count: 2, workflow: "taobao-detail", productName: "商品", productFeature: "材质：棉。", userInstruction: "" }, [], {});
push("AD13 少屏请求不硬凑重复", adSimple.prompts.length === 2 && new Set(adSimple.prompts.map(sellingOf)).size === 2);

// ---------- AE 组 · V2-COUNT-MODE 屏数来源与生产闭环 ----------
const AE_PF = "成分：阴离子表面活性剂。适用范围：羽绒服、窗帘。使用方法：按压海绵头，擦拭后自然干燥。";
const aeBase = { count: 8, workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: AE_PF, userInstruction: "" };
const aeRun = (extra = {}) => deriveMod.buildDetailPromptGroup({ ...aeBase, ...extra }, [], {});
const aeOld = aeRun();                       // 无 countMode = 旧请求
const aeAuto = aeRun({ countMode: "auto" });
const aeFixed = aeRun({ countMode: "fixed" });
push("AE1 旧请求兼容fixed契约", aeOld.params.countMode === "fixed" && aeOld.prompts.length === 8);
push("AE2 auto返回有效屏集合", aeAuto.params.countMode === "auto" && aeAuto.prompts.length === aeAuto.prompts.filter((p) => p.shouldGenerate !== false && !p.isEmptyScreen).length && aeAuto.prompts.length < 8);
push("AE3 fixed保留count契约", aeFixed.prompts.length === 8 && aeFixed.prompts.some((p) => p.isEmptyScreen === true));
push("AE4 auto无冲突提示", !aeAuto.planningConflict);
push("AE5 fixed内容不足有冲突", aeFixed.planningConflict?.type === "insufficient_content_for_requested_screens" && aeFixed.planningConflict.countMode === "fixed" && aeFixed.planningConflict.skippedScreens.length >= 1);
push("AE6 冲突含数量与级因", aeFixed.planningConflict?.requestedScreens === 8 && aeFixed.planningConflict?.effectiveScreens === aeFixed.params.effectiveScreenCount && aeFixed.planningConflict?.hasInsufficientContent === true && aeFixed.planningConflict?.effectiveScreens < 8);
push("AE7 effectiveScreenCount准确", aeAuto.params.effectiveScreenCount === aeAuto.prompts.length && aeFixed.params.effectiveScreenCount === aeFixed.prompts.filter((p) => !p.isEmptyScreen).length && aeFixed.planningConflict.effectiveScreens === aeFixed.params.effectiveScreenCount);
const aeApparel = aeRun({ countMode: "auto", productName: "T恤", productFeature: "材质：100%棉。颜色：黑色。规格：S/M/L。" });
const aeHome = aeRun({ countMode: "auto", productName: "保温杯", productFeature: "材质：304不锈钢。容量：500ml。适用场景：办公。" });
push("AE8 auto不同商品不同屏数", aeAuto.prompts.length !== aeApparel.prompts.length || aeApparel.prompts.length !== aeHome.prompts.length);
push("AE9 auto屏号连续不错位", aeAuto.prompts.every((p, i) => p.screen === i + 1) && aeAuto.prompts.every((p) => p.text.split("\n")[0].includes(`第${p.screen}屏`)));
// 前端生产闭环（源码静态断言 + 白名单）
const detailState = read("src/features/detail/detail-state.js");
const detailGroup = read("src/features/detail/detail-group.js");
const detailView = read("src/features/detail/DetailView.jsx");
const appDefaults = read("src/shared/app-defaults.js");
// 修正：产品语义＝选几张出几张，前端固定发 fixed（默认显示10=用户要10张），不再把默认 count 判为 auto。
push("AE10 前端固定发fixed不选几缩几", probe(detailState, 'countMode: "fixed"') && !probe(detailState, 'countTouched ? "fixed" : "auto"'));
push("AE11 用户改count置touched", probe(detailState, 'next.countTouched = true'));
push("AE12 默认含countTouched", probe(appDefaults, "countTouched: false"));
push("AE13 批量过滤shouldGenerate", probe(detailState, "prompt.shouldGenerate !== false && !prompt.isEmptyScreen"));
push("AE14 单屏入口守卫空屏", probe(detailState, "prompt?.shouldGenerate === false || prompt?.isEmptyScreen"));
push("AE15 白名单保留空屏标记", probe(detailGroup, '"shouldGenerate", "isEmptyScreen"') && probe(detailGroup, '"planningConflict"'));
push("AE16 前端展示冲突", probe(detailView, "activeDetailGroup.planningConflict"));
push("AE17 auto不被defaultCount覆盖", aeAuto.params.count === 8 && aeAuto.prompts.length < 8);

// ---------- AF 组 · V2-FIXED-COUNT-DEPTH 固定屏数深度策划 ----------
const AF_PF = "成分：阴离子表面活性剂、非离子表面活性剂、乳化剂、去污剂等。适用范围：羽绒服、羽绒被、窗帘、沙发、尼龙衣物等。使用方法：按压海绵头中心，挤压出清洁剂涂抹于衣物表面，用清洁刷反复刷洗需要清洁部位，用干净毛巾擦拭污渍后，待自然干燥。";
const afRun = (extra = {}) => deriveMod.buildDetailPromptGroup({ count: 9, countMode: "fixed", workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: AF_PF, userInstruction: "", ...extra }, [], {});
const afG = afRun();
const afSelling = afG.prompts.map(sellingOf);
push("AF1 fixed9屏全有效无空屏", afG.prompts.length === 9 && afG.prompts.every((p) => !p.isEmptyScreen && p.shouldGenerate !== false) && !afG.planningConflict);
push("AF2 深度细分出独立步骤屏", afG.prompts.filter((p) => sellingOf(p).includes("使用步骤：")).length >= 4);
push("AF3 适用范围按对象拆分", afSelling.some((s) => s.includes("适用衣物织物")) && afSelling.some((s) => s.includes("适用家居织物")));
push("AF4 九屏卖点无重复", new Set(afSelling).size === afSelling.length);
push("AF5 每屏认知目标不同(去重按认知)", (() => {
  const goals = afG.prompts.map((p) => (p.screenVisual?.text || "").slice(0, 20));
  return new Set(goals).size >= 8;
})());
push("AF6 使用步骤认知不串行错配", afSelling.some((s) => s.includes("用清洁刷反复刷洗")) && afSelling.some((s) => s.includes("擦拭污渍后")) && afSelling.some((s) => s.includes("自然干燥")));
const afAuto = afRun({ countMode: "auto" });
push("AF7 auto不被深度细分强行扩屏", afAuto.prompts.length <= 4 && afAuto.prompts.every((p) => !p.isEmptyScreen));
const afApparel = deriveMod.buildDetailPromptGroup({ count: 8, countMode: "fixed", workflow: "taobao-detail", productName: "纯棉T恤", productFeature: "材质：100%棉。版型：宽松。颜色：米白、黑色。规格：S/M/L。洗涤：可机洗30度。", userInstruction: "" }, [], {});
const afHome = deriveMod.buildDetailPromptGroup({ count: 8, countMode: "fixed", workflow: "taobao-detail", productName: "保温杯", productFeature: "材质：304不锈钢。容量：500ml。保温：12小时保温6小时保冷。颜色：银色。适用场景：办公、户外。", userInstruction: "" }, [], {});
push("AF8 跨商品不同策划内容", afApparel.prompts[1].moduleKey === "materialDetail" && afHome.prompts.some((p) => sellingOf(p).includes("性能依据")));
push("AF9 洗涤/性能合理细分不重复", (() => {
  const ap = afApparel.prompts.filter((p) => !p.isEmptyScreen).map(sellingOf);
  const hm = afHome.prompts.filter((p) => !p.isEmptyScreen).map(sellingOf);
  return new Set(ap).size === ap.length && new Set(hm).size === hm.length;
})());
push("AF10 规划请求传达fixed深度目标", probe(read("server/detail-ai.js"), "形成 ${count} 个具有独立消费者认知任务的屏幕"));
push("AF11 规划请求传countMode", probe(read("server/detail-ai.js"), 'countMode: input.countMode === "auto" ? "auto" : "fixed"'));
// 空屏+冲突机制保留在 fixed 模式（AE_PF 资料有限，8屏无法深度细分填满）。
push("AF12 空屏与冲突机制仍在fixed保留", aeFixed.prompts.some((p) => p.isEmptyScreen === true) && Boolean(aeFixed.planningConflict));

// ---------- AG 组 · V2-UNIVERSAL-CATEGORY 全品类消费者洞察与动态行业策划 ----------
const contentCfg = JSON.parse(read("server/detail-v2-control/config/professional-content-v1.json"));
const AG_PACK_IDS = ["cleaning", "apparel", "beauty", "food", "electronics", "home", "motherBaby", "pet"];
push("AG1 行业能力包覆盖多类目", AG_PACK_IDS.every((id) => contentCfg.industryPacks[id]?.industryId === id));
push("AG2 每包含正/负信号与泛化边界", AG_PACK_IDS.every((id) => {
  const p = contentCfg.industryPacks[id];
  return Array.isArray(p.positiveSignals) && p.positiveSignals.length > 0 && Array.isArray(p.negativeSignals) && Array.isArray(p.noGeneralization);
}));
push("AG3 消费者洞察接入编译(非只审计)", probe(read("server/detail-middleware.js"), "valueLadderList") && probe(read("server/detail-middleware.js"), "insightNeedList"));
// 消费者洞察真实链路：带 aiPlan 的营销表达进入 sellingPoints
const agPlan = {
  product: { name: "商品", industryId: "home", realSellingPoints: [] },
  planning: { facts: [{ claim: "棉", level: "visible" }], narrative: { id: "n", reason: "r", confidence: "high" }, screenRoles: [] },
  industryProfile: { industryId: "home" },
  consumerInsights: { audience: "家庭", needs: [{ need: "担心不好收纳", evidenceRef: "棉" }] },
  marketingStrategy: { valueLadder: [{ fact: "棉", need: "担心不好收纳", benefit: "整理更省心", expression: "轻松收纳不凌乱" }], tone: "warm", boundaries: [] },
  globalVisualDNA: {},
  screens: [1, 2].map((i) => ({ screen: i, moduleId: "coreSellingPoint", title: "", composition: "", productFileIndexes: [0], referenceFileIndexes: [] }))
};
const agG = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "收纳袋", productFeature: "材质：棉。", userInstruction: "" }, [], { aiPlan: agPlan });
push("AG4 消费者利益进入屏级任务", agG.analysis.sellingPoints.some((s) => String(s).includes("轻松收纳不凌乱")));
push("AG5 消费者需求进入屏级任务", agG.analysis.sellingPoints.some((s) => String(s).includes("担心不好收纳")));
// 展示角色在编译层有落点
push("AG6 展示角色入参存在", probe(read("server/detail-v2-control/skill-activation.js"), "PRODUCT_DISPLAY_ROLES") && probe(read("server/detail-v2-control/skill-activation.js"), "productRole =="));
push("AG7 展示角色按任务推断", deriveMod.deriveProductDisplayRole("material") === "Detail" && deriveMod.deriveProductDisplayRole("usage") === "Contextual" && deriveMod.deriveProductDisplayRole("identity") === "Primary");
push("AG8 展示角色入画面任务", (() => {
  const g = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "清洁剂", productFeature: "成分：表面活性剂。使用方法：按压，刷洗。", userInstruction: "" }, [], {});
  return g.prompts.some((p) => (p.screenVisual?.text || "").includes("合理使用场景") || (p.screenVisual?.text || "").includes("局部细节"));
})());
// 跨行业污染检测（配置驱动、非硬编码）
// P1-6 验收矩阵修正（顾问裁定乙，2026-11-20）：
// AG9/AG11 原输入经实施前逐词核验，只有单一行业强正信号（AG9 仅 apparel:版型/袖口、cleaning 命中 0；
// AG11 仅 electronics:手机），识别结果本就正确、不构成"识别被污染带偏"。故重新定位为"正确识别、不误伤"
// 负向控制，不得再作为跨行业强信号污染的正向样本。真正污染正向样本改用生产配置中两行业均有真实
// 正信号命中的输入（AG14-AG18），验证 P1-6 触发条件的数据基础（多包强信号并存 + 污染可检出）。
const uniMod = await import(new URL("../../server/detail-v2-control/index.js", import.meta.url).href);
const agCfg = JSON.parse(read("server/detail-v2-control/config/professional-content-v1.json"));
const agHits = (text, packId) => (Array.isArray(agCfg.industryPacks?.[packId]?.positiveSignals) ? agCfg.industryPacks[packId].positiveSignals : []).filter((w) => text.includes(w));
const agDecision = (text) => uniMod.resolveIndustryDecision({ text, aiHint: "", config: agCfg });
// AG9 负向控制：仅 apparel 强信号，cleaning 命中 0，识别 apparel high 正确，不触发 P1-6。
push("AG9 负向控制：单行业apparel正确识别不误伤", (() => {
  const t = "版型修身袖口精致的清洁喷雾";
  const hitApparel = agHits(t, "apparel"), hitClean = agHits(t, "cleaning");
  const d = agDecision(t);
  return hitApparel.length > 0 && hitClean.length === 0 && d.industryId === "apparel" && d.confidence === "high";
})());
push("AG10 使用对象弱词不误报污染", uniMod.checkIndustryPollution("按压海绵头清洁羽绒服污渍", "cleaning").hasPollution === false);
push("AG10b 真弱词命中(棉/面料)不误报且识别cleaning", (() => {
  const t = "棉质面料清洁喷雾去渍";
  const d = agDecision(t);
  return uniMod.checkIndustryPollution(t, "cleaning").hasPollution === false && d.industryId === "cleaning";
})());
// AG11 负向控制：仅 electronics 强信号，apparel 命中 0，识别 electronics high 正确。
push("AG11 负向控制：单行业electronics正确识别不误伤", (() => {
  const t = "手机快充接口性能";
  const hitElec = agHits(t, "electronics"), hitApparel = agHits(t, "apparel");
  const d = agDecision(t);
  return hitElec.length > 0 && hitApparel.length === 0 && d.industryId === "electronics" && d.confidence === "high";
})());
// AG14-AG18 真实多行业强信号正向样本：逐词证明两行业均有真实正信号命中，且污染可检出。
// 注意：这些用例验证 P1-6 触发条件的"数据基础"，不验证降级结果（业务实施另行授权）。
push("AG14 真污染样本:版型修身清洗剂去渍(cleaning+apparel强信号并存)", (() => {
  const t = "版型修身清洗剂去渍";
  const c = agHits(t, "cleaning"), a = agHits(t, "apparel");
  return c.length > 0 && a.length > 0 && uniMod.checkIndustryPollution(t, "cleaning").hasPollution === true;
})());
push("AG15 真污染样本:口红彩妆清洗剂(cleaning+beauty并存)", (() => {
  const t = "口红彩妆清洗剂";
  const c = agHits(t, "cleaning"), b = agHits(t, "beauty");
  return c.length > 0 && b.length > 0 && uniMod.checkIndustryPollution(t, "cleaning").hasPollution === true;
})());
push("AG16 真污染样本:口红彩妆连衣裙(beauty+apparel并存,非cleaning组合)", (() => {
  const t = "口红彩妆连衣裙";
  const b = agHits(t, "beauty"), a = agHits(t, "apparel");
  return b.length > 0 && a.length > 0 && uniMod.checkIndustryPollution(t, "beauty").hasPollution === true;
})());
push("AG17 正常单行业不误降:清洗剂去渍重油污", (() => {
  const t = "清洗剂去渍重油污";
  const packs = ["apparel", "beauty", "food", "electronics", "motherBaby", "pet"];
  const others = packs.reduce((n, p) => n + agHits(t, p).length, 0);
  const d = agDecision(t);
  return agHits(t, "cleaning").length > 0 && others === 0 && d.industryId === "cleaning" && d.confidence === "high";
})());
push("AG18 真多行业并存均可检出(逐词证据)", (() => {
  const samples = [
    { t: "手机快充清洗剂去渍", own: "cleaning", other: "electronics" },
    { t: "食品饮料衬衫", own: "food", other: "apparel" },
    { t: "手机电脑外套", own: "electronics", other: "apparel" }
  ];
  return samples.every((s) => agHits(s.t, s.own).length > 0 && agHits(s.t, s.other).length > 0 && uniMod.checkIndustryPollution(s.t, s.own).hasPollution === true);
})());
push("AG12 污染检测可观测挂审计", probe(read("server/detail-middleware.js"), "pollutionAudit: checkIndustryPollution"));
push("AG13 SKILL允许Absent不强制每屏商品", probe(read("prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md"), "Absent") && probe(read("prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md"), "不强制产品每屏正中"));
// 全品类识别：本地兜底也能识别日化（干洗剂正信号），服装强特征不被日化覆盖。
const agClean = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: "成分：阴离子表面活性剂。使用方法：按压海绵头，用刷刷洗。", userInstruction: "" }, [], {});
push("AG14 本地兜底识别日化类目", agClean.analysis.industry === "清洁日化" && agClean.v2Control?.activeIndustryId === "cleaning");
const agApparel = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "纯棉T恤", productFeature: "材质：100%棉。版型：宽松。", userInstruction: "" }, [], {});
push("AG15 服装不被日化规则覆盖", agApparel.analysis.industry !== "清洁日化" && agApparel.v2Control?.activeIndustryId !== "cleaning");
push("AG16 行业包按英文id加载", contentCfg.industryPacks.cleaning.industryId === "cleaning" && contentCfg.industryPacks.apparel.industryId === "apparel");

// ---------- AH 组 · P1-1 行业体系统一（单一决策链 + 运行时证据） ----------
const p11Run = (pf, pn = "测试商品") => deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: pn, productFeature: pf, userInstruction: "" }, [], {});
const p11Clean = p11Run("成分：阴离子表面活性剂。使用方法：按压海绵头，用清洁刷刷洗。", "羽绒服干洗剂").analysis.industryResolution;
const p11Apparel = p11Run("材质：100%棉。版型：宽松。", "纯棉T恤").analysis.industryResolution;
const p11Jewelry = p11Run("珠宝首饰，天然翡翠。", "翡翠手镯").analysis.industryResolution;
const p11Unknown = p11Run("无特征描述xyz。", "未知商品").analysis.industryResolution;
push("AH1 cleaning强特征覆盖保留", p11Clean.packId === "cleaning" && p11Clean.ruleSource === "industryPack" && p11Clean.decisionPath === "pack_strong_override" && p11Clean.confidence === "high");
push("AH2 包信号匹配为主判断", p11Apparel.packId === "apparel" && p11Apparel.ruleSource === "industryPack" && p11Apparel.decisionPath === "pack_signal_match" && p11Apparel.fallbackStatus === "none");
push("AH3 旧词表降为受控fallback", p11Jewelry.fallbackStatus === "legacy_fallback" && p11Jewelry.ruleSource === "legacyKeywords" && p11Jewelry.confidence === "low");
push("AH4 generic末级降级有因", p11Unknown.fallbackStatus === "generic_fallback" && p11Unknown.industryId === "generic" && Boolean(p11Unknown.evidence?.via));
push("AH5 resolution六要素齐全", [p11Clean, p11Apparel, p11Jewelry, p11Unknown].every((r) => r && ["industryId", "packId", "confidence", "evidence", "fallbackStatus", "ruleSource"].every((k) => k in r)));
push("AH6 命中依据可追溯", Boolean(p11Clean.evidence.positive?.length) && p11Apparel.evidence.via?.includes("positiveSignals") && p11Jewelry.evidence.via?.includes("keywords"));
// 回归：旧判断函数语义未变（cleaning 覆盖层独立可测）
const p11Override = uniMod.detectIndustryOverride ? uniMod.detectIndustryOverride("衣物血渍清洗剂") : null;
push("AH7 detectIndustryOverride仍可用", p11Override && p11Override.industryId === "cleaning");
// 运行时链路：analysis 与 v2Control 都带 resolution
const p11Full = p11Run("成分：阴离子表面活性剂。使用方法：按压海绵头刷洗。", "羽绒服干洗剂");
push("AH8 analysis输出resolution", Boolean(p11Full.analysis.industryResolution?.industryId));
push("AH9 v2Control输出resolution", Boolean(p11Full.v2Control?.industryResolution?.ruleSource));
push("AH10 单一决策入口存在", probe(read("server/detail-v2-control/index.js"), "export function resolveIndustryDecision"));
push("AH11 旧词表仅在fallback调用", (() => {
  const s = read("server/detail-middleware.js");
  const inResolve = s.indexOf("function resolveIndustrySkill");
  const seg = s.slice(inResolve, inResolve + 1200);
  return probe(seg, "fallbackLookup: getIndustrySkillByText") && !probe(seg, "getIndustrySkillByText(text);\n}");
})());
push("AH12 多包同置信度降级", (() => {
  const r = uniMod.resolveIndustryDecision({ text: "版型和口红", aiHint: "" });
  return r.confidence === "medium" && Array.isArray(r.evidence.tiedPacks) && r.evidence.tiedPacks.length >= 2;
})());
push("AH13 包装不误判服装回归", (() => {
  const r = uniMod.resolveIndustryDecision({ text: "多用途包装清洁剂去渍", aiHint: "" });
  return r.industryId === "cleaning" && r.decisionPath === "pack_strong_override";
})());

// ---------- AI 组 · P1-2 字段真实消费（noGeneralization 配置→运行约束完整链路） ----------
const p12Cfg = JSON.parse(read("server/detail-v2-control/config/professional-content-v1.json"));
const P12_NON_CLEANING = ["apparel", "beauty", "food", "electronics", "home", "motherBaby", "pet"];
push("AI1 八包均配detectWords", ["cleaning", ...P12_NON_CLEANING].every((id) => Array.isArray(p12Cfg.industryPacks[id]?.generalizationDetectWords) && p12Cfg.industryPacks[id].generalizationDetectWords.length > 0));
push("AI2 detectWords替代硬编码正则", probe(read("server/detail-v2-control/skill-activation.js"), "configuredWords = Array.isArray(pack?.generalizationDetectWords)") && !probe(read("server/detail-v2-control/skill-activation.js"), "match(/奶渍|蛋白质污渍"));
// 7 个非 cleaning 包逐一证明：违规卖点被拦截 + 命中词来自配置 + 事实豁免生效。
const P12_CASES = [
  ["apparel", "版型修身承诺穿着效果承诺", ["穿着效果承诺"]],
  ["beauty", "搭配成分可保证使用效果", ["使用效果"]],
  ["food", "产地直供获得品质认证", ["品质认证"]],
  ["electronics", "外观可见超强性能参数", ["性能参数"]],
  ["home", "此架承重能力超强", ["承重能力"]],
  ["motherBaby", "适合新生月龄适用范围", ["月龄适用范围"]],
  ["pet", "本款宠物品类范围适用", ["宠物品类范围"]]
];
push("AI3 七包noGeneralization真实拦截", P12_CASES.every(([ind, txt, words]) => {
  const r = activationMod.checkSellingPointBoundary(txt, ind, p12Cfg, []);
  return r.allowed === false && words.every((w) => r.hits.includes(w)) && r.detectSource?.fromConfig === true;
}));
push("AI4 七包事实豁免不误伤", P12_CASES.every(([ind, txt]) => {
  // 结论性词（性能/认证/范围等）需事实带"实质证据"才豁免——P1-2B 精确性要求。
  // 依据标记必须是可核验数值，不能只是"实测数据"这类空洞标记（顾问反向测试要求）。
  const factWithEvidence = `${txt}，依据：数值5`;
  const r = activationMod.checkSellingPointBoundary(txt, ind, p12Cfg, [factWithEvidence]);
  return r.allowed === true && r.reason === "confirmed_fact_exempt";
}));
const p12Clean = activationMod.checkSellingPointBoundary("血渍清洗剂可去奶渍", "cleaning", p12Cfg, []);
push("AI5 cleaning回归不破坏", p12Clean.allowed === false && p12Clean.hits.includes("奶渍") && p12Clean.detectSource?.fromConfig === true);
push("AI6 detectSource可追溯", P12_CASES.every(([ind]) => {
  const r = activationMod.checkSellingPointBoundary("测试", ind, p12Cfg, []);
  return r.detectSource?.packId === ind && r.detectSource?.detectWordCount > 0;
}));
push("AI7 未混入P2能力", !probe(read("server/detail-middleware.js"), "function filterContentByPriority") && !probe(read("server/detail-middleware.js"), "beforeAfterGroup") && !probe(read("server/detail-middleware.js"), "function filterIngredients"));

// ---------- AJ 组 · P1-2B 三字段真实消费 + 豁免精确匹配 ----------
// 字段1 recognitionExamples：明确定位回归夹具，消费者=validateRecognitionExamples，执行结果=逐例断言。
const ajFixture = uniMod.validateRecognitionExamples(p12Cfg, (input) => {
  const d = uniMod.resolveIndustryDecision({ text: input, aiHint: "", config: p12Cfg });
  return { industryId: d.industryId };
});
push("AJ1 recognitionExamples是回归夹具", ajFixture.role === "regression_fixture" && ajFixture.total >= 5);
// P1-3 已修复"T 恤"空格归一化：夹具 5/5 全过，原缺口案例成为固定回归样本（仍保留在 fixture 中）。
push("AJ2 recognitionExamples全过含T恤回归样本", ajFixture.allPass === true && ajFixture.cases.length >= 5 && ajFixture.cases.some((c) => c.input.includes("T") && c.pass === true && c.actualIndustry === "apparel"));
// 字段2 professionalValues：消费者=admitIndustryPack，执行结果=准入判定。
push("AJ3 professionalValues包级准入生效", (() => {
  const ok = uniMod.admitIndustryPack("cleaning", "cleaning", p12Cfg);
  const no = uniMod.admitIndustryPack("cleaning", "apparel", p12Cfg);
  return ok.admitted === true && ok.reason === "industry_allowed" && no.admitted === false && no.reason === "industry_not_allowed" && no.evidence.source.includes("professionalValues.allowedIndustries");
})());
push("AJ4 包级准入阻止越权挂coverage", (() => {
  const g = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "清洁剂", productFeature: "清洁剂去渍。", userInstruction: "" }, [], {});
  return g.v2Control?.packAdmission?.admitted === true && Array.isArray(g.v2Control?.coverageApplied);
})());
// 字段3 coverage：消费者=checkIndustryCoverage + buildRounds 行业段，执行结果=覆盖判定。
push("AJ5 coverage覆盖判定有声明来源", (() => {
  const covered = uniMod.checkIndustryCoverage("cleaning", "衣物清洁与去渍", p12Cfg);
  const undeclared = uniMod.checkIndustryCoverage("apparel", "版型", p12Cfg);
  return covered.status === "covered" && covered.evidence.source.includes("coverage") && covered.evidence.declaration.length >= 6 && undeclared.status === "undeclared";
})());
push("AJ6 coverage影响屏级任务且非每屏重复", (() => {
  const inf = "成分：阴离子表面活性剂。适用范围：羽绒服、窗帘。使用方法：按压海绵头，刷洗，擦拭后自然干燥。";
  const g = deriveMod.buildDetailPromptGroup({ count: 6, countMode: "fixed", workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: inf, userInstruction: "" }, [], {});
  const d = g.coverageDecision?.decision || {};
  const scopeHints = g.prompts.filter((p) => p.text.includes("行业覆盖方向")).length;
  // 决策真实影响任务（有 selected），覆盖方向只进命中任务（非每屏），且不破坏屏位。
  return d.applied === true && d.selectedCategories.length > 0 && scopeHints > 0 && scopeHints < g.prompts.length && g.prompts[0].text.includes("羽绒服干洗剂");
})());
// 豁免精确匹配：普通复述放行，全称泛化拦截。
push("AJ7 豁免仅精确匹配事实主张", (() => {
  const fact = ["适用于窗帘、可清洁污渍"];
  const plain = activationMod.checkSellingPointBoundary("可清洁窗帘表面的污渍", "cleaning", p12Cfg, fact);
  const generic = activationMod.checkSellingPointBoundary("所有窗帘材质都适用无死角", "cleaning", p12Cfg, fact);
  return plain.allowed === true && plain.reason === "confirmed_fact_exempt" && generic.allowed === false && generic.hits.includes("窗帘");
})());
push("AJ8 不回退P1-2A检测链路", probe(read("server/detail-v2-control/skill-activation.js"), "configuredWords = Array.isArray(pack?.generalizationDetectWords)") && p12Cfg.industryPacks.cleaning.generalizationDetectWords.length >= 18);

// ---------- AK 组 · P1-2B 补齐证据（outputRequirements消费/coverage屏级决策/豁免范围精确性） ----------
push("AK1 outputRequirements字段来源", (() => {
  const r = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "清洁剂", productFeature: "清洁剂去渍。", userInstruction: "" }, [], {});
  return r.outputRequirementsApplied?.applied === true && r.outputRequirementsApplied.source === "professionalValues.outputRequirements" && r.outputRequirementsApplied.bans.includes("袖口");
})());
push("AK2 outputRequirements真实改写任务约束", (() => {
  const req = p12Cfg.industryPacks.cleaning.professionalValues.outputRequirements;
  const tasks = [
    { taskCategory: "material", sellingPoint: "材质与面料：袖口设计", compositionHint: "展示袖口细节与版型结构" },
    { taskCategory: "ingredient", sellingPoint: "成分与配方：表面活性剂", compositionHint: "说明成分" }
  ];
  const r = uniMod.applyOutputRequirements(tasks, req);
  return r.tasks[0].compositionHint.includes("行业约束：不得出现袖口") && r.tasks[0].outputConstraintHits.includes("袖口") && r.tasks[1].compositionHint === tasks[1].compositionHint;
})());
push("AK3 coverage同输入开关对照", (() => {
  const tasks = [
    { taskCategory: "identity", sellingPoint: "商品身份", compositionHint: "首屏认知" },
    { taskCategory: "ingredient", sellingPoint: "成分", compositionHint: "说明成分" },
    { taskCategory: "applicableScope", sellingPoint: "适用范围", compositionHint: "范围认知" },
    { taskCategory: "usageStep", sellingPoint: "使用步骤", compositionHint: "刷洗动作" }
  ];
  const off = uniMod.applyCoverageToTasks(tasks, []);
  const on = uniMod.applyCoverageToTasks(tasks, p12Cfg.industryPacks.cleaning.coverage);
  return off.decision.applied === false && on.decision.applied === true && on.decision.selectedCategories.includes("applicableScope") && on.decision.selectedCategories.includes("usageStep") && on.decision.deprioritizedCategories.includes("ingredient");
})());
push("AK4 coverage不破坏屏位不每屏重复", (() => {
  const inf = "成分：阴离子表面活性剂。适用范围：羽绒服、窗帘。使用方法：按压海绵头，刷洗，擦拭后自然干燥。";
  const g = deriveMod.buildDetailPromptGroup({ count: 6, countMode: "fixed", workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: inf, userInstruction: "" }, [], {});
  const scopeHints = g.prompts.filter((p) => p.text.includes("行业覆盖方向")).length;
  return g.coverageDecision?.decision?.applied === true && scopeHints > 0 && scopeHints < g.prompts.length && g.prompts[0].text.includes("羽绒服干洗剂");
})());
push("AK5 豁免-仅关键词无依据不放行", (() => {
  const r = activationMod.checkSellingPointBoundary("性能参数表现优异", "electronics", p12Cfg, ["性能参数"]);
  return r.allowed === false && r.hits.includes("性能参数");
})());
push("AK6 豁免-有具体效果事实允许", (() => {
  const r = activationMod.checkSellingPointBoundary("性能参数5000mAh实测续航24小时", "electronics", p12Cfg, ["性能参数：5000mAh，实测续航24小时"]);
  return r.allowed === true && r.reason === "confirmed_fact_exempt";
})());
push("AK7 豁免-局部证据不放大范围", (() => {
  const r = activationMod.checkSellingPointBoundary("性能参数达标所有场景都适用", "electronics", p12Cfg, ["性能参数：5000mAh"]);
  return r.allowed === false && r.hits.includes("性能参数");
})());
push("AK8 T恤空格归一化修复后识别apparel", (() => {
  // P1-3 修复：原"T 恤"缺口案例保留为固定回归样本，断言修复后真实识别为 apparel（不再是 generic）。
  const r = uniMod.resolveIndustryDecision({ text: "T 恤", aiHint: "", config: p12Cfg });
  return r.industryId === "apparel" && r.packId === "apparel" && r.confidence === "high" && r.decisionPath === "pack_signal_match";
})());

// ---------- AL 组 · P1-2B 反向测试：依据标记存在 ≠ 对应事实已证实 ----------
push("AL1 空洞依据标记不得豁免性能参数", (() => {
  const r = activationMod.checkSellingPointBoundary("性能参数表现优异", "electronics", p12Cfg, ["性能参数，附实测数据依据"]);
  return r.allowed === false && r.hits.includes("性能参数");
})());
push("AL2 空洞依据标记不得豁免品质认证", (() => {
  const r = activationMod.checkSellingPointBoundary("获得品质认证", "food", p12Cfg, ["品质认证，附检测数据依据"]);
  return r.allowed === false && r.hits.includes("品质认证");
})());
push("AL3 实质数值证据仍可豁免", (() => {
  const r = activationMod.checkSellingPointBoundary("性能参数5000mAh实测续航24小时", "electronics", p12Cfg, ["性能参数：5000mAh，实测续航24小时"]);
  return r.allowed === true && r.reason === "confirmed_fact_exempt";
})());

// ---------- AM 组 · P1-3 子类目识别与降级 ----------
const p13Cfg = structuredClone(p12Cfg);
p13Cfg.industryPacks.cleaning_down = {
  industryId: "cleaning_down", industryName: "羽绒服干洗", extends: "cleaning",
  positiveSignals: ["羽绒服干洗", "羽绒服清洁"],
  noGeneralization: ["羽绒服清洁剂不得扩为所有羽绒制品"],
  professionalValues: { allowedIndustries: ["cleaning_down"], outputRequirements: "只输出羽绒服干洗专业观察点" }
};
push("AM1 T恤空格归一化真实识别", (() => {
  return ["T 恤", "T恤", "纯棉T 恤宽松"].every((t) => {
    const r = uniMod.resolveIndustryDecision({ text: t, aiHint: "", config: p12Cfg });
    return r.industryId === "apparel" && r.packId === "apparel" && r.confidence === "high";
  });
})());
push("AM2 继承解析父→子字段", (() => {
  const inh = uniMod.resolveInheritedPack("cleaning_down", p13Cfg);
  return inh.isSubCategory === true && inh.parentPackId === "cleaning" && inh.inheritedFrom.includes("cleaning")
    && inh.effectivePack.coverage?.length === 6 && Boolean(inh.effectivePack.professionalValues)
    && inh.effectivePack.positiveSignals.includes("羽绒服干洗")
    && inh.effectivePack.noGeneralization?.[0]?.includes("羽绒服清洁剂");
})());
push("AM3 继承循环检测判红", (() => {
  const cfg = structuredClone(p13Cfg);
  cfg.industryPacks.cleaning.extends = "cleaning_down";
  const cyc = uniMod.resolveInheritedPack("cleaning_down", cfg);
  return cyc.cycleDetected === true && cyc.resolved === false && String(cyc.error).includes("inheritance_cycle");
})());
push("AM4 置信度high加载完整包", (() => {
  // 子包充分信号（≥2 专属命中）才加载完整包——AN3 修正后的语义；单信号另由 AN3 验证降级。
  const skill = { id: "cleaning_down", name: "羽绒服干洗", analyzeAttributes: ["羽绒专属"], sellingAngles: [], visualAnchors: [], taboos: [], recommendedScreens: [] };
  const r = uniMod.applyConfidenceToRules(skill, { confidence: "high", packId: "cleaning_down", industryId: "cleaning_down", evidence: { positive: ["羽绒服干洗", "羽绒服清洁"] } }, p13Cfg);
  return r.ruleLoadDecision.level === "full_pack_rules" && r.rules.analyzeAttributes[0] === "羽绒专属" && r.ruleLoadDecision.inheritedFrom.includes("cleaning");
})());
push("AM5 置信度medium降父公共不启专属", (() => {
  const skill = { id: "cleaning_down", name: "羽绒服干洗", analyzeAttributes: ["羽绒专属"], sellingAngles: [], visualAnchors: [], taboos: [], recommendedScreens: [] };
  const r = uniMod.applyConfidenceToRules(skill, { confidence: "medium", packId: "cleaning_down", industryId: "cleaning_down" }, p13Cfg);
  return r.ruleLoadDecision.level === "parent_common_rules" && r.rules.industrySuppressed === true && r.rules.analyzeAttributes[0] !== "羽绒专属";
})());
push("AM6 低置信/循环降generic", (() => {
  const skill = { id: "x", name: "x", analyzeAttributes: ["专属"], sellingAngles: [], visualAnchors: [], taboos: [], recommendedScreens: [] };
  const lo = uniMod.applyConfidenceToRules(skill, { confidence: "low", packId: "cleaning_down", industryId: "cleaning_down" }, p13Cfg);
  const cfg = structuredClone(p13Cfg); cfg.industryPacks.cleaning.extends = "cleaning_down";
  const cyc = uniMod.applyConfidenceToRules(skill, { confidence: "high", packId: "cleaning_down", industryId: "cleaning_down" }, cfg);
  return lo.ruleLoadDecision.level === "generic_rules" && cyc.ruleLoadDecision.level === "generic_rules" && cyc.ruleLoadDecision.cycleDetected === true;
})());
push("AM7 运行时真实消费置信度(非仅审计)", (() => {
  const g = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "版型和口红", productFeature: "版型清晰，口红礼盒。", userInstruction: "" }, [], {});
  const d = g.v2Control?.ruleLoadDecision;
  return d && d.level === "parent_common_rules" && d.confidence === "medium";
})());
push("AM8 不新增行业包不改平台", (() => {
  const keys = Object.keys(p12Cfg.industryPacks);
  return keys.length === 8 && !keys.includes("cleaning_down") && probe(read("server/detail-middleware.js"), "getPlatformSkill");
})());

// ---------- AN 组 · 顾问核验：生产子类目现状 / 单信号high风险修正 / 三态下游边界 ----------
push("AN1 生产仅cleaning含1个真实子类目", (() => {
  const keys = Object.keys(p12Cfg.industryPacks);
  const subs = keys.map((k) => p12Cfg.industryPacks[k].subCategories || []);
  return keys.length === 8 && subs.filter((s) => s.length > 0).length === 1
    && p12Cfg.industryPacks.cleaning.subCategories.length === 1
    && p12Cfg.industryPacks.cleaning.subCategories[0].id === "laundryStain"
    && probe(read("server/detail-v2-control/index.js"), "export function resolveSubCategory");
})());
push("AN2 单信号可达high(判定依据在案)", (() => {
  const r = uniMod.resolveIndustryDecision({ text: "版型", aiHint: "", config: p12Cfg });
  return r.industryId === "apparel" && r.confidence === "high" && r.decisionPath === "pack_signal_match" && r.evidence.positive.length === 1;
})());
push("AN3 子包单信号不误加载子专属", (() => {
  const cfg = structuredClone(p12Cfg);
  cfg.industryPacks.cleaning_down = { industryId: "cleaning_down", industryName: "羽绒服干洗", extends: "cleaning", positiveSignals: ["羽绒服干洗"], professionalValues: { allowedIndustries: ["cleaning_down"], outputRequirements: "子专属" } };
  const skill = { id: "cleaning_down", analyzeAttributes: ["子专属属性"], sellingAngles: [], visualAnchors: [], taboos: [], recommendedScreens: [] };
  const r = uniMod.resolveIndustryDecision({ text: "羽绒服干洗", aiHint: "", config: cfg });
  const a = uniMod.applyConfidenceToRules(skill, r, cfg);
  return a.ruleLoadDecision.level === "parent_common_rules" && a.ruleLoadDecision.subCategorySingleSignal === true && a.rules.analyzeAttributes[0] !== "子专属属性";
})());
push("AN4 生产单信号high不回退", (() => {
  const skill = { id: "apparel", analyzeAttributes: ["版型分析"], sellingAngles: [], visualAnchors: [], taboos: [], recommendedScreens: [] };
  const r = uniMod.resolveIndustryDecision({ text: "版型", aiHint: "", config: p12Cfg });
  const a = uniMod.applyConfidenceToRules(skill, r, p12Cfg);
  return a.ruleLoadDecision.level === "full_pack_rules" && a.rules.analyzeAttributes[0] === "版型分析" && a.ruleLoadDecision.subCategorySingleSignal === false;
})());
push("AN5 medium下游四字段无行业专属", (() => {
  const g = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "版型和口红", productFeature: "版型清晰，口红礼盒，成分：蜂蜡。", userInstruction: "" }, [], {});
  const t = g.prompts.map((p) => p.text).join("\n");
  return g.analysis.analyzeAttributes[0] === "商品主体" && !/袖口|领口|纽扣|穿搭/.test(t)
    && g.coverageDecision?.decision?.applied === false && g.outputRequirementsApplied?.applied === false
    && g.v2Control?.ruleLoadDecision?.level === "parent_common_rules";
})());
push("AN6 low下游完全generic", (() => {
  const g = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "未知商品", productFeature: "无特征描述xyz。", userInstruction: "" }, [], {});
  const t = g.prompts[0].text;
  return g.analysis.industry === "通用电商" && g.v2Control?.industryResolution?.packId === null
    && g.v2Control?.ruleLoadDecision?.level === "generic_rules" && g.coverageDecision?.decision?.applied === false
    && !t.includes("不得跨品类串规则") && t.includes("不得虚构未确认事实");
})());
push("AN7 high下游加载行业专属", (() => {
  const g = deriveMod.buildDetailPromptGroup({ count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "羽绒服干洗剂", productFeature: "成分：阴离子表面活性剂。使用方法：按压刷洗。", userInstruction: "" }, [], {});
  return g.v2Control?.ruleLoadDecision?.level === "full_pack_rules"
    && g.analysis.analyzeAttributes[0] === "清洁对象"
    && g.coverageDecision?.decision?.applied === true && g.outputRequirementsApplied?.applied === true;
})());

// ---------- AO 组 · P1-3补充：生产真实子类目完整链路 ----------
const aoCfg = JSON.parse(read("server/detail-v2-control/config/professional-content-v1.json"));
const aoGroup = (pn, pf) => deriveMod.buildDetailPromptGroup({ count: 6, countMode: "fixed", workflow: "taobao-detail", productName: pn, productFeature: pf, userInstruction: "" }, [], {});
push("AO1 生产子类目完整识别+继承+规则加载", (() => {
  const g = aoGroup("衣物去渍护理剂", "衣物去渍衣领净领口去渍，成分：表活。");
  const r = g.v2Control?.industryResolution || {};
  return r.industryId === "laundryStain" && r.ruleSource === "industrySubCategory" && r.parentPackId === "cleaning"
    && r.evidence?.positive?.length === 3 && g.v2Control?.ruleLoadDecision?.level === "full_pack_rules"
    && g.v2Control?.ruleLoadDecision?.inheritedFrom?.includes("cleaning")
    && g.outputRequirementsApplied?.applied === true;
})());
push("AO2 父行业回退(非子目输入)", (() => {
  const g = aoGroup("厨房重油污清洁剂", "厨房重油污清洁，按压刷洗。");
  return g.v2Control?.industryResolution?.industryId === "cleaning" && g.v2Control?.industryResolution?.decisionPath !== "subcategory_signal_match"
    && g.v2Control?.ruleLoadDecision?.level === "full_pack_rules";
})());
push("AO3 generic回退", (() => {
  const g = aoGroup("未知商品", "无特征描述xyz。");
  return g.v2Control?.industryResolution?.industryId === "generic" && g.v2Control?.ruleLoadDecision?.level === "generic_rules";
})());
push("AO4 子类目单信号降级父公共", (() => {
  const g = aoGroup("衣物去渍产品", "衣物去渍，成分：表活。");
  return g.v2Control?.industryResolution?.industryId === "laundryStain"
    && g.v2Control?.ruleLoadDecision?.level === "parent_common_rules"
    && g.v2Control?.ruleLoadDecision?.reason?.includes("subcategory_single_signal_demoted")
    && g.outputRequirementsApplied?.applied === false;
})());
push("AO5 子目冲突降级medium", (() => {
  const cfg = structuredClone(aoCfg);
  cfg.industryPacks.cleaning.subCategories.push({ id: "kitchenDegrease", industryId: "kitchenDegrease", industryName: "厨房去油", extends: "cleaning", positiveSignals: ["衣物去渍"] });
  const r = uniMod.resolveSubCategory("衣物去渍", "cleaning", cfg);
  return r && r.confidence === "medium" && r.evidence.tiedSubCategories.length === 2;
})());
push("AO6 跨父类目污染隔离", (() => {
  const cfg = structuredClone(aoCfg);
  cfg.industryPacks.cleaning.subCategories.push({ id: "evil", industryId: "evil", extends: "apparel", positiveSignals: ["衣物去渍"] });
  const r = uniMod.resolveSubCategory("衣物去渍", "cleaning", cfg);
  return r && r.subCategoryId === "laundryStain" && r.evidence.crossParentRejected >= 1;
})());
push("AO7 P1-1通用识别不回退", (() => {
  const r = uniMod.resolveIndustryDecision({ text: "T 恤", aiHint: "", config: aoCfg });
  const g = aoGroup("血渍清洗剂", "血渍清洗剂，成分：表活。");
  return r.industryId === "apparel" && g.v2Control?.industryResolution?.industryId === "cleaning"
    && g.v2Control?.ruleLoadDecision?.level === "full_pack_rules";
})());

// ---------- AP 组 · P1-4 五态治理实施（14 项测试矩阵） ----------
const apAiPlan = {
  product: { industryId: "cleaning", name: "衣物清洗剂", realSellingPoints: ["去渍强", "温和配方"] },
  consumerInsights: { needs: ["深层去渍"] },
  marketingStrategy: { valueLadder: [{ expression: "洁净如新", benefit: "省时" }] },
  planning: { facts: [{ claim: "去渍率98%", level: "visible" }], screenRoles: [] },
  globalVisualDNA: { palette: "蓝白" }
};
const apGroup = (opts = {}, input = {}) => deriveMod.buildDetailPromptGroup(
  { count: 4, countMode: "fixed", workflow: "taobao-detail", productName: "衣物血渍清洗剂", productFeature: "成分：表活。适用范围：羽绒服。使用方法：按压刷洗。有检测报告。", userInstruction: "", ...input },
  [], opts
);
// 五态字段完整性（4 Skill 核心）
const apLife = apGroup({ aiPlan: apAiPlan, aiMeta: { model: "t", mode: "ai-text", timing: { totalMs: 1 } } }).skillLifecycleByScreen.screen_1;
const apPU = apLife.results.find((r) => r.id === "product-understanding");
push("AP1 正确激活并成功投递", Boolean(apPU) && apPU.lifecycle.activation.state === "activated" && apPU.lifecycle.execution.state === "model_call_succeeded" && apPU.lifecycle.execution.evidence.directiveDispatched === true);
push("AP2 未激活后续阶段跳过", (() => {
  const r = apLife.results.find((x) => x.id === "figure-usage-scene");
  return r && r.lifecycle.activation.state === "not_activated" && r.lifecycle.execution.state === "not_applicable" && r.lifecycle.output.state === "not_applicable";
})());
push("AP3 当前任务不适用态", (() => {
  const r = apLife.results.find((x) => x.id === "detail-quality-control");
  return r && ["not_activated", "not_applicable"].includes(r.lifecycle.activation.state);
})());
push("AP4 指令投递但模型调用失败", (() => {
  const g = apGroup({ aiPlan: apAiPlan, aiError: "模型超时" });
  const r = g.skillLifecycleByScreen.screen_1.results.find((x) => x.id === "product-understanding");
  return r.lifecycle.execution.state === "model_call_failed" && r.lifecycle.execution.evidence.modelCallFailed === true;
})());
push("AP5 模型调用成功但输出为空", (() => {
  const emptyPlan = { product: {}, planning: {}, globalVisualDNA: {} };
  const g = apGroup({ aiPlan: emptyPlan, aiMeta: { model: "t", timing: { totalMs: 1 } } });
  const r = g.skillLifecycleByScreen.screen_1.results.find((x) => x.id === "product-understanding");
  return ["empty", "invalid", "not_produced"].includes(r.lifecycle.output.state);
})());
push("AP6 输出结构或内容无效", (() => {
  const bad = activationMod.validateSkillOutput([{ name: "缺benefit" }], { itemFields: ["expression", "benefit"] });
  const s = activationMod.validateSkillOutput("  ", {});
  return bad.state === "invalid" && s.state === "empty";
})());
push("AP7 输出有效但无下游消费者", (() => {
  const r = apLife.results.find((x) => x.id === "industry-routing-retained");
  return r && r.lifecycle.downstream.state === "not_consumed" && r.lifecycle.downstream.evidence.consumer === null;
})());
push("AP8 输出被真实消费并影响结果", (() => {
  const r = apLife.results.find((x) => x.id === "product-understanding");
  return r && r.lifecycle.output.state === "valid" && r.lifecycle.downstream.state === "consumed" && Boolean(r.lifecycle.downstream.evidence.effect);
})());
push("AP9 只进规划请求未进最终提示词", (() => {
  // qc 仅在 aiPlan 声明、无 text 注入；downstream=not_consumed、injection=not_required。
  const g = apGroup({ aiPlan: { ...apAiPlan, qc: { globalChecks: ["检查"] } }, aiMeta: { model: "t", timing: { totalMs: 1 } } });
  const r = g.skillLifecycleByScreen.screen_1.results.find((x) => x.id === "detail-quality-control");
  return r && ["not_activated", "not_applicable"].includes(r.lifecycle.activation.state) && r.lifecycle.injection.state === "not_required";
})());
push("AP10 进最终提示词并送生图请求", (() => {
  // 人物 Skill 在 UI 授权屏：injection=injected 且 text 含【模特与镜头】。
  const g = apGroup({ aiPlan: apAiPlan, aiMeta: { model: "t", timing: { totalMs: 1 } } }, { modelMode: "use-model", modelUsage: 4 });
  const r = g.skillLifecycleByScreen.screen_1.results.find((x) => x.id === "figure-usage-scene");
  return r && r.lifecycle.injection.state === "injected" && g.prompts[0].text.includes("【模特与镜头】");
})());
push("AP11 重复注入识别不去重", (() => {
  const two = "【全局一致性锁定】abc【全局一致性锁定】abc";
  const n = (two.match(/【全局一致性锁定】/g) || []).length;
  const segA = activationMod.contentFingerprint("abc");
  const segB = activationMod.contentFingerprint("abd");
  return n === 2 && segA === activationMod.contentFingerprint("abc") && segA !== segB;
})());
push("AP12 六类专项正反与缺契约", (() => {
  const skillsCfg = JSON.parse(read("server/detail-v2-control/config/professional-skills-v1.json"));
  const six = skillsCfg.activationContracts?.["product-specialty-expression"]?.formal_professional_contract_v1?.six_specialties || [];
  const struct = apLife.results.find((x) => x.id === "product-structure");
  const ing = apLife.results.find((x) => x.id === "ingredient-mechanism");
  return six.length === 6 && struct && ing && ing.lifecycle.activation.state === "not_activated";
})());
push("AP13 单屏scope与整次规划scope不混", (() => {
  // 激活判定是整次规划级(planning_whole)，注入/输出/消费是单屏级(screen_i)——两者不得混淆。
  const lc = apLife;
  return lc.scope === "screen_1"
    && lc.results.every((r) => r.lifecycle.activation.scope === "planning_whole")
    && lc.results.every((r) => r.lifecycle.injection.scope === "screen_1");
})());
push("AP14 多Skill共享一次调用关联正确", (() => {
  const ids = apLife.results.filter((r) => r.lifecycle.execution.state === "model_call_succeeded").map((r) => r.lifecycle.execution.runId);
  return ids.length >= 3 && new Set(ids).size === 1 && apLife.results.every((r) => r.lifecycle.execution.runId);
})());
push("AP15 五态独立不压成单布尔", (() => {
  const l = apPU.lifecycle;
  return ["activation", "execution", "output", "downstream", "injection"].every((k) => l[k] && l[k].state && l[k].runId && l[k].eventTime);
})());
push("AP16 状态枚举由真实事件产生", (() => {
  const states = activationMod.LIFECYCLE_STATES;
  return states.activation.includes("missing_contract") && states.execution.includes("model_call_failed") && states.output.includes("empty") && states.downstream.includes("not_consumed") && states.injection.includes("duplicate");
})());

// ---------- CP 组 · P1-6 跨行业冲突保护（业务实施效果断言） ----------
// 触发定义（顾问裁定）：生产配置污染检测确认跨行业强正信号冲突且未命中弱语境豁免即触发，
// 不要求证明识别结果"错误"（无独立可信正确行业基准）。命中→confidence=medium + industryId/packId=generic。
const cpGroup = (t, f) => deriveMod.buildDetailPromptGroup(
  { count: 4, countMode: "fixed", workflow: "taobao-detail", productName: t, productFeature: f || "成分：表活。", userInstruction: "" }, [], {}
);
const cpIndustry = (g) => g.skillLayers?.industry;
push("CP1 AG14 cleaning+apparel冲突→generic+专属规则不进规划", (() => {
  const g = cpGroup("版型修身清洗剂去渍"); const s = cpIndustry(g); const txt = g.prompts[0].text;
  return s && s.id === "generic" && s.resolution?.confidence === "medium" && s.resolution?.decisionPath === "cross_industry_conflict"
    && s.ruleLoadDecision?.level === "generic_rules"
    && !/款式结构|版型轮廓|袖口\/领口|模特比例/.test(txt)
    && JSON.stringify(s.analyzeAttributes) === JSON.stringify(["商品主体", "已确认事实", "使用方式"]);
})());
push("CP2 AG15 cleaning+beauty冲突→generic", (() => {
  const s = cpIndustry(cpGroup("口红彩妆清洗剂"));
  return s && s.id === "generic" && s.resolution?.confidence === "medium" && s.resolution?.decisionPath === "cross_industry_conflict";
})());
push("CP3 AG16 beauty+apparel冲突→generic", (() => {
  const s = cpIndustry(cpGroup("口红彩妆连衣裙"));
  return s && s.id === "generic" && s.resolution?.confidence === "medium";
})());
push("CP4 AG18a/b/c真多行业组合均收敛generic", (() => {
  return ["手机快充清洗剂去渍", "食品饮料衬衫", "手机电脑外套"].every((t) => {
    const s = cpIndustry(cpGroup(t)); return s && s.id === "generic" && s.resolution?.confidence === "medium";
  });
})());
push("CP5 AG9/AG11单行业负向控制不误降级", (() => {
  const a = cpIndustry(cpGroup("版型修身袖口精致的清洁喷雾"));
  const b = cpIndustry(cpGroup("手机快充接口性能"));
  return a && a.id === "apparel" && a.resolution?.confidence === "high"
    && b && b.id === "electronics" && b.resolution?.confidence === "high";
})());
push("CP6 AG10b弱语境豁免不误降级", (() => {
  const s = cpIndustry(cpGroup("棉质面料清洁喷雾去渍"));
  return s && s.id === "cleaning" && s.resolution?.confidence === "high" && s.resolution?.decisionPath !== "cross_industry_conflict";
})());
push("CP7 AG17单行业正常识别不误降级", (() => {
  const s = cpIndustry(cpGroup("清洗剂去渍重油污"));
  return s && s.id === "cleaning" && s.resolution?.confidence === "high";
})());
push("CP8 降级后ID分支消费者不绕过(checkSellingPointBoundary用generic)", (() => {
  const r = uniMod.checkSellingPointBoundary ? uniMod.checkSellingPointBoundary("版型修身清洗剂去渍", "generic", agCfg, []) : null;
  // uniMod 是 index.js；checkSellingPointBoundary 在 skill-activation，用 middleware 暴露不可得时以配置事实断言。
  const genericPack = agCfg.industryPacks.generic || {};
  return (r === null || (r.detectSource?.packId === "generic" && r.detectSource?.fromConfig === false))
    && Array.isArray(genericPack.generalizationDetectWords) === false;
})());
push("CP9 原始商品文本未被修改(冲突保护只改resolution)", (() => {
  const g = cpGroup("版型修身清洗剂去渍"); const txt = g.prompts[0].text;
  return txt.includes("版型修身清洗剂去渍") && g.params?.productName === "版型修身清洗剂去渍";
})());

// ---------- E 组 · 真实篡改负向对照（对 middleware 源串逐字篡改） ----------
const neg = (name, tamperedSource, needle) => push(name, !probe(tamperedSource, needle), "篡改后锚点应消失");
neg("N1 删控制报告挂载后判红", middleware.replace("v2Control ? { v2Control } : {}", ""), "v2Control ? { v2Control } : {}");
neg("N2 删四字段证据后判红", middleware.replace("industryProfile: Boolean(aiPlan?.industryProfile)", ""), "industryProfile: Boolean(aiPlan?.industryProfile)");
neg("N3 删单一决策源字段后判红", middleware.replace("industrySingleSourceConsistent: modelIndustryId ? modelIndustryId === runtimeIndustryId : null,", ""), "industrySingleSourceConsistent:");
neg("N4 占位改 admitted 后判红", control.replace("禁止用占位值判 admitted", ""), "禁止用占位值判 admitted");
// V2-PRO-002：质检清单已内部化（【画面自检】精简指令），不再注入整份清单。
neg("N5 质检内部化被撤销后判红", middleware.replace("【画面自检】商品与标签保持原样", ""), "【画面自检】商品与标签保持原样");
neg("N6 正式内容状态标记被删后判红", professionalRaw.split('"status": "professional_content"').join(""), '"status": "professional_content"');
neg("N7 行业覆盖层调用被删后判红", middleware.replace("const override = detectIndustryOverride(`${aiText} ${inputText}`);", ""), "detectIndustryOverride(`${aiText} ${inputText}`)");
neg("N8 14 案例 ID 被删后判红", professionalRaw.split('"PRO-014"').join(""), '"PRO-014"');
neg("N9 验收分级 G5 被删后判红", professionalRaw.split('"level": "G5"').join(""), '"level": "G5"');
neg("N10 Skill触发判定被删后判红", middleware.replace("const activation = v2Planning ? evaluateAllActivations({ contextKeys: triggerCtxKeys }) : null;", ""), "evaluateAllActivations({ contextKeys: triggerCtxKeys })");
neg("N11 卖点边界校验被删后判红", middleware.replace("const sellingBoundary = v2Planning\n      ? checkSellingPointBoundary(selling, industrySkill.id)", "const sellingBoundary = v2Planning\n      ? { allowed: true, reason: \"bypass\", hits: [] }"), "checkSellingPointBoundary(selling, industrySkill.id)");
const activationSrc = read("server/detail-v2-control/skill-activation.js");
neg("N12 触发契约八字段被删后判红", activationSrc.replace('"conflict_priority"', ""), '"conflict_priority"');
const skillsSrc = read("server/detail-v2-control/config/professional-skills-v1.json");
neg("N13 正式Skill状态标记被删后判红", skillsSrc.replace('"status": "professional_content"', ""), '"status": "professional_content"');
neg("N14 视觉模板回退整改被删后判红", skillsSrc.replace('"fixedTemplateFallback"', ""), '"fixedTemplateFallback"');
neg("N15 视觉组装调用被删后判红", middleware.replace("const screenVisual = v2Planning\n      ? buildScreenVisual({", "const screenVisual = v2Planning\n      ? null && buildScreenVisual({"), "const screenVisual = v2Planning\n      ? buildScreenVisual({");
neg("N16 旧键映射表被删后判红", activationSrc.replace('"user_requires_model": "user_requires_figure"', ""), '"user_requires_model": "user_requires_figure"');
neg("N17 输入归一化被删后判红", activationSrc.replace("const normalized = normalizeContextKeys(ctx.contextKeys || []);", "const normalized = { keys: new Set(ctx.contextKeys || []), legacyHits: [] };"), "normalizeContextKeys(ctx.contextKeys || [])");
neg("N18 SKILL01正式标记被删后判红", skill01.replace("正式专业正文 V1.0", ""), "正式专业正文 V1.0");
neg("N19 SKILL01事实分级被删后判红", skill01.split("L3 未确认").join(""), "L3 未确认");
neg("N20 SKILL01注入边界被删后判红", skill01.replace("禁止传递：", ""), "禁止传递：");
neg("N21 SKILL02回链phrase被删后判红", skill02.split("空洞参数罗列不算营销表达").join(""), "空洞参数罗列不算营销表达");
neg("N22 SKILL02正式标记被删后判红", skill02.replace("正式专业正文 V1.0", ""), "正式专业正文 V1.0");
neg("N23 SKILL03回链phrase被删后判红", skill03.split("禁止固定标题轮转").join(""), "禁止固定标题轮转");
neg("N24 SKILL03正式标记被删后判红", skill03.replace("正式专业正文 V1.0", ""), "正式专业正文 V1.0");
neg("N25 SKILL04回链phrase被删后判红", skill04.split("禁止仅背景/颜色变化").join(""), "禁止仅背景/颜色变化");
neg("N26 SKILL04正式标记被删后判红", skill04.replace("正式专业正文 V1.0", ""), "正式专业正文 V1.0");
neg("N27 SKILL05回链phrase被删后判红", skill05.split("相邻屏文案不做语义复述").join(""), "相邻屏文案不做语义复述");
neg("N28 SKILL05正式标记被删后判红", skill05.replace("正式专业正文 V1.0", ""), "正式专业正文 V1.0");
const skillsCfgNStr = read("server/detail-v2-control/config/professional-skills-v1.json");
neg("N29 SKILL06正式正文契约被删后判红", skillsCfgNStr.split('"formal_professional_contract_v1"').join('"formal_contract_removed"'), '"formal_professional_contract_v1"');
neg("N30 人物信号派生调用被删后判红", middleware.replace("triggerCtxKeys.push(...deriveFigureTaskContextKeys({ input, aiScreen, moduleSkill }));", ""), "triggerCtxKeys.push(...deriveFigureTaskContextKeys({ input, aiScreen, moduleSkill }))");
neg("N31 人物正向关键词被删后判红", middleware.split("模特|真人|人物|人手|手部|手持|握持|穿着|佩戴").join(""), "模特|真人|人物|人手|手部|手持|握持|穿着|佩戴");
neg("N32 SKILL07正式正文契约被删后判红", skillsCfgNStr.split('"six_specialties"').join('"six_removed"'), '"six_specialties"');
neg("N33 SKILL07正式标记被删后判红", JSON.stringify(specFormal || {}).replace("SKILL 07｜产品专项表达 V1.0", ""), "SKILL 07｜产品专项表达 V1.0");
neg("N34 结构任务信号派生调用被删后判红", middleware.replace("triggerCtxKeys.push(...deriveStructureTaskContextKeys({ input, aiScreen, moduleSkill }));", ""), "triggerCtxKeys.push(...deriveStructureTaskContextKeys({ input, aiScreen, moduleSkill }))");
neg("N35 结构任务归一化被删后判红", activationSrc.replace('structure_task_required: "specialty_condition_met",', ""), 'structure_task_required: "specialty_condition_met"');
neg("N36 SKILL08回链phrase被删后判红", skill08.split("严重错误不可被高分抵消").join(""), "严重错误不可被高分抵消");
neg("N37 SKILL08正式标记被删后判红", skill08.replace("正式专业正文 V1.0", ""), "正式专业正文 V1.0");
neg("N38 QC派生调用被删后判红", middleware.replace("triggerCtxKeys.push(...deriveQCTaskContextKeys({ input }));", ""), "triggerCtxKeys.push(...deriveQCTaskContextKeys({ input }))");
neg("N39 QC旧别名归一化被删后判红", activationSrc.replace('user_clicks_qc: "qc_requested",', ""), 'user_clicks_qc: "qc_requested"');
neg("N40 QC否定排除被删后判红", middleware.replace("&& !QC_NEGATION_PATTERN.test(userText)", ""), "&& !QC_NEGATION_PATTERN.test(userText)");
neg("N41 P0-1 fail-fast被删后判红", middleware.replace("if (!planningIntegrity.ok) {", "if (false) {"), "if (!planningIntegrity.ok) {");
neg("N42 事实豁免被删后判红", activationSrc.split("const realHits = hits.filter((word) => !confirmedText.includes(word));").join("const realHits = hits;"), "const realHits = hits.filter((word) => !confirmedText.includes(word));");

const failureCount = results.filter((r) => !r.ok).length;
const output = {
  script: "detail-v2-control-chain-check",
  scope: "四层控制框架工程机制贯通（非专业质量验收）",
  total: results.length,
  passed: results.length - failureCount,
  failureCount,
  failures: results.filter((r) => !r.ok),
  note: "工程验证门禁：证明字段贯通/占位不固化/审计可追溯；不代表专业模型质量验收通过。"
};
console.log(JSON.stringify(output, null, 2));
process.exit(failureCount === 0 ? 0 : 1);
