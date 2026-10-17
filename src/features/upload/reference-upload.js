import { fileBaseName } from "../../shared/file-name.js";
import { CHANNEL_UPLOAD_LIMIT_BYTES, CHANNEL_UPLOAD_MAX_SIDE, CHANNEL_UPLOAD_TARGET_BYTES, addFilesByRole, imageBitmapFromFile, imageExtension, imageFilesFromList, removeFilesByRole } from "../../shared/image-input.js";
import { imageFileFromUrl } from "../../shared/result-image.js";
import { resolveLocalEditBaseFile } from "../../shared/local-edit-geometry.js";
import { renderReferencePolicy, NO_REFERENCE_NOTE } from "../../shared/reference-policy.js";
import { canvasToBlob } from "../../shared/canvas-blob.js";
import { moveItemByDrop } from "../../shared/list-order.js";

// 参考图上传域工厂 —— 全部函数体从 src/main.jsx 逐字抽出，未改一行逻辑。
// 形态同 RF-066~069：普通工厂（不 import React、无 useState/useCallback/useMemo）。
// deps 解构保持同名 ⇒ main.jsx 调用点零改动；函数体内部互相调用直接引用闭包局部函数 ⇒ 不改签名。




// 模块级常量随本域一起搬出（main.jsx JSX 仍要用于展示上限 ⇒ 反向 import 回来）。
export const MAX_REFERENCE_REWRITE_FILES = 6;

