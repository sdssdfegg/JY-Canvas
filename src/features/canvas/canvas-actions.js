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

// 无限画布 —— 画布交互层（视口缩放/平移、节点拖拽、连线增删）
// 同为本文件的普通工厂，不是 hook；依赖 actions 的产物（patchActiveCanvas / updateCanvasNode）。

export function createCanvasInteractions(deps) {
  const {
    activeCanvas,
    canvasStageRef,
    canvasViewport,
    setCanvasViewport,
    canvasDrag,
    setCanvasDrag,
    canvasConnectStart,
    setCanvasConnectStart,
    setCanvasSelectedNodeId,
    patchActiveCanvas,
    updateCanvasNode,
    addEvent,
    makeResultId
  } = deps;

  function fitCanvasView() {
    if (!activeCanvas || activeCanvas.nodes.length === 0) {
      setCanvasViewport({ x: 34, y: 18, scale: 1 });
      return;
    }
    const rect = canvasStageRef.current?.getBoundingClientRect();
    const minX = Math.min(...activeCanvas.nodes.map((node) => node.x));
    const minY = Math.min(...activeCanvas.nodes.map((node) => node.y));
    const maxX = Math.max(...activeCanvas.nodes.map((node) => node.x + node.w));
    const maxY = Math.max(...activeCanvas.nodes.map((node) => node.y + node.h));
    if (!rect) {
      setCanvasViewport({ x: 34 - minX, y: 18 - minY, scale: 1 });
      return;
    }
    const scale = Math.max(0.35, Math.min(1.2, Math.min((rect.width - 100) / Math.max(1, maxX - minX), (rect.height - 100) / Math.max(1, maxY - minY))));
    setCanvasViewport({
      x: rect.width / 2 - ((minX + maxX) / 2) * scale,
      y: rect.height / 2 - ((minY + maxY) / 2) * scale,
      scale: Number(scale.toFixed(2))
    });
  }

  function handleCanvasWheel(event) {
    event.preventDefault();
    const rect = canvasStageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nextScale = Math.max(0.25, Math.min(2.4, Number((canvasViewport.scale * (event.deltaY < 0 ? 1.08 : 0.92)).toFixed(3))));
    const worldX = (event.clientX - rect.left - canvasViewport.x) / canvasViewport.scale;
    const worldY = (event.clientY - rect.top - canvasViewport.y) / canvasViewport.scale;
    setCanvasViewport({
      x: event.clientX - rect.left - worldX * nextScale,
      y: event.clientY - rect.top - worldY * nextScale,
      scale: nextScale
    });
  }

  function beginCanvasPan(event) {
    if (event.button !== 0) return;
    if (event.target.closest(".infiniteNode") || event.target.closest("button,input,select,textarea")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setCanvasDrag({
      type: "pan",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startViewport: canvasViewport
    });
  }

  function beginCanvasNodeDrag(event, nodeId) {
    if (event.button !== 0) return;
    if (event.target.closest("button,input,select,textarea")) return;
    const node = activeCanvas?.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    canvasStageRef.current?.setPointerCapture?.(event.pointerId);
    setCanvasSelectedNodeId(nodeId);
    setCanvasDrag({
      type: "node",
      nodeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startNode: { x: node.x, y: node.y }
    });
  }

  function moveCanvasDrag(event) {
    if (!canvasDrag) return;
    if (canvasDrag.type === "pan") {
      setCanvasViewport({
        ...canvasDrag.startViewport,
        x: canvasDrag.startViewport.x + event.clientX - canvasDrag.startX,
        y: canvasDrag.startViewport.y + event.clientY - canvasDrag.startY
      });
      return;
    }
    if (canvasDrag.type === "node") {
      const deltaX = (event.clientX - canvasDrag.startX) / canvasViewport.scale;
      const deltaY = (event.clientY - canvasDrag.startY) / canvasViewport.scale;
      updateCanvasNode(canvasDrag.nodeId, {
        x: Math.round(canvasDrag.startNode.x + deltaX),
        y: Math.round(canvasDrag.startNode.y + deltaY)
      });
    }
  }

  function endCanvasDrag(event) {
    if (!canvasDrag) return;
    event.currentTarget.releasePointerCapture?.(canvasDrag.pointerId);
    setCanvasDrag(null);
  }

  function beginCanvasConnection(nodeId) {
    setCanvasConnectStart((current) => current?.nodeId === nodeId ? null : { nodeId });
  }

  function completeCanvasConnection(targetNodeId) {
    if (!canvasConnectStart || canvasConnectStart.nodeId === targetNodeId) return;
    patchActiveCanvas((canvas) => {
      const exists = canvas.connections.some((connection) => (
        connection.fromNodeId === canvasConnectStart.nodeId && connection.toNodeId === targetNodeId
      ));
      if (exists) return {};
      return {
        connections: [
          ...canvas.connections,
          { id: makeResultId(), fromNodeId: canvasConnectStart.nodeId, toNodeId: targetNodeId }
        ]
      };
    });
    setCanvasConnectStart(null);
    addEvent("无限画布", "节点已连接");
  }

  function removeCanvasConnection(connectionId) {
    patchActiveCanvas((canvas) => ({
      connections: canvas.connections.filter((connection) => connection.id !== connectionId)
    }));
  }

  return {
    fitCanvasView,
    handleCanvasWheel,
    beginCanvasPan,
    beginCanvasNodeDrag,
    moveCanvasDrag,
    endCanvasDrag,
    beginCanvasConnection,
    completeCanvasConnection,
    removeCanvasConnection
  };
}
