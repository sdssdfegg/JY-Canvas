import { useRef, useState, useEffect } from "react";
import {
  Brush,
  Crop,
  Loader2,
  RefreshCw,
  RotateCcw,
  Scissors
} from "lucide-react";
import {
  constrainCropRect as sharedConstrainCropRect,
  cropLocalEditFile,
  fitRectToRatioLocked,
  formatPixelSize
} from "../../shared/local-edit-geometry.js";
import {
  LOCAL_EDIT_BRUSH_DEFAULT,
  LOCAL_EDIT_MASK_MODE,
  LOCAL_EDIT_MASK_OPACITY_DEFAULT,
  LOCAL_EDIT_RECT_MODE,
  canvasToPngDataUrl,
  clampLocalEditBrushSize,
  clampLocalEditMaskOpacity,
  createLocalEditInteraction,
  expandMaskBoundsToCropRect,
  computeMaskContextPaddingPx,
  maskBoundsFromCanvas,
  normalizeMaskCanvas
} from "../../shared/local-edit-mask.js";
import { Modal, ModalHeader } from "../../shared/ui/Modal.jsx";
import { changeCropScale } from "./crop-drag.js";
import { LocalEditBrushTools } from "./LocalEditBrushTools.jsx";
import { LocalEditCropOverlay } from "./LocalEditCropOverlay.jsx";
import { ratioValue } from "./crop-rect-resize.js";

// ratioValue 定义已迁至 crop-rect-resize.js（RF-082 S5：打破 crop-rect-resize ↔ LocalEditModal 循环依赖），
// 此处重新导出供 main.jsx / outfit-panels.jsx 复用（顶部已 import 引入本地作用域）。
export { ratioValue };

