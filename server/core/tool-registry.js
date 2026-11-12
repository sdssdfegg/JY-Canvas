// server/core/tool-registry.js
//
// V208 P1：Tool 抽象底座 —— 轻量注册表（非框架、零第三方依赖、仅 Node 内置）。
//
// 职责：把「影响世界的确定性操作」封装为标准化 Tool，统一入参校验、元数据暴露、非法调用拒绝。
//   - 本层不负责意图理解 / 提示词拼装 / 模型调用 / 任务状态跃迁
//     （分别属于 Agent / Skill / Model Adapter / Orchestration）。
//   - Tool 的具体实现由各自适配器复用既有业务模块（local-images-generator / version-store /
//     project-store / orchestrator），本文件零业务 import。
//
// 契约见 docs/架构审查/V207/V207-02-目标智能执行架构设计.md §3.1。

const VALID_SCOPES = new Set(["project", "screen", "global"]);

// 注册表：id -> Tool 对象（进程内单例）。
const registry = new Map();

// 必填字段与类型（见 V207-02 §3.1 契约）。
const REQUIRED = [
  ["id", "string"],
  ["description", "string"],
  ["permissions", "array"],
  ["idempotent", "boolean"],
  ["confirmRequired", "boolean"],
  ["sideEffectScope", "scope"],
  ["run", "function"]
];

function assertField(tool, field, kind) {
  const v = tool[field];
  if (kind === "string") {
    if (typeof v !== "string" || v.length === 0) {
      throw new Error(`registerTool: ${field} 必须非空字符串`);
    }
  } else if (kind === "array") {
    if (!Array.isArray(v)) throw new Error(`registerTool: ${field} 必须为数组`);
  } else if (kind === "boolean") {
    if (typeof v !== "boolean") throw new Error(`registerTool: ${field} 必须为布尔`);
  } else if (kind === "function") {
    if (typeof v !== "function") throw new Error(`registerTool: ${field} 必须为函数`);
  } else if (kind === "scope") {
    if (!VALID_SCOPES.has(v)) {
      throw new Error(`registerTool: sideEffectScope 必须为 project|screen|global，收到 ${String(v)}`);
    }
  }
}

// 校验单个 Tool（含重复 id 检查）。缺字段 / 类型错 / 重复 id 一律抛错拒绝。
export function registerTool(tool) {
  if (!tool || typeof tool !== "object") {
    throw new Error("registerTool: tool 必须为对象");
  }
  for (const [field, kind] of REQUIRED) assertField(tool, field, kind);
  if (registry.has(tool.id)) {
    throw new Error(`registerTool: 重复注册 id=${tool.id}`);
  }
  registry.set(tool.id, tool);
  return tool;
}

// 按 id 取 Tool（未注册返回 undefined）。
export function getTool(id) {
  return registry.get(id);
}

// 返回所有已注册 Tool 的公开元数据（剥离 run，避免实现泄露 / 序列化问题）。
export function listTools() {
  return [...registry.values()].map((t) => ({
    id: t.id,
    description: t.description,
    permissions: t.permissions,
    idempotent: t.idempotent,
    confirmRequired: t.confirmRequired,
    sideEffectScope: t.sideEffectScope
  }));
}

// 唯一执行入口：拒绝未注册 / 拒绝 confirmRequired 未确认 / 委托 tool.run。
// ToolCall = { tool, args, confirmed? }；RunCtx = { generator?, apiKey?, backoffBaseMs? }。
export async function dispatchTool(call, ctx = {}) {
  if (!call || typeof call !== "object") {
    throw new Error("dispatchTool: call 必须为对象");
  }
  const tool = registry.get(call.tool);
  if (!tool) {
    throw new Error(`dispatchTool: 未注册的 Tool id=${call.tool}`);
  }
  if (tool.confirmRequired && !call.confirmed) {
    throw new Error(
      `dispatchTool: Tool ${call.tool} 需用户确认（confirmRequired=true），但未带 confirmed`
    );
  }
  const args = call.args && typeof call.args === "object" ? call.args : {};
  return tool.run(args, ctx);
}
