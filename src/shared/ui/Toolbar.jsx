// 共享工具条组件（V72 落地，总纲 §5.3）。
//
// API：<Toolbar align="start|end" wrap gap className>…</Toolbar>
// - align: 子元素主轴对齐（默认 start；顶栏操作区用 end）
// - wrap: true 时允许换行（窄窗口不溢出）
// - gap: 数字，覆盖默认间距（默认走 --space-2 令牌）
// 用于顶栏操作区、卡片操作行、弹窗 footer。
import "./ui.css";

export function Toolbar({ align = "start", wrap = false, gap, className = "", children }) {
  const classes = [
    "ui-toolbar",
    `ui-toolbar--${align}`,
    wrap && "ui-toolbar--wrap",
    className
  ].filter(Boolean).join(" ");
  const style = gap === undefined ? undefined : { gap: `${gap}px` };
  return (
    <div className={classes} style={style}>
      {children}
    </div>
  );
}
