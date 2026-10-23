// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 2193–2205 行）。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：LegacyModulePanel 旧版块外壳（原 outfit-panels 2193–2205 行）。
import { ModuleHeader } from "../../../shared/ui/ModuleHeader";

export function LegacyModulePanel({ title, subtitle, icon, children }) {
  return (
    <section className="legacyPanel">
      <ModuleHeader
        title={title}
        subtitle={subtitle}
        action={icon ? <div className="legacyPanelIcon">{icon}</div> : undefined}
      />
      {children}
    </section>
  );
}
