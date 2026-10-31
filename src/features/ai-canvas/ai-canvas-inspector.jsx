// src/features/ai-canvas/ai-canvas-inspector.jsx
// V157：画布节点**属性面板（Inspector）**——选中节点后在右侧面板统一编辑全部参数。
//
// 为什么是独立组件（职责单一）：V157 前节点卡片（NodeBody）里直接堆了
// 模型/渠道/尺寸/比例 四个下拉 + 提示词 + 实际参数行，固定高度（~190px）被
// `.aiCanvasNodeBody { overflow:hidden }` 裁掉，用户根本看不到模型/渠道选择。
// 根本解法（与 n8n / ComfyUI / Figma 一致）= 节点只做"画布上的图形 + 只读摘要"，
// 参数编辑统一收敛到 Inspector。这样参数再多也不会溢出节点框。
//
// 分类纪律（用户要求"代码有分类、不混乱"）：
//   数据/解析 → ai-canvas-params.js（纯逻辑，零 import）
//   节点注册表/类型 → ai-canvas-nodes.js
//   只读展示 → ai-canvas-panels.jsx（NodeBody 改为只读摘要）
//   可编辑面板 → **本文件**（ai-canvas-inspector.jsx，职责单一）
//   视图编排/状态 → ai-canvas-view.jsx
//   禁止把可编辑控件再塞回 NodeBody。
//
// 单一数据源：模型列表 `routing.models`、渠道列表 `channelsForModel()`、推理模型
// CANVAS_REASONING_MODELS——三者都已有，本组件只消费、不重新定义。
// 视觉复用 .aiCanvasGenSelect / .aiCanvasGenPrompt；新增样式一律 .aiCanvasInspector* 前缀。
import { Button } from "../../shared/ui/Button";
import {
  IMAGE_SIZE_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  buildGenerationSummary,
  resolveGenerationParams
} from "./ai-canvas-params.js";
import { channelsForModel } from "../../shared/routing.js";
import { isOutfitKind, getNodeDef } from "./ai-canvas-nodes.js";
import { AlertCircle, CheckCircle2, Loader2, Play, X } from "lucide-react";

