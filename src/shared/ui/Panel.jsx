// 版块外壳组件（V73 落地，总纲 §5.1）。
//
// API：<Panel padding="md|lg" tone="default|strong" className>{子节点}</Panel>
// - padding: md=16px（--space-4）/ lg=24px（--space-6）
// - tone: default 面板底（--panel）/ strong 更重底色（--panel-strong）
// - 外壳：1px 边框 + radius-lg 圆角 + 卡片底；子节点 grid 堆叠，gap=--space-4
//   替代 .skinBlock / .debugBlock 一类手写卡片容器。
import "./ui.css";

export function Panel({ padding = "md", tone = "default", className = "", children }) {
  const classes = [
    "ui-panel",
    `ui-panel--${tone}`,
    `ui-panel--pad-${padding}`,
    className
  ].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
