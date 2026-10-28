// V143 MVP-3（AI 无限画布 Agent）无头验收。
//
// 为什么要有它：Agent 的端到端需要真实 API Key + 可达中转站，浏览器实测成本高、且沙箱跑不了；
// 但「动作白名单是否真拦得住」「ref 代号解析对不对」「服务端契约与前端白名单是否一致」
// 「上游不支持 json_object 时是否真会降级重试」全是纯逻辑，可以也必须无头验证——
// 否则只能靠人眼看，回归没人兜。
//
// 测的是**真实源码**（直接 import src/ 与 server/ 的真实模块），不是把逻辑抄一份再断言自己的抄本
// （那种是"假绿"：源码改了、测试照样全过）。服务端走 fetch 桩，桩只替换网络那一跳，
// 提示词构造 / JSON 解析 / 白名单过滤 / 重试判定全部跑真实代码。

import process from "node:process";
import {
  CANVAS_AGENT_ACTION_TYPES,
  applyCanvasAgentPlan,
  applyPromptPatches,
  buildCanvasSnapshot
} from "../../src/features/ai-canvas/ai-canvas-agent.js";
import { ACTION_CONTRACT, createCanvasAgentPlan, resolveRole } from "../../server/ai-canvas-agent.js";
import { runAgentPipeline } from "../../src/features/ai-canvas/ai-canvas-orchestrator.js";

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// —— 测试替身：只记录被调用了什么，不重实现被测逻辑 ——
function makeNode(id, type, data = {}, box = {}) {
  return { id, type, x: box.x ?? 0, y: box.y ?? 0, w: box.w ?? 240, h: box.h ?? 130, data };
}

function harness() {
  const calls = { addNode: [], addEdge: [], updateNodeData: [], deleteNode: [] };
  let seq = 0;
  return {
    calls,
    handlers: {
      addNode: (n) => calls.addNode.push(n),
      addEdge: (e) => calls.addEdge.push(e),
      updateNodeData: (id, data) => calls.updateNodeData.push({ id, data }),
      deleteNode: (id) => calls.deleteNode.push(id)
    },
    createNode: (type, data, position) => ({ id: `new${(seq += 1)}`, type, x: position.x, y: position.y, w: 240, h: 130, data })
  };
}

// —— 1) 快照：稳定代号 + 字段回退 + 悬空边丢弃 ——
const snapshot = buildCanvasSnapshot(
  [
    makeNode("a", "image", { src: "data:image/png;base64,AAA", name: "模特图" }),
    makeNode("b", "prompt", { text: "换成红色连衣裙" }),
    makeNode("c", "generation", { prompt: "旧提示词" })
  ],
  [
    { id: "e1", from: "a", to: "b" },
    { id: "e2", from: "a", to: "不存在" }
  ]
);
check("快照把节点映射为稳定代号 n1/n2/n3",
  snapshot.nodes.map((item) => item.ref).join(",") === "n1,n2,n3",
  snapshot.nodes.map((item) => item.ref).join(","));
check("图片节点标记为 hasImage", snapshot.nodes[0].hasImage === true);
check("提示词节点读 data.text", snapshot.nodes[1].text === "换成红色连衣裙", snapshot.nodes[1].text);
check("生成节点回退读 data.prompt", snapshot.nodes[2].text === "旧提示词", snapshot.nodes[2].text);
check("连线转成代号，且端点不存在的边被丢弃",
  snapshot.edges.length === 1 && snapshot.edges[0].from === "n1" && snapshot.edges[0].to === "n2",
  JSON.stringify(snapshot.edges));

// —— 2) 动作白名单 fail-closed：白名单外一律不落画布 ——
const baseNodes = [makeNode("a", "prompt", { text: "旧" })];
const h1 = harness();
const out1 = applyCanvasAgentPlan({
  actions: [{ type: "eval_code", ref: "n1" }, { type: "delete_node", ref: "n1" }],
  nodes: baseNodes,
  createNode: h1.createNode,
  handlers: h1.handlers
});
check("白名单外动作被拦下且不执行任何副作用",
  h1.calls.deleteNode.length === 1 && out1.skipped.length === 1,
  `delete=${h1.calls.deleteNode.length} skipped=${out1.skipped.length}`);
check("跳过原因可读（点名动作类型）",
  /不是允许的动作/.test(out1.skipped[0] || ""),
  out1.skipped[0] || "");

