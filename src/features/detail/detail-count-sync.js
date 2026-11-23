// P1 数量双向联动 hook：封装"最后一次操作优先"的统一状态同步。
// 依赖外部传入的同步 ref 与 setState，本模块不持有 React 状态，便于单测与复用。
import { useEffect } from "react";
import { isManualDetailGroup, effectiveDetailPrompts, applyCountToGroup, findEmptyPromptScreens } from "./detail-screen-id.js";

export function useDetailCountSync({ detailGroupsRef, setDetailGroups, setDetailSettings, clampDetailCount, activeDetailGroupId }) {
  // 统一入口：手动组按 target 调整有效分屏并同步 count；AI 组只改设置值。
  // origin="setting" 时按 targetCount 调整 prompts；origin="prompts" 时以当前有效数回写 count。
  function applyCountSync(groupId, targetCount, origin) {
    const target = clampDetailCount(targetCount);
    const snapshot = detailGroupsRef.current;
    const group = snapshot.find((item) => item?.id === groupId);
    if (group && isManualDetailGroup(group)) {
      const nextGroup = origin === "setting" ? applyCountToGroup(group, target) : group;
      const finalCount = origin === "setting" ? target : clampDetailCount(effectiveDetailPrompts(nextGroup).length);
      detailGroupsRef.current = snapshot.map((item) => (item.id === groupId ? nextGroup : item));
      setDetailGroups(detailGroupsRef.current);
      setDetailSettings((current) => {
        if (current.count === finalCount && current.countTouched) return current;
        const next = { ...current, count: finalCount };
        next.countTouched = true; // V2-COUNT-MODE：用户改数量即转 fixed。
        return next;
      });
      return;
    }
    setDetailSettings((current) => {
      if (current.count === target && current.countTouched) return current;
      const next = { ...current, count: target };
      next.countTouched = true;
      return next;
    });
  }

  function syncFromGroup(groupId) {
    const group = detailGroupsRef.current.find((item) => item?.id === groupId);
    if (group && isManualDetailGroup(group)) {
      applyCountSync(groupId, effectiveDetailPrompts(group).length, "prompts");
    }
  }

  // 禁用切换：基于同步 ref 翻转 enabled，再以新有效数对齐 count。
  function toggleAndSync(groupId, screen) {
    detailGroupsRef.current = detailGroupsRef.current.map((group) => {
      if (group.id !== groupId) return group;
      return {
        ...group,
        prompts: (group.prompts || []).map((prompt) => (
          prompt.screen === screen ? { ...prompt, enabled: prompt.enabled === false } : prompt
        ))
      };
    });
    setDetailGroups(detailGroupsRef.current);
    syncFromGroup(groupId);
  }

  // 切组时以该手动组自己的有效数对齐基础数量，不同组不污染。
  useEffect(() => {
    const group = detailGroupsRef.current.find((item) => item?.id === activeDetailGroupId);
    if (group && isManualDetailGroup(group)) {
      const target = clampDetailCount(effectiveDetailPrompts(group).length);
      setDetailSettings((current) => {
        if (current.count === target && current.countTouched) return current;
        const next = { ...current, count: target };
        next.countTouched = true;
        return next;
      });
    }
  }, [activeDetailGroupId, detailGroupsRef, setDetailSettings, clampDetailCount]);

  // 批量前空提示词检查：存在空白则阻止整批并指出屏号，返回是否放行。
  function guardBatchEmpty(group, forwardSort, setError, addEvent) {
    const empty = findEmptyPromptScreens(group, forwardSort);
    if (!empty.length) return true;
    const label = `第${empty.join("、第")}屏`;
    setError(`以下屏提示词为空，请补充或删除后再批量生成：${label}`);
    addEvent("一键详情", `批量生成已阻止：${label}提示词为空`);
    return false;
  }

  return { applyCountSync, syncFromGroup, toggleAndSync, guardBatchEmpty };
}
