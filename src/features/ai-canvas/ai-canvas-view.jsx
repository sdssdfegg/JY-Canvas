// src/features/ai-canvas/ai-canvas-view.jsx
// V143（AI 无限画布 MVP-1）：独立画布工作空间视图。
// 隔离、零侵入：自带工具栏，不触碰现有页面 / 模型调用 / API Key / 提示词。
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  FileText,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  FolderPlus,
  Download,
  Upload,
  X,
  Network,
  Sparkles,
  Zap
} from "lucide-react";
import { Button } from "../../shared/ui/Button";
import { makeNode, useAiCanvasStore } from "./ai-canvas-store.js";
import {
  collectGenerationInputs,
  collectWorkflowInputs,
  runCanvasGeneration,
  readJySettings,
  fetchJyConfig
} from "./ai-canvas-generation.js";
import { planWorkflowRuns } from "./ai-canvas-workflow.js";
import { runAgentPipeline } from "./ai-canvas-orchestrator.js";
import { parseProjectFile, serializeProject } from "./ai-canvas-transfer.js";
import { AgentPanel, NodeBody, ProjectList, WorkflowStatus } from "./ai-canvas-panels.jsx";
import "./ai-canvas.css";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

export function AiCanvasView() {
  const { state, current, actions, canUndo, canRedo, storageError } = useAiCanvasStore();
  const viewport = current?.viewport || { x: 0, y: 0, zoom: 1 };

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const transferInputRef = useRef(null);
  const interaction = useRef(null);
  const [pendingConn, setPendingConn] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 600 });
  // —— MVP-3：画布 Agent 面板状态 ——
  const [agentText, setAgentText] = useState("");
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentReply, setAgentReply] = useState("");
  const [agentApplied, setAgentApplied] = useState([]);
  const [agentSkipped, setAgentSkipped] = useState([]);
  const [agentError, setAgentError] = useState("");
  // MVP-5：Agent 编排方式（auto=先搭图再写词 / plan=只搭图 / prompt=只写提示词）
  const [agentMode, setAgentMode] = useState("auto");
  // 导入 / 导出的结果提示（成功与失败都要让用户看见）
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);

  // 用 ref 持有最新视口 / 当前项目，供 window 级监听器读取（避免监听器身份随渲染变化导致泄漏）。
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const currentRef = useRef(current);
  currentRef.current = current;

  // 屏幕坐标 → 画布坐标（读 ref，稳定）。
  const getCanvasPoint = useCallback((clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vp = viewportRef.current;
    return { x: (clientX - rect.left - vp.x) / vp.zoom, y: (clientY - rect.top - vp.y) / vp.zoom };
  }, []);

  // 以容器内某屏幕点为锚做缩放（读 ref，稳定）。
  const zoomAt = useCallback((factor, clientX, clientY) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vp = viewportRef.current;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * factor));
    const canvasX = (px - vp.x) / vp.zoom;
    const canvasY = (py - vp.y) / vp.zoom;
    actions.setViewport({ x: px - canvasX * newZoom, y: py - canvasY * newZoom, zoom: newZoom });
  }, [actions]);

  // —— window 级指针监听（稳定身份，统一增删）——
  const handleWindowMove = useCallback((e) => {
    const it = interaction.current;
    if (!it) return;
    if (it.type === "pan") {
      const vp = viewportRef.current;
      actions.setViewport({ x: it.v0.x + (e.clientX - it.startX), y: it.v0.y + (e.clientY - it.startY), zoom: vp.zoom });
    } else if (it.type === "node") {
      const z = viewportRef.current.zoom;
      actions.moveNode(it.id, it.nodeX + (e.clientX - it.startX) / z, it.nodeY + (e.clientY - it.startY) / z);
    } else if (it.type === "conn") {
      const c = getCanvasPoint(e.clientX, e.clientY);
      setPendingConn({ from: it.from, x: c.x, y: c.y });
    }
  }, [actions, getCanvasPoint]);

  const handleWindowUp = useCallback((e) => {
    const it = interaction.current;
    if (it && it.type === "conn") {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const portEl = el?.closest?.("[data-node-input]");
      const toId = portEl?.getAttribute("data-node-input");
      if (toId && toId !== it.from) {
        actions.addEdge({ from: it.from, to: toId });
      }
      setPendingConn(null);
    }
    interaction.current = null;
    window.removeEventListener("pointermove", handleWindowMove);
    window.removeEventListener("pointerup", handleWindowUp);
  }, [actions, handleWindowMove]);

  // 卸载时确保清理监听。
  useEffect(() => () => {
    window.removeEventListener("pointermove", handleWindowMove);
    window.removeEventListener("pointerup", handleWindowUp);
  }, [handleWindowMove, handleWindowUp]);

  // 监听画布尺寸（供小地图 / 视口矩形计算）。
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setStageSize({ w: rect.width, h: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 滚轮缩放（非 passive，可 preventDefault）。
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const handler = (e) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [zoomAt]);

  // —— 背景按下 → 平移 ——
  const onCanvasPointerDown = useCallback((e) => {
    if (e.target.closest("[data-node]")) return; // 节点/端口自行处理
    interaction.current = {
      type: "pan",
      startX: e.clientX,
      startY: e.clientY,
      v0: { ...viewportRef.current }
    };
    actions.selectNode(null);
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
  }, [actions, handleWindowMove, handleWindowUp]);

  // —— 节点按下 → 拖动（端口 / 表单控件除外）——
  const onNodePointerDown = useCallback((e, node) => {
    e.stopPropagation();
    if (e.target.closest("[data-node-output]") || e.target.closest("[data-node-input]")) return;
    if (e.target.closest("input, textarea, button")) return; // 不拖动表单控件
    actions.selectNode(node.id);
    interaction.current = {
      type: "node",
      id: node.id,
      startX: e.clientX,
      startY: e.clientY,
      nodeX: node.x,
      nodeY: node.y
    };
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
  }, [actions, handleWindowMove, handleWindowUp]);

  // —— 输出端口按下 → 拉连线 ——
  const onOutputPointerDown = useCallback((e, node) => {
    e.stopPropagation();
    interaction.current = { type: "conn", from: node.id };
    setPendingConn({ from: node.id, x: node.x + node.w, y: node.y + node.h / 2 });
    window.addEventListener("pointermove", handleWindowMove);
    window.addEventListener("pointerup", handleWindowUp);
  }, [handleWindowMove, handleWindowUp]);

  // —— 工具：在视图中心新增节点 ——
  const addAtCenter = useCallback((type, data) => {
    if (!currentRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    const p = getCanvasPoint(rect.left + cx, rect.top + cy);
    actions.addNode(makeNode(type, p.x - 110, p.y - 60, data));
  }, [actions, getCanvasPoint]);

  // —— 图片上传 ——
  const onPickFiles = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    files.filter((f) => f.type.startsWith("image/")).forEach((f) => {
      const reader = new FileReader();
      reader.onload = () => actions.addNode(makeNode("image", 40 + Math.random() * 200, 40 + Math.random() * 200, { src: reader.result, name: f.name }));
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  }, [actions]);

  // —— 拖拽图片到画布 ——
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    const p = getCanvasPoint(e.clientX, e.clientY);
    files.forEach((f, i) => {
      const reader = new FileReader();
      reader.onload = () => actions.addNode(makeNode("image", p.x + i * 24, p.y + i * 24, { src: reader.result, name: f.name }));
      reader.readAsDataURL(f);
    });
  }, [actions, getCanvasPoint]);

  // —— 导出当前画布为 JSON 文件（备份 / 分享用）——
  const exportProject = useCallback(() => {
    const project = currentRef.current;
    if (!project) {
      setNotice("先打开一个画布再导出");
      setNoticeIsError(true);
      return;
    }
    const blob = new Blob([serializeProject(project)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${String(project.name || "画布").replace(/[\\/:*?"<>|]/g, "_")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(`已导出「${project.name}」`);
    setNoticeIsError(false);
  }, []);

  // —— 导入画布 JSON 文件（格式 / 脏数据由 transfer 模块 fail-closed 挡住）——
  const onImportProjectFile = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseProjectFile(String(reader.result || ""), { idPrefix: `imp${Date.now().toString(36)}` });
      if (!result.ok) {
        setNotice(result.error);
        setNoticeIsError(true);
        return;
      }
      actions.importProject(result.project);
      const dropped = result.stats.droppedNodes + result.stats.droppedEdges;
      setNotice(`已导入 ${result.stats.importedNodes} 个节点${dropped ? `（丢弃 ${dropped} 项无效数据）` : ""}`);
      setNoticeIsError(false);
    };
    reader.readAsText(file);
  }, [actions]);

  // —— 生成节点执行：复用 JY 现有 /api/images（见 ai-canvas-generation.js）——
  const runGeneration = useCallback(async (node) => {
    actions.startGeneration(node.id);
    try {
      const settings = readJySettings();
      const config = await fetchJyConfig();
      const { imageNodes, promptText } = collectGenerationInputs(currentRef.current, node);
      const { resultUrl, usedModel } = await runCanvasGeneration({
        genNode: node,
        imageNodes,
        promptText,
        settings,
        config
      });
      actions.completeGeneration(node.id, { resultUrl, usedModel, createResultNode: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      actions.failGeneration(node.id, message);
    }
  }, [actions]);

  // —— MVP-4：运行整张画布 —— 按拓扑序依次执行生成节点，失败即停 ——
  const runWorkflow = useCallback(async () => {
    const project = currentRef.current;
    if (!project) return;
    const plan = planWorkflowRuns(project.nodes || [], project.edges || []);
    if (plan.cycle.length) {
      actions.failWorkflow(plan.reason || "画布里有循环连线，无法确定执行顺序", null);
      return;
    }
    if (!plan.runnable.length) {
      actions.failWorkflow(plan.reason || "画布里还没有生成节点", null);
      return;
    }

    actions.startWorkflow(plan.runnable);
    let ran = 0;
    for (let i = 0; i < plan.runnable.length; i += 1) {
      const id = plan.runnable[i];
      const node = (currentRef.current?.nodes || []).find((n) => n.id === id);
      if (!node || node.type !== "generation") continue;
      actions.startGeneration(id);
      try {
        const settings = readJySettings();
        const config = await fetchJyConfig();
        // 走工作流口径：额外把「上游已成功的生成节点」算作输入，支持 gen→gen 链式多轮。
        const { imageNodes, promptText } = collectWorkflowInputs(currentRef.current, node);
        const { resultUrl, usedModel } = await runCanvasGeneration({
          genNode: node,
          imageNodes,
          promptText,
          settings,
          config
        });
        actions.completeGeneration(id, { resultUrl, usedModel, createResultNode: true });
        ran += 1;
        actions.stepWorkflow(i + 1, ran);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        actions.failGeneration(id, message);
        actions.failWorkflow(message, id);
        return;
      }
    }
    actions.finishWorkflow();
  }, [actions]);

  // —— MVP-3：画布 Agent —— 自然语言指令 → 服务端动作清单 → 前端 fail-closed 应用 ——
  const runAgent = useCallback(async () => {
    const project = currentRef.current;
    if (!project) {
      setAgentError("请先新建或打开一个画布");
      return;
    }
    const instruction = agentText.trim();
    if (!instruction) return;
    const settings = readJySettings();
    setAgentBusy(true);
    setAgentError("");
    setAgentReply("");
    setAgentApplied([]);
    setAgentSkipped([]);
    try {
      // MVP-5：交给编排器跑多 Agent（默认 auto = planner 搭图 → prompter 写提示词）。
      const stages = await runAgentPipeline({
        instruction,
        apiKey: settings?.apiKey || "",
        project,
        createNode: (type, data, position) => makeNode(type, position.x, position.y, data),
        handlers: actions,
        mode: agentMode
      });
      const applied = [];
      const skipped = [];
      stages.forEach((stage) => {
        stage.applied.forEach((item) => applied.push(`${stage.title}：${item}`));
        stage.skipped.forEach((item) => skipped.push(`${stage.title}：${item}`));
        if (stage.dropped) skipped.push(`${stage.title}：模型返回了 ${stage.dropped} 条不合规产出，已丢弃`);
      });
      setAgentReply(stages.map((stage) => (stage.reply ? `【${stage.title}】${stage.reply}` : "")).filter(Boolean).join("\n"));
      setAgentApplied(applied);
      setAgentSkipped(skipped);
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err));
    } finally {
      setAgentBusy(false);
    }
  }, [agentText, agentMode, actions]);

  // —— 工具栏以画布中心为锚缩放（带空画布守卫）——
  const zoomCenter = useCallback((factor) => {
    const el = canvasRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
  }, [zoomAt]);

  // —— 快捷键：撤销 / 重做 ——
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        actions.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions]);

  // —— 小地图点击定位 ——
  const onMinimapClick = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mmX = e.clientX - rect.left;
    const mmY = e.clientY - rect.top;
    const nodes = currentRef.current?.nodes || [];
    const bounds = computeBounds(nodes);
    const scale = minimapScale(bounds, rect.width, rect.height);
    const worldX = bounds.minX + mmX / scale;
    const worldY = bounds.minY + mmY / scale;
    const vp = viewportRef.current;
    const stage = stageSize;
    actions.setViewport({
      x: stage.w / 2 - worldX * vp.zoom,
      y: stage.h / 2 - worldY * vp.zoom,
      zoom: vp.zoom
    });
  }, [actions, stageSize]);

  // —— 连线端点（屏幕坐标）——
  const edgeScreenPoint = useCallback((node, side) => {
    const vp = viewport;
    if (side === "out") return { x: (node.x + node.w) * vp.zoom + vp.x, y: (node.y + node.h / 2) * vp.zoom + vp.y };
    return { x: node.x * vp.zoom + vp.x, y: (node.y + node.h / 2) * vp.zoom + vp.y };
  }, [viewport]);

  const nodeById = useCallback((id) => current?.nodes.find((n) => n.id === id), [current]);

  // MVP-4：整张画布的运行状态（存在当前项目上，不入撤销栈）
  const workflow = current?.workflow || null;
  const workflowRunning = workflow?.state === "running";

  // —— 渲染 ——
  return (
    <div className="aiCanvasRoot">
      <div className="aiCanvasToolbar">
        <span className="aiCanvasBrand"><Network size={16} /><b>AI 无限画布</b></span>
        <span className="aiCanvasDivider" />
        <Button size="sm" tone="primary" iconOnly title="新建画布" onClick={() => actions.createProject()}><FolderPlus size={16} /></Button>
        <Button size="sm" iconOnly title="导出当前画布（JSON 备份 / 分享）" onClick={exportProject}><Download size={16} /></Button>
        <Button size="sm" iconOnly title="导入画布文件" onClick={() => transferInputRef.current?.click()}><Upload size={16} /></Button>
        <Button size="sm" iconOnly title="添加图片节点" onClick={() => fileInputRef.current?.click()}><ImageIcon size={16} /></Button>
        <Button size="sm" iconOnly title="添加提示词节点" onClick={() => addAtCenter("prompt", { text: "" })}><FileText size={16} /></Button>
        <Button size="sm" iconOnly title="添加生成节点" onClick={() => addAtCenter("generation", { model: "", prompt: "", status: "idle" })}><Sparkles size={16} /></Button>
        <Button size="sm" iconOnly title="运行画布（按连线顺序依次执行生成节点）" onClick={runWorkflow} disabled={workflowRunning}><Zap size={16} /></Button>
        <span className="aiCanvasDivider" />
        <Button size="sm" iconOnly title="撤销 (Ctrl+Z)" onClick={actions.undo} disabled={!canUndo}><Undo2 size={16} /></Button>
        <Button size="sm" iconOnly title="重做 (Ctrl+Y)" onClick={actions.redo} disabled={!canRedo}><Redo2 size={16} /></Button>
        <span className="aiCanvasDivider" />
        <Button size="sm" iconOnly title="放大" onClick={() => zoomCenter(1.2)}><ZoomIn size={16} /></Button>
        <Button size="sm" iconOnly title="缩小" onClick={() => zoomCenter(1 / 1.2)}><ZoomOut size={16} /></Button>
        <Button size="sm" iconOnly title="适应视图" onClick={() => fitView(current, stageSize, actions)}><Maximize size={16} /></Button>
        <span className="aiCanvasSpacer" />
        <span className="aiCanvasHint">滚轮缩放 · 拖空白平移 · 拖端口连线 · 自动保存</span>
        <WorkflowStatus workflow={workflow} />
        {notice ? (
          <span className={`aiCanvasNotice ${noticeIsError ? "aiCanvasNoticeWarn" : ""}`} title={notice}>{notice}</span>
        ) : null}
        {storageError ? (
          <span className="aiCanvasStorageWarn" title={storageError}>未保存 · {storageError}</span>
        ) : null}
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onPickFiles} />
        <input ref={transferInputRef} type="file" accept="application/json,.json" hidden onChange={onImportProjectFile} />
      </div>

      <div className="aiCanvasBody">
        <aside className="aiCanvasProjects">
          <div className="aiCanvasProjectsHead">画布项目</div>
          <ProjectList
            projects={state.projects}
            currentId={state.currentId}
            onOpen={actions.openProject}
            onDelete={actions.deleteProject}
          />

          <AgentPanel
            text={agentText}
            onTextChange={setAgentText}
            busy={agentBusy}
            mode={agentMode}
            onModeChange={setAgentMode}
            onRun={runAgent}
            reply={agentReply}
            applied={agentApplied}
            skipped={agentSkipped}
            error={agentError}
          />
        </aside>

        <div className="aiCanvasStage">
          {!current ? (
            <div className="aiCanvasWelcome">
              <Network size={40} />
              <p>还没有打开画布</p>
              <Button size="md" tone="primary" onClick={() => actions.createProject()}>新建画布</Button>
            </div>
          ) : (
            <div
              ref={canvasRef}
              className="aiCanvasViewport"
              onPointerDown={onCanvasPointerDown}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <svg className="aiCanvasEdges">
                {current.edges.map((edge) => {
                  const from = nodeById(edge.from);
                  const to = nodeById(edge.to);
                  if (!from || !to) return null;
                  const a = edgeScreenPoint(from, "out");
                  const b = edgeScreenPoint(to, "in");
                  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
                  return (
                    <path
                      key={edge.id}
                      className="aiCanvasEdge"
                      d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                      onClick={() => actions.deleteEdge(edge.id)}
                    />
                  );
                })}
                {pendingConn && (() => {
                  const from = nodeById(pendingConn.from);
                  if (!from) return null;
                  const a = edgeScreenPoint(from, "out");
                  const b = { x: pendingConn.x * viewport.zoom + viewport.x, y: pendingConn.y * viewport.zoom + viewport.y };
                  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
                  return (
                    <path
                      className="aiCanvasEdge aiCanvasEdgePending"
                      d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                    />
                  );
                })()}
              </svg>

              <div
                className="aiCanvasWorld"
                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
              >
                {current.nodes.map((node) => (
                  <div
                    key={node.id}
                    data-node={node.id}
                    className={`aiCanvasNode aiCanvasNode--${node.type} ${state.selectedNodeId === node.id ? "selected" : ""}`}
                    style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
                    onPointerDown={(e) => onNodePointerDown(e, node)}
                    onDoubleClick={() => node.type === "prompt" && setEditingNodeId(node.id)}
                  >
                    <div className="aiCanvasNodeHead">
                      <span>{node.type === "image" ? "图片" : node.type === "prompt" ? "提示词" : node.type === "generation" ? "生成" : node.type === "result" ? "结果" : "节点"}</span>
                      <button
                        type="button"
                        className="aiCanvasNodeDel"
                        title="删除节点"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); actions.deleteNode(node.id); }}
                      >
                        <X size={12} />
                      </button>
                    </div>

                    <div className="aiCanvasNodeBody">
                      <NodeBody
                        node={node}
                        isEditing={editingNodeId === node.id}
                        onEndEdit={() => setEditingNodeId(null)}
                        onUpdateData={actions.updateNodeData}
                        onRunGeneration={runGeneration}
                        onSelectVersion={actions.selectVersion}
                      />
                    </div>

                    <div
                      className="aiCanvasPort aiCanvasPortIn"
                      data-node-input={node.id}
                      title="输入（连线终点）"
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                    <div
                      className="aiCanvasPort aiCanvasPortOut"
                      data-node-output={node.id}
                      title="输出（拖出连线）"
                      onPointerDown={(e) => onOutputPointerDown(e, node)}
                    />
                  </div>
                ))}
              </div>

              <div className="aiCanvasMinimap" onClick={onMinimapClick}>
                <Minimap nodes={current.nodes} viewport={viewport} stageSize={stageSize} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// —— 小地图子组件 ——
