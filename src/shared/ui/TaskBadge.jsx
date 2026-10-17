// src/shared/ui/TaskBadge.jsx
// V90 (2026-10-18)：任务状态徽章共享组件。
// 收敛 7 处内联 `<span className={`taskBadge task-${…}`}>`（main-top-bar×5 / outfit-panels / OutfitWorkbench）。
// 样式唯一来源 = 全局 `.taskBadge` 基色 + `.task-*` 状态色（src/styles.css），换装覆盖已在本单收口归顺。
// 刻意不开 size/tone prop（同 UploadClearButton 规矩，统一视觉防分叉）；className 与 ...rest 透传（V73 教训）。
// 文案由调用方以 children 传入，组件内不做任何状态→文案映射（映射收进组件会变成新的分叉点）。
export function TaskBadge({ status = "idle", className = "", ...rest }) {
  return (
    <span
      className={`taskBadge task-${status}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}
