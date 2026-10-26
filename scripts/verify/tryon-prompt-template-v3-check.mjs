// P1-8 结构化提示词 v3（部位化「保持不变」+ 掩膜区域约束）单元测试。
// 纯进程内，不起服务、不扣模型额度、不碰存储（只 import prompts 层 + src/shared 纯函数）。
//
// 验证要点：
//   1. v3 注册 / 哈希确定性（hash 只取规则文本，不含变量值 ⇒ 变量变而版本标识稳定）；
//   2. 守门：不带合法 outfitIntent ⇒ 提示词逐字不变（P0 生命线护栏）；
//   3. 部位口径与前端唯一实现 outfit-intent.js:434 outfitKeepText **逐字一致**（防口径漂移）；
//   4. 掩膜三态（none / garment / body）各产出预期句，未知值回落 none；
//   5. 渲染后无残留占位符、无空行堆积；变量槽为空时整行删除；
//   6. 正文已有相同保持句时去重，不重复发送同一约束。

import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const importAbs = (rel) => import(pathToFileURL(path.join(repoRoot, rel)).href);

const tpl = await importAbs("prompts/server/outfit-prompt-template.js");
const skill = await importAbs("prompts/server/outfit-skill.js");
const { outfitKeepText } = await importAbs("src/shared/outfit-intent.js");

const failures = [];
function check(name, cond, detail) {
  if (!cond) failures.push(`${name} ${detail || ""}`);
}

const v3 = tpl.resolvePromptTemplate("prompt-template-v3");
check("resolve.v3", !!v3 && v3.version === "prompt-template-v3" && !!v3.text && !!v3.hash);
check("v3.frozen", Object.isFrozen(v3 || {}));
check("v3.hasSlots", v3.text.includes("{{replaceClause}}") && v3.text.includes("{{keepClause}}") && v3.text.includes("{{maskClause}}"));

// ── 哈希：只随规则文本变，不随变量值变 ────────────────────────────────────
check("hash.stable", tpl.computeTemplateHash(v3.text) === v3.hash, "同文本重算须同哈希");
check(
  "hash.independentOfVars",
  tpl.computeTemplateHash(tpl.renderFixRule(v3, { replaceClause: "X", keepClause: "Y", maskClause: "Z" })) !== v3.hash,
  "渲染结果（含变量值）不应等于模板哈希 ⇒ 证明哈希只锁规则文本"
);

// ── 变量槽：部位口径（与前端唯一实现对齐）────────────────────────────────
const vars = (parts, maskMode) =>
  skill.buildOutfitStructureVars({ workflowMode: "outfit", outfitIntent: { parts }, maskMode });

const vUpper = vars(["upper"]);
check("vars.upper.replace", vUpper.replaceClause === "本次只更换图1的上装。", vUpper.replaceClause);
check("vars.upper.keep", vUpper.keepClause === "图1的下装保持不变。", vUpper.keepClause);

const vLower = vars(["lower"]);
check("vars.lower.replace", vLower.replaceClause === "本次只更换图1的下装。", vLower.replaceClause);
check("vars.lower.keep", vLower.keepClause === "图1的上装保持不变。", vLower.keepClause);

const vBoth = vars(["upper", "lower"]);
check("vars.both.noKeep", vBoth.keepClause === "" && vBoth.replaceClause === "本次只更换图1的上装和下装。", JSON.stringify(vBoth));

// 「鞋子不用说」的准确口径：鞋子**不作为保持项出现**（半身图里没有鞋，写了会让模型补一双）。
// 选了鞋子 ⇒ 保持句只由上装/下装构成，绝不含"鞋子"。
const vShoes = vars(["shoes"]);
check("vars.shoes.noShoeInKeep", !vShoes.keepClause.includes("鞋子"), vShoes.keepClause);
const vUpperShoes = vars(["upper", "shoes"]);
check("vars.upperShoes.keepLowerOnly", vUpperShoes.keepClause === "图1的下装保持不变。", vUpperShoes.keepClause);

const vDress = vars(["dress"]);
check("vars.dress.noKeep", vDress.keepClause === "", "选连衣裙时上下装都不写保持不变（一件式，写了自相矛盾）");

// 口径漂移护栏：服务端取值必须与前端 outfitKeepText 逐字相同
for (const parts of [["upper"], ["lower"], ["upper", "lower"], ["shoes"], ["dress"]]) {
  const expected = String(outfitKeepText({ parts }) || "").trim();
  const actual = vars(parts).keepClause;
  check(`keep.aligned[${parts.join("+")}]`, actual === expected, `got:${actual} exp:${expected}`);
}

