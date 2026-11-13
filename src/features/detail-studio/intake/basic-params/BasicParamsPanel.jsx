// src/features/detail-studio/intake/basic-params/BasicParamsPanel.jsx
// 左列「基础参数」：照搬一键详情 DetailView.jsx 的 detailParamGrid 15 控件 + 4 文本域结构，
// 但用 detailStudio* 私有类（禁用公有选择器类，B3 锁 5 文件），状态全部收口到
// project.basicParams，经 props.value / props.onChange 与 state 通信。
//
// 数据语义：仅录入与持久化，不直接拼提示词；真进参数链（appliedOptions → globalLock →
// ScreenSpec → frozenPrompt）由规划管线在服务端编译时消费 project.basicParams。

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Field } from "../../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../../shared/ui/Toolbar.jsx";
import { Button } from "../../../../shared/ui/Button.jsx";
import {
  workflowOptions,
  copywritingOptions,
  richnessOptions,
  fontStyleOptions,
  modelModeOptions,
  modelPoseOptions,
  detailSkillVersionOptions,
  stylePackOptions,
  DETAIL_RATIOS,
  COUNT_OPTIONS,
  MODEL_USAGE_OPTIONS,
  REVERSE_SCREEN_OPTIONS,
  DEFAULT_BASIC_PARAMS,
  getImageModelOptions,
  getImageSizeOptions
} from "./basic-param-options.js";

function OptionSelect({ label, value, options, onChange, disabled }) {
  return (
    <Field label={label}>
      <select
        className="detailStudioSelect"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function BasicParamsPanel({ routing, value, onSave, busy, saved }) {
  // 局部草稿：每次改动只更新草稿，点「保存基础参数」才经 onSave 落服务端（与 ModelChannelConfigPanel 同口径）。
  const [draft, setDraft] = useState(value || DEFAULT_BASIC_PARAMS);

  useEffect(() => {
    setDraft({ ...DEFAULT_BASIC_PARAMS, ...(value || {}) });
    // 仅在外部值（项目切换 / 重开）变化时同步草稿，避免输入中被回写打断。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value && value.workflow, value && value.imageModel]);

  const set = (key) => (val) => setDraft((prev) => ({ ...prev, [key]: val }));
  const v = draft;
  const imageModelOptions = getImageModelOptions(routing);
  const imageSizeOptions = getImageSizeOptions(v.imageModel, routing);
  const useModel = v.modelMode === "use-model";

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<SlidersHorizontal size={15} />}
        title="基础参数"
        subtitle="前期设定一次选完，逐项真进策划与提示词"
      />

      <div className="detailStudioParamGrid">
        <OptionSelect label="工作流" value={v.workflow} options={workflowOptions} onChange={set("workflow")} />
        <OptionSelect label="图片模型" value={v.imageModel} options={imageModelOptions} onChange={set("imageModel")} />
        <OptionSelect label="图片比例" value={v.ratio} options={DETAIL_RATIOS.map((r) => ({ value: r, label: r }))} onChange={set("ratio")} />
        <OptionSelect label="分辨率" value={v.imageSize} options={imageSizeOptions} onChange={set("imageSize")} />
        <OptionSelect label="生成数量" value={v.count} options={COUNT_OPTIONS.map((c) => ({ value: c, label: `${c}张` }))} onChange={set("count")} />
        <OptionSelect label="文案设置" value={v.copywriting} options={copywritingOptions} onChange={set("copywriting")} />
        <OptionSelect label="画面丰富" value={v.richness} options={richnessOptions} onChange={set("richness")} />
        <OptionSelect label="字体风格" value={v.fontStyle} options={fontStyleOptions} onChange={set("fontStyle")} />
        <OptionSelect label="模特设置" value={v.modelMode} options={modelModeOptions} onChange={set("modelMode")} />
        <OptionSelect label="模特姿势" value={v.modelPose} options={modelPoseOptions} onChange={set("modelPose")} disabled={!useModel} />
        <OptionSelect label="模特使用率" value={v.modelUsage} options={MODEL_USAGE_OPTIONS.map((c) => ({ value: c, label: `${c}` }))} onChange={set("modelUsage")} disabled={!useModel} />
        <OptionSelect label="插入反转屏" value={v.reverseScreens} options={REVERSE_SCREEN_OPTIONS.map((c) => ({ value: c, label: `${c}` }))} onChange={set("reverseScreens")} />
        <OptionSelect label="Skill 版本" value={v.detailSkillVersion} options={detailSkillVersionOptions} onChange={set("detailSkillVersion")} />
        <OptionSelect label="视觉风格包" value={v.stylePackId} options={stylePackOptions} onChange={set("stylePackId")} disabled={v.detailSkillVersion !== "v2"} />
        <Field label="输出语种">
          <input
            className="detailStudioInput"
            value={v.lang || ""}
            onChange={(event) => set("lang")(event.target.value)}
          />
        </Field>
      </div>

      <div className="detailStudioParamDivider" />

      <div className="detailStudioContentInputs">
        <Field label="产品名称">
          <input
            className="detailStudioInput"
            value={v.productName || ""}
            placeholder="例：女装假两件上衣"
            onChange={(event) => set("productName")(event.target.value)}
          />
        </Field>
        <Field label="产品特征">
          <textarea
            className="detailStudioTextarea"
            value={v.productFeature || ""}
            placeholder="产品大小，尺寸，特征信息用于锁死产品一致性（可不输入）"
            onChange={(event) => set("productFeature")(event.target.value)}
          />
        </Field>
        <Field label="用户指令">
          <textarea
            className="detailStudioTextarea"
            value={v.userInstruction || ""}
            placeholder="用户指令：屏数、风格、图1/2/3 用法等"
            onChange={(event) => set("userInstruction")(event.target.value)}
          />
        </Field>
        <Field label="卖点">
          <textarea
            className="detailStudioTextarea"
            value={v.sellingPoints || ""}
            placeholder="每行一个卖点，可留空"
            onChange={(event) => set("sellingPoints")(event.target.value)}
          />
        </Field>
      </div>

      <Toolbar align="end" wrap>
        <Button size="sm" tone="primary" loading={busy} onClick={() => onSave && onSave(draft)}>
          <span>保存基础参数</span>
        </Button>
      </Toolbar>

      {saved ? <p className="detailStudioNote">基础参数已保存，重开项目不丢。</p> : null}
    </Panel>
  );
}

export default BasicParamsPanel;
