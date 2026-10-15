// src/features/outfit/panels/WorkbenchSidebar.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出（原 2579–2605 的 <aside className="sidebar">）。
// 内容：左侧导航（品牌 + 6 视图按钮 + 设置入口 + 完成任务状态盒）。
// 模式：原闭包捕获的 activeView / switchView / openSettings / 状态盒数据全部改为同名 props；
//   switchView 以 onSwitchView 别名传入（执行单 §1.1/§2.1 命名），JSX 一行不动。
//   lucide 图标直接 import，不重复实现。
// ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V68 §3.2 负向对照兜底。
import { BookOpen, Crop, Images, Settings, Sparkles, Wand2 } from "lucide-react";

export default function WorkbenchSidebar({
  activeView,
  onSwitchView: switchView,
  openSettings,
  completedCount,
  tasks,
  failedCount,
  detachedCount,
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/app-avatar.webp" alt="" />
        <div>
          <h1>静音AI换装</h1>
          <span>换装流水线</span>
        </div>
      </div>
      <nav>
        <button className={activeView === "quick" ? "active" : ""} type="button" onClick={() => switchView("quick")}><Sparkles size={18} /> 快捷生成</button>
        <button className={activeView === "outfit" ? "active" : ""} type="button" onClick={() => switchView("outfit")}><Wand2 size={18} /> 批量生成</button>
        <button className={activeView === "resize" ? "active" : ""} type="button" onClick={() => switchView("resize")}><Crop size={18} /> 批量尺寸导出</button>
        <button className={activeView === "reference" ? "active" : ""} type="button" onClick={() => switchView("reference")}><Images size={18} /> 参考生图</button>
        <button className={activeView === "detail" ? "active" : ""} type="button" onClick={() => switchView("detail")}><BookOpen size={18} /> 一键详情/主图</button>
        <button className={activeView === "prompt" ? "active" : ""} type="button" onClick={() => switchView("prompt")}><BookOpen size={18} /> 提示词助手</button>
      </nav>
      <button className="settingsEntry" type="button" onClick={openSettings}>
        <Settings size={18} />
        <span>设置</span>
      </button>
      <div className="statusBox">
        <strong>{completedCount}/{tasks.length || 0}</strong>
        <span>完成任务</span>
        {failedCount > 0 && <em>{failedCount} 个失败</em>}
        {failedCount === 0 && detachedCount > 0 && <em>{detachedCount} 个待确认</em>}
      </div>
    </aside>
  );
}
