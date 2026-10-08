// 无限画布 —— 图遍历 / 批量编排 / 视口换算 的纯计算层。
// 从 src/main.jsx 的 App 组件体内逐字搬出（RF-062），函数体未作任何改动。
// 🔴 本模块必须是纯的：不 import React、不碰 state / ref、不做副作用。
//    需要 state 的画布操作（createCanvas / patchActiveCanvas 等）留在主组件，
//    等后续领域切分阶段再定落点。
// ⚠️ 跨文件引用只写函数名、不写行号：行号随任意一侧的编辑就会漂移，刻意不补。

export function incomingCanvasNodes(canvas, nodeId) {
  if (!canvas) return [];
  return canvas.connections
    .filter((connection) => connection.toNodeId === nodeId)
    .map((connection) => canvas.nodes.find((node) => node.id === connection.fromNodeId))
    .filter(Boolean);
}

export function canvasResultItemsFromNode(node) {
  if (!node) return [];
  if (node.type === "image" && node.result) return [node.result];
  if (node.type === "output" && Array.isArray(node.results)) return node.results;
  return [];
}

export function canvasPromptForGenerator(canvas, node) {
  const incoming = incomingCanvasNodes(canvas, node.id);
  const promptParts = incoming.flatMap((sourceNode) => {
    if (sourceNode.type === "prompt") return [sourceNode.text || ""];
    if (sourceNode.type === "image") return [sourceNode.prompt || sourceNode.result?.prompt || ""];
    if (sourceNode.type === "output") return [sourceNode.prompt || ""];
    return [];
  });
  promptParts.push(node.prompt || "");
  return promptParts.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

export function canvasImagesForGenerator(canvas, node) {
  return incomingCanvasNodes(canvas, node.id).flatMap(canvasResultItemsFromNode);
}

export function canvasImageEntriesForGenerator(canvas, node) {
  return incomingCanvasNodes(canvas, node.id).flatMap((sourceNode) => (
    canvasResultItemsFromNode(sourceNode).map((result, index) => ({
      result,
      sourceNode,
      role: sourceNode.role || (sourceNode.type === "output" ? "reference" : "auto"),
      label: sourceNode.title || `图片 ${index + 1}`
    }))
  ));
}

export function splitCanvasBatchEntries(entries) {
  const explicitModels = entries.filter((entry) => entry.role === "model");
  if (explicitModels.length > 0) {
    return {
      modelEntries: explicitModels,
      fixedEntries: entries.filter((entry) => entry.role !== "model")
    };
  }

  const fixedEntries = entries.filter((entry) => entry.role === "fixed" || entry.role === "reference");
  const autoEntries = entries.filter((entry) => entry.role === "auto");
  if (fixedEntries.length > 0) {
    return { modelEntries: autoEntries, fixedEntries };
  }
  if (autoEntries.length > 1) {
    return {
      modelEntries: autoEntries.slice(0, -1),
      fixedEntries: autoEntries.slice(-1)
    };
  }
  return { modelEntries: autoEntries, fixedEntries };
}

export function buildCanvasBatchPrompt(basePrompt, modelIndex, modelTotal, fixedCount) {
  return [
    `批量换装任务 ${modelIndex + 1}/${modelTotal}：图1是当前模特图，只处理当前这一位模特。`,
    fixedCount > 0
      ? "图2开始是固定服装/产品参考图，必须让图1人物穿着固定服装图里的衣服，服装款式、版型、颜色、面料纹理、袖口、纽扣、拼接结构等关键细节保持一致。"
      : "没有标记固定服装图时，请按提示词完成当前模特的单独出图。",
    "保持当前模特的脸部身份、体型比例和自然姿态，不要融合其它模特，不要把多位模特放进同一张图。",
    basePrompt
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------- 视口换算
// 原 screenToCanvasPoint / canvasCenterPoint 是闭包版（直接读 canvasStageRef 与 canvasViewport）。
// 这里把两个依赖提升为入参，主组件保留同名薄壳传入 ⇒ 调用点零改动。

export function screenPointToCanvas(rect, viewport, clientX, clientY) {
  if (!rect) return { x: 120, y: 120 };
  return {
    x: (clientX - rect.left - viewport.x) / viewport.scale,
    y: (clientY - rect.top - viewport.y) / viewport.scale
  };
}

export function canvasCenterFromRect(rect, viewport, offsetX = 0, offsetY = 0) {
  if (!rect) return { x: 120 + offsetX, y: 120 + offsetY };
  return {
    x: (rect.width / 2 - viewport.x) / viewport.scale + offsetX,
    y: (rect.height / 2 - viewport.y) / viewport.scale + offsetY
  };
}