export function makeQuickReferenceItem(file) {
  return {
    id: `quick_ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    file,
    originalFile: file,
    cropEdit: null,
    localEdit: null,
    createdAt: Date.now()
  };
}

export function createReferenceUpload(deps) {
  const {
    referenceProductFiles,
    referenceStyleFiles,
    setReferenceProductFiles,
    setReferenceStyleFiles,
    setFiles,
    quickMaxReferenceFiles,
    addEvent,
    setIsComposerDragging,
    setReferenceDropTarget,
    results,
    detailGroups,
    blobFromImageItem
  } = deps;

  function addReferenceRewriteFiles(role, fileList) {
    addFilesByRole(role, fileList, referenceProductFiles.length + referenceStyleFiles.length,
      MAX_REFERENCE_REWRITE_FILES, `产品图和参考图合计最多 ${MAX_REFERENCE_REWRITE_FILES} 张`,
      "参考生图", addEvent, setReferenceProductFiles, setReferenceStyleFiles);
  }

  function removeReferenceRewriteFile(role, index) {
    removeFilesByRole(role, index, setReferenceProductFiles, setReferenceStyleFiles);
  }

  // V82（上传模块清除按钮统一）：一键清空某 role 全部文件（区别于按 index 删除）。
  function clearReferenceRewriteFiles(role) {
    if (role === "product") setReferenceProductFiles([]);
    else setReferenceStyleFiles([]);
  }

  function appendReferenceFiles(fileList, options = {}) {
    const picked = imageFilesFromList(fileList);
    if (picked.length === 0) return;
    setFiles((current) => {
      const remaining = quickMaxReferenceFiles - current.length;
      if (remaining <= 0) {
        addEvent("提示", `最多上传 ${quickMaxReferenceFiles} 张参考图`);
        return current;
      }
      const accepted = picked.slice(0, remaining).map(makeQuickReferenceItem);
      addEvent(options.eventLabel || "上传", `${options.actionText || "追加"} ${accepted.length} 张参考图`);
      return [...current, ...accepted];
    });
  }

  function replaceReferenceFiles(index, fileList) {
    const picked = imageFilesFromList(fileList);
    if (picked.length === 0) return;
    setFiles((current) => {
      if (index < 0 || index >= current.length) return current;
      const next = [...current];
      next[index] = makeQuickReferenceItem(picked[0]);
      const remaining = quickMaxReferenceFiles - next.length;
      if (remaining > 0 && picked.length > 1) {
        next.splice(index + 1, 0, ...picked.slice(1, remaining + 1).map(makeQuickReferenceItem));
      }
      addEvent("参考图", `已替换图${index + 1}`);
      return next;
    });
  }

  function insertReferenceFiles(index, fileList) {
    const picked = imageFilesFromList(fileList);
    if (picked.length === 0) return;
    setFiles((current) => {
      const remaining = quickMaxReferenceFiles - current.length;
      if (remaining <= 0) {
        addEvent("提示", `最多上传 ${quickMaxReferenceFiles} 张参考图`);
        return current;
      }
      const accepted = picked.slice(0, remaining).map(makeQuickReferenceItem);
      const next = [...current];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, ...accepted);
      addEvent("参考图", `已插入 ${accepted.length} 张参考图`);
      return next;
    });
  }

  // 2026-10-06：快捷生成侧补上「参考图左右调顺序」。批量侧早就有这个功能，
  // 快捷侧一直缺。排序内核走 src/shared/list-order.js（两侧共用同一份实现）。
  // placement = "before" | "after"，相对 toId 那张图。
  function moveReferenceFile(fromId, toId, placement) {
    setFiles((current) => {
      const next = moveItemByDrop(current, fromId, toId, placement);
      if (next === current) return current;
      const fromIndex = current.findIndex((item) => item.id === fromId);
      const toIndex = next.findIndex((item) => item.id === fromId);
      // 顺序真的变了才记一笔；图1/图2 的编号会跟着变，用户需要知道。
      if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) {
        addEvent("参考图", `第 ${fromIndex + 1} 张移到第 ${toIndex + 1} 位`);
      }
      return next;
    });
  }

  function onPickFiles(event) {
    appendReferenceFiles(event.target.files);
    event.target.value = "";
  }

  function isReferenceDropData(dataTransfer) {
    const types = Array.from(dataTransfer?.types || []);
    return types.includes("Files")
      || types.includes("application/x-jingyin-result-id")
      || types.includes("text/uri-list")
      || types.includes("text/plain");
  }

  function onComposerDragOver(event) {
    if (!isReferenceDropData(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsComposerDragging(true);
  }

  function onComposerDragLeave(event) {
    if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    setIsComposerDragging(false);
  }

  function onComposerDrop(event) {
    event.preventDefault();
    setIsComposerDragging(false);
    setReferenceDropTarget(null);
    void imageFilesFromReferenceDrop(event.dataTransfer)
      .then((droppedFiles) => appendReferenceFiles(droppedFiles))
      .catch((err) => addEvent("拖拽上传失败", err instanceof Error ? err.message : String(err)));
  }

  function beginReferenceDrop(event, type, index) {
    if (!isReferenceDropData(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setReferenceDropTarget({ type, index });
  }

  function endReferenceDrop() {
    setReferenceDropTarget(null);
  }

  function onReferenceDrop(event, type, index) {
    event.preventDefault();
    event.stopPropagation();
    setIsComposerDragging(false);
    setReferenceDropTarget(null);
    void imageFilesFromReferenceDrop(event.dataTransfer)
      .then((droppedFiles) => {
        if (type === "replace") replaceReferenceFiles(index, droppedFiles);
        else insertReferenceFiles(index, droppedFiles);
      })
      .catch((err) => addEvent("拖拽上传失败", err instanceof Error ? err.message : String(err)));
  }

  function findGeneratedResultById(id) {
    if (!id) return null;
    return results.find((item) => item.id === id)
      || detailGroups.flatMap((group) => group.prompts || []).flatMap((prompt) => prompt.results || []).find((item) => item.id === id)
      || null;
  }

  async function imageFilesFromReferenceDrop(dataTransfer) {
    const resultId = dataTransfer?.getData?.("application/x-jingyin-result-id") || "";
    if (resultId) {
      const item = findGeneratedResultById(resultId);
      if (item) {
        const blob = await blobFromImageItem(item);
        return [new File([blob], `${fileBaseName(item.modelLabel || "result")}-${Date.now()}.${imageExtension(blob.type)}`, {
          type: blob.type || "image/png",
          lastModified: Date.now()
        })];
      }
    }

    const directFiles = imageFilesFromList(dataTransfer?.files);
    if (directFiles.length > 0) return directFiles;

    const uri = String(dataTransfer?.getData?.("text/uri-list") || dataTransfer?.getData?.("text/plain") || "")
      .split(/\r?\n/)
      .find((line) => line && !line.startsWith("#"));
    if (uri && (/^https?:\/\//i.test(uri) || uri.startsWith("/") || uri.startsWith("data:"))) {
      return [await imageFileFromUrl(uri, "drag-image")];
    }
    return [];
  }

  return {
    addReferenceRewriteFiles,
    removeReferenceRewriteFile,
    clearReferenceRewriteFiles,
    appendReferenceFiles,
    replaceReferenceFiles,
    insertReferenceFiles,
    moveReferenceFile,
    onPickFiles,
    isReferenceDropData,
    onComposerDragOver,
    onComposerDragLeave,
    onComposerDrop,
    beginReferenceDrop,
    endReferenceDrop,
    onReferenceDrop,
    imageFilesFromReferenceDrop
  };
}

export { renderReferencePolicy, NO_REFERENCE_NOTE } from "../../shared/reference-policy.js";

export function buildReferenceRemixPrompt(settings, productCount, styleCount) {
  const basePrompt = settings.prompt.trim() || "生成一张适合电商展示的高质量商品图，画面干净、真实、商业感强。";
  const header = [
    "你正在为电商运营生成一张参考改写图片。",
    `上传图片顺序说明：前 ${productCount} 张是产品图/产品主体，用于锁定商品结构、颜色、材质、比例和关键细节；后 ${styleCount} 张是运营参考图，只用于参考视觉方向。`
  ];
  const productKeep = "必须保持产品主体真实可信，不改变核心款式、结构和面料信息；不要照搬参考图里的品牌、人物身份、文字、水印、边框、排版比例或完全相同背景。";
  const avoid = "如果参考图里有不适合当前产品的内容，自动舍弃，只保留有助于电商转化的视觉策略。";
  const tail = `整体提示词：${basePrompt}`;
  if (Number(styleCount) <= 0) {
    return [header[0], header[1], NO_REFERENCE_NOTE, productKeep, avoid, tail].join("\n");
  }
  const policy = renderReferencePolicy({
    strength: settings.strength,
    element: settings.element,
    composition: settings.composition,
    scene: settings.scene,
    styleCount
  });
  return [header[0], header[1], ...policy, productKeep, avoid, tail].join("\n");
}

export function buildSmartReferencePrompt(settings, styleCount = 0) {
  const userIntent = settings.prompt.trim();
  const baseIntent = userIntent || "生成一张适合电商投放和商品展示的高质量图片，突出产品真实款式、材质、颜色、卖点和购买欲。";
  const ecom = "电商画面要求：主体清晰、商品不变形、材质纹理真实、光线柔和干净、画面有转化感；适合淘宝/抖音/小红书等平台展示。";
  const avoid = "规避项：不要照搬参考图，不要出现水印、商标、乱码文字、无关人物、错误结构、夸张畸变和虚假卖点。";
  if (Number(styleCount) <= 0) {
    return [baseIntent, NO_REFERENCE_NOTE, ecom, avoid].join("\n");
  }
  const policy = renderReferencePolicy({
    strength: settings.strength,
    element: settings.element,
    composition: settings.composition,
    scene: settings.scene,
    styleCount
  });
  return [baseIntent, ...policy, ecom, avoid].join("\n");
}

export function quickReferenceOriginalFile(item) {
  // 与批量侧同一份规则（原图优先）：局部回贴的裁剪源与贴回底图必须是同一张图。
  // 这里保留 `|| item` 兜底，因为快捷侧的条目可能就是裸 File。
  return resolveLocalEditBaseFile(item) || item;
}

export function quickReferenceUploadFile(item) {
  return item?.localEdit?.cropFile || item?.cropEdit?.cropFile || item?.file || item;
}

export function quickReferenceHasLocalEdit(item) {
  return Boolean(item?.localEdit?.cropFile && item?.localEdit?.cropRect);
}

export function quickReferenceUploadFiles(items) {
  return (items || []).map(quickReferenceUploadFile).filter((file) => file instanceof File);
}

export function quickReferenceRunUploadFile(item, localEditItem = null) {
  if (localEditItem?.id && item?.id === localEditItem.id) {
    return item?.localEdit?.cropFile || quickReferenceUploadFile(item);
  }
  return item?.cropEdit?.cropFile || quickReferenceOriginalFile(item);
}

export function referenceMetaFromQuickRunItems(items, localEditItem = null, role = "reference", startIndex = 0) {
  return (items || []).map((item, index) => {
    const file = quickReferenceRunUploadFile(item, localEditItem);
    const originalFile = quickReferenceOriginalFile(item);
    const isActiveLocalEdit = Boolean(localEditItem?.id && item?.id === localEditItem.id);
    return {
      name: file?.name || originalFile?.name || `reference-${startIndex + index + 1}`,
      role,
      index: startIndex + index,
      size: file?.size || 0,
      type: file?.type || "",
      lastModified: file?.lastModified || originalFile?.lastModified || 0,
      cropEdit: Boolean(!isActiveLocalEdit && item?.cropEdit?.cropFile),
      localEdit: isActiveLocalEdit
    };
  });
}

export function referenceMetaFromFiles(files, role = "reference", startIndex = 0) {
  return (files || []).map((file, index) => ({
    name: file.name || `reference-${startIndex + index + 1}`,
    role,
    index: startIndex + index,
    size: file.size || 0,
    type: file.type || "",
    lastModified: file.lastModified || 0
  }));
}

export async function compressImageForChannel(file, options = {}) {
  const forceJpeg = Boolean(options.forceJpeg);
  if (!file || (!forceJpeg && file.size <= CHANNEL_UPLOAD_LIMIT_BYTES)) {
    return { file, compressed: false, normalized: false };
  }
  const bitmap = await imageBitmapFromFile(file);
  try {
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    if (!sourceWidth || !sourceHeight) return { file, compressed: false, normalized: false };

    let scale = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
    let bestBlob = null;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return { file, compressed: false, normalized: false };
    const targetBytes = CHANNEL_UPLOAD_TARGET_BYTES;
    const qualitySteps = forceJpeg
      ? [0.92, 0.88, 0.82, 0.76, 0.68, 0.58, 0.48, 0.42]
      : [0.88, 0.8, 0.72, 0.64, 0.56, 0.48, 0.42];

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        bestBlob = blob;
        if (blob.size <= targetBytes) {
          return {
            file: new File([blob], `${fileBaseName(file.name)}_upload.jpg`, {
              type: "image/jpeg",
              lastModified: Date.now()
            }),
            compressed: blob.size < file.size || file.size > CHANNEL_UPLOAD_LIMIT_BYTES,
            normalized: forceJpeg
          };
        }
      }
      scale *= 0.78;
    }

    if (!bestBlob || bestBlob.size > CHANNEL_UPLOAD_LIMIT_BYTES || (!forceJpeg && bestBlob.size >= file.size)) {
      return { file, compressed: false, normalized: false };
    }
    return {
      file: new File([bestBlob], `${fileBaseName(file.name)}_upload.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now()
      }),
      compressed: bestBlob.size < file.size || file.size > CHANNEL_UPLOAD_LIMIT_BYTES,
      normalized: forceJpeg
    };
  } finally {
    bitmap.close?.();
  }
}

