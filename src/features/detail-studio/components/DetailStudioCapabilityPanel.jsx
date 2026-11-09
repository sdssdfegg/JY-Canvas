// src/features/detail-studio/components/DetailStudioCapabilityPanel.jsx
// 基础设施面板：能力自检（复用现有统一模型体系，不引入第二套 Provider / KEY / 网关）。

import { Database, Image as ImageIcon, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";
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
  const caps = state.capabilities;
  // 能力信息须含 text/image 才算就绪；API 未返回（或返回非 JSON / 缺字段）时回落加载态，
  // 绝不读 undefined.endpoint 崩溃（无后端 / 代理返回 HTML 时 caps 会是 {message,raw} 这类真值畸形对象）。
  const capsReady = Boolean(caps && caps.text && caps.image);
  // 重点 A ⑤：探针使用「用户在模型与渠道面板所选」的值，而非写死常量。
  // 用户未选（或尚未在面板保存）时回落到推荐默认 / 自检默认。
  // KEY 红线（Owner）：apiKey 由 state hook 从全局设置读取，本视图不出现任何 KEY 输入。
  const modelConfig = state.currentProject?.modelConfig || {};
  const textModel = modelConfig.textModel || STUDIO_RECOMMENDED_TEXT_MODEL;
  const imageModel = modelConfig.imageModel || STUDIO_PROBE_MODEL;
  const channelId = modelConfig.channelId || STUDIO_PROBE_CHANNEL_ID;

  function handleTextProbe() {
    // 把用户所选推理模型作为 textModel 透传给探针（接住 probeTextModel 的新签名）。
    // apiKey 由 runTextProbe 内部从全局设置读取，此处不传、不持有 KEY。
    state.runTextProbe({ prompt: "连通性测试", textModel });
  }

  function handleImageProbe() {
    state.runImageProbe({
      prompt: "详情创作工作区请求体预检",
      model: imageModel,
      channelId
    });
  }

  function handleImageGeneration() {
    // 真实出图所需 apiKey 由 runImageGeneration 内部从全局设置读取。
    state.runImageGeneration({ prompt: STUDIO_PROBE_PROMPT, model: imageModel, channelId });
  }

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<ShieldCheck size={15} />}
        title="能力自检"
        subtitle="复用 JY-Canvas 现有统一模型与数据体系"
      />
      {capsReady ? (
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
            <span className="detailStudioFactValue">{caps.storage?.root ?? "—"}</span>
          </div>
          <div className="detailStudioFact">
            <span className="detailStudioFactLabel">数据边界 / 屏数上限</span>
            <span className="detailStudioFactValue">
              排除种子 {String(caps.storage?.seedExcluded ?? false)} · 最多 {STUDIO_MAX_SCREENS} 屏
            </span>
          </div>
        </div>
      ) : (
        <p className="detailStudioEmpty">能力信息加载中…</p>
      )}

      {state.apiKeyMissing ? (
        <p className="detailStudioKeyMissing">
          未检测到 API Key：请到「设置」页统一填写（全画板只在设置页填一次，本视图不重复输入）；填写后将自动生效。
        </p>
      ) : null}
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
          disabled={state.apiKeyMissing}
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
        预检只校验 /api/images 请求体契约，不调用上游、不产生费用。真实出图按钮需主动点击；API Key 请在设置页统一填写（全画板只填一次）。
        阶段 2 起逐步接入三种创作模式、商品资料与参考图、分屏规划与提示词冻结、批量生成与版本管理；
        旧「一键详情/主图」保持原状。
      </p>
    </Panel>
  );
}
