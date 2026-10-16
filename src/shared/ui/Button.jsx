// 共享按钮组件（V70 落地，总纲 §4.2）。
//
// API：<Button size="sm|md|lg" tone="default|primary|danger|ghost"
//            iconOnly loading active disabled title aria-* …原生属性>{icon}{children}</Button>
// - size: sm=28 工具栏/卡片内 / md=36 版块内标准 / lg=44 页面主操作
// - tone: default 灰面 / primary 实心 accent / danger 危险 / ghost 透明
// - iconOnly: 正方形（aspect-ratio:1），children 直接放 lucide 图标，须配 title 作无障碍名
// - loading: Loader2 旋转 + 自动 disabled；active: accent 淡底（tab 场景）
// - 透传 onClick/type/title/aria-* 等其余原生属性
import { Loader2 } from "lucide-react";
import "./ui.css";

export function Button({
  size = "md",
  tone = "default",
  iconOnly = false,
  loading = false,
  active = false,
  disabled = false,
  className = "",
  children,
  type = "button",
  ...rest
}) {
  const classes = [
    "ui-button",
    `ui-button--${size}`,
    `ui-button--${tone}`,
    iconOnly && "ui-button--icon",
    active && "ui-button--active",
    loading && "ui-button--loading",
    className,
  ].filter(Boolean).join(" ");

  const isDisabled = disabled || loading;

  return (
    <button
      className={classes}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 size={16} className="ui-button__spin" aria-hidden="true" />}
      {iconOnly ? (
        !loading && children
      ) : (
        <span className="ui-button__label">{children}</span>
      )}
    </button>
  );
}
