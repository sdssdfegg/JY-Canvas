// src/features/outfit/outfit-image-pipeline.js
// V64 (P5-2) 2026-10-15：从 outfit-top.js 拆出的「图片/画布管线」层（L1）。
// 内容：blob->File、通用小工具（delay/createAsyncLimiter/groupPreprocessValue）、canvas 高质量
//   jpeg/png 编码、局部回贴/换装/扩图三种 compose、上传画布预处理（pad/outpaint）、
//   createImageItem、defaultLocalEditCrop。
// 分层：只 import L0（./outfit-top.js）与外部模块；不 import 另一个 L1（outfit-page-actions.js）。
//
// 🔴 本文件 defaultLocalEditCrop 与 src/features/local-edit/crop-rect-resize.js 的 defaultQuickLocalEditCrop 是「真分叉」
//    （RF-082 S5 从 src/main.jsx 迁入 crop-rect-resize.js，此处同步更新指向）：
//    outfit 侧语义 = fitRectToRatioLocked(null,…) 一行包装；main 侧保留「普通裁剪自由矩形」语义。
//    两侧常量不同源、语义不同，严禁合并、严禁互相 import。见冷启动「局部回帖分叉裁定」。

import { fetchImageBlob } from "../../api/assets.js";
import { compressOriginalImageFile, constrainLocalEditRect, loadImageFromUrl, makeId, padImageFile, processImageFile, ratioParts, resolveCropSourceRect } from "./outfit-image-utils.js";
import { cropReturnRectSnapshot, imageSource, localEditRectSnapshot, normalizeCropReturnMeta } from "./outfit-task.js";
import { canvasToBlob } from "../../shared/canvas-blob.js";
import { fileBaseName } from "../../shared/file-name.js";
import { CHANNEL_UPLOAD_LIMIT_BYTES, CHANNEL_UPLOAD_MAX_SIDE, CHANNEL_UPLOAD_TARGET_BYTES, imageBitmapFromBlob, imageBitmapFromFile, imageExtension } from "../../shared/image-input.js";
import { composeLocalPasteBlob, fitRectToRatioLocked } from "../../shared/local-edit-geometry.js";
import { LOCAL_EDIT_MASK_MODE, LOCAL_EDIT_MASK_PASTE_FEATHER, LOCAL_EDIT_RECT_MODE, createLocalEditAlphaMask, imageBitmapFromDataUrl } from "../../shared/local-edit-mask.js";
import { LOCAL_EDIT_OUTPUT_TARGET_BYTES, LOCAL_EDIT_OUTPUT_JPEG_QUALITIES, CROP_RETURN_OUTPUT_TARGET_BYTES, CROP_RETURN_OUTPUT_JPEG_QUALITIES } from "./outfit-top.js";

