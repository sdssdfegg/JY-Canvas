// quick-crop-panels.jsx —— RF-082 从 src/main.jsx 逐字抽出（加 export），未改逻辑。
import { useEffect, useRef, useState } from "react";
import { Crop, Folder, Image as ImageIcon, Loader2, RotateCcw, X } from "lucide-react";
import { cropQuickReferenceViewportFile, quickReferenceOriginalFile } from "../upload/reference-upload.js";
import { ratioValue } from "../local-edit/crop-rect-resize.js";
import { clampCropTransform } from "../../shared/local-edit-geometry.js";
import { Modal, ModalHeader } from "../../shared/ui/Modal.jsx";
import { UploadClearButton } from "../../shared/ui/UploadClearButton";

export function DetailUploadZone({
  title,
  subtitle,
  previews,
  count,
  maxCount,
  inputRef,
  onPick,
  onAddFiles,
  onRemove,
  onPreview,
  onAssetLibrary,
  onClear
}) {
  function onDrop(event) {
    event.preventDefault();
    onAddFiles(event.dataTransfer.files);
  }

  return (
    <section
      className="detailUploadBox"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={onDrop}
      aria-label={title}
    >
      <header>
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="detailUploadHeaderActions">
          <button className="smallButton" type="button" onClick={onAssetLibrary}>
            <Folder size={14} />
            <span>素材库</span>
          </button>
          {count > 0 && onClear && (
            <UploadClearButton onClick={onClear} />
          )}
        </div>
      </header>
      <button className="detailDropArea" type="button" onClick={() => inputRef.current?.click()}>
        <ImageIcon size={30} />
        <b>{title}</b>
        <span>{subtitle}</span>
      </button>
      {previews.length > 0 && (
        <div className="detailThumbGrid">
          {previews.map((item, index) => (
            <div
              className="detailThumb"
              key={`${item.file.name}-${item.file.lastModified}-${index}`}
              onClick={() => onPreview?.(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onPreview?.(item);
                }
              }}
            >
              <img src={item.url} alt={item.file.name} draggable={false} />
              <b>图{index + 1}</b>
              <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(index); }} aria-label="移除图片">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={onPick} />
      <small>{count}/{maxCount}</small>
    </section>
  );
}

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
              <button className="smallButton" type="button" onClick={() => onClear(item.id)}>
                <RotateCcw size={15} />
                <span>取消裁剪</span>
              </button>
            )}
            <button className="smallButton" type="button" onClick={onClose}>取消</button>
            <button className="generateButton quickLocalApplyButton" type="button" onClick={applyCrop} disabled={working}>
              {working ? <Loader2 size={16} className="spin" /> : <Crop size={16} />}
              <span>应用裁剪</span>
            </button>
          </div>
        </footer>
    </Modal>
  );
}
