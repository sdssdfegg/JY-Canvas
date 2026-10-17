// quick-crop-panels.jsx —— RF-082 从 src/main.jsx 逐字抽出（加 export），未改逻辑。
import { useEffect, useRef, useState } from "react";
import { Crop, Loader2, RotateCcw } from "lucide-react";
import { cropQuickReferenceViewportFile, quickReferenceOriginalFile } from "../upload/reference-upload.js";
import { ratioValue } from "../local-edit/crop-rect-resize.js";
import { clampCropTransform } from "../../shared/local-edit-geometry.js";
import { Modal, ModalHeader } from "../../shared/ui/Modal.jsx";
import { Button } from "../../shared/ui/Button";

export function QuickCropViewportModal({ item, ratio, onClose, onApply, onClear }) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [working, setWorking] = useState(false);
  const originalFile = quickReferenceOriginalFile(item);
  const activeRatio = ratio || "3:4";
  const activeRatioValue = ratioValue(activeRatio);
  const savedCrop = item?.cropEdit;

  useEffect(() => {
    if (!originalFile) return undefined;
    const nextUrl = URL.createObjectURL(originalFile);
    setImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [originalFile]);

  function minCropScale() {
    const frame = stageRef.current?.getBoundingClientRect();
    if (!frame?.width || !frame?.height || !imageSize.width || !imageSize.height) return 1;
    const containScale = Math.min(frame.width / imageSize.width, frame.height / imageSize.height);
    const coverScale = Math.max(frame.width / imageSize.width, frame.height / imageSize.height);
    return Math.max(1, coverScale / containScale);
  }

  function resetTransform() {
    setTransform({ x: 0, y: 0, scale: minCropScale() });
  }

  useEffect(() => {
    if (!imageSize.width || !imageSize.height) return undefined;
    const frame = window.requestAnimationFrame(resetTransform);
    return () => window.cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize.height, imageSize.width, item?.id, activeRatio]);

  function beginDrag(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      start: transform
    };
  }

  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    setTransform(clampCropTransform({
      ...drag.start,
      x: drag.start.x + event.clientX - drag.x,
      y: drag.start.y + event.clientY - drag.y
    }, {
      frame: stageRef.current?.getBoundingClientRect(),
      imageSize,
      minScale: minCropScale()
    }));
  }

  function endDrag(event) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
  }

  function zoomByWheel(event) {
    event.preventDefault();
    event.stopPropagation();
    const step = event.deltaY > 0 ? -0.08 : 0.08;
    setTransform((current) => clampCropTransform({
      ...current,
      scale: current.scale + step
    }, {
      frame: stageRef.current?.getBoundingClientRect(),
      imageSize,
      minScale: minCropScale()
    }));
  }

  async function applyCrop() {
    if (working) return;
    const frame = stageRef.current?.getBoundingClientRect();
    if (!frame?.width || !frame?.height) return;
    setWorking(true);
    try {
      const cropped = await cropQuickReferenceViewportFile(item, {
        ...transform,
        stageWidth: frame.width,
        stageHeight: frame.height
      }, activeRatio);
      onApply(item.id, cropped);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal
      layerClassName="modalLayer previewLayer"
      panelClassName="quickLocalEditModal quickCropViewportModal"
      onClose={onClose}
    >
      <ModalHeader
        title="普通裁剪"
        subtitle={<>{originalFile?.name || "上传图片"} · 裁剪后的参考图参与生成 · {activeRatio}</>}
        onClose={onClose}
        closeLabel="关闭"
      />
        <div className="quickCropViewportWrap">
          <div
            className="quickCropViewportStage"
            ref={stageRef}
            style={{ aspectRatio: `${activeRatioValue}` }}
            onPointerDown={beginDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={zoomByWheel}
          >
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                onLoad={(event) => {
                  setImageSize({
                    width: event.currentTarget.naturalWidth || 0,
                    height: event.currentTarget.naturalHeight || 0
                  });
                }}
                style={{
                  transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})`
                }}
              />
            )}
          </div>
        </div>
        <footer>
          <span>拖动画面调整位置，滚轮缩放图片，确认后只保存裁剪后的参考图。</span>
          <div>
            {savedCrop && (
              <Button size="sm" onClick={() => onClear(item.id)}>
                <RotateCcw size={15} />
                <span>取消裁剪</span>
              </Button>
            )}
            <Button size="sm" onClick={onClose}>取消</Button>
            <Button size="md" tone="primary" className="quickLocalApplyButton" onClick={applyCrop} disabled={working}>
              {working ? <Loader2 size={16} className="spin" /> : <Crop size={16} />}
              <span>应用裁剪</span>
            </Button>
          </div>
        </footer>
    </Modal>
  );
}
