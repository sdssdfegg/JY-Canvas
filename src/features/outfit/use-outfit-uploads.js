// src/features/outfit/use-outfit-uploads.js
// V66 (P5-4) 2026-10-15：从 src/outfit-workflow.jsx（1291–1670，阶段A 后实测）整块搬出的「上传图片组」handler 钩。
// 内容：editUploadLabel / addImages / openReferenceContextMenu / sendReferenceThumbToModelUpload / removeImage /
//   replaceImage / clearImageGroup / toggleImage / reorderImage / applyCropItem / openLocalEdit /
//   applyLocalEditItem / clearLocalEditItem / applyGroupPreprocess / applyGlobalPreprocess / uploadGroupLabel /
//   handleWorkspacePaste / removeOriginalImage —— 共 18 函数。
// 模式：沿用 features/savedir/save-directory.js 的 deps 注入薄壳（V64 use-outfit-settings-intent.js、
//   V66 use-outfit-pages.js 同款）——每次 render 由调用方重建 deps 对象传入，钩内不记忆化，handler 每次 render
//   重建，与搬出前（组件内函数声明）行为完全一致。
// ⚠️ deps 漏项 = 运行期 undefined（vite build 验不出），由 V66 §3.3 负向对照兜底。
// TDZ：钩调用点置于原区块位置（组件内 1291 行处），全部 deps 均在此之前完成初始化；
//   18 函数的最早消费点在 JSX return 区（阶段A 后 2947 行起），远晚于钩调用点。
// uploadGroupLabel：派发日实测域外零消费（草案 §2.3 的 re-export 决策归零）→ 钩内保留并 return，
//   主文件不解构（与阶段A 的 revokeOutfitPageAssets 同款处置）。
import { imageFilesFromClipboard, isImageFile } from "../../shared/image-input.js";
import {
  LOCAL_EDIT_BRUSH_DEFAULT,
  LOCAL_EDIT_MASK_MODE,
  LOCAL_EDIT_MASK_OPACITY_DEFAULT,
  LOCAL_EDIT_RECT_MODE
} from "../../shared/local-edit-mask.js";
import { imageFileFromUrl, referenceSource } from "../../shared/result-image.js";
import { createImageItem } from "./outfit-image-pipeline.js";
import {
  defaultUploadLabelsForPage,
  normalizeUploadLabelText,
  normalizeUploadLabels
} from "./outfit-page-actions.js";
import { makeId, preprocessModeLabel, processImageFile } from "./outfit-panels.jsx";
import { normalizeCropReturnMeta, revokeImageUrls, revokePreviewUrl } from "./outfit-task.js";
import { moveItemByDrop } from "./outfit-top.js";

