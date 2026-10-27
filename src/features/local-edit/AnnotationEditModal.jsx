// 标注式 AI 编辑弹窗（V4.0 新增，src/features/local-edit/）。
//
// 定位：快捷生成结果图的「标注 + 编辑指令」编辑入口。优先沿用现有弹窗壳（src/shared/ui/Modal）
// 与本地编辑的坐标范式，但**不**复用 LocalEditModal 的像素蒙版模型——本弹窗的标注是
// 结构化对象（rect/circle/arrow/brush + 颜色 + 归一化坐标），独立于原图保存，绝不把
// 红色矩形/箭头/画笔永久覆盖进原图像素（任务 §五）。
//
// 坐标：所有标注以「归一化 [0,1] 相对原图」存储（见 src/shared/annotation-geometry.js），
// 渲染用 viewBox="0 0 1 1" + vector-effect="non-scaling-stroke"，故图片缩放 / 弹窗尺寸变化 /
// 原图比例 任意改变，标注始终对齐（验收 §九 8）。
//
// 数据隔离：标注按 item.id 隔离（父组件持有草稿 Map，弹窗以 item.id 为 key 挂载），
// 关闭并重新打开不会串到另一张图（验收 §九「关闭重开不串图」）。
//
// 提交：点「使用」→ onApply(item.id, { annotations, instruction })，由上层 handler 复用现有
// generate 流程（原图不修改、生成「标注参考图」作为参考输入，并明确局部编辑局限）。

import { useRef, useState, useEffect, useCallback } from "react";
import {
  Square,
  Circle,
  ArrowUpRight,
  Pencil,
  Undo2,
  Redo2,
  Download,
  Check,
  Trash2
} from "lucide-react";
import { Modal, ModalHeader } from "../../shared/ui/Modal.jsx";
import { Button } from "../../shared/ui/Button";
import { imageSourceFromResult } from "../../shared/models.js";
import {
  ANNOTATION_COLORS,
  clientPointToNormalized,
  normalizeRect,
  arrowHeadPoints,
  arrowHeadLength,
  annotationsToImageBlob
} from "../../shared/annotation-geometry.js";

const TOOLS = [
  { id: "rect", label: "矩形", icon: Square },
  { id: "circle", label: "圆形", icon: Circle },
  { id: "arrow", label: "箭头", icon: ArrowUpRight },
  { id: "brush", label: "画笔", icon: Pencil }
];

// aspect = 原图宽高比（w/h）。SVG 用 viewBox="0 0 1 1" + preserveAspectRatio="none"，
// x/y 缩放系数不同 ⇒ 直接在归一化空间算箭头头部会被拉歪；先按 aspect 把 x 拉到等比空间算，再映射回来。
function AnnotationShape({ ann, aspect = 1 }) {
  const color = ann.color || ANNOTATION_COLORS[0];
  const common = {
    stroke: color,
    fill: "none",
    strokeWidth: 2.5,
    vectorEffect: "non-scaling-stroke",
    strokeLinejoin: "round",
    strokeLinecap: "round"
  };
  if (ann.type === "rect") {
    // 允许反向拖拽：渲染时归一化成正尺寸（SVG rect 负宽高不渲染）。
    const box = normalizeRect(ann.x, ann.y, ann.x + ann.w, ann.y + ann.h);
    return <rect x={box.x} y={box.y} width={box.w} height={box.h} {...common} />;
  }
  if (ann.type === "circle") {
    const rx = Math.abs(ann.w) / 2;
    const ry = Math.abs(ann.h) / 2;
    return (
      <ellipse
        cx={ann.x + ann.w / 2}
        cy={ann.y + ann.h / 2}
        rx={rx}
        ry={ry}
        {...common}
      />
    );
  }
  if (ann.type === "arrow") {
    // 方向 = 起点 → 终点，w/h 必须保留符号（不能归一化，否则反向拖拽方向被翻转）。
    const ax = ann.x;
    const ay = ann.y;
    const bx = ann.x + ann.w;
    const by = ann.y + ann.h;
    const ahx = ax * aspect;
    const bhx = bx * aspect;
    const hl = arrowHeadLength(ahx, ay, bhx, by, 0.012, 0.06, 0.22);
    const [p1, p2] = arrowHeadPoints(ahx, ay, bhx, by, hl);
    const h1 = { x: p1.x / aspect, y: p1.y };
    const h2 = { x: p2.x / aspect, y: p2.y };
    return (
      <g>
        <line x1={ax} y1={ay} x2={bx} y2={by} {...common} />
        <polygon
          points={`${bx},${by} ${h1.x},${h1.y} ${h2.x},${h2.y}`}
          fill={color}
          stroke="none"
        />
      </g>
    );
  }
  if (ann.type === "brush") {
    const pts = (ann.points || []).map((p) => `${p.nx},${p.ny}`).join(" ");
    if (ann.points && ann.points.length === 1) {
      const p = ann.points[0];
      return <circle cx={p.nx} cy={p.ny} r={0.008} fill={color} stroke="none" />;
    }
    return <polyline points={pts} {...common} />;
  }
  return null;
}

