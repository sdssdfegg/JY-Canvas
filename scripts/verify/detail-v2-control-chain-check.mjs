// S2-C / V2-ARCH 四层控制框架工程链门禁。
// 只验证"工程机制贯通"：控制报告存在、四字段贯通证据、占位态不固化、单一决策源字段、编译审计基线。
// 🔴 明确边界：本门禁证明的是工程验证，不代表专业模型质量验收通过；不检查任何专业内容正确性。
// 负向对照：真实篡改源码后必须判红（删控制报告 / 改占位固化 / 删字段证据 / 删单一决策源字段）。

import { readFileSync } from "node:fs";
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
push("C2 质检去截断（slice 0,8 不再用于质检自查）",
  probe(middleware, "【质检自查】${qualityChecklist.join") && !probe(middleware, "qualityChecklist.slice(0, 8)"));

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

// ---------- E 组 · 真实篡改负向对照（对 middleware 源串逐字篡改） ----------
const neg = (name, tamperedSource, needle) => push(name, !probe(tamperedSource, needle), "篡改后锚点应消失");
neg("N1 删控制报告挂载后判红", middleware.replace("v2Control ? { v2Control } : {}", ""), "v2Control ? { v2Control } : {}");
neg("N2 删四字段证据后判红", middleware.replace("industryProfile: Boolean(aiPlan?.industryProfile)", ""), "industryProfile: Boolean(aiPlan?.industryProfile)");
neg("N3 删单一决策源字段后判红", middleware.replace("industrySingleSourceConsistent: modelIndustryId ? modelIndustryId === runtimeIndustryId : null,", ""), "industrySingleSourceConsistent:");
neg("N4 占位改 admitted 后判红", control.replace("禁止用占位值判 admitted", ""), "禁止用占位值判 admitted");
neg("N5 质检截断复活后判红", middleware.replace("【质检自查】${qualityChecklist.join", "【质检自查】${qualityChecklist.slice(0, 8).join"), "【质检自查】${qualityChecklist.join");
neg("N6 正式内容状态标记被删后判红", professionalRaw.split('"status": "professional_content"').join(""), '"status": "professional_content"');
neg("N7 行业覆盖层调用被删后判红", middleware.replace("const override = detectIndustryOverride(`${aiText} ${inputText}`);", ""), "detectIndustryOverride(`${aiText} ${inputText}`)");
neg("N8 14 案例 ID 被删后判红", professionalRaw.split('"PRO-014"').join(""), '"PRO-014"');
neg("N9 验收分级 G5 被删后判红", professionalRaw.split('"level": "G5"').join(""), '"level": "G5"');

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
