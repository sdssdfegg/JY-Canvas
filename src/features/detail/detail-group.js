// 详情页分组 / 拼图域工厂 —— 全部函数体从 src/main.jsx 逐字抽出，未改一行逻辑。
// 形态同 RF-066~070：普通工厂（不 import React、无 useState/useCallback/useMemo）。
// deps 解构保持同名 ⇒ main.jsx 调用点零改动；函数体内部互相调用直接引用闭包局部函数 ⇒ 不改签名。
// bitmapFromBlob / orderedPromptsForGroup 只在工厂内部被调用，故不进返回值。
import { canvasToBlob } from "../../shared/canvas-blob.js";

export function createDetailGroup(deps) {
  const {
    blobFromImageItem,
    detailForwardSort,
    setDetailInfoSelection,
    detailDragScreen,
    setDetailDragScreen,
    setDetailGroups,
    setStitchPreview,
    setStitchZoom,
    setStitchPan,
    stitchPan,
    setStitchContextMenu,
    stitchDragRef,
    detailSettings,
    setDetailSettings,
    setDetailPresets,
    setIsDetailPresetOpen,
    addEvent,
    makeResultId,
    normalizeDetailSettings
  } = deps;

  async function bitmapFromBlob(blob) {
    if (window.createImageBitmap) {
      return window.createImageBitmap(blob);
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("长图素材读取失败"));
      };
      img.src = url;
    });
  }

  async function stitchDetailGroupBlob(group) {
    const items = detailResultItemsForGroup(group);
    if (items.length === 0) throw new Error("暂无可拼接的分屏图片");
    const bitmaps = [];
    try {
      for (const { result } of items) {
        const blob = await blobFromImageItem(result);
        bitmaps.push(await bitmapFromBlob(blob));
      }
      const maxSourceWidth = Math.max(...bitmaps.map((bitmap) => bitmap.width || bitmap.naturalWidth || 1));
      const sourceHeights = bitmaps.map((bitmap) => bitmap.height || bitmap.naturalHeight || 1);
      let targetWidth = Math.min(1600, maxSourceWidth);
      let targetHeights = bitmaps.map((bitmap, index) => {
        const width = bitmap.width || bitmap.naturalWidth || targetWidth;
        return Math.max(1, Math.round(sourceHeights[index] * (targetWidth / width)));
      });
      let totalHeight = targetHeights.reduce((sum, height) => sum + height, 0);
      if (totalHeight > 30000) {
        targetWidth = Math.max(720, Math.round(targetWidth * (30000 / totalHeight)));
        targetHeights = bitmaps.map((bitmap, index) => {
          const width = bitmap.width || bitmap.naturalWidth || targetWidth;
          return Math.max(1, Math.round(sourceHeights[index] * (targetWidth / width)));
        });
        totalHeight = targetHeights.reduce((sum, height) => sum + height, 0);
      }
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = totalHeight;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("长图画布创建失败");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      let y = 0;
      bitmaps.forEach((bitmap, index) => {
        ctx.drawImage(bitmap, 0, y, targetWidth, targetHeights[index]);
        y += targetHeights[index];
      });
      return await canvasToBlob(canvas, "image/jpeg", 0.92);
    } finally {
      bitmaps.forEach((bitmap) => bitmap.close?.());
    }
  }

  function orderedPromptsForGroup(group) {
    if (!group?.prompts) return [];
    return detailForwardSort ? group.prompts : [...group.prompts].reverse();
  }

  function detailResultItemsForGroup(group) {
    return orderedPromptsForGroup(group).flatMap((prompt) => (
      (prompt.results || []).map((result) => ({ group, prompt, result }))
    ));
  }

  function selectDetailResult(group, prompt, result) {
    setDetailInfoSelection({ groupId: group.id, promptScreen: prompt.screen, resultId: result.id });
  }

  function beginDetailScreenDrag(event, groupId, screen) {
    setDetailDragScreen({ groupId, screen });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", JSON.stringify({ groupId, screen }));
  }

  function endDetailScreenDrag() {
    setDetailDragScreen(null);
  }

  function dropDetailScreen(event, groupId, targetScreen) {
    event.preventDefault();
    const source = detailDragScreen || (() => {
      try {
        return JSON.parse(event.dataTransfer.getData("text/plain") || "null");
      } catch {
        return null;
      }
    })();
    if (!source || source.groupId !== groupId || source.screen === targetScreen) {
      setDetailDragScreen(null);
      return;
    }

    setDetailGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      const displayOrder = detailForwardSort ? [...group.prompts] : [...group.prompts].reverse();
      const fromIndex = displayOrder.findIndex((prompt) => prompt.screen === source.screen);
      const toIndex = displayOrder.findIndex((prompt) => prompt.screen === targetScreen);
      if (fromIndex < 0 || toIndex < 0) return group;
      const [moved] = displayOrder.splice(fromIndex, 1);
      displayOrder.splice(toIndex, 0, moved);
      return {
        ...group,
        prompts: detailForwardSort ? displayOrder : [...displayOrder].reverse()
      };
    }));
    setDetailDragScreen(null);
    addEvent("一键详情", "分屏顺序已更新");
  }

  function openStitchPreview(group) {
    const items = detailResultItemsForGroup(group);
    if (items.length === 0) {
      addEvent("拼图预览", "请先生成至少一张分屏图片");
      return;
    }
    setStitchPreview({ groupId: group.id });
    setStitchZoom(1);
    setStitchPan({ x: 0, y: 0 });
  }

  function closeStitchPreview() {
    setStitchPreview(null);
    setStitchContextMenu(null);
    setStitchZoom(1);
    setStitchPan({ x: 0, y: 0 });
    stitchDragRef.current = null;
  }

  function handleStitchWheel(event) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setStitchZoom((current) => {
      const next = current + direction * 0.1;
      return Math.max(0.25, Math.min(4, Number(next.toFixed(2))));
    });
  }

  function beginStitchDrag(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    stitchDragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startPan: stitchPan
    };
  }

  function moveStitchDrag(event) {
    const drag = stitchDragRef.current;
    if (!drag?.active) return;
    setStitchPan({
      x: drag.startPan.x + event.clientX - drag.startX,
      y: drag.startPan.y + event.clientY - drag.startY
    });
  }

  function endStitchDrag(event) {
    const drag = stitchDragRef.current;
    if (!drag?.active) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    stitchDragRef.current = null;
  }

  function updateDetailPrompt(groupId, screen, patch) {
    setDetailGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        prompts: group.prompts.map((prompt) => (
          prompt.screen === screen ? { ...prompt, ...patch } : prompt
        ))
      };
    }));
  }

  function toggleDetailPrompt(groupId, screen) {
    setDetailGroups((current) => current.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        prompts: group.prompts.map((prompt) => (
          prompt.screen === screen ? { ...prompt, enabled: !prompt.enabled } : prompt
        ))
      };
    }));
  }

  function saveDetailPreset() {
    const name = detailSettings.productName.trim()
      || detailSettings.userInstruction.trim().slice(0, 18)
      || new Date().toLocaleString("zh-CN", { hour12: false });
    const preset = {
      id: makeResultId(),
      name,
      createdAt: Date.now(),
      settings: { ...detailSettings }
    };
    setDetailPresets((current) => [preset, ...current.filter((item) => item.name !== name)].slice(0, 30));
    addEvent("一键详情", `已保存预设「${name}」`);
  }

  function loadDetailPreset(preset) {
    setDetailSettings(normalizeDetailSettings(preset.settings));
    setIsDetailPresetOpen(false);
    addEvent("一键详情", `已加载预设「${preset.name}」`);
  }

  function deleteDetailPreset(id) {
    setDetailPresets((current) => current.filter((preset) => preset.id !== id));
    addEvent("一键详情", "已删除预设");
  }

  return {
    stitchDetailGroupBlob,
    detailResultItemsForGroup,
    selectDetailResult,
    beginDetailScreenDrag,
    endDetailScreenDrag,
    dropDetailScreen,
    openStitchPreview,
    closeStitchPreview,
    handleStitchWheel,
    beginStitchDrag,
    moveStitchDrag,
    endStitchDrag,
    updateDetailPrompt,
    toggleDetailPrompt,
    saveDetailPreset,
    loadDetailPreset,
    deleteDetailPreset
  };
}
