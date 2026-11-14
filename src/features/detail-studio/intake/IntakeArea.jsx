// src/features/detail-studio/intake/IntakeArea.jsx
// 创作录入区：组合 §4（商品资料 + 参考图）与 §3 模式专属录入面板。
// 只做组合，不承载业务逻辑；模式分支由当前项目 mode 决定（A / B / C 三条独立路径）。

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
    // V213 P0：没有项目也要能直接传图 —— 参考图面板先渲染，上传时后台自动 ensure 草稿项目。
    // 其余录入面板读的是项目字段（商品资料 / 模式分支），等项目就绪后再出。
    return (
      <div className="detailStudioIntake">
        <ReferenceImagesPanel state={state} />
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
