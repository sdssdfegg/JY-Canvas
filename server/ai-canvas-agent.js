// server/ai-canvas-agent.js
// V143 MVP-3 / MVP-5：AI 无限画布 Agent —— 把用户自然语言指令翻译成画布产出。
//
// 为什么不用 tool_calls：全仓检索确认 JY 现有 chat 客户端是**纯 chat/completions**
// （server/core/ai-chat-shared.js 的 postChatCompletion），请求体里没有 functions /
// tool_calls（全仓 `tool_calls` / `function_call` 零命中——见执行单 MVP-3 章节结论）。
// 因此沿用本项目既有 AI 文本族范式（与 server/outfit-quality-ai.js 同构）：
//   response_format: json_object → extractJsonObject 解析 → 结构化规整；
//   上游不支持 JSON 约束时，由 shouldRetryWithoutJsonFormat 剥掉约束重试一次。
//
// 依赖纪律：只 import 零依赖的 core 叶子，不引入 express / 业务路由，
// 便于被路由层复用且不产生循环依赖。
//
// MVP-5：引入**角色分工**（多 Agent）。默认仍是 planner（与 MVP-3 行为逐项一致），
// 新增 prompter 只负责写提示词。角色之间由前端编排器串行协作（先搭图、再写词），
// 不是并发——并发会让第二角色读到还没建好的画布。

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

const DEFAULT_CANVAS_AGENT_MODEL = "gpt-5.6-luna"; // 2026-11-01 上游已下线 gpt-5.4-mini
const CANVAS_AGENT_MODEL_SPEC = { fields: ["agentModel"], fallback: DEFAULT_CANVAS_AGENT_MODEL };
const CANVAS_AGENT_TIMEOUT_MS = 45000;
const MAX_ACTIONS = 12;
const MAX_PROMPTS = 12;
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
  { type: "add_outfit_tryon_node", args: "ref(必填，如 t1), prompt(可选，如 换成图2的连衣裙)" },
  { type: "add_outfit_recolor_node", args: "ref(必填，如 c1), prompt(可选)" },
  { type: "add_outfit_retouch_node", args: "ref(必填，如 w1), prompt(可选)" },
  { type: "set_prompt_text", args: "ref(必填，已有节点代号), text" },
  { type: "connect", args: "from(必填，节点代号), to(必填，节点代号)" },
  { type: "rename_node", args: "ref(必填), name" },
  { type: "delete_node", args: "ref(必填)" }
];

const ACTION_TYPES = ACTION_CONTRACT.map((item) => item.type);

// —— 角色（多 Agent 分工）——
// planner：读指令 + 画布现状 → 图结构动作（MVP-3 的能力，默认角色）。
// prompter：读指令 + 画布现状 → 给节点写提示词文本（MVP-5 新增；不碰图结构）。
export const ROLE_PLANNER = "planner";
export const ROLE_PROMPTER = "prompter";
export const CANVAS_AGENT_ROLES = [ROLE_PLANNER, ROLE_PROMPTER];

export function resolveRole(value) {
  const role = asText(value).toLowerCase();
  return CANVAS_AGENT_ROLES.includes(role) ? role : ROLE_PLANNER;
}

// 中文注释：把画布现状（节点用稳定代号 ref 表示）交给模型。
// 用 ref 而不是真实 id，是因为模型不该也不需要知道内部 id；前端负责 ref→id 解析。
function buildCanvasSnapshotContent(input) {
  const nodes = (Array.isArray(input?.nodes) ? input.nodes : []).slice(0, MAX_NODES_IN_PROMPT);
  const edges = (Array.isArray(input?.edges) ? input.edges : []).slice(0, MAX_EDGES_IN_PROMPT);
  return {
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
    }
  };
}

function buildPlannerContent(input) {
  return [{
    type: "text",
    text: JSON.stringify({
      task: "把用户的自然语言指令翻译成画布动作",
      instruction: asText(input?.instruction),
      ...buildCanvasSnapshotContent(input),
      rules: [
        "只能使用 actionContract 里列出的动作，禁止发明其它动作。",
        "引用已有节点必须用 canvas.nodes 里给出的 ref，不要编造不存在的 ref。",
        "新建节点时必须自己给一个 ref（如 p1、g1），同一条回复里后续的 connect 可以直接用这个 ref。",
        "换装(add_outfit_tryon_node)/改色(add_outfit_recolor_node)/精修(add_outfit_retouch_node) 节点：用对应的 add_outfit_*_node 新增；它们都需图1（人物/主图）输入，换装/改色还要图2（服装/颜色参考）。用 connect 把图片节点连到 outfit 节点（默认落到图1端口），图2 端口由用户手动补连。",
        "不要自动触发生成：生成由用户在生成节点上点「执行生成」，你只负责搭好图和写好提示词。",
        "不确定就少做，宁可只回复一句说明也不要乱改画布。",
        `最多输出 ${MAX_ACTIONS} 个动作。`
      ],
      actionContract: ACTION_CONTRACT,
      outputSchema: {
        reply: "string，30-120字中文，说明你做了什么",
        actions: "array，按执行顺序排列；每条形如 { type, ref?, from?, to?, text?, name?, model? }"
      }
    }, null, 2)
  }];
}

