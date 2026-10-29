// V144：AI 画布节点类型体系 + 数据总线 + fail-closed 连线校验 无头验收。
//
// 覆盖：节点注册表（3 个可执行 outfit 类型 + 端口 schema）、isRunnableKind、节点输出种类、
// validateConnection（合法端口放行 / 非法端口拒绝）、validateGraphTypes（运行前整图 fail-closed）、
// 数据总线（nodeOutputImage + collectNodeInputs 按端口归集上游图与提示词）。
//
// 全部 import 真实源码（nodes/data-bus/workflow 皆零 import 叶子），不起服务、不联网、不扣费。
// 用法：node scripts/verify/ai-canvas-nodes-check.mjs

import {
  getNodeDef,
  isRunnableKind,
  nodeOutputKind,
  validateConnection,
  OUTFIT_NODE_ORDER,
  OUTFIT_NODE_KINDS
} from "../../src/features/ai-canvas/ai-canvas-nodes.js";
import { nodeOutputImage, collectNodeInputs, imageForPort } from "../../src/features/ai-canvas/ai-canvas-data-bus.js";
import { validateGraphTypes, planWorkflowRuns } from "../../src/features/ai-canvas/ai-canvas-workflow.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// —— 1) 节点注册表：3 个可执行 outfit 类型 ——
check("OUTFIT_NODE_ORDER 为 3 个（换装/改色/精修），且全部 runnable",
  OUTFIT_NODE_ORDER.length === 3 &&
  OUTFIT_NODE_ORDER.every((t) => OUTFIT_NODE_KINDS[t]?.runnable === true),
  OUTFIT_NODE_ORDER.join(","));

// —— 2) 各 outfit 类型的端口 schema / workflowMode ——
const tryon = getNodeDef("outfit-tryon");
const recolor = getNodeDef("outfit-recolor");
const retouch = getNodeDef("outfit-retouch");
check("outfit-tryon：workflowMode=outfit，含 model/clothing/prompt 三输入端口 + imageRoles",
  tryon?.workflowMode === "outfit" &&
  tryon?.inputs.map((p) => p.port).join(",") === "model,clothing,prompt" &&
  tryon?.imageRoles?.model === "model" && tryon?.imageRoles?.clothing === "clothing",
  JSON.stringify(tryon?.imageRoles));
check("outfit-recolor：workflowMode=recolor，含 model/color/prompt 三输入端口",
  recolor?.workflowMode === "recolor" &&
  recolor?.inputs.map((p) => p.port).join(",") === "model,color,prompt",
  recolor?.inputs.map((p) => p.port).join(","));
check("outfit-retouch：workflowMode=white-refine，含 model/prompt 两输入端口",
  retouch?.workflowMode === "white-refine" &&
  retouch?.inputs.map((p) => p.port).join(",") === "model,prompt",
  retouch?.inputs.map((p) => p.port).join(","));

// —— 3) isRunnableKind：outfit + generation 可执行，基础节点不可 ——
check("isRunnableKind：outfit-tryon / generation 可运行，image / prompt 不可",
  isRunnableKind("outfit-tryon") && isRunnableKind("generation") &&
  !isRunnableKind("image") && !isRunnableKind("prompt"));

// —— 4) 节点输出种类：outfit 节点输出 image（可连到 generation/result 下游）——
check("nodeOutputKind('outfit-tryon') === 'image'（可被生成/结果节点消费）",
  nodeOutputKind("outfit-tryon") === "image");

// —— 5) validateConnection：合法端口放行 ——
check("连线放行：image → outfit-tryon(model)",
  validateConnection("image", "outfit-tryon", "model").ok);
check("连线放行：image → outfit-tryon(clothing)",
  validateConnection("image", "outfit-tryon", "clothing").ok);
check("连线放行：prompt → outfit-tryon(prompt)",
  validateConnection("prompt", "outfit-tryon", "prompt").ok);
check("连线放行：generation(图) → outfit-tryon(model)（上游生成结果也能当图1）",
  validateConnection("generation", "outfit-tryon", "model").ok);
check("连线放行：outfit-tryon(out) → generation(in)（换装结果喂下一轮生成）",
  validateConnection("outfit-tryon", "generation", "in").ok);

// —— 6) validateConnection：非法端口拒绝（fail-closed 核心）——
check("连线拒绝：image → outfit-tryon(prompt)（图接到提示词端口）",
  !validateConnection("image", "outfit-tryon", "prompt").ok);