export function useOutfitUploads(deps) {
  // 注意：makeId / preprocessModeLabel / normalizeUploadLabels / LOCAL_EDIT_RECT_MODE / LOCAL_EDIT_MASK_MODE
  // 主文件仍有域外消费，两边各自从源模块 import（不从主文件回导），无循环依赖。
  const {
    activeOutfitPage,
    uploadLabels, setUploadLabels,
    modelImages, setModelImages,
    clothingImages, setClothingImages,
    referenceImages, setReferenceImages,
    originalLibrary, setOriginalLibrary,
    fixedClothingId, setFixedClothingId,
    localEditTarget, setLocalEditTarget,
    cropTarget, setCropTarget,
    setReferenceContextMenu,
    activeUploadGroup,
    outfitMaxImages,
    allUploadImages,
    isOutfitWorkflow, isPoseRemixWorkflow, isFaceSwapWorkflow,
    settings, updateSetting, enableGenerationCountAutoLink,
    BATCH_LOCAL_EDIT_RATIOS,
    addEvent
  } = deps;

  function editUploadLabel(group, field) {
    const groupIndex = group === "model" ? 1 : group === "clothing" ? 2 : 3;
    const defaults = defaultUploadLabelsForPage(activeOutfitPage.name);
    const current = uploadLabels[group]?.[field] || defaults[group]?.[field] || "";
    const label = field === "title" ? `图${groupIndex}标题` : `图${groupIndex}说明`;
    const input = window.prompt(`修改${label}`, current);
    if (input == null) return;
    const nextText = normalizeUploadLabelText(input, current, field === "title" ? 36 : 140);
    if (!nextText || nextText === current) return;
    setUploadLabels((labels) => normalizeUploadLabels({
      ...labels,
      [group]: {
        ...labels[group],
        [field]: nextText
      }
    }, activeOutfitPage.name));
    addEvent("上传说明", `已修改${label}`);
  }

  async function addImages(group, files) {
    const currentCount = group === "model" ? modelImages.length : group === "clothing" ? clothingImages.length : referenceImages.length;
    // 中文注释：批量姿态页图1承载多张姿态，图2只保留固定母版和备用母版。
    const uploadLimit = group === "clothing" && (isOutfitWorkflow || isPoseRemixWorkflow || isFaceSwapWorkflow)
      ? 2
      : outfitMaxImages;
    const allowed = Math.max(0, uploadLimit - currentCount);
    if (allowed <= 0) {
      addEvent("上传限制", `当前图片区最多 ${uploadLimit} 张`);
      return;
    }
    const acceptedFiles = Array.from(files || []).slice(0, allowed);
    if (acceptedFiles.length < Array.from(files || []).length) {
      addEvent("上传限制", `已保留前 ${uploadLimit} 张，超出的图片未加入`);
    }

    const items = [];
    const originals = [];
    for (const file of acceptedFiles) {
      try {
        const item = await createImageItem(file, settings.aspectRatio, settings.preprocessMode);
        items.push(item);
        originals.push({
          id: makeId("origin"),
          group,
          sourceId: item.id,
          name: file.name,
          url: URL.createObjectURL(file),
          size: file.size,
          createdAt: Date.now()
        });
      } catch (error) {
        addEvent("图片整理失败", `${file.name}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (group === "model") {
      setModelImages((current) => [...current, ...items]);
      if (items.length) enableGenerationCountAutoLink();
    }
    if (group === "clothing") {
      setClothingImages((current) => {
        const next = [...current, ...items];
        if (!fixedClothingId && next[0]) setFixedClothingId(next[0].id);
        return next;
      });
    }
    if (group === "reference") setReferenceImages((current) => [...current, ...items]);
    if (originals.length) setOriginalLibrary((current) => [...current, ...originals].slice(-80));
  }

  function openReferenceContextMenu(event, reference, index, items) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 188;
    const menuHeight = 52;
    setReferenceContextMenu({
      reference,
      index,
      count: Array.isArray(items) ? items.length : 0,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
    });
  }

  async function sendReferenceThumbToModelUpload(reference) {
    const src = referenceSource(reference);
    setReferenceContextMenu(null);
    if (!src) {
      addEvent("参考图", "这张缩略图没有可读取的图片地址");
      return;
    }
    try {
      const file = await imageFileFromUrl(src, reference?.name || reference?.label || "reference");
      await addImages("model", [file]);
      addEvent("参考图", "已发送到图1上传区");
    } catch (error) {
      addEvent("参考图失败", error instanceof Error ? error.message : String(error));
    }
  }

  function removeImage(group, id, options = {}) {
    const { unlinkOriginal = true } = options;
    const remove = (items) => {
      const target = items.find((item) => item.id === id);
      revokeImageUrls(target);
      return items.filter((item) => item.id !== id);
    };
    if (group === "model") {
      setModelImages(remove);
      enableGenerationCountAutoLink();
    }
    if (group === "clothing") {
      setClothingImages((items) => {
        const next = remove(items);
        if (fixedClothingId === id) setFixedClothingId(next[0]?.id || "");
        return next;
      });
    }
    if (group === "reference") setReferenceImages(remove);
    if (localEditTarget?.group === group && localEditTarget?.item?.id === id) setLocalEditTarget(null);
    if (unlinkOriginal) {
      setOriginalLibrary((current) => current.filter((item) => {
        const linked = item.group === group && item.sourceId === id;
        if (linked && item.url) URL.revokeObjectURL(item.url);
        return !linked;
      }));
    }
  }

  async function replaceImage(group, id, file) {
    if (!isImageFile(file)) {
      addEvent("替换失败", "只能替换为图片文件");
      return;
    }
    try {
      const nextItem = await createImageItem(file, settings.aspectRatio, settings.preprocessMode);
      const replace = (items) => items.map((current) => {
        if (current.id !== id) return current;
        revokeImageUrls(current);
        return {
          ...nextItem,
          id,
          selected: current.selected,
          localEdit: null,
          createdAt: current.createdAt || nextItem.createdAt
        };
      });
      if (group === "model") setModelImages(replace);
      if (group === "clothing") {
        setClothingImages(replace);
      }
      if (group === "reference") setReferenceImages(replace);
      setOriginalLibrary((current) => {
        let matched = false;
        const next = current.map((item) => {
          if (item.group !== group || item.sourceId !== id) return item;
          if (item.url) URL.revokeObjectURL(item.url);
          matched = true;
          return {
            ...item,
            name: file.name,
            url: URL.createObjectURL(file),
            size: file.size,
            createdAt: Date.now()
          };
        });
        if (matched) return next;
        return [...next, {
          id: makeId("origin"),
          group,
          sourceId: id,
          name: file.name,
          url: URL.createObjectURL(file),
          size: file.size,
          createdAt: Date.now()
        }].slice(-80);
      });
      addEvent("图片替换", `${file.name} 已替换`);
    } catch (error) {
      addEvent("替换失败", `${file.name}：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function clearImageGroup(group) {
    const clear = (items) => {
      items.forEach(revokeImageUrls);
      return [];
    };
    if (group === "model") {
      setModelImages(clear);
      enableGenerationCountAutoLink();
    }
    if (group === "clothing") {
      setClothingImages(clear);
      setFixedClothingId("");
    }
    if (group === "reference") setReferenceImages(clear);
    setOriginalLibrary((current) => current.filter((item) => {
      const matched = item.group === group;
      if (matched && item.url) URL.revokeObjectURL(item.url);
      return !matched;
    }));
    if (cropTarget?.group === group) setCropTarget(null);
    if (localEditTarget?.group === group) setLocalEditTarget(null);
    addEvent("清除图片", group === "model" ? "图1已清空" : group === "clothing" ? "图2已清空" : "图3已清空");
  }

  function toggleImage(group, id) {
    const toggle = (items) => items.map((item) => item.id === id ? { ...item, selected: !item.selected } : item);
    if (group === "model") {
      setModelImages(toggle);
      enableGenerationCountAutoLink();
    }
    if (group === "clothing") setClothingImages(toggle);
    if (group === "reference") setReferenceImages(toggle);
  }

  function reorderImage(group, fromId, toId, placement) {
    const reorder = (items) => moveItemByDrop(items, fromId, toId, placement);
    if (group === "model") setModelImages(reorder);
    if (group === "clothing") setClothingImages(reorder);
    if (group === "reference") setReferenceImages(reorder);
  }

  function applyCropItem(group, item) {
    const replace = (items) => items.map((current) => {
      if (current.id !== item.id) return current;
      revokePreviewUrl(current);
      return {
        ...item,
        cropReturn: group === "model" ? normalizeCropReturnMeta(item.cropReturn) : null
      };
    });
    if (group === "model") setModelImages(replace);
    if (group === "clothing") {
      setClothingImages(replace);
    }
    if (group === "reference") setReferenceImages(replace);
    setCropTarget(null);
    if (group === "model" && item.cropReturn?.cropRect) {
      addEvent("裁剪生成回流", `图1已记录 ${item.cropReturn.cropWidth || item.cropReturn.cropRect.width}×${item.cropReturn.cropHeight || item.cropReturn.cropRect.height} 裁剪框，生成后回流到 ${item.cropReturn.outputWidth}×${item.cropReturn.outputHeight} 大图`);
    }
  }

  function openLocalEdit(group, item) {
    if (group !== "model") {
      addEvent("局部回贴", "只有图1支持局部回贴；图2和图3只作为参考图使用普通裁剪。");
      return;
    }
    const nextRatio = BATCH_LOCAL_EDIT_RATIOS.includes(settings.aspectRatio)
      ? settings.aspectRatio
      : BATCH_LOCAL_EDIT_RATIOS[0];
    if (nextRatio !== settings.aspectRatio) updateSetting("aspectRatio", nextRatio);
    setLocalEditTarget({ group, item });
  }

  function applyLocalEditItem(group, itemId, cropped) {
    if (group !== "model") {
      setLocalEditTarget(null);
      addEvent("局部回贴", "已忽略非图1的局部回贴设置。");
      return;
    }
    const localEdit = {
      cropFile: cropped.file,
      cropRect: cropped.cropRect,
      contextRect: cropped.contextRect || null,
      sourceWidth: cropped.sourceWidth,
      sourceHeight: cropped.sourceHeight,
      previewUrl: URL.createObjectURL(cropped.file),
      aspectRatio: BATCH_LOCAL_EDIT_RATIOS.includes(cropped.aspectRatio) ? cropped.aspectRatio : BATCH_LOCAL_EDIT_RATIOS[0],
      editMode: cropped.editMode || LOCAL_EDIT_RECT_MODE,
      maskDataUrl: cropped.maskDataUrl || "",
      maskBounds: cropped.maskBounds || null,
      brushSize: cropped.brushSize || LOCAL_EDIT_BRUSH_DEFAULT,
      maskOpacity: cropped.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT,
      appliedAt: Date.now()
    };
    const replace = (items) => items.map((current) => {
      if (current.id !== itemId) return current;
      if (current.localEdit?.previewUrl) URL.revokeObjectURL(current.localEdit.previewUrl);
      return { ...current, localEdit };
    });
    setModelImages(replace);
    updateSetting("aspectRatio", localEdit.aspectRatio);
    setLocalEditTarget(null);
    addEvent("局部回贴", `${uploadGroupLabel(group)} 已启用 ${localEdit.aspectRatio} ${localEdit.editMode === LOCAL_EDIT_MASK_MODE ? "涂抹蒙版" : "局部区域"}`);
  }

  function clearLocalEditItem(group, itemId) {
    if (group !== "model") {
      setLocalEditTarget(null);
      return;
    }
    const replace = (items) => items.map((current) => {
      if (current.id !== itemId) return current;
      if (current.localEdit?.previewUrl) URL.revokeObjectURL(current.localEdit.previewUrl);
      return { ...current, localEdit: null };
    });
    setModelImages(replace);
    setLocalEditTarget(null);
    addEvent("局部回贴", `${uploadGroupLabel(group)} 已取消局部回贴`);
  }

  async function applyGroupPreprocess(group, mode) {
    if (mode === "mixed") return;
    if (mode === "crop") {
      addEvent("手动裁剪", "请点单张图片的裁剪按钮调整裁剪区域");
      return;
    }
    updateSetting("preprocessMode", mode);
    const sourceItems = group === "model" ? modelImages : group === "clothing" ? clothingImages : referenceImages;
    if (!sourceItems.length) return;

    const nextItems = await Promise.all(sourceItems.map(async (item) => {
      try {
        const nextFile = await processImageFile(item.originalFile, settings.aspectRatio, mode);
        revokePreviewUrl(item);
        const nextItem = {
          ...item,
          file: nextFile,
          previewUrl: URL.createObjectURL(nextFile),
          mode
        };
        return nextItem;
      } catch (error) {
        addEvent("批量统一失败", `${item.name}：${error instanceof Error ? error.message : String(error)}`);
        return item;
      }
    }));

    if (group === "model") setModelImages(nextItems);
    if (group === "clothing") {
      setClothingImages(nextItems);
    }
    if (group === "reference") setReferenceImages(nextItems);
  }

  async function applyGlobalPreprocess(mode) {
    if (mode === "mixed") return;
    if (mode === "crop") {
      addEvent("手动裁剪", "请点单张图片的裁剪按钮调整裁剪区域");
      return;
    }
    if (allUploadImages.length === 0) {
      updateSetting("preprocessMode", mode);
      return;
    }
    await Promise.all([
      applyGroupPreprocess("model", mode),
      applyGroupPreprocess("clothing", mode),
      applyGroupPreprocess("reference", mode)
    ]);
    addEvent("统一处理", `已统一为${preprocessModeLabel(mode)}`);
  }

  function uploadGroupLabel(group) {
    if (group === "model") return "图1";
    if (group === "clothing") return "图2";
    return "图3";
  }

  function handleWorkspacePaste(event) {
    const pastedImages = imageFilesFromClipboard(event.clipboardData);
    if (pastedImages.length === 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("textarea,input,select")) return;
    event.preventDefault();
    void addImages(activeUploadGroup, pastedImages);
    addEvent("粘贴上传", `已加入${uploadGroupLabel(activeUploadGroup)}`);
  }

  function removeOriginalImage(id) {
    const target = originalLibrary.find((item) => item.id === id);
    if (target?.group && target?.sourceId) {
      removeImage(target.group, target.sourceId, { unlinkOriginal: false });
    }
    if (target?.url) URL.revokeObjectURL(target.url);
    setOriginalLibrary((current) => {
      return current.filter((item) => item.id !== id);
    });
  }

  return {
    editUploadLabel,
    addImages,
    openReferenceContextMenu,
    sendReferenceThumbToModelUpload,
    removeImage,
    replaceImage,
    clearImageGroup,
    toggleImage,
    reorderImage,
    applyCropItem,
    openLocalEdit,
    applyLocalEditItem,
    clearLocalEditItem,
    applyGroupPreprocess,
    applyGlobalPreprocess,
    uploadGroupLabel,
    handleWorkspacePaste,
    removeOriginalImage
  };
}