export function AnnotationEditModal({ item, onClose, onApply, initialAnnotations = null, onAnnotationsChange, imageSrc = "" }) {
  const ownSrc = imageSourceFromResult(item?.image);
  const src = imageSrc || ownSrc;
  const svgRef = useRef(null);
  const drawingRef = useRef(false);

  const [instruction, setInstruction] = useState("");
  const [imageAspect, setImageAspect] = useState(1);
  const [annotations, setAnnotations] = useState([]);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [tool, setTool] = useState("rect");
  const [color, setColor] = useState(ANNOTATION_COLORS[0]);
  const [draftAnn, setDraftAnn] = useState(null);
  const [working, setWorking] = useState(false);

  // 按 item.id 隔离：每次挂载（父以 id 为 key）从外部草稿恢复；卸载前父层已存草稿。
  // 仅在挂载时执行一次（item 由父以 key 控制重挂，切图即重挂 ⇒ 不会串图）。
  useEffect(() => {
    if (Array.isArray(initialAnnotations) && initialAnnotations.length > 0) {
      setAnnotations(initialAnnotations.map((a) => ({ ...a })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 标注变化回传给父层（按 item.id 存入草稿 Map），保证关闭重开不丢失、且不串图。
  useEffect(() => {
    if (onAnnotationsChange) onAnnotationsChange(item.id, annotations);
  }, [annotations, item?.id, onAnnotationsChange]);

  const pointFromEvent = useCallback((event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return clientPointToNormalized(event.clientX, event.clientY, rect);
  }, []);

  const commit = useCallback((ann) => {
    if (!ann) return;
    setHistory((h) => [...h, annotations]);
    setFuture([]);
    setAnnotations((list) => [...list, ann]);
  }, [annotations]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [annotations, ...f]);
      setAnnotations(prev);
      return h.slice(0, -1);
    });
  }, [annotations]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, annotations]);
      setAnnotations(next);
      return f.slice(1);
    });
  }, [annotations]);

  const clearAnnotations = useCallback(() => {
    if (annotations.length === 0) return;
    setHistory((h) => [...h, annotations]);
    setFuture([]);
    setAnnotations([]);
  }, [annotations]);

  const onPointerDown = useCallback((event) => {
    const p = pointFromEvent(event);
    if (!p) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    if (tool === "brush") {
      setDraftAnn({ type: "brush", color, points: [{ nx: p.nx, ny: p.ny }] });
    } else {
      setDraftAnn({ type: tool, x: p.nx, y: p.ny, w: 0, h: 0, color });
    }
  }, [tool, color, pointFromEvent]);

  const onPointerMove = useCallback((event) => {
    if (!drawingRef.current || !draftAnn) return;
    const p = pointFromEvent(event);
    if (!p) return;
    if (draftAnn.type === "brush") {
      setDraftAnn((prev) => prev ? { ...prev, points: [...prev.points, { nx: p.nx, ny: p.ny }] } : prev);
    } else {
      setDraftAnn((prev) => prev ? { ...prev, w: p.nx - prev.x, h: p.ny - prev.y } : prev);
    }
  }, [draftAnn, pointFromEvent]);

  const onPointerUp = useCallback((event) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDraftAnn((current) => {
      if (!current) return null;
      if (current.type === "brush") {
        if ((current.points || []).length >= 1) commit(current);
      } else {
        const tiny = Math.abs(current.w) < 0.005 && Math.abs(current.h) < 0.005;
        if (!tiny) {
          // 箭头必须保留 w/h 符号（方向 = 起点→终点）；只有矩形/圆需要归一化成正尺寸。
          commit(current.type === "arrow"
            ? current
            : { ...current, ...normalizeRect(current.x, current.y, current.x + current.w, current.y + current.h) });
        }
      }
      return null;
    });
  }, [commit]);

  async function handleDownload() {
    try {
      setWorking(true);
      const blob = await annotationsToImageBlob(await fetchOriginal(item), annotations, "image/png");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `标注参考图-${(item?.id || "image").slice(-8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setWorking(false);
    }
  }

  function handleUse() {
    // 不改变原图：把结构化标注 + 编辑指令 + 原图结果对象交给上层，
    // 由上层复用现有 generate 流程（见 main-handlers.applyQuickAnnotationEdit）。
    onApply(item, { annotations: annotations.map((a) => ({ ...a })), instruction: instruction.trim() });
  }

  const canUse = annotations.length > 0 || instruction.trim().length > 0;

  return (
    <Modal layerClassName="modalLayer previewLayer" panelClassName="annotationEditModal" onClose={onClose}>
      <ModalHeader
        title="标注式 AI 编辑"
        subtitle={<>在图上标注要修改的区域，并填写编辑指令</>}
        onClose={onClose}
        closeLabel="关闭"
      />
      <div className="annotationEditBody">
        <div className="annotationStageWrap">
          <div className="annotationStage">
            <div className="annotationImageBox">
              {src ? (
                <img
                  className="annotationStageImage"
                  src={src}
                  alt=""
                  draggable={false}
                  onLoad={(event) => {
                    const w = event.target.naturalWidth;
                    const h = event.target.naturalHeight;
                    if (w > 0 && h > 0) setImageAspect(w / h);
                  }}
                />
              ) : (
                <div className="annotationStageEmpty">原图不可用</div>
              )}
              <svg
                ref={svgRef}
                className="annotationCanvas"
                viewBox="0 0 1 1"
                preserveAspectRatio="none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onContextMenu={(e) => e.preventDefault()}
              >
                {annotations.map((ann, index) => (
                  <AnnotationShape key={index} ann={ann} aspect={imageAspect} />
                ))}
                {draftAnn && <AnnotationShape ann={draftAnn} aspect={imageAspect} />}
              </svg>
            </div>
          </div>
          <p className="annotationHint">
            矩形 / 圆形 / 箭头 / 画笔在图上拖拽标注；坐标以原图比例保存，缩放与窗口变化不影响位置。
          </p>
        </div>

        <aside className="annotationSide">
          <div className="annotationField">
            <label className="annotationFieldLabel">编辑指令</label>
            <textarea
              className="annotationInstruction"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="例如：把标注区域的背景换成纯白色，人物保持不变"
              rows={5}
            />
            <div className="annotationInstructionActions">
              <Button size="sm" onClick={() => setInstruction("")} title="清空指令">
                <Trash2 size={14} />
                <span>清空指令</span>
              </Button>
            </div>
          </div>

          <div className="annotationField">
            <label className="annotationFieldLabel">已标注 {annotations.length} 处</label>
            <p className="annotationNote">
              标注仅作为编辑引导参考。当前模型未启用「真实局部蒙版」，提交后会把原图与标注参考图一并送入生成，
              模型不一定按区域精确修改；如需严格局部重绘请使用「局部回贴」。
            </p>
          </div>
        </aside>
      </div>

      <footer className="annotationToolbar">
        <div className="annoToolGroup" role="group" aria-label="标注形状">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <Button
                key={t.id}
                size="sm"
                iconOnly
                tone={tool === t.id ? "primary" : "default"}
                active={tool === t.id}
                title={t.label}
                aria-label={t.label}
                onClick={() => setTool(t.id)}
              >
                <Icon size={15} />
              </Button>
            );
          })}
        </div>

        <div className="annoColorGroup" role="group" aria-label="标注颜色">
          {ANNOTATION_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`annoColorSwatch ${color === c ? "active" : ""}`}
              style={{ background: c }}
              title={c}
              aria-label={`颜色 ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        <div className="annoToolGroup" role="group" aria-label="历史">
          <Button size="sm" iconOnly onClick={undo} disabled={history.length === 0} title="撤销" aria-label="撤销">
            <Undo2 size={15} />
          </Button>
          <Button size="sm" iconOnly onClick={redo} disabled={future.length === 0} title="重做" aria-label="重做">
            <Redo2 size={15} />
          </Button>
          <Button size="sm" iconOnly onClick={clearAnnotations} disabled={annotations.length === 0} title="清除标注" aria-label="清除标注">
            <Trash2 size={15} />
          </Button>
        </div>

        <div className="annoSpacer" />

        <div className="annoToolGroup" role="group" aria-label="操作">
          <Button size="sm" iconOnly onClick={handleDownload} loading={working} title="下载标注参考图（不修改原图）" aria-label="下载标注参考图">
            <Download size={15} />
          </Button>
          <Button size="md" tone="primary" onClick={handleUse} disabled={!canUse} title="提交给现有图像编辑流程">
            <Check size={16} />
            <span>使用</span>
          </Button>
        </div>
      </footer>
    </Modal>
  );
}

// 取原图 Blob：复用与 blobFromImageItem 同路的资源读取（data:/blob:/远程 URL 均可）。
async function fetchOriginal(target) {
  const { fetchLocalBlob } = await import("../../api/assets.js");
  const { imageSourceFromResult: srcOf } = await import("../../shared/models.js");
  const src = srcOf(target?.image);
  if (!src) throw new Error("无法定位原图地址");
  return fetchLocalBlob(src);
}
