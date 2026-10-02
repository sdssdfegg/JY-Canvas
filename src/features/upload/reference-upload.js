// 参考图上传域工厂 —— 全部函数体从 src/main.jsx 逐字抽出，未改一行逻辑。
// 形态同 RF-066~069：普通工厂（不 import React、无 useState/useCallback/useMemo）。
// deps 解构保持同名 ⇒ main.jsx 调用点零改动；函数体内部互相调用直接引用闭包局部函数 ⇒ 不改签名。
import { fileBaseName } from "../../shared/file-name.js";
import { imageExtension, imageFilesFromList } from "../../shared/image-input.js";
import { imageFileFromUrl } from "../../shared/result-image.js";

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
    const picked = imageFilesFromList(fileList);
    if (picked.length === 0) return;
    const used = referenceProductFiles.length + referenceStyleFiles.length;
    const remaining = MAX_REFERENCE_REWRITE_FILES - used;
    if (remaining <= 0) {
      addEvent("参考生图", `产品图和参考图合计最多 ${MAX_REFERENCE_REWRITE_FILES} 张`);
      return;
    }
    const accepted = picked.slice(0, remaining);
    if (role === "product") {
      setReferenceProductFiles((current) => [...current, ...accepted]);
    } else {
      setReferenceStyleFiles((current) => [...current, ...accepted]);
    }
    addEvent("参考生图", `已添加 ${accepted.length} 张${role === "product" ? "产品图" : "参考图"}`);
  }

  function removeReferenceRewriteFile(role, index) {
    if (role === "product") {
      setReferenceProductFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    } else {
      setReferenceStyleFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    }
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
