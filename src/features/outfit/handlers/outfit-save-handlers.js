// src/features/outfit/handlers/outfit-save-handlers.js
// P6-2 (V4.0) 2026-10-15：从 src/outfit-workflow.jsx 抽出的「保存 / 导出 / 自动保存 / 下载」handler 钩。
// 内容：saveProcessedImageToFolder / saveExportedImageToFolder / splitWhiteRefineResult /
//   saveTaskImageToDirectory / saveTaskImageToDirectoryViaBlob / markTaskSaved / autoSaveTask /
//   downloadTask / copyText，以及两个仅被本组使用的私有 helper：taskToDownloadItem / flashDownloadFeedback。
// 模式：沿用 P6-1 outfit-ref-handlers.js 的 deps 注入薄壳（features/outfit/use-outfit-pages.js 同款）——
//   每次 render 由调用方重建 ctx 对象传入，钩内不记忆化，handler 每次 render 重建，与搬出前（组件内函数声明）行为完全一致。
// ⚠️ ctx 漏项 = 运行期 undefined（vite build 验不出），由 P6-2 §4 负向对照兜底（scripts/dev/p6-2-handlercheck.mjs）。
import { imageSource, taskDragDownloadName } from "../outfit-task.js";
import { fileFromBlob } from "../outfit-image-pipeline.js";
import { splitHalvesFileName, splitImageIntoHalves } from "../../../shared/image-split.js";
import { fetchImageBlob } from "../../../api/assets.js";
import { saveImageRequest, saveProcessedImageRequest } from "../../../api/save.js";
import { copyTextToClipboard } from "../../../shared/dom-actions.js";
import { RESIZE_OUTPUT_FOLDER } from "../outfit-panels.jsx";