export async function prepareImageFilesForChannel(files, options = {}) {
  const prepared = [];
  let compressedCount = 0;
  let normalizedCount = 0;
  let originalBytes = 0;
  let uploadBytes = 0;
  const preserveFirstFile = Boolean(options.preserveFirstFile);
  const preserveFirstFileMaxBytes = Math.max(CHANNEL_UPLOAD_LIMIT_BYTES, Number(options.preserveFirstFileMaxBytes || CHANNEL_UPLOAD_LIMIT_BYTES));
  for (const [index, file] of (files || []).entries()) {
    originalBytes += file.size || 0;
    if (preserveFirstFile && index === 0 && (file.size || 0) <= preserveFirstFileMaxBytes) {
      uploadBytes += file.size || 0;
      prepared.push(file);
      continue;
    }
    let next;
    try {
      next = await compressImageForChannel(file, options);
    } catch {
      next = { file, compressed: false, normalized: false };
    }
    if ((next.file.size || 0) > CHANNEL_UPLOAD_LIMIT_BYTES) {
      throw new Error(`image too large, max 4MB: ${file.name}`);
    }
    if (next.compressed) compressedCount += 1;
    if (next.normalized) normalizedCount += 1;
    uploadBytes += next.file.size || 0;
    prepared.push(next.file);
  }
  return { files: prepared, compressedCount, normalizedCount, originalBytes, uploadBytes };
}

