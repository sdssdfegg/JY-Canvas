// 分屏稳定 ID 与存在性判定（阶段最终验收）。
// 独立模块：不改变既有 detail-group.js / detail-state.js 的基线计量行数。
// 🔴 内部身份永不复用：持久化单调递增计数器，删除后退役该 ID，绝不按剩余屏 max+1 重算。
import { readJsonStorage, writeJsonStorage } from "../../lib/storage/json-storage.js";

// 固定 key 前缀：本模块为零 Vite 依赖的纯函数，便于 node 单测；与 STORAGE_PREFIX 默认值一致。
const ID_SEQ_KEY = "jingyin-detail-screen-id-seq-v1";

export function nextDetailScreenId(groups = []) {
  let stored = 0;
  try { stored = Number.parseInt(readJsonStorage(ID_SEQ_KEY, 0), 10) || 0; } catch { stored = 0; }
  let maxSeen = 0;
  for (const group of (Array.isArray(groups) ? groups : [])) {
    for (const prompt of (group?.prompts || [])) {
      const n = Number.parseInt(prompt?.screen, 10);
      if (Number.isFinite(n) && n > maxSeen) maxSeen = n;
    }
  }
  const next = Math.max(stored, maxSeen) + 1;
  try { writeJsonStorage(ID_SEQ_KEY, next); } catch { /* 存储不可用时退化为会话内递增 */ }
  return next;
}

// 删除时把计数器抬到已删 ID 之上：即便 seq 此前不存在（历史数据），该 ID 也被永久退役。
export function retireDetailScreenId(screen) {
  const retired = Number.parseInt(screen, 10);
  if (!Number.isFinite(retired)) return;
  let stored = 0;
  try { stored = Number.parseInt(readJsonStorage(ID_SEQ_KEY, 0), 10) || 0; } catch { stored = 0; }
  if (retired > stored) {
    try { writeJsonStorage(ID_SEQ_KEY, retired); } catch { /* 同上 */ }
  }
}

// 组类型：只用 group 级 kind 明确标记，禁止根据某个 prompt 的 source 推断整组类型。
// 历史组无 kind → 保守视为 ai（不把 AI 规划组误判为手动组）。
export const DETAIL_GROUP_KIND = Object.freeze({ MANUAL: "manual", AI: "ai" });
export function isManualDetailGroup(group) {
  return group?.kind === DETAIL_GROUP_KIND.MANUAL;
}

// 有效分屏：与 generateDetailGroup 的 enabledPrompts 同口径（不含 status==="running" 瞬时态）。
// 禁用 / 空屏标记的分屏不计入有效数量，但仍保留在 prompts 中，可恢复。
export function effectiveDetailPrompts(group) {
  return (group?.prompts || []).filter((prompt) => (
    prompt?.enabled !== false && prompt?.shouldGenerate !== false && !prompt?.isEmptyScreen
  ));
}

// 目标屏是否仍存在（活动列表或暂存区）：异步结果回写前的安全定位。
// 进入 parkedPrompts 的屏没有 retire，其稳定 ID 仍有效，结果必须能写回。
export function findDetailScreenLocation(groups = [], groupId, screen) {
  const group = (Array.isArray(groups) ? groups : []).find((item) => item?.id === groupId);
  if (!group) return null;
  const active = (group.prompts || []).find((prompt) => prompt?.screen === screen);
  if (active) return { group, prompt: active, parked: false };
  const parked = (group.parkedPrompts || []).find((prompt) => prompt?.screen === screen);
  if (parked) return { group, prompt: parked, parked: true };
  return null;
}

// 目标屏是否仍存在：兼容旧签名（活动或暂存都算存在）。
export function detailScreenExists(groups = [], groupId, screen) {
  return Boolean(findDetailScreenLocation(groups, groupId, screen));
}

// 写回到活动或暂存中的原稳定 ID：返回新 groups 快照，不 retire、不改变身份。
export function updateDetailScreenById(groups = [], groupId, screen, patch) {
  return (Array.isArray(groups) ? groups : []).map((group) => {
    if (group.id !== groupId) return group;
    const apply = (list) => (list || []).map((prompt) => (prompt?.screen === screen ? { ...prompt, ...patch } : prompt));
    return { ...group, prompts: apply(group.prompts), parkedPrompts: apply(group.parkedPrompts) };
  });
}

// 删除后立即裁剪快照并退役 ID：供删除回调同步更新 ref，不等 useEffect（异步）导致旧结果误写回。
export function pruneDeletedScreen(groups = [], groupId, screen) {
  retireDetailScreenId(screen);
  const without = (list) => (list || []).filter((prompt) => prompt.screen !== screen);
  return (Array.isArray(groups) ? groups : []).map((group) => (
    group.id === groupId
      ? { ...group, prompts: without(group.prompts), parkedPrompts: without(group.parkedPrompts) }
      : group
  ));
}

// P1 数量联动核心：把手动组的有效分屏数调整到 targetCount。
// - 减少：把尾部有效屏原样移入 parkedPrompts（保留 text/results/稳定 screen ID），不删除、不 retire。
// - 增加：优先按原稳定 ID 从 parkedPrompts 放回（内容/结果/状态不变），不足才补真正空白屏。
// - 禁用/空屏标记的分屏留在 prompts 中但不计入有效数，也不被搬运（可随时恢复）。
export function applyCountToGroup(group, targetCount) {
  if (!group) return group;
  const target = Math.max(1, Math.min(12, Number.parseInt(targetCount, 10) || 1));
  const prompts = Array.isArray(group.prompts) ? group.prompts : [];
  const parked = Array.isArray(group.parkedPrompts) ? group.parkedPrompts : [];
  const current = effectiveDetailPrompts(group).length;
  if (current === target) return group;

  if (current > target) {
    const removeIds = new Set(effectiveDetailPrompts(group).slice(target).map((prompt) => prompt.screen));
    const nextPrompts = prompts.filter((prompt) => !removeIds.has(prompt.screen));
    const moved = prompts.filter((prompt) => removeIds.has(prompt.screen));
    return { ...group, prompts: nextPrompts, parkedPrompts: [...parked, ...moved] };
  }

  let nextPrompts = [...prompts];
  let nextParked = [...parked];
  let need = target - current;
  while (need > 0 && nextParked.length > 0) {
    nextPrompts.push(nextParked.shift());
    need -= 1;
  }
  while (need > 0) {
    const all = [...nextPrompts, ...nextParked].map((prompt) => ({ screen: prompt.screen }));
    nextPrompts.push({
      screen: nextDetailScreenId([{ prompts: all }]), title: "手动分屏", summary: "",
      intervention: "用户自建分屏", referenceStrategy: "", text: "", enabled: true,
      status: "idle", results: [], source: "manual", shouldGenerate: true, isEmptyScreen: false
    });
    need -= 1;
  }
  return { ...group, prompts: nextPrompts, parkedPrompts: nextParked };
}

// 批量前空提示词检查：返回按显示顺序的屏号列表（1-based），供界面明确提示并阻止整批生成。
export function findEmptyPromptScreens(group, forwardSort = true) {
  if (!group) return [];
  const displayOrder = forwardSort ? (group.prompts || []) : [...(group.prompts || [])].reverse();
  return effectiveDetailPrompts(group)
    .filter((prompt) => !String(prompt.text || "").trim())
    .map((prompt) => displayOrder.findIndex((item) => item.screen === prompt.screen) + 1);
}
