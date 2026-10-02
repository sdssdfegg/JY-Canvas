/**
 * 保存目录域 —— 设置弹窗里「保存目录」那一行的四个操作。
 *
 * 2026-10-03 收口（V11-RF-061 线 B 试点域）：`main.jsx` 与 `outfit-workflow.jsx` 各一份，
 * 剥离缩进后逐行比对：
 *   · `openDirectoryModal`  4 行 —— **逐字节一致**
 *   · `refreshSaveDirectory` 12 / `confirmSaveDirectory` 12 / `pickSaveDirectory` 16 行
 *     —— **语义等价**，差异只是 `err`/`error` 参数命名与「先提变量再 addEvent」vs「内联」的写法，
 *        求值结果与调用次数完全相同。
 *
 * ⚠️ 全部依赖走**入参注入**，本模块不 import 任何 api / React：
 *    ① 两侧的上游 API 与 setter 来自各自的闭包，注入才能两侧共用一份实现；
 *    ② 保持零副作用、零 React 依赖，与 `src/features/auth/api-key.js` 同款纪律。
 *
 * 🔴 命名刻意与调用点的原名不同（`loadSaveDirectory` / `openSaveDirectoryModal` /
 *    `commitSaveDirectory` / `chooseSaveDirectory`），这样两侧可以保留**原名薄壳**，
 *    35+ 处调用点一字不改 —— 这是本单零风险的关键。
 */

/**
 * 拉取服务端已保存的目录，回填 state 并返回目录值（失败返回空串）。
 * @returns {Promise<string>} 目录路径；失败时 ""
 */
export async function loadSaveDirectory({ getSaveDirectory, setSaveDirectory, setDirectoryDraft, notify }) {
  try {
    const payload = await getSaveDirectory();
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    return payload.directory;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notify("保存目录", message);
    return "";
  }
}

/** 打开目录设置弹窗：把当前生效目录灌进草稿，再开弹窗。 */
export function openSaveDirectoryModal({ saveDirectory, setDirectoryDraft, setIsDirectoryModalOpen }) {
  setDirectoryDraft(saveDirectory);
  setIsDirectoryModalOpen(true);
}

/** 弹窗「确定」：把草稿提交到服务端，成功后关闭弹窗。 */
export async function commitSaveDirectory({
  directoryDraft,
  setSaveDirectoryRequest,
  setSaveDirectory,
  setDirectoryDraft,
  setIsDirectoryModalOpen,
  notify
}) {
  try {
    const payload = await setSaveDirectoryRequest(directoryDraft);
    setSaveDirectory(payload.directory);
    setDirectoryDraft(payload.directory);
    setIsDirectoryModalOpen(false);
    notify("保存目录", "目录已更新");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notify("保存目录失败", message);
  }
}

/**
 * 弹窗「选择…」：唤起系统目录选择器。
 * ⚠️ `isPickingDirectory` 守卫必须注入 —— 重复点击会在上一个选择未返回时再开一次选择器。
 */
export async function chooseSaveDirectory({
  directoryDraft,
  saveDirectory,
  isPickingDirectory,
  pickSaveDirectoryRequest,
  setDirectoryDraft,
  setIsPickingDirectory,
  notify
}) {
  if (isPickingDirectory) return;
  setIsPickingDirectory(true);
  try {
    const payload = await pickSaveDirectoryRequest(directoryDraft || saveDirectory);
    if (!payload.cancelled && payload.directory) {
      setDirectoryDraft(payload.directory);
      notify("保存目录", "已选择目录，点击确定后生效");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notify("目录选择失败", message);
  } finally {
    setIsPickingDirectory(false);
  }
}
