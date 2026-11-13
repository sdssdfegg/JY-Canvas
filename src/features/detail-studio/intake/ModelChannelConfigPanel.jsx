// src/features/detail-studio/intake/ModelChannelConfigPanel.jsx
// 重点 A：推理模型 + 图片模型 + 渠道 三个「独立」选择器，配置随当前项目保存。
//
// 选项来源：
//   - 推理模型：CANVAS_REASONING_MODELS（文本推理模型清单，维护在 src/shared/routing.js）
//   - 图片模型 / 渠道：getAppConfig() 返回的 config.routing（catalog.models / channelsForModel）
// 用 detailStudio* 私有类名，不引入新的下拉选择组件（README 红线：复用 shared/ui 的 Field/Panel，不新写选择类）。
// 按 V211 §2 裁决④：「做成按钮」= 紧凑触发式选择器，三个 shared/ui/Button 各点开选项、选中值回显在按钮上，
// 总占高 ≤1.5 行；不新建 Select.jsx、不用公有选择器类、不复制选项清单到新常量。

import { useEffect, useState } from "react";
import { ChevronDown, Cpu, Image as ImageIcon } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";
import { CANVAS_REASONING_MODELS, channelsForModel } from "../../../shared/routing.js";
import {
  STUDIO_RECOMMENDED_IMAGE_MODEL,
  STUDIO_RECOMMENDED_TEXT_MODEL
} from "../constants/workspace-contract.js";

// 紧凑触发式选择器：按钮回显当前值，点开下拉列出选项（不写公有选择器类，符合 B3 锁 5 文件）。
function CompactSelect({ label, value, options, onChange, disabled, placeholder }) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value) || null;
  return (
    <div className="detailStudioCompactSelect">
      <div className="detailStudioCompactSelectRow">
        <span className="detailStudioCompactSelectLabel">{label}</span>
        <Button
          size="sm"
          tone="default"
          disabled={disabled}
          onClick={() => setOpen((next) => !next)}
          aria-expanded={open}
        >
          <span>{current ? current.label : (placeholder || "请选择")}</span>
          <ChevronDown size={13} />
        </Button>
      </div>
      {open ? (
        <div className="detailStudioCompactSelectMenu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={"detailStudioCompactOption" + (option.value === value ? " isActive" : "")}
              onClick={() => { onChange(option.value); setOpen(false); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ModelChannelConfigPanel({ state, onSave }) {
  const routing = state.routing || null;
  const saved = state.currentProject?.modelConfig || {};
  const [textModel, setTextModel] = useState(saved.textModel || STUDIO_RECOMMENDED_TEXT_MODEL);
  const [imageModel, setImageModel] = useState(saved.imageModel || STUDIO_RECOMMENDED_IMAGE_MODEL);
  const [channelId, setChannelId] = useState(saved.channelId || "");

  // 打开 / 切换到另一个项目时，用已保存配置同步三个下拉（用户未配则回落推荐默认）。
  useEffect(() => {
    const m = state.currentProject?.modelConfig || {};
    setTextModel(m.textModel || STUDIO_RECOMMENDED_TEXT_MODEL);
    setImageModel(m.imageModel || STUDIO_RECOMMENDED_IMAGE_MODEL);
    setChannelId(m.channelId || "");
    // 仅在项目切换时同步，避免 typing 期间被回写打断。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentProject?.id]);

  const imageModels = Array.isArray(routing?.models) ? routing.models : [];
  const imageModelOptions = imageModels.map((model) => ({ value: model.id, label: model.label || model.id }));
  const channelOptions = channelsForModel(imageModel, routing).map((channel) => ({ value: channel.id, label: channel.label || channel.id }));

  function handleImageModelChange(value) {
    setImageModel(value);
    // 切换图片模型即清空渠道：渠道随模型过滤，留空由 routingFields 自动取该模型合法默认线路。
    setChannelId("");
  }

  function handleSave() {
    onSave?.({ textModel, imageModel, channelId });
  }

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<Cpu size={15} />}
        title="模型与渠道"
        subtitle="推理模型 / 图片模型 / 渠道，配置随当前项目保存"
      />

      <div className="detailStudioModelChannel">
        <CompactSelect
          label="推理模型"
          value={textModel}
          options={CANVAS_REASONING_MODELS.map((model) => ({ value: model.id, label: model.label }))}
          onChange={setTextModel}
          disabled={state.busy}
        />
        <CompactSelect
          label="图片模型"
          value={imageModel}
          options={imageModelOptions.length ? imageModelOptions : [{ value: imageModel || STUDIO_RECOMMENDED_IMAGE_MODEL, label: imageModel || STUDIO_RECOMMENDED_IMAGE_MODEL }]}
          onChange={handleImageModelChange}
          disabled={state.busy}
          placeholder="（模型目录加载中…）"
        />
        <CompactSelect
          label="渠道"
          value={channelId}
          options={[{ value: "", label: "默认（按图片模型自动选合法线路）" }, ...channelOptions]}
          onChange={setChannelId}
          disabled={state.busy || !imageModel}
        />
      </div>

      <Toolbar align="start" wrap>
        <Button size="sm" tone="default" loading={state.busy} onClick={handleSave}>
          <ImageIcon size={14} />
          <span>保存模型与渠道配置</span>
        </Button>
      </Toolbar>

      <p className="detailStudioNote">
        三个选择彼此独立；渠道留空时由 routingFields(model, &quot;&quot;) 按图片模型自动取合法默认线路，不写死任何渠道 id。
        前端切换图片模型会清空已选渠道，避免「界面显示 A、请求实际带 B」。
      </p>
    </Panel>
  );
}

export default ModelChannelConfigPanel;