// —— 3) 代号解析失败时跳过，不静默乱连 ——
const h2 = harness();
const out2 = applyCanvasAgentPlan({
  actions: [{ type: "connect", from: "n1", to: "n99" }],
  nodes: baseNodes,
  createNode: h2.createNode,
  handlers: h2.handlers
});
check("连线端点代号不存在时不连线",
  h2.calls.addEdge.length === 0,
  `addEdge=${h2.calls.addEdge.length}`);
check("连线失败原因点名两个端点",
  /连线端点不存在/.test(out2.skipped[0] || ""),
  out2.skipped[0] || "");

// —— 4) 新建节点 + 链式连线（新节点代号要能被后续 connect 解析）——
const imageNodes = [makeNode("a", "image", { src: "data:image/png;base64,AAA" })];
const h3 = harness();
const out3 = applyCanvasAgentPlan({
  actions: [
    { type: "add_prompt_node", ref: "p1", text: "换成红色连衣裙" },
    { type: "add_generation_node", ref: "g1", prompt: "保持背景不变", model: "" },
    { type: "connect", from: "n1", to: "g1" },
    { type: "connect", from: "p1", to: "g1" }
  ],
  nodes: imageNodes,
  createNode: h3.createNode,
  handlers: h3.handlers
});
check("新增提示词节点带正确文本",
  h3.calls.addNode[0]?.type === "prompt" && h3.calls.addNode[0]?.data.text === "换成红色连衣裙",
  JSON.stringify(h3.calls.addNode[0]?.data));
check("新增生成节点初始 idle 且带上 prompt",
  h3.calls.addNode[1]?.type === "generation"
    && h3.calls.addNode[1]?.data.prompt === "保持背景不变"
    && h3.calls.addNode[1]?.data.status === "idle",
  JSON.stringify(h3.calls.addNode[1]?.data));
check("新节点代号可被后续连线解析（图片→生成、提示词→生成 都连上）",
  h3.calls.addEdge.length === 2
    && h3.calls.addEdge[0].from === "a"
    && h3.calls.addEdge[0].to === h3.calls.addNode[1].id
    && h3.calls.addEdge[1].from === h3.calls.addNode[0].id,
  JSON.stringify(h3.calls.addEdge));
check("新节点落点不压住现有节点（排在右边界之外）",
  h3.calls.addNode[0].x >= imageNodes[0].x + imageNodes[0].w,
  `x=${h3.calls.addNode[0].x}`);
check("四条动作全部记为已应用",
  out3.applied.length === 4 && out3.skipped.length === 0,
  `applied=${out3.applied.length} skipped=${out3.skipped.length}`);

// —— 5) 修改与删除走对应的 store 动作 ——
const h4 = harness();
applyCanvasAgentPlan({
  actions: [
    { type: "set_prompt_text", ref: "n1", text: "新提示词" },
    { type: "rename_node", ref: "n1", name: "主提示词" }
  ],
  nodes: baseNodes,
  createNode: h4.createNode,
  handlers: h4.handlers
});
check("更新提示词写 data.text",
  h4.calls.updateNodeData[0]?.data.text === "新提示词",
  JSON.stringify(h4.calls.updateNodeData[0]?.data));
check("重命名写 data.name",
  h4.calls.updateNodeData[1]?.data.name === "主提示词",
  JSON.stringify(h4.calls.updateNodeData[1]?.data));

// —— 6) 动作条数上限 ——
const h5 = harness();
const out5 = applyCanvasAgentPlan({
  actions: Array.from({ length: 15 }, () => ({ type: "rename_node", ref: "n1", name: "x" })),
  nodes: baseNodes,
  createNode: h5.createNode,
  handlers: h5.handlers
});
check("超过 12 条上限只执行 12 条",
  h5.calls.updateNodeData.length === 12,
  `实际执行 ${h5.calls.updateNodeData.length}`);
check("超上限给出可读提示",
  out5.skipped.some((item) => /上限/.test(item)),
  out5.skipped.join(" / "));

// —— 7) 前后端契约一致（防止服务端提示词契约与前端白名单静默漂移）——
const serverTypes = ACTION_CONTRACT.map((item) => item.type);
check("服务端动作契约与前端白名单逐项一致",
  serverTypes.join(",") === CANVAS_AGENT_ACTION_TYPES.join(","),
  `server=[${serverTypes}] frontend=[${CANVAS_AGENT_ACTION_TYPES}]`);

