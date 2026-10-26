// P1-7 分层 Prompt 模板挂载与版本冻结 单元测试（纯进程内，不起服务、不扣模型额度）。
// 验证：模板注册表解析（命中/未命中/未挂载）、内容哈希确定性、
//       四层装配（空层跳过）+ 🔴 默认不挂载 ⇒ 提示词与历史契约逐字一致、
//       任务创建时冻结 version + hash。
// 注：本单会 import execution.js（→ task-store → app-paths），故沿用 P1-5 的临时沙盒写法
// （import 前设 JINGYIN_RELEASE_ROOT），结束整目录删除 ⇒ 绝不污染用户 data/。

import { fileURLToPath, pathToFileURL } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const importAbs = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

// 🔴 必须早于任何服务端模块 import：app-paths 在 import 期就把 rootDir 固化了。
const sandboxRoot = mkdtempSync(path.join(tmpdir(), "tryon-tpl-check-"));
process.env.JINGYIN_RELEASE_ROOT = sandboxRoot;

const tpl = await importAbs("prompts/server/outfit-prompt-template.js");
const exec = await importAbs("server/ai-tryon/execution.js");
const { readTask } = await importAbs("server/ai-tryon/task-store.js");

const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(`${name} ${detail || ""}`);
}

// ── 注册表解析 ─────────────────────────────────────────────────────────────
check("resolve.null", tpl.resolvePromptTemplate(null) === null);
check("resolve.empty", tpl.resolvePromptTemplate("") === null);
check("resolve.unknown", tpl.resolvePromptTemplate("nope") === null);

const v1 = tpl.resolvePromptTemplate("prompt-template-v1");
const v2 = tpl.resolvePromptTemplate("prompt-template-v2");
check("resolve.v1", !!v1 && v1.version === "prompt-template-v1" && !!v1.text && !!v1.hash);
check("resolve.v2", !!v2 && v2.version === "prompt-template-v2" && !!v2.text && !!v2.hash);
check(
  "template.frozen",
  Object.isFrozen(v1 || {}) && Object.isFrozen(v2 || {}),
  "模板对象须冻结，防运行期篡改版本/哈希"
);

// ── 双分支句固化（E1 结论落点）─────────────────────────────────────────────
check(
  "v1.hasDualBranch",
  !!v1 && v1.text.includes("若当前接口的局部编辑/Mask 已通过实测"),
  "v1 保留未固化双分支句（历史/实验基线）"
);
check(
  "v2.dualBranchRemoved",
  !!v2 && !v2.text.includes("若当前接口的局部编辑/Mask 已通过实测"),
  "v2 不得再残留待定双分支句"
);
check(
  "v2.fallbackBranch",
  !!v2 && v2.text.includes("已验证的兜底流程"),
  "v2 须固化到兜底流程分支（E1：基础换装靠双图输入保身份/非编辑区）"
);
check("v1v2.differ", !!v1 && !!v2 && v1.hash !== v2.hash);

// ── 内容哈希 ───────────────────────────────────────────────────────────────
const h1 = tpl.computeTemplateHash("abc");
const h2 = tpl.computeTemplateHash("abc");
const h3 = tpl.computeTemplateHash("abd");
check("hash.deterministic", h1 === h2);
check("hash.sensitive", h1 !== h3, "文本改动须换哈希（冻结回溯的前提）");
check("hash.len12", typeof h1 === "string" && h1.length === 12, h1);

// ── 四层装配 ───────────────────────────────────────────────────────────────
check("assemble.empty", tpl.assembleLayers({}) === "");
check("assemble.skipEmpty", tpl.assembleLayers({ fixRule: "  " }) === "");
check(
  "assemble.taskOnly",
  tpl.assembleLayers({ taskInstruction: "INSTR" }) === "INSTR",
  "只有单次任务指令层时须原样返回（默认不挂载 = 历史契约）"
);
check(
  "assemble.order",
  tpl.assembleLayers({ fixRule: "A", garmentProfile: "B", modelConstraint: "C", taskInstruction: "D" }) ===
    "A\n\nB\n\nC\n\nD",
  "装配顺序须为 固定规则→服装档案→模特约束→单次指令"
);
check("layers.keys", Array.isArray(tpl.PROMPT_TEMPLATE_LAYERS) && tpl.PROMPT_TEMPLATE_LAYERS.length === 4);
// P1-8：默认挂载版本由 null → v3（用户裁决「往结构化提示词方向靠」）。
// 回滚 = 把该常量改回 null；生效范围由守门收敛到带合法 outfitIntent 的批量换装分支。
check("default.isV3", tpl.DEFAULT_PROMPT_TEMPLATE_VERSION === "prompt-template-v3");
check("versions.listed", tpl.listPromptTemplateVersions().length >= 2);

