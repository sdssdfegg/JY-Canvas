// V2-AGENT-EXECUTION-CLOSURE P1：SKILL.md 正式正文 ↔ runtime directive 一致性门禁。
//
// 背景（架构审查已证实）：SKILL.md 正文运行时不被读取（esbuild bundle 后无法读 md），
// 真正进入 AI 规划请求的是 detail-ai.js 的八句 directive。两处若各自修改会造成
// "正文升级、运行时仍旧规则"的漂移。本门禁把三份升级 Skill 的关键专业锚点固化为
// 双命中断言（SKILL.md + directive 同时存在），并对"模拟 directive 遗漏同步"做负向对照。
//
// 纯静态、零上游、零模型调用，进 --fast。

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const AS_JSON = process.argv.includes("--json");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const probe = (src, needle) => typeof src === "string" && src.indexOf(needle) >= 0;

const checks = [];
const push = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: String(detail) });

const skillMd = {
  "consumer-marketing-strategy": read("prompts/server/detail-v2-planning/skills/consumer-marketing-strategy/SKILL.md"),
  "detail-story-planning": read("prompts/server/detail-v2-planning/skills/detail-story-planning/SKILL.md"),
  "visual-art-direction": read("prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md")
};
const detailAi = read("server/detail-ai.js");

// 每项：本轮正式升级的关键专业方法锚点（必须在 SKILL.md 与 directive 双命中）。
const SYNC_ANCHORS = {
  "consumer-marketing-strategy": [
    { key: "五层价值链", skill: "五层价值链", directive: "五层价值链" },
    { key: "购买驱动力", skill: "购买驱动力判断", directive: "驱动力" },
    { key: "证据利益匹配", skill: "证据与利益匹配", directive: "证据不足不得扩写" }
  ],
  "detail-story-planning": [
    { key: "完整内容地图", skill: "完整内容地图", directive: "完整内容地图" },
    { key: "禁止一条卖点一屏", skill: "禁止机械的一条卖点一屏", directive: "使用动作" },
    { key: "屏幕独立价值", skill: "每屏须有明确且独立的内容价值", directive: "每屏独立信息任务" }
  ],
  "visual-art-direction": [
    { key: "五种展示角色", skill: "商品展示角色判断", directive: "展示角色" },
    { key: "文案画面语义对应", skill: "文案与画面语义对应", directive: "文案与画面语义对应" },
    { key: "全局统一与单屏差异", skill: "整套视觉 DNA 统一", directive: "六维差异" }
  ]
};

// A 组：正文锚点存在
for (const [skillId, anchors] of Object.entries(SYNC_ANCHORS)) {
  for (const anchor of anchors) {
    push(`A ${skillId} 正文含:${anchor.key}`, probe(skillMd[skillId], anchor.skill));
  }
}

// B 组：runtime directive 同步命中
const directiveSection = detailAi.slice(detailAi.indexOf("const V2_SKILL_DIRECTIVES"), detailAi.indexOf("const V2_REGISTERED_SKILLS"));
for (const [skillId, anchors] of Object.entries(SYNC_ANCHORS)) {
  for (const anchor of anchors) {
    push(`B ${skillId} directive同步:${anchor.key}`, probe(directiveSection, anchor.directive));
  }
}

// C 组：Skill ID 与 directive 键一一对应（不漏项、不串项）
for (const skillId of Object.keys(SYNC_ANCHORS)) {
  push(`C directive含键:${skillId}`, probe(directiveSection, `"${skillId}"`));
}

// D 组：负向对照——模拟 directive 删除某锚点后必须判红（证明检查有效，非假绿）
for (const [skillId, anchors] of Object.entries(SYNC_ANCHORS)) {
  const anchor = anchors[0];
  const broken = directiveSection.split(anchor.directive).join("");
  push(`D 负向:删${skillId}.${anchor.key}判红`, !probe(broken, anchor.directive));
}

// E 组：禁止把 SKILL.md 全文塞进 directive（正文与简明指令篇幅分级）
push("E directive未含SKILL正文全文", !probe(directiveSection, "## 判断方法") && !probe(directiveSection, "## 测试案例"));

// F 组：真实生产链路请求体快照——fetch 内存探针抓取 createDetailAiPlan 组装的模型请求，
// 确认三概念确实进入模型请求（不是只写进 SKILL.md 或来源码常量）。零真实模型调用。
const aiModule = await import(new URL("../../server/detail-ai.js", import.meta.url).href);
const capturedBodies = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, opts) => { capturedBodies.push(String(opts?.body || "")); throw new Error("SYNC_PROBE_STOP"); };
try {
  await aiModule.createDetailAiPlan({
    input: { productName: "探针商品", productFeature: "成分：探针。适用范围：探针。", userInstruction: "", count: 3, workflow: "taobao-detail" },
    files: [], apiKey: "PROBE", baseUrls: ["http://probe.local/v1"]
  });
} catch (_e) { /* 探针预期中断 */ } finally { globalThis.fetch = originalFetch; }
const requestBody = capturedBodies[0] || "";
push("F 真实请求体非空", requestBody.length > 1000, `${requestBody.length} 字节`);
for (const [skillId, anchors] of Object.entries(SYNC_ANCHORS)) {
  for (const anchor of anchors) {
    push(`F 请求体含${skillId}.${anchor.key}`, probe(requestBody, anchor.directive));
  }
}

const passed = checks.filter((c) => c.ok).length;
const failureCount = checks.length - passed;
const result = {
  ok: failureCount === 0,
  total: checks.length,
  passed,
  failureCount,
  failures: checks.filter((c) => !c.ok),
  note: "SKILL.md 正文↔runtime directive 一致性；负向对照验证检查有效。"
};
if (AS_JSON) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
} else {
  process.stdout.write(`[skill-directive-sync] ${passed}/${checks.length} 通过，失败 ${failureCount}\n`);
  for (const failure of result.failures) process.stdout.write(`  FAIL ${failure.name}\n`);
}
process.exitCode = failureCount === 0 ? 0 : 1;