function Minimap({ nodes, viewport, stageSize }) {
  const W = 180;
  const H = 120;
  const bounds = computeBounds(nodes);
  const scale = minimapScale(bounds, W, H);
  // 当前可见区域（世界坐标）
  const vis = {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    w: stageSize.w / viewport.zoom,
    h: stageSize.h / viewport.zoom
  };
  return (
    <svg width={W} height={H} className="aiCanvasMinimapSvg">
      {nodes.map((n) => (
        <rect
          key={n.id}
          x={(n.x - bounds.minX) * scale}
          y={(n.y - bounds.minY) * scale}
          width={Math.max(2, n.w * scale)}
          height={Math.max(2, n.h * scale)}
          className="aiCanvasMiniNode"
        />
      ))}
      <rect
        x={(vis.x - bounds.minX) * scale}
        y={(vis.y - bounds.minY) * scale}
        width={vis.w * scale}
        height={vis.h * scale}
        className="aiCanvasMiniView"
      />
    </svg>
  );
}

// —— 工具函数 ——
function computeBounds(nodes) {
  if (!nodes.length) return { minX: -200, minY: -150, maxX: 200, maxY: 150 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  const pad = 80;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

function minimapScale(bounds, W, H) {
  const bw = Math.max(1, bounds.maxX - bounds.minX);
  const bh = Math.max(1, bounds.maxY - bounds.minY);
  return Math.min(W / bw, H / bh);
}

function fitView(current, stageSize, actions) {
  if (!current || !current.nodes.length) {
    actions.setViewport({ x: 0, y: 0, zoom: 1 });
    return;
  }
  const bounds = computeBounds(current.nodes);
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(stageSize.w / bw, stageSize.h / bh) * 0.9));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  actions.setViewport({ x: stageSize.w / 2 - cx * zoom, y: stageSize.h / 2 - cy * zoom, zoom });
}

// React.lazy 加载本模块时只认 default 导出；其余模块按名字引用（如有）仍走上面的命名导出。
export default AiCanvasView;
