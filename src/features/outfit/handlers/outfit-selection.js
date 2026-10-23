// 模式：沿用 P6-1/P6-2 的 deps 注入薄壳（V133 第二刀：任务选择删除域）。
// 域内自含：selectedTaskIds 状态 + 4 个 handler；外部依赖只注入：
//   tasksRef / setTasks / setBrokenTaskImages / setPreview / preview / addEvent。
// 行为契约（逐字迁移自 outfit-workflow.jsx，V133 验收基准）：
//   - deleteSelected：批量删除走 setTasks 回调解锁 revoke（removed 先摘出来再 revoke），删后清空选中；
//   - deleteResultTask：单删同步四份状态（tasks/selectedTaskIds/brokenTaskImages/preview），
//     preview 正看被删任务时关闭预览；删除事件走 addEvent（用户可见出口 .composerStatus）。
import { useState } from "react";
import { revokeTaskResultRuntimeCaches } from "../outfit-task.js";

export function useOutfitSelectionHandlers(ctx) {
  const { tasksRef, setTasks, setBrokenTaskImages, setPreview, preview, addEvent } = ctx;
  const [selectedTaskIds, setSelectedTaskIds] = useState(() => new Set());

  function toggleTaskSelected(id) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedTaskIds(new Set());
  }

  function deleteSelected() {
    if (selectedTaskIds.size === 0) return;
    const ids = new Set(selectedTaskIds);
    setTasks((current) => {
      const removed = current.filter((task) => ids.has(task.id));
      revokeTaskResultRuntimeCaches(removed);
      return current.filter((task) => !ids.has(task.id));
    });
    clearSelection();
    addEvent("删除", `已删除 ${selectedTaskIds.size} 个队列项`);
  }

  function deleteResultTask(taskId) {
    const target = tasksRef.current.find((task) => task.id === taskId);
    if (!target) return;
    revokeTaskResultRuntimeCaches([target]);
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setSelectedTaskIds((current) => {
      if (!current.has(taskId)) return current;
      const next = new Set(current);
      next.delete(taskId);
      return next;
    });
    setBrokenTaskImages((current) => {
      if (!current[taskId]) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
    if (preview?.id === taskId) setPreview(null);
    addEvent("删除", `已删除 #${target.order || ""} 结果图`);
  }

  return {
    selectedTaskIds,
    setSelectedTaskIds,
    toggleTaskSelected,
    clearSelection,
    deleteSelected,
    deleteResultTask
  };
}
