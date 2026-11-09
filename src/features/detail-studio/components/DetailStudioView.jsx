// src/features/detail-studio/components/DetailStudioView.jsx
// 工作区根视图：只做布局与组合，不承载业务逻辑。
// 三个面板各自管理局部表单状态，跨区通信统一经 state/ 与 src/api/detail-studio.js。

import { LayoutTemplate } from "lucide-react";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { WORKSPACE_ID } from "../constants/workspace-contract.js";
import { useDetailStudioState } from "../state/use-detail-studio-state.js";
import { DetailStudioBasicsPanel } from "./DetailStudioBasicsPanel.jsx";
import { DetailStudioCapabilityPanel } from "./DetailStudioCapabilityPanel.jsx";
import { DetailStudioProjectPanel } from "./DetailStudioProjectPanel.jsx";
import { ModelChannelConfigPanel } from "../intake/ModelChannelConfigPanel.jsx";
import "../styles/detail-studio.css";

export function DetailStudioView() {
  const state = useDetailStudioState();

  return (
    <div className="detailStudio">
      <header className="detailStudioHeader">
        <ModuleHeader
          icon={<LayoutTemplate size={16} />}
          title="详情创作"
          subtitle="独立工作区 · 项目 / 商品资料 / 策划 / 分屏 / 生成 / 编辑 / 预览"
        />
        <span className="detailStudioStageTag">阶段 2 · 模型与渠道配置 · {WORKSPACE_ID}</span>
      </header>

      {state.error ? <div className="detailStudioBanner detailStudioBannerError">{state.error}</div> : null}
      {state.notice ? <div className="detailStudioBanner">{state.notice}</div> : null}

      <div className="detailStudioGrid">
        <DetailStudioProjectPanel state={state} />
        <div className="detailStudioColumn">
          <ModelChannelConfigPanel state={state} onSave={state.saveModelConfig} />
          <DetailStudioBasicsPanel state={state} />
          <DetailStudioCapabilityPanel state={state} />
        </div>
      </div>
    </div>
  );
}

export default DetailStudioView;
