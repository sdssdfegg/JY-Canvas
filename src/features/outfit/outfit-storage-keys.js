// outfit-storage-keys.js —— outfit 特性存储键常量（V121-R2：零依赖叶子模块，单一真相源）。
//
// 为什么从 outfit-top.js / outfit-panels.jsx 拆出来（V121-R2 必修）：
//   V121 的 release-seed.js 挂在**启动链路**上（storage-store.js 的
//   publicReleaseStorageResetPromise = reset().then(() => importReleaseSeed())，
//   整个 App 首渲染等它）。它只需要这几个键常量；若从 outfit-top.js / outfit-panels.jsx
//   import，就会把 outfit 特性模块群（outfit-top ↔ outfit-panels 自 V11 起既有的
//   相互循环：outfit-top.js:11 从 outfit-panels 引 DEFAULT_PREPROCESS_MODE 等）
//   拉进主 chunk 的初始化路径。public 发布模式启动即挂载 outfit 视图
//   （DEFAULT_ACTIVE_VIEW = "outfit"），实测触发 **rollup 打包后的模块初始化期 TDZ**：
//     "Cannot access 'x' before initialization" → 整应用白屏（root 渲染 0 字符）。
//   dev 模式（ESM 活绑定容忍循环）与 internal 生产构建（outfit chunk 延迟加载、
//   启动在快捷生成视图）均不复现——所以它躲过了 build EXIT=0 与 Node 单测，
//   只在 public 生产构建首启动死。见 V121 §9 复核记录。
//
// 纪律：
//   · 本模块**零重量依赖**（仅 app-defaults 的 PROMPT_LIBRARY_VERSION 叶子），
//     启动链路模块（release-seed / storage-store）可安全 import；
//   · outfit 特性内部（outfit-top / outfit-image-utils / outfit-page-actions / outfit-workflow /
//     panels/ 各面板）一律从本模块取键（2026-10-24 V5.0-009：原 outfit-panels.jsx 已拆为这两处）；
//   · 键值字符串**只此一处**，改名先 git grep -l 全量引用方（V98 纪律）。
import { PROMPT_LIBRARY_VERSION } from "../../shared/app-defaults.js";

export const STORAGE_KEY = "jingyin-outfit-workflow-settings-v1";
export const OUTFIT_PAGES_KEY = "jingyin-outfit-workflow-pages-v1";
export const OUTFIT_DELETED_WORKFLOW_MODES_KEY = "jingyin-outfit-workflow-deleted-modes-v1";
// V118：版本号定义在 src/shared/app-defaults.js（PROMPT_LIBRARY_VERSION），此处 import 复用。
export const PROMPT_PRESETS_KEY = `jingyin-outfit-workflow-prompt-library-${PROMPT_LIBRARY_VERSION}`;
export const PROMPT_CATEGORIES_KEY = `jingyin-outfit-workflow-prompt-categories-${PROMPT_LIBRARY_VERSION}`;
export const RESIZE_SETTINGS_KEY = "jingyin-outfit-workflow-resize-settings-v4";
export const RESIZE_BATCH_CROP_KEY = "jingyin-outfit-workflow-resize-batch-crop-v1";
