// src/features/ai-canvas/ai-canvas-nodes.js
// V144：AI 画布节点生态扩展 —— 节点类型注册表 + 端口 schema + 连线 fail-closed 校验。
//
// 零 import 纯逻辑叶子：与 ai-canvas-workflow.js / ai-canvas-data-bus.js 同理，必须能被
// 无头验收脚本直接 import 断言（scripts/verify/ai-canvas-nodes-check.mjs）。
//
// 设计要点：
// - V143 的节点 `type` 即种类判别符（prompt/image/result/generation）。V144 把 outfit 能力
//   作为新的 `type` 值（outfit-tryon 等）注册进同一张表，无需另加冗余 `kind` 字段。
// - 每个 typed 节点声明 inputs（端口 + 接受的 upstream 输出种类）/ outputs。
// - 连线校验双保险：本文件的 validateConnection 既给 UI 层用（拉线时即时拒绝），
//   也给 store/workflow 运行时当 fail-closed 兜底（导入/脚本构造的非法图也会被拦下）。

// —— 基础节点（V143 既有，补一张统一 schema 以便校验复用）——
const BASE_NODE_DEFS = {
  prompt: {
    label: "提示词",
    category: "base",
    inputs: [],
    outputs: [{ port: "out", kind: "prompt" }]
  },
  image: {
    label: "图片",
    category: "base",
    inputs: [],
    outputs: [{ port: "out", kind: "image" }]
  },
  result: {
    label: "结果",
    category: "base",
    inputs: [{ port: "in", kind: "image" }],
    outputs: []
  },
  generation: {
    label: "生成",
    category: "base",
    inputs: [
      { port: "in", kind: "image", label: "输入图" },
      { port: "prompt", kind: "prompt", label: "提示词" }
    ],
    outputs: [{ port: "out", kind: "image" }],
    runnable: true
  }
};

// —— V144：outfit 强类型节点 ——
// workflowMode 直接喂给 /api/generate-outfit（服务端据此分派换装/改色/精修等链路）。
// imageRoles 描述「哪个输入端口对应图1/图2/参考图」，适配器据此把上游输出图摆到正确位置。
export const OUTFIT_NODE_KINDS = {
  "outfit-tryon": {
    label: "换装",
    category: "outfit",
    workflowMode: "outfit",
    description: "图1 人物 + 图2 服装 → 换上服装",
    inputs: [
      { port: "model", kind: "image", label: "人物图" },
      { port: "clothing", kind: "image", label: "服装图" },
      { port: "prompt", kind: "prompt", label: "提示词" }
    ],
    outputs: [{ port: "out", kind: "image" }],
    runnable: true,
    defaultData: { prompt: "", status: "idle", outfitIntent: { parts: ["upper", "lower"] } },
    imageRoles: { model: "model", clothing: "clothing" }
  },
  "outfit-recolor": {
    label: "改色",
    category: "outfit",
    workflowMode: "recolor",
    description: "图1 服装 + 颜色参考 → 改色",
    inputs: [
      { port: "model", kind: "image", label: "服装图" },
      { port: "color", kind: "image", label: "颜色参考" },
      { port: "prompt", kind: "prompt", label: "提示词" }
    ],
    outputs: [{ port: "out", kind: "image" }],
    runnable: true,
    defaultData: { prompt: "", status: "idle" },
    imageRoles: { model: "model", color: "color" }
  },
  "outfit-retouch": {
    label: "精修",
    category: "outfit",
    workflowMode: "white-refine",
    description: "图1 平铺/挂拍图 → 白底精修",
    inputs: [
      { port: "model", kind: "image", label: "主图" },
      { port: "prompt", kind: "prompt", label: "提示词" }
    ],
    outputs: [{ port: "out", kind: "image" }],
    runnable: true,
    defaultData: { prompt: "", status: "idle", retouchIntent: {} },
    imageRoles: { model: "model" }
  },
  "outfit-local-edit": {
    label: "局部编辑",
    category: "outfit",
    workflowMode: "local-detail",
    description: "图1 待回贴图 + 图2 细节参考 → 局部回贴（V144 暂未开放：需画布内裁剪/涂抹交互，留待后续 MVP）",
    inputs: [
      { port: "model", kind: "image", label: "待回贴图" },
      { port: "detail", kind: "image", label: "细节参考" },
      { port: "prompt", kind: "prompt", label: "提示词" }
    ],
    outputs: [{ port: "out", kind: "image" }],
    runnable: false,
    defaultData: { prompt: "", status: "idle" }
  },
  "outfit-reference": {
    label: "参考生图",
    category: "outfit",
    workflowMode: "outfit",
    description: "图1 主图 + 图2 参考图 → 以参考为锚出图（V144 暂未开放：参考图路由需额外服务端对齐，留待后续 MVP）",
    inputs: [
      { port: "model", kind: "image", label: "主图" },
      { port: "reference", kind: "image", label: "参考图" },
      { port: "prompt", kind: "prompt", label: "提示词" }
    ],
    outputs: [{ port: "out", kind: "image" }],
    runnable: false,
    defaultData: { prompt: "", status: "idle", outfitIntent: { parts: ["upper", "lower"] } }
  }
};

