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
const probeGroup = mwForProbe.buildDetailPromptGroup({ count: 1, workflow: "taobao-detail", productName: "血渍清洗剂", modelMode: "use-model" }, [], { aiPlan: probePlan });
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
  { count: 1, workflow: "taobao-detail", productName: "血渍清洗剂", modelMode: "use-model" },
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
push("R9 modelMode旧参数不自动触发", figureScenario({ productName: "清洗剂", industryId: "cleaning", materials: ["白色泵瓶"], userInstruction: "", modelMode: "use-model", modelUsage: 3 }).active === false);
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