check("连线拒绝：prompt → outfit-tryon(model)（提示词接到图端口）",
  !validateConnection("prompt", "outfit-tryon", "model").ok);
check("连线拒绝：未知目标类型",
  !validateConnection("image", "不存在的类型", "model").ok);

// —— 7) validateGraphTypes：合法整图放行 ——
const goodGraph = {
  nodes: [
    { id: "m", type: "image", data: { src: "x" } },
    { id: "c", type: "image", data: { src: "y" } },
    { id: "t", type: "outfit-tryon", data: { prompt: "", status: "idle" } },
    { id: "g", type: "generation", data: { status: "idle" } }
  ],
  edges: [
    { from: "m", to: "t", toPort: "model" },
    { from: "c", to: "t", toPort: "clothing" },
    { from: "t", to: "g", toPort: "in" }
  ]
};
const goodCheck = validateGraphTypes(goodGraph.nodes, goodGraph.edges);
check("validateGraphTypes：合法图放行（image→tryon→generation）",
  goodCheck.ok, goodCheck.reason);

// —— 8) validateGraphTypes：非法整图拒绝（图接到提示词端口）——
const badGraph = {
  nodes: [
    { id: "m", type: "image", data: { src: "x" } },
    { id: "t", type: "outfit-tryon", data: { prompt: "", status: "idle" } }
  ],
  edges: [{ from: "m", to: "t", toPort: "prompt" }]
};
const badCheck = validateGraphTypes(badGraph.nodes, badGraph.edges);
check("validateGraphTypes：非法图拒绝（image→tryon.prompt）",
  !badCheck.ok, badCheck.reason);

// —— 9) planWorkflowRuns：outfit 节点进入可执行集合 ——
const plan = planWorkflowRuns(goodGraph.nodes, goodGraph.edges);
check("planWorkflowRuns：runnable 含 outfit-tryon 与 generation（按拓扑序）",
  plan.runnable.join(",") === "t,g" && plan.cycle.length === 0,
  `runnable=${plan.runnable}`);

// —— 10) 数据总线：nodeOutputImage 取选中版 ——
check("nodeOutputImage：result 节点取 src", nodeOutputImage({ data: { src: "s" } }) === "s");
check("nodeOutputImage：生成/outfit 节点取 resultUrl", nodeOutputImage({ data: { resultUrl: "r" } }) === "r");
check("nodeOutputImage：无图返回 null", nodeOutputImage({ data: {} }) === null);

// —— 11) 数据总线：collectNodeInputs 按端口归集上游图 + 提示词 ——
const busCurrent = {
  nodes: [
    { id: "m", type: "image", data: { src: "data:model" } },
    { id: "c", type: "image", data: { src: "data:cloth" } },
    { id: "p", type: "prompt", data: { text: "提示词A" } },
    { id: "t", type: "outfit-tryon", data: { prompt: "换成红色连衣裙", status: "idle" } }
  ],
  edges: [
    { from: "m", to: "t", toPort: "model" },
    { from: "c", to: "t", toPort: "clothing" },
    { from: "p", to: "t", toPort: "prompt" }
  ]
};
const collected = collectNodeInputs(busCurrent, busCurrent.nodes[3]);
check("collectNodeInputs：按端口归集 model+clothing 两张上游图",
  collected.imageInputs.length === 2 &&
  collected.imageInputs.some((i) => i.port === "model" && i.url === "data:model") &&
  collected.imageInputs.some((i) => i.port === "clothing" && i.url === "data:cloth"),
  JSON.stringify(collected.imageInputs.map((i) => i.port)));
check("collectNodeInputs：节点自身 prompt 优先于上游 prompt 文本",
  collected.promptText === "换成红色连衣裙", collected.promptText);
check("imageForPort：缺端口回落到第一张图",
  imageForPort(collected.imageInputs, "nope") === "data:model");

// —— 12) 数据总线：上游已成功的 outfit 节点输出可被下游生成节点消费 ——
const chained = {
  nodes: [
    { id: "t", type: "outfit-tryon", data: { status: "success", resultUrl: "http://r/t.png" } },
    { id: "g", type: "generation", data: { status: "idle" } }
  ],
  edges: [{ from: "t", to: "g", toPort: "in" }]
};
check("数据总线：上游 outfit 成功结果（resultUrl）被下游生成节点当输入图",
  nodeOutputImage(chained.nodes[0]) === "http://r/t.png");

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
