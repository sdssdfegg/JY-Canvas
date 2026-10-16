// 共享表单项组件（V72 落地，总纲 §5.4）。
//
// API：<Field label hint hintTone="default|danger|success" as="label|div" className>{控件}</Field>
// - label: ReactNode（可含图标），12px muted
// - hint: 可选提示文案，12px faint；danger/success 走语义色
// - as: 外壳元素。默认 "label"（保持点击聚焦行为，原 modalField 语义）；
//       传 "div" 用于"标题+说明+动作"区块（原 div 语义，避免 label 隐式关联误触）
// label 与控件 gap 6px，整项 grid 垂直堆叠。
import "./ui.css";

export function Field({ label, hint, hintTone = "default", as = "label", className = "", children }) {
  const Tag = as === "div" ? "div" : "label";
  const classes = ["ui-field", className].filter(Boolean).join(" ");
  return (
    <Tag className={classes}>
      {label !== undefined && label !== null && <span className="ui-field__label">{label}</span>}
      {children}
      {hint ? <small className={`ui-field__hint ui-field__hint--${hintTone}`}>{hint}</small> : null}
    </Tag>
  );
}