// —— 8) 服务端规划器：fetch 桩只替换网络那一跳 ——
const originalFetch = globalThis.fetch;
async function withFetch(stub, fn) {
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
function jsonResponse(status, body) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(body) };
}
function chatBody(content) {
  return { choices: [{ message: { content } }] };
}

const seen = [];
const plan = await withFetch(
  async (url, init) => {
    seen.push({ url, init });
    return jsonResponse(200, chatBody(JSON.stringify({
      reply: "已搭好链路",
      actions: [
        { type: "add_generation_node", ref: "g1", prompt: "换装" },
        { type: "eval_code", ref: "n1" },
        { type: "connect", from: "n1", to: "g1" }
      ]
    })));
  },
  () => createCanvasAgentPlan({
    input: { instruction: "把图连起来生成", nodes: [{ ref: "n1", type: "image" }], edges: [] },
    apiKey: "sk-test",
    baseUrls: ["http://relay.test"]
  })
);
check("Agent 走 chat/completions 并带上 apiKey",
  seen[0]?.url === "http://relay.test/chat/completions"
    && /Bearer sk-test/.test(seen[0]?.init?.headers?.Authorization || ""),
  `${seen[0]?.url} auth=${seen[0]?.init?.headers?.Authorization}`);
const sentBody = JSON.parse(seen[0]?.init?.body || "{}");
check("默认带 response_format: json_object",
  sentBody?.response_format?.type === "json_object",
  JSON.stringify(sentBody?.response_format));
check("提示词里带上了用户指令与画布快照",
  JSON.stringify(sentBody?.messages || []).includes("把图连起来生成")
    && JSON.stringify(sentBody?.messages || []).includes("n1"),
  "");
check("服务端过滤掉白名单外动作（只留 2 条、dropped=1）",
  plan.actions.length === 2 && plan.dropped === 1,
  `actions=${plan.actions.map((item) => item.type).join(",")} dropped=${plan.dropped}`);
check("保留动作的 ref/prompt 字段被带上",
  plan.actions[0]?.type === "add_generation_node"
    && plan.actions[0]?.prompt === "换装"
    && plan.actions[0]?.ref === "g1",
  JSON.stringify(plan.actions[0]));
check("reply 正常带回", plan.reply === "已搭好链路", plan.reply);

// —— 8b) 上游不支持 json_object → 剥掉约束重试一次 ——
const retrySeen = [];
let attempts = 0;
const plan2 = await withFetch(
  async (url, init) => {
    attempts += 1;
    retrySeen.push({ url, init });
    if (attempts === 1) return jsonResponse(400, { error: { message: "unsupported response_format json_object" } });
    return jsonResponse(200, chatBody(JSON.stringify({ reply: "降级后成功", actions: [] })));
  },
  () => createCanvasAgentPlan({
    input: { instruction: "加个提示词", nodes: [], edges: [] },
    apiKey: "sk-test",
    baseUrls: ["http://relay.test"]
  })
);
check("上游不支持 json_object 时剥掉约束重试并成功",
  attempts === 2 && plan2.ok === true && plan2.reply === "降级后成功",
  `attempts=${attempts} reply=${plan2.reply}`);
check("重试那次请求体不再带 response_format",
  JSON.parse(retrySeen[0].init.body).response_format?.type === "json_object"
    && !JSON.parse(retrySeen[1].init.body).response_format,
  `第一次=${JSON.stringify(JSON.parse(retrySeen[0].init.body).response_format)} 第二次=${JSON.stringify(JSON.parse(retrySeen[1].init.body).response_format)}`);

// —— 8c) 模型用 Markdown 代码块包 JSON 时仍能解析 ——
const plan3 = await withFetch(
  async () => jsonResponse(200, chatBody("```json\n{\"reply\":\"带围栏也行\",\"actions\":[]}\n```")),
  () => createCanvasAgentPlan({
    input: { instruction: "加个提示词", nodes: [], edges: [] },
    apiKey: "sk-test",
    baseUrls: ["http://relay.test"]
  })
);
check("模型用 Markdown 代码块包 JSON 时仍能解析", plan3.reply === "带围栏也行", plan3.reply);

