// src/features/ai-canvas/ai-canvas-transfer.js
// V143：画布**导入 / 导出**（纯逻辑，零 import，便于无头断言）。
//
// 两个用途：① 备份（localStorage 有配额上限，导出的 JSON 文件才是稳妥的存档）；
// ② 分享工作流（把搭好的链路发给同事直接用）。
//
// 设计要点：**导入必须 fail-closed**。外部 JSON 是不可信输入——格式不对、字段缺失、
// 版本比当前新、节点类型不认识、连线指向不存在的节点，统统要么拒绝要么丢掉并报告，
// 绝不能让脏数据把画布搞崩（历史上"导入后画布打不开"这类故障最难排查）。

export const TRANSFER_FORMAT = "jingyin-ai-canvas";
export const TRANSFER_VERSION = 1;

const MAX_IMPORT_BYTES = 20 * 1024 * 1024; // 20MB：画布里可能有大图 dataURL
const MAX_NODES = 400;
const MAX_EDGES = 800;
const NODE_TYPES = ["image", "prompt", "generation", "result"];

// 导出：只带「能重建画布」的字段，不带任何运行时状态（撤销栈等）。
export function serializeProject(project) {
  const source = project || {};
  return JSON.stringify({
    format: TRANSFER_FORMAT,
    version: TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      name: String(source.name || "画布"),
      viewport: source.viewport && typeof source.viewport === "object"
        ? source.viewport
        : { x: 0, y: 0, zoom: 1 },
      nodes: (Array.isArray(source.nodes) ? source.nodes : []).map((node) => ({
        id: String(node?.id || ""),
        type: String(node?.type || ""),
        x: finite(node?.x, 0),
        y: finite(node?.y, 0),
        w: finite(node?.w, 240),
        h: finite(node?.h, 130),
        data: node?.data && typeof node.data === "object" ? node.data : {}
      })),
      edges: (Array.isArray(source.edges) ? source.edges : []).map((edge) => ({
        from: String(edge?.from || ""),
        to: String(edge?.to || "")
      }))
    }
  }, null, 2);
}

// 解析导入文件。返回 { ok, project, stats, error }；失败时 project 为 null、error 是中文原因。
export function parseProjectFile(text, options = {}) {
  if (typeof text !== "string" || !text.trim()) {
    return fail("文件内容是空的");
  }
  if (text.length > MAX_IMPORT_BYTES) {
    return fail("文件太大，已超过 20MB 上限");
  }

  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    return fail("不是合法的 JSON 文件");
  }
  if (!payload || typeof payload !== "object") {
    return fail("文件内容不是画布数据");
  }
  if (payload.format !== TRANSFER_FORMAT) {
    return fail("这不是静音AI画板导出的画布文件");
  }
  if (Number(payload.version) > TRANSFER_VERSION) {
    return fail("这个画布文件来自更新的版本，当前版本打不开");
  }

  const source = payload.project && typeof payload.project === "object" ? payload.project : {};
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const rawEdges = Array.isArray(source.edges) ? source.edges : [];

  // 节点：逐条校验，不合格的丢掉（不认识的 type 一律丢，避免渲染层遇到未知类型崩掉）。
  const prefix = String(options.idPrefix || "imp");
  const nodes = [];
  const idMap = new Map();
  rawNodes.slice(0, MAX_NODES).forEach((node, index) => {
    const id = String(node?.id || "");
    const type = String(node?.type || "");
    if (!id || !NODE_TYPES.includes(type)) return;
    const newId = `${prefix}_${index}_${id}`;
    idMap.set(id, newId);
    nodes.push({
      id: newId,
      type,
      x: finite(node?.x, 0),
      y: finite(node?.y, 0),
      w: finite(node?.w, 240),
      h: finite(node?.h, 130),
      data: node?.data && typeof node.data === "object" ? node.data : {}
    });
  });
  if (!nodes.length) {
    return fail("文件里没有可用的画布节点");
  }

  // 连线：两端都必须落在保留下来的节点里，否则丢弃（悬空边会让连线层渲染出错）。
  const edges = [];
  rawEdges.slice(0, MAX_EDGES).forEach((edge, index) => {
    const from = idMap.get(String(edge?.from || ""));
    const to = idMap.get(String(edge?.to || ""));
    if (!from || !to || from === to) return;
    edges.push({ id: `${prefix}_e_${index}_${from}_${to}`, from, to });
  });

  const viewport = source.viewport && typeof source.viewport === "object"
    ? { x: finite(source.viewport.x, 0), y: finite(source.viewport.y, 0), zoom: finite(source.viewport.zoom, 1) }
    : { x: 0, y: 0, zoom: 1 };

  return {
    ok: true,
    error: "",
    project: {
      name: String(source.name || "导入的画布"),
      nodes,
      edges,
      viewport
    },
    stats: {
      importedNodes: nodes.length,
      importedEdges: edges.length,
      droppedNodes: Math.max(0, rawNodes.length - nodes.length),
      droppedEdges: Math.max(0, rawEdges.length - edges.length)
    }
  };
}

function fail(error) {
  return { ok: false, error, project: null, stats: { importedNodes: 0, importedEdges: 0, droppedNodes: 0, droppedEdges: 0 } };
}

function finite(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}