export function useOutfitSaveHandlers(ctx) {
  const {
    saveDirectory,
    settings,
    setSaveDirectory,
    setDirectoryDraft,
    setSplitNote,
    setTasks,
    setDownloadFeedbackIds,
    refreshSaveDirectory,
    addEvent
  } = ctx;

  async function saveProcessedImageToFolder(file, subfolder = "", directoryOverride = "") {
    const directory = directoryOverride || saveDirectory || await refreshSaveDirectory();
    if (!directory) throw new Error("未找到指定文件夹");
    const form = new FormData();
    form.append("directory", directory);
    form.append("subfolder", String(subfolder ?? ""));
    form.append("image", file, file.name || "processed.jpg");
    // P7-6：请求本身收口到 src/api/save.js（URL/method/body 逐字一致）。
    const response = await saveProcessedImageRequest(form);
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || "保存整理后图片失败");
    }
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    return payload;
  }

  async function saveExportedImageToFolder(file, subfolder = RESIZE_OUTPUT_FOLDER) {
    return saveProcessedImageToFolder(file, subfolder);
  }

  function taskToDownloadItem(task, imageOverride = null) {
    return {
      id: task.id,
      image: imageOverride || task.result,
      prompt: task.prompt || "",
      modelLabel: task.modelLabel || settings.model,
      imageSize: task.imageSize || settings.imageSize,
      aspectRatio: task.aspectRatio || settings.aspectRatio,
      createdAt: task.finishedAt || task.createdAt || Date.now()
    };
  }

  // 精修页结果图中线剪裁：只在这一页、且开关打开时生效，其它页面/其它 workflow 完全不受影响。
  // 与 3.0 的口径一致 —— 竖切中线、左右各存一张；只是 3.0 在服务端用 Pillow 切，
  // V11 服务端不做图像处理，所以这里用 canvas 切好再走既有的 /api/save-processed-image。
  async function splitWhiteRefineResult(task, image) {
    const source = image?.cachedFile instanceof File ? image.cachedFile : imageSource(image);
    if (!source) {
      setSplitNote("裁切失败：结果图地址不可用");
      return;
    }
    setSplitNote("正在从中线裁切…");
    try {
      const { halves, middle } = await splitImageIntoHalves(source);
      const sourceName = task?.savedFilename || task?.result?.archiveFile || "";
      const saved = [];
      for (const half of halves) {
        const file = new File([half.blob], splitHalvesFileName(half.label, sourceName), { type: "image/png" });
        // 直接放保存目录根（和 3.0 一样），不塞子目录。
        const payload = await saveProcessedImageToFolder(file, "");
        saved.push({ label: half.label, filename: payload?.filename || "", path: payload?.path || "" });
      }
      const names = saved.map((item) => `${item.label} ${item.filename}`).join("　");
      setSplitNote(`已裁切保存到：${saved[0]?.path ? saved[0].path.replace(/[\\/][^\\/]*$/, "") : ""}　${names}`);
      addEvent("精修裁切", `已从中线（第 ${middle}px）切成左右两张：${names}`);
    } catch (error) {
      setSplitNote(`裁切失败：${error instanceof Error ? error.message : String(error)}`);
      addEvent("精修裁切失败", error instanceof Error ? error.message : String(error));
    }
  }

  async function saveTaskImageToDirectory(task, imageOverride = null) {
    const image = imageOverride || task?.result;
    if (!task || !image) return null;
    const directory = saveDirectory || await refreshSaveDirectory();
    if (image.cachedFile instanceof File) {
      const payload = await saveProcessedImageToFolder(image.cachedFile, "", directory);
      return payload;
    }
    // P7-6：请求本身收口到 src/api/save.js（URL/method/headers/body 逐字一致）。
    const response = await saveImageRequest(directory, taskToDownloadItem(task, image));
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || "保存图片失败");
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    return payload;
  }

  async function saveTaskImageToDirectoryViaBlob(task, imageOverride = null) {
    const image = imageOverride || task?.result;
    const src = imageSource(image);
    if (!task || !src) throw new Error("图片地址无效");
    const directory = saveDirectory || await refreshSaveDirectory();
    const blob = await fetchImageBlob(src, "图片下载失败");
    const file = fileFromBlob(blob, taskDragDownloadName(task), image?.mimeType || image?.archiveMime || "image/png");
    return saveProcessedImageToFolder(file, "", directory);
  }

  function markTaskSaved(taskId, payload, options = {}) {
    setTasks((current) => current.map((item) => item.id === taskId ? {
      ...item,
      savedFilename: payload?.filename || item.savedFilename || "",
      savedPath: payload?.path || item.savedPath || "",
      autoSaveFailed: false
    } : item));
    if (options.flash !== false) flashDownloadFeedback(taskId);
  }

  function flashDownloadFeedback(id) {
    if (!id) return;
    setDownloadFeedbackIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setDownloadFeedbackIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 1100);
  }

  // 返回保存结果（payload 或 null）：调用方在"组件已卸载"时需要拿到 savedPath
  // 一起补登记进页面草稿，所以这里把结果返回出去（原来的 `void autoSaveTask(...)` 用法不受影响）。
  async function autoSaveTask(task, image) {
    try {
      const payload = await saveTaskImageToDirectory(task, image);
      markTaskSaved(task.id, payload, { flash: true });
      return payload;
    } catch (error) {
      try {
        const payload = await saveTaskImageToDirectoryViaBlob(task, image);
        markTaskSaved(task.id, payload, { flash: true });
        addEvent("自动保存兜底", "已通过本地代理重新保存结果图");
        return payload;
      } catch (fallbackError) {
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, autoSaveFailed: true } : item));
        addEvent("自动保存失败", fallbackError instanceof Error ? fallbackError.message : (error instanceof Error ? error.message : String(error)));
        return null;
      }
    }
  }

  async function downloadTask(task) {
    if (!task?.result) return;
    try {
      const payload = await saveTaskImageToDirectory(task);
      markTaskSaved(task.id, payload, { flash: true });
      addEvent("下载", `已保存为 ${payload.filename}`);
    } catch (error) {
      try {
        const payload = await saveTaskImageToDirectoryViaBlob(task);
        markTaskSaved(task.id, payload, { flash: true });
        addEvent("下载兜底", `已保存为 ${payload.filename}`);
      } catch (fallbackError) {
        addEvent("下载失败", fallbackError instanceof Error ? fallbackError.message : (error instanceof Error ? error.message : String(error)));
      }
    }
  }

  // 实现在 src/shared/dom-actions.js（两侧同一份，20 行逐字节一致）。
  // 这里只保留闭包绑定壳：捕获本组件的 addEvent，14 处调用点因此无需改动。
  const copyText = (text, successMessage = "已复制") =>
    copyTextToClipboard(text, { successMessage, notify: addEvent });

  return {
    saveExportedImageToFolder,
    splitWhiteRefineResult,
    autoSaveTask,
    downloadTask,
    copyText
  };
}
