// src/shared/failure-report.js
// 2026-10-30：失败信息「点一下就复制全部排查信息」的拼装函数。
// 零依赖叶子（不 import 任何项目模块），供换装工作流与快捷生成两处共用，避免各写一份。
// 顺序对齐用户贴出的排查信息：
//   提示词 / 模型 / 比例 / 尺寸 / 张数 / 质量 / 版本 / 背景 / 状态 / 错误 / 详情 / 渠道 / 任务ID。
// 取值口径：task（任务快照）优先、settings（当前设置）兜底 —— 任务快照可能没记全字段。
export function buildFailureReport(task = {}, settings = {}, extra = {}) {
  const pick = (a, b) => (a ?? b ?? "");
  const lines = [
    pick(task.prompt, settings.prompt),
    pick(task.modelLabel, settings.model),
    pick(task.aspectRatio, settings.aspectRatio),
    pick(task.imageSize, settings.imageSize),
    `${pick(task.n, settings.n) || 1}张`,
    pick(task.quality, settings.quality),
    pick(task.version, settings.version),
    pick(task.background, settings.background),
    "失败",
    pick(task.error, extra.error)
  ];
  if (task.errorDetail) lines.push(`详情：${task.errorDetail}`);
  lines.push(`渠道：${pick(task.channelId, settings.channelId)}`);
  if (task.id) lines.push(`任务ID：${task.id}`);
  return lines.filter((line) => String(line).trim() !== "").join("\n");
}