// ── buildTryOnPrompt：守门护栏（不带 outfitIntent ⇒ 逐字零变化）──────────
const { buildOutfitPrompt } = await importAbs("server/outfit-skill.js");
const plainTask = { model: "tt-image-2.5", workflowMode: "outfit", prompt: "换外套保留下装", options: {} };
const builtDefault = exec.buildTryOnPrompt(plainTask);
const authoritative = buildOutfitPrompt({
  workflowMode: "outfit",
  model: "tt-image-2.5",
  prompt: "换外套保留下装"
});
check(
  "buildTryOnPrompt.gateUnchanged",
  builtDefault.prompt === authoritative,
  `无 outfitIntent 分支须与权威构建逐字一致\n   got: ${JSON.stringify(builtDefault.prompt)}\n   exp: ${JSON.stringify(authoritative)}`
);
check("buildTryOnPrompt.gateNoTemplate", builtDefault.templateVersion === null && builtDefault.templateHash === null);
check("buildTryOnPrompt.hashIsString", typeof builtDefault.hash === "string" && builtDefault.hash.length > 0);

// ── buildTryOnPrompt：显式挂载 v2（须带合法 outfitIntent 才过守门）────────
const intentOptions = { outfitIntent: { parts: ["upper"] } };
const authoritativeWithIntent = buildOutfitPrompt({
  workflowMode: "outfit",
  model: "tt-image-2.5",
  prompt: "换外套保留下装",
  outfitIntent: { parts: ["upper"] }
});
const mounted = exec.buildTryOnPrompt({
  ...plainTask,
  options: intentOptions,
  prompt_template_version: "prompt-template-v2"
});
check("mount.version", mounted.templateVersion === "prompt-template-v2");
check("mount.hash", mounted.templateHash === v2.hash);
check("mount.hasFixRule", mounted.prompt.includes(v2.text), "须含固定规则层全文");
check("mount.hasInstruction", mounted.prompt.includes("换外套保留下装"), "须含单次任务指令层正文");
check("mount.order", mounted.prompt.indexOf(v2.text) === 0, "固定规则层须在最前");
check("layers.shape", mounted.layers && mounted.layers.taskInstruction === authoritativeWithIntent);

// ── 未知版本优雅回落 ──────────────────────────────────────────────────────
const bogus = exec.buildTryOnPrompt({ ...plainTask, prompt_template_version: "v9-bogus" });
check("bogus.notMounted", bogus.templateVersion === null && bogus.templateHash === null);
check("bogus.fallsBack", bogus.prompt === authoritative, "未知版本须回落历史契约，绝不改输出");

// ── 任务创建冻结 version + hash ──────────────────────────────────────────
const frozen = await exec.createTryOnTask({
  task_id: "tryon-tpl-freeze-1",
  idempotency_key: "tpl-freeze-key-1",
  model: "tt-image-2.5",
  prompt_template_version: "prompt-template-v2"
});
check("freeze.taskVersion", frozen.prompt_template_version === "prompt-template-v2", JSON.stringify(frozen));
check("freeze.taskHash", frozen.prompt_template_hash === v2.hash, JSON.stringify(frozen));

const reread = await readTask("tryon-tpl-freeze-1");
check("freeze.persisted", !!reread && reread.prompt_template_hash === v2.hash, "冻结值须真落盘且稳定");

// 未挂载时任务 hash 为 null（不伪造版本）
const noTpl = await exec.createTryOnTask({
  task_id: "tryon-tpl-none-1",
  model: "tt-image-2.5"
});
check("freeze.noneNull", noTpl.prompt_template_version === null && noTpl.prompt_template_hash === null);

// ── 收尾：整沙盒删除 ──────────────────────────────────────────────────────
rmSync(sandboxRoot, { recursive: true, force: true });

if (failures.length) {
  console.error(`❌ tryon-prompt-template-check 失败 ${failures.length} 项：`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("✅ tryon-prompt-template-check 全部通过（注册表/哈希/四层装配/默认零变化/冻结落盘）");
