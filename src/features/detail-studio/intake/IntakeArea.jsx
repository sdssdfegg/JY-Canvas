// src/features/detail-studio/intake/IntakeArea.jsx
// 创作录入区：组合 §4（商品资料 + 参考图）与 §3 模式专属录入面板。
// 只做组合，不承载业务逻辑；模式分支由当前项目 mode 决定（A / B / C 三条独立路径）。

import { PackageOpen } from "lucide-react";
import { STUDIO_MODE_LABELS } from "../constants/workspace-contract.js";
import { ProductDataPanel } from "./ProductDataPanel.jsx";
import { ReferenceImagesPanel } from "./ReferenceImagesPanel.jsx";
import { GuidedIntakePanel } from "./mode-a/GuidedIntakePanel.jsx";
import { AssistedIntakePanel } from "./mode-b/AssistedIntakePanel.jsx";
import { DirectPromptPanel } from "./mode-c/DirectPromptPanel.jsx";

const MODE_PANELS = {
  guided: GuidedIntakePanel,
  assisted: AssistedIntakePanel,
  direct: DirectPromptPanel
};

export function IntakeArea({ state }) {
  const current = state.currentProject;
  if (!current) {
    return (
      <div className="detailStudioIntakeEmpty">
        <PackageOpen size={16} />
        <span>请先在左侧创建或打开一个详情项目，再录入商品资料、参考图与创作模式内容。</span>
      </div>
    );
  }

  const ModePanel = MODE_PANELS[current.mode] || GuidedIntakePanel;
  const modeLabel = STUDIO_MODE_LABELS[current.mode] || current.mode;

  return (
    <div className="detailStudioIntake">
      <div className="detailStudioIntakeModeTag">当前模式：{modeLabel}</div>
      <ProductDataPanel state={state} />
      <ReferenceImagesPanel state={state} />
      <ModePanel state={state} />
    </div>
  );
}

export default IntakeArea;