// RF-077 · 合并自 main.QuickLocalEditModal 与 outfit.OutfitLocalEditModal 的共享弹窗壳。
// 交互层逻辑已在 RF-076 收口进 createLocalEditInteraction，本组件只收「壳」，
// 两侧差异全部提升为 props（各传原值，严禁统一判据/兜底顺序/默认值）。
export function LocalEditModal({
  item,
  ratio,
  mode = "local",
  onRatioChange,
  onClose,
  onApply,
  onClear,
  // 差异注入 props（各传原值，严禁统一）
  resolveBaseFile,
  ratios,
  resolveActiveRatio,
  defaultCropRect,
  fallbackToItem = true,
  lockRatioForLoad,
  // 文案 / 图标差异（保持两侧原样，不删 main 的「普通裁剪」那套）
  modalDescription,
  maskHint,
  rectHint,
  baseSizePlaceholder = "",
  clearIconName = "RotateCcw"
}) {
  const imageRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const dragRef = useRef(null);
  const paintRef = useRef(null);
  const brushResizeRef = useRef(null);
  const maskInitRef = useRef("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [cropRect, setCropRect] = useState(null);
  const [editMode, setEditMode] = useState(LOCAL_EDIT_RECT_MODE);
  const [maskTool, setMaskTool] = useState("brush");
  const [brushSize, setBrushSize] = useState(LOCAL_EDIT_BRUSH_DEFAULT);
  const [maskOpacity, setMaskOpacity] = useState(LOCAL_EDIT_MASK_OPACITY_DEFAULT);
  const [brushCursor, setBrushCursor] = useState({ x: 0, y: 0, visible: false });
  const [maskPainted, setMaskPainted] = useState(false);
  const [maskRevision, setMaskRevision] = useState(0);
  const [working, setWorking] = useState(false);
  const originalFile = resolveBaseFile(item);
  const isLocalMode = mode === "local";
  const savedEdit = isLocalMode ? item?.localEdit : item?.cropEdit;
  const isMaskMode = isLocalMode && editMode === LOCAL_EDIT_MASK_MODE;
  const ratioLocked = isLocalMode && !isMaskMode;
  const activeRatio = resolveActiveRatio
    ? resolveActiveRatio(ratio, savedEdit)
    : (isLocalMode
      ? (ratios.includes(ratio) ? ratio : ratios[0])
      : (savedEdit?.aspectRatio || ratio || "1:1"));
  const modalTitle = isLocalMode ? "局部回贴" : "普通裁剪";
  const resolvedModalDescription = modalDescription
    ?? (isLocalMode ? "生成后贴回原图同一坐标" : "只裁剪送入模型的参考图，不做回贴");
  const resolvedMaskHint = maskHint ?? "涂抹需要 AI 修改的区域，生成后只把涂抹到的像素贴回原图。";
  const resolvedRectHint = rectHint
    ?? (isLocalMode ? "拖动选区调整位置，生成后会按原图坐标原样贴回选框区域，选框外不动。" : "拖动选区调整位置，裁剪后的参考图会参与生成，但结果不贴回原图。");
  const lockRatioForLoadValue = lockRatioForLoad ?? ratioLocked;

  useEffect(() => {
    if (!originalFile) return undefined;
    const nextUrl = URL.createObjectURL(originalFile);
    setImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [originalFile]);

  const localEditInteractionDeps = {
    imageRef, setDisplaySize, maskCanvasRef, displaySize, imageSize, brushSize, maskTool, paintRef, isMaskMode, working, brushResizeRef, setBrushCursor, setMaskPainted, setCropRect, setMaskRevision, activeRatio, setBrushSize,
    setImageSize, savedEdit, onRatioChange, enabled: isLocalMode, ratios, editMode, setEditMode, cropRect, fitRectToRatio, lockRatioForLoad: lockRatioForLoadValue, lockRatioForUpdate: ratioLocked, defaultCropRect,
    item, cropLocalEditFile, onApply, canvasToPngDataUrl, maskOpacity, setWorking, fallbackToItem, rectModeTag: isLocalMode ? "local_edit" : "crop"
  };
  const { measureImage, updateBrushCursor, beginMaskPaint, moveMaskPaint, endMaskPaint, leaveMaskPaint, clearMask, changeBrushByKeyboard, syncCropRectFromMask, chooseRatio, chooseEditMode, updateCropRect, onImageLoad, applyLocalEdit } = createLocalEditInteraction(localEditInteractionDeps);

  useEffect(() => {
    window.addEventListener("resize", measureImage);
    return () => window.removeEventListener("resize", measureImage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setEditMode(isLocalMode && savedEdit?.editMode === LOCAL_EDIT_MASK_MODE ? LOCAL_EDIT_MASK_MODE : LOCAL_EDIT_RECT_MODE);
    setMaskPainted(Boolean(isLocalMode && savedEdit?.editMode === LOCAL_EDIT_MASK_MODE && savedEdit?.maskDataUrl));
    setMaskTool("brush");
    setBrushSize(clampLocalEditBrushSize(savedEdit?.brushSize || LOCAL_EDIT_BRUSH_DEFAULT));
    setMaskOpacity(clampLocalEditMaskOpacity(savedEdit?.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT));
    setBrushCursor({ x: 0, y: 0, visible: false });
    maskInitRef.current = "";
  }, [item?.id, isLocalMode]);

  useEffect(() => {
    if (!isMaskMode) return undefined;
    window.addEventListener("keydown", changeBrushByKeyboard);
    return () => window.removeEventListener("keydown", changeBrushByKeyboard);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMaskMode]);

  useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas || !isLocalMode || !imageSize.width || !imageSize.height) return;
    const initKey = `${item?.id || "item"}:${imageSize.width}x${imageSize.height}`;
    if (maskInitRef.current === initKey && canvas.width === imageSize.width && canvas.height === imageSize.height) return;
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    maskInitRef.current = initKey;

    if (savedEdit?.editMode === LOCAL_EDIT_MASK_MODE && savedEdit?.maskDataUrl) {
      // 卸载/切图后 onload 仍可能触发，对已卸载组件 setState 会报警告并留下悬挂引用。
      // 这里用 cancelled 标记把迟到的回调直接丢掉（见资源生命周期要求）。
      let cancelled = false;
      const maskImage = new Image();
      maskImage.onload = () => {
        if (cancelled) return;
        const nextCtx = canvas.getContext("2d");
        if (!nextCtx) return;
        nextCtx.clearRect(0, 0, canvas.width, canvas.height);
        nextCtx.drawImage(maskImage, 0, 0, canvas.width, canvas.height);
        normalizeMaskCanvas(canvas);
        const bounds = maskBoundsFromCanvas(canvas);
        setMaskPainted(Boolean(bounds));
        if (bounds) {
          setCropRect(expandMaskBoundsToCropRect(bounds, imageSize.width, imageSize.height, activeRatio, { lockRatio: true, paddingPx: computeMaskContextPaddingPx(bounds) }) || savedEdit.cropRect || null);
        }
        setMaskRevision((current) => current + 1);
      };
      maskImage.src = savedEdit.maskDataUrl;
      return () => {
        cancelled = true;
        maskImage.onload = null;
      };
    }
    setMaskPainted(false);
    setMaskRevision((current) => current + 1);
    return undefined;
  }, [activeRatio, imageSize.height, imageSize.width, isLocalMode, item?.id, savedEdit?.editMode, savedEdit?.maskDataUrl]);

  useEffect(() => {
    syncCropRectFromMask();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRatio, isMaskMode, imageSize.height, imageSize.width, maskRevision]);

  function fitRectToRatio(rect, nextRatio) {
    if (!imageSize.width || !imageSize.height) return rect;
    if (lockRatioForLoadValue) {
      return fitRectToRatioLocked(rect, nextRatio, imageSize.width, imageSize.height);
    }
    // 普通裁剪：保持原有的自由矩形语义（只做边界夹取，不锁比例）。
    const targetRatio = ratioValue(nextRatio);
    const centerX = rect ? rect.x + rect.width / 2 : imageSize.width / 2;
    const centerY = rect ? rect.y + rect.height / 2 : imageSize.height / 2;
    const baseWidth = rect?.width || imageSize.width * 0.62;
    const baseHeight = rect?.height || imageSize.height * 0.62;
    let nextWidth = baseWidth;
    let nextHeight = nextWidth / targetRatio;
    if (nextHeight > baseHeight) {
      nextHeight = baseHeight;
      nextWidth = nextHeight * targetRatio;
    }
    if (nextWidth > imageSize.width) {
      nextWidth = imageSize.width;
      nextHeight = nextWidth / targetRatio;
    }
    if (nextHeight > imageSize.height) {
      nextHeight = imageSize.height;
      nextWidth = nextHeight * targetRatio;
    }
    return sharedConstrainCropRect({
      x: centerX - nextWidth / 2,
      y: centerY - nextHeight / 2,
      width: nextWidth,
      height: nextHeight
    }, imageSize.width, imageSize.height);
  }

  const cropDragCtx = { dragRef, cropRect, displaySize, imageSize, updateCropRect, activeRatio, ratioLocked };

  const scale = imageSize.width && displaySize.width ? displaySize.width / imageSize.width : 1;
  const cropStyle = cropRect ? {
    left: `${cropRect.x * scale}px`,
    top: `${cropRect.y * scale}px`,
    width: `${cropRect.width * scale}px`,
    height: `${cropRect.height * scale}px`
  } : {};
  const cropPercent = cropRect && imageSize.width ? Math.round((cropRect.width / imageSize.width) * 100) : 62;
  const maskCanvasStyle = displaySize.width && displaySize.height ? {
    width: `${displaySize.width}px`,
    height: `${displaySize.height}px`,
    opacity: isMaskMode ? maskOpacity / 100 : 0
  } : {};
  const brushCursorStyle = {
    left: `${brushCursor.x}px`,
    top: `${brushCursor.y}px`,
    width: `${brushSize}px`,
    height: `${brushSize}px`
  };
  const applyDisabled = working || !cropRect || (isMaskMode && !maskPainted);
  // 尺寸口径（与批量侧同一套）：底图 = 我放进图1的那张文件；局部回贴输出与它同尺寸。
  const baseSizeText = formatPixelSize(imageSize.width, imageSize.height)
    || formatPixelSize(savedEdit?.sourceWidth, savedEdit?.sourceHeight);
  // 选框是在另一张不同尺寸的图上框的 → 坐标会错位，必须提醒重新框选。
  const staleRect = Boolean(
    isLocalMode
    && savedEdit?.sourceWidth
    && imageSize.width
    && (Math.round(savedEdit.sourceWidth) !== Math.round(imageSize.width)
      || Math.round(savedEdit.sourceHeight || 0) !== Math.round(imageSize.height))
  );

  return (
    <Modal
      layerClassName="modalLayer previewLayer"
      panelClassName="quickLocalEditModal"
      onClose={onClose}
    >
      <ModalHeader
        title={modalTitle}
        subtitle={<>{originalFile?.name || "上传图片"} · {isLocalMode && baseSizeText ? `底图 ${baseSizeText} · ` : (baseSizePlaceholder ? `底图 ${baseSizePlaceholder} · ` : "")}{resolvedModalDescription} · {activeRatio}</>}
        onClose={onClose}
        closeLabel="关闭"
      />
      {staleRect && (
        <p className="quickLocalEditWarning" role="alert">
          已保存的选框是在 {formatPixelSize(savedEdit?.sourceWidth, savedEdit?.sourceHeight)} 的图上框的，
          当前底图是 {baseSizeText}：坐标对不上，请重新框选后再应用（否则会贴偏移）。
        </p>
      )}
        <div className="quickLocalEditStage">
          <div className="quickLocalEditImageWrap">
            {imageUrl && (
              <img
                ref={imageRef}
                src={imageUrl}
                alt=""
                draggable={false}
                onLoad={onImageLoad}
              />
            )}
            {isLocalMode && (
              <canvas
                ref={maskCanvasRef}
                className={`quickLocalMaskCanvas ${isMaskMode ? "active" : ""}`}
                style={maskCanvasStyle}
                onPointerDown={beginMaskPaint}
                onPointerMove={moveMaskPaint}
                onPointerUp={endMaskPaint}
                onPointerCancel={endMaskPaint}
                onPointerEnter={(event) => updateBrushCursor(event)}
                onPointerLeave={leaveMaskPaint}
                onContextMenu={(event) => event.preventDefault()}
              />
            )}
            <LocalEditCropOverlay
              isMaskMode={isMaskMode}
              brushCursor={brushCursor}
              maskTool={maskTool}
              brushCursorStyle={brushCursorStyle}
              cropRect={cropRect}
              displaySize={displaySize}
              cropStyle={cropStyle}
              maskPainted={maskPainted}
              cropDragCtx={cropDragCtx}
            />
          </div>
        </div>
        <div className="quickLocalEditControls">
          {isLocalMode && (
            <div className="quickLocalModeGroup" role="group" aria-label="局部编辑模式">
              <button
                className={editMode === LOCAL_EDIT_RECT_MODE ? "active" : ""}
                type="button"
                onClick={() => chooseEditMode(LOCAL_EDIT_RECT_MODE)}
              >
                <Crop size={14} />
                <span>框选区域</span>
              </button>
              <button
                className={editMode === LOCAL_EDIT_MASK_MODE ? "active" : ""}
                type="button"
                onClick={() => chooseEditMode(LOCAL_EDIT_MASK_MODE)}
              >
                <Brush size={14} />
                <span>涂抹蒙版</span>
              </button>
            </div>
          )}
          {isLocalMode && (
            <div className="quickLocalRatioGroup" role="group" aria-label="局部区域比例">
              {ratios.map((itemRatio) => (
                <button
                  key={itemRatio}
                  className={activeRatio === itemRatio ? "active" : ""}
                  type="button"
                  onClick={() => chooseRatio(itemRatio)}
                >
                  {itemRatio}
                </button>
              ))}
            </div>
          )}
          <LocalEditBrushTools
            isMaskMode={isMaskMode}
            maskTool={maskTool}
            setMaskTool={setMaskTool}
            brushSize={brushSize}
            setBrushSize={setBrushSize}
            maskOpacity={maskOpacity}
            setMaskOpacity={setMaskOpacity}
            clearMask={clearMask}
            maskPainted={maskPainted}
            cropPercent={cropPercent}
            onCropScaleChange={(event) => changeCropScale(event, cropDragCtx)}
          />
          {cropRect && (
            <small>{isMaskMode ? "上下文 " : ""}{Math.round(cropRect.width)} × {Math.round(cropRect.height)} px</small>
          )}
        </div>
        <footer>
          <span>{isMaskMode ? resolvedMaskHint : resolvedRectHint}</span>
          <div>
            {savedEdit && (
              <button className="smallButton" type="button" onClick={isMaskMode ? clearMask : () => onClear(item.id)}>
                {isMaskMode ? <Brush size={15} /> : (clearIconName === "RefreshCw" ? <RefreshCw size={15} /> : isLocalMode ? <RotateCcw size={15} /> : <Crop size={15} />)}
                <span>{isMaskMode ? "清除涂抹" : isLocalMode ? "取消局部回贴" : "取消裁剪"}</span>
              </button>
            )}
            <button className="smallButton" type="button" onClick={onClose}>取消</button>
            <button className="generateButton quickLocalApplyButton" type="button" onClick={applyLocalEdit} disabled={applyDisabled}>
              {working ? <Loader2 size={16} className="spin" /> : isMaskMode ? <Brush size={16} /> : isLocalMode ? <Scissors size={16} /> : <Crop size={16} />}
              <span>{isMaskMode ? "应用蒙版回贴" : isLocalMode ? "应用局部回贴" : "应用裁剪"}</span>
            </button>
          </div>
        </footer>
    </Modal>
  );
}
