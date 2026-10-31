// src/features/ai-canvas/ai-canvas-orchestrator.js
// V143 MVP-5：多 Agent 编排。
//
// 为什么串行而不是并发：第二个角色（prompter）必须在「搭完图之后」的画布上工作——
// 它得看到 planner 刚建出来的节点才能给它们写提示词。并发会让第二阶段读到旧画布，
// 写出来的提示词落不到新节点上。所以这里是**有顺序的两跳**，不是同时发两个请求。
//
// 角色：planner（搭图，MVP-3 的能力）→ prompter（写提示词，MVP-5 新增）。
// 提示词之所以单独拆一个角色：项目实测（E5）结构化提示词对出图质量的提升最大，
// 让专门的提示词角色只干这一件事，比让规划角色顺手写要稳。

import { requestCanvasAgentPlan } from "../../api/ai-canvas-agent.js";
import { applyCanvasAgentPlan, applyPromptPatches, buildCanvasSnapshot } from "./ai-canvas-agent.js";

export const PIPELINE_AUTO = "auto";
export const PIPELINE_PLAN = "plan";
export const PIPELINE_PROMPT = "prompt";
export const PIPELINE_MODES = [PIPELINE_AUTO, PIPELINE_PLAN, PIPELINE_PROMPT];

function resolveMode(value) {
  return PIPELINE_MODES.includes(value) ? value : PIPELINE_AUTO;
}

// 一次调用跑完选中的阶段，返回每个阶段的产出（供面板逐阶段展示）。
// handlers 是 store 动作集合；createNode 由视图提供（走 store 的 makeNode 生成 id）。
export async function runAgentPipeline({
  instruction,
  apiKey,
  project,
  createNode,
  handlers,
  mode = PIPELINE_AUTO,
  agentModel = ""
}) {
  const resolved = resolveMode(mode);
  const baseNodes = project?.nodes || [];
  const baseEdges = project?.edges || [];
  const stages = [];
  let createdNodes = [];

  if (resolved === PIPELINE_AUTO || resolved === PIPELINE_PLAN) {
    const snap = buildCanvasSnapshot(baseNodes, baseEdges);
    const plan = await requestCanvasAgentPlan({
      apiKey,
      instruction,
      role: "planner",
      agentModel,
      nodes: snap.nodes,
      edges: snap.edges
    });
    const outcome = applyCanvasAgentPlan({
      actions: plan?.actions || [],
      nodes: baseNodes,
      createNode,
      handlers
    });
    createdNodes = outcome.createdNodes || [];
    stages.push({
      role: "planner",
      title: "搭图",
      reply: String(plan?.reply || "").trim(),
      applied: outcome.applied || [],
      skipped: outcome.skipped || [],
      dropped: plan?.dropped || 0
    });
  }

  if (resolved === PIPELINE_AUTO || resolved === PIPELINE_PROMPT) {
    // 第二跳的画布 = 原有节点 + 上一跳新建的节点（顺序必须与 buildCanvasSnapshot 的代号一致）。
    const nodesForPrompter = [...baseNodes, ...createdNodes];
    const snap = buildCanvasSnapshot(nodesForPrompter, baseEdges);
    const plan = await requestCanvasAgentPlan({
      apiKey,
      instruction,
      role: "prompter",
      agentModel,
      nodes: snap.nodes,
      edges: snap.edges
    });
    const outcome = applyPromptPatches({
      prompts: plan?.prompts || [],
      nodes: nodesForPrompter,
      handlers
    });
    stages.push({
      role: "prompter",
      title: "写提示词",
      reply: String(plan?.reply || "").trim(),
      applied: outcome.applied || [],
      skipped: outcome.skipped || [],
      dropped: plan?.dropped || 0
    });
  }

  return stages;
}