// —— 8d) 缺 Key / 缺指令：直接拒绝，不发请求 ——
let fetchCalls = 0;
let noKeyMessage = "";
await withFetch(
  async () => {
    fetchCalls += 1;
    return jsonResponse(200, chatBody("{}"));
  },
  async () => {
    try {
      await createCanvasAgentPlan({ input: { instruction: "x" }, apiKey: "", baseUrls: ["http://relay.test"] });
    } catch (error) {
      noKeyMessage = error?.message || String(error);
    }
  }
);
check("缺少 API Key 时直接拒绝且不发起请求",
  /缺少 API Key/.test(noKeyMessage) && fetchCalls === 0,
  `${noKeyMessage} fetchCalls=${fetchCalls}`);

let noInstructionMessage = "";
await withFetch(
  async () => {
    fetchCalls += 1;
    return jsonResponse(200, chatBody("{}"));
  },
  async () => {
    try {
      await createCanvasAgentPlan({ input: { instruction: "  " }, apiKey: "sk-test", baseUrls: ["http://relay.test"] });
    } catch (error) {
      noInstructionMessage = error?.message || String(error);
    }
  }
);
check("空指令时直接拒绝且不发起请求",
  /请先输入/.test(noInstructionMessage) && fetchCalls === 0,
  `${noInstructionMessage} fetchCalls=${fetchCalls}`);

// —— 9) MVP-5：prompter 角色（只写提示词，不碰图结构）——
const prompterSeen = [];
const prompterPlan = await withFetch(
  async (url, init) => {
    prompterSeen.push({ url, init });
    return jsonResponse(200, chatBody(JSON.stringify({
      reply: "提示词已写好",
      prompts: [
        { ref: "g1", text: "把上装换成图2的红色连衣裙，保持图1的模特脸、发型、姿势、下装和背景不变。" },
        { ref: "n99", text: "写在不存在的节点上" },
        { ref: "g2", text: "" }
      ]
    })));
  },
  () => createCanvasAgentPlan({
    input: { instruction: "换成红色连衣裙", role: "prompter", nodes: [{ ref: "g1", type: "generation" }], edges: [] },
    apiKey: "sk-test",
    baseUrls: ["http://relay.test"]
  })
);
check("prompter 角色被采纳并原样回传", prompterPlan.role === "prompter", prompterPlan.role);
// 契约：服务端只保证「ref 与 text 都非空」——它不该重复实现前端的代号解析；
// ref 指向的节点是否真实存在，由前端 applyPromptPatches 再 fail-closed 校验一次（见用例 10）。
check("prompter 丢掉字段不全的条目（空文本被丢，ref 非空即留给前端判活）",
  prompterPlan.prompts.length === 2
    && prompterPlan.dropped === 1
    && prompterPlan.prompts.every((item) => item.ref && item.text)
    && !prompterPlan.prompts.some((item) => item.ref === "g2"),
  `${JSON.stringify(prompterPlan.prompts)} dropped=${prompterPlan.dropped}`);
check("prompter 不产出任何图结构动作（职责隔离）",
  prompterPlan.actions.length === 0,
  JSON.stringify(prompterPlan.actions));
check("prompter 用提示词专家的系统提示词（与 planner 不同）",
  /提示词专家/.test(JSON.stringify(JSON.parse(prompterSeen[0].init.body).messages)),
  "");
check("未知角色 / 不传角色都回落到 planner（向后兼容 MVP-3）",
  resolveRole(undefined) === "planner" && resolveRole("乱写的角色") === "planner" && resolveRole("PROMPTER") === "prompter",
  `${resolveRole(undefined)} / ${resolveRole("乱写的角色")} / ${resolveRole("PROMPTER")}`);

// —— 10) MVP-5：提示词落盘（生成节点写 prompt，提示词节点写 text）——
const patchNodes = [makeNode("g1", "generation", { prompt: "" }), makeNode("p1", "prompt", { text: "" })];
const ph = harness();
const patchOut = applyPromptPatches({
  prompts: [
    { ref: "n1", text: "生成节点的提示词" },
    { ref: "n2", text: "提示词节点的文本" },
    { ref: "n9", text: "写在不存在的节点上" }
  ],
  nodes: patchNodes,
  handlers: ph.handlers
});
check("提示词写进生成节点的 data.prompt",
  ph.calls.updateNodeData[0]?.data.prompt === "生成节点的提示词",
  JSON.stringify(ph.calls.updateNodeData[0]?.data));
check("提示词写进提示词节点的 data.text",
  ph.calls.updateNodeData[1]?.data.text === "提示词节点的文本",
  JSON.stringify(ph.calls.updateNodeData[1]?.data));
