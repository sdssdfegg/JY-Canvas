// src/features/ai-canvas/ai-canvas-agent.js
// V143 MVP-3：AI 无限画布 Agent 的前端侧——快照构建 + 动作 fail-closed 校验与应用。
//
// 判活原则：**白名单外的动作一律不落到画布**。服务端只负责产出动作建议，
// 前端再做一次类型白名单 + ref 可解析性校验，解析不到就跳过并给出可读原因。
//
// 依赖纪律：本文件是零 import 的纯函数叶子（与 ai-canvas-generation.js 同款），
// 网络调用放在 src/api/ai-canvas-agent.js，由视图分别引入，避免跨层依赖。

export const CANVAS_AGENT_ACTION_TYPES = [
  "add_prompt_node",
  "add_generation_node",
  "set_prompt_text",
  "connect",
  "rename_node",
  "delete_node"
];

const MAX_APPLY_ACTIONS = 12;
const MAX_TEXT = 1500;
const MAX_NAME = 80;
const SLOT_STEP_X = 320;
const SLOT_STEP_Y = 160;
const SLOT_PER_COLUMN = 4;

// 中文注释：把真实节点转成带稳定代号（n1、n2…）的快照。
// 用代号而不是真实 id：模型不需要知道内部 id，前端负责代号→id 解析。
export function buildCanvasSnapshot(nodes = [], edges = []) {
  const refById = new Map();
  const snapshotNodes = nodes.map((node, index) => {
    const ref = `n${index + 1}`;
    refById.set(node.id, ref);
    const data = node.data || {};
    return {
      ref,
      type: node.type,
      label: String(data.name || "").slice(0, MAX_NAME),
      text: String(data.text || data.prompt || "").slice(0, 400),
      hasImage: Boolean(data.src || data.url)
    };
  });
  const snapshotEdges = edges
    .map((edge) => ({ from: refById.get(edge.from) || "", to: refById.get(edge.to) || "" }))
    .filter((edge) => edge.from && edge.to);
  return { nodes: snapshotNodes, edges: snapshotEdges };
}

// 中文注释：新节点的落位——贴着现有节点的右边界排布，避免叠在一起。
function slotPosition(nodes, slot) {
  if (!nodes.length) return { x: 40, y: 40 };
  let right = -Infinity;
  let top = Infinity;
  for (const node of nodes) {
    right = Math.max(right, node.x + node.w);
    top = Math.min(top, node.y);
  }
  return {
    x: right + 80 + Math.floor(slot / SLOT_PER_COLUMN) * SLOT_STEP_X,
    y: top + (slot % SLOT_PER_COLUMN) * SLOT_STEP_Y
  };
}

// 中文注释：按白名单把动作应用到画布；createNode 由视图提供（走 store 的 makeNode 生成 id），
// handlers 是 store 动作集合。返回可读的「已应用 / 已跳过」清单供面板展示。
export function applyCanvasAgentPlan({ actions = [], nodes = [], createNode, handlers = {} }) {
  const refToId = new Map();
  nodes.forEach((node, index) => refToId.set(`n${index + 1}`, node.id));

  const applied = [];
  const skipped = [];
  // MVP-5：新建的节点要带出去——第二角色（prompter）需要在「搭完图之后」的画布上写提示词。
  const createdNodes = [];
  let slot = 0;

  const resolveRef = (ref) => refToId.get(String(ref || "").trim()) || null;
  const list = Array.isArray(actions) ? actions : [];

  list.slice(0, MAX_APPLY_ACTIONS).forEach((action, index) => {
    const label = `第 ${index + 1} 条`;
    const type = String(action?.type || "").trim();
    if (!CANVAS_AGENT_ACTION_TYPES.includes(type)) {
      skipped.push(`${label}：不是允许的动作（${type || "空"}）`);
      return;
    }
    const ref = String(action?.ref || "").trim();
    const from = String(action?.from || "").trim();
    const to = String(action?.to || "").trim();
    const text = String(action?.text || "").slice(0, MAX_TEXT);
    const prompt = String(action?.prompt || "").slice(0, MAX_TEXT);

    if (type === "add_prompt_node" || type === "add_generation_node") {
      const isPrompt = type === "add_prompt_node";
      const node = createNode(
        isPrompt ? "prompt" : "generation",
        isPrompt ? { text } : { prompt, model: String(action?.model || ""), status: "idle" },
        slotPosition(nodes, slot)
      );
      slot += 1;
      createdNodes.push(node);
      handlers.addNode?.(node);
      if (ref) refToId.set(ref, node.id);
      applied.push(`新增${isPrompt ? "提示词" : "生成"}节点${ref ? ` ${ref}` : ""}`);
      return;
    }

    if (type === "connect") {
      const fromId = resolveRef(from);
      const toId = resolveRef(to);
      if (!fromId || !toId) {
        skipped.push(`${label}：连线端点不存在（${from || "空"} → ${to || "空"}）`);
        return;
      }
      handlers.addEdge?.({ from: fromId, to: toId });
      applied.push(`连线 ${from} → ${to}`);
      return;
    }

    const id = resolveRef(ref);
    if (!id) {
      skipped.push(`${label}：找不到节点 ${ref || "(空)"}`);
      return;
    }
    if (type === "set_prompt_text") {
      handlers.updateNodeData?.(id, { text });
      applied.push(`更新提示词 ${ref}`);
    } else if (type === "rename_node") {
      handlers.updateNodeData?.(id, { name: String(action?.name || "").slice(0, MAX_NAME) });
      applied.push(`重命名 ${ref}`);
    } else {
      handlers.deleteNode?.(id);
      applied.push(`删除节点 ${ref}`);
    }
  });

  if (list.length > MAX_APPLY_ACTIONS) {
    skipped.push(`超出 ${MAX_APPLY_ACTIONS} 条上限，其余 ${list.length - MAX_APPLY_ACTIONS} 条未执行`);
  }

  return { applied, skipped, createdNodes };
}

// MVP-5：把 prompter 写好的提示词落到节点上。
// 生成节点写 data.prompt，提示词节点写 data.text；代号解析不到或文本为空一律跳过（fail-closed）。
export function applyPromptPatches({ prompts = [], nodes = [], handlers = {} }) {
  const refToId = new Map();
  nodes.forEach((node, index) => refToId.set(`n${index + 1}`, node.id));

  const applied = [];
  const skipped = [];
  const list = Array.isArray(prompts) ? prompts : [];

  list.slice(0, MAX_APPLY_ACTIONS).forEach((patch, index) => {
    const label = `第 ${index + 1} 条`;
    const ref = String(patch?.ref || "").trim();
    const text = String(patch?.text || "").trim().slice(0, MAX_TEXT);
    const id = refToId.get(ref);
    if (!id) {
      skipped.push(`${label}：找不到节点 ${ref || "(空)"}`);
      return;
    }
    if (!text) {
      skipped.push(`${label}：提示词是空的`);
      return;
    }
    const node = nodes.find((item) => item.id === id);
    const field = node?.type === "generation" ? "prompt" : "text";
    handlers.updateNodeData?.(id, { [field]: text });
    applied.push(`写好 ${ref} 的提示词`);
  });

  if (list.length > MAX_APPLY_ACTIONS) {
    skipped.push(`超出 ${MAX_APPLY_ACTIONS} 条上限，其余 ${list.length - MAX_APPLY_ACTIONS} 条未执行`);
  }

  return { applied, skipped };
}
