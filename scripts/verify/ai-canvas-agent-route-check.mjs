// V143：AI 无限画布 Agent **路由级**验收（补单元测试够不到的那一层）。
//
// 为什么单独有它：ai-canvas-agent-check.mjs 直接调模块函数，测不到两件事——
//   ① 路由有没有真的挂到 express 上（server/app.js 漏注册的话，那边 43 项照样全绿）；
//   ② 路由响应里字段对不对（prompter 的 prompts 曾漏传，就是栽在这一层）。
// 所以这里起一个最小 express 实例、只挂本路由，用真实 HTTP 打进去，按真实响应断言。
//
// 数据隔离（纪律）：路由会写 generation 日志，必须在 import 之前把
// JINGYIN_RELEASE_ROOT 指到临时沙盒，否则会污染用户真实的 data/。

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const sandbox = mkdtempSync(path.join(tmpdir(), "jy-canvas-agent-route-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

const express = (await import("express")).default;
const { registerAiCanvasAgentRoutes } = await import("../../server/routes/ai-canvas-agent.routes.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// —— 上游 chat/completions 的桩（只替换网络那一跳）——
const upstreamCalls = [];
const originalFetch = globalThis.fetch;
function stubUpstream(handler) {
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({ url, init });
    return handler(JSON.parse(init.body));
  };
}
function chatOk(content) {
  return { status: 200, ok: true, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
}

const app = express();
app.use(express.json({ limit: "1mb" }));
registerAiCanvasAgentRoutes(app);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

async function post(payload) {
  const response = await originalFetch(`${origin}/api/ai-canvas-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

// —— 1) 缺 API Key → 401，且不碰上游 ——
stubUpstream(() => chatOk("{}"));
const noKey = await post({ instruction: "搭个图" });
check("缺少 API Key 返回 401 且给出中文提示",
  noKey.status === 401 && noKey.json?.ok === false && /API Key/.test(noKey.json?.message || ""),
  `${noKey.status} ${noKey.json?.message}`);
check("缺 Key 时不发起上游请求",
  upstreamCalls.length === 0,
  `upstreamCalls=${upstreamCalls.length}`);

// —— 2) 空指令 → 400 ——
const noInstruction = await post({ apiKey: "sk-test", instruction: "   " });
check("空指令返回 400 且给出中文提示",
  noInstruction.status === 400 && noInstruction.json?.ok === false && /请先输入/.test(noInstruction.json?.message || ""),
  `${noInstruction.status} ${noInstruction.json?.message}`);

// —— 3) planner：路由真的把 actions 传回来了 ——
stubUpstream(() => chatOk(JSON.stringify({
  reply: "已搭好链路",
  actions: [
    { type: "add_generation_node", ref: "g1", prompt: "换装" },
    { type: "eval_code", ref: "n1" }
  ]
})));
const planner = await post({
  apiKey: "sk-test",
  instruction: "把图连起来生成",
  role: "planner",
  nodes: [{ ref: "n1", type: "image" }],
  edges: []
});
check("planner 走通路由并返回 ok=true",
  planner.status === 200 && planner.json?.ok === true,
  `${planner.status} ${JSON.stringify(planner.json).slice(0, 160)}`);
check("路由回传 actions 且白名单外的已被服务端滤掉",
  (planner.json?.actions || []).length === 1 && planner.json?.actions?.[0]?.type === "add_generation_node",
  JSON.stringify(planner.json?.actions));
check("路由回传 role", planner.json?.role === "planner", String(planner.json?.role));
check("路由回传 dropped（被滤掉的数量）", planner.json?.dropped === 1, String(planner.json?.dropped));

// —— 4) prompter：prompts 必须原样传回来（这是上次漏传字段的回归闸门）——
stubUpstream(() => chatOk(JSON.stringify({
  reply: "提示词已写好",
  prompts: [{ ref: "g1", text: "把上装换成红色连衣裙，保持背景不变" }]
})));
const prompter = await post({
  apiKey: "sk-test",
  instruction: "换成红色连衣裙",
  role: "prompter",
  nodes: [{ ref: "g1", type: "generation" }],
  edges: []
});
check("prompter 走通路由且 role 回传为 prompter",
  prompter.status === 200 && prompter.json?.role === "prompter",
  `${prompter.status} ${prompter.json?.role}`);
check("🔴 路由必须回传 prompts（否则 prompter 的产出到不了前端）",
  (prompter.json?.prompts || []).length === 1
    && prompter.json?.prompts?.[0]?.ref === "g1"
    && /红色连衣裙/.test(prompter.json?.prompts?.[0]?.text || ""),
  JSON.stringify(prompter.json?.prompts ?? null));

// —— 5) 上游失败 → 非 2xx + ok:false + 可读文案 ——
stubUpstream(() => ({ status: 502, ok: false, text: async () => JSON.stringify({ error: { message: "上游炸了" } }) }));
const failed = await post({ apiKey: "sk-test", instruction: "搭个图" });
check("上游失败时返回非 2xx 且 ok=false",
  failed.status >= 400 && failed.json?.ok === false,
  `${failed.status} ${JSON.stringify(failed.json).slice(0, 120)}`);
check("上游失败时给出中文可读文案（不抛裸错）",
  typeof failed.json?.message === "string" && failed.json.message.length > 0,
  failed.json?.message);

server.close();
globalThis.fetch = originalFetch;
rmSync(sandbox, { recursive: true, force: true });

const failedChecks = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failedChecks.length === 0,
  total: results.length,
  passed: results.length - failedChecks.length,
  failed: failedChecks.length,
  failures: failedChecks.map((item) => ({ name: item.name, detail: item.detail }))
}, null, 2));
if (failedChecks.length > 0) process.exitCode = 1;