export async function cropQuickReferenceViewportFile(referenceItem, crop, ratio) {
  const file = quickReferenceOriginalFile(referenceItem);
  if (!(file instanceof File)) throw new Error("无法读取裁剪图片");
  const bitmap = await imageBitmapFromFile(file);
  try {
    const sourceWidth = bitmap.width || bitmap.naturalWidth || 1;
    const sourceHeight = bitmap.height || bitmap.naturalHeight || 1;
    const stageWidth = Math.max(1, Number(crop?.stageWidth) || 1);
    const stageHeight = Math.max(1, Number(crop?.stageHeight) || 1);
    const baseScale = Math.min(stageWidth / sourceWidth, stageHeight / sourceHeight);
    const drawScale = baseScale * Math.max(0.05, Number(crop?.scale) || 1);
    const drawWidth = sourceWidth * drawScale;
    const drawHeight = sourceHeight * drawScale;
    const left = stageWidth / 2 - drawWidth / 2 + (Number(crop?.x) || 0);
    const top = stageHeight / 2 - drawHeight / 2 + (Number(crop?.y) || 0);
    const viewLeft = (0 - left) / drawScale;
    const viewTop = (0 - top) / drawScale;
    const viewRight = (stageWidth - left) / drawScale;
    const viewBottom = (stageHeight - top) / drawScale;

    let sourceX = Math.max(0, Math.min(sourceWidth, viewLeft));
    let sourceY = Math.max(0, Math.min(sourceHeight, viewTop));
    let sourceRight = Math.max(0, Math.min(sourceWidth, viewRight));
    let sourceBottom = Math.max(0, Math.min(sourceHeight, viewBottom));

    if (sourceRight - sourceX < 2 || sourceBottom - sourceY < 2) {
      // 2026-09-25：这里原来会按 ratio 重新凑一个等比源矩形（并在横图/竖图上取中间一块）。
      // 那是"因为比例设置自动扩展选区"的来源之一：用户看到的可见范围会被换掉。
      // 现在只把可见范围夹进图片范围内，不做任何比例重算。
      sourceX = Math.max(0, Math.min(sourceWidth - 1, viewLeft));
      sourceY = Math.max(0, Math.min(sourceHeight - 1, viewTop));
      sourceRight = Math.max(sourceX + 1, Math.min(sourceWidth, viewRight));
      sourceBottom = Math.max(sourceY + 1, Math.min(sourceHeight, viewBottom));
    }

    const cropWidth = Math.max(1, sourceRight - sourceX);
    const cropHeight = Math.max(1, sourceBottom - sourceY);
    const scaleDown = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(cropWidth, cropHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(cropWidth * scaleDown));
    canvas.height = Math.max(1, Math.round(cropHeight * scaleDown));
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法创建裁剪画布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sourceX, sourceY, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
    const croppedFile = new File([blob], `${fileBaseName(file.name)}_crop.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now()
    });
    return {
      file: croppedFile,
      cropRect: {
        x: Math.round(sourceX),
        y: Math.round(sourceY),
        width: Math.round(cropWidth),
        height: Math.round(cropHeight)
      },
      sourceWidth,
      sourceHeight,
      aspectRatio: ratio
    };
  } finally {
    bitmap.close?.();
  }
}
