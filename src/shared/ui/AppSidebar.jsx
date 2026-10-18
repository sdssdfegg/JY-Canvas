import { Settings } from "lucide-react";

// V98：从 src/main.jsx 逐字搬出主壳左侧导航（<nav className="navList"> + settingsEntry 设置入口），
// 未改任何逻辑 / 类名 / DOM 结构。门禁脚本（scripts/verify/*-page.jsx 共 6 个）依赖 .navItem / .navList /
// .settingsEntry 选择器与 <button type="button"> 结构，故类名与 DOM 零改动是最高约束（V83 教训）。
// CSS 留原处（src/styles.css 全局加载），navItems 数据来源（storage-store.js）不动、由调用方传入。
export function AppSidebar({ navItems, activeView, onSelectView, onOpenPrompts, onOpenSettings }) {
  return (
    <>
      <nav className="navList">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              className={`navItem ${activeView === item.id ? "active" : ""} ${item.child ? "subNavItem" : ""}`}
              type="button"
              onClick={() => {
                if (item.id === "prompts") {
                  onOpenPrompts();
                  return;
                }
                onSelectView(item.id);
              }}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button className="settingsEntry" type="button" onClick={() => onOpenSettings()}>
        <Settings size={17} />
        <span>设置</span>
      </button>
    </>
  );
}
