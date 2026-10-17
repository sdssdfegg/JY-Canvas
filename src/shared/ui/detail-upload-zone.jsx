// detail-upload-zone.jsx —— V91 从 src/features/crop/quick-crop-panels.jsx 逐字归位（未改逻辑）。
import { Folder, Image as ImageIcon, X } from "lucide-react";
import { Button } from "./Button";
import { UploadClearButton } from "./UploadClearButton";

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
          <Button size="sm" onClick={onAssetLibrary}>
            <Folder size={14} />
            <span>素材库</span>
          </Button>
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
