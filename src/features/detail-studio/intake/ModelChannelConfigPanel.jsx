// src/features/detail-studio/intake/ModelChannelConfigPanel.jsx
// 重点 A：推理模型 + 图片模型 + 渠道 三个「独立」下拉，配置随当前项目保存。
//
// 选项来源：
//   - 推理模型：CANVAS_REASONING_MODELS（文本推理模型清单，维护在 src/shared/routing.js）
//   - 图片模型 / 渠道：getAppConfig() 返回的 config.routing（catalog.models / channelsForModel）
// 用 detailStudio* 私有类名，不引入新的下拉选择组件（README 红线：复用 shared/ui 的 Field/Panel，不新写选择类）。
// 组件零业务逻辑：只持有局部选择态，保存一律经 props.onSave → state.saveModelConfig → 服务端。

import { useEffect, useState } from "react";
import { Cpu, Image as ImageIcon } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { Field } from "../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";
import { CANVAS_REASONING_MODELS, channelsForModel } from "../../../shared/routing.js";
import {
  STUDIO_RECOMMENDED_IMAGE_MODEL,
  STUDIO_RECOMMENDED_TEXT_MODEL
} from "../constants/workspace-contract.js";

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
  const channelOptions = channelsForModel(imageModel, routing);

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
        <Field label="推理模型">
          <select
            className="detailStudioSelect detailStudioReasoningSelect"
            value={textModel}
            disabled={state.busy}
            onChange={(event) => setTextModel(event.target.value)}
          >
            {CANVAS_REASONING_MODELS.map((model) => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
        </Field>

        <Field label="图片模型">
          <select
            className="detailStudioSelect detailStudioImageModelSelect"
            value={imageModel}
            disabled={state.busy}
            onChange={(event) => handleImageModelChange(event.target.value)}
          >
            {imageModels.length === 0 ? (
              <option value={imageModel || STUDIO_RECOMMENDED_IMAGE_MODEL}>（模型目录加载中…）</option>
            ) : null}
            {imageModels.map((model) => (
              <option key={model.id} value={model.id}>{model.label || model.id}</option>
            ))}
          </select>
        </Field>

        <Field label="渠道">
          <select
            className="detailStudioSelect detailStudioChannelSelect"
            value={channelId}
            disabled={state.busy || !imageModel}
            onChange={(event) => setChannelId(event.target.value)}
          >
            <option value="">默认（按图片模型自动选合法线路）</option>
            {channelOptions.map((channel) => (
              <option key={channel.id} value={channel.id}>{channel.label || channel.id}</option>
            ))}
          </select>
        </Field>
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