function buildPrompterContent(input) {
  return [{
    type: "text",
    text: JSON.stringify({
      task: "为画布上的节点写/润色生图提示词",
      instruction: asText(input?.instruction),
      ...buildCanvasSnapshotContent(input),
      rules: [
        "只输出提示词文本，不要改画布结构（不增删节点、不连线）。",
        "优先给「生成节点」和「提示词节点」写；用 canvas.nodes 里的 ref 指定写到哪个节点。",
        "提示词用中文，一句话同时说清「换成什么」和「保持什么」，例如：把上装换成图2的红色连衣裙，保持图1的模特脸、发型、姿势、下装和背景不变。",
        "不要写「更美、更好看、更修身」这类空泛形容词，不要重设计版型，不要改变人物身份。",
        "某个节点已经有合适提示词时原样保留，不要为了改而改。",
        `最多输出 ${MAX_PROMPTS} 条。`
      ],
      outputSchema: {
        reply: "string，30-120字中文，说明你写了什么",
        prompts: "array，每条形如 { ref, text }；ref 是节点代号，text 是写好的提示词"
      }
    }, null, 2)
  }];
}

const ROLE_SPEC = {
  [ROLE_PLANNER]: {
    system: [
      "你是静音AI画板「AI 无限画布」的画布助手。",
      "你根据用户指令去新增/修改/连接画布节点，帮助用户搭出一条生图链路。",
      "必须输出严格 JSON，不要 Markdown，不要解释。"
    ].join("\n"),
    buildContent: buildPlannerContent
  },
  [ROLE_PROMPTER]: {
    system: [
      "你是静音AI画板「AI 无限画布」的电商生图提示词专家。",
      "你只负责写/润色节点上的生图提示词，绝不改动画布结构。",
      "提示词要具体到「换成什么」与「保持什么」，避免空泛形容与过度设计。",
      "必须输出严格 JSON，不要 Markdown，不要解释。"
    ].join("\n"),
    buildContent: buildPrompterContent
  }
};

// 中文注释：组装 chat/completions 请求体，低温度保证同一指令的产出尽量稳定。
function buildAgentChatBody(input, withJsonFormat, role) {
  const spec = ROLE_SPEC[role] || ROLE_SPEC[ROLE_PLANNER];
  const body = {
    model: modelName(input, CANVAS_AGENT_MODEL_SPEC),
    temperature: 0.2,
    messages: [
      { role: "system", content: spec.system },
      { role: "user", content: spec.buildContent(input) }
    ]
  };
  if (withJsonFormat) body.response_format = { type: "json_object" };
  return body;
}

// 中文注释：规整模型返回的动作；白名单外的类型直接丢弃，字段统一清洗，保证前端永远拿到稳定结构。
function normalizeCanvasAgentPlan(plan, role) {
  if (role === ROLE_PROMPTER) return normalizePromptPatches(plan);

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
  return { reply: compactPreserveNewlines(plan?.reply, MAX_REPLY), actions, prompts: [], dropped };
}

// 中文注释：规整 prompter 的产出——只留 ref + text，缺一即丢（前端不必再做判空）。
function normalizePromptPatches(plan) {
  const raw = Array.isArray(plan?.prompts) ? plan.prompts : [];
  const prompts = [];
  let dropped = 0;
  raw.slice(0, MAX_PROMPTS).forEach((item) => {
    const ref = asText(item?.ref);
    const text = compactPreserveNewlines(item?.text, MAX_ACTION_TEXT);
    if (!ref || !text) {
      dropped += 1;
      return;
    }
    prompts.push({ ref, text });
  });
  if (raw.length > MAX_PROMPTS) dropped += raw.length - MAX_PROMPTS;
  return { reply: compactPreserveNewlines(plan?.reply, MAX_REPLY), actions: [], prompts, dropped };
}

// 中文注释：主入口；按当前 Key 可用渠道依次请求，成功返回已规整的产出。
async function createCanvasAgentPlan({
  input = {},
  apiKey,
  baseUrls = [],
  timeoutMs = CANVAS_AGENT_TIMEOUT_MS
}) {
  const role = resolveRole(input?.role);
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
          body: buildAgentChatBody(input, mode.withJsonFormat, role),
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

        const plan = normalizeCanvasAgentPlan(extractJsonObject(responseContent(parsed.json), "画布 Agent"), role);
        return {
          ok: true,
          role,
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
