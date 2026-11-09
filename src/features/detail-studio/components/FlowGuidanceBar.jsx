// src/features/detail-studio/components/FlowGuidanceBar.jsx
// 阶段 2 主流程引导条（V201 Owner 意见 #2）：当前阶段 / 已完成 / 下一步 + 唯一醒目主按钮「保存并继续」。
//
// 性质：布局与体验整改，不实现任何真实生成。按钮只做「保存当前项目 + 提示下一环节」，
// 不产生任何费用与上游请求（策划 / 生成留阶段 3B / 4，本单按任务书 §十六 阶段边界不触碰）。

import { ArrowRight, Save } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";

function useFlowSteps(state) {
  const current = state.currentProject || {};
  const pd = current.productData || {};
  const fields = pd.fields && typeof pd.fields === "object" ? pd.fields : {};
  const hasText = Boolean(pd.text && pd.text.trim());
  const refs = Array.isArray(state.referenceImages) ? state.referenceImages : [];
  const hasProductImage = refs.some((r) => r.role === "product");
  const mc = current.modelConfig || {};
  const hasModel = Boolean(mc.textModel || mc.imageModel);

  return [
    { key: "project", label: "创建项目", done: Boolean(current.id) },
    { key: "product", label: "商品资料", done: Object.keys(fields).length > 0 || hasText },
    { key: "image", label: "产品图", done: hasProductImage, required: true },
    { key: "model", label: "模型与渠道", done: hasModel }
  ];
}

export function FlowGuidanceBar({ state }) {
  const steps = useFlowSteps(state);
  const hasProject = Boolean(state.currentProject && state.currentProject.id);

  async function handleSaveAndContinue() {
    if (!hasProject) return;
    // 仅做保存（无改动则为零 patch 持久化确认），并提示下一环节。
    // 不触发任何生图 / 上游请求。
    await state.saveProject({});
  }

  return (
    <div className="detailStudioFlowBar">
      <div className="detailStudioFlowStage">
        <span className="detailStudioFlowStageTag">阶段 2 · 创作录入</span>
        <span className="detailStudioFlowSteps">
          {steps.map((step) => (
            <span
              className={
                "detailStudioFlowStep" +
                (step.done ? " detailStudioFlowStepDone" : "") +
                (step.required && !step.done ? " detailStudioFlowStepRequired" : "")
              }
              key={step.key}
            >
              <span className="detailStudioFlowDot" />
              {step.label}
              {step.required ? "（必传）" : ""}
            </span>
          ))}
        </span>
      </div>

      <div className="detailStudioFlowNext">
        <span className="detailStudioFlowNextLabel">下一步</span>
        <span className="detailStudioFlowNextValue">策划与生成（后续阶段开放）</span>
        <Button
          size="sm"
          tone="primary"
          loading={state.busy}
          disabled={!hasProject}
          onClick={handleSaveAndContinue}
        >
          <Save size={14} />
          <span>保存并继续</span>
          <ArrowRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export default FlowGuidanceBar;
