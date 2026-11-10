// 详情创作「批量生成」任务存储薄适配层（V203 阶段 4）。
//
// 仅做一件事：把通用核心 server/core/task-store-core.js 绑定到详情创作的独立数据区
// （data/detail-studio/generation/tasks/），并透出与旧换装 task-store.js 同构的 API。
// 旧换装 task-store.js 属八文件禁改清单（只读参照、本体不改行为），本文件不依赖它、
// 不共用其索引文件，纯走通用核心 —— 实现「通用叶子 + 两个薄适配层」中的详情适配层。
//
// 依赖方向：本文件 → server/core/task-store-core.js（零依赖叶子）→ 仅 node 内置 + 注入目录；
//   不 import 任何特性模块 / 浏览器模块，避免污染 public 启动链路（TDZ 红线）。

import { createTaskStore } from "../../../core/task-store-core.js";
import { detailStudioGenerationTasksDir } from "../../../core/app-paths.js";

export const generationTaskStore = createTaskStore({ tasksDir: detailStudioGenerationTasksDir });

export const {
  readTask,
  writeTask,
  appendAttempt,
  updateStatus,
  listTasks,
  rebuildIndexForStore
} = generationTaskStore;

export { detailStudioGenerationTasksDir };
