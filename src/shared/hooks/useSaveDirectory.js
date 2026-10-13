// 收口 main.jsx 与 outfit-workflow.jsx 中"保存目录域"的 4 个薄壳函数。
//
// 两侧原本各自用一套 byte-identical 的：
//   refreshSaveDirectory / openDirectoryModal / confirmSaveDirectory / pickSaveDirectory
// 它们只把本组件「每渲染重建」的 saveDirectoryDeps 透传给
// src/features/savedir/save-directory.js 的同名实现，自身无逻辑差异。
//
// 抽成共享 hook 后，函数体与改造前逐字节一致，运行时行为 0 变化；
// 调用方继续持有同名引用（refreshSaveDirectory 等），无需改动任何调用点。
import {
  loadSaveDirectory,
  openSaveDirectoryModal,
  commitSaveDirectory,
  chooseSaveDirectory
} from "../../features/savedir/save-directory.js";

export function useSaveDirectory(saveDirectoryDeps) {
  async function refreshSaveDirectory() { return loadSaveDirectory(saveDirectoryDeps); }
  function openDirectoryModal() { openSaveDirectoryModal(saveDirectoryDeps); }
  async function confirmSaveDirectory() { return commitSaveDirectory(saveDirectoryDeps); }
  async function pickSaveDirectory() { return chooseSaveDirectory(saveDirectoryDeps); }
  return { refreshSaveDirectory, openDirectoryModal, confirmSaveDirectory, pickSaveDirectory };
}
