// src/features/detail-studio/components/DetailStudioView.jsx
// 工作区根视图：只做布局与组合，不承载业务逻辑。
// 三个面板各自管理局部表单状态，跨区通信统一经 state/ 与 src/api/detail-studio.js。

import { lazy, Suspense } from "react";
import { LayoutTemplate } from "lucide-react";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { WORKSPACE_ID } from "../constants/workspace-contract.js";
import { useDetailStudioState } from "../state/use-detail-studio-state.js";
import { DetailStudioBasicsPanel } from "./DetailStudioBasicsPanel.jsx";
import { DetailStudioCapabilityPanel } from "./DetailStudioCapabilityPanel.jsx";
import { DetailStudioProjectPanel } from "./DetailStudioProjectPanel.jsx";
import { FlowGuidanceBar } from "./FlowGuidanceBar.jsx";
import { ModelChannelConfigPanel } from "../intake/ModelChannelConfigPanel.jsx";
import { IntakeArea } from "../intake/IntakeArea.jsx";
import { PlanningPanel } from "../planning/PlanningPanel.jsx";
import { GenerationPanel } from "../generation/GenerationPanel.jsx";
import "../styles/detail-studio.css";

// 阶段 5：单屏连续编辑与版本管理面板（独立懒加载 chunk，避免撑大详情工作区 bundle）。
const VersionPanel = lazy(() => import("../versions/VersionPanel.jsx"));

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
        <span className="detailStudioStageTag">阶段 2 · 创作录入与模型渠道配置 · {WORKSPACE_ID}</span>
      </header>

      {state.error ? <div className="detailStudioBanner detailStudioBannerError">{state.error}</div> : null}
      {state.notice ? <div className="detailStudioBanner">{state.notice}</div> : null}

      <div className="detailStudioGrid">
        <div className="detailStudioLeft">
          <DetailStudioProjectPanel state={state} />
          <ModelChannelConfigPanel state={state} onSave={state.saveModelConfig} />
        </div>
        <div className="detailStudioColumn">
          <FlowGuidanceBar state={state} />
          <DetailStudioBasicsPanel state={state} />
          <DetailStudioCapabilityPanel state={state} />
          <IntakeArea state={state} />
          <PlanningPanel state={state} />
          <GenerationPanel state={state} />
          <Suspense fallback={null}>
            <VersionPanel state={state} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default DetailStudioView;
