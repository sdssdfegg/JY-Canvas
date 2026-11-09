// src/features/detail-studio/components/DetailStudioCapabilityPanel.jsx
// 基础设施面板：能力自检（复用现有统一模型体系，不引入第二套 Provider / KEY / 网关）。

import { useState } from "react";
import { Database, Image as ImageIcon, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { Field } from "../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";
import { buildDetailStudioImageForm } from "../../../api/detail-studio.js";
import {
  STUDIO_MAX_SCREENS,
  STUDIO_PROBE_CHANNEL_ID,
  STUDIO_PROBE_MODEL,
  STUDIO_PROBE_PROMPT,
  STUDIO_RECOMMENDED_TEXT_MODEL
} from "../constants/workspace-contract.js";

function formatDetailStudioProbeResult(result) {
  return result ? JSON.stringify(result, null, 2) : "";
}

export function DetailStudioCapabilityPanel({ state }) {
  const [probeKey, setProbeKey] = useState("");
  const caps = state.capabilities;
  // 重点 A ⑤：探针使用「用户在模型与渠道面板所选」的值，而非写死常量。
  // 用户未选（或尚未在面板保存）时回落到推荐默认 / 自检默认。
  const modelConfig = state.currentProject?.modelConfig || {};
  const textModel = modelConfig.textModel || STUDIO_RECOMMENDED_TEXT_MODEL;
  const imageModel = modelConfig.imageModel || STUDIO_PROBE_MODEL;
  const channelId = modelConfig.channelId || STUDIO_PROBE_CHANNEL_ID;

  function handleTextProbe() {
    // 把用户所选推理模型作为 textModel 透传给探针（接住 probeTextModel 的新签名）。
    state.runTextProbe({ apiKey: probeKey, prompt: "连通性测试", textModel });
  }

  function handleImageProbe() {
    state.runImageProbe({
      apiKey: probeKey,
      prompt: "详情创作工作区请求体预检",
      model: imageModel,
      channelId
    });
  }

  function handleImageGeneration() {
    const form = buildDetailStudioImageForm({
      apiKey: probeKey,
      prompt: STUDIO_PROBE_PROMPT,
      model: imageModel,
      channelId
    });
    state.runImageGeneration(form);
  }

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<ShieldCheck size={15} />}
        title="能力自检"
        subtitle="复用 JY-Canvas 现有统一模型与数据体系"
      />
      {caps ? (
        <div className="detailStudioFacts">
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">所选推理模型</span>
            <span className="detailStudioFactValue">{textModel}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">所选图片模型</span>
            <span className="detailStudioFactValue">{imageModel}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">所选渠道</span>
            <span className="detailStudioFactValue">{channelId || "默认（按图片模型自动选合法线路）"}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">推荐默认</span>
            <span className="detailStudioFactValue">{caps.recommended?.textModel} · {caps.recommended?.imageModel}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">文本端点 / 网关数</span>
            <span className="detailStudioFactValue">{caps.text.endpoint} · {caps.text.gatewayCount}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">图片端点</span>
            <span className="detailStudioFactValue">{caps.image.endpoint}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">图片复用</span>
            <span className="detailStudioFactValue">{caps.image.reuse}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">项目存储</span>
            <span className="detailStudioFactValue">{caps.storage.root}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">数据边界 / 屏数上限</span>
            <span className="detailStudioFactValue">
              排除种子 {String(caps.storage.seedExcluded)} · 最多 {STUDIO_MAX_SCREENS} 屏
            </span>
          </div>
        </div>
      ) : (
        <p className="detailStudioEmpty">能力信息加载中…</p>
      )}

      <Field label="API Key（仅本次请求使用，不保存、不回显）">
        <input
          className="detailStudioInput"
          type="password"
          autoComplete="off"
          value={probeKey}
          onChange={(event) => setProbeKey(event.target.value)}
          placeholder="调用文本模型或真实出图时填写"
        />
      </Field>
      <Toolbar align="start" wrap>
        <Button size="sm" tone="default" loading={state.busy} onClick={handleTextProbe}>
          <Sparkles size={14} />
          <span>测试文本模型</span>
        </Button>
        <Button size="sm" tone="default" loading={state.busy} onClick={handleImageProbe}>
          <Database size={14} />
          <span>预检图片请求体</span>
        </Button>
        <Button
          size="sm"
          tone="danger"
          loading={state.busy}
          disabled={!probeKey.trim()}
          onClick={handleImageGeneration}
        >
          <ImageIcon size={14} />
          <span>生成测试图（会产生费用）</span>
        </Button>
      </Toolbar>

      {state.textProbe ? (
        <div className={"detailStudioProbeResult" + (state.textProbe.ok ? " detailStudioProbeOk" : " detailStudioProbeFail")}>
          {formatDetailStudioProbeResult(state.textProbe)}
        </div>
      ) : null}
      {state.imageProbe ? (
        <div className={"detailStudioProbeResult" + (state.imageProbe.ok ? " detailStudioProbeOk" : " detailStudioProbeFail")}>
          {formatDetailStudioProbeResult(state.imageProbe)}
        </div>
      ) : null}
      {state.imageGeneration ? (
        <div className={"detailStudioProbeResult" + (state.imageGeneration.ok ? " detailStudioProbeOk" : " detailStudioProbeFail")}>
          {formatDetailStudioProbeResult(state.imageGeneration)}
        </div>
      ) : null}

      <p className="detailStudioNote">
        预检只校验 /api/images 请求体契约，不调用上游、不产生费用。真实出图按钮需主动点击并填写 Key。
        阶段 2 起逐步接入三种创作模式、商品资料与参考图、分屏规划与提示词冻结、批量生成与版本管理；
        旧「一键详情/主图」保持原状。
      </p>
    </Panel>
  );
}
