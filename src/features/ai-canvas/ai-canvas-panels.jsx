// src/features/ai-canvas/ai-canvas-panels.jsx
// V143：AI 无限画布的**渲染子组件**（从 ai-canvas-view.jsx 拆出）。
//
// 为什么拆成单独文件：AiCanvasView 一度涨到 595 行（函数预算 600），再叠功能就撞顶。
// 拆到独立文件后，视图的「文件行数」与「主函数行数」**双双下降**——
// 若只在同一文件内提子组件，主函数降了、文件总量反而升（props 管道比内联 JSX 更占行），
// 体量棘轮会判文件回归。迁出才是真正的减负。
//
// 这些组件只依赖传入的 props，不共享父组件的可变闭包，因此搬出来语义零变化。
import { Button } from "../../shared/ui/Button";
import { versionSummary } from "./ai-canvas-versions.js";
import { buildGenerationSummary, resolveGenerationParams } from "./ai-canvas-params.js";
// 2026-11-01：画布 Agent 的推理（文本）模型清单（含默认值）。
import { channelsForModel } from "../../shared/routing.js";
import { isOutfitKind, getNodeDef } from "./ai-canvas-nodes.js";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Play,
  Send,
  Trash2
} from "lucide-react";

// —— 左侧栏：画布项目列表 ——
export function ProjectList({ projects, currentId, onOpen, onDelete }) {
  return (
    <div className="aiCanvasProjectList">
      {projects.length === 0 && <p className="aiCanvasEmpty">还没有画布，点上方「新建画布」开始。</p>}
      {projects.map((project) => (
        <div
          key={project.id}
          className={`aiCanvasProjectItem ${project.id === currentId ? "active" : ""}`}
          onClick={() => onOpen(project.id)}
        >
          <FolderOpen size={14} />
          <span className="aiCanvasProjectName" title={project.name}>{project.name}</span>
          <button
            type="button"
            className="aiCanvasProjectDel"
            title="删除项目"
            onClick={(ev) => {
              ev.stopPropagation();
              if (window.confirm(`删除画布「${project.name}」？此操作不可撤销。`)) onDelete(project.id);
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// —— 左侧栏底部：画布 Agent 指令面板 ——
export function AgentPanel({
  text,
  onTextChange,
  busy,
  mode,
  onModeChange,
  onRun,
  reply,
  applied,
  skipped,
  error,
  agentModel = "",
  onAgentModelChange,
  modelOptions = [],
  // 2026-11-01：生图模型 + 渠道下拉（与生成节点 Inspector 同源），
  // 让 Agent 新建的生成节点直接带上所选模型 / 渠道。
  genModels = [],
  genModel = "",
  onGenModelChange,
  routing = null,
  channel = "",
  onChannelChange
}) {
  // 渠道随生图模型过滤（与 Inspector 同一份 channelsForModel）。
  const agentChannelOptions = channelsForModel(genModel, routing);
  return (
    <div className="aiCanvasAgent">
      <div className="aiCanvasAgentHead"><Bot size={14} /><span>画布 Agent</span></div>
      <select
        className="aiCanvasAgentMode"
        value={mode || "auto"}
        disabled={busy}
        title="选择 Agent 编排方式：先搭图再写提示词 / 只搭图 / 只写提示词"
        onChange={(e) => onModeChange?.(e.target.value)}
      >
        <option value="auto">自动编排：先搭图，再写提示词</option>
        <option value="plan">只搭图</option>
        <option value="prompt">只写提示词</option>
      </select>
      {/* 2026-11-01：推理模型可选。默认 gpt-5.6-luna（与服务端兜底同值）；
          不持久化，重启回到默认值。 */}
      <select
        className="aiCanvasAgentMode aiCanvasAgentModel"
        value={agentModel || ""}
        disabled={busy}
        title="选择画布 Agent 用的推理（文本）模型；留空=跟随服务端默认"
        onChange={(e) => onAgentModelChange?.(e.target.value)}
      >
        <option value="">推理模型·跟随</option>
        {modelOptions.map((model) => (
          <option key={model.id} value={model.id}>{model.label || model.id}</option>
        ))}
      </select>
      {/* 生图模型：Agent 新建生成节点的默认出图模型；留空=跟随设置默认。
          切换模型时清空渠道，避免渠道与模型不匹配。 */}
      <select
        className="aiCanvasAgentMode aiCanvasAgentGenModel"
        value={genModel || ""}
        disabled={busy}
        title="Agent 新建生成节点的默认出图模型；留空=跟随设置默认"
        onChange={(e) => { onGenModelChange?.(e.target.value); onChannelChange?.(""); }}
      >
        <option value="">生图模型·跟随</option>
        {genModels.map((model) => (
          <option key={model.id} value={model.id}>{model.label || model.id}</option>
        ))}
      </select>
      {/* 渠道：按所选生图模型过滤（与 Inspector 同款）。无明确模型时禁用，强制跟随。 */}
      <select
        className="aiCanvasAgentMode aiCanvasAgentChannel"
        value={channel || ""}
        disabled={busy || !genModel}
        title="Agent 新建生成节点的出图渠道（按所选模型过滤）；留空=跟随设置"
        onChange={(e) => onChannelChange?.(e.target.value)}
      >
        <option value="">渠道·跟随</option>
        {agentChannelOptions.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.label}{Number(ch.price || 0) > 0 ? ` ¥${Number(ch.price).toFixed(2)}` : ""}
          </option>
        ))}
      </select>
      <textarea
        className="aiCanvasAgentInput"
        placeholder="用一句话说要做什么，例如：把两张图连到生成节点，提示词写成换成红色连衣裙"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onRun(); }}
      />
      <Button size="sm" tone="primary" disabled={busy || !text.trim()} onClick={onRun}>
        {busy ? <Loader2 size={14} className="aiCanvasSpin" /> : <Send size={14} />}
        <span>{busy ? "思考中…" : "执行"}</span>
      </Button>
      {error ? <span className="aiCanvasGenError"><AlertCircle size={13} /> {error}</span> : null}
      {reply ? <p className="aiCanvasAgentReply">{reply}</p> : null}
      {applied.length ? (
        <ul className="aiCanvasAgentList">{applied.map((item, i) => <li key={`a${i}`}>{item}</li>)}</ul>
      ) : null}
      {skipped.length ? (
        <ul className="aiCanvasAgentList aiCanvasAgentListWarn">{skipped.map((item, i) => <li key={`s${i}`}>{item}</li>)}</ul>
      ) : null}
    </div>
  );
}

// —— 工具栏右侧：整张画布的运行状态条（只在运行 / 完成 / 失败时出现，其余不占位）——
export function WorkflowStatus({ workflow }) {
  if (!workflow) return null;
  if (workflow.state === "running") {
    const total = (workflow.queue || []).length;
    return <span className="aiCanvasWorkflowMsg">运行中 {Math.min(workflow.index + 1, total)}/{total}</span>;
  }
  if (workflow.state === "done") {
    return <span className="aiCanvasWorkflowMsg">已跑完 {workflow.ranCount} 个生成节点</span>;
  }
  if (workflow.state === "failed") {
    return <span className="aiCanvasWorkflowMsg aiCanvasWorkflowMsgErr">运行失败：{workflow.error}</span>;
  }
  return null;
}

// —— 节点体：按类型渲染内容 ——
// 生成节点带模型 / 提示词 / 执行按钮；图片与结果节点出图；提示词节点可双击编辑。
export function NodeBody({ node, isEditing, onEndEdit, onUpdateData, onRunGeneration, onSelectVersion, _models = [], settings = null, routing = null }) {
  if (node.type === "generation") {
    const versions = versionSummary(node.data);
    // V157：节点卡片改为**只读摘要**。所有可编辑控件（模型/渠道/尺寸/比例/提示词）
    // 已迁到属性面板（ai-canvas-inspector.jsx），节点只展示当前生效值，
    // 不再因固定高度 + overflow:hidden 把控件裁掉导致"看不到模型/渠道"。
    const resolved = resolveGenerationParams(node, settings);
    const channelOptions = channelsForModel(resolved.model, routing);
    const summary = buildGenerationSummary(node, settings, channelOptions);
    const priceText = summary.price > 0 ? `¥${summary.price.toFixed(2)}/张` : "价格待定";
    return (
      <div className="aiCanvasGenBody aiCanvasGenSummary">
        <div className="aiCanvasGenSummaryGrid">
          <span className="aiCanvasGenSummaryKey">模型</span>
          <b className="aiCanvasGenSummaryVal">{summary.model}</b>
          <span className="aiCanvasGenSummaryKey">渠道</span>
          <b className="aiCanvasGenSummaryVal">{summary.channelLabel || summary.channelId || "跟随"}</b>
          <span className="aiCanvasGenSummaryKey">尺寸</span>
          <b className="aiCanvasGenSummaryVal">{summary.imageSize}</b>
          <span className="aiCanvasGenSummaryKey">比例</span>
          <b className="aiCanvasGenSummaryVal">{summary.aspectRatio}</b>
          <span className="aiCanvasGenSummaryKey">单价</span>
          <b className="aiCanvasGenSummaryVal">{priceText}</b>
        </div>
        <Button
          size="sm"
          tone="primary"
          disabled={node.data.status === "running"}
          onClick={() => onRunGeneration(node)}
        >
          {node.data.status === "running" ? <Loader2 size={14} className="aiCanvasSpin" /> : <Play size={14} />}
          <span>{node.data.status === "running" ? "生成中…" : "执行生成"}</span>
        </Button>
        {node.data.status === "failed" ? (
          <span className="aiCanvasGenError"><AlertCircle size={13} /> {node.data.error}</span>
        ) : null}
        {node.data.status === "success" ? (
          <span className="aiCanvasGenOk"><CheckCircle2 size={13} /> {node.data.usedModel || ""} · 已生成结果节点</span>
        ) : null}
        {versions.total > 1 ? (
          <div className="aiCanvasGenVersions">
            <button
              type="button"
              className="aiCanvasGenVersionBtn"
              title="上一版"
              disabled={!versions.hasPrev}
              onClick={() => onSelectVersion?.(node.id, versions.index - 1)}
            >‹</button>
            <span className="aiCanvasGenVersionText">第 {versions.index + 1}/{versions.total} 版</span>
            <button
              type="button"
              className="aiCanvasGenVersionBtn"
              title="下一版"
              disabled={!versions.hasNext}
              onClick={() => onSelectVersion?.(node.id, versions.index + 1)}
            >›</button>
          </div>
        ) : null}
      </div>
    );
  }
  if (isOutfitKind(node.type)) {
    const def = getNodeDef(node.type);
    const versions = versionSummary(node.data);
    // V157：outfit 节点同样改为只读摘要，可编辑项（提示词 / 部位 / 掩膜约束）迁到属性面板。
    const maskLabel = { none: "关闭", garment: "服装区", body: "人体区" }[node.data.maskMode || "none"] || "关闭";
    const partsLabel = Array.isArray(node.data.outfitIntent?.parts)
      ? node.data.outfitIntent.parts.map((p) => (p === "upper" ? "上装" : p === "lower" ? "下装" : p)).join("/")
      : "上装/下装";
    return (
      <div className="aiCanvasGenBody aiCanvasGenSummary">
        <p className="aiCanvasInspectorReadOnly">{node.data.prompt ? node.data.prompt : "（空提示词）"}</p>
        <span className="aiCanvasGenVersionText">
          {def?.label} · 部位 {partsLabel} · 掩膜 {maskLabel}
        </span>
        <Button
          size="sm"
          tone="primary"
          disabled={node.data.status === "running"}
          onClick={() => onRunGeneration(node)}
        >
          {node.data.status === "running" ? <Loader2 size={14} className="aiCanvasSpin" /> : <Play size={14} />}
          <span>{node.data.status === "running" ? "生成中…" : `执行${def?.label || "生成"}`}</span>
        </Button>
        {node.data.status === "failed" ? (
          <span className="aiCanvasGenError"><AlertCircle size={13} /> {node.data.error}</span>
        ) : null}
        {node.data.status === "success" ? (
          <span className="aiCanvasGenOk"><CheckCircle2 size={13} /> {node.data.usedModel || ""} · 已生成结果节点</span>
        ) : null}
        {versions.total > 1 ? (
          <div className="aiCanvasGenVersions">
            <button type="button" className="aiCanvasGenVersionBtn" title="上一版" disabled={!versions.hasPrev} onClick={() => onSelectVersion?.(node.id, versions.index - 1)}>‹</button>
            <span className="aiCanvasGenVersionText">第 {versions.index + 1}/{versions.total} 版</span>
            <button type="button" className="aiCanvasGenVersionBtn" title="下一版" disabled={!versions.hasNext} onClick={() => onSelectVersion?.(node.id, versions.index + 1)}>›</button>
          </div>
        ) : null}
      </div>
    );
  }
  if (node.type === "result") {
    return (node.data.src || node.data.url)
      ? <img src={node.data.src || node.data.url} alt={node.data.name || "结果"} draggable={false} />
      : <span className="aiCanvasNodePlaceholder">（空结果）</span>;
  }
  if (node.type === "image") {
    return node.data.src
      ? <img src={node.data.src} alt={node.data.name || "图片"} draggable={false} />
      : <span className="aiCanvasNodePlaceholder">（空图片）</span>;
  }
  if (node.type === "prompt") {
    return isEditing ? (
      <textarea
        autoFocus
        className="aiCanvasPromptEdit"
        defaultValue={node.data.text || ""}
        onBlur={(e) => { onUpdateData(node.id, { text: e.target.value }); onEndEdit(); }}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { onUpdateData(node.id, { text: e.target.value }); onEndEdit(); } }}
      />
    ) : (
      <span className="aiCanvasPromptText">{node.data.text || "（双击编辑提示词）"}</span>
    );
  }
  return <span className="aiCanvasNodePlaceholder">{node.data.text || ""}</span>;
}
