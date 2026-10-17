// 分区标题组件（V73 落地，总纲 §5.1）。
//
// API：<ModuleHeader icon title subtitle action divider={true}>{…}</ModuleHeader>
// - icon: 可选 lucide 元素（左侧）
// - title: 标题（14px / 500）；subtitle: 可选副标题（12px muted）
// - action: 可选右侧操作节点（右对齐）
// - divider: 默认 true，底部 1px 分隔线
//   替代手写 `<span><Icon/> 标题</span>`。
import "./ui.css";

export function ModuleHeader({ icon, title, subtitle, action, divider = true, className = "", ...rest }) {
  const classes = [
    "ui-module-header",
    divider && "ui-module-header--divider",
    className
  ].filter(Boolean).join(" ");
  return (
    <div className={classes} {...rest}>
      {icon && <span className="ui-module-header__icon">{icon}</span>}
      <div className="ui-module-header__text">
        {title && <span className="ui-module-header__title">{title}</span>}
        {subtitle && <span className="ui-module-header__subtitle">{subtitle}</span>}
      </div>
      {action && <span className="ui-module-header__action">{action}</span>}
    </div>
  );
}
