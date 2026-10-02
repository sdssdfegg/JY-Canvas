// 图片「输入侧」的公共实现：判断文件是不是图、从各种来源拿到可绘制的位图。
//
// 为什么要有这个文件（前端专项阶段 B · 刀 3）：
//   isImageFile / imageFilesFromList / imageFilesFromClipboard / imageBitmapFromFile /
//   imageBitmapFromBlob 这几支，此前在 src/image-editor.jsx、src/main.jsx、
//   src/outfit-workflow.jsx 里各抄了一份（019 门禁点名 5 条、共 12 份定义）。
//   批量页与主画板对「什么算一张图」「怎么把文件变成位图」一旦判定不一致，
//   同一个文件在一处能传、在另一处静默失败 —— 这正是阶段 B 要拆的病根。
//
// 纪律：
//   - 纯浏览器 API，不依赖 React，也不依赖任何 .jsx；
//   - 判定口径**只此一份**，改这里等于同时改三处（这正是收口的目的）；
//   - `imageExtension` 一并收在这里（它是 imageFilesFromClipboard 的依赖），
//     原本只在 src/main.jsx 有一份；⚠️ src/outfit-workflow.jsx 另有一份
//     **同名同体不同名**的 `imageExtensionFromMime`（逻辑逐字节相同、名字不同，
//     019 门禁按名比对所以看不见），是否一并收口属另一张单，未在刀 3 内处理。

/** 文件是否算「图片」：MIME 优先，扩展名兜底（无 MIME 的场景，如拖拽部分来源）。 */
export function isImageFile(file) {
  return String(file?.type || "").startsWith("image/")
    || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(String(file?.name || ""));
}

/** 从 MIME 推导出落盘扩展名（只认 jpg / webp / gif，其余一律 png）。 */
export function imageExtension(type) {
  if (type?.includes("jpeg")) return "jpg";
  if (type?.includes("webp")) return "webp";
  if (type?.includes("gif")) return "gif";
  return "png";
}

/** 从 FileList / 数组里挑出图片文件。 */
export function imageFilesFromList(fileList) {
  return Array.from(fileList || []).filter(isImageFile);
}

/**
 * 从剪贴板数据里取出图片文件。
 *
 * 优先用 `clipboardData.files`（浏览器已直接给出 File 的情况）；
 * 否则退到 `items` 逐个 getAsFile()。两个补齐点（相对旧版简化实现）：
 *   - getAsFile() 返回 null 的项**直接丢弃**，而不是补一个 0 字节的空 File
 *     （旧版会补空文件，下游解码必失败）；
 *   - 无名字的 File 补一个 `clipboard-<时间戳>-<序号>.<扩展名>`，并补 lastModified。
 */
export function imageFilesFromClipboard(clipboardData) {
  const directFiles = imageFilesFromList(clipboardData?.files);
  if (directFiles.length > 0) return directFiles;

  return Array.from(clipboardData?.items || [])
    .filter((item) => item.kind === "file" && item.type?.startsWith("image/"))
    .map((item, index) => {
      const file = item.getAsFile();
      if (!file) return null;
      if (file.name) return file;
      return new File([file], `clipboard-${Date.now()}-${index + 1}.${imageExtension(file.type)}`, {
        type: file.type || "image/png",
        lastModified: Date.now()
      });
    })
    .filter(Boolean);
}

/**
 * File/Blob → 可绘制位图。
 *
 * 优先 `createImageBitmap`（快、且带 imageOrientation 修正）；
 * 浏览器位图解码器不认的格式（部分动图 / 特殊色彩配置）退到 HTMLImageElement。
 * ⇒ **返回类型可能是 ImageBitmap 也可能是 HTMLImageElement**：
 *   两者都能进 ctx.drawImage，但只有 ImageBitmap 有 close()——调用方用 `?.close()`。
 */
export async function imageBitmapFromFile(file) {
  if (window.createImageBitmap) {
    try {
      return await window.createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}

/** Blob → 可绘制位图（与 imageBitmapFromFile 同策略，但不带 imageOrientation）。 */
export async function imageBitmapFromBlob(blob) {
  if (window.createImageBitmap) {
    try {
      return await window.createImageBitmap(blob);
    } catch {
      // Fall back to HTMLImageElement below.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}
