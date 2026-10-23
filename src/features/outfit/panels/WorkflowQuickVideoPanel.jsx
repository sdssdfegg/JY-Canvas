// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 87–89 与 1699–2078 行）。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：VIDEO 轮询常量 + 快捷视频面板全族（原 outfit-panels 87–89 + F 区）。
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Play, Plus, Trash2, Video } from "lucide-react";
import { generateVideo, getVideoStatus } from "../../../api/videos.js";
import { formatWholeSecondMs as formatMs } from "../../../lib/format/index.js";
import { isImageFile } from "../../../shared/image-input.js";
import { dataUrlFromBlob } from "../../../shared/result-image.js";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader";
import { Button } from "../../../shared/ui/Button";
import { TaskBadge } from "../../../shared/ui/TaskBadge";
import { UploadClearButton } from "../../../shared/ui/UploadClearButton";
import {
  durationOptionsForVideoModel as videoDurationOptions,
  videoPriceLabel as quickVideoPriceLabel
} from "../../video/video-composer.js";
import {
  isVideoTaskCompleted,
  isVideoTaskFailed,
  videoResultUrl,
  videoTaskStatusText
} from "../../../shared/video-task.js";
import { normalizeApiKeyInput } from "../../auth/api-key.js";
import { OUTFIT_SESSION_ID } from "../outfit-task.js";

