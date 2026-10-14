import { useState, useRef, useMemo, useEffect } from "react";
import {
  createVideoComposer,
  normalizeVideoSettingValue,
  durationOptionsForVideoModel,
  videoPromptPlaceholder,
  videoPriceLabel
} from "./video-composer.js";
import { videoDefaults } from "../../shared/app-defaults.js";
import { generateVideo } from "../../api/videos.js";
import { videoResultUrl } from "../../shared/video-task.js";
import { formatMs } from "../../lib/format/index.js";
import { isAuthErrorMessage, normalizeApiKeyInput } from "../../features/auth/api-key.js";

// 视频面板私有状态 + 编排收口（V58 从 src/main.jsx 迁出）。
//
// ⚠️ 与 V58 执行单状态迁移表的偏差（规则③停手回报，已核实为架构强制，非自行发挥）：
//   1. isComposerDragging / setIsComposerDragging 不迁入本 hook —— 它同时被「图片快捷生成」面板
//      （main.jsx 4638）复用：拖拽态在视频与图片 composer 之间共享，由 createReferenceUpload 与
//      createVideoComposer 两侧共同置位/复位。本 hook 仅接收 setIsComposerDragging 透传给 createVideoComposer，
//      isComposerDragging 仍留 App() 并作为 prop 下发给 VideoView。
//   2. 视频状态（videoStatus / runningVideoTasks / videoResults / videoCount 等）被主画板 quickgen 工具条与
//      状态徽标（main.jsx 996–1004、3126、3140、3203–3214）引用，不止在视频面板内。故本 hook 返回 videoApi
//      对象，App 工具条与 VideoView 两端共用同一对象，避免状态复制。
//   3. createVideoComposer 的 deps 含 isReferenceDropData / imageFilesFromReferenceDrop，二者来自 App 的
//      createReferenceUpload（图片/视频共享上传链路），由 App 下发，不迁入。
//   4. 视频轮询/编排逻辑在 video-composer.js（V53 收口），本文件只搬视图层私有状态与 generateVideoFromComposer。

const VIDEO_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_STATUS_POLL_INTERVAL_MS = 4000;
const VIDEO_STATUS_MAX_POLLS = 180;