check("代号不存在时跳过且不写入画布",
  ph.calls.updateNodeData.length === 2 && patchOut.skipped.length === 1,
  `written=${ph.calls.updateNodeData.length} skipped=${patchOut.skipped.length}`);

// —— 11) MVP-5：多 Agent 编排（串行两跳，第二跳必须看到新建的节点）——
// 注意：前端调的是**我们自己的路由** /api/ai-canvas-agent，响应形状是
// { ok, role, reply, actions, prompts, dropped }，不是上游 chat/completions 的 choices 形状。
// 桩必须按路由形状返回，否则测的就不是真实链路（曾因桩写错而掩盖了路由漏传 prompts 的真 bug）。
function pipelineFetch(calls) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    if (body.role === "planner") {
      return jsonResponse(200, {
        ok: true, role: "planner", reply: "已搭好生成节点",
        actions: [{ type: "add_generation_node", ref: "g1", prompt: "" }],
        prompts: [], dropped: 0, model: "m", timingMs: 1
      });
    }
    return jsonResponse(200, {
      ok: true, role: "prompter", reply: "已写好提示词", actions: [],
      prompts: [{ ref: "n2", text: "把上装换成红色连衣裙，保持背景不变" }],
      dropped: 0, model: "m", timingMs: 1
    });
  };
}
function pipelineFixture() {
  const h = harness();
  const created = [];
  return {
    harness: h,
    created,
    createNode: (type, data, position) => {
      const node = { id: `c${created.length + 1}`, type, x: position.x, y: position.y, w: 240, h: 130, data };
      created.push(node);
      return node;
    },
    project: { nodes: [makeNode("i1", "image", { src: "data:image/png;base64,AAA" })], edges: [] }
  };
}

const autoCalls = [];
const autoFixture = pipelineFixture();
const autoStages = await withFetch(
  pipelineFetch(autoCalls),
  () => runAgentPipeline({
    instruction: "换成红色连衣裙",
    apiKey: "sk-test",
    project: autoFixture.project,
    createNode: autoFixture.createNode,
    handlers: autoFixture.harness.handlers,
    mode: "auto"
  })
);
check("auto 模式串行跑两个阶段（planner → prompter）",
  autoStages.length === 2 && autoStages[0].role === "planner" && autoStages[1].role === "prompter",
  autoStages.map((stage) => stage.role).join("→"));
check("第二阶段读的是『搭完图之后』的画布（含上一跳新建的节点）",
  (autoCalls[1]?.nodes || []).length === 2,
  `prompter 看到的节点数=${(autoCalls[1]?.nodes || []).length}（应为 1 原有 + 1 新建）`);
check("提示词落到了新建的生成节点上（不是落到旧节点）",
  autoFixture.harness.calls.updateNodeData[0]?.id === "c1"
    && /红色连衣裙/.test(autoFixture.harness.calls.updateNodeData[0]?.data.prompt || ""),
  JSON.stringify(autoFixture.harness.calls.updateNodeData[0]));

const planOnlyCalls = [];
const planFixture = pipelineFixture();
const planStages = await withFetch(
  pipelineFetch(planOnlyCalls),
  () => runAgentPipeline({
    instruction: "搭个图",
    apiKey: "sk-test",
    project: planFixture.project,
    createNode: planFixture.createNode,
    handlers: planFixture.harness.handlers,
    mode: "plan"
  })
);
check("只搭图模式：单阶段且不发 prompter 请求",
  planStages.length === 1 && planStages[0].role === "planner" && planOnlyCalls.length === 1,
  `stages=${planStages.map((s) => s.role).join(",")} calls=${planOnlyCalls.length}`);

const promptOnlyCalls = [];
const promptFixture = pipelineFixture();
const promptStages = await withFetch(
  pipelineFetch(promptOnlyCalls),
  () => runAgentPipeline({
    instruction: "写提示词",
    apiKey: "sk-test",
    project: promptFixture.project,
    createNode: promptFixture.createNode,
    handlers: promptFixture.harness.handlers,
    mode: "prompt"
  })
);
check("只写提示词模式：单阶段且跳过 planner",
  promptStages.length === 1 && promptStages[0].role === "prompter" && promptOnlyCalls[0].role === "prompter",
  `stages=${promptStages.map((s) => s.role).join(",")}`);

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  failures: failed.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
