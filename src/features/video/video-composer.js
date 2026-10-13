import { getVideoStatus } from "../../api/videos.js";
import { dataUrlFromBlob } from "../../shared/result-image.js";
import { imageFilesFromList } from "../../shared/image-input.js";
import { isVideoTaskCompleted, isVideoTaskFailed, videoTaskStatusText } from "../../shared/video-task.js";
import { videoDefaults } from "../../shared/app-defaults.js";

// 视频生成编排（快捷生成侧）—— 工厂形态
//
// 形态说明：这里是【普通工厂】，不是 React hook —— 内部不使用 useState/useCallback/useMemo，
// 也不 import React。调用方在组件体内每次 render 调一次，得到一组捕获了最新 state 与 setter
// 的普通函数 —— 与原先「组件内 function 声明」的语义逐字相同（都是每次 render 重建闭包）。
//
// 🔴 依赖全部由 deps 注入，本文件不得直接引用组件内的 state / setter / addEvent。
//    解构保持【同名】，因此函数体从 src/main.jsx 逐字搬来后一字未改（V11-RF-069）。
//
// ⚠️ 跨文件引用只写函数名、不写行号：行号随任意一侧的编辑就会漂移，
//    后人按图索骥只会被引到错处，刻意不补。






export function createVideoComposer(deps) {
  const {
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
  } = deps;

  function updateVideoSetting(key, value) {
    setVideoSettings((current) => {
      if (key === "model") {
        const model = videoModels.find((item) => item.value === value) || activeVideoModel || videoModels[0] || {};
        return normalizeVideoSettingValue({ ...current, model: value }, model);
      }
      if (key === "duration") {
        return { ...current, duration: Number.parseInt(value, 10) || videoDefaults.duration };
      }
      if (key === "outputAudio") {
        return { ...current, outputAudio: Boolean(value) };
      }
      return { ...current, [key]: value };
    });
  }

  function acceptVideoReferenceFile(fileList) {
    const picked = imageFilesFromList(fileList);
    if (picked.length === 0) return false;
    const file = picked[0];
    if (file.size > VIDEO_REFERENCE_MAX_BYTES) {
      addEvent("视频参考图", "参考图超过 10MB，请先压缩后再上传");
      return false;
    }
    setVideoReferenceFile(file);
    addEvent("视频参考图", `已添加 ${file.name}`);
    return true;
  }

  function onPickVideoReference(event) {
    acceptVideoReferenceFile(event.target.files);
    event.target.value = "";
  }

  function onVideoComposerDragOver(event) {
    if (!isReferenceDropData(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsComposerDragging(true);
  }

  function onVideoComposerDrop(event) {
    event.preventDefault();
    setIsComposerDragging(false);
    void imageFilesFromReferenceDrop(event.dataTransfer)
      .then((droppedFiles) => acceptVideoReferenceFile(droppedFiles))
      .catch((err) => addEvent("视频参考图失败", err instanceof Error ? err.message : String(err)));
  }

  async function videoReferencePayload() {
    const url = String(videoSettings.imageUrl || "").trim();
    if (url) return url;
    if (!videoReferenceFile) return "";
    return dataUrlFromBlob(videoReferenceFile, "长图编码失败");
  }

  async function pollVideoUntilFinished(initialTask, requestId, runSettings, apiKey, startedAt) {
    let task = initialTask || {};
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
        if (isVideoTaskFailed(task)) {
          throw new Error(task.error?.message || task.error || "视频生成失败");
        }
        setVideoTasks((current) => current.map((item) => (
          item.id === requestId
            ? { ...item, statusText: videoTaskStatusText(task), progress: task.progress, upstreamTaskId: task.taskId || item.upstreamTaskId }
            : item
        )));
        // V53：页面不可见时降频（双倍间隔），切回前台立即补查一次。
        await pollDelay();
        const previousTaskId = task.taskId || task.id;
        const statusPayload = await getVideoStatus({
          apiKey,
          taskId: previousTaskId
        });
        const nextTask = statusPayload.task || {};
        task = {
          ...nextTask,
          taskId: nextTask.taskId || nextTask.id || previousTaskId,
          id: nextTask.id || nextTask.taskId || previousTaskId
        };
        setVideoTasks((current) => current.map((item) => (
          item.id === requestId
            ? {
                ...item,
                statusText: videoTaskStatusText(task),
                progress: task.progress,
                upstreamTaskId: task.taskId || item.upstreamTaskId,
                elapsedMs: Date.now() - startedAt,
                modelLabel: runSettings.modelLabel
              }
            : item
        )));
      }
      throw new Error("视频生成等待超时，请稍后到上游任务记录中查看。");
    } finally {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  }
  return {
    updateVideoSetting,
    acceptVideoReferenceFile,
    onPickVideoReference,
    onVideoComposerDragOver,
    onVideoComposerDrop,
    videoReferencePayload,
    pollVideoUntilFinished
  };
}


export function durationOptionsForVideoModel(model = {}) {
  if (Array.isArray(model.durations) && model.durations.length > 0) return model.durations;
  const min = Math.max(1, Number(model.minDuration || videoDefaults.duration));
  const max = Math.max(min, Number(model.maxDuration || min));
  const options = [];
  for (let value = min; value <= max; value += 5) options.push(value);
  if (!options.includes(max)) options.push(max);
  return options;
}

export function videoPromptPlaceholder(model = {}) {
  return String(model.promptPlaceholder || "输入视频画面、运动、镜头、服装和氛围要求").trim();
}

export function videoPricePerSecond(model = {}, resolution = "") {
  const price = Number(model.customerPricePerSecond?.[resolution]);
  return Number.isFinite(price) ? price : null;
}

export function videoPriceLabel(model = {}, resolution = "") {
  const price = videoPricePerSecond(model, resolution);
  return price === null ? "" : `算力 ${price.toFixed(3)}/秒`;
}

export function normalizeVideoSettingValue(current = {}, videoModel = {}) {
  const durations = durationOptionsForVideoModel(videoModel);
  const resolutions = Array.isArray(videoModel.resolutions) && videoModel.resolutions.length ? videoModel.resolutions : ["720p"];
  const ratios = Array.isArray(videoModel.aspectRatios) && videoModel.aspectRatios.length ? videoModel.aspectRatios : ["9:16"];
  const defaultDuration = Number(videoModel.defaultDuration || durations[0] || videoDefaults.duration);
  const requestedDuration = Number.parseInt(current.duration ?? defaultDuration, 10);
  const duration = durations.includes(requestedDuration) ? requestedDuration : defaultDuration;
  const resolution = resolutions.includes(current.resolution) ? current.resolution : (videoModel.defaultResolution || resolutions[0]);
  const aspectRatio = ratios.includes(current.aspectRatio) ? current.aspectRatio : (videoModel.defaultAspectRatio || ratios[0]);
  return {
    ...current,
    model: videoModel.value || current.model || videoDefaults.model,
    duration,
    resolution,
    aspectRatio
  };
}