export const VIDEO_STATUS_POLL_INTERVAL_MS = 4000;
export const VIDEO_STATUS_MAX_POLLS = 180;
export const VIDEO_REFERENCE_MAX_BYTES = 10 * 1024 * 1024;
export const QUICK_VIDEO_DEFAULTS = {
  model: "seedance-2.0",
  prompt: "",
  duration: 5,
  resolution: "720p",
  aspectRatio: "9:16",
  outputAudio: false,
  imageUrl: ""
};
export function quickVideoPromptPlaceholder(model = {}) {
  return String(model.promptPlaceholder || "输入视频画面、镜头运动、人物动作、服装展示和氛围要求").trim();
}
export function normalizeQuickVideoSettings(current = {}, model = {}) {
  const durations = videoDurationOptions(model);
  const resolutions = Array.isArray(model.resolutions) && model.resolutions.length ? model.resolutions : ["720p"];
  const ratios = Array.isArray(model.aspectRatios) && model.aspectRatios.length ? model.aspectRatios : ["9:16"];
  const defaultDuration = Number(model.defaultDuration || durations[0] || QUICK_VIDEO_DEFAULTS.duration);
  const requestedDuration = Number.parseInt(current.duration ?? defaultDuration, 10);
  return {
    ...current,
    model: model.value || current.model || QUICK_VIDEO_DEFAULTS.model,
    duration: durations.includes(requestedDuration) ? requestedDuration : defaultDuration,
    resolution: resolutions.includes(current.resolution) ? current.resolution : (model.defaultResolution || resolutions[0]),
    aspectRatio: ratios.includes(current.aspectRatio) ? current.aspectRatio : (model.defaultAspectRatio || ratios[0])
  };
}
export function WorkflowQuickVideoPanel({
  config,
  apiKey,
  onOpenSettings,
  onAddEvent
}) {
  const videoModels = useMemo(() => Array.isArray(config?.videoModels) && config.videoModels.length ? config?.videoModels : [], [config?.videoModels]);
  const [settings, setSettings] = useState(QUICK_VIDEO_DEFAULTS);
  const [referenceFile, setReferenceFile] = useState(null);
  const [results, setResults] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const activeModel = videoModels.find((model) => model.value === settings.model) || videoModels[0] || null;
  const ratios = activeModel?.aspectRatios?.length ? activeModel.aspectRatios : ["9:16", "16:9", "1:1"];
  const resolutions = activeModel?.resolutions?.length ? activeModel.resolutions : ["720p"];
  const durations = activeModel ? videoDurationOptions(activeModel) : [5];
  const promptHint = activeModel ? quickVideoPromptPlaceholder(activeModel) : "输入视频画面、镜头运动、人物动作、服装展示和氛围要求";
  const priceText = activeModel ? quickVideoPriceLabel(activeModel, settings.resolution) : "";
  const channelEnabled = Boolean(config?.videoPolicy?.enabled);
  const billingEnabled = Boolean(config?.billingGatewayPolicy?.enabled);
  const billingRequired = Boolean(config?.billingGatewayPolicy?.videoRequired);
  const referencePreview = useMemo(() => (
    referenceFile ? { file: referenceFile, url: URL.createObjectURL(referenceFile) } : null
  ), [referenceFile]);

  useEffect(() => {
    if (!videoModels.length) return;
    setSettings((current) => normalizeQuickVideoSettings(current, videoModels.find((item) => item.value === current.model) || videoModels[0]));
  }, [videoModels]);

  useEffect(() => () => {
    if (referencePreview?.url) URL.revokeObjectURL(referencePreview.url);
  }, [referencePreview]);

  function updateSetting(key, value) {
    setSettings((current) => {
      if (key === "model") {
        const model = videoModels.find((item) => item.value === value) || activeModel || videoModels[0] || {};
        return normalizeQuickVideoSettings({ ...current, model: value }, model);
      }
      if (key === "duration") return { ...current, duration: Number.parseInt(value, 10) || QUICK_VIDEO_DEFAULTS.duration };
      if (key === "outputAudio") return { ...current, outputAudio: Boolean(value) };
      return { ...current, [key]: value };
    });
  }

  function pickReference(event) {
    const file = Array.from(event.target.files || []).find(isImageFile);
    event.target.value = "";
    if (!file) return;
    if (file.size > VIDEO_REFERENCE_MAX_BYTES) {
      setError("参考图超过 10MB，请先压缩后再上传");
      onAddEvent?.("视频参考图", "参考图超过 10MB");
      return;
    }
    setReferenceFile(file);
    setError("");
    onAddEvent?.("视频参考图", `已添加 ${file.name}`);
  }

  async function referencePayload() {
    const url = String(settings.imageUrl || "").trim();
    if (url) return url;
    if (!referenceFile) return "";
    return dataUrlFromBlob(referenceFile);
  }

  async function waitVideoTask(initialTask, requestId, runSettings, startedAt) {
    let task = initialTask || {};
    if (!task.taskId && !task.id && !videoResultUrl(task)) {
      throw new Error("视频任务没有返回任务 ID");
    }
    // V53：页面不可见时降频（双倍间隔），切回前台立即补查一次。
    // 不停止轮询——视频任务结果还要收；只是不空转。
    let wakeDelay = null;
    let resumeRequested = false;
    const pollDelay = () => new Promise((resolve) => {
      if (resumeRequested) {
        resumeRequested = false;
        return resolve();
      }
      const interval = document.hidden ? VIDEO_STATUS_POLL_INTERVAL_MS * 2 : VIDEO_STATUS_POLL_INTERVAL_MS;
      const timer = setTimeout(() => { wakeDelay = null; resolve(); }, interval);
      wakeDelay = () => { clearTimeout(timer); wakeDelay = null; resolve(); };
    });
    let resumePoll = () => {
      if (wakeDelay) { const wake = wakeDelay; wakeDelay = null; wake(); } // 正睡着：立即唤醒当前等待（唤醒后该次 pollDelay 即导向查询）
      else { resumeRequested = true; } // 轮询间隙：标记下一次 pollDelay 立即返回（切回立即补查一次）
    };
    const onVisibilityChange = () => {
      if (!document.hidden) resumePoll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    try {
      for (let attempt = 0; attempt < VIDEO_STATUS_MAX_POLLS; attempt += 1) {
        if (isVideoTaskCompleted(task)) return task;
        if (isVideoTaskFailed(task)) throw new Error(task.error?.message || task.error || "视频生成失败");
        setTasks((current) => current.map((item) => item.id === requestId ? {
          ...item,
          statusText: videoTaskStatusText(task),
          progress: task.progress,
          elapsedMs: Date.now() - startedAt
        } : item));
        // V53：页面不可见时降频（双倍间隔），切回前台立即补查一次。
        await pollDelay();
        const previousTaskId = task.taskId || task.id;
        const payload = await getVideoStatus({
          apiKey,
          taskId: previousTaskId
        });
        const nextTask = payload.task || {};
        task = {
          ...nextTask,
          taskId: nextTask.taskId || nextTask.id || previousTaskId,
          id: nextTask.id || nextTask.taskId || previousTaskId
        };
      }
      throw new Error("视频生成等待超时，请稍后到上游任务记录中查看。");
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  }

  async function startVideoGeneration() {
    const normalizedApiKey = normalizeApiKeyInput(apiKey);
    const model = activeModel || videoModels[0];
    const runSettings = normalizeQuickVideoSettings(settings, model || {});
    const modelLabel = model?.label || runSettings.model || "Seedance";
    if (!normalizedApiKey) {
      setError("请先在设置里填写 API Key");
      setStatus("failed");
      onOpenSettings?.();
      onAddEvent?.("无法生成视频", "请先填写 API Key");
      return;
    }
    if (!videoModels.length) {
      setError("视频模型配置未加载");
      setStatus("failed");
      return;
    }
    if (!channelEnabled) {
      setError("视频通道未配置，请先配置兰兰达视频 KEY 或静音签发路由");
      setStatus("failed");
      onAddEvent?.("无法生成视频", "视频通道未配置");
      return;
    }
    if (billingRequired && !billingEnabled) {
      setError("视频计费网关未启用，请先接入静音中转站计费后再生成。");
      setStatus("failed");
      onAddEvent?.("无法生成视频", "视频计费网关未启用");
      return;
    }
    if (!String(runSettings.prompt || "").trim()) {
      setError("请输入视频提示词");
      setStatus("failed");
      return;
    }

    const requestId = `workflow_video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    setStatus("running");
    setError("");
    setTasks((current) => [...current, {
      id: requestId,
      startedAt,
      statusText: "提交中",
      modelLabel,
      resolution: runSettings.resolution,
      aspectRatio: runSettings.aspectRatio,
      duration: runSettings.duration,
      prompt: runSettings.prompt
    }]);
    onAddEvent?.("视频提交", `${modelLabel} / ${runSettings.resolution} / ${runSettings.aspectRatio} / ${runSettings.duration}s`);

    try {
      const image = await referencePayload();
      const payload = await generateVideo({
        apiKey: normalizedApiKey,
        model: runSettings.model,
        prompt: runSettings.prompt,
        duration: runSettings.duration,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        image,
        outputAudio: runSettings.outputAudio,
        metadata: {
          source: "workflow-quick-video",
          clientSessionId: OUTFIT_SESSION_ID
        }
      });
      const finalTask = await waitVideoTask(payload.task || {}, requestId, runSettings, startedAt);
      const url = videoResultUrl(finalTask);
      if (!url) throw new Error("视频任务已完成，但没有返回视频地址");
      const totalMs = Date.now() - startedAt;
      setResults((current) => [{
        id: requestId,
        url,
        prompt: runSettings.prompt,
        modelLabel,
        resolution: runSettings.resolution,
        aspectRatio: runSettings.aspectRatio,
        duration: runSettings.duration,
        generationMs: totalMs,
        createdAt: Date.now()
      }, ...current]);
      setStatus("success");
      onAddEvent?.("视频完成", `生成 1 条视频，用时 ${formatMs(totalMs)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("failed");
      onAddEvent?.("视频失败", message);
    } finally {
      setTasks((current) => current.filter((item) => item.id !== requestId));
    }
  }

  function downloadVideo(item) {
    if (!item?.url) return;
    const link = document.createElement("a");
    link.href = item.url;
    link.download = `静音AI视频-${new Date(item.createdAt || Date.now()).toISOString().replace(/[:.]/g, "-")}.mp4`;
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onAddEvent?.("视频下载", "已开始下载视频");
  }

  const statusText = tasks.length
    ? `视频生成中 ${tasks.length}`
    : status === "failed"
      ? error || "视频任务失败"
      : status === "success"
        ? "视频已完成"
        : "等待视频生成";

  return (
    <section className="workflowVideoPanel">
      <ModuleHeader
        title="快捷视频生成"
        subtitle="参考图、提示词和视频参数独立管理，不读取批量换装上传区。"
        action={<div className="moduleHeaderActions">
          <TaskBadge status={status === "running" || tasks.length ? "running" : status}>{statusText}</TaskBadge>
          <Button size="sm" type="button" onClick={() => results[0] && downloadVideo(results[0])} disabled={!results.length}>
            <Download size={15} />
            <span>下载最新</span>
          </Button>
          <Button size="sm" tone="danger" type="button" onClick={() => { setResults([]); setTasks([]); setStatus("idle"); setError(""); }} disabled={!results.length && !tasks.length}>
            <Trash2 size={15} />
            <span>清空视频</span>
          </Button>
        </div>}
      />

      <div className="workflowVideoLayout">
        <section className="workflowVideoResults">
          {tasks.map((task) => (
            <article className="workflowVideoCard loadingCard" key={task.id}>
              <Loader2 className="spin" size={28} />
              <span>{task.statusText || "视频生成中"}</span>
              <strong>{formatMs(Date.now() - task.startedAt)}</strong>
              <em>{task.modelLabel} · {task.resolution} · {task.aspectRatio} · {task.duration}s</em>
            </article>
          ))}
          {results.map((item) => (
            <article className="workflowVideoCard" key={item.id}>
              <button className="assetDownloadButton" type="button" onClick={() => downloadVideo(item)} title="下载视频" aria-label="下载视频">
                <Download size={16} />
              </button>
              {item.generationMs && <div className="assetTimeBadge">用时 {formatMs(item.generationMs)}</div>}
              <video src={item.url} controls preload="metadata" />
              <button className="assetPrompt" type="button" title={item.prompt} onClick={() => void navigator.clipboard?.writeText(item.prompt || "")}>
                {item.prompt}
              </button>
              <div className="assetMeta">
                <span>{item.modelLabel}</span>
                <strong>{item.resolution} · {item.aspectRatio} · {item.duration}s</strong>
              </div>
            </article>
          ))}
          {!tasks.length && !results.length && (
            <div className="workflowVideoEmpty">
              <Video size={34} />
              <span>{error || "暂无视频"}</span>
            </div>
          )}
        </section>

        <section className="workflowVideoComposer">
          {priceText && <span className="workflowVideoPriceBadge">{priceText}</span>}
          <div className="videoReferenceLine">
            <input ref={inputRef} type="file" accept="image/*" onChange={pickReference} />
            <button className="videoReferenceTile" type="button" onClick={() => inputRef.current?.click()}>
              {referencePreview ? (
                <>
                  <img src={referencePreview.url} alt={referencePreview.file.name} />
                  <span>{referencePreview.file.name}</span>
                </>
              ) : (
                <>
                  <Plus size={18} />
                  <span>参考图</span>
                </>
              )}
            </button>
            <input
              className="videoUrlInput"
              value={settings.imageUrl}
              onChange={(event) => updateSetting("imageUrl", event.target.value)}
              placeholder="图片参考 URL，可留空"
            />
            <UploadClearButton onClick={() => { setReferenceFile(null); updateSetting("imageUrl", ""); }} disabled={!referenceFile && !settings.imageUrl} />
          </div>

          <label className="composerField">
            <span>视频提示词</span>
            <textarea
              value={settings.prompt}
              onChange={(event) => updateSetting("prompt", event.target.value)}
              placeholder={promptHint}
            />
          </label>

          <div className="workflowVideoControls">
            <select value={settings.model} onChange={(event) => updateSetting("model", event.target.value)}>
              {videoModels.map((model) => <option key={model.value} value={model.value}>{model.label}</option>)}
            </select>
            <select value={settings.aspectRatio} onChange={(event) => updateSetting("aspectRatio", event.target.value)}>
              {ratios.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
            </select>
            <select value={settings.resolution} onChange={(event) => updateSetting("resolution", event.target.value)}>
              {resolutions.map((resolution) => <option key={resolution} value={resolution}>{resolution}</option>)}
            </select>
            <select value={settings.duration} onChange={(event) => updateSetting("duration", event.target.value)}>
              {durations.map((duration) => <option key={duration} value={duration}>{duration}s</option>)}
            </select>
            <Button size="sm" active={settings.outputAudio} type="button" onClick={() => updateSetting("outputAudio", !settings.outputAudio)}>
              <Video size={15} />
              <span>{settings.outputAudio ? "音频开" : "音频关"}</span>
            </Button>
            {billingRequired && !billingEnabled && <span className="workflowVideoBadge">计费未接入</span>}
            <Button size="lg" tone="primary" type="button" onClick={() => void startVideoGeneration()} disabled={tasks.length > 0}>
              {tasks.length ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
              <span>生成视频</span>
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