// —— 生成节点（generation）属性面板 ——
function GenerationInspector({ node, settings, routing, models = [], onUpdateData, onRunGeneration }) {
  const data = node.data || {};
  const resolved = resolveGenerationParams(node, settings);
  const channelOptions = channelsForModel(resolved.model, routing);
  const summary = buildGenerationSummary(node, settings, channelOptions);
  const priceText = summary.price > 0 ? `¥${summary.price.toFixed(2)}/张` : "价格待定";
  return (
    <div className="aiCanvasInspectorBody">
      <div className="aiCanvasInspectorField">
        <label className="aiCanvasInspectorLabel">出图模型</label>
        <select
          className="aiCanvasGenSelect aiCanvasInspectorControl"
          title="出图模型（空=跟随设置默认）"
          value={data.model || ""}
          onChange={(e) => onUpdateData(node.id, { model: e.target.value })}
        >
          <option value="">模型·跟随</option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>{model.label || model.id}</option>
          ))}
        </select>
      </div>

      <div className="aiCanvasInspectorField">
        <label className="aiCanvasInspectorLabel">出图渠道</label>
        <select
          className="aiCanvasGenSelect aiCanvasInspectorControl"
          title="出图渠道（空=跟随设置）"
          value={data.channelId || ""}
          onChange={(e) => onUpdateData(node.id, { channelId: e.target.value })}
        >
          <option value="">渠道·跟随</option>
          {channelOptions.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.label}{Number(channel.price || 0) > 0 ? ` ¥${Number(channel.price).toFixed(2)}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="aiCanvasInspectorField">
        <label className="aiCanvasInspectorLabel">提示词</label>
        <textarea
          className="aiCanvasGenPrompt aiCanvasInspectorControl"
          placeholder="提示词（也可连一个提示词节点）"
          value={data.prompt || ""}
          onChange={(e) => onUpdateData(node.id, { prompt: e.target.value })}
        />
      </div>

      <div className="aiCanvasInspectorRow">
        <div className="aiCanvasInspectorField aiCanvasInspectorFieldGrow">
          <label className="aiCanvasInspectorLabel">尺寸</label>
          <select
            className="aiCanvasGenSelect aiCanvasInspectorControl"
            title="出图尺寸（空=跟随设置）"
            value={data.imageSize || ""}
            onChange={(e) => onUpdateData(node.id, { imageSize: e.target.value })}
          >
            <option value="">尺寸·跟随</option>
            {IMAGE_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
        <div className="aiCanvasInspectorField aiCanvasInspectorFieldGrow">
          <label className="aiCanvasInspectorLabel">比例</label>
          <select
            className="aiCanvasGenSelect aiCanvasInspectorControl"
            title="出图比例（空=跟随设置）"
            value={data.aspectRatio || ""}
            onChange={(e) => onUpdateData(node.id, { aspectRatio: e.target.value })}
          >
            <option value="">比例·跟随</option>
            {ASPECT_RATIO_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>
      </div>

      <div className="aiCanvasInspectorSummary">
        <span>实际生效</span>
        <b>{summary.model}</b>
        <span>·</span>
        <b>{summary.channelLabel || summary.channelId || "跟随"}</b>
        <span>·</span>
        <b>{summary.imageSize}</b>
        <span>·</span>
        <b>{summary.aspectRatio}</b>
        <span>·</span>
        <b>{priceText}</b>
      </div>

      <Button
        size="sm"
        tone="primary"
        className="aiCanvasInspectorRun"
        disabled={node.data?.status === "running"}
        onClick={() => onRunGeneration(node)}
      >
        {node.data?.status === "running" ? <Loader2 size={14} className="aiCanvasSpin" /> : <Play size={14} />}
        <span>{node.data?.status === "running" ? "生成中…" : "执行生成"}</span>
      </Button>
      {node.data?.status === "failed" ? (
        <span className="aiCanvasGenError"><AlertCircle size={13} /> {node.data.error}</span>
      ) : null}
      {node.data?.status === "success" ? (
        <span className="aiCanvasGenOk"><CheckCircle2 size={13} /> {node.data.usedModel || ""} · 已生成结果节点</span>
      ) : null}
    </div>
  );
}

// —— outfit 节点属性面板（提示词 / 部位 / 掩膜约束）——
function OutfitInspector({ node, onUpdateData, onRunGeneration }) {
  const data = node.data || {};
  const def = getNodeDef(node.type);
  return (
    <div className="aiCanvasInspectorBody">
      <div className="aiCanvasInspectorField">
        <label className="aiCanvasInspectorLabel">提示词</label>
        <textarea
          className="aiCanvasGenPrompt aiCanvasInspectorControl"
          placeholder="提示词（也可连一个提示词节点）"
          value={data.prompt || ""}
          onChange={(e) => onUpdateData(node.id, { prompt: e.target.value })}
        />
      </div>

      {node.type === "outfit-tryon" ? (
        <div className="aiCanvasInspectorField">
          <label className="aiCanvasInspectorLabel">换装部位</label>
          <div className="aiCanvasInspectorCheckRow">
            <label className="aiCanvasCheckRow">
              <input
                type="checkbox"
                checked={Array.isArray(data.outfitIntent?.parts) ? data.outfitIntent.parts.includes("upper") : true}
                onChange={(e) => {
                  const parts = new Set(data.outfitIntent?.parts || ["upper", "lower"]);
                  if (e.target.checked) parts.add("upper"); else parts.delete("upper");
                  onUpdateData(node.id, { outfitIntent: { ...(data.outfitIntent || {}), parts: [...parts] } });
                }}
              /> 上装
            </label>
            <label className="aiCanvasCheckRow">
              <input
                type="checkbox"
                checked={Array.isArray(data.outfitIntent?.parts) ? data.outfitIntent.parts.includes("lower") : true}
                onChange={(e) => {
                  const parts = new Set(data.outfitIntent?.parts || ["upper", "lower"]);
                  if (e.target.checked) parts.add("lower"); else parts.delete("lower");
                  onUpdateData(node.id, { outfitIntent: { ...(data.outfitIntent || {}), parts: [...parts] } });
                }}
              /> 下装
            </label>
            <select
              className="aiCanvasGenSelect aiCanvasInspectorControl aiCanvasInspectorMaskMode"
              title="掩膜约束（默认关闭）"
              value={data.maskMode || "none"}
              onChange={(e) => onUpdateData(node.id, { maskMode: e.target.value })}
            >
              <option value="none">掩膜·关闭</option>
              <option value="garment">服装区</option>
              <option value="body">人体区</option>
            </select>
          </div>
        </div>
      ) : null}

      <Button
        size="sm"
        tone="primary"
        className="aiCanvasInspectorRun"
        disabled={node.data?.status === "running"}
        onClick={() => onRunGeneration(node)}
      >
        {node.data?.status === "running" ? <Loader2 size={14} className="aiCanvasSpin" /> : <Play size={14} />}
        <span>{node.data?.status === "running" ? "生成中…" : `执行${def?.label || "生成"}`}</span>
      </Button>
      {node.data?.status === "failed" ? (
        <span className="aiCanvasGenError"><AlertCircle size={13} /> {node.data.error}</span>
      ) : null}
      {node.data?.status === "success" ? (
        <span className="aiCanvasGenOk"><CheckCircle2 size={13} /> {node.data.usedModel || ""} · 已生成结果节点</span>
      ) : null}
    </div>
  );
}

// —— 基础节点（image / prompt / result）只读信息 ——
function BaseInspector({ node }) {
  const def = getNodeDef(node.type);
  let info = "该节点无可编辑参数。";
  if (node.type === "prompt") info = `提示词：${node.data?.text || "（空）"}`;
  else if (node.type === "image") info = node.data?.name ? `图片：${node.data.name}` : "图片节点";
  else if (node.type === "result") info = node.data?.name ? `结果：${node.data.name}` : "结果节点";
  return (
    <div className="aiCanvasInspectorBody">
      <div className="aiCanvasInspectorField">
        <label className="aiCanvasInspectorLabel">{def?.label || node.type}</label>
        <p className="aiCanvasInspectorReadOnly">{info}</p>
      </div>
    </div>
  );
}

// —— Inspector 容器：选中节点后由视图渲染；本组件只在其之上呈现，不改动 store 语义 ——
export function NodeInspector({
  node,
  settings = null,
  routing = null,
  models = [],
  onUpdateData,
  onRunGeneration,
  onClose
}) {
  if (!node) return null;
  const def = getNodeDef(node.type);
  let body;
  if (node.type === "generation") {
    body = (
      <GenerationInspector
        node={node}
        settings={settings}
        routing={routing}
        models={models}
        onUpdateData={onUpdateData}
        onRunGeneration={onRunGeneration}
      />
    );
  } else if (isOutfitKind(node.type)) {
    body = <OutfitInspector node={node} onUpdateData={onUpdateData} onRunGeneration={onRunGeneration} />;
  } else {
    body = <BaseInspector node={node} />;
  }
  return (
    <aside className="aiCanvasInspector" data-node-type={node.type}>
      <div className="aiCanvasInspectorHead">
        <span className="aiCanvasInspectorTitle">{def?.label || node.type}</span>
        <button
          type="button"
          className="aiCanvasInspectorClose"
          title="关闭属性面板（取消选中）"
          onClick={() => onClose?.(node.id)}
        >
          <X size={14} />
        </button>
      </div>
      {body}
    </aside>
  );
}

export default NodeInspector;
