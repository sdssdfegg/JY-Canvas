// 无限画布 —— 画布状态操作层（工厂形态，非 hook）
//
// 用法（组件体内）：const { patchActiveCanvas, ... } = createCanvasActions({ ...deps });
// 每次 render 调一次 ⇒ 捕获最新的 state / setter / addEvent，语义与组件内 function 声明一致。
//
// 🔴 依赖全部注入，本文件不直接引用组件内的 state / setter。
// ⚠️ 跨文件引用只写函数名、不写行号 —— 行号会漂移。

export function createCanvasActions(deps) {
  const {
    setInfiniteCanvasState,
    activeCanvas,
    addEvent,
    setCanvasSelectedNodeId,
    setCanvasViewport,
    setCanvasConnectStart,
    createInfiniteCanvas,
    createCanvasNode,
    canvasCenterPoint
  } = deps;

  function patchActiveCanvas(updater) {
    setInfiniteCanvasState((current) => {
      const activeId = current.activeId || current.canvases[0]?.id;
      return {
        ...current,
        activeId,
        canvases: current.canvases.map((canvas) => {
          if (canvas.id !== activeId) return canvas;
          const patch = typeof updater === "function" ? updater(canvas) : updater;
          return { ...canvas, ...patch, updatedAt: Date.now() };
        })
      };
    });
  }

  function patchCanvasById(canvasId, updater) {
    setInfiniteCanvasState((current) => ({
      ...current,
      canvases: current.canvases.map((canvas) => {
        if (canvas.id !== canvasId) return canvas;
        const patch = typeof updater === "function" ? updater(canvas) : updater;
        return { ...canvas, ...patch, updatedAt: Date.now() };
      })
    }));
  }

  function updateCanvasNode(nodeId, updater) {
    patchActiveCanvas((canvas) => ({
      nodes: canvas.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const patch = typeof updater === "function" ? updater(node) : updater;
        return { ...node, ...patch, updatedAt: Date.now() };
      })
    }));
  }

  function updateCanvasNodeByCanvasId(canvasId, nodeId, updater) {
    patchCanvasById(canvasId, (canvas) => ({
      nodes: canvas.nodes.map((node) => {
        if (node.id !== nodeId) return node;
        const patch = typeof updater === "function" ? updater(node) : updater;
        return { ...node, ...patch, updatedAt: Date.now() };
      })
    }));
  }

  function createCanvas() {
    const canvas = createInfiniteCanvas();
    setInfiniteCanvasState((current) => ({
      activeId: canvas.id,
      canvases: [canvas, ...current.canvases]
    }));
    setCanvasSelectedNodeId("");
    setCanvasViewport({ x: 34, y: 18, scale: 1 });
    addEvent("无限画布", "已新建画布");
  }

  function renameCanvas() {
    if (!activeCanvas) return;
    const name = window.prompt("请输入画布名称", activeCanvas.name);
    if (!name?.trim()) return;
    patchActiveCanvas({ name: name.trim() });
    addEvent("无限画布", "画布已重命名");
  }

  function deleteCanvas() {
    if (!activeCanvas) return;
    const confirmed = window.confirm(`确定删除「${activeCanvas.name}」吗？画布内节点会被清理，不影响其它栏目。`);
    if (!confirmed) return;
    setInfiniteCanvasState((current) => {
      if (current.canvases.length <= 1) {
        const replacement = createInfiniteCanvas("默认画布");
        return { activeId: replacement.id, canvases: [replacement] };
      }
      const nextCanvases = current.canvases.filter((canvas) => canvas.id !== activeCanvas.id);
      return { activeId: nextCanvases[0].id, canvases: nextCanvases };
    });
    setCanvasSelectedNodeId("");
    addEvent("无限画布", "画布已删除");
  }

  function clearCanvas() {
    if (!activeCanvas) return;
    const confirmed = window.confirm("确定清空当前画布吗？只会清理无限画布，不影响其它栏目。");
    if (!confirmed) return;
    const reset = createInfiniteCanvas(activeCanvas.name);
    patchActiveCanvas({
      nodes: reset.nodes,
      connections: reset.connections
    });
    setCanvasSelectedNodeId("");
    addEvent("无限画布", "当前画布已清空");
  }

  function selectCanvas(canvasId) {
    setInfiniteCanvasState((current) => ({
      ...current,
      activeId: canvasId
    }));
    setCanvasSelectedNodeId("");
    setCanvasConnectStart(null);
  }

  function addCanvasNode(type, patch = {}) {
    const point = patch.x == null || patch.y == null ? canvasCenterPoint() : { x: patch.x, y: patch.y };
    const node = createCanvasNode(type, { ...patch, x: point.x, y: point.y });
    patchActiveCanvas((canvas) => ({
      nodes: [...canvas.nodes, node]
    }));
    setCanvasSelectedNodeId(node.id);
    return node;
  }

  function deleteCanvasNode(nodeId) {
    patchActiveCanvas((canvas) => ({
      nodes: canvas.nodes.filter((node) => node.id !== nodeId),
      connections: canvas.connections.filter((connection) => connection.fromNodeId !== nodeId && connection.toNodeId !== nodeId)
    }));
    setCanvasSelectedNodeId((current) => current === nodeId ? "" : current);
    setCanvasConnectStart((current) => current?.nodeId === nodeId ? null : current);
  }

  return {
    patchActiveCanvas,
    patchCanvasById,
    updateCanvasNode,
    updateCanvasNodeByCanvasId,
    createCanvas,
    renameCanvas,
    deleteCanvas,
    clearCanvas,
    selectCanvas,
    addCanvasNode,
    deleteCanvasNode
  };
}
