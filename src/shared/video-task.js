// 视频任务状态的**唯一判定口径**。
//
// 为什么要有这个文件（前端专项阶段 B · 刀 4）：
//   `videoResultUrl` / `isVideoTaskCompleted` / `isVideoTaskFailed` / `videoTaskStatusText`
//   此前在 src/main.jsx 与 src/outfit-workflow.jsx 各有一份，**逐字节完全一致**
//   （比对：两侧同名的这四个函数 —— 两份实现逐字节一致、diff 无差异；
//     ⚠️ 跨文件引用只写函数名、不写行号：行号随任意一侧的编辑就会漂移，后人按图索骥只会被引到错处，刻意不补。）
//   主画板与批量页一旦对「什么样的任务算完成 / 算失败」判定不一致，
//   同一个任务在一处显示"已完成"、在另一处还在转圈 —— 这正是阶段 B 要拆的病根。
//
// 纪律：
//   - 纯函数、无 React、无副作用，只吃一个 task 对象；
//   - 判定口径**只此一份**，改这里等于同时改两处（这正是收口的目的）；
//   - ⚠️ 本次是**纯搬运**：两版字节一致 ⇒ 行为零变化，未改任何判定逻辑/正则/文案。
//
// 未纳入本刀的相邻族（**改名克隆**，019 按名比对看不见，属 RF-032 的只读测量范围）：
//   - `durationOptionsForVideoModel`（video-composer.js，唯一真身）↔ `videoDurationOptions`（outfit-panels.jsx 的别名导入）：
//     已在 V11-RF-018 收口——outfit-panels 改为 `import { durationOptionsForVideoModel as videoDurationOptions }`，
//     不再有第二份定义；默认值常量 videoDefaults.duration ≡ QUICK_VIDEO_DEFAULTS.duration 同为 5，等价。
//   - `videoPromptPlaceholder`（video-composer.js）↔ `quickVideoPromptPlaceholder`（outfit-panels.jsx）：
//     名字与占位文案都不同（已分叉，不是克隆搬运）——**保留不合并**：兜底文案字面量不同
//     （"输入视频画面、运动、镜头、服装和氛围要求" vs "输入视频画面、镜头运动、人物动作、服装展示和氛围要求"）。
//   - `videoPricePerSecond`/`videoPriceLabel`（video-composer.js）↔ `quickVideoPricePerSecond`/`quickVideoPriceLabel`
//     （outfit-panels.jsx 的别名导入）：本单（建议2）收口，字节一致，改为别名导入，无第二份定义。

/** 任务对象 → 结果视频 URL（兼容多种渠道字段名）。 */
export function videoResultUrl(task = {}) {
  return String(task.url || task.videoUrl || task.outputUrl || task.output_url || "").trim();
}

/** 是否已完成：有结果 URL 即算完成，否则按状态词判定。 */
export function isVideoTaskCompleted(task = {}) {
  const status = String(task.status || "").toLowerCase();
  return Boolean(videoResultUrl(task)) || /complete|completed|success|succeeded|finished|done/.test(status);
}

/** 是否失败：状态词命中失败族，或任务对象上挂了 error。 */
export function isVideoTaskFailed(task = {}) {
  const status = String(task.status || "").toLowerCase();
  return /fail|failed|error|cancel|cancelled|canceled/.test(status) || Boolean(task.error);
}

/** 给用户看的状态文案（完成 / 失败 / 生成中 xx% / 排队中 / 生成中 / 原始状态）。 */
export function videoTaskStatusText(task = {}) {
  if (isVideoTaskCompleted(task)) return "已完成";
  if (isVideoTaskFailed(task)) return "失败";
  const progress = Number(task.progress);
  if (Number.isFinite(progress) && progress > 0) return `生成中 ${Math.round(progress)}%`;
  const status = String(task.status || "").trim();
  if (/queue|queued|pending/i.test(status)) return "排队中";
  if (/progress|running|processing/i.test(status)) return "生成中";
  return status || "生成中";
}
