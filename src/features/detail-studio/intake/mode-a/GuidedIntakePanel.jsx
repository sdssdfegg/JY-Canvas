// src/features/detail-studio/intake/mode-a/GuidedIntakePanel.jsx
// 阶段 2 §3 模式 A（专业 AI 策划 · 引导式）录入骨架。
//
// 本阶段只做「引导式资料录入骨架」：按清单提示用户补齐商品资料与参考图。
// AI 主动追问、商品分析、营销策划与分屏脚本留阶段 3，不在本面板做任何自动改写。
// 不 import 任何 planner / skill / 策划模块（与模式 C 同源约束）。

import { CheckCircle2, Circle } from "lucide-react";
import { ModuleHeader } from "../../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../../shared/ui/Panel.jsx";

const GUIDE_CHECKLIST = [
  { key: "product", label: "填写商品资料（名称 / 品牌 / 品类 / 卖点 / 描述）" },
  { key: "productImage", label: "上传至少一张商品实拍图（product）" },
  { key: "style", label: "上传视觉风格参考（visualStyle，可选）" },
  { key: "structure", label: "上传内容结构参考（contentStructure，可选）" },
  { key: "model", label: "在「模型与渠道」中确认推理 / 图片模型与渠道" }
];

export function GuidedIntakePanel({ state }) {
  const current = state.currentProject || {};
  const pd = current.productData || {};
  const fields = pd.fields && typeof pd.fields === "object" ? pd.fields : {};
  const hasText = Boolean(pd.text && pd.text.trim());
  const refs = Array.isArray(state.referenceImages) ? state.referenceImages : [];
  const hasProduct = refs.some((r) => r.role === "product");
  const hasStyle = refs.some((r) => r.role === "visualStyle");
  const hasStructure = refs.some((r) => r.role === "contentStructure");
  const mc = current.modelConfig || {};
  const hasModel = Boolean(mc.textModel || mc.imageModel);

  const done = {
    product: Object.keys(fields).length > 0 || hasText,
    productImage: hasProduct,
    style: hasStyle,
    structure: hasStructure,
    model: hasModel
  };

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<CheckCircle2 size={15} />}
        title="A · 专业 AI 策划（引导式）"
        subtitle="先补全资料，AI 主动追问与策划产出将在阶段 3 接入"
      />
      <ul className="detailStudioGuideList">
        {GUIDE_CHECKLIST.map((item) => (
          <li className="detailStudioGuideItem" key={item.key}>
            {done[item.key] ? (
              <CheckCircle2 size={14} className="detailStudioGuideDone" />
            ) : (
              <Circle size={14} className="detailStudioGuideTodo" />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      <p className="detailStudioModeNote">
        本阶段仅完成「引导式资料录入骨架」：按上方清单补齐商品资料与参考图即可。AI 主动追问、商品分析、营销策划与分屏脚本留待阶段 3，不在此处自动改写任何内容。
      </p>
    </Panel>
  );
}

export default GuidedIntakePanel;
