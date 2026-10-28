// server/ai-canvas-agent.js
// V143 MVP-3（AI 无限画布 Agent）：把用户的自然语言指令翻译成画布动作。
//
// 为什么不用 tool_calls：全仓检索确认 JY 现有 chat 客户端是**纯 chat/completions**
// （server/core/ai-chat-shared.js 的 postChatCompletion），请求体里没有 functions /
// tool_calls（全仓 `tool_calls` / `function_call` 零命中——见执行单 MVP-3 章节结论）。
// 因此沿用本项目既有 AI 文本族范式（与 server/outfit-quality-ai.js 同构）：
//   response_format: json_object → extractJsonObject 解析 → 结构化规整；
//   上游不支持 JSON 约束时，由 shouldRetryWithoutJsonFormat 剥掉约束重试一次。
//
// 依赖纪律：只 import 零依赖叶子 ./core/http-client.js 与 ./core/ai-chat-shared.js，
// 不引入 express / 业务路由，便于被路由层复用且不产生循环依赖。

import { createAbortSignal } from "./core/http-client.js";
import {
  asText,
  compactPreserveNewlines,
  extractJsonObject,
  modelName,
  postChatCompletion,
  responseContent,
  shouldRetryWithoutJsonFormat
} from "./core/ai-chat-shared.js";

const DEFAULT_CANVAS_AGENT_MODEL = "gpt-5.4-mini";
const CANVAS_AGENT_MODEL_SPEC = { fields: ["agentModel"], fallback: DEFAULT_CANVAS_AGENT_MODEL };
const CANVAS_AGENT_TIMEOUT_MS = 45000;
const MAX_ACTIONS = 12;
const MAX_ACTION_TEXT = 1500;
const MAX_REPLY = 400;
const MAX_NODES_IN_PROMPT = 60;
const MAX_EDGES_IN_PROMPT = 120;

// 动作契约：与前端 src/features/ai-canvas/ai-canvas-agent.js 的 CANVAS_AGENT_ACTION_TYPES
// 必须一一对应。服务端只负责把契约写进提示词；真正的判活由前端再做一次 fail-closed 校验
// （白名单外的动作即使返回了也不会落到画布上）。
const ACTION_CONTRACT = [
  { type: "add_prompt_node", args: "ref(必填，新节点代号，如 p1), text(提示词文本)" },
  { type: "add_generation_node", args: "ref(必填，如 g1), prompt(可选), model(可选)" },
  { type: "set_prompt_text", args: "ref(必填，已有节点代号), text" },
  { type: "connect", args: "from(必填，节点代号), to(必填，节点代号)" },
  { type: "rename_node", args: "ref(必填), name" },
  { type: "delete_node", args: "ref(必填)" }
];

const ACTION_TYPES = ACTION_CONTRACT.map((item) => item.type);

// 中文注释：把画布现状（节点用稳定代号 ref 表示）与用户指令一起交给模型。
// 用 ref 而不是真实 id，是因为模型不该也不需要知道内部 id；前端负责 ref→id 解析。
function buildAgentContent(input) {
  const nodes = (Array.isArray(input?.nodes) ? input.nodes : []).slice(0, MAX_NODES_IN_PROMPT);
  const edges = (Array.isArray(input?.edges) ? input.edges : []).slice(0, MAX_EDGES_IN_PROMPT);
  const payload = {
    task: "把用户的自然语言指令翻译成画布动作",
    instruction: asText(input?.instruction),
    canvas: {
      nodes: nodes.map((node) => ({
        ref: asText(node?.ref),
        type: asText(node?.type),
        label: compactPreserveNewlines(node?.label, 80),
        text: compactPreserveNewlines(node?.text, 400),
        hasImage: Boolean(node?.hasImage)
      })),
      edges: edges
        .map((edge) => ({ from: asText(edge?.from), to: asText(edge?.to) }))
        .filter((edge) => edge.from && edge.to)
    },
    rules: [
      "只能使用 actionContract 里列出的动作，禁止发明其它动作。",
      "引用已有节点必须用 canvas.nodes 里给出的 ref，不要编造不存在的 ref。",
      "新建节点时必须自己给一个 ref（如 p1、g1），同一条回复里后续的 connect 可以直接用这个 ref。",
      "不要自动触发生成：生成由用户在生成节点上点「执行生成」，你只负责搭好图和写好提示词。",
      "不确定就少做，宁可只回复一句说明也不要乱改画布。",
      `最多输出 ${MAX_ACTIONS} 个动作。`
    ],
    actionContract: ACTION_CONTRACT,
    outputSchema: {
      reply: "string，30-120字中文，说明你做了什么",
      actions: "array，按执行顺序排列；每条形如 { type, ref?, from?, to?, text?, name?, model? }"
    }
  };
  return [{ type: "text", text: JSON.stringify(payload, null, 2) }];
}

