import { fileBaseName } from "../../shared/file-name.js";
import { addFilesByRole, imageBitmapFromFile, imageExtension, imageFilesFromList, removeFilesByRole } from "../../shared/image-input.js";
import { imageFileFromUrl } from "../../shared/result-image.js";
import { referenceDefaults } from "../../shared/app-defaults.js";
import { resolveLocalEditBaseFile } from "../../shared/local-edit-geometry.js";
import { canvasToBlob } from "../../shared/canvas-blob.js";

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
    appendReferenceFiles,
    replaceReferenceFiles,
    insertReferenceFiles,
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


export const CHANNEL_UPLOAD_LIMIT_BYTES = 4 * 1024 * 1024;

export const CHANNEL_UPLOAD_TARGET_BYTES = 3.75 * 1024 * 1024;

export const CHANNEL_UPLOAD_MAX_SIDE = 3072;

export function referenceControlText(value, target) {
  const skillMap = {
    元素: {
      none: "参考元素：不使用运营参考图里的道具、装饰、文字、品牌标识和人物身份，只保留产品图本身的商品信息。",
      light: "参考元素：只提取少量安全元素方向，例如色块、材质氛围、轻量道具类别；所有元素必须重新组合，不能照搬参考图主体。",
      medium: "参考元素：可吸收参考图中对转化有帮助的元素类别和层级，例如卖点承托物、背景材质、配色呼应；必须替换具体样式和摆放。",
      strong: "参考元素：重点学习参考图的元素策略和商业层次，但要重构道具、背景细节、文字位置和视觉符号，避免同款、商标、水印和原图文案。"
    },
    构图: {
      none: "参考构图：不沿用参考图构图，采用稳定电商构图，主体清晰、留白合理、卖点视线顺畅。",
      light: "参考构图：只轻参考画面方向和主体占比，重新安排视角、留白、前后景关系，避免相同镜头和相同版式。",
      medium: "参考构图：保留参考图的视觉节奏和主次层级，例如主体位置、卖点区域、景深关系；但重新设计裁切、角度和空间比例。",
      strong: "参考构图：重点参考参考图的转化型构图逻辑和视觉动线，但必须改变关键排版、画面比例、镜头距离和元素位置，不能复刻。"
    },
    场景主题: {
      none: "参考场景主题：不参考运营参考图场景，重新生成符合商品调性的干净电商场景。",
      light: "参考场景主题：只参考氛围方向，例如清爽、户外、居家、轻奢、专业感；场景地点和细节必须重建。",
      medium: "参考场景主题：可吸收相近使用场景和情绪价值，让商品更有代入感；但替换空间结构、背景物和光线细节。",
      strong: "参考场景主题：重点参考参考图的场景类型和消费情绪，但必须重构环境、装饰、人物关系和品牌信息，避免同图感。"
    }
  };
  return skillMap[target]?.[value] || skillMap[target]?.none || `不参考运营参考图的${target}。`;
}

export function referenceStrengthText(value) {
  const strength = Math.max(30, Math.min(100, Number.parseInt(value, 10) || referenceDefaults.strength));
  const map = {
    30: "极低参考：只判断参考图是否有可用方向，主要由产品图和输入提示词主导。",
    40: "低参考：提取少量配色、氛围或运营意图，保持画面明显原创。",
    50: "轻中参考：吸收参考图的商业气质，但产品呈现、场景和构图以重新设计为主。",
    60: "中参考：保留参考图的关键视觉策略，同时重组画面层次和电商卖点表达。",
    70: "中高参考：较明显参考运营图的风格、节奏和转化逻辑，但替换关键画面细节。",
    80: "高参考：强参考运营图的视觉方向和商业表达，必须重构元素、构图、场景，避免同款感。",
    90: "极高参考：尽量靠近参考图的运营策略，但必须避开相同版式、相同背景、相同文案和品牌信息。",
    100: "满参考：最大程度吸收参考图的投放策略和视觉记忆点，同时强制重绘所有可识别细节，不能复制原图。"
  };
  return map[Math.round(strength / 10) * 10] || map[60];
}

export function buildReferenceRemixPrompt(settings, productCount, styleCount) {
  const basePrompt = settings.prompt.trim() || "生成一张适合电商展示的高质量商品图，画面干净、真实、商业感强。";
  return [
    "你正在为电商运营生成一张参考改写图片。",
    `上传图片顺序说明：前 ${productCount} 张是产品图/产品主体，用于锁定商品结构、颜色、材质、比例和关键细节；后 ${styleCount} 张是运营参考图，只用于参考视觉方向。`,
    `参考值：${settings.strength}%（${referenceStrengthText(settings.strength)}）`,
    referenceControlText(settings.element, "元素"),
    referenceControlText(settings.composition, "构图"),
    referenceControlText(settings.scene, "场景主题"),
    "必须保持产品主体真实可信，不改变核心款式、结构和面料信息；不要照搬参考图里的品牌、人物身份、文字、水印、边框、排版比例或完全相同背景。",
    "如果参考图里有不适合当前产品的内容，自动舍弃，只保留有助于电商转化的视觉策略。",
    `整体提示词：${basePrompt}`
  ].join("\n");
}

export function buildSmartReferencePrompt(settings) {
  const userIntent = settings.prompt.trim();
  const baseIntent = userIntent || "生成一张适合电商投放和商品展示的高质量图片，突出产品真实款式、材质、颜色、卖点和购买欲。";
  return [
    baseIntent,
    `参考策略：${settings.strength}%参考，${referenceStrengthText(settings.strength)}产品图优先级最高，参考图只用于提取运营方向。`,
    referenceControlText(settings.element, "元素"),
    referenceControlText(settings.composition, "构图"),
    referenceControlText(settings.scene, "场景主题"),
    "电商画面要求：主体清晰、商品不变形、材质纹理真实、光线柔和干净、画面有转化感；适合淘宝/抖音/小红书等平台展示。",
    "规避项：不要照搬参考图，不要出现水印、商标、乱码文字、无关人物、错误结构、夸张畸变和虚假卖点。"
  ].join("\n");
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
