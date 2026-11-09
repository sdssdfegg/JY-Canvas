// src/features/detail-studio/intake/mode-b/AssistedIntakePanel.jsx
// 阶段 2 §3 模式 B（Agent 辅助策划 · 保留原意）录入骨架。
//
// 本阶段只做「保留原意的录入骨架」：提示用户先给出完整原始想法，Agent 的完善 / 优化 / 补充留后续阶段。
// 不 import 任何 planner / skill / 策划模块（与模式 A / C 同源约束）。

import { Lightbulb } from "lucide-react";
import { ModuleHeader } from "../../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../../shared/ui/Panel.jsx";

const ASSISTED_NOTES = [
  "先写下你的完整原始想法（卖点、调性、想要的画面），模式 B 以你的原意为唯一基准，不擅自添加营销内容。",
  "在「商品资料」中补齐身份与卖点，在「参考图」中上传商品图 / 风格 / 版式参考，作为 Agent 辅助完善的依据。",
  "Agent 的完善、优化与补充（不改变你的原意）将在后续阶段接入，本面板当前仅做录入引导。"
];

export function AssistedIntakePanel({ state }) {
  const current = state.currentProject || {};
  const pd = current.productData || {};
  const fields = pd.fields && typeof pd.fields === "object" ? pd.fields : {};
  const hasText = Boolean(pd.text && pd.text.trim());
  const refs = Array.isArray(state.referenceImages) ? state.referenceImages : [];
  const hasProduct = refs.some((r) => r.role === "product");
  const ready = Object.keys(fields).length > 0 || hasText;
  const hasRef = refs.length > 0;

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<Lightbulb size={15} />}
        title="B · Agent 辅助策划（保留原意）"
        subtitle="你的原意是唯一基准，Agent 只完善、不擅自添加"
      />
      <ul className="detailStudioGuideList">
        {ASSISTED_NOTES.map((item, idx) => (
          <li className="detailStudioGuideItem" key={idx}>
            <span className="detailStudioGuideIndex">{idx + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <div className="detailStudioModeStatus">
        <span className={"detailStudioStatusDot " + (ready ? "detailStudioStatusDotOn" : "detailStudioStatusDotOff")} />
        <span>{ready ? "已填写商品资料 / 原始想法" : "待填写商品资料 / 原始想法"}</span>
        <span className="detailStudioModeStatusSep">·</span>
        <span className={"detailStudioStatusDot " + (hasRef ? "detailStudioStatusDotOn" : "detailStudioStatusDotOff")} />
        <span>{hasRef ? "已上传参考图" : "未上传参考图"}</span>
      </div>
      <p className="detailStudioModeNote">
        模式 B 不触碰你的原始表达：本阶段仅完成「保留原意的录入骨架」，Agent 的辅助完善 / 优化 / 补充留待后续阶段，不会在此处擅自改写。
      </p>
    </Panel>
  );
}

export default AssistedIntakePanel;
