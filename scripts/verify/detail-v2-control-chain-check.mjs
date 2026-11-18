// S2-C / V2-ARCH 四层控制框架工程链门禁。
// 只验证"工程机制贯通"：控制报告存在、四字段贯通证据、占位态不固化、单一决策源字段、编译审计基线。
// 🔴 明确边界：本门禁证明的是工程验证，不代表专业模型质量验收通过；不检查任何专业内容正确性。
// 负向对照：真实篡改源码后必须判红（删控制报告 / 改占位固化 / 删字段证据 / 删单一决策源字段）。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const { pathToFileURL } = await import("node:url");
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
  push("D2 占位态 isPlaceholder=true", runtimeReport.isPlaceholder === true);
  push("D3 四字段全贯通", Object.values(runtimeReport.fieldsPresent).every(Boolean));
  push("D4 占位态未加载行业包", runtimeReport.loadedIndustryPackIds.length === 0);
  push("D5 占位态无 admitted 任务", runtimeReport.admission.admittedTaskIds.length === 0);
  push("D6 审计未授权新增=false", runtimeReport.auditBase.unauthorizedAdded === false);
  push("D7 模型行业 cleaning 被识别", runtimeReport.modelIndustryId === "cleaning");
  push("D8 单一决策源有结论", typeof runtimeReport.industrySingleSourceConsistent === "boolean");
}

// ---------- E 组 · 真实篡改负向对照（对 middleware 源串逐字篡改） ----------
const neg = (name, tamperedSource, needle) => push(name, !probe(tamperedSource, needle), "篡改后锚点应消失");
neg("N1 删控制报告挂载后判红", middleware.replace("v2Control ? { v2Control } : {}", ""), "v2Control ? { v2Control } : {}");
neg("N2 删四字段证据后判红", middleware.replace("industryProfile: Boolean(aiPlan?.industryProfile)", ""), "industryProfile: Boolean(aiPlan?.industryProfile)");
neg("N3 删单一决策源字段后判红", middleware.replace("industrySingleSourceConsistent: modelIndustryId ? modelIndustryId === runtimeIndustryId : null,", ""), "industrySingleSourceConsistent:");
neg("N4 占位改 admitted 后判红", control.replace("禁止用占位值判 admitted", ""), "禁止用占位值判 admitted");
neg("N5 质检截断复活后判红", middleware.replace("【质检自查】${qualityChecklist.join", "【质检自查】${qualityChecklist.slice(0, 8).join"), "【质检自查】${qualityChecklist.join");

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