export function fileFromBlob(blob, name, fallbackMimeType = "image/png") {
  const mimeType = blob?.type || fallbackMimeType;
  const extension = imageExtension(mimeType);
  return new File([blob], `${fileBaseName(name || "image")}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });
}
export function groupPreprocessValue(items, fallbackMode) {
  if (!items.length) return fallbackMode;
  const modes = [...new Set(items.map((item) => item.mode || fallbackMode))];
  return modes.length === 1 ? modes[0] : "mixed";
}
export function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
export function createAsyncLimiter(limit) {
  const max = Math.max(1, Number(limit) || 1);
  let active = 0;
  const queue = [];
  const release = () => {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  };
  return async function runLimited(task) {
    if (active >= max) {
      await new Promise((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
export async function canvasToHighQualityJpegBlob(canvas, options = {}) {
  const qualities = Array.isArray(options.qualities) && options.qualities.length
    ? options.qualities
    : LOCAL_EDIT_OUTPUT_JPEG_QUALITIES;
  const targetBytes = Math.max(1, Number(options.targetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES));
  let best = null;
  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    best = { blob, quality };
    if (blob.size <= targetBytes) return best;
  }
  return best;
}
export async function canvasToLosslessPngBlob(canvas) {
  const blob = await canvasToBlob(canvas, "image/png");
  return { blob, quality: 1 };
}
export async function canvasToCropReturnBlob(canvas, options = {}) {
  return canvasToHighQualityJpegBlob(canvas, {
    targetBytes: Number(options.targetBytes || CROP_RETURN_OUTPUT_TARGET_BYTES),
    qualities: CROP_RETURN_OUTPUT_JPEG_QUALITIES
  });
}
export async function composeOutfitLocalEditBlob(originalFile, generatedBlob, cropRect, localEdit = null, options = {}) {
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  let maskImage = null;
  let blendMask = null;
  try {
    const sourceWidth = original.width || original.naturalWidth;
    const sourceHeight = original.height || original.naturalHeight;
    const pasteRect = constrainLocalEditRect(localEdit?.cropRect || cropRect, sourceWidth, sourceHeight);
    // V38 几何对齐诊断：贴回选框宽高比 vs 模型返回图宽高比 的相对差（%）。
    // 贴回是 frameFit:"stretch"（非等比拉伸填满选框），两者比例不一致 ⇒ 模型返回图被挤压 ⇒
    // 描边区外缘出现缝（V38 修的就是这个：把选框锁到生成比例）。
    // |差值| > 1% 视为异常，进单任务日志；这样下次再错位，一眼能分清是"框比例不对"还是"模型返回比例不对"。
    const generatedWidth = generated.width || generated.naturalWidth || 0;
    const generatedHeight = generated.height || generated.naturalHeight || 0;
    const pasteAspect = pasteRect.width && pasteRect.height ? pasteRect.width / pasteRect.height : 0;
    const generatedAspect = generatedWidth && generatedHeight ? generatedWidth / generatedHeight : 0;
    const aspectMismatchPct = pasteAspect && generatedAspect
      ? Math.round(((pasteAspect / generatedAspect) - 1) * 10000) / 100
      : 0;

    const diagnostics = {
      strategy: String(options.strategy || "local-paste"),
      editMode: localEdit?.editMode || LOCAL_EDIT_RECT_MODE,
      sourceWidth,
      sourceHeight,
      generatedWidth,
      generatedHeight,
      aspectMismatchPct,
      frameFit: "stretch",
      pasteRect: localEditRectSnapshot(pasteRect),
      contextRect: null,
      hasContext: false,
      hasMask: Boolean(localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl),
      autoAlign: false,
      maxShift: 0,
      colorMatch: false,
      neutralToneMatch: false,
      sharpenPatch: false,
      protectSkinAndFace: false,
      feather: localEdit?.editMode === LOCAL_EDIT_MASK_MODE ? LOCAL_EDIT_MASK_PASTE_FEATHER : 0,
      patchRect: { x: pasteRect.x, y: pasteRect.y, width: pasteRect.width, height: pasteRect.height },
      composedAt: Date.now()
    };

    if (localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl) {
      maskImage = await imageBitmapFromDataUrl(localEdit.maskDataUrl);
      // V37.1 接缝修复：mask 模式贴回 alpha 用「边界向外羽化」（blur 后硬边保内、软边
      // 溢出向外过渡 ~N px），把上游重绘内容与原图从硬切变成渐变带。rect 模式 /
      // local-detail 不走这里，仍守 2026-09-25「贴回就是贴回」硬边契约。
      blendMask = createLocalEditAlphaMask(maskImage, pasteRect, LOCAL_EDIT_MASK_PASTE_FEATHER);
    }

    const useLosslessOutput = options.losslessOutput !== false;
    const composed = await composeLocalPasteBlob(original, generated, pasteRect, {
      maskImage: blendMask,
      mimeType: useLosslessOutput ? "image/png" : "image/jpeg",
      targetBytes: Number(options.outputTargetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES),
      qualities: LOCAL_EDIT_OUTPUT_JPEG_QUALITIES
    });
    diagnostics.output = {
      mimeType: composed.blob.type || (useLosslessOutput ? "image/png" : "image/jpeg"),
      quality: composed.quality,
      bytes: composed.blob.size,
      lossless: useLosslessOutput,
      targetBytes: Number(options.outputTargetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES)
    };
    return options.returnDiagnostics ? { blob: composed.blob, diagnostics } : composed.blob;
  } finally {
    original.close?.();
    generated.close?.();
    maskImage?.close?.();
  }
}
export async function composeCropReturnBlob(originalFile, generatedBlob, cropReturn, options = {}) {
  if (!originalFile) throw new Error("缺少原图，无法回流到大图画布");
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  try {
    const rect = normalizeCropReturnMeta(cropReturn);
    if (!rect?.cropRect) throw new Error("缺少裁剪回流尺寸，无法回流到大图画布");
    const sourceWidth = Math.max(1, Math.round(original.width || original.naturalWidth || rect.sourceWidth));
    const sourceHeight = Math.max(1, Math.round(original.height || original.naturalHeight || rect.sourceHeight));
    const pasteRect = constrainLocalEditRect(rect.cropRect, sourceWidth, sourceHeight);
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法创建裁剪回流画布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(original, 0, 0, sourceWidth, sourceHeight);
    ctx.drawImage(generated, pasteRect.x, pasteRect.y, pasteRect.width, pasteRect.height);
    const { blob, quality } = await canvasToCropReturnBlob(canvas, options);
    return {
      blob,
      diagnostics: {
        strategy: "crop-return-full-canvas-v1",
        sourceWidth,
        sourceHeight,
        cropRect: cropReturnRectSnapshot(pasteRect),
        outputWidth: sourceWidth,
        outputHeight: sourceHeight,
        generatedWidth: generated.width || generated.naturalWidth || 0,
        generatedHeight: generated.height || generated.naturalHeight || 0,
        output: {
          mimeType: "image/jpeg",
          quality,
          bytes: blob.size,
          targetBytes: Number(options.targetBytes || CROP_RETURN_OUTPUT_TARGET_BYTES)
        },
        composedAt: Date.now()
      }
    };
  } finally {
    original.close?.();
    generated.close?.();
  }
}
export async function composeOutpaintOriginalRegionBlob(originalFile, generatedBlob, outpaintMeta, options = {}) {
  if (!originalFile) throw new Error("缺少原图，无法保护扩图原有区域");
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  try {
    const outputWidth = Math.max(1, Math.round(generated.width || generated.naturalWidth || outpaintMeta?.outputWidth || 1));
    const outputHeight = Math.max(1, Math.round(generated.height || generated.naturalHeight || outpaintMeta?.outputHeight || 1));
    const sourceWidth = Math.max(1, Math.round(original.width || original.naturalWidth || outpaintMeta?.sourceWidth || 1));
    const sourceHeight = Math.max(1, Math.round(original.height || original.naturalHeight || outpaintMeta?.sourceHeight || 1));
    const preparedWidth = Math.max(1, Number(outpaintMeta?.outputWidth) || outputWidth);
    const preparedHeight = Math.max(1, Number(outpaintMeta?.outputHeight) || outputHeight);
    const sourceRect = outpaintMeta?.originalRect || {
      x: 0,
      y: 0,
      width: preparedWidth,
      height: Math.min(preparedHeight, Math.round(preparedWidth * (sourceHeight / sourceWidth)))
    };
    const protectedRect = constrainLocalEditRect({
      x: Math.round(Number(sourceRect.x || 0) * outputWidth / preparedWidth),
      y: Math.round(Number(sourceRect.y || 0) * outputHeight / preparedHeight),
      width: Math.round(Number(sourceRect.width || preparedWidth) * outputWidth / preparedWidth),
      height: Math.round(Number(sourceRect.height || preparedHeight) * outputHeight / preparedHeight)
    }, outputWidth, outputHeight);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法创建扩图原图保护画布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(generated, 0, 0, outputWidth, outputHeight);
    const featherHeight = Math.max(0, Math.min(
      Math.max(24, Math.round(protectedRect.height * 0.08)),
      160,
      Math.max(0, protectedRect.height - 4)
    ));
    const lockedHeight = Math.max(0, protectedRect.height - featherHeight);
    if (lockedHeight > 0) {
      const lockedSourceHeight = Math.max(1, Math.round(sourceHeight * lockedHeight / protectedRect.height));
      ctx.drawImage(
        original,
        0,
        0,
        sourceWidth,
        lockedSourceHeight,
        protectedRect.x,
        protectedRect.y,
        protectedRect.width,
        lockedHeight
      );
    }
    if (featherHeight > 0) {
      const featherCanvas = document.createElement("canvas");
      featherCanvas.width = protectedRect.width;
      featherCanvas.height = featherHeight;
      const featherCtx = featherCanvas.getContext("2d");
      if (featherCtx) {
        const sourceFeatherHeight = Math.max(1, Math.round(sourceHeight * featherHeight / protectedRect.height));
        featherCtx.imageSmoothingEnabled = true;
        featherCtx.imageSmoothingQuality = "high";
        featherCtx.drawImage(
          original,
          0,
          Math.max(0, sourceHeight - sourceFeatherHeight),
          sourceWidth,
          sourceFeatherHeight,
          0,
          0,
          protectedRect.width,
          featherHeight
        );
        featherCtx.globalCompositeOperation = "destination-in";
        const gradient = featherCtx.createLinearGradient(0, 0, 0, featherHeight);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(0.58, "rgba(0,0,0,0.78)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        featherCtx.fillStyle = gradient;
        featherCtx.fillRect(0, 0, protectedRect.width, featherHeight);
        ctx.drawImage(featherCanvas, protectedRect.x, protectedRect.y + lockedHeight);
      }
    } else {
      ctx.drawImage(original, 0, 0, sourceWidth, sourceHeight, protectedRect.x, protectedRect.y, protectedRect.width, protectedRect.height);
    }
    const { blob, quality } = await canvasToLosslessPngBlob(canvas);
    const diagnostics = {
      strategy: "outpaint-original-region-lock-v2-feather",
      sourceWidth,
      sourceHeight,
      preparedWidth,
      preparedHeight,
      generatedWidth: outputWidth,
      generatedHeight: outputHeight,
      originalRect: cropReturnRectSnapshot(sourceRect),
      protectedRect: cropReturnRectSnapshot(protectedRect),
      featherHeight,
      blankRect: outpaintMeta?.blankRect ? cropReturnRectSnapshot(outpaintMeta.blankRect) : null,
      output: {
        mimeType: blob.type || "image/png",
        quality,
        bytes: blob.size,
        lossless: true
      },
      composedAt: Date.now()
    };
    return options.returnDiagnostics ? { blob, diagnostics } : blob;
  } finally {
    original.close?.();
    generated.close?.();
  }
}
export async function blobFromOutfitImage(image) {
  const src = imageSource(image);
  if (!src) throw new Error("图片地址无效");
  return fetchImageBlob(src, "图片下载失败");
}
export async function processImageFileWithMeta(file, ratio, mode = "pad", crop = null) {
  const outputFile = await processImageFile(file, ratio, mode, crop);
  if (mode !== "crop" || !crop) return { file: outputFile, cropReturn: null };
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const sourceWidth = image.naturalWidth || image.width || 0;
    const sourceHeight = image.naturalHeight || image.height || 0;
    const cropRect = resolveCropSourceRect(image, ratio, crop);
    return {
      file: outputFile,
      cropReturn: {
        enabled: true,
        mode: "crop-return",
        cropRect,
        sourceWidth,
        sourceHeight,
        aspectRatio: ratio,
        cropWidth: cropRect.width,
        cropHeight: cropRect.height,
        outputWidth: sourceWidth,
        outputHeight: sourceHeight,
        createdAt: Date.now()
      }
    };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
export async function ensureOutfitUploadCanvasRatio(file, ratio) {
  if (!(file instanceof File)) return file;
  const targetRatio = ratioParts(ratio).value;
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return await compressOriginalImageFile(file);
    const sourceRatio = width / height;
    if (Math.abs(sourceRatio - targetRatio) <= 0.015) {
      return await compressOriginalImageFile(file);
    }
    return await padImageFile(file, image, ratio, false);
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
export async function prepareOutpaintUploadCanvas(file, ratio) {
  const emptyMeta = async (nextFile = file, sourceWidth = 0, sourceHeight = 0) => ({
    file: nextFile,
    maskFile: null,
    originalRect: null,
    blankRect: null,
    maskRect: null,
    outputWidth: 0,
    outputHeight: 0,
    sourceWidth,
    sourceHeight
  });
  if (!(file instanceof File)) {
    return emptyMeta(file, 0, 0);
  }
  const targetRatio = ratioParts(ratio || "9:16").value;
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      return emptyMeta(await compressOriginalImageFile(file), 0, 0);
    }

    const ratioHeight = Math.round(width / targetRatio);
    const minExtensionHeight = Math.round(height * 0.42);
    const targetHeight = Math.max(ratioHeight, height + minExtensionHeight);
    const baseScale = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(width, targetHeight));
    const qualities = [0.92, 0.88, 0.84, 0.78, 0.72, 0.66, 0.6, 0.54, 0.48];
    let scaleFactor = 1;
    let lastAttempt = null;

    function renderPair(scaleDown) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scaleDown));
      canvas.height = Math.max(1, Math.round(targetHeight * scaleDown));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("无法创建扩图上传画布");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawWidth = Math.max(1, Math.round(width * scaleDown));
      const drawHeight = Math.max(1, Math.round(height * scaleDown));
      const drawX = Math.round((canvas.width - drawWidth) / 2);
      ctx.drawImage(image, drawX, 0, drawWidth, drawHeight);

      const blankStartY = drawHeight;
      if (blankStartY < canvas.height) {
        const stripHeight = Math.max(2, Math.round(drawHeight * 0.035));
        const bleedHeight = Math.min(canvas.height - blankStartY, Math.max(8, stripHeight * 5));
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.filter = "blur(10px)";
        ctx.drawImage(
          image,
          0,
          Math.max(0, height - Math.round(height * 0.05)),
          width,
          Math.max(1, Math.round(height * 0.05)),
          drawX,
          blankStartY - Math.round(stripHeight / 2),
          drawWidth,
          bleedHeight
        );
        ctx.restore();
      }

      const overlapHeight = Math.max(0, Math.min(
        Math.max(24, Math.round(drawHeight * 0.08)),
        192,
        Math.max(0, drawHeight - 4),
        Math.max(0, canvas.height - 1)
      ));
      const editableStartY = Math.max(0, drawHeight - overlapHeight);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) throw new Error("无法创建扩图蒙版");
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCtx.fillStyle = "rgba(255,255,255,1)";
      maskCtx.fillRect(0, 0, maskCanvas.width, editableStartY);

      return {
        canvas,
        maskCanvas,
        scaleDown,
        drawX,
        drawWidth,
        drawHeight,
        blankStartY,
        overlapHeight,
        editableStartY
      };
    }

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const rendered = renderPair(baseScale * scaleFactor);
      const maskBlob = await canvasToBlob(rendered.maskCanvas, "image/png");
      for (const quality of qualities) {
        const imageBlob = await canvasToBlob(rendered.canvas, "image/jpeg", quality);
        lastAttempt = { rendered, imageBlob, maskBlob, quality };
        if (imageBlob.size <= CHANNEL_UPLOAD_TARGET_BYTES && maskBlob.size <= CHANNEL_UPLOAD_LIMIT_BYTES) {
          return {
            file: fileFromBlob(imageBlob, `${fileBaseName(file.name)}_outpaint_upload`, "image/jpeg"),
            maskFile: fileFromBlob(maskBlob, `${fileBaseName(file.name)}_outpaint_mask`, "image/png"),
            originalRect: {
              x: rendered.drawX,
              y: 0,
              width: rendered.drawWidth,
              height: rendered.drawHeight
            },
            blankRect: {
              x: rendered.drawX,
              y: rendered.drawHeight,
              width: rendered.drawWidth,
              height: Math.max(0, rendered.canvas.height - rendered.drawHeight)
            },
            maskRect: {
              x: 0,
              y: rendered.editableStartY,
              width: rendered.canvas.width,
              height: Math.max(0, rendered.canvas.height - rendered.editableStartY)
            },
            outputWidth: rendered.canvas.width,
            outputHeight: rendered.canvas.height,
            sourceWidth: width,
            sourceHeight: height,
            scale: rendered.scaleDown,
            maskOverlapHeight: rendered.overlapHeight,
            imageQuality: quality,
            createdAt: Date.now()
          };
        }
      }
      scaleFactor *= 0.84;
    }

    if (lastAttempt?.imageBlob?.size <= CHANNEL_UPLOAD_LIMIT_BYTES && lastAttempt?.maskBlob?.size <= CHANNEL_UPLOAD_LIMIT_BYTES) {
      const { rendered, imageBlob, maskBlob, quality } = lastAttempt;
      return {
        file: fileFromBlob(imageBlob, `${fileBaseName(file.name)}_outpaint_upload`, "image/jpeg"),
        maskFile: fileFromBlob(maskBlob, `${fileBaseName(file.name)}_outpaint_mask`, "image/png"),
        originalRect: {
          x: rendered.drawX,
          y: 0,
          width: rendered.drawWidth,
          height: rendered.drawHeight
        },
        blankRect: {
          x: rendered.drawX,
          y: rendered.drawHeight,
          width: rendered.drawWidth,
          height: Math.max(0, rendered.canvas.height - rendered.drawHeight)
        },
        maskRect: {
          x: 0,
          y: rendered.editableStartY,
          width: rendered.canvas.width,
          height: Math.max(0, rendered.canvas.height - rendered.editableStartY)
        },
        outputWidth: rendered.canvas.width,
        outputHeight: rendered.canvas.height,
        sourceWidth: width,
        sourceHeight: height,
        scale: rendered.scaleDown,
        maskOverlapHeight: rendered.overlapHeight,
        imageQuality: quality,
        createdAt: Date.now()
      };
    }

    throw new Error("扩图上传图和蒙版压缩后仍超过 4MB，请换一张更轻的素材再试");
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
export async function createImageItem(file, ratio, mode) {
  const originalUrl = URL.createObjectURL(file);
  const processedFile = await processImageFile(file, ratio, mode);
  const processedUrl = URL.createObjectURL(processedFile);
  return {
    id: makeId("img"),
    name: file.name,
    originalFile: file,
    file: processedFile,
    originalUrl,
    previewUrl: processedUrl,
    mode,
    cropReturn: null,
    localEdit: null,
    selected: true,
    createdAt: Date.now()
  };
}
export function defaultLocalEditCrop(width, height, ratio) {
  // 2026-09-25：默认选框就是上次/当前选定的比例（居中、约占 62%），
  // 因为局部回贴选框必须"始终"等于所选比例。
  return fitRectToRatioLocked(null, ratio, width, height);
}
