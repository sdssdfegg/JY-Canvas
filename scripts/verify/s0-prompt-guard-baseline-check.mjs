// S0/B5+B6：planning 白名单重建事实 + 两轨质检口径门禁（沙盒 data 根、零上游、零 KEY）。
//
// B5：updateDetailStudioProject 的 planning 分支是「白名单重建」，未列出的子键会被静默丢弃。
//      S1/S2 的新状态字段若不慎放进 planning，会写入成功却读不回来且无报错。本门禁把这个
//      事实钉成行为断言，并给出「新字段一律放顶层」的可执行依据（不改任何持久化结构）。
// B6：现有 checklist.js 的 prompt 维度要求 frozenPrompt 与确定性重编译字节一致（轨 A parity）；
//      若对含手动覆盖的 resolvedPrompt 直接跑会永远判红，若跳过则绕过全部质量约束。
//      本门禁锁定「轨 A 只管编译产物」+「轨 B 独立纯函数覆盖全文校验」两轨分离口径。

import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";

const sandbox = mkdtempSync(path.join(os.tmpdir(), "s0-prompt-guard-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const STORE_SRC = path.join(ROOT, "server", "features", "detail-studio", "store", "project-store.js");
const COPY_SRC = path.join(ROOT, "prompts", "detail-studio", "references", "copywriting.js");
const CHECKLIST_SRC = path.join(ROOT, "prompts", "detail-studio", "quality", "checklist.js");

const { PLANNING_PATCH_KEYS, createDetailStudioProject, updateDetailStudioProject, getDetailStudioProject } =
  await import(pathToFileURL(STORE_SRC).href);
const { validateResolvedPromptText, scanForbiddenWords } = await import(pathToFileURL(COPY_SRC).href);

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}
const has = (h, n) => typeof h === "string" && h.indexOf(n) >= 0;
function done() {
  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "✓" : "✗"} ${r.name}${r.detail ? "  —— " + r.detail : ""}`);
  console.log(`\n[s0-prompt-guard-baseline] ${results.length - failed.length}/${results.length} 通过`);
  console.log(`ok=${failed.length === 0}`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

async function main() {
  const storeSrc = readFileSync(STORE_SRC, "utf8");
  const copySrc = readFileSync(COPY_SRC, "utf8");
  const checklistSrc = readFileSync(CHECKLIST_SRC, "utf8");

  // ── 1) B5：白名单常量与行为回读 ──
  const expected = ["analyze", "appliedOptions", "globalLock", "industryId", "screens", "narrativeSummary", "visualDNA", "frozenPrompts"];
  check("PLANNING_PATCH_KEYS 已导出且为冻结的 8 键", Object.isFrozen(PLANNING_PATCH_KEYS) && PLANNING_PATCH_KEYS.length === 8 && expected.every((k) => PLANNING_PATCH_KEYS.includes(k)));
  check("常量不含未来状态字段（提示新字段应放顶层）", !PLANNING_PATCH_KEYS.includes("promptState") && !PLANNING_PATCH_KEYS.includes("planningJob"));
  check("源码注释明确「白名单重建」事实", has(storeSrc, "白名单重建"));

  const project = await createDetailStudioProject({ name: "s0-prompt-guard-baseline" });
  await updateDetailStudioProject(project.id, {
    planning: {
      screens: [{ id: "s1" }],
      futureState: { marker: "must-not-persist" }
    }
  });
  const after = await getDetailStudioProject(project.id);
  check("白名单内 screens 正常写入", Array.isArray(after.planning.screens) && after.planning.screens.length === 1);
  check("🔴 未知 planning 子键被静默丢弃（B5 事实成立）", after.planning.futureState === undefined);
  check("负向对照·未列出的键确实不在常量里（非恒真断言）", !PLANNING_PATCH_KEYS.includes("futureState"));

  // ── 2) B6：轨 A / 轨 B 分离 ──
  check("轨 A parity 比较的是编译产物 compiled[screen.id]（静态）",
    has(checklistSrc, "compiled[screen.id]") && has(checklistSrc, "fresh !== fp"));
  check("轨 A 未对 resolvedPrompt 做字节一致断言", !has(checklistSrc, "resolvedPrompt"));
  check("轨 B 纯函数已导出", has(copySrc, "export function validateResolvedPromptText"));
  check("轨 B 复用既有禁词扫描器（无第二套词表）", has(copySrc, "scanForbiddenWords(value)"));
  const strippedCopy = copySrc.split("export function validateResolvedPromptText").join("");
  check("负向对照·抹掉导出后轨 B 断言变假", !has(strippedCopy, "export function validateResolvedPromptText"));

  // ── 3) 轨 B 行为：覆盖后仍受确定性约束 ──
  const clean = "商品主体清晰居中，保留呼吸感，材质纹理真实";
  check("正常提示词通过（不误判）", validateResolvedPromptText(clean).ok === true);
  const absolute = validateResolvedPromptText("全网最低价，商品主体清晰");
  check("绝对化禁词命中即拒", absolute.ok === false && absolute.findings.some((f) => f.code === "forbidden_words"));
  const medical = validateResolvedPromptText("具有治疗功效的商品图");
  check("医疗化禁词命中即拒", medical.ok === false && medical.findings.some((f) => f.code === "forbidden_words"));
  check("空文本被拒", validateResolvedPromptText("   ").findings.some((f) => f.code === "empty"));
  check("超长文本被拒", validateResolvedPromptText("a".repeat(60001)).findings.some((f) => f.code === "too_long"));
  check("unconfirmed 事实标记被拒", validateResolvedPromptText(clean + " 分级=unconfirmed").findings.some((f) => f.code === "unconfirmed_fact"));
  check("必含片段缺失被拒", validateResolvedPromptText(clean, { requiredFragments: ["全局一致性锁"] }).findings.some((f) => f.code === "missing_fragment"));

  // 负向对照：旧路径只扫 copy.headline+subcopy，不扫提示词全文；轨 B 必须覆盖全文
  const copyOnlyText = "主文案 副文案";
  check("负向对照·旧 scanForbiddenWords 只看文案字段时无命中", scanForbiddenWords(copyOnlyText).absolute.length === 0);
  const fullPromptWithForbiddenWord = "主文案 副文案｜" + clean + "｜绝对领先";
  check("轨 B 扫全文，禁词无处可躲", validateResolvedPromptText(fullPromptWithForbiddenWord).ok === false
    && scanForbiddenWords(copyOnlyText).absolute.length === 0);
  check("负向对照·正常文本不产生 findings", validateResolvedPromptText(clean).findings.length === 0);

  done();
}

main().catch((err) => {
  console.error("[s0-prompt-guard-baseline] 运行失败：", err && err.message ? err.message : err);
  process.exitCode = 1;
});