export function useVideoState({
  settings,
  config,
  addEvent,
  setIsSettingsOpen,
  setIsComposerDragging,
  clientSessionId,
  isReferenceDropData,
  imageFilesFromReferenceDrop
}) {
  const [videoSettings, setVideoSettings] = useState(videoDefaults);
  const [videoReferenceFile, setVideoReferenceFile] = useState(null);
  const [videoResults, setVideoResults] = useState([]);
  const [videoTasks, setVideoTasks] = useState([]);
  const [videoStatus, setVideoStatus] = useState("idle");
  const [videoError, setVideoError] = useState("");

  const videoReferenceInputRef = useRef(null);

  const videoModels = useMemo(
    () => (Array.isArray(config.videoModels) && config.videoModels.length ? config.videoModels : []),
    [config.videoModels]
  );
  const activeVideoModel = videoModels.find((item) => item.value === videoSettings.model) || videoModels[0] || null;
  const videoRatios = activeVideoModel?.aspectRatios?.length ? activeVideoModel.aspectRatios : ["9:16", "16:9", "1:1"];
  const videoResolutions = activeVideoModel?.resolutions?.length ? activeVideoModel.resolutions : ["720p"];
  const videoDurations = activeVideoModel ? durationOptionsForVideoModel(activeVideoModel) : [5];
  const videoPromptHint = activeVideoModel
    ? videoPromptPlaceholder(activeVideoModel)
    : "输入视频画面、运动、镜头、服装和氛围要求";
  const videoPriceText = activeVideoModel ? videoPriceLabel(activeVideoModel, videoSettings.resolution) : "";
  const videoBillingRequired = Boolean(config.billingGatewayPolicy?.videoRequired);
  const billingGatewayEnabled = Boolean(config.billingGatewayPolicy?.enabled);
  const videoChannelEnabled = Boolean(config.videoPolicy?.enabled);

  const videoReferencePreview = useMemo(
    () => (videoReferenceFile ? { file: videoReferenceFile, url: URL.createObjectURL(videoReferenceFile) } : null),
    [videoReferenceFile]
  );
  useEffect(() => {
    if (videoReferencePreview?.url) URL.revokeObjectURL(videoReferencePreview.url);
  }, [videoReferencePreview]);

  const runningVideoTasks = videoTasks.filter((task) => task.status === "running");
  const videoCount = videoResults.length;

  useEffect(() => {
    if (!videoModels.length) return;
    setVideoSettings((current) => {
      const model = videoModels.find((item) => item.value === current.model) || videoModels[0];
      return normalizeVideoSettingValue(current, model);
    });
  }, [videoModels]);

  const {
    updateVideoSetting,
    onPickVideoReference,
    onVideoComposerDragOver,
    onVideoComposerDrop,
    videoReferencePayload,
    pollVideoUntilFinished
  } = createVideoComposer({
    videoSettings,
    setVideoSettings,
    videoModels,
    activeVideoModel,
    videoDefaults,
    normalizeVideoSettingValue,
    VIDEO_REFERENCE_MAX_BYTES,
    addEvent,
    videoReferenceFile,
    setVideoReferenceFile,
    isReferenceDropData,
    setIsComposerDragging,
    imageFilesFromReferenceDrop,
    setVideoTasks,
    VIDEO_STATUS_MAX_POLLS,
    VIDEO_STATUS_POLL_INTERVAL_MS
  });

  async function generateVideoFromComposer() {
    const model = activeVideoModel || videoModels[0];
    const modelLabel = model?.label || videoSettings.model || "Seedance";
    const runSettings = normalizeVideoSettingValue({ ...videoSettings }, model || {});
    const apiKey = normalizeApiKeyInput(settings.apiKey);

    if (!apiKey && !config.hasServerKey) {
      setVideoError("请先在左下角设置里填写 API Key");
      setIsSettingsOpen(true);
      setVideoStatus("failed");
      addEvent("无法生成视频", "请先填写 API Key");
      return;
    }
    if (!videoModels.length) {
      setVideoError("视频模型配置未加载");
      setVideoStatus("failed");
      addEvent("无法生成视频", "视频模型配置未加载");
      return;
    }
    if (!videoChannelEnabled) {
      setVideoError("视频通道未配置，请先配置兰兰达视频 KEY");
      setVideoStatus("failed");
      addEvent("无法生成视频", "视频通道未配置");
      return;
    }
    if (videoBillingRequired && !billingGatewayEnabled) {
      setVideoError("视频计费网关未启用，请先接入静音中转站计费后再生成。");
      setVideoStatus("failed");
      addEvent("无法生成视频", "视频计费网关未启用");
      return;
    }
    if (!String(runSettings.prompt || "").trim()) {
      setVideoError("请输入视频提示词");
      setVideoStatus("failed");
      addEvent("无法生成视频", "请输入视频提示词");
      return;
    }
    if (!billingGatewayEnabled) {
      addEvent("计费提示", "当前源码侧计费网关未启用，正式客户版需开启后再交付");
    }

    const requestId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    setVideoStatus("running");
    setVideoError("");
    setVideoTasks((current) => [
      ...current,
      {
        id: requestId,
        status: "running",
        startedAt,
        modelLabel,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        duration: runSettings.duration,
        prompt: runSettings.prompt,
        statusText: "提交中"
      }
    ]);
    addEvent("视频提交", `${modelLabel} / ${runSettings.resolution} / ${runSettings.aspectRatio} / ${runSettings.duration}s`);

    try {
      const image = await videoReferencePayload();
      const payload = await generateVideo({
        apiKey,
        model: runSettings.model,
        prompt: runSettings.prompt,
        duration: runSettings.duration,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        image,
        outputAudio: runSettings.outputAudio,
        metadata: {
          source: "quick-video",
          clientSessionId
        }
      });
      const finalTask = await pollVideoUntilFinished(payload.task || {}, requestId, { ...runSettings, modelLabel }, apiKey, startedAt);
      const url = videoResultUrl(finalTask);
      if (!url) throw new Error("视频任务已完成，但没有返回视频地址");
      const totalMs = Date.now() - startedAt;
      const result = {
        id: requestId,
        taskId: finalTask.taskId || payload.task?.taskId || requestId,
        url,
        prompt: runSettings.prompt,
        modelLabel,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        duration: runSettings.duration,
        generationMs: totalMs,
        createdAt: Date.now(),
        submittedAt: startedAt,
        status: "success",
        referenceName: videoReferenceFile?.name || (runSettings.imageUrl ? "URL参考图" : "")
      };
      setVideoResults((current) => [result, ...current]);
      setVideoStatus("success");
      addEvent("视频完成", `生成 1 条视频，用时 ${formatMs(totalMs)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthErrorMessage(message)) setIsSettingsOpen(true);
      setVideoStatus("failed");
      setVideoError(message);
      addEvent("视频失败", message);
    } finally {
      setVideoTasks((current) => current.filter((task) => task.id !== requestId));
    }
  }

  function clearVideoResults() {
    setVideoResults([]);
    setVideoTasks([]);
    setVideoStatus("idle");
    setVideoError("");
    addEvent("视频", "已清空视频结果");
  }

  return {
    videoSettings,
    setVideoSettings,
    videoReferenceFile,
    setVideoReferenceFile,
    videoResults,
    videoTasks,
    videoStatus,
    videoError,
    videoReferenceInputRef,
    videoModels,
    activeVideoModel,
    videoRatios,
    videoResolutions,
    videoDurations,
    videoPromptHint,
    videoPriceText,
    videoBillingRequired,
    billingGatewayEnabled,
    videoReferencePreview,
    runningVideoTasks,
    videoCount,
    updateVideoSetting,
    onPickVideoReference,
    onVideoComposerDragOver,
    onVideoComposerDrop,
    generateVideoFromComposer,
    clearVideoResults
  };
}
