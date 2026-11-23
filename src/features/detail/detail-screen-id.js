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

// 目标屏是否仍存在：异步结果回写前判定，已删屏的结果必须丢弃。
export function detailScreenExists(groups = [], groupId, screen) {
  const group = (Array.isArray(groups) ? groups : []).find((item) => item?.id === groupId);
  return Boolean(group && (group.prompts || []).some((prompt) => prompt?.screen === screen));
}

// 删除后立即裁剪快照并退役 ID：供删除回调同步更新 ref，不等 useEffect（异步）导致旧结果误写回。
export function pruneDeletedScreen(groups = [], groupId, screen) {
  retireDetailScreenId(screen);
  return (Array.isArray(groups) ? groups : []).map((group) => (
    group.id === groupId
      ? { ...group, prompts: (group.prompts || []).filter((prompt) => prompt.screen !== screen) }
      : group
  ));
}
