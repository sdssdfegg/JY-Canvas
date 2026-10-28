// src/features/ai-canvas/ai-canvas-workflow.js
// V143 MVP-4：画布自动工作流引擎的**纯逻辑层** —— 拓扑排序 + 运行计划。
//
// 为什么单独成文件且零 import：排序 / 环检测 / 计划全是 pure 的，必须与 React、
// 网络、存储彻底解耦，才能被无头验收脚本直接 import 断言
// （见 scripts/verify/ai-canvas-workflow-check.mjs）。
// 真正发起生成的是视图层；本文件只回答「按什么顺序跑、能不能跑」。

// 拓扑排序（Kahn）。
// 返回：
//   order —— 可排定的节点 id（同层按 nodes 原序出队，保证结果稳定可复现）
//   cycle —— 排不进去的节点 id（处在环里、或被环堵住的下游）；空数组 = 无环
// 悬空边（端点不在 nodes 里）与重复边都被忽略，不会把入度算歪。
export function topoSortNodes(nodes = [], edges = []) {
  const ids = nodes.map((node) => node.id);
  const known = new Set(ids);
  const indegree = new Map();
  const outgoing = new Map();
  ids.forEach((id) => {
    indegree.set(id, 0);
    outgoing.set(id, []);
  });

  const seenEdge = new Set();
  edges.forEach((edge) => {
    if (!known.has(edge.from) || !known.has(edge.to)) return;
    const key = `${edge.from}->${edge.to}`;
    if (seenEdge.has(key)) return; // 重复边只算一次，否则入度被重复累加
    seenEdge.add(key);
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  });

  const ready = ids.filter((id) => indegree.get(id) === 0);
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    outgoing.get(id).forEach((to) => {
      const left = (indegree.get(to) || 0) - 1;
      indegree.set(to, left);
      if (left === 0) ready.push(to);
    });
  }

  if (order.length === ids.length) return { order, cycle: [] };
  const placed = new Set(order);
  return { order, cycle: ids.filter((id) => !placed.has(id)) };
}

// 链式多轮（连续编辑）的输入解析：**直接上游里已经生成成功的生成节点**，用它的 resultUrl 当输入图。
// 单节点「执行生成」不走这里（口径不变），只有「运行画布」才认 gen → gen 这条边。
export function chainedUpstreamResults(current, genNode) {
  const upstreamIds = (current?.edges || [])
    .filter((edge) => edge.to === genNode?.id)
    .map((edge) => edge.from);
  return (current?.nodes || [])
    .filter(
      (node) =>
        upstreamIds.includes(node.id) &&
        node.type === "generation" &&
        node.data?.status === "success" &&
        node.data?.resultUrl
    )
    .map((node) => ({ id: node.id, type: "result", data: { src: node.data.resultUrl } }));
}

// 把「基础收集结果」（来自 collectGenerationInputs）与链式结果合成工作流输入。
// 拆成两半是为了可测：本文件零 import，能被无头脚本直接断言；
// 而 ai-canvas-generation.js 因为要读设置（含 Vite 的 import.meta.env）进不了纯 node。
export function workflowInputsWithChain(base, current, genNode) {
  const imageNodes = [...(base?.imageNodes || []), ...chainedUpstreamResults(current, genNode)];
  return { imageNodes, promptText: base?.promptText || "" };
}

// 运行计划：按拓扑序挑出要执行的生成节点。
// 有环 ⇒ 拒绝执行（runnable 为空 + 中文原因），绝不猜顺序、绝不无限循环。
export function planWorkflowRuns(nodes = [], edges = []) {
  const { order, cycle } = topoSortNodes(nodes, edges);
  if (cycle.length) {
    return { order, cycle, runnable: [], reason: `画布里有循环连线（${cycle.length} 个节点），无法确定执行顺序` };
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const runnable = order.filter((id) => byId.get(id)?.type === "generation");
  return {
    order,
    cycle: [],
    runnable,
    reason: runnable.length ? "" : "画布里还没有生成节点"
  };
}
