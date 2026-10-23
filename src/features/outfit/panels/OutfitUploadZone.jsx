// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 612–960 行）。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：UploadZone 面板（原 outfit-panels 的 C 区）。
import { useEffect, useRef, useState } from "react";
import { Check, Crop, Images, Lock, Move, Scissors, Trash2, X } from "lucide-react";
import { fileSize } from "../../../lib/format/index.js";
import { preventFileDropNavigation } from "../../../shared/dom-actions.js";
import {
  imageFilesFromClipboard,
  imageFilesFromList,
  isImageFile
} from "../../../shared/image-input.js";
import { formatPixelSize } from "../../../shared/local-edit-geometry.js";
import { UploadClearButton } from "../../../shared/ui/UploadClearButton";
import { imageItemPreviewSource } from "../outfit-task.js";
import { imageFilesFromDataTransfer, MAX_UPLOAD_IMAGES } from "../outfit-image-utils.js";

export function UploadZone({
  title,
  hint,
  slotPrefix = "",
  titleText = "",
  hintText = "",
  onEditTitle = null,
  onEditHint = null,
  items,
  onPick,
  onRemove,
  onOpenCrop,
  onOpenLocalEdit,
  onToggle,
  onReorder,
  onReplace,
  onClear,
  onSetFixed,
  onPreview,
  fixedId,
  fixedTitle = "设为固定服装",
  acceptMultiple = true,
  compact = false,
  primary = false,
  /* V77（§3.1）：显式列数覆盖。图1 传 4（大区 ~10 张容量），图2/图3 不传走默认 2。
     说明：执行单建议按 maxCount 分档（≥8→4 列），但图3 的 maxCount 同为 MAX_UPLOAD_IMAGES(10)，
     分档会把图3 也推成 4 列，违背「图2/图3 保持 2 列」，故改为显式 columns prop。 */
  columns,
  maxCount = MAX_UPLOAD_IMAGES,
  onLimit,
  onActivate,
  bulkMode = "pad",
  /* V77 Park：统一处理停用，但 props 与 handler 保留 —— 别名 _ 前缀（eslint 允许的未使用参数命名），
     恢复 = 去掉 _ 前缀并还原 uploadZoneFooter 里的 bulkModeControl / small 两段。 */
  onBulkModeChange: _onBulkModeChange,
  localEditEnabled = false,
  footerControls = null,
  sideControls = null
}) {
  const inputRef = useRef(null);
  const pointerSortRef = useRef(null);
  const suppressOpenRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [draggingImageId, setDraggingImageId] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const [replaceTargetId, setReplaceTargetId] = useState("");
  // 缩略图 meta 要显示像素尺寸：直接读已渲染 <img> 的 naturalWidth/Height（零额外解码）。
  const thumbSizeRef = useRef(new Map());
  const [, bumpThumbSizeRevision] = useState(0);
  function rememberThumbSize(itemId, image) {
    const width = image?.naturalWidth || 0;
    const height = image?.naturalHeight || 0;
    if (!itemId || !width || !height) return;
    const previous = thumbSizeRef.current.get(itemId);
    if (previous && previous.width === width && previous.height === height) return;
    thumbSizeRef.current.set(itemId, { width, height });
    bumpThumbSizeRevision((value) => value + 1);
  }
  // V77（§3.1）：列数改为显式 columns 优先（图1=4），未传时保持原判据（primary 10 列兜底，其余 2 列）。
  const columnCount = columns ?? (primary ? 10 : 2);
  const mixedMode = bulkMode === "mixed";
  const displayTitle = titleText || title;
  const displayHint = hintText || hint;

  useEffect(() => {
    window.addEventListener("dragover", preventFileDropNavigation);
    window.addEventListener("drop", preventFileDropNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileDropNavigation);
      window.removeEventListener("drop", preventFileDropNavigation);
    };
  }, []);

  function handleFiles(fileList) {
    const incoming = imageFilesFromList(fileList);
    const allowed = Math.max(0, maxCount - items.length);
    if (allowed <= 0) {
      onLimit?.(`最多上传 ${maxCount} 张`);
      return;
    }
    const files = incoming.slice(0, allowed);
    if (incoming.length > files.length) onLimit?.(`已保留前 ${maxCount} 张，超出的图片未加入`);
    if (files.length) onPick(files);
  }

  async function handleReplaceDrop(event, item) {
    if (isSortingDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setReplaceTargetId("");
    try {
      const files = await imageFilesFromDataTransfer(event.dataTransfer);
      const file = files.find(isImageFile);
      if (!file) {
        onLimit?.("没有读取到可替换的图片");
        return;
      }
      onReplace?.(item.id, file);
    } catch (error) {
      onLimit?.(`替换失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function isSortingDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes("application/x-jingyin-image-id");
  }

  function isLeavingElement(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const { clientX, clientY } = event;
    return clientX <= rect.left || clientX >= rect.right || clientY <= rect.top || clientY >= rect.bottom;
  }

  function markReplaceTarget(event, item) {
    if (isSortingDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setReplaceTargetId(item.id);
  }

  function beginPointerSort(event, item) {
    if (event.button !== 0 || items.length <= 1) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".thumbActions")) return;
    // V111（用户要求）：拖拽手柄 .dragHandle 位于 .thumbImage 内部（outfit-panels.jsx L885），
    // 曾被 .thumbImage 整体排除而导致"手柄看得见按不动"；手柄要能发起排序。
    if (!target?.closest(".dragHandle") && target?.closest(".thumbImage")) return;
    pointerSortRef.current = {
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePointerSort(event) {
    const sort = pointerSortRef.current;
    if (!sort) return;
    const deltaX = event.clientX - sort.startX;
    const deltaY = event.clientY - sort.startY;
    if (!sort.active && Math.hypot(deltaX, deltaY) < 8) return;

    sort.active = true;
    setDraggingImageId(sort.id);
    event.preventDefault();
    event.stopPropagation();

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const card = target?.closest?.(".thumbCard[data-image-id]");
    const targetId = card?.dataset?.imageId;
    if (!card || !targetId || targetId === sort.id) {
      sort.target = null;
      setDropTarget(null);
      return;
    }

    const rect = card.getBoundingClientRect();
    const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";
    sort.target = { id: targetId, placement };
    setDropTarget(sort.target);
  }

  function endPointerSort(event) {
    const sort = pointerSortRef.current;
    if (!sort) return;
    if (sort.active) {
      event.preventDefault();
      event.stopPropagation();
      if (sort.target) onReorder?.(sort.id, sort.target.id, sort.target.placement);
      suppressOpenRef.current = true;
      window.setTimeout(() => {
        suppressOpenRef.current = false;
      }, 150);
    }
    pointerSortRef.current = null;
    setDraggingImageId("");
    setDropTarget(null);
  }

  function cancelPointerSort() {
    pointerSortRef.current = null;
    setDraggingImageId("");
    setDropTarget(null);
  }

  function openLocalEdit(item) {
    if (suppressOpenRef.current) return;
    onOpenLocalEdit?.(item);
  }

  return (
    <section
      tabIndex={0}
      className={`uploadZone ${compact ? "compact" : ""} ${primary ? "primary" : ""} ${sideControls ? "hasSideControls" : ""} ${dragging ? "dragging" : ""}`}
      style={{ "--upload-columns": columnCount }}
      onFocus={onActivate}
      onPointerDown={onActivate}
      onDragOver={(event) => {
        if (isSortingDrag(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (isLeavingElement(event)) setDragging(false);
      }}
      onDrop={async (event) => {
        if (isSortingDrag(event)) return;
        event.preventDefault();
        setDragging(false);
        try {
          const files = await imageFilesFromDataTransfer(event.dataTransfer);
          handleFiles(files);
        } catch (error) {
          onLimit?.(`文件夹读取失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }}
      onPaste={(event) => {
        const pastedImages = imageFilesFromClipboard(event.clipboardData);
        if (pastedImages.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        handleFiles(pastedImages);
      }}
    >
      <header>
        <div>
          {slotPrefix ? (
            <h3 className="uploadTitleLine">
              <span className="uploadSlotPrefix">{slotPrefix}</span>
              <button className="uploadEditableText" type="button" onDoubleClick={onEditTitle} title="双击修改">
                {displayTitle}
              </button>
            </h3>
          ) : (
            <h3>{displayTitle}</h3>
          )}
          {onEditHint ? (
            <button className="uploadEditableHint" type="button" onDoubleClick={onEditHint} title="双击修改">
              {displayHint} · {items.length}/{maxCount}
            </button>
          ) : (
            <span>{displayHint} · {items.length}/{maxCount}</span>
          )}
        </div>
        <div className="uploadHeaderActions">
          {/* V77（用户要求·停用）：上传按钮移除（空态点击/拖入仍走 inputRef 链，有图后靠拖入 + 单张替换）；
              右上角仅保留清除钮。 */}
          <UploadClearButton onClick={onClear} disabled={!onClear || items.length === 0} />
        </div>
      </header>
      <div className="uploadZoneBody">
        <div className="thumbGrid">
          {items.map((item, index) => {
            const placement = dropTarget?.id === item.id ? dropTarget.placement : "";
            const thumbPreviewUrl = imageItemPreviewSource(item);
            return (
            <article
              className={`thumbCard ${items.length > 1 ? "sortable" : ""} ${!item.selected ? "muted" : ""} ${fixedId === item.id ? "fixed" : ""} ${item.localEdit ? "localEditReady" : ""} ${draggingImageId === item.id ? "sorting" : ""} ${replaceTargetId === item.id ? "replaceTarget" : ""} ${placement === "before" ? "dropBefore" : ""} ${placement === "after" ? "dropAfter" : ""}`}
              data-image-id={item.id}
              key={item.id}
              onPointerDown={(event) => beginPointerSort(event, item)}
              onPointerMove={movePointerSort}
              onPointerUp={endPointerSort}
              onPointerCancel={cancelPointerSort}
              onDragEnter={(event) => markReplaceTarget(event, item)}
              onDragOver={(event) => markReplaceTarget(event, item)}
              onDragLeave={(event) => {
                if (isLeavingElement(event)) setReplaceTargetId("");
              }}
              onDrop={(event) => void handleReplaceDrop(event, item)}
            >
              <button className={`thumbImage mode-${item.mode || "pad"}`} type="button" onClick={() => onPreview?.({ ...item, previewUrl: thumbPreviewUrl })}>
                <img src={thumbPreviewUrl} alt="" draggable={false} onLoad={(event) => rememberThumbSize(item.id, event.currentTarget)} />
                <i>{index + 1}</i>
                <em>{item.mode === "crop" ? "裁" : item.mode === "soft" ? "柔" : item.mode === "original" ? "原" : "白"}</em>
                {items.length > 1 && <span className="dragHandle" title="拖拽调整顺序"><Move size={13} /></span>}
              </button>
              <div className="thumbMeta">
                <strong title={item.name}>{item.name}</strong>
                <span>
                  {item.mode === "crop" ? "手动裁剪" : item.mode === "soft" ? "柔和补边" : item.mode === "original" ? "原图" : "白底补边"} · {fileSize(item.file.size)}
                  {item.localEdit?.cropRect
                    ? ` · 局部 ${formatPixelSize(item.localEdit.cropRect.width, item.localEdit.cropRect.height)} · 底图 ${formatPixelSize(item.localEdit.sourceWidth, item.localEdit.sourceHeight)}`
                    : thumbSizeRef.current.get(item.id)
                      ? ` · 上传 ${formatPixelSize(thumbSizeRef.current.get(item.id).width, thumbSizeRef.current.get(item.id).height)}`
                      : ""}
                </span>
              </div>
              <div className="thumbActions">
                <button type="button" onClick={() => onToggle(item.id)} title="参与本次批量">
                  {item.selected ? <Check size={12} /> : <X size={12} />}
                </button>
                {onSetFixed && (
                  <button type="button" className={fixedId === item.id ? "active" : ""} onClick={() => onSetFixed(item.id)} title={fixedTitle}>
                    <Lock size={12} />
                  </button>
                )}
                <button type="button" onClick={() => onOpenCrop(item)} title="裁剪/补边">
                  <Crop size={12} />
                </button>
                {localEditEnabled && (
                  <button
                    className={item.localEdit ? "active" : ""}
                    type="button"
                    onClick={() => openLocalEdit(item)}
                    title={item.localEdit ? "重新调整局部回贴" : "局部回贴"}
                  >
                    <Scissors size={12} />
                  </button>
                )}
                <button type="button" onClick={() => onRemove(item.id)} title="删除">
                  <Trash2 size={12} />
                </button>
              </div>
            </article>
            );
          })}
          {items.length === 0 && (
            <button className="emptyUpload" type="button" onClick={() => inputRef.current?.click()}>
              <Images size={24} />
              <span>拖入图片或点击上传</span>
            </button>
          )}
        </div>
        {sideControls && <div className="uploadZoneSideControls">{sideControls}</div>}
      </div>
      {/* V77（用户要求·停用）：「统一处理」select 与「新上传默认：…」说明停用；
          bulkMode/onBulkModeChange props 与 applyGroupPreprocess handler 按 Park 纪律保留，
          恢复时传回 bulkMode/onBulkModeChange 并还原本段。改色范围 footerControls 保留不动。 */}
      {footerControls && (
        <div className={`uploadZoneFooter ${mixedMode ? "mixed" : ""}`}>
          <div className="uploadZoneFooterControls">{footerControls}</div>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={acceptMultiple}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </section>
  );
}
