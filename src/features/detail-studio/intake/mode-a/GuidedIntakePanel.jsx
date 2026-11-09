// src/features/detail-studio/intake/mode-a/GuidedIntakePanel.jsx
// 阶段 2 §3 模式 A（专业 AI 策划 · 引导式）录入骨架。
//
// 本阶段只做「引导式资料录入骨架」：按清单提示用户补齐商品资料与参考图。
// AI 主动追问、商品分析、营销策划与分屏脚本留阶段 3，不在本面板做任何自动改写。
// 不 import 任何 planner / skill / 策划模块（与模式 C 同源约束）。
// V201 整改：去掉 checklist 勾选语义（实圈 / 绿勾），改为「必填 1 项 + 可选 3 项」标签化说明，
// 避免「每项都要打勾」的错觉；必填项（产品图）一眼可辨。

import { Info } from "lucide-react";
import { ModuleHeader } from "../../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../../shared/ui/Panel.jsx";

// required 仅 product（产品图）一项；其余为可选录入，不传也可继续。
const GUIDE_ITEMS = [
  { key: "product", label: "上传至少一张商品实拍图（product）", required: true },
  { key: "productData", label: "填写商品资料（名称 / 品牌 / 品类 / 卖点 / 描述）", required: false },
  { key: "style", label: "上传视觉风格参考（visualStyle）", required: false },
  { key: "structure", label: "上传内容结构参考（contentStructure）", required: false }
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
  const hasProductData = Object.keys(fields).length > 0 || hasText;

  const done = {
    product: hasProduct,
    productData: hasProductData,
    style: hasStyle,
    structure: hasStructure
  };

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<Info size={15} />}
        title="A · 专业 AI 策划（引导式）"
        subtitle="先补全资料，AI 主动追问与策划产出将在阶段 3 接入"
      />
      <p className="detailStudioModeNote">
        先填商品资料，上传至少一张产品图，其余可跳过。本阶段仅完成「引导式资料录入骨架」，不自动改写任何内容。
      </p>

      <div className="detailStudioGuideSummary">
        必填 <span className="detailStudioGuideCount">{GUIDE_ITEMS.filter((i) => i.required).length}</span> 项
        + 可选 <span className="detailStudioGuideCount">{GUIDE_ITEMS.filter((i) => !i.required).length}</span> 项
      </div>

      <ul className="detailStudioGuideList">
        {GUIDE_ITEMS.map((item) => (
          <li className="detailStudioGuideItem" key={item.key}>
            <span
              className={
                "detailStudioGuideBadge" + (item.required ? " detailStudioGuideBadgeRequired" : "")
              }
            >
              {item.required ? "必填" : "可选"}
            </span>
            <span className="detailStudioGuideText">{item.label}</span>
            <span className={"detailStudioGuideState" + (done[item.key] ? " detailStudioGuideStateDone" : "")}>
              {done[item.key] ? "已填" : "待填"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export default GuidedIntakePanel;
