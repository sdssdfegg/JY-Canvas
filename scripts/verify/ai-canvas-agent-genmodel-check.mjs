// scripts/verify/ai-canvas-agent-genmodel-check.mjs
// 2026-11-01：验收「画布 Agent 面板新增生图模型 + 渠道下拉，并套用到新建生成节点」。
// 纯逻辑无头验收（applyCanvasAgentPlan 是零 import 叶子，可安全 import）。
import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

let pass = 0;
let fail = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) { pass += 1; }
  else { fail += 1; fails.push(`${name}${detail ? "：" + detail : ""}`); }
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}

const agentSrc = resolve(ROOT, "src/features/ai-canvas/ai-canvas-agent.js");
const orchSrc = resolve(ROOT, "src/features/ai-canvas/ai-canvas-orchestrator.js");
let applyCanvasAgentPlan;
try {
  ({ applyCanvasAgentPlan } = await import(pathToFileURL(agentSrc).href));
  check("可导入 applyCanvasAgentPlan（零 import 叶子）", true);
} catch (err) {
  check("可导入 applyCanvasAgentPlan（零 import 叶子）", false, err?.message || String(err));
}

// 助手：构造一个 createNode / handlers 收集新建节点
function makeHarness() {
  const created = [];
  const createNode = (type, data, pos) => {
    const node = { id: `id-${created.length + 1}`, type, data, x: pos?.x ?? 0, y: pos?.y ?? 0, w: 280, h: 224 };
    created.push(node);
    return node;
  };
  const handlers = { addNode() {}, updateNodeData() {}, addEdge() {}, deleteNode() {} };
  return { created, createNode, handlers };
}

// —— 验收 1：面板指定生图模型 + 渠道 → 新建生成节点带上 ——
{
  const { created, createNode, handlers } = makeHarness();
  applyCanvasAgentPlan({
    actions: [{ type: "add_generation_node", ref: "n1", prompt: "换成红色连衣裙" }],
    nodes: [], createNode, handlers,
    genModel: "banana-2", channel: "silent-pro-line-01"
  });
  const gen = created.find((n) => n.type === "generation");
  check("Agent 新建生成节点存在", Boolean(gen));
  check("生成节点 model = 面板所选 banana-2", gen?.data?.model === "banana-2", `实际=${gen?.data?.model}`);
  check("生成节点 channelId = 面板所选渠道", gen?.data?.channelId === "silent-pro-line-01", `实际=${gen?.data?.channelId}`);
}

// —— 验收 2：面板未选（空）→ 走动作自带 model，渠道为空 ——
{
  const { created, createNode, handlers } = makeHarness();
  applyCanvasAgentPlan({
    actions: [{ type: "add_generation_node", ref: "n1", prompt: "x", model: "tt-image-2" }],
    nodes: [], createNode, handlers,
    genModel: "", channel: ""
  });
  const gen = created.find((n) => n.type === "generation");
  check("未选模型时回退到动作自带 model", gen?.data?.model === "tt-image-2", `实际=${gen?.data?.model}`);
  check("未选渠道时 channelId 为空", gen?.data?.channelId === "", `实际=${gen?.data?.channelId}`);
}

// —— 验收 3：面板模型优先于动作自带 model ——
{
  const { created, createNode, handlers } = makeHarness();
  applyCanvasAgentPlan({
    actions: [{ type: "add_generation_node", ref: "n1", prompt: "x", model: "tt-image-2" }],
    nodes: [], createNode, handlers,
    genModel: "banana-2", channel: "silent-pro-line-01"
  });
  const gen = created.find((n) => n.type === "generation");
  check("面板模型覆盖动作自带 model", gen?.data?.model === "banana-2", `实际=${gen?.data?.model}`);
}

// —— 验收 4：提示词节点不受生图模型 / 渠道影响 ——
{
  const { created, createNode, handlers } = makeHarness();
  applyCanvasAgentPlan({
    actions: [{ type: "add_prompt_node", ref: "n1", text: "提示词内容" }],
    nodes: [], createNode, handlers,
    genModel: "banana-2", channel: "silent-pro-line-01"
  });
  const promptNode = created.find((n) => n.type === "prompt");
  check("提示词节点不含 model", promptNode?.data?.model === undefined, `实际=${JSON.stringify(promptNode?.data)}`);
  check("提示词节点不含 channelId", promptNode?.data?.channelId === undefined);
}

// —— 钉桩 5：orchestrator 透传 genModel / channel 给 applyCanvasAgentPlan ——
{
  const orch = readFileSync(orchSrc, "utf8");
  const passesGen = /applyCanvasAgentPlan\(\{[\s\S]*?genModel[\s\S]*?channel[\s\S]*?\}\)/.test(
    orch.replace(/\/\/.*$/gm, "")
  );
  check("orchestrator 把 genModel / channel 透传给 applyCanvasAgentPlan", passesGen);
  check("orchestrator runAgentPipeline 接受 genModel 参数", /genModel\s*=\s*""/.test(orch));
  check("orchestrator runAgentPipeline 接受 channel 参数", /channel\s*=\s*""/.test(orch));
}

console.log(`\n失败 ${fail} / 共 ${pass + fail} 项`);
if (fail) { console.log("未通过：\n - " + fails.join("\n - ")); process.exit(1); }
