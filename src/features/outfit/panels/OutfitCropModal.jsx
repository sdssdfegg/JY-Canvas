// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 962–1163 行）。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：CropModal 批量裁剪弹窗（原 outfit-panels 的 D 区）。
import { useEffect, useRef, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { clampCropTransform } from "../../../shared/local-edit-geometry.js";
import { Modal, ModalHeader } from "../../../shared/ui/Modal.jsx";
import { Button } from "../../../shared/ui/Button";
import { normalizeCropReturnMeta } from "../outfit-task.js";
import { processImageFile, ratioParts } from "../outfit-image-utils.js";

export function CropModal({
  item,
  ratio,
  onRatioChange = null,
  ratioOptions = null,
  ratioLabel = "输出比例",
  onClose,
  onApply,
  processor = processImageFile,
  initialMode = null,
  title = "裁剪 / 比例整理",
  subtitle = null,
  footerText = null,
  modeOptions = null,
  collectOnly = false,
  onCollectCrop = null
}) {
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const [mode, setMode] = useState(initialMode || modeOptions?.[0]?.[0] || "crop");
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [localRatio, setLocalRatio] = useState(ratio);
  const [working, setWorking] = useState(false);

  const ratioChoices = Array.isArray(ratioOptions)
    ? ratioOptions.filter((itemRatio) => typeof itemRatio === "string" && itemRatio.trim())
    : [];
  const activeRatio = ratioChoices.includes(localRatio) ? localRatio : ratio;
  const ratioValue = ratioParts(activeRatio).value;

  function minCropScale() {
    const frame = stageRef.current?.getBoundingClientRect();
    if (!frame?.width || !frame?.height || !imageSize.width || !imageSize.height) return 1;
    const containScale = Math.min(frame.width / imageSize.width, frame.height / imageSize.height);
    const coverScale = Math.max(frame.width / imageSize.width, frame.height / imageSize.height);
    return Math.max(1, coverScale / containScale);
  }

  function resetCropTransform() {
    if (mode !== "crop") return;
    setTransform({ x: 0, y: 0, scale: minCropScale() });
  }

  useEffect(() => {
    if (mode !== "crop") return undefined;
    const frame = window.requestAnimationFrame(resetCropTransform);
    return () => window.cancelAnimationFrame(frame);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize.height, imageSize.width, item?.id, mode, activeRatio]);

  useEffect(() => {
    setLocalRatio(ratio);
  }, [item?.id, ratio]);

  function changeLocalRatio(nextRatio) {
    if (!ratioChoices.includes(nextRatio)) return;
    setLocalRatio(nextRatio);
    onRatioChange?.(nextRatio);
  }

  function onPointerDown(event) {
    if (mode !== "crop") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, start: transform };
  }

  function onPointerMove(event) {
    if (!dragRef.current || mode !== "crop") return;
    const deltaX = event.clientX - dragRef.current.x;
    const deltaY = event.clientY - dragRef.current.y;
    setTransform(clampCropTransform({
      ...dragRef.current.start,
      x: dragRef.current.start.x + deltaX,
      y: dragRef.current.start.y + deltaY
    }, {
      frame: stageRef.current?.getBoundingClientRect(),
      imageSize,
      minScale: minCropScale(),
      enabled: mode === "crop"
    }));
  }

  function onWheel(event) {
    if (mode !== "crop") return;
    event.preventDefault();
    setTransform((current) => clampCropTransform({
      ...current,
      scale: Math.max(0.2, Math.min(4, current.scale + (event.deltaY > 0 ? -0.08 : 0.08)))
    }, {
      frame: stageRef.current?.getBoundingClientRect(),
      imageSize,
      minScale: minCropScale(),
      enabled: mode === "crop"
    }));
  }

  async function confirm() {
    setWorking(true);
    try {
      let crop = null;
      if (mode === "crop") {
        const stage = stageRef.current;
        const frame = stage?.getBoundingClientRect();
        crop = {
          x: transform.x,
          y: transform.y,
          scale: transform.scale,
          stageWidth: frame?.width,
          stageHeight: frame?.height
        };
      }
      if (collectOnly) {
        onCollectCrop?.(crop, mode);
        return;
      }
      const processed = await processor(item.originalFile, activeRatio, mode, crop);
      const nextFile = processed?.file instanceof File ? processed.file : processed;
      const nextUrl = URL.createObjectURL(nextFile);
      onApply({
        ...item,
        file: nextFile,
        previewUrl: nextUrl,
        mode,
        cropReturn: normalizeCropReturnMeta(processed?.cropReturn)
      });
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal layerClassName="modalLayer" panelClassName="cropModal" onClose={onClose}>
      <ModalHeader
        title={title}
        subtitle={subtitle || `${item.name} · 输出 ${activeRatio}`}
        onClose={onClose}
      />
        <div className="cropModeTabs">
          {(modeOptions || [
            ["crop", "手动裁剪"],
            ["pad", "白底补边"],
            ["soft", "柔和补边"],
            ["original", "原图"]
          ]).map(([value, label]) => (
            <button className={mode === value ? "active" : ""} key={value} type="button" onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
        {ratioChoices.length > 0 && (
          <div className="cropRatioPresetGroup" role="group" aria-label={ratioLabel}>
            {ratioChoices.map((itemRatio) => (
              <button
                className={activeRatio === itemRatio ? "active" : ""}
                key={itemRatio}
                type="button"
                onClick={() => changeLocalRatio(itemRatio)}
              >
                {itemRatio}
              </button>
            ))}
          </div>
        )}
        <div className="cropPreviewWrap">
          <div
            className={`cropStage ${mode === "crop" ? "interactive" : ""}`}
            ref={stageRef}
            style={{ aspectRatio: `${ratioValue}` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => { dragRef.current = null; }}
            onWheel={onWheel}
          >
            <img
              src={item.originalUrl}
              alt=""
              onLoad={(event) => {
                setImageSize({
                  width: event.currentTarget.naturalWidth || 0,
                  height: event.currentTarget.naturalHeight || 0
                });
              }}
              style={mode === "crop" ? {
                transform: `translate(calc(-50% + ${transform.x}px), calc(-50% + ${transform.y}px)) scale(${transform.scale})`
              } : undefined}
            />
          </div>
        </div>
        <footer>
          <span>{footerText || (mode === "crop" ? "默认显示完整原图，拖动画面选择区域，滚轮缩放后再应用。" : "确认后会在本地生成整理后的参考图。")}</span>
          <div>
            <Button size="md" type="button" onClick={onClose}>取消</Button>
            <Button size="md" tone="primary" type="button" onClick={confirm} disabled={working}>
              {working ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
              <span>应用</span>
            </Button>
          </div>
        </footer>
    </Modal>
  );
}