// 中文注释：组装 chat/completions 请求体，低温度保证同一指令的动作尽量稳定。
function buildAgentChatBody(input, withJsonFormat) {
  const body = {
    model: modelName(input, CANVAS_AGENT_MODEL_SPEC),
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "你是静音AI画板「AI 无限画布」的画布助手。",
          "你根据用户指令去新增/修改/连接画布节点，帮助用户搭出一条生图链路。",
          "必须输出严格 JSON，不要 Markdown，不要解释。"
        ].join("\n")
      },
      { role: "user", content: buildAgentContent(input) }
    ]
  };
  if (withJsonFormat) body.response_format = { type: "json_object" };
  return body;
}

// 中文注释：规整模型返回的动作；白名单外的类型直接丢弃，字段统一清洗，保证前端永远拿到稳定结构。
function normalizeCanvasAgentPlan(plan) {
  const raw = Array.isArray(plan?.actions) ? plan.actions : [];
  const actions = [];
  let dropped = 0;
  raw.slice(0, MAX_ACTIONS).forEach((item) => {
    const type = asText(item?.type);
    if (!ACTION_TYPES.includes(type)) {
      dropped += 1;
      return;
    }
    const action = { type };
    const ref = asText(item?.ref);
    const from = asText(item?.from);
    const to = asText(item?.to);
    const text = compactPreserveNewlines(item?.text, MAX_ACTION_TEXT);
    const prompt = compactPreserveNewlines(item?.prompt, MAX_ACTION_TEXT);
    const name = compactPreserveNewlines(item?.name, 80);
    const model = asText(item?.model);
    if (ref) action.ref = ref;
    if (from) action.from = from;
    if (to) action.to = to;
    if (text) action.text = text;
    if (prompt) action.prompt = prompt;
    if (name) action.name = name;
    if (model) action.model = model;
    actions.push(action);
  });
  if (raw.length > MAX_ACTIONS) dropped += raw.length - MAX_ACTIONS;
  return {
    reply: compactPreserveNewlines(plan?.reply, MAX_REPLY),
    actions,
    dropped
  };
}

// 中文注释：主入口；按当前 Key 可用渠道依次请求，成功返回已规整的动作清单。
async function createCanvasAgentPlan({
  input = {},
  apiKey,
  baseUrls = [],
  timeoutMs = CANVAS_AGENT_TIMEOUT_MS
}) {
  if (!apiKey) throw new Error("缺少 API Key，无法调用画布 Agent");
  if (!asText(input?.instruction)) throw new Error("请先输入要给画布 Agent 的指令");
  const candidates = baseUrls.filter(Boolean);
  if (candidates.length === 0) throw new Error("没有可用的渠道地址");

  const startedAt = Date.now();
  const abort = createAbortSignal(timeoutMs);
  const attempts = [];

  try {
    for (const baseUrl of candidates) {
      for (const mode of [{ withJsonFormat: true }, { withJsonFormat: false }]) {
        const { response, parsed } = await postChatCompletion({
          baseUrl,
          apiKey,
          body: buildAgentChatBody(input, mode.withJsonFormat),
          signal: abort.signal
        });
        const message = parsed.json?.error?.message || parsed.json?.message || parsed.text || `HTTP ${response.status}`;
        attempts.push({
          baseUrl,
          status: response.status,
          ok: response.ok,
          withJsonFormat: mode.withJsonFormat,
          message: String(message).slice(0, 260)
        });

        if (!response.ok && mode.withJsonFormat && shouldRetryWithoutJsonFormat(response.status, message)) continue;
        if (!response.ok) break;

        const plan = normalizeCanvasAgentPlan(extractJsonObject(responseContent(parsed.json), "画布 Agent"));
        return {
          ok: true,
          model: modelName(input, CANVAS_AGENT_MODEL_SPEC),
          usedBaseUrl: baseUrl,
          timing: { totalMs: Date.now() - startedAt },
          attempts,
          ...plan
        };
      }
    }
  } finally {
    abort.dispose();
  }

  const last = attempts[attempts.length - 1];
  throw new Error(last?.message || "画布 Agent 失败");
}

export {
  ACTION_CONTRACT,
  CANVAS_AGENT_MODEL_SPEC,
  DEFAULT_CANVAS_AGENT_MODEL,
  MAX_ACTIONS,
  createCanvasAgentPlan
};