export const ALL_NODE_DEFS = { ...BASE_NODE_DEFS, ...OUTFIT_NODE_KINDS };

// V144 工具栏按钮用的有序列表（基础节点走各自入口，这里只列 outfit 强类型）。
// V144 MVP 实际开放的可执行 outfit 节点（局部编辑 / 参考生图需裁剪 UI 或服务端参考路由对齐，
// 标记为 runnable:false 暂未开放，避免发出会 400 的请求、守住「搬运不丢参」的硬保证）。
export const OUTFIT_NODE_ORDER = [
  "outfit-tryon",
  "outfit-recolor",
  "outfit-retouch"
];

export function getNodeDef(type) {
  return ALL_NODE_DEFS[type] || null;
}

export function isOutfitKind(type) {
  return Boolean(OUTFIT_NODE_KINDS[type]);
}

// 可执行节点：V143 的 generation + V144 全部 outfit 节点。
export function isRunnableKind(type) {
  const def = ALL_NODE_DEFS[type];
  return Boolean(def?.runnable);
}

// 节点输出端口的种类（用于连线校验）。
export function nodeOutputKind(type) {
  const def = ALL_NODE_DEFS[type];
  if (!def) return null;
  if (def.outputs.length) return def.outputs[0].kind;
  return null;
}

// 连线 fail-closed 校验：from（上游输出种类）能否接到 to 节点的 toPort（接受种类）。
// 返回 { ok, reason }。reason 为中文可读原因，供 UI 即时拒绝 + 工具栏告警复用。
export function validateConnection(fromType, toType, toPort) {
  const toDef = getNodeDef(toType);
  if (!toDef) return { ok: false, reason: `未知的目标节点类型：${toType}` };
  const outKind = nodeOutputKind(fromType);
  if (!outKind) return { ok: false, reason: `上游节点「${fromType}」没有可连出的输出` };

  // 目标节点无显式端口声明（如 result 节点单输入）→ 兜底接受任意上游输出。
  if (!toDef.inputs.length) return { ok: true, reason: "" };

  // 解析目标端口：显式 toPort 命中端口 schema；否则回落到第一个同种类输入端口。
  const port = String(toPort || "").trim();
  let target = port ? toDef.inputs.find((p) => p.port === port) : null;
  if (!target) {
    target = toDef.inputs.find((p) => p.kind === outKind) || null;
  }
  if (!target) {
    const accepted = toDef.inputs.map((p) => p.kind).join(" / ");
    return {
      ok: false,
      reason: `端口不匹配：「${fromType}」输出「${outKind}」不能接到「${toDef.label}」（接受的输入：${accepted}）`
    };
  }
  if (target.kind !== outKind) {
    return {
      ok: false,
      reason: `端口不匹配：「${fromType}」输出「${outKind}」≠ 目标端口「${target.label}」接受「${target.kind}」`
    };
  }
  return { ok: true, reason: "" };
}