// ── 掩膜三态 ─────────────────────────────────────────────────────────────
check("mask.default.none", vars(["upper"]).maskMode === "none", "缺省须为 none（沿用已验证兜底，能力加进来但默认不开）");
check("mask.none.clause", vars(["upper"], "none").maskClause.includes("已验证的兜底流程"));
check("mask.garment", vars(["upper"], "garment").maskMode === "garment" && vars(["upper"], "garment").maskClause.includes("服装区域掩膜"));
check("mask.body", vars(["upper"], "body").maskMode === "body" && vars(["upper"], "body").maskClause.includes("人体区域掩膜"));
check("mask.unknown.fallsBack", vars(["upper"], "bogus").maskMode === "none", "未知掩膜模式须回落 none");

// ── 渲染：无残留占位符、空槽整行删除、无空行堆积 ──────────────────────────
const renderedAll = tpl.renderFixRule(v3, vars(["upper"], "garment"));
check("render.hasReplace", renderedAll.includes("本次只更换图1的上装。"));
check("render.hasKeep", renderedAll.includes("图1的下装保持不变。"));
check("render.hasMask", renderedAll.includes("服装区域掩膜"));
check("render.noSlotLeft", !renderedAll.includes("{{"), "渲染后不得残留占位符");
check("render.noBlankRun", !/\n{3,}/.test(renderedAll), "不得出现连续空行");

const renderedEmpty = tpl.renderFixRule(v3, { replaceClause: "", keepClause: "", maskClause: "" });
check("render.emptyNoSlot", !renderedEmpty.includes("{{"));
check("render.emptyNoBlankRun", !/\n{3,}/.test(renderedEmpty));
check("render.emptyShorter", renderedEmpty.length < renderedAll.length, "空槽须整行删除");

const renderedV2 = tpl.renderFixRule(tpl.resolvePromptTemplate("prompt-template-v2"), vars(["upper"]));
check("render.v2Untouched", renderedV2 === tpl.resolvePromptTemplate("prompt-template-v2").text, "无槽模板须原样返回");

// ── 挂载点 withPromptTemplate：守门 + 装配 + 去重 ────────────────────────
const instruction = "让图1模特穿着图2的外套。";
const noIntent = { workflowMode: "outfit", prompt: instruction };
check(
  "gate.noIntentUnchanged",
  skill.withPromptTemplate(noIntent, instruction) === instruction,
  "不带 outfitIntent ⇒ 原样返回（快捷/批量生成/局部回贴/精修等分支零变化）"
);
check(
  "gate.wrongWorkflow",
  skill.withPromptTemplate({ workflowMode: "quick", outfitIntent: { parts: ["upper"] } }, instruction) === instruction,
  "非 outfit workflow ⇒ 原样返回"
);
check(
  "gate.badIntent",
  skill.withPromptTemplate({ workflowMode: "outfit", outfitIntent: { parts: ["nope"] } }, instruction) === instruction,
  "非法 outfitIntent ⇒ 原样返回"
);

const mounted = skill.withPromptTemplate(
  { workflowMode: "outfit", outfitIntent: { parts: ["upper"] } },
  instruction
);
check("mount.prefix", mounted.indexOf("任务：将服装参考图 B") === 0, "固定规则层须在最前");
check("mount.suffix", mounted.endsWith(instruction), "单次任务指令层须在最后");
check("mount.hasKeep", mounted.includes("图1的下装保持不变。"));
check("mount.hasReplace", mounted.includes("本次只更换图1的上装。"));
check("mount.maskNone", mounted.includes("已验证的兜底流程"), "默认掩膜须为 none 兜底句");
check("mount.noSlotLeft", !mounted.includes("{{"));

// 去重：正文已含完全相同的保持句 ⇒ 模板里那一句省略
const dupInstruction = "让图1模特穿着图2的外套。图1的下装保持不变。";
const deduped = skill.withPromptTemplate(
  { workflowMode: "outfit", outfitIntent: { parts: ["upper"] } },
  dupInstruction
);
const keepHits = deduped.split("图1的下装保持不变。").length - 1;
check("dedup.keepOnce", keepHits === 1, `保持句只应出现一次，实际 ${keepHits} 次`);

// 显式指定版本可覆盖默认（v2 无槽 ⇒ 不含部位句）
const forceV2 = skill.withPromptTemplate(
  { workflowMode: "outfit", outfitIntent: { parts: ["upper"] }, prompt_template_version: "prompt-template-v2" },
  instruction
);
check("override.v2", !forceV2.includes("本次只更换图1的上装。") && forceV2.includes("已验证的兜底流程"));

// 非法版本 ⇒ 不挂载
const forceBogus = skill.withPromptTemplate(
  { workflowMode: "outfit", outfitIntent: { parts: ["upper"] }, prompt_template_version: "nope" },
  instruction
);
check("override.bogus", forceBogus === instruction, "未知版本 ⇒ 回落原正文");

if (failures.length) {
  console.error(`❌ tryon-prompt-template-v3-check 失败 ${failures.length} 项：`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("✅ tryon-prompt-template-v3-check 全部通过（v3注册/哈希/部位口径对齐/掩膜三态/守门/去重）");
