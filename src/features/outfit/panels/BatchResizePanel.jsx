// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 1164–1698 行）。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：resizeSettingsFingerprint + BatchResizePanel 批量尺寸导出面板（原 outfit-panels 的 E 区）。
import { useEffect, useMemo, useRef, useState } from "react";
import { Crop, FolderOpen, Images, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { fileSize } from "../../../lib/format/index.js";
import {
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage
} from "../../../lib/storage/json-storage.js";
import { imageFilesFromClipboard, isImageFile } from "../../../shared/image-input.js";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader";
import { Button } from "../../../shared/ui/Button";
import { UploadClearButton } from "../../../shared/ui/UploadClearButton";
import { RESIZE_BATCH_CROP_KEY, RESIZE_SETTINGS_KEY } from "../outfit-storage-keys.js";
import {
  BATCH_RATIO_OPTIONS,
  RESIZE_FILL_OPTIONS,
  RESIZE_FORMAT_OPTIONS,
  RESIZE_OUTPUT_FOLDER,
  RESIZE_RESOLUTION_MAP,
  RESIZE_RESOLUTION_OPTIONS,
  clampResizeEdge,
  imageFilesFromDataTransfer,
  makeId,
  normalizeResizeSettings,
  outputSizeForRatio,
  readResizeSettings,
  resizeImageFile,
  resolveResizeLongEdge
} from "../outfit-image-utils.js";
import { CropModal } from "./OutfitCropModal.jsx";

export function resizeSettingsFingerprint(settings, cropSignature = "") {
  const normalized = normalizeResizeSettings(settings);
  return [
    normalized.ratio,
    resolveResizeLongEdge(normalized),
    normalized.fitMode,
    normalized.outputFormat,
    normalized.dpi,
    normalized.fillColor,
    normalized.cropMode,
    cropSignature
  ].join("|");
}
export function BatchResizePanel({
  saveDirectory,
  onChooseDirectory,
  onOpenSaveDirectory,
  onSaveImage,
  onAddEvent
}) {
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState(readResizeSettings);
  const [longEdgeDraft, setLongEdgeDraft] = useState(() => String(settings.longEdge));
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [cropTarget, setCropTarget] = useState(null);
  const [batchCropTarget, setBatchCropTarget] = useState(null);
  const [batchCropTemplate, setBatchCropTemplate] = useState(() => readJsonStorage(RESIZE_BATCH_CROP_KEY, null));

  const isOriginalSizeMode = settings.fitMode === "original-size";
  const isOriginalRatioMode = settings.fitMode === "original";
  const fixedOutputRatioMode = settings.fitMode === "pad" || settings.fitMode === "crop";
  const targetSize = isOriginalSizeMode || isOriginalRatioMode ? null : outputSizeForRatio(settings.ratio, resolveResizeLongEdge(settings));
  const batchCropSignature = useMemo(() => JSON.stringify(batchCropTemplate || null), [batchCropTemplate]);
  const currentSettingsKey = resizeSettingsFingerprint(settings, batchCropSignature);

  useEffect(() => {
    writeJsonStorage(RESIZE_SETTINGS_KEY, settings);
  }, [settings]);

  useEffect(() => {
    setLongEdgeDraft(String(settings.longEdge));
  }, [settings.longEdge]);

  useEffect(() => {
    if (batchCropTemplate) {
      writeJsonStorage(RESIZE_BATCH_CROP_KEY, batchCropTemplate);
    } else {
      removeStorageItem(RESIZE_BATCH_CROP_KEY);
    }
  }, [batchCropTemplate]);

  useEffect(() => {
    const input = folderInputRef.current;
    if (!input) return;
    input.setAttribute("webkitdirectory", "");
    input.setAttribute("directory", "");
  }, []);

  function updateResizeSetting(key, value) {
    setSettings((current) => normalizeResizeSettings({ ...current, [key]: value }));
  }

  function updateResolution(value) {
    const edge = RESIZE_RESOLUTION_MAP[value] || settings.longEdge;
    setSettings((current) => normalizeResizeSettings({
      ...current,
      resolution: value,
      longEdge: value === "custom" ? current.longEdge : edge
    }));
  }

  function changeLongEdgeDraft(value) {
    const cleaned = String(value || "").replace(/[^\d]/g, "").slice(0, 4);
    setLongEdgeDraft(cleaned);
    const number = Number.parseInt(cleaned, 10);
    if (Number.isFinite(number) && number >= 256 && number <= 8192) {
      setSettings((current) => normalizeResizeSettings({
        ...current,
        longEdge: number,
        resolution: "custom"
      }));
    } else {
      setSettings((current) => current.resolution === "custom" ? current : { ...current, resolution: "custom" });
    }
  }

  function commitLongEdgeDraft() {
    const number = Number.parseInt(longEdgeDraft, 10);
    const longEdge = clampResizeEdge(number);
    setSettings((current) => normalizeResizeSettings({
      ...current,
      longEdge,
      resolution: "custom"
    }));
    setLongEdgeDraft(String(longEdge));
  }

  function revokeResizeItem(item) {
    const urls = new Set([item?.originalUrl, item?.previewUrl].filter(Boolean));
    urls.forEach((url) => URL.revokeObjectURL(url));
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || [])
      .filter(isImageFile)
      .sort((a, b) => String(a.webkitRelativePath || a.name).localeCompare(String(b.webkitRelativePath || b.name), "zh-CN", { numeric: true }));

    if (!files.length) {
      setStatus("没有读取到图片文件");
      return;
    }

    const nextItems = files.map((file) => {
      const url = URL.createObjectURL(file);
      return {
        id: makeId("resize"),
        name: file.webkitRelativePath || file.name,
        originalFile: file,
        file,
        originalUrl: url,
        previewUrl: url,
        mode: "original",
        customized: false,
        settingsKey: "",
        createdAt: Date.now()
      };
    });

    setItems((current) => [...current, ...nextItems]);
    setStatus(`已导入 ${nextItems.length} 张图片`);
    onAddEvent?.("批量尺寸导出", `已导入 ${nextItems.length} 张图片`);
  }

  function removeItem(id) {
    setItems((current) => {
      const target = current.find((item) => item.id === id);
      revokeResizeItem(target);
      return current.filter((item) => item.id !== id);
    });
  }

  function clearItems() {
    setItems((current) => {
      current.forEach(revokeResizeItem);
      return [];
    });
    setStatus("已清空待处理图片");
  }

  function openBatchCropEditor() {
    if (!items.length) {
      setStatus("请先导入图片，再设置批量裁剪区域");
      return;
    }
    setBatchCropTarget({
      ...items[0],
      mode: "crop"
    });
  }

  function applyBatchCropTemplate(crop) {
    if (!crop) {
      setStatus("没有读取到有效裁剪区域，请重新设置");
      setBatchCropTarget(null);
      return;
    }
    setBatchCropTemplate(crop);
    setBatchCropTarget(null);
    setStatus("已设置批量裁剪区域，导出时会按这个区域处理未单独裁剪的图片");
    onAddEvent?.("批量尺寸导出", "已设置统一裁剪区域");
  }

  function clearBatchCropTemplate() {
    setBatchCropTemplate(null);
    setStatus("已清除批量裁剪区域，将恢复默认中心裁剪");
  }

  function applyCropItem(item) {
    setItems((current) => current.map((currentItem) => {
      if (currentItem.id !== item.id) return currentItem;
      if (currentItem.previewUrl && currentItem.previewUrl !== currentItem.originalUrl) URL.revokeObjectURL(currentItem.previewUrl);
      return {
        ...currentItem,
        file: item.file,
        previewUrl: item.previewUrl,
        mode: item.mode,
        customized: true,
        settingsKey: currentSettingsKey
      };
    }));
    setCropTarget(null);
  }

  async function exportItems() {
    if (working) return;
    if (!items.length) {
      setStatus("请先导入需要改尺寸的图片");
      return;
    }
    if (!saveDirectory) {
      setStatus("请先指定保存文件夹");
      onChooseDirectory?.();
      return;
    }

    setWorking(true);
    let finished = 0;
    try {
      for (const item of items) {
        setStatus(`正在导出 ${finished + 1}/${items.length}`);
        const useCustom = !["original-size", "original"].includes(settings.fitMode) && item.customized && item.settingsKey === currentSettingsKey;
        const sharedCrop = settings.fitMode === "crop" && settings.cropMode === "batch" ? batchCropTemplate : null;
        const file = useCustom
          ? item.file
          : await resizeImageFile(item.originalFile, settings, sharedCrop);
        await onSaveImage(file, RESIZE_OUTPUT_FOLDER);
        finished += 1;
      }
      setStatus(`已导出 ${finished} 张到「${RESIZE_OUTPUT_FOLDER}」`);
      onAddEvent?.("批量尺寸导出", `已导出 ${finished} 张`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`导出失败：${message}`);
      onAddEvent?.("批量尺寸导出失败", message);
    } finally {
      setWorking(false);
    }
  }

  function openCropEditor(item) {
    setCropTarget({
      ...item,
      mode: "crop"
    });
  }

  return (
    <section
      className={`batchResizePanel ${dragging ? "dragging" : ""}`}
      id="batch-resize-section"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (event) => {
        event.preventDefault();
        setDragging(false);
        try {
          addFiles(await imageFilesFromDataTransfer(event.dataTransfer));
        } catch (error) {
          setStatus(`文件夹读取失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }}
      onPaste={(event) => {
        const pastedImages = imageFilesFromClipboard(event.clipboardData);
        if (!pastedImages.length) return;
        event.preventDefault();
        event.stopPropagation();
        addFiles(pastedImages);
      }}
    >
      <ModuleHeader
        title="批量尺寸导出"
        subtitle="本地批量改尺寸和转格式，不消费 API；默认 JPG、最长边 3500、72DPI，导出到「{RESIZE_OUTPUT_FOLDER}」。"
        action={<div className="batchResizeActions">
          <Button size="sm" type="button" onClick={() => folderInputRef.current?.click()}>
            <FolderOpen size={15} />
            <span>选择文件夹</span>
          </Button>
          <Button size="sm" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={15} />
            <span>选择图片</span>
          </Button>
          <Button size="sm" type="button" onClick={onChooseDirectory}>
            <FolderOpen size={15} />
            <span>指定文件夹</span>
          </Button>
          <Button size="sm" type="button" onClick={onOpenSaveDirectory}>
            <FolderOpen size={15} />
            <span>打开目录</span>
          </Button>
          <Button size="md" tone="primary" type="button" onClick={exportItems} disabled={working || items.length === 0}>
            {working ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
            <span>{working ? "导出中" : "导出"}</span>
          </Button>
          <UploadClearButton onClick={clearItems} disabled={items.length === 0} />
        </div>}
      />

      <div className="resizeControlGrid">
        {!isOriginalSizeMode && (
          <>
            <label className="field">
              <span>尺寸档</span>
              <select value={settings.resolution} onChange={(event) => updateResolution(event.target.value)}>
                {RESIZE_RESOLUTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>最长边(px)</span>
              <input
                type="number"
                min="256"
                max="8192"
                step="64"
                value={longEdgeDraft}
                onChange={(event) => changeLongEdgeDraft(event.target.value)}
                onBlur={commitLongEdgeDraft}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
            <label className="field">
              <span>导出格式</span>
              <select value={settings.outputFormat} onChange={(event) => updateResizeSetting("outputFormat", event.target.value)}>
                {RESIZE_FORMAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>DPI</span>
              <input
                type="number"
                min="1"
                max="1200"
                step="1"
                value={settings.dpi}
                onChange={(event) => updateResizeSetting("dpi", event.target.value)}
              />
            </label>
            <label className={`field ${fixedOutputRatioMode ? "" : "muted"}`}>
              <span>输出比例</span>
              <select
                value={settings.ratio}
                onChange={(event) => updateResizeSetting("ratio", event.target.value)}
                disabled={!fixedOutputRatioMode}
                title={fixedOutputRatioMode ? "固定画幅输出比例" : "原图等比缩放时不使用输出比例"}
              >
                {BATCH_RATIO_OPTIONS.map((ratio) => (
                  <option key={ratio} value={ratio}>{ratio}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="resizeSegment">
          <span>适配方式</span>
          <div>
            <button className={settings.fitMode === "original" ? "active" : ""} type="button" onClick={() => updateResizeSetting("fitMode", "original")}>原图</button>
            <button className={settings.fitMode === "pad" ? "active" : ""} type="button" onClick={() => updateResizeSetting("fitMode", "pad")}>补边</button>
            <button className={settings.fitMode === "crop" ? "active" : ""} type="button" onClick={() => updateResizeSetting("fitMode", "crop")}>裁剪</button>
          </div>
        </div>
        {!isOriginalSizeMode && !isOriginalRatioMode && (
          <>
            <div className={`resizeSwatches ${settings.fitMode !== "pad" ? "muted" : ""}`}>
              <span>填充色</span>
              <div>
                {RESIZE_FILL_OPTIONS.map((option) => (
                  <button
                    className={settings.fillColor === option.value ? "active" : ""}
                    key={option.value}
                    style={{ "--swatch": option.value }}
                    type="button"
                    disabled={settings.fitMode !== "pad"}
                    onClick={() => updateResizeSetting("fillColor", option.value)}
                    title={option.label}
                  >
                    <i />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className={`resizeSegment ${settings.fitMode !== "crop" ? "muted" : ""}`}>
              <span>裁剪方式</span>
              <div>
                <button className={settings.cropMode === "batch" ? "active" : ""} type="button" onClick={() => updateResizeSetting("cropMode", "batch")} disabled={settings.fitMode !== "crop"}>批量裁剪</button>
                <button className={settings.cropMode === "individual" ? "active" : ""} type="button" onClick={() => updateResizeSetting("cropMode", "individual")} disabled={settings.fitMode !== "crop"}>每张裁剪</button>
              </div>
            </div>
            <div className={`resizeCropTemplate ${settings.fitMode !== "crop" || settings.cropMode !== "batch" ? "muted" : ""}`}>
              <span>批量裁剪区域</span>
              <div>
                <button
                  type="button"
                  disabled={settings.fitMode !== "crop" || settings.cropMode !== "batch" || items.length === 0}
                  onClick={openBatchCropEditor}
                >
                  <Crop size={14} />
                  <span>{batchCropTemplate ? "重新设置" : "设置区域"}</span>
                </button>
                <button
                  type="button"
                  disabled={!batchCropTemplate || settings.fitMode !== "crop" || settings.cropMode !== "batch"}
                  onClick={clearBatchCropTemplate}
                >
                  <X size={14} />
                  <span>清除</span>
                </button>
              </div>
              <small>{batchCropTemplate ? "已设置：未单独裁剪的图片会沿用这个区域" : "未设置时默认中心裁剪"}</small>
            </div>
          </>
        )}
        <div className="resizeSummary">
          <strong>{isOriginalSizeMode ? `原像素 ${settings.dpi}DPI` : isOriginalRatioMode ? `原图比例 · 最长边 ${resolveResizeLongEdge(settings)}` : `${targetSize.width} × ${targetSize.height}`}</strong>
          <span>{isOriginalSizeMode ? "像素不改，只重写 DPI" : isOriginalRatioMode ? `${settings.outputFormat.toUpperCase()} · ${settings.dpi}DPI · 等比缩放` : `${settings.outputFormat.toUpperCase()} · 当前导出尺寸`}</span>
        </div>
      </div>

      <div className="resizeDropHint">
        <Images size={24} />
        <span>拖入批量图片，或使用上方“选择文件夹”读取整文件夹图片。</span>
        <em>{saveDirectory ? `指定文件夹：${saveDirectory}` : "尚未指定保存文件夹"} · {RESIZE_OUTPUT_FOLDER}</em>
      </div>

      <div className="resizeImageGrid">
        {items.map((item, index) => {
          const freshCustom = item.customized && item.settingsKey === currentSettingsKey;
          const canEditIndividually = settings.fitMode === "crop" && settings.cropMode === "individual";
          return (
            <article className={`resizeImageCard ${freshCustom ? "customized" : ""}`} key={item.id}>
              <div
                className="resizeThumb"
                role={canEditIndividually ? "button" : undefined}
                tabIndex={canEditIndividually ? 0 : undefined}
                onClick={() => canEditIndividually && openCropEditor(item)}
                onKeyDown={(event) => {
                  if (canEditIndividually && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    openCropEditor(item);
                  }
                }}
              >
                <img src={item.previewUrl} alt="" draggable={false} />
                <i>{index + 1}</i>
              </div>
              <div className="resizeMeta">
                <strong title={item.name}>{item.name}</strong>
                <span>{fileSize(item.originalFile.size)} · {freshCustom ? "已单张调整" : settings.fitMode === "original-size" ? `原像素 ${settings.dpi}DPI` : settings.fitMode === "original" ? "原图等比缩放" : settings.fitMode === "crop" ? "中心裁剪" : "补边缩放"}</span>
              </div>
              <div className="resizeCardActions">
                <button
                  type="button"
                  onClick={() => openCropEditor(item)}
                  disabled={!canEditIndividually}
                  title="每张裁剪模式下可单独调整"
                >
                  <Crop size={14} />
                </button>
                <button type="button" onClick={() => removeItem(item.id)} title="删除">
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          );
        })}
        {items.length === 0 && (
          <button className="resizeEmpty" type="button" onClick={() => fileInputRef.current?.click()}>
            <Images size={28} />
            <span>还没有图片，点击选择图片或直接拖拽进来</span>
          </button>
        )}
      </div>

      <footer className="batchResizeFooter">
        <span>{status || `已导入 ${items.length} 张，目标文件夹：${RESIZE_OUTPUT_FOLDER}`}</span>
      </footer>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {batchCropTarget && (
        <CropModal
          item={batchCropTarget}
          ratio={settings.ratio}
          initialMode="crop"
          title="批量裁剪区域"
          subtitle={`${batchCropTarget.name} · ${targetSize.width} × ${targetSize.height}`}
          footerText="拖动画面选择统一裁剪区域，滚轮缩放；确认后会应用到批量裁剪模式下的未单独裁剪图片。"
          modeOptions={[["crop", "裁剪区域"]]}
          collectOnly
          onCollectCrop={applyBatchCropTemplate}
          onClose={() => setBatchCropTarget(null)}
          onApply={() => {}}
        />
      )}

      {cropTarget && (
        <CropModal
          item={cropTarget}
          ratio={settings.ratio}
          initialMode="crop"
          title="单张裁剪 / 尺寸导出"
          subtitle={`${cropTarget.name} · ${targetSize?.width || resolveResizeLongEdge(settings)} × ${targetSize?.height || "原图比例"}`}
          footerText="拖动画面选择裁剪位置，滚轮缩放；确认后只更新当前图片，不消费 API。"
          modeOptions={[["crop", "裁剪"], ["pad", "补边"]]}
          processor={(file, ratio, mode, crop) => resizeImageFile(file, { ...settings, ratio, fitMode: mode === "crop" ? "crop" : "pad" }, crop)}
          onClose={() => setCropTarget(null)}
          onApply={applyCropItem}
        />
      )}
    </section>
  );
}
